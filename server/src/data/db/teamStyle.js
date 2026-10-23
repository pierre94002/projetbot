/**
 * teamStyle.js — LES STYLES DE JEU DES ÉQUIPES ET DE LEURS ENTRAÎNEURS (étape 37 du plan, 22/10/2026).
 * -----------------------------------------------------------------------
 * Chaque club reçoit une étiquette de style, lue dans ses statistiques sur une fenêtre RÉCENTE (ses 20 derniers
 * matchs de championnat, dans les 400 jours avant le jour J) et comparée aux autres clubs de son championnat :
 *   « possession »             il garde le ballon et le fait vivre dans le dernier tiers ;
 *   « jeu direct »             une forte part de longs ballons, peu de possession ;
 *   « contre-attaque »         il laisse le ballon et tire souvent en contre (carte des tirs FotMob, « fastbreak ») ;
 *   « coups de pied arrêtés »  une forte part de ses tirs vient d'un corner, d'un coup franc ou d'une touche ;
 *   « sans style marqué »      rien ne le distingue nettement de son championnat (près d'un club sur deux).
 * Les chiffres qui justifient l'étiquette sont rangés avec elle (possession, part des longs ballons, centres, passes
 * dans le dernier tiers, part des tirs en contre, sur corner, sur coup franc). Le style est aussi rattaché à chaque
 * ENTRAÎNEUR (lu dans les compositions stockées) : ses 20 derniers matchs de championnat, tous clubs confondus.
 *
 * RÈGLE CAPITALE : le style N'ENTRE JAMAIS dans les chiffres du moteur. Ce module est HORS de MODULES_DU_MOTEUR
 * (core/engine/engineVersions.js) et aucun fichier du moteur ne l'importe (test stylesDeJeu.test.mjs). Il sert
 * d'EXPLICATION (page de l'équipe, page du match) ; les « duels de styles » sont mesurés au banc
 * (teamStyleBanc.js) avec un seuil sévère, et seule une case qui passe ce seuil est dite « effet mesuré ».
 *
 * LES SOURCES (règle des sources : tout vient de FotMob) : `team_stats` (possession, passes, longs ballons, centres,
 * passes dans le dernier tiers), `matches.shotmap` (la carte des tirs : le champ `situation` de chaque tir) et
 * `matches.lineups` (l'entraîneur, son nom et, depuis l'étape 37, son identifiant FotMob).
 *
 * LES PIÈGES, tous mesurés sur la base du bac le 22/10/2026 (scratchpad etape37/mesures) :
 *   - `situation` : huit valeurs réelles — regularplay, fromcorner, fastbreak, setpiece (coup franc indirect),
 *     freekick (coup franc direct), throwinsetpiece (touche), penalty, individualplay — présentes sur 100 % des
 *     899 574 tirs, mais la carte n'existe que pour 34 674 matchs sur 61 061 : 0 % au Pérou, en Équateur, en
 *     Roumanie, en Serbie, en Chine, en Tchéquie…, 35-40 % en Colombie, Liga 2, Serie B, Ligue 2… Sans carte (moins
 *     de 6 matchs couverts dans la fenêtre), « contre-attaque » et « coups de pied arrêtés » ne sont PAS mesurés —
 *     jamais pris pour zéro. Les penalties ne disent rien du style : retirés du compte des tirs. Les buts contre son
 *     camp non plus. Une situation inconnue compte comme un tir sans catégorie (jamais devinée).
 *   - Les zéros : longs ballons, centres, passes = 0 veut dire « non publié » (columns.ZERO_MEANS_ABSENT) : absents.
 *     Une possession hors de [5 ; 95] ou dont la somme des deux camps s'écarte de 100 de plus de 3 : absente.
 *   - L'entraîneur est un TEXTE dans le magasin (FotMob publie un identifiant que l'import jetait jusqu'ici : il est
 *     gardé depuis, et préféré quand il est là). Deux homonymes (« Diego Martinez ») font un seul nom : un nom qui
 *     ALTERNE entre deux clubs (A, puis B, puis A en moins de 120 jours) ou qui dirige deux clubs le même jour est
 *     déclaré homonyme, et suivi club par club.
 *   - Le style est instable en début de saison : la fenêtre enjambe la trêve (les derniers matchs de la saison
 *     passée comptent), l'étiquette est « provisoire » sous 12 matchs, et la page dit « surtout lu sur la saison
 *     passée » sous 6 matchs depuis la dernière trêve (un écart de 45 jours ou plus), « nouvel entraîneur » quand
 *     l'entraîneur actuel a dirigé moins de la moitié de la fenêtre.
 *   - La STABILITÉ d'un mois sur l'autre est tenue par un seuil à deux crans (hystérésis) : un club garde son
 *     étiquette du mois d'avant tant que son score ne retombe pas sous 0,5 et qu'aucun autre style ne le dépasse de
 *     0,25 ; pour quitter « sans style marqué », il faut un score d'au moins 1. Mesuré : 86 % de clubs au même style
 *     d'un mois sur l'autre sans ce cran, 93 % avec (teamStyleBanc.js, mesurerLaStabilite).
 *
 * LA NUIT (étape « stylesDeJeu » de l'actualisation ; scripts/team-style.mjs dans le bac), SOUS le verrou de la passe :
 *   1. le PROCESSUS À PART (teamStyleEnfant.js, base en LECTURE SEULE) lit la signature de chaque rencontre
 *      (updated_at, identifiants, championnat, date : des colonnes courtes) et la compare au cache
 *      `team_style_matches` : seules les rencontres NOUVELLES ou CHANGÉES sont relues en entier (carte des tirs,
 *      compositions, statistiques) — la lecture INCRÉMENTALE de la carte des tirs ; les disparues sont retirées ;
 *   2. il recalcule les styles (quelques secondes, en mémoire, depuis le cache) : un instantané au 1er de chaque mois
 *      (l'historique, pour la stabilité) et l'instantané ACTUEL (au lendemain du dernier match joué) ; les styles des
 *      entraîneurs (actuels) ; fait la différence avec ce qui est rangé ; un contrôle anti-fuite par un second chemin
 *      (20 instantanés recalculés directement depuis `matches` et `team_stats`, en SQL et JSON) ;
 *   3. le SERVEUR range seul, par tranches courtes en rendant la main.
 * Un instantané au jour J ne lit QUE des matchs joués avant J (oracle de la copie tronquée, test stylesDeJeu).
 * -----------------------------------------------------------------------
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, resolveDbPath } from './matchStatsDb.js';
import { isCup } from '../providers/leagueCups.js';
import { creerPauses, executerEnRendantLaMain, rendreLaMainParDefaut } from '../../utils/travailCooperatif.js';
import { commencerCalculLourd, CalculLourdEnCours } from '../../utils/calculLourd.js';

/** La version du calcul : la changer refait tout (cache compris). */
export const VERSION_STYLES = 1;

/**
 * LES RÉGLAGES, choisis sur la STABILITÉ d'un mois sur l'autre et la lisibilité (jamais sur un résultat de match :
 * mesures/p2.mjs et p2h.mjs du scratchpad de l'étape 37) :
 *   fenetre      20 derniers matchs de championnat (30 : plus stable, mais en retard d'une demi-saison sur un
 *                changement d'entraîneur) ;
 *   maxJours     400 : une fenêtre ne remonte pas au-delà (un club relégué hors du magasin ne garde pas un vieux
 *                style) ;
 *   minMatchs    6 : en dessous, pas de style ; etabli 12 : en dessous, « provisoire » ;
 *   minCarte     6 matchs couverts par la carte des tirs pour mesurer contre-attaque et coups de pied arrêtés ;
 *   retrecissement  150 tirs : la part de tirs en contre (ou sur coup de pied arrêté) est ramenée vers celle du
 *                championnat comme si l'équipe avait 150 tirs « moyens » de plus (sans cela, 15 contres sur 240 tirs
 *                font un style au hasard) ;
 *   seuil        0,75 écart-type au-dessus des clubs de son championnat pour une étiquette ;
 *   cran         0,25 (l'hystérésis, voir plus haut) ;
 *   minEquipes   6 clubs dans le championnat pour une référence ;
 *   treve        45 jours sans match = une trêve (début de saison) ; debutSaison 6 matchs ;
 *   homonymes    120 jours (A, B, A).
 */
export const REGLAGES_STYLE = Object.freeze({
  fenetre: 20,
  maxJours: 400,
  minMatchs: 6,
  etabli: 12,
  minCarte: 6,
  retrecissement: 150,
  seuil: 0.75,
  cran: 0.25,
  minEquipes: 6,
  treve: 45,
  debutSaison: 6,
  homonymes: 120
});

/** Les styles, dans l'ordre où on les départage à égalité ; « equilibre » n'est pas un style. */
export const STYLES = Object.freeze([
  Object.freeze({ id: 'possession', libelle: 'possession', phrase: 'il garde le ballon et le fait vivre dans le dernier tiers' }),
  Object.freeze({ id: 'direct', libelle: 'jeu direct', phrase: 'il joue long vers l’avant et laisse souvent le ballon à l’adversaire' }),
  Object.freeze({ id: 'contre', libelle: 'contre-attaque', phrase: 'il laisse le ballon et frappe vite quand il le récupère' }),
  Object.freeze({ id: 'cpa', libelle: 'coups de pied arrêtés', phrase: 'une grande part de ses tirs vient d’un corner, d’un coup franc ou d’une touche' })
]);
export const SANS_STYLE = Object.freeze({ id: 'equilibre', libelle: 'sans style marqué', phrase: 'rien ne le distingue nettement des autres clubs de son championnat' });
export const STYLES_ET_EQUILIBRE = Object.freeze([...STYLES.map((s) => s.id), SANS_STYLE.id]);
export const libelleDuStyle = (id) => (STYLES.find((s) => s.id === id) ?? (id === SANS_STYLE.id ? SANS_STYLE : null))?.libelle ?? null;

