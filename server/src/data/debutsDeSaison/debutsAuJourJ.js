/**
 * debutsAuJourJ.js — LA PASSE CHRONOLOGIQUE des débuts de saison (étape 35 du plan, lot 1a, 09/11/2026 ; conception §3).
 * -----------------------------------------------------------------------
 * Pur : ni base, ni fichier, ni horloge, ni hasard. UN SEUL accumulateur tient tout ce que lit l'étape au jour J : les forces
 * de la candidate de l'étape 27 (AccumulateurDesForces, le bras A et les moyennes de ligue, à l'octet), l'état scindé de
 * chaque club (« cette saison » / « avant »), son championnat, sa saison, son rang, son statut, son championnat de la saison
 * d'avant, ses minutes par joueur (cette saison et les précédentes), le faux point (contrôle « fausse rentrée ») et ses
 * sommes. Tout fait du jour J est publié en FIN DE JOURNÉE (le patron d'AccumulateurDesForces) : un match ne voit jamais son
 * jour, ni un autre match du même jour ; une journée dans le désordre, ou une lecture d'un jour déjà publié, LÈVE.
 * Usage : pour chaque journée, `lireLeClub(club, rencontre)` (ce que lit le banc, AVANT le jour), puis `ajouter(rencontre)`
 * pour chaque rencontre du jour, puis `finDeJournee()`.
 *
 * Une RENCONTRE : { cle, date (AAAA-MM-JJ), league, saison (nombre : la saison du championnat du match ; à football-data, le
 * libellé du fichier en nombre), home, away (numéros des clubs), attribue, prolongation, compte, coupe (0/1 ou booléens),
 * aScore90, buts90 ({ dom, ext } | null), faitDom (la ligne du camp qui reçoit, pour les forces ; null sans résultat),
 * joueurs ([{ joueur, club, minutes, poste }] | null) }.
 * Sert au banc (avec ou sans résultat), à la nuit (lot 1b), à la preuve (1c) et au contrôle anti-fuite.
 * -----------------------------------------------------------------------
 */

import { AccumulateurDesForces } from '../db/forcesButs.js';
import { faitsDeLaRencontre, matchPourLesForces } from '../../core/engine/goalModel.js';
import { BASE_STATISTIQUE, EMPREINTE_DE_LA_BASE, NIVEAUX, NIVEAUX_FD } from './reglagesDebuts.js';
import {
  jouerUnMatchScinde, estUneTreve, estUneRemise, saisonDuClub, statutDuClub, ligueLaPlusJouee, fauxPointDe, saisonCivile,
  tirageFauxPromu, clubValide, etatScindeVide, incrementDuMatch, vieillir
} from './formulesDebuts.js';

const vrai = (v) => v === true || v === 1;
/** Un match de CHAMPIONNAT qui compte (le rang, les statuts, les ensembles) : ni coupe, compté au classement, non attribué. */
export const estDeChampionnat = (r) => !vrai(r.coupe) && vrai(r.compte) && !vrai(r.attribue);

export class DebutsAuJourJ {
  /**
   * `avecForces` : tenir les forces (le banc avec résultats, la nuit) — sans elles (les comptes), aucun score n'est lu ;
   * `fd` : football-data (saisons = libellés, divisions NIVEAUX_FD, pas de faux point de septembre) ; `avecMinutes` : tenir
   * les minutes des joueurs (le magasin) ; `r` : la base statistique.
   */
  constructor({ avecForces = true, fd = false, niveaux = null, avecMinutes = !fd, r = BASE_STATISTIQUE } = {}) {
    this.avecForces = avecForces;
    this.fd = fd;
    this.niveaux = niveaux ?? (fd ? NIVEAUX_FD : NIVEAUX);
    this.avecMinutes = avecMinutes;
    this.r = r;
    this.acc = avecForces ? new AccumulateurDesForces({ empreintes: [EMPREINTE_DE_LA_BASE] }) : null;
    this.clubs = new Map();
    this.ligues = new Map();
    this.joueurs = new Map();
    this.jour = null;
    this.dernierJour = null;
    this.attente = [];
    this.rencontres = 0;
  }

  /** L'état d'un club (créé au besoin). */
  etatDuClub(club) {
    let c = this.clubs.get(club);
    if (!c) {
      c = { e: etatScindeVide(), champ: new Map(), statuts: new Map(), faux: null, fauxFini: new Set(), minutes: new Map(), debuts: new Map() };
      this.clubs.set(club, c);
    }
    return c;
  }

