/**
 * comptesDesJoueurs.js — LES COMPTES D'AVANT LE REGARD (étape 34 du plan, lot 1a, partie B, 03/11/2026).
 * -----------------------------------------------------------------------
 * Pur ; n'importe que formulesDesJoueurs.js (relevesDUnCamp, regleP, fauxJoueur), reglementJoueurs.js et
 * reglagesJoueurs.js — JAMAIS bancDesJoueurs.js, jamais une perte, jamais un attendu, jamais une part de joueur (T-B8).
 * Il compte des relevés, des couvertures et des égalités, sur les observations que la passe du processus à part lui
 * apporte (une par rencontre, dans l'ordre) : { r (la rencontre normalisée, avec cartonsReleves), entrees (les entrées
 * des compositions, prises avant la journée : on n'en lit que la PRÉSENCE de repères et de minutes), base: { lambda,
 * cadres, cartons } (présences seulement), dernieres: { home, away } (la dernière feuille d'avant J de chaque club) }.
 * Rend les comptes par pli (mise en route, A, B ; P5 n'est jamais lue), la règle P PAR ANNÉE (critique, constat 14), les
 * compositions (dernière feuille face au match : titulaires, entrés, absents ; bancs listés), les camps écartés pour un
 * buteur sans identifiant par compétition (critique, constat 19.3), les faux joueurs, puis les contrôles « définition
 * cassée » (COMPTES_CASSES, écrits avant).
 * -----------------------------------------------------------------------
 */

import { relevesDUnCamp, regleP, fauxJoueur, nombre, butSurPenalty } from './formulesDesJoueurs.js';
import { COMPTES_CASSES, PERIODES_DU_BANC, FAUX_JOUEURS, GARDIENS_JUGES, DEBUT_DES_CADRES_JUGES } from './reglagesJoueurs.js';

const dans = (jour, p) => jour >= p.de && jour <= p.a;
const identifie = (id) => Number.isSafeInteger(id) && id > 0;

/** Le pli d'une rencontre : 'mise-en-route', 'A' (2023-07 → 2025-06), 'B' (2025-07 → 2026-09-23) ; null au-delà. */
export function pliDe(jour, periodes = PERIODES_DU_BANC) {
  if (dans(jour, periodes.miseEnRoute)) return 'mise-en-route';
  for (const p of periodes.plis) if (dans(jour, p.juger)) return p.nom;
  return null;
}

const compteur = () => ({
  rencontres: 0,
  eligibles: 0,
  attribuees: 0,
  prolongees: 0,
  nonJouees: 0,
  campsAFeuille: 0,
  campsAXg: 0,
  campsInconnuP: 0,
  buteurs: 0,
  cadres: 0,
  passes: 0,
  cartons: 0,
  matchsCartons: 0,
  baseLambda: 0,
  baseCadres: 0,
  eligiblesCadresJuges: 0,
  baseCadresJuges: 0,
  baseCartons: 0,
  titulaires: 0,
  titulairesSansId: 0,
  titulairesJoues: 0,
  rembourses: 0,
  gardiensNonJuges: 0,
  jugeables: { marque: 0, cadres: 0, averti: 0, passeur: 0 },
  butsDeroule: 0,
  butsRattaches: 0,
  cartonsDeroule: 0,
  cartonsRattaches: 0,
  avertisJoueurs: 0,
  bancs: { camps: 0, complets: 0, egauxAuxEntrants: 0, sansBanc: 0, listes: 0, entres: 0 },
  dernieres: { camps: 0, trouvees: 0, titulairesDeLaFeuille: 0, titulairesAuMatch: 0, entres: 0, absents: 0 },
  sansIdentifiantButeur: 0
});

/**
 * LES COMPTES (pur) sur les observations de la passe. Rend { parPli, regleP: { 'année|cas': { lignes, avecPenalty } },
 * ecartesParCompetition, fauxJoueurs: { parAn: { an: { emplacements, apparitions, mediane } } }, controles, casse }.
 */
export function comptesDesJoueurs(observations, options = {}) {
  const c = compteurDesJoueurs(options);
  for (const o of observations) c.ajouter(o);
  return c.fin();
}

