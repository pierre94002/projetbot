/**
 * bilanApresMatch.js — les règles d'affichage du BILAN D'APRÈS-MATCH de la page d'un match joué (étape 45 du plan, 24/10/2026 ;
 * MatchAiReviewPanel.vue, l'onglet « Analyse IA »). Règles PURES (ni Vue, ni service, ni horloge), pour que le composant n'ait qu'à les
 * afficher et qu'un test les rejoue sans navigateur.
 *
 * Deux choses seulement, les deux nouvelles de l'étape :
 *   1. les FAMILLES de marchés — « Le match », « Buts », « Corners », « Tirs », « Tirs cadrés », puis « Autres marchés » —, les MÊMES que
 *      l'onglet Analyse IA d'avant-match (MatchAiAnalysisPanel) : un test compare les deux listes, pour qu'elles ne se séparent jamais ;
 *   2. le tableau de l'EXPÉRIENCE de l'IA par type de marché (« tous les matchs ») : toujours les onze types, un type sans match le dit,
 *      avec son Σ (les comptes additionnés, le pourcentage de TOUS les cas) et son ⌀ (chaque marché qui a des cas pèse autant) — jamais une
 *      somme de pourcentages.
 * Les mots de chaque marché, de chaque verdict et de chaque leçon restent ceux du composant et de AiMarketCard.vue.
 */

/** Les familles, dans l'ordre de l'onglet Analyse IA. `ids` : les identifiants de marché du moteur qu'elles rangent. */
export const FAMILLES = Object.freeze([
  Object.freeze({ cle: 'match', titre: 'Le match', ids: Object.freeze(['result', 'resultAndTotal', 'bothTeamsScore']) }),
  Object.freeze({ cle: 'buts', titre: 'Buts', ids: Object.freeze(['totalGoals', 'teamGoals']) }),
  Object.freeze({ cle: 'corners', titre: 'Corners', ids: Object.freeze(['totalCorners', 'teamCorners']) }),
  Object.freeze({ cle: 'tirs', titre: 'Tirs', ids: Object.freeze(['totalShots', 'teamShots']) }),
  Object.freeze({ cle: 'cadres', titre: 'Tirs cadrés', ids: Object.freeze(['totalShotsOnTarget', 'teamShotsOnTarget']) })
]);

/** Le reste, rangé à part et dit. */
export const AUTRES_MARCHES = Object.freeze({ cle: 'autres', titre: 'Autres marchés' });

/**
 * Range des lignes de marché par famille (l'ordre des lignes est gardé dans chaque famille). `idDuMarche(ligne)` : l'identifiant du marché du
 * moteur (« totalCorners »…) ; une ligne qui n'en a pas, ou d'un identifiant inconnu, va dans « Autres marchés ». Les familles vides sont écartées.
 */
export function groupesDeMarches(lignes, idDuMarche = (l) => l?.source?.marketId ?? null) {
  const groupes = FAMILLES.map((f) => ({ ...f, lignes: [] }));
  const autres = { ...AUTRES_MARCHES, lignes: [] };
  for (const l of lignes ?? []) (groupes.find((f) => f.ids.includes(idDuMarche(l))) ?? autres).lignes.push(l);
  return [...groupes, autres].filter((g) => g.lignes.length);
}

/** Les onze types de marché de l'expérience, toujours tous, dans l'ordre de l'écran (les libellés du serveur, apostrophe droite comprise). */
export const TYPES_DE_MARCHE = Object.freeze([
  ['result', 'Résultat'],
  ['totalGoals', 'Total buts'],
  ['bothTeamsScore', 'Les 2 équipes marquent'],
  ['resultAndTotal', 'Résultat + Total buts'],
  ['teamGoals', "Buts d'une équipe"],
  ['totalCorners', 'Total corners'],
  ['teamCorners', "Corners d'une équipe"],
  ['totalShots', 'Total tirs'],
  ['teamShots', "Tirs d'une équipe"],
  ['totalShotsOnTarget', 'Total tirs cadrés'],
  ['teamShotsOnTarget', "Tirs cadrés d'une équipe"]
]);

const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/** « 6/9 (67 %) » ; « — » sans cas : un ratio sans cas n'est pas un zéro. */
export const ratioDit = (n, d) => (d ? `${n}/${d} (${Math.round((100 * n) / d)} %)` : '—');

