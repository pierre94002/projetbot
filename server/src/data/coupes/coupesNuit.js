/**
 * coupesNuit.js — L'ÉTAPE DE NUIT « coupesEtMatchsAPart » (étape 36 du plan, lot 1, 09/11/2026).
 * -----------------------------------------------------------------------
 * Chaque nuit, une fois par jour civil de Paris (jamais au clic ; ni réseau, ni Claude, rien de payant), APRÈS la
 * combinaison à blanc et AVANT le contrôle quotidien (toujours dernier) — après la simulation de l'étape 28, qu'elle lit ;
 * hors du chemin de nuit de l'essai de l'étape 27, chargée par un import() DYNAMIQUE dans la passe (une erreur ici
 * n'empêche jamais la nuit de démarrer) :
 *   1. LE JETON du calcul lourd (utils/calculLourd.js) : pris par un autre → « reporté », dit au résumé ;
 *   2. LE PROCESSUS À PART (coupesEnfant.js, mode « nuit » : base en lecture seule, tas plafonné, délai de 10 min,
 *      l'instant de la passe reçu ; l'annuaire vérifié d'abord, pas prêt → « reporté ») : les rencontres de coupe jusqu'à
 *      la veille, leurs tours, natures et issues, les formats, les stades habituels, et la FICHE de chaque match de coupe
 *      des 14 prochains jours ;
 *   3. LE RANGEMENT (le serveur, seul écrivain, sous le verrou de la passe) : par tranches de 250, une transaction par
 *      tranche, jamais ouverte quand il rend la main ; `en_cours` posé avant, retiré après ; une fiche n'est JAMAIS
 *      réécrite après son coup d'envoi, jamais élaguée pour un match joué ; une fiche orpheline (match reporté) part
 *      après 30 jours ;
 *   4. L'ÉTAT de la nuit (`coupes_etat` : nuit, calendrier, controles) écrit en une transaction.
 * Rien de tout cela n'est lu par le moteur ni envoyé à l'IA. L'heure est lue par la passe (jamais ici).
 * -----------------------------------------------------------------------
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, resolveDbPath } from '../db/matchStatsDb.js';
import { commencerCalculLourd, CalculLourdEnCours } from '../../utils/calculLourd.js';
import { creerPauses, executerEnRendantLaMain, rendreLaMainParDefaut } from '../../utils/travailCooperatif.js';
import { NUIT, VERSION_COUPES, VERSION_RENCONTRES, COMPTES_CASSES, COUPES_UEFA, BUTS_EXTERIEUR } from './reglagesCoupes.js';
import { calculerLaNuitDesCoupes } from './coupesEnfant.js';

const ENFANT = fileURLToPath(new URL('./coupesEnfant.js', import.meta.url));
/** Le processus à part : tas plafonné (les ~11 000 rencontres de coupe et les réceptions des clubs : quelques dizaines de Mo). */
export const OPTIONS_ENFANT = Object.freeze(['--max-old-space-size=384', '--max-semi-space-size=8']);
/** Au-delà, l'enfant est arrêté et rien n'est rangé. */
export const DELAI_ENFANT_MS = 10 * 60_000;
/** Le nom du calcul lourd (le jeton). */
export const NOM_DU_CALCUL = 'coupes';
/** Les colonnes des tables (matchStatsDb.js, COUPES_DDL). */
export const COLONNES_RENCONTRES = Object.freeze(['match_key', 'league', 'saison', 'date', 'home_id', 'away_id', 'tour_brut', 'tour', 'famille', 'bloc', 'nature_du_bloc', 'role', 'aller_key', 'avance', 'buts_dom', 'buts_ext', 'bp90', 'bc90', 'fin', 'observation_format', 'seance_carte', 'seance_suite', 'qualifie', 'comment', 'raison', 'stade', 'lieu', 'version']);
export const COLONNES_FORMATS = Object.freeze(['league', 'saison', 'nature', 'format', 'prolongations', 'directs', 'indetermines', 'buts_exterieur', 'calcule_le', 'version']);
export const COLONNES_STADES = Object.freeze(['club', 'stade', 'receptions', 'autres', 'lat', 'long', 'calcule_le', 'version']);
export const COLONNES_LIGNES = Object.freeze(['date', 'home_id', 'away_id', 'league', 'match_id', 'kickoff', 'kickoff_connu', 'calcule_le', 'version', 'faits', 'grille_page']);
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const iso = (t) => new Date(t).toISOString();
const JOUR_MS = 86_400_000;
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const FORMAT_JOUR_PARIS = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' });
/**
 * Le coup d’envoi EFFECTIF d’une fiche (ms) : le vrai quand il est connu ; sinon 10 h UTC du jour du match — avant presque
 * tous les matchs : une fiche à l’heure inconnue n’est plus réécrite à partir de là (prudent : jamais une source d’après le match).
 */
