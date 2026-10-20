/**
 * marketKnowledge.js — CONNAÎTRE LE MARCHÉ et le MEILLEUR MOMENT POUR PARIER (étape 22 du plan, 13/10/2026).
 * -----------------------------------------------------------------------
 * Sur TOUTES les cotes archivées (l'historique football-data depuis 2000 — fd_history —, les cotes
 * gratuites — ESPN, 365Scores, Kalshi, Smarkets, football-data depuis 2023 — et vos cotes payantes —
 * The Odds API —, toutes dans odds_quotes), pour chaque bookmaker :
 *   - sa JUSTESSE : perte log (le juge) et Brier (témoin) de ses probabilités justes face au résultat
 *     de la 90e minute, marge retirée par la MÉTHODE PUISSANCE (core/market/marginRemoval.js) — toujours
 *     sur les MÊMES matchs : deux livres ne se comparent que sur les matchs que TOUS LES DEUX cotent
 *     (un livre absent d'un match n'avantage personne) ;
 *   - sa VITESSE : qui bouge en premier vers la clôture — au même instant pour tous (le relevé du
 *     vendredi ou du mardi de football-data ; trois heures avant le coup d'envoi pour les relevés
 *     datés), quelle part du mouvement du marché jusqu'à la clôture un livre a-t-il déjà faite ?
 *   - ses BIAIS : outsiders, nuls, domicile, grandes équipes (annoncé face au réalisé) ;
 *   - sa MARGE, par championnat et par moment.
 * Et, par championnat, le MEILLEUR MOMENT pour parier : tôt (l'ouverture, OU le relevé du vendredi/
 * mardi — jamais confondus), après les compositions, ou juste avant le coup d'envoi, chaque moment
 * comparé à la clôture (la valeur de clôture : cote prise × probabilité juste de clôture − 1).
 *
 * Toute comparaison « A plus juste que B », « A bouge avant B », « tôt vaut mieux que tard » passe par
 * le JUGE de l'étape 16 (bench/guard.js, comparer) : lignes appariées par match, blocs par match,
 * fourchette élargie par le nombre de comparaisons jugées (K = toutes celles de la mesure : paires
 * jugées × championnats, les deux lectures de la justesse comprises), « pas assez de matchs » sous 200
 * matchs. Le MENEUR d'un tableau est celui qui bat le plus d'autres livres sur leurs matchs communs ; il
 * est jugé face à chacun. Chaque chiffre porte son nombre de matchs.
 * « Déjà vu » : chaque jugement dit la part de ses lignes dans les fenêtres déclarées du code
 * (bench/lancements.js, fenetresDeclarees) — le 23/09 a regardé la justesse des bookmakers sur
 * 07/2023 → 23/09/2026 (les trois fenêtres contiguës du 23/09) ; la justesse est aussi jugée sur les
 * seules lignes JAMAIS VUES (« preuve au banc »).
 *
 * LES PRIX D'ÉCHANGE (bourses : Kalshi, Smarkets, Betfair Exchange de football-data, les bourses de
 * The Odds API) ne sont PAS des cotes à marge : leurs probabilités sont simplement ramenées à 100 %
 * (jamais la méthode puissance), elles n'ont pas de marge mais une commission (celle de valueFinder.js,
 * lue par coteJouable : Betfair 5 %, Smarkets et Matchbook 2 %), et un prix « milieu du carnet » (Kalshi,
 * Smarkets) n'est pas un prix jouable : jamais de valeur de clôture dessus. Le « maximum du marché »
 * de football-data n'est pas un bookmaker : écarté partout.
 *
 * OÙ ÇA VIT. Tables market_knowledge_runs (une ligne par calcul : empreinte des sources, bilan, résumé
 * lisible) et market_knowledge (le résumé chiffré du DERNIER calcul fini), dans matchStatsDb.js.
 * ÉCRIT par le serveur seul (étape « connaitreMarche » de l'actualisation, sous son verrou) ou par
 * scripts/market-knowledge.mjs dans le bac. Le calcul tourne dans un PROCESSUS À PART, base en lecture
 * seule (marketKnowledgeEnfant.js) ; le serveur range ensuite le résultat, par tranches, en rendant la
 * main. Rien de neuf dans les sources (empreinte identique) : rien n'est recalculé.
 * LU par les étapes 23 (où parier) et 31 (page « Bookmakers ») : lireConnaissanceDuMarche,
 * livreLePlusJuste, meilleurMomentDe, margeDe (en bas du fichier). MESURÉ SEULEMENT : le moteur ne lit
 * rien d'ici, aucun chiffre de l'appli ne change.
 * -----------------------------------------------------------------------
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { removeMargin } from '../core/market/marginRemoval.js';
import { coteJouable } from '../core/engine/valueFinder.js';
import { COMPOS_ANNONCEES_MINUTES } from '../core/engine/fraicheurCotes.js';
import { titreBookmaker } from '../core/engine/vosBookmakers.js';
import { comparer } from '../bench/guard.js';
import { perteLog, brier } from '../bench/metrics.js';
import { fenetresDeclarees } from '../bench/lancements.js';
import { FD_SAISONNIERS, FD_PAYS } from './providers/footballDataOdds.js';
import { SOURCES_PAYANTES, SOURCES_SAISIES } from './db/oddsQuotesRepository.js';
import { openDb, resolveDbPath } from './db/matchStatsDb.js';
import { creerPauses, executerSansPause, executerEnRendantLaMain, rendreLaMainParDefaut } from '../utils/travailCooperatif.js';

// ================================================================ réglages, écrits ici

/** Forme du calcul : deux calculs de versions différentes ne se comparent pas (une nouvelle version recalcule tout). */
export const VERSION_CONNAISSANCE = 1;
/** Le juge ne conclut jamais sous 200 matchs (étape 16) ; une case plus maigre est montrée, jamais jugée. */
export const MIN_MATCHS = 200;
export const TIRAGES = 1000;

/** Les MOMENTS d'un prix, jamais mélangés. */
export const MOMENTS = Object.freeze({
  cloture: 'à la clôture (le dernier prix avant le coup d’envoi)',
  releve: 'au relevé du vendredi ou du mardi (football-data, un à trois jours avant)',
  ouverture: 'à l’ouverture (le premier prix publié, heure inconnue pour l’historique)',
  'releve-payant': 'à votre relevé payant (The Odds API, l’heure du clic)',
  'h-3': 'trois heures avant le coup d’envoi (relevés datés)',
  'apres-compos': 'après l’annonce des compositions (45 minutes avant le coup d’envoi, relevés datés)',
  'juste-avant': 'juste avant le coup d’envoi (dernier relevé daté, au plus 15 minutes avant)'
});
const LISTE_MOMENTS = Object.freeze(Object.keys(MOMENTS));
const IM = Object.freeze(Object.fromEntries(LISTE_MOMENTS.map((m, i) => [m, i])));
/** Les moments où se mesure la justesse (un tableau chacun). */
export const MOMENTS_DE_JUSTESSE = Object.freeze(['cloture', 'releve', 'ouverture', 'releve-payant']);
/** La vitesse : du moment tôt (le même instant pour tous les livres) au moment de clôture. */
export const PAIRES_DE_VITESSE = Object.freeze([Object.freeze(['releve', 'cloture']), Object.freeze(['h-3', 'juste-avant'])]);
/** Le meilleur moment : chaque paire (tôt, tard) jugée sur les mêmes livres et les mêmes matchs. */
export const PAIRES_DE_MOMENTS = Object.freeze(
  [['releve', 'juste-avant'], ['ouverture', 'juste-avant'], ['apres-compos', 'juste-avant'], ['releve', 'apres-compos'], ['ouverture', 'apres-compos']].map((p) => Object.freeze(p))
);
/** Les biais mesurés : l'annoncé (probabilité juste du livre) face au réalisé. */
export const CATEGORIES_DE_BIAIS = Object.freeze({
  outsiders: 'la victoire de l’outsider (l’équipe la moins probable selon le livre)',
  nuls: 'le match nul',
  domicile: 'la victoire à domicile',
  'grandes-equipes': 'la victoire d’une grande équipe (un des 3 premiers de la saison d’avant) face à une autre'
});
/** Les compositions sont annoncées une heure avant (fraicheurCotes.js) : « après les compos » = un quart d'heure après l'annonce. */
export const AVANCE_APRES_COMPOS_MINUTES = COMPOS_ANNONCEES_MINUTES - 15;
export const AVANCE_H3_MINUTES = 180;
export const FRAICHEUR_JUSTE_AVANT_MINUTES = 15;
/** Une bourse dont la somme des probabilités s'écarte de 100 % de plus de 6 points (comme MARGE_MAX_BOURSE de valueFinder.js) : prix fictifs. */
export const ECART_MAX_BOURSE = 0.06;
/** Une grande équipe : un des 3 premiers de la saison d'avant, si cette saison compte au moins 10 matchs par équipe. */
export const GRANDES_EQUIPES = Object.freeze({ rang: 3, matchsParEquipe: 10 });

/** Le 23/09 : « Pinnacle est le plus juste de tous » (valueFinder.js), avant-match football-data, 18 championnats rattachés. */
export const FENETRE_23_09 = Object.freeze({ de: '2023-07-01', a: '2026-09-23' });
export const REFERENCE_23_09 = Object.freeze({
  livre: 'fd|Pinnacle',
  perteLog: 0.9925,
  matchs: 15_885,
  matchsDuPanier: 20_914,
  source: 'valueFinder.js (mesure du 23/09/2026) : Pinnacle, perte log 0,9925 sur 15 885 matchs, avant-match football-data de 18 championnats rattachés au magasin, 07/2023 → 09/2026 ; personne ne fait significativement mieux'
});
/** Les livres du panier du 23/09 (les quatre d'avant-match de fd_history). */
const LIVRES_23_09 = Object.freeze(['fd|Moyenne du marché', 'fd|Pinnacle', 'fd|Bet365', 'fd|William Hill']);

// ================================================================ les livres

/** Un livre « composite » : une moyenne de bookmakers, pas un bookmaker (gardé comme repère). */
export const COMPOSITES = Object.freeze(new Set(['fd|Moyenne du marché']));
/** Écartés partout, et pourquoi. */
export const LIVRES_ECARTES = Object.freeze({
  'fd|Maximum du marché': 'la meilleure cote de chaque issue prise chez des bookmakers différents : un prix qu’on ne trouve à aucun endroit, dont la somme passe sous 100 % dans 15 à 36 % des matchs'
});
const NOMS_DES_FAMILLES = Object.freeze({ fd: 'football-data', espn: 'ESPN', '365scores': '365Scores', kalshi: 'Kalshi', smarkets: 'Smarkets', 'odds-api': 'vos bookmakers' });
/** Les bourses des sources gratuites : la clé de valueFinder.js qui donne la commission, et si leur prix se joue. */
const BOURSES_DES_SOURCES = Object.freeze({
  'fd|Betfair Exchange': Object.freeze({ cleBourse: 'betfair_ex_eu', prixJouable: true, prix: 'cote d’achat de la bourse Betfair (football-data)' }),
  'smarkets|Smarkets': Object.freeze({ cleBourse: 'smarkets', prixJouable: false, prix: 'milieu du carnet achat/vente : pas un prix qu’on obtient' }),
  'kalshi|Kalshi': Object.freeze({
    cleBourse: null,
    prixJouable: false,
    prix: 'milieu du carnet achat/vente : pas un prix qu’on obtient',
    frais: 'frais Kalshi ≈ 0,07 × p × (1 − p) par contrat, payés à l’achat (pas une commission sur le gain)'
  })
});

/** La commission d'une bourse telle que valueFinder.js la déduit (coteJouable) ; 0 pour un bookmaker. */
export function commissionDeValueFinder(cle) {
  const nette = coteJouable({ key: cle, odds1: 3, oddsDraw: 3, odds2: 3 }, 'odds1');
  return Math.round((1 - (nette - 1) / 2) * 1e6) / 1e6;
}

/** La description d'un livre (« famille|bookmaker ») ; null pour un livre écarté. */
export function decrireLivre(cle) {
  if (typeof cle !== 'string' || !cle.includes('|') || LIVRES_ECARTES[cle]) return null;
  const i = cle.indexOf('|');
  const famille = cle.slice(0, i);
  const bookmaker = cle.slice(i + 1);
  let bourse = BOURSES_DES_SOURCES[cle] ?? null;
  if (!bourse && famille === 'odds-api' && commissionDeValueFinder(bookmaker) > 0) {
    bourse = { cleBourse: bookmaker, prixJouable: true, prix: 'cote d’achat de la bourse (relevé The Odds API)' };
  }
  const type = bourse ? 'bourse' : COMPOSITES.has(cle) ? 'composite' : 'bookmaker';
  const nomFamille = NOMS_DES_FAMILLES[famille] ?? famille;
  const titre =
    famille === 'odds-api' ? `${titreBookmaker(bookmaker)} (vos bookmakers)` : bookmaker.toLowerCase() === nomFamille.toLowerCase() ? `${bookmaker} (bourse)` : `${bookmaker} (${nomFamille})`;
  return Object.freeze({
    cle,
    famille,
    bookmaker,
    titre,
    type,
    commission: bourse?.cleBourse ? commissionDeValueFinder(bourse.cleBourse) : null,
    prixJouable: type !== 'bourse' || Boolean(bourse.prixJouable),
    prix: bourse?.prix ?? (type === 'composite' ? 'moyenne des cotes des bookmakers' : 'cote du bookmaker'),
    frais: bourse?.frais ?? null
  });
}

// ================================================================ règles pures

/**
 * Les probabilités JUSTES d'un 1N2 (domicile, nul, extérieur) :
 *   - bookmaker et composite : removeMargin (méthode puissance) ; `marge` = somme des 1/cote − 1, en %
 *     (non arrondie) ; `anomalie` : marge négative ou au-delà de 35 % (marginRemoval.js) ;
 *   - bourse : les probabilités brutes (`probs` quand la source les donne — Kalshi, Smarkets —, sinon
 *     1/cote) ramenées à 100 %, JAMAIS la méthode puissance ; pas de marge (`marge` null) ; `ecartA100` :
 *     la somme brute − 100 %, en points ; `anomalie` : plus de 6 points d'écart (prix fictifs).
 * null quand une issue manque. Pure.
 */
export function probabilitesJustes({ prix, probs = null, type }) {
  if (type === 'bourse') {
    const q = [0, 1, 2].map((i) => {
      const p = probs?.[i];
      if (Number.isFinite(p) && p > 0 && p < 1) return p;
      const o = prix?.[i];
      return Number.isFinite(o) && o > 1 ? 1 / o : Number.NaN;
    });
    if (!q.every((x) => x > 0)) return null;
    const s = q[0] + q[1] + q[2];
    return { p: [q[0] / s, q[1] / s, q[2] / s], marge: null, ecartA100: (s - 1) * 100, anomalie: Math.abs(s - 1) > ECART_MAX_BOURSE };
  }
  if (!Array.isArray(prix) || prix.length !== 3 || !prix.every((o) => Number.isFinite(o) && o > 1)) return null;
  const r = removeMargin(prix);
  return { p: r.probabilities, marge: (1 / prix[0] + 1 / prix[1] + 1 / prix[2] - 1) * 100, ecartA100: null, anomalie: r.anomaly };
}

/** La cote qu'on touche vraiment : une bourse retient sa commission sur le gain (coteJouable de valueFinder.js). */
export const prixNet = (prix, livre) => (livre?.type === 'bourse' && livre.commission ? 1 + (prix - 1) * (1 - livre.commission) : prix);

/**
 * La VALEUR DE CLÔTURE d'un prix pris à un moment : la moyenne, sur les trois issues, de cote nette ×
 * probabilité juste de clôture − 1 (un pari d'une unité sur une issue prise au hasard, vu avec
 * l'information de la dernière minute). Rend aussi celle de chaque issue. Pure.
 */