/** Les huit valeurs réelles du champ `situation` de la carte des tirs FotMob, et ce qu'on en fait. */
export const SITUATIONS = Object.freeze({
  regularplay: 'jeu',
  individualplay: 'jeu',
  fastbreak: 'contre',
  fromcorner: 'corner',
  freekick: 'coupFranc',
  setpiece: 'coupFranc',
  throwinsetpiece: 'touche',
  penalty: 'penalty'
});

/** Les ingrédients mesurés, dans l'ordre des colonnes ; `z` = écart à son championnat, en écarts-types. */
export const INGREDIENTS = Object.freeze(['poss', 'longs', 'centres', 'tiers', 'contre', 'cpa']);

const JOUR_MS = 86_400_000;
export const numeroDuJour = (iso) => Math.floor(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / JOUR_MS);
export const jourIso = (n) => new Date(n * JOUR_MS).toISOString().slice(0, 10);
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const r4 = (x) => (fini(x) ? Math.round(x * 1e4) / 1e4 : null);
const r3 = (x) => (fini(x) ? Math.round(x * 1e3) / 1e3 : null);

function fnv(texte) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
/** L'empreinte des réglages (et de la version) : rangée avec chaque ligne. */
export function empreinteDesReglages(reglages = REGLAGES_STYLE) {
  return `v${VERSION_STYLES}-${fnv(JSON.stringify(reglages))}`;
}

/** « fotmob-8456 » ou 8456 → 8456 ; jamais 0 (l'identifiant 0 est partagé par des inconnus chez FotMob). */
export const numeroDe = (id) => {
  const m = /^(?:fotmob-)?([1-9]\d*)$/.exec(String(id ?? '').trim());
  return m ? Number(m[1]) : null;
};

// ======================================================= 1. une rencontre → deux lignes d'ingrédients (pur)

const positif = (v) => (fini(v) && v > 0 ? v : null);

/**
 * La possession des deux camps, contrôlée : une valeur hors de [5 ; 95], ou deux valeurs dont la somme s'écarte de
 * 100 de plus de 3, sont ABSENTES (jamais corrigées).
 */
export function possessionsLues(dom, ext) {
  const ok = (v) => fini(v) && v >= 5 && v <= 95;
  let d = ok(dom) ? dom : null;
  let e = ok(ext) ? ext : null;
  if (d !== null && e !== null && Math.abs(d + e - 100) > 3) {
    d = null;
    e = null;
  }
  return [d, e];
}

/** Le nom d'un entraîneur, ramené à une forme stable : espaces, casse, accents gardés (FotMob les écrit toujours pareil). */
export const nomDEntraineur = (nom) => (typeof nom === 'string' && nom.trim() ? nom.trim().replace(/\s+/g, ' ') : null);

/**
 * Les tirs d'un camp, comptés par situation : penalties et buts contre son camp retirés ; une situation inconnue (ou
 * absente) compte dans `tirs` et dans `autres`, jamais dans une catégorie.
 */
export function tirsDuCamp(carte, camp) {
  const out = { tirs: 0, contre: 0, corner: 0, coupFranc: 0, touche: 0, autres: 0 };
  for (const x of carte) {
    if (!x || x.side !== camp || x.ownGoal) continue;
    const s = SITUATIONS[String(x.situation ?? '').toLowerCase()] ?? null;
    if (s === 'penalty') continue;
    out.tirs++;
    if (s === 'contre' || s === 'corner' || s === 'coupFranc' || s === 'touche') out[s]++;
    else if (s === null) out.autres++;
  }
  return out;
}

