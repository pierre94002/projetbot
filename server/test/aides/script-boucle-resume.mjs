/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-boucle-resume.mjs <serveur de la copie> <phase>
 *
 * Étape 26, partie D — LE RÉSUMÉ DU MOIS de la boucle de correction, avec un Claude REMPLACÉ (la réponse du CLI est
 * fabriquée par claudeCodeClient.__testing.simulerClaude ; le reste de callClaudeCode — contrôles et JOURNAL des appels —
 * tourne pour de vrai ; aucun appel réel). Des tris fabriqués rangés dans la base de la copie par le dépôt de la boucle ;
 * heure figée au 01/11/2026 à 07 h UTC (08 h à Paris). Phases :
 *   service   un résumé par mois : écrit en UN appel (type « resume-mois », Sonnet, effort bas, aucun outil), rangé avec son
 *             entrée au journal, le compteur du plafond à 1 (dans les 150) et d'accord avec le journal des appels ; le
 *             second passage n'appelle pas ; rattrapage : le dernier mois trié seulement ; une fiche vide rangée « sans
 *             appel », 0 token ; le mode économe ; le plafond (dailyLimit) jamais changé.
 *   echecs    non configuré, panne vue dans la passe, interrupteur coupé, plafond atteint : aucun appel, aucun essai noté ;
 *             panne, chiffres refusés (rappel au deuxième essai), forme non respectée : rien d'écrit, essais notés, abandon
 *             au troisième ; les appels réussis comptent sur le plafond, le compteur reste d'accord avec le journal.
 *   etape     l'étape « resumeCorrection » de la passe : sa place, son libellé, son « due » et son « pourquoi », jamais
 *             forcée par un clic ni contre l'interrupteur, son résultat à la forme des autres étapes.
 *   etat      ce que lisent l'écran et Santé du moteur (etatDesCorrections().resume, le bloc des corrections).
 *   ecriture  (vérification finale, constat 4) l'appel réussi puis le rangement refusé par la base : l'échec compte parmi
 *             les trois essais, l'abandon au troisième, plus d'appel ensuite.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur, recopierScripts, usageSimule, coutSimule } from './claudeSimule.mjs';

const [serveur, phase] = process.argv.slice(2);
const imp = importeur(serveur);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const { env } = await imp('config/env.js');
const D = await imp('data/correction/depotCorrections.js');
const R = await imp('data/correction/regles.js');
const M = await imp('core/ai/resumeDuMois.js');
const E = await imp('data/correction/etatDesCorrections.js');
const B = await imp('core/ai/claudeBudget.js');
const { enregistrerUsage, statutDuJour } = await imp('data/repositories/autoAiAnalysisRepository.js');
const garde = await imp('core/ai/gardeDesChiffres.js');
const cc = await imp('core/ai/claudeCodeClient.js');

// Le bac coupe l'interrupteur des analyses automatiques à l'import de env.js : l'essai le rallume dans SON processus (comme le bulletin).
const interrupteurDuCode = env.autoAiAnalysis.enabled;
env.autoAiAnalysis.enabled = true;
const plafondAuDepart = env.autoAiAnalysis.dailyLimit;
const T0 = Date.parse(process.env.CM_TEST_MAINTENANT); // 01/11/2026, 07 h UTC (08 h à Paris)
const MIN = 60_000;
const H = 3_600_000;
const JOUR0 = '2026-11-01';
const s = { ok: true, phase, interrupteurDuCode, plafondAuDepart };
process.on('uncaughtException', (error) => {
  console.error(`[script] exception : ${error.stack}\n[script] sortie déjà remplie : ${JSON.stringify(s).slice(0, 4000)}`);
  process.exit(1);
});

