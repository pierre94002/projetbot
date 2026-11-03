/**
 * cartonsNuit.js — L'ÉTAPE DE NUIT « cartonsEtCorners » (étape 33 du plan, lot 1b, partie C1, 02/11/2026).
 * -----------------------------------------------------------------------
 * Chaque nuit, une fois par jour civil de Paris (jamais au clic ; ni réseau, ni Claude, rien de payant), APRÈS le contexte
 * du match et AVANT le contrôle quotidien (toujours dernier) — hors du chemin de nuit de l'essai de l'étape 27, chargée
 * par un import() DYNAMIQUE dans la passe (une erreur ici n'empêche jamais la nuit de démarrer) :
 *   1. LE JETON du calcul lourd (utils/calculLourd.js) : pris par un autre → « reporté », dit au résumé ;
 *   2. LE PROCESSUS À PART (cartonsEnfant.js, mode « nuit » : base en lecture seule, tas plafonné, délai de 10 min,
 *      l'instant de la passe reçu) : le cache incrémental des rencontres, la passe chronologique de tout le registre
 *      jusqu'à la veille, les tables du jour (équipes, arbitres, compétitions, couverture) et le contrôle anti-fuite ;
 *   3. LE RANGEMENT (le serveur, seul écrivain, sous le verrou de la passe) : par tranches de 250, une transaction par
 *      tranche, jamais ouverte quand il rend la main ; `en_cours` posé avant, retiré après ; les équipes et les arbitres
 *      d'une autre nuit qui ne sont plus connus partent ensuite ;
 *   4. L'ÉTAT de la nuit (`cartons_etat` : nuit, ligues, couverture, controle) écrit en une transaction.
 * La preuve après lancement (partie C2) est REPORTÉE (critique de l'étape 33, recommandation 3) : l'archive d'avant-match
 * de l'étape 32 garde déjà l'arbitre désigné. Rien de tout cela n'est lu par le moteur ni envoyé à l'IA.
 * L'heure est lue par la passe (jamais ici) ; aucune exception pour une panne du calcul : « reporté » ou « en échec ».
 * -----------------------------------------------------------------------
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, resolveDbPath } from '../db/matchStatsDb.js';
import { commencerCalculLourd, CalculLourdEnCours } from '../../utils/calculLourd.js';
import { creerPauses, executerEnRendantLaMain, rendreLaMainParDefaut } from '../../utils/travailCooperatif.js';
import { NUIT } from './reglagesCartons.js';
import { COLONNES_RENCONTRES } from './lectureDesCartons.js';
import { calculerLaNuitDesCartons } from './cartonsEnfant.js';

const ENFANT = fileURLToPath(new URL('./cartonsEnfant.js', import.meta.url));
/** Le processus à part : tas plafonné (le cache des rencontres ~62 000 lignes, la passe quelques dizaines de Mo). */
export const OPTIONS_ENFANT = Object.freeze(['--max-old-space-size=512', '--max-semi-space-size=8']);
/** Au-delà, l'enfant est arrêté et rien n'est rangé. */
export const DELAI_ENFANT_MS = 10 * 60_000;
/** Le nom du calcul lourd (le jeton). */
export const NOM_DU_CALCUL = 'cartons et corners';
/** Les colonnes des tables du jour (matchStatsDb.js, CARTONS_DDL). */
export const COLONNES_EQUIPES = Object.freeze(['club', 'n', 'pris', 'provoques', 'rho', 'pi', 'dernier', 'league', 'calcule_le', 'version']);
export const COLONNES_ARBITRES = Object.freeze(['cle', 'nom', 'pays', 'matchs', 'observes', 'attendus', 'indice', 'premier', 'dernier', 'ligues', 'calcule_le', 'version']);
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const iso = (t) => new Date(t).toISOString();
const FORMAT_JOUR_PARIS = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' });
/** Le jour civil de Paris d'un instant (AAAA-MM-JJ) : celui de la nuit. */
export const jourParis = (t) => FORMAT_JOUR_PARIS.format(new Date(t));
/** La graine du contrôle d'une nuit : son jour de Paris, AAAAMMJJ. */
export const graineDuJour = (t) => Number(jourParis(t).replace(/-/g, ''));

