/**
 * bancDeLaMise.js — LE BANC DE LA MISE (étape 39 « La mise juste », lot 1b, 09/11/2026), dans le BAC À SABLE. PUR : ne lit
 * ni fichier, ni base, ni horloge ; le hasard est SEMÉ (graine 39, le générateur du juge) ; tout entre par les arguments.
 * -----------------------------------------------------------------------
 * LA MATIÈRE : les 555 paris 1N2 du moteur en service sur P2 (2019-07 → 2023-06), cotes football-data d'avant match,
 * exportés par scripts/bench.mjs --lignes (lignes « pari », règle « moteur ») ; leur mise (miseKelly) est en euros sur la base
 * de 1 000 € du banc. Aucun pari de Pierre n'est lu, ni son capital : le banc ne connaît que cette base.
 *
 * CE QU'IL JUGE (K = 3, déclarés avant le regard dans VARIANTES_DE_L_ETAPE_39) — la FORME, jamais le NIVEAU :
 *   mise-v1        la définition (1/8 de Kelly plafonné à 2 %) : sur P2 c'est le service, son verdict EST l'étalonnage ;
 *   forme-kelly    1/8 de Kelly face à la mise plate de même moyenne (cette moyenne calculée sans issue) ;
 *   placebo-forme  les mises de 1/8 permutées dans le mois civil, face à la même plate : il ne doit jamais sortir
 *                  « retenu » (un « moins bon » est RAPPORTÉ, sans annuler le passage : la fenêtre vue déclarée, FENETRE_VUE).
 * J1 (il décide) : la croissance attendue à la clôture g(f) = q·ln(1 + f·(c − 1)) + (1 − q)·ln(1 − f), q = la probabilité
 * de clôture du pari ; J2 (il qualifie) : le log-rendement réalisé ln(1 + f·R). Le juge est comparer (bench/guard.js), mode
 * « moyenne », sens « max », blocs « date|championnat », graine 39, 1 000 tirages, 200 blocs au moins, K = 3 (z ≈ 2,394).
 * LA GARDE D'UTILITÉ : la valeur de clôture par bande d'avantage est LUE dans la note de la 38 (jamais recalculée ici) ;
 * « confirmé » seulement si J1 dit « retenu », si J2 ne dit pas « moins bon » et si aucune bande d'avantage de 10 % et plus
 * n'est « moins bonne » que 0. Une note qui ne porte pas ces bandes rend la garde ILLISIBLE : jamais « confirmé ».
 *
 * CE QU'IL RAPPORTE (jamais un verdict) : quatre mondes (clôture, moteur, zéro, réel), six règles (1/16, 1/8, 1/4, la plate
 * de même moyenne, la plate à 1 %, 1/8 × ρ̂) : capital final, creux, pire série, temps sous le plus haut, part des chemins
 * en perte — le capital est COMPOSÉ (les mises d'un jour posées sur le capital du matin), jamais additionné sur un capital
 * fixe ; ρ̂ ; les paris plafonnés ; la zone des creux pour un HORIZON dit (555, 1 110 et 1 665 paris), les fausses coupures
 * et le délai de détection d'une panne ; la corrélation du même jour × championnat ; les jours où la somme des mises dépasse
 * 4, 6 et 8 % du capital.
 *
 * LES COMPTES (avant le regard) ne lisent ni issue ni clôture : la date, le championnat, la cote et l'avantage seulement.
 * Aucun processus à part : le banc lit un fichier de 555 paris et tourne dans le script (scripts/etape39.mjs).
 * -----------------------------------------------------------------------
 */

import { comparer, generateur, zPour } from '../../bench/guard.js';
import { seriesDuCarnet, zoneNormaleDesSeries } from '../../core/risk/seriesDePertes.js';
import { partDeMise } from './regleDeMise.js';

/** Le format de la sortie du passage (et de la note recopiée). */
export const VERSION_DU_BANC = 1;

/** La base du banc (bench/entrees.js, BANKROLL_DU_BANC = 1 000) : les mises de l'export sont des euros sur 1 000 €. */
export const BASE_DU_BANC = 1000;

/** Le réglage de service (1/8 de Kelly, plafond 2 %), relu dans l'en-tête de l'export : vérifié, jamais choisi ici. */
export const REGLAGE_DU_SERVICE = Object.freeze({ kellyFraction: 0.125, maxStakePercent: 0.02 });

/** Le juge, fixé avant le regard (conception §2.3). */
export const JUGE = Object.freeze({ K: 3, alpha: 0.05, graine: 39, tirages: 1000, minBlocs: 200 });

/** Les trois variantes jugées (les identifiants de VARIANTES_DE_L_ETAPE_39, dans cet ordre ; un test vérifie l'égalité). */
export const VARIANTES_JUGEES = Object.freeze(['mise-v1', 'forme-kelly', 'placebo-forme']);

/** L'étalonnage attendu : le rejeu de P2 du banc en service (conception §2.2). Un écart arrête tout. */
export const ATTENDU = Object.freeze({ paris: 555, vcMoyenne: 0.0466, pireSerie: 9, zone: 15 });

/** Les horizons de la zone des creux (en paris) ; 2 775 pour les fausses coupures seulement. */
export const HORIZONS = Object.freeze([555, 1110, 1665]);
export const HORIZON_LONG = 2775;

/** Les plafonds du jour comptés (jamais appliqués : combien de jours ils auraient mordu). */
export const SEUILS_DU_JOUR = Object.freeze([0.04, 0.06, 0.08]);

/** Un placebo dont la permutation garde plus de la moitié des mises est refusé (dans la journée, 71 % les garderaient). */
export const PART_MAX_GARDEE = 0.5;

/** La bande haute de la garde d'utilité : les bandes d'avantage qui commencent à 10 % ou plus. */
export const BANDE_HAUTE = 0.1;

/** La panne du délai de détection : la valeur de clôture tombe à −5 % à partir du 301e pari, sur 1 110 paris. */
export const PANNE = Object.freeze({ auPari: 300, vc: -0.05, horizon: 1110 });

/**
 * LE SCELLEMENT AVANT LA NOTE DE LA 38 (conception §2.5, T-B11) : K, v1, la plate et le placebo sont fixés par la
 * conception du 03/11/2026, écrite avant le passage unique du banc de la 38 (04/11/2026 vers 2 h 35) ; les règles du banc
 * la citent (sha1 et date), le passage refuse des règles qui ne la citent pas ou une date qui ne la précède pas.
 */
export const SCELLEMENT = Object.freeze({
  conception: Object.freeze({ fichier: 'scratchpad/etape39/conception.md', sha1: 'c74c0cbb6c9fdd4c836bbc7ecbeb2707d7503741', ecriteLe: '2026-11-03T18:10:13Z' })
});

/**
 * LA FENÊTRE VUE DÉCLARÉE (decisions-orchestrateur.md, point 9, le 09/11/2026 vers 22 h 40, heure de Paris) : la règle de
 * choix a changé APRÈS la lecture de la note de la 38 — seul un placebo « retenu » rend les règles fautives ; un placebo
 * « moins bon » est rapporté. Déclarée dans les règles (sous scellement), dans la sortie du passage et dans la note (recopiée
 * par script), et dans etat.md. bench/lancements.js n'en change pas : ses vues sont des fenêtres de données.
 */
