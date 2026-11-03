/**
 * joueursAuJourJ.js — LA PASSE CHRONOLOGIQUE DES JOUEURS, AU JOUR J (étape 34 du plan, lot 1a, 03/11/2026).
 * -----------------------------------------------------------------------
 * Pur : ni base, ni fichier, ni horloge, ni hasard ; n'importe que reglagesJoueurs.js et formulesDesJoueurs.js (T-X3).
 * UN SEUL accumulateur pour le banc, la nuit, l'archive et le contrôle anti-fuite. Il tient, au jour J :
 *   - les SOMMES AMORTIES de chaque joueur (numéro FotMob après people_merges) pour les cinq signaux (np, pen, sot, av, xa),
 *     amorties par apparition relevée pour ce signal (X ← δX + x, E ← δE + e, e = total de l'équipe × minutes / 90) ; les
 *     penalties PAR CLUB (remis à zéro au changement de club) ; ses minutes de titulaire, ses entrées, ses présences sur
 *     un banc listé COMPLET (au moins un remplaçant non entré listé : critique, constat 2) ; ses 10 derniers postes ;
 *   - les mêmes sommes pour les FAUX JOUEURS des placebos (emplacement FNV-1a de « clé du match:numéro » mod M du poste) ;
 *   - le REPÈRE GLOBAL de chaque poste (apparitions de titulaire des 90 jours d'avant J, toutes compétitions) et du bloc
 *     des remplaçants entrés (« R ») ; les minutes moyennes d'un titulaire par poste (m0), d'un entrant (r0), la chance
 *     d'entrer d'un remplaçant listé (e0) ;
 *   - le RAPPORT de chaque compétition par poste (critique, constat 8) : x réalisé face à x prévu par le repère global du
 *     jour de chaque apparition, sur les 365 jours d'avant J, rappelé vers 1 par 40 événements attendus ;
 *   - la dernière feuille de chaque club (la règle de derniereFeuille : ses 5 derniers matchs à domicile et ses 5 derniers
 *     à l'extérieur avec un score, la plus récente qui porte au moins 9 titulaires).
 * Tout fait du jour J est publié en FIN DE JOURNÉE (finDeJournee) : les entrées de chaque composition du jour sont prises
 * AVANT la publication (un match ne voit jamais son jour). La feuille du jour J ne prête QUE la composition (titulaires,
 * banc listé, postes, identifiants) : ni minutes, ni statistiques, ni déroulé, ni score. Il refuse le désordre et la fuite.
 * Hors de l'empreinte du moteur (data/joueurs/) ; aucun fichier du moteur ne l'importe.
 * -----------------------------------------------------------------------
 */

import { DEMI_VIES, REPERES, SIGNAUX, POSTE_DOMINANT_SUR, MINUTES_MAX } from './reglagesJoueurs.js';
import { relevesDUnCamp, amortissement, minutesAttendues, chanceDEntrer, posteDominant, fauxJoueur, nombre } from './formulesDesJoueurs.js';

const JOUR_MS = 86_400_000;
const NS = SIGNAUX.length; // np, pen, sot, av, xa
const IDX = Object.freeze(Object.fromEntries(SIGNAUX.map((s, i) => [s, i])));
const R = 5; // l'indice du bloc des remplaçants entrés dans les repères
const jourDe = (x) => {
  const j = String(x ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(j) && Number.isFinite(Date.parse(`${j}T00:00:00Z`)) ? j : null;
};
const moinsJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) - n * JOUR_MS).toISOString().slice(0, 10);
const ordre = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const identifie = (id) => Number.isSafeInteger(id) && id > 0;
const vide5 = () => [0, 0, 0, 0, 0];

/** Une fenêtre glissante de journées : { jours: [{ date, ...valeurs }], s: sommes } ; `retirer(limite)` sort ce qui est avant `limite`. */
class Fenetre {
  constructor(champs) {
    this.champs = champs;
    this.jours = [];
    this.s = Object.fromEntries(champs.map((c) => [c, vide5()]));
  }
  ajouter(date, valeurs) {
    this.jours.push({ date, ...valeurs });
    for (const c of this.champs) for (let i = 0; i < NS; i++) this.s[c][i] += valeurs[c][i];
  }
  retirer(limite) {
    while (this.jours.length && this.jours[0].date < limite) {
      const x = this.jours.shift();
      for (const c of this.champs) for (let i = 0; i < NS; i++) this.s[c][i] -= x[c][i];
    }
  }
}

