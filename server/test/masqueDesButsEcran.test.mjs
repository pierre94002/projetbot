/**
 * LOT 0 — le masque des buts À L'ÉCRAN (13/11/2026) : l'écran ne dit que la phrase que le serveur lui donne.
 *   node --test test/masqueDesButsEcran.test.mjs        (depuis server/)
 *   U1 le tableau des verdicts (MarketVerdictBoard.vue) lie `result.masqueDesButs.phrase` ;
 *   U2 la fiche du pronostic (utils/ficheDuPronostic.js + PercentageWhyCard.vue) : avec le masque, la famille « Buts » ne dit
 *      que la phrase (ni ligne, ni buts attendus) ; sans lui, rien ne change ;
 *   U3 le Repérage (ScreenerView.vue) lie `donnees.masqueDesButs.phrase` ;
 *   et aucune phrase du masque n'est écrite dans ui/src (elle vient du serveur, data/masqueDesButs.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { UI, imp } from './aides/rendu.mjs';
import { MASQUE_DES_BUTS as MASQUE, vueDuMasque } from '../src/data/masqueDesButs.js';

const F = await imp(path.join(UI, 'src', 'utils', 'ficheDuPronostic.js'));
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8');
const compter = (texte, motif) => texte.split(motif).length - 1;

test('U1 — le tableau des verdicts lie la phrase du serveur, une seule fois, sous v-if', () => {
  const vue = lireUi('components', 'analysis', 'MarketVerdictBoard.vue');
  assert.equal(compter(vue, '<div v-if="result.masqueDesButs" class="cm-note is-warning" data-masque-buts>'), 1);
  assert.equal(compter(vue, '{{ result.masqueDesButs.phrase }}'), 1);
});

test('U3 — le Repérage lie la phrase du serveur, une seule fois, sous v-if', () => {
  const vue = lireUi('views', 'ScreenerView.vue');
  assert.equal(compter(vue, '<div v-if="donnees?.masqueDesButs" class="cm-note is-warning" data-masque-buts>'), 1);
  assert.equal(compter(vue, '{{ donnees.masqueDesButs.phrase }}'), 1);
  assert.match(vue, /const donnees = computed\(\(\) => reponse\.value\?\.data \?\? null\);/, 'donnees = la partie data de la réponse, où le serveur met le masque');
});

test('U2 — la fiche du pronostic : avec le masque, la famille « Buts » ne dit que la phrase ; sans lui, rien ne change', () => {
  const vue = vueDuMasque(MASQUE);
  const result = { expectedGoals: { home: 1.039, away: 0.5, source: 'fotmob' }, masqueDesButs: vue };
  assert.deepEqual(F.butsDuMatch(result), { attendus: null, texte: MASQUE.phrase, sansAttendus: null, provenance: null, phrases: [], masque: true });
  assert.deepEqual(F.butsDuMatch(result, { source: 'x' }).texte, MASQUE.phrase, 'la provenance de la 27 ne passe pas devant le masque');
  const { masqueDesButs, ...sans } = result;
  const libre = F.butsDuMatch(sans);
  assert.equal(libre.masque, undefined);
  assert.deepEqual(libre.attendus, { home: '1,04', away: '0,50' });
  assert.ok(libre.phrases.length >= 1);
  // Le gabarit : la phrase seule, à la place de la liste des lignes.
  const carte = lireUi('components', 'analysis', 'PercentageWhyCard.vue');
  const i = carte.indexOf('<p v-else-if="b.masque" class="why__etat" data-masque-buts>{{ b.texte }}</p>');
  assert.ok(i > carte.indexOf('<p v-if="!b" class="why__etat">{{ fiche.message }}</p>'));
  assert.ok(i < carte.indexOf('<dl v-else class="why__lignes">', carte.indexOf('data-famille="buts"')));
});

test('aucune phrase du masque n’est écrite dans ui/src : l’écran ne la tient que du serveur', () => {
  const morceaux = [MASQUE.phrase, MASQUE.phraseSaisie, MASQUE.phraseCombine, MASQUE.phraseIA, 'Pronostics de buts cachés', 'Marchés de buts retirés depuis'];
  let lus = 0;
  for (const f of fs.readdirSync(path.join(UI, 'src'), { recursive: true }).map(String).filter((x) => /\.(vue|js|mjs|ts|css|json)$/.test(x))) {
    lus += 1;
    const texte = fs.readFileSync(path.join(UI, 'src', f), 'utf8');
    for (const m of morceaux) assert.ok(!texte.includes(m), `ui/src/${f} : « ${m.slice(0, 40)} »`);
  }
  assert.ok(lus > 100, `${lus} fichiers lus`);
});

test('U3 bis — le Repérage dit « cachée » (la phrase du serveur) pour un marché de buts masqué, jamais « non calculée », et ne le compte pas parmi les matchs sans probabilité du moteur', () => {
  const vue = lireUi('views', 'ScreenerView.vue');
  assert.equal(compter(vue, 'const cache = (k) => Boolean(k && donnees.value?.masqueDesButs?.marches?.includes(k.key));'), 1);
  const moteur = vue.indexOf('function celluleMoteur(m, k, libelle) {');
  const ecart = vue.indexOf('function celluleEcart(k) {');
  const ligne = "  if (k.engineProb == null && cache(k)) return absent('cachée', donnees.value.masqueDesButs.phrase);";
  assert.equal(vue.indexOf(ligne, moteur), vue.indexOf('\n', moteur) + 1, 'en tête de celluleMoteur, avant « non calculée »');
  assert.equal(vue.indexOf(ligne, ecart), vue.indexOf('\n', ecart) + 1, 'en tête de celluleEcart, avant « sans moteur »');
  assert.match(vue, /sansMoteur: liste\.filter\(\(m\) => duMarche\(m\)\?\.engineProb == null && !cache\(duMarche\(m\)\)\)\.length,/);
});

test('U4 — la carte des cotes saisies (2e carte de l’onglet Marchés) lie la phrase du serveur, une seule fois, sous v-if, dans le bloc des données', () => {
  const vue = lireUi('components', 'analysis', 'ManualOddsEntry.vue');
  const i = vue.indexOf('<div v-if="donnees?.masqueDesButs" class="cm-note is-warning" data-masque-buts>');
  assert.equal(compter(vue, '<div v-if="donnees?.masqueDesButs" class="cm-note is-warning" data-masque-buts>'), 1);
  assert.equal(compter(vue, '{{ donnees.masqueDesButs.phrase }}'), 1);
  assert.ok(i > vue.indexOf('<template v-else-if="donnees">'), 'dans le bloc des données');
  assert.match(vue, /const donnees = computed\(\(\) => etat\.value\.donnees\);/);
});
