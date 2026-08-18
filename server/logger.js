const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const REDACTED = '[redacted]';

// Matched against the camelCase/underscore words of a field name, so
// `gmailAppPassword` and `NOTIFICATION_ENCRYPT_KEY` are caught as surely as
// `password`. Redaction lives here rather than at the call sites because a
// secret must be unloggable by construction (AR-6, EL-9).
const SENSITIVE = new Set([
  'password', 'pass', 'token', 'cookie', 'authorization', 'auth',
  'secret', 'jwt', 'apikey', 'key', 'credential', 'credentials', 'email',
]);

function parseLogLevel(raw) {
  if (raw === undefined || raw === '') return 'info';
  const level = String(raw).toLowerCase();
  if (!(level in LEVELS)) {
    throw new Error(`LOG_LEVEL must be one of error, warn, info, debug, got "${raw}"`);
  }
  return level;
}

function parseLogFormat(raw) {
  if (raw === undefined || raw === '') return 'pretty';
  if (raw !== 'pretty' && raw !== 'json') {
    throw new Error(`LOG_FORMAT must be "pretty" or "json" if set, got "${raw}"`);
  }
  return raw;
}

function isSensitive(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .some((word) => SENSITIVE.has(word.toLowerCase()));
}

// Never recurse into a value: that is how a whole request body reaches the log.
// A summary proves something was there without disclosing any of it.
function flatten(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Error) return value.message;
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return `{${Object.keys(value).length} keys}`;
  return value;
}

function redact(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value === undefined) continue; // "userId=undefined" on every anonymous request is pure noise
    out[key] = isSensitive(key) ? REDACTED : flatten(value);
  }
  return out;
}

function quote(value) {
  const text = String(value);
  return text === '' || /[\s"]/.test(text) ? JSON.stringify(text) : text;
}

function formatPretty(level, msg, fields) {
  const time = new Date().toISOString().slice(11, 19);
  const pairs = Object.entries(fields).map(([k, v]) => `${k}=${quote(v)}`).join(' ');
  return `${time} ${level.toUpperCase().padEnd(5)} ${msg}${pairs ? `  ${pairs}` : ''}`;
}

function formatJson(level, msg, fields) {
  return JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
}

function defaultSink(level, line) {
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

function createLogger(base = {}, opts = {}) {
  const { level = LEVEL, format = FORMAT, sink = defaultSink } = opts;
  const threshold = LEVELS[level];
  const emit = (recordLevel, msg, fields) => {
    if (LEVELS[recordLevel] > threshold) return;
    const merged = redact({ ...base, ...fields });
    const render = format === 'json' ? formatJson : formatPretty;
    sink(recordLevel, render(recordLevel, msg, merged));
  };
  return {
    error: (msg, fields) => emit('error', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    debug: (msg, fields) => emit('debug', msg, fields),
    child: (extra) => createLogger({ ...base, ...extra }, { level, format, sink }),
  };
}

const LEVEL = parseLogLevel(process.env.LOG_LEVEL);
const FORMAT = parseLogFormat(process.env.LOG_FORMAT);
const log = createLogger();

module.exports = {
  REDACTED,
  LEVEL,
  FORMAT,
  parseLogLevel,
  parseLogFormat,
  createLogger,
  log,
};
