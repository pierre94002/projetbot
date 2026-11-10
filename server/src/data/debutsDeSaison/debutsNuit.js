/**
 * debutsNuit.js — L'ÉTAPE DE NUIT « debutsDeSaison » (étape 35 du plan, lot 1b, 10/11/2026 ; conception §6.4-§6.5).
 * -----------------------------------------------------------------------
 * Chaque nuit, une fois par jour civil de Paris (jamais au clic ; ni réseau, ni Claude, rien de payant), APRÈS les coupes à
 * blanc et juste AVANT le contrôle quotidien (toujours dernier), hors du chemin de nuit de l'essai de l'étape 27 ; chargée par
 * un import() DYNAMIQUE dans la passe (une erreur ici n'empêche jamais la nuit de démarrer) :
 *   1. LE JETON du calcul lourd (utils/calculLourd.js) : pris par un autre → « reporté », dit au résumé ;
 *   2. LE PROCESSUS À PART (debutsEnfant.js : base en lecture seule, tas plafonné, délai de 10 min, l'instant de la passe
 *      reçu ; l'annuaire vérifié d'abord, pas prêt → « reporté ») : la passe de tout le magasin, les clubs, les fiches des
 *      matchs de championnat des 14 prochains jours, le contrôle anti-fuite ;
 *   3. LE RANGEMENT (le serveur, seul écrivain, sous le verrou de la passe) : par tranches de 250, une transaction par
 *      tranche, jamais ouverte quand il rend la main ; `en_cours` posé avant, retiré après ; une fiche FIGÉE (coup d'envoi
 *      passé ; heure inconnue : sa date n'est plus après le jour de la nuit — la règle de l'étape 32) n'est JAMAIS réécrite ;
 *      une fiche écrite pour la première fois après (ou peut-être après) son coup d'envoi est marquée `apres_coup_d_envoi` ;
 *      les fiches passées sont rattachées à la rencontre jouée (identifiants, date à un jour près) ; une fiche d'un match joué
 *      n'est JAMAIS élaguée, seules les orphelines de plus de 30 jours partent ;
 *   4. L'ÉTAT de la nuit (`debuts_etat` : nuit, comptes, controle) écrit en une transaction ; un écart du contrôle anti-fuite
 *      est nommé dans l'état et dans l'alerte durable (`alerts.debutsDeSaison`).
 * Rien de tout cela n'est lu par le moteur ni envoyé à l'IA. L'heure est lue par la passe (jamais ici).
 * -----------------------------------------------------------------------
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, resolveDbPath } from '../db/matchStatsDb.js';
import { commencerCalculLourd, CalculLourdEnCours } from '../../utils/calculLourd.js';
import { creerPauses, executerEnRendantLaMain, rendreLaMainParDefaut } from '../../utils/travailCooperatif.js';
import { NUIT, VERSION_DEBUTS, VERSION_FICHE } from './reglagesDebuts.js';
import { calculerLaNuitDesDebuts } from './debutsEnfant.js';

const ENFANT = fileURLToPath(new URL('./debutsEnfant.js', import.meta.url));
/** Le processus à part : tas plafonné (la passe de tout le magasin, ses minutes par joueur : mesuré dans le bac, lot 1b). */
export const OPTIONS_ENFANT = Object.freeze(['--max-old-space-size=512', '--max-semi-space-size=8']);
/** Au-delà, l'enfant est arrêté et rien n'est rangé. */
export const DELAI_ENFANT_MS = NUIT.delaiMs;
/** Le nom du calcul lourd (le jeton). */
export const NOM_DU_CALCUL = 'débuts de saison';
/** Les fiches orphelines (aucune rencontre jouée à ±1 jour) partent après 30 jours. */
export const ORPHELINES_JOURS = 30;
/** Les colonnes des tables (matchStatsDb.js, DEBUTS_DDL). */
export const COLONNES_CLUBS = Object.freeze(['club', 'league', 'saison', 'rang', 'statut', 'ligue_avant', 'continuite', 'cont_moy_ligue', 'mouvements', 'force_effectif', 'sans_identifiant', 'calcule_le', 'version']);
export const COLONNES_FICHES = Object.freeze(['date', 'home_id', 'away_id', 'league', 'match_id', 'kickoff', 'kickoff_connu', 'calcule_le', 'version', 'note', 'apres_coup_d_envoi', 'entrees', 'bras']);
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const iso = (t) => new Date(t).toISOString();
const JOUR_MS = 86_400_000;
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const FORMAT_JOUR_PARIS = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' });
/** Le jour civil de Paris d'un instant (AAAA-MM-JJ) : celui de la nuit. */
export const jourParis = (t) => FORMAT_JOUR_PARIS.format(new Date(t));

