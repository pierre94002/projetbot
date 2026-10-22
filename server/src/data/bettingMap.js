/**
 * bettingMap.js — « OÙ PARIER » : la carte championnat × marché (étape 23 du plan, 22/10/2026).
 * -----------------------------------------------------------------------
 * Ce module-ci est LÉGER : les règles pures de la carte (ses colonnes, la
 * règle de couleur d'une case, ses phrases), la table `betting_map` (lire,
 * écrire une fois) et ce que lisent la page Opportunités, le Repérage et la
 * route GET /api/betting-map. Le CALCUL vit dans bettingMapCalcul.js (dans
 * un processus à part, base en lecture seule) ; le juge est celui de
 * l'étape 16 (bench/guard.js, `comparer`), jamais recodé.
 *
 * UNE CASE = (championnat, colonne). Trois ÉPREUVES peuvent la colorer :
 *   - « H-PL » la perte log du moteur face au marché (banc d'essai, P2
 *     2019-2023, jamais vue) : peut la rendre ROUGE, jamais verte (être plus
 *     juste que la cote juste ne paie pas la marge du bookmaker) ;
 *   - « H-VC » la valeur de clôture des paris simulés du banc (P2) ;
 *   - « V-VC » la valeur de clôture des pronostics gelés du moteur depuis la
 *     dernière adoption (engine_picks, première valeur).
 * Les deux dernières (des épreuves de PRIX) peuvent la rendre verte ou rouge.
 * Verte : une épreuve de prix « retenu » et aucune « moins bon » ; rouge :
 * une « moins bon » et aucune de prix « retenu » ; sinon grise (pas prouvé,
 * trop peu de matchs, contradictoire, pas encore mesurée, pas de cote
 * archivée). Jamais de verdict sous 200 matchs, même si on en recevait un.
 * Les informations (repère, P3, vos vrais paris, meilleur moment) ne
 * colorent JAMAIS une case.
 *
 * La carte n'est qu'une lecture : elle ne change ni le verdict du moteur, ni
 * la pastille de value, ni une notification ; elle trie (les cases vertes
 * d'abord, les rouges à la fin) et avertit.
 * -----------------------------------------------------------------------
 */

import { openDb } from './db/matchStatsDb.js';
import { VERSION_BANC } from '../bench/periodes.js';
import { empreinteDesReglages } from '../core/engine/engineVersions.js';
import { lireReglagesDuMoteur } from '../core/engine/engineConfig.js';

/** La forme de la carte : change quand une règle change (deux cartes de versions différentes ne se comparent pas). */
export const VERSION_CARTE = 1;
/** Le minimum du juge de l'étape 16 (comparer, minBlocs par défaut) : JAMAIS de couleur en dessous. */
export const MIN_MATCHS = 200;

