/**
 * correctionFabrique.mjs — DES DONNÉES FABRIQUÉES pour la boucle de correction (étape 26, 27/10/2026) : ce n'est
 * PAS un fichier de test. Pur : aucune base, aucun fichier ; le seul hasard est celui, à graine, du juge
 * (bench/guard.js, generateur).
 *
 * 1. DES MATCHS « MOTEUR CONTRE VÉRITÉ », ligne par ligne, au format du gel :
 *    - des buts attendus VRAIS (λ, μ ; total ≈ 2,6 et part de l'équipe qui reçoit ≈ 0,555, dispersés) et ceux du
 *      MOTEUR : égaux (moteur juste) ou bruités SANS BIAIS DE MOYENNE (λ' = λ · exp(σZ − σ²/2), constat 6 de la
 *      critique) ;
 *    - le score tiré de la VRAIE grille (Poisson et Dixon-Coles, ρ = −0,05), les distributions tirées de la grille
 *      du MOTEUR (arrondies à 4 décimales comme au gel, markets.js) ;
 *    - les lignes gelées par les RÈGLES DE CHOIX du moteur (markets.js) : l'issue la plus probable cotée au moins
 *      1,20 ; 1N2 et « les deux marquent » sans repli ; le combiné dans le camp du favori du 1N2 ;
 *    - corners, tirs et tirs cadrés par la loi du moteur (statMarkets.js : STAT_KINDS, lineCandidates,
 *      probabilitesLigne) ; la vérité du total et celle de chaque équipe tirées chacune par sa loi (chaque case
 *      juste pour un moteur juste).
 *    Rend { lignes: [{ familleId, distribution, issue }], score }.
 * 2. UN REGISTRE DES VERSIONS fabriqué (forme d'engine-versions.json) pour les tests de la lignée et du tri.
 */

import crypto from 'node:crypto';
import { generateur } from '../../src/bench/guard.js';
import { STAT_KINDS, lineCandidates, probabilitesLigne } from '../../src/sports/football/statMarkets.js';

const PMAX = 1 / 1.2;
const p4 = (x) => Number(x.toFixed(4));
const LIGNES_DE_BUTS = [0.5, 1.5, 2.5, 3.5];
const LIGNES_DU_COMBINE = [1.5, 2.5, 3.5];

/** Le hasard d'un jeu de matchs : uniforme, normale (Box-Muller), Poisson, gamma (Marsaglia-Tsang), binomiale négative. */
export function hasard(graine) {
  const u = generateur(graine);
  let reserve = null;
  const gauss = () => {
    if (reserve !== null) {
      const r = reserve;
      reserve = null;
      return r;
    }
    let a = 0;
    while (a === 0) a = u();
    const b = u();
    const m = Math.sqrt(-2 * Math.log(a));
    reserve = m * Math.sin(2 * Math.PI * b);
    return m * Math.cos(2 * Math.PI * b);
  };
  const poisson = (l) => {
    if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss()));
    const L = Math.exp(-l);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= u();
    } while (p > L);
    return k - 1;
  };
  const gamma = (k) => {
    if (k < 1) return gamma(k + 1) * Math.pow(u(), 1 / k);
    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x;
      let v;
      do {
        x = gauss();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const w = u();
      if (w < 1 - 0.0331 * x ** 4) return d * v;
      if (Math.log(w) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  const binomialeNegative = (mu, invK) => (invK <= 0 ? poisson(mu) : poisson(gamma(1 / invK) * mu * invK));
  return { u, gauss, poisson, binomialeNegative };
}

/** La grille des scores 0..10 × 0..10 (Poisson × Dixon-Coles), normalisée. */
export function grille(l, m, rho = -0.05) {
  const ph = [];
  const pa = [];
  let a = Math.exp(-l);
  let b = Math.exp(-m);
  for (let i = 0; i <= 10; i++) {
    ph.push(a);
    pa.push(b);
    a *= l / (i + 1);
    b *= m / (i + 1);
  }
  const g = new Float64Array(121);
  let tot = 0;
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      let t = 1;
      if (i === 0 && j === 0) t = 1 - l * m * rho;
      else if (i === 0 && j === 1) t = 1 + l * rho;
      else if (i === 1 && j === 0) t = 1 + m * rho;
      else if (i === 1 && j === 1) t = 1 - rho;
      const p = Math.max(0, t * ph[i] * pa[j]);
      g[i * 11 + j] = p;
      tot += p;
    }
  }
  for (let k = 0; k < 121; k++) g[k] /= tot;
  return g;
}

