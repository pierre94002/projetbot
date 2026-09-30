#!/usr/bin/env node
/**
 * settle-pending-outcomes.mjs
 * -----------------------------------------------------------------------
 * Règle les pronostics du moteur et les sélections de paris en attente dont
 * le résultat est connu — la même chose que l'étape « Règlement » de
 * l'actualisation de l'appli, qui s'en charge d'elle-même depuis le
 * 24/09/2026 (cf. src/data/providers/settlementService.js). Ce script ne
 * sert plus qu'à la main.
 *
 * Il prend le verrou partagé de l'actualisation : lancé pendant une passe
 * du serveur, il se contente de le dire au lieu d'écrire les mêmes journaux
 * en même temps.
 *
 * Usage (depuis server/) :
 *   node scripts/settle-pending-outcomes.mjs            règle
 *   node scripts/settle-pending-outcomes.mjs --dry-run  montre sans écrire
 * -----------------------------------------------------------------------
 */

import { withRefreshLock } from '../src/data/providers/refreshLock.js';
import { settlePending } from '../src/data/providers/settlementService.js';

const apply = !process.argv.includes('--dry-run');

// Une simulation (--dry-run) n'écrit rien : pas de marque de données non plus.
const bilan = await withRefreshLock(async () => settlePending({ apply }), { stamp: apply });
if (bilan.skipped) {
  console.error(`Une actualisation est en cours (${bilan.skipped}) : rien n'est réglé, réessayez après.`);
  process.exit(2);
}
for (const s of bilan.samples) console.error(`[${s.kind}] ${s.status}${s.before ? ` (avant : ${s.before})` : ''} — ${s.label}`);
for (const c of bilan.contradictions.samples) console.error(`[contradiction] ${c.status} → ${c.expected} — ${c.label}`);
const { samples, ...resume } = bilan;
console.log(JSON.stringify({ ...resume, contradictions: { count: bilan.contradictions.count } }));