/** Les 13 colonnes, dans l'ordre de l'écran ; `cote` : des cotes de ce marché sont archivées (une épreuve de prix possible). */
export const COLONNES = Object.freeze([
  Object.freeze({ id: 'result', libelle: 'Résultat (1N2)', court: '1N2', groupe: 'buts', cote: true }),
  Object.freeze({ id: 'totalGoals:1.5', libelle: 'Plus/moins 1,5 but', court: '± 1,5', groupe: 'buts', cote: true }),
  Object.freeze({ id: 'totalGoals:2.5', libelle: 'Plus/moins 2,5 buts', court: '± 2,5', groupe: 'buts', cote: true }),
  Object.freeze({ id: 'totalGoals:3.5', libelle: 'Plus/moins 3,5 buts', court: '± 3,5', groupe: 'buts', cote: true }),
  Object.freeze({ id: 'bothTeamsScore', libelle: 'Les 2 équipes marquent', court: '2 marquent', groupe: 'buts', cote: true }),
  Object.freeze({ id: 'teamGoals', libelle: 'Buts d’une équipe', court: 'Buts équipe', groupe: 'equipes', cote: false }),
  Object.freeze({ id: 'resultAndTotal', libelle: 'Résultat + total buts', court: 'Résultat + total', groupe: 'equipes', cote: false }),
  Object.freeze({ id: 'totalCorners', libelle: 'Corners du match', court: 'Corners', groupe: 'corners', cote: false }),
  Object.freeze({ id: 'teamCorners', libelle: 'Corners d’une équipe', court: 'Corners équipe', groupe: 'corners', cote: false }),
  Object.freeze({ id: 'totalShots', libelle: 'Tirs du match', court: 'Tirs', groupe: 'tirs', cote: false }),
  Object.freeze({ id: 'teamShots', libelle: 'Tirs d’une équipe', court: 'Tirs équipe', groupe: 'tirs', cote: false }),
  Object.freeze({ id: 'totalShotsOnTarget', libelle: 'Tirs cadrés du match', court: 'Cadrés', groupe: 'tirs', cote: false }),
  Object.freeze({ id: 'teamShotsOnTarget', libelle: 'Tirs cadrés d’une équipe', court: 'Cadrés équipe', groupe: 'tirs', cote: false })
]);
const PAR_ID = new Map(COLONNES.map((c) => [c.id, c]));
/** Liste FERMÉE des colonnes qui peuvent prendre une couleur : celles dont des cotes sont archivées. */
export const COLONNES_AVEC_COTE = Object.freeze(new Set(COLONNES.filter((c) => c.cote).map((c) => c.id)));
export const GROUPES = Object.freeze([
  Object.freeze({ id: 'buts', titre: 'Résultat et buts' }),
  Object.freeze({ id: 'equipes', titre: 'Équipes et combinés' }),
  Object.freeze({ id: 'corners', titre: 'Corners' }),
  Object.freeze({ id: 'tirs', titre: 'Tirs' })
]);

/** Les épreuves connues ; `prix` : elle mesure l'avantage AU PRIX (seule à pouvoir rendre une case verte). */
export const EPREUVES = Object.freeze({
  'H-PL': Object.freeze({ prix: false, titre: 'Probabilités face au marché (banc d’essai, 2019-2023)' }),
  'H-VC': Object.freeze({ prix: true, titre: 'Valeur de clôture des paris simulés (banc d’essai, 2019-2023)' }),
  'V-VC': Object.freeze({ prix: true, titre: 'Valeur de clôture des pronostics du moteur (depuis la dernière adoption)' })
});

/** Les raisons d'une couleur, et leur mot court (le même à l'écran). */
export const RAISONS = Object.freeze({
  prouve: 'Prouvé',
  'moins-bon': 'Moins bien que le marché',
  'pas-prouve': 'Pas prouvé',
  'trop-peu': 'Trop peu de matchs',
  contradictoire: 'Contradictoire',
  'pas-mesuree': 'Pas encore mesurée',
  'sans-cote': 'Pas de cote archivée',
  perimee: 'Carte d’un autre moteur'
});

// ------------------------------------------------------------ les colonnes

/** La colonne d'une case du banc (resume.carte : marketKey, ligne) ; null hors carte (score exact, ligne 0,5…). */
export function colonneDuBanc(marketKey, ligne) {
  const famille = String(marketKey ?? '').split(':')[0];
  if (famille === 'totalGoals') {
    const id = `totalGoals:${Number(ligne)}`;
    return PAR_ID.has(id) ? id : null;
  }
  return PAR_ID.has(famille) && famille !== 'totalGoals' ? famille : null;
}

/** La colonne d'un pronostic gelé (engine_picks) ou d'une sélection de pari : marché et paramètres (texte JSON ou objet). */
export function colonneDuPronostic(marketId, params) {
  if (marketId === 'totalGoals') {
    let p = params;
    if (typeof p === 'string') {
      try {
        p = JSON.parse(p);
      } catch {
        p = null;
      }
    }
    const id = `totalGoals:${Number(p?.line)}`;
    return PAR_ID.has(id) ? id : null;
  }
  return PAR_ID.has(marketId) ? marketId : null;
}

