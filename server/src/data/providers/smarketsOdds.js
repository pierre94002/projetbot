/**
 * smarketsOdds.js — les prix de la bourse Smarkets : carnet achat/vente et argent échangé.
 * -----------------------------------------------------------------------
 * Smarkets est une bourse de paris britannique (Betfair en plus petit). Son
 * API publique v3 se lit SANS clé ni compte depuis la France ; le compte,
 * lui, est refusé aux résidents français : CôteMaster lit, ne parie jamais.
 * Spécification officielle (lue le 04/10/2026, c'est elle qui fait foi pour
 * les unités) : https://api.smarkets.com/v0/control/openapi/?tags=trading_api
 *
 * Ce qu'une bourse apporte que les bookmakers n'ont pas : un prix SANS
 * MARGE — le milieu entre la meilleure offre d'achat et la meilleure offre
 * de vente — et l'argent réellement échangé (le volume, en livres). Ce
 * qu'elle n'a pas : d'historique. Un marché réglé n'a plus de carnet, son
 * dernier prix échangé date du match lui-même (76 des 78 issues de 1x2 de
 * 27 rencontres terminées du 1er au 3/10 avaient leur dernier échange après
 * le coup d'envoi), et une rencontre terminée ne reste listée que deux à
 * trois jours (avec son score final, /events/{ids}/states/) : l'ouverture
 * et la clôture Smarkets d'un match sont celles que CôteMaster a relevées
 * lui-même.
 *
 * Chaîne de lecture, toujours en lots (identifiants séparés par des virgules) :
 *   1. /events/?parent_id=…            rencontres des compétitions suivies,
 *      50 par page (plafond d'un lecteur sans compte, constaté) ;
 *   2. /events/{ids}/competitors/      les deux clubs, leur sens (home/away)
 *      et un identifiant Smarkets STABLE d'un match à l'autre (Aldosivi =
 *      198520 le 4 comme le 9 octobre) : il est appris avec le nom (« id:… ») ;
 *   3. /events/{ids}/markets/?popular=true  les quatre marchés « populaires »
 *      d'un match : résultat (WINNER_3_WAY), les deux marquent (BTTS),
 *      plus/moins 2,5 (OVER_UNDER 2.5) et remboursé si nul (WINNER_DNB, non
 *      gardé : il se déduit du 1x2). Une requête pour 50 matchs, au lieu des
 *      ~95 marchés par match que rend la liste complète ;
 *   4. /markets/{ids}/contracts/       quelle issue porte chaque contrat
 *      (HOME, DRAW, AWAY, OVER, UNDER, YES, NO) : fixe, gardé en mémoire ;
 *   5. /markets/{ids}/quotes/ et /volumes/  le carnet et l'argent échangé.
 *
 * UNITÉS (spécification officielle, recoupées le 04/10 sur Barcelona -
 * Getafe et le 03/10 sur Atlético Mineiro - Bragantino) :
 *   - price    : points de base de pour cent. 4505 = 45,05 % ; cote décimale
 *                = 10000 / price (4505 -> 2,220) ;
 *   - quantity : centièmes de penny (1/10 000 de livre), et c'est le POT
 *                entier (mise de l'acheteur + engagement du vendeur) ; mise
 *                de l'acheteur = quantity × price / 100 000 000 (5 461 348 à
 *                4505 -> 246,03 £ de mise pour un pot de 546,13 £) ;
 *   - volume   : livres ENTIÈRES échangées sur le MARCHÉ (mise côté achat +
 *                engagement côté vente), le chiffre affiché par le site ;
 *   - last_executed_prices : pour cent en texte (« 27.78 ») — non utilisé.
 *
 * Ce que rend le module pour chaque rencontre du calendrier rattachée : 1x2,
 * plus/moins 2,5 et « les deux marquent ». `prob` = milieu du carnet, en
 * probabilité BRUTE (les trois issues d'un 1x2 ne font pas exactement
 * 100 % : on normalise à l'affichage, jamais ici) ; `price` = 1/prob ;
 * `volume` = livres échangées sur TOUT le marché, répétées sur chaque issue
 * (Smarkets ne ventile pas par issue : ne jamais additionner les issues) ;
 * `openInterest` = null (Smarkets ne le publie pas).
 *
 * Un carnet d'un seul côté, croisé ou trop écarté ne donne PAS de prix : un
 * milieu entre 3 % et 70 % ne dit rien de la probabilité, et le moteur le
 * prendrait pour une mesure. Deux façons d'avoir un prix :
 *   - l'issue seule : écart achat/vente d'au plus 10 points (± 5 autour du
 *     milieu) et d'au plus la moitié du milieu ;
 *   - le marché entier : toutes ses issues ont achat et vente, à 15 points
 *     d'écart au plus, et leurs milieux font ensemble 98 à 103 %. C'est le
 *     carnet d'un teneur de marché, centré sur un prix juste.
 * Mesuré le 04/10 sur les 1x2 à 1-7 jours : écart médian 1,1 point quand le
 * marché a déjà échangé 1 000 £ ou plus, 2,1 points entre 1 et 999 £, 10,3
 * points sans aucun échange ; et sur 142 marchés 1x2 à 10-15 points
 * d'écart, la somme des trois milieux va de 1,000 à 1,009 (5e-95e centile),
 * plus régulière que sur les marchés serrés (0,996-1,014) : ces milieux sont
 * de vrais prix, pas du bruit. Au-delà de 15 points, la somme s'égare
 * (jusqu'à 1,087) : rejet. Le volume (souvent 0 £) dit au lecteur qu'aucun
 * échange ne l'a encore confirmé.
 *
 * Rattachement : JAMAIS par ressemblance de nom. Chaque club Smarkets est
 * traduit en identifiant FotMob — alias déjà appris (sourceMatching), sinon
 * annuaire strict du magasin — puis une rencontre Smarkets n'est rattachée à
 * une rencontre du calendrier que si les DEUX identifiants coïncident, dans
 * le même sens, à un jour près. Smarkets publie trois écritures par club :
 * le nom affiché, le nom court et le slug (« La Equidad », « Internacional
 * de Bogotá », « internacional-de-bogota ») ; toutes passent par l'annuaire.
 *
 * Pourquoi pas simplement resolveFixture : la première sonde réelle (04/10)
 * lui a fait apprendre deux alias FAUX, qu'il aurait gardés en base —
 * « Dundee Utd » -> Dundee FC (règle d'inclusion des mots : « dundee » est
 * dans « dundee utd ») et « Everton », nom court d'Everton de Viña del Mar,
 * -> l'Everton anglais (un nom connu d'un seul club, quelle que soit sa
 * compétition). Un alias faux se relit ensuite AVANT l'annuaire, à chaque
 * passe : l'erreur deviendrait permanente. D'où, ici, avec les mêmes
 * briques (aliasConnu, annuaire, apprendreAlias) :
 *   1. un nom EXACT de l'annuaire (findTeams) l'emporte sur les règles
 *      approchées de clubDuMagasin (mêmes mots, inclusion) ;
 *   2. l'identifiant doit être celui d'un club que le calendrier fait jouer
 *      dans CETTE compétition, sur la période relevée ;
 *   3. les écritures qui répondent doivent désigner le même club ;
 *   4. l'alias (nom affiché et « id:<identifiant Smarkets> », stable d'un
 *      match à l'autre) n'est appris qu'une fois ces trois contrôles passés.
 *
 * Sobriété : sans compte, 60 requêtes par minute sur la liste des
 * rencontres et 20 sur les prix (/quotes/), lus dans les en-têtes
 * x-ratelimit le 04/10 (la spécification annonce 600 et 50 pour un compte
 * API). Une passe de 7 jours ne lit les prix qu'en cinq lots de 200
 * marchés environ. Une requête au plus toutes les 1,25 s (48 par minute), file
 * commune à tous les appels du processus, pause jusqu'à la remise à zéro
 * quand un quota est presque épuisé, 3 tentatives avec attente croissante,
 * délai de 20 s ; une source muette rend quotes: [] et errors: [...],
 * jamais d'exception. Les prix lus sans session sont DIFFÉRÉS par Smarkets
 * (délai non publié) : sans importance pour un relevé toutes les 10
 * minutes, à savoir pour le direct. En direct (vu le 04/10 sur deux matchs
 * en cours) : rencontre et marchés à l'état « live », carnet parfois vide
 * en plein jeu (Farense - Chaves à la 47e) — le manque le dit alors.
 *
 * Le module N'ÉCRIT JAMAIS dans la base : il rend des cotes normalisées que
 * l'orchestrateur (freeOdds.js) range. Il ne fait que lire l'annuaire, et
 * sourceMatching y apprend des alias — c'est voulu.
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { clubDuMagasin } from '../db/oddsProfileRead.js';
import { findTeams } from '../db/identityRegistry.js';
import { aliasConnu, apprendreAlias } from './sourceMatching.js';

export const SOURCE = 'smarkets';
const BOOKMAKER = 'Smarkets';
export const BOOKMAKERS = [BOOKMAKER];

const API = 'https://api.smarkets.com/v3';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/** Une requête toutes les 1,25 s au plus : 48 par minute, sous les 60 de la liste des rencontres (les prix, 20 par minute, ne prennent que quelques lots par passe). */
const ESPACEMENT_MS = 1250;
const DELAI_MS = 20_000;
const TENTATIVES = 3;
/**
 * Plafond de requêtes d'un appel : un relevé de 7 jours en a pris 35 le 04/10
 * (23 une fois clubs et contrats en mémoire), un passage d'avant-match ~5.
 */
