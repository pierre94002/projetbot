/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-boucle-ecrans.mjs <serveur de la copie> <phase>
 *
 * Étape 26, partie E — LES RÉPONSES DU VRAI SERVEUR que rendent les écrans de la boucle de correction (le test
 * boucleCorrectionEcran.test.mjs les rend côté serveur, sans navigateur). La copie porte une COPIE FIGÉE des deux registres
 * de Pierre (la candidate de l'étape 27 en essai n° 2 ; elle est déclarée dans le code de la copie) ; heure figée au
 * 01/11/2026 à 08 h UTC. Phases :
 *   vide       rien de trié : GET /api/engine-health, /api/corrections, /api/corrections/tri?mois=2026-10, /journal, /api/config/versions ;
 *   rempli     un tri d'octobre fabriqué (un vrai défaut, des cases jugées, les familles de buts en essai, le détail par régime), une
 *              correction dans chaque état (à mesurer, mesurée, banc impossible, en file, à l'essai, jugée « retenu », adoptée, refusée),
 *              un résumé du mois écrit et son appel au journal des appels : les mêmes routes, et GET /api/claude-budget ;
 *   illisible  une ligne abîmée dans la table des propositions : le bloc et la route disent « illisible » ;
 *   jugee      le registre des versions où la candidate de l'étape 27 est jugée « retenu » : GET /api/config/versions.
 * Les écritures (tri, propositions, journal, résumé) passent par le dépôt de la boucle, dans la base de la COPIE seulement.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur, requeteExpress } from './versionsMoteurCommun.mjs';
import { recopierScripts, usageSimule } from './claudeSimule.mjs';

const [serveur, phase] = process.argv.slice(2);
const imp = importeur(serveur);
const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const D = await imp('data/correction/depotCorrections.js');
const R = await imp('data/correction/regles.js');
const { enregistrerUsage } = await imp('data/repositories/autoAiAnalysisRepository.js');
const { journaliserAppel } = await imp('data/repositories/claudeUsageLedger.js');
recopierScripts(serveur);
const { createApp } = await imp('app.js');
const app = createApp();
const lire = async (url) => {
  const r = await requeteExpress(app, 'GET', url);
  return { code: r.code, corps: r.corps };
};
const T0 = Date.parse(process.env.CM_TEST_MAINTENANT); // 01/11/2026, 08 h UTC (09 h à Paris)
const MIN = 60_000;
const s = { ok: true, phase };

/** Les routes que lisent les écrans de la boucle (et la carte des versions de Réglages). */
async function routes(avecBudget = false) {
  return {
    sante: await lire('/api/engine-health'),
    corrections: await lire('/api/corrections'),
    tri: await lire('/api/corrections/tri?mois=2026-10'),
    journal: await lire('/api/corrections/journal?limite=50'),
    versions: await lire('/api/config/versions'),
    ...(avecBudget ? { budget: await lire('/api/claude-budget') } : {})
  };
}

/** Le tri d'octobre fabriqué, à la forme que range tri.js (22 cases, le détail par régime, les écartés). */
function triDOctobre() {
  const jugees = {
    'totalCorners|niveau': { statut: 'vrai-defaut', ecart: -0.0312, levier: { code: true, phrase: R.DEMANDES_DU_CODE.statistiques } },
    'teamShots|confiance': { statut: 'a-surveiller', ecart: -0.025 },
    'result|niveau': { statut: 'petit-ecart', ecart: 0.012 },
    'result|confiance': { statut: 'dans-la-marge', ecart: 0.004 },
    'totalShots|niveau': { statut: 'dans-la-marge', ecart: -0.006 }
  };
  const cases = R.CASES_DU_TRI.map((cas) => {
    const [famille, mesure] = cas.split('|');
    const j = jugees[cas] ?? null;
    const statut = j ? j.statut : R.estDeButs(famille) ? 'en-essai' : 'trop-tot';
    const ecartMois = j ? j.ecart : R.estDeButs(famille) ? -0.041 : 0.008;
    const fenetre = j
      ? { mois: ['2026-09', '2026-10'], lignes: 2900, matchs: 2840, ecart: j.ecart, annonce: 0.5, realise: 0.5 + j.ecart, fourchette: [j.ecart - 0.011, j.ecart + 0.011], ecartType: 0.003, z: 3.7328, regards: 264, verdictDuJuge: j.statut === 'dans-la-marge' ? 'pas-prouve' : j.ecart < 0 ? 'moins-bon' : 'retenu' }
      : null;
    return {
      cas,
      famille,
      mesure,
      statut,
      dit: R.STATUTS[statut].dit,
      sens: j ? (j.ecart < 0 ? 'trop-haut' : 'trop-bas') : null,
      sensDit: j ? (j.ecart < 0 ? 'annonce trop haut' : 'annonce trop bas') : null,
      canonique: mesure === 'niveau' ? R.familleDe(famille).canonique.dit : null,
      courant: { mois: '2026-10', ecart: ecartMois, lignes: R.familleDe(famille).lignesParMatch * 1420, matchs: 1420, partiel: false },
      mois: j ? [{ mois: '2026-09', ecart: j.ecart - 0.002, lignes: 1480, matchs: 1420, partiel: false }, { mois: '2026-10', ecart: j.ecart + 0.002, lignes: 1420, matchs: 1420, partiel: false }] : [{ mois: '2026-10', ecart: ecartMois, lignes: 1420, matchs: 1420, partiel: false }],
      fenetre,
      enEssai: statut === 'en-essai' ? { candidate: 'modele-buts-v1', etape: '27' } : null,
      levier: j?.levier ?? null
    };
  });
  const statuts = Object.fromEntries(Object.keys(R.STATUTS).map((k) => [k, cases.filter((c) => c.statut === k).length]));
  const regime = (lignes, sa, sb) => ({ lignes, matchs: lignes, sa, sb });
  return {
    mois: '2026-10',
    version: R.VERSION_DU_TRI,
    calculeLe: new Date(T0 - 60 * MIN).toISOString(),
    lignee: { versionEnService: 5, versions: [4, 5], empreinte: 'essai', code: 'essai', avecModeleDeButs: false, enServiceDepuis: '2026-10-22T10:00:00.000Z', couverture: { partiel: true, depuis: '2026-10-22T10:00:00.000Z' } },
    regards: 264,
    resume: { versionEnService: 5, versions: [4, 5], partiel: true, depuis: '2026-10-22T10:00:00.000Z', revisions: 51714, pronostics: 18561, lignes: 11712, matchs: 1420, aVenir: 6028, ecartees: [{ raison: 'autreVersion', libelle: R.RAISONS_DU_TRI.autreVersion, n: 4210 }, { raison: 'sansResultat', libelle: R.RAISONS_DU_TRI.sansResultat, n: 291 }], ecarteesParFamille: {}, statuts, vraisDefauts: cases.filter((c) => c.statut === 'vrai-defaut').map((c) => c.cas), enEssai: { candidate: 'modele-buts-v1', etape: '27', marches: [...R.FAMILLES_DE_BUTS] }, regards: 264, z: 3.7328 },
    cases,
    regimes: { mois: { result: { cotes: regime(1300, 640.5, 650) }, nul: { cotes: regime(1300, 340.1, 352) }, totalGoals: { cotes: regime(1100, 620.2, 560), 'aucune-cote': regime(120, 70.4, 61) }, bothTeamsScore: { cotes: regime(1100, 610.3, 548) }, teamGoals: {}, resultAndTotal: {} } },
    sommes: {}
  };
}

/** Une correction fabriquée, amenée jusqu'à l'état voulu par les transitions du dépôt (chacune avec son entrée au journal). */
function correction(n, { levier, avant, apres, source = 'pierre', jusqua, banc = null }) {
  const id = `c26-p20261031-essai-${n}`;
  const marches = [...R.MARCHES_DU_MODELE_DE_BUTS];
  const declaration = { id, etape: '26', quoi: `Correction d’essai n° ${n}`, enMots: `Vous proposez de changer un réglage du modèle de buts (essai n° ${n}).`, modifications: { football: { modeleDeButs: {} } }, marches };
  let t = T0 - 24 * 60 * MIN + n * 10 * MIN;
  const a = () => (t += MIN);
  D.creerUneProposition({ id, source, levier, avant, apres, marches, declaration, base: 'essai', triMois: source === 'regle' ? '2026-10' : null, triVersion: source === 'regle' ? 1 : null, cas: null }, { database, phrase: `Proposée (essai n° ${n}).`, maintenant: a(), sourceDuJournal: source === 'pierre' ? 'pierre' : 'regle' });
  const pas = (evenement, maj = {}) => D.changerLEtat({ id, evenement, source: 'pierre', phrase: `Essai : ${evenement}.`, maj }, { database, maintenant: a() });
  const chemin = { proposee: [], bancee: ['au-banc', 'bancee'], 'banc-impossible': ['au-banc', 'banc-impossible'], acceptee: ['au-banc', 'bancee', 'acceptee'], 'a-blanc': ['au-banc', 'bancee', 'acceptee', 'mise-a-l-essai'], jugee: ['au-banc', 'bancee', 'acceptee', 'mise-a-l-essai', 'jugee'], adoptee: ['au-banc', 'bancee', 'acceptee', 'mise-a-l-essai', 'jugee', 'adoptee'], refusee: ['refusee'] }[jusqua];
  for (const e of chemin) {
    if (e === 'bancee') pas(e, { banc: banc ?? { le: new Date(t).toISOString(), indicatif: true, verdict: 'retenu', gainPct: 1.2, fourchettePct: [0.3, 2.1], matchs: 3120, parFamille: { totalGoals: { verdict: 'retenu', gainPct: 1.5 }, bothTeamsScore: { verdict: 'pas-prouve', gainPct: 0.4 } } } });
    else if (e === 'banc-impossible') pas(e, { banc: { le: new Date(t).toISOString(), indicatif: true, erreur: 'pas d’historique football-data pour ces marchés' } });
    else if (e === 'acceptee') pas(e, { rangFile: n });
    else if (e === 'mise-a-l-essai') pas(e, { essai: { candidate: id, numero: 1, depuis: '2026-10-28T02:00:00.000Z', versionEnService: 5 } });
    else if (e === 'jugee') pas(e, { essai: { candidate: id, numero: 1, depuis: '2026-10-28T02:00:00.000Z', versionEnService: 5, verdict: 'retenu', jugeLe: '2026-10-31T02:00:00.000Z' } });
    else if (e === 'adoptee') pas(e, { versionAdoptee: 6 });
    else pas(e);
  }
  return id;
}

if (phase === 'vide') {
  s.reponses = await routes();
} else if (phase === 'rempli') {
  D.ecrireLeTri(triDOctobre(), { database, phrase: 'Tri d’octobre 2026 figé (version n° 5, avec n° 4 : mêmes pronostics ; mois partiel) : 1 vrai défaut, 1 à surveiller, 1 petit écart, 2 dans la marge (malchance), 9 trop tôt (un seul mois compté), 8 en essai — « Corners du match », niveau : annonce trop haut (3,1 points).', maintenant: T0 - 60 * MIN });
  s.ids = [
    correction(1, { levier: 'modeleDeButs.rho', avant: -0.05, apres: -0.02, jusqua: 'proposee' }),
    correction(2, { levier: 'modeleDeButs.prior', avant: 8, apres: 12, source: 'regle', jusqua: 'bancee' }),
    correction(3, { levier: 'modeleDeButs.poidsXg', avant: 0.7, apres: 0.6, jusqua: 'banc-impossible' }),
    correction(4, { levier: 'modeleDeButs.melange.avecPlusMoins.wT', avant: 0.1, apres: 0.05, jusqua: 'acceptee' }),
    correction(5, { levier: 'modeleDeButs.melange.avecPlusMoins.wS', avant: 0.2, apres: 0.25, jusqua: 'a-blanc' }),
    correction(6, { levier: 'modeleDeButs.melange.sans.wT', avant: 0.55, apres: 0.28, jusqua: 'jugee' }),
    correction(7, { levier: 'modeleDeButs.melange.sans.wS', avant: 0.3, apres: 0.35, jusqua: 'adoptee' }),
    correction(8, { levier: 'modeleDeButs.demarrageAFroid.matchs', avant: 5, apres: 8, jusqua: 'refusee' })
  ];
  // Le résumé du mois, écrit (comme le ferait l'étape « resumeCorrection ») et son appel, au journal des appels et au plafond.
  D.ecrireUnResume(
    { mois: '2026-10', version: 1, modele: 'claude-code:sonnet', mode: 'normal', texte: { titre: 'Octobre 2026 : un vrai défaut sur les corners, rien à corriger par un réglage', phrases: ['Les corners du match annoncent trop haut de 3,1 points sur 2 840 matchs : c’est un vrai défaut, mais il demande du code.', 'Les familles de buts sont en essai : la candidate de l’étape 27 les corrige déjà.', 'Deux corrections attendent votre décision.'] }, fiche: 'FICHE DU MOIS (essai)', garde: { politique: 'refuser', nombresVus: 4, nombresDeLaFiche: 60 }, usage: { total: 4321 }, coutUsd: 0.02, essai: 1, sansAppel: false, raison: null },
    { database, maintenant: T0 - 30 * MIN, phrase: 'Résumé d’octobre 2026 écrit par Claude (Sonnet) : 3 phrases, chiffres vérifiés.' }
  );
  enregistrerUsage('2026-11-01', { resumeMois: 1 });
  journaliserAppel({ canal: 'claude-code', appel: { type: 'resume-mois', detail: 'résumé d’octobre 2026', mode: 'normal' }, modele: 'claude-code:sonnet', statut: 'ok', usage: usageSimule(4321), coutUsd: 0.02, debut: T0 - 31 * MIN, fin: T0 - 30 * MIN });
  s.reponses = await routes(true);
} else if (phase === 'illisible') {
  database
    .prepare(`INSERT INTO correction_propositions (id, cree_le, source, etat, etat_le, levier, avant, apres, marches, declaration, base, maj_le)
              VALUES ('c26-abimee-1', '2026-11-01T07:00:00.000Z', 'pierre', 'proposee', '2026-11-01T07:00:00.000Z', 'modeleDeButs.rho', '-0.05', '-0.02', '[]', '{pas du json', 'x', '2026-11-01T07:00:00.000Z')`)
    .run();
  s.reponses = await routes();
} else if (phase === 'jugee') {
  s.reponses = { versions: await lire('/api/config/versions') };
}
console.log(JSON.stringify(s));
