/**
 * espnOdds.js — les cotes publiées par ESPN : à venir, en direct, historique.
 * -----------------------------------------------------------------------
 * ESPN affiche, à côté de ses tableaux de scores, les cotes de ses
 * partenaires paris : DraftKings depuis décembre 2025, ESPN BET de novembre
 * 2023 à novembre 2025, et en 2023-2024 jusqu'à une douzaine de bookmakers
 * (Bet365, Unibet, Betfair, Caesars, FanDuel…). Sans clé, en JSON, et
 * CONSERVÉES sur les matchs terminés depuis 2023 : c'est la seule source
 * gratuite d'historique pour la plupart des compétitions que
 * football-data.co.uk ne couvre pas (Colombie, Pérou, coupes…).
 *
 * Trois points d'entrée publics, et seulement eux :
 *   - le tableau d'une journée, TOUTES compétitions :
 *       site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=AAAAMMJJ&limit=1000
 *     cotes DraftKings des matchs à venir et en cours. Sans `limit`, ESPN
 *     coupe à 100 rencontres ; avec, il rend tout (350 un samedi, 2,7 Mo).
 *     Vérifié le 04/10/2026 sur 53 compétitions : mêmes rencontres et mêmes
 *     cotes que les tableaux par compétition. Une requête par jour suffit
 *     donc aux matchs à venir et au direct ;
 *   - le tableau d'une compétition et d'un jour :
 *       site.api.espn.com/apis/site/v2/sports/soccer/{slug}/scoreboard?dates=AAAAMMJJ
 *     une plage de dates est refusée (« Failed to get events endpoint ») ;
 *     sur un match terminé, il ne porte plus de cote : il sert au
 *     rattrapage à lire les scores et les identifiants d'équipe ;
 *   - les cotes d'une rencontre, tous bookmakers, passée ou à venir :
 *       sports.core.api.espn.com/v2/sports/soccer/leagues/{slug}/events/{id}/competitions/{id}/odds
 *     ouverture (open), clôture (close) et valeur du moment (current).
 *
 * Pièges de la source, vérifiés les 03 et 04/10/2026 :
 *   - le « jour » d'ESPN est celui de NEW YORK, pas le jour UTC : un match
 *     de Medellín à 00:45 UTC le 01/03 est rangé le 29/02, un match de
 *     Tijuana à 05:00 UTC rangé le jour même. Les journées à interroger se
 *     calculent donc depuis l'heure de coup d'envoi (meta.kickoff du
 *     magasin), et la cote garde, elle, le jour UTC du coup d'envoi ;
 *   - sur un match terminé, `current` peut être la cote EN MATCH figée au
 *     coup de sifflet final : DraftKings (100) et « ESPN BET - Live Odds »
 *     (59) l'y mettent ; Bet 365 (2000) aussi, dans homeTeamOdds.odds (son
 *     avant-match est dans bettingOdds.teamOdds.preMatch*, en fractions).
 *     La clôture se lit dans le bloc `close`, jamais dans `current` ;
 *   - en 2023, les bookmakers n'ont QUE `current` : c'est la dernière cote
 *     d'avant-match pour presque tous (Bet365 1001 = l'avant-match de Bet 365
 *     2000 à la cote près), mais pas pour tous (Caesars 31 y a laissé une
 *     cote de mi-match). Ces valeurs ne sont prises pour une clôture que si
 *     elles s'accordent (±10 points de probabilité) avec les autres
 *     bookmakers de la rencontre, ou avec leur propre ouverture ;
 *   - les lignes de handicap et de total sont arrondies au dixième (−0,25
 *     s'écrit « -0.3 », 0,75 « +0.8 ») : on les ramène au quart le plus
 *     proche, seul pas qui existe ;
 *   - la cote décimale d'ESPN est arrondie au centième (−260 → 1,38) : on
 *     convertit nous-mêmes l'américaine (1 + 100/260 = 1,385) ;
 *   - le « total » d'un bookmaker n'est pas toujours sa ligne principale
 *     (4,5 buts à 9,0/1,05 relevé en clôture) : un plus/moins ou un
 *     handicap n'est gardé que s'il est équilibré (deux cotes entre 1,30
 *     et 3,50), ce qui est la définition même de la ligne principale ;
 *   - `competitions[0].odds` contient des `null` ; « OFF » remplace une cote
 *     suspendue en match ;
 *   - Caesars apparaît en trois exemplaires (Colorado, Tennessee, New
 *     Jersey) aux mêmes prix : un seul est gardé.
 *
 * Ce module ne touche JAMAIS à la base en écriture : il rend des cotes
 * normalisées (voir l'en-tête d'oddsQuotesRepository.js), l'orchestrateur
 * (freeOdds.js) les range. Il lit le magasin (jours joués, annuaire) et
 * passe par sourceMatching pour les identifiants : alias appris puis
 * annuaire strict (la logique de resolveFixture, club par club, avec un
 * garde-fou : le club doit avoir joué dans la compétition) pour les matchs
 * à venir, voteAttach (jour ± 1 + score) pour les matchs joués. Aucun
 * rapprochement souple des noms.
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { clubDuMagasin } from '../db/oddsProfileRead.js';
import { aliasConnu, apprendreAlias, voteAttach } from './sourceMatching.js';

export const SOURCE = 'espn';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const CORE = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
/** Au moins 300 ms entre deux requêtes, quel que soit l'appelant. */
const PAUSE_MS = 350;
const DELAI_MS = 20_000;
const TENTATIVES = 3;
/** Le magasin commence en janvier 2023, l'historique d'ESPN aussi. */
const DEPUIS = '2023-01-01';
const HEURE_MS = 3_600_000;
const JOUR_MS = 24 * HEURE_MS;

/**
 * Compétitions du magasin -> slug ESPN. Chaque slug a été vérifié le
 * 04/10/2026 par une requête de tableau sur un jour où la compétition a
 * joué d'après le magasin (mêmes affiches, mêmes scores). `id` : numéro de
 * la compétition chez ESPN, celui qu'on lit dans l'uid des rencontres du
 * tableau « toutes compétitions » (« s:600~l:700~e:… »). `qualif` : les
 * tours préliminaires européens vivent sous un autre slug (juin à août) et
 * le magasin les range dans la compétition. `fin` : ESPN a cessé de publier
 * la compétition, il n'en reste que l'historique.
 *
 * Absentes chez ESPN (slug inconnu, réponse 400, ou compétition déclarée
 * sans aucune rencontre de 2023 à 2026) — affichées « non couvertes par
 * ESPN » : Besta deildin (Islande), Canadian Premier League et Canadian
 * Championship, Coupe de Belgique, Coupe de Chine, Coupe de Grèce,
 * Ekstraklasa (Pologne), First League (Tchéquie, cze.1 vide), HNL
 * (Croatie), Nike Liga (Slovaquie), Super Liga (Serbie), Taça da Liga,
 * Türkiye Kupası, Veikkausliiga (Finlande, fin.1 vide), Virsliga (Lettonie).
 */
export const ESPN_ODDS_SLUGS = {
  EPL: { slug: 'eng.1', id: '700' },
  Championship: { slug: 'eng.2', id: '3914' },
  'League 1': { slug: 'eng.3', id: '3915' },
  'League 2': { slug: 'eng.4', id: '3916' },
  'FA Cup - England': { slug: 'eng.fa', id: '3918' },
  'EFL Cup': { slug: 'eng.league_cup', id: '3920' },
  'Premiership - Scotland': { slug: 'sco.1', id: '735' },
  'La Liga - Spain': { slug: 'esp.1', id: '740' },
  'La Liga 2 - Spain': { slug: 'esp.2', id: '3921' },
  'Copa del Rey - Spain': { slug: 'esp.copa_del_rey', id: '3951' },
  'Serie A - Italy': { slug: 'ita.1', id: '730' },
  'Serie B - Italy': { slug: 'ita.2', id: '3931' },
  'Coppa Italia - Italy': { slug: 'ita.coppa_italia', id: '3956' },
  'Bundesliga - Germany': { slug: 'ger.1', id: '720' },
  'Bundesliga 2 - Germany': { slug: 'ger.2', id: '3927' },
  'DFB Pokal - Germany': { slug: 'ger.dfb_pokal', id: '3954' },
  'Ligue 1 - France': { slug: 'fra.1', id: '710' },
  'Ligue 2 - France': { slug: 'fra.2', id: '3926' },
  'Coupe de France': { slug: 'fra.coupe_de_france', id: '3952' },
  'Dutch Eredivisie': { slug: 'ned.1', id: '725' },
  'KNVB Cup - Netherlands': { slug: 'ned.cup', id: '3957' },
  'Primeira Liga - Portugal': { slug: 'por.1', id: '715' },
  'Taça de Portugal': { slug: 'por.taca.portugal', id: '20922' },
  'Belgium First Div': { slug: 'bel.1', id: '3901' },
  'Turkey Super League': { slug: 'tur.1', id: '3946' },
  'Super League - Greece': { slug: 'gre.1', id: '3955' },
  'Austrian Football Bundesliga': { slug: 'aut.1', id: '3907' },
  'Denmark Superliga': { slug: 'den.1', id: '3913' },
  'Eliteserien - Norway': { slug: 'nor.1', id: '3960' },
  'Allsvenskan - Sweden': { slug: 'swe.1', id: '3945' },
  'Premier League - Russia': { slug: 'rus.1', id: '3939' },
  'Super League - China': { slug: 'chn.1', id: '8376' },
  // Historique seulement : ESPN n'a plus aucune rencontre de ces quatre
  // championnats après ces dates (comptes par trimestre du 04/10/2026).
  'League of Ireland': { slug: 'irl.1', id: '3930', fin: '2025-11-30' },
  "Ligat ha'Al - Israel": { slug: 'isr.1', id: '10750', fin: '2025-06-30' },
  'Superliga - Romania': { slug: 'rou.1', id: '10747', fin: '2025-09-30' },
  'Swiss Superleague': { slug: 'sui.1', id: '3944', fin: '2025-09-30' },
  'UEFA Champions League': { slug: 'uefa.champions', id: '775', qualif: { slug: 'uefa.champions_qual', id: '19874' } },
  'UEFA Europa League': { slug: 'uefa.europa', id: '776', qualif: { slug: 'uefa.europa_qual', id: '19887' } },
  'UEFA Europa Conference League': { slug: 'uefa.europa.conf', id: '20296', qualif: { slug: 'uefa.europa.conf_qual', id: '20221' } },
  MLS: { slug: 'usa.1', id: '770' },
  'US Open Cup': { slug: 'usa.open', id: '5337' },
  'Leagues Cup': { slug: 'concacaf.leagues.cup', id: '19425' },
  'Liga MX': { slug: 'mex.1', id: '760' },
  'Brazil Série A': { slug: 'bra.1', id: '630' },
  'Copa do Brasil': { slug: 'bra.copa_do_brazil', id: '8306' },
  'Primera División - Argentina': { slug: 'arg.1', id: '745' },
  'Copa Argentina': { slug: 'arg.copa', id: '8107' },
  'Primera A - Colombia': { slug: 'col.1', id: '650' },
  'Primera División - Chile': { slug: 'chi.1', id: '640' },
  'Copa Chile': { slug: 'chi.copa_chi', id: '8312' },
  'Liga 1 - Peru': { slug: 'per.1', id: '670' },
  'Serie A - Ecuador': { slug: 'ecu.1', id: '660' },
  'División Profesional - Paraguay': { slug: 'par.1', id: '3934' },
  'Primera División - Bolivia': { slug: 'bol.1', id: '620' },
  'Primera División - Venezuela': { slug: 'ven.1', id: '3949' },
  'Copa Libertadores': { slug: 'conmebol.libertadores', id: '783' },
  'Copa Sudamericana': { slug: 'conmebol.sudamericana', id: '5454' }
};

