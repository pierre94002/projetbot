/**
 * recetteCauses.test.mjs — LES CAUSES CONNUES, LE CLASSEUR, LES DÉCISIONS ET LE DÉCOMPTE DE LA RECETTE (étape 47, lot 1,
 * passe P3, 17/11/2026). T-C1 à T-C14 (conception § 7.1, corrigée par CR-15, CR-18, CR-19, CR-22 à CR-30), plus :
 *   - décision 23 c : un type inconnu ou une erreur n'est JAMAIS 'info' ;
 *   - consigne § 2.3 P3-P4 : la fermeture des imports de recette.mjs n'atteint ni refreshStatusRepository.js, ni
 *     matchStatsDb.js, ni env.js ;
 *   - CR-19 : l'empreinte des trois fichiers ne change pas avec les fins de ligne (CRLF) ni le BOM.
 * Aucun réseau, aucune base, aucun serveur ; recette.mjs n'est lancé que sur des dossiers temporaires (mkdtemp sous
 * os.tmpdir()), et UNE fois sans chemins pour vérifier qu'il refuse les chemins par défaut sous un essai.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CAUSES_CONNUES } from '../src/data/recette/causesConnues.js';
import * as K from '../src/data/recette/classerLesEvenements.js';
import * as W from '../src/data/recette/journalWindows.js';
import * as J from '../src/data/recette/journalDeLaRecette.js';
import * as C from '../src/data/recette/calendrierDeLaRecette.js';
import * as R from '../scripts/recette.mjs';

// P4b-1 (RC-11) : lancé par `node` seul (sans node --test), aucun chemin par défaut ne doit mener chez Pierre. Les chemins
// par défaut sont refusés dès que CM_TEST_DOSSIER est posé ; il l'est ici, avant tout appel (lu à l'appel, jamais à l'import).
if (!process.env.NODE_TEST_CONTEXT && !process.env.CM_TEST_DOSSIER) process.env.CM_TEST_DOSSIER = '1';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SERVEUR = path.resolve(ICI, '..');
const RECETTE_J0 = (debut, relances = []) => Object.freeze({ rodageDepuis: null, debut, jours: 14, relances, empreinteDesCauses: null, debutDeLaFenetre: null });

/** La liste avec les niveaux de J0 relevés (comme au lot 1b). */
function avecNiveaux(niveaux = { anomalies: 21, nonCalcules: 11, inconnus: 11 }, championnats = ['Liga A', 'Liga B']) {
  return CAUSES_CONNUES.map((c) => ({
    ...c,
    bornes: Object.fromEntries(Object.entries(c.bornes ?? {}).map(([k, v]) => [k, 'liste' in v ? { liste: championnats } : { niveauJ0: niveaux[k] ?? null }]))
  }));
}
const CAUSES = avecNiveaux();
const RECETTE_CTX = { rodage: false, j0: '2026-11-20' };
const classer = (ev, ctx = RECETTE_CTX, causes = CAUSES) => K.classerUnEvenement(ev, ctx, causes);
const etape = (cle, statut, resume, extra = {}) => ({ type: statut === 'error' ? 'etape-en-echec' : 'etape-en-alerte', cle, texte: `${cle} : ${resume}`, details: { statut, ...extra } });
const constat = (controle, id, classe, extra = {}) => ({ type: 'constat-nouveau', cle: id, details: { controle, classe, trouveLe: '2026-11-22T04:00:00Z', ...extra } });
const couleur = (cle, vers) => ({ type: 'controle-couleur', cle, details: { de: 'vert', vers } });
const fotmob = (vers, d = {}) => ({ type: 'fotmob', cle: vers, details: { vers, ...d } });
const NBSP = String.fromCharCode(0x202f);

// --- T-C1 -----------------------------------------------------------------------------------------------------------

/** Un exemple par critère : [événement, contexte?] → la cause attendue (d'office), ou { aLaMain: true }. */
const EXEMPLES = {
  'premier-demarrage-du-journal': [[{ type: 'premier-demarrage-du-journal', classe: 'connue', cause: 'premier-demarrage-du-journal' }]],
  'veille-du-pc': [[{ type: 'trou', classe: 'connue', cause: 'veille-du-pc' }], [{ type: 'trou-relu', classe: 'connue', cause: 'veille-du-pc' }]],
  'redemarrage-du-pc': [[{ type: 'redemarrage-du-pc', classe: 'connue', cause: 'redemarrage-du-pc' }]],
  'mise-en-service': [[{ type: 'mise-en-service', classe: 'connue', cause: 'mise-en-service' }]],
  'audit-buteurs-gardiens': [
    [etape('controle', 'warn', `Depuis le 2026-10-21 : 1${NBSP}234 rencontres contrôlées, 30 anomalies (buteurs : 18, gardien : 2, fichiers : 1). Rien n'est corrigé automatiquement.`)],
    [{ type: 'alerte-posee', cle: 'audit', details: { signature: '{"parType":["buteurs"]}', nombres: { anomalies: 30 } } }],
    [constat('buteurs-score', 'buteurs-score:impossible:x', 'orange')],
    [constat('gardiens-score', 'gardiens-score:impossible:y', 'orange')],
    [couleur('buteurs-score', 'orange')]
  ],
  'calendriers-incomplets': [
    [etape('simulationSaisons', 'warn', 'Fins de saison : 37 championnats simulés 10 000 fois, 12 non calculés (Serie B - Italy : calendrier incomplet)')],
    [{ type: 'alerte-changee', cle: 'simulationSaisons', details: { avant: '{"inconnus":["a","b"]}', signature: '{"inconnus":["a"]}', nombres: { inconnus: 1 } } }]
  ],
  'classement-officiel': [[constat('classement-officiel', 'classement-officiel:manquant:z', 'orange')], [couleur('classement-officiel', 'orange')]],
  'chiffres-non-publies': [[constat('zeros-non-releves', 'zeros-non-releves:zero:1', 'orange', { league: 'Liga A' })], [constat('tirs-non-releves', 'tirs-non-releves:x', 'orange', { league: 'Liga B' })]],
  'hors-reperes': [[constat('hors-reperes-statistiques', 'hors-reperes-statistiques:L|2026|tirs', 'orange')], [couleur('match-aberrant', 'orange')]],
  'score-corrige': [[constat('score-calendrier', 'score-calendrier:2026-11-22 A 3-0 B', 'rouge'), { aLaMain: true }]],
  'carnet-de-sante': [[etape('carnetSante', 'warn', '120 rencontres contrôlées : 4 213 anomalies au carnet, dont 25 nouvelle(s) — 5 erreurs nouvelles'), { aLaMain: true }]],
  'controle-du-jour': [[etape('controleQuotidien', 'warn', 'Feu orange : 40 contrôles'), { ctx: { ...RECETTE_CTX, controle: { controles: [{ cle: 'classement-officiel', classe: 'rouge', statutLe: 'orange', constats: [{ id: 'classement-officiel:manquant:1', classe: 'orange', trouveLe: '2026-11-22T00:00:00Z' }] }] } } }]],
  'ia-echec-isole': [[etape('iaAutoAvantMatch', 'warn', '12 rencontres à venir entre 1 h et 30 h sans analyse : 10 analysées, 2 échecs.')], [etape('iaAutoApresMatch', 'warn', '8 rencontres terminées avec analyse avant-match, sans revue : 7 revues faites, 1 échec.')]],
  'ia-plafond-econome': [[etape('iaAutoAvantMatch', 'warn', 'plafond du jour atteint (150 analyses)')]],
  'quota-abonnement': [[{ type: 'ia-echecs-de-suite', cle: '2026-11-22', details: { echecs: 16, messagesDEchec: ['You’ve hit your session limit · resets 3:50am (Europe/Paris)'] } }]],
  'calcul-a-part-exit-scelles': [
    [etape('tableJourJ', 'error', 'contrôle à part arrêté sans réponse (code 0) ')],
    [etape('simulationMatchs', 'error', 'calcul à part arrêté sans réponse (code 0)')]
  ],
  'calcul-a-part-exit-coupes': [[etape('coupesEtMatchsAPart', 'error', 'calcul à part arrêté sans réponse (code 0)'), { rechute: true }]],
  'calcul-a-part-exit-corriges': [[etape('cartonsEtCorners', 'error', 'calcul à part arrêté sans réponse (code 0)'), { rechute: true }], [etape('carteOuParier', 'error', 'calcul de la carte arrêté sans réponse (code 0)'), { rechute: true }]],
  'fotmob-panne-detectee': [[fotmob('en-panne', { nature: 'reseau', detecteParLAppli: true, raison: '5 réponses en échec de suite' })]],
  'fotmob-a-surveiller': [[fotmob('a-surveiller', { nature: 'serveur', detecteParLAppli: true, raison: '2 réponse(s) en échec de suite' })]],
  'direct-suspendu-fotmob': [[{ type: 'direct-suspendu', cle: 'direct', details: {} }, { ctx: { ...RECETTE_CTX, fotmob: 'en-panne' } }]],
  'arret-par-pierre': [[{ type: 'arret-du-serveur', cle: '1', classe: 'a-expliquer' }, { aLaMain: true }], [{ type: 'redemarrage-rapide', cle: '1', classe: 'a-expliquer' }, { aLaMain: true }]],
  'sauvegarde-decalee': [[{ type: 'sans-sauvegarde', cle: 'sauvegarde', details: {} }, { aLaMain: true }]],
  'passe-figee-par-la-veille': [[etape('feuilles', 'warn', 'délai dépassé', { figeeParLaVeille: true }), { aLaMain: true }]],
  'presents-au-depart': [[{ type: 'alerte-posee', cle: 'tableJourJ', details: { signature: '{"ecarts":[1]}' } }, { ctx: { ...RECETTE_CTX, instantane: { alertes: { tableJourJ: '{"ecarts":[1]}' } } } }]]
};

test('T-C1 chaque cause de la liste reconnaît son exemple (un par critère) ; les causes « à la main » le reçoivent à la main, jamais d’office', () => {
  for (const c of CAUSES_CONNUES) assert.ok(EXEMPLES[c.id]?.length, `cause sans exemple : ${c.id}`);
  for (const [id, liste] of Object.entries(EXEMPLES)) {
    const cause = CAUSES.find((c) => c.id === id);
    assert.ok(cause, `exemple d’une cause absente : ${id}`);
    for (const [ev, o = {}] of liste) {
      const r = classer(ev, o.ctx ?? RECETTE_CTX);
      if (o.aLaMain) {
        assert.equal(r.classe, 'a-expliquer', `${id} : jamais d’office (${ev.type})`);
        assert.equal(K.peutEtreRattache(ev, cause).ok, true, `${id} : rattachable à la main`);
      } else if (o.rechute) {
        assert.deepEqual([r.classe, r.cause, r.rechute], ['nouvelle', id, true], `${id} : rechute`);
      } else assert.deepEqual([r.classe, r.cause], ['connue', id], `${id} : ${ev.type} ${ev.cle ?? ''} → ${JSON.stringify(r)}`);
    }
  }
});

test('T-C1 la forme de la liste : ids uniques, statuts, modes, dates, explications ; aucun motif trop large', () => {
  const ids = CAUSES_CONNUES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'ids uniques');
  const QUELCONQUE = ['', 'x', 'texte quelconque sans rapport : 3 choses', 'feuilles : ENOSPC disque plein'];
  for (const c of CAUSES_CONNUES) {
    assert.ok(['active', 'corrigee'].includes(c.statut), `${c.id} : statut`);
    assert.ok(['office', 'a-la-main'].includes(c.mode), `${c.id} : mode`);
    assert.ok(C.estUnJour(c.depuis), `${c.id} : depuis`);
    assert.ok(c.titre.length > 10 && c.explication.length > 40, `${c.id} : titre et explication`);
    if (c.mode === 'office') assert.ok(Object.keys(c.reconnait).length > 0, `${c.id} : rien d’office`);
    else assert.ok(Object.keys(c.aLaMain).length > 0 && Object.keys(c.reconnait).length === 0, `${c.id} : à la main sans aLaMain`);
    for (const r of c.reconnait.etapes ?? []) {
      assert.ok(r.motif instanceof RegExp, `${c.id}/${r.cle} : motif`);
      for (const q of QUELCONQUE) assert.equal(r.motif.test(q), false, `${c.id}/${r.cle} : motif trop large (B20) — « ${q} »`);
    }
  }
});

// --- décision 23 c ----------------------------------------------------------------------------------------------

