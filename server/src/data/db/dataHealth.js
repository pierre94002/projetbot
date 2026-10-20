/**
 * dataHealth.js — les contrôles des données et le carnet de santé.
 * -----------------------------------------------------------------------
 * Étape 12 du plan (06/10/2026). Passe en revue le magasin de matchs et dit
 * ce qui cloche, SANS JAMAIS RIEN CORRIGER : une liste d'ANOMALIES et un
 * CARNET DE SANTÉ.
 *
 * Les six sortes d'anomalies, et d'où vient chaque contrôle — l'existant est
 * réutilisé plutôt que doublé par une seconde voie (point 15 du plan) :
 *
 *   doublon      même jour, mêmes deux clubs (identifiants FotMob) dans le
 *                même sens ou dans l'autre, ou même identifiant de rencontre
 *                sous deux clés — doublons.js, la recherche de
 *                merge-duplicate-matches.mjs ; plus de matchs au magasin qu'au
 *                classement officiel — standingsCheck.js (verify-standings) ;
 *   competition  intitulé FotMob de la rencontre qui n'est pas celui de la
 *                compétition où elle est rangée (FOTMOB_LEAGUES), ou identifiant
 *                de compétition d'une AUTRE compétition suivie ; club absent du
 *                classement officiel de la saison ;
 *   manquant     rencontre jouée que la page de la compétition chez FotMob
 *                connaît et que le magasin ignore — fotMobFixtureGaps.js : lue
 *                à chaque passe par l'étape « omissions » pour la saison en
 *                cours (le carnet reprend son rapport, sans requête de plus),
 *                toutes saisons au contrôle complet quand on le demande ;
 *                moins de matchs au magasin qu'au classement officiel ;
 *   impossible   tirs cadrés > tirs, cadrés + non cadrés + contrés ≠ tirs,
 *                passes réussies > passes, possession ≠ 100 %, plus de deux
 *                jaunes ou d'un rouge pour un joueur, plus de tirs cadrés que
 *                de tirs pour un joueur… ; buts des joueurs supérieurs au
 *                score et gardiens qui n'encaissent pas le score adverse, deux
 *                scores pour un même match — scoreAudit.js
 *                (audit-score-consistency.mjs) ; bilan différent du classement
 *                officiel à matchs égaux ;
 *   zero         zéros qui veulent dire « non relevé » (ZERO_MEANS_ABSENT,
 *                columns.js) : aucune équipe ne finit un match sans une passe,
 *                un tacle ni le ballon ; plusieurs de ces champs à 0 ensemble ;
 *                tirs dans et hors de la surface à 0 pour des tirs relevés ;
 *   identite     joueurs sans identifiant FotMob (l'identifiant 0, partagé par
 *                tous les inconnus d'une feuille), homonymes (même nom, même
 *                club, même saison, deux identifiants ; deux clubs distincts
 *                au même nom dans une même compétition), club qui joue deux
 *                fois le même jour.
 *
 * Chaque anomalie a une GRAVITÉ : « erreur » (la donnée est fausse ou
 * manque), « à vérifier » (probablement fausse, ou ambiguë), « info » (limite
 * connue de la source, rien à faire de plus que la savoir).
 *
 * Le CARNET : pour chaque championnat et chaque saison — les VRAIES bornes
 * (seasonWindows.js : juillet-juin en Europe, année civile pour les pays
 * nordiques, les Amériques sauf le Mexique et la Chine) —, la part des matchs
 * joués qui ont leurs xG, leurs tirs, leurs corners, leurs cartons (des deux
 * équipes), leurs lignes joueur (des deux équipes) et leur composition. Les
 * rencontres sont celles du magasin, reconnues par leurs identifiants — jamais
 * par une clé fabriquée avec le nom des clubs comme le tableau de couverture
 * actuel (getCoverage), que le carnet RECOUPE (recouperCouverture) sans en
 * recopier l'approximation. Un résultat attribué sur tapis vert n'a pas de
 * feuille à exiger : compté à part, hors du calcul.
 *
 * LECTURE SEULE : chaque fonction prend une connexion (en lecture seule
 * suffit) et n'écrit RIEN dans la base. Le contrôle complet tourne une fois ;
 * ensuite la passe de nuit (étape « carnetSante » de l'actualisation) ne
 * contrôle que les rencontres nouvelles ou modifiées depuis le contrôle
 * précédent (`updated_at` au-delà du repère) et ne recompte que les saisons
 * qu'elles touchent. L'état est écrit dans data/runtime/carnet-sante.json par
 * scripts/data-health.mjs (dataHealthRepository.js) et lu tel quel par
 * GET /api/match-stats/health.
 *
 * RENDRE LA MAIN (retouche du 07/10/2026 au soir). Le contrôle complet durait
 * 77 s d'une traite sur la base du bac (dont 53 s l'audit des scores) : aucun
 * des modules du contrôle ne rendait jamais la main à la boucle d'événements.
 * Chaque lecture et chaque contrôle est écrit UNE fois, en générateur
 * (`…ParMorceaux`, qui `yield` entre deux tranches de travail :
 * utils/travailCooperatif.js) et garde son nom d'avant, synchrone, pour qui
 * n'a rien à ménager (dailyChecks.js, les scripts, les essais) ; le contrôle
 * complet et la passe de nuit exécutent les générateurs en rendant la main
 * (`setImmediate`) au plus toutes les 25 ms de travail. Le plus long moment
 * passé sans rendre la main est noté dans le résultat (`controle.blocMaxMs`,
 * `blocMaxOu`, `pauses`). Le RÉSULTAT ne change pas : mêmes requêtes, mêmes
 * ordres de lecture, mêmes anomalies, même carnet (comparé octet pour octet
 * avec le code d'avant sur la base du bac).
 * -----------------------------------------------------------------------
 */

import { TEAM_COLUMNS, ZERO_MEANS_ABSENT } from './columns.js';
import { auditScoresParMorceaux } from './scoreAudit.js';
import { confronterClassementsParMorceaux } from './standingsCheck.js';
import { rencontresEnDoubleParMorceaux, rencontresInverseesParMorceaux, memeIdentifiantFotmobParMorceaux } from './doublons.js';
import { executerSansPause, executerEnRendantLaMain, creerPauses, rendreLaMainParDefaut, PAS_MS } from '../../utils/travailCooperatif.js';
import { slug } from '../../utils/nameIdentity.js';
import { seasonOf, seasonLabel, seasonBounds, currentSeason } from '../providers/seasonWindows.js';
import { FOTMOB_LEAGUES, leagueKeyMatches } from '../providers/fotMobProvider.js';
import { FOTMOB_LEAGUE_IDS } from '../providers/fotMobLeagueIds.js';
import { hasStandings } from '../providers/leagueCups.js';

/** Forme de l'état : un état d'une autre version est refait en entier. */
export const VERSION_CARNET = 1;

export const TYPES = Object.freeze([
  { cle: 'doublon', libelle: 'Rencontre en double', quoi: 'même jour, mêmes deux clubs (par identifiant FotMob), dans un sens ou dans l’autre' },
  { cle: 'competition', libelle: 'Mauvaise compétition', quoi: 'rangée dans une compétition que FotMob ne lui donne pas, ou club absent du classement officiel' },
  { cle: 'manquant', libelle: 'Match manquant', quoi: 'joué selon la page de la compétition chez FotMob ou le classement officiel, absent du magasin' },
  { cle: 'impossible', libelle: 'Chiffre impossible', quoi: 'des chiffres qui ne peuvent pas être vrais ensemble (tirs, possession, buts, cartons, score)' },
  { cle: 'zero', libelle: 'Zéro « non relevé »', quoi: 'un 0 publié par la source à la place d’un champ qu’elle n’a pas relevé' },
  { cle: 'identite', libelle: 'Club ou joueur mal identifié', quoi: 'identifiant 0 de la source, homonymes, club qui joue deux fois le même jour' }
]);

export const GRAVITES = Object.freeze([
  { cle: 'erreur', libelle: 'Erreur', quoi: 'la donnée est fausse ou manque' },
  { cle: 'a-verifier', libelle: 'À vérifier', quoi: 'probablement fausse, ou ambiguë' },
  { cle: 'info', libelle: 'Limite de la source', quoi: 'connue, rien à faire de plus que la savoir' }
]);

/**
 * Chaque SORTE de constat, ce qu'elle veut dire et ce qu'on peut en faire :
 * l'écran l'explique une fois, le détail de chaque anomalie reste court.
 */
export const SORTES = Object.freeze({
  'meme-sens': { type: 'doublon', libelle: 'Même jour, mêmes clubs, même sens', explication: 'La même rencontre enregistrée deux fois. Le script merge-duplicate-matches.mjs sait les fusionner (à la main, après une sauvegarde).' },
  'sens-inverse': { type: 'doublon', libelle: 'Même jour, mêmes clubs, sens inverse', explication: 'Les deux mêmes clubs le même jour, une fois dans chaque sens : une des deux est fausse. Le sens juste ne se devine pas : à vérifier chez la source.' },
  'meme-identifiant': { type: 'doublon', libelle: 'Même rencontre FotMob deux fois', explication: 'Un identifiant de rencontre FotMob sous deux clés du magasin.' },
  'classement-en-trop': { type: 'doublon', libelle: 'Plus de matchs qu’au classement officiel', explication: 'Le magasin compte plus de matchs pour ce club que la table officielle : un doublon, ou un match annulé par la fédération que FotMob garde.' },
  'non-suivie': { type: 'competition', libelle: 'Compétition plus suivie', explication: 'Rangée dans une compétition que l’appli ne relève plus chez FotMob.' },
  'autre-competition': { type: 'competition', libelle: 'Rangée dans une autre compétition', explication: 'FotMob publie la rencontre sous l’intitulé ou l’identifiant d’une AUTRE compétition suivie.' },
  intitule: { type: 'competition', libelle: 'Intitulé inattendu', explication: 'FotMob publie la rencontre sous un intitulé et un identifiant de compétition qui ne sont pas ceux de la compétition où elle est rangée.' },
  'hors-classement': { type: 'competition', libelle: 'Club absent du classement officiel', explication: 'Des rencontres comptées au classement calculé pour un club que la table officielle ne connaît pas : rangées dans la mauvaise compétition, ou club mal identifié.' },
  'calendrier-fotmob': { type: 'manquant', libelle: 'Absente du magasin', explication: 'Jouée selon la page de la compétition chez FotMob (calendrier complet), absente du magasin. L’étape « omissions » de l’actualisation essaie de l’importer chaque passe (saison en cours).' },
  'classement-club': { type: 'manquant', libelle: 'Club du classement sans rencontre', explication: 'Un club a des matchs joués au classement officiel et aucune rencontre au magasin : phase absente, ou club mal identifié.' },
  'classement-matchs': { type: 'manquant', libelle: 'Moins de matchs qu’au classement', explication: 'Le classement officiel compte plus de matchs joués que le magasin pour ce club.' },
  'classement-ecart': { type: 'manquant', libelle: 'Matchs joués à vérifier', explication: 'Les lectures possibles de la table officielle (plusieurs phases) ne donnent pas le nombre de matchs du magasin.' },
  // Retouche du 12/10/2026 : une INFORMATION, jamais une erreur (standingsCheck.js, « les matchs en cours »).
  'classement-en-cours': { type: 'manquant', libelle: 'Match en cours ou pas encore enregistré', explication: 'Le classement officiel, relevé en direct chez FotMob, compte déjà un match que le calendrier dit pas encore terminé (daté d’aujourd’hui ou d’hier) et que le magasin n’a pas encore : en cours, ou fini trop récemment pour être importé. Ce n’est pas une anomalie : l’écart se referme quand la passe suivante l’importe ; s’il reste après la fin du match et une passe, il redevient une anomalie.' },
  equipe: { type: 'impossible', libelle: 'Chiffres d’équipe', explication: 'Tirs cadrés > tirs, cadrés + non cadrés + contrés ≠ tirs, dans + hors de la surface ≠ tirs, passes réussies > passes, possession hors de 0-100 % ou dont les deux parts ne font pas 100 %.' },
  zeros: { type: 'zero', libelle: 'Zéros non relevés', explication: 'Un 0 publié à la place d’un champ que la source n’a pas relevé : passes, tacles ou possession à 0 (impossible dans un match joué), plusieurs champs défensifs à 0 ensemble (dégagements, interceptions, centres, longs ballons), tirs dans et hors de la surface à 0 pour des tirs relevés. FotMob le fait en couverture réduite (« lower »). À ne pas lire comme de vrais zéros ; le magasin ne contredit pas la source : rien n’est effacé.' },
  joueurs: { type: 'impossible', libelle: 'Chiffres de joueurs', explication: 'Plus de deux cartons jaunes ou d’un rouge, plus de tirs cadrés que de tirs, plus de passes réussies que de passes, minutes ou note impossibles.' },
  gardiens: { type: 'impossible', libelle: 'Gardiens et score', explication: 'Les buts encaissés des gardiens d’une équipe ne font pas le score de l’adversaire (audit des scores, scoreAudit.js).' },
  buteurs: { type: 'impossible', libelle: 'Buteurs et score', explication: 'Les buts des joueurs (et les csc adverses) dépassent le score, ou il en manque deux ou plus (audit des scores, scoreAudit.js).' },
  'score-fichiers': { type: 'impossible', libelle: 'Deux scores', explication: 'Le magasin et le calendrier (ou les résultats) ne disent pas le même score.' },
  'classement-bilan': { type: 'impossible', libelle: 'Bilan différent du classement', explication: 'À matchs égaux, victoires, nuls, défaites ou buts diffèrent du classement officiel : un score faux ?' },
  'sans-identifiant': { type: 'identite', libelle: 'Joueurs sans identifiant', explication: 'FotMob donne l’identifiant 0 à tous les inconnus d’une feuille (clubs amateurs, divisions inférieures) : ces joueurs sont rangés par leur nom, leurs matchs ne se rattachent à aucune fiche ni ne s’additionnent d’une feuille à l’autre.' },
  'homonymes-joueurs': { type: 'identite', libelle: 'Homonymes (joueurs)', explication: 'Même nom, même club, même saison, plusieurs identifiants FotMob : deux homonymes, ou le même joueur sous deux identifiants (équivalence à prouver par la date de naissance, cf. merge-player-identities.mjs).' },
  'homonymes-clubs': { type: 'identite', libelle: 'Homonymes (clubs)', explication: 'Deux clubs distincts au même nom dans la même compétition : le magasin les sépare par identifiant, toute lecture par le nom les confondrait.' },
  'club-deux-fois': { type: 'identite', libelle: 'Club deux fois le même jour', explication: 'Le même club joue deux matchs le même jour contre deux adversaires : club mal identifié (une équipe réserve sous le même identifiant ?) ou date fausse.' }
});

