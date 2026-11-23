/**
 * Script d'essai — ce n'est PAS un fichier de test (cf. intitulesFotmob.test.mjs) :
 *   node --import garde.mjs script-intitules-fotmob.mjs <serveur de la copie>
 *
 * Lot « compo-ko », partie « intitulés renommés » (21/11/2026). FotMob publie la première division turque sous
 * « TUR|Süper Lig » depuis le 08/11/2026 au soir (« TUR|Super Lig » avant, même dans les listes des journées passées) ;
 * la table des compétitions (FOTMOB_LEAGUES, fotMobProvider.js, gelée) dit « TUR|Super Lig ». Le calendrier et les
 * résultats (refreshCalendarFromFotMob) ne reconnaissaient plus rien de turc.
 *
 * Une VRAIE passe du calendrier, dans la copie (scripts de fusion recopiés, FotMob simulé, heure figée au 21/11 à
 * 14 h UTC), période du 14 au 22/11 :
 *   r0 — à blanc ; r1 — pour de bon ; r2 — la même, aussitôt après (le rattrapage est fait : plus relu).
 * Listes simulées : le 08/11, Beşiktaş – Gençlerbirliği (3-0, resté « à venir » au calendrier) et Rizespor –
 * Erzurumspor (2-1, déjà connu) en « TUR|Süper Lig », un match de « TUR|1. Lig » et Arsenal – Chelsea (EPL) ; le 15/11,
 * Brentford – Fulham (EPL, 2-0) ; le 20/11, Vélez Sarsfield – Belgrano (2-2) en « ARG|Liga Profesional - Clausura - 8th
 * Finals » ; le 21/11, Gençlerbirliği – Gaziantep FK (1-0) et Kocaelispor – Fenerbahçe (à venir) en « TUR|Süper Lig »,
 * Liverpool – Everton (EPL, à venir), Defensa y Justicia – Barracas Central (huitièmes argentins, à venir) ; le 22/11,
 * Konyaspor – Beşiktaş (à venir) et la finale de la deuxième division mexicaine (« MEX|Liga de Expansión MX - Apertura -
 * Final », non suivie) ; les autres jours, un seul match de « TUR|1. Lig » (non suivie : une vraie journée n'est
 * jamais vide).
 *
 * Variable CM_ESSAI_INTITULES (relecture n° 2 du lot, constats M1, M2, M6) : « base » (défaut) ; « echec » — la liste
 * du 08/11 (journée rattrapée) répond 404 ; « vide » — celle du 10/11 revient sans aucun match ; « fusion » — le
 * calendrier de départ est illisible (la fusion du calendrier refuse d'écrire). Dans les trois, le rattrapage n'est
 * PAS noté fait : r2 le refait.
 *
 * Sur l'ancien code (sans le lot), rien de turc n'entre : c'est ainsi que le lot a été vu échouer d'abord.
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur, recopierScripts } from './claudeSimule.mjs';
import { installerFauxFetch } from './fotmobSimule.mjs';

const serveur = process.argv[2];
const imp = importeur(serveur);
recopierScripts(serveur, ['merge-season-calendar.mjs', 'merge-daily-results.mjs', 'merge-match-stats.mjs']);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const lire = (nom) => JSON.parse(fs.readFileSync(path.join(RUNTIME, nom), 'utf8'));

// Le calendrier et les résultats de départ, tels que le 21/11 les avait : Beşiktaş – Gençlerbirliği resté « à venir ».
// Les identifiants sont ceux que dérivent les scripts de fusion (même fonction que nameIdentity.slug).
const { slug } = await imp('utils/nameIdentity.js');
const entree = (date, league, homeName, awayName, status, homeGoals = null, awayGoals = null) => ({
  id: `essai-${date}-${slug(homeName)}`,
  matchId: `cal-${date}-${slug(homeName)}-${slug(awayName)}`,
  date,
  league,
  homeName,
  awayName,
  status,
  homeGoals,
  awayGoals,
  round: null,
  source: 'fotmob',
  updatedAt: '2026-11-08T18:52:51.190Z'
});
const resultat = (date, league, homeName, awayName, homeGoals, awayGoals) => ({
  id: `essai-r-${date}-${slug(homeName)}`,
  matchId: `web-${date}-${slug(homeName)}-${slug(awayName)}`,
  homeName,
  awayName,
  league,
  homeGoals,
  awayGoals,
  homeScore: homeGoals,
  awayScore: awayGoals,
  settledAt: '2026-11-08T18:52:57.199Z',
  source: 'fotmob'
});
fs.mkdirSync(RUNTIME, { recursive: true });
fs.writeFileSync(path.join(RUNTIME, 'season-calendar.json'), JSON.stringify([
  entree('2026-11-08', 'Turkey Super League', 'Rizespor', 'Erzurumspor FK', 'finished', 2, 1),
  entree('2026-11-08', 'Turkey Super League', 'Beşiktaş', 'Gençlerbirliği', 'scheduled'),
  entree('2026-11-08', 'EPL', 'Arsenal', 'Chelsea', 'finished', 1, 1),
  entree('2026-11-21', 'Turkey Super League', 'Gençlerbirliği', 'Gaziantep FK', 'scheduled'),
  entree('2026-11-21', 'Turkey Super League', 'Kocaelispor', 'Fenerbahçe', 'scheduled')
], null, 1));
fs.writeFileSync(path.join(RUNTIME, 'match-results.json'), JSON.stringify([
  resultat('2026-11-08', 'Turkey Super League', 'Rizespor', 'Erzurumspor FK', 2, 1),
  resultat('2026-11-08', 'EPL', 'Arsenal', 'Chelsea', 1, 1)
], null, 1));

const SUPER_LIG = ['TUR', 'Süper Lig', 1000001862, 71];
const PREMIERE_LIG = ['TUR', '1. Lig', 1000001750, 165];
const EPL = ['ENG', 'Premier League', 47, 47];
const HUITIEMES_ARGENTINS = ['ARG', 'Liga Profesional - Clausura - 8th Finals', 1000001730, 112];
const FINALE_EXPANSION_MX = ['MEX', 'Liga de Expansión MX - Apertura - Final', 1000001842, 8976];
let numero = 5_904_700;
const match = (home, away, utcTime, score = null) => {
  numero += 1;
  const fini = Boolean(score);
  return {
    id: numero,
    home: { id: numero * 10 + 1, name: home },
    away: { id: numero * 10 + 2, name: away },
    status: { utcTime, started: fini, finished: fini, cancelled: false, ...(score ? { scoreStr: score } : {}) }
  };
};
const ligue = ([ccode, name, id, primaryId], matches) => ({ ccode, name, id, primaryId, matches });

const listes = {};
for (let t = Date.parse('2026-11-08T12:00:00Z'); t <= Date.parse('2026-11-22T12:00:00Z'); t += 86_400_000) {
  const jour = new Date(t).toISOString().slice(0, 10);
  listes[jour.replace(/-/g, '')] = { leagues: [ligue(PREMIERE_LIG, [match('Altay', 'Adanaspor', `${jour}T11:00:00.000Z`, '0 - 0')])] };
}
listes['20261108'] = {
  leagues: [
    ligue(SUPER_LIG, [match('Rizespor', 'Erzurumspor FK', '2026-11-08T10:30:00.000Z', '2 - 1'), match('Beşiktaş', 'Gençlerbirliği', '2026-11-08T18:00:00.000Z', '3 - 0')]),
    ligue(PREMIERE_LIG, [match('Bandırmaspor', 'Sakaryaspor', '2026-11-08T11:00:00.000Z', '1 - 1')]),
    ligue(EPL, [match('Arsenal', 'Chelsea', '2026-11-08T16:30:00.000Z', '1 - 1')])
  ]
};
listes['20261115'] = { leagues: [ligue(EPL, [match('Brentford', 'Fulham', '2026-11-15T15:00:00.000Z', '2 - 0')])] };
listes['20261120'] = { leagues: [ligue(HUITIEMES_ARGENTINS, [match('Vélez Sarsfield', 'Belgrano', '2026-11-20T23:00:00.000Z', '2 - 2')])] };
listes['20261121'] = {
  leagues: [
    ligue(SUPER_LIG, [match('Gençlerbirliği', 'Gaziantep FK', '2026-11-21T10:30:00.000Z', '1 - 0'), match('Kocaelispor', 'Fenerbahçe', '2026-11-21T16:00:00.000Z')]),
    ligue(EPL, [match('Liverpool', 'Everton', '2026-11-21T15:00:00.000Z')]),
    ligue(HUITIEMES_ARGENTINS, [match('Defensa y Justicia', 'Barracas Central', '2026-11-21T20:00:00.000Z')])
  ]
};
listes['20261122'] = {
  leagues: [
    ligue(SUPER_LIG, [match('Konyaspor', 'Beşiktaş', '2026-11-22T13:00:00.000Z')]),
    ligue(FINALE_EXPANSION_MX, [match('Atlético Morelia', 'Atlético La Paz', '2026-11-22T02:00:00.000Z')])
  ]
};
const SCENARIO = process.env.CM_ESSAI_INTITULES || 'base';
if (!['base', 'echec', 'vide', 'fusion'].includes(SCENARIO)) throw new Error(`CM_ESSAI_INTITULES inconnu : ${SCENARIO}`);
if (SCENARIO === 'echec') delete listes['20261108'];
if (SCENARIO === 'vide') listes['20261110'] = { leagues: [] };
if (SCENARIO === 'fusion') fs.writeFileSync(path.join(RUNTIME, 'season-calendar.json'), '{ pas du JSON');
const faux = installerFauxFetch({ listes });

const resume = (r) => r && {
  from: r.from,
  to: r.to,
  days: r.days,
  failures: r.failures,
  failedDates: r.failedDates,
  matches: r.matches,
  byLeague: r.byLeague,
  rattrapage: r.rattrapage === undefined ? 'absent' : r.rattrapage,
  mergeError: r.mergeError ? String(r.mergeError).slice(0, 400) : null,
  resultsError: r.resultsError ? String(r.resultsError).slice(0, 400) : null,
  results: r.results ? { created: r.results.created ?? null, updated: r.results.updated ?? null, conflicts: r.results.conflicts ?? null } : null
};
const lisible = (nom) => {
  try {
    lire(nom);
    return true;
  } catch {
    return false;
  }
};
const turcsEtAnglais = () => !lisible('season-calendar.json') ? 'illisible' : lire('season-calendar.json')
  .filter((e) => /Turkey|EPL|Argentina|Liga MX/.test(e.league) || /Bandırmaspor|Morelia/.test(e.homeName))
  .map((e) => `${e.date} ${e.league} ${e.homeName} – ${e.awayName} ${e.status} ${e.homeGoals ?? ''}-${e.awayGoals ?? ''}`)
  .sort();
const resultats = () => lire('match-results.json')
  .map((x) => `${x.matchId} ${x.league} ${x.homeGoals}-${x.awayGoals}`)
  .sort();

const { refreshCalendarFromFotMob } = await imp('data/providers/fotMobCalendar.js');
const periode = { from: '2026-11-14', to: '2026-11-22', concurrency: 2 };
const out = { ok: true, scenario: SCENARIO };
out.r0 = resume(await refreshCalendarFromFotMob({ ...periode, dryRun: true }));
out.calendrierApresR0 = turcsEtAnglais();
out.r1 = resume(await refreshCalendarFromFotMob(periode));
out.calendrierApresR1 = turcsEtAnglais();
out.resultatsApresR1 = resultats();
out.r2 = resume(await refreshCalendarFromFotMob(periode));
out.listesDemandees = [...new Set(faux.appels.map((u) => u.match(/date=(\d{8})/)?.[1]).filter(Boolean))].sort();
console.log(JSON.stringify(out));
