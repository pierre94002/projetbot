/**
 * refereeRead.js — L'ARBITRE, au jour J (étape 32 du plan, lot 1a, 29/10/2026 ; partagé avec l'étape 33).
 * -----------------------------------------------------------------------
 * Un seul module pour l'arbitre (correction 11 du cahier : l'étape 33 — cartons et corners — le réutilisera) :
 *   - sa CLÉ : FotMob ne donne pas d'identifiant d'arbitre, seulement un nom et un pays (fotMobProvider.js, mapMeta).
 *     La clé est « nom exact|pays » (forme stable : NFC, espaces réduits). Deux pays = deux arbitres (des homonymes) ; un
 *     nom écrit de deux façons = deux arbitres. C'est dit, jamais deviné : aucun rapprochement de noms ;
 *   - ses MOYENNES AU JOUR J, recalculées depuis le magasin (ArbitresAuJourJ, pur) : ses matchs d'avant J seulement,
 *     publiés en FIN DE JOURNÉE (un match ne voit jamais son jour) — matchs, cartons jaunes et rouges et fautes sur les
 *     matchs où les deux camps ont leurs cartons relevés (null n'est jamais 0), penalties marqués quand le déroulé a tous
 *     les buts du score (la règle de leagueBenchmarks.valeursDUneRencontre), buts à la 90e ;
 *   - ses INDICES « face au championnat » (pour l'écran) : ln((G + k·ē) / (E + k·ē)), où E est la somme des moyennes de
 *     buts du championnat au jour de chacun de ses matchs (la table du jour J, league_day), ē = E / n et k matchs
 *     « moyens » (10 ; 20 pour les penalties) ramènent un arbitre peu connu vers 0. Pour le banc (partie B), l'indice se
 *     calcule sur la base statistique (λS + μS, constat 9 de la critique) : `baseButs` de chaque rencontre, s'il est donné ;
 *   - la lecture de la table de la nuit `contexte_arbitres` (une clé primaire ; null si absente ou illisible, jamais une
 *     exception) et des homonymes.
 * JAMAIS les moyennes que FotMob affiche (meta.referee.yellowCardsPerMatch, foulsPerMatch, matches, penalties,
 * redCards…) : pour un match passé, ce sont celles du jour de la RELECTURE, pas celles du jour du match (une fuite).
 * Hors de l'empreinte du moteur ; aucun fichier du moteur ne l'importe (test contexteFrontiere).
 * -----------------------------------------------------------------------
 */

import { SEUILS } from '../contexte/reglagesContexte.js';
import { texteStable, jourDe } from '../contexte/formulesDuContexte.js';

const JOUR_MS = 86_400_000;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/** La clé d'un arbitre : « nom exact|pays » (pays vide s'il manque) ; null sans nom. */
export function cleDeLArbitre(arbitre) {
  const nom = texteStable(arbitre?.name ?? arbitre?.nom);
  if (!nom) return null;
  const pays = texteStable(arbitre?.country ?? arbitre?.pays) ?? '';
  return `${nom}|${pays}`;
}

/** Le nom et le pays d'une clé. */
export function partiesDeLaCle(cle) {
  const i = String(cle ?? '').lastIndexOf('|');
  if (i < 0) return { nom: String(cle ?? ''), pays: '' };
  return { nom: cle.slice(0, i), pays: cle.slice(i + 1) };
}

const vide = () => ({ matchs: 0, matchsCartons: 0, jaunes: 0, rouges: 0, matchsFautes: 0, fautes: 0, matchsDeroule: 0, penalties: 0, matchsButs: 0, buts90: 0 });