export const FENETRE_VUE = Object.freeze({
  le: '2026-11-09T21:40:00Z',
  par: 'orchestrateur',
  quoi: 'La règle de choix du banc de la mise : seul un placebo « retenu » rend les règles fautives ; un placebo « moins bon » est rapporté dans les raisons de la décision, sans annuler le passage. Décidé le 09/11/2026 vers 22 h 40 (heure de Paris), APRÈS la lecture de la note du banc de la 38 (par l’écrivain à 21 h 20 et vers 22 h ; l’orchestrateur connaît ses verdicts depuis le 04/11) : une fenêtre vue, déclarée.',
  pourquoi: 'Mesuré avant le regard (lot1b/marges-tb2-tb3.json, sha1 f1fb84089cd2e89d8024554ea7def8405cf1f592 ; mondes fabriqués sur les cotes et les avantages des 555 paris, 50 graines) : le côté « retenu » du placebo est réglé (0 sur 50 quand l’avantage ne dit rien comme quand il dit vrai), pas le côté « moins bon » (6 sur 50 sans aucune faute quand l’avantage ne dit rien : le coût en croissance de mises inégales). On ne lit un contrôle que du côté où il est réglé ; la règle de la 35 fait de même ; aucune conclusion n’en devient plus favorable à la forme (au plus « mise égale proposée », contre la règle en service) ; la note de la 38 ne dit rien de la mise.',
  mesure: Object.freeze({ fichier: 'scratchpad/etape39/lot1b/marges-tb2-tb3.json', sha1: 'f1fb84089cd2e89d8024554ea7def8405cf1f592' })
});

/** La raison RAPPORTÉE quand le placebo dit « moins bon » (jamais une annulation du passage). */
export const RAISON_PLACEBO_MOINS_BON = 'le placebo dit « moins bon » : le coût de mises inégales, mesuré avant le regard ; rapporté, il n’annule pas le passage';

/** Les six règles rapportées (jamais jugées), dans l'ordre de la note. */
export const REGLES_RAPPORTEES = Object.freeze(['kelly-1-16', 'mise-v1', 'kelly-1-4', 'plate-meme-moyenne', 'plate-1pc', 'kelly-rho']);

/** Les rapportés hors K que ce lot ne calcule pas, et où ils viennent. */
export const RAPPORTES_HORS_DU_LOT = Object.freeze([
  Object.freeze({ id: 'francais-zero', ou: 'l’ombre P5 de la mise (lot 1c), à son horizon' }),
  Object.freeze({ id: 'francais-demi', ou: 'l’ombre P5 de la mise (lot 1c), à son horizon' }),
  Object.freeze({ id: 'fragile-demi', ou: 'l’ombre P5 de la mise (lot 1c), à son horizon' }),
  Object.freeze({ id: 'fragile-zero', ou: 'l’ombre P5 de la mise (lot 1c), à son horizon' }),
  Object.freeze({ id: 'lies-grille', ou: 'un test de propriété (T-M5, lot 1a) ; P5 après la porte 2 de l’étape 28' })
]);

/** Les champs d'un pari que les comptes peuvent lire (ni issue, ni clôture). */
export const CHAMPS_SANS_ISSUE = Object.freeze(['fixtureKey', 'date', 'league', 'bloc', 'cle', 'issue', 'bookmaker', 'cote', 'coteAffichee', 'coteJuste', 'avantage', 'miseKelly']);

/** Les champs du résultat : jamais lus avant le verrou du passage. */
export const CHAMPS_DU_RESULTAT = Object.freeze(['gagne', 'gain', 'probaCloture', 'livreCloture', 'valeurCloture']);

/** Un refus du banc (horizon absent, placebo trop proche de la règle, variante non déclarée, export étranger…). */
export class BancRefuse extends Error {
  constructor(message) {
    super(message);
    this.name = 'BancRefuse';
  }
}

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const moyenneDe = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const arrondi = (x, d) => (fini(x) ? Number(x.toFixed(d)) : null);

/** L'ordre du carnet : la date, puis la clé du pari (celui de resumeDesParis, bench/simulateBets.js). */
export const ordreDuCarnet = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0);

/** Le centile (rang le plus proche) d'une liste TRIÉE : p dans [0, 1]. */
export function centile(trie, p) {
  if (!trie.length) return null;
  return trie[Math.min(trie.length - 1, Math.max(0, Math.ceil(p * trie.length) - 1))];
}
const trie = (xs) => Float64Array.from(xs).sort();

// ====================================================================================== l'export

/** Un objet qui ne garde que ces champs (les autres ne sont jamais lus). */
const seulement = (objet, champs) => Object.fromEntries(champs.filter((c) => Object.hasOwn(objet, c)).map((c) => [c, objet[c]]));

/**
 * L'en-tête et les paris de l'export (lignes déjà lues, l'en-tête en premier), dans l'ordre du carnet. Refuse un export qui
 * n'est pas celui du banc de la mise : un autre réglage que 1/8 et 2 %, d'autres périodes, prix ou marchés, une ligne de pari
 * d'une autre règle. `sansIssue` : chaque pari réduit aux champs des comptes (CHAMPS_SANS_ISSUE).
 */
export function parisDeLExport(lignes, { sansIssue = false } = {}) {
  const [tete, ...reste] = lignes;
  if (!tete || tete.formatEchange !== 1) throw new BancRefuse('l’en-tête de l’export est illisible (formatEchange 1 attendu).');
  const o = tete.options ?? {};
  const r = o.config?.reglages ?? {};
  if (r.kellyFraction !== REGLAGE_DU_SERVICE.kellyFraction || r.maxStakePercent !== REGLAGE_DU_SERVICE.maxStakePercent) {
    throw new BancRefuse(`l’export n’a pas le réglage de service (1/8 de Kelly, plafond 2 %) : ${JSON.stringify({ kellyFraction: r.kellyFraction, maxStakePercent: r.maxStakePercent })}.`);
  }
  if (JSON.stringify(o.periodes) !== '["P2"]' || JSON.stringify(o.prix) !== '["fd-avant-match"]' || JSON.stringify(o.marches) !== '["result"]') {
    throw new BancRefuse(`l’export n’est pas celui de P2, avant match football-data, 1N2 (${JSON.stringify({ periodes: o.periodes, prix: o.prix, marches: o.marches })}).`);
  }
  const paris = [];
  for (const l of reste) {
    if (l?.type !== 'pari') continue;
    if (l.regle !== 'moteur' || l.prix !== 'fd-avant-match' || l.periode !== 'P2') throw new BancRefuse(`un pari d’une autre règle ou d’un autre prix : ${String(l.cle)}.`);
    paris.push(sansIssue ? seulement(l, CHAMPS_SANS_ISSUE) : l);
  }
  paris.sort(ordreDuCarnet);
  return { moteur: tete.moteur ?? null, reglage: { kellyFraction: r.kellyFraction, maxStakePercent: r.maxStakePercent }, paris };
}

// ==================================================================== les mises et l'étalonnage

/** La part de mise d'un pari selon un réglage (la règle v1 de regleDeMise.js : min(k · ev / (cote − 1), s_max)). */
export const fractionDuPari = (p, reglage = REGLAGE_DU_SERVICE) => partDeMise({ ev: p.avantage, cote: p.cote, reglageMoteur: reglage });

/**
 * L'ÉTALONNAGE DES MISES (T-B1) : pour chaque pari, la reproduction ARRONDIE de miseKelly — `Number((1000 × f).toFixed(2))`,
 * f = la part v1 sur l'avantage (4 décimales) et la cote (3 décimales) du pari, le même ordre d'opérations que
 * core/engine/valueFinder.js. Ne lit que la cote, l'avantage et la mise.
 */
export function etalonnerLesMises(paris) {
  const ecarts = [];
  for (const p of paris) {
    const reproduite = Number((BASE_DU_BANC * fractionDuPari(p)).toFixed(2));
    if (reproduite !== p.miseKelly) ecarts.push({ cle: p.cle, cote: p.cote, avantage: p.avantage, miseKelly: p.miseKelly, reproduite });
  }
  return { n: paris.length, egales: paris.length - ecarts.length, attendu: ATTENDU.paris, ecarts, ok: ecarts.length === 0 && paris.length === ATTENDU.paris };
}

