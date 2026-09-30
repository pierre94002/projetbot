#!/usr/bin/env node
/**
 * import-odds-history.mjs
 * -----------------------------------------------------------------------
 * Cotes d'avant-match des rencontres passées (football-data.co.uk),
 * rattachées aux rencontres FotMob du magasin, pour le profilage de cotes.
 * Voir src/data/providers/footballDataOdds.js pour la méthode.
 *
 *   node scripts/import-odds-history.mjs                  # à blanc : télécharge et rattache, n'écrit rien
 *   node scripts/import-odds-history.mjs --apply          # écrit dans la table match_odds
 *   node scripts/import-odds-history.mjs --code NOR --code E0
 *   node scripts/import-odds-history.mjs --season 2627 --apply
 *
 * Le résumé JSON part sur stdout, le détail par championnat sur stderr.
 * -----------------------------------------------------------------------
 */

import { importOddsHistory } from '../src/data/providers/footballDataOdds.js';

const argv = process.argv.slice(2);
const valeurs = (option) => argv.reduce((acc, a, i) => (a === option && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);
const codes = valeurs('--code');
const saisons = valeurs('--season');
const apply = argv.includes('--apply');

const resultat = await importOddsHistory({
  codes: codes.length ? codes : null,
  saisons: saisons.length ? saisons : null,
  apply,
  log: (b) => {
    const perdus = b.nomsNonTraduits.length ? ` ; noms non traduits : ${b.nomsNonTraduits.join(', ')}` : '';
    const absents = b.fichiersAbsents ? ` ; ${b.fichiersAbsents} fichier(s) absent(s)` : '';
    console.error(`${b.code.padEnd(4)} ${b.league.padEnd(32)} ${String(b.rattachees).padStart(5)} / ${String(b.lignes).padStart(5)} rattachées, ${b.sansRencontre} sans rencontre, ${b.scoreDifferent} score différent${absents}${perdus}`);
  }
});

console.error(`\n${resultat.linked} cote(s) rattachée(s) sur ${resultat.rows} ligne(s), ${resultat.leagues} championnat(s)${apply ? ', enregistrées.' : " — à blanc, rien n'est écrit (--apply pour enregistrer)."}`);
console.log(JSON.stringify({ ...resultat, details: resultat.details.map(({ nomsNonTraduits, ...reste }) => ({ ...reste, untranslated: nomsNonTraduits.length })) }));
