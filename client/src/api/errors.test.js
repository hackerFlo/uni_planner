import test from 'node:test';
import assert from 'node:assert/strict';

import { ApiError, KINDS, classifyStatus, describeFailure, userMessage } from './errors.js';

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
