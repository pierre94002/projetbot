/**
 * LE CONTEXTE DU MATCH (étape 32, partie C2, 02/11/2026) — la preuve après lancement des facteurs retenus au banc.
 *   node --test test/contextePreuve.test.mjs        (depuis server/)
 *
 * T-N6  les PREMIERS CHIFFRES ne sont jamais au registre (des comptes : ni gain, ni verdict) ; le jugement PRINCIPAL est
 *       pris une seule fois par facteur, à son horizon (matchs concernés ET jours), calculé dans le processus à part et
 *       rangé au registre par le serveur — jamais refait ensuite : des nuits de suite sur un magasin fabriqué (copie
 *       isolée, horizon d'essai court) ;
 * T-N6b le principal, pièce par pièce (pur, et un registre de test) : rien avant l'horizon (les deux conditions), jamais
 *       rejugé (état de la nuit ou registre), rangé au registre une seule fois ; la demande de la nuit (pas lancée, banc
 *       faux, preuve terminée) ;
 * T-N7  la GARDE DU MOIS (pur, lignes fabriquées) : z de 12 regards, une fois par mois civil, arrêtée après 12, « pas assez
 *       de matchs » ne compte pas, les lignes d'avant le lancement jamais lues ; « moins bon » → le facteur DÉMENTI
 *       (`dementis`, lu par l'écran : statut « démenti ») et l'ALERTE DURABLE de l'étape (sans se faire passer pour un
 *       écart anti-fuite) ; un principal « moins bon » dément aussi ; un démenti n'est jamais retiré ;
 * T-F6  la preuve ÉCARTE une fiche marquée « après le coup d'envoi » et un avant-match relevé après le coup d'envoi ; un
 *       autre stade relevé avant ôte l'altitude ; une météo absurde plantée dans l'archive ne change rien ; les matchs
 *       lus sont ceux d'après le jour du lancement et d'avant le jour de la nuit ; la base au jour J = celle du banc ;
 * T-P1  la frontière : le module n'a ni horloge, ni hasard, ni écriture de la base ; le registre n'est écrit qu'à un
 *       endroit, par le serveur ; les coefficients FIGÉS (pli 1 du banc) et les horizons de la note ; jamais le faux
 *       facteur ; rien du chemin de nuit de l'essai de l'étape 27 ne le cite ;
 * T-A2  (lot A2, 17/11/2026, le geste du 1c de la 35) l'horizon, le principal et la garde comptent les lignes que le juge
 *       GARDERA (hors des fenêtres déjà vues, dont la fenêtre « moteur » d'une autre étape lancée) ; la phrase « N au total,
 *       dont M écartés (déjà vus par une version du moteur) » ; le démenti d'un principal « moins bon » déjà au registre jamais
 *       perdu (transaction de sa nuit en échec, garde arrêtée ou non) ; les fenêtres calculées dans le processus à part ; le
 *       regard de novembre 2026 : aucune fenêtre ne finit après le lancement réel (rien de faussé). T-N6 le tient aussi dans
 *       le VRAI processus à part : le magasin fabriqué jusqu'au 23/09/2026 est déjà vu, ses lignes ne sont jamais comptées.
 * Aucune base ouverte dans le processus du test (le magasin fabriqué vit dans une copie isolée) ; aucun appel à Claude.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import * as P from '../src/data/contexte/preuveDuContexte.js';
import { CONTEXTE_AU_BANC } from '../src/data/contexte/noteDuContexte.js';
import { statutsDesFacteurs } from '../src/data/contexte/contexteRead.js';
import { GARDE_MENSUELLE } from '../src/data/contexte/reglagesContexte.js';
import { FORMES } from '../src/data/contexte/bancDuContexte.js';
import { zPour } from '../src/bench/guard.js';
import { MESURES } from '../src/bench/metrics.js';
import { enregistrerLancements, jugementsDe, fenetresVues } from '../src/bench/trialsRegistry.js';
import { LANCEMENTS } from '../src/bench/lancements.js';

const SRC = path.join(SERVEUR, 'src');
const UI = path.join(SERVEUR, '..', 'ui', 'src');
const lire = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-contexte-preuve.mjs');
const IDS = ['repos-court', 'enchainement-serre', 'deplacement-altitude'];
const LANCEMENT = '2026-08-25';
/** L'horizon d'essai : 18 jours ; 6, 6 et 5 matchs concernés (l'altitude l'atteint plus tard que les deux autres). */
const HORIZON = { jours: 18, matchs: { 'repos-court': 6, 'enchainement-serre': 6, 'deplacement-altitude': 5 } };
/**
 * Lot A2 (17/11/2026) : l'horizon compte les lignes que le juge GARDERA. Le magasin fabriqué commence le 01/08/2026 : ses matchs
 * jusqu'au 23/09/2026 sont dans les fenêtres déjà vues de l'étape 32 (DONNEES_VUES et les vues de la 32 : jusqu'au 2026-09-23),
 * écartés par le juge ; les nuits vont donc plus loin (magasin de 110 jours, nuits jusqu'au 10/11/2026) pour que chaque facteur
 * atteigne son horizon d'essai sur des lignes gardées (avant A2 : 75 jours, nuits jusqu'au 11/10, l'horizon comptait les écartées).
 */
const DERNIER_JOUR = '2026-11-10';
const JOURS_DU_MAGASIN = 110;
const FIN_DES_VUES = '2026-09-23';

