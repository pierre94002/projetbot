/**
 * footballDataHistory.js — l'historique football-data.co.uk depuis 2000.
 * -----------------------------------------------------------------------
 * Étape 13 du plan (06/10/2026). Le magasin FotMob commence en janvier 2023 :
 * trois saisons. football-data.co.uk publie gratuitement, en CSV, vingt-six
 * saisons de plus pour 22 divisions européennes (un fichier par division et
 * par saison, mmz4281/<saison>/<code>.csv) et 16 fichiers par pays (toutes
 * saisons dans un fichier, new/<pays>.csv, clôture 1X2 seulement) : environ
 * 600 fichiers depuis 2000-01.
 *
 * CE QUI EST GARDÉ, une ligne compacte par match (table fd_history, cf.
 * matchStatsDb.js) : scores final et mi-temps, tirs, tirs cadrés, corners,
 * fautes (ou coups francs concédés quand le fichier n'a qu'eux), cartons,
 * xG quand le fichier les donne, arbitre, et les cotes d'avant-match
 * (« pré-clôture », relevées le vendredi ou le mardi) et de clôture : moyenne
 * et maximum du marché, Pinnacle, Bet365, William Hill — 1X2, plus/moins 2,5
 * buts et handicap asiatique à la ligne du marché, là où le fichier les a.
 * Rien d'autre pour les buts (ni 1,5, ni 3,5, ni « les deux marquent ») :
 * le site ne les publie pas.
 *
 * LES CLUBS. L'identité d'un club est son nom football-data DANS SON PAYS
 * (fd_teams) : le site écrit le même club de la même façon d'une saison à
 * l'autre, et l'on ne rapproche jamais deux noms qui se ressemblent
 * (« Port », « Portsmouth » et « Porto » ont déjà trompé le projet). Le lien
 * vers l'identifiant FotMob vient du VOTE déjà utilisé pour les cotes
 * (footballDataOdds.voterParDateEtScore) : sur les saisons communes avec le
 * magasin, une ligne dont le jour (± 1) et le score désignent UNE seule
 * rencontre FotMob dit quel club porte chacun de ses deux noms ; majorité
 * nette (60 %) sur au moins deux votes, toutes divisions du pays réunies.
 * Ce lien vaut pour toute l'histoire du nom : « Man United » de 2000 est le
 * club FotMob 10260. Un club disparu des championnats suivis avant 2023 garde
 * sa seule identité football-data. Chaque ligne de la période commune est
 * ensuite rattachée à SA rencontre FotMob par les deux identifiants (± 3
 * jours), score vérifié : même score, ou score différent (la rencontre est
 * gardée, pour qu'on dise laquelle), ou rien.
 *
 * UN SEUL ÉCRIVAIN. Dans l'appli, l'import se fait par le serveur lui-même,
 * dans l'actualisation (étape « historiqueFd » de matchStatsAutoRefresh.js),
 * par morceaux de 150 requêtes au plus : l'état de chaque fichier
 * (fd_fichiers) est le curseur de reprise, et la première fois l'import
 * s'étale sur quatre à cinq passes. Ensuite, chaque semaine, les fichiers de
 * la saison en cours et les fichiers par pays — que l'étape « cotes
 * passées » retélécharge déjà toutes les douze heures : ils sont repris de
 * son cache (footballDataCache.js), seuls les cinq qu'elle ne lit pas sont
 * demandés au site. Au moins 1,5 s entre deux requêtes de ce module, en-tête
 * de navigateur (le site refuse les autres).
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import { openDb, COLONNES_COTES_FD } from '../db/matchStatsDb.js';
import { readSourceState, writeSourceState } from '../db/oddsQuotesRepository.js';
import {
  FD_SAISONNIERS,
  FD_PAYS,
  UA,
  dateIso,
  coupDEnvoiUtc,
  saisonCourante,
  rencontresParJour,
  voterParDateEtScore,
  traduireLesVotes,
  rattacherParIdentifiants
} from './footballDataOdds.js';
import { dossierCache, deposerDansLeCache, lireDuCache, dateDansLeCache, sha1, tailleDuCache } from './footballDataCache.js';

export const BASE = 'https://www.football-data.co.uk';
/** Au moins 1,5 s entre deux requêtes de ce module (règle de l'étape). */
export const ECART_MS = 1500;
const DELAI_MS = 20_000;
/** Requêtes au plus par passe de l'actualisation : la première fois, l'import complet s'étale sur quatre à cinq passes. */
export const REQUETES_PAR_PASSE = 150;
/** Une passe ne garde pas le verrou plus longtemps que ça pour l'historique. */
const DUREE_MAX_PASSE_MS = 10 * 60_000;
/** Un fichier qui grossit encore (saison en cours, fichier par pays) est relu au plus une fois par semaine. */
export const SEMAINE_MS = 7 * 86_400_000;
/** Ligne de l'état dans odds_source_state. */
export const SOURCE_ETAT = 'fd-historique';
/** Première saison gardée : 2000-01. */
export const PREMIERE_SAISON = '0001';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decaler = (iso, jours) => new Date(Date.parse(`${iso}T00:00:00Z`) + jours * 86_400_000).toISOString().slice(0, 10);

/**
 * Les 22 divisions à fichier saisonnier : le PAYS (portée de l'identité des
 * clubs : un club promu ou relégué garde son identité d'une division à
 * l'autre) et, si elle est plus récente que 2000-01, la première saison que
 * le site publie (relevé des pages de pays du 06/10/2026 : la National League
 * commence en 2005-06).
 */
export const DIVISIONS = Object.freeze({
  E0: { pays: 'ENG', nom: 'Angleterre — Premier League' },
  E1: { pays: 'ENG', nom: 'Angleterre — Championship' },
  E2: { pays: 'ENG', nom: 'Angleterre — League One' },
  E3: { pays: 'ENG', nom: 'Angleterre — League Two' },
  EC: { pays: 'ENG', nom: 'Angleterre — National League', depuis: '0506' },
  SC0: { pays: 'SCO', nom: 'Écosse — Premiership' },
  SC1: { pays: 'SCO', nom: 'Écosse — Championship' },
  SC2: { pays: 'SCO', nom: 'Écosse — League One' },
  SC3: { pays: 'SCO', nom: 'Écosse — League Two' },
  D1: { pays: 'GER', nom: 'Allemagne — Bundesliga' },
  D2: { pays: 'GER', nom: 'Allemagne — 2. Bundesliga' },
  I1: { pays: 'ITA', nom: 'Italie — Serie A' },
  I2: { pays: 'ITA', nom: 'Italie — Serie B' },
  SP1: { pays: 'ESP', nom: 'Espagne — LaLiga' },
  SP2: { pays: 'ESP', nom: 'Espagne — LaLiga 2' },
  F1: { pays: 'FRA', nom: 'France — Ligue 1' },
  F2: { pays: 'FRA', nom: 'France — Ligue 2' },
  N1: { pays: 'NED', nom: 'Pays-Bas — Eredivisie' },
  B1: { pays: 'BEL', nom: 'Belgique — Pro League' },
  P1: { pays: 'POR', nom: 'Portugal — Primeira Liga' },
  T1: { pays: 'TUR', nom: 'Turquie — Süper Lig' },
  G1: { pays: 'GRE', nom: 'Grèce — Super League' }
});

/** Les 16 fichiers par pays (toutes saisons depuis 2012 environ, clôture 1X2 seulement). */
export const FICHIERS_PAR_PAYS = Object.freeze({
  ARG: 'Argentine — Liga Profesional',
  AUT: 'Autriche — Bundesliga',
  BRA: 'Brésil — Série A',
  CHN: 'Chine — Super League',
  DNK: 'Danemark — Superliga',
  FIN: 'Finlande — Veikkausliiga',
  IRL: 'Irlande — Premier Division',
  JPN: 'Japon — J1 League',
  MEX: 'Mexique — Liga MX',
  NOR: 'Norvège — Eliteserien',
  POL: 'Pologne — Ekstraklasa',
  ROU: 'Roumanie — Liga I',
  RUS: 'Russie — Premier League',
  SWE: 'Suède — Allsvenskan',
  SWZ: 'Suisse — Super League',
  USA: 'États-Unis — MLS'
});