/**
 * L'ÉTALONNAGE DU CARNET (au passage seulement : il lit les issues et les clôtures) : la valeur de clôture moyenne, la pire
 * série et la zone des séries du rejeu de P2 en service (bench/simulateBets.js, resumeDesParis), à l'identique.
 */
export function etalonnerLeCarnet(paris) {
  const tries = [...paris].sort(ordreDuCarnet);
  const avec = tries.filter((p) => fini(p.valeurCloture));
  const vcMoyenne = moyenneDe(avec.map((p) => p.valeurCloture));
  const pireSerie = seriesDuCarnet(tries.map((p) => (p.gagne ? 'won' : 'lost'))).plusLongue;
  const zone = tries.length ? zoneNormaleDesSeries(tries.map((p) => Math.min(1, 1 / p.coteJuste))).jusqua : null;
  const ecarts = [];
  if (tries.length !== ATTENDU.paris) ecarts.push(`paris : ${tries.length} au lieu de ${ATTENDU.paris}`);
  if (!fini(vcMoyenne) || Number(vcMoyenne.toFixed(4)) !== ATTENDU.vcMoyenne) ecarts.push(`valeur de clôture moyenne : ${arrondi(vcMoyenne, 6)} au lieu de ${ATTENDU.vcMoyenne}`);
  if (pireSerie !== ATTENDU.pireSerie) ecarts.push(`pire série : ${pireSerie} au lieu de ${ATTENDU.pireSerie}`);
  if (zone !== ATTENDU.zone) ecarts.push(`zone des séries : ${zone} au lieu de ${ATTENDU.zone}`);
  return { n: tries.length, avecCloture: avec.length, vcMoyenne, pireSerie, zone, ecarts, ok: ecarts.length === 0 };
}

/** L'étalonnage entier (mises + carnet) : un seul écart arrête le passage, rien n'est jugé. */
export function etalonnage(paris) {
  const mises = etalonnerLesMises(paris);
  const carnet = etalonnerLeCarnet(paris);
  const ecarts = [...mises.ecarts.map((e) => `mise ${e.cle} : ${e.miseKelly} dans l’export, ${e.reproduite} refaite`), ...(mises.n === ATTENDU.paris ? [] : [`${mises.n} paris au lieu de ${ATTENDU.paris}`]), ...carnet.ecarts];
  return { mises: { n: mises.n, egales: mises.egales }, carnet: { n: carnet.n, avecCloture: carnet.avecCloture, vcMoyenne: carnet.vcMoyenne, pireSerie: carnet.pireSerie, zone: carnet.zone }, attendu: ATTENDU, ecarts: [...new Set(ecarts)], ok: mises.ok && carnet.ok };
}

// ============================================================================ la plate, le placebo

/** La mise plate de même moyenne : la moyenne des parts v1 — calculée SANS issue (la cote et l'avantage seulement, T-B5). */
export function plateDeMemeMoyenne(paris, reglage = REGLAGE_DU_SERVICE) {
  return moyenneDe(paris.map((p) => fractionDuPari(p, reglage)));
}

/** La clé du placebo : le mois civil. */
export const cleDuMois = (p) => String(p.date).slice(0, 7);

/**
 * Les parts `f` (dans l'ordre de `paris`) PERMUTÉES dans chaque groupe (`cle`, le mois civil par défaut), graine 39 : les
 * groupes dans l'ordre de leur clé, le mélange de Fisher et Yates du générateur du juge. Rend les parts permutées et la part
 * des paris qui GARDENT leur mise (la même part, au flottant près, avant et après).
 */
export function permuterLesMises(paris, f, { cle = cleDuMois, graine = JUGE.graine } = {}) {
  const groupes = new Map();
  paris.forEach((p, i) => {
    const k = cle(p);
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(i);
  });
  const u = generateur(graine);
  const permutee = Float64Array.from(f);
  for (const k of [...groupes.keys()].sort()) {
    const idx = groupes.get(k);
    const valeurs = idx.map((i) => f[i]);
    for (let a = valeurs.length - 1; a > 0; a--) {
      const b = Math.floor(u() * (a + 1));
      const t = valeurs[a];
      valeurs[a] = valeurs[b];
      valeurs[b] = t;
    }
    idx.forEach((i, j) => {
      permutee[i] = valeurs[j];
    });
  }
  let gardees = 0;
  for (let i = 0; i < f.length; i++) if (permutee[i] === f[i]) gardees++;
  return { f: permutee, gardees, partGardee: f.length ? gardees / f.length : 0, groupes: groupes.size };
}

/** LE PLACEBO de la forme : les mises v1 permutées dans le MOIS ; refusé si la permutation garde plus de la moitié des mises. */
export function placeboDansLeMois(paris, f, options = {}) {
  const r = permuterLesMises(paris, f, options);
  if (r.partGardee > PART_MAX_GARDEE) {
    throw new BancRefuse(`placebo refusé : la permutation garde ${Math.round(100 * r.partGardee)} % des mises (plus de la moitié) — il ne contrôlerait rien.`);
  }
  return r;
}

// ========================================================================================= les juges

/** J1 : la croissance attendue à la clôture d'un pari misé à la part f, cote c, probabilité de clôture q. */
export const croissanceALaCloture = (f, q, c) => q * Math.log1p(f * (c - 1)) + (1 - q) * Math.log1p(-f);

/** J2 : le log-rendement réalisé d'un pari misé à la part f. */
export const logRendement = (f, c, gagne) => Math.log1p(f * (gagne ? c - 1 : -1));

const optionsDuJuge = (tirages) => ({ mode: 'moyenne', sens: 'max', tirages, graine: JUGE.graine, variantes: JUGE.K, alpha: JUGE.alpha, minBlocs: JUGE.minBlocs });
const resumeDuJuge = (j) => ({ verdict: j.verdict, raison: j.raison, gain: j.gain, fourchette: j.fourchette, ecartType: j.ecartType, p: j.p, n: j.n, z: j.seuil.z, a: j.a.moyenne, b: j.b.moyenne });
const probaDeCloture = (p) => (fini(p.probaCloture) && p.probaCloture > 0 && p.probaCloture < 1 ? p.probaCloture : null);

/** Les lignes de J1 (paris avec une probabilité de clôture) : a = la plate (ou A), b = la règle jugée (B). */
export function lignesJ1(paris, fA, fB) {
  const lignes = [];
  paris.forEach((p, i) => {
    const q = probaDeCloture(p);
    if (q === null) return;
    lignes.push({ bloc: p.bloc, match: p.fixtureKey, cle: p.cle, date: p.date, a: croissanceALaCloture(fA[i], q, p.cote), b: croissanceALaCloture(fB[i], q, p.cote) });
  });
  return lignes;
}

/** Les lignes de J2 (tous les paris) : le log-rendement réalisé de A et de B. */
export function lignesJ2(paris, fA, fB) {
  return paris.map((p, i) => ({ bloc: p.bloc, match: p.fixtureKey, cle: p.cle, date: p.date, a: logRendement(fA[i], p.cote, p.gagne), b: logRendement(fB[i], p.cote, p.gagne) }));
}

/**
 * Juge UNE des trois variantes déclarées (refuse toute autre : aucune fraction n'est jugée). `contexte` : { paris (ordre du
 * carnet), v1 (parts), plate, placebo (parts permutées), etalonnage, tirages }.
 */
