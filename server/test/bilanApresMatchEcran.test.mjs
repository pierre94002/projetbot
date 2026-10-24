/**
 * Le BILAN D'APRÈS-MATCH de la page d'un match joué SE RENDRA AU DESSIN DE L'ONGLET ANALYSE IA (étape 45 du plan, 24/10/2026) :
 * MatchAiReviewPanel.vue — la lecture de l'IA avant le match, le moteur, chaque marché dans la MÊME carte que l'onglet d'avant-match
 * (AiMarketCard, rangée dans les mêmes familles) avec l'issue du pronostic, l'avis de l'IA tenu ou démenti, ce qui s'est passé et la leçon, puis
 * l'après-match, le bilan de l'IA et l'expérience de l'IA par marché (Σ, ⌀, provenance, lien vers la page Bulletin).
 *   node --test test/bilanApresMatchEcran.test.mjs        (depuis server/)
 *
 * Les réponses sont celles du VRAI serveur : la phase « ecran » de test/aides/script-bilan-apres-match.mjs appelle
 * GET /api/match-ai-analysis/fixture dans une copie isolée, sur un extrait RÉEL des analyses de l'IA et du journal des pronostics du bac
 * (test/fixtures/analyses-etape-45.json : Girona - Mallorca avec son bilan et ses quinze marchés, une analyse sans bilan, 25 bilans allégés pour
 * l'expérience, les pronostics d'un match sans analyse). Aucun appel à Claude, aucun réseau. Le rendu est fait côté serveur, sans navigateur
 * (test/aides/rendu.mjs). Les attentes sont RECOMPTÉES ICI, à la main, sur les réponses du serveur.
 *
 *  1. Les règles (ui/src/utils/bilanApresMatch.js) : les familles sont celles de l'onglet d'avant-match, le tableau de l'expérience (Σ, ⌀).
 *  2. Le panneau, dans chacun de ses états : le bilan fait, l'avant-match seul (avec ou sans Claude Code), les pronostics seuls, rien, l'expérience vide.
 *  3. L'onglet Analyse IA d'avant-match n'a pas changé d'un mot ; le câblage et l'hygiène.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { UI, imp, interfacePrete, optionsDuRendu, ouvrirLeRendu, reglesPures, espaces, blocDe, corps, pied, entetes, tableauDe, texteDe } from './aides/rendu.mjs';

const options = optionsDuRendu;
const U = await imp(path.join(UI, 'src', 'utils', 'bilanApresMatch.js'));
const lireUi = (...chemin) => fs.readFileSync(path.join(UI, 'src', ...chemin), 'utf8');

/** Exécute une phase d'un script d'essai dans une copie neuve et rend son JSON. */
function lancer(nom, phase) {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', nom), { args: [phase], timeout: 300_000, env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' } });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}

const trouve = (html, motif, message) => assert.ok(motif.test(html), message ?? `motif absent : ${motif}`);
const absent = (html, motif, message) => assert.ok(!motif.test(html), message ?? `motif présent : ${motif}`);
const cellules = (ligne) => [...ligne.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => espaces(texteDe(m[1])));
const fr2 = (x) => espaces(Number(x).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

let B; // les réponses du serveur et les affiches
let rendu;
let Panneau;
let Analyse;
let Carte;
let fetchDeBase;
before(async () => {
  B = lancer('script-bilan-apres-match.mjs', 'ecran');
  if (!interfacePrete) return;
  rendu = await ouvrirLeRendu({ cibles: /nothing\.vue$/ });
  // La composition d'un match montre des drapeaux : leurs nationalités se lisent en UN appel POST que le panneau ne fait pas lui-même.
  fetchDeBase = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    if ((opts.method ?? 'GET') === 'POST' && /\/match-stats\/players-info$/.test(String(url))) return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ players: {} }) };
    return fetchDeBase(url, opts);
  };
  Panneau = (await rendu.charger('/src/components/analysis/MatchAiReviewPanel.vue')).default;
  Analyse = (await rendu.charger('/src/components/analysis/MatchAiAnalysisPanel.vue')).default;
  Carte = (await rendu.charger('/src/components/analysis/AiMarketCard.vue')).default;
});
after(async () => {
  if (fetchDeBase) globalThis.fetch = fetchDeBase;
  await rendu?.fermer();
});

/** Le match joué tel que la page le donne au panneau : les deux clubs, leurs identifiants, le score. */
const matchDe = (cle, buts = [0, 0]) => {
  const a = B.affiches[cle];
  return { homeName: a.home, awayName: a.away, league: a.league, homeGoals: buts[0], awayGoals: buts[1], homeId: a.homeId ?? null, awayId: a.awayId ?? null };
};
const LUE_LE = '2026-10-05T12:00:00.000Z';
const panneau = (cle, { buts = [0, 0], props = {}, reponse = B.reponses[cle] } = {}) =>
  rendu.rendre(Panneau, { match: matchDe(cle, buts), entry: reponse.entry, predictions: reponse.predictions, experience: reponse.experience, lueLe: LUE_LE, ...props }, []);