/** La compétition du magasin d'un code football-data, ou null (division que le magasin ne suit pas : National League, Écosse 2 à 4, Japon). */
export const championnatDuMagasin = (code) => FD_SAISONNIERS[code] ?? FD_PAYS[code] ?? null;
/** La portée de l'identité des clubs d'un code : ENG, SCO… ou le code du fichier par pays. */
export const paysDuCode = (code) => DIVISIONS[code]?.pays ?? (FICHIERS_PAR_PAYS[code] ? code : null);
/** Le nom affiché d'un code. */
export const nomDuCode = (code) => DIVISIONS[code]?.nom ?? FICHIERS_PAR_PAYS[code] ?? code;

/** « 0001 » -> « 2000-01 », « 2627 » -> « 2026-27 ». */
export function libelleSaison(code) {
  const m = String(code ?? '').match(/^(\d{2})(\d{2})$/);
  return m ? `20${m[1]}-${m[2]}` : null;
}

/** La saison d'une ligne de fichier par pays : « 2012/2013 » -> « 2012-13 », « 2026 » -> « 2026 ». */
export function saisonDuFichierPays(texte, date) {
  const t = String(texte ?? '').trim();
  let m = t.match(/^(\d{4})\s*[/-]\s*(\d{4}|\d{2})$/);
  if (m) return `${m[1]}-${m[2].slice(-2)}`;
  m = t.match(/^(\d{4})$/);
  if (m) return m[1];
  return date ? date.slice(0, 4) : null;
}

/**
 * Tous les fichiers, dans l'ordre du curseur : les fichiers par pays d'abord
 * (ils couvrent les saisons récentes), puis de la saison en cours jusqu'à
 * 2000-01, les 22 divisions de chaque saison. ~605 fichiers en octobre 2026.
 */
export function listeDesFichiers({ aujourdhui = new Date() } = {}) {
  const courante = saisonCourante(aujourdhui);
  const fin = Number(courante.slice(0, 2));
  const fichiers = [];
  for (const code of Object.keys(FICHIERS_PAR_PAYS)) {
    fichiers.push({ fichier: `new/${code}`, code, saison: null, url: `${BASE}/new/${code}.csv`, enCours: true });
  }
  for (let debut = fin; debut >= Number(PREMIERE_SAISON.slice(0, 2)); debut--) {
    const s = `${String(debut).padStart(2, '0')}${String(debut + 1).padStart(2, '0')}`;
    for (const [code, d] of Object.entries(DIVISIONS)) {
      if (d.depuis && s < d.depuis) continue;
      fichiers.push({ fichier: `mmz4281/${s}/${code}`, code, saison: s, url: `${BASE}/mmz4281/${s}/${code}.csv`, enCours: s === courante });
    }
  }
  return fichiers;
}

/* =======================================================================
 * LECTURE D'UN FICHIER (fonctions pures)
 * ===================================================================== */

/**
 * Noms abîmés À LA SOURCE, remis d'aplomb : le seul connu, « Preußen
 * Münster », dont le « ß » est publié en octets C3 78 (au lieu de C3 9F).
 * Sans cela, les saisons abîmées et les autres feraient deux clubs.
 */
const CARACTERE_ABIME = String.fromCharCode(0xfffd);
const NOMS_ABIMES = { [`Preu${CARACTERE_ABIME}xen Münster`]: 'Preußen Münster' };

/**
 * Octets -> texte. Les fichiers récents sont en UTF-8 (avec BOM) ; quelques
 * anciens, en Windows 1252 (accents des arbitres). UTF-8 quand le fichier a
 * son BOM ou se lit sans faute, ou quand une ou deux fautes seules abîment
 * un fichier par ailleurs en UTF-8 (cas du « ß » ci-dessus) ; sinon Windows 1252.
 */
export function decoderCsv(octets) {
  const b = Buffer.isBuffer(octets) ? octets : Buffer.from(octets ?? []);
  const bom = b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
  const souple = new TextDecoder('utf-8').decode(b);
  const fautes = (souple.match(/�/g) ?? []).length;
  if (bom || fautes === 0) return { texte: souple, encodage: 'utf-8', fautes };
  const accents = (souple.match(/[^\x00-\x7F�]/g) ?? []).length;
  if (fautes <= 2 && accents > 0) return { texte: souple, encodage: 'utf-8', fautes };
  return { texte: new TextDecoder('windows-1252').decode(b), encodage: 'windows-1252', fautes: 0 };
}

/**
 * Un fichier de football-data commence par un en-tête qui nomme au moins Date
 * et l'équipe à domicile : HomeTeam (fichiers saisonniers), Home (fichiers par
 * pays) ou HT (les plus anciens fichiers grecs, 2000-01 à 2004-05).
 */
export function estCsvFootballData(texte) {
  const entetes = String(texte ?? '').replace(/^﻿/, '').split(/\r?\n/, 1)[0].split(',').map((h) => h.trim());
  return entetes.includes('Date') && (entetes.includes('HomeTeam') || entetes.includes('Home') || entetes.includes('HT'));
}

/**
 * Le CSV des fichiers ANCIENS a parfois des champs entre guillemets qui
 * contiennent une virgule : l'arbitre « Wiley, A. G. » (Angleterre, Écosse et
 * Allemagne en 2001-02), la ligne de handicap « -0.5,-1 » (Espagne 2 en
 * 2009-10). Découper aux virgules seules (lireCsv de footballDataOdds.js, fait
 * pour les fichiers récents) décalerait toutes les colonnes suivantes de la
 * ligne : tirs, cartons et cotes faux, sans erreur. Rend des objets
 * { nom de colonne: valeur }, en-têtes et valeurs sans espaces autour.
 */
export function lireCsvHistorique(texte) {
  const t = String(texte ?? '').replace(/^﻿/, '');
  const lignes = [];
  let ligne = [];
  let champ = '';
  let entre = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entre) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          champ += '"';
          i++;
        } else entre = false;
      } else champ += c;
    } else if (c === '"') entre = true;
    else if (c === ',') {
      ligne.push(champ);
      champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      ligne.push(champ);
      champ = '';
      if (ligne.some((x) => x.trim() !== '')) lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  if (champ !== '' || ligne.length) {
    ligne.push(champ);
    if (ligne.some((x) => x.trim() !== '')) lignes.push(ligne);
  }
  if (!lignes.length) return [];
  const entetes = lignes[0].map((h) => h.trim());
  return lignes.slice(1).map((l) => Object.fromEntries(entetes.map((h, i) => [h, (l[i] ?? '').trim()])));
}

const entier = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};
/** Une cote (> 1) en centièmes, ou null ; `arrondie` dit si le site donnait plus de deux décimales. */
function centiemes(v) {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 1) return null;
  return Math.round(n * 100);
}
/**
 * Ligne de handicap asiatique (multiple de 0,25, |ligne| ≤ 10) en centièmes de
 * but, ou null. Une ligne « partagée » écrite en deux valeurs à un demi-but
 * d'écart (« -0.5,-1 », Espagne 2 en 2009-10) est le quart entre les deux :
 * -0,75. Toute autre écriture n'est pas devinée.
 */
export function ligneEnCentiemes(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const t = String(v).trim();
  const deux = t.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (deux && Math.abs(Math.abs(Number(deux[1]) - Number(deux[2])) - 0.5) > 1e-9) return null;
  const n = deux ? (Number(deux[1]) + Number(deux[2])) / 2 : Number(t);
  if (!Number.isFinite(n) || Math.abs(n) > 10 || Math.abs(n * 4 - Math.round(n * 4)) > 1e-9) return null;
  return Math.round(n * 100);
}
/** xG (≥ 0) en centièmes, ou null. */
function xgEnCentiemes(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 20 ? Math.round(n * 100) : null;
}

/**
 * LES COLONNES DE COTES gardées, livre par livre : pour chaque marché et
 * chaque moment (avant-match, clôture), les jeux de colonnes possibles par
 * ordre de préférence — toujours des NOMS COMPLETS, jamais un préfixe deviné
 * (les colonnes BF/BFD de Betfair et Betfred se confondent si l'on découpe
 * un nom au jugé ; cf. planDesColonnes de footballDataOdds.js). La moyenne et
 * le maximum du marché s'appellent Avg/Max depuis 2019-20 et BbAv/BbMx
 * (BetBrain) avant ; Pinnacle PS (1X2) ou P ; la clôture n'existe que depuis
 * 2019-20 (2012-13 pour Pinnacle) ; William Hill n'a que le 1X2.
 */
