// Étape 28, partie C1, PORTE 1 — PHASE 1, étape 1 : L'ÉCHANTILLON, défini sur les ENTRÉES SEULES.
// Aucune issue réelle de P2 n'est lue : ni score final, ni mi-temps, ni rouges, ni le champ `juge` du bilan, ni les
// lignes de jugement du journal.
//   - Du rejeu b-p2-28.jsonl, on ne lit QUE : type, marketKey, fixtureKey, date, prix, moteur.source,
//     moteur.distribution (lignes scoreExact). Jamais issue, mesures, marche, repere, horsGrille, reglable, moteur.p.
//   - De fd_history : les CLÉS (code, date_fichier, date, dom, ext), les cotes d'AVANT-MATCH plus/moins 2,5
//     (moy_p25, moy_m25 : des entrées du moteur), et des COMPTES (COUNT) avec IS NOT NULL. La complétude des issues
//     (bd, be, mtd, mte, rouges_d, rouges_e non nulles) n'est lue que comme une CONDITION SQL (WHERE … IS NOT NULL) :
//     la requête ne rend que des clés, jamais une valeur de ces colonnes.
//   - Du bilan du rejeu : le seul champ bilan.regimes (comptes par régime), pour contrôler le compte du régime.
// Le régime « cotes-plusmoins-buts » n'est PAS écrit dans les lignes du rejeu (vérifié : structure-lignes.mjs) ; il se
// relit ainsi : moteur.source de la ligne scoreExact = « cotes » (la grille est calée sur le 1N2 : avecCotes) ET l'ancre
// plus/moins 2,5 d'avant-match existe (plusMoinsAvantMatch du bac sur moy_p25/moy_m25, pOver dans ]0 ; 1[, ligne 2,5 :
// la condition exacte de modeleDeButs) ; aucun régime « xg » dans ce rejeu (bilan) : « buts » partout. Le compte doit
// égaler bilan.regimes['cotes-plusmoins-buts'].
// Usage (dans le bac, variables CM_BAC_A_SABLE=1 et MATCH_STATS_DB=<base du bac>) :
//   node echantillon.mjs <b-p2-28.jsonl> <b-p2-28.bilan.json> <candidate.json> <sortie.json>
import fs from 'node:fs';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const BASE_DU_BAC = 'C:/Users/PC/CoteMaster/bac-a-sable/base/match-stats.db';
const SRV = 'C:/Users/PC/CoteMaster/bac-a-sable/code/server/src/';
const norme = (p) => String(p ?? '').split(String.fromCharCode(92)).join('/').toLowerCase();
if (process.env.CM_BAC_A_SABLE !== '1') throw new Error('CM_BAC_A_SABLE=1 obligatoire.');
if (norme(process.env.MATCH_STATS_DB) !== norme(BASE_DU_BAC)) throw new Error(`MATCH_STATS_DB doit être la base du bac (${process.env.MATCH_STATS_DB}).`);
const imp = (rel) => import(pathToFileURL(SRV + rel).href);
const BANC = await imp('data/simulation/simulationBanc.js');
const PRIX = await imp('bench/prix.js');
const { PERIODES } = await imp('bench/periodes.js');

const [, , fichierRejeu, fichierBilan, fichierConfig, sortie] = process.argv;
const t0 = Date.now();
const rho = JSON.parse(fs.readFileSync(fichierConfig, 'utf8')).football.modeleDeButs.rho;
const regimesDuBilan = JSON.parse(fs.readFileSync(fichierBilan, 'utf8')).bilan.regimes; // seul champ lu du bilan
const fini = (x) => typeof x === 'number' && Number.isFinite(x);

