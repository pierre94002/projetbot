/**
 * simulationSaisonsEnfant.js — LES FINS DE SAISON DE LA NUIT dans un PROCESSUS À PART (étape 28 du plan, conception §2
 * et §4.4). Lancé par simulationNuit.js (fork, sérialisation « avancée », argument « --enfant-simulation ») ; ce
 * n'est pas un script à lancer à la main.
 *
 * Ouvre la base EN LECTURE SEULE (new DatabaseSync(chemin, { readOnly: true }) : jamais un second écrivain, c'est le
 * serveur qui range) et lit le calendrier par readJsonFile. Pour chacun des championnats (jamais une coupe) :
 *   1. les tables officielles de la phase en cours, relevées AVANT la nuit (fetched_at ≤ l'instant de la nuit ; une
 *      table orpheline ou en doublon écartée : saisons.tablesDeLaPhase) ;
 *   2. la GARDE ANTI-FUITE : pour chaque club, joués(table) = joués(magasin, date < D), D = le jour civil de Paris de la
 *      nuit, `date < D` STRICT dans une requête SQL propre (la règle du classement, countsForTable, importée, jamais
 *      retouchée) ; pour une table d'Apertura ou de Clausura, si la saison compte plus de rencontres que la table,
 *      seules celles dont la compétition ou le tour FotMob nomme la phase ; sinon « table et magasin en désaccord :
 *      non calculé », clubs nommés — ou, quand tous les clubs ont fini leur phase régulière à la table et que le magasin
 *      compte déjà leurs matchs suivants, « poules de fin de saison » (saisons.raisonDuDesaccord) ;
 *   3. les noms du calendrier rattachés (la table, puis teams + team_aliases EN SQL, restreints aux clubs de la table ;
 *      jamais de rapprochement souple ni d'annuaire écrivain) ; un nom inconnu : non calculé, nommé ;
 *   4. les rencontres restantes (saisons.restants : jamais inventées) ; une rencontre du calendrier datée du jour D ou
 *      après compte comme à jouer quoi qu'en dise son statut (rien d'après D n'entre) ;
 *   5. les DEUX lois chaque nuit : « forces » (V2, les forces de buts de l'empreinte demandée, dernière ligne de jour
 *      < D, et les moyennes du championnat avant D) quand on la lui demande, et « table » (V1) ;
 *   6. N fins de phase par loi (même graine : le championnat, la saison, la version, le jour D), l'enjeu des rencontres
 *      datées des 14 prochains jours.
 * Renvoie un championnat par morceau ({ morceau }), puis la fin ({ fin: true, bilan }) ou { erreur }, et s'arrête.
 * Ni horloge (les durées : performance.now), ni réseau, ni écriture.
 */

import { DatabaseSync } from 'node:sqlite';
import { readJsonFile } from '../../utils/atomicJson.js';
import { CUPS_BY_LEAGUE, isCup } from '../providers/leagueCups.js';
import { seasonOf, seasonBounds } from '../providers/seasonWindows.js';
import { countsForTable } from '../db/matchStatsRead.js';
import { moyennesAvant, debutDes365Jours } from '../../core/engine/goalModel.js';
import { idFotMob, tablesDeLaPhase, rattacherLesNoms, formatDeLaSaisonPrecedente, restants, raisonDuDesaccord, loiTable, loiForces, simulerSaison } from './saisons.js';
import { fnv1a } from './simulationMatch.js';
import { N, VERSION_SAISONS } from './reglages.js';

/** Les championnats simulés : ceux qui ont des coupes rattachées (leagueCups.js), jamais une coupe. */
export const CHAMPIONNATS = Object.freeze(Object.keys(CUPS_BY_LEAGUE).filter((l) => !isCup(l)));
/** L'enjeu : les rencontres datées des 14 prochains jours (D compris). */
export const JOURS_ENJEU = 14;
/** Les deux lois rangées chaque nuit (colonne `loi`). */
export const LOIS = Object.freeze({ forces: 'forces', table: 'table' });

