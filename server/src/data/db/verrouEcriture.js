/**
 * verrouEcriture.js — prendre le verrou d'écriture de la base en patientant.
 * -----------------------------------------------------------------------
 * Retouche du 12/10/2026. Dans la nuit du 11 au 12/10 (passe de rattrapage,
 * 297 résultats), l'étape « annuaires » a échoué UNE fois : son processus à
 * part (scripts/rebuild-registries.mjs) a lu le magasin ~23 s, puis
 * `BEGIN IMMEDIATE` a attendu les 15 s du busy_timeout de l'ouverture commune
 * (matchStatsDb.js, openDb) et levé « database is locked », sans nouvel essai.
 *
 * Le verrou de la passe (refreshLock.js) arrête les IMPORTS, pas les boucles du
 * serveur qui écrivent à côté : les cotes gratuites autour du coup d'envoi
 * (jobs/oddsWatch.js), les compositions (lineupPrefetch.js), les pages. Cette
 * nuit-là, la boucle des cotes rattachait d'un seul `UPDATE` 1 536 cotes aux
 * 299 rencontres que la passe venait d'importer (oddsQuotesRepository.js,
 * attachQuotesToMatches, corrigé le même jour : il lit d'abord, puis écrit
 * d'un coup) : 27 s de verrou d'écriture mesurées sur une copie de la
 * sauvegarde de la nuit.
 *
 * CE QUE FAIT `prendreLeVerrouEcriture(database)` : il ouvre la transaction
 * d'écriture (`BEGIN IMMEDIATE`). Si un autre écrivain tient la base
 * (« database is locked »), il réessaie, de plus en plus espacé (PAUSES_MS),
 * jusqu'à ~3 min en tout (DUREE_MAX_MS) ; chaque essai attend lui-même le
 * busy_timeout de la connexion. Tant que le verrou n'est pas pris, RIEN n'est
 * écrit : un échec laisse la base telle quelle (un `BEGIN IMMEDIATE` refusé
 * n'ouvre aucune transaction). Toute autre erreur remonte aussitôt. Au bout du
 * temps : `VerrouIndisponible`, avec le nombre d'essais et la durée.
 *
 * Les durées se mesurent à l'horloge du processus (performance.now) : celle
 * du calendrier est figée dans les essais (test/aides/garde.mjs).
 * -----------------------------------------------------------------------
 */

/** Environ trois minutes en tout pour obtenir le verrou (attentes des essais comprises). */
export const DUREE_MAX_MS = 180_000;
/** Les pauses entre deux essais, de plus en plus longues ; la dernière se répète. */
export const PAUSES_MS = Object.freeze([5_000, 10_000, 15_000, 20_000, 30_000]);

/** SQLITE_BUSY (5) et SQLITE_LOCKED (6) : un autre écrivain tient la base. */
const CODES_VERROU = new Set([5, 6]);

/** L'erreur est-elle « la base est tenue par un autre écrivain » ? */
export function estVerrouille(error) {
  if (CODES_VERROU.has(Number(error?.errcode))) return true;
  return /database (table )?is locked/i.test(String(error?.message ?? ''));
}

/** Le busy_timeout de la connexion (ce qu'attend chaque essai), en ms ; 0 s'il ne se lit pas. */
export function attenteParEssaiMs(database) {
  try {
    return Math.max(0, Number(database.prepare('PRAGMA busy_timeout').get()?.timeout) || 0);
  } catch {
    return 0;
  }
}

/** « 2 min 50 s », « 40 s », « 0,8 s ». */
export function dureeEnMots(ms) {
  const s = Math.max(0, Number(ms) || 0) / 1000;
  if (s < 10) return `${String(Math.round(s * 10) / 10).replace('.', ',')} s`;
  const entieres = Math.round(s);
  const min = Math.floor(entieres / 60);
  return min ? `${min} min ${String(entieres % 60).padStart(2, '0')} s` : `${entieres} s`;
}

/** Le verrou n'a pas été obtenu dans le temps permis : rien n'a été écrit. */
export class VerrouIndisponible extends Error {
  constructor({ essais, attenteMs, cause = null }) {
    // Court : le résumé d'une étape de l'actualisation ne garde que le début d'un message d'échec.
    super(`base tenue par un autre écrivain pendant ${dureeEnMots(attenteMs)} (${essais} essai${essais > 1 ? 's' : ''}) : rien n'a été écrit.`);
    this.name = 'VerrouIndisponible';
    this.essais = essais;
    this.attenteMs = attenteMs;
    if (cause) this.cause = cause;
  }
}

/**
 * Ouvre une transaction d'écriture (`BEGIN IMMEDIATE`) en patientant si la base
 * est tenue. À l'appelant ensuite : COMMIT, ou ROLLBACK à la première panne.
 *
 * @param {import('node:sqlite').DatabaseSync} database
 * @param {object} [options]
 * @param {number} [options.dureeMaxMs]  le temps permis, attentes des essais comprises
 * @param {number[]} [options.pausesMs]  les pauses entre deux essais (la dernière se répète)
 * @param {(ms: number) => Promise<void>} [options.attendre]  la pause (les essais la remplacent)
 * @param {() => number} [options.horloge]  l'horloge du processus, en ms
 * @param {(essai: { essai: number, pauseMs: number, attenteMs: number }) => void} [options.surEssai]  après chaque essai refusé
 * @returns {Promise<{ essais: number, attenteMs: number }>}
 */
export async function prendreLeVerrouEcriture(
  database,
  { dureeMaxMs = DUREE_MAX_MS, pausesMs = PAUSES_MS, attendre = (ms) => new Promise((fin) => setTimeout(fin, ms)), horloge = () => performance.now(), surEssai = null } = {}
) {
  const debut = horloge();
  const attenteEssai = attenteParEssaiMs(database);
  for (let essai = 1; ; essai++) {
    try {
      database.exec('BEGIN IMMEDIATE');
      return { essais: essai, attenteMs: Math.round(horloge() - debut) };
    } catch (error) {
      if (!estVerrouille(error)) throw error;
      const attenteMs = Math.round(horloge() - debut);
      const pause = Math.max(0, Number(pausesMs[Math.min(essai - 1, pausesMs.length - 1)]) || 0);
      // Un essai de plus (sa pause, puis l'attente de la connexion) dépasserait le temps permis : on s'arrête, rien n'est écrit.
      if (attenteMs + pause + attenteEssai > dureeMaxMs) throw new VerrouIndisponible({ essais: essai, attenteMs, cause: error });
      surEssai?.({ essai, pauseMs: pause, attenteMs });
      await attendre(pause);
    }
  }
}
