import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { teamNamesLikelyMatch } from '../../utils/teamNameMatch.js';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/match-results.json');

// Cache invalidé par date de modification du fichier (même principe que
// engineConfig.js) : relu à chaque enrichissement de moyennes, au moins une
// fois par équipe et par analyse — reparser les 38 000+ entrées (~14 Mo) à
// chaque appel coûtait cher pour rien. Reste à jour si le fichier change
// depuis un autre processus (script de fusion lancé à côté).
let cache = { mtimeMs: undefined, results: null };

function currentMtimeMs() {
  try {
    return fs.statSync(RESULTS_FILE_PATH).mtimeMs;
  } catch {
    return null; // Fichier absent : état légitime, liste vide.
  }
}

// Illisible = erreur, pas journal vide : un score saisi à ce moment-là
// aurait réécrit les 38 000 résultats avec ce seul score (cf.
// utils/atomicJson.js).
function readResults() {
  const mtimeMs = currentMtimeMs();
  if (cache.results && cache.mtimeMs === mtimeMs) return cache.results;
  cache = { mtimeMs, results: readJsonFile(RESULTS_FILE_PATH, []) };
  return cache.results;
}

function writeResults(results) {
  try {
    writeJsonAtomic(RESULTS_FILE_PATH, results);
  } catch (error) {
    // L'appelant a déjà modifié la liste en cache : on l'oublie, la prochaine
    // lecture repart du fichier, resté tel quel.
    cache = { mtimeMs: undefined, results: null };
    throw error;
  }
  // Réaligné sur le fichier qu'on vient d'écrire, sinon le prochain appel le relirait pour rien.
  cache = { mtimeMs: currentMtimeMs(), results };
}

// `homeGoals`/`awayGoals` sont le nom historique (football) du champ ; un
// futur sport parlerait de "score" plutôt que de "buts" — `homeScore`/
// `awayScore` est donc ajouté EN PLUS (jamais à la place) sur tout ce qui
// est lu ou écrit, sans script de migration séparé : la valeur est
// identique, il ne s'agit que d'exposer aussi le nom neutre.
function withNeutralScoreFields(entry) {
  return { ...entry, homeScore: entry.homeScore ?? entry.homeGoals, awayScore: entry.awayScore ?? entry.awayGoals };
}

export function listMatchResults() {
  return readResults()
    .sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt))
    .map(withNeutralScoreFields);
}

