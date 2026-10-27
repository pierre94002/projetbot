/**
 * Le garde-fou de la mesure (étape 16 du plan) : la PREUVE NEUVE, le REGISTRE, la FEUILLE DE ROUTE.
 *   node --test test/registreMesure.test.mjs        (depuis server/)
 *
 * Le registre est un fichier TEMPORAIRE sous essais-tests (bac-a-sable\essais-tests dans le bac, le dossier
 * temporaire du système depuis le dépôt), passé par l'option `fichier` — jamais data/runtime. Les lancements
 * sont FABRIQUÉS ici (option `lancements`) : la liste du code (LANCEMENTS) est vide à l'étape 16. Ni base,
 * ni réseau, ni sous-processus. Les valeurs attendues sont recalculées à la main, jamais recopiées du code.
 *
 * Un fichier TRONQUÉ (illisible) n'est lu qu'une fois : utils/atomicJson.js le relit pendant ~1,5 s avant
 * de le dire illisible (OneDrive peut le tenir) ; les autres cas illisibles passent par des formes
 * inattendues, refusées sans attendre, par le même chemin de lecture.
 *
 * 10. Le juge de preuve (jugerEtape) : seulement après le lancement, jamais sur des données vues ;
 *     étape non lancée, aucune variante, ligne sans date refusées ; le jugement rangé.
 * 12. Le registre : lancements datés du jour de Paris, idempotents ; déclarations à chaud ; jugements
 *     ajoutés, jamais remplacés ; un fichier illisible jamais pris pour vide ni réécrit ; les lancements
 *     du code vérifiés.
 * 13. La feuille de route : la preuve de chaque étape à juger, sans base ; registre illisible, page intacte.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RACINE_ESSAIS, SERVEUR } from './aides/isolement.mjs';
import { jugerEtape, comparer, partDonneesVues, generateur, LignesInvalides, EtapeNonLancee, AucuneVariante } from '../src/bench/guard.js';
import {
  FICHIER_REGISTRE,
  RegistreIllisible,
  lireRegistre,
  enregistrerLancements,
  declarerLancement,
  declarerVariante,
  declarerVariantes,
  lancementDe,
  variantesDe,
  compterVariantes,
  fenetresVues,
  enregistrerJugement,
  jugementsDe,
  etatPourFeuilleDeRoute
} from '../src/bench/trialsRegistry.js';
import { LANCEMENTS, DONNEES_VUES, ETAPES_A_JUGER, verifierLancements, LancementsInvalides } from '../src/bench/lancements.js';
import { etatFeuilleDeRoute } from '../src/data/roadmap/feuilleDeRoute.js';
import { HISTORIQUE } from '../src/data/roadmap/historique.js';
import { etapeParId, IDS_ETAPES } from '../src/data/roadmap/plan.js';

fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
const DOSSIER = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-registre-mesure-'));
after(() => fs.rmSync(DOSSIER, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
let compteur = 0;
/** Un registre neuf (le fichier n'existe pas encore). */
const nouveauFichier = () => path.join(DOSSIER, `registre-${++compteur}.json`);

/** Le fichier tel qu'il est : existence, octets exacts, date — prouve qu'une demande n'a rien réécrit. */
function photo(fichier) {
  if (!fs.existsSync(fichier)) return { existe: false };
  return { existe: true, octets: fs.readFileSync(fichier, 'utf8'), mtimeMs: fs.statSync(fichier).mtimeMs };
}
const lire = (fichier) => JSON.parse(fs.readFileSync(fichier, 'utf8'));
const proche = (x, attendu, tolerance, message) => assert.ok(Math.abs(x - attendu) <= tolerance, `${message ?? ''} : ${x} au lieu de ${attendu}`);

/** L'étape 27 déclarée par le code : deux variantes regardées (dont la retenue), une fenêtre vue (un rattrapage). */
const L27 = Object.freeze({
  etape: '27',
  version: 'score-marche-v1',
  quoi: 'Modèle de score ancré sur le marché',
  le: null,
  variantes: [
    { id: 'score-marche-v1', quoi: 'poids du marché 0,6 (retenue)' },
    { id: 'score-marche-v0', quoi: 'poids du marché 0,5' }
  ],
  vues: [{ de: '2026-11-15', a: '2026-11-16', quoi: 'rattrapage regardé après coup', pour: ['moteur'] }]
});
const LANCEE_LE = Date.parse('2026-11-09T07:52:10Z'); // un lundi matin : le 09/11 à Paris

/** 500 lignes datées du 01/11 au 30/11 (jour = 1 + i % 30), une par match, B un peu meilleure. */
function lignesDeNovembre() {
  const u = generateur(2611);
  return Array.from({ length: 500 }, (_, i) => {
    const a = 0.8 + 0.5 * u();
    return { bloc: `m${i}`, cle: `m${i}|1n2`, date: `2026-11-${String(1 + (i % 30)).padStart(2, '0')}`, a, b: a - 0.004 + 0.02 * (u() - 0.5) };
  });
}

// ------------------------------------------------------ 10. la preuve neuve