/** Les six données du carnet, dans l'ordre des colonnes. */
export const DONNEES = Object.freeze([
  { cle: 'xg', libelle: 'xG', quoi: 'les buts attendus (xG) des deux équipes' },
  { cle: 'tirs', libelle: 'Tirs', quoi: 'les tirs des deux équipes' },
  { cle: 'corners', libelle: 'Corners', quoi: 'les corners des deux équipes' },
  { cle: 'cartons', libelle: 'Cartons', quoi: 'les cartons jaunes et rouges des deux équipes' },
  { cle: 'joueurs', libelle: 'Joueurs', quoi: 'des lignes joueur pour les deux équipes' },
  { cle: 'compos', libelle: 'Compos', quoi: 'la composition publiée (onze de départ et remplaçants)' }
]);

/** Vert à partir de 90 %, orange à partir de 50 %, rouge en dessous (comme le tableau de couverture). */
export const SEUILS = Object.freeze({ bon: 90, partiel: 50 });

/** Au-delà, des minutes de jeu sont impossibles (90 + 30 de prolongation + arrêts de jeu). */
export const MINUTES_MAX = 150;

/**
 * Au-delà de ce nombre de rencontres nouvelles ou modifiées, la passe de nuit
 * cède la place au contrôle complet : mesuré sur la base du bac le 06/10/2026,
 * ~3,5 s plus ~35 ms par rencontre (282 en 13 à 15 s) contre 66 à 79 s pour
 * tout le magasin ; une réécriture de masse (le 23/09/2026 : 59 926 rencontres
 * d'un coup) l'a fait tourner plus de neuf minutes sans finir (essai arrêté
 * au bout du délai).
 */
export const SEUIL_NUIT = 1000;

/** Annulée, abandonnée, reportée : pas un match joué (cf. countsForTable). */
const HORS_JEU = /^(cancelled|abandoned|postponed)$/;
const LOT = 500;
const COL = Object.fromEntries(TEAM_COLUMNS.map((c) => [c.key, c.column]));

/** Les champs à zéro, dits en français. */
const NOM_CHAMP = {
  'Total passes': 'passes',
  'Passes accurate': 'passes réussies',
  tackles: 'tacles',
  clearances: 'dégagements',
  interceptions: 'interceptions',
  crosses: 'centres',
  long_balls: 'longs ballons',
  'Ball Possession': 'possession'
};
/** À zéro, impossibles à eux seuls dans un match joué. */
const ZERO_IMPOSSIBLE_SEUL = ['Total passes', 'Passes accurate', 'tackles', 'Ball Possession'];
/** À zéro, plausibles seuls (un match sans centre arrive), suspects à plusieurs. */
const ZERO_SUSPECT_ENSEMBLE = [...ZERO_MEANS_ABSENT].filter((k) => !ZERO_IMPOSSIBLE_SEUL.includes(k));

const COLONNES_EQUIPE = [
  ...new Set(
    ['expected_goals', 'Total Shots', 'Shots on Goal', 'Shots off Goal', 'Blocked Shots', 'Shots insidebox', 'Shots outsidebox', 'Corner Kicks', 'Ball Possession', 'Yellow Cards', 'Red Cards', ...ZERO_MEANS_ABSENT].map(
      (cle) => COL[cle]
    )
  )
];

const lots = (liste, taille = LOT) => Array.from({ length: Math.ceil(liste.length / taille) }, (_, i) => liste.slice(i * taille, i * taille + taille));
const marques = (n) => Array.from({ length: n }, () => '?').join(',');
const arrondi1 = (x) => Math.round(x * 10) / 10;
const pluriel = (n, un, plusieurs) => `${Number(n).toLocaleString('fr-FR')} ${Math.abs(n) > 1 ? plusieurs : un}`;
export const cleLigueSaison = (league, season) => `${league}|${season}`;
export const separerLigueSaison = (ls) => {
  const i = String(ls).lastIndexOf('|');
  return [ls.slice(0, i), Number(ls.slice(i + 1))];
};
const decalerJour = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const libelleRencontre = (r) => `${r.homeName} – ${r.awayName}`;
const scoreDe = (r) => (r.homeGoals !== null && r.homeGoals !== undefined && r.awayGoals !== null && r.awayGoals !== undefined ? `${r.homeGoals}-${r.awayGoals}` : null);

/** Identifiant de compétition FotMob → compétition suivie. */
const LIGUE_PAR_ID = new Map(Object.entries(FOTMOB_LEAGUE_IDS).map(([league, id]) => [Number(id), league]));

// =================================================================== lecture

const CHAMPS_RENCONTRE = `match_key, date, league, home_name, away_name, home_id, away_id, fotmob_id, home_goals, away_goals, updated_at,
  lineups IS NOT NULL AS compo,
  json_extract(meta, '$.leagueKey') AS league_key,
  json_extract(meta, '$.parentLeagueId') AS parent_id,
  json_extract(meta, '$.coverage') AS coverage,
  json_extract(meta, '$.noSheet') AS no_sheet,
  json_extract(meta, '$.awarded') AS awarded,
  json_extract(meta, '$.reason') AS reason`;

function rencontreDe(row) {
  return {
    matchKey: row.match_key,
    date: row.date,
    league: row.league,
    season: seasonOf(row.league, row.date),
    homeName: row.home_name,
    awayName: row.away_name,
    homeId: row.home_id ?? null,
    awayId: row.away_id ?? null,
    fotmobId: row.fotmob_id === null || row.fotmob_id === undefined ? null : String(row.fotmob_id),
    homeGoals: row.home_goals,
    awayGoals: row.away_goals,
    updatedAt: row.updated_at ?? null,
    compo: row.compo === 1,
    leagueKey: row.league_key ?? null,
    parentId: row.parent_id === null || row.parent_id === undefined ? null : Number(row.parent_id),
    coverage: row.coverage ?? null,
    noSheet: row.no_sheet === 1,
    // Résultat attribué sur tapis vert : FotMob le dit de deux façons.
    awarded: row.awarded === 1 || row.reason === 'awarded_win',
    reason: row.reason ?? null
  };
}

/**
 * Un point d'arrêt tous les 256 tours des lectures de lignes (de 2 à 8 ms de
 * travail), à chaque lot de clés (500 clés : ~15 ms) et à chaque saison.
 */
const TOURS = 255;
/**
 * Une rencontre lue en entier (champ `meta` compris) traîne 30 à 80 ko de listes
 * avant lui : de 0,3 ms les 8 à chaud à ~10 ms quand le disque est sollicité.
 */
const TOURS_RENCONTRES = 7;

/**
 * Les rencontres du magasin, par clé : toutes, celles de `cles`, ou celles des
 * saisons `ligueSaisons` (« compétition|année de début », bornes réelles).
 * Lues par `.iterate()` quand la requête rend ses lignes au fil de l'eau (la
 * table se parcourt dans l'ordre de sa clé) : mêmes lignes, même ordre, avec
 * des points d'arrêt. `lot` : combien de clés par requête (500 ; le contrôle
 * de nuit en demande moins, pour qu'une requête ne tienne jamais seule longtemps).
 */
export function lireRencontres(database, options = {}) {
  return executerSansPause(lireRencontresParMorceaux(database, options));
}

export function* lireRencontresParMorceaux(database, { cles = null, ligueSaisons = null, lot: tailleLot = LOT } = {}) {
  const out = new Map();
  if (cles) {
    for (const lot of lots([...cles], tailleLot)) {
      for (const row of database.prepare(`SELECT ${CHAMPS_RENCONTRE} FROM matches WHERE match_key IN (${marques(lot.length)})`).all(...lot)) out.set(row.match_key, rencontreDe(row));
      yield 'rencontres';
    }
  } else if (ligueSaisons) {
    const st = database.prepare(`SELECT ${CHAMPS_RENCONTRE} FROM matches WHERE league = ? AND date >= ? AND date < ?`);
    for (const ls of ligueSaisons) {
      const [league, season] = separerLigueSaison(ls);
      let tours = 0;
      for (const row of st.iterate(league, ...seasonBounds(league, season))) {
        out.set(row.match_key, rencontreDe(row));
        if ((++tours & TOURS_RENCONTRES) === 0) yield 'rencontres d’une saison';
      }
      yield 'rencontres d’une saison';
    }
  } else {
    let tours = 0;
    for (const row of database.prepare(`SELECT ${CHAMPS_RENCONTRE} FROM matches`).iterate()) {
      out.set(row.match_key, rencontreDe(row));
      if ((++tours & TOURS_RENCONTRES) === 0) yield 'rencontres';
    }
  }
  return out;
}

/**
 * Ce qu'un contrôle lit d'une table, ligne par ligne (`pour(ligne)`), pour
 * toutes les rencontres (`.iterate()`) ou un ensemble de clés (par lots de 500),
 * avec des points d'arrêt. Dans l'ordre où la requête rend ses lignes.
 */
function* lireParCles(database, sql, cles, filtreEnPlus, pour, ou) {
  if (!cles) {
    let tours = 0;
    for (const r of database.prepare(`${sql}${filtreEnPlus ? ` WHERE ${filtreEnPlus}` : ''}`).iterate()) {
      pour(r);
      if ((++tours & TOURS) === 0) yield ou;
    }
    return;
  }
  for (const lot of lots([...cles])) {
    for (const r of database.prepare(`${sql} WHERE match_key IN (${marques(lot.length)})${filtreEnPlus ? ` AND ${filtreEnPlus}` : ''}`).all(...lot)) pour(r);
    yield ou;
  }
}

/** Statistiques d'équipe utiles aux contrôles et au carnet : clé → { home, away }. */
export function lireStatsEquipes(database, cles = null) {
  return executerSansPause(lireStatsEquipesParMorceaux(database, cles));
}

export function* lireStatsEquipesParMorceaux(database, cles = null) {
  const out = new Map();
  yield* lireParCles(
    database,
    `SELECT match_key, side, ${COLONNES_EQUIPE.map((c) => `"${c}"`).join(', ')} FROM team_stats`,
    cles,
    '',
    (r) => {
      let m = out.get(r.match_key);
      if (!m) out.set(r.match_key, (m = {}));
      m[r.side] = r;
    },
    'statistiques d’équipe'
  );
  return out;
}

/** Lignes joueur par camp : nombre, et celles sans identifiant FotMob (avec quelques noms). */
export function lireLignesJoueurs(database, cles = null) {
  return executerSansPause(lireLignesJoueursParMorceaux(database, cles));
}