/** Les clés du Repérage (screener.js, MARCHES) et d'Opportunités → la colonne. */
const DU_REPERAGE = Object.freeze({
  home: 'result',
  draw: 'result',
  away: 'result',
  over15: 'totalGoals:1.5',
  over25: 'totalGoals:2.5',
  under25: 'totalGoals:2.5',
  over35: 'totalGoals:3.5',
  bttsYes: 'bothTeamsScore',
  bttsNo: 'bothTeamsScore'
});
export const colonneDuMarcheDuReperage = (cle) => DU_REPERAGE[cle] ?? null;
export const libelleDeLaColonne = (id) => PAR_ID.get(id)?.libelle ?? id;

// ------------------------------------------------------------ la règle de couleur

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const VERDICTS = new Set(['retenu', 'moins-bon', 'pas-prouve', 'pas-assez-de-matchs']);

/**
 * Une épreuve telle que la règle la lit : un verdict inconnu, ou un verdict tranché sous MIN_MATCHS matchs,
 * devient « pas assez de matchs » (défense en profondeur : une case maigre ne prend JAMAIS de couleur).
 */
export function epreuveLue(e) {
  const matchs = fini(e?.matchs) ? e.matchs : 0;
  // Le juge compte des BLOCS (le match, ou la journée d'un championnat pour les paris simulés) : le plus petit des deux.
  const juges = fini(e?.blocs) ? Math.min(e.blocs, matchs) : matchs;
  let verdict = VERDICTS.has(e?.verdict) ? e.verdict : 'pas-assez-de-matchs';
  if ((verdict === 'retenu' || verdict === 'moins-bon') && juges < MIN_MATCHS) verdict = 'pas-assez-de-matchs';
  return { ...e, matchs, verdict };
}

/**
 * LA RÈGLE DE COULEUR d'une case. Pure. `epreuves` : [{ id: 'H-PL' | 'H-VC' | 'V-VC', verdict, matchs, … }] ;
 * une épreuve d'un autre nom est ignorée (une information ne colore jamais). Rend { couleur, raison }.
 */
export function couleurDeLaCase({ colonne, epreuves = [] }) {
  if (!COLONNES_AVEC_COTE.has(colonne)) return { couleur: 'gris', raison: 'sans-cote' };
  const lues = (Array.isArray(epreuves) ? epreuves : []).filter((e) => Object.hasOwn(EPREUVES, e?.id ?? '')).map(epreuveLue);
  if (!lues.length) return { couleur: 'gris', raison: 'pas-mesuree' };
  const prixRetenu = lues.some((e) => EPREUVES[e.id].prix && e.verdict === 'retenu');
  const moinsBon = lues.some((e) => e.verdict === 'moins-bon');
  if (prixRetenu && moinsBon) return { couleur: 'gris', raison: 'contradictoire' };
  if (prixRetenu) return { couleur: 'vert', raison: 'prouve' };
  if (moinsBon) return { couleur: 'rouge', raison: 'moins-bon' };
  if (lues.every((e) => e.verdict === 'pas-assez-de-matchs')) return { couleur: 'gris', raison: 'trop-peu' };
  return { couleur: 'gris', raison: 'pas-prouve' };
}

// ------------------------------------------------------------ les phrases

