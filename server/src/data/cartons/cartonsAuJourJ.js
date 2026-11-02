/**
 * cartonsAuJourJ.js — LA PASSE CHRONOLOGIQUE DES CARTONS, AU JOUR J (étape 33 du plan, lot 1a, 02/11/2026).
 * -----------------------------------------------------------------------
 * Pur : ni base, ni fichier, ni horloge, ni hasard. UN SEUL accumulateur pour le banc, la nuit, la preuve et le contrôle
 * anti-fuite. Il tient, au jour J :
 *   - les moyennes de chaque compétition par côté (ses matchs relevés des 365 jours d'avant J, 30 au moins) ;
 *   - la TENDANCE récente de chaque compétition (critique, constat 2 : ses 60 derniers matchs relevés, le rapport
 *     cartons / moyenne de chacun au jour de ce match) ;
 *   - la GARDE des vrais zéros (critique, constat 9 : ses 60 derniers matchs relevés, saisons confondues) ;
 *   - la fenêtre de chaque équipe (ses 20 derniers matchs relevés, toutes compétitions ayant une moyenne ce jour-là :
 *     cartons pris et provoqués rapportés à la moyenne de chaque côté) ;
 *   - les sommes de chaque arbitre (O = cartons réels, E = cartons attendus PAR LES ÉQUIPES — exposants 1, tendance
 *     comprise —, n matchs) et celles du FAUX arbitre du placebo (clé « faux:<compétition>:<n> », n = FNV-1a de la clé du
 *     match mod 20).
 * Tout fait du jour J est publié en FIN DE JOURNÉE (finDeJournee) : les attendus de chaque match du jour sont pris AVANT
 * la publication (un match ne voit jamais son jour). Il refuse le désordre et la fuite (il lève), comme ArbitresAuJourJ.
 * Hors de l'empreinte du moteur (data/cartons/) ; aucun fichier du moteur ne l'importe.
 * -----------------------------------------------------------------------
 */

import { CONSTANTES_DES_CARTONS, cleDArbitre, indiceDArbitre, rapportsDEquipe, tendanceDeLaLigue, gardeActive, statutApresLaGarde, estReleve, fnv1a } from './formulesDesCartons.js';
import { PLACEBOS } from './reglagesCartons.js';

const JOUR_MS = 86_400_000;
const jourDe = (x) => {
  const j = String(x ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(j) && Number.isFinite(Date.parse(`${j}T00:00:00Z`)) ? j : null;
};
const moinsJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) - n * JOUR_MS).toISOString().slice(0, 10);
const ordre = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Le faux arbitre d'un match (placebo de l'arbitre) : « faux:<compétition>:<n> », n = FNV-1a(clé du match) mod N. */
export const fauxArbitre = (matchKey, league, N = PLACEBOS.fauxArbitres) => `faux:${league}:${fnv1a(matchKey) % N}`;

/** Le pseudo-championnat d'un match (placebo des réglages par championnat) : « pseudo-<n> », n = FNV-1a(clé du match) mod N. */
export const pseudoChampionnat = (matchKey, N = PLACEBOS.pseudoChampionnats) => `pseudo-${fnv1a(matchKey) % N}`;

/** Une file bornée (les N derniers). */
const pousser = (file, x, N) => {
  file.push(x);
  if (file.length > N) file.shift();
};

/**
 * L'ACCUMULATEUR. Une rencontre : { matchKey, date, league, home, away (identifiants FotMob, nombres), statutBase (statut
 * de statutDesCartons, sans la garde), valeur: { home, away, total } | null (convention C), arbitre: { nom, pays } | null }.
 * `finDeJournee()` rend Map(matchKey → instantané du match, pris AVANT la publication du jour) : { statut (après la
 * garde), releve, garde, m: { dom, ext, n } | null, tendance: { valeur, n }, equipes: { home: { rho, pi, n }, away },
 * arbitre: { cle, n, O, E, z } | null, faux: { cle, n, O, E, z } }.
 */
export class CartonsAuJourJ {
  constructor({ constantes = CONSTANTES_DES_CARTONS, fauxArbitres = PLACEBOS.fauxArbitres } = {}) {
    this.c = constantes;
    this.nFaux = fauxArbitres;
    this.ligues = new Map();
    this.equipes = new Map();
    this.arbitres = new Map();
    this.faux = new Map();
    this.jour = null;
    this.jourEnAttente = null;
    this.enAttente = [];
  }

  ajouter(r) {
    const jour = jourDe(r?.date);
    if (!jour) throw new Error(`CartonsAuJourJ.ajouter : jour illisible (« ${r?.date ?? ''} »)`);
    if (this.jour !== null && !(jour > this.jour)) throw new Error(`CartonsAuJourJ.ajouter : un match du ${jour} arrive après la publication du ${this.jour} — fuite ou désordre refusés`);
    if (this.jourEnAttente !== null && jour !== this.jourEnAttente) throw new Error(`CartonsAuJourJ.ajouter : la journée du ${this.jourEnAttente} n'est pas publiée (finDeJournee) avant le ${jour}`);
    this.jourEnAttente = jour;
    this.enAttente.push(r);
  }