test('preuve : seules comptent les lignes STRICTEMENT après le jour du lancement et hors des fenêtres vues (bornes comprises) ; le jugement est celui de comparer sur ces lignes, avec m variantes, et il est rangé', () => {
  const fichier = nouveauFichier();
  const registre = { fichier, lancements: [L27] };
  enregistrerLancements({ ...registre, maintenant: LANCEE_LE });
  const lignes = lignesDeNovembre();
  // À la main : avant ou le jour du lancement (≤ 09/11) ; puis les 15 et 16/11 (fenêtre vue, bornes comprises).
  const avant = lignes.filter((l) => l.date <= '2026-11-09');
  const vues = lignes.filter((l) => l.date === '2026-11-15' || l.date === '2026-11-16');
  const gardees = lignes.filter((l) => l.date > '2026-11-09' && l.date !== '2026-11-15' && l.date !== '2026-11-16');
  assert.deepEqual([avant.length, vues.length, gardees.length], [153, 34, 313]);

  const juge = jugerEtape({ etape: '27', lignes, mesure: 'perte-log', maintenant: Date.parse('2026-12-01T02:10:00Z'), registre, quoi: '1N2, perte log', principal: true });
  assert.deepEqual(juge.ecartees, { avantLancement: 153, donneesVues: 34 });
  assert.deepEqual(juge.fenetre, { de: '2026-11-10', a: '2026-11-30' });
  assert.deepEqual(juge.n, { lignes: 313, blocs: 313, matchs: 313 });
  assert.deepEqual([juge.etape, juge.mesure, juge.quoi, juge.principal, juge.lancement, juge.version, juge.le], ['27', 'perte-log', '1N2, perte log', true, '2026-11-09', 'score-marche-v1', '2026-12-01T02:10:00.000Z']);
  // Deux variantes au code : m = 2 ; et c'est exactement le juge générique sur les lignes gardées.
  assert.equal(juge.seuil.variantes, 2);
  const direct = comparer(gardees, { sens: 'min', variantes: 2 });
  for (const champ of ['gain', 'ecartType', 'fourchette', 'p', 'verdict', 'raison', 'a', 'b', 'seuil']) assert.deepEqual(juge[champ], direct[champ], champ);
  // Le pourcentage : gain / moyenne de A × 100, recalculé à la main sur les lignes gardées.
  const moyA = gardees.reduce((s, l) => s + l.a, 0) / gardees.length;
  const moyB = gardees.reduce((s, l) => s + l.b, 0) / gardees.length;
  proche(juge.gain, moyA - moyB, 1e-12, 'gain (perte log : A − B)');
  proche(juge.enPourcent.gain, ((moyA - moyB) / moyA) * 100, 1e-9, 'gain en %');
  proche(juge.enPourcent.fourchette[0], (direct.fourchette[0] / moyA) * 100, 1e-9, 'borne basse en %');
  proche(juge.enPourcent.fourchette[1], (direct.fourchette[1] / moyA) * 100, 1e-9, 'borne haute en %');
  assert.equal(juge.enPourcent.quoi, 'de perte log en moins');
  // Rangé tel quel ; la part des données vues pour le banc.
  assert.deepEqual(jugementsDe('27', registre), [juge]);
  assert.deepEqual(partDonneesVues(lignes, '27', registre), { total: 500, vues: 34, part: 34 / 500 });
  // enregistrer: false n'écrit rien.
  const avantPhoto = photo(fichier);
  const sansRanger = jugerEtape({ etape: '27', lignes, mesure: 'perte-log', maintenant: Date.parse('2026-12-02T02:10:00Z'), registre, enregistrer: false });
  assert.equal(sansRanger.le, '2026-12-02T02:10:00.000Z');
  assert.deepEqual(photo(fichier), avantPhoto);
  assert.equal(jugementsDe('27', registre).length, 1);
});

test('preuve : la saison 2025-26 (données vues de tous) est écartée même si le lancement est fixé en 2025 ; toutes les lignes vues → « pas assez de matchs », et la raison dit pourquoi', () => {
  const registre = { fichier: nouveauFichier(), lancements: [{ etape: '28', version: 'simu-v1', quoi: 'Simulation complète', le: '2025-08-01', variantes: [{ id: 'simu-v1' }] }] };
  // Un « le » fixe trop tôt : sans DONNEES_VUES, la saison 2025-26 passerait pour de la preuve neuve.
  assert.equal(lancementDe('28', registre).le, '2025-08-01');
  // Étape 19 : trois fenêtres contiguës (règle de value, apprentissage, mesures du 23/09).
  assert.deepEqual(fenetresVues('28', registre).map((f) => [f.de, f.a]), [['2023-07-01', '2024-06-30'], ['2024-07-01', '2025-06-30'], ['2025-07-01', '2026-09-23']]);
  const jours = Array.from({ length: 20 }, (_, i) => new Date(Date.UTC(2026, 8, 14 + i)).toISOString().slice(0, 10)); // 14/09 → 03/10
  const u = generateur(28);
  const lignes = [
    ...Array.from({ length: 10 }, (_, i) => ({ bloc: `ancien${i}`, date: '2025-07-20', a: 1, b: 1 })),
    ...Array.from({ length: 400 }, (_, i) => ({ bloc: `m${i}`, date: jours[i % 20], a: 1 + u(), b: 1 + u() }))
  ];
  const attendusVus = lignes.filter((l) => l.date > '2025-08-01' && l.date <= '2026-09-23').length;
  assert.equal(attendusVus, 200);
  const juge = jugerEtape({ etape: '28', lignes, mesure: 'perte-log', maintenant: Date.parse('2026-10-05T02:00:00Z'), registre, enregistrer: false });
  assert.deepEqual(juge.ecartees, { avantLancement: 10, donneesVues: 200 });
  assert.deepEqual([juge.n.lignes, juge.fenetre.de, juge.fenetre.a], [200, '2026-09-24', '2026-10-03']);
  // Toutes vues : rien à juger, et la raison le dit.
  const toutesVues = lignes.filter((l) => l.date >= '2026-09-14' && l.date <= '2026-09-23');
  const rien = jugerEtape({ etape: '28', lignes: toutesVues, mesure: 'perte-log', registre, enregistrer: false });
  assert.equal(rien.verdict, 'pas-assez-de-matchs');
  assert.match(rien.raison, /^0 match jugé, 200 nécessaires\. Écartées : 0 ligne d’avant le lancement du 01\/08\/2025, 200 lignes déjà vues/);
  assert.deepEqual([rien.gain, rien.enPourcent.gain, rien.enPourcent.fourchette, rien.fenetre.de], [null, null, null, null]);
});

