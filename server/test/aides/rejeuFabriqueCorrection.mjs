/**
 * Un REJEU DU BANC FABRIQUÉ pour le banc d'une correction (étape 26, partie B) — ce n'est PAS un fichier de test.
 * Chargé par l'ENFANT du banc (src/data/correction/bancCorrectionEnfant.js) quand le script d'essai l'a demandé
 * (bancDesCorrections.__testing.simulerLeRejeu, refusé hors d'une copie d'essai). La base d'essai n'a pas l'historique
 * football-data 2019-2023 : ce rejeu rend, à la place du vrai (bench/runner.js), des lignes de la même forme, sans
 * hasard. Tout le reste est le VRAI code : l'enfant, jugerLaCandidateAuBanc, le juge de l'étape 16, le nombre de
 * corrections comptées lu au registre de la mesure de la copie.
 *   - la version en service (le premier rejeu, sans `declaration`) : une perte log par ligne ;
 *   - la correction (le second, avec `declaration`) : 0,012 de moins sur chaque ligne (« retenu ») ;
 *   - une correction du démarrage à froid (identifiant « …-froid-… ») : le rejeu échoue (« banc impossible »).
 * Aucun import du serveur : seulement node.
 */

import crypto from 'node:crypto';

const MATCHS = 320;
const LIGNES = Object.freeze({ totalGoals: 2.5, bothTeamsScore: null, resultAndTotal: 2.5 });

export async function rejouer(options = {}) {
  const candidate = Boolean(options.declaration);
  const empreinte = crypto.createHash('sha1').update(JSON.stringify(options.config ?? {})).digest('hex');
  if (candidate && /-froid-/.test(String(options.declaration?.version ?? ''))) {
    return { moteur: { empreinte }, bilan: { erreur: 'aucun match de l’historique pour ces marchés (rejeu d’essai)' } };
  }
  const familles = Array.isArray(options.marches) ? options.marches : [];
  let fait = 0;
  for (let i = 0; i < MATCHS; i++) {
    const jour = new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
    const fixtureKey = `fd:essai|dom-${i}|ext-${i}|${jour}`;
    for (const famille of familles) {
      const marches = famille === 'teamGoals' ? [['teamGoals:home', 0.5], ['teamGoals:away', 0.5]] : [[famille, LIGNES[famille] ?? null]];
      for (const [marketKey, ligne] of marches) {
        const service = 0.62 + (0.05 * ((i * 7 + marketKey.length) % 5)) / 4;
        const perte = candidate ? service - 0.012 : service;
        options.surLigne?.({
          type: 'ligne',
          cle: `${fixtureKey}|${marketKey}|${ligne ?? '-'}|fd-avant-match`,
          fixtureKey,
          date: jour,
          marketKey,
          prix: 'fd-avant-match',
          ligne,
          mesures: { moteur: { perteLog: perte }, marche: { perteLog: service - 0.004 }, repere: { perteLog: service + 0.01 } },
          moteur: { p: 0.5, choix: 'a' },
          issue: i % 2 === 0 ? 'a' : 'b',
          reglable: true
        });
      }
    }
    if (++fait % 80 === 0) options.avancement?.({ partie: candidate ? 'correction' : 'version en service', fait, total: MATCHS });
  }
  return { moteur: { empreinte }, bilan: { regimes: null } };
}