const uneFois = (f) => {
  let v;
  return () => (v ??= f());
};
const nuits = uneFois(() => {
  const copie = preparerCopie({ base: false });
  try {
    const r = executer(copie, SCRIPT, { args: ['nuits', JSON.stringify({ horizon: HORIZON, lancement: LANCEMENT, dernierJour: DERNIER_JOUR, jours: JOURS_DU_MAGASIN })], timeout: 600_000 });
    assert.equal(r.code, 0, `nuits :\n${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json, r.sortie.slice(-500));
    return r.json;
  } finally {
    copie.nettoyer();
  }
});

fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
const DOSSIER = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-contexte-preuve-'));
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
/** `n` lignes { bloc, date, a, b } datées de `de` (un match par jour, en boucle sur 28 jours), b = a + ecart ± bruit. */
function lignesFabriquees({ n, de, ecart, bruit = 0.05, graine = 1, prefixe = 'm' }) {
  const u = generateur(graine);
  const out = [];
  for (let k = 0; k < n; k++) {
    const jour = new Date(Date.parse(`${de}T00:00:00Z`) + (k % 28) * 86_400_000).toISOString().slice(0, 10);
    const a = 2.5 + u();
    out.push({ bloc: `${prefixe}${k}`, date: jour, a, b: a + ecart + (u() - 0.5) * 2 * bruit });
  }
  return out;
}

// ======================================================================== T-N6

test('T-N6 les premiers chiffres ne sont JAMAIS au registre (des comptes, ni gain ni verdict) ; le principal une seule fois par facteur, à SON horizon, calculé dans le processus à part et rangé par le serveur ; jamais refait les nuits suivantes', () => {
  const s = nuits();
  assert.equal(s.lancement.le, LANCEMENT, 'le premier démarrage fabriqué date le lancement');
  assert.ok(s.nuits.length >= 12, `${s.nuits.length} nuits`);
  const atteint = (n, id) => n.etat.preuve.variantes.find((v) => v.id === id).atteint;
  const premiere = Object.fromEntries(IDS.map((id) => [id, s.nuits.findIndex((n) => atteint(n, id))]));
  for (const id of IDS) assert.ok(premiere[id] >= 2, `${id} : au moins deux nuits avant son horizon (${premiere[id]})`);
  assert.ok(premiere['deplacement-altitude'] > premiere['repos-court'], 'chaque facteur a SON horizon (l’altitude plus tard)');
  let avant = null;
  s.nuits.forEach((n, i) => {
    assert.equal(n.mode, 'complet', `${n.jourD} : ${n.erreur ?? ''}`);
    assert.deepEqual([n.preuve.rien, n.preuve.erreur], [null, null], n.jourD);
    // Le registre de l'étape 32 : des principaux seulement, de ce lancement, autant que de facteurs à leur horizon.
    assert.ok(n.registre.every((j) => j.principal === true && j.lancement === LANCEMENT && j.etape === '32'), `${n.jourD} : ${JSON.stringify(n.registre)}`);
    assert.equal(n.registre.length, IDS.filter((id) => i >= premiere[id]).length, `${n.jourD} : ${n.registre.length} jugements au registre`);
    for (const id of IDS) {
      const auRegistre = n.registre.filter((j) => j.quoi === P.quoiDuPrincipal(id));
      if (i < premiere[id]) {
        assert.equal(auRegistre.length, 0, `${n.jourD} ${id} : rien au registre avant l’horizon`);
        assert.ok(!n.preuve.principauxCalcules.includes(id), `${n.jourD} ${id} : rien calculé avant l’horizon`);
        assert.equal(n.etat.principal?.[id] ?? null, null);
      } else if (i === premiere[id]) {
        assert.ok(n.preuve.principauxCalcules.includes(id) && n.preuve.principauxRanges.includes(id), `${n.jourD} ${id} : le principal pris cette nuit-là (${JSON.stringify(n.preuve)})`);
        assert.equal(auRegistre.length, 1);
        assert.equal(n.etat.principal[id].le, new Date(n.maintenant).toISOString());
        assert.match(n.phrase, /jugement principal pris cette nuit pour/);
        // Lot A2 : le principal juge exactement les lignes que l'horizon a comptées (les gardées), ni plus ni moins.
        const v = n.etat.preuve.variantes.find((x) => x.id === id);
        assert.deepEqual([auRegistre[0].matchs, auRegistre[0].ecartees], [v.matchs, v.ecarteesDejaVues], `${n.jourD} ${id} : jugé sur le nombre compté`);
      } else {
        assert.ok(!n.preuve.principauxCalcules.includes(id), `${n.jourD} ${id} : jamais refait (${JSON.stringify(n.preuve.principauxCalcules)})`);
        assert.equal(auRegistre.length, 1, `${n.jourD} ${id} : toujours un seul principal au registre`);
        assert.equal(n.etat.principal[id].le, s.nuits[premiere[id]].etat.principal[id].le, 'le principal rangé ne change plus');
        assert.equal(auRegistre[0].le, s.nuits[premiere[id]].registre.find((j) => j.quoi === P.quoiDuPrincipal(id)).le);
      }
    }
    // Les premiers chiffres : des comptes, jamais un gain, une fourchette ni un verdict.
    assert.doesNotMatch(JSON.stringify(n.etat.preuve), /"(gain|verdict|fourchette|enPourcent|ecartType)"/, n.jourD);
    for (const v of n.etat.preuve.variantes) assert.ok(Number.isInteger(v.matchs) && Number.isInteger(v.jours) && v.attendus === HORIZON.matchs[v.id] && v.joursAttendus === HORIZON.jours);
    // L'horizon refait ici, sans le code : les jours depuis le lancement ET les matchs concernés.
    const jours = Math.round((Date.parse(`${n.jourD}T00:00:00Z`) - Date.parse(`${LANCEMENT}T00:00:00Z`)) / 86_400_000);
    for (const v of n.etat.preuve.variantes) assert.deepEqual([v.jours, v.atteint], [jours, v.matchs >= HORIZON.matchs[v.id] && jours >= HORIZON.jours], `${n.jourD} ${v.id}`);
    // Lot A2 : le VRAI processus à part écarte les lignes déjà vues (jusqu'au 23/09/2026) : rien de compté avant, et le reste dit à part.
    for (const v of n.etat.preuve.variantes) {
      assert.ok(Number.isInteger(v.ecarteesDejaVues) && v.ecarteesDejaVues >= 0, `${n.jourD} ${v.id}`);
      if (n.jourD <= '2026-09-24') assert.equal(v.matchs, 0, `${n.jourD} ${v.id} : toutes ses lignes sont déjà vues`);
    }
    if (avant) for (const v of n.etat.preuve.variantes) assert.ok(v.matchs >= avant.find((x) => x.id === v.id).matchs, 'les comptes ne reculent pas');
    avant = n.etat.preuve.variantes;
    // La garde : trop peu de matchs (200 au moins) — aucun regard compté, refaite la nuit suivante.
    assert.deepEqual([n.preuve.garde.regard, n.etat.surete.regards, n.etat.surete.dernierMois], [false, 0, null], n.jourD);
    // L'état de la preuve est écrit chaque nuit avec celui de la nuit (aucun démenti ici : un objet vide, jamais absent).
    assert.deepEqual(n.etat.dementis, {}, n.jourD);
    if (i < Math.min(...Object.values(premiere))) assert.match(n.phrase, /rien n’est jugé avant l’horizon \(des comptes seulement\)/);
  });
  assert.match(s.nuits.at(-1).phrase, /jugement principal déjà pris \(jamais refait\)/);
  // Lot A2 : des lignes écartées par le processus à part, dites dans la phrase tant que le facteur attend son horizon.
  assert.ok(s.nuits.some((n) => n.jourD > FIN_DES_VUES && n.etat.preuve.variantes.some((v) => v.ecarteesDejaVues > 0)), 'des lignes déjà vues écartées');
  assert.ok(s.nuits.some((n) => /au total, dont \d+ écartés? \(déjà vus? par une version du moteur\)/.test(n.phrase)), 'la phrase dit les écartés');
  assert.ok(s.nuits.every((n) => n.blocMaxMs < 300), `le serveur jamais tenu plus de 300 ms : ${s.nuits.map((n) => n.blocMaxMs).join(', ')}`);
});

test('T-N6b le principal pièce par pièce : rien avant l’horizon (les matchs ET les jours), jamais rejugé (état de la nuit ou registre), rangé UNE fois au registre par le serveur ; la demande de la nuit (pas encore lancée, banc faux, preuve terminée)', () => {
  const V = P.variantesDeLaPreuve();
  const [repos] = V;
  // L'horizon : les deux conditions.
  assert.equal(P.horizonDe(repos, { matchs: 16870, lancementLe: '2026-10-29', jourD: '2027-04-26' }).atteint, false, '179 jours');
  assert.equal(P.horizonDe(repos, { matchs: 16869, lancementLe: '2026-10-29', jourD: '2027-04-27' }).atteint, false, 'un match de moins');
  assert.deepEqual(P.horizonDe(repos, { matchs: 16870, lancementLe: '2026-10-29', jourD: '2027-04-27' }), { atteint: true, matchs: 16870, attendus: 16870, jours: 180, joursAttendus: 180, auPlusTotLe: '2027-04-27' });
  // Jamais rejugé : un principal pris (état de ce lancement, ou registre) n'appelle plus le juge, même à l'horizon.
  const lignes = Object.fromEntries(IDS.map((id, k) => [id, lignesFabriquees({ n: 30, de: '2026-11-01', ecart: 0, graine: k + 1 })]));
  const commun = { lignes, variantes: V, lancement: { le: '2026-10-29' }, jourD: '2027-06-01', instant: Date.parse('2027-06-01T01:00:00Z'), horizon: { jours: 1, matchs: { 'repos-court': 1, 'enchainement-serre': 1, 'deplacement-altitude': 1 } } };
  const pris = Object.fromEntries(IDS.map((id) => [id, { le: '2027-05-01T01:00:00.000Z', lancement: '2026-10-29', verdict: 'pas-prouve' }]));
  assert.deepEqual(P.calculerLaPreuve({ ...commun, etat: { principal: pris } }).principaux, {}, 'état de la nuit');
  assert.deepEqual(P.calculerLaPreuve({ ...commun, etat: null, dejaAuRegistre: IDS }).principaux, {}, 'registre');
  const autreLancement = Object.fromEntries(IDS.map((id) => [id, { ...pris[id], lancement: '2025-01-01' }]));
  assert.deepEqual(P.calculerLaPreuve({ ...commun, horizon: { jours: 999, matchs: {} }, etat: { principal: autreLancement } }).principaux, {}, 'avant l’horizon : rien, quel que soit l’état');
  // Le rangement au registre : une fois ; le même principal refusé ensuite ; un jugement qui n'est pas un principal refusé.
  const fichier = path.join(DOSSIER, 'registre-t-n6b.json');
  enregistrerLancements({ fichier, maintenant: Date.parse('2026-10-28T23:30:00Z') });
  const j = (id, extra = {}) => ({ etape: '32', principal: true, quoi: P.quoiDuPrincipal(id), lancement: '2026-10-29', verdict: 'pas-prouve', le: '2027-05-01T01:00:00.000Z', n: { matchs: 17000 }, ...extra });
  const instant = Date.parse('2027-05-01T01:00:00Z');
  const r1 = P.rangerLesPrincipaux({ principaux: { 'repos-court': j('repos-court') }, lancement: { le: '2026-10-29' }, registre: { fichier }, instant });
  assert.deepEqual([Object.keys(r1.enregistres), r1.refuses], [['repos-court'], []]);
  const r2 = P.rangerLesPrincipaux({ principaux: { 'repos-court': j('repos-court', { le: 'plus tard' }), 'enchainement-serre': j('enchainement-serre', { principal: false }), 'deplacement-altitude': j('deplacement-altitude', { lancement: '2025-01-01' }) }, lancement: { le: '2026-10-29' }, registre: { fichier }, instant });
  assert.deepEqual(Object.keys(r2.enregistres), []);
  assert.deepEqual(r2.refuses.map((x) => x.id).sort(), ['deplacement-altitude', 'enchainement-serre', 'repos-court']);
  assert.equal(jugementsDe('32', { fichier }).length, 1, 'un seul jugement au registre');
  // La demande de la nuit.
  const vide = path.join(DOSSIER, 'registre-vide.json');
  assert.match(P.demandeDeLaPreuve({ instant, registre: { fichier: vide } }).rien, /pas encore lancée/);
  assert.match(P.demandeDeLaPreuve({ instant, registre: { fichier }, note: { ...CONTEXTE_AU_BANC, bancFaux: true } }).rien, /aucun facteur retenu/);
  const d = P.demandeDeLaPreuve({ instant, registre: { fichier } });
  assert.deepEqual([d.rien, d.lancement.le, d.dejaAuRegistre], [undefined, '2026-10-29', ['repos-court']]);
  const fini = P.demandeDeLaPreuve({ instant, registre: { fichier }, etat: { principal: pris, surete: { lancement: '2026-10-29', regards: 12 } } });
  assert.match(fini.rien, /preuve terminée/);
  assert.equal(P.demandeDeLaPreuve({ instant, registre: { fichier }, etat: { principal: pris, surete: { lancement: '2026-10-29', regards: 11 } } }).rien, undefined, 'la garde continue jusqu’à 12 regards');
});

// ======================================================================== T-N7

test('T-N7 la garde du mois : z de 12 regards, une fois par mois civil, arrêtée après 12 ; « pas assez de matchs » ne compte pas ; les lignes d’avant le lancement jamais lues ; « moins bon » → démenti (lu par l’écran) et alerte durable ; un principal « moins bon » dément aussi ; un démenti n’est jamais retiré', async () => {
  const V = P.variantesDeLaPreuve();
  const lancement = { le: '2026-10-29', version: 'contexte-v1' };
  const lignes = {
    'repos-court': lignesFabriquees({ n: 300, de: '2026-11-01', ecart: 0.08, graine: 7 }),
    'enchainement-serre': lignesFabriquees({ n: 300, de: '2026-11-01', ecart: 0, graine: 8 }),
    'deplacement-altitude': []
  };
  const instant = Date.parse('2026-11-30T01:00:00Z');
  const c1 = P.calculerLaPreuve({ lignes, variantes: V, lancement, jourD: '2026-11-30', instant, etat: null });
  assert.deepEqual(c1.principaux, {}, 'loin de l’horizon : aucun principal');
  assert.deepEqual([c1.garde.faite, c1.garde.regard, c1.garde.mois], [true, true, '2026-11']);
  const r = c1.garde.resultats['repos-court'];
  assert.equal(r.verdict, 'moins-bon');
  assert.deepEqual([r.variantes, r.z], [12, zPour(0.05, 12)], 'douze regards par an');
  assert.ok(Math.abs(r.z - 2.87) < 0.01, String(r.z));
  assert.notEqual(c1.garde.resultats['enchainement-serre'].verdict, 'moins-bon');
  assert.equal(c1.garde.resultats['deplacement-altitude'].verdict, 'pas-assez-de-matchs');
  const e1 = P.etatApresLaPreuve({ etatAvant: null, calcul: c1, lancement, instant, jourD: '2026-11-30' });
  assert.deepEqual(e1.nouveauxDementis, ['repos-court']);
  assert.deepEqual({ ...e1.dementis['repos-court'], gain: null, fourchette: null, matchs: null }, { le: '2026-11-30T01:00:00.000Z', depuis: '2026-10-29', source: 'garde-du-mois', mois: '2026-11', verdict: 'moins-bon', gain: null, fourchette: null, matchs: null, z: zPour(0.05, 12), variantes: 12 });
  assert.deepEqual([e1.surete.regards, e1.surete.dernierMois, e1.surete.historique.length, e1.surete.variantes, e1.surete.regardsMax], [1, '2026-11', 1, 12, 12]);
  // L'écran : le facteur démenti dit « démenti » depuis le jour de la garde ; les autres gardent leur statut du banc.
  const statuts = statutsDesFacteurs(CONTEXTE_AU_BANC, e1.dementis);
  assert.deepEqual([statuts.repos.statut, statuts.repos.dementiLe, statuts.enchainement.statut, statuts.altitude.statut], ['dementi', '2026-11-30T01:00:00.000Z', 'effet-mesure', 'effet-mesure']);
  // L'alerte durable : les démentis en plus des écarts du contrôle ; jamais prise pour un écart anti-fuite ; sans rien : null.
  const a = P.alerteDuContexte({ ecarts: [], lignes: 20, dementis: e1.dementis, updatedAt: 'u' });
  assert.deepEqual(a, { ecarts: [], total: 0, lignes: 20, updatedAt: 'u', dementis: [{ variante: 'repos-court', le: '2026-11-30T01:00:00.000Z', depuis: '2026-10-29', source: 'garde-du-mois' }] });
  assert.equal(P.alerteDuContexte({ ecarts: [], lignes: 20, dementis: null, updatedAt: 'u' }), null);
  assert.equal(P.alerteDuContexte({ ecarts: [], lignes: 20, dementis: {}, updatedAt: 'u' }), null);
  const ec = [{ texte: 'un écart' }];
  assert.deepEqual(P.alerteDuContexte({ ecarts: ec, lignes: 20, dementis: null, updatedAt: 'u' }), { ecarts: ec, total: 1, lignes: 20, updatedAt: 'u' }, 'sans démenti : la forme d’avant, telle quelle');
  const { controlesAntiFuiteDits } = await import(pathToFileURL(path.join(UI, 'utils', 'controlesAntiFuite.js')).href);
  assert.deepEqual(controlesAntiFuiteDits({ contexteDuMatch: a }), [], 'un démenti n’est pas un écart anti-fuite');
  assert.match(P.phraseDeLaPreuve({ etat: e1.preuve, principal: {}, principauxRanges: [], dementis: e1.dementis }), /DÉMENTI sur vos matchs : repos court \(depuis le 30\/11\/2026\) — repassé en « Explication seulement »/);
  // Le même mois : pas de second regard.
  const c2 = P.calculerLaPreuve({ lignes, variantes: V, lancement, jourD: '2026-11-30', instant, etat: { surete: e1.surete, dementis: e1.dementis } });
  assert.deepEqual([c2.garde.faite, c2.garde.regard, c2.garde.raison], [false, false, 'déjà faite ce mois-ci']);
  // Le mois suivant : le facteur démenti n'est plus regardé, et son démenti reste même si ses lignes redeviennent bonnes.
  const bonnes = { ...lignes, 'repos-court': lignesFabriquees({ n: 300, de: '2026-11-01', ecart: -0.08, graine: 9 }) };
  const i3 = Date.parse('2026-12-01T01:00:00Z');
  const c3 = P.calculerLaPreuve({ lignes: bonnes, variantes: V, lancement, jourD: '2026-12-01', instant: i3, etat: { surete: e1.surete, dementis: e1.dementis } });
  assert.deepEqual([c3.garde.faite, c3.garde.regard, c3.garde.resultats['repos-court'].deja], [true, true, 'dementi']);
  const e3 = P.etatApresLaPreuve({ etatAvant: { surete: e1.surete, dementis: e1.dementis }, calcul: c3, lancement, instant: i3, jourD: '2026-12-01' });
  assert.deepEqual([e3.dementis['repos-court'].le, e3.nouveauxDementis, e3.surete.regards, e3.surete.dernierMois], ['2026-11-30T01:00:00.000Z', [], 2, '2026-12']);
  // « Pas assez de matchs » : aucun regard compté, rien ne change, la garde reste due.
  const peu = Object.fromEntries(IDS.map((id, k) => [id, lignesFabriquees({ n: 50, de: '2027-01-01', ecart: 0.5, graine: 20 + k })]));
  const i4 = Date.parse('2027-01-02T01:00:00Z');
  const c4 = P.calculerLaPreuve({ lignes: peu, variantes: V, lancement, jourD: '2027-01-02', instant: i4, etat: { surete: e3.surete, dementis: {} } });
  assert.deepEqual([c4.garde.faite, c4.garde.regard], [true, false]);
  const e4 = P.etatApresLaPreuve({ etatAvant: { surete: e3.surete, dementis: {} }, calcul: c4, lancement, instant: i4, jourD: '2027-01-02' });
  assert.deepEqual([e4.surete.regards, e4.surete.dernierMois, e4.nouveauxDementis], [2, '2026-12', []]);
  assert.match(e4.surete.essai.raison, /pas encore assez de matchs/);
  // Arrêtée après 12 regards.
  const c5 = P.calculerLaPreuve({ lignes, variantes: V, lancement, jourD: '2027-10-01', instant: Date.parse('2027-10-01T01:00:00Z'), etat: { surete: { lancement: '2026-10-29', regards: 12, dernierMois: '2027-09' } } });
  assert.deepEqual([c5.garde.faite, c5.garde.raison], [false, 'arrêtée après 12 regards']);
  // Les lignes d'AVANT le lancement (le jour même compris) ne sont jamais lues par la garde.
  const vieilles = { 'repos-court': [...lignesFabriquees({ n: 300, de: '2026-10-02', ecart: 0.3, graine: 30 }).map((l) => ({ ...l, date: l.date > '2026-10-29' ? '2026-10-29' : l.date })), ...lignesFabriquees({ n: 20, de: '2026-11-01', ecart: 0, graine: 31, prefixe: 'n' })], 'enchainement-serre': [], 'deplacement-altitude': [] };
  const c6 = P.calculerLaPreuve({ lignes: vieilles, variantes: V, lancement, jourD: '2026-11-30', instant, etat: null });
  assert.equal(c6.garde.resultats['repos-court'].verdict, 'pas-assez-de-matchs');
  assert.equal(c6.garde.resultats['repos-court'].matchs, 20);
  // Un principal « moins bon » dément le facteur (source « principal »).
  const ePr = P.etatApresLaPreuve({ etatAvant: { dementis: e1.dementis }, calcul: { parVariante: [], garde: { faite: false, regard: false, raison: 'déjà faite ce mois-ci' } }, enregistres: { 'deplacement-altitude': { verdict: 'moins-bon', gain: -0.01, fourchette: [-0.02, -0.001], n: { matchs: 1100 }, le: '2027-05-01T01:00:00.000Z', quoi: P.quoiDuPrincipal('deplacement-altitude'), lancement: '2026-10-29' } }, lancement, instant: Date.parse('2027-05-01T01:00:00Z'), jourD: '2027-05-01' });
  assert.deepEqual([ePr.dementis['deplacement-altitude'].source, ePr.nouveauxDementis, Boolean(ePr.dementis['repos-court'])], ['principal', ['deplacement-altitude'], true]);
  // Le code : l'étape pose l'alerte et dit la preuve ; la nuit écrit les démentis avec son état.
  const job = lire('jobs', 'matchStatsAutoRefresh.js');
  assert.match(job, /alert: \{ key: 'contexteDuMatch', value: alerteDuContexte\(\{ ecarts, lignes: c\.lignes \?\? 0, dementis: r\.preuve\?\.dementis \?\? null, updatedAt: new Date\(\)\.toISOString\(\) \}\) \}/);
  assert.match(job, /\$\{phraseDeLaPreuve\(r\.preuve\)\} Explication seulement/);
  assert.match(lire('data', 'contexte', 'contexteNuit.js'), /ecrireLaValeur\(database, 'dementis', etatApres\.dementis\);/);
});

// ======================================================================== T-F6

test('T-F6 la preuve écarte une fiche « après le coup d’envoi » et un avant-match relevé après le coup d’envoi ; un autre stade relevé AVANT ôte l’altitude ; une météo absurde plantée ne change rien ; les matchs d’après le lancement et d’avant la nuit seulement ; la base au jour J = celle du banc', () => {
  const s = nuits();
  const ref = s.reference;
  assert.ok(ref.matchs >= 30, `${ref.matchs} matchs`);
  for (const id of IDS) assert.ok(ref.lignes[id].length >= 5, `${id} : ${ref.lignes[id].length} lignes`);
  assert.equal(s.toutesLesDatesDansLaFenetre, true, `après le ${LANCEMENT}, avant la nuit : ${ref.dates.join(' → ')}`);
  assert.ok(s.bornes.auxBornes >= 2 && s.bornes.dansLaFenetre && s.bornes.lus === s.bornes.attendus, `bornes strictes : ${JSON.stringify(s.bornes)}`);
  assert.equal(ref.comptes.apresCoupDEnvoi, 0);
  assert.equal(ref.comptes.heuresRefaites, ref.matchs, 'les heures refaites avec le coup d’envoi prévu');
  // La base : posée partout, égale à celle du banc (la même chaîne), à l'égalité exacte.
  assert.ok(s.bases.toutesPosees && s.bases.comparees === ref.matchs, JSON.stringify(s.bases));
  assert.deepEqual(s.bases.ecarts, []);
  // L'avant-match relevé APRÈS le coup d'envoi : ignoré (compté), l'altitude reste.
  assert.ok(s.altitude.match, 'un match en altitude parmi les lignes');
  assert.deepEqual([s.altitude.apres.garde, s.altitude.apres.comptes], [true, { repris: 0, apresLeCoupDEnvoi: 1 }]);
  // Relevé AVANT, un autre stade que le stade habituel : plus d'altitude.
  assert.deepEqual([s.altitude.avant.garde, s.altitude.avant.ailleurs, s.altitude.avant.stade, s.altitude.avant.comptes], [false, true, 'Stade Tout Ailleurs', { repris: 1, apresLeCoupDEnvoi: 0 }]);
  // Une météo (et un arbitre) absurdes plantés dans l'archive : rien ne change.
  assert.deepEqual(s.altitude.meteoAbsurde, { lignesEgales: true, matchsEgaux: true });
  // Une fiche marquée « après le coup d'envoi » : écartée, comptée.
  assert.ok(s.apresCoupDEnvoi.match);
  assert.deepEqual(s.apresCoupDEnvoi.apres, { comptes: 1, dansLesMatchs: false, dansLesLignes: false });
});

// ======================================================================== T-P1

test('T-P1 la frontière de la preuve : ni horloge, ni hasard, ni écriture de la base ; le registre écrit à UN endroit, par le serveur ; les coefficients FIGÉS (pli 1 du banc) et les horizons de la note ; jamais le faux facteur ; le chemin de nuit de l’essai 27 ne le cite pas', () => {
  const code = sansCommentaires(lire('data', 'contexte', 'preuveDuContexte.js'));
  assert.doesNotMatch(code, /Date\.now\(|new Date\(\)|Math\.random|performance\.now|fetch\(|openDb|DatabaseSync|writeFileSync|writeJsonAtomic|\.run\(|\.exec\(|\b(INSERT|UPDATE|DELETE|REPLACE INTO|CREATE|DROP)\b/);
  assert.equal(code.match(/enregistrerJugement\(/g).length, 1, 'le registre écrit à un seul endroit (rangerLesPrincipaux)');
  assert.match(code, /principal: true, enregistrer: false, registre/, 'le principal calculé SANS enregistrer');
  const enfant = sansCommentaires(lire('data', 'contexte', 'contexteEnfant.js'));
  assert.deepEqual([...enfant.matchAll(/from '\.\/preuveDuContexte\.js'/g)].length, 1);
  assert.match(enfant, /import \{ preuveDansLaBase \} from '\.\/preuveDuContexte\.js';/);
  assert.doesNotMatch(enfant, /rangerLesPrincipaux|enregistrerJugement|etatApresLaPreuve/);
  const nuit = sansCommentaires(lire('data', 'contexte', 'contexteNuit.js'));
  assert.match(nuit, /import \{ demandeDeLaPreuve, rangerLesPrincipaux, etatApresLaPreuve \} from '\.\/preuveDuContexte\.js';/);
  assert.match(nuit, /const r = rangerLesPrincipaux\(\{ principaux: fin\.preuve\.principaux \?\? \{\}, lancement: demande\.lancement, registre, instant \}\);/);
  // Les coefficients figés : le pli 1 du banc (appris sur 2025-07 → 2026-09-23) et son recalage ; les horizons de la note.
  assert.equal(P.PLI_DE_LA_PREUVE, 1);
  assert.deepEqual(CONTEXTE_AU_BANC.periodes.plis[1].apprendre, { de: '2025-07-01', a: '2026-09-23' });
  const V = P.variantesDeLaPreuve();
  assert.deepEqual(V.map((v) => v.id), CONTEXTE_AU_BANC.utiles);
  assert.deepEqual(V.map((v) => v.id), IDS);
  for (const v of V) {
    const n = CONTEXTE_AU_BANC.variantes.find((x) => x.id === v.id);
    const c = n.coefficients.find((x) => x.pli === 1);
    assert.deepEqual(v.vecteur, FORMES[v.id].coefficients.map((k) => c[k]), v.id);
    assert.deepEqual(v.recalage, { cDom: CONTEXTE_AU_BANC.base.recalages[1].cDom, cExt: CONTEXTE_AU_BANC.base.recalages[1].cExt });
    assert.deepEqual(v.horizon, { matchs: n.matchsConcernes, jours: 180 });
  }
  assert.deepEqual(V.map((v) => v.horizon.matchs), [16870, 15868, 1085]);
  assert.ok(!V.some((v) => v.id === 'placebo'));
  assert.deepEqual(P.variantesDeLaPreuve({ ...CONTEXTE_AU_BANC, bancFaux: true }), [], 'un banc faux : rien à prouver');
  assert.deepEqual(P.variantesDeLaPreuve(null), []);
  assert.deepEqual([GARDE_MENSUELLE.variantes, GARDE_MENSUELLE.regardsMax], [12, 12]);
  assert.deepEqual([P.ETAPE_DE_LA_PREUVE, P.MESURE_DE_LA_PREUVE, P.HORIZON_DE_LA_PREUVE.minJours], ['32', 'perte-log', 180]);
  assert.equal(MESURES['perte-log'].sens, 'min');
  assert.equal(new Set(IDS.map(P.quoiDuPrincipal)).size, 3, 'un principal par facteur');
  // Rien du chemin de nuit de l'essai de l'étape 27, ni de l'empreinte du moteur, ne cite la preuve.
  for (const f of ['data/enregistreurs/gelPronostics.js', 'data/enregistreurs/depot.js', 'data/enregistreurs/moteurABlanc.js', 'bench/essaiCandidate.js', 'core/engine/engineVersions.js', 'core/engine/engineConfig.js']) {
    assert.doesNotMatch(lire(...f.split('/')), /preuveDuContexte|contexteNuit|contexteEnfant/, f);
  }
});

// ======================================================================== T-A2 (lot A2, 17/11/2026)

/**
 * Un registre d'ESSAI (jamais le vrai) où l'étape 32 est lancée le 29/10/2026 ; avec `vue`, il connaît aussi, par `lancements`,
 * le lancement d'une AUTRE étape dont une version du moteur a vu `vue` (portée « moteur ») : le juge de la 32 en écarte les lignes.
 */
function registreDEssai(nom, vue = null) {
  const fichier = path.join(DOSSIER, nom);
  enregistrerLancements({ fichier, maintenant: Date.parse('2026-10-28T23:30:00Z') });
  if (!vue) return { fichier };
  const autre = { etape: '40', version: 'essai-moteur-apres-le-lancement', quoi: 'Essai : une version du moteur apprise sur des matchs d’après le lancement de la 32', le: '2026-11-20', variantes: [], vues: [{ de: vue.de, a: vue.a, quoi: 'Essai : fenêtre vue par le moteur', pour: ['moteur'] }] };
  return { fichier, lancements: [...LANCEMENTS, autre] };
}
const VUE_2027 = Object.freeze({ de: '2027-01-01', a: '2027-12-31' });
/** `n` lignes datées en 2027 (dans la fenêtre vue), un match par jour sur l'année. */
const dans2027 = ({ n, ecart, graine, prefixe = 'v' }) => lignesFabriquees({ n, de: '2027-01-01', ecart, graine, prefixe }).map((l, i) => ({ ...l, date: new Date(Date.parse('2027-01-01T00:00:00Z') + (i % 365) * 86_400_000).toISOString().slice(0, 10) }));

test('T-A2 l’horizon, le principal et la garde comptent les lignes que le juge GARDERA (hors des fenêtres déjà vues, dont celle « moteur » d’une autre étape lancée) ; la phrase dit les écartés ; le démenti d’un principal « moins bon » jamais perdu (transaction ratée, garde arrêtée) ; la nuit calcule les fenêtres dans le processus à part', () => {
  const V = P.variantesDeLaPreuve();
  const lancement = { le: '2026-10-29', version: 'contexte-v1' };
  const reg = registreDEssai('registre-t-a2-vues.json', VUE_2027);
  const fenetres = fenetresVues('32', { ...reg, maintenant: Date.parse('2028-01-15T01:00:00Z') });
  assert.ok(fenetres.some((f) => f.de === VUE_2027.de && f.a === VUE_2027.a), 'la fenêtre « moteur » d’une autre étape lancée est écartée par le juge de la 32');
  assert.ok(fenetres.every((f) => f.a < '2026-10-29' || (f.de === VUE_2027.de && f.a === VUE_2027.a)), 'aucune autre fenêtre ne touche les lignes fabriquées');
  // 1. L'horizon : 250 lignes gardées (novembre 2026) et 250 déjà vues (2027) ; horizon d'essai de 300 → PAS atteint, aucun principal.
  const horizon = { jours: 1, matchs: { 'repos-court': 300, 'enchainement-serre': 300, 'deplacement-altitude': 300 } };
  const hors = (n) => lignesFabriquees({ n, de: '2026-11-01', ecart: 0, graine: 41, prefixe: 'h' });
  const commun = { variantes: V, lancement, jourD: '2028-01-15', instant: Date.parse('2028-01-15T01:00:00Z'), registre: reg, horizon, etat: { surete: { lancement: lancement.le, regards: 12 } } };
  const avecVues = (L) => ({ 'repos-court': L, 'enchainement-serre': [], 'deplacement-altitude': [] });
  const c1 = P.calculerLaPreuve({ ...commun, lignes: avecVues([...hors(250), ...dans2027({ n: 250, ecart: 0, graine: 42 })]), fenetres });
  assert.deepEqual(c1.parVariante.map((x) => [x.id, x.matchs, x.ecarteesDejaVues, x.atteint]), [['repos-court', 250, 250, false], ['enchainement-serre', 0, 0, false], ['deplacement-altitude', 0, 0, false]], '250 lignes jugeables sur 500');
  assert.deepEqual(c1.principaux, {}, 'l’horizon n’est pas atteint : aucun principal');
  // Témoin (la faille d'avant A2) : sans les fenêtres, les 500 comptées, l'horizon « atteint ».
  assert.deepEqual(P.calculerLaPreuve({ ...commun, lignes: avecVues([...hors(250), ...dans2027({ n: 250, ecart: 0, graine: 42 })]) }).parVariante[0].matchs, 500);
  // 2. Le principal : 350 gardées et les mêmes 250 → atteint ; jugé sur les 350 exactement (le juge écarte les 250 lui aussi).
  const c2 = P.calculerLaPreuve({ ...commun, lignes: avecVues([...hors(350), ...dans2027({ n: 250, ecart: 0, graine: 42 })]), fenetres });
  assert.deepEqual(c2.parVariante.map((x) => [x.matchs, x.ecarteesDejaVues, x.atteint]).slice(0, 1), [[350, 250, true]]);
  assert.deepEqual([c2.principaux['repos-court']?.n?.matchs, c2.principaux['repos-court']?.ecartees?.donneesVues], [350, 250], 'le principal juge les lignes que l’horizon a comptées, ni plus ni moins');
  // 3. La garde du mois : 260 gardées, neutres ; 300 déjà vues, très mauvaises pour b → la garde ne les lit pas (pas de démenti).
  const garde = { variantes: V, lancement, jourD: '2028-02-02', instant: Date.parse('2028-02-02T01:00:00Z'), registre: reg };
  const neutres = lignesFabriquees({ n: 260, de: '2026-11-01', ecart: 0, graine: 43, prefixe: 'g' });
  const tout = avecVues([...neutres, ...dans2027({ n: 300, ecart: 0.3, graine: 44, prefixe: 'w' })]);
  const g1 = P.calculerLaPreuve({ ...garde, lignes: tout, fenetres }).garde;
  assert.deepEqual(g1, P.calculerLaPreuve({ ...garde, lignes: avecVues(neutres) }).garde, 'la garde juge les 260 gardées, comme si les vues n’existaient pas');
  assert.equal(g1.resultats['repos-court'].matchs, 260);
  assert.notEqual(g1.resultats['repos-court'].verdict, 'moins-bon');
  const temoin = P.calculerLaPreuve({ ...garde, lignes: tout }).garde.resultats['repos-court'];
  assert.deepEqual([temoin.matchs, temoin.verdict], [560, 'moins-bon'], 'témoin : sans les fenêtres, les 560 et un faux démenti');
  // 4. La phrase : « N au total, dont M écartés (déjà vus par une version du moteur) » ; sans écarté, la phrase d'avant.
  const e1 = P.etatApresLaPreuve({ calcul: c1, lancement, instant: commun.instant, jourD: commun.jourD });
  const phrase = P.phraseDeLaPreuve({ etat: e1.preuve, principal: {}, principauxRanges: [], dementis: {} });
  assert.match(phrase, /repos court 250 matchs concernés sur 300 — 500 au total, dont 250 écartés \(déjà vus par une version du moteur\), enchaînement serré 0 match concerné sur 300, /);
  const un = P.phraseDeLaPreuve({ etat: { ...e1.preuve, variantes: e1.preuve.variantes.map((v, i) => ({ ...v, ecarteesDejaVues: i === 0 ? 1 : 0 })) }, dementis: {} });
  assert.match(un, /251 au total, dont 1 écarté \(déjà vu par une version du moteur\)/);
  const sans = P.phraseDeLaPreuve({ etat: { ...e1.preuve, variantes: e1.preuve.variantes.map((v) => ({ ...v, ecarteesDejaVues: 0 })) }, dementis: {} });
  assert.doesNotMatch(sans, /écarté|au total/);
  assert.match(sans, /^Preuve sur vos matchs : repos court 250 matchs concernés sur 300, enchaînement serré 0 match concerné sur 300, altitude 0 match concerné sur 300, /);
  // 5. Le démenti d'un principal « moins bon » jamais perdu : rangé au registre la nuit N, puis la transaction de l'état de cette
  // nuit-là en échec (l'état n'a ni le principal ni le démenti). Les deux autres facteurs ont leur principal (état) et la garde
  // est ARRÊTÉE (12 regards) : avant A2, la demande répondait « preuve terminée » et le démenti était perdu.
  const reg5 = registreDEssai('registre-t-a2-dementi.json');
  const pire = avecVues(lignesFabriquees({ n: 300, de: '2026-11-01', ecart: 0.6, graine: 45 }));
  const nuitN = Date.parse('2027-05-10T01:00:00Z');
  const surete12 = { lancement: lancement.le, regards: 12, dernierMois: '2027-04', historique: [] };
  const autres = { 'enchainement-serre': { le: '2027-05-01T01:00:00.000Z', lancement: lancement.le, verdict: 'pas-prouve' }, 'deplacement-altitude': { le: '2027-05-01T01:00:00.000Z', lancement: lancement.le, verdict: 'pas-prouve' } };
  const horizon5 = { jours: 1, matchs: { 'repos-court': 300 } };
  const cN = P.calculerLaPreuve({ lignes: pire, variantes: V, lancement, jourD: '2027-05-10', instant: nuitN, registre: reg5, etat: { principal: autres, surete: surete12 }, horizon: horizon5 });
  assert.equal(cN.principaux['repos-court']?.verdict, 'moins-bon');
  assert.deepEqual(Object.keys(P.rangerLesPrincipaux({ principaux: cN.principaux, lancement, registre: reg5, instant: nuitN }).enregistres), ['repos-court']);
  const nuitN1 = Date.parse('2027-05-11T01:00:00Z');
  const dA = P.demandeDeLaPreuve({ instant: nuitN1, registre: reg5, etat: { principal: autres, surete: surete12, dementis: null } });
  assert.equal(dA.rien, undefined, 'le démenti manque : la nuit doit encore le ranger (jamais « preuve terminée »)');
  assert.deepEqual(dA.dejaAuRegistre, ['repos-court']);
  const cA = P.calculerLaPreuve({ lignes: pire, variantes: V, lancement: dA.lancement, jourD: '2027-05-11', instant: nuitN1, registre: reg5, etat: dA.etat, dejaAuRegistre: dA.dejaAuRegistre, horizon: horizon5 });
  assert.deepEqual([cA.principaux, cA.garde.faite, cA.garde.raison], [{}, false, 'arrêtée après 12 regards'], 'jamais rejugé ; la garde arrêtée');
  const eA = P.etatApresLaPreuve({ etatAvant: dA.etat, calcul: cA, enregistres: {}, dejaAuRegistre: dA.jugementsDejaAuRegistre, lancement: dA.lancement, instant: nuitN1, jourD: '2027-05-11' });
  assert.deepEqual(eA.nouveauxDementis, ['repos-court'], 'le démenti d’un principal déjà au registre n’est pas perdu');
  assert.deepEqual([eA.dementis['repos-court'].source, eA.dementis['repos-court'].le, eA.dementis['repos-court'].depuis, eA.principal['repos-court'].verdict], ['principal', new Date(nuitN).toISOString(), lancement.le, 'moins-bon']);
  assert.deepEqual(P.alerteDuContexte({ ecarts: [], lignes: 20, dementis: eA.dementis, updatedAt: 'u' }).dementis, [{ variante: 'repos-court', le: new Date(nuitN).toISOString(), depuis: lancement.le, source: 'principal' }], 'l’alerte durable');
  assert.equal(statutsDesFacteurs(CONTEXTE_AU_BANC, eA.dementis).repos.statut, 'dementi', 'l’écran : démenti');
  assert.match(P.phraseDeLaPreuve({ etat: eA.preuve, principal: eA.principal, principauxRanges: [], dementis: eA.dementis }), /DÉMENTI sur vos matchs : repos court \(depuis le 10\/05\/2027\)/);
  // Une fois le démenti rangé : « preuve terminée » ; la nuit d'après, rien de neuf.
  assert.match(P.demandeDeLaPreuve({ instant: nuitN1 + 86_400_000, registre: reg5, etat: { principal: eA.principal, surete: eA.surete, dementis: eA.dementis } }).rien ?? '', /preuve terminée/);
  const eB = P.etatApresLaPreuve({ etatAvant: { principal: eA.principal, surete: eA.surete, dementis: eA.dementis }, calcul: cA, enregistres: {}, dejaAuRegistre: dA.jugementsDejaAuRegistre, lancement, instant: nuitN1 + 86_400_000, jourD: '2027-05-12' });
  assert.deepEqual([eB.nouveauxDementis, eB.dementis], [[], eA.dementis], 'un démenti n’est jamais retiré ni refait');
  // La garde pas arrêtée (3 regards, déjà faite ce mois-ci) : la transaction ratée ne perd pas non plus le démenti.
  const surete3 = { lancement: lancement.le, regards: 3, dernierMois: '2027-05', historique: [] };
  const dB = P.demandeDeLaPreuve({ instant: nuitN1, registre: reg5, etat: { principal: null, surete: surete3, dementis: null } });
  const cB = P.calculerLaPreuve({ lignes: pire, variantes: V, lancement: dB.lancement, jourD: '2027-05-11', instant: nuitN1, registre: reg5, etat: dB.etat, dejaAuRegistre: dB.dejaAuRegistre, horizon: horizon5 });
  assert.deepEqual([cB.principaux, cB.garde.raison], [{}, 'déjà faite ce mois-ci']);
  assert.deepEqual(P.etatApresLaPreuve({ etatAvant: dB.etat, calcul: cB, dejaAuRegistre: dB.jugementsDejaAuRegistre, lancement: dB.lancement, instant: nuitN1, jourD: '2027-05-11' }).nouveauxDementis, ['repos-court']);
  // 6. La nuit calcule les fenêtres DANS le processus à part, avec le registre qu'elle reçoit (preuveDansLaBase) : un registre
  // illisible lève (la nuit le dit « en échec », rien de jugé ni de rangé) ; lisible, la preuve se calcule.
  const vide = { prepare: () => ({ iterate: () => [][Symbol.iterator]() }) };
  const casse = path.join(DOSSIER, 'registre-t-a2-casse.json');
  fs.writeFileSync(casse, '{ pas du json');
  assert.throws(() => P.preuveDansLaBase({ database: vide, instant: nuitN1, jourD: '2027-05-11', lancement, registre: { fichier: casse } }), /registre de la mesure .* est illisible/i);
  const lu = P.preuveDansLaBase({ database: vide, instant: nuitN1, jourD: '2027-05-11', lancement, registre: reg });
  assert.deepEqual(lu.parVariante.map((x) => [x.matchs, x.ecarteesDejaVues]), [[0, 0], [0, 0], [0, 0]]);
  const code = sansCommentaires(lire('data', 'contexte', 'preuveDuContexte.js'));
  assert.match(code, /const fenetres = fenetresVues\(ETAPE_DE_LA_PREUVE, \{ \.\.\.registre, maintenant: instant \}\);/);
  assert.match(code, /calculerLaPreuve\(\{ lignes, variantes, lancement, jourD, instant, etat, dejaAuRegistre, registre, horizon, fenetres \}\)/);
  assert.equal(code.match(/fenetresVues\(/g).length, 1, 'un seul calcul des fenêtres, dans le processus à part');
  // Le regard de novembre 2026 (lancement réel le 29/10/2026) : aucune fenêtre déjà vue de l'étape 32 ne finit après le jour du
  // lancement (le code : DONNEES_VUES et les vues des lancements, jamais lues du registre) — gardées = après, rien n'a été faussé.
  const reelles = fenetresVues('32', { fichier: path.join(DOSSIER, 'registre-absent.json'), maintenant: Date.parse('2026-11-17T00:00:00Z') });
  assert.ok(reelles.length > 0 && reelles.every((f) => f.a < '2026-10-29'), JSON.stringify(reelles.map((f) => [f.de, f.a])));
});