test('preuve : étape non lancée, étape inconnue, aucune variante, ligne sans date, mesure inconnue, seuils changés — refusés ; les variantes à chaud comptent, dédoublonnées', () => {
  const fichier = nouveauFichier();
  const lancements = [L27, { etape: '29', version: 'force-v1', quoi: 'Indice de force', le: null, variantes: [{ id: 'force-v1' }] }];
  const registre = { fichier, lancements };
  const lignes = lignesDeNovembre();
  // Aucun démarrage avec ce code : rien n'est lancé.
  assert.equal(lancementDe('27', registre), null);
  assert.throws(() => jugerEtape({ etape: '27', lignes, mesure: 'perte-log', registre }), EtapeNonLancee);
  assert.throws(() => jugerEtape({ etape: '99', lignes, mesure: 'perte-log', registre }), (e) => e instanceof EtapeNonLancee && /inconnue du plan/.test(e.message));
  enregistrerLancements({ ...registre, maintenant: LANCEE_LE });
  assert.equal(lancementDe('29', registre).le, '2026-11-09');
  // Une étape lancée à chaud sans aucune variante déclarée : le juge refuse.
  declarerLancement('30', { version: 'postes-v1', quoi: 'Fiches par poste' }, { ...registre, maintenant: LANCEE_LE });
  assert.equal(compterVariantes('30', registre), 0);
  assert.throws(() => jugerEtape({ etape: '30', lignes, mesure: 'perte-log', registre }), AucuneVariante);
  // Une ligne sans jour : refusée, avec son indice (celui de l'appelant).
  const sansDate = lignes.map((l, i) => (i === 7 ? { ...l, date: undefined } : l));
  assert.throws(() => jugerEtape({ etape: '27', lignes: sansDate, mesure: 'perte-log', registre }), (e) => e instanceof LignesInvalides && e.indice === 7 && /Ligne 7 \(clé « m7\|1n2 »\).*date/.test(e.message));
  assert.throws(() => jugerEtape({ etape: '27', lignes: lignes.map((l, i) => (i === 3 ? { ...l, date: '2026-11-31' } : l)), mesure: 'perte-log', registre }), LignesInvalides);
  assert.throws(() => jugerEtape({ etape: '27', lignes, mesure: 'perte-logarithmique', registre }), LignesInvalides);
  for (const option of [{ minBlocs: 50 }, { alpha: 0.1 }, { variantes: 1 }, { sens: 'max' }, { minParis: 10 }]) {
    assert.throws(() => jugerEtape({ etape: '27', lignes, mesure: 'perte-log', registre, ...option }), LignesInvalides, JSON.stringify(option));
  }
  // Les variantes du jugement : code (2) + à chaud, dédoublonnées par identifiant.
  assert.deepEqual(declarerVariante('27', { id: 'score-marche-v0', quoi: 'déjà au code' }, registre), { change: false, variante: null });
  assert.equal(declarerVariante('27', { id: 'candidat-b', quoi: 'poids du marché 0,7' }, { ...registre, maintenant: Date.parse('2026-11-20T02:05:00Z') }).change, true);
  assert.equal(declarerVariante('27', { id: 'candidat-b', quoi: 'encore' }, registre).change, false);
  assert.deepEqual(variantesDe('27', registre).map((v) => [v.id, v.source, v.ou]), [['score-marche-v1', 'code', 'construction'], ['score-marche-v0', 'code', 'construction'], ['candidat-b', 'registre', 'a-blanc']]);
  const juge = jugerEtape({ etape: '27', lignes, mesure: 'perte-log', maintenant: Date.parse('2026-12-01T02:10:00Z'), registre, enregistrer: false });
  assert.equal(juge.seuil.variantes, 3);
  proche(juge.seuil.alphaCorrige, 0.05 / 3, 1e-15);
  // Tirages et graine se règlent (et sont rangés avec le jugement).
  const autre = jugerEtape({ etape: '27', lignes, mesure: 'perte-log', registre, enregistrer: false, tirages: 500, graine: 7 });
  assert.deepEqual([autre.tirages, autre.graine, autre.gain], [500, 7, juge.gain]);
});

test('preuve : rendement et valeur de clôture — le pourcentage est « × 100 », pas relatif ; une moyenne nulle de A garde l’écart absolu et le dit', () => {
  const registre = { fichier: nouveauFichier(), lancements: [{ ...L27, vues: [] }] };
  enregistrerLancements({ ...registre, maintenant: LANCEE_LE });
  const jours = (i) => `2026-11-${String(10 + (i % 20)).padStart(2, '0')}`;
  // Des valeurs exactes en binaire (multiples de 0,25) : la moyenne de A vaut zéro au bit près.
  const clotures = Array.from({ length: 300 }, (_, i) => ({ bloc: `m${i}`, date: jours(i), a: 0.25 * ((i % 5) - 2), b: 0.25 * ((i % 5) - 2) + 0.02 }));
  const vc = jugerEtape({ etape: '27', lignes: clotures, mesure: 'valeur-cloture', registre, enregistrer: false });
  proche(vc.gain, 0.02, 1e-12, 'valeur de clôture : B − A');
  proche(vc.enPourcent.gain, 2, 1e-9, '× 100');
  assert.equal(vc.enPourcent.quoi, 'de valeur de clôture en plus');
  assert.equal(vc.a.moyenne, 0, 'moyenne de A nulle par construction');
  // Perte log avec une moyenne de A nulle : pas de pourcentage relatif possible, l'écart absolu × 100, et la phrase le dit.
  const nulle = jugerEtape({ etape: '27', lignes: clotures.map((l) => ({ ...l, a: 0, b: 0.01 })), mesure: 'perte-log', registre, enregistrer: false });
  proche(nulle.enPourcent.gain, -1, 1e-9);
  assert.match(nulle.enPourcent.quoi, /^de perte log en moins \(écart absolu × 100 : la moyenne de l’ancienne version est nulle\)$/);
  const paris = Array.from({ length: 300 }, (_, i) => ({ bloc: `m${i}`, date: jours(i), gainA: i % 2 ? -1 : 1.1, miseA: 1, gainB: i % 3 ? -1 : 2, miseB: 1 }));
  const rend = jugerEtape({ etape: '27', lignes: paris, mesure: 'gain', registre, enregistrer: false });
  const rA = paris.reduce((s, l) => s + l.gainA, 0) / 300;
  const rB = paris.reduce((s, l) => s + l.gainB, 0) / 300;
  proche(rend.enPourcent.gain, (rB - rA) * 100, 1e-9, 'points de rendement');
  assert.deepEqual([rend.mode, rend.enPourcent.quoi, rend.n.parisA, rend.n.parisB], ['rendement', 'par unité misée', 300, 300]);
});

// --------------------------------------------------------------- 12. le registre