/** Les cartes de marché d'un rendu : { libellé du marché → son HTML }. */
const cartes = (html) => new Map([...html.matchAll(/<article class="aimc[^"]*"[\s\S]*?<\/article>/g)].map((m) => [espaces(texteDe(/class="aimc__market"[^>]*>([^<]*)</.exec(m[0])[1])), m[0]]));

/** Ce que doit avoir TOUT rendu du panneau : aucun avertissement, aucune autre lecture, son tableau d'expérience complet. */
function structure(r, { experience = true } = {}) {
  assert.deepEqual(r.avertissements, [], 'aucun avertissement de Vue pendant le rendu');
  assert.deepEqual(rendu.interdits, [], 'aucune lecture : le panneau reçoit tout par ses propriétés');
  assert.equal(r.appels.length, 0);
  if (experience) {
    const tab = tableauDe(r.html, 'experience-ia');
    assert.ok(tab, 'le tableau de l’expérience est toujours là');
    assert.deepEqual(entetes(tab), ['Marché', 'Moteur juste', 'Avis IA tenus']);
    assert.equal(corps(tab).length, 11, 'toujours les onze types de marché');
    assert.equal(pied(tab).length, 2, 'Σ et ⌀');
    assert.ok(espaces(texteDe(pied(tab)[0])).startsWith('Σ Tous les marchés'));
    assert.ok(espaces(texteDe(pied(tab)[1])).startsWith('⌀ Par marché'));
  }
  return espaces(r.texte);
}

// ================================================================================ 1. les règles

test('règles : les familles de marchés sont EXACTEMENT celles de l’onglet Analyse IA d’avant-match — elles ne se séparent pas', () => {
  const lire = (src) => [...src.matchAll(/\{ cle: '(\w+)', titre: '([^']+)', ids: \[([^\]]*)\] \}/g)].map((m) => ({ cle: m[1], titre: m[2], ids: m[3].split(',').map((x) => x.trim().replace(/'/g, '')) }));
  const dansLOnglet = lire(lireUi('components', 'analysis', 'MatchAiAnalysisPanel.vue'));
  assert.equal(dansLOnglet.length, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(U.FAMILLES)), dansLOnglet);
  assert.deepEqual(U.AUTRES_MARCHES, { cle: 'autres', titre: 'Autres marchés' });
  assert.match(lireUi('components', 'analysis', 'MatchAiAnalysisPanel.vue'), /const autres = \{ cle: 'autres', titre: 'Autres marchés', lignes: \[\] \};/);
});

test('règles : ranger les marchés par famille — l’ordre des lignes est gardé, ce qui n’a pas de famille va dans « Autres marchés », une famille vide disparaît', () => {
  const lignes = B.reponses.complete.entry.engineSnapshot.marketPredictions.map((p) => ({ market: p.market, source: p }));
  const g = U.groupesDeMarches(lignes);
  assert.deepEqual(g.map((x) => [x.cle, x.lignes.length]), [['match', 3], ['buts', 3], ['corners', 3], ['tirs', 3], ['cadres', 3]]);
  assert.deepEqual(g[0].lignes.map((l) => l.source.marketId), ['result', 'bothTeamsScore', 'resultAndTotal'].filter((id) => lignes.some((l) => l.source.marketId === id)).sort((a, b) => lignes.findIndex((l) => l.source.marketId === a) - lignes.findIndex((l) => l.source.marketId === b)));
  const mixtes = U.groupesDeMarches([{ market: 'A', source: { marketId: 'totalCorners' } }, { market: 'B', source: { marketId: 'cartons' } }, { market: 'C' }, { market: 'D', source: { marketId: 'totalCorners' } }]);
  assert.deepEqual(mixtes.map((x) => [x.cle, x.lignes.map((l) => l.market)]), [['corners', ['A', 'D']], ['autres', ['B', 'C']]]);
  assert.deepEqual(U.groupesDeMarches([]), []);
  assert.deepEqual(U.groupesDeMarches(null), []);
  assert.deepEqual(U.groupesDeMarches([{ market: 'X', id: 'result' }], (l) => l.id).map((x) => x.cle), ['match'], 'l’identifiant se lit comme le composant le décide');
});