  /** Les moyennes du championnat `league` avant le jour `jour` (celles de la candidate) ; null sans forces. */
  moyennes(league, jour, saison) {
    return this.acc ? this.acc.moyennes(league, jour, saison) : null;
  }

  /** L'état publié de la candidate pour un club (AccumulateurDesForces), ou null. */
  etatCandidate(club) {
    return this.acc ? this.acc.etat(EMPREINTE_DE_LA_BASE, club) : null;
  }

  /** Le championnat de la saison d'avant d'un club (le plus de matchs de championnat ; égalité : le plus récent). */
  ligueAvant(club, saison) {
    return ligueLaPlusJouee(this.clubs.get(club)?.champ.get(saison - 1));
  }

  /** Le statut d'un club pour sa saison `saison` dans `league` (fixé à son premier match de championnat, sinon calculé tel quel). */
  statutDe(club, league, saison) {
    const fixe = this.clubs.get(club)?.statuts.get(saison);
    if (fixe) return fixe;
    const ligueAvant = this.ligueAvant(club, saison);
    const ligueAvaitDesMatchs = Boolean(this.ligues.get(league)?.has(saison - 1));
    return { statut: statutDuClub({ ligue: league, ligueAvant, ligueAvaitDesMatchs }, this.niveaux), ligue: league, ligueAvant };
  }

  /** Les minutes publiées d'un club pour une saison : { joueurs: Map joueur → minutes, matchs (avec feuille) } ou null. */
  minutesDuClub(club, saison) {
    return this.clubs.get(club)?.minutes.get(saison) ?? null;
  }

  /** Le premier jour de la saison d'un club (sa trêve, ou son premier match), ou null. */
  debutDeSaison(club, saison) {
    return this.clubs.get(club)?.debuts.get(saison) ?? null;
  }

  /**
   * Le premier match d'un joueur pour un AUTRE club que `club` depuis le jour `depuis` (compris) : { club, date } ou null —
   * « parti, vu jouer ailleurs » (jamais « parti » sans lui).
   */
  vuAilleurs(joueur, club, depuis) {
    for (const p of this.joueurs.get(joueur) ?? []) if (p.club !== club && p.date >= depuis) return { club: p.club, date: p.date };
    return null;
  }

  /**
   * CE QUE LE BANC LIT d'un club pour une rencontre du jour J, AVANT le jour (conception §2-§3) : sa saison pour ce match,
   * la trêve et la remise à zéro du jour (appliquées à la lecture seulement), son rang (matchs de championnat comptés de la
   * même compétition et de la même saison avant J, + 1 ; null hors championnat), son statut (fixé à son premier match de
   * championnat de la saison), son championnat de la saison d'avant, le tirage de son faux promu, son faux point (rang
   * depuis le faux point, sommes depuis), et, avec les forces, ses sommes : `tot` (la candidate, à l'octet), `sai` (la
   * saison en cours, trêve appliquée), n, nx. Lève si le jour est déjà publié (fuite).
   */
  lireLeClub(club, rencontre) {
    const J = String(rencontre.date).slice(0, 10);
    if (this.dernierJour !== null && J <= this.dernierJour) throw new Error(`débuts de saison : lecture du ${J} après la publication du ${this.dernierJour} — fuite refusée`);
    if (!clubValide(club)) return { club, valide: false };
    const st = this.clubs.get(club) ?? null;
    const e = st?.e ?? null;
    const championnat = !vrai(rencontre.coupe);
    const deChampionnat = estDeChampionnat(rencontre);
    const s = saisonDuClub(rencontre, e?.ligue ?? null, { fd: this.fd });
    const treve = e ? estUneTreve(e, s) : false;
    const remise = e ? estUneRemise(e, championnat ? rencontre.league : null, this.r) : false;
    const out = { club, valide: true, saison: s, treve, remise, rang: null, statut: null, ligueAvant: null, tirageFauxPromu: null, faux: null, sommes: null };
    if (deChampionnat) {
      out.rang = 1 + (st?.champ.get(s)?.get(rencontre.league)?.n ?? 0);
      const sd = this.statutDe(club, rencontre.league, s);
      out.statut = sd.statut;
      out.ligueAvant = sd.ligueAvant;
      if (sd.statut === 'debut') out.tirageFauxPromu = tirageFauxPromu(club, s);
      // le faux point (contrôle « fausse rentrée ») : actif depuis son premier match de championnat à son jour ou après
      // (une remise à zéro du jour l'abandonne : le club n'est plus concerné)
      if (!remise && !st?.fauxFini.has(s)) {
        if (st?.faux && st.faux.saison === s) out.faux = { rang: st.faux.rang + 1, dep: Float64Array.from(st.faux.dep) };
        else if (J >= fauxPointDe(club, s, saisonCivile(rencontre.league, { fd: this.fd }))) out.faux = { rang: 1, dep: new Float64Array(8) };
      }
    }
    if (this.avecForces) {
      const c = this.etatCandidate(club);
      const tot = new Float64Array(8);
      const sai = new Float64Array(8);
      if (c) {
        tot[0] = c.sa;
        tot[1] = c.wa;
        tot[2] = c.sd;
        tot[3] = c.wd;
        tot[4] = c.sga;
        tot[5] = c.wga;
        tot[6] = c.sgd;
        tot[7] = c.wgd;
      }
      if (e && !treve) for (let k = 0; k < 8; k++) sai[k] = e.saison[k];
      out.sommes = { tot, sai, n: c?.n ?? 0, nx: c?.nx ?? 0 };
    }
    return out;
  }