export function jugerUneVariante(id, contexte) {
  if (!VARIANTES_JUGEES.includes(id)) throw new BancRefuse(`variante non déclarée : « ${id} » (K = ${JUGE.K} : ${VARIANTES_JUGEES.join(', ')}). Les niveaux (1/16, 1/4, ρ̂, plates) sont rapportés, jamais jugés.`);
  const { paris, v1, plate, placebo, etalonnage: et, tirages = JUGE.tirages } = contexte;
  if (id === 'mise-v1') {
    return { id, verdict: et?.ok ? 'etalonnee' : 'ecart', raison: et?.ok ? `la définition redonne les ${et.mises.n} mises du service à l’octet : sur P2, son verdict est l’étalonnage` : 'l’étalonnage est en écart' };
  }
  const fB = id === 'forme-kelly' ? v1 : placebo;
  const fA = new Float64Array(paris.length).fill(plate);
  const l1 = lignesJ1(paris, fA, fB);
  const j1 = comparer(l1, optionsDuJuge(tirages));
  const j2 = comparer(lignesJ2(paris, fA, fB), optionsDuJuge(tirages));
  return { id, verdict: j1.verdict, j1: resumeDuJuge(j1), j2: resumeDuJuge(j2), lignes: l1.length, sansCloture: paris.length - l1.length, blocs: j1.n.blocs };
}

// ==================================================================================== la garde d'utilité

const VERDICTS_D_UNE_BANDE = Object.freeze(['retenu', 'pas-prouve', 'moins-bon', 'pas-assez-de-matchs']);

/**
 * LES BANDES D'AVANTAGE LUES DANS LA NOTE DE LA 38 (jamais recalculées ici, T-B12) : la table que la note porterait sous
 * `rapports.vcParBandeDAvantage` ({ de, a, paris, vcMoyenne, verdict, fourchette }). La garde n'est LISIBLE que si la note
 * porte au moins une bande qui commence à 10 % ou plus, chacune avec son verdict face à 0 ; sinon elle est illisible.
 */
export function lireLesBandesDeLa38(note) {
  if (!note) return { lisible: false, bandes: null, source: null, raison: 'pas de note du banc de la 38' };
  const table = note.rapports?.vcParBandeDAvantage;
  if (!Array.isArray(table) || !table.length) return { lisible: false, bandes: null, source: null, raison: 'la note de la 38 ne porte pas la valeur de clôture par bande d’avantage' };
  const bandes = table.map((b) => ({ de: b?.de ?? null, a: b?.a ?? null, paris: b?.paris ?? null, vcMoyenne: b?.vcMoyenne ?? null, verdict: b?.verdict ?? null, fourchette: b?.fourchette ?? null }));
  const hautes = bandes.filter((b) => fini(b.de) && b.de >= BANDE_HAUTE);
  if (!hautes.length) return { lisible: false, bandes, source: 'rapports.vcParBandeDAvantage', raison: 'la note de la 38 n’a aucune bande d’avantage de 10 % et plus' };
  if (hautes.some((b) => !VERDICTS_D_UNE_BANDE.includes(b.verdict))) return { lisible: false, bandes, source: 'rapports.vcParBandeDAvantage', raison: 'une bande d’avantage de 10 % et plus sans verdict face à 0' };
  return { lisible: true, bandes, source: 'rapports.vcParBandeDAvantage', raison: null };
}

/**
 * LA GARDE D'UTILITÉ : les bandes LUES (lireLesBandesDeLa38) et la valeur de clôture des paris plafonnés à 2 % (calculée
 * ici : leur nombre, leur VC moyenne, leur avantage moyen — un rapport, pas une condition). `permetConfirme` : la garde est
 * lisible et aucune bande de 10 % et plus n'est « moins bonne » que 0.
 */
export function gardeDUtilite({ bandesLues, paris, v1 }) {
  const plafonnes = paris.filter((p, i) => v1[i] === REGLAGE_DU_SERVICE.maxStakePercent);
  const avecVc = plafonnes.filter((p) => fini(p.valeurCloture));
  const hauteMoinsBonne = bandesLues.lisible ? bandesLues.bandes.some((b) => fini(b.de) && b.de >= BANDE_HAUTE && b.verdict === 'moins-bon') : null;
  return {
    lisible: bandesLues.lisible,
    source: bandesLues.source,
    raison: bandesLues.raison,
    bandes: bandesLues.bandes,
    bandeHauteMoinsBonne: hauteMoinsBonne,
    plafonnes: { paris: plafonnes.length, avecCloture: avecVc.length, vcMoyenne: moyenneDe(avecVc.map((p) => p.valeurCloture)), avantageMoyen: moyenneDe(plafonnes.map((p) => p.avantage)) },
    permetConfirme: bandesLues.lisible && hauteMoinsBonne === false
  };
}

/**
 * LA RÈGLE DE CHOIX (conception §2.3, modifiée par la fenêtre vue déclarée du 09/11/2026, FENETRE_VUE) : SEUL un placebo
 * « retenu » = règles fautives, pas de note ; un placebo « moins bon » est RAPPORTÉ (RAISON_PLACEBO_MOINS_BON, ajoutée aux
 * raisons de toutes les autres issues), sans annuler le passage : la décision suit alors la forme. La forme « retenu » (J1),
 * J2 pas « moins bon » et la garde = « confirmée » (v1 reste) ; la forme « moins bon » = la plate de même moyenne proposée à
 * Pierre (lot 2, son accord) ; sinon « pas prouvée » (v1 reste). 1/8 et 2 % restent dans tous les cas.
 */
export function decisionDeLaForme({ forme, placebo, garde }) {
  if (placebo.verdict === 'retenu') return { decision: 'regles-fautives', raisons: ['le placebo dit « retenu » : un placebo ne doit jamais l’être'] };
  const rapportDuPlacebo = placebo.verdict === 'moins-bon' ? [RAISON_PLACEBO_MOINS_BON] : [];
  if (forme.verdict === 'retenu' && forme.j2.verdict !== 'moins-bon' && garde.permetConfirme) return { decision: 'confirmee', raisons: [...rapportDuPlacebo] };
  if (forme.verdict === 'moins-bon') return { decision: 'plate-proposee', raisons: ['la forme fait moins bien que la mise plate de même moyenne, à la clôture', ...rapportDuPlacebo] };
  const raisons = [];
  if (forme.verdict === 'retenu' && forme.j2.verdict === 'moins-bon') raisons.push('le rendement réalisé (J2) dit « moins bon »');
  if (forme.verdict === 'retenu' && !garde.permetConfirme) raisons.push(garde.lisible ? 'une bande d’avantage de 10 % et plus est « moins bonne » que 0 (note de la 38)' : `garde d’utilité illisible : ${garde.raison}`);
  if (forme.verdict !== 'retenu') raisons.push(`la clôture dit « ${forme.verdict} »`);
  return { decision: 'pas-prouvee', raisons: [...raisons, ...rapportDuPlacebo] };
}

// ============================================================================================ les chemins

/** Les jours du carnet (dans l'ordre) : pour chaque date, les indices de ses paris (paris dans l'ordre du carnet). */
export function joursDuCarnet(paris) {
  const jours = [];
  let courant = null;
  paris.forEach((p, i) => {
    if (p.date !== courant) {
      jours.push([]);
      courant = p.date;
    }
    jours.at(-1).push(i);
  });
  return jours;
}

/**
 * UN CHEMIN DE CAPITAL COMPOSÉ. Les jours dans l'ordre `ordre` ; le soir d'un jour, C = C_matin × (1 + Σ f·R) : les mises
 * d'un jour sont posées sur le capital du matin, jamais additionnées sur un capital fixe. `f` : la part de chaque pari ; `R` :
 * son rendement (cote − 1 si gagné, −1 sinon). Rend le capital final (multiple du départ), le creux maximal sous le plus haut
 * (aux fins de journée), la part des jours passés sous le plus haut, la pire série de paris perdus et, avec `trace`, le
 * capital de chaque soir.
 */
