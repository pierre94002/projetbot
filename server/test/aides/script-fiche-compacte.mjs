/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-fiche-compacte.mjs <serveur de la copie>
 *
 * Étape 41 — LA CHAÎNE COMPLÈTE avec la fiche compacte, sur la base d'essai :
 * les vraies fonctions de l'appli (contexte du magasin, composition « magasin »
 * faute de FotMob, expérience, journal des appels, enregistrement) ; seule la
 * réponse de Claude est fabriquée, en lisant la fiche qu'il reçoit (un avis par
 * marché listé, un bilan par marché joué). FotMob simulé (journées vides).
 *
 *  1. Deux avant-match en fiche compacte (forme normale) : coup d'envoi et
 *     d'avance, deux matchs différents → mêmes consignes, mot pour mot.
 *  2. Un avant-match en ANCIENNE forme (paramètre `fiche`) → consignes avec le
 *     nom des équipes, message JSON, comme avant.
 *  3. Un avant-match dont Claude altère les libellés (tirets, accents,
 *     numéros), mélange l'ordre et oublie un marché → chaque avis rendu
 *     rattaché à SON marché, aucun en double.
 *  4. Les revues d'après-match (fiche compacte, puis ancienne forme).
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import { importeur, lireFichierJournal } from './claudeSimule.mjs';
import { installerFauxFetch, listeDuJour } from './fotmobSimule.mjs';

const [serveur] = process.argv.slice(2);
const imp = importeur(serveur);
const { env } = await imp('config/env.js');
if (env.claudeCode.oauthToken) throw new Error('Un jeton Claude est présent : refus.');
if (env.claudeCode.bin && fs.existsSync(env.claudeCode.bin)) throw new Error('L’exécutable Claude configuré existe : refus.');
const cc = await imp('core/ai/claudeCodeClient.js');
const service = await imp('core/ai/matchAiAnalysisService.js');
const prompt = await imp('core/ai/matchAiAnalysisPrompt.js');
const { getByMatchId } = await imp('data/repositories/matchAiAnalysisRepository.js');

const JOUR = '2026-10-05';
installerFauxFetch({ listes: Object.fromEntries(['20261004', '20261005', '20261006', '20261007'].map((j) => [j, listeDuJour([])])) });

/** Un résultat de moteur à la forme de analyzeMatch : 15 pronostics à cote juste ≥ 1,20, et un sous le plancher. */
function moteur(home, away, commenceTime) {
  const p = (marketId, params, market, predictedOutcome, predictedLabel, predictedOdds) => ({ marketId, params, market, predictedOutcome, predictedLabel, predictedOdds, minOdds: 1.2 });
  return {
    label: `${home} vs ${away}`,
    commenceTime,
    expectedGoals: { home: 1.62, away: 0.94, source: 'fotmob' },
    trueOdds: { home: 1.9, draw: 3.6, away: 4.4 },
    market: { odds1: 1.95, oddsDraw: 3.5, odds2: 4.1 },
    edgePercent: 2.6,
    staking: { action: 'PASS', stake: null, reason: 'pas_de_value', candidates: [], limits: { edgeThresholdMin: 0.02, edgeThresholdMax: 0.25, maxValueOdds: 5 } },
    statExpectations: { corners: { home: 5.9, away: 3.8, total: 9.7 }, shots: { home: 15.2, away: 9.9, total: 25.1 }, shotsOnTarget: { home: 5.3, away: 3.2, total: 8.5 } },
    marketPredictions: [
      p('result', { outcome: 'home' }, 'Résultat', 'home', `${home} gagne`, 1.9),
      p('totalGoals', { line: 2.5, side: 'over' }, 'Total buts', 'over', 'Plus de 2.5 buts', 1.83),
      p('bothTeamsScore', { outcome: 'yes' }, 'Les 2 équipes marquent', 'yes', 'Oui', 1.74),
      p('resultAndTotal', { line: 3.5, key: 'homeUnder' }, 'Résultat + Total buts', 'homeUnder', `${home} & Moins de 3.5 buts`, 2.6),
      p('teamGoals', { team: 'home', line: 0.5, side: 'over' }, `Buts — ${home}`, 'over', `${home} — Plus de 0.5 buts`, 1.24),
      p('teamGoals', { team: 'away', line: 1.5, side: 'under' }, `Buts — ${away}`, 'under', `${away} — Moins de 1.5 buts`, 1.33),
      p('totalCorners', { line: 7.5, side: 'over' }, 'Total corners', 'over', 'Plus de 7.5 corners', 1.36),
      p('totalCorners', { line: 3.5, side: 'over' }, 'Total corners (ligne basse)', 'over', 'Plus de 3.5 corners', 1.06),
      p('teamCorners', { team: 'home', line: 3.5, side: 'over' }, `Corners — ${home}`, 'over', `${home} — Plus de 3.5 corners`, 1.29),
      p('teamCorners', { team: 'away', line: 2.5, side: 'over' }, `Corners — ${away}`, 'over', `${away} — Plus de 2.5 corners`, 1.41),
      p('totalShots', { line: 21.5, side: 'over' }, 'Total tirs', 'over', 'Plus de 21.5 tirs', 1.31),
      p('teamShots', { team: 'home', line: 12.5, side: 'over' }, `Tirs — ${home}`, 'over', `${home} — Plus de 12.5 tirs`, 1.34),
      p('teamShots', { team: 'away', line: 13.5, side: 'under' }, `Tirs — ${away}`, 'under', `${away} — Moins de 13.5 tirs`, 1.27),
      p('totalShotsOnTarget', { line: 6.5, side: 'over' }, 'Total tirs cadrés', 'over', 'Plus de 6.5 tirs cadrés', 1.39),
      p('teamShotsOnTarget', { team: 'home', line: 3.5, side: 'over' }, `Tirs cadrés — ${home}`, 'over', `${home} — Plus de 3.5 tirs cadrés`, 1.37),
      p('teamShotsOnTarget', { team: 'away', line: 4.5, side: 'under' }, `Tirs cadrés — ${away}`, 'under', `${away} — Moins de 4.5 tirs cadrés`, 1.3)
    ]
  };
}