const fr = (n) => Number(n).toLocaleString('fr-FR');
const pct = (x, d = 1) => `${x > 0 ? '+' : x < 0 ? '−' : '+'}${Math.abs(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
const fourchette = (f, d = 1) => (Array.isArray(f) && f.length === 2 && f.every(fini) ? ` [${pct(f[0], d).replace(' %', '')} ; ${pct(f[1], d).replace(' %', '')}]` : '');
const matchsDits = (n) => `${fr(n)} ${n > 1 ? 'matchs' : 'match'}`;

/** L'écart d'une épreuve en pourcentage, comme l'écran l'écrit : « −9,5 % [−14,6 ; −4,4] » (null s'il manque). */
export function ecartDit(e) {
  const g = e?.enPourcent?.gain;
  if (!fini(g)) return null;
  return `${pct(g)}${fourchette(e.enPourcent.fourchette)}`;
}

/** La meilleure épreuve pour dire la case : celle qui la colore, sinon la plus fournie. */
function epreuveQuiDit(couleur, lues) {
  if (couleur === 'vert') return lues.find((e) => EPREUVES[e.id].prix && e.verdict === 'retenu');
  if (couleur === 'rouge') return lues.find((e) => e.verdict === 'moins-bon');
  return [...lues].sort((a, b) => b.matchs - a.matchs)[0] ?? null;
}

/** La phrase d'une case (le serveur l'écrit, l'écran la reprend telle quelle). */
export function phraseDeLaCase({ couleur, raison, epreuves = [] }) {
  const lues = epreuves.filter((e) => Object.hasOwn(EPREUVES, e?.id ?? '')).map(epreuveLue);
  const e = epreuveQuiDit(couleur, lues);
  const ecart = e ? ecartDit(e) : null;
  const ou = e?.periode ? ` (${e.periode})` : '';
  const dedans = e?.periode ? `, ${e.periode}` : '';
  switch (raison) {
    case 'prouve':
      return `Prouvé : la cote a ensuite donné raison au moteur, ${ecart ?? ''} de valeur de clôture sur ${matchsDits(e.matchs)}${ou}. Un avantage passé, pas une promesse.`;
    case 'moins-bon':
      return e?.id === 'H-PL'
        ? `Moins bien que le marché : ici le moteur se trompe plus que la cote (${ecart ?? '?'} de perte log, sur ${matchsDits(e.matchs)}${dedans}) — son écart avec la cote n’est pas une value.`
        : `Moins bien que le marché : après ses choix, la cote est partie contre le moteur (${ecart ?? '?'} sur ${matchsDits(e?.matchs ?? 0)}${dedans}).`;
    case 'pas-prouve':
      return `Pas prouvé : l’écart peut venir du hasard${e ? ` (${ecart ? `${ecart}, ` : ''}${matchsDits(e.matchs)}${dedans})` : ''}.`;
    case 'trop-peu':
      return `Trop peu de matchs pour juger : ${fr(Math.max(0, ...lues.map((x) => x.matchs)))} sur ${fr(MIN_MATCHS)} au moins.`;
    case 'contradictoire':
      return 'Contradictoire : une mesure dit « avantage », une autre « moins bien que le marché » — rien n’est conclu.';
    case 'pas-mesuree':
      return 'Pas encore mesurée : aucun match jugé ici pour l’instant.';
    case 'sans-cote':
      return 'Pas de cote archivée pour ce marché : impossible de mesurer un avantage contre le bookmaker.';
    default:
      return '';
  }
}

// ------------------------------------------------------------ le calendrier

const FORMAT_PARIS = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function partiesDeParis(instant) {
  const p = Object.fromEntries(FORMAT_PARIS.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  return { annee: p.year, mois: p.month, jour: Number(p.day), heure: Number(p.hour), minute: Number(p.minute) };
}
/** « AAAA-MM » du mois de Paris d'un instant. */
export function moisDeParis(instant = Date.now()) {
  const p = partiesDeParis(instant);
  return `${p.annee}-${p.mois}`;
}
/** L'instant (ISO, UTC) du 1er du mois `mois` à 0 h, heure de Paris. */
export function debutDuMois(mois) {
  const [a, m] = mois.split('-').map(Number);
  // Minuit à Paris = 23 h (heure d'hiver) ou 22 h (heure d'été) UTC la veille.
  for (const heures of [1, 2, 0]) {
    const t = Date.UTC(a, m - 1, 1) - heures * 3_600_000;
    const p = partiesDeParis(t);
    if (p.jour === 1 && p.heure === 0 && p.minute === 0 && `${p.annee}-${p.mois}` === mois) return new Date(t).toISOString();
  }
  return new Date(Date.UTC(a, m - 1, 1)).toISOString();
}
/** Le 1er du mois de Paris est-il passé de 6 h ? (le calcul mensuel de la carte attend les matchs du dernier soir.) */
export function apresLe1erA6h(instant = Date.now()) {
  const p = partiesDeParis(instant);
  return p.jour > 1 || p.heure >= 6;
}

// ------------------------------------------------------------ les rejeux du banc

const lireJson = (texte) => {
  if (texte === null || texte === undefined) return null;
  try {
    return JSON.parse(texte);
  } catch {
    return null;
  }
};
const tableAbsente = (error) => /no such table/i.test(String(error?.message ?? ''));

/**
 * Les rejeux du banc UTILES À LA CARTE, du plus récent au plus ancien, sans leur résumé : finis, réussis
 * (résumé présent, aucune erreur), de cette version du banc, avec la période P2 et le prix football-data
 * d'avant-match (ceux de sa carte). [{ id, finiLe, ou, moteur: { empreinte, empreinteReglages }, declencheur }].
 */
export function rejeuxUtilesALaCarte({ database = openDb() } = {}) {
  let lignes;
  try {
    lignes = database
      .prepare('SELECT id, fini_le, ou, version_banc, empreinte_moteur, options, bilan FROM bench_runs WHERE fini_le IS NOT NULL AND resume IS NOT NULL ORDER BY id DESC')
      .all();
  } catch (error) {
    if (tableAbsente(error)) return [];
    throw error;
  }
  const sortie = [];
  for (const r of lignes) {
    if (r.version_banc !== VERSION_BANC) continue;
    const options = lireJson(r.options) ?? {};
    const bilan = lireJson(r.bilan) ?? {};
    if (bilan.erreur) continue;
    if (!(options.periodes ?? []).includes('P2') || !(options.prix ?? []).includes('fd-avant-match')) continue;
    sortie.push({ id: r.id, finiLe: r.fini_le, ou: r.ou, moteur: { empreinte: r.empreinte_moteur, empreinteReglages: options.config?.empreinte?.football ?? null }, declencheur: options.declencheur ?? null });
  }
  return sortie;
}

/**
 * Le rejeu que la carte lit pour le moteur `moteur` ({ empreinte, empreinteReglages (football) }) : le plus récent
 * de MÊME empreinte (« exact ») ; sinon le plus récent aux MÊMES réglages (« code-precedent » : seul le code du
 * moteur a changé, dit tel quel) ; sinon null (les réglages ont changé : « banc à relancer »). Pur.
 */
export function rejeuDeLaCarte(rejeux, moteur) {
  const exact = rejeux.find((r) => r.moteur.empreinte === moteur.empreinte);
  if (exact) return { ...exact, etiquette: 'exact' };
  const memesReglages = rejeux.find((r) => r.moteur.empreinteReglages && r.moteur.empreinteReglages === moteur.empreinteReglages);
  return memesReglages ? { ...memesReglages, etiquette: 'code-precedent' } : null;
}

// ------------------------------------------------------------ la table

/** Une carte rangée, lue : { id, mois, calculeLe, raison, …, resume, contenu? }. */
function enCarte(r, { avecContenu = true } = {}) {
  if (!r) return null;
  return {
    id: r.id,
    mois: r.mois,
    calculeLe: r.calcule_le,
    raison: r.raison,
    versionCarte: r.version_carte,
    moteur: { version: r.moteur_version, empreinte: r.empreinte_moteur, empreinteReglages: r.empreinte_reglages },
    banc: { id: r.banc_id, etiquette: r.banc_etiquette, variantes: r.k_banc },
    kVivant: r.k_vivant,
    regards: r.regards,
    fenetre: lireJson(r.fenetre),
    resume: lireJson(r.resume),
    ...(avecContenu ? { contenu: lireJson(r.contenu) } : {})
  };
}

const COLONNES_LEGERES = 'id, mois, calcule_le, raison, version_carte, moteur_version, empreinte_moteur, empreinte_reglages, banc_id, banc_etiquette, k_banc, k_vivant, regards, fenetre, resume';

/** La dernière carte (ou celle de `id`, ou la dernière du mois `mois`), ou null. `avecContenu: false` : sans les cases. */
export function lireLaCarte({ database = openDb(), id = null, mois = null, avecContenu = true } = {}) {
  const colonnes = avecContenu ? `${COLONNES_LEGERES}, contenu` : COLONNES_LEGERES;
  try {
    if (id !== null) return enCarte(database.prepare(`SELECT ${colonnes} FROM betting_map WHERE id = ?`).get(id), { avecContenu });
    if (mois !== null) return enCarte(database.prepare(`SELECT ${colonnes} FROM betting_map WHERE mois = ? ORDER BY id DESC LIMIT 1`).get(mois), { avecContenu });
    return enCarte(database.prepare(`SELECT ${colonnes} FROM betting_map ORDER BY id DESC LIMIT 1`).get(), { avecContenu });
  } catch (error) {
    if (tableAbsente(error)) return null;
    throw error;
  }
}

/** Toutes les cartes gardées, sans leurs cases, de la plus récente à la plus ancienne. */
export function listeDesCartes({ database = openDb() } = {}) {
  try {
    return database.prepare(`SELECT ${COLONNES_LEGERES} FROM betting_map ORDER BY id DESC`).all().map((r) => enCarte(r, { avecContenu: false }));
  } catch (error) {
    if (tableAbsente(error)) return [];
    throw error;
  }
}

/** Le nombre de cartes calculées depuis `depuis` (ISO, inclus) : les REGARDS déjà portés sur la mesure en direct. */
export function cartesDepuis({ database = openDb(), depuis }) {
  try {
    return Number(database.prepare('SELECT COUNT(*) AS n FROM betting_map WHERE calcule_le >= ?').get(depuis)?.n ?? 0);
  } catch (error) {
    if (tableAbsente(error)) return 0;
    throw error;
  }
}

/**
 * Range UNE carte (INSERT seulement : la base refuse un UPDATE — trigger betting_map_jamais_reecrit). Le
 * serveur seul l'appelle, sous le verrou de la passe. Rend l'identifiant.
 */
export function ecrireLaCarte({ database = openDb(), carte }) {
  const r = database
    .prepare(
      `INSERT INTO betting_map (mois, calcule_le, raison, version_carte, moteur_version, empreinte_moteur, empreinte_reglages, banc_id, banc_etiquette, k_banc, k_vivant, regards, fenetre, resume, contenu)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      carte.mois,
      carte.calculeLe,
      carte.raison,
      VERSION_CARTE,
      Number.isInteger(carte.moteur?.version) ? carte.moteur.version : null,
      carte.moteur.empreinte,
      carte.moteur.empreinteReglages,
      carte.banc?.id ?? null,
      carte.banc?.etiquette ?? null,
      Number.isInteger(carte.banc?.variantes) ? carte.banc.variantes : null,
      carte.kVivant,
      carte.regards,
      JSON.stringify(carte.fenetre ?? {}),
      JSON.stringify(carte.resume ?? {}),
      JSON.stringify(carte.contenu ?? {})
    );
  invaliderLaLecture();
  return Number(r.lastInsertRowid);
}