const LIVRES_HISTO = [
  { cle: 'moy', nom: 'Moyenne du marché', x: ['Avg', 'BbAv'], xc: ['Avg'], ou: ['Avg', 'BbAv'], ouc: ['Avg'], ah: ['Avg', 'BbAv'], ahc: ['Avg'] },
  { cle: 'max', nom: 'Maximum du marché', x: ['Max', 'BbMx'], xc: ['Max'], ou: ['Max', 'BbMx'], ouc: ['Max'], ah: ['Max', 'BbMx'], ahc: ['Max'] },
  { cle: 'pin', nom: 'Pinnacle', x: ['PS', 'P'], xc: ['PS', 'P'], ou: ['P'], ouc: ['P'], ah: ['P'], ahc: ['P'] },
  { cle: 'b365', nom: 'Bet365', x: ['B365'], xc: ['B365'], ou: ['B365'], ouc: ['B365'], ah: ['B365'], ahc: ['B365'] },
  { cle: 'wh', nom: 'William Hill', x: ['WH'], xc: ['WH'], ou: [], ouc: [], ah: [], ahc: [] }
];
export const LIVRES_HISTORIQUE = Object.freeze(LIVRES_HISTO.map((l) => ({ cle: l.cle, nom: l.nom })));

/** La ligne de handicap d'un préfixe : celle du marché (AHh, depuis 2019-20) ou celle de BetBrain (BbAHh) pour les préfixes Bb. */
const ligneDuPrefixe = (prefixe, cloture) => (cloture ? (prefixe.startsWith('Bb') ? null : 'AHCh') : prefixe.startsWith('Bb') ? 'BbAHh' : 'AHh');

const plansConnus = new Map();
/**
 * Le plan des cotes d'un en-tête : [{ colonnes: [noms du fichier], cibles:
 * [colonnes de fd_history], ligne: { source, cible } | null }]. Un jeu n'est
 * retenu que si TOUTES ses colonnes existent ; une colonne du fichier ne
 * sert qu'une fois ; un livre n'a qu'un jeu par marché et par moment. Pour
 * le handicap, une seule ligne par moment : AHh quand le fichier l'a (et
 * alors seuls les jeux à cette ligne comptent), sinon BbAHh.
 */
export function planDesCotes(entetes) {
  const cle = entetes.join(',');
  const connu = plansConnus.get(cle);
  if (connu) return connu;
  const presentes = new Set(entetes);
  const prises = new Set();
  const plan = [];
  const ligneAvant = presentes.has('AHh') ? 'AHh' : presentes.has('BbAHh') ? 'BbAHh' : null;
  const ligneClo = presentes.has('AHCh') ? 'AHCh' : null;
  const prendre = (colonnes, cibles, ligne = null) => {
    if (!colonnes.every((c) => presentes.has(c) && !prises.has(c))) return false;
    for (const c of colonnes) prises.add(c);
    plan.push({ colonnes, cibles, ligne });
    return true;
  };
  for (const l of LIVRES_HISTO) {
    l.x.some((p) => prendre([`${p}H`, `${p}D`, `${p}A`], [`${l.cle}_1`, `${l.cle}_n`, `${l.cle}_2`]));
    l.xc.some((p) => prendre([`${p}CH`, `${p}CD`, `${p}CA`], [`${l.cle}_c1`, `${l.cle}_cn`, `${l.cle}_c2`]));
    l.ou.some((p) => prendre([`${p}>2.5`, `${p}<2.5`], [`${l.cle}_p25`, `${l.cle}_m25`]));
    l.ouc.some((p) => prendre([`${p}C>2.5`, `${p}C<2.5`], [`${l.cle}_cp25`, `${l.cle}_cm25`]));
    if (ligneAvant) l.ah.filter((p) => ligneDuPrefixe(p, false) === ligneAvant).some((p) => prendre([`${p}AHH`, `${p}AHA`], [`${l.cle}_ahd`, `${l.cle}_ahe`], { source: ligneAvant, cible: 'ah_ligne' }));
    if (ligneClo) l.ahc.filter((p) => ligneDuPrefixe(p, true) === ligneClo).some((p) => prendre([`${p}CAHH`, `${p}CAHA`], [`${l.cle}_cahd`, `${l.cle}_cahe`], { source: ligneClo, cible: 'ah_cligne' }));
  }
  if (plansConnus.size >= 128) plansConnus.clear();
  plansConnus.set(cle, plan);
  return plan;
}

/** Les cotes d'une ligne de fichier, en centièmes : { moy_1: 225, …, ah_ligne: -25 } (cases vides absentes). */
export function cotesDeLaLigne(brute, plan = planDesCotes(Object.keys(brute))) {
  const cotes = {};
  for (const p of plan) {
    let ligne = null;
    if (p.ligne) {
      ligne = ligneEnCentiemes(brute[p.ligne.source]);
      // Une cote de handicap sans sa ligne ne se garde pas : on ne devine jamais une ligne.
      if (ligne === null) continue;
    }
    const valeurs = p.colonnes.map((c) => centiemes(brute[c]));
    if (valeurs.every((v) => v === null)) continue;
    p.cibles.forEach((cible, i) => {
      if (valeurs[i] !== null) cotes[cible] = valeurs[i];
    });
    if (p.ligne) cotes[p.ligne.cible] = ligne;
  }
  return cotes;
}

const corrigerNom = (nom) => {
  const n = String(nom ?? '').trim().replace(/\s+/g, ' ');
  return NOMS_ABIMES[n] ?? n;
};

/** Bornes plausibles d'une saison de fichier saisonnier (juin de la 1re année à août de la 2e : la saison 2019-20 a fini en août). */
function bornesDeSaison(code) {
  const m = String(code ?? '').match(/^(\d{2})(\d{2})$/);
  if (!m) return null;
  return { debut: `20${m[1]}-06-01`, fin: `20${m[2]}-08-31` };
}

/**
 * Les matchs d'un fichier, dans un format commun. Rend { lignes, ignorees,
 * raisons, doublons, arrondies, entetes } — `lignes` : { date (jour UTC du
 * coup d'envoi), dateFichier, heure, saison, dom, ext, bd, be, mtd, mte,
 * stats…, arbitre, cotes }. Une ligne sans date, sans clubs ou sans score
 * est ignorée (et comptée) ; une date hors de la saison du fichier aussi
 * (une année à deux chiffres mal lue). Deux fois le même match (même jour
 * écrit, mêmes clubs) dans un fichier : gardé une fois.
 */
export function lireFichierHistorique(texte, { code, saison = null } = {}) {
  const brutes = lireCsvHistorique(texte);
  const entetes = brutes.length ? Object.keys(brutes[0]) : String(texte ?? '').replace(/^﻿/, '').split(/\r?\n/, 1)[0].split(',').map((h) => h.trim());
  const plan = planDesCotes(entetes);
  const bornes = saison ? bornesDeSaison(saison) : null;
  const libelle = saison ? libelleSaison(saison) : null;
  const lignes = [];
  const raisons = {};
  const vus = new Set();
  let doublons = 0;
  const ignorer = (raison) => {
    raisons[raison] = (raisons[raison] ?? 0) + 1;
  };
  for (const b of brutes) {
    const dateFichier = dateIso(b.Date);
    // HomeTeam/AwayTeam (fichiers saisonniers), Home/Away (par pays), HT/AT (anciens fichiers grecs).
    const dom = corrigerNom(b.HomeTeam ?? b.Home ?? b.HT);
    const ext = corrigerNom(b.AwayTeam ?? b.Away ?? b.AT);
    const bd = entier(b.FTHG ?? b.HG);
    const be = entier(b.FTAG ?? b.AG);
    if (!dateFichier && !dom && !ext) continue; // ligne vide (virgules seules) : pas un match
    if (!dateFichier) {
      ignorer('date illisible');
      continue;
    }
    if (!dom || !ext) {
      ignorer('club manquant');
      continue;
    }
    if (bd === null || be === null) {
      ignorer('score manquant');
      continue;
    }
    if (bornes && (dateFichier < bornes.debut || dateFichier > bornes.fin)) {
      ignorer('date hors de la saison du fichier');
      continue;
    }
    const cle = `${dateFichier}|${dom}|${ext}`;
    if (vus.has(cle)) {
      doublons++;
      continue;
    }
    vus.add(cle);
    // L'heure du fichier est l'heure BRITANNIQUE (cf. coupDEnvoiUtc) : le jour
    // UTC peut être celui d'avant (match du soir en Amérique, écrit le lendemain).
    const coup = b.Time ? coupDEnvoiUtc(dateFichier, b.Time) : null;
    const arbitre = String(b.Referee ?? '').trim();
    lignes.push({
      date: coup ? coup.slice(0, 10) : dateFichier,
      dateFichier,
      heure: coup ? coup.slice(11, 16) : null,
      saison: libelle ?? saisonDuFichierPays(b.Season, dateFichier),
      dom,
      ext,
      bd,
      be,
      mtd: entier(b.HTHG),
      mte: entier(b.HTAG),
      tirs_d: entier(b.HS),
      tirs_e: entier(b.AS),
      cadres_d: entier(b.HST),
      cadres_e: entier(b.AST),
      corners_d: entier(b.HC),
      corners_e: entier(b.AC),
      fautes_d: entier(b.HF),
      fautes_e: entier(b.AF),
      cf_d: entier(b.HFKC),
      cf_e: entier(b.AFKC),
      jaunes_d: entier(b.HY),
      jaunes_e: entier(b.AY),
      rouges_d: entier(b.HR),
      rouges_e: entier(b.AR),
      xg_d: xgEnCentiemes(b.HxG),
      xg_e: xgEnCentiemes(b.AxG),
      arbitre: arbitre || null,
      cotes: cotesDeLaLigne(b, plan)
    });
  }
  const ignorees = Object.values(raisons).reduce((n, x) => n + x, 0);
  return { lignes, ignorees, raisons, doublons, entetes, plan: plan.map((p) => ({ colonnes: p.colonnes, cibles: p.cibles, ligne: p.ligne?.source ?? null })) };
}