test('règles : le tableau de l’expérience — les onze types, Σ des comptes (le ratio de TOUS les cas), ⌀ des pourcentages des marchés qui ont des cas ; recompté à la main', () => {
  const exp = B.reponses.complete.experience;
  const t = U.tableauDeLExperience(exp);
  assert.equal(t.lignes.length, 11);
  assert.deepEqual(t.lignes.map((l) => l.cle), U.TYPES_DE_MARCHE.map((x) => x[0]));
  const ratio = (n, d) => (d ? `${n}/${d} (${Math.round((100 * n) / d)} %)` : '—');
  for (const type of exp) {
    const l = t.lignes.find((x) => x.cle === type.marketType);
    assert.equal(l.moteur, ratio(type.engineRight, type.matches), type.marketType);
    assert.equal(l.ia, ratio(type.aiRight, type.aiVerdicts), type.marketType);
    assert.equal(l.libelle, type.label, 'le libellé du serveur, apostrophe droite comprise');
  }
  // Σ : les comptes additionnés, jamais une somme de pourcentages.
  const somme = (champ) => exp.reduce((n, x) => n + x[champ], 0);
  assert.deepEqual([t.total.matchs, t.total.moteurJuste, t.total.avisComptes, t.total.avisTenus], [somme('matches'), somme('engineRight'), somme('aiVerdicts'), somme('aiRight')]);
  assert.equal(t.total.moteur, ratio(somme('engineRight'), somme('matches')));
  assert.equal(t.total.ia, ratio(somme('aiRight'), somme('aiVerdicts')));
  // ⌀ : la moyenne des pourcentages des marchés qui ont des cas (chacun pèse autant).
  const moyenne = (liste, f) => `${Math.round(liste.reduce((a, x) => a + f(x), 0) / liste.length)} %`;
  assert.equal(t.moyenne.moteur, moyenne(exp.filter((x) => x.matches > 0), (x) => (100 * x.engineRight) / x.matches));
  assert.equal(t.moyenne.ia, moyenne(exp.filter((x) => x.aiVerdicts > 0), (x) => (100 * x.aiRight) / x.aiVerdicts));
  assert.notEqual(t.moyenne.ia, t.total.ia.replace(/^.*\((\d+ %)\)$/, '$1'), 'la moyenne des marchés n’est pas le taux de tous les cas');
  // Aucune expérience : les onze lignes restent, vides, et Σ comme ⌀ le disent.
  const vide = U.tableauDeLExperience([]);
  assert.equal(vide.lignes.length, 11);
  assert.ok(vide.lignes.every((l) => l.vide && l.moteur === '—' && l.ia === '—'));
  assert.deepEqual([vide.total.moteur, vide.total.ia, vide.moyenne.moteur, vide.moyenne.ia], ['—', '—', '—', '—']);
  assert.equal(U.tableauDeLExperience(null).lignes.length, 11);
  // Au survol : les avis tenus selon la confiance annoncée.
  assert.equal(U.parConfianceDit({ byConfidence: { forte: { verdicts: 4, right: 3 }, moyenne: { verdicts: 2, right: 1 }, faible: { verdicts: 0, right: 0 } } }), 'Confiance forte : 3/4 · Confiance moyenne : 1/2');
  assert.equal(U.parConfianceDit({ byConfidence: {} }), null);
  reglesPures('bilanApresMatch.js');
});

// ================================================================================ 2. le panneau, dans chacun de ses états

