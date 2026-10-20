/**
 * kalshiOdds.js — les prix et volumes du marché de prédiction Kalshi, gratuits et sans clé.
 * -----------------------------------------------------------------------
 * Kalshi (marché réglementé américain) publie, par API publique et sans
 * compte, un « événement » par match avec TROIS marchés binaires : domicile
 * gagne, nul (« Tie »), extérieur gagne — au temps réglementaire, prolongation
 * exclue (« Regulation Time Moneyline » pour les coupes). Le prix d'un
 * marché, en dollars, EST une probabilité (0,26 $ = 26 %) : ce n'est pas une
 * cote de bookmaker, d'où `prob` (brute, jamais ramenée à 100 % ici) et
 * `price` = 1/prob. Chaque sélection porte aussi le volume (contrats
 * échangés, 1 contrat = 1 $ de gain possible) et l'intérêt ouvert. Lecture
 * libre depuis la France ; le trading y est interdit, on ne trade pas.
 *
 * Ce que ce module rend (contrat commun, cf. oddsQuotesRepository.js) :
 *   - collectUpcoming : la valeur du moment (« snapshot ») des matchs à venir,
 *     une requête par compétition (/events?status=open, marchés et jalons
 *     imbriqués) ;
 *   - collectLive : la même lecture pour les matchs en cours (« live ») ;
 *   - backfill : l'ouverture et la clôture des matchs JOUÉS, reconstituées
 *     depuis les bougies horaires (et minute pour la dernière heure), avec le
 *     volume échangé AVANT le coup d'envoi.
 * Il n'écrit jamais dans la base : il lit le magasin (rencontres, annuaire)
 * et apprend des alias par sourceMatching, comme les autres fournisseurs.
 *
 * Pièges vérifiés le 04/10/2026, à ne pas réapprendre :
 *   1. `occurrence_datetime` n'est PAS le coup d'envoi : c'est le coup
 *      d'envoi + 3 h (Fulham - Man United du 20/09/2026 : coup d'envoi
 *      15:30 UTC au magasin, occurrence 18:30 ; Pasto - Fortaleza : jalon
 *      19:00, occurrence 22:00). Le prendre pour l'heure du match ferait
 *      passer trois heures de prix EN MATCH pour de l'avant-match — donc des
 *      cotes live pour des clôtures. Le vrai coup d'envoi vient du jalon
 *      (`milestones[].start_date`), du magasin pour un match joué, et à
 *      défaut d'occurrence − 3 h.
 *   2. Le volume final d'un marché est surtout du volume EN MATCH (Fulham -
 *      Man United, victoire de Man United : 352 462 contrats avant le coup
 *      d'envoi, 2 942 187 au total). La clôture porte donc la somme des
 *      bougies d'avant-match, jamais `volume_fp`.
 *   3. Deux familles d'adresses : les marchés réglés avant la « coupure »
 *      (/historical/cutoff, 05/08/2026 ce jour, elle avance) ne se lisent
 *      plus que par /historical/markets et leurs bougies marché par marché ;
 *      les autres par /events et les bougies d'événement (trois marchés en
 *      une requête). /events liste aussi les anciens événements, mais sans
 *      leurs marchés.
 *   4. Les noms changent (« Nottingham » puis « Nottingham Forest », « Paris »
 *      puis « Paris FC ») ; l'identifiant d'équipe Kalshi
 *      (`custom_strike.soccer_team`, un UUID) ne change pas et vaut pour
 *      toutes les compétitions (Man City a le même en Premier League et en
 *      Ligue des champions) : il est appris avec le nom (« uuid:… »).
 *   5. L'annuaire strict du magasin peut proposer un club d'une AUTRE
 *      compétition quand le nom n'y est porté qu'une fois : « Atletico »
 *      (Atlético Madrid, en Liga) y donnait « Atlético », club portugais de
 *      la Taça de Portugal ; « Fortaleza » (Colombie) le Fortaleza brésilien ;
 *      « Atlanta » (MLS) un autre club. Un identifiant n'est donc accepté que
 *      pour un club qui a joué cette compétition au magasin ou figure au
 *      calendrier demandé — sinon resolveTeamId l'aurait mémorisé pour de bon.
 *   6. Un match reporté garde son marché (jalon « postponed ») ; au-delà de
 *      48 h de report, Kalshi le règle « à un juste prix » et le prix ne dit
 *      plus rien du match : il n'est pas relevé. Un marché réglé sans aucune
 *      issue « yes » (annulé, reporté) n'est pas rattrapé non plus.
 *   7. Le sens domicile/extérieur : le titre « A vs B » met le club qui
 *      reçoit en premier (vérifié sur Arsenal - Leeds, Liverpool - Man City,
 *      Fulham - Man United : calendrier FotMob et jalon Kalshi
 *      `home_team_id` d'accord). Lu en priorité dans le jalon, sinon dans le
 *      ticker (« NEWAVL » = NEW puis AVL), sinon dans le titre ; deux
 *      lectures qui se contredisent écartent l'événement.
 *   8. Les marchés d'archive antérieurs à mai 2026 n'ont pas
 *      `occurrence_datetime`, seulement `expected_expiration_time` (égal là où
 *      les deux existent) ; les coupes préfixent les noms (« Reg Time:
 *      Atletico Melilla CF ») ; l'archive coupe un match entre deux pages.
 *   9. Le magasin compte la prolongation dans le score, Kalshi règle au temps
 *      réglementaire : l'issue comparée est recomptée sur le déroulé
 *      (buts jusqu'à la 90e) pour les matchs « afterextra »/« afterpenalties ».
 *  10. Un match TERMINÉ reste des heures dans /events?status=open, marchés
 *      « active », prix figés à 0,99/0,01 en attendant le règlement ; seul le
 *      jalon le dit (« closed »). Ces prix ne sont jamais rendus en direct.
 *
 * Source : https://api.elections.kalshi.com/trade-api/v2 (spécification
 * publique, lecture sans clé). Aucun quota publié pour la lecture anonyme :
 * une requête toutes les 0,55 s au plus, soit moins de deux par seconde.
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { clubDuMagasin } from '../db/oddsProfileRead.js';
import { aliasConnu, apprendreAlias, resolveTeamId } from './sourceMatching.js';
import { nameTokens } from '../../utils/nameIdentity.js';

export const SOURCE = 'kalshi';
const BOOKMAKER = 'Kalshi';
export const BOOKMAKERS = [BOOKMAKER];

const BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/**
 * Compétition du magasin -> série Kalshi des matchs (« …GAME »). Relevé le
 * 04/10/2026 sur /series?category=Sports (140 séries de matchs de football)
 * puis vérifié série par série sur /events : chacune a des matchs.
 *
 * Absentes, faute de série de matchs chez Kalshi (aucune parmi les 140, ni
 * sous un autre nom) : Austrian Football Bundesliga, Besta deildin - Iceland,
 * Canadian Championship, Copa Argentina, Copa Chile, Coupe de Belgique,
 * Coupe de Chine, League 2 (seule la League One est cotée), League of
 * Ireland, Nike Liga - Slovakia (Kalshi n'a que la 2. Liga et la coupe),
 * Premier League - Russia, Superliga - Romania, Taça da Liga - Portugal
 * (seule la Taça de Portugal est cotée), Türkiye Kupası, Veikkausliiga -
 * Finland (Kalshi n'a que la Ykkösliiga et la coupe). Séries vides écartées :
 * KXDANISHSUPERLIGAGAME (doublon de KXDENSUPERLIGAGAME), KXPRYLIGA1GAME et
 * KXKXECULPGAME (« delete »), KXUEFAGAME.
 */
