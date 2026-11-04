/**
 * controleDesJoueurs.js — LE CONTRÔLE ANTI-FUITE DE LA NUIT DES JOUEURS (étape 34 du plan, lot 1b, 03/11/2026).
 * -----------------------------------------------------------------------
 * Le patron des contrôles de nuit (table du jour J, forces de buts, fiches des joueurs, contexte, cartons) : `couples`
 * (rencontre, camp) tirés avec la graine du jour parmi les rencontres jouées des 365 derniers jours ; dans chacun, un
 * titulaire identifié qui a joué (tiré lui aussi) : le couple (joueur, jour J). Pour chacun, ce que la passe des joueurs
 * SAVAIT au jour J (l'état du joueur relevé AVANT que la journée J soit publiée) face à un SECOND CHEMIN qui relit les
 * tables sources PAR LE JOUEUR (players × day_matches × team_day × matches × team_stats, ses identifiants fusionnés), sans
 * le flux chronologique ni l'accumulateur (critique de l'étape 34, constat 12 : la COMPOSITION des sommes) :
 *   - ses apparitions d'un jour STRICTEMENT antérieur (nombre, dernier jour) — une fuite se voit d'abord par les DATES ;
 *   - ses minutes de titulaire et d'entrant, amorties ;
 *   - ses sommes amorties de xG hors penalty, de penalties (par club), de tirs cadrés et d'xA, recomptées avec les seules
 *     RÈGLES pures (relevesDUnCamp, la règle P) ; l'averti n'est pas recompté (il dépend du statut des cartons de la 33).
 * Égalité exacte des comptes, 1e-9 en relatif pour les sommes ; chaque écart est nommé, avec sa phrase (`texte`, dite telle
 * quelle à l'écran : ui/src/utils/controlesAntiFuite.js). Lecture seule, sur la base de l'appelant. Aucune horloge.
 * -----------------------------------------------------------------------
 */

import { NUIT, DEMI_VIES, SIGNAUX, MINUTES_MAX } from './reglagesJoueurs.js';
import { relevesDUnCamp, amortissement, nombre } from './formulesDesJoueurs.js';
import { ligneNormalisee, derouleNormalise, numeroApresFusion } from './lectureDesJoueurs.js';

const JOUR_MS = 86_400_000;
const jourMoins = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) - n * JOUR_MS).toISOString().slice(0, 10);
const jourDit = (j) => (typeof j === 'string' && /^\d{4}-\d{2}-\d{2}/.test(j) ? `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}` : String(j ?? '?'));
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const apparitionsDites = (n) => (n === 0 ? 'aucune apparition' : n === 1 ? '1 apparition' : `${n.toLocaleString('fr-FR')} apparitions`);
/** Les signaux recomptés par le second chemin (l'averti dépend des cartons de la 33 : non recompté). */
export const SIGNAUX_CONTROLES = Object.freeze(['np', 'pen', 'sot', 'xa']);
const IDX = Object.freeze(Object.fromEntries(SIGNAUX.map((s, i) => [s, i])));

