/**
 * scores365Odds.js — la cote 1X2 de Bet365 publiée par 365Scores, sans clé.
 * -----------------------------------------------------------------------
 * 365Scores (« bet365 Scores ») sert à son site et à ses applications une
 * API JSON publique : webws.365scores.com/web/…. La liste des matchs d'UNE
 * journée porte, pour chaque rencontre cotée, le 1X2 de Bet365 : la cote
 * d'ouverture (originalRate), celle du moment (rate), la précédente
 * (oldRate) et une tendance. Une seule requête couvre toutes les
 * compétitions du jour, avant le match comme en direct, et l'archive
 * remonte deux ans.
 *
 * Adresse retenue (relevée le 04/10/2026) :
 *   https://webws.365scores.com/web/games/?appTypeId=1&langId=1
 *     &timezoneName=UTC&userCountryId=5&sports=1
 *     &startDate=04/10/2026&endDate=04/10/2026&showOdds=true
 * et, pour le direct, la même avec &onlyLiveGames=true (les seuls matchs
 * en cours : 160 ko au lieu de 1,2 Mo).
 *
 * Pièges mesurés, à ne pas « corriger » :
 *  1. appTypeId=5 — celui du site web — ne renvoie AUCUNE cote depuis la
 *     France (0 match coté sur 383 le 04/10/2026) ; appTypeId=1 les renvoie
 *     (comme 2, 3, 4 ou l'absence du paramètre), et ses identifiants de
 *     ligne sont les seuls qu'accepte l'historique des mouvements (piège 6).
 *  2. timezoneName=UTC : la liste d'un jour est alors exactement le jour
 *     UTC du coup d'envoi, celui du contrat. Avec Europe/Paris, un match de
 *     22 h 30 UTC tombait dans la liste du lendemain.
 *  3. La « rate » d'un match TERMINÉ n'est pas une clôture fiable : c'est le
 *     dernier point d'une série coupée à l'heure PRÉVUE du coup d'envoi, déjà
 *     jouée en direct quand cette heure est fausse (Curaçao - Trinité-et-
 *     Tobago, 01/10/2026 : 1,83 à l'ouverture, 1,36 « finale » après des
 *     allers-retours de 1,18 à 1,40 dans l'heure). Le rattrapage ne garde
 *     donc que l'OUVERTURE ; la clôture d'un match à venir, c'est
 *     l'orchestrateur qui la fait (dernier relevé « snapshot » avant match).
 *  4. Une journée passée que personne n'a demandée depuis longtemps met 4 à
 *     60 s à venir (15/03/2025 : 36 s), puis 0,1 s une fois en cache. Une
 *     requête abandonnée à 20 s ne remplit PAS le cache : trois essais de
 *     20 s échouaient sur cette journée. Le rattrapage attend donc 75 s
 *     (exception assumée au délai de 20 s du contrat) ; l'avant-match et le
 *     direct, rapides, gardent 20 s. Le CDN garde aussi un 504 quelques
 *     secondes : après un 504, la reprise attend plus longtemps.
 *  5. Deux ans glissants : la veille de la fenêtre rend une liste vide.
 *  6. D'autres marchés existent, match par match : bets/lines/?appTypeId=1
 *     …&games=<id> rend Bet365 ET BWIN sur le 1X2, la double chance, le
 *     plus/moins 1,5 / 2,5 / 3,5, les deux équipes marquent, le handicap
 *     asiatique, le remboursé si nul, la mi-temps, les corners ; mais une
 *     requête par match (le paramètre games n'en prend qu'un), et
 *     bets/oddsMovement/?lineId=… rend la série horodatée d'une ligne,
 *     gardée quelques semaines seulement. Trop de requêtes pour la boucle :
 *     non relevés ici, notés pour plus tard. La page d'un match
 *     (/web/game/?gameId=…) ne porte, elle, que la liste des types de
 *     marchés (lineTypesIds), aucune cote.
 *  7. Ligue des champions et Ligue Europa : leurs tours de qualification
 *     sont une AUTRE compétition chez 365Scores (332 et 596), alors que le
 *     magasin (FotMob) les range avec la phase finale.
 *  8. Score après prolongation : celui de la fin de la prolongation, tirs au
 *     but exclus — comme FotMob, ce qui permet le vote du rattrapage.
 *  9. La liste d'une GROSSE journée est COUPÉE PAR LE DÉBUT : au-delà de
 *     ~850 matchs, la source ne rend que les dernières heures (13/09/2025 :
 *     837 matchs, rien avant 12 h UTC — l'Arsenal - Nottingham Forest de
 *     11 h 30 manquait, comme le football asiatique et les matchs américains
 *     de la nuit). Une liste de plus de 500 matchs sans aucun match avant
 *     1 h UTC est donc relue pour son matin dans un fuseau à l'est
 *     (Etc/GMT-12 = UTC+12 : son « jour » finit à midi UTC ; Asia/Tokyo si la
 *     coupure tombe entre midi et 15 h), et les deux sont fusionnées par
 *     identifiant de match. Attention : la source comprend mal la plupart
 *     des fuseaux fixes (Etc/GMT-14 rendu en UTC-12, Etc/GMT-13 en UTC-4) et
 *     remplace par UTC, sans erreur, un nom qu'elle ignore (Pacific/Tarawa) :
 *     seuls ces deux-là ont été vérifiés, et le décalage rendu est contrôlé.
 *
 * Rattachement (sourceMatching.js), jamais par ressemblance de nom. Match à
 * venir : resolveFixture, équipe par équipe (alias appris, sinon annuaire
 * strict), l'identifiant d'équipe 365Scores (« id:… ») appris avec le nom ;
 * puis la rencontre du calendrier qui oppose les MÊMES identifiants FotMob,
 * à un jour près. Match joué (rattrapage) : voteAttach.
 *
 * Ce fournisseur n'écrit aucune cote en base : il rend des cotes normalisées
 * que l'orchestrateur (freeOdds.js) range. Seuls les alias appris par
 * sourceMatching (nom ou « id:… » -> club FotMob) y entrent, comme prévu —
 * en mémoire seulement sous ODDS_MATCHING_READONLY=1. Une source muette rend
 * quotes: [] et errors: [...], jamais une exception.
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { clubDuMagasin } from '../db/oddsProfileRead.js';
import { aliasConnu, resolveTeamId, voteAttach } from './sourceMatching.js';

export const SOURCE = '365scores';
const BASE = 'https://webws.365scores.com/web';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const ENTETES = {
  'User-Agent': UA,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  Referer: 'https://www.365scores.com/',
  Origin: 'https://www.365scores.com'
};
/** Bet365 chez 365Scores pour un utilisateur déclaré en France (userCountryId=5). */
const ID_BET365 = 14;
/** Type de ligne « Full Time Result » (1X2). */
const LIGNE_1X2 = 1;
const BOOKMAKER = 'Bet365';
export const BOOKMAKERS = [BOOKMAKER];

/**
 * Une page de la source = une journée, toutes compétitions confondues : le
 * rattrapage est GLOBAL (freeOdds.backfillOdds l'appelle une fois par passe,
 * avec league = null, sous la portée « * »).
 */