test('registre : enregistrerLancements crée le fichier, daté du jour de PARIS du démarrage (23 h 30 UTC = le lendemain) ; rejoué, il n’écrit rien ; un « le » fixe est recopié tel quel ; rien à noter, aucun fichier créé', () => {
  // Rien à noter (une liste vide ; celle du code a l'étape 29 depuis le 19/10, l'étape 30 depuis le 22/10, l'étape 37 depuis la nuit
  // du 22 au 23/10) : aucun fichier créé.
  const vide = nouveauFichier();
  // Étape 28 (27/10/2026) : la simulation complète, datée du premier démarrage avec ce code.
  assert.deepEqual(LANCEMENTS.map((l) => [l.etape, l.version, l.le]), [['29', 'indice-v1', '2026-10-14'], ['30', 'fiches-v1', null], ['37', 'style-v1', null], ['28', 'simulation-v1', null]]);
  assert.deepEqual(enregistrerLancements({ fichier: vide, lancements: [] }), { nouveaux: [], source: 'absent', probleme: null });
  assert.equal(fs.existsSync(vide), false);

  const fichier = nouveauFichier();
  const lancements = [L27, { etape: '26', version: 'boucle-v1', quoi: 'Boucle de correction', le: '2026-10-06', variantes: [{ id: 'boucle-v1', quoi: '' }] }];
  const demarrage = Date.parse('2026-11-08T23:30:00Z'); // 00 h 30 le lundi 09/11 à Paris (UTC+1)
  const r = enregistrerLancements({ fichier, lancements, maintenant: demarrage });
  assert.deepEqual(r, {
    nouveaux: [
      { etape: '27', version: 'score-marche-v1', le: '2026-11-09' },
      { etape: '26', version: 'boucle-v1', le: '2026-10-06' }
    ],
    source: 'enregistre',
    probleme: null
  });
  assert.deepEqual(lire(fichier), {
    version: 1,
    majLe: '2026-11-08T23:30:00.000Z',
    etapes: {
      27: { lancements: [{ version: 'score-marche-v1', quoi: 'Modèle de score ancré sur le marché', le: '2026-11-09', heure: '2026-11-08T23:30:00.000Z', source: 'code' }] },
      26: { lancements: [{ version: 'boucle-v1', quoi: 'Boucle de correction', le: '2026-10-06', heure: null, source: 'code' }] }
    }
  });
  // Un deuxième démarrage, le lendemain : rien de nouveau, le fichier n'est pas réécrit (octets et date).
  const avant = photo(fichier);
  assert.deepEqual(enregistrerLancements({ fichier, lancements, maintenant: demarrage + 86_400_000 }), { nouveaux: [], source: 'enregistre', probleme: null });
  assert.deepEqual(photo(fichier), avant);
  // Le lancement qui compte : version, phrase, jour, fenêtres du code.
  assert.deepEqual(lancementDe('27', { fichier, lancements }), {
    version: 'score-marche-v1',
    quoi: 'Modèle de score ancré sur le marché',
    le: '2026-11-09',
    heure: '2026-11-08T23:30:00.000Z',
    source: 'code',
    vues: [{ de: '2026-11-15', a: '2026-11-16', quoi: 'rattrapage regardé après coup', pour: ['moteur'] }]
  });
  assert.deepEqual(fenetresVues('27', { fichier, lancements }).map((f) => [f.de, f.a]), [['2023-07-01', '2024-06-30'], ['2024-07-01', '2025-06-30'], ['2025-07-01', '2026-09-23'], ['2026-11-15', '2026-11-16']]);
  // Une version ajoutée au code plus tard : seule elle est notée, au jour de son démarrage ; elle devient le lancement qui compte.
  const v2 = [...lancements, { ...L27, version: 'score-marche-v2', variantes: [{ id: 'score-marche-v2' }], vues: [] }];
  assert.deepEqual(enregistrerLancements({ fichier, lancements: v2, maintenant: Date.parse('2026-11-20T09:00:00Z') }).nouveaux, [{ etape: '27', version: 'score-marche-v2', le: '2026-11-20' }]);
  assert.deepEqual([lancementDe('27', { fichier, lancements: v2 }).version, lancementDe('27', { fichier, lancements: v2 }).vues], ['score-marche-v2', []]);
  // Une déclaration mal écrite : le démarrage le dit (le serveur l'attrape), rien n'est écrit.
  const avantFaute = photo(fichier);
  assert.throws(() => enregistrerLancements({ fichier, lancements: [{ ...L27, etape: '48' }] }), LancementsInvalides);
  assert.deepEqual(photo(fichier), avantFaute);
});

test('registre : déclarations à chaud idempotentes ; les jugements s’AJOUTENT (jamais remplacés) ; champs inconnus gardés', () => {
  const fichier = nouveauFichier();
  const options = { fichier, lancements: [L27] };
  const t1 = Date.parse('2026-11-25T08:00:00Z');
  const d1 = declarerLancement('27', { version: 'score-marche-v3', quoi: 'Adoption de la candidate' }, { ...options, maintenant: t1 });
  assert.deepEqual(d1, { change: true, lancement: { version: 'score-marche-v3', quoi: 'Adoption de la candidate', le: '2026-11-25', heure: '2026-11-25T08:00:00.000Z', source: 'a-chaud' } });
  const avant = photo(fichier);
  assert.equal(declarerLancement('27', { version: 'score-marche-v3', quoi: 'encore' }, { ...options, maintenant: t1 + 1000 }).change, false);
  assert.deepEqual(photo(fichier), avant);
  assert.equal(lancementDe('27', options).version, 'score-marche-v3');
  assert.throws(() => declarerLancement('48', { version: 'x' }, options), TypeError);
  assert.throws(() => declarerLancement('27', { version: ' ' }, options), TypeError);
  // Variantes : ajoutée une fois.
  assert.equal(declarerVariante('27', { id: 'candidat-c', quoi: 'poids 0,8', ou: 'banc' }, { ...options, maintenant: t1 }).change, true);
  const avantVariante = photo(fichier);
  assert.equal(declarerVariante('27', { id: 'candidat-c' }, options).change, false);
  assert.deepEqual(photo(fichier), avantVariante);
  assert.deepEqual(lire(fichier).etapes['27'].variantes, [{ id: 'candidat-c', quoi: 'poids 0,8', ou: 'banc', le: '2026-11-25T08:00:00.000Z' }]);
  // Jugements : ajoutés dans l'ordre, jamais à la place d'un autre.
  const j1 = enregistrerJugement('27', { le: '2026-11-26T02:00:00.000Z', verdict: 'pas-prouve', principal: false }, options);
  const j2 = enregistrerJugement('27', { le: '2026-11-27T02:00:00.000Z', verdict: 'pas-prouve', principal: false }, options);
  assert.deepEqual(jugementsDe('27', options), [j1, j2]);
  // Un champ que ce code ne connaît pas (écrit par une version plus récente) : gardé à chaque écriture.
  const brut = lire(fichier);
  fs.writeFileSync(fichier, JSON.stringify({ ...brut, extra: { garde: true }, etapes: { ...brut.etapes, 27: { ...brut.etapes['27'], autre: 42 } } }));
  enregistrerJugement('27', { le: '2026-11-28T02:00:00.000Z', verdict: 'retenu', principal: true }, options);
  const apres = lire(fichier);
  assert.deepEqual([apres.extra, apres.etapes['27'].autre, apres.etapes['27'].jugements.length, apres.etapes['27'].lancements.length], [{ garde: true }, 42, 3, 1]);
  assert.equal(lireRegistre(options).source, 'enregistre');
});

