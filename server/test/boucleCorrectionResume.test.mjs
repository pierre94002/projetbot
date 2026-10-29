/**
 * La boucle de correction (étape 26 du plan, partie D, 28/10/2026) — LE RÉSUMÉ DU MOIS EN MOTS (conception §8 corrigée,
 * test 7 du §11.1).
 *   node --test test/boucleCorrectionResume.test.mjs        (depuis server/)
 *
 *  1. Les règles pures, dans le processus du test (aucune base, aucun Claude) : la décision « faut-il l'écrire ? » (le
 *     dernier mois trié seulement, une fois, l'interrupteur, trois essais), la fiche chiffrée sans token (ce qu'elle dit,
 *     dans quel ordre, le journal depuis le dernier résumé, le mode économe qui la compacte), « rien à dire » sans appel
 *     (constat 13), la demande (consignes fixes, fiche, schéma, rappel après un refus), la lecture de la réponse et la
 *     garde des chiffres sur des champs NOMMÉS.
 *  2. Le service, dans des copies isolées (test/aides/script-boucle-resume.mjs : Claude REMPLACÉ, jamais appelé ; des
 *     tris fabriqués rangés par le dépôt de la boucle) : un résumé par mois en un appel, rangé avec son entrée au
 *     journal, compté DANS le plafond des 150 (décision 12) et d'accord avec le journal des appels, le rattrapage du
 *     dernier mois seulement, la fiche vide rangée sans appel, le mode économe ; les échecs (aucun appel quand Claude
 *     n'est pas là, essais notés, abandon au troisième) ; l'étape de la passe ; ce que lit l'écran.
 *  Bugs volontaires visés : B26 (le résumé hors du plafond), B27 (garde des chiffres sautée), B28 (écrit deux fois),
 *  B29 (type d'appel « autre ») et D1-D4 (fiche vide qui appelle, rattrapage d'un mois ancien, interrupteur ignoré,
 *  essais sans fin).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';

const imp = (rel) => import(pathToFileURL(path.join(SERVEUR, 'src', rel)).href);
const F = await imp('data/correction/ficheDuMois.js');
const P = await imp('core/ai/resumeDuMoisPrompt.js');
const G = await imp('core/ai/gardeDesChiffres.js');
const R = await imp('data/correction/regles.js');
const LEDGER = await imp('data/repositories/claudeUsageLedger.js');
const SRC = path.join(SERVEUR, 'src');
const lireSrc = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
/** Les nombres français ont des espaces insécables (milliers) : ramenées à une espace simple pour comparer. */
const INSECABLES = new RegExp(`[${String.fromCharCode(0xa0, 0x2009, 0x202f)}]`, 'g');
const espaces = (t) => String(t).replace(INSECABLES, ' ');

// ------------------------------------------------------------------ des tris fabriqués (règles pures)
const JUGEES = { 'totalCorners|niveau': { statut: 'vrai-defaut', ecart: -0.0312 }, 'result|niveau': { statut: 'petit-ecart', ecart: 0.012 }, 'teamShots|confiance': { statut: 'a-surveiller', ecart: -0.025 }, 'totalShots|niveau': { statut: 'dans-la-marge', ecart: 0.004 } };
function triPur(mois = '2026-12', { jugees = JUGEES, enEssai = true } = {}) {
  const cases = R.CASES_DU_TRI.map((cas) => {
    const [famille, mesure] = cas.split('|');
    const j = jugees[cas] ?? null;
    const statut = j ? j.statut : enEssai && R.estDeButs(famille) ? 'en-essai' : 'trop-tot';
    return {
      cas,
      famille,
      mesure,
      statut,
      sensDit: j ? (j.ecart < 0 ? 'annonce trop haut' : 'annonce trop bas') : null,
      fenetre: j ? { mois: ['2026-11', mois], matchs: 2840, ecart: j.ecart } : null,
      levier: j?.statut === 'vrai-defaut' ? { code: true, phrase: R.DEMANDES_DU_CODE.statistiques } : null
    };
  });
  return {
    mois,
    version: 1,
    calculeLe: '2027-01-01T06:10:00.000Z',
    lignee: { versionEnService: 7, versions: [7, 8], couverture: { partiel: false } },
    resume: { pronostics: 41234, lignes: 61200, matchs: 1420, ecartees: [{ libelle: 'Calculé par une autre version du moteur', n: 1234 }], enEssai: enEssai ? { candidate: 'modele-buts-v1', etape: '27' } : null },
    cases
  };
}
const ETAT = { propositions: [], place: { phrase: 'Place de l’essai à blanc : libre.' }, essais: { phrase: '2 corrections déjà essayées : chacune élargit la marge du juge.' }, formulaire: { ouvert: true } };

// ============================================================ 1. les règles pures

