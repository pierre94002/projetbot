/**
 * forcesButs.js — LES FORCES DE BUTS de chaque club, calculées la nuit (étape 27 du plan, 21/10/2026).
 * -----------------------------------------------------------------------
 * Le modèle de buts unique (core/engine/goalModel.js) lit, pour chaque club,
 * son ÉTAT « avant le jour J » : huit sommes pondérées dans le temps (rapports
 * xG ou buts / moyenne du championnat du match au lieu, attaque et défense),
 * le nombre de matchs comptés, ceux avec xG, et son dernier championnat ; et,
 * pour chaque championnat, ses sommes QUOTIDIENNES à la 90e minute. Ce module
 * les produit depuis la table du jour J (team_day × day_matches) :
 *   - AccumulateurDesForces : l'accumulation, match après match, publiée en
 *     FIN DE JOURNÉE (un match ne voit jamais son jour, ni un autre match du
 *     même jour) — la même pour la nuit et pour le banc d'essai
 *     (bench/entrees.js) ; chaque état vient de jouerUnMatch (goalModel.js),
 *     chaque moyenne de moyennesAvant : une seule formule ;
 *   - calculerLesForces : le calcul COMPLET en flux sur la table du jour J,
 *     dans un PROCESSUS À PART en lecture seule (forcesButsEnfant.js), puis la
 *     DIFFÉRENCE avec ce qui est rangé — par club, le premier jour qui diffère :
 *     jamais un incrément à l'aveugle (feuille tardive, xG rempli après coup,
 *     fusion d'identité sont rattrapés par construction) ;
 *   - rangerLesForces : le SERVEUR, seul écrivain, sous le verrou de la passe,
 *     efface et réécrit par tranches de 250 lignes, une transaction par
 *     tranche, jamais ouverte quand il rend la main ; `en_cours` posé avant,
 *     retiré après (le lecteur du moteur ignore les tables entre les deux) ;
 *   - controleAntiFuiteForces : 40 couples (club, J) tirés avec la graine du
 *     jour, recalculés par un SECOND CHEMIN (les faits du club relus en SQL,
 *     date < J ; les moyennes de chaque championnat refaites en SQL, date < k)
 *     et comparés à 1e-12.
 * HORS de l'empreinte du moteur (engineVersions.js) : un producteur de données,
 * comme la table du jour J ; ce qui fait ses chiffres est dans goalModel.js
 * (dedans), et un essai vérifie que la table relue redonne l'accumulateur.
 * Jamais l'horloge lue ici (`maintenant` passé par l'appelant).
 * -----------------------------------------------------------------------
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, resolveDbPath } from './matchStatsDb.js';
import { empreinteDesRencontres } from './teamStrength.js';
import {
  VERSION_DES_FORCES, faitPourLesForces, faitsDeLaRencontre, jouerUnMatch, matchPourLesForces, moyennesAvant, ajouterALaJournee, saisonEnNombre,
  reglagesDuModeleDeButs, empreinteDesForces
} from '../../core/engine/goalModel.js';
import { creerPauses, executerEnRendantLaMain, rendreLaMainParDefaut } from '../../utils/travailCooperatif.js';
import { commencerCalculLourd, CalculLourdEnCours } from '../../utils/calculLourd.js';

/** La forme des sommes : celle de goalModel.js (VERSION_DES_FORCES) ; une autre version refait tout. */
export const VERSION_FORCES_BUTS = VERSION_DES_FORCES;
/** Lignes écrites (ou effacements) par transaction : quelques dizaines de ms au plus. */
export const TRANCHE_RANGEMENT = 250;
/** Lignes par morceau renvoyé par l'enfant (Float64Array) : jamais un gros message à décoder d'un bloc. */
export const LIGNES_PAR_MORCEAU = 20_000;
/** Le calcul complet prend quelques secondes sur la base du bac : au-delà de 10 min, l'enfant est arrêté. */
export const DELAI_CALCUL_MS = 10 * 60_000;
/** La mémoire de l'enfant : tas plafonné (il ramasse ses déchets au lieu de grossir). */
export const OPTIONS_DE_L_ENFANT = Object.freeze(['--max-old-space-size=512', '--max-semi-space-size=8']);
/** Le contrôle anti-fuite de la nuit : couples (club, J) recalculés par le second chemin, tolérance. */
export const CONTROLE = Object.freeze({ lignes: 40, tolerance: 1e-12 });

const JOUR_MS = 86_400_000;
export const numeroDuJour = (iso) => Math.floor(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / JOUR_MS);
export const jourIso = (n) => new Date(n * JOUR_MS).toISOString().slice(0, 10);
const SOMMES = Object.freeze(['sa', 'wa', 'sd', 'wd', 'sga', 'wga', 'sgd', 'wgd']);

/**
 * Les EMPREINTES DEMANDÉES : celles que lisent les réglages en service et ceux de la candidate en essai (la clé
 * `modeleDeButs`, quand elle existe). Une candidate aux réglages fautifs ne demande rien (elle est refusée ailleurs).
 */
export function empreintesDemandees({ reglagesEnService = null, reglagesCandidate = null } = {}) {
  const out = new Set();
  for (const cfg of [reglagesEnService, reglagesCandidate]) {
    try {
      const r = reglagesDuModeleDeButs(cfg);
      if (r) out.add(empreinteDesForces(r));
    } catch {
      // réglages fautifs : refusés à la validation, ils ne demandent rien
    }
  }
  return [...out].sort();
}

/**
 * Les réglages qui font les SOMMES, relus dans une empreinte (« v1|35|25|remise-a-zero ») : la version des forces,
 * les deux demi-vies, la règle du changement de championnat. Lève sur une empreinte illisible ou d'une autre version.
 */
