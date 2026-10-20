#!/usr/bin/env node
/**
 * team-strength.mjs — L'INDICE DE FORCE DES ÉQUIPES (étape 29 du plan), dans le BAC À SABLE.
 * -----------------------------------------------------------------------
 * La passe de nuit de l'étape « indiceForce » (src/data/db/teamStrength.js, indiceDeForce) sur la base du
 * bac : le rejeu dans un PROCESSUS À PART (base en lecture seule), puis le rangement ici dans team_strength /
 * team_strength_state — la mesure de ce que fera la première nuit chez Pierre. Chez Pierre, le même code
 * tourne DANS le serveur (l'actualisation) : un seul écrivain.
 *
 *   node scripts/team-strength.mjs [--tout] [--sur-place] [--banc [--sans-declarer] [--tirages N]] [--classements] [--json]
 *
 * Par défaut : exactement l'étape de la passe (rien si aucune rencontre n'a bougé depuis le dernier
 * calcul ; sinon les seuls championnats touchés ; tout, la première fois). --tout : tout refaire.
 * --sur-place : le rejeu dans ce processus, en rendant la main toutes les ~25 ms (la mesure de ce que
 * coûterait le calcul DANS le serveur). --banc : la MESURE AU BANC (teamStrengthBanc.js : l'indice face au
 * classement corrigé xG et au classement réel, la veille de chaque match ; poids et liens appris sur P4a,
 * preuve sur P3), dans ce processus (un outil du bac, jamais lancé par le serveur), rangée dans
 * team_strength_state (clé « banc ») ; ses variantes sont déclarées au registre de la mesure de l'étape 16
 * (data/runtime/registre-mesure.json du bac), sauf --sans-declarer. --classements : le classement des
 * indices face au classement réel et au classement corrigé xG de la saison en cours, championnat par
 * championnat (corrélation des rangs), pour la feuille de route.
 *
 * REFUS : sous OneDrive, hors du bac à sable, sur la vraie base, base ouverte par un autre processus (un
 * serveur du bac tourne), verrou d'actualisation tenu. Sortie : le résumé sur stderr, une ligne JSON de
 * bilan sur stdout (durées, mémoire de ce processus et de l'enfant, plus long blocage, -wal).
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDbPath, openDb, closeDb } from '../src/data/db/matchStatsDb.js';
import { modeBacASable, verifierBaseDuBac, VRAIE_BASE } from '../src/config/bacASable.js';
import { withRefreshLock, lockHolder } from '../src/data/providers/refreshLock.js';
import { indiceDeForce, lireIndiceDeForce } from '../src/data/db/teamStrength.js';
import { mesurerAuBanc } from '../src/data/db/teamStrengthBanc.js';
import { expectedPointsTable } from '../src/data/db/expectedPoints.js';
import { executerEnRendantLaMain, creerPauses } from '../src/utils/travailCooperatif.js';
import { baseOccupee } from './sandbox-commun.mjs';

const SERVEUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const valeur = (option) => {
  const i = argv.indexOf(option);
  return i >= 0 ? argv[i + 1] : undefined;
};
const seulementJson = argv.includes('--json');
const mo = (o) => (o === null || o === undefined ? '?' : `${(o / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`);
const dire = (texte) => {
  if (!seulementJson) process.stderr.write(`${texte}\n`);
};
function refuser(raison) {
  process.stderr.write(`[indice de force] REFUS : ${raison}\n`);
  process.stdout.write(`${JSON.stringify({ refus: raison })}\n`);
  process.exit(2);
}

// ------------------------------------------------------------ garde-fous
if (/[\\/]onedrive[^\\/]*([\\/]|$)/i.test(SERVEUR)) refuser(`à lancer depuis la copie du bac (bac-a-sable\\code\\server), jamais sous OneDrive (${SERVEUR}). Dans l'appli, le calcul tourne dans l'actualisation du serveur.`);
if (!modeBacASable()) refuser("ce script sert au bac à sable ; dans l'appli, le calcul tourne dans l'actualisation du serveur.");
const base = resolveDbPath();
const v = verifierBaseDuBac(base);
if (!v.ok) refuser(`base refusée : ${v.raison}`);
if (base.toLowerCase() === VRAIE_BASE.toLowerCase()) refuser("c'est la vraie base.");
if (!fs.existsSync(base)) refuser(`la copie de la base n'existe pas (${base}).`);
if (baseOccupee(base)) refuser(`la base ${base} est ouverte par un autre processus (un serveur du bac tourne ?) : on n'écrit jamais pendant qu'un serveur tourne.`);
const detenteur = lockHolder();
if (detenteur && !detenteur.self) refuser(`le verrou d'actualisation est tenu par le processus ${detenteur.pid} depuis ${detenteur.startedAt} : une passe ou un serveur écrit, rien fait.`);

const tout = argv.includes('--tout');
const surPlace = argv.includes('--sur-place');
const banc = argv.includes('--banc');
const classements = argv.includes('--classements');
const declarer = !argv.includes('--sans-declarer');
const tirages = valeur('--tirages') !== undefined ? Number(valeur('--tirages')) : 1000;

const taille = (f) => {
  try {
    return fs.statSync(f).size;
  } catch {
    return null;
  }
};
const walAvant = taille(`${base}-wal`);
dire(`[indice de force] base : ${base} (${mo(taille(base))}, -wal ${mo(walAvant ?? 0)})`);
const database = openDb();
const rssDepart = process.memoryUsage.rss();
const debut = performance.now();
let walMax = walAvant ?? 0;
const memoireMax = { rss: 0, tas: 0, tableaux: 0 };
const veille = setInterval(() => {
  const m = process.memoryUsage();
  memoireMax.rss = Math.max(memoireMax.rss, m.rss);
  memoireMax.tas = Math.max(memoireMax.tas, m.heapUsed);
  memoireMax.tableaux = Math.max(memoireMax.tableaux, m.arrayBuffers);
  walMax = Math.max(walMax, taille(`${base}-wal`) ?? 0);
}, 500);
veille.unref?.();
// Le retard de la boucle d'événements de CE processus (le serveur, chez Pierre) : un battement toutes les 50 ms.
let retardMaxMs = 0;
let attendu = performance.now() + 50;
const coeur = setInterval(() => {
  const maintenant = performance.now();
  retardMaxMs = Math.max(retardMaxMs, maintenant - attendu);
  attendu = maintenant + 50;
}, 50);
coeur.unref?.();

const sortie = { base };
const resultat = await withRefreshLock(
  async () => {
    const r = await indiceDeForce({ database, chemin: base, force: tout, aPart: !surPlace });
    const retardPasse = retardMaxMs;
    let mesure = null;
    if (banc && r.mode !== 'echec') {
      const tBanc = performance.now();
      const pauses = creerPauses();
      mesure = await executerEnRendantLaMain(mesurerAuBanc({ database, tirages, declarer }), pauses.siLongtemps);
      mesure.dureeTotaleMs = Math.round(performance.now() - tBanc);
      database.prepare('INSERT OR REPLACE INTO team_strength_state (cle, valeur) VALUES (?, ?)').run('banc', JSON.stringify(mesure));
    }
    return { r, mesure, retardPasse };
  },
  { stamp: false, nom: 'indice-de-force' }
);
clearInterval(veille);
clearInterval(coeur);
if (resultat?.skipped) refuser(`verrou d'actualisation : ${resultat.skipped}`);
const { r, mesure, retardPasse } = resultat;
const dureeTotaleMs = Math.round(performance.now() - debut);
sortie.mode = r.mode;
if (r.mode === 'echec') dire(`ERREUR : ${r.erreur}`);
else if (r.mode === 'rien') dire(`Rien à refaire : aucune rencontre n'a bougé depuis le calcul du ${r.calculeLe} (${r.dureeMs} ms).`);
else {
  const b = r.bilanDuCalcul ?? {};
  dire(`Calcul (${r.mode}${r.complet ? ', complet' : ''}) : ${r.lignes} lignes calculées, ${r.ecrites} écrites, ${r.retirees} retirées, en ${Math.round(r.dureeMs / 100) / 10} s ; rejeu ${Math.round((b.dureeMs ?? 0) / 100) / 10} s (${JSON.stringify(b.parties)}), rangement ${r.rangementMs} ms.`);
  dire(`Rejeu : ${b.rencontres} rencontres, ${b.utilisees} utilisées ; écartées ${JSON.stringify(b.ecartees)} ; ${b.resolutions} résolutions, ${b.tours} tours (au plus ${b.toursMax}), ${b.nonConvergees} non convergées ; ${b.championnats} championnats${r.portee ? ` (portée : ${JSON.stringify(r.portee)})` : ''}.`);
  dire(surPlace ? `Sur place : le plus long moment sans rendre la main ${r.blocMaxMs} ms.` : `Calcul à part : RSS de l'enfant ${mo(b.aPart?.rssMaxOctets)} au plus haut (${mo(b.aPart?.rssFinOctets)} à la fin) ; ce processus (le serveur, chez Pierre) n'a jamais été tenu plus de ${Math.round(retardPasse)} ms d'affilée (rangement : ${r.blocMaxMs} ms au plus sans rendre la main).`);
}
sortie.passe = { ...r, bilanDuCalcul: undefined, bilan: r.bilanDuCalcul ?? null };
if (mesure) {
  dire(`Banc (${Math.round(mesure.dureeTotaleMs / 1000)} s) : ${mesure.reponse?.phrase ?? '—'}`);
  for (const j of mesure.jugements) {
    dire(`  ${j.periode.padEnd(7)} ${j.id.padEnd(20)} ${String(j.n).padStart(6)} matchs  référence ${j.reference.perteLog?.toFixed(4)}  indice ${j.indice.perteLog?.toFixed(4)}  gain ${j.gainPourcent?.toFixed(2)} % [${j.fourchettePourcent?.map((x) => x.toFixed(2)).join(' ; ')}]  ${j.verdict}`);
  }
  dire(`Poids du code à jour : ${mesure.poidsDuCode.aJour} (écart ${mesure.poidsDuCode.ecartMax}) ; variantes au registre : ${mesure.variantes.auRegistre}, K = ${mesure.variantes.K}.`);
  sortie.banc = { reponse: mesure.reponse, poidsDuCode: mesure.poidsDuCode, variantes: mesure.variantes, jugements: mesure.jugements.map(({ vues, ...j }) => ({ ...j, vues })), dureeMs: mesure.dureeTotaleMs };
}
if (classements) {
  // Le classement des indices face au réel et au corrigé xG, saison en cours, championnat par championnat.
  const spearman = (x, y) => {
    const n = x.length;
    if (n < 4) return null;
    const rang = (t) => {
      const o = t.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
      const r2 = new Array(n);
      for (let i = 0; i < n; ) {
        let j = i;
        while (j + 1 < n && o[j + 1][0] === o[i][0]) j++;
        for (let k = i; k <= j; k++) r2[o[k][1]] = (i + j) / 2 + 1;
        i = j + 1;
      }
      return r2;
    };
    const a = rang(x);
    const b = rang(y);
    const ma = a.reduce((s, v) => s + v, 0) / n;
    const mb = b.reduce((s, v) => s + v, 0) / n;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < n; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return da && db ? num / Math.sqrt(da * db) : null;
  };
  const lecture = lireIndiceDeForce({ database });
  const parChampionnat = [];
  for (const c of lecture?.championnats ?? []) {
    const indice = lireIndiceDeForce({ database, league: c.championnat });
    const table = expectedPointsTable(c.championnat, { database });
    if (!table) continue;
    const parId = new Map(table.rows.map((row) => [row.teamId, row]));
    const communs = indice.clubs.filter((x) => x.force !== null && parId.has(x.club) && parId.get(x.club).played >= 6);
    if (communs.length < 6) continue;
    const force = communs.map((x) => -x.force);
    const reel = communs.map((x) => parId.get(x.club).rank);
    const avecXg = table.matchesWithXg > 0 && communs.every((x) => parId.get(x.club).playedWithXg >= 6);
    const xg = avecXg ? communs.map((x) => parId.get(x.club).xRank) : null;
    parChampionnat.push({
      championnat: c.championnat,
      saison: table.seasonLabel,
      clubs: communs.length,
      sansXg: communs.filter((x) => x.sansXg).length,
      indiceReel: spearman(force, reel),
      indiceXg: xg ? spearman(force, xg) : null,
      reelXg: xg ? spearman(reel, xg) : null,
      premiers: communs.slice(0, 3).map((x) => ({ nom: x.nom, force: x.force, rangReel: parId.get(x.club).rank, rangXg: parId.get(x.club).xRank, forts: x.pointsForts.slice(0, 3).map((p) => `${p.libelle} ${p.percentile}`), faibles: x.pointsFaibles.slice(0, 3).map((p) => `${p.libelle} ${p.percentile}`) }))
    });
  }
  const moyenne = (k) => {
    const t = parChampionnat.map((x) => x[k]).filter((x) => x !== null && x !== undefined);
    return t.length ? { moyenne: t.reduce((s, x) => s + x, 0) / t.length, championnats: t.length } : null;
  };
  sortie.classements = { indiceReel: moyenne('indiceReel'), indiceXg: moyenne('indiceXg'), reelXg: moyenne('reelXg'), parChampionnat };
  dire(`Classements (saison en cours, corrélation des rangs) : indice / réel ${sortie.classements.indiceReel?.moyenne?.toFixed(3)} (${sortie.classements.indiceReel?.championnats}), indice / corrigé xG ${sortie.classements.indiceXg?.moyenne?.toFixed(3)} (${sortie.classements.indiceXg?.championnats}), réel / corrigé xG ${sortie.classements.reelXg?.moyenne?.toFixed(3)}.`);
}
const rssFin = process.memoryUsage.rss();
closeDb();
const rssMax = Math.max(rssFin, memoireMax.rss);
dire(`Mémoire de ce processus : RSS ${mo(rssDepart)} au départ, ${mo(rssMax)} au plus haut (+${mo(rssMax - rssDepart)}) ; tas ${mo(memoireMax.tas)}, tableaux typés ${mo(memoireMax.tableaux)}. Journal : -wal ${mo(walMax)} au plus haut.`);
process.stdout.write(`${JSON.stringify({ ...sortie, dureeTotaleMs, aPart: !surPlace, retardMaxMs: Math.round(retardPasse), memoire: { rssDepart, rssMax, rssFin, releve: memoireMax }, journal: { walAvant, walMax } })}\n`);
process.exit(r.mode === 'echec' ? 1 : 0);
