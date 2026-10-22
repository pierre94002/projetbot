/**
 * bancCandidate.js — LE BANC AVANT L'ESSAI d'une version candidate (étape 25 du plan, seconde moitié, 14/10/2026).
 * -----------------------------------------------------------------------
 * Une candidate peut être jugée TOUT DE SUITE sur l'historique, sans attendre
 * ses matchs neufs : le banc d'essai de l'étape 19 (runner.js) rejoue le
 * moteur deux fois sur les mêmes matchs passés — la version en service, puis
 * la candidate (l'option `config` du banc : ses réglages posés sur ceux en
 * service) —, seulement pour les familles de marchés qu'elle change ; les
 * lignes des deux rejeux sont appariées par leur clé complète (match, marché,
 * ligne, jeu de prix : jamais deux lignes différentes face à face), notées par
 * LA note du banc (sa perte log), et jugées par le juge de l'étape 16
 * (comparer), la fourchette élargie pour toutes les variantes déclarées de son
 * étape au registre de la mesure.
 *
 * Ce verdict est INDICATIF, toujours : ces matchs-là ont pu servir à
 * construire la candidate (la part des lignes dans des fenêtres déjà vues est
 * dite : DONNEES_VUES, les vues « moteur » des lancements du code et celles que la candidate déclare —
 * portée « moteur », correction du 19/10), et il ne dit rien
 * des matchs à venir. Il ne décide JAMAIS d'une adoption : seul le jugement de
 * l'essai à blanc, sur des matchs joués après sa mise à blanc et pris à son
 * horizon, le fait (moteurABlanc.js, engineVersions.js).
 *
 * Par défaut : la période P2 (2019-2023, jamais vue par les réglages du 23/09,
 * celle de la note de départ) et l'avant-match football-data (le jeu de prix
 * de la note de départ). Le banc tourne DANS le serveur, sous le verrou de
 * l'actualisation (nom « banc-candidate »), en rendant la main : c'est la
 * route de Réglages qui le lance (config.controller.js) et qui range son
 * verdict avec la candidate (noterLeBancDeLaCandidate). Aucune base ouverte
 * ici, aucun hasard (le seul est celui, à graine, du juge).
 * -----------------------------------------------------------------------
 */

import { rejouer as rejouerParDefaut } from './runner.js';
import { comparer } from './guard.js';
import { compterVariantes } from './trialsRegistry.js';
import { fenetresDeclarees } from './lancements.js';
import { jugerLaCase, JUGE } from '../data/calibration.js';
import { libelleDeLaCase } from './libellesDesCases.js';

/** La période et le jeu de prix par défaut : ceux de la note de départ (jamais vus, avant-match football-data). */
export const PERIODES_DU_BANC_CANDIDATE = Object.freeze(['P2']);
export const PRIX_DU_BANC_CANDIDATE = Object.freeze(['fd-avant-match']);

/** La famille du banc (periodes.js, FAMILLES_DU_BANC) qui porte chaque marché de l'appli. */
export const FAMILLE_DU_BANC = Object.freeze({
  result: 'result',
  totalGoals: 'totalGoals',
  bothTeamsScore: 'bothTeamsScore',
  teamGoals: 'teamGoals',
  resultAndTotal: 'resultAndTotal',
  totalCorners: 'corners',
  teamCorners: 'corners',
  totalShots: 'shots',
  teamShots: 'shots',
  totalShotsOnTarget: 'shotsOnTarget',
  teamShotsOnTarget: 'shotsOnTarget'
});

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const arrondi = (x, d = 6) => (fini(x) ? Number(x.toFixed(d)) : null);

/**
 * Le NOMBRE DE VARIANTES de la fourchette (étape 27, garde du K) : celles déclarées au registre de la mesure pour
 * l'étape, et au moins la candidate et ses variantes déclarées — avant sa mise en essai (au redémarrage de l'appli,
 * qui les déclare), le registre n'en a aucune : sans cette garde, la fourchette serait celle d'une seule variante.
 */
export const variantesDuBanc = (candidate, registre = {}) => Math.max(compterVariantes(candidate.etape, registre), 1 + (Array.isArray(candidate.variantes) ? candidate.variantes.length : 0));