test('registre : un fichier TRONQUÉ est illisible — jamais pris pour vide, jamais réécrit ; le démarrage ne lève pas', () => {
  const fichier = nouveauFichier();
  fs.writeFileSync(fichier, '{"version": 1, "etapes": {"27": {"lancements": [{"version": "score-marche-v1", "le": "2026-11-');
  const avant = photo(fichier);
  // Le démarrage (une seule lecture : ~1,5 s d'attente, OneDrive peut tenir le fichier) : rien d'écrit, rien de levé.
  const r = enregistrerLancements({ fichier, lancements: [L27], maintenant: LANCEE_LE });
  assert.deepEqual([r.nouveaux, r.source], [[], 'illisible']);
  assert.match(r.probleme, /illisible/);
  assert.deepEqual(photo(fichier), avant);
});

test('registre : une forme inattendue est illisible aussi — les écritures lèvent RegistreIllisible, les lectures du juge aussi, la feuille de route reste debout', () => {
  const formes = {
    tableau: [],
    nul: null,
    etapesTexte: { version: 1, etapes: 'texte' },
    entreeTexte: { version: 1, etapes: { 27: 'texte' } },
    lancementsObjet: { version: 1, etapes: { 27: { lancements: {} } } },
    lancementSansJour: { version: 1, etapes: { 27: { lancements: [{ version: 'v1', le: 'hier' }] } } },
    varianteSansId: { version: 1, etapes: { 27: { variantes: [{ quoi: 'x' }] } } },
    jugementTexte: { version: 1, etapes: { 27: { jugements: ['retenu'] } } }
  };
  for (const [nom, contenu] of Object.entries(formes)) {
    const fichier = nouveauFichier();
    fs.writeFileSync(fichier, JSON.stringify(contenu));
    const avant = photo(fichier);
    const options = { fichier, lancements: [L27], maintenant: LANCEE_LE };
    const lu = lireRegistre(options);
    assert.equal(lu.source, 'illisible', nom);
    assert.match(lu.probleme, /forme inattendue/, nom);
    assert.deepEqual(lu.etapes, {}, nom);
    assert.deepEqual(enregistrerLancements(options).nouveaux, [], nom);
    for (const ecriture of [
      () => declarerLancement('27', { version: 'v9' }, options),
      () => declarerVariante('27', { id: 'c' }, options),
      () => enregistrerJugement('27', { verdict: 'retenu' }, options),
      () => lancementDe('27', options),
      () => compterVariantes('27', options),
      () => jugementsDe('27', options),
      () => jugerEtape({ etape: '27', lignes: [], mesure: 'perte-log', registre: options })
    ]) {
      assert.throws(ecriture, (e) => e instanceof RegistreIllisible && /Rien n’y est écrit ni jugé/.test(e.message), nom);
    }
    assert.deepEqual(photo(fichier), avant, `${nom} : jamais réécrit`);
    const etat = etatPourFeuilleDeRoute(options);
    assert.equal(etat.source, 'illisible', nom);
    assert.deepEqual(etat.etapes['27'], { aJuger: true, registre: 'illisible', lancement: null, variantes: null, jugement: null }, nom);
  }
});

test('lancements du code : la liste vérifiée (vide à l’étape 16), les étapes à juger et les données vues valides ; une étape inconnue, une version en double, une fenêtre à l’envers, la version retenue hors de ses variantes — refusées', () => {
  assert.equal(verifierLancements(LANCEMENTS), true);
  assert.deepEqual([...ETAPES_A_JUGER], ['26', '27', '28', '29', '30', '32', '33', '34', '35', '36', '37', '38', '39', '46', '47']);
  for (const id of ETAPES_A_JUGER) assert.ok(etapeParId(id), `étape ${id} : inconnue du plan`);
  // Étape 19 (13/10/2026) : trois fenêtres contiguës, dans l'ordre (le banc d'essai les compte une à une).
  assert.deepEqual(DONNEES_VUES.map((f) => [f.id, f.de, f.a]), [
    ['regle-de-value-23-09', '2023-07-01', '2024-06-30'],
    ['apprentissage-23-09', '2024-07-01', '2025-06-30'],
    ['mesures-du-23-09', '2025-07-01', '2026-09-23']
  ]);
  assert.match(DONNEES_VUES[0].quoi, /20 914 matchs de 18 championnats/);
  assert.match(DONNEES_VUES[2].quoi, /13 052 matchs/);
  const refuse = (liste, motif) => assert.throws(() => verifierLancements(liste), (e) => e instanceof LancementsInvalides && motif.test(e.message), String(motif));
  refuse([{ ...L27, etape: '48' }], /inconnue du plan/);
  refuse([{ ...L27, etape: 27 }], /inconnue du plan \(plan\.js\), ou mal écrite/);
  refuse([L27, { ...L27 }], /déclarée deux fois pour l’étape 27/);
  refuse([{ ...L27, vues: [{ de: '2026-11-16', a: '2026-11-15', pour: ['moteur'] }] }], /commence après sa fin/);
  refuse([{ ...L27, variantes: [{ id: 'score-marche-v0' }] }], /doit faire partie de ses variantes/);
  refuse([{ ...L27, variantes: [] }], /au moins une variante/);
  refuse([{ ...L27, variantes: [{ id: 'score-marche-v1' }, { id: 'score-marche-v1' }] }], /déclarée deux fois/);
  refuse([{ ...L27, le: '2026-02-30' }], /« le » doit être null ou un jour/);
  refuse([{ ...L27, version: '' }], /version est vide/);
  refuse([{ ...L27, quoi: ' ' }], /« quoi » est vide/);
  refuse({}, /liste/);
  // Deux étapes peuvent avoir la même version ; une même étape, deux versions.
  assert.equal(verifierLancements([L27, { ...L27, etape: '28' }, { ...L27, version: 'score-marche-v2', variantes: [{ id: 'score-marche-v2' }] }]), true);
});