export const LIGUES = {
  'Allsvenskan - Sweden': 'KXALLSVENSKANGAME',
  'Belgium First Div': 'KXBELGIANPLGAME',
  'Brazil Série A': 'KXBRASILEIROGAME',
  'Bundesliga - Germany': 'KXBUNDESLIGAGAME',
  'Bundesliga 2 - Germany': 'KXBUNDESLIGA2GAME',
  'Canadian Premier League': 'KXCANPLGAME',
  Championship: 'KXEFLCHAMPIONSHIPGAME',
  'Copa Libertadores': 'KXCONMEBOLLIBGAME',
  'Copa Sudamericana': 'KXCONMEBOLSUDGAME',
  'Copa del Rey - Spain': 'KXCOPADELREYGAME',
  'Copa do Brasil': 'KXCOPADOBRASILGAME',
  'Coppa Italia - Italy': 'KXCOPPAITALIAGAME',
  'Coupe de France': 'KXCOUPEDEFRANCEGAME',
  'Coupe de Grèce': 'KXGRECUPGAME',
  'DFB Pokal - Germany': 'KXDFBPOKALGAME',
  'Denmark Superliga': 'KXDENSUPERLIGAGAME',
  'División Profesional - Paraguay': 'KXAPFDDHGAME',
  'Dutch Eredivisie': 'KXEREDIVISIEGAME',
  'EFL Cup': 'KXEFLCUPGAME',
  EPL: 'KXEPLGAME',
  'Ekstraklasa - Poland': 'KXEKSTRAKLASAGAME',
  'Eliteserien - Norway': 'KXELITESERIENGAME',
  'FA Cup - England': 'KXFACUPGAME',
  'First League - Czechia': 'KXCZEFLGAME',
  'HNL - Croatia': 'KXHNLGAME',
  'KNVB Cup - Netherlands': 'KXKNVBCUPGAME',
  'La Liga - Spain': 'KXLALIGAGAME',
  'La Liga 2 - Spain': 'KXLALIGA2GAME',
  'League 1': 'KXEFLL1GAME',
  'Leagues Cup': 'KXLEAGUESCUPGAME',
  'Liga 1 - Peru': 'KXPERLIGA1GAME',
  'Liga MX': 'KXLIGAMXGAME',
  "Ligat ha'Al - Israel": 'KXISRPLGAME',
  'Ligue 1 - France': 'KXLIGUE1GAME',
  'Ligue 2 - France': 'KXLIGUE2GAME',
  MLS: 'KXMLSGAME',
  'Premiership - Scotland': 'KXSCOTTISHPREMGAME',
  'Primeira Liga - Portugal': 'KXLIGAPORTUGALGAME',
  'Primera A - Colombia': 'KXDIMAYORGAME',
  'Primera División - Argentina': 'KXARGPREMDIVGAME',
  'Primera División - Bolivia': 'KXBOLPDIVGAME',
  'Primera División - Chile': 'KXCHLLDPGAME',
  'Primera División - Venezuela': 'KXVENFUTVEGAME',
  'Serie A - Ecuador': 'KXECULPGAME',
  'Serie A - Italy': 'KXSERIEAGAME',
  'Serie B - Italy': 'KXSERIEBGAME',
  'Super League - China': 'KXCHNSLGAME',
  'Super League - Greece': 'KXSLGREECEGAME',
  'Super Liga - Serbia': 'KXSRBSLGAME',
  'Swiss Superleague': 'KXSWISSLEAGUEGAME',
  'Taça de Portugal': 'KXTACAPORTGAME',
  'Turkey Super League': 'KXSUPERLIGGAME',
  'UEFA Champions League': 'KXUCLGAME',
  'UEFA Europa Conference League': 'KXUECLGAME',
  'UEFA Europa League': 'KXUELGAME',
  'US Open Cup': 'KXUSOPENCUPGAME',
  'Virsliga - Latvia': 'KXLVAVIRGAME'
};

/** Ce que Kalshi sait rendre, pour dire en clair ce qui manque (cf. oddsGaps.js). */
export const COUVERTURE = {
  source: SOURCE,
  nom: 'Kalshi',
  marches: ['1x2'],
  avantMatch: true,
  live: true,
  historique: "variable selon la compétition : dès avril-mai 2025 (Ligue des champions, Premier League), 2026 pour la plupart, août 2026 seulement (Ligue 2, Israël, Serbie, Lettonie)",
  volumes: true,
  bookmakers: BOOKMAKERS,
  limites: [
    "prix d'échange (probabilité brute) et non cote de bookmaker : les trois issues ne font pas tout à fait 100 %",
    '1N2 seulement, au temps réglementaire (prolongation et tirs au but exclus)',
    'marchés ouverts de quelques jours à deux semaines avant le match selon la compétition ; pas de cote d’ouverture pour un match à venir',
    "liquidité très inégale : aucun prix rendu quand l'écart achat/vente dépasse 10 points et qu'aucun échange n'a eu lieu",
    'historique : clôture reconstituée à la minute près depuis les bougies, volume compté jusqu’au coup d’envoi',
    'source non officielle, lisible depuis la France mais susceptible d’être bloquée',
    '15 compétitions du magasin sans série Kalshi (Autriche, Islande, Russie, Roumanie, Finlande, Irlande, Slovaquie, League 2, plusieurs coupes)'
  ]
};

const HEURE_MS = 3_600_000;
const JOUR_MS = 24 * HEURE_MS;
/** occurrence_datetime = coup d'envoi + 3 h (piège 1 de l'en-tête). */
const DECALAGE_OCCURRENCE_MS = 3 * HEURE_MS;
/** Au-delà de cet écart achat/vente, le milieu du carnet ne dit rien (0,04/0,75 à l'ouverture d'un marché). */
const ECART_MAX = 0.1;
/** Kalshi règle à « un juste prix » un match reporté de plus de 48 h. */
const REPORT_MAX_MS = 48 * HEURE_MS;
/** Moins de deux requêtes par seconde : aucun quota publié pour la lecture anonyme. */
const ESPACEMENT_MS = 550;
const DELAI_MS = 20_000;
const TENTATIVES = 3;
/** Pages de 50 événements / 150 marchés : une page relue par appel du rattrapage reste légère. */
const PAGE_EVENEMENTS = 50;
const PAGE_MARCHES = 150;
/** Une réponse /events?status=open resservie 30 s : la boucle d'avant-match et celle du direct lisent souvent la même série. */
const CACHE_MS = 30_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jourUtc = (ms) => new Date(ms).toISOString().slice(0, 10);
const decaler = (iso, jours) => jourUtc(Date.parse(`${iso}T00:00:00Z`) + jours * JOUR_MS);
const ecartJours = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / JOUR_MS;
const arrondi = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const heureUtc = (ms) => new Date(ms).toISOString().slice(11, 16);
const nombre = (x) => {
  if (x === null || x === undefined || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const mediane = (liste) => {
  const t = liste.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!t.length) return null;
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
};
/** « fotmob-123 », comme au magasin ; un identifiant numérique nu y est ramené. */
const idFotmob = (x) => {
  if (x === null || x === undefined || x === '') return null;
  const s = String(x);
  if (/^fotmob-\d+$/.test(s)) return s;
  return /^\d+$/.test(s) && Number(s) > 0 ? `fotmob-${Number(s)}` : s;
};

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

class BudgetEpuise extends Error {
  constructor() {
    super('budget de requêtes épuisé');
    this.name = 'BudgetEpuise';
  }
}

/** Créneau de la prochaine requête, partagé par tout le processus : jamais de rafale, même à deux appels simultanés. */
let prochainCreneau = 0;
async function attendreSonTour() {
  const maintenant = Date.now();
  const creneau = Math.max(maintenant, prochainCreneau);
  prochainCreneau = creneau + ESPACEMENT_MS;
  if (creneau > maintenant) await sleep(creneau - maintenant);
}

const cache = new Map();
/** L'heure de chaque réponse : un relevé resservi par le cache garde l'heure où Kalshi l'a donné. */
const heuresDeReponse = new WeakMap();

/**
 * Un client par appel de fournisseur : compte les requêtes HTTP (chaque
 * tentative en est une) et refuse d'en lancer une de trop quand un budget
 * est fixé. 404 -> null ; 429 et 5xx -> nouvelle tentative, plus tard.
 */
function creerClient({ budget = Infinity } = {}) {
  const client = {
    requetes: 0,
    reste: () => budget - client.requetes,
    async json(url, { garder = false } = {}) {
      if (garder) {
        const c = cache.get(url);
        if (c && Date.now() - c.at < CACHE_MS) return c.json;
      }
      let derniere = null;
      for (let essai = 0; essai < TENTATIVES; essai++) {
        if (client.requetes >= budget) throw new BudgetEpuise();
        if (essai) await sleep(1500 * essai);
        await attendreSonTour();
        client.requetes++;
        const controle = new AbortController();
        const minuterie = setTimeout(() => controle.abort(), DELAI_MS);
        try {
          const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: controle.signal });
          if (r.status === 404) return null;
          if (r.status === 429 || r.status >= 500) {
            derniere = new Error(`HTTP ${r.status}`);
            // Trop de requêtes : on laisse respirer la source avant de réessayer.
            if (r.status === 429) await sleep(4000 * (essai + 1));
            continue;
          }
          if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { definitif: true });
          const json = await r.json();
          if (json && typeof json === 'object') heuresDeReponse.set(json, Date.now());
          if (garder) {
            cache.set(url, { at: Date.now(), json });
            for (const [cle, c] of cache) if (Date.now() - c.at >= CACHE_MS) cache.delete(cle);
          }
          return json;
        } catch (e) {
          if (e.definitif) throw e;
          derniere = e.name === 'AbortError' ? new Error(`pas de réponse en ${DELAI_MS / 1000} s`) : e;
        } finally {
          clearTimeout(minuterie);
        }
      }
      // Après trois tentatives : la source est muette (réseau, délai, 5xx, réponse tronquée).
      throw Object.assign(derniere ?? new Error('échec inconnu'), { muette: true });
    }
  };
  return client;
}

// ---------------------------------------------------------------------------
// Lecture d'une rencontre Kalshi
// ---------------------------------------------------------------------------

/** Dollars d'un champ Kalshi (« 0.2600 ») ; les anciens champs en cents en secours. */
function dollars(objet, champ) {
  const d = nombre(objet?.[`${champ}_dollars`]);
  if (d !== null) return d;
  const c = nombre(objet?.[champ]);
  return c === null ? null : c / 100;
}

/**
 * Probabilité d'un marché : le milieu du carnet quand achat et vente existent
 * et qu'ils sont à moins de 10 points l'un de l'autre ; sinon le prix du
 * dernier échange ; sinon rien. Un carnet vide côté vendeur affiche 1,00 $ :
 * ce n'est pas un prix.
 */