export function* lireLignesJoueursParMorceaux(database, cles = null) {
  const out = new Map();
  const sql = `SELECT match_key, side, COUNT(*) AS lignes, SUM(player_id IS NULL) AS sans_id,
                      GROUP_CONCAT(CASE WHEN player_id IS NULL THEN name END, '|') AS noms_sans_id
               FROM players`;
  const groupe = ' GROUP BY match_key, side';
  const ranger = (r) => {
    let m = out.get(r.match_key);
    if (!m) out.set(r.match_key, (m = {}));
    m[r.side] = { lignes: r.lignes, sansId: r.sans_id ?? 0, nomsSansId: r.noms_sans_id ? r.noms_sans_id.split('|') : [] };
  };
  if (cles) {
    for (const lot of lots([...cles])) {
      for (const r of database.prepare(`${sql} WHERE match_key IN (${marques(lot.length)})${groupe}`).all(...lot)) ranger(r);
      yield 'lignes joueur';
    }
  } else {
    // La table se parcourt dans l'ordre de sa clé (match_key, side, …) : les groupes sortent au fil de l'eau, sans tri.
    let tours = 0;
    for (const r of database.prepare(`${sql}${groupe}`).iterate()) {
      ranger(r);
      if ((++tours & TOURS) === 0) yield 'lignes joueur';
    }
  }
  return out;
}

/** Les clés de rencontre, dans l'ordre de la table, rendues de `pas` en `pas` (1 000 par défaut) : les bornes de plages de lecture. */
function* bornesDePlages(database, pas = 1000) {
  const bornes = [];
  let rang = 0;
  for (const r of database.prepare('SELECT match_key FROM matches ORDER BY match_key').iterate()) {
    if (++rang % pas === 0) bornes.push(r.match_key);
    if ((rang & 4095) === 0) yield 'plages de rencontres';
  }
  return bornes;
}

/** Les lignes joueur aux chiffres impossibles : clé → [lignes]. `plage` : combien de rencontres par plage de lecture (tout le magasin seulement). */
export function lireJoueursImpossibles(database, cles = null, options = {}) {
  return executerSansPause(lireJoueursImpossiblesParMorceaux(database, cles, options));
}

export function* lireJoueursImpossiblesParMorceaux(database, cles = null, { plage = 1000 } = {}) {
  const out = new Map();
  const conditions = `(shots_on_target > shots OR passes_accurate > passes OR yellow_cards > 2 OR red_cards > 1
                       OR minutes > ${MINUTES_MAX} OR minutes < 0 OR rating > 10 OR rating < 0)`;
  const colonnes = 'SELECT match_key, side, name, player_id, shots, shots_on_target, passes, passes_accurate, yellow_cards, red_cards, minutes, rating FROM players';
  const ranger = (r) => {
    const liste = out.get(r.match_key) ?? [];
    liste.push(r);
    out.set(r.match_key, liste);
  };
  if (cles) {
    yield* lireParCles(database, colonnes, cles, conditions, ranger, 'joueurs aux chiffres impossibles');
    return out;
  }
  // Tout le magasin : la requête parcourt deux millions de lignes pour n'en rendre presque aucune, donc rien au fil de
  // l'eau (1,2 s d'un seul appel). On la découpe en plages de clés de rencontre — la table des joueurs a pour clé
  // (match_key, side, player_key) : les mêmes lignes, dans le même ordre, plage après plage, la première et la dernière
  // ouvertes (une feuille dont la rencontre manquerait au magasin n'échappe pas au contrôle).
  const bornes = yield* bornesDePlages(database, plage);
  for (let i = 0; i <= bornes.length; i++) {
    const filtre = [i > 0 ? 'match_key >= ?' : null, i < bornes.length ? 'match_key < ?' : null, conditions].filter(Boolean).join(' AND ');
    const args = [i > 0 ? bornes[i - 1] : null, i < bornes.length ? bornes[i] : null].filter((b) => b !== null);
    for (const r of database.prepare(`${colonnes} WHERE ${filtre}`).iterate(...args)) ranger(r);
    yield 'joueurs aux chiffres impossibles';
  }
  return out;
}

// ================================================================= anomalies

function clePortee(portee) {
  if (portee.cles) return portee.cles.join('+');
  if (portee.joueur) return portee.joueur;
  if (portee.fotmob) return portee.fotmob;
  if (portee.ligueSaison) return `${portee.ligueSaison}${portee.club ? `|${portee.club}` : ''}${portee.nom ? `|${portee.nom}` : ''}`;
  return '';
}

/**
 * Une anomalie, toujours de la même forme. `portee` dit ce qu'un contrôle
 * suivant doit refaire pour la confirmer ou la lever : des rencontres
 * (`cles`), une saison d'une compétition (`ligueSaison`), un groupe
 * d'homonymes (`joueur`), une rencontre FotMob absente (`fotmob`).
 */
function anomalie({ type, sorte, gravite, portee, r = null, league = null, season = null, date = null, label = null, score = null, detail, matchs = [], cleEnPlus = null }) {
  const ligue = r?.league ?? league;
  const saison = r?.season ?? season;
  const matchKey = r?.matchKey ?? null;
  const a = {
    id: `${type}:${sorte}:${clePortee(portee)}${cleEnPlus ? `:${cleEnPlus}` : ''}`,
    type,
    sorte,
    gravite,
    matchKey,
    date: r?.date ?? date,
    league: ligue,
    season: saison,
    saison: ligue && saison !== null && saison !== undefined ? seasonLabel(ligue, saison) : null,
    label: r ? libelleRencontre(r) : label,
    score: r ? scoreDe(r) : score,
    detail
  };
  // Le carnet en garde des milliers : rien d'écrit qui se déduit (la portée
  // d'un constat sur une seule rencontre est cette rencontre, cf. porteeDe).
  if (matchs.length) a.matchs = matchs;
  if (!(portee.cles?.length === 1 && portee.cles[0] === matchKey)) a.portee = portee;
  return a;
}

/** Ce qu'un contrôle suivant doit refaire pour confirmer ou lever une anomalie. */
export const porteeDe = (a) => a.portee ?? (a.matchKey ? { cles: [a.matchKey] } : {});

/** La compétition suivie que désigne un intitulé ou un identifiant FotMob, s'il en désigne une autre. */
function autreCompetition(r) {
  if (r.leagueKey) {
    const parIntitule = Object.entries(FOTMOB_LEAGUES).find(([league, motif]) => league !== r.league && leagueKeyMatches(motif, r.leagueKey));
    if (parIntitule) return parIntitule[0];
  }
  const parId = r.parentId !== null ? LIGUE_PAR_ID.get(r.parentId) : null;
  return parId && parId !== r.league ? parId : null;
}

/** Les contrôles qui ne regardent qu'une rencontre. */
export function controlesDeRencontre(r, s = null, j = null, impossibles = null) {
  const out = [];
  const portee = { cles: [r.matchKey] };

  // 1. La compétition : l'intitulé FotMob doit être celui de la compétition
  // où la rencontre est rangée. Un intitulé inhabituel sous le BON
  // identifiant de compétition (« PRY|Division Profesional » pour le Paraguay,
  // 199) n'est pas une erreur de rangement.
  const motif = FOTMOB_LEAGUES[r.league];
  const attendu = FOTMOB_LEAGUE_IDS[r.league] ?? null;
  if (!motif) {
    out.push(anomalie({ type: 'competition', sorte: 'non-suivie', gravite: 'a-verifier', portee, r, detail: `rangée dans « ${r.league} », une compétition que l’appli ne relève plus chez FotMob` }));
  } else {
    const intituleOk = !r.leagueKey || leagueKeyMatches(motif, r.leagueKey);
    const parId = r.parentId !== null ? LIGUE_PAR_ID.get(r.parentId) : null;
    // Les 72 motifs ne sont essayés que pour une rencontre déjà suspecte.
    const autre = parId && parId !== r.league ? parId : !intituleOk ? autreCompetition(r) : null;
    if (autre) {
      out.push(
        anomalie({
          type: 'competition',
          sorte: 'autre-competition',
          gravite: 'erreur',
          portee,
          r,
          detail: `rangée dans « ${r.league} » alors que FotMob la publie sous « ${r.leagueKey ?? '?'} » (compétition ${r.parentId ?? '?'}), celle de « ${autre} »`
        })
      );
    } else if (!intituleOk && attendu !== null && r.parentId !== null && r.parentId !== attendu) {
      out.push(
        anomalie({
          type: 'competition',
          sorte: 'intitule',
          gravite: 'erreur',
          portee,
          r,
          detail: `rangée dans « ${r.league} » (compétition FotMob ${attendu}) alors que FotMob la publie sous « ${r.leagueKey} » (compétition ${r.parentId})`
        })
      );
    }
  }

  // 2. Les chiffres d'équipe qui ne peuvent pas être vrais.
  if (s) {
    const points = [];
    for (const [cote, nom] of [['home', r.homeName], ['away', r.awayName]]) {
      const t = s[cote];
      if (!t) continue;
      const v = (cle) => t[COL[cle]];
      const tirs = v('Total Shots');
      const cadres = v('Shots on Goal');
      const nonCadres = v('Shots off Goal');
      const contres = v('Blocked Shots');
      const dedans = v('Shots insidebox');
      const dehors = v('Shots outsidebox');
      if (tirs !== null && cadres !== null && cadres > tirs) points.push(`${nom} : ${cadres} tirs cadrés pour ${tirs} tirs`);
      else if (tirs !== null && cadres !== null && nonCadres !== null && contres !== null && cadres + nonCadres + contres !== tirs) {
        points.push(`${nom} : ${cadres} cadrés + ${nonCadres} non cadrés + ${contres} contrés ≠ ${tirs} tirs`);
      }
      if (tirs !== null && dedans !== null && dehors !== null && dedans + dehors > 0 && dedans + dehors !== tirs) points.push(`${nom} : ${dedans} tirs dans la surface + ${dehors} hors de la surface ≠ ${tirs} tirs`);
      const passes = v('Total passes');
      const reussies = v('Passes accurate');
      if (passes !== null && reussies !== null && reussies > passes) points.push(`${nom} : ${reussies} passes réussies pour ${passes} passes`);
      const xg = v('expected_goals');
      if (xg !== null && xg < 0) points.push(`${nom} : xG négatifs (${xg})`);
      const possession = v('Ball Possession');
      if (possession !== null && (possession < 0 || possession > 100)) points.push(`${nom} : possession de ${possession} %`);
    }
    const ph = s.home?.[COL['Ball Possession']];
    const pa = s.away?.[COL['Ball Possession']];
    if (ph !== null && ph !== undefined && pa !== null && pa !== undefined && ph > 0 && pa > 0 && Math.abs(ph + pa - 100) > 1) {
      points.push(`possession ${ph} % + ${pa} % = ${arrondi1(ph + pa)} %, pas 100 %`);
    }
    if (points.length) out.push(anomalie({ type: 'impossible', sorte: 'equipe', gravite: 'erreur', portee, r, detail: points.join(' ; ') }));
  }

  // 3. Les chiffres de joueur qui ne peuvent pas être vrais.
  if (impossibles?.length) {
    const points = impossibles.map((p) => {
      const pourquoi = [];
      if (p.shots_on_target !== null && p.shots !== null && p.shots_on_target > p.shots) pourquoi.push(`${p.shots_on_target} tirs cadrés pour ${p.shots} tirs`);
      if (p.passes_accurate !== null && p.passes !== null && p.passes_accurate > p.passes) pourquoi.push(`${p.passes_accurate} passes réussies pour ${p.passes}`);
      if (p.yellow_cards > 2) pourquoi.push(`${p.yellow_cards} cartons jaunes`);
      if (p.red_cards > 1) pourquoi.push(`${p.red_cards} cartons rouges`);
      if (p.minutes !== null && (p.minutes > MINUTES_MAX || p.minutes < 0)) pourquoi.push(`${p.minutes} minutes de jeu`);
      if (p.rating !== null && (p.rating > 10 || p.rating < 0)) pourquoi.push(`note de ${p.rating}`);
      return `${p.name} (${p.side === 'home' ? r.homeName : r.awayName}) : ${pourquoi.join(', ')}`;
    });
    out.push(anomalie({ type: 'impossible', sorte: 'joueurs', gravite: 'erreur', portee, r, detail: points.join(' ; ') }));
  }

  // 4. Les zéros qui veulent dire « non relevé ».
  if (s) {
    const points = [];
    for (const [cote, nom] of [['home', r.homeName], ['away', r.awayName]]) {
      const t = s[cote];
      if (!t) continue;
      const aZero = (cle) => t[COL[cle]] === 0;
      const seuls = ZERO_IMPOSSIBLE_SEUL.filter(aZero);
      const ensemble = ZERO_SUSPECT_ENSEMBLE.filter(aZero);
      const champs = seuls.length || ensemble.length >= 2 ? [...seuls, ...ensemble] : [];
      const tirs = t[COL['Total Shots']];
      const repartition = tirs > 0 && t[COL['Shots insidebox']] === 0 && t[COL['Shots outsidebox']] === 0;
      if (!champs.length && !repartition) continue;
      const morceaux = [];
      if (champs.length) morceaux.push(`${champs.map((c) => NOM_CHAMP[c] ?? c).join(', ')} à 0`);
      if (repartition) morceaux.push(`tirs dans et hors de la surface à 0 pour ${tirs} tirs`);
      points.push(`${nom} : ${morceaux.join(' ; ')}`);
    }
    if (points.length) {
      out.push(
        anomalie({
          type: 'zero',
          sorte: 'zeros',
          gravite: 'a-verifier',
          portee,
          r,
          detail: `${points.join(' — ')}${r.coverage ? ` (couverture « ${r.coverage} » chez FotMob)` : ''}.`
        })
      );
    }
  }

  // 5. Des joueurs sans identité : l'identifiant 0 de FotMob (tous les
  // inconnus d'une feuille le partagent) ou une ligne d'une source sans
  // identifiant. Rangés par leur nom, leurs saisons ne s'additionnent pas.
  // (L'explication complète est dans SORTES : le détail reste court, il y en a des milliers.)
  const sansId = (j?.home?.sansId ?? 0) + (j?.away?.sansId ?? 0);
  if (sansId > 0) {
    const noms = [...(j?.home?.nomsSansId ?? []), ...(j?.away?.nomsSansId ?? [])];
    out.push(
      anomalie({
        type: 'identite',
        sorte: 'sans-identifiant',
        gravite: 'info',
        portee,
        r,
        detail: `${pluriel(sansId, 'joueur', 'joueurs')} sans identifiant FotMob : ${noms.slice(0, 3).join(', ')}${noms.length > 3 ? '…' : ''}`
      })
    );
  }
  return out;
}