test('décision 23 c : un type inconnu ou une erreur n’est JAMAIS « info » (liste fermée), au classeur comme au journal', () => {
  assert.deepEqual(Object.keys(K.TYPES_INFO).sort(), ['alerte-levee', 'controle-couleur', 'direct-repris', 'fotmob', 'restauration', 'sauvegarde']);
  for (const ev of [
    { type: 'type-inconnu', classe: 'info' },
    { type: 'etape-en-echec', cle: 'feuilles', classe: 'info', texte: 'feuilles : x', details: { statut: 'error' } },
    { type: 'sauvegarde-en-echec', classe: 'info' },
    { type: 'restauration-pas-saine', classe: 'info' },
    { type: 'controle-couleur', cle: 'inconnu', classe: 'info', details: { vers: 'rouge' } },
    { type: 'fotmob', cle: 'inconnu', classe: 'info', details: { vers: 'inconnu' } },
    { type: 'arret-sur-erreur', classe: 'info' },
    { type: 'regle-enfreinte', classe: 'info' }
  ]) {
    assert.notEqual(K.classerUnEvenement(ev, RECETTE_CTX, CAUSES).classe, 'info', `${ev.type} classé info`);
    assert.notEqual(K.classerSansListe(ev).classe, 'info', `${ev.type} classé info sans liste`);
    assert.equal(K.estInfoPermise(ev), false, ev.type);
  }
  for (const ev of [{ type: 'alerte-levee', classe: 'info' }, { type: 'controle-couleur', classe: 'info', details: { vers: 'vert' } }, { type: 'fotmob', classe: 'info', details: { vers: 'ok' } }]) assert.equal(K.classerUnEvenement(ev, RECETTE_CTX, CAUSES).classe, 'info', ev.type);
});

test('décision 23 c au journal : un classeur qui rend « info » pour une étape en échec est corrigé en « à expliquer »', async () => {
  const b = banc();
  try {
    b.ecrire('runtime/refresh-status.json', { history: [{ id: 'p1', reason: 'périodique', startedAt: '2026-11-22T08:00:00Z', finishedAt: '2026-11-22T08:30:00Z', outcome: 'error', steps: [{ key: 'feuilles', status: 'error', summary: 'boum' }] }], alerts: {} });
    const j = b.creer({ classer: () => ({ classe: 'info', cause: null }) });
    await j.tour();
    const ev = j.etat.resume.evenements.find((e) => e.type === 'etape-en-echec');
    assert.equal(ev.classe, 'a-expliquer');
  } finally {
    b.nettoyer();
  }
});

// --- T-C2, T-C3, T-C4 -------------------------------------------------------------------------------------------

test('T-C2 un contrôle rouge inconnu → « à expliquer » ; un rouge d’un contrôle connu aussi (CR-22) ; non tranché au bilan → compté nouveau', () => {
  assert.equal(classer(constat('controle-inconnu', 'controle-inconnu:x:1', 'rouge')).classe, 'a-expliquer');
  assert.equal(classer(couleur('controle-inconnu', 'rouge')).classe, 'a-expliquer');
  assert.equal(classer(constat('classement-officiel', 'classement-officiel:impossible:Bes', 'rouge')).classe, 'a-expliquer', 'rouge « impossible » jamais d’office');
  assert.equal(classer(constat('buteurs-score', 'buteurs-score:impossible:q', 'rouge')).classe, 'a-expliquer');
  assert.equal(classer(couleur('classement-officiel', 'rouge')).classe, 'a-expliquer');
  // Non tranché à J14 + 48 h : compté nouveau.
  const ev = { id: '2026-11-22|constat-nouveau|x|04:00:00', le: '2026-11-22T04:00:00Z', type: 'constat-nouveau', cle: 'x', classe: 'a-expliquer' };
  const jours = joursPleins('2026-11-20', { '2026-11-22': [ev] });
  assert.equal(K.decompte({ jours, recette: RECETTE_J0('2026-11-20'), aujourdhui: '2026-12-05' }).etat, 'en-attente');
  const tard = K.decompte({ jours, recette: RECETTE_J0('2026-11-20'), aujourdhui: '2026-12-07' });
  assert.equal(tard.etat, 'pas-tenue');
  assert.equal(tard.nouvelles.length, 1);
});

test('T-C3 un contrôle orange inconnu → « à expliquer »', () => {
  assert.equal(classer(couleur('club-deux-fois', 'orange')).classe, 'a-expliquer');
  assert.equal(classer(constat('club-deux-fois', 'club-deux-fois:identite:1', 'orange')).classe, 'a-expliquer');
  assert.equal(classer(constat('controle-neuf', 'controle-neuf:a', 'orange')).classe, 'a-expliquer');
  // Un orange d'un contrôle connu, mais d'un championnat neuf (chiffres-non-publies) : à expliquer.
  assert.equal(classer(constat('zeros-non-releves', 'zeros-non-releves:zero:2', 'orange', { league: 'Liga Z' })).classe, 'a-expliquer');
});

test('T-C4 une étape en échec au message inconnu → « à expliquer » ; au motif connu → connue ; nombre au-delà de la borne → « à expliquer »', () => {
  assert.equal(classer(etape('tableJourJ', 'error', 'ENOSPC : disque plein')).classe, 'a-expliquer');
  assert.equal(classer(etape('feuilles', 'error', 'calcul à part arrêté sans réponse (code 0)')).classe, 'a-expliquer', 'exit hors des modules nommés');
  assert.equal(classer(etape('iaAutoAvantMatch', 'error', '3 rencontres sans analyse : 0 analysée, 3 échecs — arrêt après plusieurs pannes de Claude Code d’affilée (quota, jeton ou réseau)')).classe, 'a-expliquer', 'jamais sur le résumé');
  assert.deepEqual([classer(etape('tableJourJ', 'error', 'contrôle à part arrêté sans réponse (code 0)')).classe], ['connue']);
  assert.equal(classer(etape('controle', 'warn', 'Depuis le 2026-10-21 : 900 rencontres contrôlées, 200 anomalies (buteurs : 190, gardien : 9, fichiers : 1).')).classe, 'a-expliquer', 'borne 21 × 1,5 + 5 = 36');
  assert.equal(classer(etape('iaAutoAvantMatch', 'warn', '20 rencontres à venir sans analyse : 10 analysées, 4 échecs.')).classe, 'a-expliquer', 'plus de 3 échecs');
  // Borne non relevée : connue au rodage seulement.
  const brut = etape('controle', 'warn', 'Depuis le 2026-10-21 : 900 rencontres contrôlées, 21 anomalies (buteurs : 18, gardien : 2, fichiers : 1).');
  assert.equal(K.classerUnEvenement(brut, RECETTE_CTX).classe, 'a-expliquer');
  assert.equal(K.classerUnEvenement(brut, { rodage: true }).classe, 'connue');
  // Alerte : un problème ajouté → à expliquer (CR-18).
  assert.equal(classer({ type: 'alerte-changee', cle: 'simulationSaisons', details: { avant: '{"inconnus":["a"]}', signature: '{"inconnus":["a","b"]}', nombres: { inconnus: 2 } } }).classe, 'a-expliquer');
  assert.equal(classer({ type: 'alerte-au-dela-de-la-borne', cle: 'audit', details: {} }).classe, 'a-expliquer');
  assert.deepEqual(K.depassementDeLAlerte('audit', { anomalies: 40 }, CAUSES), { cause: 'audit-buteurs-gardiens', nom: 'anomalies', valeur: 40, borne: 36 });
  assert.equal(K.depassementDeLAlerte('audit', { anomalies: 30 }, CAUSES), null);
});

// --- T-C5 -----------------------------------------------------------------------------------------------------------

test('T-C5 une cause « corrigée » qui revient → rechute, comptée', () => {
  const r = classer(etape('coupesEtMatchsAPart', 'error', 'calcul à part arrêté sans réponse (code 0) '));
  assert.deepEqual([r.classe, r.cause, r.rechute], ['nouvelle', 'calcul-a-part-exit-coupes', true]);
  const ev = { id: '2026-11-23|etape-en-echec|coupesEtMatchsAPart|05:00:00', le: '2026-11-23T05:00:00Z', type: 'etape-en-echec', cle: 'coupesEtMatchsAPart', classe: r.classe, cause: r.cause, rechute: true };
  const d = K.decompte({ jours: joursPleins('2026-11-20', { '2026-11-23': [ev] }), recette: RECETTE_J0('2026-11-20'), aujourdhui: '2026-11-25' });
  assert.equal(d.etat, 'pas-tenue');
  assert.equal(d.nouvelles[0].rechute, true);
});

// --- T-C6, T-C7 -----------------------------------------------------------------------------------------------------

test('T-C6 trou même pid : veille au journal → veille ; journal illisible → « à expliquer » (CR-15) ; lisible sans veille → « à expliquer »', () => {
  const de = Date.parse('2026-11-22T01:00:00Z');
  const a = Date.parse('2026-11-22T07:00:00Z');
  const veille = { lisible: true, evenements: [{ fournisseur: 'Microsoft-Windows-Kernel-Power', numero: 42, type: 'mise-en-veille', ms: de + 60_000, le: 'x' }, { fournisseur: 'Microsoft-Windows-Kernel-Power', numero: 107, type: 'reprise', ms: a - 60_000, le: 'y' }] };
  const evDuTrou = (lecture) => {
    const t = W.expliquerLeTrou({ de, a, lecture });
    return classer({ type: 'trou', classe: t.classe, cause: t.cause });
  };
  const avecVeille = W.expliquerLeTrou({ de, a, lecture: veille });
  assert.equal(avecVeille.cause, 'veille-du-pc', JSON.stringify(avecVeille));
  assert.deepEqual(evDuTrou(veille), { classe: 'connue', cause: 'veille-du-pc' });
  assert.equal(evDuTrou({ lisible: false, probleme: 'accès refusé' }).classe, 'a-expliquer');
  assert.equal(evDuTrou({ lisible: true, evenements: [] }).classe, 'a-expliquer');
  // Une cause « connue » que la liste ne porte pas : à expliquer.
  assert.equal(classer({ type: 'trou', classe: 'connue', cause: 'cause-inventee' }).classe, 'a-expliquer');
});

test('T-C7 nouveau pid : annonce + code changé → mise en service ; démarrage du PC → redémarrage ; annonce sans code changé, ou rien → « à expliquer »', () => {
  const demarreLe = Date.parse('2026-11-22T10:00:00Z');
  const annonce = { le: '2026-11-22T09:40:00Z', quoi: 'lot 1' };
  const base = { demarreLe, dernierTourAvant: '2026-11-22T09:35:00Z', ecartMs: 25 * 60_000 };
  const viaClasseur = (x) => classer({ type: x.type, classe: x.classe, cause: x.cause });
  assert.deepEqual(viaClasseur(J.classerLeDemarrage({ ...base, annonce, code: 'change' })), { classe: 'connue', cause: 'mise-en-service' });
  assert.equal(viaClasseur(J.classerLeDemarrage({ ...base, annonce, code: 'inchange' })).classe, 'a-expliquer', 'annonce sans code changé (B23)');
  assert.equal(viaClasseur(J.classerLeDemarrage({ ...base, annonce: null, code: 'change' })).classe, 'a-expliquer', 'code changé sans annonce');
  // P4b-1 (RC-4) : l'arrêt propre du PC doit suivre le dernier tour d'avant (au plus 25 min) ; une date illisible n'explique rien.
  assert.deepEqual(viaClasseur(J.classerLeDemarrage({ ...base, pc: { demarrages: ['x'], arretsPropres: ['2026-11-22T09:40:00Z'], arretsBrutaux: [] } })), { classe: 'connue', cause: 'redemarrage-du-pc' });
  assert.equal(viaClasseur(J.classerLeDemarrage({ ...base, pc: { demarrages: ['x'], arretsPropres: ['y'], arretsBrutaux: [] } })).classe, 'a-expliquer', 'arrêt du PC sans date lisible');
  assert.equal(viaClasseur(J.classerLeDemarrage({ ...base, pc: { demarrages: ['x'], arretsPropres: [], arretsBrutaux: ['z'] } })).classe, 'a-expliquer', 'arrêt brutal');
  assert.equal(viaClasseur(J.classerLeDemarrage({ ...base })).classe, 'a-expliquer');
  assert.equal(viaClasseur(J.classerLeDemarrage({ ...base, marque: { type: 'erreur', message: 'boum' } })).classe, 'nouvelle');
});

// --- T-C8 -----------------------------------------------------------------------------------------------------------