/** La famille d'une ligne du banc (marketKey : « teamGoals:home » → teamGoals) et sa case (famille × ligne). */
const familleDe = (marketKey) => String(marketKey).split(':')[0];
const caseDe = (marketKey, ligne) => `${marketKey}${ligne === null || ligne === undefined ? '' : `|${ligne}`}`;

/** Un verdict du juge résumé pour la carte : moyennes, gain et fourchette en %, verdict. */
function verdictResume(j) {
  const base = j.a?.moyenne;
  const echelle = fini(base) && base !== 0 ? 100 / Math.abs(base) : 100;
  return {
    lignes: j.n?.lignes ?? 0,
    matchs: j.n?.matchs ?? 0,
    a: arrondi(j.a?.moyenne),
    b: arrondi(j.b?.moyenne),
    gainPct: fini(j.gain) ? arrondi(j.gain * echelle, 3) : null,
    fourchettePct: Array.isArray(j.fourchette) ? j.fourchette.map((x) => arrondi(x * echelle, 3)) : null,
    verdict: j.verdict
  };
}

/** Le juge sur des groupes de lignes (même K, même graine) : { cle: verdictResume }. */
function jugerParGroupe(groupes, { variantes, graine, tirages }) {
  const out = {};
  for (const [cle, lignes] of [...groupes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!lignes.length) continue;
    out[cle] = verdictResume(comparer(lignes, { mode: 'moyenne', sens: 'min', variantes, graine, tirages }));
  }
  return out;
}

/**
 * La CALIBRATION du pronostic retenu d'une version, par case (famille × ligne) et par famille : biais (réalisé −
 * annoncé), écart moyen par dixième (ECE), et le juge de l'étape 20 (jugerLaCase : « trop haut », « trop bas »,
 * « dans le hasard », « trop peu ») à `variantes`. `lignes` : [{ cle, famille, fixtureKey, p, realise }].
 */
function calibrationDe(lignes, { variantes }) {
  const resume = (ls) => {
    if (!ls.length) return null;
    const n = ls.length;
    let somme = 0;
    const dn = new Float64Array(10);
    const de = new Float64Array(10);
    for (const l of ls) {
      somme += (l.realise ? 1 : 0) - l.p;
      const d = Math.min(9, Math.max(0, Math.floor(l.p * 10)));
      dn[d]++;
      de[d] += (l.realise ? 1 : 0) - l.p;
    }
    let ece = 0;
    for (let d = 0; d < 10; d++) if (dn[d]) ece += Math.abs(de[d]);
    const j = jugerLaCase(ls.map((l) => ({ fixtureKey: l.fixtureKey, cle: l.cle, p: l.p, realise: l.realise })), { variantes });
    return { pronostics: n, matchs: j.matchs, biais: arrondi(somme / n), ece: arrondi(ece / n), verdict: j.verdict, fourchette: j.fourchette ? j.fourchette.map((x) => arrondi(x)) : null };
  };
  const parCase = new Map();
  const parFamille = new Map();
  for (const l of lignes) {
    if (!parCase.has(l.cle)) parCase.set(l.cle, []);
    parCase.get(l.cle).push(l);
    if (!parFamille.has(l.famille)) parFamille.set(l.famille, []);
    parFamille.get(l.famille).push(l);
  }
  const trie = (m) => Object.fromEntries([...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, ls]) => [k, resume(ls)]));
  return { parCase: trie(parCase), parFamille: trie(parFamille) };
}

// ------------------------------------------------------------ le banc en cours (mémoire du serveur)

let enCours = null;
let dernierRefus = null;

