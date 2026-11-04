/**
 * joueursNuit.js — L'ÉTAPE DE NUIT « joueursABlanc » (étape 34 du plan, lot 1b, partie C1, 03/11/2026).
 * -----------------------------------------------------------------------
 * Chaque nuit, une fois par jour civil de Paris (jamais au clic ; ni réseau, ni Claude, rien de payant), APRÈS les cartons
 * et corners de l'étape 33 et AVANT le contrôle quotidien (toujours dernier) — hors du chemin de nuit de l'essai de
 * l'étape 27, chargée par un import() DYNAMIQUE dans la passe (une erreur ici n'empêche jamais la nuit de démarrer) :
 *   1. LE JETON du calcul lourd (utils/calculLourd.js, « chiffres des joueurs ») : pris par un autre → « reporté » ;
 *   2. LE PROCESSUS À PART (joueursEnfant.js, mode « nuit » : base en lecture seule, tas plafonné, délai de 10 min,
 *      l'instant de la passe reçu) : la passe chronologique de tout le magasin jusqu'à la veille, les fiches et les repères
 *      du jour, la base des matchs à venir, l'archive d'avant-match des 36 prochaines heures, le contrôle anti-fuite ;
 *   3. LE RANGEMENT (le serveur, seul écrivain, sous le verrou de la passe) : par tranches de 250, une transaction par
 *      tranche, jamais ouverte quand il rend la main ; `en_cours` posé avant, retiré après (la lecture ignore les tables
 *      entre les deux) ; les fiches et les matchs d'une autre nuit partent ensuite ; L'ARCHIVE n'est jamais réécrite : une
 *      ligne « derniere-alignee » écrite ne bouge plus, une ligne « publiee » n'est remplacée que par une compo lue plus
 *      tard, et rien n'est écrit pour un match dont le coup d'envoi est passé au moment du rangement ;
 *   4. L'ÉTAT de la nuit (`joueurs_etat` : nuit, reperes, controle) écrit en une transaction.
 * Rien de tout cela n'est lu par le moteur ni envoyé à l'IA. L'heure est lue par la passe (jamais ici) ; aucune exception
 * pour une panne du calcul : « reporté » ou « en échec ».
 * -----------------------------------------------------------------------
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, resolveDbPath } from '../db/matchStatsDb.js';
import { commencerCalculLourd, CalculLourdEnCours } from '../../utils/calculLourd.js';
import { creerPauses, executerEnRendantLaMain, rendreLaMainParDefaut } from '../../utils/travailCooperatif.js';
import { NUIT, VERSION_JOUEURS } from './reglagesJoueurs.js';

const ENFANT = fileURLToPath(new URL('./joueursEnfant.js', import.meta.url));
/** Le processus à part : tas plafonné (mesuré dans le bac : la passe tient l'accumulateur des joueurs, des forces et des cartons). */
export const OPTIONS_ENFANT = Object.freeze(['--max-old-space-size=1024', '--max-semi-space-size=8']);
/** Au-delà, l'enfant est arrêté et rien n'est rangé. */
export const DELAI_ENFANT_MS = 10 * 60_000;
/** Le nom du calcul lourd (le jeton). */
export const NOM_DU_CALCUL = 'chiffres des joueurs';
/** Les colonnes des tables (matchStatsDb.js, JOUEURS_DDL). */
export const COLONNES_FICHES = Object.freeze(['joueur', 'club', 'poste', 'derniere', 'apparitions', 'np_x', 'np_e', 'pen_x', 'pen_e', 'sot_x', 'sot_e', 'av_x', 'av_e', 'xa_x', 'xa_e', 'pen_club', 'tit_min', 'tit_n', 'entre_min', 'entre_n', 'banc_n', 'banc_entrees', 'calcule_le', 'version']);
export const COLONNES_MATCHS = Object.freeze(['rencontre', 'jour', 'kickoff', 'league', 'home', 'away', 'lambda_dom', 'lambda_ext', 'cadres_dom', 'cadres_ext', 'cartes_dom', 'cartes_ext', 'sources', 'calcule_le', 'version']);
export const COLONNES_ARCHIVE = Object.freeze(['rencontre', 'etat', 'kickoff', 'compo_lue_le', 'ecrit_le', 'base', 'joueurs', 'version']);
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
  if (!fini(t)) throw new Error('chiffres des joueurs : « maintenant » (l’heure de la passe) est obligatoire — jamais l’horloge lue ici.');
  return t;
}

// ======================================================= 1. le processus à part