export function reglagesDeLEmpreinte(empreinte) {
  const m = /^v(\d+)\|([0-9.]+)\|([0-9.]+)\|(remise-a-zero|garder)$/.exec(String(empreinte ?? ''));
  if (!m || Number(m[1]) !== VERSION_FORCES_BUTS) throw new Error(`forces de buts : empreinte illisible ou d'une autre version (« ${String(empreinte)} »).`);
  const attaque = Number(m[2]);
  const defense = Number(m[3]);
  if (!(attaque > 0) || !(defense > 0)) throw new Error(`forces de buts : demi-vies illisibles (« ${empreinte} »).`);
  return Object.freeze({ demiVies: Object.freeze({ attaque, defense }), changementDeChampionnat: m[4] });
}

// ======================================================= l'accumulateur (pur : ni base, ni horloge)

/**
 * L'ACCUMULATION des forces et des moyennes du championnat, rencontre après rencontre, publiée en fin de journée.
 * `empreintes` : les jeux de sommes à tenir (empreinteDesForces) ; `surJournee({ jour, etats, ligues })` (facultatif)
 * reçoit, à chaque fin de journée, les états des clubs qui ont joué ({ empreinte, club, etat }) et les sommes du
 * jour de chaque championnat. Usage : `ajouter(dom, ext)` pour chaque rencontre du jour (les deux faits de
 * faitsDeLaRencontre, dans l'ordre des rencontres), puis `finDeJournee()` ; `etat(empreinte, club)` et
 * `moyennes(league, jour, saison)` lisent ce qui est publié (jamais le jour en cours).
 */
export class AccumulateurDesForces {
  constructor({ empreintes = [], surJournee = null } = {}) {
    this.empreintes = [...empreintes];
    this.reglages = new Map(this.empreintes.map((e) => [e, reglagesDeLEmpreinte(e)]));
    this.etats = new Map(this.empreintes.map((e) => [e, new Map()]));
    this.ligues = new Map();
    this.jour = null;
    this.dernierJour = null;
    this.attente = [];
    this.surJournee = surJournee;
    this.rencontres = 0;
  }

  /** Les moyennes du championnat `league` avant le jour `jour` (moyennesAvant sur ses journées publiées), gardées par jour. */
  moyennes(league, jour, saison) {
    let l = this.ligues.get(league);
    if (!l) this.ligues.set(league, (l = { jours: [], cache: new Map() }));
    const cle = `${jour}|${saison}`;
    let m = l.cache.get(cle);
    if (!m) {
      m = moyennesAvant(l.jours, { jour, saison });
      l.cache.set(cle, m);
    }
    return m;
  }

  /** L'état publié d'un club (après ses matchs des jours d'avant), ou null. */
  etat(empreinte, club) {
    return this.etats.get(empreinte)?.get(club) ?? null;
  }

  /** Une rencontre du jour : ses deux faits (faitsDeLaRencontre), appliqués en fin de journée. */
  ajouter(dom, ext) {
    if (this.jour !== null && dom.jour !== this.jour) throw new Error(`forces de buts : la rencontre du ${dom.jour} arrive avant la fin de la journée du ${this.jour}.`);
    if (this.dernierJour !== null && dom.jour <= this.dernierJour) throw new Error(`forces de buts : la journée du ${dom.jour} arrive après celle du ${this.dernierJour} — les journées s'ajoutent dans l'ordre.`);
    this.jour = dom.jour;
    this.attente.push({ dom, ext });
  }

  /** La fin de la journée : chaque rencontre met à jour ses deux clubs (moyennes d'AVANT le jour), puis le championnat avance. */
  finDeJournee() {
    if (this.jour === null) return;
    const jour = this.jour;
    const touches = new Set();
    for (const { dom, ext } of this.attente) {
      const L = this.moyennes(dom.league, jour, dom.saison);
      for (const e of this.empreintes) {
        const r = this.reglages.get(e);
        const etats = this.etats.get(e);
        for (const f of [dom, ext]) {
          etats.set(f.club, jouerUnMatch(etats.get(f.club) ?? null, matchPourLesForces(f, L), r));
          touches.add(f.club);
        }
      }
      this.rencontres++;
    }
    const duJour = new Map();
    for (const { dom } of this.attente) {
      if (!dom.compte) continue;
      let j = duJour.get(dom.league);
      if (!j) duJour.set(dom.league, (j = { jour, saison: dom.saison, n: 0, bd: 0, be: 0, nx: 0, xd: 0, xe: 0 }));
      ajouterALaJournee(j, dom);
    }
    for (const [league, j] of duJour) {
      let l = this.ligues.get(league);
      if (!l) this.ligues.set(league, (l = { jours: [], cache: new Map() }));
      l.jours.push(j);
      l.cache.clear();
    }
    if (this.surJournee) {
      const clubs = [...touches].sort((a, b) => a - b);
      this.surJournee({
        jour,
        etats: this.empreintes.flatMap((e) => clubs.map((club) => ({ empreinte: e, club, etat: this.etats.get(e).get(club) }))),
        ligues: [...duJour].map(([league, j]) => ({ league, ...j }))
      });
    }
    this.attente = [];
    this.dernierJour = jour;
    this.jour = null;
  }
}

// ======================================================= la lecture de la table du jour J (en flux)

/**
 * Les rencontres de la table du jour J, en FLUX, dans l'ordre (jour, clé) : la ligne du camp qui reçoit (team_day
 * camp 1) et le championnat du registre. Générateur ; jusqu'au jour `jusqua` compris s'il est donné.
 */
export function* faitsDeTeamDay(database, { jusqua = null } = {}) {
  const sql = `SELECT d.match_key AS matchKey, t.rencontre, t.camp, t.club, t.adversaire, t.date, t.league, t.saison, t.attribue, t.prolongation, t.compte,
      t.coupe, t.bp, t.bc, t.bp90, t.bc90, t.xg_p, t.xg_c
    FROM day_matches d JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1
    ${jusqua ? 'WHERE d.date <= ?' : ''} ORDER BY d.date, d.match_key`;
  const st = database.prepare(sql);
  for (const r of jusqua ? st.iterate(jusqua) : st.iterate()) yield r;
}