/** Le hasard semé du contrôle (mulberry32, comme les autres contrôles de nuit). */
function tirage(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Les couples recontrôlés : `nombre` (rencontre, camp) tirés avec `graine` parmi les rencontres jouées (non attribuées,
 * non prolongées) des `jours` jours d'avant `jourD`, et dans chacun un titulaire identifié qui a joué. Rend
 * [{ matchKey, J, camp, joueur }] triés par (J, clé, camp).
 */
export function tirerLesCouples({ database, jourD, graine, nombre: n = NUIT.couples, jours = NUIT.joursDuControle, parFusion = new Map() }) {
  if (graine === null || graine === undefined || !n) return [];
  const lignes = database
    .prepare('SELECT d.match_key, d.date FROM day_matches d JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1 WHERE d.date >= ? AND d.date < ? AND t.attribue = 0 AND t.prolongation = 0 ORDER BY d.date, d.match_key')
    .all(jourMoins(jourD, jours), jourD);
  if (!lignes.length) return [];
  const titulaires = database.prepare("SELECT player_id FROM players WHERE match_key = ? AND side = ? AND starter = 1 AND minutes > 0 AND player_id IS NOT NULL ORDER BY ord, player_key");
  const hasard = tirage(graine);
  const choisis = new Map();
  for (let essai = 0; essai < n * 20 && choisis.size < n; essai++) {
    const l = lignes[Math.floor(hasard() * lignes.length)];
    const camp = hasard() < 0.5 ? 'home' : 'away';
    const ids = titulaires
      .all(l.match_key, camp)
      .map((x) => numeroApresFusion(x.player_id, parFusion))
      .filter((x) => Number.isSafeInteger(x) && x > 0);
    if (!ids.length) continue;
    const joueur = ids[Math.floor(hasard() * ids.length)];
    choisis.set(`${l.match_key}|${camp}`, { matchKey: l.match_key, J: l.date, camp, joueur });
  }
  return [...choisis.values()].sort((a, b) => (a.J < b.J ? -1 : a.J > b.J ? 1 : a.matchKey < b.matchKey ? -1 : a.matchKey > b.matchKey ? 1 : a.camp < b.camp ? -1 : 1));
}

/** CE QUE LA PASSE SAVAIT au jour J d'un joueur (appelé AVANT la publication de la journée J) : l'état de l'accumulateur. */
export function instantaneDeLaPasse(acc, couple) {
  const e = acc.etatDuJoueur(couple.joueur);
  if (!e) return { apparitions: 0, derniere: null, tit: [0, 0], entre: [0, 0], X: [0, 0, 0, 0, 0], E: [0, 0, 0, 0, 0] };
  return { apparitions: e.apparitions, derniere: e.derniere, tit: e.tit, entre: e.entre, X: e.X, E: e.E };
}

const SQL_APPARITIONS = (n) => `SELECT d.match_key, d.date, d.home, d.away, h.attribue, h.prolongation, h.bp, h.bc,
  m.home_goals, m.away_goals, m.events, p.side, sh.shots_on_goal AS cadres_dom, sa.shots_on_goal AS cadres_ext
  FROM players p JOIN day_matches d ON d.match_key = p.match_key
  JOIN team_day h ON h.rencontre = d.rencontre AND h.camp = 1
  LEFT JOIN matches m ON m.match_key = d.match_key
  LEFT JOIN team_stats sh ON sh.match_key = d.match_key AND sh.side = 'home'
  LEFT JOIN team_stats sa ON sa.match_key = d.match_key AND sa.side = 'away'
  WHERE p.player_id IN (${new Array(n).fill('?').join(', ')}) AND d.date < ?
  ORDER BY d.date, d.match_key`;

/**
 * LE SECOND CHEMIN pour un joueur avant le jour J : ses apparitions relues par son identifiant (et ceux qui y sont
 * fusionnés), puis ses sommes recomptées avec les règles pures, dans l'ordre (jour, clé). Rend la même forme que
 * l'instantané, et `cles` (les rencontres comptées).
 */
export function secondChemin({ database, joueur, J, parFusion = new Map(), demiVies = DEMI_VIES }) {
  const brut = [`fotmob-${joueur}`, ...[...parFusion.entries()].filter(([, vers]) => numeroApresFusion(vers, null) === joueur).map(([de]) => de)];
  const ids = [...new Set(brut)];
  const lignes = database.prepare(SQL_APPARITIONS(ids.length)).all(...ids, J);
  const feuille = database.prepare('SELECT player_id, position, starter, subbed_in, minutes, xg, xg_non_penalty, shots_on_target, assists, xa, rating, touches, passes FROM players WHERE match_key = ? AND side = ? ORDER BY ord, player_key');
  const delta = Object.fromEntries(Object.entries(demiVies).map(([k, h]) => [k, amortissement(h)]));
  const out = { apparitions: 0, derniere: null, tit: [0, 0], entre: [0, 0], X: [0, 0, 0, 0, 0], E: [0, 0, 0, 0, 0], cles: [] };
  let penClub = null;
  const vus = new Set();
  for (const l of lignes) {
    if (vus.has(l.match_key)) continue;
    vus.add(l.match_key);
    if (nombre(l.home_goals) === null || nombre(l.away_goals) === null) continue;
    if (Number(l.attribue) || Number(l.prolongation)) continue;
    const camp = l.side === 'home' ? 'home' : 'away';
    const lignesDuCamp = feuille.all(l.match_key, camp).map((p) => ligneNormalisee(p, parFusion));
    const moi = lignesDuCamp.find((x) => x.id === joueur);
    const min = moi ? nombre(moi.minutes) : null;
    if (!moi || !(min > 0)) continue;
    const club = Number(camp === 'home' ? l.home : l.away);
    const rel = relevesDUnCamp({ lignes: lignesDuCamp, evenements: derouleNormalise(l.events, parFusion), camp, butsDuCamp: camp === 'home' ? l.bp : l.bc, cadresDEquipe: camp === 'home' ? l.cadres_dom : l.cadres_ext, cartonsReleves: false });
    const pj = rel.parJoueur.get(joueur);
    const m = Math.min(MINUTES_MAX, min);
    if (penClub !== club) {
      out.X[IDX.pen] = 0;
      out.E[IDX.pen] = 0;
      penClub = club;
    }
    for (const s of SIGNAUX_CONTROLES) {
      const i = IDX[s];
      const t = rel.totaux[s];
      const x = pj.x[s];
      if (t === null || x === null) continue;
      out.X[i] = delta[s] * out.X[i] + x;
      out.E[i] = delta[s] * out.E[i] + (t * m) / MINUTES_MAX;
    }
    if (moi.titulaire) out.tit = [delta.minutes * out.tit[0] + m, delta.minutes * out.tit[1] + 1];
    else out.entre = [delta.entree * out.entre[0] + m, delta.entree * out.entre[1] + 1];
    out.apparitions += 1;
    out.derniere = l.date;
    out.cles.push(l.match_key);
  }
  return out;
}

const egal = (a, b) => (fini(a) && fini(b) ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)) : a === b);

