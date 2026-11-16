import { useState } from 'react';
import { usePreferences } from '../../context/PreferencesContext';
import { formatAgentActivityLabel } from '../../utils/agentActivity';
import AgentActivityIcon from './AgentActivityIcon';
import Tooltip from './Tooltip';

export default function AgentActivityBadge({ todo, onDismissAgentActivity, isGhost = false }) {
  const [pending, setPending] = useState(false);
  const { preferences } = usePreferences();
  const icon = preferences.agentActivityIcon;
  const label = formatAgentActivityLabel(todo.agent_activity_at, todo.agent_activity_action, { dayAssigned: todo.day_assigned });
  if (!label || isGhost) return null;

  async function dismiss(event) {
    event.stopPropagation();
    if (pending || typeof onDismissAgentActivity !== 'function') return;
    setPending(true);
    try {
      await onDismissAgentActivity(todo.id);
    } finally {
      setPending(false);
    }
  }

  const baseClass = 'flex-shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full hover:scale-110 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 transition disabled:opacity-60 disabled:cursor-wait';
  const colorClass = icon === 'ring' ? '' : icon === 'robot'
    ? 'bg-indigo-100 text-indigo-600 ring-1 ring-indigo-200 hover:bg-indigo-200 dark:bg-indigo-900/70 dark:text-indigo-200 dark:ring-indigo-700'
    : 'bg-indigo-50 ring-1 ring-indigo-200 hover:ring-indigo-300 dark:bg-indigo-950 dark:ring-indigo-700 dark:hover:ring-indigo-500';

  return (
    <Tooltip text={label} className="flex-shrink-0">
      <button
        type="button"
        onPointerDown={event => event.stopPropagation()}
        onClick={dismiss}
        disabled={pending || typeof onDismissAgentActivity !== 'function'}
        aria-label={`${label}. Dismiss AI activity marker`}
        aria-busy={pending || undefined}
        className={`${baseClass} ${colorClass}`}
      >
        <AgentActivityIcon variant={icon} />
      </button>
    </Tooltip>
  );
}
