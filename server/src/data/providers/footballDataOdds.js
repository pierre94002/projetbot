/**
 * footballDataOdds.js
 * -----------------------------------------------------------------------
 * Cotes d'avant-match des rencontres PASSÉES, pour le profilage de cotes.
 *
 * FotMob ne publie aucune cote : son bloc « oddspoll » n'est qu'un sondage
 * d'internautes. The Odds API ne donne l'historique que sur un forfait
 * payant. football-data.co.uk publie gratuitement, en CSV, les cotes du
 * marché pour 33 des championnats suivis :
 *   - un fichier par saison pour les 18 championnats européens principaux
 *     (cotes moyennes du marché, de clôture et d'avant-match, 1X2 et plus
 *     ou moins 2,5 buts) ;
 *   - un fichier par pays, toutes saisons, pour 15 autres (Norvège, Suède,
 *     MLS…) : cotes de clôture 1X2 seulement.
 *
 * Le RÉSULTAT reste celui de FotMob : chaque ligne du CSV est rattachée à
 * une rencontre du magasin, et seule sa cote est gardée (table match_odds).
 * Le rattachement n'emploie AUCUNE ressemblance de nom — « Port »,
 * « Portsmouth » et « Porto » ont déjà trompé le projet. Chaque nom du CSV
 * est traduit en identifiant de club par VOTE, sur les rencontres que la
 * date et le score désignent sans ambiguïté ; chaque ligne est ensuite
 * retrouvée par identifiants et date, et son score vérifié. Une ligne dont
 * le score diffère de celui de FotMob n'est pas gardée.
 *
 * Depuis le 04/10/2026, le module sert AUSSI la collecte des cotes gratuites
 * (odds_quotes, cf. freeOdds.js et oddsQuotesRepository.js) : quotesFromRow
 * rend TOUTES les cotes utiles d'une ligne (pré-clôture et clôture, 1X2,
 * plus/moins 2,5, handicap asiatique, cinq bookmakers), backfillQuotes relit
 * les fichiers pour les rencontres jouées, collectFixturesCsv lit
 * fixtures.csv pour les matchs à venir. Ces fonctions RENDENT des cotes et
 * n'écrivent jamais en base (c'est l'orchestrateur qui écrit). Le profilage
 * (match_odds, importOddsHistory, refreshCurrentOdds) reste tel quel.
 *
 * Source : https://www.football-data.co.uk — réutilisation libre pour un
 * usage personnel. Le site refuse les requêtes sans en-tête de navigateur.
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { deposerDansLeCache } from './footballDataCache.js';

export const SOURCE = 'football-data.co.uk';
const BASE = 'https://www.football-data.co.uk';
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
/** Le magasin commence en janvier 2023 : rien avant ne peut être rattaché. */
const DEPUIS = '2023-01-01';

/** Un fichier par saison : code football-data -> compétition du magasin. */
export const FD_SAISONNIERS = {
  E0: 'EPL',
  E1: 'Championship',
  E2: 'League 1',
  E3: 'League 2',
  SC0: 'Premiership - Scotland',
  D1: 'Bundesliga - Germany',
  D2: 'Bundesliga 2 - Germany',
  I1: 'Serie A - Italy',
  I2: 'Serie B - Italy',
  SP1: 'La Liga - Spain',
  SP2: 'La Liga 2 - Spain',
  F1: 'Ligue 1 - France',
  F2: 'Ligue 2 - France',
  N1: 'Dutch Eredivisie',
  B1: 'Belgium First Div',
  P1: 'Primeira Liga - Portugal',
  T1: 'Turkey Super League',
  G1: 'Super League - Greece'
};

/** Un fichier par pays, toutes saisons confondues. */
export const FD_PAYS = {
  ARG: 'Primera División - Argentina',
  AUT: 'Austrian Football Bundesliga',
  BRA: 'Brazil Série A',
  CHN: 'Super League - China',
  DNK: 'Denmark Superliga',
  FIN: 'Veikkausliiga - Finland',
  IRL: 'League of Ireland',
  MEX: 'Liga MX',
  NOR: 'Eliteserien - Norway',
  POL: 'Ekstraklasa - Poland',
  ROU: 'Superliga - Romania',
  RUS: 'Premier League - Russia',
  SWE: 'Allsvenskan - Sweden',
  SWZ: 'Swiss Superleague',
  USA: 'MLS'
};

/** Compétitions du magasin qui ont un historique de cotes. */
export const LIGUES_AVEC_COTES = new Set([...Object.values(FD_SAISONNIERS), ...Object.values(FD_PAYS)]);

/**
 * Cotes 1X2 retenues, par ordre de préférence. La moyenne du marché à la
 * clôture est la plus proche de ce qu'affiche l'appli (moyenne des
 * bookmakers de The Odds API) ; les autres ne servent qu'en secours.
 */
const TRIPLETS = [
  ['moyenne clôture', 'AvgCH', 'AvgCD', 'AvgCA'],
  ['moyenne', 'AvgH', 'AvgD', 'AvgA'],
  ['Pinnacle clôture', 'PSCH', 'PSCD', 'PSCA'],
  ['Pinnacle', 'PSH', 'PSD', 'PSA'],
  ['Bet365 clôture', 'B365CH', 'B365CD', 'B365CA'],
  ['Bet365', 'B365H', 'B365D', 'B365A']
];
const PLUS_MOINS = [
  ['AvgC>2.5', 'AvgC<2.5'],
  ['Avg>2.5', 'Avg<2.5'],
  ['PC>2.5', 'PC<2.5'],
  ['P>2.5', 'P<2.5'],
  ['B365C>2.5', 'B365C<2.5'],
  ['B365>2.5', 'B365<2.5']
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cote = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 1 ? n : null;
};
const entier = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/** Code de saison football-data (« 2526 ») de la saison juillet-juin en cours. */
export function saisonCourante(aujourdhui = new Date()) {
  const annee = aujourdhui.getUTCFullYear();
  const debut = aujourdhui.getUTCMonth() >= 6 ? annee : annee - 1;
  return `${String(debut).slice(2)}${String(debut + 1).slice(2)}`;
}

/** Saisons juillet-juin couvertes par le magasin, jusqu'à la courante. */
export function saisonsDuMagasin(aujourdhui = new Date()) {
  const fin = Number(saisonCourante(aujourdhui).slice(0, 2));
  const codes = [];
  for (let debut = 23; debut <= fin; debut++) codes.push(`${debut}${debut + 1}`);
  return codes;
}