const lireJson = (t) => {
  if (t === null || t === undefined || t === '') return null;
  if (typeof t !== 'string') return t;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

/**
 * Les deux lignes d'ingrédients d'une rencontre (domicile puis extérieur), ou [] si un club n'a pas d'identifiant.
 * `m` : { match_key, date, league, home_id, away_id, updated_at, lineups, shotmap } (textes JSON ou objets) ;
 * `stats` : { home, away } — les colonnes de team_stats (ball_possession, total_passes, long_balls, crosses,
 * final_third_passes). Pur.
 */
export function ingredientsDuMatch(m, stats = {}) {
  const dom = numeroDe(m.home_id);
  const ext = numeroDe(m.away_id);
  if (dom === null || ext === null || dom === ext) return [];
  const carte = lireJson(m.shotmap);
  const avecCarte = Array.isArray(carte) && carte.length > 0;
  const compo = lireJson(m.lineups);
  const [pd, pe] = possessionsLues(stats.home?.ball_possession ?? null, stats.away?.ball_possession ?? null);
  const sig = signatureDe(m);
  const coupe = isCup(m.league) ? 1 : 0;
  return [
    ['home', 1, dom, ext, pd],
    ['away', 0, ext, dom, pe]
  ].map(([cote, camp, club, adversaire, poss]) => {
    const s = stats[cote] ?? {};
    const t = avecCarte ? tirsDuCamp(carte, cote) : null;
    const coach = compo?.[cote] ?? null;
    return {
      match_key: m.match_key,
      camp,
      club,
      adversaire,
      date: m.date,
      league: m.league,
      coupe,
      sig,
      coach: nomDEntraineur(coach?.coach),
      coach_id: numeroDe(coach?.coachId),
      poss,
      passes: positif(s.total_passes),
      longs: positif(s.long_balls),
      centres: positif(s.crosses),
      tiers: positif(s.final_third_passes),
      carte: avecCarte ? 1 : 0,
      tirs: t ? t.tirs : null,
      contre: t ? t.contre : null,
      corner: t ? t.corner : null,
      coup_franc: t ? t.coupFranc : null,
      touche: t ? t.touche : null,
      autres: t ? t.autres : null
    };
  });
}

/** La signature courte d'une rencontre : ce qui, changé, oblige à la relire (jamais la carte des tirs elle-même). */
export const signatureDe = (m) => [m.updated_at ?? '', m.home_id ?? '', m.away_id ?? '', m.league ?? '', m.date ?? ''].join('|');

/** Les colonnes rangées de team_style_matches, dans l'ordre de la table. */
export const COLONNES_INGREDIENTS = Object.freeze([
  'match_key', 'camp', 'club', 'adversaire', 'date', 'league', 'coupe', 'sig', 'coach', 'coach_id',
  'poss', 'passes', 'longs', 'centres', 'tiers', 'carte', 'tirs', 'contre', 'corner', 'coup_franc', 'touche', 'autres'
]);

// ======================================================= 2. une fenêtre → des taux (pur)

/** Les sommes d'une fenêtre de lignes (championnat seulement). */
export function sommesDe(lignes) {
  const s = { n: lignes.length, nPoss: 0, poss: 0, nLongs: 0, longs: 0, passes: 0, nCentres: 0, centres: 0, nTiers: 0, tiers: 0, nCarte: 0, tirs: 0, contre: 0, corner: 0, coupFranc: 0, touche: 0 };
  for (const r of lignes) {
    if (fini(r.poss)) {
      s.nPoss++;
      s.poss += r.poss;
    }
    if (r.longs && r.passes) {
      s.nLongs++;
      s.longs += r.longs;
      s.passes += r.passes;
    }
    if (r.centres) {
      s.nCentres++;
      s.centres += r.centres;
    }
    if (r.tiers) {
      s.nTiers++;
      s.tiers += r.tiers;
    }
    if (r.carte) {
      s.nCarte++;
      s.tirs += r.tirs ?? 0;
      s.contre += r.contre ?? 0;
      s.corner += r.corner ?? 0;
      s.coupFranc += r.coup_franc ?? 0;
      s.touche += r.touche ?? 0;
    }
  }
  return s;
}

/**
 * Les taux d'une fenêtre : possession moyenne (%), part des longs ballons dans les passes, centres et passes dans le
 * dernier tiers par match ; parts BRUTES des tirs (hors penalties) en contre, sur coup de pied arrêté (corner + coup
 * franc + touche), sur corner, sur coup franc. null quand l'ingrédient n'est pas mesuré (moins de `min` matchs).
 */
export function tauxDe(s, { min = REGLAGES_STYLE.minMatchs, minCarte = REGLAGES_STYLE.minCarte } = {}) {
  const carte = s.nCarte >= minCarte && s.tirs > 0;
  const cpa = s.corner + s.coupFranc + s.touche;
  return {
    poss: s.nPoss >= min ? s.poss / s.nPoss : null,
    longs: s.nLongs >= min ? s.longs / s.passes : null,
    longsParMatch: s.nLongs >= min ? s.longs / s.nLongs : null,
    centres: s.nCentres >= min ? s.centres / s.nCentres : null,
    tiers: s.nTiers >= min ? s.tiers / s.nTiers : null,
    contre: carte ? s.contre / s.tirs : null,
    cpa: carte ? cpa / s.tirs : null,
    corner: carte ? s.corner / s.tirs : null,
    coupFranc: carte ? s.coupFranc / s.tirs : null
  };
}

/** Une part ramenée vers celle du championnat (`p`) comme si l'équipe avait `k` tirs « moyens » de plus. */
export const partRetrecie = (compte, tirs, p, k = REGLAGES_STYLE.retrecissement) => (fini(p) && tirs >= 0 ? (compte + k * p) / (tirs + k) : null);

const moyenne = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const ecartType = (a) => {
  if (a.length < 2) return null;
  const m = moyenne(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
};

/**
 * La RÉFÉRENCE d'un championnat au jour J : la moyenne et l'écart-type de chaque ingrédient parmi ses clubs (au
 * moins `minEquipes`), les parts de tirs mises en commun (pour le rétrécissement). `equipes` : [{ s: sommes, t: taux
 * }] des clubs dont le dernier match de championnat avant J est dans ce championnat. Rend null si trop peu de clubs.
 */
export function referenceDuChampionnat(equipes, reglages = REGLAGES_STYLE) {
  if (equipes.length < reglages.minEquipes) return null;
  let tirs = 0;
  let contre = 0;
  let cpa = 0;
  for (const e of equipes) {
    if (e.t.contre === null) continue;
    tirs += e.s.tirs;
    contre += e.s.contre;
    cpa += e.s.corner + e.s.coupFranc + e.s.touche;
  }
  const pool = { contre: tirs ? contre / tirs : null, cpa: tirs ? cpa / tirs : null };
  const ref = { equipes: equipes.length, pool, m: {}, sd: {}, brut: {} };
  for (const k of INGREDIENTS) {
    const v = equipes.map((e) => valeurPourLeZ(e, k, pool, reglages)).filter(fini);
    const sd = v.length >= reglages.minEquipes ? ecartType(v) : null;
    ref.m[k] = v.length >= reglages.minEquipes ? moyenne(v) : null;
    ref.sd[k] = sd && sd > 1e-12 ? sd : null;
  }
  // Les moyennes BRUTES du championnat (ce que l'écran met à côté des chiffres du club).
  for (const k of ['poss', 'longs', 'longsParMatch', 'centres', 'tiers', 'contre', 'cpa', 'corner', 'coupFranc']) {
    const v = equipes.map((e) => e.t[k]).filter(fini);
    ref.brut[k] = v.length >= reglages.minEquipes ? moyenne(v) : null;
  }
  return ref;
}

/** La valeur d'un ingrédient qui entre dans le z : les parts de tirs RÉTRÉCIES, les autres telles quelles. */
function valeurPourLeZ(e, k, pool, reglages) {
  if (k === 'contre') return e.t.contre === null ? null : partRetrecie(e.s.contre, e.s.tirs, pool.contre, reglages.retrecissement);
  if (k === 'cpa') return e.t.cpa === null ? null : partRetrecie(e.s.corner + e.s.coupFranc + e.s.touche, e.s.tirs, pool.cpa, reglages.retrecissement);
  return e.t[k];
}

/** Les z d'une équipe face à la référence de son championnat (null quand l'ingrédient ou la référence manque). */
export function zDe(e, ref, reglages = REGLAGES_STYLE) {
  const z = {};
  for (const k of INGREDIENTS) {
    const v = ref ? valeurPourLeZ(e, k, ref.pool, reglages) : null;
    z[k] = fini(v) && ref?.sd[k] && fini(ref.m[k]) ? (v - ref.m[k]) / ref.sd[k] : null;
  }
  return z;
}

const moyenneDispo = (a, b) => (a === null ? b : b === null ? a : (a + b) / 2);

/**
 * Les SCORES de chaque style (en écarts-types) :
 *   possession = moyenne du z de la possession et de celui des passes dans le dernier tiers ;
 *   direct     = (z des longs ballons − z de la possession) / 2 — il joue long ET laisse le ballon ;
 *   contre     = z de la part de tirs en contre, seulement si l'équipe n'a PAS plus le ballon que la moyenne ;
 *   cpa        = z de la part de tirs sur coup de pied arrêté.
 * null = pas mesuré.
 */
export function scoresDe(z) {
  return {
    possession: moyenneDispo(z.poss ?? null, z.tiers ?? null),
    direct: z.longs === null || z.longs === undefined || z.poss === null || z.poss === undefined ? null : (z.longs - z.poss) / 2,
    contre: z.contre === null || z.contre === undefined || z.poss === null || z.poss === undefined || z.poss > 0 ? null : z.contre,
    cpa: z.cpa ?? null
  };
}

/**
 * L'ÉTIQUETTE (et la seconde) à partir des scores, avec le cran (hystérésis) quand l'étiquette du mois d'avant est
 * connue (`precedente`). Rend { style, second }.
 */
export function etiquetteDe(scores, precedente = null, reglages = REGLAGES_STYLE) {
  const { seuil, cran } = reglages;
  const classes = STYLES.map((s) => s.id).filter((id) => fini(scores[id]) && scores[id] >= seuil).sort((a, b) => scores[b] - scores[a] || STYLES.findIndex((s) => s.id === a) - STYLES.findIndex((s) => s.id === b));
  let style = classes[0] ?? SANS_STYLE.id;
  if (precedente && precedente !== style && STYLES_ET_EQUILIBRE.includes(precedente)) {
    const meilleur = classes[0] ? scores[classes[0]] : null;
    if (precedente === SANS_STYLE.id) {
      if (meilleur === null || meilleur < seuil + cran) style = precedente;
    } else {
      const sp = scores[precedente];
      if (fini(sp) && sp >= seuil - cran && (meilleur === null || meilleur < sp + cran)) style = precedente;
    }
  }
  const second = classes.find((id) => id !== style) ?? null;
  return { style, second };
}

// ======================================================= 3. le calcul de tous les styles (en mémoire, pur)

/** Le 1er de chaque mois, du mois qui suit `de` jusqu'au mois de `a` compris (jours AAAA-MM-01). */
export function premiersDuMois(de, a) {
  const out = [];
  if (!de || !a) return out;
  let y = Number(de.slice(0, 4));
  let m = Number(de.slice(5, 7)) + 1;
  for (;;) {
    if (m > 12) {
      y++;
      m = 1;
    }
    const j = `${y}-${String(m).padStart(2, '0')}-01`;
    if (j > a) break;
    out.push(j);
    m++;
  }
  return out;
}

/**
 * LES ENTRAÎNEURS : la clé de chaque ligne. L'identifiant FotMob quand il est connu (« id:30723 ») ; sinon le nom
 * (« nom:Diego Martinez »), sauf pour un HOMONYME — un nom qui alterne entre deux clubs (A, B, A en moins de
 * `homonymes` jours) ou qui dirige deux clubs le même jour — suivi alors club par club (« nom:Diego
 * Martinez|club:8306 »). ANTI-FUITE : un nom ne devient homonyme qu'au jour où l'alternance (ou le double match) est
 * VUE — la date du premier retour au club A, ou du jour aux deux clubs (`depuis`) ; un instantané au jour J ne
 * sépare que les homonymes vus AVANT J (cleAuJour). Rend { cles: Map ligne → clé avec tout ce qui est donné,
 * homonymes: Set des noms, depuis: Map nom → jour de la découverte, cleAuJour(ligne, J) }.
 */
export function clesDesEntraineurs(lignes, reglages = REGLAGES_STYLE) {
  const parNom = new Map();
  for (const r of lignes) {
    if (r.coach_id || !r.coach) continue;
    if (!parNom.has(r.coach)) parNom.set(r.coach, []);
    parNom.get(r.coach).push(r);
  }
  const homonymes = new Set();
  const depuis = new Map();
  for (const [nom, liste] of parNom) {
    const tri = [...liste].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.club - b.club));
    const parJour = new Map();
    let decouverte = null;
    for (const r of tri) {
      const c = parJour.get(r.date);
      if (c !== undefined && c !== r.club && (decouverte === null || r.date < decouverte)) decouverte = r.date;
      parJour.set(r.date, r.club);
    }
    const suites = [];
    for (const r of tri) {
      const der = suites.at(-1);
      if (der && der.club === r.club) der.fin = r.date;
      else suites.push({ club: r.club, debut: r.date, fin: r.date });
    }
    for (let i = 0; i + 2 < suites.length; i++) {
      if (suites[i].club === suites[i + 2].club && suites[i].club !== suites[i + 1].club && numeroDuJour(suites[i + 2].debut) - numeroDuJour(suites[i].fin) <= reglages.homonymes) {
        if (decouverte === null || suites[i + 2].debut < decouverte) decouverte = suites[i + 2].debut;
        break;
      }
    }
    if (decouverte !== null) {
      homonymes.add(nom);
      depuis.set(nom, decouverte);
    }
  }
  const cleAuJour = (r, J = null) => {
    if (r.coach_id) return `id:${r.coach_id}`;
    if (!r.coach) return null;
    const d = depuis.get(r.coach);
    return d !== undefined && (J === null || d < J) ? `nom:${r.coach}|club:${r.club}` : `nom:${r.coach}`;
  };
  const cles = new Map();
  for (const r of lignes) {
    const k = cleAuJour(r);
    if (k) cles.set(r, k);
  }
  return { cles, homonymes, depuis, cleAuJour };
}

/**
 * LE CALCUL DES STYLES sur un jeu de lignes d'ingrédients (le cache, ou une copie tronquée) : seules les lignes de
 * CHAMPIONNAT comptent (les coupes mêlent les niveaux). Chaque instantané au jour J ne lit que les lignes d'avant J.
 */
