import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { teamNamesLikelyMatch } from '../../utils/teamNameMatch.js';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE_PATH = path.resolve(__dirname, '../../../data/runtime/match-ai-analyses.json');

// Cache invalidé par date de modification (même principe que
// matchResultsRepository.js), réaligné après chaque écriture : l'analyse
// automatique enchaîne jusqu'à 50 enregistrements par passe, et relire à
// chaque fois le fichier qu'on vient d'écrire tombait pendant qu'OneDrive
// l'envoyait. Il n'est plus rouvert que s'il a changé ailleurs.
let cache = { mtimeMs: undefined, entries: null };

function currentMtimeMs() {
  try {
    return fs.statSync(FILE_PATH).mtimeMs;
  } catch {
    return null; // Fichier absent : état légitime, liste vide.
  }
}

// Illisible = erreur, jamais liste vide : l'enregistrement suivant aurait
// réécrit le fichier avec cette seule analyse (cf. utils/atomicJson.js).
function readAll() {
  const mtimeMs = currentMtimeMs();
  if (cache.entries && cache.mtimeMs === mtimeMs) return cache.entries;
  cache = { mtimeMs, entries: readJsonFile(FILE_PATH, []) };
  return cache.entries;
}

// Les appelants modifient une COPIE de la liste : si l'écriture échoue, le
// cache reste identique au fichier, qui n'a pas bougé.
function writeAll(entries) {
  writeJsonAtomic(FILE_PATH, entries);
  cache = { mtimeMs: currentMtimeMs(), entries };
}

export function getByMatchId(matchId) {
  return readAll().find((e) => e.matchId === matchId) ?? null;
}

// Sert uniquement à savoir QUELS matchs ont une analyse (badge dans les listes
// Matchs/Historique moteur) — un seul appel plutôt qu'un par matchId visible.
export function listAll() {
  return readAll();
}

/**
 * Retrouve une analyse avant-match par équipes (+ jour si connu), pour
 * l'analyse après-match AUTOMATIQUE : les candidats viennent de la base
 * FotMob (match_key), jamais du matchId Odds API/calendrier sous lequel
 * l'analyse avant-match a été enregistrée — comparer les deux identifiants ne
 * donne jamais rien. `day` (YYYY-MM-DD) écarte l'aller/retour de la même
 * affiche dans une même compétition ; sans lui (analyses enregistrées avant
 * l'ajout de `commenceTime`), équipes + championnat suffisent la plupart du
 * temps.
 */
export function findPreMatchAnalysisByTeams({ homeName, awayName, league, day = null }) {
  return (
    readAll().find((e) => {
      if (e.postMatchReview) return false;
      if (!teamNamesLikelyMatch(e.homeName, homeName) || !teamNamesLikelyMatch(e.awayName, awayName)) return false;
      if (league && e.league && e.league !== league) return false;
      // À un jour près : le coup d'envoi exact (UTC) d'un match du soir peut
      // tomber la veille ou le lendemain du jour noté par le magasin.
      if (day && e.commenceTime) return Math.abs(Date.parse(e.commenceTime.slice(0, 10)) - Date.parse(day)) <= JOUR_MS;
      return true;
    }) ?? null
  );
}

const JOUR_MS = 86_400_000;

/** Les types de marché, dans l'ordre de l'écran, et leur nom pour Pierre (repris par le carnet de l'IA, étape 21). */
export const TYPES_DE_MARCHE = {
  result: 'Résultat',
  totalGoals: 'Total buts',
  bothTeamsScore: 'Les 2 équipes marquent',
  resultAndTotal: 'Résultat + Total buts',
  teamGoals: "Buts d'une équipe",
  totalCorners: 'Total corners',
  teamCorners: "Corners d'une équipe",
  totalShots: 'Total tirs',
  teamShots: "Tirs d'une équipe",
  totalShotsOnTarget: 'Total tirs cadrés',
  teamShotsOnTarget: "Tirs cadrés d'une équipe"
};

/** Préfixes des marchés « par équipe » (le plus long d'abord : « Tirs cadrés — » avant « Tirs — »). */
const PREFIXES_PAR_EQUIPE = [
  ['Tirs cadrés — ', 'teamShotsOnTarget'],
  ['Corners — ', 'teamCorners'],
  ['Tirs — ', 'teamShots'],
  ['Buts — ', 'teamGoals']
];

