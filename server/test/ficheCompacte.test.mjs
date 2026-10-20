/**
 * La fiche compacte de l'analyse IA de chaque match (étape 41 du plan).
 *   node --test test/ficheCompacte.test.mjs        (depuis server/)
 *
 * AUCUN Claude : les fonctions pures (compactContext.js, matchAiAnalysisPrompt.js)
 * tournent ici même ; la chaîne complète tourne dans des copies ISOLÉES
 * (test/aides/isolement.mjs : base d'essai, réseau coupé, heure figée) avec la
 * réponse du CLI fabriquée (claudeCodeClient.__testing.simulerClaude, refusé
 * hors d'une copie d'essai), FotMob simulé.
 *
 * Référence de l'ANCIENNE forme : test/fixtures/fiche-ia-etape-41.json,
 * produit par le code d'AVANT l'étape (consignes, message, schémas de sortie)
 * sur deux avant-match (A : Girona – Mallorca de la copie du bac, enrichi pour
 * couvrir chaque cas ; B : équipe inconnue du magasin) et une revue.
 *
 *  1. Les consignes sont FIXES : rien de propre au match, identiques d'un
 *     appel à l'autre (relues depuis la mémoire cache de Claude), et elles
 *     gardent chaque règle d'avant.
 *  2. Les schémas de sortie sont inchangés, champ pour champ et dans l'ordre.
 *  3. L'ancienne forme est intacte, octet pour octet, et reste disponible.
 *  4. La forme de la fiche compacte : sections, tableau des marchés (cote juste
 *     ≥ 1,20), aucun JSON, compositions réduites à l'essentiel, absents.
 *  5. Rien d'utile perdu : chaque valeur de l'ancien message est dans la fiche,
 *     sauf les champs déclarés non recopiés (avec leur raison).
 *  6. La revue compacte : chaque marché joué avec son avis d'avant-match.
 *  7. Le rattachement des avis : aucun perdu, aucun donné à deux marchés.
 *  8. La chaîne complète, Claude simulé : fiche compacte par défaut, mêmes
 *     consignes mot pour mot, même modèle, même schéma, avis et bilans
 *     enregistrés, forme et taille au journal ; l'ancienne forme au paramètre.
 *  9. Le réglage AI_ANALYSIS_FICHE et le drapeau `compactage` de l'étape 4 ;
 *     le coût moyen par forme lu dans le journal.
 * 10. Les absents avec leurs chiffres (lineupContext.js), par identifiant.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR, FIXTURES } from './aides/isolement.mjs';
import * as C from '../src/core/ai/compactContext.js';
import * as P from '../src/core/ai/matchAiAnalysisPrompt.js';
import { valeursManquantes, feuilles, dispense } from './aides/ficheSansPerte.mjs';

const F = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'fiche-ia-etape-41.json'), 'utf8'));

// ------------------------------------------------------------------ aides
const compacteAvant = (x, change = {}) => {
  const e = { ...x, ...change };
  return P.buildPreMatchAnalysisRequestCompacte({
    home: e.home,
    away: e.away,
    league: e.league,
    engineSummary: e.engineSummary,
    marches: C.marchesPourIA(e.engineSummary.marketPredictions),
    context: e.contexte,
    lineups: e.compoBrute,
    experience: e.experience,
    commenceTime: e.commenceTime,
    timing: e.timing
  });
};
const compacteApres = (x, change = {}) => {
  const e = { ...x, ...change };
  return P.buildPostMatchReviewRequestCompacte({
    home: e.home,
    away: e.away,
    league: e.league,
    commenceTime: e.commenceTime,
    timing: e.timing,
    analysedAt: e.analysedAt,
    priorAnalysis: e.priorAnalysis,
    engineSummary: e.engineSummary,
    result: e.result,
    marketOutcomes: e.marketOutcomes,
    matchStats: e.matchStats
  });
};
const ancienneAvant = (x) =>
  P.buildPreMatchAnalysisRequest({ home: x.home, away: x.away, league: x.league, engineSummary: x.engineSummary, context: { ...x.contexte, lineups: x.lineupsAncienne }, experience: x.experience });
const ancienneApres = (x) =>
  P.buildPostMatchReviewRequest({ home: x.home, away: x.away, league: x.league, priorAnalysis: x.priorAnalysis, engineSummary: x.engineSummary, result: x.result, marketOutcomes: x.marketOutcomes, matchStats: x.matchStats });
/** L'ancien message d'avant-match, tel quel, sauf les pronostics sous 1,20 (que la fiche compacte écarte, voulu). */
const ancienPayloadAvant = (x) => ({
  moteur: { ...x.engineSummary, marketPredictions: C.marchesPourIA(x.engineSummary.marketPredictions) },
  contexte: { ...x.contexte, lineups: x.lineupsAncienne },
  experience: x.experience
});
const ancienPayloadApres = (x) => ({ analyse: x.priorAnalysis, moteur: x.engineSummary, resultat: x.result, issues: x.marketOutcomes, faits: x.matchStats });
/** Les lignes d'un tableau de la fiche (sous son titre et son en-tête), sans les lignes de détail. */
function tableau(texte, titre) {
  const lignes = texte.split('\n');
  const i = lignes.findIndex((l) => l.startsWith(titre));
  assert.notEqual(i, -1, `section « ${titre} » introuvable`);
  const sortie = [];
  for (let k = i + 2; k < lignes.length && lignes[k].trim() && !lignes[k].startsWith('#'); k++) if (!lignes[k].startsWith('  ') && lignes[k].includes(' | ')) sortie.push(lignes[k]);
  return sortie;
}
const positions = (texte, titres) => titres.map((t) => texte.indexOf(t));