/**
 * L'ACCUMULATEUR. Une rencontre (lectureDesJoueurs.rencontreNormalisee) : { matchKey, date, league, home, away,
 * attribue, prolongation, joue (score connu), evenements, cartonsReleves, camps: { home: { club, buts, cadresDEquipe,
 * lignes: [{ id, titulaire, poste, minutes, entre, xg, xgnp, shotsOnTarget, assists, xa, rating, touches, passes }] },
 * away } }. `finDeJournee()` rend Map(matchKey → { home, away }) : les entrées de la composition de chaque camp
 * (entreesDUneComposition), prises AVANT la publication de la journée.
 */
export class JoueursAuJourJ {
  constructor({ demiVies = DEMI_VIES, reperes = REPERES } = {}) {
    this.dv = demiVies;
    this.rep = reperes;
    this.delta = Object.fromEntries(Object.entries(demiVies).map(([k, h]) => [k, amortissement(h)]));
    this.joueurs = new Map();
    this.faux = new Map();
    // Repères globaux : postes 1 à 4 et R (5) ; minutes des titulaires par poste et des entrants ; présences sur un banc complet.
    this.global = new Map();
    for (let p = 1; p <= R; p++) this.global.set(p, new Fenetre(['x', 'e']));
    this.minutes = new Map();
    for (let p = 1; p <= R; p++) this.minutes.set(p, { jours: [], s: 0, n: 0 });
    this.banc = { jours: [], presences: 0, entrees: 0 };
    this.ligues = new Map();
    this.feuilles = new Map();
    this.jour = null;
    this.jourEnAttente = null;
    this.enAttente = [];
  }

  ajouter(r) {
    const jour = jourDe(r?.date);
    if (!jour) throw new Error(`JoueursAuJourJ.ajouter : jour illisible (« ${r?.date ?? ''} »)`);
    if (this.jour !== null && !(jour > this.jour)) throw new Error(`JoueursAuJourJ.ajouter : un match du ${jour} arrive après la publication du ${this.jour} — fuite ou désordre refusés`);
    if (this.jourEnAttente !== null && jour !== this.jourEnAttente) throw new Error(`JoueursAuJourJ.ajouter : la journée du ${this.jourEnAttente} n'est pas publiée (finDeJournee) avant le ${jour}`);
    this.jourEnAttente = jour;
    this.enAttente.push(r);
  }

  // ------------------------------------------------------------ les repères au jour J

  /** Le repère global d'un poste au jour `jour` (Σx / Σe des 90 jours d'avant) ; poste 0 = les joueurs de champ (2, 3, 4) ; null sans exposition. */
  repereGlobal(p, jour) {
    const limite = moinsJours(jour, this.rep.jours);
    const postes = p === 0 ? [2, 3, 4] : [p];
    const out = [];
    const x = vide5();
    const e = vide5();
    for (const q of postes) {
      const f = this.global.get(q);
      f.retirer(limite);
      for (let i = 0; i < NS; i++) {
        x[i] += f.s.x[i];
        e[i] += f.s.e[i];
      }
    }
    for (let i = 0; i < NS; i++) out.push(e[i] > 0 ? x[i] / e[i] : null);
    return out;
  }

  /** Le rapport d'une compétition pour un poste au jour `jour` : (Σx + κ) / (Σattendus + κ), 365 jours ; 1 sans rien. */
  rapportDeLaLigue(league, p, jour) {
    const L = this.ligues.get(league);
    const k = this.rep.kappaLigue;
    const postes = p === 0 ? [2, 3, 4] : [p];
    const x = vide5();
    const a = vide5();
    if (L) {
      const limite = moinsJours(jour, this.rep.joursLigue);
      for (const q of postes) {
        const f = L.get(q);
        if (!f) continue;
        f.retirer(limite);
        for (let i = 0; i < NS; i++) {
          x[i] += f.s.x[i];
          a[i] += f.s.att[i];
        }
      }
    }
    return x.map((xi, i) => (xi + k) / (a[i] + k));
  }