  /** L'état d'une compétition (créé vide). */
  laLigue(league) {
    let L = this.ligues.get(league);
    if (!L) {
      L = { jours: [], s: { dom: 0, ext: 0, n: 0 }, tendance: [], garde: [] };
      this.ligues.set(league, L);
    }
    return L;
  }

  /** Les moyennes d'une compétition au jour `jour` (ses relevés des 365 jours d'avant ; null sous 30 matchs). */
  ligue(league, jour) {
    const L = this.ligues.get(league);
    if (!L || !jourDe(jour)) return null;
    const limite = moinsJours(jour, this.c.ligueJours);
    while (L.jours.length && L.jours[0].date < limite) {
      const x = L.jours.shift();
      L.s.dom -= x.dom;
      L.s.ext -= x.ext;
      L.s.n -= x.n;
    }
    if (L.s.n < this.c.minLigue) return { dom: null, ext: null, n: L.s.n };
    return { dom: L.s.dom / L.s.n, ext: L.s.ext / L.s.n, n: L.s.n };
  }

  /** La tendance d'une compétition (ses 60 derniers rapports publiés). */
  tendance(league) {
    const L = this.ligues.get(league);
    return tendanceDeLaLigue(L ? L.tendance : [], this.c.tendance.k);
  }

  /** La garde des vrais zéros d'une compétition : { n, vraisZeros, active }. */
  garde(league) {
    const L = this.ligues.get(league);
    const n = L ? L.garde.length : 0;
    const vraisZeros = L ? L.garde.reduce((s, x) => s + x, 0) : 0;
    return { n, vraisZeros, active: gardeActive({ n, vraisZeros }, this.c.gardeZero) };
  }

  /** L'état d'une équipe : { rho, pi, n, pris, provoques } (rapports ramenés vers 1 ; n = 0 : 1 et 1 ; pris et provoqués : cartons bruts par match de la fenêtre, null sans match). */
  etatDeLEquipe(club) {
    const f = this.equipes.get(club) ?? [];
    const r = rapportsDEquipe(f, this.c.kEquipe);
    return { ...r, pris: f.length ? f.reduce((s, x) => s + x.c, 0) / f.length : null, provoques: f.length ? f.reduce((s, x) => s + x.a, 0) / f.length : null };
  }

  /** Les sommes d'un arbitre (ou d'un faux arbitre) et son indice : { cle, n, O, E, z, premier, dernier, ligues } ; null s'il n'a aucun match publié. */
  etatDeLArbitre(cle) {
    const a = (String(cle).startsWith('faux:') ? this.faux : this.arbitres).get(cle);
    if (!a) return null;
    return { cle, n: a.n, O: a.O, E: a.E, z: indiceDArbitre(a.O, a.E, a.n, this.c.kArbitre), premier: a.premier, dernier: a.dernier, ligues: Object.fromEntries([...a.ligues].sort((x, y) => y[1] - x[1] || ordre(x[0], y[0]))) };
  }

  /** Ce que le banc et la nuit lisent d'un match, au jour de ce match (l'état d'AVANT sa journée). */
  attendusAuJourJ(r, jour = jourDe(r.date)) {
    const m = this.ligue(r.league, jour);
    const g = this.garde(r.league);
    const statut = statutApresLaGarde(r.statutBase, g.active);
    const arb = (cle) => {
      if (!cle) return null;
      const e = this.etatDeLArbitre(cle);
      return e ? { cle, n: e.n, O: e.O, E: e.E, z: e.z } : { cle, n: 0, O: 0, E: 0, z: null };
    };
    return {
      statut,
      releve: estReleve(statut),
      garde: g,
      m: m && m.dom !== null ? { dom: m.dom, ext: m.ext, n: m.n } : null,
      mN: m ? m.n : 0,
      tendance: this.tendance(r.league),
      equipes: { home: this.etatDeLEquipe(r.home), away: this.etatDeLEquipe(r.away) },
      arbitre: arb(cleDArbitre(r.arbitre)),
      faux: arb(fauxArbitre(r.matchKey, r.league, this.nFaux))
    };
  }

