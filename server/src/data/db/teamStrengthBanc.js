/**
 * teamStrengthBanc.js — L'INDICE DE FORCE AU BANC (étape 29 du plan, 14/10/2026).
 * -----------------------------------------------------------------------
 * Une seule question : l'indice de force annonce-t-il les matchs SUIVANTS mieux que le classement corrigé
 * par les xG (04/10/2026, expectedPoints.js) tel qu'il était la veille de chaque match ? Et mieux que le
 * classement réel ? Un indice qui ne les bat pas le dit tel quel.
 *
 * LES LIGNES : les matchs de championnat du magasin (comptés au classement, ni coupe, ni attribués, ni
 * prolongés) dont les deux clubs sont de ce championnat ce jour-là, avec au moins 6 matchs dans l'indice
 * (le minimum du moteur) et, pour la comparaison, au moins 6 matchs dans le classement de comparaison de la
 * saison (6 avec des xG pour le classement corrigé xG). Chaque prédicteur donne un ÉCART entre les deux
 * clubs, la veille du match, sans rien du jour même :
 *   - le classement corrigé xG : points attendus par match du club qui reçoit − ceux du visiteur, sur la
 *     saison jusqu'à la veille (les tirs rejoués quand la carte est complète, sinon le xG de l'équipe :
 *     pointsAttendusDuMatch, la règle du tableau) ;
 *   - le classement réel : points par match, de même ;
 *   - l'indice : la note du club qui reçoit − celle du visiteur (Σ poids × écarts corrigés) ;
 * puis un LIEN « écart → probabilités du 1N2 » (logit ordonné : deux seuils et une pente, la même forme pour
 * tous) appris sur P4a. La mesure : la perte log du résultat à la 90e minute, jugée par le juge de l'étape 16
 * (comparer, sens « min », un bloc par match), sa fourchette élargie pour le nombre de comparaisons jugées.
 *
 * LES PÉRIODES (vérifiées sur l'usage prévu par les étapes 18 et 19) : tout ce qui se choisit — les poids de
 * la note (une régression ridge de l'écart de buts sur les écarts des composantes) et les liens — s'APPREND
 * sur P4a (2024-07-01 → 2025-06-30), là où l'étape 18 a choisi les demi-vies du magasin ; la preuve se fait
 * sur P3 (2023-01-01 → 2024-06-30, le « magasin neuf »), que l'étape 18 n'a jamais lue comme cible ni
 * comme moitié, « gardée propre pour 27 et 29 ». Deux fenêtres déclarées la recouvrent par les dates — la
 * règle de pari du 23/09 (07/2023 → 06/2024 : le choix du livre de référence, rien de la force des
 * équipes) et le jugement football-data de l'étape 18 (P2 : ses demi-vies football-data, que l'indice ne
 * lit pas) — : elles sont comptées et dites, sans changer la nature de la preuve, comme le banc de l'étape
 * 19 le fait pour P3. P4b et P5 (déjà vues) : les mêmes jugements, INDICATIFS.
 *
 * LES VARIANTES (toutes regardées, toutes comptées — declarerVariante au registre de l'étape 16) :
 *   indice-v1        la version retenue AVANT de regarder : correction des adversaires, demi-vies mesurées,
 *                    note « tous lieux » ;
 *   indice-dom-ext   la note à domicile du club qui reçoit face à celle à l'extérieur du visiteur ;
 *   sans-correction  l'itération 0 (le classement brut pondéré, sans la force des adversaires) ;
 *   demi-vie-18      l'idée de départ du plan : une demi-vie de 18 matchs pour toutes les statistiques.
 * Les comparaisons jugées sur P3 (le K du juge) : les quatre face au classement corrigé xG, indice-v1 face au
 * classement réel (tous les championnats, puis par formule — avec ou sans xG).
 *
 * Rien n'est écrit ici, sauf les variantes au registre (option `declarer`) ; le résumé est rangé par
 * l'appelant (scripts/team-strength.mjs : team_strength_state, clé « banc »).
 * -----------------------------------------------------------------------
 */