const MAX_REQUETES_AVENIR = 90;
const MAX_REQUETES_DIRECT = 25;
/** Pages de 50 rencontres : 7 jours de toutes les compétitions suivies en ont fait 7 le 04/10. */
const MAX_PAGES = 30;
const PAGE = 50;
/** Horizon du relevé d'avant-match : Smarkets publie une à deux semaines avant, et le quota est court. */
const HORIZON_JOURS = 7;
/** Tailles de lot permises par la spécification (maxItems). */
const LOT_MARCHES_PAR_RENCONTRE = 50;
const LOT_CONCURRENTS = 300;
const LOT_CONTRATS = 100;
const LOT_COTES = 200;
const LOT_VOLUMES = 300;
/** Carnet exploitable : écart achat/vente d'au plus 10 points, et d'au plus la moitié du milieu. */
const ECART_MAX_PB = 1000;
const ECART_RELATIF_MAX = 0.5;
/**
 * …ou carnet de teneur de marché COHÉRENT : toutes les issues du marché ont
 * un achat et une vente, à 15 points d'écart au plus, et leurs milieux
 * additionnés font 98 à 103 % (voir l'en-tête).
 */
const ECART_TENEUR_PB = 1500;
const SOMME_MIN = 0.98;
const SOMME_MAX = 1.03;

const HEURE_MS = 3_600_000;
const JOUR_MS = 24 * HEURE_MS;

/**
 * Compétition du magasin -> compétition(s) Smarkets [slug, identifiant du
 * nœud]. Relevé le 04/10/2026 en parcourant l'arbre du football Smarkets
 * (/events/?parent_id=121005 : 592 compétitions) ; le slug est revérifié sur
 * chaque rencontre rendue (full_slug « /sport/football/<slug>/… ») pour
 * qu'un nœud réattribué ne fasse jamais entrer les matchs d'une autre
 * compétition. Deux nœuds quand Smarkets en a ouvert un second (Canada en
 * 2023, Croatie en 2022 : l'ancien est gardé, il ne coûte rien) ou quand le
 * magasin range les tours préliminaires avec l'épreuve (coupes d'Europe).
 *
 * Compétitions du magasin ABSENTES, donc « non couvertes par Smarkets » :
 *   - Premier League - Russia : nœud sans aucune rencontre, comme ceux de la
 *     1. Division et de la coupe russes, alors que le calendrier compte 16
 *     matchs du 9 au 19/10 : Smarkets ne cote plus le football russe ;
 *   - Super League - China, Coupe de Chine : aucun match chinois publié
 *     (Super League, League One, League Two, coupe), 16 au calendrier ;
 *   - Primera División - Bolivia, Primera División - Venezuela, Virsliga -
 *     Latvia : nœud présent mais vide, alors que le calendrier compte 8, 7
 *     et 5 matchs du 9 au 12/10 et que les championnats voisins (Pérou,
 *     Équateur, Chili, Paraguay) sont publiés en entier à la même échéance.
 * Constat du 04/10/2026 ; `node scripts/probe-smarkets-odds.mjs --noeuds`
 * le refait.
 *
 * Coupes : le nœud existe et Smarkets publie les matchs quand un tour
 * approche (EFL Cup : 8 matchs du 27 au 29/10 déjà en ligne le 04/10) ; les
 * premiers tours entre clubs amateurs (Coupe de France, FA Cup) ne le sont
 * en général pas : chaque match manquant le dira.
 */
const COMPETITIONS = {
  EPL: [['england-premier-league', '25508311']],
  Championship: [['england-championship', '28936072']],
  'League 1': [['england-league-1', '27153991']],
  'League 2': [['england-league-2', '27154002']],
  'EFL Cup': [['england-league-cup', '33055504']],
  'FA Cup - England': [['england-fa-cup', '26055261']],
  'Premiership - Scotland': [['scotland-premiership', '28284370']],
  'League of Ireland': [['ireland-premier-division', '41583286']],
  'La Liga - Spain': [['spain-la-liga', '41842975']],
  'La Liga 2 - Spain': [['spain-la-liga-2', '41803384']],
  'Copa del Rey - Spain': [['spain-copa-del-rey', '26628159']],
  'Serie A - Italy': [['italy-serie-a', '30371165']],
  'Serie B - Italy': [['italy-serie-b', '30089013']],
  'Coppa Italia - Italy': [['italy-coppa-italia', '31174521']],
  'Bundesliga - Germany': [['germany-bundesliga', '30088540']],
  'Bundesliga 2 - Germany': [['germany-2-bundesliga', '26109924']],
  'DFB Pokal - Germany': [['germany-dfb-pokal', '41536436']],
  'Ligue 1 - France': [['france-ligue-1', '30088267']],
  'Ligue 2 - France': [['france-ligue-2', '30088286']],
  'Coupe de France': [['france-cup', '28949994']],
  'Dutch Eredivisie': [['netherlands-eredivisie', '28959543']],
  'KNVB Cup - Netherlands': [['netherlands-knvb-beker', '34020754']],
  'Belgium First Div': [['belgium-first-division-a', '28921235']],
  'Coupe de Belgique': [['belgium-cup', '31430486']],
  'Primeira Liga - Portugal': [['portugal-primeira-liga', '29398187']],
  'Taça de Portugal': [['portugal-cup', '28961607']],
  'Taça da Liga - Portugal': [['portugal-league-cup', '31434124']],
  'Turkey Super League': [['turkey-super-lig', '29558541']],
  'Türkiye Kupası': [['turkey-cup', '31134073']],
  'Super League - Greece': [['greece-super-league', '25509325']],
  'Coupe de Grèce': [['greece-cup', '31187088']],
  'Austrian Football Bundesliga': [['austria-bundesliga', '28932244']],
  'Swiss Superleague': [['switzerland-super-league', '28956076']],
  'Denmark Superliga': [['denmark-superliga', '29807278']],
  'Allsvenskan - Sweden': [['sweden-allsvenskan', '41703142']],
  'Eliteserien - Norway': [['norway-premier-league', '28960531']],
  'Veikkausliiga - Finland': [['finland-veikkausliiga', '41734336']],
  'Besta deildin - Iceland': [['iceland-premier-league', '41707167']],
  'Ekstraklasa - Poland': [['poland-ekstraklasa', '25506385']],
  'First League - Czechia': [['czech-republic-premier-league', '25506383']],
  'Nike Liga - Slovakia': [['slovakia-super-liga', '28959052']],
  'HNL - Croatia': [['croatia-hnl', '42843887'], ['croatia-first-division', '30086966']],
  'Super Liga - Serbia': [['serbia-superliga', '41615142']],
  'Superliga - Romania': [['romania-liga-1', '30091534']],
  "Ligat ha'Al - Israel": [['israel-ligat-al', '30406824']],
  'UEFA Champions League': [['uefa-champions-league', '25363462'], ['uefa-champions-league-qualification', '41813154']],
  'UEFA Europa League': [['uefa-europa-league', '25502999'], ['uefa-europa-league-qualification', '41813166']],
  'UEFA Europa Conference League': [['uefa-europa-conference-league', '42371743'], ['uefa-europa-conference-league-qualification', '42279468']],
  MLS: [['us-major-league-soccer', '41602473']],
  'US Open Cup': [['us-lamar-hunt-u-s-open-cup', '42782397']],
  'Leagues Cup': [['the-leagues-cup', '43345564']],
  'Canadian Premier League': [['canada-premier-league', '43477330'], ['canadian-premier-league', '42276308']],
  'Canadian Championship': [['canada-championship', '42331064']],
  'Liga MX': [['mexico-liga-mx', '28959175']],
  'Brazil Série A': [['brazil-serie-a', '28934185']],
  'Copa do Brasil': [['brazil-cup', '41548465']],
  'Primera División - Argentina': [['argentina-liga-profesional-de-futbol', '42289488']],
  'Copa Argentina': [['argentina-cup', '42981729']],
  'Primera A - Colombia': [['colombia-categoria-primera-a', '28935182']],
  'Liga 1 - Peru': [['peru-liga-1', '29277860']],
  'Primera División - Chile': [['chile-primera-division', '28934939']],
  'Copa Chile': [['chile-cup', '40598019']],
  'División Profesional - Paraguay': [['paraguay-primera-division', '41997112']],
  'Serie A - Ecuador': [['ecuador-serie-a', '43246718']],
  'Copa Libertadores': [['copa-libertadores', '28840588']],
  'Copa Sudamericana': [['copa-sudamericana', '41522586']]
};