/**
 * Les rencontres manquantes d'une liste de clés, pour nommer celles d'une paire
 * (une journée de coupes en compte des centaines : lues par lots de 64 clés,
 * avec un point d'arrêt entre deux ; l'ordre d'insertion dans `rencontres`
 * ne compte pour personne, qui ne les lit que par clé).
 */
function completer(database, rencontres, cles) {
  return executerSansPause(completerParMorceaux(database, rencontres, cles));
}

function* completerParMorceaux(database, rencontres, cles) {
  const manquantes = cles.filter((c) => !rencontres.has(c));
  for (const lot of lots(manquantes, 64)) {
    for (const [cle, r] of lireRencontres(database, { cles: lot })) rencontres.set(cle, r);
    yield 'rencontres du même jour';
  }
  return cles.map((c) => rencontres.get(c)).filter(Boolean);
}

/**
 * Doublons (doublons.js) et club qui joue deux fois le même jour. `cles` :
 * seulement autour de ces rencontres (passe de nuit).
 */
export function controlesDoublons(database, rencontres, cles = null) {
  return executerSansPause(controlesDoublonsParMorceaux(database, rencontres, cles));
}

export function* controlesDoublonsParMorceaux(database, rencontres, cles = null) {
  const out = [];
  // Contrôle complet : les rencontres sont toutes en mémoire, regroupées sans
  // relire la base ; passe de nuit : autour des rencontres nouvelles, en SQL.
  const ou = () => (cles ? { cles: [...cles] } : { rencontres: rencontres.values() });
  const decrire = (rs) => rs.map((x) => `${libelleRencontre(x)} ${scoreDe(x) ?? '?-?'} (${x.league})`).join(' et ');

  for (const g of yield* rencontresEnDoubleParMorceaux(database, ou())) {
    const rs = yield* completerParMorceaux(database, rencontres, g.cles);
    out.push(
      anomalie({
        type: 'doublon',
        sorte: 'meme-sens',
        gravite: 'erreur',
        portee: { cles: g.cles.slice().sort() },
        r: rs[0],
        matchs: g.cles,
        detail: `${g.cles.length} fois le même jour avec les mêmes clubs (${g.homeId} et ${g.awayId}) : ${decrire(rs)}. Le script merge-duplicate-matches.mjs sait les fusionner (à lancer à la main, après une sauvegarde).`
      })
    );
  }
  for (const p of yield* rencontresInverseesParMorceaux(database, ou())) {
    const rs = yield* completerParMorceaux(database, rencontres, p.cles);
    out.push(
      anomalie({
        type: 'doublon',
        sorte: 'sens-inverse',
        gravite: 'erreur',
        portee: { cles: p.cles },
        r: rs[0],
        matchs: p.cles,
        detail: `les deux mêmes clubs le même jour, dans les deux sens : ${decrire(rs)}. Le sens juste ne se devine pas : à vérifier chez la source avant de fusionner.`
      })
    );
  }
  for (const g of yield* memeIdentifiantFotmobParMorceaux(database, ou())) {
    const rs = yield* completerParMorceaux(database, rencontres, g.cles);
    out.push(
      anomalie({
        type: 'doublon',
        sorte: 'meme-identifiant',
        gravite: 'erreur',
        portee: { cles: g.cles },
        r: rs[0],
        matchs: g.cles,
        detail: `la rencontre FotMob ${g.fotmobId} est enregistrée ${g.cles.length} fois : ${decrire(rs)}.`
      })
    );
  }

  // Un club qui joue deux fois le même jour, contre deux adversaires : club
  // mal identifié (une équipe réserve sous le même identifiant ?) ou date fausse.
  const paires = new Map();
  const noter = (a, b) => {
    const cle = [a.matchKey, b.matchKey].sort().join('+');
    if (a.matchKey === b.matchKey) return;
    const club = [a.homeId, a.awayId].find((id) => id && (id === b.homeId || id === b.awayId));
    if (!club) return;
    // Mêmes deux clubs le même jour : c'est un DOUBLON (même sens ou sens inverse), dit plus haut — pas un club deux fois.
    if (new Set([a.homeId, a.awayId, b.homeId, b.awayId]).size === 2) return;
    paires.set(cle, { a, b, club });
  };
  if (!cles) {
    const parJourClub = new Map();
    let tours = 0;
    for (const r of rencontres.values()) {
      for (const id of [r.homeId, r.awayId]) {
        if (!id) continue;
        const cle = `${r.date}|${id}`;
        const deja = parJourClub.get(cle);
        if (deja) for (const autre of deja) noter(autre, r);
        parJourClub.set(cle, [...(deja ?? []), r]);
      }
      if ((++tours & TOURS) === 0) yield 'club deux fois le même jour';
    }
  } else {
    const memeJour = database.prepare('SELECT match_key FROM matches WHERE date = ?');
    for (const cle of cles) {
      // Une rencontre ~35 ms (les autres rencontres de son jour, lues en entier) : un point d'arrêt à chaque tour.
      yield 'club deux fois le même jour';
      const r = rencontres.get(cle);
      if (!r) continue;
      const autres = yield* completerParMorceaux(database, rencontres, memeJour.all(r.date).map((x) => x.match_key).filter((k) => k !== cle));
      for (const autre of autres) noter(r, autre);
    }
  }
  for (const { a, b, club } of paires.values()) {
    const [x, y] = [a, b].sort((u, v) => u.matchKey.localeCompare(v.matchKey));
    const nom = club === x.homeId ? x.homeName : x.awayName;
    out.push(
      anomalie({
        type: 'identite',
        sorte: 'club-deux-fois',
        gravite: 'a-verifier',
        portee: { cles: [x.matchKey, y.matchKey] },
        r: x,
        matchs: [x.matchKey, y.matchKey],
        detail: `${nom} (${club}) joue deux fois le ${x.date} : ${decrire([x, y])} — club mal identifié (une équipe réserve sous le même identifiant ?) ou date fausse.`
      })
    );
  }
  return out;
}

/** L'audit des scores (scoreAudit.js) : gardiens, buteurs, deux scores pour un même match. */
export function controlesAudit(database, options = {}) {
  return executerSansPause(controlesAuditParMorceaux(database, options));
}

export function* controlesAuditParMorceaux(database, { cles = null, calendarPath = null, resultsPath = null, rencontres = new Map() } = {}) {
  const out = [];
  const bilan = yield* auditScoresParMorceaux({
    database,
    cles: cles ? [...cles] : null,
    calendarPath,
    resultsPath,
    maxSamples: 0,
    onAnomaly: (a) => {
      // Le contrôle 4 (calendrier contre résultats) ne porte sur aucune
      // rencontre du magasin : il reste à l'étape « controle ».
      if (!a.matchKey) return;
      const r = rencontres.get(a.matchKey) ?? null;
      const sorte = a.kind === 'gardien' ? 'gardiens' : a.kind === 'buteurs' ? 'buteurs' : 'score-fichiers';
      out.push(
        anomalie({
          type: 'impossible',
          sorte,
          // Un constat par camp (les gardiens des deux équipes peuvent être faux).
          cleEnPlus: a.camp ?? (a.kind === 'fichiers' ? (/calendrier/.test(a.detail) ? 'calendrier' : 'resultats') : null),
          gravite: 'erreur',
          portee: { cles: [a.matchKey] },
          r,
          league: a.league,
          season: r ? null : a.league && a.date ? seasonOf(a.league, a.date) : null,
          date: a.date,
          label: a.label,
          detail: a.kind === 'fichiers' ? `deux scores pour le même match : ${a.detail}` : a.detail
        })
      );
    }
  });
  return { anomalies: out, bilan };
}

/**
 * Le classement officiel face au calculé (standingsCheck.js), saison par saison.
 * `leagues` (étape 14, contrôle quotidien) : ces compétitions seulement — le
 * contrôle quotidien les prend une à une pour rendre la main entre deux.
 * `enCours` (retouche du 12/10/2026) : les matchs en cours du calendrier
 * (matchsEnCoursDuCalendrier) ; l'écart de « joués » qu'ils expliquent est une
 * INFORMATION (`classement-en-cours`, gravité « info »), jamais une erreur.
 */
export function controlesClassements(database, ligueSaisons = null, options = {}) {
  // Sans pause possible, lire d'avance chaque saison ne servirait à rien (cf. standingsCheck.js).
  return executerSansPause(controlesClassementsParMorceaux(database, ligueSaisons, { ...options, prelecture: false }));
}

