/**
 * LES AJOUTS PURS DE L'ÉTAPE 39 (lot 1b, 09/11/2026) aux fichiers gelés pendant l'essai de l'étape 27 — retirés, chaque fichier
 * redevient celui d'avant À L'OCTET (la règle du gel : un fichier gelé ne reçoit qu'un ajout pur, nommé). UNE seule définition,
 * pour les tests de la 39 (miseFrontiere.test.mjs, T-X5 et T-X12) et pour ceux des étapes d'avant qui comparent ces fichiers
 * à leur partie 0 (32, 33, 34, 35, 36, 38 : appliquée AVANT celle de la 35, puis celle de la 36). Chaque retrait ne se fait
 * que s'il trouve EXACTEMENT son ajout : sinon le texte reste tel quel et la comparaison à l'octet tombe d'elle-même.
 *
 *   bench/lancements.js   « mise » à la fin de PORTEES et ses deux lignes de commentaire, VUES_DE_L_ETAPE_39 et
 *                         VARIANTES_DE_L_ETAPE_39 (juste avant LANCEMENTS), le lancement 39 (le dernier).
 */

/** Les fichiers gelés que la 39 retouche par ajout pur (lot 1b). */
export const FICHIERS_AJOUTS_39 = Object.freeze(['bench/lancements.js']);

/** `avant` remplacé par `apres` seulement s'il est trouvé exactement une fois. */
const uneFois = (texte, avant, apres) => (texte.split(avant).length === 2 ? texte.replace(avant, () => apres) : texte);

/** Le texte de l'intervalle [debut, fin[ retiré, seulement si les deux repères sont trouvés une fois et dans l'ordre. */
function sansIntervalle(texte, debut, fin, remplacement = '') {
  const i = texte.indexOf(debut);
  const j = i >= 0 ? texte.indexOf(fin, i + debut.length) : -1;
  if (i < 0 || j < 0 || texte.indexOf(debut, i + 1) >= 0) return texte;
  return texte.slice(0, i) + remplacement + texte.slice(j);
}

/** Un fichier gelé (chemin relatif à server/src/, « / ») SANS les ajouts de l'étape 39 : le texte d'avant, refait. */
export function sansLesAjoutsDe39(f, texte) {
  if (f !== 'bench/lancements.js') return texte;
  let t = uneFois(texte, '// Étape 39 (lot 1b, 09/11/2026) : « mise » — le banc de la mise (data/mise/) : la forme de 1/8 de Kelly jugée à la clôture,\n// les niveaux et les creux du capital rapportés ; jamais lus par le moteur au lot 1.\n', '');
  t = uneFois(t, ", 'debuts-de-saison', 'mise']);", ", 'debuts-de-saison']);");
  t = sansIntervalle(t, "/**\n * Les fenêtres REGARDÉES par l'étape 39", "/**\n * Les lancements déclarés par les étapes");
  return sansIntervalle(t, '  }),\n  // Étape 39 (lot 1b, 09/11/2026) : la mise juste', '\n]);', '  })');
}

/** Les octets d'un fichier gelé sans les ajouts de la 39 (les autres fichiers : tels quels). */
export const octetsSansLesAjoutsDe39 = (f, octets) => (FICHIERS_AJOUTS_39.includes(f) ? Buffer.from(sansLesAjoutsDe39(f, Buffer.isBuffer(octets) ? octets.toString('utf8') : String(octets)), 'utf8') : octets);