async function telecharger(url, { database = null } = {}) {
  let derniere = null;
  for (let essai = 0; essai < 3; essai++) {
    if (essai) await sleep(1500 * essai);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/csv,text/plain,*/*' } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // Les octets bruts partent aussi dans le cache des fichiers football-data
      // (footballDataCache.js), que l'historique (étape 13 du plan) relit sans
      // les retélécharger. Le texte rendu est exactement celui de r.text() :
      // décodage UTF-8, BOM retiré, octet invalide remplacé.
      const octets = Buffer.from(await r.arrayBuffer());
      deposerDansLeCache(url, octets, { database, version: r.headers?.get?.('last-modified') ?? null });
      return new TextDecoder('utf-8').decode(octets);
    } catch (e) {
      derniere = e;
    }
  }
  throw derniere;
}

/** CSV simple : les fichiers de football-data n'ont pas de virgule citée. */
export function lireCsv(texte) {
  const lignes = texte.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lignes.length) return [];
  const entetes = lignes[0].split(',').map((h) => h.trim());
  return lignes.slice(1).map((l) => {
    const valeurs = l.split(',');
    return Object.fromEntries(entetes.map((h, i) => [h, (valeurs[i] ?? '').trim()]));
  });
}

/** « 15/08/2025 » ou « 15/08/25 » -> « 2025-08-15 ». */
export function dateIso(texte) {
  const m = String(texte ?? '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const annee = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${annee}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function cotesDe(ligne) {
  for (const [basis, h, d, a] of TRIPLETS) {
    const home = cote(ligne[h]);
    const away = cote(ligne[a]);
    if (home && away) {
      const [plus, moins] = PLUS_MOINS.map(([o, u]) => [cote(ligne[o]), cote(ligne[u])]).find(([o, u]) => o && u) ?? [null, null];
      return { basis, home, draw: cote(ligne[d]), away, over25: plus, under25: moins };
    }
  }
  return null;
}

/**
 * Lignes jouées et cotées d'un fichier, dans un format commun.
 *
 * `garderBrute` (backfillQuotes) : chaque ligne garde en plus sa ligne de
 * CSV brute (`brute`, d'où quotesFromRow tire toutes les cotes), et les
 * lignes jouées SANS cote sont gardées aussi (odds null) : elles votent pour
 * la traduction des noms et se comptent parmi les rencontres « sans cote ».
 * Sans l'option, la sortie est exactement celle du profilage.
 */
function normaliser(brutes, { garderBrute = false } = {}) {
  const sortie = [];
  for (const b of brutes) {
    const date = dateIso(b.Date);
    const home = b.HomeTeam ?? b.Home;
    const away = b.AwayTeam ?? b.Away;
    const hg = entier(b.FTHG ?? b.HG);
    const ag = entier(b.FTAG ?? b.AG);
    const odds = cotesDe(b);
    if (!date || date < DEPUIS || !home || !away || hg === null || ag === null || (!odds && !garderBrute)) continue;
    sortie.push(garderBrute ? { date, home, away, hg, ag, odds, brute: b } : { date, home, away, hg, ag, odds });
  }
  return sortie;
}

const decaler = (iso, jours) => new Date(Date.parse(`${iso}T00:00:00Z`) + jours * 86_400_000).toISOString().slice(0, 10);
const ecartJours = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/* -----------------------------------------------------------------------
 * LE VOTE, en trois morceaux réutilisables (06/10/2026, étape 13 du plan :
 * l'historique football-data depuis 2000 traduit ses noms de clubs par la
 * MÊME règle que le profilage, sans la recopier). Jamais une ressemblance de
 * nom : seuls le jour et le score désignent une rencontre.
 * --------------------------------------------------------------------- */

/** Les rencontres du magasin rangées par jour : `autour(jour, n)` rend celles de jour ± n jours. */
export function rencontresParJour(rencontres) {
  const parDate = new Map();
  for (const m of rencontres) {
    if (!parDate.has(m.date)) parDate.set(m.date, []);
    parDate.get(m.date).push(m);
  }
  return (date, jours) => {
    const liste = [];
    for (let k = -jours; k <= jours; k++) liste.push(...(parDate.get(decaler(date, k)) ?? []));
    return liste;
  };
}

/**
 * 1. Votes : une ligne dont le jour (± 1) et le score désignent UNE SEULE
 *    rencontre du magasin dit quel club porte chacun de ses deux noms.
 *    `lignes` : [{ date, home, away, hg, ag }] — `home`/`away` sont le nom chez
 *    la source, ou toute clé stable de ce nom. `votes` (facultatif) : les votes
 *    déjà comptés ailleurs (autre fichier, autre championnat du même pays),
 *    complétés ici. Rend la Map nom -> Map(identifiant -> votes).
 */
export function voterParDateEtScore(lignes, autour, votes = new Map()) {
  const voter = (nom, id) => {
    const v = votes.get(nom) ?? new Map();
    v.set(id, (v.get(id) ?? 0) + 1);
    votes.set(nom, v);
  };
  for (const l of lignes) {
    const candidates = autour(l.date, 1).filter((m) => m.home_goals === l.hg && m.away_goals === l.ag);
    if (candidates.length === 1) {
      voter(l.home, candidates[0].home_id);
      voter(l.away, candidates[0].away_id);
    }
  }
  return votes;
}

/** 2. Traduction : majorité nette (60 % des votes du nom), sur au moins deux votes. Rend la Map nom -> identifiant. */
export function traduireLesVotes(votes, { minimum = 2, majorite = 0.6 } = {}) {
  const idDe = new Map();
  for (const [nom, v] of votes) {
    const tri = [...v.entries()].sort((a, b) => b[1] - a[1]);
    const total = tri.reduce((s, [, n]) => s + n, 0);
    if (tri[0][1] >= minimum && tri[0][1] / total >= majorite) idDe.set(nom, tri[0][0]);
  }
  return idDe;
}

/**
 * 3. Rattachement par identifiants : la rencontre du magasin qui oppose les
 *    deux clubs traduits, dans le même sens, au jour le plus proche à trois
 *    jours près (matchs reportés), jamais deux fois la même ; score vérifié.
 *    Rend, ligne par ligne, { ligne, etat, homeId, awayId, rencontre } — etat :
 *    'non-traduit' (un nom sans identifiant), 'introuvable' (pas de rencontre
 *    de ces deux clubs), 'score-different' (la rencontre désignée n'a pas le
 *    même score : elle est rendue, pour qu'on puisse dire laquelle) ou
 *    'rattachee'.
 */
export function rattacherParIdentifiants(lignes, idDe, autour) {
  const pris = new Set();
  return lignes.map((l) => {
    const h = idDe.get(l.home) ?? null;
    const a = idDe.get(l.away) ?? null;
    if (!h || !a) return { ligne: l, etat: 'non-traduit', homeId: h, awayId: a, rencontre: null };
    const rencontre = autour(l.date, 3)
      .filter((m) => m.home_id === h && m.away_id === a && !pris.has(m.match_key))
      .sort((x, y) => ecartJours(x.date, l.date) - ecartJours(y.date, l.date))[0];
    if (!rencontre) return { ligne: l, etat: 'introuvable', homeId: h, awayId: a, rencontre: null };
    if (rencontre.home_goals !== l.hg || rencontre.away_goals !== l.ag) return { ligne: l, etat: 'score-different', homeId: h, awayId: a, rencontre };
    pris.add(rencontre.match_key);
    return { ligne: l, etat: 'rattachee', homeId: h, awayId: a, rencontre };
  });
}

/** Un écart de score, consultable (étape 14 du plan) : la ligne de la source, la rencontre FotMob désignée et les deux scores. */
export function ecartDeScore(league, ligne, rencontre) {
  return {
    league,
    date: ligne.date,
    home: ligne.home,
    away: ligne.away,
    scoreSource: `${ligne.hg}-${ligne.ag}`,
    matchKey: rencontre.match_key,
    dateMagasin: rencontre.date,
    scoreMagasin: `${rencontre.home_goals}-${rencontre.away_goals}`
  };
}

/**
 * Rattache des lignes de CSV aux rencontres d'une compétition du magasin.
 * Renvoie les rattachements et le bilan, sans rien écrire. Le bilan garde,
 * en plus du nombre, la LISTE des écarts de score (ecarts : la ligne, la
 * rencontre FotMob et les deux scores) — avant le 06/10/2026, un nombre seul.
 */
export function rattacher(toutes, league, { database = openDb() } = {}) {
  // Seulement la période que le magasin couvre pour cette compétition : un
  // fichier par pays remonte à 2012, et les championnats juillet-juin
  // n'ont en magasin que les saisons commencées en juillet 2023.
  const premier = database.prepare('SELECT MIN(date) d FROM matches WHERE league = ?').get(league)?.d ?? null;
  const lignes = premier ? toutes.filter((l) => l.date >= decaler(premier, -1)) : [];
  const bilan = { league, lignes: lignes.length, rattachees: 0, sansRencontre: 0, scoreDifferent: 0, nomsNonTraduits: [], ecarts: [] };
  if (!lignes.length) return { rattachements: [], bilan };
  const dates = lignes.map((l) => l.date).sort();
  const magasin = database
    .prepare(`SELECT match_key, date, home_id, away_id, home_goals, away_goals FROM matches
              WHERE league = ? AND date >= ? AND date <= ? AND home_id IS NOT NULL AND away_id IS NOT NULL`)
    .all(league, decaler(dates[0], -3), decaler(dates.at(-1), 3));
  const autour = rencontresParJour(magasin);

  // 1-2. Votes (jour et score), puis traduction à la majorité nette.
  const idDe = traduireLesVotes(voterParDateEtScore(lignes, autour));
  const nonTraduits = new Set();

  // 3. Rattachement par identifiants, date la plus proche à trois jours
  //    près (matchs reportés), score vérifié.
  const rattachements = [];
  for (const r of rattacherParIdentifiants(lignes, idDe, autour)) {
    const l = r.ligne;
    if (!r.homeId) nonTraduits.add(l.home);
    if (!r.awayId) nonTraduits.add(l.away);
    if (r.etat === 'non-traduit' || r.etat === 'introuvable') {
      bilan.sansRencontre++;
      continue;
    }
    if (r.etat === 'score-different') {
      bilan.scoreDifferent++;
      bilan.ecarts.push(ecartDeScore(league, l, r.rencontre));
      continue;
    }
    rattachements.push({ matchKey: r.rencontre.match_key, odds: l.odds });
  }
  bilan.rattachees = rattachements.length;
  bilan.nomsNonTraduits = [...nonTraduits].sort();
  return { rattachements, bilan };
}

function ecrire(rattachements, database) {
  const maintenant = new Date().toISOString();
  const ins = database.prepare(`
    INSERT INTO match_odds (match_key, source, basis, home, draw, away, over25, under25, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(match_key) DO UPDATE SET source = excluded.source, basis = excluded.basis, home = excluded.home,
      draw = excluded.draw, away = excluded.away, over25 = excluded.over25, under25 = excluded.under25,
      fetched_at = excluded.fetched_at`);
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const { matchKey, odds } of rattachements) {
      ins.run(matchKey, SOURCE, odds.basis, odds.home, odds.draw, odds.away, odds.over25, odds.under25, maintenant);
    }
    database.exec('COMMIT');
  } catch (e) {
    database.exec('ROLLBACK');
    throw e;
  }
}

