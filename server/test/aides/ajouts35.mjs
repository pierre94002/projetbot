/**
 * LES AJOUTS PURS DE L'ÉTAPE 35 (lot 1a, 09/11/2026 ; lot 1b, 10/11/2026) aux fichiers gelés pendant l'essai de l'étape 27 —
 * retirés, chaque fichier redevient celui d'avant À L'OCTET (la règle du gel : un fichier gelé ne reçoit qu'un ajout pur,
 * nommé). UNE seule définition, pour les tests de la 35 (debutsFrontiere.test.mjs, T-X1 et T-X10) et pour ceux des étapes
 * d'avant qui comparent ces fichiers à leur partie 0 (32, 33, 34, 36, 38, 39 : appliquée AVANT celle de la 36). Chaque retrait
 * ne se fait que s'il trouve EXACTEMENT son ajout : sinon le texte reste tel quel et la comparaison à l'octet tombe d'elle-même.
 *
 * Lot 1a :
 *   bench/lancements.js       « debuts-de-saison » à la fin de PORTEES et ses trois lignes de commentaire, VUES_DE_L_ETAPE_35
 *                             et VARIANTES_DE_L_ETAPE_35 (juste avant LANCEMENTS), le lancement 35 (le dernier) ;
 *   data/db/matchStatsDb.js   DEBUTS_DDL (son commentaire compris, juste avant FD_HISTORY_INDEXES) et la ligne
 *                             `...DEBUTS_DDL,` après `...COUPES_DDL,`.
 * Lot 1b :
 *   jobs/matchStatsAutoRefresh.js           les deux blocs « [étape 35, lot 1b : ajout pur, début] … [fin] » (lignes entières) ;
 *   api/controllers/analysis.controller.js  le bloc `debutsDeSaison` APRÈS l'analyse (deux lignes de commentaire et sa ligne),
 *                                           `...(debutsDeSaison ? { debutsDeSaison } : {})` à la fin de la réponse, et la
 *                                           fonction debutsDeSaisonDuMatchAnalyse (son commentaire compris, juste avant
 *                                           celui de l'étape 38) ;
 *   data/roadmap/historique.js              l'entrée 35, la dernière de HISTORIQUE.
 */

/** Les fichiers gelés que la 35 retouche par ajout pur (les deux du lot 1a, puis les trois du lot 1b). */
export const FICHIERS_AJOUTS_35 = Object.freeze(['bench/lancements.js', 'data/db/matchStatsDb.js', 'jobs/matchStatsAutoRefresh.js', 'api/controllers/analysis.controller.js', 'data/roadmap/historique.js']);

const DEBUT = /\[étape 35, lot 1b : ajout pur, début\]/;
const FIN = /\[étape 35, lot 1b : ajout pur, fin\]/;

/** Les blocs « [étape 35, lot 1b : ajout pur] » retirés, lignes des marques comprises (l'actualisation). */
export function sansBlocs35(texte) {
  const garde = [];
  let dans = false;
  for (const l of texte.split('\n')) {
    if (DEBUT.test(l)) {
      dans = true;
      continue;
    }
    if (FIN.test(l)) {
      dans = false;
      continue;
    }
    if (!dans) garde.push(l);
  }
  return garde.join('\n');
}

/** `avant` remplacé par `apres` seulement s'il est trouvé exactement une fois. */
const uneFois = (texte, avant, apres) => (texte.split(avant).length === 2 ? texte.replace(avant, () => apres) : texte);

/** Le texte de l'intervalle [debut, fin[ retiré, seulement si les deux repères sont trouvés une fois et dans l'ordre. */
function sansIntervalle(texte, debut, fin, remplacement = '') {
  const i = texte.indexOf(debut);
  const j = i >= 0 ? texte.indexOf(fin, i + debut.length) : -1;
  if (i < 0 || j < 0 || texte.indexOf(debut, i + 1) >= 0) return texte;
  return texte.slice(0, i) + remplacement + texte.slice(j);
}

/** Un fichier gelé (chemin relatif à server/src/, « / ») SANS les ajouts de l'étape 35 : le texte d'avant, refait. */
export function sansLesAjoutsDe35(f, texte) {
  if (f === 'data/db/matchStatsDb.js') {
    const t = sansIntervalle(texte, "/**\n * Étape 35 (lot 1a, 09/11/2026 ; ajout PUR, règle du gel)", 'const FD_HISTORY_INDEXES = [');
    return uneFois(t, '  ...COUPES_DDL,\n  ...DEBUTS_DDL,\n', '  ...COUPES_DDL,\n');
  }
  if (f === 'bench/lancements.js') {
    let t = uneFois(texte, '// Étape 35 (lot 1a, 09/11/2026) : « debuts-de-saison » — les débuts de saison et les changements d’effectif (rangs, statuts,\n// oubli à la trêve, centres des promus et des nouveaux venus, force de l’effectif) mesurés à blanc (data/debutsDeSaison/) ;\n// jamais lus par le moteur au lot 1 (la candidate du lot 2 recopierait ces vues avec `pour: [\'moteur\']`).\n', '');
    t = uneFois(t, ", 'coupes', 'debuts-de-saison']);", ", 'coupes']);");
    t = sansIntervalle(t, "/**\n * Les fenêtres REGARDÉES par l'étape 35", "/**\n * Les lancements déclarés par les étapes");
    return sansIntervalle(t, '  }),\n  // Étape 35 (lot 1a, 09/11/2026) : les débuts de saison', '\n]);', '  })');
  }
  if (f === 'jobs/matchStatsAutoRefresh.js') return sansBlocs35(texte);
  if (f === 'api/controllers/analysis.controller.js') {
    let t = uneFois(texte, "  // Étape 35 : le début de saison (rangs, statuts, nouveaux venus à blanc, arrivées et départs), APRÈS l’analyse lui aussi\n  // (le verdict n’en sait rien, l’IA ne le reçoit jamais) ; lu par clé, jamais calculé dans la requête.\n  const debutsDeSaison = sportId === 'football' ? await debutsDeSaisonDuMatchAnalyse(avecFraicheur) : null;\n", '');
    t = uneFois(t, ', ...(coupe ? { coupe } : {}), ...(debutsDeSaison ? { debutsDeSaison } : {}) };', ', ...(coupe ? { coupe } : {}) };');
    return sansIntervalle(t, '/**\n * Étape 35 du plan (lot 1b) : le début de saison de ce match', '/**\n * Étape 38 du plan (lot 1b)');
  }
  if (f === 'data/roadmap/historique.js') return sansIntervalle(texte, "  }),\n  ligne({\n    etape: '35',", '\n]);', '  })');
  return texte;
}

/** Les octets d'un fichier gelé sans les ajouts de la 35 (les autres fichiers : tels quels). */
export const octetsSansLesAjoutsDe35 = (f, octets) => (FICHIERS_AJOUTS_35.includes(f) ? Buffer.from(sansLesAjoutsDe35(f, Buffer.isBuffer(octets) ? octets.toString('utf8') : String(octets)), 'utf8') : octets);