function probabiliteDe({ achat, vente, dernier }) {
  if (achat > 0 && vente > 0 && vente < 1 && vente - achat <= ECART_MAX + 1e-9) return { prob: (achat + vente) / 2, base: 'milieu' };
  if (dernier > 0 && dernier < 1) return { prob: dernier, base: 'dernier échange' };
  return null;
}

const probDuMarche = (m) => probabiliteDe({ achat: dollars(m, 'yes_bid'), vente: dollars(m, 'yes_ask'), dernier: dollars(m, 'last_price') });

/** Le code d'équipe d'un marché : la fin de son ticker (« KXEPLGAME-26OCT17NEWAVL-NEW » -> « NEW »). */
const codeDe = (marche, eventTicker) => {
  const t = String(marche?.ticker ?? '');
  return t.startsWith(`${eventTicker}-`) ? t.slice(eventTicker.length + 1) : t.split('-').pop();
};
/** Le nom d'équipe d'un marché, sans le préfixe des coupes (« Reg Time: Atletico Melilla CF »). */
const nomPropre = (s) => String(s ?? '').replace(/^\s*reg(?:ulation)?\.?\s*time\s*:\s*/i, '').trim();
const estNul = (marche, eventTicker) => codeDe(marche, eventTicker) === 'TIE' || /^tie$/i.test(nomPropre(marche?.yes_sub_title));
const pareilNom = (a, b) => nameTokens(nomPropre(a)).join(' ') === nameTokens(nomPropre(b)).join(' ') && nameTokens(nomPropre(a)).length > 0;
/**
 * L'« occurrence » d'un marché (coup d'envoi + 3 h). Les marchés antérieurs
 * à mai 2026 n'ont pas `occurrence_datetime` mais `expected_expiration_time`,
 * égal à l'occurrence partout où les deux existent (105 sur 105 en Premier
 * League).
 */
const occurrenceDe = (m) => Date.parse(m?.occurrence_datetime || m?.expected_expiration_time || '');

/** « A vs B », sans les suffixes « : Regulation Time Moneyline », « Winner? », « : Game Winner? ». */
function nomsDuTitre(titre) {
  const propre = String(titre ?? '')
    .replace(/:\s*(regulation time moneyline|game winner\??|winner\??)\s*$/i, '')
    .replace(/\s+winner\??\s*$/i, '')
    .trim();
  const parts = propre.split(/\s+vs\.?\s+/i).map((p) => nomPropre(p));
  return parts.length === 2 && parts[0] && parts[1] ? parts : null;
}

/** Le titre d'un marché de l'archive, ou la règle (« …the Liverpool vs Brentford professional… »). */
function titreDesMarches(marches) {
  for (const m of marches) if (nomsDuTitre(m.title)) return m.title;
  for (const m of marches) {
    const r = /\bthe (.+?) vs\.? (.+?) (?:professional|soccer|game|match)\b/i.exec(String(m.rules_primary ?? ''));
    if (r) return `${r[1]} vs ${r[2]}`;
  }
  return null;
}

/**
 * Qui reçoit ? Trois lectures indépendantes : le jalon (home_team_id), le
 * ticker (« 26OCT17NEWAVL » = NEW puis AVL), le titre (« Newcastle vs Aston
 * Villa »). La première qui répond fait foi ; deux lectures contraires
 * écartent l'événement.
 */
function sensDomicile({ eventTicker, titre, x, y, jalon }) {
  const lectures = [];
  const ux = x.custom_strike?.soccer_team;
  const uy = y.custom_strike?.soccer_team;
  const d = jalon?.details;
  if (d?.home_team_id && d?.away_team_id && ux && uy) {
    if (d.home_team_id === ux && d.away_team_id === uy) lectures.push({ voie: 'jalon', domicileX: true });
    else if (d.home_team_id === uy && d.away_team_id === ux) lectures.push({ voie: 'jalon', domicileX: false });
  }
  const queue = String(eventTicker.split('-')[1] ?? '').replace(/^\d{2}[A-Z]{3}\d{2}/, '');
  const cx = codeDe(x, eventTicker);
  const cy = codeDe(y, eventTicker);
  if (queue && cx && cy && cx + cy !== cy + cx) {
    if (queue === cx + cy) lectures.push({ voie: 'ticker', domicileX: true });
    else if (queue === cy + cx) lectures.push({ voie: 'ticker', domicileX: false });
  }
  const noms = nomsDuTitre(titre);
  if (noms) {
    if (pareilNom(noms[0], x.yes_sub_title) && pareilNom(noms[1], y.yes_sub_title)) lectures.push({ voie: 'titre', domicileX: true });
    else if (pareilNom(noms[0], y.yes_sub_title) && pareilNom(noms[1], x.yes_sub_title)) lectures.push({ voie: 'titre', domicileX: false });
  }
  if (!lectures.length) return { ok: false, raison: 'sens domicile/extérieur indéterminé' };
  if (lectures.some((l) => l.domicileX !== lectures[0].domicileX)) return { ok: false, raison: `sens domicile/extérieur contradictoire (${lectures.map((l) => l.voie).join(', ')})` };
  return { ok: true, domicileX: lectures[0].domicileX, voie: lectures.map((l) => l.voie).join('+') };
}

/**
 * Les trois marchés d'un match -> { home, away, nul, coup d'envoi, jour UTC,
 * résultat réglé… } ou { erreur }. `jalon` : le milestone Kalshi du match
 * (vrai coup d'envoi, clubs domicile/extérieur, report), quand il est connu.
 */
function lireRencontre({ eventTicker, series, titre, marches: brutes, jalon = null }) {
  if (!eventTicker || !Array.isArray(brutes)) return { erreur: 'événement illisible' };
  const marches = brutes.filter((m) => m && typeof m === 'object' && m.ticker);
  const nuls = marches.filter((m) => estNul(m, eventTicker));
  const equipes = marches.filter((m) => !estNul(m, eventTicker));
  if (nuls.length !== 1 || equipes.length !== 2) return { erreur: `marchés incomplets (${marches.length} au lieu de 3)` };
  const [x, y] = equipes;
  const sens = sensDomicile({ eventTicker, titre: titre ?? titreDesMarches(marches), x, y, jalon });
  if (!sens.ok) return { erreur: sens.raison };
  const [mh, ma] = sens.domicileX ? [x, y] : [y, x];
  const noms = nomsDuTitre(titre ?? titreDesMarches(marches));
  const nomDe = (m, i) => nomPropre(m.yes_sub_title) || nomPropre(noms?.[i]) || codeDe(m, eventTicker);

  const occurrence = [mh, ma, nuls[0]].map(occurrenceDe).find(Number.isFinite) ?? NaN;
  const debut = Date.parse(jalon?.start_date ?? '');
  const koOrigine = Number.isFinite(occurrence) ? occurrence - DECALAGE_OCCURRENCE_MS : null;
  let kickoff = null;
  let kickoffSource = null;
  if (Number.isFinite(debut)) {
    kickoff = debut;
    kickoffSource = 'jalon';
  } else if (koOrigine !== null) {
    kickoff = koOrigine;
    kickoffSource = 'occurrence - 3 h';
  }
  if (kickoff === null) return { erreur: "coup d'envoi inconnu" };
  const etatJalon = String(jalon?.details?.status ?? '').toLowerCase();
  const reporte = etatJalon === 'postponed';
  // Report de plus de 48 h : Kalshi règle à « un juste prix », le marché ne parle plus du match.
  const reportTropLong = reporte && (koOrigine === null || Math.abs(kickoff - koOrigine) > REPORT_MAX_MS);
  // Match terminé mais pas encore réglé : les marchés restent « active » des heures durant, prix
  // figés à 0,99/0,01 (J2 League du 04/10/2026, jalon « closed » 7 h après le coup d'envoi).
  // Ce n'est plus du direct.
  const termine = ['closed', 'ended', 'final', 'finished', 'complete', 'completed'].includes(etatJalon);

  const gagnant = marches.find((m) => String(m.result ?? '').toLowerCase() === 'yes');
  const resultat = !gagnant ? null : gagnant === mh ? '1' : gagnant === ma ? '2' : 'N';
  const ouvertures = marches.map((m) => Date.parse(m.open_time ?? '')).filter(Number.isFinite);
  const statuts = new Set(marches.map((m) => String(m.status ?? '')));

  const cote = (m, i) => ({ nom: nomDe(m, i), uuid: m.custom_strike?.soccer_team ?? null, code: codeDe(m, eventTicker), marche: m, id: null });
  return {
    sourceEvent: eventTicker,
    series,
    titre: titre ?? titreDesMarches(marches),
    home: cote(mh, 0),
    away: cote(ma, 1),
    nul: { nom: 'Tie', marche: nuls[0] },
    kickoff,
    kickoffIso: new Date(kickoff).toISOString(),
    kickoffSource,
    occurrence: Number.isFinite(occurrence) ? occurrence : null,
    date: jourUtc(kickoff),
    ouverture: ouvertures.length ? Math.min(...ouvertures) : null,
    resultat,
    actif: statuts.has('active'),
    reporte,
    reportTropLong,
    termine,
    sens: sens.voie
  };
}

