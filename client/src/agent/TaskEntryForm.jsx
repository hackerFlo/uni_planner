import { useState } from 'react';
import { RECURRENCE_OPTIONS, buildTaskPayload, validateTaskForm } from './taskForm';
import { BUTTON, FIELD, LABEL } from './styles';

const TIME_PRESETS = ['5m', '10m', '15m', '30m', '45m', '90m', '1h', '2h', '3h', '4h'];

function Field({ id, label, hint, children }) {
  return (
    <div className="my-3">
      <label htmlFor={id} className={LABEL}>{label}</label>
      {children}
      {hint && <div id={`${id}-hint`} className="text-sm">{hint}</div>}
    </div>
  );
}

// onSubmit receives the API payload and resolves true on success. A rejected
// validation is reported through onInvalid, i.e. on the page's status line.
export default function TaskForm({ idPrefix, initial, lists, submitLabel, busy, onSubmit, onInvalid, onCancel, resetOnSuccess }) {
  const [form, setForm] = useState(initial);
  const set = field => event => setForm(current => ({ ...current, [field]: event.target.value }));
  const id = name => `${idPrefix}-${name}`;

  async function submit(event) {
    event.preventDefault();
    const problem = validateTaskForm(form);
    if (problem) return onInvalid(problem);
    const done = await onSubmit(buildTaskPayload(form));
    if (done && resetOnSuccess) setForm(initial);
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field id={id('title')} label="Title">
        <input id={id('title')} className={`${FIELD} w-full`} type="text" value={form.title} onChange={set('title')} maxLength={200} />
      </Field>
      <Field id={id('description')} label="Description (plain text)">
        <textarea id={id('description')} className={`${FIELD} w-full`} rows={4} value={form.description} onChange={set('description')} />
      </Field>
      <Field id={id('list')} label="List">
        <select id={id('list')} className={FIELD} value={form.listId} onChange={set('listId')}>
          {lists.map(list => <option key={list.id} value={String(list.id)}>{`${list.name} (list ${list.id})`}</option>)}
        </select>
      </Field>
      <Field id={id('day')} label="Day (optional, leave empty for Unassigned)" hint="Format YYYY-MM-DD.">
        <input id={id('day')} className={FIELD} type="date" value={form.day} onChange={set('day')} />
      </Field>
      <Field id={id('time')} label="Approx. time (optional)" hint="Minutes or hours, for example 30m or 2h.">
        <input id={id('time')} className={FIELD} type="text" list={id('time-presets')} maxLength={3}
          value={form.approxTime} onChange={set('approxTime')} />
        <datalist id={id('time-presets')}>{TIME_PRESETS.map(value => <option key={value} value={value} />)}</datalist>
      </Field>
      <Field id={id('repeat')} label="Repeat (optional, needs a day)">
        <select id={id('repeat')} className={FIELD} value={form.recurrence} onChange={set('recurrence')}>
          {RECURRENCE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </Field>
      <button type="submit" className={BUTTON} disabled={busy}>{submitLabel}</button>
      {onCancel && <button type="button" className={BUTTON} onClick={onCancel}>Cancel</button>}
    </form>
  );
}
