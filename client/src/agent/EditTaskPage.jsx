import { Link } from 'react-router-dom';
import TaskForm from './TaskEntryForm';
import { formFromTodo } from './taskForm';
import { HEADING, SECTION } from './styles';

export default function EditTaskPage({ taskId, todo, loading, lists, ui, weekUrl, onCancel }) {
  const back = <p><Link to={weekUrl}>← Back to the week</Link></p>;
  if (!todo) {
    return (
      <section className={SECTION}>
        <h2 className={HEADING}>{`Edit task ${taskId}`}</h2>
        <p>{loading ? 'Loading planner data…' : `Task ${taskId} was not found among the open tasks or the completed tasks of the shown week. It may be archived, deleted, or completed in another week.`}</p>
        {back}
      </section>
    );
  }
  return (
    <section aria-labelledby="edit-heading" className={SECTION}>
      <h2 id="edit-heading" className={HEADING}>{`Edit task ${taskId}`}</h2>
      {back}
      <TaskForm key={`${todo.id}:${todo.updated_at ?? ''}`} idPrefix="edit" initial={formFromTodo(todo)} lists={lists}
        submitLabel="Save" busy={ui.busy} onInvalid={reason => ui.handlers.reject(`save task ${taskId}`, reason)}
        onSubmit={payload => ui.handlers.updateTask(taskId, payload)} onCancel={onCancel} />
    </section>
  );
}