/** Les comptes, observation par observation (la passe n'a rien à garder en mémoire) : { ajouter(o), fin() }. */
export function compteurDesJoueurs({ periodes = PERIODES_DU_BANC, seuils = COMPTES_CASSES } = {}) {
  const parPli = {};
  const reglePAn = {};
  const ecartes = {};
  const fauxParAn = new Map();
  const ajouter = (o) => {
    const r = o.r;
    const pli = pliDe(r.date, periodes);
    if (!pli) return;
    const c = (parPli[pli] ??= compteur());
    c.rencontres += 1;
    if (r.attribue) c.attribuees += 1;
    else if (r.prolongation) c.prolongees += 1;
    else if (!r.joue) c.nonJouees += 1;
    const eligible = r.joue && !r.attribue && !r.prolongation;
    if (!eligible) return;
    c.eligibles += 1;
    if (o.base?.lambda) c.baseLambda += 1;
    if (o.base?.cadres) c.baseCadres += 1;
    const cadresJuges = r.date >= (DEBUT_DES_CADRES_JUGES[pli] ?? '0000-01-01');
    if (cadresJuges) {
      c.eligiblesCadresJuges += 1;
      if (o.base?.cadres) c.baseCadresJuges += 1;
    }
    if (r.cartonsReleves) {
      c.matchsCartons += 1;
      if (o.base?.cartons) c.baseCartons += 1;
    }
    const an = r.date.slice(0, 4);
    for (const camp of ['home', 'away']) {
      const cc = r.camps[camp];
      const lignes = cc.lignes ?? [];
      if (!lignes.length) continue;
      c.campsAFeuille += 1;
      const rel = relevesDUnCamp({ lignes, evenements: r.evenements, camp, butsDuCamp: cc.buts, cadresDEquipe: cc.cadresDEquipe, cartonsReleves: r.cartonsReleves });
      if (rel.releves.aXg) c.campsAXg += 1;
      if (rel.releves.inconnuP) c.campsInconnuP += 1;
      if (rel.releves.buteurs) c.buteurs += 1;
      if (rel.releves.cadres) c.cadres += 1;
      if (rel.releves.passes || rel.releves.xa === 'xa') c.passes += 1;
      if (rel.releves.cartons) c.cartons += 1;
      // Buteurs non relevés parce qu'un but (non csc) n'a pas d'identifiant rattaché (critique, constat 19.3).
      const buts = (r.evenements ?? []).filter((e) => e.type === 'goal' && e.side === camp && !e.ownGoal);
      const joues = new Set(lignes.filter((l) => identifie(l.id) && nombre(l.minutes) > 0).map((l) => l.id));
      if (!rel.releves.buteurs && buts.some((e) => !(identifie(e.playerId) && joues.has(e.playerId)))) {
        c.sansIdentifiantButeur += 1;
        ecartes[r.league] = (ecartes[r.league] ?? 0) + 1;
      }
      // Rattachement par identifiant (buts non csc et cartons du camp, avec identifiant) à une ligne jouée du camp.
      for (const e of buts) {
        if (!identifie(e.playerId)) continue;
        c.butsDeroule += 1;
        if (joues.has(e.playerId)) c.butsRattaches += 1;
      }
      for (const e of r.evenements ?? []) {
        if (e.type !== 'card' || e.side !== camp || !identifie(e.playerId)) continue;
        c.cartonsDeroule += 1;
        if (joues.has(e.playerId)) c.cartonsRattaches += 1;
      }
      if (rel.totaux.av !== null) c.avertisJoueurs += rel.totaux.av;
      // Les titulaires (composition officielle) et les familles jugeables.
      for (const l of lignes) {
        if (!l.titulaire) continue;
        c.titulaires += 1;
        if (!identifie(l.id)) {
          c.titulairesSansId += 1;
          continue;
        }
        if (!(nombre(l.minutes) > 0)) {
          c.rembourses += 1;
          continue;
        }
        c.titulairesJoues += 1;
        if (!GARDIENS_JUGES && l.poste === 1) {
          c.gardiensNonJuges += 1;
          continue;
        }
        if (rel.releves.buteurs && o.base?.lambda) c.jugeables.marque += 1;
        if (rel.releves.cadres && o.base?.cadres && cadresJuges) c.jugeables.cadres += 1;
        if (rel.releves.cartons && o.base?.cartons) c.jugeables.averti += 1;
        if (rel.releves.passes && o.base?.lambda) c.jugeables.passeur += 1;
      }
      // Les bancs listés.
      const banc = lignes.filter((l) => !l.titulaire);
      const nonEntres = banc.filter((l) => !(nombre(l.minutes) > 0));
      c.bancs.camps += 1;
      if (!banc.length) c.bancs.sansBanc += 1;
      else if (nonEntres.length) c.bancs.complets += 1;
      else c.bancs.egauxAuxEntrants += 1;
      if (nonEntres.length) {
        c.bancs.listes += banc.filter((l) => identifie(l.id)).length;
        c.bancs.entres += banc.filter((l) => identifie(l.id) && nombre(l.minutes) > 0).length;
      }
      // La dernière feuille d'avant J face au match J (des compositions, aucun résultat).
      const d = o.dernieres?.[camp];
      c.dernieres.camps += 1;
      if (d) {
        c.dernieres.trouvees += 1;
        const parId = new Map(lignes.filter((l) => identifie(l.id)).map((l) => [l.id, l]));
        for (const id of d.onze) {
          if (!identifie(id)) continue;
          c.dernieres.titulairesDeLaFeuille += 1;
          const l = parId.get(id);
          if (l && l.titulaire) c.dernieres.titulairesAuMatch += 1;
          else if (l && nombre(l.minutes) > 0) c.dernieres.entres += 1;
          else c.dernieres.absents += 1;
        }
      }
      // La règle P par année, contre les buts sur penalty du déroulé, par identifiant.
      const penParId = new Map();
      for (const e of buts) if (butSurPenalty(e) && identifie(e.playerId)) penParId.set(e.playerId, (penParId.get(e.playerId) ?? 0) + 1);
      for (const l of lignes) {
        if (!(nombre(l.minutes) > 0) || nombre(l.xg) === null) continue;
        const cas = regleP(l).cas;
        const k = `${an}|${cas}`;
        const x = (reglePAn[k] ??= { lignes: 0, avecPenalty: 0 });
        x.lignes += 1;
        if (identifie(l.id) && penParId.has(l.id)) x.avecPenalty += 1;
      }
      // Les faux joueurs : apparitions par emplacement et par an (poste de la ligne ; sans poste → pool des milieux).
      for (const l of lignes) {
        if (!identifie(l.id) || !(nombre(l.minutes) > 0)) continue;
        const cle = fauxJoueur(r.matchKey, l.id, l.poste ?? 0);
        let m = fauxParAn.get(an);
        if (!m) {
          m = new Map();
          fauxParAn.set(an, m);
        }
        m.set(cle, (m.get(cle) ?? 0) + 1);
      }
    }
  };
  const fin = () => {
  // Les faux joueurs : médiane des apparitions par emplacement (emplacements jamais tirés comptés à 0).
  const totalEmplacements = Object.values(FAUX_JOUEURS).reduce((s, n) => s + n, 0);
  const fauxJoueurs = { parAn: {} };
  for (const [an, m] of [...fauxParAn].sort()) {
    const valeurs = [...m.values()];
    while (valeurs.length < totalEmplacements) valeurs.push(0);
    valeurs.sort((a, b) => a - b);
    fauxJoueurs.parAn[an] = { emplacements: m.size, apparitions: valeurs.reduce((s, x) => s + x, 0), mediane: valeurs[Math.floor(valeurs.length / 2)], min: valeurs[0], max: valeurs[valeurs.length - 1] };
  }
  const controles = controlesDesComptes({ parPli, reglePAn, fauxJoueurs, seuils, periodes });
  return { parPli, regleP: reglePAn, ecartesParCompetition: ecartes, fauxJoueurs, controles, casse: controles.some((x) => x.casse) };
  };
  return { ajouter, fin };
}

