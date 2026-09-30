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
 * Source : https://www.football-data.co.uk — réutilisation libre pour un
 * usage personnel. Le site refuse les requêtes sans en-tête de navigateur.
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';

export const SOURCE = 'football-data.co.uk';
const BASE = 'https://www.football-data.co.uk';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
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

async function telecharger(url) {
  let derniere = null;
  for (let essai = 0; essai < 3; essai++) {
    if (essai) await sleep(1500 * essai);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/csv,text/plain,*/*' } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      derniere = e;
    }
  }
  throw derniere;
}

/** CSV simple : les fichiers de football-data n'ont pas de virgule citée. */
function lireCsv(texte) {
  const lignes = texte.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lignes.length) return [];
  const entetes = lignes[0].split(',').map((h) => h.trim());
  return lignes.slice(1).map((l) => {
    const valeurs = l.split(',');
    return Object.fromEntries(entetes.map((h, i) => [h, (valeurs[i] ?? '').trim()]));
  });
}

/** « 15/08/2025 » ou « 15/08/25 » -> « 2025-08-15 ». */
function dateIso(texte) {
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

/** Lignes jouées et cotées d'un fichier, dans un format commun. */
function normaliser(brutes) {
  const sortie = [];
  for (const b of brutes) {
    const date = dateIso(b.Date);
    const home = b.HomeTeam ?? b.Home;
    const away = b.AwayTeam ?? b.Away;
    const hg = entier(b.FTHG ?? b.HG);
    const ag = entier(b.FTAG ?? b.AG);
    const odds = cotesDe(b);
    if (!date || date < DEPUIS || !home || !away || hg === null || ag === null || !odds) continue;
    sortie.push({ date, home, away, hg, ag, odds });
  }
  return sortie;
}

const decaler = (iso, jours) => new Date(Date.parse(`${iso}T00:00:00Z`) + jours * 86_400_000).toISOString().slice(0, 10);
const ecartJours = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/**
 * Rattache des lignes de CSV aux rencontres d'une compétition du magasin.
 * Renvoie les rattachements et le bilan, sans rien écrire.
 */
export function rattacher(toutes, league, { database = openDb() } = {}) {
  // Seulement la période que le magasin couvre pour cette compétition : un
  // fichier par pays remonte à 2012, et les championnats juillet-juin
  // n'ont en magasin que les saisons commencées en juillet 2023.
  const premier = database.prepare('SELECT MIN(date) d FROM matches WHERE league = ?').get(league)?.d ?? null;
  const lignes = premier ? toutes.filter((l) => l.date >= decaler(premier, -1)) : [];
  const bilan = { league, lignes: lignes.length, rattachees: 0, sansRencontre: 0, scoreDifferent: 0, nomsNonTraduits: [] };
  if (!lignes.length) return { rattachements: [], bilan };
  const dates = lignes.map((l) => l.date).sort();
  const magasin = database
    .prepare(`SELECT match_key, date, home_id, away_id, home_goals, away_goals FROM matches
              WHERE league = ? AND date >= ? AND date <= ? AND home_id IS NOT NULL AND away_id IS NOT NULL`)
    .all(league, decaler(dates[0], -3), decaler(dates.at(-1), 3));
  const parDate = new Map();
  for (const m of magasin) {
    if (!parDate.has(m.date)) parDate.set(m.date, []);
    parDate.get(m.date).push(m);
  }
  const autour = (date, jours) => {
    const liste = [];
    for (let k = -jours; k <= jours; k++) liste.push(...(parDate.get(decaler(date, k)) ?? []));
    return liste;
  };

  // 1. Votes : une ligne dont la date et le score désignent UNE seule
  //    rencontre du magasin dit quel club porte chacun de ses deux noms.
  const votes = new Map();
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
  // 2. Traduction : majorité nette, sur au moins deux votes.
  const idDe = new Map();
  for (const [nom, v] of votes) {
    const tri = [...v.entries()].sort((a, b) => b[1] - a[1]);
    const total = tri.reduce((s, [, n]) => s + n, 0);
    if (tri[0][1] >= 2 && tri[0][1] / total >= 0.6) idDe.set(nom, tri[0][0]);
  }
  const nonTraduits = new Set();

  // 3. Rattachement par identifiants, date la plus proche à trois jours
  //    près (matchs reportés), score vérifié.
  const rattachements = [];
  const pris = new Set();
  for (const l of lignes) {
    const h = idDe.get(l.home);
    const a = idDe.get(l.away);
    if (!h) nonTraduits.add(l.home);
    if (!a) nonTraduits.add(l.away);
    if (!h || !a) {
      bilan.sansRencontre++;
      continue;
    }
    const rencontre = autour(l.date, 3)
      .filter((m) => m.home_id === h && m.away_id === a && !pris.has(m.match_key))
      .sort((x, y) => ecartJours(x.date, l.date) - ecartJours(y.date, l.date))[0];
    if (!rencontre) {
      bilan.sansRencontre++;
      continue;
    }
    if (rencontre.home_goals !== l.hg || rencontre.away_goals !== l.ag) {
      bilan.scoreDifferent++;
      continue;
    }
    pris.add(rencontre.match_key);
    rattachements.push({ matchKey: rencontre.match_key, odds: l.odds });
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
        texte = await telecharger(url);
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
      complet = { code, league, lignes: lignes.length, rattachees: 0, sansRencontre: 0, scoreDifferent: 0, fichiersAbsents: absents, erreurs: [...erreurs, error.message] };
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
    failedFiles: bilans.flatMap((b) => b.erreurs ?? []),
    details: bilans
  };
}

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
    failedFiles: r.failedFiles,
    // Les championnats où le rattachement coince (noms non traduits, fichier
    // figé à la source) : ce que le bilan jetait autrefois.
    weakLeagues: r.details
      .filter((b) => (b.lignes ?? 0) > 0 && (b.rattachees ?? 0) / b.lignes < 0.8)
      .map((b) => ({ code: b.code, league: b.league, rows: b.lignes, linked: b.rattachees }))
  };
}
