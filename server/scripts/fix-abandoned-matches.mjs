#!/usr/bin/env node
/**
 * fix-abandoned-matches.mjs
 * -----------------------------------------------------------------------
 * Retire du magasin les rencontres ABANDONNÉES que FotMob liste comme
 * « terminées » — avec leur score provisoire.
 *
 * Ce que FotMob publie pour un match arrêté : `finished: true` ET
 * `cancelled: true`, motif « Abandoned », et le score au moment de l'arrêt.
 * Le magasin ne regardait que `finished`, donc Fiorentina - Inter existait
 * à 0-0 (arrêt du 1er décembre 2024) comme à 3-0 (reprise du 6 février), et
 * l'Inter gagnait un point au classement qui n'a jamais existé.
 *
 * Deux cas, selon ce que la source fait de la rencontre :
 *   - REPRISE sous le MÊME identifiant à une autre date (Fiorentina - Inter,
 *     Udinese - Roma) : la ligne est remise à la date et au score de la
 *     reprise, relue chez la source ;
 *   - REJOUÉE sous un NOUVEL identifiant (Bournemouth - Luton, décembre 2023
 *     puis mars 2024) ou jamais rejouée : la ligne abandonnée est supprimée ;
 *     le match rejoué est une rencontre ordinaire, importée comme telle.
 *
 * Balaye toutes les journées de la période — un appel par jour — pour
 * connaître le statut exact de chaque rencontre chez la source.
 *
 *   node scripts/fix-abandoned-matches.mjs                 (essai à blanc)
 *   node scripts/fix-abandoned-matches.mjs --apply
 *   node scripts/fix-abandoned-matches.mjs --from 2026-01-01 --apply
 * -----------------------------------------------------------------------
 */

import { openDb } from '../src/data/db/matchStatsDb.js';
import { rebuildRegistries } from '../src/data/db/identityRegistry.js';
import { fetchMatchesByDate, fetchMatchStats } from '../src/data/providers/fotMobProvider.js';
import { mergeMatchStats } from './merge-match-stats.mjs';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const flag = (nom, defaut) => { const i = argv.indexOf(nom); return i >= 0 ? argv[i + 1] : defaut; };
const FROM = flag('--from', '2023-01-01');
const TO = flag('--to', new Date().toISOString().slice(0, 10));
const CONC = 4;

const db = openDb();
const parId = new Map(db.prepare('SELECT match_key, fotmob_id, date, league, home_name, away_name, home_goals, away_goals FROM matches WHERE fotmob_id IS NOT NULL').all().map((r) => [r.fotmob_id, r]));

const jours = [];
for (let d = new Date(`${FROM}T12:00:00Z`); d <= new Date(`${TO}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) jours.push(d.toISOString().slice(0, 10));
console.log(`${jours.length} journée(s) à balayer, ${parId.size} rencontre(s) identifiées en magasin${APPLY ? '' : ' — essai à blanc, rien ne sera écrit'}.`);

// Par identifiant : chaque apparition dans une liste du jour, avec son statut.
const apparitions = new Map();
let faites = 0;
let i = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < jours.length) {
    const jour = jours[i++];
    let rencontres = [];
    try { rencontres = await fetchMatchesByDate(jour); } catch { /* journée illisible : ignorée */ }
    for (const m of rencontres) {
      if (!parId.has(m.matchId)) continue;
      if (!apparitions.has(m.matchId)) apparitions.set(m.matchId, []);
      apparitions.get(m.matchId).push({ date: jour, finished: m.finished, cancelled: m.cancelled, awarded: m.awarded, reason: m.reason, homeGoals: m.homeGoals, awayGoals: m.awayGoals });
    }
    faites++;
    if (faites % 100 === 0) console.log(`  ${faites}/${jours.length} journées`);
  }
}));

let supprimees = 0;
let reprises = 0;
const aReprendre = [];
for (const [id, liste] of apparitions) {
  const ligne = parId.get(id);
  const abandonnee = liste.find((a) => a.cancelled && a.date === ligne.date);
  if (!abandonnee) continue;
  const reprise = liste.find((a) => a.finished && !a.cancelled);
  if (reprise) {
    console.log(`  ${ligne.match_key} (${ligne.home_goals}-${ligne.away_goals}, abandonné) -> reprise le ${reprise.date} (${reprise.homeGoals}-${reprise.awayGoals}) : relecture`);
    aReprendre.push({ ligne, reprise });
  } else {
    console.log(`  ${ligne.match_key} (${ligne.home_goals}-${ligne.away_goals}, abandonné, ${ligne.league}) : suppression`);
    if (APPLY) db.prepare('DELETE FROM matches WHERE match_key = ?').run(ligne.match_key);
    supprimees++;
  }
}

if (APPLY && aReprendre.length) {
  const entrees = [];
  for (const { ligne, reprise } of aReprendre) {
    db.prepare('DELETE FROM matches WHERE match_key = ?').run(ligne.match_key);
    const stats = await fetchMatchStats(ligne.fotmob_id).catch(() => null);
    entrees.push({
      date: reprise.date,
      league: ligne.league,
      homeName: ligne.home_name,
      awayName: ligne.away_name,
      homeId: stats?.homeId ?? null,
      awayId: stats?.awayId ?? null,
      fotmobId: ligne.fotmob_id,
      homeGoals: stats?.homeGoals ?? reprise.homeGoals,
      awayGoals: stats?.awayGoals ?? reprise.awayGoals,
      ...(stats ? { teamStats: stats.teamStats, players: stats.players, events: stats.events, lineups: stats.lineups, meta: stats.meta, shotmap: stats.shotmap, sources: stats.sources }
        : { sources: [`https://www.fotmob.com/api/data/matchDetails?matchId=${ligne.fotmob_id}`] })
    });
    reprises++;
  }
  const bilan = mergeMatchStats('ignore', entrees);
  console.log(`Reprises réécrites : ${bilan.created} créée(s), ${bilan.updated} mise(s) à jour, ${bilan.warnings.length} avertissement(s).`);
} else {
  reprises = aReprendre.length;
}

console.log(`${supprimees} rencontre(s) abandonnée(s) supprimée(s), ${reprises} remise(s) à la date de reprise.`);
if (APPLY && (supprimees || reprises)) console.log(`Annuaires reconstruits : ${JSON.stringify(rebuildRegistries())}`);