/** Les contrôles « définition cassée » (écrits avant le regard) : une ligne par contrôle, pli ou année. */
export function controlesDesComptes({ parPli, reglePAn, fauxJoueurs, seuils = COMPTES_CASSES, periodes = PERIODES_DU_BANC }) {
  const out = [];
  const part = (a, b) => (b > 0 ? a / b : null);
  const ajouter = (id, pli, valeur, seuil, sens) => {
    const casse = valeur === null ? true : sens === 'min' ? valeur < seuil : valeur > seuil;
    out.push({ id, pli, valeur, seuil, sens, casse });
  };
  for (const pli of periodes.plis.map((p) => p.nom)) {
    const c = parPli[pli];
    if (!c) {
      out.push({ id: 'pli-absent', pli, valeur: null, seuil: null, sens: 'min', casse: true });
      continue;
    }
    ajouter('titulairesMin', pli, c.jugeables.marque, seuils.titulairesMin, 'min');
    ajouter('buteursMin', pli, part(c.buteurs, c.campsAFeuille), seuils.buteursMin, 'min');
    ajouter('rattachesMin', pli, part(c.butsRattaches + c.cartonsRattaches, c.butsDeroule + c.cartonsDeroule), seuils.rattachesMin, 'min');
    ajouter('cadresMin', pli, part(c.cadres, c.campsAFeuille), seuils.cadresMin, 'min');
    ajouter('cartonsMin', pli, part(c.matchsCartons, c.eligibles), seuils.cartonsMin, 'min');
    ajouter('passesMin', pli, part(c.passes, c.campsAFeuille), seuils.passesMin, 'min');
    ajouter('baseLambdaMin', pli, part(c.baseLambda, c.eligibles), seuils.baseLambdaMin, 'min');
    // La base S comptée sur la fenêtre où les tirs cadrés sont JUGÉS (DEBUT_DES_CADRES_JUGES ; le seuil reste 80 %).
    ajouter('baseCadresMin', pli, part(c.baseCadresJuges, c.eligiblesCadresJuges), seuils.baseCadresMin, 'min');
    ajouter('baseCartonsMin', pli, part(c.baseCartons, c.matchsCartons), seuils.baseCartonsMin, 'min');
  }
  // La règle P PAR ANNÉE (critique, constat 14) : années des plis (2023 à 2026).
  const annees = [...new Set(Object.keys(reglePAn).map((k) => k.split('|')[0]))].sort();
  for (const an of annees) {
    const g = (cas) => reglePAn[`${an}|${cas}`] ?? { lignes: 0, avecPenalty: 0 };
    const c2 = g('2-absent-multiple');
    const c1 = g('1-ecart-penalty');
    const z0 = [g('1-ecart-0'), g('3-absent-petit')].reduce((s, x) => ({ lignes: s.lignes + x.lignes, avecPenalty: s.avecPenalty + x.avecPenalty }), { lignes: 0, avecPenalty: 0 });
    const tous = Object.entries(reglePAn).filter(([k]) => k.startsWith(`${an}|`) && !k.endsWith('0-sans-xg')).reduce((s, [, x]) => s + x.lignes, 0);
    if (c2.lignes) ajouter('reglePCas2Min', an, part(c2.avecPenalty, c2.lignes), seuils.reglePCas2Min, 'min');
    if (c1.lignes) ajouter('reglePCas1Min', an, part(c1.avecPenalty, c1.lignes), seuils.reglePCas1Min, 'min');
    if (z0.lignes) ajouter('reglePZeroMax', an, part(z0.avecPenalty, z0.lignes), seuils.reglePZeroMax, 'max');
    if (tous) ajouter('reglePInconnuMax', an, part(g('4-inconnu').lignes, tous), seuils.reglePInconnuMax, 'max');
  }
  for (const [an, f] of Object.entries(fauxJoueurs.parAn)) {
    if (an < '2023') continue;
    // 2026 est coupée au 23/09 : sa médiane est ramenée à l'année (2023 commence le 04/01 : entière).
    const facteur = an === '2026' ? 365 / 266 : 1;
    const med = f.mediane * facteur;
    out.push({ id: 'fauxJoueurs', pli: an, valeur: med, seuil: [seuils.fauxMin, seuils.fauxMax], sens: 'entre', casse: med < seuils.fauxMin || med > seuils.fauxMax });
  }
  return out;
}