/** L'instant de la passe (ms) : `maintenant` (nombre, texte ISO, Date ou fonction), OBLIGATOIRE — jamais l'horloge lue ici. */
export function instantDe(maintenant) {
  const v = typeof maintenant === 'function' ? maintenant() : maintenant;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : Number.NaN;
  if (!fini(t)) throw new Error('débuts de saison : « maintenant » (l’heure de la passe) est obligatoire — jamais l’horloge lue ici.');
  return t;
}

// ======================================================= 1. le processus à part

/**
 * Le calcul de la nuit dans un PROCESSUS À PART (patron de coupesNuit.calculerAPart) : sous le jeton du calcul lourd (un
 * autre en cours : rejet CalculLourdEnCours, « reporté »), fork de debutsEnfant.js, sérialisation « avancée », tas plafonné ;
 * `surMorceau(m)` reçoit chaque morceau ; la promesse rend la fin ; rejetée si l'enfant échoue, se tait au-delà de `delaiMs`
 * (il est alors arrêté) ou s'arrête sans répondre.
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
    const enfant = fork(fichier, ['--enfant-debuts'], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'advanced', execArgv: [...process.execArgv, ...options] });
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
        const e = new Error(m.erreur.split('\n')[0]);
        if (m.reporte) e.reporte = true;
        reject(e);
      } else resolve(m ?? {});
    });
    enfant.on('error', (error) => {
      clearTimeout(minuterie);
      if (!termine) reject(error);
      termine = true;
    });
    // 'close' et non 'exit' (le piège du 09/11/2026, correctif des coupes) : sous Windows, 'exit' peut arriver AVANT les
    // derniers messages de l'enfant quand le serveur est occupé à lire les morceaux ; 'close' n'arrive qu'une fois le canal
    // vidé, après le dernier message.
    enfant.on('close', (code) => {
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
  database.prepare('INSERT INTO debuts_etat (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run(cle, JSON.stringify(valeur));
const effacerLaValeur = (database, cle) => database.prepare('DELETE FROM debuts_etat WHERE cle = ?').run(cle);

/** La valeur d'une clé de `debuts_etat` (JSON), ou null ; jamais une exception. */
export function lireLaValeur(database, cle) {
  try {
    const r = database.prepare('SELECT valeur FROM debuts_etat WHERE cle = ?').get(cle);
    return r ? JSON.parse(r.valeur) : null;
  } catch {
    return null;
  }
}

/**
 * Une fiche déjà rangée est-elle FIGÉE (jamais réécrite) ? Coup d'envoi connu : il est passé ; inconnu : sa date n'est plus
 * après le jour de la nuit (la règle de l'étape 32, contexteNuit.ficheFigee).
 */
export function ficheFigee(ligne, { instant, jourD }) {
  const ko = Date.parse(ligne?.kickoff ?? '');
  if (Number(ligne?.kickoff_connu) && fini(ko)) return instant >= ko;
  return typeof ligne?.date === 'string' && ligne.date <= jourD;
}