// ------------------------------------------------------------ ce que lisent les autres pages

let lecture = { id: undefined, valeur: null };
export function invaliderLaLecture() {
  lecture = { id: undefined, valeur: null };
}

/** L'empreinte des réglages du moteur EN SERVICE (football) : une carte d'autres réglages ne colore plus rien. */
export function empreinteDesReglagesEnService() {
  return empreinteDesReglages(lireReglagesDuMoteur().football);
}

/**
 * LA CARTE POUR LES LECTEURS (Opportunités, Repérage) : null sans carte ; sinon { id, mois, calculeLe, aJour,
 * index: Map(« championnat|colonne » → case) }. Relue seulement quand une nouvelle carte est rangée (une requête
 * d'une ligne à chaque lecture). `aJour` faux : les réglages du moteur ont changé depuis la carte — ses couleurs
 * sont suspendues (« Carte d'un autre moteur »).
 */
export function carteDesLecteurs({ database = null, empreinteReglages = null } = {}) {
  let db = database;
  let id;
  try {
    db ??= openDb();
    id = db.prepare('SELECT MAX(id) AS id FROM betting_map').get()?.id ?? null;
  } catch {
    return null;
  }
  if (id === null) return null;
  if (lecture.id !== id) {
    const c = lireLaCarte({ database: db, id });
    const index = new Map();
    for (const k of c?.contenu?.cases ?? []) index.set(`${k.league}|${k.colonne}`, k);
    const r = c?.resume ?? {};
    lecture = { id, valeur: c ? { id: c.id, mois: c.mois, calculeLe: c.calculeLe, empreinteReglages: c.moteur.empreinteReglages, resume: { cases: r.cases ?? 0, vertes: r.vertes ?? 0, rouges: r.rouges ?? 0, grises: r.grises ?? 0 }, index } : null };
  }
  if (!lecture.valeur) return null;
  let reglages = empreinteReglages;
  try {
    reglages ??= empreinteDesReglagesEnService();
  } catch {
    reglages = null;
  }
  return { ...lecture.valeur, aJour: reglages !== null && reglages === lecture.valeur.empreinteReglages };
}