// ------------------------------------------------------------------ le Claude remplacé
const appels = [];
const programme = [];
cc.__testing.simulerClaude(async ({ args, userMessage, model, effort, appel }) => {
  const i = appels.length;
  const issue = programme.shift() ?? 'ok';
  const total = 4000 + 10 * i;
  const fiche = userMessage.split('\n\nRAPPEL')[0];
  const nombres = garde.nombresEnChiffres(fiche).map((n) => n.texte);
  appels.push({ i, type: appel?.type ?? null, detail: appel?.detail ?? null, mode: appel?.mode ?? null, taille: appel?.taille ?? null, model, effort, issue, aRappel: userMessage.includes('RAPPEL'), tools: args[args.indexOf('--tools') + 1], schema: JSON.parse(args[args.indexOf('--json-schema') + 1]), fiche });
  if (issue === 'panne') throw new cc.ClaudeCodeIndisponible("Claude Code (headless) n'a pas répondu : panne simulée");
  const usage = usageSimule(total);
  const cout = coutSimule(total);
  if (issue === 'sans-sortie') return { is_error: false, usage, total_cost_usd: cout };
  const n = (k) => nombres[k] ?? '0';
  let sortie = { titre: `Le mois en mots : ${n(0)}`, phrases: [`Le tri reprend ${n(1)} et ${n(2)}, tels quels.`, `Puis ${n(3)}, de la fiche.`, `Et enfin ${n(4)}.`] };
  if (issue === 'forme') sortie = { titre: '', phrases: [] };
  if (issue === 'chiffres') sortie.phrases[1] = 'Une phrase qui invente 4321,7 points.';
  return { is_error: false, structured_output: sortie, usage, total_cost_usd: cout };
});

// ------------------------------------------------------------------ des tris fabriqués
/**
 * Le tri d'un mois, à la forme que range tri.js : 22 cases ; `jugees` : { 'famille|mesure': { statut, ecart } } pour les
 * cases jugées (fenêtre de deux mois) ; les familles de buts « en essai » quand `enEssai` ; le reste « trop tôt ».
 */