export function valeurDeCloture(prix, pref, livre) {
  const v = [0, 1, 2].map((i) => prixNet(prix[i], livre) * pref[i] - 1);
  return { moyenne: (v[0] + v[1] + v[2]) / 3, issues: v };
}

const SEL = Object.freeze({ home: 0, draw: 1, away: 2 });
const KIND_DU_MOMENT = Object.freeze({ open: 'ouverture', preclose: 'releve', close: 'cloture' });

/**
 * Les MOMENTS d'un livre sur une rencontre, d'après ses relevés 1N2 (une ligne par sélection et par
 * relevé : { selection, kind, t (ms, NaN inconnu), price, prob }). Pure.
 *   - `open` → ouverture, `preclose` → relevé (football-data), `close` → clôture (les trois issues requises) ;
 *   - `payant` (The Odds API) : le DERNIER relevé (snapshot) complet d'avant le coup d'envoi → relevé payant ;
 *   - `serieDatee` (relevés en direct des sources gratuites) : seuls les relevés DATÉS AVANT le coup d'envoi
 *     comptent — un historique rattrapé porte l'heure du rattrapage, toujours après. Une série s'écrit au
 *     changement seulement : la cote d'un instant T est celle du dernier relevé ≤ T, valable si la série a
 *     commencé avant T et était encore suivie à T (un relevé à T ou après, ou une clôture écrite) :
 *       h-3          T = coup d'envoi − 3 h ;
 *       apres-compos T = coup d'envoi − 45 min (compositions annoncées une heure avant) ;
 *       juste-avant  le dernier relevé, s'il date d'au plus 15 min avant le coup d'envoi.
 * Rend [{ moment, prix: [3], probs: [3], releveMs }].
 */
export function momentsDUnLivre(lignes, { kickoffMs = Number.NaN, payant = false, serieDatee = false } = {}) {
  const sortie = [];
  const triple = (rs) => {
    const prix = [Number.NaN, Number.NaN, Number.NaN];
    const probs = [Number.NaN, Number.NaN, Number.NaN];
    let t = Number.NaN;
    for (const r of rs) {
      const i = SEL[r.selection];
      if (i === undefined) continue;
      prix[i] = Number.isFinite(r.price) ? r.price : Number.NaN;
      probs[i] = Number.isFinite(r.prob) ? r.prob : Number.NaN;
      if (Number.isFinite(r.t)) t = Number.isFinite(t) ? Math.max(t, r.t) : r.t;
    }
    const complet = [0, 1, 2].every((i) => prix[i] > 1 || (probs[i] > 0 && probs[i] < 1));
    return complet ? { prix, probs, releveMs: t } : null;
  };
  for (const [kind, moment] of Object.entries(KIND_DU_MOMENT)) {
    const x = triple(lignes.filter((r) => r.kind === kind));
    if (x) sortie.push({ moment, ...x });
  }
  const K = kickoffMs;
  if (payant) {
    const parReleve = new Map();
    for (const r of lignes) {
      if (r.kind !== 'snapshot' || !Number.isFinite(r.t) || (Number.isFinite(K) && r.t >= K)) continue;
      if (!parReleve.has(r.t)) parReleve.set(r.t, []);
      parReleve.get(r.t).push(r);
    }
    for (const t of [...parReleve.keys()].sort((a, b) => b - a)) {
      const x = triple(parReleve.get(t));
      if (x) {
        sortie.push({ moment: 'releve-payant', ...x });
        break;
      }
    }
  }
  if (serieDatee && Number.isFinite(K)) {
    const datees = lignes.filter((r) => (r.kind === 'snapshot' || r.kind === 'close') && Number.isFinite(r.t) && r.t < K).sort((a, b) => a.t - b.t);
    const instantanes = datees.filter((r) => r.kind === 'snapshot');
    if (instantanes.length) {
      const premier = instantanes[0].t;
      const dernier = datees.at(-1).t;
      const clotureEcrite = lignes.some((r) => r.kind === 'close');
      const aLInstant = (T) => {
        const derniers = new Map();
        for (const r of datees) {
          if (r.t > T) break;
          derniers.set(r.selection, r);
        }
        return triple([...derniers.values()]);
      };
      const suivieA = (T) => premier <= T && (dernier >= T || clotureEcrite);
      for (const [moment, avance] of [['h-3', AVANCE_H3_MINUTES], ['apres-compos', AVANCE_APRES_COMPOS_MINUTES]]) {
        const T = K - avance * 60_000;
        if (!suivieA(T)) continue;
        const x = aLInstant(T);
        if (x) sortie.push({ moment, ...x });
      }
      if (dernier >= K - FRAICHEUR_JUSTE_AVANT_MINUTES * 60_000) {
        const x = aLInstant(dernier);
        if (x) sortie.push({ moment: 'juste-avant', ...x });
      }
    }
  }
  return sortie;
}