/** La case d'un pari pour une page : { couleur, raison, mot, phrase, matchs, mois } ; null hors carte. Pure. */
export function caseDuPari(lue, league, cleDuMarche) {
  if (!lue) return null;
  const colonne = colonneDuMarcheDuReperage(cleDuMarche);
  if (!colonne) return null;
  const k = lue.index.get(`${league}|${colonne}`);
  const base = { mois: lue.mois, colonne, libelleColonne: libelleDeLaColonne(colonne) };
  if (!lue.aJour) return { ...base, couleur: 'gris', raison: 'perimee', mot: RAISONS.perimee, phrase: 'Les réglages du moteur ont changé depuis cette carte : sa couleur est suspendue jusqu’au prochain banc d’essai.', matchs: null };
  if (!k) return { ...base, couleur: 'gris', raison: 'pas-mesuree', mot: RAISONS['pas-mesuree'], phrase: phraseDeLaCase({ couleur: 'gris', raison: 'pas-mesuree' }), matchs: null };
  return { ...base, couleur: k.couleur, raison: k.raison, mot: RAISONS[k.raison] ?? k.raison, phrase: k.phrase, matchs: k.matchs ?? null };
}

/** Le rang d'une case dans un tri : vert 0, gris 1 (et sans carte), rouge 2. */
export const rangDeLaCase = (c) => (c?.couleur === 'vert' ? 0 : c?.couleur === 'rouge' ? 2 : 1);

/** Le Repérage (screener.js) avec la carte : chaque marché d'un match reçoit `carte` ; rien sans carte. Pure. */
export function avecLaCarteSurLeReperage(data, lue) {
  if (!data?.matches || !lue) return data;
  return {
    ...data,
    carte: { id: lue.id, mois: lue.mois, calculeLe: lue.calculeLe, aJour: lue.aJour },
    matches: data.matches.map((m) => ({ ...m, markets: (m.markets ?? []).map((k) => {
      const c = caseDuPari(lue, m.league, k.key);
      return c ? { ...k, carte: c } : k;
    }) }))
  };
}