test('T-C8 FotMob en panne détectée par l’appli (réseau ou serveur) → connue ; vue seulement par le journal → « à expliquer » (détection manquée) ; accès refusé, forme → « à expliquer »', () => {
  const maintenant = Date.parse('2026-11-22T10:00:00Z');
  const lu = (sante, refresh = null) => K.etatFotmobLu({ sante, refresh, maintenant });
  const ev = (f) => fotmob(f.etat, f);
  const panne = lu({ erreursDeSuite: 6, derniereErreur: { nature: 'reseau', le: '2026-11-22T09:50:00Z' } });
  assert.deepEqual([panne.etat, panne.detecteParLAppli], ['en-panne', true]);
  assert.deepEqual(classer({ ...ev(panne), details: { ...panne, vers: panne.etat } }), { classe: 'connue', cause: 'fotmob-panne-detectee' });
  const manquee = lu({ erreursDeSuite: 0 }, { history: [{ steps: [{ key: 'feuilles', status: 'error' }, { key: 'calendrier', status: 'error' }] }] });
  assert.deepEqual([manquee.etat, manquee.detecteParLAppli], ['en-panne', false]);
  assert.equal(classer({ ...ev(manquee), details: { ...manquee, vers: manquee.etat } }).classe, 'a-expliquer');
  // Nature connue mais l’appli ne l’a pas dit (B24) : à expliquer (« à surveiller » vient toujours du compteur de l’appli).
  assert.equal(classer(fotmob('en-panne', { nature: 'reseau', detecteParLAppli: false })).classe, 'a-expliquer');
  for (const nature of ['acces-refuse', 'limite', 'illisible', 'autre']) {
    assert.equal(classer(fotmob('en-panne', { nature, detecteParLAppli: true })).classe, 'a-expliquer', nature);
    assert.equal(classer(fotmob('a-surveiller', { nature, detecteParLAppli: true, raison: '2 réponse(s) en échec de suite' })).classe, 'a-expliquer', nature);
  }
  const forme = lu({ erreursDeSuite: 0, parType: { equipe: { derniereForme: { attendue: false } } } });
  assert.equal(classer({ ...ev(forme), details: { ...forme, vers: forme.etat } }).classe, 'a-expliquer');
  assert.equal(classer({ type: 'direct-suspendu', cle: 'direct', details: {} }, { ...RECETTE_CTX, fotmob: 'ok' }).classe, 'a-expliquer', 'direct suspendu hors épisode FotMob');
});

// --- T-C9 -----------------------------------------------------------------------------------------------------------

test('T-C9 la classe est figée à l’arrivée : changer la liste ensuite ne reclasse rien (ni au journal, ni à la lecture)', async () => {
  const b = banc();
  try {
    const p = (id, fin) => ({ id, reason: 'périodique', startedAt: fin, finishedAt: fin, outcome: 'partial', steps: [{ key: 'tableJourJ', status: 'error', summary: 'contrôle à part arrêté sans réponse (code 0)' }] });
    b.ecrire('runtime/refresh-status.json', { history: [p('p1', '2026-11-22T08:00:00Z')], alerts: {} });
    let causes = CAUSES;
    const j = b.creer({ classer: (ev, ctx) => K.classerUnEvenement(ev, ctx, causes) });
    await j.tour();
    causes = CAUSES.filter((c) => c.id !== 'calcul-a-part-exit-scelles');
    b.avancer(10);
    b.ecrire('runtime/refresh-status.json', { history: [p('p2', '2026-11-22T09:05:00Z'), p('p1', '2026-11-22T08:00:00Z')], alerts: {} });
    await j.tour();
    const r = b.lireJour('2026-11-22');
    const evs = r.evenements.filter((e) => e.type === 'etape-en-echec');
    assert.deepEqual(evs.map((e) => e.classe), ['connue', 'a-expliquer'], 'la première garde sa classe');
    // À la lecture (résumé, décompte) : la classe d'arrivée est reprise telle quelle.
    const lus = K.appliquerLesDecisions(evs, []);
    assert.deepEqual(lus.map((e) => e.classeFinale), ['connue', 'a-expliquer']);
  } finally {
    b.nettoyer();
  }
});

// --- T-C10 (decisions.json par recette.mjs) ---------------------------------------------------------------------------

test('T-C10 decisions.json : événement inconnu, cause inconnue, rattachement hors de la cause (CR-28), classe autre que « à expliquer », décision en double sans --remplacer → refusés', () => {
  const d = dossierRecette();
  try {
    const evA = { id: '2026-11-22|constat-nouveau|classement-officiel:impossible:Bes|04:00:00', le: '2026-11-22T04:00:00Z', type: 'constat-nouveau', cle: 'classement-officiel:impossible:Bes', details: { controle: 'classement-officiel', classe: 'rouge' }, classe: 'a-expliquer', cause: null };
    const evB = { id: '2026-11-22|etape-en-alerte|controle|05:00:00', le: '2026-11-22T05:00:00Z', type: 'etape-en-alerte', cle: 'controle', texte: 'controle : x', details: { statut: 'warn' }, classe: 'connue', cause: 'audit-buteurs-gardiens' };
    d.jour('2026-11-22', [evA, evB]);
    const L = (...a) => d.lancer(...a);
    assert.equal(L('--classer', '2026-11-22|x|y|00:00:00', '--cause', 'classement-officiel', '--raison', 'le score officiel est le bon').code, 1, 'événement inconnu');
    assert.equal(L('--classer', evA.id, '--cause', 'cause-inventee', '--raison', 'une raison').code, 1, 'cause inconnue');
    const horsCause = L('--classer', evA.id, '--cause', 'hors-reperes', '--raison', 'une raison');
    assert.equal(horsCause.code, 1, 'rattachement hors de la cause');
    assert.match(horsCause.sortie, /n’est pas dans la cause/);
    assert.equal(L('--classer', evA.id, '--cause', 'presents-au-depart', '--raison', 'une raison').code, 1, 'cause non rattachable');
    assert.equal(L('--classer', evB.id, '--cause', 'audit-buteurs-gardiens', '--raison', 'une raison').code, 1, 'déjà connue');
    assert.equal(L('--classer', evA.id, '--cause', 'classement-officiel', '--raison', '').code, 1, 'raison vide');
    assert.equal(fs.existsSync(d.chemins.decisions), false, 'rien écrit après des refus');
    assert.equal(L('--classer', evA.id, '--cause', 'classement-officiel', '--raison', 'Beşiktaş : le magasin dit 23-12, l’officiel 22-12 ; l’officiel est le bon').code, 0);
    assert.equal(L('--nouvelle', evA.id, '--raison', 'finalement une panne').code, 1, 'double sans --remplacer');
    assert.equal(L('--nouvelle', evA.id, '--raison', 'finalement une panne', '--remplacer').code, 0);
    const lu = JSON.parse(fs.readFileSync(d.chemins.decisions, 'utf8'));
    assert.deepEqual(lu.decisions.map((x) => x.sorte), ['rattachement', 'nouvelle']);
    assert.equal(K.appliquerLesDecisions([evA], lu.decisions)[0].classeFinale, 'nouvelle', 'la dernière décision s’applique');
    // decisions.json illisible : rien n'est réécrit.
    fs.writeFileSync(d.chemins.decisions, '{ illisible');
    assert.equal(L('--noter', '--raison', 'une note').code, 2);
    assert.equal(fs.readFileSync(d.chemins.decisions, 'utf8'), '{ illisible');
  } finally {
    d.nettoyer();
  }
});

// --- T-C11 (--verifier-les-causes) ------------------------------------------------------------------------------------

test('T-C11 --verifier-les-causes sur des fichiers d’exemple : tout couvert → 0 ; un trou → 1 et la liste ; laissé ouvert avec l’accord de Pierre → 0 ; fichier illisible → 2', () => {
  const d = dossierRecette();
  try {
    const refresh = { history: [{ id: 'p', finishedAt: '2026-11-22T08:00:00Z', steps: [{ key: 'controle', status: 'warn', summary: 'Depuis le 2026-10-21 : 900 rencontres contrôlées, 21 anomalies (buteurs : 18, gardien : 2, fichiers : 1).' }, { key: 'carnetSante', status: 'warn', summary: '4 213 anomalies au carnet, dont 2 erreurs nouvelles' }] }], alerts: { audit: { anomalies: 21, parType: { buteurs: 18 } }, cotes: null } };
    const controle = { controles: [{ cle: 'classement-officiel', classe: 'rouge', statutLe: 'orange', constats: [{ id: 'classement-officiel:manquant:1', classe: 'orange' }, { id: 'classement-officiel:impossible:2', classe: 'rouge' }] }, { cle: 'zeros-non-releves', classe: 'orange', statutLe: 'orange', constats: [{ id: 'zeros-non-releves:zero:1', classe: 'orange', league: 'Liga A' }] }] };
    d.runtime({ 'refresh-status.json': refresh, 'controle-quotidien.json': controle, 'sante-fotmob.json': { erreursDeSuite: 0, derniereReussite: 'x' } });
    const ok = d.lancer('--verifier-les-causes');
    assert.equal(ok.code, 0, ok.sortie);
    assert.match(ok.sortie, /TROUS 0/);
    assert.match(ok.sortie, /Niveaux de J0[^\n]*"anomalies":21/);
    assert.match(ok.sortie, /Liga A/);
    assert.match(ok.sortie, /empreinte [0-9a-f]{40}/);
    // Un trou : un contrôle orange qu'aucune cause ne couvre.
    controle.controles.push({ cle: 'club-deux-fois', classe: 'orange', statutLe: 'orange', constats: [{ id: 'club-deux-fois:identite:1', classe: 'orange' }] });
    d.runtime({ 'controle-quotidien.json': controle });
    const trou = d.lancer('--verifier-les-causes');
    assert.equal(trou.code, 1, trou.sortie);
    assert.match(trou.sortie, /TROU {7}constat-nouveau\|club-deux-fois:identite:1/);
    // Laissé ouvert à J0, avec l'accord de Pierre.
    assert.equal(d.lancer('--noter', '--ouvert-a-j0', 'constat-nouveau|club-deux-fois:identite:1', '--raison', 'accord de Pierre le 26/11 : club en double connu').code, 0);
    const ouvert = d.lancer('--verifier-les-causes');
    assert.equal(ouvert.code, 0, ouvert.sortie);
    assert.match(ouvert.sortie, /ouvert {5}constat-nouveau\|club-deux-fois/);
    // Illisible : échoue fermé.
    fs.writeFileSync(path.join(d.runtimeDir, 'refresh-status.json'), '{');
    assert.equal(d.lancer('--verifier-les-causes').code, 2);
    fs.rmSync(path.join(d.runtimeDir, 'refresh-status.json'));
    assert.equal(d.lancer('--verifier-les-causes').code, 2, 'absent');
  } finally {
    d.nettoyer();
  }
});

// --- T-C12 (CR-19) ----------------------------------------------------------------------------------------------------

test('T-C12 CR-19 : l’empreinte porte sur les trois fichiers normalisés ; CRLF et BOM ne la changent pas ; un seuil changé la change', () => {
  const dossier = path.join(SERVEUR, 'src', 'data', 'recette');
  const textes = Object.fromEntries(K.FICHIERS_DE_L_EMPREINTE.map((n) => [n, fs.readFileSync(path.join(dossier, n), 'utf8')]));
  const e = K.empreinteDesTextes(textes);
  assert.match(e, /^[0-9a-f]{40}$/);
  const BOM = String.fromCharCode(0xfeff);
  const crlf = Object.fromEntries(Object.entries(textes).map(([n, t]) => [n, BOM + t.replace(/\r?\n/g, '\r\n')]));
  assert.equal(K.empreinteDesTextes(crlf), e, 'CRLF + BOM : même empreinte');
  assert.notEqual(K.empreinteDesTextes({ ...textes, 'journalWindows.js': textes['journalWindows.js'].replace('12 * 60_000', '13 * 60_000') }), e, 'un seuil de journalWindows.js changé');
  assert.notEqual(K.empreinteDesTextes({ ...textes, 'classerLesEvenements.js': `${textes['classerLesEvenements.js']}\n// x` }), e);
  assert.equal(K.empreinteDesTextes({ ...textes, 'causesConnues.js': undefined }), null);
  assert.equal(R.empreinteDuDossier(dossier), e, 'recette.mjs lit la même');
});

test('T-C12 l’empreinte du code = RECETTE.empreinteDesCauses (sautée tant qu’elle vaut null, avant le lot 1b)', (t) => {
  if (C.RECETTE.empreinteDesCauses === null) return t.skip('empreinte non écrite (lot 1b)');
  assert.equal(R.empreinteDuDossier(), C.RECETTE.empreinteDesCauses);
});

test('CR-19 point 3 au journal : une empreinte différente de celle du premier tour de J1 → « règle enfreinte », jamais connue', async () => {
  const b = banc({ debut: '2026-11-21T09:00:00Z', recette: RECETTE_J0('2026-11-20') });
  try {
    const j = b.creer({ lireEmpreinte: async () => 'a'.repeat(40), classer: K.creerClasseur() });
    await j.tour();
    assert.equal(j.etat.vus.instantaneDuDepart.empreinteDesCauses, 'a'.repeat(40));
    b.avancer(5);
    const j2 = b.creer({ pid: 5151, demarreLe: b.h.t, lireEmpreinte: async () => 'b'.repeat(40), classer: K.creerClasseur(), avantDemarrage: { battement: b.battement(), marque: null } });
    await j2.tour();
    const r = j2.etat.resume.evenements.find((e) => e.type === 'regle-enfreinte');
    assert.ok(r, 'règle enfreinte notée');
    assert.equal(r.classe, 'a-expliquer');
    assert.equal(K.peutEtreRattache(r, CAUSES[0]).ok, false);
  } finally {
    b.nettoyer();
  }
});

// --- T-C13 ----------------------------------------------------------------------------------------------------------

