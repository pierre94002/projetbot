/**
 * Ré-exécute une fonction asynchrone avec un backoff exponentiel en cas
 * d'échec (utile pour les appels à des sources de données externes).
 */
export async function withRetry(asyncFn, retries = 3, delayMs = 500) {
  try {
    return await asyncFn();
  } catch (error) {
    if (retries === 0) throw new Error(`Échec après plusieurs tentatives : ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return withRetry(asyncFn, retries - 1, delayMs * 2);
  }
}