/** L'instant de la passe (ms) : `maintenant` (nombre, texte ISO, Date ou fonction), OBLIGATOIRE — jamais l'horloge lue ici. */
export function instantDe(maintenant) {
  const v = typeof maintenant === 'function' ? maintenant() : maintenant;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : Number.NaN;
  if (!fini(t)) throw new Error('cartons et corners : « maintenant » (l’heure de la passe) est obligatoire — jamais l’horloge lue ici.');
  return t;
}

// ======================================================= 1. le processus à part

/**
 * Le calcul de la nuit dans un PROCESSUS À PART (patron de contexteNuit.calculerAPart) : sous le jeton du calcul lourd
 * (un autre en cours : rejet CalculLourdEnCours, « reporté »), fork de cartonsEnfant.js, sérialisation « avancée », tas
 * plafonné ; `surMorceau(m)` reçoit chaque morceau ; la promesse rend la fin ; rejetée si l'enfant échoue, se tait
 * au-delà de `delaiMs` (il est alors arrêté) ou s'arrête sans répondre.
 */
export function calculerAPart({ message, surMorceau = () => {}, delaiMs = DELAI_ENFANT_MS, fichier = ENFANT, options = OPTIONS_ENFANT }) {
  let rendre;
  try {
    rendre = commencerCalculLourd(NOM_DU_CALCUL);
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    let termine = false;
    let erreurs = '';
    const enfant = fork(fichier, ['--enfant-cartons'], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'advanced', execArgv: [...process.execArgv, ...options] });
    const arreter = () => {
      try {
        enfant.kill();
      } catch {
        // déjà arrêté
      }
    };
    const minuterie = setTimeout(() => {
      if (termine) return;
      termine = true;
      arreter();
      reject(new Error(`calcul à part arrêté : aucune réponse en ${delaiMs < 60_000 ? `${delaiMs} ms` : `${Math.round(delaiMs / 60_000)} min`}`));
    }, delaiMs);
    minuterie.unref?.();
    enfant.stderr?.on('data', (d) => {
      erreurs = (erreurs + d).slice(-2000);
    });
    enfant.on('message', (m) => {
      if (termine) return;
      if (m?.morceau) {
        try {
          surMorceau(m.morceau);
        } catch (error) {
          termine = true;
          clearTimeout(minuterie);
          arreter();
          reject(error);
        }
        return;
      }
      clearTimeout(minuterie);
      termine = true;
      if (m?.erreur) reject(new Error(m.erreur));
      else resolve(m ?? {});
    });
    enfant.on('error', (error) => {
      clearTimeout(minuterie);
      if (!termine) reject(error);
      termine = true;
    });
    enfant.on('exit', (code) => {
      clearTimeout(minuterie);
      if (!termine) reject(new Error(`calcul à part arrêté sans réponse (code ${code}) ${erreurs.trim().slice(-300)}`));
      termine = true;
    });
    enfant.send(message);
  }).finally(rendre);
}

// ======================================================= 2. le rangement (le serveur, seul écrivain)

function annuler(database) {
  try {
    if (database.isTransaction !== false) database.exec('ROLLBACK');
  } catch {
    // aucune transaction ouverte
  }
}

/**
 * Une suite d'ordres coupée en transactions de `tranche` ; la main n'est rendue (yield) qu'ENTRE deux transactions.
 * `mesure` : la plus longue transaction (ms), le nombre de transactions, et le plus grand nombre d'ordres dans une seule.
 */