const JOUR_MS = 86_400_000;
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const lireJson = (t) => {
  if (typeof t !== 'string' || !t) return {};
  try {
    return JSON.parse(t) ?? {};
  } catch {
    return {};
  }
};
const nomDuClub = (row) => row?.teamName ?? row?.shortName ?? String(row?.teamId ?? '?');

/** La graine des fins de saison d'un championnat pour la nuit du jour D (les deux lois partagent les mêmes tirages). */
export const graineDesSaisons = ({ league, season, jourD }) => fnv1a(`${league}|${season}|${VERSION_SAISONS}|${jourD}`);

/**
 * Les rencontres JOUÉES de la saison au magasin, `date < D` strict, qui comptent au classement : par club (le numéro
 * FotMob) et par paire ordonnée « dom|ext ». `phase` : 'apertura' | 'clausura' | autre ; `clubs` : les numéros de la
 * table. Pour une phase nommée, si la saison compte plus de rencontres qu'un club n'en a dans la table, on ne garde que
 * celles dont la compétition ou le tour FotMob nomme la phase (« Clausura - Round 5 », « Liga Profesional Clausura »).
 */
export function jouesAuMagasin(database, { league, d0, jourD, phase, joues: attendus }) {
  const lignes = [];
  for (const r of database
    .prepare('SELECT home_id AS h, away_id AS a, meta FROM matches WHERE league = ? AND date >= ? AND date < ? AND home_goals IS NOT NULL AND away_goals IS NOT NULL')
    .iterate(league, d0, jourD)) {
    const meta = lireJson(r.meta);
    if (!countsForTable(meta)) continue;
    const h = idFotMob(r.h);
    const a = idFotMob(r.a);
    if (!h || !a) continue;
    lignes.push({ h, a, texte: `${meta.leagueKey ?? ''} ${meta.round ?? ''}` });
  }
  const compter = (liste) => {
    const parClub = new Map();
    const paires = new Set();
    for (const l of liste) {
      parClub.set(l.h, (parClub.get(l.h) ?? 0) + 1);
      parClub.set(l.a, (parClub.get(l.a) ?? 0) + 1);
      paires.add(`${l.h}|${l.a}`);
    }
    return { parClub, paires, filtre: null };
  };
  let r = compter(lignes);
  if ((phase === 'apertura' || phase === 'clausura') && [...attendus].some(([id, n]) => (r.parClub.get(id) ?? 0) > n)) {
    const motif = phase === 'apertura' ? /apertura/i : /clausura/i;
    r = { ...compter(lignes.filter((l) => motif.test(l.texte))), filtre: phase };
  }
  return r;
}

/** L'annuaire des clubs de la table, EN SQL (teams + team_aliases, lecture seule) : Map(teamId de la table → [noms]). */
function annuaireDesClubs(database, rows) {
  const parNumero = new Map();
  for (const r of rows) {
    const n = idFotMob(r.teamId);
    if (n) parNumero.set(n, r.teamId);
  }
  const annuaire = new Map();
  if (!parNumero.size) return annuaire;
  const ids = [...parNumero.keys()].map((n) => `fotmob-${n}`);
  const marques = ids.map(() => '?').join(', ');
  for (const r of database.prepare(`SELECT team_id, name AS alias FROM teams WHERE team_id IN (${marques}) UNION SELECT team_id, alias FROM team_aliases WHERE team_id IN (${marques})`).all(...ids, ...ids)) {
    const cle = parNumero.get(idFotMob(r.team_id));
    if (!cle) continue;
    if (!annuaire.has(cle)) annuaire.set(cle, []);
    annuaire.get(cle).push(r.alias);
  }
  return annuaire;
}

