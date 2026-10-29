/**
 * contexteNuit.js — L'ÉTAPE DE NUIT « contexteDuMatch » (étape 32 du plan, lot 1a, 29/10/2026).
 * -----------------------------------------------------------------------
 * Chaque nuit, une fois par jour civil de Paris (jamais au clic ; ni réseau, ni Claude, rien de payant), APRÈS la
 * sauvegarde et AVANT le contrôle quotidien (toujours dernier) — hors du chemin de nuit de l'essai de l'étape 27 :
 *   1. LE JETON du calcul lourd (utils/calculLourd.js) : pris par un autre → « reporté », dit au résumé ;
 *   2. LE PROCESSUS À PART (contexteEnfant.js, base en lecture seule, tas plafonné, délai) : LA LISTE du calendrier de
 *      saison (J − 2 à J + 18 ; chaque nom par l'annuaire STRICT, jamais de rapprochement souple ; un match sans ses deux
 *      identifiants n'a pas de fiche, il est compté et ses noms sont dits ; l'annuaire pas prêt → « reporté ») — mesurée
 *      dans le bac, elle tenait le serveur jusqu'à 1 405 ms d'affilée : elle tourne donc à part, comme la liste des matchs
 *      de la nuit des déroulés (correctif C du 28/10) —, le cache incrémental des rencontres, la passe chronologique, les
 *      fiches des 14 prochains jours, les arbitres, le contrôle anti-fuite ;
 *   3. (rien d'autre dans le serveur avant le rangement) ;
 *   4. LE RANGEMENT (le serveur, seul écrivain, sous le verrou de la passe) : par tranches de 250, une transaction par
 *      tranche, jamais ouverte quand il rend la main ; `en_cours` posé avant, retiré après. UNE FICHE GELÉE N'EST JAMAIS
 *      RÉÉCRITE : réécrite chaque nuit tant que son coup d'envoi n'est pas passé (heure inconnue : tant que sa date est
 *      après le jour de la nuit), jamais ensuite ; une fiche écrite pour la première fois le jour de son match sans heure
 *      connue, ou après son coup d'envoi, est marquée `apres_coup_d_envoi` (gardée, comptée, écartée de la preuve) ;
 *   5. L'ARCHIVE D'AVANT-MATCH : elle s'écrit au moment où la page FotMob est lue (matchStatsDb.archiverLAvantMatch) ; la
 *      nuit rattrape une lecture d'avant le coup d'envoi restée dans `upcoming_lineups` sans être archivée (une lecture
 *      d'avant la mise en service, une écriture ratée), et compte, pour les matchs joués des deux derniers jours : gardés,
 *      perdus (seulement lus après le coup d'envoi), jamais relevés (PC éteint, page jamais lue) ;
 *   6. LE RATTACHEMENT des fiches passées à la rencontre jouée (par identifiants, la date à un jour près), puis
 *      L'ÉLAGAGE : seules les fiches ORPHELINES (aucune rencontre jouée, plus de 30 jours) partent ; les fiches des matchs
 *      joués et l'archive d'avant-match ne sont JAMAIS élaguées (la preuve après lancement en a besoin, constat 8).
 * L'heure est lue par la passe (jamais ici) ; aucune exception pour une panne du calcul : « reporté » ou « en échec ».
 * -----------------------------------------------------------------------
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, resolveDbPath, archiverLAvantMatch } from '../db/matchStatsDb.js';
import { CALENDAR_FILE_PATH } from '../repositories/seasonCalendarRepository.js';
import { commencerCalculLourd, CalculLourdEnCours } from '../../utils/calculLourd.js';
import { creerPauses, executerEnRendantLaMain, rendreLaMainParDefaut } from '../../utils/travailCooperatif.js';
import { NUIT, GARDE } from './reglagesContexte.js';
import { coupDEnvoiConnu } from './formulesDuContexte.js';
import { COLONNES_RENCONTRES } from './lectureDuMagasin.js';
import { COLONNES_ARBITRES } from '../db/refereeRead.js';
import { calculerLaNuitDuContexte } from './contexteEnfant.js';

const JOUR_MS = 86_400_000;
const ENFANT = fileURLToPath(new URL('./contexteEnfant.js', import.meta.url));
/** Le processus à part : tas plafonné (la passe tient quelques dizaines de Mo ; le cache des rencontres ~60 000 lignes). */
export const OPTIONS_ENFANT = Object.freeze(['--max-old-space-size=512', '--max-semi-space-size=8']);
/** Au-delà, l'enfant est arrêté et rien n'est rangé. */
export const DELAI_ENFANT_MS = 10 * 60_000;
/** Le nom du calcul lourd (le jeton). */
export const NOM_DU_CALCUL = 'contexte du match';
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const iso = (t) => new Date(t).toISOString();
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const FORMAT_JOUR_PARIS = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' });
/** Le jour civil de Paris d'un instant (AAAA-MM-JJ) : celui de la nuit. */
export const jourParis = (t) => FORMAT_JOUR_PARIS.format(new Date(t));
/** La graine du contrôle d'une nuit : son jour de Paris, AAAAMMJJ. */
export const graineDuJour = (t) => Number(jourParis(t).replace(/-/g, ''));