const CLES_DU_COMBINE = ['homeOver', 'homeUnder', 'drawOver', 'drawUnder', 'awayOver', 'awayUnder'];

/** Les marchés de buts d'une grille : 1N2, les deux marquent, totaux, buts de chaque équipe, combiné. */
export function marchesDeLaGrille(g) {
  const res3 = new Float64Array(3); // home, draw, away
  const total = new Float64Array(4);
  const dom = new Float64Array(4);
  const ext = new Float64Array(4);
  const comb = new Float64Array(18); // ligne × (résultat × plus/moins)
  let oui = 0;
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const p = g[i * 11 + j];
      const r = i > j ? 0 : i === j ? 1 : 2;
      res3[r] += p;
      if (i > 0 && j > 0) oui += p;
      const n = i + j;
      for (let k = 0; k < 4; k++) {
        const x = LIGNES_DE_BUTS[k];
        if (n > x) total[k] += p;
        if (i > x) dom[k] += p;
        if (j > x) ext[k] += p;
      }
      for (let k = 0; k < 3; k++) comb[k * 6 + r * 2 + (n > LIGNES_DU_COMBINE[k] ? 0 : 1)] += p;
    }
  }
  const parLigne = (t) => Object.fromEntries(LIGNES_DE_BUTS.map((x, k) => [x, t[k]]));
  return {
    home: res3[0],
    draw: res3[1],
    away: res3[2],
    oui,
    total: parLigne(total),
    dom: parLigne(dom),
    ext: parLigne(ext),
    combine: Object.fromEntries(LIGNES_DU_COMBINE.map((x, k) => [x, Object.fromEntries(CLES_DU_COMBINE.map((c, m) => [c, comb[k * 6 + m]]))]))
  };
}

function tirerLeScore(g, u) {
  let v = u();
  let k = 0;
  for (; k < 120; k++) {
    v -= g[k];
    if (v <= 0) break;
  }
  return [Math.floor(k / 11), k % 11];
}

/** La ligne plus/moins choisie (l'issue la plus probable cotée ≥ 1,20) parmi [ligne, P(plus)] ; null si aucune. */
function choixDeLaLigne(paires) {
  let meilleur = null;
  for (const [x, po] of paires) {
    for (const p of [po, 1 - po]) if (p <= PMAX && (!meilleur || p > meilleur.p)) meilleur = { x, p, po };
  }
  return meilleur;
}

const STATISTIQUES = [
  { kind: 'corners', total: 'totalCorners', equipe: 'teamCorners', mu: 9.9 },
  { kind: 'shots', total: 'totalShots', equipe: 'teamShots', mu: 24.5 },
  { kind: 'shotsOnTarget', total: 'totalShotsOnTarget', equipe: 'teamShotsOnTarget', mu: 8.6 }
];

/**
 * P(X ≤ k) de la binomiale négative de moyenne `mu` et 1/k = `invK`, par récurrence (P(0) = q^r, P(i+1) = P(i) ·
 * (i + r)/(i + 1) · (1 − q)) : la loi même de statMarkets.js (loiDesComptes), calculée vite — vérifié contre
 * probabilitesLigne à 1e-9 près (correctionFabrique, `controleDeLaLoi`).
 */
function cdfBinomialeNegative(k, mu, invK) {
  const r = 1 / invK;
  const q = r / (r + mu);
  let p = Math.exp(r * Math.log(q));
  let s = 0;
  for (let i = 0; i <= k; i++) {
    s += p;
    p *= ((i + r) / (i + 1)) * (1 - q);
  }
  return Math.min(1, s);
}

/**
 * La ligne choisie par le moteur pour un compte — les lignes et l'arrondi de lineCandidates (de 0,4 à 1,8 fois
 * l'attendu, cote juste à 2 décimales), la cote la plus basse ≥ 1,20 — et sa distribution (probabilitesLigne).
 */