function triFabrique(mois, { jugees = {}, enEssai = false, calculeLe }) {
  const precedent = (m) => {
    const [a, b] = m.split('-').map(Number);
    return b === 1 ? `${a - 1}-12` : `${a}-${String(b - 1).padStart(2, '0')}`;
  };
  const cases = R.CASES_DU_TRI.map((cas) => {
    const [famille, mesure] = cas.split('|');
    const j = jugees[cas] ?? null;
    const statut = j ? j.statut : enEssai && R.estDeButs(famille) ? 'en-essai' : 'trop-tot';
    const fenetre = j ? { mois: [precedent(mois), mois], lignes: 2900, matchs: 2840, ecart: j.ecart, annonce: 0.5, realise: 0.5 + j.ecart, fourchette: [j.ecart - 0.01, j.ecart + 0.01], ecartType: 0.004, z: 3.7328, regards: 264, verdictDuJuge: j.statut === 'dans-la-marge' ? 'pas-prouve' : j.ecart < 0 ? 'moins-bon' : 'retenu' } : null;
    const levier = j?.statut === 'vrai-defaut' ? (R.estDeButs(famille) ? { code: true, phrase: R.DEMANDES_DU_CODE.ancienModele } : { code: true, phrase: R.DEMANDES_DU_CODE.statistiques }) : null;
    return { cas, famille, mesure, statut, dit: R.STATUTS[statut].dit, sens: j ? (j.ecart < 0 ? 'trop-haut' : 'trop-bas') : null, sensDit: j ? (j.ecart < 0 ? 'annonce trop haut' : 'annonce trop bas') : null, canonique: null, courant: { mois, ecart: j?.ecart ?? 0, lignes: 1450, matchs: 1420, partiel: false }, mois: [], fenetre, enEssai: statut === 'en-essai' ? { candidate: 'modele-buts-v1', etape: '27' } : null, levier };
  });
  const statuts = Object.fromEntries(Object.keys(R.STATUTS).map((k) => [k, cases.filter((c) => c.statut === k).length]));
  return {
    mois,
    version: R.VERSION_DU_TRI,
    calculeLe: new Date(calculeLe).toISOString(),
    lignee: { versionEnService: 3, versions: [3], empreinte: 'essai', code: 'essai', avecModeleDeButs: false, enServiceDepuis: '2026-09-01T00:00:00.000Z', couverture: { partiel: false, depuis: null } },
    regards: 264,
    resume: { versionEnService: 3, versions: [3], partiel: false, depuis: null, revisions: 5000, pronostics: 41234, lignes: 61200, matchs: 1420, aVenir: 0, ecartees: [{ raison: 'autreVersion', libelle: R.RAISONS_DU_TRI.autreVersion, n: 1234 }], ecarteesParFamille: {}, statuts, vraisDefauts: cases.filter((c) => c.statut === 'vrai-defaut').map((c) => c.cas), enEssai: enEssai ? { candidate: 'modele-buts-v1', etape: '27', marches: [...R.FAMILLES_DE_BUTS] } : null, regards: 264, z: 3.7328 },
    cases,
    regimes: { mois: {} },
    sommes: {}
  };
}
const ranger = (tri, quand) => D.ecrireLeTri(tri, { database, phrase: `Tri ${tri.mois} figé (essai).`, maintenant: quand });
const JUGEES = { 'totalCorners|niveau': { statut: 'vrai-defaut', ecart: -0.0312 }, 'result|niveau': { statut: 'petit-ecart', ecart: 0.012 }, 'teamShots|confiance': { statut: 'a-surveiller', ecart: -0.025 }, 'totalShots|niveau': { statut: 'dans-la-marge', ecart: 0.004 } };
const produire = (maintenant, options = {}, ctx = null) => M.produireLeResumeDuMois({ maintenant, ctx, options });
const court = (r) => ({ statut: r.statut, code: r.code, fait: r.fait, appelFait: r.appelFait, resume: r.resume, essai: r.details?.essai ?? null, mode: r.details?.mode ?? null, tokens: r.details?.tokens ?? null, mois: r.details?.mois ?? null });
const resumes = (mois) => D.lireLesResumes({ database, mois }).map((r) => ({ mois: r.mois, version: r.version, sansAppel: r.sansAppel, titre: r.texte?.titre ?? null, phrases: r.texte?.phrases ?? null, essai: r.essai, modele: r.modele, mode: r.mode, raison: r.raison, garde: r.garde, tokens: r.usage?.total ?? null, ficheDebut: typeof r.fiche === 'string' ? r.fiche.slice(0, 40) : r.fiche }));
const essais = (mois) => D.essaisDeResume(mois, { database, version: R.VERSION_DU_TRI }).map((e) => ({ type: e.type, raison: e.raison, tokens: e.tokens }));
const dernieresEntrees = (n = 3) => D.lireLeJournal({ database, limite: n }).map((e) => ({ evenement: e.evenement, source: e.source, phrase: e.phrase, details: e.details }));
const lireJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const journalClaude = (jour) => lireJson(path.join(RUNTIME, 'journal-claude', `${jour}.json`));
const lignesDuJournalClaude = (jour) => (journalClaude(jour)?.appels ?? []).map((a) => ({ type: a.type, statut: a.statut, modele: a.modele, mode: a.mode, detail: a.detail, tokens: a.tokens?.total ?? null, taille: a.taille }));
const sansFiche = (a) => ({ ...a, fiche: undefined, schema: undefined });