export const BACKFILL_GLOBAL = true;

/**
 * Compétitions 365Scores -> compétition du magasin, avec le nom que
 * 365Scores affiche. Identifiants relevés dans le catalogue de la source
 * (web/competitions/?sports=1, 800 compétitions) puis VÉRIFIÉS le
 * 04/10/2026 : les matchs de chacune, sur 19 journées d'août 2025 à
 * septembre 2026, ont été retrouvés dans le magasin par identifiants
 * FotMob, jour et score (EPL 44/44, Ligue 1 38/38, Libertadores 9/9…).
 *
 * 71 des 72 compétitions du magasin. Absente, et donc « non couverte par
 * 365Scores » :
 *   - Premier League - Russia (Premier Liga, id 89) : 365Scores publie les
 *     matchs, mais Bet365 ne cote pas le football russe — 0 match coté sur
 *     38 relevés de 2024 à 2026.
 * Pièges d'identifiant : la « Copa Paceña » bolivienne (7919) est une autre
 * compétition que la División Profesional (5055), avec les mêmes clubs ;
 * aucune de ses rencontres n'est au magasin. Les premiers tours de la
 * Libertadores et de la Sudamericana sont dans 102 et 389 ; les tours
 * régionaux de la Coupe de France, eux, ne sont pas publiés (seulement à
 * partir des 32es). Ce que la source ne cote pas (petits tours de coupe) se
 * voit match par match dans `missing`.
 */
const TABLE_COMPETITIONS = [
  // [id 365Scores, compétition du magasin, nom affiché par 365Scores]
  [7, 'EPL', 'England – Premier League'],
  [1, 'Championship', 'England – Championship'],
  [2, 'League 1', 'England – League One'],
  [3, 'League 2', 'England – League Two'],
  [8, 'FA Cup - England', 'England – FA Cup'],
  [9, 'EFL Cup', 'England – EFL Cup'],
  [61, 'Premiership - Scotland', 'Scotland – Scottish Premiership'],
  [11, 'La Liga - Spain', 'Spain – LaLiga'],
  [12, 'La Liga 2 - Spain', 'Spain – LaLiga 2'],
  [13, 'Copa del Rey - Spain', 'Spain – Copa del Rey'],
  [17, 'Serie A - Italy', 'Italy – Serie A'],
  [18, 'Serie B - Italy', 'Italy – Serie B'],
  [20, 'Coppa Italia - Italy', 'Italy – Coppa Italia'],
  [25, 'Bundesliga - Germany', 'Germany – Bundesliga'],
  [26, 'Bundesliga 2 - Germany', 'Germany – Bundesliga 2'],
  [28, 'DFB Pokal - Germany', 'Germany – DFB-Pokal'],
  [35, 'Ligue 1 - France', 'France – Ligue 1'],
  [36, 'Ligue 2 - France', 'France – Ligue 2'],
  [37, 'Coupe de France', 'France – Coupe de France'],
  [57, 'Dutch Eredivisie', 'Netherlands – Eredivisie'],
  [59, 'KNVB Cup - Netherlands', 'Netherlands – KNVB Cup'],
  [73, 'Primeira Liga - Portugal', 'Portugal – Liga Portugal'],
  [75, 'Taça de Portugal', 'Portugal – Taça de Portugal'],
  [76, 'Taça da Liga - Portugal', 'Portugal – League Cup'],
  [98, 'Belgium First Div', 'Belgium – Jupiler Pro League'],
  [100, 'Coupe de Belgique', 'Belgium – Belgian Cup'],
  [78, 'Turkey Super League', 'Turkiye – Super Lig'],
  [80, 'Türkiye Kupası', 'Turkiye – Turkiye Cup'],
  [84, 'Super League - Greece', 'Greece – Super League'],
  [87, 'Coupe de Grèce', 'Greece – Greece Cup'],
  [150, 'Super League - China', 'China – Super League'],
  [5510, 'Coupe de Chine', 'China – Chinese FA Cup'],
  [95, 'Swiss Superleague', 'Switzerland – Super League'],
  [111, 'Austrian Football Bundesliga', 'Austria – Bundesliga'],
  [119, 'Denmark Superliga', 'Denmark – Superliga'],
  [122, 'Allsvenskan - Sweden', 'Sweden – Allsvenskan'],
  [131, 'Eliteserien - Norway', 'Norway – Eliteserien'],
  [126, 'Veikkausliiga - Finland', 'Finland – Veikkausliiga'],
  [143, 'Besta deildin - Iceland', 'Iceland – Besta-deild karla'],
  [68, 'League of Ireland', 'Ireland – Premier Division'],
  [153, 'Ekstraklasa - Poland', 'Poland – Ekstraklasa'],
  [117, 'First League - Czechia', 'Czechia – Chance Liga'],
  [145, 'Nike Liga - Slovakia', 'Slovakia – Niké liga'],
  [158, 'HNL - Croatia', 'Croatia – HNL'],
  [628, 'Super Liga - Serbia', 'Serbia – Super Liga'],
  [136, 'Superliga - Romania', 'Romania – Liga 1'],
  [165, 'Virsliga - Latvia', 'Latvia – Virsliga'],
  [42, "Ligat ha'Al - Israel", 'Israel – Premier League'],
  [572, 'UEFA Champions League', 'Europe – UEFA Champions League'],
  [332, 'UEFA Champions League', 'Europe – UEFA Champions League Qualifiers'],
  [573, 'UEFA Europa League', 'Europe – UEFA Europa League'],
  [596, 'UEFA Europa League', 'Europe – UEFA Europa League Qualifiers'],
  [7685, 'UEFA Europa Conference League', 'Europe – UEFA Conference League'],
  [104, 'MLS', 'USA – MLS'],
  [348, 'US Open Cup', 'USA – US Open Cup'],
  [7242, 'Leagues Cup', 'North America – Leagues Cup'],
  [5620, 'Canadian Premier League', 'Canada – Canadian Premier League'],
  [6246, 'Canadian Championship', 'Canada – Canadian Championship'],
  [141, 'Liga MX', 'Mexico – Liga MX'],
  [72, 'Primera División - Argentina', 'Argentina – Liga Profesional'],
  [640, 'Copa Argentina', 'Argentina – Copa Argentina'],
  [113, 'Brazil Série A', 'Brazil – Brasileirão Série A'],
  [115, 'Copa do Brasil', 'Brazil – Copa do Brasil'],
  [135, 'Primera División - Chile', 'Chile – First Division'],
  [593, 'Copa Chile', 'Chile – Chilean Cup'],
  [620, 'Primera A - Colombia', 'Colombia – Liga BetPlay'],
  [583, 'Liga 1 - Peru', 'Peru – Liga 1'],
  [5062, 'Serie A - Ecuador', 'Ecuador – Liga Pro'],
  [621, 'División Profesional - Paraguay', 'Paraguay – Copa de Primera'],
  [5055, 'Primera División - Bolivia', 'Bolivia – División Profesional'],
  [634, 'Primera División - Venezuela', 'Venezuela – Liga FUTVE'],
  [102, 'Copa Libertadores', 'South America – CONMEBOL Libertadores'],
  [389, 'Copa Sudamericana', 'South America – CONMEBOL Sudamericana']
];