/** Le banc de la candidate en cours dans ce serveur ({ candidate, depuis, rejeu, partie, fait, total }), ou null. */
export const bancDeLaCandidateEnCours = () => (enCours ? { ...enCours } : null);
/** Le dernier refus d'un lancement (verrou pris entre la vérification et le départ, erreur), gardé pour la carte. */
export const dernierRefusDuBanc = () => (dernierRefus ? { ...dernierRefus } : null);
export function commencerLeBanc({ candidate, maintenant = Date.now() }) {
  enCours = { candidate, depuis: new Date(maintenant).toISOString(), rejeu: null, partie: null, fait: 0, total: 0 };
  dernierRefus = null;
}
export function avancerLeBanc({ rejeu = null, partie = null, fait = 0, total = 0 } = {}) {
  if (enCours) enCours = { ...enCours, rejeu, partie, fait, total };
}
export function refuserLeBanc(raison, maintenant = Date.now()) {
  dernierRefus = { le: new Date(maintenant).toISOString(), raison: String(raison).slice(0, 300) };
}
export function terminerLeBanc() {
  enCours = null;
}

// ------------------------------------------------------------ le jugement

/**
 * LE BANC AVANT L'ESSAI. `candidate` (candidateEnEssai), `reglagesEnService` et `reglagesCandidate` (deux objets,
 * candidatePourLeBanc), `database` (celle de l'appelant). Options du banc : `periodes`, `prix`, `de`, `a`,
 * `rendreLaMain`, `avancement`, `graine`, `tirages` ; `registre` : les options du registre de la mesure (un
 * fichier d'essai dans les tests) ; `rejouer` : le rejeu (celui du banc par défaut ; un faux dans les tests).
 * Rend le verdict INDICATIF : { indicatif: true, le, periodes, prix, marches, mesure, paires, matchs, ecartees,
 * variantes, a, b, gainPct, fourchettePct, verdict, raison, dejaVues, moteurs, dureeMs, erreur }.
 */
