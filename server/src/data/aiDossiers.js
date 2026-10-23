/**
 * aiDossiers.js — LA NUIT DE LA MÉMOIRE DE L'IA (étape 44 du plan, 23/10/2026) : les dossiers par équipe et par
 * championnat, mis à jour chaque nuit (étape « dossiersIA » de l'actualisation, juste après le carnet de l'IA),
 * SEULEMENT pour les équipes qui ont joué et les championnats qui ont eu un match.
 * -----------------------------------------------------------------------
 * « A JOUÉ » se lit dans l'annuaire du magasin (table teams, refaite après chaque import : dernier match vu et nombre
 * de matchs) et dans le carnet (ses cas et ses leçons sur ce club) : la SIGNATURE d'un club change quand il a un
 * match de plus, ou quand le bilan d'un de ses matchs arrive (revue d'après-match en retard). Une équipe dont la
 * signature n'a pas changé garde son dossier tel quel, ses leçons comprises — même si le reste du carnet a bougé.
 * Un championnat : sa signature change avec ses matchs (dernier jour, nombre) et ses cas.
 *
 * TOUT EST LU, RIEN N'EST ÉCRIT DANS LA BASE : rencontres et scores (table du jour J de l'étape 17, sinon la table
 * des rencontres), annuaire, classements officiels FotMob, styles et entraîneurs (étape 37), absents relevés avant
 * chaque match (enregistreurs, étape E), repères du championnat (étape 15), carnet de l'IA (étape 21 : son fichier,
 * et ses cas réglés — repris de l'étape d'avant quand elle vient de tourner). Le seul écrit : data/runtime/ai-dossiers.json,
 * d'un bloc, par atomicJson. Aucun appel à Claude, aucun réseau. Calcul dans le serveur, en rendant la main
 * (générateur, utils/travailCooperatif.js).
 *
 * Rattachement : par IDENTIFIANT FotMob partout (clubs du carnet, classement par teamId, styles par numéro de club,
 * absents par team_id) ; aucun nom n'est jamais rapproché d'un autre.
 * -----------------------------------------------------------------------
 */

import { openDb } from './db/matchStatsDb.js';
import { clubDuMagasin } from './db/oddsProfileRead.js';
import { casDesAnalyses, lireLeCarnet } from './aiScorecard.js';
import { listAll } from './repositories/matchAiAnalysisRepository.js';
import { lireLesDossiers, ecrireLesDossiers, dossiersPour, DossiersIllisibles, FICHIER_DOSSIERS, dossiersVides } from './repositories/aiDossiersRepository.js';
import { libelleDuStyle } from './db/teamStyle.js';
import {
  VERSION_DOSSIERS,
  REGLES_LECONS,
  PROVENANCE_DOSSIERS,
  ETATS_RETIRES,
  leconsDesAnalyses,
  indexDesCas,
  porteesDeLaLecon,
  casSuivants,
  jugerLaLecon,
  etatSuivant,
  cleDePortee,
  cleDeLigue,
  leconsDuDossier,
  formeDuClub,
  seriesDuClub,
  classementDuClub,
  entraineurDuClub,
  profilDuChampionnat,
  carnetDuChampionnat,
  carnetDuClub,
  issueDe,
  texteDesDossiersPourIA
} from '../core/ai/aiMemory.js';
import { executerSansPause, executerEnRendantLaMain, creerPauses } from '../utils/travailCooperatif.js';

const JOUR_MS = 86_400_000;
/** Un club (un championnat) a un dossier s'il a joué dans l'année ; ses matchs se lisent sur 400 jours. */
export const FENETRES = Object.freeze({ actifJours: 365, matchsJours: 400, absentsJours: 30 });

const iso = (t) => new Date(t).toISOString().slice(0, 10);
const numero = (id) => {
  const m = /^fotmob-(\d+)$/.exec(String(id ?? ''));
  return m ? Number(m[1]) : null;
};
const pasDeTable = (error) => /no such table/i.test(String(error?.message ?? ''));
function toutOuRien(fn, vide) {
  try {
    return fn();
  } catch (error) {
    if (pasDeTable(error)) return vide;
    throw error;
  }
}

// ============================================================ les lectures (base en lecture seule)