/** Au survol : les avis tenus selon la confiance annoncée (« Confiance forte : 3/4 · Confiance moyenne : 1/2 »), ou null. */
export function parConfianceDit(t) {
  return (
    ['forte', 'moyenne', 'faible']
      .filter((c) => t?.byConfidence?.[c]?.verdicts)
      .map((c) => `Confiance ${c} : ${t.byConfidence[c].right}/${t.byConfidence[c].verdicts}`)
      .join(' · ') || null
  );
}

/**
 * Le tableau de l'expérience de l'IA : une ligne par type (toujours les onze), puis Σ et ⌀.
 *   - ligne : { cle, libelle, matchs, moteur (« 6/9 (67 %) » ou « — »), ia, parConfiance, vide } — `vide` : aucun match réglé de ce type ;
 *   - total : les comptes de TOUS les types additionnés, et le ratio de ces comptes (jamais une somme de pourcentages) ;
 *   - moyenne : la moyenne des pourcentages des types qui ont des cas (chacun pèse autant), « — » sans type à moyenner.
 * `experience` : la liste de GET /api/match-ai-analysis/fixture (aiMarketExperience), ou rien.
 */
export function tableauDeLExperience(experience) {
  const parType = new Map((experience ?? []).map((t) => [t.marketType, t]));
  const lignes = TYPES_DE_MARCHE.map(([marketType, label]) => {
    const t = parType.get(marketType) ?? { marketType, label, matches: 0, engineRight: 0, aiVerdicts: 0, aiRight: 0, byConfidence: {} };
    return {
      cle: marketType,
      libelle: t.label ?? label,
      matchs: t.matches ?? 0,
      moteurJuste: t.engineRight ?? 0,
      avisComptes: t.aiVerdicts ?? 0,
      avisTenus: t.aiRight ?? 0,
      moteur: ratioDit(t.engineRight ?? 0, t.matches ?? 0),
      ia: ratioDit(t.aiRight ?? 0, t.aiVerdicts ?? 0),
      parConfiance: parConfianceDit(t),
      vide: !(t.matches > 0) && !(t.aiVerdicts > 0)
    };
  });
  const somme = (champ) => lignes.reduce((n, l) => n + (fini(l[champ]) ? l[champ] : 0), 0);
  const matchs = somme('matchs');
  const moteurJuste = somme('moteurJuste');
  const avisComptes = somme('avisComptes');
  const avisTenus = somme('avisTenus');
  const moyenneDe = (listes, tauxDe) => {
    const taux = listes.map(tauxDe).filter(fini);
    return taux.length ? `${Math.round(taux.reduce((a, x) => a + x, 0) / taux.length)} %` : '—';
  };
  const avecMatchs = lignes.filter((l) => l.matchs > 0);
  const avecAvis = lignes.filter((l) => l.avisComptes > 0);
  return {
    lignes,
    total: { matchs, moteurJuste, avisComptes, avisTenus, moteur: ratioDit(moteurJuste, matchs), ia: ratioDit(avisTenus, avisComptes) },
    moyenne: {
      marchesMoteur: avecMatchs.length,
      marchesIA: avecAvis.length,
      moteur: moyenneDe(avecMatchs, (l) => (100 * l.moteurJuste) / l.matchs),
      ia: moyenneDe(avecAvis, (l) => (100 * l.avisTenus) / l.avisComptes)
    }
  };
}

/** D'où vient l'expérience : le vrai fournisseur et la règle (la cote minimale), sans libellé vague. */
export const PROVENANCE_DE_L_EXPERIENCE = Object.freeze({
  source: 'Analyses de l’IA enregistrées sur ce PC · bilans d’après-match',
  fichier: 'data/runtime/match-ai-analyses.json',
  action: 'relu',
  detail: 'Tous les matchs réglés depuis le 30/09, pronostics à la cote minimale de 1,20 ; recomptée à l’ouverture de la page à partir des analyses enregistrées, sans appeler Claude.'
});

/** Le lien vers la fiabilité de l'IA par championnat (la page « Bulletin »). */
export const LIEN_VERS_LA_FIABILITE = Object.freeze({ to: '/bulletin', texte: 'La fiabilité de l’IA championnat par championnat est dans la page Bulletin' });