// ============================================================================================== service
if (phase === 'service') {
  s.avantTout = M.decisionDuResumeDuMois();
  ranger(triFabrique('2026-10', { jugees: JUGEES, enEssai: true, calculeLe: T0 - 50 * MIN }), T0 - 50 * MIN);
  s.decision = M.decisionDuResumeDuMois();
  s.compteurAvant = statutDuJour(JOUR0);
  const r1 = await produire(T0);
  s.premier = court(r1);
  s.appelsApresLePremier = appels.map(sansFiche);
  s.ficheEnvoyee = appels[0]?.fiche ?? null;
  s.schema = appels[0]?.schema ?? null;
  s.resumesOctobre = resumes('2026-10');
  s.journalApres = dernieresEntrees(2);
  s.compteur = statutDuJour(JOUR0);
  s.journalClaude = lignesDuJournalClaude(JOUR0);
  const etatBudget = B.etatBudgetClaude({ maintenant: T0 });
  s.budget = { coherence: etatBudget.coherence, plafond: etatBudget.plafond, resumeMois: etatBudget.parType.find((x) => x.type === 'resume-mois') ?? null, types: etatBudget.parType.map((x) => x.type) };
  // Le même mois, une heure puis un jour plus tard : rien ne part.
  s.second = court(await produire(T0 + H));
  s.troisieme = court(await produire(T0 + 24 * H));
  s.appelsApresLeSecond = appels.length;
  s.decisionApres = M.decisionDuResumeDuMois();
  s.resumesOctobreApres = resumes('2026-10').length;

  // Rattrapage : l'appli arrêtée deux mois ; novembre et décembre triés d'un coup → le résumé de DÉCEMBRE seulement.
  ranger(triFabrique('2026-11', { jugees: JUGEES, calculeLe: T0 + 61 * 24 * H }), T0 + 61 * 24 * H);
  ranger(triFabrique('2026-12', { jugees: { ...JUGEES, 'teamGoals|niveau': { statut: 'vrai-defaut', ecart: -0.041 } }, calculeLe: T0 + 61 * 24 * H + MIN }), T0 + 61 * 24 * H + MIN);
  s.decisionRattrapage = M.decisionDuResumeDuMois();
  const r2 = await produire(T0 + 2 * H);
  s.rattrapage = court(r2);
  s.appelsRattrapage = appels.length;
  s.ficheRattrapage = appels.at(-1)?.fiche ?? null;
  s.resumesNovembre = resumes('2026-11').length;
  s.resumesDecembre = resumes('2026-12').map((x) => ({ mois: x.mois, sansAppel: x.sansAppel, essai: x.essai }));

  // Une fiche vide (aucune case jugée, rien d'autre que le tri au journal) : rangée sans appel, 0 token — même sans Claude.
  ranger(triFabrique('2027-01', { enEssai: true, calculeLe: T0 + 92 * 24 * H }), T0 + 92 * 24 * H);
  const avantVide = appels.length;
  const r3 = await produire(T0 + 3 * H, { authentifie: false });
  s.vide = { ...court(r3), appels: appels.length - avantVide, resumes: resumes('2027-01'), journal: dernieresEntrees(1), decision: M.decisionDuResumeDuMois() };

  // Le mode économe : la fiche compactée (6 cases au plus), le mode noté au journal des appels et avec le résumé.
  const beaucoup = Object.fromEntries(R.CASES_DU_TRI.filter((c) => !R.estDeButs(c.split('|')[0])).map((c, k) => [c, { statut: k % 3 ? 'petit-ecart' : 'a-surveiller', ecart: -0.011 - k / 1000 }]));
  ranger(triFabrique('2027-02', { jugees: beaucoup, calculeLe: T0 + 123 * 24 * H }), T0 + 123 * 24 * H);
  const r4 = await produire(T0 + 4 * H, { mode: { mode: 'econome', econome: true } });
  const ficheEconome = appels.at(-1)?.fiche ?? '';
  s.econome = { ...court(r4), modeDeLAppel: appels.at(-1)?.mode ?? null, lignesDeCases: ficheEconome.split('\n').filter((l) => /^\| (?!famille)/.test(l) && l.includes('|')).length, casesJugees: Object.keys(beaucoup).length, resume: resumes('2027-02').map((x) => x.mode) };
  s.plafondApres = env.autoAiAnalysis.dailyLimit;
}

