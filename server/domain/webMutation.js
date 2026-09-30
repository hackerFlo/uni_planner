const { DomainError } = require('./errors');
const { mutationControlSchema, parse } = require('./schemas');

function requestControls(req) {
  const epoch = req.get('X-Planner-Epoch');
  const revision = req.get('X-Planner-Revision');
  const key = req.get('Idempotency-Key');
  if (epoch === undefined && revision === undefined && key === undefined) return null;
  if (typeof revision !== 'string' || !/^\d+$/.test(revision)) throw new DomainError('VALIDATION_ERROR', 'Invalid planner precondition');
  return parse(mutationControlSchema, { expectedVersion: { epoch, revision: Number(revision) }, idempotencyKey: key });
}

function webMutation(operations, req, name, args, legacyAction) {
  const context = { userId: req.user.id, actor: 'web' };
  const controls = requestControls(req);
  if (!controls) {
    // Compatibility exists only while MCP writes remain unavailable. Remove it
    // after every browser writer has migrated, before enabling agent writes.
    if (process.env.MCP_WRITES_ENABLED === 'true') throw new DomainError('CONFLICT', 'Reload the planner before editing', 409);
    return { ...legacyAction(), version: operations.version(context) };
  }
  const result = operations.execute(context, name, args, controls);
  return { ...result.data, ...result, version: result.currentVersion };
}

function legacyBoardMutation(_req, _res, next) {
  if (process.env.MCP_WRITES_ENABLED === 'true') {
    throw new DomainError('CONFLICT', 'Reload the planner to use atomic board operations', 409);
  }
  next();
}

module.exports = { requestControls, webMutation, legacyBoardMutation };