export function parcourir(jours, ordre, f, R, { trace = null } = {}) {
  let C = 1;
  let haut = 1;
  let creux = 0;
  let sous = 0;
  let serie = 0;
  let pire = 0;
  for (let t = 0; t < ordre.length; t++) {
    const jour = jours[ordre[t]];
    let s = 0;
    for (let k = 0; k < jour.length; k++) {
      const i = jour[k];
      s += f[i] * R[i];
      if (R[i] < 0) {
        serie++;
        if (serie > pire) pire = serie;
      } else serie = 0;
    }
    C *= 1 + s;
    if (trace) trace.push(C);
    if (C > haut) haut = C;
    else if (C < haut) {
      sous++;
      const d = 1 - C / haut;
      if (d > creux) creux = d;
    }
  }
  return { final: C, creux, sous: ordre.length ? sous / ordre.length : 0, pireSerie: pire };
}

/**
 * Le chemin composé de jours CONNUS (T-B9) : `jours` = [[{ f, cote, gagne }, …], …] ; rend le capital de chaque soir en euros
 * (sur `capital`, 1 000 € par défaut), le capital final, le creux maximal.
 */
export function cheminCompose({ jours, capital = BASE_DU_BANC }) {
  const plats = jours.flat();
  const indices = [];
  let i = 0;
  for (const jour of jours) indices.push(jour.map(() => i++));
  const f = Float64Array.from(plats, (p) => p.f);
  const R = Float64Array.from(plats, (p) => (p.gagne ? p.cote - 1 : -1));
  const trace = [];
  const r = parcourir(indices, indices.map((_, k) => k), f, R, { trace });
  return { soirs: trace.map((x) => x * capital), final: r.final * capital, creux: r.creux, pireSerie: r.pireSerie };
}

/** Les parts de chaque règle rapportée (sans issue, sauf kelly-rho : 1/8 × ρ̂, ρ̂ lu sur la clôture au passage). */
export function fractionsDesRegles(paris, { plate, rho }) {
  const k = (kellyFraction) => Float64Array.from(paris, (p) => fractionDuPari(p, { kellyFraction, maxStakePercent: REGLAGE_DU_SERVICE.maxStakePercent }));
  const kRho = fini(rho) && rho > 0 ? REGLAGE_DU_SERVICE.kellyFraction * rho : 0;
  return new Map([
    ['kelly-1-16', k(REGLAGE_DU_SERVICE.kellyFraction / 2)],
    ['mise-v1', k(REGLAGE_DU_SERVICE.kellyFraction)],
    ['kelly-1-4', k(REGLAGE_DU_SERVICE.kellyFraction * 2)],
    ['plate-meme-moyenne', new Float64Array(paris.length).fill(plate)],
    ['plate-1pc', new Float64Array(paris.length).fill(0.01)],
    ['kelly-rho', kRho > 0 ? k(kRho) : new Float64Array(paris.length)]
  ]);
}

const resumeDesChemins = (finals, creux, sous) => {
  const F = trie(finals);
  const D = trie(creux);
  return {
    capitalFinal: { c5: centile(F, 0.05), c50: centile(F, 0.5), c95: centile(F, 0.95) },
    creux: { c50: centile(D, 0.5), c95: centile(D, 0.95), c99: centile(D, 0.99) },
    tempsSousLePlusHaut: moyenneDe(sous),
    partEnPerte: finals.length ? finals.filter((x) => x < 1).length / finals.length : null
  };
};

/** Mélange de Fisher et Yates d'une liste d'entiers (en place). */
function melanger(liste, u) {
  for (let a = liste.length - 1; a > 0; a--) {
    const b = Math.floor(u() * (a + 1));
    const t = liste[a];
    liste[a] = liste[b];
    liste[b] = t;
  }
  return liste;
}

/**
 * LES QUATRE MONDES (1 000 tirages chacun, graine 39) : W-clôture (issues tirées avec la probabilité de clôture : la
 * référence), W-moteur ((1 + avantage) / cote), W-zéro (1 / cote), W-réel (les issues réelles, 1 000 ordres des jours
 * tirés) ; et le chemin réel unique, à part (« un seul chemin : la chance y pèse »). Les mêmes tirages pour toutes les règles.
 */
export function simulerLesMondes({ paris, regles, tirages = JUGE.tirages, graine = JUGE.graine }) {
  const jours = joursDuCarnet(paris);
  const chrono = jours.map((_, k) => k);
  const n = paris.length;
  const cotes = Float64Array.from(paris, (p) => p.cote);
  const ids = [...regles.keys()];
  const mondes = {};
  const q = {
    'W-cloture': paris.map((p) => probaDeCloture(p)),
    'W-moteur': paris.map((p) => Math.min(1, (1 + p.avantage) / p.cote)),
    'W-zero': paris.map((p) => Math.min(1, 1 / p.cote))
  };
  for (const [nom, probas] of Object.entries(q)) {
    const sansProba = probas.filter((x) => x === null).length;
    const u = generateur(graine);
    const R = new Float64Array(n);
    const acc = Object.fromEntries(ids.map((id) => [id, { finals: [], creux: [], sous: [] }]));
    const series = [];
    for (let t = 0; t < tirages; t++) {
      for (let i = 0; i < n; i++) {
        const tirage = u();
        // Un pari sans probabilité de clôture (W-clôture) ne compte pas : mise sans effet (R = 0).
        R[i] = probas[i] === null ? 0 : tirage < probas[i] ? cotes[i] - 1 : -1;
      }
      let serieDuTirage = null;
      for (const id of ids) {
        const r = parcourir(jours, chrono, regles.get(id), R);
        acc[id].finals.push(r.final);
        acc[id].creux.push(r.creux);
        acc[id].sous.push(r.sous);
        serieDuTirage ??= r.pireSerie;
      }
      series.push(serieDuTirage);
    }
    const S = trie(series);
    mondes[nom] = { paris: n - sansProba, sansProbabilite: sansProba, jours: jours.length, tirages, regles: Object.fromEntries(ids.map((id) => [id, resumeDesChemins(acc[id].finals, acc[id].creux, acc[id].sous)])), pireSerie: { c50: centile(S, 0.5), c95: centile(S, 0.95), c99: centile(S, 0.99) } };
  }
  // W-réel : les issues réelles, l'ordre des jours tiré.
  const Rreel = Float64Array.from(paris, (p) => (p.gagne ? p.cote - 1 : -1));
  const u = generateur(graine);
  const acc = Object.fromEntries(ids.map((id) => [id, { finals: [], creux: [], sous: [] }]));
  const series = [];
  for (let t = 0; t < tirages; t++) {
    const ordre = melanger([...chrono], u);
    let serieDuTirage = null;
    for (const id of ids) {
      const r = parcourir(jours, ordre, regles.get(id), Rreel);
      acc[id].finals.push(r.final);
      acc[id].creux.push(r.creux);
      acc[id].sous.push(r.sous);
      serieDuTirage ??= r.pireSerie;
    }
    series.push(serieDuTirage);
  }
  const S = trie(series);
  mondes['W-reel'] = { paris: n, jours: jours.length, tirages, regles: Object.fromEntries(ids.map((id) => [id, resumeDesChemins(acc[id].finals, acc[id].creux, acc[id].sous)])), pireSerie: { c50: centile(S, 0.5), c95: centile(S, 0.95), c99: centile(S, 0.99) } };
  const cheminReel = Object.fromEntries(ids.map((id) => [id, parcourir(jours, chrono, regles.get(id), Rreel)]));
  return { mondes, cheminReel: { quoi: 'un seul chemin, dans l’ordre réel des jours : la chance y pèse', regles: cheminReel } };
}

