/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-bulletins-service.mjs <serveur de la copie> <phase>
 *
 * Étape 42 — LE SERVICE du bulletin du jour et du bilan de la semaine, avec le FAUX Claude (aides/decorBulletins.mjs : la réponse du
 * CLI est fabriquée, le reste de callClaudeCode — contrôles et JOURNAL — tourne pour de vrai ; aucun appel réel). Des entrées
 * fabriquées, la copie de la base d'essai, heure figée au 05/10/2026 12 h UTC (14 h à Paris, un lundi).
 * Phases :
 *   une-fois   un bulletin par jour et un bilan par semaine : le deuxième appel de la journée ne part pas, le lendemain oui ; pas avant
 *              6 h ; le bilan de la DERNIÈRE semaine complète seulement (rattrapage après deux semaines d'arrêt) ; le fichier gardé.
 *   budget     le plafond de 150 (un appel de bulletin prend une place ; sans place, rien ne part) ; le journal des appels (type, tokens,
 *              mode, taille) ; le compteur et le journal s'accordent ; le modèle et l'effort.
 *   econome    le mode économe (choisi, puis à 80 % du budget du jour) compacte la fiche sans supprimer le texte.
 *   pannes     panne de Claude, réponse en erreur, schéma non respecté, forme invalide, chiffres refusés, nombre en lettres refusé : rien
 *              d'écrit, essais comptés, rappel au deuxième essai, abandon au troisième ; une panne vue par les analyses ; Claude non connecté.
 *   rien       rien à commenter (aucun appel) ; le Repérage pas prêt (le matin on attend, l'après-midi on part avec les favoris).
 *   ecriture   atomicJson : jamais d'écriture directe sur le fichier, un fichier illisible n'est jamais réécrit ni payé, deux fois refusé,
 *              un blocage OneDrive passager ne perd rien, on ne garde que les derniers textes.
 *   etapes     les deux étapes de l'actualisation : leur place, leur « due », ce qu'elles disent, jamais forcées par un clic, une panne vue
 *              par les analyses les arrête.
 *   route      GET /api/match-ai-analysis/bulletins : vide, rempli, illisible (503), POST refusé, lecture seule.
 *   ecran      les réponses de la route dans chaque état que montre l'écran de Réglages.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Socket } from 'node:net';
import crypto from 'node:crypto';
import { importeur, entreesDuJour, entreesDeLaSemaine, installerFauxClaude, lireLeJournal, lireLeCompteur } from './decorBulletins.mjs';
import { listeDuJour, installerFauxFetch } from './fotmobSimule.mjs';

const [serveur, phase] = process.argv.slice(2);
const imp = importeur(serveur);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const FICHIER = path.join(RUNTIME, 'ai-bulletins.json');
const ecrireRuntime = (nom, contenu) => {
  fs.mkdirSync(RUNTIME, { recursive: true });
  fs.writeFileSync(path.join(RUNTIME, nom), typeof contenu === 'string' ? contenu : JSON.stringify(contenu, null, 1));
};
const sha1 = (f) => (fs.existsSync(f) ? crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex') : null);
const lireFichier = () => (fs.existsSync(FICHIER) ? JSON.parse(fs.readFileSync(FICHIER, 'utf8')) : null);

const { resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');

const S = await imp('core/ai/bulletinService.js');
const R = await imp('data/repositories/aiBulletinRepository.js');
const budget = await imp('core/ai/claudeBudget.js');
const { enregistrerUsage, statutDuJour } = await imp('data/repositories/autoAiAnalysisRepository.js');
const { env } = await imp('config/env.js');

// Le bac coupe l'interrupteur des analyses automatiques à l'import de env.js (preparerEnvironnementBac) — et une copie d'essai rangée dans
// le bac est un bac. L'essai le rallume dans SON processus (l'objet env est celui du code testé) : le résultat ne dépend pas de l'endroit où il tourne.
const interrupteurDuCode = env.autoAiAnalysis.enabled;
env.autoAiAnalysis.enabled = true;
const T0 = Date.parse(process.env.CM_TEST_MAINTENANT); // lundi 05/10/2026, 12 h UTC (14 h à Paris)
const H = 3_600_000;
const JOUR = 86_400_000;
const iso = (t) => new Date(t).toISOString();
/** L'instant de Paris `h` heures `m` minutes le `jour` (été : UTC + 2). */
const leJourA = (jour, h, m = 0) => Date.parse(`${jour}T00:00:00Z`) + (h - 2) * H + m * 60_000;
const JOUR0 = '2026-10-05';

const claude = await installerFauxClaude(serveur);
const sortie = { ok: true, phase, jour: JOUR0, interrupteurDuCode };
process.on('uncaughtException', (error) => {
  console.error(`[script] exception : ${error.stack}
[script] sortie déjà remplie : ${JSON.stringify(sortie).slice(0, 4000)}`);
  process.exit(1);
});

/** Un résultat du service, sans le bruit. */
const court = (r) => ({ statut: r.statut, code: r.code, fait: r.fait, appelFait: r.appelFait, resume: r.resume, essai: r.details?.essai ?? null, mode: r.details?.mode ?? null, tokens: r.details?.tokens ?? null });

/** Le jour de Paris d'un instant (en octobre : UTC + 2). */
const jourDe = (t) => new Date(t + 2 * H).toISOString().slice(0, 10);
/** Les entrées d'un jour de Paris, fabriquées. */
const duJour = (maintenant, extra = {}) => entreesDuJour({ maintenant, jour: jourDe(maintenant), ...extra });
/** Le bulletin d'un jour avec ses entrées fabriquées. */
const bulletin = (maintenant, options = {}, entrees = {}) =>
  S.produireLeBulletin({ maintenant, options: { entrees: duJour(maintenant, entrees), ...options } });
const bilan = (maintenant, options = {}, entrees = {}) => S.produireLeBilan({ maintenant, options: { entrees: entreesDeLaSemaine({ maintenant, ...entrees }), ...options } });

// ============================================================================================== une-fois
if (phase === 'une-fois') {
  const t = leJourA(JOUR0, 6, 10);
  sortie.avantTout = { bulletin: S.decisionDuBulletin({ maintenant: t }), bilan: S.decisionDuBilan({ maintenant: t }) };
  // Un bulletin le matin : un seul appel.
  const r1 = await bulletin(t);
  sortie.premier = court(r1);
  sortie.appelsApresLePremier = claude.appels.length;
  sortie.fichierApresLePremier = lireFichier();
  // La même journée, deux passes plus tard : rien ne part, le texte reste le premier.
  const r2 = await bulletin(t + 3 * H);
  const r3 = await bulletin(t + 9 * H);
  sortie.memeJour = [court(r2), court(r3)];
  sortie.appelsMemeJour = claude.appels.length;
  sortie.memeTexte = JSON.stringify(lireFichier().bulletins[JOUR0].texte) === JSON.stringify(sortie.fichierApresLePremier.bulletins[JOUR0].texte);
  sortie.decisionMemeJour = S.decisionDuBulletin({ maintenant: t + 3 * H });
  // Le lendemain : un nouveau.
  const demain = t + JOUR;
  const r4 = await bulletin(demain, {}, {});
  sortie.lendemain = court(r4);
  sortie.appelsLendemain = claude.appels.length;
  sortie.clesDuFichier = Object.keys(lireFichier().bulletins);

  // Le bilan : une fois par semaine, celui de la semaine écoulée (28/09 → 04/10), clé = son lundi.
  const b1 = await bilan(t);
  sortie.bilan1 = court(b1);
  const b2 = await bilan(t + 3 * H);
  const b3 = await bilan(t + 2 * JOUR); // le mercredi de la même semaine : toujours le même bilan, déjà écrit
  sortie.bilanMemeSemaine = [court(b2), court(b3)];
  sortie.clesBilans = Object.keys(lireFichier().bilans);
  sortie.decisionBilan = S.decisionDuBilan({ maintenant: t + 2 * JOUR });
  sortie.appelsBilan = claude.appels.filter((a) => a.type === 'bilan-semaine').length;
  // La semaine suivante (lundi 12/10) : un nouveau bilan, pour la semaine du 05/10.
  const lundiSuivant = leJourA('2026-10-12', 6, 30);
  const b4 = await bilan(lundiSuivant, {}, { lundi: '2026-10-05' });
  sortie.bilanSuivant = court(b4);
  sortie.clesBilansApres = Object.keys(lireFichier().bilans);

  // Pas avant 6 h : à 5 h 59 rien, à 6 h 00 le bulletin.
  fs.rmSync(FICHIER, { force: true });
  const avant = await bulletin(leJourA(JOUR0, 5, 59));
  sortie.avant6h = court(avant);
  const appelsAvant = claude.appels.length;
  const apres = await bulletin(leJourA(JOUR0, 6, 0));
  sortie.six = court(apres);
  sortie.appelsPlus = claude.appels.length - appelsAvant;
  // Le bilan non plus avant 6 h.
  fs.rmSync(FICHIER, { force: true });
  sortie.bilanAvant6h = court(await bilan(leJourA(JOUR0, 5, 59)));

  // Rattrapage : le PC est resté éteint deux semaines. Le mercredi 14/10 à 9 h, UN seul bilan, celui de la dernière semaine complète
  // (05/10 → 11/10), jamais ceux des semaines manquées.
  fs.rmSync(FICHIER, { force: true });
  const mercredi = leJourA('2026-10-14', 9, 0);
  const rat = await bilan(mercredi, {}, { lundi: '2026-10-05' });
  sortie.rattrapage = court(rat);
  sortie.clesRattrapage = Object.keys(lireFichier().bilans);
  // La semaine des jours (lundi → dimanche) autour d'un changement de mois et d'année.
  const F = await imp('core/ai/bulletinFiches.js');
  sortie.semaines = Object.fromEntries(['2026-10-05', '2026-10-11', '2026-10-12', '2026-11-02', '2027-01-01', '2026-03-30'].map((j) => [j, F.semaineEcoulee(j)]));
  sortie.enLettres = [F.semaineEnLettres(F.semaineEcoulee('2026-10-05')), F.semaineEnLettres(F.semaineEcoulee('2026-10-12')), F.semaineEnLettres(F.semaineEcoulee('2026-11-02'))];
}

// ============================================================================================== budget
else if (phase === 'budget') {
  const t = leJourA(JOUR0, 6, 10);
  const plafond = env.autoAiAnalysis.dailyLimit;
  sortie.plafond = plafond;
  // Un bulletin et un bilan : chacun prend une place sur le plafond, et le journal les note à leur type.
  const r = await bulletin(t);
  const b = await bilan(t);
  sortie.resultats = [court(r), court(b)];
  sortie.compteur = statutDuJour(JOUR0);
  const journal = lireLeJournal(serveur, JOUR0);
  sortie.journal = {
    lignes: journal.appels.map((a) => ({ type: a.type, statut: a.statut, modele: a.modele, mode: a.mode, detail: a.detail, fiche: a.fiche, taille: a.taille, tokens: a.tokens?.total ?? null, usd: a.equivalentApiUsd, match: a.match })),
    totaux: { appels: journal.totaux.appels, tokens: journal.totaux.tokens.total, parType: Object.fromEntries(Object.entries(journal.totaux.parType).map(([k, v]) => [k, { appels: v.appels, ok: v.ok, tokens: v.tokens.total }])) }
  };
  sortie.appels = claude.appels.map((a) => ({ type: a.type, mode: a.mode, model: a.model, effort: a.effort, tools: a.tools, longueurFiche: a.userMessage.length, taille: a.taille }));
  // L'état du budget : les deux types sont des appels automatiques, le compteur du plafond et le journal s'accordent.
  const etat = budget.etatBudgetClaude({ maintenant: t });
  sortie.etat = {
    coherence: etat.coherence,
    plafond: etat.plafond,
    parType: etat.parType.filter((x) => ['bulletin', 'bilan-semaine'].includes(x.type)).map((x) => ({ type: x.type, libelle: x.libelle, automatique: x.automatique, appels: x.aujourdhui.appels, tokens: x.aujourdhui.tokens.total })),
    types: etat.parType.map((x) => x.type),
    aujourdhui: { tokens: etat.aujourdhui.tokens.total, appels: etat.aujourdhui.appels }
  };

  // Le plafond : 149 places prises, il en reste une — le bulletin passe ; puis plus aucune — le bilan attend, aucun appel.
  fs.rmSync(FICHIER, { force: true });
  const autre = '2026-10-06';
  const t2 = leJourA(autre, 6, 10);
  enregistrerUsage(autre, { preMatch: 100, postMatch: 49 });
  const avant = claude.appels.length;
  const dernierePlace = await bulletin(t2);
  const sansPlace = await bilan(t2);
  sortie.dernierePlace = { bulletin: court(dernierePlace), bilan: court(sansPlace), compteur: statutDuJour(autre), appelsDeTrop: claude.appels.length - avant };
  // Plafond atteint avant même le bulletin : rien ne part, sans essai noté.
  const encore = '2026-10-07';
  enregistrerUsage(encore, { preMatch: 150 });
  const avant2 = claude.appels.length;
  const plein = await bulletin(leJourA(encore, 6, 10));
  sortie.plein = { ...court(plein), appels: claude.appels.length - avant2, essais: lireFichier().essais?.[`bulletin:${encore}`] ?? null };
  // Le plafond lui-même n'a pas bougé.
  sortie.plafondApres = env.autoAiAnalysis.dailyLimit;
}

// ============================================================================================== econome
else if (phase === 'econome') {
  const t = leJourA(JOUR0, 6, 10);
  // 1. Le mode normal d'abord, pour comparer.
  const normal = await bulletin(t);
  sortie.normal = { ...court(normal), fiche: lireFichier().bulletins[JOUR0].fiche, modeNote: lireFichier().bulletins[JOUR0].mode };
  fs.rmSync(FICHIER, { force: true });
  // 2. Économe CHOISI par Pierre (Réglages › Budget Claude).
  ecrireRuntime('budget-claude.json', { tokensParJour: 1_200_000, tokensParSemaine: 6_000_000, mode: 'econome', enregistreLe: iso(T0) });
  const choisi = await bulletin(t + 5 * 60_000);
  const e1 = lireFichier().bulletins[JOUR0];
  sortie.econome = { ...court(choisi), fiche: e1.fiche, modeNote: e1.mode, texte: !!e1.texte };
  const derniers = claude.appels.slice(-2);
  sortie.modesDesAppels = derniers.map((a) => a.mode);
  const b = await bilan(t);
  sortie.bilanEconome = { ...court(b), fiche: lireFichier().bilans['2026-09-28'].fiche };
  // 3. Économe AUTOMATIQUE à 80 % du budget du jour (jamais l'abonnement : les tokens de l'appli face au budget fixé).
  fs.rmSync(FICHIER, { force: true });
  ecrireRuntime('budget-claude.json', { tokensParJour: 100_000, tokensParSemaine: 6_000_000, mode: 'auto', enregistreLe: iso(T0) });
  const { journaliserAppel } = await imp('data/repositories/claudeUsageLedger.js');
  journaliserAppel({ canal: 'claude-code', appel: { type: 'revue', mode: 'normal' }, modele: 'claude-code:sonnet', statut: 'ok', usage: { input_tokens: 2, cache_creation_input_tokens: 50_000, cache_read_input_tokens: 36_000, output_tokens: 1_998 }, coutUsd: 0.5, debut: T0 - 1000, fin: T0 });
  const avant80 = budget.modeBudget({ maintenant: t });
  sortie.modeA80 = { mode: avant80.mode, declencheurs: avant80.declencheurs.map((d) => d.cle), partJour: avant80.partJour };
  const auto = await bulletin(t + 10 * 60_000);
  sortie.auto80 = { ...court(auto), modeNote: lireFichier().bulletins[JOUR0].mode };
  // La fiche économe a moins de lignes que la normale, mais les mêmes sections.
  const F = await imp('core/ai/bulletinFiches.js');
  const P = await imp('core/ai/bulletinPrompt.js');
  const gros = duJour(t);
  // Plus de paris que la limite économe (4) pour que la troncature se voie.
  const plus = [...gros.opportunites.lignes];
  for (let k = 0; k < 7; k++) plus.push({ ...plus[0], home: `Club ${k}`, away: `Autre ${k}`, cle: `club${k}`, verdict: { ...plus[0].verdict, pourcent: 5 - k * 0.1 } });
  gros.opportunites.lignes = plus;
  for (const [i, m] of plus.entries()) if (i >= 3) gros.matchs.push({ cle: `${m.league}|${m.home}|${m.away}|2026-10-05`, home: m.home, away: m.away, league: m.league, commenceTime: m.commenceTime, heureSure: true, favori: null, compo: null });
  const fN = F.construireLaFicheDuJour(gros, { econome: false });
  const fE = F.construireLaFicheDuJour(gros, { econome: true });
  sortie.limites = { normal: F.LIMITES.normal, econome: F.LIMITES.econome };
  sortie.lignesFiche = { normal: fN.opportunites.retenues.length, econome: fE.opportunites.retenues.length, sectionsN: Object.keys(fN).length, sectionsE: Object.keys(fE).length };
  sortie.tailles = { normal: P.rendreLaFicheDuJour(fN).length, econome: P.rendreLaFicheDuJour(fE).length };
  sortie.titresDesRubriques = { normal: P.rendreLaFicheDuJour(fN).split('\n').filter((l) => /^[A-ZÉÈÔ' ]{6,}$/.test(l)), econome: P.rendreLaFicheDuJour(fE).split('\n').filter((l) => /^[A-ZÉÈÔ' ]{6,}$/.test(l)) };
  // Une semaine chargée : beaucoup de marchés, de championnats, de paris, d'erreurs de l'IA — la fiche économe en garde moins, jamais moins de rubriques.
  const charge = entreesDeLaSemaine();
  const marches = [['result', 'Résultat'], ['totalGoals', 'Total buts'], ['bothTeamsScore', 'Les 2 équipes marquent'], ['teamCorners', 'Corners'], ['totalShots', 'Tirs'], ['totalCorners', 'Total corners'], ['totalShotsOnTarget', 'Tirs cadrés'], ['teamGoals', 'Buts d’une équipe']];
  const ligues = ['EPL', 'Ligue 1', 'Serie A', 'La Liga - Spain', 'Bundesliga - Germany', 'Eredivisie', 'Liga Portugal', 'MLS'];
  for (let k = 0; k < 40; k++) {
    const [marketId, market] = marches[k % marches.length];
    charge.pronostics.push({ id: `p${k}`, status: k % 3 ? 'correct' : 'incorrect', marketId, market, league: ligues[k % ligues.length], settledAt: '2026-10-01T22:00:00.000Z', homeName: 'A', awayName: 'B' });
  }
  for (let k = 0; k < 14; k++) {
    charge.paris.push({ id: `b${k}`, status: k % 2 ? 'won' : 'lost', stake: 5 + k, odds: 1.5 + k / 10, createdAt: '2026-09-29T10:00:00.000Z', settledAt: '2026-10-02T21:00:00.000Z', legs: [{ matchId: `x${k}`, homeName: `Club ${k}`, awayName: `Autre ${k}`, league: ligues[k % ligues.length], market: 'Résultat', marketId: 'result', pick: `Club ${k} gagne`, odds: 1.5 + k / 10, status: k % 2 ? 'won' : 'lost' }], bookmaker: 'winamax_fr', bookmakerTitle: 'Winamax (FR)' });
  }
  // Huit matchs, deux erreurs chacun (la fiche choisit au plus deux erreurs par match : la place, pas le nombre d'erreurs, fait la différence entre les modes).
  marches.forEach(([marketId, market], k) => {
    const jourDuMatch = `2026-10-0${1 + (k % 4)}`;
    charge.analyses.push({ homeName: `Chargé ${k}`, awayName: `Semaine ${k}`, league: ligues[k], commenceTime: `${jourDuMatch}T19:00:00.000Z`, postMatchReview: { createdAt: `${jourDuMatch}T23:00:00.000Z`, marketReviews: [0, 1, 2].map((j) => ({ market, marketId, pick: `pronostic ${market} ${j}`, aiVerdict: 'confirme', aiConfidence: j === 1 ? 'moyenne' : 'forte', aiWasRight: j === 0, outcome: j === 0 ? 'juste' : 'faux', minOdds: 1.2 })) } });
  });
  charge.carnet.carnet.types = marches.map(([marketType, label], k) => ({ marketType, label, bilan: { aiVerdicts: 100 + k, aiRight: 50 + k } }));
  const semN = F.construireLaFicheDeLaSemaine(charge, { econome: false });
  const semE = F.construireLaFicheDeLaSemaine(charge, { econome: true });
  // Les titres de rubrique de la fiche : les lignes toutes en majuscules (hors l'en-tête de la fiche).
  const titres = (t) => t.split('\n').filter((l) => l.length > 8 && l === l.toUpperCase() && /[A-Z]{4}/.test(l) && !l.startsWith('FICHE') && !l.startsWith('|') && !l.startsWith('CE SONT'));
  sortie.semaine = {
    normal: P.rendreLaFicheDeLaSemaine(semN).length,
    econome: P.rendreLaFicheDeLaSemaine(semE).length,
    rubriques: { normal: Object.keys(semN), econome: Object.keys(semE) },
    titres: { normal: titres(P.rendreLaFicheDeLaSemaine(semN)), econome: titres(P.rendreLaFicheDeLaSemaine(semE)) },
    lignes: { pronostics: [semN.pronostics.parMarche.length, semE.pronostics.parMarche.length], championnats: [semN.pronostics.parChampionnat.length, semE.pronostics.parChampionnat.length], erreurs: [semN.ia.semaine.erreurs.length, semE.ia.semaine.erreurs.length], extremes: [semN.paris.meilleurs.length + semN.paris.pires.length, semE.paris.meilleurs.length + semE.paris.pires.length], carnet: [semN.ia.carnet.parMarche.length, semE.ia.carnet.parMarche.length] },
    totauxIdentiques: JSON.stringify([semN.pronostics.regles, semN.paris.regles, semN.paris.gainReel, semN.ia.semaine.avis]) === JSON.stringify([semE.pronostics.regles, semE.paris.regles, semE.paris.gainReel, semE.ia.semaine.avis])
  };
}

// ============================================================================================== pannes
else if (phase === 'pannes') {
  const t = leJourA(JOUR0, 6, 10);
  const compteur = () => statutDuJour(JOUR0).count;
  const essais = () => (lireFichier()?.essais?.[`bulletin:${JOUR0}`] ?? []).map((e) => ({ type: e.type, raison: e.raison, refuses: e.refuses?.map((x) => x.nombre) ?? null, tokens: e.tokens ?? null }));
  const suite = [];
  const etape = async (nom, issue) => {
    if (issue) claude.programmer(issue);
    const avant = { appels: claude.appels.length, compteur: compteur() };
    const r = await bulletin(t + suite.length * 5 * 60_000);
    suite.push({ nom, ...court(r), appels: claude.appels.length - avant.appels, compteurPlus: compteur() - avant.compteur, essais: essais(), fichierBulletin: Boolean(lireFichier()?.bulletins?.[JOUR0]) });
    return r;
  };
  await etape('panne', 'panne');
  await etape('is_error', 'erreur');
  await etape('sans-sortie', 'sans-sortie');
  // Trois essais ratés : abandon, plus aucun appel ce jour-là.
  await etape('abandon', null);
  sortie.suite = suite;
  sortie.decision = S.decisionDuBulletin({ maintenant: t + 3600_000 });
  const lendemain = await bulletin(t + JOUR);
  sortie.lendemain = court(lendemain);

  // Chiffres refusés, puis rappel, puis succès (un autre jour, un autre fichier).
  fs.rmSync(FICHIER, { force: true });
  const t2 = leJourA('2026-10-06', 6, 10);
  const compteur2 = () => statutDuJour('2026-10-06').count;
  claude.programmer('chiffres');
  const c0 = compteur2();
  const refus = await bulletin(t2);
  const dernierAppel = claude.appels.at(-1);
  sortie.refus = { ...court(refus), compteurPlus: compteur2() - c0, essais: (lireFichier().essais['bulletin:2026-10-06'] ?? []).map((e) => ({ type: e.type, raison: e.raison, refuses: e.refuses.map((x) => x.nombre), champs: e.refuses.map((x) => x.champ), extraits: e.refuses.map((x) => x.extrait), tokens: e.tokens })), fichierBulletin: Boolean(lireFichier().bulletins?.['2026-10-06']), refusesDuService: refus.details.refuses?.map((x) => x.nombre) ?? null, aRappel: dernierAppel.aRappel };
  const reprise = await bulletin(t2 + 5 * 60_000);
  const appel2 = claude.appels.at(-1);
  const e2 = lireFichier();
  sortie.reprise = { ...court(reprise), aRappel: appel2.aRappel, essaisApres: e2.essais?.['bulletin:2026-10-06'] ?? null, entree: { essai: e2.bulletins['2026-10-06'].essai, garde: e2.bulletins['2026-10-06'].garde, titre: e2.bulletins['2026-10-06'].texte.titre }, compteurPlus: compteur2() - c0 };
  // Le rappel est APRÈS la fiche, et la fiche est la même : les nombres autorisés restent ceux de la fiche seule.
  sortie.memeFiche = appel2.userMessage.startsWith(dernierAppel.userMessage.split('\n\nRAPPEL')[0]) && appel2.userMessage.includes('\n\nRAPPEL');

  // Un nombre écrit en lettres qui n'est pas dans la fiche : refusé.
  fs.rmSync(FICHIER, { force: true });
  const t3 = leJourA('2026-10-07', 6, 10);
  claude.programmer('lettres');
  const lettres = await bulletin(t3);
  sortie.lettres = { ...court(lettres), refuses: lettres.details.refuses?.map((x) => [x.nombre, x.enLettres]) ?? null };

  // Une forme invalide (aucune section) : rien d'écrit, compté sur le plafond (la réponse a coûté), essai noté.
  fs.rmSync(FICHIER, { force: true });
  const t4 = leJourA('2026-10-08', 6, 10);
  const c4 = statutDuJour('2026-10-08').count;
  claude.programmer('forme');
  const forme = await bulletin(t4);
  sortie.forme = { ...court(forme), compteurPlus: statutDuJour('2026-10-08').count - c4, essais: (lireFichier().essais['bulletin:2026-10-08'] ?? []).map((e) => e.type) };

  // Une panne vue par les analyses de la même passe : aucun appel.
  fs.rmSync(FICHIER, { force: true });
  const t5 = leJourA('2026-10-09', 6, 10);
  const avant5 = claude.appels.length;
  const enPanne = await S.produireLeBulletin({ maintenant: t5, ctx: { claudeEnPanne: true }, options: { entrees: duJour(t5) } });
  sortie.enPanne = { ...court(enPanne), appels: claude.appels.length - avant5, essais: lireFichier()?.essais ?? null };
  // Claude Code non connecté.
  const nonConnecte = await S.produireLeBulletin({ maintenant: t5, options: { authentifie: false, entrees: duJour(t5) } });
  sortie.nonConnecte = { ...court(nonConnecte), appels: claude.appels.length - avant5 };
  // L'interrupteur des analyses automatiques coupé.
  const coupe = await S.produireLeBulletin({ maintenant: t5, options: { interrupteur: false, entrees: duJour(t5) } });
  sortie.coupe = { ...court(coupe), appels: claude.appels.length - avant5 };
  // Le bilan a les mêmes règles : une panne, puis le succès.
  const t6 = leJourA('2026-10-12', 6, 10);
  claude.programmer('panne');
  const bPanne = await bilan(t6, {}, { lundi: '2026-10-05' });
  const bOk = await bilan(t6 + 5 * 60_000, {}, { lundi: '2026-10-05' });
  sortie.bilan = { panne: court(bPanne), ok: court(bOk), essaisApres: lireFichier().essais?.['bilan:2026-10-05'] ?? null, entree: { essai: lireFichier().bilans['2026-10-05'].essai } };
  sortie.journalTypes = Object.fromEntries(
    ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((j) => [j, (lireLeJournal(serveur, j)?.appels ?? []).map((a) => `${a.type}:${a.statut}`)])
  );
}

// ============================================================================================== rien
else if (phase === 'rien') {
  const t = leJourA(JOUR0, 6, 10);
  // Rien à commenter : le Repérage est prêt, aucun pari, aucun favori — le jour est fait, sans appel.
  const r = await bulletin(t, {}, { vide: true, favoris: false });
  sortie.vide = { ...court(r), appels: claude.appels.length, entree: lireFichier().bulletins[JOUR0], compteur: statutDuJour(JOUR0).count };
  const b = await bilan(t, {}, { vide: true });
  sortie.videSemaine = { ...court(b), appels: claude.appels.length, entree: lireFichier().bilans['2026-09-28'] };
  // Une deuxième passe : toujours rien, toujours pas d'appel.
  sortie.encore = court(await bulletin(t + 3 * H, {}, { vide: true, favoris: false }));
  // Le Repérage pas prêt : le matin on attend (aucun essai noté).
  fs.rmSync(FICHIER, { force: true });
  const matin = leJourA('2026-10-06', 8, 0);
  const attente = await S.produireLeBulletin({ maintenant: matin, options: { entrees: duJour(matin, { opportunites: 'en-calcul' }) } });
  sortie.matin = { ...court(attente), appels: claude.appels.length, fichier: lireFichier() };
  const matinErreur = await S.produireLeBulletin({ maintenant: matin, options: { entrees: duJour(matin, { opportunites: 'erreur' }) } });
  sortie.matinErreur = court(matinErreur);
  // L'après-midi, avec des favoris : le bulletin part, sa rubrique des opportunités dit qu'elles manquent.
  const apresMidi = leJourA('2026-10-06', 13, 0);
  const part = await S.produireLeBulletin({ maintenant: apresMidi, options: { entrees: duJour(apresMidi, { opportunites: 'erreur' }) } });
  sortie.apresMidi = { ...court(part), appels: claude.appels.length, fiche: claude.appels.at(-1)?.userMessage.split('\n').filter((l) => /indisponibles|pas encore calculées/.test(l)) };
  // L'après-midi, sans favori et sans Repérage : rien à écrire, on attend encore.
  fs.rmSync(FICHIER, { force: true });
  const avant = claude.appels.length;
  const rien = await S.produireLeBulletin({ maintenant: apresMidi, options: { entrees: duJour(apresMidi, { opportunites: 'erreur', favoris: false, vide: true }) } });
  sortie.apresMidiSansFavori = { ...court(rien), appels: claude.appels.length - avant, fichier: lireFichier() };
}

// ============================================================================================== ecriture
else if (phase === 'ecriture') {
  // Tout passe par atomicJson : on enregistre chaque écriture et chaque renommage de fichier du processus.
  const writes = [];
  const renames = [];
  const ecrire = fs.writeFileSync;
  const renommer = fs.renameSync;
  let blocages = 0;
  let blocagesVoulus = 0;
  fs.writeFileSync = function (f, ...a) {
    writes.push(String(f));
    return ecrire.call(fs, f, ...a);
  };
  fs.renameSync = function (de, vers) {
    renames.push([String(de), String(vers)]);
    if (blocagesVoulus > 0 && String(vers) === FICHIER) {
      blocagesVoulus--;
      blocages++;
      const e = new Error('EBUSY: resource busy or locked, rename (OneDrive)');
      e.code = 'EBUSY';
      throw e;
    }
    return renommer.call(fs, de, vers);
  };
  const t = leJourA(JOUR0, 6, 10);
  const r = await bulletin(t);
  sortie.ecrit = court(r);
  sortie.ecrituresDuFichier = writes.filter((f) => f === FICHIER);
  sortie.ecrituresTemporaires = writes.filter((f) => f.startsWith(`${FICHIER}.`) && f.endsWith('.tmp')).length;
  sortie.renommagesVersLeFichier = renames.filter(([, vers]) => vers === FICHIER).length;
  sortie.renommagesDepuisUnTmp = renames.filter(([de, vers]) => vers === FICHIER && de.startsWith(`${FICHIER}.`) && de.endsWith('.tmp')).length;
  sortie.resteDesTmp = fs.readdirSync(RUNTIME).filter((n) => n.startsWith('ai-bulletins.json.') && n.endsWith('.tmp'));
  sortie.json = Boolean(JSON.parse(fs.readFileSync(FICHIER, 'utf8')).bulletins[JOUR0]);

  // Un blocage passager d'OneDrive (EBUSY deux fois) : l'écriture finit par passer, rien n'est perdu.
  blocagesVoulus = 2;
  const demain = leJourA('2026-10-06', 6, 10);
  const r2 = await bulletin(demain);
  fs.renameSync = renommer;
  fs.writeFileSync = ecrire;
  sortie.apresBlocage = { ...court(r2), blocages, cles: Object.keys(JSON.parse(fs.readFileSync(FICHIER, 'utf8')).bulletins) };

  // Écrire deux fois le même jour est refusé par le dépôt, même appelé directement.
  const deja = R.ecrireUnBulletin(JOUR0, { jour: JOUR0, ecritLe: iso(T0), texte: { titre: 'autre' } }, { maintenant: T0 });
  sortie.deuxFois = { ecrit: deja.ecrit, raison: deja.raison, titreGarde: lireFichier().bulletins[JOUR0].texte.titre !== 'autre' };
  const remplace = R.ecrireUnBulletin(JOUR0, { jour: JOUR0, ecritLe: iso(T0), texte: { titre: 'autre' } }, { maintenant: T0, remplacer: true });
  sortie.remplacer = { ecrit: remplace.ecrit, titre: lireFichier().bulletins[JOUR0].texte.titre };

  // Un fichier ILLISIBLE n'est jamais réécrit, et aucun appel ne part (un texte qu'on ne saurait pas ranger coûterait pour rien).
  const sauve = fs.readFileSync(FICHIER, 'utf8');
  const corrompu = '{"version":1,"bulletins":{"2026-10-05":';
  fs.writeFileSync(FICHIER, corrompu);
  const avant = claude.appels.length;
  const illisible = await bulletin(leJourA('2026-10-07', 6, 10));
  let leve = null;
  try {
    R.ecrireUnBulletin('2026-10-07', { jour: '2026-10-07' }, { maintenant: T0 });
  } catch (error) {
    leve = error.constructor.name;
  }
  try {
    R.noterUnEssaiRate('bulletin', '2026-10-07', { type: 'panne', raison: 'x' }, { maintenant: T0 });
  } catch {
    // attendu
  }
  sortie.illisible = { ...court(illisible), appels: claude.appels.length - avant, leve, intact: fs.readFileSync(FICHIER, 'utf8') === corrompu, lu: R.lireLesBulletins().etat };
  // De la mauvaise forme (un tableau) : de même.
  fs.writeFileSync(FICHIER, '[]');
  sortie.mauvaiseForme = { lu: R.lireLesBulletins().etat, intact: fs.readFileSync(FICHIER, 'utf8') === '[]' };
  fs.writeFileSync(FICHIER, sauve);

  // On ne garde que les derniers textes : 31 bulletins, 13 bilans ; les essais des clés disparues partent avec eux.
  fs.rmSync(FICHIER, { force: true });
  for (let k = 0; k < 40; k++) {
    const jour = new Date(Date.parse('2026-08-01T12:00:00Z') + k * JOUR).toISOString().slice(0, 10);
    R.ecrireUnBulletin(jour, { jour, ecritLe: iso(T0), texte: { titre: `Bulletin ${k}` } }, { maintenant: T0 });
  }
  for (let k = 0; k < 20; k++) {
    const lundi = new Date(Date.parse('2026-05-04T12:00:00Z') + k * 7 * JOUR).toISOString().slice(0, 10);
    R.ecrireUnBilan(lundi, { semaine: { cle: lundi }, ecritLe: iso(T0), texte: { titre: `Bilan ${k}` } }, { maintenant: T0 });
  }
  R.noterUnEssaiRate('bulletin', '2026-07-01', { type: 'panne', raison: 'trop vieux' }, { maintenant: T0 });
  R.noterUnEssaiRate('bulletin', '2026-09-09', { type: 'panne', raison: 'récent' }, { maintenant: T0 });
  const lu = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  sortie.rangement = { bulletins: Object.keys(lu.bulletins).length, premierBulletin: Object.keys(lu.bulletins).sort()[0], dernierBulletin: Object.keys(lu.bulletins).sort().at(-1), bilans: Object.keys(lu.bilans).length, premierBilan: Object.keys(lu.bilans).sort()[0], essais: Object.keys(lu.essais), garder: { bulletins: R.GARDER_BULLETINS, bilans: R.GARDER_BILANS } };
  // Un texte écrit efface les essais ratés de sa clé.
  R.noterUnEssaiRate('bulletin', '2026-09-20', { type: 'panne', raison: 'a' }, { maintenant: T0 });
  R.noterUnEssaiRate('bulletin', '2026-09-20', { type: 'forme', raison: 'b' }, { maintenant: T0 });
  const avantEcrit = Object.keys(JSON.parse(fs.readFileSync(FICHIER, 'utf8')).essais);
  R.ecrireUnBulletin('2026-09-20', { jour: '2026-09-20', ecritLe: iso(T0), texte: { titre: 'ok' } }, { maintenant: T0 });
  sortie.essaisEfface = { avant: avantEcrit.includes('bulletin:2026-09-20'), apres: Object.keys(JSON.parse(fs.readFileSync(FICHIER, 'utf8')).essais).includes('bulletin:2026-09-20') };
  // Le fichier du dépôt vit dans data/runtime, à côté des autres.
  sortie.chemin = path.relative(serveur, R.FICHIER_BULLETINS).split(path.sep).join('/');
}

// ============================================================================================== etapes
else if (phase === 'etapes') {
  const syn = await imp('jobs/matchStatsAutoRefresh.js');
  const J = syn.__testing;
  sortie.etapes = syn.REFRESH_STEPS.map((e) => e.key);
  sortie.labels = Object.fromEntries(syn.REFRESH_STEPS.filter((e) => ['bulletin', 'bilanSemaine'].includes(e.key)).map((e) => [e.key, e.label]));
  const t = leJourA(JOUR0, 6, 10);
  sortie.interrupteur = env.autoAiAnalysis.enabled;
  const due = (ctx = {}) => ({ bulletin: J.dueBulletin(ctx, { maintenant: t }), bilan: J.dueBilanSemaine(ctx, { maintenant: t }) });
  sortie.dueAuDepart = due();
  sortie.dueManuel = due({ manuel: true });
  // Une passe : l'étape du bulletin, avec les entrées fabriquées.
  const ctx = { ecrit: false, manuel: false };
  const e1 = await J.passeBulletin(ctx, { maintenant: t, entrees: duJour(t) });
  sortie.passeBulletin = { status: e1.status, summary: e1.summary, changed: e1.changed, code: e1.details.code, appelFait: e1.details.appelFait, tokens: e1.details.tokens, mode: e1.details.mode, ecrit: ctx.ecrit };
  sortie.dueApres = { bulletin: J.dueBulletin({}, { maintenant: t }), bilan: J.dueBilanSemaine({}, { maintenant: t }) };
  const e2 = await J.passeBilanSemaine(ctx, { maintenant: t, entrees: entreesDeLaSemaine({ maintenant: t }) });
  sortie.passeBilan = { status: e2.status, summary: e2.summary, changed: e2.changed, code: e2.details.code };
  sortie.dueFin = { bulletin: J.dueBulletin({}, { maintenant: t }), bilan: J.dueBilanSemaine({}, { maintenant: t }) };
  sortie.dueFinManuel = { bulletin: J.dueBulletin({ manuel: true }, { maintenant: t }), bilan: J.dueBilanSemaine({ manuel: true }, { maintenant: t }) };
  // Les deux ENTRÉES de la liste des étapes elles-mêmes (leur `due`, ce que lit l'actualisation) : les deux textes sont écrits, aucune ne l'est plus,
  // ni à la passe ni au clic (l'heure est celle, figée, du lundi 14 h : la décision lit `Date.now()`).
  const entreesDesEtapes = Object.fromEntries(J.ETAPES().filter((e) => ['bulletin', 'bilanSemaine'].includes(e.key)).map((e) => [e.key, e]));
  sortie.dueDesEtapes = { bulletin: entreesDesEtapes.bulletin.due({}), bilan: entreesDesEtapes.bilanSemaine.due({}), bulletinManuel: entreesDesEtapes.bulletin.due({ manuel: true }), bilanManuel: entreesDesEtapes.bilanSemaine.due({ manuel: true }) };
  sortie.pourquoi = { bulletin: S.decisionDuBulletin({ maintenant: t }).pourquoi, bilan: S.decisionDuBilan({ maintenant: t }).pourquoi };
  sortie.appelsPasses = claude.appels.length;
  // Ce que dit l'étape quand elle n'est pas due : le texte est déjà écrit.
  const etapeBulletin = J.ETAPES().find((e) => e.key === 'bulletin');
  sortie.pourquoiPasDue = etapeBulletin.pourquoiPasDue({});
  // L'interrupteur des analyses automatiques coupé : ni la passe ni un clic ne forcent les deux étapes (comme les étapes d'analyse).
  fs.rmSync(FICHIER, { force: true });
  env.autoAiAnalysis.enabled = false;
  sortie.interrupteurCoupe = { bulletin: J.ETAPES().find((e) => e.key === 'bulletin').due({}), bulletinManuel: J.ETAPES().find((e) => e.key === 'bulletin').due({ manuel: true }), bilanManuel: J.ETAPES().find((e) => e.key === 'bilanSemaine').due({ manuel: true }) };
  env.autoAiAnalysis.enabled = true;

  // Une panne que les analyses viennent de voir (3 pannes d'affilée) arrête le bulletin de CETTE passe. FotMob est simulé (listes vides) : la
  // réserve d'avant coup d'envoi, calculée par la passe d'analyse, ne sort pas sur le réseau.
  fs.rmSync(FICHIER, { force: true });
  installerFauxFetch({ listes: { 20261004: listeDuJour([]), 20261005: listeDuJour([]), 20261006: listeDuJour([]), 20261007: listeDuJour([]) } });
  const ctx2 = { ecrit: false, manuel: false };
  const r = await J.passeIaAuto(ctx2, {
    lancer: async () => ({ interrompu: true, ok: 0, failed: 3, candidates: 6, ecartes: 0, samples: ['x : panne'], mode: 'normal' }),
    usage: (ok, skipped) => ({ preMatch: ok, skippedPreMatch: skipped }),
    candidats: ['rencontre', 'rencontres'],
    faits: ['analysée', 'analysées']
  });
  const avant = claude.appels.length;
  const e3 = await J.passeBulletin(ctx2, { maintenant: t, entrees: duJour(t) });
  sortie.apresPannesDesAnalyses = { analyses: r.status, claudeEnPanne: ctx2.claudeEnPanne === true, bulletin: { status: e3.status, code: e3.details.code }, appels: claude.appels.length - avant };
  // Une passe sans panne : le drapeau n'est pas posé.
  const ctx3 = { ecrit: false };
  await J.passeIaAuto(ctx3, { lancer: async () => ({ interrompu: false, ok: 1, failed: 0, candidates: 1, ecartes: 0, samples: [], mode: 'normal' }), usage: (ok, skipped) => ({ preMatch: ok, skippedPreMatch: skipped }), candidats: ['a', 'b'], faits: ['c', 'd'] });
  sortie.sansPanne = { claudeEnPanne: ctx3.claudeEnPanne === true };
  // Le tableau des étapes : la raison dite quand une étape n'est pas due.
  const entree = J.ETAPES().filter((e) => ['bulletin', 'bilanSemaine'].includes(e.key));
  fs.rmSync(FICHIER, { force: true });
  sortie.etapesTableau = entree.map((e) => ({ key: e.key, aUnPourquoi: typeof e.pourquoiPasDue === 'function', due: e.due({}) }));
  const bulletinEtape = entree.find((e) => e.key === 'bulletin');
  sortie.pourquoiSiAFaire = bulletinEtape.pourquoiPasDue({});
  sortie.ordre = J.ETAPES().map((e) => e.key);
}

// ============================================================================================== route
else if (phase === 'route') {
  const { createApp } = await imp('app.js');
  const app = createApp();
  const requete = (methode, url) =>
    new Promise((resolve, reject) => {
      const req = new http.IncomingMessage(new Socket());
      req.method = methode;
      req.url = url;
      req.headers = { host: 'essai' };
      const res = new http.ServerResponse(req);
      const morceaux = [];
      res.write = (c) => {
        morceaux.push(Buffer.from(c));
        return true;
      };
      res.end = (c) => {
        if (c) morceaux.push(Buffer.from(c));
        let rendu = null;
        try {
          rendu = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
        } catch {
          rendu = null;
        }
        resolve({ code: res.statusCode, corps: rendu });
        return res;
      };
      app.handle(req, res, reject);
    });
  const { openDb } = await imp('data/db/matchStatsDb.js');
  const db = openDb();
  const changements = () => db.prepare('SELECT total_changes() AS n').get().n;
  // Toute l'arborescence de data/runtime (le journal des appels Claude compris), fichier par fichier.
  const empreintes = () =>
    Object.fromEntries(
      fs
        .readdirSync(RUNTIME, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => {
          const f = path.join(e.parentPath ?? e.path, e.name);
          return [path.relative(RUNTIME, f).split(path.sep).join('/'), sha1(f)];
        })
        .sort(([x], [y]) => x.localeCompare(y))
    );

  const base = changements();
  const avantFichiers = empreintes();
  const vide = await requete('GET', '/api/match-ai-analysis/bulletins');
  sortie.vide = { code: vide.code, etat: vide.corps?.etat, bulletin: vide.corps?.bulletin, bilan: vide.corps?.bilan, situation: vide.corps?.situation, cles: Object.keys(vide.corps ?? {}), semaine: vide.corps?.semaine, historique: vide.corps?.historique, regles: vide.corps?.regles, budget: vide.corps?.budget?.mode };
  sortie.rienEcrit = { fichiers: JSON.stringify(empreintes()) === JSON.stringify(avantFichiers), base: changements() === base, fichierDesTextesCree: fs.existsSync(FICHIER) };

  // Les deux textes écrits, puis la route.
  const t = T0;
  await S.produireLeBulletin({ maintenant: t, options: { entrees: duJour(t) } });
  await S.produireLeBilan({ maintenant: t, options: { entrees: entreesDeLaSemaine({ maintenant: t }) } });
  const apres = await requete('GET', '/api/match-ai-analysis/bulletins');
  const avantLecture = empreintes();
  const baseAvant = changements();
  const appelsAvant = claude.appels.length;
  const encore = await requete('GET', '/api/match-ai-analysis/bulletins');
  sortie.rempli = {
    code: apres.code,
    etat: apres.corps?.etat,
    bulletin: { jour: apres.corps?.bulletin?.jour, titre: apres.corps?.bulletin?.texte?.titre, sections: apres.corps?.bulletin?.texte?.sections?.length, tokens: apres.corps?.bulletin?.usage?.total, mode: apres.corps?.bulletin?.mode, garde: apres.corps?.bulletin?.garde, fiche: apres.corps?.bulletin?.fiche?.slice(0, 40) },
    bilan: { cle: apres.corps?.bilan?.semaine?.cle, titre: apres.corps?.bilan?.texte?.titre, tokens: apres.corps?.bilan?.usage?.total },
    situation: apres.corps?.situation,
    historique: apres.corps?.historique
  };
  sortie.lectureSeule = { fichiers: JSON.stringify(empreintes()) === JSON.stringify(avantLecture), base: changements() === baseAvant, memeReponse: JSON.stringify({ ...encore.corps, generatedAt: null }) === JSON.stringify({ ...apres.corps, generatedAt: null }), appelsDeClaude: claude.appels.length - appelsAvant };

  // POST : la route n'existe pas (ni bouton, ni appel).
  const post = await requete('POST', '/api/match-ai-analysis/bulletins');
  sortie.post = { code: post.code, erreur: post.corps?.error ?? null };
  // Illisible : 503, jamais pris pour vide.
  const sauve = fs.readFileSync(FICHIER, 'utf8');
  fs.writeFileSync(FICHIER, '{"bulletins":');
  const casse = await requete('GET', '/api/match-ai-analysis/bulletins');
  sortie.illisible = { code: casse.code, etat: casse.corps?.etat, erreur: casse.corps?.error ?? null, situation: casse.corps?.situation?.bulletin?.code, historique: casse.corps?.historique };
  fs.writeFileSync(FICHIER, sauve);
  // Les autres routes voisines du même routeur n'ont pas bougé.
  const statut = await requete('GET', '/api/match-ai-analysis/status');
  const tout = await requete('GET', '/api/match-ai-analysis');
  sortie.voisines = { status: statut.code, tout: tout.code };
  sortie.appelsDeClaude = claude.appels.length;
}

// ============================================================================================== ecran
else if (phase === 'ecran') {
  const { createApp } = await imp('app.js');
  const app = createApp();
  const requete = (methode, url) =>
    new Promise((resolve, reject) => {
      const req = new http.IncomingMessage(new Socket());
      req.method = methode;
      req.url = url;
      req.headers = { host: 'essai' };
      const res = new http.ServerResponse(req);
      const morceaux = [];
      res.write = (c) => {
        morceaux.push(Buffer.from(c));
        return true;
      };
      res.end = (c) => {
        if (c) morceaux.push(Buffer.from(c));
        let rendu = null;
        try {
          rendu = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
        } catch {
          rendu = null;
        }
        resolve({ code: res.statusCode, corps: rendu });
        return res;
      };
      app.handle(req, res, reject);
    });
  const lire = async () => (await requete('GET', '/api/match-ai-analysis/bulletins')).corps;
  const t = leJourA(JOUR0, 6, 10);
  // 1. Rien d'écrit encore, le matin (avant 6 h : « attend le matin »), puis à 6 h 10 (« pas encore écrit »).
  sortie.jamais = await lire();
  // 2. Les deux textes écrits.
  await S.produireLeBulletin({ maintenant: t, options: { entrees: duJour(t) } });
  await S.produireLeBilan({ maintenant: t, options: { entrees: entreesDeLaSemaine({ maintenant: t }) } });
  sortie.ecrits = await lire();
  // L'état du budget Claude (la carte « Budget Claude » de Réglages) avec les deux appels au journal.
  sortie.budget = (await requete('GET', '/api/claude-budget?force=1')).corps;
  fs.rmSync(FICHIER, { force: true });
  // 3. Un texte refusé par la garde des chiffres (un essai raté) et une panne.
  claude.programmer('chiffres');
  await S.produireLeBulletin({ maintenant: T0, options: { entrees: duJour(T0) } });
  claude.programmer('panne');
  await S.produireLeBilan({ maintenant: T0, options: { entrees: entreesDeLaSemaine({ maintenant: T0 }) } });
  sortie.refuse = await lire();
  // 4. Trois essais ratés : abandon du bulletin.
  claude.programmer('panne', 'erreur');
  await S.produireLeBulletin({ maintenant: T0 + 60_000, options: { entrees: duJour(T0) } });
  await S.produireLeBulletin({ maintenant: T0 + 120_000, options: { entrees: duJour(T0) } });
  sortie.abandon = await lire();
  fs.rmSync(FICHIER, { force: true });
  // 5. Rien à commenter.
  await S.produireLeBulletin({ maintenant: T0, options: { entrees: duJour(T0, { vide: true, favoris: false }) } });
  await S.produireLeBilan({ maintenant: T0, options: { entrees: entreesDeLaSemaine({ maintenant: T0, vide: true }) } });
  sortie.rien = await lire();
  fs.rmSync(FICHIER, { force: true });
  // 6. Le dernier texte d'hier reste lisible quand celui d'aujourd'hui n'est pas encore écrit.
  await S.produireLeBulletin({ maintenant: T0 - JOUR, options: { entrees: { ...duJour(T0 - JOUR), jour: '2026-10-04' } } });
  sortie.hier = await lire();
  // 7. Illisible.
  fs.writeFileSync(FICHIER, '{"bulletins":');
  const casse = await requete('GET', '/api/match-ai-analysis/bulletins');
  sortie.illisible = { code: casse.code, corps: casse.corps };
  fs.rmSync(FICHIER, { force: true });
  // 8. Les analyses automatiques coupées (l'interrupteur) : dit tel quel.
  const S2 = S.etatDesBulletins({ maintenant: T0, interrupteur: false });
  sortie.coupe = S2;
  sortie.appelsDeClaude = claude.appels.length;
}

else {
  throw new Error(`Phase inconnue : ${phase}`);
}

claude.arreter();
console.log(JSON.stringify(sortie));