import { RejeuDeForce, rejouer, chargerLesRencontres, FORMULES, STATISTIQUES_INDICE, POIDS_DE_LA_NOTE, numeroDuJour, jourIso, VUES_DE_L_ETAPE_29 } from './teamStrength.js';
import { pointsAttendusDuMatch, compteAuClassementXg } from './expectedPoints.js';
import { isCup } from '../providers/leagueCups.js';
import { seasonOf } from '../providers/seasonWindows.js';
import { comparer } from '../../bench/guard.js';
import { perteLog, rps } from '../../bench/metrics.js';
import { BORNES_DES_TRANCHES } from '../../bench/periodes.js';
import { fenetresDeclarees, LANCEMENTS, VARIANTES_INDICE } from '../../bench/lancements.js';
import { declarerVariante, compterVariantes } from '../../bench/trialsRegistry.js';

/** Forme de la mesure : deux mesures de versions différentes ne se comparent pas. */
export const VERSION_BANC_INDICE = 1;
/** Les variantes de l'indice, toutes regardées (la retenue d'abord, choisie avant de regarder) : définies dans lancements.js. */
export { VARIANTES_INDICE };
/**
 * LE LANCEMENT de l'étape 29, déclaré dans LANCEMENTS (lancements.js) depuis le 19/10, daté du 14/10 (sa mise en
 * service chez Pierre) : ses vues — celles de l'étape 18, dont l'indice lit les demi-vies, puis les siennes —
 * portent la portée 'indice' : elles ne font passer « déjà vues » ni les lignes du moteur (banc, note de départ),
 * ni les jugements des étapes 18 et 22, seulement ceux de l'indice.
 */
export const LANCEMENT = LANCEMENTS.find((l) => l.etape === '29');

/** Les comparaisons jugées sur P3 : (prédicteur, référence, filtre). Leur nombre est le K du juge. */
export const COMPARAISONS = Object.freeze([
  Object.freeze({ id: 'v1-xg', variante: 'indice-v1', reference: 'xg', principale: true }),
  Object.freeze({ id: 'dom-ext-xg', variante: 'indice-dom-ext', reference: 'xg' }),
  Object.freeze({ id: 'sans-correction-xg', variante: 'sans-correction', reference: 'xg' }),
  Object.freeze({ id: 'demi-vie-18-xg', variante: 'demi-vie-18', reference: 'xg' }),
  Object.freeze({ id: 'v1-reel', variante: 'indice-v1', reference: 'reel' }),
  Object.freeze({ id: 'v1-reel-avec-xg', variante: 'indice-v1', reference: 'reel', formule: 'xg' }),
  Object.freeze({ id: 'v1-reel-sans-xg', variante: 'indice-v1', reference: 'reel', formule: 'sans-xg' })
]);

/** Les périodes : apprendre sur P4a, prouver sur P3, regarder P4b + P5 (indicatif). */
export const PERIODES_DU_BANC = Object.freeze({
  apprentissage: Object.freeze({ de: BORNES_DES_TRANCHES.P4a.de, a: BORNES_DES_TRANCHES.P4a.a, tranches: Object.freeze(['P4a']) }),
  preuve: Object.freeze({ de: BORNES_DES_TRANCHES.P3.de, a: BORNES_DES_TRANCHES.P3.a, tranches: Object.freeze(['P3']) }),
  indicatif: Object.freeze({ de: BORNES_DES_TRANCHES.P4b.de, a: null, tranches: Object.freeze(['P4b', 'P5']) })
});
/** Au moins 6 matchs dans l'indice et dans le classement de comparaison (le minimum du moteur, statInputsRead). */
export const MINIMUM_MATCHS = 6;
/** La régression ridge des poids : λ sur les composantes réduites (≈ 1 % de 10 000 lignes). */
export const LAMBDA_RIDGE = 100;

const IDX = Object.freeze(Object.fromEntries(STATISTIQUES_INDICE.map((s, i) => [s.id, i])));
const dans = (jour, p) => jour >= numeroDuJour(p.de) && (p.a === null || jour <= numeroDuJour(p.a));

// ======================================================= l'algèbre (pure)