/** Contrat commun : compétition du magasin -> identifiant chez la source (le slug). */
export const LIGUES = Object.fromEntries(Object.entries(ESPN_ODDS_SLUGS).map(([ligue, c]) => [ligue, c.slug]));

/** Numéro ESPN d'une compétition (uid du tableau « toutes compétitions ») -> compétition du magasin. */
const LIGUE_PAR_ID_ESPN = new Map(
  Object.entries(ESPN_ODDS_SLUGS).flatMap(([ligue, c]) => [[c.id, ligue], ...(c.qualif ? [[c.qualif.id, ligue]] : [])])
);

/**
 * Les bookmakers d'ESPN, par numéro de fournisseur. Un même nom peut venir
 * de plusieurs fournisseurs : on n'en garde qu'un par rencontre, le mieux
 * classé (`rang`) qui a une clôture valable — DraftKings ancien (40) et
 * nouveau (100) ; les trois Caesars aux mêmes prix ; et Bet365, publié deux
 * fois : en cotes américaines avec ouverture et clôture (1001, 2023-2024)
 * et en fractions d'avant-match (2000, toutes années) — mêmes prix à la
 * cote près (13/20 = -154), donc un seul livre « Bet365 ».
 * `actif: false` : relevé possible mais désactivé pour ne pas gonfler la
 * base — Titanbets et Holland Casino recopient les prix de Bet365 ou
 * d'Unibet, PointsBet est devenu ESPN BET, SugarHouse est un petit livre
 * américain. Pour en activer un, il suffit de passer `actif` à true.
 * `direct` : son bloc `current` est la cote EN MATCH (jamais une clôture).
 * `liveSeulement` : flux du direct, réservé à collectLive.
 */
const FOURNISSEURS = {
  100: { nom: 'DraftKings', rang: 1, actif: true, direct: true },
  40: { nom: 'DraftKings', rang: 2, actif: true },
  58: { nom: 'ESPN BET', rang: 1, actif: true },
  59: { nom: 'ESPN BET - Live Odds', rang: 1, actif: true, direct: true, liveSeulement: true },
  1001: { nom: 'Bet365', rang: 1, actif: true },
  2000: { nom: 'Bet365', rang: 2, actif: true, bet365: true },
  36: { nom: 'Unibet', rang: 1, actif: true },
  50: { nom: 'BetfairSportsbook', rang: 1, actif: true },
  52: { nom: 'Caesars', rang: 1, actif: true },
  45: { nom: 'Caesars', rang: 2, actif: true },
  57: { nom: 'Caesars', rang: 3, actif: true },
  31: { nom: 'Caesars', rang: 4, actif: true },
  1005: { nom: 'FanDuel', rang: 1, actif: true },
  48: { nom: 'PointsBet', rang: 1, actif: false },
  53: { nom: 'Titanbets', rang: 1, actif: false },
  55: { nom: 'Holland Casino', rang: 1, actif: false },
  41: { nom: 'SugarHouse', rang: 1, actif: false }
};

/**
 * Noms affichés, stables (ceux de BOOKMAKERS_DE_REFERENCE
 * d'oddsQuotesRepository), du plus utile au moins utile ; le dernier n'est
 * rendu qu'en direct (ESPN BET n'existe plus depuis novembre 2025).
 */
export const BOOKMAKERS = ['DraftKings', 'Bet365', 'ESPN BET', 'Unibet', 'BetfairSportsbook', 'Caesars', 'FanDuel', 'ESPN BET - Live Odds'];

/** Ce que la source sait rendre, pour dire à Pierre ce qui manque et pourquoi. */
export const COUVERTURE = {
  source: SOURCE,
  nom: 'ESPN',
  marches: ['1x2', 'ou', 'ah'],
  avantMatch: true,
  live: true,
  historique: 'depuis 2023',
  volumes: false,
  bookmakers: BOOKMAKERS,
  limites: [
    "Avant match : DraftKings seulement (bookmaker américain), publié de quelques jours à deux semaines avant, et pas pour toutes les compétitions (Amérique du Sud, coupes : souvent la veille, parfois jamais).",
    "Plus/moins et handicap : la ligne principale du bookmaker seulement (souvent 2,5 buts, parfois 2,25 ou 3).",
    "Bet365 avant match : seulement pour les rencontres que DraftKings ne cote pas. Bet365, Unibet, Betfair, Caesars, FanDuel, ESPN BET : surtout dans l'historique (ouverture et clôture des matchs joués) ; le nombre de bookmakers varie selon l'année (jusqu'à 7 en 2023-2024, 2 depuis décembre 2025).",
    "Historique 2023 : une seule valeur par bookmaker, gardée comme clôture seulement si elle s'accorde avec les autres bookmakers du match ; les tours préliminaires européens de l'été 2023 n'ont aucune cote.",
    'Aucun volume misé : ESPN ne publie que des cotes.',
    "Irlande, Israël, Roumanie et Suisse : historique seulement, ESPN ne publie plus ces championnats (fin 2025).",
    'Les premiers tours des coupes nationales sont souvent absents chez ESPN.',
    "En direct : la cote DraftKings du moment, au rythme d'ESPN ; une cote suspendue en match est ignorée."
  ]
};

// ---------------------------------------------------------------------------
// Conversions (exactes, arrondies à 3 décimales)
// ---------------------------------------------------------------------------

const arrondi3 = (x) => Math.round(x * 1000) / 1000;

/** Cote américaine -> décimale : +150 -> 2,5 ; -260 -> 1,385 ; « EVEN » -> 2. Null si illisible. */
export function americaineVersDecimale(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const s = String(valeur).trim().toUpperCase();
  if (s === 'EVEN' || s === 'EVENS' || s === 'EV') return 2;
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null; // « OFF », « - », texte
  const n = Number(s);
  // Entre -100 et +100, une cote américaine n'existe pas.
  if (!Number.isFinite(n) || Math.abs(n) < 100) return null;
  return arrondi3(n > 0 ? 1 + n / 100 : 1 + 100 / -n);
}

/** Cote fractionnaire -> décimale : « 13/20 » -> 1,65 ; « 1/1 » -> 2. */
export function fractionVersDecimale(valeur) {
  const s = String(valeur ?? '').trim().toUpperCase();
  if (s === 'EVS' || s === 'EVENS' || s === 'EVEN') return 2;
  const m = s.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const num = Number(m[1]);
  const den = Number(m[2]);
  if (!(num > 0) || !(den > 0)) return null;
  return arrondi3(1 + num / den);
}

/** Cote décimale déjà calculée par ESPN (arrondie au centième) : en dernier recours. */
function decimaleEspn(valeur) {
  const n = Number(valeur);
  return Number.isFinite(n) && n > 1 ? arrondi3(n) : null;
}

/** Ligne au quart le plus proche, sans « -0 ». */
const auQuart = (x) => Math.round(x * 4) / 4 + 0;

/**
 * Ligne d'un total ou d'un handicap : « o2.5 », « u2.5 », « -1.5 », « +0.3 »
 * (= +0,25), « PK » (= 0), « 2.5,3.0 » (ligne asiatique partagée = 2,75).
 * Null si suspendue (« OFF ») ou illisible.
 */
export function ligneDe(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? auQuart(valeur) : null;
  const s = String(valeur).trim().toUpperCase().replace(/^[OU]\s*/, '');
  if (s === 'PK' || s === 'PICK') return 0;
  const double = s.match(/^([+-]?\d+(?:\.\d+)?),\s*([+-]?\d+(?:\.\d+)?)$/);
  if (double) return auQuart((Number(double[1]) + Number(double[2])) / 2);
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
  return auQuart(Number(s));
}

// ---------------------------------------------------------------------------
// Garde-fous : un jeu de cotes n'est rendu que s'il est cohérent
// ---------------------------------------------------------------------------

/**
 * 1x2 complet et plausible : trois cotes > 1, marge entre 0 et 25 % (30 % en
 * match). Un mélange de deux instants (domicile d'avant-match, extérieur de
 * mi-match) donne une somme aberrante — 1,36 relevée sur ESPN BET en 2023.
 */
