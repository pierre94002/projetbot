/**
 * simulationMatchsEnfant.js — LES DÉROULÉS SIMULÉS DE LA NUIT dans un PROCESSUS À PART (étape 28 du plan, conception
 * §4.2 et §4.4). Lancé par simulationNuit.js (fork, sérialisation « avancée », argument « --enfant-simulation ») ;
 * ce n'est pas un script à lancer à la main.
 *
 * N'OUVRE AUCUNE BASE ni aucun fichier : il reçoit les entrées de chaque rencontre ({ cle, role, lambda, mu, rho, seed,
 * n }, la grille « modele-buts-441 » seulement — l'ancienne grille n'est jamais tirée) et la graine du jour ; il tire
 * les chemins (simulerMatch, stratifiés sur grilleDesButs(λ, μ, ρ)), range chaque rencontre en TABLE JOINTE et en
 * marchés de déroulé (6 décimales), puis REFAIT jusqu'à 40 rencontres tirées avec la graine du jour : la table doit
 * être identique à l'octet (sinon le contrôle échoue et le serveur ne range rien). Renvoie les rencontres par morceaux
 * ({ morceau: [...] }), puis la fin ({ fin: true, controle, bilan }) ou { erreur }, et s'arrête.
 * Avec `sansEffets: true` dans le message (le contrôle du juge, UNE fois à l'horizon, F6) : les mêmes rencontres
 * rejouées SANS les effets du score ni rouges (la variante C de la mesure v1), marchés seulement, sans table ni contrôle.
 * Ni horloge (les durées : performance.now), ni hasard non amorcé, ni réseau.
 */

import { grilleDesButs } from '../../core/engine/goalModel.js';
import { simulerMatch, tableJointe, marchesDesChemins, generateur } from './simulationMatch.js';
import { PARAMS, N } from './reglages.js';

/** Rencontres par morceau renvoyé au serveur (une table jointe fait ~2,5 Ko). */
export const RENCONTRES_PAR_MORCEAU = 50;
/** Le contrôle de la nuit : 40 rencontres refaites (F1). */
export const RENCONTRES_DU_CONTROLE = 40;

/** Le déroulé simulé d'une rencontre : la table jointe (octets) et les marchés de déroulé (texte JSON, 6 décimales). */
export function deroulerUneRencontre({ lambda, mu, rho, seed, n = N }, { params = PARAMS } = {}) {
  const grille = grilleDesButs(lambda, mu, rho);
  const chemins = simulerMatch({ lambda, mu, grille, params, n, seed });
  return { table: tableJointe(chemins), marches: JSON.stringify(marchesDesChemins(chemins)), masseNonCouverte: chemins.masseNonCouverte, tailleEffective: chemins.tailleEffective };
}

const memesOctets = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * LE CALCUL (le même dans l'enfant et, pour un essai, dans le processus appelant) : `items` : [{ cle, role, lambda,
 * mu, rho, seed, n }] ; `graineDuJour` : la graine du contrôle (AAAAMMJJ de la nuit) ; `surMorceau(liste)` reçoit
 * les rencontres par morceaux. Rend { controle: { lignes, ecarts: [{ cle, role }] }, bilan: { rencontres, dureeMs } }.
 */
export function calculerLesDeroules({ items = [], graineDuJour = 1, surMorceau = () => {}, params = PARAMS } = {}) {
  const t0 = performance.now();
  const faits = [];
  let morceau = [];
  for (const it of items) {
    const d = deroulerUneRencontre(it, { params });
    const sortie = { cle: it.cle, role: it.role, seed: it.seed, n: it.n ?? N, ...d };
    faits.push(sortie);
    morceau.push(sortie);
    if (morceau.length >= RENCONTRES_PAR_MORCEAU) {
      surMorceau(morceau);
      morceau = [];
    }
  }
  if (morceau.length) surMorceau(morceau);
  // Le contrôle : jusqu'à 40 rencontres, tirées avec la graine du jour, refaites ; même table à l'octet, mêmes marchés.
  const u = generateur(Number(graineDuJour) || 1);
  const indices = items.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(u() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const choisis = indices.slice(0, Math.min(RENCONTRES_DU_CONTROLE, indices.length));
  const ecarts = [];
  for (const i of choisis) {
    const refait = deroulerUneRencontre(items[i], { params });
    if (!memesOctets(refait.table, faits[i].table) || refait.marches !== faits[i].marches) ecarts.push({ cle: items[i].cle, role: items[i].role });
  }
  return { controle: { lignes: choisis.length, ecarts }, bilan: { rencontres: items.length, dureeMs: Math.round(performance.now() - t0) } };
}

/**
 * Les réglages SANS EFFETS NI ROUGES : multiplicateurs de buts à 1 quel que soit l'état, aucun rouge — la variante C
 * de la mesure v1 (mesures/preuve/v1-split.mjs : `PC`), déclarée « sim-stratifiee-sans-effets » (lancements.js).
 */
export const PARAMS_SANS_EFFETS = Object.freeze({
  ...PARAMS,
  MH: Object.freeze(new Array(PARAMS.MH.length).fill(1)),
  MA: Object.freeze(new Array(PARAMS.MA.length).fill(1)),
  rougeBande: Object.freeze(new Array(PARAMS.rougeBande.length).fill(0))
});

/**
 * LE CONTRÔLE « SANS EFFETS » du juge (F6, une fois à l'horizon) : `items` comme calculerLesDeroules (la graine de
 * chaque rencontre, celle de sa ligne rangée), tirés avec PARAMS_SANS_EFFETS ; `surMorceau(liste)` reçoit
 * [{ cle, role, marches (texte JSON, 6 décimales) }]. Ni table ni contrôle de graine. Rend { bilan: { rencontres, dureeMs } }.
 */
export function calculerSansEffets({ items = [], surMorceau = () => {} } = {}) {
  const t0 = performance.now();
  let morceau = [];
  for (const it of items) {
    const chemins = simulerMatch({ lambda: it.lambda, mu: it.mu, grille: grilleDesButs(it.lambda, it.mu, it.rho), params: PARAMS_SANS_EFFETS, n: it.n ?? N, seed: it.seed });
    morceau.push({ cle: it.cle, role: it.role, marches: JSON.stringify(marchesDesChemins(chemins)) });
    if (morceau.length >= RENCONTRES_PAR_MORCEAU) {
      surMorceau(morceau);
      morceau = [];
    }
  }
  if (morceau.length) surMorceau(morceau);
  return { bilan: { rencontres: items.length, dureeMs: Math.round(performance.now() - t0) } };
}

// ------------------------------------------------------------ le processus à part
if (process.argv.includes('--enfant-simulation') && typeof process.send === 'function') {
  process.once('message', ({ items, graineDuJour, sansEffets = false }) => {
    try {
      let rssMax = process.memoryUsage.rss();
      const surMorceau = (liste) => {
        rssMax = Math.max(rssMax, process.memoryUsage.rss());
        process.send({ morceau: liste });
      };
      const r = sansEffets ? { controle: null, ...calculerSansEffets({ items: items ?? [], surMorceau }) } : calculerLesDeroules({ items: items ?? [], graineDuJour, surMorceau });
      rssMax = Math.max(rssMax, process.memoryUsage.rss());
      process.send({ fin: true, controle: r.controle, bilan: { ...r.bilan, aPart: { pid: process.pid, rssMaxOctets: rssMax, rssFinOctets: process.memoryUsage.rss() } } }, () => process.exit(0));
    } catch (error) {
      process.send({ erreur: String(error?.message ?? error) }, () => process.exit(0));
    }
  });
}