/** Résout A x = b (A n × n, tableaux de tableaux) par élimination de Gauss avec pivot partiel. */
export function resoudreLineaire(A, b) {
  const n = b.length;
  const M = A.map((ligne, i) => [...ligne, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) throw new Error('système singulier');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((ligne, i) => ligne[n] / ligne[i]);
}

/**
 * LES POIDS DE LA NOTE : régression RIDGE de y (l'écart de buts du match, domicile − extérieur) sur les
 * colonnes de X (les écarts des composantes des deux clubs), composantes réduites (λ sur leur échelle),
 * avec une constante libre (l'avantage du terrain, en buts). Rend { constante, poids: { id: β } (unités
 * d'origine), n }.
 */
export function apprendrePoids(X, y, ids, { lambda = LAMBDA_RIDGE } = {}) {
  const n = y.length;
  const k = ids.length;
  if (n < k + 2) throw new Error(`apprendrePoids : trop peu de lignes (${n})`);
  const moy = new Array(k).fill(0);
  const ec = new Array(k).fill(0);
  for (const x of X) for (let j = 0; j < k; j++) moy[j] += x[j] / n;
  for (const x of X) for (let j = 0; j < k; j++) ec[j] += (x[j] - moy[j]) ** 2 / n;
  for (let j = 0; j < k; j++) ec[j] = Math.sqrt(ec[j]) || 1;
  const my = y.reduce((s, v) => s + v, 0) / n;
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    const z = X[i].map((v, j) => (v - moy[j]) / ec[j]);
    const r = y[i] - my;
    for (let j = 0; j < k; j++) {
      b[j] += z[j] * r;
      for (let l = 0; l < k; l++) A[j][l] += z[j] * z[l];
    }
  }
  for (let j = 0; j < k; j++) A[j][j] += lambda;
  const g = resoudreLineaire(A, b);
  const poids = {};
  let constante = my;
  for (let j = 0; j < k; j++) {
    poids[ids[j]] = g[j] / ec[j];
    constante -= poids[ids[j]] * moy[j];
  }
  return { constante, poids, n };
}

const sigmoide = (x) => 1 / (1 + Math.exp(-x));

/** Les probabilités [domicile, nul, extérieur] d'un écart s par un lien { s1, s2, pente } (logit ordonné). */
export function probabilitesDuLien(lien, s) {
  const pExt = sigmoide(lien.s1 - lien.pente * s);
  const pExtOuNul = sigmoide(lien.s2 - lien.pente * s);
  const ext = pExt;
  const nul = Math.max(0, pExtOuNul - pExt);
  const dom = Math.max(0, 1 - pExtOuNul);
  const t = dom + nul + ext;
  return [dom / t, nul / t, ext / t];
}

/**
 * LE LIEN « écart → 1N2 » : un logit ordonné (seuils s1 < s2, pente) appris par maximum de vraisemblance
 * (Newton, gradient exact, hessien par différences finies, pas réduit de moitié tant que la vraisemblance
 * baisse). `issues` : 0 domicile, 1 nul, 2 extérieur. Rend { s1, s2, pente, perteLog, n }.
 */
export function apprendreLien(ecarts, issues) {
  const n = ecarts.length;
  if (n < 50) throw new Error(`apprendreLien : trop peu de lignes (${n})`);
  const freq = [0, 0, 0];
  for (const o of issues) freq[o]++;
  const logit = (p) => Math.log(p / (1 - p));
  let th = [logit(Math.max(1e-3, freq[2] / n)), logit(Math.min(1 - 1e-3, (freq[2] + freq[1]) / n)), 1];
  const vrais = (t) => {
    let l = 0;
    for (let i = 0; i < n; i++) {
      const p = probabilitesDuLien({ s1: t[0], s2: t[1], pente: t[2] }, ecarts[i]);
      l += Math.log(Math.max(p[issues[i]], 1e-12));
    }
    return l;
  };
  const gradient = (t) => {
    const g = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const s = ecarts[i];
      const F1 = sigmoide(t[0] - t[2] * s);
      const F2 = sigmoide(t[1] - t[2] * s);
      const f1 = F1 * (1 - F1);
      const f2 = F2 * (1 - F2);
      const o = issues[i];
      if (o === 2) {
        // ln F1
        g[0] += f1 / F1;
        g[2] += (-s * f1) / F1;
      } else if (o === 1) {
        // ln (F2 − F1)
        const d = Math.max(F2 - F1, 1e-12);
        g[0] += -f1 / d;
        g[1] += f2 / d;
        g[2] += (-s * f2 + s * f1) / d;
      } else {
        // ln (1 − F2)
        const d = Math.max(1 - F2, 1e-12);
        g[1] += -f2 / d;
        g[2] += (s * f2) / d;
      }
    }
    return g;
  };
  let l = vrais(th);
  for (let iter = 0; iter < 100; iter++) {
    const g = gradient(th);
    const h = 1e-5;
    const H = [0, 1, 2].map((j) => {
      const t2 = [...th];
      t2[j] += h;
      const g2 = gradient(t2);
      return g2.map((x, k) => (x - g[k]) / h);
    });
    let pas;
    try {
      pas = resoudreLineaire(H.map((r) => r.map((x) => -x)), g);
    } catch {
      pas = g.map((x) => x * 1e-4);
    }
    let alpha = 1;
    let fait = false;
    for (let essai = 0; essai < 30; essai++) {
      const t2 = th.map((x, k) => x + alpha * pas[k]);
      if (t2[0] < t2[1]) {
        const l2 = vrais(t2);
        if (l2 >= l - 1e-12) {
          const gain = l2 - l;
          th = t2;
          l = l2;
          fait = true;
          if (gain < 1e-10) iter = 1000;
          break;
        }
      }
      alpha /= 2;
    }
    if (!fait) break;
  }
  return { s1: th[0], s2: th[1], pente: th[2], perteLog: -l / n, n };
}

