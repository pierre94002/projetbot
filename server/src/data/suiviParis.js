/**
 * suiviParis.js — le SUIVI DES PARIS (étape 11 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * Ce que lit la page « Performance paris » (GET /api/bets/suivi), en une fois :
 *
 *   - le GAIN RÉEL, la règle du carnet (betsStore) : gagné = mise × cote −
 *     mise, perdu = − mise, en attente et annulé = rien ; la somme de tous les
 *     paris retombe sur le profit net du carnet (test) ;
 *   - le GAIN ATTENDU au moment du pari, mise × (probabilité du moteur × cote
 *     prise − 1) (betsRepository.gainAttenduDuPari) — SEULEMENT pour un pari
 *     simple dont la probabilité du moteur est notée (« J'ai parié », étape
 *     10) : un pari d'avant n'en a pas, un combiné attend l'étape 28. Le
 *     rapport dit combien l'ont. Gain réel et gain attendu se comparent SUR
 *     LES MÊMES PARIS : l'écart, et l'écart-type que le hasard donne avec ces
 *     probabilités et ces mises, séparent la chance de la méthode ;
 *   - les COURBES dans le temps (paris réglés dans l'ordre où ils se sont
 *     réglés) : gain réel de tout le carnet, gain réel et gain attendu des
 *     paris qui ont leur probabilité ;
 *   - la VALEUR DE CLÔTURE de chaque pari (data/closingValue.js) ;
 *   - les RÉSULTATS par marché, championnat, bookmaker, tranche de cote et
 *     confiance (pas encore mesurée : étape 38) — chaque pari dans UNE ligne
 *     de chaque tableau (un combiné a sa ligne « combinés »), si bien que la
 *     somme d'une colonne retombe sur le carnet ; au pied, le TOTAL (Σ des
 *     comptes et des montants, jamais d'une colonne en %) et la MOYENNE par
 *     pari (mise, gain, ROI, réussite, cote, valeur de clôture) ;
 *   - la ZONE NORMALE des séries de pertes et l'état des GARDE-FOUS
 *     (core/risk/gardeFous.js).
 * `rapportDeSuivi` est pur ; `suiviDesParis` lit le carnet, les réglages, les
 * fiches de comptes et la valeur de clôture. GET seulement : rien n'est écrit.
 * -----------------------------------------------------------------------
 */

import { listBets, gainAttenduDuPari, natureDuPari } from './repositories/betsRepository.js';
import { lireReglageGardeFous } from './repositories/gardeFousRepository.js';
import { lireComptes } from './repositories/comptesBookmakersRepository.js';
import { getEngineConfig } from '../core/engine/engineConfig.js';
import { titreBookmaker, vosBookmakersDe } from '../core/engine/vosBookmakers.js';
import { etatDesGardeFous, gainReelDuPari, instantDeReglement, parisReglesDansLOrdre, probabiliteDeGain, euros, jourDit, REGLAGE_GARDE_FOUS_DEFAUT, LIMITATIONS } from '../core/risk/gardeFous.js';

const ratio = (a, b) => (b > 0 ? a / b : null);
const enPourcent = (x) => (x === null ? null : x * 100);

/** Les marchés, en mots (marketId du moteur et de la saisie express). */
export const LIBELLES_MARCHES = Object.freeze({
  result: 'Résultat (1 / N / 2)',
  totalGoals: 'Total de buts',
  teamGoals: 'Buts d’une équipe',
  bothTeamsScore: 'Les deux équipes marquent',
  resultAndTotal: 'Résultat + total de buts',
  totalCorners: 'Total de corners',
  teamCorners: 'Corners d’une équipe',
  totalShots: 'Total de tirs',
  teamShots: 'Tirs d’une équipe',
  totalShotsOnTarget: 'Total de tirs cadrés',
  teamShotsOnTarget: 'Tirs cadrés d’une équipe',
  totalCards: 'Total de cartons',
  teamCards: 'Cartons d’une équipe',
  anytimeScorer: 'Buteur'
});

/** Les tranches de cote (cote du pari, celle du ticket pour un combiné), toujours toutes affichées. */
export const TRANCHES_DE_COTE = Object.freeze([
  Object.freeze({ cle: 'moins-1-50', libelle: 'Moins de 1,50', min: 1, max: 1.5 }),
  Object.freeze({ cle: '1-50-1-99', libelle: '1,50 à 1,99', min: 1.5, max: 2 }),
  Object.freeze({ cle: '2-00-2-99', libelle: '2,00 à 2,99', min: 2, max: 3 }),
  Object.freeze({ cle: '3-00-4-99', libelle: '3,00 à 4,99', min: 3, max: 5 }),
  Object.freeze({ cle: '5-00-et-plus', libelle: '5,00 et plus', min: 5, max: Infinity })
]);

