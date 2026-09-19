#!/usr/bin/env node
/**
 * merge-season-calendar.mjs
 * -----------------------------------------------------------------------
 * Fusionne le calendrier (matchs joués + à venir) d'une ou plusieurs
 * compétitions dans server/data/runtime/season-calendar.json, lu par
 * GET /api/season-calendar (server/src/api/controllers/seasonCalendar.controller.js).
 *
 * Usage :
 *   node merge-season-calendar.mjs <chemin-season-calendar.json> <chemin-nouveaux-matchs.json>
 *
 * "nouveaux-matchs.json" est un tableau d'objets :
 *   [{ "date": "2026-09-20", "league": "Ligue 1 - France", "homeName": "...",
 *      "awayName": "...", "status": "scheduled"|"finished", "homeGoals": null|<entier>,
 *      "awayGoals": null|<entier>, "round": "Journée 5"|null, "source": "..." }, ...]
 *
 * Conçu pour être relancé chaque jour avec le calendrier COMPLET de chaque
 * compétition (pas seulement les nouveautés) : upsert par matchId stable
 * (date + équipes) — un match déjà connu est mis à jour (score qui tombe,
 * date décalée...), jamais dupliqué.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { teamNamesLikelyMatch, teamNamesEqual } from '../src/utils/teamNameMatch.js';

const [, , calendarPath, newMatchesPath] = process.argv;
if (!calendarPath || !newMatchesPath) {
  console.error('Usage: node merge-season-calendar.mjs <season-calendar.json> <nouveaux-matchs.json>');
  process.exit(1);
}

function slug(text) {
  return (text ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readJson(p, fallback) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`Attention : ${p} illisible/corrompu (${e.message}), on repart de la valeur par défaut.`);
  }
  return fallback;
}

const calendar = readJson(calendarPath, []);
const newMatches = readJson(newMatchesPath, []);

let created = 0;
let updated = 0;
let skipped = 0;
const now = new Date().toISOString();

for (const m of newMatches) {
  const { date, league, homeName, awayName, status, homeGoals, awayGoals, round, source } = m;

  if (!date || !homeName || !awayName || !league) {
    console.error(`Ignoré (données incomplètes) : ${JSON.stringify(m)}`);
    skipped++;
    continue;
  }

  const matchId = `cal-${date}-${slug(homeName)}-${slug(awayName)}`;
  // La source web n'écrit pas toujours les noms à l'identique d'un jour à
  // l'autre ("Sparta Prague"/"Sparta Praha", "AZ"/"AZ Alkmaar") : sans
  // correspondance floue, le même match existait en double, dont un fantôme
  // "à venir" à côté du vrai résultat. Même match si les deux camps se
  // ressemblent (même orientation ou inversée), ou si un camp est strictement
  // identique — une équipe ne joue qu'une fois par jour dans une compétition.
  // Un seul camp seulement ressemblant ne suffit pas (Paris SG / Paris FC le
  // même jour). L'entrée existante garde son identité (matchId, noms,
  // orientation domicile/extérieur).
  const sameDay = (e) => e.league === league && e.date === date;
  const sameOrientation = (e) => teamNamesEqual(e.homeName, homeName) || teamNamesEqual(e.awayName, awayName) || (teamNamesLikelyMatch(e.homeName, homeName) && teamNamesLikelyMatch(e.awayName, awayName));
  const swappedOrientation = (e) => teamNamesEqual(e.homeName, awayName) || teamNamesEqual(e.awayName, homeName) || (teamNamesLikelyMatch(e.homeName, awayName) && teamNamesLikelyMatch(e.awayName, homeName));
  const existing =
    calendar.find((e) => e.matchId === matchId) ??
    calendar.find((e) => sameDay(e) && sameOrientation(e)) ??
    calendar.find((e) => sameDay(e) && swappedOrientation(e));
  const swapped = Boolean(existing) && existing.matchId !== matchId && !sameOrientation(existing);
  const incomingHomeGoals = (swapped ? awayGoals : homeGoals) ?? null;
  const incomingAwayGoals = (swapped ? homeGoals : awayGoals) ?? null;
  const incomingHasScore = incomingHomeGoals !== null && incomingAwayGoals !== null;

  if (existing) {
    // Un score déjà connu n'est jamais effacé par une source en retard qui
    // annonce encore le match "à venir".
    if (incomingHasScore || existing.homeGoals === null || existing.homeGoals === undefined) {
      existing.status = status === 'finished' ? 'finished' : 'scheduled';
      existing.homeGoals = incomingHomeGoals;
      existing.awayGoals = incomingAwayGoals;
    }
    existing.round = round ?? existing.round ?? null;
    existing.source = source ?? existing.source ?? 'web';
    existing.updatedAt = now;
    updated++;
  } else {
    calendar.push({
      id: crypto.randomUUID(),
      matchId,
      date,
      league,
      homeName,
      awayName,
      status: status === 'finished' ? 'finished' : 'scheduled',
      homeGoals: homeGoals ?? null,
      awayGoals: awayGoals ?? null,
      round: round ?? null,
      source: source ?? 'web',
      updatedAt: now
    });
    created++;
  }
}

fs.mkdirSync(path.dirname(calendarPath), { recursive: true });
fs.writeFileSync(calendarPath, JSON.stringify(calendar, null, 2), 'utf8');

console.log(JSON.stringify({ created, updated, skipped, total: calendar.length }));
