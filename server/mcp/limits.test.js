const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyCall, bodyLimit } = require('./limits');
const call = (name, args = {}) => ({ method: 'tools/call', params: { name, arguments: args } });
test('classifies explicit and maintenance writes without throttling export chunks as preparation', () => {
  for (const name of ['create_task', 'undo_operation', 'update_preferences', 'send_test_notification']) assert.equal(classifyCall(call(name)).mutation, true);
  assert.equal(classifyCall(call('get_week', { materialize: true })).mutation, true);
  assert.equal(classifyCall(call('get_daily_quote', { select: true })).mutation, true);
  assert.equal(classifyCall(call('get_week')).mutation, false);
  assert.equal(classifyCall(call('prepare_backup_export')).bulk, true);
  assert.equal(classifyCall(call('read_backup_export')).bulk, false);
  assert.equal(classifyCall(call('import_quotes_csv')).bulk, true);
});
test('only CSV imports accept the larger JSON body ceiling', () => {
  assert.equal(bodyLimit(call('import_quotes_csv')), 1024 * 1024);
  assert.equal(bodyLimit(call('create_task')), 32 * 1024);
  assert.equal(bodyLimit({ method: 'initialize' }), 32 * 1024);
});