// ======================================================= le calcul (processus à part, lecture seule)

/** Les lignes rangées d'une empreinte, dans l'ordre (club, jour) : la lecture en flux de la différence. */
function* lignesRangees(database, empreinte) {
  try {
    yield* database.prepare('SELECT club, jour, ligue, n, nx, sa, wa, sd, wd, sga, wga, sgd, wgd FROM forces_buts WHERE reglages = ? ORDER BY club, jour').iterate(empreinte);
  } catch (error) {
    if (!/no such table/i.test(String(error?.message ?? ''))) throw error;
  }
}

/** Les journées rangées de chaque championnat, dans l'ordre (league, jour). */
function lignesDeLiguesRangees(database) {
  try {
    return database.prepare('SELECT league, jour, saison, n, bd, be, nx, xd, xe FROM forces_buts_ligues ORDER BY league, jour').all();
  } catch (error) {
    if (/no such table/i.test(String(error?.message ?? ''))) return [];
    throw error;
  }
}

/** Les empreintes rangées dans la table (toutes celles qui ont au moins une ligne). */
function empreintesRangees(database) {
  try {
    return database.prepare('SELECT DISTINCT reglages FROM forces_buts').all().map((r) => r.reglages);
  } catch (error) {
    if (/no such table/i.test(String(error?.message ?? ''))) return [];
    throw error;
  }
}

/** Le tampon des lignes calculées d'une empreinte : colonnes typées, qui grandissent par doublement. */
class Tampon {
  constructor() {
    this.n = 0;
    this.capacite = 1024;
    this.club = new Int32Array(this.capacite);
    this.jour = new Int32Array(this.capacite);
    this.nb = new Int32Array(this.capacite);
    this.nx = new Int32Array(this.capacite);
    this.ligue = new Int32Array(this.capacite);
    this.sommes = new Float64Array(this.capacite * 8);
  }
  ajouter(club, jour, etat, ligue) {
    if (this.n === this.capacite) {
      const c = this.capacite * 2;
      for (const k of ['club', 'jour', 'nb', 'nx', 'ligue']) {
        const t = new Int32Array(c);
        t.set(this[k]);
        this[k] = t;
      }
      const s = new Float64Array(c * 8);
      s.set(this.sommes);
      this.sommes = s;
      this.capacite = c;
    }
    const i = this.n++;
    this.club[i] = club;
    this.jour[i] = jour;
    this.nb[i] = etat.n;
    this.nx[i] = etat.nx;
    this.ligue[i] = ligue;
    for (let k = 0; k < 8; k++) this.sommes[i * 8 + k] = etat[SOMMES[k]];
  }
  /** Les indices des lignes rangés par (club, jour) : les jours sont déjà croissants pour un même club. */
  ordre() {
    const idx = new Uint32Array(this.n);
    for (let i = 0; i < this.n; i++) idx[i] = i;
    return idx.sort((a, b) => this.club[a] - this.club[b] || a - b);
  }
}

/** Largeur d'une ligne envoyée au serveur : empreinte, club, jour, n, nx, 8 sommes, championnat. */
export const LARGEUR = 14;

/**
 * LE CALCUL, sur une base ouverte EN LECTURE SEULE (le processus à part, un script, un essai) : l'empreinte des
 * rencontres ; rien de changé depuis `precedente` (même version, mêmes empreintes demandées) → { rien: true } ;
 * sinon le calcul COMPLET en flux, la différence avec la table rangée, et le contrôle anti-fuite (graine du jour).
 * Générateur. Rend { rien, empreinteRencontres, empreintes, lignes (morceaux Float64Array), nLignes, effacer,
 * retirerEmpreintes, ligues: { lignes, effacer }, nomsLigues, jusqua, controle, bilan }.
 */