// ------------------------------------------------------------ 1. les lignes scoreExact du rejeu (entrées seules)
const sha = crypto.createHash('sha1');
await new Promise((ok, ko) => fs.createReadStream(fichierRejeu).on('data', (b) => sha.update(b)).on('end', ok).on('error', ko));
const statRejeu = fs.statSync(fichierRejeu);
const rejeu = { fichier: fichierRejeu, octets: statRejeu.size, modifie: statRejeu.mtime.toISOString(), sha1: sha.digest('hex') };
const lues = new Map();
let lignes = 0;
let doublons = 0;
const rl = readline.createInterface({ input: fs.createReadStream(fichierRejeu, { encoding: 'utf8' }), crlfDelay: Infinity });
for await (const texte of rl) {
  if (!texte) continue;
  lignes++;
  if (!texte.includes('"marketKey":"scoreExact"')) continue;
  const o = JSON.parse(texte);
  if (o.type !== 'ligne' || o.marketKey !== 'scoreExact') continue;
  const champs = { fixtureKey: o.fixtureKey, date: o.date, prix: o.prix, source: o.moteur?.source ?? null, distribution: o.moteur?.distribution };
  if (lues.has(champs.fixtureKey)) {
    doublons++;
    continue;
  }
  lues.set(champs.fixtureKey, champs);
}

// ------------------------------------------------------------ 2. λ, μ (moindres carrés, la garde 2e-6 par case)
const comptes = { lignesDuRejeu: lignes, scoreExact: lues.size, doublons, distributionPasA81: 0, rejouablesMoindresCarres: 0, rejouablesRapport: 0, ecartMax: 0 };
const parCle = new Map();
for (const [cle, l] of lues) {
  if (!Array.isArray(l.distribution) || l.distribution.length !== 81) {
    comptes.distributionPasA81++;
    continue;
  }
  const r = BANC.reconstituerLambdaMu(l.distribution, rho);
  const rr = BANC.reconstituerLambdaMu(l.distribution, rho, { methode: 'rapport' });
  if (rr.rejouable) comptes.rejouablesRapport++;
  if (r.rejouable) {
    comptes.rejouablesMoindresCarres++;
    comptes.ecartMax = Math.max(comptes.ecartMax, r.ecart);
  }
  parCle.set(cle, { cle, date: l.date, prix: l.prix, source: l.source, lambda: r.lambda, mu: r.mu, ecart: r.ecart, rejouable: r.rejouable });
}

// ------------------------------------------------------------ 3. fd_history : clés, cotes d'avant-match, comptes
const db = new DatabaseSync(BASE_DU_BAC, { readOnly: true });
const P2 = `date BETWEEN '${PERIODES.P2.de}' AND '${PERIODES.P2.a}'`;
const COMPLET = 'bd IS NOT NULL AND be IS NOT NULL AND mtd IS NOT NULL AND mte IS NOT NULL AND rouges_d IS NOT NULL AND rouges_e IS NOT NULL';
const requetes = {
  lignesP2: `SELECT COUNT(*) AS n FROM fd_history WHERE ${P2}`,
  lignesP2Lien0: `SELECT COUNT(*) AS n FROM fd_history WHERE ${P2} AND lien = 0`,
  completesP2: `SELECT COUNT(*) AS n FROM fd_history WHERE ${P2} AND ${COMPLET}`,
  completesP2Lien0: `SELECT COUNT(*) AS n FROM fd_history WHERE ${P2} AND lien = 0 AND ${COMPLET}`,
  clesCompletes: `SELECT code, date_fichier, date, dom, ext FROM fd_history WHERE ${P2} AND ${COMPLET}`,
  clesEtCotes: `SELECT code, date_fichier, date, dom, ext, moy_p25, moy_m25 FROM fd_history WHERE ${P2}`
};
const cleDuFd = (x) => `fd:${x.code}|${x.date_fichier ?? x.date}|${Number(x.dom)}|${Number(x.ext)}`;
const sql = {};
for (const k of ['lignesP2', 'lignesP2Lien0', 'completesP2', 'completesP2Lien0']) sql[k] = db.prepare(requetes[k]).get().n;
const completes = new Set();
for (const x of db.prepare(requetes.clesCompletes).iterate()) completes.add(cleDuFd(x));
const parCleFd = new Map();
let clesFdEnDouble = 0;
for (const x of db.prepare(requetes.clesEtCotes).iterate()) {
  const k = cleDuFd(x);
  if (parCleFd.has(k)) {
    clesFdEnDouble++;
    parCleFd.set(k, null); // clé ambiguë : jamais dans l'échantillon
    continue;
  }
  parCleFd.set(k, { moy_p25: x.moy_p25, moy_m25: x.moy_m25 });
}
db.close();