/** La saison d'avant : « 2023-24 » → « 2022-23 », « 2023 » → « 2022 », 2025 → « 2024 » ; null sinon. */
export function saisonDAvant(saison) {
  const s = String(saison ?? '');
  let m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${Number(m[1]) - 1}-${String((Number(m[2]) + 99) % 100).padStart(2, '0')}`;
  m = s.match(/^(\d{4})\/(\d{4})$/);
  if (m) return `${Number(m[1]) - 1}/${Number(m[2]) - 1}`;
  m = s.match(/^(\d{4})$/);
  return m ? String(Number(m[1]) - 1) : null;
}

/** Une table de points : ajoute un match (score final) aux deux équipes. */
function ajouterAuClassement(tables, cle, dom, ext, bd, be) {
  if (!Number.isInteger(bd) || !Number.isInteger(be) || dom === null || ext === null) return;
  let t = tables.get(cle);
  if (!t) tables.set(cle, (t = new Map()));
  for (const [club, pour, contre] of [[dom, bd, be], [ext, be, bd]]) {
    const e = t.get(club) ?? { pts: 0, diff: 0, pour: 0, joues: 0 };
    e.pts += pour > contre ? 3 : pour === contre ? 1 : 0;
    e.diff += pour - contre;
    e.pour += pour;
    e.joues++;
    t.set(club, e);
  }
}

/** Les 3 premiers de chaque table (points, différence, buts, puis l'identifiant), si la saison a assez de matchs. */
export function premiersDesTables(tables, { rang = GRANDES_EQUIPES.rang, matchsParEquipe = GRANDES_EQUIPES.matchsParEquipe } = {}) {
  const sortie = new Map();
  for (const [cle, t] of tables) {
    const equipes = [...t.entries()];
    if (!equipes.length) continue;
    const joues = equipes.reduce((s, [, e]) => s + e.joues, 0);
    if (joues / equipes.length < matchsParEquipe) continue;
    equipes.sort(([ia, a], [ib, b]) => b.pts - a.pts || b.diff - a.diff || b.pour - a.pour || String(ia).localeCompare(String(ib)));
    sortie.set(cle, new Set(equipes.slice(0, rang).map(([club]) => club)));
  }
  return sortie;
}

/**
 * Le MENEUR d'un tableau de paires (« Copeland ») : celui qui bat le plus d'autres livres sur leurs matchs
 * communs (perte log moyenne plus petite), parmi les paires d'au moins `min` matchs. Égalité : le plus
 * grand écart moyen cumulé en sa faveur, puis la clé. null sans paire assez grande. Pure.
 * `paires` : [{ A, B, n, moyA, moyB }] ; `sens` : 'min' (plus petit = mieux) ou 'max'.
 */
export function meneurDesPaires(paires, { min = MIN_MATCHS, sens = 'min' } = {}) {
  const score = new Map();
  const point = (cle) => score.get(cle) ?? score.set(cle, { victoires: 0, defaites: 0, egalites: 0, ecart: 0 }).get(cle);
  for (const p of paires) {
    if (p.n < min) continue;
    const a = point(p.A);
    const b = point(p.B);
    const d = sens === 'min' ? p.moyB - p.moyA : p.moyA - p.moyB; // > 0 : A meilleur
    if (d > 0) {
      a.victoires++;
      b.defaites++;
    } else if (d < 0) {
      b.victoires++;
      a.defaites++;
    } else {
      a.egalites++;
      b.egalites++;
    }
    a.ecart += d;
    b.ecart -= d;
  }
  if (!score.size) return null;
  const classes = [...score.entries()].sort(([ca, a], [cb, b]) => b.victoires - b.defaites - (a.victoires - a.defaites) || b.victoires - a.victoires || b.ecart - a.ecart || ca.localeCompare(cb));
  const [livre, s] = classes[0];
  return { livre, ...s, classement: classes.map(([cle, x]) => ({ livre: cle, ...x })) };
}

/** Ce que dit un verdict du juge, pour chaque mesure (A = l'autre, B = le meneur ; biais : A = l'annoncé, B = le réalisé). */
const DIT = Object.freeze({
  justesse: { retenu: 'plus juste, au-delà du hasard', 'moins-bon': 'moins juste, au-delà du hasard', 'pas-prouve': 'écart dans le hasard', 'pas-assez-de-matchs': 'trop peu de matchs communs pour juger' },
  vitesse: { retenu: 'bouge avant, au-delà du hasard', 'moins-bon': 'bouge après, au-delà du hasard', 'pas-prouve': 'avance dans le hasard', 'pas-assez-de-matchs': 'trop peu de matchs communs pour juger' },
  biais: { retenu: 'sous-estime', 'moins-bon': 'surestime', 'pas-prouve': 'pas de biais prouvé', 'pas-assez-de-matchs': 'trop peu de matchs pour juger' },
  moment: { retenu: 'plus tard vaut mieux', 'moins-bon': 'plus tôt vaut mieux', 'pas-prouve': 'écart dans le hasard', 'pas-assez-de-matchs': 'trop peu de matchs pour juger' }
});

/** Les types d’issue du meilleur moment (d’après la clôture de référence). */
export const TYPES_D_ISSUE = Object.freeze(['favori', 'nul', 'outsider']);

/** Les moments de pari, dits à Pierre. */
export const MOMENTS_DE_PARI_DITS = Object.freeze({
  releve: 'tôt (relevé du vendredi/mardi)',
  ouverture: 'tôt (à l’ouverture)',
  'apres-compos': 'après les compos',
  'juste-avant': 'juste avant le coup d’envoi'
});

/**
 * LA CONCLUSION « mieux vaut parier … » d'un championnat, d'après ses comparaisons jugées
 * [{ tot, tard, verdict }] (verdict de comparer : retenu = le plus tard vaut mieux, moins-bon = le plus
 * tôt vaut mieux) : un moment est meilleur s'il gagne TOUTES ses comparaisons jugées (au moins une) avec
 * un verdict prouvé, et n'en perd aucune. Un seul : lui ; le relevé et l'ouverture tous deux (jamais
 * comparés entre eux) : « tôt » ; sinon « pas de moment meilleur prouvé ». Pure.
 */
export function conclusionDuMoment(comparaisons) {
  const juges = comparaisons.filter((c) => ['retenu', 'moins-bon', 'pas-prouve'].includes(c.verdict));
  const bilan = new Map();
  const de = (m) => bilan.get(m) ?? bilan.set(m, { gagne: 0, perd: 0, egal: 0 }).get(m);
  for (const c of juges) {
    const tot = de(c.tot);
    const tard = de(c.tard);
    if (c.verdict === 'retenu') {
      tard.gagne++;
      tot.perd++;
    } else if (c.verdict === 'moins-bon') {
      tot.gagne++;
      tard.perd++;
    } else {
      tot.egal++;
      tard.egal++;
    }
  }
  const meilleurs = [...bilan.entries()].filter(([, b]) => b.gagne > 0 && b.perd === 0 && b.egal === 0).map(([m]) => m);
  let conclusion = null;
  if (meilleurs.length === 1) conclusion = meilleurs[0];
  else if (meilleurs.length === 2 && meilleurs.includes('releve') && meilleurs.includes('ouverture')) conclusion = 'tot';
  const phrase =
    conclusion === null
      ? juges.length
        ? 'pas de moment meilleur prouvé'
        : 'trop peu de matchs pour juger'
      : conclusion === 'tot'
        ? 'mieux vaut parier tôt'
        : `mieux vaut parier ${MOMENTS_DE_PARI_DITS[conclusion]}`;
  return { conclusion, phrase, jugees: juges.length };
}

// ================================================================ les relevés en mémoire

const VIDE = -1;
/** Une rencontre : forme FIXE (aucune clé ajoutée après coup : les objets restent compacts). */
const nouveauMatch = (cle, c) => ({
  cle,
  date: c.date ?? null,
  ligue: c.ligue ?? null,
  issue: Number.isInteger(c.issue) ? c.issue : VIDE,
  grp: c.grp ?? null,
  saison: c.saison ?? null,
  dom: c.dom ?? null,
  ext: c.ext ?? null,
  grande: 0,
  lien: c.lien ?? null,
  code: c.code ?? null,
  vue: VIDE
});

/**
 * LES RELEVÉS : les rencontres (objets de forme fixe) et les cotes (tableaux typés : rencontre, livre,
 * moment, trois prix, trois probabilités justes, marge ou écart à 100 %, anomalie, heure du relevé),
 * rangées par rencontre après le chargement (`ranger`). Remplie par chargerLesReleves (la base) ou à la
 * main (les essais) : UNE seule représentation pour les deux.
 */
export class Releves {
  constructor({ capacite = 1 << 14 } = {}) {
    this.matchs = [];
    this.parCle = new Map();
    this.livres = [];
    this.parLivre = new Map();
    this.textes = new Map();
    this.n = 0;
    this.cap = 0;
    this.refusees = 0;
    this.allouer(capacite);
    this.ordre = null;
    this.debuts = null;
  }

  /** Un texte répété (jour, championnat, saison, club) gardé une seule fois en mémoire. */
  texte(t) {
    if (typeof t !== 'string') return t;
    const x = this.textes.get(t);
    if (x !== undefined) return x;
    this.textes.set(t, t);
    return t;
  }

  /** Les tableaux des cotes, agrandis de moitié quand ils sont pleins (une marge de 50 % au plus, jamais le double). */
  allouer(cap) {
    const ancien = this.cap ? this : null;
    const copie = (Type, largeur, nom) => {
      const t = new Type(cap * largeur);
      if (ancien) t.set(ancien[nom].subarray(0, this.n * largeur));
      return t;
    };
    this.eMatch = copie(Int32Array, 1, 'eMatch');
    this.eLivre = copie(Int16Array, 1, 'eLivre');
    this.eMoment = copie(Int8Array, 1, 'eMoment');
    this.eAnomalie = copie(Uint8Array, 1, 'eAnomalie');
    this.ePrix = copie(Float64Array, 3, 'ePrix');
    this.eP = copie(Float64Array, 3, 'eP');
    this.eMarge = copie(Float32Array, 1, 'eMarge');
    this.cap = cap;
  }

  /** L'indice d'un livre (créé à sa première cote) ; -1 pour un livre écarté. */
  indiceDuLivre(cle) {
    let i = this.parLivre.get(cle);
    if (i !== undefined) return i;
    const d = decrireLivre(cle);
    i = d ? this.livres.length : VIDE;
    if (d) this.livres.push(d);
    this.parLivre.set(cle, i);
    return i;
  }

  /** L'indice d'une rencontre (créée à sa première mention ; les champs connus ne sont jamais réécrits, sauf une issue inconnue). */
  match(cle, champs = {}) {
    const CHAMPS_TEXTE = ['date', 'ligue', 'grp', 'saison', 'dom', 'ext', 'code'];
    let i = this.parCle.get(cle);
    if (i === undefined) {
      const c = { ...champs };
      for (const k of CHAMPS_TEXTE) c[k] = this.texte(c[k]);
      i = this.matchs.length;
      this.matchs.push(nouveauMatch(cle, c));
      this.parCle.set(cle, i);
      return i;
    }
    const m = this.matchs[i];
    for (const k of [...CHAMPS_TEXTE, 'lien']) if (m[k] === null && champs[k] !== undefined && champs[k] !== null) m[k] = this.texte(champs[k]);
    if (m.issue === VIDE && Number.isInteger(champs.issue) && champs.issue >= 0) m.issue = champs.issue;
    return i;
  }

  /** Ajoute la cote d'un livre à un moment (prix décimaux ; probabilités brutes pour une bourse qui les donne). false si elle est incomplète. */
  ajouter(m, livre, moment, prix, probs = null) {
    const d = this.livres[livre];
    const j = d ? probabilitesJustes({ prix, probs, type: d.type }) : null;
    const mo = IM[moment];
    if (!j || mo === undefined) {
      this.refusees++;
      return false;
    }
    if (this.n === this.cap) this.allouer(Math.ceil(this.cap * 1.5));
    const k = this.n++;
    this.eMatch[k] = m;
    this.eLivre[k] = livre;
    this.eMoment[k] = mo;
    this.eAnomalie[k] = j.anomalie ? 1 : 0;
    for (let i = 0; i < 3; i++) {
      this.ePrix[k * 3 + i] = Number.isFinite(prix?.[i]) && prix[i] > 1 ? prix[i] : 1 / (probs?.[i] ?? Number.NaN);
      this.eP[k * 3 + i] = j.p[i];
    }
    this.eMarge[k] = d.type === 'bourse' ? j.ecartA100 : j.marge;
    return true;
  }

  /** Range les cotes par rencontre (tri par comptage, stable) et pose les étiquettes « déjà vu » et les grandes équipes. */
  ranger({ fenetres = fenetresDeclarees({ portee: 'marche' }), premiers = null } = {}) {
    const nm = this.matchs.length;
    const debuts = new Int32Array(nm + 1);
    for (let k = 0; k < this.n; k++) debuts[this.eMatch[k] + 1]++;
    for (let i = 0; i < nm; i++) debuts[i + 1] += debuts[i];
    const pos = debuts.slice(0, nm);
    const ordre = new Int32Array(this.n);
    for (let k = 0; k < this.n; k++) ordre[pos[this.eMatch[k]]++] = k;
    this.ordre = ordre;
    this.debuts = debuts;
    this.fenetres = fenetres;
    for (const m of this.matchs) {
      m.vue = m.date ? fenetres.findIndex((f) => m.date >= f.de && m.date <= f.a) : VIDE;
      if (premiers && m.grp && m.saison !== null && m.dom !== null && m.ext !== null) {
        const grands = premiers.get(`${m.grp}|${saisonDAvant(m.saison)}`);
        if (grands) {
          const d = grands.has(m.dom);
          const e = grands.has(m.ext);
          m.grande = d && !e ? 1 : e && !d ? 2 : 0;
        }
      }
    }
    return this;
  }
}

/**
 * Les cotes d'une rencontre à un moment, UNE par livre (la première rangée ; un doublon — deux
 * événements d'une même source pour une rencontre — est compté, jamais pris deux fois). `marque` : un
 * tableau de travail (Int32Array, une case par livre) et son numéro de passage, pour ne rien allouer.
 */
function cotesAuMoment(R, m, moment, sortie, marque, passage, { sansAnomalie = false, filtre = null } = {}) {
  sortie.length = 0;
  let doublons = 0;
  for (let j = R.debuts[m]; j < R.debuts[m + 1]; j++) {
    const k = R.ordre[j];
    if (R.eMoment[k] !== moment) continue;
    const l = R.eLivre[k];
    if (sansAnomalie && R.eAnomalie[k]) continue;
    if (filtre && !filtre(R.livres[l])) continue;
    if (marque[l] === passage) {
      doublons++;
      continue;
    }
    marque[l] = passage;
    sortie.push(k);
  }
  return doublons;
}

// ================================================================ la lecture de la base

const SQL_MAGASIN = `SELECT d.match_key AS mk, d.date, d.league, d.saison, d.home, d.away,
  t.attribue, t.prolongation, t.coupe, t.compte, t.bp, t.bc, t.bp90, t.bc90
  FROM day_matches d JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1`;
const LIVRES_FD = Object.freeze([['moy', 'fd|Moyenne du marché'], ['pin', 'fd|Pinnacle'], ['b365', 'fd|Bet365'], ['wh', 'fd|William Hill']]);
const SQL_FD = `SELECT id, code, saison, date, dom, ext, match_key, lien, bd, be,
  ${LIVRES_FD.flatMap(([p]) => ['1', 'n', '2', 'c1', 'cn', 'c2'].map((s) => `${p}_${s}`)).join(', ')}
  FROM fd_history`;
const exclues = [...SOURCES_SAISIES].map((s) => `'${s}'`).join(', ');
/** Les cotes 1N2 des sources (la saisie à la main jamais ; de football-data, seule la bourse Betfair, absente de fd_history), par rencontre puis livre. */
const SQL_COTES = `SELECT e.id AS ev, e.source, e.match_key AS mk, e.league, e.date, e.kickoff, q.bookmaker, q.selection, q.kind, q.releve_at AS r, q.price, q.prob
  FROM odds_quotes q JOIN odds_events e ON e.id = q.event_id
  WHERE q.market = '1x2' AND q.line = 0 AND q.kind IN ('open', 'preclose', 'close', 'snapshot') AND e.source NOT IN (${exclues})
    AND (e.source <> 'football-data.co.uk' OR q.bookmaker = 'Betfair Exchange')
  ORDER BY q.event_id, q.bookmaker`;

export const ligueDuCodeFd = (code) => FD_SAISONNIERS[code] ?? FD_PAYS[code] ?? `fd:${code}`;
const cote100 = (v) => (v === null || v === undefined ? Number.NaN : Number(v) / 100);
const issueDuScore = (h, a) => (!Number.isInteger(h) || !Number.isInteger(a) ? VIDE : h > a ? 0 : h === a ? 1 : 2);

/**
 * LE CHARGEMENT (générateur : un `yield` toutes les quelques milliers de lignes). Trois lectures, en flux :
 *   1. le magasin, par la table du jour J (étape 17) : le résultat de la 90e minute (prolongation : le
 *      score de la 90e, sinon inconnu ; attribué : écarté), le championnat, la saison et les clubs ;
 *   2. fd_history : une rencontre par ligne (la rencontre du magasin quand lien = 1 ; lien 2 et 3 écartés :
 *      score différent, rattachement incertain), quatre livres, avant-match (relevé) et clôture ;
 *   3. odds_quotes : chaque livre de chaque rencontre, ses moments (momentsDUnLivre).
 * Les classements de la saison d'avant (grandes équipes) se font en lisant : football-data par code et
 * saison, le magasin par championnat et saison (matchs comptés au classement, hors coupes et attribués).
 */
export function* chargerLesReleves(database, { fenetres = fenetresDeclarees({ portee: 'marche' }) } = {}) {
  const R = new Releves({ capacite: 1 << 18 });
  const bilan = { rencontresDuMagasin: 0, lignesFd: 0, fdEcartees: { scoreDifferent: 0, rattachementIncertain: 0 }, lignesDeCotes: 0, groupes: 0, evenementsSansRencontre: 0 };
  // 1. Le magasin.
  const magasin = new Map();
  const tables = new Map();
  for (const r of database.prepare(SQL_MAGASIN).iterate()) {
    let issue = VIDE;
    if (r.attribue !== 1) issue = r.prolongation === 1 ? issueDuScore(r.bp90, r.bc90) : issueDuScore(r.bp, r.bc);
    magasin.set(r.mk, { date: r.date, ligue: r.league, saison: String(r.saison), dom: `c:${r.home}`, ext: `c:${r.away}`, issue });
    if (r.coupe === 0 && r.compte === 1 && r.attribue === 0) ajouterAuClassement(tables, `m:${r.league}|${r.saison}`, `c:${r.home}`, `c:${r.away}`, r.bp, r.bc);
    if (++bilan.rencontresDuMagasin % 4000 === 0) yield 'lecture du magasin';
  }
  // 2. football-data depuis 2000.
  for (const r of database.prepare(SQL_FD).iterate()) {
    bilan.lignesFd++;
    if (bilan.lignesFd % 4000 === 0) yield 'lecture de football-data';
    ajouterAuClassement(tables, `fd:${r.code}|${r.saison}`, `fd:${r.dom}`, `fd:${r.ext}`, r.bd, r.be);
    if (r.lien === 2) {
      bilan.fdEcartees.scoreDifferent++;
      continue;
    }
    if (r.lien === 3) {
      bilan.fdEcartees.rattachementIncertain++;
      continue;
    }
    const lie = r.lien === 1 && r.match_key ? r.match_key : null;
    const st = lie ? magasin.get(lie) : null;
    const m = R.match(lie ?? `fd:${r.id}`, {
      date: st?.date ?? r.date,
      ligue: st?.ligue ?? ligueDuCodeFd(r.code),
      issue: st ? st.issue : issueDuScore(r.bd, r.be),
      grp: `fd:${r.code}`,
      saison: r.saison,
      dom: `fd:${r.dom}`,
      ext: `fd:${r.ext}`,
      lien: r.lien,
      code: r.code
    });
    for (const [p, cle] of LIVRES_FD) {
      const l = R.indiceDuLivre(cle);
      const avant = [cote100(r[`${p}_1`]), cote100(r[`${p}_n`]), cote100(r[`${p}_2`])];
      if (avant.every((o) => o > 1)) R.ajouter(m, l, 'releve', avant);
      const cloture = [cote100(r[`${p}_c1`]), cote100(r[`${p}_cn`]), cote100(r[`${p}_c2`])];
      if (cloture.every((o) => o > 1)) R.ajouter(m, l, 'cloture', cloture);
    }
  }
  // 3. Les cotes archivées, un livre d'une rencontre à la fois.
  let groupe = null;
  const traiter = (g) => {
    bilan.groupes++;
    const famille = g.source === 'football-data.co.uk' ? 'fd' : g.source;
    const l = R.indiceDuLivre(`${famille}|${g.bookmaker}`);
    if (l === VIDE) return;
    let cle;
    let champs;
    if (g.mk) {
      const st = magasin.get(g.mk);
      cle = g.mk;
      champs = st ? { date: st.date, ligue: st.ligue, issue: st.issue, grp: `m:${st.ligue}`, saison: st.saison, dom: st.dom, ext: st.ext } : { date: g.date, ligue: g.league, issue: VIDE };
    } else {
      bilan.evenementsSansRencontre++;
      cle = `ev:${g.ev}`;
      champs = { date: g.date, ligue: g.league, issue: VIDE };
    }
    const m = R.match(cle, champs);
    const payant = SOURCES_PAYANTES.has(g.source);
    const moments = momentsDUnLivre(g.lignes, { kickoffMs: Date.parse(g.kickoff ?? ''), payant, serieDatee: !payant && g.source !== 'football-data.co.uk' });
    for (const e of moments) R.ajouter(m, l, e.moment, e.prix, e.probs);
  };
  for (const r of database.prepare(SQL_COTES).iterate()) {
    bilan.lignesDeCotes++;
    if (!groupe || groupe.ev !== r.ev || groupe.bookmaker !== r.bookmaker) {
      if (groupe) traiter(groupe);
      groupe = { ev: r.ev, source: r.source, mk: r.mk, league: r.league, date: r.date, kickoff: r.kickoff, bookmaker: r.bookmaker, lignes: [] };
    }
    groupe.lignes.push({ selection: r.selection, kind: r.kind, t: Date.parse(r.r ?? ''), price: r.price, prob: r.prob });
    if (bilan.lignesDeCotes % 4000 === 0) yield 'lecture des cotes archivées';
  }
  if (groupe) traiter(groupe);
  yield 'rangement';
  R.ranger({ fenetres, premiers: premiersDesTables(tables) });
  R.bilan = { ...bilan, rencontres: R.matchs.length, cotes: R.n, cotesRefusees: R.refusees, livres: R.livres.length };
  return R;
}

// ================================================================ outils des analyses

/** Une suite de lignes du juge, en tableaux typés (une comparaison) ; les objets ne sont faits qu'au moment de juger. */
class LignesDuJuge {
  constructor() {
    this.n = 0;
    this.cap = 0;
    this.blocs = new Int32Array(0);
    this.a = new Float64Array(0);
    this.b = new Float64Array(0);
    this.vues = 0;
    this.parFenetre = new Map();
    this.de = null;
    this.ax = null;
  }

  ajouter(m, match, a, b) {
    if (this.n === this.cap) {
      const cap = Math.max(256, Math.ceil(this.cap * 1.5));
      const nb = new Int32Array(cap);
      nb.set(this.blocs);
      const na = new Float64Array(cap);
      na.set(this.a);
      const nn = new Float64Array(cap);
      nn.set(this.b);
      this.blocs = nb;
      this.a = na;
      this.b = nn;
      this.cap = cap;
    }
    this.blocs[this.n] = m;
    this.a[this.n] = a;
    this.b[this.n] = b;
    this.n++;
    if (match.vue >= 0) {
      this.vues++;
      this.parFenetre.set(match.vue, (this.parFenetre.get(match.vue) ?? 0) + 1);
    }
    if (match.date) {
      if (this.de === null || match.date < this.de) this.de = match.date;
      if (this.ax === null || match.date > this.ax) this.ax = match.date;
    }
  }

  /** Le nombre de matchs (blocs distincts : les lignes d'un match sont consécutives dans la passe). */
  get matchs() {
    let n = 0;
    let dernier = -1;
    for (let i = 0; i < this.n; i++) {
      if (this.blocs[i] !== dernier) n++;
      dernier = this.blocs[i];
    }
    return n;
  }

  juger({ sens, variantes, tirages, graine, minBlocs }) {
    const lignes = new Array(this.n);
    for (let i = 0; i < this.n; i++) lignes[i] = { bloc: this.blocs[i], a: this.a[i], b: this.b[i] };
    return comparer(lignes, { sens, variantes: Math.max(1, variantes), tirages, graine, minBlocs });
  }

  vuesDites(fenetres) {
    return {
      lignes: this.n,
      dejaVues: this.vues,
      part: this.n ? this.vues / this.n : null,
      parFenetre: Object.fromEntries([...this.parFenetre.entries()].map(([i, n]) => [fenetres[i]?.id ?? String(i), n]))
    };
  }
}

const arrondi = (x, d = 6) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);
const portees = (m) => (m.ligue ? ['*', m.ligue] : ['*']);
/** Le résultat du juge, réduit à ce qu'on range. */
const jugementRange = (r, quoi) => ({
  gain: arrondi(r.gain, 8),
  fourchette: r.fourchette ? r.fourchette.map((x) => arrondi(x, 8)) : null,
  verdict: r.verdict,
  dit: DIT[quoi][r.verdict],
  p: arrondi(r.p, 6),
  ecartType: arrondi(r.ecartType, 8),
  matchs: r.n.matchs,
  lignes: r.n.lignes,
  variantes: r.seuil.variantes,
  z: arrondi(r.seuil.z, 4),
  raison: r.raison
});

// ================================================================ 1. la justesse

/**
 * LA JUSTESSE, par moment et par portée (« * » = tous les championnats, puis chaque championnat) :
 *   - chaque livre sur SES matchs (pour information : deux livres ne s'y comparent pas) ;
 *   - chaque PAIRE de livres sur leurs matchs communs (perte log et Brier des deux, mêmes matchs) ;
 *   - le MENEUR (meneurDesPaires, paires d'au moins 200 matchs), jugé face à chaque autre livre sur
 *     leurs matchs communs : A = l'autre, B = le meneur, perte log, sens « min » ; « retenu » = le
 *     meneur est plus juste au-delà du hasard. Pour « * », aussi sur les seules lignes jamais vues.
 *   K = le nombre de ces jugements (toutes portées, tous moments, les deux lectures) : chacun élargit
 *   sa fourchette pour tous les autres.
 */
function* analyserJustesse(R, o, lignes) {
  const marque = new Int32Array(R.livres.length).fill(-1);
  let passage = 0;
  const pres = [];
  const propres = new Map();
  const paires = new Map();
  let doublons = 0;
  const pl = new Float64Array(R.n);
  const br = new Float64Array(R.n);
  const p3 = [0, 0, 0];
  const momentsJ = MOMENTS_DE_JUSTESSE.map((m) => IM[m]);
  /** La perte log et le Brier de chaque cote présente (metrics.js, une seule écriture des mesures). */
  const noter = (match) => {
    for (const k of pres) {
      p3[0] = R.eP[k * 3];
      p3[1] = R.eP[k * 3 + 1];
      p3[2] = R.eP[k * 3 + 2];
      pl[k] = perteLog(p3, match.issue).valeur;
      br[k] = brier(p3, match.issue);
    }
  };
  // 1. Les sommes : chaque livre sur ses matchs, chaque paire sur ses matchs communs (et combien de jamais vus).
  for (let m = 0; m < R.matchs.length; m++) {
    const match = R.matchs[m];
    if (match.issue < 0) continue;
    if (m % 3000 === 0) yield 'justesse';
    for (const mo of momentsJ) {
      doublons += cotesAuMoment(R, m, mo, pres, marque, ++passage);
      if (!pres.length) continue;
      noter(match);
      for (const portee of portees(match)) {
        for (const k of pres) {
          const cle = `${mo}|${portee}|${R.eLivre[k]}`;
          const acc = propres.get(cle) ?? propres.set(cle, { n: 0, pl: 0, br: 0, anomalies: 0, de: null, a: null }).get(cle);
          acc.n++;
          acc.pl += pl[k];
          acc.br += br[k];
          acc.anomalies += R.eAnomalie[k];
          if (acc.de === null || match.date < acc.de) acc.de = match.date;
          if (acc.a === null || match.date > acc.a) acc.a = match.date;
        }
        for (let i = 0; i < pres.length; i++) {
          for (let j = i + 1; j < pres.length; j++) {
            let ka = pres[i];
            let kb = pres[j];
            if (R.eLivre[ka] > R.eLivre[kb]) [ka, kb] = [kb, ka];
            const cle = `${mo}|${portee}|${R.eLivre[ka]}|${R.eLivre[kb]}`;
            const acc = paires.get(cle) ?? paires.set(cle, { n: 0, jamais: 0, plA: 0, plB: 0, brA: 0, brB: 0, de: null, a: null }).get(cle);
            acc.n++;
            if (match.vue < 0) acc.jamais++;
            acc.plA += pl[ka];
            acc.plB += pl[kb];
            acc.brA += br[ka];
            acc.brB += br[kb];
            if (acc.de === null || match.date < acc.de) acc.de = match.date;
            if (acc.a === null || match.date > acc.a) acc.a = match.date;
          }
        }
      }
    }
  }
  // 2. Le meneur de chaque (moment, portée), ses comparaisons, et K (connu AVANT de juger : les comptes des paires).
  const parGroupe = new Map();
  for (const [cle, acc] of paires) {
    const [mo, portee, A, B] = cle.split('|');
    const g = `${mo}|${portee}`;
    if (!parGroupe.has(g)) parGroupe.set(g, []);
    parGroupe.get(g).push({ A: Number(A), B: Number(B), n: acc.n, jamais: acc.jamais, moyA: acc.plA / acc.n, moyB: acc.plB / acc.n });
  }
  const meneurs = new Map();
  const comparaisons = []; // { mo, portee, men, autre, n, jamais }
  for (const [g, liste] of parGroupe) {
    const men = meneurDesPaires(liste.map((p) => ({ ...p, A: String(p.A), B: String(p.B) })), { min: o.minMatchs, sens: 'min' });
    if (!men) continue;
    const meneur = Number(men.livre);
    meneurs.set(g, { ...men, livre: meneur });
    const [mo, portee] = g.split('|');
    for (const p of liste) {
      if (p.n < o.minMatchs || (p.A !== meneur && p.B !== meneur)) continue;
      comparaisons.push({ mo: Number(mo), portee, men: meneur, autre: p.A === meneur ? p.B : p.A, n: p.n, jamais: portee === '*' ? p.jamais : null });
    }
  }
  let K = 0;
  for (const c of comparaisons) {
    K++;
    if (c.jamais !== null && c.jamais >= o.minMatchs) K++;
  }
  const L = (i) => R.livres[i].cle;
  for (const [cle, acc] of propres) {
    const [mo, portee, l] = cle.split('|');
    lignes.push({
      mesure: 'justesse',
      portee,
      moment: LISTE_MOMENTS[mo],
      livre: L(Number(l)),
      cle: 'propres',
      n: acc.n,
      valeur: arrondi(acc.pl / acc.n),
      bas: null,
      haut: null,
      verdict: null,
      detail: { brier: arrondi(acc.br / acc.n), de: acc.de, a: acc.a, anomalies: acc.anomalies, note: 'sur SES matchs : ne se compare pas à un autre livre (voir les paires)' }
    });
  }
  for (const [cle, acc] of paires) {
    const [mo, portee, A, B] = cle.split('|');
    lignes.push({
      mesure: 'justesse',
      portee,
      moment: LISTE_MOMENTS[mo],
      livre: L(Number(A)),
      cle: `paire|${L(Number(B))}`,
      n: acc.n,
      valeur: arrondi(acc.plA / acc.n),
      bas: null,
      haut: null,
      verdict: null,
      detail: { autre: L(Number(B)), perteLog: arrondi(acc.plA / acc.n), perteLogAutre: arrondi(acc.plB / acc.n), brier: arrondi(acc.brA / acc.n), brierAutre: arrondi(acc.brB / acc.n), jamaisVus: acc.jamais, de: acc.de, a: acc.a }
    });
  }
  for (const [g, men] of meneurs) {
    const [mo, portee] = g.split('|');
    lignes.push({
      mesure: 'justesse',
      portee,
      moment: LISTE_MOMENTS[mo],
      livre: L(men.livre),
      cle: 'meneur',
      n: Math.max(0, ...(parGroupe.get(g) ?? []).filter((p) => p.A === men.livre || p.B === men.livre).map((p) => p.n)),
      valeur: men.victoires - men.defaites,
      bas: null,
      haut: null,
      verdict: null,
      detail: { victoires: men.victoires, defaites: men.defaites, egalites: men.egalites, classement: men.classement.map((c) => ({ ...c, livre: L(Number(c.livre)), ecart: arrondi(c.ecart, 8) })) }
    });
  }
  // 3. Les lignes du juge, UN MOMENT À LA FOIS (la mémoire reste celle d'un moment), puis ses jugements.
  for (const mo of momentsJ) {
    const ici = comparaisons.filter((c) => c.mo === mo);
    if (!ici.length) continue;
    const parPortee = new Map();
    for (const c of ici) {
      c.toutes = new LignesDuJuge();
      c.jamaisVues = c.jamais !== null && c.jamais >= o.minMatchs ? new LignesDuJuge() : null;
      if (!parPortee.has(c.portee)) parPortee.set(c.portee, []);
      parPortee.get(c.portee).push(c);
    }
    const parLivre = new Int32Array(R.livres.length);
    for (let m = 0; m < R.matchs.length; m++) {
      const match = R.matchs[m];
      if (match.issue < 0) continue;
      if (m % 3000 === 0) yield 'justesse : lignes du juge';
      cotesAuMoment(R, m, mo, pres, marque, ++passage);
      if (pres.length < 2) continue;
      noter(match);
      parLivre.fill(-1);
      for (const k of pres) parLivre[R.eLivre[k]] = k;
      for (const portee of portees(match)) {
        for (const c of parPortee.get(portee) ?? []) {
          const km = parLivre[c.men];
          const ka = parLivre[c.autre];
          if (km < 0 || ka < 0) continue;
          c.toutes.ajouter(m, match, pl[ka], pl[km]);
          if (c.jamaisVues && match.vue < 0) c.jamaisVues.ajouter(m, match, pl[ka], pl[km]);
        }
      }
    }
    let jugees = 0;
    for (const c of ici) {
      for (const [lecture, lj] of [['toutes', c.toutes], ['jamais-vues', c.jamaisVues]]) {
        if (!lj) continue;
        if (++jugees % 4 === 0) yield 'justesse : jugements';
        const r = lj.juger({ sens: 'min', variantes: K, tirages: o.tirages, graine: o.graine, minBlocs: o.minMatchs });
        const j = jugementRange(r, 'justesse');
        lignes.push({
          mesure: 'justesse',
          portee: c.portee,
          moment: LISTE_MOMENTS[mo],
          livre: L(c.men),
          cle: lecture === 'toutes' ? `face|${L(c.autre)}` : `face|${L(c.autre)}|jamais-vues`,
          n: r.n.matchs,
          valeur: j.gain,
          bas: j.fourchette?.[0] ?? null,
          haut: j.fourchette?.[1] ?? null,
          verdict: r.verdict,
          detail: { ...j, autre: L(c.autre), lecture, perteLogMeneur: arrondi(r.b.moyenne), perteLogAutre: arrondi(r.a.moyenne), de: lj.de, a: lj.ax, vues: lj.vuesDites(R.fenetres) }
        });
      }
      c.toutes = null;
      c.jamaisVues = null;
    }
  }
  return { K, doublons, comparaisons: comparaisons.length };
}

// ================================================================ 2. la vitesse

/**
 * LA VITESSE, pour chaque paire de moments (tôt, clôture) dont le moment tôt est le MÊME INSTANT pour
 * tous les livres (le relevé de football-data ; trois heures avant le coup d'envoi) : sur chaque match
 * coté par au moins deux livres aux deux moments (cotes sans anomalie), le consensus tôt C0 et de clôture
 * C1 (moyennes des probabilités justes de ces livres), le mouvement du marché M = C1 − C0 ; l'avance
 * d'un livre X : a = Σ (p_X tôt − C0) · M. Son AVANCE β = Σa / Σ|M|² : la part du mouvement du marché
 * qu'il a déjà faite (+100 % : déjà au prix de clôture ; 0 : avec le marché ; négatif : en retard).
 * L'avance de deux livres ne se compare que sur leurs MATCHS COMMUNS (les paires) : le meneur est celui
 * qui devance le plus d'autres livres sur leurs matchs communs (meneurDesPaires, paires d'au moins 200
 * matchs), jugé face à chaque autre sur ces matchs (A = l'autre, B = le meneur, mesure a, sens « max » ;
 * « retenu » : le meneur bouge avant lui, au-delà du hasard). K = ces jugements.
 */
function* analyserVitesse(R, o, lignes) {
  const marque = new Int32Array(R.livres.length).fill(-1);
  let passage = 0;
  const tot = [];
  const fin = [];
  const C0 = new Float64Array(3);
  const C1 = new Float64Array(3);
  const M = new Float64Array(3);
  const parLivre = new Int32Array(R.livres.length);
  const aDe = new Float64Array(R.livres.length);
  const presents = []; // livres présents aux deux moments
  const kTot = new Int32Array(R.livres.length);
  /** Le consensus, le mouvement du marché et l'avance de chaque livre présent aux deux moments ; rend Σ|M|². */
  const calculer = (m, E, Lm) => {
    // Vidé d'abord : un match sans le moment tôt ne garde jamais les livres de la paire de moments précédente.
    presents.length = 0;
    cotesAuMoment(R, m, E, tot, marque, ++passage, { sansAnomalie: true });
    if (tot.length < 2) return 0;
    parLivre.fill(-1);
    for (const k of tot) parLivre[R.eLivre[k]] = k;
    cotesAuMoment(R, m, Lm, fin, marque, ++passage, { sansAnomalie: true });
    C0.fill(0);
    C1.fill(0);
    for (const kf of fin) {
      const l = R.eLivre[kf];
      const kt = parLivre[l];
      if (kt < 0) continue;
      presents.push(l);
      kTot[l] = kt;
      for (let i = 0; i < 3; i++) {
        C0[i] += R.eP[kt * 3 + i];
        C1[i] += R.eP[kf * 3 + i];
      }
    }
    if (presents.length < 2) {
      presents.length = 0;
      return 0;
    }
    let w = 0;
    for (let i = 0; i < 3; i++) {
      C0[i] /= presents.length;
      C1[i] /= presents.length;
      M[i] = C1[i] - C0[i];
      w += M[i] * M[i];
    }
    for (const l of presents) {
      const kt = kTot[l];
      let a = 0;
      for (let i = 0; i < 3; i++) a += (R.eP[kt * 3 + i] - C0[i]) * M[i];
      aDe[l] = a;
    }
    return w;
  };
  // 1. Les sommes : chaque livre (son avance β, sur ses matchs) et chaque paire (sur ses matchs communs).
  const sommes = new Map();
  const paires = new Map();
  for (let m = 0; m < R.matchs.length; m++) {
    if (m % 3000 === 0) yield 'vitesse';
    const match = R.matchs[m];
    for (const [Enom, Lnom] of PAIRES_DE_VITESSE) {
      const w = calculer(m, IM[Enom], IM[Lnom]);
      if (!presents.length) continue;
      for (const portee of portees(match)) {
        for (const l of presents) {
          const cle = `${Enom}|${portee}|${l}`;
          const s = sommes.get(cle) ?? sommes.set(cle, { n: 0, sa: 0, sw: 0, mouvement: 0, de: null, a: null }).get(cle);
          s.n++;
          s.sa += aDe[l];
          s.sw += w;
          s.mouvement += Math.sqrt(w);
          if (s.de === null || match.date < s.de) s.de = match.date;
          if (s.a === null || match.date > s.a) s.a = match.date;
        }
        for (let i = 0; i < presents.length; i++) {
          for (let j = i + 1; j < presents.length; j++) {
            const A = Math.min(presents[i], presents[j]);
            const B = Math.max(presents[i], presents[j]);
            const cle = `${Enom}|${portee}|${A}|${B}`;
            const p = paires.get(cle) ?? paires.set(cle, { n: 0, sa: 0, sb: 0, sw: 0 }).get(cle);
            p.n++;
            p.sa += aDe[A];
            p.sb += aDe[B];
            p.sw += w;
          }
        }
      }
    }
  }
  // 2. Le meneur de chaque (moment tôt, portée) : celui qui devance le plus d'autres livres sur leurs matchs communs.
  const parGroupe = new Map();
  for (const [cle, p] of paires) {
    const [E, portee, A, B] = cle.split('|');
    const g = `${E}|${portee}`;
    if (!parGroupe.has(g)) parGroupe.set(g, []);
    parGroupe.get(g).push({ A: Number(A), B: Number(B), n: p.n, moyA: p.sa / p.n, moyB: p.sb / p.n, betaA: p.sw > 0 ? p.sa / p.sw : 0, betaB: p.sw > 0 ? p.sb / p.sw : 0 });
  }
  const comparaisons = [];
  const meneurs = new Map();
  for (const [g, liste] of parGroupe) {
    const men = meneurDesPaires(liste.map((p) => ({ ...p, A: String(p.A), B: String(p.B) })), { min: o.minMatchs, sens: 'max' });
    if (!men) continue;
    const meneur = Number(men.livre);
    meneurs.set(g, { ...men, livre: meneur });
    const [E, portee] = g.split('|');
    for (const p of liste) {
      if (p.n < o.minMatchs || (p.A !== meneur && p.B !== meneur)) continue;
      comparaisons.push({ E, portee, men: meneur, autre: p.A === meneur ? p.B : p.A, lj: new LignesDuJuge() });
    }
  }
  const K = comparaisons.length;
  if (comparaisons.length) {
    const parGroupeAJuger = new Map();
    for (const c of comparaisons) {
      const g = `${c.E}|${c.portee}`;
      if (!parGroupeAJuger.has(g)) parGroupeAJuger.set(g, []);
      parGroupeAJuger.get(g).push(c);
    }
    const ici = new Int32Array(R.livres.length).fill(-1);
    let tour = 0;
    for (let m = 0; m < R.matchs.length; m++) {
      if (m % 3000 === 0) yield 'vitesse : lignes du juge';
      const match = R.matchs[m];
      for (const [Enom, Lnom] of PAIRES_DE_VITESSE) {
        calculer(m, IM[Enom], IM[Lnom]);
        if (!presents.length) continue;
        tour++;
        for (const l of presents) ici[l] = tour;
        for (const portee of portees(match)) {
          for (const c of parGroupeAJuger.get(`${Enom}|${portee}`) ?? []) {
            if (ici[c.men] !== tour || ici[c.autre] !== tour) continue;
            c.lj.ajouter(m, match, aDe[c.autre], aDe[c.men]);
          }
        }
      }
    }
  }
  const L = (i) => R.livres[i].cle;
  for (const [cle, x] of sommes) {
    const [E, portee, l] = cle.split('|');
    lignes.push({
      mesure: 'vitesse',
      portee,
      moment: E,
      livre: L(Number(l)),
      cle: 'avance',
      n: x.n,
      valeur: arrondi(x.sw > 0 ? x.sa / x.sw : 0),
      bas: null,
      haut: null,
      verdict: null,
      detail: { vers: PAIRES_DE_VITESSE.find(([e]) => e === E)[1], mouvementMoyenPoints: arrondi((x.mouvement / x.n) * 100, 4), de: x.de, a: x.a, note: 'sur SES matchs : l’avance de deux livres se compare sur leurs matchs communs (les paires)' }
    });
  }
  for (const [cle, p] of paires) {
    const [E, portee, A, B] = cle.split('|');
    lignes.push({
      mesure: 'vitesse',
      portee,
      moment: E,
      livre: L(Number(A)),
      cle: `paire|${L(Number(B))}`,
      n: p.n,
      valeur: arrondi(p.sw > 0 ? p.sa / p.sw : 0),
      bas: null,
      haut: null,
      verdict: null,
      detail: { autre: L(Number(B)), avance: arrondi(p.sw > 0 ? p.sa / p.sw : 0), avanceAutre: arrondi(p.sw > 0 ? p.sb / p.sw : 0) }
    });
  }
  for (const [g, men] of meneurs) {
    const [E, portee] = g.split('|');
    lignes.push({
      mesure: 'vitesse',
      portee,
      moment: E,
      livre: L(men.livre),
      cle: 'meneur',
      n: Math.max(0, ...(parGroupe.get(g) ?? []).filter((p) => p.A === men.livre || p.B === men.livre).map((p) => p.n)),
      valeur: men.victoires - men.defaites,
      bas: null,
      haut: null,
      verdict: null,
      detail: { victoires: men.victoires, defaites: men.defaites, egalites: men.egalites, classement: men.classement.map((c) => ({ ...c, livre: L(Number(c.livre)), ecart: arrondi(c.ecart, 10) })) }
    });
  }
  let jugees = 0;
  for (const c of comparaisons) {
    if (++jugees % 4 === 0) yield 'vitesse : jugements';
    const r = c.lj.juger({ sens: 'max', variantes: K, tirages: o.tirages, graine: o.graine, minBlocs: o.minMatchs });
    const j = jugementRange(r, 'vitesse');
    const p = (parGroupe.get(`${c.E}|${c.portee}`) ?? []).find((x) => (x.A === c.men && x.B === c.autre) || (x.A === c.autre && x.B === c.men));
    lignes.push({
      mesure: 'vitesse',
      portee: c.portee,
      moment: c.E,
      livre: L(c.men),
      cle: `face|${L(c.autre)}`,
      n: r.n.matchs,
      valeur: j.gain,
      bas: j.fourchette?.[0] ?? null,
      haut: j.fourchette?.[1] ?? null,
      verdict: r.verdict,
      detail: {
        ...j,
        autre: L(c.autre),
        avanceMeneur: p ? arrondi(p.A === c.men ? p.betaA : p.betaB) : null,
        avanceAutre: p ? arrondi(p.A === c.men ? p.betaB : p.betaA) : null,
        de: c.lj.de,
        a: c.lj.ax,
        vues: c.lj.vuesDites(R.fenetres)
      }
    });
    c.lj = null;
  }
  return { K, comparaisons: comparaisons.length };
}

// ================================================================ 3. les biais

/** Le moment où se mesurent les biais d'un livre : la clôture s'il en a assez, sinon son moment le mieux fourni. */
function momentDesBiais(compte, min) {
  if ((compte.get(IM.cloture) ?? 0) >= min) return IM.cloture;
  let meilleur = null;
  for (const mo of MOMENTS_DE_JUSTESSE.map((x) => IM[x])) if ((compte.get(mo) ?? 0) > (meilleur === null ? 0 : compte.get(meilleur))) meilleur = mo;
  return meilleur;
}

/** L'annoncé et le réalisé d'une cote pour chaque catégorie de biais (null quand elle ne s'applique pas). */
function biaisDUneCote(R, k, match) {
  const p = [R.eP[k * 3], R.eP[k * 3 + 1], R.eP[k * 3 + 2]];
  const out = { domicile: [p[0], match.issue === 0 ? 1 : 0], nuls: [p[1], match.issue === 1 ? 1 : 0], outsiders: null, 'grandes-equipes': null };
  if (p[0] !== p[2]) {
    const outsider = p[0] < p[2] ? 0 : 2;
    out.outsiders = [p[outsider], match.issue === outsider ? 1 : 0];
  }
  if (match.grande === 1) out['grandes-equipes'] = [p[0], match.issue === 0 ? 1 : 0];
  else if (match.grande === 2) out['grandes-equipes'] = [p[2], match.issue === 2 ? 1 : 0];
  return out;
}

/**
 * LES BIAIS de chaque livre, au moment de ses biais (la clôture s'il en a au moins 200, sinon son moment
 * le mieux fourni), par portée : pour chaque catégorie, l'annoncé moyen (probabilité juste) face au
 * réalisé. Jugé par comparer (A = l'annoncé, B = le réalisé, sens « max » : gain = réalisé − annoncé) :
 * « retenu » = le livre SOUS-ESTIME la catégorie, « moins bon » = il la SURESTIME. K = toutes les cases
 * d'au moins 200 matchs (livres × catégories × portées). Une passe par livre : la mémoire reste petite.
 */
function* analyserBiais(R, o, lignes) {
  const NM = LISTE_MOMENTS.length;
  const momentsJ = new Set(MOMENTS_DE_JUSTESSE.map((x) => IM[x]));
  // 1. Les cotes de chaque livre à chaque moment, une par match (un doublon n'est jamais pris deux fois) :
  //    une seule passe sur les cotes rangées par match.
  const dernier = new Int32Array(R.livres.length * NM).fill(-1);
  const comptes = R.livres.map(() => new Map());
  for (let j = 0; j < R.n; j++) {
    if (j % 50_000 === 0) yield 'biais : comptes';
    const k = R.ordre[j];
    const m = R.eMatch[k];
    const mo = R.eMoment[k];
    if (!momentsJ.has(mo) || R.matchs[m].issue < 0) continue;
    const cle = R.eLivre[k] * NM + mo;
    if (dernier[cle] === m) continue;
    dernier[cle] = m;
    const c = comptes[R.eLivre[k]];
    c.set(mo, (c.get(mo) ?? 0) + 1);
  }
  const moments = comptes.map((c) => momentDesBiais(c, o.minMatchs));
  // Les cotes de chaque livre à SON moment des biais, dans l'ordre des matchs.
  const sesCotes = R.livres.map((_, l) => new Int32Array(moments[l] === null ? 0 : comptes[l].get(moments[l]) ?? 0));
  const remplies = new Int32Array(R.livres.length);
  dernier.fill(-1);
  for (let j = 0; j < R.n; j++) {
    if (j % 50_000 === 0) yield 'biais : cotes de chaque livre';
    const k = R.ordre[j];
    const l = R.eLivre[k];
    const m = R.eMatch[k];
    if (R.eMoment[k] !== moments[l] || R.matchs[m].issue < 0) continue;
    const cle = l * NM + R.eMoment[k];
    if (dernier[cle] === m) continue;
    dernier[cle] = m;
    sesCotes[l][remplies[l]++] = k;
  }
  // 2. Les sommes de chaque case (livre × portée × catégorie), puis K = les cases d'au moins 200 matchs.
  const sommes = new Map(); // `${livre}|${portee}|${cat}` → { n, annonce, realise }
  for (let l = 0; l < R.livres.length; l++) {
    for (let i = 0; i < remplies[l]; i++) {
      if (i % 20_000 === 0) yield 'biais : sommes';
      const k = sesCotes[l][i];
      const match = R.matchs[R.eMatch[k]];
      const b = biaisDUneCote(R, k, match);
      for (const portee of portees(match)) {
        for (const [cat, v] of Object.entries(b)) {
          if (!v) continue;
          const cle = `${l}|${portee}|${cat}`;
          const s = sommes.get(cle) ?? sommes.set(cle, { n: 0, annonce: 0, realise: 0 }).get(cle);
          s.n++;
          s.annonce += v[0];
          s.realise += v[1];
        }
      }
    }
  }
  let K = 0;
  for (const s of sommes.values()) if (s.n >= o.minMatchs) K++;
  // 3. Les lignes du juge des seules cases d'au moins 200 matchs, un livre à la fois (la mémoire reste petite).
  const jugements = new Map();
  for (let l = 0; l < R.livres.length; l++) {
    const parCase = new Map();
    for (let i = 0; i < remplies[l]; i++) {
      if (i % 20_000 === 0) yield 'biais : lignes du juge';
      const k = sesCotes[l][i];
      const m = R.eMatch[k];
      const match = R.matchs[m];
      const b = biaisDUneCote(R, k, match);
      for (const portee of portees(match)) {
        for (const [cat, v] of Object.entries(b)) {
          if (!v) continue;
          const cle = `${l}|${portee}|${cat}`;
          if (sommes.get(cle).n < o.minMatchs) continue;
          if (!parCase.has(cle)) parCase.set(cle, new LignesDuJuge());
          parCase.get(cle).ajouter(m, match, v[0], v[1]);
        }
      }
    }
    for (const [cle, lj] of parCase) {
      yield 'biais : jugements';
      const r = lj.juger({ sens: 'max', variantes: K, tirages: o.tirages, graine: o.graine, minBlocs: o.minMatchs });
      jugements.set(cle, { r, j: jugementRange(r, 'biais'), de: lj.de, a: lj.ax, vues: lj.vuesDites(R.fenetres) });
    }
  }
  for (const [cle, s] of sommes) {
    const [l, portee, cat] = cle.split('|');
    const x = jugements.get(cle);
    lignes.push({
      mesure: 'biais',
      portee,
      moment: LISTE_MOMENTS[moments[Number(l)]],
      livre: R.livres[Number(l)].cle,
      cle: cat,
      n: s.n,
      valeur: arrondi(((s.realise - s.annonce) / s.n) * 100, 4),
      bas: x?.j.fourchette ? arrondi(x.j.fourchette[0] * 100, 4) : null,
      haut: x?.j.fourchette ? arrondi(x.j.fourchette[1] * 100, 4) : null,
      verdict: x ? x.r.verdict : 'pas-assez-de-matchs',
      detail: {
        annonce: arrondi(s.annonce / s.n),
        realise: arrondi(s.realise / s.n),
        dit: x ? DIT.biais[x.r.verdict] : DIT.biais['pas-assez-de-matchs'],
        quoi: CATEGORIES_DE_BIAIS[cat],
        ...(x ? { variantes: x.j.variantes, p: x.j.p, de: x.de, a: x.a, vues: x.vues } : {})
      }
    });
  }
  return { K, cases: sommes.size };
}

// ================================================================ 4. les marges

/** Une médiane approchée par un histogramme de 0,01 point, de −10 % à +40 % (au-delà : les bords). */
class Histogramme {
  constructor() {
    this.cases = new Int32Array(5001);
    this.n = 0;
  }

  ajouter(x) {
    this.cases[Math.max(0, Math.min(5000, Math.round((x + 10) * 100)))]++;
    this.n++;
  }

  mediane() {
    if (!this.n) return null;
    let cumul = 0;
    for (let i = 0; i < this.cases.length; i++) {
      cumul += this.cases[i];
      if (cumul * 2 >= this.n) return i / 100 - 10;
    }
    return null;
  }
}

/**
 * LES MARGES de chaque livre, par portée et par moment, sur TOUTES ses cotes (un match sans résultat
 * compte : une marge ne dépend pas du score) : la marge moyenne et médiane, en %, cotes incohérentes
 * écartées et comptées. Une bourse n'a pas de marge : sa commission, et l'écart moyen de la somme de ses
 * probabilités brutes à 100 % (pour information). Une description, pas une comparaison : rien à juger.
 */
function* analyserMarges(R, o, lignes) {
  const sommes = new Map();
  for (let j = 0; j < R.n; j++) {
    if (j % 20000 === 0) yield 'marges';
    const k = j;
    const match = R.matchs[R.eMatch[k]];
    for (const portee of portees(match)) {
      const cle = `${R.eLivre[k]}|${portee}|${R.eMoment[k]}`;
      const s = sommes.get(cle) ?? sommes.set(cle, { n: 0, somme: 0, anomalies: 0, h: new Histogramme() }).get(cle);
      if (R.eAnomalie[k]) {
        s.anomalies++;
        continue;
      }
      s.n++;
      s.somme += R.eMarge[k];
      s.h.ajouter(R.eMarge[k]);
    }
  }
  for (const [cle, s] of sommes) {
    const [l, portee, mo] = cle.split('|');
    const d = R.livres[Number(l)];
    const bourse = d.type === 'bourse';
    lignes.push({
      mesure: 'marge',
      portee,
      moment: LISTE_MOMENTS[Number(mo)],
      livre: d.cle,
      cle: 'marge',
      n: s.n,
      valeur: bourse || !s.n ? null : arrondi(s.somme / s.n, 4),
      bas: null,
      haut: null,
      verdict: null,
      detail: {
        type: d.type,
        mediane: bourse ? null : s.h.mediane(),
        anomaliesEcartees: s.anomalies,
        ...(bourse ? { commission: d.commission, frais: d.frais, ecartA100Moyen: s.n ? arrondi(s.somme / s.n, 4) : null, note: 'une bourse n’a pas de marge : sa commission (ou ses frais) à la place' } : {})
      }
    });
  }
  return { cases: sommes.size };
}

// ================================================================ 5. le meilleur moment

/**
 * La clôture de RÉFÉRENCE d'un match : la moyenne des probabilités justes de clôture des bookmakers (et
 * de la moyenne du marché) qui la donnent, cotes incohérentes écartées — la règle de
 * marketMovement.probabiliteMarche, que lit la valeur de clôture de l'appli ; à défaut de bookmaker, les
 * bourses. null sans clôture. `sortie` : un Float64Array(3).
 */
function clotureDeReference(R, m, sortie, tampon, marque, passage) {
  cotesAuMoment(R, m, IM.cloture, tampon, marque, passage, { sansAnomalie: true });
  for (const bourses of [false, true]) {
    sortie.fill(0);
    let n = 0;
    for (const k of tampon) {
      if ((R.livres[R.eLivre[k]].type === 'bourse') !== bourses) continue;
      for (let i = 0; i < 3; i++) sortie[i] += R.eP[k * 3 + i];
      n++;
    }
    if (n) {
      for (let i = 0; i < 3; i++) sortie[i] /= n;
      return n;
    }
  }
  return 0;
}

/**
 * LE MEILLEUR MOMENT, par portée : pour chaque livre JOUABLE (bookmaker, moyenne du marché, bourse au
 * prix d'achat — jamais un prix « milieu du carnet ») et chaque match, la valeur de clôture de son prix à
 * chaque moment de pari (relevé du vendredi/mardi, ouverture, après les compos, juste avant : le dernier
 * relevé daté, sinon SA clôture — le dernier prix avant le coup d'envoi), face à la clôture de référence.
 * Chaque paire de moments est jugée sur les mêmes livres et les mêmes matchs (A = le plus tôt, B = le plus
 * tard, sens « max » ; « retenu » : plus tard vaut mieux ; « moins bon » : plus tôt vaut mieux), puis
 * conclusionDuMoment. Le relevé et l'ouverture ne sont jamais mélangés. Par type d'issue (favori de la
 * référence, nul, outsider) : les moyennes, pour comprendre (rien n'est jugé).
 */
function* analyserMoments(R, o, lignes) {
  const marque = new Int32Array(R.livres.length).fill(-1);
  let passage = 0;
  const tampon = [];
  const pref = new Float64Array(3);
  const pres = [];
  const prixDe = new Map(); // moment → Map(livre → k)
  const momentsPari = ['releve', 'ouverture', 'apres-compos', 'juste-avant'];
  const valeurs = new Map(); // `${portee}|${moment}` → sommes
  const comptes = new Map(); // `${portee}|${E}|${L}|${type}` → n lignes
  const jouable = (d) => d.prixJouable;
  const lire = (m) => {
    if (!clotureDeReference(R, m, pref, tampon, marque, ++passage)) return false;
    prixDe.clear();
    for (const nom of momentsPari) {
      const ici = new Map();
      cotesAuMoment(R, m, IM[nom], pres, marque, ++passage, { sansAnomalie: true, filtre: jouable });
      for (const k of pres) ici.set(R.eLivre[k], k);
      prixDe.set(nom, ici);
    }
    // Juste avant : sans relevé daté, la clôture du livre lui-même (son dernier prix avant le coup d'envoi).
    const juste = prixDe.get('juste-avant');
    cotesAuMoment(R, m, IM.cloture, pres, marque, ++passage, { sansAnomalie: true, filtre: jouable });
    for (const k of pres) if (!juste.has(R.eLivre[k])) juste.set(R.eLivre[k], k);
    return true;
  };
  const vdc = (k) => valeurDeCloture([R.ePrix[k * 3], R.ePrix[k * 3 + 1], R.ePrix[k * 3 + 2]], pref, R.livres[R.eLivre[k]]);
  /** Les issues par type, d'après la clôture de référence : le favori (domicile à égalité), le nul, l'outsider. */
  const issuesParType = () => {
    const fav = pref[0] >= pref[2] ? 0 : 2;
    return { favori: fav, nul: 1, outsider: 2 - fav };
  };
  // Les cases : la valeur moyenne d'un pari sur une issue prise au hasard (type « - ») dans chaque portée ;
  // pour tous les championnats ensemble, aussi par type d'issue.
  const typesDe = (portee) => (portee === '*' ? ['-', ...TYPES_D_ISSUE] : ['-']);
  const valeurDuType = (v, type, types) => (type === '-' ? v.moyenne : v.issues[types[type]]);
  for (let m = 0; m < R.matchs.length; m++) {
    if (m % 3000 === 0) yield 'meilleur moment';
    if (!lire(m)) continue;
    const match = R.matchs[m];
    const types = issuesParType();
    for (const portee of portees(match)) {
      for (const nom of momentsPari) {
        for (const k of prixDe.get(nom).values()) {
          const v = vdc(k);
          const cle = `${portee}|${nom}`;
          const s = valeurs.get(cle) ?? valeurs.set(cle, { n: 0, somme: 0, matchs: 0, dernier: -1, livres: new Set(), favori: 0, nul: 0, outsider: 0 }).get(cle);
          s.n++;
          s.somme += v.moyenne;
          if (s.dernier !== m) {
            s.matchs++;
            s.dernier = m;
          }
          s.livres.add(R.eLivre[k]);
          for (const t of TYPES_D_ISSUE) s[t] += v.issues[types[t]];
        }
      }
      for (const [E, Lm] of PAIRES_DE_MOMENTS) {
        const pe = prixDe.get(E);
        const pl = prixDe.get(Lm);
        let n = 0;
        for (const l of pe.keys()) if (pl.has(l)) n++;
        if (!n) continue;
        for (const type of typesDe(portee)) comptes.set(`${portee}|${E}|${Lm}|${type}`, (comptes.get(`${portee}|${E}|${Lm}|${type}`) ?? 0) + n);
      }
    }
  }
  // Les comparaisons d'au moins 200 cotes ont leurs lignes ; K = celles qui ont au moins 200 matchs (le juge compte les matchs).
  const aJuger = new Map();
  for (const [cle, n] of comptes) if (n >= o.minMatchs) aJuger.set(cle, new LignesDuJuge());
  if (aJuger.size) {
    for (let m = 0; m < R.matchs.length; m++) {
      if (m % 3000 === 0) yield 'meilleur moment : lignes du juge';
      if (!lire(m)) continue;
      const match = R.matchs[m];
      const types = issuesParType();
      for (const portee of portees(match)) {
        for (const [E, Lm] of PAIRES_DE_MOMENTS) {
          const pe = prixDe.get(E);
          const pl = prixDe.get(Lm);
          for (const type of typesDe(portee)) {
            const lj = aJuger.get(`${portee}|${E}|${Lm}|${type}`);
            if (!lj) continue;
            for (const [l, ke] of pe) {
              const kl = pl.get(l);
              if (kl === undefined) continue;
              lj.ajouter(m, match, valeurDuType(vdc(ke), type, types), valeurDuType(vdc(kl), type, types));
            }
          }
        }
      }
    }
  }
  let K = 0;
  for (const lj of aJuger.values()) if (lj.matchs >= o.minMatchs) K++;
  for (const [cle, s] of valeurs) {
    const [portee, nom] = cle.split('|');
    lignes.push({
      mesure: 'moment',
      portee,
      moment: nom,
      livre: '-',
      cle: 'valeur',
      n: s.matchs,
      valeur: arrondi((s.somme / s.n) * 100, 4),
      bas: null,
      haut: null,
      verdict: null,
      detail: {
        cotes: s.n,
        livres: [...s.livres].map((l) => R.livres[l].cle),
        parIssue: { favori: arrondi((s.favori / s.n) * 100, 4), nul: arrondi((s.nul / s.n) * 100, 4), outsider: arrondi((s.outsider / s.n) * 100, 4) },
        note: 'valeur de clôture moyenne (en %) d’un pari d’une unité pris à ce moment, sur une issue prise au hasard ; face à la clôture de référence (moyenne des bookmakers)'
      }
    });
  }
  const parPortee = new Map(); // `${portee}|${type}` → [{ tot, tard, verdict, n }]
  let jugees = 0;
  for (const [cle, lj] of aJuger) {
    const [portee, E, Lm, type] = cle.split('|');
    if (++jugees % 4 === 0) yield 'meilleur moment : jugements';
    const r = lj.juger({ sens: 'max', variantes: K, tirages: o.tirages, graine: o.graine, minBlocs: o.minMatchs });
    const j = jugementRange(r, 'moment');
    const g = `${portee}|${type}`;
    if (!parPortee.has(g)) parPortee.set(g, []);
    parPortee.get(g).push({ tot: E, tard: Lm, verdict: r.verdict, n: r.n.matchs });
    lignes.push({
      mesure: 'moment',
      portee,
      moment: E,
      livre: '-',
      cle: type === '-' ? `face|${Lm}` : `face|${Lm}|${type}`,
      n: r.n.matchs,
      valeur: j.gain === null ? null : arrondi(j.gain * 100, 6),
      bas: j.fourchette ? arrondi(j.fourchette[0] * 100, 6) : null,
      haut: j.fourchette ? arrondi(j.fourchette[1] * 100, 6) : null,
      verdict: r.verdict,
      detail: { ...j, tot: E, tard: Lm, type: type === '-' ? 'une issue au hasard' : type, valeurTot: arrondi(r.a.moyenne * 100, 4), valeurTard: arrondi(r.b.moyenne * 100, 4), cotes: r.n.lignes, de: lj.de, a: lj.ax, vues: lj.vuesDites(R.fenetres) }
    });
  }
  const toutes = new Set([...valeurs.keys()].map((c) => c.split('|')[0]));
  for (const portee of toutes) {
    for (const type of typesDe(portee)) {
      const comps = parPortee.get(`${portee}|${type}`) ?? [];
      const c = conclusionDuMoment(comps);
      lignes.push({
        mesure: 'moment',
        portee,
        moment: '-',
        livre: '-',
        cle: type === '-' ? 'conclusion' : `conclusion|${type}`,
        n: Math.max(0, ...comps.map((x) => x.n)),
        valeur: null,
        bas: null,
        haut: null,
        verdict: c.conclusion ?? (c.jugees ? 'aucun' : 'trop-peu'),
        detail: { ...c, type: type === '-' ? 'une issue au hasard' : type, comparaisons: comps }
      });
    }
  }
  return { K, comparaisons: aJuger.size };
}

// ================================================================ 6. le 23/09 retrouvé

/**
 * La référence du 23/09 est-elle retrouvée ? Pinnacle meneur du panier (ses paires sur matchs communs),
 * sa perte log à 0,0005 près de 0,9925, son nombre de matchs à 1 % près de 15 885. Pure.
 */
export function referenceRetrouvee({ meneur, mesure }) {
  return (
    meneur === REFERENCE_23_09.livre &&
    Number.isFinite(mesure?.perteLog) &&
    Number.isFinite(mesure?.matchs) &&
    Math.abs(mesure.perteLog - REFERENCE_23_09.perteLog) <= 0.0005 &&
    Math.abs(mesure.matchs - REFERENCE_23_09.matchs) <= 0.01 * REFERENCE_23_09.matchs
  );
}

/**
 * LA RÉFÉRENCE DU 23/09 sur la même période et le même panier : l'avant-match football-data (relevé) des
 * 18 championnats à fichier saisonnier, rencontres rattachées au magasin (lien = 1), du 01/07/2023 au
 * 23/09/2026. Chaque livre sur ses matchs (Pinnacle : 0,9925 sur 15 885 le 23/09), puis chaque paire sur
 * ses matchs communs, le meneur et ses jugements (variantes = les paires jugées ici). « Retrouvé » :
 * Pinnacle meneur, à 0,0005 près de 0,9925, sur un nombre de matchs à 1 % près. Déjà vu, par définition :
 * c'est l'étalonnage, jamais une preuve.
 */
function* reproduire23_09(R, o, lignes) {
  const idx = LIVRES_23_09.map((c) => R.parLivre.get(c) ?? VIDE);
  const propres = new Map();
  const paires = new Map();
  const lj = new Map();
  const pres = new Int32Array(idx.length);
  for (let m = 0; m < R.matchs.length; m++) {
    if (m % 5000 === 0) yield 'reproduction du 23/09';
    const match = R.matchs[m];
    if (match.issue < 0 || match.lien !== 1 || !FD_SAISONNIERS[match.code] || !match.date || match.date < FENETRE_23_09.de || match.date > FENETRE_23_09.a) continue;
    pres.fill(-1);
    for (let j = R.debuts[m]; j < R.debuts[m + 1]; j++) {
      const k = R.ordre[j];
      if (R.eMoment[k] !== IM.releve) continue;
      const i = idx.indexOf(R.eLivre[k]);
      if (i >= 0 && pres[i] < 0) pres[i] = k;
    }
    const issue = ['home', 'draw', 'away'][match.issue];
    const pl = [...pres].map((k) => (k < 0 ? null : perteLog({ home: R.eP[k * 3], draw: R.eP[k * 3 + 1], away: R.eP[k * 3 + 2] }, issue).valeur));
    for (let i = 0; i < idx.length; i++) {
      if (pl[i] === null) continue;
      const s = propres.get(i) ?? propres.set(i, { n: 0, pl: 0 }).get(i);
      s.n++;
      s.pl += pl[i];
      for (let j = i + 1; j < idx.length; j++) {
        if (pl[j] === null) continue;
        const p = paires.get(`${i}|${j}`) ?? paires.set(`${i}|${j}`, { n: 0, a: 0, b: 0 }).get(`${i}|${j}`);
        p.n++;
        p.a += pl[i];
        p.b += pl[j];
        if (!lj.has(`${i}|${j}`)) lj.set(`${i}|${j}`, new LignesDuJuge());
        lj.get(`${i}|${j}`).ajouter(m, match, pl[i], pl[j]);
      }
    }
  }
  const liste = [...paires.entries()].map(([c, p]) => {
    const [i, j] = c.split('|');
    return { A: LIVRES_23_09[Number(i)], B: LIVRES_23_09[Number(j)], n: p.n, moyA: p.a / p.n, moyB: p.b / p.n, cle: c };
  });
  const men = meneurDesPaires(liste, { min: o.minMatchs, sens: 'min' });
  for (const [i, s] of propres) {
    lignes.push({ mesure: 'reproduction', portee: '23-09', moment: 'releve', livre: LIVRES_23_09[i], cle: 'propres', n: s.n, valeur: arrondi(s.pl / s.n), bas: null, haut: null, verdict: null, detail: { periode: FENETRE_23_09 } });
  }
  for (const p of liste) {
    lignes.push({ mesure: 'reproduction', portee: '23-09', moment: 'releve', livre: p.A, cle: `paire|${p.B}`, n: p.n, valeur: arrondi(p.moyA), bas: null, haut: null, verdict: null, detail: { autre: p.B, perteLog: arrondi(p.moyA), perteLogAutre: arrondi(p.moyB) } });
  }
  const jugements = [];
  if (men) {
    const aJuger = liste.filter((p) => (p.A === men.livre || p.B === men.livre) && p.n >= o.minMatchs);
    for (const p of aJuger) {
      const autre = p.A === men.livre ? p.B : p.A;
      const L = lj.get(p.cle);
      // Orientation du juge : A = l'autre, B = le meneur.
      const lignesJuge = new LignesDuJuge();
      const meneurEstA = p.A === men.livre;
      for (let i = 0; i < L.n; i++) lignesJuge.ajouter(L.blocs[i], R.matchs[L.blocs[i]], meneurEstA ? L.b[i] : L.a[i], meneurEstA ? L.a[i] : L.b[i]);
      const r = lignesJuge.juger({ sens: 'min', variantes: aJuger.length, tirages: o.tirages, graine: o.graine, minBlocs: o.minMatchs });
      const j = jugementRange(r, 'justesse');
      jugements.push({ autre, verdict: r.verdict, n: r.n.matchs, gain: j.gain });
      lignes.push({ mesure: 'reproduction', portee: '23-09', moment: 'releve', livre: men.livre, cle: `face|${autre}`, n: r.n.matchs, valeur: j.gain, bas: j.fourchette?.[0] ?? null, haut: j.fourchette?.[1] ?? null, verdict: r.verdict, detail: { ...j, autre, perteLogMeneur: arrondi(r.b.moyenne), perteLogAutre: arrondi(r.a.moyenne) } });
    }
  }
  const pin = propres.get(LIVRES_23_09.indexOf(REFERENCE_23_09.livre));
  const mesure = pin ? { perteLog: arrondi(pin.pl / pin.n, 4), matchs: pin.n } : null;
  const retrouve = referenceRetrouvee({ meneur: men?.livre ?? null, mesure });
  const panier = Math.max(0, ...[...propres.values()].map((s) => s.n));
  lignes.push({
    mesure: 'reproduction',
    portee: '23-09',
    moment: '-',
    livre: '-',
    cle: 'conclusion',
    n: panier,
    valeur: mesure?.perteLog ?? null,
    bas: null,
    haut: null,
    verdict: retrouve ? 'retrouve' : 'pas-retrouve',
    detail: { retrouve, reference: REFERENCE_23_09, mesure, meneur: men?.livre ?? null, classement: men?.classement ?? [], jugements, periode: FENETRE_23_09, panier: 'avant-match football-data (relevé du vendredi/mardi), 18 championnats à fichier saisonnier, rencontres rattachées au magasin (lien = 1)' }
  });
  return { retrouve, mesure, meneur: men?.livre ?? null };
}

// ================================================================ le résumé lisible

const pts = (x, d = 1) => (Number.isFinite(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })}` : '?');
const nb = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const dec = (x, d = 4) => (Number.isFinite(x) ? x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '?');

