/**
 * apparier.js — deux rejeux face à face, ou un rejeu face aux pronostics gelés (étape 19 du plan, 13/10/2026).
 * -----------------------------------------------------------------------
 * Le juge (guard.js) ne compare que des LIGNES APPARIÉES : la même rencontre,
 * le même marché, la même ligne de buts, le même jeu de prix — jamais un
 * match de A face à un autre match de B. Clé d'une ligne :
 * `fixtureKey|marketKey|ligne|prix` (cleDeLigne, periodes.js) : fixtureKey =
 * cleDuMatch des pronostics gelés (gelPronostics.js), marketKey = la clé du
 * moteur (cleDuMarche) — un rejeu s'apparie donc aussi aux `engine_picks` de
 * la vraie appli.
 *
 * Le FORMAT D'ÉCHANGE (FORMAT_ECHANGE = 1), JSON Lines : un en-tête
 * `{ formatEchange, versionBanc, moteur: { empreinte, empreinteCode, version },
 * options, reglement: 'bp90' }`, puis une ligne par match × marché × jeu de
 * prix (et les paris). `bench.mjs --lignes` l'écrit, `--comparer` le lit
 * ligne à ligne et ne garde que { cle, bloc, a, b } : deux fichiers de
 * plusieurs centaines de Mo tiennent en mémoire.
 *
 * L'étape 47 rejouera le moteur de départ (son commit) et le moteur final sur
 * les mêmes matchs d'après le lancement, puis `--comparer depart.jsonl
 * final.jsonl --etapes 27,28,…` : le nombre de variantes essayées par les
 * étapes adoptées fait la fourchette — sans lui, pas de verdict.
 * Aucune base ouverte ici (le seul lecteur reçoit celle de l'appelant).
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import readline from 'node:readline';
import { comparer, LignesInvalides } from './guard.js';
import { compterVariantes } from './trialsRegistry.js';
import { FORMAT_ECHANGE, VERSION_BANC } from './periodes.js';
import { cleDuMarche } from '../data/enregistreurs/gelPronostics.js';
import { memeDistribution, ECART_DE_DISTRIBUTION } from '../data/enregistreurs/depot.js';

/** Un fichier d'échange d'une autre forme, ou deux fichiers qui ne se comparent pas : rien n'est jugé. */
export class EchangeInvalide extends Error {}

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const MESURES_APPARIABLES = Object.freeze({ 'perte-log': (l) => l?.mesures?.moteur?.perteLog ?? null, brier: (l) => l?.mesures?.moteur?.brier ?? null });

/** La clé « sans la ligne » d'une ligne : pour reconnaître deux pronostics retenus à des lignes différentes. */
const cleSansLigne = (l) => `${l.fixtureKey}|${l.marketKey}|${l.prix}`;
const blocDe = (l, bloc) => (bloc === 'journee' ? `${l.date}|${l.league ?? ''}` : l.fixtureKey);

/**
 * Deux rejeux face à face (lignes d'échange, type 'ligne'). Appariées par la clé COMPLÈTE (la ligne comprise :
 * les distributions se comparent sur la même ligne, jamais deux pronostics retenus différents). Comptées :
 * sansPaire (présente d'un seul côté), lignesDifferentes (le même match, marché et jeu, une autre ligne
 * retenue), nonReglable (sans mesure d'un côté). Rend { lignes, ecartees } — les lignes du mode moyenne.
 */
export function apparierRejeux({ lignesA, lignesB, mesure = 'perte-log', bloc = 'match' } = {}) {
  const lire = MESURES_APPARIABLES[mesure];
  if (!lire) throw new LignesInvalides(`Mesure inconnue pour apparier : « ${String(mesure)} » (${Object.keys(MESURES_APPARIABLES).join(', ')}).`);
  const indexer = (liste) => {
    const m = new Map();
    for (const l of liste ?? []) if (l?.type === 'ligne' || l?.type === undefined) m.set(l.cle, l);
    return m;
  };
  const A = indexer(lignesA);
  const B = indexer(lignesB);
  const ecartees = { sansPaire: 0, lignesDifferentes: 0, nonReglable: 0 };
  const sansLigneB = new Set([...B.values()].map(cleSansLigne));
  const sansLigneA = new Set([...A.values()].map(cleSansLigne));
  const lignes = [];
  for (const [cle, a] of A) {
    const b = B.get(cle);
    if (!b) {
      if (sansLigneB.has(cleSansLigne(a))) ecartees.lignesDifferentes++;
      else ecartees.sansPaire++;
      continue;
    }
    const va = lire(a);
    const vb = lire(b);
    if (!fini(va) || !fini(vb)) {
      ecartees.nonReglable++;
      continue;
    }
    lignes.push({ bloc: blocDe(a, bloc), match: a.fixtureKey, cle, date: a.date, a: va, b: vb });
  }
  for (const [cle, b] of B) {
    if (A.has(cle)) continue;
    if (sansLigneA.has(cleSansLigne(b))) ecartees.lignesDifferentes++;
    else ecartees.sansPaire++;
  }
  return { lignes, ecartees };
}

