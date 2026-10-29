/**
 * contexteAuJourJ.js — LA PASSE CHRONOLOGIQUE ET LA FICHE DE CONTEXTE (étape 32 du plan, lot 1a, 29/10/2026).
 * -----------------------------------------------------------------------
 * Pur : ni base, ni fichier, ni horloge, ni hasard (les stades de venues.json et l'instant du calcul sont donnés par
 * l'appelant). UNE seule chaîne de calcul pour la nuit (partie C1), le banc (partie B) et la preuve après lancement :
 *   - `ContexteAuJourJ` accumule, journée après journée, ce que la fiche lit — pour chaque club son dernier match JOUÉ
 *     (coup d'envoi, compétition, prolongation) et la suite de ses entraîneurs (identifiant FotMob ou nom exact), et les
 *     arbitres (refereeRead.ArbitresAuJourJ). LA RÈGLE DU JOUR J (dayTable.js) : un fait du jour J est publié en FIN de
 *     journée (`finDeJournee`) ; une fiche du jour J ne lit que des jours strictement antérieurs — `fiche` LÈVE sinon ;
 *   - `fiche({ rencontre, prochains, prevus, calculeLe })` : la fiche d'UN match au jour J — repos, enchaînement,
 *     déplacement, altitude, pelouse, entraîneur, et l'arbitre quand il est connu (un match passé : son nom est publié
 *     avant le coup d'envoi) ;
 *   - `passerLesRencontres` : la passe elle-même (générateur : un point d'arrêt toutes les `pas` rencontres), avec un
 *     crochet `avantLaJournee(jour, rencontres)` appelé quand l'état ne contient QUE les jours d'avant ;
 *   - `indexDesProchains` : le prochain match JOUÉ de chaque club (le banc seulement : c'est le « calendrier connu après
 *     coup », la petite fuite déclarée de l'enchaînement — la seule exemption de l'oracle de la copie tronquée).
 * Les formules sont dans formulesDuContexte.js (sans import hors constantes, pour le lot 2).
 * -----------------------------------------------------------------------
 */

import { VERSION_CONTEXTE, SEUILS, COUPES_CONTINENTALES, MOIS_DES_CHAMPIONNATS_D_ETAT } from './reglagesContexte.js';
import {
  numeroDuClub,
  cleDuStade,
  texteStable,
  jourDe,
  coupDEnvoiConnu,
  heuresEntre,
  classeDeRepos,
  joursDeRepos,
  estSerre,
  distanceKm,
  lnDistance,
  memeStade,
  altitudeDuMatch,
  pelouseDe,
  entraineurAuJourJ
} from './formulesDuContexte.js';
import { ArbitresAuJourJ, cleDeLArbitre, indicesDeLArbitre } from '../db/refereeRead.js';
import { isCup } from '../providers/leagueCups.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const deux = (x) => (fini(x) ? Math.round(x * 100) / 100 : null);
const continentale = (league) => COUPES_CONTINENTALES.includes(league);
/** Une valeur par club, dans un objet ou une Map. */
const duClub = (x, club) => (x instanceof Map ? x.get(club) : x?.[club]) ?? null;
const ordreDesMatchs = (a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : String(a.kickoff ?? '') < String(b.kickoff ?? '') ? -1 : String(a.kickoff ?? '') > String(b.kickoff ?? '') ? 1 : 0);

/** Le match d'un club tel que la fiche le garde (précédent ou prochain). */
function matchDit(m, extra = {}) {
  if (!m) return null;
  return {
    date: m.date,
    kickoff: coupDEnvoiConnu(m) ? m.kickoff : null,
    kickoffConnu: coupDEnvoiConnu(m),
    league: m.league ?? null,
    coupe: m.coupe === undefined ? (m.league ? isCup(m.league) : false) : Boolean(m.coupe),
    continentale: continentale(m.league),
    ...extra
  };
}

export class ContexteAuJourJ {
  /** `venues` : le contenu de venues.json (ou { clubs }) ; null : déplacement, altitude et pelouse habituelle inconnus. */
  constructor({ venues = null, seuils = SEUILS } = {}) {
    this.seuils = seuils;
    this.clubs = new Map();
    this.arbitres = new ArbitresAuJourJ({ seuils });
    this.stades = venues?.clubs ?? null;
    this.jour = null;
    this.jourEnAttente = null;
    this.enAttente = [];
  }