/**
 * LE RÉSUMÉ, tiré des lignes (pur) : le livre le plus juste (clôture et relevé, tous championnats, et ses
 * jugements), celui qui bouge le premier, les biais prouvés (tous championnats), les marges de clôture, le
 * meilleur moment de chaque championnat, et le 23/09.
 */
export function resumeDeLaConnaissance(lignes, { livres = [] } = {}) {
  const titre = (cle) => livres.find((l) => l.cle === cle)?.titre ?? decrireLivre(cle)?.titre ?? cle;
  const de = (mesure, f) => lignes.filter((l) => l.mesure === mesure && f(l));
  const plusJuste = {};
  for (const moment of MOMENTS_DE_JUSTESSE) {
    const men = de('justesse', (l) => l.portee === '*' && l.moment === moment && l.cle === 'meneur')[0];
    if (!men) continue;
    const faces = de('justesse', (l) => l.portee === '*' && l.moment === moment && l.livre === men.livre && l.cle.startsWith('face|'));
    plusJuste[moment] = {
      livre: men.livre,
      titre: titre(men.livre),
      perteLog: de('justesse', (l) => l.portee === '*' && l.moment === moment && l.livre === men.livre && l.cle === 'propres')[0]?.valeur ?? null,
      jugements: faces.map((f) => ({ autre: f.detail.autre, titreAutre: titre(f.detail.autre), lecture: f.detail.lecture, n: f.n, perteLogMeneur: f.detail.perteLogMeneur, perteLogAutre: f.detail.perteLogAutre, verdict: f.verdict, dit: f.detail.dit, partVue: f.detail.vues?.part ?? null }))
    };
  }
  const premier = {};
  for (const [E] of PAIRES_DE_VITESSE) {
    const men = de('vitesse', (l) => l.portee === '*' && l.moment === E && l.cle === 'meneur')[0];
    const avances = de('vitesse', (l) => l.portee === '*' && l.moment === E && l.cle === 'avance');
    if (!men) {
      const lesPaires = de('vitesse', (l) => l.portee === '*' && l.moment === E && l.cle.startsWith('paire|'));
      premier[E] = {
        livre: null,
        raison: lesPaires.length
          ? `trop peu de matchs communs (au plus ${nb(Math.max(...lesPaires.map((l) => l.n)))})`
          : avances.length
            ? 'jamais deux livres sur un même match aux deux moments'
            : 'aucun match coté par deux livres aux deux moments'
      };
      continue;
    }
    const sienne = avances.find((a) => a.livre === men.livre);
    const faces = de('vitesse', (l) => l.portee === '*' && l.moment === E && l.livre === men.livre && l.cle.startsWith('face|'));
    premier[E] = {
      livre: men.livre,
      titre: titre(men.livre),
      avance: sienne?.valeur ?? null,
      n: sienne?.n ?? men.n,
      jugements: faces.map((f) => ({ autre: f.detail.autre, titreAutre: titre(f.detail.autre), n: f.n, verdict: f.verdict, dit: f.detail.dit, avanceMeneur: f.detail.avanceMeneur, avanceAutre: f.detail.avanceAutre }))
    };
  }
  const biais = de('biais', (l) => l.portee === '*' && (l.verdict === 'retenu' || l.verdict === 'moins-bon'))
    .map((l) => ({ livre: l.livre, titre: titre(l.livre), categorie: l.cle, moment: l.moment, ecartPoints: l.valeur, fourchette: [l.bas, l.haut], n: l.n, dit: l.detail.dit }))
    .sort((a, b) => Math.abs(b.ecartPoints) - Math.abs(a.ecartPoints));
  const marges = de('marge', (l) => l.portee === '*' && l.moment === 'cloture' && l.valeur !== null)
    .map((l) => ({ livre: l.livre, titre: titre(l.livre), moyenne: l.valeur, mediane: l.detail.mediane, n: l.n }))
    .sort((a, b) => a.moyenne - b.moyenne);
  const conclusions = de('moment', (l) => l.cle === 'conclusion');
  const moments = conclusions
    .map((l) => ({ championnat: l.portee, conclusion: l.detail.conclusion, phrase: l.detail.phrase, n: l.n, comparaisons: l.detail.comparaisons }))
    .sort((a, b) => (a.championnat === '*' ? -1 : b.championnat === '*' ? 1 : a.championnat.localeCompare(b.championnat)));
  const momentsParType = Object.fromEntries(
    de('moment', (l) => l.portee === '*' && l.cle.startsWith('conclusion|')).map((l) => [l.cle.slice('conclusion|'.length), { conclusion: l.detail.conclusion, phrase: l.detail.phrase, n: l.n, comparaisons: l.detail.comparaisons }])
  );
  const repro = de('reproduction', (l) => l.cle === 'conclusion')[0]?.detail ?? null;
  return { plusJuste, premier, biais, marges, moments, momentsParType, reproduction: repro };
}