/* =======================================================================
 * ÉCRITURE (une transaction par fichier)
 * ===================================================================== */

const COLONNES_MATCH = ['code', 'saison', 'date', 'date_fichier', 'heure', 'dom', 'ext', 'bd', 'be', 'mtd', 'mte', 'tirs_d', 'tirs_e', 'cadres_d', 'cadres_e', 'corners_d', 'corners_e', 'fautes_d', 'fautes_e', 'cf_d', 'cf_e', 'jaunes_d', 'jaunes_e', 'rouges_d', 'rouges_e', 'xg_d', 'xg_e', 'arbitre'];
const COLONNES_INSERT = [...COLONNES_MATCH, ...COLONNES_COTES_FD];

const requetes = new WeakMap();
function requetesDe(database) {
  let r = requetes.get(database);
  if (r) return r;
  r = {
    club: database.prepare('SELECT id FROM fd_teams WHERE pays = ? AND nom = ?'),
    nouveauClub: database.prepare('INSERT INTO fd_teams (pays, nom) VALUES (?, ?) ON CONFLICT(pays, nom) DO NOTHING'),
    effacerSaison: database.prepare('DELETE FROM fd_history WHERE code = ? AND saison = ?'),
    effacerCode: database.prepare('DELETE FROM fd_history WHERE code = ?'),
    inserer: database.prepare(`INSERT INTO fd_history (${COLONNES_INSERT.join(', ')}) VALUES (${COLONNES_INSERT.map(() => '?').join(', ')})`),
    fichier: database.prepare('SELECT * FROM fd_fichiers WHERE fichier = ?'),
    noterFichier: database.prepare(`INSERT INTO fd_fichiers (fichier, code, saison, statut, lu_le, version, sha1, octets, lignes, ignorees, encodage, erreur, essais, importe_le, updated_at)
      VALUES (:fichier, :code, :saison, :statut, :lu_le, :version, :sha1, :octets, :lignes, :ignorees, :encodage, :erreur, :essais, :importe_le, :updated_at)
      ON CONFLICT(fichier) DO UPDATE SET code = excluded.code, saison = excluded.saison, statut = excluded.statut, lu_le = excluded.lu_le,
        version = excluded.version, sha1 = excluded.sha1, octets = excluded.octets, lignes = excluded.lignes, ignorees = excluded.ignorees,
        encodage = excluded.encodage, erreur = excluded.erreur, essais = excluded.essais, importe_le = excluded.importe_le, updated_at = excluded.updated_at`)
  };
  requetes.set(database, r);
  return r;
}

/** L'identifiant fd_teams d'un club (créé au besoin) : pays + nom écrit par le site, rien d'autre. */
function idDuClub(database, pays, nom, memo) {
  const cle = `${pays}|${nom}`;
  if (memo.has(cle)) return memo.get(cle);
  const r = requetesDe(database);
  let id = r.club.get(pays, nom)?.id;
  if (!id) {
    r.nouveauClub.run(pays, nom);
    id = r.club.get(pays, nom).id;
  }
  memo.set(cle, id);
  return id;
}

/** L'état connu d'un fichier (fd_fichiers), ou null. */
export function etatDuFichier(fichier, { database = openDb() } = {}) {
  return requetesDe(database).fichier.get(fichier) ?? null;
}

/** Note l'état d'un fichier ; garde ce qui n'est pas donné. */
function noterFichier(database, f, champs) {
  const avant = requetesDe(database).fichier.get(f.fichier) ?? {};
  const ligne = {
    fichier: f.fichier,
    code: f.code,
    saison: f.saison ?? null,
    statut: avant.statut ?? 'inconnu',
    lu_le: avant.lu_le ?? null,
    version: avant.version ?? null,
    sha1: avant.sha1 ?? null,
    octets: avant.octets ?? null,
    lignes: avant.lignes ?? null,
    ignorees: avant.ignorees ?? null,
    encodage: avant.encodage ?? null,
    erreur: null,
    essais: avant.essais ?? 0,
    importe_le: avant.importe_le ?? null,
    updated_at: new Date().toISOString(),
    ...champs
  };
  requetesDe(database).noterFichier.run(ligne);
}

/**
 * Remplace, en UNE transaction, les matchs d'un fichier par ceux qu'il
 * contient maintenant : ré-importer le même fichier rend les mêmes lignes,
 * jamais un doublon ; un fichier corrigé par le site remplace l'ancienne
 * version. Les clubs (fd_teams) ne sont jamais effacés : leur identifiant
 * reste stable d'un import à l'autre.
 */
export function ecrireFichierHistorique(database, f, lu, { octets = null, version = null, luLe = null, encodage = null } = {}) {
  const pays = paysDuCode(f.code);
  if (!pays) throw new Error(`code football-data inconnu : ${f.code}`);
  const r = requetesDe(database);
  const memo = new Map();
  const maintenant = new Date().toISOString();
  database.exec('BEGIN IMMEDIATE');
  try {
    if (f.saison) r.effacerSaison.run(f.code, libelleSaison(f.saison));
    else r.effacerCode.run(f.code);
    for (const l of lu.lignes) {
      const valeurs = {
        ...l,
        code: f.code,
        date_fichier: l.dateFichier,
        dom: idDuClub(database, pays, l.dom, memo),
        ext: idDuClub(database, pays, l.ext, memo),
        ...l.cotes
      };
      r.inserer.run(...COLONNES_INSERT.map((c) => valeurs[c] ?? null));
    }
    noterFichier(database, f, {
      statut: 'importe',
      lu_le: luLe,
      version,
      sha1: octets ? sha1(octets) : null,
      octets: octets?.length ?? null,
      lignes: lu.lignes.length,
      ignorees: lu.ignorees + lu.doublons,
      encodage,
      erreur: null,
      importe_le: maintenant
    });
    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // déjà annulée
    }
    throw error;
  }
  return { lignes: lu.lignes.length, ignorees: lu.ignorees, doublons: lu.doublons };
}

/* =======================================================================
 * LE RATTACHEMENT (vote, puis identifiants) — refait en entier, sans réseau
 * ===================================================================== */

/** Codes de chaque pays dont le magasin suit au moins une division, avec la compétition du magasin. */
function codesParPays() {
  const parPays = new Map();
  for (const code of [...Object.keys(DIVISIONS), ...Object.keys(FICHIERS_PAR_PAYS)]) {
    const pays = paysDuCode(code);
    if (!parPays.has(pays)) parPays.set(pays, []);
    parPays.get(pays).push({ code, league: championnatDuMagasin(code) });
  }
  return parPays;
}

/**
 * Refait le lien de TOUS les clubs et de toutes les lignes de la période
 * commune avec le magasin : votes (jour ± 1 et score) réunis par pays,
 * traduction à la majorité nette, puis chaque ligne retrouvée par les deux
 * identifiants (± 3 jours), score vérifié. Sans réseau ; idempotent.
 *
 * Garde-fou : deux noms d'un même pays traduits vers le MÊME club FotMob
 * alors qu'ils jouent en même temps (leurs périodes de jeu se recouvrent, ou
 * ils se rencontrent) ne peuvent pas être le même club — aucun des deux n'est
 * traduit (« conflit »). Deux noms qui se succèdent sont un club renommé par
 * le site : tous deux gardent l'identifiant.
 *
 * Rend un bilan par code : { periode, rattachees, scoreDifferent,
 * nonTraduits, introuvables } et par pays : clubs traduits / clubs vus.
 */