/**
 * Le calcul de la nuit dans un PROCESSUS À PART (patron de cartonsNuit.calculerAPart) : sous le jeton du calcul lourd (un
 * autre en cours : rejet CalculLourdEnCours, « reporté »), fork de joueursEnfant.js, sérialisation « avancée », tas
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
    const enfant = fork(fichier, ['--enfant-joueurs'], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'advanced', execArgv: [...process.execArgv, ...options] });
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
  database.prepare('INSERT INTO joueurs_etat (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run(cle, JSON.stringify(valeur));
const effacerLaValeur = (database, cle) => database.prepare('DELETE FROM joueurs_etat WHERE cle = ?').run(cle);

/** La valeur d'une clé de `joueurs_etat` (JSON), ou null ; jamais une exception. */
export function lireLaValeur(database, cle) {
  try {
    const r = database.prepare('SELECT valeur FROM joueurs_etat WHERE cle = ?').get(cle);
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

/** RANGE une table du jour (fiches ou matchs) ; les lignes d'une autre nuit partent ensuite, par tranches. */
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

/** Le coup d'envoi d'une ligne d'archive est-il SÛR et PASSÉ à l'instant `t` ? (une date seule : passé dès son jour). */
const coupDEnvoiPasse = (kickoff, t) => {
  const s = String(kickoff ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return jourParis(t) >= s;
  const k = Date.parse(s);
  return !fini(k) || k <= t;
};

/**
 * ÉCRIT UNE LIGNE D'ARCHIVE d'avant-match (le serveur seul ; jamais après le coup d'envoi) : « derniere-alignee » n'est
 * JAMAIS réécrite ; « publiee » n'est remplacée que par une compo lue PLUS TARD, toujours avant le coup d'envoi. `t` :
 * l'instant de l'écriture (celui de l'appelant). Rend 'ecrite' | 'gardee' | 'apres-coup-d-envoi'.
 */
export function ecrireLArchive(database, ligne, t) {
  if (coupDEnvoiPasse(ligne.kickoff, t)) return 'apres-coup-d-envoi';
  const valeurs = COLONNES_ARCHIVE.map((c) => ligne[c] ?? null);
  const sql =
    ligne.etat === 'publiee'
      ? `INSERT INTO joueurs_avant_match (${COLONNES_ARCHIVE.join(', ')}) VALUES (${COLONNES_ARCHIVE.map(() => '?').join(', ')})
         ON CONFLICT(rencontre, etat) DO UPDATE SET kickoff = excluded.kickoff, compo_lue_le = excluded.compo_lue_le, ecrit_le = excluded.ecrit_le,
           base = excluded.base, joueurs = excluded.joueurs, version = excluded.version
         WHERE excluded.compo_lue_le > COALESCE(joueurs_avant_match.compo_lue_le, '')`
      : `INSERT INTO joueurs_avant_match (${COLONNES_ARCHIVE.join(', ')}) VALUES (${COLONNES_ARCHIVE.map(() => '?').join(', ')})
         ON CONFLICT(rencontre, etat) DO NOTHING`;
  const n = Number(database.prepare(sql).run(...valeurs).changes);
  return n > 0 ? 'ecrite' : 'gardee';
}

/** RANGE l'archive (par tranches) ; `t()` : l'instant de chaque écriture (jamais après le coup d'envoi). */
function* rangerLArchive({ database, lignes, t, tranche, mesure }) {
  const bilan = { ecrites: 0, gardees: 0, apresCoupDEnvoi: 0 };
  function* ordres() {
    for (const l of lignes) {
      yield () => {
        const r = ecrireLArchive(database, l, t());
        if (r === 'ecrite') bilan.ecrites += 1;
        else if (r === 'gardee') bilan.gardees += 1;
        else bilan.apresCoupDEnvoi += 1;
      };
    }
  }
  yield* parTranches(database, ordres(), tranche, mesure);
  return bilan;
}

// ======================================================= 3. l'étape

/**
 * L'ÉTAPE « joueursABlanc ». `maintenant` : OBLIGATOIRE (l'heure de la passe) ; `horloge` : l'heure de chaque écriture
 * d'archive (par défaut, `maintenant` avancé du temps écoulé — jamais l'horloge du système lue ici) ; `aPart` : le
 * processus à part (false : dans ce processus, pour un essai) ; `graine`, `couples`, `fuite`, `note`, `clubDe`,
 * `fichierCalendrier` : pour les essais. Jamais d'exception pour une panne du calcul. Rend { mode: 'complet' | 'reporte' |
 * 'echec', ... }.
 */
export async function faireLesJoueursDeLaNuit({
  maintenant,
  database = openDb(),
  chemin = resolveDbPath(),
  aPart = true,
  delaiMs = DELAI_ENFANT_MS,
  graine = undefined,
  couples = NUIT.couples,
  fuite = false,
  note = undefined,
  clubDe = null,
  fichierCalendrier = undefined,
  horloge = null,
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
  const t = typeof horloge === 'function' ? horloge : () => instant + (performance.now() - debut);
  const base = { calculeLe, jourD };
  // 1-2. Le calcul (à part), reçu par morceaux.
  const recus = { fiches: [], matchs: [], archive: [] };
  const surMorceau = (m) => {
    if (!recus[m?.type]) throw new Error(`morceau inconnu « ${m?.type ?? ''} »`);
    recus[m.type].push(...m.lignes);
  };
  const message = { mode: 'nuit', chemin, instant, jourD, graine: graine === undefined ? graineDuJour(instant) : graine, couples, fuite, ...(fichierCalendrier ? { fichierCalendrier } : {}) };
  let fin;
  const tCalcul = performance.now();
  try {
    if (aPart) {
      fin = await pauses.attendre(calculerAPart({ message, surMorceau, delaiMs }), 'chiffres des joueurs à part');
    } else {
      const rendre = commencerCalculLourd(NOM_DU_CALCUL);
      try {
        const calculer = calculerIci ?? (await import('./joueursEnfant.js')).calculerLaNuitDesJoueurs;
        fin = calculer({ ...message, database, ...(note !== undefined ? { note } : {}), ...(clubDe ? { clubDe } : {}), envoyer: (type, lignes) => surMorceau({ type, lignes }) });
      } finally {
        rendre();
      }
      await pauses.pause('chiffres des joueurs (essai, ici)');
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
    const fiches = await executerEnRendantLaMain(rangerUneTable({ database, table: 'joueurs_fiches', colonnes: COLONNES_FICHES, cle: 'joueur', lignes: recus.fiches, calculeLe, tranche, mesure }), pauses.siLongtemps);
    const matchs = await executerEnRendantLaMain(rangerUneTable({ database, table: 'joueurs_matchs', colonnes: COLONNES_MATCHS, cle: 'rencontre', lignes: recus.matchs, calculeLe, tranche, mesure }), pauses.siLongtemps);
    const archive = await executerEnRendantLaMain(rangerLArchive({ database, lignes: recus.archive, t, tranche, mesure }), pauses.siLongtemps);
    ecrites = { fiches, matchs, archive };
  } catch (error) {
    return { mode: 'echec', erreur: `rangement : ${String(error?.message ?? error).slice(0, 300)}`, ...base, bilan: fin?.bilan ?? null, dureeMs: duree(), ...pauses.bilan() };
  }
  // 4. L'état de la nuit, en une transaction.
  const bilan = { ...(fin?.bilan ?? {}), calculMs };
  const controle = { calculeLe, lignes: fin?.controle?.lignes ?? 0, couples: fin?.controle?.couples ?? 0, ecarts: fin?.controle?.ecarts ?? [] };
  const nuit = { calculeLe, jourD, version: VERSION_JOUEURS, ecrites, bilan, repriseApres: interrompue?.calculeLe ?? null };
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      ecrireLaValeur(database, 'nuit', nuit);
      ecrireLaValeur(database, 'reperes', fin?.reperes ?? null);
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
    controle,
    rangementMs: Math.round(performance.now() - tRangement),
    plusLongueTrancheMs: Math.round(mesure.plusLongueTrancheMs ?? 0),
    transactions: mesure.transactions ?? 0,
    ordresParTransactionMax: mesure.ordresParTransactionMax ?? 0,
    dureeMs: duree(),
    ...pauses.bilan()
  };
}

/** L'état de la dernière nuit des joueurs (lecture seule ; null sans table ou jamais calculée). */
export function etatDesJoueurs({ database = openDb() } = {}) {
  return { nuit: lireLaValeur(database, 'nuit'), enCours: lireLaValeur(database, 'en_cours'), controle: lireLaValeur(database, 'controle') };
}

/**
 * L'ALERTE DURABLE du contrôle anti-fuite (`alerts.joueursABlanc`, lue par ui/src/utils/controlesAntiFuite.js) :
 * { ecarts (20 au plus, chacun avec sa phrase), total, lignes, updatedAt } ; null quand la nuit n'a trouvé aucun écart.
 */
export function alerteDesJoueurs({ ecarts = [], lignes = 0, updatedAt }) {
  if (!ecarts.length) return null;
  return { ecarts: ecarts.slice(0, 20).map((e) => ({ joueur: e.joueur, J: e.J, matchKey: e.matchKey, colonne: e.colonne, texte: e.texte })), total: ecarts.length, lignes, updatedAt };
}

const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${Math.abs(Number(n ?? 0)) > 1 ? plusieurs : un}`;
const dureeDite = (ms) => {
  const s = Math.max(0, Number(ms ?? 0)) / 1000;
  return s < 60 ? `${s.toLocaleString('fr-FR', { maximumFractionDigits: s < 10 ? 1 : 0 })} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`;
};

/**
 * Le RÉSULTAT DE L'ÉTAPE pour la passe (refresh-status.json) : { status, summary, details, alert, changed }, en une phrase
 * (conception §7.5) — « reporté », « en échec » ou complet. Pur.
 */
export function resultatDeLEtape(r, { updatedAt = null } = {}) {
  if (r.mode === 'reporte') {
    return { status: 'warn', summary: `Reporté : ${String(r.raison).replace(/\.$/, '')} — les chiffres des joueurs seront calculés à la passe suivante.`, details: { mode: r.mode, reporte: true, raison: r.raison }, changed: false };
  }
  if (r.mode === 'echec') {
    return { status: 'error', summary: `En échec : ${String(r.erreur).slice(0, 240)} — rien d’avancé, les tables d’avant restent ; la passe suivante recommence (${dureeDite(r.dureeMs)}).`, details: { mode: r.mode, erreur: r.erreur, dureeMs: r.dureeMs }, changed: false };
  }
  const b = r.bilan ?? {};
  const c = r.controle ?? { lignes: 0, ecarts: [] };
  const ecarts = c.ecarts ?? [];
  const a = r.ecrites?.archive ?? { ecrites: 0 };
  const points = [];
  if (ecarts.length) points.push(`${pluriel(ecarts.length, 'écart au contrôle anti-fuite', 'écarts au contrôle anti-fuite')} (${ecarts.slice(0, 2).map((e) => e.texte).join(' ; ')}) — à regarder`);
  if (r.repriseApres) points.push(`la nuit du ${String(r.repriseApres).slice(0, 10)}, interrompue pendant son rangement, est reprise et finie`);
  if (b.archive?.sansNote) points.push('pas encore de banc d’essai : rien n’est gardé avant les matchs');
  const mo = b.aPart?.rssMaxOctets ? `${nombre(Math.round(b.aPart.rssMaxOctets / 1048576))} Mo` : 'mémoire non relevée';
  const inconnus = (b.inconnus ?? []).slice(0, 2).map((x) => `${x.homeName} – ${x.awayName}`);
  return {
    status: points.length && (ecarts.length || b.archive?.sansNote) ? 'warn' : 'ok',
    summary:
      `Chiffres des joueurs : ${pluriel(b.fiches ?? 0, 'fiche', 'fiches')}, ${pluriel(b.matchs ?? 0, 'match à venir chiffré', 'matchs à venir chiffrés')}` +
      ` (${nombre(b.sansIdentifiant ?? 0)} sans leurs deux identifiants${inconnus.length ? ` : ${inconnus.join(', ')}` : ''})` +
      `, ${pluriel(a.ecrites ?? 0, 'ligne gardée', 'lignes gardées')} avant le coup d'envoi` +
      ` ; contrôle anti-fuite : ${pluriel(c.lignes ?? 0, 'joueur recalculé', 'joueurs recalculés')} par un second chemin, ${pluriel(ecarts.length, 'écart', 'écarts')}` +
      ` ; ${dureeDite(b.calculMs ?? r.dureeMs)} à part (${mo}), rangement ${dureeDite(r.rangementMs ?? 0)}, le serveur jamais tenu plus de ${nombre(Math.round(r.blocMaxMs ?? 0))} ms d'affilée` +
      (points.length ? ` ; ${points.join(' ; ')}.` : '.') +
      ' À blanc : jamais lu par le moteur ni envoyé à l’IA.',
    details: {
      mode: r.mode,
      calculeLe: r.calculeLe,
      jourD: r.jourD,
      fiches: r.ecrites?.fiches ?? null,
      matchs: r.ecrites?.matchs ?? null,
      archive: r.ecrites?.archive ?? null,
      archiveCalculee: b.archive ?? null,
      sansIdentifiant: b.sansIdentifiant ?? 0,
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
    alert: { key: 'joueursABlanc', value: alerteDesJoueurs({ ecarts, lignes: c.lignes ?? 0, updatedAt }) },
    changed: false
  };
}

export const __pourLesTests = { parTranches, rangerUneTable, rangerLArchive, coupDEnvoiPasse };
