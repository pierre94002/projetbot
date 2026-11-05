/**
 * combinaisonNuit.js — L'ÉTAPE DE NUIT « combinaisonABlanc » (étape 38 du plan, lot 1b, partie C, 04/11/2026 ; conception §5.4).
 * -----------------------------------------------------------------------
 * Chaque nuit, une fois par jour civil de Paris (jamais au clic ; ni réseau, ni Claude, rien de payant), APRÈS les cartons
 * et corners (33) et les chiffres des joueurs (34), AVANT le contrôle quotidien (toujours dernier) — hors du chemin de nuit
 * de l'essai de l'étape 27, chargée par un import() DYNAMIQUE dans la passe (une erreur ici n'empêche jamais la nuit de
 * démarrer) :
 *   1. LE JETON du calcul lourd (utils/calculLourd.js, « combinaison à blanc ») : pris par un autre → « reporté » ;
 *   2. LE PROCESSUS À PART (combinaisonNuitEnfant.js : base en lecture seule, 512 Mo, 10 min, l'instant de la passe reçu) :
 *      chaque révision gelée pas encore rangée (engine_picks ; la candidate en essai, lue par le dépôt), ses ingrédients,
 *      ses degrés, son étiquette, « ce qui manque », sa classe de seuil, son régime, P_M et P_comb = P_M, par ENTRÉES
 *      GELÉES seulement — puis le contrôle anti-fuite par un second chemin (20 couples, graine = le jour) ;
 *   3. LE RANGEMENT (le serveur, seul écrivain, sous le verrou de la passe) : par tranches de 250, une transaction par
 *      tranche, `INSERT OR IGNORE` — une ligne rangée n'est JAMAIS réécrite ; `en_cours` posé avant, retiré après. Un
 *      écart au contrôle anti-fuite : RIEN n'est rangé cette nuit-là, l'étape est en échec, l'alerte durable le dit ;
 *   4. L'ÉTAT de la nuit (`combinaison_etat` : nuit, controle) écrit en une transaction.
 * Rien de tout cela n'est lu par le moteur ni envoyé à l'IA ; l'étiquette « sur / fragile » est gardée pour la preuve et
 * jamais montrée (la page du match ne lit que « ce qui manque »). L'heure est lue par la passe (jamais ici) ; le contrôle
 * quotidien de la veille est lu par la passe et reçu ici (aucun fichier d'exécution lu dans data/combinaison/).
 * -----------------------------------------------------------------------
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, resolveDbPath } from '../db/matchStatsDb.js';
import { commencerCalculLourd, CalculLourdEnCours } from '../../utils/calculLourd.js';
import { creerPauses, executerEnRendantLaMain, rendreLaMainParDefaut } from '../../utils/travailCooperatif.js';
import { CANDIDATE_EN_ESSAI } from '../../core/engine/engineVersions.js';
import { NUIT, VERSION_DE_LA_REGLE } from './reglagesCombinaison.js';
import { COLONNES, PLAFOND_PAR_NUIT } from './nuitDeLaCombinaison.js';

const ENFANT = fileURLToPath(new URL('./combinaisonNuitEnfant.js', import.meta.url));
/** Le processus à part : tas plafonné (NUIT.memoireMo, 512 Mo). */
export const OPTIONS_ENFANT = Object.freeze([`--max-old-space-size=${NUIT.memoireMo}`, '--max-semi-space-size=8']);
/** Au-delà, l'enfant est arrêté et rien n'est rangé (NUIT.delaiMs, 10 min). */
export const DELAI_ENFANT_MS = NUIT.delaiMs;
/** Le nom du calcul lourd (le jeton). */
export const NOM_DU_CALCUL = 'combinaison à blanc';
/** Les candidates dont les révisions sont rangées : celle en essai (déclarée dans le code), lue par le dépôt. */
export const CANDIDATS = Object.freeze(CANDIDATE_EN_ESSAI?.id ? [CANDIDATE_EN_ESSAI.id] : []);
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
  if (!fini(t)) throw new Error('combinaison à blanc : « maintenant » (l’heure de la passe) est obligatoire — jamais l’horloge lue ici.');
  return t;
}