export function rattacherHistorique({ database = openDb(), log = () => {} } = {}) {
  const debut = Date.now();
  const bilan = { parCode: {}, parPays: {}, dureeMs: 0 };
  const etendue = database.prepare('SELECT MIN(date) mi, MAX(date) ma FROM matches WHERE league = ? AND home_goals IS NOT NULL');
  const lignesDe = database.prepare('SELECT id, saison, date, dom, ext, bd, be, lien, match_key FROM fd_history WHERE code = ? AND date >= ? AND date <= ? ORDER BY date, id');
  const magasinDe = database.prepare(`SELECT match_key, date, home_id, away_id, home_goals, away_goals FROM matches
    WHERE league = ? AND date >= ? AND date <= ? AND home_id IS NOT NULL AND away_id IS NOT NULL`);
  const horsPeriode = database.prepare('UPDATE fd_history SET lien = 0, match_key = NULL WHERE code = ? AND (date < ? OR date > ?) AND (lien <> 0 OR match_key IS NOT NULL)');
  const toutHors = database.prepare('UPDATE fd_history SET lien = 0, match_key = NULL WHERE code = ? AND (lien <> 0 OR match_key IS NOT NULL)');
  const maj = database.prepare('UPDATE fd_history SET lien = ?, match_key = ? WHERE id = ?');
  const clubsDuPays = database.prepare('SELECT id, team_id, votes, total, etat FROM fd_teams WHERE pays = ?');
  const majClub = database.prepare('UPDATE fd_teams SET team_id = ?, votes = ?, total = ?, etat = ? WHERE id = ?');
  const LIENS = { rattachee: 1, 'score-different': 2, 'non-traduit': 3, introuvable: 4 };

  for (const [pays, codes] of codesParPays()) {
    const suivis = [];
    for (const c of codes) {
      if (!c.league) continue;
      const e = etendue.get(c.league);
      if (!e?.mi) continue;
      const periode = { debut: decaler(e.mi, -1), fin: decaler(e.ma, 1) };
      const lignes = lignesDe.all(c.code, periode.debut, periode.fin);
      const magasin = magasinDe.all(c.league, decaler(periode.debut, -3), decaler(periode.fin, 3));
      suivis.push({ ...c, periode, lignes, autour: rencontresParJour(magasin) });
    }
    // 1. Votes, réunis pour tout le pays : un club promu ou relégué vote dans chaque division.
    const votes = new Map();
    const pourVoter = (s) => s.lignes.map((l) => ({ id: l.id, date: l.date, home: l.dom, away: l.ext, hg: l.bd, ag: l.be, saison: l.saison }));
    for (const s of suivis) {
      s.pourVoter = pourVoter(s);
      voterParDateEtScore(s.pourVoter, s.autour, votes);
    }
    const idDe = traduireLesVotes(votes);
    // 2. Garde-fou : deux noms traduits vers le même club FotMob. Le site renomme
    //    parfois un club en cours de route (« Ham-Kam » puis « HamKam » en 2023,
    //    « Din. Bucuresti » puis « Dinamo Bucuresti » en mars 2026) : les deux noms
    //    se SUCCÈDENT, leurs périodes de jeu ne se recouvrent pas, c'est le même
    //    club. Deux clubs différents, eux, jouent en même temps : si les périodes
    //    des deux noms se recouvrent (ou s'ils se rencontrent), aucun n'est traduit.
    const nomsParId = new Map();
    for (const [nom, id] of idDe) nomsParId.set(id, [...(nomsParId.get(id) ?? []), nom]);
    const conflits = new Set();
    for (const [, noms] of nomsParId) {
      if (noms.length < 2) continue;
      const periode = new Map(noms.map((n) => [n, { debut: null, fin: null }]));
      for (const s of suivis) {
        for (const l of s.pourVoter) {
          if (noms.includes(l.home) && noms.includes(l.away)) for (const n of [l.home, l.away]) conflits.add(n);
          for (const n of [l.home, l.away]) {
            const p = periode.get(n);
            if (!p) continue;
            if (!p.debut || l.date < p.debut) p.debut = l.date;
            if (!p.fin || l.date > p.fin) p.fin = l.date;
          }
        }
      }
      const vus = noms.filter((n) => periode.get(n).debut);
      for (let i = 0; i < vus.length; i++) {
        for (let j = i + 1; j < vus.length; j++) {
          const a = periode.get(vus[i]);
          const b = periode.get(vus[j]);
          if (a.debut <= b.fin && b.debut <= a.fin) {
            conflits.add(vus[i]);
            conflits.add(vus[j]);
          }
        }
      }
    }
    for (const n of conflits) idDe.delete(n);

    // 3. Les écritures : clubs puis lignes, une transaction par pays.
    database.exec('BEGIN IMMEDIATE');
    try {
      let traduits = 0;
      let vus = 0;
      for (const club of clubsDuPays.all(pays)) {
        const v = votes.get(club.id);
        const tri = v ? [...v.entries()].sort((a, b) => b[1] - a[1]) : [];
        const total = tri.reduce((s, [, n]) => s + n, 0);
        const teamId = idDe.get(club.id) ?? null;
        const etat = conflits.has(club.id) ? 'conflit' : teamId ? 'vote' : !total ? null : tri[0][1] < 2 ? 'un-seul-vote' : 'partage';
        if (teamId) traduits++;
        vus++;
        const nouveau = [teamId, tri[0]?.[1] ?? null, total || null, etat];
        if (club.team_id !== nouveau[0] || club.votes !== nouveau[1] || club.total !== nouveau[2] || club.etat !== nouveau[3]) majClub.run(...nouveau, club.id);
      }
      bilan.parPays[pays] = { clubs: vus, traduits, conflits: conflits.size };
      for (const c of codes) {
        const s = suivis.find((x) => x.code === c.code);
        if (!s) {
          toutHors.run(c.code);
          continue;
        }
        horsPeriode.run(c.code, s.periode.debut, s.periode.fin);
        const b = { league: c.league, periode: s.lignes.length, rattachees: 0, scoreDifferent: 0, nonTraduits: 0, introuvables: 0 };
        const avant = new Map(s.lignes.map((l) => [l.id, l]));
        for (const r of rattacherParIdentifiants(s.pourVoter, idDe, s.autour)) {
          const lien = LIENS[r.etat];
          const cle = r.etat === 'rattachee' || r.etat === 'score-different' ? r.rencontre.match_key : null;
          if (r.etat === 'rattachee') b.rattachees++;
          else if (r.etat === 'score-different') b.scoreDifferent++;
          else if (r.etat === 'non-traduit') b.nonTraduits++;
          else b.introuvables++;
          const l = avant.get(r.ligne.id);
          if (l.lien !== lien || (l.match_key ?? null) !== cle) maj.run(lien, cle, r.ligne.id);
        }
        bilan.parCode[c.code] = b;
      }
      database.exec('COMMIT');
    } catch (error) {
      try {
        database.exec('ROLLBACK');
      } catch {
        // déjà annulée
      }
      throw error;
    }
    log({ pays, ...bilan.parPays[pays] });
  }
  bilan.dureeMs = Date.now() - debut;
  return bilan;
}

/* =======================================================================
 * LE TÉLÉCHARGEMENT
 * ===================================================================== */

let derniereRequete = 0;

/**
 * Lit un fichier du site, sans jamais lever : { statut: 200 | 404 | 'erreur',
 * octets, version, requetes, erreur }. Au moins `ecartMs` entre deux requêtes
 * de ce module, 20 s de délai, 3 essais pour une panne passagère (réseau,
 * 5xx, 429), en-tête de navigateur ; une page qui n'est pas un CSV de
 * football-data (maintenance servie en 200) est une erreur, jamais un fichier.
 */