  /** Publie la journée en attente ; rend Map(matchKey → instantané pris AVANT la publication). */
  finDeJournee() {
    const out = new Map();
    if (this.jourEnAttente === null) return out;
    const jour = this.jourEnAttente;
    // 1. Les instantanés : l'état d'AVANT la journée.
    for (const r of this.enAttente) out.set(r.matchKey, this.attendusAuJourJ(r, jour));
    // 2. La journée publiée : compétitions, tendance, garde, équipes, arbitres.
    const parLigue = new Map();
    for (const r of this.enAttente) {
      const x = out.get(r.matchKey);
      const L = this.laLigue(r.league);
      if (estReleve(r.statutBase)) pousser(L.garde, r.statutBase === 'vrai-zero' ? 1 : 0, this.c.gardeZero.derniers);
      if (!x.releve || !r.valeur) continue;
      const v = r.valeur;
      const p = parLigue.get(r.league) ?? { date: jour, dom: 0, ext: 0, n: 0 };
      p.dom += v.home;
      p.ext += v.away;
      p.n += 1;
      parLigue.set(r.league, p);
      if (!x.m) continue;
      pousser(L.tendance, v.total / (x.m.dom + x.m.ext), this.c.tendance.derniers);
      const fe = (club) => {
        let f = this.equipes.get(club);
        if (!f) {
          f = [];
          this.equipes.set(club, f);
        }
        return f;
      };
      pousser(fe(r.home), { r: v.home / x.m.dom, p: v.away / x.m.ext, c: v.home, a: v.away }, this.c.fenetreEquipe);
      pousser(fe(r.away), { r: v.away / x.m.ext, p: v.home / x.m.dom, c: v.away, a: v.home }, this.c.fenetreEquipe);
      // L'attendu « équipes » de l'arbitre : exposants 1, tendance comprise (constat 2), l'état d'AVANT la journée.
      const t = x.tendance.valeur;
      const E = x.m.dom * t * x.equipes.home.rho * x.equipes.away.pi + x.m.ext * t * x.equipes.away.rho * x.equipes.home.pi;
      for (const [table, cle] of [[this.arbitres, x.arbitre?.cle], [this.faux, x.faux?.cle]]) {
        if (!cle) continue;
        let a = table.get(cle);
        if (!a) {
          a = { O: 0, E: 0, n: 0, premier: jour, dernier: jour, ligues: new Map() };
          table.set(cle, a);
        }
        a.O += v.total;
        a.E += E;
        a.n += 1;
        a.dernier = jour;
        a.ligues.set(r.league, (a.ligues.get(r.league) ?? 0) + 1);
      }
    }
    for (const [league, p] of parLigue) {
      const L = this.laLigue(league);
      L.jours.push(p);
      L.s.dom += p.dom;
      L.s.ext += p.ext;
      L.s.n += p.n;
    }
    this.jour = jour;
    this.jourEnAttente = null;
    this.enAttente = [];
    return out;
  }

  /**
   * L'ÉTAT ENTIER au jour `jour` (aucune journée en attente ; tout ce qui est publié est d'avant `jour`) : compétitions
   * (moyennes, tendance, garde), équipes (rapports, n), arbitres et faux arbitres (sommes et indice) — clés triées. C'est
   * ce que l'oracle de la copie tronquée compare à l'octet (T-F1).
   */
  etatAuJourJ(jour) {
    if (this.jourEnAttente !== null) throw new Error('CartonsAuJourJ.etatAuJourJ : une journée n’est pas publiée');
    if (this.jour !== null && !(this.jour < jour)) throw new Error(`CartonsAuJourJ.etatAuJourJ : l’état contient le ${this.jour}, pas d’avant le ${jour}`);
    const ligues = {};
    for (const league of [...this.ligues.keys()].sort(ordre)) ligues[league] = { m: this.ligue(league, jour), tendance: this.tendance(league), garde: this.garde(league) };
    const equipes = {};
    for (const club of [...this.equipes.keys()].sort((a, b) => a - b)) equipes[club] = this.etatDeLEquipe(club);
    const arbitres = {};
    for (const cle of [...this.arbitres.keys(), ...this.faux.keys()].sort(ordre)) arbitres[cle] = this.etatDeLArbitre(cle);
    return { jour, ligues, equipes, arbitres };
  }

  /** Les clés des arbitres réels connus. */
  clesDesArbitres() {
    return [...this.arbitres.keys()].sort(ordre);
  }
}

/**
 * LA PASSE (générateur pur) : les rencontres `flux` (dans l'ordre (jour, clé)) publiées journée par journée ; pour
 * chaque journée, `avantLaJournee(jour, instantanes, rencontres)` est appelé APRÈS le calcul des instantanés (l'état
 * d'avant la journée) et AVANT la journée suivante. Un point d'arrêt (yield) par journée.
 */
export function* passerLesRencontres(acc, flux, { avantLaJournee = null } = {}) {
  let jour = null;
  let duJour = [];
  const publier = () => {
    if (!duJour.length) return;
    const inst = acc.finDeJournee();
    if (avantLaJournee) avantLaJournee(jour, inst, duJour);
    duJour = [];
  };
  for (const r of flux) {
    if (jour !== null && r.date < jour) throw new Error(`passe des cartons : rencontres dans le désordre (${r.date} après ${jour})`);
    if (jour !== null && r.date !== jour) {
      publier();
      yield jour;
    }
    jour = r.date;
    acc.ajouter(r);
    duJour.push(r);
  }
  publier();
  return acc;
}