// ================================================================================ la zone des conseils

/**
 * LES CREUX PAR HORIZON (W-clôture ou un autre monde tiré) : `tirages` chemins de `max(horizons)` paris (les paris du carnet
 * répétés, chaque répétition dans l'ordre des jours, des issues neuves), le creux maximal relevé à la fin de chaque horizon.
 * `panne` (facultative) : { auPari, vc } — à partir du pari `auPari + 1`, la probabilité devient (1 + vc) / cote ; le premier
 * pari où le creux dépasse `seuil` est alors noté (le délai de détection).
 */
export function creuxParHorizon({ paris, f, probas, horizons, tirages = JUGE.tirages, graine = JUGE.graine, panne = null, seuil = null }) {
  if (!Array.isArray(horizons) || !horizons.length || horizons.some((h) => !Number.isInteger(h) || h <= 0)) {
    throw new BancRefuse('une zone des creux se dit TOUJOURS avec son horizon (un nombre de paris) : horizon absent ou invalide.');
  }
  const n = paris.length;
  if (horizons.some((h) => h % n !== 0)) throw new BancRefuse(`horizons ${horizons.join(', ')} : des multiples du nombre de paris (${n}).`);
  const jours = joursDuCarnet(paris);
  const H = Math.max(...horizons);
  const repetitions = H / n;
  const u = generateur(graine);
  const parHorizon = Object.fromEntries(horizons.map((h) => [h, []]));
  const coupures = [];
  for (let t = 0; t < tirages; t++) {
    let C = 1;
    let haut = 1;
    let creux = 0;
    let rang = 0;
    let coupe = null;
    for (let r = 0; r < repetitions; r++) {
      for (const jour of jours) {
        let s = 0;
        for (const i of jour) {
          rang++;
          const q = panne && rang > panne.auPari ? Math.min(1, (1 + panne.vc) / paris[i].cote) : probas[i];
          const tirage = u();
          const R = q === null ? 0 : tirage < q ? paris[i].cote - 1 : -1;
          s += f[i] * R;
        }
        C *= 1 + s;
        if (C > haut) haut = C;
        else if (C < haut) creux = Math.max(creux, 1 - C / haut);
        if (seuil !== null && coupe === null && creux > seuil) coupe = rang;
      }
      const fait = (r + 1) * n;
      if (parHorizon[fait]) parHorizon[fait].push(creux);
    }
    coupures.push(coupe);
  }
  return { parHorizon: Object.fromEntries(Object.entries(parHorizon).map(([h, xs]) => [h, trie(xs)])), coupures };
}

/** LA ZONE DES CONSEILS pour UN horizon dit (refusée sans lui, T-B10) : le 99e centile du creux de la règle sous ce monde. */
export function zoneDesConseils({ paris, f, probas, horizon, tirages = JUGE.tirages, graine = JUGE.graine }) {
  if (horizon === undefined || horizon === null) throw new BancRefuse('une zone des creux se dit TOUJOURS avec son horizon (un nombre de paris) : horizon absent.');
  const r = creuxParHorizon({ paris, f, probas, horizons: [horizon], tirages, graine });
  const D = r.parHorizon[horizon];
  return { horizon, centile: 0.99, creux: centile(D, 0.99), c50: centile(D, 0.5), c95: centile(D, 0.95), tirages };
}

/**
 * Les zones de 555, 1 110 et 1 665 paris (W-clôture, la règle v1), les FAUSSES COUPURES de la zone de 555 paris quand la
 * règle tourne plus longtemps (W-clôture et W-moteur, jusqu'à 2 775 paris) et le DÉLAI DE DÉTECTION d'une panne (la valeur de
 * clôture tombe à −5 % après le pari 300, sur 1 110 paris). Éclaire les questions de Pierre ; jamais un seuil appliqué.
 */
export function zonesEtDetection({ paris, v1, tirages = JUGE.tirages, graine = JUGE.graine }) {
  const cloture = paris.map((p) => probaDeCloture(p));
  const moteur = paris.map((p) => Math.min(1, (1 + p.avantage) / p.cote));
  const tous = [...HORIZONS, HORIZON_LONG];
  const c = creuxParHorizon({ paris, f: v1, probas: cloture, horizons: tous, tirages, graine });
  const zones = HORIZONS.map((h) => ({ horizon: h, centile: 0.99, creux: centile(c.parHorizon[h], 0.99), c50: centile(c.parHorizon[h], 0.5), c95: centile(c.parHorizon[h], 0.95) }));
  const zone555 = zones[0];
  const m = creuxParHorizon({ paris, f: v1, probas: moteur, horizons: tous, tirages, graine });
  const faussesCoupures = tous.map((h) => ({
    horizon: h,
    cloture: c.parHorizon[h].filter((x) => x > zone555.creux).length / tirages,
    moteur: m.parHorizon[h].filter((x) => x > zone555.creux).length / tirages
  }));
  const d = creuxParHorizon({ paris, f: v1, probas: cloture, horizons: [PANNE.horizon], tirages, graine, panne: PANNE, seuil: zone555.creux });
  const coupes = d.coupures.filter((x) => x !== null);
  const apres = trie(coupes.filter((x) => x > PANNE.auPari));
  return {
    regle: 'mise-v1',
    monde: 'W-cloture',
    zones,
    faussesCoupures: { zone: { horizon: zone555.horizon, creux: zone555.creux }, parHorizon: faussesCoupures },
    detection: {
      zone: { horizon: zone555.horizon, creux: zone555.creux },
      panne: PANNE,
      partCoupee: coupes.length / tirages,
      partCoupeeAvantLaPanne: coupes.filter((x) => x <= PANNE.auPari).length / tirages,
      medianeDuPariDeCoupure: centile(apres, 0.5),
      medianeDuDelai: apres.length ? centile(apres, 0.5) - PANNE.auPari : null
    }
  };
}

// ============================================================================= ρ̂, corrélation, jours

/** ρ̂ : la pente de la valeur de clôture sur l'avantage estimé — par l'origine, et affine (paris avec une clôture). */
export function rhoChapeau(paris) {
  const xs = [];
  const ys = [];
  for (const p of paris) {
    if (fini(p.valeurCloture) && fini(p.avantage)) {
      xs.push(p.avantage);
      ys.push(p.valeurCloture);
    }
  }
  const n = xs.length;
  if (n < 2) return { n, origine: { pente: null }, affine: { pente: null, ordonnee: null } };
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += xs[i] * ys[i];
    sxx += xs[i] * xs[i];
  }
  const mx = moyenneDe(xs);
  const my = moyenneDe(ys);
  let cxy = 0;
  let cxx = 0;
  for (let i = 0; i < n; i++) {
    cxy += (xs[i] - mx) * (ys[i] - my);
    cxx += (xs[i] - mx) ** 2;
  }
  const pente = cxx > 0 ? cxy / cxx : null;
  return { n, origine: { pente: sxx > 0 ? sxy / sxx : null }, affine: { pente, ordonnee: pente === null ? null : my - pente * mx } };
}

/**
 * La corrélation des issues d'un même jour × championnat (et d'un même jour), au monde réel : les résidus réduits
 * e = (issue − q) / √(q (1 − q)) (q = la probabilité de clôture), la moyenne des produits e_i·e_j des paires d'un même bloc.
 */