export const coupDEnvoiEffectif = ({ date, kickoff, kickoffConnu }) => {
  const ko = Date.parse(kickoff ?? '');
  return kickoffConnu && Number.isFinite(ko) ? ko : Date.parse(`${date}T10:00:00.000Z`);
};
/** Le jour civil de Paris d'un instant (AAAA-MM-JJ) : celui de la nuit. */
export const jourParis = (t) => FORMAT_JOUR_PARIS.format(new Date(t));

/** L'instant de la passe (ms) : `maintenant` (nombre, texte ISO, Date ou fonction), OBLIGATOIRE — jamais l'horloge lue ici. */
export function instantDe(maintenant) {
  const v = typeof maintenant === 'function' ? maintenant() : maintenant;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : Number.NaN;
  if (!fini(t)) throw new Error('coupes : « maintenant » (l’heure de la passe) est obligatoire — jamais l’horloge lue ici.');
  return t;
}

// ======================================================= 1. le processus à part

/**
 * Le calcul de la nuit dans un PROCESSUS À PART (patron de cartonsNuit.calculerAPart) : sous le jeton du calcul lourd
 * (un autre en cours : rejet CalculLourdEnCours, « reporté »), fork de coupesEnfant.js, sérialisation « avancée », tas
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
    const enfant = fork(fichier, ['--enfant-coupes'], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'advanced', execArgv: [...process.execArgv, ...options] });
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
  database.prepare('INSERT INTO coupes_etat (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run(cle, JSON.stringify(valeur));
const effacerLaValeur = (database, cle) => database.prepare('DELETE FROM coupes_etat WHERE cle = ?').run(cle);

/** La valeur d'une clé de `coupes_etat` (JSON), ou null ; jamais une exception. */
export function lireLaValeur(database, cle) {
  try {
    const r = database.prepare('SELECT valeur FROM coupes_etat WHERE cle = ?').get(cle);
    return r ? JSON.parse(r.valeur) : null;
  } catch {
    return null;
  }
}

/** Un ordre « insérer ou remplacer » sur une table à clé `cle`. */
const upsert = (database, table, colonnes, cle) =>
  database.prepare(
    `INSERT INTO ${table} (${colonnes.join(', ')}) VALUES (${colonnes.map(() => '?').join(', ')})
     ON CONFLICT(${cle}) DO UPDATE SET ${colonnes.filter((c) => !cle.split(', ').includes(c)).map((c) => `${c} = excluded.${c}`).join(', ')}`
  );

