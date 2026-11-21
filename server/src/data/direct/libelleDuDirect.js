/**
 * libelleDuDirect.js -- LE LIBELLE DE LA MINUTE FOTMOB (etape 46 du plan, lot 1, partie A ; conception par. 2.4, critique R5, R6).
 * -----------------------------------------------------------------------
 * PUR : ni base, ni fichier, ni horloge, ni reseau. Relit `liveLabel` (status.liveTime.short) lui-meme, parce que le
 * fournisseur gele rate les libelles precedes du caractere invisible U+200E (LRM) : sa lecture est ancree au debut et
 * trim() ne l'ote pas.
 *
 * CE FICHIER EST EN ASCII SEUL (T-E1) : les caracteres invisibles, l'espace insecable, les apostrophes typographiques et
 * le e accent aigu sont FABRIQUES par String.fromCharCode, jamais tapes ni ecrits par une sequence d'echappement (piege
 * connu : les outils d'ecriture changent ces sequences en vrais caracteres).
 *
 * nettoyerLibelle(t) : retire U+200B a U+200F, U+202A a U+202E, U+2060 a U+2069, U+FEFF ; U+00A0 et U+202F deviennent
 *   une espace ; les apostrophes (U+2019, U+2032, U+02B9, U+0027) deviennent une seule apostrophe droite ; trim().
 * lireLibelle(t) -> { type, minute, ajout, texte } :
 *   minute        ^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*'?$          (34' ; 45+2' ; 90 + 3')
 *   mi-temps      HT | MT | Pause | Half-time | Mi-temps
 *   fin           FT | Full-time | Fin | Termine (e accent aigu)
 *   prolongation  ET | AET | PET | Extra-time | Prol. | Prolongation | Break   (R5 point 4 : AET est de cette classe ;
 *                 PET, la pause au milieu de la prolongation, relevee par l'etape 0 : 17 instantanes)
 *   tirs-au-but   Pen. | Pens | Penalties | TAB
 *   interrompu    Int. | IR | Interrupted | Susp. | Suspended | Delayed | Aband. | Abandoned | Canc. | Cancelled | PP |
 *                 Postponed   (IR, le match interrompu puis repris ou arrete, releve par l'etape 0 : 29 instantanes)
 *   absent        vide ou absent
 *   inconnu       tout le reste (le texte nettoye est garde tel quel pour l'ecran)
 * Le sens de la minute (arrets de jeu, prolongation) se decide dans etatDuDirect.js, croise avec la duree max (R6).
 *
 * LES LIBELLES REELS (etape 0 du 11/11 : `node scripts/etape46.mjs --libelles` sur la base du bac, 28 136 instantanes ;
 * fixture test/fixtures/direct-libelles.txt) : la minute s'ecrit chiffres, LRM, apostrophe typographique, LRM ; les
 * arrets de jeu en MINUTES PLEINES (46 a 50 en fin de premiere mi-temps, 91 a 105 en fin de match ; jamais 45+2 ni 90+3,
 * et added_time toujours null) ; HT ; ET (la pause avant la prolongation) ; PET (la pause au milieu de la prolongation) ;
 * Pen (les tirs au but) ; IR (le match interrompu) ; 90 sans apostrophe (fin du temps reglementaire).
 * -----------------------------------------------------------------------
 */

const C = (n) => String.fromCharCode(n);

const INVISIBLES = new RegExp('[' + C(0x200b) + '-' + C(0x200f) + C(0x202a) + '-' + C(0x202e) + C(0x2060) + '-' + C(0x2069) + C(0xfeff) + ']', 'g');
const ESPACES = new RegExp('[' + C(0x00a0) + C(0x202f) + ']', 'g');
const APOSTROPHES = new RegExp('[' + C(0x2019) + C(0x2032) + C(0x02b9) + C(0x0027) + ']+', 'g');

/** Le libelle nettoye (chaine, eventuellement vide). */
export function nettoyerLibelle(t) {
  if (t === null || t === undefined) return '';
  return String(t).replace(INVISIBLES, '').replace(ESPACES, ' ').replace(APOSTROPHES, C(0x0027)).trim();
}

const MINUTE = /^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*'?$/;
/** Les classes, dans l'ordre de lecture (insensibles a la casse). */
const CLASSES = Object.freeze([
  ['mi-temps', /^(HT|MT|Pause|Half[\s-]?time|Mi-temps)$/i],
  ['fin', new RegExp('^(FT|Full[\\s-]?time|Fin|Termin' + C(0x00e9) + ')$', 'i')],
  ['prolongation', /^(ET|AET|PET|Extra[\s-]?time|Prol\.?|Prolongation|Break)$/i],
  ['tirs-au-but', /^(Pen\.?|Pens?|Penalties|TAB)$/i],
  ['interrompu', /^(Int\.?|IR|Interrupted|Susp\.?|Suspended|Delayed|Aband\.?|Abandoned|Canc\.?|Cancelled|PP|Postponed)$/i]
]);

/** Les types qu'un libelle peut prendre (les tests et l'ecran les nomment). */
export const TYPES_DE_LIBELLE = Object.freeze(['minute', 'mi-temps', 'fin', 'prolongation', 'tirs-au-but', 'interrompu', 'absent', 'inconnu']);

/**
 * La lecture d'un libelle (nettoye ici s'il ne l'est pas : le nettoyage est idempotent).
 * Rend { type, minute, ajout, texte } : minute et ajout sont des entiers ou null ; texte = le libelle nettoye (ou null).
 */
export function lireLibelle(t) {
  const texte = nettoyerLibelle(t);
  if (!texte) return { type: 'absent', minute: null, ajout: null, texte: null };
  const m = texte.match(MINUTE);
  if (m) return { type: 'minute', minute: Number(m[1]), ajout: m[2] !== undefined ? Number(m[2]) : null, texte };
  for (const [type, motif] of CLASSES) if (motif.test(texte)) return { type, minute: null, ajout: null, texte };
  return { type: 'inconnu', minute: null, ajout: null, texte };
}

/** Le PATRON d'un libelle (l'etape 0, R6) : le libelle nettoye, chaque chiffre remplace par 9. */
export function patronDuLibelle(t) {
  return nettoyerLibelle(t).replace(/[0-9]/g, '9');
}

/** AET (apres prolongation) : un libelle de prolongation qui dit que la prolongation a ete JOUEE (R5). */
export function estApresProlongation(t) {
  return /^AET$/i.test(nettoyerLibelle(t));
}