export class CalculDesStyles {
  constructor(lignes, reglages = REGLAGES_STYLE) {
    this.reglages = reglages;
    this.lignes = lignes.filter((r) => !r.coupe && r.club && r.date).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.match_key < b.match_key ? -1 : a.match_key > b.match_key ? 1 : a.camp - b.camp));
    this.parClub = new Map();
    for (const r of this.lignes) {
      if (!this.parClub.has(r.club)) this.parClub.set(r.club, []);
      this.parClub.get(r.club).push(r);
    }
    this.clubs = [...this.parClub.keys()].sort((a, b) => a - b);
    const { cles, homonymes, cleAuJour } = clesDesEntraineurs(this.lignes, reglages);
    this.cleEntraineur = cles;
    this.homonymes = homonymes;
    this.cleAuJour = cleAuJour;
    this.parEntraineur = new Map();
    for (const r of this.lignes) {
      const k = cles.get(r);
      if (!k) continue;
      if (!this.parEntraineur.has(k)) this.parEntraineur.set(k, []);
      this.parEntraineur.get(k).push(r);
    }
    this.instantanes = new Map();
  }

  /** Le dernier jour joué (AAAA-MM-JJ) parmi les lignes de championnat, ou null. */
  get dernierJour() {
    return this.lignes.length ? this.lignes.at(-1).date : null;
  }

  /** Le jour de l'instantané ACTUEL : le lendemain du dernier jour joué. */
  get jourActuel() {
    const d = this.dernierJour;
    return d ? jourIso(numeroDuJour(d) + 1) : null;
  }

  /** Les `fenetre` dernières lignes d'une liste triée, avant J, dans les `maxJours` jours. */
  fenetre(liste, J) {
    let lo = 0;
    let hi = liste.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (liste[m].date < J) lo = m + 1;
      else hi = m;
    }
    const nJ = numeroDuJour(J);
    const w = [];
    for (let i = lo - 1; i >= 0 && w.length < this.reglages.fenetre; i--) {
      if (nJ - numeroDuJour(liste[i].date) > this.reglages.maxJours) break;
      w.push(liste[i]);
    }
    return { w, avant: lo };
  }

  /** Le nombre de matchs depuis la dernière trêve (un écart ≥ `treve` jours), avant J. */
  matchsDepuisLaTreve(liste, avant) {
    let n = 0;
    for (let i = avant - 1; i >= 0; i--) {
      n++;
      if (i > 0 && numeroDuJour(liste[i].date) - numeroDuJour(liste[i - 1].date) >= this.reglages.treve) break;
    }
    return n;
  }

  /** Les sommes, taux et le championnat ACTUEL (celui du dernier match) de chaque club, au jour J. */
  equipesAuJour(J) {
    const out = new Map();
    for (const club of this.clubs) {
      const liste = this.parClub.get(club);
      const { w, avant } = this.fenetre(liste, J);
      if (w.length < this.reglages.minMatchs) continue;
      const s = sommesDe(w);
      out.set(club, { club, league: w[0].league, w, avant, s, t: tauxDe(s, this.reglages) });
    }
    return out;
  }

  /** Les références de chaque championnat au jour J. */
  referencesAuJour(J, equipes = this.equipesAuJour(J)) {
    const parL = new Map();
    for (const e of equipes.values()) {
      if (!parL.has(e.league)) parL.set(e.league, []);
      parL.get(e.league).push(e);
    }
    const refs = new Map();
    for (const [L, eq] of parL) {
      const ref = referenceDuChampionnat(eq, this.reglages);
      if (ref) refs.set(L, ref);
    }
    return refs;
  }

  /**
   * L'INSTANTANÉ au jour J : Map club → entrée. `precedent` : l'instantané du mois d'avant (pour le cran), ou null.
   */
  instantane(J, precedent = null) {
    const equipes = this.equipesAuJour(J);
    const refs = this.referencesAuJour(J, equipes);
    const out = new Map();
    for (const e of equipes.values()) {
      const ref = refs.get(e.league) ?? null;
      if (!ref) continue;
      const z = zDe(e, ref, this.reglages);
      const scores = scoresDe(z);
      const prec = precedent?.get(e.club)?.style ?? null;
      const { style, second } = etiquetteDe(scores, prec, this.reglages);
      const liste = this.parClub.get(e.club);
      // La clé de l'entraîneur AU JOUR J (un homonyme découvert après J n'est pas encore séparé : anti-fuite).
      const derniere = e.w.find((r) => this.cleAuJour(r, J)) ?? null;
      const cleCoach = derniere ? this.cleAuJour(derniere, J) : null;
      let sousLui = 0;
      // Les matchs de l'entraîneur actuel, du plus récent au plus ancien, jusqu'au premier d'un autre (une feuille
      // sans entraîneur ne coupe pas la suite).
      if (cleCoach) for (const r of e.w) {
        const k = this.cleAuJour(r, J);
        if (!k) continue;
        if (k === cleCoach) sousLui++;
        else break;
      }
      out.set(e.club, {
        club: e.club,
        jour: J,
        league: e.league,
        n: e.w.length,
        nCarte: e.s.nCarte,
        nSaison: this.matchsDepuisLaTreve(liste, e.avant),
        dernierMatch: e.w[0].date,
        style,
        second,
        provisoire: e.w.length < this.reglages.etabli,
        entraineur: cleCoach,
        sousLui,
        t: e.t,
        tirs: e.s.tirs,
        z,
        scores,
        ref
      });
    }
    return out;
  }

  /**
   * La SUITE des instantanés au 1er de chaque mois (du mois qui suit la première ligne au mois de l'actuel), puis
   * l'ACTUEL (au lendemain du dernier jour joué, avec le cran du 1er du mois en cours) : [[jour, instantané]].
   * `jusqua` : s'arrêter aux mois ≤ ce jour (le banc).
   */
  suite({ jusqua = null } = {}) {
    if (!this.lignes.length) return [];
    const actuel = this.jourActuel;
    const fin = jusqua ?? actuel;
    const jours = premiersDuMois(this.lignes[0].date, fin);
    const out = [];
    let precedent = null;
    for (const J of jours) {
      const inst = this.instantane(J, precedent);
      this.instantanes.set(J, inst);
      out.push([J, inst]);
      precedent = inst;
    }
    if (!jusqua && actuel && !jours.includes(actuel)) {
      const inst = this.instantane(actuel, precedent);
      this.instantanes.set(actuel, inst);
      out.push([actuel, inst]);
    }
    return out;
  }

  /**
   * Le style d'un ENTRAÎNEUR au jour J : ses `fenetre` derniers matchs de championnat avant J, tous clubs confondus,
   * chaque morceau (club) comparé à la référence du championnat de ce club au jour J ; les z pondérés par le nombre
   * de matchs (et de matchs couverts par la carte pour les parts de tirs). Rend null s'il a moins de `minMatchs`.
   */
  entraineurAuJour(cle, J, refs, equipes) {
    const liste = this.parEntraineur.get(cle);
    if (!liste) return null;
    const { w } = this.fenetre(liste, J);
    if (w.length < this.reglages.minMatchs) return null;
    const morceaux = new Map();
    for (const r of w) {
      if (!morceaux.has(r.club)) morceaux.set(r.club, []);
      morceaux.get(r.club).push(r);
    }
    const zs = Object.fromEntries(INGREDIENTS.map((k) => [k, { s: 0, w: 0 }]));
    const clubs = [];
    for (const [club, lignes] of morceaux) {
      const L = equipes.get(club)?.league ?? lignes[0].league;
      const ref = refs.get(L) ?? null;
      const s = sommesDe(lignes);
      const t = tauxDe(s, { min: 1, minCarte: 1 });
      clubs.push({ club, league: L, n: lignes.length, de: lignes.at(-1).date, a: lignes[0].date });
      if (!ref) continue;
      const z = zDe({ s, t }, ref, this.reglages);
      for (const k of INGREDIENTS) {
        if (!fini(z[k])) continue;
        const poids = k === 'contre' || k === 'cpa' ? s.nCarte : lignes.length;
        zs[k].s += z[k] * poids;
        zs[k].w += poids;
      }
    }
    const z = {};
    for (const k of INGREDIENTS) {
      const minimum = k === 'contre' || k === 'cpa' ? this.reglages.minCarte : this.reglages.minMatchs;
      z[k] = zs[k].w >= minimum ? zs[k].s / zs[k].w : null;
    }
    const scores = scoresDe(z);
    const { style, second } = etiquetteDe(scores, null, this.reglages);
    const s = sommesDe(w);
    return {
      cle,
      jour: J,
      nom: w[0].coach ?? null,
      coachId: w[0].coach_id ?? null,
      homonyme: cle.includes('|club:'),
      club: w[0].club,
      clubs: clubs.sort((a, b) => (a.a < b.a ? 1 : a.a > b.a ? -1 : a.club - b.club)),
      n: w.length,
      nCarte: s.nCarte,
      style,
      second,
      provisoire: w.length < this.reglages.etabli,
      t: tauxDe(s, this.reglages),
      z,
      scores
    };
  }

  /** Les entraîneurs à l'instantané J (actuel) : Map clé → entrée, pour ceux qui ont dirigé au moins `minMatchs` matchs. */
  entraineurs(J) {
    const equipes = this.equipesAuJour(J);
    const refs = this.referencesAuJour(J, equipes);
    const out = new Map();
    for (const cle of [...this.parEntraineur.keys()].sort()) {
      const e = this.entraineurAuJour(cle, J, refs, equipes);
      if (e) out.set(cle, e);
    }
    return out;
  }
}

// ======================================================= 4. les lignes rangées

export const COLONNES_STYLE = Object.freeze([
  'club', 'jour', 'actuel', 'league', 'n', 'n_carte', 'n_saison', 'dernier_match', 'style', 'second', 'provisoire', 'entraineur', 'sous_lui',
  'poss', 'longs', 'longs_match', 'centres', 'tiers', 'contre', 'cpa', 'corner', 'coup_franc', 'tirs',
  'z_poss', 'z_longs', 'z_centres', 'z_tiers', 'z_contre', 'z_cpa', 's_possession', 's_direct', 's_contre', 's_cpa',
  'l_poss', 'l_longs', 'l_centres', 'l_tiers', 'l_contre', 'l_cpa', 'l_corner', 'l_coup_franc', 'l_equipes', 'reglages'
]);
export const COLONNES_ENTRAINEUR = Object.freeze([
  'entraineur', 'jour', 'nom', 'coach_id', 'homonyme', 'club', 'clubs', 'n', 'n_carte', 'style', 'second', 'provisoire',
  'poss', 'longs', 'centres', 'tiers', 'contre', 'cpa', 'z_poss', 'z_longs', 'z_centres', 'z_tiers', 'z_contre', 'z_cpa',
  's_possession', 's_direct', 's_contre', 's_cpa', 'reglages'
]);