/** competitionId 365Scores -> { league, nom }. */
export const COMPETITIONS = new Map(TABLE_COMPETITIONS.map(([id, league, nom]) => [id, { league, nom }]));

/**
 * Compétition du magasin -> identifiant(s) de compétition chez 365Scores.
 * Une compétition absente d'ici est « non couverte par 365Scores » (la
 * Russie, voir plus haut).
 */
export const LIGUES = Object.freeze(
  TABLE_COMPETITIONS.reduce((acc, [id, league]) => {
    acc[league] = [...(acc[league] ?? []), id];
    return acc;
  }, {})
);

export const COUVERTURE = {
  source: SOURCE,
  nom: '365Scores',
  marches: ['1x2'],
  avantMatch: true,
  live: true,
  historique: 'deux ans glissants (cote d’ouverture seulement)',
  volumes: false,
  bookmakers: BOOKMAKERS,
  limites: [
    'Un seul bookmaker (Bet365) et un seul marché (1N2) dans la liste du jour : les autres marchés coûteraient une requête par match.',
    'Historique : la cote d’ouverture seulement ; la dernière cote d’un match terminé peut être une cote déjà jouée en direct, elle n’est jamais prise pour une clôture.',
    'Deux ans glissants : au-delà, 365Scores ne rend plus rien.',
    'Football russe jamais coté par Bet365 : la Premier League russe n’est pas couverte.',
    'Les petits tours de coupe ne sont pas cotés, ni même publiés pour la Coupe de France avant les 32es (visible match par match).',
    'Bet365 tel que 365Scores le montre à un utilisateur français : pas forcément le prix de bet365.fr.',
    'API non officielle du site : peut changer ou se taire sans prévenir ; journées anciennes lentes à venir (jusqu’à une minute).'
  ]
};

// ---------------------------------------------------------------------------
// Requêtes : une file, un espacement, des reprises
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Au moins 400 ms entre deux requêtes de ce module (le contrat en demande 300). */
const ESPACEMENT_MS = 400;
/** Les journées passées pèsent 1 à 3 Mo : on les espace davantage. */
const ESPACEMENT_HISTORIQUE_MS = 1_000;
const DELAI_MS = 20_000;
/** Journée passée hors cache : jusqu'à une minute (piège 4). */
const DELAI_HISTORIQUE_MS = 75_000;

let dernierDepart = 0;
let file = Promise.resolve();
/**
 * Attend son tour : la boucle du direct et l'actualisation complète peuvent
 * appeler ce module en même temps, et l'espacement vaut pour les deux.
 */
function attendreSonTour(espacementMs) {
  const tour = file.then(async () => {
    const attente = dernierDepart + espacementMs - Date.now();
    if (attente > 0) await sleep(attente);
    dernierDepart = Date.now();
  });
  file = tour.catch(() => {});
  return tour;
}

/** Le CDN garde un 504 (ou un 429) quelques secondes : revenir aussitôt ne sert à rien (piège 4). */
function attenteAvantReprise(essai, erreur) {
  const encombre = erreur?.status === 504 || erreur?.status === 503 || erreur?.status === 429;
  if (encombre) return essai === 1 ? 12_000 : 30_000;
  return essai === 1 ? 2_000 : 6_000;
}

/**
 * Un JSON de la source, en au plus `essais` requêtes (chacune compte dans
 * `compteur.n`, c'est ce que le budget limite). Lève l'erreur de la
 * dernière tentative.
 */
async function lireJson(url, compteur, { essais = 3, delaiMs = DELAI_MS, espacementMs = ESPACEMENT_MS } = {}) {
  let derniere = null;
  for (let essai = 0; essai < essais; essai++) {
    if (essai > 0) await sleep(attenteAvantReprise(essai, derniere));
    await attendreSonTour(espacementMs);
    compteur.n++;
    const controle = new AbortController();
    const minuterie = setTimeout(() => controle.abort(), delaiMs);
    try {
      const reponse = await fetch(url, { headers: ENTETES, signal: controle.signal });
      if (!reponse.ok) {
        derniere = new Error(`HTTP ${reponse.status}`);
        derniere.status = reponse.status;
        // Un refus (4xx hors 429) ne changera pas en insistant.
        if (reponse.status < 500 && reponse.status !== 429) break;
        continue;
      }
      const texte = await reponse.text();
      try {
        return JSON.parse(texte);
      } catch {
        derniere = new Error('réponse illisible (pas du JSON)');
      }
    } catch (error) {
      derniere = error?.name === 'AbortError' ? new Error(`pas de réponse en ${Math.round(delaiMs / 1000)} s`) : error;
    } finally {
      clearTimeout(minuterie);
    }
  }
  throw derniere ?? new Error('échec inconnu');
}

// ---------------------------------------------------------------------------
// Dates, adresses, conversions
// ---------------------------------------------------------------------------

const JOUR_MS = 86_400_000;
const jourIso = (t) => new Date(t).toISOString().slice(0, 10);
const decaler = (iso, jours) => jourIso(Date.parse(`${iso}T00:00:00Z`) + jours * JOUR_MS);
const ecartJours = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / JOUR_MS;
/** « 2026-10-04 » -> « 04/10/2026 », le format de la source. */
const jjmmaaaa = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * La liste d'une journée, toutes compétitions, cotes comprises (pièges 1 et
 * 2) : journée UTC par défaut ; `fuseau` sert à relire le matin d'une
 * journée coupée (piège 9) ; `direct`, aux seuls matchs en cours.
 */
export function urlListe(jour, { direct = false, fuseau = 'UTC' } = {}) {
  const d = jjmmaaaa(jour);
  return `${BASE}/games/?appTypeId=1&langId=1&timezoneName=${fuseau}&userCountryId=5&sports=1&startDate=${d}&endDate=${d}&showOdds=true${direct ? '&onlyLiveGames=true' : ''}`;
}

/** Au-delà, une liste sans match avant 1 h UTC a été coupée par le début (piège 9). */
const SEUIL_COUPE = 500;

/** L'heure UTC (1-23) où commence une liste coupée par le début, ou null si elle est entière. */
function heureDeCoupe(payload, jour) {
  const games = Array.isArray(payload?.games) ? payload.games : [];
  if (games.length < SEUIL_COUPE) return null;
  let premier = Infinity;
  for (const g of games) {
    const t = Date.parse(g?.startTime ?? '');
    if (Number.isFinite(t) && t < premier) premier = t;
  }
  if (!Number.isFinite(premier)) return null;
  const heure = Math.floor((premier - Date.parse(`${jour}T00:00:00Z`)) / 3_600_000);
  return heure >= 1 && heure <= 23 ? heure : null;
}