test('décision : le DERNIER mois trié seulement, une fois par mois — pas de tri, à faire, déjà écrit, rangé sans appel, interrupteur coupé, trois essais puis abandon, illisible (dû : l’étape le dit) ; un résumé rangé se montre même l’interrupteur coupé', () => {
  const tri = { mois: '2026-12', version: 1, calculeLe: '2027-01-01T06:10:00.000Z' };
  const d = (x) => F.decisionDuResume(x);
  assert.deepEqual([d({}).code, d({}).du], ['pas-de-tri', false]);
  assert.match(d({}).phrase, /^Pas encore de résumé : le premier tri se fait le 1er du mois à partir de 6 h/);
  const aFaire = d({ dernierTri: tri });
  assert.deepEqual([aFaire.code, aFaire.du, aFaire.mois, aFaire.version, aFaire.essais, aFaire.essaisMax], ['a-faire', true, '2026-12', 1, 0, 3]);
  assert.equal(aFaire.phrase, 'Pas encore écrit : le tri de décembre 2026 est fait, le résumé suit à la prochaine passe d’actualisation.');
  const ecrit = d({ dernierTri: tri, resume: { mois: '2026-12', version: 1, ecritLe: '2027-01-01T06:12:00.000Z', texte: { titre: 'Décembre', phrases: ['Une phrase.'] }, garde: { nombresVus: 4 }, usage: { total: 4321 }, essai: 1, modele: 'claude-code:sonnet' } });
  assert.deepEqual([ecrit.code, ecrit.du, ecrit.resume.titre, ecrit.resume.phrases, ecrit.resume.nombresVus, ecrit.resume.tokens], ['deja-fait', false, 'Décembre', ['Une phrase.'], 4, 4321]);
  assert.match(ecrit.phrase, /^Écrit par Claude \(Sonnet\) le 01\/01\/2027 à 07 h 12 — chiffres vérifiés\.$/);
  const sansAppel = d({ dernierTri: tri, resume: { mois: '2026-12', version: 1, ecritLe: '2027-01-01T06:12:00.000Z', texte: null, sansAppel: true, raison: 'Rien à commenter pour décembre 2026 : …' } });
  assert.deepEqual([sansAppel.code, sansAppel.du, sansAppel.phrase], ['sans-appel', false, 'Rien à commenter pour décembre 2026 : …']);
  const coupe = d({ dernierTri: tri, interrupteur: false });
  assert.deepEqual([coupe.code, coupe.du, coupe.phrase], ['interrupteur', false, 'Les analyses IA automatiques sont coupées : pas de résumé du mois.']);
  assert.equal(d({ dernierTri: tri, interrupteur: false, resume: { mois: '2026-12', version: 1, ecritLe: '2027-01-01T06:12:00.000Z', texte: { titre: 'x', phrases: ['y'] } } }).code, 'deja-fait', 'un résumé rangé se montre l’interrupteur coupé');
  const unEssai = d({ dernierTri: tri, essais: [{ type: 'chiffres', raison: 'chiffres absents de la fiche : 4321,7' }] });
  assert.deepEqual([unEssai.code, unEssai.du, unEssai.essais], ['a-faire', true, 1]);
  assert.match(unEssai.phrase, /^Pas encore écrit : 1 essai raté \(dernier : chiffres absents de la fiche : 4321,7\) ; nouvel essai à la prochaine passe d’actualisation \(3 au plus\)\.$/);
  const trois = d({ dernierTri: tri, essais: ['panne', 'chiffres', 'forme'].map((type) => ({ type, raison: `${type} simulée` })) });
  assert.deepEqual([trois.code, trois.du], ['essais-epuises', false]);
  assert.equal(trois.phrase, 'Abandonné pour ce mois : 3 essais ratés (dernier : forme simulée).');
  const illisible = d({ illisible: 'no such table: correction_resumes' });
  assert.deepEqual([illisible.code, illisible.du], ['illisible', true]);
  assert.equal(F.ESSAIS_MAX_DU_RESUME, 3);
});