export async function jugerLaCandidateAuBanc({
  candidate,
  reglagesEnService,
  reglagesCandidate,
  database,
  rejouer = rejouerParDefaut,
  periodes = PERIODES_DU_BANC_CANDIDATE,
  prix = PRIX_DU_BANC_CANDIDATE,
  de = null,
  a = null,
  rendreLaMain = null,
  avancement = null,
  registre = {},
  graine = 1,
  tirages = 1000,
  maintenant = Date.now()
} = {}) {
  const debut = performance.now();
  const marches = [...new Set((candidate?.marches ?? []).map((m) => FAMILLE_DU_BANC[m]).filter(Boolean))];
  const sortie = {
    indicatif: true,
    le: new Date(maintenant).toISOString(),
    candidate: candidate?.id ?? null,
    empreinte: candidate?.empreinte ?? null,
    periodes: [...periodes],
    prix: [...prix],
    marches,
    mesure: 'perte-log',
    paires: 0,
    matchs: 0,
    ecartees: { sansPaire: 0, lignesDifferentes: 0, nonReglable: 0 },
    variantes: null,
    a: null,
    b: null,
    gainPct: null,
    fourchettePct: null,
    verdict: null,
    raison: null,
    dejaVues: null,
    moteurs: { a: null, b: null },
    dureeMs: null,
    erreur: null
  };
  if (!marches.length) return { ...sortie, erreur: 'aucun marché de la candidate n’est rejoué par le banc', dureeMs: 0 };
  const options = { periodes: [...periodes], prix: [...prix], marches, database, graine, tirages, reproduction: false, ...(de ? { de } : {}), ...(a ? { a } : {}), ...(rendreLaMain ? { rendreLaMain } : {}) };
  const suivre = (rejeu) => (avancement ? (x) => avancement({ ...x, rejeu }) : undefined);

  // A : la version en service. On ne garde, par ligne, que sa perte log et de quoi l'apparier (étape 27 : et sa
  // perte log face au marché, et le pronostic retenu pour la calibration).
  const A = new Map();
  const calibA = [];
  const calibB = [];
  // Le pronostic retenu d'une ligne (sa probabilité annoncée et s'il est arrivé) pour la calibration de sa version.
  const retenu = (l, liste) => {
    const p = l.moteur?.p;
    if (!fini(p) || l.moteur?.choix === null || l.moteur?.choix === undefined || l.issue === null || l.issue === undefined || l.reglable === false) return;
    liste.push({ cle: caseDe(l.marketKey, l.ligne), famille: familleDe(l.marketKey), fixtureKey: l.fixtureKey, p, realise: l.moteur.choix === l.issue });
  };
  const rA = await rejouer({
    ...options,
    config: reglagesEnService,
    avancement: suivre('version en service'),
    surLigne: (l) => {
      if (l?.type !== 'ligne') return;
      A.set(l.cle, { v: l.mesures?.moteur?.perteLog ?? null, marche: l.mesures?.marche?.perteLog ?? null, fixtureKey: l.fixtureKey, date: l.date, sansLigne: `${l.fixtureKey}|${l.marketKey}|${l.prix}` });
      retenu(l, calibA);
    }
  });
  sortie.moteurs.a = rA?.moteur?.empreinte ?? null;
  if (rA?.bilan?.erreur) return { ...sortie, erreur: `rejeu de la version en service : ${rA.bilan.erreur}`, dureeMs: Math.round(performance.now() - debut) };

  // B : la candidate, appariée ligne à ligne à A (la clé complète : même match, marché, ligne et jeu de prix).
  const sansLigneA = new Set([...A.values()].map((x) => x.sansLigne));
  const sansLigneB = new Set();
  const vuesB = new Set();
  const lignes = [];
  // Étape 27 : par case (famille × ligne), la candidate face au repère et, sur la ligne 2,5, face au marché.
  const faceAuRepere = new Map();
  const faceAuMarche = new Map();
  const pousser = (m, cle, x) => {
    if (!m.has(cle)) m.set(cle, []);
    m.get(cle).push(x);
  };
  const rB = await rejouer({
    ...options,
    config: reglagesCandidate,
    // Sa déclaration : ses vues étiquettent ses lignes (« candidate:… ») et l'étiquette du rejeu n'est plus « incomplete ».
    declaration: { etape: candidate.etape, version: candidate.id, vues: Array.isArray(candidate.vues) ? candidate.vues : [] },
    avancement: suivre('candidate'),
    surLigne: (l) => {
      if (l?.type !== 'ligne') return;
      const sansLigne = `${l.fixtureKey}|${l.marketKey}|${l.prix}`;
      sansLigneB.add(sansLigne);
      vuesB.add(l.cle);
      const x = A.get(l.cle);
      if (!x) {
        if (sansLigneA.has(sansLigne)) sortie.ecartees.lignesDifferentes++;
        else sortie.ecartees.sansPaire++;
        return;
      }
      const vb = l.mesures?.moteur?.perteLog ?? null;
      retenu(l, calibB);
      if (!fini(x.v) || !fini(vb)) {
        sortie.ecartees.nonReglable++;
        return;
      }
      lignes.push({ bloc: x.fixtureKey, match: x.fixtureKey, cle: l.cle, date: x.date, a: x.v, b: vb, marketKey: l.marketKey, ligne: l.ligne });
      const vr = l.mesures?.repere?.perteLog ?? null;
      if (fini(vr)) pousser(faceAuRepere, caseDe(l.marketKey, l.ligne), { bloc: x.fixtureKey, match: x.fixtureKey, cle: l.cle, a: vr, b: vb });
      const vm = l.mesures?.marche?.perteLog ?? null;
      if (fini(vm)) pousser(faceAuMarche, caseDe(l.marketKey, l.ligne), { bloc: x.fixtureKey, match: x.fixtureKey, cle: l.cle, a: vm, b: vb, enService: x.v });
    }
  });
  sortie.moteurs.b = rB?.moteur?.empreinte ?? null;
  if (rB?.bilan?.erreur) return { ...sortie, erreur: `rejeu de la candidate : ${rB.bilan.erreur}`, dureeMs: Math.round(performance.now() - debut) };
  for (const [cle, x] of A) {
    if (vuesB.has(cle)) continue;
    if (sansLigneB.has(x.sansLigne)) sortie.ecartees.lignesDifferentes++;
    else sortie.ecartees.sansPaire++;
  }

  // Le juge de l'étape 16, la fourchette élargie pour toutes les variantes déclarées de l'étape de la candidate — et
  // au moins la candidate et ses variantes déclarées (étape 27 : avant sa mise en essai, le registre n'en a aucune).
  const variantes = Math.max(1, variantesDuBanc(candidate, registre));
  const j = comparer(lignes, { mode: 'moyenne', sens: 'min', variantes, graine, tirages });
  const base = j.a.moyenne;
  const echelle = fini(base) && base !== 0 ? 100 / Math.abs(base) : 100;
  // « Déjà vu » pour le MOTEUR (correction du 19/10) : le 23/09, les vues « moteur » des lancements, et la déclaration de la candidate.
  const fenetres = fenetresDeclarees({ portee: 'moteur', declaration: { etape: candidate.etape, version: candidate.id, vues: Array.isArray(candidate.vues) ? candidate.vues : [] } });
  const dansVues = lignes.filter((l) => fenetres.some((f) => l.date >= f.de && l.date <= f.a)).length;
  // Étape 27 : famille par famille et case par case (même K), la candidate face au repère et au marché, la calibration du
  // pronostic retenu de chaque version (juge de l'étape 20, même K), les régimes du modèle de buts (provenances).
  const parFamille = new Map();
  const parCase = new Map();
  for (const l of lignes) {
    pousser(parFamille, familleDe(l.marketKey), l);
    pousser(parCase, caseDe(l.marketKey, l.ligne), l);
  }
  const marcheEnService = new Map([...faceAuMarche].map(([cle, ls]) => [cle, ls.map((x) => ({ ...x, b: x.enService }))]));
  return {
    ...sortie,
    paires: lignes.length,
    matchs: j.n.matchs,
    variantes,
    a: arrondi(j.a.moyenne),
    b: arrondi(j.b.moyenne),
    gainPct: fini(j.gain) ? arrondi(j.gain * echelle, 3) : null,
    fourchettePct: Array.isArray(j.fourchette) ? j.fourchette.map((x) => arrondi(x * echelle, 3)) : null,
    verdict: j.verdict,
    raison: j.raison,
    dejaVues: { lignes: dansVues, part: lignes.length ? arrondi(dansVues / lignes.length, 4) : null, vuesDeclarees: Array.isArray(candidate.vues) },
    parFamille: jugerParGroupe(parFamille, { variantes, graine, tirages }),
    parCase: jugerParGroupe(parCase, { variantes, graine, tirages }),
    faceAuRepere: jugerParGroupe(faceAuRepere, { variantes, graine, tirages }),
    faceAuMarche: { candidate: jugerParGroupe(faceAuMarche, { variantes, graine, tirages }), enService: jugerParGroupe(marcheEnService, { variantes, graine, tirages }) },
    calibration: { a: calibrationDe(calibA, { variantes }), b: calibrationDe(calibB, { variantes }) },
    regimes: rB?.bilan?.regimes ?? null,
    dureeMs: Math.round(performance.now() - debut)
  };
}

