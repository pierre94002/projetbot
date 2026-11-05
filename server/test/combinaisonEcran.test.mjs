/**
 * LA COMBINAISON — L'ÉCRAN (étape 38, lot 1b, 04/11/2026) : la lecture `combinaison` jointe à l'analyse et l'encadré gris
 * « Avant de parier — à blanc » de la page du match, rendus côté serveur, sans navigateur (aides/rendu.mjs : `fetch` remplacé,
 * tout appel refusé et compté ; horloge figée) ; les blocs viennent de la VRAIE lecture (la nuit fabriquée,
 * aides/combinaisonNuitFabriquee.mjs) et de la VRAIE route de l'analyse dans une copie (aides/script-combinaison-route.mjs :
 * une value chez Betclic, la mise de l'étape 39 jointe ensuite).
 *   node --test test/combinaisonEcran.test.mjs        (depuis server/)
 *
 * T-E1 jamais « sûr » : ni l'étiquette ni un degré ne quittent le serveur ; rien de tel à l'écran ;
 * T-E2 ConfidenceGauge reçoit toujours null (le tableau des verdicts dit « pas encore mesurée ») ; l'encadré n'a ni jauge ni
 *      chiffre de confiance ;
 * T-E3 jamais une value sans mesure ni deux verdicts sur un écran : aucune « value x % » dans l'encadré ; la mention « jamais
 *      mesuré chez ce bookmaker » que la mise conseillée dit déjà (Betclic) n'est PAS redite, celle d'Unibet l'est ; la mise
 *      n'est ni répétée ni contredite ; les cotes saisies (Q-B) non touchées ;
 * T-E4 « mesuré » seulement après un verdict : sans note, « pas encore mesuré » ; avec la note du passage unique, « rien ne
 *      s'ajoute aux cotes (mesuré sur 30 158 matchs, 2019-2023) » ;
 * T-E5 aucune requête de plus : l'encadré lit le bloc de l'analyse (aucun service, aucun appel au rendu) ; la lecture par les
 *      identifiants FotMob seulement (un nom sans identifiant : « clubs inconnus ») ; le bloc n'est jamais donné à l'IA ;
 *      par clé, sans écriture, en moins de 25 ms ;
 * T-E6 les phrases, leur provenance et leur heure : ce qui manque (palier, à vérifier, tranche, fraîcheur), « calculé sur les
 *      données telles qu'elles étaient le … », le seuil selon l'ancre de l'analyse, « aucune cote de vos bookmakers relevée »,
 *      les états vides (« pas encore calculé », « en cours », « clubs inconnus », « illisible »), le pied ; les mots fixes =
 *      ceux du serveur (scellés dans banc-regles-etape38.md).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { UI, imp, interfacePrete, optionsDuRendu, ouvrirLeRendu, reglesPures } from './aides/rendu.mjs';
import { nuitFabriquee } from './aides/combinaisonNuitFabriquee.mjs';
import * as R from '../src/data/combinaison/combinaisonRead.js';
import { MOTS } from '../src/data/combinaison/reglagesCombinaison.js';

const SRC = path.join(SERVEUR, 'src');
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const sansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(new RegExp('/[*][^]*?[*]/', 'g'), '').replace(new RegExp('(^|[^:\'"`])//.*$', 'gm'), '$1');
const REGLAGES_DE_PIERRE = { football: { edgeThresholdMin: 0.02, edgeThresholdMax: 0.25, valueBookmakers: ['williamhill', 'betclic_fr', 'unibet_fr', 'winamax_fr', 'pmu_fr'], maxValueOdds: 5, kellyFraction: 0.125, maxStakePercent: 0.02, weights: { market: 1, structural: 0, exogenous: 0 } } };

let routeMemo;
function laRoute() {
  if (routeMemo) return routeMemo;
  const copie = preparerCopie({ runtime: { 'engine-config.json': REGLAGES_DE_PIERRE } });
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-combinaison-route.mjs'), { args: ['page', '{}'], timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    routeMemo = r.json;
    return routeMemo;
  } finally {
    copie.nettoyer();
  }
}

let rendu;
let Encadre;
let A;
before(async () => {
  A = await imp(path.join(UI, 'src', 'utils', 'avantDeParier.js'));
  if (!interfacePrete) return;
  rendu = await ouvrirLeRendu({ cibles: /AvantDeParierABlanc\.vue$/, heure: '2026-11-10T09:00:00.000Z' });
  Encadre = (await rendu.charger('/src/components/analysis/AvantDeParierABlanc.vue')).default;
});
after(async () => {
  await rendu?.fermer();
});
const lignesDe = (html) => [...html.matchAll(/<li[^>]*data-ligne="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()]);

test('T-E1 jamais « sûr » : ni l’étiquette ni un degré ne quittent le serveur ; rien de tel à l’écran', optionsDuRendu, async () => {
  const s = nuitFabriquee();
  for (const [nom, bloc] of Object.entries(s.lectures)) {
    const texte = JSON.stringify(bloc);
    assert.doesNotMatch(texte, /"etiquette"|"degres"|"degre"|"sur"|fragile|sûr/, `${nom} : le bloc dit une étiquette ou un degré`);
    const r = await rendu.rendre(Encadre, { combinaison: bloc, result: null });
    assert.doesNotMatch(r.texte, /\bsûre?s?\b|fragile|confiance\s*:\s*(sur|sûr)/i, `${nom} : « sûr » ou « fragile » à l’écran`);
  }
  // Les lignes rangées gardent l'étiquette (pour la preuve) : la page ne la lit jamais.
  assert.ok(s.lignes1.some((l) => l.etiquette === 'fragile') && s.lignes1.some((l) => l.etiquette === 'sur'));
  assert.doesNotMatch(sansCommentaires(path.join(SRC, 'data', 'combinaison', 'combinaisonRead.js')), /SELECT[^`]*\betiquette\b|SELECT[^`]*\bdegres\b/, 'la lecture ne sélectionne ni l’étiquette ni les degrés');
  const util = fs.readFileSync(path.join(UI, 'src', 'utils', 'avantDeParier.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(util, /sûr|etiquette|fragile/);
});

test('T-E2 ConfidenceGauge toujours null ; l’encadré n’a ni jauge ni chiffre de confiance', optionsDuRendu, async () => {
  const s = nuitFabriquee();
  const V = await imp(path.join(UI, 'src', 'utils', 'verdictParMarche.js'));
  assert.deepEqual({ ...V.CONFIANCE_NON_MESUREE }, { valeur: null, etiquette: null });
  const lu = V.verdictsParMarche({ result: { prediction: { probabilities: { home: 0.5, draw: 0.25, away: 0.25 } }, marketPredictions: [], combinaison: s.lectures.M1 }, match: { home: 'Club 1', away: 'Club 2' }, saisies: null, maintenant: Date.parse('2026-11-10T09:00:00Z') });
  for (const g of lu.groupes) for (const l of g.lignes) assert.deepEqual(l.confiance, { valeur: null, etiquette: null }, `${g.cle} : la jauge reçoit une valeur`);
  const vue = fs.readFileSync(path.join(UI, 'src', 'components', 'analysis', 'AvantDeParierABlanc.vue'), 'utf8');
  assert.doesNotMatch(vue, /ConfidenceGauge|cm-bar|<progress|<meter|width:\s*\$\{|:style/);
  const r = await rendu.rendre(Encadre, { combinaison: s.lectures.M1, result: null });
  assert.doesNotMatch(r.html, /role="progressbar"|<progress|<meter|aria-valuenow/);
  assert.equal(sha1(fs.readFileSync(path.join(UI, 'src', 'components', 'common', 'ConfidenceGauge.vue'))), '1bb8634a1200b245f9c92288e260cf6a725e9309', 'ConfidenceGauge.vue jamais retouchée');
});

test('T-E3 jamais une value sans mesure ni deux verdicts : la mention de la mise n’est pas redite ; la mise ni répétée ni contredite ; Q-B non touchée', optionsDuRendu, async () => {
  const route = laRoute();
  assert.equal(route.code, 200);
  assert.equal(route.staking.bookmaker, 'betclic_fr', 'le conseil du moteur chez Betclic (la value fabriquée)');
  assert.deepEqual(route.mise.raisons.map((x) => x.code), ['livre-francais']);
  const r = await rendu.rendre(Encadre, { combinaison: route.combinaison, result: route.result });
  const lignes = lignesDe(r.html);
  assert.ok(!lignes.some(([, t]) => /^Chez Betclic/.test(t)), 'la mention de Betclic est déjà sous la mise conseillée : pas redite');
  assert.ok(lignes.some(([c, t]) => c === 'livre-unibet_fr' && t === `Chez Unibet : ${MOTS.livreJamais}.`), JSON.stringify(lignes));
  assert.doesNotMatch(r.texte, /Mise conseillée|de votre capital|€|\bmise\b/i, 'la mise n’est pas répétée');
  assert.doesNotMatch(r.texte, /ne pariez pas|pas de pari|seuil conseillé|value\s+[\d,]+\s*%|[\d,]+\s*%\s+de value/i, 'ni contredite, ni une value chiffrée');
  assert.equal((r.texte.match(/value/gi) ?? []).length, 1, 'le seul mot « value » : le seuil mesuré');
  // Sans la mise (aucun conseil) : la mention dite pour les deux bookmakers de Pierre.
  const sans = await rendu.rendre(Encadre, { combinaison: route.combinaison, result: { mise: { conseil: false, raisons: [] }, staking: { action: 'PASS' } } });
  assert.deepEqual(lignesDe(sans.html).filter(([c]) => c.startsWith('livre-')).map(([, t]) => t), [`Chez Unibet : ${MOTS.livreJamais}.`, `Chez Betclic : ${MOTS.livreJamais}.`]);
  // Q-B sans réponse : les cotes saisies ne sont pas touchées au lot 1.
  assert.equal(sha1(fs.readFileSync(path.join(SRC, 'data', 'saisiesCotes.js'))), '1449bbbdc1fd5f08d94af42dc17a82fc728512b4', 'saisiesCotes.js : le sha1 de la partie 0 du lot 1b (= dépôt), jamais retouché');
  for (const f of ['avantDeParier.js']) assert.doesNotMatch(fs.readFileSync(path.join(UI, 'src', 'utils', f), 'utf8'), /saisie/i);
});

test('T-E4 « mesuré » seulement après un verdict : sans note « pas encore mesuré » ; avec la note, « rien ne s’ajoute aux cotes (mesuré sur 30 158 matchs, 2019-2023) »', optionsDuRendu, async () => {
  const s = nuitFabriquee();
  assert.equal(R.bancDuResultat(null), null);
  const sansNote = { ...s.lectures.M1, banc: null };
  const a = await rendu.rendre(Encadre, { combinaison: sansNote, result: null });
  assert.ok(lignesDe(a.html).some(([c, t]) => c === 'banc' && t === 'Ce que les statistiques ajoutent aux cotes sur ce marché : pas encore mesuré.'));
  assert.doesNotMatch(lignesDe(a.html).find(([c]) => c === 'banc')[1], /mesuré sur|mesuré :/);
  const b = await rendu.rendre(Encadre, { combinaison: s.lectures.M1, result: null });
  const banc = lignesDe(b.html).find(([c]) => c === 'banc')[1];
  assert.equal(banc.replace(/\s/g, ' '),'Sur ce marché, rien ne s’ajoute aux cotes (mesuré sur 30 158 matchs, 2019-2023).');
  assert.deepEqual(s.lectures.M1.banc, { variante: '1n2-stats-residuel', verdict: 'pas-prouve', lignes: 30158, fenetre: 'P2', periode: '2019-2023' });
  assert.equal(A.phraseDuBanc({ verdict: 'non-jugeable-ici' }), 'Ce que les statistiques ajoutent aux cotes sur ce marché : non jugeable ici.');
  assert.match(A.phraseDuBanc({ verdict: 'retenu', lignes: 100, periode: '2019-2023' }), /mesuré, pas dans le pourcentage\.$/);
});

test('T-E5 aucune requête de plus ; les identifiants FotMob ; jamais donné à l’IA ; par clé, sans écriture, < 25 ms', optionsDuRendu, async () => {
  const s = nuitFabriquee();
  reglesPures('avantDeParier.js');
  const vue = fs.readFileSync(path.join(UI, 'src', 'components', 'analysis', 'AvantDeParierABlanc.vue'), 'utf8');
  assert.deepEqual([...vue.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]), ['vue', '@/components/common/AppIcon.vue', '@/utils/avantDeParier.js'], 'aucun service, aucun magasin');
  const r = await rendu.rendre(Encadre, { combinaison: s.lectures.M1, result: null });
  assert.deepEqual(r.appels, [], 'aucun appel au rendu');
  const page = fs.readFileSync(path.join(UI, 'src', 'views', 'UpcomingMatchView.vue'), 'utf8');
  assert.match(page, /<MarketVerdictBoard :result="analyse\.result"[^\n]*\/>\n {12}<!-- Étape 38 : [^\n]*-->\n {12}<AvantDeParierABlanc :combinaison="analyse\.result\.combinaison \?\? null" :result="analyse\.result" \/>\n/, 'sous le tableau des verdicts, le bloc de l’analyse');
  assert.equal((page.match(/AvantDeParierABlanc/g) ?? []).length, 3, 'une seule place (l’import, le commentaire, la balise)');
  assert.doesNotMatch(page, /api\/combinaison|combinaisonApi/);
  // Les identifiants : un nom sans identifiant → « clubs inconnus », jamais rapproché.
  assert.equal(s.lectures.inconnu.etat, 'clubs-inconnus');
  assert.equal(s.lectures.inconnu.pronostic, null);
  const lecture = sansCommentaires(path.join(SRC, 'data', 'combinaison', 'combinaisonRead.js'));
  assert.doesNotMatch(lecture, /teamNamesEqual|findTeams|nameTokens|home_name|homeName|match\??\.home\b|match\??\.away\b/, 'jamais un nom');
  assert.match(lecture, /fotmob:fotmob-\$\{home\}\|fotmob-\$\{away\}\|\$\{date\}/);
  assert.doesNotMatch(lecture, /\.run\(|INSERT|UPDATE|DELETE|candidate'/);
  assert.match(lecture, /source = 'service' AND candidate_id = ''/, 'la candidate en essai n’est jamais lue par la page');
  assert.ok(s.lectureMs < 25, `${s.lectureMs} ms`);
  // Jamais donné à l'IA : le message de l'IA prend des champs nommés du moteur.
  for (const f of ['core/ai/compactContext.js', 'core/ai/matchAiAnalysisService.js', 'core/ai/autoMatchAiTrigger.js']) assert.doesNotMatch(sansCommentaires(path.join(SRC, f)), /combinaison/i, f);
  // La route : le bloc joint APRÈS l'analyse, par un import() à la demande.
  const route = laRoute();
  assert.ok(route.cles.indexOf('combinaison') > route.cles.indexOf('joueurs') && route.cles.indexOf('combinaison') < route.cles.indexOf('mise'), route.cles.join(', '));
  assert.equal(route.combinaison.etat, 'pas-encore-calcule');
  assert.deepEqual(route.combinaison.clubs, { home: 8456, away: 8650 }, 'les identifiants FotMob du match analysé');
});

test('T-E6 les phrases, leur provenance et leur heure ; les états vides ; le pied ; les mots fixes = ceux du serveur', optionsDuRendu, async () => {
  const s = nuitFabriquee();
  for (const k of ['rienNeManque', 'pied', 'seuilPinnacle', 'seuilJamais', 'livreJamais', 'rienNeSAjoute']) assert.equal(A.MOTS_DE_L_ENCADRE[k], MOTS[k], k);
  assert.equal(R.MOTS_DE_L_ENCADRE.titre, 'Avant de parier — à blanc');
  const regles = fs.readFileSync(path.join(SERVEUR, 'test', 'fixtures', 'banc-regles-etape38.md'), 'utf8');
  assert.ok(regles.replace(/\s+/g, ' ').includes(`« ${MOTS.pied} »`), 'le pied scellé dans les règles');
  const voir = async (bloc, result = null) => {
    const r = await rendu.rendre(Encadre, { combinaison: bloc, result });
    assert.match(r.html, /data-bloc="avant-de-parier"/);
    assert.match(r.texte, /^Avant de parier — à blanc Pour le pronostic du résultat \(1 \/ N \/ 2\) /);
    assert.ok(r.texte.endsWith(MOTS.pied), 'le pied');
    return Object.fromEntries(lignesDe(r.html).map(([c, t]) => [c, t.replace(/\s/g, ' ')]));
  };
  // M2 : cotes gratuites (repli), un constat rouge en vigueur, l'analyse du jour rangée la nuit suivante.
  const m2 = await voir(s.lectures.M2);
  assert.equal(m2.manque, 'Ce qui manque à ce pronostic : la cote juste ne vient ni de Pinnacle ni du palier 2 : une moyenne de repli · un constat « à vérifier » touche ce match · cotes relevées il y a 0 min.');
  assert.equal(m2.quand, 'Calculé sur les données telles qu’elles étaient le 09/11 à 15 h 00 (analyse du jour, rangé la nuit suivante).');
  assert.equal(m2.seuil, `${MOTS.seuilPinnacle} Pour ce match (moyenne de repli, sans bookmaker de référence) : aucune value n’est lue.`);
  assert.equal(m2['aucune-cote'], 'Aucune cote de vos bookmakers relevée pour ce match.');
  assert.equal(m2['livre-unibet_fr'], `Chez Unibet : ${MOTS.livreJamais}.`);
  // M1 : la case de la tranche trop haute (version 5), Pinnacle relevé avant cette révision.
  const m1 = await voir(s.lectures.M1);
  assert.equal(m1.manque, 'Ce qui manque à ce pronostic : dans cette tranche, ce moteur a annoncé trop haut · cotes relevées il y a 5 min.');
  assert.equal(m1.quand, 'Calculé sur les données telles qu’elles étaient le 10/11 à 16 h 00 (analyse du jour, rangé la nuit suivante).');
  // M6 : rien ne manque (la fraîcheur en explication) ; Pinnacle : la même cote juste que la mesure (jamais « mesuré » pour le
  // bookmaker : la mise conseillée le dit pour un bookmaker français) ; vos bookmakers relevés (Unibet).
  const m6 = await voir(s.lectures.M6);
  assert.equal(m6.manque, `${MOTS.rienNeManque} Cotes relevées il y a 3 h.`);
  assert.equal(m6.quand, 'Calculé sur les données telles qu’elles étaient le 10/11 à 01 h 30 (pronostic de la nuit).');
  assert.equal(m6.seuil, `${MOTS.seuilPinnacle} Pour ce match (cote juste Pinnacle) : la même cote juste que la mesure.`);
  // La route (une value chez Betclic, cote juste Pinnacle) : l'encadré ne dit pas « mesuré » pour le bookmaker de la mise.
  const route = await rendu.rendre(Encadre, { combinaison: laRoute().combinaison, result: laRoute().result });
  assert.doesNotMatch(route.texte, /c’est le cas mesuré|mesuré chez Betclic|Betclic : mesuré/);
  assert.equal(m6['aucune-cote'], undefined);
  // M3 : aucune cote.
  const m3 = await voir(s.lectures.M3);
  assert.equal(m3.manque, 'Ce qui manque à ce pronostic : aucune cote : le pourcentage vient des seules statistiques.');
  assert.equal(m3.seuil, `${MOTS.seuilPinnacle} Pour ce match (aucune cote) : aucune value n’est lue.`);
  // La provenance et l'heure de chaque manque viennent de la ligne rangée.
  const a = s.lectures.M2.pronostic.manques.find((m) => m.code === 'A');
  assert.deepEqual([a.source, a.heure], ['cotes gratuites', '2026-11-09T14:00:00.000Z']);
  const e = s.lectures.M2.pronostic.manques.find((m) => m.code === 'E');
  assert.deepEqual([e.source, e.heure], ['contrôle du jour', '2026-11-09T01:00:00.000Z']);
  // Les états vides : l'encadré garde son titre, le seuil, vos bookmakers et le pied.
  const avant = await voir(s.lectureAvant);
  assert.equal(avant.manque, 'Ce qui manque à ce pronostic : pas encore calculé, la première passe de nuit le fera.');
  assert.ok(avant.seuil && avant.banc);
  const enCours = await voir(s.lectureEnCours);
  assert.equal(enCours.manque, 'Ce qui manque à ce pronostic : en cours de calcul cette nuit, revenez après la passe.');
  const inconnu = await voir(s.lectures.inconnu);
  assert.equal(inconnu.manque, 'Ce qui manque à ce pronostic : ce match n’a pas ses deux identifiants FotMob, rien n’est gardé à blanc pour lui.');
  const illisible = await voir(s.lectures.illisible);
  assert.equal(illisible.manque, 'Ce qui manque à ce pronostic : lecture impossible pour l’instant (l’analyse n’en dépend pas).');
  const r = await rendu.rendre(Encadre, { combinaison: null, result: null });
  assert.match(r.texte, /lecture impossible pour l’instant/);
  assert.ok(r.texte.endsWith(MOTS.pied));
});
