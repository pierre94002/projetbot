import { httpClient } from './httpClient.js';

/**
 * La simulation complète (étape 28 du plan) : des LECTURES de ce que la passe de nuit a rangé (fins de saison, enjeux,
 * état), le prix juste d'un ticket (calculé par le serveur sur la grille du moteur, jamais une simulation dans la
 * requête) et le clic d'un interrupteur de Réglages (simulation_state : jamais les réglages du moteur).
 */
export const simulationApi = {
  // Les interrupteurs (rangés et effectifs), les dernières nuits, l'avancement de la preuve, la porte 1, les championnats.
  etat: () => httpClient.get('/simulation/etat'),
  // La fin de saison d'un championnat (dernière nuit complète), ou { calcule: false, raison } — jamais une coupe.
  saison: (league) => httpClient.get(`/simulation/saison?league=${encodeURIComponent(league)}`),
  // L'enjeu des rencontres d'un jour (ou de plusieurs), par identifiants FotMob ; rien tant que l'affichage est éteint.
  enjeux: (du, au = du) => httpClient.get(`/simulation/enjeux?du=${encodeURIComponent(du)}&au=${encodeURIComponent(au)}`),
  // Le prix juste d'un ticket ; `cote` : la cote du combiné tapée (facultative).
  prixCombine: (legs, cote = null) => httpClient.post('/simulation/prix-combine', { legs, ...(Number.isFinite(cote) && cote > 1 ? { cote } : {}) }),
  // Un interrupteur (cle : saisons | matchs) ; 409 et une phrase quand ses conditions ne sont pas réunies.
  changerAffichage: (cle, valeur) => httpClient.put('/simulation/affichage', { cle, valeur })
};