/** Les jalons d'une réponse /events?with_milestones=true, par ticker d'événement. */
function indexJalons(jalons) {
  const index = new Map();
  for (const j of Array.isArray(jalons) ? jalons : []) {
    if (!j || typeof j !== 'object') continue;
    const tickers = [...(Array.isArray(j.primary_event_tickers) ? j.primary_event_tickers : []), j.details?.main_game_event_ticker];
    for (const t of tickers.filter((x) => typeof x === 'string')) if (!index.has(t)) index.set(t, j);
  }
  return index;
}

// ---------------------------------------------------------------------------
// Rattachement aux clubs du magasin
// ---------------------------------------------------------------------------

const caches = new WeakMap();
function cachesDe(database) {
  let c = caches.get(database);
  if (!c) {
    c = { annuaire: new Map(), membres: new Map(), noms: new Map() };
    caches.set(database, c);
  }
  return c;
}

/**
 * L'annuaire strict (clubDuMagasin), en cache une heure : instantané pour un
 * nom exact, 0,1 à 0,6 s pour un nom qu'il ne connaît pas (mesuré le
 * 04/10/2026) — la boucle d'avant-match repasse toutes les 5 minutes.
 */
function annuaire(nom, league, database) {
  const c = cachesDe(database).annuaire;
  const cle = `${league}|${nom}`;
  const lu = c.get(cle);
  if (lu && Date.now() - lu.at < HEURE_MS) return lu.id;
  let id = null;
  try {
    id = clubDuMagasin(nom, league, database);
  } catch {
    id = null;
  }
  c.set(cle, { at: Date.now(), id });
  return id;
}

/** Les clubs qui ont joué une compétition au magasin (gardé dix minutes). */
function membresDe(league, database) {
  const c = cachesDe(database).membres;
  const lu = c.get(league);
  if (lu && Date.now() - lu.at < 600_000) return lu.set;
  const set = new Set(
    database
      .prepare('SELECT home_id AS id FROM matches WHERE league = ? AND home_id IS NOT NULL UNION SELECT away_id FROM matches WHERE league = ? AND away_id IS NOT NULL')
      .all(league, league)
      .map((r) => r.id)
  );
  c.set(league, { at: Date.now(), set });
  return set;
}

/** Toutes les écritures connues d'un club (nom du magasin et alias), pour la règle du mot partagé. */
function nomsDuClub(teamId, database) {
  const c = cachesDe(database).noms;
  if (!c.has(teamId)) {
    let noms = [];
    try {
      noms = database.prepare('SELECT alias FROM team_aliases WHERE team_id = ?').all(teamId).map((r) => r.alias);
    } catch {
      noms = [];
    }
    c.set(teamId, noms);
  }
  return c.get(teamId);
}

/** Un mot d'au moins 4 lettres en commun (accents ôtés) : « Ind. Medellin » et « Independiente Medellín » partagent « medellin ». */
function partageUnMot(nomKalshi, ecritures) {
  const mots = new Set(nameTokens(nomKalshi).filter((m) => m.length >= 4));
  if (!mots.size) return false;
  return ecritures.some((e) => nameTokens(e).some((m) => m.length >= 4 && mots.has(m)));
}

/**
 * L'identifiant FotMob d'un club nommé par Kalshi, ou null. Dans l'ordre :
 * alias appris (nom puis UUID), UUID appris dans une autre compétition
 * (l'UUID d'équipe Kalshi est le même partout), annuaire strict via
 * sourceMatching.resolveTeamId. Un identifiant n'est retenu que pour un club
 * de la compétition (`membres`) — piège 5 de l'en-tête ; un candidat écarté
 * est rendu dans `suspect` pour le dire.
 */
function resoudreCote(cote, league, database, membres) {
  const cles = cote.uuid ? [`uuid:${cote.uuid}`] : [];
  for (const k of [cote.nom, ...cles]) {
    const id = aliasConnu(SOURCE, k, league, { database });
    if (id) return membres.has(id) ? { id, voie: 'alias' } : { id: null, suspect: id };
  }
  if (cote.uuid) {
    for (const autre of Object.keys(LIGUES)) {
      if (autre === league) continue;
      const id = aliasConnu(SOURCE, `uuid:${cote.uuid}`, autre, { database });
      if (id && membres.has(id)) {
        for (const k of [cote.nom, ...cles]) apprendreAlias(SOURCE, k, league, id, 'uuid', { database });
        return { id, voie: 'uuid' };
      }
    }
  }
  const candidat = annuaire(cote.nom, league, database);
  if (!candidat) return { id: null };
  // resolveTeamId persiste ce qu'il trouve : on ne l'appelle que pour un club de la compétition.
  if (!membres.has(candidat)) return { id: null, suspect: candidat };
  const id = resolveTeamId({ source: SOURCE, name: cote.nom, league, keys: cles, database });
  return id && membres.has(id) ? { id, voie: 'annuaire' } : { id: null, suspect: id };
}

function resoudreRencontre(r, league, database, membres) {
  const h = resoudreCote(r.home, league, database, membres);
  const a = resoudreCote(r.away, league, database, membres);
  r.home.id = h.id;
  r.away.id = a.id;
  r.home.suspect = h.suspect ?? null;
  r.away.suspect = a.suspect ?? null;
  return r;
}

// ---------------------------------------------------------------------------
// Cotes normalisées
// ---------------------------------------------------------------------------

/**
 * Les cotes d'une rencontre à un instant. `inverse` : la rencontre est
 * rangée dans le sens du calendrier FotMob quand Kalshi l'écrit à l'envers
 * (finale sur terrain neutre).
 */
function cotesDuMoment(r, { kind, releveAt, league, homeId, awayId, inverse = false, kickoff = r.kickoff, matchKey = null, provenance }) {
  const [dom, ext] = inverse ? [r.away, r.home] : [r.home, r.away];
  const sortie = [];
  for (const [selection, marche] of [['home', dom.marche], ['draw', r.nul.marche], ['away', ext.marche]]) {
    const p = probDuMarche(marche);
    if (!p) continue;
    sortie.push({
      source: SOURCE,
      sourceEvent: r.sourceEvent,
      bookmaker: BOOKMAKER,
      market: '1x2',
      selection,
      line: 0,
      price: arrondi(1 / p.prob, 3),
      prob: arrondi(p.prob, 4),
      volume: nombre(marche.volume_fp) ?? nombre(marche.volume),
      openInterest: nombre(marche.open_interest_fp) ?? nombre(marche.open_interest),
      kind,
      releveAt,
      date: jourUtc(kickoff),
      kickoff: new Date(kickoff).toISOString(),
      league,
      homeId: homeId ?? null,
      awayId: awayId ?? null,
      homeName: dom.nom,
      awayName: ext.nom,
      matchKey,
      provenance
    });
  }
  return sortie;
}

const volumeTotal = (r) => [r.home, r.nul, r.away].reduce((s, c) => s + (nombre(c.marche.volume_fp) ?? 0), 0);

// ---------------------------------------------------------------------------
// Matchs à venir et en cours
// ---------------------------------------------------------------------------

/** Les événements ouverts d'une série, marchés et jalons compris (une requête, deux au plus pour 200+ matchs). */
async function lireOuverts(series, client) {
  const rencontres = [];
  const illisibles = [];
  let curseur = '';
  let url0 = null;
  for (let page = 0; page < 5; page++) {
    const url = `${BASE}/events?series_ticker=${encodeURIComponent(series)}&status=open&with_nested_markets=true&with_milestones=true&limit=200${curseur ? `&cursor=${encodeURIComponent(curseur)}` : ''}`;
    url0 ??= url;
    const j = await client.json(url, { garder: true });
    const releveAt = new Date(heuresDeReponse.get(j) ?? Date.now()).toISOString();
    const jalons = indexJalons(j?.milestones);
    for (const e of Array.isArray(j?.events) ? j.events : []) {
      if (!e || typeof e !== 'object' || !e.event_ticker) continue;
      const r = lireRencontre({ eventTicker: e.event_ticker, series, titre: e.title, marches: e.markets ?? [], jalon: jalons.get(e.event_ticker) ?? null });
      if (r.erreur) illisibles.push(`${e.event_ticker} : ${r.erreur}`);
      else rencontres.push({ ...r, provenance: url, releveAt });
    }
    curseur = j?.cursor ?? '';
    if (!curseur) break;
  }
  return { rencontres, illisibles, url: url0 };
}

/** Les fixtures d'une compétition, avec leurs identifiants FotMob (donnés, sinon par l'annuaire). */
function preparerFixtures(liste, league, database) {
  return liste.map((f) => ({
    f,
    homeId: idFotmob(f.homeId) ?? annuaire(f.homeName, league, database),
    awayId: idFotmob(f.awayId) ?? annuaire(f.awayName, league, database),
    kickoff: Number.isFinite(Date.parse(f.kickoff ?? '')) ? Date.parse(f.kickoff) : null,
    rencontre: null,
    inverse: false
  }));
}