/** La confiance (« sûr » / « fragile ») : pas encore mesurée avant l'étape 38 — ses trois lignes sont là, la troisième porte tout. */
export const NIVEAUX_DE_CONFIANCE = Object.freeze([
  Object.freeze({ cle: 'sur', libelle: 'Sûr' }),
  Object.freeze({ cle: 'fragile', libelle: 'Fragile' }),
  Object.freeze({ cle: 'non-mesuree', libelle: 'Pas encore mesurée (étape 38)' })
]);

const NON_NOTE_BOOKMAKER = 'Bookmaker non noté (pari d’avant « J’ai parié »)';

// ---------------------------------------------------------- un pari, ses clés

const ligneDuPari = (leg) => {
  const l = Number(leg?.params?.line);
  return Number.isFinite(l) ? l : null;
};
const ligneDite = (l) => l.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

/** Le marché d'un pari : celui de sa sélection (et sa ligne) ; un combiné a le sien. */
export function marcheDuPari(bet) {
  const legs = bet?.legs ?? [];
  const nature = bet?.nature ?? natureDuPari(legs);
  if (nature === 'combine') return { cle: 'combine', libelle: 'Combinés de plusieurs matchs' };
  if (nature === 'combine-meme-match') return { cle: 'combine-meme-match', libelle: 'Combinés du même match' };
  const leg = legs[0] ?? {};
  const ligne = ligneDuPari(leg);
  const base = leg.marketId ? (LIBELLES_MARCHES[leg.marketId] ?? leg.market ?? leg.marketId) : (leg.market ?? 'Marché non noté');
  return { cle: `${leg.marketId ?? `texte:${leg.market ?? ''}`}|${ligne ?? ''}`, libelle: ligne === null ? base : `${base} (${ligneDite(ligne)})` };
}

/** Le championnat d'un pari : celui de ses sélections, s'il n'y en a qu'un. */
export function championnatDuPari(bet) {
  const ligues = [...new Set((bet?.legs ?? []).map((l) => l.league ?? null))];
  if (ligues.length > 1) return { cle: 'plusieurs', libelle: 'Plusieurs championnats (combinés)' };
  return ligues[0] ? { cle: `ligue:${ligues[0]}`, libelle: ligues[0] } : { cle: 'non-note', libelle: 'Championnat non noté' };
}

/** Le bookmaker d'un pari (« J'ai parié ») ; un pari d'avant n'en a pas. */
export function bookmakerDuPari(bet) {
  const cle = bet?.bookmaker ?? (bet?.legs ?? []).find((l) => l.bookmaker)?.bookmaker ?? null;
  if (!cle) return { cle: 'non-note', libelle: NON_NOTE_BOOKMAKER, bookmaker: null };
  const titre = bet.bookmakerTitle ?? (bet.legs ?? []).find((l) => l.bookmaker === cle)?.bookmakerTitle ?? titreBookmaker(cle);
  return { cle, libelle: titre, bookmaker: cle };
}

export function trancheDuPari(bet) {
  const cote = Number(bet?.odds);
  return TRANCHES_DE_COTE.find((t) => cote >= t.min && cote < t.max) ?? TRANCHES_DE_COTE[0];
}

const confianceDuPari = (bet) => NIVEAUX_DE_CONFIANCE.find((n) => n.cle === bet?.confiance) ?? NIVEAUX_DE_CONFIANCE[2];

// ------------------------------------------------------- les lignes d'un tableau

function nouvelleLigne(cle, libelle) {
  return { cle, libelle, paris: 0, gagnes: 0, perdus: 0, enAttente: 0, annules: 0, mise: 0, retours: 0, gainReel: 0, avecProbabilite: 0, gainAttendu: 0, gainReelAvecProbabilite: 0, sommeCotes: 0, clotureN: 0, clotureSomme: 0 };
}

function ajouter(l, p) {
  l.paris += 1;
  if (p.status === 'won') l.gagnes += 1;
  else if (p.status === 'lost') l.perdus += 1;
  else if (p.status === 'void') l.annules += 1;
  else l.enAttente += 1;
  if (p.gainReel !== null) {
    l.mise += p.stake;
    if (p.status === 'won') l.retours += p.stake * p.odds;
    l.gainReel += p.gainReel;
    l.sommeCotes += p.odds;
    if (p.attendu !== null) {
      l.avecProbabilite += 1;
      l.gainAttendu += p.attendu;
      l.gainReelAvecProbabilite += p.gainReel;
    }
  }
  if (p.cloture !== null) {
    l.clotureN += 1;
    l.clotureSomme += p.cloture;
  }
}

