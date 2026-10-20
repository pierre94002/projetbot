/**
 * suiviParis.js — l'écran du SUIVI DES PARIS (étape 11 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * Ce que dessinent les composants de Performance paris, à partir de ce que
 * calcule le serveur (GET /api/bets/suivi, server/src/data/suiviParis.js) :
 * la géométrie des courbes « gagné » et « attendu », la bande de la zone
 * normale des séries de pertes, et les cases des tableaux (lignes, TOTAL Σ et
 * MOYENNE ⌀ par pari — jamais une somme de pourcentages). Aucun calcul de
 * pari n'est refait ici : on met en forme.
 * JavaScript pur : ni Vue, ni navigateur, ni réseau (testé par
 * server/test/suiviParis.test.mjs).
 * -----------------------------------------------------------------------
 */

import { euros, jourDit } from './gardeFous.js';

const nombre = (x) => typeof x === 'number' && Number.isFinite(x);
const signe = (x) => (x > 0 ? '+' : x < 0 ? '−' : '');

// ---------------------------------------------------------------- formats

/** « +12,50 € », « −3 € », « 0 € » ; « — » sans valeur. */
export function eurosSignes(x) {
  if (!nombre(x)) return '—';
  const r = Math.round(x * 100) / 100;
  return `${signe(r)}${euros(Math.abs(r))}`;
}
/** « +12,9 % » (une décimale par défaut) ; « — » sans valeur. */
export function pourcentSigne(x, decimales = 1) {
  if (!nombre(x)) return '—';
  const facteur = 10 ** decimales;
  const r = Math.round(x * facteur) / facteur;
  return `${signe(r)}${Math.abs(r).toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} %`;
}
/** « 58 % » ; « — » sans valeur. */
export function pourcent(x, decimales = 0) {
  if (!nombre(x)) return '—';
  return `${x.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} %`;
}
/** « 1,85 » ; « — » sans valeur. */
export const coteDite = (x) => (nombre(x) ? x.toFixed(2).replace('.', ',') : '—');
const compte = (n) => (n ? String(n) : '—');
const pluriel = (n, mot, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`;
export { euros, jourDit };

// ---------------------------------------------------------------- tableaux

/**
 * Les colonnes d'un tableau du suivi, les montants et la qualité d'abord (ce qui se lit sans défiler sur
 * un écran de portable), les comptes par statut ensuite. `pourcent` : jamais sommée ; `moyenne` : se lit
 * seulement par pari.
 */
export const COLONNES_SUIVI = Object.freeze([
  Object.freeze({ cle: 'paris', libelle: 'Paris', titre: 'Paris de la ligne (tous statuts)' }),
  Object.freeze({ cle: 'mise', libelle: 'Misé', titre: 'Mises des paris réglés (gagnés et perdus)' }),
  Object.freeze({ cle: 'gainReel', libelle: 'Gain réel', titre: 'Gagné : mise × cote − mise ; perdu : − mise' }),
  Object.freeze({ cle: 'roi', libelle: 'ROI', titre: 'Gain réel / misé', pourcent: true }),
  Object.freeze({ cle: 'gainAttendu', libelle: 'Gain attendu', titre: 'Mise × (probabilité du moteur × cote prise − 1), au moment du pari — seulement pour les paris réglés qui ont leur probabilité (« J’ai parié », étape 10)' }),
  Object.freeze({ cle: 'cloture', libelle: 'Valeur de clôture', titre: 'Moyenne de la cote prise × probabilité juste de clôture − 1, sur les paris simples mesurés (et leur nombre)', pourcent: true }),
  Object.freeze({ cle: 'tauxReussite', libelle: 'Réussite', titre: 'Gagnés / (gagnés + perdus)', pourcent: true }),
  Object.freeze({ cle: 'coteMoyenne', libelle: 'Cote moy.', titre: 'Cote moyenne des paris réglés', moyenne: true }),
  Object.freeze({ cle: 'gagnes', libelle: 'Gagnés', titre: 'Paris gagnés' }),
  Object.freeze({ cle: 'perdus', libelle: 'Perdus', titre: 'Paris perdus' }),
  Object.freeze({ cle: 'enAttente', libelle: 'En attente', titre: 'Paris pas encore réglés' }),
  Object.freeze({ cle: 'annules', libelle: 'Annulés', titre: 'Paris annulés (mise rendue)' })
]);

/** Les cases d'une ligne. */
export function cellulesDeLigne(l) {
  return {
    paris: String(l.paris ?? 0),
    gagnes: compte(l.gagnes),
    perdus: compte(l.perdus),
    enAttente: compte(l.enAttente),
    annules: compte(l.annules),
    mise: l.regles ? euros(l.mise) : '—',
    gainReel: l.regles ? eurosSignes(l.gainReel) : '—',
    roi: pourcentSigne(l.roi),
    tauxReussite: pourcent(l.tauxReussite),
    coteMoyenne: coteDite(l.coteMoyenne),
    gainAttendu: l.avecProbabilite ? `${eurosSignes(l.gainAttendu)} · ${pluriel(l.avecProbabilite, 'pari')}` : 'non noté',
    cloture: l.cloture?.n ? `${pourcentSigne(l.cloture.moyenne)} · ${l.cloture.n}` : '—'
  };
}

/** Les cases du TOTAL (Σ) : les comptes et les montants ; jamais un pourcentage ni une cote (une somme n'y veut rien dire). */
export function cellulesDuTotal(t) {
  return {
    paris: String(t?.paris ?? 0),
    gagnes: compte(t?.gagnes),
    perdus: compte(t?.perdus),
    enAttente: compte(t?.enAttente),
    annules: compte(t?.annules),
    mise: t?.regles ? euros(t.mise) : '—',
    gainReel: t?.regles ? eurosSignes(t.gainReel) : '—',
    roi: '—',
    tauxReussite: '—',
    coteMoyenne: '—',
    gainAttendu: t?.avecProbabilite ? `${eurosSignes(t.gainAttendu)} · ${pluriel(t.avecProbabilite, 'pari')}` : 'non noté',
    cloture: t?.clotureN ? `${t.clotureN} mesuré${t.clotureN > 1 ? 's' : ''}` : '—'
  };
}

/** Les cases de la MOYENNE (⌀) par pari : mise, gain, ROI, réussite, cote, valeur de clôture — pondérés par pari. */
export function cellulesDeLaMoyenne(m) {
  return {
    paris: '—',
    gagnes: '—',
    perdus: '—',
    enAttente: '—',
    annules: '—',
    mise: nombre(m?.mise) ? `${euros(m.mise)} / pari` : '—',
    gainReel: nombre(m?.gainReel) ? `${eurosSignes(m.gainReel)} / pari` : '—',
    roi: pourcentSigne(m?.roi),
    tauxReussite: pourcent(m?.tauxReussite),
    coteMoyenne: coteDite(m?.coteMoyenne),
    gainAttendu: nombre(m?.gainAttendu) ? `${eurosSignes(m.gainAttendu)} / pari` : 'non noté',
    cloture: pourcentSigne(m?.cloture)
  };
}

/** Les lignes toujours présentes (les mêmes que le serveur, data/suiviParis.js : un test les compare). */
export const TRANCHES_DE_COTE_ECRAN = Object.freeze(['Moins de 1,50', '1,50 à 1,99', '2,00 à 2,99', '3,00 à 4,99', '5,00 et plus']);
export const NIVEAUX_DE_CONFIANCE_ECRAN = Object.freeze(['Sûr', 'Fragile', 'Pas encore mesurée (étape 38)']);

const ligneVide = (cle, libelle) => ({ cle, libelle, paris: 0, gagnes: 0, perdus: 0, enAttente: 0, annules: 0, regles: 0, mise: 0, retours: 0, gainReel: 0, avecProbabilite: 0, gainAttendu: null, roi: null, tauxReussite: null, coteMoyenne: null, cloture: { n: 0, moyenne: null } });

/**
 * Les cinq tableaux, VIDES, quand le suivi n'a pas pu être lu (serveur à
 * relancer, erreur) : la structure reste à l'écran (règle de Pierre), avec
 * ses lignes fixes, son total et sa moyenne.
 */
export function tableauxVides() {
  const total = { paris: 0, gagnes: 0, perdus: 0, enAttente: 0, annules: 0, regles: 0, mise: 0, retours: 0, gainReel: 0, avecProbabilite: 0, gainAttendu: null, clotureN: 0, roi: null, tauxReussite: null, coteMoyenne: null, cloture: null };
  const moyenne = { parPari: true, mise: null, gainReel: null, gainAttendu: null, gainReelAvecProbabilite: null, roi: null, tauxReussite: null, coteMoyenne: null, cloture: null };
  const t = (cle, titre, colonne, lignes = []) => ({ cle, titre, colonne, note: null, lignes, total: { ...total }, moyenne: { ...moyenne } });
  return [
    t('marche', 'Par marché', 'Marché'),
    t('championnat', 'Par championnat', 'Championnat'),
    t('bookmaker', 'Par bookmaker', 'Bookmaker'),
    t('tranche', 'Par tranche de cote', 'Cote du pari', TRANCHES_DE_COTE_ECRAN.map((l, i) => ligneVide(`tranche-${i}`, l))),
    t('confiance', 'Par confiance', 'Confiance', NIVEAUX_DE_CONFIANCE_ECRAN.map((l, i) => ligneVide(`confiance-${i}`, l)))
  ];
}

/** Le ton d'un montant ou d'un pourcentage signé : gain = positif, perte = négatif, zéro ou rien = neutre. */
export const tonSigne = (x) => (!nombre(x) || Math.round(x * 100) === 0 ? '' : x > 0 ? 'is-positive' : 'is-negative');

// ---------------------------------------------------------------- courbes

/** Des repères ronds (1, 2 ou 5 × 10^k) qui couvrent [min, max]. */
export function reperesRonds(min, max, cible = 4) {
  if (!nombre(min) || !nombre(max)) return [];
  let bas = Math.min(min, max);
  let haut = Math.max(min, max);
  if (bas === haut) {
    bas -= 1;
    haut += 1;
  }
  const brut = (haut - bas) / cible;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 5, 10].map((m) => m * puissance).find((p) => p >= brut - 1e-12);
  const debut = Math.floor(bas / pas) * pas;
  const fin = Math.ceil(haut / pas) * pas;
  const reperes = [];
  for (let k = 0; debut + k * pas <= fin + pas * 1e-9; k++) reperes.push(Math.round((debut + k * pas) / pas) * pas || 0);
  return reperes;
}

/** Les trois courbes, dans l'ordre de la légende. */
export const COURBES = Object.freeze([
  Object.freeze({ cle: 'carnet', libelle: 'Gagné · tout le carnet', aide: 'Le gain réel cumulé de tous les paris réglés : le profit net du carnet.' }),
  Object.freeze({ cle: 'gagne', libelle: 'Gagné · paris avec leur probabilité', aide: 'Le gain réel cumulé des seuls paris qui ont leur probabilité du moment.' }),
  Object.freeze({ cle: 'attendu', libelle: 'Attendu · mêmes paris', aide: 'Le gain attendu cumulé de ces mêmes paris : mise × (probabilité du moteur × cote − 1).' })
]);

/**
 * La géométrie des courbes dans un cadre `largeur` × `hauteur` : un pas par
 * pari réglé (dans l'ordre où ils se sont réglés), départ à 0 avant le
 * premier. « Gagné » et « attendu » des paris qui ont leur probabilité
 * n'existent que si au moins un pari l'a. Plus haut = plus gagné.
 */
export function geometrieDesCourbes(courbe, { largeur = 640, hauteur = 220, marge = 12 } = {}) {
  const points = courbe?.points ?? [];
  if (!points.length) return { vide: true, n: 0, avecProbabilite: false, chemins: {}, reperes: [], zero: null, fin: {}, largeur, hauteur };
  const avecProbabilite = points.some((p) => p.avecProbabilite);
  const series = { carnet: points.map((p) => p.carnet) };
  if (avecProbabilite) {
    series.gagne = points.map((p) => p.gagne);
    series.attendu = points.map((p) => p.attendu);
  }
  const valeurs = [0, ...Object.values(series).flat()];
  const reperes = reperesRonds(Math.min(...valeurs), Math.max(...valeurs));
  const min = Math.min(...valeurs, ...reperes);
  const max = Math.max(...valeurs, ...reperes);
  const etendue = max - min || 1;
  const n = points.length;
  const x = (i) => marge + (i * (largeur - 2 * marge)) / n;
  const y = (v) => marge + ((max - v) * (hauteur - 2 * marge)) / etendue;
  const chemin = (vals) => [0, ...vals].map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return {
    vide: false,
    n,
    avecProbabilite,
    chemins: Object.fromEntries(Object.entries(series).map(([k, v]) => [k, chemin(v)])),
    zero: y(0),
    reperes: reperes.map((v) => ({ valeur: v, y: y(v), pct: (y(v) / hauteur) * 100, texte: eurosSignes(v) })),
    fin: Object.fromEntries(Object.entries(series).map(([k, v]) => [k, v.at(-1)])),
    largeur,
    hauteur
  };
}

/** La phrase de la carte « gagné et attendu » : combien de paris ont leur probabilité, et ce que dit l'écart. */
export function phraseAttendu(attendu) {
  const a = attendu ?? {};
  const regles = a.reglesDuCarnet ?? 0;
  if (!a.parisAvecProbabilite) {
    if (!regles) return "Aucun pari réglé pour l'instant : le gain attendu se calcule pour chaque pari pris avec « J'ai parié » (étape 10), qui note la probabilité du moteur au moment du pari.";
    return `Aucun de vos ${pluriel(regles, 'pari réglé', 'paris réglés')} n'a sa probabilité du moment : elle est notée depuis « J'ai parié » (étape 10). Le gain attendu se calculera pour chaque nouveau pari pris ainsi.`;
  }
  const base = `${pluriel(a.regles, 'pari réglé', 'paris réglés')} sur ${regles} ${a.regles > 1 ? 'ont' : 'a'} leur probabilité du moment`;
  if (!a.regles) return `${pluriel(a.parisAvecProbabilite, 'pari', 'paris')} avec leur probabilité, aucun encore réglé : l'écart entre gagné et attendu se lira à leur règlement.`;
  const ecart = a.ecart;
  const sigma = a.ecartType;
  const lecture = nombre(a.ecartEnEcartsTypes)
    ? Math.abs(a.ecartEnEcartsTypes) <= 1.96
      ? `un écart de ${eurosSignes(ecart)}, dans ce que le hasard donne avec ces cotes et ces mises (±${euros(1.96 * sigma)}, 95 fois sur 100) : la chance l'explique.`
      : `un écart de ${eurosSignes(ecart)}, au-delà de ce que le hasard donne d'habitude (±${euros(1.96 * sigma)}, 95 fois sur 100) : à surveiller.`
    : `un écart de ${eurosSignes(ecart)}.`;
  return `${base} : gagné ${eurosSignes(a.gainReel)}, attendu ${eurosSignes(a.gainAttendu)} — ${lecture}`;
}

