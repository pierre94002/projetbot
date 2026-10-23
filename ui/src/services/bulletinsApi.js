import { httpClient } from './httpClient.js';

// Le bulletin du jour et le bilan de la semaine (étape 42 du plan) : deux textes écrits par l'IA, un appel à Claude Code par jour
// et par semaine, à partir d'une fiche chiffrée que le code prépare. LECTURE SEULE : l'actualisation les écrit (data/runtime/
// ai-bulletins.json), aucune route ni aucun bouton ne lance un appel.
export const bulletinsApi = {
  overview: () => httpClient.get('/match-ai-analysis/bulletins')
};