/** Le résumé en phrases courtes (journal, script du bac, et pour écrire la feuille de route). */
export function phrasesDuResume(resume) {
  const out = [];
  for (const [moment, p] of Object.entries(resume.plusJuste ?? {})) {
    const faces = p.jugements.filter((j) => j.lecture === 'toutes');
    out.push(
      `Le plus juste ${MOMENTS[moment]} : ${p.titre} (perte log ${dec(p.perteLog)}) — ` +
        (faces.length ? faces.map((j) => `face à ${j.titreAutre} : ${j.dit} (${nb(j.n)} matchs communs)`).join(' ; ') : 'aucun jugement (trop peu de matchs communs)')
    );
  }
  for (const [E, p] of Object.entries(resume.premier ?? {})) {
    out.push(
      p.livre
        ? `Bouge le premier (${MOMENTS[E]}) : ${p.titre}, avance ${pts(p.avance * 100, 0)} % du mouvement du marché (${nb(p.n)} matchs) — ${p.jugements.map((j) => `face à ${j.titreAutre} : ${j.dit} (${pts(j.avanceMeneur * 100, 0)} % contre ${pts(j.avanceAutre * 100, 0)} %, ${nb(j.n)} matchs communs)`).join(' ; ')}`
        : `Bouge le premier (${MOMENTS[E]}) : ${p.raison}.`
    );
  }
  out.push(
    resume.biais?.length
      ? `Biais prouvés : ${resume.biais.slice(0, 12).map((b) => `${b.titre} ${b.dit} ${b.categorie} (${pts(b.ecartPoints)} point, ${nb(b.n)} matchs)`).join(' ; ')}`
      : 'Aucun biais prouvé.'
  );
  for (const m of resume.moments ?? []) out.push(`${m.championnat === '*' ? 'Tous championnats' : m.championnat} : ${m.phrase}${m.n ? ` (${nb(m.n)} matchs)` : ''}.`);
  const types = Object.entries(resume.momentsParType ?? {});
  if (types.length) out.push(`Tous championnats, par type d’issue : ${types.map(([t, x]) => `${t} — ${x.phrase}${x.n ? ` (${nb(x.n)} matchs)` : ''}`).join(' ; ')}.`);
  if (resume.reproduction) {
    const r = resume.reproduction;
    out.push(
      `23/09 ${r.retrouve ? 'retrouvé' : 'PAS retrouvé'} : ${r.mesure ? `Pinnacle ${dec(r.mesure.perteLog)} sur ${nb(r.mesure.matchs)} matchs (référence ${dec(REFERENCE_23_09.perteLog)} sur ${nb(REFERENCE_23_09.matchs)})` : 'Pinnacle absent'}, meneur ${r.meneur ?? 'aucun'}.`
    );
  }
  return out;
}