/** Une entrée d'instantané → la ligne de team_style (nombres arrondis : la différence de la nuit compare des textes). */
export function ligneDeStyle(e, { actuel = false, reglages = empreinteDesReglages() } = {}) {
  return {
    club: e.club,
    jour: e.jour,
    actuel: actuel ? 1 : 0,
    league: e.league,
    n: e.n,
    n_carte: e.nCarte,
    n_saison: e.nSaison,
    dernier_match: e.dernierMatch,
    style: e.style,
    second: e.second,
    provisoire: e.provisoire ? 1 : 0,
    entraineur: e.entraineur,
    sous_lui: e.sousLui,
    poss: r4(e.t.poss),
    longs: r4(e.t.longs),
    longs_match: r4(e.t.longsParMatch),
    centres: r4(e.t.centres),
    tiers: r4(e.t.tiers),
    contre: r4(e.t.contre),
    cpa: r4(e.t.cpa),
    corner: r4(e.t.corner),
    coup_franc: r4(e.t.coupFranc),
    tirs: e.tirs,
    z_poss: r3(e.z.poss),
    z_longs: r3(e.z.longs),
    z_centres: r3(e.z.centres),
    z_tiers: r3(e.z.tiers),
    z_contre: r3(e.z.contre),
    z_cpa: r3(e.z.cpa),
    s_possession: r3(e.scores.possession),
    s_direct: r3(e.scores.direct),
    s_contre: r3(e.scores.contre),
    s_cpa: r3(e.scores.cpa),
    l_poss: r4(e.ref?.brut.poss),
    l_longs: r4(e.ref?.brut.longs),
    l_centres: r4(e.ref?.brut.centres),
    l_tiers: r4(e.ref?.brut.tiers),
    l_contre: r4(e.ref?.brut.contre),
    l_cpa: r4(e.ref?.brut.cpa),
    l_corner: r4(e.ref?.brut.corner),
    l_coup_franc: r4(e.ref?.brut.coupFranc),
    l_equipes: e.ref?.equipes ?? null,
    reglages
  };
}

/** Une entrée d'entraîneur → la ligne de coach_style. */
export function ligneDEntraineur(e, { reglages = empreinteDesReglages() } = {}) {
  return {
    entraineur: e.cle,
    jour: e.jour,
    nom: e.nom,
    coach_id: e.coachId,
    homonyme: e.homonyme ? 1 : 0,
    club: e.club,
    clubs: JSON.stringify(e.clubs.map((c) => [c.club, c.league, c.n, c.de, c.a])),
    n: e.n,
    n_carte: e.nCarte,
    style: e.style,
    second: e.second,
    provisoire: e.provisoire ? 1 : 0,
    poss: r4(e.t.poss),
    longs: r4(e.t.longs),
    centres: r4(e.t.centres),
    tiers: r4(e.t.tiers),
    contre: r4(e.t.contre),
    cpa: r4(e.t.cpa),
    z_poss: r3(e.z.poss),
    z_longs: r3(e.z.longs),
    z_centres: r3(e.z.centres),
    z_tiers: r3(e.z.tiers),
    z_contre: r3(e.z.contre),
    z_cpa: r3(e.z.cpa),
    s_possession: r3(e.scores.possession),
    s_direct: r3(e.scores.direct),
    s_contre: r3(e.scores.contre),
    s_cpa: r3(e.scores.cpa),
    reglages
  };
}

/** TOUTES les lignes (styles mensuels + actuel, entraîneurs actuels) d'un calcul : ce que les tables doivent contenir. */
export function lignesDuCalcul(calcul, { reglages = empreinteDesReglages() } = {}) {
  const suite = calcul.suite();
  const actuel = calcul.jourActuel;
  const styles = [];
  for (const [J, inst] of suite) for (const e of inst.values()) styles.push(ligneDeStyle(e, { actuel: J === actuel, reglages }));
  styles.sort((a, b) => a.club - b.club || (a.jour < b.jour ? -1 : a.jour > b.jour ? 1 : 0));
  const entraineurs = actuel ? [...calcul.entraineurs(actuel).values()].map((e) => ligneDEntraineur(e, { reglages })) : [];
  entraineurs.sort((a, b) => (a.entraineur < b.entraineur ? -1 : a.entraineur > b.entraineur ? 1 : 0));
  return { styles, entraineurs, suite, jourActuel: actuel };
}

// ======================================================= 5. la lecture de la base (le processus à part)

/** Les lignes du cache, rangées par (match_key, camp). */
export function* lireLeCache(database) {
  const out = [];
  try {
    let k = 0;
    for (const r of database.prepare(`SELECT ${COLONNES_INGREDIENTS.join(', ')} FROM team_style_matches ORDER BY match_key, camp`).iterate()) {
      out.push({ ...r });
      if (++k % 20_000 === 0) yield 'cache';
    }
  } catch (error) {
    if (!/no such table/i.test(String(error?.message ?? ''))) throw error;
  }
  return out;
}

/** Les signatures de toutes les rencontres (colonnes courtes seulement). */
export function* lireLesSignatures(database) {
  const out = new Map();
  let k = 0;
  for (const m of database.prepare('SELECT match_key, date, league, home_id, away_id, updated_at FROM matches').iterate()) {
    out.set(m.match_key, signatureDe(m));
    if (++k % 20_000 === 0) yield 'signatures';
  }
  return out;
}

const COLONNES_STATS = 'side, ball_possession, total_passes, long_balls, crosses, final_third_passes';

/** Les lignes d'ingrédients de quelques rencontres, relues EN ENTIER (carte des tirs comprise). */
export function* relireLesRencontres(database, cles) {
  const out = [];
  const m = database.prepare('SELECT match_key, date, league, home_id, away_id, updated_at, lineups, shotmap FROM matches WHERE match_key = ?');
  const st = database.prepare(`SELECT ${COLONNES_STATS} FROM team_stats WHERE match_key = ?`);
  let k = 0;
  for (const cle of cles) {
    const r = m.get(cle);
    if (!r) continue;
    const stats = Object.fromEntries(st.all(cle).map((x) => [x.side, x]));
    out.push(...ingredientsDuMatch(r, stats));
    if (++k % 500 === 0) yield 'relecture';
  }
  return out;
}

/** La lecture COMPLÈTE (premier calcul, ou version changée) : toutes les rencontres, d'un balayage. */
export function* lireToutesLesRencontres(database) {
  const out = [];
  const stats = new Map();
  let k = 0;
  for (const s of database.prepare(`SELECT match_key, ${COLONNES_STATS} FROM team_stats`).iterate()) {
    if (!stats.has(s.match_key)) stats.set(s.match_key, {});
    stats.get(s.match_key)[s.side] = s;
    if (++k % 20_000 === 0) yield 'statistiques';
  }
  for (const r of database.prepare('SELECT match_key, date, league, home_id, away_id, updated_at, lineups, shotmap FROM matches').iterate()) {
    out.push(...ingredientsDuMatch(r, stats.get(r.match_key) ?? {}));
    if (++k % 2_000 === 0) yield 'rencontres';
  }
  return out;
}

const cleDeLigne = (r) => `${r.match_key}|${r.camp}`;
const egal = (a, b, colonnes) => colonnes.every((c) => (a[c] ?? null) === (b[c] ?? null));

/** Les lignes rangées d'une table, en Map clé → ligne. */
function rangees(database, table, colonnes, cle) {
  const out = new Map();
  try {
    for (const r of database.prepare(`SELECT ${colonnes.join(', ')} FROM ${table}`).iterate()) out.set(cle(r), { ...r });
  } catch (error) {
    if (!/no such table/i.test(String(error?.message ?? ''))) throw error;
  }
  return out;
}

/** La différence entre des lignes calculées et des lignes rangées : { ecrire, retirer: [clés en objets] }. */
function difference(calculees, rangeesMap, colonnes, cle, cleEnObjet) {
  const ecrire = [];
  const vues = new Set();
  for (const c of calculees) {
    const k = cle(c);
    vues.add(k);
    const r = rangeesMap.get(k);
    if (!r || !egal(c, r, colonnes)) ecrire.push(c);
  }
  const retirer = [];
  for (const [k, r] of rangeesMap) if (!vues.has(k)) retirer.push(cleEnObjet(r));
  return { ecrire, retirer };
}

// ======================================================= 6. le contrôle anti-fuite (un second chemin)

/** Le nombre d'instantanés recontrôlés chaque nuit. */
export const CONTROLE = Object.freeze({ instantanes: 20 });

function tirage(graine) {
  let s = graine >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Les (club, jour) recontrôlés : tirés parmi les lignes calculées, avec la graine du jour. */
export function couplesDuControle(styles, graine, nombre = CONTROLE.instantanes) {
  if (!styles.length || graine === null || graine === undefined) return [];
  const hasard = tirage(graine);
  const choisis = new Map();
  for (let essai = 0; essai < nombre * 20 && choisis.size < Math.min(nombre, styles.length); essai++) {
    const l = styles[Math.floor(hasard() * styles.length)];
    choisis.set(`${l.club}|${l.jour}`, l);
  }
  return [...choisis.values()];
}

/**
 * LE SECOND CHEMIN : pour un club et un jour J, ses `fenetre` derniers matchs de championnat avant J relus
 * DIRECTEMENT dans `matches` et `team_stats` (SQL, JSON de la carte), sans le cache ni le calcul en mémoire. Rend les
 * sommes (n, possession, longs ballons, tirs, contres, coups de pied arrêtés).
 */
export function sommesParLeSecondChemin(database, club, J, reglages = REGLAGES_STYLE) {
  const id = `fotmob-${club}`;
  const limite = jourIso(numeroDuJour(J) - reglages.maxJours);
  const lignes = [];
  const st = database.prepare(`SELECT ${COLONNES_STATS} FROM team_stats WHERE match_key = ?`);
  for (const m of database
    .prepare('SELECT match_key, date, league, home_id, away_id, updated_at, lineups, shotmap FROM matches WHERE (home_id = ? OR away_id = ?) AND date < ? AND date >= ? ORDER BY date DESC, match_key DESC')
    .iterate(id, id, J, limite)) {
    if (isCup(m.league)) continue;
    const stats = Object.fromEntries(st.all(m.match_key).map((x) => [x.side, x]));
    const deux = ingredientsDuMatch(m, stats);
    const l = deux.find((r) => r.club === club);
    if (l) lignes.push(l);
  }
  // Même ordre que le calcul (date, clé, camp — décroissant) : à date égale, la clé départage.
  lignes.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.match_key < b.match_key ? 1 : a.match_key > b.match_key ? -1 : b.camp - a.camp));
  const w = lignes.slice(0, reglages.fenetre);
  return sommesDe(w);
}