// ---------------------------------------------------------------- séries

/**
 * La bande de la zone normale des séries de pertes : de 0 à une échelle qui
 * montre la zone (jusqu'à N), la plus longue série et celle en cours.
 */
export function bandeDesSeries(series) {
  if (!series?.n || series.zone?.jusqua === null || series.zone?.jusqua === undefined) {
    return { etat: 'vide', echelle: 0, zonePct: 0, marqueurs: [], graduations: [] };
  }
  const N = series.zone.jusqua;
  const echelle = Math.max(N + 2, series.enCours + 1, series.plusLongue + 1, 6);
  const pct = (k) => (k / echelle) * 100;
  const pas = echelle <= 12 ? 1 : echelle <= 30 ? 5 : 10;
  return {
    etat: series.horsZone ? 'hors-zone' : 'normale',
    jusqua: N,
    echelle,
    zonePct: pct(N),
    marqueurs: [
      { cle: 'mediane', valeur: series.zone.mediane, pct: pct(series.zone.mediane ?? 0), libelle: `Médiane du hasard : ${series.zone.mediane}` },
      { cle: 'plus-longue', valeur: series.plusLongue, pct: pct(series.plusLongue), libelle: `Plus longue : ${series.plusLongue}` },
      { cle: 'en-cours', valeur: series.enCours, pct: pct(series.enCours), libelle: `En cours : ${series.enCours}` }
    ],
    graduations: Array.from({ length: Math.floor(echelle / pas) + 1 }, (_, i) => ({ k: i * pas, pct: pct(i * pas) }))
  };
}