/** Les forces de buts de chaque club (dernière ligne de jour < D de l'empreinte) et les moyennes du championnat avant D. */
function forcesAvantD(database, { empreinte, clubs, league, jourD, season }) {
  const lire = database.prepare('SELECT ligue, n, nx, sa, wa, sd, wd, sga, wga, sgd, wgd FROM forces_buts WHERE reglages = ? AND club = ? AND jour < ? ORDER BY jour DESC LIMIT 1');
  const forces = new Map();
  let connus = 0;
  for (const id of clubs) {
    const r = lire.get(empreinte, Number(id), jourD);
    if (r) {
      connus++;
      forces.set(id, { sa: r.sa, wa: r.wa, sd: r.sd, wd: r.wd, sga: r.sga, wga: r.wga, sgd: r.sgd, wgd: r.wgd, n: r.n, nx: r.nx, ligue: r.ligue ?? null });
    }
  }
  const jours = database
    .prepare('SELECT jour, saison, n, bd, be, nx, xd, xe FROM forces_buts_ligues WHERE league = ? AND jour < ? AND (saison = ? OR jour >= ?) ORDER BY jour')
    .all(league, jourD, season, debutDes365Jours(jourD));
  return { forces, ligue: moyennesAvant(jours, { jour: jourD, saison: season }), part: clubs.length ? connus / clubs.length : 0 };
}

/**
 * UN CHAMPIONNAT. Rend { league, etat (la ligne de saisons_etat), probas (lignes de saisons_simulees), enjeux (lignes
 * d'enjeux_rencontres), inconnus (noms non rattachés) }.
 */