// ------------------------------------------------- Claude simulé, qui lit la fiche
const entre = (texte, debut, fin) => {
  const i = texte.indexOf(debut);
  if (i === -1) return null;
  const j = fin ? texte.indexOf(fin, i + debut.length) : -1;
  return texte.slice(i + debut.length, j === -1 ? undefined : j);
};
/** Les lignes d'un tableau de la fiche compacte (colonnes « | »), sous son titre et sa ligne d'en-tête. */
function lignesDuTableau(texte, titre) {
  const lignes = texte.split('\n');
  const i = lignes.findIndex((l) => l.startsWith(titre));
  const sortie = [];
  for (let k = i + 2; i !== -1 && k < lignes.length && lignes[k].trim() && !lignes[k].startsWith('#'); k++) {
    if (lignes[k].startsWith('  ') || !lignes[k].includes(' | ')) continue;
    const [market, pick] = lignes[k].split(' | ');
    sortie.push({ market, pick });
  }
  return sortie;
}
const appels = [];
let variante = 'exacte';
const ALTERER = (v, i) => ({
  ...v,
  // Un autre tiret, sans accents, en majuscules, un numéro de ligne : comme l'IA le fait parfois.
  market: i % 4 === 0 ? v.market.replace('—', '-') : i % 4 === 1 ? v.market.normalize('NFD').replace(/[̀-ͯ]/g, '') : i % 4 === 2 ? `${i + 1}. ${v.market}` : v.market.toUpperCase()
});
cc.__testing.simulerClaude(async ({ args, userMessage }) => {
  const arg = (nom) => args[args.indexOf(nom) + 1];
  const schema = JSON.parse(arg('--json-schema'));
  const avantMatch = Boolean(schema.properties?.marketViews);
  const compacte = userMessage.startsWith('#');
  appels.push({ avantMatch, compacte, system: arg('--system-prompt'), schema: arg('--json-schema'), model: arg('--model'), effort: arg('--effort'), user: userMessage, variante });
  const usage = { input_tokens: 2, cache_creation_input_tokens: 9000, cache_read_input_tokens: 4500, output_tokens: 3000 };
  if (avantMatch) {
    const marches = compacte
      ? lignesDuTableau(userMessage, '## marketPredictions')
      : JSON.parse(entre(userMessage, 'Prédiction chiffrée du moteur pour ce match :\n', '\n\nContexte qualitatif')).marketPredictions.map((m) => ({ market: m.market, pick: m.predictedLabel }));
    let vues = marches.map((m, i) => ({
      market: m.market,
      pick: m.pick,
      verdict: ['confirme', 'nuance', 'contredit'][i % 3],
      confidence: ['faible', 'moyenne', 'forte'][i % 3],
      explanation: `Explication du marché ${m.market}.`,
      reasoning: `Raisonnement sur ${m.pick}.`
    }));
    if (variante === 'alteree') {
      // Libellés altérés, ordre inversé, le 5e marché oublié.
      vues = vues.map(ALTERER).filter((_, i) => i !== 4).reverse();
    }
    return {
      is_error: false,
      structured_output: { summary: 'Synthèse simulée.', keyFactors: [{ factor: 'forme récente', observation: 'Observation.', evidence: 'Preuve.' }], alignmentWithModel: 'Dans le sens du moteur.', marketViews: vues, lineupImpact: 'Impact.', caveats: 'Limites.' },
      usage,
      total_cost_usd: 0.05
    };
  }
  const issues = compacte
    ? lignesDuTableau(userMessage, '## marketOutcomes')
    : JSON.parse(entre(userMessage, 'Marchés joués et leur issue :\n', '\n\nDéroulé et statistiques du match')).map((o) => ({ market: o.market }));
  return {
    is_error: false,
    structured_output: {
      summary: 'Bilan simulé.',
      whatWasRight: 'Juste.',
      whatWasMissed: 'Manqué.',
      outcomeVsEngine: 'Dans le sens du moteur.',
      marketReviews: issues.map((o) => ({ market: o.market, explanation: `Issue expliquée : ${o.market}.`, lesson: `Leçon : ${o.market}.` })),
      caveats: 'Limites.'
    },
    usage,
    total_cost_usd: 0.03
  };
});