// ===================================================================== étape 27 : la porte 1 au banc

/** Le nom d'une case (famille × ligne) pour Pierre : dans bench/libellesDesCases.js (léger, partagé avec la feuille de route). */
export { libelleDeLaCase };

/** Un verdict du juge (perte log ou calibration) en mots, pour les phrases de la porte : jamais un code (« dans-le-hasard »). */
const MOTS_DU_VERDICT = Object.freeze({
  retenu: 'retenu',
  'pas-prouve': 'pas prouvé',
  'moins-bon': 'moins bon',
  'pas-assez-de-matchs': 'pas assez de matchs',
  'dans-le-hasard': 'dans le hasard',
  'trop-haut': 'annonce trop haut',
  'trop-bas': 'annonce trop bas',
  'trop-peu': 'trop peu de pronostics'
});
export const motDuVerdict = (v) => (typeof v === 'string' && v ? MOTS_DU_VERDICT[v] ?? v : 'pas jugé');

/**
 * LA PORTE 1 de l'étape 27 (conception §2.4), sur un jugement du banc de la candidate (jugerLaCandidateAuBanc, prix
 * d'avant-match) : en bloc « retenu » ; chaque famille « retenu » ; aucune ligne « moins bon » face à la version en
 * service ; aucune ligne « moins bon » face au repère ; le pronostic retenu du +/−2,5 de la candidate « dans le
 * hasard » ; et, sur chaque ligne que le juge de la calibration PEUT TRANCHER — au moins `minimum` pronostics
 * retenus (JUGE.minBlocs : 200) pour les DEUX versions —, un biais de la candidate pas plus grand que celui de la
 * version en service. Une ligne où l'une des deux versions a moins de pronostics n'est pas jugée sur ce point
 * (le juge dirait « trop peu ») : elle est rapportée dans `nonJugees`, et si l'écart de la candidate y est plus
 * grand, en `reserves`, avec son sens (« prudent » : la candidate annonce moins que ce qui arrive ; « optimiste » :
 * plus). Pur. Rend { franchie, criteres: [{ cle, ok, texte }], nonJugees, reserves }.
 */