export function correlationDuMemeJour(paris) {
  const parCle = (cle) => {
    const groupes = new Map();
    let somme2 = 0;
    let n = 0;
    for (const p of paris) {
      const q = probaDeCloture(p);
      if (q === null) continue;
      const e = ((p.gagne ? 1 : 0) - q) / Math.sqrt(q * (1 - q));
      somme2 += e * e;
      n++;
      const g = groupes.get(cle(p)) ?? { s: 0, s2: 0, m: 0 };
      g.s += e;
      g.s2 += e * e;
      g.m += 1;
      groupes.set(cle(p), g);
    }
    let paires = 0;
    let produits = 0;
    for (const g of groupes.values()) {
      paires += (g.m * (g.m - 1)) / 2;
      produits += (g.s * g.s - g.s2) / 2;
    }
    const echelle = n ? somme2 / n : null;
    return { paires, moyenneDesProduits: paires ? produits / paires : null, correlation: paires && echelle ? produits / paires / echelle : null };
  };
  return { memeJourEtChampionnat: parCle((p) => p.bloc), memeJour: parCle((p) => p.date) };
}

// =============================================================================================== les comptes

/**
 * LES COMPTES (avant le regard ; T-B6) : ne lisent que la date, le championnat (le bloc), la cote et l'avantage — ni issue, ni
 * clôture, jamais un carnet. Le nombre de paris, les parts v1 (moyenne, centiles), la part plafonnée à 2 %, les paris par
 * mois, les jours (à deux paris ou plus ; où la somme des parts dépasse 4, 6 et 8 %), les blocs, la part des mises que le
 * placebo garderait, la plate de même moyenne.
 */
export function comptes(paris) {
  const tries = [...paris].sort(ordreDuCarnet);
  const n = tries.length;
  const f = tries.map((p) => fractionDuPari(p));
  const F = trie(f);
  const parMois = {};
  const parJour = new Map();
  const blocs = new Set();
  tries.forEach((p, i) => {
    const mois = cleDuMois(p);
    parMois[mois] = (parMois[mois] ?? 0) + 1;
    const j = parJour.get(p.date) ?? { paris: 0, somme: 0 };
    j.paris += 1;
    j.somme += f[i];
    parJour.set(p.date, j);
    blocs.add(p.bloc);
  });
  const jours = [...parJour.values()];
  const placebo = n ? permuterLesMises(tries, f) : { partGardee: 0, gardees: 0, groupes: 0 };
  const plafond = REGLAGE_DU_SERVICE.maxStakePercent;
  const nMois = Object.keys(parMois).length;
  return {
    paris: n,
    parts: n ? { moyenne: moyenneDe(f), c5: centile(F, 0.05), c25: centile(F, 0.25), c50: centile(F, 0.5), c75: centile(F, 0.75), c95: centile(F, 0.95), c99: centile(F, 0.99), max: F[F.length - 1] } : null,
    plate: n ? moyenneDe(f) : null,
    plafonnes: f.filter((x) => x === plafond).length,
    partPlafonnee: n ? f.filter((x) => x === plafond).length / n : null,
    mois: nMois,
    parisParMois: { moyenne: nMois ? n / nMois : null, min: nMois ? Math.min(...Object.values(parMois)) : null, max: nMois ? Math.max(...Object.values(parMois)) : null, parMois },
    jours: jours.length,
    joursADeuxParisOuPlus: jours.filter((j) => j.paris >= 2).length,
    joursAuDessus: Object.fromEntries(SEUILS_DU_JOUR.map((s) => [`${Math.round(100 * s)} %`, jours.filter((j) => j.somme > s).length])),
    plusGrosJour: jours.length ? Math.max(...jours.map((j) => j.somme)) : null,
    blocs: blocs.size,
    placebo: { groupes: placebo.groupes, gardees: placebo.gardees, partGardee: placebo.partGardee, refuse: placebo.partGardee > PART_MAX_GARDEE },
    partFraiche: { lue: false, raison: 'sur P2 (cotes football-data d’avant match, sans heure de relevé) la fraîcheur n’a pas de sens ; la part « fraîche » de P5 est R24 de la 38 (ses comptes), lue à part par l’ombre (lot 1c)' }
  };
}

// ============================================================================================ le passage

/**
 * LE PASSAGE (au verrou du script, une fois) : l'étalonnage d'abord (un écart arrête tout, rien n'est jugé), puis les trois
 * variantes, la garde, la règle de choix et les rapportés. `paris` : les paris de l'export (issues et clôtures comprises) ;
 * `bandesLues` : lireLesBandesDeLa38(la note de la 38). `ignorerEtalonnage` et `tirages` : copies d'essai seulement.
 */
export function passerLeBanc({ paris, bandesLues, tirages = JUGE.tirages, ignorerEtalonnage = false }) {
  const tries = [...paris].sort(ordreDuCarnet);
  const et = etalonnage(tries);
  if (!et.ok && !ignorerEtalonnage) return { etalonnage: et, arret: true, banc: null };
  const v1 = Float64Array.from(tries, (p) => fractionDuPari(p));
  const plate = plateDeMemeMoyenne(tries);
  const placebo = placeboDansLeMois(tries, v1);
  const contexte = { paris: tries, v1, plate, placebo: placebo.f, etalonnage: et, tirages };
  const variantes = VARIANTES_JUGEES.map((id) => jugerUneVariante(id, contexte));
  const forme = variantes.find((v) => v.id === 'forme-kelly');
  const pl = variantes.find((v) => v.id === 'placebo-forme');
  const garde = gardeDUtilite({ bandesLues, paris: tries, v1 });
  const decision = decisionDeLaForme({ forme, placebo: pl, garde });
  const rho = rhoChapeau(tries);
  const regles = fractionsDesRegles(tries, { plate, rho: rho.origine.pente });
  const cpt = comptes(tries);
  return {
    etalonnage: et,
    arret: false,
    banc: {
      K: JUGE.K,
      z: zPour(JUGE.alpha, JUGE.K),
      tirages,
      graine: JUGE.graine,
      plate,
      placebo: { groupes: placebo.groupes, gardees: placebo.gardees, partGardee: placebo.partGardee },
      variantes,
      placebos: { 'placebo-forme': pl.verdict },
      forme: { ...decision, garde },
      fenetreVue: FENETRE_VUE,
      rapportes: {
        regles: Object.fromEntries([...regles.entries()].map(([id, f]) => [id, { moyenne: moyenneDe([...f]), plafonnees: [...f].filter((x) => x === REGLAGE_DU_SERVICE.maxStakePercent).length }])),
        rho,
        ...simulerLesMondes({ paris: tries, regles, tirages }),
        zones: zonesEtDetection({ paris: tries, v1, tirages }),
        correlation: correlationDuMemeJour(tries),
        plafondsDuJour: cpt.joursAuDessus,
        partPlafonnee: cpt.partPlafonnee,
        horsDuLot: RAPPORTES_HORS_DU_LOT
      }
    }
  };
}

// ================================================================================================ la note

const CREUX_DE_LA_NOTE = Object.freeze(['kelly-1-16', 'mise-v1', 'kelly-1-4', 'plate-meme-moyenne', 'plate-1pc']);