/** Ce qu'une rencontre apporte (pur) : cartons, fautes, penalties, buts — chaque compte avec son propre dénominateur. */
export function apportDUneRencontre(r) {
  const a = vide();
  a.matchs = 1;
  const c = r?.cartons ?? null;
  if (c && fini(c.jaunes) && fini(c.rouges)) {
    a.matchsCartons = 1;
    a.jaunes = c.jaunes;
    a.rouges = c.rouges;
  }
  if (c && fini(c.fautes)) {
    a.matchsFautes = 1;
    a.fautes = c.fautes;
  }
  if (fini(r?.penalties)) {
    a.matchsDeroule = 1;
    a.penalties = r.penalties;
  }
  if (r?.buts90 && fini(r.buts90.dom) && fini(r.buts90.ext)) {
    a.matchsButs = 1;
    a.buts90 = r.buts90.dom + r.buts90.ext;
  }
  return a;
}

const ajouterA = (s, a) => {
  for (const k of Object.keys(a)) s[k] += a[k];
};
const retirerDe = (s, a) => {
  for (const k of Object.keys(a)) s[k] -= a[k];
};

/**
 * LES ARBITRES AU JOUR J (pur, chronologique). `ajouter(rencontre)` met un match de la journée en attente ;
 * `finDeJournee()` publie la journée : les attendus de chaque match (moyenne de buts du championnat au jour J, taux de
 * penalties du championnat sur ses 365 jours d'AVANT J) sont pris AVANT d'ajouter la journée elle-même, puis ses matchs
 * comptent. Une rencontre : { date, league, arbitre: { nom|name, pays|country } | null, attribue, cartons: { jaunes,
 * rouges, fautes } | null (les deux camps), penalties (null : déroulé incomplet), buts90: { dom, ext } | null,
 * moyenneButsLigue (buts par match du championnat au jour J, ou null), baseButs (λS + μS, le banc seulement) }.
 */
export class ArbitresAuJourJ {
  constructor({ seuils = SEUILS } = {}) {
    this.seuils = seuils;
    this.parCle = new Map();
    this.ligues = new Map();
    this.jour = null;
    this.jourEnAttente = null;
    this.enAttente = [];
  }

  ajouter(r) {
    const jour = jourDe(r?.date);
    if (!jour) throw new Error(`ArbitresAuJourJ.ajouter : jour illisible (« ${r?.date ?? ''} »)`);
    if (this.jour !== null && !(jour > this.jour)) throw new Error(`ArbitresAuJourJ.ajouter : un match du ${jour} arrive après la publication du ${this.jour} — fuite ou désordre refusés`);
    if (this.jourEnAttente !== null && jour !== this.jourEnAttente) throw new Error(`ArbitresAuJourJ.ajouter : la journée du ${this.jourEnAttente} n'est pas publiée (finDeJournee) avant le ${jour}`);
    this.jourEnAttente = jour;
    this.enAttente.push(r);
  }

  /** La fenêtre des 365 derniers jours d'un championnat, AVANT `jour` (les jours plus anciens sortent). */
  fenetreDeLaLigue(league, jour) {
    let L = this.ligues.get(league);
    if (!L) {
      L = { jours: [], sommes: vide() };
      this.ligues.set(league, L);
    }
    const limite = new Date(Date.parse(`${jour}T00:00:00Z`) - this.seuils.fenetreLigueJours * JOUR_MS).toISOString().slice(0, 10);
    while (L.jours.length && L.jours[0].date < limite) retirerDe(L.sommes, L.jours.shift().apport);
    return L;
  }

  /** Le taux de penalties du championnat au jour (ses 365 jours d'avant ; sous 30 matchs à déroulé complet : 0,25). */
  tauxDePenalties(league, jour) {
    const L = this.fenetreDeLaLigue(league, jour);
    return L.sommes.matchsDeroule >= this.seuils.minLiguePen ? L.sommes.penalties / L.sommes.matchsDeroule : this.seuils.penDefaut;
  }