/** La fixture d'une rencontre Kalshi : mêmes identifiants (ou inversés), à un jour près. */
function apparier(r, fixtures) {
  let meilleur = null;
  for (const x of fixtures) {
    if (!x.homeId || !x.awayId || x.rencontre) continue;
    const ecart = ecartJours(x.f.date, r.date);
    if (ecart > 1) continue;
    let inverse;
    if (x.homeId === r.home.id && x.awayId === r.away.id) inverse = false;
    else if (x.homeId === r.away.id && x.awayId === r.home.id) inverse = true;
    else continue;
    if (!meilleur || ecart < meilleur.ecart) meilleur = { x, ecart, inverse };
  }
  return meilleur;
}

/**
 * Un seul des deux clubs reconnu (« Alaves - Atletico » : Alavés oui,
 * « Atletico » non) : la fixture du calendrier qui, à un jour près, met ce
 * club en jeu — si elle est seule et que son adversaire partage un mot d'au
 * moins 4 lettres avec le nom Kalshi (Atlético Madrid). Un club ne joue pas
 * deux matchs d'une compétition à un jour d'écart : l'identifiant connu et la
 * date décident, le mot commun confirme. Rien n'est appris (pas de résultat
 * pour le prouver) : le vote par l'issue l'apprendra une fois le match joué.
 */
function apparierParAdversaire(r, fixtures, database) {
  const [connu, inconnu] = r.home.id ? [r.home, r.away] : [r.away, r.home];
  if (!connu.id || inconnu.id) return null;
  const candidates = fixtures.filter((x) => !x.rencontre && x.homeId && x.awayId && ecartJours(x.f.date, r.date) <= 1 && (x.homeId === connu.id || x.awayId === connu.id));
  if (candidates.length !== 1) return null;
  const x = candidates[0];
  const [autreId, autreNom] = x.homeId === connu.id ? [x.awayId, x.f.awayName] : [x.homeId, x.f.homeName];
  if (!partageUnMot(inconnu.nom, [autreNom, ...nomsDuClub(autreId, database)])) return null;
  const inverse = connu === r.home ? x.homeId !== connu.id : x.awayId !== connu.id;
  return { x, ecart: ecartJours(x.f.date, r.date), inverse, parAdversaire: true };
}

/**
 * Pourquoi une fixture n'a pas de cote quand aucune rencontre Kalshi ne lui
 * correspond : un nom Kalshi non reconnu le même jour face à l'un de ses
 * clubs, une compétition sans marché ouvert, un match trop lointain.
 */
function raisonIntrouvable(x, rencontres, toutes, { enDirect = false } = {}) {
  const proches = rencontres.filter((r) => !r.paire && ecartJours(r.date, x.f.date) <= 1 && (!r.home.id || !r.away.id));
  for (const r of proches) {
    if (r.home.id && (r.home.id === x.homeId || r.home.id === x.awayId)) return `nom d'équipe non reconnu : ${r.away.nom}`;
    if (r.away.id && (r.away.id === x.homeId || r.away.id === x.awayId)) return `nom d'équipe non reconnu : ${r.home.nom}`;
  }
  const inconnus = [...new Set(proches.flatMap((r) => [!r.home.id && r.home.nom, !r.away.id && r.away.nom]).filter(Boolean))];
  const suffixe = inconnus.length ? ` (noms non reconnus ce jour-là : ${inconnus.slice(0, 4).join(', ')})` : '';
  if (enDirect) return `marché fermé ou match introuvable chez Kalshi${suffixe}`;
  // `toutes` : les rencontres ouvertes de la compétition, même hors de la période demandée.
  if (!toutes.length) return 'aucun marché ouvert chez Kalshi pour cette compétition en ce moment';
  const dernier = toutes.map((r) => r.date).sort().at(-1);
  if (x.f.date > dernier && !inconnus.length) return 'pas encore coté par Kalshi (marchés ouverts de quelques jours à deux semaines avant le match)';
  return `match introuvable chez Kalshi${suffixe}`;
}

const grouperParLigue = (fixtures) => {
  const g = new Map();
  for (const f of fixtures ?? []) {
    if (!f?.league || !LIGUES[f.league] || !/^\d{4}-\d{2}-\d{2}$/.test(String(f.date ?? '')) || !f.homeName || !f.awayName) continue;
    if (!g.has(f.league)) g.set(f.league, []);
    g.get(f.league).push(f);
  }
  return g;
};

/**
 * Lecture commune à l'avant-match et au direct : pour chaque compétition
 * couverte, les événements ouverts, rattachés aux fixtures par identifiants.
 */
async function collecter({ fixtures, database, log, enDirect }) {
  const sortie = { quotes: [], requests: 0, unresolved: [], errors: [], events: [], missing: [], parLigue: {} };
  const client = creerClient();
  const nonResolus = new Map();
  const maintenant = Date.now();
  // Kalshi muet (réseau, délai, 5xx) : les compétitions suivantes ne sont plus interrogées, la panne est dite pour chacune.
  let panne = null;
  try {
    for (const [league, liste] of grouperParLigue(fixtures)) {
      const series = LIGUES[league];
      const stat = { series, fixtures: liste.length, evenements: 0, rattaches: 0, parAdversaire: 0, cotes: 0, nonResolus: 0, manques: 0, volumes: [] };
      sortie.parLigue[league] = stat;
      const prets = preparerFixtures(liste, league, database);
      const manque = (x, reason) => {
        sortie.missing.push({ league, date: x.f.date, homeName: x.f.homeName, awayName: x.f.awayName, reason });
        stat.manques++;
      };
      const injoignable = (raison) => {
        for (const x of prets) if (!enDirect || x.kickoff === null || x.kickoff <= maintenant) manque(x, raison);
      };
      if (panne) {
        injoignable(`Kalshi n'a pas répondu (${panne})`);
        continue;
      }
      let lecture;
      try {
        lecture = await lireOuverts(series, client);
      } catch (error) {
        sortie.errors.push(`${league} (${series}) : ${error.message}`);
        if (error?.muette) panne = error.message;
        injoignable(
          error?.muette
            ? `Kalshi n'a pas répondu (${error.message})`
            : error?.definitif
              ? `Kalshi a refusé la requête (${error.message})`
              : `réponse de Kalshi inattendue (${error.message})`
        );
        continue;
      }
      for (const e of lecture.illisibles) sortie.errors.push(`${league} : ${e}`);

      // Le club d'un calendrier demandé compte comme membre : un promu n'a encore aucun match de la compétition au magasin.
      const membres = new Set([...membresDe(league, database), ...prets.flatMap((x) => [x.homeId, x.awayId]).filter(Boolean)]);
      const jours = liste.map((f) => f.date).sort();
      const horizon = [decaler(jours[0], -1), decaler(jours.at(-1), 1)];
      const rencontres = lecture.rencontres.filter((r) => r.date >= horizon[0] && r.date <= horizon[1]);
      stat.evenements = rencontres.length;

      const poser = (r, paire) => {
        if (!paire) return;
        paire.x.rencontre = r;
        paire.x.inverse = paire.inverse;
        r.paire = paire;
      };
      // 1. Les noms : alias, UUID, annuaire (un club de la compétition seulement).
      for (const r of rencontres) resoudreRencontre(r, league, database, membres);
      // 2. Les deux clubs reconnus : la fixture aux mêmes identifiants.
      for (const r of rencontres) if (r.home.id && r.away.id) poser(r, apparier(r, prets));
      // 3. Un seul club reconnu : son adversaire au calendrier, pour ce relevé seulement.
      for (const r of rencontres) if (!r.paire && Boolean(r.home.id) !== Boolean(r.away.id)) poser(r, apparierParAdversaire(r, prets, database));

      for (const r of rencontres) {
        for (const c of [r.home, r.away]) {
          if (c.id) continue;
          stat.nonResolus++;
          nonResolus.set(`${league}|${c.nom}`, { name: c.nom, league, ...(c.suspect ? { suspect: c.suspect } : {}) });
        }
        const paire = r.paire ?? null;
        if (paire?.parAdversaire) stat.parAdversaire++;
        // L'heure du calendrier FotMob quand la fixture la donne, sinon celle de Kalshi ;
        // « commencé » dès que l'une des deux est passée : jamais un prix de match pris pour de l'avant-match.
        const ko = paire?.x.kickoff ?? r.kickoff;
        const commence = Math.min(ko, r.kickoff) <= maintenant;
        // Les identifiants dans le sens de Kalshi (ceux de la fixture quand elle est trouvée).
        const [idDom, idExt] = paire ? (paire.inverse ? [paire.x.awayId, paire.x.homeId] : [paire.x.homeId, paire.x.awayId]) : [r.home.id, r.away.id];
        sortie.events.push({
          sourceEvent: r.sourceEvent,
          league,
          date: r.date,
          homeId: idDom,
          awayId: idExt,
          homeName: r.home.nom,
          awayName: r.away.nom,
          kickoff: r.kickoffIso,
          kickoffSource: r.kickoffSource,
          series,
          started: commence,
          finished: r.termine,
          postponed: r.reporte,
          fixture: paire ? { date: paire.x.f.date, homeName: paire.x.f.homeName, awayName: paire.x.f.awayName, inverse: paire.inverse, parAdversaire: Boolean(paire.parAdversaire) } : null
        });
        // Avant-match : jamais un prix relevé après le coup d'envoi (piège 1). Direct : seulement un match commencé.
        const enCours = commence && !r.termine && maintenant - Math.min(ko, r.kickoff) <= 4 * HEURE_MS;
        if (r.reportTropLong || !r.actif) continue;
        if (enDirect ? !enCours || !paire : commence) continue;
        // Rattachée : les cotes suivent le sens du calendrier FotMob (cotesDuMoment inverse les sélections au besoin).
        const cotes = cotesDuMoment(r, {
          kind: enDirect ? 'live' : 'snapshot',
          releveAt: r.releveAt,
          league,
          homeId: paire ? paire.x.homeId : r.home.id,
          awayId: paire ? paire.x.awayId : r.away.id,
          inverse: paire?.inverse ?? false,
          kickoff: ko,
          provenance: r.provenance
        });
        sortie.quotes.push(...cotes);
        stat.cotes += cotes.length;
        if (paire && cotes.length) {
          stat.rattaches++;
          stat.volumes.push(volumeTotal(r));
        }
      }

      // Ce qui manque, fixture par fixture.
      for (const x of prets) {
        if (enDirect && x.kickoff !== null && x.kickoff > maintenant) continue; // pas encore commencé : rien à reprocher
        if (!x.homeId || !x.awayId) {
          manque(x, `club absent de l'annuaire CôteMaster : ${!x.homeId ? x.f.homeName : x.f.awayName}`);
          continue;
        }
        const r = x.rencontre;
        if (!r) {
          manque(x, raisonIntrouvable(x, rencontres, lecture.rencontres, { enDirect }));
          continue;
        }
        const debut = Math.min(x.kickoff ?? r.kickoff, r.kickoff);
        if (r.reportTropLong) manque(x, 'match reporté de plus de 48 h : Kalshi le règlera à un prix arbitré, sans valeur de cote');
        else if (!r.actif) manque(x, 'marché fermé chez Kalshi');
        else if (!enDirect && r.reporte && debut <= maintenant) manque(x, 'match reporté selon Kalshi, nouvelle date inconnue : pas de cote');
        else if (!enDirect && debut <= maintenant) manque(x, 'match déjà commencé : cotes en direct seulement');
        else if (enDirect && debut > maintenant) manque(x, `pas encore commencé selon Kalshi (coup d'envoi ${heureUtc(r.kickoff)} UTC)`);
        else if (enDirect && r.termine) manque(x, 'match terminé selon Kalshi : marché en attente de règlement, plus de direct');
        else if (enDirect && maintenant - debut > 4 * HEURE_MS) manque(x, "plus de 4 h après le coup d'envoi : direct terminé");
        else if (![r.home, r.nul, r.away].some((c) => probDuMarche(c.marche))) manque(x, enDirect ? 'pas de prix en direct (carnet vide)' : 'marché sans prix (carnet vide ou écart achat/vente trop large)');
      }
      stat.volumeMedian = mediane(stat.volumes);
      delete stat.volumes;
      log({ source: SOURCE, league, ...stat });
    }
  } catch (error) {
    sortie.errors.push(String(error?.message ?? error));
  }
  sortie.unresolved = [...nonResolus.values()];
  sortie.requests = client.requetes;
  return sortie;
}