export async function telechargerDuSite(url, { ecartMs = ECART_MS, attenteEssaiMs = 1500, essais = 3, fetchImpl = null } = {}) {
  const lire = fetchImpl ?? ((...a) => globalThis.fetch(...a));
  let requetesFaites = 0;
  let derniere = null;
  for (let essai = 0; essai < essais; essai++) {
    if (essai && attenteEssaiMs) await sleep(attenteEssaiMs * essai);
    const attente = derniereRequete + ecartMs - Date.now();
    if (attente > 0) await sleep(Math.min(attente, ecartMs));
    derniereRequete = Date.now();
    requetesFaites++;
    const controle = new AbortController();
    const minuterie = setTimeout(() => controle.abort(), DELAI_MS);
    try {
      const r = await lire(url, { headers: { 'User-Agent': UA, Accept: 'text/csv,text/plain,*/*' }, redirect: 'follow', signal: controle.signal });
      if (r.status === 404) return { statut: 404, octets: null, version: null, requetes: requetesFaites };
      if (r.status >= 500 || r.status === 429) {
        derniere = new Error(`HTTP ${r.status}`);
        continue;
      }
      if (!r.ok) return { statut: 'erreur', octets: null, version: null, requetes: requetesFaites, erreur: `HTTP ${r.status}` };
      const octets = Buffer.from(await r.arrayBuffer());
      if (!estCsvFootballData(decoderCsv(octets.subarray(0, 4096)).texte)) {
        return { statut: 'erreur', octets: null, version: null, requetes: requetesFaites, erreur: 'réponse inattendue : pas un fichier CSV de football-data' };
      }
      return { statut: 200, octets, version: r.headers?.get?.('last-modified') ?? null, requetes: requetesFaites };
    } catch (error) {
      derniere = error?.name === 'AbortError' ? new Error(`pas de réponse en ${DELAI_MS / 1000} s`) : error;
    } finally {
      clearTimeout(minuterie);
    }
  }
  return { statut: 'erreur', octets: null, version: null, requetes: requetesFaites, erreur: derniere?.message ?? 'échec inconnu' };
}

/* =======================================================================
 * L'ÉTAT ET LA PASSE
 * ===================================================================== */

/** L'état de l'import (odds_source_state 'fd-historique' / 'import'). */
export function lireEtatImport({ database = openDb() } = {}) {
  const e = readSourceState(SOURCE_ETAT, 'import', { database });
  return { complet: Boolean(e?.done), curseur: e?.cursor ?? null, ...(e?.detail ?? {}), majLe: e?.updatedAt ?? null };
}

function ecrireEtatImport(database, etat) {
  const { complet, curseur, majLe, ...detail } = etat;
  writeSourceState(SOURCE_ETAT, 'import', { cursor: curseur ?? null, done: Boolean(complet), detail }, { database });
}

/** L'import complet reste-t-il à finir, ou un rattachement à refaire ? (lecture seule, sans lever) */
export function historiqueAFaire({ database = null } = {}) {
  try {
    const e = lireEtatImport({ database: database ?? openDb() });
    return !e.complet || Boolean(e.relierAFaire);
  } catch {
    return true;
  }
}

/** Taille du fichier de la base (octets), ou null. */
function tailleDuFichierBase(database) {
  try {
    const f = database.location?.();
    return f ? fs.statSync(f).size : null;
  } catch {
    return null;
  }
}

/**
 * Taille EXACTE ajoutée à la base par l'historique : pages des trois tables
 * et de leurs index (table virtuelle dbstat, une structure à la fois).
 */
export function tailleDesTables({ database = openDb() } = {}) {
  const noms = database
    .prepare("SELECT name FROM sqlite_master WHERE (type = 'table' AND name IN ('fd_history', 'fd_teams', 'fd_fichiers')) OR (type = 'index' AND tbl_name IN ('fd_history', 'fd_teams', 'fd_fichiers'))")
    .all()
    .map((r) => r.name);
  const lire = database.prepare('SELECT SUM(pgsize) AS octets FROM dbstat WHERE name = ? AND aggregate = TRUE');
  const parStructure = {};
  let octets = 0;
  for (const n of noms) {
    const o = Number(lire.get(n)?.octets ?? 0);
    parStructure[n] = o;
    octets += o;
  }
  return { octets, parStructure };
}

/** Les écarts de score (étape 14) : la ligne football-data, la rencontre FotMob désignée, les deux scores. */
export function ecartsDeScore({ database = openDb(), limite = null } = {}) {
  const sql = `SELECT h.code, h.saison, h.date, h.date_fichier AS dateFichier, td.nom AS dom, te.nom AS ext, h.bd, h.be, h.match_key AS matchKey,
      m.date AS dateMagasin, m.league, m.home_name AS domMagasin, m.away_name AS extMagasin, m.home_goals AS bdMagasin, m.away_goals AS beMagasin
    FROM fd_history h JOIN fd_teams td ON td.id = h.dom JOIN fd_teams te ON te.id = h.ext LEFT JOIN matches m ON m.match_key = h.match_key
    WHERE h.lien = 2 ORDER BY h.date DESC, h.id${limite ? ' LIMIT ?' : ''}`;
  const lignes = limite ? database.prepare(sql).all(limite) : database.prepare(sql).all();
  return lignes.map((l) => ({
    code: l.code,
    league: l.league ?? championnatDuMagasin(l.code),
    saison: l.saison,
    date: l.date,
    dom: l.dom,
    ext: l.ext,
    scoreFootballData: `${l.bd}-${l.be}`,
    matchKey: l.matchKey,
    dateMagasin: l.dateMagasin ?? null,
    rencontreMagasin: l.domMagasin ? `${l.domMagasin} - ${l.extMagasin}` : null,
    scoreMagasin: l.bdMagasin === null || l.bdMagasin === undefined ? null : `${l.bdMagasin}-${l.beMagasin}`
  }));
}

/** Pour l'écran : une colonne témoin par livre, marché et moment. */
const TEMOINS_COTES = [
  ...LIVRES_HISTO.flatMap((l) => [
    { livre: l.cle, marche: '1x2', moment: 'avant', colonne: `${l.cle}_1` },
    { livre: l.cle, marche: '1x2', moment: 'cloture', colonne: `${l.cle}_c1` }
  ]),
  ...LIVRES_HISTO.filter((l) => l.ou.length).flatMap((l) => [
    { livre: l.cle, marche: 'ou25', moment: 'avant', colonne: `${l.cle}_p25` },
    { livre: l.cle, marche: 'ou25', moment: 'cloture', colonne: `${l.cle}_cp25` },
    { livre: l.cle, marche: 'ah', moment: 'avant', colonne: `${l.cle}_ahd` },
    { livre: l.cle, marche: 'ah', moment: 'cloture', colonne: `${l.cle}_cahd` }
  ])
];

/**
 * Le résumé que lit la carte « Historique football-data » de Réglages :
 * championnat par championnat (saisons, matchs, clubs reconnus, rattachement
 * depuis 2023), fichiers (importés, absents, en échec), cotes gardées par
 * livre (première et dernière saison, et William Hill saison par saison),
 * écarts de score, tailles. Calculé à la fin de chaque passe (quelques
 * dixièmes de seconde), puis lu tel quel.
 */