/** Une ligne, avec ses taux — calculés sur SES sommes (jamais une moyenne de taux). */
function finir(l) {
  const regles = l.gagnes + l.perdus;
  return {
    cle: l.cle,
    libelle: l.libelle,
    paris: l.paris,
    gagnes: l.gagnes,
    perdus: l.perdus,
    enAttente: l.enAttente,
    annules: l.annules,
    regles,
    mise: l.mise,
    retours: l.retours,
    gainReel: l.gainReel,
    avecProbabilite: l.avecProbabilite,
    gainAttendu: l.avecProbabilite ? l.gainAttendu : null,
    gainReelAvecProbabilite: l.avecProbabilite ? l.gainReelAvecProbabilite : null,
    roi: enPourcent(ratio(l.gainReel, l.mise)),
    tauxReussite: enPourcent(ratio(l.gagnes, regles)),
    coteMoyenne: ratio(l.sommeCotes, regles),
    cloture: { n: l.clotureN, moyenne: ratio(l.clotureSomme, l.clotureN) }
  };
}

/**
 * Le pied d'un tableau. TOTAL (Σ) : les comptes et les montants ; jamais une
 * colonne en % ni une cote (null). MOYENNE (⌀) par pari : mise, gain réel,
 * gain attendu (par pari qui l'a), ROI, réussite, cote, valeur de clôture —
 * pondérée par pari, jamais la moyenne des taux des lignes.
 */
function pied(brutes) {
  const s = brutes.reduce((t, l) => {
    for (const k of ['paris', 'gagnes', 'perdus', 'enAttente', 'annules', 'mise', 'retours', 'gainReel', 'avecProbabilite', 'gainAttendu', 'gainReelAvecProbabilite', 'sommeCotes', 'clotureN', 'clotureSomme']) t[k] += l[k];
    return t;
  }, nouvelleLigne('total', 'Total'));
  const regles = s.gagnes + s.perdus;
  return {
    total: {
      paris: s.paris,
      gagnes: s.gagnes,
      perdus: s.perdus,
      enAttente: s.enAttente,
      annules: s.annules,
      regles,
      mise: s.mise,
      retours: s.retours,
      gainReel: s.gainReel,
      avecProbabilite: s.avecProbabilite,
      gainAttendu: s.avecProbabilite ? s.gainAttendu : null,
      gainReelAvecProbabilite: s.avecProbabilite ? s.gainReelAvecProbabilite : null,
      clotureN: s.clotureN,
      // Jamais de somme de pourcentages ni de cotes.
      roi: null,
      tauxReussite: null,
      coteMoyenne: null,
      cloture: null
    },
    moyenne: {
      parPari: true,
      mise: ratio(s.mise, regles),
      gainReel: ratio(s.gainReel, regles),
      gainAttendu: ratio(s.gainAttendu, s.avecProbabilite),
      gainReelAvecProbabilite: ratio(s.gainReelAvecProbabilite, s.avecProbabilite),
      roi: enPourcent(ratio(s.gainReel, s.mise)),
      tauxReussite: enPourcent(ratio(s.gagnes, regles)),
      coteMoyenne: ratio(s.sommeCotes, regles),
      cloture: ratio(s.clotureSomme, s.clotureN)
    }
  };
}

/**
 * Un tableau : `fixes` (lignes toujours là, même vides), puis les autres dans
 * l'ordre du nombre de paris ; chaque pari dans UNE ligne.
 */
function tableau({ cle, titre, colonne, note, infos, cleDe, fixes = [] }) {
  const lignes = new Map(fixes.map((f) => [f.cle, nouvelleLigne(f.cle, f.libelle)]));
  for (const p of infos) {
    const g = cleDe(p.bet);
    if (!lignes.has(g.cle)) lignes.set(g.cle, nouvelleLigne(g.cle, g.libelle));
    ajouter(lignes.get(g.cle), p);
  }
  const fixesCles = new Set(fixes.map((f) => f.cle));
  const brutes = [...lignes.values()];
  const ordonnees = [...brutes.filter((l) => fixesCles.has(l.cle)), ...brutes.filter((l) => !fixesCles.has(l.cle)).sort((a, b) => b.paris - a.paris || a.libelle.localeCompare(b.libelle, 'fr'))];
  return { cle, titre, colonne, note, lignes: ordonnees.map(finir), ...pied(brutes) };
}