/** À quelle fréquence le hasard donne une série au moins aussi longue — sans « 100 % » ni « 0 % » trompeurs. */
export function frequenceDite(p) {
  if (!nombre(p)) return 'fréquence inconnue';
  if (p >= 0.995) return 'le hasard en donne une au moins aussi longue presque à coup sûr';
  if (p < 0.005) return 'le hasard en donne une au moins aussi longue moins d’une fois sur 200';
  return `le hasard en donne une au moins aussi longue ${pourcent(p * 100)} du temps`;
}

/** Les phrases de la zone normale. */
export function phrasesDesSeries(series) {
  if (!series?.n) {
    return { zone: 'Aucun pari réglé : la zone normale se calcule dès le premier.', enCours: null, plusLongue: null, sources: null };
  }
  const z = series.zone ?? {};
  const seuil = Math.round((series.seuil ?? 0.95) * 100);
  return {
    zone: `Série de pertes normale jusqu'à ${z.jusqua} : avec les cotes de vos ${series.n} paris réglés, le hasard seul ne fait pas pire ${seuil} fois sur 100 (la moitié du temps, pas plus de ${z.mediane}).`,
    enCours: series.enCours
      ? `Série en cours : ${pluriel(series.enCours, 'perte')} d'affilée depuis le ${jourDit(series.enCoursDepuis)}${series.horsZone ? ' — au-delà de la zone normale.' : '.'}`
      : 'Aucune perte en cours : le dernier pari réglé est gagné.',
    plusLongue: series.plusLongue
      ? `Plus longue série : ${pluriel(series.plusLongue, 'perte')} d'affilée${series.plusLongueDu ? `, ${jourDit(series.plusLongueDu) === jourDit(series.plusLongueAu) ? `le ${jourDit(series.plusLongueDu)}` : `du ${jourDit(series.plusLongueDu)} au ${jourDit(series.plusLongueAu)}`}` : ''}${nombre(series.probaPlusLongue) ? ` (${frequenceDite(series.probaPlusLongue)})` : ''}.`
      : 'Aucun pari perdu.',
    sources: `Probabilité de gagner chaque pari : celle du moteur au moment du pari pour ${pluriel(series.sources?.moteur ?? 0, 'pari')}, celle de la cote prise (1 / cote) pour ${pluriel(series.sources?.cote ?? 0, 'pari')}.`
  };
}