/** RANGE les rencontres reçues ; puis, pour chaque coupe-saison rangée, retire celles qui n'y sont plus (doublons fusionnés). */
function* rangerLesRencontres({ database, lignes, saisons, tranche, mesure }) {
  const ins = upsert(database, 'coupes_rencontres', COLONNES_RENCONTRES, 'match_key');
  yield* parTranches(database, (function* () {
    for (const l of lignes) yield () => ins.run(...COLONNES_RENCONTRES.map((c) => l[c] ?? null));
  })(), tranche, mesure);
  const recues = new Set(lignes.map((l) => l.match_key));
  const aRetirer = [];
  const lire = database.prepare('SELECT match_key FROM coupes_rencontres WHERE league = ? AND saison = ?');
  for (const s of saisons) for (const r of lire.iterate(s.league, s.saison)) if (!recues.has(r.match_key)) aRetirer.push(r.match_key);
  const del = database.prepare('DELETE FROM coupes_rencontres WHERE match_key = ?');
  yield* parTranches(database, (function* () {
    for (const k of aRetirer) yield () => del.run(k);
  })(), tranche, mesure);
  return { ecrites: lignes.length, retirees: aRetirer.length };
}

/** RANGE une table refaite chaque nuit (formats, stades) : écrites, puis celles d'une autre nuit retirées. */
function* rangerUneTable({ database, table, colonnes, cle, lignes, calculeLe, tranche, mesure }) {
  const ins = upsert(database, table, colonnes, cle);
  yield* parTranches(database, (function* () {
    for (const l of lignes) yield () => ins.run(...colonnes.map((c) => l[c] ?? null));
  })(), tranche, mesure);
  let retirees = 0;
  yield* parTranches(database, [() => (retirees = Number(database.prepare(`DELETE FROM ${table} WHERE calcule_le <> ?`).run(calculeLe).changes))], 1, mesure);
  return { ecrites: lignes.length, retirees };
}

/**
 * RANGE LES FICHES des matchs de coupe à venir : une fiche dont le coup d'envoi est passé (ou marquée « après le coup
 * d'envoi ») n'est JAMAIS réécrite ; les autres sont écrites ou remplacées (la dernière d'avant le coup d'envoi gagne).
 * Puis les fiches dont le coup d'envoi est passé sont marquées (figées), et les orphelines de plus de 30 jours (aucune
 * rencontre jouée à ±1 jour entre ces deux clubs) retirées — jamais une fiche de match joué.
 */
function* rangerLesFiches({ database, lignes, instant, jourD, tranche, mesure }) {
  const lire = database.prepare('SELECT id, date, kickoff, kickoff_connu, apres_coup_d_envoi FROM coupes_lignes WHERE date = ? AND home_id = ? AND away_id = ?');
  const ins = database.prepare(
    `INSERT INTO coupes_lignes (${COLONNES_LIGNES.join(', ')}) VALUES (${COLONNES_LIGNES.map(() => '?').join(', ')})
     ON CONFLICT(date, home_id, away_id) DO UPDATE SET ${COLONNES_LIGNES.filter((c) => !['date', 'home_id', 'away_id'].includes(c)).map((c) => `${c} = excluded.${c}`).join(', ')}
     WHERE coupes_lignes.apres_coup_d_envoi = 0`
  );
  let ecrites = 0;
  let gardees = 0;
  yield* parTranches(database, (function* () {
    for (const l of lignes) {
      yield () => {
        const deja = lire.get(l.date, l.home_id, l.away_id);
        const ko = deja ? coupDEnvoiEffectif({ date: deja.date, kickoff: deja.kickoff, kickoffConnu: Number(deja.kickoff_connu) === 1 }) : null;
        if (deja && (Number(deja.apres_coup_d_envoi) === 1 || ko <= instant)) {
          gardees++;
          return;
        }
        ins.run(...COLONNES_LIGNES.map((c) => l[c] ?? null));
        ecrites++;
      };
    }
  })(), tranche, mesure);
  let figees = 0;
  let orphelines = 0;
  yield* parTranches(database, [
    () => {
      // Figée : le coup d’envoi effectif passé (l’heure connue, sinon 10 h UTC du jour du match).
      figees = Number(database.prepare("UPDATE coupes_lignes SET apres_coup_d_envoi = 1 WHERE apres_coup_d_envoi = 0 AND ((kickoff_connu = 1 AND kickoff <= ?) OR (kickoff_connu = 0 AND date || 'T10:00:00.000Z' <= ?))").run(iso(instant), iso(instant)).changes);
    },
    () => {
      orphelines = Number(
        database
          .prepare(
            `DELETE FROM coupes_lignes WHERE date < ? AND NOT EXISTS (SELECT 1 FROM coupes_rencontres r WHERE r.home_id = coupes_lignes.home_id AND r.away_id = coupes_lignes.away_id AND r.date >= date(coupes_lignes.date, '-1 day') AND r.date <= date(coupes_lignes.date, '+1 day'))`
          )
          .run(plusJours(jourD, -NUIT.orphelinesJours)).changes
      );
    }
  ], 1, mesure);
  return { ecrites, gardees, figees, orphelines };
}