/** Une fiche calculée maintenant l'est-elle APRÈS (ou peut-être après) son coup d'envoi ? Même règle que le gel. */
export const ficheApresCoupDEnvoi = (f, { instant, jourD }) => ficheFigee(f, { instant, jourD });

/** RANGE les clubs de la nuit (insérés ou remplacés), puis ceux d'une autre nuit retirés. */
function* rangerLesClubs({ database, clubs, calculeLe, tranche, mesure }) {
  const ins = database.prepare(
    `INSERT INTO debuts_clubs (${COLONNES_CLUBS.join(', ')}) VALUES (${COLONNES_CLUBS.map(() => '?').join(', ')})
     ON CONFLICT(club) DO UPDATE SET ${COLONNES_CLUBS.filter((c) => c !== 'club').map((c) => `${c} = excluded.${c}`).join(', ')}`
  );
  yield* parTranches(database, (function* () {
    for (const l of clubs) yield () => ins.run(...COLONNES_CLUBS.map((c) => l[c] ?? null));
  })(), tranche, mesure);
  let retires = 0;
  const del = database.prepare('DELETE FROM debuts_clubs WHERE club IN (SELECT club FROM debuts_clubs WHERE calcule_le <> ? LIMIT ?)');
  for (;;) {
    let n = 0;
    yield* parTranches(database, [() => (n = Number(del.run(calculeLe, tranche).changes))], 1, mesure);
    retires += n;
    if (n < tranche) break;
  }
  return { ecrits: clubs.length, retires };
}

/** RANGE les fiches : une fiche figée n'est jamais réécrite ; une fiche neuve d'après le coup d'envoi est marquée. */
export function* rangerLesFiches({ database, fiches, instant, jourD, tranche = NUIT.tranche, mesure = {} }) {
  const lire = database.prepare('SELECT id, date, kickoff, kickoff_connu FROM debuts_fiches WHERE date = ? AND home_id = ? AND away_id = ?');
  const ins = database.prepare(`INSERT INTO debuts_fiches (${COLONNES_FICHES.join(', ')}) VALUES (${COLONNES_FICHES.map(() => '?').join(', ')})`);
  const autres = COLONNES_FICHES.filter((c) => !['date', 'home_id', 'away_id'].includes(c));
  const maj = database.prepare(`UPDATE debuts_fiches SET ${autres.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`);
  const s = { ecrites: 0, nouvelles: 0, reecrites: 0, figees: 0, apresCoupDEnvoi: 0 };
  function* ordres() {
    for (const f of fiches) {
      yield () => {
        const ex = lire.get(f.date, f.home_id, f.away_id);
        if (ex && ficheFigee(ex, { instant, jourD })) {
          s.figees++;
          return;
        }
        const apres = ficheApresCoupDEnvoi(f, { instant, jourD }) ? 1 : 0;
        const l = { ...f, apres_coup_d_envoi: apres };
        if (ex) {
          maj.run(...autres.map((c) => l[c] ?? null), ex.id);
          s.reecrites++;
        } else {
          ins.run(...COLONNES_FICHES.map((c) => l[c] ?? null));
          s.nouvelles++;
        }
        s.ecrites++;
        if (apres) s.apresCoupDEnvoi++;
      };
    }
  }
  yield* parTranches(database, ordres(), tranche, mesure);
  return s;
}

/**
 * LE RATTACHEMENT puis L'ÉLAGAGE : chaque fiche passée encore sans rencontre est rattachée à la rencontre JOUÉE entre ces deux
 * clubs (par identifiants, la date à un jour près : `match_key`) ; puis les fiches ORPHELINES (toujours sans rencontre, plus de
 * 30 jours, et aucune rencontre jouée entre ces deux clubs à un jour près, relu au moment de retirer) partent par tranches. Une
 * fiche d'un match joué n'est JAMAIS élaguée. Rend { rattachees, orphelines }.
 */
