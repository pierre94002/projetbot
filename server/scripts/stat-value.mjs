#!/usr/bin/env node
/**
 * stat-value.mjs — LA VALEUR DE CHAQUE STATISTIQUE (étape 18 du plan), dans le BAC À SABLE.
 * -----------------------------------------------------------------------
 * Mesure, pour chaque statistique d'équipe et de joueur, sa fiabilité, son
 * point de stabilisation, son pouvoir prédictif, sa demi-vie et sa fenêtre
 * conseillée (src/bench/statValue.js), sur la table du jour J de la base du
 * bac et l'historique football-data, puis range le tableau dans les tables
 * stat_value_runs et stat_value (un INSERT au lancement, une transaction à
 * la fin). Chez Pierre, le même code tourne DANS le serveur, à la main
 * (POST /api/bench/stat-value/run) : un seul écrivain.
 *
 *   node scripts/stat-value.mjs [--echelles equipe,joueur] [--sources magasin,football-data]
 *                               [--statistiques xg_pour,tirs_pour] [--graine N] [--tirages N]
 *                               [--sans-ecrire] [--sur-place [--juge-sur-place]] [--json]
 *
 * Par défaut, comme le serveur : le calcul dans un PROCESSUS À PART (base en
 * lecture seule), le résultat rangé ici. --sur-place : dans ce processus, en
 * rendant la main toutes les ~25 ms et le juge dans un fil à part (la mesure
 * de ce que coûterait le calcul DANS le serveur) ; --juge-sur-place : le juge
 * aussi dans ce fil.
 *
 * REFUS : sous OneDrive, hors du bac à sable, sur la vraie base, base ouverte
 * par un autre processus (un serveur du bac tourne), verrou d'actualisation
 * tenu, table du jour J absente ou pas à jour. Pendant le calcul, la main est
 * rendue toutes les ~25 ms (setImmediate) : le battement du verrou continue.
 * --sans-ecrire : le calcul sous le verrou, sans rien écrire (une mesure).
 * Sortie : le détail sur stderr, une ligne JSON de bilan sur stdout (durées,
 * mémoire, plus long blocage, battements, -wal, le tableau résumé).
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDbPath, openDb, closeDb } from '../src/data/db/matchStatsDb.js';
import { modeBacASable, verifierBaseDuBac, VRAIE_BASE } from '../src/config/bacASable.js';
import { withRefreshLock, lockHolder } from '../src/data/providers/refreshLock.js';
import { etatTableJourJ } from '../src/data/db/dayTable.js';
import { calculerValeurDesStatistiques, ouvrirCalcul, finirCalcul, JUGE_SUR_PLACE } from '../src/bench/statValue.js';
import { ouvrirJugeAPart } from '../src/bench/jugeAPart.js';
import { calculerAPart } from '../src/data/db/valeurStatsAPart.js';
import { baseOccupee } from './sandbox-commun.mjs';

const SERVEUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const valeur = (option) => {
  const i = argv.indexOf(option);
  return i >= 0 ? argv[i + 1] : undefined;
};
const liste = (option) => (valeur(option) ? valeur(option).split(',').map((s) => s.trim()).filter(Boolean) : undefined);
const seulementJson = argv.includes('--json');
const sansEcrire = argv.includes('--sans-ecrire');
const mo = (o) => (o === null || o === undefined ? '?' : `${(o / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`);
const dire = (texte) => {
  if (!seulementJson) process.stderr.write(`${texte}\n`);
};
function refuser(raison) {
  process.stderr.write(`[valeur des stats] REFUS : ${raison}\n`);
  process.stdout.write(`${JSON.stringify({ refus: raison })}\n`);
  process.exit(2);
}

// ------------------------------------------------------------ garde-fous
if (/[\\/]onedrive[^\\/]*([\\/]|$)/i.test(SERVEUR)) refuser(`à lancer depuis la copie du bac (bac-a-sable\\code\\server), jamais sous OneDrive (${SERVEUR}). Dans l'appli, le calcul tourne dans le serveur (POST /api/bench/stat-value/run).`);
if (!modeBacASable()) refuser("ce script sert au bac à sable ; dans l'appli, le calcul tourne dans le serveur.");
const base = resolveDbPath();
const v = verifierBaseDuBac(base);
if (!v.ok) refuser(`base refusée : ${v.raison}`);
if (base.toLowerCase() === VRAIE_BASE.toLowerCase()) refuser("c'est la vraie base.");
if (!fs.existsSync(base)) refuser(`la copie de la base n'existe pas (${base}).`);
if (baseOccupee(base)) refuser(`la base ${base} est ouverte par un autre processus (un serveur du bac tourne ?) : on n'écrit jamais pendant qu'un serveur tourne.`);
const detenteur = lockHolder();
if (detenteur && !detenteur.self) refuser(`le verrou d'actualisation est tenu par le processus ${detenteur.pid} depuis ${detenteur.startedAt} : une passe ou un serveur écrit, rien fait.`);

const options = {};
if (liste('--echelles')) options.echelles = liste('--echelles');
if (liste('--sources')) options.sources = liste('--sources');
if (liste('--statistiques')) options.statistiques = liste('--statistiques');
if (valeur('--graine') !== undefined) options.graine = Number(valeur('--graine'));
if (valeur('--tirages') !== undefined) options.tirages = Number(valeur('--tirages'));

const taille = (f) => {
  try {
    return fs.statSync(f).size;
  } catch {
    return null;
  }
};
const walAvant = taille(`${base}-wal`);
dire(`[valeur des stats] base : ${base} (${mo(taille(base))}, -wal ${mo(walAvant ?? 0)})`);
const database = openDb();
const table = etatTableJourJ({ database });
if (!table.aJour) refuser(`la table du jour J n'est pas à jour (${table.absente ? 'absente' : `version ${table.version}, en cours : ${table.enCours ?? 'non'}`}) : node scripts/build-day-table.mjs d'abord.`);

const rssDepart = process.memoryUsage.rss();
const debut = performance.now();
let battements = 0;
let dernierBattement = null;
let walMax = walAvant ?? 0;
// La mémoire, relevée toutes les 5 s : le tas JavaScript (vivant + à ramasser) et les tableaux typés (les séries).
const memoireMax = { rss: 0, tas: 0, tableaux: 0 };
const veille = setInterval(() => {
  const m = process.memoryUsage();
  memoireMax.rss = Math.max(memoireMax.rss, m.rss);
  memoireMax.tas = Math.max(memoireMax.tas, m.heapUsed);
  memoireMax.tableaux = Math.max(memoireMax.tableaux, m.arrayBuffers);
  const h = lockHolder();
  if (h?.self && h.heartbeatAt && h.heartbeatAt !== dernierBattement) {
    if (dernierBattement !== null) battements++;
    dernierBattement = h.heartbeatAt;
  }
  walMax = Math.max(walMax, taille(`${base}-wal`) ?? 0);
}, 5000);
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

let id = null;
const surPlace = argv.includes('--sur-place');
const juge = surPlace ? (argv.includes('--juge-sur-place') ? JUGE_SUR_PLACE : ouvrirJugeAPart()) : null;
const resultat = await withRefreshLock(
  async () => {
    dernierBattement = lockHolder()?.heartbeatAt ?? null;
    if (!sansEcrire) id = ouvrirCalcul({ database, ou: 'bac', options });
    dire(`[valeur des stats] calcul n° ${id ?? '(sans écrire)'} — table du jour J au ${table.dernierJour}.`);
    let derniereAnnonce = 0;
    const avancement = ({ partie, fait, total }) => {
      if (performance.now() - derniereAnnonce > 30_000) {
        derniereAnnonce = performance.now();
        dire(`[valeur des stats] ${partie} : ${fait}${total ? ` / ${total}` : ''}`);
      }
    };
    const r = surPlace
      ? await calculerValeurDesStatistiques({ database, options, juge, rendreLaMain: (fin) => setImmediate(fin), journal: dire, avancement })
      : await calculerAPart({ chemin: base, options, avancement }).catch((error) => ({ lignes: null, bilan: { erreur: error.message } }));
    if (!sansEcrire) finirCalcul({ database, id, bilan: { ...r.bilan, battements }, lignes: r.lignes ?? [] });
    return r;
  },
  { stamp: false, nom: 'valeur-des-stats' }
);
clearInterval(veille);
clearInterval(coeur);
await juge?.fermer?.();
if (resultat?.skipped) refuser(`verrou d'actualisation : ${resultat.skipped}`);
const dureeTotaleMs = Math.round(performance.now() - debut);
const rssFin = process.memoryUsage.rss();
closeDb();
const b = resultat.bilan;
// Sur place : la mémoire de ce processus porte le calcul ; à part : celle de l'enfant (b.rssMax), dite à part.
const rssMax = surPlace ? Math.max(b.rssMax ?? 0, rssFin, memoireMax.rss) : Math.max(rssFin, memoireMax.rss);
if (b.erreur) dire(`ERREUR : ${b.erreur}`);
dire(`Calcul n° ${id ?? '(sans écrire)'} : ${b.comptes?.lignesDuTableau ?? 0} lignes du tableau en ${Math.round(dureeTotaleMs / 100) / 10} s ; par partie (ms) : ${JSON.stringify(b.parties)}.`);
dire(surPlace ? `Le plus long moment sans rendre la main : ${b.blocMaxMs} ms (${b.blocMaxOu ?? '—'}), ${b.pauses} pauses, ${battements} battements du verrou.` : `Calcul à part (processus ${b.aPart?.pid ?? '?'}) : RSS de l'enfant ${mo(b.rssMax)} au plus haut ; ce processus (le serveur, chez Pierre) n'a jamais été tenu plus de ${Math.round(retardMaxMs)} ms d'affilée ; ${battements} battements du verrou.`);
if (!surPlace) dire(`Mémoire de l'enfant (le calcul) : RSS ${mo(b.rssMax)} au plus haut.`);
dire(`Mémoire de ce processus : RSS ${mo(rssDepart)} au départ, ${mo(rssMax)} au plus haut (+${mo(rssMax - rssDepart)}) ; relevé toutes les 5 s : tas JavaScript ${mo(memoireMax.tas)} au plus haut, tableaux typés ${mo(memoireMax.tableaux)}. Journal : -wal ${mo(walMax)} au plus haut.`);
for (const c of b.controleF10 ?? []) dire(`Contrôle de la fenêtre du moteur (${c.statistique}) : ${c.lignes} lignes, ${c.ecarts} écart(s) face aux colonnes f10 de la table du jour J.`);
const resume = (resultat.lignes ?? []).map((l) => ({
  statistique: l.statistique,
  echelle: l.echelle,
  source: l.source,
  cible: l.cible,
  fiabilite: l.fiabilite ? [l.fiabilite.fiabilite, ...l.fiabilite.fourchette] : null,
  fiabilite10: l.fiabilite?.fiabilite10 ?? null,
  stabilisation: l.fiabilite ? [l.fiabilite.stabilisationSansFin ? 'inf' : l.fiabilite.stabilisation, ...l.fiabilite.stabilisationFourchette] : null,
  pouvoir: l.pouvoir ? [l.pouvoir.r, ...l.pouvoir.fourchette, l.pouvoir.n] : null,
  pouvoir10: l.pouvoir?.rFenetreActuelle ?? null,
  demiVie: l.demiVie ? [l.demiVie.sansFin ? 'inf' : l.demiVie.valeur, l.demiVie.fourchetteBasSansFin ? 'inf' : l.demiVie.fourchette[0], l.demiVie.fourchetteHautSansFin ? 'inf' : l.demiVie.fourchette[1]] : null,
  fenetre: [l.fenetre.verdict, l.fenetre.conseillee, l.fenetre.meilleureAuCalcul, ...l.fenetre.fourchette, l.fenetre.indicatif ? 'indicatif' : ''],
  juges: Object.fromEntries(Object.entries(l.comparaisons ?? {}).filter(([, c]) => c).map(([k, c]) => [k, { verdict: c.verdict, gainRelatif: c.gainRelatif, fourchetteRelative: c.fourchetteRelative, lignes: c.n?.lignes, blocs: c.n?.blocs, vues: c.vues?.parFenetre, horsVues: c.vues?.horsVues, jamaisVues: c.jamaisVues?.verdict ?? null }])),
  verdict: l.verdict
}));
process.stdout.write(`${JSON.stringify({ id, base, dureeTotaleMs, aPart: !surPlace, retardMaxMs: Math.round(retardMaxMs), bilan: { ...b, battements }, memoire: { rssDepart, rssMax, rssFin, ajoute: rssMax - rssDepart, releve5s: memoireMax }, journal: { walAvant, walMax }, resume })}\n`);
process.exit(b.erreur ? 1 : 0);