  /**
   * Un match JOUÉ de la journée en attente. `r` : { matchKey, date, league, coupe, home, away (numéros FotMob), attribue,
   * prolongation, kickoff, stade, surface, arbitre: { nom, pays } | null, cartons, penalties, buts90, moyenneButsLigue,
   * entraineurs: { home: { nom, id } | null, away } }. Lève si sa journée est déjà publiée (fuite ou désordre).
   */
  ajouter(r) {
    const jour = jourDe(r?.date);
    if (!jour) throw new Error(`ContexteAuJourJ.ajouter : jour illisible (« ${r?.date ?? ''} »)`);
    if (this.jour !== null && !(jour > this.jour)) throw new Error(`ContexteAuJourJ.ajouter : un match du ${jour} arrive après la publication du ${this.jour} — fuite ou désordre refusés`);
    if (this.jourEnAttente !== null && jour !== this.jourEnAttente) throw new Error(`ContexteAuJourJ.ajouter : la journée du ${this.jourEnAttente} n'est pas publiée (finDeJournee) avant le ${jour}`);
    this.jourEnAttente = jour;
    this.enAttente.push(r);
    this.arbitres.ajouter(r);
  }

  /** Publie la journée en attente : ses matchs comptent désormais pour les jours suivants. */
  finDeJournee() {
    if (this.jourEnAttente === null) return;
    for (const r of this.enAttente) {
      // Un match attribué n'a pas été joué : il ne coupe pas un repos et n'a pas d'entraîneur.
      if (r.attribue) continue;
      for (const camp of ['home', 'away']) {
        const club = numeroDuClub(r[camp]);
        if (club === null) continue;
        let c = this.clubs.get(club);
        if (!c) {
          c = { dernier: null, entraineurs: [] };
          this.clubs.set(club, c);
        }
        const m = { matchKey: r.matchKey ?? null, date: r.date, kickoff: r.kickoff ?? null, kickoffConnu: coupDEnvoiConnu(r), league: r.league ?? null, coupe: Boolean(r.coupe), prolongation: Boolean(r.prolongation) };
        if (!c.dernier || ordreDesMatchs(c.dernier, m) <= 0) c.dernier = m;
        const e = r.entraineurs?.[camp];
        const nom = texteStable(e?.nom);
        const id = Number.isSafeInteger(e?.id) && e.id > 0 ? e.id : null;
        if (nom || id) c.entraineurs.push({ date: r.date, nom, id });
      }
    }
    this.arbitres.finDeJournee();
    this.jour = this.jourEnAttente;
    this.jourEnAttente = null;
    this.enAttente = [];
  }

  /** L'état d'un club (une copie) : { dernier, entraineurs } ou null. */
  etatDuClub(id) {
    const c = this.clubs.get(numeroDuClub(id));
    return c ? { dernier: c.dernier ? { ...c.dernier } : null, entraineurs: c.entraineurs.map((e) => ({ ...e })) } : null;
  }

  /** Le stade habituel d'un club dans venues.json, ou null. */
  stadeDe(id) {
    const cle = cleDuStade(id);
    return cle && this.stades ? this.stades[cle] ?? null : null;
  }

  /** La garde du jour J : l'état ne contient que des jours strictement antérieurs, rien en attente du jour J ou d'après. */
  verifierAvant(J) {
    if (this.jour !== null && !(this.jour < J)) throw new Error(`fiche du ${J} : l'état contient déjà le ${this.jour} — fuite refusée`);
    if (this.jourEnAttente !== null && !(this.jourEnAttente < J)) throw new Error(`fiche du ${J} : des matchs du ${this.jourEnAttente} sont en attente — fuite refusée`);
  }

