// Whether the edit form is holding work the server has not seen yet.
//
// Compared on the payload the form would actually send, not on the raw fields:
// the description round-trips through the rich-text sanitiser on the way in, so
// the only string that can be compared honestly is the one buildPayload()
// produces from the untouched form.

// An absent value has three spellings here (null from the payload, undefined
// from a key one side does not have, '' from an empty input) and they all mean
// "not set". Numbers are compared as text so a numeric list_id read back as a
// string does not read as an edit.
function normalise(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function hasUnsavedChanges(initial, current) {
  if (!initial || !current) return false;
  const keys = new Set([...Object.keys(initial), ...Object.keys(current)]);
  for (const key of keys) {
    if (normalise(initial[key]) !== normalise(current[key])) return true;
  }
  return false;
}