/** Compétition du magasin -> slug(s) de compétition Smarkets. */
export const LIGUES = new Map(Object.entries(COMPETITIONS).map(([league, noeuds]) => [league, noeuds.map(([slug]) => slug)]));
/** slug Smarkets -> { id du nœud, compétition du magasin }. */
const NOEUDS = new Map();
for (const [league, noeuds] of Object.entries(COMPETITIONS)) for (const [slug, id] of noeuds) NOEUDS.set(slug, { id, league });

/** Aucun historique : une seule portée de rattrapage, finie d'emblée (cf. freeOdds.backfillOdds). */
export const BACKFILL_GLOBAL = true;

/** Ce que Smarkets sait rendre, pour dire à Pierre ce qui manque et pourquoi. */
export const COUVERTURE = {
  source: SOURCE,
  nom: 'Smarkets',
  marches: ['1x2', 'ou', 'btts'],
  avantMatch: true,
  live: true,
  historique: 'aucun',
  volumes: true,
  bookmakers: BOOKMAKERS,
  limites: [
    "Bourse britannique : un prix d'échange (milieu du carnet achat/vente, probabilité brute), pas la cote d'un bookmaker.",
    'Aucun historique : seuls existent les relevés faits par CôteMaster, à partir du premier.',
    'Volume = livres échangées sur tout le marché, pas par issue ; souvent nul plusieurs jours avant le match hors grands championnats (Barcelone - Getafe : 56 784 £ à J-6).',
    'Plus/moins : seulement la ligne 2,5 buts.',
    'Prix différés pour un lecteur sans compte (délai non publié par Smarkets).',
    'Relevé des 7 prochains jours seulement : quota court sans compte (20 lectures de prix par minute).',
    'Matchs publiés une à deux semaines avant, partiellement pour les petits championnats (Islande, Croatie, Suède).',
    'Aucun match russe, chinois, bolivien, vénézuélien ni letton publié (constat du 04/10/2026).',
    'Pas de prix quand le carnet est vide, d’un seul côté ou trop écarté.'
  ]
};

const MARCHES_ATTENDUS = {
  '1x2': new Set(['HOME', 'DRAW', 'AWAY']),
  ou: new Set(['OVER', 'UNDER']),
  btts: new Set(['YES', 'NO'])
};
const SELECTIONS = { HOME: 'home', DRAW: 'draw', AWAY: 'away', OVER: 'over', UNDER: 'under', YES: 'yes', NO: 'no' };
/** Ordre de rendu : le 1x2 d'abord, pour que la provenance de la rencontre soit celle de son 1x2. */
const ORDRE_MARCHES = ['1x2', 'ou', 'btts'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jourUtc = (t) => new Date(t).toISOString().slice(0, 10);
const plusJours = (jour, n) => jourUtc(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS);
const ecartJours = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / JOUR_MS;
const paquets = (liste, taille) => {
  const sortie = [];
  for (let i = 0; i < liste.length; i += taille) sortie.push(liste.slice(i, i + taille));
  return sortie;
};
const isoOuNull = (x) => {
  const t = Date.parse(x ?? '');
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
/** « real-sporting-de-gijon » -> « real sporting de gijon » : une écriture de plus pour l'annuaire. */
const motsDuSlug = (slug) => String(slug ?? '').replace(/-/g, ' ').trim();

// ---------------------------------------------------------------------------
// Requêtes : une file commune, espacée, avec reprise.
// ---------------------------------------------------------------------------

class PlafondAtteint extends Error {}
class ErreurDefinitive extends Error {}

let prochainCreneau = 0;
let file = Promise.resolve();
/**
 * Attend son tour : toutes les requêtes du processus passent par la même
 * file, à 1,25 s d'écart au moins — l'actualisation complète et la boucle
 * oddsWatch peuvent appeler le module en même temps, le quota est par adresse.
 */
function creneau() {
  const tour = file.then(async () => {
    const attente = prochainCreneau - Date.now();
    if (attente > 0) await sleep(attente);
    prochainCreneau = Date.now() + ESPACEMENT_MS;
  });
  file = tour.catch(() => {});
  return tour;
}

/** Le quota lu dans les en-têtes : presque épuisé, on attend sa remise à zéro plutôt que d'essuyer un 429. */
function lireQuota(entetes) {
  const reste = Number(entetes.get('x-ratelimit-remaining'));
  const remise = Number(entetes.get('x-ratelimit-reset'));
  if (Number.isFinite(reste) && reste <= 2 && Number.isFinite(remise) && remise > 0) {
    prochainCreneau = Math.max(prochainCreneau, Date.now() + (remise + 1) * 1000);
  }
}

/**
 * GET d'un JSON Smarkets. Reprend sur erreur réseau, délai dépassé, 429 et
 * 5xx (3 tentatives, attente croissante) ; un 4xx est définitif (paramètre
 * refusé, identifiant inconnu). Compte chaque tentative dans `ctx.requests`.
 */
async function lireJson(url, ctx) {
  let derniere = null;
  for (let essai = 0; essai < TENTATIVES; essai++) {
    if (ctx.requests >= ctx.max) throw new PlafondAtteint(`plafond de ${ctx.max} requêtes atteint`);
    if (essai) await sleep(2000 * essai);
    await creneau();
    ctx.requests++;
    const controleur = new AbortController();
    const minuterie = setTimeout(() => controleur.abort(), DELAI_MS);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: controleur.signal });
      lireQuota(r.headers);
      const texte = await r.text();
      if (r.status === 429) {
        const remise = Number(r.headers.get('x-ratelimit-reset'));
        prochainCreneau = Math.max(prochainCreneau, Date.now() + (Number.isFinite(remise) && remise > 0 ? remise + 1 : 30) * 1000);
        derniere = new Error('HTTP 429 : quota Smarkets dépassé');
        continue;
      }
      if (r.status >= 500) {
        derniere = new Error(`HTTP ${r.status}`);
        continue;
      }
      if (!r.ok) throw new ErreurDefinitive(`HTTP ${r.status} ${texte.slice(0, 160)}`);
      try {
        return JSON.parse(texte);
      } catch {
        // Une page HTML (protection Cloudflare) au lieu du JSON : on retente.
        derniere = new Error('réponse non JSON (page de protection ?)');
      }
    } catch (error) {
      if (error instanceof ErreurDefinitive) throw error;
      derniere = error?.name === 'AbortError' ? new Error(`pas de réponse en ${DELAI_MS / 1000} s`) : error;
    } finally {
      clearTimeout(minuterie);
    }
  }
  throw derniere ?? new Error('échec inconnu');
}