// ======================================================= 1. le processus à part

/**
 * Le calcul de la nuit dans un PROCESSUS À PART (patron de joueursNuit.calculerAPart) : sous le jeton du calcul lourd (un
 * autre en cours : rejet CalculLourdEnCours, « reporté »), fork de combinaisonNuitEnfant.js, sérialisation « avancée »,
 * tas plafonné ; `surMorceau(lignes)` reçoit chaque morceau ; la promesse rend la fin ; rejetée si l'enfant échoue, se tait
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
    const enfant = fork(fichier, ['--enfant-combinaison-nuit'], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'advanced', execArgv: [...process.execArgv, ...options] });
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
          surMorceau(m.morceau.lignes ?? []);
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
      if (m?.erreur) {
        const e = new Error(m.erreur);
        if (m.reporte) e.reporte = true;
        reject(e);
      } else resolve(m ?? {});
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

/** Une suite d'ordres coupée en transactions de `tranche` ; la main n'est rendue (yield) qu'ENTRE deux transactions. */
function* parTranches(database, ordres, tranche, mesure) {
  let k = 0;
  let t0 = performance.now();
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const ordre of ordres) {
      ordre();
      if (++k % tranche === 0) {
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
  database.prepare('INSERT INTO combinaison_etat (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run(cle, JSON.stringify(valeur));
const effacerLaValeur = (database, cle) => database.prepare('DELETE FROM combinaison_etat WHERE cle = ?').run(cle);

/** La valeur d'une clé de `combinaison_etat` (JSON), ou null ; jamais une exception. */
export function lireLaValeur(database, cle) {
  try {
    const r = database.prepare('SELECT valeur FROM combinaison_etat WHERE cle = ?').get(cle);
    return r ? JSON.parse(r.valeur) : null;
  } catch {
    return null;
  }
}

/** RANGE les lignes : INSERT OR IGNORE (jamais OR REPLACE : une ligne rangée n'est jamais réécrite — T-N3), par tranches. */
function* rangerLesLignes({ database, lignes, tranche, mesure }) {
  const ins = database.prepare(`INSERT OR IGNORE INTO combinaison_avant_match (${COLONNES.join(', ')}) VALUES (${COLONNES.map(() => '?').join(', ')})`);
  const bilan = { rangees: 0, deja: 0 };
  function* ordres() {
    for (const l of lignes) {
      yield () => {
        const n = Number(ins.run(...COLONNES.map((c) => l[c] ?? null)).changes);
        if (n > 0) bilan.rangees += 1;
        else bilan.deja += 1;
      };
    }
  }
  yield* parTranches(database, ordres(), tranche, mesure);
  return bilan;
}

// ======================================================= 3. l'étape

/**
 * L'ÉTAPE « combinaisonABlanc ». `maintenant` : OBLIGATOIRE (l'heure de la passe) ; `controle` : le contrôle quotidien EN
 * VIGUEUR lu par la passe ({ le, aVerifier }, ou null : la classe E dit alors « inconnu ») ; `aPart` : le processus à part
 * (false : dans ce processus, pour un essai) ; `graine`, `couples`, `fuite`, `limite`, `candidats` : pour les essais.
 * Jamais d'exception pour une panne du calcul. Rend { mode: 'complet' | 'reporte' | 'echec' | 'fuite', ... }.
 */
export async function faireLaCombinaisonDeLaNuit({
  maintenant,
  database = openDb(),
  chemin = resolveDbPath(),
  controle = null,
  aPart = true,
  delaiMs = DELAI_ENFANT_MS,
  graine = undefined,
  couples = NUIT.couples,
  fuite = false,
  limite = PLAFOND_PAR_NUIT,
  candidats = CANDIDATS,
  rendreLaMain = rendreLaMainParDefaut,
  tranche = NUIT.tranche,
  calculerIci = null
} = {}) {
  const instant = instantDe(maintenant);
  const debut = performance.now();
  const calculeLe = iso(instant);
  const jourD = jourParis(instant);
  const pauses = creerPauses({ rendreLaMain });
  const duree = () => Math.round(performance.now() - debut);
  const base = { calculeLe, jourD };
  const recues = [];
  const surMorceau = (lignes) => {
    if (!Array.isArray(lignes)) throw new Error('morceau illisible');
    for (const l of lignes) recues.push(l);
  };
  const message = {
    mode: 'nuit',
    chemin,
    instant,
    graine: graine === undefined ? graineDuJour(instant) : graine,
    couples,
    fuite,
    limite,
    candidats: [...(candidats ?? [])],
    controle: controle?.le && controle?.aVerifier ? { le: controle.le, aVerifier: controle.aVerifier } : null
  };
  let fin;
  const tCalcul = performance.now();
  try {
    if (aPart) {
      fin = await pauses.attendre(calculerAPart({ message, surMorceau, delaiMs }), 'combinaison à part');
    } else {
      const rendre = commencerCalculLourd(NOM_DU_CALCUL);
      try {
        const calculer = calculerIci ?? (await import('./nuitDeLaCombinaison.js')).calculerLaNuitDeLaCombinaison;
        fin = calculer({ ...message, database, envoyer: (lignes) => surMorceau(lignes) });
      } finally {
        rendre();
      }
      await pauses.pause('combinaison (essai, ici)');
    }
  } catch (error) {
    if (error instanceof CalculLourdEnCours || error?.reporte) return { mode: 'reporte', raison: error.message, ...base, dureeMs: duree(), ...pauses.bilan() };
    return { mode: 'echec', erreur: String(error?.message ?? error).slice(0, 400), ...base, dureeMs: duree(), ...pauses.bilan() };
  }
  const calculMs = Math.round(performance.now() - tCalcul);
  const bilanCalcul = { ...(fin?.bilan ?? {}), calculMs, aPart: fin?.aPart ?? null };
  const controleDeLaNuit = { calculeLe, lignes: fin?.controle?.lignes ?? 0, couples: fin?.controle?.couples ?? 0, ecarts: fin?.controle?.ecarts ?? [] };
  // Un écart au contrôle anti-fuite : rien n'est rangé (la table n'est jamais réécrite : une ligne fautive y resterait).
  if (controleDeLaNuit.ecarts.length) {
    try {
      ecrireLaValeur(database, 'controle', controleDeLaNuit);
    } catch {
      // l'état du contrôle reste dans le résultat de l'étape et l'alerte
    }
    return { mode: 'fuite', ...base, bilan: bilanCalcul, controle: controleDeLaNuit, dureeMs: duree(), ...pauses.bilan() };
  }
  // Le rangement.
  const tRangement = performance.now();
  const mesure = { plusLongueTrancheMs: 0 };
  let ecrites;
  let interrompue = null;
  try {
    interrompue = lireLaValeur(database, 'en_cours');
    ecrireLaValeur(database, 'en_cours', { calculeLe, interrompueAvant: interrompue?.calculeLe ?? null });
    await pauses.pause('en cours');
    ecrites = await executerEnRendantLaMain(rangerLesLignes({ database, lignes: recues, tranche, mesure }), pauses.siLongtemps);
  } catch (error) {
    return { mode: 'echec', erreur: `rangement : ${String(error?.message ?? error).slice(0, 300)}`, ...base, bilan: bilanCalcul, dureeMs: duree(), ...pauses.bilan() };
  }
  // L'état de la nuit, en une transaction.
  const nuit = { calculeLe, jourD, version: VERSION_DE_LA_REGLE, ecrites, bilan: bilanCalcul, repriseApres: interrompue?.calculeLe ?? null };
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      ecrireLaValeur(database, 'nuit', nuit);
      ecrireLaValeur(database, 'controle', controleDeLaNuit);
      effacerLaValeur(database, 'en_cours');
      database.exec('COMMIT');
    } catch (error) {
      annuler(database);
      throw error;
    }
  } catch (error) {
    return { mode: 'echec', erreur: `état de la nuit : ${String(error?.message ?? error).slice(0, 200)}`, ...base, bilan: bilanCalcul, dureeMs: duree(), ...pauses.bilan() };
  }
  return {
    mode: 'complet',
    ...base,
    bilan: bilanCalcul,
    ecrites,
    repriseApres: interrompue?.calculeLe ?? null,
    controle: controleDeLaNuit,
    rangementMs: Math.round(performance.now() - tRangement),
    plusLongueTrancheMs: Math.round(mesure.plusLongueTrancheMs ?? 0),
    transactions: mesure.transactions ?? 0,
    dureeMs: duree(),
    ...pauses.bilan()
  };
}

/** L'état de la dernière nuit de la combinaison (lecture seule ; null sans table ou jamais calculée). */
export function etatDeLaCombinaison({ database = openDb() } = {}) {
  return { nuit: lireLaValeur(database, 'nuit'), enCours: lireLaValeur(database, 'en_cours'), controle: lireLaValeur(database, 'controle') };
}

/**
 * L'ALERTE DURABLE du contrôle anti-fuite (`alerts.combinaisonABlanc`, lue par ui/src/utils/controlesAntiFuite.js) :
 * { ecarts (20 au plus, chacun avec sa phrase), total, lignes, updatedAt } ; null quand la nuit n'a trouvé aucun écart.
 */
export function alerteDeLaCombinaison({ ecarts = [], lignes = 0, updatedAt }) {
  if (!ecarts.length) return null;
  return { ecarts: ecarts.slice(0, 20).map((e) => ({ matchKey: e.cle, J: e.date, colonne: e.colonne, texte: e.texte })), total: ecarts.length, lignes, updatedAt };
}

const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${Math.abs(Number(n ?? 0)) > 1 ? plusieurs : un}`;
const dureeDite = (ms) => {
  const s = Math.max(0, Number(ms ?? 0)) / 1000;
  return s < 60 ? `${s.toLocaleString('fr-FR', { maximumFractionDigits: s < 10 ? 1 : 0 })} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`;
};

/**
 * Le RÉSULTAT DE L'ÉTAPE pour la passe (refresh-status.json) : { status, summary, details, alert, changed }, en une phrase —
 * « reporté », « en échec », « fuite » (rien rangé) ou complet. Pur.
 */
export function resultatDeLEtape(r, { updatedAt = null } = {}) {
  if (r.mode === 'reporte') {
    return { status: 'warn', summary: `Reporté : ${String(r.raison).replace(/\.$/, '')} — la combinaison à blanc sera rangée à la passe suivante.`, details: { mode: r.mode, reporte: true, raison: r.raison }, changed: false };
  }
  if (r.mode === 'echec') {
    return { status: 'error', summary: `En échec : ${String(r.erreur).slice(0, 240)} — rien d’avancé, les lignes d’avant restent ; la passe suivante recommence (${dureeDite(r.dureeMs)}).`, details: { mode: r.mode, erreur: r.erreur, dureeMs: r.dureeMs }, changed: false };
  }
  const c = r.controle ?? { lignes: 0, couples: 0, ecarts: [] };
  const ecarts = c.ecarts ?? [];
  const alert = { key: 'combinaisonABlanc', value: alerteDeLaCombinaison({ ecarts, lignes: c.couples ?? 0, updatedAt }) };
  if (r.mode === 'fuite') {
    return {
      status: 'error',
      summary: `En échec : le contrôle anti-fuite a trouvé ${pluriel(ecarts.length, 'écart', 'écarts')} (${ecarts.slice(0, 2).map((e) => e.texte).join(' ; ')}) — rien n’est rangé cette nuit ; à regarder.`,
      details: { mode: r.mode, controle: { lignes: c.lignes ?? 0, couples: c.couples ?? 0, ecarts: ecarts.length }, dureeMs: r.dureeMs },
      alert,
      changed: false
    };
  }
  const b = r.bilan ?? {};
  const e = r.ecrites ?? { rangees: 0, deja: 0 };
  const mo = b.aPart?.rssMaxOctets ? `${nombre(Math.round(b.aPart.rssMaxOctets / 1048576))} Mo` : 'mémoire non relevée';
  const points = [];
  if (b.restent) points.push(`${pluriel(b.restent, 'révision plus ancienne reste', 'révisions plus anciennes restent')} à ranger aux nuits suivantes`);
  if (r.repriseApres) points.push(`la nuit du ${String(r.repriseApres).slice(0, 10)}, interrompue pendant son rangement, est reprise et finie`);
  if (b.controleInconnu) points.push(`${pluriel(b.controleInconnu, 'révision gelée', 'révisions gelées')} avant le contrôle en vigueur : « à vérifier » inconnu`);
  return {
    status: 'ok',
    summary:
      `Combinaison à blanc : ${pluriel(e.rangees ?? 0, 'révision rangée', 'révisions rangées')}` +
      ` (dont ${pluriel(b.calculeApres ?? 0, 'rangée une nuit plus tard', 'rangées une nuit plus tard')} ; ${pluriel(b.apresCoupDEnvoi ?? 0, 'gelée après le coup d’envoi, gardée', 'gelées après le coup d’envoi, gardées')} hors de la preuve)` +
      ` ; contrôle anti-fuite : ${pluriel(c.couples ?? 0, 'couple recompté', 'couples recomptés')} par un second chemin, ${pluriel(ecarts.length, 'écart', 'écarts')}` +
      ` ; ${dureeDite(b.calculMs ?? r.dureeMs)} à part (${mo}), rangement ${dureeDite(r.rangementMs ?? 0)}, le serveur jamais tenu plus de ${nombre(Math.round(r.blocMaxMs ?? 0))} ms d'affilée` +
      (points.length ? ` ; ${points.join(' ; ')}.` : '.') +
      ' À blanc : jamais lu par le moteur ni envoyé à l’IA.',
    details: {
      mode: r.mode,
      calculeLe: r.calculeLe,
      jourD: r.jourD,
      ecrites: e,
      lues: b.lues ?? 0,
      restent: b.restent ?? 0,
      parSource: b.parSource ?? null,
      parFamille: b.parFamille ?? null,
      parOrigine: b.parOrigine ?? null,
      parRegime: b.parRegime ?? null,
      calculeApres: b.calculeApres ?? 0,
      apresCoupDEnvoi: b.apresCoupDEnvoi ?? 0,
      controleInconnu: b.controleInconnu ?? 0,
      casesF: b.casesF ?? null,
      controle: { lignes: c.lignes ?? 0, couples: c.couples ?? 0, ecarts: ecarts.length },
      durees: b.durees ?? null,
      dureeMs: r.dureeMs,
      calculMs: b.calculMs ?? null,
      rangementMs: r.rangementMs ?? null,
      plusLongueTrancheMs: r.plusLongueTrancheMs ?? null,
      blocMaxMs: r.blocMaxMs ?? null,
      calculAPart: { rssMax: b.aPart?.rssMaxOctets ?? null }
    },
    // Les écarts du contrôle restent visibles jusqu'à la nuit qui n'en trouve plus (comme les autres contrôles de nuit).
    alert,
    changed: false
  };
}

export const __pourLesTests = { parTranches, rangerLesLignes };
