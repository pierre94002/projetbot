import { httpClient } from './httpClient.js';

export const matchAiAnalysisApi = {
  getStatus: () => httpClient.get('/match-ai-analysis/status'),
  getAll: () => httpClient.get('/match-ai-analysis'),
  getForMatch: (matchId) => httpClient.get(`/match-ai-analysis/match/${encodeURIComponent(matchId)}`),
  // Page de match : retrouvée par équipes, compétition et date (cf. getForFixture côté serveur). Étape 40 (lot 1b) : avec `matchKey`
  // (la clé de la rencontre au magasin, page d'un match joué), la réponse porte aussi la fiche d'après-match (`fiche`).
  getForFixture: ({ home, away, league, date, matchKey = null }) => {
    const params = new URLSearchParams({ home, away, date });
    if (league) params.set('league', league);
    if (matchKey) params.set('matchKey', matchKey);
    return httpClient.get(`/match-ai-analysis/fixture?${params.toString()}`);
  },
  runPreMatch: (matchId, { home, away, league, engineResult }) =>
    httpClient.post(`/match-ai-analysis/match/${encodeURIComponent(matchId)}`, { home, away, league, engineResult }),
  runPostMatch: (matchId) => httpClient.post(`/match-ai-analysis/match/${encodeURIComponent(matchId)}/post-match-review`),
  // Étape 21 du plan : le carnet de notes de l'IA (lecture seule ; refait chaque nuit par l'actualisation).
  scorecard: () => httpClient.get('/match-ai/scorecard'),
  // Étape 44 du plan : la mémoire de l'IA — le dossier d'une équipe (par son identifiant FotMob) et de son championnat,
  // ou d'un championnat seul (lecture seule ; écrits chaque nuit par l'actualisation).
  dossierEquipe: (clubId) => httpClient.get(`/match-ai-analysis/dossiers?club=${encodeURIComponent(clubId)}`),
  dossierChampionnat: (league) => httpClient.get(`/match-ai-analysis/dossiers?league=${encodeURIComponent(league)}`),
  // Étape 45 du plan : l'INDEX des dossiers (page « Bulletin ») — les championnats, les équipes, toutes les leçons gardées avec leur match
  // d'origine (lecture seule ; écrits chaque nuit par l'actualisation).
  dossiersResume: () => httpClient.get('/match-ai-analysis/dossiers/resume')
};
