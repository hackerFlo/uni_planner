import test from 'node:test';
import assert from 'node:assert/strict';

import { ApiError, KINDS, classifyStatus, describeFailure, userMessage, failureToastOptions,
  createAccessExpiryReporter, subscribeAccessExpiry, reportAccessExpiry } from './errors.js';

test.describe('classifyStatus', () => {
  const cases = [
    [401, KINDS.UNAUTHORIZED],
    [429, KINDS.RATE_LIMITED],
    [502, KINDS.GATEWAY],
    [503, KINDS.GATEWAY],
    [504, KINDS.GATEWAY],
    [500, KINDS.SERVER],
    [400, KINDS.BAD_REQUEST],
    [404, KINDS.BAD_REQUEST],
    [200, KINDS.UNKNOWN],
  ];

  for (const [status, kind] of cases) {
    test(`maps ${status} to ${kind}`, () => {
      assert.equal(classifyStatus(status), kind);
    });
  }

  // 502/503/504 mean nginx is up but the backend is not, which is a different
  // fix from a genuine 500 inside the app.
  test('separates a gateway failure from an application failure', () => {
    assert.notEqual(classifyStatus(502), classifyStatus(500));
  });
});

test.describe('describeFailure', () => {
  test('names Cloudflare Access rather than blaming the backend', () => {
    assert.match(describeFailure(KINDS.ACCESS_EXPIRED), /Cloudflare Access/);
  });

  test('tells an offline user to check the network, not the server', () => {
    assert.match(describeFailure(KINDS.OFFLINE), /network/);
  });

  test('appends the status to a gateway failure', () => {
    assert.match(describeFailure(KINDS.GATEWAY, 502), /\(HTTP 502\)/);
  });

  test('leaves the status off a failure the user can act on', () => {
    assert.equal(describeFailure(KINDS.RATE_LIMITED, 429).includes('HTTP'), false);
  });

  test('falls back to the generic message for an unrecognised kind', () => {
    assert.equal(describeFailure('nonsense'), describeFailure(KINDS.UNKNOWN));
  });
});

test.describe('ApiError', () => {
  test('describes itself from the kind when no message is given', () => {
    assert.equal(new ApiError(KINDS.OFFLINE).message, describeFailure(KINDS.OFFLINE));
  });

  test("prefers the server's own message when there is one", () => {
    const err = new ApiError(KINDS.UNAUTHORIZED, { status: 401, message: 'Invalid email or password' });
    assert.equal(err.message, 'Invalid email or password');
  });

  test('carries the request id so the UI can print a log reference', () => {
    assert.equal(new ApiError(KINDS.SERVER, { requestId: 'a3f9c1' }).requestId, 'a3f9c1');
  });

  test('is a real Error, so existing catch blocks still work', () => {
    assert.ok(new ApiError(KINDS.UNKNOWN) instanceof Error);
  });
});

test.describe('userMessage', () => {
  test('passes a described failure through', () => {
    const err = new ApiError(KINDS.RATE_LIMITED, { status: 429 });
    assert.equal(userMessage(err), err.message);
  });

  test('hides a raw JavaScript message behind the generic line', () => {
    assert.equal(userMessage(new TypeError('x is not a function')), describeFailure(KINDS.UNKNOWN));
  });

  test('survives a thrown non-error', () => {
    assert.equal(userMessage(undefined), describeFailure(KINDS.UNKNOWN));
  });
});

test.describe('failureToastOptions', () => {
  test('keeps Access expiry visible and offers a reload without a CSP violation', () => {
    let reloads = 0;
    const options = failureToastOptions(new ApiError(KINDS.ACCESS_EXPIRED), () => { reloads += 1; });
    assert.equal(options.duration, 0);
    assert.equal(options.action.label, 'Reload');
    options.action.onClick();
    assert.equal(reloads, 1);
  });

  test('preserves the request reference for other errors', () => {
    assert.deepEqual(failureToastOptions(new ApiError(KINDS.SERVER, { requestId: 'request-example' })), {
      ref: 'request-example',
    });
  });
});

test.describe('central Access notice', () => {
  test('deduplicates expiry notices independently of unrelated errors', () => {
    const notices = [];
    const report = createAccessExpiryReporter((...args) => notices.push(args), () => undefined);
    report(new ApiError(KINDS.SERVER));
    report(new ApiError(KINDS.ACCESS_EXPIRED));
    report(new ApiError(KINDS.ACCESS_EXPIRED));
    assert.equal(notices.length, 1);
    assert.equal(notices[0][1].duration, 0);
    assert.equal(notices[0][1].action.label, 'Reload');
  });

  test('only broadcasts Access expiry and stops notifying an unsubscribed listener', () => {
    const received = [];
    const unsubscribe = subscribeAccessExpiry(error => received.push(error.kind));
    reportAccessExpiry(new ApiError(KINDS.UNAUTHORIZED));
    reportAccessExpiry(new ApiError(KINDS.ACCESS_EXPIRED));
    unsubscribe();
    reportAccessExpiry(new ApiError(KINDS.ACCESS_EXPIRED));
    assert.deepEqual(received, [KINDS.ACCESS_EXPIRED]);
  });
});
