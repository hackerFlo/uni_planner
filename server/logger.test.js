const test = require('node:test');
const assert = require('node:assert/strict');

const { REDACTED, parseLogLevel, parseLogFormat, createLogger } = require('./logger');

// Every test drives its own logger through a capturing sink, so nothing here
// touches stdout and the assertions read the exact line that would be written.
function capture(opts = {}) {
  const lines = [];
  const log = createLogger({}, { sink: (_level, line) => lines.push(line), ...opts });
  return { log, lines };
}

test.describe('parseLogLevel', () => {
  test('defaults to info when unset', () => {
    assert.equal(parseLogLevel(undefined), 'info');
  });

  test('treats empty as unset', () => {
    assert.equal(parseLogLevel(''), 'info');
  });

  test('accepts a level regardless of case', () => {
    assert.equal(parseLogLevel('DEBUG'), 'debug');
  });

  test('rejects an unknown level', () => {
    assert.throws(() => parseLogLevel('verbose'), /error, warn, info, debug/);
  });
});

test.describe('parseLogFormat', () => {
  test('defaults to pretty so container logs stay readable', () => {
    assert.equal(parseLogFormat(undefined), 'pretty');
  });

  test('accepts json', () => {
    assert.equal(parseLogFormat('json'), 'json');
  });

  test('rejects an unknown format', () => {
    assert.throws(() => parseLogFormat('logfmt'), /"pretty" or "json"/);
  });
});

test.describe('level filtering', () => {
  test('drops records below the configured level', () => {
    const { log, lines } = capture({ level: 'warn' });
    log.error('a');
    log.warn('b');
    log.info('c');
    log.debug('d');
    assert.deepEqual(lines.length, 2);
  });

  test('emits every level at debug', () => {
    const { log, lines } = capture({ level: 'debug' });
    for (const level of ['error', 'warn', 'info', 'debug']) log[level](level);
    assert.equal(lines.length, 4);
  });
});

test.describe('pretty format', () => {
  test('puts the level and message on the line', () => {
    const { log, lines } = capture({ format: 'pretty' });
    log.info('server started');
    assert.match(lines[0], /INFO {2}server started/);
  });

  test('renders fields as key=value', () => {
    const { log, lines } = capture({ format: 'pretty' });
    log.info('request', { status: 200, ms: 84 });
    assert.match(lines[0], /status=200 ms=84/);
  });

  test('quotes a value containing spaces so the pairs stay parseable', () => {
    const { log, lines } = capture({ format: 'pretty' });
    log.error('boom', { err: 'database is locked' });
    assert.match(lines[0], /err="database is locked"/);
  });
});

test.describe('json format', () => {
  test('emits one parseable object carrying level, msg and fields', () => {
    const { log, lines } = capture({ format: 'json' });
    log.warn('rate-limit', { limiter: 'auth' });
    const { level, msg, limiter } = JSON.parse(lines[0]);
    assert.deepEqual({ level, msg, limiter }, { level: 'warn', msg: 'rate-limit', limiter: 'auth' });
  });

  test('stamps an ISO timestamp', () => {
    const { log, lines } = capture({ format: 'json' });
    log.info('tick');
    assert.match(JSON.parse(lines[0]).t, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  });
});

test.describe('redaction', () => {
  // AR-6 / EL-9: a secret must be unloggable by construction, not by discipline
  // at the ~30 call sites.
  for (const key of ['password', 'token', 'cookie', 'authorization', 'secret', 'jwt', 'email']) {
    test(`redacts ${key}`, () => {
      const { log, lines } = capture({ format: 'json' });
      log.info('x', { [key]: 'hunter2' });
      assert.equal(JSON.parse(lines[0])[key], REDACTED);
    });
  }

  test('redacts a prefixed variant like gmailAppPassword', () => {
    const { log, lines } = capture({ format: 'json' });
    log.info('x', { gmailAppPassword: 'hunter2' });
    assert.equal(JSON.parse(lines[0]).gmailAppPassword, REDACTED);
  });

  test('leaves an ordinary field alone', () => {
    const { log, lines } = capture({ format: 'json' });
    log.info('x', { userId: 7 });
    assert.equal(JSON.parse(lines[0]).userId, 7);
  });
});

test.describe('value flattening', () => {
  // Never recurse into a value: that is how a whole request body ends up in the
  // logs. A summary proves something was there without disclosing it.
  test('summarises an object by key count instead of dumping it', () => {
    const { log, lines } = capture({ format: 'json' });
    log.info('x', { body: { email: 'a@b.c', password: 'hunter2' } });
    assert.equal(JSON.parse(lines[0]).body, '{2 keys}');
  });

  test('summarises an array by length', () => {
    const { log, lines } = capture({ format: 'json' });
    log.info('x', { rows: [1, 2, 3] });
    assert.equal(JSON.parse(lines[0]).rows, '[3 items]');
  });

  test('reduces an Error to its message, never its stack', () => {
    const { log, lines } = capture({ format: 'json' });
    log.error('x', { err: new Error('database is locked') });
    assert.equal(JSON.parse(lines[0]).err, 'database is locked');
  });

  test('does not throw on a circular value', () => {
    const { log, lines } = capture({ format: 'json' });
    const circular = { self: null };
    circular.self = circular;
    assert.doesNotThrow(() => log.info('x', { circular }));
    assert.equal(JSON.parse(lines[0]).circular, '{1 keys}');
  });
});

test.describe('absent fields', () => {
  test('omits an undefined value rather than printing userId=undefined', () => {
    const { log, lines } = capture({ format: 'pretty' });
    log.info('request', { status: 200, userId: undefined });
    assert.equal(lines[0].includes('userId'), false);
  });

  test('keeps an explicit null, which means something different', () => {
    const { log, lines } = capture({ format: 'json' });
    log.info('x', { parent: null });
    assert.equal('parent' in JSON.parse(lines[0]), true);
  });
});

test.describe('child', () => {
  test('carries the bound fields onto every record', () => {
    const { log, lines } = capture({ format: 'json' });
    log.child({ reqId: 'a3f9c1' }).info('login ok', { userId: 1 });
    const { reqId, userId } = JSON.parse(lines[0]);
    assert.deepEqual({ reqId, userId }, { reqId: 'a3f9c1', userId: 1 });
  });

  test('lets a per-call field win over the bound one', () => {
    const { log, lines } = capture({ format: 'json' });
    log.child({ userId: 1 }).info('x', { userId: 2 });
    assert.equal(JSON.parse(lines[0]).userId, 2);
  });

  test('leaves the parent unchanged', () => {
    const { log, lines } = capture({ format: 'json' });
    log.child({ reqId: 'a3f9c1' });
    log.info('x');
    assert.equal('reqId' in JSON.parse(lines[0]), false);
  });
});