function jeu1x2Valide(h, d, a, direct = false) {
  if (!(h > 1 && d > 1 && a > 1)) return false;
  const somme = 1 / h + 1 / d + 1 / a;
  return somme >= 0.995 && somme <= (direct ? 1.3 : 1.25);
}

/** Marché à deux issues : marge plausible ET ligne principale (deux cotes entre 1,30 et 3,50). */
function jeu2Valide(x, y) {
  if (!(x > 1 && y > 1)) return false;
  const somme = 1 / x + 1 / y;
  if (somme < 0.995 || somme > 1.2) return false;
  return x >= 1.3 && x <= 3.5 && y >= 1.3 && y <= 3.5;
}

const probas = (j) => {
  const s = 1 / j.h + 1 / j.d + 1 / j.a;
  return [1 / j.h / s, 1 / j.d / s, 1 / j.a / s];
};
const mediane = (xs) => {
  const t = [...xs].sort((a, b) => a - b);
  const m = t.length >> 1;
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
};

/**
 * Une valeur `current` sans bloc `close` sur un match terminé (format 2023,
 * ESPN BET fin 2023) n'est une clôture que si elle s'accorde avec les
 * autres bookmakers de la rencontre (médiane, ±10 points de probabilité
 * sur chaque issue), ou, à défaut d'autre bookmaker, avec sa propre
 * ouverture (±15 points issue par issue, en probabilité brute 1/cote :
 * l'ouverture d'ESPN BET de fin 2023 n'a souvent pas de nul, on compare
 * alors domicile et extérieur seuls). Une cote de fin de match (1,01 contre
 * 41) s'en écarte de 50 points et plus. Sans référence, on s'abstient :
 * mieux vaut une cote absente qu'une cote de mi-match prise pour une clôture.
 */
function currentAccepte(jeu, references, ouverture) {
  if (references.length) {
    const p = probas(jeu);
    const med = [0, 1, 2].map((i) => mediane(references.map((r) => probas(r)[i])));
    return p.every((x, i) => Math.abs(x - med[i]) <= 0.1);
  }
  if (ouverture && ouverture.h > 1 && ouverture.a > 1) {
    const proche = (x, y) => Math.abs(1 / x - 1 / y) <= 0.15;
    return proche(jeu.h, ouverture.h) && proche(jeu.a, ouverture.a) && (!(ouverture.d > 1) || proche(jeu.d, ouverture.d));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Lecture des deux formats de cotes d'ESPN
// ---------------------------------------------------------------------------

/**
 * Format « core » (cotes d'une rencontre) et ancien format du tableau :
 * homeTeamOdds/awayTeamOdds.{open,close,current}.{moneyLine,spread,pointSpread},
 * et à la racine {open,close,current}.{over,under,total,draw}.
 */
function blocsCore(item) {
  const dom = item?.homeTeamOdds ?? {};
  const ext = item?.awayTeamOdds ?? {};
  const prix = (x) => americaineVersDecimale(x?.american ?? x?.alternateDisplayValue) ?? decimaleEspn(x?.decimal ?? x?.value);
  const lire = (bloc) => {
    const racine = item?.[bloc];
    const hb = dom[bloc];
    const ab = ext[bloc];
    if (!racine && !hb && !ab) return null;
    let h = prix(hb?.moneyLine);
    let a = prix(ab?.moneyLine);
    let d = prix(racine?.draw);
    let over = prix(racine?.over);
    let under = prix(racine?.under);
    let ligneTotal = ligneDe(racine?.total?.american ?? racine?.total?.alternateDisplayValue);
    if (bloc === 'current') {
      // Les champs à plat (moneyLine, drawOdds, overUnder…) sont la valeur
      // du moment : ils ne complètent QUE le bloc `current`.
      h ??= americaineVersDecimale(dom.moneyLine);
      a ??= americaineVersDecimale(ext.moneyLine);
      d ??= americaineVersDecimale(item?.drawOdds?.moneyLine);
      over ??= americaineVersDecimale(item?.overOdds);
      under ??= americaineVersDecimale(item?.underOdds);
      ligneTotal ??= ligneDe(item?.overUnder);
    }
    const ligneDom = ligneDe(hb?.pointSpread?.american ?? hb?.pointSpread?.alternateDisplayValue);
    const ligneExt = ligneDe(ab?.pointSpread?.american ?? ab?.pointSpread?.alternateDisplayValue);
    return {
      h,
      d,
      a,
      ou: { line: ligneTotal, over, under },
      // Handicap : une seule ligne, celle du DOMICILE (-1,5 = domicile -1,5,
      // extérieur +1,5), comme le AHh de football-data. Deux lignes qui ne
      // se répondent pas : handicap illisible.
      ah: { line: ligneDom !== null && ligneExt !== null && ligneDom + ligneExt === 0 ? ligneDom : null, home: prix(hb?.spread), away: prix(ab?.spread) }
    };
  };
  return { open: lire('open'), close: lire('close'), current: lire('current') };
}

/**
 * Format du tableau depuis 2025 : moneyline.{home,away,draw}.{open,close,current}.odds,
 * total.{over,under}.{bloc}.{line,odds}, pointSpread.{home,away}.{bloc}.{line,odds}
 * (cotes américaines en texte). Sur un match à venir, `close` y est la
 * valeur du moment ; en match, `close` est la clôture et `current` le direct.
 */
function blocsTableau(item) {
  if (!item?.moneyline && !item?.total && !item?.pointSpread) return blocsCore(item);
  const m = item.moneyline ?? {};
  const t = item.total ?? {};
  const s = item.pointSpread ?? {};
  const lire = (bloc) => {
    const h = americaineVersDecimale(m.home?.[bloc]?.odds);
    const a = americaineVersDecimale(m.away?.[bloc]?.odds);
    const d = americaineVersDecimale(m.draw?.[bloc]?.odds);
    const vide = !m.home?.[bloc] && !m.away?.[bloc] && !m.draw?.[bloc] && !t.over?.[bloc] && !s.home?.[bloc];
    if (vide) return null;
    const lo = ligneDe(t.over?.[bloc]?.line);
    const lu = ligneDe(t.under?.[bloc]?.line);
    const ld = ligneDe(s.home?.[bloc]?.line);
    const le = ligneDe(s.away?.[bloc]?.line);
    return {
      h,
      d,
      a,
      ou: { line: lo !== null && lo === lu ? lo : null, over: americaineVersDecimale(t.over?.[bloc]?.odds), under: americaineVersDecimale(t.under?.[bloc]?.odds) },
      ah: { line: ld !== null && le !== null && ld + le === 0 ? ld : null, home: americaineVersDecimale(s.home?.[bloc]?.odds), away: americaineVersDecimale(s.away?.[bloc]?.odds) }
    };
  };
  return { open: lire('open'), close: lire('close'), current: lire('current') };
}

/**
 * Bet 365 (fournisseur 2000) : l'avant-match est dans bettingOdds.teamOdds,
 * en fractions — preMatchFullTimeResultHome/Draw/Away pour le 1x2,
 * preMatchOverUnderHandicap (la ligne, « 2.75 ») avec
 * preMatchGoalLineOver/Under pour le plus/moins. Ses homeTeamOdds.odds,
 * drawOdds et les clés live* sont la cote EN MATCH : jamais lues.
 */
function blocBet365(item) {
  const t = item?.bettingOdds?.teamOdds ?? {};
  const h = fractionVersDecimale(t.preMatchFullTimeResultHome?.value);
  const d = fractionVersDecimale(t.preMatchFullTimeResultDraw?.value);
  const a = fractionVersDecimale(t.preMatchFullTimeResultAway?.value);
  const over = fractionVersDecimale(t.preMatchGoalLineOver?.value);
  const under = fractionVersDecimale(t.preMatchGoalLineUnder?.value);
  if (h === null && d === null && a === null && over === null && under === null) return null;
  return { h, d, a, ou: { line: ligneDe(t.preMatchOverUnderHandicap?.value), over, under }, ah: null };
}

/** Les cotes normalisées d'un jeu (1x2, plus/moins, handicap), ses garde-fous passés. */
function cotesDuJeu(jeu, { kind, bookmaker, base, direct = false }) {
  const sortie = [];
  if (!jeu) return sortie;
  const cote = (market, selection, line, price) => ({ ...base, bookmaker, market, selection, line, price, prob: null, volume: null, openInterest: null, kind });
  if (jeu1x2Valide(jeu.h, jeu.d, jeu.a, direct)) sortie.push(cote('1x2', 'home', 0, jeu.h), cote('1x2', 'draw', 0, jeu.d), cote('1x2', 'away', 0, jeu.a));
  if (jeu.ou && jeu.ou.line !== null && jeu.ou.line > 0 && jeu2Valide(jeu.ou.over, jeu.ou.under)) {
    sortie.push(cote('ou', 'over', jeu.ou.line, jeu.ou.over), cote('ou', 'under', jeu.ou.line, jeu.ou.under));
  }
  if (jeu.ah && jeu.ah.line !== null && jeu2Valide(jeu.ah.home, jeu.ah.away)) {
    sortie.push(cote('ah', 'home', jeu.ah.line, jeu.ah.home), cote('ah', 'away', jeu.ah.line, jeu.ah.away));
  }
  return sortie;
}

/**
 * Les fournisseurs actifs d'une liste d'ESPN, regroupés par nom affiché et
 * triés par rang (l'appelant garde le premier qui rend quelque chose) ; le
 * flux du direct seulement si on le demande. Les autres (désactivés,
 * inconnus) sont rendus à part, pour le bilan.
 */
function fournisseursParNom(items, { live = false } = {}) {
  const groupes = new Map();
  const ignores = new Set();
  for (const item of items ?? []) {
    if (!item) continue;
    const id = String(item.provider?.id ?? '');
    const f = FOURNISSEURS[id];
    if (!f || !f.actif || (f.liveSeulement && !live)) {
      ignores.add(item.provider?.name ?? id);
      continue;
    }
    if (!groupes.has(f.nom)) groupes.set(f.nom, []);
    groupes.get(f.nom).push({ f, item });
  }
  for (const g of groupes.values()) g.sort((x, y) => x.f.rang - y.f.rang);
  return { groupes: [...groupes.values()], ignores: [...ignores] };
}

/**
 * Le tableau ne montre de Bet365 (2000) qu'une coquille vide : ses cotes
 * sont dans l'API « core ». Sa présence dit seulement qu'il y en a.
 */
const coquilleBet365 = (ev) => (ev.cotes ?? []).some((o) => FOURNISSEURS[String(o?.provider?.id ?? '')]?.bet365);
/** Le tableau porte-t-il au moins un bookmaker lisible (hors coquille Bet365 et flux live) ? */
const bookmakerLisible = (ev, { live = false } = {}) =>
  (ev.cotes ?? []).some((o) => {
    const f = FOURNISSEURS[String(o?.provider?.id ?? '')];
    return f && f.actif && !f.bet365 && (live || !f.liveSeulement);
  });

// ---------------------------------------------------------------------------
// HTTP : rythme lent, reprises, budget de requêtes
// ---------------------------------------------------------------------------

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
/** File d'attente commune au module : deux collectes simultanées ne se doublent pas. */
let file = Promise.resolve();
let dernierDepart = 0;
function tour() {
  const p = file.then(async () => {
    const attente = dernierDepart + PAUSE_MS - Date.now();
    if (attente > 0) await pause(attente);
    dernierDepart = Date.now();
  });
  file = p.catch(() => {});
  return p;
}

class BudgetEpuise extends Error {}

/** Un compteur de requêtes par appel ; `budget` = nombre maximal de requêtes HTTP. */
function nouveauClient(budget = Infinity) {
  return { requests: 0, budget };
}

/**
 * GET JSON, 3 tentatives à attente croissante, délai 20 s. Rend
 * { status, data, releveAt } ; data = null sur 400/404 (ESPN répond 400 à
 * un slug ou un jour qu'il ne connaît pas : ce n'est pas une panne). Lève
 * sur panne persistante ou budget épuisé — chaque appelant rattrape.
 */
async function getJson(url, client) {
  let derniere = null;
  for (let essai = 1; essai <= TENTATIVES; essai++) {
    if (client.requests >= client.budget) throw new BudgetEpuise('budget de requêtes atteint');
    if (essai > 1) await pause(1000 * 2 ** (essai - 2));
    await tour();
    client.requests++;
    const controle = new AbortController();
    const minuterie = setTimeout(() => controle.abort(), DELAI_MS);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: controle.signal });
      if (r.status === 400 || r.status === 404) return { status: r.status, data: null, releveAt: new Date().toISOString() };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      return { status: r.status, data, releveAt: new Date().toISOString() };
    } catch (error) {
      derniere = error?.name === 'AbortError' ? new Error(`délai de ${DELAI_MS / 1000} s dépassé`) : error;
    } finally {
      clearTimeout(minuterie);
    }
  }
  throw derniere ?? new Error('échec inconnu');
}

