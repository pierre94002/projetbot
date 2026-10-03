const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await response.json() : null;

  if (!response.ok) {
    // Une route que le serveur ne connaît pas alors que l'interface l'appelle :
    // l'interface se recharge toute seule à chaque modification, le serveur
    // non — il tourne sur une version plus ancienne et doit être relancé.
    if (response.status === 404 && /^Route introuvable/.test(body?.error ?? '')) {
      throw new Error('Le serveur n\'est pas à jour : relancez demarrer-cotemaster.bat pour activer cette fonction.');
    }
    throw new Error(body?.error || `Erreur HTTP ${response.status}`);
  }

  return body;
}

export const httpClient = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  put: (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data ?? {}) }),
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data ?? {}) }),
  delete: (path) => request(path, { method: 'DELETE' })
};

export { API_BASE_URL };
