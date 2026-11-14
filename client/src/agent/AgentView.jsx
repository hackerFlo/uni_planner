import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToday } from '../context/TimeContext';
import { getWeekDates, parseDateLocal } from '../utils/dates';
import { parseWeekParam, weekLinks } from './weekParam';
import { buildDayRows, buildUnassignedRows } from './days';
import { emptyTaskForm } from './taskForm';
import { createHandlers } from './handlers';
import { useAct } from './useAct';
import { useAgentPlanner } from './useAgentPlanner';
import { AgentHeader, HowToUse, JumpLinks, StatusLine, WeekNav } from './AgentHeader';
import DaySection from './DaySection';
import RowsTable from './RowsTable';
import TaskForm from './TaskEntryForm';
import EditTaskPage from './EditTaskPage';
import ListsPanel from './ListsPanel';
import ExamsPanel from './ExamsPanel';
import { HEADING, SECTION } from './styles';

const RENDER_SETTLE_MS = 50;

// Handlers outlive a render. Routing every call through the ref means a retry
// after a refresh uses the planner version the refresh just loaded.
function latestActions(latest) {
  return new Proxy({}, { get: (_, name) => (...args) => latest.current.actions[name](...args) });
}

const EDIT_PATH = /^\/agent\/task\/(\d+)\/?$/;

function useWeek() {
  const { pathname, search } = useLocation();
  const todayIso = useToday();
  const monday = parseWeekParam(new URLSearchParams(search).get('week'), todayIso);
  const weekDates = useMemo(() => getWeekDates(0, parseDateLocal(monday)), [monday]);
  const editId = EDIT_PATH.exec(pathname)?.[1];
  return { monday, weekDates, links: weekLinks(monday, todayIso), editId: editId ? Number(editId) : null };
}

function WeekPage({ planner, ui, week }) {
  const listName = id => planner.lists.find(list => list.id === id)?.name ?? '';
  const completedOn = day => planner.completedTodos.filter(todo => todo.day_assigned === day);
  if (planner.loading) return <p>Loading planner data…</p>;
  return (
    <>
      {week.weekDates.map(day => (
        <DaySection key={day} day={day} note={planner.notes[day] ?? ''} ui={ui}
          rows={buildDayRows(day, planner.items, completedOn(day), listName)} />
      ))}
      <section id="unassigned" aria-labelledby="unassigned-heading" className={SECTION}>
        <h2 id="unassigned-heading" className={HEADING}>Unassigned tasks</h2>
        <RowsTable rows={buildUnassignedRows(planner.items, listName)} ui={ui} caption="Open tasks that have no day yet."
          emptyText="No unassigned tasks." />
      </section>
      <section id="add-task" aria-labelledby="add-task-heading" className={SECTION}>
        <h2 id="add-task-heading" className={HEADING}>Add task</h2>
        <TaskForm key={planner.lists[0]?.id ?? 'no-lists'} idPrefix="add" initial={emptyTaskForm(planner.lists)} lists={planner.lists} submitLabel="Add task" resetOnSuccess
          busy={ui.busy} onInvalid={reason => ui.handlers.reject('add task', reason)} onSubmit={ui.handlers.addTask} />
      </section>
      <ListsPanel lists={planner.lists} ui={ui} />
      <ExamsPanel exams={planner.exams} ui={ui} />
    </>
  );
}

export default function AgentView() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const week = useWeek();
  const latest = useRef(null);
  const recover = useCallback(async () => {
    await latest.current.actions.refreshAll();
    await new Promise(resolve => setTimeout(resolve, RENDER_SETTLE_MS));
  }, []);
  const { status, setStatus, busy, act } = useAct(recover);
  const planner = useAgentPlanner(week.weekDates, { paused: busy });
  latest.current = planner;
  const actions = useMemo(() => latestActions(latest), []);
  const [confirmKey, setConfirmKey] = useState(null);
  const weekUrl = `/agent?week=${week.monday}`;
  const guardedAct = (...args) => { setConfirmKey(null); return act(...args); };
  const handlers = createHandlers({
    act: guardedAct, setStatus, actions,
    goEdit: id => navigate(`/agent/task/${id}?week=${week.monday}`), afterSave: () => navigate(weekUrl),
  });
  const ui = { busy, handlers, confirmKey, setConfirmKey, weekDates: week.weekDates };
  const editing = week.editId === null ? null : [...planner.todos, ...planner.completedTodos].find(todo => todo.id === week.editId);
  const cancelEdit = () => { setStatus({ ok: null, text: `Edit of task ${week.editId} cancelled. Nothing was changed.` }); navigate(weekUrl); };

  return (
    <div className="max-w-5xl mx-auto p-4 bg-white text-black font-sans text-base">
      <AgentHeader email={user.email} principal={user.principal} busy={busy} onLogout={logout}
        onRefresh={() => guardedAct('reload data from server', actions.refreshAll, 'Reloaded all data from the server')} />
      <StatusLine status={status} />
      {week.editId === null ? <HowToUse /> : null}
      {week.editId === null ? <JumpLinks /> : null}
      <WeekNav links={week.links} monday={week.monday} />
      {week.editId === null
        ? <WeekPage planner={planner} ui={ui} week={week} />
        : <EditTaskPage taskId={week.editId} todo={editing} loading={planner.loading} lists={planner.lists} ui={ui}
          weekUrl={weekUrl} onCancel={cancelEdit} />}
    </div>
  );
}