  finDeJournee() {
    if (this.jourEnAttente === null) return;
    const jour = this.jourEnAttente;
    const matchs = this.enAttente.filter((r) => !r.attribue);
    // 1. Les attendus de chaque match : l'état d'AVANT la journée.
    const attendus = matchs.map((r) => ({
      buts: fini(r.moyenneButsLigue) ? r.moyenneButsLigue : this.seuils.repliLigueButs,
      base: fini(r.baseButs) ? r.baseButs : null,
      pen: this.tauxDePenalties(r.league, jour)
    }));
    // 2. La journée publiée : les arbitres, puis les fenêtres des championnats.
    const parLigue = new Map();
    matchs.forEach((r, i) => {
      const a = apportDUneRencontre(r);
      if (!parLigue.has(r.league)) parLigue.set(r.league, vide());
      ajouterA(parLigue.get(r.league), a);
      const cle = cleDeLArbitre(r.arbitre);
      if (!cle) return;
      let e = this.parCle.get(cle);
      if (!e) {
        e = { cle, ...vide(), butsAttendus: 0, butsAttendusBase: 0, matchsBase: 0, penAttendus: 0, premier: jour, dernier: jour, ligues: new Map() };
        this.parCle.set(cle, e);
      }
      ajouterA(e, a);
      if (a.matchsButs) {
        e.butsAttendus += attendus[i].buts;
        if (attendus[i].base !== null) {
          e.butsAttendusBase += attendus[i].base;
          e.matchsBase += 1;
        }
      }
      if (a.matchsDeroule) e.penAttendus += attendus[i].pen;
      e.dernier = jour;
      e.ligues.set(r.league, (e.ligues.get(r.league) ?? 0) + 1);
    });
    for (const [league, apport] of parLigue) {
      const L = this.fenetreDeLaLigue(league, jour);
      L.jours.push({ date: jour, apport });
      ajouterA(L.sommes, apport);
    }
    this.jour = jour;
    this.jourEnAttente = null;
    this.enAttente = [];
  }

  /** L'état d'un arbitre (une copie), ou null s'il n'a aucun match publié. */
  etat(cle) {
    const e = this.parCle.get(cle);
    if (!e) return null;
    const { nom, pays } = partiesDeLaCle(cle);
    return { ...e, nom, pays, ligues: Object.fromEntries([...e.ligues].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) };
  }

  /** Toutes les clés connues. */
  cles() {
    return [...this.parCle.keys()];
  }

  /** Les moyennes d'un championnat sur ses 365 jours d'avant `jour` (par défaut : le lendemain du dernier jour publié). */
  ligue(league, jour = null) {
    const j = jour ?? (this.jour ? new Date(Date.parse(`${this.jour}T00:00:00Z`) + JOUR_MS).toISOString().slice(0, 10) : null);
    if (!j || !this.ligues.has(league)) return null;
    const s = this.fenetreDeLaLigue(league, j).sommes;
    const par = (x, n) => (n > 0 ? x / n : null);
    return {
      league,
      matchs: s.matchs,
      jaunesParMatch: par(s.jaunes, s.matchsCartons),
      rougesParMatch: par(s.rouges, s.matchsCartons),
      fautesParMatch: par(s.fautes, s.matchsFautes),
      penaltiesParMatch: par(s.penalties, s.matchsDeroule),
      butsParMatch: par(s.buts90, s.matchsButs),
      matchsCartons: s.matchsCartons,
      matchsDeroule: s.matchsDeroule
    };
  }

  /** Les championnats connus. */
  liguesConnues() {
    return [...this.ligues.keys()].sort();
  }
}

/**
 * Les indices d'un arbitre (état d'ArbitresAuJourJ) : « buts » face au championnat, « buts » face à la base (banc), et
 * « penalties ». ln((G + k·ē) / (E + k·ē)) ; null sans match compté. Pur.
 */