export function* rattacherEtElaguer({ database, jourD, tranche = NUIT.tranche, mesure = {} }) {
  const aRattacher = database.prepare('SELECT id, date, home_id, away_id FROM debuts_fiches WHERE match_key IS NULL AND date < ?').all(jourD);
  yield 'rattachement';
  const joue = database.prepare(
    `SELECT d.match_key FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre
     WHERE t.club = ? AND t.camp = 1 AND t.adversaire = ? AND t.date >= ? AND t.date <= ? ORDER BY t.date LIMIT 1`
  );
  const trouves = [];
  for (const f of aRattacher) {
    const r = joue.get(f.home_id, f.away_id, plusJours(f.date, -1), plusJours(f.date, 1));
    if (r) trouves.push({ id: f.id, matchKey: r.match_key });
    yield 'rattachement';
  }
  const maj = database.prepare('UPDATE debuts_fiches SET match_key = ? WHERE id = ? AND match_key IS NULL');
  yield* parTranches(database, trouves.map((x) => () => maj.run(x.matchKey, x.id)), tranche, mesure);
  const limite = plusJours(jourD, -ORPHELINES_JOURS);
  const rattachees = new Set(trouves.map((x) => x.id));
  const orphelines = aRattacher.filter((f) => f.date < limite && !rattachees.has(f.id));
  const del = database.prepare(
    `DELETE FROM debuts_fiches WHERE id = ? AND match_key IS NULL AND NOT EXISTS (SELECT 1 FROM team_day t WHERE t.club = debuts_fiches.home_id
       AND t.adversaire = debuts_fiches.away_id AND t.date >= date(debuts_fiches.date, '-1 day') AND t.date <= date(debuts_fiches.date, '+1 day'))`
  );
  let retirees = 0;
  yield* parTranches(database, orphelines.map((f) => () => (retirees += Number(del.run(f.id).changes))), tranche, mesure);
  return { rattachees: trouves.length, orphelines: retirees };
}

// ======================================================= 3. l'étape

/**
 * L'ÉTAPE « debutsDeSaison ». `maintenant` : OBLIGATOIRE (l'heure de la passe) ; `aPart` : le processus à part (false : dans
 * ce processus, pour un essai) ; `fichierCalendrier`, `clubDe`, `graine`, `couples` : pour les essais. Jamais d'exception pour
 * une panne du calcul. Rend { mode: 'complet' | 'reporte' | 'echec', ... }.
 */
