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
 * dite : DONNEES_VUES, et celles que la candidate déclare), et il ne dit rien
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
import { DONNEES_VUES } from './lancements.js';

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

  // A : la version en service. On ne garde, par ligne, que sa perte log et de quoi l'apparier.
  const A = new Map();
  const rA = await rejouer({
    ...options,
    config: reglagesEnService,
    avancement: suivre('version en service'),
    surLigne: (l) => {
      if (l?.type !== 'ligne') return;
      A.set(l.cle, { v: l.mesures?.moteur?.perteLog ?? null, fixtureKey: l.fixtureKey, date: l.date, sansLigne: `${l.fixtureKey}|${l.marketKey}|${l.prix}` });
    }
  });
  sortie.moteurs.a = rA?.moteur?.empreinte ?? null;
  if (rA?.bilan?.erreur) return { ...sortie, erreur: `rejeu de la version en service : ${rA.bilan.erreur}`, dureeMs: Math.round(performance.now() - debut) };

  // B : la candidate, appariée ligne à ligne à A (la clé complète : même match, marché, ligne et jeu de prix).
  const sansLigneA = new Set([...A.values()].map((x) => x.sansLigne));
  const sansLigneB = new Set();
  const vuesB = new Set();
  const lignes = [];
  const rB = await rejouer({
    ...options,
    config: reglagesCandidate,
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
      if (!fini(x.v) || !fini(vb)) {
        sortie.ecartees.nonReglable++;
        return;
      }
      lignes.push({ bloc: x.fixtureKey, match: x.fixtureKey, cle: l.cle, date: x.date, a: x.v, b: vb });
    }
  });
  sortie.moteurs.b = rB?.moteur?.empreinte ?? null;
  if (rB?.bilan?.erreur) return { ...sortie, erreur: `rejeu de la candidate : ${rB.bilan.erreur}`, dureeMs: Math.round(performance.now() - debut) };
  for (const [cle, x] of A) {
    if (vuesB.has(cle)) continue;
    if (sansLigneB.has(x.sansLigne)) sortie.ecartees.lignesDifferentes++;
    else sortie.ecartees.sansPaire++;
  }

  // Le juge de l'étape 16, la fourchette élargie pour toutes les variantes déclarées de l'étape de la candidate.
  const variantes = Math.max(1, compterVariantes(candidate.etape, registre));
  const j = comparer(lignes, { mode: 'moyenne', sens: 'min', variantes, graine, tirages });
  const base = j.a.moyenne;
  const echelle = fini(base) && base !== 0 ? 100 / Math.abs(base) : 100;
  const fenetres = [...DONNEES_VUES.map((f) => ({ de: f.de, a: f.a })), ...(candidate.vues ?? []).map((f) => ({ de: f.de, a: f.a }))];
  const dansVues = lignes.filter((l) => fenetres.some((f) => l.date >= f.de && l.date <= f.a)).length;
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
    dureeMs: Math.round(performance.now() - debut)
  };
}
