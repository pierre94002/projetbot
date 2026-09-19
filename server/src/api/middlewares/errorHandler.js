export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Express (qs) transforme "?x=a&x=b" en tableau et "?x[k]=v" en objet : les
// couches basses appellent .trim()/.normalize() dessus et lèveraient un 500.
export function requireStringParam(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, `Le paramètre "${name}" est requis (chaîne non vide).`);
  return value.trim();
}

export function optionalStringParam(value, name) {
  return value === undefined || value === '' ? undefined : requireStringParam(value, name);
}

export function optionalPositiveInt(value, name) {
  if (value === undefined || value === '') return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new ApiError(400, `Le paramètre "${name}" doit être un entier positif.`);
  return number;
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