test('fiche : le tri (version jugée, comptes, les 22 cases par statut, les cases JUGÉES hors malchance du plus grave au moins grave, les pas encore jugées regroupées), le journal depuis le dernier résumé, les propositions, la place, les corrections essayées, la calibration — nombres à la française', () => {
  const journal = [
    { n: 1, le: '2026-12-01T06:10:00.000Z', evenement: 'tri', phrase: 'Tri de novembre 2026 figé.' },
    { n: 2, le: '2026-12-01T06:10:01.000Z', evenement: 'resume-ecrit', phrase: 'Résumé de novembre écrit.' },
    { n: 3, le: '2026-12-05T10:00:00.000Z', evenement: 'refusee', phrase: 'Refusée par vous.' },
    { n: 4, le: '2027-01-01T06:10:00.000Z', evenement: 'tri', phrase: 'Tri de décembre 2026 figé.' }
  ];
  const f = F.construireLaFicheDuMois({ tri: triPur(), journal, depuis: '2026-12-01T06:10:01.000Z', etat: ETAT, calibration: { annonce: 0.737, realise: 0.709, ecart: -0.028, verdict: 'trop-haut', pronostics: 20431, matchs: 1396 } });
  assert.equal(f.moisDit, 'décembre 2026');
  assert.equal(f.deMois, 'de décembre 2026');
  assert.equal(f.jugees, 4, 'jugées : vrai défaut, à surveiller, petit écart, malchance');
  assert.equal(f.malchance, 1);
  assert.deepEqual(f.cases.map((c) => [c.famille, c.statutDit.split(' :')[0]]), [['Corners du match', 'vrai défaut'], ['Tirs d’une équipe', 'à surveiller'], ['Résultat (1N2)', 'écart réel mais petit (moins de 2 points)']]);
  assert.equal(espaces(f.cases[0].ecart), `${String.fromCharCode(0x2212)}3,1 points`);
  assert.equal(espaces(f.cases[0].matchs), '2 840');
  assert.deepEqual(f.cases[0].mois, ['novembre 2026', 'décembre 2026']);
  assert.match(f.cases[0].propose, /^demande du code : la loi des corners et des tirs/);
  assert.deepEqual(f.statuts.map((x) => [x.code, x.n]), [['vrai-defaut', 1], ['a-surveiller', 1], ['petit-ecart', 1], ['dans-la-marge', 1], ['trop-tot', 10], ['en-essai', 8]]);
  assert.deepEqual(f.pasEncoreJugees.map((g) => [g.statut, g.cases]), [['en-essai', 8], ['trop-tot', 10]]);
  assert.match(f.lignee, /^version n° 7 du moteur, avec la n° 8 : mêmes pronostics ; en service tout le mois$/);
  // Le journal depuis le dernier résumé : le tri et le résumé ne sont pas des nouvelles ; la refus en est une.
  assert.deepEqual([f.journal.compte, f.journal.parEvenement.map((e) => [e.evenement, e.n])], [1, [['refusee', 1]]]);
  assert.deepEqual(f.journal.evenements, [{ jour: '05/12/2026', dit: 'refusée par vous', phrase: 'Refusée par vous' }]);
  assert.equal(f.journal.depuisDit, '01/12/2026 à 07 h 10');
  assert.deepEqual([f.place, f.essais, f.formulaire], [ETAT.place.phrase, ETAT.essais.phrase, null]);
  assert.deepEqual(f.calibration, { pronostics: 20431, matchs: 1396, annonce: '73,7 %', realise: '70,9 %', ecart: `${String.fromCharCode(0x2212)}2,8 points`, verdict: 'annonce trop haut (au-delà du hasard)' });
  assert.equal(F.ficheDuMoisVide(f), false);
  // Le texte que lit l'IA : tout ce qui précède, et rien du jargon (constat 14).
  const texte = espaces(P.rendreLaFicheDuMois(f));
  for (const morceau of ['FICHE DU MOIS — boucle de correction du moteur, décembre 2026 · mode normal', 'Tri de décembre 2026 fait le 01/01/2027 à 07 h 10', '41 234 pronostics comptés, 61 200 issues mesurées sur 1 420 matchs', 'Calculé par une autre version du moteur : 1 234', '22 cases × 12 mois : la marge du hasard en tient compte', '| Corners du match | niveau (« plus de corners que la ligne ») | vrai défaut : à corriger | annonce trop haut |', 'Pas encore jugé (en essai) : Total buts (niveau et confiance)', 'Familles en essai : la candidate « modele-buts-v1 » (étape 27)', 'Journal de la boucle depuis le dernier résumé (le 01/12/2026 à 07 h 10)', '1 événement : 1 « refusée par vous »', '- 05/12/2026 · refusée par vous : Refusée par vous.', 'Place de l’essai à blanc : libre.', '2 corrections déjà essayées : chacune élargit la marge du juge.', '20 431 pronostics réglés sur 1 396 matchs : annoncé 73,7 %, réalisé 70,9 %']) {
    assert.ok(texte.includes(morceau), `fiche, manque : ${morceau}`);
  }
  assert.doesNotMatch(texte, /lign[ée]e|variante|regards|\bK\b|levier/i, 'aucun mot du jargon dans la fiche');
});

test('fiche : le mode économe la COMPACTE (6 cases, 3 propositions, 5 entrées du journal au plus) sans retirer une rubrique ; le journal part du 1er du mois (Paris) sans résumé d’avant', () => {
  const beaucoup = Object.fromEntries(R.CASES_DU_TRI.filter((c) => !R.estDeButs(c.split('|')[0])).map((c, k) => [c, { statut: k % 3 ? 'petit-ecart' : 'a-surveiller', ecart: -0.011 - k / 1000 }]));
  const journal = Array.from({ length: 9 }, (_, i) => ({ n: i + 1, le: `2026-12-${String(2 + i).padStart(2, '0')}T10:00:00.000Z`, evenement: i % 2 ? 'acceptee' : 'bancee', phrase: `Événement ${i + 1}.` }));
  const props = Array.from({ length: 5 }, (_, i) => ({ id: `c26-p${i}`, etat: 'bancee', aDecider: true, libelle: 'Corrélation des petits scores', avantDit: '−0,05', apresDit: '−0,02', etatDit: 'à décider', sourceDite: 'proposée par vous', banc: { verdict: 'retenu', gainPct: 1.2, matchs: 812 } }));
  const normal = F.construireLaFicheDuMois({ tri: triPur('2026-12', { jugees: beaucoup, enEssai: false }), journal, etat: { ...ETAT, propositions: props } });
  const econome = F.construireLaFicheDuMois({ tri: triPur('2026-12', { jugees: beaucoup, enEssai: false }), journal, etat: { ...ETAT, propositions: props }, econome: true });
  assert.deepEqual([normal.cases.length, normal.propositions.length, normal.journal.evenements.length], [14, 5, 9]);
  assert.deepEqual([econome.cases.length, econome.propositions.length, econome.journal.evenements.length, econome.journal.nonListes], [6, 3, 5, 4]);
  assert.deepEqual(Object.keys(econome).sort(), Object.keys(normal).sort(), 'jamais une rubrique de moins');
  assert.equal(econome.mode, 'econome');
  assert.ok(P.rendreLaFicheDuMois(econome).length < P.rendreLaFicheDuMois(normal).length);
  assert.match(espaces(econome.propositions[0].banc), /^banc d’essai \(2019-2023, indicatif\) : retenu, 1,2 % d’erreur de prévision en moins sur 812 matchs$/);
  // Le début du journal raconté : le 1er du mois à 00 h, heure de Paris (heure d'hiver et d'été).
  assert.equal(F.debutDuMoisParis('2026-11'), '2026-10-31T23:00:00.000Z');
  assert.equal(F.debutDuMoisParis('2026-10'), '2026-09-30T22:00:00.000Z');
  assert.equal(F.debutDuJournalDuResume({ mois: '2026-11', dernierResumeLe: '2026-11-01T06:12:00.000Z' }), '2026-11-01T06:12:00.000Z');
  assert.equal(F.debutDuJournalDuResume({ mois: '2026-11' }), '2026-10-31T23:00:00.000Z');
});