/** L'annuaire : Map identifiant → { nom, league, dernier, joues }. */
function lireLAnnuaire(database) {
  return new Map(
    database
      .prepare('SELECT team_id AS id, name AS nom, league, last_seen AS dernier, played AS joues FROM teams')
      .all()
      .map((r) => [r.id, { nom: r.nom, league: r.league, dernier: r.dernier, joues: r.joues }])
  );
}

/**
 * L'activité de chaque compétition depuis `depuis` : Map league → { dernier, matchs }. SEULEMENT les colonnes de l'index
 * (league, date) : lire une autre colonne (le score) ferait relire chaque rencontre entière — 2 à 11 s sur la base du
 * bac, le serveur tenu tout ce temps (mesuré au premier calcul, 23/10/2026). Le magasin ne garde que des matchs joués.
 */
function lireLesCompetitions(database, depuis) {
  return new Map(database.prepare('SELECT league, max(date) AS dernier, count(*) AS matchs FROM matches WHERE date >= ? GROUP BY league').all(depuis).map((r) => [r.league, { dernier: r.dernier, matchs: r.matchs }]));
}

/** Les tables officielles de la saison la plus récente de chaque compétition : Map league → [table]. */
function lireLesClassements(database) {
  const lignes = toutOuRien(
    () =>
      database
        .prepare(
          `SELECT s.league, s.season, s.table_name, s.ord, s.fetched_at, s.rows FROM standings_official s
           JOIN (SELECT league, max(season) AS season FROM standings_official GROUP BY league) d ON d.league = s.league AND d.season = s.season`
        )
        .all(),
    []
  );
  const out = new Map();
  for (const r of lignes) {
    let rows = [];
    try {
      rows = JSON.parse(r.rows);
    } catch {
      rows = [];
    }
    if (!out.has(r.league)) out.set(r.league, []);
    out.get(r.league).push({ league: r.league, season: r.season, table_name: r.table_name, ord: r.ord, fetched_at: r.fetched_at, rows: Array.isArray(rows) ? rows : [] });
  }
  return out;
}

/** Le style actuel de chaque club (étape 37) : Map numéro → { style, libelle, second, secondLibelle, provisoire, n, jour }. */
function lireLesStyles(database) {
  return new Map(
    toutOuRien(() => database.prepare('SELECT club, jour, style, second, provisoire, n FROM team_style WHERE actuel = 1').all(), []).map((r) => [
      r.club,
      { style: r.style, libelle: libelleDuStyle(r.style), second: r.second ?? null, secondLibelle: r.second ? libelleDuStyle(r.second) : null, provisoire: Boolean(r.provisoire), n: r.n, jour: r.jour }
    ])
  );
}

/**
 * Les absents relevés (enregistreurs, étape E) sur les `absentsJours` derniers jours : pour chaque club, la DERNIÈRE
 * lecture faite avant un de ses matchs (même vide : « aucun absent annoncé »), et ses absents (blessés, suspendus ;
 * une semaine en sélection n'en est pas un). Map identifiant → { lusLe, match: { date, adversaireId, adversaire }, liste }.
 */
function lireLesAbsents(database, depuis, annuaire) {
  const lectures = toutOuRien(() => database.prepare('SELECT day, fotmob_id, date, home_id, away_id, home_name, away_name, read_at FROM unavailable_reads WHERE day >= ? ORDER BY read_at').all(depuis), []);
  const lignes = toutOuRien(() => database.prepare('SELECT day, fotmob_id, side, player_id, player_name, team_id, reason, expected_return FROM unavailable_daily WHERE day >= ?').all(depuis), []);
  const parLecture = new Map();
  for (const l of lignes) {
    const cle = `${l.day}|${l.fotmob_id}|${l.side}`;
    if (!parLecture.has(cle)) parLecture.set(cle, []);
    parLecture.get(cle).push(l);
  }
  const out = new Map();
  for (const r of lectures) {
    for (const [cote, moi, lui, nomLui] of [
      ['home', r.home_id, r.away_id, r.away_name],
      ['away', r.away_id, r.home_id, r.home_name]
    ]) {
      if (!moi) continue;
      const liste = (parLecture.get(`${r.day}|${r.fotmob_id}|${cote}`) ?? [])
        .filter((a) => a.reason !== 'internationalDuty')
        .map((a) => ({ nom: a.player_name, id: a.player_id ?? null, motif: a.reason ?? null, retour: a.expected_return ?? null }));
      // Les lectures sont triées par heure : la dernière gagne.
      out.set(moi, { lusLe: r.read_at, match: { date: r.date, adversaireId: lui ?? null, adversaire: annuaire.get(lui)?.nom ?? nomLui ?? null }, liste });
    }
  }
  return out;
}