// ============================================================================================== echecs
else if (phase === 'echecs') {
  ranger(triFabrique('2026-10', { jugees: JUGEES, calculeLe: T0 - 50 * MIN }), T0 - 50 * MIN);
  // Aucun appel, aucun essai noté : Claude non configuré, une panne vue par les analyses de la passe, l'interrupteur coupé.
  s.nonConfigure = court(await produire(T0, { authentifie: false }));
  s.panneDeLaPasse = court(await produire(T0 + MIN, {}, { claudeEnPanne: true }));
  s.interrupteur = court(await produire(T0 + 2 * MIN, { interrupteur: false }));
  s.decisionInterrupteur = M.decisionDuResumeDuMois({ interrupteur: false });
  s.appelsSansEssai = appels.length;
  s.essaisSansAppel = essais('2026-10');
  // Le plafond atteint (un autre jour : 150 places prises) : rien ne part, aucun essai noté.
  const jourPlein = '2026-11-02';
  enregistrerUsage(jourPlein, { preMatch: 100, postMatch: 50 });
  s.plafond = { ...court(await produire(T0 + 24 * H, {})), appels: appels.length, essais: essais('2026-10').length, compteur: statutDuJour(jourPlein) };
  // Trois essais ratés : une panne, des chiffres refusés, une forme non respectée — le troisième a le rappel des chiffres.
  programmer('panne', 'chiffres', 'forme');
  s.essai1 = court(await produire(T0 + 10 * MIN));
  s.decisionApres1 = M.decisionDuResumeDuMois();
  s.essai2 = court(await produire(T0 + 20 * MIN));
  s.essai3 = court(await produire(T0 + 30 * MIN));
  s.rappels = appels.map((a) => a.aRappel);
  s.issues = appels.map((a) => a.issue);
  s.essais = essais('2026-10');
  s.resumesApresEchecs = resumes('2026-10').length;
  s.decisionAbandon = M.decisionDuResumeDuMois();
  const avant = appels.length;
  s.abandon = { ...court(await produire(T0 + 40 * MIN)), appels: appels.length - avant };
  // Les appels RÉUSSIS (chiffres refusés, forme) ont pris leur place sur le plafond ; la panne non. Compteur et journal d'accord.
  s.compteur = statutDuJour(JOUR0);
  s.journalClaude = lignesDuJournalClaude(JOUR0);
  s.coherence = B.etatBudgetClaude({ maintenant: T0 }).coherence;
  s.plafondApres = env.autoAiAnalysis.dailyLimit;
}

// ============================================================================================== etape
else if (phase === 'etape') {
  recopierScripts(serveur);
  const syn = await imp('jobs/matchStatsAutoRefresh.js');
  const J = syn.__testing;
  s.etapes = syn.REFRESH_STEPS.map((e) => e.key);
  s.label = syn.REFRESH_STEPS.find((e) => e.key === 'resumeCorrection')?.label ?? null;
  const entree = () => J.ETAPES().find((e) => e.key === 'resumeCorrection');
  s.sansTri = { due: J.dueResumeCorrection({}), entree: entree().due({}), manuel: entree().due({ manuel: true }), pourquoi: entree().pourquoiPasDue({}) };
  ranger(triFabrique('2026-10', { jugees: JUGEES, calculeLe: T0 - 50 * MIN }), T0 - 50 * MIN);
  s.avecTri = { due: J.dueResumeCorrection({}), entree: entree().due({}), manuel: entree().due({ manuel: true }) };
  env.autoAiAnalysis.enabled = false;
  s.interrupteurCoupe = { entree: entree().due({}), manuel: entree().due({ manuel: true }) };
  env.autoAiAnalysis.enabled = true;
  const p = await J.passeResumeCorrection({ manuel: false }, { maintenant: T0 });
  s.passe = { status: p.status, summary: p.summary, changed: p.changed, code: p.details.code, appelFait: p.details.appelFait, tokens: p.details.tokens, mode: p.details.mode };
  s.apres = { due: J.dueResumeCorrection({}), entree: entree().due({}), manuel: entree().due({ manuel: true }), pourquoi: entree().pourquoiPasDue({}) };
  // Un nouveau mois trié, mais une panne déjà vue par les analyses de la passe : l'étape le dit, rien ne part.
  ranger(triFabrique('2026-11', { jugees: JUGEES, calculeLe: T0 + 30 * 24 * H }), T0 + 30 * 24 * H);
  const avant = appels.length;
  const p2 = await J.passeResumeCorrection({ claudeEnPanne: true }, { maintenant: T0 + H });
  s.panne = { status: p2.status, code: p2.details.code, summary: p2.summary, appels: appels.length - avant };
  s.appels = appels.map(sansFiche);
}