test('juge de preuve, « déjà vu » par PORTÉE (correction du 19/10) : DONNEES_VUES, TOUTES les vues de l’étape jugée (toutes versions, toutes portées), les vues « moteur » des lancements ENREGISTRÉS des autres étapes — jamais une autre grandeur ni un lancement pas encore noté ; l’étape 29 lancée le 14/10', () => {
  const vue = (de, a, pour) => ({ de, a, quoi: `${de}`, pour });
  const lancements = [
    { ...L27, le: '2026-11-09', vues: [vue('2026-11-15', '2026-11-16', ['moteur']), vue('2018-01-01', '2018-01-31', ['indice'])] },
    { ...L27, version: 'score-marche-v0', le: '2026-10-20', variantes: [{ id: 'score-marche-v0' }], vues: [vue('2017-01-01', '2017-01-31', ['moteur'])] },
    { etape: '30', version: 'joueurs-v1', quoi: 'Fiches joueurs', le: '2026-10-25', variantes: [{ id: 'joueurs-v1' }], vues: [vue('2016-01-01', '2016-01-31', ['moteur']), vue('2015-01-01', '2015-01-31', ['indice']), vue('2026-11-20', '2026-11-22', ['moteur']), vue('2026-11-25', '2026-11-26', ['indice'])] },
    { etape: '26', version: 'boucle-v1', quoi: 'Boucle', le: null, variantes: [{ id: 'boucle-v1' }], vues: [vue('2014-01-01', '2014-01-31', ['moteur'])] }
  ];
  assert.equal(verifierLancements(lancements), true);
  const fichier = nouveauFichier();
  const jours = (etape) => fenetresVues(etape, { fichier, lancements }).map((f) => f.de).sort();
  const vingt3 = ['2023-07-01', '2024-07-01', '2025-07-01'];
  // L'étape 27 jugée : toutes ses vues (les deux versions, « indice » compris), la vue « moteur » de 30 (lancée à date fixe) ;
  // ni la vue « indice » de 30, ni celle de 26 (« le: null », jamais notée au registre).
  assert.deepEqual(jours('27'), ['2016-01-01', '2017-01-01', '2018-01-01', ...vingt3, '2026-11-15', '2026-11-20'].sort());
  // L'étape 30 jugée : toutes ses vues, et les vues « moteur » des DEUX versions lancées de 27 ; jamais la vue « indice » de 27.
  assert.deepEqual(jours('30'), ['2015-01-01', '2016-01-01', '2017-01-01', ...vingt3, '2026-11-15', '2026-11-20', '2026-11-25'].sort());
  // 26 notée au registre (un démarrage) : sa vue « moteur » entre dans le jugement des autres.
  enregistrerLancements({ fichier, lancements, maintenant: Date.parse('2026-11-30T08:00:00Z') });
  assert.ok(jours('27').includes('2014-01-01'));
  // Le juge écarte bien ces lignes : 3 dans la vue « moteur » de 30, 3 dans sa vue « indice » (gardées), 4 hors de tout.
  const lignes = [
    ...Array.from({ length: 3 }, (_, i) => ({ bloc: `moteur${i}`, date: '2026-11-21', a: 1, b: 1 })),
    ...Array.from({ length: 3 }, (_, i) => ({ bloc: `indice${i}`, date: '2026-11-25', a: 1, b: 0.95 })),
    ...Array.from({ length: 4 }, (_, i) => ({ bloc: `neuve${i}`, date: '2026-12-01', a: 1, b: 0.9 }))
  ];
  const j = jugerEtape({ etape: '27', lignes, mesure: 'perte-log', maintenant: Date.parse('2026-12-02T08:00:00Z'), registre: { fichier, lancements }, enregistrer: false });
  assert.deepEqual(j.ecartees, { avantLancement: 0, donneesVues: 3 }, 'la vue « moteur » d’une autre étape lancée : écartée ; sa vue « indice » : gardée');
  assert.equal(j.n.lignes, 7);
  // Le vrai code : l'étape 29 est lancée le 14/10 (date fixe), sa preuve écarte ses six vues, « indice » comprises ;
  // les étapes 30 (22/10/2026) et 37 (nuit du 22 au 23/10, les styles de jeu), « le: null », sont datées du démarrage.
  const vrai = nouveauFichier();
  // Étape 28 (27/10) : sa déclaration (simulation-v1, « le: null ») est datée du démarrage comme 30 et 37 (§3.4 de 28).
  assert.deepEqual(enregistrerLancements({ fichier: vrai, maintenant: Date.parse('2026-10-19T08:00:00Z') }).nouveaux, [
    { etape: '29', version: 'indice-v1', le: '2026-10-14' },
    { etape: '30', version: 'fiches-v1', le: '2026-10-19' },
    { etape: '37', version: 'style-v1', le: '2026-10-19' },
    { etape: '28', version: 'simulation-v1', le: '2026-10-19' }
  ]);
  assert.equal(lancementDe('29', { fichier: vrai }).le, '2026-10-14');
  assert.deepEqual(fenetresVues('29', { fichier: vrai }).map((f) => [f.de, f.a]).sort(), [['2000-07-01', '2019-06-30'], ['2019-07-01', '2023-06-30'], ['2023-01-01', '2024-06-30'], ['2023-07-01', '2024-06-30'], ['2024-07-01', '2025-06-30'], ['2025-07-01', '2026-09-23'], ['2025-07-01', '2026-10-07']]);
  // … et le jugement d'une autre étape (27, une candidate du moteur) n'en écarte aucune : l'indice n'est pas lu par le moteur.
  assert.deepEqual(fenetresVues('27', { fichier: vrai, lancements: [...LANCEMENTS, L27] }).map((f) => f.de).sort(), [...vingt3, '2026-11-15']);
});

// ---------------------------------------------------------- 13. la feuille de route

const PIERRE_VIDE ={ source: 'absent', fichier: 'C:\\essai\\roadmap.json', probleme: null, majLe: null, etapes: {} };
const MIDI = Date.parse('2026-12-01T10:00:00Z');