// ================================================================ le calcul complet

const OPTIONS = Object.freeze(['tirages', 'graine', 'minMatchs', 'mesures']);
const MESURES = Object.freeze(['justesse', 'vitesse', 'biais', 'marge', 'moment', 'reproduction']);

/** Les options du calcul, contrôlées : rien d'ignoré en silence. */
export function lireOptions(options = {}) {
  const inconnues = Object.keys(options).filter((k) => !OPTIONS.includes(k));
  if (inconnues.length) throw new RangeError(`connaître le marché : option inconnue (${inconnues.join(', ')}).`);
  const o = { tirages: options.tirages ?? TIRAGES, graine: options.graine ?? 1, minMatchs: options.minMatchs ?? MIN_MATCHS, mesures: options.mesures ?? MESURES };
  if (!Number.isInteger(o.tirages) || o.tirages < 100) throw new RangeError('connaître le marché : au moins 100 tirages.');
  if (!Number.isInteger(o.minMatchs) || o.minMatchs < 2) throw new RangeError('connaître le marché : un minimum de matchs d’au moins 2.');
  for (const m of o.mesures) if (!MESURES.includes(m)) throw new RangeError(`connaître le marché : mesure inconnue « ${m} ».`);
  return o;
}

/**
 * LE CALCUL : charge les relevés puis fait les six analyses. Rend { lignes, resume, bilan }. Sans
 * `rendreLaMain`, d'une traite (le processus à part) ; avec, en rendant la main toutes les ~25 ms (le
 * script du bac « --sur-place », les essais). N'écrit rien : la base est celle de l'appelant.
 */