test('panneau — le bilan fait (Girona - Mallorca, 0-0) : la lecture de l’IA, le moteur, les quinze marchés en cartes rangées par famille avec leur issue, leur avis, ce qui s’est passé et leur leçon', options, async () => {
  const E = B.reponses.complete.entry;
  const vues = E.analysis.marketViews;
  const revues = E.postMatchReview.marketReviews;
  const preds = E.engineSnapshot.marketPredictions;
  const r = await panneau('complete');
  const t = structure(r);
  trouve(r.html, /data-bloc="bilan-apres-match"/);
  trouve(r.html, /data-etat="bilan"/);
  // 1. La lecture de l'IA : sa synthèse, le compte des avis (recompté), les clés du match, les compositions.
  const lecture = espaces(texteDe(/<section[^>]*data-section="lecture"[\s\S]*?<\/section>/.exec(r.html)[0]));
  assert.ok(lecture.includes(E.analysis.summary));
  const nb = (v) => vues.filter((x) => x.verdict === v).length;
  assert.ok(lecture.includes(`${nb('confirme')} confirmé${nb('confirme') > 1 ? 's' : ''}`) && lecture.includes(`${nb('nuance')} nuancé${nb('nuance') > 1 ? 's' : ''}`) && lecture.includes(`${nb('contredit')} contredit`), lecture.slice(-300));
  assert.ok(lecture.includes(`sur ${vues.length} pronostics du moteur`));
  assert.equal([...r.html.matchAll(/<article class="[^"]*\bai-factor\b/g)].length, E.analysis.keyFactors.length);
  for (const f of E.analysis.keyFactors) assert.ok(t.includes(f.observation), f.factor);
  assert.ok(t.includes('Ce que changent les compositions :') && t.includes(E.analysis.lineupImpact));
  trouve(r.html, /<details[^>]*class="ai-lineups__details"/);
  // 2. Le moteur : les trois issues du 1N2 tirées de ses cotes justes, le favori, les buts attendus.
  const o = E.engineSnapshot.trueOdds;
  const somme = 1 / o.home + 1 / o.draw + 1 / o.away;
  const tuiles = [...r.html.matchAll(/<article class="[^"]*\bai-outcome\b[^"]*"[\s\S]*?<\/article>/g)].map((m) => espaces(texteDe(m[0])));
  assert.equal(tuiles.length, 3);
  assert.ok(tuiles[0].includes(`${Math.round((100 / o.home / somme))} %`) && tuiles[0].includes('Favori'), tuiles[0]);
  assert.ok(tuiles[0].includes(`cote juste ${fr2(o.home)} · bookmaker pas de cote`), 'une cote de bookmaker absente se dit, jamais un tiret');
  assert.equal(tuiles.filter((x) => x.includes('Favori')).length, 1);
  assert.ok(t.includes(`${fr2(E.engineSnapshot.expectedGoals.home)} - ${fr2(E.engineSnapshot.expectedGoals.away)}`), 'les buts attendus, à la virgule');
  // 3. Marché par marché : cinq familles de trois cartes, dans l'ordre de l'onglet d'avant-match.
  const familles = [...r.html.matchAll(/<div class="ai-family"[^>]*data-famille="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(familles, ['match', 'buts', 'corners', 'tirs', 'cadres']);
  const toutes = cartes(r.html);
  assert.equal(toutes.size, preds.length);
  assert.equal(toutes.size, 15);
  const statutDe = (r2) => (r2.outcome === 'juste' ? 'correct' : r2.outcome === 'faux' ? 'incorrect' : 'pending');
  for (const p of preds) {
    const vue = vues.find((x) => x.market === p.market);
    const revue = revues.find((x) => x.market === p.market);
    const carte = toutes.get(p.market);
    assert.ok(carte, p.market);
    const ct = espaces(texteDe(carte));
    assert.ok(ct.includes(p.predictedLabel), `${p.market} : le pronostic`);
    assert.ok(ct.includes(fr2(p.predictedOdds)), `${p.market} : la cote à la virgule`);
    assert.ok(ct.startsWith(`${vue.probability}%`) || ct.startsWith(`${vue.probability} %`) || ct.includes(`${vue.probability}%`), `${p.market} : la probabilité du moteur en anneau`);
    assert.ok(ct.includes({ confirme: 'Confirme', nuance: 'Nuance', contredit: 'Contredit' }[vue.verdict]) && ct.includes(vue.confidence), `${p.market} : l'avis`);
    assert.ok(ct.includes(vue.reasoning), `${p.market} : l'avis de l'IA, tel qu'écrit`);
    trouve(carte, new RegExp(`data-statut="${statutDe(revue)}"`), `${p.market} : le liseré de l'issue`);
    assert.ok(ct.includes(revue.outcome === 'juste' ? 'Pronostic juste' : 'Pronostic faux'), `${p.market} : l'issue en mots`);
    if (revue.aiWasRight === true) assert.ok(ct.includes('Avis de l’IA tenu'), p.market);
    if (revue.aiWasRight === false) assert.ok(ct.includes('Avis de l’IA démenti'), p.market);
    if (revue.aiWasRight === null) assert.ok(!/Avis de l’IA (tenu|démenti)/.test(ct), `${p.market} : un avis « nuance » n'est jamais tenu ni démenti`);
    assert.ok(ct.includes(`Ce qui s’est passé : ${revue.explanation}`), `${p.market} : ce qui s'est passé`);
    assert.ok(ct.includes(revue.lesson), `${p.market} : la leçon`);
    assert.ok(ct.includes(revue.aiWasRight === true ? 'Avis de l’IA tenu — leçon' : revue.aiWasRight === false ? 'Avis de l’IA démenti — leçon' : 'Leçon'), `${p.market} : le titre de la leçon`);
  }
  assert.equal([...r.html.matchAll(/data-statut="correct"/g)].length, revues.filter((x) => x.outcome === 'juste').length);
  assert.equal([...r.html.matchAll(/data-statut="incorrect"/g)].length, revues.filter((x) => x.outcome === 'faux').length);
  // 4. Face au moteur et limites de l'analyse.
  assert.ok(t.includes(E.analysis.alignmentWithModel) && t.includes('Par rapport au moteur'));
  // 5. Après le match : le score, les marchés justes et faux (recomptés), le favori du moteur — faux : 0-0.
  const apres = espaces(texteDe(/<section[^>]*data-section="apres"[\s\S]*?<\/section>/.exec(r.html)[0]));
  assert.ok(apres.includes('0 - 0') && apres.includes(`${revues.filter((x) => x.outcome === 'juste').length} juste(s)`) && apres.includes(`${revues.filter((x) => x.outcome === 'faux').length} faux`));
  assert.ok(!apres.includes('en attente'), 'tous les marchés sont réglés');
  assert.ok(apres.includes(`Favori du moteur : ${E.engineSnapshot.marketPredictions[0].predictedLabel} (${Math.round((100 / o.home / somme))} %) — faux`), apres);
  // 6. Le bilan de l'IA : validé / à corriger avec les leçons de chaque marché (recomptées), la synthèse, le résultat face au moteur.
  const duo = /<div class="ai-duo"[\s\S]*?<\/div>\s*<section/.exec(r.html)?.[0] ?? '';
  const validees = revues.filter((x) => x.lesson && (x.aiWasRight === true || (x.aiWasRight == null && x.outcome === 'juste'))).length;
  const aCorriger = revues.filter((x) => x.lesson && (x.aiWasRight === false || (x.aiWasRight == null && x.outcome === 'faux'))).length;
  const [colonneOk, colonneKo] = duo.split('class="ai-duo__card is-missed"');
  assert.equal([...colonneOk.matchAll(/<li\b/g)].length, validees);
  assert.equal([...colonneKo.matchAll(/<li\b/g)].length, aCorriger);
  assert.ok(t.includes(E.postMatchReview.whatWasRight.slice(0, 80)) && t.includes(E.postMatchReview.whatWasMissed.slice(0, 80)));
  assert.ok(t.includes(E.postMatchReview.summary) && t.includes(E.postMatchReview.outcomeVsEngine) && t.includes('Le résultat face au moteur'));
  assert.ok(t.includes(E.postMatchReview.caveats));
  absent(r.html, /data-section="bilan-a-faire"|data-section="sans-analyse"/);
  // 7. L'expérience : sa provenance réelle et l'heure de sa lecture, le lien vers la page Bulletin.
  assert.ok(t.includes('Analyses de l’IA enregistrées sur ce PC · bilans d’après-match') && t.includes('relu le 05/10 à 14:00'));
  assert.ok(!/Cotes marché|Odds API/.test(t));
  trouve(r.html, /href="\/bulletin"[^>]*data-lien="fiabilite"|data-lien="fiabilite"[^>]*href="\/bulletin"/);
  trouve(r.html, /title="[^"]*match-ai-analyses\.json/, 'le fichier lu, au survol');
  // Plus aucune carte à part : ni détail dépliable, ni anneau local.
  absent(r.html, /class="ai-mk\b|ai-mk__/);
});

test('panneau — le tableau de l’expérience avec les vraies données : chaque case recomptée, Σ et ⌀ au pied, l’avis tenu par confiance au survol', options, async () => {
  const exp = B.reponses.complete.experience;
  const r = await panneau('complete');
  structure(r);
  const tab = tableauDe(r.html, 'experience-ia');
  const lignes = corps(tab).map(cellules);
  const ratio = (n, d) => (d ? `${n}/${d} (${Math.round((100 * n) / d)} %)` : '—');
  for (const type of exp) {
    const ligne = lignes.find((x) => x[0] === type.label);
    assert.ok(ligne, type.label);
    assert.deepEqual(ligne.slice(1), [ratio(type.engineRight, type.matches), ratio(type.aiRight, type.aiVerdicts)], type.label);
  }
  const [sigma, moy] = pied(tab).map(cellules);
  const somme = (champ) => exp.reduce((n, x) => n + x[champ], 0);
  assert.deepEqual(sigma, ['Σ Tous les marchés', ratio(somme('engineRight'), somme('matches')), ratio(somme('aiRight'), somme('aiVerdicts'))]);
  const m1 = Math.round(exp.filter((x) => x.matches > 0).reduce((a, x) => a + (100 * x.engineRight) / x.matches, 0) / exp.filter((x) => x.matches > 0).length);
  const m2 = Math.round(exp.filter((x) => x.aiVerdicts > 0).reduce((a, x) => a + (100 * x.aiRight) / x.aiVerdicts, 0) / exp.filter((x) => x.aiVerdicts > 0).length);
  assert.deepEqual(moy, ['⌀ Par marché (chacun pèse autant)', `${m1} %`, `${m2} %`]);
  const resultat = exp.find((x) => x.marketType === 'result');
  const attendu = ['forte', 'moyenne', 'faible'].filter((c) => resultat.byConfidence[c]?.verdicts).map((c) => `Confiance ${c} : ${resultat.byConfidence[c].right}/${resultat.byConfidence[c].verdicts}`).join(' · ');
  assert.ok(attendu.length > 0);
  trouve(r.html, new RegExp(`title="${attendu.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  // Une expérience PARTIELLE (trois types sur onze ont des cas) : les huit autres gardent leur ligne, « — » partout, et Σ et ⌀ ne comptent que les trois.
  const partielle = exp.filter((x) => ['result', 'totalGoals', 'totalCorners'].includes(x.marketType));
  assert.equal(partielle.length, 3);
  const rp = await panneau('complete', { props: { experience: partielle } });
  structure(rp);
  const tp = tableauDe(rp.html, 'experience-ia');
  const lp = corps(tp).map(cellules);
  assert.equal(lp.length, 11, 'les onze types, même quand huit n’ont aucun cas');
  assert.equal(lp.filter((x) => x[1] === '—' && x[2] === '—').length, 8, 'huit lignes sans cas, dites « — »');
  const somme3 = (champ) => partielle.reduce((n, x) => n + x[champ], 0);
  const [sp, mp] = pied(tp).map(cellules);
  assert.deepEqual(sp, ['Σ Tous les marchés', ratio(somme3('engineRight'), somme3('matches')), ratio(somme3('aiRight'), somme3('aiVerdicts'))]);
  const moyenne3 = (cas, bons) => `${Math.round(partielle.reduce((a, x) => a + (100 * x[bons]) / x[cas], 0) / partielle.length)} %`;
  assert.deepEqual(mp, ['⌀ Par marché (chacun pèse autant)', moyenne3('matches', 'engineRight'), moyenne3('aiVerdicts', 'aiRight')], '⌀ des trois types qui ont des cas, jamais des onze');
});

test('panneau — l’avant-match seul : l’analyse et ses marchés (en attente), le bouton qui lance le bilan seulement si Claude Code est là, sinon la raison', options, async () => {
  const E = B.reponses.avantSeul.entry;
  const connecte = await panneau('avantSeul', { props: { connected: true } });
  const t = structure(connecte);
  trouve(connecte.html, /data-etat="avant-match-seul"/);
  assert.ok(t.includes(E.analysis.summary) && t.includes('Après-match') && t.includes('L\'analyse après-match n\'a pas encore été faite.'));
  const toutes = cartes(connecte.html);
  assert.equal(toutes.size, E.engineSnapshot.marketPredictions.length);
  for (const [libelle, carte] of toutes) {
    trouve(carte, /data-statut="pending"/, libelle);
    assert.ok(espaces(texteDe(carte)).includes('Pas encore réglé'), libelle);
    absent(carte, /Pronostic (juste|faux)|Ce qui s’est passé|aimc__lecon/, libelle);
  }
  const boutons = [...connecte.html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => espaces(texteDe(m[1])));
  assert.deepEqual(boutons, ['Lancer l\'analyse après-match'], 'le seul bouton est celui qui existait déjà');
  const apres = espaces(texteDe(/<section[^>]*data-section="apres"[\s\S]*?<\/section>/.exec(connecte.html)[0]));
  assert.ok(apres.includes(`0 juste(s) 0 faux ${toutes.size} en attente`), `rien n'est réglé : ${apres}`);
  const hors = await panneau('avantSeul', { props: { connected: false } });
  const th = structure(hors);
  assert.ok(th.includes('Claude Code n\'est pas configuré sur ce poste'));
  absent(hors.html, /<button\b[^>]*>[^<]*Lancer/);
  trouve(hors.html, /data-section="bilan-a-faire"/);
});

test('panneau — sans analyse de l’IA, seulement les pronostics du journal : chaque marché dit « pas d’avis de l’IA » et porte son issue réglée', options, async () => {
  const preds = B.reponses.pronosticsSeuls.predictions;
  assert.equal(B.reponses.pronosticsSeuls.entry, null);
  const r = await panneau('pronosticsSeuls', { buts: [2, 1] });
  const t = structure(r);
  trouve(r.html, /data-etat="sans-analyse"/);
  absent(r.html, /data-section="lecture"/, 'pas de lecture de l’IA à montrer');
  const toutes = cartes(r.html);
  assert.equal(toutes.size, preds.length);
  for (const p of preds) {
    const carte = toutes.get(p.market);
    assert.ok(carte, p.market);
    trouve(carte, /data-sans-avis="oui"/, `${p.market} : l'IA n'a donné aucun avis`);
    const ct = espaces(texteDe(carte));
    assert.ok(ct.includes('Pas d’avis de l’IA'), p.market);
    assert.ok(ct.includes(p.status === 'correct' ? 'Pronostic juste' : 'Pronostic faux'), `${p.market} : l'issue du journal`);
    trouve(carte, new RegExp(`data-statut="${p.status}"`));
    assert.ok(ct.includes(p.predictedLabel));
    absent(carte, /class="aimc__verdict"[^>]*>\s*<span class="aimc__badge">/, `${p.market} : pas de faux verdict`);
  }
  assert.ok(t.includes('Pas d\'analyse IA avant ce match : rien à confronter au résultat.'));
  // Le bilan de nos marchés : cinq justes, un faux (recomptés dans le journal).
  assert.ok(t.includes(`${preds.filter((p) => p.status === 'correct').length} juste(s)`) && t.includes(`${preds.filter((p) => p.status === 'incorrect').length} faux`));
});

test('panneau — ni analyse ni pronostic : l’état vide dit pourquoi ; une expérience vide garde ses onze lignes, Σ et ⌀ sans valeur', options, async () => {
  const vide = await rendu.rendre(Panneau, { match: { homeName: 'Nulle Part', awayName: 'Ailleurs', homeGoals: 1, awayGoals: 0 }, entry: null, predictions: [], experience: B.reponses.inconnue.experience }, []);
  assert.deepEqual(vide.avertissements, []);
  assert.ok(espaces(vide.texte).includes('Aucune analyse IA pour ce match'));
  assert.ok(espaces(vide.texte).includes('celui-ci n\'a pas été analysé avant d\'être joué'));
  absent(vide.html, /data-bloc="bilan-apres-match"/);
  // L'analyse « complète » sans bilan écrit nulle part : l'expérience est vide.
  const sans = await panneau('complete', { reponse: B.reponses.sansExperience });
  structure(sans);
  const tab = tableauDe(sans.html, 'experience-ia');
  assert.ok(corps(tab).map(cellules).every((x) => x[1] === '—' && x[2] === '—'), 'un marché sans cas le dit par « — », jamais un zéro');
  assert.deepEqual(pied(tab).map(cellules), [['Σ Tous les marchés', '—', '—'], ['⌀ Par marché', '—', '—']]);
  trouve(sans.html, /data-etat="avant-match-seul"/);
  // Sans propriété `experience` du tout : la même structure.
  const aucune = await rendu.rendre(Panneau, { match: matchDe('complete'), entry: B.reponses.complete.entry }, []);
  structure(aucune);
  assert.ok(espaces(aucune.texte).includes('heure du relevé inconnue'), 'sans heure de lecture, le panneau le dit');
});

test('panneau — une ligne sans vraie cote, un marché conseillé, un marché sans identifiant : la cote absente est dite, « conseillé » est montré, le reste va dans « Autres marchés »', options, async () => {
  const entry = JSON.parse(JSON.stringify(B.reponses.avantSeul.entry));
  entry.engineSnapshot.marketPredictions[4].predictedOdds = 1;
  entry.engineSnapshot.marketPredictions.push({ marketId: 'inconnu', params: {}, market: 'Cartons jaunes', predictedOutcome: 'over', predictedLabel: 'Plus de 3.5 cartons', predictedOdds: 1.8, minOdds: 1.2 });
  const r = await rendu.rendre(Panneau, { match: matchDe('avantSeul'), entry, predictions: [{ market: entry.engineSnapshot.marketPredictions[0].market, action: 'RECOMMENDED', status: 'pending' }], experience: [] }, []);
  const t = structure(r);
  const toutes = cartes(r.html);
  assert.ok(espaces(texteDe(toutes.get(entry.engineSnapshot.marketPredictions[4].market))).includes('pas de cote'), 'une cote à 1,00 : pas de vraie cote');
  trouve(toutes.get(entry.engineSnapshot.marketPredictions[0].market), /Mise recommandée par le moteur/);
  assert.ok(t.includes('Autres marchés') && toutes.has('Cartons jaunes'));
  const autres = /data-famille="autres"[\s\S]*?<\/div>\s*<\/div>/.exec(r.html)?.[0] ?? '';
  assert.ok(autres.includes('Cartons jaunes'));
});

// ================================================================================ 3. l'onglet d'avant-match n'a pas changé ; le câblage ; l'hygiène

test('l’onglet Analyse IA d’avant-match : la carte d’un marché, sans les propriétés du bilan, est celle d’avant — aucun élément de plus', options, async () => {
  const E = B.reponses.avantSeul.entry;
  const vue = E.analysis.marketViews[0];
  const seule = await rendu.rendre(Carte, { view: vue, probability: 52, prediction: E.engineSnapshot.marketPredictions[0], home: E.homeName, away: E.awayName, league: E.league }, []);
  assert.deepEqual(seule.avertissements, []);
  absent(seule.html, /data-statut|data-sans-avis|aimc__issue|aimc__meta|aimc__passe|aimc__lecon|aimc__badge--aucun|data-issue/);
  assert.equal([...seule.html.matchAll(/<article class="aimc/g)].length, 1);
  trouve(seule.html, /class="aimc__verdict"/);
  assert.ok(espaces(seule.texte).includes(vue.reasoning));
  // L'onglet entier (MatchAiAnalysisPanel) : ses quinze cartes n'ont ni liseré d'issue, ni cote, ni badge du bilan.
  const onglet = await rendu.rendre(Analyse, { connected: false, entry: E, allowPreMatch: true, hasResult: false }, []);
  assert.deepEqual(onglet.avertissements, []);
  assert.equal([...onglet.html.matchAll(/<article class="aimc/g)].length, E.analysis.marketViews.length);
  absent(onglet.html, /data-statut|data-sans-avis|aimc__issue|aimc__meta|aimc__passe|aimc__lecon|data-issue/);
});

test('câblage — la page d’un match joué donne au panneau l’heure de lecture de l’analyse ; le panneau n’emploie plus ni anneau ni détail dépliable à lui ; l’onglet d’avant-match et lui partagent la carte et les familles', () => {
  const page = lireUi('views', 'MatchDetailView.vue');
  assert.match(page, /const aiLueLe = ref\(null\);/);
  assert.match(page, /aiLueLe\.value = new Date\(\)\.toISOString\(\);/);
  assert.match(page, /:lue-le="aiLueLe"/);
  assert.match(page, /<MatchAiReviewPanel[\s\S]*?:lue-le="aiLueLe"[\s\S]*?@run-post-match="runPostMatchAi"/);
  const panneau = lireUi('components', 'analysis', 'MatchAiReviewPanel.vue');
  assert.match(panneau, /import AiMarketCard from '\.\/AiMarketCard\.vue';/);
  assert.doesNotMatch(panneau, /import ProbabilityRing/, 'l’anneau est celui de la carte commune');
  assert.doesNotMatch(panneau, /<details[^>]*class="ai-mk|ai-mk__|class="ai-mk"/, 'plus de carte de marché à part');
  assert.match(panneau, /defineEmits\(\['run-post-match'\]\)/);
  assert.match(panneau, /<AiMarketCard[\s\S]*?:revue="l\.revue"[\s\S]*?:statut="l\.status"/);
  assert.match(lireUi('components', 'analysis', 'MatchAiAnalysisPanel.vue'), /import AiMarketCard from '\.\/AiMarketCard\.vue';/);
  // Le panneau ne lit ni n'écrit rien : seul le bouton qui existait déjà émet.
  const code = panneau.slice(0, panneau.indexOf('</script>')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bfetch\(|httpClient|Api\.\w+\(|localStorage|\.post\(|\.put\(/);
  const [debut] = panneau.split('<style scoped>');
  assert.equal([...debut.matchAll(/@click="\$emit\('run-post-match'\)"/g)].length, 1);
});

test('hygiène — le panneau, la carte et les règles : des jetons seulement, pas de !important, polices ≥ 10 px, icônes connues, pas de code Unicode échappé, le français des cotes (virgule)', () => {
  const icones = lireUi('components', 'common', 'AppIcon.vue');
  for (const f of [['components', 'analysis', 'MatchAiReviewPanel.vue'], ['components', 'analysis', 'AiMarketCard.vue'], ['utils', 'bilanApresMatch.js']]) {
    const src = lireUi(...f);
    const nom = f.join('/');
    const css = (src.match(/<style[^>]*>([\s\S]*?)<\/style>/g) ?? []).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${nom} : aucune couleur en dur`);
    assert.doesNotMatch(css, /\brgba?\(\s*\d/, `${nom} : pas de rgba en dur`);
    assert.doesNotMatch(src, /!important/, `${nom} : pas de !important`);
    for (const m of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 10, `${nom} : police ${m[1]}px`);
    assert.doesNotMatch(src, new RegExp(`${String.fromCharCode(92)}${String.fromCharCode(92)}u[0-9a-fA-F]{4}`), `${nom} : pas de code ${String.fromCharCode(92)}uXXXX`);
    for (const m of src.matchAll(/<AppIcon[^>]*\bname="([a-zA-Z]+)"/g)) assert.match(icones, new RegExp(`\\b${m[1]}\\b`), `${nom} : icône ${m[1]}`);
  }
  const panneau = lireUi('components', 'analysis', 'MatchAiReviewPanel.vue');
  assert.doesNotMatch(panneau, /toFixed\(/, 'les cotes se disent à la virgule (toLocaleString fr-FR), jamais toFixed');
  assert.doesNotMatch(panneau, />\s*—\s*</, 'jamais un simple tiret pour une cote absente');
});