// ---------------------------------------------------------------------------
// Lectures Smarkets.
// ---------------------------------------------------------------------------

/**
 * Les rencontres des nœuds demandés entre deux instants, toutes pages
 * suivies (lien `next_page`). `complet` est faux si le plafond de pages ou
 * de requêtes a coupé la liste.
 */
async function listerRencontres({ noeuds, etats, debut, fin }, ctx) {
  const params = new URLSearchParams();
  for (const id of noeuds) params.append('parent_id', id);
  params.append('type', 'football_match');
  for (const e of etats) params.append('state', e);
  params.set('start_datetime_min', debut);
  params.set('start_datetime_max', fin);
  params.set('sort', 'start_datetime,id');
  params.set('limit', String(PAGE));
  let url = `${API}/events/?${params}`;
  const vues = new Map();
  let pages = 0;
  while (url && pages < MAX_PAGES) {
    const j = await lireJson(url, ctx);
    pages++;
    for (const e of Array.isArray(j?.events) ? j.events : []) if (e?.id) vues.set(String(e.id), e);
    const suivante = j?.pagination?.next_page;
    url = typeof suivante === 'string' && suivante ? `${API}/events/${suivante}` : null;
  }
  return { rencontres: [...vues.values()], complet: !url, pages };
}

/** Clubs d'une rencontre (fixes) : gardés en mémoire, purgés après trois jours sans usage. */
const concurrentsEnCache = new Map();
/** Issues d'un marché (fixes) : idem. */
const contratsEnCache = new Map();
function purger(cache) {
  if (cache.size < 5000) return;
  const limite = Date.now() - 3 * JOUR_MS;
  for (const [cle, v] of cache) if (v.vu < limite) cache.delete(cle);
}

async function lireConcurrents(ids, ctx) {
  const manquants = ids.filter((id) => !concurrentsEnCache.has(id));
  for (const lot of paquets(manquants, LOT_CONCURRENTS)) {
    const j = await lireJson(`${API}/events/${lot.join(',')}/competitors/`, ctx);
    const parRencontre = new Map();
    for (const c of Array.isArray(j?.competitors) ? j.competitors : []) {
      if (!c?.event_id || (c.type !== 'home' && c.type !== 'away')) continue;
      const r = parRencontre.get(String(c.event_id)) ?? {};
      r[c.type] = { id: c.id != null ? String(c.id) : null, name: c.name ?? null, shortName: c.short_name ?? null, slug: c.slug ?? null };
      parRencontre.set(String(c.event_id), r);
    }
    // Une rencontre sans ses deux clubs n'est pas mise en cache : la prochaine passe redemandera.
    for (const [id, r] of parRencontre) if (r.home?.name && r.away?.name) concurrentsEnCache.set(id, { ...r, vu: Date.now() });
  }
  purger(concurrentsEnCache);
  const sortie = new Map();
  for (const id of ids) {
    const r = concurrentsEnCache.get(id);
    if (r) {
      r.vu = Date.now();
      sortie.set(id, r);
    }
  }
  return sortie;
}

/** Le marché voulu (1x2, plus/moins 2,5, les deux marquent) ou null. */
function marcheVoulu(m) {
  const type = m?.market_type?.name;
  if (type === 'WINNER_3_WAY') return { market: '1x2', line: 0 };
  if (type === 'BTTS') return { market: 'btts', line: 0 };
  if (type === 'OVER_UNDER' && Number(m.market_type?.param) === 2.5) return { market: 'ou', line: 2.5 };
  return null;
}

/** Les marchés voulus de chaque rencontre : rencontre -> [{ id, market, line, state }]. */
async function lireMarches(ids, ctx) {
  const sortie = new Map();
  for (const lot of paquets(ids, LOT_MARCHES_PAR_RENCONTRE)) {
    const j = await lireJson(`${API}/events/${lot.join(',')}/markets/?popular=true`, ctx);
    for (const m of Array.isArray(j?.markets) ? j.markets : []) {
      const voulu = marcheVoulu(m);
      if (!voulu || !m.id || !m.event_id) continue;
      const liste = sortie.get(String(m.event_id)) ?? [];
      // Un seul marché par type et par rencontre : le premier (ordre d'affichage Smarkets).
      if (!liste.some((x) => x.market === voulu.market)) liste.push({ id: String(m.id), ...voulu, state: m.state ?? null });
      sortie.set(String(m.event_id), liste);
    }
  }
  return sortie;
}

async function lireContrats(marketIds, ctx) {
  const manquants = marketIds.filter((id) => !contratsEnCache.has(id));
  for (const lot of paquets(manquants, LOT_CONTRATS)) {
    const j = await lireJson(`${API}/markets/${lot.join(',')}/contracts/`, ctx);
    const parMarche = new Map();
    for (const c of Array.isArray(j?.contracts) ? j.contracts : []) {
      if (!c?.id || !c.market_id || c.hidden) continue;
      const liste = parMarche.get(String(c.market_id)) ?? [];
      liste.push({ id: String(c.id), type: c.contract_type?.name ?? null, competitorId: c.competitor_id != null ? String(c.competitor_id) : null });
      parMarche.set(String(c.market_id), liste);
    }
    for (const [id, contrats] of parMarche) contratsEnCache.set(id, { contrats, vu: Date.now() });
  }
  purger(contratsEnCache);
}

async function lireCarnets(marketIds, ctx) {
  const carnets = new Map();
  let releveAt = null;
  for (const lot of paquets(marketIds, LOT_COTES)) {
    const j = await lireJson(`${API}/markets/${lot.join(',')}/quotes/`, ctx);
    releveAt = new Date().toISOString();
    for (const [contrat, carnet] of Object.entries(j && typeof j === 'object' ? j : {})) carnets.set(String(contrat), { ...carnet, releveAt });
  }
  return carnets;
}

async function lireVolumes(marketIds, ctx) {
  const volumes = new Map();
  for (const lot of paquets(marketIds, LOT_VOLUMES)) {
    const j = await lireJson(`${API}/markets/${lot.join(',')}/volumes/`, ctx);
    for (const v of Array.isArray(j?.volumes) ? j.volumes : []) {
      const n = Number(v?.volume);
      if (v?.market_id && Number.isFinite(n) && n >= 0) volumes.set(String(v.market_id), n);
    }
  }
  return volumes;
}

// ---------------------------------------------------------------------------
// Prix : le milieu du carnet.
// ---------------------------------------------------------------------------

const pointValide = (x) => Number.isInteger(x?.price) && x.price >= 1 && x.price <= 9999 && Number(x.quantity) > 0;