// ---------------------------------------------------------------- le carnet

export const STATUTS = Object.freeze({ won: 'Gagné', lost: 'Perdu', pending: 'En attente', void: 'Annulé' });

/** Ce que dit la valeur de clôture d'un pari du carnet. */
export function clotureDite(c) {
  if (!c) return { texte: '—', titre: 'Valeur de clôture non lue.' };
  if (c.raison === 'indisponible') return { texte: 'indisponible', titre: 'La valeur de clôture n’a pas pu être calculée (base indisponible).' };
  if (nombre(c.valeur)) return { texte: pourcentSigne(c.valeur), titre: 'Cote prise × probabilité juste de clôture − 1' };
  if (c.mesurees) return { texte: `${c.mesurees}/${c.selections} sélection${c.selections > 1 ? 's' : ''}`, titre: 'Combiné : chaque sélection mesurée a sa valeur (Performance paris › Valeur de clôture), pas le ticket entier.' };
  return { texte: 'non mesurée', titre: 'Pas de cote de clôture pour ce marché ou ce match (le détail est dans la carte « Valeur de clôture »).' };
}

/** Ce que dit le gain attendu d'un pari du carnet (`gainAttendu` du serveur : { montant, pourcent, raison }). */
export function gainAttenduDuCarnet(g) {
  if (g && nombre(g.montant)) return `${eurosSignes(g.montant)} (${pourcentSigne(g.pourcent, 2)})`;
  if (g?.raison === 'combine') return 'pas encore (combiné : étape 28)';
  return 'non noté';
}
