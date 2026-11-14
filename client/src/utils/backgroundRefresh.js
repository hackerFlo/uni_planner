// A form closes when its write succeeds; the refetch that follows is only there
// to bring the board up to date. mutate() awaits one `refresh` callback both
// to recover from a stale version (before the write, must be awaited) and after
// the write. Only the calls that come after the write go to the background.
export function backgroundAfterWrite(refresh, onSettled = () => {}) {
  let written = false;
  return {
    markWritten() { written = true; },
    refresh(options) {
      if (!written) return refresh(options);
      refresh(options).then(onSettled, onSettled);
      return Promise.resolve(true);
    },
  };
}