  /** Le repère du bras A d'un poste dans une compétition : repère global × rapport de la compétition (null si le global manque). */
  repere(league, p, jour) {
    const g = this.repereGlobal(p, jour);
    const r = this.rapportDeLaLigue(league, p, jour);
    return g.map((gi, i) => (gi === null ? null : gi * r[i]));
  }

  /** Les minutes moyennes d'un titulaire du poste (1 à 4 ; 0 : champ) ou d'un entrant (R) sur 90 jours ; null sans rien. */
  minutesMoyennes(p, jour) {
    const limite = moinsJours(jour, this.rep.jours);
    let s = 0;
    let n = 0;
    for (const q of p === 0 ? [2, 3, 4] : [p]) {
      const M = this.minutes.get(q);
      while (M.jours.length && M.jours[0].date < limite) {
        const x = M.jours.shift();
        M.s -= x.s;
        M.n -= x.n;
      }
      s += M.s;
      n += M.n;
    }
    return n > 0 ? s / n : null;
  }

  /** La chance d'entrer d'un remplaçant listé (banc complet) sur 90 jours ; null sans rien. */
  chanceDEntrerMoyenne(jour) {
    const limite = moinsJours(jour, this.rep.jours);
    const B = this.banc;
    while (B.jours.length && B.jours[0].date < limite) {
      const x = B.jours.shift();
      B.presences -= x.presences;
      B.entrees -= x.entrees;
    }
    return B.presences > 0 ? B.entrees / B.presences : null;
  }

  // ------------------------------------------------------------ un joueur, une composition

  /** L'état d'un joueur (ou null s'il n'a aucune apparition publiée). Copie : jamais l'objet interne. */
  etatDuJoueur(id) {
    const j = this.joueurs.get(id);
    if (!j) return null;
    return { id, club: j.club, derniere: j.derniere, apparitions: j.n, X: [...j.X], E: [...j.E], penClub: j.penClub, tit: [...j.tit], entre: [...j.entre], banc: [...j.banc], postes: [...j.postes] };
  }

  /** Le poste retenu d'un joueur de la composition : celui de la ligne, sinon son poste dominant, sinon 0. */
  posteRetenu(id, poste) {
    if (poste) return poste;
    const j = identifie(id) ? this.joueurs.get(id) : null;
    return j ? posteDominant(j.postes) : 0;
  }

  /**
   * LES ENTRÉES D'UNE COMPOSITION au jour `jour` (l'état d'AVANT la journée) : `cle` (la clé du match, pour les faux
   * joueurs), `league`, `club`, `joueurs` : [{ id, poste, titulaire }]. Rend { titulaires: [{ id, poste, m, X, E, fX, fE,
   * repere, apparitions }], remplacants: [{ id, poste, pEntre, mEntre, X, E }], bloc: { repere, minutes }, m0, r0, e0 }.
   * Un joueur sans identifiant, ou sans aucune apparition, a des sommes nulles (sa part sera le repère de son poste).
   * Les sommes des signaux sont des COPIES. Pur ; ne publie rien.
   */
  entreesDUneComposition({ cle, league, club, joueurs, jour }) {
    const j0 = jourDe(jour);
    if (!j0) throw new Error('entreesDUneComposition : jour illisible');
    if (this.jour !== null && !(this.jour < j0)) throw new Error(`entreesDUneComposition : l’état contient le ${this.jour}, pas d’avant le ${j0}`);
    const repR = this.repere(league, R, j0);
    const r0 = this.minutesMoyennes(R, j0);
    const e0 = this.chanceDEntrerMoyenne(j0);
    const m0Par = new Map();
    const m0 = (p) => {
      if (!m0Par.has(p)) m0Par.set(p, this.minutesMoyennes(p, j0));
      return m0Par.get(p);
    };
    const repPar = new Map();
    const rep = (p) => {
      if (!repPar.has(p)) repPar.set(p, this.repere(league, p, j0));
      return repPar.get(p);
    };
    const titulaires = [];
    const remplacants = [];
    for (const x of joueurs ?? []) {
      const id = identifie(x.id) ? x.id : null;
      const poste = this.posteRetenu(id, x.poste);
      const etat = id ? this.joueurs.get(id) : null;
      const X = etat ? [...etat.X] : vide5();
      const E = etat ? [...etat.E] : vide5();
      // Les penalties : par club — un joueur qui a changé de club repart de zéro.
      if (etat && etat.penClub !== club) {
        X[IDX.pen] = 0;
        E[IDX.pen] = 0;
      }
      if (x.titulaire) {
        const f = id ? this.faux.get(fauxJoueur(cle, id, poste)) : null;
        titulaires.push({
          id,
          poste,
          m: minutesAttendues(etat?.tit[0], etat?.tit[1], m0(poste) ?? m0(0)),
          X,
          E,
          fX: f ? [...f.X] : vide5(),
          fE: f ? [...f.E] : vide5(),
          repere: rep(poste),
          apparitions: etat?.n ?? 0
        });
      } else {
        remplacants.push({ id, poste, pEntre: chanceDEntrer(etat?.banc[1], etat?.banc[0], e0), mEntre: minutesAttendues(etat?.entre[0], etat?.entre[1], r0), X, E, apparitions: etat?.n ?? 0 });
      }
    }
    return { titulaires, remplacants, bloc: { repere: repR }, r0, e0 };
  }