export async function faireLesDebutsDeLaNuit({
  maintenant,
  database = openDb(),
  chemin = resolveDbPath(),
  aPart = true,
  delaiMs = DELAI_ENFANT_MS,
  fichierCalendrier = undefined,
  clubDe = null,
  graine = undefined,
  couples = NUIT.couples,
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
  const recus = { clubs: [], fiches: [] };
  const surMorceau = (m) => {
    if (!recus[m?.type]) throw new Error(`morceau inconnu « ${m?.type ?? ''} »`);
    recus[m.type].push(...m.lignes);
  };
  const message = { mode: 'nuit', chemin, instant, jourD, couples, ...(graine === undefined ? {} : { graine }), ...(fichierCalendrier ? { fichierCalendrier } : {}) };
  let fin;
  const tCalcul = performance.now();
  try {
    if (aPart) {
      if (clubDe) throw new Error('débuts de saison : l’annuaire d’essai (clubDe) ne passe pas au processus à part');
      fin = await pauses.attendre(calculerAPart({ message, surMorceau, delaiMs }), 'débuts de saison à part');
    } else {
      const rendre = commencerCalculLourd(NOM_DU_CALCUL);
      try {
        fin = calculerLaNuitDesDebuts({ ...message, database, clubDe, envoyer: (type, lignes) => surMorceau({ type, lignes }) });
      } finally {
        rendre();
      }
      await pauses.pause('débuts de saison (essai, ici)');
    }
  } catch (error) {
    if (error instanceof CalculLourdEnCours || error?.reporte) {
      // Le message de l'annuaire (listeDuCalendrier de l'étape 32) parle du contexte du match : la fin de phrase est celle de l'étape.
      const raison = String(error.message).split('\n')[0].replace(/^Error: /, '').replace(/ — le contexte du match sera calculé à la passe suivante\.?$/, '');
      return { mode: 'reporte', raison, ...base, dureeMs: duree(), ...pauses.bilan() };
    }
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
    const clubs = await executerEnRendantLaMain(rangerLesClubs({ database, clubs: recus.clubs, calculeLe, tranche, mesure }), pauses.siLongtemps);
    const fiches = await executerEnRendantLaMain(rangerLesFiches({ database, fiches: recus.fiches, instant, jourD, tranche, mesure }), pauses.siLongtemps);
    const rattachement = await executerEnRendantLaMain(rattacherEtElaguer({ database, jourD, tranche, mesure }), pauses.siLongtemps);
    ecrites = { clubs, fiches, rattachement };
  } catch (error) {
    return { mode: 'echec', erreur: `rangement : ${String(error?.message ?? error).slice(0, 300)}`, ...base, bilan: fin?.bilan ?? null, dureeMs: duree(), ...pauses.bilan() };
  }
  // 4. L'état de la nuit, en une transaction.
  const bilan = { ...(fin?.bilan ?? {}), calculMs };
  const controle = { calculeLe, jourD, couples: fin?.controle?.couples ?? 0, lignes: fin?.controle?.lignes ?? 0, ecarts: fin?.controle?.ecarts ?? [] };
  const nuit = { calculeLe, jourD, version: VERSION_DEBUTS, versionFiche: VERSION_FICHE, note: bilan.note ?? null, ecrites, bilan, repriseApres: interrompue?.calculeLe ?? null };
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      ecrireLaValeur(database, 'nuit', nuit);
      ecrireLaValeur(database, 'comptes', { calculeLe, jourD, parStatut: bilan.parStatut ?? {}, clubs: bilan.clubs ?? 0, continuiteMoyenne: bilan.continuiteMoyenne ?? null, concernes: bilan.concernes ?? null, sansIdentifiant: bilan.sansIdentifiant ?? 0, noms: bilan.noms ?? [] });
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
    controle,
    repriseApres: interrompue?.calculeLe ?? null,
    rangementMs: Math.round(performance.now() - tRangement),
    plusLongueTrancheMs: Math.round(mesure.plusLongueTrancheMs ?? 0),
    transactions: mesure.transactions ?? 0,
    dureeMs: duree(),
    ...pauses.bilan()
  };
}

/** L'état de la dernière nuit des débuts de saison (lecture seule ; null sans table ou jamais calculée). */
export function etatDesDebuts({ database = openDb() } = {}) {
  return { nuit: lireLaValeur(database, 'nuit'), enCours: lireLaValeur(database, 'en_cours'), comptes: lireLaValeur(database, 'comptes'), controle: lireLaValeur(database, 'controle') };
}

