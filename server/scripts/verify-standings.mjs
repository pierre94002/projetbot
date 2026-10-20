#!/usr/bin/env node
/**
 * verify-standings.mjs
 * -----------------------------------------------------------------------
 * Confronte, compétition par compétition et saison par saison, le classement
 * OFFICIEL relevé chez FotMob au classement CALCULÉ sur les rencontres du
 * magasin. Ce que l'écart révèle :
 *
 *   - une équipe présente d'un côté seulement : un club mal identifié, ou
 *     une phase entière absente du magasin ;
 *   - un nombre de matchs joués différent : des rencontres manquent (ou
 *     sont en double) dans le magasin ;
 *   - un bilan différent à matchs égaux (victoires, nuls, défaites, buts) :
 *     un score faux, ou un résultat décidé hors du terrain (match attribué,
 *     annulé) que la source ne publie pas comme la fédération l'applique —
 *     ce qui est précisément pourquoi la table officielle est celle qu'on
 *     affiche.
 *
 * La logique vit dans src/data/db/standingsCheck.js (étape 12 du plan,
 * 06/10/2026) : le carnet de santé des données la réutilise, ce script n'en
 * est plus que l'affichage — même sortie qu'avant.
 *
 * Ne corrige rien. Le résumé JSON part sur stdout, le détail sur stderr.
 *
 * Les matchs EN COURS (retouche du 12/10/2026) : la table officielle est
 * relevée en direct chez FotMob et compte déjà un match en cours, que le
 * magasin n'a pas encore. Un écart de « joués » qu'expliquent des matchs du
 * calendrier pas encore terminés, d'aujourd'hui ou d'hier, est mis à part :
 * une ligne « en cours : … » sur stderr, une liste `enCours` dans le détail de
 * sa saison et un compte `enCours` dans le résumé — seulement s'il y en a. Sans
 * match en cours, la sortie est celle d'avant, mot pour mot.
 *
 *   node scripts/verify-standings.mjs
 *   node scripts/verify-standings.mjs --league "EPL"
 * -----------------------------------------------------------------------
 */

import { openDb } from '../src/data/db/matchStatsDb.js';
import { confronterClassements } from '../src/data/db/standingsCheck.js';
import { matchsEnCoursDuCalendrier } from '../src/data/db/standingsCheck.js';
import { listSeasonCalendar } from '../src/data/repositories/seasonCalendarRepository.js';

const argv = process.argv.slice(2);
const leagues = argv.reduce((acc, a, i) => (a === '--league' ? [...acc, argv[i + 1]] : acc), []);
const db = openDb();

// Le calendrier de saison (data/runtime) : illisible, rien n'est mis à part.
let enCours = null;
try {
  enCours = matchsEnCoursDuCalendrier(listSeasonCalendar({ allSeasons: true }), { maintenant: Date.now() });
} catch (error) {
  console.error(`calendrier de saison illisible (${error.message}) : aucun écart mis à part pour un match en cours.`);
}

const { resume, details } = confronterClassements({ database: db, leagues: leagues.length ? leagues : null, journal: (ligne) => console.error(ligne), enCours });

// La sortie d'avant, mot pour mot : chaque écart en une ligne de texte ; les matchs en cours en plus, seulement s'il y en a.
const texte = (liste) => liste.map((x) => x.ligne);
const detailsTexte = details.map((d) => ({
  league: d.league,
  season: d.seasonLabel,
  tables: d.tables,
  onlyOfficial: texte(d.onlyOfficial),
  onlyComputed: texte(d.onlyComputed),
  played: texte(d.played),
  record: texte(d.record),
  awarded: texte(d.awarded),
  ...(d.enCours?.length ? { enCours: texte(d.enCours) } : {})
}));
const clubsEnCours = details.reduce((n, d) => n + (d.enCours?.length ?? 0), 0);

console.error(
  `\n${resume.seasons} saison(s) sur ${resume.leagues} compétition(s) ; ${resume.withOfficial} avec table officielle ; ${resume.exact} concordent exactement (clubs, matchs joués, victoires, nuls, défaites, buts), ${resume.exactOrExplained - resume.exact} de plus à un résultat attribué près (${resume.awardedExplained} club(s))` +
    (clubsEnCours ? ` ou à un match en cours près (${clubsEnCours} club(s) : match en cours ou pas encore enregistré, une information).` : '.')
);
console.log(JSON.stringify({ ...resume, ...(clubsEnCours ? { enCours: clubsEnCours } : {}), details: detailsTexte }));