test('T-C13 le décompte : 14 jours sans nouvelle → tenue ; une nouvelle → pas tenue + relance proposée ; une relance → nouvelle fenêtre ; un jour sans journal → jamais « tenue »', () => {
  const R0 = RECETTE_J0('2026-11-20');
  const connue = { id: '2026-11-22|trou|1|02:00:00', le: '2026-11-22T02:00:00Z', type: 'trou', classe: 'connue', cause: 'veille-du-pc' };
  const tenue = K.decompte({ jours: joursPleins('2026-11-20', { '2026-11-22': [connue] }), recette: R0, aujourdhui: '2026-12-06' });
  assert.equal(tenue.etat, 'tenue', tenue.phrase);
  assert.deepEqual(tenue.fenetre, { j0: '2026-11-20', debut: '2026-11-21', fin: '2026-12-04' });
  assert.equal(tenue.episodes.connues[0].cause, 'veille-du-pc');
  assert.equal(K.decompte({ jours: joursPleins('2026-11-20'), recette: R0, aujourdhui: '2026-11-25' }).etat, 'en-cours');
  const nouvelle = { id: '2026-11-24|arret-sur-erreur|9|10:00:00', le: '2026-11-24T10:00:00Z', type: 'arret-sur-erreur', classe: 'nouvelle', cause: null };
  const pas = K.decompte({ jours: joursPleins('2026-11-20', { '2026-11-24': [nouvelle, { ...nouvelle, id: 'autre', le: '2026-11-24T11:00:00Z' }] }), recette: R0, aujourdhui: '2026-11-25' });
  assert.equal(pas.etat, 'pas-tenue');
  assert.equal(pas.relanceProposee, true);
  assert.equal(pas.nouvelles.length, 1, 'une CAUSE nouvelle, pas deux événements (CR-29 point 2)');
  const R1 = RECETTE_J0('2026-11-20', [{ le: '2026-11-26', apres: 'correction de la panne du 24/11' }]);
  const apres = K.decompte({ jours: joursPleins('2026-11-26'), recette: R1, aujourdhui: '2026-11-30' });
  assert.deepEqual(apres.fenetre, { j0: '2026-11-26', debut: '2026-11-27', fin: '2026-12-10' });
  assert.equal(apres.etat, 'en-cours');
  const seconde = K.decompte({ jours: joursPleins('2026-11-26', { '2026-11-28': [{ ...nouvelle, id: 'n2', le: '2026-11-28T10:00:00Z' }] }), recette: R1, aujourdhui: '2026-11-29' });
  assert.equal(seconde.relanceProposee, false);
  assert.match(seconde.phrase, /à décider avec vous/);
  const trouee = joursPleins('2026-11-20').filter((r) => r.jour !== '2026-11-30');
  assert.equal(K.decompte({ jours: trouee, recette: R0, aujourdhui: '2026-12-06' }).etat, 'incomplete');
  // Les événements du rodage et les « info » ne comptent pas.
  assert.equal(K.decompte({ jours: joursPleins('2026-11-20', { '2026-11-22': [{ ...nouvelle, rodage: true }] }), recette: R0, aujourdhui: '2026-12-06' }).etat, 'tenue');
});

// --- T-C14 ----------------------------------------------------------------------------------------------------------

test('T-C14 l’étape « contrôle du jour » n’est connue que si tous ses contrôles non verts le sont', () => {
  const ev = etape('controleQuotidien', 'warn', 'Feu rouge : 40 contrôles — rouge : classement officiel');
  const controle = (constats, autres = []) => ({ controles: [{ cle: 'classement-officiel', classe: 'rouge', statutLe: 'rouge', constats }, { cle: 'tirs-non-releves', classe: 'orange', statutLe: 'vert', constats: [] }, { cle: 'joueurs-sans-identifiant', classe: 'info', statutLe: 'orange', constats: [{ id: 'j:1', classe: 'info' }] }, ...autres] });
  const present = { id: 'classement-officiel:impossible:Bes', classe: 'rouge', trouveLe: '2026-11-09T04:00:00Z' };
  const orangeNeuf = { id: 'classement-officiel:manquant:X', classe: 'orange', trouveLe: '2026-11-22T04:00:00Z' };
  assert.deepEqual(classer(ev, { ...RECETTE_CTX, controle: controle([present, orangeNeuf]) }), { classe: 'connue', cause: 'controle-du-jour' });
  const rougeNeuf = { id: 'classement-officiel:impossible:Y', classe: 'rouge', trouveLe: '2026-11-22T04:00:00Z' };
  assert.equal(classer(ev, { ...RECETTE_CTX, controle: controle([present, rougeNeuf]) }).classe, 'a-expliquer');
  assert.equal(classer(ev, { ...RECETTE_CTX, controle: controle([present], [{ cle: 'club-deux-fois', classe: 'orange', statutLe: 'orange', constats: [{ id: 'club-deux-fois:identite:1', classe: 'orange', trouveLe: '2026-11-22T04:00:00Z' }] }]) }).classe, 'a-expliquer');
  assert.equal(classer(ev, RECETTE_CTX).classe, 'a-expliquer', 'contrôle du jour non lu');
  assert.equal(K.peutEtreRattache(ev, CAUSES.find((c) => c.id === 'controle-du-jour')).ok, true);
});

// --- recette.mjs : annonce, résumé, chemins par défaut refusés ------------------------------------------------------

test('recette.mjs --annoncer-la-mise-en-service écrit l’annonce lue par le journal (CR-2) ; --resume-du-jour dit le contrôle de vie, les « à expliquer » et leur âge, le coût de la veille', () => {
  const d = dossierRecette();
  try {
    assert.equal(d.lancer('--annoncer-la-mise-en-service', 'lot 1 de la 47, première écriture').code, 0);
    const a = JSON.parse(fs.readFileSync(d.chemins.miseEnService, 'utf8'));
    assert.deepEqual([a.quoi, typeof a.le], ['lot 1 de la 47, première écriture', 'string']);
    assert.equal(d.lancer('--annoncer-la-mise-en-service', '').code, 1);
    const evA = { id: '2026-11-22|constat-nouveau|x|04:00:00', le: '2026-11-22T04:00:00Z', type: 'constat-nouveau', cle: 'x', texte: 'Constat nouveau', classe: 'a-expliquer' };
    d.jour('2026-11-22', [evA], { serveur: { demarrages: [], trous: [{ de: '2026-11-22T18:00:00Z', a: '2026-11-22T22:00:00Z', minutes: 240, cause: 'veille-du-pc' }] } });
    fs.mkdirSync(d.chemins.racine, { recursive: true });
    fs.writeFileSync(d.chemins.battement, JSON.stringify({ pid: 1, dernierTour: '2026-11-23T09:00:00Z' }));
    d.runtime({ 'season-calendar.json': [{ id: 'm1', homeTeam: 'A', awayTeam: 'B', kickoff: '2026-11-22T19:00:00Z' }, { id: 'm2', homeTeam: 'C', awayTeam: 'D', kickoff: '2026-11-22T12:00:00Z' }, { id: 'm3', date: '2026-11-22' }], 'journal-claude/2026-11-22.json': { totaux: { appels: 1 }, appels: [{ statut: 'ok', appel: { type: 'coup-d-envoi', match: 'm2' } }] } });
    const r = d.lancer('--resume-du-jour', '--jour', '2026-11-22', '--maintenant', '2026-11-24T10:00:00Z');
    assert.equal(r.code, 0, r.sortie);
    assert.match(r.sortie, /dernier tour il y a 1500 min[^\n]*LE JOURNAL NE TOURNE PAS/);
    assert.match(r.sortie, /À EXPLIQUER {2}2026-11-22\|constat-nouveau\|x[^\n]*en retard/);
    // P4b-1 (décision 25 a, RC-26) : season-calendar.json n'est plus lu ; le coût de la veille est « non compté », écrit UNE
    // fois (dans « Non surveillé »), même quand chaque match a son heure ; les appels au coup d'envoi : leur nombre seul.
    assert.equal((r.sortie.match(/non compté : aucune heure de coup d’envoi lisible sans la base/g) ?? []).length, 1, r.sortie);
    assert.doesNotMatch(r.sortie, /commencé(s) pendant un trou/);
    assert.match(r.sortie, /Appels au coup d’envoi : 1 analyse/);
    d.runtime({ 'season-calendar.json': [{ id: 'm1', homeTeam: 'A', awayTeam: 'B', kickoff: '2026-11-22T19:00:00Z' }, { id: 'm2', homeTeam: 'C', awayTeam: 'D', kickoff: '2026-11-22T12:00:00Z' }] });
    const r2 = d.lancer('--resume-du-jour', '--jour', '2026-11-22', '--maintenant', '2026-11-24T10:00:00Z');
    assert.equal(r2.code, 0, r2.sortie);
    assert.doesNotMatch(r2.sortie, /commencé(s) pendant un trou/);
    assert.equal((r2.sortie.match(/non compté : aucune heure de coup d’envoi lisible sans la base/g) ?? []).length, 1, r2.sortie);
    const r3 = d.lancer('--resume-du-jour', '--jour', '2026-11-22', '--noter-la-veille', '--maintenant', '2026-11-24T10:00:00Z');
    assert.equal(r3.code, 1, r3.sortie);
    assert.match(r3.sortie, /REFUS : --noter-la-veille/);
    assert.ok(!fs.existsSync(d.chemins.decisions), 'rien n’est noté');
    assert.match(r.sortie, /Non surveillé|non commencé|n’a pas commencé/);
  } finally {
    d.nettoyer();
  }
});

test('recette.mjs sans chemins, lancé sous un essai : refuse les chemins par défaut (code ≠ 0) et n’écrit rien (§ 7 règle 13)', () => {
  const dossierPierre = path.join(os.homedir(), 'CoteMaster', 'recette');
  const avant = fs.existsSync(dossierPierre) ? fs.readdirSync(dossierPierre).sort() : null;
  for (const args of [['--annoncer-la-mise-en-service', 'essai'], ['--noter', '--raison', 'essai'], ['--verifier-les-causes']]) {
    const r = spawnSync(process.execPath, [path.join(SERVEUR, 'scripts', 'recette.mjs'), ...args], { cwd: SERVEUR, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT ?? 'child-v8', CM_BAC_A_SABLE: '1' }, windowsHide: true, timeout: 30_000 });
    assert.notEqual(r.status, 0, `${args[0]} : ${r.stdout}`);
    assert.match(r.stdout, /REFUS : sous un essai/);
  }
  assert.deepEqual(fs.existsSync(dossierPierre) ? fs.readdirSync(dossierPierre).sort() : null, avant);
  // Des chemins mêlés (un donné, un par défaut) : refus.
  assert.equal(R.lesChemins({ racine: 'C:/x' }).ok, false);
});

// --- § 2.3 P3-P4 : la fermeture des imports de recette.mjs ------------------------------------------------------------

/** La fermeture (imports statiques, `export … from`, import() littéraux) d'un fichier, en chemins absolus. */
function fermeture(depart) {
  const vus = new Set();
  const nonLitteraux = [];
  const pile = [depart];
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f)) continue;
    vus.add(f);
    const texte = fs.readFileSync(f, 'utf8');
    const code = texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const specs = [...code.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gm), ...code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm), ...code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    if (/\bimport\(\s*[^'"\s)]/.test(code)) nonLitteraux.push(f);
    for (const s of specs) if (s.startsWith('.')) pile.push(path.resolve(path.dirname(f), s));
  }
  return { fichiers: [...vus].map((f) => path.relative(SERVEUR, f).split(path.sep).join('/')), nonLitteraux };
}

test('§ 2.3 P3-P4 : la fermeture des imports de recette.mjs n’atteint ni refreshStatusRepository.js, ni matchStatsDb.js, ni env.js (ni sourceHealth.js, enregistreurs/etat.js, le journal)', () => {
  const { fichiers, nonLitteraux } = fermeture(path.join(SERVEUR, 'scripts', 'recette.mjs'));
  assert.deepEqual(nonLitteraux, [], 'import() à chemin variable');
  for (const interdit of ['src/data/repositories/refreshStatusRepository.js', 'src/data/db/matchStatsDb.js', 'src/config/env.js', 'src/data/sourceHealth.js', 'src/data/enregistreurs/etat.js', 'src/data/recette/journalDeLaRecette.js', 'src/jobs/liveWatch.js']) {
    assert.ok(!fichiers.includes(interdit), `${interdit} atteint par recette.mjs`);
  }
  assert.deepEqual(fichiers.sort(), ['scripts/recette.mjs', 'src/config/bacASable.js', 'src/data/recette/calendrierDeLaRecette.js', 'src/data/recette/causesConnues.js', 'src/data/recette/cheminsDeLaRecette.js', 'src/data/recette/classerLesEvenements.js', 'src/utils/atomicJson.js'].sort(), 'la fermeture est exactement celle-ci');
  const texte = fs.readFileSync(path.join(SERVEUR, 'scripts', 'recette.mjs'), 'utf8');
  for (const nom of ['readRefreshStatus', 'readJsonFile', 'openDb', 'etatEnregistreurs', 'etatFotmob(']) assert.ok(!texte.includes(nom), `recette.mjs contient « ${nom} »`);
  // Le classeur et les causes sont purs : aucune lecture, aucune écriture.
  for (const f of ['classerLesEvenements.js', 'causesConnues.js']) {
    const t = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'recette', f), 'utf8');
    assert.ok(!/from 'node:(fs|child_process|net|http|https)'/.test(t), `${f} n’est pas pur`);
  }
});

