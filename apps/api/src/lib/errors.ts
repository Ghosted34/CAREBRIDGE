/**
 * The only error type route/service code should throw on purpose.
 * The error handler turns it into `{ error: { code, message, details? } }`.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new AppError(401, 'UNAUTHENTICATED', message);
  }
  static forbidden(message = 'Insufficient permission') {
    return new AppError(403, 'FORBIDDEN', message);
  }
  static notFound(what: string) {
    return new AppError(404, 'NOT_FOUND', `${what} not found`);
  }
  static conflict(code: string, message: string) {
    return new AppError(409, code, message);
  }
}