  /** Une rencontre du jour (appliquée en fin de journée). */
  ajouter(rencontre) {
    const J = String(rencontre.date).slice(0, 10);
    if (this.jour !== null && J !== this.jour) throw new Error(`débuts de saison : la rencontre du ${J} arrive avant la fin de la journée du ${this.jour}.`);
    if (this.dernierJour !== null && J <= this.dernierJour) throw new Error(`débuts de saison : la journée du ${J} arrive après celle du ${this.dernierJour} — les journées s'ajoutent dans l'ordre.`);
    this.jour = J;
    this.attente.push(rencontre);
  }

  /** La fin de la journée : les forces, l'état scindé, les rangs, les statuts, le faux point et les minutes avancent. */
  finDeJournee() {
    if (this.jour === null) return;
    const J = this.jour;
    const maj = [];
    const saisons = new Map();
    for (const r of this.attente) {
      if (vrai(r.attribue)) continue;
      const L = this.acc ? this.acc.moyennes(r.league, J, r.saison) : null;
      const faits = this.acc && r.faitDom ? faitsDeLaRencontre(r.faitDom) : null;
      if (faits) this.acc.ajouter(faits.dom, faits.ext);
      for (const [club, fait] of [[r.home, faits?.dom ?? null], [r.away, faits?.ext ?? null]]) {
        if (!clubValide(club)) continue;
        // la saison du club pour ce match : lue sur l'état de la VEILLE (son championnat d'avant le jour)
        const s = saisonDuClub(r, this.clubs.get(club)?.e.ligue ?? null, { fd: this.fd });
        saisons.set(`${r.cle}|${club}`, s);
        maj.push({ r, club, s, m: fait && L ? matchPourLesForces(fait, L) : null });
      }
    }
    for (const { r, club, s, m } of maj) this.jouerLeClub(club, r, m, J, s);
    if (this.avecMinutes) for (const r of this.attente) if (!vrai(r.attribue)) this.ajouterLesMinutes(r, J, saisons);
    if (this.acc) this.acc.finDeJournee();
    this.rencontres += this.attente.length;
    this.attente = [];
    this.dernierJour = J;
    this.jour = null;
  }

