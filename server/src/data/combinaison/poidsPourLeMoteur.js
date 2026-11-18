/**
 * poidsPourLeMoteur.js — DE LA NOTE DU BANC AUX POIDS DU MOTEUR (étape 38 du plan, lot 2a, 16/11/2026 ; conception § 6.1).
 * -----------------------------------------------------------------------
 * Les β de la combinaison vivent dans l'EMPREINTE du moteur (core/engine/poidsDeLaCombinaison.js), jamais dans un
 * réglage ni dans la base. Ce fichier-là n'est jamais retapé à la main : `server/scripts/etape38.mjs --recopier-moteur`
 * l'écrit avec texteDesPoids(poidsRetenus(COMBINAISON_AU_BANC)), et l'essai T-L2-2 (combinaisonLot2.test.mjs) le refait à
 * l'octet depuis la note.
 *
 * LA RÈGLE DU LOT 2a : un β n'est non nul que pour une variante « retenu » de l'angle « combinaison » qui porte un
 * poids. Le banc du 04/11/2026 n'en a retenu aucune (les cinq jugées sont « pas prouvé ») : 0 partout. Si une variante de
 * combinaison sort un jour « retenu », poidsRetenus REFUSE (PoidsARecopierAuLot2b) : un β non nul change le 1N2, c'est
 * une candidate du lot 2b (cinq familles déclarées, essai à blanc), jamais une recopie.
 * Hors de l'empreinte du moteur (data/combinaison/). Pur : ni horloge, ni hasard, ni base, ni fichier.
 * -----------------------------------------------------------------------
 */

/** Les signaux de chaque famille (les β que le combiner du moteur sait lire), dans l'ordre écrit. */
export const SIGNAUX_DE_LA_COMBINAISON = Object.freeze({
  '1n2': Object.freeze(['statistiques']),
  buts: Object.freeze(['statistiques']),
  corners: Object.freeze([]),
  tirs: Object.freeze([]),
  cadres: Object.freeze([]),
  cartons: Object.freeze([]),
  joueurs: Object.freeze([])
});

/** Les variantes du banc qui porteraient un poids, et leur famille (les autres angles — confiance, seuil — n'en portent pas). */
export const VARIANTES_A_POIDS = Object.freeze({
  '1n2-recalage-marche': '1n2',
  '1n2-stats-residuel': '1n2',
  'horloge-j2': '1n2',
  'poids-par-regime': '1n2',
  'poids-par-championnat': '1n2',
  'compo-avant-cote': '1n2',
  'plusmoins25-recalage-marche': 'buts',
  'recalage-dixiemes': 'buts',
  'ancre-gratuite': 'buts',
  'saisies-ancre': 'buts',
  'repos-court-residuel': 'buts',
  'enchainement-residuel': 'buts'
});

export class PoidsARecopierAuLot2b extends Error {
  constructor(message) {
    super(message);
    this.name = 'PoidsARecopierAuLot2b';
  }
}

/**
 * Les poids à écrire dans le moteur d'après la note du banc (COMBINAISON_AU_BANC) : { version, source, verdicts,
 * familles }. Lève sans note, ou si une variante à poids est « retenu ».
 */
export function poidsRetenus(note) {
  if (!note || !Array.isArray(note.variantes)) throw new RangeError('poidsRetenus : la note du banc de la combinaison est obligatoire (COMBINAISON_AU_BANC).');
  const verdicts = {};
  for (const [id, famille] of Object.entries(VARIANTES_A_POIDS)) {
    const v = note.variantes.find((x) => x.id === id);
    if (!v) throw new RangeError(`poidsRetenus : la variante « ${id} » manque à la note du banc.`);
    if (v.verdict === 'retenu') {
      throw new PoidsARecopierAuLot2b(`La variante « ${id} » (famille ${famille}) est « retenu » au banc : son poids n’entre pas par recopie (lot 2a), mais par une candidate du lot 2b.`);
    }
    verdicts[id] = v.verdict;
  }
  const familles = Object.fromEntries(Object.entries(SIGNAUX_DE_LA_COMBINAISON).map(([famille, signaux]) => [famille, Object.fromEntries(signaux.map((s) => [s, 0]))]));
  return {
    version: 1,
    source: { note: 'server/src/data/combinaison/noteDeLaCombinaison.js', banc: String(note.version ?? ''), calculeLe: String(note.calculeLe ?? ''), sortie: String(note.sortie?.sha1 ?? ''), regles: String(note.regles?.sha1 ?? '') },
    verdicts,
    familles
  };
}

/** Le texte EXACT de core/engine/poidsDeLaCombinaison.js pour ces poids (fins de ligne LF, une ligne finale). */
export function texteDesPoids(poids) {
  return [
    '/**',
    ' * poidsDeLaCombinaison.js — LES POIDS (β) DE LA COMBINAISON DANS LE MOTEUR (étape 38 du plan, lot 2a).',
    ' * -----------------------------------------------------------------------',
    ' * RECOPIÉ PAR SCRIPT (server/scripts/etape38.mjs --recopier-moteur, depuis la note du banc',
    ' * data/combinaison/noteDeLaCombinaison.js), jamais retapé à la main : l’essai T-L2-2 (combinaisonLot2.test.mjs) refait ce',
    ' * texte à l’octet. Un β par famille et par signal ; 0 = le marché exactement (combiner.js est alors à l’identité).',
    ' * `verdicts` : ce que le banc a dit de chaque variante qui porterait un poids (aucune n’est « retenu »).',
    ' * DANS l’empreinte du moteur : changer un poids crée une version. Pur : ne lit rien.',
    ' * -----------------------------------------------------------------------',
    ' */',
    '',
    '/** Gèle un objet et tout ce qu’il contient. */',
    'const gele = (o) => {',
    "  if (o && typeof o === 'object' && !Object.isFrozen(o)) {",
    '    Object.freeze(o);',
    '    for (const v of Object.values(o)) gele(v);',
    '  }',
    '  return o;',
    '};',
    '',
    '/** Les poids de la combinaison, par famille de marchés et par signal. */',
    `export const POIDS_DE_LA_COMBINAISON = gele(${JSON.stringify(poids)});`,
    ''
  ].join('\n');
}
