#!/usr/bin/env node
/**
 * sandbox-diff.mjs — ce qui a changé dans le bac à sable depuis sa préparation.
 * -----------------------------------------------------------------------
 * Étape 2 du plan CôteMaster ; mode d'emploi : docs/bac-a-sable.md.
 *
 *   node server/scripts/sandbox-diff.mjs [--piste <nom>] [--json]   (depuis le dépôt)
 *   (essais du script lui-même : --bac <dossier> --depot <dossier>)
 *
 * Liste les fichiers SOURCE modifiés, ajoutés ou supprimés dans le bac par
 * rapport à manifeste.json, et signale un CONFLIT quand le même fichier a
 * aussi changé dans le dépôt depuis la préparation (sandbox-apply refuse
 * alors de recopier). Indique aussi ce qui a bougé dans le dépôt seul (repris
 * à la prochaine préparation). Les données (server\data) ne sont jamais
 * comparées : le bac y écrit librement. N'écrit rien.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import * as c from './sandbox-commun.mjs';

function main() {
  const { valeurs, drapeaux } = c.lireOptions(process.argv.slice(2), { avecValeur: ['piste', 'bac', 'depot'], drapeaux: ['json'] });
  const depot = path.resolve(valeurs.depot ?? c.DEPOT);
  const dossier = c.dossierDuBac({ bac: valeurs.bac, piste: valeurs.piste });
  c.controlerEmplacements({ depot, dossier });
  const ch = c.cheminsDuBac(dossier);
  const manifeste = c.lireManifeste(ch.manifeste);
  if (!manifeste || !fs.existsSync(ch.code)) {
    console.error(`Pas de bac préparé dans ${dossier} (manifeste.json ou code\\ absent) : node server/scripts/sandbox-prepare.mjs`);
    process.exit(2);
  }
  const interrompue = fs.existsSync(ch.marqueur);
  const { changements, depotSeulement, fichiersBac } = c.comparer({ depot, codeBac: ch.code, manifeste });
  const aRecopier = changements.filter((x) => !x.dejaIdentique);
  const conflits = changements.filter((x) => x.conflit);

  if (drapeaux.has('json')) {
    console.log(JSON.stringify({ bac: dossier, depot, preparedAt: manifeste.preparedAt, preparationInterrompue: interrompue, fichiersBac, changements, depotSeulement }, null, 2));
    return;
  }

  console.log(`Bac à sable : ${dossier} — préparé le ${manifeste.preparedAtLocal ?? c.dateLocale(manifeste.preparedAt)}`);
  if (interrompue) console.log('ATTENTION : la dernière préparation a été interrompue ; relancez sandbox-prepare avant de recopier quoi que ce soit.');
  console.log(`Changements dans le bac (fichiers source) : ${aRecopier.length}${conflits.length ? ` dont ${conflits.length} CONFLIT(S)` : ''}`);
  for (const x of aRecopier) console.log(`  ${x.type.padEnd(9)} ${x.rel}${x.conflit ? '   <-- CONFLIT : changé aussi dans le dépôt depuis la préparation' : ''}`);
  const identiques = changements.filter((x) => x.dejaIdentique);
  if (identiques.length) {
    console.log(`Déjà identiques dans le dépôt (rien à recopier) : ${identiques.length}`);
    for (const x of identiques) console.log(`  ${x.type.padEnd(9)} ${x.rel}`);
  }
  console.log(`Changés dans le dépôt seul depuis la préparation (repris à la prochaine préparation) : ${depotSeulement.length}`);
  for (const x of depotSeulement.slice(0, 50)) console.log(`  ${x.type.padEnd(9)} ${x.rel}`);
  if (depotSeulement.length > 50) console.log(`  … et ${depotSeulement.length - 50} autre(s)`);
  if (conflits.length) {
    console.log('Un conflit se règle à la main : reporter dans le bac ce qui a changé dans le dépôt (ou l\'inverse), jusqu\'à ce que diff ne le signale plus.');
  }
  if (aRecopier.length) console.log('Pour recopier : node server/scripts/sandbox-apply.mjs (essai, n\'écrit rien), puis --appliquer.');
}

try {
  main();
} catch (error) {
  console.error(`ÉCHEC : ${error.message}`);
  process.exit(1);
}