// ======================================================= les classements de comparaison (la veille)

/**
 * Les classements de comparaison, match par match, LA VEILLE : pour chaque match de championnat du magasin
 * compté au classement corrigé xG (countsForTable, hors tapis vert), ses points attendus (pointsAttendusDuMatch)
 * et ses points réels ; puis, jour après jour, les cumuls de chaque club dans sa saison et son championnat
 * AVANT le jour (on lit, puis on ajoute). Rend Map clé → { xg: { dom, ext, nDom, nExt } | null, reel: {…} }
 * (par match, sur la saison jusqu'à la veille), et les comptes (méthodes, sans xG).
 */
export function* classementsDeLaVeille(database, { depuis = '2022-07-01' } = {}) {
  const lire = (t) => {
    try {
      return t ? JSON.parse(t) : null;
    } catch {
      return null;
    }
  };
  const matchs = [];
  const q = database.prepare(`SELECT m.match_key, m.date, m.league, m.home_id, m.away_id, m.home_goals AS hg, m.away_goals AS ag, m.meta, m.shotmap,
      th.expected_goals AS xh, ta.expected_goals AS xa
    FROM matches m
    LEFT JOIN team_stats th ON th.match_key = m.match_key AND th.side = 'home'
    LEFT JOIN team_stats ta ON ta.match_key = m.match_key AND ta.side = 'away'
    WHERE m.home_goals IS NOT NULL AND m.away_goals IS NOT NULL AND m.date >= ?`);
  const comptes = { matchs: 0, tirs: 0, poisson: 0, sansXg: 0, sansIdentifiant: 0 };
  let i = 0;
  for (const m of q.iterate(depuis)) {
    if (++i % 2000 === 0) yield 'classements : lecture';
    if (isCup(m.league)) continue;
    const meta = lire(m.meta);
    if (!compteAuClassementXg(meta)) continue;
    const id = (x) => {
      const r = /^fotmob-([1-9]\d*)$/.exec(String(x ?? ''));
      return r ? Number(r[1]) : null;
    };
    const dom = id(m.home_id);
    const ext = id(m.away_id);
    if (dom === null || ext === null) {
      comptes.sansIdentifiant++;
      continue;
    }
    const xp = pointsAttendusDuMatch({ xh: m.xh, xa: m.xa, shotmap: m.shotmap });
    comptes.matchs++;
    if (!xp) comptes.sansXg++;
    else comptes[xp.methode === 'tirs' ? 'tirs' : 'poisson']++;
    const pts = m.hg > m.ag ? [3, 0] : m.hg === m.ag ? [1, 1] : [0, 3];
    matchs.push({ cle: m.match_key, jour: numeroDuJour(m.date), league: m.league, saison: seasonOf(m.league, m.date), dom, ext, pts, xp: xp ? [xp.dom, xp.ext] : null });
  }
  matchs.sort((a, b) => a.jour - b.jour || (a.cle < b.cle ? -1 : 1));
  const cumuls = new Map(); // « league|saison|club » → { n, pts, nXg, xp }
  const cumul = (m, club) => {
    const k = `${m.league}|${m.saison}|${club}`;
    let c = cumuls.get(k);
    if (!c) cumuls.set(k, (c = { n: 0, pts: 0, nXg: 0, xp: 0 }));
    return c;
  };
  const veille = new Map();
  let j = 0;
  while (j < matchs.length) {
    const jour = matchs[j].jour;
    let fin = j;
    while (fin < matchs.length && matchs[fin].jour === jour) fin++;
    // D'abord lire (la veille), puis ajouter les matchs du jour.
    for (let k = j; k < fin; k++) {
      const m = matchs[k];
      const a = cumul(m, m.dom);
      const b = cumul(m, m.ext);
      veille.set(m.cle, {
        reel: { dom: a.n ? a.pts / a.n : null, ext: b.n ? b.pts / b.n : null, nDom: a.n, nExt: b.n },
        xg: { dom: a.nXg ? a.xp / a.nXg : null, ext: b.nXg ? b.xp / b.nXg : null, nDom: a.nXg, nExt: b.nXg }
      });
    }
    for (let k = j; k < fin; k++) {
      const m = matchs[k];
      const a = cumul(m, m.dom);
      const b = cumul(m, m.ext);
      a.n++;
      b.n++;
      a.pts += m.pts[0];
      b.pts += m.pts[1];
      if (m.xp) {
        a.nXg++;
        b.nXg++;
        a.xp += m.xp[0];
        b.xp += m.xp[1];
      }
    }
    j = fin;
    if (j % 2000 < 20) yield 'classements : cumuls';
  }
  return { veille, comptes };
}

