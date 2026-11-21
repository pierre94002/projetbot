/**
 * LES AJOUTS DE L'ÉTAPE 46 (lot 1, partie B, 11/11/2026) à jobs/liveWatch.js (NON gelé, O6) — retirés, le fichier redevient
 * celui d'avant la 46 À L'OCTET (T-X8 de directFrontiere.test.mjs ; le sha1 est celui de la fixture « avant »,
 * fixtures/direct-boucle-avant-46.json). Ce n'est PAS un fichier de test.
 *
 * Chaque ajout est un bloc de lignes ENTIÈRES, de la ligne `// ---- étape 46 (début) …` à la ligne `// ---- étape 46 (fin) ----`
 * comprises (indentation libre). Le retrait ne se fait que si TOUS les repères vont par paires bien formées (un début, puis
 * sa fin, sans début entre les deux) : sinon le texte est rendu tel quel et la comparaison à l'octet tombe d'elle-même.
 */

/** La ligne qui ouvre un bloc, et celle qui le ferme. */
export const DEBUT_46 = /^[ \t]*\/\/ ---- étape 46 \(début\).*$/;
export const FIN_46 = /^[ \t]*\/\/ ---- étape 46 \(fin\) ----$/;

/** Les blocs de la 46 : [{ debut, fin }] en numéros de ligne (0 = la première), ou null si un repère est orphelin. */
export function blocs46(texte) {
  const lignes = texte.split('\n');
  const blocs = [];
  let ouvert = null;
  for (const [i, l] of lignes.entries()) {
    if (DEBUT_46.test(l)) {
      if (ouvert !== null) return null;
      ouvert = i;
    } else if (FIN_46.test(l)) {
      if (ouvert === null) return null;
      blocs.push({ debut: ouvert, fin: i });
      ouvert = null;
    } else if (/étape 46 \((début|fin)\)/.test(l) && /^[ \t]*\/\/ ----/.test(l)) {
      return null;
    }
  }
  return ouvert === null ? blocs : null;
}

/** Le texte SANS les blocs de la 46 (lignes entières, fins de ligne comprises) ; tel quel si un repère est orphelin. */
export function sansBlocs46(texte) {
  const blocs = blocs46(texte);
  if (!blocs || !blocs.length) return texte;
  const retirees = new Set();
  for (const b of blocs) for (let i = b.debut; i <= b.fin; i++) retirees.add(i);
  return texte
    .split('\n')
    .filter((_, i) => !retirees.has(i))
    .join('\n');
}

// ============================================================ bench/lancements.js (partie C, 12/11/2026 ; R18 point 2)
/*
 * L'AJOUT PUR DE LA 46 AU REGISTRE DE LA MESURE (bench/lancements.js, GELÉ) — LE GABARIT (ajoutsDe46 : les morceaux, pour une
 * colonne de O10 et une date), LA POSE (avecLesAjoutsDe46) et LE RETRAIT (sansLesAjoutsDe46). Posé PAR SCRIPT
 * (SCR46\ecriture\registre46\poser-registre-46.mjs, qui importe ce fichier) à la manœuvre du scellement, la date étant celle
 * de l'export (la fin de la période du banc regardée) ; jamais à la main. Retiré, le fichier redevient celui du gel À L'OCTET.
 * Les essais de frontière des étapes 32 à 39 retirent la 46 AVANT la 39 (sansLesAjoutsDe39 ne trouverait plus ses repères) :
 * ils passent avec et sans elle. Les morceaux :
 *   1. deux lignes de commentaire, après celles de la 39 (juste avant `export const PORTEES`) ;
 *   2. « direct » à la fin de PORTEES ;
 *   3. VUES_DE_L_ETAPE_46 (vuesDeLEtape46(date)) et VARIANTES_DE_L_ETAPE_46 (celles de la colonne, la retenue en tête), juste
 *      avant « Les lancements déclarés par les étapes » ;
 *   4. le lancement 46, le dernier, daté du jour de l'export (`le`), version = la variante retenue.
 */
import { COLONNES, DEBUT_DU_BANC, declarationDe, vuesDeLEtape46 } from '../../src/data/direct/declarationDuDirect.js';

