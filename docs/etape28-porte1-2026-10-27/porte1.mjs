// Étape 28, partie C1 — LA PORTE 1 SUR FOOTBALL-DATA P2 (conception §3.3, §8 étape 4 ; preuve.md F2c, F3a).
// UN SEUL passage sur les vraies issues, avec les règles ÉCRITES AVANT (SCR/partieC/porte1-regles.md) ; avant lui, une
// répétition générale avec des issues SYNTHÉTIQUES tirées du modèle lui-même (aucune colonne d'issue lue).
//
// Usage (dans le bac : CM_BAC_A_SABLE=1, MATCH_STATS_DB=<base du bac>) :
//   node porte1.mjs --issues synthetiques --echantillon echantillon-p2.json --rejeu-a <a1-p2.jsonl> --n 4000 --sortie <json> [--limite K]
//   node porte1.mjs --issues reelles --echantillon echantillon-p2.json --rejeu-a <a1-p2.jsonl> --n 4000 --sortie <json>
//                   --regles porte1-regles.md --sha1-regles <sha1> --je-regarde-p2-une-seule-fois
// En mode « reelles » : les sha1 des règles et de chaque fichier nommé dans leur section « Empreintes » sont vérifiés
// AVANT toute lecture ; un verrou (porte1-passage-reel.lock) est posé avant de lire une seule issue et n'est jamais
// retiré par ce script : un second passage est refusé (un second passage serait un second regard).
// --verifier-seulement (mode « reelles ») : ces contrôles, puis sortie AVANT le verrou et avant d'ouvrir la base.
// Mode « reelles-essai » (le test du chemin des issues LUES, jamais un regard) : --base-issues <base d'essai du dossier
// partieC, issues TIRÉES par creer-base-essai.mjs> ; mêmes contrôles des règles, aucun verrou, --limite permis.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { pathToFileURL, fileURLToPath } from 'node:url';