  /**
   * Le repos d'un club au jour J. `plusRecent` (la nuit seulement) : un match d'avant J plus récent que le dernier versé
   * dans la passe — un match prévu au calendrier (« si le match du … se joue comme prévu »), joué mais pas encore au
   * magasin, ou joué au magasin depuis le début du jour de la nuit — { date, kickoff, kickoffConnu, league, prolongation,
   * prevu, source } ; il est alors le précédent. Rend { heures, jours, classe, heureInconnue, precedent, mentions }.
   */
  repos(club, rencontre, plusRecent = null) {
    const dernier = this.clubs.get(club)?.dernier ?? null;
    let precedent = dernier ? matchDit(dernier, { prolongation: dernier.prolongation, prevu: false, source: 'magasin' }) : null;
    if (plusRecent && plusRecent.date < rencontre.date && (!dernier || plusRecent.date > dernier.date)) {
      precedent = matchDit(plusRecent, { prolongation: Boolean(plusRecent.prolongation), prevu: Boolean(plusRecent.prevu), source: plusRecent.source ?? 'calendrier' });
    }
    const mentions = [];
    if (!precedent) {
      mentions.push('premier-match');
      return { heures: null, jours: null, classe: 'inconnu', heureInconnue: false, precedent: null, mentions };
    }
    const { heures, heureInconnue } = heuresEntre(precedent, rencontre);
    const classe = classeDeRepos(heures, this.seuils);
    if (classe === 'court') mentions.push('court');
    if (precedent.prolongation) mentions.push('prolongation');
    if (classe === 'long') mentions.push('long-competitions-non-suivies');
    if (this.stadeDe(club)?.pays === 'Brazil' && MOIS_DES_CHAMPIONNATS_D_ETAT.includes(Number(rencontre.date.slice(5, 7)))) mentions.push('bresil-championnats-d-etat');
    if (heureInconnue) mentions.push('heure-inconnue');
    if (precedent.prevu) mentions.push('prevu');
    if (precedent.source === 'calendrier' && !precedent.prevu) mentions.push('joue-pas-encore-au-magasin');
    return { heures: deux(heures), jours: joursDeRepos(heures), classe, heureInconnue, precedent, mentions };
  }

  /**
   * L'enchaînement d'un club : son PROCHAIN match après J (`prochains` : ses matchs triés), en sautant, quand J est une
   * coupe, un match de la MÊME compétition (le tour suivant n'est joué que si l'on passe celui-ci : critique, constat 14).
   */
  enchainement(rencontre, prochains) {
    const coupeJ = rencontre.league ? isCup(rencontre.league) : false;
    const p = (prochains ?? []).find((m) => m.date > rencontre.date && !(coupeJ && m.league === rencontre.league)) ?? null;
    if (!p) return { prochain: null, heures: null, heureInconnue: false, serre: null, mentions: ['aucun-prochain-connu'] };
    const prochain = matchDit(p, { source: p.source ?? null });
    const { heures, heureInconnue } = heuresEntre(rencontre, prochain);
    const serre = estSerre(heures, this.seuils);
    const mentions = [];
    if (serre) mentions.push('serre');
    if (heureInconnue) mentions.push('heure-inconnue');
    return { prochain, heures: deux(heures), heureInconnue, serre, mentions };
  }

  /**
   * LA FICHE D'UN MATCH AU JOUR J. `rencontre` : { date, kickoff, kickoffConnu, league, home, away, stade, surface,
   * arbitre, matchId } — pour un match passé, ce que la page d'avant-match publiait (coup d'envoi, stade, pelouse, nom
   * de l'arbitre) ; pour un match à venir (la nuit), la date et les clubs seulement. `prochains` : { [club]: [matchs
   * triés] } ; `prevus` : { [club]: le match du calendrier d'avant J pas encore au magasin } ; `calculeLe` : l'instant
   * du calcul (texte ISO), donné par l'appelant. Lève si l'état a vu le jour J ou d'après.
   */
  fiche({ rencontre, prochains = {}, prevus = {}, calculeLe = null }) {
    const J = jourDe(rencontre?.date);
    if (!J) throw new Error(`fiche : jour illisible (« ${rencontre?.date ?? ''} »)`);
    this.verifierAvant(J);
    const home = numeroDuClub(rencontre.home);
    const away = numeroDuClub(rencontre.away);
    if (home === null || away === null) throw new Error(`fiche du ${J} : un club sans identifiant FotMob (${rencontre.home ?? '?'} – ${rencontre.away ?? '?'}) — jamais un nom`);
    const r = { ...rencontre, date: J, kickoffConnu: coupDEnvoiConnu(rencontre), kickoff: coupDEnvoiConnu(rencontre) ? rencontre.kickoff : null };
    const stadeHome = this.stadeDe(home);
    const stadeAway = this.stadeDe(away);
    // Déplacement et altitude : entre les stades HABITUELS ; un match joué ailleurs (stade du match ≠ stade habituel) n'est pas compté.
    const stadeDuMatch = texteStable(rencontre.stade);
    const stadeHabituel = stadeDuMatch ? memeStade(stadeDuMatch, stadeHome?.stade) : null;
    const ailleurs = stadeHabituel === false;
    const kmBrut = ailleurs ? null : distanceKm(stadeHome, stadeAway);
    const deplacement = {
      km: fini(kmBrut) ? Math.round(kmBrut) : null,
      kmBrut: fini(kmBrut) ? Math.round(kmBrut * 10) / 10 : null,
      lnKm: fini(kmBrut) ? Number(lnDistance(kmBrut).toFixed(6)) : null,
      stade: stadeDuMatch ?? texteStable(stadeHome?.stade),
      stadeHabituel,
      source: stadeDuMatch ? 'fotmob-match' : 'stade-habituel'
    };
    const altitude = ailleurs
      ? { stade: null, visiteur: null, concerne: null, source: 'stade-inhabituel' }
      : { ...altitudeDuMatch({ stade: stadeHome?.altitude, visiteur: stadeAway?.altitude }, this.seuils), source: 'liste-faite-a-la-main' };
    const surfaceDuMatch = pelouseDe(rencontre.surface);
    const surfaceHabituelle = stadeHome ? (stadeHome.synthetique === true ? 'synthetique' : pelouseDe(stadeHome.pelouse)) : null;
    const pelouse = {
      surface: surfaceDuMatch ?? (ailleurs ? null : surfaceHabituelle),
      source: surfaceDuMatch ? 'fotmob-match' : ailleurs ? null : surfaceHabituelle ? 'stade-habituel' : null,
      visiteurHabitue: typeof stadeAway?.synthetique === 'boolean' ? stadeAway.synthetique : null
    };
    const cle = cleDeLArbitre(rencontre.arbitre);
    let arbitre = null;
    if (cle) {
      const etat = this.arbitres.etat(cle);
      arbitre = { cle, connu: Boolean(etat), etat: etat ? { ...etat } : null, indices: etat ? indicesDeLArbitre(etat) : null };
    }
    return {
      version: VERSION_CONTEXTE,
      calculeLe,
      heureInconnue: !r.kickoffConnu,
      repos: { home: this.repos(home, r, duClub(prevus, home)), away: this.repos(away, r, duClub(prevus, away)) },
      enchainement: { home: this.enchainement(r, duClub(prochains, home)), away: this.enchainement(r, duClub(prochains, away)) },
      deplacement,
      altitude,
      pelouse,
      entraineur: { home: entraineurAuJourJ(this.clubs.get(home)?.entraineurs, this.seuils), away: entraineurAuJourJ(this.clubs.get(away)?.entraineurs, this.seuils) },
      arbitre
    };
  }
}