/** Les fichiers gelés que la 46 retouche par ajout pur (partie C). */
export const FICHIERS_AJOUTS_46 = Object.freeze(['bench/lancements.js']);
/** La portée de la 46 au registre de la mesure. */
export const PORTEE_46 = 'direct';

const FIN_COMMENTAIRE_39 = '// les niveaux et les creux du capital rapportés ; jamais lus par le moteur au lot 1.\n';
const COMMENTAIRE_46 =
  '// Étape 46 (lot 1, 12/11/2026) : « direct » — le banc du direct (data/direct/) : les probabilités en direct rejouées\n' +
  '// créneau par créneau sur la période du banc et jugées en un ou deux regards nommés ; jamais lues par le moteur.\n';
// Correctif R3 du 13/11 après-midi (rebanc, constat 3 et décision R3 point 4) : après le verdict, une AUTRE étape peut écrire
// au registre APRÈS la 46 — une portée après « direct » dans PORTEES, ses vues juste avant « Les lancements déclarés », son
// lancement après celui de la 46. Le retrait ôte alors EXACTEMENT les morceaux de la 46 (« direct » où qu'il soit dans la
// ligne de PORTEES ; le bloc des vues et des variantes de la 46 jusqu'à la fin de VARIANTES_DE_L_ETAPE_46 ; le lancement 46
// jusqu'à sa propre fin) au lieu d'aller jusqu'au repère suivant (qui avalait les ajouts de l'autre étape) ; la pose met
// « direct » à la fin de PORTEES et le lancement 46 juste après celui de la 39, quels que soient les ajouts d'après. Le cas
// d'aujourd'hui (rien après la 46) donne les mêmes octets qu'avant ce correctif.
const LIGNE_PORTEES = /^export const PORTEES = Object\.freeze\(\[.*\]\);$/m;
const DIRECT_DANS_PORTEES = ", 'direct'";
const DEBUT_VUES_46 = "/**\n * Les fenêtres REGARDÉES par l'étape 46";
const DECLARATION_VARIANTES_46 = 'export const VARIANTES_DE_L_ETAPE_46 = Object.freeze([';
const FIN_DE_LISTE = '\n]);\n\n';
const LANCEMENTS_DECLARES = "/**\n * Les lancements déclarés par les étapes";
const FIN_ENTREE_39 = '    vues: VUES_DE_L_ETAPE_39\n  })';
const DEBUT_ENTREE_46 = '  }),\n  // Étape 46 (lot 1, 12/11/2026) : le banc du direct';
const FIN_ENTREE_46 = '    vues: VUES_DE_L_ETAPE_46\n  })';
const QUOI_46 =
  'Les probabilités en direct : la chaîne de l’étape 28 reprise à chaque minute du match (score, cartons rouges, temps restant), jugée au banc d’essai sur les matchs joués depuis le 24/09/2026, créneau par créneau, en un ou deux regards nommés ; jamais lue par le moteur.';

/** `avant` remplacé par `apres` seulement s'il est trouvé exactement une fois (sinon le texte reste tel quel). */
const uneFois46 = (texte, avant, apres) => (texte.split(avant).length === 2 ? texte.replace(avant, () => apres) : texte);
/**
 * Le bloc [debut … fin] remplacé, `fin` COMPRISE (correctif R3 : avant lui, le retrait allait jusqu'au repère SUIVANT et
 * avalait ce qu'une autre étape avait écrit après la 46), seulement si `debut` est trouvé une fois et `fin` après lui ;
 * `apres` : un repère à passer avant de chercher `fin`. Sinon le texte tel quel.
 */