function* parTranches(database, ordres, tranche, mesure) {
  let k = 0;
  let dansLaTransaction = 0;
  let t0 = performance.now();
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const ordre of ordres) {
      ordre();
      dansLaTransaction++;
      mesure.ordresParTransactionMax = Math.max(mesure.ordresParTransactionMax ?? 0, dansLaTransaction);
      if (++k % tranche === 0) {
        dansLaTransaction = 0;
        database.exec('COMMIT');
        mesure.transactions = (mesure.transactions ?? 0) + 1;
        mesure.plusLongueTrancheMs = Math.max(mesure.plusLongueTrancheMs ?? 0, performance.now() - t0);
        yield 'rangement';
        t0 = performance.now();
        database.exec('BEGIN IMMEDIATE');
      }
    }
    database.exec('COMMIT');
    mesure.transactions = (mesure.transactions ?? 0) + 1;
    mesure.plusLongueTrancheMs = Math.max(mesure.plusLongueTrancheMs ?? 0, performance.now() - t0);
  } catch (error) {
    annuler(database);
    throw error;
  }
}

const ecrireLaValeur = (database, cle, valeur) =>
  database.prepare('INSERT INTO cartons_etat (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run(cle, JSON.stringify(valeur));
const effacerLaValeur = (database, cle) => database.prepare('DELETE FROM cartons_etat WHERE cle = ?').run(cle);

/** La valeur d'une clé de `cartons_etat` (JSON), ou null ; jamais une exception. */
export function lireLaValeur(database, cle) {
  try {
    const r = database.prepare('SELECT valeur FROM cartons_etat WHERE cle = ?').get(cle);
    return r ? JSON.parse(r.valeur) : null;
  } catch {
    return null;
  }
}

/** Un ordre « insérer ou remplacer » sur une table à clé primaire `cle`. */
const upsert = (database, table, colonnes, cle) =>
  database.prepare(
    `INSERT INTO ${table} (${colonnes.join(', ')}) VALUES (${colonnes.map(() => '?').join(', ')})
     ON CONFLICT(${cle}) DO UPDATE SET ${colonnes.filter((c) => c !== cle).map((c) => `${c} = excluded.${c}`).join(', ')}`
  );

/** RANGE les lignes du cache des rencontres (écrites puis retirées). */
function* rangerLesRencontres({ database, aEcrire, aRetirer, tranche, mesure }) {
  const ins = upsert(database, 'cartons_rencontres', COLONNES_RENCONTRES, 'match_key');
  const del = database.prepare('DELETE FROM cartons_rencontres WHERE match_key = ?');
  function* ordres() {
    for (const l of aEcrire) yield () => ins.run(...COLONNES_RENCONTRES.map((c) => l[c] ?? null));
    for (const cle of aRetirer) yield () => del.run(cle);
  }
  yield* parTranches(database, ordres(), tranche, mesure);
  return { ecrites: aEcrire.length, retirees: aRetirer.length };
}

/** RANGE une table du jour (équipes ou arbitres) ; les lignes d'une autre nuit qui ne sont plus connues partent ensuite, par tranches. */
function* rangerUneTable({ database, table, colonnes, cle, lignes, calculeLe, tranche, mesure }) {
  const ins = upsert(database, table, colonnes, cle);
  function* ordres() {
    for (const l of lignes) yield () => ins.run(...colonnes.map((c) => l[c] ?? null));
  }
  yield* parTranches(database, ordres(), tranche, mesure);
  let retirees = 0;
  const del = database.prepare(`DELETE FROM ${table} WHERE ${cle} IN (SELECT ${cle} FROM ${table} WHERE calcule_le <> ? LIMIT ?)`);
  for (;;) {
    let n = 0;
    yield* parTranches(database, [() => (n = Number(del.run(calculeLe, tranche).changes))], 1, mesure);
    retirees += n;
    if (n < tranche) break;
  }
  return { ecrites: lignes.length, retirees };
}

// ======================================================= 3. l'étape

/**
 * L'ÉTAPE « cartonsEtCorners ». `maintenant` : OBLIGATOIRE (l'heure de la passe) ; `aPart` : le processus à part (false :
 * dans ce processus, pour un essai) ; `graine`, `couples`, `fuite` : pour les essais. Jamais d'exception pour une panne
 * du calcul. Rend { mode: 'complet' | 'reporte' | 'echec', ... }.
 */
export async function faireLesCartonsDeLaNuit({
  maintenant,
  database = openDb(),
  chemin = resolveDbPath(),
  aPart = true,
  delaiMs = DELAI_ENFANT_MS,
  graine = undefined,
  couples = NUIT.couples,
  fuite = false,
  rendreLaMain = rendreLaMainParDefaut,
  tranche = NUIT.tranche
} = {}) {
  const instant = instantDe(maintenant);
  const debut = performance.now();
  const calculeLe = iso(instant);
  const jourD = jourParis(instant);
  const pauses = creerPauses({ rendreLaMain });
  const duree = () => Math.round(performance.now() - debut);
  const base = { calculeLe, jourD };
  // 1-2. Le calcul (à part), reçu par morceaux.
  const recus = { rencontres: [], retirees: [], equipes: [], arbitres: [] };
  const surMorceau = (m) => {
    if (!recus[m?.type]) throw new Error(`morceau inconnu « ${m?.type ?? ''} »`);
    recus[m.type].push(...m.lignes);
  };
  const message = { mode: 'nuit', chemin, instant, jourD, graine: graine === undefined ? graineDuJour(instant) : graine, couples, fuite };
  let fin;
  const tCalcul = performance.now();
  try {
    if (aPart) {
      fin = await pauses.attendre(calculerAPart({ message, surMorceau, delaiMs }), 'cartons et corners à part');
    } else {
      const rendre = commencerCalculLourd(NOM_DU_CALCUL);
      try {
        fin = calculerLaNuitDesCartons({ ...message, database, envoyer: (type, lignes) => surMorceau({ type, lignes }) });
      } finally {
        rendre();
      }
      await pauses.pause('cartons et corners (essai, ici)');
    }
  } catch (error) {
    if (error instanceof CalculLourdEnCours || error?.reporte) return { mode: 'reporte', raison: error.message, ...base, dureeMs: duree(), ...pauses.bilan() };
    return { mode: 'echec', erreur: String(error?.message ?? error).slice(0, 400), ...base, dureeMs: duree(), ...pauses.bilan() };
  }
  const calculMs = Math.round(performance.now() - tCalcul);
  // 3. Le rangement.
  const tRangement = performance.now();
  const mesure = { plusLongueTrancheMs: 0 };
  let ecrites;
  let interrompue = null;
  try {
    interrompue = lireLaValeur(database, 'en_cours');
    ecrireLaValeur(database, 'en_cours', { calculeLe, interrompueAvant: interrompue?.calculeLe ?? null });
    await pauses.pause('en cours');
    const rencontres = await executerEnRendantLaMain(rangerLesRencontres({ database, aEcrire: recus.rencontres, aRetirer: recus.retirees, tranche, mesure }), pauses.siLongtemps);
    const equipes = await executerEnRendantLaMain(rangerUneTable({ database, table: 'cartons_equipes', colonnes: COLONNES_EQUIPES, cle: 'club', lignes: recus.equipes, calculeLe, tranche, mesure }), pauses.siLongtemps);
    const arbitres = await executerEnRendantLaMain(rangerUneTable({ database, table: 'cartons_arbitres', colonnes: COLONNES_ARBITRES, cle: 'cle', lignes: recus.arbitres, calculeLe, tranche, mesure }), pauses.siLongtemps);
    ecrites = { rencontres, equipes, arbitres };
  } catch (error) {
    return { mode: 'echec', erreur: `rangement : ${String(error?.message ?? error).slice(0, 300)}`, ...base, bilan: fin?.bilan ?? null, dureeMs: duree(), ...pauses.bilan() };
  }
  // 4. L'état de la nuit, en une transaction.
  const bilan = { ...(fin?.bilan ?? {}), calculMs };
  const controle = { calculeLe, lignes: fin?.controle?.lignes ?? 0, couples: fin?.controle?.couples ?? 0, ecarts: fin?.controle?.ecarts ?? [] };
  const nuit = { calculeLe, jourD, ecrites, bilan, repriseApres: interrompue?.calculeLe ?? null };
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      ecrireLaValeur(database, 'nuit', nuit);
      ecrireLaValeur(database, 'ligues', { calculeLe, jourD, ligues: fin?.ligues ?? {} });
      ecrireLaValeur(database, 'couverture', { calculeLe, jourD, lignes: fin?.couverture ?? [] });
      ecrireLaValeur(database, 'controle', controle);
      effacerLaValeur(database, 'en_cours');
      database.exec('COMMIT');
    } catch (error) {
      annuler(database);
      throw error;
    }
  } catch (error) {
    return { mode: 'echec', erreur: `état de la nuit : ${String(error?.message ?? error).slice(0, 200)}`, ...base, bilan, dureeMs: duree(), ...pauses.bilan() };
  }
  return {
    mode: 'complet',
    ...base,
    bilan,
    ecrites,
    repriseApres: interrompue?.calculeLe ?? null,
    controle: fin?.controle ?? { lignes: 0, ecarts: [], couples: 0 },
    couverture: fin?.couverture ?? [],
    rangementMs: Math.round(performance.now() - tRangement),
    plusLongueTrancheMs: Math.round(mesure.plusLongueTrancheMs ?? 0),
    transactions: mesure.transactions ?? 0,
    ordresParTransactionMax: mesure.ordresParTransactionMax ?? 0,
    dureeMs: duree(),
    ...pauses.bilan()
  };
}

