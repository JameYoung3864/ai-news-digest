/** 统一错误类型：所有可预期的失败都带 HTTP 状态码与机器可读 code。 */
export class AppError extends Error {
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', details = undefined } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = status < 500;
  }
  toJSON() {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

export const badRequest = (message, details) =>
  new AppError(message, { status: 400, code: 'BAD_REQUEST', details });

export const notFound = (message = '资源不存在') =>
  new AppError(message, { status: 404, code: 'NOT_FOUND' });

export const upstreamError = (message, details) =>
  new AppError(message, { status: 502, code: 'UPSTREAM_ERROR', details });

export const notConfigured = (message, details) =>
  new AppError(message, { status: 503, code: 'NOT_CONFIGURED', details });

export const rateLimited = (message = '请求过于频繁，请稍后再试') =>
  new AppError(message, { status: 429, code: 'RATE_LIMITED' });

export const timeoutError = (message = '上游请求超时') =>
  new AppError(message, { status: 504, code: 'UPSTREAM_TIMEOUT' });