/** L'écrivain d'un fichier d'échange : l'en-tête, puis une ligne JSON par appel ; `fermer` à la fin. */
export function ecrivainDEchange(fichier, { moteur, options }) {
  const fd = fs.openSync(fichier, 'w');
  const ecrire1 = (o) => fs.writeSync(fd, `${JSON.stringify(o)}\n`);
  ecrire1({ formatEchange: FORMAT_ECHANGE, versionBanc: VERSION_BANC, moteur: { empreinte: moteur.empreinte, empreinteCode: moteur.empreinteCode, version: moteur.version ?? null }, options, reglement: 'bp90' });
  const etat = {
    lignes: 0,
    ecrire(l) {
      ecrire1(l);
      etat.lignes++;
    },
    fermer() {
      fs.closeSync(fd);
    }
  };
  return etat;
}

/** Lit un fichier d'échange ligne à ligne : l'en-tête (contrôlé), puis chaque ligne passée à `surLigne`. */
async function lireEchange(fichier, surLigne) {
  const flux = readline.createInterface({ input: fs.createReadStream(fichier, { encoding: 'utf8' }), crlfDelay: Infinity });
  let entete = null;
  for await (const texte of flux) {
    if (!texte.trim()) continue;
    const o = JSON.parse(texte);
    if (!entete) {
      entete = o;
      if (o?.formatEchange !== FORMAT_ECHANGE) throw new EchangeInvalide(`${fichier} : format d’échange ${String(o?.formatEchange)}, ${FORMAT_ECHANGE} attendu — deux formats différents ne se comparent pas.`);
      continue;
    }
    surLigne(o);
  }
  if (!entete) throw new EchangeInvalide(`${fichier} : fichier vide, aucun en-tête.`);
  return entete;
}

/**
 * `bench.mjs --comparer` : deux fichiers d'échange face à face. Exige le même format et le même règlement ;
 * rend les deux empreintes du moteur. `variantes` (un nombre) ou `etapes` (['27', '28'] : la somme de leurs
 * variantes déclarées au registre de la mesure) fait la fourchette ; sans l'un ni l'autre, le gain et sa
 * fourchette à une variante sont rendus, mais `verdict: null` — le nombre d'essais manque.
 */
export async function comparerDesFichiers({ fichierA, fichierB, mesure = 'perte-log', variantes = null, etapes = null, graine = 1, tirages = 1000, registre = {} } = {}) {
  const lire = MESURES_APPARIABLES[mesure];
  if (!lire) throw new EchangeInvalide(`Mesure inconnue : « ${String(mesure)} ».`);
  const A = new Map();
  const enteteA = await lireEchange(fichierA, (l) => {
    if (l.type !== 'ligne') return;
    A.set(l.cle, { v: lire(l), fixtureKey: l.fixtureKey, date: l.date, sansLigne: cleSansLigne(l) });
  });
  const sansLigneA = new Set([...A.values()].map((x) => x.sansLigne));
  const sansLigneB = new Set();
  const vuesB = new Set();
  const lignes = [];
  const ecartees = { sansPaire: 0, lignesDifferentes: 0, nonReglable: 0 };
  const enteteB = await lireEchange(fichierB, (l) => {
    if (l.type !== 'ligne') return;
    sansLigneB.add(cleSansLigne(l));
    vuesB.add(l.cle);
    const a = A.get(l.cle);
    if (!a) {
      if (sansLigneA.has(cleSansLigne(l))) ecartees.lignesDifferentes++;
      else ecartees.sansPaire++;
      return;
    }
    const vb = lire(l);
    if (!fini(a.v) || !fini(vb)) {
      ecartees.nonReglable++;
      return;
    }
    lignes.push({ bloc: a.fixtureKey, match: a.fixtureKey, cle: l.cle, date: a.date, a: a.v, b: vb });
  });
  for (const [cle, a] of A) {
    if (vuesB.has(cle)) continue;
    if (sansLigneB.has(a.sansLigne)) ecartees.lignesDifferentes++;
    else ecartees.sansPaire++;
  }
  if ((enteteA.reglement ?? null) !== (enteteB.reglement ?? null)) throw new EchangeInvalide(`Règlements différents (${enteteA.reglement} / ${enteteB.reglement}) : rien n'est jugé.`);
  let m = null;
  if (Number.isInteger(variantes) && variantes >= 1) m = variantes;
  else if (Array.isArray(etapes) && etapes.length) m = etapes.reduce((s, e) => s + compterVariantes(e, registre), 0);
  const j = comparer(lignes, { sens: 'min', variantes: m ?? 1, graine, tirages });
  return {
    formatEchange: FORMAT_ECHANGE,
    mesure,
    empreintes: { a: enteteA.moteur ?? null, b: enteteB.moteur ?? null },
    paires: lignes.length,
    ecartees,
    variantes: m,
    gain: j.gain,
    fourchette: j.fourchette,
    verdict: m === null ? null : j.verdict,
    raison: m === null ? 'Ni --variantes ni --etapes : sans le nombre de variantes essayées, le juge ne rend pas de verdict.' : j.raison,
    n: j.n
  };
}

