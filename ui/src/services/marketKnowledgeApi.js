import { httpClient } from './httpClient.js';

/**
 * Connaître le marché (étape 22 du plan, server/src/data/marketKnowledge.js), lu par la page « Bookmakers » (étape 31) :
 * la justesse de chaque bookmaker, qui bouge le premier, ses biais, ses marges et le meilleur moment pour parier.
 * Lecture seule : l'actualisation calcule et range chaque nuit, la page ne lance rien. `championnat` : la portée lue
 * (« * » : tous réunis, par défaut) — les lignes d'un seul championnat à la fois (0,2 à 0,3 Mo).
 */
export const marketKnowledgeApi = {
  get: ({ championnat = null } = {}) => httpClient.get(`/market-knowledge${championnat && championnat !== '*' ? `?championnat=${encodeURIComponent(championnat)}` : ''}`)
};
