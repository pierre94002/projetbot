/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-contexte-essai27.mjs <serveur de la copie> essai27 <options JSON>
 *
 * ÉTAPE 32, T-X7 (critique de l'étape 32, constat 2) : deux fichiers retouchés par l'étape 32 — data/db/matchStatsDb.js
 * (les tables du contexte, créées à chaque ouverture) et bench/lancements.js (la portée « contexte », les variantes et le
 * lancement de l'étape 32) — SONT lus par le chemin de nuit de l'essai de l'étape 27 : moteurABlanc.js construit
 * `registre = { ...mesure, lancements: [...LANCEMENTS, lancementDeLEssai(...)] }` pour jugerEtape, qui passe par
 * compterVariantes et fenetresVues. Ici, sur un essai FABRIQUÉ de la candidate du code (essaiFabrique.mjs : graine fixe,
 * le même essai ligne pour ligne d'un code à l'autre), réseau coupé, heure figée, registres d'ESSAI de la copie :
 *   0. LE PREMIER DÉMARRAGE avec ce code (enregistrerLancements, comme chez Pierre) : les lancements du code notés au
 *      registre de la mesure d'essai — après l'étape 32, le sien aussi : ses vues sont alors celles d'un lancement NOTÉ, que
 *      fenetresVues('27') examine (une vue de portée « moteur » ou « tout » y entrerait) ;
 *   1. la base ouverte par openDb (le DDL de CE code) ; la table du jour J et les forces de la candidate (sans elles,
 *      la nuit attend et ne juge rien) ;
 *   2. l'essai fabriqué, puis L'ÉTAPE DE NUIT elle-même (calculerABlanc, sans match à calculer : l'essai jugé seul),
 *      avant l'horizon : les premiers chiffres rangés au registre des versions d'essai ;
 *   3. le jugement provisoire refait par le MÊME chemin que moteurABlanc.js (le registre de sa ligne 383 : les
 *      lancements du code et celui de l'essai ; le juge sans rien enregistrer) ;
 *   4. les témoins de structure : fenetresVues('27') et compterVariantes('27') avec ce registre, et la liste des
 *      lancements vus.
 * La sortie (une ligne JSON) porte les TEXTES JSON exacts : le test les compare à l'octet à ceux du code d'AVANT
 * l'étape 32 (fixtures/essai27-avant-etape32.json, figé le 29/10/2026 sur le code du bac avant toute retouche).
 */

import fs from 'node:fs';
import { importeur } from './versionsMoteurCommun.mjs';
import { fabriquerEssai } from './essaiFabrique.mjs';

const [serveur, phase, brut] = process.argv.slice(2);
const o = JSON.parse(brut ?? '{}');
const imp = importeur(serveur);
const { openDb } = await imp('data/db/matchStatsDb.js');
const database = openDb();
const s = { ok: true, phase };

if (phase === 'essai27') {
  const TR = await imp('bench/trialsRegistry.js');
  s.lancementsNotes = TR.enregistrerLancements({ fichier: o.mesure, maintenant: Date.parse(o.depuis) }).nouveaux.map((x) => `${x.etape}:${x.version}:${x.le}`);
  const V = await imp('core/engine/engineVersions.js');
  const T = await imp('data/db/dayTable.js');
  const F = await imp('data/db/forcesButs.js');
  const GM = await imp('core/engine/goalModel.js');
  const empreinte = GM.empreinteDesForces(GM.reglagesDuModeleDeButs({ modeleDeButs: V.CANDIDATE_EN_ESSAI.modifications.football.modeleDeButs }));
  await T.construireTableJourJ({ database, rendreLaMain: null, controle: { lignes: 0 } });
  await F.forcesDeButs({ empreintes: [empreinte], database, aPart: false, maintenant: () => Date.now() });
  s.forcesAJour = F.etatForcesButs({ database, empreintes: [empreinte] }).aJour;
  const fab = await fabriquerEssai({
    imp,
    database,
    versions: { fichier: o.versions },
    mesure: { fichier: o.mesure },
    depuis: Date.parse(o.depuis),
    maintenant: Date.parse(o.maintenant),
    joues: o.joues,
    aVenir: o.aVenir,
    revisions: o.revisions,
    magasin: true
  });
  s.fabrication = { joues: fab.joues, duMagasin: fab.duMagasin, inventes: fab.inventes, aVenir: fab.aVenir, lignes: fab.lignes, ecrites: fab.ecrites };
  // 2. L'étape de nuit elle-même : l'essai jugé (avant l'horizon, les premiers chiffres).
  const { calculerABlanc } = await imp('data/enregistreurs/moteurABlanc.js');
  const maintenant = Date.parse(o.maintenant);
  const bilan = await calculerABlanc({ maintenant, database, matchs: [], dansLaPasse: true, versions: { fichier: o.versions }, mesure: { fichier: o.mesure } });
  s.bilanEssai = bilan.essai ?? null;
  s.erreur = bilan.erreur ?? null;
  s.attente = bilan.attente ?? null;
  const rangee = JSON.parse(fs.readFileSync(o.versions, 'utf8')).candidate;
  s.premiersChiffresTexte = JSON.stringify(rangee?.premiersChiffres ?? null);
  s.jugementRangeTexte = JSON.stringify(rangee?.jugement ?? null);
  // 3. Le jugement provisoire refait par le chemin de moteurABlanc.js (registre de sa ligne 383), sans rien enregistrer.
  const { pronosticsABlanc } = await imp('data/enregistreurs/depot.js');
  const { lecteurDesRencontres, cleNumerique } = await imp('data/calibration.js');
  const { executerSansPause } = await imp('utils/travailCooperatif.js');
  const { jugerEtape } = await imp('bench/guard.js');
  const { LANCEMENTS } = await imp('bench/lancements.js');
  const { fenetresVues, compterVariantes } = await imp('bench/trialsRegistry.js');
  const E = await imp('bench/essaiCandidate.js');
  const candidate = V.candidateEnEssai({ fichier: o.versions });
  const essai = candidate.essai;
  const aujourdhui = new Date(maintenant).toISOString().slice(0, 10);
  const revisions = pronosticsABlanc(candidate.id, { database });
  const dates = revisions.map((r) => r.date).filter(Boolean).sort();
  const lecteur = executerSansPause(lecteurDesRencontres(database, { du: dates[0], au: [dates.at(-1) ?? aujourdhui, aujourdhui].sort()[0] }));
  const lire = (f) => (!cleNumerique(f.fixtureKey) || !f.homeId || !f.awayId ? { raison: 'sansIdentifiant' } : lecteur(f));
  const reglement = E.lignesDeLEssai(revisions.filter((r) => r.marketId !== 'scoreExact'), { empreinte: candidate.empreinte, versionEnService: essai.versionEnService, lire, aujourdhui });
  const registre = { fichier: o.mesure, lancements: [...LANCEMENTS, E.lancementDeLEssai(candidate, essai)] };
  const quoi = `Essai à blanc n° ${essai.numero ?? 1} de la candidate « ${candidate.id} » face à la version en service n° ${essai.versionEnService}`;
  const provisoire = jugerEtape({ etape: candidate.etape, lignes: reglement.lignes, mesure: E.MESURE_DE_L_ESSAI, maintenant, quoi, principal: false, enregistrer: false, registre });
  s.provisoireTexte = JSON.stringify(provisoire);
  // 4. Les témoins de structure.
  s.fenetresVues27Texte = JSON.stringify(fenetresVues('27', registre));
  s.variantes27 = compterVariantes('27', registre);
  s.lancementsVus = registre.lancements.map((l) => `${l.etape}:${l.version}`);
  s.registreMesureTexte = fs.readFileSync(o.mesure, 'utf8');
}

console.log(JSON.stringify(s));
