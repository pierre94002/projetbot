/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-compo-coup-d-envoi.mjs <serveur de la copie>
 *
 * Lot « compo-ko » (21/11/2026) — L'ANALYSE D'AVANT COUP D'ENVOI D'UN MATCH COTÉ LIT LA COMPOSITION DE CE MATCH, ET
 * N'APPELLE JAMAIS CLAUDE POUR UN MATCH DÉJÀ COMMENCÉ :
 *   A. idFotmobDUnMatchCote seule (le club du magasin injecté) : par les identifiants des deux clubs, coup d'envoi à 6 h
 *      près, un seul candidat ; un seul club connu : vu une fois dans les 6 h, à sa place, dans la compétition du match
 *      coté et à 30 min près ; tout le reste rend null (jamais le rapprocheur souple) ;
 *   B. encoreAvantLeCoupDEnvoi : plus de 3 min avant le coup d'envoi, sinon non ;
 *   C1. la vraie passe d'avant coup d'envoi (runKickoffPreMatchAnalyses), un match coté dont l'équipe qui se déplace
 *       s'écrit autrement chez The Odds API (« Brighton and Hove Albion ») et chez FotMob (« Brighton & Hove Albion ») —
 *       le cas d'Orenburg – Baltika du 21/11/2026 : la composition PUBLIÉE de ce match (son identifiant FotMob) est celle
 *       que Claude lit et que l'analyse garde, pas la dernière composition alignée ;
 *   C3. le même écart d'écriture (« Bournemouth » / « AFC Bournemouth »), FotMob n'ayant publié que les absents du match :
 *       l'analyse (sans onze publié, à 20 min) lit la dernière composition alignée AVEC les absents annoncés pour ce match ;
 *   C2. deux matchs cotés dans la même passe, la pendule avance de 30 min pendant le premier appel à Claude (un PC qui
 *       s'endort au milieu d'une passe, des analyses qui s'enchaînent) : le second, commencé entre-temps, n'est pas
 *       analysé (bilan.tropTard), aucun appel à Claude pour lui, et sa page FotMob n'est même pas lue ;
 *   C4. la pendule avance de 30 min PENDANT la lecture de la composition d'un match : ni moteur ni Claude après ;
 *   C5. un seul des deux clubs connu de l'annuaire (« Hotspur Londres » inconnu, Manchester United connu) : la composition
 *       publiée lue par le club connu, à sa place (Laval – Montpellier, Amed – Rizespor, 21/11/2026) ;
 *   C6. la pendule avance de 30 min pendant les lectures FotMob de l'analyse elle-même (actualités, composition de repli),
 *       APRÈS le moteur : la dernière revue, juste avant l'appel à Claude, l'arrête — rien d'appelé ni d'enregistré.
 * Chaque passe compte aussi les gels des pronostics mis en file (enregistreurs allumés dans la copie, rien n'est écrit) :
 * un gel par match analysé à l'heure, aucun pour un match laissé avant le moteur.
 * Sur l'ancien code (sans le lot), A et B rendent « absente » et C se lit tel quel : c'est ainsi que le lot a été vu
 * rouge avant d'être vert. Claude SIMULÉ, FotMob SIMULÉ, cotes FABRIQUÉES (aucune donnée réelle). Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { installerClaudeSimule, importeur, pageComposition, onzeFictif, usageSimule, coutSimule } from './claudeSimule.mjs';
import { rencontre, listeDuJour, installerFauxFetch, pageAVenir } from './fotmobSimule.mjs';

const [serveur] = process.argv.slice(2);
const imp = importeur(serveur);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const ecrire = (nom, contenu) => fs.writeFileSync(path.join(RUNTIME, nom), JSON.stringify(contenu, null, 1));
const dansLaCopie = (f) => path.resolve(f).toLowerCase().startsWith(path.resolve(serveur).toLowerCase());

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const { getFixturePaths } = await imp('data/repositories/fixturesRepository.js');
const { clubDuMagasin } = await imp('data/db/oddsProfileRead.js');
const auto = await imp('core/ai/autoMatchAiTrigger.js');
const { getByMatchId } = await imp('data/repositories/matchAiAnalysisRepository.js');
const { env } = await imp('config/env.js');
const { lignesEnAttente, __viderLaFileSansEcrire } = await imp('data/enregistreurs/file.js');

// La pendule : figée par garde.mjs (CM_TEST_MAINTENANT), avancée ici à la main (C2). `new Date()` reste à T0.
const T0 = Date.now();
let maintenant = T0;
Date.now = () => maintenant;
const MIN = 60_000;
const H = 60 * MIN;
const iso = (ms) => new Date(ms).toISOString();

const s = {};

// ------------------------------------------------------------- A. idFotmobDUnMatchCote seule
if (typeof auto.idFotmobDUnMatchCote === 'function') {
  const BASE_FACTICE = { baseFactice: true };
  const IDS = { 'FC Orenburg': 'fotmob-1', 'Baltika Kaliningrad': 'fotmob-2', Orenburg: 'fotmob-1', Baltika: 'fotmob-2' };
  let vus = [];
  const club = (nom, league, db) => {
    vus.push({ nom, league, base: db === BASE_FACTICE });
    return IDS[nom] ?? null;
  };
  const cote = { home: 'FC Orenburg', away: 'Baltika Kaliningrad', league: 'Premier League - Russia' };
  const coup = T0 + 40 * MIN;
  const f = (matchId, homeId, awayId, decalage = 0, leagueKey = 'RUS|Premier League') => ({ matchId, homeName: 'Orenburg', awayName: 'Baltika', homeId, awayId, kickoff: iso(coup + decalage), leagueKey });
  const id = (m, liste, { k = coup, options = { club } } = {}) => auto.idFotmobDUnMatchCote(m, k, liste, BASE_FACTICE, options);
  const LE_BON = f('4800001', 'fotmob-1', 'fotmob-2');
  vus = [];
  const baltika = id(cote, [LE_BON]);
  const lectures = vus.slice();
  s.A = {
    baltika,
    lectures,
    parmiDautres: id(cote, [f('4800009', 'fotmob-7', 'fotmob-8'), f('4800008', 'fotmob-1', 'fotmob-9'), LE_BON]),
    identifiantNumerique: id(cote, [{ ...LE_BON, matchId: 4800001 }]),
    // Un seul club connu de l'annuaire (« Stade Lavallois » / « Laval », « Amed SK » / « Amed Sportif ») : ce club à SA
    // place, vu une seule fois dans la fenêtre.
    exterieurInconnu: id({ ...cote, away: 'Inconnu FC' }, [LE_BON]),
    domicileInconnu: id({ ...cote, home: 'Inconnu FC' }, [LE_BON]),
    unConnuParmiDautres: id({ ...cote, away: 'Inconnu FC' }, [f('4800009', 'fotmob-7', 'fotmob-8'), LE_BON]),
    unConnuVuHorsDeLaFenetre: id({ ...cote, away: 'Inconnu FC' }, [LE_BON, f('4800005', 'fotmob-6', 'fotmob-1', 20 * H)]),
    unConnuVuDeuxFois: id({ ...cote, away: 'Inconnu FC' }, [LE_BON, f('4800003', 'fotmob-5', 'fotmob-1', 2 * H)]),
    unConnuDeLAutreCote: id({ ...cote, away: 'Inconnu FC' }, [f('4800001', 'fotmob-2', 'fotmob-1')]),
    unConnuAuDelaDeSixHeures: id({ ...cote, away: 'Inconnu FC' }, [f('4800001', 'fotmob-1', 'fotmob-2', 6 * H + MIN)]),
    unConnuEtUnVide: id(cote, [LE_BON], { options: { club: (nom) => (nom === 'FC Orenburg' ? 'fotmob-1' : '') } }),
    // … dans la compétition du match coté (relecture du 21/11 : un homonyme d'une autre compétition, « Everton » du Chili lu
    // comme celui de l'EPL) et à 30 min près ; l'unicité reste comptée sur 6 h.
    unConnuAutreCompetition: id({ ...cote, away: 'Inconnu FC' }, [f('4800001', 'fotmob-1', 'fotmob-2', 0, 'ENG|Premier League')]),
    unConnuCompetitionFeminine: id({ ...cote, away: 'Inconnu FC' }, [f('4800001', 'fotmob-1', 'fotmob-2', 0, 'RUS|Premier League Women')]),
    unConnuSansCompetition: id({ ...cote, away: 'Inconnu FC' }, [f('4800001', 'fotmob-1', 'fotmob-2', 0, null)]),
    unConnuCompetitionHorsTable: id({ ...cote, league: 'Primera División - Chile', away: 'Inconnu FC' }, [LE_BON]),
    unConnuATrenteMinutes: id({ ...cote, away: 'Inconnu FC' }, [f('4800001', 'fotmob-1', 'fotmob-2', 30 * MIN)]),
    unConnuATrenteEtUneMinutes: id({ ...cote, away: 'Inconnu FC' }, [f('4800001', 'fotmob-1', 'fotmob-2', 31 * MIN)]),
    unConnuATroisHeuresEtDemie: id({ ...cote, away: 'Inconnu FC' }, [f('4800001', 'fotmob-1', 'fotmob-2', 3.5 * H)]),
    // Un même match lu deux fois (les listes de deux jours se recouvrent) ne compte qu'une fois.
    unConnuLeMemeMatchDeuxFois: id({ ...cote, away: 'Inconnu FC' }, [LE_BON, { ...LE_BON }]),
    // Un intitulé renommé chez FotMob (« TUR|Süper Lig » au lieu de « TUR|Super Lig » depuis le 08/11/2026, Amed SK –
    // Çaykur Rizespor) est encore la compétition du match coté ; la deuxième division turque, non.
    unConnuIntituleRenomme: id({ ...cote, league: 'Turkey Super League', away: 'Inconnu FC' }, [f('4800001', 'fotmob-1', 'fotmob-2', 0, 'TUR|Süper Lig')]),
    unConnuIntituleDeLaTable: id({ ...cote, league: 'Turkey Super League', away: 'Inconnu FC' }, [f('4800001', 'fotmob-1', 'fotmob-2', 0, 'TUR|Super Lig')]),
    unConnuDivisionInferieureTurque: id({ ...cote, league: 'Turkey Super League', away: 'Inconnu FC' }, [f('4800001', 'fotmob-1', 'fotmob-2', 0, 'TUR|1. Lig')]),
    deuxConnusLeMemeMatchDeuxFois: id(cote, [LE_BON, { ...LE_BON, matchId: 4800001 }]),
    // Deux clubs connus : leurs deux identifiants suffisent, la compétition n'est pas exigée.
    deuxConnusAutreCompetition: id(cote, [f('4800001', 'fotmob-1', 'fotmob-2', 0, 'ENG|Premier League')]),
    deuxConnusSansCompetition: id(cote, [f('4800001', 'fotmob-1', 'fotmob-2', 0, null)]),
    // Deux clubs connus qui ne concordent pas avec FotMob : rien n'est deviné (pas de repli sur un seul club).
    deuxConnusQuiNeConcordentPas: id(cote, [f('4800001', 'fotmob-1', 'fotmob-9')]),
    aucunConnu: id({ ...cote, home: 'Inconnu A', away: 'Inconnu B' }, [LE_BON]),
    sixHeuresApres: id(cote, [f('4800001', 'fotmob-1', 'fotmob-2', 6 * H)]),
    sixHeuresAvant: id(cote, [f('4800001', 'fotmob-1', 'fotmob-2', -6 * H)]),
    sixHeuresEtUneMinute: id(cote, [f('4800001', 'fotmob-1', 'fotmob-2', 6 * H + MIN)]),
    deuxCandidats: id(cote, [LE_BON, f('4800002', 'fotmob-1', 'fotmob-2', 30 * MIN)]),
    domicileExterieurInverses: id(cote, [f('4800001', 'fotmob-2', 'fotmob-1')]),
    clubQuiLeve: id(cote, [LE_BON], { options: { club: () => { throw new Error('annuaire illisible'); } } }),
    memeClubDesDeuxCotes: id(cote, [f('4800001', 'fotmob-1', 'fotmob-1')], { options: { club: () => 'fotmob-1' } }),
    coupIllisible: id(cote, [LE_BON], { k: Number.NaN }),
    listeAbsente: id(cote, null),
    listeQuiNestPasUneListe: id(cote, { 0: LE_BON }),
    candidatSansIdentifiant: id(cote, [{ ...LE_BON, matchId: null }]),
    candidatSansHeure: id(cote, [{ ...LE_BON, kickoff: null }]),
    candidatsVides: id(cote, [null, undefined, LE_BON]),
    matchAbsent: id(null, [LE_BON]),
    // Le rapprocheur souple jamais : des noms identiques ne suffisent pas sans identifiants de clubs.
    nomsIdentiquesSansIds: id(cote, [{ ...LE_BON, homeName: 'FC Orenburg', awayName: 'Baltika Kaliningrad', homeId: null, awayId: null }])
  };
} else {
  s.A = 'absente';
}

// ------------------------------------------------------------- B. encoreAvantLeCoupDEnvoi
const encore = auto.__testing?.encoreAvantLeCoupDEnvoi;
s.B = typeof encore === 'function'
  ? {
      dixMinutes: encore(T0 + 10 * MIN, T0),
      troisMinutesEtUneMs: encore(T0 + 3 * MIN + 1, T0),
      troisMinutes: encore(T0 + 3 * MIN, T0),
      uneMinute: encore(T0 + MIN, T0),
      coupDEnvoiMaintenant: encore(T0, T0),
      joueDepuisNeufHeures: encore(T0 - 9 * H, T0),
      coupIllisible: encore(Number.NaN, T0),
      maintenantIllisible: encore(T0 + 10 * MIN, Number.NaN),
      coupAbsent: encore(undefined, T0)
    }
  : 'absente';

// ------------------------------------------------------------- C. la vraie passe d'avant coup d'envoi
// Les gels des pronostics (gelerEnService) : allumés dans CETTE copie le temps des passes, mis en file seulement — la file
// est vidée sans rien écrire à la fin. Aucune boucle ne démarre (server.js n'est pas lancé).
env.matchStatsRefresh.enabled = true;
env.enregistreurs.enabled = true;
const gelsEnFile = () => lignesEnAttente('gel').length;
ecrire('budget-claude.json', { tokensParJour: 1_000_000, tokensParSemaine: 5_000_000, mode: 'auto', enregistreLe: iso(T0 - 4 * H) });
ecrire('season-calendar.json', []);
const instantane = getFixturePaths().odds;
if (!dansLaCopie(instantane)) throw new Error('instantané des cotes hors de la copie');
fs.mkdirSync(path.dirname(instantane), { recursive: true });
const h2h = (home, away) => ({ key: 'h2h', outcomes: [{ name: home, price: 2.1 }, { name: away, price: 3.5 }, { name: 'Draw', price: 3.4 }] });
const coteOdds = (id, home, away, ko) => ({
  id,
  sport_key: 'soccer_epl',
  sport_title: 'EPL',
  commence_time: ko,
  home_team: home,
  away_team: away,
  bookmakers: [{ key: 'pinnacle', title: 'Pinnacle', last_update: iso(T0 - 10 * MIN), markets: [h2h(home, away)] }]
});
const ecrireCotes = (liste) => fs.writeFileSync(instantane, JSON.stringify([{ data: liste }]));

const BRENTFORD = clubDuMagasin('Brentford', 'EPL', database);
const BRIGHTON = clubDuMagasin('Brighton & Hove Albion', 'EPL', database);
const numero = (teamId) => Number(String(teamId ?? '').replace('fotmob-', ''));
const COUP_C1 = iso(T0 + 20 * MIN);
const FOTMOB_C1 = 4900501;
const PUBLIE_DOM = onzeFictif(7100, 'PublieDom');
const PUBLIE_EXT = onzeFictif(7200, 'PublieExt');
const jour = iso(T0).slice(0, 10).replace(/-/g, '');
const veille = iso(T0 - 24 * H).slice(0, 10).replace(/-/g, '');
const lendemain = iso(T0 + 24 * H).slice(0, 10).replace(/-/g, '');
// C3, C2 et C4 (plus bas). La liste du jour est gardée par fotMobProvider.js (partage, durée de vie) : toutes les
// rencontres y sont dès le départ.
const FULHAM = clubDuMagasin('Fulham', 'EPL', database);
const BOURNEMOUTH = clubDuMagasin('AFC Bournemouth', 'EPL', database);
const COUP_C3 = iso(T0 + 20 * MIN);
const FOTMOB_C3 = 4900503;
const LIVERPOOL = clubDuMagasin('Liverpool', 'EPL', database);
const EVERTON = clubDuMagasin('Everton', 'EPL', database);
const COUP_C2B = iso(T0 + 27 * MIN);
const FOTMOB_C2B = 4900502;
const VILLA = clubDuMagasin('Aston Villa', 'EPL', database);
const NEWCASTLE = clubDuMagasin('Newcastle United', 'EPL', database);
const COUP_C4 = iso(T0 + 20 * MIN);
const FOTMOB_C4 = 4900504;
const TOTTENHAM = clubDuMagasin('Tottenham Hotspur', 'EPL', database);
const MANUTD = clubDuMagasin('Manchester United', 'EPL', database);
const COUP_C5 = iso(T0 + 20 * MIN);
const FOTMOB_C5 = 4900505;
const MANCITY = clubDuMagasin('Man City', 'EPL', database);
const COUP_C6 = iso(T0 + 20 * MIN);
const FOTMOB_C6 = 4900506;
const faux = installerFauxFetch({
  listes: {
    [veille]: listeDuJour([]),
    [jour]: listeDuJour([
      rencontre({ id: FOTMOB_C1, home: ['Brentford', numero(BRENTFORD)], away: ['Brighton & Hove Albion', numero(BRIGHTON)], coup: COUP_C1 }),
      rencontre({ id: FOTMOB_C3, home: ['Fulham', numero(FULHAM)], away: ['AFC Bournemouth', numero(BOURNEMOUTH)], coup: COUP_C3 }),
      rencontre({ id: FOTMOB_C2B, home: ['Liverpool', numero(LIVERPOOL)], away: ['Everton', numero(EVERTON)], coup: COUP_C2B }),
      rencontre({ id: FOTMOB_C4, home: ['Aston Villa', numero(VILLA)], away: ['Newcastle United', numero(NEWCASTLE)], coup: COUP_C4 }),
      rencontre({ id: FOTMOB_C5, home: ['Tottenham Hotspur', numero(TOTTENHAM)], away: ['Manchester United', numero(MANUTD)], coup: COUP_C5 }),
      rencontre({ id: FOTMOB_C6, home: ['Manchester City', numero(MANCITY)], away: ['Brentford', numero(BRENTFORD)], coup: COUP_C6 })
    ]),
    [lendemain]: listeDuJour([])
  },
  details: {}
});
faux.details[FOTMOB_C2B] = pageComposition({ home: ['Liverpool', numero(LIVERPOOL)], away: ['Everton', numero(EVERTON)], onzeDom: onzeFictif(7600, 'LiverDom'), onzeExt: onzeFictif(7700, 'EverExt'), coup: COUP_C2B });
faux.details[FOTMOB_C4] = pageComposition({ home: ['Aston Villa', numero(VILLA)], away: ['Newcastle United', numero(NEWCASTLE)], onzeDom: onzeFictif(7400, 'VillaDom'), onzeExt: onzeFictif(7500, 'NewcExt'), coup: COUP_C4 });
// Un regard sur chaque appel au faux FotMob (C4 : la pendule avance pendant la lecture de la page d'un match).
const fetchSimule = globalThis.fetch;
let surUnAppel = null;
globalThis.fetch = async (url, ...reste) => {
  if (surUnAppel) surUnAppel(String(url));
  return fetchSimule(url, ...reste);
};
const pagesLues = (id) => faux.compter(`matchDetails?matchId=${id}`);
faux.details[FOTMOB_C1] = pageComposition({ home: ['Brentford', numero(BRENTFORD)], away: ['Brighton & Hove Albion', numero(BRIGHTON)], onzeDom: PUBLIE_DOM, onzeExt: PUBLIE_EXT, coup: COUP_C1 });

// Le Claude simulé (installerClaudeSimule fait ses contrôles : aucun jeton, aucun exécutable), puis un simulateur qui
// garde aussi le message envoyé : ce que Claude LIT.
const claude = await installerClaudeSimule(serveur, { tokens: () => 20_000 });
const appels = [];
let pendantLAppel = null;
claude.cc.__testing.simulerClaude(async ({ userMessage, appel }) => {
  appels.push({ type: appel?.type ?? null, match: appel?.match ?? null, message: String(userMessage ?? '') });
  if (pendantLAppel) pendantLAppel(appels.length);
  return {
    is_error: false,
    structured_output: { summary: `Analyse simulée n° ${appels.length}.`, keyFactors: [], marketViews: [], marketReviews: [], caveats: 'simulée' },
    usage: usageSimule(20_000),
    total_cost_usd: coutSimule(20_000)
  };
});
const bilanDe = (r) => ({ ok: r.ok, failed: r.failed, candidates: r.candidates, enAttente: r.enAttente, avecCompo: r.avecCompo, tropTard: r.tropTard ?? null, samples: r.samples });
const instantaneDe = (matchId) => {
  const e = getByMatchId(matchId);
  if (!e) return null;
  const xi = (cote) => (e.lineupSnapshot?.[cote]?.startXI ?? []).map((j) => j?.name ?? null);
  const absents = (cote) => (e.lineupSnapshot?.[cote]?.unavailable ?? []).map((a) => a?.name ?? null);
  return {
    timing: e.timing ?? null,
    source: e.lineupSnapshot?.source ?? null,
    fotmobMatchId: e.lineupSnapshot?.fotmobMatchId ?? null,
    dom: xi('home'),
    ext: xi('away'),
    absentsDom: absents('home'),
    absentsExt: absents('away')
  };
};
const nomsLus = (message, onze) => onze.filter(([, nom]) => message.includes(nom)).length;

// C1 : Brentford – « Brighton and Hove Albion » chez The Odds API, « Brighton & Hove Albion » chez FotMob.
ecrireCotes([coteOdds('essai-compo-c1', 'Brentford', 'Brighton and Hove Albion', COUP_C1)]);
const gelsAvantC1 = gelsEnFile();
s.C1 = {
  prealables: { brentford: BRENTFORD, brighton: BRIGHTON, brightonCotes: clubDuMagasin('Brighton and Hove Albion', 'EPL', database) },
  bilan: bilanDe(await auto.runKickoffPreMatchAnalyses({ limit: 150 })),
  analyse: instantaneDe('essai-compo-c1'),
  appels: appels.map((a) => ({ type: a.type, home: a.match?.home ?? null, away: a.match?.away ?? null, domLus: nomsLus(a.message, PUBLIE_DOM), extLus: nomsLus(a.message, PUBLIE_EXT) }))
};
s.C1.gels = gelsEnFile() - gelsAvantC1;

// C3 : Fulham – « Bournemouth » chez The Odds API, « AFC Bournemouth » chez FotMob ; FotMob n'a publié que les ABSENTS de
// ce match, pas encore les onzes. À 20 min du coup d'envoi l'analyse se fait sans composition publiée : la dernière
// composition alignée de chaque équipe, avec les absents annoncés pour CE match (lus par son identifiant FotMob).
const avantC3 = appels.length;
faux.details[FOTMOB_C3] = pageAVenir({
  home: ['Fulham', numero(FULHAM)],
  away: ['AFC Bournemouth', numero(BOURNEMOUTH)],
  absentsDom: [{ id: 7301, nom: 'AbsentDom Un', type: 'injury' }],
  absentsExt: [{ id: 7302, nom: 'AbsentExt Un', type: 'injury' }]
});
ecrireCotes([coteOdds('essai-compo-c3', 'Fulham', 'Bournemouth', COUP_C3)]);
const gelsAvantC3 = gelsEnFile();
s.C3 = {
  prealables: { fulham: FULHAM, bournemouth: BOURNEMOUTH, bournemouthCotes: clubDuMagasin('Bournemouth', 'EPL', database) },
  bilan: bilanDe(await auto.runKickoffPreMatchAnalyses({ limit: 150 })),
  analyse: instantaneDe('essai-compo-c3'),
  appels: appels.slice(avantC3).map((a) => ({ type: a.type, home: a.match?.home ?? null, away: a.match?.away ?? null, absentsLus: ['AbsentDom Un', 'AbsentExt Un'].filter((n) => a.message.includes(n)) }))
};
s.C3.gels = gelsEnFile() - gelsAvantC3;

// C2 : deux matchs cotés (12 et 27 min) ; pendant l'appel du premier, la pendule passe à T0 + 30 min.
const avant = appels.length;
ecrireCotes([coteOdds('essai-compo-c2a', 'Arsenal', 'Chelsea', iso(T0 + 12 * MIN)), coteOdds('essai-compo-c2b', 'Liverpool', 'Everton', COUP_C2B)]);
pendantLAppel = () => {
  maintenant = T0 + 30 * MIN;
};
const gelsAvantC2 = gelsEnFile();
const bilanC2 = bilanDe(await auto.runKickoffPreMatchAnalyses({ limit: 150 }));
pendantLAppel = null;
s.C2 = {
  prealables: { liverpool: LIVERPOOL, everton: EVERTON },
  bilan: bilanC2,
  appels: appels.slice(avant).map((a) => `${a.type}:${a.match?.home ?? '?'}`),
  premier: instantaneDe('essai-compo-c2a')?.timing ?? null,
  second: getByMatchId('essai-compo-c2b') ? 'analysé' : 'non analysé',
  // Le second n'est même plus lu chez FotMob : l'heure est revue avant la composition.
  pagesLuesDuSecond: pagesLues(FOTMOB_C2B),
  gels: gelsEnFile() - gelsAvantC2
};
maintenant = T0;

// C4 : un match coté (20 min) ; la pendule passe à T0 + 30 min PENDANT la lecture de sa page FotMob (la composition) :
// ni moteur ni Claude après — l'heure est revue entre la composition et le moteur.
const avantC4 = appels.length;
ecrireCotes([coteOdds('essai-compo-c4', 'Aston Villa', 'Newcastle United', COUP_C4)]);
surUnAppel = (u) => {
  if (u.includes(`matchDetails?matchId=${FOTMOB_C4}`)) maintenant = T0 + 30 * MIN;
};
const gelsAvantC4 = gelsEnFile();
const bilanC4 = bilanDe(await auto.runKickoffPreMatchAnalyses({ limit: 150 }));
surUnAppel = null;
s.C4 = {
  prealables: { villa: VILLA, newcastle: NEWCASTLE },
  bilan: bilanC4,
  pagesLues: pagesLues(FOTMOB_C4),
  appels: appels.slice(avantC4).length,
  analyse: getByMatchId('essai-compo-c4') ? 'analysé' : 'non analysé',
  gels: gelsEnFile() - gelsAvantC4
};
maintenant = T0;

// C5 : un seul club connu de l'annuaire — « Hotspur Londres » (nom fabriqué, inconnu) chez The Odds API, « Tottenham Hotspur »
// chez FotMob ; Manchester United connu des deux côtés. Le cas de « Stade Lavallois » / « Laval » et d'« Amed SK » / « Amed
// Sportif » (21/11/2026) : la composition publiée lue par le club connu, à sa place.
const avantC5 = appels.length;
faux.details[FOTMOB_C5] = pageComposition({ home: ['Tottenham Hotspur', numero(TOTTENHAM)], away: ['Manchester United', numero(MANUTD)], onzeDom: onzeFictif(7800, 'SpursDom'), onzeExt: onzeFictif(7900, 'UnitedExt'), coup: COUP_C5 });
ecrireCotes([coteOdds('essai-compo-c5', 'Hotspur Londres', 'Manchester United', COUP_C5)]);
const gelsAvantC5 = gelsEnFile();
s.C5 = {
  prealables: { tottenham: TOTTENHAM, manutd: MANUTD, hotspurLondres: clubDuMagasin('Hotspur Londres', 'EPL', database) },
  bilan: bilanDe(await auto.runKickoffPreMatchAnalyses({ limit: 150 })),
  analyse: instantaneDe('essai-compo-c5'),
  appels: appels.slice(avantC5).map((a) => ({ type: a.type, home: a.match?.home ?? null, domLus: nomsLus(a.message, onzeFictif(7800, 'SpursDom')), extLus: nomsLus(a.message, onzeFictif(7900, 'UnitedExt')) }))
};
s.C5.gels = gelsEnFile() - gelsAvantC5;

// C6 : un match coté (20 min), FotMob n'a publié que ses absents (aucun onze) : l'analyse part sans composition publiée.
// La pendule passe à T0 + 30 min à la PREMIÈRE lecture FotMob faite APRÈS le moteur (son gel mis en file) — celles de la
// fiche elle-même (actualités d'équipe, composition de repli). La dernière revue, juste avant l'appel à Claude, l'arrête.
const avantC6 = appels.length;
faux.details[FOTMOB_C6] = pageAVenir({
  home: ['Manchester City', numero(MANCITY)],
  away: ['Brentford', numero(BRENTFORD)],
  absentsDom: [{ id: 7351, nom: 'AbsentCity Un', type: 'injury' }],
  absentsExt: [{ id: 7352, nom: 'AbsentBrent Un', type: 'injury' }]
});
ecrireCotes([coteOdds('essai-compo-c6', 'Man City', 'Brentford', COUP_C6)]);
const gelsAvantC6 = gelsEnFile();
const lectures = [];
let apresLeMoteur = null;
surUnAppel = (u) => {
  lectures.push(u);
  if (apresLeMoteur === null && gelsEnFile() > gelsAvantC6) {
    apresLeMoteur = lectures.length - 1;
    maintenant = T0 + 30 * MIN;
  }
};
const bilanC6 = bilanDe(await auto.runKickoffPreMatchAnalyses({ limit: 150 }));
surUnAppel = null;
const sansHote = (u) => {
  const texte = String(u);
  const debut = texte.indexOf('/', texte.indexOf('//') + 2);
  return (texte.startsWith('http') && debut > 0 ? texte.slice(debut) : texte).slice(0, 80);
};
s.C6 = {
  prealables: { mancity: MANCITY, brentford: BRENTFORD },
  bilan: bilanC6,
  appels: appels.slice(avantC6).length,
  analyse: getByMatchId('essai-compo-c6') ? 'analysé' : 'non analysé',
  gels: gelsEnFile() - gelsAvantC6,
  lecturesAvantLeMoteur: apresLeMoteur === null ? lectures.map(sansHote) : lectures.slice(0, apresLeMoteur).map(sansHote),
  lectureOuLaPenduleAvance: apresLeMoteur === null ? null : sansHote(lectures[apresLeMoteur])
};
maintenant = T0;
__viderLaFileSansEcrire();
claude.arreter();

console.log(JSON.stringify({ ok: true, ...s }));