/**
 * Les prix du moment des matchs À VENIR (kind « snapshot » ; Kalshi ne donne
 * pas d'ouverture distincte avant le match). Toutes les rencontres ouvertes
 * des compétitions demandées, dans la période des fixtures, sont rendues —
 * celles qu'aucune fixture ne reconnaît gardent leurs noms et attendront le
 * rattrapage pour être rattachées.
 */
export async function collectUpcoming({ fixtures = [], database = openDb(), log = () => {} } = {}) {
  return collecter({ fixtures, database, log, enDirect: false });
}

/** Les prix EN MATCH (kind « live ») des rencontres en cours demandées. */
export async function collectLive({ fixtures = [], database = openDb(), log = () => {} } = {}) {
  return collecter({ fixtures, database, log, enDirect: true });
}

// ---------------------------------------------------------------------------
// Rattrapage des matchs joués
// ---------------------------------------------------------------------------

const issue = (h, a) => (h > a ? '1' : h < a ? '2' : 'N');

/**
 * Le résultat au temps réglementaire, celui que Kalshi règle. Après
 * prolongation, le score du magasin compte les buts de la prolongation : on
 * le recompte sur le déroulé (buts jusqu'à la 90e, arrêts de jeu compris).
 * Null quand on ne sait pas (déroulé incomplet, victoire sur tapis vert).
 */
function resultat90(m) {
  if (m.home_goals === null || m.home_goals === undefined || m.away_goals === null || m.away_goals === undefined) return null;
  if (m.reason === 'awarded_win') return null;
  if (m.reason !== 'afterextra' && m.reason !== 'afterpenalties') return issue(m.home_goals, m.away_goals);
  let buts;
  try {
    buts = JSON.parse(m.events || '[]').filter((e) => e?.type === 'goal');
  } catch {
    return null;
  }
  const dom = buts.filter((e) => e.side === 'home');
  const ext = buts.filter((e) => e.side === 'away');
  if (dom.length !== m.home_goals || ext.length !== m.away_goals) return null;
  return issue(dom.filter((e) => Number(e.minute) <= 90).length, ext.filter((e) => Number(e.minute) <= 90).length);
}

/** Les rencontres jouées d'une compétition autour d'une période, avec résultat réglementaire et coup d'envoi. */
function magasinAutour(league, de, a, database) {
  const lignes = database
    .prepare(`SELECT match_key, date, home_id, away_id, home_name, away_name, home_goals, away_goals,
                     json_extract(meta, '$.kickoff') AS kickoff, json_extract(meta, '$.reason') AS reason,
                     CASE WHEN json_extract(meta, '$.reason') IN ('afterextra', 'afterpenalties') THEN events END AS events
              FROM matches WHERE league = ? AND date >= ? AND date <= ? AND home_id IS NOT NULL AND away_id IS NOT NULL
                AND home_goals IS NOT NULL AND away_goals IS NOT NULL`)
    .all(league, de, a);
  const parDate = new Map();
  for (const m of lignes) {
    m.res90 = resultat90(m);
    if (!parDate.has(m.date)) parDate.set(m.date, []);
    parDate.get(m.date).push(m);
  }
  return {
    autour(date, jours) {
      const liste = [];
      for (let k = -jours; k <= jours; k++) liste.push(...(parDate.get(decaler(date, k)) ?? []));
      return liste;
    }
  };
}

/**
 * Lève l'ambiguïté des noms Kalshi inconnus par le RÉSULTAT réglé, faute de
 * score (Kalshi ne publie que l'issue). Parmi les rencontres du magasin à un
 * jour près dont l'issue au temps réglementaire est la même :
 *   - un côté déjà connu : celle qui l'oppose à ce club ; si elle est seule
 *     et que le club de l'autre côté partage un mot d'au moins 4 lettres
 *     avec le nom Kalshi, le nom est appris ; sans mot commun (« PSG »), elle
 *     vaut un vote, et deux votes concordants à 60 % au moins l'apprennent
 *     (comme voteAttach) ;
 *   - aucun côté connu : la rencontre doit être seule ET partager un mot des
 *     DEUX côtés.
 * Jamais de ressemblance seule : la date, l'issue et l'adversaire décident,
 * le mot commun ne fait que confirmer. Un nom proposé pour deux clubs
 * différents sans majorité nette n'est pas appris.
 */
function voteResultat({ rencontres, league, database, magasin, bilan }) {
  for (let passe = 0; passe < 2; passe++) {
    const propositions = new Map();
    const proposer = (cote, id, force) => {
      const cle = cote.uuid ? `uuid:${cote.uuid}` : `nom:${cote.nom}`;
      const p = propositions.get(cle) ?? { cotes: [], ids: new Map(), mot: new Set() };
      p.cotes.push(cote);
      p.ids.set(id, (p.ids.get(id) ?? 0) + 1);
      if (force === 'mot') p.mot.add(id);
      propositions.set(cle, p);
    };
    for (const r of rencontres) {
      if (!r.resultat || (r.home.id && r.away.id)) continue;
      const h = r.home.id;
      const a = r.away.id;
      const candidates = magasin.autour(r.date, 1).filter((m) => m.res90 === r.resultat && (!h || m.home_id === h) && (!a || m.away_id === a));
      const motDom = (m) => partageUnMot(r.home.nom, [m.home_name, ...nomsDuClub(m.home_id, database)]);
      const motExt = (m) => partageUnMot(r.away.nom, [m.away_name, ...nomsDuClub(m.away_id, database)]);
      if (!h && !a) {
        const sures = candidates.filter((m) => motDom(m) && motExt(m));
        if (sures.length === 1) {
          proposer(r.home, sures[0].home_id, 'mot');
          proposer(r.away, sures[0].away_id, 'mot');
        }
        continue;
      }
      if (candidates.length !== 1) continue;
      const m = candidates[0];
      if (!h) proposer(r.home, m.home_id, motDom(m) ? 'mot' : 'adversaire');
      if (!a) proposer(r.away, m.away_id, motExt(m) ? 'mot' : 'adversaire');
    }
    let appris = 0;
    for (const p of propositions.values()) {
      const tri = [...p.ids.entries()].sort((x, y) => y[1] - x[1]);
      const total = tri.reduce((s, [, n]) => s + n, 0);
      const [id, n] = tri[0];
      const unanime = tri.length === 1;
      const ok = (unanime && (p.mot.has(id) || n >= 2)) || (!unanime && n >= 2 && n / total >= 0.6);
      if (!ok) continue;
      const noms = [...new Set(p.cotes.map((c) => c.nom))];
      const uuid = p.cotes[0].uuid;
      for (const k of [...noms, ...(uuid ? [`uuid:${uuid}`] : [])]) apprendreAlias(SOURCE, k, league, id, 'vote-resultat', { database });
      bilan.appris.push({ noms, id, preuve: p.mot.has(id) ? 'issue + mot commun' : `issue + adversaire (${n} votes)` });
      appris++;
      for (const r of rencontres) {
        for (const c of [r.home, r.away]) {
          if (!c.id && (noms.includes(c.nom) || (uuid && c.uuid === uuid))) {
            c.id = id;
            c.suspect = null;
          }
        }
      }
    }
    if (!appris) break;
  }
}

