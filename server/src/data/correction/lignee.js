/**
 * lignee.js — LA LIGNÉE de la version du moteur en service, et le temps où elle a servi (étape 26, 27/10/2026).
 * -----------------------------------------------------------------------
 * Pur : travaille sur le CONTENU du registre des versions (data/runtime/engine-versions.json, lu par l'appelant
 * avec readJsonFile, comme deriveMoteur.js) ; ne lit ni n'écrit aucun fichier, aucune base, aucune horloge.
 *
 * La LIGNÉE d'une version = les versions du registre qui donnent EXACTEMENT les mêmes probabilités : même
 * empreinte du code du moteur ET mêmes réglages une fois retirés les réglages de pari (regles.js,
 * REGLAGES_DE_PARI — ils décident d'une mise, jamais d'une probabilité). Exemple réel : les versions 4 (22/10,
 * code) et 5 (23/10, vos bookmakers seuls) forment une lignée ; 1, 2 et 3 chacune la leur.
 *
 * La CHRONOLOGIE dit quelle version était en service, et quand, d'après le journal du registre (création,
 * remise en service, retour arrière, adoption). La lignée jugée pour le mois M est celle de la version en service
 * à la FIN de M (déterministe : elle ne dépend pas de l'heure du tri) ; sa COUVERTURE dit si elle a servi tout le
 * mois (du 1er à 00:00 UTC au dernier jour à 24:00 UTC, les jours des matchs d'engine_picks étant des jours UTC)
 * ou une partie seulement (un « mois partiel » : ses seules lignes comptent, regles.js MOIS_PARTIELS).
 * Un registre dont le journal manque ou ne retombe pas sur la version en service n'est JAMAIS deviné : la
 * chronologie rend son problème et le tri attend.
 * -----------------------------------------------------------------------
 */

import crypto from 'node:crypto';
import { empreinteDesReglages } from '../../core/engine/engineVersions.js';
import { REGLAGES_DE_PARI } from './regles.js';

const sha1 = (t) => crypto.createHash('sha1').update(t).digest('hex');
const objetSimple = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const instant = (x) => {
  const t = Date.parse(x ?? '');
  return Number.isFinite(t) ? t : null;
};
const iso = (t) => new Date(t).toISOString();
const MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Les réglages d'un sport SANS les réglages de pari : une COPIE PROFONDE (l'objet reçu n'est jamais touché). */
export function sansReglagesDePari(reglages) {
  const copie = objetSimple(reglages) ? JSON.parse(JSON.stringify(reglages)) : {};
  for (const cle of REGLAGES_DE_PARI) delete copie[cle];
  return copie;
}

/** L'empreinte des PRONOSTICS d'une version : son code et ses réglages hors réglages de pari (sha1, 40 caractères). */
export function empreinteDesPronostics(version) {
  const code = String(version?.code?.empreinte ?? '');
  return sha1(`${code}|${empreinteDesReglages(sansReglagesDePari(version?.reglages?.football))}`);
}

const versionDe = (brut, numero) => (Array.isArray(brut?.versions) ? brut.versions.find((v) => v?.numero === numero) ?? null : null);

/**
 * La lignée d'une version : { versions: [numéros, croissants], empreinte, code (12), avecModeleDeButs }, ou null si
 * la version n'est pas au registre. `avecModeleDeButs` : la version porte la clé `modeleDeButs` (le régime du
 * moteur, qui décide des réglages qu'on peut proposer).
 */
export function ligneeDe(brut, numero) {
  const v = versionDe(brut, numero);
  if (!v) return null;
  const empreinte = empreinteDesPronostics(v);
  const versions = brut.versions.filter((x) => Number.isInteger(x?.numero) && empreinteDesPronostics(x) === empreinte).map((x) => x.numero).sort((a, b) => a - b);
  const mdb = v.reglages?.football?.modeleDeButs;
  return { versions, empreinte, code: String(v.code?.empreinte ?? '').slice(0, 12), avecModeleDeButs: mdb !== undefined && mdb !== null };
}

/** Les actions du journal qui mettent une version en service. */
const ACTIONS_DE_SERVICE = new Set(['creation', 'remise-en-service', 'retour', 'adoption']);

/**
 * La CHRONOLOGIE du registre : { periodes: [{ version, de, a }] (a = null : en service aujourd'hui), probleme } —
 * les entrées du journal triées par heure (stable), une période par changement de version en service ; deux
 * entrées de la même version (une adoption note aussi sa création, à la même heure) n'en font qu'une. `probleme`
 * (texte) quand on ne peut pas savoir : registre illisible, journal absent, une version inconnue, ou un journal
 * qui ne finit pas sur la version en service.
 */
export function chronologie(brut) {
  if (!objetSimple(brut) || !Array.isArray(brut.versions)) return { periodes: [], probleme: 'le registre des versions n’est pas lisible' };
  if (!Array.isArray(brut.journal) || !brut.journal.length) return { periodes: [], probleme: 'le journal du registre des versions est absent : on ne sait pas quelle version servait quand' };
  const entrees = brut.journal
    .map((e, i) => ({ e, i, t: instant(e?.le) }))
    .filter(({ e, t }) => ACTIONS_DE_SERVICE.has(e?.action) && Number.isInteger(e?.version) && t !== null)
    .sort((x, y) => x.t - y.t || x.i - y.i);
  const periodes = [];
  for (const { e, t } of entrees) {
    if (!versionDe(brut, e.version)) return { periodes: [], probleme: `le journal met en service la version ${e.version}, absente du registre` };
    const courante = periodes.at(-1);
    if (courante && courante.version === e.version) continue;
    if (courante) courante.a = iso(t);
    periodes.push({ version: e.version, de: iso(t), a: null });
  }
  if (!periodes.length) return { periodes: [], probleme: 'le journal du registre des versions ne met aucune version en service' };
  if (periodes.at(-1).version !== brut.enService) return { periodes: [], probleme: `le journal finit sur la version ${periodes.at(-1).version} mais le registre dit la ${String(brut.enService)} en service` };
  return { periodes, probleme: null };
}