// ------------------------------------------------------- face aux pronostics gelés

const parametres = (p) => {
  if (p === null || p === undefined || p === '') return {};
  if (typeof p === 'object') return p;
  try {
    return JSON.parse(p);
  } catch {
    return null;
  }
};
/** Le jeu de prix du banc qui correspond à la source des cotes d'un gel. */
const prixDuGel = (oddsSource) => (/the odds api/i.test(oddsSource ?? '') ? 'vos-bookmakers' : /gratuite/i.test(oddsSource ?? '') ? 'gratuites-avant-match' : 'sans-cote');

/** La distribution d'une ligne du banc dans la forme gelée ({ ligne?, equipe?, issues } à 4 décimales). */
function formeGelee(l) {
  const d = l?.moteur?.distribution;
  if (!d || Array.isArray(d) || d.pmf) return null;
  const issues = Object.fromEntries(Object.entries(d).map(([k, p]) => [k, Number(Number(p).toFixed(4))]));
  const equipe = l.marketKey?.includes(':') ? l.marketKey.split(':')[1] : null;
  return { ...(equipe ? { equipe } : {}), ...(l.ligne !== null && l.ligne !== undefined ? { ligne: l.ligne } : {}), issues };
}

/**
 * Un rejeu face aux PRONOSTICS GELÉS (engine_picks, forme de pronosticsGeles()). Seuls les gels « analyse au
 * coup d'envoi » se comparent (les autres comptés). Clé : fixtureKey | cleDuMarche | ligne. Jamais une égalité
 * exigée : chaque paire est `prixIdentiques` (le relevé du banc à la coupure est celui que le gel a lu :
 * même heure) ou `prixDifferents` ; `entreesRelues` quand une rencontre d'un des deux clubs, d'avant le jour
 * du match, a été réécrite après le gel (`updated_at` > `recorded_at` : un sur-ensemble, jamais un
 * diagnostic). L'égalité des distributions (ECART_DE_DISTRIBUTION) ne se compte que sur les paires à prix
 * identiques sans entrée relue ; les écarts (quantiles) sont rendus pour toutes.
 */
export function apparierAuxPronosticsGeles({ lignes, picks, database = null } = {}) {
  const parCle = new Map();
  for (const l of lignes ?? []) if (l?.type === 'ligne' || l?.type === undefined) parCle.set(`${l.fixtureKey}|${l.marketKey}|${l.ligne ?? '-'}|${l.prix}`, l);
  const relues = database ? database.prepare('SELECT COUNT(*) n FROM matches WHERE (home_id IN (?, ?) OR away_id IN (?, ?)) AND date < ? AND updated_at > ?') : null;
  const comptes = { origineNonComparable: 0, sansPaire: 0, prixIdentiques: 0, prixDifferents: 0, entreesRelues: 0, egales: 0, differentes: 0, comparees: 0 };
  const ecarts = [];
  const paires = [];
  for (const pick of picks ?? []) {
    if (pick.origin !== 'analyse-coup-d-envoi') {
      comptes.origineNonComparable++;
      continue;
    }
    const params = parametres(pick.params) ?? {};
    const marketKey = cleDuMarche({ marketId: pick.marketId, params });
    const prix = prixDuGel(pick.oddsSource);
    const ligneBanc = parCle.get(`${pick.fixtureKey}|${marketKey}|${params.line ?? '-'}|${prix}`);
    if (!ligneBanc) {
      comptes.sansPaire++;
      continue;
    }
    const identiques = Boolean(pick.oddsAt) && ligneBanc.prixReleveAt === pick.oddsAt;
    comptes[identiques ? 'prixIdentiques' : 'prixDifferents']++;
    const relue = relues ? relues.get(pick.homeId, pick.awayId, pick.homeId, pick.awayId, pick.date, pick.recordedAt).n > 0 : false;
    if (relue) comptes.entreesRelues++;
    const gelee = formeGelee(ligneBanc);
    let ecart = null;
    if (gelee && pick.distribution) {
      const d = typeof pick.distribution === 'string' ? JSON.parse(pick.distribution) : pick.distribution;
      ecart = Math.max(...Object.keys(d.issues ?? {}).map((k) => Math.abs((gelee.issues[k] ?? Number.NaN) - d.issues[k])));
      if (Number.isFinite(ecart)) ecarts.push(ecart);
      if (identiques && !relue) {
        comptes.comparees++;
        if (memeDistribution(JSON.stringify(gelee), pick.distribution)) comptes.egales++;
        else comptes.differentes++;
      }
    }
    paires.push({ cle: `${pick.fixtureKey}|${marketKey}|${params.line ?? '-'}`, prix, prixIdentiques: identiques, entreesRelues: relue, ecart });
  }
  const tries = [...ecarts].sort((x, y) => x - y);
  const q = (p) => (tries.length ? tries[Math.min(tries.length - 1, Math.floor(p * tries.length))] : null);
  return { paires, comptes, quantiles: { mediane: q(0.5), q90: q(0.9), max: tries.at(-1) ?? null }, seuil: ECART_DE_DISTRIBUTION };
}
