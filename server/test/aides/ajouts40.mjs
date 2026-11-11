/**
 * L'AJOUT PUR DE L'ÉTAPE 40 (lot 1, 10/11/2026) au seul fichier gelé qu'elle retouche — retiré, le fichier redevient celui
 * d'avant À L'OCTET (la règle du gel : un fichier gelé ne reçoit qu'un ajout pur, nommé) :
 *   data/roadmap/historique.js   l'entrée 40, la dernière de HISTORIQUE (la ligne `  })` de la 35 devient `  }),`, AUCUNE
 *                                ligne entre `}),` et `ligne({` : le commentaire de l'entrée est DANS l'entrée, comme à la 35).
 * Le retrait ne se fait que s'il trouve EXACTEMENT son ajout : sinon le texte reste tel quel et la comparaison à l'octet tombe
 * d'elle-même. Pour ficheDuPronosticFrontiere.test.mjs (T-G2).
 */

/** Le début de l'ajout : la fin de l'entrée 35, puis l'ouverture de l'entrée 40. */
export const DEBUT_40 = "  }),\n  ligne({\n    etape: '40',";

/** Le texte de l'intervalle [debut, fin[ retiré, seulement si les deux repères sont trouvés une fois et dans l'ordre (copie d'ajouts35.mjs, qui ne l'exporte pas). */
function sansIntervalle(texte, debut, fin, remplacement = '') {
  const i = texte.indexOf(debut);
  const j = i >= 0 ? texte.indexOf(fin, i + debut.length) : -1;
  if (i < 0 || j < 0 || texte.indexOf(debut, i + 1) >= 0) return texte;
  return texte.slice(0, i) + remplacement + texte.slice(j);
}

/** historique.js SANS l'entrée 40 : le texte d'avant l'étape, refait. */
export const sansLEntree40 = (texte) => sansIntervalle(texte, DEBUT_40, '\n]);', '  })');
