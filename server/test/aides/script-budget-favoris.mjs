/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-budget-favoris.mjs <serveur de la copie>
 *
 * Étape 4 — LES FAVORIS (mode économe) :
 *   1. analyse d'avance réservée aux favoris : championnat favori (EPL),
 *      équipe favorite reconnue par son IDENTIFIANT FotMob (« Norwich City »
 *      enregistrée, « Norwich » au calendrier), et l'homonyme qui n'en est
 *      pas un (le « Nacional » du Paraguay quand le favori est celui du
 *      Portugal) ; les favoris passent d'abord ;
 *   2. en mode normal, la même liste : tout est analysé, dans l'ordre d'avant ;
 *   3. coup d'envoi, plafond qui ne laisse qu'une analyse : en économe le
 *      favori passe (même plus loin du coup d'envoi), en normal le plus proche ;
 *   4. revues, une seule permise : en économe le favori, en normal l'ordre d'avant.
 * Claude SIMULÉ, FotMob SIMULÉ. Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { installerClaudeSimule, importeur, pageComposition, onzeFictif } from './claudeSimule.mjs';
import { rencontre, listeDuJour, installerFauxFetch } from './fotmobSimule.mjs';

const [serveur] = process.argv.slice(2);
const imp = importeur(serveur);
const RUNTIME = path.join(serveur, 'data', 'runtime');
// Écrit un fichier de data/runtime SANS passer par le dépôt du serveur, et fait TOUJOURS changer sa date de modification. Certains dépôts
// (matchAiAnalysisRepository.js, seasonCalendarRepository.js…) gardent leur fichier en mémoire et ne le rouvrent que si cette date a
// changé : réécrit juste après la dernière écriture du serveur, le fichier gardait la même date (l'horloge des fichiers ne bat que
// toutes les 15,6 ms sous Windows quand aucune application ne l'a affinée), le dépôt servait l'ancien contenu — « revues : aucun
// candidat », analyses d'avance crues déjà faites — et le test échouait de temps en temps (07/10/2026). Une date qui ne change pas
// est repoussée d'une seconde de plus que celle d'avant.
const ecrire = (nom, contenu) => {
  const fichier = path.join(RUNTIME, nom);
  const avant = fs.existsSync(fichier) ? fs.statSync(fichier).mtimeMs : null;
  fs.writeFileSync(fichier, JSON.stringify(contenu, null, 1));
  if (avant !== null && fs.statSync(fichier).mtimeMs <= avant) {
    const secondes = (avant + 1000) / 1000;
    fs.utimesSync(fichier, secondes, secondes);
  }
};

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const auto = await imp('core/ai/autoMatchAiTrigger.js');
const budget = await imp('core/ai/claudeBudget.js');
const ledger = await imp('data/repositories/claudeUsageLedger.js');
const { clubDuMagasin } = await imp('data/db/oddsProfileRead.js');

const JOUR = '2026-10-05';
const reglage = (mode) => ecrire('budget-claude.json', { tokensParJour: 1_000_000, tokensParSemaine: 5_000_000, mode, enregistreLe: '2026-10-05T08:00:00.000Z' });
const repartir = () => {
  ecrire('match-ai-analyses.json', []);
  fs.rmSync(path.join(RUNTIME, 'journal-claude'), { recursive: true, force: true });
  ledger.__testing.oublier();
};

ecrire('favorites.json', {
  teams: [
    { id: 'fotmob-9850', name: 'Norwich City', league: 'Championship', addedAt: '2026-10-03T18:00:00.000Z' },
    { id: 'fotmob-10214', name: 'Nacional', league: 'Primeira Liga - Portugal', addedAt: '2026-10-03T18:01:00.000Z' }
  ],
  leagues: [{ name: 'EPL', addedAt: '2026-10-03T18:14:00.741Z' }]
});
ecrire('season-calendar.json', [
  // Aujourd'hui — coup d'envoi (heures de FotMob : 12 h 20 et 12 h 40 UTC).
  { league: 'Championship', homeName: 'Birmingham', awayName: 'Sheffield United', date: JOUR },
  { league: 'EPL', homeName: 'Leeds', awayName: 'Newcastle', date: JOUR },
  // Demain — analyses d'avance, dans cet ordre.
  { league: 'Championship', homeName: 'Watford', awayName: 'West Brom', date: '2026-10-06' },
  { league: 'EPL', homeName: 'Everton', awayName: 'Tottenham', date: '2026-10-06' },
  { league: 'División Profesional - Paraguay', homeName: 'Nacional', awayName: 'Olimpia', date: '2026-10-06' },
  { league: 'Championship', homeName: 'Norwich', awayName: 'Wrexham', date: '2026-10-06' },
  { league: 'MLS', homeName: 'DC United', awayName: 'Vancouver Whitecaps', date: '2026-10-06' }
]);
const KN = { id: 4900501, home: ['Birmingham', 8658], away: ['Sheffield United', 8657], coup: '2026-10-05T12:20:00.000Z' };
const KF = { id: 4900502, home: ['Leeds', 8463], away: ['Newcastle', 10261], coup: '2026-10-05T12:40:00.000Z' };
installerFauxFetch({
  listes: {
    20261004: listeDuJour([]),
    20261005: listeDuJour([KN, KF].map((k) => rencontre({ id: k.id, home: k.home, away: k.away, coup: k.coup }))),
    20261006: listeDuJour([]),
    20261007: listeDuJour([])
  },
  details: Object.fromEntries([KN, KF].map((k) => [k.id, pageComposition({ home: k.home, away: k.away, onzeDom: onzeFictif(k.id * 10, 'D'), onzeExt: onzeFictif(k.id * 10 + 50, 'E'), coup: k.coup })]))
});
const claude = await installerClaudeSimule(serveur, { tokens: () => 30_000 });
const appelsDepuis = (n) => claude.appels.slice(n).map((a) => `${a.type}:${a.match?.home}`);
const s = {};

// Ce que l'annuaire strict dit des deux « Nacional » (jamais une ressemblance de nom).
s.nacionalParaguay = clubDuMagasin('Nacional', 'División Profesional - Paraguay', database);
s.nacionalPortugal = clubDuMagasin('Nacional', 'Primeira Liga - Portugal', database);
const fav = budget.lireFavoris();
s.estFavori = {
  everton: budget.estFavori({ home: 'Everton', away: 'Tottenham', league: 'EPL' }, fav, database),
  norwichParIdentifiant: budget.estFavori({ home: 'Norwich', away: 'Wrexham', league: 'Championship' }, fav, database),
  nacionalParaguay: budget.estFavori({ home: 'Nacional', away: 'Olimpia', league: 'División Profesional - Paraguay' }, fav, database),
  nacionalPortugal: budget.estFavori({ home: 'Nacional', away: 'Benfica', league: 'Primeira Liga - Portugal' }, fav, database),
  watford: budget.estFavori({ home: 'Watford', away: 'West Brom', league: 'Championship' }, fav, database)
};

// 1. Analyses d'avance en mode économe : les favoris seulement, et d'abord.
reglage('econome');
let n = claude.appels.length;
const r1 = await auto.runAutoPreMatchAnalyses({ limit: 150 });
s.avanceEconome = { ok: r1.ok, ecartes: r1.ecartes, candidates: r1.candidates, mode: r1.mode, appels: appelsDepuis(n), effets: budget.effetsEconome() };

// 2. La même liste en mode normal : tout, dans l'ordre d'avant.
repartir();
reglage('auto');
n = claude.appels.length;
const r2 = await auto.runAutoPreMatchAnalyses({ limit: 150 });
s.avanceNormal = { ok: r2.ok, ecartes: r2.ecartes, candidates: r2.candidates, mode: r2.mode, appels: appelsDepuis(n) };

// 3. Coup d'envoi, une seule analyse permise : économe → le favori (12 h 40) ; normal → le plus proche (12 h 20).
repartir();
reglage('econome');
n = claude.appels.length;
const r3 = await auto.runKickoffPreMatchAnalyses({ limit: 1 });
s.coupDEnvoiEconome = { ok: r3.ok, candidates: r3.candidates, appels: appelsDepuis(n) };
repartir();
reglage('auto');
n = claude.appels.length;
const r4 = await auto.runKickoffPreMatchAnalyses({ limit: 1 });
s.coupDEnvoiNormal = { ok: r4.ok, candidates: r4.candidates, appels: appelsDepuis(n) };

// 4. Revues, une seule permise : économe → le favori (EPL, joué le 04/10) ; normal → l'ordre des dates (Championship, le 03/10).
const prior = (matchId, homeName, awayName, league, jour) => ({
  matchId,
  homeName,
  awayName,
  league,
  commenceTime: `${jour}T14:00:00.000Z`,
  timing: 'coup-d-envoi',
  analysedAt: `${jour}T13:10:00.000Z`,
  createdAt: `${jour}T13:10:00.000Z`,
  engineSnapshot: { marketPredictions: [] },
  analysis: { summary: 'Analyse d’essai.' }
});
const priors = [prior('essai-rn', 'Birmingham', 'West Brom', 'Championship', '2026-10-03'), prior('essai-rf', 'Fulham', 'Brentford', 'EPL', '2026-10-04')];
const inserer = database.prepare('INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_goals, away_goals) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
inserer.run('essai-fav-rn', 'essai-rn', '2026-10-03', 'Championship', 'Birmingham', 'West Brom', 0, 2);
inserer.run('essai-fav-rf', 'essai-rf', '2026-10-04', 'EPL', 'Fulham', 'Brentford', 1, 0);
repartir();
ecrire('match-ai-analyses.json', priors);
reglage('econome');
n = claude.appels.length;
const r5 = await auto.runAutoPostMatchReviews({ limit: 1 });
s.revuesEconome = { ok: r5.ok, candidates: r5.candidates, appels: appelsDepuis(n) };
repartir();
ecrire('match-ai-analyses.json', priors);
reglage('auto');
n = claude.appels.length;
const r6 = await auto.runAutoPostMatchReviews({ limit: 1 });
s.revuesNormal = { ok: r6.ok, candidates: r6.candidates, appels: appelsDepuis(n) };
// La date d'un fichier écrit une seule fois et jamais réécrit : sous l'aide « date de fichier figée », c'est la date figée (le test le vérifie).
s.dateDeFichier = fs.statSync(path.join(RUNTIME, 'favorites.json')).mtimeMs;

console.log(JSON.stringify({ ok: true, ...s }));