/** CE QUI EST RECOPIÉ dans noteDeLaMise.js, tiré de la sortie du passage unique — pur (recopie PAR SCRIPT, T-B7). */
export function aRecopier(sortieDuBanc, { sortie } = {}) {
  const b = sortieDuBanc?.banc;
  if (!b || sortieDuBanc.format !== VERSION_DU_BANC) throw new Error('aRecopier : ce n’est pas une sortie du banc de la mise (format 1), ou le passage s’est arrêté à l’étalonnage');
  const cloture = b.rapportes.mondes['W-cloture'];
  return {
    format: VERSION_DU_BANC,
    calculeLe: String(sortieDuBanc.premierRegard ?? '').slice(0, 10),
    premierRegard: sortieDuBanc.premierRegard ?? null,
    ou: 'bac à sable',
    regles: { fichier: sortieDuBanc.regles?.copie ?? null, sha1: sortieDuBanc.regles?.sha1 ?? null, ecritesAvantLeRegard: true },
    scellement: sortieDuBanc.scellement ?? null,
    sortie: sortie ?? null,
    paris: { sha1: sortieDuBanc.paris?.sha1 ?? null, n: sortieDuBanc.etalonnage?.mises?.n ?? null },
    empreinteDuMoteur: sortieDuBanc.empreinteDuMoteur ?? null,
    etalonnage: { ok: sortieDuBanc.etalonnage.ok, mises: sortieDuBanc.etalonnage.mises, carnet: sortieDuBanc.etalonnage.carnet },
    K: b.K,
    z: arrondi(b.z, 4),
    variantes: b.variantes.map((v) => ({ id: v.id, verdict: v.verdict, gain: arrondi(v.j1?.gain, 8), fourchette: Array.isArray(v.j1?.fourchette) ? v.j1.fourchette.map((x) => arrondi(x, 8)) : null, j2: v.j2 ? v.j2.verdict : null, lignes: v.lignes ?? null })),
    placebos: b.placebos,
    forme: { decision: b.forme.decision, raisons: b.forme.raisons, garde: { lisible: b.forme.garde.lisible, raison: b.forme.garde.raison, plafonnes: b.forme.garde.plafonnes } },
    fenetreVue: b.fenetreVue ?? null,
    creux: Object.fromEntries(CREUX_DE_LA_NOTE.map((id) => [id, { c50: arrondi(cloture.regles[id].creux.c50, 4), c95: arrondi(cloture.regles[id].creux.c95, 4), c99: arrondi(cloture.regles[id].creux.c99, 4), capitalFinal: cloture.regles[id].capitalFinal }])),
    zones: b.rapportes.zones.zones.map((z) => ({ horizon: z.horizon, creux: arrondi(z.creux, 4) })),
    rho: { origine: arrondi(b.rapportes.rho.origine.pente, 4), affine: arrondi(b.rapportes.rho.affine.pente, 4) },
    monde: 'W-cloture',
    paris555: cloture.paris
  };
}

/** Le TEXTE de noteDeLaMise.js pour une note (la recopie l'écrit tel quel ; T-B7 le refait à l'octet). */
export function texteDeLaNote(note) {
  return [
    '/**',
    ' * noteDeLaMise.js — CE QUE DIT LE BANC DE LA MISE (étape 39 du plan, lot 1b).',
    ' * -----------------------------------------------------------------------',
    ' * RECOPIÉ PAR SCRIPT (server/scripts/etape39.mjs --recopier, sur la sortie du passage unique du banc ; --note-nulle avant',
    ' * lui), jamais retapé à la main : le test T-B7 (miseBanc.test.mjs) refait ce texte à l’octet.',
    ' * MISE_AU_BANC : le verdict des trois variantes (mise-v1 = l’étalonnage, forme-kelly, placebo-forme), la décision sur la',
    ' * forme et sa garde, les creux du capital (1/16, 1/8, 1/4, les deux plates) dans le monde de la clôture, les zones par',
    ' * horizon, ρ̂. null = pas encore mesuré : l’écran ne dit jamais « mesuré ».',
    ' * Hors de l’empreinte du moteur (data/mise/) : aucun chiffre du moteur n’en dépend. Pur : ne lit rien.',
    ' * -----------------------------------------------------------------------',
    ' */',
    '',
    '/** Gèle un objet et tout ce qu’il contient : la note ne se modifie pas en mémoire. */',
    'const gele = (o) => {',
    "  if (o && typeof o === 'object' && !Object.isFrozen(o)) {",
    '    Object.freeze(o);',
    '    for (const v of Object.values(o)) gele(v);',
    '  }',
    '  return o;',
    '};',
    '',
    '/** Le banc de la mise (null = pas encore mesuré). */',
    `export const MISE_AU_BANC = ${note === null ? 'null' : `gele(${JSON.stringify(note)})`};`,
    '',
    '/** Le verdict d’une variante (null avant le banc ou pour un identifiant inconnu). */',
    'export const verdictDe = (id) => MISE_AU_BANC?.variantes?.find((v) => v.id === id)?.verdict ?? null;',
    ''
  ].join('\n');
}

// ============================================================================================ l'écran

/** Les mots de l'écran (Historique moteur › Banc d'essai), scellés dans les règles du banc. Jamais « sûr », jamais un euro. */
export const MOTS_DU_BANC = Object.freeze({
  titre: 'La mise conseillée, au banc d’essai',
  pasEncore: 'Pas encore mesuré : le banc de la mise n’a pas encore tourné. La règle d’aujourd’hui (1/8 de Kelly, au plus 2 % du capital par pari) reste en service.',
  confirmee: (n) => `Miser plus quand l’avantage est plus grand a été confirmé par la clôture (${n} paris).`,
  pasProuvee: 'Miser plus quand l’avantage est plus grand : pas encore prouvé. La règle d’aujourd’hui est gardée.',
  plateProposee: (n) => `Miser plus quand l’avantage est plus grand a fait moins bien qu’une mise égale sur chaque pari, à la clôture (${n} paris) : une mise égale vous sera proposée ; la règle d’aujourd’hui reste en attendant votre accord.`,
  reglesFautives: 'Le contrôle du banc de la mise n’a pas tenu : aucune conclusion n’est tirée. La règle d’aujourd’hui reste en service.',
  provenance: 'Mesuré une seule fois, au banc d’essai, sur les paris du moteur de 2019 à 2023 (cotes football-data d’avant match), dans le bac à sable.'
});

const pourcentDit = (x) => `${Math.round(100 * x).toLocaleString('fr-FR')} %`;

/**
 * LES PHRASES DE L'ÉCRAN pour une note (null = « pas encore mesuré ») : les creux de 1/8, 1/16 et 1/4 (monde de la clôture :
 * la moitié du temps = le 50e centile, une fois sur cent = le 99e), puis la forme. Les creux sont des parts du capital,
 * jamais des euros.
 */
export function phrasesDuBanc(note) {
  if (!note) return { mesure: false, titre: MOTS_DU_BANC.titre, phrases: [MOTS_DU_BANC.pasEncore], provenance: null };
  const n = note.paris555 ?? note.paris?.n ?? ATTENDU.paris;
  const c = note.creux;
  const creux = `Avec 1/8 de Kelly, sur ${n} paris comme ceux de 2019-2023 : la moitié du temps votre capital redescend au plus de ${pourcentDit(c['mise-v1'].c50)} sous son plus haut ; une fois sur cent, de ${pourcentDit(c['mise-v1'].c99)}. Avec 1/16 : ${pourcentDit(c['kelly-1-16'].c50)} la moitié du temps, ${pourcentDit(c['kelly-1-16'].c99)} une fois sur cent ; avec 1/4 : ${pourcentDit(c['kelly-1-4'].c50)} et ${pourcentDit(c['kelly-1-4'].c99)}.`;
  const forme = { confirmee: MOTS_DU_BANC.confirmee(n), 'pas-prouvee': MOTS_DU_BANC.pasProuvee, 'plate-proposee': MOTS_DU_BANC.plateProposee(n), 'regles-fautives': MOTS_DU_BANC.reglesFautives }[note.forme?.decision] ?? MOTS_DU_BANC.pasProuvee;
  if (note.forme?.decision === 'regles-fautives') return { mesure: false, titre: MOTS_DU_BANC.titre, phrases: [forme], provenance: MOTS_DU_BANC.provenance };
  return { mesure: true, titre: MOTS_DU_BANC.titre, phrases: [creux, forme], provenance: MOTS_DU_BANC.provenance, calculeLe: note.calculeLe ?? null };
}