test('feuille de route : chaque étape à juger a sa preuve (lancement, variantes, dernier jugement principal), les autres rien — sauf une entrée au registre ; le tout SANS base', () => {
  const fichier = nouveauFichier();
  const lancements = [L27];
  const options = { fichier, lancements };
  enregistrerLancements({ ...options, maintenant: LANCEE_LE });
  declarerVariante('27', { id: 'candidat-b', quoi: 'poids 0,7' }, options);
  // Un jugement principal, puis un jugement « en cours » plus récent : la page montre le principal.
  const principal = enregistrerJugement('27', { le: '2026-11-25T02:10:00.000Z', quoi: '1N2, perte log', mesure: 'perte-log', principal: true, verdict: 'pas-prouve', raison: 'La fourchette contient zéro.', n: { lignes: 1240, blocs: 1240, matchs: 1240 }, fenetre: { de: '2026-11-10', a: '2026-11-24' }, enPourcent: { gain: 0.4, fourchette: [-0.2, 1], quoi: 'de perte log en moins' }, seuil: { variantes: 3 }, controle: { tiragesIgnores: 0 } }, options);
  enregistrerJugement('27', { le: '2026-11-26T02:10:00.000Z', principal: false, verdict: 'retenu' }, options);
  // Une étape hors de la liste, lancée à chaud (une adoption rangée sous elle) : elle a sa mesure, « pas à juger ».
  declarerLancement('8', { version: 'opportunites-v2', quoi: 'Essai' }, { ...options, maintenant: LANCEE_LE });
  const mesure = etatPourFeuilleDeRoute(options);
  assert.deepEqual([mesure.source, mesure.fichier, mesure.probleme, mesure.nombre], ['enregistre', fichier, null, 2]);
  const etat = etatFeuilleDeRoute({ maintenant: MIDI, pierre: PIERRE_VIDE, mesure });
  const etapes = etat.lots.flatMap((l) => l.etapes);
  assert.equal(etapes.length, 49);
  for (const e of etapes) {
    if (ETAPES_A_JUGER.includes(e.id)) assert.equal(e.mesure?.aJuger, true, `étape ${e.id}`);
    else if (e.id === '8') assert.equal(e.mesure?.aJuger, false);
    else assert.equal(e.mesure, null, `étape ${e.id} : pas de preuve à montrer`);
  }
  const e27 = etapes.find((e) => e.id === '27');
  assert.deepEqual(e27.mesure, {
    aJuger: true,
    registre: 'enregistre',
    lancement: { version: 'score-marche-v1', quoi: 'Modèle de score ancré sur le marché', le: '2026-11-09', heure: '2026-11-09T07:52:10.000Z' },
    variantes: 3,
    jugement: {
      le: principal.le,
      quoi: '1N2, perte log',
      mesure: 'perte-log',
      principal: true,
      version: null,
      lancement: null,
      verdict: 'pas-prouve',
      raison: 'La fourchette contient zéro.',
      n: { matchs: 1240, blocs: 1240, lignes: 1240 },
      fenetre: { de: '2026-11-10', a: '2026-11-24' },
      enPourcent: { gain: 0.4, fourchette: [-0.2, 1], quoi: 'de perte log en moins' },
      seuil: { variantes: 3 }
    }
  });
  // Lancée, pas encore jugée ; à juger, pas encore lancée.
  assert.deepEqual(etapes.find((e) => e.id === '8').mesure.lancement.version, 'opportunites-v2');
  assert.deepEqual(etapes.find((e) => e.id === '29').mesure, { aJuger: true, registre: 'enregistre', lancement: null, variantes: 0, jugement: null });
  // Sans jugement principal : le dernier.
  const seul = nouveauFichier();
  enregistrerJugement('30', { le: '2026-11-25T02:10:00.000Z', verdict: 'moins-bon' }, { fichier: seul });
  enregistrerJugement('30', { le: '2026-11-26T02:10:00.000Z', verdict: 'pas-assez-de-matchs' }, { fichier: seul });
  assert.equal(etatPourFeuilleDeRoute({ fichier: seul }).etapes['30'].jugement.verdict, 'pas-assez-de-matchs');
  // La racine : le registre et sa provenance.
  assert.deepEqual(etat.mesureRegistre, { source: 'enregistre', fichier, probleme: null, majLe: lire(fichier).majLe, nombre: 2 });
  assert.equal(etat.provenance.registre, fichier);
  // Par défaut, la page lit le registre de data/runtime (sans jamais l'écrire) : ce test ne le lit pas, il passe le sien.
  assert.match(FICHIER_REGISTRE, /server[\\/]data[\\/]runtime[\\/]registre-mesure\.json$/);
});

test('feuille de route : un registre illisible ne fait pas tomber la page — plan, historique et notes intacts, chaque étape à juger le dit', () => {
  const fichier = nouveauFichier();
  fs.writeFileSync(fichier, JSON.stringify({ version: 1, etapes: [] }));
  const mesure = etatPourFeuilleDeRoute({ fichier });
  const etat = etatFeuilleDeRoute({ maintenant: MIDI, pierre: PIERRE_VIDE, mesure });
  assert.equal(etat.lots.flatMap((l) => l.etapes).length, 49);
  // Étape 27 : une étape que l'historique ne raconte qu'en partie (lignes « partielle ») n'est pas terminée.
  assert.equal(etat.avancement.terminees, new Set(HISTORIQUE.filter((h) => !h.partielle).map((h) => h.etape)).size);
  assert.equal(etat.mesureRegistre.source, 'illisible');
  assert.match(etat.mesureRegistre.probleme, /forme inattendue \(« etapes » n’est pas un objet\)/);
  for (const e of etat.lots.flatMap((l) => l.etapes)) {
    if (ETAPES_A_JUGER.includes(e.id)) assert.deepEqual(e.mesure, { aJuger: true, registre: 'illisible', lancement: null, variantes: null, jugement: null }, e.id);
    else assert.equal(e.mesure, null, e.id);
  }
  assert.equal(IDS_ETAPES.length, 49);
});