export function indicesDeLArbitre(etat, { kButs = SEUILS.kArbitreButs, kPen = SEUILS.kArbitrePen } = {}) {
  if (!etat) return { buts: null, butsBase: null, penalties: null };
  const indice = (obs, att, n, k) => {
    if (!(n > 0) || !(att > 0)) return null;
    const moyen = att / n;
    return Math.log((obs + k * moyen) / (att + k * moyen));
  };
  return {
    buts: indice(etat.buts90, etat.butsAttendus, etat.matchsButs, kButs),
    butsBase: etat.matchsBase === etat.matchsButs ? indice(etat.buts90, etat.butsAttendusBase, etat.matchsBase, kButs) : null,
    penalties: indice(etat.penalties, etat.penAttendus, etat.matchsDeroule, kPen)
  };
}

const arrondi = (x, n = 6) => (fini(x) ? Number(x.toFixed(n)) : null);

/** Les colonnes de `contexte_arbitres`, dans l'ordre. */
export const COLONNES_ARBITRES = Object.freeze([
  'cle', 'nom', 'pays', 'matchs', 'matchs_cartons', 'jaunes', 'rouges', 'matchs_fautes', 'fautes', 'matchs_deroule', 'penalties',
  'matchs_buts', 'buts90', 'buts_attendus', 'pen_attendus', 'indice_buts', 'indice_penalties', 'premier', 'dernier', 'ligues', 'calcule_le', 'version'
]);

/** La ligne de `contexte_arbitres` d'un état (indices face au championnat). */
export function ligneDeLaTable(etat, { calculeLe, version }) {
  const ind = indicesDeLArbitre(etat);
  return {
    cle: etat.cle,
    nom: etat.nom,
    pays: etat.pays || null,
    matchs: etat.matchs,
    matchs_cartons: etat.matchsCartons,
    jaunes: etat.matchsCartons ? etat.jaunes : null,
    rouges: etat.matchsCartons ? etat.rouges : null,
    matchs_fautes: etat.matchsFautes,
    fautes: etat.matchsFautes ? etat.fautes : null,
    matchs_deroule: etat.matchsDeroule,
    penalties: etat.matchsDeroule ? etat.penalties : null,
    matchs_buts: etat.matchsButs,
    buts90: etat.matchsButs ? etat.buts90 : null,
    buts_attendus: etat.matchsButs ? arrondi(etat.butsAttendus) : null,
    pen_attendus: etat.matchsDeroule ? arrondi(etat.penAttendus) : null,
    indice_buts: arrondi(ind.buts),
    indice_penalties: arrondi(ind.penalties),
    premier: etat.premier,
    dernier: etat.dernier,
    ligues: JSON.stringify(etat.ligues ?? {}),
    calcule_le: calculeLe,
    version
  };
}

/** La ligne d'un arbitre dans la table de la nuit (une clé primaire) ; null si absente, sans nom, ou table illisible — jamais une exception. */
export function lireLArbitre({ nom, pays = '', database }) {
  const cle = cleDeLArbitre({ nom, pays });
  if (!cle || !database) return null;
  try {
    const r = database.prepare(`SELECT ${COLONNES_ARBITRES.join(', ')} FROM contexte_arbitres WHERE cle = ?`).get(cle);
    if (!r) return null;
    let ligues = {};
    try {
      ligues = JSON.parse(r.ligues ?? '{}');
    } catch {
      ligues = {};
    }
    return { ...r, ligues };
  } catch {
    return null;
  }
}

/** Les autres arbitres du même nom (autre pays) dans la table de la nuit : [{ cle, pays, matchs }] ; [] si rien ou illisible. */
export function homonymesDe({ nom, pays = '', database }) {
  const n = texteStable(nom);
  if (!n || !database) return [];
  const p = texteStable(pays) ?? '';
  try {
    return database
      .prepare('SELECT cle, pays, matchs FROM contexte_arbitres WHERE nom = ? ORDER BY matchs DESC, cle')
      .all(n)
      .filter((r) => (r.pays ?? '') !== p)
      .map((r) => ({ cle: r.cle, pays: r.pays ?? '', matchs: r.matchs }));
  } catch {
    return [];
  }
}