export function getResultByMatchId(matchId) {
  const found = readResults().find((r) => r.matchId === matchId);
  return found ? withNeutralScoreFields(found) : null;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const WEB_RESULT_ID = /^web-\d{4}-\d{2}-\d{2}-/;

/**
 * Retrouve le résultat d'une rencontre SANS se fier au seul matchId.
 *
 * Deux espaces d'identifiants coexistent : les matchs affichés par l'appli
 * portent le matchId opaque de The Odds API, tandis que les résultats importés
 * par merge-daily-results.mjs (recherche web) n'ont qu'un id dérivé
 * "web-<date>-<équipes>". Comparer les deux ne donne jamais rien, et sans ce
 * repli un match terminé restait indéfiniment dans la liste des matchs à
 * analyser.
 *
 * D'où l'ordre : d'abord l'égalité de matchId (score saisi à la main depuis
 * Historique moteur), puis le rapprochement par date (±1 jour, pour absorber
 * les décalages de fuseau entre le coup d'envoi UTC et la date du résultat) et
 * par noms d'équipe via le registre partagé.
 *
 * Le règlement automatique élargit la fenêtre vers l'AVANT (`after`) pour
 * un pronostic dont on ne connaît que le jour du premier scan : le match a
 * pu être joué plusieurs jours plus tard. Parmi les candidats, le plus
 * proche du jour donné l'emporte, et à égalité un résultat FotMob — deux
 * graphies d'un même match (« Paris SG », « Paris Saint-Germain ») coexistent
 * dans le fichier.
 *
 * @returns {(matchId: string, day: string, homeName: string, awayName: string, window?: { before?: number, after?: number }) => object|null}
 */
export function createResultLookup(results = listMatchResults()) {
  const byMatchId = new Map(results.map((r) => [r.matchId, r]));
  // Indexés par jour : une recherche ne parcourt que les jours de sa fenêtre,
  // et non les 38 000 résultats connus.
  const byDay = new Map();
  for (const r of results) {
    if (typeof r.matchId !== 'string' || !WEB_RESULT_ID.test(r.matchId)) continue;
    const jour = r.matchId.slice(4, 14);
    const liste = byDay.get(jour) ?? [];
    liste.push(r);
    byDay.set(jour, liste);
  }
  // Plusieurs marchés d'un même match cherchent le même résultat.
  const deja = new Map();

  // `league` : quand il est connu des deux côtés, un résultat d'une AUTRE
  // compétition est écarté — les mêmes clubs se croisent en coupe et en
  // championnat à quelques jours d'écart (Nottingham Forest - Leeds, EPL le
  // 22/08 puis EFL Cup le 25/08).
  return (matchId, day, homeName, awayName, { before = 1, after = 1, league = null } = {}) => {
    const direct = byMatchId.get(matchId);
    if (direct) return direct;

    const dayMs = Date.parse(String(day ?? '').slice(0, 10));
    if (!Number.isFinite(dayMs)) return null;

    const cle = `${String(day).slice(0, 10)}|${before}|${after}|${homeName}|${awayName}|${league ?? ''}`;
    if (deja.has(cle)) return deja.get(cle);

    let meilleur = null;
    for (let i = -before; i <= after; i++) {
      const jour = new Date(dayMs + i * ONE_DAY_MS).toISOString().slice(0, 10);
      for (const r of byDay.get(jour) ?? []) {
        if (league && r.league && r.league !== league) continue;
        if (!teamNamesLikelyMatch(r.homeName, homeName) || !teamNamesLikelyMatch(r.awayName, awayName)) continue;
        const rang = [Math.abs(i), r.source === 'fotmob' ? 0 : 1];
        if (!meilleur || rang[0] < meilleur.rang[0] || (rang[0] === meilleur.rang[0] && rang[1] < meilleur.rang[1])) {
          meilleur = { r, rang };
        }
      }
    }
    const trouve = meilleur?.r ?? null;
    deja.set(cle, trouve);
    return trouve;
  };
}

// Un seul résultat par match — une nouvelle saisie sur le même match corrige
// l'ancienne plutôt que de la dupliquer (ex. score corrigé après coup).
export function recordMatchResult({ matchId, homeName, awayName, league, homeGoals, awayGoals }) {
  const results = readResults();
  const now = new Date().toISOString();
  const existing = results.find((r) => r.matchId === matchId);
  if (existing) {
    existing.homeGoals = homeGoals;
    existing.awayGoals = awayGoals;
    existing.homeScore = homeGoals;
    existing.awayScore = awayGoals;
    existing.settledAt = now;
    writeResults(results);
    return withNeutralScoreFields(existing);
  }

  const entry = {
    id: crypto.randomUUID(),
    matchId,
    homeName,
    awayName,
    league: league ?? null,
    homeGoals,
    awayGoals,
    homeScore: homeGoals,
    awayScore: awayGoals,
    settledAt: now
  };
  results.push(entry);
  writeResults(results);
  return entry;
}

/**
 * Résultats locaux impliquant une équipe (nom insensible à la casse), sous
 * l'angle "buts marqués / buts encaissés" de CETTE équipe — sert à enrichir
 * les moyennes de buts (cf. matchEnrichment.js) avec les vrais scores que
 * l'utilisateur a lui-même saisis via "Score final", en plus des statistiques
 * API-Football (qui, sur le plan gratuit, ne couvrent pas les saisons
 * récentes — cf. limites documentées du plan).
 */
export function getResultsForTeam(teamName) {
  const normalized = teamName.trim().toLowerCase();
  // Lecture seule, pour enrichir des moyennes : un fichier illisible ne doit
  // pas faire échouer l'analyse d'un match, seulement la priver de ce complément.
  let resultats;
  try {
    resultats = readResults();
  } catch (error) {
    console.warn(`[résultats] illisibles, moyennes sans les scores saisis : ${error.message}`);
    return [];
  }
  return resultats
    .filter((r) => r.homeName.toLowerCase() === normalized || r.awayName.toLowerCase() === normalized)
    .map((r) => {
      const isHome = r.homeName.toLowerCase() === normalized;
      // La date sert a NE PAS recompter une rencontre que le magasin
      // connait deja : les deux sources sont alimentees par le meme import.
      // Aucune des 38 354 entrees ne porte de champ `date` — elle est dans
      // l'identifiant, sous la forme `<prefixe>-AAAA-MM-JJ-<equipes>`. On l'y
      // lit plutot que d'ajouter un champ que les entrees existantes
      // n'auraient pas.
      return {
        matchId: r.matchId,
        league: r.league ?? null,
        date: r.date ?? /(\d{4}-\d{2}-\d{2})/.exec(r.matchId ?? '')?.[1] ?? null,
        isHome,
        goalsFor: isHome ? r.homeGoals : r.awayGoals,
        goalsAgainst: isHome ? r.awayGoals : r.homeGoals
      };
    });
}
