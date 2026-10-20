/**
 * jugeAPart.js — le JUGE dans un fil à part (étape 19 du plan, 13/10/2026).
 * -----------------------------------------------------------------------
 * Le juge de l'étape 16 (comparer, guard.js) est synchrone et n'est pas
 * retouché : 1 000 tirages sur 30 000 à 100 000 blocs tiennent 0,3 à 3 s
 * d'un seul tenant. Dans le serveur de Pierre, ce seraient autant de
 * secondes sans répondre. Ici, le MÊME comparer tourne dans un Worker : le
 * fil principal attend une promesse et reste libre (pages, boucles du
 * serveur, battement du verrou). Même fonction, mêmes lignes, même graine :
 * le verdict est identique à l'appel direct (test). Le fil se ferme à la
 * fin du résumé, ou à la première panne (elle remonte, jamais avalée).
 * Les petites cases (paris, carte) restent jugées sur place.
 * -----------------------------------------------------------------------
 */

import { Worker } from 'node:worker_threads';
import { LignesInvalides } from './guard.js';

/** Les lignes du juge d'une case : une par match où les deux pertes log existent (a = la face, b = le moteur). */
export function lignesDuJuge(blocs, a, b, n) {
  const lignes = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(a[i]) && Number.isFinite(b[i])) lignes.push({ bloc: blocs[i], a: a[i], b: b[i] });
  return lignes;
}

/**
 * Ouvre le fil du juge. Rend { comparer({ blocs, a, b, n }, options) → Promise<résultat de comparer>,
 * fermer() }. Les tableaux sont COPIÉS (leurs n premières cases) puis transférés : la case garde les siens.
 */
export function ouvrirJugeAPart() {
  const fil = new Worker(new URL('./jugeAPartFil.js', import.meta.url));
  const attentes = new Map();
  let prochain = 0;
  let panne = null;
  let ferme = false;
  const toutRefuser = (error) => {
    panne ??= error;
    for (const { rejeter } of attentes.values()) rejeter(panne);
    attentes.clear();
  };
  fil.on('message', ({ id, resultat, erreur }) => {
    const attente = attentes.get(id);
    if (!attente) return;
    attentes.delete(id);
    if (erreur) {
      // L'erreur du juge garde sa classe (LignesInvalides : une ligne fautive, une option absurde).
      const e = erreur.classe === 'LignesInvalides' ? new LignesInvalides(erreur.message) : new Error(erreur.message);
      if (erreur.classe !== 'LignesInvalides') e.name = erreur.name;
      attente.rejeter(e);
    } else attente.resoudre(resultat);
  });
  fil.on('error', toutRefuser);
  fil.on('exit', (code) => {
    if (!ferme || attentes.size) toutRefuser(new Error(`Le fil du juge s'est arrêté (code ${code}).`));
  });
  return {
    comparer({ blocs, a, b, n }, options) {
      if (panne) return Promise.reject(panne);
      if (ferme) return Promise.reject(new Error('Le fil du juge est fermé.'));
      const id = prochain++;
      const copie = { blocs: blocs.slice(0, n), a: a.slice(0, n), b: b.slice(0, n) };
      return new Promise((resoudre, rejeter) => {
        attentes.set(id, { resoudre, rejeter });
        fil.postMessage({ id, n, ...copie, options }, [copie.blocs.buffer, copie.a.buffer, copie.b.buffer]);
      });
    },
    async fermer() {
      if (ferme) return;
      ferme = true;
      await fil.terminate();
    }
  };
}