const NL = String.fromCharCode(10);
const BASE_DU_BAC = 'C:/Users/PC/CoteMaster/bac-a-sable/base/match-stats.db';
const SERVEUR = 'C:/Users/PC/CoteMaster/bac-a-sable/code/server/';
const SRV = SERVEUR + 'src/';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const VERROU = path.join(ICI, 'porte1-passage-reel.lock');
const norme = (p) => String(p ?? '').split(String.fromCharCode(92)).join('/').toLowerCase();
const sha1Fichier = (f) => {
  const h = crypto.createHash('sha1');
  const fd = fs.openSync(f, 'r');
  const tampon = Buffer.alloc(64 * 2 ** 20);
  try {
    for (let lu; (lu = fs.readSync(fd, tampon, 0, tampon.length, null)) > 0; ) h.update(tampon.subarray(0, lu));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
};

// ------------------------------------------------------------ arguments et gardes
const args = process.argv.slice(2);
const valeur = (nom) => {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : null;
};
const MODE = valeur('--issues');
if (!['synthetiques', 'reelles', 'reelles-essai'].includes(MODE)) throw new Error('--issues synthetiques | reelles | reelles-essai');
const REEL = MODE === 'reelles';
const ISSUES_LUES = MODE === 'reelles' || MODE === 'reelles-essai';
if (process.env.CM_BAC_A_SABLE !== '1') throw new Error('CM_BAC_A_SABLE=1 obligatoire.');
if (norme(process.env.MATCH_STATS_DB) !== norme(BASE_DU_BAC)) throw new Error(`MATCH_STATS_DB doit être la base du bac (${process.env.MATCH_STATS_DB}).`);
const N_CHEMINS = Number(valeur('--n'));
if (!Number.isInteger(N_CHEMINS) || N_CHEMINS < 1000) throw new Error('--n entier ≥ 1 000 (V C5).');
const fichierEchantillon = valeur('--echantillon');
const fichierRejeuA = valeur('--rejeu-a');
const fichierSortie = valeur('--sortie');
const limite = valeur('--limite') === null ? null : Number(valeur('--limite'));
const empreintes = {};
let baseDesIssues = BASE_DU_BAC;
if (MODE === 'reelles-essai') {
  const b = valeur('--base-issues');
  const absolue = b ? path.resolve(b) : null;
  if (!absolue || norme(absolue) === norme(BASE_DU_BAC) || !norme(absolue).startsWith(norme(ICI) + '/') || !fs.existsSync(absolue)) throw new Error('reelles-essai : --base-issues = une base d’ESSAI du dossier partieC (issues tirées), jamais la base du bac.');
  baseDesIssues = absolue;
}
if (ISSUES_LUES) {
  if (REEL && !args.includes('--je-regarde-p2-une-seule-fois') && !args.includes('--verifier-seulement')) throw new Error('Mode « reelles » : --je-regarde-p2-une-seule-fois obligatoire (ou --verifier-seulement : les contrôles seuls).');
  if (REEL && limite !== null) throw new Error('Mode « reelles » : jamais de --limite (l’échantillon entier, celui des règles).');
  if (REEL && fs.existsSync(VERROU)) throw new Error(`Un passage réel a déjà commencé (${VERROU}) : un second passage serait un second regard. Rien n’est lancé.`);
  const regles = valeur('--regles');
  const attendu = valeur('--sha1-regles');
  const vu = sha1Fichier(regles);
  if (vu !== attendu) throw new Error(`sha1 des règles ${vu} ≠ ${attendu} : rien n’est lancé.`);
  empreintes.regles = { fichier: regles, sha1: vu };
  // Chaque fichier nommé dans la section « Empreintes » des règles : même sha1 qu'au moment du verdict écrit.
  const texte = fs.readFileSync(regles, 'utf8');
  const lignes = [...texte.matchAll(/^- `([^`]+)` : ([0-9a-f]{40})/gm)];
  if (lignes.length < 8) throw new Error('Section « Empreintes » des règles introuvable ou incomplète.');
  empreintes.fichiers = [];
  for (const [, f, s] of lignes) {
    const absolu = /^[A-Za-z]:/.test(f) ? f : path.join(ICI, f);
    const v = sha1Fichier(absolu);
    if (v !== s) throw new Error(`sha1 de ${f} : ${v} ≠ ${s} (règles) : rien n’est lancé.`);
    empreintes.fichiers.push({ fichier: f, sha1: v });
  }
  if (args.includes('--verifier-seulement')) {
    console.log(`Contrôles d’avant le passage : règles ${empreintes.regles.sha1} et ${empreintes.fichiers.length} fichiers conformes ; verrou ${fs.existsSync(VERROU) ? 'DÉJÀ POSÉ' : 'absent'} ; rien n’est lu, rien n’est lancé.`);
    process.exit(0);
  }
}

const imp = (rel) => import(pathToFileURL(SRV + rel).href);
const BANC = await imp('data/simulation/simulationBanc.js');
const SM = await imp('data/simulation/simulationMatch.js');
const J = await imp('data/simulation/jambes.js');
const { PARAMS } = await imp('data/simulation/reglages.js');
const { PARAMS_SANS_EFFETS } = await imp('data/simulation/simulationMatchsEnfant.js');
const { grilleDesButs } = await imp('core/engine/goalModel.js');
const { comparer, zPour } = await imp('bench/guard.js');
const { PERIODES } = await imp('bench/periodes.js');

const t0 = Date.now();
const rssMax = { v: process.memoryUsage().rss };
const noterRss = () => {
  rssMax.v = Math.max(rssMax.v, process.memoryUsage().rss);
};
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const entier = (x) => Number.isInteger(x) && x >= 0;

// ------------------------------------------------------------ les règles, telles qu'écrites (porte1-regles.md)
const K = 27;
const OPTIONS_DU_JUGE = Object.freeze({ mode: 'moyenne', sens: 'min', variantes: K, tirages: 1000, graine: 28 });
const SEUIL_COMBINE_NET = 1.5; // points, |net du biais des jambes|
const SEUIL_MARCHE_NET = 1.0; // points, |net EXACT| (décision de l'orchestrateur du 27/10, avant le regard)
const PART_MAX_ECARTEE = 0.01; // plus de 1 % de rencontres sans chemin dans leur case réelle : jugement par marché « non vérifié »
const MARCHES_DU_BLOC = BANC.BLOC_DEROULE.filter((k) => !BANC.BESOIN_DES_MINUTES.includes(k)); // 15
const MARCHES_DE_LA_PORTE = [...MARCHES_DU_BLOC, 'h2plusQueH1', 'rougeAuMoinsUn']; // 17 (2/1 et 1/2 = les deux « mené à la mi-temps et gagne »)
const MARCHES_RAPPORTES = BANC.MARCHES_JUGES.filter((k) => !BANC.BESOIN_DES_MINUTES.includes(k)); // 19 (dont h2plusQueH1, retourDom, retourExt)
// RAPPORTÉ SEULEMENT (décision du 27/10) : le marché du score dont chaque marché de mi-temps hérite, pour le net additif (preuve.md F2c : nul, les deux marquent, plus de 1,5 ; le
// résultat de mi-temps et la case mi-temps/fin héritent du résultat final de même sens : 1, N ou 2).
const HERITAGE = Object.freeze({
  htH: 'un', htD: 'nul', htA: 'deux', htO05: 'plus15', htO15: 'plus15',
  htFt0: 'un', htFt1: 'nul', htFt2: 'deux', htFt3: 'un', htFt4: 'nul', htFt5: 'deux', htFt6: 'un', htFt7: 'nul', htFt8: 'deux',
  deuxMiTemps05: 'btts', rougeAuMoinsUn: null
});
const jambe = (marketId, params) => Object.freeze({ marketId, params: Object.freeze(params) });
const MARCHES_DU_SCORE = Object.freeze({
  un: jambe('result', { outcome: 'home' }), nul: jambe('result', { outcome: 'draw' }), deux: jambe('result', { outcome: 'away' }),
  btts: jambe('bothTeamsScore', { outcome: 'yes' }), plus15: jambe('totalGoals', { line: 1.5, side: 'over' })
});
const LIBELLES_DU_SCORE = Object.freeze({ un: '1 (domicile gagne)', nul: 'N (nul)', deux: '2 (extérieur gagne)', btts: 'les deux marquent', plus15: 'plus de 1,5 buts' });

// Les jambes simples des 14 combinés (clé → jambe), et celles du score hérité.
const JAMBES = new Map();
for (const c of BANC.COMBINES_DU_BANC) for (const x of c.jambes) JAMBES.set(J.cleDeLaJambe(x), x);
for (const x of Object.values(MARCHES_DU_SCORE)) JAMBES.set(J.cleDeLaJambe(x), x);
const CLES_JAMBES = [...JAMBES.keys()];
const CLE_DU_SCORE = Object.fromEntries(Object.entries(MARCHES_DU_SCORE).map(([k, x]) => [k, J.cleDeLaJambe(x)]));
const COMBINES_JAMBES = BANC.COMBINES_DU_BANC.map((c) => c.jambes.map((x) => J.cleDeLaJambe(x)));
const PRED = Object.fromEntries(CLES_JAMBES.map((k) => [k, J.predicatDeLaJambe(JAMBES.get(k)).f]));
const pJambe = (grille, k) => J.probabiliteDuCombine({ jambes: [JAMBES.get(k)], grille }).probabilite;

// Les marchés de déroulé sur un chemin (mêmes définitions que simulationMatch.js / issuesDuMatch ; contrôlées à chaque
// rencontre : la somme stratifiée refaite ici = marchesDesChemins à 1e-9 près).
const vraiSurChemin = (k, hh, ha, fh, fa, rouge) => {
  const rH = hh > ha ? 0 : hh === ha ? 1 : 2;
  const rF = fh > fa ? 0 : fh === fa ? 1 : 2;
  switch (k) {
    case 'htD': return rH === 1;
    case 'htH': return rH === 0;
    case 'htA': return rH === 2;
    case 'htO05': return hh + ha > 0;
    case 'htO15': return hh + ha > 1;
    case 'deuxMiTemps05': return hh + ha > 0 && fh + fa - hh - ha > 0;
    case 'h2plusQueH1': return fh + fa - hh - ha > hh + ha;
    case 'retourDom': return rH === 2 && rF === 0;
    case 'retourExt': return rH === 0 && rF === 2;
    case 'rougeAuMoinsUn': return rouge;
    default: return rH * 3 + rF === Number(k.slice(4));
  }
};
const lire = (d, k) => (k.startsWith('htFt') ? d.htFt[Number(k.slice(4))] : d[k]);

// ------------------------------------------------------------ l'échantillon et la grille de l'ancien modèle
const ECH = JSON.parse(fs.readFileSync(fichierEchantillon, 'utf8'));
const rho = ECH.rho;
let rencontres = ECH.rencontres;
if (limite !== null) rencontres = rencontres.slice(0, limite);
const clesEchantillon = new Set(rencontres.map((r) => r[0]));
const grillesAnciennes = new Map();
const lectureA = { lignes: 0, scoreExact: 0, gardees: 0, sourceCotes: 0 };
if (fichierRejeuA) {
  const rl = readline.createInterface({ input: fs.createReadStream(fichierRejeuA, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const texte of rl) {
    if (!texte) continue;
    lectureA.lignes++;
    if (!texte.includes('"marketKey":"scoreExact"')) continue;
    const o = JSON.parse(texte);
    if (o.type !== 'ligne' || o.marketKey !== 'scoreExact') continue;
    lectureA.scoreExact++;
    // Seuls champs lus : fixtureKey, moteur.distribution, moteur.source (entrées de l'ancien modèle).
    const cle = o.fixtureKey;
    const d = o.moteur?.distribution;
    if (!clesEchantillon.has(cle) || !Array.isArray(d) || d.length !== 81 || grillesAnciennes.has(cle)) continue;
    if (o.moteur?.source === 'cotes') lectureA.sourceCotes++;
    const g = new Float64Array(441);
    let s = 0;
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) s += d[i * 9 + j];
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) g[i * 21 + j] = d[i * 9 + j] / s;
    grillesAnciennes.set(cle, g);
    lectureA.gardees++;
  }
}
noterRss();

// ------------------------------------------------------------ les issues
let issuesReelles = null;
const lectureIssues = { mode: MODE };
if (ISSUES_LUES) {
  if (REEL) fs.writeFileSync(VERROU, JSON.stringify({ pose: new Date().toISOString(), pid: process.pid, regles: empreintes.regles }), { flag: 'wx' });
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(baseDesIssues, { readOnly: true });
  lectureIssues.base = baseDesIssues;
  const sql = `SELECT code, date_fichier, date, dom, ext, bd, be, mtd, mte, rouges_d, rouges_e FROM fd_history WHERE date BETWEEN '${PERIODES.P2.de}' AND '${PERIODES.P2.a}'`;
  issuesReelles = new Map();
  for (const x of db.prepare(sql).iterate()) {
    const cle = `fd:${x.code}|${x.date_fichier ?? x.date}|${Number(x.dom)}|${Number(x.ext)}`;
    if (!clesEchantillon.has(cle)) continue;
    issuesReelles.set(cle, { hg: x.bd, ag: x.be, hHt: x.mtd, aHt: x.mte, rouges: x.rouges_d + x.rouges_e });
  }
  db.close();
  lectureIssues.sql = sql;
  lectureIssues.lues = issuesReelles.size;
  for (const [cle] of rencontres) {
    const y = issuesReelles.get(cle);
    if (!y || ![y.hg, y.ag, y.hHt, y.aHt, y.rouges].every(entier)) throw new Error(`Issue incomplète pour ${cle} : l’échantillon ne tient plus (rien n’est jugé ; le verrou reste).`);
  }
} else {
  lectureIssues.quoi = 'chaque issue (score final, mi-temps, rouges) est un chemin tiré, selon ses poids, d’une simulation INDÉPENDANTE (graine « porte1-p2-synthetique ») de la même rencontre avec PARAMS et la même grille : aucune colonne d’issue n’est lue, la base n’est pas ouverte.';
}

// ------------------------------------------------------------ le passage
const acc = {
  n: 0,
  marches: Object.fromEntries(MARCHES_RAPPORTES.map((k) => [k, { n: 0, pA: 0, pC: 0, y: 0, llA: 0, llC: 0, pExact: 0, yExact: 0, nExact: 0 }])),
  jambes: Object.fromEntries(CLES_JAMBES.map((k) => [k, { p: 0, y: 0, pAncien: 0, yAncien: 0 }])),
  combines: BANC.COMBINES_DU_BANC.map((c) => ({ nom: c.nom, pG: 0, pI: 0, p0: 0, r: 0, lG: 0, lI: 0, l0: 0, pGAncien: 0, pIAncien: 0, nAncien: 0, rAncien: 0 })),
  masseA: 0, masseC: 0, masseMaxA: 0, tailleA: 0, exactSautees: 0, ecartControleMax: 0, sansGrilleAncienne: 0, controles: 0
};
const lignesDuBloc = [];
const lignesF3a = [];
const lignesRho = [];
const lignesAncien = [];
const lignesDuMatch = [];
const tirage = { u: null };
for (let im = 0; im < rencontres.length; im++) {
  const [cle, date, lambda, mu] = rencontres[im];
  const grille = grilleDesButs(lambda, mu, rho);
  const seed = SM.graineDuMatch({ cle, role: 'porte1-p2', lambda, mu, rho });
  const chA = SM.simulerMatch({ lambda, mu, grille, params: PARAMS, n: N_CHEMINS, seed });
  const chC = SM.simulerMatch({ lambda, mu, grille, params: PARAMS_SANS_EFFETS, n: N_CHEMINS, seed });
  const dA = SM.marchesDesChemins(chA, { arrondi: null });
  const dC = SM.marchesDesChemins(chC, { arrondi: null });
  const annonces = { A: {}, C: {} };
  for (const k of BANC.MARCHES_JUGES) {
    annonces.A[k] = lire(dA, k);
    annonces.C[k] = lire(dC, k);
  }
  // L'issue.
  let issue;
  if (ISSUES_LUES) issue = issuesReelles.get(cle);
  else {
    const seedS = SM.graineDuMatch({ cle, role: 'porte1-p2-synthetique', lambda, mu, rho });
    const chS = SM.simulerMatch({ lambda, mu, grille, params: PARAMS, n: N_CHEMINS, seed: seedS });
    const u = SM.generateur(SM.fnv1a(`${cle}|porte1-p2|tirage-synthetique`))();
    let cum = 0;
    let p = chS.n - 1;
    for (let q = 0; q < chS.n; q++) {
      cum += chS.poids[q];
      if (u < cum) {
        p = q;
        break;
      }
    }
    issue = { hg: chS.ftH[p], ag: chS.ftA[p], hHt: chS.htH[p], aHt: chS.htA[p], rouges: chS.rougesH[p] + chS.rougesA[p] };
  }
  const { hg, ag } = issue;
  const y = BANC.issuesDuMatch({ hg, ag, hHt: issue.hHt, aHt: issue.aHt, buts: null, rouges: issue.rouges });
  const ligne = BANC.ligneDuMatch({ cle, date, annonces, issues: y });
  lignesDuMatch.push(ligne);
  // La décomposition exacte (le score final réel connu) : P_A(M | case réelle), sur les chemins finis dans la case réelle.
  // Contrôle des définitions locales (une rencontre sur 50, dans l’ordre) : la somme stratifiée refaite ici = marchesDesChemins.
  const T = 21;
  const cReelle = Math.min(hg, T - 1) * T + Math.min(ag, T - 1);
  const controle = im % 50 === 0;
  const nCase = new Float64Array(T * T);
  const comptes = MARCHES_RAPPORTES.map(() => new Float64Array(T * T));
  for (let p = 0; p < chA.n; p++) {
    const c = chA.ftH[p] * T + chA.ftA[p];
    nCase[c]++;
    if (!controle && c !== cReelle) continue;
    const rouge = chA.rougesH[p] + chA.rougesA[p] > 0;
    for (let i = 0; i < MARCHES_RAPPORTES.length; i++) if (vraiSurChemin(MARCHES_RAPPORTES[i], chA.htH[p], chA.htA[p], chA.ftH[p], chA.ftA[p], rouge)) comptes[i][c]++;
  }
  if (controle) {
    acc.controles++;
    for (let i = 0; i < MARCHES_RAPPORTES.length; i++) {
      let s = 0;
      for (let c = 0; c < T * T; c++) if (nCase[c]) s += (grille[c] / chA.couverte) * (comptes[i][c] / nCase[c]);
      acc.ecartControleMax = Math.max(acc.ecartControleMax, Math.abs(s - annonces.A[MARCHES_RAPPORTES[i]]));
    }
  }
  if (!nCase[cReelle]) acc.exactSautees++;
  for (let i = 0; i < MARCHES_RAPPORTES.length; i++) {
    const k = MARCHES_RAPPORTES[i];
    const m = acc.marches[k];
    if (y[k] === null || y[k] === undefined) continue;
    m.n++;
    m.pA += annonces.A[k];
    m.pC += annonces.C[k];
    m.y += y[k];
    m.llA += ligne.ll.A[k];
    m.llC += ligne.ll.C[k];
    if (nCase[cReelle]) {
      m.nExact++;
      m.pExact += comptes[i][cReelle] / nCase[cReelle];
      m.yExact += y[k];
    }
  }
  for (const k of MARCHES_DU_BLOC) lignesDuBloc.push({ bloc: cle, date, a: ligne.ll.C[k], b: ligne.ll.A[k] });
  // Les combinés (grille de la candidate, brute), leurs jambes, et la grille de l'ancien modèle.
  const combos = BANC.lignesDesCombines({ lambda, mu, rho, hg, ag });
  const gA = grillesAnciennes.get(cle) ?? null;
  if (!gA) acc.sansGrilleAncienne++;
  const pj = {};
  const pjA = {};
  for (const k of CLES_JAMBES) {
    pj[k] = pJambe(grille, k);
    const j = acc.jambes[k];
    j.p += pj[k];
    j.y += PRED[k](hg, ag) ? 1 : 0;
    if (gA) {
      pjA[k] = pJambe(gA, k);
      j.pAncien += pjA[k];
      j.yAncien += PRED[k](hg, ag) ? 1 : 0;
    }
  }
  combos.forEach((x, c) => {
    const s = acc.combines[c];
    s.pG += x.pG;
    s.pI += x.pI;
    s.p0 += x.p0;
    s.r += x.r;
    s.lG += x.lG;
    s.lI += x.lI;
    s.l0 += x.l0;
    lignesF3a.push({ bloc: cle, date, a: x.lI, b: x.lG });
    lignesRho.push({ bloc: cle, date, a: x.l0, b: x.lG });
    if (gA) {
      const pG = J.probabiliteDuCombine({ jambes: BANC.COMBINES_DU_BANC[c].jambes, grille: gA }).probabilite;
      const pI = COMBINES_JAMBES[c].reduce((t, k) => t * pjA[k], 1);
      s.pGAncien += pG;
      s.pIAncien += pI;
      s.rAncien += x.r;
      s.nAncien++;
      const ll = (p) => BANC.perteLog(p, x.r, { plancher: 1e-9, sur: 'issue' });
      lignesAncien.push({ bloc: cle, date, a: ll(pI), b: ll(pG) });
    }
  });
  acc.masseA += chA.masseNonCouverte;
  acc.masseC += chC.masseNonCouverte;
  acc.masseMaxA = Math.max(acc.masseMaxA, chA.masseNonCouverte);
  acc.tailleA += chA.tailleEffective;
  acc.n++;
  if (acc.n % 1000 === 0) {
    noterRss();
    console.error(`${acc.n} / ${rencontres.length} rencontres, ${((Date.now() - t0) / 1000).toFixed(0)} s, RSS ${(process.memoryUsage().rss / 2 ** 20).toFixed(0)} Mo`);
  }
}
noterRss();
const dureeSimulationS = (Date.now() - t0) / 1000;

// ------------------------------------------------------------ le jugement, tel qu'écrit
const n = acc.n;
const pt = (x) => (100 * x) / n;
const arr = (x, d = 2) => (x === null || x === undefined ? null : Number(x.toFixed(d)));
const resumeJuge = (r) => ({ verdict: r.verdict, gainMillieme: arr(r.gain === null ? null : 1000 * r.gain, 3), fourchetteMillieme: r.fourchette ? r.fourchette.map((x) => arr(1000 * x, 6)) : null, matchs: r.n.matchs, lignes: r.n.lignes, variantes: r.seuil.variantes, z: arr(r.seuil.z, 3), raison: r.raison });

const jambesResume = Object.fromEntries(CLES_JAMBES.map((k) => {
  const j = acc.jambes[k];
  return [k, { annonce: arr(pt(j.p)), realise: arr(pt(j.y)), ecart: arr(pt(j.p - j.y)), annonceAncien: acc.n - acc.sansGrilleAncienne ? arr((100 * j.pAncien) / (acc.n - acc.sansGrilleAncienne)) : null }];
}));
// F3a — combinés.
const juge3a = comparer(lignesF3a, OPTIONS_DU_JUGE);
const jugeRho = comparer(lignesRho, OPTIONS_DU_JUGE);
const jugeAncien = lignesAncien.length ? comparer(lignesAncien, OPTIONS_DU_JUGE) : null;
const combines = acc.combines.map((s, c) => {
  const annonce = s.pG / n;
  const brut = pt(s.pG - s.r);
  const legs = COMBINES_JAMBES[c];
  // Net PROPORTIONNEL (la porte) : l'excès que les biais des jambes simples impliquent pour le combiné, au premier ordre
  // (chaque jambe ramenée à son réalisé par un facteur sur ses cases) : annoncé moyen × Σ_jambes écart_j / annoncé_j.
  const herite = annonce * legs.reduce((t, k) => t + pt(acc.jambes[k].p - acc.jambes[k].y) / (acc.jambes[k].p / n), 0);
  const net = brut - herite;
  // Net ADDITIF (rapporté) : écart du combiné − Σ écarts des jambes.
  const netAdditif = brut - legs.reduce((t, k) => t + pt(acc.jambes[k].p - acc.jambes[k].y), 0);
  const nA = s.nAncien;
  const ancien = nA
    ? (() => {
        const aA = s.pGAncien / nA;
        const brutA = (100 * (s.pGAncien - s.rAncien)) / nA;
        const heriteA = aA * legs.reduce((t, k) => t + ((100 * (acc.jambes[k].pAncien - acc.jambes[k].yAncien)) / nA) / (acc.jambes[k].pAncien / nA), 0);
        return { annonce: arr(100 * aA), produit: arr((100 * s.pIAncien) / nA), realise: arr((100 * s.rAncien) / nA), brut: arr(brutA), net: arr(brutA - heriteA) };
      })()
    : null;
  return {
    nom: s.nom,
    jambes: legs,
    annonce: arr(100 * annonce),
    produit: arr(pt(s.pI)),
    rhoZero: arr(pt(s.p0)),
    realise: arr(pt(s.r)),
    brut: arr(brut),
    heriteDesJambes: arr(herite),
    net: arr(net),
    netAdditif: arr(netAdditif),
    perteLog: { grille: arr(s.lG / n, 5), produit: arr(s.lI / n, 5), rhoZero: arr(s.l0 / n, 5) },
    eteint: Math.abs(arr(net)) > SEUIL_COMBINE_NET, // décidé sur le net arrondi au centième de point (celui de la note)
    ancien
  };
});
// F2c — effets du score, et les marchés de mi-temps.
const juge2c = comparer(lignesDuBloc, OPTIONS_DU_JUGE);
const scoreHerite = Object.fromEntries(Object.entries(CLE_DU_SCORE).map(([k, cj]) => [k, { libelle: LIBELLES_DU_SCORE[k], annonce: jambesResume[cj].annonce, realise: jambesResume[cj].realise, ecart: arr(pt(acc.jambes[cj].p - acc.jambes[cj].y)) }]));
const ecartees = acc.exactSautees;
const nonVerifie = ecartees > PART_MAX_ECARTEE * n;
const marches = MARCHES_RAPPORTES.map((k) => {
  const m = acc.marches[k];
  const brut = (100 * (m.pA - m.y)) / m.n;
  const h = Object.prototype.hasOwnProperty.call(HERITAGE, k) ? HERITAGE[k] : undefined;
  const ecartHerite = h ? (100 * (acc.jambes[CLE_DU_SCORE[h]].p - acc.jambes[CLE_DU_SCORE[h]].y)) / n : h === null ? 0 : null;
  const netAdditif = h === undefined ? null : brut - ecartHerite;
  const netExact = m.nExact ? (100 * (m.pExact - m.yExact)) / m.nExact : null;
  const dansLaPorte = MARCHES_DE_LA_PORTE.includes(k);
  return {
    cle: k,
    libelle: BANC.LIBELLES[k],
    dansLaPorte,
    n: m.n,
    annonce: arr((100 * m.pA) / m.n),
    annonceSansEffets: arr((100 * m.pC) / m.n),
    realise: arr((100 * m.y) / m.n),
    brut: arr(brut),
    herite: h === undefined ? null : h,
    ecartHerite: h ? arr(ecartHerite) : null,
    netAdditif: arr(netAdditif),
    perteLog: { avecEffets: arr(m.llA / m.n, 5), sansEffets: arr(m.llC / m.n, 5) },
    nExact: m.nExact,
    netExact: arr(netExact),
    // La porte par marché : |net exact| (arrondi au centième de point) ≤ 1 pt ; « non vérifié » → éteint.
    eteint: dansLaPorte ? nonVerifie || netExact === null || Math.abs(arr(netExact)) > SEUIL_MARCHE_NET : null
  };
});
const calib = BANC.calibration(lignesDuMatch, { variante: 'A', marches: MARCHES_RAPPORTES });
const deciles = Object.fromEntries(MARCHES_RAPPORTES.map((k) => [k, calib[k].deciles.map((d, i) => (d.n >= 300 ? { de: i / 10, n: d.n, annonce: arr((100 * d.p) / d.n, 1), realise: arr((100 * d.r) / d.n, 1) } : null)).filter(Boolean)]));

// La règle de la porte (décision de l'orchestrateur).
// « retenu » du juge = au moins 200 rencontres ET borne basse > 0 ; F2c vérifié = au moins 200 rencontres ET borne haute > 0.
const f3aRetenu = juge3a.verdict === 'retenu' && juge3a.fourchette[0] > 0;
const f2cMoinsBon = !(juge2c.verdict !== 'pas-assez-de-matchs' && juge2c.fourchette && juge2c.fourchette[1] > 0);
const porte = !f3aRetenu || f2cMoinsBon ? 'fermee' : 'ouverte';
const sortie = {
  format: 1,
  mode: MODE,
  quoi: REEL ? 'Porte 1 de l’étape 28 sur football-data P2 : LE passage unique sur les vraies issues.' : MODE === 'reelles-essai' ? 'Essai du chemin des issues lues, sur une base d’essai aux issues TIRÉES (aucune issue réelle).' : 'Répétition générale : issues SYNTHÉTIQUES tirées du modèle (aucune issue réelle lue).',
  debut: new Date(t0).toISOString(),
  fin: new Date().toISOString(),
  empreintes,
  echantillon: { fichier: fichierEchantillon, sha1: sha1Fichier(fichierEchantillon), rencontres: n, limite },
  n: N_CHEMINS,
  rho,
  graine: 'graineDuMatch({ cle: fixtureKey, role: « porte1-p2 », λ, μ, ρ }) : la même pour avec et sans effets ; synthétiques : rôle « porte1-p2-synthetique » et tirage fnv1a(« <clé>|porte1-p2|tirage-synthetique »)',
  juge: OPTIONS_DU_JUGE,
  lectureRejeuA: lectureA,
  lectureIssues,
  porte,
  f3a: { bloc: resumeJuge(juge3a), retenu: f3aRetenu, seuilNet: SEUIL_COMBINE_NET, combines, eteints: combines.filter((c) => c.eteint).map((c) => c.nom) },
  f2c: {
    bloc: resumeJuge(juge2c),
    moinsBon: f2cMoinsBon,
    marchesDuBloc: MARCHES_DU_BLOC,
    parMarche: { regle: '|net exact| ≤ 1 pt (arrondi au centième), 17 marchés', marches: MARCHES_DE_LA_PORTE, seuilNet: SEUIL_MARCHE_NET, ecartees, partEcartee: arr((100 * ecartees) / n, 3), partMax: 100 * PART_MAX_ECARTEE, nonVerifie },
    marches,
    eteints: marches.filter((m) => m.eteint).map((m) => m.cle)
  },
  rapportes: {
    rho: resumeJuge(jugeRho),
    ancienModele: jugeAncien ? { bloc: resumeJuge(jugeAncien), rencontres: lignesAncien.length / BANC.COMBINES_DU_BANC.length, sansGrille: acc.sansGrilleAncienne } : null,
    scoreHerite,
    jambes: jambesResume,
    deciles,
    decompositionExacte: { sautees: acc.exactSautees, quoi: 'netExact = moyenne de P_avecEffets(marché | score final réel) − réalisé, sur les rencontres dont la case du score réel a au moins un chemin' },
    masseNonCouverte: { avecEffets: arr((100 * acc.masseA) / n, 4), sansEffets: arr((100 * acc.masseC) / n, 4), maxAvecEffets: arr(100 * acc.masseMaxA, 4) },
    tailleEffectiveMoyenne: arr(acc.tailleA / n, 0),
    controleDesDefinitions: { rencontres: acc.controles, ecartMax: acc.ecartControleMax }
  },
  dureeS: { simulation: arr(dureeSimulationS, 1), total: arr((Date.now() - t0) / 1000, 1) },
  rssMaxMo: Math.round(Math.max(rssMax.v, process.memoryUsage().rss) / 2 ** 20),
  zK: arr(zPour(0.05, K), 3)
};
fs.writeFileSync(fichierSortie, JSON.stringify(sortie, null, 1));
console.log(`porte ${porte} ; F3a ${juge3a.verdict} ${JSON.stringify(sortie.f3a.bloc.fourchetteMillieme)} ; F2c ${juge2c.verdict} ${JSON.stringify(sortie.f2c.bloc.fourchetteMillieme)} ; combinés éteints ${sortie.f3a.eteints.length} ; marchés éteints ${sortie.f2c.eteints.length} ; ${n} rencontres ; ${sortie.dureeS.total} s ; RSS max ${sortie.rssMaxMo} Mo${NL}sortie : ${fichierSortie}`);
