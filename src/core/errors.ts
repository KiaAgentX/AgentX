/** Typed application errors with HTTP-ish codes for API layers. */

export class AppError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;

  constructor(message: string, code = 'APP_ERROR', httpStatus = 400) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid input') {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class NotFoundError extends AppError {
  constructor(entity = 'Resource') {
    super(`${entity} not found`, 'NOT_FOUND', 404);
  }
}

export class PermissionDeniedError extends AppError {
  constructor(message = 'Permission denied') {
    super(message, 'PERMISSION_DENIED', 403);
  }
}

export class InsufficientFundsError extends AppError {
  constructor(needed: number, available: number, currency: string) {
    super(`Insufficient ${currency}: need ${needed}, available ${available}`, 'INSUFFICIENT_FUNDS', 402);
  }
}

export class SecurityViolationError extends AppError {
  constructor(reason: string) {
    super(reason, 'SECURITY_VIOLATION', 403);
  }
}

export class RateLimitedError extends AppError {
  constructor(retryAfterSec: number) {
    super(`Rate limited, retry in ${retryAfterSec}s`, 'RATE_LIMITED', 429);
  }
}

export class AiUnavailableError extends AppError {
  constructor(message = 'AI provider unavailable') {
    super(message, 'AI_UNAVAILABLE', 503);
  }
}

export class ApprovalRequiredError extends AppError {
  public readonly approvalId?: string;
  constructor(message = 'Owner approval required', approvalId?: string) {
    super(message, 'APPROVAL_REQUIRED', 202);
    this.approvalId = approvalId;
  }
}