const jourEnFrancais = (j) => {
  const m = String(j ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(j ?? '');
};

export function* controlesClassementsParMorceaux(database, ligueSaisons = null, { leagues = null, prelecture = true, enCours = null } = {}) {
  const out = [];
  const { resume, details } = yield* confronterClassementsParMorceaux({ database, saisons: ligueSaisons, leagues, prelecture, enCours });
  for (const d of details) {
    const ls = cleLigueSaison(d.league, d.season);
    const base = { league: d.league, season: d.season };
    for (const c of d.onlyOfficial) {
      out.push(anomalie({ ...base, type: 'manquant', sorte: 'classement-club', gravite: 'erreur', portee: { ligueSaison: ls, club: c.teamId }, label: `${c.teamName} · classement officiel`, detail: `${c.teamName} a ${pluriel(c.officiel, 'match joué', 'matchs joués')} au classement officiel et aucune rencontre comptée au magasin : phase absente ou club mal identifié.` }));
    }
    for (const c of d.onlyComputed) {
      out.push(anomalie({ ...base, type: 'competition', sorte: 'hors-classement', gravite: 'erreur', portee: { ligueSaison: ls, club: c.teamId }, label: `${c.teamName} · classement officiel`, detail: `${c.teamName} a ${pluriel(c.magasin, 'rencontre comptée', 'rencontres comptées')} au classement calculé mais n'est pas au classement officiel : rencontres rangées dans la mauvaise compétition, ou club mal identifié.` }));
    }
    for (const c of d.played) {
      const min = Math.min(...c.officiel);
      const max = Math.max(...c.officiel);
      const officiel = c.officiel.join(' ou ');
      if (c.magasin < min) {
        out.push(anomalie({ ...base, type: 'manquant', sorte: 'classement-matchs', gravite: 'erreur', portee: { ligueSaison: ls, club: c.teamId }, label: `${c.teamName} · classement officiel`, detail: `${c.teamName} : ${officiel} matchs joués au classement officiel, ${c.magasin} au magasin — ${pluriel(min - c.magasin, 'rencontre manquante', 'rencontres manquantes')} au moins.` }));
      } else if (c.magasin > max) {
        out.push(anomalie({ ...base, type: 'doublon', sorte: 'classement-en-trop', gravite: 'a-verifier', portee: { ligueSaison: ls, club: c.teamId }, label: `${c.teamName} · classement officiel`, detail: `${c.teamName} : ${c.magasin} matchs au magasin pour ${officiel} au classement officiel — ${pluriel(c.magasin - max, 'rencontre en trop', 'rencontres en trop')} (doublon, ou match annulé par la fédération).` }));
      } else {
        out.push(anomalie({ ...base, type: 'manquant', sorte: 'classement-ecart', gravite: 'a-verifier', portee: { ligueSaison: ls, club: c.teamId }, label: `${c.teamName} · classement officiel`, detail: `${c.teamName} : ${officiel} matchs joués selon la table officielle lue, ${c.magasin} au magasin.` }));
      }
    }
    for (const c of d.record) {
      out.push(anomalie({ ...base, type: 'impossible', sorte: 'classement-bilan', gravite: 'erreur', portee: { ligueSaison: ls, club: c.teamId }, label: `${c.teamName} · classement officiel`, detail: `${c.teamName} : bilan différent à matchs égaux — officiel ${c.officiel.join(' | ')}, magasin ${c.magasin} : un score faux ?` }));
    }
    for (const c of d.enCours ?? []) {
      const matchs = c.matchs.map((m) => `${m.homeName} – ${m.awayName} du ${jourEnFrancais(m.date)}`).join(', ');
      const joues = Math.max(...c.officiel) > 1 ? 'matchs joués' : 'match joué';
      out.push(anomalie({ ...base, type: 'manquant', sorte: 'classement-en-cours', gravite: 'info', portee: { ligueSaison: ls, club: c.teamId }, label: `${c.teamName} · classement officiel`, detail: `${c.teamName} : ${c.officiel.join(' ou ')} ${joues} au classement officiel, ${c.magasin} au magasin — match en cours ou pas encore enregistré (${matchs}) : une information, l’écart se referme quand le match est au magasin.` }));
    }
  }
  return { anomalies: out, resume };
}

/**
 * Un groupe d'homonymes : identifié par son club, sa saison et SES
 * IDENTIFIANTS (triés), pas par l'orthographe du nom — « Gilberto » et
 * « Gilberto Junior » désignant les deux mêmes identifiants ne font qu'un constat.
 */
function anomalieHomonymes(cle, groupe) {
  const [club, saison] = cle.split('|');
  const ids = [...groupe.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
  const league = ids[0][1].league ?? null;
  const nomClub = ids[0][1].nomClub ?? club;
  const nom = ids[0][1].nom ?? cle.split('|')[2];
  return anomalie({
    type: 'identite',
    sorte: 'homonymes-joueurs',
    gravite: 'a-verifier',
    // `slug` : le nom partagé, que la passe de nuit relit pour refaire le groupe.
    portee: { joueur: `${club}|${saison}|${ids.map(([id]) => id).sort().join(',')}`, slug: cle.split('|')[2] },
    league,
    season: Number(saison),
    date: ids[0][1].dateDernier ?? null,
    label: `${nom} · ${nomClub}`,
    matchs: [...new Set(ids.map(([, e]) => e.dernier))],
    detail: `« ${nom} » sous ${ids.length} identifiants chez ${nomClub} (${club}) la même saison : ${ids.map(([id, e]) => `${id} (${pluriel(e.n, 'match', 'matchs')})`).join(', ')} — deux homonymes, ou le même joueur sous deux identifiants (cf. people_merges).`
  });
}

/** `r` : { date, league, nomClub, nom } de la rencontre où le joueur apparaît. */
function ajouterAuGroupe(groupes, cle, playerId, matchKey, r) {
  let g = groupes.get(cle);
  if (!g) groupes.set(cle, (g = new Map()));
  let e = g.get(playerId);
  if (!e) g.set(playerId, (e = { n: 0, dernier: matchKey, dateDernier: r.date, league: r.league, nomClub: r.nomClub, nom: r.nom }));
  e.n++;
  if (r.date > e.dateDernier) {
    e.dernier = matchKey;
    e.dateDernier = r.date;
    e.league = r.league;
    e.nomClub = r.nomClub;
  }
}

/** Jour, compétition et clubs de rencontres, sans le reste (ni déroulé, ni composition). */
function* lireRencontresLegeres(database, cles) {
  const out = new Map();
  // Par lots de 64 clés : les clubs suivent des listes de plusieurs ko, 500 rencontres lues en entier prennent 70 ms.
  for (const lot of lots(cles, 64)) {
    for (const r of database.prepare(`SELECT match_key, date, league, home_id, away_id, home_name, away_name FROM matches WHERE match_key IN (${marques(lot.length)})`).all(...lot)) {
      out.set(r.match_key, { matchKey: r.match_key, date: r.date, league: r.league, season: seasonOf(r.league, r.date), homeId: r.home_id, awayId: r.away_id, homeName: r.home_name, awayName: r.away_name });
    }
    yield 'homonymes (joueurs) : rencontres des apparitions';
  }
  return out;
}

/** Les identifiants d'un groupe d'homonymes « club|saison|id1,id2 ». */
export const idsDuGroupe = (cle) => String(cle).split('|')[2]?.split(',') ?? [];

/**
 * Homonymes parmi les joueurs : même nom (au slug près : « José » et « Jose »),
 * même club (identifiant), même saison, plusieurs identifiants FotMob. Les
 * candidats viennent de l'ANNUAIRE (people_aliases, identityRegistry.js : un
 * nom écrit pour plusieurs identifiants), puis leurs apparitions de l'index
 * couvrant idx_players_id, sans lire la table des joueurs : la parcourir
 * entière coûtait près d'une minute à froid (deux millions de lignes).
 * Contrôle complet : tous les noms partagés. Passe de nuit : `touches`, les
 * joueurs des rencontres `cles` ; tout groupe qui en contient un est refait —
 * par TOUS leurs noms à l'annuaire, pas seulement celui lu ce soir (inscrit
 * « Tomás Palacios » ce soir, un joueur reste l'homonyme d'un « Tiago
 * Palacios » sous son autre nom), par le nom lu ce soir (pas encore à
 * l'annuaire tant qu'il n'a pas été refait), et par celui des anciens
 * groupes qui les contiennent (`anciens` : leurs portées), que l'annuaire ait
 * changé ou non ; l'ancien constat de ces groupes est alors remplacé.
 */
export function homonymesJoueurs(database, rencontres, cles = null, options = {}) {
  return executerSansPause(homonymesJoueursParMorceaux(database, rencontres, cles, options));
}

export function* homonymesJoueursParMorceaux(database, rencontres, cles = null, { anciens = [] } = {}) {
  const sql = 'SELECT slug, GROUP_CONCAT(DISTINCT player_id) AS ids, MIN(alias) AS nom FROM people_aliases';
  const groupeSql = ' GROUP BY slug HAVING COUNT(DISTINCT player_id) > 1';
  const touches = new Set();
  let candidats;
  if (!cles) {
    // Un GROUP BY sur l'index des noms : les groupes sortent au fil de l'eau — mais le HAVING n'en garde qu'un sur trente
    // et ce qu'il écarte se parcourt entre deux : un point d'arrêt à chaque groupe gardé (entre deux, ~0,2 ms).
    candidats = [];
    for (const c of database.prepare(`${sql}${groupeSql}`).iterate()) {
      candidats.push(c);
      yield 'homonymes (joueurs) : annuaire';
    }
  } else {
    const slugs = new Set();
    yield* lireParCles(
      database,
      'SELECT name, player_id FROM players',
      cles,
      'player_id IS NOT NULL',
      (p) => {
        slugs.add(slug(p.name));
        touches.add(p.player_id);
      },
      'homonymes (joueurs) : joueurs des rencontres'
    );
    for (const lot of lots([...touches])) {
      for (const a of database.prepare(`SELECT DISTINCT slug FROM people_aliases WHERE player_id IN (${marques(lot.length)})`).all(...lot)) slugs.add(a.slug);
      yield 'homonymes (joueurs) : noms à l’annuaire';
    }
    for (const p of anciens) if (p?.joueur && p.slug && idsDuGroupe(p.joueur).some((id) => touches.has(id))) slugs.add(p.slug);
    const parSlug = database.prepare(`${sql} WHERE slug = ?${groupeSql}`);
    candidats = [];
    let tours = 0;
    for (const s of slugs) {
      const c = parSlug.get(s);
      if (c) candidats.push(c);
      if ((++tours & 63) === 0) yield 'homonymes (joueurs) : candidats';
    }
  }
  const candidatsDe = new Map();
  for (const c of candidats) {
    for (const id of String(c.ids).split(',')) {
      const liste = candidatsDe.get(id);
      if (liste) liste.push(c);
      else candidatsDe.set(id, [c]);
    }
  }
  // Les apparitions de chaque candidat, par l'index des identifiants (qui les couvre : aucune lecture de la table), au fil de l'eau.
  const apparitions = [];
  let lues = 0;
  for (const lot of lots([...candidatsDe.keys()])) {
    for (const a of database.prepare(`SELECT player_id, match_key, side FROM players WHERE player_id IN (${marques(lot.length)})`).iterate(...lot)) {
      apparitions.push(a);
      if ((++lues & 1023) === 0) yield 'homonymes (joueurs) : apparitions';
    }
    yield 'homonymes (joueurs) : apparitions';
  }
  // Les rencontres des apparitions que l'appelant n'a pas en mémoire, dans l'ordre de leur première apparition.
  const absentes = new Set();
  let vues = 0;
  for (const a of apparitions) {
    if (!rencontres.has(a.match_key)) absentes.add(a.match_key);
    if ((++vues & 8191) === 0) yield 'homonymes (joueurs) : rencontres des apparitions';
  }
  const legeres = yield* lireRencontresLegeres(database, [...absentes]);
  const groupes = new Map();
  let tours = 0;
  for (const a of apparitions) {
    if ((++tours & 255) === 0) yield 'homonymes (joueurs) : regroupement';
    const r = rencontres.get(a.match_key) ?? legeres.get(a.match_key);
    const club = r && (a.side === 'home' ? r.homeId : r.awayId);
    if (!club) continue;
    for (const c of candidatsDe.get(a.player_id) ?? []) {
      ajouterAuGroupe(groupes, `${club}|${r.season}|${c.slug}`, a.player_id, a.match_key, { date: r.date, league: r.league, nomClub: a.side === 'home' ? r.homeName : r.awayName, nom: c.nom });
    }
  }
  // Dans l'ordre des clés : de deux orthographes d'un même groupe, la même
  // gardée d'un contrôle à l'autre (les doublons d'identifiant tombent ensuite).
  const anomalies = [];
  let groupesFaits = 0;
  for (const cle of [...groupes.keys()].sort()) {
    if (groupes.get(cle).size > 1) anomalies.push(anomalieHomonymes(cle, groupes.get(cle)));
    if ((++groupesFaits & TOURS) === 0) yield 'homonymes (joueurs) : constats';
  }
  return { anomalies: uniques(anomalies), touches, candidats: candidats.length };
}

/**
 * Deux clubs DISTINCTS (identifiants différents) au même nom dans une même
 * compétition et une même saison : les « Nacional » d'Uruguay et du Paraguay
 * en Copa Libertadores. Le magasin les sépare ; toute lecture par le nom les
 * confondrait (cf. le piège Leeds United / D.C. United).
 */
export function homonymesClubs(rencontres) {
  return executerSansPause(homonymesClubsParMorceaux(rencontres));
}

export function* homonymesClubsParMorceaux(rencontres) {
  const groupes = new Map();
  let tours = 0;
  for (const r of rencontres) {
    for (const [id, nom] of [[r.homeId, r.homeName], [r.awayId, r.awayName]]) {
      if (!id) continue;
      const cle = `${cleLigueSaison(r.league, r.season)}|${slug(nom)}`;
      let g = groupes.get(cle);
      if (!g) groupes.set(cle, (g = { league: r.league, season: r.season, nom, ids: new Map() }));
      g.ids.set(id, nom);
    }
    if ((++tours & 1023) === 0) yield 'homonymes (clubs)';
  }
  const out = [];
  for (const g of groupes.values()) {
    if (g.ids.size < 2) continue;
    const ids = [...g.ids.keys()].sort();
    out.push(
      anomalie({
        type: 'identite',
        sorte: 'homonymes-clubs',
        gravite: 'info',
        portee: { ligueSaison: cleLigueSaison(g.league, g.season), nom: slug(g.nom) },
        league: g.league,
        season: g.season,
        label: `« ${g.nom} » · ${g.league}`,
        detail: `${ids.length} clubs distincts s'appellent « ${g.nom} » dans ${g.league} ${seasonLabel(g.league, g.season)} (${ids.join(', ')}) : le magasin les sépare par identifiant ; toute lecture par le nom les confondrait.`
      })
    );
  }
  return out;
}

/**
 * Les rencontres jouées que la page de la compétition chez FotMob connaît et
 * que le magasin ignore — le rapport de findFixtureGaps (fotMobFixtureGaps.js),
 * celui de l'étape « omissions » de la passe ou celui du contrôle complet.
 * Une rencontre importée depuis, ou présente sous un autre identifiant (mêmes
 * clubs à un jour près), ou antérieure au début du magasin, n'est pas dite.
 * `saisonMin` : la première saison du magasin (PREMIERE_SAISON de
 * fotMobFixtureGaps.js, 2023) ; une rencontre d'une saison antérieure — la
 * seconde moitié des saisons européennes 2022/2023, que le magasin n'a pas —
 * est COMPTÉE hors du périmètre, jamais signalée comme une anomalie.
 */
export function manquantsFotmob(database, rapport, { premiereDate = null, saisonMin = null } = {}) {
  const out = [];
  const ecartees = { avantLeMagasin: 0, horsPerimetre: 0, importeesDepuis: 0, autreIdentifiant: 0 };
  const horsPerimetre = new Map();
  const parId = database.prepare('SELECT 1 AS ok FROM matches WHERE fotmob_id = ? LIMIT 1');
  const parClubs = database.prepare('SELECT match_key FROM matches WHERE date >= ? AND date <= ? AND home_id = ? AND away_id = ? LIMIT 1');
  for (const m of rapport?.missing ?? []) {
    if (!m?.matchId || !m.date || !m.league) continue;
    if (premiereDate && m.date < premiereDate) {
      ecartees.avantLeMagasin++;
      continue;
    }
    if (saisonMin !== null && seasonOf(m.league, m.date) < saisonMin && !parId.get(String(m.matchId))) {
      ecartees.horsPerimetre++;
      const cle = cleLigueSaison(m.league, seasonOf(m.league, m.date));
      horsPerimetre.set(cle, (horsPerimetre.get(cle) ?? 0) + 1);
      continue;
    }
    if (parId.get(String(m.matchId))) {
      ecartees.importeesDepuis++;
      continue;
    }
    if (m.homeId && m.awayId && parClubs.get(decalerJour(m.date, -1), decalerJour(m.date, 1), m.homeId, m.awayId)) {
      ecartees.autreIdentifiant++;
      continue;
    }
    const season = seasonOf(m.league, m.date);
    out.push(
      anomalie({
        type: 'manquant',
        sorte: 'calendrier-fotmob',
        gravite: 'erreur',
        portee: { fotmob: String(m.matchId), ligueSaison: cleLigueSaison(m.league, season) },
        league: m.league,
        season,
        date: m.date,
        label: `${m.homeName ?? '?'} – ${m.awayName ?? '?'}`,
        score: m.homeGoals !== null && m.homeGoals !== undefined && m.awayGoals !== null && m.awayGoals !== undefined ? `${m.homeGoals}-${m.awayGoals}` : null,
        detail: `jouée le ${m.date}${m.round ? ` (tour ${m.round})` : ''} selon la page de la compétition chez FotMob (saison ${m.season ?? seasonLabel(m.league, season)}, rencontre ${m.matchId}), absente du magasin${m.awarded ? ' — résultat attribué' : ''}.`
      })
    );
  }
  return {
    anomalies: out,
    ecartees,
    lues: rapport?.missing?.length ?? 0,
    ligueSaisons: [...new Set(out.map((a) => a.portee.ligueSaison))],
    // Hors du périmètre, saison par saison : ce que FotMob publie et que le magasin n'a jamais tenu.
    horsPerimetre: [...horsPerimetre.entries()]
      .map(([ls, n]) => {
        const [league, season] = separerLigueSaison(ls);
        return { league, season, saison: seasonLabel(league, season), matchs: n };
      })
      .sort((a, b) => b.matchs - a.matchs || a.league.localeCompare(b.league, 'fr'))
  };
}

// ==================================================================== carnet

/** Ce qu'une rencontre apporte au carnet. */
export function drapeaux(r, s = null, j = null) {
  const deux = (cle) => s?.home?.[COL[cle]] !== null && s?.home?.[COL[cle]] !== undefined && s?.away?.[COL[cle]] !== null && s?.away?.[COL[cle]] !== undefined;
  const joue = r.homeGoals !== null && r.homeGoals !== undefined && r.awayGoals !== null && r.awayGoals !== undefined && !HORS_JEU.test(String(r.reason ?? ''));
  return {
    joue,
    attribue: r.awarded,
    xg: deux('expected_goals'),
    tirs: deux('Total Shots'),
    corners: deux('Corner Kicks'),
    cartons: deux('Yellow Cards') && deux('Red Cards'),
    joueurs: (j?.home?.lignes ?? 0) > 0 && (j?.away?.lignes ?? 0) > 0,
    compos: r.compo,
    sansFeuille: r.noSheet
  };
}

function nouvelleLigne(league, season, { maintenant, premiereDate }) {
  const bornes = seasonBounds(league, season);
  return {
    league,
    season,
    saison: seasonLabel(league, season),
    bornes,
    premier: null,
    dernier: null,
    rencontres: 0,
    matchs: 0,
    attribues: 0,
    horsJeu: 0,
    sansFeuille: 0,
    avec: Object.fromEntries(DONNEES.map((d) => [d.cle, 0])),
    couverture: {},
    enCours: season === currentSeason(league, maintenant),
    partielle: premiereDate && bornes[0] < premiereDate ? `le magasin commence le ${premiereDate}` : null,
    aClassement: hasStandings(league)
  };
}

function finaliserLigne(l) {
  const total = DONNEES.reduce((n, d) => n + l.avec[d.cle], 0);
  return {
    ...l,
    pourcent: Object.fromEntries(DONNEES.map((d) => [d.cle, l.matchs ? arrondi1((100 * l.avec[d.cle]) / l.matchs) : null])),
    // La moyenne des six parts d'une même ligne : toutes ont le même
    // dénominateur (les matchs joués de la saison), c'est donc la part des
    // cases remplies — jamais une somme de pourcentages.
    moyenne: l.matchs ? arrondi1((100 * total) / (DONNEES.length * l.matchs)) : null
  };
}

/** Les lignes du carnet (une par championnat et saison) des rencontres données. */
export function lignesDuCarnet(rencontres, stats, joueurs, options = {}) {
  return executerSansPause(lignesDuCarnetParMorceaux(rencontres, stats, joueurs, options));
}

export function* lignesDuCarnetParMorceaux(rencontres, stats, joueurs, { maintenant = new Date(), premiereDate = null } = {}) {
  const parLs = new Map();
  let tours = 0;
  for (const r of rencontres.values()) {
    if ((++tours & 1023) === 0) yield 'carnet';
    const ls = cleLigueSaison(r.league, r.season);
    let l = parLs.get(ls);
    if (!l) parLs.set(ls, (l = nouvelleLigne(r.league, r.season, { maintenant, premiereDate })));
    l.rencontres++;
    if (!l.premier || r.date < l.premier) l.premier = r.date;
    if (!l.dernier || r.date > l.dernier) l.dernier = r.date;
    const d = drapeaux(r, stats.get(r.matchKey), joueurs.get(r.matchKey));
    if (!d.joue) {
      l.horsJeu++;
      continue;
    }
    // Un résultat décidé sur tapis vert n'a pas de feuille à exiger.
    if (d.attribue) {
      l.attribues++;
      continue;
    }
    l.matchs++;
    for (const donnee of DONNEES) if (d[donnee.cle]) l.avec[donnee.cle]++;
    if (d.sansFeuille) l.sansFeuille++;
    const niveau = r.coverage ?? 'inconnue';
    l.couverture[niveau] = (l.couverture[niveau] ?? 0) + 1;
  }
  return trierCarnet([...parLs.values()].map(finaliserLigne));
}

export const trierCarnet = (lignes) => lignes.sort((a, b) => a.league.localeCompare(b.league, 'fr') || b.season - a.season);

/**
 * Σ et ⌀ d'un ensemble de lignes : les COMPTES s'additionnent ; la part de
 * chaque donnée est celle de tous les matchs réunis (pondérée par match),
 * jamais la somme ni la moyenne des pourcentages des lignes.
 */
export function totauxDuCarnet(lignes) {
  const t = { lignes: lignes.length, rencontres: 0, matchs: 0, attribues: 0, horsJeu: 0, sansFeuille: 0, avec: Object.fromEntries(DONNEES.map((d) => [d.cle, 0])) };
  for (const l of lignes) {
    t.rencontres += l.rencontres;
    t.matchs += l.matchs;
    t.attribues += l.attribues;
    t.horsJeu += l.horsJeu;
    t.sansFeuille += l.sansFeuille;
    for (const d of DONNEES) t.avec[d.cle] += l.avec[d.cle];
  }
  const total = DONNEES.reduce((n, d) => n + t.avec[d.cle], 0);
  t.pourcent = Object.fromEntries(DONNEES.map((d) => [d.cle, t.matchs ? arrondi1((100 * t.avec[d.cle]) / t.matchs) : null]));
  t.moyenne = t.matchs ? arrondi1((100 * total) / (DONNEES.length * t.matchs)) : null;
  return t;
}

// ============================================================== recoupement

const slugCalendrier = (texte) =>
  String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Le carnet face au TABLEAU DE COUVERTURE actuel (getCoverage,
 * espnMatchStatsRefresh.js). Celui-ci part du calendrier de saison (matchs
 * terminés avec un score) et cherche chaque match au magasin par une clé
 * fabriquée avec le NOM des clubs (date-slug-slug) ; le carnet, par les
 * IDENTIFIANTS (nom → identifiant FotMob par l'annuaire, puis jour + clubs).
 * Par compétition : les matchs terminés du calendrier, ceux que les deux
 * trouvent (mêmes comptes : « avec statistiques » et « avec les joueurs » du
 * tableau), ceux que seuls les identifiants trouvent, et les introuvables.
 */
export function recouperCouverture(database, calendrier, rencontres, stats, joueurs) {
  return executerSansPause(recouperCouvertureParMorceaux(database, calendrier, rencontres, stats, joueurs));
}

export function* recouperCouvertureParMorceaux(database, calendrier, rencontres, stats, joueurs) {
  const parCle = new Set(rencontres.keys());
  const parIds = new Map();
  const clubsDeLaLigue = new Map();
  let lues = 0;
  for (const r of rencontres.values()) {
    if (r.homeId && r.awayId) parIds.set(`${r.date}|${r.homeId}|${r.awayId}`, r);
    if (!clubsDeLaLigue.has(r.league)) clubsDeLaLigue.set(r.league, new Set());
    for (const id of [r.homeId, r.awayId]) if (id) clubsDeLaLigue.get(r.league).add(id);
    if ((++lues & 4095) === 0) yield 'recoupement avec le tableau de couverture';
  }
  const alias = new Map();
  for (const a of database.prepare('SELECT slug, team_id FROM team_aliases').iterate()) {
    if (!alias.has(a.slug)) alias.set(a.slug, new Set());
    alias.get(a.slug).add(a.team_id);
  }
  /** Le club d'un nom dans une compétition, s'il est unique ; null sinon. */
  const club = (nom, league) => {
    const candidats = [...(alias.get(slug(nom)) ?? [])];
    const dansLaLigue = candidats.filter((id) => clubsDeLaLigue.get(league)?.has(id));
    const retenus = dansLaLigue.length ? dansLaLigue : candidats;
    return retenus.length === 1 ? retenus[0] : null;
  };
  const parLigue = new Map();
  const ligne = (league) => {
    if (!parLigue.has(league)) parLigue.set(league, { league, finis: 0, parNom: 0, joueursDomicile: 0, champs: 0, parIdsSeulement: 0, introuvables: 0, exemplesIntrouvables: [], joueursCarnet: 0 });
    return parLigue.get(league);
  };
  let toursCalendrier = 0;
  for (const f of Array.isArray(calendrier) ? calendrier : []) {
    // Deux `slug` par entrée (~7 µs) : un point d'arrêt tous les 256 tours.
    if ((++toursCalendrier & TOURS) === 0) yield 'recoupement avec le tableau de couverture';
    const { date, league, homeName, awayName, homeGoals, awayGoals } = f ?? {};
    if (homeGoals === null || homeGoals === undefined || awayGoals === null || awayGoals === undefined) continue;
    if (!date || !league || !homeName || !awayName) continue;
    const l = ligne(league);
    l.finis++;
    const cleNom = `${date}-${slugCalendrier(homeName)}-${slugCalendrier(awayName)}`;
    let r = parCle.has(cleNom) ? rencontres.get(cleNom) : null;
    if (r) {
      l.parNom++;
      // Les deux comptes du tableau actuel, refaits ici : lignes joueur À
      // DOMICILE, champs d'équipe renseignés à domicile.
      if ((joueurs.get(r.matchKey)?.home?.lignes ?? 0) > 0) l.joueursDomicile++;
    } else {
      const h = club(homeName, league);
      const a = club(awayName, league);
      r = h && a ? parIds.get(`${date}|${h}|${a}`) ?? null : null;
      if (r) l.parIdsSeulement++;
      else {
        l.introuvables++;
        if (l.exemplesIntrouvables.length < 5) l.exemplesIntrouvables.push(`${date} ${homeName} – ${awayName} ${homeGoals}-${awayGoals}`);
      }
    }
    if (r && drapeaux(r, stats.get(r.matchKey), joueurs.get(r.matchKey)).joueurs) l.joueursCarnet++;
  }
  const lignes = [...parLigue.values()].sort((a, b) => b.finis - a.finis);
  const somme = (cle) => lignes.reduce((n, l) => n + l[cle], 0);
  return {
    totaux: { finis: somme('finis'), parNom: somme('parNom'), joueursDomicile: somme('joueursDomicile'), parIdsSeulement: somme('parIdsSeulement'), introuvables: somme('introuvables'), joueursCarnet: somme('joueursCarnet') },
    parLigue: lignes
  };
}

// ============================================================ orchestration

const ORDRE_GRAVITE = { erreur: 0, 'a-verifier': 1, info: 2 };
const ORDRE_TYPE = Object.fromEntries(TYPES.map((t, i) => [t.cle, i]));
/** Erreurs d'abord, puis les plus récentes, puis par sorte. */
export const trierAnomalies = (liste) =>
  liste.sort(
    (a, b) =>
      ORDRE_GRAVITE[a.gravite] - ORDRE_GRAVITE[b.gravite] ||
      String(b.date ?? '').localeCompare(String(a.date ?? '')) ||
      ORDRE_TYPE[a.type] - ORDRE_TYPE[b.type] ||
      a.id.localeCompare(b.id)
  );

/** Comptes par sorte et par gravité. */
export function compterParType(anomalies) {
  const compte = Object.fromEntries(TYPES.map((t) => [t.cle, { total: 0, erreur: 0, 'a-verifier': 0, info: 0 }]));
  for (const a of anomalies) {
    compte[a.type].total++;
    compte[a.type][a.gravite]++;
  }
  return compte;
}

/** Dates de découverte gardées d'un contrôle à l'autre ; date du contrôle mise à jour. */
function dater(anomalies, precedentes, maintenantIso) {
  const avant = new Map((precedentes ?? []).map((a) => [a.id, a]));
  for (const a of anomalies) {
    a.trouveeLe = avant.get(a.id)?.trouveeLe ?? maintenantIso;
    a.controleLe = maintenantIso;
  }
  return anomalies;
}

/** Les anomalies reprises sans être refaites gardent la date du contrôle qui les a vues. */
function garderDateDeControle(liste, refaites, precedentes) {
  const anciennes = new Map((precedentes ?? []).map((a) => [a.id, a]));
  const refaitesIds = new Set(refaites.map((a) => a.id));
  for (const a of liste) if (!refaitesIds.has(a.id) && anciennes.has(a.id)) a.controleLe = anciennes.get(a.id).controleLe ?? a.controleLe;
  return liste;
}

/**
 * Les saisons dont ce contrôle a relu la page de compétition FotMob : toutes
 * celles des compétitions qui ont un identifiant FotMob (`pages`, le rapport du
 * contrôle complet sur demande), ou leur saison EN COURS (`omissions`, le
 * rapport de l'étape de la passe) — sauf les compétitions en échec. Pour elles,
 * la liste de ce contrôle remplace l'ancienne.
 */
function saisonsRelues({ pages = null, omissions = null, maintenant }) {
  const echecs = (rapport) => new Set((rapport?.failed ?? []).map((f) => String(f).split(' : ')[0]));
  const echecsPages = echecs(pages);
  const echecsOmissions = echecs(omissions);
  return (ls) => {
    const [league, season] = separerLigueSaison(ls);
    if (!FOTMOB_LEAGUE_IDS[league]) return false;
    if (pages && !echecsPages.has(league)) return true;
    return Boolean(omissions) && !echecsOmissions.has(league) && season === currentSeason(league, new Date(maintenant));
  };
}

/**
 * Les rencontres absentes signalées par un contrôle précédent (pages de
 * compétition, étape « omissions ») dans des saisons que celui-ci n'a pas
 * relues : reprises tant qu'elles manquent au magasin.
 */
function absentesReprises(database, precedentes, relue) {
  const presente = database.prepare('SELECT 1 AS ok FROM matches WHERE fotmob_id = ? LIMIT 1');
  return (precedentes ?? []).filter((a) => {
    const p = porteeDe(a);
    return Boolean(p.fotmob) && !presente.get(p.fotmob) && !relue(p.ligueSaison);
  });
}

/**
 * Pourquoi la passe de nuit ne peut pas servir (le contrôle complet la
 * remplace), ou null : pas de carnet, carnet d'une autre version, ou trop de
 * rencontres nouvelles ou modifiées depuis son repère (SEUIL_NUIT).
 */
export function pourquoiPasDeNuit(database, precedent, options = {}) {
  return executerSansPause(pourquoiPasDeNuitParMorceaux(database, precedent, options));
}

export function* pourquoiPasDeNuitParMorceaux(database, precedent, { seuil = SEUIL_NUIT } = {}) {
  if (!precedent) return 'pas encore de carnet';
  if (precedent.version !== VERSION_CARNET || !precedent.controle?.repere || !Array.isArray(precedent.carnet) || !Array.isArray(precedent.anomalies)) return "carnet d'une autre version";
  const n = (yield* rencontresModifieesDepuis(database, precedent.controle.repere)).length;
  return n > seuil ? `${pluriel(n, 'rencontre nouvelle ou modifiée', 'rencontres nouvelles ou modifiées')} depuis le contrôle précédent, au-delà de ${Number(seuil).toLocaleString('fr-FR')} : tout est relu` : null;
}

/**
 * Les clés des rencontres nouvelles ou modifiées depuis `repere` (`updated_at`
 * au-delà), dans l'ordre de la table. `updated_at` n'a pas d'index : la
 * requête d'avant (`WHERE updated_at > ?`) parcourait toute la table pour n'en
 * rendre presque rien — un seul appel de ~50 ms à chaud, de plusieurs
 * secondes à froid (60 000 rencontres, des lignes de plusieurs ko). Ici,
 * SQLite dit pour CHAQUE rencontre si elle a changé (`updated_at > ?`, la même
 * comparaison, au caractère près) et on ne garde que celles-là : les lignes
 * sortent au fil de l'eau, avec des points d'arrêt.
 */
function* rencontresModifieesDepuis(database, repere) {
  const cles = [];
  let tours = 0;
  for (const r of database.prepare('SELECT match_key, updated_at > ? AS modifiee FROM matches').iterate(repere)) {
    if (r.modifiee === 1) cles.push(r.match_key);
    if ((++tours & 1023) === 0) yield 'rencontres modifiées depuis le dernier contrôle';
  }
  return cles;
}

/** Dédoublonne par identifiant (un même constat vu par deux contrôles ne compte qu'une fois). */
function uniques(anomalies) {
  const vus = new Map();
  for (const a of anomalies) if (!vus.has(a.id)) vus.set(a.id, a);
  return [...vus.values()];
}

/**
 * Le temps de chaque étape (`temps`, dans le résultat) et, avec `pause`, une
 * pause À CHAQUE FIN D'ÉTAPE : la main est rendue au moins une fois par étape,
 * même sur une toute petite base.
 */
function mesureur(journal, pause = null) {
  const temps = {};
  const mesurer = async (nom, f) => {
    const debut = Date.now();
    const r = await f();
    temps[nom] = Date.now() - debut;
    journal?.(`[carnet] ${nom} : ${temps[nom]} ms`);
    if (pause) await pause(nom);
    return r;
  };
  return { temps, mesurer };
}

/** Les contrôles d'une rencontre (`controlesDeRencontre`), sur chacune. */
function* controlesDeToutesLesRencontres(rencontres, stats, joueurs, impossibles) {
  const out = [];
  let tours = 0;
  for (const r of rencontres.values()) {
    out.push(...controlesDeRencontre(r, stats.get(r.matchKey) ?? null, joueurs.get(r.matchKey) ?? null, impossibles.get(r.matchKey) ?? null));
    if ((++tours & TOURS) === 0) yield 'contrôles par rencontre';
  }
  return out;
}

/** Le nombre de rencontres de chaque saison de chaque compétition (l'index (compétition, date) les couvre : aucune ligne n'est lue). */
function* comptesParSaison(database) {
  const comptes = new Map();
  let tours = 0;
  for (const r of database.prepare('SELECT league, date FROM matches').iterate()) {
    const ls = cleLigueSaison(r.league, seasonOf(r.league, r.date));
    comptes.set(ls, (comptes.get(ls) ?? 0) + 1);
    if ((++tours & 1023) === 0) yield 'rencontres par saison';
  }
  return comptes;
}

/**
 * Le CONTRÔLE COMPLET : toutes les rencontres, toutes les saisons.
 * `lireCalendriersFotmob` : facultatif, une fonction qui rend le rapport de
 * findFixtureGaps pour toutes les saisons (réseau : la ligne de commande la
 * passe sur demande, jamais un test) ; `saisonMinFotmob` : la première saison
 * du magasin (ce qui est avant est compté hors du périmètre, cf. manquantsFotmob).
 * Sans pages relues, les rencontres absentes que le contrôle précédent y avait
 * vues sont reprises (tant qu'elles manquent), avec la date de leur lecture.
 * `raison` : pourquoi tout est relu (demandé, pas de carnet, trop de changements).
 * `rendreLaMain` : ce qui rend la main au processus (`setImmediate` par défaut ;
 * les essais y mettent un compteur), au plus toutes les `pasMs` millisecondes de
 * travail et à chaque fin d'étape ; le plus long moment passé sans la rendre
 * est dans `controle.blocMaxMs` (et où : `blocMaxOu`).
 */
export async function controleComplet({ database, calendarPath = null, resultsPath = null, calendrier = null, lireCalendriersFotmob = null, saisonMinFotmob = null, omissions = null, precedent = null, maintenant = new Date(), journal = null, raison = null, rendreLaMain = rendreLaMainParDefaut, pasMs = PAS_MS, enCours = null }) {
  const debut = Date.now();
  const rythme = creerPauses({ rendreLaMain, pasMs });
  const cooperer = (travail) => executerEnRendantLaMain(travail, rythme.siLongtemps);
  const { temps, mesurer } = mesureur(journal, rythme.pause);
  if (precedent && precedent.version !== VERSION_CARNET) precedent = null;
  maintenant = new Date(maintenant); // une date ou son texte ISO
  const premiereDate = database.prepare('SELECT MIN(date) AS d FROM matches').get().d ?? null;
  const rencontres = await mesurer('rencontres', () => cooperer(lireRencontresParMorceaux(database)));
  const stats = await mesurer('statistiques d’équipe', () => cooperer(lireStatsEquipesParMorceaux(database)));
  const joueurs = await mesurer('lignes joueur', () => cooperer(lireLignesJoueursParMorceaux(database)));
  const impossibles = await mesurer('joueurs aux chiffres impossibles', () => cooperer(lireJoueursImpossiblesParMorceaux(database)));
  const anomalies = [];
  anomalies.push(...(await mesurer('contrôles par rencontre', () => cooperer(controlesDeToutesLesRencontres(rencontres, stats, joueurs, impossibles)))));
  anomalies.push(...(await mesurer('doublons', () => cooperer(controlesDoublonsParMorceaux(database, rencontres, null)))));
  const audit = await mesurer('audit des scores', () => cooperer(controlesAuditParMorceaux(database, { calendarPath, resultsPath, rencontres })));
  anomalies.push(...audit.anomalies);
  const classements = await mesurer('classements officiels', () => cooperer(controlesClassementsParMorceaux(database, null, { enCours })));
  anomalies.push(...classements.anomalies);
  anomalies.push(...(await mesurer('homonymes (joueurs)', () => cooperer(homonymesJoueursParMorceaux(database, rencontres, null)))).anomalies);
  anomalies.push(...(await mesurer('homonymes (clubs)', () => cooperer(homonymesClubsParMorceaux(rencontres.values())))));
  // Pas relues cette fois : ce qu'en disait la dernière lecture (datée), s'il y en a une.
  let fotmob = precedent?.controle?.fotmob?.lu
    ? precedent.controle.fotmob
    : { lu: false, raison: 'non demandé (réseau) : la passe de nuit reprend chaque jour la saison en cours par l’étape « omissions »' };
  let rapport = null;
  if (lireCalendriersFotmob) {
    rapport = await mesurer('pages de compétition FotMob', lireCalendriersFotmob);
    const m = manquantsFotmob(database, rapport, { premiereDate, saisonMin: saisonMinFotmob });
    anomalies.push(...m.anomalies);
    fotmob = {
      lu: true,
      le: new Date(maintenant).toISOString(),
      competitions: rapport?.leagues ?? null,
      saisons: rapport?.seasons ?? null,
      jouees: rapport?.played ?? null,
      signalees: m.anomalies.length,
      ecartees: m.ecartees,
      saisonMin: saisonMinFotmob,
      horsPerimetre: m.horsPerimetre,
      echecs: (rapport?.failed ?? []).slice(0, 30)
    };
  }
  // Le rapport de l'étape « omissions » de la passe (le premier contrôle, complet, se fait dans une passe).
  let manquants = null;
  if (omissions) {
    manquants = manquantsFotmob(database, omissions, { premiereDate });
    anomalies.push(...manquants.anomalies);
  }
  // Les absentes d'une lecture précédente, dans les saisons pas relues cette fois.
  const reprises = absentesReprises(database, precedent?.anomalies, saisonsRelues({ pages: rapport, omissions, maintenant }));
  const carnet = await mesurer('carnet', () => cooperer(lignesDuCarnetParMorceaux(rencontres, stats, joueurs, { maintenant, premiereDate })));
  const cal = calendrier ?? null;
  const recoupement = cal ? await mesurer('recoupement avec le tableau de couverture', () => cooperer(recouperCouvertureParMorceaux(database, cal, rencontres, stats, joueurs))) : null;
  let repere = null;
  for (const r of rencontres.values()) if (r.updatedAt && (!repere || r.updatedAt > repere)) repere = r.updatedAt;
  const maintenantIso = new Date(maintenant).toISOString();
  const liste = trierAnomalies(garderDateDeControle(dater(uniques([...anomalies, ...reprises.map((a) => ({ ...a }))]), precedent?.anomalies, maintenantIso), anomalies, precedent?.anomalies));
  const avant = new Set((precedent?.anomalies ?? []).map((a) => a.id));
  const apres = new Set(liste.map((a) => a.id));
  const nouvelles = liste.filter((a) => !avant.has(a.id));
  const dureeMs = Date.now() - debut;
  const { blocMaxMs, blocMaxOu, pauses } = rythme.bilan();
  return {
    version: VERSION_CARNET,
    premiereDate,
    controle: {
      mode: 'complet',
      raison,
      le: maintenantIso,
      dureeMs,
      rencontresControlees: rencontres.size,
      rencontresAuMagasin: rencontres.size,
      saisonsRecomptees: carnet.length,
      repere,
      temps,
      // Le plus long moment passé sans rendre la main au processus, et où il s'est terminé (utils/travailCooperatif.js).
      blocMaxMs,
      blocMaxOu,
      pauses,
      nouvellesAnomalies: nouvelles.length,
      // Sans carnet précédent, tout serait « nouveau » : rien à comparer.
      nouvellesErreurs: precedent ? nouvelles.filter((a) => a.gravite === 'erreur').length : null,
      anomaliesLevees: [...avant].filter((id) => !apres.has(id)).length,
      audit: { rencontres: audit.bilan.matchsAvecStats, attribues: audit.bilan.resultatsAttribues, butsContreSonCamp: audit.bilan.butsContreSonCamp, gardienSortiSansRelayeur: audit.bilan.gardienSortiSansRelayeur },
      classements: classements.resume,
      fotmob,
      omissions: manquants ? { lues: manquants.lues, signalees: manquants.anomalies.length, ecartees: manquants.ecartees } : null
    },
    complet: { le: maintenantIso, dureeMs, rencontres: rencontres.size, fotmob: fotmob.lu },
    historique: [{ le: maintenantIso, mode: 'complet', dureeMs, rencontres: rencontres.size, anomalies: liste.length }, ...(precedent?.historique ?? [])].slice(0, 30),
    recoupement: recoupement ? { le: maintenantIso, ...recoupement } : precedent?.recoupement ?? null,
    carnet,
    totaux: totauxDuCarnet(carnet),
    anomalies: liste,
    parType: compterParType(liste)
  };
}

/**
 * La PASSE DE NUIT : seulement les rencontres nouvelles ou modifiées depuis
 * le contrôle précédent (`updated_at` au-delà de son repère), et les saisons
 * qu'elles touchent (ou dont une rencontre a disparu) ; le reste du carnet et
 * des anomalies est repris tel quel. `omissions` : le rapport de l'étape
 * « omissions » de la même passe (findFixtureGaps, saison en cours), repris
 * sans requête de plus. Sans état précédent utilisable, ou au-delà de
 * `seuil` rencontres à refaire : null (l'appelant lance le contrôle complet,
 * cf. pourquoiPasDeNuit). `rendreLaMain` et `pasMs` : comme pour le contrôle
 * complet ; `controle.blocMaxMs` dit le plus long moment sans rendre la main.
 */
export async function controleDeNuit({ database, precedent, omissions = null, calendarPath = null, resultsPath = null, maintenant = new Date(), journal = null, seuil = SEUIL_NUIT, rendreLaMain = rendreLaMainParDefaut, pasMs = PAS_MS, enCours = null }) {
  maintenant = new Date(maintenant); // une date ou son texte ISO
  const rythme = creerPauses({ rendreLaMain, pasMs });
  const cooperer = (travail) => executerEnRendantLaMain(travail, rythme.siLongtemps);
  const empechement = await cooperer(pourquoiPasDeNuitParMorceaux(database, precedent, { seuil }));
  if (empechement) {
    journal?.(`[carnet] pas de passe de nuit : ${empechement}.`);
    return null;
  }
  const debut = Date.now();
  const { temps, mesurer } = mesureur(journal, rythme.pause);
  const maintenantIso = new Date(maintenant).toISOString();
  const premiereDate = database.prepare('SELECT MIN(date) AS d FROM matches').get().d ?? precedent.premiereDate ?? null;

  // 1. Les rencontres nouvelles ou modifiées depuis le repère.
  const cles = await mesurer('rencontres nouvelles', () => cooperer(rencontresModifieesDepuis(database, precedent.controle.repere)));
  const nouvelles = await cooperer(lireRencontresParMorceaux(database, { cles, lot: 64 }));
  const stats = await cooperer(lireStatsEquipesParMorceaux(database, cles));
  const joueurs = await cooperer(lireLignesJoueursParMorceaux(database, cles));
  const impossibles = await cooperer(lireJoueursImpossiblesParMorceaux(database, cles));

  // 2. Les saisons à recompter : celles des rencontres nouvelles, et celles
  // dont le nombre de rencontres a changé (une rencontre fusionnée, annulée,
  // retirée). Le compte vient de l'index (compétition, date), sans lire les lignes.
  const comptes = await cooperer(comptesParSaison(database));
  const aRecompter = new Set([...nouvelles.values()].map((r) => cleLigueSaison(r.league, r.season)));
  for (const l of precedent.carnet) {
    const ls = cleLigueSaison(l.league, l.season);
    if ((comptes.get(ls) ?? 0) !== l.rencontres) aRecompter.add(ls);
  }
  const dejaAuCarnet = new Set(precedent.carnet.map((l) => cleLigueSaison(l.league, l.season)));
  for (const ls of comptes.keys()) if (!dejaAuCarnet.has(ls)) aRecompter.add(ls);
  // Un « match en cours » d'hier n'excuse plus rien demain : sa saison est
  // revue même sans rencontre nouvelle, et l'écart, s'il reste, redevient une
  // anomalie (retouche du 12/10/2026).
  for (const a of precedent.anomalies) if (a.sorte === 'classement-en-cours' && a.portee?.ligueSaison && comptes.has(a.portee.ligueSaison)) aRecompter.add(a.portee.ligueSaison);

  // 3. Les contrôles, seulement autour des rencontres nouvelles.
  const anomalies = [];
  anomalies.push(...(await cooperer(controlesDeToutesLesRencontres(nouvelles, stats, joueurs, impossibles))));
  const tous = new Map(nouvelles);
  anomalies.push(...(await mesurer('doublons', () => cooperer(controlesDoublonsParMorceaux(database, tous, cles)))));
  const audit = await mesurer('audit des scores', () => cooperer(controlesAuditParMorceaux(database, { cles, calendarPath, resultsPath, rencontres: tous })));
  anomalies.push(...audit.anomalies);
  const homonymes = await mesurer('homonymes (joueurs)', () => cooperer(homonymesJoueursParMorceaux(database, tous, cles, { anciens: precedent.anomalies.map(porteeDe).filter((p) => p.joueur) })));
  anomalies.push(...homonymes.anomalies);

  // 4. Le carnet et les contrôles de saison, seulement pour les saisons à recompter.
  const recomptees = await mesurer('saisons recomptées', () => cooperer(lireRencontresParMorceaux(database, { ligueSaisons: [...aRecompter].filter((ls) => comptes.has(ls)) })));
  const clesRecomptees = [...recomptees.keys()];
  const statsRecomptees = await cooperer(lireStatsEquipesParMorceaux(database, clesRecomptees));
  const joueursRecomptes = await cooperer(lireLignesJoueursParMorceaux(database, clesRecomptees));
  const lignes = await cooperer(lignesDuCarnetParMorceaux(recomptees, statsRecomptees, joueursRecomptes, { maintenant, premiereDate }));
  const avecClassement = new Set([...aRecompter].filter((ls) => hasStandings(separerLigueSaison(ls)[0])));
  const classements = await mesurer('classements officiels', () => cooperer(controlesClassementsParMorceaux(database, avecClassement, { enCours })));
  anomalies.push(...classements.anomalies);
  anomalies.push(...(await cooperer(homonymesClubsParMorceaux(recomptees.values()))));

  // 5. Les rencontres que la page de la compétition connaît et que le magasin
  // ignore encore, d'après l'étape « omissions » de la passe (saison en cours).
  let manquants = null;
  if (omissions) {
    manquants = manquantsFotmob(database, omissions, { premiereDate });
    anomalies.push(...manquants.anomalies);
  }

  // 6. La fusion avec l'état précédent : ce qui a été refait remplace l'ancien,
  // le reste est repris ; une anomalie dont une rencontre a disparu est levée.
  const existe = database.prepare('SELECT 1 AS ok FROM matches WHERE match_key = ?');
  const refaites = new Set(cles);
  // L'étape « omissions » relit la saison EN COURS de chaque compétition qui a
  // un identifiant FotMob, sauf celles en échec : pour elles, la liste de ce
  // soir remplace l'ancienne. Les saisons passées (contrôle complet) restent.
  const absentes = new Set(absentesReprises(database, precedent.anomalies, saisonsRelues({ omissions, maintenant })).map((a) => a.id));
  const reprises = [];
  let toursReprises = 0;
  for (const a of precedent.anomalies) {
    const p = porteeDe(a);
    let reprise = true;
    if (p.cles) reprise = !p.cles.some((c) => refaites.has(c)) && p.cles.every((c) => existe.get(c));
    else if (p.joueur) reprise = !idsDuGroupe(p.joueur).some((id) => homonymes.touches.has(id));
    else if (p.fotmob) reprise = absentes.has(a.id);
    else if (p.ligueSaison) reprise = !aRecompter.has(p.ligueSaison);
    if (reprise) reprises.push(a);
    // Une à deux recherches de rencontre par anomalie reprise (~20 µs chacune) : un point d'arrêt tous les 256 tours.
    if ((++toursReprises & TOURS) === 0) await rythme.siLongtemps('anomalies reprises');
  }
  const liste = trierAnomalies(garderDateDeControle(dater(uniques([...anomalies, ...reprises.map((a) => ({ ...a }))]), precedent.anomalies, maintenantIso), anomalies, precedent.anomalies));

  const carnet = trierCarnet([...precedent.carnet.filter((l) => !aRecompter.has(cleLigueSaison(l.league, l.season))), ...lignes]);
  const avant = new Set(precedent.anomalies.map((a) => a.id));
  const apres = new Set(liste.map((a) => a.id));
  const nouvellesAnomalies = liste.filter((a) => !avant.has(a.id));
  let repere = precedent.controle.repere;
  for (const r of nouvelles.values()) if (r.updatedAt && r.updatedAt > repere) repere = r.updatedAt;
  const dureeMs = Date.now() - debut;
  const { blocMaxMs, blocMaxOu, pauses } = rythme.bilan();
  return {
    version: VERSION_CARNET,
    premiereDate,
    controle: {
      mode: 'nuit',
      le: maintenantIso,
      dureeMs,
      rencontresControlees: nouvelles.size,
      rencontresAuMagasin: [...comptes.values()].reduce((n, x) => n + x, 0),
      saisonsRecomptees: lignes.length,
      repere,
      repereAvant: precedent.controle.repere,
      temps,
      // Le plus long moment passé sans rendre la main au processus, et où il s'est terminé (utils/travailCooperatif.js).
      blocMaxMs,
      blocMaxOu,
      pauses,
      nouvellesAnomalies: nouvellesAnomalies.length,
      nouvellesErreurs: nouvellesAnomalies.filter((a) => a.gravite === 'erreur').length,
      anomaliesLevees: [...avant].filter((id) => !apres.has(id)).length,
      audit: { rencontres: audit.bilan.matchsAvecStats, attribues: audit.bilan.resultatsAttribues, butsContreSonCamp: audit.bilan.butsContreSonCamp, gardienSortiSansRelayeur: audit.bilan.gardienSortiSansRelayeur },
      classements: classements.resume,
      fotmob: precedent.controle.fotmob ?? null,
      omissions: manquants ? { lues: manquants.lues, signalees: manquants.anomalies.length, ecartees: manquants.ecartees } : null
    },
    complet: precedent.complet ?? null,
    historique: [{ le: maintenantIso, mode: 'nuit', dureeMs, rencontres: nouvelles.size, anomalies: liste.length }, ...(precedent.historique ?? [])].slice(0, 30),
    recoupement: precedent.recoupement ?? null,
    carnet,
    totaux: totauxDuCarnet(carnet),
    anomalies: liste,
    parType: compterParType(liste)
  };
}