export function porteDuBanc(j, { minimum = JUGE.minBlocs } = {}) {
  const criteres = [];
  const critere = (cle, ok, texte) => criteres.push({ cle, ok: Boolean(ok), texte });
  critere('en-bloc', j?.verdict === 'retenu', `En bloc face à la version en service : ${motDuVerdict(j?.verdict)}.`);
  for (const [f, x] of Object.entries(j?.parFamille ?? {})) critere(`famille:${f}`, x?.verdict === 'retenu', `${libelleDeLaCase(f)} : ${motDuVerdict(x?.verdict)}.`);
  const moinsBonnes = Object.entries(j?.parCase ?? {}).filter(([, x]) => x?.verdict === 'moins-bon').map(([k]) => k);
  critere('lignes', moinsBonnes.length === 0, moinsBonnes.length ? `Lignes moins bonnes que la version en service : ${moinsBonnes.map(libelleDeLaCase).join(', ')}.` : 'Aucune ligne moins bonne que la version en service.');
  const moinsBonnesRepere = Object.entries(j?.faceAuRepere ?? {}).filter(([, x]) => x?.verdict === 'moins-bon').map(([k]) => k);
  critere('repere', moinsBonnesRepere.length === 0, moinsBonnesRepere.length ? `Lignes moins bonnes que le repère : ${moinsBonnesRepere.map(libelleDeLaCase).join(', ')}.` : 'Aucune ligne moins bonne que le repère.');
  const a = j?.calibration?.a?.parCase ?? {};
  const b = j?.calibration?.b?.parCase ?? {};
  const deuxCinq = b['totalGoals|2.5'] ?? null;
  critere('calibration-2,5', deuxCinq?.verdict === 'dans-le-hasard', `Plus/moins 2,5 buts, pronostic retenu de la candidate : ${motDuVerdict(deuxCinq?.verdict)}.`);
  const nonJugees = [];
  const reserves = [];
  const plusGrands = [];
  for (const cle of Object.keys(b).sort()) {
    const x = a[cle];
    const y = b[cle];
    if (!x || !y || !fini(x.biais) || !fini(y.biais)) continue;
    const jugeable = (x.matchs ?? x.pronostics ?? 0) >= minimum && (y.matchs ?? y.pronostics ?? 0) >= minimum;
    const plusGrand = Math.abs(y.biais) > Math.abs(x.biais);
    if (!jugeable) {
      nonJugees.push({ cle, pronostics: { enService: x.pronostics ?? null, candidate: y.pronostics ?? null }, biais: { enService: x.biais, candidate: y.biais } });
      if (plusGrand) {
        const sens = y.biais > 0 ? 'prudent' : 'optimiste';
        reserves.push({ cle, sens, texte: `trop peu de pronostics pour juger la calibration de ${libelleDeLaCase(cle).toLowerCase()} ; l’écart va du côté ${sens}` });
      }
      continue;
    }
    if (plusGrand) plusGrands.push(cle);
  }
  critere('calibration-lignes', plusGrands.length === 0, plusGrands.length ? `Lignes où la candidate se trompe davantage que la version en service (au moins ${minimum} pronostics de chaque côté) : ${plusGrands.map(libelleDeLaCase).join(', ')}.` : `Sur chaque ligne d’au moins ${minimum} pronostics de chaque côté, la candidate ne se trompe pas davantage que la version en service.`);
  return { franchie: criteres.every((c) => c.ok), criteres, nonJugees, reserves };
}
