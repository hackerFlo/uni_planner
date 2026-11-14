import { useState } from 'react';
import ConfirmDelete from './ConfirmDelete';
import { PALETTE_KEYS } from '../constants/listPalette';
import { BUTTON, CELL, FIELD, HEADING, SECTION, TABLE } from './styles';

const LIST_NAME_MAX = 40;

function ColourSelect({ id, value, onChange }) {
  return (
    <select id={id} className={FIELD} value={value} onChange={event => onChange(event.target.value)}>
      {PALETTE_KEYS.map(key => <option key={key} value={key}>{key}</option>)}
    </select>
  );
}

function ListDelete({ list, others, ui }) {
  const [moveTo, setMoveTo] = useState(String(others[0]?.id ?? ''));
  const confirmKey = `list:${list.id}`;
  const confirming = ui.confirmKey === confirmKey;
  const selectId = `list-move-${list.id}`;
  return (
    <div>
      {confirming && others.length > 0 && (
        <div>
          <label htmlFor={selectId}>{`Move tasks of list ${list.id} to `}</label>
          <select id={selectId} className={FIELD} value={moveTo} onChange={event => setMoveTo(event.target.value)}>
            {others.map(other => <option key={other.id} value={String(other.id)}>{`${other.name} (list ${other.id})`}</option>)}
          </select>
        </div>
      )}
      <ConfirmDelete subject={`list ${list.id}`} displayId={list.id} confirming={confirming} disabled={ui.busy || others.length === 0}
        onAsk={() => ui.setConfirmKey(confirmKey)} onCancel={() => ui.setConfirmKey(null)}
        onConfirm={() => ui.handlers.deleteList(list, moveTo ? Number(moveTo) : null)} />
      {others.length === 0 && <div>The last list cannot be deleted.</div>}
    </div>
  );
}

function ListRow({ list, others, ui }) {
  const [name, setName] = useState(list.name);
  const [color, setColor] = useState(list.color);
  const nameId = `list-name-${list.id}`;
  const colorId = `list-colour-${list.id}`;
  function submit(event) {
    event.preventDefault();
    ui.handlers.saveList(list, { name: name.trim(), color });
  }
  return (
    <tr>
      <td className={CELL}>{list.id}</td>
      <td className={CELL}>{list.name}</td>
      <td className={CELL}>{list.color}</td>
      <td className={CELL}>
        <form onSubmit={submit}>
          <label htmlFor={nameId}>{`Name of list ${list.id} `}</label>
          <input id={nameId} className={FIELD} type="text" value={name} maxLength={LIST_NAME_MAX} onChange={event => setName(event.target.value)} />{' '}
          <label htmlFor={colorId}>{`Colour of list ${list.id} `}</label>
          <ColourSelect id={colorId} value={color} onChange={setColor} />{' '}
          <button type="submit" className={BUTTON} disabled={ui.busy} aria-label={`Save list ${list.id}`}>Save list</button>
        </form>
        <ListDelete list={list} others={others} ui={ui} />
      </td>
    </tr>
  );
}

function CreateListForm({ ui }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('indigo');
  async function submit(event) {
    event.preventDefault();
    if (await ui.handlers.createList(name.trim(), color)) setName('');
  }
  return (
    <form onSubmit={submit} className="my-3">
      <label htmlFor="new-list-name">New list name </label>
      <input id="new-list-name" className={FIELD} type="text" value={name} maxLength={LIST_NAME_MAX} onChange={event => setName(event.target.value)} />{' '}
      <label htmlFor="new-list-colour">Colour </label>
      <ColourSelect id="new-list-colour" value={color} onChange={setColor} />{' '}
      <button type="submit" className={BUTTON} disabled={ui.busy}>Add list</button>
    </form>
  );
}

export default function ListsPanel({ lists, ui }) {
  return (
    <section id="lists" aria-labelledby="lists-heading" className={SECTION}>
      <h2 id="lists-heading" className={HEADING}>Lists</h2>
      <div className="overflow-x-auto">
        <table className={TABLE}>
          <caption className="text-left py-1">All lists. Deleting a list moves its tasks to the list you choose.</caption>
          <thead><tr>{['ID', 'Name', 'Colour', 'Actions'].map(h => <th key={h} className={CELL} scope="col">{h}</th>)}</tr></thead>
          <tbody>
            {lists.map(list => <ListRow key={`${list.id}:${list.name}:${list.color}`} list={list}
              others={lists.filter(other => other.id !== list.id)} ui={ui} />)}
          </tbody>
        </table>
      </div>
      <CreateListForm ui={ui} />
    </section>
  );
}