/** Le curseur du rattrapage : phase (récent / archive), page Kalshi, prochain événement. */
function lireCurseur(texte) {
  const defaut = { v: 1, phase: 'recent', page: '', prochain: null, i: 0, vu: null };
  if (!texte) return defaut;
  try {
    const c = JSON.parse(texte);
    return c && (c.phase === 'recent' || c.phase === 'archive') ? { ...defaut, ...c } : defaut;
  } catch {
    return defaut;
  }
}

/**
 * Une page du rattrapage. Récent : /events réglés, marchés imbriqués (un
 * événement sans marché est passé sous la coupure : à lire dans l'archive).
 * Archive : /historical/markets, regroupés par événement ; un événement
 * coupé en bout de page est complété par son ticker.
 */
async function lirePage(curseur, series, client) {
  if (curseur.phase === 'recent') {
    const url = `${BASE}/events?series_ticker=${encodeURIComponent(series)}&status=settled&with_nested_markets=true&limit=${PAGE_EVENEMENTS}${curseur.page ? `&cursor=${encodeURIComponent(curseur.page)}` : ''}`;
    const j = await client.json(url);
    const evenements = (Array.isArray(j?.events) ? j.events : [])
      .filter((e) => e && typeof e === 'object' && e.event_ticker)
      .map((e) => ({ ticker: e.event_ticker, titre: e.title, marches: Array.isArray(e.markets) ? e.markets : [] }));
    const dernierSansMarche = evenements.length > 0 && !evenements.at(-1).marches.length;
    return { url, evenements, suivant: j?.cursor || null, finDePhase: !j?.cursor || dernierSansMarche };
  }
  const url = `${BASE}/historical/markets?series_ticker=${encodeURIComponent(series)}&limit=${PAGE_MARCHES}${curseur.page ? `&cursor=${encodeURIComponent(curseur.page)}` : ''}`;
  const j = await client.json(url);
  const groupes = new Map();
  for (const m of Array.isArray(j?.markets) ? j.markets : []) {
    if (!m?.event_ticker) continue;
    if (!groupes.has(m.event_ticker)) groupes.set(m.event_ticker, []);
    groupes.get(m.event_ticker).push(m);
  }
  const evenements = [...groupes.entries()].map(([ticker, marches]) => ({ ticker, titre: null, marches }));
  return { url, evenements, suivant: j?.cursor || null, finDePhase: !j?.cursor };
}

/**
 * Les bougies d'avant-match d'une rencontre : horaires de l'ouverture à
 * l'heure pleine qui précède le coup d'envoi, puis minute par minute jusqu'au
 * coup d'envoi. Rend, par sélection, la liste triée { t, prob, vol, oi } et
 * l'URL lue. Récent : une requête par période pour les trois marchés ;
 * archive : une par marché.
 */
async function bougiesAvantMatch({ r, series, archive, kickoff, client }) {
  const ko = Math.floor(kickoff / 1000);
  const heurePleine = ko - (ko % 3600);
  const debut = Math.floor((r.ouverture ?? kickoff - 14 * JOUR_MS) / 1000);
  const periodes = [{ de: debut, a: ko, pas: 60 }];
  if (ko > heurePleine) periodes.push({ de: heurePleine, a: ko, pas: 1 });
  const parTicker = new Map();
  const ajouter = (ticker, bougies, pas, url) => {
    const liste = parTicker.get(ticker) ?? [];
    for (const b of bougies ?? []) {
      const t = nombre(b?.end_period_ts);
      if (t === null || t > ko) continue;
      // Les bougies horaires s'arrêtent à l'heure pleine ; la dernière heure vient des bougies minute.
      if (pas === 60 && t > heurePleine) continue;
      if (pas === 1 && t <= heurePleine) continue;
      const champ = (o, nom) => nombre(o?.[`${nom}_dollars`] ?? o?.[nom]);
      liste.push({
        t,
        prob: probabiliteDe({ achat: champ(b.yes_bid, 'close'), vente: champ(b.yes_ask, 'close'), dernier: champ(b.price, 'close') }),
        vol: nombre(b.volume_fp ?? b.volume) ?? 0,
        oi: nombre(b.open_interest_fp ?? b.open_interest),
        url
      });
    }
    parTicker.set(ticker, liste);
  };
  for (const p of periodes) {
    const params = `start_ts=${p.de}&end_ts=${p.a}&period_interval=${p.pas}`;
    if (!archive) {
      const url = `${BASE}/series/${encodeURIComponent(series)}/events/${encodeURIComponent(r.sourceEvent)}/candlesticks?${params}`;
      const j = await client.json(url);
      (j?.market_tickers ?? []).forEach((ticker, k) => ajouter(ticker, j?.market_candlesticks?.[k], p.pas, url));
    } else {
      for (const c of [r.home, r.nul, r.away]) {
        const url = `${BASE}/historical/markets/${encodeURIComponent(c.marche.ticker)}/candlesticks?${params}`;
        const j = await client.json(url);
        ajouter(c.marche.ticker, j?.candlesticks, p.pas, url);
      }
    }
  }
  for (const liste of parTicker.values()) liste.sort((x, y) => x.t - y.t);
  return parTicker;
}

/** Nombre de requêtes de bougies d'une rencontre (pour ne jamais dépasser le budget). */
const requetesBougies = (archive, kickoff) => (archive ? 3 : 1) * (Math.floor(kickoff / 1000) % 3600 ? 2 : 1);
/** Le pire cas : trois marchés d'archive, bougies horaires puis minute. */
const MAX_BOUGIES = 6;

/**
 * Ouverture et clôture d'une sélection depuis ses bougies : la première et la
 * dernière avec un prix utilisable avant le coup d'envoi ; le volume est la
 * somme des bougies jusque-là (jamais le volume final, gonflé par le match).
 */
function ouvertureCloture(bougies) {
  let cumul = 0;
  let ouverture = null;
  let cloture = null;
  for (const b of bougies ?? []) {
    cumul += b.vol;
    if (!b.prob) continue;
    const point = { t: b.t, prob: b.prob.prob, volume: arrondi(cumul, 2), oi: b.oi, url: b.url };
    if (!ouverture) ouverture = point;
    cloture = point;
  }
  return { ouverture, cloture };
}

/**
 * Rattrapage de l'historique d'une compétition, par tranches de `budget`
 * requêtes. D'abord les matchs réglés après la coupure (/events), puis
 * l'archive (/historical/markets), du plus récent au plus ancien. Chaque
 * rencontre réglée est rattachée au magasin (alias, annuaire, puis vote par
 * l'issue), son issue vérifiée, et rend l'ouverture et la clôture de ses
 * trois sélections. Idempotent : rejouer une tranche rend les mêmes cotes.
 */
