/**
 * resultPrediction.js — pronostic du résultat d'un match (1N2).
 * -----------------------------------------------------------------------
 * Ce qui prédit le mieux le résultat d'un match, mesuré le 23/09/2026 sur
 * 13 052 matchs joués de juillet 2025 à septembre 2026 dans 33 championnats
 * (apprentissage sur 2024-25, jamais sur les matchs de vérification) :
 *
 *   - les COTES du marché, marge retirée par la méthode puissance :
 *     50,3 % de résultats justes, et des probabilités honnêtes (annoncé
 *     74,2 %, réalisé 73,9 %) ;
 *   - le modèle de buts (Poisson sur les moyennes de la saison), SANS cote :
 *     45,9 % de résultats justes, et trop sûr de lui (annoncé 74 %, réalisé
 *     59 %). Tempéré vers les fréquences moyennes de 1, N et 2 (poids 0,55
 *     appris sur 2024-25), il donne 46,4 % et des probabilités justes.
 *
 * Rien d'autre n'améliore les cotes : forme, statistiques et xG des cinq
 * derniers matchs, arbitre — +0,03 % de précision, soit rien. Le moteur
 * s'appuie donc sur les cotes quand il y en a, et sur le modèle tempéré
 * sinon, en disant toujours d'où vient son pronostic et quelle fiabilité
 * l'historique lui prête.
 * -----------------------------------------------------------------------
 */

/** Fréquences de 1, N et 2 sur 2024-25, 33 championnats, 10 762 matchs. */
export const FREQUENCES_1N2 = { home: 0.442, draw: 0.264, away: 0.294 };
/** Poids du modèle de buts face à ces fréquences, appris sur 2024-25. */
export const POIDS_MODELE_SANS_COTES = 0.55;

/**
 * Fiabilité observée sur les matchs de vérification, par tranche de
 * confiance : sur `matchs` pronostics annoncés dans la tranche, l'issue
 * annoncée s'est produite `realise` fois sur cent.
 */
export const FIABILITE = {
  cotes: [
    { de: 0, a: 0.4, matchs: 2403, annonce: 37.7, realise: 36.2 },
    { de: 0.4, a: 0.5, matchs: 4822, annonce: 44.6, realise: 44.3 },
    { de: 0.5, a: 0.6, matchs: 3046, annonce: 54.6, realise: 53.1 },
    { de: 0.6, a: 0.7, matchs: 1655, annonce: 64.4, realise: 64.1 },
    { de: 0.7, a: 0.8, matchs: 832, annonce: 74.2, realise: 73.9 },
    { de: 0.8, a: 1.01, matchs: 294, annonce: 84.3, realise: 87.8 }
  ],
  statistiques: [
    { de: 0, a: 0.4, matchs: 3028, annonce: 37.7, realise: 35.9 },
    { de: 0.4, a: 0.5, matchs: 5834, annonce: 44.7, realise: 44.5 },
    { de: 0.5, a: 0.6, matchs: 3221, annonce: 54.4, realise: 53.8 },
    { de: 0.6, a: 1.01, matchs: 969, annonce: 63.3, realise: 65.9 }
  ]
};
export const TAUX_GLOBAL = { cotes: 50.3, statistiques: 46.4 };

/** Probabilités 1N2 du modèle de buts, tempérées vers les fréquences moyennes. */
export function temperer({ home, draw, away }) {
  const w = POIDS_MODELE_SANS_COTES;
  const total = home + draw + away || 1;
  const p = {
    home: w * (home / total) + (1 - w) * FREQUENCES_1N2.home,
    draw: w * (draw / total) + (1 - w) * FREQUENCES_1N2.draw,
    away: w * (away / total) + (1 - w) * FREQUENCES_1N2.away
  };
  const s = p.home + p.draw + p.away;
  return { home: p.home / s, draw: p.draw / s, away: p.away / s };
}

/**
 * Pronostic du résultat à partir des probabilités 1N2 retenues par le moteur.
 * `source` : « cotes » ou « statistiques ».
 */
export function predictResult({ probabilities, source, homeName, awayName, bookmakersCount = null, referenceBooks = null }) {
  const issues = [
    { outcome: 'home', label: `${homeName ?? 'Domicile'} gagne`, p: probabilities.home },
    { outcome: 'draw', label: 'Match nul', p: probabilities.draw },
    { outcome: 'away', label: `${awayName ?? 'Extérieur'} gagne`, p: probabilities.away }
  ];
  const choix = issues.reduce((m, i) => (i.p > m.p ? i : m));
  const table = FIABILITE[source] ?? FIABILITE.cotes;
  const tranche = table.find((t) => choix.p >= t.de && choix.p < t.a) ?? table.at(-1);
  // Une double chance quand le résultat reste très ouvert : l'issue la plus
  // probable ne l'est qu'à moins de 45 %.
  const secondaire = issues.filter((i) => i !== choix).reduce((m, i) => (i.p > m.p ? i : m));
  const doubleChance = choix.p < 0.45
    ? {
        outcomes: [choix.outcome, secondaire.outcome],
        label: [choix.outcome, secondaire.outcome].includes('draw')
          ? `${[choix, secondaire].find((i) => i.outcome !== 'draw').label.replace(/ gagne$/, '')} ou nul`
          : 'pas de match nul',
        probability: Number((choix.p + secondaire.p).toFixed(4))
      }
    : null;

  return {
    outcome: choix.outcome,
    label: choix.label,
    confidence: Number(choix.p.toFixed(4)),
    probabilities: {
      home: Number(probabilities.home.toFixed(4)),
      draw: Number(probabilities.draw.toFixed(4)),
      away: Number(probabilities.away.toFixed(4))
    },
    source,
    bookmakersCount,
    // Bookmakers de référence qui ont fixé la probabilité, quand il y en a.
    referenceBooks,
    doubleChance,
    reliability: {
      range: [Math.round(tranche.de * 100), Math.min(100, Math.round(tranche.a * 100))],
      matches: tranche.matchs,
      announced: tranche.annonce,
      realized: tranche.realise,
      overall: TAUX_GLOBAL[source] ?? null
    }
  };
}
