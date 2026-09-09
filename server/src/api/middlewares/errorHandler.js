export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route introuvable : ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  // `statusCode` (ApiError, couche api/) ou `status` (DomainError, couche
  // core/ — cf. core/errors.js, qui ne doit rien importer de cette couche).
  const statusCode = error.statusCode || error.status || 500;
  if (statusCode === 500) {
    console.error(error);
  }
  res.status(statusCode).json({ error: error.message || 'Erreur interne du serveur.' });
}