/** Type d'un marché : son identifiant structuré, ou à défaut son libellé (« Buts — X » regroupés). */
export function typeDeMarche(revue) {
  if (revue.marketId && TYPES_DE_MARCHE[revue.marketId]) return revue.marketId;
  const libelle = String(revue.market ?? '');
  const parEquipe = PREFIXES_PAR_EQUIPE.find(([prefixe]) => libelle.startsWith(prefixe));
  if (parEquipe) return parEquipe[1];
  return Object.keys(TYPES_DE_MARCHE).find((k) => TYPES_DE_MARCHE[k] === revue.market) ?? null;
}

/**
 * LA RÈGLE DE L'AVIS TENU, écrite une seule fois (étape 21 : la revue d'après-match, issuesDesMarches, et le
 * carnet de l'IA, data/aiScorecard.js, s'en servent) : confirmer un pronostic qui s'est réalisé, ou contredire
 * un pronostic qui ne s'est pas réalisé, c'est avoir eu raison. Un avis « nuance » n'est jamais compté (null),
 * ni un avis absent, ni un pronostic dont l'issue n'est pas connue (`juste` ni vrai ni faux).
 * @returns {boolean|null}
 */
export function avisTenu(verdict, juste) {
  if (juste !== true && juste !== false) return null;
  if (verdict === 'confirme') return juste;
  if (verdict === 'contredit') return !juste;
  return null;
}

/** Le bilan vide d'un type de marché, à la forme de aiMarketExperience (mêmes clés, même ordre). */
export function bilanVide(marketType) {
  return { marketType, label: TYPES_DE_MARCHE[marketType] ?? marketType, matches: 0, engineRight: 0, aiVerdicts: 0, aiRight: 0, byConfidence: {} };
}

/**
 * Ajoute UN pronostic jugé à un bilan : l'issue du pronostic du moteur (« juste » / « faux », sinon rien) et,
 * si l'avis de l'IA est compté (`aiWasRight` vrai ou faux), sa tenue, en tout et par confiance annoncée.
 * Les mêmes comptes pour l'expérience redonnée à l'IA et pour son carnet (étape 21) : jamais deux façons de compter.
 */
export function compterAuBilan(t, { outcome, aiWasRight, aiConfidence }) {
  if (outcome === 'juste' || outcome === 'faux') {
    t.matches++;
    if (outcome === 'juste') t.engineRight++;
  }
  if (aiWasRight === true || aiWasRight === false) {
    t.aiVerdicts++;
    if (aiWasRight) t.aiRight++;
    if (aiConfidence) {
      const c = (t.byConfidence[aiConfidence] ??= { verdicts: 0, right: 0 });
      c.verdicts++;
      if (aiWasRight) c.right++;
    }
  }
  return t;
}

/**
 * L'EXPÉRIENCE de l'IA, par type de marché, tirée de ses revues après-match :
 * combien de pronostics du moteur elle a vus tomber justes ; combien de ses
 * avis d'avant-match (confirmer ou contredire) ont tenu, en tout et par niveau
 * de confiance annoncé ; ses dernières leçons. Redonnée à l'IA avant chaque
 * nouveau match pour qu'elle calibre sa confiance, et affichée pour jauger
 * chaque marché. Jamais transmise au moteur chiffré.
 *
 * Seuls comptent les pronostics choisis sous la cote minimale (`minOdds`,
 * cf. sports/football/markets.js) : avant elle, « Plus de 0.5 buts » à 1,05
 * tombait juste 94 fois sur 100 et aurait faussé chaque bilan.
 *
 * Étape 21 (14/10/2026) : le CARNET DE L'IA (data/aiScorecard.js) étend ce
 * bilan — championnat, valeur de clôture, comparaison au moteur seul, rattachement
 * par identifiants FotMob et règlement du banc d'essai — avec les mêmes comptes
 * (bilanVide, compterAuBilan, avisTenu). Ce bilan-ci, redonné à l'IA dans les
 * deux formes de la fiche, ne change pas (l'ancienne forme revient à l'octet).
 */
