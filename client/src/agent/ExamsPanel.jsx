import { useState } from 'react';
import ConfirmDelete from './ConfirmDelete';
import { BUTTON, CELL, FIELD, HEADING, SECTION, TABLE } from './styles';

function ExamRow({ exam, ui }) {
  const [title, setTitle] = useState(exam.title);
  const [date, setDate] = useState(exam.exam_date);
  const confirmKey = `exam:${exam.id}`;
  function submit(event) {
    event.preventDefault();
    ui.handlers.saveExam(exam, title.trim(), date);
  }
  return (
    <tr>
      <td className={CELL}>{exam.id}</td>
      <td className={CELL}>{exam.title}</td>
      <td className={CELL}>{exam.exam_date}</td>
      <td className={CELL}>{exam.daysRemaining}</td>
      <td className={CELL}>
        <form onSubmit={submit}>
          <label htmlFor={`exam-title-${exam.id}`}>{`Title of exam ${exam.id} `}</label>
          <input id={`exam-title-${exam.id}`} className={FIELD} type="text" value={title} maxLength={200} onChange={event => setTitle(event.target.value)} />{' '}
          <label htmlFor={`exam-date-${exam.id}`}>{`Date of exam ${exam.id} `}</label>
          <input id={`exam-date-${exam.id}`} className={FIELD} type="date" value={date} onChange={event => setDate(event.target.value)} />{' '}
          <button type="submit" className={BUTTON} disabled={ui.busy} aria-label={`Save exam ${exam.id}`}>Save exam</button>
        </form>
        <ConfirmDelete subject={`exam ${exam.id}`} displayId={exam.id} confirming={ui.confirmKey === confirmKey} disabled={ui.busy}
          onAsk={() => ui.setConfirmKey(confirmKey)} onCancel={() => ui.setConfirmKey(null)}
          onConfirm={() => ui.handlers.deleteExam(exam)} />
      </td>
    </tr>
  );
}

function AddExamForm({ ui }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (await ui.handlers.addExam(title.trim(), date)) { setTitle(''); setDate(''); }
  }
  return (
    <form onSubmit={submit} className="my-3">
      <label htmlFor="new-exam-title">New exam title </label>
      <input id="new-exam-title" className={FIELD} type="text" value={title} maxLength={200} onChange={event => setTitle(event.target.value)} />{' '}
      <label htmlFor="new-exam-date">Exam date </label>
      <input id="new-exam-date" className={FIELD} type="date" value={date} onChange={event => setDate(event.target.value)} />{' '}
      <button type="submit" className={BUTTON} disabled={ui.busy}>Add exam</button>
    </form>
  );
}

export default function ExamsPanel({ exams, ui }) {
  return (
    <section id="exams" aria-labelledby="exams-heading" className={SECTION}>
      <h2 id="exams-heading" className={HEADING}>Exams</h2>
      <div className="overflow-x-auto">
        <table className={TABLE}>
          <caption className="text-left py-1">Upcoming exams, soonest first. Past exams are not shown.</caption>
          <thead><tr>{['ID', 'Title', 'Date', 'Days left', 'Actions'].map(h => <th key={h} className={CELL} scope="col">{h}</th>)}</tr></thead>
          <tbody>
            {exams.length === 0 && <tr><td className={CELL} colSpan={5}>No upcoming exams.</td></tr>}
            {exams.map(exam => <ExamRow key={`${exam.id}:${exam.title}:${exam.exam_date}`} exam={exam} ui={ui} />)}
          </tbody>
        </table>
      </div>
      <AddExamForm ui={ui} />
    </section>
  );
}