// --------------------------------------------------------- valeur de clôture

/**
 * La valeur de clôture de chaque pari, à partir des mesures de closingValue.js
 * (une par sélection, `id` = « <pari>#<rang> ») : pour un pari simple, sa valeur
 * à la clôture (cote prise × probabilité de clôture − 1) ; un combiné garde
 * celle de chaque sélection mesurée, sans valeur d'ensemble.
 */
function clotureParPari(mesures = []) {
  const parPari = new Map();
  for (const m of mesures) {
    const [betId, rang] = String(m.id ?? '').split('#');
    if (!betId) continue;
    if (!parPari.has(betId)) parPari.set(betId, []);
    parPari.get(betId).push({ rang: Number(rang), valeur: m.valueAtClosePct ?? null, mouvement: m.clvPct ?? null, marche: m.marketLabel ?? null, approx: m.approx ?? null, sources: m.sources ?? [] });
  }
  return parPari;
}

// ------------------------------------------------------------ le rapport

/** Ce qu'on signale d'un pari du carnet, face au réglage et aux fiches ACTUELS (jamais un refus). */
function signauxDuPari(bet, { reglage, comptes }) {
  const signaux = [];
  const mise = Number(bet.stake);
  if (reglage?.miseMaxParPari !== null && reglage?.miseMaxParPari !== undefined && mise > reglage.miseMaxParPari) {
    signaux.push({ code: 'mise-max-depassee', texte: `Mise au-delà de votre mise maximale actuelle (${euros(reglage.miseMaxParPari)}).` });
  }
  const b = bookmakerDuPari(bet);
  const fiche = b.bookmaker ? comptes?.[b.bookmaker] : null;
  if (fiche && Number.isFinite(fiche.miseMaxAcceptee) && mise > fiche.miseMaxAcceptee) {
    signaux.push({ code: 'mise-acceptee-depassee', texte: `Mise au-delà de la mise acceptée connue chez ${b.libelle} (${euros(fiche.miseMaxAcceptee)}, fiche du ${jourDit(fiche.majLe)}).` });
  }
  if (fiche?.limitation === 'ferme' && bet.status === 'pending') {
    signaux.push({ code: 'compte-ferme', texte: `Pari en attente chez ${b.libelle}, compte noté fermé (fiche du ${jourDit(fiche.majLe)}).` });
  }
  return signaux;
}

/**
 * Le rapport de suivi (pur).
 * @param {object} p
 * @param {object[]} p.paris          le carnet (listBets)
 * @param {object} p.reglage          les garde-fous { miseMaxParPari, perteMaxParSemaine }
 * @param {object} p.comptes          les fiches { [cle]: { soldeDeclare, miseMaxAcceptee, limitation, majLe } }
 * @param {string[]} p.vosBookmakers  vos bookmakers (Réglages), toujours une ligne chacun
 * @param {object|null} p.cloture     { disponible, raison?, mesures, manques, calculeLe, sur, mesurees }
 * @param {number} p.maintenant
 */