  /** La dernière feuille d'un club d'avant le jour en cours (la règle de derniereFeuille) : { cle, date, cote, titulaires: [id…] } ou null. */
  derniereFeuille(club) {
    const f = this.feuilles.get(club);
    if (!f) return null;
    const candidates = [...f.dom, ...f.ext].sort((a, b) => ordre(b.date, a.date));
    for (const c of candidates) if (c.titulaires >= 9) return { cle: c.cle, date: c.date, cote: c.cote, onze: [...c.onze] };
    return null;
  }

  // ------------------------------------------------------------ la publication

  /** Publie la journée en attente ; rend Map(matchKey → { home, away }) des entrées des compositions (AVANT la publication). */
  finDeJournee() {
    const out = new Map();
    if (this.jourEnAttente === null) return out;
    const jour = this.jourEnAttente;
    // 1. Les entrées des compositions du jour : l'état d'AVANT la journée ; la feuille ne prête que la composition.
    for (const r of this.enAttente) {
      const camps = {};
      for (const camp of ['home', 'away']) {
        const c = r.camps?.[camp];
        if (!c) continue;
        camps[camp] = this.entreesDUneComposition({ cle: r.matchKey, league: r.league, club: c.club, joueurs: (c.lignes ?? []).map((l) => ({ id: l.id, poste: l.poste, titulaire: l.titulaire })), jour });
      }
      out.set(r.matchKey, camps);
    }
    // 2. La journée publiée.
    const global = new Map();
    const minutes = new Map();
    const banc = { presences: 0, entrees: 0 };
    const ligues = new Map();
    const repDuJour = new Map();
    const repJour = (p) => {
      if (!repDuJour.has(p)) repDuJour.set(p, this.repereGlobal(p, jour));
      return repDuJour.get(p);
    };
    const ajouterA = (m, cle, champs) => {
      let v = m.get(cle);
      if (!v) {
        v = Object.fromEntries(champs.map((c) => [c, vide5()]));
        m.set(cle, v);
      }
      return v;
    };
    for (const r of this.enAttente) {
      // Les feuilles (toute rencontre avec un score, comme derniereFeuille).
      if (r.joue) {
        for (const camp of ['home', 'away']) {
          const c = r.camps?.[camp];
          if (!c || !identifie(c.club)) continue;
          const onze = (c.lignes ?? []).filter((l) => l.titulaire);
          let f = this.feuilles.get(c.club);
          if (!f) {
            f = { dom: [], ext: [] };
            this.feuilles.set(c.club, f);
          }
          const liste = camp === 'home' ? f.dom : f.ext;
          liste.push({ cle: r.matchKey, date: jour, cote: camp, titulaires: onze.length, onze: onze.map((l) => (identifie(l.id) ? l.id : null)) });
          if (liste.length > 5) liste.shift();
        }
      }
      if (!r.joue || r.attribue || r.prolongation) continue;
      for (const camp of ['home', 'away']) {
        const c = r.camps?.[camp];
        if (!c) continue;
        const rel = relevesDUnCamp({ lignes: c.lignes ?? [], evenements: r.evenements ?? [], camp, butsDuCamp: c.buts, cadresDEquipe: c.cadresDEquipe, cartonsReleves: r.cartonsReleves, inconnuSiAbsent: Boolean(r.inconnuSiAbsent) });
        const T = SIGNAUX.map((s) => rel.totaux[s]);
        const banCComplet = (c.lignes ?? []).some((l) => !l.titulaire && !(nombre(l.minutes) > 0));
        for (const l of c.lignes ?? []) {
          const id = identifie(l.id) ? l.id : null;
          const min = nombre(l.minutes);
          const joue = min !== null && min > 0;
          // Le banc listé (camps à banc complet seulement : critique, constat 2).
          if (!l.titulaire && banCComplet && id) {
            const etat = this.leJoueur(id, c.club);
            etat.banc[0] = this.delta.banc * etat.banc[0] + 1;
            etat.banc[1] = this.delta.banc * etat.banc[1] + (joue ? 1 : 0);
            banc.presences += 1;
            banc.entrees += joue ? 1 : 0;
          }
          if (!joue || !id) continue;
          const pj = rel.parJoueur.get(id);
          const m = Math.min(MINUTES_MAX, min);
          const poste = this.posteRetenu(id, l.poste);
          const p = l.titulaire ? poste : R;
          const etat = this.leJoueur(id, c.club);
          // Les penalties par club : remise à zéro au changement de club.
          if (etat.penClub !== c.club) {
            etat.X[IDX.pen] = 0;
            etat.E[IDX.pen] = 0;
            etat.penClub = c.club;
          }
          const f = this.leFaux(fauxJoueur(r.matchKey, id, poste));
          const g = p === 0 ? null : ajouterA(global, p, ['x', 'e']);
          const lgPoste = p === 0 ? null : p;
          const repG = lgPoste ? repJour(lgPoste) : null;
          let parPoste = ligues.get(r.league);
          if (!parPoste) {
            parPoste = new Map();
            ligues.set(r.league, parPoste);
          }
          const lg = lgPoste ? ajouterA(parPoste, lgPoste, ['x', 'att']) : null;
          for (let i = 0; i < NS; i++) {
            const t = T[i];
            const x = pj.x[SIGNAUX[i]];
            if (t === null || x === null) continue;
            const e = (t * m) / MINUTES_MAX;
            const d = this.delta[SIGNAUX[i]];
            etat.X[i] = d * etat.X[i] + x;
            etat.E[i] = d * etat.E[i] + e;
            f.X[i] = d * f.X[i] + x;
            f.E[i] = d * f.E[i] + e;
            if (lgPoste) {
              g.x[i] += x;
              g.e[i] += e;
              if (repG[i] !== null) {
                lg.x[i] += x;
                lg.att[i] += repG[i] * e;
              }
            }
          }
          f.n += 1;
          // Les minutes : de titulaire (par poste) ou d'entrant.
          if (l.titulaire) {
            etat.tit[0] = this.delta.minutes * etat.tit[0] + m;
            etat.tit[1] = this.delta.minutes * etat.tit[1] + 1;
          } else {
            etat.entre[0] = this.delta.entree * etat.entre[0] + m;
            etat.entre[1] = this.delta.entree * etat.entre[1] + 1;
          }
          if (lgPoste) {
            const mm = minutes.get(p) ?? { s: 0, n: 0 };
            mm.s += m;
            mm.n += 1;
            minutes.set(p, mm);
          }
          if (l.poste) {
            etat.postes.push(l.poste);
            if (etat.postes.length > POSTE_DOMINANT_SUR) etat.postes.shift();
          }
          etat.n += 1;
          etat.derniere = jour;
          etat.club = c.club;
        }
      }
    }
    for (const [p, v] of global) this.global.get(p).ajouter(jour, v);
    for (const [p, v] of minutes) {
      const M = this.minutes.get(p);
      M.jours.push({ date: jour, s: v.s, n: v.n });
      M.s += v.s;
      M.n += v.n;
    }
    if (banc.presences) {
      this.banc.jours.push({ date: jour, ...banc });
      this.banc.presences += banc.presences;
      this.banc.entrees += banc.entrees;
    }
    for (const [league, parPoste] of ligues) {
      let L = this.ligues.get(league);
      if (!L) {
        L = new Map();
        this.ligues.set(league, L);
      }
      for (const [p, v] of parPoste) {
        let fen = L.get(p);
        if (!fen) {
          fen = new Fenetre(['x', 'att']);
          L.set(p, fen);
        }
        fen.ajouter(jour, v);
      }
    }
    this.jour = jour;
    this.jourEnAttente = null;
    this.enAttente = [];
    return out;
  }

