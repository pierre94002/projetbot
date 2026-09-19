#!/usr/bin/env node
/**
 * populate-team-profiles.mjs
 * -------------------------------------------------------------------------
 * Peuple server/data/runtime/team-profiles.json (effectif + forme +
 * moyennes, via recherche web Claude — cf. resolveTeamProfileViaWeb dans
 * webLookupService.js) pour les équipes des 3 coupes européennes — pas
 * d'équivalent local pour elles (contrairement aux 16 championnats couverts
 * par historicalMatchesProvider.js, ~55 pays différents ici).
 *
 * Saute toute équipe déjà présente dans team-profiles.json (pas de
 * re-recherche inutile) — relançable sans risque, reprend là où ça s'était
 * arrêté. Pause de 2s entre deux équipes pour rester raisonnable côté API.
 *
 * Usage : node scripts/populate-team-profiles.mjs
 * -------------------------------------------------------------------------
 */
import { resolveTeamProfileViaWeb, WEB_LOOKUP_INCOMPLETE } from '../src/core/ai/webLookupService.js';
import { saveTeamProfile, listTeamProfileFreshness } from '../src/data/repositories/teamProfileRepository.js';
import { getWebStandings } from '../src/data/repositories/webStandingsRepository.js';
import { findBestTeamNameMatch } from '../src/utils/teamNameMatch.js';

const CL_LABEL = 'UEFA Champions League';
const EL_LABEL = 'UEFA Europa League';
const ECL_LABEL = 'UEFA Europa Conference League';

// Champions League : déjà en base (standings-web.json), lu directement plutôt
// que retapé. Europa League / Conference League n'ont pas encore de
// classement (saisons pas commencées au 2026-09-16) — participants recherchés
// à la main le 2026-09-16 (listes UEFA "Meet the teams"), à corriger/compléter
// par la tâche planifiée une fois les classements disponibles.
const EUROPA_LEAGUE_TEAMS = [
  'Ararat-Armenia', 'Salzburg', 'Sturm Graz', 'Anderlecht', 'Union SG', 'Levski Sofia', 'Dinamo Zagreb',
  'Omonia', 'Sparta Praha', 'Viktoria Plzeň', 'Bournemouth', 'Crystal Palace', 'Sunderland', 'Lyon',
  'Marseille', 'Rennes', 'Hoffenheim', 'Bayer Leverkusen', 'OFI Crete', 'Olympiacos', 'Ferencváros',
  'Hapoel Beer Sheva', 'AC Milan', 'Juventus', 'AZ Alkmaar', 'NEC Nijmegen', 'Lillestrøm', 'Jagiellonia',
  'Lech Poznań', 'Benfica', 'Torreense', 'Celtic', 'Celje', 'Real Sociedad', 'Celta Vigo', 'Beşiktaş'
];

const CONFERENCE_LEAGUE_TEAMS = [
  'Brighton and Hove Albion', 'Atalanta', 'Getafe', 'SC Freiburg', 'AS Monaco', 'Braga', 'Ajax', 'FC Twente',
  'Gent', 'Sint-Truiden', 'Trabzonspor', 'Jablonec', 'Panathinaikos', 'AGF Aarhus', 'FC Copenhagen',
  'Midtjylland', 'Nordsjælland', 'Brann', 'Pafos', 'FC Lugano', 'FC Thun', 'Hearts', 'Mjällby',
  'Hajduk Split', 'Crvena Zvezda', 'Universitatea Craiova', 'FC Kairat', 'CSKA Sofia', 'KuPS Kuopio',
  'Borac Banja Luka', 'Riga FC', 'KF Egnatia', 'Kauno Žalgiris', 'Lincoln Red Imps FC',
  'Inter Club d\'Escaldes', 'FC Iberia 1999'
];

const MAX_CONSECUTIVE_FAILURES = 2;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const clStandings = getWebStandings(CL_LABEL);
  const clTeams = (clStandings?.rows ?? []).map((r) => r.teamName);

  const targets = [
    ...clTeams.map((teamName) => ({ teamName, league: CL_LABEL })),
    ...EUROPA_LEAGUE_TEAMS.map((teamName) => ({ teamName, league: EL_LABEL })),
    ...CONFERENCE_LEAGUE_TEAMS.map((teamName) => ({ teamName, league: ECL_LABEL }))
  ];

  // Correspondance floue (comme getTeamProfile) : le classement web peut
  // renommer un club d'un jour à l'autre ("VfB Stuttgart" → "Stuttgart"),
  // inutile de payer une seconde recherche pour la même équipe.
  const existing = Object.keys(listTeamProfileFreshness());
  const todo = targets.filter(({ teamName }) => !findBestTeamNameMatch(teamName, existing));

  console.log(`Total équipes ciblées : ${targets.length} (CL ${clTeams.length}, EL ${EUROPA_LEAGUE_TEAMS.length}, ECL ${CONFERENCE_LEAGUE_TEAMS.length})`);
  console.log(`Déjà en base : ${targets.length - todo.length} — à traiter : ${todo.length}`);

  let done = 0;
  let empty = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  for (const { teamName, league } of todo) {
    const startedAt = Date.now();
    const index = done + empty + failed + 1;
    try {
      const profile = await resolveTeamProfileViaWeb({ teamName, league });
      consecutiveFailures = 0;
      if (profile) {
        saveTeamProfile(teamName, profile);
        done++;
        console.log(`[${index}/${todo.length}] OK  ${teamName} (${league}) — ${profile.players.length} joueurs, ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
      } else {
        empty++;
        console.log(`[${index}/${todo.length}] VIDE ${teamName} (${league}) — rien de fiable trouvé`);
      }
    } catch (error) {
      failed++;
      // Une réponse incomplète ne concerne que cette équipe : elle ne compte
      // pas comme panne d'API et n'interrompt pas le lot.
      if (error.code === WEB_LOOKUP_INCOMPLETE) consecutiveFailures = 0;
      else consecutiveFailures++;
      console.log(`[${index}/${todo.length}] ECHEC ${teamName} (${league}) — ${error.message}`);
      // Deux échecs d'affilée = problème d'API (crédits, clé, réseau), pas
      // d'équipe : inutile d'enchaîner toutes les autres pour rien.
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.log(`Arrêt : ${consecutiveFailures} échecs consécutifs — corrige la cause puis relance, le lot reprendra ici.`);
        break;
      }
    }
    await sleep(2000);
  }

  console.log(`\nTerminé. ${done} profils ajoutés, ${empty} sans données fiables, ${failed} échecs, sur ${todo.length} à traiter.`);
}

main().catch((err) => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