// ======================================================= l'indice, la veille de chaque match

/**
 * Les composantes de l'indice des deux clubs, LA VEILLE de chaque match de championnat (le rejeu, sans rien
 * écrire) : pour chaque variante de rejeu (`rejeux` : { id: options du rejeu }), Map clé → { jour, league,
 * issue, bp, bc, dom: { tous, dom, ext, brut, n }, ext: {…} }. Seuls les matchs de championnat comptés, ni
 * attribués ni prolongés, dont les DEUX clubs sont de ce championnat la veille.
 */
export function* indicesDeLaVeille(rencontres, { rejeux = { normal: {} }, depuis = null } = {}) {
  const sorties = {};
  const parJour = new Map();
  for (const r of rencontres) {
    if (r.coupe || !r.compte || r.attribue || r.prolongation) continue;
    if (depuis !== null && r.jour < depuis) continue;
    let l = parJour.get(r.jour);
    if (!l) parJour.set(r.jour, (l = []));
    l.push(r);
  }
  for (const [id, options] of Object.entries(rejeux)) {
    const lignes = new Map();
    const surJour = (jour, s, clubs, rejeu) => {
      for (const r of parJour.get(jour) ?? []) {
        if (r.league !== s.league) continue;
        if (rejeu.championnat.get(r.dom) !== s.league || rejeu.championnat.get(r.ext) !== s.league) continue;
        const i = s.index.get(r.dom);
        const j = s.index.get(r.ext);
        if (i === undefined || j === undefined) continue;
        const prendre = (k) => {
          const c = s.composantes(k);
          const b = s.composantes(k, { brut: true });
          return { tous: c[0].ecarts, dom: c[1].ecarts, ext: c[2].ecarts, brut: b[0].ecarts, n: c[0].n[IDX.buts_p], nXg: c[0].n[IDX.xg_p] };
        };
        const v = r.valeurs.buts;
        lignes.set(r.cle, { jour, league: r.league, bp: v[0], bc: v[1], issue: v[0] > v[1] ? 0 : v[0] === v[1] ? 1 : 2, dom: prendre(i), ext: prendre(j) });
      }
    };
    const rejeu = new RejeuDeForce({ ...options, surJour, ecrire: false, actuelles: false, poidsDeLaNote: null });
    yield* rejouer(rejeu, rencontres);
    sorties[id] = { lignes, bilan: rejeu.bilan };
  }
  return sorties;
}

/** Les colonnes d'une formule, prises dans un tableau d'écarts ; null s'il en manque une. */
function colonnes(ecarts, formule) {
  const out = [];
  for (const id of FORMULES[formule]) {
    const v = ecarts[IDX[id]];
    if (!Number.isFinite(v)) return null;
    out.push(v);
  }
  return out;
}