  leJoueur(id, club) {
    let j = this.joueurs.get(id);
    if (!j) {
      j = { X: vide5(), E: vide5(), penClub: club, tit: [0, 0], entre: [0, 0], banc: [0, 0], postes: [], n: 0, derniere: null, club };
      this.joueurs.set(id, j);
    }
    return j;
  }

  leFaux(cle) {
    let f = this.faux.get(cle);
    if (!f) {
      f = { X: vide5(), E: vide5(), n: 0 };
      this.faux.set(cle, f);
    }
    return f;
  }

  /**
   * L'ÉTAT ENTIER au jour `jour` (aucune journée en attente ; tout ce qui est publié est d'avant `jour`) : joueurs, faux
   * joueurs, repères et rapports des compétitions, minutes moyennes, chance d'entrer, dernières feuilles — clés triées.
   * C'est ce que l'oracle de la copie tronquée compare à l'octet (T-F1).
   */
  etatAuJourJ(jour) {
    if (this.jourEnAttente !== null) throw new Error('JoueursAuJourJ.etatAuJourJ : une journée n’est pas publiée');
    if (this.jour !== null && !(this.jour < jour)) throw new Error(`JoueursAuJourJ.etatAuJourJ : l’état contient le ${this.jour}, pas d’avant le ${jour}`);
    const joueurs = {};
    for (const id of [...this.joueurs.keys()].sort((a, b) => a - b)) joueurs[id] = this.etatDuJoueur(id);
    const faux = {};
    for (const k of [...this.faux.keys()].sort(ordre)) {
      const f = this.faux.get(k);
      faux[k] = { X: [...f.X], E: [...f.E], n: f.n };
    }
    const reperes = {};
    for (const p of [0, 1, 2, 3, 4, R]) reperes[p] = { global: this.repereGlobal(p, jour), minutes: this.minutesMoyennes(p, jour) };
    const ligues = {};
    for (const league of [...this.ligues.keys()].sort(ordre)) {
      ligues[league] = {};
      for (const p of [0, 1, 2, 3, 4, R]) ligues[league][p] = this.rapportDeLaLigue(league, p, jour);
    }
    const feuilles = {};
    for (const club of [...this.feuilles.keys()].sort((a, b) => a - b)) feuilles[club] = this.derniereFeuille(club);
    return { jour, joueurs, faux, reperes, ligues, entree: this.chanceDEntrerMoyenne(jour), feuilles };
  }
}