/** L'état de la dernière nuit des cartons (lecture seule ; null sans table ou jamais calculée). */
export function etatDesCartons({ database = openDb() } = {}) {
  return { nuit: lireLaValeur(database, 'nuit'), enCours: lireLaValeur(database, 'en_cours'), controle: lireLaValeur(database, 'controle') };
}

/**
 * L'ALERTE DURABLE du contrôle anti-fuite (`alerts.cartonsEtCorners`, lue par ui/src/utils/controlesAntiFuite.js) :
 * { ecarts (20 au plus, chacun avec sa phrase), total, lignes, updatedAt } ; null quand la nuit n'a trouvé aucun écart.
 */
export function alerteDesCartons({ ecarts = [], lignes = 0, updatedAt }) {
  if (!ecarts.length) return null;
  return { ecarts: ecarts.slice(0, 20).map((e) => ({ matchKey: e.matchKey, J: e.J, club: e.club, camp: e.camp, colonne: e.colonne, texte: e.texte })), total: ecarts.length, lignes, updatedAt };
}

const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${Math.abs(Number(n ?? 0)) > 1 ? plusieurs : un}`;
const dureeDite = (ms) => {
  const s = Math.max(0, Number(ms ?? 0)) / 1000;
  return s < 60 ? `${s.toLocaleString('fr-FR', { maximumFractionDigits: s < 10 ? 1 : 0 })} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`;
};

/**
 * Le RÉSULTAT DE L'ÉTAPE pour la passe (refresh-status.json) : { status, summary, details, alert, changed }, en une phrase
 * (conception §6.5) — « reporté », « en échec » ou complet (cache, rencontres aux cartons relevés, équipes, arbitres,
 * contrôle, durée à part et mémoire, rangement). Pur.
 */
export function resultatDeLEtape(r, { updatedAt = null } = {}) {
  if (r.mode === 'reporte') {
    return { status: 'warn', summary: `Reporté : ${String(r.raison).replace(/\.$/, '')} — les cartons attendus seront calculés à la passe suivante.`, details: { mode: r.mode, reporte: true, raison: r.raison }, changed: false };
  }
  if (r.mode === 'echec') {
    return { status: 'error', summary: `En échec : ${String(r.erreur).slice(0, 240)} — rien d’avancé, les tables d’avant restent ; la passe suivante recommence (${dureeDite(r.dureeMs)}).`, details: { mode: r.mode, erreur: r.erreur, dureeMs: r.dureeMs }, changed: false };
  }
  const b = r.bilan ?? {};
  const c = r.controle ?? { lignes: 0, ecarts: [] };
  const ecarts = c.ecarts ?? [];
  const points = [];
  if (ecarts.length) points.push(`${pluriel(ecarts.length, 'écart au contrôle anti-fuite', 'écarts au contrôle anti-fuite')} (${ecarts.slice(0, 2).map((e) => e.texte).join(' ; ')}) — à regarder`);
  if (r.repriseApres) points.push(`la nuit du ${String(r.repriseApres).slice(0, 10)}, interrompue pendant son rangement, est reprise et finie`);
  const mo = b.aPart?.rssMaxOctets ? `, ${nombre(Math.round(b.aPart.rssMaxOctets / 1048576))} Mo` : '';
  const p = b.passe ?? {};
  return {
    status: points.length ? 'warn' : 'ok',
    summary:
      `Cartons et corners : ${pluriel(b.cache?.total ?? 0, 'rencontre au cache', 'rencontres au cache')} (${nombre(b.cache?.relues ?? 0)} relue${(b.cache?.relues ?? 0) > 1 ? 's' : ''})` +
      `, ${nombre(p.releves ?? 0)} aux cartons relevés (dont ${nombre(p.ligneAZero ?? 0)} au déroulé seul : jaunes publiés à 0 par FotMob)` +
      `, ${pluriel(b.equipes ?? 0, 'équipe', 'équipes')}, ${pluriel(b.arbitres ?? 0, 'arbitre', 'arbitres')}` +
      ` ; contrôle anti-fuite : ${pluriel(c.lignes ?? 0, 'couple recalculé', 'couples recalculés')} par un second chemin, ${pluriel(ecarts.length, 'écart', 'écarts')}` +
      ` ; ${dureeDite(b.calculMs ?? r.dureeMs)} à part (${mo.slice(2) || 'mémoire non relevée'}), rangement ${dureeDite(r.rangementMs ?? 0)}, le serveur jamais tenu plus de ${nombre(Math.round(r.blocMaxMs ?? 0))} ms d'affilée` +
      (points.length ? ` ; ${points.join(' ; ')}.` : '.') +
      ' Preuve sur vos matchs : reportée (étape 33, partie C2). À blanc : jamais lu par le moteur ni envoyé à l’IA.',
    details: {
      mode: r.mode,
      calculeLe: r.calculeLe,
      jourD: r.jourD,
      cache: b.cache ?? null,
      passe: b.passe ?? null,
      equipes: r.ecrites?.equipes ?? null,
      arbitres: r.ecrites?.arbitres ?? null,
      rencontres: r.ecrites?.rencontres ?? null,
      controle: { lignes: c.lignes ?? 0, couples: c.couples ?? 0, ecarts: ecarts.length },
      durees: b.durees ?? null,
      dureeMs: r.dureeMs,
      calculMs: b.calculMs ?? null,
      rangementMs: r.rangementMs ?? null,
      plusLongueTrancheMs: r.plusLongueTrancheMs ?? null,
      blocMaxMs: r.blocMaxMs ?? null,
      calculAPart: { dureeMs: b.dureeMs ?? null, rssMax: b.aPart?.rssMaxOctets ?? null }
    },
    // Les écarts du contrôle restent visibles jusqu'à la nuit qui n'en trouve plus (comme les autres contrôles de nuit).
    alert: { key: 'cartonsEtCorners', value: alerteDesCartons({ ecarts, lignes: c.lignes ?? 0, updatedAt }) },
    changed: false
  };
}

export const __pourLesTests = { parTranches, rangerLesRencontres, rangerUneTable };
