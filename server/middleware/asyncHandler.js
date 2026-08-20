// Express 4 does not await a handler's returned promise, so a rejection inside
// an `async (req, res)` handler never reaches the error middleware in
// index.js. The request simply stalls until server.timeout (30 s) kills it --
// the client sees a hang rather than a 500, and nothing is logged (EL-1).
// Express 5 fixes this natively; until then every async handler gets wrapped.
function asyncHandler(fn) {
  return function handleAsyncRoute(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