/** Le contrôle : les sommes du calcul face au second chemin, pour chaque couple tiré. Rend { lignes, ecarts }. */
export function* controleDesInstantanes(database, calcul, couples) {
  const ecarts = [];
  for (const c of couples) {
    const { w } = calcul.fenetre(calcul.parClub.get(c.club) ?? [], c.jour);
    const a = sommesDe(w);
    const b = sommesParLeSecondChemin(database, c.club, c.jour, calcul.reglages);
    for (const k of ['n', 'nPoss', 'nLongs', 'nCarte', 'tirs', 'contre', 'corner', 'coupFranc', 'touche']) {
      if (a[k] !== b[k]) ecarts.push({ club: c.club, J: c.jour, colonne: k, calcul: a[k], second: b[k] });
    }
    for (const k of ['poss', 'longs', 'passes']) {
      if (Math.abs(a[k] - b[k]) > 1e-6) ecarts.push({ club: c.club, J: c.jour, colonne: k, calcul: a[k], second: b[k] });
    }
    yield 'contrôle';
  }
  return { lignes: couples.length, ecarts };
}

// ======================================================= 7. le calcul complet (processus à part, base en lecture seule)

/**
 * LE CALCUL, sur une base ouverte EN LECTURE SEULE : le cache et les signatures ; les rencontres nouvelles ou
 * changées relues en entier (tout, au premier calcul ou à une autre version) ; rien de changé et le même jour
 * actuel → { rien: true } ; sinon les styles (suite mensuelle + actuel), les entraîneurs, la différence avec les
 * tables rangées, le contrôle. Générateur. Rend { rien, ingredients: { ecrire, retirer }, styles, entraineurs,
 * jusqua, jourActuel, controle, bilan }.
 */
export function* calculerLesStyles({ database, precedente = null, force = false, graine = null } = {}) {
  const debut = performance.now();
  const reglages = empreinteDesReglages();
  const toutRelire = force || !precedente || precedente.reglages !== reglages;
  const cache = toutRelire ? [] : yield* lireLeCache(database);
  const signatures = yield* lireLesSignatures(database);
  const tSignatures = performance.now();
  let lignes;
  let changees = 0;
  let disparues = 0;
  let relues = 0;
  const ingredients = { ecrire: [], retirer: [] };
  if (toutRelire) {
    lignes = yield* lireToutesLesRencontres(database);
    relues = new Set(lignes.map((l) => l.match_key)).size;
    const rangeesMap = rangees(database, 'team_style_matches', COLONNES_INGREDIENTS, cleDeLigne);
    const d = difference(lignes, rangeesMap, COLONNES_INGREDIENTS, cleDeLigne, (r) => ({ match_key: r.match_key, camp: r.camp }));
    ingredients.ecrire = d.ecrire;
    ingredients.retirer = d.retirer;
  } else {
    const parCle = new Map();
    for (const l of cache) {
      if (!parCle.has(l.match_key)) parCle.set(l.match_key, []);
      parCle.get(l.match_key).push(l);
    }
    const aRelire = [];
    for (const [cle, sig] of signatures) {
      const c = parCle.get(cle);
      if (!c || c[0].sig !== sig) aRelire.push(cle);
    }
    for (const [cle, c] of parCle) {
      if (!signatures.has(cle)) {
        disparues++;
        for (const l of c) ingredients.retirer.push({ match_key: l.match_key, camp: l.camp });
        parCle.delete(cle);
      }
    }
    const nouvelles = yield* relireLesRencontres(database, aRelire);
    relues = aRelire.length;
    const parCleNouv = new Map();
    for (const l of nouvelles) {
      if (!parCleNouv.has(l.match_key)) parCleNouv.set(l.match_key, []);
      parCleNouv.get(l.match_key).push(l);
    }
    for (const cle of aRelire) {
      const avant = parCle.get(cle) ?? [];
      const apres = parCleNouv.get(cle) ?? [];
      // Une rencontre relue qui ne donne plus de ligne (club sans identifiant) : ses anciennes lignes sont retirées.
      for (const l of avant) if (!apres.some((x) => x.camp === l.camp)) ingredients.retirer.push({ match_key: l.match_key, camp: l.camp });
      for (const l of apres) {
        const a = avant.find((x) => x.camp === l.camp);
        if (!a || !egal(a, l, COLONNES_INGREDIENTS)) {
          ingredients.ecrire.push(l);
          changees++;
        }
      }
      // Même rencontre relue sans changement de valeurs mais avec une nouvelle signature : la signature est réécrite.
      if (apres.length) parCle.set(cle, apres);
      else parCle.delete(cle);
    }
    lignes = [...parCle.values()].flat();
  }
  const tLecture = performance.now();
  const calcul = new CalculDesStyles(lignes);
  const jourActuel = calcul.jourActuel;
  if (!toutRelire && !force && !ingredients.ecrire.length && !ingredients.retirer.length && precedente?.jourActuel === jourActuel) {
    return { rien: true, jourActuel, dureeMs: Math.round(performance.now() - debut) };
  }
  yield 'calcul';
  const { styles, entraineurs } = lignesDuCalcul(calcul, { reglages });
  const tCalcul = performance.now();
  yield 'différence';
  const ds = difference(styles, rangees(database, 'team_style', COLONNES_STYLE, (r) => `${r.club}|${r.jour}`), COLONNES_STYLE, (r) => `${r.club}|${r.jour}`, (r) => ({ club: r.club, jour: r.jour }));
  const de = difference(entraineurs, rangees(database, 'coach_style', COLONNES_ENTRAINEUR, (r) => `${r.entraineur}|${r.jour}`), COLONNES_ENTRAINEUR, (r) => `${r.entraineur}|${r.jour}`, (r) => ({ entraineur: r.entraineur, jour: r.jour }));
  const tDifference = performance.now();
  const couples = graine !== null ? couplesDuControle(styles, graine) : [];
  const controle = couples.length ? yield* controleDesInstantanes(database, calcul, couples) : null;
  const tControle = performance.now();
  const actuels = styles.filter((s) => s.actuel === 1);
  const repartition = Object.fromEntries(STYLES_ET_EQUILIBRE.map((id) => [id, actuels.filter((s) => s.style === id && !s.provisoire).length]));
  return {
    rien: false,
    toutRelu: toutRelire,
    ingredients,
    styles: ds,
    entraineurs: de,
    jusqua: calcul.dernierJour,
    jourActuel,
    nStyles: styles.length,
    nActuels: actuels.length,
    nEntraineurs: entraineurs.length,
    controle,
    bilan: {
      rencontres: signatures.size,
      lignesIngredients: lignes.length,
      relues,
      changees,
      disparues,
      repartition,
      provisoires: actuels.filter((s) => s.provisoire).length,
      homonymes: calcul.homonymes.size,
      dureeMs: Math.round(performance.now() - debut),
      parties: {
        signatures: Math.round(tSignatures - debut),
        lecture: Math.round(tLecture - tSignatures),
        calcul: Math.round(tCalcul - tLecture),
        difference: Math.round(tDifference - tCalcul),
        controle: Math.round(tControle - tDifference)
      }
    }
  };
}

// ======================================================= 8. le processus à part

const ENFANT = fileURLToPath(new URL('./teamStyleEnfant.js', import.meta.url));
/** Le premier calcul prend ~15 s sur la base du bac : au-delà de 15 min, l'enfant est arrêté. */
export const DELAI_CALCUL_MS = 15 * 60_000;
/** La mémoire de l'enfant : tas plafonné (la carte des tirs est lue rencontre par rencontre). */
export const OPTIONS_DE_L_ENFANT = Object.freeze(['--max-old-space-size=640', '--max-semi-space-size=16']);
/** Lignes par morceau renvoyé par l'enfant. */
export const LIGNES_PAR_MORCEAU = 2000;
const TABLES = Object.freeze(['ingredients', 'styles', 'entraineurs']);

/**
 * Le calcul dans un PROCESSUS À PART (le patron des étapes 27, 29 et 30) : fork de teamStyleEnfant.js, base en
 * LECTURE SEULE. Un calcul lourd à la fois (utils/calculLourd.js) : un autre en cours → CalculLourdEnCours (reporté).
 */
export function calculerAPart({ chemin, precedente = null, force = false, graine = null, delaiMs = DELAI_CALCUL_MS }) {
  let rendre;
  try {
    rendre = commencerCalculLourd('styles de jeu');
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    let fini = false;
    let erreurs = '';
    const morceaux = { ingredients: [], styles: [], entraineurs: [] };
    const enfant = fork(ENFANT, [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'advanced', execArgv: [...process.execArgv, ...OPTIONS_DE_L_ENFANT] });
    const minuterie = setTimeout(() => {
      if (fini) return;
      fini = true;
      try {
        enfant.kill();
      } catch {
        // déjà arrêté
      }
      reject(new Error(`calcul à part arrêté : aucune réponse en ${delaiMs < 60_000 ? `${delaiMs} ms` : `${Math.round(delaiMs / 60_000)} min`}`));
    }, delaiMs);
    minuterie.unref?.();
    enfant.stderr?.on('data', (d) => {
      erreurs = (erreurs + d).slice(-2000);
    });
    enfant.on('message', (m) => {
      if (m?.morceau) {
        morceaux[m.morceau.table].push(...m.morceau.lignes);
        return;
      }
      clearTimeout(minuterie);
      if (fini) return;
      fini = true;
      if (m?.erreur) reject(new Error(m.erreur));
      else if (m.rien) resolve(m);
      else resolve({ ...m, ...Object.fromEntries(TABLES.map((t) => [t, { ecrire: morceaux[t], retirer: m[t].retirer }])) });
    });
    enfant.on('error', (error) => {
      clearTimeout(minuterie);
      if (!fini) reject(error);
      fini = true;
    });
    enfant.on('exit', (code) => {
      clearTimeout(minuterie);
      if (!fini) reject(new Error(`calcul à part arrêté sans réponse (code ${code}) ${erreurs.trim().slice(-300)}`));
      fini = true;
    });
    enfant.send({ chemin, precedente, force, graine });
  }).finally(rendre);
}
export const TABLES_DU_CALCUL = TABLES;

