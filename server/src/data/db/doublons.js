/**
 * doublons.js — les rencontres enregistrées deux fois.
 * -----------------------------------------------------------------------
 * La recherche de scripts/merge-duplicate-matches.mjs, sortie en module
 * (étape 12 du plan, 06/10/2026) pour que le carnet de santé des données la
 * réutilise au lieu d'en écrire une seconde. Le script, lui, garde la FUSION ;
 * ce module ne fait que CHERCHER, en lecture seule.
 *
 * Une rencontre se reconnaît à son jour et à l'IDENTITÉ de ses deux clubs
 * (identifiants FotMob), jamais à leur nom : « Feyenoord - FC Utrecht » et
 * « Feyenoord Rotterdam - FC Utrecht » sont la même rencontre.
 *
 *   rencontresEnDouble       même jour, même club à domicile, même club à
 *                            l'extérieur : ce que le script fusionne ;
 *   rencontresInversees      même jour, les deux mêmes clubs dans l'autre
 *                            sens (Copa Chile du 27/09/2026 : Everton -
 *                            Universidad de Chile ET Universidad de Chile -
 *                            Everton) — le script ne les fusionne pas, le
 *                            sens juste ne se devine pas ;
 *   memeIdentifiantFotmob    un identifiant de rencontre FotMob sous deux
 *                            clés (resolveMatchKey l'empêche depuis le
 *                            22/09/2026 ; le contrôle dit s'il en reste).
 *
 * Trois façons de chercher, UNE règle (la clé de regroupement ci-dessous) :
 *   - `rencontres` : les rencontres déjà lues par l'appelant (le contrôle
 *     complet les a toutes en mémoire), regroupées sans relire la base ;
 *   - `cles` : seulement les groupes qui contiennent une de ces rencontres
 *     (la passe de nuit du carnet ne regarde que les rencontres nouvelles) ;
 *   - rien : toute la table, en SQL (le script de fusion).
 *
 * Chaque recherche est écrite UNE fois, en générateur (`…ParMorceaux`, qui
 * `yield` entre deux tranches de travail : utils/travailCooperatif.js), et
 * garde son nom d'avant, synchrone, pour qui n'a pas de boucle à ménager
 * (scripts/merge-duplicate-matches.mjs, dailyChecks.js). Le contrôle complet
 * du carnet, lui, les exécute en rendant la main au serveur (retouche du
 * 07/10/2026 : 60 000 rencontres regroupées d'une traite, 150 ms).
 * -----------------------------------------------------------------------
 */

import { executerSansPause } from '../../utils/travailCooperatif.js';

/** Une requête sur des clés n'en prend jamais plus de 64 : leurs lignes entières se lisent (les clubs suivent des listes de plusieurs ko). */
const LOT = 64;
const lots = (liste) => Array.from({ length: Math.ceil(liste.length / LOT) }, (_, i) => liste.slice(i * LOT, i * LOT + LOT));
const marques = (n) => Array.from({ length: n }, () => '?').join(',');

/** La clé d'une rencontre : jour + club à domicile + club à l'extérieur. */
const cleRencontre = (date, domicile, exterieur) => `${date}|${domicile}|${exterieur}`;
/** L'identifiant 0, partagé chez FotMob par des rencontres différentes, n'identifie rien. */
const idFotmobValide = (id) => id !== null && id !== undefined && String(id) !== '' && String(id) !== '0';

/** Les rencontres (jour, clubs) des clés données, lues une fois, un point d'arrêt entre deux lots. */
function* rencontresDe(database, cles) {
  const out = [];
  for (const lot of lots(cles)) {
    out.push(...database.prepare(`SELECT match_key, date, home_id, away_id, fotmob_id FROM matches WHERE match_key IN (${marques(lot.length)})`).all(...lot));
    yield 'doublons : lecture des rencontres';
  }
  return out;
}

/** Les rencontres en mémoire, sous la forme des lignes SQL. */
const enLignes = (rencontres) =>
  [...rencontres].map((r) => ({ match_key: r.matchKey, date: r.date, home_id: r.homeId ?? null, away_id: r.awayId ?? null, fotmob_id: r.fotmobId ?? null }));

/** Un point d'arrêt tous les 4 096 tours des boucles en mémoire (~2 ms de travail). */
const TOURS = 4095;

function* regrouper(lignes, cle) {
  const groupes = new Map();
  let tours = 0;
  for (const l of lignes) {
    const k = cle(l);
    if (k !== null) {
      const g = groupes.get(k);
      if (g) g.push(l.match_key);
      else groupes.set(k, [l.match_key]);
    }
    if ((++tours & TOURS) === 0) yield 'doublons : regroupement';
  }
  return groupes;
}

/**
 * Même jour, mêmes deux clubs dans le même sens. Ordre : les plus récentes
 * d'abord (celui du script de fusion).
 * @returns {{ date: string, homeId: string, awayId: string, cles: string[] }[]}
 */
export function rencontresEnDouble(database, options = {}) {
  return executerSansPause(rencontresEnDoubleParMorceaux(database, options));
}