// ======================================================= 3. l'étape

/**
 * L'ÉTAPE « coupesEtMatchsAPart ». `maintenant` : OBLIGATOIRE (l'heure de la passe) ; `aPart` : le processus à part (false :
 * dans ce processus, pour un essai) ; `fichierCalendrier`, `clubDe` : pour les essais. Jamais d'exception pour une panne
 * du calcul. Rend { mode: 'complet' | 'reporte' | 'echec', ... }.
 */
export async function faireLesCoupesDeLaNuit({
  maintenant,
  database = openDb(),
  chemin = resolveDbPath(),
  aPart = true,
  delaiMs = DELAI_ENFANT_MS,
  fichierCalendrier = undefined,
  clubDe = null,
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
  const recus = { rencontres: [], saisons: [], formats: [], stades: [], lignes: [] };
  const surMorceau = (m) => {
    if (!recus[m?.type]) throw new Error(`morceau inconnu « ${m?.type ?? ''} »`);
    recus[m.type].push(...m.lignes);
  };
  const message = { mode: 'nuit', chemin, instant, jourD, ...(fichierCalendrier ? { fichierCalendrier } : {}) };
  let fin;
  const tCalcul = performance.now();
  try {
    if (aPart) {
      if (clubDe) throw new Error('coupes : l’annuaire d’essai (clubDe) ne passe pas au processus à part');
      fin = await pauses.attendre(calculerAPart({ message, surMorceau, delaiMs }), 'coupes à part');
    } else {
      const rendre = commencerCalculLourd(NOM_DU_CALCUL);
      try {
        fin = calculerLaNuitDesCoupes({ ...message, database, clubDe, envoyer: (type, lignes) => surMorceau({ type, lignes }) });
      } finally {
        rendre();
      }
      await pauses.pause('coupes (essai, ici)');
    }
  } catch (error) {
    if (error instanceof CalculLourdEnCours || error?.reporte) {
      // Le message de l'annuaire (listeDuCalendrier de l'étape 32) parle du contexte du match : la fin de phrase est celle des coupes.
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
    const rencontres = await executerEnRendantLaMain(rangerLesRencontres({ database, lignes: recus.rencontres, saisons: recus.saisons, tranche, mesure }), pauses.siLongtemps);
    const formats = await executerEnRendantLaMain(rangerUneTable({ database, table: 'coupes_formats', colonnes: COLONNES_FORMATS, cle: 'league, saison, nature', lignes: recus.formats, calculeLe, tranche, mesure }), pauses.siLongtemps);
    const stades = await executerEnRendantLaMain(rangerUneTable({ database, table: 'coupes_stades', colonnes: COLONNES_STADES, cle: 'club', lignes: recus.stades, calculeLe, tranche, mesure }), pauses.siLongtemps);
    const fiches = await executerEnRendantLaMain(rangerLesFiches({ database, lignes: recus.lignes, instant, jourD, tranche, mesure }), pauses.siLongtemps);
    ecrites = { rencontres, formats, stades, fiches };
  } catch (error) {
    return { mode: 'echec', erreur: `rangement : ${String(error?.message ?? error).slice(0, 300)}`, ...base, bilan: fin?.bilan ?? null, dureeMs: duree(), ...pauses.bilan() };
  }
  // 4. L'état de la nuit, en une transaction.
  const bilan = { ...(fin?.bilan ?? {}), calculMs };
  const nuit = { calculeLe, jourD, version: VERSION_COUPES, versionRencontres: VERSION_RENCONTRES, ecrites, bilan, repriseApres: interrompue?.calculeLe ?? null };
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      ecrireLaValeur(database, 'nuit', nuit);
      ecrireLaValeur(database, 'calendrier', { calculeLe, jourD, matchs: fin?.calendrier ?? [] });
      ecrireLaValeur(database, 'controles', { calculeLe, jourD, ...(fin?.controles ?? {}), fuites: fin?.fuites ?? [] });
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
    controles: fin?.controles ?? null,
    fuites: fin?.fuites ?? [],
    repriseApres: interrompue?.calculeLe ?? null,
    rangementMs: Math.round(performance.now() - tRangement),
    plusLongueTrancheMs: Math.round(mesure.plusLongueTrancheMs ?? 0),
    transactions: mesure.transactions ?? 0,
    dureeMs: duree(),
    ...pauses.bilan()
  };
}

/** L'état de la dernière nuit des coupes (lecture seule ; null sans table ou jamais calculée). */
export function etatDesCoupes({ database = openDb() } = {}) {
  return { nuit: lireLaValeur(database, 'nuit'), enCours: lireLaValeur(database, 'en_cours'), controles: lireLaValeur(database, 'controles') };
}

const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${Math.abs(Number(n ?? 0)) > 1 ? plusieurs : un}`;
const pourcent = (x) => `${(100 * x).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
const dureeDite = (ms) => {
  const s = Math.max(0, Number(ms ?? 0)) / 1000;
  return s < 60 ? `${s.toLocaleString('fr-FR', { maximumFractionDigits: s < 10 ? 1 : 0 })} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`;
};

/**
 * L'ALERTE DURABLE (`alerts.coupesEtMatchsAPart`) : un contrôle sous son seuil (le qualifié ne rejoue pas au tour suivant,
 * l'accord carte / tour suivant, des buts à l'extérieur dans une coupe de l'UEFA), une fuite de fiche ; null sinon.
 */
export function alerteDesCoupes({ controles = null, fuites = [], updatedAt = null }) {
  const raisons = [];
  const c = controles ?? {};
  if (c.rejoueN > 0 && c.rejoueOk / c.rejoueN < COMPTES_CASSES.qualifieRejoueMin) raisons.push(`le qualifié ne rejoue au tour suivant que dans ${pourcent(c.rejoueOk / c.rejoueN)} des confrontations décidées par le score (attendu au moins ${pourcent(COMPTES_CASSES.qualifieRejoueMin)}) : une erreur d’appariement à regarder`);
  if ((c.desaccord ?? 0) > 0 && c.carte > 0 && (c.desaccord / c.carte) > 1 - COMPTES_CASSES.accordCarteMin) raisons.push(`${pluriel(c.desaccord, 'séance', 'séances')} où la carte des tirs et le tour suivant se contredisent`);
  for (const b of c.butsExterieur ?? []) if (COUPES_UEFA.includes(b.league) && b.cas >= BUTS_EXTERIEUR.cas) raisons.push(`${b.league} ${b.saison} : ${pluriel(b.cas, 'retour décidé', 'retours décidés')} à égalité de cumul sans prolongation (règle des buts à l’extérieur ? données ?)`);
  if (fuites.length) raisons.push(`${pluriel(fuites.length, 'source de fiche datée', 'sources de fiche datées')} après le coup d’envoi (gardée hors de la fiche)`);
  return raisons.length ? { raisons, updatedAt } : null;
}

/**
 * Le RÉSULTAT DE L'ÉTAPE pour la passe (refresh-status.json) : { status, summary, details, alert, changed }, en une phrase
 * — « reporté », « en échec » ou complet. Pur.
 */
export function resultatDeLEtape(r, { updatedAt = null } = {}) {
  if (r.mode === 'reporte') {
    return { status: 'warn', summary: `Reporté : ${String(r.raison).replace(/\.$/, '')} — les coupes seront rangées à la passe suivante.`, details: { mode: r.mode, reporte: true, raison: r.raison }, changed: false };
  }
  if (r.mode === 'echec') {
    return { status: 'error', summary: `En échec : ${String(r.erreur).slice(0, 240)} — rien d’avancé, les tables d’avant restent ; la passe suivante recommence (${dureeDite(r.dureeMs)}).`, details: { mode: r.mode, erreur: r.erreur, dureeMs: r.dureeMs }, changed: false };
  }
  const b = r.bilan ?? {};
  const c = r.controles ?? {};
  const f = r.ecrites?.fiches ?? {};
  const alerte = alerteDesCoupes({ controles: c, fuites: r.fuites ?? [], updatedAt });
  const mo = b.aPart?.rssMaxOctets ? `${nombre(Math.round(b.aPart.rssMaxOctets / 1048576))} Mo` : 'mémoire non relevée';
  const decises = c.decisifs ?? 0;
  return {
    status: alerte ? 'warn' : 'ok',
    summary:
      `Coupes : ${pluriel(r.ecrites?.rencontres?.ecrites ?? 0, 'rencontre rangée', 'rencontres rangées')}${b.tout ? ' (toutes, première nuit)' : ` (${pluriel(b.actives ?? 0, 'coupe-saison active', 'coupes-saisons actives')})`}` +
      ` — ${pluriel(c.allerRetour ?? 0, 'confrontation aller-retour', 'confrontations aller-retour')}, ${pluriel(c.rejouages ?? 0, 'rejouage', 'rejouages')} ; ${pluriel(decises, 'match décisif', 'matchs décisifs')} dont ${decises ? pourcent((c.connues ?? 0) / decises) : '0 %'} à l’issue connue (séances : ${nombre(c.carte ?? 0)} par la carte des tirs, ${nombre(c.suite ?? 0)} par le tour suivant, ${nombre(c.desaccord ?? 0)} en désaccord)` +
      ` ; le qualifié rejoue au tour suivant dans ${c.rejoueN ? pourcent(c.rejoueOk / c.rejoueN) : '—'} des cas` +
      ` ; ${pluriel(b.fiches ?? 0, 'match de coupe des 14 prochains jours', 'matchs de coupe des 14 prochains jours')} (${nombre(b.avecGrille ?? 0)} avec la grille de la page), ${nombre(f.ecrites ?? 0)} fiches écrites, ${nombre(f.gardees ?? 0)} gardées telles quelles (coup d’envoi passé), ${nombre(f.figees ?? 0)} figées cette nuit` +
      ` ; ${dureeDite(b.calculMs ?? r.dureeMs)} à part (${mo}), rangement ${dureeDite(r.rangementMs ?? 0)}` +
      (alerte ? ` ; à regarder : ${alerte.raisons.join(' ; ')}.` : '.') +
      ' Explication seulement : jamais lu par le moteur ni envoyé à l’IA.',
    details: {
      mode: r.mode,
      calculeLe: r.calculeLe,
      jourD: r.jourD,
      bilan: b,
      ecrites: r.ecrites ?? null,
      controles: c,
      fuites: (r.fuites ?? []).length,
      dureeMs: r.dureeMs,
      rangementMs: r.rangementMs ?? null,
      plusLongueTrancheMs: r.plusLongueTrancheMs ?? null,
      blocMaxMs: r.blocMaxMs ?? null
    },
    alert: { key: 'coupesEtMatchsAPart', value: alerte },
    changed: false
  };
}

export const __pourLesTests = { parTranches, rangerLesRencontres, rangerUneTable, rangerLesFiches };
