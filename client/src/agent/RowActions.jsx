import { useState } from 'react';
import ConfirmDelete from './ConfirmDelete';
import { moveOptions, resolveMoveTarget } from './days';
import { BUTTON, FIELD } from './styles';

function MoveControl({ row, ui }) {
  const current = row.item.day_assigned ?? '';
  const [target, setTarget] = useState(ui.weekDates.includes(current) ? current : '');
  const [other, setOther] = useState('');
  const selectId = `move-select-${row.key}`;
  const dateId = `move-date-${row.key}`;

  function submit(event) {
    event.preventDefault();
    const resolved = resolveMoveTarget(target, other);
    if (resolved.ok) ui.handlers.move(row, resolved.day);
    else ui.handlers.reject(`move task ${row.displayId}`, resolved.reason);
  }

  return (
    <form onSubmit={submit} className="my-1">
      <label htmlFor={selectId}>{`Move task ${row.displayId} to `}</label>
      <select id={selectId} className={FIELD} value={target} onChange={event => setTarget(event.target.value)}>
        {moveOptions(ui.weekDates).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>{' '}
      <label htmlFor={dateId}>Other date </label>
      <input id={dateId} className={FIELD} type="date" value={other} onChange={event => setOther(event.target.value)} />{' '}
      <button type="submit" className={BUTTON} disabled={ui.busy} aria-label={`Move task ${row.displayId}`}>Move</button>
    </form>
  );
}

function StepButtons({ row, ui }) {
  const subject = row.kind === 'divider' ? `divider ${row.displayId}` : `task ${row.displayId}`;
  return (
    <>
      <button type="button" className={BUTTON} disabled={ui.busy} aria-label={`Move ${subject} up`} onClick={() => ui.handlers.step(row, 'up')}>Up</button>
      <button type="button" className={BUTTON} disabled={ui.busy} aria-label={`Move ${subject} down`} onClick={() => ui.handlers.step(row, 'down')}>Down</button>
    </>
  );
}

function isRecurring(todo) {
  return todo.recurrence_parent_id != null || todo.recurrence_interval_days != null || todo.recurrence_pattern != null;
}

function RowDelete({ row, ui, subject }) {
  const confirmKey = `row:${row.key}`;
  const extraScopes = row.kind === 'task' && isRecurring(row.item) ? [{ scope: 'all', label: 'and all repeats' }] : [];
  return (
    <ConfirmDelete subject={subject} displayId={row.displayId} confirming={ui.confirmKey === confirmKey} disabled={ui.busy}
      extraScopes={extraScopes} onAsk={() => ui.setConfirmKey(confirmKey)} onCancel={() => ui.setConfirmKey(null)}
      onConfirm={scope => ui.handlers.remove(row, scope)} />
  );
}

export function DividerActions({ row, ui }) {
  return (
    <div>
      <StepButtons row={row} ui={ui} />
      <RowDelete row={row} ui={ui} subject={`divider ${row.displayId}`} />
    </div>
  );
}

export function TaskActions({ row, ui }) {
  const subject = `task ${row.displayId}`;
  const { handlers, busy } = ui;
  return (
    <div>
      <button type="button" className={BUTTON} disabled={busy} aria-label={`Edit ${subject}`} onClick={() => handlers.edit(row)}>Edit</button>
      {row.completed ? (
        <button type="button" className={BUTTON} disabled={busy} aria-label={`Mark ${subject} open`} onClick={() => handlers.reopen(row)}>Mark open</button>
      ) : (
        <>
          <button type="button" className={BUTTON} disabled={busy} aria-label={`Complete ${subject}`} onClick={() => handlers.complete(row)}>Complete</button>
          <button type="button" className={BUTTON} disabled={busy} aria-label={`Archive ${subject}`} onClick={() => handlers.archive(row)}>Archive</button>
        </>
      )}
      <RowDelete row={row} ui={ui} subject={subject} />
      {!row.completed && <MoveControl row={row} ui={ui} />}
      {!row.completed && row.item.day_assigned && <StepButtons row={row} ui={ui} />}
    </div>
  );
}