export function saisonDUnChampionnat(database, { league, jourD, calculeLe, calendrier, empreinte = null, reglagesButs = null, n = N }) {
  const t0 = performance.now();
  const season = seasonOf(league, jourD);
  const [d0, d1] = seasonBounds(league, season);
  const etat = { league, calcule_le: calculeLe, season: String(season), tables: null, complet: 0, raison: null, restants: null, a_dater: null, table_relevee_le: null, forces_empreinte: null, forces_a_jour: null, version: VERSION_SAISONS, graine: null, n: null, duree_ms: null };
  const fini = (raison, extra = {}) => ({ league, etat: { ...etat, raison, duree_ms: Math.round(performance.now() - t0) }, probas: [], enjeux: [], inconnus: [], ...extra });
  if (isCup(league)) return fini('coupe : pas de fin de saison simulée');
  // 1. Les tables de la phase, relevées avant la nuit.
  const toutes = database.prepare('SELECT table_name, ord, fetched_at, rows FROM standings_official WHERE league = ? AND season = ? AND fetched_at <= ? ORDER BY ord, table_name').all(league, season, calculeLe);
  const { tables, phase } = tablesDeLaPhase(toutes);
  if (!tables.length) return fini('aucun classement officiel relevé pour la saison en cours : non calculé');
  etat.tables = JSON.stringify(tables.map((t) => t.name));
  etat.table_relevee_le = tables.map((t) => t.fetchedAt).filter(Boolean).sort().at(-1) ?? null;
  const rows = tables.flatMap((t) => t.rows);
  const parId = new Map();
  for (const r of rows) {
    const id = idFotMob(r.teamId);
    if (!id) return fini(`un club de la table sans numéro FotMob (${nomDuClub(r)}) : non calculé`);
    if (!parId.has(id)) parId.set(id, r);
  }
  const clubs = [...parId.keys()];
  // 2. La garde anti-fuite : joués(table) = joués(magasin, date < D).
  const attendus = new Map(clubs.map((id) => [id, Number(parId.get(id).played ?? 0)]));
  const magasin = jouesAuMagasin(database, { league, d0, jourD, phase, joues: attendus });
  const desaccords = clubs.filter((id) => (magasin.parClub.get(id) ?? 0) !== attendus.get(id));
  // La saison d'avant (le format de la phase) : lue avant la garde, pour dire les poules de fin de saison en mots vrais.
  const precedentes = database.prepare('SELECT table_name, ord, fetched_at, rows FROM standings_official WHERE league = ? AND season = ? AND fetched_at <= ? ORDER BY ord, table_name').all(league, season - 1, calculeLe);
  const format = formatDeLaSaisonPrecedente(precedentes, tables[0].name);
  if (desaccords.length) {
    return fini(raisonDuDesaccord(desaccords.map((id) => ({ nom: nomDuClub(parId.get(id)), table: attendus.get(id), magasin: magasin.parClub.get(id) ?? 0 })), { clubs: clubs.length, journees: format?.J ?? null }));
  }
  // 3. Les noms du calendrier de la saison : à jouer (daté du jour D ou après, quel que soit son statut), ou plus ancien et pas joué.
  const entrees = (calendrier ?? []).filter((e) => e?.league === league && typeof e.date === 'string' && e.date >= d0 && e.date < d1 && (e.date >= jourD || (e.status !== 'finished' && (e.homeGoals === null || e.homeGoals === undefined))));
  const noms = rattacherLesNoms({ rows, calendrier: entrees, annuaire: annuaireDesClubs(database, rows) });
  const nonRattaches = [...noms.inconnus, ...noms.ambigus];
  if (nonRattaches.length) {
    return fini(`${nonRattaches.length} club(s) du calendrier non reconnu(s) : ${nonRattaches.slice(0, 4).join(', ')} — non calculé`, { inconnus: nonRattaches });
  }
  const matchIdDe = new Map();
  const calendrierRattache = entrees.map((e) => {
    const h = idFotMob(noms.parNom.get(e.homeName));
    const a = idFotMob(noms.parNom.get(e.awayName));
    if (h && a && !matchIdDe.has(`${h}|${a}|${e.date}`)) matchIdDe.set(`${h}|${a}|${e.date}`, e.matchId ?? null);
    return { homeId: h, awayId: a, date: e.date, status: e.status };
  });
  // 4. Les rencontres restantes, jamais inventées (le format de la saison d'avant, lu plus haut).
  const r = restants({
    table: { clubs: clubs.map((id) => ({ id, played: attendus.get(id) })), tables: tables.length, journees: format?.J ?? null },
    joues: magasin.paires,
    calendrier: calendrierRattache,
    k: format?.k ?? null,
    jourD
  });
  etat.restants = r.liste.length;
  etat.a_dater = r.comptes.aDater;
  if (!r.complet) return fini(r.raison ?? 'rencontres restantes incomplètes : non calculé');
  // 5. Les lois.
  const lois = [[LOIS.table, loiTable(rows)]];
  if (empreinte && reglagesButs) {
    const f = forcesAvantD(database, { empreinte, clubs, league, jourD, season });
    etat.forces_empreinte = empreinte;
    etat.forces_a_jour = f.part;
    lois.unshift([LOIS.forces, loiForces({ forces: f.forces, ligue: f.ligue, reglages: reglagesButs })]);
  }
  // 6. N fins de phase par loi, mêmes tirages ; l'enjeu des rencontres datées des 14 prochains jours.
  const fin = plusJours(jourD, JOURS_ENJEU);
  const aEnjeu = r.liste.map((m, q) => (m.date && m.date >= jourD && m.date <= fin ? q : -1)).filter((q) => q >= 0);
  const seed = graineDesSaisons({ league, season, jourD });
  etat.graine = seed;
  etat.n = n;
  etat.complet = 1;
  etat.raison = r.raison ?? null;
  const probas = [];
  const enjeux = [];
  const noms2 = (id) => nomDuClub(parId.get(String(id)));
  for (const [loi, f] of lois) {
    const s = simulerSaison({ table: { tables }, restants: r.liste, loi: f, n, seed, rencontresAEnjeu: aEnjeu });
    for (const p of s.probas) {
      for (const [famille, probabilite] of Object.entries(p.familles)) {
        probas.push({ league, season: String(season), table_name: p.table, team_id: String(p.club), calcule_le: calculeLe, loi, famille, probabilite, unanime: p.unanime[famille] ? 1 : 0 });
      }
    }
    for (const e of s.enjeux) {
      enjeux.push({
        league,
        date: e.date,
        home_id: e.h,
        away_id: e.a,
        loi,
        match_id: matchIdDe.get(`${e.h}|${e.a}|${e.date}`) ?? null,
        kickoff: null,
        calcule_le: calculeLe,
        enjeu_dom: e.dom.enjeu,
        enjeu_ext: e.ext.enjeu,
        categorie: e.categorie,
        detail: JSON.stringify({ issues: e.issues, dom: { enjeu: e.dom.enjeu, valeurDuNul: e.dom.valeurDuNul, parFamille: e.dom.parFamille }, ext: { enjeu: e.ext.enjeu, valeurDuNul: e.ext.valeurDuNul, parFamille: e.ext.parFamille }, noms: { dom: noms2(e.h), ext: noms2(e.a) } }),
        version: VERSION_SAISONS
      });
    }
  }
  etat.duree_ms = Math.round(performance.now() - t0);
  return { league, etat, probas, enjeux, inconnus: [] };
}