/**
 * LA PASSE (générateur pur) : les rencontres `flux` (ordre (jour, clé)) publiées journée par journée ; pour chaque
 * journée, `avantLaJournee(jour, entrees, rencontres)` est appelé APRÈS le calcul des entrées (l'état d'avant la journée)
 * et AVANT la journée suivante ; `avantDAjouter(jour, rencontres)` (facultatif) est appelé avant d'ajouter la journée (le
 * banc y pose le statut des cartons du jour). Un point d'arrêt (yield) par journée.
 */
export function* passerLesRencontres(acc, flux, { avantDAjouter = null, avantLaJournee = null } = {}) {
  let jour = null;
  let duJour = [];
  const publier = () => {
    if (!duJour.length) return;
    if (avantDAjouter) avantDAjouter(jour, duJour);
    for (const r of duJour) acc.ajouter(r);
    const entrees = acc.finDeJournee();
    if (avantLaJournee) avantLaJournee(jour, entrees, duJour);
    duJour = [];
  };
  for (const r of flux) {
    if (jour !== null && r.date < jour) throw new Error(`passe des joueurs : rencontres dans le désordre (${r.date} après ${jour})`);
    if (jour !== null && r.date !== jour) {
      publier();
      yield jour;
    }
    jour = r.date;
    duJour.push(r);
  }
  publier();
  return acc;
}
