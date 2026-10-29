/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-correctifs-28-10.mjs <serveur de la copie> <phase>
 *
 * Les correctifs du 28/10/2026 qui lisent une base (la copie de la base d'essai, réseau coupé, heure figée au
 * 05/10/2026 12 h UTC) — ce que le test (test/correctifs28Octobre.test.mjs) ne fait jamais dans son processus :
 *   vent   B, la PREUVE de l'unité : les vitesses de vent de la base d'essai (meta.windSpeed, rangées telles que FotMob
 *          les donne) face à leur description météo — le seuil du suffixe « /Wind » de la source ;
 *   liste  C, la liste des matchs à venir de la nuit des déroulés : un instantané de cotes et un calendrier PLANTÉS dans
 *          la copie, la liste calculée à part (l'enfant) face à celle calculée ici (même instant), le repli quand
 *          l'enfant ne répond pas à temps, l'essai (`aPart` faux), un autre calcul lourd en cours, puis une nuit entière
 *          (le serveur jamais tenu longtemps, vu de dedans et de dehors).
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const { openDb, closeDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const sortie = { ok: true, phase };

if (phase === 'vent') {
  const db = openDb();
  const lignes = db.prepare("SELECT json_extract(meta, '$.weather') AS meteo, json_extract(meta, '$.windSpeed') AS vent FROM matches WHERE json_extract(meta, '$.windSpeed') IS NOT NULL").all();
  const parMeteo = {};
  for (const l of lignes) (parMeteo[l.meteo ?? '?'] ??= []).push(Number(l.vent));
  const resume = (v) => ({ n: v.length, min: Math.min(...v), max: Math.max(...v), moyenne: Math.round((100 * v.reduce((a, x) => a + x, 0)) / v.length) / 100 });
  sortie.vent = {
    rencontres: lignes.length,
    toutes: resume(lignes.map((l) => Number(l.vent))),
    parMeteo: Object.fromEntries(Object.entries(parMeteo).map(([m, v]) => [m, resume(v)]))
  };
  closeDb();
} else if (phase === 'liste') {
  const db = openDb();
  const SN = await imp('data/simulation/simulationNuit.js');
  const G = await imp('data/enregistreurs/gelPronostics.js');
  const { getFixturePaths } = await imp('data/repositories/fixturesRepository.js');
  const { CALENDAR_FILE_PATH } = await imp('data/repositories/seasonCalendarRepository.js');
  const { commencerCalculLourd } = await imp('utils/calculLourd.js');
  const dansLaCopie = (f) => path.resolve(f).toLowerCase().startsWith(path.resolve(serveur).toLowerCase());
  const instantane = getFixturePaths().odds;
  if (!dansLaCopie(instantane) || !dansLaCopie(CALENDAR_FILE_PATH)) throw new Error('fichiers hors de la copie');
  // L'instantané : trois rencontres cotées dans les 48 h ; le calendrier : deux rencontres du Championship (aujourd'hui, demain).
  const h2h = (home, away, [o1, ox, o2]) => ({ key: 'h2h', outcomes: [{ name: home, price: o1 }, { name: away, price: o2 }, { name: 'Draw', price: ox }] });
  const cote = (id, home, away, ko, cotes) => ({ id, sport_key: 'soccer_epl', sport_title: 'EPL', commence_time: ko, home_team: home, away_team: away, bookmakers: [{ key: 'pinnacle', title: 'Pinnacle', last_update: '2026-10-04T20:00:00Z', markets: [h2h(home, away, cotes)] }] });
  fs.mkdirSync(path.dirname(instantane), { recursive: true });
  fs.writeFileSync(instantane, JSON.stringify([{ data: [cote('essai-a', 'Man City', 'Liverpool', '2026-10-05T18:30:00Z', [2.0, 3.6, 3.9]), cote('essai-b', 'Arsenal', 'Chelsea', '2026-10-05T19:00:00Z', [2.2, 3.5, 3.4]), cote('essai-e', 'Fulham', 'Brentford', '2026-10-06T20:00:00Z', [2.4, 3.3, 3.0])] }]));
  const deux = db.prepare("SELECT home_name, away_name FROM matches WHERE league = 'Championship' AND home_id IS NOT NULL AND away_id IS NOT NULL ORDER BY date DESC LIMIT 2").all();
  const entree = (date, x) => ({ id: `cal-essai-${date}`, matchId: `cal-${date}-essai`, date, league: 'Championship', homeName: x.home_name, awayName: x.away_name, status: 'scheduled', homeGoals: null, awayGoals: null, round: '9', source: 'fotmob', updatedAt: '2026-10-01T00:00:00Z' });
  fs.mkdirSync(path.dirname(CALENDAR_FILE_PATH), { recursive: true });
  fs.writeFileSync(CALENDAR_FILE_PATH, JSON.stringify([entree('2026-10-05', deux[0]), entree('2026-10-06', deux[1])]));
  const instant = Date.parse('2026-10-05T01:00:00.000Z');
  const octets = (liste) => JSON.stringify(liste);
  // 1. La référence : la liste calculée ici, comme avant le correctif.
  const ici = G.matchsAVenir(instant);
  sortie.reference = { matchs: ici.length, noms: ici.map((m) => `${m.home} - ${m.away}`) };
  // 2. À part (l'enfant) : la même liste.
  const aPart = await SN.listeDesMatchsAVenir({ instant, aPart: true });
  sortie.aPart = { lieu: aPart.lieu, repli: aPart.repli ?? null, ms: Number.isFinite(aPart.ms), matchs: aPart.liste.length, memes: octets(aPart.liste) === octets(ici) };
  // 3. L'enfant ne répond pas à temps (1 ms) : arrêté, la liste refaite ici, le repli dit.
  const repli = await SN.listeDesMatchsAVenir({ instant, aPart: true, delaiMs: 1 });
  sortie.repli = { lieu: repli.lieu, repli: repli.repli ?? null, matchs: repli.liste.length, memes: octets(repli.liste) === octets(ici) };
  // 4. Un essai (aPart faux) : ici, sans repli.
  const essai = await SN.listeDesMatchsAVenir({ instant, aPart: false });
  sortie.essai = { lieu: essai.lieu, repli: essai.repli ?? null, memes: octets(essai.liste) === octets(ici) };
  // 5. Un autre calcul lourd tient le jeton : l'erreur remonte (la nuit est alors reportée), jamais un repli silencieux.
  const rendre = commencerCalculLourd('banc au clic (essai)');
  try {
    const r = await SN.listeDesMatchsAVenir({ instant, aPart: true });
    sortie.pendantUnCalculLourd = { leve: false, lieu: r.lieu, repli: r.repli ?? null };
  } catch (error) {
    sortie.pendantUnCalculLourd = { leve: true, nom: error?.constructor?.name ?? null, message: String(error?.message ?? error).slice(0, 200) };
  } finally {
    rendre();
  }
  // 6. Une nuit entière : la liste à part, le serveur jamais tenu longtemps (dedans : blocMaxMs ; dehors : un battement de 1 ms).
  let dernier = performance.now();
  let dehorsMax = 0;
  const battement = setInterval(() => {
    const t = performance.now();
    dehorsMax = Math.max(dehorsMax, t - dernier);
    dernier = t;
  }, 1);
  const nuit = await SN.simulerLesMatchsDeLaNuit({ maintenant: instant, aPart: true, juger: false, n: 200 });
  clearInterval(battement);
  sortie.nuit = { mode: nuit.mode, erreur: nuit.erreur ?? null, liste: nuit.liste ?? null, matchs: nuit.bilan?.matchs ?? null, dansLaFenetre: nuit.bilan?.dansLaFenetre ?? null, blocMaxMs: nuit.blocMaxMs, blocMaxOu: nuit.blocMaxOu, dehorsMaxMs: Math.round(dehorsMax) };
  // 7. Une liste DONNÉE (les essais) : jamais d'enfant.
  const donnee = await SN.simulerLesMatchsDeLaNuit({ maintenant: instant, aPart: true, juger: false, n: 200, matchs: [] });
  sortie.donnee = { mode: donnee.mode, liste: donnee.liste ?? null };
  closeDb();
} else {
  throw new Error(`phase inconnue : ${phase}`);
}
console.log(JSON.stringify(sortie));
