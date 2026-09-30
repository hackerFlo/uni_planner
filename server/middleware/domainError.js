const { DomainError } = require('../domain/errors');

function domainError(error, _req, res, next) {
  if (!(error instanceof DomainError)) return next(error);
  res.status(error.status).json({ error: error.message, code: error.code,
    ...(error.currentVersion ? { currentVersion: error.currentVersion } : {}),
    ...(error.todoCount !== undefined ? { todoCount: error.todoCount } : {}) });
}

module.exports = domainError;