export function* rencontresEnDoubleParMorceaux(database, { cles = null, rencontres = null } = {}) {
  if (rencontres) {
    const groupes = yield* regrouper(enLignes(rencontres), (l) => (l.home_id && l.away_id ? cleRencontre(l.date, l.home_id, l.away_id) : null));
    return [...groupes.entries()]
      .filter(([, g]) => g.length > 1)
      .map(([k, g]) => {
        const [date, homeId, awayId] = k.split('|');
        return { date, homeId, awayId, cles: g.sort() };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  if (!cles) {
    return database.prepare(`
      SELECT date, home_id, away_id, COUNT(*) AS n, GROUP_CONCAT(match_key, '|') AS cles
      FROM matches
      WHERE home_id IS NOT NULL AND away_id IS NOT NULL
      GROUP BY date, home_id, away_id
      HAVING n > 1
      ORDER BY date DESC
    `).all().map((g) => ({ date: g.date, homeId: g.home_id, awayId: g.away_id, cles: g.cles.split('|') }));
  }
  const memes = database.prepare('SELECT match_key FROM matches WHERE date = ? AND home_id = ? AND away_id = ?');
  const vus = new Set();
  const groupes = [];
  for (const m of yield* rencontresDe(database, cles)) {
    // Une requête par rencontre, qui lit toutes celles de son jour (de 5 à 40 ms) : un point d'arrêt à chaque tour.
    yield 'doublons : rencontres du même jour';
    if (!m.home_id || !m.away_id) continue;
    const id = cleRencontre(m.date, m.home_id, m.away_id);
    if (vus.has(id)) continue;
    vus.add(id);
    const groupe = memes.all(m.date, m.home_id, m.away_id).map((r) => r.match_key);
    if (groupe.length > 1) groupes.push({ date: m.date, homeId: m.home_id, awayId: m.away_id, cles: groupe.sort() });
  }
  return groupes.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Même jour, les deux mêmes clubs, dans l'AUTRE sens.
 * @returns {{ date: string, cles: [string, string] }[]}
 */
export function rencontresInversees(database, options = {}) {
  return executerSansPause(rencontresInverseesParMorceaux(database, options));
}

export function* rencontresInverseesParMorceaux(database, { cles = null, rencontres = null } = {}) {
  const paires = [];
  const vues = new Set();
  const ajouter = (date, a, b) => {
    const [x, y] = [a, b].sort();
    if (vues.has(`${x}|${y}`)) return;
    vues.add(`${x}|${y}`);
    paires.push({ date, cles: [x, y] });
  };
  if (rencontres || !cles) {
    // Une passe sur les rencontres, regroupées en mémoire : la jointure de la
    // table sur elle-même par clubs coûtait plusieurs minutes (aucun index composé).
    const lignes = rencontres ? enLignes(rencontres) : database.prepare('SELECT match_key, date, home_id, away_id FROM matches WHERE home_id IS NOT NULL AND away_id IS NOT NULL').all();
    const parJour = yield* regrouper(lignes, (l) => (l.home_id && l.away_id ? cleRencontre(l.date, l.home_id, l.away_id) : null));
    let tours = 0;
    for (const [id, groupe] of parJour) {
      const [date, h, a] = id.split('|');
      for (const autre of parJour.get(cleRencontre(date, a, h)) ?? []) for (const cle of groupe) ajouter(date, cle, autre);
      if ((++tours & TOURS) === 0) yield 'doublons : sens inverse';
    }
  } else {
    const inverse = database.prepare('SELECT match_key FROM matches WHERE date = ? AND home_id = ? AND away_id = ?');
    for (const m of yield* rencontresDe(database, cles)) {
      // Une requête par rencontre, qui lit toutes celles de son jour : un point d'arrêt à chaque tour.
      yield 'doublons : sens inverse';
      if (!m.home_id || !m.away_id) continue;
      for (const r of inverse.all(m.date, m.away_id, m.home_id)) ajouter(m.date, m.match_key, r.match_key);
    }
  }
  return paires.sort((a, b) => b.date.localeCompare(a.date) || a.cles[0].localeCompare(b.cles[0]));
}

/**
 * Un même identifiant de rencontre FotMob sous plusieurs clés.
 * @returns {{ fotmobId: string, cles: string[] }[]}
 */
export function memeIdentifiantFotmob(database, options = {}) {
  return executerSansPause(memeIdentifiantFotmobParMorceaux(database, options));
}

export function* memeIdentifiantFotmobParMorceaux(database, { cles = null, rencontres = null } = {}) {
  if (rencontres) {
    const groupes = yield* regrouper(enLignes(rencontres), (l) => (idFotmobValide(l.fotmob_id) ? String(l.fotmob_id) : null));
    return [...groupes.entries()].filter(([, g]) => g.length > 1).map(([fotmobId, g]) => ({ fotmobId, cles: g.sort() }));
  }
  const valide = "fotmob_id IS NOT NULL AND fotmob_id NOT IN ('', '0')";
  if (!cles) {
    return database.prepare(`SELECT fotmob_id, GROUP_CONCAT(match_key, '|') AS cles FROM matches WHERE ${valide} GROUP BY fotmob_id HAVING COUNT(*) > 1`)
      .all()
      .map((g) => ({ fotmobId: String(g.fotmob_id), cles: g.cles.split('|').sort() }));
  }
  const memes = database.prepare(`SELECT match_key FROM matches WHERE fotmob_id = ? AND ${valide}`);
  const vus = new Set();
  const groupes = [];
  for (const m of yield* rencontresDe(database, cles)) {
    yield 'doublons : même identifiant FotMob';
    if (!idFotmobValide(m.fotmob_id) || vus.has(String(m.fotmob_id))) continue;
    const id = String(m.fotmob_id);
    vus.add(id);
    const groupe = memes.all(id).map((r) => r.match_key);
    if (groupe.length > 1) groupes.push({ fotmobId: id, cles: groupe.sort() });
  }
  return groupes;
}