export function resumeHistorique({ database = openDb(), aujourdhui = new Date(), dossier = null, fichiers: liste = null } = {}) {
  const debut = Date.now();
  const parCode = new Map(
    database
      .prepare(`SELECT code, COUNT(*) matchs, COUNT(DISTINCT saison) saisons, MIN(saison) premiere, MAX(saison) derniere, MIN(date) premierJour, MAX(date) dernierJour,
          SUM(lien = 1) rattachees, SUM(lien = 2) ecarts, SUM(lien = 3) nonTraduits, SUM(lien = 4) introuvables, SUM(lien > 0) periode,
          SUM(date >= '2023-01-01') depuis2023, SUM(arbitre IS NOT NULL) avecArbitre, SUM(tirs_d IS NOT NULL) avecTirs, SUM(corners_d IS NOT NULL) avecCorners,
          SUM(jaunes_d IS NOT NULL) avecCartons, SUM(moy_1 IS NOT NULL OR moy_c1 IS NOT NULL) avecMoyenne
        FROM fd_history GROUP BY code`)
      .all()
      .map((r) => [r.code, r])
  );
  const clubs = new Map(
    database
      .prepare(`SELECT x.code, COUNT(*) clubs, SUM(t.team_id IS NOT NULL) reconnus FROM
          (SELECT DISTINCT code, dom AS club FROM fd_history UNION SELECT DISTINCT code, ext FROM fd_history) x
          JOIN fd_teams t ON t.id = x.club GROUP BY x.code`)
      .all()
      .map((r) => [r.code, r])
  );
  const clubs2023 = new Map(
    database
      .prepare(`SELECT x.code, COUNT(*) clubs, SUM(t.team_id IS NOT NULL) reconnus FROM
          (SELECT DISTINCT code, dom AS club FROM fd_history WHERE lien > 0 UNION SELECT DISTINCT code, ext FROM fd_history WHERE lien > 0) x
          JOIN fd_teams t ON t.id = x.club GROUP BY x.code`)
      .all()
      .map((r) => [r.code, r])
  );
  const fichiers = database.prepare('SELECT fichier, code, saison, statut, lu_le AS luLe, lignes, ignorees, encodage, erreur, essais, importe_le AS importeLe, updated_at AS majLe FROM fd_fichiers').all();
  const parFichierCode = new Map();
  for (const f of fichiers) {
    const x = parFichierCode.get(f.code) ?? { importes: 0, absents: 0, echecs: 0, dernierRelevé: null };
    if (f.statut === 'importe') x.importes++;
    else if (f.statut === 'absent') x.absents++;
    else if (f.statut === 'echec') x.echecs++;
    if (f.luLe && (!x.dernierRelevé || f.luLe > x.dernierRelevé)) x.dernierRelevé = f.luLe;
    parFichierCode.set(f.code, x);
  }
  const attendus = liste ?? listeDesFichiers({ aujourdhui });
  const parCodeAttendus = new Map();
  for (const f of attendus) parCodeAttendus.set(f.code, (parCodeAttendus.get(f.code) ?? 0) + 1);

  const championnats = [...Object.keys(DIVISIONS), ...Object.keys(FICHIERS_PAR_PAYS)].map((code) => {
    const r = parCode.get(code) ?? {};
    const c = clubs.get(code) ?? {};
    const c23 = clubs2023.get(code) ?? {};
    const f = parFichierCode.get(code) ?? {};
    return {
      code,
      nom: nomDuCode(code),
      pays: paysDuCode(code),
      league: championnatDuMagasin(code),
      parPays: Boolean(FICHIERS_PAR_PAYS[code]),
      saisons: r.saisons ?? 0,
      premiere: r.premiere ?? null,
      derniere: r.derniere ?? null,
      premierJour: r.premierJour ?? null,
      dernierJour: r.dernierJour ?? null,
      matchs: r.matchs ?? 0,
      clubs: c.clubs ?? 0,
      clubsReconnus: c.reconnus ?? 0,
      clubsPeriode: c23.clubs ?? 0,
      clubsPeriodeReconnus: c23.reconnus ?? 0,
      depuis2023: r.depuis2023 ?? 0,
      periode: r.periode ?? 0,
      rattachees: r.rattachees ?? 0,
      ecarts: r.ecarts ?? 0,
      nonTraduits: r.nonTraduits ?? 0,
      introuvables: r.introuvables ?? 0,
      avecArbitre: r.avecArbitre ?? 0,
      avecTirs: r.avecTirs ?? 0,
      avecCorners: r.avecCorners ?? 0,
      avecCartons: r.avecCartons ?? 0,
      avecMoyenne: r.avecMoyenne ?? 0,
      fichiers: { attendus: parCodeAttendus.get(code) ?? 0, importes: f.importes ?? 0, absents: f.absents ?? 0, echecs: f.echecs ?? 0 },
      dernierReleve: f.dernierRelevé ?? null
    };
  });

  // Les cotes gardées : par livre, marché et moment, la première et la dernière saison qui en ont, et combien de matchs.
  const parSaison = database
    .prepare(`SELECT saison, COUNT(*) matchs, ${TEMOINS_COTES.map((t) => `COUNT(${t.colonne}) AS "${t.colonne}"`).join(', ')}
      FROM fd_history WHERE code IN (${Object.keys(DIVISIONS).map(() => '?').join(', ')}) GROUP BY saison ORDER BY saison`)
    .all(...Object.keys(DIVISIONS));
  const parPaysFichiers = database
    .prepare(`SELECT COUNT(*) matchs, ${TEMOINS_COTES.map((t) => `COUNT(${t.colonne}) AS "${t.colonne}"`).join(', ')} FROM fd_history WHERE code IN (${Object.keys(FICHIERS_PAR_PAYS).map(() => '?').join(', ')})`)
    .get(...Object.keys(FICHIERS_PAR_PAYS));
  const cotes = TEMOINS_COTES.map((t) => {
    const avec = parSaison.filter((s) => s[t.colonne] > 0);
    return {
      ...t,
      nom: LIVRES_HISTO.find((l) => l.cle === t.livre).nom,
      premiere: avec[0]?.saison ?? null,
      derniere: avec.at(-1)?.saison ?? null,
      matchs: avec.reduce((n, s) => n + s[t.colonne], 0),
      fichiersParPays: parPaysFichiers?.[t.colonne] ?? 0
    };
  });
  const saisons = parSaison.map((s) => ({
    saison: s.saison,
    matchs: s.matchs,
    ...Object.fromEntries(TEMOINS_COTES.map((t) => [t.colonne, s[t.colonne]]))
  }));

  const totaux = database
    .prepare(`SELECT COUNT(*) matchs, COUNT(DISTINCT code || '|' || saison) saisons, SUM(lien > 0) periode, SUM(lien = 1) rattachees, SUM(lien = 2) ecarts,
        SUM(lien = 3) nonTraduits, SUM(lien = 4) introuvables FROM fd_history`)
    .get();
  const clubsTotaux = database.prepare('SELECT COUNT(*) clubs, SUM(team_id IS NOT NULL) reconnus FROM fd_teams').get();
  const ecarts = ecartsDeScore({ database });
  let taille = null;
  try {
    taille = tailleDesTables({ database });
  } catch (error) {
    taille = { octets: null, erreur: error.message };
  }
  return {
    calculeLe: new Date().toISOString(),
    dureeMs: Date.now() - debut,
    totaux: {
      matchs: totaux.matchs ?? 0,
      saisons: totaux.saisons ?? 0,
      periode: totaux.periode ?? 0,
      rattachees: totaux.rattachees ?? 0,
      ecarts: totaux.ecarts ?? 0,
      nonTraduits: totaux.nonTraduits ?? 0,
      introuvables: totaux.introuvables ?? 0,
      clubs: clubsTotaux.clubs ?? 0,
      clubsReconnus: clubsTotaux.reconnus ?? 0
    },
    championnats,
    fichiers: {
      attendus: attendus.length,
      importes: fichiers.filter((f) => f.statut === 'importe').length,
      absents: fichiers.filter((f) => f.statut === 'absent').length,
      // En échec : jamais importé, ou relecture de la semaine manquée (`relecture` : les lignes d'avant restent).
      echecs: fichiers
        .filter((f) => f.statut === 'echec' || (f.statut === 'importe' && f.erreur))
        .map((f) => ({ fichier: f.fichier, code: f.code, saison: f.saison, erreur: f.erreur, essais: f.essais, le: f.majLe, relecture: f.statut === 'importe' })),
      absentsListe: fichiers.filter((f) => f.statut === 'absent').map((f) => f.fichier),
      dernierReleve: fichiers.reduce((m, f) => (f.luLe && (!m || f.luLe > m) ? f.luLe : m), null),
      dernierImport: fichiers.reduce((m, f) => (f.importeLe && (!m || f.importeLe > m) ? f.importeLe : m), null)
    },
    cotes,
    saisons,
    ecarts: { total: ecarts.length, liste: ecarts.slice(0, 300) },
    taille,
    cache: tailleDuCache({ database, dossier })
  };
}

/** Le résumé gardé (odds_source_state 'fd-historique' / 'resume'), ou null. */
export function lireResume({ database = openDb() } = {}) {
  return readSourceState(SOURCE_ETAT, 'resume', { database })?.detail ?? null;
}

/**
 * UNE PASSE : télécharge ce qui manque (au plus `budget` requêtes), importe
 * ce que le cache a de nouveau, refait le rattachement si une ligne a changé,
 * puis le résumé. Ce qui se télécharge :
 *   - un fichier jamais lu, ou en échec la fois d'avant (import complet) ;
 *   - un fichier qui grossit encore (saison en cours, fichier par pays) dont
 *     la copie gardée a plus d'une semaine — l'étape « cotes passées » en
 *     retélécharge 33 sur 38 toutes les douze heures : seuls les autres partent
 *     vraiment au site, une fois par semaine ;
 *   - un fichier de la saison en cours absent chez le site, une fois par
 *     semaine (une saison qui n'a pas encore commencé) ; un fichier d'une saison
 *     passée absent chez le site n'est jamais redemandé (il est listé).
 * Trois échecs de suite arrêtent les téléchargements de la passe (le site ne
 * répond plus) ; la suivante reprend là. Rend le bilan de la passe.
 */