test('rien à dire (constat 13) : aucune case jugée ET rien d’autre que le tri au journal → fiche vide, rangée sans appel ; une case jugée ou un événement suffit à appeler', () => {
  const rien = triPur('2026-10', { jugees: {}, enEssai: true });
  const tri = { n: 1, le: '2026-11-01T06:10:00.000Z', evenement: 'tri', phrase: 'Tri d’octobre 2026 figé.' };
  const vide = F.construireLaFicheDuMois({ tri: rien, journal: [tri] });
  assert.equal(F.ficheDuMoisVide(vide), true);
  assert.equal(F.raisonSansAppel(vide), 'Rien à commenter pour octobre 2026 : aucune case n’est encore jugée (8 en essai, 14 trop tôt) et le journal de la boucle n’a que le tri du mois. Résumé rangé sans appel à Claude, 0 token.');
  assert.equal(F.ficheDuMoisVide(F.construireLaFicheDuMois({ tri: rien, journal: [tri, { n: 2, le: '2026-11-01T06:10:01.000Z', evenement: 'resume-ecrit', phrase: 'x' }] })), true, 'un résumé n’est pas une nouvelle');
  assert.equal(F.ficheDuMoisVide(F.construireLaFicheDuMois({ tri: rien, journal: [tri, { n: 2, le: '2026-11-01T06:11:00.000Z', evenement: 'proposee', phrase: 'Proposée par vous.' }] })), false, 'un événement : un appel');
  assert.equal(F.ficheDuMoisVide(F.construireLaFicheDuMois({ tri: triPur('2026-10', { jugees: { 'result|niveau': { statut: 'dans-la-marge', ecart: 0.001 } } }), journal: [tri] })), false, 'une case jugée (même malchance) : un appel');
});

test('demande : consignes FIXES (aucun mot du mois), la fiche, le schéma { titre, phrases } ; après un refus pour chiffres, le rappel vient APRÈS la fiche (les nombres permis restent ceux de la fiche)', () => {
  const f1 = F.construireLaFicheDuMois({ tri: triPur('2026-12'), journal: [], etat: ETAT });
  const f2 = F.construireLaFicheDuMois({ tri: triPur('2027-01'), journal: [], etat: ETAT });
  const d1 = P.demandeDuResume(f1);
  const d2 = P.demandeDuResume(f2, { apresUnRefus: true });
  assert.equal(d1.system, d2.system, 'les consignes ne changent pas d’un mois à l’autre');
  assert.doesNotMatch(d1.system, /\d{4}|décembre|janvier/, 'aucun mot propre au mois dans les consignes');
  for (const mot of ['malchance', 'vrai défaut', 'les compositions', 'Pierre adopte', 'aucun pari']) assert.ok(d1.system.includes(mot), `consignes, manque : ${mot}`);
  assert.equal(d1.userMessage, d1.ficheTexte);
  assert.ok(d2.userMessage.startsWith(d2.ficheTexte) && d2.userMessage.includes('RAPPEL') && !d2.ficheTexte.includes('RAPPEL'));
  assert.deepEqual(d1.jsonSchema.required, ['titre', 'phrases']);
  assert.deepEqual(Object.keys(d1.jsonSchema.properties), ['titre', 'phrases']);
  assert.equal(d1.jsonSchema.additionalProperties, false);
});

test('réponse : la forme contrôlée (titre et phrases, au plus 6, coupées proprement, balises retirées) ; la garde des chiffres sur des champs NOMMÉS (titre, phrase1…) — un nombre absent de la fiche refuse le texte et dit où', () => {
  assert.throws(() => P.lireLeResume(null), P.ResumeInvalide);
  assert.throws(() => P.lireLeResume({ titre: '', phrases: ['a'] }), /titre/);
  assert.throws(() => P.lireLeResume({ titre: 'T', phrases: 'a' }), /phrases/);
  assert.throws(() => P.lireLeResume({ titre: 'T', phrases: ['', '  '] }), /aucune phrase/);
  const lu = P.lireLeResume({ titre: '<b>Décembre</b>', phrases: ['Un.', 'Deux.', 'Trois.', 'Quatre.', 'Cinq.', 'Six.', 'Sept.'] });
  assert.deepEqual([lu.titre, lu.phrases.length], ['Décembre', 6]);
  assert.ok(P.lireLeResume({ titre: 'T', phrases: ['x'.repeat(400)] }).phrases[0].length <= P.LONGUEURS.phrase);
  assert.deepEqual(P.champsDuResume({ titre: 'T', phrases: ['a', 'b'] }), { titre: 'T', phrase1: 'a', phrase2: 'b' });
  const fiche = P.demandeDuResume(F.construireLaFicheDuMois({ tri: triPur(), journal: [], etat: ETAT })).ficheTexte;
  const bon = G.verifierLesChiffres({ textes: P.champsDuResume({ titre: 'Décembre 2026 : 1 vrai défaut', phrases: ['Les corners annoncent trop haut de 3,1 points sur 2 840 matchs.', 'Le 1N2 garde un petit écart de 1,2 point.'] }), fiche });
  assert.equal(bon.ok, true, JSON.stringify(bon.refuses));
  const mauvais = G.verifierLesChiffres({ textes: P.champsDuResume({ titre: 'Décembre 2026', phrases: ['Les corners annoncent trop haut.', 'Un écart de 4321,7 points.'] }), fiche });
  assert.equal(mauvais.ok, false);
  assert.deepEqual(mauvais.refuses.map((x) => [x.nombre, x.champ]), [['4321,7', 'phrase2']]);
});