export function aiMarketExperience({ lessonsPerType = 3 } = {}) {
  const revues = readAll()
    .filter((e) => e.postMatchReview?.marketReviews?.length)
    .sort((a, b) => String(b.postMatchReview.createdAt ?? '').localeCompare(String(a.postMatchReview.createdAt ?? '')));
  const parType = new Map();
  for (const e of revues) {
    for (const r of e.postMatchReview.marketReviews) {
      const type = typeDeMarche(r);
      if (!type || !r.minOdds) continue;
      if (!parType.has(type)) {
        parType.set(type, { ...bilanVide(type), recentLessons: [] });
      }
      const t = parType.get(type);
      compterAuBilan(t, r);
      if (r.lesson && t.recentLessons.length < lessonsPerType) {
        t.recentLessons.push({ match: `${e.homeName} - ${e.awayName}`, pick: r.pick ?? null, outcome: r.outcome ?? null, aiVerdict: r.aiVerdict ?? null, lesson: r.lesson });
      }
    }
  }
  return Object.keys(TYPES_DE_MARCHE).filter((k) => parType.has(k)).map((k) => parType.get(k));
}

/**
 * L'analyse (avant ET après-match) d'une rencontre vue depuis la page de
 * match, qui ne connaît que les équipes, la compétition et la date : l'analyse
 * est rangée sous l'identifiant de cotes, jamais sous celui du magasin FotMob.
 * Coup d'envoi connu : à un jour près (fuseaux). Sinon (analyses antérieures à
 * l'ajout de `commenceTime`), le match suit l'analyse de quelques jours à
 * quelques semaines ; la même affiche dans le même sens ne revient pas dans
 * ce délai. La plus proche l'emporte.
 */
export function findAnalysisForFixture({ homeName, awayName, league = null, date }) {
  const jour = Date.parse(String(date ?? '').slice(0, 10));
  if (!Number.isFinite(jour)) return null;
  let meilleur = null;
  for (const e of readAll()) {
    if (!teamNamesLikelyMatch(e.homeName, homeName) || !teamNamesLikelyMatch(e.awayName, awayName)) continue;
    if (league && e.league && e.league !== league) continue;
    let ecart;
    if (e.commenceTime) {
      ecart = Math.abs(Date.parse(e.commenceTime.slice(0, 10)) - jour) / JOUR_MS;
      if (!(ecart <= 1)) continue;
    } else {
      const avance = (jour - Date.parse(String(e.createdAt ?? '').slice(0, 10))) / JOUR_MS;
      if (!(avance >= -1 && avance <= 30)) continue;
      ecart = Math.abs(avance);
    }
    if (!meilleur || ecart < meilleur.ecart) meilleur = { e, ecart };
  }
  return meilleur?.e ?? null;
}

// Un seul enregistrement par match : une nouvelle analyse avant-match sur le
// même matchId remplace la précédente plutôt que d'empiler des doublons
// (cohérent avec matchResultsRepository.js). `postMatchReview` n'est jamais
// touché ici — seul savePostMatchReview l'ajoute, à l'étape suivante du cycle.
export function savePreMatchAnalysis(entry) {
  const entries = [...readAll()];
  const now = new Date().toISOString();
  const i = entries.findIndex((e) => e.matchId === entry.matchId);
  const existing = i === -1 ? null : entries[i];
  const saved = { ...existing, ...entry, updatedAt: now, createdAt: existing?.createdAt ?? now };
  if (i === -1) entries.push(saved);
  else entries[i] = saved;
  writeAll(entries);
  return saved;
}

// Nécessite une analyse avant-match déjà enregistrée pour ce match — c'est au
// service (matchAiAnalysisService.js) de vérifier ça et de renvoyer une
// erreur utilisateur claire ; ce repository ne fait qu'écrire.
export function savePostMatchReview(matchId, review) {
  const entries = [...readAll()];
  const i = entries.findIndex((e) => e.matchId === matchId);
  if (i === -1) return null;
  entries[i] = { ...entries[i], postMatchReview: review, updatedAt: new Date().toISOString() };
  writeAll(entries);
  return entries[i];
}
