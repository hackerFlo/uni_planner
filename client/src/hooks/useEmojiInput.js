import { useEffect, useState } from 'react';
import { loadEmojis, getLoadedEmojis } from '../data/loadEmojis';

function detectTrigger(value, cursorPos) {
  const before = value.substring(0, cursorPos);
  const match = before.match(/(^|[^:\w]):([\w-]*)$/);
  if (!match) return null;
  return { query: match[2], triggerStart: match.index + match[1].length };
}

function tryAutoConvert(value, cursorPos) {
  const before = value.substring(0, cursorPos);
  const match = before.match(/(^|[^:\w]):([\w-]+):$/);
  if (!match) return null;
  const emojis = getLoadedEmojis();
  if (!emojis) return null;
  const q = match[2].toLowerCase();
  const hit = emojis.find(({ n }) => n[0] === q) || emojis.find(({ n }) => n.includes(q));
  if (!hit) return null;
  const tokenStart = match.index + match[1].length;
  return {
    newVal: value.substring(0, tokenStart) + hit.e + ' ' + value.substring(cursorPos),
    newCursor: tokenStart + hit.e.length + 1,
  };
}

export default function useEmojiInput(value, onChange, inputRef) {
  const [emojiState, setEmojiState] = useState(null);
  useEffect(() => { loadEmojis(); }, []);

  function handleChange(e) {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart ?? val.length;
    const auto = tryAutoConvert(val, cursorPos);
    if (auto) {
      onChange(auto.newVal);
      setEmojiState(null);
      setTimeout(() => {
        inputRef?.current?.focus();
        inputRef?.current?.setSelectionRange(auto.newCursor, auto.newCursor);
      }, 0);
      return;
    }
    const trigger = detectTrigger(val, cursorPos);
    setEmojiState(trigger ?? null);
    onChange(val);
  }

  function handleEmojiSelect(emoji) {
    if (!emojiState) return;
    const cursorPos = inputRef?.current?.selectionStart ?? value.length;
    const newVal = value.substring(0, emojiState.triggerStart) + emoji + ' ' + value.substring(cursorPos);
    onChange(newVal);
    setEmojiState(null);
    const newCursor = emojiState.triggerStart + emoji.length + 1;
    setTimeout(() => {
      inputRef?.current?.focus();
      inputRef?.current?.setSelectionRange(newCursor, newCursor);
    }, 0);
  }

  return {
    emojiState,
    handleChange,
    handleEmojiSelect,
    closeEmojiPicker: () => setEmojiState(null),
  };
}