const AAAAMMJJ = (jour) => String(jour).replace(/-/g, '');
const urlTableau = (slug, jour) => `${SITE}/${slug}/scoreboard?dates=${AAAAMMJJ(jour)}`;
const urlTableauTous = (jour) => `${SITE}/all/scoreboard?dates=${AAAAMMJJ(jour)}&limit=1000`;
const urlCotes = (slug, id) => `${CORE}/${slug}/events/${id}/competitions/${id}/odds?lang=en&region=us&limit=100`;

/**
 * Tableau d'une compétition pour un JOUR ESPN (jour de New York,
 * « AAAA-MM-JJ »). Ne lève jamais : { url, status, data, releveAt, error }.
 */
export async function fetchScoreboard(slug, isoDate, { client = nouveauClient() } = {}) {
  const url = urlTableau(slug, isoDate);
  try {
    return { url, ...(await getJson(url, client)), error: null };
  } catch (error) {
    return { url, status: null, data: null, releveAt: null, error: error.message };
  }
}

/** Tableau du jour ESPN (New York), toutes compétitions, sans la coupure à 100. */
export async function fetchAllScoreboard(isoDate, { client = nouveauClient() } = {}) {
  const url = urlTableauTous(isoDate);
  try {
    return { url, ...(await getJson(url, client)), error: null };
  } catch (error) {
    return { url, status: null, data: null, releveAt: null, error: error.message };
  }
}

/** Cotes d'une rencontre, tous bookmakers (une page de 100 suffit : 13 au plus relevés). */
export async function fetchEventOdds(slug, eventId, { client = nouveauClient() } = {}) {
  const url = urlCotes(slug, eventId);
  try {
    return { url, ...(await cotesRencontre(url, client)), error: null };
  } catch (error) {
    return { url, status: null, data: null, releveAt: null, error: error.message };
  }
}

/**
 * Les cotes d'une rencontre, toutes pages : 13 bookmakers au plus relevés,
 * une page de 100 suffit, mais une liste plus longue ne doit pas être
 * tronquée en silence. Lève comme getJson (budget, panne).
 */
async function cotesRencontre(url, client) {
  const premiere = await getJson(url, client);
  const pages = Number(premiere.data?.pageCount) || 1;
  if (!premiere.data || pages <= 1) return premiere;
  const items = [...(premiere.data.items ?? [])];
  for (let page = 2; page <= Math.min(pages, 5); page++) {
    const suite = await getJson(`${url}&page=${page}`, client);
    items.push(...(suite.data?.items ?? []));
  }
  return { ...premiere, data: { ...premiere.data, items } };
}

// ---------------------------------------------------------------------------
// Dates : jour UTC du coup d'envoi, jour ESPN (New York)
// ---------------------------------------------------------------------------