function ligneDeStatistique(mu, invK) {
  if (!(mu > 0)) return null;
  let meilleur = null;
  for (let line = Math.max(0.5, Math.floor(mu * 0.4) + 0.5); line <= Math.ceil(mu * 1.8) + 0.5; line += 1) {
    const pMoins = cdfBinomialeNegative(Math.floor(line), mu, invK);
    if (!(pMoins > 0 && pMoins < 1)) continue;
    for (const [side, p] of [['under', pMoins], ['over', 1 - pMoins]]) {
      const odds = Number((1 / p).toFixed(2));
      if (odds >= 1.2 && (!meilleur || odds < meilleur.odds)) meilleur = { line, side, odds, pMoins };
    }
  }
  if (!meilleur) return null;
  return { ligne: meilleur.line, issues: { over: p4(1 - meilleur.pMoins), under: p4(meilleur.pMoins) } };
}

/** Contrôle : la loi rapide redonne lineCandidates et probabilitesLigne de statMarkets.js (même ligne choisie, mêmes probabilités à 1e-9). */
export function controleDeLaLoi(mus = [3.1, 4.4, 5.6, 8.7, 9.9, 12.3, 24.5]) {
  const ecarts = [];
  for (const kind of Object.keys(STAT_KINDS)) {
    for (const invK of [STAT_KINDS[kind].invKTeam, STAT_KINDS[kind].invKTotal]) {
      for (const mu of mus) {
        let ref = null;
        for (const c of lineCandidates(mu, invK)) if (c.odds >= 1.2 && (!ref || c.odds < ref.odds)) ref = c;
        const vite = ligneDeStatistique(mu, invK);
        const p = ref ? probabilitesLigne(mu, invK, ref.line) : null;
        ecarts.push({ kind, invK, mu, memeLigne: (ref?.line ?? null) === (vite?.ligne ?? null), ecart: p && vite ? Math.abs(p4(p.over) - vite.issues.over) : 0 });
      }
    }
  }
  return ecarts;
}

/**
 * UN MATCH FABRIQUÉ. `h` : hasard(graine) ; `bruit` : σ du bruit du moteur (0 : moteur juste) ; `biais` : écarts
 * posés à la main sur l'issue de référence d'une famille ({ bothTeamsScore: 0.03 } : « oui » annoncé 3 points trop
 * haut), pour les essais de puissance. Rend { lignes: [{ familleId, distribution, issue }], score: [h, a] }.
 */
