import { dayHeading } from './days';
import RowsTable from './RowsTable';
import { BUTTON, FIELD, HEADING, SECTION } from './styles';

function NoteForm({ day, note, ui }) {
  const inputId = `note-${day}`;
  function submit(event) {
    event.preventDefault();
    ui.handlers.saveNote(day, new FormData(event.currentTarget).get('note'));
  }
  return (
    <form onSubmit={submit} className="my-3" key={`${day}:${note}`}>
      <label htmlFor={inputId}>{`Note for ${dayHeading(day)} `}</label>
      <input id={inputId} name="note" type="text" className={`${FIELD} w-full md:w-96`} defaultValue={note} maxLength={200} />{' '}
      <button type="submit" className={BUTTON} disabled={ui.busy} aria-label={`Save note for ${day}`}>Save note</button>
    </form>
  );
}

export default function DaySection({ day, rows, note, ui }) {
  const headingId = `day-${day}`;
  return (
    <section aria-labelledby={headingId} className={SECTION}>
      <h2 id={headingId} className={HEADING}>{dayHeading(day)}</h2>
      <RowsTable rows={rows} ui={ui} caption={`Items on ${day}, in planner order. Completed tasks are listed last.`}
        emptyText="No items on this day." />
      <NoteForm day={day} note={note} ui={ui} />
      <button type="button" className={BUTTON} disabled={ui.busy} aria-label={`Add divider on ${day}`}
        onClick={() => ui.handlers.addDivider(day)}>Add divider</button>
    </section>
  );
}
