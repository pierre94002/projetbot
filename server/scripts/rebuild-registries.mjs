#!/usr/bin/env node
/**
 * rebuild-registries.mjs — reconstruit les annuaires d'identités (teams, people).
 * -----------------------------------------------------------------------
 * Lancé par l'actualisation de l'appli, dans un processus À PART : la
 * reconstruction parcourt les 60 000 rencontres et les 2,2 millions de
 * lignes joueur, en synchrone. Dans le serveur, elle le bloquait 18 à 52
 * secondes — aucune page ne répondait pendant ce temps. L'actualisation
 * tient le verrou de rafraîchissement pendant l'appel : personne d'autre
 * n'écrit dans la base.
 *
 * Sortie : une ligne JSON sur stdout (le bilan de rebuildRegistries).
 *   node scripts/rebuild-registries.mjs
 * -----------------------------------------------------------------------
 */

import { rebuildRegistries } from '../src/data/db/identityRegistry.js';

const debut = Date.now();
const bilan = rebuildRegistries();
console.log(JSON.stringify({ ...bilan, ms: Date.now() - debut }));