/**
 * LA COMPARAISON des instantanés de la passe avec le second chemin : `instantanes` [{ couple, passe }]. Rend { couples,
 * lignes (couples recalculés), ecarts: [{ joueur, J, matchKey, colonne, passe, second, texte }] }.
 */
export function controlerLesInstantanes({ database, instantanes, parFusion = new Map() }) {
  const ecarts = [];
  let lignes = 0;
  for (const { couple, passe } of instantanes) {
    const s = secondChemin({ database, joueur: couple.joueur, J: couple.J, parFusion });
    lignes += 1;
    const ecart = (colonne, a, b, texte) => ecarts.push({ joueur: couple.joueur, J: couple.J, matchKey: couple.matchKey, colonne, passe: a, second: b, texte });
    if (passe.apparitions !== s.apparitions) ecart('apparitions', passe.apparitions, s.apparitions, `joueur n° ${couple.joueur} avant le ${jourDit(couple.J)} : ${apparitionsDites(passe.apparitions)} dans la passe, ${apparitionsDites(s.apparitions)} dans le magasin relu`);
    if ((passe.derniere ?? null) !== (s.derniere ?? null)) ecart('derniere', passe.derniere, s.derniere, `joueur n° ${couple.joueur} avant le ${jourDit(couple.J)} : dernière apparition ${passe.derniere ? `le ${jourDit(passe.derniere)}` : 'aucune'} dans la passe, ${s.derniere ? `le ${jourDit(s.derniere)}` : 'aucune'} dans le magasin relu${passe.derniere && passe.derniere >= couple.J ? ' — un jour qui n’est pas d’avant le match' : ''}`);
    for (const [k, nom] of [['tit', 'minutes de titulaire'], ['entre', 'minutes d’entrant']]) {
      if (!egal(passe[k][0], s[k][0]) || !egal(passe[k][1], s[k][1])) ecart(k, passe[k], s[k], `joueur n° ${couple.joueur} avant le ${jourDit(couple.J)} : ${nom} différentes entre la passe et le magasin relu`);
    }
    for (const sig of SIGNAUX_CONTROLES) {
      const i = IDX[sig];
      if (!egal(passe.X[i], s.X[i]) || !egal(passe.E[i], s.E[i])) ecart(sig, [passe.X[i], passe.E[i]], [s.X[i], s.E[i]], `joueur n° ${couple.joueur} avant le ${jourDit(couple.J)} : somme « ${sig} » différente entre la passe et le magasin relu`);
    }
  }
  return { couples: instantanes.length, lignes, ecarts };
}