/**
 * Télécharge, rattache et (si `apply`) enregistre les cotes passées.
 *
 * `codes` restreint aux fichiers voulus (« E0 », « NOR »…), `saisons` aux
 * saisons juillet-juin voulues (« 2526 »…) ; par défaut, tout ce que le
 * magasin peut recevoir.
 */
export async function importOddsHistory({ codes = null, saisons = null, apply = false, database = openDb(), log = () => {} } = {}) {
  const voulus = (code) => !codes || codes.includes(code);
  const listeSaisons = saisons ?? saisonsDuMagasin();
  const bilans = [];
  const fichiers = [
    ...Object.keys(FD_SAISONNIERS).filter(voulus).map((code) => ({ code, league: FD_SAISONNIERS[code], urls: listeSaisons.map((s) => `${BASE}/mmz4281/${s}/${code}.csv`) })),
    ...Object.keys(FD_PAYS).filter(voulus).map((code) => ({ code, league: FD_PAYS[code], urls: [`${BASE}/new/${code}.csv`] }))
  ];
  for (const { code, league, urls } of fichiers) {
    const lignes = [];
    let absents = 0;
    const erreurs = [];
    for (const url of urls) {
      // Un fichier en échec (après les nouvelles tentatives de telecharger)
      // n'arrête plus les suivants : il est noté et la passe continue.
      let texte = null;
      try {
        texte = await telecharger(url, { database });
      } catch (error) {
        erreurs.push(`${url.split('/').slice(-2).join('/')} : ${error.message}`);
      }
      await sleep(500);
      if (!texte) {
        if (!erreurs.length) absents++;
        continue;
      }
      lignes.push(...normaliser(lireCsv(texte)));
    }
    let complet;
    try {
      const { rattachements, bilan } = rattacher(lignes, league, { database });
      if (apply && rattachements.length) ecrire(rattachements, database);
      complet = { code, league, ...bilan, fichiersAbsents: absents, erreurs };
    } catch (error) {
      complet = { code, league, lignes: lignes.length, rattachees: 0, sansRencontre: 0, scoreDifferent: 0, ecarts: [], fichiersAbsents: absents, erreurs: [...erreurs, error.message] };
    }
    bilans.push(complet);
    log(complet);
  }
  return {
    applied: apply,
    leagues: bilans.length,
    rows: bilans.reduce((n, b) => n + (b.lignes ?? 0), 0),
    linked: bilans.reduce((n, b) => n + (b.rattachees ?? 0), 0),
    unlinked: bilans.reduce((n, b) => n + (b.sansRencontre ?? 0), 0),
    scoreMismatch: bilans.reduce((n, b) => n + (b.scoreDifferent ?? 0), 0),
    // Les écarts eux-mêmes (rencontre, deux scores), pas seulement leur nombre.
    scoreMismatches: bilans.flatMap((b) => b.ecarts ?? []),
    failedFiles: bilans.flatMap((b) => b.erreurs ?? []),
    details: bilans
  };
}

/** Écarts de score gardés dans le bilan d'une passe (la liste complète vit dans l'historique football-data, fd_history). */
const ECARTS_DANS_LE_BILAN = 100;

/**
 * Passe quotidienne : la saison en cours des championnats saisonniers et
 * les fichiers par pays, que football-data met à jour deux fois par
 * semaine. Au plus une fois toutes les douze heures par processus.
 */
let derniereMaj = 0;
const DOUZE_HEURES = 12 * 3_600_000;
export async function refreshCurrentOdds({ database = openDb(), force = false } = {}) {
  if (!force && Date.now() - derniereMaj < DOUZE_HEURES) return { skipped: true };
  derniereMaj = Date.now();
  // La saison précédente aussi : en début de saison, trop peu de matchs
  // joués pour que le vote traduise chaque nom, surtout celui d'un promu.
  const courante = saisonCourante();
  const debut = Number(courante.slice(0, 2));
  const precedente = `${debut - 1}${debut}`;
  const r = await importOddsHistory({ saisons: [precedente, courante], apply: true, database });
  return {
    linked: r.linked,
    rows: r.rows,
    unlinked: r.unlinked,
    scoreMismatch: r.scoreMismatch,
    // Lesquels (étape 13 du plan, pour le contrôle de l'étape 14) : la ligne,
    // la rencontre FotMob et les deux scores ; les premiers seulement ici.
    scoreMismatches: r.scoreMismatches.slice(0, ECARTS_DANS_LE_BILAN),
    failedFiles: r.failedFiles,
    // Les championnats où le rattachement coince (noms non traduits, fichier
    // figé à la source) : ce que le bilan jetait autrefois.
    weakLeagues: r.details
      .filter((b) => (b.lignes ?? 0) > 0 && (b.rattachees ?? 0) / b.lignes < 0.8)
      .map((b) => ({ code: b.code, league: b.league, rows: b.lignes, linked: b.rattachees }))
  };
}

/* =======================================================================
 * TOUTES LES COTES DES FICHIERS, POUR odds_quotes (04/10/2026)
 * =======================================================================
 * Le profilage ci-dessus ne garde qu'un triplet par rencontre. La collecte
 * des cotes gratuites (freeOdds.js) veut tout ce que les fichiers donnent
 * d'utile au calcul de probabilité, chaque valeur avec sa provenance.
 *
 * Les colonnes (notes.txt de football-data) :
 *   <P>H, <P>D, <P>A       1X2 de PRÉ-CLÔTURE du bookmaker P ;
 *   <P>CH, <P>CD, <P>CA    le même à la CLÔTURE (un « C » après le préfixe) ;
 *   <P>>2.5, <P><2.5       plus/moins 2,5 buts (clôture : <P>C>2.5, <P>C<2.5) ;
 *   AHh, <P>AHH, <P>AHA    handicap asiatique : la ligne du MARCHÉ, côté
 *                          domicile, et les cotes domicile/extérieur à cette
 *                          ligne (clôture : AHCh, <P>CAHH, <P>CAHA).
 * La pré-clôture est relevée le vendredi après-midi pour le week-end, le
 * mardi pour la semaine (« not later than 17:00 / 13:00 British time »,
 * page matches.php) ; la clôture, au plus près du coup d'envoi, n'est
 * publiée qu'APRÈS le match, dans les fichiers de saison que le site met à
 * jour deux fois par semaine. Les fichiers par pays (new/XXX.csv) n'ont que
 * la clôture 1X2.
 *
 * Heures : la colonne Time est l'heure BRITANNIQUE (vérifié le 04/10/2026
 * sur le magasin : « 08/09/2026 00:00 » Vitória-Grêmio = coup d'envoi
 * FotMob 2026-09-07T23:00Z). Le jour d'une cote (`date`) est le jour UTC du
 * coup d'envoi, comme au magasin. L'identifiant de la rencontre chez la
 * source garde, lui, la date ÉCRITE dans le fichier, la même dans
 * fixtures.csv et dans le fichier de saison : la pré-clôture relevée avant
 * le match et la clôture publiée après tombent sur la même rencontre.
 *
 * Horodatage (`releveAt`) : le fichier ne dit pas l'heure du relevé.
 *   - pré-clôture d'un fichier de saison : la veille du match à 12:00 UTC
 *     (convention ; le relevé réel date du vendredi ou du mardi) ;
 *   - pré-clôture de fixtures.csv : l'heure de mise en ligne du fichier
 *     (en-tête Last-Modified), la seule date vraie que l'on ait ;
 *   - clôture : le coup d'envoi quand l'heure est connue — la dater de midi
 *     ferait croire au moteur qu'elle existait avant un match du soir —,
 *     sinon le jour du match à 12:00 UTC.
 * Handicap asiatique : `line` = la ligne côté domicile pour les DEUX
 * sélections (l'extérieur joue l'opposé) ; ainsi les deux côtés d'un même
 * marché partagent la clé (market, line) sous laquelle le dépôt les regroupe.
 */