export function unMatch(h, { bruit = 0, biais = {}, statistiques = true } = {}) {
  const bruiter = (x) => (bruit ? x * Math.exp(bruit * h.gauss() - (bruit * bruit) / 2) : x);
  const total = Math.exp(Math.log(2.6) + 0.22 * h.gauss());
  const part = Math.min(0.85, Math.max(0.15, 0.555 + 0.13 * h.gauss()));
  const l = total * part;
  const m = total * (1 - part);
  const gVraie = grille(l, m);
  const gMoteur = bruit ? grille(bruiter(l), bruiter(m)) : gVraie;
  const mot = marchesDeLaGrille(gMoteur);
  const [bh, ba] = tirerLeScore(gVraie, h.u);
  const res = bh > ba ? 'home' : bh === ba ? 'draw' : 'away';
  const lignes = [];
  const decale = (familleId, p) => Math.min(0.999, Math.max(0.001, p + (biais[familleId] ?? 0)));

  // 1N2 : le favori s'il est coté ≥ 1,20.
  const fav = ['home', 'draw', 'away'].reduce((x, y) => (mot[y] > mot[x] ? y : x));
  if (mot[fav] <= PMAX) {
    const pH = decale('result', mot.home);
    const reste = 1 - mot.home;
    const k = reste > 0 ? (1 - pH) / reste : 0;
    lignes.push({ familleId: 'result', distribution: { issues: { home: p4(pH), draw: p4(mot.draw * k), away: p4(mot.away * k) } }, issue: res });
  }
  // Total buts.
  const ct = choixDeLaLigne(LIGNES_DE_BUTS.map((x) => [x, decale('totalGoals', mot.total[x])]));
  if (ct) lignes.push({ familleId: 'totalGoals', distribution: { ligne: ct.x, issues: { over: p4(ct.po), under: p4(1 - ct.po) } }, issue: bh + ba > ct.x ? 'over' : 'under' });
  // Les deux marquent : le favori s'il est coté ≥ 1,20.
  const oui = decale('bothTeamsScore', mot.oui);
  if (Math.max(oui, 1 - oui) <= PMAX) lignes.push({ familleId: 'bothTeamsScore', distribution: { issues: { yes: p4(oui), no: p4(1 - oui) } }, issue: bh > 0 && ba > 0 ? 'yes' : 'no' });
  // Buts d'une équipe : deux lignes par match.
  for (const [equipe, cle, buts] of [['home', 'dom', bh], ['away', 'ext', ba]]) {
    const c = choixDeLaLigne(LIGNES_DE_BUTS.map((x) => [x, decale('teamGoals', mot[cle][x])]));
    if (c) lignes.push({ familleId: 'teamGoals', distribution: { equipe, ligne: c.x, issues: { over: p4(c.po), under: p4(1 - c.po) } }, issue: buts > c.x ? 'over' : 'under' });
  }
  // Résultat + total : dans le camp du favori du 1N2, lignes 1,5 / 2,5 / 3,5.
  let meilleur = null;
  for (const x of LIGNES_DU_COMBINE) {
    for (const [k, p] of Object.entries(mot.combine[x])) if (k.startsWith(fav) && p <= PMAX && (!meilleur || p > meilleur.p)) meilleur = { x, p };
  }
  if (meilleur) {
    const issues = Object.fromEntries(Object.entries(mot.combine[meilleur.x]).map(([k, p]) => [k, p4(p)]));
    lignes.push({ familleId: 'resultAndTotal', distribution: { ligne: meilleur.x, issues }, issue: `${res}${bh + ba > meilleur.x ? 'Over' : 'Under'}` });
  }
  // Corners, tirs, tirs cadrés : au total et par équipe (`statistiques: false` : les familles de buts seules).
  for (const s of statistiques ? STATISTIQUES : []) {
    const loi = STAT_KINDS[s.kind];
    const muT = Math.exp(Math.log(s.mu) + 0.15 * h.gauss());
    const pa = Math.min(0.75, Math.max(0.25, 0.55 + 0.08 * h.gauss()));
    const vraiT = h.binomialeNegative(muT, loi.invKTotal);
    const lt = ligneDeStatistique(bruiter(muT), loi.invKTotal);
    if (lt) lignes.push({ familleId: s.total, distribution: lt, issue: vraiT > lt.ligne ? 'over' : 'under' });
    for (const [equipe, mu] of [['home', muT * pa], ['away', muT * (1 - pa)]]) {
      const vrai = h.binomialeNegative(mu, loi.invKTeam);
      const le = ligneDeStatistique(bruiter(mu), loi.invKTeam);
      if (le) lignes.push({ familleId: s.equipe, distribution: { equipe, ...le }, issue: vrai > le.ligne ? 'over' : 'under' });
    }
  }
  return { lignes, score: [bh, ba] };
}

// ------------------------------------------------------------ un registre des versions fabriqué

const sha1 = (t) => crypto.createHash('sha1').update(t).digest('hex');

/** Une version (forme d'engine-versions.json) : son code (empreinte) et ses réglages du football. */
export function versionFabriquee(numero, { code, reglages, creeeLe, origine = 'code', depuis = null }) {
  return {
    numero,
    creeeLe,
    origine,
    pourquoi: origine,
    empreinte: sha1(`${code}|${JSON.stringify(reglages)}`),
    empreinteReglages: { football: sha1(JSON.stringify(reglages)) },
    reglages: { football: JSON.parse(JSON.stringify(reglages)) },
    code: { empreinte: code, fichiers: {} },
    lancements: [],
    depuis,
    changements: []
  };
}

/** Un registre complet : `versions` (versionFabriquee), `journal` ([{ le, action, version, depuis? }]), `pile`. */
export function registreFabrique({ versions, journal, pile = null, candidate = null, candidatesPassees = [] }) {
  const p = pile ?? versions.map((v) => v.numero);
  return { format: 1, enService: p.at(-1), pile: p, versions, journal, candidate, candidatesPassees, majLe: journal.at(-1)?.le ?? null };
}