const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${Math.abs(Number(n ?? 0)) > 1 ? plusieurs : un}`;
const pourcent = (x) => `${Math.round(100 * x).toLocaleString('fr-FR')} %`;
const dureeDite = (ms) => {
  const s = Math.max(0, Number(ms ?? 0)) / 1000;
  return s < 60 ? `${s.toLocaleString('fr-FR', { maximumFractionDigits: s < 10 ? 1 : 0 })} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`;
};

/**
 * L'ALERTE DURABLE (`alerts.debutsDeSaison`, la forme des contrôles anti-fuite de ui/src/utils/controlesAntiFuite.js) : les
 * écarts du contrôle par le second chemin (20 au plus, chacun avec sa phrase), leur total, les lignes contrôlées ; null sans
 * écart.
 */
export function alerteDesDebuts({ controle = null, updatedAt = null } = {}) {
  const ecarts = controle?.ecarts ?? [];
  return ecarts.length ? { ecarts: ecarts.slice(0, 20), total: ecarts.length, lignes: controle?.lignes ?? 0, updatedAt } : null;
}

/**
 * Le RÉSULTAT DE L'ÉTAPE pour la passe (refresh-status.json) : { status, summary, details, alert, changed }, en une phrase
 * (conception §6.5) — « reporté », « en échec » ou complet. Pur.
 */
export function resultatDeLEtape(r, { updatedAt = null } = {}) {
  if (r.mode === 'reporte') {
    // la raison du jeton (utils/calculLourd.js) finit déjà par « il sera fait à la passe suivante » : dite une seule fois
    const raison = String(r.raison).replace(/ — il sera fait à la passe suivante\.?$/, '').replace(/\.$/, '');
    return { status: 'warn', summary: `Reporté : ${raison} — les débuts de saison seront calculés à la passe suivante.`, details: { mode: r.mode, reporte: true, raison: r.raison }, changed: false };
  }
  if (r.mode === 'echec') {
    return { status: 'error', summary: `En échec : ${String(r.erreur).slice(0, 240)} — rien d’avancé, les tables d’avant restent ; la passe suivante recommence (${dureeDite(r.dureeMs)}).`, details: { mode: r.mode, erreur: r.erreur, dureeMs: r.dureeMs }, changed: false };
  }
  const b = r.bilan ?? {};
  const c = r.controle ?? {};
  const f = r.ecrites?.fiches ?? {};
  const s = b.parStatut ?? {};
  const ecarts = (c.ecarts ?? []).length;
  const alerte = alerteDesDebuts({ controle: c, updatedAt });
  const mo = b.aPart?.rssMaxOctets ? `${nombre(Math.round(b.aPart.rssMaxOctets / 1048576))} Mo` : 'mémoire non relevée';
  const sansId = b.sansIdentifiant ?? 0;
  return {
    status: alerte ? 'warn' : 'ok',
    summary:
      `Débuts de saison : ${pluriel(b.clubs ?? 0, 'club', 'clubs')} (${nombre(s.debut ?? 0)} en début de saison, ${pluriel((s.promu ?? 0) + (s.relegue ?? 0), 'promu ou relégué', 'promus ou relégués')}, ${pluriel(s.nouveau ?? 0, 'nouveau venu', 'nouveaux venus')})` +
      `, ${pluriel(b.fiches ?? 0, 'fiche', 'fiches')} pour les 14 prochains jours (${pluriel(f.figees ?? 0, 'figée', 'figées')}${sansId ? `, ${pluriel(sansId, 'match', 'matchs')} de championnat sans fiche faute d’identifiant FotMob` : ''})` +
      `, continuité ⌀ ${fini(b.continuiteMoyenne) ? pourcent(b.continuiteMoyenne) : '—'}` +
      ` ; ${dureeDite(b.calculMs ?? r.dureeMs)} à part (${mo})` +
      ` ; contrôle anti-fuite : ${pluriel(c.couples ?? 0, 'couple', 'couples')}, ${pluriel(ecarts, 'écart', 'écarts')}${ecarts ? ` (${c.ecarts[0].texte})` : ''}.`,
    details: {
      mode: r.mode,
      calculeLe: r.calculeLe,
      jourD: r.jourD,
      bilan: b,
      ecrites: r.ecrites ?? null,
      controle: { couples: c.couples ?? 0, lignes: c.lignes ?? 0, ecarts },
      repriseApres: r.repriseApres ?? null,
      dureeMs: r.dureeMs,
      rangementMs: r.rangementMs ?? null,
      plusLongueTrancheMs: r.plusLongueTrancheMs ?? null,
      transactions: r.transactions ?? null,
      blocMaxMs: r.blocMaxMs ?? null
    },
    alert: { key: 'debutsDeSaison', value: alerte },
    changed: false
  };
}

export const __pourLesTests = { parTranches, rangerLesClubs, rangerLesFiches, rattacherEtElaguer, plusJours };