  /** Le match d'un club appliqué à son état (fin de journée). `m` : la forme de jouerUnMatch, ou null sans résultat. */
  jouerLeClub(club, r, m, J, s) {
    const st = this.etatDuClub(club);
    const championnat = !vrai(r.coupe);
    const deChampionnat = estDeChampionnat(r);
    const treve = estUneTreve(st.e, s);
    const remise = estUneRemise(st.e, championnat ? r.league : null, this.r);
    if (treve || st.e.derniereSaison === null) {
      if (!st.debuts.has(s)) st.debuts.set(s, J);
      st.faux = null;
    }
    if (remise && st.faux) {
      // un changement de championnat après le faux point l'abandonne pour la saison (le club n'est plus concerné)
      st.fauxFini.add(st.faux.saison);
      st.faux = null;
    }
    if (deChampionnat && !st.statuts.has(s)) st.statuts.set(s, this.statutDe(club, r.league, s));
    // le faux point : activé à son premier match de championnat à son jour ou après (rien avant : sommes à zéro)
    if (deChampionnat && !st.fauxFini.has(s) && !(st.faux && st.faux.saison === s) && J >= fauxPointDe(club, s, saisonCivile(r.league, { fd: this.fd }))) {
      st.faux = { saison: s, rang: 0, dep: new Float64Array(8) };
    }
    if (m) {
      st.e = jouerUnMatchScinde(st.e, m, this.r, { saisonDuMatch: s });
      if (st.faux && st.faux.saison === s) {
        vieillir(st.faux.dep, this.r);
        const { ajout } = incrementDuMatch(m);
        for (let k = 0; k < 8; k++) st.faux.dep[k] += ajout[k];
      }
    } else {
      // sans résultat (les comptes) : seuls le championnat et la saison avancent
      if (championnat) st.e.ligue = r.league;
      st.e.derniereSaison = st.e.derniereSaison === null ? s : Math.max(st.e.derniereSaison, s);
    }
    if (deChampionnat) {
      if (st.faux && st.faux.saison === s) st.faux.rang += 1;
      let parLigue = st.champ.get(s);
      if (!parLigue) st.champ.set(s, (parLigue = new Map()));
      const v = parLigue.get(r.league) ?? { n: 0, dernier: '' };
      v.n += 1;
      v.dernier = J;
      parLigue.set(r.league, v);
      let saisons = this.ligues.get(r.league);
      if (!saisons) this.ligues.set(r.league, (saisons = new Set()));
      saisons.add(s);
    }
  }

  /** Les minutes d'une rencontre (joueurs valables, minutes > 0), rangées par club et par saison du club ; l'historique des clubs de chaque joueur. */
  ajouterLesMinutes(r, J, saisons) {
    if (!Array.isArray(r.joueurs)) return;
    const clubsAvecFeuille = new Set();
    for (const l of r.joueurs) {
      const m = Number(l.minutes);
      if (!(m > 0) || !Number.isSafeInteger(l.joueur) || l.joueur < 1 || !clubValide(l.club)) continue;
      if (l.club !== r.home && l.club !== r.away) continue;
      const st = this.etatDuClub(l.club);
      const s = saisons.get(`${r.cle}|${l.club}`);
      if (s === undefined) continue;
      let ms = st.minutes.get(s);
      if (!ms) st.minutes.set(s, (ms = { joueurs: new Map(), matchs: 0 }));
      ms.joueurs.set(l.joueur, (ms.joueurs.get(l.joueur) ?? 0) + m);
      if (!clubsAvecFeuille.has(l.club)) {
        clubsAvecFeuille.add(l.club);
        ms.matchs += 1;
      }
      let h = this.joueurs.get(l.joueur);
      if (!h) this.joueurs.set(l.joueur, (h = []));
      if (!h.length || h.at(-1).club !== l.club) h.push({ club: l.club, date: J });
    }
  }
}

/**
 * Le DÉLÉGUÉ d'une journée : appelle `avant(jour, duJour)` AVANT de publier la journée (toutes ses rencontres lues sur l'état
 * de la veille), puis ajoute ses rencontres et publie. `rencontres` : itérable dans l'ordre (jour, clé). Générateur (rend la
 * main toutes les `pas` journées).
 */
export function* passerLesRencontres(debuts, rencontres, { avant = null, apres = null, pas = 25 } = {}) {
  let jour = null;
  let duJour = [];
  let journees = 0;
  const publier = () => {
    if (!duJour.length) return;
    if (avant) avant(jour, duJour);
    for (const r of duJour) debuts.ajouter(r);
    debuts.finDeJournee();
    if (apres) apres(jour, duJour);
    duJour = [];
  };
  for (const r of rencontres) {
    const d = String(r.date).slice(0, 10);
    if (jour !== null && d < jour) throw new Error(`débuts de saison : rencontres dans le désordre (${d} après ${jour})`);
    if (jour !== null && d !== jour) {
      publier();
      if (++journees % pas === 0) yield journees;
    }
    jour = d;
    duJour.push(r);
  }
  publier();
  return journees;
}