export function rapportDeSuivi({ paris = [], reglage = REGLAGE_GARDE_FOUS_DEFAUT, comptes = {}, vosBookmakers = [], cloture = null, maintenant = Date.now() } = {}) {
  const parPari = clotureParPari(cloture?.mesures ?? []);
  const infos = paris.map((bet) => {
    const gainReel = gainReelDuPari(bet);
    const ga = gainAttenduDuPari(bet);
    const mesures = parPari.get(bet.id) ?? [];
    const simple = (bet.legs ?? []).length === 1;
    const valeurCloture = simple && mesures.length && Number.isFinite(mesures[0].valeur) ? mesures[0].valeur : null;
    return { bet, status: bet.status, stake: Number(bet.stake), odds: Number(bet.odds), gainReel, attendu: Number.isFinite(ga.montant) ? ga.montant : null, ga, mesures, cloture: valeurCloture };
  });

  // ---------------------------------------------------------------- le carnet
  const regles = infos.filter((p) => p.gainReel !== null);
  const carnetLigne = nouvelleLigne('carnet', 'Carnet');
  for (const p of infos) ajouter(carnetLigne, p);
  const carnet = finir(carnetLigne);

  // ---------------------------------------------------------- gain attendu
  const avecP = regles.filter((p) => p.attendu !== null);
  const variance = avecP.reduce((s, p) => {
    // Étape 28 : la probabilité du PARI — celle du combiné quand son prix juste est noté, sinon celle de sa sélection.
    const pr = typeof p.bet.probabiliteCombine === 'number' ? p.bet.probabiliteCombine : p.bet.legs[0].probabiliteMoteur;
    return s + p.stake * p.stake * p.odds * p.odds * pr * (1 - pr);
  }, 0);
  const sigma = avecP.length ? Math.sqrt(variance) : null;
  const gainAttendu = avecP.reduce((s, p) => s + p.attendu, 0);
  const gainReelMemes = avecP.reduce((s, p) => s + p.gainReel, 0);
  const enAttenteAvecP = infos.filter((p) => p.status === 'pending' && p.attendu !== null);
  const attendu = {
    parisAvecProbabilite: infos.filter((p) => p.attendu !== null).length,
    regles: avecP.length,
    reglesDuCarnet: regles.length,
    gainAttendu: avecP.length ? gainAttendu : null,
    gainReel: avecP.length ? gainReelMemes : null,
    ecart: avecP.length ? gainReelMemes - gainAttendu : null,
    ecartType: sigma,
    ecartEnEcartsTypes: sigma ? (gainReelMemes - gainAttendu) / sigma : null,
    zone95: sigma ? [gainAttendu - 1.96 * sigma, gainAttendu + 1.96 * sigma] : null,
    enAttente: { paris: enAttenteAvecP.length, gainAttendu: enAttenteAvecP.length ? enAttenteAvecP.reduce((s, p) => s + p.attendu, 0) : null },
    sansProbabilite: {
      nonNote: infos.filter((p) => p.ga.raison === 'non-note').length,
      combines: infos.filter((p) => p.ga.raison === 'combine').length
    }
  };

  // ------------------------------------------------------------- les courbes
  const ordre = parisReglesDansLOrdre(paris);
  const info = new Map(infos.map((p) => [p.bet.id, p]));
  let cumulCarnet = 0;
  let cumulMemes = 0;
  let cumulAttendu = 0;
  const points = ordre.map((bet, i) => {
    const p = info.get(bet.id);
    cumulCarnet += p.gainReel;
    if (p.attendu !== null) {
      cumulMemes += p.gainReel;
      cumulAttendu += p.attendu;
    }
    // Une date illisible (carnet modifié à la main) ne casse pas le suivi : le point garde sa place, sans heure.
    const t = instantDeReglement(bet);
    return { rang: i + 1, id: bet.id, t: Number.isFinite(t) ? new Date(t).toISOString() : null, carnet: cumulCarnet, avecProbabilite: p.attendu !== null, gagne: cumulMemes, attendu: cumulAttendu };
  });

  // ----------------------------------------------------------- les tableaux
  const autresLivres = [...new Set(infos.map((p) => bookmakerDuPari(p.bet)).filter((b) => b.bookmaker && !vosBookmakers.includes(b.bookmaker)).map((b) => b.bookmaker))];
  const tableaux = [
    tableau({ cle: 'marche', titre: 'Par marché', colonne: 'Marché', note: 'Un pari simple compte pour son marché (et sa ligne) ; un combiné pour la ligne « combinés ».', infos, cleDe: marcheDuPari }),
    tableau({ cle: 'championnat', titre: 'Par championnat', colonne: 'Championnat', note: 'Un combiné de plusieurs championnats compte pour sa propre ligne.', infos, cleDe: championnatDuPari }),
    tableau({
      cle: 'bookmaker',
      titre: 'Par bookmaker',
      colonne: 'Bookmaker',
      note: 'Le bookmaker est noté depuis « J’ai parié » (étape 10) : les paris d’avant sont dans « non noté ».',
      infos,
      cleDe: bookmakerDuPari,
      fixes: [...vosBookmakers, ...autresLivres].map((cle) => ({ cle, libelle: titreBookmaker(cle) }))
    }),
    tableau({ cle: 'tranche', titre: 'Par tranche de cote', colonne: 'Cote du pari', note: 'La cote prise (celle du ticket pour un combiné).', infos, cleDe: trancheDuPari, fixes: TRANCHES_DE_COTE }),
    tableau({ cle: 'confiance', titre: 'Par confiance', colonne: 'Confiance', note: 'La confiance « sûr / fragile » n’est pas encore mesurée (étape 38) : tous les paris sont dans la dernière ligne.', infos, cleDe: confianceDuPari, fixes: NIVEAUX_DE_CONFIANCE })
  ];

  // --------------------------------------------------- les garde-fous et séries
  const etat = etatDesGardeFous({ paris, reglage, maintenant });

  // ------------------------------------------------------ le pari par pari
  const carnetDetaille = infos
    .map((p) => {
      const b = bookmakerDuPari(p.bet);
      const pg = probabiliteDeGain(p.bet);
      const legs = p.bet.legs ?? [];
      return {
        id: p.bet.id,
        createdAt: p.bet.createdAt,
        settledAt: p.bet.settledAt ?? null,
        status: p.bet.status,
        nature: p.bet.nature ?? natureDuPari(legs),
        stake: p.stake,
        odds: p.odds,
        bookmaker: b.bookmaker,
        bookmakerTitle: b.bookmaker ? b.libelle : null,
        marche: marcheDuPari(p.bet).libelle,
        selections: legs.map((l) => ({
          homeName: l.homeName ?? null,
          awayName: l.awayName ?? null,
          league: l.league ?? null,
          market: l.market ?? null,
          pick: l.pick ?? null,
          odds: Number(l.odds) || null,
          status: l.status ?? (legs.length === 1 ? p.bet.status : 'pending'),
          probabiliteMoteur: typeof l.probabiliteMoteur === 'number' ? l.probabiliteMoteur : null
        })),
        gainReel: p.gainReel,
        gainAttendu: p.ga,
        probabiliteDeGain: pg,
        cloture: {
          valeur: p.cloture,
          mesurees: p.mesures.length,
          selections: legs.length,
          mesures: p.mesures,
          raison: !cloture?.disponible ? 'indisponible' : p.mesures.length ? null : 'non-mesuree'
        },
        signaux: signauxDuPari(p.bet, { reglage, comptes })
      };
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const simplesMesures = infos.filter((p) => p.cloture !== null);
  return {
    version: 1,
    calculeLe: new Date(maintenant).toISOString(),
    carnet,
    attendu,
    courbe: { points, debut: points[0]?.t ?? null, fin: points.at(-1)?.t ?? null, avecProbabilite: avecP.length },
    cloture: {
      disponible: Boolean(cloture?.disponible),
      raison: cloture?.raison ?? null,
      calculeLe: cloture?.calculeLe ?? null,
      selections: cloture?.sur ?? null,
      selectionsMesurees: cloture?.mesurees ?? null,
      parisSimplesMesures: simplesMesures.length,
      moyenne: ratio(simplesMesures.reduce((s, p) => s + p.cloture, 0), simplesMesures.length),
      positifs: simplesMesures.filter((p) => p.cloture > 0).length,
      manques: cloture?.manques ?? []
    },
    tableaux,
    series: etat.series,
    gardeFous: { ...etat, series: undefined },
    comptes: Object.fromEntries(Object.entries(comptes).map(([cle, f]) => [cle, { ...f, titre: titreBookmaker(cle), limitationDite: LIMITATIONS[f.limitation] ?? f.limitation }])),
    paris: carnetDetaille
  };
}

/**
 * Le suivi, lu sur disque : le carnet (illisible : l'erreur remonte, jamais un
 * carnet vide), les garde-fous et les fiches (illisibles : dit, le reste
 * s'affiche), la valeur de clôture (sa base indisponible : dite aussi).
 */
export async function suiviDesParis({ maintenant = Date.now() } = {}) {
  const paris = listBets();
  const problemes = {};
  let reglage = REGLAGE_GARDE_FOUS_DEFAUT;
  try {
    reglage = lireReglageGardeFous().reglage;
  } catch (error) {
    problemes.reglage = error.message;
  }
  let comptes = {};
  try {
    comptes = lireComptes().comptes;
  } catch (error) {
    problemes.comptes = error.message;
  }
  let cloture;
  try {
    const { closingValueReport } = await import('./closingValue.js');
    const r = await closingValueReport({ scope: 'bets' });
    cloture = { disponible: true, mesures: r.toutesLesMesures ?? r.entries ?? [], manques: r.missing ?? [], calculeLe: r.generatedAt ?? null, sur: r.totalEntries ?? null, mesurees: r.measured ?? null };
  } catch (error) {
    cloture = { disponible: false, raison: error.message, mesures: [], manques: [] };
  }
  const vos = vosBookmakersDe(getEngineConfig('football'));
  return { ...rapportDeSuivi({ paris, reglage, comptes, vosBookmakers: vos, cloture, maintenant }), problemes };
}
