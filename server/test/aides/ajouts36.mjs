/**
 * LES AJOUTS PURS DE L'ÉTAPE 36 (lot 1, 09/11/2026) aux fichiers gelés pendant l'essai de l'étape 27 — retirés, chaque fichier
 * redevient celui d'avant À L'OCTET (la règle du gel : un fichier gelé ne reçoit qu'un ajout pur, nommé). UNE seule définition,
 * pour les tests de la 36 (coupesFrontiere.test.mjs, T-X1 et T-X10) et pour ceux des étapes d'avant qui comparent ces
 * fichiers à leur partie 0 (32, 33, 34, 38, 39). Chaque retrait ne se fait que s'il trouve EXACTEMENT son ajout : sinon le
 * texte reste tel quel et la comparaison à l'octet tombe d'elle-même (un ajout déplacé, élargi ou retouché ne passe pas).
 *
 *   jobs/matchStatsAutoRefresh.js        les deux blocs « [étape 36, lot 1 : ajout pur, début] … [fin] » (lignes entières) ;
 *   data/providers/settlementService.js  le mot « export » devant quoiDeLaProlongation (la règle du format, importée par
 *                                        data/coupes/confrontations.js, jamais recopiée) ;
 *   data/db/matchStatsDb.js              COUPES_DDL (son commentaire compris, juste avant FD_HISTORY_INDEXES) et la ligne
 *                                        `...COUPES_DDL,` après `...COMBINAISON_DDL,` ;
 *   bench/lancements.js                  « coupes » à la fin de PORTEES et ses deux lignes de commentaire, VUES_DE_L_ETAPE_36
 *                                        et VARIANTES_DE_L_ETAPE_36 (juste avant LANCEMENTS), le lancement 36 (le dernier).
 */

/** Les fichiers gelés que la 36 retouche par ajout pur. */
export const FICHIERS_AJOUTS_36 = Object.freeze(['bench/lancements.js', 'data/db/matchStatsDb.js', 'jobs/matchStatsAutoRefresh.js', 'data/providers/settlementService.js']);

const DEBUT = /\[étape 36, lot 1 : ajout pur, début\]/;
const FIN = /\[étape 36, lot 1 : ajout pur, fin\]/;

/** Les blocs « [étape 36, lot 1 : ajout pur] » retirés, lignes des marques comprises. */
export function sansBlocs36(texte) {
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

/** Un fichier gelé (chemin relatif à server/src/, « / ») SANS les ajouts de l'étape 36 : le texte d'avant, refait. */
export function sansLesAjoutsDe36(f, texte) {
  if (f === 'jobs/matchStatsAutoRefresh.js') return sansBlocs36(texte);
  if (f === 'data/providers/settlementService.js') return uneFois(texte, '\nexport function quoiDeLaProlongation(', '\nfunction quoiDeLaProlongation(');
  if (f === 'data/db/matchStatsDb.js') {
    const t = sansIntervalle(texte, '/**\n * Étape 36 (lot 1, 09/11/2026 ; ajout PUR, règle du gel)', 'const FD_HISTORY_INDEXES = [');
    return uneFois(t, '  ...COMBINAISON_DDL,\n  ...COUPES_DDL,\n', '  ...COMBINAISON_DDL,\n');
  }
  if (f === 'bench/lancements.js') {
    let t = uneFois(texte, '// Étape 36 (lot 1, 09/11/2026) : « coupes » — l’appariement des confrontations, la chance de qualification à blanc et sa\n// calibration rapportée (data/coupes/) ; jamais lus par le moteur.\n', '');
    t = uneFois(t, ", 'combinaison', 'coupes']);", ", 'combinaison']);");
    t = sansIntervalle(t, "/**\n * Les fenêtres REGARDÉES par l'étape 36", "/**\n * Les lancements déclarés par les étapes");
    return sansIntervalle(t, '  }),\n  // Étape 36 (lot 1, 09/11/2026) : les coupes et les matchs à part', '\n]);', '  })');
  }
  return texte;
}

/** Les octets d'un fichier gelé sans les ajouts de la 36 (les autres fichiers : tels quels). */
export const octetsSansLesAjoutsDe36 = (f, octets) => (FICHIERS_AJOUTS_36.includes(f) ? Buffer.from(sansLesAjoutsDe36(f, Buffer.isBuffer(octets) ? octets.toString('utf8') : String(octets)), 'utf8') : octets);