test('le type « resume-mois » : au journal des appels (après le bilan de la semaine) ET parmi les appels automatiques comptés sur le plafond (décision 12) ; Sonnet, effort bas, comme le bulletin ; le plafond (dailyLimit) n’est nommé nulle part pour être changé', () => {
  assert.deepEqual(Object.keys(LEDGER.TYPES_APPEL), ['avance', 'coup-d-envoi', 'reprise', 'revue', 'bulletin', 'bilan-semaine', 'resume-mois', 'manuel', 'autre']);
  assert.equal(LEDGER.TYPES_APPEL['resume-mois'], 'Résumé du mois (boucle de correction)');
  assert.ok(LEDGER.TYPES_AUTOMATIQUES.includes('resume-mois'));
  const service = lireSrc('core/ai/resumeDuMois.js');
  assert.match(service, /export const REGLAGES_DE_L_IA = Object\.freeze\(\{ model: 'sonnet', effort: 'low' \}\);/);
  assert.match(lireSrc('core/ai/bulletinService.js'), /export const REGLAGES_DE_L_IA = Object\.freeze\(\{ model: 'sonnet', effort: 'low' \}\);/);
  assert.match(service, /enregistrerUsage\(jour, \{ resumeMois: 1 \}\)/);
  assert.match(service, /appel: \{ type: TYPE_D_APPEL, detail: `résumé \$\{leMois\}`, mode: mode\.mode \?\? 'normal', taille \}/);
  assert.match(service, /export const TYPE_D_APPEL = 'resume-mois';/);
  for (const f of ['core/ai/resumeDuMois.js', 'core/ai/resumeDuMoisPrompt.js', 'data/correction/ficheDuMois.js']) assert.doesNotMatch(lireSrc(f), /dailyLimit\s*=|anthropicClient|api\.anthropic/, f);
  assert.match(lireSrc('data/repositories/autoAiAnalysisRepository.js'), /count: etat\.count \+ preMatch \+ postMatch \+ bulletin \+ bilanSemaine \+ resumeMois,/);
});

// ============================================================ 2. le service, dans des copies isolées

