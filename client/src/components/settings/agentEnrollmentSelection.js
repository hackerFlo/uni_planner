const OPTIONAL_CAPABILITIES = ['planner_write', 'notifications', 'export'];

export function createEnrollmentSelection(status) {
  const grants = status.linked && !status.requiresReenrollment ? status.capabilities : [];
  return { capabilities: ['planner_read', ...OPTIONAL_CAPABILITIES.filter(value => grants.includes(value))],
    boundary: JSON.stringify([status.linked, status.requiresReenrollment, status.revokedAt]), dirty: false };
}

export function enrollmentSelectionReducer(state, action) {
  if (action.type === 'status') {
    const saved = createEnrollmentSelection(action.status);
    return action.confirmed || saved.boundary !== state.boundary || !state.dirty ? saved : state;
  }
  if (action.type === 'toggle' && OPTIONAL_CAPABILITIES.includes(action.capability)) {
    const capabilities = action.checked ? [...new Set([...state.capabilities, action.capability])]
      : state.capabilities.filter(value => value !== action.capability);
    return { ...state, capabilities, dirty: true };
  }
  return state;
}
