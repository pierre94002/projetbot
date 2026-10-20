#!/usr/bin/env node
/**
 * rebuild-registries.mjs — reconstruit les annuaires d'identités (teams, people).
 * -----------------------------------------------------------------------
 * Lancé par l'actualisation de l'appli, dans un processus À PART : la
 * reconstruction parcourt les 60 000 rencontres et les 2,2 millions de
 * lignes joueur, en synchrone. Dans le serveur, elle le bloquait 18 à 52
 * secondes — aucune page ne répondait pendant ce temps. L'actualisation
 * tient le verrou de rafraîchissement pendant l'appel : aucun IMPORT n'écrit
 * dans la base pendant ce temps.
 *
 * Mais le verrou de la passe n'arrête pas les boucles du serveur qui écrivent
 * à côté (cotes gratuites autour du coup d'envoi, compositions, pages) :
 * l'une d'elles peut tenir le verrou d'écriture de la base un moment. Le
 * 12/10/2026 à 0 h 21, l'étape a échoué ainsi (« database is locked » après
 * 15 s d'attente, sans nouvel essai). Depuis (retouche du 12/10/2026), le
 * verrou d'écriture est pris EN PATIENTANT (src/data/db/verrouEcriture.js) :
 * chaque essai attend jusqu'à 15 s (busy_timeout, comme l'ouverture commune
 * de matchStatsDb.js), puis de nouveaux essais espacés de 5, 10, 15, 20 puis
 * 30 s, environ 3 minutes en tout. Rien n'est écrit tant que le verrou n'est
 * pas pris : la reconstruction est tout ou rien.
 *
 * Sortie : une ligne JSON sur stdout (le bilan de rebuildRegistries, plus
 * `essais` — combien d'essais il a fallu pour prendre le verrou — et
 * `attenteVerrouMs`), précédée d'une ligne JSON par essai refusé. Au bout
 * des 3 minutes : un message clair EN TÊTE de stderr (le résumé de l'étape
 * en garde le début), code de sortie 1, base inchangée.
 *   node scripts/rebuild-registries.mjs
 *   [--attente-par-essai-ms 15000] [--duree-max-ms 180000] [--pauses-ms 5000,10000,15000,20000,30000]
 * (les options servent aux essais ; l'actualisation n'en passe aucune)
 * -----------------------------------------------------------------------
 */

import { openDb } from '../src/data/db/matchStatsDb.js';
import { rebuildRegistriesPatiemment } from '../src/data/db/identityRegistry.js';
import { VerrouIndisponible, DUREE_MAX_MS, PAUSES_MS } from '../src/data/db/verrouEcriture.js';

/** Ce qu'attend chaque essai : le busy_timeout de l'ouverture commune (matchStatsDb.js). */
const ATTENTE_PAR_ESSAI_MS = 15_000;

function lireOptions(argv) {
  const o = { attenteParEssaiMs: ATTENTE_PAR_ESSAI_MS, dureeMaxMs: DUREE_MAX_MS, pausesMs: [...PAUSES_MS] };
  const entier = (texte, nom) => {
    const n = Number(texte);
    if (texte === undefined || texte === '' || !Number.isInteger(n) || n < 0) throw new Error(`${nom} attend un nombre entier de millisecondes (reçu : ${texte}).`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--attente-par-essai-ms') o.attenteParEssaiMs = entier(argv[++i], x);
    else if (x === '--duree-max-ms') o.dureeMaxMs = entier(argv[++i], x);
    else if (x === '--pauses-ms') o.pausesMs = String(argv[++i] ?? '').split(',').map((p) => entier(p, x));
    else throw new Error(`Option inconnue : ${x}`);
  }
  return o;
}

const options = lireOptions(process.argv.slice(2));
const debut = performance.now();
const database = openDb();
database.exec(`PRAGMA busy_timeout = ${options.attenteParEssaiMs};`);
try {
  const bilan = await rebuildRegistriesPatiemment({
    database,
    dureeMaxMs: options.dureeMaxMs,
    pausesMs: options.pausesMs,
    // Un essai refusé : une ligne sur stdout (l'actualisation ne lit que la dernière, le bilan).
    surEssai: ({ essai, pauseMs, attenteMs }) => console.log(JSON.stringify({ essai, verrouTenu: true, nouvelEssaiDansMs: pauseMs, attenteMs }))
  });
  console.log(JSON.stringify({ ...bilan, ms: Math.round(performance.now() - debut) }));
} catch (error) {
  if (!(error instanceof VerrouIndisponible)) throw error;
  // En tête de stderr, sans pile : le résumé de l'étape ne garde que 300 caractères, commande comprise (~140).
  process.stderr.write(`Annuaires non reconstruits : ${error.message} Refaits en fin de passe ou à la suivante.\n`);
  process.exitCode = 1;
}