/** L'instant de la passe (ms) : `maintenant` (nombre, texte ISO, Date ou fonction), OBLIGATOIRE — jamais l'horloge lue ici. */
export function instantDe(maintenant) {
  const v = typeof maintenant === 'function' ? maintenant() : maintenant;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : Number.NaN;
  if (!fini(t)) throw new Error('contexte du match : « maintenant » (l’heure de la passe) est obligatoire — jamais l’horloge lue ici.');
  return t;
}

// ======================================================= 1. la liste (dans le processus à part)

/** La liste du calendrier : calculée dans le processus à part (listeDuCalendrier.js) ; ré-exportée pour les essais. */
export { listeDuCalendrier, AnnuairesIndisponibles } from './listeDuCalendrier.js';

// ======================================================= 2. le processus à part

/**
 * Le calcul de la nuit dans un PROCESSUS À PART (patron de simulationNuit.calculerAPart) : sous le jeton du calcul lourd
 * (un autre en cours : rejet CalculLourdEnCours, « reporté »), fork de contexteEnfant.js, sérialisation « avancée », tas
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
    const enfant = fork(fichier, ['--enfant-contexte'], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'advanced', execArgv: [...process.execArgv, ...options] });
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

// ======================================================= 3. le rangement (le serveur, seul écrivain)

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
  database.prepare('INSERT INTO contexte_etat (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run(cle, JSON.stringify(valeur));
const effacerLaValeur = (database, cle) => database.prepare('DELETE FROM contexte_etat WHERE cle = ?').run(cle);

/** La valeur d'une clé de `contexte_etat` (JSON), ou null ; jamais une exception. */
export function lireLaValeur(database, cle) {
  try {
    const r = database.prepare('SELECT valeur FROM contexte_etat WHERE cle = ?').get(cle);
    return r ? JSON.parse(r.valeur) : null;
  } catch {
    return null;
  }
}

/**
 * Une fiche déjà rangée est-elle FIGÉE (jamais réécrite) ? Coup d'envoi connu : il est passé ; inconnu : sa date n'est
 * plus après le jour de la nuit.
 */
export function ficheFigee(ligne, { instant, jourD }) {
  const ko = Date.parse(ligne?.kickoff ?? '');
  if (Number(ligne?.kickoff_connu) && fini(ko)) return instant >= ko;
  return typeof ligne?.date === 'string' && ligne.date <= jourD;
}

/** Une fiche calculée maintenant l'est-elle APRÈS (ou peut-être après) son coup d'envoi ? Même règle que le gel. */
export const ficheApresCoupDEnvoi = (f, { instant, jourD }) => ficheFigee(f, { instant, jourD });