/**
 * Fuseaux VÉRIFIÉS (04/10/2026) pour relire le matin d'une journée coupée.
 * La source traduit mal la plupart des Etc/GMT-N (Etc/GMT-14 rendu en
 * UTC-12, Etc/GMT-13 en UTC-4) et remplace en silence par UTC un nom qu'elle
 * ne connaît pas (Pacific/Kiritimati). Deux seulement servent : Etc/GMT-12
 * (UTC+12 : le jour local finit à midi UTC) et Asia/Tokyo (UTC+9 : à 15 h
 * UTC). Le décalage rendu est vérifié à chaque lecture.
 */
const FUSEAUX_DU_MATIN = [
  { fuseau: 'Etc/GMT-12', decalage: '+12:00', jusqua: 12 },
  { fuseau: 'Asia/Tokyo', decalage: '+09:00', jusqua: 15 }
];
/** Le fuseau qui couvre de minuit UTC jusqu'à `heure`, ou null. */
const fuseauDuMatin = (heure) => FUSEAUX_DU_MATIN.find((f) => heure <= f.jusqua) ?? null;

/**
 * Une journée UTC ENTIÈRE : la liste UTC, et si elle est coupée par le
 * début (piège 9), son matin relu dans un fuseau à l'est, fusionné par
 * identifiant de match. Rend { url, urls, jeux, coupe, erreurMatin } ; lève
 * si la liste principale ne vient pas — et aussi si le matin manque quand
 * `exigerMatin` (le rattrapage ne doit pas sauter une demi-journée).
 * `budget` : requêtes encore permises à l'appelant (reprises comprises).
 */
async function lireJourComplet(jour, compteur, { delaiMs = DELAI_MS, espacementMs = ESPACEMENT_MS, budget = Infinity, exigerMatin = false } = {}) {
  const reste = () => budget - compteur.n;
  const url = urlListe(jour);
  const essais = Math.max(1, Math.min(3, reste()));
  let payload;
  try {
    payload = await lireJson(url, compteur, { essais, delaiMs, espacementMs });
  } catch (error) {
    // Moins de trois essais faute de budget : ce n'est pas la source qui a failli.
    const erreur = error instanceof Error ? error : new Error(String(error));
    if (essais < 3) erreur.fauteDeBudget = true;
    throw erreur;
  }
  const jeux = lireJeux(payload, { url, releveAt: new Date().toISOString() }).filter((j) => j.date === jour);
  const heure = heureDeCoupe(payload, jour);
  if (heure === null) return { url, urls: [url], jeux, coupe: false, erreurMatin: null };

  let erreurMatin = null;
  const choix = fuseauDuMatin(heure);
  const urlMatin = choix ? urlListe(jour, { fuseau: choix.fuseau }) : null;
  if (!choix) erreurMatin = `journée coupée avant ${heure} h UTC : aucun fuseau vérifié ne couvre ce matin`;
  else if (reste() < 1) erreurMatin = `journée coupée avant ${heure} h UTC, plus de requête permise pour relire le matin`;
  else {
    try {
      const matin = await lireJson(urlMatin, compteur, { essais: Math.max(1, Math.min(3, reste())), delaiMs, espacementMs });
      const games = Array.isArray(matin?.games) ? matin.games : [];
      // Le fuseau a-t-il été compris ? La source en remplace un inconnu sans le dire.
      const decalages = new Set(games.map((g) => String(g?.startTime ?? '').slice(19)).filter(Boolean));
      const premier = Math.min(...games.map((g) => Date.parse(g?.startTime ?? '')).filter(Number.isFinite));
      if (games.length && (decalages.size !== 1 || !decalages.has(choix.decalage))) {
        erreurMatin = `fuseau ${choix.fuseau} mal compris par 365Scores (décalage rendu : ${[...decalages].join(', ')})`;
      } else if (games.length >= SEUIL_COUPE && premier >= Date.parse(`${jour}T01:00:00Z`)) {
        // La relecture elle-même coupée jusque dans la journée : il manquerait encore un bout du matin.
        erreurMatin = `matin encore coupé (rien avant ${new Date(premier).toISOString().slice(11, 16)} UTC)`;
      } else {
        const vus = new Set(jeux.map((j) => j.sourceEvent));
        for (const j of lireJeux(matin, { url: urlMatin, releveAt: new Date().toISOString() })) {
          if (j.date !== jour || vus.has(j.sourceEvent)) continue;
          vus.add(j.sourceEvent);
          jeux.push(j);
        }
      }
    } catch (error) {
      erreurMatin = `matin (avant ${heure} h UTC) non relu : ${String(error?.message ?? error)}`;
    }
  }
  if (erreurMatin && exigerMatin) {
    const error = new Error(erreurMatin);
    error.fauteDeBudget = reste() < 1;
    throw error;
  }
  return { url, urls: erreurMatin ? [url] : [url, urlMatin], jeux, coupe: true, erreurMatin };
}

const arrondi = (x) => Math.round(x * 1000) / 1000;
const coteValide = (x) => {
  if (!Number.isFinite(x)) return null;
  const r = arrondi(x);
  return r > 1 ? r : null;
};

/**
 * Une cote 365Scores ({ decimal, fractional, american }) en cote décimale
 * (> 1, trois décimales), sinon null. La décimale fait foi ; à défaut, la
 * fractionnaire (« 13/20 » -> 1,65) puis l'américaine (+150 -> 2,5 ;
 * -260 -> 1 + 100/260 = 1,385).
 */
export function versDecimale(cote) {
  if (cote === null || cote === undefined) return null;
  if (typeof cote === 'number' || typeof cote === 'string') return coteValide(Number(cote));
  // Présente, la décimale tranche, même invalide (1 = marché suspendu) :
  // on ne va pas chercher une autre écriture pour la contredire.
  if (cote.decimal !== undefined && cote.decimal !== null && cote.decimal !== '') return coteValide(Number(cote.decimal));
  const f = String(cote.fractional ?? '').match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
  if (f && Number(f[2]) > 0) return coteValide(1 + Number(f[1]) / Number(f[2]));
  const a = String(cote.american ?? '').trim().match(/^([+-]?)(\d+(?:\.\d+)?)$/);
  if (a && Number(a[2]) > 0) {
    const n = Number(a[2]);
    return coteValide(a[1] === '-' ? 1 + 100 / n : 1 + n / 100);
  }
  return null;
}

/**
 * Un 1X2 de bookmaker : la somme des probabilités implicites tourne autour
 * de 1,03-1,15 ; hors de 0,9-1,6, ce n'est pas une cote mais une donnée
 * cassée (ou un marché à moitié publié).
 */
const plausible = (t) => {
  if (!t || !t.home || !t.draw || !t.away) return false;
  const somme = 1 / t.home + 1 / t.draw + 1 / t.away;
  return somme >= 0.9 && somme <= 1.6;
};

const SELECTIONS = [
  [1, '1', 'home'],
  [2, 'X', 'draw'],
  [3, '2', 'away']
];

