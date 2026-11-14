import { recurrenceLabel } from '../components/ui/Tooltip';
import { DividerActions, TaskActions } from './RowActions';
import { CELL, TABLE } from './styles';

const COLUMNS = ['ID', 'Type', 'Title', 'List', 'Time', 'Status', 'Actions'];

function statusText(row) {
  if (row.kind === 'divider') return '-';
  const { item } = row;
  const base = row.completed ? 'completed' : 'open';
  const repeats = item.recurrence_interval_days != null || item.recurrence_pattern != null;
  return repeats ? `${base}, ${recurrenceLabel(item.recurrence_interval_days, item.recurrence_pattern).toLowerCase()}` : base;
}

function Row({ row, ui }) {
  const Actions = row.kind === 'divider' ? DividerActions : TaskActions;
  return (
    <tr>
      <td className={CELL}>{row.displayId}</td>
      <td className={CELL}>{row.kind}</td>
      <td className={CELL}>{row.title}</td>
      <td className={CELL}>{row.listName}</td>
      <td className={CELL}>{row.time}</td>
      <td className={CELL}>{statusText(row)}</td>
      <td className={CELL}><Actions row={row} ui={ui} /></td>
    </tr>
  );
}

export default function RowsTable({ rows, ui, emptyText, caption }) {
  return (
    <div className="overflow-x-auto">
      <table className={TABLE}>
        <caption className="text-left py-1">{caption}</caption>
        <thead>
          <tr>{COLUMNS.map(name => <th key={name} className={CELL} scope="col">{name}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td className={CELL} colSpan={COLUMNS.length}>{emptyText}</td></tr>}
          {rows.map(row => <Row key={row.key} row={row} ui={ui} />)}
        </tbody>
      </table>
    </div>
  );
}
