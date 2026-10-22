/**
 * bettingMapEnfant.js — le calcul de la carte « où parier » dans un PROCESSUS À PART (étape 23 du plan,
 * 22/10/2026). Lancé par bettingMapCalcul.calculerAPart (fork) ; ce n'est pas un script à lancer à la main.
 *
 * POURQUOI : la carte relit le résumé du banc (1 à 3 Mo de JSON), mesure la valeur de clôture de milliers de
 * pronostics gelés (quelques millisecondes chacun, une minute ou deux au bout d'un an) et juge des centaines de
 * cases : dans le serveur, cela tiendrait la main ; ici, le serveur attend la réponse sans rien bloquer.
 *
 * Reçoit { chemin, options } par le canal du processus parent, ouvre la base EN LECTURE SEULE (jamais un second
 * écrivain : c'est le serveur qui range la carte), calcule, envoie la carte ou { erreur }, et s'arrête.
 */

import { DatabaseSync } from 'node:sqlite';
import { calculerLaCarte } from './bettingMapCalcul.js';

process.once('message', ({ chemin, options }) => {
  let db = null;
  let reponse;
  try {
    db = new DatabaseSync(chemin, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 15000;');
    const debut = Date.now();
    const carte = calculerLaCarte({ database: db, ...(options ?? {}) });
    reponse = { carte, dureeMs: Date.now() - debut, rssFinOctets: process.memoryUsage().rss };
  } catch (error) {
    reponse = { erreur: String(error?.message ?? error) };
  } finally {
    try {
      db?.close();
    } catch {
      // déjà fermée
    }
  }
  process.send(reponse, () => process.exit(0));
});