// --- Les bancs ------------------------------------------------------------------------------------------------------

/** 14 jours + J0 de résumés (fichiers du jour) à partir de J0, avec des événements par jour. */
function joursPleins(j0, evenementsParJour = {}) {
  const out = [];
  for (let n = 0; n <= 15; n++) {
    const jour = C.ajouterJours(j0, n);
    out.push({ jour, evenements: evenementsParJour[jour] ?? [] });
  }
  return out;
}

/** Un dossier temporaire pour recette.mjs (jamais les chemins de Pierre). */
function dossierRecette() {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'recette47-causes-'));
  const runtimeDir = path.join(dossier, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  const options = ['--racine', path.join(dossier, 'recette'), '--journal', path.join(dossier, 'journal'), '--runtime', runtimeDir];
  const chemins = J.cheminsDeLaRecette({ racineHorsOneDrive: path.join(dossier, 'recette'), dossierRuntime: path.join(dossier, 'journal') });
  return {
    chemins,
    runtimeDir,
    lancer: (...args) => {
      const lignes = [];
      const code = R.lancer([...args, ...options], { ecrire: (l) => lignes.push(l), maintenant: Date.parse('2026-11-23T10:00:00Z'), parDefaut: () => ({ ok: false, raison: 'jamais de défaut sous essai' }) });
      return { code, sortie: lignes.join('\n') };
    },
    jour: (jour, evenements, extra = {}) => {
      fs.mkdirSync(chemins.dossierDuJournal, { recursive: true });
      fs.writeFileSync(chemins.fichierDuJour(jour), JSON.stringify({ ...J.resumeVide(jour, 'recette'), ...extra, evenements }));
    },
    runtime: (fichiers) => {
      for (const [n, v] of Object.entries(fichiers)) {
        fs.mkdirSync(path.dirname(path.join(runtimeDir, n)), { recursive: true });
        fs.writeFileSync(path.join(runtimeDir, n), JSON.stringify(v));
      }
    },
    nettoyer: () => fs.rmSync(dossier, { recursive: true, force: true })
  };
}

/** Un banc du journal (même forme que recetteJournal.test.mjs). */
function banc({ debut = '2026-11-22T09:00:00Z', recette = RECETTE_J0('2026-11-20') } = {}) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'recette47-causes-j-'));
  const sources = { runtime: path.join(dossier, 'runtime'), sauvegardes: path.join(dossier, 'sauvegardes') };
  fs.mkdirSync(path.join(sources.runtime, 'journal-claude'), { recursive: true });
  fs.mkdirSync(sources.sauvegardes, { recursive: true });
  const chemins = J.cheminsDeLaRecette({ racineHorsOneDrive: path.join(dossier, 'recette'), dossierRuntime: path.join(dossier, 'journal') });
  const h = { t: Date.parse(debut) };
  const creer = (options = {}) => J.creerJournal({ chemins, sources, horloge: () => h.t, pid: 4242, demarreLe: h.t, recette, lireJW: async () => ({ lisible: true, evenements: [] }), racineDuDepot: dossier, journal: { warn() {}, log() {} }, avantDemarrage: { battement: null, marque: null }, ...options });
  return {
    h,
    creer,
    ecrire: (rel, v) => fs.writeFileSync(path.join(dossier, rel), typeof v === 'string' ? v : JSON.stringify(v)),
    lireJour: (jour) => JSON.parse(fs.readFileSync(chemins.fichierDuJour(jour), 'utf8')),
    battement: () => JSON.parse(fs.readFileSync(chemins.battement, 'utf8')),
    avancer: (m) => {
      h.t += m * 60_000;
    },
    nettoyer: () => fs.rmSync(dossier, { recursive: true, force: true })
  };
}

// =====================================================================================================================
// P4a (17/11) : les essais ciblés des décisions 24 b, d, e, f de l'orchestrateur.
// =====================================================================================================================

// --- décision 24 b : aucune heure de coup d'envoi lisible → « non compté », jamais estimé ------------------------------

test('décision 24 b : une date seule n’est jamais une heure ; un calendrier sans heure (forme du vrai, 17/11) → coût « non compté »', () => {
  assert.equal(K.instantDuCoupDEnvoi({ date: '2026-11-22' }), null, 'la date seule');
  assert.equal(K.instantDuCoupDEnvoi({ utcDate: '2026-11-22' }), null, 'utcDate sans heure');
  assert.equal(K.instantDuCoupDEnvoi({ kickoff: '2026-11-22' }), null, 'kickoff sans heure');
  assert.equal(K.instantDuCoupDEnvoi({ date: '2026-11-22', time: '' }), null, 'heure vide');
  assert.equal(K.instantDuCoupDEnvoi({ kickoff: '2026-11-22T19:00:00Z' }), Date.parse('2026-11-22T19:00:00Z'));
  assert.equal(K.instantDuCoupDEnvoi({ date: '2026-11-22', time: '19:00' }), Date.parse('2026-11-22T19:00'));
  // La forme relevée en brut le 17/11 (clés du vrai season-calendar.json ; aucune heure).
  const vrais = [
    { id: 1, matchId: 1, date: '2026-11-22', league: 'L', homeName: 'A', awayName: 'B', status: 'scheduled', homeGoals: null, awayGoals: null, round: 1, source: 'fotmob', updatedAt: '2026-11-17T10:00:00Z' },
    { id: 2, matchId: 2, date: '2026-11-22', league: 'L', homeName: 'C', awayName: 'D', status: 'scheduled', homeGoals: null, awayGoals: null, round: 1, source: 'fotmob', updatedAt: '2026-11-17T10:00:00Z' }
  ];
  const trous = [{ de: '2026-11-21T23:00:00Z', a: '2026-11-22T23:00:00Z' }];
  const cout = K.coutDeLaVeille({ trous, matchs: vrais, appels: [] });
  assert.deepEqual([cout.compte, cout.texte, cout.matchsDansUnTrou, cout.sansAnalyseAuCoupDEnvoi, cout.sansHeure], [false, K.COUT_NON_COMPTE, null, null, 2]);
  // Un seul match sans heure suffit : jamais un compte partiel.
  const mele = K.coutDeLaVeille({ trous, matchs: [{ id: 'x', kickoff: '2026-11-22T12:00:00Z' }, vrais[0]], appels: [] });
  assert.equal(mele.compte, false);
  // Aucun match : non compté non plus (rien à dire, jamais « 0 »).
  assert.equal(K.coutDeLaVeille({ trous, matchs: [], appels: [] }).compte, false);
  const ok = K.coutDeLaVeille({ trous, matchs: [{ id: 'x', homeTeam: 'A', awayTeam: 'B', kickoff: '2026-11-22T12:00:00Z' }], appels: [] });
  assert.deepEqual([ok.compte, ok.matchsDansUnTrou, ok.sansAnalyseAuCoupDEnvoi], [true, 1, 1]);
  assert.match(ok.texte, /^1 match\(s\) commencé\(s\) pendant un trou, dont 1 sans analyse au coup d’envoi$/);
  // La phrase « non compté » est dans NON_SURVEILLE, donc dans chaque résumé du jour.
  assert.equal(K.COUT_NON_COMPTE, 'non compté : aucune heure de coup d’envoi lisible sans la base');
  assert.ok(K.NON_SURVEILLE.includes(K.COUT_NON_COMPTE));
  assert.equal(J.NON_SURVEILLE, K.NON_SURVEILLE, 'le journal dit la même ligne');
  assert.ok(J.resumeVide('2026-11-22', 'recette').nonSurveille.includes('non compté'));
});

// --- décision 24 d : le fil du juge n'est lancé par aucune étape de passe ----------------------------------------------