export function* calculerLesForces({ database, empreintes = [], precedente = null, force = false, graine = null, jusqua = null } = {}) {
  const debut = performance.now();
  const demandees = [...new Set(empreintes)].sort();
  const empreinteRencontres = empreinteDesRencontres(database);
  yield 'empreinte';
  const rangees = empreintesRangees(database);
  const retirerEmpreintes = rangees.filter((e) => !demandees.includes(e));
  const memes =
    !force &&
    precedente &&
    precedente.version === VERSION_FORCES_BUTS &&
    JSON.stringify([...(precedente.empreintes ?? [])].sort()) === JSON.stringify(demandees) &&
    JSON.stringify(precedente.empreinteRencontres ?? null) === JSON.stringify(empreinteRencontres) &&
    !retirerEmpreintes.length;
  if (memes) return { rien: true, empreinteRencontres, empreintes: demandees, dureeMs: Math.round(performance.now() - debut) };

  // 1. Le calcul complet, en flux sur la table du jour J.
  const nomsLigues = [];
  const indexLigue = new Map();
  const ligue = (nom) => {
    if (nom === null || nom === undefined) return -1;
    let i = indexLigue.get(nom);
    if (i === undefined) {
      i = nomsLigues.length;
      nomsLigues.push(nom);
      indexLigue.set(nom, i);
    }
    return i;
  };
  const tampons = new Map(demandees.map((e) => [e, new Tampon()]));
  const liguesCalculees = new Map();
  const acc = new AccumulateurDesForces({
    empreintes: demandees,
    surJournee: ({ jour, etats, ligues }) => {
      const j = numeroDuJour(jour);
      for (const x of etats) tampons.get(x.empreinte).ajouter(x.club, j, x.etat, ligue(x.etat.ligue));
      for (const l of ligues) {
        if (!liguesCalculees.has(l.league)) liguesCalculees.set(l.league, []);
        liguesCalculees.get(l.league).push(l);
      }
    }
  });
  let lues = 0;
  let attribuees = 0;
  let dernier = null;
  for (const r of faitsDeTeamDay(database, { jusqua })) {
    if (dernier !== null && r.date !== dernier) acc.finDeJournee();
    dernier = r.date;
    const faits = faitsDeLaRencontre(r);
    if (!faits) attribuees++;
    else acc.ajouter(faits.dom, faits.ext);
    if (++lues % 5000 === 0) yield 'calcul';
  }
  acc.finDeJournee();
  const tCalcul = performance.now();
  yield 'calcul';

  // 2. La différence avec la table rangée : par club, le premier jour qui diffère ; les lignes d'après sont réécrites.
  const lignes = [];
  let morceau = new Float64Array(LIGNES_PAR_MORCEAU * LARGEUR);
  let dansLeMorceau = 0;
  let nLignes = 0;
  const pousser = (e, t, i) => {
    const o = dansLeMorceau * LARGEUR;
    morceau[o] = e;
    morceau[o + 1] = t.club[i];
    morceau[o + 2] = t.jour[i];
    morceau[o + 3] = t.nb[i];
    morceau[o + 4] = t.nx[i];
    for (let k = 0; k < 8; k++) morceau[o + 5 + k] = t.sommes[i * 8 + k];
    morceau[o + 13] = t.ligue[i];
    nLignes++;
    if (++dansLeMorceau === LIGNES_PAR_MORCEAU) {
      lignes.push(morceau);
      morceau = new Float64Array(LIGNES_PAR_MORCEAU * LARGEUR);
      dansLeMorceau = 0;
    }
  };
  const effacer = {};
  const egales = (t, i, s) =>
    t.jour[i] === numeroDuJour(s.jour) &&
    t.nb[i] === s.n &&
    t.nx[i] === s.nx &&
    (t.ligue[i] === -1 ? s.ligue === null : nomsLigues[t.ligue[i]] === s.ligue) &&
    SOMMES.every((k, c) => t.sommes[i * 8 + c] === s[k]);
  let comparees = 0;
  for (const [ei, e] of demandees.entries()) {
    const t = tampons.get(e);
    const ordre = t.ordre();
    const aEffacer = (effacer[e] = []);
    const flux = lignesRangees(database, e);
    let s = flux.next();
    let p = 0;
    while (p < ordre.length || !s.done) {
      const clubC = p < ordre.length ? t.club[ordre[p]] : Infinity;
      const clubS = !s.done ? s.value.club : Infinity;
      const club = Math.min(clubC, clubS);
      const calcules = [];
      while (p < ordre.length && t.club[ordre[p]] === club) calcules.push(ordre[p++]);
      const stockees = [];
      while (!s.done && s.value.club === club) {
        stockees.push(s.value);
        s = flux.next();
      }
      let m = 0;
      while (m < calcules.length && m < stockees.length && egales(t, calcules[m], stockees[m])) m++;
      comparees += calcules.length;
      if (m === calcules.length && m === stockees.length) continue;
      const jours = [m < calcules.length ? t.jour[calcules[m]] : Infinity, m < stockees.length ? numeroDuJour(stockees[m].jour) : Infinity];
      const depuis = Math.min(...jours);
      aEffacer.push([club, jourIso(depuis)]);
      for (let k = m; k < calcules.length; k++) if (t.jour[calcules[k]] >= depuis) pousser(ei, t, calcules[k]);
      if (comparees % 20_000 < calcules.length) yield 'différence';
    }
  }
  if (dansLeMorceau) lignes.push(morceau.slice(0, dansLeMorceau * LARGEUR));
  // Les championnats : même différence, par championnat.
  const rangeesLigues = new Map();
  for (const r of lignesDeLiguesRangees(database)) {
    if (!rangeesLigues.has(r.league)) rangeesLigues.set(r.league, []);
    rangeesLigues.get(r.league).push(r);
  }
  const liguesAEcrire = [];
  const liguesAEffacer = [];
  const memeJournee = (a, b) => a.jour === b.jour && a.saison === b.saison && a.n === b.n && a.bd === b.bd && a.be === b.be && a.nx === b.nx && a.xd === b.xd && a.xe === b.xe;
  for (const league of [...new Set([...liguesCalculees.keys(), ...rangeesLigues.keys()])].sort()) {
    const c = liguesCalculees.get(league) ?? [];
    const r = rangeesLigues.get(league) ?? [];
    let m = 0;
    while (m < c.length && m < r.length && memeJournee(c[m], r[m])) m++;
    if (m === c.length && m === r.length) continue;
    const depuis = [m < c.length ? c[m].jour : null, m < r.length ? r[m].jour : null].filter(Boolean).sort()[0];
    liguesAEffacer.push([league, depuis]);
    for (let k = m; k < c.length; k++) if (c[k].jour >= depuis) liguesAEcrire.push({ league, ...c[k] });
  }
  const tDifference = performance.now();
  yield 'différence';

  // 3. Le contrôle anti-fuite : des couples (club, J) recalculés par le second chemin, face à ce qui vient d'être calculé.
  const lire = (empreinte, club, J) => {
    const t = tampons.get(empreinte);
    if (!t) return null;
    const j = numeroDuJour(J);
    let trouve = -1;
    for (let i = 0; i < t.n; i++) if (t.club[i] === club && t.jour[i] < j && (trouve < 0 || t.jour[i] > t.jour[trouve])) trouve = i;
    if (trouve < 0) return null;
    const etat = { n: t.nb[trouve], nx: t.nx[trouve], ligue: t.ligue[trouve] === -1 ? null : nomsLigues[t.ligue[trouve]] };
    SOMMES.forEach((k, c) => (etat[k] = t.sommes[trouve * 8 + c]));
    return etat;
  };
  // Étape 27 (vérification des fuites, constat 2) : TOUTES les empreintes demandées sont contrôlées (la version en service
  // ET la candidate), pas seulement la première ; chaque écart dit son empreinte.
  const controle = demandees.length && graine !== null ? yield* controleDesEmpreintesPas({ database, graine, empreintes: demandees, lire, tampons }) : null;
  const tControle = performance.now();
  const derniereJournee = acc.dernierJour;
  return {
    rien: false,
    empreinteRencontres,
    empreintes: demandees,
    complet: true,
    lignes,
    nLignes,
    effacer,
    retirerEmpreintes,
    ligues: { lignes: liguesAEcrire, effacer: liguesAEffacer },
    nomsLigues,
    jusqua: derniereJournee,
    controle,
    bilan: {
      rencontres: acc.rencontres,
      attribuees,
      lignesCalculees: Object.fromEntries([...tampons].map(([e, t]) => [e, t.n])),
      clubsTouches: Object.fromEntries(Object.entries(effacer).map(([e, l]) => [e, l.length])),
      liguesTouchees: liguesAEffacer.length,
      championnats: liguesCalculees.size,
      dureeMs: Math.round(performance.now() - debut),
      parties: { calcul: Math.round(tCalcul - debut), difference: Math.round(tDifference - tCalcul), controle: Math.round(tControle - tDifference) }
    }
  };
}