export async function calculerLaConnaissance({ database, options = {}, releves = null, rendreLaMain = null, avancement = null } = {}) {
  const o = lireOptions(options);
  const debut = performance.now();
  const pauses = rendreLaMain ? creerPauses({ rendreLaMain: () => new Promise((fin) => rendreLaMain(fin)) }) : null;
  const executer = (gen) => (pauses ? executerEnRendantLaMain(gen, pauses.siLongtemps) : executerSansPause(gen));
  const parties = {};
  let rssMax = process.memoryUsage().rss;
  const mesurer = async (nom, gen) => {
    const t = performance.now();
    avancement?.({ partie: nom });
    const r = await executer(gen);
    parties[nom] = Math.round(performance.now() - t);
    rssMax = Math.max(rssMax, process.memoryUsage().rss);
    return r;
  };
  const R = releves ?? (await mesurer('lecture', chargerLesReleves(database)));
  const lignes = [];
  const comptes = {};
  if (o.mesures.includes('justesse')) comptes.justesse = await mesurer('justesse', analyserJustesse(R, o, lignes));
  if (o.mesures.includes('vitesse')) comptes.vitesse = await mesurer('vitesse', analyserVitesse(R, o, lignes));
  if (o.mesures.includes('biais')) comptes.biais = await mesurer('biais', analyserBiais(R, o, lignes));
  if (o.mesures.includes('marge')) comptes.marge = await mesurer('marges', analyserMarges(R, o, lignes));
  if (o.mesures.includes('moment')) comptes.moment = await mesurer('moment', analyserMoments(R, o, lignes));
  if (o.mesures.includes('reproduction')) comptes.reproduction = await mesurer('reproduction', reproduire23_09(R, o, lignes));
  const resume = resumeDeLaConnaissance(lignes, { livres: R.livres });
  const bilan = {
    version: VERSION_CONNAISSANCE,
    options: o,
    releves: R.bilan ?? { rencontres: R.matchs.length, cotes: R.n, cotesRefusees: R.refusees, livres: R.livres.length },
    livres: R.livres.map((l) => ({ cle: l.cle, titre: l.titre, type: l.type, commission: l.commission, prixJouable: l.prixJouable })),
    comptes,
    lignes: lignes.length,
    parties,
    dureeMs: Math.round(performance.now() - debut),
    rssMax,
    ...(pauses ? pauses.bilan() : {})
  };
  return { lignes, resume, bilan };
}

// ================================================================ le rangement (un seul écrivain)

/** L'empreinte des sources : ce qui, s'il ne bouge pas, ne change aucun chiffre (quelques requêtes courtes, lecture seule). */
export function empreinteDesSources({ database }) {
  const un = (sql) => {
    try {
      return database.prepare(sql).get() ?? null;
    } catch {
      return null; // table absente : l'empreinte le dit (null), elle bougera quand la table viendra
    }
  };
  return {
    version: VERSION_CONNAISSANCE,
    cotes: un('SELECT COUNT(*) AS n, COUNT(match_key) AS lies, MAX(updated_at) AS maj FROM odds_events'),
    fd: un('SELECT COUNT(*) AS n, COUNT(match_key) AS lies, MAX(id) AS dernier FROM fd_history'),
    fdFichiers: un('SELECT MAX(updated_at) AS maj FROM fd_fichiers'),
    magasin: un('SELECT COUNT(*) AS n, MAX(updated_at) AS maj FROM day_matches')
  };
}

const memeEmpreinte = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const lireJson = (t) => {
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
};

/** Le dernier calcul FINI (null s'il n'y en a pas) ; `avecResume` : son résumé et son bilan lus. */
export function dernierCalcul({ database, avecResume = true } = {}) {
  let r;
  try {
    r = database.prepare('SELECT * FROM market_knowledge_runs WHERE fini_le IS NOT NULL ORDER BY id DESC LIMIT 1').get();
  } catch {
    return null;
  }
  if (!r) return null;
  return {
    id: r.id,
    lanceLe: r.lance_le,
    finiLe: r.fini_le,
    ou: r.ou,
    version: r.version,
    empreinte: lireJson(r.empreinte),
    ...(avecResume ? { resume: lireJson(r.resume), bilan: lireJson(r.bilan) } : {})
  };
}

/** Ouvre un calcul (une ligne sans fin : un calcul interrompu se voit). Rend son numéro. */
export function ouvrirCalcul({ database, ou, empreinte, maintenant = new Date().toISOString() }) {
  return Number(database.prepare('INSERT INTO market_knowledge_runs (lance_le, ou, version, empreinte) VALUES (?, ?, ?, ?)').run(maintenant, ou, VERSION_CONNAISSANCE, JSON.stringify(empreinte ?? null)).lastInsertRowid);
}

/** Note l'échec d'un calcul (jamais fini : les lecteurs gardent le précédent). */
export function noterEchec({ database, id, bilan }) {
  database.prepare('UPDATE market_knowledge_runs SET bilan = ? WHERE id = ? AND fini_le IS NULL').run(JSON.stringify(bilan ?? null), id);
}

/**
 * Range un calcul (générateur : un `yield` entre deux transactions courtes) : les lignes par tranches de
 * 200 dans des transactions à elles, puis, dans la dernière, le calcul marqué fini (bilan, résumé) — les
 * lecteurs ne voient jamais un calcul à moitié écrit (ils lisent le dernier FINI) ; enfin le ménage : les
 * lignes des autres calculs (anciens ou interrompus) retirées par tranches, et les fiches de calcul au-delà
 * des 60 dernières. Jamais une transaction ouverte pendant un `yield`.
 */
