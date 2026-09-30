const MUTATIONS = new Set(['create_task', 'update_task', 'delete_task', 'set_task_completed', 'set_task_archived',
  'set_task_recurrence', 'move_planner_item', 'copy_planner_item', 'reorder_day', 'create_divider', 'delete_divider',
  'create_list', 'update_list', 'reorder_lists', 'delete_list', 'set_day_note', 'create_exam', 'update_exam',
  'delete_exam', 'dislike_quote', 'restore_quote', 'restore_all_quotes', 'import_quotes_csv', 'update_preferences',
  'reset_preferences', 'update_notification_settings', 'send_test_notification', 'dismiss_task_agent_activity', 'undo_operation']);

function classifyCall(body) {
  if (body?.method !== 'tools/call') return { mutation: false, bulk: false };
  const { name, arguments: args } = body.params || {};
  const maintenance = (['list_tasks', 'search_tasks', 'get_week'].includes(name) && args?.materialize === true)
    || (name === 'get_daily_quote' && args?.select === true);
  return { mutation: MUTATIONS.has(name) || maintenance, bulk: ['import_quotes_csv', 'prepare_backup_export'].includes(name) };
}
function bodyLimit(body) {
  return body?.method === 'tools/call' && body.params?.name === 'import_quotes_csv' ? 1024 * 1024 : 32 * 1024;
}
module.exports = { classifyCall, bodyLimit };