export async function backfill({ league, database = openDb(), budget = 40, state = null, log = () => {} } = {}) {
  const bilan = {
    league,
    series: LIGUES[league] ?? null,
    phase: null,
    events: 0,
    attached: 0,
    unmatched: 0,
    unresolvedNames: [],
    sansCote: 0,
    resultatDifferent: 0,
    sansResultat: 0,
    inverses: 0,
    illisibles: [],
    appris: [],
    ecartsCoupEnvoi: {},
    exemples: [],
    errors: []
  };
  const series = LIGUES[league];
  if (!series) return { quotes: [], requests: 0, cursor: null, done: true, bilan: { ...bilan, note: 'compétition non couverte par Kalshi' } };
  const client = creerClient({ budget: Math.max(0, Number(budget) || 0) });
  const quotes = [];
  let curseur = lireCurseur(state?.cursor);
  let done = false;
  const nonResolus = new Set();
  try {
    const membres = membresDe(league, database);
    while (!done) {
      if (client.reste() < 2) break;
      bilan.phase = curseur.phase;
      let page;
      try {
        page = await lirePage(curseur, series, client);
      } catch (error) {
        // Un curseur de page refusé (périmé ?) : la phase repart du début plutôt que de rester bloquée.
        if (!error?.definitif || !curseur.page) throw error;
        bilan.errors.push(`page refusée (${error.message}) : reprise de la phase « ${curseur.phase} » au début`);
        curseur = { ...curseur, page: '', prochain: null, i: 0 };
        continue;
      }
      const archive = curseur.phase === 'archive';
      // Le prochain événement à traiter, retrouvé par son ticker : une page relue a pu bouger (nouveaux matchs réglés en tête).
      let i = curseur.prochain ? page.evenements.findIndex((e) => e.ticker === curseur.prochain) : -1;
      if (i < 0) i = Math.min(curseur.i ?? 0, page.evenements.length);

      // Lecture de toute la page (le vote a besoin de tous les noms), sans requête.
      const rencontres = [];
      for (const e of page.evenements) {
        if (!e.marches.length) {
          rencontres.push(null);
          continue;
        }
        const r = lireRencontre({ eventTicker: e.ticker, series, titre: e.titre, marches: e.marches });
        if (r.erreur) {
          rencontres.push({ erreur: r.erreur, sourceEvent: e.ticker });
          continue;
        }
        rencontres.push(r);
      }
      const lisibles = rencontres.filter((r) => r && !r.erreur);
      // Le magasin autour des jours de la page (lus sur tous les marchés, même ceux d'un événement incomplet).
      const jours = page.evenements
        .flatMap((e) => e.marches.map(occurrenceDe))
        .filter(Number.isFinite)
        .map((t) => jourUtc(t - DECALAGE_OCCURRENCE_MS))
        .sort();
      const magasin = jours.length ? magasinAutour(league, decaler(jours[0], -4), decaler(jours.at(-1), 4), database) : null;
      for (const r of lisibles) resoudreRencontre(r, league, database, membres);
      if (magasin && lisibles.length) voteResultat({ rencontres: lisibles, league, database, magasin, bilan });

      for (; magasin && i < page.evenements.length; i++) {
        const e = page.evenements[i];
        // Position tenue à jour : une panne au milieu d'une rencontre reprendra à celle-ci.
        curseur.prochain = e.ticker;
        curseur.i = i;
        let r = rencontres[i];
        if (!r) continue; // événement passé sous la coupure : lu dans l'archive
        if (archive && e.ticker === curseur.vu) continue; // déjà traité en bout de page précédente
        // Un événement coupé en bout de page n'est marqué « vu » qu'une fois traité : remis à
        // plus tard faute de budget, il doit être repris, pas sauté.
        const enBout = archive && i === page.evenements.length - 1;
        const consommer = () => {
          if (enBout) curseur.vu = e.ticker;
        };
        if (r.erreur) {
          // Un événement coupé par la pagination de l'archive : ses autres marchés sont sur la page voisine.
          if (!(archive && e.marches.length < 3 && /marchés incomplets/.test(r.erreur))) {
            bilan.illisibles.push(`${e.ticker} : ${r.erreur}`);
            consommer();
            continue;
          }
          if (client.reste() < 1 + MAX_BOUGIES) break;
          const complet = await client.json(`${BASE}/historical/markets?event_ticker=${encodeURIComponent(e.ticker)}`);
          const relu = lireRencontre({ eventTicker: e.ticker, series, titre: null, marches: complet?.markets ?? [] });
          if (relu.erreur) {
            bilan.illisibles.push(`${e.ticker} : ${relu.erreur}`);
            consommer();
            continue;
          }
          r = resoudreRencontre(relu, league, database, membres);
        }
        // La rencontre du magasin : mêmes identifiants à trois jours près (un match avancé ou
        // décalé garde la date prévue chez Kalshi), la plus proche ; dans l'autre sens, à un
        // jour près seulement (terrain neutre), pour ne jamais prendre le match retour.
        const trouve =
          r.home.id && r.away.id
            ? magasin
                .autour(r.date, 3)
                .map((m) => ({ m, inverse: m.home_id === r.away.id && m.away_id === r.home.id }))
                .filter(({ m, inverse }) => (inverse ? ecartJours(m.date, r.date) <= 1 : m.home_id === r.home.id && m.away_id === r.away.id))
                .sort((x, y) => ecartJours(x.m.date, r.date) - ecartJours(y.m.date, r.date) || Number(x.inverse) - Number(y.inverse))[0]
            : null;
        const koMagasin = trouve ? Date.parse(trouve.m.kickoff ?? '') : NaN;
        const kickoff = Number.isFinite(koMagasin) ? koMagasin : r.kickoff;
        // Le budget se vérifie AVANT de compter : une rencontre remise à plus tard sera comptée à la tranche suivante.
        if (trouve && r.resultat && client.reste() < requetesBougies(archive, kickoff)) break;
        bilan.events++;
        if (!trouve) {
          bilan.unmatched++;
          for (const c of [r.home, r.away]) if (!c.id) nonResolus.add(c.nom);
          consommer();
          continue;
        }
        const { m, inverse } = trouve;
        // Aucune issue « yes » : Kalshi a réglé le marché à un prix arbitré (match annulé ou
        // reporté de plus de 48 h) ; ses prix ne disent rien de la rencontre du magasin.
        if (!r.resultat) {
          bilan.sansResultat++;
          consommer();
          continue;
        }
        const issueKalshi = inverse ? { 1: '2', 2: '1', N: 'N' }[r.resultat] : r.resultat;
        // L'issue du magasin au temps réglementaire doit être celle que Kalshi a réglée.
        if (m.res90 && m.res90 !== issueKalshi) {
          bilan.resultatDifferent++;
          consommer();
          continue;
        }
        if (Number.isFinite(koMagasin) && r.occurrence) {
          const cle = `${arrondi((r.occurrence - koMagasin) / HEURE_MS, 2)} h`;
          bilan.ecartsCoupEnvoi[cle] = (bilan.ecartsCoupEnvoi[cle] ?? 0) + 1;
        }
        let bougies;
        try {
          bougies = await bougiesAvantMatch({ r, series, archive, kickoff, client });
        } catch (error) {
          // Refus définitif (4xx) : la rencontre est notée et passée, sinon le rattrapage y resterait bloqué.
          if (!error?.definitif) throw error;
          bilan.errors.push(`${r.sourceEvent} : bougies refusées (${error.message})`);
          consommer();
          continue;
        }
        consommer();
        bilan.attached++;
        if (inverse) bilan.inverses++;
        const [dom, ext] = inverse ? [r.away, r.home] : [r.home, r.away];
        const avant = quotes.length;
        for (const [selection, cote] of [['home', dom], ['draw', r.nul], ['away', ext]]) {
          const { ouverture, cloture } = ouvertureCloture(bougies.get(cote.marche.ticker));
          for (const [kind, point] of [['open', ouverture], ['close', cloture]]) {
            if (!point) continue;
            quotes.push({
              source: SOURCE,
              sourceEvent: r.sourceEvent,
              bookmaker: BOOKMAKER,
              market: '1x2',
              selection,
              line: 0,
              price: arrondi(1 / point.prob, 3),
              prob: arrondi(point.prob, 4),
              volume: point.volume,
              openInterest: point.oi,
              kind,
              releveAt: new Date(point.t * 1000).toISOString(),
              date: jourUtc(kickoff),
              kickoff: new Date(kickoff).toISOString(),
              league,
              homeId: m.home_id,
              awayId: m.away_id,
              homeName: dom.nom,
              awayName: ext.nom,
              matchKey: m.match_key,
              provenance: point.url
            });
          }
        }
        if (quotes.length === avant) bilan.sansCote++;
        if (bilan.exemples.length < 2 && quotes.length > avant) {
          bilan.exemples.push({
            sourceEvent: r.sourceEvent,
            kalshi: `${dom.nom} - ${ext.nom}`,
            issueKalshi,
            matchKey: m.match_key,
            magasin: `${m.home_name} ${m.home_goals}-${m.away_goals} ${m.away_name} (${m.date}, coup d'envoi ${m.kickoff ?? '?'})`,
            res90: m.res90,
            cotes: quotes.slice(avant).map((q) => `${q.kind} ${q.selection} ${q.prob} (${q.price}) vol ${q.volume} @ ${q.releveAt}`)
          });
        }
      }
      if (!magasin) {
        // Page sans aucune date lisible : notée et passée.
        for (const e of page.evenements.slice(i)) bilan.illisibles.push(`${e.ticker} : aucune date de match`);
        i = page.evenements.length;
      }
      if (i < page.evenements.length) {
        // Budget épuisé au milieu de la page : on reprendra à cet événement.
        curseur = { ...curseur, prochain: page.evenements[i]?.ticker ?? null, i };
        break;
      }
      if (!page.finDePhase && page.suivant) curseur = { ...curseur, page: page.suivant, prochain: null, i: 0 };
      else if (curseur.phase === 'recent') curseur = { v: 1, phase: 'archive', page: '', prochain: null, i: 0, vu: null };
      else done = true;
      log({ source: SOURCE, league, phase: curseur.phase, requests: client.requetes, quotes: quotes.length });
    }
  } catch (error) {
    if (!(error instanceof BudgetEpuise)) bilan.errors.push(String(error?.message ?? error));
  }
  bilan.unresolvedNames = [...nonResolus].sort();
  return { quotes, requests: client.requetes, cursor: done ? null : JSON.stringify(curseur), done, bilan };
}

export const __testing = { lireRencontre, probabiliteDe, nomsDuTitre, sensDomicile, resultat90, ouvertureCloture, partageUnMot, idFotmob, requetesBougies, DECALAGE_OCCURRENCE_MS, ECART_MAX };