test('branchements : le registre est hors de l’empreinte des données ; une seule ligne au démarrage du serveur, jamais bloquante', () => {
  const lireSource = (...chemin) => fs.readFileSync(path.join(SERVEUR, 'src', ...chemin), 'utf8');
  assert.match(lireSource('data', 'repositories', 'dataVersionRepository.js'), /SETTINGS_FILES = new Set\([^)]*'registre-mesure\.json'/);
  const serveur = lireSource('server.js');
  assert.match(serveur, /^import \{ enregistrerLancements \} from '\.\/bench\/trialsRegistry\.js';$/m);
  const appels = serveur.split('\n').filter((l) => /enregistrerLancements\(/.test(l));
  assert.equal(appels.length, 1, 'un seul appel');
  assert.match(appels[0], /^\s*try \{ enregistrerLancements\(\); \} catch \(error\) \{ console\.warn\(/, 'dans un try/catch, avec console.warn');
  // Après l'écoute du port : le démarrage n'attend pas le registre.
  assert.ok(serveur.indexOf('app.listen(') < serveur.indexOf('enregistrerLancements();'));
});

test('les tests passent leur registre : aucun appel à la page sans « mesure » dans le processus des tests — le registre de data/runtime est, dans le dépôt, celui de Pierre', () => {
  // Le nom est recomposé pour que ce test ne se trouve pas lui-même.
  const APPEL = ['etatFeuille', 'DeRoute('].join('');
  const dossier = path.join(SERVEUR, 'test');
  let appels = 0;
  for (const nom of fs.readdirSync(dossier).filter((f) => f.endsWith('.test.mjs'))) {
    const source = fs.readFileSync(path.join(dossier, nom), 'utf8');
    for (let i = source.indexOf(APPEL); i >= 0; i = source.indexOf(APPEL, i + 1)) {
      // L'argument de l'appel, parenthèses équilibrées (un appel peut tenir sur plusieurs lignes).
      let profondeur = 0;
      let j = i + APPEL.length - 1;
      for (; j < source.length; j++) {
        if (source[j] === '(') profondeur++;
        else if (source[j] === ')' && --profondeur === 0) break;
      }
      // « mesure: … » ou la forme courte « { …, mesure } ».
      assert.match(source.slice(i, j + 1), /[{,]\s*mesure\s*[:,}]/, `${nom}, position ${i} : un appel à la page sans « mesure » lirait le vrai registre`);
      appels++;
    }
    assert.doesNotMatch(source, new RegExp(`${['etatPour', 'FeuilleDeRoute'].join('')}\\(\\s*\\)`), `${nom} : le registre lu sans fichier d'essai`);
  }
  assert.ok(appels >= 15, `${appels} appels trouvés : la recherche ne voit plus les appels`);
});

/** Compte les écritures d'un fichier pendant `faire` (writeJsonAtomic finit chaque écriture par un renommage vers lui). */
function ecrituresDe(fichier, faire) {
  const vrai = fs.renameSync;
  let n = 0;
  fs.renameSync = (de, vers) => {
    if (path.resolve(String(vers)) === path.resolve(fichier)) n++;
    return vrai(de, vers);
  };
  try {
    const r = faire();
    return { r, ecritures: n };
  } finally {
    fs.renameSync = vrai;
  }
}

test('étape 27 (vérification du branchement, constat 3) — declarerVariantes : la candidate et ses 319 variantes en UNE écriture du registre de la mesure (sous OneDrive, 320 de suite étaient un risque de verrou), aucun doublon, K = 320 ; rien de neuf → aucune écriture ; une variante fautive → rien d’écrit ; même contenu qu’une par une ; mettreLaCandidateEnEssai s’en sert', async () => {
  const { CANDIDATE_EN_ESSAI } = await import('../src/core/engine/engineVersions.js');
  const fichier = nouveauFichier();
  const options = { fichier, maintenant: Date.parse('2026-10-22T05:00:00Z') };
  const liste = [{ id: CANDIDATE_EN_ESSAI.id, quoi: CANDIDATE_EN_ESSAI.quoi, ou: 'a-blanc' }, ...CANDIDATE_EN_ESSAI.variantes.map((v) => ({ id: v.id, quoi: v.quoi, ou: 'construction' }))];
  assert.equal(liste.length, 320);
  const premiere = ecrituresDe(fichier, () => declarerVariantes('27', liste, options));
  assert.equal(premiere.ecritures, 1, 'une seule écriture pour 320 variantes');
  assert.equal(premiere.r.ajoutees.length, 320);
  assert.deepEqual(premiere.r.variantes[0], { id: 'modele-buts-v1', change: true, variante: { id: 'modele-buts-v1', quoi: CANDIDATE_EN_ESSAI.quoi, ou: 'a-blanc', le: '2026-10-22T05:00:00.000Z' } });
  const rangees = lire(fichier).etapes['27'].variantes;
  assert.equal(rangees.length, 320);
  assert.equal(new Set(rangees.map((v) => v.id)).size, 320, 'aucun doublon');
  assert.equal(compterVariantes('27', options), 320, 'K = 320');
  // Rien de neuf : aucune écriture, le fichier intact.
  const avant = photo(fichier);
  const seconde = ecrituresDe(fichier, () => declarerVariantes('27', liste, options));
  assert.equal(seconde.ecritures, 0);
  assert.ok(seconde.r.variantes.every((v) => v.change === false && v.variante === null));
  assert.deepEqual(photo(fichier), avant);
  // Un identifiant répété DANS la liste : compté une fois.
  const autre = nouveauFichier();
  const double = declarerVariantes('27', [{ id: 'x', quoi: 'a' }, { id: 'x', quoi: 'b' }], { ...options, fichier: autre });
  assert.deepEqual(double.variantes.map((v) => v.change), [true, false]);
  assert.equal(lire(autre).etapes['27'].variantes.length, 1);
  // Une variante fautive : rien d'écrit (tout est vérifié avant d'écrire).
  const fautif = nouveauFichier();
  assert.throws(() => declarerVariantes('27', [{ id: 'y' }, { id: '' }], { ...options, fichier: fautif }), /l’identifiant d’une variante est vide/);
  assert.equal(fs.existsSync(fautif), false);
  // Le même contenu que la déclaration une par une (même ordre, mêmes champs), en 320 écritures au lieu d'une.
  const unParUn = nouveauFichier();
  const lent = ecrituresDe(unParUn, () => {
    for (const v of liste) declarerVariante('27', v, { ...options, fichier: unParUn });
  });
  assert.equal(lent.ecritures, 320);
  assert.deepEqual(lire(unParUn).etapes, lire(fichier).etapes);
  // La mise en essai de la candidate s'en sert : plus de boucle d'écritures.
  const code = fs.readFileSync(path.join(SERVEUR, 'src', 'core', 'engine', 'engineVersions.js'), 'utf8');
  assert.match(code, /const declarees = declarerVariantes\(/);
  assert.doesNotMatch(code, /for \(const v of c\.variantes \?\? \[\]\) declarerVariante\(/);
});