/**
 * TOUS LES CHAMPIONNATS (générateur : la main rendue entre deux championnats dans le processus appelant). `surChampionnat`
 * reçoit chacun. Rend le bilan { championnats, simules, nonCalcules: [{ league, raison }], inconnus: [{ league, noms }],
 * enjeux, restants, probas, dureeMs }.
 */
export function* calculerLesSaisons({ database, jourD, calculeLe, calendrier, empreinte = null, reglagesButs = null, n = N, ligues = CHAMPIONNATS, surChampionnat = () => {} }) {
  if (typeof jourD !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(jourD)) throw new Error('calculerLesSaisons : le jour D (AAAA-MM-JJ) est obligatoire.');
  if (typeof calculeLe !== 'string' || !Number.isFinite(Date.parse(calculeLe))) throw new Error('calculerLesSaisons : l’instant de la nuit est obligatoire.');
  const t0 = performance.now();
  const bilan = { championnats: 0, simules: 0, nonCalcules: [], inconnus: [], enjeux: 0, restants: 0, probas: 0, dureeMs: 0 };
  for (const league of ligues) {
    bilan.championnats++;
    let un;
    try {
      un = saisonDUnChampionnat(database, { league, jourD, calculeLe, calendrier, empreinte, reglagesButs, n });
    } catch (error) {
      un = { league, etat: { league, calcule_le: calculeLe, season: null, tables: null, complet: 0, raison: `en échec : ${String(error?.message ?? error).slice(0, 200)}`, restants: null, a_dater: null, table_relevee_le: null, forces_empreinte: null, forces_a_jour: null, version: VERSION_SAISONS, graine: null, n: null, duree_ms: null }, probas: [], enjeux: [], inconnus: [] };
    }
    if (un.etat.complet) {
      bilan.simules++;
      bilan.restants += un.etat.restants ?? 0;
    } else bilan.nonCalcules.push({ league, raison: un.etat.raison });
    if (un.inconnus.length) bilan.inconnus.push({ league, noms: un.inconnus });
    bilan.enjeux += un.enjeux.length;
    bilan.probas += un.probas.length;
    surChampionnat(un);
    yield league;
  }
  bilan.dureeMs = Math.round(performance.now() - t0);
  return bilan;
}

// ------------------------------------------------------------ le processus à part
if (process.argv.includes('--enfant-simulation') && typeof process.send === 'function') {
  process.once('message', ({ chemin, jourD, calculeLe, fichierCalendrier, empreinte, reglagesButs, n, ligues }) => {
    let db = null;
    try {
      db = new DatabaseSync(chemin, { readOnly: true });
      db.exec('PRAGMA busy_timeout = 15000;');
      const calendrier = readJsonFile(fichierCalendrier, []);
      let rssMax = process.memoryUsage.rss();
      const travail = calculerLesSaisons({
        database: db,
        jourD,
        calculeLe,
        calendrier: Array.isArray(calendrier) ? calendrier : [],
        empreinte: empreinte ?? null,
        reglagesButs: reglagesButs ?? null,
        n: n ?? N,
        ligues: Array.isArray(ligues) && ligues.length ? ligues : CHAMPIONNATS,
        surChampionnat: (un) => process.send({ morceau: un })
      });
      let etape = travail.next();
      while (!etape.done) {
        rssMax = Math.max(rssMax, process.memoryUsage.rss());
        etape = travail.next();
      }
      rssMax = Math.max(rssMax, process.memoryUsage.rss());
      try {
        db.close();
      } catch {
        // déjà fermée
      }
      db = null;
      process.send({ fin: true, bilan: { ...etape.value, aPart: { pid: process.pid, rssMaxOctets: rssMax, rssFinOctets: process.memoryUsage.rss() } } }, () => process.exit(0));
    } catch (error) {
      try {
        db?.close();
      } catch {
        // déjà fermée
      }
      process.send({ erreur: String(error?.message ?? error) }, () => process.exit(0));
    }
  });
}