/**
 * Le bloc `odds` d'un match : { courant, ouverture } (chacun { home, draw,
 * away } ou null), ou null si ce n'est pas le 1X2 de Bet365. Le numéro de
 * l'option fait foi (1 = domicile, 2 = nul, 3 = extérieur) et le libellé est
 * vérifié : une option 1 qui ne s'appellerait pas « 1 » n'est pas lue.
 */
function lire1x2(odds) {
  if (!odds || Number(odds.bookmakerId) !== ID_BET365) return null;
  if (Number(odds.lineTypeId ?? odds.lineType?.id) !== LIGNE_1X2) return null;
  const options = Array.isArray(odds.options) ? odds.options : [];
  const courant = {};
  const ouverture = {};
  for (const [num, libelle, selection] of SELECTIONS) {
    const o = options.find((x) => Number(x?.num) === num);
    if (!o) return null;
    if (o.name !== undefined && o.name !== null && String(o.name).trim().toUpperCase() !== libelle) return null;
    courant[selection] = versDecimale(o.rate);
    ouverture[selection] = versDecimale(o.originalRate);
  }
  return { courant: plausible(courant) ? courant : null, ouverture: plausible(ouverture) ? ouverture : null };
}

/**
 * État d'un match chez 365Scores. statusGroup : 2 à venir (« Scheduled »,
 * « Final Result Only »), 3 en cours, 4 fini — mais 4 range aussi les matchs
 * reportés, annulés, arrêtés, suspendus ou attribués sur tapis vert, qu'on
 * reconnaît à leur libellé.
 */
function statutDe(g) {
  const texte = `${g?.statusText ?? ''} ${g?.shortStatusText ?? ''}`;
  if (/postpon|delay|to be (?:determined|announced)|\bTBD\b|\bTBA\b/i.test(texte)) return 'reporte';
  if (/cancel|abandon|suspend|interrupt|award|walkover/i.test(texte)) return 'annule';
  const groupe = Number(g?.statusGroup);
  if (groupe === 1 || groupe === 2) return 'avenir';
  if (groupe === 3) return 'direct';
  if (groupe === 4) return 'fini';
  return 'inconnu';
}

