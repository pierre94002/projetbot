#!/usr/bin/env node
/**
 * verify-sample.mjs
 * -----------------------------------------------------------------------
 * Relit chez FotMob un échantillon de rencontres de chaque compétition et
 * confronte ce que le magasin en dit à ce que la source publie AUJOURD'HUI :
 * score, clubs et leurs identifiants, nombre de statistiques d'équipe, nombre
 * de lignes joueur, postes renseignés, buts encaissés des gardiens, somme
 * des buts et passes des joueurs.
 *
 * C'est le contrôle de « malversation » : rien de ce que le magasin affirme
 * ne doit s'écarter de la source, et ce qu'elle publie doit y être entré.
 *
 *   node scripts/verify-sample.mjs                # 4 rencontres par compétition
 *   node scripts/verify-sample.mjs --per 8 --league "EPL"
 *   node scripts/verify-sample.mjs --seed 7       # autre tirage
 *
 * Ne corrige rien. Résumé JSON sur stdout, détail sur stderr.
 * -----------------------------------------------------------------------
 */

import { openDb } from '../src/data/db/matchStatsDb.js';
import { loadEntry } from '../src/data/db/matchStatsRead.js';
import { fetchMatchStats, FOTMOB_LEAGUES } from '../src/data/providers/fotMobProvider.js';
import { slug } from '../src/utils/nameIdentity.js';

const argv = process.argv.slice(2);
const flag = (nom, defaut) => { const i = argv.indexOf(nom); return i >= 0 ? argv[i + 1] : defaut; };
const leagues = argv.reduce((acc, a, i) => (a === '--league' ? [...acc, argv[i + 1]] : acc), []);
const PAR_LIGUE = Number(flag('--per', 4));
let graine = Number(flag('--seed', 1));
const alea = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
const CONC = 4;

const db = openDb();
const cibles = Object.keys(FOTMOB_LEAGUES).filter((l) => !leagues.length || leagues.includes(l));

// Tirage : des rencontres AVEC feuille chez nous (sinon rien à comparer que
// le score), réparties sur toutes les saisons.
const tirage = [];
for (const league of cibles) {
  const rows = db.prepare(`SELECT match_key, fotmob_id, home_id AS homeId, away_id AS awayId FROM matches WHERE league = ? AND fotmob_id IS NOT NULL AND home_goals IS NOT NULL ORDER BY date`).all(league);
  if (!rows.length) continue;
  const pris = new Set();
  for (let i = 0; i < Math.min(PAR_LIGUE, rows.length); i++) {
    let k; do { k = Math.floor(alea() * rows.length); } while (pris.has(k) && pris.size < rows.length);
    pris.add(k);
    tirage.push({ league, ...rows[k] });
  }
}

const resume = { sampled: tirage.length, fetched: 0, noStatsAtSource: 0, failed: 0, scoreMismatch: 0, teamIdMismatch: 0, nameMismatch: 0, teamStatsFewer: 0, playersFewer: 0, playersMore: 0, positionsMissing: 0, gkMismatch: 0, goalsMismatch: 0, assistsMismatch: 0, exact: 0, details: [] };
const sumBy = (players, key) => players.reduce((s, p) => s + (Number(p[key]) || 0), 0);
const gkOf = (players) => players.filter((p) => p.position === 'Goalkeeper' && (p.minutes ?? 0) > 0).map((p) => [p.playerId ?? slug(p.name), p.goalsConceded ?? null]);

let i = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < tirage.length) {
    const t = tirage[i++];
    const local = { ...loadEntry(t.match_key, { database: db }), homeId: t.homeId, awayId: t.awayId };
    let source;
    try { source = await fetchMatchStats(t.fotmob_id); } catch (e) { resume.failed++; console.error(`${t.match_key} : échec ${e.message}`); continue; }
    if (!source || source.noSheet) { resume.noStatsAtSource++; continue; }
    resume.fetched++;
    const ecarts = [];
    if (source.homeGoals !== null && (source.homeGoals !== local.homeGoals || source.awayGoals !== local.awayGoals)) { resume.scoreMismatch++; ecarts.push(`score magasin ${local.homeGoals}-${local.awayGoals}, source ${source.homeGoals}-${source.awayGoals}`); }
    if ((local.homeId && source.homeId && local.homeId !== source.homeId) || (local.awayId && source.awayId && local.awayId !== source.awayId)) { resume.teamIdMismatch++; ecarts.push(`identifiants ${local.homeId}/${local.awayId} vs ${source.homeId}/${source.awayId}`); }
    // Un nom ne compte que si l'identité manque ou diverge : le nom stocké
    // est celui du premier import (« Nott'm Forest »), l'identité est portée
    // par l'identifiant.
    const memeClub = (side) => local[`${side}Id`] && source[`${side}Id`] && local[`${side}Id`] === source[`${side}Id`];
    if ((!memeClub('home') && local.homeName !== source.homeName) || (!memeClub('away') && local.awayName !== source.awayName)) { resume.nameMismatch++; ecarts.push(`noms « ${local.homeName} - ${local.awayName} » vs « ${source.homeName} - ${source.awayName} »`); }
    for (const side of ['home', 'away']) {
      const nLocal = Object.keys(local.teamStats?.[side] ?? {}).length;
      const nSource = Object.keys(source.teamStats?.[side] ?? {}).length;
      if (nLocal < nSource - 1) { resume.teamStatsFewer++; ecarts.push(`${side} : ${nLocal} stats d'équipe en magasin, ${nSource} chez la source`); }
      const pl = local.players?.[side] ?? [];
      const ps = source.players?.[side] ?? [];
      if (pl.length < ps.length) { resume.playersFewer++; ecarts.push(`${side} : ${pl.length} joueurs en magasin, ${ps.length} chez la source`); }
      if (pl.length > ps.length) { resume.playersMore++; ecarts.push(`${side} : ${pl.length} joueurs en magasin, ${ps.length} chez la source (lignes en trop)`); }
      const sansPoste = pl.filter((p) => !p.position).length;
      const sansPosteSource = ps.filter((p) => !p.position).length;
      if (sansPoste > sansPosteSource) { resume.positionsMissing++; ecarts.push(`${side} : ${sansPoste} joueurs sans poste en magasin (${sansPosteSource} chez la source)`); }
      const gl = JSON.stringify(gkOf(pl).sort()); const gs = JSON.stringify(gkOf(ps).sort());
      if (gl !== gs) { resume.gkMismatch++; ecarts.push(`${side} gardiens : magasin ${gl}, source ${gs}`); }
      if (sumBy(pl, 'goals') !== sumBy(ps, 'goals')) { resume.goalsMismatch++; ecarts.push(`${side} buts joueurs : ${sumBy(pl, 'goals')} vs ${sumBy(ps, 'goals')}`); }
      if (sumBy(pl, 'assists') !== sumBy(ps, 'assists')) { resume.assistsMismatch++; ecarts.push(`${side} passes : ${sumBy(pl, 'assists')} vs ${sumBy(ps, 'assists')}`); }
    }
    if (!ecarts.length) resume.exact++;
    else { resume.details.push({ league: t.league, matchKey: t.match_key, fotmobId: t.fotmob_id, ecarts }); console.error(`${t.league} | ${t.match_key} (${t.fotmob_id})\n  - ${ecarts.join('\n  - ')}`); }
  }
}));

const { details, ...synthese } = resume;
console.error(`\n${synthese.sampled} tirées, ${synthese.fetched} relues, ${synthese.exact} exactes, ${synthese.noStatsAtSource} sans feuille chez la source, ${synthese.failed} échec(s).`);
console.log(JSON.stringify({ ...synthese, details }));