export async function passeHistorique({
  database = openDb(),
  budget = REQUETES_PAR_PASSE,
  aujourdhui = new Date(),
  dossier = null,
  telecharger = (url) => telechargerDuSite(url),
  limiteMs = DUREE_MAX_PASSE_MS,
  sansReseau = false,
  // Tout ré-importer depuis les copies gardées, même inchangées (après une
  // correction de la lecture : aucune requête de plus).
  reimporter = false,
  // La liste des fichiers (essais) ; par défaut, les ~605 de listeDesFichiers.
  fichiers: liste = null,
  log = () => {}
} = {}) {
  const debut = Date.now();
  const racine = dossier ?? dossierCache({ database });
  const etat = lireEtatImport({ database });
  const maintenantIso = new Date().toISOString();
  if (!etat.commenceLe) {
    etat.commenceLe = maintenantIso;
    etat.tailleBaseAvant = tailleDuFichierBase(database);
  }
  const fichiers = liste ?? listeDesFichiers({ aujourdhui });
  const connus = new Map(database.prepare('SELECT * FROM fd_fichiers').all().map((f) => [f.fichier, f]));
  const bilan = {
    requetes: 0,
    telecharges: 0,
    absents: 0,
    echecs: 0,
    erreurs: [],
    importes: 0,
    inchanges: 0,
    lignes: 0,
    ignorees: 0,
    reprisDuCache: 0,
    relie: false,
    rattachement: null,
    reste: 0,
    complet: false,
    arrete: null
  };

  // 1. Téléchargements.
  const aTelecharger = [];
  for (const f of fichiers) {
    const c = connus.get(f.fichier);
    const lu = dateDansLeCache(f.url, { dossier: racine });
    if (!lu) {
      if (c?.statut === 'absent') {
        const derniere = Date.parse(c.updated_at ?? '');
        if (!(f.enCours && (!Number.isFinite(derniere) || Date.now() - derniere >= SEMAINE_MS))) continue;
      }
      aTelecharger.push(f);
    } else if (f.enCours && Date.now() - Date.parse(lu) >= SEMAINE_MS) {
      aTelecharger.push(f);
    }
  }
  let echecsDeSuite = 0;
  for (const f of aTelecharger) {
    if (sansReseau) {
      bilan.arrete = 'sans réseau (demandé)';
      break;
    }
    if (bilan.requetes >= budget) {
      bilan.arrete = `budget de ${budget} requêtes atteint`;
      break;
    }
    if (Date.now() - debut > limiteMs) {
      bilan.arrete = `durée de ${Math.round(limiteMs / 60_000)} min atteinte`;
      break;
    }
    const r = await telecharger(f.url);
    bilan.requetes += r.requetes ?? 1;
    const avant = connus.get(f.fichier);
    if (r.statut === 200) {
      echecsDeSuite = 0;
      const depot = deposerDansLeCache(f.url, r.octets, { dossier: racine, version: r.version });
      if (!depot) {
        bilan.echecs++;
        bilan.erreurs.push(`${f.fichier} : copie sur le disque impossible (${racine})`);
        noterFichier(database, f, { statut: 'echec', erreur: `copie sur le disque impossible (${racine})`, essais: (avant?.essais ?? 0) + 1 });
        continue;
      }
      bilan.telecharges++;
    } else if (r.statut === 404) {
      echecsDeSuite = 0;
      bilan.absents++;
      noterFichier(database, f, { statut: 'absent', erreur: 'fichier absent chez football-data.co.uk (404)', essais: (avant?.essais ?? 0) + 1 });
    } else {
      echecsDeSuite++;
      bilan.echecs++;
      bilan.erreurs.push(`${f.fichier} : ${r.erreur}`);
      // Un fichier déjà importé et seulement relu (saison en cours) garde ses lignes : l'échec est noté, pas l'état.
      if (avant?.statut === 'importe') noterFichier(database, f, { erreur: r.erreur, essais: (avant.essais ?? 0) + 1 });
      else noterFichier(database, f, { statut: 'echec', erreur: r.erreur, essais: (avant?.essais ?? 0) + 1 });
      if (echecsDeSuite >= 3) {
        bilan.arrete = 'trois échecs de suite : le site ne répond plus, reprise à la passe suivante';
        break;
      }
    }
    log({ fichier: f.fichier, statut: r.statut, requetes: bilan.requetes });
  }

  // 2. Imports : ce que le cache a de nouveau (téléchargé ici, ou par l'étape des cotes passées).
  for (const f of fichiers) {
    // Rendre la main au serveur entre deux fichiers : un import complet depuis
    // les copies gardées (~600 fichiers, ~40 s) ne doit pas le figer d'un bloc.
    await new Promise((fin) => setImmediate(fin));
    const lu = dateDansLeCache(f.url, { dossier: racine });
    if (!lu) continue;
    const c = requetesDe(database).fichier.get(f.fichier);
    if (!reimporter && c?.statut === 'importe' && c.lu_le && Date.parse(lu) <= Date.parse(c.lu_le)) continue;
    const copie = lireDuCache(f.url, { dossier: racine });
    if (!copie) continue;
    const empreinte = sha1(copie.octets);
    if (!reimporter && c?.statut === 'importe' && c.sha1 === empreinte) {
      // Même contenu, relu plus tard : seule l'heure du relevé change.
      noterFichier(database, f, { lu_le: copie.lu, version: copie.version ?? c.version ?? null });
      bilan.inchanges++;
      continue;
    }
    const { texte, encodage } = decoderCsv(copie.octets);
    if (!estCsvFootballData(texte)) {
      bilan.echecs++;
      bilan.erreurs.push(`${f.fichier} : copie gardée illisible (pas un CSV de football-data)`);
      noterFichier(database, f, { statut: 'echec', erreur: 'copie gardée illisible (pas un CSV de football-data)', essais: (c?.essais ?? 0) + 1 });
      continue;
    }
    try {
      const lecture = lireFichierHistorique(texte, { code: f.code, saison: f.saison });
      if (!etat.relierAFaire) {
        // Noté AVANT d'écrire : un arrêt entre l'import et le rattachement ne laisse
        // pas des lignes sans lien que plus rien ne referait.
        etat.relierAFaire = true;
        ecrireEtatImport(database, etat);
      }
      const e = ecrireFichierHistorique(database, f, lecture, { octets: copie.octets, version: copie.version, luLe: copie.lu, encodage });
      bilan.importes++;
      bilan.lignes += e.lignes;
      bilan.ignorees += e.ignorees;
      if (!aTelecharger.includes(f)) bilan.reprisDuCache++;
      log({ fichier: f.fichier, importe: e.lignes, ignorees: e.ignorees });
    } catch (error) {
      bilan.echecs++;
      bilan.erreurs.push(`${f.fichier} : ${error.message}`);
      noterFichier(database, f, { statut: 'echec', erreur: `import impossible : ${error.message}`, essais: (c?.essais ?? 0) + 1 });
    }
  }

  // 3. Le rattachement, refait en entier si une ligne a changé.
  if (etat.relierAFaire) {
    bilan.rattachement = rattacherHistorique({ database });
    bilan.relie = true;
    etat.relierAFaire = false;
    etat.relieLe = new Date().toISOString();
  }

  // 4. Où en est l'import complet ?
  const etats = new Map(database.prepare('SELECT fichier, statut FROM fd_fichiers').all().map((f) => [f.fichier, f.statut]));
  const restants = fichiers.filter((f) => !['importe', 'absent'].includes(etats.get(f.fichier)));
  bilan.reste = restants.length;
  bilan.complet = restants.length === 0;
  etat.curseur = restants[0]?.fichier ?? null;
  if (bilan.complet && !etat.complet) {
    etat.termineLe = new Date().toISOString();
    etat.tailleBaseApres = tailleDuFichierBase(database);
  }
  etat.complet = bilan.complet;
  etat.dernierePasse = { le: new Date().toISOString(), requetes: bilan.requetes, telecharges: bilan.telecharges, importes: bilan.importes, echecs: bilan.echecs, dureeMs: Date.now() - debut };
  ecrireEtatImport(database, etat);

  // 5. Le résumé de l'écran.
  const resume = resumeHistorique({ database, aujourdhui, dossier: racine, fichiers: liste });
  writeSourceState(SOURCE_ETAT, 'resume', { cursor: null, done: bilan.complet, detail: resume }, { database });
  bilan.resume = { matchs: resume.totaux.matchs, saisons: resume.totaux.saisons, periode: resume.totaux.periode, rattachees: resume.totaux.rattachees, ecarts: resume.totaux.ecarts, taille: resume.taille?.octets ?? null };
  bilan.dureeMs = Date.now() - debut;
  return bilan;
}