// ======================================================= 9. l'état et le rangement (le serveur, seul écrivain)

const json = (t) => {
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
};

/** L'ÉTAT des styles (team_style_state), tel que l'écrit le dernier rangement — JAMAIS de calcul ni d'écriture. */
export function etatDesStyles({ database = openDb() } = {}) {
  let brut = null;
  try {
    brut = Object.fromEntries(database.prepare('SELECT cle, valeur FROM team_style_state').all().map((r) => [r.cle, r.valeur]));
  } catch (error) {
    if (!/no such table/i.test(String(error?.message ?? ''))) throw error;
  }
  const version = brut?.version ? Number(brut.version) : null;
  const absent = !brut || version === null || !brut.calcule_le;
  return {
    absent,
    version,
    versionAttendue: VERSION_STYLES,
    reglages: brut?.reglages ?? null,
    reglagesAttendus: empreinteDesReglages(),
    jusqua: brut?.jusqua || null,
    jourActuel: brut?.jour_actuel || null,
    calculeLe: brut?.calcule_le ?? null,
    enCours: brut?.en_cours ?? null,
    bilan: json(brut?.bilan),
    controle: json(brut?.controle),
    aJour: !absent && version === VERSION_STYLES && brut?.reglages === empreinteDesReglages() && !brut?.en_cours
  };
}

function annuler(database) {
  try {
    if (database.isTransaction !== false) database.exec('ROLLBACK');
  } catch {
    // aucune transaction ouverte
  }
}

/** Lignes écrites (ou retirées) par transaction. */
export const TRANCHE_RANGEMENT = 250;

/**
 * RANGE un calcul (générateur ; le serveur ou le script du bac, sous le verrou de la passe) : `en_cours` posé, les
 * retraits puis les écritures par tranches, une transaction chacune, JAMAIS ouverte pendant un point d'arrêt, enfin
 * l'état. `maintenant` : une fonction qui rend l'heure (ISO), OBLIGATOIRE.
 */
export function* rangerLesStyles({ database, calcul, maintenant, tranche = TRANCHE_RANGEMENT }) {
  if (typeof maintenant !== 'function') throw new Error('rangerLesStyles : « maintenant » (une fonction qui rend l’heure) est obligatoire.');
  const etat = database.prepare('INSERT OR REPLACE INTO team_style_state (cle, valeur) VALUES (?, ?)');
  etat.run('en_cours', maintenant());
  yield 'en cours';
  let ecrites = 0;
  let retirees = 0;
  let plusLongueMs = 0;
  function* parTranches(ordres) {
    let k = 0;
    let t0 = performance.now();
    database.exec('BEGIN IMMEDIATE');
    try {
      for (const ordre of ordres) {
        ordre();
        if (++k % tranche === 0) {
          database.exec('COMMIT');
          plusLongueMs = Math.max(plusLongueMs, performance.now() - t0);
          yield 'rangement';
          t0 = performance.now();
          database.exec('BEGIN IMMEDIATE');
        }
      }
      database.exec('COMMIT');
      plusLongueMs = Math.max(plusLongueMs, performance.now() - t0);
    } catch (error) {
      annuler(database);
      throw error;
    }
  }
  const ordres = {
    ingredients: {
      retirer: database.prepare('DELETE FROM team_style_matches WHERE match_key = ? AND camp = ?'),
      cle: (k) => [k.match_key, k.camp],
      ecrire: database.prepare(`INSERT OR REPLACE INTO team_style_matches (${COLONNES_INGREDIENTS.join(', ')}) VALUES (${COLONNES_INGREDIENTS.map(() => '?').join(', ')})`),
      colonnes: COLONNES_INGREDIENTS
    },
    styles: {
      retirer: database.prepare('DELETE FROM team_style WHERE club = ? AND jour = ?'),
      cle: (k) => [k.club, k.jour],
      ecrire: database.prepare(`INSERT OR REPLACE INTO team_style (${COLONNES_STYLE.join(', ')}) VALUES (${COLONNES_STYLE.map(() => '?').join(', ')})`),
      colonnes: COLONNES_STYLE
    },
    entraineurs: {
      retirer: database.prepare('DELETE FROM coach_style WHERE entraineur = ? AND jour = ?'),
      cle: (k) => [k.entraineur, k.jour],
      ecrire: database.prepare(`INSERT OR REPLACE INTO coach_style (${COLONNES_ENTRAINEUR.join(', ')}) VALUES (${COLONNES_ENTRAINEUR.map(() => '?').join(', ')})`),
      colonnes: COLONNES_ENTRAINEUR
    }
  };
  for (const t of TABLES) {
    const o = ordres[t];
    yield* parTranches((calcul[t]?.retirer ?? []).map((k) => () => (retirees += o.retirer.run(...o.cle(k)).changes)));
  }
  for (const t of TABLES) {
    const o = ordres[t];
    yield* parTranches((calcul[t]?.ecrire ?? []).map((l) => () => {
      o.ecrire.run(...o.colonnes.map((c) => l[c] ?? null));
      ecrites++;
    }));
  }
  database.exec('BEGIN IMMEDIATE');
  try {
    etat.run('version', String(VERSION_STYLES));
    etat.run('reglages', empreinteDesReglages());
    etat.run('jusqua', calcul.jusqua ?? '');
    etat.run('jour_actuel', calcul.jourActuel ?? '');
    etat.run('calcule_le', maintenant());
    etat.run('bilan', JSON.stringify({ ...(calcul.bilan ?? {}), ecrites, retirees }));
    if (calcul.controle) etat.run('controle', JSON.stringify({ ...calcul.controle, le: maintenant() }));
    database.prepare("DELETE FROM team_style_state WHERE cle = 'en_cours'").run();
    database.exec('COMMIT');
  } catch (error) {
    annuler(database);
    throw error;
  }
  return { ecrites, retirees, plusLongueTrancheMs: Math.round(plusLongueMs) };
}

/** La graine du contrôle d'une nuit : son jour, AAAAMMJJ (UTC). */
export const graineDuJour = (instant) => Number(new Date(instant).toISOString().slice(0, 10).replace(/-/g, ''));

/**
 * LA PASSE DE NUIT (étape « stylesDeJeu » de l'actualisation ; scripts/team-style.mjs dans le bac), SOUS le verrou :
 * l'état, puis le PROCESSUS À PART attendu sans tenir la main (rien de changé : rien), puis le rangement par tranches.
 * Un autre calcul lourd en cours : « reporte » ; en échec : rien d'avancé. `maintenant` OBLIGATOIRE.
 */