/** Les fichiers .js / .mjs d'un dossier, récursivement. */
function fichiersJs(dossier) {
  const out = [];
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) out.push(...fichiersJs(p));
    else if (/\.(m?js)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('décision 24 d : « Le fil du juge s’est arrêté » dans une étape → « à expliquer » (aucune cause ne le reconnaît d’office) ; le juge n’a que deux appelants', () => {
  for (const cle of ['moteurABlanc', 'calibrationMensuelle', 'gelPronostics', 'tableJourJ', 'simulationMatchs']) {
    const r = classer(etape(cle, 'error', 'Le fil du juge s’est arrêté (code 1).'));
    assert.equal(r.classe, 'a-expliquer', cle);
  }
  const scelles = CAUSES.find((c) => c.id === 'calcul-a-part-exit-scelles');
  assert.deepEqual(scelles.reconnait.etapes.map((r) => r.cle), ['tableJourJ', 'simulationSaisons', 'simulationMatchs']);
  for (const c of CAUSES_CONNUES) for (const r of c.reconnait.etapes ?? []) assert.equal(r.motif.test('Le fil du juge s’est arrêté (code 1).'), false, c.id + '/' + r.cle);
  // La lecture (17/11) : ouvrirJugeAPart n'est appelé que par bench/resume.js (banc à part) et scripts/stat-value.mjs.
  const appelants = [...fichiersJs(path.join(SERVEUR, 'src')), ...fichiersJs(path.join(SERVEUR, 'scripts'))]
    .filter((p) => !p.endsWith('jugeAPart.js') && /ouvrirJugeAPart\(\)/.test(fs.readFileSync(p, 'utf8')))
    .map((p) => path.relative(SERVEUR, p).split(path.sep).join('/'))
    .sort();
  assert.deepEqual(appelants, ['scripts/stat-value.mjs', 'src/bench/resume.js']);
});

// --- décision 24 e : les deux bornes codées --------------------------------------------------------------------------

const quota = (le, echecs = 16, messages = ['You’ve hit your session limit · resets 3:50am (Europe/Paris)']) => ({ type: 'ia-echecs-de-suite', cle: le.slice(0, 10), le, details: { echecs, messagesDEchec: messages } });

test('décision 24 e (unité) : « quota-abonnement » au plus 20 échecs ET un jour par semaine de la recette ; au-delà → « alerte au-delà de la borne »', () => {
  assert.equal(K.semaineDeLaRecette('2026-11-21', '2026-11-20'), 1);
  assert.equal(K.semaineDeLaRecette('2026-11-27', '2026-11-20'), 1);
  assert.equal(K.semaineDeLaRecette('2026-11-28', '2026-11-20'), 2);
  assert.equal(K.semaineDeLaRecette('2026-12-04', '2026-11-20'), 2);
  assert.equal(K.semaineDeLaRecette('2026-11-20', '2026-11-20'), null, 'J0');
  assert.equal(K.semaineDeLaRecette('2026-12-05', '2026-11-20'), null, 'après J14');
  assert.deepEqual(classer(quota('2026-11-21T10:00:00Z')), { classe: 'connue', cause: 'quota-abonnement' });
  const ctx = { ...RECETTE_CTX, joursConnus: { 'quota-abonnement': ['2026-11-21'] } };
  assert.deepEqual(classer(quota('2026-11-21T18:00:00Z'), ctx), { classe: 'connue', cause: 'quota-abonnement' }, 'le même jour');
  const second = classer(quota('2026-11-24T10:00:00Z'), ctx);
  assert.equal(second.classe, 'a-expliquer');
  assert.match(second.raison, /^alerte au-delà de la borne : déjà vu un autre jour de la semaine J1-J7 \(le 21\/11\)/);
  assert.deepEqual(classer(quota('2026-11-28T10:00:00Z'), ctx), { classe: 'connue', cause: 'quota-abonnement' }, 'semaine J8-J14');
  assert.deepEqual(classer(quota('2026-11-24T10:00:00Z'), { ...ctx, rodage: true }), { classe: 'connue', cause: 'quota-abonnement' }, 'pas pendant le rodage');
  const vingtEtUn = classer(quota('2026-11-21T10:00:00Z', 21));
  assert.equal(vingtEtUn.classe, 'a-expliquer');
  assert.match(vingtEtUn.raison, /^alerte au-delà de la borne : plus de 20 échecs/);
  assert.equal(classer(quota('2026-11-21T10:00:00Z', 20)).classe, 'connue', '20 pile');
  // Pierre décide (CR-26 point 3) : l'événement au-delà de la borne reste rattachable à la main à la cause (ou « nouvelle »).
  assert.equal(K.peutEtreRattache(quota('2026-11-24T10:00:00Z'), CAUSES.find((c) => c.id === 'quota-abonnement')).ok, true);
});

test('décision 24 e (unité) : FotMob « en panne » plus de 6 h observées → dépassement ; 6 h pile ou un autre état → rien', () => {
  assert.equal(K.DUREE_MAX_PANNE_FOTMOB_MS, 6 * 3_600_000);
  assert.equal(K.depassementDeLaPanneFotmob({ etat: 'en-panne', observeMs: 6 * 3_600_000 }), null);
  assert.deepEqual(K.depassementDeLaPanneFotmob({ etat: 'en-panne', observeMs: 6 * 3_600_000 + 60_000 }), { cause: 'fotmob-panne-detectee', nom: 'duree', valeur: 6, borne: 6 });
  assert.equal(K.depassementDeLaPanneFotmob({ etat: 'a-surveiller', observeMs: 10 * 3_600_000 }), null);
  assert.equal(K.depassementDeLaPanneFotmob({ etat: 'en-panne', observeMs: Number.NaN }), null);
  assert.equal(classer({ type: 'alerte-au-dela-de-la-borne', signal: 'S5', cle: 'fotmob', details: { cause: 'fotmob-panne-detectee' } }).classe, 'a-expliquer', 'jamais connue');
});

test('décision 24 e (journal) : un deuxième jour de quota dans la semaine J1-J7 → « à expliquer » avec sa raison ; la semaine J8-J14 repart', async () => {
  const b = banc({ debut: '2026-11-21T08:00:00Z' });
  try {
    const j = b.creer({ classer: K.creerClasseur() });
    const limite = 'You’ve hit your session limit · resets 3:50am (Europe/Paris)';
    const jourDeQuota = (jour) => {
      const appels = [{ at: jour + 'T07:00:00Z', statut: 'ok' }, ...[...Array(5)].map((_, i) => ({ at: jour + 'T07:0' + (i + 1) + ':00Z', statut: 'erreur', erreur: limite }))];
      b.ecrire('runtime/journal-claude/' + jour + '.json', { totaux: { appels: 6, ok: 1, echecs: 5, tokens: { total: 100 } }, appels });
    };
    const quotaDuJour = (jour) => b.lireJour(jour).evenements.find((e) => e.type === 'ia-echecs-de-suite');
    for (const [jour, attendu] of [['2026-11-21', 'connue'], ['2026-11-24', 'a-expliquer'], ['2026-11-28', 'connue']]) {
      b.h.t = Date.parse(jour + 'T08:00:00Z');
      jourDeQuota(jour);
      await j.tour();
      const e = quotaDuJour(jour);
      assert.ok(e, 'quota noté le ' + jour);
      assert.equal(e.classe, attendu, jour + ' : ' + JSON.stringify(e));
      if (attendu === 'a-expliquer') assert.match(e.raison, /alerte au-delà de la borne : déjà vu un autre jour de la semaine J1-J7/);
      else assert.equal(e.cause, 'quota-abonnement');
    }
    assert.deepEqual(j.etat.vus.joursConnus['quota-abonnement'], ['2026-11-21', '2026-11-28']);
  } finally {
    b.nettoyer();
  }
});

test('décision 24 e (journal) : FotMob en panne plus de 6 h OBSERVÉES → une « alerte au-delà de la borne » (une fois) ; une veille ne compte pas', async () => {
  const sante = { erreursDeSuite: 5, derniereReussite: '2026-11-21T07:00:00Z', parType: {} };
  // 1. Tours toutes les 20 min pendant 6 h 40 : l'alerte tombe une fois, au-delà de 6 h.
  const b = banc({ debut: '2026-11-21T08:00:00Z' });
  try {
    const j = b.creer({ classer: K.creerClasseur() });
    b.ecrire('runtime/sante-fotmob.json', sante);
    await j.tour();
    for (let i = 0; i < 20; i += 1) {
      b.avancer(20);
      await j.tour();
    }
    const alertes = b.lireJour('2026-11-21').evenements.filter((e) => e.type === 'alerte-au-dela-de-la-borne');
    assert.equal(alertes.length, 1, 'une fois par épisode');
    assert.equal(alertes[0].classe, 'a-expliquer');
    assert.deepEqual([alertes[0].details.cause, alertes[0].details.borne], ['fotmob-panne-detectee', 6]);
    assert.ok(alertes[0].details.valeur > 6);
    // FotMob revient : l'épisode se ferme ; une nouvelle panne repart de zéro.
    b.ecrire('runtime/sante-fotmob.json', { ...sante, erreursDeSuite: 0 });
    b.avancer(20);
    await j.tour();
    assert.equal(j.etat.vus.fotmobPanne, null);
  } finally {
    b.nettoyer();
  }
  // 2. 7 h d'horloge, dont une veille de 3 h (écart de tour au-delà du seuil du trou) : 4 h observées, pas d'alerte.
  const v = banc({ debut: '2026-11-21T08:00:00Z' });
  try {
    const j = v.creer({ classer: K.creerClasseur() });
    v.ecrire('runtime/sante-fotmob.json', sante);
    await j.tour();
    for (let i = 0; i < 6; i += 1) {
      v.avancer(20);
      await j.tour();
    }
    v.avancer(180);
    await j.tour();
    for (let i = 0; i < 6; i += 1) {
      v.avancer(20);
      await j.tour();
    }
    assert.equal(v.lireJour('2026-11-21').evenements.filter((e) => e.type === 'alerte-au-dela-de-la-borne').length, 0);
    assert.ok(j.etat.vus.fotmobPanne.observeMs <= 6 * 3_600_000, String(j.etat.vus.fotmobPanne.observeMs));
  } finally {
    v.nettoyer();
  }
});

// --- décision 24 f : chaque condition d'une cause à plusieurs conditions, retirée SEULE -------------------------------

/**
 * L'inventaire des causes reconnues d'office sur plusieurs conditions (P4a, 17/11). Pour chacune : un cas reconnu, puis
 * un cas par condition où SEULE elle manque → la cause ne le reconnaît plus (rien de vérifié avant ne la cache, B24).
 */
const AUDIT = 'Depuis le 2026-10-21 : 1 234 rencontres contrôlées, 30 anomalies (buteurs : 18, gardien : 2, fichiers : 1).';
const INVENTAIRE = [
  { cause: 'audit-buteurs-gardiens', ok: etape('controle', 'warn', AUDIT), sans: { cle: etape('controleX', 'warn', AUDIT), statut: etape('controle', 'error', AUDIT), motif: etape('controle', 'warn', 'Depuis le 2026-10-21 : 30 anomalies (gardien : 2).'), borne: etape('controle', 'warn', AUDIT.replace('30 anomalies', '99 anomalies')), nombre: etape('controle', 'warn', 'anomalies (buteurs : 18)') } },
  { cause: 'audit-buteurs-gardiens', ok: { type: 'alerte-posee', cle: 'audit', details: { nombres: { anomalies: 30 } } }, sans: { cle: { type: 'alerte-posee', cle: 'auditX', details: { nombres: { anomalies: 30 } } }, borne: { type: 'alerte-posee', cle: 'audit', details: { nombres: { anomalies: 99 } } }, ajout: { type: 'alerte-changee', cle: 'audit', details: { avant: '{"parType":["buteurs"]}', signature: '{"parType":["buteurs","gardien"]}', nombres: { anomalies: 30 } } } } },
  { cause: 'audit-buteurs-gardiens', ok: constat('buteurs-score', 'buteurs-score:impossible:x', 'orange'), sans: { cle: constat('buteurs-scoreX', 'buteurs-score:impossible:x', 'orange'), classe: constat('buteurs-score', 'buteurs-score:impossible:x', 'rouge') } },
  // RC-16 : pour calendriers-incomplets, le motif du nombre (« N non calculés ») contient déjà le motif (« non calculés ») :
  // la condition « motif » y est redondante et ne peut pas manquer seule ; le cas « motif » ci-dessous rate aussi par le nombre.
  { cause: 'calendriers-incomplets', ok: etape('simulationSaisons', 'warn', 'Fins de saison : 37 championnats simulés, 12 non calculés'), sans: { cle: etape('simulationMatchs', 'warn', 'Fins de saison : 12 non calculés'), statut: etape('simulationSaisons', 'error', 'Fins de saison : 12 non calculés'), motif: etape('simulationSaisons', 'warn', 'Fins de saison : 12 calculés'), borne: etape('simulationSaisons', 'warn', 'Fins de saison : 99 non calculés') } },
  { cause: 'chiffres-non-publies', ok: constat('tirs-non-releves', 'tirs-non-releves:x', 'orange', { league: 'Liga A' }), sans: { cle: constat('tirs-releves', 'tirs-non-releves:x', 'orange', { league: 'Liga A' }), classe: constat('tirs-non-releves', 'tirs-non-releves:x', 'rouge', { league: 'Liga A' }), championnat: constat('tirs-non-releves', 'tirs-non-releves:x', 'orange', { league: 'Liga Z' }) } },
  { cause: 'hors-reperes', ok: constat('hors-reperes-buts', 'hors-reperes-buts:x', 'orange'), sans: { cle: constat('hors-reperes-butsX', 'hors-reperes-buts:x', 'orange'), classe: constat('hors-reperes-buts', 'hors-reperes-buts:x', 'rouge') } },
  { cause: 'classement-officiel', ok: constat('classement-officiel', 'classement-officiel:manquant:z', 'orange'), sans: { classe: constat('classement-officiel', 'classement-officiel:manquant:z', 'rouge') } },
  { cause: 'ia-echec-isole', ok: etape('iaAutoAvantMatch', 'warn', '12 rencontres sans analyse : 10 analysées, 2 échecs.'), sans: { cle: etape('iaAutoX', 'warn', '12 rencontres sans analyse : 10 analysées, 2 échecs.'), statut: etape('iaAutoAvantMatch', 'error', '12 rencontres sans analyse : 10 analysées, 2 échecs.'), motif: etape('iaAutoAvantMatch', 'warn', '12 rencontres : 10 analysées, 2 échecs.'), borne: etape('iaAutoAvantMatch', 'warn', '12 rencontres sans analyse : 4 échecs.'), nombre: etape('iaAutoAvantMatch', 'warn', '12 rencontres sans analyse.'), sansArret: etape('iaAutoAvantMatch', 'warn', '12 rencontres sans analyse : 10 analysées, 2 échecs — arrêt après plusieurs pannes de Claude Code d’affilée.') } },
  { cause: 'ia-plafond-econome', ok: etape('iaAutoAvantMatch', 'warn', 'plafond du jour atteint (150 analyses)'), sans: { statut: etape('iaAutoAvantMatch', 'error', 'plafond du jour atteint (150 analyses)'), motif: etape('iaAutoAvantMatch', 'warn', 'atteint (150 analyses)'), borne: etape('iaAutoAvantMatch', 'warn', 'plafond du jour atteint (150 analyses), 4 échecs'), sansArret: etape('iaAutoAvantMatch', 'warn', 'plafond du jour atteint (150 analyses) ; arrêt après plusieurs pannes de Claude Code d’affilée') } },
  { cause: 'quota-abonnement', ok: quota('2026-11-21T10:00:00Z'), sans: { type: { ...quota('2026-11-21T10:00:00Z'), type: 'ia-autre' }, messages: quota('2026-11-21T10:00:00Z', 16, ['You’ve hit your session limit', 'Erreur réseau']), aucunMessage: quota('2026-11-21T10:00:00Z', 16, []), borne: quota('2026-11-21T10:00:00Z', 21), nombre: { ...quota('2026-11-21T10:00:00Z'), details: { messagesDEchec: ['You’ve hit your session limit'] } } } },
  { cause: 'calcul-a-part-exit-scelles', ok: etape('tableJourJ', 'error', 'contrôle à part arrêté sans réponse (code 0)'), sans: { cle: etape('feuilles', 'error', 'contrôle à part arrêté sans réponse (code 0)'), statut: etape('tableJourJ', 'skipped', 'contrôle à part arrêté sans réponse (code 0)'), motif: etape('tableJourJ', 'error', 'contrôle à part arrêté (code 0)'), code: etape('tableJourJ', 'error', 'contrôle à part arrêté sans réponse (code 1)') } },
  { cause: 'calcul-a-part-exit-coupes', ok: etape('coupesEtMatchsAPart', 'error', 'calcul à part arrêté sans réponse (code 0)'), sans: { cle: etape('feuilles', 'error', 'calcul à part arrêté sans réponse (code 0)'), statut: etape('coupesEtMatchsAPart', 'skipped', 'calcul à part arrêté sans réponse (code 0)'), motif: etape('coupesEtMatchsAPart', 'error', 'calcul à part arrêté (code 0)') } },
  { cause: 'calcul-a-part-exit-corriges', ok: etape('cartonsEtCorners', 'error', 'calcul à part arrêté sans réponse (code 0)'), sans: { cle: etape('feuilles', 'error', 'calcul à part arrêté sans réponse (code 0)'), statut: etape('cartonsEtCorners', 'skipped', 'calcul à part arrêté sans réponse (code 0)'), motif: etape('cartonsEtCorners', 'error', 'calcul à part arrêté (code 0)') } },
  { cause: 'fotmob-panne-detectee', ok: fotmob('en-panne', { nature: 'reseau', detecteParLAppli: true }), sans: { etat: fotmob('a-surveiller', { nature: 'reseau', detecteParLAppli: true }), nature: fotmob('en-panne', { nature: 'inconnue', detecteParLAppli: true }), detection: fotmob('en-panne', { nature: 'reseau', detecteParLAppli: false }) } },
  { cause: 'fotmob-a-surveiller', ok: fotmob('a-surveiller', { nature: 'serveur', detecteParLAppli: true, raison: '2 réponse(s) en échec de suite' }), sans: { etat: fotmob('en-panne', { nature: 'serveur', detecteParLAppli: true, raison: '2 réponse(s) en échec de suite' }), nature: fotmob('a-surveiller', { nature: 'inconnue', detecteParLAppli: true, raison: '2 réponse(s) en échec de suite' }), raison: fotmob('a-surveiller', { nature: 'serveur', detecteParLAppli: true, raison: 'lent' }) } },
  { cause: 'direct-suspendu-fotmob', ok: { type: 'direct-suspendu', cle: 'direct', details: {} }, ctx: { ...RECETTE_CTX, fotmob: 'en-panne' }, sans: { fotmob: [{ type: 'direct-suspendu', cle: 'direct', details: {} }, { ...RECETTE_CTX, fotmob: 'ok' }] } },
  // RC-5 (décision 26 d) : l'alerte « enregistreurs » qui n'ajoute QUE le relevé du direct, pendant une panne de FotMob.
  { cause: 'direct-suspendu-fotmob', ok: { type: 'alerte-changee', cle: 'enregistreurs', details: { avant: '{"releves":["cotes-payantes"]}', signature: '{"releves":["cotes-payantes","direct"]}', nombres: {} } }, ctx: { ...RECETTE_CTX, fotmob: 'en-panne' }, sans: { cle: { type: 'alerte-changee', cle: 'enregistreursX', details: { avant: '{"releves":["cotes-payantes"]}', signature: '{"releves":["cotes-payantes","direct"]}', nombres: {} } }, fotmob: [{ type: 'alerte-changee', cle: 'enregistreurs', details: { avant: '{"releves":["cotes-payantes"]}', signature: '{"releves":["cotes-payantes","direct"]}', nombres: {} } }, { ...RECETTE_CTX, fotmob: 'ok' }], direct: { type: 'alerte-changee', cle: 'enregistreurs', details: { avant: '{"releves":["cotes-payantes"]}', signature: '{"releves":["cotes-payantes","cotes-gratuites"]}', nombres: {} } } } }
];

test('décision 24 f : chaque condition d’une cause à plusieurs conditions, retirée seule, fait tomber la reconnaissance', () => {
  const vues = new Set();
  for (const ligne of INVENTAIRE) {
    const cause = CAUSES.find((c) => c.id === ligne.cause);
    assert.ok(cause, ligne.cause);
    const ctx = ligne.ctx ?? RECETTE_CTX;
    assert.equal(K.causeReconnait(cause, ligne.ok, ctx, CAUSES).ok, true, ligne.cause + ' : le cas reconnu');
    for (const [condition, cas] of Object.entries(ligne.sans)) {
      const [ev, c2] = Array.isArray(cas) ? cas : [cas, ctx];
      assert.equal(K.causeReconnait(cause, ev, c2, CAUSES).ok, false, ligne.cause + ' : sans « ' + condition + ' » encore reconnu');
      vues.add(ligne.cause);
    }
  }
  // L'inventaire couvre chaque cause d'office dont une règle porte plus d'une condition.
  const plusieurs = CAUSES_CONNUES.filter((c) => c.mode === 'office' && ['etapes', 'alertes', 'controles', 'fotmob', 'ia', 'direct'].some((k) => (c.reconnait[k] ?? []).length)).map((c) => c.id);
  assert.deepEqual(plusieurs.filter((id) => !vues.has(id)), [], 'cause à plusieurs conditions sans cas');
});

// --- P4b-1 (17/11/2026) : les corrections de la relecture de la première écriture (RC-1 à RC-8, RC-15, RC-24, RC-26) ---

test('P4b-1 RC-1 : un calcul à part arrêté sans réponse n’est « connu » qu’avec le code 0 ; code 1 ou 3221225477 → « à expliquer »', () => {
  for (const [cle, quoi] of [['simulationSaisons', 'calcul'], ['tableJourJ', 'contrôle'], ['simulationMatchs', 'calcul']]) {
    for (const code of ['1', '3221225477']) {
      const c = classer(etape(cle, 'error', `${quoi} à part arrêté sans réponse (code ${code}) FATAL ERROR: heap out of memory`));
      assert.equal(c.classe, 'a-expliquer', `${cle} code ${code} : ${JSON.stringify(c)}`);
    }
    const c = classer(etape(cle, 'error', `${quoi} à part arrêté sans réponse (code 0)`));
    assert.deepEqual([c.classe, c.cause], ['connue', 'calcul-a-part-exit-scelles'], cle);
  }
});

test('P4b-1 RC-2 : « arrêt après plusieurs pannes de Claude Code » n’est jamais reconnu d’office (ni échec isolé, ni plafond)', () => {
  const arret = etape('iaAutoAvantMatch', 'warn', '12 rencontres à venir entre 3 h et 48 h sans analyse : 4 faites, 3 échecs — arrêt après plusieurs pannes de Claude Code d’affilée (quota, jeton ou réseau), reprise à la passe suivante.');
  const c = classer(arret);
  assert.deepEqual([c.classe, c.cause], ['a-expliquer', null], JSON.stringify(c));
  const apres = classer(etape('iaAutoApresMatch', 'warn', '5 rencontres finies sans revue : 1 échec — arrêt après plusieurs pannes de Claude Code d’affilée.'));
  assert.equal(apres.classe, 'a-expliquer');
  assert.equal(classer(etape('iaAutoAvantMatch', 'warn', '12 rencontres à venir entre 3 h et 48 h sans analyse : 4 faites, 3 échecs.')).cause, 'ia-echec-isole', 'sans l’arrêt, l’échec isolé reste connu');
});

test('P4b-1 RC-3 : un contrôle « en panne » (erreur, pas fait) n’est jamais couvert par « contrôle du jour » ; il apparaît à J0', () => {
  for (const statutLe of ['erreur', 'pas-fait', 'en-panne']) {
    const controle = { controles: [{ cle: 'score-calendrier', libelle: 'Scores du calendrier', statutLe, constats: [] }] };
    const c = classer(etape('controleQuotidien', 'warn', 'contrôle du jour : 1 contrôle en panne'), { ...RECETTE_CTX, controle });
    assert.equal(c.classe, 'a-expliquer', statutLe + ' : ' + JSON.stringify(c));
    assert.match(c.raison ?? '', /en panne/);
    const points = K.cequiNestPasVert({ refresh: { history: [], alerts: {} }, controle, sante: null, maintenant: Date.parse('2026-11-20T10:00:00Z') }).filter((p) => p.type !== 'fotmob');
    assert.deepEqual(points.map((p) => [p.type, p.cle, p.details?.vers]), [['controle-couleur', 'score-calendrier', statutLe]], statutLe);
  }
  for (const s of [null, undefined, 'vert', 'orange', 'rouge', 'info']) assert.equal(K.estUneCouleurDeControle(s), true, String(s));
});

test('P4b-1 RC-4 : un serveur arrêté à 15 h, le PC éteint proprement à 23 h → « à expliquer » ; une sortie notée code 1 aussi', () => {
  const base = { annonce: null, demarreLe: Date.parse('2026-11-25T07:00:00Z'), dernierTourAvant: '2026-11-24T14:00:00Z', code: 'inchange', ecartMs: 17 * 3_600_000 };
  const loin = J.classerLeDemarrage({ ...base, marque: null, pc: { demarrages: ['2026-11-25T06:58:00Z'], arretsPropres: ['2026-11-24T22:00:00Z'], arretsBrutaux: [] } });
  assert.deepEqual([loin.type, loin.classe], ['arret-du-serveur', 'a-expliquer']);
  assert.match(loin.texte, /serveur arrêté avant le PC/);
  const proche = { ...base, dernierTourAvant: '2026-11-24T21:55:00Z', pc: { demarrages: ['2026-11-25T06:58:00Z'], arretsPropres: ['2026-11-24T22:00:00Z'], arretsBrutaux: [] } };
  assert.equal(J.classerLeDemarrage({ ...proche, marque: null }).type, 'redemarrage-du-pc');
  assert.equal(J.classerLeDemarrage({ ...proche, marque: { type: 'exit', code: 0 } }).type, 'redemarrage-du-pc');
  const code1 = J.classerLeDemarrage({ ...proche, marque: { type: 'exit', code: 1 } });
  assert.equal(code1.classe, 'a-expliquer');
  assert.match(code1.texte, /pas arrêté proprement avant le PC/);
});

test('P4b-1 RC-5 (décision 26 d) : l’alerte « enregistreurs » d’un direct suspendu pendant une panne FotMob → connue, par la clé ou par le texte ; un autre relevé → « à expliquer »', () => {
  const ctx = { ...RECETTE_CTX, fotmob: 'en-panne' };
  const parCle = { type: 'alerte-changee', cle: 'enregistreurs', details: { avant: '{"releves":["cotes-payantes"]}', signature: '{"releves":["cotes-payantes","direct"]}', nombres: {} } };
  const parTexte = { type: 'alerte-posee', cle: 'enregistreurs', details: { signature: '{"releves":["Direct : 5 erreurs FotMob d’affilée"]}', nombres: {} } };
  for (const ev of [parCle, parTexte]) assert.deepEqual(((c) => [c.classe, c.cause])(classer(ev, ctx)), ['connue', 'direct-suspendu-fotmob'], JSON.stringify(ev.details));
  assert.equal(classer(parCle, { ...RECETTE_CTX, fotmob: 'ok' }).classe, 'a-expliquer', 'hors d’une panne de FotMob');
  const autre = { ...parCle, details: { ...parCle.details, signature: '{"releves":["cotes-payantes","direct","cotes-gratuites"]}' } };
  assert.equal(classer(autre, ctx).classe, 'a-expliquer', 'un autre relevé en plus du direct');
  const cause = CAUSES_CONNUES.find((c) => c.id === 'direct-suspendu-fotmob');
  assert.equal(K.peutEtreRattache(autre, cause).ok, true, 'rattachable à la main');
});

test('P4b-1 RC-6 : « CôteMaster a été arrêté : par vous ? » peut recevoir « oui » (arret-par-pierre, à la main, jamais d’office)', () => {
  const cause = CAUSES_CONNUES.find((c) => c.id === 'arret-par-pierre');
  assert.equal(cause.mode, 'a-la-main');
  for (const type of ['arret-du-serveur', 'redemarrage-rapide']) {
    const ev = { type, cle: '1', classe: 'a-expliquer' };
    assert.deepEqual(CAUSES_CONNUES.filter((c) => K.peutEtreRattache(ev, c).ok).map((c) => c.id), ['arret-par-pierre'], type);
    assert.equal(classer(ev).classe, 'a-expliquer', 'jamais d’office');
  }
  assert.equal(K.peutEtreRattache({ type: 'arret-sur-erreur', cle: '1', classe: 'nouvelle' }, cause).ok, false);
});

test('P4b-1 RC-7 (décision 26 c) : un dépassement de borne expliqué par une note → « à part » et l’essai tenu ; sans note → en attente puis pas tenu', () => {
  const R = RECETTE_J0('2026-11-20');
  for (const cle of ['fotmob', 'audit']) {
    const ev = { id: `2026-11-25|alerte-au-dela-de-la-borne|${cle}|10:00:00`, le: '2026-11-25T10:00:00Z', type: 'alerte-au-dela-de-la-borne', cle, classe: 'a-expliquer', cause: null, rodage: false };
    const jours = [];
    for (let d = 21; d <= 30; d += 1) jours.push({ jour: `2026-11-${d}`, evenements: d === 25 ? [ev] : [] });
    for (let d = 1; d <= 4; d += 1) jours.push({ jour: `2026-12-0${d}`, evenements: [] });
    assert.equal(K.decompte({ jours, decisions: [], recette: R, aujourdhui: '2026-12-05' }).etat, 'en-attente', cle);
    assert.equal(K.decompte({ jours, decisions: [], recette: R, aujourdhui: '2026-12-08' }).etat, 'pas-tenue', cle);
    const note = { sorte: 'note', le: '2026-11-25T12:00:00Z', raison: 'FotMob en panne de son côté, 7 h', evenement: ev.id, auteur: 'Pierre' };
    assert.equal(K.verifierUneDecision({ decision: note, evenements: new Map([[ev.id, ev]]) }).ok, true);
    assert.equal(K.verifierUneDecision({ decision: { ...note, auteur: '' }, evenements: new Map([[ev.id, ev]]) }).ok, false, 'sans auteur');
    assert.equal(K.verifierUneDecision({ decision: note, evenements: new Map([[ev.id, ev]]), decisions: [note] }).ok, false, 'doublon sans --remplacer');
    assert.equal(K.verifierUneDecision({ decision: { ...note, evenement: 'x' }, evenements: new Map([[ev.id, ev]]) }).ok, false, 'événement inconnu');
    const autre = { ...ev, id: 'y', type: 'arret-du-serveur' };
    assert.equal(K.verifierUneDecision({ decision: { ...note, evenement: 'y' }, evenements: new Map([['y', autre]]) }).ok, false, 'une note ne vise qu’un dépassement');
    const dc = K.decompte({ jours, decisions: [note], recette: R, aujourdhui: '2026-12-08' });
    assert.equal(dc.etat, 'tenue', cle);
    assert.equal(dc.aPart.length, 1);
    assert.match(dc.phrase, /1 événement compté à part, expliqué par une note/);
    assert.equal(K.appliquerLesDecisions([ev], [note])[0].classeFinale, 'a-part');
  }
});

test('P4b-1 RC-7 et RC-8 : recette.mjs --noter --evenement --auteur, et un identifiant daté de la veille retrouvé dans le fichier du lendemain', () => {
  const d = dossierRecette();
  try {
    const arret = { id: '2026-11-18|arret-du-serveur|4242|22:58:00', le: '2026-11-18T22:58:00Z', type: 'arret-du-serveur', cle: '4242', texte: 'CôteMaster a été arrêté : par vous ?', classe: 'a-expliquer' };
    const borne = { id: '2026-11-19|alerte-au-dela-de-la-borne|fotmob|09:00:00', le: '2026-11-19T09:00:00Z', type: 'alerte-au-dela-de-la-borne', cle: 'fotmob', texte: 'FotMob en panne plus de 6 h', classe: 'a-expliquer' };
    d.jour('2026-11-19', [arret, borne]);
    const lancer = (...args) => {
      const lignes = [];
      const code = R.lancer([...args, '--racine', d.chemins.racine, '--journal', d.chemins.dossierDuJournal], { ecrire: (l) => lignes.push(l), maintenant: Date.parse('2026-11-19T10:00:00Z'), parDefaut: () => ({ ok: false, raison: 'jamais' }) });
      return { code, sortie: lignes.join('\n') };
    };
    const r1 = lancer('--classer', arret.id, '--cause', 'arret-par-pierre', '--raison', 'arrêté pour la mise à jour de Windows');
    assert.equal(r1.code, 0, r1.sortie);
    assert.deepEqual(R.joursOuChercher(arret.id, Date.parse('2026-11-19T10:00:00Z')), ['2026-11-18', '2026-11-19']);
    assert.equal(R.joursOuChercher('2026-11-01|x', Date.parse('2026-12-30T10:00:00Z')).length, R.JOURS_DE_RECHERCHE);
    const r2 = lancer('--noter', '--evenement', borne.id, '--raison', 'FotMob en panne de son côté', '--auteur', 'Pierre');
    assert.equal(r2.code, 0, r2.sortie);
    const r3 = lancer('--noter', '--evenement', borne.id, '--raison', 'encore');
    assert.notEqual(r3.code, 0);
    assert.match(r3.sortie, /auteur/);
    const decisions = JSON.parse(fs.readFileSync(d.chemins.decisions, 'utf8')).decisions;
    assert.deepEqual(decisions.map((x) => [x.sorte, x.evenement, x.cause ?? x.auteur]), [['rattachement', arret.id, 'arret-par-pierre'], ['note', borne.id, 'Pierre']]);
  } finally {
    d.nettoyer();
  }
});

test('P4b-1 RC-15 : en mode bac, --racine et --journal hors du bac → REFUS et aucun fichier ; jamais %USERPROFILE%\\CoteMaster\\recette depuis le dossier temporaire', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'recette47-rc15-'));
  try {
    const bac = path.join(dossier, 'bac');
    const hors = path.join(dossier, 'ailleurs');
    fs.mkdirSync(bac, { recursive: true });
    const lignes = [];
    const code = R.lancer(['--annoncer-la-mise-en-service', 'essai RC-15', '--racine', path.join(hors, 'r'), '--journal', path.join(hors, 'j')], { ecrire: (l) => lignes.push(l), bac, environnement: {}, tmpdir: path.join(dossier, 'tmp-fictif'), parDefaut: () => ({ ok: false, raison: 'jamais' }) });
    assert.notEqual(code, 0);
    assert.match(lignes.join('\n'), /REFUS : mode bac/);
    assert.equal(fs.existsSync(hors), false, 'aucun fichier');
    const dedans = R.lancer(['--annoncer-la-mise-en-service', 'essai RC-15', '--racine', path.join(bac, 'r'), '--journal', path.join(bac, 'j')], { ecrire: () => {}, bac, environnement: {}, tmpdir: path.join(dossier, 'tmp-fictif'), parDefaut: () => ({ ok: false, raison: 'jamais' }) });
    assert.equal(dedans, 0);
    const chezPierre = path.join(os.homedir(), 'CoteMaster', 'recette');
    const g = R.gardeDesCheminsEcrits([chezPierre, path.join(dossier, 'j')], { environnement: {}, bac: null, ici: path.join(os.tmpdir(), 'copie-des-poses', 'scripts'), tmpdir: os.tmpdir(), accueil: os.homedir() });
    assert.equal(g.ok, false);
    assert.match(g.raison, /dossier temporaire/);
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});