const script = path.join(SERVEUR, 'test', 'aides', 'script-boucle-resume.mjs');
function lancer(phase) {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, script, { args: [phase], maintenant: '2026-11-01T07:00:00.000Z', timeout: 300_000, env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' } });
    assert.equal(r.code, 0, `${phase} a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-1500)}`);
    assert.ok(r.json?.ok, `${phase} : sortie illisible\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false, `${phase} : un appel réseau a été tenté`);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}
const uneFois = (fabrique) => {
  let v;
  return () => (v ??= fabrique());
};
const phase = { service: uneFois(() => lancer('service')), echecs: uneFois(() => lancer('echecs')), etape: uneFois(() => lancer('etape')), etat: uneFois(() => lancer('etat')), ecriture: uneFois(() => lancer('ecriture')) };

test('service : un résumé par mois, en UN appel (type « resume-mois », Sonnet, effort bas, aucun outil), rangé avec son entrée « résumé du mois écrit » au journal de la boucle, la fiche gardée avec lui ; le second passage n’appelle pas (B28)', () => {
  const s = phase.service();
  assert.equal(s.avantTout.code, 'pas-de-tri');
  assert.deepEqual([s.decision.code, s.decision.du, s.decision.mois], ['a-faire', true, '2026-10']);
  assert.deepEqual([s.premier.statut, s.premier.code, s.premier.fait, s.premier.appelFait, s.premier.essai, s.premier.mode, s.premier.tokens], ['ok', 'ecrit', true, true, 1, 'normal', 4000]);
  assert.match(espaces(s.premier.resume), /^Résumé d’octobre 2026 écrit en un seul appel à Claude Code \(4 000 tokens, mode normal\) : 3 phrases, \d+ nombres cités, tous dans la fiche\. Il se lit dans Santé du moteur\.$/);
  assert.equal(s.appelsApresLePremier.length, 1);
  const a = s.appelsApresLePremier[0];
  assert.deepEqual([a.type, a.detail, a.mode, a.model, a.effort, a.tools, a.aRappel], ['resume-mois', 'résumé d’octobre 2026', 'normal', 'sonnet', 'low', '', false]);
  assert.ok(a.taille.consignes > 500 && a.taille.message > 500);
  assert.deepEqual(s.schema.required, ['titre', 'phrases']);
  assert.ok(espaces(s.ficheEnvoyee).includes('| Corners du match |'), 'la fiche envoyée porte les écarts jugés');
  const r = s.resumesOctobre;
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].version, r[0].sansAppel, r[0].essai, r[0].modele, r[0].mode, r[0].tokens], [1, false, 1, 'claude-code:sonnet', 'normal', 4000]);
  assert.match(r[0].titre, /^Le mois en mots : /);
  assert.equal(r[0].phrases.length, 3);
  assert.equal(r[0].garde.politique, 'refuser');
  assert.ok(r[0].garde.nombresVus >= 4);
  assert.match(r[0].ficheDebut, /^FICHE DU MOIS/);
  assert.deepEqual([s.journalApres[0].evenement, s.journalApres[0].source], ['resume-ecrit', 'nuit']);
  assert.equal(s.journalApres[0].phrase, 'Résumé d’octobre 2026 écrit par Claude (Sonnet) : 3 phrases, chiffres vérifiés.');
  assert.deepEqual(s.journalApres[0].details, { mois: '2026-10', version: 1, sansAppel: false, essai: 1, modele: 'claude-code:sonnet' });
  // Une fois par mois : ni une heure ni un jour plus tard, aucun appel (B28).
  assert.deepEqual([s.second.code, s.second.appelFait, s.troisieme.code], ['deja-fait', false, 'deja-fait']);
  assert.equal(s.appelsApresLeSecond, 1);
  assert.equal(s.decisionApres.code, 'deja-fait');
  assert.equal(s.resumesOctobreApres, 1);
});

test('service : le résumé compte DANS le plafond des 150 (décision 12) — le compteur du jour passe à 1 (resumeMois), le journal des appels note « resume-mois », la carte du budget les dit d’accord ; le plafond lui-même ne change jamais (B26, B29)', () => {
  const s = phase.service();
  assert.equal(s.compteurAvant.count, 0);
  assert.deepEqual([s.compteur.count, s.compteur.resumeMois, s.compteur.preMatch, s.compteur.bulletin], [1, 1, 0, 0]);
  assert.deepEqual(s.journalClaude.map((l) => [l.type, l.statut, l.modele, l.mode, l.tokens]), [['resume-mois', 'ok', 'claude-code:sonnet', 'normal', 4000]]);
  assert.deepEqual([s.budget.coherence.compteur, s.budget.coherence.journalAutomatiques, s.budget.coherence.egal], [1, 1, true]);
  assert.equal(s.budget.plafond.resumeMois, 1);
  assert.deepEqual([s.budget.resumeMois.libelle, s.budget.resumeMois.automatique, s.budget.resumeMois.aujourdhui.appels], ['Résumé du mois (boucle de correction)', true, 1]);
  assert.ok(s.budget.types.includes('resume-mois'));
  assert.deepEqual([s.plafondAuDepart, s.plafondApres], [150, 150]);
});

test('service : rattrapage du DERNIER mois trié seulement (décembre, jamais novembre) ; une fiche vide rangée sans appel, 0 token, même sans Claude ; le mode économe compacte la fiche (D1, D2)', () => {
  const s = phase.service();
  assert.deepEqual([s.decisionRattrapage.mois, s.rattrapage.code, s.rattrapage.mois], ['2026-12', 'ecrit', '2026-12']);
  assert.equal(s.appelsRattrapage, 2);
  assert.equal(s.resumesNovembre, 0, 'le mois manqué n’a pas de résumé');
  assert.deepEqual(s.resumesDecembre, [{ mois: '2026-12', sansAppel: false, essai: 1 }]);
  assert.ok(s.ficheRattrapage.startsWith('FICHE DU MOIS — boucle de correction du moteur, décembre 2026'));
  assert.ok(s.ficheRattrapage.includes('depuis le dernier résumé'), 'le journal part du résumé d’octobre');
  // La fiche vide.
  assert.deepEqual([s.vide.statut, s.vide.code, s.vide.fait, s.vide.appelFait, s.vide.appels], ['ok', 'ecrit-sans-appel', true, false, 0]);
  assert.equal(s.vide.resume, 'Rien à commenter pour janvier 2027 : aucune case n’est encore jugée (8 en essai, 14 trop tôt) et le journal de la boucle n’a que le tri du mois. Résumé rangé sans appel à Claude, 0 token.');
  assert.deepEqual(s.vide.resumes.map((x) => [x.sansAppel, x.essai, x.titre, x.modele, x.tokens]), [[true, 0, null, null, null]]);
  assert.equal(s.vide.resumes[0].raison, s.vide.resume);
  assert.deepEqual([s.vide.journal[0].evenement, s.vide.journal[0].details.sansAppel], ['resume-ecrit', true]);
  assert.equal(s.vide.decision.code, 'sans-appel');
  // Le mode économe.
  assert.deepEqual([s.econome.code, s.econome.mode, s.econome.modeDeLAppel], ['ecrit', 'econome', 'econome']);
  assert.ok(s.econome.casesJugees > 6);
  assert.equal(s.econome.lignesDeCases, 6, 'six cases au plus dans la fiche économe');
  assert.deepEqual(s.econome.resume, ['econome']);
});

test('échecs : sans Claude (non configuré), avec une panne vue dans la passe, l’interrupteur coupé ou le plafond atteint — aucun appel, aucun essai noté (D3)', () => {
  const s = phase.echecs();
  assert.deepEqual([s.nonConfigure.statut, s.nonConfigure.code, s.nonConfigure.appelFait], ['warn', 'non-configure', false]);
  assert.deepEqual([s.panneDeLaPasse.statut, s.panneDeLaPasse.code], ['warn', 'panne-en-cours']);
  assert.match(s.panneDeLaPasse.resume, /repoussé à la passe suivante, aucun appel\.$/);
  assert.deepEqual([s.interrupteur.statut, s.interrupteur.code], ['ok', 'interrupteur']);
  assert.equal(s.decisionInterrupteur.du, false);
  assert.equal(s.appelsSansEssai, 0);
  assert.deepEqual(s.essaisSansAppel, []);
  assert.deepEqual([s.plafond.code, s.plafond.appels, s.plafond.essais, s.plafond.compteur.count], ['plafond', 0, 0, 150]);
  assert.match(espaces(s.plafond.resume), /^Plafond quotidien \(150\) atteint : le résumé d’octobre 2026 attend, reprise demain\.$/);
});

test('échecs : une panne, des chiffres refusés (rien d’affiché), une forme non respectée — chaque essai noté, le rappel des chiffres au troisième, l’abandon ensuite sans appel ; les appels réussis comptent sur le plafond, d’accord avec le journal (B27, D4)', () => {
  const s = phase.echecs();
  assert.deepEqual([s.essai1.statut, s.essai1.code, s.essai1.essai], ['error', 'panne', 1]);
  assert.deepEqual([s.decisionApres1.code, s.decisionApres1.essais], ['a-faire', 1]);
  assert.deepEqual([s.essai2.statut, s.essai2.code, s.essai2.essai], ['warn', 'chiffres-refuses', 2]);
  assert.match(s.essai2.resume, /^Texte refusé : il citait 4321,7, absent\(s\) de la fiche\. Rien n’est affiché ; essai 2 sur 3/);
  assert.deepEqual([s.essai3.statut, s.essai3.code, s.essai3.essai], ['warn', 'forme', 3]);
  assert.deepEqual(s.issues, ['panne', 'chiffres', 'forme']);
  assert.deepEqual(s.rappels, [false, false, true], 'le rappel des chiffres après le refus pour chiffres');
  assert.deepEqual(s.essais.map((e) => e.type), ['panne', 'chiffres', 'forme']);
  assert.match(s.essais[1].raison, /^chiffres absents de la fiche : 4321,7$/);
  assert.equal(s.resumesApresEchecs, 0, 'rien d’écrit');
  assert.equal(s.decisionAbandon.code, 'essais-epuises');
  assert.deepEqual([s.abandon.code, s.abandon.appels], ['essais-epuises', 0]);
  assert.deepEqual([s.compteur.count, s.compteur.resumeMois], [2, 2], 'les deux appels réussis (chiffres, forme), pas la panne');
  assert.deepEqual(s.journalClaude.map((l) => [l.type, l.statut]), [['resume-mois', 'echec'], ['resume-mois', 'ok'], ['resume-mois', 'ok']]);
  assert.equal(s.coherence.egal, true);
  assert.equal(s.plafondApres, 150);
});

test('vérification finale, constat 4 : un rangement raté APRÈS un appel réussi compte parmi les trois essais (noté « ecriture ») — l’abandon au troisième, plus aucun appel ensuite (avant : un appel à chaque passe) ; les trois appels réussis comptent sur le plafond, d’accord avec le journal des appels', () => {
  const s = phase.ecriture();
  for (const [k, e] of [[1, s.essai1], [2, s.essai2], [3, s.essai3]]) {
    assert.deepEqual([e.statut, e.code, e.fait, e.appelFait, e.essai], ['error', 'ecriture', false, true, k], `essai ${k}`);
    assert.match(e.resume, new RegExp(`^Le résumé d’octobre 2026 n’a pas pu être rangé \\(.*rangement refusé \\(essai du constat 4\\).*\\) : l’appel est au journal ; essai ${k} sur 3, nouvel essai à la passe suivante\\.$`), e.resume);
  }
  assert.deepEqual([s.decisionApres1.code, s.decisionApres1.essais], ['a-faire', 1], 'le premier échec est compté');
  assert.deepEqual(s.essais.map((e) => e.type), ['ecriture', 'ecriture', 'ecriture']);
  for (const e of s.essais) {
    assert.match(e.raison, /^le rangement a échoué : .*rangement refusé \(essai du constat 4\)/);
    assert.ok(Number.isInteger(e.tokens) && e.tokens > 0, 'les tokens de l’appel réussi sont notés avec l’essai');
  }
  assert.equal(s.resumes, 0, 'rien de rangé');
  assert.deepEqual(s.journalDeLaBoucle, ['tri'], 'aucune entrée « résumé du mois écrit » sans son résumé');
  assert.equal(s.decisionAbandon.code, 'essais-epuises');
  assert.deepEqual([s.quatrieme.code, s.quatrieme.appels], ['essais-epuises', 0], 'abandonné : plus d’appel');
  assert.equal(s.appels, 3);
  assert.deepEqual([s.compteur.count, s.compteur.resumeMois], [3, 3], 'les trois appels réussis ont pris leur place sur le plafond');
  assert.deepEqual(s.journalClaude.map((l) => [l.type, l.statut]), [['resume-mois', 'ok'], ['resume-mois', 'ok'], ['resume-mois', 'ok']]);
  assert.equal(s.coherence.egal, true);
  assert.equal(s.plafondApres, 150);
});

test('l’étape « resumeCorrection » : après le bilan de la semaine, avant le contrôle quotidien (toujours dernier) ; due seulement quand le dernier mois trié attend son résumé, jamais forcée par un clic ni contre l’interrupteur ; son « pourquoi » en français ; son résultat à la forme des autres étapes', () => {
  const s = phase.etape();
  const i = s.etapes.indexOf('resumeCorrection');
  assert.equal(s.etapes.filter((k) => k === 'resumeCorrection').length, 1);
  assert.equal(s.etapes[i - 1], 'bilanSemaine');
  // Étape 32 (lot 1a, 29/10/2026) : le contexte du match s'intercale entre le résumé du mois et le contrôle quotidien.
  assert.equal(s.etapes[i + 1], 'contexteDuMatch');
  assert.equal(s.etapes[i + 2], 'controleQuotidien');
  assert.equal(s.etapes.at(-1), 'controleQuotidien');
  assert.ok(s.etapes.indexOf('boucleCorrection') < i, 'le tri du mois est fait plus haut dans la même passe');
  assert.equal(s.label, "Résumé du mois de la boucle de correction (texte de l'IA, un seul appel par mois)");
  assert.deepEqual(s.sansTri, { due: false, entree: false, manuel: false, pourquoi: 'Pas encore de tri à résumer : le premier tri se fait le 1er du mois à partir de 6 h, après le gel de la calibration.' });
  assert.deepEqual(s.avecTri, { due: true, entree: true, manuel: true });
  assert.deepEqual(s.interrupteurCoupe, { entree: false, manuel: false }, 'ni la passe ni un clic contre AUTO_AI_ANALYSIS');
  assert.deepEqual([s.passe.status, s.passe.code, s.passe.changed, s.passe.appelFait, s.passe.tokens, s.passe.mode], ['ok', 'ecrit', false, true, 4000, 'normal']);
  assert.match(s.passe.summary, /^Résumé d’octobre 2026 écrit en un seul appel à Claude Code/);
  assert.deepEqual([s.apres.due, s.apres.entree, s.apres.manuel], [false, false, false], 'écrit : plus dû, même au clic');
  assert.match(s.apres.pourquoi, /^Le résumé d’octobre 2026 est déjà écrit \(le 01\/11\/2026 à 08 h 00\) : un seul par mois\.$/);
  assert.deepEqual([s.panne.status, s.panne.code, s.panne.appels], ['warn', 'panne-en-cours', 0]);
  assert.deepEqual(s.appels.map((a) => a.type), ['resume-mois']);
  // Sur le source : l'entrée de l'étape et sa place.
  const job = lireSrc('jobs/matchStatsAutoRefresh.js');
  assert.match(job, /key: 'resumeCorrection',\n {4}label: "Résumé du mois de la boucle de correction \(texte de l'IA, un seul appel par mois\)",\n(?: {4}\/\/.*\n)*? {4}due: \(ctx\) => env\.autoAiAnalysis\.enabled && dueResumeCorrection\(ctx\),\n {4}pourquoiPasDue: \(\) => decisionDuResumeDuMois\(\)\.pourquoi,\n {4}run: \(ctx\) => passeResumeCorrection\(ctx\)\n/);
  assert.doesNotMatch(job.split('const dueResumeCorrection')[1].split('\n')[0], /manuel/, 'le « due » ne lit pas le clic');
});

test('ce que lisent l’écran et Santé du moteur : etatDesCorrections().resume dans chaque état (pas de tri, à faire, un essai raté, écrit), le bloc des corrections le porte ; écrit, il se montre même l’interrupteur coupé', () => {
  const s = phase.etat();
  assert.deepEqual([s.vide.disponible, s.vide.resume.code], [true, 'pas-de-tri']);
  assert.deepEqual([s.aFaire.resume.code, s.aFaire.resume.mois, s.aFaire.resume.du], ['a-faire', '2026-10', true]);
  assert.deepEqual([s.unEssai.resume.code, s.unEssai.resume.essais], ['a-faire', 1]);
  assert.match(s.unEssai.resume.phrase, /^Pas encore écrit : 1 essai raté \(dernier : chiffres absents de la fiche : 4321,7\)/);
  assert.equal(s.ecrit.resume.code, 'deja-fait');
  assert.match(s.ecrit.resume.resume.titre, /^Le mois en mots : /);
  assert.equal(s.ecrit.resume.resume.phrases.length, 3);
  assert.equal(s.ecrit.resume.resume.ecritLeDit, '01/11/2026 à 08 h 10');
  assert.equal(s.ecrit.resume.phrase, 'Écrit par Claude (Sonnet) le 01/11/2026 à 08 h 10 — chiffres vérifiés.');
  assert.deepEqual([s.sante.etat, s.sante.resume?.code, s.sante.resume?.resume?.phrases?.length], ['ok', 'deja-fait', 3]);
  assert.equal(s.coupe, 'deja-fait');
  assert.equal(s.ecritInterrupteurCoupe, 'deja-fait');
  assert.deepEqual([s.coupeSansResume.code, s.coupeSansResume.mois, s.coupeSansResume.phrase], ['interrupteur', '2026-11', 'Les analyses IA automatiques sont coupées : pas de résumé du mois.']);
});
