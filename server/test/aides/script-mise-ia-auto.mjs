/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-mise-ia-auto.mjs <serveur de la copie>
 *
 * Lot A1 (17/11/2026, pendant l'essai n° 3 ; vérification des lots d'argent, mise C8) — LA MISE DE L'ANALYSE IA AUTOMATIQUE EST
 * CELLE DE LA PAGE DU MATCH. Sur la base d'essai, des matchs FABRIQUÉS (aucune donnée réelle), sans réseau, et des contextes de
 * mise FABRIQUÉS (la forme de data/mise/miseRead.js, contexteDeLaMise : capital, plafonds en euros, paris en attente, fiches des
 * comptes) :
 *   1. la page du match (le chemin d'analysis.controller.js : contexteDuMoteur, analyzeMatch, analyseAvecLaMise) rend une part ;
 *   2. l'analyse automatique (autoMatchAiTrigger.js : avecLeContexteDeMise avec le même contexte, analyzeMatch, resultatPourLIA)
 *      écrit à l'IA une ligne « Mise (staking) » (compactContext.js, ficheAvantMatch) ;
 *   3. ce que le gel de l'analyse écrirait (gelPronostics.js, elementDuGel) avec et sans contexte de mise ;
 *   4. une lecture du contexte qui lève : la ligne écrite à l'IA.
 * Passe 2 (17/11/2026, vérification de A1) :
 *   - K6 : l'analyse automatique passe par le VRAI calculerEngineResult (exporté, lectures injectables : `lire`, `geler`) ;
 *     ce que le gel recevrait est capturé (le match d'origine, le résultat du moteur) ;
 *   - la page suit le contrôleur jusqu'à « à vérifier » (preparerAVerifierDuConseilParNoms, avecAVerifierPourLeMoteur) ;
 *   - K5 : un plafond du moment (garde-fous de la copie : mise maximale 2 €) posé APRÈS la règle (contexte sans garde-fous) ;
 *   - K1 et O1 : les VRAIS fichiers de la copie (capital 300 € fixe, un pari de 5 € en attente sur le match), puis chacun
 *     rendu illisible tour à tour (bets.json, capital.json, comptes-bookmakers.json, garde-fous.json) : la page (le vrai
 *     contexteDeLaMise, analyseAvecLaMise) et l'automatique (calculerEngineResult, lecture par défaut) — la même décision ;
 *   - K2 et K3 : un match fabriqué « à vérifier », par le vrai moteur : le MESSAGE ENTIER (consignes et message) des 4 chemins
 *     vers l'IA (avant-match compacte et ancienne : preparerAnalyseAvantMatch ; revue compacte et ancienne :
 *     preparerRevueApresMatch), FotMob simulé (aucun réseau) ; les aiguilles du conseil refusé y sont cherchées ;
 *   - K4 : la part lue par la revue d'après-match (même résumé gardé) et le résumé de la revue d'une analyse gardée AVANT A1.
 * Passe 4 (17/11/2026, N1 et N2) : l'analyse IA DEMANDÉE PAR UN CLIC — la réponse de la page (K1/O1, toutes lectures ; K5)
 * passée en JSON, comme l'écran l'envoie (UpcomingMatchView.vue, `engineResult: analyse.value.result`), à
 * preparerAnalyseAvantMatch puis à la revue (preparerRevueApresMatch), sous les deux formes ; le résumé gardé (ce que l'écran
 * de la revue relit, N3).
 * Ce script ne vérifie rien ; il rend une ligne JSON.
 */
import fs from 'node:fs';
import { installerFauxFetch, listeDuJour } from './fotmobSimule.mjs';

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const { adaptSeasonCalendarMatch } = await imp('data/adapters/seasonCalendarAdapter.js');
const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
const { getEngineConfig } = await imp('core/engine/engineConfig.js');
const { getTiltState } = await imp('core/engine/tiltState.js');
const { getSport } = await imp('sports/index.js');
const gel = await imp('data/enregistreurs/gelPronostics.js');
const M = await imp('data/mise/miseRead.js');
const { contexteDuMoteur, analyseAvecLaMise } = M;
const { avecLeContexteDeMise, resultatPourLIA, calculerEngineResult } = await imp('core/ai/autoMatchAiTrigger.js');
const C = await imp('core/ai/compactContext.js');
const { preparerAVerifierDuConseilParNoms, avecAVerifierPourLeMoteur } = await imp('data/aVerifierPourLeMoteur.js');
const CAP = await imp('data/mise/capitalDePierre.js');
const RUNTIME = path.join(serveur, 'data', 'runtime');


const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
const sport = getSport('football');
const tilt = getTiltState();
const enService = getEngineConfig('football');
const reglageMoteur = { kellyFraction: enService.kellyFraction, maxStakePercent: enService.maxStakePercent };

const cal = (league, homeName, awayName) => adaptSeasonCalendarMatch({ league, homeName, awayName, date: '2026-10-06' }, 1000);
const CLUBS = [cal('EPL', 'Aston Villa', "Nott'm Forest"), cal('Championship', 'Charlton', 'Portsmouth'), cal('Serie A - Italy', 'Inter', 'Udinese')];
const ligne = (key, title, [odds1, oddsDraw, odds2]) => ({ key, title, odds1, oddsDraw, odds2 });
const moyenne = (lignes, champ) => Number((lignes.reduce((s, l) => s + l[champ], 0) / lignes.length).toFixed(2));
const payant = (match, lignes) => ({
  ...match,
  hasOdds: true,
  commenceTime: '2026-10-06T19:00:00.000Z',
  marketOdds: { odds1: moyenne(lignes, 'odds1'), oddsDraw: moyenne(lignes, 'oddsDraw'), odds2: moyenne(lignes, 'odds2'), bookmakersCount: lignes.length, byBookmaker: lignes }
});
const SORTES = {
  williamhill: (m) => payant(m, [ligne('pinnacle', 'Pinnacle', [2.0, 3.5, 4.0]), ligne('williamhill', 'William Hill', [2.25, 3.3, 3.4]), ligne('unibet_fr', 'Unibet (FR)', [1.95, 3.4, 3.9])]),
  unibetFr: (m) => payant(m, [ligne('pinnacle', 'Pinnacle', [2.0, 3.5, 4.0]), ligne('unibet_fr', 'Unibet (FR)', [2.3, 3.3, 3.4])])
};

/** Des contextes de mise de la forme de contexteDeLaMise (data/mise/miseRead.js) : rien n'est lu, tout est fabriqué. */
const contextes = (m) => ({
  sansCapital: { capital: { indique: false }, base: 10000, reglageMoteur, gardeFous: null, comptes: {}, paris: [], maintenant: T0 },
  capital300MiseMax2: { capital: { indique: true, montant: 300, plusHaut: 300, plancher: null }, base: 300, reglageMoteur, gardeFous: { miseMaxParPari: 2, resteSemaine: 40 }, comptes: {}, paris: [], maintenant: T0 },
  capital2000PariEnAttente: {
    capital: { indique: true, montant: 2000, plusHaut: 2000, plancher: null },
    base: 2000,
    reglageMoteur,
    gardeFous: null,
    comptes: {},
    paris: [{ id: 'p1', status: 'pending', stake: 30, legs: [{ matchId: m.matchId, homeName: m.home, awayName: m.away, commenceTime: m.commenceTime }] }],
    maintenant: T0
  },
  miseAccepteeConnue: { capital: { indique: true, montant: 1000, plusHaut: 1000, plancher: null }, base: 1000, reglageMoteur, gardeFous: null, comptes: { williamhill: { miseMaxAcceptee: 1.5, soldeDeclare: 100 }, unibet_fr: { miseMaxAcceptee: 1.5, soldeDeclare: 100 } }, paris: [], maintenant: T0 }
});

const partDite = (f) => (typeof f === 'number' && Number.isFinite(f) ? `${(100 * f).toFixed(2).replace('.', ',')} % du capital` : 'part du capital non calculée');
const ligneDeMise = (resultat) => {
  const fiche = C.ficheAvantMatch({ home: 'D', away: 'E', league: 'L', commenceTime: '2026-10-06T19:00:00.000Z', timing: 'avance', engineSummary: { staking: resultat.staking ?? null } });
  return fiche.split('\n').find((l) => l.startsWith('Mise (staking) : ')) ?? null;
};
const sansHeure = (e) => JSON.stringify({ ...e, recordedAt: null });
const elementDe = (m, engineResult) =>
  gel.elementDuGel({ match: m, engineResult, origine: gel.ORIGINES.avance, maintenant: T0, homeId: null, awayId: null, cotes: gel.sourceDesCotes(m, { heureInstantanePayant: null }), compo: gel.etatDeLaCompo({}), engineHash: gel.empreinteMoteur(enService), config: enService, aVerifier: null });

/** La page du match : le chemin d'analysis.controller.js (« à vérifier » joint, contexteDuMoteur, analyzeMatch, analyseAvecLaMise). */
async function pageDuMatch(enrichi, ctx, t = tilt) {
  const avecAV = avecAVerifierPourLeMoteur(enrichi, preparerAVerifierDuConseilParNoms()(enrichi));
  return analyseAvecLaMise(await analyzeMatch({ ...avecAV, contexteDeMise: contexteDuMoteur(ctx, avecAV) }, enService, t, sport, { maintenant: T0 }), { contexte: ctx, match: avecAV });
}
/** L'automatique : le VRAI calculerEngineResult ; ce que le gel recevrait est capturé. */
async function automatique(brut, options = {}) {
  const geles = [];
  const ia = await calculerEngineResult(brut, { ...options, geler: (x) => geles.push(x) });
  return { ia, gele: geles[0] ?? null, nombreDeGels: geles.length };
}
/** Le résultat pour l'IA = celui du moteur, plus seulement la part de la page, la marque et la base (jamais modifié). */
const intact = (ia, moteur) => {
  if (!ia || !moteur || ia === moteur) return Boolean(ia) && ia === moteur;
  const { mise, staking, ...reste } = ia;
  const { mise: m0, staking: s0, ...reste0 } = moteur;
  if (JSON.stringify(reste) !== JSON.stringify(reste0)) return false;
  if (m0 !== undefined && JSON.stringify(mise) !== JSON.stringify(m0)) return false;
  if (!staking || !s0) return staking === s0;
  const { partDuCapital, contexteDeLaMise, miseNonLue, ...s } = staking;
  return JSON.stringify(s) === JSON.stringify(s0);
};

const cas = [];
for (const club of CLUBS) {
  for (const [sorte, faire] of Object.entries(SORTES)) {
    const brut = faire(club);
    const enrichi = await enrichMatchWithRealAverages(brut, { sansRepliPayant: true });
    const sansContexte = await analyzeMatch(enrichi, enService, tilt, sport, { maintenant: T0 });
    for (const [nom, ctx] of Object.entries(contextes(enrichi))) {
      // 1. La page du match (analysis.controller.js).
      const page = await pageDuMatch(enrichi, ctx);
      // 2. L'analyse automatique (autoMatchAiTrigger.js, calculerEngineResult), avec le même contexte.
      const lu = avecLeContexteDeMise(enrichi, { lire: () => ctx });
      const { ia: pourIA, gele, nombreDeGels } = await automatique(brut, { lire: () => ctx });
      const moteur = gele?.engineResult ?? null;
      cas.push({
        nom: `${club.home}|${sorte}|${nom}`,
        action: page.staking?.action ?? null,
        contexteLu: lu.contexteLu,
        memeContexte: JSON.stringify(lu.match.contexteDeMise) === JSON.stringify(contexteDuMoteur(ctx, enrichi)),
        fractionPage: page.mise?.fraction ?? null,
        partPleine: page.staking?.action === 'RECOMMENDED' ? C.partDuCapitalPourIA({ ev: page.staking.ev, cote: page.staking.odds }) : null,
        attendue: page.staking?.action === 'RECOMMENDED' ? `Mise (staking) : RECOMMENDED : ${partDite(page.mise?.fraction)} sur ` : null,
        ligne: ligneDeMise(pourIA),
        ligneSansContexte: ligneDeMise(sansContexte),
        base: C.baseDuCalculDe(pourIA),
        moteurIntact: intact(pourIA, moteur),
        // 3. Le gel de l'analyse : ce qu'il écrirait avec le résultat calculé AVEC le contexte, et sans ; il reçoit le match d'origine.
        gelRecoitLeMatch: nombreDeGels === 1 && gele?.match === brut && gele?.origine === gel.ORIGINES.avance,
        gelIdentique: sansHeure(elementDe(brut, moteur)) === sansHeure(elementDe(brut, sansContexte)),
        lignesGelees: elementDe(brut, moteur).pronostics.length,
        nonCalculeePage: page.mise?.nonCalculee ?? null
      });
    }
    // 4. Une lecture du contexte qui lève.
    const casse = avecLeContexteDeMise(enrichi, {
      lire: () => {
        throw new Error('capital illisible');
      }
    });
    const moteurCasse = await analyzeMatch(casse.match, enService, tilt, sport, { maintenant: T0 });
    const { ia: iaCasse } = await automatique(brut, {
      lire: () => {
        throw new Error('capital illisible');
      }
    });
    cas.push({ nom: `${club.home}|${sorte}|illisible`, illisible: true, contexteLu: casse.contexteLu, memeMatch: casse.match === enrichi, action: moteurCasse.staking?.action ?? null, ligne: ligneDeMise(resultatPourLIA(moteurCasse, casse)), ligneAuto: ligneDeMise(iaCasse), ancienne: C.stakingSansEuros(resultatPourLIA(moteurCasse, casse).staking) });
  }
}

// Passe 4 (N1) : les réponses de la page, en JSON, rejouées plus bas par le chemin « à la demande » (après le FotMob simulé).
const pagesDemandees = [];
const garderLaPage = (nom, attendues, enrichi, brut, page) => pagesDemandees.push({ nom, attendues, home: enrichi.home, away: enrichi.away, league: enrichi.league, commenceTime: brut.commenceTime, json: JSON.stringify(page) });

// K5 : un plafond du moment posé APRÈS la règle — les garde-fous de la copie (mise maximale 2 €, lus par getTiltState) et un
// contexte qui n'en porte pas (gardeFous null) : la page montre la mise ramenée (euros / capital) ; l'IA doit lire la même part.
const plafondHorsRegle = [];
fs.writeFileSync(path.join(RUNTIME, 'garde-fous.json'), JSON.stringify({ miseMaxParPari: 2, majLe: '2026-10-05T10:00:00.000Z' }));
{
  const t = getTiltState();
  for (const club of CLUBS) {
    const brut = SORTES.williamhill(club);
    const enrichi = await enrichMatchWithRealAverages(brut, { sansRepliPayant: true });
    const ctxs = {
      capital1000: { capital: { indique: true, montant: 1000, plusHaut: 1000, plancher: null }, base: 1000, reglageMoteur, gardeFous: null, comptes: {}, paris: [], maintenant: T0 },
      capital300Plancher: { capital: { indique: true, montant: 300, plusHaut: 320, plancher: 290 }, base: 300, reglageMoteur, gardeFous: null, comptes: {}, paris: [], maintenant: T0 }
    };
    for (const [nom, ctx] of Object.entries(ctxs)) {
      const page = await pageDuMatch(enrichi, ctx, t);
      garderLaPage(`K5|${club.home}|${nom}`, null, enrichi, brut, page);
      const { ia, gele } = await automatique(brut, { lire: () => ctx });
      const s = gele?.engineResult?.staking ?? null;
      plafondHorsRegle.push({
        nom: `${club.home}|${nom}`,
        plafondDuMoment: t.plafondDeMise ?? null,
        action: page.staking?.action ?? null,
        horsRegle: Boolean(s?.misePlafonnee && !s?.regleDeMise?.plafond),
        fractionPage: page.mise?.fraction ?? null,
        regleF: s?.regleDeMise?.f ?? null,
        attendue: page.staking?.action === 'RECOMMENDED' ? `Mise (staking) : RECOMMENDED : ${partDite(page.mise?.fraction)} sur ` : null,
        ligne: ligneDeMise(ia)
      });
    }
  }
}
fs.rmSync(path.join(RUNTIME, 'garde-fous.json'), { force: true });

// K1 et O1 : les VRAIS fichiers de la copie, puis chacun rendu illisible tour à tour — la page et l'automatique.
const lectures = [];
{
  const brut = SORTES.williamhill(CLUBS[0]);
  const enrichi = await enrichMatchWithRealAverages(brut, { sansRepliPayant: true });
  const pari = [{ id: 'p1', status: 'pending', stake: 5, createdAt: '2026-10-05T10:00:00.000Z', legs: [{ matchId: enrichi.matchId, homeName: enrichi.home, awayName: enrichi.away, commenceTime: enrichi.commenceTime }] }];
  const ecrire = (nom, contenu) => fs.writeFileSync(path.join(RUNTIME, nom), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
  ecrire('bets.json', pari);
  CAP.enregistrerCapital({ montant: 300, suitLeCarnet: false }, { maintenant: T0 });
  ecrire('comptes-bookmakers.json', { comptes: { williamhill: { soldeDeclare: 200 } } });
  ecrire('garde-fous.json', { miseMaxParPari: 50, majLe: '2026-10-05T10:00:00.000Z' });
  const bons = Object.fromEntries(['bets.json', 'capital.json', 'comptes-bookmakers.json', 'garde-fous.json'].map((n) => [n, fs.readFileSync(path.join(RUNTIME, n), 'utf8')]));
  // Passe 4 (N2) : la règle de mise de la décision (sa part) compte aussi.
  const EUROS = new RegExp('"(stake|mise|misePlafonnee|regleDeMise)":[0-9{]');
  const voir = async (nom, attendues) => {
    const ctx = M.contexteDeLaMise({ sportId: 'football' });
    const page = await pageDuMatch(enrichi, ctx, getTiltState());
    garderLaPage(nom, attendues, enrichi, brut, page);
    const { ia } = await automatique(brut);
    lectures.push({
      nom,
      attendues,
      lecturesRatees: ctx.lecturesRatees,
      action: page.staking?.action ?? null,
      actionAuto: ia?.staking?.action ?? null,
      mise: page.mise ?? null,
      eurosDansLaPage: EUROS.test(JSON.stringify({ ...page, mise: null })),
      regleDansLaPage: 'regleDeMise' in (page.staking ?? {}),
      ligne: ligneDeMise(ia),
      ancienne: C.stakingSansEuros(ia?.staking ?? null)
    });
  };
  await voir('tout se lit', []);
  for (const [fichier, lecture] of [['bets.json', 'carnet'], ['capital.json', 'capital'], ['comptes-bookmakers.json', 'comptes'], ['garde-fous.json', 'garde-fous']]) {
    ecrire(fichier, '{ illisible');
    await voir(`${fichier} illisible`, [lecture]);
    ecrire(fichier, bons[fichier]);
  }
  await voir('tout se relit', []);
}
// K2 et K3 : les 4 chemins vers l'IA d'un match « à vérifier », par le vrai moteur et le vrai service (FotMob simulé, aucun réseau).
installerFauxFetch({ listes: { 20261005: listeDuJour([]), 20261006: listeDuJour([]), 20261007: listeDuJour([]) } });
const service = await imp('core/ai/matchAiAnalysisService.js');
const { curateEngineSummary, avecLaVersion, pourIA } = service.__testing;
const chemins = {};
{
  const RAISON = 'score différent chez football-data (fabriqué)';
  const av = { raisons: [{ id: 'essai', texte: RAISON, familles: ['tout'] }], texte: RAISON };
  const brut = SORTES.williamhill(CLUBS[0]);
  const enrichi = await enrichMatchWithRealAverages(brut, { sansRepliPayant: true });
  const sansAV = await analyzeMatch(enrichi, enService, tilt, sport, { maintenant: T0 });
  const avecAV = await analyzeMatch(avecAVerifierPourLeMoteur(enrichi, av), enService, tilt, sport, { maintenant: T0 });
  const c = avecAV.staking?.conseilRefuse ?? {};
  const fr = (x) => String(x).replace('.', ',');
  const aiguilles = [];
  for (const v of [c.odds, c.displayedOdds, c.ev]) if (typeof v === 'number') aiguilles.push(String(v), fr(v));
  if (typeof c.ev === 'number') aiguilles.push((100 * c.ev).toFixed(2), fr((100 * c.ev).toFixed(2)), (100 * c.ev).toFixed(1), fr((100 * c.ev).toFixed(1)));
  if (typeof avecAV.edgePercent === 'number') aiguilles.push(String(avecAV.edgePercent), fr(avecAV.edgePercent));
  aiguilles.push(...[c.bookmaker, c.bookmakerTitle].filter(Boolean), 'conseilRefuse', '"candidates"', 'cotes jugées');
  const messages = async (resultat) => {
    const sortie = {};
    for (const fiche of ['compacte', 'ancienne']) {
      const d = await service.preparerAnalyseAvantMatch({ matchId: `essai-av-${fiche}`, home: enrichi.home, away: enrichi.away, league: enrichi.league, engineResult: resultat, sansRepliPayant: true, fiche });
      sortie[`avant-match ${fiche}`] = `${d.system}\n${d.userMessage}`;
      const prior = { matchId: `essai-av-${fiche}`, homeName: enrichi.home, awayName: enrichi.away, league: enrichi.league, commenceTime: brut.commenceTime, timing: 'avance', analysedAt: '2026-10-05T12:00:00.000Z', analysis: { summary: 'essai', marketOpinions: [] }, engineSnapshot: avecLaVersion(d.engineSummary, resultat) };
      const r = service.preparerRevueApresMatch({ prior, result: { homeGoals: 1, awayGoals: 0, homeName: enrichi.home, awayName: enrichi.away, date: '2026-10-06' }, fiche });
      sortie[`revue ${fiche}`] = `${r.system}\n${r.userMessage}`;
    }
    return sortie;
  };
  const trouve = (texte) => aiguilles.filter((a) => texte.includes(a)).map((a) => { const i = texte.indexOf(a); return { aiguille: a, autour: texte.slice(Math.max(0, i - 90), i + 40) }; });
  const avec = await messages(avecAV);
  const sans = await messages(sansAV);
  for (const nom of Object.keys(avec)) {
    chemins[nom] = {
      longueur: avec[nom].length,
      trouves: trouve(avec[nom]),
      phrase: avec[nom].includes(`aucun pari conseillé : données du match à vérifier (${RAISON})`),
      edgeNonDit: avec[nom].includes('edgePercent : non dit (match à vérifier)') || avec[nom].includes('"edgePercent":null'),
      // Témoin : sans « à vérifier », le même chemin porte la cote et le bookmaker du conseil (les aiguilles se trouvent).
      temoin: trouve(sans[nom]).map((x) => x.aiguille)
    };
  }
  chemins.conseilRefuse = { action: avecAV.staking?.action, reason: avecAV.staking?.reason, odds: c.odds ?? null, bookmaker: c.bookmaker ?? null, ev: c.ev ?? null, edgePercent: avecAV.edgePercent ?? null, actionSans: sansAV.staking?.action, aiguilles };
}

// K4 : la revue d'après-match lit la même part que l'avant-match (le résumé gardé), sous les deux formes ; une analyse gardée
// AVANT A1 (sans règle ni part notée) : le résumé que la revue reçoit est celui d'avant (pourIA d'avant le lot A1, recopiée ici).
const revue = [];
{
  const pourIADAvant = (snap) => {
    const { engineVersion, baseDuCalcul, ...resume } = snap;
    if (resume.staking && typeof resume.staking === 'object' && 'regleDeMise' in resume.staking) {
      const { regleDeMise, ...staking } = resume.staking;
      return { ...resume, staking };
    }
    return resume;
  };
  const ligneDe = (texte) => texte.split('\n').find((l) => l.startsWith('Mise (staking) : ')) ?? null;
  const partAncienne = (texte) => /"partDuCapital":([0-9.e-]+|null)/.exec(texte)?.[1] ?? 'absente';
  for (const club of CLUBS) {
    const brut = SORTES.williamhill(club);
    const enrichi = await enrichMatchWithRealAverages(brut, { sansRepliPayant: true });
    for (const [nom, ctx] of Object.entries(contextes(enrichi)).filter(([n]) => n !== 'sansCapital')) {
      const { ia } = await automatique(brut, { lire: () => ctx });
      const page = await pageDuMatch(enrichi, ctx);
      // La page relancée en analyse IA (un clic) : sa décision porte la règle, sans part notée.
      const parLaPage = { ...page, staking: page.staking ? { ...page.staking } : page.staking };
      for (const [origine, resultat] of Object.entries({ automatique: ia, page: parLaPage })) {
        if (resultat.staking?.action !== 'RECOMMENDED') continue;
        const snap = avecLaVersion(curateEngineSummary(resultat), resultat);
        const ligne = {};
        for (const fiche of ['compacte', 'ancienne']) {
          const d = await service.preparerAnalyseAvantMatch({ matchId: `essai-revue-${fiche}`, home: enrichi.home, away: enrichi.away, league: enrichi.league, engineResult: resultat, sansRepliPayant: true, fiche });
          const prior = { matchId: `essai-revue-${fiche}`, homeName: enrichi.home, awayName: enrichi.away, league: enrichi.league, commenceTime: brut.commenceTime, timing: 'avance', analysedAt: '2026-10-05T12:00:00.000Z', analysis: { summary: 'essai', marketOpinions: [] }, engineSnapshot: snap };
          const r = service.preparerRevueApresMatch({ prior, result: { homeGoals: 1, awayGoals: 0, homeName: enrichi.home, awayName: enrichi.away, date: '2026-10-06' }, fiche });
          ligne[fiche] = fiche === 'compacte' ? { avant: ligneDe(d.userMessage), revue: ligneDe(r.userMessage) } : { avant: partAncienne(d.userMessage), revue: partAncienne(r.userMessage), eurosRevue: /"stake":[0-9]|misePlafonnee|€/.test(r.userMessage) };
        }
        revue.push({ nom: `${club.home}|${nom}|${origine}`, fractionPage: page.mise?.fraction ?? null, attendue: `Mise (staking) : RECOMMENDED : ${partDite(page.mise?.fraction)} sur `, ...ligne });
      }
    }
    // Une analyse gardée AVANT A1 : le moteur sans contexte (ni règle, ni part notée), la base interne.
    const avant = await analyzeMatch(enrichi, enService, tilt, sport, { maintenant: T0 });
    const snap = avecLaVersion(curateEngineSummary(avant), avant);
    revue.push({ nom: `${club.home}|avant-A1`, avantA1: true, action: avant.staking?.action ?? null, memeResume: JSON.stringify(pourIA(snap)) === JSON.stringify(pourIADAvant(snap)) });
  }
}

// Passe 4 (N1) : l'analyse IA DEMANDÉE PAR UN CLIC — la réponse de la page en JSON (comme l'écran l'envoie), l'avant-match puis
// la revue, sous les deux formes ; le résumé gardé (son `staking` : ce que l'écran de la revue relit, miseDeLaRevue).
const demande = [];
{
  const ligneDe = (texte) => texte.split('\n').find((l) => l.startsWith('Mise (staking) : ')) ?? null;
  const champAncien = (texte, champ) => new RegExp(`"${champ}":("[^"]*"|[0-9.e-]+|null)`).exec(texte)?.[1] ?? 'absent';
  for (const p of pagesDemandees) {
    const resultat = JSON.parse(p.json);
    const sortie = { nom: p.nom, attendues: p.attendues, action: resultat.staking?.action ?? null, fractionPage: resultat.mise?.fraction ?? null, regleF: resultat.staking?.regleDeMise?.f ?? null, nonCalculee: resultat.mise?.nonCalculee ?? null, regleDansLaPage: 'regleDeMise' in (resultat.staking ?? {}) };
    for (const fiche of ['compacte', 'ancienne']) {
      const d = await service.preparerAnalyseAvantMatch({ matchId: `essai-demande-${fiche}`, home: p.home, away: p.away, league: p.league, engineResult: resultat, sansRepliPayant: true, fiche });
      const snap = avecLaVersion(d.engineSummary, resultat);
      const prior = { matchId: `essai-demande-${fiche}`, homeName: p.home, awayName: p.away, league: p.league, commenceTime: p.commenceTime, timing: 'avance', analysedAt: '2026-10-05T12:00:00.000Z', analysis: { summary: 'essai', marketOpinions: [] }, engineSnapshot: snap };
      const r = service.preparerRevueApresMatch({ prior, result: { homeGoals: 1, awayGoals: 0, homeName: p.home, awayName: p.away, date: '2026-10-06' }, fiche });
      const tout = `${d.userMessage}\n${r.userMessage}`;
      sortie[fiche] =
        fiche === 'compacte'
          ? { avant: ligneDe(d.userMessage), revue: ligneDe(r.userMessage), stakingGarde: snap.staking ?? null }
          : { avant: champAncien(d.userMessage, 'partDuCapital'), revue: champAncien(r.userMessage, 'partDuCapital'), nonLueAvant: champAncien(d.userMessage, 'miseNonLue'), nonLueRevue: champAncien(r.userMessage, 'miseNonLue'), regle: /regleDeMise|fKelly/.test(tout), euros: /"stake":[0-9]|misePlafonnee|€/.test(tout) };
    }
    demande.push(sortie);
  }
}

database.close?.();
console.log(JSON.stringify({ ok: true, cas, plafondHorsRegle, lectures, chemins, revue, demande }));
process.exit(0);
