class DomainError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = status;
  }
}

function publicError(error) {
  if (error instanceof DomainError) return { code: error.code, message: error.message };
  return { code: 'INTERNAL_ERROR', message: 'The operation could not be completed' };
}

module.exports = { DomainError, publicError };