// ------------------------------------------------------------ 4. le régime, relu ; l'échantillon
const regimes = {};
const etapes = { rejouables: 0, regime: 0, rejouablesEtRegime: 0, cleFdTrouvee: 0, cleFdAmbigue: 0, completes: 0, echantillon: 0 };
const echantillon = [];
for (const r of parCle.values()) {
  const fd = parCleFd.get(r.cle);
  if (fd === undefined) {
    regimes['clé introuvable dans fd_history'] = (regimes['clé introuvable dans fd_history'] ?? 0) + 1;
    continue;
  }
  if (fd === null) {
    etapes.cleFdAmbigue++;
    continue;
  }
  etapes.cleFdTrouvee++;
  const pm = r.source === 'cotes' ? PRIX.plusMoinsAvantMatch(fd, 'fd-avant-match') : null;
  const avecPlusMoins = Boolean(pm) && fini(pm.pOver) && pm.pOver > 0 && pm.pOver < 1 && pm.ligne === 2.5;
  const regime = r.source === 'cotes' ? (avecPlusMoins ? 'cotes-plusmoins-buts' : 'cotes-1n2-buts') : `sans cote (${r.prix}, ${r.source})`;
  regimes[regime] = (regimes[regime] ?? 0) + 1;
  const bonRegime = regime === 'cotes-plusmoins-buts';
  if (r.rejouable) etapes.rejouables++;
  if (bonRegime) etapes.regime++;
  if (r.rejouable && bonRegime) etapes.rejouablesEtRegime++;
  const complete = completes.has(r.cle);
  if (complete) etapes.completes++;
  if (r.rejouable && bonRegime && complete) {
    etapes.echantillon++;
    echantillon.push([r.cle, r.date, r.lambda, r.mu, r.ecart]);
  }
}
echantillon.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
const controleRegime = {
  bilan: { 'cotes-plusmoins-buts': regimesDuBilan['cotes-plusmoins-buts'] ?? null, 'cotes-1n2-buts': regimesDuBilan['cotes-1n2-buts'] ?? null },
  relu: { 'cotes-plusmoins-buts': regimes['cotes-plusmoins-buts'] ?? 0, 'cotes-1n2-buts': regimes['cotes-1n2-buts'] ?? 0 }
};
controleRegime.egal = controleRegime.bilan['cotes-plusmoins-buts'] === controleRegime.relu['cotes-plusmoins-buts'] && controleRegime.bilan['cotes-1n2-buts'] === controleRegime.relu['cotes-1n2-buts'];

const resultat = {
  ecritLe: new Date().toISOString(),
  quoi: 'Porte 1 de l’étape 28 sur football-data P2 : l’échantillon, défini sur les entrées seules (aucune issue lue).',
  rejeu,
  rho,
  reconstitution: { methode: 'moindres-carres', garde: BANC.GARDE_DES_CASES },
  requetes,
  comptesSql: sql,
  comptes,
  clesFdEnDouble,
  regimes,
  regimesDuBilan,
  controleRegime,
  etapes,
  colonnes: ['fixtureKey', 'date', 'lambda', 'mu', 'ecart'],
  rencontres: echantillon
};
fs.writeFileSync(sortie, JSON.stringify(resultat));
const shaSortie = crypto.createHash('sha1').update(fs.readFileSync(sortie)).digest('hex');
console.log(JSON.stringify({ ...resultat, rencontres: `${echantillon.length} rencontres`, sortie, sha1Sortie: shaSortie, dureeS: (Date.now() - t0) / 1000, rssMo: Math.round(process.memoryUsage().rss / 2 ** 20) }, null, 1));
