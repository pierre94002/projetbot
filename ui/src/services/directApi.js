import { httpClient } from './httpClient.js';

// Le direct (étape 46 du plan, lot 1, partie D, 12/11/2026) : le tableau des matchs en cours et le détail d'un match.
// Lecture seule : le serveur sert l'état relevé par la boucle du direct (FotMob, gratuit) et ce que le calcul en dit ;
// l'écran ne lance aucun relevé et ne range rien dans la base (P6, question 10). `instant` : un rejeu (R28), jamais en direct.
const avecInstant = (params, instant) => {
  if (instant) params.set('instant', instant);
  const q = params.toString();
  return q ? `?${q}` : '';
};

export const directApi = {
  tableau: ({ instant = null } = {}) => httpClient.get(`/direct${avecInstant(new URLSearchParams(), instant)}`),
  match: ({ id = null, home = null, away = null, coup = null, instant = null } = {}) => {
    const params = new URLSearchParams();
    if (id) params.set('id', String(id));
    else {
      params.set('home', home);
      params.set('away', away);
      params.set('coup', coup);
    }
    return httpClient.get(`/direct/match${avecInstant(params, instant)}`);
  },
  // Correctifs D2 (12/11/2026, point 2) : la liste légère des matchs que la boucle suit en cours (identifiants FotMob, phase,
  // minute, score), pour la puce « Direct » de toute l'appli — lue par useDirectEnCours.js seulement, une fois par minute.
  enCours: ({ instant = null } = {}) => httpClient.get(`/direct/en-cours${avecInstant(new URLSearchParams(), instant)}`)
};