/**
 * LA PASSE : les rencontres (un itérable trié par date, puis clé) versées dans `contexte` journée par journée.
 * `avantLaJournee(jour, rencontresDuJour)` est appelé AVANT que la journée soit publiée : l'état ne contient alors que
 * les jours d'avant (c'est là que le banc et le contrôle anti-fuite lisent « au jour J »). Générateur : un point
 * d'arrêt toutes les `pas` rencontres. Rend { rencontres, jours, dernierJour }.
 */
export function* passerLesRencontres(contexte, rencontres, { avantLaJournee = null, pas = 2000 } = {}) {
  let jour = null;
  let duJour = [];
  let n = 0;
  let jours = 0;
  const publier = () => {
    if (!duJour.length) return;
    if (avantLaJournee) avantLaJournee(jour, duJour);
    for (const r of duJour) contexte.ajouter(r);
    contexte.finDeJournee();
    jours++;
    duJour = [];
  };
  for (const r of rencontres) {
    const j = jourDe(r?.date);
    if (!j) throw new Error(`passe : jour illisible (« ${r?.date ?? ''} »)`);
    if (jour !== null && j < jour) throw new Error(`passe : les rencontres ne sont pas dans l'ordre (${j} après ${jour})`);
    if (jour !== null && j !== jour) publier();
    jour = j;
    duJour.push(r);
    if (++n % pas === 0) yield 'passe chronologique';
  }
  publier();
  return { rencontres: n, jours, dernierJour: contexte.jour };
}

/**
 * Le PROCHAIN match joué de chaque club (le banc seulement) : Map(club → [matchs triés]) depuis toutes les rencontres
 * jouées (attribuées exclues). C'est le calendrier « connu après coup » : la petite fuite déclarée de l'enchaînement.
 */
export function indexDesProchains(rencontres) {
  const out = new Map();
  for (const r of rencontres) {
    if (r.attribue) continue;
    for (const camp of ['home', 'away']) {
      const club = numeroDuClub(r[camp]);
      if (club === null) continue;
      if (!out.has(club)) out.set(club, []);
      out.get(club).push({ date: r.date, kickoff: coupDEnvoiConnu(r) ? r.kickoff : null, kickoffConnu: coupDEnvoiConnu(r), league: r.league ?? null, coupe: Boolean(r.coupe), source: 'magasin' });
    }
  }
  for (const l of out.values()) l.sort(ordreDesMatchs);
  return out;
}
