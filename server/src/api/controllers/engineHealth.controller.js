/**
 * engineHealth.controller.js — « SANTÉ DU MOTEUR » vue de l'interface (étape 24 du plan, 14/10/2026).
 * -----------------------------------------------------------------------
 * GET /api/engine-health   LECTURE SEULE : les trois feux (données, sauvegardes, budget Claude) et les blocs de la
 *     page — la note du moteur face au marché et son évolution, ce qu'il annonçait face à ce qui est arrivé, la
 *     valeur de clôture, la liste « à vérifier », la version du moteur / l'essai d'une candidate / la dérive, et
 *     la place des corrections de l'étape 26. Chaque bloc donne sa source, l'heure de sa mesure, un résumé court
 *     et le lien vers sa vraie place.
 *
 *     Le contrôleur ASSEMBLE des lectures déjà faites (src/data/santeDuMoteur.js) : il ne calcule rien. Le bilan
 *     du mois en cours est préparé par l'actualisation de la nuit ; s'il ne l'est pas encore, le bloc le dit
 *     (« pas encore mesuré »), il ne le calcule pas. Une lecture qui échoue donne un bloc « illisible » ; les
 *     autres blocs, et la page, restent là : la route répond toujours 200.
 * -----------------------------------------------------------------------
 */

import { assemblerLaSante } from '../../data/santeDuMoteur.js';

export function getEngineHealth(req, res) {
  res.json(assemblerLaSante());
}