const COLONNES_FICHES = ['date', 'home_id', 'away_id', 'league', 'match_id', 'home_name', 'away_name', 'kickoff', 'kickoff_connu', 'calcule_le', 'version', 'apres_coup_d_envoi', 'facteurs'];

/** RANGE les lignes du cache des rencontres (écrites puis retirées). */
function* rangerLesRencontres({ database, aEcrire, aRetirer, tranche, mesure }) {
  const ins = database.prepare(
    `INSERT INTO contexte_rencontres (${COLONNES_RENCONTRES.join(', ')}) VALUES (${COLONNES_RENCONTRES.map(() => '?').join(', ')})
     ON CONFLICT(match_key) DO UPDATE SET ${COLONNES_RENCONTRES.filter((c) => c !== 'match_key').map((c) => `${c} = excluded.${c}`).join(', ')}`
  );
  const del = database.prepare('DELETE FROM contexte_rencontres WHERE match_key = ?');
  function* ordres() {
    for (const l of aEcrire) yield () => ins.run(...COLONNES_RENCONTRES.map((c) => l[c] ?? null));
    for (const cle of aRetirer) yield () => del.run(cle);
  }
  yield* parTranches(database, ordres(), tranche, mesure);
  return { ecrites: aEcrire.length, retirees: aRetirer.length };
}