function sansBloc46(texte, debut, fin, remplacement = '', apres = null) {
  const i = texte.indexOf(debut);
  if (i < 0 || texte.indexOf(debut, i + 1) >= 0) return texte;
  const k = apres === null ? i + debut.length : texte.indexOf(apres, i + debut.length);
  const j = k < 0 ? -1 : texte.indexOf(fin, k);
  if (j < 0) return texte;
  return texte.slice(0, i) + remplacement + texte.slice(j + fin.length);
}
/** « direct » retiré de la ligne de PORTEES, où qu'il y soit (une seule fois) ; sinon le texte tel quel (correctif R3). */
function porteesSansDirect(texte) {
  const m = LIGNE_PORTEES.exec(texte);
  if (!m || m[0].split(DIRECT_DANS_PORTEES).length !== 2) return texte;
  return texte.slice(0, m.index) + m[0].replace(DIRECT_DANS_PORTEES, '') + texte.slice(m.index + m[0].length);
}
/** Une chaîne entre apostrophes droites (aucune apostrophe droite ni barre oblique inverse dedans : le gabarit le vérifie). */
function cite(s) {
  if (typeof s !== 'string' || s.includes("'") || s.includes(String.fromCharCode(92))) throw new Error(`ajouts46 : texte impossible à citer tel quel (${String(s).slice(0, 60)})`);
  return `'${s}'`;
}
const virgule = (x) => String(x).replace('.', ',');

/** LE GABARIT : les morceaux de l'ajout pour une colonne de O10 et le jour de l'export (AAAA-MM-JJ, pas avant le 2026-09-24). */
export function ajoutsDe46({ colonne, date }) {
  if (!COLONNES.includes(colonne)) throw new Error(`ajouts46 : colonne inconnue (${String(colonne)}) : ${COLONNES.join(' ou ')}.`);
  const valide = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
  if (!valide || date < DEBUT_DU_BANC) throw new Error(`ajouts46 : date invalide (${String(date)}) : un jour AAAA-MM-JJ, pas avant le ${DEBUT_DU_BANC}.`);
  const d = declarationDe(colonne);
  const vues = vuesDeLEtape46(date)
    .map((v) => `  Object.freeze({\n    de: ${cite(v.de)},\n    a: ${cite(v.a)},\n    quoi: ${cite(v.quoi)},\n    pour: Object.freeze([${v.pour.map(cite).join(', ')}])\n  })`)
    .join(',\n');
  const variantes = d.variantes.map((v) => `  Object.freeze({ id: ${cite(v.id)}, quoi: ${cite(v.quoi)} })`).join(',\n');
  return {
    colonne,
    date,
    version: d.variantes[0].id,
    K: d.K,
    commentaire: COMMENTAIRE_46,
    blocs:
      "/**\n * Les fenêtres REGARDÉES par l'étape 46 (le banc du direct, lot 1 ; data/direct/), portée « direct » (déclarée DANS chaque\n" +
      " * fenêtre : ni le juge de l'essai de l'étape 27 ni les autres mesures n'en voient rien) : la période du banc (du 24/09/2026\n" +
      " * au jour de l'export), la fenêtre déjà vue de la table du temps additionnel et des buts moyens des championnats, le\n" +
      ` * constat du 11/11. Posées PAR SCRIPT (colonne « ${colonne} », export du ${date}), recopiées de vuesDeLEtape46().\n */\n` +
      `export const VUES_DE_L_ETAPE_46 = Object.freeze([\n${vues}\n]);\n\n` +
      `/**\n * Les VARIANTES de l'étape 46, colonne « ${colonne} » (declarationDuDirect.js, O10), déclarées AVANT le regard : la retenue en\n` +
      ` * tête (${d.variantes[0].id}), K = ${d.K} (z ${virgule(d.z)} ; tranches ${virgule(d.zTranches)}). Le banc relit K ici et refuse si la liste n'est pas\n` +
      ' * celle de la colonne.\n */\n' +
      `export const VARIANTES_DE_L_ETAPE_46 = Object.freeze([\n${variantes}\n]);\n\n`,
    entree:
      `${DEBUT_ENTREE_46} — les probabilités en direct (data/direct/) rejouées créneau\n` +
      `  // par créneau, colonne « ${colonne} » ; il ne règle aucun chiffre du moteur (portée 'direct'). Posé PAR SCRIPT, daté du\n` +
      "  // jour de l'export ; ses variantes et ses vues déclarées AVANT le regard.\n" +
      `  Object.freeze({\n    etape: '46',\n    version: ${cite(d.variantes[0].id)},\n    quoi: ${cite(QUOI_46)},\n    le: ${cite(date)},\n` +
      '    variantes: VARIANTES_DE_L_ETAPE_46,\n    vues: VUES_DE_L_ETAPE_46\n  })\n]);'
  };
}