test('P4b-1 RC-24 : les raisons « à expliquer » montrées à Pierre sont en mots (ni date AAAA-MM-JJ, ni « Pierre », ni identifiant)', () => {
  const ctx = { ...RECETTE_CTX, controle: { controles: [{ cle: 'score-calendrier', statutLe: 'erreur', constats: [] }] } };
  const cas = [
    classer({ type: 'type-inconnu', cle: 'x' }),
    classer({ type: 'etape-en-alerte', cle: 'x', classe: 'a-expliquer', cause: 'cause-inexistante', details: { statut: 'warn' } }),
    classer(etape('controleQuotidien', 'warn', 'contrôle du jour : 1 contrôle en panne'), ctx),
    classer(etape('controle', 'warn', AUDIT.replace('30 anomalies', '99 anomalies'))),
    classer({ type: 'alerte-changee', cle: 'audit', details: { avant: '{"parType":["buteurs"]}', signature: '{"parType":["buteurs","gardien"]}', nombres: { anomalies: 30 } } }),
    classer(etape('iaAutoAvantMatch', 'warn', '12 rencontres sans analyse : 4 faites, 3 échecs — arrêt après plusieurs pannes de Claude Code d’affilée.'))
  ];
  for (const c of cas) {
    assert.equal(c.classe === 'connue', false, JSON.stringify(c));
    assert.doesNotMatch(String(c.raison ?? ''), /\d{4}-\d{2}-\d{2}|Pierre|« [a-z]+-[a-z-]+ »/, JSON.stringify(c));
  }
});

