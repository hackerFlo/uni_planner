import { BUTTON } from './styles';

// Two steps on purpose: the first click only swaps the button, so a stray click
// can never delete. `extraScopes` adds further confirm buttons (all repeats).
export default function ConfirmDelete({ subject, displayId, confirming, disabled, onAsk, onCancel, onConfirm, extraScopes = [] }) {
  if (!confirming) {
    return (
      <button type="button" className={BUTTON} disabled={disabled} aria-label={`Delete ${subject}`} onClick={onAsk}>
        Delete
      </button>
    );
  }
  return (
    <span>
      <button type="button" className={BUTTON} disabled={disabled} onClick={() => onConfirm()}>
        {`Confirm delete #${displayId}`}
      </button>
      {extraScopes.map(({ scope, label }) => (
        <button key={scope} type="button" className={BUTTON} disabled={disabled} onClick={() => onConfirm(scope)}>
          {`Confirm delete #${displayId} ${label}`}
        </button>
      ))}
      <button type="button" className={BUTTON} onClick={onCancel} aria-label={`Cancel deleting ${subject}`}>Cancel</button>
    </span>
  );
}