/**
 * Lecture d'un carnet : meilleur achat, meilleure vente, milieu et écart, en
 * points de base ; ou { raison } s'il est vide, d'un seul côté ou croisé.
 * Côté Smarkets, `bids` = ordres d'achat (qui veut jouer l'issue : son prix
 * est le prix de vente immédiate) et `offers` = ordres de vente (qui la joue
 * contre : son prix est le prix d'achat immédiat, la « cote à jouer »).
 */
function lireCarnet(carnet) {
  const achats = (Array.isArray(carnet?.bids) ? carnet.bids : []).filter(pointValide).map((x) => x.price);
  const ventes = (Array.isArray(carnet?.offers) ? carnet.offers : []).filter(pointValide).map((x) => x.price);
  if (!achats.length && !ventes.length) return { raison: 'carnet vide' };
  if (!achats.length || !ventes.length) return { raison: "carnet d'un seul côté" };
  const achat = Math.max(...achats);
  const vente = Math.min(...ventes);
  if (vente <= achat) return { raison: 'carnet croisé' };
  return { achat, vente, mid: (achat + vente) / 2, ecart: vente - achat };
}

/**
 * Probabilité et cote d'un milieu. Au-delà de 99,95 %, la cote arrondie au
 * millième vaudrait 1,000 : ce n'est plus une cote (le dépôt exige > 1).
 */
const prixDuMilieu = (mid) => {
  const price = Math.round((10000 / mid) * 1000) / 1000;
  return price > 1 ? { prob: mid / 10000, price } : { raison: 'probabilité trop proche de 100 %' };
};

/**
 * Le prix d'UNE issue, seule : milieu du carnet si l'écart est serré (au
 * plus 10 points et la moitié du milieu). Rend { prob, price, achat, vente }
 * ou { raison }.
 */
function milieu(carnet) {
  const l = lireCarnet(carnet);
  if (!l.mid) return l;
  if (l.ecart > ECART_MAX_PB || l.ecart > ECART_RELATIF_MAX * l.mid) return { raison: 'carnet trop écarté' };
  const p = prixDuMilieu(l.mid);
  return p.prob ? { ...p, achat: l.achat, vente: l.vente } : p;
}

/**
 * Les prix des issues d'un MARCHÉ. Une issue au carnet serré a son prix
 * (milieu) ; un marché dont TOUTES les issues ont achat et vente à 15 points
 * au plus, et dont les milieux font ensemble 98 à 103 %, a le prix de toutes
 * ses issues : c'est le carnet d'un teneur de marché centré sur un prix
 * juste (mesuré le 04/10 : 142 marchés 1x2 à 10-15 points d'écart, somme des
 * milieux de 1,000 à 1,009 — plus régulière que celle des marchés serrés).
 * `carnets` : [carnet | undefined] dans l'ordre des issues. Rend [{ prob,
 * price } | { raison }] dans le même ordre.
 */
function prixDuMarche(carnets) {
  const lectures = carnets.map((c) => (c ? lireCarnet(c) : { raison: 'carnet vide' }));
  const somme = lectures.reduce((s, l) => s + (l.mid ?? 0), 0) / 10000;
  const coherent =
    lectures.length >= 2 && lectures.every((l) => l.mid && l.ecart <= ECART_TENEUR_PB) && somme >= SOMME_MIN && somme <= SOMME_MAX;
  return lectures.map((l, i) => {
    if (!l.mid) return { raison: l.raison };
    if (coherent) return prixDuMilieu(l.mid);
    const seul = milieu(carnets[i]);
    return seul.prob ? { prob: seul.prob, price: seul.price } : { raison: seul.raison };
  });
}

// ---------------------------------------------------------------------------
// Rattachement aux rencontres du calendrier.
// ---------------------------------------------------------------------------

/**
 * Forme d'une écriture, pour ne pas interroger deux fois l'annuaire sur
 * « Atlético Mineiro » et « atletico-mineiro » : sert à DÉDOUBLONNER les
 * essais, jamais à comparer deux clubs.
 */
const forme = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Noms que l'annuaire ne connaît pas du tout : clubDuMagasin coûte ~0,3 s de
 * lecture SQLite (synchrone, donc la boucle du serveur attend) par écriture
 * inconnue ; inutile de recommencer à chaque passe. Gardé 6 h.
 */
const inconnus = new Map();
const INCONNU_MS = 6 * HEURE_MS;

/**
 * L'identifiant FotMob d'un club Smarkets (voir l'en-tête : alias appris,
 * sinon nom exact de l'annuaire, sinon règles strictes de clubDuMagasin ;
 * toujours un club que le calendrier fait jouer dans la compétition ;
 * écritures concordantes ; alias appris après coup). Rend { id, motif } :
 * motif « inconnu » (l'annuaire ne connaît aucune écriture), « contradictoire »
 * (deux clubs désignés), « hors calendrier » (un club connu, mais d'aucune
 * des rencontres demandées : il ne concerne pas cette passe).
 * `clubsDuCalendrier` : identifiants des clubs des rencontres demandées de
 * cette compétition.
 */
async function identifierClub(club, league, clubsDuCalendrier, database) {
  const keys = club.id ? [`id:${club.id}`] : [];
  for (const k of [club.name, ...keys]) {
    let connu = null;
    try {
      connu = aliasConnu(SOURCE, k, league, { database });
    } catch {
      connu = null;
    }
    if (connu) return { id: connu, motif: null };
  }
  const cle = `${league}|${club.id ?? club.name}`;
  if ((inconnus.get(cle) ?? 0) > Date.now()) return { id: null, motif: 'inconnu' };

  const ecritures = [];
  const vues = new Set();
  for (const s of [club.name, club.shortName, motsDuSlug(club.slug)]) {
    const f = forme(s);
    if (f && !vues.has(f)) {
      vues.add(f);
      ecritures.push(s);
    }
  }
  // 1. Les noms exacts de l'annuaire, sur toutes les écritures (lecture indexée, immédiate).
  const exacts = new Set();
  let exactIci = false;
  let repondu = false;
  for (const s of ecritures) {
    let clubs = [];
    try {
      clubs = findTeams(s, { database });
    } catch {
      clubs = [];
    }
    const memes = clubs.filter((c) => c.league === league);
    const trouve = memes.length === 1 ? memes[0] : clubs.length === 1 ? clubs[0] : null;
    if (!trouve) continue;
    repondu = true;
    if (trouve.league === league) exactIci = true;
    if (clubsDuCalendrier.has(trouve.teamId)) exacts.add(trouve.teamId);
  }
  let id = null;
  let motif = null;
  if (exacts.size === 1) id = [...exacts][0];
  else if (exacts.size > 1) motif = 'contradictoire';
  // Un club de CETTE compétition, nommé exactement, mais d'aucune rencontre demandée (l'Atalanta un jour
  // où le calendrier relevé ne la fait pas jouer) : rien à chercher de plus, l'annuaire coûte cher.
  else if (exactIci) motif = 'hors calendrier';
  else {
    // 2. Sinon les règles strictes de l'annuaire (mêmes mots, inclusion), qui doivent concorder.
    const proches = new Set();
    for (const s of ecritures) {
      let r = null;
      try {
        r = clubDuMagasin(s, league, database);
      } catch {
        r = null;
      }
      // ~0,3 s de lecture synchrone par écriture : rendre la main au serveur entre deux.
      await new Promise((fin) => setImmediate(fin));
      if (!r) continue;
      repondu = true;
      if (clubsDuCalendrier.has(r)) proches.add(r);
    }
    if (proches.size === 1) id = [...proches][0];
    else motif = proches.size > 1 ? 'contradictoire' : repondu ? 'hors calendrier' : 'inconnu';
  }
  if (!id) {
    // En cache seulement un nom que l'annuaire ignore tout à fait : un nom qui désigne un club hors de
    // cette liste-ci peut convenir à la suivante (le calendrier entier, par exemple).
    if (motif === 'inconnu') inconnus.set(cle, Date.now() + INCONNU_MS);
    if (inconnus.size > 5000) for (const [k, t] of inconnus) if (t < Date.now()) inconnus.delete(k);
    return { id: null, motif };
  }
  for (const k of [club.name, ...keys]) {
    try {
      apprendreAlias(SOURCE, k, league, id, 'annuaire', { database });
    } catch {
      // L'alias se réapprendra à la passe suivante ; le rattachement de celle-ci reste juste.
    }
  }
  return { id, motif: null };
}