// ============================================================================================== etat
else if (phase === 'etat') {
  const S = await imp('data/santeDuMoteur.js');
  const lire = () => {
    const e = E.etatDesCorrections({ maintenant: T0 });
    return { disponible: e.disponible, resume: e.resume };
  };
  s.vide = lire();
  ranger(triFabrique('2026-10', { jugees: JUGEES, calculeLe: T0 - 50 * MIN }), T0 - 50 * MIN);
  s.aFaire = lire();
  programmer('chiffres');
  await produire(T0);
  s.unEssai = lire();
  await produire(T0 + 10 * MIN);
  s.ecrit = lire();
  s.sante = S.assemblerLaSante({ maintenant: T0 }).blocs.corrections;
  s.coupe = E.etatDesCorrections({ maintenant: T0 }).resume.code;
  env.autoAiAnalysis.enabled = false;
  s.ecritInterrupteurCoupe = E.etatDuResume({}).code;
  env.autoAiAnalysis.enabled = true;
  ranger(triFabrique('2026-11', { jugees: JUGEES, calculeLe: T0 + 30 * 24 * H }), T0 + 30 * 24 * H);
  env.autoAiAnalysis.enabled = false;
  s.coupeSansResume = E.etatDuResume({});
  env.autoAiAnalysis.enabled = true;
}

// ============================================================================================== ecriture
// Vérification finale, constat 4 : l'appel RÉUSSIT (il prend sa place sur le plafond) mais le RANGEMENT échoue — la base de
// la copie refuse l'écriture du résumé (un déclencheur posé ici seulement). Chaque échec compte parmi les trois essais (noté
// « ecriture ») et l'abandon vient au troisième : plus d'appel ensuite (avant, chaque passe en refaisait un).
else if (phase === 'ecriture') {
  ranger(triFabrique('2026-10', { jugees: JUGEES, calculeLe: T0 - 50 * MIN }), T0 - 50 * MIN);
  database.exec("CREATE TRIGGER essai_constat_4 BEFORE INSERT ON correction_resumes BEGIN SELECT RAISE(ABORT, 'rangement refusé (essai du constat 4)'); END;");
  s.essai1 = court(await produire(T0));
  s.decisionApres1 = M.decisionDuResumeDuMois();
  s.essai2 = court(await produire(T0 + 10 * MIN));
  s.essai3 = court(await produire(T0 + 20 * MIN));
  s.essais = essais('2026-10');
  s.resumes = resumes('2026-10').length;
  s.journalDeLaBoucle = dernieresEntrees(5).map((e) => e.evenement);
  s.decisionAbandon = M.decisionDuResumeDuMois();
  const avant = appels.length;
  s.quatrieme = { ...court(await produire(T0 + 30 * MIN)), appels: appels.length - avant };
  s.appels = appels.length;
  s.compteur = statutDuJour(JOUR0);
  s.journalClaude = lignesDuJournalClaude(JOUR0);
  s.coherence = B.etatBudgetClaude({ maintenant: T0 }).coherence;
  s.plafondApres = env.autoAiAnalysis.dailyLimit;
}

function programmer(...issues) {
  programme.push(...issues);
}

cc.__testing.simulerClaude(null);
console.log(JSON.stringify(s));