export async function stylesDeJeu({
  force = false,
  database = openDb(),
  chemin = resolveDbPath(),
  aPart = true,
  delaiMs = DELAI_CALCUL_MS,
  rendreLaMain = rendreLaMainParDefaut,
  maintenant,
  controle = true
} = {}) {
  if (typeof maintenant !== 'function') throw new Error('stylesDeJeu : « maintenant » (une fonction qui rend l’heure) est obligatoire.');
  const debut = performance.now();
  const pauses = creerPauses({ rendreLaMain });
  const etat = etatDesStyles({ database });
  // Un rangement interrompu (en_cours) ou une autre version : tout est relu et tout est comparé.
  const precedente = !force && !etat.absent && !etat.enCours && etat.aJour ? { reglages: etat.reglages, jourActuel: etat.jourActuel } : null;
  const graine = controle ? graineDuJour(maintenant()) : null;
  let r;
  try {
    r = aPart
      ? await pauses.attendre(calculerAPart({ chemin, precedente, force, graine, delaiMs }), 'calcul à part')
      : await executerEnRendantLaMain(calculerLesStyles({ database, precedente, force, graine }), pauses.siLongtemps);
  } catch (error) {
    if (error instanceof CalculLourdEnCours || error?.reporte) return { mode: 'reporte', raison: error.message, dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
    return { mode: 'echec', erreur: String(error?.message ?? error), dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
  }
  if (r.rien) return { mode: 'rien', calculeLe: etat.calculeLe, jourActuel: etat.jourActuel, dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
  const tRangement = performance.now();
  let range;
  try {
    range = await executerEnRendantLaMain(rangerLesStyles({ database, calcul: r, maintenant }), pauses.siLongtemps);
  } catch (error) {
    return { mode: 'echec', erreur: `rangement : ${String(error?.message ?? error)}`, dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
  }
  return {
    mode: etat.absent ? 'premier' : r.toutRelu ? 'complet' : 'incremental',
    styles: r.nStyles,
    actuels: r.nActuels,
    entraineurs: r.nEntraineurs,
    ecrites: range.ecrites,
    retirees: range.retirees,
    plusLongueTrancheMs: range.plusLongueTrancheMs,
    jusqua: r.jusqua,
    jourActuel: r.jourActuel,
    controle: r.controle,
    bilanDuCalcul: r.bilan,
    rangementMs: Math.round(performance.now() - tRangement),
    dureeMs: Math.round(performance.now() - debut),
    ...pauses.bilan()
  };
}

// ======================================================= 10. les duels de styles mesurés au banc (recopiés)

/**
 * CE QUE LE BANC A MESURÉ (teamStyleBanc.js, scripts/team-style.mjs --banc, base du bac, 22/10/2026), RECOPIÉ ici
 * pour que l'appli de Pierre (dont la base n'a pas ce calcul) le lise : les duels de styles face à la cote de clôture
 * football-data, appris sur 2023-07 → 2025-06, vérifiés sur 2025-07 → 2026-09-23, seuil sévère (K variantes, voir
 * VARIANTES_DE_L_ETAPE_37). `cases` : les seules cases qui ont PASSÉ le seuil (vide = aucun effet prouvé : tout duel
 * est dit « explication seulement »). `reglages` : l'empreinte des réglages mesurés — si elle diffère des réglages en
 * service, rien n'est dit « mesuré » (test).
 */
export const DUELS_AU_BANC = Object.freeze({
  le: '2026-10-22',
  reglages: 'v1-91f1140e',
  K: 53,
  periode: Object.freeze({ apprentissage: Object.freeze({ de: '2023-07-01', a: '2025-06-30' }), verification: Object.freeze({ de: '2025-07-01', a: '2026-09-23' }) }),
  // 29 689 matchs de championnat aux deux styles établis avec une clôture (17 584 pour apprendre, 12 105 pour juger) ;
  // 29 cases jugées « pas prouvé », 21 « pas assez de matchs » (moins de 200 en vérification) ; aucune « retenu ».
  global: Object.freeze({
    un2: Object.freeze({ verdict: 'pas-prouve', matchs: 12105, gain: -0.00078, fourchette: Object.freeze([-0.00178, 0.00023]) }),
    pm: Object.freeze({ verdict: 'pas-prouve', matchs: 7129, gain: 0.00053, fourchette: Object.freeze([-0.00136, 0.00242]) })
  }),
  casesJugees: 29,
  casesTropPetites: 21,
  cases: Object.freeze([])
});

// ======================================================= 11. la lecture (écran, page du match)

const enStyle = (r) =>
  r
    ? {
        ...r,
        provisoire: Boolean(r.provisoire),
        actuel: Boolean(r.actuel),
        libelle: libelleDuStyle(r.style),
        secondLibelle: r.second ? libelleDuStyle(r.second) : null
      }
    : null;

/** Le style ACTUEL d'un club (numéro ou « fotmob-123 »), ou null. */
export function lireStyleActuel(club, { database = openDb() } = {}) {
  const n = numeroDe(club);
  if (n === null) return null;
  try {
    return enStyle(database.prepare(`SELECT ${COLONNES_STYLE.join(', ')} FROM team_style WHERE club = ? AND actuel = 1`).get(n) ?? null);
  } catch (error) {
    if (/no such table/i.test(String(error?.message ?? ''))) return null;
    throw error;
  }
}

/** Le nom d'un club dans l'annuaire du magasin (table teams), par son numéro FotMob ; null s'il est inconnu. */
function nomDuClub(database, club) {
  try {
    return database.prepare('SELECT name FROM teams WHERE team_id = ?').get(`fotmob-${club}`)?.name ?? null;
  } catch {
    return null;
  }
}

/** Le style d'un entraîneur (sa clé), ou null. */
export function lireStyleDEntraineur(cle, { database = openDb() } = {}) {
  if (!cle) return null;
  try {
    const r = database.prepare(`SELECT ${COLONNES_ENTRAINEUR.join(', ')} FROM coach_style WHERE entraineur = ? ORDER BY jour DESC LIMIT 1`).get(cle);
    if (!r) return null;
    return {
      ...r,
      homonyme: Boolean(r.homonyme),
      provisoire: Boolean(r.provisoire),
      clubs: (json(r.clubs) ?? []).map(([clubId, league, n, de, a]) => ({ club: clubId, nom: nomDuClub(database, clubId), league, n, de, a })),
      libelle: libelleDuStyle(r.style),
      secondLibelle: r.second ? libelleDuStyle(r.second) : null
    };
  } catch (error) {
    if (/no such table/i.test(String(error?.message ?? ''))) return null;
    throw error;
  }
}

/** Depuis quand l'entraîneur actuel dirige ce club (sa première rencontre de la suite en cours), d'après le cache. */
function depuisQuand(database, club, cle) {
  if (!cle) return null;
  const nom = cle.startsWith('nom:') ? cle.slice(4).split('|club:')[0] : null;
  const id = cle.startsWith('id:') ? Number(cle.slice(3)) : null;
  try {
    const lignes = database.prepare('SELECT date, coach, coach_id FROM team_style_matches WHERE club = ? AND coupe = 0 ORDER BY date DESC LIMIT 400').all(club);
    let depuis = null;
    let n = 0;
    for (const l of lignes) {
      const meme = id ? l.coach_id === id : l.coach === nom;
      if (!meme) {
        if (l.coach || l.coach_id) break;
        continue;
      }
      depuis = l.date;
      n++;
    }
    return depuis ? { depuis, matchs: n } : null;
  } catch {
    return null;
  }
}

/**
 * LA LECTURE POUR LA PAGE DE L'ÉQUIPE : l'état du calcul, le style actuel (avec ses chiffres et ceux de son
 * championnat), les 13 derniers mois (la stabilité), l'entraîneur actuel et son style.
 */
export function lireLeStyleDuClub(club, { database = openDb(), mois = 13 } = {}) {
  const n = numeroDe(club);
  if (n === null) throw Object.assign(new Error(`identifiant de club illisible : « ${club} »`), { statut: 400 });
  const etat = etatDesStyles({ database });
  const actuel = etat.absent ? null : lireStyleActuel(n, { database });
  let historique = [];
  try {
    historique = etat.absent
      ? []
      : database
          .prepare(`SELECT jour, style, second, provisoire, n FROM team_style WHERE club = ? AND actuel = 0 AND jour LIKE '%-01' ORDER BY jour DESC LIMIT ?`)
          .all(n, Math.max(1, Math.min(48, Number(mois) || 13)))
          .map((r) => ({ jour: r.jour, style: r.style, libelle: libelleDuStyle(r.style), provisoire: Boolean(r.provisoire), n: r.n }))
          .reverse();
  } catch (error) {
    if (!/no such table/i.test(String(error?.message ?? ''))) throw error;
  }
  const entraineur = actuel?.entraineur ? lireStyleDEntraineur(actuel.entraineur, { database }) : null;
  const mandat = actuel?.entraineur ? depuisQuand(database, n, actuel.entraineur) : null;
  return {
    club: n,
    etat: { calculeLe: etat.calculeLe, jusqua: etat.jusqua, jourActuel: etat.jourActuel, aJour: etat.aJour, absent: etat.absent, version: etat.version },
    style: actuel,
    historique,
    entraineur: entraineur ? { ...entraineur, depuis: mandat?.depuis ?? null, matchsAvecLeClub: mandat?.matchs ?? null } : null,
    entraineurSansStyle: actuel?.entraineur && !entraineur ? { cle: actuel.entraineur, nom: actuel.entraineur.replace(/^(?:nom:|id:)/, '').split('|club:')[0], depuis: mandat?.depuis ?? null, matchsAvecLeClub: mandat?.matchs ?? null } : null,
    reglages: { fenetre: REGLAGES_STYLE.fenetre, etabli: REGLAGES_STYLE.etabli, seuil: REGLAGES_STYLE.seuil, debutSaison: REGLAGES_STYLE.debutSaison, minCarte: REGLAGES_STYLE.minCarte },
    styles: [...STYLES, SANS_STYLE].map((s) => ({ id: s.id, libelle: s.libelle, phrase: s.phrase })),
    source: 'FotMob (magasin) : statistiques d’équipe, carte des tirs et compositions',
    regle: 'explication seulement : le style n’entre jamais dans les chiffres du moteur'
  };
}

/** La case d'un duel (« possession|contre ») mesurée au banc, si elle a PASSÉ le seuil avec les réglages en service. */
export function caseMesuree(dom, ext, banc = DUELS_AU_BANC) {
  if (!banc?.reglages || banc.reglages !== empreinteDesReglages()) return null;
  return (banc.cases ?? []).find((c) => c.dom === dom && c.ext === ext && c.verdict === 'retenu') ?? null;
}

/**
 * LA LECTURE POUR LA PAGE DU MATCH : le style actuel des deux clubs et le DUEL — « explication seulement », ou
 * l'effet mesuré si la case a passé le seuil sévère du banc (DUELS_AU_BANC).
 */
export function lireLeDuelDeStyles(home, away, { database = openDb(), banc = DUELS_AU_BANC } = {}) {
  const h = numeroDe(home);
  const a = numeroDe(away);
  if (h === null || a === null) throw Object.assign(new Error('identifiants de clubs illisibles'), { statut: 400 });
  const etat = etatDesStyles({ database });
  const dom = etat.absent ? null : lireStyleActuel(h, { database });
  const ext = etat.absent ? null : lireStyleActuel(a, { database });
  const mesure = dom && ext ? caseMesuree(dom.style, ext.style, banc) : null;
  return {
    etat: { calculeLe: etat.calculeLe, jusqua: etat.jusqua, jourActuel: etat.jourActuel, aJour: etat.aJour, absent: etat.absent },
    home: dom,
    away: ext,
    duel: dom && ext ? { dom: dom.style, ext: ext.style, mesure, explicationSeulement: !mesure } : null,
    banc: {
      mesureLe: banc?.le ?? null,
      K: banc?.K ?? null,
      global: banc?.global ?? {},
      casesRetenues: (banc?.cases ?? []).filter((c) => c.verdict === 'retenu').length,
      casesJugees: banc?.casesJugees ?? null,
      casesTropPetites: banc?.casesTropPetites ?? null,
      valable: Boolean(banc?.reglages) && banc.reglages === empreinteDesReglages()
    },
    styles: [...STYLES, SANS_STYLE].map((s) => ({ id: s.id, libelle: s.libelle, phrase: s.phrase })),
    source: 'FotMob (magasin) : statistiques d’équipe, carte des tirs et compositions',
    regle: 'explication seulement : le style n’entre jamais dans les chiffres du moteur'
  };
}
