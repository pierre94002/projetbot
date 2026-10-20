/**
 * « Rien d'utile perdu » (étape 41) — ce n'est PAS un fichier de test.
 *
 * Parcourt CHAQUE valeur de l'ancien message envoyé à l'IA (le JSON d'avant
 * l'étape 41 : moteur, contexte, expérience ; ou, pour la revue, analyse
 * d'avant-match, moteur, résultat, issues, faits) et la cherche dans la fiche
 * compacte : un texte tel quel (espaces près), un nombre écrit à la française
 * (`nombre` de compactContext.js), un vrai/faux en « oui »/« non ». Les seuls
 * chemins dispensés sont ceux que compactContext.js déclare non recopiés
 * (NON_RECOPIES, NON_RECOPIES_REVUE), chacun avec sa raison. Fonctions pures.
 */

/** Les feuilles d'une valeur : [{ chemin: ['moteur', 'marketPredictions', 0, 'market'], valeur }]. */
export function feuilles(valeur, chemin = []) {
  if (valeur === null || valeur === undefined || valeur === '') return [];
  if (Array.isArray(valeur)) return valeur.flatMap((v, i) => feuilles(v, [...chemin, i]));
  if (typeof valeur === 'object') return Object.entries(valeur).flatMap(([k, v]) => feuilles(v, [...chemin, k]));
  return [{ chemin, valeur }];
}

/** Le chemin en motif : les indices deviennent « * » (« moteur.marketPredictions.*.market »). */
export const motifDe = (chemin) => chemin.map((c) => (typeof c === 'number' ? '*' : c)).join('.');

/**
 * Un chemin est-il dispensé ? Les clés de `dispenses` peuvent contenir « * »
 * (n'importe quel indice ou clé) et dispensent aussi tout ce qui est dessous
 * (« moteur.marketPredictions.*.params » couvre « ….params.side »).
 */
export function dispense(chemin, dispenses) {
  const segments = chemin.map(String);
  return Object.keys(dispenses).some((cle) => {
    const motif = cle.split('.');
    return motif.length <= segments.length && motif.every((m, i) => m === '*' || m === segments[i]);
  });
}

const normaliser = (t) => String(t).replace(/\s+/g, ' ').trim();

/**
 * Les valeurs de `ancien` ({ racine: valeur }) introuvables dans `fiche`.
 * `nombre` : la mise en forme des nombres de la fiche.
 * @returns {Array<{ chemin: string, valeur: any }>}
 */
export function valeursManquantes(ancien, fiche, { dispenses = {}, nombre }) {
  const texte = normaliser(fiche);
  const manquantes = [];
  for (const [racine, valeur] of Object.entries(ancien)) {
    for (const f of feuilles(valeur, [racine])) {
      if (dispense(f.chemin, dispenses)) continue;
      let attendu;
      if (typeof f.valeur === 'number') attendu = [nombre(f.valeur), String(f.valeur)];
      else if (typeof f.valeur === 'boolean') attendu = [f.valeur ? 'oui' : 'non'];
      else attendu = [normaliser(f.valeur)];
      if (!attendu.some((a) => texte.includes(a))) manquantes.push({ chemin: f.chemin.join('.'), valeur: f.valeur });
    }
  }
  return manquantes;
}
