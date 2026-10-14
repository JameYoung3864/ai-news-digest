/** 统一 404 与错误响应；保证前端永远拿到 { error: { code, message } }。 */
import { AppError } from '../lib/errors.js';
import logger from '../lib/logger.js';
import config from '../config.js';

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `接口不存在: ${req.method} ${req.originalUrl}`,
    },
  });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  const isAppError = error instanceof AppError;

  // express.json() 解析失败
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: '请求体不是合法 JSON' } });
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: '请求体过大' } });
  }

  const status = isAppError ? error.status : 500;
  const code = isAppError ? error.code : 'INTERNAL_ERROR';
  const message = isAppError && error.expose ? error.message : '服务器内部错误';

  if (status >= 500) {
    logger.error('request failed', {
      method: req.method,
      path: req.originalUrl,
      code,
      message: error.message,
      stack: config.isProduction ? undefined : error.stack?.split('\n').slice(0, 5),
    });
  } else {
    logger.warn('request rejected', { method: req.method, path: req.originalUrl, code, message });
  }

  res.status(status).json({
    error: {
      code,
      message,
      ...(isAppError && error.details ? { details: error.details } : {}),
    },
  });
}

/** 包裹 async 路由处理器，异常自动进 errorHandler */
export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