/** Le club FotMob d'un nom du calendrier quand la rencontre arrive sans identifiant. */
function clubDuCalendrier(nom, league, database) {
  try {
    return clubDuMagasin(nom, league, database) ?? null;
  } catch {
    return null;
  }
}

/**
 * Pourquoi une rencontre du calendrier n'a trouvé aucune rencontre
 * Smarkets : ce que l'appli affiche à Pierre, en clair. Rend { reason, nom }
 * — `nom` : le nom Smarkets qui bloque, quand c'est un nom.
 */
function raisonIntrouvable(f, rencontres, listeComplete, finListe) {
  if (!f.homeId) return { reason: `club du calendrier non identifié : ${f.homeName}` };
  if (!f.awayId) return { reason: `club du calendrier non identifié : ${f.awayName}` };
  const proches = rencontres.filter((r) => r.league === f.league && r.date && ecartJours(r.date, f.date) <= 1);
  if (proches.some((r) => r.homeId === f.awayId && r.awayId === f.homeId)) return { reason: 'domicile et extérieur inversés chez Smarkets' };
  for (const r of proches) {
    // Un des deux clubs reconnu à sa place, l'autre pas : c'est très probablement ce match, le nom manque à l'annuaire.
    // Le diagnostic ne rattache RIEN : il dit seulement à Pierre quel nom apprendre.
    if (r.homeId === f.homeId && !r.awayId) return { reason: `nom d'équipe non reconnu : ${r.awayName}`, nom: r.awayName };
    if (r.awayId === f.awayId && !r.homeId) return { reason: `nom d'équipe non reconnu : ${r.homeName}`, nom: r.homeName };
  }
  for (const r of proches) {
    if ((r.homeId === f.homeId && r.awayId && r.awayId !== f.awayId) || (r.awayId === f.awayId && r.homeId && r.homeId !== f.homeId)) {
      return { reason: `affiche différente chez Smarkets : ${r.homeName} - ${r.awayName}` };
    }
  }
  if (!listeComplete && finListe && f.date >= finListe) return { reason: 'relevé Smarkets interrompu (plafond de requêtes) avant ce jour' };
  if (!proches.length) return { reason: 'Smarkets ne publie aucun match de cette compétition ces jours-là' };
  return { reason: 'match introuvable chez Smarkets' };
}

const RAISON_ETAT = {
  new: 'marché Smarkets pas encore ouvert',
  halted: 'marché Smarkets suspendu',
  settled: 'marché Smarkets fermé',
  voided: 'marché Smarkets annulé',
  unavailable: 'marché Smarkets indisponible',
  live: 'match déjà commencé chez Smarkets'
};

// ---------------------------------------------------------------------------
// Collecte commune (avant-match et direct).
// ---------------------------------------------------------------------------