/** Un score publié : entier >= 0 ; la source écrit -1 quand il n'y en a pas. */
const but = (x) => {
  if (x === null || x === undefined || x === '') return null;
  const n = Number(x);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/** Les matchs des compétitions suivies dans une liste de la source, dans un format commun. */
function lireJeux(payload, { url, releveAt }) {
  const jeux = [];
  const vus = new Set();
  for (const g of Array.isArray(payload?.games) ? payload.games : []) {
    const comp = COMPETITIONS.get(Number(g?.competitionId));
    if (!comp) continue;
    if (g.sportId !== undefined && Number(g.sportId) !== 1) continue;
    const sourceEvent = g.id === undefined || g.id === null ? '' : String(g.id);
    if (!sourceEvent || vus.has(sourceEvent)) continue;
    const debut = Date.parse(g.startTime ?? '');
    const h = g.homeCompetitor;
    const a = g.awayCompetitor;
    const homeName = String(h?.name ?? '').trim();
    const awayName = String(a?.name ?? '').trim();
    if (!Number.isFinite(debut) || !homeName || !awayName) continue;
    vus.add(sourceEvent);
    const kickoff = new Date(debut).toISOString();
    const lu = lire1x2(g.odds);
    jeux.push({
      sourceEvent,
      league: comp.league,
      competitionId: Number(g.competitionId),
      date: kickoff.slice(0, 10),
      kickoff,
      statut: statutDe(g),
      homeName,
      awayName,
      homeKeys: h?.id !== undefined && h?.id !== null ? [`id:${h.id}`] : [],
      awayKeys: a?.id !== undefined && a?.id !== null ? [`id:${a.id}`] : [],
      hg: but(h?.score),
      ag: but(a?.score),
      // Les sports américains affichent l'extérieur d'abord ; jamais vu en
      // football, mais si la source le dit, le sens n'est plus sûr.
      inverse: g.isHomeAwayInverted === true,
      aDesCotes: Boolean(g.odds),
      courant: lu?.courant ?? null,
      ouverture: lu?.ouverture ?? null,
      homeId: null,
      awayId: null,
      url,
      releveAt
    });
  }
  return jeux;
}

// ---------------------------------------------------------------------------
// Identifiants FotMob
// ---------------------------------------------------------------------------

/**
 * Un nom inconnu coûte ~0,4 s à l'annuaire (parcours des clubs de la
 * compétition) et sourceMatching ne garde pas les échecs : on les garde ici
 * six heures, le temps qu'un import du magasin ajoute peut-être le club.
 */
const ECHEC_MS = 6 * 3_600_000;
const echecsSource = new Map();
const echecsCalendrier = new Map();

/**
 * L'identifiant FotMob d'un club NOMMÉ PAR 365SCORES : ce que fait
 * resolveFixture pour chacune des deux équipes (alias appris — nom ou
 * « id:… » —, sinon annuaire strict, l'alias étant alors appris), avec en
 * plus la mémoire des échecs.
 */
function idDeLaSource(nom, league, keys, database) {
  for (const k of [nom, ...keys]) {
    const connu = aliasConnu(SOURCE, k, league, { database });
    if (connu) return connu;
  }
  const cle = `${league}|${nom}`;
  const echec = echecsSource.get(cle);
  if (echec && Date.now() - echec < ECHEC_MS) return null;
  let id = null;
  try {
    id = resolveTeamId({ source: SOURCE, name: nom, league, keys, database });
  } catch {
    id = null;
  }
  if (id) echecsSource.delete(cle);
  else echecsSource.set(cle, Date.now());
  return id;
}

/** L'identifiant d'un club du CALENDRIER (nom FotMob) quand l'appelant ne l'a pas donné : annuaire strict. */
function idDuCalendrier(nom, league, database) {
  const cle = `${league}|${nom}`;
  const echec = echecsCalendrier.get(cle);
  if (echec && Date.now() - echec < ECHEC_MS) return null;
  let id = null;
  try {
    id = clubDuMagasin(nom, league, database);
  } catch {
    id = null;
  }
  if (id) echecsCalendrier.delete(cle);
  else echecsCalendrier.set(cle, Date.now());
  return id;
}

/** Résout les deux équipes de chaque match ; rend les noms restés inconnus. */
function resoudre(jeux, database) {
  const nonResolus = new Map();
  for (const j of jeux) {
    j.homeId = idDeLaSource(j.homeName, j.league, j.homeKeys, database);
    j.awayId = idDeLaSource(j.awayName, j.league, j.awayKeys, database);
    if (!j.homeId) nonResolus.set(`${j.league}|${j.homeName}`, { name: j.homeName, league: j.league });
    if (!j.awayId) nonResolus.set(`${j.league}|${j.awayName}`, { name: j.awayName, league: j.league });
  }
  return [...nonResolus.values()];
}

/** Les rencontres du calendrier des compétitions couvertes, avec leurs identifiants. */
function rencontresCouvertes(fixtures, database) {
  const sortie = [];
  for (const f of fixtures ?? []) {
    if (!f || !LIGUES[f.league] || !/^\d{4}-\d{2}-\d{2}$/.test(String(f.date ?? '')) || !f.homeName || !f.awayName) continue;
    sortie.push({
      ...f,
      homeId: f.homeId ?? idDuCalendrier(f.homeName, f.league, database),
      awayId: f.awayId ?? idDuCalendrier(f.awayName, f.league, database)
    });
  }
  return sortie;
}

// ---------------------------------------------------------------------------
// Rapprochement calendrier <-> source, et ce qui manque
// ---------------------------------------------------------------------------

function indexer(jeux) {
  const parIds = new Map();
  for (const j of jeux) {
    if (!j.homeId || !j.awayId) continue;
    const cle = `${j.league}|${j.homeId}|${j.awayId}`;
    if (!parIds.has(cle)) parIds.set(cle, []);
    parIds.get(cle).push(j);
  }
  return parIds;
}

/** Le match de la source qui oppose ces deux identifiants, au jour le plus proche (± 1). */
function trouver(parIds, league, homeId, awayId, date) {
  return (
    (parIds.get(`${league}|${homeId}|${awayId}`) ?? [])
      .filter((j) => ecartJours(j.date, date) <= 1)
      .sort((x, y) => ecartJours(x.date, date) - ecartJours(y.date, date))[0] ?? null
  );
}

/**
 * Pourquoi une rencontre du calendrier n'a pas de match chez la source :
 * une phrase courte que Pierre comprend. `jeux` = matchs lus de la
 * compétition ; `lu` = la liste du jour (ou son erreur).
 */
function raisonIntrouvable(f, { parIds, jeux, lu, direct }) {
  if (!f.homeId || !f.awayId) return `club inconnu du magasin CôteMaster : ${!f.homeId ? f.homeName : f.awayName}`;
  if (trouver(parIds, f.league, f.awayId, f.homeId, f.date)) return 'domicile et extérieur inversés chez 365Scores';
  if (lu?.erreur) return `365Scores n’a pas répondu (${lu.erreur})`;
  const proches = jeux.filter((j) => j.league === f.league && ecartJours(j.date, f.date) <= 1);
  // Un camp reconnu, l'autre pas : c'est très probablement ce match-là.
  const partiel = proches.find((j) => (j.homeId === f.homeId && !j.awayId) || (j.awayId === f.awayId && !j.homeId));
  if (partiel) return `nom d'équipe non reconnu : ${partiel.homeId ? partiel.awayName : partiel.homeName}`;
  if (lu?.erreurMatin) return `365Scores n’a pas rendu le début de cette journée (${lu.erreurMatin})`;
  // Aucun camp reconnu : on ne sait pas lequel des matchs inconnus est le
  // bon, on dit seulement quels noms coincent ce jour-là (le vote du
  // rattrapage les apprendra une fois les matchs joués).
  const memeJour = proches.filter((j) => j.date === f.date);
  const inconnus = [...new Set((memeJour.length ? memeJour : proches).flatMap((j) => [j.homeId ? null : j.homeName, j.awayId ? null : j.awayName].filter(Boolean)))];
  if (inconnus.length) return `match introuvable chez 365Scores (noms non reconnus ce jour-là : ${inconnus.slice(0, 4).join(', ')}${inconnus.length > 4 ? '…' : ''})`;
  if (direct) return 'pas en cours chez 365Scores (pas commencé, terminé ou introuvable)';
  if (!proches.length) return 'match introuvable chez 365Scores (aucun match de cette compétition ce jour-là)';
  return 'match introuvable chez 365Scores';
}

/** Pourquoi un match trouvé chez la source n'a pas de cote (null s'il en a une). */
function raisonSansCote(jeu, { direct, maintenant }) {
  if (jeu.inverse) return 'sens domicile/extérieur incertain chez 365Scores';
  if (jeu.statut === 'reporte') return 'match reporté chez 365Scores';
  if (jeu.statut === 'annule') return 'match annulé, arrêté ou attribué chez 365Scores';
  if (direct) {
    if (jeu.statut === 'avenir') return 'pas encore commencé chez 365Scores';
    if (jeu.statut === 'fini') return 'déjà terminé chez 365Scores';
    if (!jeu.aDesCotes) return 'pas de cote en direct chez 365Scores';
    if (!jeu.courant) return 'cote en direct illisible';
    return null;
  }
  if (jeu.statut !== 'avenir' || Date.parse(jeu.kickoff) <= maintenant) return 'match déjà commencé chez 365Scores';
  if (!jeu.aDesCotes) return 'pas encore coté par 365Scores';
  if (!jeu.courant) return 'aucune cote Bet365 lisible sur ce match';
  return null;
}

// ---------------------------------------------------------------------------
// Cotes normalisées
// ---------------------------------------------------------------------------

function cotesDe(jeu, triple, kind, { releveAt, matchKey = null, homeId = jeu.homeId, awayId = jeu.awayId }) {
  if (!triple) return [];
  return ['home', 'draw', 'away'].map((selection) => ({
    source: SOURCE,
    sourceEvent: jeu.sourceEvent,
    bookmaker: BOOKMAKER,
    market: '1x2',
    selection,
    line: 0,
    price: triple[selection],
    prob: null,
    volume: null,
    openInterest: null,
    kind,
    releveAt,
    date: jeu.date,
    kickoff: jeu.kickoff,
    league: jeu.league,
    homeId: homeId ?? null,
    awayId: awayId ?? null,
    homeName: jeu.homeName,
    awayName: jeu.awayName,
    matchKey,
    provenance: jeu.url
  }));
}

const evenement = (j) => ({
  sourceEvent: j.sourceEvent,
  league: j.league,
  date: j.date,
  homeId: j.homeId,
  awayId: j.awayId,
  homeName: j.homeName,
  awayName: j.awayName,
  kickoff: j.kickoff
});

/**
 * Lit les listes de ces jours ; une liste en échec est notée, jamais
 * fatale. Avant-match : la journée entière (piège 9). Direct : les seuls
 * matchs en cours, jamais assez nombreux pour être coupés.
 */
async function lireJours(jours, compteur, { direct = false, log = () => {} } = {}) {
  const lus = new Map();
  for (const jour of jours) {
    try {
      if (direct) {
        const url = urlListe(jour, { direct: true });
        const payload = await lireJson(url, compteur);
        lus.set(jour, { url, jeux: lireJeux(payload, { url, releveAt: new Date().toISOString() }), erreur: null, erreurMatin: null });
      } else {
        const lu = await lireJourComplet(jour, compteur);
        lus.set(jour, { ...lu, erreur: null });
        if (lu.erreurMatin) log({ source: SOURCE, jour, erreur: lu.erreurMatin });
      }
    } catch (error) {
      const message = String(error?.message ?? error);
      lus.set(jour, { url: urlListe(jour, { direct }), erreur: message, erreurMatin: null, jeux: [] });
      log({ source: SOURCE, jour, erreur: message });
    }
  }
  return lus;
}

// ---------------------------------------------------------------------------
// Contrat : avant-match, direct, rattrapage
// ---------------------------------------------------------------------------

/**
 * Cotes des rencontres À VENIR : une liste par jour UTC du calendrier (au
 * plus `horizonJours` jours), toutes compétitions suivies. Pour chaque match
 * pas encore commencé et coté : l'ouverture (« open ») et la cote du moment
 * (« snapshot ») — jamais « close », c'est l'orchestrateur qui la fait.
 * Les matchs dont un nom reste inconnu sont rendus quand même, sans
 * identifiant : le rattrapage les rattachera une fois joués.
 */
export async function collectUpcoming({ fixtures = [], database = openDb(), log = () => {}, horizonJours = 15 } = {}) {
  const sortie = { quotes: [], requests: 0, unresolved: [], errors: [], events: [], missing: [] };
  const compteur = { n: 0 };
  try {
    const maintenant = Date.now();
    const aujourdhui = jourIso(maintenant);
    const fin = decaler(aujourdhui, horizonJours);
    const rencontres = rencontresCouvertes(fixtures, database);
    const jours = [...new Set(rencontres.map((f) => f.date).filter((d) => d >= aujourdhui && d <= fin))].sort();
    const lus = await lireJours(jours, compteur, { log });
    for (const [jour, lu] of lus) {
      if (lu.erreur) sortie.errors.push(`liste du ${jour} : ${lu.erreur}`);
      if (lu.erreurMatin) sortie.errors.push(`liste du ${jour} : ${lu.erreurMatin}`);
    }

    const jeux = [...lus.values()].flatMap((lu) => lu.jeux);
    sortie.unresolved = resoudre(jeux, database);
    for (const j of jeux) {
      if (j.statut !== 'avenir' || j.inverse || Date.parse(j.kickoff) <= maintenant) continue;
      sortie.events.push(evenement(j));
      sortie.quotes.push(...cotesDe(j, j.ouverture, 'open', { releveAt: j.releveAt }));
      sortie.quotes.push(...cotesDe(j, j.courant, 'snapshot', { releveAt: j.releveAt }));
    }

    const parIds = indexer(jeux);
    for (const f of rencontres) {
      let raison;
      if (f.date < aujourdhui) raison = 'date déjà passée : plus de cote d’avant-match';
      else if (f.date > fin) raison = `au-delà de ${horizonJours} jours : pas encore relevé chez 365Scores`;
      else {
        const jeu = f.homeId && f.awayId ? trouver(parIds, f.league, f.homeId, f.awayId, f.date) : null;
        raison = jeu ? raisonSansCote(jeu, { direct: false, maintenant }) : raisonIntrouvable(f, { parIds, jeux, lu: lus.get(f.date), direct: false });
      }
      if (raison) sortie.missing.push({ league: f.league, date: f.date, homeName: f.homeName, awayName: f.awayName, reason: raison });
    }
  } catch (error) {
    sortie.errors.push(`365Scores avant-match : ${String(error?.message ?? error)}`);
  }
  sortie.requests = compteur.n;
  return sortie;
}

/**
 * Cotes EN DIRECT des rencontres en cours (`fixtures` : coup d'envoi passé
 * depuis moins de 3 h). La liste des seuls matchs en cours du jour (et de la
 * veille pour un match commencé avant minuit UTC) : une requête légère par
 * jour. Rend la cote du moment, kind « live », pour les matchs du calendrier
 * retrouvés.
 */
export async function collectLive({ fixtures = [], database = openDb(), log = () => {} } = {}) {
  const sortie = { quotes: [], requests: 0, unresolved: [], errors: [], events: [], missing: [] };
  const compteur = { n: 0 };
  try {
    const maintenant = Date.now();
    const aujourdhui = jourIso(maintenant);
    const hier = decaler(aujourdhui, -1);
    const rencontres = rencontresCouvertes(fixtures, database);
    const jours = [...new Set(rencontres.map((f) => f.date).filter((d) => d === aujourdhui || d === hier))].sort();
    const lus = await lireJours(jours, compteur, { direct: true, log });
    for (const [jour, lu] of lus) if (lu.erreur) sortie.errors.push(`direct du ${jour} : ${lu.erreur}`);

    const jeux = [...lus.values()].flatMap((lu) => lu.jeux);
    sortie.unresolved = resoudre(jeux, database);
    const parIds = indexer(jeux);
    const pris = new Set();
    for (const f of rencontres) {
      let raison = null;
      if (f.date !== aujourdhui && f.date !== hier) raison = 'hors de la fenêtre du direct (ni aujourd’hui ni hier)';
      else {
        const jeu = f.homeId && f.awayId ? trouver(parIds, f.league, f.homeId, f.awayId, f.date) : null;
        if (!jeu) raison = raisonIntrouvable(f, { parIds, jeux, lu: lus.get(f.date), direct: true });
        else {
          raison = raisonSansCote(jeu, { direct: true, maintenant });
          if (!raison && !pris.has(jeu.sourceEvent)) {
            pris.add(jeu.sourceEvent);
            sortie.events.push(evenement(jeu));
            sortie.quotes.push(...cotesDe(jeu, jeu.courant, 'live', { releveAt: jeu.releveAt }));
          }
        }
      }
      if (raison) sortie.missing.push({ league: f.league, date: f.date, homeName: f.homeName, awayName: f.awayName, reason: raison });
    }
  } catch (error) {
    sortie.errors.push(`365Scores direct : ${String(error?.message ?? error)}`);
  }
  sortie.requests = compteur.n;
  return sortie;
}

/** Curseur du rattrapage : « AAAA-MM-JJ » (prochain jour à lire, en remontant), suivi de « #n » après n passes en échec sur ce jour. */
function lireCurseur(cursor) {
  const m = String(cursor ?? '').match(/^(\d{4}-\d{2}-\d{2})(?:#(\d+))?$/);
  return m ? { jour: m[1], echecs: Number(m[2] ?? 0) } : null;
}
const ecrireCurseur = (jour, echecs) => (echecs > 0 ? `${jour}#${echecs}` : jour);

/** Premier jour encore servi : deux ans glissants (piège 5), plus un jour de marge. */
function premierJourDisponible(maintenant = Date.now()) {
  const d = new Date(maintenant);
  d.setUTCFullYear(d.getUTCFullYear() - 2);
  return decaler(jourIso(d), 1);
}

/** Abandon d'un jour qui échoue à trois passes de suite (sinon le rattrapage resterait bloqué dessus). */
const PASSES_AVANT_ABANDON = 3;

/**
 * Rattrapage historique : les listes des jours PASSÉS, en remontant d'hier
 * vers la limite des deux ans. Une requête par jour, deux pour une grosse
 * journée coupée (piège 9) ; `budget` = nombre maximal de requêtes HTTP de
 * l'appel, reprises comprises. Délai de 75 s par requête (piège 4). Chaque
 * liste couvre TOUTES les compétitions : `league` est ignoré pour la lecture
 * (l'orchestrateur appelle une fois par passe avec league = null, cf.
 * BACKFILL_GLOBAL) ; s'il est donné, seules les cotes de cette compétition
 * sont rendues (essais, sondes).
 *
 * Curseur : le prochain jour à lire, en remontant (« AAAA-MM-JJ », suivi de
 * « #n » après n passes en échec sur ce jour ; abandonné après trois).
 * `done` quand la limite des deux ans est atteinte : les journées jouées
 * après le premier appel sont couvertes par collectUpcoming (ouverture
 * relevée avant le match) ; pour relire des jours récents (serveur arrêté
 * plusieurs jours), appeler backfill avec state = { cursor: <hier> } et un
 * petit budget, sans toucher à l'état enregistré.
 *
 * Les matchs terminés sont rattachés au magasin par voteAttach, compétition
 * par compétition, sur tous les jours lus pendant l'appel (un nom vu deux
 * fois peut alors être traduit par le vote) ; les noms déjà connus (alias ou
 * annuaire strict) le sont d'office, le score restant vérifié. Seule
 * l'OUVERTURE est rendue (kind « open », piège 3), avec matchKey et les deux
 * identifiants. Son relevé (`releveAt`) est daté du coup d'envoi : la source
 * ne dit pas quand elle a ouvert, seulement que c'était avant.
 *
 * `apply` : persister les alias appris par le vote (false pour les sondes).
 * `dureeMaxMs`, `deadline` (horodatage ms) : on n'entame plus de journée
 * au-delà — la boucle oddsWatch repasse toutes les 5 min et ne doit pas
 * attendre le rattrapage ; une journée commencée peut, elle, dépasser
 * (jusqu'à 75 s par essai, piège 4).
 */
export async function backfill({
  league = null,
  database = openDb(),
  budget = 20,
  state = null,
  log = () => {},
  apply = process.env.ODDS_MATCHING_READONLY !== '1',
  dureeMaxMs = 120_000,
  deadline = null
} = {}) {
  const debut = Date.now();
  const fin = Math.min(debut + dureeMaxMs, Number.isFinite(deadline) ? deadline : Infinity);
  const compteur = { n: 0 };
  const bilan = { attached: 0, unmatched: 0, unresolvedNames: [], sansCote: 0, scoreMismatch: 0, rows: 0, joursLus: [], joursEnEchec: [], joursCoupes: [], parLigue: {}, exemples: {} };
  const sortie = { quotes: [], requests: 0, cursor: state?.cursor ?? null, done: false, bilan, errors: [] };
  try {
    const limite = premierJourDisponible(debut);
    // Départ : la veille, sauf dans les six premières heures UTC (les matchs
    // américains de la veille finissent après minuit) — alors l'avant-veille.
    const depart = jourIso(debut - 30 * 3_600_000);
    let { jour, echecs } = lireCurseur(state?.cursor) ?? { jour: depart, echecs: 0 };
    if (jour > depart) jour = depart;
    const lignes = new Map();

    while (jour >= limite && compteur.n < budget && Date.now() < fin) {
      let lu;
      try {
        // La journée ENTIÈRE (piège 9), avec le long délai des journées hors cache (piège 4).
        lu = await lireJourComplet(jour, compteur, { delaiMs: DELAI_HISTORIQUE_MS, espacementMs: ESPACEMENT_HISTORIQUE_MS, budget, exigerMatin: true });
      } catch (error) {
        const message = String(error?.message ?? error);
        bilan.joursEnEchec.push(jour);
        sortie.errors.push(`liste du ${jour} : ${message}`);
        log({ source: SOURCE, jour, erreur: message });
        // Un échec faute de budget ne compte pas : la passe suivante reprendra ce jour.
        if (!error?.fauteDeBudget) echecs++;
        if (echecs >= PASSES_AVANT_ABANDON) {
          sortie.errors.push(`liste du ${jour} abandonnée après ${echecs} passes en échec`);
          jour = decaler(jour, -1);
          echecs = 0;
        }
        // La source peine (ou le budget est épuisé) : on s'arrête là pour cette passe.
        break;
      }
      if (lu.coupe) bilan.joursCoupes.push(jour);
      for (const j of lu.jeux) {
        if (league && j.league !== league) continue;
        if (j.statut !== 'fini' || j.inverse || j.hg === null || j.ag === null) continue;
        if (!lignes.has(j.league)) lignes.set(j.league, []);
        lignes.get(j.league).push({ date: j.date, home: j.homeName, away: j.awayName, hg: j.hg, ag: j.ag, homeKeys: j.homeKeys, awayKeys: j.awayKeys, jeu: j });
      }
      bilan.joursLus.push(jour);
      jour = decaler(jour, -1);
      echecs = 0;
    }
    // Le curseur avance avant le vote : une erreur de rattachement ne doit pas
    // faire relire sans fin les mêmes journées.
    sortie.cursor = ecrireCurseur(jour, echecs);
    sortie.done = jour < limite;

    const nonResolus = new Set();
    for (const [ligue, rows] of lignes) {
      // Les noms que l'alias ou l'annuaire strict connaissent déjà : le vote
      // les trouve alors d'office (aliasConnu), le score restant vérifié.
      const vus = new Set();
      for (const r of rows) {
        for (const [nom, keys] of [[r.home, r.homeKeys], [r.away, r.awayKeys]]) {
          if (vus.has(nom)) continue;
          vus.add(nom);
          idDeLaSource(nom, ligue, keys, database);
        }
      }
      const { attachments, bilan: b } = voteAttach({ source: SOURCE, league: ligue, rows, apply, database });
      let sansCote = 0;
      for (const { row, matchKey, homeId, awayId } of attachments) {
        const j = row.jeu;
        if (!j.ouverture) {
          sansCote++;
          continue;
        }
        sortie.quotes.push(...cotesDe(j, j.ouverture, 'open', { releveAt: j.kickoff, matchKey, homeId, awayId }));
        // Un exemple par compétition, pour vérifier à l'œil (sonde, écran d'état).
        bilan.exemples[ligue] ??= { sourceEvent: j.sourceEvent, date: j.date, homeName: j.homeName, awayName: j.awayName, score: `${j.hg}-${j.ag}`, matchKey, ouverture: j.ouverture };
      }
      bilan.rows += b.rows;
      bilan.attached += b.attached;
      bilan.unmatched += b.unmatched;
      bilan.scoreMismatch += b.scoreMismatch;
      bilan.sansCote += sansCote;
      for (const n of b.unresolvedNames) nonResolus.add(`${n} (${ligue})`);
      bilan.parLigue[ligue] = { rows: b.rows, attached: b.attached, unmatched: b.unmatched, scoreMismatch: b.scoreMismatch, sansCote, unresolved: b.unresolvedNames.length };
    }
    bilan.unresolvedNames = [...nonResolus].sort();
  } catch (error) {
    sortie.errors.push(`365Scores rattrapage : ${String(error?.message ?? error)}`);
  }
  sortie.requests = compteur.n;
  return sortie;
}

export const __testing = { lire1x2, lireJeux, statutDe, plausible, raisonIntrouvable, raisonSansCote, lireCurseur, premierJourDisponible, heureDeCoupe, fuseauDuMatin, TABLE_COMPETITIONS };
