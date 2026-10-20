/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-fiche-absents.mjs <serveur de la copie>
 *
 * Étape 41 — LES ABSENTS AVEC LEURS CHIFFRES : la composition décrite par
 * lineupContext.js (buildLineupContext) donne à chaque absent annoncé son
 * poste et ses chiffres de la saison, lus dans la base d'essai par son
 * identifiant FotMob — jamais par le nom, jamais l'identifiant 0. La fiche
 * compacte met en avant ceux qui ont joué ; l'ancienne forme (compositionPourIA)
 * reste ce qu'elle était. Page FotMob FABRIQUÉE avec de vrais joueurs de la base
 * d'essai (Man City). Sortie : une ligne JSON.
 */

import { importeur } from './claudeSimule.mjs';
import { installerFauxFetch } from './fotmobSimule.mjs';

const [serveur] = process.argv.slice(2);
const imp = importeur(serveur);
const { openDb } = await imp('data/db/matchStatsDb.js');
const { buildLineupContext } = await imp('data/providers/lineupContext.js');
const service = await imp('core/ai/matchAiAnalysisService.js');
const C = await imp('core/ai/compactContext.js');
const db = openDb();

// De vrais joueurs de Man City dans la base d'essai : le plus titularisé (absent annoncé) et dix autres (le onze).
const joueurs = db
  .prepare(
    `SELECT p.player_id AS pid, MAX(p.name) AS name, MAX(p.position) AS position, SUM(CASE WHEN p.starter = 1 THEN 1 ELSE 0 END) AS starts, COUNT(*) AS n
     FROM players p JOIN matches m ON m.match_key = p.match_key
     WHERE ((m.home_id = 'fotmob-8456' AND p.side = 'home') OR (m.away_id = 'fotmob-8456' AND p.side = 'away')) AND m.date >= '2026-07-01' AND p.player_id IS NOT NULL
     GROUP BY p.player_id ORDER BY starts DESC, p.player_id LIMIT 14`
  )
  .all();
const numero = (pid) => Number(String(pid).replace('fotmob-', ''));
// Le plus titularisé (titulaire habituel) et le moins titularisé de la liste (qui a joué sans être habituel) : absents.
const [vedette, ...autres] = joueurs;
const remplacant = joueurs.at(-1);
const page = {
  general: { homeTeam: { id: 8456, name: 'Man City' }, awayTeam: { id: 8668, name: 'Everton' }, matchTimeUTCDate: '2026-10-05T19:00:00.000Z' },
  header: { status: { started: false, finished: false } },
  content: {
    lineup: {
      homeTeam: {
        id: 8456,
        name: 'Man City',
        formation: '4-3-3',
        starters: autres.slice(0, 11).map((j, k) => ({ id: numero(j.pid), name: j.name, shirtNumber: String(k + 1), positionId: k === 0 ? 11 : 30 + k })),
        subs: [],
        unavailable: [
          { id: numero(vedette.pid), name: vedette.name, unavailability: { type: 'injury', expectedReturn: 'Late October 2026' } },
          { id: numero(remplacant.pid), name: remplacant.name, unavailability: { type: 'suspension', expectedReturn: null } },
          { id: 0, name: 'Inconnu Zéro', unavailability: { type: 'injury', expectedReturn: null } },
          { id: 99999999, name: 'Pas Dans La Base', unavailability: { type: 'suspension', expectedReturn: null } }
        ]
      },
      awayTeam: { id: 8668, name: 'Everton', formation: '4-4-2', starters: [{ id: 1, name: 'Gardien Everton', shirtNumber: '1', positionId: 11 }], subs: [], unavailable: [] }
    }
  }
};
installerFauxFetch({ details: { 4900111: page } });
const compo = await buildLineupContext({ homeName: 'Man City', awayName: 'Everton', commenceTimeIso: '2026-10-05T19:00:00.000Z', league: 'EPL', fotmobMatchId: '4900111' });
const fiche = C.ficheAvantMatch({ home: 'Man City', away: 'Everton', league: 'EPL', engineSummary: { marketPredictions: [] }, context: {}, lineups: compo, experience: [] });
console.log(
  JSON.stringify({
    ok: true,
    vedette: { pid: vedette.pid, name: vedette.name, position: vedette.position, starts: vedette.starts },
    remplacant: { pid: remplacant.pid, name: remplacant.name, position: remplacant.position, starts: remplacant.starts },
    teamMatches: compo?.home?.teamMatches ?? null,
    absents: compo?.home?.unavailable ?? null,
    habituelsAbsents: compo?.home?.usualStartersMissing?.map((h) => h.name) ?? null,
    ancienneForme: service.__testing.compositionPourIA(compo).home.unavailable,
    lignesFiche: fiche.split('\n').filter((l) => /Absents|Autres absents|Titulaires habituels/.test(l))
  })
);