// --------------------------------------------- 1. des consignes FIXES
test('consignes fixes : rien de propre au match, identiques pour tous les matchs, à chaque moment, avec ou sans composition ni expérience', () => {
  const A = F.avantA.entree;
  const B = F.avantB.entree;
  const variantes = [
    compacteAvant(A),
    compacteAvant(B),
    compacteAvant(A, { home: 'Équipe Test Un', away: 'Équipe Test Deux', league: 'Ligue Imaginaire', timing: 'avance', commenceTime: '2027-01-01T20:00:00.000Z' }),
    compacteAvant(A, { compoBrute: null, experience: [], contexte: {} })
  ];
  for (const v of variantes) assert.equal(v.system, P.CONSIGNES_AVANT_MATCH);
  const revues = [compacteApres(F.apres.entree), compacteApres(F.apres.entree, { home: 'Équipe Test Un', away: 'Équipe Test Deux', league: 'Ligue Imaginaire', matchStats: null })];
  for (const v of revues) assert.equal(v.system, P.CONSIGNES_APRES_MATCH);
  // Aucun nom, aucune compétition, aucune date d'un match.
  for (const consignes of [P.CONSIGNES_AVANT_MATCH, P.CONSIGNES_APRES_MATCH]) {
    for (const mot of ['Girona', 'Mallorca', 'Liga', 'Ávila', 'Baleares', 'Federación', 'Équipe Test', 'Imaginaire']) assert.ok(!consignes.includes(mot), `« ${mot} » dans les consignes`);
    assert.doesNotMatch(consignes, /20\d\d-\d\d-\d\d/);
  }
  // C'était tout l'enjeu : l'ancienne forme commence par le nom des équipes (consignes réécrites à chaque match).
  assert.match(ancienneAvant(A).system, /^Tu es un commentateur qualitatif qui accompagne, pour un match à venir \(Girona vs Mallorca, La Liga 2 - Spain\)/);
  assert.match(ancienneApres(F.apres.entree).system, /le match Girona vs Mallorca \(La Liga 2 - Spain\)/);
});

test('consignes fixes : chaque règle d’avant y est toujours (rôle, données, compositions, marchés, expérience, revue)', () => {
  const avant = P.CONSIGNES_AVANT_MATCH;
  for (const regle of [
    'Rôle strictement consultatif',
    'ne propose JAMAIS de cote, de probabilité ou de mise alternative',
    "N'invente aucune donnée",
    '`caveats`',
    'FORME',
    'STATISTIQUES et MOYENNES',
    'ce qu\'elle produit ET ce qu\'elle concède',
    'API-Football',
    'FlashScore',
    'football-data.co.uk (historique)',
    '`division other`',
    'sélection nationale n\'est pas une absence notable',
    '« Doubtful »',
    'son absence ne prouve rien',
    'source FotMob',
    'moins d\'une heure avant, elle est presque toujours officielle',
    'source magasin',
    'onze probable, jamais comme officiel',
    'ne jouera pas',
    'au moins 3 titularisations, ou un but ou une passe décisive',
    'au moins la moitié des matchs de l\'équipe',
    'QUI joue',
    '`lineupImpact`',
    'cite-le seulement s\'il pèse sur un marché',
    '`userNote`',
    'avec sa date d\'écriture',
    '`marketPredictions`',
    '`statExpectations`',
    '`minOdds` (1,20)',
    '`probability`',
    '`marketViews`',
    'CHAQUE ligne, dans le même ordre, sans en omettre',
    'recopiés tels quels',
    '`explanation`, UNE phrase',
    '`verdict` et `reasoning`',
    'jamais une phrase générale recopiée',
    '`experience`',
    'calibrer ta confiance',
    'sortie structurée demandée'
  ]) {
    assert.ok(avant.includes(regle), `règle absente des consignes d'avant-match : ${regle}`);
  }
  const apres = P.CONSIGNES_APRES_MATCH;
  for (const regle of ['`priorAnalysis`', '`marketOutcomes`', '`aiWasRight`', 'confirmer un pronostic juste ou contredire un pronostic faux', '`marketReviews`', '`matchStats`', 'Ces leçons te seront redonnées', 'ne propose JAMAIS de nouvelle cote', "N'invente aucune donnée", '`caveats`', 'sortie structurée demandée']) {
    assert.ok(apres.includes(regle), `règle absente des consignes de la revue : ${regle}`);
  }
});

// --------------------------------------------- 2. les schémas de sortie inchangés
test('schémas de sortie inchangés : mêmes champs, mêmes descriptions, même ordre (le rattachement par position en dépend)', () => {
  assert.equal(JSON.stringify(P.SUBMIT_PRE_MATCH_ANALYSIS_TOOL), JSON.stringify(F.schemas.avant));
  assert.equal(JSON.stringify(P.SUBMIT_POST_MATCH_REVIEW_TOOL), JSON.stringify(F.schemas.apres));
  assert.deepEqual(P.SUBMIT_PRE_MATCH_ANALYSIS_TOOL_CHOICE, F.schemas.avantChoix);
  assert.deepEqual(P.SUBMIT_POST_MATCH_REVIEW_TOOL_CHOICE, F.schemas.apresChoix);
  assert.deepEqual(Object.keys(P.SUBMIT_PRE_MATCH_ANALYSIS_TOOL.input_schema.properties.marketViews.items.properties), ['market', 'pick', 'verdict', 'confidence', 'explanation', 'reasoning']);
});

// --------------------------------------------- 3. l'ancienne forme intacte
test('ancienne forme intacte, octet pour octet (consignes et message), sur les trois cas de référence', () => {
  for (const cle of ['avantA', 'avantB']) {
    const r = ancienneAvant(F[cle].entree);
    assert.equal(r.system, F[cle].ancienneForme.system, `${cle} : consignes`);
    assert.equal(r.messages[0].content, F[cle].ancienneForme.user, `${cle} : message`);
  }
  const r = ancienneApres(F.apres.entree);
  assert.equal(r.system, F.apres.ancienneForme.system);
  assert.equal(r.messages[0].content, F.apres.ancienneForme.user);
});