/** Les matchs à venir des 22 divisions principales, avec leur pré-clôture. */
const FIXTURES_URL = `${BASE}/fixtures.csv`;
/** Délai d'une requête, et écart minimal entre deux requêtes de ce module (règle commune des sources gratuites). */
const DELAI_MS = 20_000;
const ECART_MS = 500;
/**
 * Un fichier qui grossit encore (saison en cours, fichier par pays) est
 * relu au plus toutes les 12 heures, en requête conditionnelle : le site le
 * met à jour deux fois par semaine, et oddsWatch rappelle le rattrapage
 * toutes les cinq minutes.
 */
const RELECTURE_MS = 12 * 3_600_000;
/** fixtures.csv : au plus une lecture par demi-heure (mis en ligne le vendredi et le mardi). */
const FIXTURES_RELECTURE_MS = 30 * 60_000;

/**
 * Les bookmakers des fichiers : nom affiché (stable) et préfixes de
 * colonne, le préféré d'abord (Pinnacle : PS pour le 1X2, P pour ses totaux
 * et son handicap ; Sky Bet : SKB depuis 2026-27, SK avant). `actif` : rendu
 * en cotes. Le 04/10/2026, la base pesant déjà 1,6 Go, seuls cinq livres
 * sont gardés : la moyenne et le maximum du marché, la bourse Betfair (sans
 * marge), Pinnacle (la référence des marchés serrés) et Bet365. Les autres
 * restent listés : passer `actif` à true suffit à les ajouter.
 *
 * BF (Betfair Sportsbook, anciennes saisons : BFH/BFD/BFA) et BFD (Betfred :
 * BFDH/BFDD/BFDA) se confondent si l'on découpe un nom de colonne au jugé :
 * la colonne « BFD » est le nul de Betfair, pas un préfixe. D'où la lecture
 * par noms de colonnes COMPLETS (planDesColonnes).
 */
export const LIVRES_FD = [
  { nom: 'Moyenne du marché', prefixes: ['Avg'], actif: true },
  { nom: 'Maximum du marché', prefixes: ['Max'], actif: true },
  { nom: 'Betfair Exchange', prefixes: ['BFE'], actif: true },
  { nom: 'Pinnacle', prefixes: ['PS', 'P'], actif: true },
  { nom: 'Bet365', prefixes: ['B365'], actif: true },
  { nom: 'Betfred', prefixes: ['BFD'], actif: false },
  { nom: 'BetVictor', prefixes: ['BV'], actif: false },
  { nom: 'bwin', prefixes: ['BW'], actif: false },
  { nom: 'Paddy Power', prefixes: ['PP'], actif: false },
  { nom: 'Sky Bet', prefixes: ['SKB', 'SK'], actif: false },
  { nom: 'William Hill', prefixes: ['WH'], actif: false },
  { nom: 'Ladbrokes', prefixes: ['LB'], actif: false },
  { nom: 'Coral', prefixes: ['CL'], actif: false },
  { nom: 'BetMGM', prefixes: ['BMGM'], actif: false },
  { nom: 'Interwetten', prefixes: ['IW'], actif: false },
  { nom: '1xBet', prefixes: ['1XB'], actif: false },
  { nom: 'VC Bet', prefixes: ['VC'], actif: false },
  { nom: 'Gamebookers', prefixes: ['GB'], actif: false },
  { nom: 'Sportingbet', prefixes: ['SB'], actif: false },
  { nom: 'Stan James', prefixes: ['SJ'], actif: false },
  { nom: 'Stanleybet', prefixes: ['SY'], actif: false },
  { nom: 'Blue Square', prefixes: ['BS'], actif: false },
  { nom: 'Sporting Odds', prefixes: ['SO'], actif: false },
  { nom: 'Betfair Sportsbook', prefixes: ['BF'], actif: false }
];

/** Les bookmakers rendus en cotes (contrat des fournisseurs). */
export const BOOKMAKERS = LIVRES_FD.filter((l) => l.actif).map((l) => l.nom);

/**
 * Les compétitions du magasin couvertes (contrat des fournisseurs) :
 * compétition -> code football-data. Les 33 existent au magasin (vérifié le
 * 04/10/2026). Matchs À VENIR : seulement les 18 championnats à fichier
 * saisonnier (fixtures.csv ne liste que les « main leagues ») ; les 15
 * championnats par pays n'ont que la clôture 1X2, publiée après le match.
 *
 * Non couvertes, football-data ne les publiant pas (39 compétitions du
 * magasin) : toutes les coupes nationales (FA Cup, EFL Cup, Coupe de
 * France, Copa del Rey, DFB Pokal, Coppa Italia, KNVB Cup, Coupe de
 * Belgique, Taça de Portugal, Taça da Liga, Türkiye Kupası, Coupe de Grèce,
 * Coupe de Chine, Copa do Brasil, Copa Argentina, Copa Chile, Canadian
 * Championship, US Open Cup, Leagues Cup), les coupes continentales (Ligue
 * des champions, Ligue Europa, Ligue Conférence, Libertadores,
 * Sudamericana) et les championnats d'Islande, de Tchéquie, de Croatie, de
 * Serbie, de Slovaquie, de Lettonie, d'Israël, du Canada, de Colombie, du
 * Pérou, de Bolivie, du Chili, du Venezuela, d'Équateur et du Paraguay. À
 * l'inverse, les divisions que publie football-data sans que le magasin les
 * suive (National League EC, Écosse SC1 à SC3, Japon) sont ignorées.
 */
export const LIGUES = new Map([...Object.entries(FD_SAISONNIERS), ...Object.entries(FD_PAYS)].map(([code, league]) => [league, code]));

/** Ce que la source sait rendre et ce qui lui manque, pour l'affichage des cotes absentes. */
export const COUVERTURE = {
  source: SOURCE,
  nom: 'football-data.co.uk',
  marches: ['1x2', 'ou', 'ah'],
  avantMatch: true,
  live: false,
  historique: 'depuis 2023',
  volumes: false,
  bookmakers: BOOKMAKERS,
  limites: [
    "Avant-match : un seul relevé (vendredi pour le week-end, mardi en semaine), pas de suivi jusqu'au coup d'envoi",
    'Clôture publiée seulement après le match (fichiers mis à jour deux fois par semaine)',
    'Matchs à venir : seulement les 18 championnats européens à fichier saisonnier',
    'Championnats par pays (15) : clôture 1x2 seulement, sans plus/moins ni handicap',
    'Plus/moins : ligne 2,5 seulement ; handicap asiatique : la seule ligne du marché',
    "Pinnacle n'est plus publié depuis 2026",
    'Pas de cote en direct, pas de volume',
    'Un fichier par pays peut rester plusieurs semaines sans mise à jour'
  ]
};

/** Marchés lus : suffixes de colonne par kind (le « C » de la clôture suit le préfixe). */
const MARCHES_FD = [
  { market: '1x2', selections: ['home', 'draw', 'away'], preclose: ['H', 'D', 'A'], close: ['CH', 'CD', 'CA'] },
  { market: 'ou', line: 2.5, selections: ['over', 'under'], preclose: ['>2.5', '<2.5'], close: ['C>2.5', 'C<2.5'] },
  { market: 'ah', selections: ['home', 'away'], preclose: ['AHH', 'AHA'], close: ['CAHH', 'CAHA'], ligne: { preclose: 'AHh', close: 'AHCh' } }
];
const KINDS_FD = ['preclose', 'close'];

const arrondi = (n) => Math.round(n * 1000) / 1000;
const midiUtc = (jour, decalage) => `${decaler(jour, decalage)}T12:00:00.000Z`;
const evenementDe = (code, date, home, away) => `${code}:${date}:${home}:${away}`;

