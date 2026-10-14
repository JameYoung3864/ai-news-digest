/** 极简结构化日志(带脱敏)，够用且不引依赖。 */
const REDACT_KEYS = /(api[_-]?key|authorization|token|secret|cookie)/i;

function redact(value, depth = 0) {
  if (value == null || typeof value !== 'object' || depth > 3) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = REDACT_KEYS.test(key) ? '[redacted]' : redact(val, depth + 1);
  }
  return out;
}

function emit(level, message, meta) {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ? { meta: redact(meta) } : {}),
  };
  const text = JSON.stringify(line);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

export const logger = {
  info: (message, meta) => emit('info', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  error: (message, meta) => emit('error', message, meta),
  debug: (message, meta) => {
    if (process.env.DEBUG) emit('debug', message, meta);
  },
};

export default logger;