// --------------------------------------------- 4. la forme de la fiche compacte
test('fiche compacte d’avant-match : sections dans l’ordre, aucun bloc JSON, et presque moitié moins longue', () => {
  const A = F.avantA.entree;
  const u = compacteAvant(A).messages[0].content;
  assert.ok(u.startsWith('# Girona – Mallorca\nCompétition : La Liga 2 - Spain · coup d\'envoi : 2026-10-04T19:00:00.000Z · analyse : au coup d\'envoi'));
  const ordre = positions(u, ['\n## Moteur', '\n## marketPredictions', '\n## standings', '\n## homeForm / awayForm', '\n## homeStats / awayStats', '\n## lineups', '\n## teamNews', '\n## userNote', '\n## experience']);
  for (let i = 0; i < ordre.length; i++) assert.ok(ordre[i] > (ordre[i - 1] ?? 0), `section n° ${i + 1} absente ou mal placée`);
  assert.ok(!u.includes('{"') && !/"\w+":/.test(u), 'aucun bloc JSON dans la fiche');
  const ancien = F.avantA.ancienneForme.user.length;
  assert.ok(u.length < ancien * 0.6, `fiche ${u.length} caractères contre ${ancien} avant`);
  // B : équipe inconnue du magasin — ses sources secondaires et la donnée de forme inconnue ont leur section.
  const b = compacteAvant(F.avantB.entree).messages[0].content;
  assert.ok(positions(b, ['\n## lineups', '\n## sources secondaires', '\n## autres données'])[2] > 0);
  assert.match(b, /\n## autres données\nnouvelleSource : fournisseur essai · indice 0,73 · liste a, b/);
  assert.match(b, /### Atlético Baleares : composition inconnue/);
  assert.match(b, /\n## standings[^\n]*\n3\. Real Ávila — 6 J, 4-1-1, buts 9-4 \(diff 5\), 13 pts, pénalité 3, Promotion ; à domicile 3 J 3-0-0 buts 6-1 ; à l'extérieur 3 J 1-1-1 buts 3-3\n/);
  assert.match(b, /\n7\. Atlético Baleares — 34 J, 14-9-11, buts 41-37 \(diff 4\), 51 pts ; source football-data\.co\.uk \(historique\) · season 2024-2025 · division other/);
  // Peu de données (pas d'expérience, une seule composition) : le gain est moindre, jamais une fiche plus longue.
  assert.ok(b.length < F.avantB.ancienneForme.user.length, `B : ${b.length} contre ${F.avantB.ancienneForme.user.length}`);
});

test('fiche compacte : le tableau des marchés, un par ligne dans l’ordre du moteur, seulement à cote juste ≥ 1,20', () => {
  const A = F.avantA.entree;
  const u = compacteAvant(A).messages[0].content;
  const gardes = A.engineSummary.marketPredictions.filter((m) => m.predictedOdds >= 1.2);
  assert.equal(gardes.length, 15);
  assert.equal(A.engineSummary.marketPredictions.length, 16, 'la référence a un pronostic sous 1,20');
  assert.match(u, /## marketPredictions — 15 pronostic\(s\) du moteur \(minOdds 1,2\) : un avis par ligne, dans cet ordre\nmarket \| predictedLabel \| probability \| cote juste\n/);
  assert.deepEqual(
    tableau(u, '## marketPredictions'),
    gardes.map((m) => `${m.market} | ${m.predictedLabel} | ${m.probability} % | ${C.nombre(m.predictedOdds)}`)
  );
  // Le pronostic à 1,08 : écarté de la fiche, alors que l'ancienne forme l'envoyait.
  assert.ok(!u.includes('Plus de 3.5 corners'));
  assert.ok(F.avantA.ancienneForme.user.includes('Plus de 3.5 corners'));
  // Un pourcentage absent se calcule comme le moteur (1 / cote juste) ; une cote illisible est gardée et dite.
  const sansPourcentage = C.ficheAvantMatch({ home: 'H', away: 'X', engineSummary: { marketPredictions: [{ market: 'Résultat', predictedLabel: 'H gagne', predictedOdds: 1.6, minOdds: 1.2 }, { market: 'Total buts', predictedLabel: 'Plus de 2.5 buts', predictedOdds: null, minOdds: 1.2 }] } });
  assert.deepEqual(tableau(sansPourcentage, '## marketPredictions'), ['Résultat | H gagne | 63 % | 1,6', 'Total buts | Plus de 2.5 buts | – | –']);
});

test('fiche compacte : compositions réduites à l’essentiel — onze, banc qui a compté, titulaires habituels absents, absents (ceux qui ont joué d’abord), chacun une seule fois', () => {
  const A = F.avantA.entree;
  const u = compacteAvant(A).messages[0].content;
  const ligne = (debut) => u.split('\n').filter((l) => l.startsWith(debut));
  // Le onze : poste abrégé et chiffres (joués/titularisations buts+passes xG note).
  assert.match(u, /Onze \(startXI\) : G Paulo Gazzaniga 7\/7 0\+1 – 7,44 · D Javier Boñar 5\/2 0\+1 0,12 7,09/);
  // Le banc : ceux qui ont compté (la règle d'avant), les mêmes que l'ancienne forme.
  for (const cote of ['home', 'away']) {
    const attendus = A.lineupsAncienne[cote].bench.map((j) => j.name);
    const banc = ligne('Banc qui a compté')[cote === 'home' ? 0 : 1];
    for (const nom of attendus) assert.ok(banc.includes(nom), `${nom} : banc`);
    assert.equal(banc.split(' · ').length, attendus.length);
  }
  // L'homonyme (« Inaki » chez FotMob, « Iñaki » au magasin, même identifiant) : écrit une fois, avec les deux graphies, son motif et son retour.
  assert.match(u, /Iñaki González \(annoncé « Inaki González »\) \(D, 5 tit\., 0\+1\) : blessé, retour Late October 2026/);
  assert.equal(u.split('Inaki González').length - 1, 1);
  // Les absents qui ont joué cette saison, avec leurs chiffres ; puis les titulaires habituels déjà dits ne sont pas répétés.
  assert.match(u, /Absents annoncés \(unavailable\), qui ont joué cette saison : M Yáser Asprilla 6\/3 4\+0 1,35 7,4 : en sélection, retour Early October 2026 · A Cristhian Stuani 2\/0 0\+0 0,42 6,04 : blessé, retour Doubtful/);
  assert.equal(u.split('Holmes Zamorano').length - 1, 1, 'un titulaire habituel absent : une seule fois');
  // Les actualités ne répètent pas les absents de la composition ; le suspendu qu'elle n'a pas y est.
  assert.match(u, /Girona : blessés et suspendus : ceux des absents de la composition ; changement d'entraîneur : Míchel → Quique Alvarez/);
  assert.match(u, /Mallorca : blessés et suspendus : Pablo Maffeo \(suspension\) ; changement d'entraîneur : Martín Demichelis → Luis García/);
  // La note de Pierre sur une ligne, avec sa date.
  assert.match(u, /\n## userNote — note de Pierre, écrite le 2026-10-03T21:14:00\.000Z : Vestiaire tendu à Mallorca après la défaite contre Almería ; le capitaine Raíllo/);
  // L'expérience : les matchs des leçons en légende, chaque leçon renvoie au repère de SON match.
  const legende = u.split('\n').find((l) => l.startsWith('Matchs des leçons : '));
  const reperes = new Map(legende.slice('Matchs des leçons : '.length).split(' · ').map((x) => [x.slice(0, x.indexOf(']') + 1), x.slice(x.indexOf(']') + 2)]));
  assert.ok(reperes.size >= 2);
  const lecons = u.split('\n').filter((l) => /^- \[[a-z]+\] /.test(l));
  const attendues = A.experience.flatMap((t) => t.recentLessons);
  assert.equal(lecons.length, attendues.length);
  lecons.forEach((l, i) => {
    assert.equal(reperes.get(l.slice(2, l.indexOf(']') + 1)), attendues[i].match, `leçon ${i + 1} : son match`);
    assert.ok(l.endsWith(`: ${attendues[i].lesson}`), `leçon ${i + 1} : son texte`);
  });
});

// --------------------------------------------- 5. rien d'utile perdu
test('rien d’utile perdu : chaque valeur de l’ancien message (avant-match A et B, revue) se retrouve dans la fiche compacte', () => {
  for (const cle of ['avantA', 'avantB']) {
    const x = F[cle].entree;
    const manquantes = valeursManquantes(ancienPayloadAvant(x), compacteAvant(x).messages[0].content, { dispenses: C.NON_RECOPIES, nombre: C.nombre });
    assert.deepEqual(manquantes, [], `${cle} : ${JSON.stringify(manquantes.slice(0, 5))}`);
  }
  const x = F.apres.entree;
  const manquantes = valeursManquantes(ancienPayloadApres(x), compacteApres(x).messages[0].content, { dispenses: C.NON_RECOPIES_REVUE, nombre: C.nombre });
  assert.deepEqual(manquantes, [], JSON.stringify(manquantes.slice(0, 5)));
});

test('rien d’utile perdu : chaque champ non recopié a sa raison et existe vraiment dans l’ancien message ; le contrôle voit une perte', () => {
  const leavesAvant = [...feuilles(ancienPayloadAvant(F.avantA.entree)), ...feuilles(ancienPayloadAvant(F.avantB.entree))];
  for (const [cle, raison] of Object.entries(C.NON_RECOPIES)) {
    assert.ok(typeof raison === 'string' && raison.length > 15, `${cle} : sa raison`);
    assert.ok(leavesAvant.some((f) => dispense(f.chemin, { [cle]: raison })), `${cle} : ne correspond à aucune valeur de l'ancien message`);
  }
  const leavesApres = feuilles(ancienPayloadApres(F.apres.entree));
  for (const [cle, raison] of Object.entries(C.NON_RECOPIES_REVUE)) {
    assert.ok(typeof raison === 'string' && raison.length > 15, `${cle} : sa raison`);
    assert.ok(leavesApres.some((f) => dispense(f.chemin, { [cle]: raison })), `${cle} : ne correspond à aucune valeur de l'ancien message`);
  }
  // Le contrôle lui-même : une leçon retirée, une absence retirée, un chiffre changé — vus.
  const x = F.avantA.entree;
  const u = compacteAvant(x).messages[0].content;
  const lecon = x.experience[0].recentLessons[0].lesson;
  const sansLecon = valeursManquantes(ancienPayloadAvant(x), u.replace(lecon, '…'), { dispenses: C.NON_RECOPIES, nombre: C.nombre });
  assert.ok(sansLecon.some((m) => m.chemin === 'experience.0.recentLessons.0.lesson'));
  const sansMaffeo = valeursManquantes(ancienPayloadAvant(x), u.replace('Pablo Maffeo', 'P. M.'), { dispenses: C.NON_RECOPIES, nombre: C.nombre });
  assert.ok(sansMaffeo.some((m) => m.chemin === 'contexte.teamNews.away.longTermAbsences.1.name'));
  const sansFauteArbitre = valeursManquantes(ancienPayloadAvant(x), u.replace('fautes 25,95', 'fautes 26'), { dispenses: C.NON_RECOPIES, nombre: C.nombre });
  assert.ok(sansFauteArbitre.some((m) => m.chemin === 'contexte.lineups.matchInfo.referee.foulsPerMatch'));
});

// --------------------------------------------- 6. la revue compacte
test('revue compacte : chaque marché joué dans l’ordre, avec son issue, l’avis d’avant-match, son explication et son raisonnement ; les faits du match', () => {
  const x = F.apres.entree;
  const u = compacteApres(x).messages[0].content;
  assert.ok(u.startsWith("# Revue d'après-match : Girona – Mallorca\nCompétition : La Liga 2 - Spain · coup d'envoi : 2026-10-04T19:00:00.000Z · score final (Girona – Mallorca) : 2-1"));
  const ordre = positions(u, ['\n## priorAnalysis', '\n## Moteur, au moment de ton analyse', '\n## marketOutcomes', '\n## matchStats']);
  for (let i = 0; i < ordre.length; i++) assert.ok(ordre[i] > (ordre[i - 1] ?? 0), `section n° ${i + 1}`);
  assert.ok(!u.includes('{"'));
  assert.ok(u.length < F.apres.ancienneForme.user.length * 0.7);
  const lignes = tableau(u, '## marketOutcomes');
  assert.equal(lignes.length, x.marketOutcomes.length);
  const oui = (v) => (v === true ? 'oui' : v === false ? 'non' : '–');
  /** Les lignes de détail (« ␣␣… ») écrites sous une ligne du tableau. */
  const sous = (ligne) => {
    const suite = u.slice(u.indexOf(`${ligne}\n`) + ligne.length + 1).split('\n');
    return suite.slice(0, suite.findIndex((l) => !l.startsWith('  ')));
  };
  x.marketOutcomes.forEach((o, i) => {
    assert.ok(lignes[i].startsWith(`${o.market} | ${o.pick} | `), `ligne ${i + 1}`);
    assert.ok(lignes[i].endsWith(` | ${o.outcome} | ${o.aiVerdict ? `${o.aiVerdict}${o.aiConfidence ? `, ${o.aiConfidence}` : ''}` : 'aucun'} | ${oui(o.aiWasRight)}`), lignes[i]);
    const vue = x.priorAnalysis.marketViews.find((v) => v.market === o.market);
    assert.deepEqual(sous(lignes[i]), [`  explication : ${vue.explanation}`, `  raisonnement : ${vue.reasoning}`], o.market);
  });
  assert.match(u, /\n\nAutres avis d'avant-match \(sur un marché qui n'est plus dans la liste\) :\n- Mi-temps \| Nul à la pause \| nuance, faible \| explication : Marché retiré depuis : nul à la pause\./);
  assert.match(u, /Score 2-1 · buts : 12' Girona \(Abel Ruiz\), penalty · 55' Mallorca \(Antonio Raíllo\), contre son camp · 88' Mallorca \(Adrián Fuentes\) · cartons rouges : 71' Mallorca \(Pablo Torre\)/);
  assert.match(u, /Statistiques \(Girona \/ Mallorca\) : xG 1,13 \/ 0,26 · tirs 16 \/ 9 · tirs cadrés 5 \/ 0 · grosses occasions 1 \/ 0 · possession 55% \/ 45%/);
  // Sans faits relevés : dit, jamais inventé.
  assert.match(compacteApres(x, { matchStats: null }).messages[0].content, /## matchStats — faits du match : indisponibles dans le magasin$/);
});

// --------------------------------------------- 7. le rattachement des avis
const MARCHES = C.marchesPourIA(F.avantA.entree.engineSummary.marketPredictions);
const avis = () => MARCHES.map((m, i) => ({ market: m.market, pick: m.predictedLabel, n: i }));
const verifier = (res, attendus) => {
  assert.equal(res.length, MARCHES.length);
  res.forEach((r, i) => assert.equal(r?.n ?? null, attendus[i], `marché ${i + 1} (${MARCHES[i].market})`));
  const pris = res.filter(Boolean);
  assert.equal(new Set(pris).size, pris.length, 'un avis donné à deux marchés');
};
const tous = MARCHES.map((_, i) => i);

test('rattachement : libellés recopiés, altérés (tiret, accents, casse, numéro de ligne), ordre mélangé — chaque avis à son marché', () => {
  verifier(C.rattacherAuxMarches(avis(), MARCHES), tous);
  const alteres = avis().map((v, i) => ({
    ...v,
    market: [(s) => s.replace('—', '-'), (s) => s.replace('—', '–'), (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, ''), (s) => s.toUpperCase(), (s) => `${i + 1}. ${s}`, (s) => `${i + 1}) ${s}`, (s) => `  ${s}  `][i % 7](v.market)
  }));
  verifier(C.rattacherAuxMarches(alteres, MARCHES), tous);
  verifier(C.rattacherAuxMarches([...alteres].reverse(), MARCHES), tous);
  // Les bilans d'après-match (sans pronostic recopié) : par libellé, même numérotés et dans le désordre.
  const issues = F.apres.entree.marketOutcomes;
  const bilans = [...issues].reverse().map((o, i) => ({ market: o.market.replace('—', '-'), n: issues.length - 1 - i }));
  const r = C.rattacherAuxMarches(bilans, issues);
  issues.forEach((o, i) => assert.equal(r[i]?.n, i, o.market));
  const numerotes = [...issues].reverse().map((o, i) => ({ market: `${issues.length - i}. ${o.market}`, n: issues.length - 1 - i }));
  const rn = C.rattacherAuxMarches(numerotes, issues);
  issues.forEach((o, i) => assert.equal(rn[i]?.n, i, `numéroté : ${o.market}`));
});

test('rattachement : un avis oublié, un avis en double, un libellé illisible, un avis de trop — rien de perdu, rien au mauvais marché', () => {
  // 14 avis pour 15 marchés : 14 rattachés, le marché oublié sans avis (jamais celui d'un autre).
  verifier(C.rattacherAuxMarches(avis().filter((v) => v.n !== 6), MARCHES), tous.map((i) => (i === 6 ? null : i)));
  // Autant d'avis que de marchés, mais l'avis du 3e en double à la place du 6e : le 6e reste sans avis.
  // (Avant l'étape 41, le recours à la position donnait au 6e marché le doublon du 3e.)
  const doublon = avis().map((v, i) => (i === 5 ? { ...avis()[2], n: 2 } : v));
  const r = C.rattacherAuxMarches(doublon, MARCHES);
  assert.equal(r[5], null);
  assert.equal(r[2].n, 2);
  // Un libellé illisible, autant d'avis que de marchés : la position le rattache.
  verifier(
    C.rattacherAuxMarches(avis().map((v, i) => (i === 9 ? { ...v, market: '???', pick: '???' } : v)), MARCHES),
    tous
  );
  // Un libellé illisible et un avis en moins : le pronostic recopié le rattache.
  verifier(
    C.rattacherAuxMarches(avis().filter((v) => v.n !== 0).map((v) => (v.n === 9 ? { ...v, market: 'Tirs totaux du match' } : v)), MARCHES),
    tous.map((i) => (i === 0 ? null : i))
  );
  // Un avis sur un marché inconnu : ignoré, les autres intacts.
  verifier(C.rattacherAuxMarches([...avis(), { market: 'Mi-temps', pick: 'Nul', n: 99 }], MARCHES), tous);
  // Rien à rattacher.
  assert.deepEqual(C.rattacherAuxMarches(undefined, MARCHES), MARCHES.map(() => null));
  assert.deepEqual(C.rattacherAuxMarches([null, 'texte', 3], MARCHES.slice(0, 3)), [null, null, null]);
});

test('rattachement : deux marchés de même libellé (deux lignes d’un marché) — chacun l’avis de son pronostic, jamais le même avis pour les deux', () => {
  const marches = [
    { market: 'Total corners', predictedLabel: 'Plus de 7.5 corners' },
    { market: 'Total corners', predictedLabel: 'Plus de 9.5 corners' },
    { market: 'Résultat', predictedLabel: 'Girona gagne' }
  ];
  const v = (market, pick, n) => ({ market, pick, n });
  const ids = (res) => res.map((r) => r?.n ?? null);
  const dansLOrdre = [v('Total corners', 'Plus de 7.5 corners', 0), v('Total corners', 'Plus de 9.5 corners', 1), v('Résultat', 'Girona gagne', 2)];
  assert.deepEqual(ids(C.rattacherAuxMarches(dansLOrdre, marches)), [0, 1, 2]);
  assert.deepEqual(ids(C.rattacherAuxMarches([...dansLOrdre].reverse(), marches)), [0, 1, 2], 'à l’envers : par le pronostic recopié');
  // Un seul avis, celui de la 2e ligne : il va à la 2e ligne, la 1re reste sans avis.
  assert.deepEqual(ids(C.rattacherAuxMarches([dansLOrdre[1]], marches)), [null, 1, null]);
  // Pronostics illisibles : un avis chacun, dans l'ordre — jamais le même avis pour les deux lignes.
  const r = C.rattacherAuxMarches([v('Total corners', '?', 0), v('Total corners', '??', 1)], marches);
  assert.deepEqual(ids(r), [0, 1, null]);
  assert.notEqual(r[0], r[1]);
});

test('marchés commentés et forme de la fiche : cote juste ≥ 1,20 (illisible gardée), ordre et objets du moteur ; compacte sauf « ancienne »', () => {
  const m = (predictedOdds) => ({ market: `m${predictedOdds}`, predictedOdds });
  const liste = [m(1.2), m(1.19), m(2.5), m(null), m(undefined), m('abc'), m(1.08), m(1.2000001)];
  const gardes = C.marchesPourIA(liste);
  assert.deepEqual(gardes.map((x) => x.market), ['m1.2', 'm2.5', 'mnull', 'mundefined', 'mabc', 'm1.2000001']);
  assert.equal(gardes[0], liste[0], 'les objets du moteur, pas des copies');
  assert.deepEqual(C.marchesPourIA(undefined), []);
  assert.equal(C.formeDeLaFiche(), 'compacte');
  assert.equal(C.formeDeLaFiche(null, 'ancienne'), 'ancienne');
  assert.equal(C.formeDeLaFiche('compacte', 'ancienne'), 'compacte');
  assert.equal(C.formeDeLaFiche('ancienne', 'compacte'), 'ancienne');
  assert.equal(C.formeDeLaFiche('moyenne', 'ancienne'), 'ancienne');
  assert.equal(C.formeDeLaFiche('moyenne', 'n’importe'), 'compacte');
});

// ------------------------------------------- 8 à 10. dans des copies isolées
/** Exécute un script d'essai dans une copie neuve, rend son JSON (et l'échec lisible sinon). */
function lancer(nom, env = {}) {
  const copie = preparerCopie({});
  try {
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', nom), {
      timeout: 240_000,
      env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false', ...env }
    });
    assert.equal(r.code, 0, `${nom} a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-2000)}`);
    assert.ok(r.json?.ok, `${nom} : sortie illisible\n${r.sortie.slice(-2000)}`);
    assert.equal(r.reseau, false, `${nom} : un appel réseau a été tenté\n${r.erreurs.slice(-2000)}`);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}
const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};
const chaine = uneFois(() => lancer('script-fiche-compacte.mjs'));
const reglageNormal = uneFois(() => lancer('script-fiche-reglage.mjs'));
const reglageAncien = uneFois(() => lancer('script-fiche-reglage.mjs', { AI_ANALYSIS_FICHE: 'ancienne' }));

test('chaîne complète (Claude simulé) : fiche compacte par défaut, consignes identiques mot pour mot d’un match et d’un moment à l’autre, même modèle et même schéma', () => {
  const s = chaine();
  assert.deepEqual(s.essais, { m1: 'ABOUTI', m2: 'ABOUTI', m3: 'ABOUTI', m4: 'ABOUTI', revueM1: 'ABOUTI', revueM3: 'ABOUTI' });
  const [m1, m2, m3, m4, r1, r3] = s.appels;
  for (const a of [m1, m2, m4]) {
    assert.equal(a.compacte, true);
    assert.equal(a.system, s.consignes.avant);
    assert.equal(a.schema, s.schemas.avant);
  }
  assert.ok(m1.userDebut.startsWith('# Man City – Everton\n') && m2.userDebut.startsWith('# Fulham – Leeds\n'));
  for (const nom of ['Man City', 'Everton', 'Fulham', 'Leeds', 'EPL']) assert.ok(!m1.system.includes(nom));
  // L'ancienne forme, au paramètre : les consignes avec le nom des équipes, le message JSON d'avant.
  assert.equal(m3.compacte, false);
  assert.match(m3.system, /\(Newcastle vs Brighton, EPL\)/);
  assert.ok(m3.userDebut.startsWith('Prédiction chiffrée du moteur pour ce match :\n{'));
  assert.equal(m3.schema, s.schemas.avant);
  // Les revues : compacte (consignes fixes), puis ancienne.
  assert.equal(r1.compacte, true);
  assert.equal(r1.system, s.consignes.apres);
  assert.equal(r1.schema, s.schemas.apres);
  assert.equal(r3.compacte, false);
  assert.match(r3.system, /le match Newcastle vs Brighton \(EPL\)/);
  // Le modèle et l'effort ne changent pas (le changement de modèle attend le carnet de l'étape 21).
  for (const a of s.appels) assert.deepEqual([a.model, a.effort], ['sonnet', 'low']);
  // La fiche compacte est nettement plus courte que l'ancienne, à moteur et base égaux.
  assert.ok(m1.userLongueur < m3.userLongueur * 0.6, `${m1.userLongueur} contre ${m3.userLongueur}`);
});

test('chaîne complète : chaque marché garde son avis et sa phrase d’explication, enregistrés sous le libellé du moteur ; la revue juge chaque marché', () => {
  const s = chaine();
  const verifierVues = (cle, attendus) => {
    const e = s.enregistre[cle];
    const marches = s.moteurs[cle].filter((m) => attendus(m));
    assert.equal(e.vues.length, marches.length, `${cle} : ${e.vues.length} avis`);
    e.vues.forEach((v, i) => {
      assert.equal(v.market, marches[i].market);
      assert.equal(v.explanation, `Explication du marché ${v.market}.`, `${cle} : l'explication de « ${v.market} » vient de SON marché`);
      assert.match(v.reasoning, /^Raisonnement sur /);
      assert.equal(v.probability, Math.round(100 / marches[i].predictedOdds));
    });
  };
  // Fiche compacte : les 15 marchés à cote juste ≥ 1,20 (le 16e, à 1,06, n'est pas commenté).
  verifierVues('m1', (m) => m.predictedOdds >= 1.2);
  verifierVues('m2', (m) => m.predictedOdds >= 1.2);
  assert.equal(s.enregistre.m1.marketsMoteur, 16, 'le moteur enregistré garde ses 16 pronostics');
  assert.equal(s.enregistre.m1.fiche, 'compacte');
  assert.equal(s.enregistre.m1.lineupSource, 'magasin');
  // Ancienne forme : les 16, comme avant.
  verifierVues('m3', () => true);
  assert.equal(s.enregistre.m3.fiche, 'ancienne');
  // Libellés altérés, ordre inversé, le 5e marché oublié : 14 avis, chacun à SON marché.
  verifierVues('m4', (m) => m.predictedOdds >= 1.2 && m.market !== 'Buts — Bournemouth');
  // La revue compacte : les 16 marchés jugés (issue calculée), les 15 commentés avec explication et leçon.
  const r1 = s.enregistre.m1.revue;
  assert.equal(r1.fiche, 'compacte');
  assert.equal(r1.marches.length, 16);
  for (const r of r1.marches) {
    if (r.market === 'Total corners (ligne basse)') {
      assert.equal(r.explanation, null);
      continue;
    }
    assert.equal(r.explanation, `Issue expliquée : ${r.market}.`);
    assert.equal(r.lesson, `Leçon : ${r.market}.`);
  }
  assert.ok(r1.marches.every((r) => ['juste', 'faux', 'indéterminé'].includes(r.outcome)));
  const r3 = s.enregistre.m3.revue;
  assert.equal(r3.fiche, 'ancienne');
  assert.equal(r3.marches.filter((r) => r.explanation).length, 16);
});

test('chaîne complète : le journal des appels (étape 4) note la forme de la fiche et la taille de ce qui est parti', () => {
  const s = chaine();
  assert.deepEqual(
    s.journal.map((a) => [a.type, a.fiche]),
    [['coup-d-envoi', 'compacte'], ['avance', 'compacte'], ['avance', 'ancienne'], ['avance', 'compacte'], ['revue', 'compacte'], ['revue', 'ancienne']]
  );
  s.journal.forEach((a, i) => {
    assert.deepEqual(a.taille, { consignes: s.appels[i].system.length, message: s.appels[i].userLongueur }, `appel ${i + 1}`);
  });
});

test('réglage : fiche compacte par défaut, AI_ANALYSIS_FICHE=ancienne ramène l’ancienne ; un paramètre l’emporte ; une valeur inconnue suit le réglage', () => {
  const n = reglageNormal();
  assert.equal(n.reglage, 'compacte');
  assert.deepEqual(n.sansParametre, { compacte: true, consignesAvecEquipes: false, ficheEnregistree: 'compacte' });
  assert.deepEqual(n.forceeAncienne, { compacte: false, consignesAvecEquipes: true, ficheEnregistree: 'ancienne' });
  assert.deepEqual(n.valeurInconnue, { compacte: true, consignesAvecEquipes: false, ficheEnregistree: 'compacte' });
  const a = reglageAncien();
  assert.equal(a.reglage, 'ancienne');
  assert.deepEqual(a.sansParametre, { compacte: false, consignesAvecEquipes: true, ficheEnregistree: 'ancienne' });
  assert.deepEqual(a.forceeCompacte, { compacte: true, consignesAvecEquipes: false, ficheEnregistree: 'compacte' });
  assert.deepEqual(a.valeurInconnue, { compacte: false, consignesAvecEquipes: true, ficheEnregistree: 'ancienne' });
  assert.deepEqual(a.journal.map((l) => l.fiche), ['ancienne', 'compacte', 'ancienne', 'ancienne']);
});

test('drapeau « compactage » de l’étape 4 branché : actif en mode normal comme en économe (forme normale) ; l’essai sans mise en cache reste éteint', () => {
  const n = reglageNormal();
  for (const mode of ['normal', 'econome']) {
    assert.deepEqual(
      { actif: n.politique[mode].compactage.actif, forme: n.politique[mode].compactage.forme, reglage: n.politique[mode].compactage.reglage },
      { actif: true, forme: 'compacte', reglage: 'AI_ANALYSIS_FICHE' }
    );
    assert.deepEqual(n.politique[mode].essaiSansCache, { actif: false, prevu: 'essai sans mise en cache : prévu, pas activé' });
  }
  // Les règles du mode économe, elles, ne bougent pas.
  assert.deepEqual([n.politique.normal.uneSeuleAnalyseAvantMatch, n.politique.normal.repriseTitulairesHabituelsMin], [false, 1]);
  assert.deepEqual([n.politique.econome.uneSeuleAnalyseAvantMatch, n.politique.econome.repriseTitulairesHabituelsMin], [true, 2]);
  assert.equal(n.modeDuMoment.actif, true);
  const a = reglageAncien();
  for (const mode of ['normal', 'econome']) assert.deepEqual([a.politique[mode].compactage.actif, a.politique[mode].compactage.forme], [false, 'ancienne']);
  assert.equal(a.politique.econome.essaiSansCache.actif, false);
});

test('coût moyen d’une analyse par forme, lu dans le journal : semaine de Paris jusqu’à aujourd’hui, échecs comptés, tokens inconnus à part, référence du 04/10 et objectif', () => {
  const { cout, etat } = reglageNormal();
  assert.deepEqual([cout.du, cout.au], ['2026-09-28', '2026-09-30']);
  const [avantMatch, revue] = cout.analyses;
  assert.deepEqual([avantMatch.analyse, avantMatch.reference, avantMatch.objectif], ['avantMatch', 24_400, 17_000]);
  assert.deepEqual([revue.analyse, revue.reference, revue.objectif], ['revue', 10_800, 7_000]);
  const forme = (a, f) => a.formes.find((x) => x.forme === f);
  // Avant-match : l'ancienne (une ligne d'avant l'étape 41, sans forme notée) ; la compacte : clic, coup d'envoi, reprise en échec ; l'avance sans tokens à part.
  assert.deepEqual(forme(avantMatch, 'ancienne'), { forme: 'ancienne', appels: 1, echecs: 0, sansTokens: 0, tokensMoyens: 24_000, entreeMoyenne: 19_202, sortieMoyenne: 4_798, caracteresMoyens: null });
  assert.deepEqual(forme(avantMatch, 'compacte'), { forme: 'compacte', appels: 3, echecs: 1, sansTokens: 1, tokensMoyens: 16_000, entreeMoyenne: 12_802, sortieMoyenne: 3_198, caracteresMoyens: 19_559 });
  // Revue : le clic d'après-match en ancienne forme compte avec la revue d'avant l'étape ; ni la semaine d'avant, ni le lendemain, ni un appel « autre ».
  assert.deepEqual([forme(revue, 'ancienne').appels, forme(revue, 'ancienne').tokensMoyens], [2, 11_500]);
  assert.deepEqual([forme(revue, 'compacte').appels, forme(revue, 'compacte').tokensMoyens, forme(revue, 'compacte').caracteresMoyens], [1, 9_000, 9_943]);
  // L'état de la carte « Budget Claude » le porte.
  assert.deepEqual(etat.analyses.map((a) => a.analyse), ['avantMatch', 'revue']);
  assert.equal(etat.reference, 'mesuré le 04/10/2026 (champ usage des analyses enregistrées depuis le 02/10, sortie comprise)');
});

test('absents avec leurs chiffres (lineupContext) : poste et saison par identifiant FotMob, jamais l’identifiant 0 ; mis en avant dans la fiche, ancienne forme inchangée', () => {
  const s = lancer('script-fiche-absents.mjs');
  const [vedette, remplacant, zero, inconnu] = s.absents;
  assert.equal(vedette.id, s.vedette.pid);
  assert.equal(vedette.position, s.vedette.position);
  assert.ok(vedette.stats && vedette.stats.starts === s.vedette.starts && vedette.stats.apps >= vedette.stats.starts);
  assert.equal(remplacant.id, s.remplacant.pid);
  assert.ok(remplacant.stats && remplacant.stats.apps > 0);
  assert.deepEqual([zero.id, zero.position, zero.stats], [null, null, null], 'identifiant 0 : personne');
  assert.deepEqual([inconnu.position, inconnu.stats], [null, null], 'inconnu de la base : pas de chiffres inventés');
  // L'ancienne forme lit les absents comme avant : nom, motif, retour.
  assert.deepEqual(s.ancienneForme.map((a) => Object.keys(a)), Array(4).fill(['name', 'reason', 'expectedReturn']));
  // La fiche : ceux qui ont joué d'abord, avec leurs chiffres ; les autres ensuite.
  const ontJoue = s.lignesFiche.find((l) => l.startsWith('Absents annoncés (unavailable), qui ont joué cette saison'));
  assert.ok(ontJoue.includes(`${s.vedette.name} ${vedette.stats.apps}/${vedette.stats.starts} `) && ontJoue.includes(`: blessé, retour Late October 2026`));
  assert.ok(ontJoue.includes(s.remplacant.name));
  assert.ok(s.lignesFiche.includes('Autres absents : Inconnu Zéro : blessé · Pas Dans La Base : suspendu'));
});