/**
 * Les rencontres d'un club sur la fenêtre, du plus récent au plus ancien : la table du jour J (étape 17) quand elle
 * est à jour pour ce club, sinon la table des rencontres (par identifiant, deux requêtes : un OU empêche l'index).
 */
function lireLesMatchsDuClub(database, club, depuis, dernierVu, annuaire, requetes) {
  const n = numero(club);
  let lignes = [];
  let source = 'matches';
  if (n !== null && requetes.jourJ) {
    lignes = requetes.jourJ.all(n, depuis);
    if (lignes.length && String(lignes[0].date) >= String(dernierVu ?? '')) source = 'team_day';
    else lignes = [];
  }
  if (source === 'team_day') {
    return {
      source,
      matchs: lignes.map((r) => {
        const adv = `fotmob-${r.adversaire}`;
        return { date: r.date, league: r.league, coupe: Boolean(r.coupe), attribue: Boolean(r.attribue), lieu: r.camp === 1 ? 'dom' : 'ext', adversaireId: adv, adversaire: annuaire.get(adv)?.nom ?? null, bp: r.bp, bc: r.bc, issue: issueDe(r.bp, r.bc) };
      })
    };
  }
  const brutes = requetes.rencontres.all(club, depuis, club, depuis);
  const matchs = brutes
    .map((r) => {
      const dom = r.home_id === club;
      const bp = dom ? r.home_goals : r.away_goals;
      const bc = dom ? r.away_goals : r.home_goals;
      const adv = dom ? r.away_id : r.home_id;
      return { date: r.date, league: r.league, coupe: null, attribue: r.reason === 'awarded_win', lieu: dom ? 'dom' : 'ext', adversaireId: adv, adversaire: annuaire.get(adv)?.nom ?? (dom ? r.away_name : r.home_name), bp, bc, issue: issueDe(bp, bc) };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { source, matchs };
}

/** Le championnat d'un club : celui où il a le plus de matchs hors coupe sur la fenêtre ; sinon le plus fréquent ; sinon l'annuaire. */
function championnatDuClub(matchs, annuaireLeague) {
  const compte = (liste) => {
    const c = new Map();
    for (const m of liste) c.set(m.league, (c.get(m.league) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] ?? null;
  };
  return compte(matchs.filter((m) => m.coupe === false)) ?? compte(matchs) ?? annuaireLeague ?? null;
}

// ============================================================ le calcul de la nuit

/**
 * LE TRAVAIL DE LA NUIT, en générateur (il rend la main aux `yield`) : { donnees, bilan }. N'ÉCRIT RIEN.
 *   `precedent` : le contenu actuel du fichier (lireLesDossiers().donnees, ou dossiersVides()) ;
 *   `analyses` : les analyses de l'IA (listAll) ; `cas` : les cas réglés du carnet (sinon recalculés, sans clôture) ;
 *   `carnet` : le carnet écrit (parChampionnat) ; `force` : tout refaire.
 */
export function* travailDesDossiers({ database, precedent = dossiersVides(), analyses = null, cas = null, carnet = null, maintenant = Date.now(), force = false, regles = REGLES_LECONS } = {}) {
  const debut = performance.now();
  const jour = iso(maintenant);
  const actifDepuis = iso(maintenant - FENETRES.actifJours * JOUR_MS);
  const matchsDepuis = iso(maintenant - FENETRES.matchsJours * JOUR_MS);
  const refaireTout = force || precedent?.version !== VERSION_DOSSIERS;
  const ancien = refaireTout ? dossiersVides() : precedent;

  const liste = analyses ?? listAll();
  yield 'lecture des analyses';
  const lesCas = cas ?? (yield* casDesAnalyses(liste, { database, maintenant, avecCloture: false })).cas;
  yield 'les cas du carnet';
  const { lecons, sansCas, total: leconsEcrites } = leconsDesAnalyses(liste, lesCas);
  const index = indexDesCas(lesCas);
  yield 'les leçons';

  // L'activité : l'annuaire pour les clubs, la table des rencontres (index couvrant) pour les compétitions.
  const annuaire = lireLAnnuaire(database);
  const competitions = lireLesCompetitions(database, actifDepuis);
  yield 'l’annuaire';

  // Ce que le carnet sait de chaque club et de chaque championnat (cas, leçons) : une part de la signature.
  const casParPortee = new Map();
  const casDuClub = new Map();
  const compter = (cle) => casParPortee.set(cle, (casParPortee.get(cle) ?? 0) + 1);
  const ranger = (club, k) => {
    if (!casDuClub.has(club)) casDuClub.set(club, []);
    casDuClub.get(club).push(k);
  };
  for (const k of lesCas) {
    if (k?.homeId) {
      compter(k.homeId);
      ranger(k.homeId, k);
    }
    if (k?.awayId) {
      compter(k.awayId);
      ranger(k.awayId, k);
    }
    if (k?.league) compter(cleDeLigue(k.league));
  }
  const leconsParPortee = new Map();
  for (const l of lecons) for (const p of porteesDeLaLecon(l)) leconsParPortee.set(p.cle, (leconsParPortee.get(p.cle) ?? 0) + 1);

  const clubsActifs = [...annuaire].filter(([, t]) => t.dernier && t.dernier >= actifDepuis);
  const signatureClub = (id, t) => `${t.dernier}|${t.joues}|${casParPortee.get(id) ?? 0}|${leconsParPortee.get(id) ?? 0}`;
  const aRefaire = clubsActifs.filter(([id, t]) => refaireTout || !ancien.equipes[id] || ancien.equipes[id].signature !== signatureClub(id, t)).map(([id]) => id);
  const signatureLigue = (league, c) => `${c.dernier}|${c.matchs}|${casParPortee.get(cleDeLigue(league)) ?? 0}|${leconsParPortee.get(cleDeLigue(league)) ?? 0}`;
  const liguesActives = [...competitions];
  const liguesARefaire = liguesActives.filter(([league, c]) => refaireTout || !ancien.championnats[league] || ancien.championnats[league].signature !== signatureLigue(league, c)).map(([l]) => l);
  const refaitsClubs = new Set(aRefaire);
  const refaitesLigues = new Set(liguesARefaire);

  // LES LEÇONS : jugées dans les seules portées refaites ; les autres gardent leur état d'hier.
  const etats = new Map();
  const idsDesLecons = new Set(lecons.map((l) => l.id));
  for (const [cle, e] of Object.entries(ancien.lecons ?? {})) {
    // Une leçon dont l'analyse a disparu disparaît avec elle.
    if (idsDesLecons.has(cle.split('@')[0])) etats.set(cle, e);
  }
  const bilanLecons = { ecrites: leconsEcrites, rattachees: lecons.length, sansCas, jugees: 0, nouvellesConfirmees: 0, nouvellesRetirees: 0 };
  let tour = 0;
  for (const l of lecons) {
    for (const p of porteesDeLaLecon(l)) {
      const refaite = p.genre === 'equipe' ? refaitsClubs.has(p.club) : refaitesLigues.has(p.league);
      if (!refaite) continue;
      const cle = cleDePortee(l.id, p.cle);
      const avant = etats.get(cle) ?? null;
      const jugement = jugerLaLecon(l, casSuivants(index, l, p), { genre: p.genre, base: index.bases.get(l.type) ?? 0, regles, maintenant });
      const apres = etatSuivant(avant, jugement, jour);
      bilanLecons.jugees++;
      if (apres.change && apres.etat === 'confirmee' && !avant?.confirmeeLe) bilanLecons.nouvellesConfirmees++;
      if (apres.change && ETATS_RETIRES.includes(apres.etat)) bilanLecons.nouvellesRetirees++;
      const { change, ...garde } = apres;
      // On ne garde que ce qui sert : une leçon en attente sans passé ne pèse rien dans le fichier.
      if (garde.etat === 'attente' && !garde.confirmeeLe) etats.delete(cle);
      else etats.set(cle, garde.etat === 'attente' || garde.etat === 'incertaine' ? { etat: garde.etat, depuis: garde.depuis, confirmeeLe: garde.confirmeeLe } : garde);
      if (++tour % 200 === 0) yield 'leçons jugées';
    }
  }
  yield 'les leçons jugées';

  // Les lectures communes, une fois.
  const classements = lireLesClassements(database);
  const styles = lireLesStyles(database);
  const absents = lireLesAbsents(database, iso(maintenant - FENETRES.absentsJours * JOUR_MS), annuaire);
  const requetes = {
    jourJ: toutOuRien(() => database.prepare('SELECT camp, adversaire, date, league, coupe, attribue, bp, bc FROM team_day WHERE club = ? AND date >= ? ORDER BY date DESC'), null),
    rencontres: database.prepare(
      `SELECT date, league, home_id, away_id, home_name, away_name, home_goals, away_goals, json_extract(meta, '$.reason') AS reason FROM matches WHERE home_id = ? AND date >= ? AND home_goals IS NOT NULL
       UNION ALL SELECT date, league, home_id, away_id, home_name, away_name, home_goals, away_goals, json_extract(meta, '$.reason') AS reason FROM matches WHERE away_id = ? AND date >= ? AND home_goals IS NOT NULL`
    ),
    entraineurs: toutOuRien(() => database.prepare('SELECT date, coach, coach_id FROM team_style_matches WHERE club = ? AND date >= ? ORDER BY date DESC'), null)
  };
  yield 'les lectures communes';

  // LES DOSSIERS DES CLUBS qui ont joué.
  const equipes = {};
  for (const [id, e] of Object.entries(ancien.equipes ?? {})) if (!refaitsClubs.has(id) && annuaire.get(id)?.dernier >= actifDepuis) equipes[id] = e;
  const sourcesDesMatchs = { team_day: 0, matches: 0 };
  for (const id of aRefaire) {
    const t = annuaire.get(id);
    const { source, matchs } = lireLesMatchsDuClub(database, id, matchsDepuis, t.dernier, annuaire, requetes);
    sourcesDesMatchs[source]++;
    const league = championnatDuClub(matchs, t.league);
    const forme = formeDuClub(matchs);
    const n = numero(id);
    const lignesCoach = n !== null && requetes.entraineurs ? requetes.entraineurs.all(n, iso(maintenant - 3 * 365 * JOUR_MS)) : [];
    const classement = classementDuClub(classements.get(league) ?? [], id);
    const style = n !== null ? styles.get(n) ?? null : null;
    const abs = absents.get(id) ?? null;
    equipes[id] = {
      club: id,
      nom: t.nom,
      league,
      majLe: new Date(maintenant).toISOString(),
      jusquAu: forme?.dernierMatch ?? t.dernier,
      signature: signatureClub(id, t),
      classement,
      series: seriesDuClub(matchs),
      forme,
      entraineur: entraineurDuClub(lignesCoach, matchs, { maintenant }),
      style,
      absents: abs,
      carnet: carnetDuClub(casDuClub.get(id) ?? [], id),
      lecons: leconsDuDossier(
        lecons.filter((l) => l.homeId === id || l.awayId === id),
        id,
        etats,
        regles
      ),
      sources: {
        matchs: source === 'team_day' ? 'magasin FotMob, table du jour J (étape 17)' : 'magasin FotMob, table des rencontres',
        classementLuLe: classement?.luLe ?? null,
        styleDu: style?.jour ?? null,
        absentsLusLe: abs?.lusLe ?? null
      }
    };
    yield 'dossier d’un club';
  }

  // LES DOSSIERS DES CHAMPIONNATS qui ont eu un match.
  const championnats = {};
  for (const [league, d] of Object.entries(ancien.championnats ?? {})) if (!refaitesLigues.has(league) && competitions.has(league)) championnats[league] = d;
  const reperes = toutOuRien(() => database.prepare('SELECT saison, repere, valeur, matchs FROM league_benchmarks WHERE league = ?'), null);
  const parChampionnat = carnet?.parChampionnat ?? [];
  for (const league of liguesARefaire) {
    const c = competitions.get(league);
    const tables = classements.get(league) ?? [];
    const principale = [...tables].sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))[0] ?? null;
    const tete = principale
      ? [...principale.rows]
          .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
          .slice(0, 3)
          .map((r) => ({ id: r.teamId ?? null, nom: r.teamName, points: r.points, joues: r.played }))
      : [];
    const cleLigue = cleDeLigue(league);
    championnats[league] = {
      league,
      majLe: new Date(maintenant).toISOString(),
      jusquAu: c.dernier,
      matchs: c.matchs,
      signature: signatureLigue(league, c),
      profil: reperes ? profilDuChampionnat(reperes.all(league)) : null,
      tete,
      table: principale ? { nom: principale.table_name, saison: principale.season, luLe: principale.fetched_at } : null,
      carnet: carnetDuChampionnat(parChampionnat, league),
      lecons: leconsDuDossier(
        lecons.filter((l) => l.league === league),
        cleLigue,
        etats,
        regles
      ),
      sources: { reperes: 'repères du championnat (étape 15)', classementLuLe: principale?.fetched_at ?? null, carnetDu: carnet?.calculeLe ?? null }
    };
    yield 'dossier d’un championnat';
  }

  const confirmees = [...etats.values()].filter((e) => e.etat === 'confirmee').length;
  const retirees = [...etats.values()].filter((e) => ETATS_RETIRES.includes(e.etat)).length;
  const bilan = {
    le: new Date(maintenant).toISOString(),
    // premier : jamais calculé ; complet : tout refait (au clic « tout refaire », ou fichier d'une autre forme) ;
    // nuit : seulement ceux qui ont joué ; rien : personne n'a joué depuis.
    mode: !precedent?.calculeLe ? 'premier' : refaireTout ? 'complet' : aRefaire.length || liguesARefaire.length ? 'nuit' : 'rien',
    clubs: { actifs: clubsActifs.length, refaits: aRefaire.length, gardes: Object.keys(equipes).length - aRefaire.length },
    championnats: { actifs: liguesActives.length, refaits: liguesARefaire.length },
    sourcesDesMatchs,
    lecons: { ...bilanLecons, confirmees, retirees },
    analyses: liste.length,
    cas: lesCas.length,
    calculMs: Math.round(performance.now() - debut)
  };
  const donnees = {
    version: VERSION_DOSSIERS,
    calculeLe: new Date(maintenant).toISOString(),
    regles,
    provenance: PROVENANCE_DOSSIERS,
    equipes,
    championnats,
    lecons: Object.fromEntries([...etats].sort(([a], [b]) => a.localeCompare(b))),
    bilan
  };
  return { donnees, bilan };
}

// ============================================================ avant chaque analyse

/**
 * Les IDENTIFIANTS FotMob des deux clubs d'un match à analyser, côté par côté, comme le carnet (étape 21) : la
 * composition lue pour l'analyse (page FotMob du match, ou dernière feuille du club), le gel des pronostics de ce
 * match (engine_picks), l'annuaire strict (clubDuMagasin : même compétition, jamais une ressemblance approximative).
 * Deux sources qui donnent deux clubs différents : AUCUN identifiant (jamais un dossier au hasard) ; aucune source :
 * aucun non plus. Jamais le rapprocheur de noms souple (« Port » / « Porto », les « Nacional »). Ne lève jamais.
 * @returns {{ home: { id, raison, sources }, away: { id, raison, sources } }}
 */
export function identifiantsPourLaMemoire({ matchId = null, home, away, league = null, compo = null, database = null, annuaire = null } = {}) {
  const sources = { home: [], away: [] };
  const id = (x) => (typeof x === 'string' && /^fotmob-\d+$/.test(x.trim()) ? x.trim() : null);
  if (compo) {
    sources.home.push(['composition', id(compo.home?.teamId)]);
    sources.away.push(['composition', id(compo.away?.teamId)]);
  }
  let db = database;
  try {
    db ??= openDb();
    if (matchId) {
      for (const g of db.prepare('SELECT DISTINCT home_id AS home, away_id AS away FROM engine_picks WHERE match_id = ? AND home_id IS NOT NULL AND away_id IS NOT NULL').all(String(matchId))) {
        sources.home.push(['gel', id(g.home)]);
        sources.away.push(['gel', id(g.away)]);
      }
    }
  } catch {
    // Base ou table absente : les autres sources décident.
  }
  try {
    const resoudre = annuaire ?? ((nom) => (db ? clubDuMagasin(nom, league, db) : null));
    sources.home.push(['annuaire', id(resoudre(home))]);
    sources.away.push(['annuaire', id(resoudre(away))]);
  } catch {
    // Annuaire illisible : les autres sources décident.
  }
  const cote = (liste) => {
    const connus = liste.filter(([, x]) => x);
    if (!connus.length) return { id: null, raison: 'club sans identifiant FotMob sûr (ni composition, ni gel, ni annuaire)', sources: [] };
    if (new Set(connus.map(([, x]) => x)).size > 1) return { id: null, raison: 'deux sources donnent deux clubs différents : aucun dossier pris au hasard', sources: connus.map(([s, x]) => `${s}:${x}`) };
    return { id: connus[0][1], raison: null, sources: [...new Set(connus.map(([s]) => s))] };
  };
  const h = cote(sources.home);
  const a = cote(sources.away);
  if (h.id && h.id === a.id) {
    const raison = 'les deux équipes donnent le même club : aucun dossier pris au hasard';
    return { home: { id: null, raison, sources: h.sources }, away: { id: null, raison, sources: a.sources } };
  }
  return { home: h, away: a };
}

/**
 * LA MÉMOIRE REMISE À L'IA pour un match (fiche compacte de l'avant-match) : les dossiers des deux clubs (par
 * identifiant) et du championnat, et le texte de 300 à 500 mots (aiMemory.texteDesDossiersPourIA). `context` : celui
 * de l'analyse (forme du magasin déjà donnée ?) ; `compo` : la composition lue (absents de CE match déjà donnés ?).
 * null quand le fichier des dossiers n'est pas LU (absent, illisible, autre forme) : la fiche d'avant, à l'octet.
 * Ne lève jamais.
 */
export function memoireDuMatch({ matchId = null, home, away, league = null, compo = null, context = null, fichier = FICHIER_DOSSIERS, database = null, annuaire = null } = {}) {
  try {
    const { etat } = lireLesDossiers({ fichier });
    if (etat !== 'lu') return null;
    const ids = identifiantsPourLaMemoire({ matchId, home, away, league, compo, database, annuaire });
    const d = dossiersPour({ homeId: ids.home.id, awayId: ids.away.id, league, fichier });
    if (d.etat !== 'lu') return null;
    const absentsConnus = (cote) => Array.isArray(compo?.[cote]?.unavailable) || Array.isArray(context?.teamNews?.[cote]?.longTermAbsences);
    const formeConnue = (cote) => context?.[`${cote}Form`]?.source === 'FotMob (magasin)';
    const raison = (cote, dossier) => (dossier ? null : ids[cote].id ? 'pas encore de dossier pour ce club (aucun match relevé dans l’année)' : ids[cote].raison);
    const t = texteDesDossiersPourIA({
      equipes: {
        home: { nom: home, club: ids.home.id, dossier: d.home, raison: raison('home', d.home) },
        away: { nom: away, club: ids.away.id, dossier: d.away, raison: raison('away', d.away) }
      },
      championnat: { league, dossier: d.championnat },
      contexte: { absentsConnus: { home: absentsConnus('home'), away: absentsConnus('away') }, formeConnue: { home: formeConnue('home'), away: formeConnue('away') } }
    });
    return {
      ...t,
      calculeLe: d.calculeLe,
      equipes: { home: { id: ids.home.id, raison: ids.home.raison, sources: ids.home.sources, dossier: Boolean(d.home) }, away: { id: ids.away.id, raison: ids.away.raison, sources: ids.away.sources, dossier: Boolean(d.away) } },
      championnat: { league, dossier: Boolean(d.championnat) }
    };
  } catch {
    return null;
  }
}

/** Le calcul d'une traite (scripts, essais) : { donnees, bilan }. N'écrit rien. */
export function calculerLesDossiers(options = {}) {
  return executerSansPause(travailDesDossiers(options));
}

/**
 * L'ÉTAPE DE LA NUIT : le fichier lu (illisible : rien n'est fait, il n'est jamais écrasé), le travail en rendant la
 * main, puis l'écriture d'un bloc. Rend { bilan, octets, dureeMs, blocMaxMs, mode }.
 */
export async function calculerEtEcrireLesDossiers({ database = openDb(), maintenant = Date.now(), pauses = creerPauses(), fichier = FICHIER_DOSSIERS, analyses = null, cas = null, carnet = undefined, force = false } = {}) {
  const debut = performance.now();
  const lu = lireLesDossiers({ fichier });
  if (lu.etat === 'illisible') throw new DossiersIllisibles(lu.erreur);
  const carnetLu = carnet === undefined ? lireLeCarnet().carnet : carnet;
  const { donnees, bilan } = await executerEnRendantLaMain(
    travailDesDossiers({ database, precedent: structuredClone(lu.donnees), analyses, cas, carnet: carnetLu, maintenant, force }),
    pauses.siLongtemps
  );
  const { octets } = ecrireLesDossiers(donnees, { fichier });
  const b = pauses.bilan();
  return { bilan, octets, dureeMs: Math.round(performance.now() - debut), blocMaxMs: b.blocMaxMs, blocMaxOu: b.blocMaxOu, mode: bilan.mode };
}
