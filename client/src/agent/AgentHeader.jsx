import { Link } from 'react-router-dom';
import { BUTTON, HEADING } from './styles';

const HOW_TO = [
  'Each day of the chosen week has its own section with a table. Rows are in planner order; completed tasks of that day come last.',
  'Every row shows its ID in the first column. Tasks have a number; dividers read divider-<number>. Button names also contain the ID.',
  'Each action button sits in its row: Edit, Complete or Mark open, Archive, Delete, Move, Up and Down.',
  'Delete takes two steps: Delete first turns into "Confirm delete #<id>" and "Cancel".',
  'To move a task choose a day or Unassigned under "Move … to", or choose "Other date" and fill the date field, then press Move.',
  'The status line below the title reports the result of the last action. It starts with ✓ on success and ✗ on failure, and stays until the next action.',
  'Use the week links to change week. The address /agent?week=YYYY-MM-DD shows the week containing that date.',
  'Add task, Lists and Exams are further down the page; the jump links under the title lead there.',
];

export function AgentHeader({ email, principal, onLogout, onRefresh, busy }) {
  const role = principal === 'agent' ? 'agent account' : 'owner preview';
  return (
    <header>
      <h1 className="text-2xl font-bold my-2">{`Agent view — signed in as ${email} (${role})`}</h1>
      <button type="button" className={BUTTON} onClick={onLogout}>Log out</button>
      <button type="button" className={BUTTON} onClick={onRefresh} disabled={busy}>Reload data from server</button>
    </header>
  );
}

export function StatusLine({ status }) {
  return (
    <p id="status-line" role="status" aria-live="polite" className="sticky top-0 z-10 border-2 border-black bg-yellow-100 text-black p-3 my-3 font-bold">
      {status.text}
    </p>
  );
}

export function HowToUse() {
  return (
    <section aria-labelledby="how-to-heading" className="my-4">
      <h2 id="how-to-heading" className={HEADING}>How to use this page</h2>
      <ul className="list-disc pl-6">{HOW_TO.map(text => <li key={text}>{text}</li>)}</ul>
    </section>
  );
}

export function JumpLinks() {
  return (
    <nav aria-label="Jump to section" className="my-3">
      Jump to: <a href="#unassigned">Unassigned tasks</a> | <a href="#add-task">Add task</a> | <a href="#lists">Lists</a> | <a href="#exams">Exams</a>
    </nav>
  );
}

export function WeekNav({ links, monday }) {
  return (
    <nav aria-label="Week navigation" className="my-3">
      <Link to={links.previous} className="inline-block border border-black px-3 py-2 m-0.5">← Previous week</Link>
      <Link to={links.current} className="inline-block border border-black px-3 py-2 m-0.5">This week</Link>
      <Link to={links.next} className="inline-block border border-black px-3 py-2 m-0.5">Next week →</Link>
      <span className="ml-2">{`Showing the week starting Monday ${monday}`}</span>
    </nav>
  );
}
