import { useState, useRef, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useLists } from '../../context/ListsContext';
import { useRegisterModal } from '../../context/ModalContext';
import { useToast } from '../../context/ToastContext';
import { userMessage } from '../../api/errors';
import { LIST_PALETTE, PALETTE_KEYS } from '../../constants/listPalette';
import EmojiPicker from '../ui/EmojiPicker';
import useEmojiInput from '../../hooks/useEmojiInput';

function ColorDot({ color, size = 'md' }) {
  const cls = LIST_PALETTE[color]?.dot ?? LIST_PALETTE.slate.dot;
  return <span className={`rounded-full flex-shrink-0 ${cls} ${size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'}`} />;
}

function ColorPicker({ value, onChange, onClose }) {
  return (
    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-zinc-200 rounded-xl shadow-lg p-2 flex flex-wrap gap-1.5 w-[116px]">
      {PALETTE_KEYS.map(key => (
        <button
          key={key}
          type="button"
          onClick={() => { onChange(key); onClose(); }}
          className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${LIST_PALETTE[key].dot} ${value === key ? 'ring-2 ring-offset-1 ring-zinc-400' : ''}`}
        />
      ))}
    </div>
  );
}

function DeleteDialog({ list, otherLists, onConfirm, onCancel }) {
  useRegisterModal();
  const [moveTo, setMoveTo] = useState(otherLists[0]?.id ?? '');

  return (
    <div data-modal-root className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <h3 className="text-sm font-semibold text-zinc-800 mb-2">Delete "{list.name}"?</h3>
        <p className="text-xs text-zinc-500 mb-4">
          Any todos in this list will be moved to another list before deleting.
        </p>
        {otherLists.length > 0 && (
          <div className="mb-4">
            <label className="block text-xs text-zinc-500 mb-1">Move todos to</label>
            <select
              value={moveTo}
              onChange={e => setMoveTo(Number(e.target.value))}
              className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
            >
              {otherLists.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 text-xs font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 py-2 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(moveTo || null)}
            className="flex-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 py-2 rounded-lg transition"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function ListRow({ list, index, canDelete, onDelete }) {
  const toast = useToast();
  const { updateList } = useLists();
  const [name, setName] = useState(list.name);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const pickerRef = useRef(null);
  const nameRef = useRef(null);
  const { emojiState, handleChange, handleEmojiSelect, closeEmojiPicker } = useEmojiInput(name, setName, nameRef);

  useEffect(() => {
    if (!showPicker) return;
    function handleOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showPicker]);

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === list.name) { setName(list.name); return; }
    setSaving(true);
    try { await updateList(list.id, { name: trimmed }); }
    catch (err) {
      setName(list.name);
      toast?.error(`Could not rename the list. ${userMessage(err)}`, { ref: err.requestId ?? null });
    }
    finally { setSaving(false); }
  }

  async function handleColorChange(color) {
    if (color === list.color) return;
    await updateList(list.id, { color });
  }

  return (
    <Draggable draggableId={`list-${list.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-2.5 py-2 ${snapshot.isDragging ? 'shadow-lg' : ''}`}
        >
          {/* Drag handle */}
          <div
            {...provided.dragHandleProps}
            className="text-zinc-300 hover:text-zinc-500 cursor-grab active:cursor-grabbing flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
              <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
            </svg>
          </div>

          {/* Color picker trigger */}
          <div className="relative flex-shrink-0" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setShowPicker(v => !v)}
              className="flex items-center justify-center w-5 h-5 rounded-full hover:ring-2 hover:ring-zinc-300 transition"
            >
              <ColorDot color={list.color} />
            </button>
            {showPicker && (
              <ColorPicker
                value={list.color}
                onChange={handleColorChange}
                onClose={() => setShowPicker(false)}
              />
            )}
          </div>

          {/* Name input */}
          <div className="relative flex-1 min-w-0">
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={handleChange}
              onBlur={() => setTimeout(saveName, 150)}
              onKeyDown={e => {
                if (emojiState) return;
                if (e.key === 'Enter') { e.target.blur(); }
                if (e.key === 'Escape') { setName(list.name); e.target.blur(); }
              }}
              maxLength={40}
              disabled={saving}
              className="w-full text-xs text-zinc-700 bg-transparent border-none outline-none focus:bg-zinc-50 focus:ring-1 focus:ring-indigo-300 rounded px-1 py-0.5 transition disabled:opacity-50"
            />
            {emojiState && (
              <EmojiPicker anchorRef={nameRef} query={emojiState.query} onSelect={handleEmojiSelect} onClose={closeEmojiPicker} />
            )}
          </div>

          {/* Delete */}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex-shrink-0 text-zinc-300 hover:text-red-500 transition p-0.5 rounded"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      )}
    </Draggable>
  );
}

export default function ListsSection({ fetchTodos }) {
  const { lists, createList, reorderLists, deleteList } = useLists();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('indigo');
  const [showNewPicker, setShowNewPicker] = useState(false);
  const newPickerRef = useRef(null);
  const newNameRef = useRef(null);
  const { emojiState: newNameEmojiState, handleChange: handleNewNameChange, handleEmojiSelect: handleNewNameEmojiSelect, closeEmojiPicker: closeNewNameEmojiPicker } = useEmojiInput(newName, setNewName, newNameRef);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!showNewPicker) return;
    function handleOutside(e) {
      if (newPickerRef.current && !newPickerRef.current.contains(e.target)) setShowNewPicker(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showNewPicker]);
  const [createError, setCreateError] = useState('');

  function handleDragEnd({ source, destination }) {
    if (!destination || source.index === destination.index) return;
    const reordered = [...lists];
    const [moved] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, moved);
    reorderLists(reordered.map(l => l.id));
  }

  async function handleCreate(e) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreateError('');
    setCreating(true);
    try {
      await createList(trimmed, newColor);
      setNewName('');
      setNewColor('indigo');
    } catch (err) {
      setCreateError(err.message || 'Failed to create list');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteConfirm(moveToId) {
    if (!deleteTarget) return;
    try {
      await deleteList(deleteTarget.id, moveToId);
      fetchTodos?.();
    } catch {
      // error is self-evident; dialog closes regardless
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-widest">Lists</h3>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="settings-lists">
          {provided => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {lists.map((list, index) => (
                <ListRow
                  key={list.id}
                  list={list}
                  index={index}
                  canDelete={lists.length > 1}
                  onDelete={() => setDeleteTarget(list)}
                />
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Add new list */}
      <form onSubmit={handleCreate} className="flex items-center gap-2 pt-1">
        <div className="relative flex-shrink-0" ref={newPickerRef}>
          <button
            type="button"
            onClick={() => setShowNewPicker(v => !v)}
            className="flex items-center justify-center w-5 h-5 rounded-full hover:ring-2 hover:ring-zinc-300 transition"
          >
            <ColorDot color={newColor} />
          </button>
          {showNewPicker && (
            <ColorPicker
              value={newColor}
              onChange={setNewColor}
              onClose={() => setShowNewPicker(false)}
            />
          )}
        </div>
        <div className="relative flex-1 min-w-0">
          <input
            ref={newNameRef}
            type="text"
            value={newName}
            onChange={handleNewNameChange}
            maxLength={40}
            placeholder="New list name…"
            className="w-full text-xs border border-zinc-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition bg-zinc-50"
          />
          {newNameEmojiState && (
            <EmojiPicker anchorRef={newNameRef} query={newNameEmojiState.query} onSelect={handleNewNameEmojiSelect} onClose={closeNewNameEmojiPicker} />
          )}
        </div>
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="flex-shrink-0 text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 px-3 py-1.5 rounded-lg transition"
        >
          {creating ? '…' : 'Add'}
        </button>
      </form>
      {createError && <p className="text-xs text-red-500">{createError}</p>}

      {deleteTarget && (
        <DeleteDialog
          list={deleteTarget}
          otherLists={lists.filter(l => l.id !== deleteTarget.id)}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