async function collecter(mode, { fixtures = [], database = null, log = () => {} } = {}) {
  const direct = mode === 'direct';
  const debutAppel = Date.now();
  const sortie = { quotes: [], requests: 0, unresolved: [], errors: [], events: [], missing: [], attached: 0 };
  const ctx = { requests: 0, max: direct ? MAX_REQUETES_DIRECT : MAX_REQUETES_AVENIR };
  const manquer = (f, reason) => sortie.missing.push({ league: f.league, date: f.date, homeName: f.homeName, awayName: f.awayName, reason });
  let db = database;
  try {
    db = db ?? openDb();
  } catch (error) {
    sortie.errors.push(`base illisible : ${error.message}`);
    return sortie;
  }

  // 1. Les rencontres du calendrier que Smarkets couvre, avec leurs identifiants.
  const maintenant = Date.now();
  const aujourdhui = jourUtc(maintenant);
  const suivies = [];
  for (const brute of Array.isArray(fixtures) ? fixtures : []) {
    if (!brute?.league || !brute.date || !brute.homeName || !brute.awayName || !/^\d{4}-\d{2}-\d{2}$/.test(brute.date)) continue;
    // Une compétition absente de LIGUES est « non couverte » : l'appli le dit sans qu'on la liste ici.
    if (!LIGUES.has(brute.league)) continue;
    const f = { league: brute.league, date: brute.date, homeName: brute.homeName, awayName: brute.awayName, kickoff: isoOuNull(brute.kickoff) };
    if (!direct && f.date < plusJours(aujourdhui, -1)) continue; // déjà passé : rien à relever avant match
    if (!direct && f.date > plusJours(aujourdhui, HORIZON_JOURS)) {
      manquer(f, `match dans plus de ${HORIZON_JOURS} jours : pas encore relevé sur Smarkets`);
      continue;
    }
    // Les identifiants viennent normalement avec la rencontre (annuaire du calendrier, liste FotMob du jour).
    f.homeId = brute.homeId || clubDuCalendrier(brute.homeName, brute.league, db);
    f.awayId = brute.awayId || clubDuCalendrier(brute.awayName, brute.league, db);
    f.cle = suivies.length;
    suivies.push(f);
  }
  if (!suivies.length) return sortie;
  /** Clubs que le calendrier fait jouer, par compétition : le garde-fou de l'identification. */
  const clubsDuCalendrier = new Map();
  for (const f of suivies) {
    const s = clubsDuCalendrier.get(f.league) ?? new Set();
    if (f.homeId) s.add(f.homeId);
    if (f.awayId) s.add(f.awayId);
    clubsDuCalendrier.set(f.league, s);
  }

  try {
    // 2. Les rencontres Smarkets des mêmes compétitions, sur la même période.
    const noeuds = [...new Set(suivies.flatMap((f) => (COMPETITIONS[f.league] ?? []).map(([, id]) => id)))];
    let debut;
    let fin;
    const coups = suivies.map((f) => Date.parse(f.kickoff ?? '')).filter(Number.isFinite);
    if (coups.length === suivies.length) {
      // Coups d'envoi connus (liste FotMob du jour, boucle oddsWatch) : une fenêtre de quelques heures
      // suffit — en direct, le match a pu commencer en retard ; avant match, l'heure a pu bouger.
      debut = new Date(Math.min(...coups) - (direct ? 4 : 6) * HEURE_MS).toISOString();
      fin = new Date(Math.max(...coups) + (direct ? 1 : 6) * HEURE_MS).toISOString();
    } else {
      // Le calendrier ne donne que le jour, parfois en heure locale : un jour de marge de chaque côté, en UTC.
      const jours = suivies.map((f) => f.date).sort();
      debut = `${plusJours(jours[0], -1)}T00:00:00Z`;
      fin = `${plusJours(jours.at(-1), 2)}T00:00:00Z`;
    }
    // Avant-match : les rencontres déjà en cours sont lues aussi, pour dire pourquoi elles n'ont pas de cote d'avant-match.
    const etats = direct ? ['live', 'upcoming'] : ['upcoming', 'live'];
    let liste = { rencontres: [], complet: false };
    try {
      liste = await listerRencontres({ noeuds, etats, debut, fin }, ctx);
    } catch (error) {
      sortie.errors.push(`liste des rencontres : ${error.message}`);
      for (const f of suivies) manquer(f, error instanceof PlafondAtteint ? 'relevé Smarkets interrompu (plafond de requêtes)' : 'Smarkets injoignable');
      return sortie;
    }
    if (!liste.complet) sortie.errors.push('liste des rencontres incomplète : plafond de pages ou de requêtes atteint');

    // Seules les rencontres d'une compétition suivie, revérifiée par le slug de leur adresse.
    const brutes = liste.rencontres.filter((e) => {
      const slug = String(e.full_slug ?? '').split('/')[3];
      const noeud = NOEUDS.get(slug);
      return noeud && String(e.parent_id) === noeud.id;
    });
    const finListe = brutes.length ? jourUtc(Math.max(...brutes.map((e) => Date.parse(e.start_datetime ?? e.start_date ?? '')).filter(Number.isFinite))) : null;

    // 3. Les deux clubs de chaque rencontre, puis leurs identifiants FotMob.
    let clubs = new Map();
    try {
      clubs = await lireConcurrents(brutes.map((e) => String(e.id)), ctx);
    } catch (error) {
      // Sans les clubs, aucune rencontre ne se rattache : le dire tel quel plutôt que « introuvable ».
      sortie.errors.push(`clubs des rencontres : ${error.message}`);
      for (const f of suivies) manquer(f, error instanceof PlafondAtteint ? 'relevé Smarkets interrompu (plafond de requêtes)' : 'Smarkets injoignable (clubs des rencontres)');
      return sortie;
    }
    const nonResolus = new Map();
    const dejaIdentifies = new Map();
    const rencontres = [];
    // Une rencontre Smarkets ne peut correspondre qu'à une rencontre demandée de la même compétition, à
    // un jour près (et à 6 h près quand les deux coups d'envoi sont connus) : inutile d'identifier les autres.
    const suiviesParLigue = new Map();
    for (const f of suivies) suiviesParLigue.set(f.league, [...(suiviesParLigue.get(f.league) ?? []), f]);
    const plausible = (league, date, kickoff) =>
      (suiviesParLigue.get(league) ?? []).some((f) => {
        if (ecartJours(f.date, date) > 1) return false;
        const a = Date.parse(f.kickoff ?? '');
        const b = Date.parse(kickoff ?? '');
        return !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) <= 6 * HEURE_MS;
      });
    for (const e of brutes) {
      const id = String(e.id);
      const league = NOEUDS.get(String(e.full_slug).split('/')[3]).league;
      const c = clubs.get(id);
      if (!c?.home?.name || !c?.away?.name) continue;
      const kickoff = isoOuNull(e.start_datetime);
      const date = kickoff ? kickoff.slice(0, 10) : String(e.start_date ?? '').slice(0, 10) || null;
      let homeId = null;
      let awayId = null;
      if (date && plausible(league, date, kickoff)) {
        const connus = clubsDuCalendrier.get(league) ?? new Set();
        // Un club joue souvent deux fois dans la période : une seule identification par passe.
        const identifie = async (club) => {
          const cle = `${league}|${club.id ?? club.name}`;
          if (!dejaIdentifies.has(cle)) {
            dejaIdentifies.set(cle, await identifierClub(club, league, connus, db));
            // La lecture de l'annuaire est synchrone : rendre la main au serveur entre deux clubs.
            await new Promise((r) => setImmediate(r));
          }
          return dejaIdentifies.get(cle);
        };
        const dom = await identifie(c.home);
        const ext = await identifie(c.away);
        homeId = dom.id;
        awayId = ext.id;
        // Un derby n'oppose jamais un club à lui-même : deux fois le même identifiant trahit une erreur d'annuaire.
        if (homeId && homeId === awayId) {
          sortie.errors.push(`rencontre ${id} : « ${c.home.name} » et « ${c.away.name} » donnent le même club (${homeId}), non rattachée`);
          homeId = null;
          awayId = null;
        }
        // Non résolu = un nom que l'annuaire ne sait pas traduire ; un club connu qui ne joue aucune des
        // rencontres demandées ne l'est pas (il ne concerne simplement pas cette passe).
        for (const [club, r] of [[c.home, dom], [c.away, ext]]) {
          if (r.motif === 'inconnu' || r.motif === 'contradictoire') nonResolus.set(`${league}|${club.name}`, { name: club.name, league });
        }
      }
      rencontres.push({
        sourceEvent: id,
        league,
        date,
        kickoff,
        homeId,
        awayId,
        homeName: c.home.name,
        awayName: c.away.name,
        homeCompetitor: c.home.id,
        awayCompetitor: c.away.id,
        state: e.state ?? null,
        inplay: e.inplay_enabled !== false
      });
    }

    // 4. Rattachement : mêmes identifiants, même sens, au plus un jour d'écart (le plus proche l'emporte).
    const parAffiche = new Map();
    for (const f of suivies) {
      if (!f.homeId || !f.awayId) continue;
      const cle = `${f.league}|${f.homeId}|${f.awayId}`;
      parAffiche.set(cle, [...(parAffiche.get(cle) ?? []), f]);
    }
    const ecart = (f, r) => {
      const a = Date.parse(f.kickoff ?? '');
      const b = Date.parse(r.kickoff ?? '');
      return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) : ecartJours(f.date, r.date) * JOUR_MS;
    };
    const prises = new Map();
    for (const r of rencontres) {
      if (!r.homeId || !r.awayId || !r.date) continue;
      const candidates = (parAffiche.get(`${r.league}|${r.homeId}|${r.awayId}`) ?? []).filter((f) => ecartJours(f.date, r.date) <= 1);
      if (!candidates.length) continue;
      const f = candidates.sort((a, b) => ecart(a, r) - ecart(b, r))[0];
      const deja = prises.get(f.cle);
      if (!deja || ecart(f, r) < deja.ecart) prises.set(f.cle, { f, r, ecart: ecart(f, r) });
    }
    // Une rencontre Smarkets pour deux du calendrier (le même match inscrit deux fois, à deux dates
    // voisines, après un report) : la plus proche la garde, l'autre le dit.
    const parEvenement = new Map();
    for (const [cle, p] of prises) {
      const d = parEvenement.get(p.r.sourceEvent);
      if (!d || p.ecart < d.ecart) parEvenement.set(p.r.sourceEvent, { cle, ecart: p.ecart, date: p.f.date });
    }
    const doublons = new Set();
    for (const [cle, p] of [...prises]) {
      const gardee = parEvenement.get(p.r.sourceEvent);
      if (gardee.cle === cle) continue;
      prises.delete(cle);
      doublons.add(cle);
      manquer(p.f, `même rencontre Smarkets que l'affiche du ${gardee.date} : doublon probable du calendrier`);
    }
    for (const f of suivies) {
      if (prises.has(f.cle) || doublons.has(f.cle)) continue;
      const { reason, nom } = raisonIntrouvable(f, rencontres, liste.complet, finListe);
      manquer(f, reason);
      // Le nom qui bloque une rencontre du calendrier est non résolu, même s'il désigne un club d'ailleurs.
      if (nom) nonResolus.set(`${f.league}|${nom}`, { name: nom, league: f.league });
    }
    sortie.unresolved = [...nonResolus.values()];
    // Les rencontres vues, pour la boucle du direct : `attached` dit si l'une du calendrier leur correspond.
    const rattachees = new Set([...prises.values()].map(({ r }) => r.sourceEvent));
    sortie.events = rencontres.map(({ homeCompetitor, awayCompetitor, ...r }) => ({ ...r, attached: rattachees.has(r.sourceEvent) }));

    // 5. Rencontres à coter : l'état doit convenir au mode.
    const aCoter = [];
    for (const { f, r } of prises.values()) {
      if (!direct && r.state === 'live') {
        manquer(f, 'match déjà commencé : seulement des cotes en direct');
        continue;
      }
      if (direct && r.state !== 'live') {
        manquer(f, r.state === 'upcoming' ? 'match pas encore commencé chez Smarkets' : 'match plus coté en direct chez Smarkets');
        continue;
      }
      if (direct && !r.inplay) {
        manquer(f, 'Smarkets ne cote pas ce match en direct');
        continue;
      }
      aCoter.push({ f, r });
    }
    sortie.attached = prises.size;

    // 6. Marchés, issues, carnets et volumes, par lots.
    let marches = new Map();
    let carnets = new Map();
    let volumes = new Map();
    let echec = null;
    try {
      marches = await lireMarches(aCoter.map(({ r }) => r.sourceEvent), ctx);
      const ids = [...marches.values()].flat().map((m) => m.id);
      await lireContrats(ids, ctx);
      carnets = await lireCarnets(ids, ctx);
      try {
        volumes = await lireVolumes(ids, ctx);
      } catch (error) {
        // Sans volume, le prix reste bon : on le rend quand même.
        sortie.errors.push(`volumes : ${error.message}`);
      }
    } catch (error) {
      echec = error instanceof PlafondAtteint ? 'relevé Smarkets interrompu (plafond de requêtes)' : 'Smarkets injoignable pendant le relevé des prix';
      sortie.errors.push(`marchés ou prix : ${error.message}`);
    }

    // 7. Les cotes normalisées.
    const etatsOuverts = direct ? new Set(['live', 'open']) : new Set(['open']);
    for (const { f, r } of aCoter) {
      const liste1 = (marches.get(r.sourceEvent) ?? []).sort((a, b) => ORDRE_MARCHES.indexOf(a.market) - ORDRE_MARCHES.indexOf(b.market));
      let raison1x2 = liste1.some((m) => m.market === '1x2') ? null : echec ?? 'pas de marché 1x2 chez Smarkets';
      // Pourquoi une issue du 1x2 n'a pas de prix : « carnet vide », « carnet trop écarté »…
      let raisonCarnet = null;
      let issues1x2 = 0;
      for (const m of liste1) {
        if (!etatsOuverts.has(m.state)) {
          if (m.market === '1x2') raison1x2 = RAISON_ETAT[m.state] ?? 'marché Smarkets fermé';
          continue;
        }
        const contrats = contratsEnCache.get(m.id)?.contrats ?? [];
        // Le sens se vérifie aussi sur les contrats : HOME doit porter le club que Smarkets dit à domicile
        // (quand les deux identifiants sont publiés ; Smarkets n'en met pas sur nul, plus/moins, BTTS).
        const incoherent = contrats.some(
          (c) =>
            c.competitorId &&
            ((c.type === 'HOME' && r.homeCompetitor && c.competitorId !== r.homeCompetitor) ||
              (c.type === 'AWAY' && r.awayCompetitor && c.competitorId !== r.awayCompetitor))
        );
        if (incoherent) {
          sortie.errors.push(`rencontre ${r.sourceEvent} : contrats domicile/extérieur incohérents, marché ${m.id} ignoré`);
          if (m.market === '1x2') raison1x2 = 'sens domicile/extérieur incohérent chez Smarkets';
          continue;
        }
        // Les issues attendues, dans l'ordre (domicile, nul, extérieur…) ; une issue sans contrat ou sans
        // carnet compte comme un carnet vide, et le marché entier ne peut alors pas passer pour cohérent.
        const issues = [...(MARCHES_ATTENDUS[m.market] ?? [])].map((type) => {
          const c = contrats.find((x) => x.type === type);
          return { type, carnet: c ? carnets.get(c.id) : undefined };
        });
        if (echec && issues.every((i) => !i.carnet)) {
          // La lecture des prix a échoué : ce n'est pas le carnet qui est vide.
          if (m.market === '1x2') raison1x2 ??= echec;
          continue;
        }
        const prix = prixDuMarche(issues.map((i) => i.carnet));
        for (const [k, { type, carnet }] of issues.entries()) {
          const p = prix[k];
          if (!p.prob) {
            if (m.market === '1x2') raisonCarnet ??= p.raison;
            continue;
          }
          sortie.quotes.push({
            source: SOURCE,
            sourceEvent: r.sourceEvent,
            bookmaker: BOOKMAKER,
            market: m.market,
            selection: SELECTIONS[type],
            line: m.line,
            price: p.price,
            prob: p.prob,
            volume: volumes.get(m.id) ?? null,
            openInterest: null,
            kind: direct ? 'live' : 'snapshot',
            releveAt: carnet.releveAt,
            date: r.date,
            kickoff: r.kickoff,
            league: r.league,
            homeId: r.homeId,
            awayId: r.awayId,
            homeName: r.homeName,
            awayName: r.awayName,
            matchKey: null,
            provenance: `${API}/markets/${m.id}/quotes/`
          });
          if (m.market === '1x2') issues1x2++;
        }
      }
      // Les issues cotées restent rendues (chacune est une probabilité) ; un 1x2 sans ses trois issues ne
      // s'affiche pas dans la liste des matchs : il compte comme manquant, avec sa raison.
      if (!issues1x2) manquer(f, raison1x2 ?? (raisonCarnet ? `${raisonCarnet} chez Smarkets : aucun prix 1x2 fiable` : echec ?? 'aucun prix 1x2 chez Smarkets'));
      else if (issues1x2 < 3) manquer(f, `1x2 incomplet chez Smarkets (${issues1x2} issue${issues1x2 > 1 ? 's' : ''} sur 3) : ${raisonCarnet ?? 'carnet vide'}`);
    }
  } catch (error) {
    // Filet : une réponse inattendue ne doit jamais faire tomber la passe.
    sortie.errors.push(`erreur inattendue : ${error.message}`);
  } finally {
    sortie.requests = ctx.requests;
  }
  if (typeof log === 'function') {
    log(`[smarkets] ${direct ? 'direct' : 'avant-match'} : ${sortie.events.length} rencontres vues, ${sortie.attached} rattachées, ${sortie.quotes.length} prix, ${sortie.missing.length} sans prix, ${ctx.requests} requêtes en ${Math.round((Date.now() - debutAppel) / 1000)} s`);
  }
  return sortie;
}