const essai = async (f) => {
  try {
    await f();
    return 'ABOUTI';
  } catch (e) {
    return `ECHEC ${e.message}`;
  }
};
const MATCHS = {
  m1: { matchId: 'cal-2026-10-05-man-city-everton', home: 'Man City', away: 'Everton', league: 'EPL', coup: '2026-10-05T19:00:00.000Z' },
  m2: { matchId: 'cal-2026-10-06-fulham-leeds', home: 'Fulham', away: 'Leeds', league: 'EPL', coup: '2026-10-06T19:00:00.000Z' },
  m3: { matchId: 'cal-2026-10-06-newcastle-brighton', home: 'Newcastle', away: 'Brighton', league: 'EPL', coup: '2026-10-06T16:30:00.000Z' },
  m4: { matchId: 'cal-2026-10-07-bournemouth-nott-m-forest', home: 'Bournemouth', away: "Nott'm Forest", league: 'EPL', coup: '2026-10-07T18:45:00.000Z' }
};
const s = { essais: {} };
const avantMatch = (cle, extra = {}) => {
  const m = MATCHS[cle];
  return essai(() =>
    service.runPreMatchAnalysis({ matchId: m.matchId, home: m.home, away: m.away, league: m.league, engineResult: moteur(m.home, m.away, m.coup), sansRepliPayant: true, appel: { type: 'avance', mode: 'normal' }, ...extra })
  );
};

s.essais.m1 = await avantMatch('m1', { timing: 'coup-d-envoi', appel: { type: 'coup-d-envoi', mode: 'normal' } });
s.essais.m2 = await avantMatch('m2');
s.essais.m3 = await avantMatch('m3', { fiche: 'ancienne' });
variante = 'alteree';
s.essais.m4 = await avantMatch('m4');
variante = 'exacte';
s.essais.revueM1 = await essai(() => service.runPostMatchAnalysis({ matchId: MATCHS.m1.matchId, result: { homeGoals: 2, awayGoals: 1, date: JOUR, homeName: 'Man City' }, appel: { type: 'revue', mode: 'normal' } }));
s.essais.revueM3 = await essai(() => service.runPostMatchAnalysis({ matchId: MATCHS.m3.matchId, result: { homeGoals: 0, awayGoals: 0, date: '2026-10-06', homeName: 'Newcastle' }, appel: { type: 'revue' }, fiche: 'ancienne' }));

// Ce qui a été envoyé, appel par appel.
s.appels = appels.map((a) => ({
  avantMatch: a.avantMatch,
  compacte: a.compacte,
  variante: a.variante,
  system: a.system,
  schema: a.schema,
  model: a.model,
  effort: a.effort,
  userDebut: a.user.slice(0, 160),
  userLongueur: a.user.length,
  user: a.user
}));
s.schemas = { avant: JSON.stringify(prompt.SUBMIT_PRE_MATCH_ANALYSIS_TOOL.input_schema), apres: JSON.stringify(prompt.SUBMIT_POST_MATCH_REVIEW_TOOL.input_schema) };
s.consignes = { avant: prompt.CONSIGNES_AVANT_MATCH, apres: prompt.CONSIGNES_APRES_MATCH };
s.moteurs = Object.fromEntries(Object.entries(MATCHS).map(([cle, m]) => [cle, moteur(m.home, m.away, m.coup).marketPredictions]));

// Ce qui a été enregistré.
const lu = (cle) => {
  const e = getByMatchId(MATCHS[cle].matchId);
  return e
    ? {
        fiche: e.fiche ?? null,
        timing: e.timing,
        lineupSource: e.lineupSnapshot?.source ?? null,
        marketsMoteur: e.engineSnapshot?.marketPredictions?.length ?? 0,
        vues: (e.analysis?.marketViews ?? []).map((v) => ({ market: v.market, pick: v.pick, explanation: v.explanation, reasoning: v.reasoning, verdict: v.verdict, probability: v.probability })),
        revue: e.postMatchReview
          ? { fiche: e.postMatchReview.fiche ?? null, marches: e.postMatchReview.marketReviews.map((r) => ({ market: r.market, outcome: r.outcome, explanation: r.explanation, lesson: r.lesson, aiVerdict: r.aiVerdict })) }
          : null
      }
    : null;
};
s.enregistre = Object.fromEntries(Object.keys(MATCHS).map((cle) => [cle, lu(cle)]));

// Le journal des appels (étape 4) : la forme et la taille de chaque envoi.
const journal = lireFichierJournal(serveur, JOUR) ?? { appels: [] };
s.journal = journal.appels.map((a) => ({ type: a.type, match: a.match?.matchId ?? null, fiche: a.fiche ?? null, taille: a.taille ?? null, statut: a.statut }));
console.log(JSON.stringify({ ok: true, ...s }));
