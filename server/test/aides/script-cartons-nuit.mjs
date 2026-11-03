/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-cartons-nuit.mjs <serveur de la copie> <phase> <options JSON>
 *
 * LA NUIT DES CARTONS (étape 33, lot 1b, 02/11/2026), sur un MAGASIN FABRIQUÉ (cartonsFabrique.mjs : clubs et matchs
 * fabriqués — aucun résultat réel), réseau coupé, heure figée, base NEUVE de la copie. Phase « nuit » : plusieurs nuits
 * de suite et leurs cas — la première (le vrai processus à part), la suivante (rien à relire), deux rencontres changées,
 * une ligne d'une autre version (tout relu), le jeton pris (reportée), le délai dépassé, des tranches de 5, une nuit
 * interrompue reprise, la fuite plantée ; l'oracle des tables du jour (l'état de CartonsAuJourJ au jour de la nuit) ;
 * le résultat de l'étape pour la passe (l'étape elle-même, qui importe des scripts hors de la copie, est essayée dans le
 * processus du test : cartonsNuit.test.mjs, T-N6). Sortie : une ligne JSON.
 */

import { importeur } from './versionsMoteurCommun.mjs';
import { fabriquerLeMagasinDesCartons, plusJours } from './cartonsFabrique.mjs';

const [serveur, phase, brut] = process.argv.slice(2);
const o = JSON.parse(brut ?? '{}');
const imp = importeur(serveur);
const M = await imp('data/db/matchStatsDb.js');
const N = await imp('data/cartons/cartonsNuit.js');
const C = await imp('data/cartons/cartonsAuJourJ.js');
const L = await imp('data/cartons/lectureDesCartons.js');
const { commencerCalculLourd } = await imp('utils/calculLourd.js');
const { executerSansPause } = await imp('utils/travailCooperatif.js');
const s = { ok: true, phase, pid: process.pid };

/** Tout ce que la nuit a rangé (pour comparer avant / après). */
const base = (database) => ({
  rencontres: database.prepare('SELECT COUNT(*) AS n FROM cartons_rencontres').get().n,
  equipes: database.prepare('SELECT * FROM cartons_equipes ORDER BY club').all().map((r) => ({ ...r })),
  arbitres: database.prepare('SELECT * FROM cartons_arbitres ORDER BY cle').all().map((r) => ({ ...r })),
  etat: database.prepare('SELECT cle FROM cartons_etat ORDER BY cle').all().map((r) => r.cle)
});
const resume = (r, database) => ({
  mode: r.mode,
  erreur: r.erreur ?? null,
  raison: r.raison ?? null,
  cache: r.bilan?.cache ?? null,
  passe: r.bilan?.passe ?? null,
  equipes: r.ecrites?.equipes ?? null,
  arbitres: r.ecrites?.arbitres ?? null,
  rencontres: r.ecrites?.rencontres ?? null,
  controle: r.controle ? { couples: r.controle.couples, lignes: r.controle.lignes, ecarts: r.controle.ecarts, ligues: r.controle.ligues } : null,
  transactions: r.transactions ?? null,
  ordresMax: r.ordresParTransactionMax ?? null,
  blocMaxMs: r.blocMaxMs ?? null,
  plusLongueTrancheMs: r.plusLongueTrancheMs ?? null,
  repriseApres: r.repriseApres ?? null,
  aPart: r.bilan?.aPart ?? null,
  durees: r.bilan?.durees ?? null,
  couverture: r.couverture ?? null,
  base: database ? base(database) : null
});

/** L'oracle des tables du jour : la passe refaite ici (accumulateur seul, sans les relevés de la nuit), état au jour de la nuit. */
function oracle(database, jourD) {
  const maj = executerSansPause(L.mettreAJourLeCache(database));
  const acc = new C.CartonsAuJourJ();
  executerSansPause(C.passerLesRencontres(acc, L.rencontresChronologiques({ database, cache: maj.cache, jusqua: plusJours(jourD, -1) })));
  return acc.etatAuJourJ(jourD);
}