const FORMAT_NEW_YORK = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Jour ESPN (New York) d'un instant : c'est sous ce jour qu'ESPN range la rencontre. */
export function jourEspn(instant) {
  const t = typeof instant === 'number' ? instant : Date.parse(instant);
  if (!Number.isFinite(t)) return null;
  const parts = Object.fromEntries(FORMAT_NEW_YORK.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const decaler = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const ecartJours = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / JOUR_MS;
const isoOuNull = (x) => {
  if (!x) return null;
  const t = Date.parse(x);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const moisAnnee = (jour) => `${MOIS[Number(jour.slice(5, 7)) - 1]} ${jour.slice(0, 4)}`;

/** Le slug à interroger pour un jour : tours préliminaires européens de juin à août. */
function slugsDuJour(conf, jour) {
  const mois = Number(String(jour).slice(5, 7));
  if (conf.qualif && mois >= 6 && mois <= 8) return [conf.qualif.slug, conf.slug];
  return [conf.slug];
}

// ---------------------------------------------------------------------------
// Lecture d'une rencontre du tableau
// ---------------------------------------------------------------------------

const entier = (v) => {
  const brut = v && typeof v === 'object' ? (v.value ?? v.displayValue) : v;
  if (brut === null || brut === undefined || String(brut).trim() === '') return null;
  const n = Number(brut);
  return Number.isInteger(n) && n >= 0 ? n : null;
};
const nomEquipe = (team) => String(team?.displayName ?? team?.name ?? team?.shortDisplayName ?? '').trim();

/** Forme compacte d'une rencontre du tableau ; null si elle n'a pas ses deux équipes. */
function lireEvenement(e, slug = null) {
  const c = e?.competitions?.[0];
  const dom = c?.competitors?.find((x) => x?.homeAway === 'home');
  const ext = c?.competitors?.find((x) => x?.homeAway === 'away');
  if (!e?.id || !dom?.team || !ext?.team) return null;
  const type = c?.status?.type ?? e?.status?.type ?? {};
  const kickoff = isoOuNull(e.date ?? c?.date);
  return {
    id: String(e.id),
    slug,
    ligueId: String(e.uid ?? '').match(/~l:(\d+)/)?.[1] ?? null,
    kickoff,
    date: kickoff ? kickoff.slice(0, 10) : null,
    etat: type.state ?? null,
    termine: type.completed === true,
    statut: type.name ?? null,
    dom: { id: String(dom.team.id ?? dom.id ?? ''), nom: nomEquipe(dom.team), score: entier(dom.score) },
    ext: { id: String(ext.team.id ?? ext.id ?? ''), nom: nomEquipe(ext.team), score: entier(ext.score) },
    cotes: (c?.odds ?? []).filter(Boolean)
  };
}

const evenementsDu = (data, slug = null) => (data?.events ?? []).map((e) => lireEvenement(e, slug)).filter(Boolean);

// ---------------------------------------------------------------------------
// Identités : ESPN -> identifiants FotMob, jamais par ressemblance
// ---------------------------------------------------------------------------

/**
 * Les noms qu'aucun alias ni l'annuaire n'ont traduits, gardés six heures :
 * interroger l'annuaire pour un nom inconnu coûte ~0,6 s (il relit les
 * écritures de tous les clubs de la compétition), et le même nom revient à
 * chaque passe. Seul l'annuaire est sauté : un alias appris entre-temps
 * (par le vote du rattrapage) est vu tout de suite.
 */
const INCONNUS = new Map();
const INCONNU_DUREE_MS = 6 * HEURE_MS;

const requetesJoue = new WeakMap();
/** Réponses déjà connues : un club qui a joué dans une compétition y a joué pour de bon. */
const JOUE_DANS = new Map();
/**
 * Le club a-t-il déjà joué dans CETTE compétition au magasin ? Par les
 * index des identifiants de club (0,2 à 35 ms) et non par celui de la
 * compétition, qui relisait toutes ses rencontres pour un club absent
 * (100 à 350 ms).
 */
function joueDans(league, teamId, database) {
  const cle = `${league}|${teamId}`;
  const connu = JOUE_DANS.get(cle);
  if (connu && (connu.oui || Date.now() - connu.at < INCONNU_DUREE_MS)) return connu.oui;
  let r = requetesJoue.get(database);
  if (!r) {
    r = database.prepare('SELECT 1 AS ok FROM matches WHERE home_id = ?1 AND league = ?2 UNION ALL SELECT 1 FROM matches WHERE away_id = ?1 AND league = ?2 LIMIT 1');
    requetesJoue.set(database, r);
  }
  let oui = false;
  try {
    oui = Boolean(r.get(teamId, league));
  } catch {
    oui = false;
  }
  if (JOUE_DANS.size >= CLUBS_CALENDRIER_MAX) JOUE_DANS.delete(JOUE_DANS.keys().next().value);
  JOUE_DANS.set(cle, { oui, at: Date.now() });
  return oui;
}

const requetesIdAilleurs = new WeakMap();
/**
 * L'identifiant d'équipe ESPN est le même dans toutes les compétitions
 * (Manchester City = 382 en championnat et en Coupe de la Ligue, Santos =
 * 2674 en Série A et en Coupe du Brésil, vérifié le 04/10/2026) : appris
 * par le vote dans un championnat, il sert dans les coupes, où un club se
 * voit trop rarement pour que le vote tranche. Seulement s'il désigne UN
 * seul club FotMob, toutes compétitions confondues.
 */
function idEspnAilleurs(cle, database) {
  let r = requetesIdAilleurs.get(database);
  if (!r) {
    r = database.prepare('SELECT DISTINCT team_id AS teamId FROM team_source_aliases WHERE source = ? AND name = ?');
    requetesIdAilleurs.set(database, r);
  }
  try {
    const ids = r.all(SOURCE, cle).map((x) => x.teamId);
    return ids.length === 1 ? ids[0] : null;
  } catch {
    return null;
  }
}

/**
 * Résolveur d'un appel, mémorisé club par club — la logique de
 * resolveFixture/resolveTeamId, avec deux ajouts : l'alias appris dans la
 * compétition (le nom, puis l'identifiant ESPN « id:… »), sinon le même
 * identifiant ESPN appris dans une autre compétition (idEspnAilleurs),
 * sinon l'annuaire strict (clubDuMagasin), accepté SEULEMENT si le club a
 * déjà joué dans cette compétition au magasin. Sans ce garde-fou,
 * l'annuaire, faute de club de ce nom dans la compétition, rend le seul
 * club du nom toutes compétitions confondues : « Liverpool » en Copa
 * Libertadores (le club uruguayen, « Liverpool FC » au magasin) devenait le
 * Liverpool anglais, « Santos » en Liga MX (Santos Laguna) le Santos
 * brésilien — et resolveTeamId aurait APPRIS ces alias faux pour toujours.
 * Ce qui est trouvé est appris ; rien n'est deviné.
 */
function resolveur(database) {
  const memo = new Map();
  const club = (league, equipe) => {
    const cle = `${league}|${equipe.nom}|${equipe.id}`;
    if (memo.has(cle)) return memo.get(cle);
    const keys = equipe.id ? [`id:${equipe.id}`] : [];
    let id = null;
    try {
      for (const k of [equipe.nom, ...keys]) {
        id = aliasConnu(SOURCE, k, league, { database });
        if (id) break;
      }
      if (!id) {
        for (const k of keys) {
          id = idEspnAilleurs(k, database);
          if (id) break;
        }
        if (id) for (const k of [equipe.nom, ...keys]) apprendreAlias(SOURCE, k, league, id, 'id-espn', { database });
      }
      const vu = INCONNUS.get(`${league}|${equipe.nom}`);
      if (!id && equipe.nom && !(vu && Date.now() - vu < INCONNU_DUREE_MS)) {
        id = clubDuMagasin(equipe.nom, league, database) ?? null;
        if (id && !joueDans(league, id, database)) id = null;
        if (id) for (const k of [equipe.nom, ...keys]) apprendreAlias(SOURCE, k, league, id, 'annuaire', { database });
        else INCONNUS.set(`${league}|${equipe.nom}`, Date.now());
      }
    } catch {
      id = null;
    }
    memo.set(cle, id ?? null);
    return id ?? null;
  };
  return (league, ev) => ({ homeId: club(league, ev.dom), awayId: club(league, ev.ext) });
}

/**
 * Clubs du calendrier (noms FotMob) déjà cherchés dans l'annuaire : un nom
 * trouvé ne change pas d'identifiant ; un nom introuvable est retenté au
 * bout de six heures (l'annuaire a pu apprendre le club entre-temps).
 */
const CLUBS_CALENDRIER = new Map();
const CLUBS_CALENDRIER_MAX = 5000;

/** Identifiants FotMob d'une rencontre du calendrier (fournis, sinon annuaire strict). */
function idsDuCalendrier(fx, database) {
  const un = (nom) => {
    const cle = `${fx.league}|${nom}`;
    const connu = CLUBS_CALENDRIER.get(cle);
    if (connu && (connu.id || Date.now() - connu.at < INCONNU_DUREE_MS)) return connu.id;
    let id = null;
    try {
      id = clubDuMagasin(nom, fx.league, database);
      // Même garde-fou que pour les noms d'ESPN : pas d'homonyme d'une autre compétition.
      if (id && !joueDans(fx.league, id, database)) id = null;
    } catch {
      id = null;
    }
    if (CLUBS_CALENDRIER.size >= CLUBS_CALENDRIER_MAX) CLUBS_CALENDRIER.delete(CLUBS_CALENDRIER.keys().next().value);
    CLUBS_CALENDRIER.set(cle, { id: id ?? null, at: Date.now() });
    return id ?? null;
  };
  return { homeId: fx.homeId ?? un(fx.homeName), awayId: fx.awayId ?? un(fx.awayName) };
}

/**
 * Apparie les rencontres d'ESPN d'une compétition à celles du calendrier,
 * par IDENTIFIANTS et jour (± 1), du plus sûr au moins sûr :
 *   0. les deux identifiants, même jour ; 1. les deux, jour ± 1 ;
 *   2-3. un seul club reconnu, du MÊME côté, l'autre inconnu chez ESPN ou au
 *      calendrier (jamais reconnu comme un club différent) : un club ne joue
 *      pas deux matchs à un jour d'écart, le côté et le jour désignent donc
 *      la rencontre sans rien supposer du nom inconnu.
 * Les affiches inversées (terrain neutre) sont signalées, jamais retournées.
 * Rend Map(fixture -> { ev, inverse, demi }).
 */
function apparier(fixtures, evenements) {
  const paires = [];
  for (const fx of fixtures) {
    const fh = fx.ids.homeId;
    const fa = fx.ids.awayId;
    if (!fh && !fa) continue;
    for (const ev of evenements) {
      if (!ev.date) continue;
      const ecart = ecartJours(ev.date, fx.date);
      if (ecart > 1) continue;
      const eh = ev.ids.homeId;
      const ea = ev.ids.awayId;
      if (fh && fa && eh === fh && ea === fa) paires.push({ fx, ev, rang: ecart === 0 ? 0 : 1 });
      else if (fh && fa && eh === fa && ea === fh) paires.push({ fx, ev, rang: 4, inverse: true });
      else if (fh && eh === fh && (!ea || !fa)) paires.push({ fx, ev, rang: ecart === 0 ? 2 : 3, demi: true });
      else if (fa && ea === fa && (!eh || !fh)) paires.push({ fx, ev, rang: ecart === 0 ? 2 : 3, demi: true });
    }
  }
  paires.sort((x, y) => x.rang - y.rang);
  const pris = new Set();
  const resultat = new Map();
  for (const p of paires) {
    if (resultat.has(p.fx) || pris.has(p.ev.id)) continue;
    pris.add(p.ev.id);
    resultat.set(p.fx, { ev: p.ev, inverse: Boolean(p.inverse), demi: Boolean(p.demi) });
  }
  return resultat;
}

/** Appariement compétition par compétition (les identifiants FotMob sont propres à chaque club). */
function apparierParLigue(fixtures, vus) {
  const resultat = new Map();
  const parLigue = new Map();
  for (const ev of vus.values()) {
    if (!parLigue.has(ev.league)) parLigue.set(ev.league, []);
    parLigue.get(ev.league).push(ev);
  }
  for (const league of new Set(fixtures.map((fx) => fx.league))) {
    for (const [fx, p] of apparier(fixtures.filter((fx) => fx.league === league), parLigue.get(league) ?? [])) resultat.set(fx, p);
  }
  return resultat;
}

/**
 * Prépare les rencontres du calendrier pour une collecte : écarte les
 * compétitions non couvertes (l'appli le dit depuis LIGUES), note celles
 * qu'ESPN ne publie plus, résout les identifiants des deux clubs.
 */
function preparerFixtures(fixtures, db, res) {
  const aTraiter = [];
  for (const fx of fixtures ?? []) {
    if (!fx?.league || !fx.date || !fx.homeName || !fx.awayName) continue;
    const conf = ESPN_ODDS_SLUGS[fx.league];
    if (!conf) continue;
    if (conf.fin && fx.date > conf.fin) {
      res.missing.push({ league: fx.league, date: fx.date, homeName: fx.homeName, awayName: fx.awayName, reason: `ESPN ne publie plus cette compétition depuis ${moisAnnee(conf.fin)}` });
      continue;
    }
    aTraiter.push({ ...fx, ids: idsDuCalendrier(fx, db), kickoffConnu: isoOuNull(fx.kickoff) });
  }
  return aTraiter;
}

/**
 * Range les rencontres d'un tableau « toutes compétitions » dont la
 * compétition est demandée, identifiants résolus. node:sqlite est
 * synchrone et un nom absent de l'annuaire coûte ~0,6 s : on rend la main
 * au serveur après chaque résolution lente, pour ne pas le figer au premier
 * passage (ensuite, les alias appris rendent la résolution immédiate).
 */
async function retenirEvenements(data, url, releveAt, ligues, vus, resoudre) {
  for (const ev of evenementsDu(data)) {
    const league = LIGUE_PAR_ID_ESPN.get(ev.ligueId);
    if (!league || !ligues.has(league) || vus.has(ev.id)) continue;
    const debut = Date.now();
    vus.set(ev.id, { ...ev, league, url, releveAt, ids: resoudre(league, ev) });
    if (Date.now() - debut > 30) await new Promise((r) => setImmediate(r));
  }
}

/** Noms ESPN non traduits, parmi les rencontres d'ESPN restées sans rencontre du calendrier. */
function nomsInconnus(evenements) {
  return [...new Set(evenements.flatMap((ev) => [!ev.ids.homeId && ev.dom.nom, !ev.ids.awayId && ev.ext.nom].filter(Boolean)))];
}

/** Contrat : [{ name, league }] des noms ESPN que ni alias ni annuaire n'ont traduits (sans doublon). */
function nomsNonTraduits(evenements) {
  const vus = new Map();
  for (const ev of evenements) {
    for (const [id, nom] of [[ev.ids.homeId, ev.dom.nom], [ev.ids.awayId, ev.ext.nom]]) if (!id && nom) vus.set(`${ev.league}|${nom}`, { name: nom, league: ev.league });
  }
  return [...vus.values()];
}

/** Pourquoi une rencontre du calendrier n'a pas d'événement ESPN. */
function raisonIntrouvable(fx, libres) {
  const inconnusFx = [!fx.ids.homeId && fx.homeName, !fx.ids.awayId && fx.awayName].filter(Boolean);
  if (inconnusFx.length) return `équipe du calendrier inconnue de l'annuaire : ${inconnusFx.join(', ')}`;
  const proches = libres.filter((ev) => ev.league === fx.league && ev.date && ecartJours(ev.date, fx.date) <= 1);
  const inconnus = nomsInconnus(proches);
  return inconnus.length ? `nom d'équipe non reconnu : ${inconnus.join(', ')}` : 'match introuvable chez ESPN';
}

const evenementPourLive = (fx, p) => ({
  sourceEvent: p.ev.id,
  league: fx.league,
  date: p.ev.date,
  homeId: fx.ids.homeId ?? p.ev.ids.homeId,
  awayId: fx.ids.awayId ?? p.ev.ids.awayId,
  homeName: p.ev.dom.nom,
  awayName: p.ev.ext.nom,
  kickoff: p.ev.kickoff,
  slug: ESPN_ODDS_SLUGS[fx.league].slug,
  etat: p.ev.etat,
  statut: p.ev.statut,
  rattachement: p.demi ? 'un seul identifiant' : 'identifiants',
  // La rencontre du calendrier qu'elle couvre (noms FotMob), pour les manques et la boucle live.
  calendrier: { date: fx.date, homeName: fx.homeName, awayName: fx.awayName }
});

/** Base commune des cotes d'une rencontre appariée (noms chez ESPN, identifiants FotMob). */
const baseCote = (fx, p, provenance, releveAt) => ({
  source: SOURCE,
  sourceEvent: p.ev.id,
  date: p.ev.date,
  kickoff: p.ev.kickoff,
  league: fx.league,
  homeId: fx.ids.homeId ?? p.ev.ids.homeId,
  awayId: fx.ids.awayId ?? p.ev.ids.awayId,
  homeName: p.ev.dom.nom,
  awayName: p.ev.ext.nom,
  matchKey: null,
  provenance,
  releveAt
});

// ---------------------------------------------------------------------------
// Matchs à venir
// ---------------------------------------------------------------------------

/**
 * Cotes d'une rencontre du tableau, selon son état (un seul fournisseur par
 * nom, le premier qui rend quelque chose) :
 *   - à venir (« pre ») : open -> 'open', valeur du moment -> 'snapshot'
 *     (dans le tableau, `close` EST la valeur du moment : jamais une clôture) ;
 *   - commencée ou finie : open -> 'open', close -> 'close' (dernière cote
 *     d'avant-match) ;
 *   - en direct (`live`) : current -> 'live', pour les seules rencontres « in ».
 */
function cotesDuTableau(ev, base, { live = false } = {}) {
  const cotes = [];
  for (const groupe of fournisseursParNom(ev.cotes, { live }).groupes) {
    for (const { f, item } of groupe) {
      if (f.bet365) continue; // coquille vide dans le tableau
      const b = blocsTableau(item);
      const lot = [];
      if (live) {
        if (ev.etat === 'in') lot.push(...cotesDuJeu(b.current, { kind: 'live', bookmaker: f.nom, base, direct: true }));
      } else if (!f.liveSeulement) {
        lot.push(...cotesDuJeu(b.open, { kind: 'open', bookmaker: f.nom, base }));
        if (ev.etat === 'pre') lot.push(...cotesDuJeu(b.current ?? b.close, { kind: 'snapshot', bookmaker: f.nom, base }));
        else if (b.close) lot.push(...cotesDuJeu(b.close, { kind: 'close', bookmaker: f.nom, base }));
      }
      if (lot.length) {
        cotes.push(...lot);
        break;
      }
    }
  }
  return cotes;
}

/**
 * Avant-match d'une rencontre À VENIR lu dans l'API « core » : Bet365 en
 * fractions (valeur du moment -> 'snapshot'), et pour les autres
 * l'ouverture et la valeur du moment.
 */
function cotesAVenirCore(items, base) {
  const cotes = [];
  for (const groupe of fournisseursParNom(items).groupes) {
    for (const { f, item } of groupe) {
      let lot;
      if (f.bet365) lot = cotesDuJeu(blocBet365(item), { kind: 'snapshot', bookmaker: f.nom, base });
      else {
        const b = blocsCore(item);
        lot = [...cotesDuJeu(b.open, { kind: 'open', bookmaker: f.nom, base }), ...cotesDuJeu(b.current ?? b.close, { kind: 'snapshot', bookmaker: f.nom, base })];
      }
      if (lot.length) {
        cotes.push(...lot);
        break;
      }
    }
  }
  return cotes;
}

/** Au plus tant de rencontres complétées par l'API « core » à chaque collecte. */
const COMPLEMENT_MAX = 60;

/**
 * Cotes des rencontres À VENIR du calendrier. Une requête par jour ESPN
 * (tableau toutes compétitions) ; une deuxième passe interroge la veille
 * (jour de New York) pour les rencontres non trouvées dont on ignore
 * l'heure : un match à 01:00 UTC est rangé par ESPN la veille au soir. Puis,
 * pour les rencontres que DraftKings ne cote pas mais où le tableau montre
 * Bet365, une requête « core » par rencontre (au plus COMPLEMENT_MAX).
 * Rend { quotes, requests, unresolved, errors, events, missing }.
 */
export async function collectUpcoming({ fixtures = [], database = null, log = () => {} } = {}) {
  const res = { quotes: [], requests: 0, unresolved: [], errors: [], events: [], missing: [] };
  const client = nouveauClient();
  try {
    const db = database ?? openDb();
    const resoudre = resolveur(db);
    const aTraiter = preparerFixtures(fixtures, db, res);
    if (!aTraiter.length) return res;

    const ligues = new Set(aTraiter.map((fx) => fx.league));
    const vus = new Map(); // id ESPN -> rencontre (identifiants résolus)
    const joursLus = new Map(); // jour ESPN -> 'ok' | message d'erreur
    const lireJour = async (jour) => {
      if (joursLus.has(jour)) return;
      const r = await fetchAllScoreboard(jour, { client });
      if (r.error || !r.data) {
        joursLus.set(jour, r.error ?? `réponse ${r.status}`);
        if (r.error) res.errors.push(`tableau du ${jour} : ${r.error}`);
        return;
      }
      joursLus.set(jour, 'ok');
      await retenirEvenements(r.data, r.url, r.releveAt, ligues, vus, resoudre);
    };
    const jourDe = (fx) => (fx.kickoffConnu ? jourEspn(fx.kickoffConnu) : fx.date);

    // 1. Le jour ESPN de chaque rencontre : celui de son heure si on la
    //    connaît, sinon son jour UTC (juste pour tout coup d'envoi après
    //    04:00 UTC, l'immense majorité).
    for (const jour of [...new Set(aTraiter.map(jourDe))].sort()) await lireJour(jour);
    let paires = apparierParLigue(aTraiter, vus);
    // 2. La veille (New York) pour les rencontres restées seules, heure inconnue.
    const veilles = [...new Set(aTraiter.filter((fx) => !paires.has(fx) && !fx.kickoffConnu).map((fx) => decaler(fx.date, -1)))].filter((j) => !joursLus.has(j)).sort();
    for (const jour of veilles) await lireJour(jour);
    if (veilles.length) paires = apparierParLigue(aTraiter, vus);

    // 3. Cotes du tableau ; rencontres pour la boucle live ; manques.
    const apparies = new Set([...paires.values()].map((p) => p.ev.id));
    const libres = [...vus.values()].filter((ev) => !apparies.has(ev.id));
    const aCompleter = [];
    for (const fx of aTraiter) {
      const p = paires.get(fx);
      const manque = (reason) => res.missing.push({ league: fx.league, date: fx.date, homeName: fx.homeName, awayName: fx.awayName, reason });
      if (!p) {
        const panne = joursLus.get(jourDe(fx));
        manque(panne && panne !== 'ok' ? `requête ESPN en échec (${panne})` : raisonIntrouvable(fx, libres));
        continue;
      }
      if (p.inverse) {
        manque('ESPN inverse domicile et extérieur (terrain neutre ?)');
        continue;
      }
      res.events.push(evenementPourLive(fx, p));
      const cotes = cotesDuTableau(p.ev, baseCote(fx, p, p.ev.url, p.ev.releveAt));
      res.quotes.push(...cotes);
      if (cotes.length) continue;
      if (p.ev.etat === 'pre' && coquilleBet365(p.ev)) aCompleter.push({ fx, p });
      else if (p.ev.etat === 'post') manque(p.ev.termine ? 'match déjà joué : la clôture viendra du rattrapage historique' : 'match reporté ou annulé chez ESPN');
      else if (p.ev.etat === 'in') manque("match commencé : ESPN n'a pas gardé de cote d'avant-match");
      else if (bookmakerLisible(p.ev)) manque('cotes ESPN incohérentes, écartées');
      else manque(p.ev.kickoff && Date.parse(p.ev.kickoff) - Date.now() > 48 * HEURE_MS ? 'pas encore coté par ESPN' : 'aucun bookmaker sur ce match chez ESPN');
    }

    // 4. Complément Bet365 (API « core ») pour les rencontres que DraftKings ne cote pas.
    aCompleter.sort((x, y) => String(x.p.ev.kickoff).localeCompare(String(y.p.ev.kickoff)));
    for (const [i, { fx, p }] of aCompleter.entries()) {
      const manque = (reason) => res.missing.push({ league: fx.league, date: fx.date, homeName: fx.homeName, awayName: fx.awayName, reason });
      if (i >= COMPLEMENT_MAX) {
        manque('Bet365 annoncé par ESPN, non relevé à cette passe (limite de requêtes)');
        continue;
      }
      const slug = p.ev.ligueId === ESPN_ODDS_SLUGS[fx.league].qualif?.id ? ESPN_ODDS_SLUGS[fx.league].qualif.slug : ESPN_ODDS_SLUGS[fx.league].slug;
      const r = await fetchEventOdds(slug, p.ev.id, { client });
      if (r.error) {
        res.errors.push(`cotes ${p.ev.id} : ${r.error}`);
        manque(`requête ESPN en échec (${r.error})`);
        continue;
      }
      const cotes = cotesAVenirCore(r.data?.items, baseCote(fx, p, r.url, r.releveAt));
      res.quotes.push(...cotes);
      if (!cotes.length) manque('pas encore coté par ESPN');
    }

    const proches = libres.filter((ev) => aTraiter.some((fx) => fx.league === ev.league && ev.date && ecartJours(ev.date, fx.date) <= 1));
    res.unresolved = nomsNonTraduits([...proches, ...[...paires.values()].filter((p) => p.demi).map((p) => p.ev)]);
    log(`[espn] à venir : ${aTraiter.length} rencontres, ${res.events.length} trouvées, ${res.quotes.length} cotes, ${client.requests} requêtes`);
  } catch (error) {
    res.errors.push(error?.message ?? String(error));
  }
  res.requests = client.requests;
  return res;
}

// ---------------------------------------------------------------------------
// Direct
// ---------------------------------------------------------------------------

/**
 * Cotes EN DIRECT des rencontres en cours (`fixtures` : coup d'envoi passé
 * depuis moins de 3 h). Une requête : le tableau toutes compétitions du
 * jour de New York (deux autour de minuit là-bas). Les cotes viennent du
 * bloc `current` (DraftKings) des rencontres à l'état « in » ; une cote
 * suspendue (« OFF ») ou un jeu incomplet n'est pas rendu.
 */
export async function collectLive({ fixtures = [], database = null, log = () => {} } = {}) {
  const res = { quotes: [], requests: 0, unresolved: [], errors: [], events: [], missing: [] };
  const client = nouveauClient();
  try {
    const db = database ?? openDb();
    const resoudre = resolveur(db);
    const aTraiter = preparerFixtures(fixtures, db, res);
    if (!aTraiter.length) return res;

    const maintenant = Date.now();
    const jours = new Set([jourEspn(maintenant - 3 * HEURE_MS), jourEspn(maintenant)]);
    for (const fx of aTraiter) if (fx.kickoffConnu) jours.add(jourEspn(fx.kickoffConnu));
    const ligues = new Set(aTraiter.map((fx) => fx.league));
    const vus = new Map();
    let panne = null;
    for (const jour of [...jours].sort()) {
      const r = await fetchAllScoreboard(jour, { client });
      if (r.error || !r.data) {
        if (r.error) {
          res.errors.push(`tableau du ${jour} : ${r.error}`);
          panne = r.error;
        }
        continue;
      }
      await retenirEvenements(r.data, r.url, r.releveAt, ligues, vus, resoudre);
    }
    const paires = apparierParLigue(aTraiter, vus);
    const apparies = new Set([...paires.values()].map((p) => p.ev.id));
    const libres = [...vus.values()].filter((ev) => !apparies.has(ev.id));
    for (const fx of aTraiter) {
      const p = paires.get(fx);
      const manque = (reason) => res.missing.push({ league: fx.league, date: fx.date, homeName: fx.homeName, awayName: fx.awayName, reason });
      if (!p) {
        manque(panne ? `requête ESPN en échec (${panne})` : raisonIntrouvable(fx, libres));
        continue;
      }
      if (p.inverse) {
        manque('ESPN inverse domicile et extérieur (terrain neutre ?)');
        continue;
      }
      res.events.push(evenementPourLive(fx, p));
      if (p.ev.etat === 'pre') {
        manque('match pas encore commencé chez ESPN');
        continue;
      }
      if (p.ev.etat === 'post') {
        manque(p.ev.termine ? 'match terminé chez ESPN' : 'match reporté ou annulé chez ESPN');
        continue;
      }
      const cotes = cotesDuTableau(p.ev, baseCote(fx, p, p.ev.url, p.ev.releveAt), { live: true });
      res.quotes.push(...cotes);
      if (!cotes.length) manque(bookmakerLisible(p.ev, { live: true }) ? 'marché fermé ou suspendu en direct chez ESPN' : 'pas de cote en direct chez ESPN pour ce match');
    }
    res.unresolved = nomsNonTraduits([...libres.filter((ev) => ev.etat === 'in'), ...[...paires.values()].filter((p) => p.demi).map((p) => p.ev)]);
    log(`[espn] direct : ${aTraiter.length} rencontres en cours, ${res.quotes.length} cotes, ${client.requests} requête(s)`);
  } catch (error) {
    res.errors.push(error?.message ?? String(error));
  }
  res.requests = client.requests;
  return res;
}

// ---------------------------------------------------------------------------
// Historique (rattrapage)
// ---------------------------------------------------------------------------

/**
 * Les tableaux de journées passées ne changent plus : on garde leurs
 * rencontres (forme compacte, sans cotes) le temps du processus, pour
 * qu'une passe suivante reprenne un jour à moitié traité sans le relire.
 */
const TABLEAUX_PASSES = new Map();
const TABLEAUX_MAX = 4000;
function memoriserTableau(cle, valeur) {
  if (TABLEAUX_PASSES.size >= TABLEAUX_MAX) TABLEAUX_PASSES.delete(TABLEAUX_PASSES.keys().next().value);
  TABLEAUX_PASSES.set(cle, valeur);
}

/**
 * Les jours ESPN (New York) où la compétition a joué, d'après le magasin,
 * depuis 2023 : le jour de l'heure de coup d'envoi (meta.kickoff) ; sans
 * heure, le jour UTC et la veille.
 */
function joursJoues(league, conf, database) {
  const lignes = database
    .prepare(`SELECT date, json_extract(meta, '$.kickoff') AS kickoff FROM matches
              WHERE league = ? AND date >= ? AND home_goals IS NOT NULL AND away_goals IS NOT NULL`)
    .all(league, DEPUIS);
  const jours = new Set();
  for (const l of lignes) {
    const j = l.kickoff ? jourEspn(l.kickoff) : null;
    if (j) jours.add(j);
    else {
      jours.add(l.date);
      jours.add(decaler(l.date, -1));
    }
  }
  return [...jours].filter((j) => j >= DEPUIS && (!conf.fin || j <= conf.fin)).sort();
}

/** Curseur : « AAAA-MM-JJ » (prochain jour à traiter) ou « AAAA-MM-JJ#id » (jour entamé, rencontres ≤ id faites). */
function lireCurseur(curseur) {
  const m = String(curseur ?? '').match(/^(\d{4}-\d{2}-\d{2})(?:#(\d+))?$/);
  return m ? { jour: m[1], apres: m[2] ?? null } : { jour: null, apres: null };
}
const idNum = (id) => Number(id) || 0;

/**
 * Rencontres TERMINÉES d'un jour ESPN pour une compétition : le tableau
 * (ou sa mémoire), en essayant le slug des tours préliminaires l'été.
 * Rend la liste (forme compacte, sans cotes) ; lève sur panne ou budget
 * épuisé (le jour sera repris).
 */
async function rencontresJouees(conf, jour, client) {
  for (const slug of slugsDuJour(conf, jour)) {
    const cle = `${slug}|${jour}`;
    let evenements = TABLEAUX_PASSES.get(cle);
    if (!evenements) {
      const url = urlTableau(slug, jour);
      const r = await getJson(url, client);
      evenements = evenementsDu(r.data, slug)
        .filter((ev) => ev.termine && ev.dom.score !== null && ev.ext.score !== null && ev.date)
        .map(({ cotes, ...reste }) => reste);
      // Un jour passé ne bouge plus ; aujourd'hui et hier peuvent encore changer.
      if (jour < jourEspn(Date.now() - 2 * JOUR_MS)) memoriserTableau(cle, evenements);
    }
    if (evenements.length) return evenements;
  }
  return [];
}

/**
 * Les cotes d'une rencontre JOUÉE, depuis la liste de tous ses bookmakers :
 * ouverture (open), clôture (close, ou `current` du format 2023 quand il
 * s'accorde avec les autres), avant-match de Bet365 en fractions (close).
 * Jamais `current` d'un fournisseur dont c'est la cote en match, jamais le
 * flux live, jamais homeTeamOdds.odds de Bet365 (cote de fin de match).
 */
function cotesHistoriques(items, base, stats) {
  const { groupes, ignores } = fournisseursParNom(items);
  for (const nom of ignores) stats.fournisseursIgnores.add(nom);
  const lire = ({ f, item }) => {
    if (f.bet365) return { f, open: null, close: blocBet365(item), douteux: false };
    const b = blocsCore(item);
    if (b.close) return { f, open: b.open, close: b.close, douteux: false };
    // Sans bloc `close` (format 2023) : `current` n'est qu'une candidate.
    if (b.current && !f.direct) return { f, open: b.open, close: b.current, douteux: true };
    return { f, open: b.open, close: null, douteux: false };
  };
  const valide = (j) => Boolean(j.close) && jeu1x2Valide(j.close.h, j.close.d, j.close.a);
  // Un seul fournisseur par nom : le mieux classé qui a une vraie clôture,
  // sinon une candidate 2023, sinon une ouverture.
  const choisis = groupes.map((g) => {
    const lus = g.map(lire);
    return lus.find((j) => valide(j) && !j.douteux) ?? lus.find(valide) ?? lus.find((j) => j.open) ?? lus[0];
  });
  const cotes = [];
  for (const j of choisis) {
    cotes.push(...cotesDuJeu(j.open, { kind: 'open', bookmaker: j.f.nom, base }));
    if (!j.close) continue;
    if (j.douteux) {
      const refs = choisis.filter((v) => v !== j && valide(v)).map((v) => v.close);
      if (!valide(j) || !currentAccepte(j.close, refs, j.open)) {
        stats.douteuxEcartes++;
        continue; // ni son 1x2 ni ses lignes : le même instant douteux
      }
    }
    cotes.push(...cotesDuJeu(j.close, { kind: 'close', bookmaker: j.f.nom, base }));
  }
  return cotes;
}

/**
 * Rattrapage historique d'une compétition, par tranches.
 *
 * Jours = jours ESPN où la compétition a joué selon le magasin (depuis
 * 2023), dans l'ordre. Pour une fenêtre de jours : tableaux (scores et
 * identifiants d'équipe) -> rattachement au magasin par VOTE (voteAttach :
 * jour ± 1 + score ; puis l'annuaire strict pour les noms que le vote n'a
 * pas tranchés, et un second vote) -> pour chaque rencontre rattachée, les
 * cotes de tous ses bookmakers (une requête). Le vote a besoin de voir
 * chaque nom au moins deux fois : la fenêtre couvre plusieurs journées.
 *
 * `budget` : nombre maximal de requêtes HTTP pour l'appel (respecté à la
 * requête près, reprises comprises). `state.cursor` : où reprendre
 * (« AAAA-MM-JJ » ou « AAAA-MM-JJ#idEspn »). Idempotent : l'ouverture est la
 * première valeur gardée, la clôture la dernière. Un jour terminé ne se
 * relit pas, même sans cote. `apply: false` (sondes) : le vote n'apprend
 * aucun alias.
 *
 * Rend { quotes, requests, cursor, done, bilan: { attached, unmatched,
 * unresolvedNames, sansCote, … }, errors }.
 */
export async function backfill({ league, database = null, budget = 40, state = null, log = () => {}, apply = true } = {}) {
  const client = nouveauClient(Math.max(0, Number(budget) || 0));
  const bilan = { attached: 0, unmatched: 0, unresolvedNames: [], sansCote: 0, scoreMismatch: 0, exemplesSansRencontre: [], joursTraites: 0, joursRestants: 0, rencontresVues: 0, douteuxEcartes: 0, fournisseursIgnores: [] };
  const sortie = { quotes: [], requests: 0, cursor: state?.cursor ?? null, done: false, bilan, errors: [] };
  const conf = ESPN_ODDS_SLUGS[league];
  if (!conf) return { ...sortie, cursor: null, done: true, bilan: { ...bilan, note: 'compétition non couverte par ESPN' } };
  const stats = { douteuxEcartes: 0, fournisseursIgnores: new Set() };
  const nonResolus = new Set();
  try {
    const db = database ?? openDb();
    const resoudre = resolveur(db);
    const tous = joursJoues(league, conf, db);
    const reprise = lireCurseur(state?.cursor);
    let jours = reprise.jour ? tous.filter((j) => j >= reprise.jour) : tous;
    // Jour entamé à la passe précédente : ses rencontres d'id <= `apres` sont faites.
    let apres = reprise.apres;
    const jourEntame = reprise.jour;
    if (!jours.length) {
      bilan.joursRestants = 0;
      return { ...sortie, cursor: tous.length ? decaler(tous.at(-1), 1) : null, done: true };
    }
    // Fenêtre : assez de journées pour que le vote voie chaque club deux
    // fois, sans manger le budget des cotes (30 % au plus pour les tableaux).
    const largeur = Math.min(14, Math.max(1, Math.floor(client.budget * 0.3)));
    let arret = null; // 'budget' ou 'panne' : on s'arrête, le curseur dit où reprendre
    while (jours.length && !arret) {
      const fenetre = [];
      for (const jour of jours.slice(0, largeur)) {
        try {
          fenetre.push({ jour, evenements: await rencontresJouees(conf, jour, client) });
        } catch (error) {
          if (!(error instanceof BudgetEpuise)) sortie.errors.push(`tableau ${jour} : ${error.message}`);
          arret = error instanceof BudgetEpuise ? 'budget' : 'panne';
          break;
        }
      }
      if (!fenetre.length) break;

      // Vote sur toute la fenêtre, puis annuaire strict pour les noms que le
      // vote n'a pas tranchés (promus, coupes), et un second vote sur le reste.
      const lignes = fenetre.flatMap(({ jour, evenements }) =>
        evenements.map((ev) => ({ date: ev.date, home: ev.dom.nom, away: ev.ext.nom, hg: ev.dom.score, ag: ev.ext.score, homeKeys: ev.dom.id ? [`id:${ev.dom.id}`] : [], awayKeys: ev.ext.id ? [`id:${ev.ext.id}`] : [], ev, jour }))
      );
      const rattaches = new Map(); // id ESPN -> { matchKey, homeId, awayId }
      for (const a of voteAttach({ source: SOURCE, league, rows: lignes, apply, database: db }).attachments) rattaches.set(a.row.ev.id, a);
      const restes = lignes.filter((l) => !rattaches.has(l.ev.id));
      if (restes.length) {
        for (const l of restes) {
          const debut = Date.now();
          resoudre(league, l.ev);
          if (Date.now() - debut > 30) await new Promise((r) => setImmediate(r)); // rendre la main au serveur
        }
        const prises = new Set([...rattaches.values()].map((a) => a.matchKey));
        for (const a of voteAttach({ source: SOURCE, league, rows: restes, apply, database: db }).attachments) {
          if (!prises.has(a.matchKey)) rattaches.set(a.row.ev.id, a);
        }
      }

      // Cotes, jour par jour, rencontre par rencontre (ordre des id ESPN).
      for (const { jour, evenements } of fenetre) {
        const reprendApres = apres && jour === jourEntame ? apres : null;
        const aFaire = evenements
          .filter((ev) => rattaches.has(ev.id))
          .sort((x, y) => idNum(x.id) - idNum(y.id))
          .filter((ev) => !(reprendApres && idNum(ev.id) <= idNum(reprendApres)));
        let dernierFait = reprendApres;
        for (const ev of aFaire) {
          const a = rattaches.get(ev.id);
          let r;
          try {
            r = await cotesRencontre(urlCotes(ev.slug, ev.id), client);
          } catch (error) {
            if (!(error instanceof BudgetEpuise)) sortie.errors.push(`cotes ${ev.id} : ${error.message}`);
            arret = error instanceof BudgetEpuise ? 'budget' : 'panne';
            break;
          }
          const base = { source: SOURCE, sourceEvent: ev.id, date: ev.date, kickoff: ev.kickoff, league, homeId: a.homeId, awayId: a.awayId, homeName: ev.dom.nom, awayName: ev.ext.nom, matchKey: a.matchKey, provenance: urlCotes(ev.slug, ev.id), releveAt: r.releveAt };
          const cotes = r.data ? cotesHistoriques(r.data.items, base, stats) : [];
          sortie.quotes.push(...cotes);
          bilan.attached++;
          if (!cotes.length) bilan.sansCote++;
          dernierFait = ev.id;
        }
        if (arret) {
          sortie.cursor = dernierFait ? `${jour}#${dernierFait}` : jour;
          break;
        }
        // Jour terminé : ses rencontres non rattachées sont comptées une fois.
        bilan.joursTraites++;
        bilan.rencontresVues += evenements.length;
        const nonRattachees = lignes.filter((l) => l.jour === jour && !rattaches.has(l.ev.id));
        bilan.unmatched += nonRattachees.length;
        for (const l of nonRattachees) {
          const ids = resoudre(league, l.ev);
          if (!ids.homeId) nonResolus.add(l.home);
          if (!ids.awayId) nonResolus.add(l.away);
          // Deux clubs reconnus mais aucune rencontre du magasin à ce score
          // à ± 3 jours (score différent, match absent du magasin).
          if (ids.homeId && ids.awayId) {
            bilan.scoreMismatch++;
            if (bilan.exemplesSansRencontre.length < 5) bilan.exemplesSansRencontre.push(`${l.date} ${l.home} ${l.hg}-${l.ag} ${l.away} (ESPN ${l.ev.id})`);
          }
        }
        jours = jours.filter((j) => j !== jour);
        if (jour === jourEntame) apres = null;
        sortie.cursor = jours[0] ?? decaler(jour, 1);
      }
    }
    sortie.done = !jours.length;
    bilan.joursRestants = jours.length;
    log(`[espn] rattrapage ${league} : ${bilan.joursTraites} jours, ${bilan.attached} rencontres, ${sortie.quotes.length} cotes, ${client.requests} requêtes${sortie.done ? ' — terminé' : ''}`);
  } catch (error) {
    sortie.errors.push(error?.message ?? String(error));
  }
  bilan.unresolvedNames = [...nonResolus].sort();
  bilan.douteuxEcartes = stats.douteuxEcartes;
  bilan.fournisseursIgnores = [...stats.fournisseursIgnores].sort();
  sortie.requests = client.requests;
  return sortie;
}

export const __testing = { americaineVersDecimale, fractionVersDecimale, ligneDe, jeu1x2Valide, jeu2Valide, blocsCore, blocsTableau, blocBet365, cotesHistoriques, cotesDuTableau, cotesAVenirCore, lireEvenement, currentAccepte, jourEspn, joursJoues, apparier, slugsDuJour, coquilleBet365, resolveur, idEspnAilleurs };