/** La formule commune aux deux clubs (avec les xG si les deux en ont assez), et leurs colonnes. */
function deuxClubs(a, b, formuleImposee = null) {
  for (const f of formuleImposee ? [formuleImposee] : ['xg', 'sans-xg']) {
    const x = colonnes(a, f);
    const y = colonnes(b, f);
    if (x && y) return { formule: f, dom: x, ext: y };
  }
  return null;
}

/** Les écarts de composantes d'une ligne pour une variante : « tous » (v1, demi-vie 18), « brut » (sans correction), dom/ext. */
function ecartsDe(ligne, variante) {
  if (variante === 'indice-dom-ext') return { dom: ligne.dom.dom, ext: ligne.ext.ext };
  if (variante === 'sans-correction') return { dom: ligne.dom.brut, ext: ligne.ext.brut };
  return { dom: ligne.dom.tous, ext: ligne.ext.tous };
}

// ======================================================= la mesure

const lienVide = () => null;
const pct = (x) => (x === null || x === undefined ? null : Math.round(x * 10000) / 100);

/**
 * LA MESURE AU BANC. `database` : une base ouverte (lecture seule suffit). Options : `tirages`, `graine`
 * (le juge), `declarer` (les variantes au registre de l'étape 16, `registre` : ses options — un fichier
 * d'essai), `avancement`. Générateur (points d'arrêt). Rend le résumé (forme stable, rangé par l'appelant).
 */