/** RANGE les fiches : une fiche figée n'est jamais réécrite ; une fiche neuve d'après le coup d'envoi est marquée. */
export function* rangerLesFiches({ database, fiches, instant, jourD, tranche = GARDE.tranche, mesure = {} }) {
  const lire = database.prepare('SELECT id, date, kickoff, kickoff_connu FROM contexte_fiches WHERE date = ? AND home_id = ? AND away_id = ?');
  const ins = database.prepare(`INSERT INTO contexte_fiches (${COLONNES_FICHES.join(', ')}) VALUES (${COLONNES_FICHES.map(() => '?').join(', ')})`);
  const maj = database.prepare(`UPDATE contexte_fiches SET ${COLONNES_FICHES.filter((c) => !['date', 'home_id', 'away_id'].includes(c)).map((c) => `${c} = ?`).join(', ')} WHERE id = ?`);
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
          maj.run(...COLONNES_FICHES.filter((c) => !['date', 'home_id', 'away_id'].includes(c)).map((c) => l[c] ?? null), ex.id);
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

/** RANGE les arbitres de la nuit (ceux d'une autre nuit qui ne sont plus connus partent ensuite). */
function* rangerLesArbitres({ database, arbitres, calculeLe, tranche, mesure }) {
  const ins = database.prepare(
    `INSERT INTO contexte_arbitres (${COLONNES_ARBITRES.join(', ')}) VALUES (${COLONNES_ARBITRES.map(() => '?').join(', ')})
     ON CONFLICT(cle) DO UPDATE SET ${COLONNES_ARBITRES.filter((c) => c !== 'cle').map((c) => `${c} = excluded.${c}`).join(', ')}`
  );
  function* ordres() {
    for (const l of arbitres) yield () => ins.run(...COLONNES_ARBITRES.map((c) => l[c] ?? null));
  }
  yield* parTranches(database, ordres(), tranche, mesure);
  let retires = 0;
  const del = database.prepare('DELETE FROM contexte_arbitres WHERE cle IN (SELECT cle FROM contexte_arbitres WHERE calcule_le <> ? LIMIT ?)');
  for (;;) {
    let n = 0;
    yield* parTranches(database, [() => (n = Number(del.run(calculeLe, tranche).changes))], 1, mesure);
    retires += n;
    if (n < tranche) break;
  }
  return { ecrits: arbitres.length, retires };
}

// ======================================================= 4. l'archive d'avant-match, le rattachement, l'élagage

/**
 * LE RATTRAPAGE de l'archive (générateur ; le serveur) : chaque lecture de `upcoming_lineups` faite AVANT le coup
 * d'envoi et pas encore archivée l'est (la règle d'archiverLAvantMatch : la dernière d'avant gagne, une lecture d'après
 * ne compte jamais) — la `meta` seule, par json_extract (jamais les compositions entières). Puis les comptes des matchs
 * joués de jourD − 2 à la veille, par l'identifiant FotmMob du MATCH : gardés, perdus, jamais relevés.
 */
export function* gelerLesAvantMatchs({ database, jourD }) {
  const s = { lus: 0, archives: 0, apresCoupDEnvoi: 0, sansCadre: 0, dejaArchives: 0 };
  let lignes = [];
  try {
    lignes = database.prepare("SELECT fotmob_id, date, kickoff, league, home_id, away_id, fetched_at, CASE WHEN json_valid(payload) THEN json_extract(payload, '$.meta') END AS meta FROM upcoming_lineups").all();
  } catch {
    lignes = [];
  }
  for (const l of lignes) {
    s.lus++;
    let meta = null;
    try {
      meta = l.meta ? JSON.parse(l.meta) : null;
    } catch {
      meta = null;
    }
    const r = archiverLAvantMatch({ fotmobId: l.fotmob_id, date: l.date, kickoff: l.kickoff, league: l.league, homeId: l.home_id, awayId: l.away_id, fetchedAt: l.fetched_at, payload: { meta } }, { database });
    if (r.archive) s.archives++;
    else if (r.raison === 'apres-le-coup-d-envoi') s.apresCoupDEnvoi++;
    else if (r.raison === 'sans-cadre' || r.raison === 'coup-d-envoi-inconnu' || r.raison === 'sans-identifiant') s.sansCadre++;
    else s.dejaArchives++;
    yield 'avant-match';
  }
  const comptes = { matchs: 0, gardes: 0, perdus: 0, jamaisReleves: 0, sansIdentifiant: 0 };
  try {
    for (const r of database
      .prepare(
        `SELECT d.fotmob_id AS f,
          EXISTS (SELECT 1 FROM contexte_avant_match a WHERE a.fotmob_id = d.fotmob_id) AS garde,
          EXISTS (SELECT 1 FROM upcoming_lineups u WHERE u.fotmob_id = d.fotmob_id) AS lu
         FROM day_matches d WHERE d.date >= ? AND d.date < ?`
      )
      .iterate(plusJours(jourD, -NUIT.prevusDepuisJours), jourD)) {
      comptes.matchs++;
      if (!r.f) comptes.sansIdentifiant++;
      else if (r.garde) comptes.gardes++;
      else if (r.lu) comptes.perdus++;
      else comptes.jamaisReleves++;
    }
  } catch {
    // registre absent : rien à compter
  }
  yield 'avant-match : comptes';
  const total = (() => {
    try {
      return database.prepare('SELECT COUNT(*) AS n FROM contexte_avant_match').get().n;
    } catch {
      return null;
    }
  })();
  return { ...s, comptes, total };
}

/**
 * LE RATTACHEMENT puis L'ÉLAGAGE (générateur ; le serveur) : chaque fiche passée encore sans rencontre est rattachée à
 * la rencontre JOUÉE entre ces deux clubs (par identifiants, la date à un jour près : `match_key`) ; puis les fiches
 * ORPHELINES (toujours sans rencontre, plus de 30 jours) sont retirées par tranches. Une fiche rattachée et l'archive
 * d'avant-match ne sont JAMAIS élaguées. Rend { rattachees, orphelines }.
 */
export function* rattacherEtElaguer({ database, jourD, tranche = GARDE.tranche, mesure = {} }) {
  const aRattacher = database.prepare('SELECT id, date, home_id, away_id FROM contexte_fiches WHERE match_key IS NULL AND date < ?').all(jourD);
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
  const maj = database.prepare('UPDATE contexte_fiches SET match_key = ? WHERE id = ? AND match_key IS NULL');
  yield* parTranches(database, trouves.map((x) => () => maj.run(x.matchKey, x.id)), tranche, mesure);
  const limite = plusJours(jourD, -GARDE.orphelinesJours);
  const rattachees = new Set(trouves.map((x) => x.id));
  const orphelines = aRattacher.filter((f) => f.date < limite && !rattachees.has(f.id)).map((f) => f.id);
  const del = database.prepare('DELETE FROM contexte_fiches WHERE id = ? AND match_key IS NULL');
  yield* parTranches(database, orphelines.map((id) => () => del.run(id)), tranche, mesure);
  return { rattachees: trouves.length, orphelines: orphelines.length };
}

// ======================================================= 5. l'étape

/**
 * L'ÉTAPE « contexteDuMatch ». `maintenant` : OBLIGATOIRE (l'heure de la passe) ; `aPart` : le processus à part (false :
 * dans ce processus, pour un essai) ; `fichierCalendrier`, `clubDe`, `venues`, `graine` : pour les essais. Jamais
 * d'exception pour une panne du calcul. Rend { mode: 'complet' | 'reporte' | 'echec', ... }.
 */
export async function faireLeContexteDeLaNuit({
  maintenant,
  database = openDb(),
  chemin = resolveDbPath(),
  aPart = true,
  delaiMs = DELAI_ENFANT_MS,
  fichierCalendrier = CALENDAR_FILE_PATH,
  clubDe = null,
  venues = undefined,
  graine = undefined,
  rendreLaMain = rendreLaMainParDefaut,
  tranche = GARDE.tranche
} = {}) {
  const instant = instantDe(maintenant);
  const debut = performance.now();
  const calculeLe = iso(instant);
  const jourD = jourParis(instant);
  const pauses = creerPauses({ rendreLaMain });
  const duree = () => Math.round(performance.now() - debut);
  const base = { calculeLe, jourD };
  // 1-2. Le calcul (à part, la liste du calendrier comprise), reçu par morceaux.
  const recus = { rencontres: [], retirees: [], fiches: [], arbitres: [] };
  const surMorceau = (m) => {
    if (!recus[m?.type]) throw new Error(`morceau inconnu « ${m?.type ?? ''} »`);
    recus[m.type].push(...m.lignes);
  };
  const message = { mode: 'nuit', chemin, instant, jourD, fichierCalendrier, graine: graine === undefined ? graineDuJour(instant) : graine, couples: NUIT.couples, ...(venues === undefined ? {} : { venues }) };
  let fin;
  const tCalcul = performance.now();
  try {
    if (aPart) {
      fin = await pauses.attendre(calculerAPart({ message, surMorceau, delaiMs }), 'contexte du match à part');
    } else {
      const rendre = commencerCalculLourd(NOM_DU_CALCUL);
      try {
        fin = calculerLaNuitDuContexte({ ...message, clubDe, database, envoyer: (type, lignes) => surMorceau({ type, lignes }) });
      } finally {
        rendre();
      }
      await pauses.pause('contexte du match (essai, ici)');
    }
  } catch (error) {
    if (error instanceof CalculLourdEnCours || error?.reporte) return { mode: 'reporte', raison: error.message, ...base, dureeMs: duree(), ...pauses.bilan() };
    return { mode: 'echec', erreur: String(error?.message ?? error).slice(0, 400), ...base, dureeMs: duree(), ...pauses.bilan() };
  }
  const calculMs = Math.round(performance.now() - tCalcul);
  // L'annuaire des clubs pas prêt (vu par le processus à part) : reportée, rien de rangé.
  if (fin?.reporte) return { mode: 'reporte', raison: String(fin.reporte), ...base, dureeMs: duree(), ...pauses.bilan() };
  const liste = fin?.liste ?? { items: 0, sansIdentifiant: [], noms: null };
  // 4. Le rangement.
  const tRangement = performance.now();
  const mesure = { plusLongueTrancheMs: 0 };
  let ecrites;
  try {
    const interrompue = lireLaValeur(database, 'en_cours');
    ecrireLaValeur(database, 'en_cours', { calculeLe, interrompueAvant: interrompue?.calculeLe ?? null });
    await pauses.pause('en cours');
    const rencontres = await executerEnRendantLaMain(rangerLesRencontres({ database, aEcrire: recus.rencontres, aRetirer: recus.retirees, tranche, mesure }), pauses.siLongtemps);
    const fiches = await executerEnRendantLaMain(rangerLesFiches({ database, fiches: recus.fiches, instant, jourD, tranche, mesure }), pauses.siLongtemps);
    const arbitres = await executerEnRendantLaMain(rangerLesArbitres({ database, arbitres: recus.arbitres, calculeLe, tranche, mesure }), pauses.siLongtemps);
    ecrites = { rencontres, fiches, arbitres };
  } catch (error) {
    return { mode: 'echec', erreur: `rangement : ${String(error?.message ?? error).slice(0, 300)}`, ...base, bilan: fin?.bilan ?? null, dureeMs: duree(), ...pauses.bilan() };
  }
  // 5. L'archive d'avant-match ; 6. le rattachement et l'élagage — une panne ici n'efface rien de ce qui est rangé.
  let avantMatch;
  try {
    avantMatch = await executerEnRendantLaMain(gelerLesAvantMatchs({ database, jourD }), pauses.siLongtemps);
  } catch (error) {
    avantMatch = { erreur: String(error?.message ?? error).slice(0, 200) };
  }
  let elague;
  try {
    elague = await executerEnRendantLaMain(rattacherEtElaguer({ database, jourD, tranche, mesure }), pauses.siLongtemps);
  } catch (error) {
    elague = { erreur: String(error?.message ?? error).slice(0, 200) };
  }
  const bilan = { ...(fin?.bilan ?? {}), calculMs };
  const nuit = {
    calculeLe,
    jourD,
    liste: { items: liste.items, sansIdentifiant: liste.sansIdentifiant.length, noms: liste.noms },
    ecrites,
    avantMatch: avantMatch?.comptes ?? null,
    elague,
    bilan
  };
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      ecrireLaValeur(database, 'nuit', nuit);
      ecrireLaValeur(database, 'ligues', { calculeLe, jourD, ligues: fin?.ligues ?? {} });
      ecrireLaValeur(database, 'controle', { calculeLe, lignes: fin?.controle?.lignes ?? 0, couples: fin?.controle?.couples ?? 0, ecarts: fin?.controle?.ecarts ?? [] });
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
    liste: { items: liste.items, sansIdentifiant: liste.sansIdentifiant, noms: liste.noms },
    bilan,
    ecrites,
    avantMatch,
    elague,
    controle: fin?.controle ?? { lignes: 0, ecarts: [], couples: 0 },
    rangementMs: Math.round(performance.now() - tRangement),
    plusLongueTrancheMs: Math.round(mesure.plusLongueTrancheMs ?? 0),
    transactions: mesure.transactions ?? 0,
    ordresParTransactionMax: mesure.ordresParTransactionMax ?? 0,
    dureeMs: duree(),
    ...pauses.bilan()
  };
}

/** L'état de la dernière nuit du contexte (lecture seule ; null sans table ou jamais calculée). */
export function etatDuContexte({ database = openDb() } = {}) {
  return { nuit: lireLaValeur(database, 'nuit'), enCours: lireLaValeur(database, 'en_cours'), controle: lireLaValeur(database, 'controle') };
}

export const __pourLesTests = { parTranches, rangerLesRencontres, rangerLesArbitres, plusJours, coupDEnvoiConnu };