/** Un fichier gelé (chemin relatif à server/src/, « / ») SANS l'ajout de la 46 : le texte d'avant, refait. */
export function sansLesAjoutsDe46(f, texte) {
  if (f !== 'bench/lancements.js') return texte;
  let t = uneFois46(texte, COMMENTAIRE_46, '');
  t = porteesSansDirect(t);
  t = sansBloc46(t, DEBUT_VUES_46, FIN_DE_LISTE, '', DECLARATION_VARIANTES_46);
  return sansBloc46(t, DEBUT_ENTREE_46, FIN_ENTREE_46, '  })');
}

/** Les octets d'un fichier gelé sans l'ajout de la 46 (les autres fichiers : tels quels). */
export const octetsSansLesAjoutsDe46 = (f, octets) => (FICHIERS_AJOUTS_46.includes(f) ? Buffer.from(sansLesAjoutsDe46(f, Buffer.isBuffer(octets) ? octets.toString('utf8') : String(octets)), 'utf8') : octets);

/** LA POSE : le texte du gel (sans la 46) → le texte avec l'ajout ; lève si un repère manque ou si le retrait ne refait pas l'avant. */
export function avecLesAjoutsDe46(texte, { colonne, date }) {
  if (sansLesAjoutsDe46('bench/lancements.js', texte) !== texte) throw new Error('ajouts46 : la 46 est déjà posée (la retirer d’abord).');
  const a = ajoutsDe46({ colonne, date });
  const une = (t, avant, apres, quoi) => {
    if (t.split(avant).length !== 2) throw new Error(`ajouts46 : repère introuvable ou double (${quoi}).`);
    return t.replace(avant, () => apres);
  };
  let t = une(texte, FIN_COMMENTAIRE_39, FIN_COMMENTAIRE_39 + a.commentaire, 'la fin du commentaire de la 39');
  const portees = LIGNE_PORTEES.exec(t);
  if (!portees || portees[0].includes("'direct'")) throw new Error('ajouts46 : repère introuvable ou double (la fin de PORTEES).');
  t = t.slice(0, portees.index) + portees[0].replace(/\]\);$/, `${DIRECT_DANS_PORTEES}]);`) + t.slice(portees.index + portees[0].length);
  t = une(t, LANCEMENTS_DECLARES, a.blocs + LANCEMENTS_DECLARES, 'les lancements déclarés');
  // Le lancement 46 juste après celui de la 39 (sa fin d'entrée, sans « ]); » : une autre étape a pu écrire après la 39).
  const entree = a.entree.endsWith('\n]);') ? a.entree.slice(0, -'\n]);'.length) : a.entree;
  t = une(t, FIN_ENTREE_39, `    vues: VUES_DE_L_ETAPE_39\n${entree}`, 'la fin du lancement 39');
  if (sansLesAjoutsDe46('bench/lancements.js', t) !== texte) throw new Error('ajouts46 : le retrait ne refait pas le texte d’avant.');
  // Une seule ligne d'avant change (celle de PORTEES) ; aucune autre ne disparaît.
  const lignes = new Set(t.split('\n'));
  const disparues = texte.split('\n').filter((l) => !lignes.has(l));
  if (disparues.length !== 1 || !disparues[0].startsWith('export const PORTEES = ')) throw new Error(`ajouts46 : des lignes d’avant ont disparu (${disparues.length}).`);
  return t;
}

/** PORTEES sans « direct » (les essais de frontière d'avant la 46 : la même liste, avec et sans l'ajout). */
export const porteesSans46 = (portees) => [...portees].filter((p) => p !== PORTEE_46);
/** LANCEMENTS sans le lancement 46 (idem). */
export const lancementsSans46 = (lancements) => [...lancements].filter((l) => l.etape !== '46');
