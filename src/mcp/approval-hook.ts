import { db } from '../core/db';
import { logger } from '../core/logger';
import { BUS_EVENTS, emitBus, onBus } from '../core/bus';
import type { ApprovalEventPayload } from '../core/bus';
import { getApproval, getApprovalPayload } from '../services/hitl.service';
import { notifyOwner } from '../services/notification.service';
import * as walletService from '../services/wallet.service';
import * as orderService from '../services/order.service';

/**
 * MCP approval hook — the execution side of Human-In-The-Loop governance.
 *
 * HITL tools NEVER move money or mass-communicate inline: they file an
 * Approval. When the owner resolves an approval with status "approved", this
 * hook performs the real side-effect:
 *   withdraw  → wallet.executeApprovedWithdrawal (re-validates, fail-closed)
 *   refund    → order.executeApprovedRefund      (atomic claim, fail-closed)
 *   broadcast → fan-out NOTIFY_USER bus events in chunks (bot-independent)
 * Anything else is reported to the owner instead of being guessed at.
 *
 * Idempotency: the executors re-claim status internally (atomic updateMany
 * guards), so a replayed APPROVAL_RESOLVED event cannot double-execute.
 */

const BROADCAST_CHUNK = 30;
const BROADCAST_CHUNK_DELAY_MS = 50;

interface BroadcastPayload {
  text?: string;
  requestedBy?: string | null;
}

let registered = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeBroadcast(approvalId: string): Promise<void> {
  const approval = await getApproval(approvalId);
  const payload = approval ? getApprovalPayload<BroadcastPayload>(approval) : {};
  const text = typeof payload.text === 'string' ? payload.text : '';
  if (!text.trim()) {
    notifyOwner('⚠️ broadcast approval was approved but its payload has no text — nothing was sent (fail-closed)');
    return;
  }

  // telegramId is a required (unique) column — every user row is reachable.
  const users = await db.user.findMany({ select: { telegramId: true } });

  let delivered = 0;
  for (let i = 0; i < users.length; i += BROADCAST_CHUNK) {
    const chunk = users.slice(i, i + BROADCAST_CHUNK);
    for (const user of chunk) {
      if (!user.telegramId) continue;
      emitBus(BUS_EVENTS.NOTIFY_USER, { telegramId: user.telegramId, text });
      delivered += 1;
    }
    if (i + BROADCAST_CHUNK < users.length) await sleep(BROADCAST_CHUNK_DELAY_MS);
  }

  logger.info({ approvalId, delivered }, '📣 broadcast delivered');
  notifyOwner(`📣 Broadcast delivered to ${delivered} users.`);
}

async function handleResolved(p: ApprovalEventPayload): Promise<void> {
  if (!p || p.status !== 'approved') return;

  try {
    switch (p.type) {
      case 'withdraw': {
        const approval = await getApproval(p.approvalId);
        if (!approval) {
          notifyOwner(`⚠️ withdrawal approval ${p.approvalId.slice(0, 8)} vanished before execution — failed closed`);
          return;
        }
        const result = await walletService.executeApprovedWithdrawal(approval);
        if (!result.ok) {
          notifyOwner(`⚠️ withdrawal execution failed: ${result.note}`);
        }
        break;
      }
      case 'refund': {
        const approval = await getApproval(p.approvalId);
        if (!approval) {
          notifyOwner(`⚠️ refund approval ${p.approvalId.slice(0, 8)} vanished before execution — failed closed`);
          return;
        }
        const result = await orderService.executeApprovedRefund(approval);
        if (!result.ok) {
          notifyOwner(`⚠️ refund execution failed: ${result.note}`);
        }
        break;
      }
      case 'broadcast': {
        await executeBroadcast(p.approvalId);
        break;
      }
      default:
        notifyOwner(`ℹ️ approval "${p.type}" was approved, but no executor is registered for this type — no action taken`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, approvalId: p.approvalId, type: p.type }, '🪝 approval execution failed');
    notifyOwner(`❌ approval execution failed (${p.type}): ${msg}`);
  }
}

/** Subscribe the APPROVAL_RESOLVED executor once per process. Safe to re-call. */
export function registerMcpApprovalHook(): void {
  if (registered) return;
  registered = true;
  onBus<ApprovalEventPayload>(BUS_EVENTS.APPROVAL_RESOLVED, (p) => {
    void handleResolved(p);
  });
  logger.info('🪝 MCP approval hook registered — approved HITL actions will execute');
}
