import { Approval } from '@prisma/client';
import { db } from '../core/db';
import { config, isStaffTelegramId } from '../config';
import { logger } from '../core/logger';
import { BUS_EVENTS, emitBus } from '../core/bus';
import { fromJson, toJson } from '../core/json';
import { NotFoundError, PermissionDeniedError } from '../core/errors';

/**
 * HITL (Human-In-The-Loop) approval engine.
 *
 * Golden rule of KIA DropAgentX: money movement and outbound mass
 * communication ALWAYS wait for a human tap. Anything risky creates an
 * Approval and fails closed — nothing executes until the owner approves.
 */

export type ApprovalType =
  | 'broadcast'
  | 'withdraw'
  | 'send_message'
  | 'product_publish'
  | 'tool_call'
  | 'refund'
  | 'owner_action';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface CreateApprovalInput {
  type: ApprovalType;
  summary: string;
  payload?: unknown;
  requestedById?: string | null;
  requestedByTelegramId?: string | null;
  riskLevel?: RiskLevel;
  toolName?: string | null;
  /** Overrides config.security.approvalTtlMin when provided. */
  ttlMin?: number;
}

const OWNER_SLACK_MAX_RISK: RiskLevel = 'low';

export async function createApproval(input: CreateApprovalInput): Promise<Approval> {
  const ttlMin = input.ttlMin ?? config.security.approvalTtlMin;
  const expiresAt = new Date(Date.now() + ttlMin * 60_000);

  const approval = await db.approval.create({
    data: {
      type: input.type,
      summary: input.summary.slice(0, 400),
      payload: toJson(input.payload ?? {}),
      requestedById: input.requestedById ?? null,
      riskLevel: input.riskLevel ?? 'medium',
      toolName: input.toolName ?? null,
      expiresAt,
      status: 'pending',
    },
  });

  logger.info({ approvalId: approval.id, type: approval.type, risk: approval.riskLevel }, '🟡 HITL approval created');
  emitBus(BUS_EVENTS.APPROVAL_CREATED, {
    approvalId: approval.id,
    type: approval.type,
    summary: approval.summary,
    riskLevel: approval.riskLevel,
    status: approval.status,
  });
  emitBus(BUS_EVENTS.SSE, { type: 'approval_created', payload: { id: approval.id, type: approval.type, summary: approval.summary, riskLevel: approval.riskLevel } });
  return approval;
}

export async function getApproval(id: string): Promise<Approval | null> {
  return db.approval.findUnique({ where: { id } });
}

export async function listPending(limit = 20): Promise<Approval[]> {
  return db.approval.findMany({
    where: { status: 'pending', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Approve/reject a pending approval. Only owner-level Telegram IDs may decide.
 * Returns the updated approval or null when it was already resolved/expired.
 */
export async function resolveApproval(
  id: string,
  decision: 'approved' | 'rejected',
  deciderTelegramId: string
): Promise<Approval | null> {
  const approval = await db.approval.findUnique({ where: { id } });
  if (!approval) throw new NotFoundError('Approval');

  if (approval.status !== 'pending') return null;
  if (approval.expiresAt.getTime() < Date.now()) {
    const expired = await db.approval.update({ where: { id }, data: { status: 'expired' } });
    emitBus(BUS_EVENTS.APPROVAL_RESOLVED, { approvalId: expired.id, type: expired.type, summary: expired.summary, riskLevel: expired.riskLevel, status: 'expired' });
    return null;
  }

  const updated = await db.approval.update({
    where: { id },
    data: { status: decision, decidedById: deciderTelegramId, decidedAt: new Date() },
  });

  logger.info({ approvalId: id, decision, decider: deciderTelegramId }, decision === 'approved' ? '🟢 HITL approved' : '🔴 HITL rejected');
  emitBus(BUS_EVENTS.APPROVAL_RESOLVED, {
    approvalId: updated.id,
    type: updated.type,
    summary: updated.summary,
    riskLevel: updated.riskLevel,
    status: decision,
  });
  emitBus(BUS_EVENTS.SSE, { type: 'approval_resolved', payload: { id: updated.id, status: decision, type: updated.type } });
  return updated;
}

export function getApprovalPayload<T = Record<string, unknown>>(approval: Approval): T {
  return fromJson<T>(approval.payload, {} as T);
}

/** Cron sweeper: expire stale pending approvals. Returns how many expired. */
export async function expireOverdue(): Promise<number> {
  const stale = await db.approval.findMany({
    where: { status: 'pending', expiresAt: { lte: new Date() } },
    take: 100,
  });
  for (const a of stale) {
    await db.approval.update({ where: { id: a.id }, data: { status: 'expired', resultNote: 'TTL reached — failed closed' } });
    emitBus(BUS_EVENTS.SSE, { type: 'approval_expired', payload: { id: a.id, type: a.type } });
  }
  if (stale.length > 0) logger.info({ count: stale.length }, '⌛ HITL approvals expired (fail-closed)');
  return stale.length;
}

/** Guard used by bot/web layers before calling resolveApproval. */
export function assertCanDecide(telegramId: string | number): void {
  if (!isStaffTelegramId(telegramId)) {
    throw new PermissionDeniedError('Only owners/admins can decide approvals');
  }
}

export const HITL_CONSTANTS = {
  /** Highest risk level that can skip HITL when explicitly allowed by policy. */
  OWNER_SLACK_MAX_RISK,
};