/** Jour du mois du dernier dimanche d'un mois (1-12). */
function dernierDimanche(annee, mois) {
  const fin = new Date(Date.UTC(annee, mois, 0));
  return fin.getUTCDate() - fin.getUTCDay();
}

/**
 * Heure britannique d'un jour -> instant UTC (ISO), ou null. L'heure d'été
 * (BST, UTC+1) court du dernier dimanche de mars au dernier dimanche
 * d'octobre, à 01:00 UTC ; le reste de l'année, l'heure de Londres est l'UTC.
 * Contrôlé contre la base horaire du système pour chaque demi-heure de 2023
 * à 2027. Deux heures ne se tranchent pas : 01:00-01:59 le dernier dimanche
 * d'octobre existe deux fois (la première, en heure d'été, est retenue ;
 * deux matchs brésiliens du magasin étaient la seconde, une heure plus
 * tard) et n'existe pas le dernier dimanche de mars. Le vote, à ± 1 jour,
 * n'en souffre pas ; seul `kickoff` est alors décalé d'une heure.
 */
export function coupDEnvoiUtc(jour, heure) {
  const h = String(heure ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  const j = String(jour ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!h || !j || Number(h[1]) > 23 || Number(h[2]) > 59) return null;
  const annee = Number(j[1]);
  const local = Date.UTC(annee, Number(j[2]) - 1, Number(j[3]), Number(h[1]), Number(h[2]));
  if (!Number.isFinite(local)) return null;
  const candidat = local - 3_600_000;
  const ete = candidat >= Date.UTC(annee, 2, dernierDimanche(annee, 3), 1) && candidat < Date.UTC(annee, 9, dernierDimanche(annee, 10), 1);
  return new Date(ete ? candidat : local).toISOString();
}

/** Jour écrit dans le fichier, coup d'envoi UTC (si l'heure est donnée) et jour UTC d'une ligne. */
export function momentDe(row) {
  const date = dateIso(row?.Date);
  const kickoff = date ? coupDEnvoiUtc(date, row?.Time) : null;
  return { date, kickoff, jourUtc: kickoff ? kickoff.slice(0, 10) : date };
}

/** URL du fichier d'où vient une ligne, quand l'appelant ne la donne pas. */
function urlDuFichier(code, date) {
  if (FD_PAYS[code]) return `${BASE}/new/${code}.csv`;
  return `${BASE}/mmz4281/${saisonCourante(new Date(`${date}T12:00:00Z`))}/${code}.csv`;
}

/** Ligne de handicap asiatique (multiple de 0,25), ou null : une ligne absente ne se devine pas. */
function ligneHandicap(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= 10 && Math.abs(n * 4 - Math.round(n * 4)) < 1e-9 ? n : null;
}

const plans = new Map();
/**
 * Les jeux de colonnes d'un en-tête : pour chaque bookmaker, marché et kind,
 * les colonnes EXACTES à lire. Un préfixe n'est retenu que si TOUTES ses
 * colonnes (H, D et A pour un 1X2) existent sous leur nom complet ; les
 * préfixes les plus longs passent d'abord, une colonne prise ne l'est
 * qu'une fois, et un bookmaker n'a qu'un jeu par marché et par kind (PS
 * avant P). Rien n'est déduit d'un nom tronqué. En cache par en-tête.
 */
export function planDesColonnes(entetes) {
  const cle = entetes.join(',');
  const connu = plans.get(cle);
  if (connu) return connu;
  const presentes = new Set(entetes);
  const prises = new Set();
  const plan = [];
  const candidats = LIVRES_FD.flatMap((livre) => livre.prefixes.map((prefixe, rang) => ({ livre, prefixe, rang }))).sort(
    (a, b) => b.prefixe.length - a.prefixe.length || a.rang - b.rang
  );
  for (const { livre, prefixe } of candidats) {
    for (const def of MARCHES_FD) {
      for (const kind of KINDS_FD) {
        if (plan.some((p) => p.livre === livre && p.market === def.market && p.kind === kind)) continue;
        const colonnes = def[kind].map((suffixe) => `${prefixe}${suffixe}`);
        if (!colonnes.every((c) => presentes.has(c) && !prises.has(c))) continue;
        const colonneLigne = def.ligne?.[kind] ?? null;
        if (colonneLigne && !presentes.has(colonneLigne)) continue;
        for (const c of colonnes) prises.add(c);
        plan.push({ livre, prefixe, market: def.market, kind, colonnes, selections: def.selections, line: def.line ?? 0, colonneLigne });
      }
    }
  }
  if (plans.size >= 64) plans.clear();
  plans.set(cle, plan);
  return plan;
}

/**
 * Les bookmakers qu'un en-tête de fichier contient, avec le préfixe lu par
 * marché et par kind — pour les sondes et l'écran de provenance.
 */
export function livresDuFichier(entetes) {
  const parLivre = new Map();
  for (const p of planDesColonnes([...(entetes ?? [])].map((h) => String(h).trim()))) {
    const l = parLivre.get(p.livre.nom) ?? { bookmaker: p.livre.nom, actif: p.livre.actif, marches: {} };
    l.marches[p.market] = { ...(l.marches[p.market] ?? {}), [p.kind]: p.prefixe };
    parLivre.set(p.livre.nom, l);
  }
  return [...parLivre.values()];
}

/**
 * Toutes les cotes d'une ligne de CSV football-data, normalisées (forme du
 * commentaire d'en-tête d'oddsQuotesRepository.js) : 1X2, plus/moins 2,5 et
 * handicap asiatique des bookmakers actifs, en pré-clôture (`preclose`,
 * colonnes sans C) et en clôture (`close`, colonnes avec C). Les cases
 * vides et les cotes <= 1 sont ignorées ; un handicap sans ligne aussi.
 *
 * @param {object} row    ligne de lireCsv (clé = nom de colonne)
 * @param {object} o
 * @param {string} o.code     code du fichier (« E0 », « BRA ») : entre dans l'identifiant de la rencontre
 * @param {string} [o.league] compétition du magasin (par défaut, celle du code)
 * @param {string} [o.url]    fichier lu (provenance) ; par défaut, celui du code et de la saison
 * @param {string} [o.releveAt] horodatage de la pré-clôture (fixtures.csv : sa mise en ligne)
 */
export function quotesFromRow(row, { code, league = null, matchKey = null, homeId = null, awayId = null, url = null, releveAt = null } = {}) {
  if (!row || typeof row !== 'object') return [];
  const competition = league ?? FD_SAISONNIERS[code] ?? FD_PAYS[code] ?? null;
  const home = String(row.HomeTeam ?? row.Home ?? '').trim();
  const away = String(row.AwayTeam ?? row.Away ?? '').trim();
  const { date, kickoff, jourUtc } = momentDe(row);
  if (!code || !competition || !date || !home || !away) return [];
  const commun = {
    source: SOURCE,
    sourceEvent: evenementDe(code, date, home, away),
    prob: null,
    volume: null,
    openInterest: null,
    date: jourUtc,
    kickoff,
    league: competition,
    homeId,
    awayId,
    homeName: home,
    awayName: away,
    matchKey,
    provenance: url ?? urlDuFichier(code, date)
  };
  const releve = { preclose: releveAt ?? midiUtc(date, -1), close: kickoff ?? midiUtc(date, 0) };
  const cotes = [];
  for (const p of planDesColonnes(Object.keys(row))) {
    if (!p.livre.actif) continue;
    const line = p.colonneLigne ? ligneHandicap(row[p.colonneLigne]) : p.line;
    if (line === null) continue;
    p.colonnes.forEach((colonne, i) => {
      const prix = cote(row[colonne]);
      if (!prix) return;
      cotes.push({ ...commun, bookmaker: p.livre.nom, market: p.market, selection: p.selections[i], line, price: arrondi(prix), kind: p.kind, releveAt: releve[p.kind] });
    });
  }
  return cotes;
}

/**
 * Jamais deux requêtes de ce module à moins de ECART_MS, même d'un appel à
 * l'autre, ni quand l'actualisation complète et oddsWatch collectent en même
 * temps : les tours passent en file, chacun attend la fin du précédent.
 */
let derniereRequete = 0;
let fileDAttente = Promise.resolve();
function patienter() {
  const tour = fileDAttente.then(async () => {
    const attente = derniereRequete + ECART_MS - Date.now();
    if (attente > 0) await sleep(attente);
    derniereRequete = Date.now();
  });
  fileDAttente = tour.catch(() => {});
  return tour;
}

/** Un fichier de football-data commence par un en-tête qui nomme au moins Date et l'équipe à domicile. */
function estCsvFootballData(texte) {
  const entetes = String(texte ?? '').replace(/^﻿/, '').split(/\r?\n/, 1)[0].split(',').map((h) => h.trim());
  return entetes.includes('Date') && (entetes.includes('HomeTeam') || entetes.includes('Home'));
}

/**
 * Après une panne (réseau, délai, 5xx, refus, réponse inattendue), plus
 * aucune requête de ce module pendant 30 min : oddsWatch repasse toutes les
 * cinq minutes, et chaque compétition due referait sinon trois tentatives.
 */
const PAUSE_APRES_PANNE_MS = 30 * 60_000;
let pauseJusqua = 0;

/**
 * Lit un fichier du site, sans jamais lever : { statut: 200 | 304 | 404 |
 * 'erreur', texte, version (en-tête Last-Modified), requetes, erreur }.
 * `depuis` : version déjà lue (304 si rien n'a changé) ; `essais` : au plus
 * 3 tentatives, attente croissante, délai de 20 s. La redirection du site
 * (www -> sans www) est suivie. `telecharger` reste celle du profilage :
 * importOddsHistory dépend de son comportement exact (sans délai ni
 * version), on ne la touche pas.
 */
async function lireFichier(url, { depuis = null, essais = 3 } = {}) {
  if (Date.now() < pauseJusqua) {
    return { statut: 'erreur', texte: null, version: null, requetes: 0, erreur: `site en panne à la dernière lecture : pause jusqu'à ${new Date(pauseJusqua).toISOString().slice(11, 16)} UTC` };
  }
  const resultat = await lireFichierSansPause(url, { depuis, essais });
  if (resultat.statut === 'erreur') pauseJusqua = Date.now() + PAUSE_APRES_PANNE_MS;
  return resultat;
}

async function lireFichierSansPause(url, { depuis, essais }) {
  let requetes = 0;
  let derniere = null;
  const tentatives = Math.max(1, Math.min(3, Math.floor(essais) || 1));
  for (let essai = 0; essai < tentatives; essai++) {
    if (essai) await sleep(1500 * essai);
    await patienter();
    requetes++;
    const controle = new AbortController();
    const minuterie = setTimeout(() => controle.abort(), DELAI_MS);
    try {
      const entetes = { 'User-Agent': UA, Accept: 'text/csv,text/plain,*/*' };
      if (depuis) entetes['If-Modified-Since'] = depuis;
      const r = await fetch(url, { headers: entetes, redirect: 'follow', signal: controle.signal });
      if (r.status === 304) return { statut: 304, texte: null, version: depuis, requetes };
      if (r.status === 404) return { statut: 404, texte: null, version: null, requetes };
      if (r.status >= 500 || r.status === 429) {
        derniere = new Error(`HTTP ${r.status}`);
        continue;
      }
      if (!r.ok) return { statut: 'erreur', texte: null, version: null, requetes, erreur: `HTTP ${r.status}` };
      const texte = await r.text();
      // Une page de maintenance servie en 200 n'est pas une lecture : notée comme telle, elle ferait
      // sauter le vrai fichier (relu 12 h plus tard, puis en requête conditionnelle sur sa date à elle).
      if (!estCsvFootballData(texte)) return { statut: 'erreur', texte: null, version: null, requetes, erreur: 'réponse inattendue : pas un fichier CSV de football-data' };
      return { statut: 200, texte, version: r.headers.get('last-modified'), requetes };
    } catch (error) {
      derniere = error?.name === 'AbortError' ? new Error(`pas de réponse en ${DELAI_MS / 1000} s`) : error;
    } finally {
      clearTimeout(minuterie);
    }
  }
  return { statut: 'erreur', texte: null, version: null, requetes, erreur: derniere?.message ?? 'échec inconnu' };
}

/** Dernière lecture de fixtures.csv (14 Ko) : relue au plus toutes les 30 min, gardée si le site ne répond plus. */
let fixturesLu = null;
let fixturesEchec = 0;
async function lireFixtures() {
  const maintenant = Date.now();
  if (fixturesLu && maintenant - Date.parse(fixturesLu.lu) < FIXTURES_RELECTURE_MS) return { ...fixturesLu, statut: 'cache', requetes: 0, erreur: null };
  if (!fixturesLu && maintenant - fixturesEchec < FIXTURES_RELECTURE_MS) {
    return { texte: null, version: null, lu: null, statut: 'erreur', requetes: 0, erreur: 'en échec il y a moins de 30 min, nouvel essai plus tard' };
  }
  const r = await lireFichier(FIXTURES_URL, { depuis: fixturesLu?.version ?? null });
  const lu = new Date().toISOString();
  if (r.statut === 200) fixturesLu = { texte: r.texte, version: r.version, lu };
  else if (r.statut === 304 && fixturesLu) fixturesLu = { ...fixturesLu, lu };
  else {
    fixturesEchec = Date.now();
    // Le fichier ne change que deux fois par semaine : la version déjà lue reste bonne.
    if (fixturesLu) fixturesLu = { ...fixturesLu, lu };
  }
  const erreur = r.statut === 'erreur' ? r.erreur : r.statut === 404 ? 'fichier introuvable (404)' : null;
  return { ...(fixturesLu ?? { texte: null, version: null, lu: null }), statut: r.statut, requetes: r.requetes, erreur };
}

const PAS_ENCORE_PUBLIE = 'pas encore publié par football-data.co.uk (cotes relevées le vendredi pour le week-end, le mardi en semaine)';
const SANS_AVANT_MATCH = 'football-data.co.uk ne publie pas de cote avant match pour ce championnat (clôture 1x2 seulement, après le match)';
const manque = (f, reason) => ({ league: f.league, date: f.date, homeName: f.homeName, awayName: f.awayName, reason });

/**
 * La raison, en clair, pour laquelle une rencontre demandée n'a pas de cote
 * dans fixtures.csv. Les déductions passent par les IDENTIFIANTS : une ligne
 * du même jour qui porte l'un des deux clubs est forcément ce match (un club
 * ne joue pas deux fois en deux jours), son autre nom est donc l'inconnu.
 */
function raisonDuManque(c, { horizon, nonRattachees }) {
  if (c.ligne) return 'aucun bookmaker sur ce match';
  if (FD_PAYS[LIGUES.get(c.f.league)]) return SANS_AVANT_MATCH;
  if (!horizon || c.f.date > horizon) return PAS_ENCORE_PUBLIE;
  const memeJour = nonRattachees.filter((l) => l.league === c.f.league && ecartJours(l.jourUtc, c.f.date) <= 1);
  const parDomicile = c.homeId ? memeJour.find((l) => l.homeId === c.homeId) : null;
  if (parDomicile) return parDomicile.awayId ? `affiche différente dans fixtures.csv : ${parDomicile.home} - ${parDomicile.away}` : `nom d'équipe non reconnu : ${parDomicile.away}`;
  const parExterieur = c.awayId ? memeJour.find((l) => l.awayId === c.awayId) : null;
  if (parExterieur) return parExterieur.homeId ? `affiche différente dans fixtures.csv : ${parExterieur.home} - ${parExterieur.away}` : `nom d'équipe non reconnu : ${parExterieur.home}`;
  if (!c.homeId || !c.awayId) return `club du calendrier non reconnu : ${!c.homeId ? c.f.homeName : c.f.awayName}`;
  const inconnus = [...new Set(memeJour.flatMap((l) => [l.homeId ? null : l.home, l.awayId ? null : l.away]).filter(Boolean))];
  return inconnus.length ? `nom d'équipe non reconnu : ${inconnus.join(', ')}` : 'match absent de fixtures.csv';
}

/**
 * Cotes des matchs À VENIR : la pré-clôture de fixtures.csv (kind
 * 'preclose' ; jamais de clôture pour un match pas encore joué — ses
 * colonnes C sont vides). Chaque ligne d'une compétition couverte est
 * rattachée aux rencontres demandées (calendrier FotMob) par les
 * identifiants que donne sourceMatching.resolveFixture (alias appris par
 * le vote des saisons passées, sinon annuaire strict), jamais par
 * ressemblance de nom. Une ligne non traduite garde ses cotes, avec ses
 * noms et sans identifiant : la même rencontre du fichier de saison, une
 * fois jouée, lui apportera ses identifiants (même sourceEvent).
 *
 * `fixtures` : [{ league, date, homeName, awayName, homeId?, awayId? }] ;
 * seules les lignes des compétitions et jours demandés sont rendues
 * (oddsWatch ne demande que les matchs des deux prochaines heures). Sans
 * `fixtures`, toutes les lignes des compétitions couvertes.
 *
 * @returns {{ quotes, requests, unresolved, errors, events, missing, rows, attached }}
 */
export async function collectFixturesCsv({ fixtures = null, database = openDb(), log = () => {} } = {}) {
  const resultat = { quotes: [], requests: 0, unresolved: [], errors: [], events: [], missing: [], rows: 0, attached: 0 };
  const demandees = Array.isArray(fixtures) ? fixtures.filter((f) => f && LIGUES.has(f.league) && f.date && f.homeName && f.awayName) : null;
  if (demandees && !demandees.length) return resultat;
  // Les championnats par pays ne sont jamais dans fixtures.csv : inutile de le lire pour eux seuls.
  if (demandees && demandees.every((f) => FD_PAYS[LIGUES.get(f.league)])) {
    resultat.missing = demandees.map((f) => manque(f, SANS_AVANT_MATCH));
    return resultat;
  }

  const lu = await lireFixtures();
  resultat.requests = lu.requetes;
  if (lu.erreur) resultat.errors.push(`fixtures.csv : ${lu.erreur}`);
  if (!lu.texte) {
    for (const f of demandees ?? []) {
      resultat.missing.push(manque(f, FD_PAYS[LIGUES.get(f.league)] ? SANS_AVANT_MATCH : 'fixtures.csv illisible : football-data.co.uk ne répond pas'));
    }
    return resultat;
  }

  // Import différé : sourceMatching importe oddsProfileRead, qui importe ce
  // module ; à l'import, ce cycle changerait l'ordre de chargement des
  // modules du profilage. À l'appel, il est sans effet.
  let resoudre;
  let clubDuMagasin = null;
  try {
    ({ resolveFixture: resoudre } = await import('./sourceMatching.js'));
    if (demandees?.some((f) => !f.homeId || !f.awayId)) ({ clubDuMagasin } = await import('../db/oddsProfileRead.js'));
  } catch (error) {
    resultat.errors.push(`rattachement indisponible : ${error.message}`);
    for (const f of demandees ?? []) resultat.missing.push(manque(f, 'rattachement des équipes indisponible'));
    return resultat;
  }
  // Les clubs des rencontres demandées : ceux que donne l'appelant, sinon l'annuaire strict (noms FotMob).
  const club = (nom, league) => {
    try {
      return clubDuMagasin ? (clubDuMagasin(nom, league, database) ?? null) : null;
    } catch {
      return null;
    }
  };
  const cibles = (demandees ?? []).map((f) => ({ f, homeId: f.homeId ?? club(f.homeName, f.league), awayId: f.awayId ?? club(f.awayName, f.league), ligne: null, cotes: 0 }));
  const parAffiche = new Map();
  for (const c of cibles) {
    if (!c.homeId || !c.awayId) continue;
    const cle = `${c.f.league}|${c.homeId}|${c.awayId}`;
    parAffiche.set(cle, [...(parAffiche.get(cle) ?? []), c]);
  }

  const version = Date.parse(lu.version ?? '');
  const releveAt = Number.isFinite(version) ? new Date(Math.min(version, Date.now())).toISOString() : lu.lu;
  let horizon = null;
  const nonRattachees = [];
  const nonResolus = new Map();
  for (const row of lireCsv(lu.texte)) {
    const m = momentDe(row);
    if (m.date && (!horizon || m.date > horizon)) horizon = m.date;
    const code = row.Div;
    const league = FD_SAISONNIERS[code];
    const home = row.HomeTeam;
    const away = row.AwayTeam;
    if (!league || !LIGUES.has(league) || !m.date || !home || !away) continue;
    resultat.rows++;
    if (demandees && !cibles.some((c) => c.f.league === league && ecartJours(c.f.date, m.jourUtc) <= 1)) continue;
    let ids = { homeId: null, awayId: null };
    try {
      ids = resoudre({ source: SOURCE, league, home, away, database });
    } catch (error) {
      resultat.errors.push(`${home} - ${away} : ${error.message}`);
    }
    for (const [nom, id] of [[home, ids.homeId], [away, ids.awayId]]) if (!id) nonResolus.set(`${league}|${nom}`, { name: nom, league });
    const cible =
      ids.homeId && ids.awayId
        ? (parAffiche.get(`${league}|${ids.homeId}|${ids.awayId}`) ?? [])
            .filter((c) => !c.ligne && ecartJours(c.f.date, m.jourUtc) <= 1)
            .sort((a, b) => ecartJours(a.f.date, m.jourUtc) - ecartJours(b.f.date, m.jourUtc))[0]
        : null;
    const cotes = quotesFromRow(row, { code, league, homeId: ids.homeId, awayId: ids.awayId, url: FIXTURES_URL, releveAt }).filter((q) => q.kind === 'preclose');
    resultat.quotes.push(...cotes);
    resultat.events.push({ sourceEvent: evenementDe(code, m.date, home, away), league, date: m.jourUtc, homeId: ids.homeId, awayId: ids.awayId, homeName: home, awayName: away, kickoff: m.kickoff });
    if (cible) {
      cible.ligne = row;
      cible.cotes = cotes.length;
      resultat.attached++;
    } else nonRattachees.push({ league, jourUtc: m.jourUtc, home, away, homeId: ids.homeId, awayId: ids.awayId });
  }
  resultat.unresolved = [...nonResolus.values()];
  for (const c of cibles) if (!c.ligne || !c.cotes) resultat.missing.push(manque(c.f, raisonDuManque(c, { horizon, nonRattachees })));
  log({ source: SOURCE, fichier: 'fixtures.csv', version: lu.version ?? null, lignes: resultat.rows, rattachees: resultat.attached, cotes: resultat.quotes.length, nonResolus: resultat.unresolved.length });
  return resultat;
}

/**
 * Pas de cote en direct chez football-data (fichiers publiés deux fois par
 * semaine) : rien à relever, mais chaque match en cours d'une compétition
 * couverte est déclaré manquant, avec sa raison.
 */
export async function collectLive({ fixtures = [] } = {}) {
  const missing = (Array.isArray(fixtures) ? fixtures : [])
    .filter((f) => f && LIGUES.has(f.league) && f.date && f.homeName && f.awayName)
    .map((f) => manque(f, 'pas de cote en direct chez football-data.co.uk'));
  return { quotes: [], requests: 0, unresolved: [], errors: [], events: [], missing };
}

/** Les fichiers à relire, dans l'ordre du curseur : par code, les saisons de la plus ancienne à la courante. */
function fichiersARattraper({ codes = null, saisons = null, league = null } = {}) {
  let liste = Array.isArray(codes) && codes.length ? codes : [...Object.keys(FD_SAISONNIERS), ...Object.keys(FD_PAYS)];
  if (league) liste = liste.filter((c) => (FD_SAISONNIERS[c] ?? FD_PAYS[c]) === league);
  const courante = saisonCourante();
  const listeSaisons = Array.isArray(saisons) && saisons.length ? saisons : saisonsDuMagasin();
  const fichiers = [];
  for (const code of liste) {
    if (FD_SAISONNIERS[code]) {
      for (const s of listeSaisons) fichiers.push({ code, league: FD_SAISONNIERS[code], nom: `${code} ${s}`, url: `${BASE}/mmz4281/${s}/${code}.csv`, enCours: s === courante });
    } else if (FD_PAYS[code]) {
      fichiers.push({ code, league: FD_PAYS[code], nom: `new/${code}`, url: `${BASE}/new/${code}.csv`, enCours: true });
    }
  }
  return fichiers;
}

/**
 * Le curseur : l'index du prochain fichier à lire (« 3 » suffit), ou le
 * JSON que rend backfillQuotes — { fichier, nom, lu, version } : `lu` et
 * `version` (Last-Modified) disent quand le fichier suivi a été lu, pour ne
 * le relire qu'après 12 h et seulement s'il a changé. `nom` recale l'index
 * si la liste des fichiers a bougé.
 */
function positionDe(cursor, fichiers) {
  const depart = { fichier: 0, lu: null, version: null };
  if (cursor === null || cursor === undefined || cursor === '') return depart;
  const texte = String(cursor).trim();
  if (/^\d+$/.test(texte)) return { ...depart, fichier: Math.min(Number(texte), fichiers.length) };
  let c;
  try {
    c = JSON.parse(texte);
  } catch {
    return depart;
  }
  let fichier = Number.isInteger(c?.fichier) && c.fichier >= 0 ? Math.min(c.fichier, fichiers.length) : 0;
  if (c?.nom && fichiers[fichier]?.nom !== c.nom) {
    const i = fichiers.findIndex((f) => f.nom === c.nom);
    if (i === -1) return depart;
    fichier = i;
  }
  return { fichier, lu: typeof c?.lu === 'string' ? c.lu : null, version: typeof c?.version === 'string' ? c.version : null };
}

/**
 * Rattrapage historique : relit les fichiers football-data un par un et
 * rend toutes leurs cotes (quotesFromRow) pour les rencontres JOUÉES que le
 * vote rattache au magasin (sourceMatching.voteAttach : jour ± 1 + score,
 * puis identifiants et score vérifié). Chaque cote porte matchKey, homeId,
 * awayId. Le vote apprend les noms football-data (« Man United », « Nott'm
 * Forest ») dans team_source_aliases quand `apply` est vrai — c'est ce qui
 * permet ensuite à collectFixturesCsv de reconnaître ces noms avant le match.
 *
 * Idempotent, par fichier : `state.cursor` = position rendue la fois
 * précédente ; `budget` = requêtes HTTP au plus pour cet appel. Le DERNIER
 * fichier, quand il grossit encore (saison en cours, fichier par pays), n'est
 * jamais « fini » : il est relu au plus toutes les 12 h, en requête
 * conditionnelle (304 si rien n'a changé). Entre-temps, l'appel rend
 * requests: 0 et la raison dans bilan.attente.
 *
 * `league` (appel de l'orchestrateur) ou `codes`/`saisons` (« E0 »,
 * « 2627 ») choisissent les fichiers ; une compétition non couverte rend
 * done: true sans requête. Le curseur ne vaut que pour la même sélection.
 *
 * @returns {{ quotes, requests, cursor, done, bilan, errors }} — bilan : { attached,
 *   unmatched, unresolvedNames, sansCote, scoreMismatch, rows, learned, traductions,
 *   fichiers, aJour, attente }
 */
export async function backfillQuotes({ codes = null, saisons = null, league = null, database = openDb(), budget = 10, state = null, apply = true, log = () => {} } = {}) {
  const fichiers = fichiersARattraper({ codes, saisons, league });
  const competitions = [...new Set(fichiers.map((f) => f.league))];
  const bilan = {
    league: league ?? (competitions.length === 1 ? competitions[0] : null),
    attached: 0,
    unmatched: 0,
    unresolvedNames: [],
    sansCote: 0,
    scoreMismatch: 0,
    rows: 0,
    learned: 0,
    traductions: [],
    fichiers: [],
    aJour: false,
    attente: null
  };
  const resultat = { quotes: [], requests: 0, cursor: null, done: true, bilan, errors: [] };
  if (!fichiers.length) return resultat;

  let voteAttach;
  try {
    ({ voteAttach } = await import('./sourceMatching.js'));
  } catch (error) {
    resultat.errors.push(`rattachement indisponible : ${error.message}`);
    resultat.cursor = state?.cursor ?? null;
    resultat.done = false;
    return resultat;
  }

  const plafond = Math.max(0, Math.floor(Number(budget)) || 0);
  const nonResolus = new Set();
  const traductions = new Map();
  const premieres = new Map();
  const premiereDate = (lg) => {
    if (!premieres.has(lg)) premieres.set(lg, database.prepare('SELECT MIN(date) d FROM matches WHERE league = ?').get(lg)?.d ?? null);
    return premieres.get(lg);
  };
  let pos = positionDe(state?.cursor, fichiers);
  while (pos.fichier < fichiers.length && resultat.requests < plafond) {
    const f = fichiers[pos.fichier];
    const suivi = pos.fichier === fichiers.length - 1 && f.enCours;
    const recent = Date.parse(pos.lu ?? '');
    if (suivi && Number.isFinite(recent) && Date.now() - recent < RELECTURE_MS) {
      bilan.aJour = true;
      bilan.attente = `${f.nom} déjà lu le ${pos.lu.slice(0, 16).replace('T', ' ')} UTC ; prochaine lecture 12 h plus tard`;
      break;
    }
    const r = await lireFichier(f.url, { depuis: suivi ? pos.version : null, essais: plafond - resultat.requests });
    resultat.requests += r.requetes;
    const trace = { fichier: f.nom, url: f.url, statut: r.statut, version: r.version ?? null };
    bilan.fichiers.push(trace);
    if (r.statut === 'erreur') {
      // Jamais de plantage : l'erreur est rendue, le curseur reste sur ce fichier.
      trace.erreur = r.erreur;
      resultat.errors.push(`${f.nom} : ${r.erreur}`);
      break;
    }
    if (r.statut === 200) {
      const lignes = normaliser(lireCsv(r.texte), { garderBrute: true });
      // Seulement la période que le magasin couvre pour cette compétition (comme rattacher).
      const premier = premiereDate(f.league);
      const rows = (premier ? lignes.filter((l) => l.date >= decaler(premier, -1)) : []).map((l) => ({
        date: momentDe(l.brute).jourUtc ?? l.date,
        home: l.home,
        away: l.away,
        hg: l.hg,
        ag: l.ag,
        brute: l.brute
      }));
      let vote;
      try {
        vote = voteAttach({ source: SOURCE, league: f.league, rows, apply, database });
      } catch (error) {
        // Le curseur reste sur ce fichier : avancer perdrait ses cotes pour de bon.
        trace.erreur = error.message;
        resultat.errors.push(`${f.nom} : ${error.message}`);
        break;
      }
      let cotesDuFichier = 0;
      for (const a of vote.attachments) {
        const cotes = quotesFromRow(a.row.brute, { code: f.code, league: f.league, matchKey: a.matchKey, homeId: a.homeId, awayId: a.awayId, url: f.url });
        if (!cotes.length) bilan.sansCote++;
        cotesDuFichier += cotes.length;
        for (const q of cotes) resultat.quotes.push(q);
        for (const [nom, teamId] of [[a.row.home, a.homeId], [a.row.away, a.awayId]]) traductions.set(`${f.league}|${nom}`, { name: nom, league: f.league, teamId });
      }
      bilan.rows += vote.bilan.rows;
      bilan.attached += vote.bilan.attached;
      bilan.unmatched += vote.bilan.unmatched;
      bilan.scoreMismatch += vote.bilan.scoreMismatch;
      bilan.learned += vote.bilan.learned ?? 0;
      for (const n of vote.bilan.unresolvedNames ?? []) nonResolus.add(competitions.length > 1 ? `${n} (${f.league})` : n);
      Object.assign(trace, {
        lignes: lignes.length,
        gardees: rows.length,
        derniereDate: lignes.reduce((max, l) => (l.date > max ? l.date : max), '') || null,
        rattachees: vote.bilan.attached,
        cotes: cotesDuFichier
      });
    }
    log({ source: SOURCE, ...trace });
    if (suivi) {
      // Le fichier grossit encore : on y reviendra, au plus toutes les 12 h.
      pos = { fichier: pos.fichier, lu: new Date().toISOString(), version: r.statut === 200 ? r.version : r.statut === 304 ? pos.version : null };
      bilan.aJour = true;
      break;
    }
    pos = { fichier: pos.fichier + 1, lu: null, version: null };
  }
  resultat.cursor = JSON.stringify({ fichier: pos.fichier, nom: fichiers[pos.fichier]?.nom ?? null, lu: pos.lu, version: pos.version });
  resultat.done = pos.fichier >= fichiers.length;
  bilan.unresolvedNames = [...nonResolus].sort();
  bilan.traductions = [...traductions.values()];
  return resultat;
}

/** Noms du contrat commun des fournisseurs (freeOdds.js appelle collectFixturesCsv et backfillQuotes). */
export const collectUpcoming = collectFixturesCsv;
export const backfill = backfillQuotes;
