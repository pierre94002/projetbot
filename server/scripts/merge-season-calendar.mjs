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
 *
 * MATCH REPORTÉ — champ optionnel "postponedTo" : "AAAA-MM-JJ", où "date"
 * reste la date D'ORIGINE. L'entrée existante est alors DÉPLACÉE vers la
 * nouvelle date (son matchId est recalculé) au lieu d'en créer une seconde.
 * Sans ça, la rencontre initiale resterait éternellement "à venir" à une date
 * passée, invisible pour tout le monde — c'est ce qui est arrivé à
 * Levante - Athletic Club, reporté du 16 septembre au 21 octobre 2026 pour
 * cause de pelouse inondée. L'opération est idempotente : relancée, elle ne
 * retrouve plus rien à l'ancienne date et se contente de vérifier la nouvelle.
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
let moved = 0;
let removed = 0;
const now = new Date().toISOString();

for (const m of newMatches) {
  const { date, league, homeName, awayName, status, homeGoals, awayGoals, round, source, postponedTo } = m;

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
  // Match RE-PROGRAMMÉ : la même affiche, encore "à venir", à quelques jours
  // d'écart. Les dates de championnat bougent sans arrêt (télévision, coupes
  // d'Europe) ; sans ce rattrapage, chaque décalage laissait l'ancienne date
  // en "à venir" pour toujours et créait un doublon à la nouvelle. On exige
  // la MÊME orientation : l'affiche inversée est le match retour, pas le même
  // match. Et uniquement sur une entrée sans score : un résultat acquis ne se
  // déplace pas.
  const NEARBY_DAYS = 7;
  const dayGap = (e) => Math.abs(Date.parse(e.date) - Date.parse(date)) / 86400000;
  // ATTENTION : `sameOrientation` se contente d'UN seul camp identique. C'est
  // volontaire et sûr à l'intérieur d'une même journée (une équipe n'y joue
  // qu'une fois), mais faux dès qu'on compare deux dates : « Arsenal - Leeds »
  // et « Arsenal - Everton » de la semaine suivante partagent un camp sans
  // être le même match. Les règles qui traversent les dates exigent donc les
  // DEUX camps.
  const samePairing = (e) => teamNamesLikelyMatch(e.homeName, homeName) && teamNamesLikelyMatch(e.awayName, awayName);
  const rescheduled = () =>
    calendar.find(
      (e) =>
        e.league === league &&
        e.date !== date &&
        e.status !== 'finished' &&
        (e.homeGoals === null || e.homeGoals === undefined) &&
        dayGap(e) <= NEARBY_DAYS &&
        samePairing(e)
    );

  const existing =
    calendar.find((e) => e.matchId === matchId) ??
    calendar.find((e) => sameDay(e) && sameOrientation(e)) ??
    calendar.find((e) => sameDay(e) && swappedOrientation(e)) ??
    rescheduled();
  // Report : on déplace l'entrée d'origine plutôt que d'en créer une seconde.
  if (postponedTo) {
    const targetId = `cal-${postponedTo}-${slug(homeName)}-${slug(awayName)}`;
    const atNewDate =
      calendar.find((e) => e.matchId === targetId) ??
      calendar.find((e) => e.league === league && e.date === postponedTo && (sameOrientation(e) || swappedOrientation(e)));

    // Garde-fou : un match dont le score est déjà connu a bien été joué. Une
    // source qui le dit reporté se trompe (ou parle d'une autre rencontre) —
    // on ne détruit pas un résultat acquis sur cette foi-là.
    if (existing && (existing.homeGoals !== null && existing.homeGoals !== undefined)) {
      console.error(`Report ignoré, score déjà connu : ${date} ${homeName}-${awayName} (${existing.homeGoals}-${existing.awayGoals})`);
      skipped++;
    } else if (existing && atNewDate && existing !== atNewDate) {
      calendar.splice(calendar.indexOf(existing), 1); // La nouvelle date est déjà au calendrier : l'ancienne fait doublon.
      removed++;
    } else if (existing) {
      existing.date = postponedTo;
      // Recalculé sur SES noms, pas ceux de la source entrante : l'entrée
      // garde son identité, seule la date change (cf. invariant plus bas).
      existing.matchId = `cal-${postponedTo}-${slug(existing.homeName)}-${slug(existing.awayName)}`;
      existing.status = 'scheduled';
      existing.homeGoals = null;
      existing.awayGoals = null;
      existing.round = round ?? existing.round ?? null;
      existing.source = source ?? existing.source ?? 'web';
      existing.updatedAt = now;
      moved++;
    } else if (atNewDate) {
      atNewDate.updatedAt = now; // Déjà déplacé lors d'une exécution précédente.
      updated++;
    } else {
      calendar.push({
        id: crypto.randomUUID(),
        matchId: targetId,
        date: postponedTo,
        league,
        homeName,
        awayName,
        status: 'scheduled',
        homeGoals: null,
        awayGoals: null,
        round: round ?? null,
        source: source ?? 'web',
        updatedAt: now
      });
      created++;
    }
    continue;
  }

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
    // Entrée retrouvée à une autre date (re-programmation) : on la déplace au
    // lieu de laisser un fantôme derrière elle.
    if (existing.date !== date) {
      existing.date = date;
      existing.matchId = `cal-${date}-${slug(existing.homeName)}-${slug(existing.awayName)}`;
      moved++;
    } else {
      updated++;
    }
    existing.round = round ?? existing.round ?? null;
    existing.source = source ?? existing.source ?? 'web';
    existing.updatedAt = now;
  } else if (
    // La même affiche a DÉJÀ été jouée à quelques jours près : une source en
    // retard la réannonce "à venir" à une date décalée. Créer l'entrée
    // fabriquerait un match fantôme qui ne se résoudrait jamais.
    !incomingHasScore &&
    calendar.some((e) => e.league === league && e.status === 'finished' && dayGap(e) <= NEARBY_DAYS && samePairing(e))
  ) {
    console.error(`Ignoré (déjà joué à quelques jours près) : ${date} ${homeName}-${awayName}`);
    skipped++;
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

console.log(JSON.stringify({ created, updated, skipped, moved, removed, total: calendar.length }));