export function* mesurerAuBanc({ database, tirages = 1000, graine = 29, declarer = true, registre = {}, rencontres = null } = {}) {
  const debut = performance.now();
  // Les variantes regardées sont DÉCLARÉES avant le moindre jugement : le juge les compte.
  if (declarer) for (const v of VARIANTES_INDICE) declarerVariante('29', { id: v.id, quoi: v.quoi, ou: 'banc' }, registre);
  const variantesAuRegistre = declarer ? compterVariantes('29', registre) : VARIANTES_INDICE.length;
  const K = Math.max(COMPARAISONS.length, variantesAuRegistre);
  const toutes = rencontres ?? (yield* chargerLesRencontres(database));
  const { veille, comptes: comptesClassements } = yield* classementsDeLaVeille(database);
  const depuis = numeroDuJour(PERIODES_DU_BANC.preuve.de);
  const indices = yield* indicesDeLaVeille(toutes, { rejeux: { normal: {}, 'demi-vie-18': { demiVies: Object.fromEntries(STATISTIQUES_INDICE.map((s) => [s.id, 18])) } }, depuis });
  const tRejeux = performance.now();
  const lignesDe = (variante) => (variante === 'demi-vie-18' ? indices['demi-vie-18'].lignes : indices.normal.lignes);

  // 1. Les poids de chaque variante et de chaque formule, appris sur P4a (écart de buts ~ écarts des composantes).
  const app = PERIODES_DU_BANC.apprentissage;
  const poids = {};
  for (const v of VARIANTES_INDICE) {
    poids[v.id] = {};
    for (const f of ['xg', 'sans-xg']) {
      const X = [];
      const y = [];
      for (const l of lignesDe(v.id).values()) {
        if (!dans(l.jour, app) || l.dom.n < MINIMUM_MATCHS || l.ext.n < MINIMUM_MATCHS) continue;
        const e = ecartsDe(l, v.id);
        const d = deuxClubs(e.dom, e.ext, f);
        if (!d) continue;
        X.push(d.dom.map((x, k) => x - d.ext[k]));
        y.push(l.bp - l.bc);
      }
      poids[v.id][f] = X.length > FORMULES[f].length + 50 ? apprendrePoids(X, y, FORMULES[f]) : null;
    }
    yield 'poids';
  }
  /**
   * L'écart d'une ligne pour une variante (null s'il manque une composante, ou un club sous 6 matchs) ;
   * `seulement` : seulement les lignes dont la formule NATURELLE (avec les xG si les deux clubs en ont assez,
   * sinon le repli) est celle-là — le repli se juge là où il sert.
   */
  const ecartIndice = (l, variante, seulement = null) => {
    if (!l || l.dom.n < MINIMUM_MATCHS || l.ext.n < MINIMUM_MATCHS) return null;
    const e = ecartsDe(l, variante);
    const d = deuxClubs(e.dom, e.ext);
    if (!d || (seulement && d.formule !== seulement)) return null;
    const p = poids[variante][d.formule];
    if (!p) return null;
    let s = 0;
    FORMULES[d.formule].forEach((id, k) => {
      s += p.poids[id] * (d.dom[k] - d.ext[k]);
    });
    return { s, formule: d.formule };
  };
  const ecartReference = (cle, reference) => {
    const v = veille.get(cle)?.[reference];
    if (!v || v.dom === null || v.ext === null || v.nDom < MINIMUM_MATCHS || v.nExt < MINIMUM_MATCHS) return null;
    return v.dom - v.ext;
  };

  // 2. Les liens « écart → 1N2 » de chaque prédicteur, appris sur P4a.
  const liens = {};
  const apprendreSur = (prendre) => {
    const s = [];
    const o = [];
    for (const [cle, l] of indices.normal.lignes) {
      if (!dans(l.jour, app)) continue;
      const x = prendre(cle, l);
      if (x === null || x === undefined) continue;
      s.push(x);
      o.push(l.issue);
    }
    return s.length >= 200 ? apprendreLien(s, o) : lienVide();
  };
  for (const v of VARIANTES_INDICE) {
    liens[v.id] = apprendreSur((cle) => ecartIndice(lignesDe(v.id).get(cle), v.id)?.s ?? null);
    yield 'liens';
  }
  liens.xg = apprendreSur((cle) => ecartReference(cle, 'xg'));
  liens.reel = apprendreSur((cle) => ecartReference(cle, 'reel'));
  yield 'liens';

  // 3. Les jugements : P3 (la preuve) et P4b + P5 (indicatif).
  // « Déjà vu » pour l'INDICE (correction du 19/10) : les réglages du 23/09 et les fenêtres de portée 'indice' — le
  // lancement de l'étape 29 lui-même (les vues de l'étape 18, dont il lit les demi-vies, puis les siennes).
  const fenetres = fenetresDeclarees({ portee: 'indice' });
  const juger = (comparaison, periode) => {
    const lignes = [];
    const vues = { total: 0, parFenetre: {} };
    let sA = 0;
    let sB = 0;
    let rA = 0;
    let rB = 0;
    let justesA = 0;
    let justesB = 0;
    const formules = { xg: 0, 'sans-xg': 0 };
    let de = null;
    let a = null;
    for (const [cle, l] of indices.normal.lignes) {
      if (!dans(l.jour, periode)) continue;
      const lv = comparaison.variante === 'demi-vie-18' ? indices['demi-vie-18'].lignes.get(cle) : l;
      const ix = ecartIndice(lv, comparaison.variante, comparaison.formule ?? null);
      const ref = ecartReference(cle, comparaison.reference);
      if (!ix || ref === null || !liens[comparaison.variante] || !liens[comparaison.reference]) continue;
      const pA = probabilitesDuLien(liens[comparaison.reference], ref);
      const pB = probabilitesDuLien(liens[comparaison.variante], ix.s);
      const pa = perteLog(pA, l.issue).valeur;
      const pb = perteLog(pB, l.issue).valeur;
      const date = jourIso(l.jour);
      lignes.push({ bloc: cle, date, a: pa, b: pb });
      if (de === null || date < de) de = date;
      if (a === null || date > a) a = date;
      sA += pa;
      sB += pb;
      rA += rps(pA, l.issue);
      rB += rps(pB, l.issue);
      if (pA.indexOf(Math.max(...pA)) === l.issue) justesA++;
      if (pB.indexOf(Math.max(...pB)) === l.issue) justesB++;
      formules[ix.formule]++;
      vues.total++;
      for (const f of fenetres) if (date >= f.de && date <= f.a) vues.parFenetre[f.id] = (vues.parFenetre[f.id] ?? 0) + 1;
    }
    const n = lignes.length;
    const juge = n ? comparer(lignes, { sens: 'min', variantes: K, tirages, graine }) : null;
    return {
      n,
      formules,
      // Les jours des matchs jugés : toujours dans la période.
      fenetre: { de, a },
      reference: { perteLog: n ? sA / n : null, rps: n ? rA / n : null, justes: n ? pct(justesA / n) : null },
      indice: { perteLog: n ? sB / n : null, rps: n ? rB / n : null, justes: n ? pct(justesB / n) : null },
      // Le gain de l'indice, en % de la perte log de la référence (positif = l'indice fait mieux), et sa fourchette.
      gainPourcent: juge?.gain === null || juge?.gain === undefined || !sA ? null : (juge.gain / (sA / n)) * 100,
      fourchettePourcent: juge?.fourchette ? juge.fourchette.map((x) => (x / (sA / n)) * 100) : null,
      verdict: juge?.verdict ?? 'pas-assez-de-matchs',
      raison: juge?.raison ?? 'Aucune ligne.',
      gain: juge?.gain ?? null,
      fourchette: juge?.fourchette ?? null,
      vues
    };
  };
  const jugements = [];
  for (const c of COMPARAISONS) {
    jugements.push({ ...c, periode: 'P3', preuve: true, ...juger(c, PERIODES_DU_BANC.preuve) });
    yield 'jugement';
    jugements.push({ ...c, periode: 'P4b+P5', preuve: false, indicatif: 'déjà vues (P4b : la vérification du 23/09 ; P5 : la base du bac)', ...juger(c, PERIODES_DU_BANC.indicatif) });
    yield 'jugement';
  }
  const principal = jugements.find((j) => j.principale && j.preuve);
  // Les poids RECOPIÉS dans le code (POIDS_DE_LA_NOTE) sont-ils ceux que ce banc apprend sur cette base ?
  let ecartPoids = 0;
  for (const f of ['xg', 'sans-xg']) {
    const appris = poids['indice-v1'][f]?.poids ?? {};
    for (const id of FORMULES[f]) ecartPoids = Math.max(ecartPoids, Math.abs((POIDS_DE_LA_NOTE[f]?.[id] ?? Number.NaN) - (appris[id] ?? Number.NaN)) || 0, Number.isFinite(POIDS_DE_LA_NOTE[f]?.[id]) && Number.isFinite(appris[id]) ? 0 : Infinity);
  }
  const arrondirPoids = (p) => (p ? { constante: Number(p.constante.toFixed(5)), n: p.n, poids: Object.fromEntries(Object.entries(p.poids).map(([k, x]) => [k, Number(x.toFixed(6))])) } : null);
  return {
    version: VERSION_BANC_INDICE,
    le: new Date().toISOString(),
    periodes: PERIODES_DU_BANC,
    minimumMatchs: MINIMUM_MATCHS,
    lambda: LAMBDA_RIDGE,
    variantes: { declarees: VARIANTES_INDICE.map((v) => v.id), auRegistre: variantesAuRegistre, comparaisonsJugees: COMPARAISONS.length, K },
    vuesDeLEtape: VUES_DE_L_ETAPE_29,
    poids: Object.fromEntries(Object.entries(poids).map(([v, x]) => [v, { xg: arrondirPoids(x.xg), 'sans-xg': arrondirPoids(x['sans-xg']) }])),
    poidsDuCode: { aJour: ecartPoids <= 1e-6, ecartMax: ecartPoids },
    liens: Object.fromEntries(Object.entries(liens).map(([k, l]) => [k, l ? { s1: l.s1, s2: l.s2, pente: l.pente, perteLog: l.perteLog, n: l.n } : null])),
    classements: comptesClassements,
    lignes: { normal: indices.normal.lignes.size, demiVie18: indices['demi-vie-18'].lignes.size },
    jugements,
    reponse: principal
      ? {
          bat: principal.verdict === 'retenu',
          verdict: principal.verdict,
          gainPourcent: principal.gainPourcent,
          fourchettePourcent: principal.fourchettePourcent,
          matchs: principal.n,
          phrase:
            principal.verdict === 'retenu'
              ? `L’indice annonce les matchs suivants mieux que le classement corrigé xG, au-delà du hasard : perte log ${(principal.indice.perteLog ?? 0).toFixed(4)} contre ${(principal.reference.perteLog ?? 0).toFixed(4)} sur ${principal.n} matchs de P3.`
              : principal.verdict === 'moins-bon'
                ? `L’indice annonce les matchs suivants MOINS bien que le classement corrigé xG, au-delà du hasard (${principal.n} matchs de P3).`
                : principal.verdict === 'pas-prouve'
                  ? `L’indice ne bat pas le classement corrigé xG au-delà du hasard (${principal.n} matchs de P3) : l’écart peut venir du hasard.`
                  : 'Trop peu de matchs pour juger.'
        }
      : null,
    dureeMs: Math.round(performance.now() - debut),
    parties: { rejeux: Math.round(tRejeux - debut) }
  };
}
