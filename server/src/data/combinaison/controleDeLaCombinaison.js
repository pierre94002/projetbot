/**
 * controleDeLaCombinaison.js — LE CONTRÔLE ANTI-FUITE DE LA NUIT DE LA COMBINAISON, PAR UN SECOND CHEMIN (étape 38, lot 1b,
 * 04/11/2026 ; conception §5.4, critique, constat 7, T-F10 élargi).
 * -----------------------------------------------------------------------
 * Chaque nuit, 20 couples (rencontre payante, heure `odds_at` d'un pronostic 1N2 gelé) tirés avec la graine du jour. Pour
 * chacun, le palier de la cote juste est refait AUTREMENT que par la nuit :
 *   - la nuit (chemin principal) : tous les relevés de la rencontre, filtrés en JavaScript (relevé ≤ odds_at), le dernier
 *     par bookmaker et par issue, puis fairFromBookmakers (ingredientsDUneLigne.palierDesReleves) ;
 *   - le second chemin : les relevés filtrés PAR LA BASE (`releve_at <= odds_at` dans la requête), rangés par heure, puis
 *     `referenceDuMatch` du moteur (verdictPari.js) sur ces cotes — son `basis` et ses probabilités ;
 * et les deux doivent dire la même chose. Un écart veut dire que la nuit a pu voir une cote relevée APRÈS le pronostic :
 * l'écart est nommé (sa phrase), l'étape est en échec, rien n'est rangé cette nuit-là, l'alerte durable le dit.
 * Lit la base de l'appelant (jamais ouverte ici) ; jamais une clôture ni un résultat ; n'écrit rien ; ni horloge (l'instant
 * vient de l'appelant) ; le tirage est semé (graine = le jour de la nuit, AAAAMMJJ).
 * -----------------------------------------------------------------------
 */

import { referenceDuMatch } from '../../core/engine/verdictPari.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/** Un tirage semé (mulberry32) : la même graine, les mêmes couples. */
export function tirageSeme(graine) {
  let a = (Number(graine) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** L'ancre d'un `basis` du moteur : 'pinnacle', 'palier2', 'palier3', ou 'repli' sans référence. */
export const ancreDuBasis = (basis) => (basis === 'Pinnacle' ? 'pinnacle' : basis === 'palier 2' ? 'palier2' : basis ? 'palier3' : 'repli');

/**
 * LE SECOND CHEMIN : les relevés 1x2 « snapshot » de la rencontre payante (identifiants FotMob + jour) filtrés PAR LA BASE
 * (releve_at ≤ odds_at), le plus récent par bookmaker et par issue (ordre de la requête), puis referenceDuMatch.
 * Rend { ancre, basis, probabilites, livres }.
 */
export function palierParLaBase(database, { homeId, awayId, date, oddsAt, config = {} }) {
  const lignes = database
    .prepare(
      `SELECT q.bookmaker AS bookmaker, q.selection AS selection, q.price AS price FROM odds_events e JOIN odds_quotes q ON q.event_id = e.id
       WHERE e.source = 'odds-api' AND e.home_id = ? AND e.away_id = ? AND e.date = ? AND q.market = '1x2' AND q.kind = 'snapshot' AND q.releve_at <= ?
       ORDER BY q.releve_at ASC, q.bookmaker ASC, q.selection ASC`
    )
    .all(homeId, awayId, date, oddsAt);
  const parLivre = new Map();
  for (const l of lignes) {
    const b = parLivre.get(l.bookmaker) ?? {};
    b[l.selection] = l.price;
    parLivre.set(l.bookmaker, b);
  }
  const byBookmaker = [];
  for (const [key, b] of parLivre) if (fini(b.home) && fini(b.draw) && fini(b.away)) byBookmaker.push({ key, title: key, odds1: b.home, oddsDraw: b.draw, odds2: b.away });
  if (!byBookmaker.length) return { ancre: 'repli', basis: null, probabilites: null, livres: 0 };
  const premier = byBookmaker[0];
  const { reference } = referenceDuMatch({ marketOdds: { odds1: premier.odds1, oddsDraw: premier.oddsDraw, odds2: premier.odds2, byBookmaker } }, config);
  return { ancre: ancreDuBasis(reference?.basis ?? null), basis: reference?.basis ?? null, probabilites: reference ? [...reference.probabilities] : null, livres: reference ? reference.keys.length : 0 };
}

const memesProbabilites = (a, b) => (a === null && b === null) || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-9));

/**
 * LE CONTRÔLE : `pool` = les couples candidats [{ homeId, awayId, date, oddsAt, cle }] (sans doublon), `principal(couple)` =
 * le palier de la NUIT pour ce couple ({ ancre, basis, probabilites }) ; `couples` tirés avec la graine. Rend { lignes,
 * couples, ecarts: [{ cle, homeId, awayId, date, oddsAt, colonne, nuit, second, texte }] }.
 */
export function controlerLesPaliers(database, { pool, principal, graine, couples = 20, config = {} }) {
  const uniques = [];
  const vus = new Set();
  for (const c of pool ?? []) {
    const k = `${c.homeId}|${c.awayId}|${c.date}|${c.oddsAt}`;
    if (vus.has(k) || !c.homeId || !c.awayId || !c.oddsAt) continue;
    vus.add(k);
    uniques.push(c);
  }
  uniques.sort((a, b) => (a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : a.oddsAt < b.oddsAt ? -1 : a.oddsAt > b.oddsAt ? 1 : 0));
  const tirer = tirageSeme(graine);
  const choisis = [];
  const restants = [...uniques];
  while (choisis.length < couples && restants.length) choisis.push(restants.splice(Math.floor(tirer() * restants.length), 1)[0]);
  const ecarts = [];
  for (const c of choisis) {
    const a = principal(c);
    const b = palierParLaBase(database, { ...c, config });
    const dit = `${c.homeId} – ${c.awayId} du ${c.date} (cotes du pronostic : ${c.oddsAt})`;
    if (a.ancre !== b.ancre || (a.basis ?? null) !== (b.basis ?? null)) {
      ecarts.push({ cle: c.cle, homeId: c.homeId, awayId: c.awayId, date: c.date, oddsAt: c.oddsAt, colonne: 'palier', nuit: a.basis ?? a.ancre, second: b.basis ?? b.ancre, texte: `${dit} : palier « ${a.basis ?? a.ancre} » la nuit, « ${b.basis ?? b.ancre} » par les relevés d’avant le pronostic` });
    } else if (!memesProbabilites(a.probabilites ?? null, b.probabilites ?? null)) {
      ecarts.push({ cle: c.cle, homeId: c.homeId, awayId: c.awayId, date: c.date, oddsAt: c.oddsAt, colonne: 'probabilites', nuit: a.probabilites, second: b.probabilites, texte: `${dit} : la cote juste de la nuit n’est pas celle des relevés d’avant le pronostic` });
    }
  }
  return { lignes: uniques.length, couples: choisis.length, ecarts };
}