/**
 * Relevé d'avant-match des rencontres À VENIR du calendrier (7 prochains
 * jours ; au-delà, chaque match dit qu'il sera relevé plus tard). Kind
 * « snapshot » : Smarkets ne publie pas d'ouverture distincte, et c'est
 * l'orchestrateur qui fait du dernier relevé d'avant-match la clôture.
 */
export async function collectUpcoming({ fixtures = [], database = null, log = () => {} } = {}) {
  return collecter('avenir', { fixtures, database, log });
}

/**
 * Relevé EN DIRECT des rencontres en cours (coup d'envoi passé depuis moins
 * de 3 h) : même chaîne, sur les seuls matchs que Smarkets dit « live » et
 * qu'il cote en direct (inplay_enabled). Une rencontre terminée quitte
 * l'état « live » et ses marchés se règlent : jamais de prix de fin de match.
 */
export async function collectLive({ fixtures = [], database = null, log = () => {} } = {}) {
  return collecter('direct', { fixtures, database, log });
}

/**
 * Rattrapage historique : Smarkets ne garde AUCUN prix d'avant-match passé
 * (marché réglé sans carnet ; dernier prix échangé pris pendant le match ;
 * /price_history/ et /executed_prices/ répondent 404 ; rencontres terminées
 * listées deux à trois jours seulement). Rien à rattraper : fini d'emblée,
 * sans requête.
 */
export async function backfill() {
  return {
    quotes: [],
    requests: 0,
    cursor: null,
    done: true,
    bilan: { attached: 0, unmatched: 0, unresolvedNames: [], sansCote: 0, note: "Smarkets ne publie aucun historique : seuls existent les relevés faits par CôteMaster." }
  };
}

export const __testing = { milieu, lireCarnet, prixDuMarche, marcheVoulu, motsDuSlug, identifierClub, NOEUDS, COMPETITIONS, raisonIntrouvable };