test('P4b-1 RC-26 : --resume-du-jour sur un fichier du jour illisible → « illisible : à expliquer », puis le décompte et « Non surveillé » ; le coût de la veille écrit une fois', () => {
  const d = dossierRecette();
  try {
    fs.mkdirSync(d.chemins.dossierDuJournal, { recursive: true });
    fs.writeFileSync(d.chemins.fichierDuJour('2026-11-22'), '{ illisible');
    const lignes = [];
    const code = R.lancer(['--resume-du-jour', '--jour', '2026-11-22', '--racine', d.chemins.racine, '--journal', d.chemins.dossierDuJournal], { ecrire: (l) => lignes.push(l), maintenant: Date.parse('2026-11-23T10:00:00Z'), recette: RECETTE_J0('2026-11-20'), parDefaut: () => ({ ok: false, raison: 'jamais' }) });
    const s = lignes.join('\n');
    assert.equal(code, 0, s);
    assert.match(s, /Fichier du jour illisible \(.*\) : à expliquer/);
    assert.doesNotMatch(s, /NON OBSERVÉ/);
    assert.match(s, /Décompte : /);
    assert.match(s, /Non surveillé par l'essai/);
    assert.equal((s.match(/non compté : aucune heure de coup d’envoi lisible sans la base/g) ?? []).length, 1, s);
    // Les épisodes disent le TITRE des causes, jamais leur identifiant.
    const ev = { id: '2026-11-21|trou|1|02:00:00', le: '2026-11-21T02:00:00Z', type: 'trou', cle: '1', classe: 'connue', cause: 'veille-du-pc', texte: 'veille' };
    d.jour('2026-11-21', [ev]);
    const l2 = [];
    R.lancer(['--resume-du-jour', '--jour', '2026-11-21', '--racine', d.chemins.racine, '--journal', d.chemins.dossierDuJournal], { ecrire: (l) => l2.push(l), maintenant: Date.parse('2026-11-23T10:00:00Z'), parDefaut: () => ({ ok: false, raison: 'jamais' }) });
    const titre = CAUSES_CONNUES.find((c) => c.id === 'veille-du-pc').titre;
    assert.ok(l2.some((l) => l.startsWith('Épisodes connus du jour : ') && l.includes(titre) && !l.includes('veille-du-pc')), l2.join('\n'));
  } finally {
    d.nettoyer();
  }
});

test('P4b-1 décision 25 a : recette.mjs ne lit plus season-calendar.json (ni chemin, ni lecture)', () => {
  const src = fs.readFileSync(path.join(SERVEUR, 'scripts', 'recette.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /season-calendar|lus\.calendrier|coutDeLaVeille\(/);
  assert.equal('calendrier' in J.fichiersLus({ runtime: 'r', sauvegardes: 's' }), false);
});

test('P4b-2 (décision 27 b) : une note et une décision « nouvelle » sur le même dépassement : la plus récente (date écrite) l’emporte, dans les deux sens', () => {
  const ev = { id: '2026-11-25|alerte-au-dela-de-la-borne|fotmob|10:00:00', le: '2026-11-25T10:00:00Z', type: 'alerte-au-dela-de-la-borne', cle: 'fotmob', classe: 'a-expliquer', cause: null, rodage: false };
  const evs = new Map([[ev.id, ev]]);
  const note = (le) => ({ sorte: 'note', le, raison: 'FotMob en panne de son côté, 7 h', evenement: ev.id, auteur: 'Pierre' });
  const nouvelle = (le) => ({ sorte: 'nouvelle', le, raison: 'finalement une vraie panne, à corriger', evenement: ev.id });
  const finale = (decisions) => K.appliquerLesDecisions([ev], decisions)[0];
  const T1 = '2026-11-25T12:00:00Z', T2 = '2026-11-26T09:00:00Z';
  // Seule, chacune garde son effet.
  assert.equal(finale([note(T1)]).classeFinale, 'a-part');
  assert.equal(finale([nouvelle(T1)]).classeFinale, 'nouvelle');
  // La note, puis « nouvelle » : nouvelle (et la décision montrée est la sienne).
  assert.equal(finale([note(T1), nouvelle(T2)]).classeFinale, 'nouvelle');
  assert.equal(finale([note(T1), nouvelle(T2)]).decision.sorte, 'nouvelle');
  // « Nouvelle », puis la note : à part.
  assert.equal(finale([nouvelle(T1), note(T2)]).classeFinale, 'a-part');
  assert.equal(finale([nouvelle(T1), note(T2)]).decision.sorte, 'note');
  // L'ordre des DATES écrites, pas celui du fichier.
  assert.equal(finale([nouvelle(T2), note(T1)]).classeFinale, 'nouvelle', 'nouvelle plus récente, écrite avant dans le fichier');
  assert.equal(finale([note(T2), nouvelle(T1)]).classeFinale, 'a-part', 'note plus récente, écrite avant dans le fichier');
  // Même date, ou une date illisible : la plus loin dans decisions.json.
  assert.equal(finale([note(T2), nouvelle(T2)]).classeFinale, 'nouvelle', 'même date : la dernière écrite');
  assert.equal(finale([nouvelle(T2), note(T2)]).classeFinale, 'a-part', 'même date : la dernière écrite');
  assert.equal(finale([nouvelle('illisible'), note(T1)]).classeFinale, 'a-part', 'date illisible : la dernière écrite');
  assert.equal(finale([note(T1), nouvelle('illisible')]).classeFinale, 'nouvelle', 'date illisible : la dernière écrite');
  // La fonction elle-même.
  assert.equal(K.laPlusRecente({ d: note(T1), rang: 5 }, undefined).rang, 5);
  assert.equal(K.laPlusRecente({ d: note(T2), rang: 0 }, { d: nouvelle(T1), rang: 1 }).rang, 0);
  // Les deux sens sont acceptés à l'écriture, sans --remplacer.
  assert.equal(K.verifierUneDecision({ decision: nouvelle(T2), evenements: evs, decisions: [note(T1)] }).ok, true);
  assert.equal(K.verifierUneDecision({ decision: note(T2), evenements: evs, decisions: [nouvelle(T1)] }).ok, true);
  // Et le décompte suit : la note puis « nouvelle » → pas tenue ; « nouvelle » puis la note → tenue, 1 à part.
  const R = RECETTE_J0('2026-11-20');
  const jours = [];
  for (let d = 21; d <= 30; d += 1) jours.push({ jour: `2026-11-${d}`, evenements: d === 25 ? [ev] : [] });
  for (let d = 1; d <= 4; d += 1) jours.push({ jour: `2026-12-0${d}`, evenements: [] });
  assert.equal(K.decompte({ jours, decisions: [note(T1), nouvelle(T2)], recette: R, aujourdhui: '2026-12-08' }).etat, 'pas-tenue');
  const tenue = K.decompte({ jours, decisions: [nouvelle(T1), note(T2)], recette: R, aujourdhui: '2026-12-08' });
  assert.equal(tenue.etat, 'tenue');
  assert.equal(tenue.aPart.length, 1);
});
