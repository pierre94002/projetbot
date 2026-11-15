/**
 * LES DÉBUTS DE SAISON (étape 35, lot 1c, 14/11/2026) — la preuve après lancement de la famille retenue au banc (les
 * nouveaux venus), sur le patron de la C2 de l'étape 32 (contextePreuve.test.mjs).
 *   node --test test/debutsPreuve.test.mjs        (depuis server/)
 *
 * T-35P1 les familles à prouver et les RÉGLAGES FIGÉS : la note du banc à l'octet (sha1 762efdde…), une seule famille utile
 *        (nouveaux venus, `magasin-nouveaux-sans-cote`, horizon 1 767 matchs concernés) ; jamais rappel, promus ni force de
 *        l'effectif (explication seulement), jamais un placebo, jamais une famille dont un banc est faux ; une fiche qui porte
 *        aussi les bras des promus ne donne aucune ligne aux promus ;
 * T-35P2 la lecture des fiches (un faux magasin, pur) : une fiche écrite APRÈS le coup d'envoi n'est JAMAIS lue, ni une fiche
 *        d'une autre version, ni une fiche écrite avec une autre note du banc (d'autres réglages), ni un match attribué, sans
 *        score à la 90e, aux camps inversés ou aux bras illisibles — chacune comptée ; une fiche par rencontre ; les bras
 *        sont ceux de la fiche, recalés de la même façon pour A et B ; les jours lus : après le lancement, avant la nuit ;
 * T-35P3 le principal : rien avant l'horizon ; jamais rejugé (état de la nuit ou registre, pour CE lancement) ; rangé au
 *        registre (un registre d'ESSAI) une seule fois, un second principal de même `quoi` refusé ; la demande de la nuit
 *        (pas encore lancée, aucune famille utile, registre illisible, preuve terminée) ; l'horizon compte les lignes que le
 *        juge GARDERA (hors des fenêtres déjà vues par une version du moteur) et le principal juge exactement celles-là
 *        (avis du 14/11, constat 3) ;
 * T-35P4 la garde du mois (pur, lignes fabriquées) : z de 12 regards, une fois par mois civil, arrêtée après 12 regards,
 *        « pas assez de matchs » ne compte pas ; les lignes d'avant le lancement ne sont jamais lues, ni celles d'une fenêtre
 *        déjà vue (constat 3) ;
 * T-35P5 « moins bon » → la famille DÉMENTIE (jamais retirée), l'alerte durable (sans se faire passer pour un écart
 *        anti-fuite), l'étape « à regarder » la nuit où le démenti tombe ; à l'écran : « Explication seulement » et la note
 *        ambre « démenti sur vos matchs depuis le … » ; sans démenti, la phrase de la preuve (des comptes, la réponse entre
 *        fin 2028 et 2029, jamais un chiffre provisoire) ;
 *        un principal « moins bon » déjà au registre mais absent de l'état (la transaction de sa nuit en échec) dément la
 *        nuit suivante, avec l'alerte et « à regarder », même la garde du mois arrêtée (vérification du 14/11, constat 2) ;
 * T-35P6 trois nuits dans le VRAI processus à part (copie isolée, magasin fabriqué, registre d'essai) : des comptes avant
 *        l'horizon, rien au registre ; le principal calculé à part et rangé par le serveur à l'horizon d'essai ; jamais
 *        rejugé la nuit d'après ; les fiches pièges jamais lues ; le registre par défaut de la copie jamais créé ; les
 *        lignes déjà vues (le magasin fabriqué est dans les fenêtres de la 35 ; par `registre.lancements`, la fenêtre
 *        « moteur » d'une autre étape lancée) ne sont jamais comptées (constat 3) ;
 * T-35P7 la frontière : ni horloge, ni hasard, ni écriture de la base dans la preuve ; le registre écrit à un seul endroit
 *        (rangerLesPrincipaux, appelé par la nuit seule) ; la lecture de l'écran ne charge pas le juge ; l'actualisation ne
 *        charge toujours que debutsNuit.js, par import() dynamique ; l'alarme du constat 3 : aucune fenêtre que le juge
 *        écarterait pour la 35 ne finit après le jour du lancement.
 * Aucune base ouverte dans le processus du test (le magasin fabriqué vit dans une copie isolée) ; aucun appel à Claude.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import * as P from '../src/data/debutsDeSaison/preuveDesDebuts.js';
import * as N from '../src/data/debutsDeSaison/debutsNuit.js';
import { preuvePourLEcran, bancPourLEcran } from '../src/data/debutsDeSaison/debutsRead.js';
import { DEBUTS_AU_BANC } from '../src/data/debutsDeSaison/noteDesDebuts.js';
import { GARDE_MENSUELLE, JUGE } from '../src/data/debutsDeSaison/reglagesDebuts.js';
import { grilleDuJuge, perteDuScore } from '../src/data/debutsDeSaison/formulesDebuts.js';
import { zPour } from '../src/bench/guard.js';
import { enregistrerLancements, jugementsDe, fenetresVues } from '../src/bench/trialsRegistry.js';
import { LANCEMENTS } from '../src/bench/lancements.js';

const SRC = path.join(SERVEUR, 'src');
const UI = path.join(SERVEUR, '..', 'ui', 'src');
const lire = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-debuts-preuve.mjs');
const ID = 'magasin-nouveaux-sans-cote';
const LANCEMENT = '2026-11-10';
const U = await import(new URL(`file:///${path.join(UI, 'utils', 'debutsDeSaison.js').replace(/\\/g, '/')}`).href);
const A = await import(new URL(`file:///${path.join(UI, 'utils', 'controlesAntiFuite.js').replace(/\\/g, '/')}`).href);

fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
const DOSSIER = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-debuts-preuve-'));
after(() => fs.rmSync(DOSSIER, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

/** Un générateur à graine (mulberry32) : les lignes fabriquées sont les mêmes à chaque fois. */
function generateur(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** `n` lignes { bloc, date, a, b } : une par match, deux par jour depuis `de` ; b = a + ecart + bruit. */
function lignesFabriquees({ n, de, ecart = 0, graine = 1, prefixe = 'm' }) {
  const g = generateur(graine);
  return Array.from({ length: n }, (_, i) => {
    const a = 2.5 + g() * 1.5;
    return { bloc: `${prefixe}${i}`, date: plusJours(de, Math.floor(i / 2)), a, b: a + ecart + (g() - 0.5) * 0.4 };
  });
}
/** Un registre d'ESSAI où l'étape 35 est lancée le 10/11/2026 (jamais le vrai). */
function registreDEssai(nom) {
  const fichier = path.join(DOSSIER, nom);
  enregistrerLancements({ fichier, maintenant: Date.parse('2026-11-10T09:00:00Z') });
  return { fichier };
}
/**
 * Constat 3 (avis du 14/11) : un registre d'ESSAI qui connaît aussi, par `lancements`, le lancement d'une AUTRE étape à date
 * fixe dont une version du moteur a vu `vue` (portée « moteur ») : le juge de la 35 en écarte les lignes, la preuve aussi.
 */
function registreAvecFenetre(nom, vue) {
  const autre = { etape: '40', version: 'essai-moteur-apres-le-lancement', quoi: 'Essai : une version du moteur apprise sur des matchs d’après le lancement de la 35', le: '2026-11-11', variantes: [], vues: [{ de: vue.de, a: vue.a, quoi: 'Essai : fenêtre vue par le moteur', pour: ['moteur'] }] };
  return { ...registreDEssai(nom), lancements: [...LANCEMENTS, autre] };
}
const VUE_2027 = Object.freeze({ de: '2027-01-01', a: '2027-12-31' });

test('T-35P1 — une seule famille à prouver (les nouveaux venus, 1 767 matchs) ; les réglages de la note FIGÉS ; jamais une famille non utile, un placebo ni un banc faux', () => {
  assert.equal(sha1(fs.readFileSync(path.join(SRC, 'data', 'debutsDeSaison', 'noteDesDebuts.js'))), '762efddec7ff3ad4c5c685c4592aabd9472beebd', 'la note du banc à l’octet');
  const V = P.variantesDeLaPreuve();
  assert.deepEqual(JSON.parse(JSON.stringify(V)), [{ id: ID, famille: 'nouveaux', fenetre: 'magasin', horizon: { matchs: 1767 } }]);
  assert.ok(Object.isFrozen(V) && Object.isFrozen(V[0]));
  assert.deepEqual([...DEBUTS_AU_BANC.utiles], ['nouveaux']);
  for (const f of ['rappel', 'promus', 'effectif']) assert.ok(!V.some((v) => v.famille === f), `${f} : explication seulement`);
  // Une note où les promus seraient listés utiles sans l'être, ou où le banc des nouveaux serait faux : rien à prouver.
  const note = JSON.parse(JSON.stringify(DEBUTS_AU_BANC));
  note.utiles = ['nouveaux', 'promus'];
  assert.deepEqual(P.variantesDeLaPreuve(note).map((v) => v.famille), ['nouveaux'], 'les promus ne sont pas utiles au banc');
  note.bancFaux.nouveaux.magasin = true;
  assert.deepEqual(P.variantesDeLaPreuve(note), [], 'un banc faux : rien à prouver');
  const placebo = JSON.parse(JSON.stringify(DEBUTS_AU_BANC));
  placebo.familles.nouveaux.fenetres.magasin.variante = 'magasin-placebo-faux-promu';
  assert.deepEqual(P.variantesDeLaPreuve(placebo), [], 'jamais un placebo');
  assert.deepEqual(P.variantesDeLaPreuve(null), []);
  // Des fiches qui portent aussi les bras des promus (et du rappel) : aucune ligne pour eux, rien à juger pour eux.
  const matchs = Array.from({ length: 12 }, (_, i) => ({
    cle: `k${i}`,
    date: plusJours('2026-11-12', i),
    buts: { dom: i % 3, ext: (i + 1) % 2 },
    bras: { nouveaux: { A: { lambda: 1.3, mu: 1.1 }, B: { lambda: 1.4, mu: 1 } }, promus: { A: { lambda: 1.2, mu: 1.2 }, B: { lambda: 1, mu: 1.5 } }, rappel: { A: { lambda: 1.2, mu: 1 }, B: { lambda: 1.25, mu: 1 } } }
  }));
  const { lignes } = P.lignesDeLaPreuve(matchs, V);
  assert.deepEqual(Object.keys(lignes), [ID]);
  assert.equal(lignes[ID].length, 12);
  // Les réglages du juge : ceux de la note (mesure, tirages, graine) et la garde déclarée (12 variantes, 12 regards).
  assert.equal(JUGE.mesure, DEBUTS_AU_BANC.mesure);
  assert.deepEqual({ ...GARDE_MENSUELLE }, { variantes: 12, regardsMax: 12 });
  assert.equal(P.MESURE_DE_LA_PREUVE, 'perte-log');
});

/** Une ligne du faux magasin (la forme de SQL_DE_LA_PREUVE). */
const ligneMagasin = (k, x = {}) => ({
  fiche_id: k,
  fiche_date: `2026-11-${String(11 + k).padStart(2, '0')}`,
  home_id: 100 + k,
  away_id: 200 + k,
  version: 1,
  note: DEBUTS_AU_BANC.calculeLe,
  apres_coup_d_envoi: 0,
  calcule_le: `2026-11-${String(10 + k).padStart(2, '0')}T01:00:00.000Z`,
  bras: JSON.stringify({ note: DEBUTS_AU_BANC.calculeLe, candidate: null, familles: { nouveaux: { A: { lambda: 1.2 + k / 100, mu: 1.1 }, B: { lambda: 1.3, mu: 1 + k / 100 } } } }),
  match_key: `mk${k}`,
  date: `2026-11-${String(11 + k).padStart(2, '0')}`,
  league: 'EPL',
  saison: 2026,
  home: 100 + k,
  away: 200 + k,
  attribue: 0,
  prolongation: 0,
  bp: k % 3,
  bc: (k + 1) % 3,
  bp90: null,
  bc90: null,
  ...x
});
/** Un faux magasin : il rend les lignes données et garde la requête et ses paramètres (aucune base ouverte). */
const fauxMagasin = (lignes) => {
  const vu = { sql: null, params: null };
  return { vu, prepare: (sql) => ({ iterate: (...params) => ((vu.sql = sql), (vu.params = params), lignes[Symbol.iterator]()) }) };
};

test('T-35P2 — une fiche écrite APRÈS le coup d’envoi n’est jamais lue ; ni une autre version, ni une autre note du banc (d’autres réglages), ni un match attribué, sans score, aux camps inversés ou illisible ; les jours lus : après le lancement, avant la nuit', () => {
  const lignes = [
    ligneMagasin(1),
    ligneMagasin(2, { apres_coup_d_envoi: 1, bp: 9, bc: 0 }),
    ligneMagasin(3, { version: 2 }),
    ligneMagasin(4, { note: '2026-01-01' }),
    ligneMagasin(5, { attribue: 1 }),
    ligneMagasin(6, { prolongation: 1, bp: 3, bc: 2, bp90: null, bc90: null }),
    ligneMagasin(7, { home: 207, away: 107 }),
    ligneMagasin(8, { bras: '{pas du json' }),
    ligneMagasin(9, { prolongation: 1, bp: 3, bc: 2, bp90: 1, bc90: 1 }),
    // deux fiches pour la même rencontre : celle de la date exacte d'abord
    ligneMagasin(10, { fiche_id: 101, fiche_date: '2026-11-20', calcule_le: '2026-11-19T01:00:00.000Z', bras: JSON.stringify({ note: DEBUTS_AU_BANC.calculeLe, familles: { nouveaux: { A: { lambda: 9, mu: 9 }, B: { lambda: 9, mu: 9 } } } }) }),
    ligneMagasin(10, { fiche_id: 102, bras: JSON.stringify({ note: DEBUTS_AU_BANC.calculeLe, familles: { nouveaux: { A: { lambda: 7, mu: 7 }, B: { lambda: 7, mu: 7 } } } }) })
  ];
  const db = fauxMagasin(lignes);
  const { matchs, comptes } = P.lireLesMatchsDeLaPreuve(db, { depuis: LANCEMENT, avant: '2026-12-01' });
  assert.deepEqual(db.vu.params, [LANCEMENT, '2026-12-01'], 'après le jour du lancement, avant le jour de la nuit');
  assert.match(db.vu.sql, /d\.date > \? AND d\.date < \?/);
  assert.match(db.vu.sql, /f\.match_key IS NOT NULL/);
  assert.deepEqual(matchs.map((m) => m.cle), ['mk1', 'mk9', 'mk10']);
  assert.deepEqual(comptes, { fichesLues: 11, doublons: 1, apresCoupDEnvoi: 1, autreVersion: 1, autreNote: 1, illisibles: 1, campsInverses: 1, attribues: 1, sansScore90: 1, matchs: 3 });
  assert.ok(!matchs.some((m) => m.cle === 'mk2'), 'la fiche d’après le coup d’envoi n’est jamais lue');
  assert.deepEqual(matchs.find((m) => m.cle === 'mk9').buts, { dom: 1, ext: 1 }, 'le score de la 90e, jamais celui de la 120e');
  assert.deepEqual(matchs.find((m) => m.cle === 'mk10').bras.nouveaux.A, { lambda: 7, mu: 7 }, 'la fiche de la date exacte, jamais celle d’un jour d’écart');
  // Les bras sont ceux de la fiche ; chaque bras recalé de la même façon (ses deux niveaux sur les matchs concernés).
  const V = P.variantesDeLaPreuve();
  const { lignes: L, recalages } = P.lignesDeLaPreuve(matchs, V);
  const r = recalages[ID];
  const sommes = (bras) => matchs.reduce((s, m) => ({ d: s.d + m.buts.dom, e: s.e + m.buts.ext, l: s.l + m.bras.nouveaux[bras].lambda, u: s.u + m.bras.nouveaux[bras].mu }), { d: 0, e: 0, l: 0, u: 0 });
  for (const bras of ['A', 'B']) {
    const s = sommes(bras);
    assert.ok(Math.abs(r[bras].cDom - Math.log(s.d / s.l)) < 1e-12 && Math.abs(r[bras].cExt - Math.log(s.e / s.u)) < 1e-12, bras);
  }
  const m0 = matchs[0];
  const attendu = perteDuScore(grilleDuJuge(m0.bras.nouveaux.A.lambda * Math.exp(r.A.cDom), m0.bras.nouveaux.A.mu * Math.exp(r.A.cExt)), m0.buts);
  assert.ok(Math.abs(L[ID][0].a - attendu) < 1e-12);
  assert.deepEqual(Object.keys(L[ID][0]).sort(), ['a', 'b', 'bloc', 'date']);
  // Sans fiche lisible, sans note figée : rien.
  assert.equal(P.lireLesMatchsDeLaPreuve(fauxMagasin([ligneMagasin(1)]), { depuis: LANCEMENT, avant: '2026-12-01', note: { ...DEBUTS_AU_BANC, calculeLe: null } }).matchs.length, 0);
});

test('T-35P3 — le principal : rien avant l’horizon, jamais rejugé (état de la nuit ou registre), rangé UNE fois au registre ; la demande de la nuit', () => {
  const V = P.variantesDeLaPreuve();
  const [v] = V;
  assert.deepEqual(P.horizonDe(v, { matchs: 1766, lancementLe: LANCEMENT, jourD: '2028-01-01' }).atteint, false, 'un match de moins');
  assert.deepEqual(P.horizonDe(v, { matchs: 1767, lancementLe: LANCEMENT, jourD: '2026-11-11' }), { atteint: true, matchs: 1767, attendus: 1767, jours: 1 });
  const registre = registreDEssai('registre-t-35p3.json');
  const lignes = { [ID]: lignesFabriquees({ n: 40, de: '2026-11-11', graine: 3 }) };
  const commun = { lignes, variantes: V, lancement: { le: LANCEMENT }, jourD: '2026-12-15', instant: Date.parse('2026-12-15T01:00:00Z'), registre };
  // Avant l'horizon (le vrai : 1 767) : des comptes seulement.
  const c0 = P.calculerLaPreuve(commun);
  assert.deepEqual(c0.principaux, {});
  assert.deepEqual(c0.parVariante.map((x) => [x.id, x.matchs, x.attendus, x.atteint]), [[ID, 40, 1767, false]]);
  // À l'horizon d'essai : le principal, calculé SANS être rangé.
  const horizon = { matchs: { [ID]: 40 } };
  const c1 = P.calculerLaPreuve({ ...commun, horizon });
  const j = c1.principaux[ID];
  assert.ok(j && j.principal === true && j.etape === '35' && j.quoi === P.quoiDuPrincipal(ID) && j.lancement === LANCEMENT, JSON.stringify(j).slice(0, 300));
  assert.equal(j.n.matchs, 40);
  assert.equal(jugementsDe('35', { ...registre }).length, 0, 'rien au registre : le processus à part ne range pas');
  // Jamais rejugé : un principal pris (état de CE lancement, ou registre) n'appelle plus le juge.
  assert.deepEqual(P.calculerLaPreuve({ ...commun, horizon, etat: { principal: { [ID]: { le: '2026-12-01T01:00:00.000Z', lancement: LANCEMENT, verdict: 'pas-prouve' } } } }).principaux, {}, 'état de la nuit');
  assert.deepEqual(P.calculerLaPreuve({ ...commun, horizon, dejaAuRegistre: [ID] }).principaux, {}, 'registre');
  assert.ok(P.calculerLaPreuve({ ...commun, horizon, etat: { principal: { [ID]: { lancement: '2025-01-01', verdict: 'pas-prouve' } } } }).principaux[ID], 'un principal d’un AUTRE lancement ne compte pas');
  // Le rangement : une fois ; le même refusé ensuite ; un jugement qui n'est pas un principal de ce lancement refusé.
  const instant = Date.parse('2026-12-15T01:05:00Z');
  const r1 = P.rangerLesPrincipaux({ principaux: c1.principaux, lancement: { le: LANCEMENT }, registre, instant });
  assert.deepEqual(Object.keys(r1.enregistres), [ID]);
  assert.deepEqual(r1.refuses, []);
  const r2 = P.rangerLesPrincipaux({ principaux: c1.principaux, lancement: { le: LANCEMENT }, registre, instant });
  assert.deepEqual(r2, { enregistres: {}, refuses: [{ id: ID, raison: 'déjà au registre pour ce lancement' }] });
  assert.equal(jugementsDe('35', registre).filter((x) => x.principal === true).length, 1);
  const autre = registreDEssai('registre-t-35p3-b.json');
  const r3 = P.rangerLesPrincipaux({ principaux: { [ID]: { ...j, principal: false } }, lancement: { le: LANCEMENT }, registre: autre, instant });
  assert.deepEqual(r3.refuses, [{ id: ID, raison: 'pas un principal de ce lancement' }]);
  assert.equal(jugementsDe('35', autre).length, 0);
  // La demande de la nuit.
  const d = P.demandeDeLaPreuve({ instant, registre });
  assert.deepEqual(d.lancement, { le: LANCEMENT, version: 'debuts-de-saison-v1' });
  assert.deepEqual(d.dejaAuRegistre, [ID], 'le principal déjà au registre est dit au processus à part');
  assert.match(P.demandeDeLaPreuve({ instant, registre: { fichier: path.join(DOSSIER, 'absent.json') } }).rien, /pas encore lancée/);
  assert.match(P.demandeDeLaPreuve({ instant, registre, note: { ...DEBUTS_AU_BANC, utiles: [] } }).rien, /aucune famille utile/);
  const casse = path.join(DOSSIER, 'registre-casse.json');
  fs.writeFileSync(casse, '{ pas du json');
  assert.match(P.demandeDeLaPreuve({ instant, registre: { fichier: casse } }).rien, /illisible/);
  const fini = { principal: { [ID]: { lancement: LANCEMENT, verdict: 'pas-prouve' } }, surete: { lancement: LANCEMENT, regards: 12 } };
  assert.match(P.demandeDeLaPreuve({ instant, registre, etat: fini }).rien, /preuve terminée/);
  // L'horizon compte les lignes que le juge GARDERA (avis du 14/11, constat 3) : 1 800 lignes d'après le lancement, dont 900 dans
  // une fenêtre déjà vue par une version du moteur (2027) → 900 comptées, l'horizon de 1 767 pas atteint, aucun principal ;
  // 1 900 gardées (et les mêmes 900) → le principal, jugé sur les 1 900 exactement.
  const reg3 = registreAvecFenetre('registre-t-35p3-vues.json', VUE_2027);
  const fenetres = fenetresVues('35', reg3);
  assert.ok(fenetres.some((f) => f.de === VUE_2027.de && f.a === VUE_2027.a), 'la fenêtre « moteur » d’une autre étape lancée est écartée par le juge de la 35');
  const dans2027 = lignesFabriquees({ n: 900, de: '2027-01-01', graine: 21, prefixe: 'v' }).map((l, i) => ({ ...l, date: plusJours('2027-01-01', i % 365) }));
  const hors = (n) => lignesFabriquees({ n, de: '2028-01-01', graine: 22, prefixe: 'h' }).map((l, i) => ({ ...l, date: plusJours('2028-01-01', i % 365) }));
  const vues = { variantes: V, lancement: { le: LANCEMENT }, jourD: '2029-01-15', instant: Date.parse('2029-01-15T01:00:00Z'), registre: reg3, fenetres };
  const c3 = P.calculerLaPreuve({ ...vues, lignes: { [ID]: [...hors(900), ...dans2027] } });
  assert.deepEqual(c3.parVariante.map((x) => [x.matchs, x.ecarteesDejaVues, x.attendus, x.atteint]), [[900, 900, 1767, false]], '900 lignes jugeables sur 1 800');
  assert.deepEqual(c3.principaux, {}, 'l’horizon n’est pas atteint : aucun principal');
  const c4 = P.calculerLaPreuve({ ...vues, lignes: { [ID]: [...hors(1900), ...dans2027] } });
  assert.deepEqual(c4.parVariante.map((x) => [x.matchs, x.ecarteesDejaVues, x.atteint]), [[1900, 900, true]]);
  assert.deepEqual([c4.principaux[ID]?.n?.matchs, c4.principaux[ID]?.ecartees?.donneesVues], [1900, 900], 'le principal juge les lignes que l’horizon a comptées, ni plus ni moins');
});

test('T-35P4 — la garde du mois : z de 12 regards, une fois par mois civil, arrêtée après 12 regards, « pas assez de matchs » ne compte pas ; les lignes d’avant le lancement jamais lues', () => {
  const V = P.variantesDeLaPreuve();
  const assez = { [ID]: lignesFabriquees({ n: 260, de: '2026-11-11', ecart: 0, graine: 5 }) };
  const base = { variantes: V, lancement: { le: LANCEMENT }, instant: Date.parse('2027-01-02T01:00:00Z'), registre: {} };
  const g1 = P.calculerLaPreuve({ ...base, lignes: assez, jourD: '2027-01-02' }).garde;
  assert.equal(g1.faite, true);
  assert.equal(g1.regard, true);
  assert.equal(g1.resultats[ID].variantes, 12);
  assert.ok(Math.abs(g1.resultats[ID].z - zPour(0.05, 12)) < 1e-12, 'z de 12 regards');
  assert.equal(g1.resultats[ID].verdict, 'pas-prouve');
  // Une fois par mois civil.
  const e1 = P.etatApresLaPreuve({ calcul: P.calculerLaPreuve({ ...base, lignes: assez, jourD: '2027-01-02' }), lancement: { le: LANCEMENT }, instant: base.instant, jourD: '2027-01-02' });
  assert.equal(e1.surete.regards, 1);
  assert.equal(e1.surete.dernierMois, '2027-01');
  const g2 = P.calculerLaPreuve({ ...base, lignes: assez, jourD: '2027-01-20', etat: { surete: e1.surete } }).garde;
  assert.deepEqual([g2.faite, g2.raison], [false, 'déjà faite ce mois-ci']);
  // Arrêtée après 12 regards : douze mois de suite, puis plus rien.
  let surete = null;
  for (let k = 0; k < 14; k++) {
    const jourD = plusJours('2027-01-02', 31 * k).slice(0, 7) + '-02';
    const calcul = P.calculerLaPreuve({ ...base, lignes: assez, jourD, etat: { surete } });
    if (k < 12) assert.equal(calcul.garde.regard, true, `regard ${k + 1}`);
    else assert.deepEqual([calcul.garde.faite, calcul.garde.raison], [false, 'arrêtée après 12 regards'], `regard ${k + 1}`);
    surete = P.etatApresLaPreuve({ etatAvant: { surete }, calcul, lancement: { le: LANCEMENT }, instant: base.instant, jourD }).surete;
  }
  assert.equal(surete.regards, 12);
  assert.equal(surete.historique.length, 12);
  // « Pas assez de matchs » n'est pas un regard (la garde réessaie la nuit suivante).
  const peu = { [ID]: lignesFabriquees({ n: 50, de: '2026-11-11', graine: 6 }) };
  const g3 = P.calculerLaPreuve({ ...base, lignes: peu, jourD: '2027-01-02' }).garde;
  assert.deepEqual([g3.faite, g3.regard], [true, false]);
  assert.equal(g3.resultats[ID].verdict, 'pas-assez-de-matchs');
  const e3 = P.etatApresLaPreuve({ calcul: P.calculerLaPreuve({ ...base, lignes: peu, jourD: '2027-01-02' }), lancement: { le: LANCEMENT }, instant: base.instant, jourD: '2027-01-02' });
  assert.deepEqual([e3.surete.regards, e3.surete.dernierMois], [0, null]);
  // Les lignes d'avant le lancement (et du jour même) ne sont jamais lues : 300 lignes très mauvaises pour B n'y changent rien.
  const avant = lignesFabriquees({ n: 300, de: '2026-08-01', ecart: 3, graine: 7, prefixe: 'v' }).map((l, i) => ({ ...l, date: i % 2 ? LANCEMENT : plusJours('2026-08-01', i % 90) }));
  const avec = P.calculerLaPreuve({ ...base, lignes: { [ID]: [...avant, ...assez[ID]] }, jourD: '2027-01-02' });
  const sans = P.calculerLaPreuve({ ...base, lignes: assez, jourD: '2027-01-02' });
  assert.deepEqual(avec.garde, sans.garde);
  assert.deepEqual(avec.parVariante, sans.parVariante);
  // Ni celles d'une fenêtre déjà vue par une version du moteur (avis du 14/11, constat 3) : 300 lignes très mauvaises pour B, toutes
  // en 2027, n'y changent rien ; la garde juge les 260 gardées, et le compte les dit à part.
  const avant2027 = assez[ID].map((l, i) => ({ ...l, date: plusJours('2026-11-11', i % 50) }));
  const tout = { [ID]: [...avant2027, ...lignesFabriquees({ n: 300, de: '2027-01-01', ecart: 3, graine: 8, prefixe: 'w' })] };
  const vu = P.calculerLaPreuve({ ...base, lignes: tout, jourD: '2028-02-02', fenetres: [VUE_2027] });
  assert.deepEqual(vu.garde, P.calculerLaPreuve({ ...base, lignes: { [ID]: avant2027 }, jourD: '2028-02-02' }).garde);
  assert.deepEqual([vu.garde.resultats[ID].matchs, vu.parVariante[0].matchs, vu.parVariante[0].ecarteesDejaVues], [260, 260, 300]);
  assert.equal(P.calculerLaPreuve({ ...base, lignes: tout, jourD: '2028-02-02' }).garde.resultats[ID].matchs, 560, 'témoin : sans la fenêtre, les 560');
});

test('T-35P5 — « moins bon » → DÉMENTI (jamais retiré), alerte durable, « à regarder » la nuit où il tombe ; à l’écran : « Explication seulement » et la note ambre ; sans démenti, la phrase de la preuve (2027-2028, aucun chiffre provisoire)', () => {
  const V = P.variantesDeLaPreuve();
  const pire = { [ID]: lignesFabriquees({ n: 260, de: '2026-11-11', ecart: 0.3, graine: 9 }) };
  const instant = Date.parse('2027-02-03T01:00:00Z');
  const calcul = P.calculerLaPreuve({ lignes: pire, variantes: V, lancement: { le: LANCEMENT }, jourD: '2027-02-03', instant, registre: {} });
  assert.equal(calcul.garde.resultats[ID].verdict, 'moins-bon');
  const e = P.etatApresLaPreuve({ calcul, lancement: { le: LANCEMENT }, instant, jourD: '2027-02-03' });
  assert.deepEqual(e.nouveauxDementis, [ID]);
  assert.equal(e.dementis[ID].famille, 'nouveaux');
  assert.equal(e.dementis[ID].jour, '2027-02-03');
  assert.equal(e.dementis[ID].source, 'garde-du-mois');
  assert.equal(e.dementis[ID].depuis, LANCEMENT);
  // La nuit d'après (mois suivant, lignes redevenues bonnes) : le démenti reste, rien de neuf.
  const bon = { [ID]: lignesFabriquees({ n: 300, de: '2026-11-11', ecart: -0.3, graine: 10 }) };
  const calcul2 = P.calculerLaPreuve({ lignes: bon, variantes: V, lancement: { le: LANCEMENT }, jourD: '2027-03-03', instant, registre: {}, etat: { surete: e.surete, dementis: e.dementis } });
  assert.deepEqual(calcul2.garde.resultats[ID], { verdict: null, deja: 'dementi' });
  const e2 = P.etatApresLaPreuve({ etatAvant: { surete: e.surete, dementis: e.dementis }, calcul: calcul2, lancement: { le: LANCEMENT }, instant, jourD: '2027-03-03' });
  assert.deepEqual(e2.nouveauxDementis, []);
  assert.deepEqual(e2.dementis, e.dementis, 'un démenti n’est jamais retiré');
  // Un principal « moins bon » dément aussi.
  const e3 = P.etatApresLaPreuve({ calcul: { parVariante: [], garde: { faite: false, regard: false } }, enregistres: { [ID]: { verdict: 'moins-bon', le: '2027-05-01T01:00:00.000Z', n: { matchs: 1767 } } }, lancement: { le: LANCEMENT }, instant, jourD: '2027-05-01' });
  assert.equal(e3.dementis[ID].source, 'principal');
  // L'étape de nuit : « à regarder » la nuit où le démenti tombe, puis « ok » ; l'alerte durable garde le démenti.
  const nuit = (preuve) => ({ mode: 'complet', bilan: { clubs: 3, parStatut: {}, fiches: 2 }, controle: { couples: 20, lignes: 40, ecarts: [] }, ecrites: { fiches: { figees: 0 } }, preuve, dureeMs: 1000 });
  const tombe = N.resultatDeLEtape(nuit({ rien: null, etat: e.preuve, principal: {}, principauxRanges: [], nouveauxDementis: e.nouveauxDementis, dementis: e.dementis }), { updatedAt: '2027-02-03T01:10:00.000Z' });
  assert.equal(tombe.status, 'warn');
  assert.match(tombe.summary, /DÉMENTI sur vos matchs : nouveaux venus depuis le 03\/02\/2027/);
  assert.match(tombe.summary, / ; contrôle anti-fuite : 20 couples, 0 écart\.$/, 'le contrôle anti-fuite reste le dernier morceau');
  assert.equal(tombe.alert.key, 'debutsDeSaison');
  assert.deepEqual(tombe.alert.value.dementis.map((d) => [d.variante, d.famille, d.jour, d.source]), [[ID, 'nouveaux', '2027-02-03', 'garde-du-mois']]);
  assert.equal(tombe.alert.value.total, 0);
  assert.deepEqual(A.controlesAntiFuiteDits({ debutsDeSaison: tombe.alert.value }), [], 'un démenti ne se fait pas passer pour un écart anti-fuite');
  const reste = N.resultatDeLEtape(nuit({ rien: null, etat: e2.preuve, principal: {}, principauxRanges: [], nouveauxDementis: [], dementis: e2.dementis }), { updatedAt: '2027-03-03T01:10:00.000Z' });
  assert.equal(reste.status, 'ok');
  assert.ok(reste.alert.value?.dementis?.length === 1, 'l’alerte durable garde le démenti');
  const panne = N.resultatDeLEtape(nuit({ erreur: 'base absente', dementis: null }), { updatedAt: null });
  assert.equal(panne.status, 'warn');
  assert.match(panne.summary, /preuve sur vos matchs : en échec \(base absente\)/);
  const sansPreuve = N.resultatDeLEtape(nuit({ rien: 'l’étape 35 n’est pas encore lancée', dementis: null }), { updatedAt: null });
  assert.equal(sansPreuve.status, 'ok');
  assert.equal(sansPreuve.alert.value, null);
  // Un principal « moins bon » rangé au registre, puis la transaction de l'état de cette nuit-là en échec (l'état n'a ni le
  // principal ni le démenti) : la nuit suivante le dément quand même — alerte durable, « à regarder » —, puis plus rien de neuf
  // (vérification du 14/11, constat 2). La garde du mois est déjà faite ce mois-ci : seul le principal peut démentir.
  const registre5 = registreDEssai('registre-t-35p5.json');
  const bienPire = { [ID]: lignesFabriquees({ n: 260, de: '2026-11-11', ecart: 0.6, graine: 11 }) };
  const surete5 = { lancement: LANCEMENT, regards: 6, dernierMois: '2027-05', historique: [] };
  const horizon5 = { matchs: { [ID]: 260 } };
  const nuitN = Date.parse('2027-05-10T01:00:00Z');
  const cN = P.calculerLaPreuve({ lignes: bienPire, variantes: V, lancement: { le: LANCEMENT }, jourD: '2027-05-10', instant: nuitN, registre: registre5, etat: { surete: surete5 }, horizon: horizon5 });
  assert.equal(cN.principaux[ID]?.verdict, 'moins-bon');
  assert.equal(cN.garde.faite, false, 'la garde du mois est déjà faite ce mois-ci');
  assert.deepEqual(Object.keys(P.rangerLesPrincipaux({ principaux: cN.principaux, lancement: { le: LANCEMENT }, registre: registre5, instant: nuitN }).enregistres), [ID]);
  const nuitN1 = Date.parse('2027-05-11T01:00:00Z');
  const dN1 = P.demandeDeLaPreuve({ instant: nuitN1, registre: registre5, etat: { principal: null, surete: surete5, dementis: null } });
  assert.deepEqual(dN1.dejaAuRegistre, [ID]);
  const cN1 = P.calculerLaPreuve({ lignes: bienPire, variantes: V, lancement: dN1.lancement, jourD: '2027-05-11', instant: nuitN1, registre: registre5, etat: dN1.etat, dejaAuRegistre: dN1.dejaAuRegistre, horizon: horizon5 });
  assert.deepEqual(cN1.principaux, {}, 'jamais rejugé');
  assert.equal(cN1.garde.faite, false);
  const eN1 = P.etatApresLaPreuve({ etatAvant: dN1.etat, calcul: cN1, enregistres: {}, dejaAuRegistre: dN1.jugementsDejaAuRegistre, lancement: dN1.lancement, instant: nuitN1, jourD: '2027-05-11' });
  assert.deepEqual(eN1.nouveauxDementis, [ID], 'le démenti d’un principal déjà au registre n’est pas perdu');
  assert.deepEqual([eN1.dementis[ID].source, eN1.dementis[ID].jour, eN1.dementis[ID].depuis, eN1.principal[ID].verdict], ['principal', '2027-05-11', LANCEMENT, 'moins-bon']);
  const tombeN1 = N.resultatDeLEtape(nuit({ rien: null, etat: eN1.preuve, principal: eN1.principal, principauxRanges: [], nouveauxDementis: eN1.nouveauxDementis, dementis: eN1.dementis }), { updatedAt: '2027-05-11T01:10:00.000Z' });
  assert.equal(tombeN1.status, 'warn');
  assert.match(tombeN1.summary, /DÉMENTI sur vos matchs : nouveaux venus depuis le 11\/05\/2027/);
  assert.deepEqual(tombeN1.alert.value.dementis.map((d) => [d.variante, d.source, d.jour]), [[ID, 'principal', '2027-05-11']]);
  const eN2 = P.etatApresLaPreuve({ etatAvant: { principal: eN1.principal, surete: eN1.surete, dementis: eN1.dementis }, calcul: cN1, enregistres: {}, dejaAuRegistre: dN1.jugementsDejaAuRegistre, lancement: dN1.lancement, instant: nuitN1 + 86_400_000, jourD: '2027-05-12' });
  assert.deepEqual(eN2.nouveauxDementis, [], 'la nuit d’après : rien de neuf');
  assert.deepEqual(eN2.dementis, eN1.dementis, 'un démenti n’est jamais retiré');
  // Le même avec la garde du mois déjà ARRÊTÉE (12 regards, le cas le plus probable à l'horizon) : tant que le démenti manque,
  // la demande de la nuit n'est pas « preuve terminée » ; une fois le démenti rangé, elle l'est.
  const surete12 = { lancement: LANCEMENT, regards: 12, dernierMois: '2027-04', historique: [] };
  const dA = P.demandeDeLaPreuve({ instant: nuitN1, registre: registre5, etat: { principal: null, surete: surete12, dementis: null } });
  assert.equal(dA.rien, undefined, 'le démenti manque : la nuit doit encore le ranger');
  assert.deepEqual(dA.dejaAuRegistre, [ID]);
  const cA = P.calculerLaPreuve({ lignes: bienPire, variantes: V, lancement: dA.lancement, jourD: '2027-05-11', instant: nuitN1, registre: registre5, etat: dA.etat, dejaAuRegistre: dA.dejaAuRegistre, horizon: horizon5 });
  assert.deepEqual([cA.principaux, cA.garde.faite], [{}, false]);
  const eA = P.etatApresLaPreuve({ etatAvant: dA.etat, calcul: cA, enregistres: {}, dejaAuRegistre: dA.jugementsDejaAuRegistre, lancement: dA.lancement, instant: nuitN1, jourD: '2027-05-11' });
  assert.deepEqual(eA.nouveauxDementis, [ID]);
  assert.match(P.demandeDeLaPreuve({ instant: nuitN1 + 86_400_000, registre: registre5, etat: { principal: eA.principal, surete: eA.surete, dementis: eA.dementis } }).rien ?? '', /preuve terminée/);
  // L'écran : la lecture passe la famille à « dementi » ; la pastille dit « Explication seulement » et la note ambre.
  const lu = preuvePourLEcran({ etat: e2.preuve, dementis: e2.dementis, principal: null });
  assert.equal(lu.statuts.nouveaux, 'dementi');
  assert.equal(lu.statuts.promus, 'explication-seulement');
  assert.deepEqual(lu.preuve.dementis.nouveaux.jour, '2027-02-03');
  const debuts = (preuve) => ({ etat: 'pret', statuts: preuve.statuts, preuve: preuve.preuve, banc: bancPourLEcran(), fiche: { bras: { familles: { nouveaux: { A: { lambda: 1.3, mu: 1.1 }, B: { lambda: 1.4, mu: 1 } } } } } });
  const dementi = debuts(lu);
  assert.deepEqual([U.pastilleDesDebuts(dementi).cle, U.pastilleDesDebuts(dementi).libelle, U.pastilleDesDebuts(dementi).vert], ['dementi', 'Explication seulement', false]);
  const note = U.noteDuDementi(dementi);
  assert.match(note.texte, /^nouveaux venus : démenti sur vos matchs depuis le 03\/02\/2027\./);
  assert.ok(!/%|[0-9],[0-9]/.test(note.texte), 'aucun chiffre');
  assert.equal(U.phraseDeLaPreuveDesDebuts(dementi), null);
  // Sans démenti : « Effet mesuré », puis la phrase de la preuve (des comptes, la réponse entre fin 2028 et 2029).
  const enCours = debuts(preuvePourLEcran({ etat: { lancement: LANCEMENT, jourD: '2026-12-15', variantes: [{ id: ID, famille: 'nouveaux', matchs: 212, attendus: 1767, principalPris: false, dementi: false }] } }));
  assert.equal(U.pastilleDesDebuts(enCours).cle, 'mesure');
  assert.equal(U.noteDuDementi(enCours), null);
  const phrase = U.phraseDeLaPreuveDesDebuts(enCours);
  assert.equal(phrase, `L’effet des nouveaux venus sera vérifié sur vos matchs (212 matchs concernés depuis le 10/11/2026 sur ${(1767).toLocaleString('fr-FR')} attendus) : la réponse viendra entre fin 2028 et 2029 (il faut 2 à 3 débuts de saison). D’ici là, c’est une explication, pas un chiffre du moteur.`);
  assert.ok(!/%/.test(phrase), 'jamais un chiffre provisoire');
  const avantLaNuit = debuts(preuvePourLEcran({}));
  assert.match(U.phraseDeLaPreuveDesDebuts(avantLaNuit), /^L’effet des nouveaux venus sera vérifié sur vos matchs \(1.767 matchs concernés attendus\) : la réponse viendra entre fin 2028 et 2029 \(il faut 2 à 3 débuts de saison\)\./);
  const dit = U.debutsDits({ debuts: { ...enCours, clubs: { home: { id: 1, nom: 'A' }, away: { id: 2, nom: 'B' } } }, match: { home: 'A', away: 'B' } });
  assert.equal(dit.preuve, phrase);
  assert.equal(dit.dementi, null);
});

const uneFois = (f) => {
  let v;
  return () => (v ??= f());
};
const nuits = uneFois(() => {
  const copie = preparerCopie({ base: false });
  try {
    const r = executer(copie, SCRIPT, { args: ['nuits', '{}'], timeout: 600_000 });
    assert.equal(r.code, 0, `nuits :\n${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json, r.sortie.slice(-500));
    return r.json;
  } finally {
    copie.nettoyer();
  }
});

test('T-35P6 — trois nuits dans le VRAI processus à part : des comptes avant l’horizon ; le principal calculé à part, rangé par le serveur ; jamais rejugé ; les fiches pièges jamais lues', () => {
  const s = nuits();
  assert.equal(s.lancement, '2025-08-10');
  assert.ok(s.pose.apres >= 12, `assez de matchs joués après le lancement (${s.pose.apres})`);
  assert.ok(s.pose.leJour + s.pose.avant >= 1, 'au moins une fiche du jour du lancement ou d’avant');
  // 1. Avant l'horizon : des comptes, rien au registre.
  assert.equal(s.nuit1.mode, 'complet', JSON.stringify(s.nuit1).slice(0, 600));
  const p1 = s.nuit1.preuve;
  assert.equal(p1.rien, null, JSON.stringify(p1).slice(0, 400));
  assert.equal(p1.erreur ?? null, null);
  const c = p1.etat.comptes;
  assert.deepEqual([c.apresCoupDEnvoi, c.autreNote, c.autreVersion], [1, 1, 1], JSON.stringify(c));
  assert.equal(typeof s.nuit1.duree, 'number', 'la preuve mesurée dans le processus à part');
  assert.equal(c.fichesLues, s.pose.apres, 'les fiches du jour du lancement et d’avant ne sont jamais lues');
  assert.equal(c.matchs, s.pose.apres - 3 - c.sansScore90 - c.attribues - c.illisibles - c.campsInverses);
  assert.deepEqual(s.lus.comptes.matchs, c.matchs);
  assert.ok(!s.lus.cles.includes(s.pose.pieges.apresCoupDEnvoi) && !s.lus.cles.includes(s.pose.pieges.autreNote) && !s.lus.cles.includes(s.pose.pieges.autreVersion));
  assert.ok(s.lus.familles.includes('nouveaux+promus'), 'des fiches portent aussi les bras des promus');
  // Le magasin fabriqué (août-septembre 2025) est tout entier dans les fenêtres déjà vues de la 35 (2023-07 → 2026-09-23) : le juge
  // en écarterait chaque ligne ; l'horizon n'en compte donc aucune, et la phrase les dit à part (avis du 14/11, constat 3).
  assert.ok(c.matchs >= 2, `des matchs lus (${c.matchs})`);
  assert.deepEqual(p1.etat.variantes.map((v) => [v.id, v.famille, v.matchs, v.ecarteesDejaVues, v.atteint, v.principalPris]), [[ID, 'nouveaux', 0, c.matchs, false, false]]);
  assert.deepEqual(s.registre1, [], 'les premiers chiffres ne sont jamais au registre');
  assert.equal(s.etat1.preuve.lancement, '2025-08-10');
  assert.equal(s.etat1.principal && Object.keys(s.etat1.principal).length, 0);
  assert.match(s.resultat1.summary, /preuve sur vos matchs : nouveaux venus 0 match concerné sur 100.000 \(\d+ autres écartés : déjà vus par une version du moteur\) depuis le 10\/08\/2025, rien de jugé avant l’horizon, des comptes seulement — la réponse viendra entre fin 2028 et 2029 \(il faut 2 à 3 débuts de saison\)/);
  assert.ok(s.resultat1.summary.includes(`(${c.matchs} autres écartés : déjà vus par une version du moteur)`), s.resultat1.summary.slice(0, 400));
  assert.match(s.resultat1.summary, / ; contrôle anti-fuite : [^;]*\.$/, 'le contrôle anti-fuite reste le dernier morceau');
  // 2. À l'horizon d'essai : le principal calculé à part, rangé UNE fois par le serveur.
  assert.equal(s.nuit2.mode, 'complet');
  assert.deepEqual(s.nuit2.preuve.principauxCalcules, [ID]);
  assert.deepEqual(s.nuit2.preuve.principauxRanges, [ID]);
  assert.equal(s.registre2.length, 1);
  assert.deepEqual([s.registre2[0].quoi, s.registre2[0].principal, s.registre2[0].lancement, s.registre2[0].matchs], [P.quoiDuPrincipal(ID), true, '2025-08-10', 0]);
  assert.ok(s.registre2[0].ecartees.donneesVues >= c.matchs, 'le magasin fabriqué est dans les fenêtres déjà vues : écarté par le juge, compté');
  assert.ok(s.etat2.principal[ID]);
  assert.match(s.resultat2.summary, /jugement principal pris cette nuit pour nouveaux venus : pas assez de matchs/);
  // 3. La nuit d'après : jamais rejugé.
  assert.deepEqual(s.nuit3.preuve.principauxCalcules, []);
  assert.deepEqual(s.nuit3.preuve.principauxRanges, []);
  assert.equal(s.registre3.length, 1, 'un seul principal au registre');
  assert.equal(s.etat3.preuve.variantes[0].principalPris, true);
  assert.match(s.resultat3.summary, /jugement principal déjà pris, jamais refait \(nouveaux venus pas assez de matchs/);
  // Le registre par défaut de la copie n'est jamais créé (seul le registre d'essai est écrit).
  assert.equal(s.vraiRegistreTouche, false);
  // 4. Par `registre.lancements` (avis du 14/11, constat 3) : le lancement d'une AUTRE étape, à date fixe, dont une version du moteur a
  // vu les 14-16/11/2026 (portée « moteur ») → les fiches de ces jours (bornes comprises) ne sont ni comptées ni jugées.
  const neuf = Array.from({ length: 9 }, (_, i) => ligneMagasin(i + 1));
  const nuit4 = { instant: Date.parse('2026-12-01T01:00:00Z'), jourD: '2026-12-01', lancement: { le: LANCEMENT } };
  const d4 = P.preuveDansLaBase({ ...nuit4, database: fauxMagasin(neuf), registre: registreAvecFenetre('registre-t-35p6.json', { de: '2026-11-14', a: '2026-11-16' }) });
  assert.equal(d4.comptes.lignes[ID], 9);
  assert.deepEqual(d4.parVariante.map((v) => [v.matchs, v.ecarteesDejaVues]), [[6, 3]], 'les fiches des 14, 15 et 16/11 ne sont pas comptées');
  assert.deepEqual(P.preuveDansLaBase({ ...nuit4, database: fauxMagasin(neuf), registre: registreDEssai('registre-t-35p6-b.json') }).parVariante.map((v) => [v.matchs, v.ecarteesDejaVues]), [[9, 0]], 'témoin : sans ce lancement, les 9');
});

test('T-35P7 — la frontière : ni horloge, ni hasard, ni écriture de la base dans la preuve ; le registre écrit à un seul endroit, par la nuit ; la lecture de l’écran ne charge pas le juge ; l’actualisation ne charge que debutsNuit.js', () => {
  const preuve = sansCommentaires(lire('data', 'debutsDeSaison', 'preuveDesDebuts.js'));
  assert.ok(!/Date\.now\(|new Date\(\)|Math\.random|fetch\(|openDb|\.run\(|INSERT\s|UPDATE\s+\w+\s+SET|DELETE\s+FROM|writeFileSync|writeJsonAtomic/.test(preuve));
  assert.match(preuve, /from '\.\/noteDesDebuts\.js'/, 'la note figée');
  assert.ok(!/debuts_etat|debuts_clubs|valeursFinales/.test(preuve), 'jamais un réglage relu dans le magasin');
  const DEBUTS = path.join(SRC, 'data', 'debutsDeSaison');
  for (const f of fs.readdirSync(DEBUTS)) {
    const t = sansCommentaires(lire('data', 'debutsDeSaison', f));
    if (f !== 'preuveDesDebuts.js') assert.ok(!/enregistrerJugement/.test(t), `${f} : le registre n’est écrit que par rangerLesPrincipaux`);
    if (f !== 'debutsNuit.js' && f !== 'preuveDesDebuts.js') assert.ok(!/rangerLesPrincipaux/.test(t), `${f} : seule la nuit range`);
  }
  const enfant = sansCommentaires(lire('data', 'debutsDeSaison', 'debutsEnfant.js'));
  assert.match(enfant, /preuveDansLaBase\(\{ database, instant, jourD, \.\.\.preuve \}\)/);
  const nuit = sansCommentaires(lire('data', 'debutsDeSaison', 'debutsNuit.js'));
  assert.match(nuit, /rangerLesPrincipaux\(\{ principaux: fin\.preuve\.principaux/);
  const read = sansCommentaires(lire('data', 'debutsDeSaison', 'debutsRead.js'));
  assert.ok(!/preuveDesDebuts|bench\//.test(read), 'la lecture de l’écran ne charge pas le juge');
  const actu = sansCommentaires(lire('jobs', 'matchStatsAutoRefresh.js'));
  assert.ok(!/preuveDesDebuts/.test(actu));
  assert.equal((actu.match(/data\/debutsDeSaison\//g) ?? []).length, 1);
  assert.match(actu, /chargerLeModule = \(\) => import\('\.\.\/data\/debutsDeSaison\/debutsNuit\.js'\)/);
  // L'écran : aucun « % » ajouté par le lot 1c dans les mots de la preuve.
  const ecran = fs.readFileSync(path.join(UI, 'utils', 'debutsDeSaison.js'), 'utf8');
  const bloc = ecran.slice(ecran.indexOf('// ------------------------------------------------------------ la preuve sur vos matchs (lot 1c)'));
  assert.ok(bloc.includes('REPONSE_DE_LA_PREUVE'));
  assert.equal(P.REPONSE_ATTENDUE, U.REPONSE_DE_LA_PREUVE, 'le serveur et l’écran disent la même chose');
  // L'alarme du constat 3 (avis du 14/11) : aucune fenêtre que le juge écarterait pour la 35 (DONNEES_VUES, celles de la 35, celles de
  // portée « moteur » ou « tout » des autres étapes, toutes lancées) ne finit après le jour du lancement — sinon des matchs de la
  // preuve sortiraient du compte : le lot qui en ajoute une le voit ici et choisit. Témoin : une telle fenêtre fait sonner l'alarme.
  const tard = (registre) => fenetresVues('35', registre).filter((f) => f.a > LANCEMENT).map((f) => `${f.de} → ${f.a} : ${f.quoi}`.slice(0, 160));
  assert.deepEqual(tard(registreDEssai('registre-t-35p7.json')), [], 'une fenêtre vue finit après le lancement de la 35 : la preuve perd ces matchs');
  assert.equal(tard(registreAvecFenetre('registre-t-35p7-temoin.json', VUE_2027)).length, 1);
});