export function* rangerLeCalcul({ database, id, lignes, bilan, resume, maintenant = () => new Date().toISOString(), tranche = 200 }) {
  const inserer = database.prepare('INSERT INTO market_knowledge (calcul, mesure, portee, moment, livre, cle, n, valeur, bas, haut, verdict, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < lignes.length; i += tranche) {
    database.exec('BEGIN IMMEDIATE');
    try {
      for (const l of lignes.slice(i, i + tranche)) {
        inserer.run(id, l.mesure, l.portee, l.moment, l.livre, l.cle, l.n, l.valeur ?? null, l.bas ?? null, l.haut ?? null, l.verdict ?? null, JSON.stringify(l.detail ?? {}));
      }
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    yield 'rangement des lignes';
  }
  const fini = database.prepare('UPDATE market_knowledge_runs SET fini_le = ?, bilan = ?, resume = ? WHERE id = ? AND fini_le IS NULL').run(maintenant(), JSON.stringify(bilan ?? null), JSON.stringify(resume ?? null), id);
  if (fini.changes !== 1) throw new Error(`connaître le marché : le calcul n° ${id} n’a pas pu être marqué fini (déjà fini, ou absent).`);
  yield* menage({ database, garder: id });
}

/** Le ménage : les lignes de tout autre calcul que `garder`, par tranches ; les fiches au-delà des 60 dernières. */
export function* menage({ database, garder, tranche = 250 }) {
  const retirer = database.prepare('DELETE FROM market_knowledge WHERE rowid IN (SELECT rowid FROM market_knowledge WHERE calcul <> ? LIMIT ?)');
  for (;;) {
    const r = retirer.run(garder, tranche);
    if (!r.changes) break;
    yield 'ménage';
  }
  database.prepare('DELETE FROM market_knowledge_runs WHERE id < (SELECT MIN(id) FROM (SELECT id FROM market_knowledge_runs ORDER BY id DESC LIMIT 60))').run();
}

// ================================================================ le calcul à part

const ENFANT = fileURLToPath(new URL('./marketKnowledgeEnfant.js', import.meta.url));
/** Le calcul complet prend deux minutes environ sur la base du bac : au-delà de 30 min, l'enfant est arrêté. */
export const DELAI_CALCUL_MS = 30 * 60_000;
/**
 * La mémoire de l'enfant : son tas plafonné à 384 Mo et une jeune génération de 8 Mo, pour qu'il ramasse
 * ses déchets au lieu de grossir — mesuré le 13/10/2026 sur la base du bac : RSS au plus haut 778 Mo sans,
 * 418 Mo avec (tas vivant ~110 Mo au plus), même durée. Un dépassement arrête l'enfant : l'étape le dit,
 * rien n'est écrit, le calcul précédent reste lu.
 */
export const OPTIONS_DE_L_ENFANT = Object.freeze(['--max-old-space-size=384', '--max-semi-space-size=8']);

/**
 * Le calcul dans un PROCESSUS À PART (le patron de valeurStatsAPart.js, étape 18) : fork de
 * marketKnowledgeEnfant.js, base en LECTURE SEULE dans l'enfant, réponse par le canal du processus. Rend
 * une promesse de { lignes, resume, bilan } ; rejette si l'enfant échoue, se tait au-delà de `delaiMs`
 * (il est alors arrêté) ou s'arrête sans répondre. Mêmes options de Node que le parent (les essais
 * gardent leur garde-fou), plus le plafond de mémoire (OPTIONS_DE_L_ENFANT).
 */
export function calculerAPart({ chemin, options = {}, empreintePrecedente = null, delaiMs = DELAI_CALCUL_MS, avancement = null }) {
  return new Promise((resolve, reject) => {
    let fini = false;
    let erreurs = '';
    const enfant = fork(ENFANT, [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [...process.execArgv, ...OPTIONS_DE_L_ENFANT] });
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
      if (m?.avancement) {
        avancement?.(m.avancement);
        return;
      }
      clearTimeout(minuterie);
      if (fini) return;
      fini = true;
      if (m?.erreur) reject(new Error(m.erreur));
      else resolve(m);
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
    enfant.send({ chemin, options, empreintePrecedente });
  });
}

/**
 * Le calcul, SEULEMENT S'IL Y A DU NEUF (dans le processus à part, ou sur place) : l'empreinte des sources
 * (empreinteDesSources : odds_events, fd_history, fd_fichiers, day_matches — des balayages de tables, qui
 * tiennent 0,3 à 0,5 s à froid sur la base de Pierre : jamais dans le serveur), puis, si elle est celle du
 * dernier calcul fini (`empreintePrecedente`), { rien: true, empreinte } ; sinon le calcul complet,
 * { lignes, resume, bilan, empreinte }. L'empreinte est lue AVANT les cotes : une cote arrivée pendant le
 * calcul fera recalculer la nuit suivante, jamais l'inverse.
 */
export async function calculerSiBesoin({ database, options = {}, empreintePrecedente = null, rendreLaMain = null, avancement = null }) {
  const empreinte = empreinteDesSources({ database });
  if (empreintePrecedente && memeEmpreinte(empreintePrecedente, empreinte)) return { rien: true, empreinte };
  const r = await calculerLaConnaissance({ database, options, rendreLaMain, avancement });
  return { ...r, empreinte };
}

// ================================================================ la nuit

/**
 * LA PASSE DE NUIT (étape « connaitreMarche » de l'actualisation ; le script du bac l'appelle aussi), à
 * appeler SOUS le verrou d'actualisation :
 *   1. le dernier calcul fini (une ligne), puis le PROCESSUS À PART (`aPart: false` : ici, en rendant la
 *      main), attendu sans tenir la main : il lit l'empreinte des sources et, si elle n'a pas bougé depuis
 *      ce calcul (même version, sans `force`), répond RIEN — rien n'est écrit, pas même une fiche ; sinon il
 *      calcule tout, base en lecture seule (calculerSiBesoin) ;
 *   2. la fiche du calcul (une ligne de market_knowledge_runs, l'empreinte lue par l'enfant), puis le
 *      rangement par tranches courtes, la main rendue entre deux (rangerLeCalcul) ;
 *   3. en échec (enfant en panne, sans réponse, ou rangement refusé), la fiche reste « pas finie » avec
 *      son erreur, les lecteurs gardent le précédent, la passe suivante recommence.
 * Rend un bilan pour le résumé de l'étape. Jamais d'exception pour une panne du calcul : `erreur`.
 */
export async function connaitreLeMarche({
  database = openDb(),
  chemin = resolveDbPath(),
  ou = 'serveur',
  force = false,
  aPart = true,
  options = {},
  delaiMs = DELAI_CALCUL_MS,
  rendreLaMain = rendreLaMainParDefaut,
  maintenant = () => new Date().toISOString()
} = {}) {
  const debut = performance.now();
  const pauses = creerPauses({ rendreLaMain });
  const avant = dernierCalcul({ database, avecResume: false });
  const empreintePrecedente = !force && avant && avant.version === VERSION_CONNAISSANCE ? avant.empreinte : null;
  const lanceLe = maintenant();
  let r;
  try {
    r = aPart
      ? await pauses.attendre(calculerAPart({ chemin, options, empreintePrecedente, delaiMs }), 'calcul à part')
      : await calculerSiBesoin({ database, options, empreintePrecedente, rendreLaMain: (fin) => rendreLaMain().then(fin) });
  } catch (error) {
    const bilan = { erreur: String(error?.message ?? error), dureeMs: Math.round(performance.now() - debut) };
    const id = ouvrirCalcul({ database, ou, empreinte: null, maintenant: lanceLe });
    noterEchec({ database, id, bilan });
    return { mode: 'echec', calcul: id, erreur: bilan.erreur, empreinte: null, dureeMs: bilan.dureeMs, ...pauses.bilan() };
  }
  if (r.rien) return { mode: 'rien', calcul: avant.id, finiLe: avant.finiLe, empreinte: r.empreinte, dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
  const empreinte = r.empreinte;
  const id = ouvrirCalcul({ database, ou, empreinte, maintenant: lanceLe });
  const tRangement = performance.now();
  try {
    await executerEnRendantLaMain(rangerLeCalcul({ database, id, lignes: r.lignes, bilan: r.bilan, resume: r.resume, maintenant }), pauses.siLongtemps);
  } catch (error) {
    const bilan = { ...r.bilan, erreur: `rangement : ${String(error?.message ?? error)}` };
    try {
      noterEchec({ database, id, bilan });
    } catch {
      // la base refuse aussi cette écriture : le calcul reste « pas fini », la passe suivante recommence
    }
    return { mode: 'echec', calcul: id, erreur: bilan.erreur, empreinte, dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
  }
  return {
    mode: avant ? 'recalcul' : 'premier',
    calcul: id,
    empreinte,
    lignes: r.lignes.length,
    resume: r.resume,
    bilanDuCalcul: r.bilan,
    rangementMs: Math.round(performance.now() - tRangement),
    dureeMs: Math.round(performance.now() - debut),
    ...pauses.bilan()
  };
}

// ================================================================ la lecture (étapes 23 et 31)

const CHAMPS_LUS = 'mesure, portee, moment, livre, cle, n, valeur, bas, haut, verdict, detail';
const ligneLue = (r) => ({ ...r, detail: lireJson(r.detail) ?? {} });

/**
 * LA LECTURE pour les étapes 23 (où parier) et 31 (page « Bookmakers ») — lecture seule, jamais une
 * écriture. Rend null tant qu'aucun calcul n'est fini ; sinon :
 *   {
 *     calcul: { id, finiLe, version, empreinte },        le dernier calcul FINI
 *     resume,                                              resumeDeLaConnaissance (le plus juste, le premier, biais, marges, moments, 23/09)
 *     livres: [{ cle, titre, type, commission, prixJouable }],
 *     justesse, vitesse, biais, marges, moments, reproduction : des lignes
 *       { mesure, portee, moment, livre, cle, n, valeur, bas, haut, verdict, detail }
 *   }
 * Chaque ligne porte son nombre de matchs `n`. Clés (`cle`) : justesse — 'propres' (le livre sur SES
 * matchs, pour information), 'paire|<autre>' (les deux livres sur leurs matchs communs : valeur = perte
 * log du livre, detail.perteLogAutre), 'meneur', 'face|<autre>' et 'face|<autre>|jamais-vues' (le juge :
 * valeur = perte log de l'autre − celle du meneur, bas/haut = la fourchette, verdict de comparer) ;
 * vitesse — 'avance' (valeur = β, part du mouvement du marché déjà faite au moment tôt), 'face|<autre>' ;
 * biais — la catégorie (valeur = réalisé − annoncé, en points ; verdict retenu = sous-estime, moins-bon =
 * surestime) ; marges — 'marge' (valeur = marge moyenne en %, null pour une bourse) ; moments — 'valeur'
 * (valeur de clôture moyenne en % à ce moment), 'face|<moment tard>' (valeur = tard − tôt, en points),
 * 'conclusion' (detail.phrase : « mieux vaut parier … »). Portée « * » : tous les championnats.
 * Filtres : `championnat` (la portée, « * » compris si demandé), `livre` (ses lignes et celles de toute
 * la portée, livre « - »), `mesures`.
 */
export function lireConnaissanceDuMarche({ database, championnat = null, livre = null, mesures = null } = {}) {
  const calcul = dernierCalcul({ database });
  if (!calcul) return null;
  const conditions = ['calcul = ?'];
  const params = [calcul.id];
  if (championnat !== null) {
    conditions.push('portee = ?');
    params.push(championnat);
  }
  if (livre !== null) {
    conditions.push("livre IN (?, '-')");
    params.push(livre);
  }
  if (mesures) {
    conditions.push(`mesure IN (${mesures.map(() => '?').join(', ')})`);
    params.push(...mesures);
  }
  const lignes = database.prepare(`SELECT ${CHAMPS_LUS} FROM market_knowledge WHERE ${conditions.join(' AND ')} ORDER BY mesure, portee, moment, livre, cle`).all(...params).map(ligneLue);
  const de = (m) => lignes.filter((l) => l.mesure === m);
  return {
    calcul: { id: calcul.id, finiLe: calcul.finiLe, version: calcul.version, empreinte: calcul.empreinte },
    resume: calcul.resume,
    livres: calcul.bilan?.livres ?? [],
    justesse: de('justesse'),
    vitesse: de('vitesse'),
    biais: de('biais'),
    marges: de('marge'),
    moments: de('moment'),
    reproduction: de('reproduction')
  };
}

/** Le livre le plus juste d'un championnat (« * » : tous) à un moment, et ses jugements ; null sans meneur. */
export function livreLePlusJuste({ database, championnat = '*', moment = 'cloture' } = {}) {
  const c = dernierCalcul({ database, avecResume: false });
  if (!c) return null;
  const lignes = database.prepare(`SELECT ${CHAMPS_LUS} FROM market_knowledge WHERE calcul = ? AND mesure = 'justesse' AND portee = ? AND moment = ?`).all(c.id, championnat, moment).map(ligneLue);
  const men = lignes.find((l) => l.cle === 'meneur');
  if (!men) return null;
  return {
    livre: men.livre,
    titre: decrireLivre(men.livre)?.titre ?? men.livre,
    n: men.n,
    perteLog: lignes.find((l) => l.livre === men.livre && l.cle === 'propres')?.valeur ?? null,
    jugements: lignes.filter((l) => l.livre === men.livre && l.cle.startsWith('face|')).map((l) => ({ autre: l.detail.autre, lecture: l.detail.lecture, n: l.n, verdict: l.verdict, dit: l.detail.dit, gain: l.valeur, fourchette: [l.bas, l.haut] }))
  };
}

/**
 * Le meilleur moment pour parier dans un championnat (« * » : tous) : { conclusion, phrase, n,
 * comparaisons, valeurs, parType } ou null. `comparaisons` : les paires de moments jugées sur une issue
 * prise au hasard ; `parType` (tous les championnats seulement) : la même chose pour le favori, le nul et
 * l'outsider — { favori: { conclusion, phrase, n, comparaisons }, … }.
 */
export function meilleurMomentDe({ database, championnat = '*' } = {}) {
  const c = dernierCalcul({ database, avecResume: false });
  if (!c) return null;
  const lignes = database.prepare(`SELECT ${CHAMPS_LUS} FROM market_knowledge WHERE calcul = ? AND mesure = 'moment' AND portee = ?`).all(c.id, championnat).map(ligneLue);
  const conclusion = lignes.find((l) => l.cle === 'conclusion');
  if (!conclusion) return null;
  // « face|<tard> » : une issue au hasard ; « face|<tard>|<type> » : un type d'issue.
  const comparaison = (l) => ({ tot: l.moment, tard: l.cle.split('|')[1], n: l.n, ecartPoints: l.valeur, fourchette: [l.bas, l.haut], verdict: l.verdict, dit: l.detail.dit });
  const parType = {};
  for (const t of TYPES_D_ISSUE) {
    const ct = lignes.find((l) => l.cle === `conclusion|${t}`);
    if (!ct) continue;
    parType[t] = {
      conclusion: ct.detail.conclusion,
      phrase: ct.detail.phrase,
      n: ct.n,
      comparaisons: lignes.filter((l) => l.cle.startsWith('face|') && l.cle.split('|')[2] === t).map(comparaison)
    };
  }
  return {
    conclusion: conclusion.detail.conclusion,
    phrase: conclusion.detail.phrase,
    n: conclusion.n,
    comparaisons: lignes.filter((l) => l.cle.startsWith('face|') && l.cle.split('|').length === 2).map(comparaison),
    valeurs: Object.fromEntries(lignes.filter((l) => l.cle === 'valeur').map((l) => [l.moment, { valeurDeCloture: l.valeur, n: l.n, parIssue: l.detail.parIssue }])),
    parType
  };
}

/** La marge d'un livre dans un championnat (« * » : tous) à un moment : { n, moyenne, mediane } ; null sans cote. */
export function margeDe({ database, livre, championnat = '*', moment = 'cloture' } = {}) {
  const c = dernierCalcul({ database, avecResume: false });
  if (!c) return null;
  const l = database.prepare(`SELECT ${CHAMPS_LUS} FROM market_knowledge WHERE calcul = ? AND mesure = 'marge' AND portee = ? AND moment = ? AND livre = ? AND cle = 'marge'`).get(c.id, championnat, moment, livre);
  if (!l) return null;
  const x = ligneLue(l);
  return { n: x.n, moyenne: x.valeur, mediane: x.detail.mediane, type: x.detail.type, commission: x.detail.commission ?? null };
}

export const __pourLesTests = Object.freeze({ IM, LISTE_MOMENTS, cotesAuMoment, analyserJustesse, analyserVitesse, analyserBiais, analyserMarges, analyserMoments, reproduire23_09, LIVRES_23_09 });