/** Le premier instant d'un mois « AAAA-MM » (UTC) et le premier du mois suivant. */
export function bornesUtcDuMois(mois) {
  const m = MOIS.exec(String(mois));
  if (!m) throw new RangeError(`Mois illisible : « ${String(mois)} » (AAAA-MM attendu).`);
  const a = Number(m[1]);
  const n = Number(m[2]);
  return { debut: Date.UTC(a, n - 1, 1), fin: Date.UTC(a, n, 1) };
}

/** La version en service à un instant (la période qui le contient), ou null avant la première. */
export function versionEnServiceA(periodes, t) {
  let trouvee = null;
  for (const p of periodes) {
    const de = instant(p.de);
    const a = p.a === null ? Infinity : instant(p.a);
    if (de <= t && t < a) trouvee = p.version;
  }
  return trouvee;
}

/**
 * Le temps où une lignée a servi pendant un mois : { complet, partiel, depuis, jours, periodes } — `periodes` : ses
 * périodes coupées au mois ; `complet` : elle a servi sans interruption du 1er à 00:00 UTC au dernier jour à 24:00
 * UTC ; `depuis` : le début de sa dernière période dans le mois (« en service depuis le … ») ; `jours` : la part du
 * mois couverte, en jours.
 */
export function couvertureDuMois(periodes, mois, versions) {
  const { debut, fin } = bornesUtcDuMois(mois);
  const garder = new Set(versions ?? []);
  const morceaux = [];
  for (const p of periodes ?? []) {
    if (!garder.has(p.version)) continue;
    const de = Math.max(debut, instant(p.de));
    const a = Math.min(fin, p.a === null ? Infinity : instant(p.a));
    if (a > de) morceaux.push({ version: p.version, de, a });
  }
  morceaux.sort((x, y) => x.de - y.de);
  // Des périodes qui se touchent (deux sœurs de la lignée, l'une après l'autre) forment un seul temps de service.
  const unis = [];
  for (const m of morceaux) {
    const dernier = unis.at(-1);
    if (dernier && m.de <= dernier.a) dernier.a = Math.max(dernier.a, m.a);
    else unis.push({ de: m.de, a: m.a });
  }
  const couvert = unis.reduce((t, u) => t + (u.a - u.de), 0);
  const complet = unis.length === 1 && unis[0].de === debut && unis[0].a === fin;
  return {
    complet,
    partiel: !complet,
    depuis: unis.length ? iso(unis.at(-1).de) : null,
    jours: Math.round((couvert / 86_400_000) * 100) / 100,
    periodes: morceaux.map((m) => ({ version: m.version, de: iso(m.de), a: iso(m.a) }))
  };
}

/**
 * LA LIGNÉE JUGÉE POUR LE MOIS M : celle de la version en service à la fin de M, avec sa couverture du mois.
 * Rend { versionEnService, versions, empreinte, code, avecModeleDeButs, enServiceDepuis, couverture } ; null si
 * aucune version n'était encore en service à la fin de M ; lève une RangeError pour un mois illisible. `probleme`
 * (chronologie) : rendu tel quel, jamais deviné — l'appelant attend.
 */
export function ligneeALaFinDu(brut, mois) {
  const chrono = chronologie(brut);
  if (chrono.probleme) return { probleme: chrono.probleme };
  const { fin } = bornesUtcDuMois(mois);
  const numero = versionEnServiceA(chrono.periodes, fin - 1);
  if (numero === null) return null;
  const l = ligneeDe(brut, numero);
  return {
    versionEnService: numero,
    versions: l.versions,
    empreinte: l.empreinte,
    code: l.code,
    avecModeleDeButs: l.avecModeleDeButs,
    enServiceDepuis: debutDeLaLignee(chrono.periodes, l.versions, fin),
    couverture: couvertureDuMois(chrono.periodes, mois, l.versions)
  };
}

/** Le mois M est-il entièrement couvert par la lignée ? (null si on ne peut pas le savoir.) */
export function moisCouvert(brut, mois, lignee) {
  const chrono = chronologie(brut);
  if (chrono.probleme || !lignee?.versions) return null;
  return couvertureDuMois(chrono.periodes, mois, lignee.versions).complet;
}

/**
 * Depuis quand la lignée sert SANS INTERRUPTION avant l'instant `avant` (par défaut : aujourd'hui) : le début de
 * la suite de périodes de ses versions qui se touchent et finit le plus tard avant `avant`, ou null.
 */
export function debutDeLaLignee(periodes, versions, avant = Infinity) {
  const garder = new Set(versions ?? []);
  let depuis = null;
  let finPrecedente = null;
  for (const p of periodes ?? []) {
    const de = instant(p.de);
    if (de >= avant) break;
    if (!garder.has(p.version)) {
      depuis = null;
      finPrecedente = null;
      continue;
    }
    if (depuis === null || finPrecedente === null || de > finPrecedente) depuis = de;
    finPrecedente = p.a === null ? Infinity : instant(p.a);
  }
  return depuis === null ? null : iso(depuis);
}