// ======================================================= le contrôle anti-fuite (second chemin)

/** Un générateur de nombres à graine (mulberry32) : le même tirage pour la même graine. */
function tirage(graine) {
  let a = graine >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Le SECOND CHEMIN : l'état d'un club « avant J », refait depuis ses seuls faits relus en SQL (date < J écrit en
 * toutes lettres) ; pour chacun de ses matchs k, les moyennes du championnat de k refaites en SQL (date < k), puis
 * jouerUnMatch dans l'ordre. `reglages` : ceux de l'empreinte. Aucune ligne de forces_buts ni de l'accumulateur.
 */
export function etatParLeSecondChemin({ database, club, J, reglages, liguesSql = new Map() }) {
  const faits = faitsDuClubEnSql(database, club, J);
  chargerLesJourneesEnSql(database, new Set(faits.map((r) => r.league)), liguesSql);
  return etatDepuisLesFaits(faits, reglages, liguesSql);
}

/** Les faits d'un club relus en SQL, date < J écrit en toutes lettres, dans l'ordre (jour, clé). */
function faitsDuClubEnSql(database, club, J) {
  return database
    .prepare(`SELECT t.*, d.match_key AS matchKey FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre
              WHERE t.club = ? AND t.date < ? ORDER BY t.date, d.match_key`)
    .all(club, J);
}

/**
 * Les journées de chaque championnat demandé, refaites en SQL depuis team_day (le camp qui reçoit ; ni attribués,
 * hors classement exclus ; buts de la 90e ; xG d'un match non prolongé avec les deux côtés) — une seule lecture
 * pour tous les championnats qui manquent encore à `liguesSql`.
 */
function chargerLesJourneesEnSql(database, ligues, liguesSql) {
  const manquantes = [...ligues].filter((l) => !liguesSql.has(l));
  if (!manquantes.length) return;
  for (const l of manquantes) liguesSql.set(l, []);
  const lignes = database
    .prepare(`SELECT h.league, h.date AS jour, h.saison, COUNT(*) AS n,
                SUM(CASE WHEN h.prolongation = 1 THEN COALESCE(h.bp90, 0) ELSE h.bp END) AS bd,
                SUM(CASE WHEN h.prolongation = 1 THEN COALESCE(h.bc90, 0) ELSE h.bc END) AS be,
                SUM(CASE WHEN h.prolongation = 0 AND h.xg_p IS NOT NULL AND h.xg_c IS NOT NULL THEN 1 ELSE 0 END) AS nx,
                SUM(CASE WHEN h.prolongation = 0 AND h.xg_p IS NOT NULL AND h.xg_c IS NOT NULL THEN h.xg_p ELSE 0 END) AS xd,
                SUM(CASE WHEN h.prolongation = 0 AND h.xg_p IS NOT NULL AND h.xg_c IS NOT NULL THEN h.xg_c ELSE 0 END) AS xe
              FROM team_day h WHERE h.camp = 1 AND h.attribue = 0 AND h.compte = 1 AND h.league IN (${manquantes.map(() => '?').join(', ')})
              GROUP BY h.league, h.date, h.saison ORDER BY h.league, h.date`)
    .all(...manquantes);
  for (const r of lignes) liguesSql.get(r.league).push({ jour: r.jour, saison: r.saison, n: r.n, bd: r.bd, be: r.be, nx: r.nx, xd: r.xd, xe: r.xe });
}

/** L'état d'un club refait depuis ses faits (relus en SQL) et les journées de championnat refaites en SQL. */
function etatDepuisLesFaits(faits, reglages, liguesSql) {
  let etat = null;
  for (const r of faits) {
    const f = faitPourLesForces(r);
    if (!f) continue;
    const L = moyennesAvant(liguesSql.get(f.league) ?? [], { jour: f.jour, saison: saisonEnNombre(f.saison) });
    etat = jouerUnMatch(etat, matchPourLesForces(f, L), reglages);
  }
  return etat;
}

/** Les écarts entre deux états (colonne par colonne, à `tolerance` près) : [{ colonne, attendu, lu }]. */
export function ecartsDEtats(attendu, lu, tolerance = CONTROLE.tolerance) {
  const out = [];
  if (!attendu || !lu) {
    if (attendu || lu) out.push({ colonne: 'ligne', attendu: attendu ? 'un état' : 'aucun', lu: lu ? 'un état' : 'aucun' });
    return out;
  }
  for (const k of ['n', 'nx']) if (attendu[k] !== lu[k]) out.push({ colonne: k, attendu: attendu[k], lu: lu[k] });
  if ((attendu.ligue ?? null) !== (lu.ligue ?? null)) out.push({ colonne: 'ligue', attendu: attendu.ligue ?? null, lu: lu.ligue ?? null });
  for (const k of SOMMES) if (!(Math.abs(attendu[k] - lu[k]) <= tolerance)) out.push({ colonne: k, attendu: attendu[k], lu: lu[k] });
  return out;
}

/**
 * Le contrôle (générateur) : `lignes` couples (club, J) tirés avec la graine parmi les lignes calculées (J = le jour
 * de match suivant du club, ou le lendemain de sa dernière ligne), l'état lu (`lire(empreinte, club, J)`) face au
 * second chemin. `imposes` : des couples { club, J } à contrôler EN PLUS (un essai qui plante une fuite connue).
 * Rend { le: null, graine, empreinte, lignes, ecarts: [{ club, J, colonne, attendu, lu }] }.
 */
function* controleAntiFuiteForcesPas({ database, graine, empreinte, lire, tampon, lignes = CONTROLE.lignes, imposes = [] }) {
  const reglages = reglagesDeLEmpreinte(empreinte);
  const u = tirage(graine);
  const ecarts = [];
  const couples = [];
  const vusImposes = new Set();
  for (const c of imposes ?? []) {
    const cle = `${Number(c.club)}|${c.J}`;
    if (vusImposes.has(cle)) continue;
    vusImposes.add(cle);
    couples.push({ club: Number(c.club), J: String(c.J) });
  }
  if (tampon && tampon.n) {
    const vus = new Set(vusImposes);
    const cible = couples.length + lignes;
    for (let essai = 0; essai < lignes * 20 && couples.length < cible; essai++) {
      const i = Math.floor(u() * tampon.n);
      const club = tampon.club[i];
      let suivant = null;
      for (let k = i + 1; k < tampon.n; k++) {
        if (tampon.club[k] === club) {
          suivant = tampon.jour[k];
          break;
        }
      }
      const J = jourIso(suivant ?? tampon.jour[i] + 1);
      const cle = `${club}|${J}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      couples.push({ club, J });
    }
  }
  // Les faits de chaque club d'abord (une lecture par club, par l'index du club), puis toutes les journées de leurs
  // championnats en UNE lecture de team_day.
  const faits = [];
  for (const c of couples) {
    faits.push(faitsDuClubEnSql(database, c.club, c.J));
    yield 'contrôle';
  }
  const liguesSql = new Map();
  chargerLesJourneesEnSql(database, new Set(faits.flatMap((f) => f.map((r) => r.league))), liguesSql);
  yield 'contrôle';
  couples.forEach(({ club, J }, i) => {
    const attendu = etatDepuisLesFaits(faits[i], reglages, liguesSql);
    for (const e of ecartsDEtats(attendu, lire(empreinte, club, J))) ecarts.push({ club, J, ...e });
  });
  return { graine, empreinte, lignes: couples.length, ecarts };
}

/**
 * Le contrôle anti-fuite de TOUTES les empreintes demandées, l'une après l'autre (étape 27, vérification des fuites,
 * constat 2 : la nuit ne contrôlait que la première) ; générateur, la main rendue comme pour une seule. `imposes` : des
 * couples { club, J } contrôlés en plus, par empreinte (un essai). Rend { graine, empreinte (toutes, séparées par « ; »),
 * empreintes (par empreinte : ses lignes et son nombre d'écarts), lignes (en tout), ecarts (chacun nomme son empreinte) }.
 */
export function* controleDesEmpreintesPas({ database, graine, empreintes, lire, tampons, lignes = CONTROLE.lignes, imposes = {} }) {
  const parts = [];
  for (const e of empreintes) parts.push(yield* controleAntiFuiteForcesPas({ database, graine, empreinte: e, lire, tampon: tampons.get(e), lignes, imposes: imposes[e] ?? [] }));
  return {
    graine,
    empreinte: empreintes.join(' ; '),
    empreintes: parts.map((p) => ({ empreinte: p.empreinte, lignes: p.lignes, ecarts: p.ecarts.length })),
    lignes: parts.reduce((s, p) => s + p.lignes, 0),
    ecarts: parts.flatMap((p) => p.ecarts.map((x) => ({ empreinte: p.empreinte, ...x })))
  };
}

/**
 * LE CONTRÔLE ANTI-FUITE des forces RANGÉES (un essai, ou une vérification à la main) : `lignes` couples (club, J)
 * tirés avec la graine parmi les lignes de forces_buts de l'empreinte, lus comme le lecteur du moteur (dernière
 * ligne de jour < J), face au second chemin ; `couples` : des couples { club, J } contrôlés en plus (un essai).
 * Rend { graine, empreinte, lignes, ecarts }.
 */
export function controleAntiFuiteForces({ database = openDb(), graine = 1, empreinte, lignes = CONTROLE.lignes, couples = [] } = {}) {
  const rangees = database.prepare('SELECT club, jour FROM forces_buts WHERE reglages = ? ORDER BY club, jour').all(empreinte);
  const tampon = { n: rangees.length, club: rangees.map((r) => r.club), jour: rangees.map((r) => numeroDuJour(r.jour)) };
  const lireLigne = database.prepare('SELECT ligue, n, nx, sa, wa, sd, wd, sga, wga, sgd, wgd FROM forces_buts WHERE reglages = ? AND club = ? AND jour < ? ORDER BY jour DESC LIMIT 1');
  const lire = (e, club, J) => {
    const r = lireLigne.get(e, club, J);
    return r ? { ...r, ligue: r.ligue ?? null } : null;
  };
  const travail = controleAntiFuiteForcesPas({ database, graine, empreinte, lire, tampon, lignes, imposes: couples });
  let etape = travail.next();
  while (!etape.done) etape = travail.next();
  return etape.value;
}

// ======================================================= le processus à part

const ENFANT = fileURLToPath(new URL('./forcesButsEnfant.js', import.meta.url));

/**
 * Le calcul dans un PROCESSUS À PART (le patron de l'indice de force, étape 29) : fork de forcesButsEnfant.js, base
 * en LECTURE SEULE, sérialisation « avancée » (les lignes en Float64Array, par morceaux). Un calcul lourd à la fois
 * (utils/calculLourd.js) : un autre en cours, la promesse est rejetée par CalculLourdEnCours (reporté). Rend une
 * promesse de la réponse de calculerLesForces ; rejette si l'enfant échoue, se tait au-delà de `delaiMs` (il est
 * alors arrêté) ou s'arrête sans répondre.
 */
export function calculerAPart({ chemin, empreintes, precedente = null, force = false, graine = null, delaiMs = DELAI_CALCUL_MS }) {
  let rendre;
  try {
    rendre = commencerCalculLourd('forces de buts');
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    let fini = false;
    let erreurs = '';
    const morceaux = [];
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
        morceaux.push(m.morceau);
        return;
      }
      clearTimeout(minuterie);
      if (fini) return;
      fini = true;
      if (m?.erreur) reject(new Error(m.erreur));
      else resolve(m.rien ? m : { ...m, lignes: morceaux });
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
    enfant.send({ chemin, empreintes, precedente, force, graine });
  }).finally(rendre);
}

// ======================================================= l'état et le rangement (le serveur, seul écrivain)

const json = (t) => {
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
};

/**
 * L'ÉTAT des forces (forces_buts_state), tel que l'écrit le dernier rangement — JAMAIS de calcul ni d'écriture.
 * `empreintes` : celles qu'on demande ; `aJour` : rangement fini, même version, toutes servies.
 */
export function etatForcesButs({ database = openDb(), empreintes = [] } = {}) {
  let brut = null;
  try {
    brut = Object.fromEntries(database.prepare('SELECT cle, valeur FROM forces_buts_state').all().map((r) => [r.cle, r.valeur]));
  } catch (error) {
    if (!/no such table/i.test(String(error?.message ?? ''))) throw error;
  }
  const version = brut?.version ? Number(brut.version) : null;
  const servies = json(brut?.empreintes) ?? [];
  const absent = !brut || version === null || !brut.calcule_le;
  const manquantes = empreintes.filter((e) => !servies.includes(e));
  return {
    absent,
    version,
    versionAttendue: VERSION_FORCES_BUTS,
    empreintes: servies,
    manquantes,
    empreinteRencontres: json(brut?.empreinte_rencontres),
    jusqua: brut?.jusqua || null,
    calculeLe: brut?.calcule_le ?? null,
    enCours: brut?.en_cours ?? null,
    bilan: json(brut?.bilan),
    controle: json(brut?.controle),
    aJour: !absent && version === VERSION_FORCES_BUTS && !brut?.en_cours && !manquantes.length
  };
}

/** Annule la transaction en cours, s'il y en a une. */
function annuler(database) {
  try {
    if (database.isTransaction !== false) database.exec('ROLLBACK');
  } catch {
    // aucune transaction ouverte
  }
}

/**
 * RANGE un calcul (générateur ; le serveur ou le script du bac, sous le verrou de la passe) : `en_cours` posé, puis
 * par club touché l'effacement à partir de son premier jour qui diffère et l'écriture de ses nouvelles lignes, les
 * empreintes plus demandées retirées, les championnats de même, enfin l'état — par tranches de `tranche` ordres, une
 * transaction chacune, JAMAIS ouverte pendant un point d'arrêt. Un rangement interrompu laisse `en_cours` : le
 * lecteur du moteur ignore les tables, la nuit suivante refait tout. `maintenant` : une fonction qui rend l'heure (ISO),
 * OBLIGATOIRE (jamais l'horloge lue ici). Rend { ecrites, retirees, plusLongueTrancheMs }.
 */
export function* rangerLesForces({ database, calcul, maintenant, tranche = TRANCHE_RANGEMENT }) {
  if (typeof maintenant !== 'function') throw new Error('rangerLesForces : « maintenant » (une fonction qui rend l’heure) est obligatoire.');
  const etat = database.prepare('INSERT OR REPLACE INTO forces_buts_state (cle, valeur) VALUES (?, ?)');
  etat.run('en_cours', maintenant());
  yield 'en cours';
  let retirees = 0;
  let ecrites = 0;
  let plusLongueMs = 0;
  // Une suite d'ordres, coupée en transactions de `tranche` ; la main n'est rendue qu'entre deux.
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
  // 1. Les empreintes plus demandées : toutes leurs lignes, par tranches.
  const retirerUneTranche = database.prepare('DELETE FROM forces_buts WHERE (reglages, club, jour) IN (SELECT reglages, club, jour FROM forces_buts WHERE reglages = ? LIMIT ?)');
  for (const e of calcul.retirerEmpreintes ?? []) {
    for (;;) {
      let n = 0;
      yield* parTranches([() => (n = retirerUneTranche.run(e, tranche).changes)]);
      retirees += n;
      if (n < tranche) break;
    }
  }
  // 2. Par empreinte, les clubs touchés : effacés à partir de leur premier jour qui diffère.
  const effacerClub = database.prepare('DELETE FROM forces_buts WHERE reglages = ? AND club = ? AND jour >= ?');
  for (const [e, clubs] of Object.entries(calcul.effacer ?? {})) {
    yield* parTranches(clubs.map(([club, depuis]) => () => (retirees += effacerClub.run(e, club, depuis).changes)));
  }
  // 3. Les nouvelles lignes.
  const inserer = database.prepare('INSERT OR REPLACE INTO forces_buts (reglages, club, jour, ligue, n, nx, sa, wa, sd, wd, sga, wga, sgd, wgd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const empreintes = calcul.empreintes ?? [];
  const noms = calcul.nomsLigues ?? [];
  function* ordresDInsertion() {
    for (const m of calcul.lignes ?? []) {
      for (let o = 0; o < m.length; o += LARGEUR) {
        const valeurs = [empreintes[m[o]], m[o + 1], jourIso(m[o + 2]), m[o + 13] === -1 ? null : noms[m[o + 13]], m[o + 3], m[o + 4], m[o + 5], m[o + 6], m[o + 7], m[o + 8], m[o + 9], m[o + 10], m[o + 11], m[o + 12]];
        yield () => {
          inserer.run(...valeurs);
          ecrites++;
        };
      }
    }
  }
  yield* parTranches(ordresDInsertion());
  // 4. Les championnats.
  const effacerLigue = database.prepare('DELETE FROM forces_buts_ligues WHERE league = ? AND jour >= ?');
  const insererLigue = database.prepare('INSERT OR REPLACE INTO forces_buts_ligues (league, jour, saison, n, bd, be, nx, xd, xe) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  yield* parTranches((calcul.ligues?.effacer ?? []).map(([league, depuis]) => () => effacerLigue.run(league, depuis)));
  yield* parTranches((calcul.ligues?.lignes ?? []).map((l) => () => insererLigue.run(l.league, l.jour, l.saison, l.n, l.bd, l.be, l.nx, l.xd, l.xe)));
  // 5. L'état, puis `en_cours` retiré : la table est servie.
  database.exec('BEGIN IMMEDIATE');
  try {
    etat.run('version', String(VERSION_FORCES_BUTS));
    etat.run('empreintes', JSON.stringify(empreintes));
    etat.run('empreinte_rencontres', JSON.stringify(calcul.empreinteRencontres ?? null));
    etat.run('jusqua', calcul.jusqua ?? '');
    etat.run('calcule_le', maintenant());
    etat.run('bilan', JSON.stringify({ ...(calcul.bilan ?? {}), ecrites, retirees }));
    if (calcul.controle) etat.run('controle', JSON.stringify({ ...calcul.controle, le: maintenant() }));
    database.prepare("DELETE FROM forces_buts_state WHERE cle = 'en_cours'").run();
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
 * LA PASSE DE NUIT (étape « forcesButs » de l'actualisation ; scripts/forces-buts.mjs dans le bac), SOUS le verrou :
 *   1. l'état (une lecture), puis le PROCESSUS À PART attendu sans tenir la main : l'empreinte des rencontres et,
 *      si rien n'a changé (même version, mêmes empreintes demandées), RIEN ; sinon le calcul complet, la
 *      différence et le contrôle anti-fuite ;
 *   2. le rangement par tranches courtes, la main rendue entre deux (rangerLesForces) ;
 *   3. un autre calcul lourd en cours : « reporte » (rien de fait, la passe suivante le fera) ; en échec : rien
 *      d'avancé (l'état n'est écrit qu'à la fin), la passe suivante recommence.
 * `empreintes` : celles que lisent la version en service et la candidate en essai ; aucune et rien de rangé →
 * « rien à faire ». `maintenant` : une fonction qui rend l'heure (ISO), OBLIGATOIRE — l'appelant la passe (la passe de
 * nuit, le script du bac), jamais l'horloge lue ici. Jamais d'exception pour une panne du calcul.
 */
export async function forcesDeButs({
  empreintes = [],
  force = false,
  database = openDb(),
  chemin = resolveDbPath(),
  aPart = true,
  delaiMs = DELAI_CALCUL_MS,
  rendreLaMain = rendreLaMainParDefaut,
  maintenant,
  controle = true
} = {}) {
  if (typeof maintenant !== 'function') throw new Error('forcesDeButs : « maintenant » (une fonction qui rend l’heure) est obligatoire.');
  const debut = performance.now();
  const pauses = creerPauses({ rendreLaMain });
  const demandees = [...new Set(empreintes)].sort();
  const etat = etatForcesButs({ database, empreintes: demandees });
  if (!demandees.length && !etat.empreintes.length) {
    return { mode: 'rien', raison: 'aucune version du moteur ne lit les forces de buts', empreintes: [], dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
  }
  const precedente = !force && !etat.absent && !etat.enCours ? { version: etat.version, empreintes: etat.empreintes, empreinteRencontres: etat.empreinteRencontres } : null;
  const graine = controle && demandees.length ? graineDuJour(maintenant()) : null;
  let r;
  try {
    r = aPart
      ? await pauses.attendre(calculerAPart({ chemin, empreintes: demandees, precedente, force, graine, delaiMs }), 'calcul à part')
      : await executerEnRendantLaMain(calculerLesForces({ database, empreintes: demandees, precedente, force, graine }), pauses.siLongtemps);
  } catch (error) {
    if (error instanceof CalculLourdEnCours || error?.reporte) return { mode: 'reporte', raison: error.message, empreintes: demandees, dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
    return { mode: 'echec', erreur: String(error?.message ?? error), empreintes: demandees, dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
  }
  if (r.rien) return { mode: 'rien', empreintes: demandees, calculeLe: etat.calculeLe, jusqua: etat.jusqua, dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
  const tRangement = performance.now();
  let range;
  try {
    range = await executerEnRendantLaMain(rangerLesForces({ database, calcul: r, maintenant }), pauses.siLongtemps);
  } catch (error) {
    return { mode: 'echec', erreur: `rangement : ${String(error?.message ?? error)}`, empreintes: demandees, dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
  }
  return {
    mode: etat.absent ? 'premier' : 'complet',
    empreintes: demandees,
    lignes: r.nLignes,
    ecrites: range.ecrites,
    retirees: range.retirees,
    // Les empreintes qu'aucune version ne lit plus : leurs lignes retirées (dit dans le résumé de la passe).
    empreintesRetirees: r.retirerEmpreintes ?? [],
    plusLongueTrancheMs: range.plusLongueTrancheMs,
    clubs: Object.values(r.effacer ?? {}).reduce((n, l) => n + l.length, 0),
    championnats: r.ligues?.effacer?.length ?? 0,
    jusqua: r.jusqua,
    controle: r.controle,
    bilanDuCalcul: r.bilan,
    rangementMs: Math.round(performance.now() - tRangement),
    dureeMs: Math.round(performance.now() - debut),
    ...pauses.bilan()
  };
}