if (phase === 'nuit') {
  const database = M.openDb();
  const fab = fabriquerLeMagasinDesCartons(database, { debut: o.debut ?? '2026-01-05', jours: o.jours ?? 200, aZeroDe: '2026-04-01', aZeroA: '2026-04-20' });
  const dernier = fab.matchs.at(-1).date;
  s.matchs = fab.matchs.length;
  s.dernier = dernier;
  const instant = Date.parse(`${plusJours(dernier, 1)}T10:00:00.000Z`);
  const jourD = N.jourParis(instant);
  s.jourD = jourD;
  // A. La première nuit, dans le VRAI processus à part (le cache vide : tout est relu).
  const A = await N.faireLesCartonsDeLaNuit({ maintenant: instant, database, graine: 20261102 });
  s.nuitA = resume(A, database);
  // T-N2 : les tables du jour = l'état de CartonsAuJourJ au jour de la nuit, à l'octet.
  const etat = oracle(database, jourD);
  const equipesOracle = Object.entries(etat.equipes).map(([club, e]) => ({ club: Number(club), n: e.n, pris: e.pris, provoques: e.provoques, rho: e.rho, pi: e.pi }));
  const equipesBase = s.nuitA.base.equipes.map((r) => ({ club: r.club, n: r.n, pris: r.pris, provoques: r.provoques, rho: r.rho, pi: r.pi }));
  const arbitresOracle = Object.entries(etat.arbitres).filter(([cle]) => !cle.startsWith('faux:')).map(([cle, a]) => ({ cle, matchs: a.n, observes: a.O, attendus: a.E, indice: a.z, premier: a.premier, dernier: a.dernier, ligues: JSON.stringify(a.ligues) }));
  const arbitresBase = s.nuitA.base.arbitres.map((r) => ({ cle: r.cle, matchs: r.matchs, observes: r.observes, attendus: r.attendus, indice: r.indice, premier: r.premier, dernier: r.dernier, ligues: r.ligues }));
  const liguesBase = JSON.parse(database.prepare("SELECT valeur FROM cartons_etat WHERE cle = 'ligues'").get().valeur);
  s.oracle = {
    equipes: equipesOracle.length,
    arbitres: arbitresOracle.length,
    fauxArbitres: Object.keys(etat.arbitres).filter((c) => c.startsWith('faux:')).length,
    equipesEgales: JSON.stringify(equipesOracle) === JSON.stringify(equipesBase),
    arbitresEgaux: JSON.stringify(arbitresOracle) === JSON.stringify(arbitresBase),
    liguesEgales: JSON.stringify(etat.ligues) === JSON.stringify(liguesBase.ligues),
    jourDesLigues: liguesBase.jourD,
    homonymes: arbitresBase.filter((a) => a.cle.startsWith('Jean Dupont|')).map((a) => a.cle),
    exempleEquipe: s.nuitA.base.equipes.find((e) => e.n > 0) ?? null
  };
  s.couverture = JSON.parse(database.prepare("SELECT valeur FROM cartons_etat WHERE cle = 'couverture'").get().valeur);
  s.controleRange = JSON.parse(database.prepare("SELECT valeur FROM cartons_etat WHERE cle = 'controle'").get().valeur);
  // B. La nuit suivante : rien n'a changé, rien n'est relu.
  const B = await N.faireLesCartonsDeLaNuit({ maintenant: instant + 3_600_000, database, aPart: false, graine: 20261102 });
  s.nuitB = resume(B, null);
  // C. Deux rencontres changées (leur signature) : seules elles sont relues.
  database.prepare("UPDATE matches SET updated_at = '2030-01-01T00:00:00.000Z' WHERE match_key IN (?, ?)").run(fab.matchs[5].matchKey, fab.matchs[50].matchKey);
  const Cn = await N.faireLesCartonsDeLaNuit({ maintenant: instant + 2 * 3_600_000, database, aPart: false, graine: 20261102 });
  s.nuitC = resume(Cn, null);
  // D. Une ligne du cache d'une autre version : tout est relu.
  database.prepare('UPDATE cartons_rencontres SET version = 0 WHERE match_key = ?').run(fab.matchs[7].matchKey);
  const D = await N.faireLesCartonsDeLaNuit({ maintenant: instant + 3 * 3_600_000, database, aPart: false, graine: 20261102, tranche: 5 });
  s.nuitD = resume(D, null);
  // Le jeton pris par un autre : reportée, rien de rangé.
  const avant = base(database);
  const rendre = commencerCalculLourd('un autre calcul lourd');
  try {
    s.reporte = resume(await N.faireLesCartonsDeLaNuit({ maintenant: instant + 4 * 3_600_000, database, graine: 20261102 }), database);
  } finally {
    rendre();
  }
  s.reporteInchange = JSON.stringify(s.reporte.base) === JSON.stringify(avant);
  // Le délai dépassé : le processus à part arrêté, rien de rangé.
  s.delai = resume(await N.faireLesCartonsDeLaNuit({ maintenant: instant + 5 * 3_600_000, database, graine: 20261102, delaiMs: 1 }), database);
  s.delaiInchange = JSON.stringify(s.delai.base) === JSON.stringify(avant);
  // Une nuit interrompue pendant son rangement (« en cours » resté) : reprise et finie.
  database.prepare("INSERT INTO cartons_etat (cle, valeur) VALUES ('en_cours', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(JSON.stringify({ calculeLe: '2026-07-01T00:00:00.000Z' }));
  const E = await N.faireLesCartonsDeLaNuit({ maintenant: instant + 6 * 3_600_000, database, aPart: false, graine: 20261102 });
  s.interrompue = resume(E, database);
  // La fuite plantée : les couples relevés APRÈS la publication de leur journée.
  const F = await N.faireLesCartonsDeLaNuit({ maintenant: instant + 7 * 3_600_000, database, aPart: false, graine: 20261102, fuite: true });
  s.fuite = { mode: F.mode, ecarts: F.controle?.ecarts?.length ?? 0, colonnes: [...new Set((F.controle?.ecarts ?? []).map((e) => e.colonne))].sort(), textes: (F.controle?.ecarts ?? []).slice(0, 4).map((e) => e.texte) };
  // Le résultat de l'étape pour la passe (le résumé, l'alerte durable).
  s.etape = N.resultatDeLEtape(A, { updatedAt: '2026-11-02T23:00:00.000Z' });
  s.etapeFuite = N.resultatDeLEtape(F, { updatedAt: '2026-11-02T23:00:00.000Z' });
  s.etapeReporte = N.resultatDeLEtape({ mode: 'reporte', raison: 'Un autre calcul lourd tourne.' });
  s.etapeEchec = N.resultatDeLEtape({ mode: 'echec', erreur: 'base absente', dureeMs: 12 });
}

console.log(JSON.stringify(s));
