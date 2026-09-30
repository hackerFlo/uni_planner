const { mutationControlSchema } = require('../../domain/schemas');
const { z } = require('zod');

const descriptions = {
  create_task: 'Create an owned task and mark it as agent-created. It may already be completed and archived. Recurring tasks require a start date and expand only the current and next week.',
  update_task: 'Update task content only. Title, description, list and approximate-time edits change the entire recurring series, including completed history.',
  set_task_completed: 'Complete or reopen one occurrence. Completing archives it and stamps completion; reopening clears archive and completion timestamp.',
  set_task_archived: 'Archive or restore one occurrence. Archiving preserves completion state; restoring clears completion and its timestamp.',
  set_task_recurrence: 'Set both recurrence fields explicitly; at most one may be non-null. Changing a child occurrence rule may detach earlier and remove pending later occurrences. Unchanged rules preserve the existing series.',
  delete_task: 'Delete an occurrence or whole series. A single deleted occurrence can regenerate; choose scope explicitly.',
  dismiss_task_agent_activity: 'Dismiss the agent activity indicator on one owned task. This does not edit the task content.',
  move_planner_item: 'Atomically move an active task or divider and renumber both days. Only a changed task date marks agent activity. Moving a recurring occurrence can allow its original date to regenerate.',
  copy_planner_item: 'Copy a task or divider and renumber atomically. Task copies are marked agent-created and have no recurrence or completion history.',
  reorder_day: 'Atomically reorder the exact complete active task/divider sequence for a day. References must include their kind.',
  create_divider: 'Insert a blank divider into the mixed day sequence, at most twenty per day.',
  delete_divider: 'Delete a blank divider and normalize the day sequence.',
  create_list: 'Create a planner list at the end of your list order.',
  update_list: 'Update a planner list name or color.',
  reorder_lists: 'Reorder the exact complete set of your list IDs.',
  delete_list: 'Delete a list; move all its tasks, including archived tasks, to an owned destination when nonempty. The last list cannot be deleted.',
  set_day_note: 'Set the note for one calendar day. Text is trimmed and limited to two hundred characters; empty text clears it.',
  create_exam: 'Create an exam with title and calendar date.',
  update_exam: 'Update an owned exam title or date.',
  delete_exam: 'Delete an owned exam.',
  dislike_quote: 'Hide an owned or built-in quote for your account and choose a replacement for the specified day.',
  restore_quote: 'Restore an owned or built-in quote and pin it to the specified day.',
  restore_all_quotes: 'Clear all your quote dislikes. Existing daily pins remain. This bulk change has no undo.',
  import_quotes_csv: 'Import inline CSV quotes into your library, deduplicating built-ins and your uploads. Maximum 5000 rows and 1 MiB envelope; returns at most ten errors. No undo.',
  update_preferences: 'Update only the explicitly selected device preference profile, including agentActivityIcon (fuzzy, ring or robot). Does not change your other devices. No undo.',
  reset_preferences: 'Reset only the selected device preference profile to defaults, including the fuzzy agent activity icon. No undo.',
  update_notification_settings: 'Update saved notification settings, including the encrypted recipient used for future scheduled/test messages. No undo; does not itself send email.',
};

function inputSchema(name, operation) {
  if (name === 'update_task') return operation.schema.pick({ id: true, title: true, description: true, list_id: true, approx_time: true })
    .refine(input => ['title', 'description', 'list_id', 'approx_time'].some(field => input[field] !== undefined));
  if (name === 'delete_task') return operation.schema.safeExtend({ scope: z.enum(['single', 'all']) });
  return operation.schema;
}

function mutationTools(operations) {
  const tools = Object.entries(operations.definitions).filter(([name]) => Object.hasOwn(descriptions, name)).map(([name, operation]) => ({
    name, description: descriptions[name], capability: operation.capability || 'planner_write', mutation: true,
    schema: inputSchema(name, operation).safeExtend(mutationControlSchema.shape),
    action: (context, { expectedVersion, idempotencyKey, ...args }) =>
      operations.execute(context, name, args, { expectedVersion, idempotencyKey }),
  }));
  tools.push({ name: 'undo_operation', capability: 'planner_write', mutation: true,
    description: 'Undo one supported owned operation within its thirty-second window, only if no later edit changed the planner. Undo itself cannot be undone.',
    schema: z.strictObject({ operationId: z.uuid(), ...mutationControlSchema.shape }),
    action: (context, { operationId, ...controls }) => operations.undo(context, operationId, controls) });
  return tools;
}

module.exports = { mutationTools };
