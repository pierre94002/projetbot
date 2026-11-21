/**
 * Étape 46 du plan (« Prédiction en direct »), lot 1, partie C — LE BANC DU DIRECT : le rejeu (rejeuDuDirect.js), le juge,
 * la garde de calibration, la table du verdict (bancDuDirect.js), les deux colonnes de O10 (declarationDuDirect.js) et le
 * script (scripts/etape46.mjs : --fixer-colonne, --sceller, --exporter, --comptes, --banc, --preuve, --recopier,
 * --note-nulle), dans des COPIES ISOLÉES rangées dans un FAUX bac (aides/bacSimule.mjs : réseau coupé, heure figée au
 * 05/10/2026 14 h de Paris), sur des bases et des exports FABRIQUÉS ici (aides/bancFabrique.mjs : aucun vrai match, aucune
 * issue réelle, aucun nom). Le script est COPIÉ dans chaque copie : il n'écrit que les fichiers de la copie (colonne, sceau,
 * registre, note, fixtures), jamais ceux du bac. Les DEUX colonnes (« adoptee », « non-adoptee ») sont essayées.
 *   node --test test/directBanc.test.mjs        (depuis server/)
 *
 * Les réglages d'ESSAI des passages (copie d'essai seulement, refusés ailleurs) : sûreté dès 6 matchs, T = 14, créneaux
 * 0, 45, 46 et 91, 100 tirages ; le sceau, lui, est toujours posé sans eux.
 *
 *   T-B1  du déroulé aux états (buts et rouges des créneaux STRICTEMENT antérieurs ; 45 + 2 compté avant la pause ; camp) ;
 *         l'issue = le score de la 90e (un prolongé y est jugé) ; les trois matchs de R20 point 4 (9-0, 4-4 à deux rouges
 *         de chaque côté, 12-1) : toutes les variantes des deux colonnes, finies, dans [0 ; 1], de somme 1 ;
 *   T-B2  les lignes du juge : une par (match, créneau, marché), `bloc` = le match, `a` = la perte de la variante A ; les
 *         lignes de buts décidées par le score n'y sont pas ;
 *   T-B3  anti-fuite par oracle tronqué : changer ce qui arrive au créneau k ou après ne change aucune lecture du créneau k ;
 *         étendu (R36 point 5) : changer `hg90` et `ag90` seuls ne change aucune lecture ;
 *   T-B4  des matchs TIRÉS par simulerMatch (graine fixe, n et créneaux écrits, moins de 20 s) : direct-v1 bat temps-restant
 *         et direct-rouges-ignores ; tirés sans effets, direct-v1 ne sort pas « retenu » face à direct-sans-effets ;
 *   T-B5  les refus du script, un par un ; T-B6 --comptes ne lit jamais `resultat` ; T-B7 le verrou AVANT la première
 *         issue (trace) ; T-B8 la table du temps additionnel (déplacée dans bancDuDirect.js) et son contrôle sur P5 ;
 *   T-B9  --recopier refait noteDuDirect.js À L'OCTET depuis la fixture gardée ; --note-nulle ; le fichier du code ;
 *   T-B10 par colonne : le registre posé (K variantes, uniques, la retenue en tête ; vues de portée « direct » seulement),
 *         le z de K et de K × 8 refaits par zPour, le juge au z de K ;
 *   R13   la garde de calibration (128 paires comptées ; écartée au-delà de 4 points ET 3 écarts-types ; à surveiller au
 *         regard de preuve seulement ; paire de moins de 50 matchs non jugée) ;
 *   R14   J2s par famille dans les deux colonnes ; la famille non montrée ; les comptes de λ + μ ;
 *   R15   les deux regards (sûreté, puis preuve avec son avenant, son second export, l'identité des LIGNES, les écarts
 *         comptés sans refus, un verrou propre), et le chemin « faits seuls » (--preuve --sans-surete) ;
 *   R17   la table du verdict pour les deux regards, ses phrases ; J4c lu d'abord, le principal relu après le repli ;
 *   R19   l'export : la ligne de ligneDeService avec l'heure RÉELLE, le prolongé au score de la 90e, sans meta.kickoff la
 *         borne de minuit de Paris (deux essais : gardées et exclues) ;
 *   R20   l'étalonnage, étage 1 (--comptes, aucune issue) et étage 2 (sous verrou : arrêt, rien jugé, aucune note) ;
 *   R21   F1 sur tous les états, le pire nommé ; le filet de R22 point 2 ; les coupes du banc ;
 *   O9    la note recopiée ne s'applique qu'aux lignes de SA grille et de SA version (lectureDuDirect) ;
 *   O12   la note nulle (fichier présent à null) rend EXACTEMENT les réponses d'aujourd'hui ; et (mineur du 13/11 soir) une
 *         copie dont noteDuDirect.js est RETIRÉ rend les mêmes réponses des trois routes (script-note-absente.mjs) ;
 *   R36   la passe de Pierre relue toutes les 50 rencontres (point 2) ; refus « colonne non fixée », « grilles mêlées »,
 *         « principal de la 28 pas rendu » ;
 *   LES CORRECTIFS DU BANC (13/11, vérification du banc, constats C1 à C12) : C1 les candidates de l'empreinte adoptée
 *         à la forme réelle (sans version) — export mêlé jugé, note « service » v6 appliquée à elles seules, candidates
 *         seules refusées avant le verrou, autre empreinte jamais comptée ; C2 le sceau couvre la fermeture des imports
 *         (28 modules, 24 depuis K3) ; C3 une ligne « service » sans version exclue et nommée ; C4 un seul verrou par regard hors d'une
 *         copie d'essai, un autre export refusé sans --autre-export, le regard de preuve seul après une sûreté dit ; C5
 *         ESSAI seulement dans la copie ; C7 la phrase du verdict ; C9 la note de preuve protégée ; C10 --de avant le
 *         24/09, une ligne d'après la dernière nuit ; C11 un match hors de F1 retiré et nommé (au-delà de 1 % ou de 20 :
 *         rien jugé) ; C12 la tolérance nommée de l'identité des lignes (5 matchs et 0,5 % au plus) ;
 *   LES CORRECTIFS DU REBANC (13/11 après-midi, constats 4, 5, 8 et 9) : C5 + R4 CM_TEST_DOSSIER = un PARENT de la copie
 *         n'ouvre pas les réglages d'essai ; C4 + R5 le verrou fixe à la racine du bac, pas dans le dossier du code ; C2 + R8
 *         les chemins du PROJET § 13 en toutes lettres (24 depuis K3) ; C12 + R9 chaque champ de la signature rompt l'identité seul, et
 *         R15 une ligne réécrite dont seul `fair` change ;
 *   LES CORRECTIFS DU CALCUL (13/11 fin d'après-midi, décision K3) : C2 les 24 chemins (état, mémoire, libellé et entrées du
 *         direct descellés : ni scellés, ni dans la fermeture des modules qui calculent) ;
 *   LES DERNIERS POINTS (13/11 soir) : K11 le script scellé ne charge libelleDuDirect.js que dans --libelles (dans une copie
 *         où il lève une erreur à l'import, les autres modes passent et --libelles refuse clairement ; aucun des quatre
 *         descellés dans la fermeture statique de ses imports) ; K12 la concordance du choix de la ligne d'avant-match :
 *         ligneDuBanc (par --exporter) et ligneDeService donnent la même ligne sur un jeu qui couvre les cas, choix écrits ;
 *   et chaque copie est remise « avant le scellement » (aides/bancFabrique.mjs, copieAvantLeSceau : colonne et SCELLEMENT à
 *   null, la 46 retirée du registre, ni note ni fixture) : ces essais passent avant ET après la manœuvre de dimanche, quand
 *   le code porte la colonne, le sceau, la 46 et la note (dernier essai : une copie scellée remise ne garde rien du sceau).
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { SERVEUR, preparerCopie, executer } from './aides/isolement.mjs';
import { preparerCopieDeBac, executerDansLeBac } from './aides/bacSimule.mjs';
import * as BF from './aides/bancFabrique.mjs';
import { sansLesAjoutsDe46 } from './aides/ajouts46.mjs';
import * as F from './aides/directFabrique.mjs';
import * as B from '../src/data/direct/bancDuDirect.js';
import * as D from '../src/data/direct/declarationDuDirect.js';
import * as R from '../src/data/direct/rejeuDuDirect.js';
import * as L from '../src/data/direct/lectureDuDirect.js';
import { ligneDeService } from '../src/data/direct/entreesDuDirect.js';
import { RESTE_ADDITIONNEL, COUPES } from '../src/data/direct/reglagesDirect.js';
import { PARAMS } from '../src/data/simulation/reglages.js';
import { PARAMS_SANS_EFFETS } from '../src/data/simulation/simulationMatchsEnfant.js';
import { graineDuMatch } from '../src/data/simulation/simulationMatch.js';
import { comparer, zPour } from '../src/bench/guard.js';
import { perteLog, perteLogBinaire } from '../src/bench/metrics.js';

const APO = String.fromCharCode(0x2019);
const sha1 = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const espaces = (t) => String(t).replace(/\s/g, ' ');
const ESSAI = Object.freeze({ CM_ESSAI_SURETE: '6', CM_ESSAI_T: '14', CM_ESSAI_CRENEAUX: '0,45,46,91', CM_ESSAI_TIRAGES: '100' });
const DATE_DU_REGISTRE = '2026-10-03';
const CRENEAUX_ESSAI = Object.freeze([0, 45, 46, 91]);
/** La version du moteur des lignes « service » de chaque colonne ; les candidates n'en ont JAMAIS (forme réelle : NULL, C1). */
const VERSION_DE = Object.freeze({ adoptee: 6, 'non-adoptee': 5 });
const EMPREINTE = 'f01dd8496f56a415';

// ------------------------------------------------------------ le script dans une copie

const copies = [];
after(() => {
  for (const c of copies) c.nettoyer();
});
function nouvelleCopie() {
  // Remise « avant le scellement » (colonne, SCELLEMENT, 46 du registre, note) : ces essais passent avant et après la manœuvre.
  const copie = BF.copieAvantLeSceau(preparerCopieDeBac({ base: false }));
  copies.push(copie);
  const dossier = path.join(copie.serveur, 'scripts');
  fs.mkdirSync(dossier, { recursive: true });
  const script = path.join(dossier, 'etape46.mjs');
  fs.copyFileSync(path.join(SERVEUR, 'scripts', 'etape46.mjs'), script);
  return { copie, script };
}
const lancer = (c, args, { env = {}, maintenant } = {}) => {
  const r = executerDansLeBac(c.copie, c.script, { args, env, timeout: 300_000, ...(maintenant ? { maintenant } : {}) });
  assert.equal(r.reseau, false, 'aucun appel réseau');
  return r;
};
const reussit = (r, qui) => {
  assert.equal(r.code, 0, `${qui} : code ${r.code} — ${r.erreurs.slice(-2000)}`);
  assert.ok(r.json && r.json.ok === true, `${qui} : une ligne JSON ok (${r.sortie.slice(-300)})`);
  return r.json;
};
const refuse = (r, motif, qui) => {
  assert.equal(r.code, 2, `${qui} : code ${r.code} — ${r.erreurs.slice(-1200)}`);
  assert.ok(r.json && typeof r.json.refus === 'string', `${qui} : une ligne JSON de refus (${r.sortie.slice(-300)})`);
  assert.match(r.json.refus, motif, `${qui} : ${r.json.refus}`);
};
const inventaire = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).map(String).sort() : []);
const lireJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const importer = async (f) => import(`${pathToFileURL(f).href}?t=${Date.now()}-${Math.random()}`);

/** Les rencontres de bord de R19 (toutes avant le 30/09 : dans les deux exports), dans le format de rencontresFabriquees. */
function rencontresDeBord(grille, v) {
  const l = (o) => ({ role: 'service', grille, engineVersion: v, candidateHash: null, kickoffConnu: 1, lambda: 1.4, mu: 1.1, rho: -0.06, fair: { home: 0.45, draw: 0.28, away: 0.27 }, apres: 0, ...o });
  const sub = { type: 'substitution', minute: 60, addedTime: 0, side: 'home' };
  const but = (minute, side, addedTime = 0) => ({ type: 'goal', minute, addedTime, side });
  const r = (id, date, kickoff, o) => ({ id, home: 3000 + 2 * id, away: 3001 + 2 * id, matchKey: `banc-${id}`, date, kickoff, meta: { kickoff }, ...o });
  return [
    // P : prolongé (2-1 à la 120e, 1-1 à la 90e) → exporté au score de la 90e.
    r(100, '2026-09-25', '2026-09-25T18:00:00.000Z', { hg: 2, ag: 1, meta: { kickoff: '2026-09-25T18:00:00.000Z', reason: 'afterextra' }, evenements: [but(30, 'home'), sub, but(70, 'away'), but(105, 'home')], lignes: [l({ calculeLe: '2026-09-25T06:00:00.000Z', kickoff: '2026-09-25T18:00:00.000Z' })] }),
    // A : AVANCÉ (coup d'envoi réel 12 h, noté 18 h la nuit) ; sa seule ligne, calculée à 14 h, est d'après le coup d'envoi.
    r(101, '2026-09-26', '2026-09-26T12:00:00.000Z', { hg: 1, ag: 0, evenements: [but(20, 'home'), sub], lignes: [l({ calculeLe: '2026-09-26T14:00:00.000Z', kickoff: '2026-09-26T18:00:00.000Z' })] }),
    // B : deux lignes (3 h et 14 h), coup d'envoi réel 12 h → celle de 3 h, celle de ligneDeService avec l'heure réelle.
    r(102, '2026-09-26', '2026-09-26T12:00:00.000Z', { hg: 0, ag: 2, evenements: [but(10, 'away'), sub, but(80, 'away')], lignes: [l({ calculeLe: '2026-09-26T03:00:00.000Z', kickoff: '2026-09-26T18:00:00.000Z', lambda: 1.2 }), l({ calculeLe: '2026-09-26T14:00:00.000Z', kickoff: '2026-09-26T18:00:00.000Z', lambda: 1.9 })] }),
    // G : graine fausse → exclue, nommée.
    r(103, '2026-09-27', '2026-09-27T15:00:00.000Z', { hg: 0, ag: 0, evenements: [sub], lignes: [l({ calculeLe: '2026-09-27T03:00:00.000Z', kickoff: '2026-09-27T15:00:00.000Z', graine: 12345 })] }),
    // M1 : sans meta.kickoff, ligne d'après minuit de Paris du jour du magasin (01 h UTC = 3 h de Paris) → exclue.
    r(104, '2026-09-28', '2026-09-28T15:00:00.000Z', { hg: 1, ag: 1, meta: null, evenements: [but(5, 'home'), sub, but(50, 'away')], lignes: [l({ calculeLe: '2026-09-28T01:00:00.000Z', kickoff: '2026-09-28T15:00:00.000Z' })] }),
    // M2 : sans meta.kickoff, ligne d'avant minuit de Paris → gardée ; un rouge noté « not_on_pitch » compté (R36 point 7).
    r(105, '2026-09-28', '2026-09-28T15:00:00.000Z', { hg: 2, ag: 0, meta: null, evenements: [but(5, 'home'), but(50, 'home'), sub, { type: 'card', card: 'red', minute: 70, addedTime: 0, side: 'away', notOnPitch: true }], lignes: [l({ calculeLe: '2026-09-27T20:00:00.000Z', kickoff: '2026-09-28T15:00:00.000Z' })] }),
    // X : sa seule ligne marquée « après le coup d'envoi » par la nuit → exclue.
    r(106, '2026-09-29', '2026-09-29T15:00:00.000Z', { hg: 0, ag: 1, evenements: [but(30, 'away'), sub], lignes: [l({ calculeLe: '2026-09-29T03:00:00.000Z', kickoff: '2026-09-29T15:00:00.000Z', apres: 1 })] }),
    // S : sans remplacement → exclue ; I : chronologie incomplète (2 buts au score, 1 au déroulé) → exclue.
    r(107, '2026-09-29', '2026-09-29T15:00:00.000Z', { hg: 1, ag: 0, evenements: [but(30, 'home')], lignes: [l({ calculeLe: '2026-09-29T03:00:00.000Z', kickoff: '2026-09-29T15:00:00.000Z' })] }),
    r(108, '2026-09-30', '2026-09-30T15:00:00.000Z', { hg: 2, ag: 0, evenements: [but(30, 'home'), sub], lignes: [l({ calculeLe: '2026-09-30T03:00:00.000Z', kickoff: '2026-09-30T15:00:00.000Z' })] })
  ];
}
/**
 * Les rencontres d'une colonne : 12 ordinaires (24/09 → 03/10), celles de bord ; « adoptee » : une candidate seule et une d'une
 * autre empreinte, à la forme RÉELLE (correctif C1 du 13/11) : une candidate est rangée SANS version du moteur (NULL).
 */
function rencontresDe(colonne) {
  const d = D.declarationDe(colonne);
  const v = VERSION_DE[colonne];
  const liste = [...BF.rencontresFabriquees(12, { grille: d.modele.grille, engineVersion: v }), ...rencontresDeBord(d.modele.grille, v)];
  if (colonne === 'adoptee') {
    const [cand, autre] = BF.rencontresFabriquees(2, { grille: d.modele.grille, engineVersion: null, role: 'candidate', premier: 109, graine: 5 });
    cand.lignes[0].candidateHash = EMPREINTE;
    autre.lignes[0].candidateHash = 'ffffffffffffffff';
    liste.push(cand, autre);
  }
  return liste;
}

/** Les options communes des deux regards. */
const communs = (ch, e, c) => ['--k', String(ch.d.K), '--regles', ch.p.regles, '--libelles-json', ch.p.libelles, '--export', e.sortie, '--sha1-export', e.sha1, '--comptes-json', c.sortie, '--passe', ch.p.passe];

/**
 * LA CHAÎNE d'une colonne, faite une fois (partagée par les essais qui la lisent) : colonne fixée, 46 posée au registre de
 * la COPIE, sceau, base fabriquée, deux exports (au 30/09 et au 03/10), leurs comptes, le regard de sûreté sur le premier,
 * l'avenant, le regard de preuve sur le second, la recopie de la note, puis la note nulle.
 */
const chaines = new Map();
function chaineDe(colonne) {
  if (!chaines.has(colonne)) chaines.set(colonne, construireLaChaine(colonne));
  return chaines.get(colonne);
}
async function construireLaChaine(colonne) {
  const c = nouvelleCopie();
  const d = D.declarationDe(colonne);
  const banc = path.join(c.copie.dossier, 'banc');
  fs.mkdirSync(banc, { recursive: true });
  const p = BF.piecesDuBanc(path.join(c.copie.dossier, 'pieces'));
  const ch = { ...c, colonne, d, banc, p };
  ch.fixer = reussit(lancer(c, ['--fixer-colonne', colonne]), 'fixer-colonne');
  BF.poserLe46(c.copie, { colonne, date: DATE_DU_REGISTRE });
  ch.sceller = reussit(lancer(c, ['--sceller', '--regles', p.regles, '--documents', p.documents]), 'sceller');
  ch.rencontres = rencontresDe(colonne);
  ch.base = BF.magasinDuBanc(path.join(c.copie.dossier, 'base', 'banc.db'), { rencontres: ch.rencontres });
  const exporter = (au, nom) => reussit(lancer(c, ['--exporter', '--base', ch.base, '--au', au, '--passe', p.passe, '--sortie', path.join(banc, nom)]), `exporter ${au}`);
  ch.export1 = exporter('2026-09-30', 'export-1.jsonl');
  ch.export2 = exporter(DATE_DU_REGISTRE, 'export-2.jsonl');
  const comptes = (e, nom) => {
    const r = lancer(c, ['--comptes', '--export', e.sortie, '--sha1-export', e.sha1, '--sortie', path.join(banc, nom)], { env: { CM_ESSAI_TRACE: path.join(banc, `trace-${nom}.txt`) } });
    return reussit(r, `comptes ${nom}`);
  };
  ch.comptes1 = comptes(ch.export1, 'comptes-1.json');
  ch.comptes2 = comptes(ch.export2, 'comptes-2.json');
  ch.traceSurete = path.join(banc, 'trace-surete.txt');
  ch.surete = reussit(lancer(c, ['--banc', ...communs(ch, ch.export1, ch.comptes1), '--verrou', path.join(banc, 'verrou-surete.json'), '--sortie', path.join(banc, 'sortie-surete.json')], { env: { ...ESSAI, CM_ESSAI_TRACE: ch.traceSurete } }), 'banc');
  ch.avenant = BF.avenantDe(path.join(banc, 'avenant.md'), { sha1Export: ch.export2.sha1, au: DATE_DU_REGISTRE });
  ch.tracePreuve = path.join(banc, 'trace-preuve.txt');
  ch.preuve = reussit(lancer(c, ['--preuve', ...communs(ch, ch.export2, ch.comptes2), '--avenant', ch.avenant, '--verrou-surete', path.join(banc, 'verrou-surete.json'), '--verrou', path.join(banc, 'verrou-preuve.json'), '--sortie', path.join(banc, 'sortie-preuve.json')], { env: { ...ESSAI, CM_ESSAI_TRACE: ch.tracePreuve } }), 'preuve');
  ch.recopier = reussit(lancer(c, ['--recopier', path.join(banc, 'sortie-preuve.json')]), 'recopier');
  ch.fichierNote = path.join(c.copie.serveur, 'src', 'data', 'direct', 'noteDuDirect.js');
  ch.texteNote = fs.readFileSync(ch.fichierNote, 'utf8');
  ch.note = (await importer(ch.fichierNote)).NOTE_DU_DIRECT;
  ch.noteNulle = reussit(lancer(c, ['--note-nulle']), 'note-nulle');
  ch.texteNoteNulle = fs.readFileSync(ch.fichierNote, 'utf8');
  return ch;
}
const lignesDExport = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

// ------------------------------------------------------------ des rejeux synthétiques (essais purs du juge et de la garde)

/** Une lecture compacte fabriquée (valide) : `un2`, une probabilité `p` pour chaque ligne de buts, les lignes ouvertes de l'état. */
const lectureFabriquee = (un2, p, etat, o = {}) => ({ valide: true, pourquoi: null, somme: 1, negligee: 0, plafonnee: 0, masse: 0, un2, buts: Object.fromEntries(R.CLES_DES_BUTS.map((k) => [k, p])), ouvertes: R.CLES_DES_BUTS.filter((k) => R.ligneOuverte(k, etat)), ...o });
/** M rejeux d'un point au créneau `creneau` (0-0), une lecture par variante (`lecture(id, m)`), l'issue `issue(m)`. */
function rejeuxSynthetiques(M, { ids, lecture, issue, creneau = 0 }) {
  return Array.from({ length: M }, (_, m) => {
    const etat = { creneau, part: 0, h: 0, a: 0, rh: 0, ra: 0 };
    return { cle: `s${m}`, date: '2026-10-01', issue: issue(m), erreur: null, points: [{ etat, lectures: Object.fromEntries(ids.map((id) => [id, lecture(id, m, etat)])) }] };
  });
}

// ------------------------------------------------------------ T-B1

test('T-B1 du déroulé aux états : buts et rouges des créneaux STRICTEMENT antérieurs, 45 + 2 avant la pause, le camp ; l’issue au score de la 90e (prolongé compris) ; les trois matchs de R20 pour toutes les variantes des deux colonnes', () => {
  const resultat = { hg90: 2, ag90: 2, buts: [[10, 0], [45, 1], [46, 0], [91, 1]], rouges: [[30, 1]], prolongation: false };
  const etats = R.etatsDuRejeu(resultat, [0, 10, 11, 30, 31, 45, 46, 47, 91]);
  assert.deepEqual(
    etats.map((e) => [e.creneau, e.part, e.h, e.a, e.rh, e.ra]),
    [
      [0, 0, 0, 0, 0, 0],
      [10, 0, 0, 0, 0, 0],
      [11, 0, 1, 0, 0, 0],
      [30, 0, 1, 0, 0, 0],
      [31, 0, 1, 0, 0, 1],
      [45, 0, 1, 0, 0, 1],
      [46, 0, 1, 1, 0, 1],
      [47, 0, 2, 1, 0, 1],
      [91, 0, 2, 1, 0, 1]
    ],
    'le but du créneau k n’est jamais dans l’état du créneau k ; le 45 + 2 (créneau 45) est compté au début de la seconde mi-temps ; le camp 1 est l’extérieur'
  );
  assert.deepEqual(R.issueDuRejeu(resultat), { hg: 2, ag: 2 });
  // Un prolongé : l'export porte le score de la 90e (hg90, ag90) et la prolongation est hors du déroulé ; il y est jugé.
  const prolonge = { hg90: 1, ag90: 1, buts: [[20, 0], [70, 1]], rouges: [], prolongation: true };
  assert.deepEqual(R.issueDuRejeu(prolonge), { hg: 1, ag: 1 });
  assert.throws(() => R.issueDuRejeu({ ...prolonge, hg90: 2 }), R.RejeuInvalide, 'un score de la 90e qui ne redonne pas le déroulé');
  assert.throws(() => R.etatsDuRejeu({ buts: [[92, 0]] }, [0]), R.RejeuInvalide);
  assert.throws(() => R.etatsDuRejeu({ buts: [[3, 2]] }, [0]), R.RejeuInvalide);

  // Les trois matchs fabriqués de R20 point 4 (R22 point 3) : 9-0, 4-4 à deux rouges de chaque côté, 12-1, aux créneaux
  // 0, 45, 46, 91 ; toutes les variantes des deux colonnes, sur les deux grilles, aux coupes du banc.
  const ids = [...new Set(D.COLONNES.flatMap((c) => D.declarationDe(c).variantes.map((v) => v.id)))];
  assert.equal(ids.length, 7);
  for (const [nom, e] of [
    ['9-0', { h: 9, a: 0, rh: 0, ra: 0 }],
    ['4-4, deux rouges de chaque côté', { h: 4, a: 4, rh: 2, ra: 2 }],
    ['12-1', { h: 12, a: 1, rh: 0, ra: 0 }]
  ]) {
    const etatsF = D.CRENEAUX_D_ETALONNAGE.map((creneau) => ({ creneau, part: 0, ...e }));
    for (const grille of ['ancien-81', 'modele-buts-441']) {
      const r = R.lecturesDuRejeu({ ligne: { lambda: 1.45, mu: 1.15, rho: -0.08, grille, fair: { home: 0.45, draw: 0.28, away: 0.27 } }, etats: etatsF, variantes: ids, paramsSansEffets: PARAMS_SANS_EFFETS, championnat: BF.LIGUE });
      for (const pt of r.points) {
        for (const [id, l] of Object.entries(pt.lectures)) {
          const ou = `${nom}, ${grille}, créneau ${pt.etat.creneau}, ${id}`;
          assert.equal(l.valide, true, `${ou} : ${l.pourquoi}`);
          for (const x of [...l.un2, ...Object.values(l.buts)]) assert.ok(Number.isFinite(x) && x >= 0 && x <= 1 + 1e-9, `${ou} : ${x}`);
          assert.ok(Math.abs(l.un2[0] + l.un2[1] + l.un2[2] + l.negligee - 1) <= 1e-9, `${ou} : somme ${l.un2[0] + l.un2[1] + l.un2[2]} + ${l.negligee}`);
        }
      }
    }
  }
});

// ------------------------------------------------------------ T-B2

test('T-B2 les lignes du juge : une par (match, créneau, marché), bloc = le match, a = la perte de la variante A ; les lignes de buts décidées par le score n’y sont pas', () => {
  const ids = ['temps-restant', 'direct-v1'];
  const d = { variantes: ids.map((id) => ({ id })), creneaux: [0, 46, 80] };
  const ligne = { lambda: 1.5, mu: 1.1, rho: -0.06, grille: 'ancien-81', fair: null };
  const matchs = [
    { cle: 'x1', date: '2026-10-01', ligne, resultat: { hg90: 1, ag90: 1, buts: [[10, 0], [50, 1]], rouges: [] } },
    { cle: 'x2', date: '2026-10-01', ligne: { ...ligne, lambda: 1.1 }, resultat: { hg90: 0, ag90: 0, buts: [], rouges: [] } }
  ];
  const rejeux = B.rejouer(matchs, d, { paramsSansEffets: PARAMS_SANS_EFFETS });
  const un = B.lignesDuJuge(rejeux, { a: 'temps-restant', b: 'direct-v1', sur: '1n2' });
  assert.equal(un.lignes.length, 2 * 3, 'une ligne par (match, créneau)');
  assert.deepEqual([...new Set(un.lignes.map((l) => l.bloc))].sort(), ['x1', 'x2'], 'un bloc par MATCH, jamais par (match, créneau)');
  for (const l of un.lignes) assert.equal(l.bloc, l.match);
  assert.equal(new Set(un.lignes.map((l) => l.cle)).size, un.lignes.length, 'clés uniques');
  // `a` est la perte de la variante A, `b` celle de B (jamais inversées).
  const pt = rejeux[0].points[1];
  const l46 = un.lignes.find((l) => l.cle === 'x1|46|1n2');
  assert.equal(l46.a, perteLog(pt.lectures['temps-restant'].un2, 1).valeur);
  assert.equal(l46.b, perteLog(pt.lectures['direct-v1'].un2, 1).valeur);
  assert.notEqual(l46.a, l46.b);

  const buts = B.lignesDuJuge(rejeux, { a: 'temps-restant', b: 'direct-v1', sur: 'buts' });
  let attendues = 0;
  for (const r of rejeux) for (const p of r.points) attendues += R.CLES_DES_BUTS.filter((k) => R.ligneOuverte(k, p.etat)).length;
  assert.equal(buts.lignes.length, attendues, 'les seules lignes OUVERTES au point');
  // x1 au créneau 80 (1-1) : plus de 0,5 et 1,5 buts, les deux marquent, 0,5 de chaque équipe sont décidés → absents.
  const x180 = buts.lignes.filter((l) => l.cle.startsWith('x1|80|')).map((l) => l.cle.slice(6));
  assert.deepEqual(x180.sort(), ['teamGoals.away.1.5', 'teamGoals.away.2.5', 'teamGoals.away.3.5', 'teamGoals.home.1.5', 'teamGoals.home.2.5', 'teamGoals.home.3.5', 'totalGoals.2.5', 'totalGoals.3.5'].sort());
  for (const l of buts.lignes) assert.equal(l.bloc, l.match);
  const t25 = buts.lignes.find((l) => l.cle === 'x1|80|totalGoals.2.5');
  assert.equal(t25.a, perteLogBinaire(rejeux[0].points[2].lectures['temps-restant'].buts['totalGoals.2.5'], false).valeur, '1-1 à la 90e : « plus de 2,5 » perdu');
  assert.equal(un.filet.ecartees + buts.filet.ecartees, 0);
});

// ------------------------------------------------------------ T-B3

test('T-B3 anti-fuite par oracle tronqué : ce qui arrive au créneau k ou après ne change aucune lecture du créneau k ; étendu (R36 point 5) : hg90 et ag90 seuls changés ne changent rien', () => {
  const ids = ['direct-v1', 'temps-restant', 'direct-rouges-ignores'];
  const ligne = { lambda: 1.6, mu: 1.2, rho: -0.06, grille: 'ancien-81', fair: { home: 0.46, draw: 0.27, away: 0.27 } };
  const base = { hg90: 2, ag90: 1, buts: [[5, 0], [45, 1], [60, 0]], rouges: [[50, 1]] };
  const CR = [0, 30, 45, 46, 75, 91];
  const lire = (res, creneaux) => R.lecturesDuRejeu({ ligne, etats: R.etatsDuRejeu(res, creneaux), variantes: ids, paramsSansEffets: PARAMS_SANS_EFFETS, championnat: BF.LIGUE }).points;
  const ref = lire(base, CR);
  for (const [i, k] of CR.entries()) {
    const autre = {
      hg90: 9,
      ag90: 9,
      buts: [...base.buts.filter(([c]) => c < k), [k, 1], [Math.min(91, k + 2), 0], [91, 1]],
      rouges: [...base.rouges.filter(([c]) => c < k), [k, 0], [91, 1]]
    };
    const p = lire(autre, [k])[0];
    assert.deepEqual(p.etat, ref[i].etat, `l’état du créneau ${k}`);
    assert.deepEqual(p.lectures, ref[i].lectures, `les lectures du créneau ${k} ne voient rien de ce qui arrive à ${k} ou après`);
  }
  // Étendu : hg90 et ag90 seuls (le score de la 90e ne sert qu'à l'issue).
  assert.deepEqual(lire({ ...base, hg90: 7, ag90: 5 }, CR), ref);
});

// ------------------------------------------------------------ T-B4

test('T-B4 des matchs TIRÉS par simulerMatch (graine 4646, n = 1 500 et 600, créneaux 85, 88, 91) : direct-v1 bat temps-restant et direct-rouges-ignores ; sans effets, jamais « retenu » face à direct-sans-effets ; moins de 20 s', () => {
  // La borne des 20 s porte sur le TEMPS DE CALCUL du fil de l'essai (process.threadCpuUsage : ni le ramasse-miettes ni la
  // compilation des autres fils) : seul, l'essai calcule ~9 s. Dans la suite complète, une trentaine de fichiers tournent
  // ensemble : le temps d'horloge a atteint 32,4 s et le calcul de TOUT le processus 26,6 s (13/11, 0 h 54, quand les rejeux
  // des 1 500 matchs étaient refaits pour chaque jugement — ils sont faits une fois depuis, même contenu).
  const t0 = performance.now();
  const calculDuFil = typeof process.threadCpuUsage === 'function' ? (p) => process.threadCpuUsage(p) : (p) => process.cpuUsage(p);
  const c0 = calculDuFil();
  const CR = [85, 88, 91];
  const rejeuxDe = (matchs, ids) => matchs.map((m) => ({ cle: m.cle, issue: R.issueDuRejeu(m.resultat), points: R.lecturesDuRejeu({ ligne: m.ligne, etats: R.etatsDuRejeu(m.resultat, CR), variantes: ids, paramsSansEffets: PARAMS_SANS_EFFETS }).points }));
  const juger = (rejeux, a, b, rouges = false) => {
    const l = B.lignesDuJuge(rejeux, { a, b, sur: '1n2', rouges });
    return comparer(l.lignes, { mode: 'moyenne', sens: 'min', tirages: 1000, graine: 46, variantes: 7, alpha: 0.05, minBlocs: rouges ? 50 : 400 });
  };
  const avec = rejeuxDe(BF.matchsTires(1500, { params: PARAMS, creneaux: CR, graine: 4646 }), ['direct-v1', 'temps-restant', 'direct-rouges-ignores']);
  const j1 = juger(avec, 'temps-restant', 'direct-v1');
  assert.equal(j1.verdict, 'retenu', `temps-restant → direct-v1 : ${j1.verdict} (gain ${j1.gain}, écart-type ${j1.ecartType})`);
  const j2 = juger(avec, 'direct-rouges-ignores', 'direct-v1', true);
  assert.equal(j2.verdict, 'retenu', `direct-rouges-ignores → direct-v1 : ${j2.verdict} (gain ${j2.gain}, écart-type ${j2.ecartType})`);
  const sans = rejeuxDe(BF.matchsTires(600, { params: PARAMS_SANS_EFFETS, creneaux: CR, graine: 4646 }), ['direct-v1', 'direct-sans-effets']);
  const j3 = juger(sans, 'direct-sans-effets', 'direct-v1');
  assert.notEqual(j3.verdict, 'retenu', `sans effets : ${j3.verdict}`);
  const cpu = calculDuFil(c0);
  const calcul = (cpu.user + cpu.system) / 1e6;
  const horloge = (performance.now() - t0) / 1000;
  assert.ok(calcul < 20, `T-B4 : ${calcul.toFixed(1)} s de calcul (moins de 20 s) ; ${horloge.toFixed(1)} s d’horloge`);
});

// ------------------------------------------------------------ T-B5

test('T-B5 les refus du script, un par un : K, règles, export, module scellé, sortie présente, moins que la sûreté, sûreté à T, preuve sous T, nuit, hors du bac, sous OneDrive, passe qui tourne, R16, comptes d’un autre export, vue du registre, second passage, sceau et colonne', async () => {
  const ch = await chaineDe('non-adoptee');
  const { banc, p } = ch;
  const base = (args) => ['--banc', ...communs(ch, ch.export1, ch.comptes1), '--verrou', path.join(banc, 'verrou-tb5.json'), ...args];
  const sortie = (n) => ['--sortie', path.join(banc, `tb5-${n}.json`)];
  const avant = inventaire(banc);
  const k = communs(ch, ch.export1, ch.comptes1);
  const sans = (cle) => {
    const x = [...k];
    const i = x.indexOf(cle);
    x.splice(i, 2);
    return x;
  };
  refuse(lancer(ch, ['--banc', ...sans('--k'), '--k', '3', '--verrou', path.join(banc, 'v.json'), ...sortie(1)], { env: ESSAI }), /K doit valoir le nombre de variantes déclarées \(7 au registre/, 'K');
  const autresRegles = path.join(banc, 'autres-regles.md');
  fs.writeFileSync(autresRegles, '# autres règles\n');
  refuse(lancer(ch, ['--banc', ...sans('--regles'), '--regles', autresRegles, '--verrou', path.join(banc, 'v.json'), ...sortie(2)], { env: ESSAI }), /les règles ne sont pas celles du sceau/, 'sha1 des règles');
  refuse(lancer(ch, ['--banc', ...sans('--sha1-export'), '--sha1-export', '0'.repeat(40), '--verrou', path.join(banc, 'v.json'), ...sortie(3)], { env: ESSAI }), /l’export a changé depuis son sha1/, 'sha1 de l’export');
  // Un module scellé changé (puis remis).
  const rejeu = path.join(ch.copie.serveur, 'src', 'data', 'direct', 'rejeuDuDirect.js');
  const octets = fs.readFileSync(rejeu);
  fs.appendFileSync(rejeu, '\n// changé après le sceau\n');
  refuse(lancer(ch, base(sortie(4)), { env: ESSAI }), /rejeuDuDirect\.js n’a plus le sha1 scellé/, 'module scellé changé');
  fs.writeFileSync(rejeu, octets);
  const existante = path.join(banc, 'tb5-existante.json');
  fs.writeFileSync(existante, '{}');
  refuse(lancer(ch, base(['--sortie', existante]), { env: ESSAI }), /la sortie existe déjà/, 'sortie présente');
  refuse(lancer(ch, base(sortie(5)), { env: { ...ESSAI, CM_ESSAI_SURETE: '100' } }), /moins de 100 matchs dans l’export/, 'moins que la sûreté');
  refuse(lancer(ch, base(sortie(6)), { env: { ...ESSAI, CM_ESSAI_T: '5' } }), /seul le regard de preuve est pris/, 'sûreté à T');
  refuse(lancer(ch, ['--preuve', ...k, '--avenant', ch.avenant, '--sans-surete', '--verrou', path.join(banc, 'vp.json'), ...sortie(7)], { env: ESSAI }), /moins de T = 14 matchs/, 'preuve sous T');
  refuse(lancer(ch, base(sortie(8)), { env: ESSAI, maintenant: '2026-10-04T23:30:00.000Z' }), /jamais entre 0 h 10 et 2 h 30/, 'heure de nuit (1 h 30 de Paris)');
  refuse(lancer(ch, base(['--sortie', path.join(ch.copie.maison, '..', `hors-du-bac-tb5-${process.pid}.json`)]), { env: ESSAI }), /hors du bac/, 'sortie hors du bac');
  refuse(lancer(ch, base(['--sortie', path.join(ch.copie.dossier, 'OneDrive', 'tb5.json')]), { env: ESSAI }), /sous OneDrive/, 'sortie sous OneDrive');
  const occupee = path.join(banc, 'passe-occupee.json');
  fs.writeFileSync(occupee, JSON.stringify({ running: { step: 'essai' } }));
  refuse(lancer(ch, ['--banc', ...sans('--passe'), '--passe', occupee, '--attente-minutes', '0', '--verrou', path.join(banc, 'v.json'), ...sortie(9)], { env: ESSAI }), /la passe de Pierre tourne toujours/, 'passe qui tourne');
  assert.equal(fs.existsSync(path.join(banc, 'v.json')), false, 'aucun verrou posé par un refus');
  const r16 = path.join(banc, 'libelles-r16.json');
  fs.writeFileSync(r16, JSON.stringify({ regleR16: { declenchee: true } }));
  refuse(lancer(ch, ['--banc', ...sans('--libelles-json'), '--libelles-json', r16, '--verrou', path.join(banc, 'v.json'), ...sortie(10)], { env: ESSAI }), /règle de R16 est DÉCLENCHÉE/, 'R16 déclenchée');
  refuse(lancer(ch, ['--banc', ...sans('--comptes-json'), '--comptes-json', ch.comptes2.sortie, '--verrou', path.join(banc, 'v.json'), ...sortie(11)], { env: ESSAI }), /les comptes ne sont pas ceux de cet export/, 'comptes d’un autre export');
  // Un export qui va au-delà de la vue posée au registre (03/10) : reposer le registre (avenant) d'abord.
  const loin = path.join(banc, 'export-loin.jsonl');
  fs.writeFileSync(loin, BF.texteDExport({ colonne: 'non-adoptee', grille: 'ancien-81', matchs: BF.matchsFabriques(6, { prefixe: 'loin' }), sceau: ch.sceller.sceau, au: '2026-10-04' }));
  refuse(lancer(ch, ['--banc', ...sans('--export').filter((x) => x !== ch.export1.sha1 && x !== '--sha1-export'), '--export', loin, '--sha1-export', sha1(loin), '--verrou', path.join(banc, 'v.json'), ...sortie(12)], { env: ESSAI }), /reposer le registre à la date de l’export/, 'vue du registre trop courte');
  // Le second passage : refusé sans raison ; avec --rejouer-apres-correction, il passe et le dit.
  reussit(lancer(ch, base(sortie(13)), { env: ESSAI }), 'premier passage');
  refuse(lancer(ch, base(sortie(14)), { env: ESSAI }), /DÉJÀ été passé/, 'second passage sans raison');
  refuse(lancer(ch, base([...sortie(15), '--rejouer-apres-correction']), { env: ESSAI }), /DÉJÀ été passé/, 'raison vide');
  reussit(lancer(ch, base([...sortie(16), '--rejouer-apres-correction', 'essai de la correction']), { env: ESSAI }), 'second passage avec sa raison');
  const second = lireJson(path.join(banc, 'tb5-16.json'));
  assert.equal(second.rejeu.raison, 'essai de la correction');
  assert.deepEqual(second.rejeu.jugementsPrecedents, lireJson(path.join(banc, 'tb5-13.json')).banc.jugements.map((j) => ({ id: j.id, verdict: j.verdict })));
  assert.equal(lireJson(path.join(banc, 'verrou-tb5.json')).rejeux.length, 1, 'le verrou garde le premier passage et ajoute le second');
  refuse(lancer(ch, ['--banc', ...k, '--verrou', path.join(banc, 'neuf.json'), ...sortie(17), '--rejouer-apres-correction', 'x'], { env: ESSAI }), /sans passage précédent/, 'raison sans verrou');
  // Le sceau et la colonne.
  refuse(lancer(ch, ['--sceller', '--regles', p.regles, '--documents', p.documents]), /déjà scellé/, 'second sceau');
  refuse(lancer(ch, ['--fixer-colonne', 'adoptee', '--remplacer']), /déjà scellé : la colonne ne change plus/, 'colonne après le sceau');
  const nouveaux = inventaire(banc).filter((f) => !avant.includes(f));
  assert.deepEqual(nouveaux.filter((f) => /^tb5-(1|2|3|4|5|6|7|8|9|10|11|12|14|15|17)\.json$/.test(f)), [], 'aucune sortie écrite par un refus');
});

test('T-B5 bis : les refus du sceau (réglages d’essai, documents non cités, registre absent, registre d’une autre colonne) et de --fixer-colonne', () => {
  const c = nouvelleCopie();
  const p = BF.piecesDuBanc(path.join(c.copie.dossier, 'pieces'));
  reussit(lancer(c, ['--fixer-colonne', 'non-adoptee']), 'fixer');
  const banc = path.join(c.copie.serveur, 'src', 'data', 'direct', 'bancDuDirect.js');
  const avant = sha1(banc);
  refuse(lancer(c, ['--sceller', '--regles', p.regles, '--documents', p.documents]), /n’est pas au registre de la mesure/, 'registre absent');
  BF.poserLe46(c.copie, { colonne: 'adoptee', date: DATE_DU_REGISTRE });
  refuse(lancer(c, ['--sceller', '--regles', p.regles, '--documents', p.documents]), /la pose du registre ne suit pas la colonne/, 'registre d’une autre colonne');
  refuse(lancer(c, ['--sceller', '--regles', p.regles, '--documents', p.documents], { env: { CM_ESSAI_T: '10' } }), /jamais de sceau avec des réglages d’essai/, 'réglages d’essai');
  const q = BF.piecesDuBanc(path.join(c.copie.dossier, 'pieces-2'), { citer: false });
  refuse(lancer(c, ['--sceller', '--regles', q.regles, '--documents', q.documents]), /les règles ne citent pas par leur sha1 : critique-fabriquee\.md/, 'document non cité');
  assert.equal(sha1(banc), avant, 'bancDuDirect.js intact après les refus');
  refuse(lancer(c, ['--fixer-colonne', 'adoptee']), /déjà fixée sur « non-adoptee » : --remplacer/, 'autre colonne sans --remplacer');
  refuse(lancer(c, ['--fixer-colonne', 'bidon']), /colonne inconnue/, 'colonne inconnue');
  const r = reussit(lancer(c, ['--fixer-colonne', 'adoptee', '--remplacer']), 'remplacer avant le sceau');
  assert.equal(r.colonne, 'adoptee');
  assert.equal(r.K, 5);
});

// ------------------------------------------------------------ T-B6, T-B7

test('T-B6 --comptes ne lit jamais `resultat` : la trace n’a aucune issue, et un export aux `resultat` piégés donne les mêmes comptes et le même étalonnage', async () => {
  const ch = await chaineDe('non-adoptee');
  const trace = fs.readFileSync(path.join(ch.banc, 'trace-comptes-1.json.txt'), 'utf8').trim().split('\n');
  assert.deepEqual(trace, [`lu export (comptes) : ${ch.export1.matchs} matchs, 0 issues`]);
  const piege = path.join(ch.banc, 'export-piege.jsonl');
  const lignes = fs.readFileSync(ch.export1.sortie, 'utf8').split('\n').filter(Boolean).map((l, i) => {
    if (i === 0) return l;
    const m = JSON.parse(l);
    m.resultat = { hg90: 99, ag90: 'PIÈGE', buts: 'jamais lu', rouges: [[999, 7]] };
    return JSON.stringify(m);
  });
  fs.writeFileSync(piege, `${lignes.join('\n')}\n`);
  const tracePiege = path.join(ch.banc, 'trace-piege.txt');
  const r = reussit(lancer(ch, ['--comptes', '--export', piege, '--sha1-export', sha1(piege), '--sortie', path.join(ch.banc, 'comptes-piege.json')], { env: { CM_ESSAI_TRACE: tracePiege } }), 'comptes piégés');
  const a = lireJson(ch.comptes1.sortie);
  const b = lireJson(r.sortie);
  assert.equal(b.aucunResultatLu, true);
  assert.deepEqual(b.comptes, a.comptes);
  assert.deepEqual(b.etalonnage, a.etalonnage);
  assert.deepEqual(b.controle, a.controle);
  assert.deepEqual(fs.readFileSync(tracePiege, 'utf8').trim().split('\n'), [`lu export (comptes) : ${ch.export1.matchs} matchs, 0 issues`]);
  // Le lecteur pur : `resultat` retiré par le lecteur JSON lui-même.
  const lu = B.lireLExport(fs.readFileSync(piege, 'utf8'), { sansResultat: true });
  assert.ok(lu.matchs.every((m) => !Object.hasOwn(m, 'resultat')));
});

test('T-B7 le verrou est posé AVANT la première issue lue (trace des lectures), au regard de sûreté comme au regard de preuve', async () => {
  for (const colonne of D.COLONNES) {
    const ch = await chaineDe(colonne);
    for (const [quoi, f, regard] of [['sûreté', ch.traceSurete, 'surete'], ['preuve', ch.tracePreuve, 'preuve']]) {
      const t = fs.readFileSync(f, 'utf8').trim().split('\n');
      const iVerrou = t.indexOf(`verrou ${regard}`);
      assert.ok(iVerrou > 0, `${colonne}, ${quoi} : le verrou dans la trace (${t.join(' | ')})`);
      const issues = (l) => Number(/, (\d+) issues$/.exec(l)?.[1] ?? 0);
      assert.ok(t.slice(0, iVerrou).every((l) => issues(l) === 0), `${colonne}, ${quoi} : aucune issue avant le verrou (${t.join(' | ')})`);
      assert.ok(t.slice(iVerrou + 1).some((l) => issues(l) > 0), `${colonne}, ${quoi} : les issues lues après`);
    }
    const v = lireJson(path.join(ch.banc, 'verrou-surete.json'));
    const s = lireJson(path.join(ch.banc, 'sortie-surete.json'));
    assert.ok(v.pose <= s.fin && s.premierRegard === v.pose);
  }
});

// ------------------------------------------------------------ T-B8

test('T-B8 la table du temps additionnel (déplacée du script dans bancDuDirect.js : --mesurer-additionnel l’importe) : la table attendue, monotone, plafonnée, plancher ; son contrôle sur P5', () => {
  const t = B.tableDuTempsAdditionnel([0, 300, 500, 250, 100]);
  assert.deepEqual([t.xEtoile, t.X, t.total], [2, 3, 1150]);
  assert.deepEqual(t.S, [null, 1, 1, 0.5, 0.2]);
  for (const [x, v] of [[1, 1000 / 1150], [2, 600 / 1150], [3, 450 / 1150]]) assert.ok(Math.abs(t.reste[x] - v) < 1e-15, `reste[${x}]`);
  assert.equal(t.reste.length, 4, 'plafonnée à X = 3 (le dernier x à 200 buts ou plus)');
  const m = B.tableDuTempsAdditionnel([0, 1000, 10, 300], { qMin: 1 });
  assert.ok(m.resteBrut[2] > m.resteBrut[1] && m.reste[2] === m.reste[1], 'monotone imposé');
  const p = B.tableDuTempsAdditionnel([0, ...Array(20).fill(100)], { qMin: 1 });
  assert.ok(p.resteBrut[20] < B.PLANCHER && p.reste[20] === B.PLANCHER, 'plancher 0,05');
  // Le contrôle sur P5 (dans --banc, après le verrou) : la même table refaite sur les buts de 45 + x et 90 + x de l'export.
  const matchs = [{ resultat: { ajouts: { 45: [1, 2], 91: [1, 3] } } }, { resultat: { ajouts: { 45: [1], 91: [2] } } }, { resultat: { ajouts: { 45: [], 91: [] } } }];
  const c = B.controleDuTempsAdditionnel(matchs);
  const t45 = B.tableDuTempsAdditionnel([0, 2, 1], { qMin: 1 });
  let e45 = 0;
  for (let x = 1; x <= Math.min(RESTE_ADDITIONNEL.X45, t45.X); x++) e45 = Math.max(e45, Math.abs(t45.reste[x] - RESTE_ADDITIONNEL.reste45[x]));
  assert.deepEqual([c.premiere.buts, c.seconde.buts], [3, 3]);
  assert.ok(Math.abs(c.premiere.ecartMax - e45) < 1e-4);
  assert.equal(c.ecartMax, Math.max(c.premiere.ecartMax, c.seconde.ecartMax));
  // Le script n'a plus sa propre copie de la table : il l'importe de bancDuDirect.js (E0-3 à E0-5 essaient --mesurer-additionnel).
  const script = fs.readFileSync(path.join(SERVEUR, 'scripts', 'etape46.mjs'), 'utf8');
  assert.match(script, /const \{ tableDuTempsAdditionnel, Q_MIN, PLANCHER \} = await import\('\.\.\/src\/data\/direct\/bancDuDirect\.js'\);/);
  assert.doesNotMatch(script, /function tableDuTempsAdditionnel/);
});

// ------------------------------------------------------------ T-B9

test('T-B9 --recopier refait noteDuDirect.js À L’OCTET depuis la fixture gardée ; --note-nulle l’éteint (null à l’octet) ; le fichier du code est l’un ou l’autre', async () => {
  for (const colonne of D.COLONNES) {
    const ch = await chaineDe(colonne);
    const fixture = path.join(ch.copie.serveur, 'test', 'fixtures', 'banc-etape46-preuve.json');
    assert.ok(fs.existsSync(fixture), 'la sortie gardée dans test/fixtures');
    assert.equal(sha1(fixture), sha1(path.join(ch.banc, 'sortie-preuve.json')), 'copie à l’octet');
    assert.equal(sha1(path.join(ch.copie.serveur, 'test', 'fixtures', 'banc-regles-etape46.md')), sha1(ch.p.regles));
    assert.equal(sha1(path.join(ch.copie.serveur, 'test', 'fixtures', 'banc-avenant-etape46.md')), sha1(ch.avenant));
    const refaite = B.texteDeLaNote(B.aRecopier(lireJson(fixture), { sortie: { fichier: 'test/fixtures/banc-etape46-preuve.json', sha1: sha1(fixture) } }));
    assert.equal(ch.texteNote, refaite, `${colonne} : la note refaite à l’octet`);
    assert.equal(ch.texteNoteNulle, B.texteDeLaNote(null));
    assert.deepEqual(ch.noteNulle.eteinte, { regard: 'preuve', verdict: ch.note.verdict, passeLe: ch.note.passeLe, sortie: 'test/fixtures/banc-etape46-preuve.json' });
    assert.equal((await importer(ch.fichierNote)).NOTE_DU_DIRECT, null);
    assert.ok(Object.isFrozen(ch.note) && Object.isFrozen(ch.note.paires));
  }
  // Le fichier du CODE (s'il existe) : la note nulle à l'octet, ou la note refaite de la fixture gardée du code.
  const f = path.join(SERVEUR, 'src', 'data', 'direct', 'noteDuDirect.js');
  if (fs.existsSync(f)) {
    const texte = fs.readFileSync(f, 'utf8');
    const possibles = [B.texteDeLaNote(null)];
    for (const regard of B.REGARDS) {
      const fx = path.join(SERVEUR, 'test', 'fixtures', `banc-etape46-${regard}.json`);
      if (fs.existsSync(fx)) possibles.push(B.texteDeLaNote(B.aRecopier(lireJson(fx), { sortie: { fichier: `test/fixtures/banc-etape46-${regard}.json`, sha1: sha1(fx) } })));
    }
    assert.ok(possibles.includes(texte), 'noteDuDirect.js du code : null, ou refaite de sa fixture, à l’octet');
  }
});

// ------------------------------------------------------------ T-B10

test('T-B10 par colonne : le registre posé (K variantes uniques, la retenue en tête ; vues de portée « direct » seulement), le z de K et de K × 8 refaits, le juge au z de K', async () => {
  for (const colonne of D.COLONNES) {
    const ch = await chaineDe(colonne);
    const d = ch.d;
    const lan = await importer(path.join(ch.copie.serveur, 'src', 'bench', 'lancements.js'));
    assert.equal(lan.PORTEES.at(-1), 'direct');
    const v = lan.VARIANTES_DE_L_ETAPE_46.map((x) => x.id);
    assert.equal(v.length, d.K, `${colonne} : K = ${d.K}`);
    assert.equal(new Set(v).size, v.length, 'identifiants uniques');
    assert.equal(v[0], d.variantes[0].id, 'la retenue en tête');
    assert.deepEqual(v, d.variantes.map((x) => x.id));
    for (const vue of lan.VUES_DE_L_ETAPE_46) assert.deepEqual([...vue.pour], ['direct'], `vue ${vue.de} → ${vue.a} : portée « direct » seulement`);
    assert.equal(lan.VUES_DE_L_ETAPE_46[0].a, DATE_DU_REGISTRE, 'la période du banc finit au jour de l’export');
    const e = lan.LANCEMENTS.filter((l) => l.etape === '46');
    assert.equal(e.length, 1);
    assert.deepEqual([e[0].version, e[0].le, e[0].variantes, e[0].vues], [d.variantes[0].id, DATE_DU_REGISTRE, lan.VARIANTES_DE_L_ETAPE_46, lan.VUES_DE_L_ETAPE_46]);
    assert.equal(ch.sceller.registre.K, d.K);
    assert.ok(Math.abs(zPour(0.05, d.K) - d.z) < 5e-4, `${colonne} : z de K refait (${zPour(0.05, d.K)})`);
    assert.ok(Math.abs(zPour(0.05, d.K * D.TRANCHES.length) - d.zTranches) < 5e-4, `${colonne} : z des tranches refait`);
    assert.deepEqual(D.zDeLaColonne(d).z.toFixed(3), d.z.toFixed(3));
    // Le juge au z de K (jamais « variantes: 1 ») ; les tranches au z de K × 8.
    const s = lireJson(path.join(ch.banc, 'sortie-preuve.json'));
    for (const j of s.banc.jugements.filter((x) => x.z !== undefined && x.z !== null)) assert.ok(Math.abs(j.z - d.z) < 5e-4, `${colonne}, ${j.id} : z ${j.z} au lieu de ${d.z}`);
    for (const j of s.banc.tranches) assert.ok(Math.abs(j.z - d.zTranches) < 5e-4, `${colonne}, ${j.id} : z ${j.z} au lieu de ${d.zTranches}`);
    assert.equal(s.banc.K, d.K);
  }
});

// ------------------------------------------------------------ R13

test('R13 la garde de calibration : 16 unités × 8 tranches = 128 paires comptées ; écartée au-delà de 4 points ET 3 écarts-types ; « à surveiller » au regard de preuve seulement ; une paire de moins de 50 matchs n’est pas jugée', () => {
  const ids = ['direct-v1'];
  const issueSelon = (m, M, parts) => {
    const x = (m + 0.5) / M;
    return x < parts[0] ? { hg: 1, ag: 0 } : x < parts[0] + parts[1] ? { hg: 0, ag: 0 } : { hg: 0, ag: 1 };
  };
  const sansButs = (id, m, etat) => lectureFabriquee(null, 0.5, etat, { ouvertes: [] });
  // Calibration parfaite : annoncé 50/30/20, réalisé 50/30/20 sur 1 000 matchs → rien d'écarté ni à surveiller.
  const M = 1000;
  const parfaite = rejeuxSynthetiques(M, { ids, lecture: (id, m, e) => ({ ...sansButs(id, m, e), un2: [0.5, 0.3, 0.2] }), issue: (m) => issueSelon(m, M, [0.5, 0.3]) });
  const g = B.gardeDeCalibration(parfaite, 'direct-v1', { regard: 'preuve', tirages: 200 });
  assert.deepEqual([g.unites, g.tranches, g.paires, g.jugees, g.nonJugees, g.ecartees.length, g.aSurveiller.length], [16, 8, 128, 3, 0, 0, 0]);
  // Biais de 10 points (annoncé 60/20/20 pour 50/30/20) : le domicile et le nul écartés (au-delà de 4 points et de 3 σ).
  const biaisee = rejeuxSynthetiques(M, { ids, lecture: (id, m, e) => ({ ...sansButs(id, m, e), un2: [0.6, 0.2, 0.2] }), issue: (m) => issueSelon(m, M, [0.5, 0.3]) });
  for (const regard of B.REGARDS) {
    const gb = B.gardeDeCalibration(biaisee, 'direct-v1', { regard, tirages: 200 });
    assert.deepEqual(gb.ecartees.map((x) => x.unite).sort(), ['result.draw', 'result.home'], regard);
    const h = gb.ecartees.find((x) => x.unite === 'result.home');
    assert.deepEqual([h.tranche, h.annonce, h.realise, h.n], [D.TRANCHES[0], 0.6, 0.5, M]);
    assert.ok(Math.abs(h.ecart) > 0.04 && Math.abs(h.ecart) > 3 * h.sigma);
  }
  // Petit écart sur peu de matchs (5 points sur 60) : au-delà de 4 points mais pas de 3 σ → « à surveiller » en preuve, rien en sûreté.
  const P = 60;
  const petite = rejeuxSynthetiques(P, { ids, lecture: (id, m, e) => ({ ...sansButs(id, m, e), un2: [0.55, 0.25, 0.2] }), issue: (m) => issueSelon(m, P, [0.5, 0.3]) });
  const gp = B.gardeDeCalibration(petite, 'direct-v1', { regard: 'preuve', tirages: 200 });
  assert.deepEqual(gp.ecartees, []);
  assert.deepEqual(gp.aSurveiller.map((x) => x.unite).sort(), ['result.draw', 'result.home']);
  assert.deepEqual(B.gardeDeCalibration(petite, 'direct-v1', { regard: 'surete', tirages: 200 }).aSurveiller, []);
  // Moins de 50 matchs : non jugée, comptée.
  const peu = rejeuxSynthetiques(49, { ids, lecture: (id, m, e) => ({ ...sansButs(id, m, e), un2: [0.9, 0.05, 0.05] }), issue: () => ({ hg: 0, ag: 1 }) });
  const gq = B.gardeDeCalibration(peu, 'direct-v1', { regard: 'preuve', tirages: 100 });
  assert.deepEqual([gq.jugees, gq.nonJugees, gq.ecartees.length, gq.aSurveiller.length], [0, 3, 0, 0]);
  assert.equal(D.SEUILS.minMatchsParPaire, 50);
  // Une lecture invalide n'entre pas dans la garde.
  const invalides = rejeuxSynthetiques(M, { ids, lecture: (id, m, e) => ({ ...sansButs(id, m, e), un2: [0.6, 0.2, 0.2], valide: m >= 10 }), issue: (m) => issueSelon(m, M, [0.5, 0.3]) });
  assert.equal(B.gardeDeCalibration(invalides, 'direct-v1', { regard: 'preuve', tirages: 100 }).ecartees.find((x) => x.unite === 'result.home').n, M - 10);
});

// ------------------------------------------------------------ R14

test('R14 J2s par famille dans les deux colonnes (temps-restant-championnat → la variante affichée) ; une famille « moins bonne » n’est pas montrée ; --comptes rapporte λ + μ', () => {
  for (const colonne of D.COLONNES) {
    const d = D.declarationDe(colonne);
    const j2s = d.jugements.filter((j) => j.id.startsWith('J2s-'));
    assert.deepEqual(j2s.map((j) => [j.famille, j.a, j.b, j.sur, j.role]), D.FAMILLES_DE_BUTS.map((f) => [f, 'temps-restant-championnat', 'affichee', 'buts', 'exige']), colonne);
    assert.ok(d.variantes.some((v) => v.id === 'temps-restant-championnat'), `${colonne} : la référence déclarée (K + 1)`);
  }
  const d = D.declarationDe('non-adoptee');
  const jugements = [{ id: 'principal', verdict: 'pas-prouve', fourchette: [-0.001, 0.002] }, { id: 'J2s-bothTeamsScore', verdict: 'moins-bon' }, { id: 'J2-teamGoals', verdict: 'moins-bon' }, { id: 'J2s-totalGoals', verdict: 'pas-prouve' }];
  for (const regard of B.REGARDS) {
    const t = B.tableDuVerdict({ regard, f1: { tenu: true, pire: { masse: 0, ou: null } }, principal: jugements[0], jugements, tranches: [], paires: { ecartees: [] }, declaration: d, n: 900 });
    assert.deepEqual(t.famillesNonMontrees, ['bothTeamsScore', 'teamGoals'], regard);
  }
  // R14 point 3 : la répartition de λ + μ, sans issue.
  const matchs = [1.5, 2.6, 4.2, 3.0].map((tot, i) => ({ cle: `c${i}`, date: '2026-10-01', league: BF.LIGUE, kickoff: '2026-10-01T15:00:00.000Z', ligne: { lambda: tot / 2, mu: tot / 2, kickoffConnu: i !== 3, calculeLe: '2026-09-30T15:00:00.000Z', fair: i ? { home: 0.4, draw: 0.3, away: 0.3 } : null } }));
  const c = B.comptesDeLExport({ exclus: { graine: 1 } }, matchs, d);
  assert.deepEqual([c.matchs, c.totalButs.partSous16, c.totalButs.partAuDessus4, c.partHeureInconnue, c.partAvecFair, c.ageAuCoupDEnvoiH.mediane, c.ageAuCoupDEnvoiH.partPlusDe24h], [4, 0.25, 0.25, 0.25, 0.75, 24, 0]);
  assert.deepEqual(c.exclus, { graine: 1 });
});

// ------------------------------------------------------------ R15

test('R15 les deux regards : sûreté (deux phrases seulement, jamais un gain), puis preuve (second export, identité des LIGNES, écarts comptés sans refus, avenant, verrou propre) ; le chemin « faits seuls » (--preuve --sans-surete)', async () => {
  for (const colonne of D.COLONNES) {
    const ch = await chaineDe(colonne);
    const s = lireJson(path.join(ch.banc, 'sortie-surete.json'));
    assert.equal(s.regard, 'surete');
    assert.ok(['montre-non-tranche', 'faits-seuls'].includes(s.banc.verdict), s.banc.verdict);
    assert.match(espaces(s.banc.phrase), /^(Rien de moins bon : montré, pas encore jugé \(\d+ matchs rejoués sur les 14 prévus\)( ; non montré : [^.]+)?\.|Moins bon : pas montré|F1 non tenu)/);
    for (const j of [...s.banc.jugements, ...s.banc.tranches]) {
      assert.ok(['moins-bon', 'rien-de-moins-bon', 'sans-objet'].includes(j.verdict), `${colonne}, sûreté, ${j.id} : ${j.verdict}`);
      assert.equal(j.gain, null);
      assert.equal(j.fourchette, null);
    }
    assert.deepEqual(s.banc.paires.aSurveiller, []);
    const p = lireJson(path.join(ch.banc, 'sortie-preuve.json'));
    assert.equal(p.regard, 'preuve');
    assert.ok(['prouve', 'pas-prouve', 'faits-seuls'].includes(p.banc.verdict));
    assert.match(p.preuve.chemin, /après le regard de sûreté/);
    assert.deepEqual([p.preuve.avenant.sha1, p.preuve.export.sha1, p.preuve.surete.export.sha1], [sha1(ch.avenant), ch.export2.sha1, ch.export1.sha1]);
    // Les écarts entre les deux exports : comptés, nommés, sans refus (ici : les matchs du 01 au 03/10 sont « nouveaux »).
    assert.deepEqual([p.ecartsDesExports.feuillesPublieesEnRetard.n, p.ecartsDesExports.feuillesDeMatchManquantes.n, p.ecartsDesExports.resultatsChanges.n], [0, 0, 0]);
    assert.equal(p.ecartsDesExports.nouveauxDepuisLePremierExport, ch.export2.matchs - ch.export1.matchs);
    const v = lireJson(path.join(ch.banc, 'verrou-preuve.json'));
    assert.deepEqual([v.regard, v.surete.sha1Verrou, v.avenant.sha1], ['preuve', sha1(path.join(ch.banc, 'verrou-surete.json')), sha1(ch.avenant)]);
  }
  const ch = await chaineDe('non-adoptee');
  const { banc } = ch;
  const k = communs(ch, ch.export2, ch.comptes2);
  // L'avenant : obligatoire, il cite le sha1 du second export et sa date ; jamais les règles elles-mêmes.
  refuse(lancer(ch, ['--preuve', ...k, '--verrou-surete', path.join(banc, 'verrou-surete.json'), '--verrou', path.join(banc, 'vp-r15.json'), '--sortie', path.join(banc, 'r15-1.json')], { env: ESSAI }), /--avenant <md> est obligatoire/, 'sans avenant');
  const mauvais = BF.avenantDe(path.join(banc, 'avenant-faux.md'), { sha1Export: ch.export1.sha1, au: DATE_DU_REGISTRE });
  refuse(lancer(ch, ['--preuve', ...k, '--avenant', mauvais, '--verrou-surete', path.join(banc, 'verrou-surete.json'), '--verrou', path.join(banc, 'vp-r15.json'), '--sortie', path.join(banc, 'r15-2.json')], { env: ESSAI }), /l’avenant ne cite pas le sha1 de l’export/, 'avenant d’un autre export');
  // Le second export exigé ; le verrou propre ; le verrou de sûreté exigé (ou --sans-surete).
  const k1 = communs(ch, ch.export1, ch.comptes1);
  const av1 = BF.avenantDe(path.join(banc, 'avenant-1.md'), { sha1Export: ch.export1.sha1, au: '2026-09-30' });
  refuse(lancer(ch, ['--preuve', ...k1, '--avenant', av1, '--verrou-surete', path.join(banc, 'verrou-surete.json'), '--verrou', path.join(banc, 'vp-r15.json'), '--sortie', path.join(banc, 'r15-3.json')], { env: { ...ESSAI, CM_ESSAI_T: '6' } }), /exige un SECOND export/, 'le même export');
  refuse(lancer(ch, ['--preuve', ...k, '--avenant', ch.avenant, '--verrou-surete', path.join(banc, 'verrou-surete.json'), '--verrou', path.join(banc, 'verrou-surete.json'), '--sortie', path.join(banc, 'r15-4.json')], { env: ESSAI }), /verrou PROPRE/, 'verrou de sûreté réemployé');
  refuse(lancer(ch, ['--preuve', ...k, '--avenant', ch.avenant, '--verrou-surete', path.join(banc, 'absent.json'), '--verrou', path.join(banc, 'vp-r15.json'), '--sortie', path.join(banc, 'r15-5.json')], { env: ESSAI }), /le verrou de sûreté est introuvable/, 'sans regard de sûreté');
  refuse(lancer(ch, ['--preuve', ...k, '--avenant', ch.avenant, '--sans-surete', '--verrou-surete', path.join(banc, 'verrou-surete.json'), '--verrou', path.join(banc, 'vp-r15.json'), '--sortie', path.join(banc, 'r15-6.json')], { env: ESSAI }), /un seul chemin/, 'les deux chemins à la fois');
  // L'identité des LIGNES : une ligne plus récente (avant le coup d'envoi) d'un match commun, rangée après le premier export.
  const autre = path.join(ch.copie.dossier, 'base', 'banc-identite.db');
  // Correctif R9 du 13/11 après-midi : et une ligne RÉÉCRITE à la même heure dont seul `fair` a changé (banc-0001).
  const fairSeul = (l) => ({ ...l, fair: { ...l.fair, home: Number((l.fair.home + 0.01).toFixed(4)), draw: Number((l.fair.draw - 0.01).toFixed(4)) } });
  const rencontres = ch.rencontres.map((r) => (r.id === 0 ? { ...r, lignes: [...r.lignes, { ...r.lignes[0], calculeLe: new Date(Date.parse(r.kickoff) - 2 * 3_600_000).toISOString(), lambda: r.lignes[0].lambda + 0.2 }] } : r.id === 1 ? { ...r, lignes: r.lignes.map(fairSeul) } : r));
  BF.magasinDuBanc(autre, { rencontres });
  const e3 = reussit(lancer(ch, ['--exporter', '--base', autre, '--au', DATE_DU_REGISTRE, '--passe', ch.p.passe, '--sortie', path.join(banc, 'export-3.jsonl')]), 'export 3');
  const c3 = reussit(lancer(ch, ['--comptes', '--export', e3.sortie, '--sha1-export', e3.sha1, '--sortie', path.join(banc, 'comptes-3.json')]), 'comptes 3');
  const av3 = BF.avenantDe(path.join(banc, 'avenant-3.md'), { sha1Export: e3.sha1, au: DATE_DU_REGISTRE });
  const trace = path.join(banc, 'trace-identite.txt');
  refuse(lancer(ch, ['--preuve', ...communs(ch, e3, c3), '--avenant', av3, '--verrou-surete', path.join(banc, 'verrou-surete.json'), '--verrou', path.join(banc, 'vp-r15.json'), '--sortie', path.join(banc, 'r15-7.json')], { env: { ...ESSAI, CM_ESSAI_TRACE: trace } }), /identité des lignes rompue : 2 matchs communs ont une autre ligne d’avant-match dans le second export \((banc-0000, banc-0001|banc-0001, banc-0000)\), au-delà de la tolérance \(au plus 5 matchs et au plus 0,5 % des \d+ matchs communs\) : rien lu/, 'identité des lignes (C12 : 2 sur une dizaine de matchs communs, au-delà de 0,5 % ; R9 : `fair` seul changé compte)');
  assert.equal(fs.existsSync(path.join(banc, 'vp-r15.json')), false, 'aucun verrou de preuve posé');
  assert.ok(fs.readFileSync(trace, 'utf8').split('\n').filter(Boolean).every((l) => / 0 issues$/.test(l)), 'aucune issue lue');
  // Le chemin « faits seuls » (R15 point 4) : --preuve seul, sans regard de sûreté, sur le second export (n ≥ T).
  const fs1 = reussit(lancer(ch, ['--preuve', ...k, '--avenant', ch.avenant, '--sans-surete', '--verrou', path.join(banc, 'verrou-seul.json'), '--sortie', path.join(banc, 'sortie-seule.json')], { env: ESSAI }), 'preuve seule');
  const seule = lireJson(fs1.sortie);
  assert.match(seule.preuve.chemin, /regard de preuve seul/);
  assert.equal(seule.preuve.avertissement, undefined, 'aucun verrou de sûreté au chemin fixe : rien à dire (C4 point 3)');
  assert.equal(seule.preuve.surete, null);
  assert.equal(seule.ecartsDesExports, null);
});

// ------------------------------------------------------------ R17

test('R17 la table du verdict, pour les deux regards : F1, principal « moins bon », tranche, famille, paire écartée, sinon la phrase du regard ; J4c lu d’abord, le principal relu après le repli', () => {
  const d = D.declarationDe('non-adoptee');
  const tenu = { tenu: true, pire: { masse: 1e-9, ou: 'x' } };
  const v = (regard, o) => B.tableDuVerdict({ regard, f1: tenu, principal: { id: 'principal', verdict: 'pas-prouve', fourchette: [-0.0012, 0.0034] }, jugements: [], tranches: [], paires: { ecartees: [] }, declaration: d, n: 1234, ...o });
  for (const regard of B.REGARDS) {
    const f1 = v(regard, { f1: { tenu: false, pire: { masse: 2e-5, ou: 'm1, créneau 45 (9-0, rouges 0-0), direct-v1' } } });
    assert.deepEqual([f1.verdict, f1.pourquoi], ['faits-seuls', 'f1']);
    assert.match(f1.phrase, /^F1 non tenu : pas montré \(masse négligée \+ plafonnée 0\.00002 au pire état, m1, créneau 45/);
    const nt = v(regard, { f1NonTenu: ['m2, créneau 0, direct-v1 : lecture absente'] });
    assert.deepEqual([nt.verdict, nt.pourquoi], ['faits-seuls', 'f1']);
    const mb = v(regard, { principal: { id: 'principal', verdict: 'moins-bon' } });
    assert.deepEqual([mb.verdict, mb.pourquoi], ['faits-seuls', 'principal']);
    assert.equal(espaces(mb.phrase), regard === 'surete' ? 'Moins bon : pas montré — sur 1 234 matchs rejoués, le calcul en direct fait moins bien que la simple règle du temps restant (perte log du 1N2).' : 'Moins bon : pas montré — sur 1 234 matchs rejoués, le calcul en direct fait moins bien que la simple règle du temps restant, au-delà du hasard (perte log du 1N2).');
    const tr = v(regard, { tranches: [{ id: `principal@${D.TRANCHES[5]}`, verdict: 'moins-bon' }, { id: `J2@${D.TRANCHES[2]}`, verdict: 'moins-bon' }, { id: `J2@${D.TRANCHES[3]}`, verdict: 'pas-prouve' }] });
    assert.deepEqual(tr.tranchesNonMontrees, [D.TRANCHES[2], D.TRANCHES[5]]);
  }
  assert.equal(espaces(v('surete').phrase), 'Rien de moins bon : montré, pas encore jugé (1 234 matchs rejoués sur les 2 300 prévus).');
  assert.equal(v('surete').verdict, 'montre-non-tranche');
  const pr = v('preuve', { principal: { id: 'principal', verdict: 'retenu' }, paires: { ecartees: [{}, {}] } });
  assert.deepEqual([pr.verdict, espaces(pr.phrase)], ['prouve', 'Meilleur que la simple règle du temps restant sur 1 234 matchs rejoués : prouvé sur la perte log du 1N2, à point de départ égal ; 2 paires écartées par la garde de calibration.']);
  assert.match(v('preuve', { principal: { id: 'principal', verdict: 'retenu' } }).phrase, /aucun écart de calibration prouvé\.$/);
  const pp = v('preuve');
  assert.deepEqual([pp.verdict, espaces(pp.phrase)], ['pas-prouve', 'Pas encore tranché : sur 1 234 matchs rejoués, ce calcul fait entre 1,2 millième de moins bien et 3,4 millièmes de mieux que la simple règle du temps restant (perte log du 1N2) ; il en faut environ 2 300.']);
  assert.doesNotMatch(v('surete').phrase, /prouvé|retenu|meilleur/i, 'la sûreté ne dit jamais prouvé ni meilleur');

  // J4c d'abord : direct-ancre nettement moins bonne que direct-v1 → affichée direct-v1, le principal relu en
  // temps-restant → direct-v1 (R17 point 2) ; les deux jugements rendus, dans cet ordre.
  const ids = d.variantes.map((x) => x.id);
  const bon = [0.7, 0.2, 0.1];
  const rejeux = rejeuxSynthetiques(500, { ids, lecture: (id, m, e) => lectureFabriquee(id === 'direct-ancre' ? [0.1, 0.2, 0.7] : bon, 0.5, e), issue: () => ({ hg: 1, ag: 0 }) });
  const j = B.jugerLeBanc(rejeux, d, { regard: 'preuve', tirages: 200 });
  assert.deepEqual([j.jugements[0].id, j.jugements[0].verdict, j.jugements[1].id], ['J4c', 'moins-bon', 'principal']);
  assert.deepEqual([j.affichee, j.principal.a, j.principal.b, j.principal.repliJ4c], ['direct-v1', 'temps-restant', 'direct-v1', true]);
  assert.deepEqual([j.jugements[1].a, j.jugements[1].b, j.jugements[1].repliJ4c], ['temps-restant', 'direct-v1', true]);
  assert.equal(j.jugements.find((x) => x.id === 'J1-O4').b, 'direct-v1', 'b « affichee » résolu après le repli');
  // Sans repli : affichée direct-ancre, principal temps-restant-ancre → direct-ancre.
  const sansRepli = B.jugerLeBanc(rejeuxSynthetiques(500, { ids, lecture: (id, m, e) => lectureFabriquee(bon, 0.5, e), issue: () => ({ hg: 1, ag: 0 }) }), d, { regard: 'preuve', tirages: 100 });
  assert.deepEqual([sansRepli.affichee, sansRepli.principal.a, sansRepli.principal.b, sansRepli.principal.repliJ4c], ['direct-ancre', 'temps-restant-ancre', 'direct-ancre', false]);
});

// ------------------------------------------------------------ R19

test('R19 l’export (1) : la ligne exportée est celle de ligneDeService avec l’heure RÉELLE du coup d’envoi ; la graine refaite ; le prolongé au score de la 90e ; sans meta.kickoff, la ligne d’avant minuit de Paris gardée ; l’en-tête (modèle, principal, sceau, exclus)', async () => {
  for (const colonne of D.COLONNES) {
    const ch = await chaineDe(colonne);
    const [entete, ...matchs] = lignesDExport(ch.export2.sortie);
    assert.deepEqual([entete.colonne, entete.modele.grille, entete.modele.roles, entete.fenetre, entete.scellement.sha1, Boolean(entete.principal28)], [colonne, ch.d.modele.grille, ch.d.modele.roles, { de: D.DEBUT_DU_BANC, au: DATE_DU_REGISTRE }, ch.sceller.sceau, true]);
    // C1 : la candidate de l'empreinte adoptée n'a pas de version (forme réelle) ; elle est comptée à part dans l'en-tête.
    assert.deepEqual(entete.modele.engineVersions, colonne === 'adoptee' ? { [VERSION_DE[colonne]]: matchs.length - 1, 'candidate sans version': 1 } : { [VERSION_DE[colonne]]: matchs.length });
    const db = new DatabaseSync(ch.base, { readOnly: true });
    try {
      for (const m of matchs) {
        const r = ch.rencontres.find((x) => x.matchKey === m.matchKey);
        const reel = r.meta?.kickoff ?? null;
        if (r.lignes.every((l) => l.role === 'service')) {
          if (reel) {
            const s = ligneDeService({ homeId: `fotmob-${r.home}`, awayId: `fotmob-${r.away}`, kickoff: reel, database: db });
            assert.equal(s.trouve, true, m.matchKey);
            assert.deepEqual([m.cle, m.ligne.calculeLe, m.ligne.lambda, m.ligne.mu, m.ligne.rho, m.ligne.fair], [s.cle, s.calculeLe, s.lambda, s.mu, s.rho, s.fair], `${m.matchKey} : la ligne de ligneDeService à l’heure réelle`);
          }
          assert.ok(Date.parse(m.ligne.calculeLe) < Date.parse(reel ?? `${m.date}T00:00:00+02:00`), `${m.matchKey} : calculée avant la borne`);
        }
        assert.equal(m.ligne.graine, graineDuMatch({ cle: m.cle, role: m.ligne.role, lambda: m.ligne.lambda, mu: m.ligne.mu, rho: m.ligne.rho, version: m.ligne.version }), `${m.matchKey} : graine refaite`);
        assert.equal(m.ligne.grille, ch.d.modele.grille);
      }
    } finally {
      db.close();
    }
    const par = Object.fromEntries(matchs.map((m) => [m.matchKey, m]));
    assert.equal(par['banc-102'].ligne.calculeLe, '2026-09-26T03:00:00.000Z', 'B : la ligne de 3 h, jamais celle de 14 h (après le coup d’envoi réel de 12 h)');
    assert.deepEqual([par['banc-100'].resultat.hg90, par['banc-100'].resultat.ag90, par['banc-100'].resultat.prolongation], [1, 1, true], 'P : le prolongé au score de la 90e (2-1 à la 120e)');
    assert.deepEqual(par['banc-100'].resultat.buts, [[29, 0], [70, 1]]);
    assert.ok(par['banc-105'], 'M2 : sans meta.kickoff, la ligne d’avant minuit de Paris est gardée');
    assert.equal(par['banc-105'].kickoff, null);
    assert.deepEqual(par['banc-105'].resultat.rouges, [[70, 1]], 'un rouge « not_on_pitch » compté comme un rouge (R36 point 7)');
    assert.deepEqual(entete.rougesHorsTerrain.rouges, 1);
    if (colonne === 'adoptee') {
      assert.deepEqual([par['banc-0109'].ligne.role, par['banc-0109'].ligne.candidateHash], ['candidate', EMPREINTE], 'R1 point 2 : la candidate de l’empreinte adoptée, faute de service');
      assert.equal(par['banc-0110'], undefined, 'jamais la candidate d’une autre empreinte');
    }
    // Les comptes de R19 point 4.
    const cj = lireJson(ch.comptes2.sortie);
    assert.equal(cj.comptes.partHeureInconnue, 0);
    assert.ok(cj.comptes.ageAuCoupDEnvoiH.mesures === matchs.length - 1 && cj.comptes.ageAuCoupDEnvoiH.mediane > 0, 'l’âge de la ligne au coup d’envoi (sauf le match sans meta.kickoff)');
  }
});

test('R19 l’export (2) : une ligne calculée entre le coup d’envoi réel (avancé) et l’heure notée la nuit est exclue et nommée ; une graine fausse aussi ; les autres exclus comptés par raison', async () => {
  for (const colonne of D.COLONNES) {
    const ch = await chaineDe(colonne);
    const [entete, ...matchs] = lignesDExport(ch.export2.sortie);
    const cles = new Set(matchs.map((m) => m.matchKey));
    for (const k of ['banc-101', 'banc-103', 'banc-104', 'banc-106', 'banc-107', 'banc-108']) assert.equal(cles.has(k), false, `${colonne} : ${k} exclu`);
    assert.deepEqual(entete.nommes.calculeeApresLeCoupDEnvoi.sort(), ['banc-101', 'banc-104', 'banc-106'], 'A (avancé), M1 (après minuit de Paris), X (après le coup d’envoi) nommés');
    assert.equal(entete.nommes.graine.length, 1);
    assert.match(entete.nommes.graine[0], /^fotmob:fotmob-3206\|fotmob-3207\|2026-09-27 \(service, 2026-09-27T03:00:00\.000Z\)$/);
    assert.deepEqual(
      { calculeeApresLeCoupDEnvoi: entete.exclus.calculeeApresLeCoupDEnvoi, graine: entete.exclus.graine, sansRemplacement: entete.exclus.sansRemplacement, chronologieIncomplete: entete.exclus.chronologieIncomplete },
      { calculeeApresLeCoupDEnvoi: 3, graine: 1, sansRemplacement: 1, chronologieIncomplete: 1 }
    );
    if (colonne === 'adoptee') assert.equal(entete.exclus.sansLigneAvantLeCoupDEnvoi, 1, 'la candidate d’une autre empreinte');
    assert.equal(entete.rencontresLues, matchs.length + Object.values(entete.exclus).reduce((s, n) => s + n, 0), 'chaque rencontre lue est exportée ou exclue pour une raison');
  }
});

// ------------------------------------------------------------ R20

test('R20 l’étalonnage, étage 1 (--comptes, aucune issue) : une ligne fausse → écart, code 3, et le regard refuse ; les états fabriqués comptés sans refus', async () => {
  const ch = await chaineDe('non-adoptee');
  const { banc } = ch;
  const matchs = BF.matchsFabriques(7, { prefixe: 'e1' });
  matchs[3].ligne.lambda = 40;
  const f = path.join(banc, 'export-e1.jsonl');
  fs.writeFileSync(f, BF.texteDExport({ colonne: 'non-adoptee', grille: 'ancien-81', matchs, sceau: ch.sceller.sceau }));
  const r = lancer(ch, ['--comptes', '--export', f, '--sha1-export', sha1(f), '--sortie', path.join(banc, 'comptes-e1.json')]);
  assert.equal(r.code, 3, r.erreurs.slice(-800));
  assert.deepEqual([r.json.ok, r.json.etalonnage], [false, false]);
  assert.ok(r.json.ecarts.length > 0 && r.json.ecarts.every((e) => e.startsWith(matchs[3].cle)), r.json.ecarts.join(' | '));
  assert.match(r.erreurs, /EN ÉCART/);
  refuse(lancer(ch, ['--banc', '--k', '7', '--regles', ch.p.regles, '--libelles-json', ch.p.libelles, '--export', f, '--sha1-export', sha1(f), '--comptes-json', path.join(banc, 'comptes-e1.json'), '--passe', ch.p.passe, '--verrou', path.join(banc, 've1.json'), '--sortie', path.join(banc, 'se1.json')], { env: ESSAI }), /étalonnage de l’étage 1 en écart/, 'le regard après un étage 1 en écart');
  assert.equal(fs.existsSync(path.join(banc, 've1.json')), false);
  // Pur : les vraies lignes passent ; aux états fabriqués 9-0, 4-4, 12-1 les masses au plafond sont COMPTÉES, jamais un écart.
  const d = D.declarationDe('non-adoptee');
  const ok = B.etalonnageEtage1([{ ...matchs[0], ligne: { ...matchs[0].ligne, lambda: 3.2, mu: 1.4 } }], d);
  assert.deepEqual([ok.ok, ok.nEcarts, ok.lignes, ok.lectures], [true, 0, 1, 16 * d.K]);
  assert.ok(ok.massesAuPlafond.n > 0 && /12-1/.test(ok.massesAuPlafond.pire.ou), JSON.stringify(ok.massesAuPlafond));
});

test('R20 l’étalonnage, étage 2 (sous verrou) : un état réel hors de F1 arrête le passage — rien n’est jugé, aucune note ; la relance passe par --rejouer-apres-correction et le dit', async () => {
  const ch = await chaineDe('non-adoptee');
  const { banc } = ch;
  const matchs = BF.matchsFabriques(7, { prefixe: 'e2' });
  // 12 buts du club qui reçoit avant la 45e, pour une ligne à λ = 4,5 : la masse plafonnée de l'état réel (12-0) dépasse F1.
  matchs[2].ligne.lambda = 4.5;
  matchs[2].resultat = { hg90: 12, ag90: 0, buts: Array.from({ length: 12 }, (_, i) => [1 + i, 0]), rouges: [], prolongation: false, ajouts: { 45: [], 91: [] } };
  const f = path.join(banc, 'export-e2.jsonl');
  fs.writeFileSync(f, BF.texteDExport({ colonne: 'non-adoptee', grille: 'ancien-81', matchs, sceau: ch.sceller.sceau }));
  const c = reussit(lancer(ch, ['--comptes', '--export', f, '--sha1-export', sha1(f), '--sortie', path.join(banc, 'comptes-e2.json')]), 'étage 1 tenu');
  const args = ['--banc', '--k', '7', '--regles', ch.p.regles, '--libelles-json', ch.p.libelles, '--export', f, '--sha1-export', sha1(f), '--comptes-json', c.sortie, '--passe', ch.p.passe, '--verrou', path.join(banc, 've2.json')];
  const r = lancer(ch, [...args, '--sortie', path.join(banc, 'se2.json')], { env: ESSAI });
  assert.equal(r.code, 3, r.erreurs.slice(-800));
  assert.deepEqual([r.json.ok, r.json.arret], [false, 'etalonnage']);
  assert.ok(r.json.ecarts.some((e) => e.startsWith(`${matchs[2].cle}, créneau 45 (12-0`)), r.json.ecarts.join(' | '));
  // C11 : 1 match hors de F1 sur 7, c'est au-delà de 1 % des matchs du passage : un problème systématique, rien n'est jugé.
  assert.match(r.json.ecarts[0], /^1 match hors de F1 sur 7 \(au-delà de 1 % des matchs du passage ou de 20 matchs\)/);
  const s = lireJson(path.join(banc, 'se2.json'));
  assert.deepEqual([s.arret, s.banc, s.etalonnage.ok], [true, null, false]);
  assert.deepEqual([s.etalonnage.horsF1.n, s.etalonnage.horsF1.tolere, s.etalonnage.horsF1.matchs[0].cle], [1, false, matchs[2].cle]);
  refuse(lancer(ch, ['--recopier', path.join(banc, 'se2.json')]), /s’est arrêté à l’étalonnage : aucune note/, 'aucune note après un arrêt');
  // La relance : refusée sans raison ; avec sa raison, elle repasse (toujours en écart ici) et le dit, sans verdict.
  refuse(lancer(ch, [...args, '--sortie', path.join(banc, 'se2b.json')], { env: ESSAI }), /DÉJÀ été passé/, 'relance sans raison');
  const r2 = lancer(ch, [...args, '--sortie', path.join(banc, 'se2c.json'), '--rejouer-apres-correction', 'lecture corrigée (essai)'], { env: ESSAI });
  assert.equal(r2.code, 3);
  const s2 = lireJson(path.join(banc, 'se2c.json'));
  assert.deepEqual([s2.rejeu.raison, s2.rejeu.verdictPrecedent, s2.rejeu.etalonnagePrecedent.ok, s2.banc], ['lecture corrigée (essai)', null, false, null]);
});

// ------------------------------------------------------------ R21

test('R21 F1 sur tous les états (le pire nommé) ; le filet de R22 point 2 (variante non critique : écartée des deux côtés ; critique : « F1 non tenu ») ; le banc aux coupes de la conception', () => {
  assert.deepEqual([COUPES.banc.seuilEtat, COUPES.banc.epsLoi, D.SEUILS.f1], [1e-12, 1e-11, 1e-5], 'le banc aux coupes de la conception ; F1 = 1e-5');
  const ids = ['direct-v1', 'temps-restant', 'direct-sans-effets'];
  const rejeux = rejeuxSynthetiques(3, { ids, lecture: (id, m, e) => lectureFabriquee([0.5, 0.3, 0.2], 0.5, e, { masse: id === 'direct-sans-effets' && m === 1 ? 2e-5 : 1e-9 }), issue: () => ({ hg: 1, ag: 0 }) });
  const f1 = B.exactitudeF1(rejeux);
  assert.deepEqual([f1.tenu, f1.seuil, f1.pire.masse, f1.pire.ou], [false, 1e-5, 2e-5, 's1, créneau 0 (0-0, rouges 0-0), direct-sans-effets']);
  assert.equal(B.exactitudeF1(rejeuxSynthetiques(3, { ids, lecture: (id, m, e) => lectureFabriquee([0.5, 0.3, 0.2], 0.5, e, { masse: 9e-6 }), issue: () => ({ hg: 1, ag: 0 }) })).tenu, true);
  // Le filet : une lecture invalide d'une variante NON critique → la ligne écartée des deux côtés, comptée, nommée.
  const filet = rejeuxSynthetiques(4, { ids, lecture: (id, m, e) => lectureFabriquee([0.5, 0.3, 0.2], 0.5, e, m === 2 && id === 'direct-sans-effets' ? { valide: false, pourquoi: 'lecture non finie ou hors de [0 ; 1]' } : {}), issue: () => ({ hg: 1, ag: 0 }) });
  const nc = B.lignesDuJuge(filet, { a: 'direct-sans-effets', b: 'direct-v1', sur: '1n2' }, { critiques: ['direct-v1', 'temps-restant'] });
  assert.deepEqual([nc.lignes.length, nc.filet.ecartees, nc.f1NonTenu.length], [3, 1, 0]);
  assert.match(nc.filet.nommees[0], /^s2, créneau 0, direct-sans-effets : lecture non finie/);
  // D'une variante CRITIQUE : comptée, nommée, et « F1 non tenu ».
  const critique = rejeuxSynthetiques(4, { ids, lecture: (id, m, e) => lectureFabriquee([0.5, 0.3, 0.2], 0.5, e, m === 0 && id === 'direct-v1' ? { valide: false, pourquoi: 'masse négligée au-delà de 1e-4' } : {}), issue: () => ({ hg: 1, ag: 0 }) });
  const cr = B.lignesDuJuge(critique, { a: 'temps-restant', b: 'direct-v1', sur: '1n2' }, { critiques: ['direct-v1', 'temps-restant'] });
  assert.deepEqual([cr.filet.ecartees, cr.f1NonTenu.length], [1, 1]);
  const t = B.tableDuVerdict({ regard: 'preuve', f1: { tenu: true, pire: { masse: 0, ou: null } }, f1NonTenu: cr.f1NonTenu, principal: { verdict: 'retenu' }, jugements: [], tranches: [], paires: { ecartees: [] }, declaration: D.declarationDe('non-adoptee'), n: 4 });
  assert.deepEqual([t.verdict, t.pourquoi], ['faits-seuls', 'f1']);
});

// ------------------------------------------------------------ O9, O12

const T0 = Date.parse('2026-11-14T20:34:40.000Z');
function suiviA34(id, homeId, awayId) {
  const kickoff = new Date(T0 - 34 * 60_000).toISOString();
  const liste = F.listeEnJeu({ id, homeId, awayId, kickoff, label: `34${APO}`, maxTime: 45 });
  return F.matchSuivi({ id, homeId, awayId, kickoff, rang: 3, memoire: true, lectures: [{ t: T0 - 20_000, liste }] });
}
async function tableau(note, lignes = {}) {
  L.viderLesTables();
  const em = F.etatMinute({ maintenant: T0, matchs: [suiviA34(5201, 'fotmob-1301', 'fotmob-1302'), suiviA34(5202, 'fotmob-1303', 'fotmob-1304'), suiviA34(5203, 'fotmob-1305', 'fotmob-1306')] });
  const ligneDe = (q) => F.ligneFabriquee({ ...q, ...(lignes[q.homeId] ?? {}) });
  return L.tableauDuDirect({ maintenant: T0, database: F.baseDuDirect(), ...(note === undefined ? {} : { note }), ...F.sourcesActives(em), ligneDe });
}

test('O9 la note recopiée par le banc ne s’applique qu’aux lignes de SA grille et de SA version du moteur (lectureDuDirect), dans les deux colonnes ; l’export et la note portent le modèle', async () => {
  for (const colonne of D.COLONNES) {
    const ch = await chaineDe(colonne);
    const n = ch.note;
    assert.deepEqual([n.modele, n.version, n.role, n.regard, n.scellement.colonne, n.k, n.t], [ch.d.modele.grille, VERSION_DE[colonne], 'service', 'preuve', colonne, ch.d.K, 14]);
    assert.equal(n.variante, lireJson(path.join(ch.banc, 'sortie-preuve.json')).banc.affichee);
    const s = lireJson(path.join(ch.banc, 'sortie-preuve.json'));
    assert.deepEqual([s.modele.grille, s.modele.engineVersion], [ch.d.modele.grille, VERSION_DE[colonne]]);
    const autreGrille = colonne === 'adoptee' ? 'ancien-81' : 'modele-buts-441';
    const lignes = {
      'fotmob-1301': { grille: n.modele, engineVersion: n.version },
      'fotmob-1303': { grille: autreGrille, engineVersion: n.version },
      'fotmob-1305': { grille: n.modele, engineVersion: n.version + 1 }
    };
    const r = await tableau(n, lignes);
    const par = Object.fromEntries(r.matchs.map((e) => [e.fotmobId, e.calcul.note]));
    assert.deepEqual([r.note.etat, r.note.modele, r.note.version], ['juge', n.modele, n.version]);
    assert.deepEqual([par['5201'].applique, par['5201'].verdict], [true, n.verdict], `${colonne} : même grille, même version`);
    assert.deepEqual([par['5202'].applique, par['5202'].raison], [false, 'pas-juge-pour-cette-version'], `${colonne} : autre grille`);
    assert.deepEqual([par['5203'].applique, par['5203'].raison], [false, 'pas-juge-pour-cette-version'], `${colonne} : autre version`);
  }
});

test('O12 la note nulle : noteDuDirect.js présent à null (ou absent) rend EXACTEMENT les réponses d’aujourd’hui (aucune note), aucun pourcentage montré', async () => {
  // La note nulle (celle qu'écrit --note-nulle) : aucune note, tout à blanc.
  // Les durées mesurées (`ms`, `blocMaxMs`) changent d'un appel à l'autre : elles seules sont retirées de la comparaison.
  const sansDurees = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'ms' || k === 'blocMaxMs' ? undefined : v)));
  const nulle = sansDurees(await tableau(null));
  assert.deepEqual(nulle.note, { etat: 'non-juge', raison: 'sans-note' });
  for (const e of nulle.matchs) assert.deepEqual([e.calcul.aBlanc, e.calcul.note.applique, e.calcul.note.raison], [true, false, 'sans-note']);
  // La note du CODE (le fichier noteDuDirect.js) : absente, ou à null (avant la recopie de dimanche, ou éteinte par
  // --note-nulle), elle rend EXACTEMENT ces réponses ; recopiée, T-B9 la refait à l'octet depuis sa fixture.
  const f = path.join(SERVEUR, 'src', 'data', 'direct', 'noteDuDirect.js');
  const duCode = fs.existsSync(f) ? (await import(pathToFileURL(f).href)).NOTE_DU_DIRECT : null;
  if (duCode === null) assert.deepEqual(sansDurees(await tableau(undefined)), nulle, 'la note du fichier (null ou absente) et la note nulle : les mêmes réponses, hors durées mesurées');
  L.viderLesTables();
  // Mineur du 13/11 soir (sûreté 6) : le chemin « note ABSENTE » exécuté, quel que soit l'état du fichier du bac — une copie
  // du code, les trois routes appelées comme par le contrôleur (script-note-absente.mjs), noteDuDirect.js présent à null
  // puis RETIRÉ de la copie : les mêmes réponses à l'octet, hors durées mesurées ; « sans-note » et à blanc partout.
  if (duCode === null) {
    const copie = preparerCopie({ base: false });
    try {
      const script = path.join(SERVEUR, 'test', 'aides', 'script-note-absente.mjs');
      const presente = executer(copie, script);
      fs.rmSync(path.join(copie.serveur, 'src', 'data', 'direct', 'noteDuDirect.js'));
      const absente = executer(copie, script);
      for (const r of [presente, absente]) assert.ok(r.code === 0 && r.json && !r.reseau, `${r.code} ${r.erreurs.slice(-600)}`);
      assert.deepEqual([presente.json.noteDuFichier, absente.json.noteDuFichier], ['presente', 'absente']);
      const { noteDuFichier: p0, ...rp } = presente.json;
      const { noteDuFichier: a0, ...ra } = absente.json;
      assert.deepEqual(ra, rp, 'note absente et note à null : les mêmes réponses des trois routes');
      assert.deepEqual(ra.tableau.note, { etat: 'non-juge', raison: 'sans-note' });
      assert.deepEqual(ra.tableau.matchs.map((e) => [e.calcul.aBlanc, e.calcul.note.raison, e.calcul.un2]), ra.tableau.matchs.map(() => [true, 'sans-note', null]));
      assert.deepEqual(Object.values(ra.details).map((d) => [d.suivi, d.note.etat, d.match.calcul.aBlanc]), [[true, 'non-juge', true], [true, 'non-juge', true], [true, 'non-juge', true]]);
      assert.equal(ra.enCours.matchs.length, 3);
    } finally {
      copie.nettoyer();
    }
  }
});

// ------------------------------------------------------------ R36 et les refus neufs

test('R36 point 2 : la passe de Pierre relue toutes les 50 rencontres pendant le rejeu (rejouer appelle auFil à 50, 100…)', () => {
  const d = { variantes: [{ id: 'temps-restant' }], creneaux: [0] };
  const matchs = Array.from({ length: 120 }, (_, i) => ({ cle: `p${i}`, date: '2026-10-01', ligne: { lambda: 1.3, mu: 1.1, rho: 0, grille: 'ancien-81', fair: null }, resultat: { hg90: 0, ag90: 0, buts: [], rouges: [] } }));
  const appels = [];
  B.rejouer(matchs, d, { auFil: (i) => appels.push(i) });
  assert.deepEqual(appels, [50, 100]);
});

test('Refus « colonne non fixée » : tant que --fixer-colonne n’est pas passé, les six modes qui dépendent de la colonne refusent, rien n’est écrit', () => {
  const c = nouvelleCopie();
  const avant = inventaire(c.copie.dossier);
  for (const mode of ['--sceller', '--exporter', '--comptes', '--banc', '--preuve', '--recopier']) refuse(lancer(c, [mode]), /^colonne non fixée : la colonne de O10/, mode);
  assert.deepEqual(inventaire(c.copie.dossier), avant, 'aucun fichier écrit par un refus');
});

test('Refus « grilles mêlées » : --banc et --preuve refusent un export qui mêle deux grilles (O9), avant tout verrou', async () => {
  const ch = await chaineDe('non-adoptee');
  const matchs = BF.matchsFabriques(8, { prefixe: 'gm' });
  matchs[5].ligne.grille = 'modele-buts-441';
  const f = path.join(ch.banc, 'export-mele.jsonl');
  fs.writeFileSync(f, BF.texteDExport({ colonne: 'non-adoptee', grille: 'ancien-81', matchs, sceau: ch.sceller.sceau }));
  const k = ['--k', '7', '--regles', ch.p.regles, '--libelles-json', ch.p.libelles, '--export', f, '--sha1-export', sha1(f), '--comptes-json', ch.comptes1.sortie, '--passe', ch.p.passe];
  refuse(lancer(ch, ['--banc', ...k, '--verrou', path.join(ch.banc, 'vgm.json'), '--sortie', path.join(ch.banc, 'sgm.json')], { env: ESSAI }), /grilles mêlées : l’export mêle « ancien-81 » et « modele-buts-441 »/, '--banc');
  refuse(lancer(ch, ['--preuve', ...k, '--avenant', ch.avenant, '--sans-surete', '--verrou', path.join(ch.banc, 'vgm2.json'), '--sortie', path.join(ch.banc, 'sgm2.json')], { env: ESSAI }), /grilles mêlées/, '--preuve');
  assert.equal(fs.existsSync(path.join(ch.banc, 'vgm.json')) || fs.existsSync(path.join(ch.banc, 'vgm2.json')), false);
  // Une seule grille, mais pas celle de la colonne ; deux versions du moteur mêlées.
  const autre = BF.matchsFabriques(8, { prefixe: 'ag', grille: 'modele-buts-441' });
  const c1 = B.controlerLExport({ colonne: 'non-adoptee', scellement: { sha1: 's' }, principal28: {} }, autre, D.declarationDe('non-adoptee'), { scellementSha1: 's' });
  assert.match(c1.refus.join(' | '), /la colonne juge « ancien-81 » \(O9\)/);
  const versions = BF.matchsFabriques(8, { prefixe: 'vm' });
  versions[0].ligne.engineVersion = 6;
  assert.match(B.controlerLExport({ colonne: 'non-adoptee', scellement: { sha1: 's' }, principal28: {} }, versions, D.declarationDe('non-adoptee'), { scellementSha1: 's' }).refus.join(' | '), /versions du moteur mêlées/);
});

test('Refus « principal de la 28 pas rendu » : l’en-tête de l’export porte simulation_state.principal ; sans lui, --banc et --preuve refusent (R36 point 9)', async () => {
  const ch = await chaineDe('non-adoptee');
  const base = BF.magasinDuBanc(path.join(ch.copie.dossier, 'base', 'sans-principal.db'), { rencontres: ch.rencontres, principal: null });
  const e = lancer(ch, ['--exporter', '--base', base, '--au', DATE_DU_REGISTRE, '--passe', ch.p.passe, '--sortie', path.join(ch.banc, 'export-sans-principal.jsonl')]);
  const j = reussit(e, 'export sans principal');
  assert.equal(j.principal28, false);
  assert.match(e.erreurs, /principal de la 28 PAS RENDU \(le banc refusera\)/);
  assert.equal(lignesDExport(j.sortie)[0].principal28, null);
  const c = reussit(lancer(ch, ['--comptes', '--export', j.sortie, '--sha1-export', j.sha1, '--sortie', path.join(ch.banc, 'comptes-sans-principal.json')]), 'comptes');
  const k = ['--k', '7', '--regles', ch.p.regles, '--libelles-json', ch.p.libelles, '--export', j.sortie, '--sha1-export', j.sha1, '--comptes-json', c.sortie, '--passe', ch.p.passe];
  refuse(lancer(ch, ['--preuve', ...k, '--avenant', BF.avenantDe(path.join(ch.banc, 'avenant-sp.md'), { sha1Export: j.sha1, au: DATE_DU_REGISTRE }), '--sans-surete', '--verrou', path.join(ch.banc, 'vsp.json'), '--sortie', path.join(ch.banc, 'ssp.json')], { env: ESSAI }), /le principal de la 28 n’est pas rendu/, '--preuve');
  refuse(lancer(ch, ['--banc', ...k, '--verrou', path.join(ch.banc, 'vsp2.json'), '--sortie', path.join(ch.banc, 'ssp2.json')], { env: { ...ESSAI, CM_ESSAI_T: '40' } }), /le principal de la 28 n’est pas rendu/, '--banc');
});

// ------------------------------------------------------------ les correctifs du banc (13/11) : C1 à C12

/**
 * Le script HORS d'une copie d'essai (C4, C5) : CM_TEST_DOSSIER (que la garde exige, la base dedans) pointé sur un dossier
 * ÉTRANGER à la copie ; le faux dossier personnel reste celui de la copie : le code s'y reconnaît dans le bac (son banc46\
 * est <copie>\banc46), mais ce n'est plus une copie d'essai (C5) : ni réglages d'essai, ni chemin de verrou libre.
 */
function lancerHorsEssai(c, args, { env = {} } = {}) {
  const etranger = path.join(c.copie.maison, 'dossier-etranger');
  fs.mkdirSync(etranger, { recursive: true });
  const r = executerDansLeBac({ ...c.copie, dossier: etranger, base: path.join(etranger, 'base', 'match-stats.db') }, c.script, { args, env, timeout: 300_000 });
  assert.equal(r.reseau, false, 'aucun appel réseau');
  return r;
}
/**
 * La fermeture des imports relatifs (statiques, dynamiques à chaîne fixe, réexports) depuis des racines ; commentaires retirés.
 * `statique: true` (K11, 13/11 soir) : les seuls imports chargés au DÉMARRAGE (import … from, import '…', export … from), sans import().
 */
function fermetureDesImports(racines, { statique = false } = {}) {
  const motif = statique
    ? /(?:import\s[^'"()]*?from\s*|import\s*(?=['"])|export\s[^'"()]*?from\s*)['"](\.{1,2}\/[^'"]+)['"]/g
    : /(?:import\s[^'"]*?from\s*|import\s*\(\s*|export\s[^'"]*?from\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
  const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const vus = new Set();
  const pile = racines.map((r) => path.resolve(SERVEUR, r));
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f)) continue;
    vus.add(f);
    for (const m of sansCommentaires(fs.readFileSync(f, 'utf8')).matchAll(motif)) pile.push(path.resolve(path.dirname(f), m[1]));
  }
  return [...vus].map((f) => path.relative(SERVEUR, f).split(path.sep).join('/')).sort();
}
const PHRASE_C4 = 'regard de preuve seul alors qu’un regard de sûreté a été pris : identité des lignes non vérifiée';

test('C1 (13/11) les candidates de l’empreinte adoptée à la forme RÉELLE (sans version du moteur) : l’export mêlé passe, la note porte la version 6 des lignes « service » et ne s’applique qu’à elles ; des candidates seules sont refusées avant le verrou ; une candidate d’une autre empreinte n’est jamais comptée', async () => {
  const ch = await chaineDe('adoptee');
  const [entete, ...matchs] = lignesDExport(ch.export2.sortie);
  // 1. L'export mêlé : la candidate de l'empreinte (sans version) et les lignes « service » 441 v6 ; le banc passe.
  const cand = matchs.filter((m) => m.ligne.role === 'candidate');
  assert.deepEqual(cand.map((m) => [m.ligne.engineVersion, m.ligne.candidateHash]), [[null, EMPREINTE]], 'une candidate de l’empreinte, sans version');
  assert.ok(matchs.filter((m) => m.ligne.role === 'service').every((m) => m.ligne.engineVersion === 6));
  assert.deepEqual(B.controlerLExport(entete, matchs, ch.d, { scellementSha1: ch.sceller.sceau }).refus, [], 'l’export mêlé passe le contrôle');
  for (const f of ['sortie-surete.json', 'sortie-preuve.json']) assert.equal(lireJson(path.join(ch.banc, f)).modele.engineVersion, 6, f);
  assert.deepEqual([ch.note.modele, ch.note.version, ch.note.role, ch.note.candidateHash], ['modele-buts-441', 6, 'service', null], 'la note : version 6, rôle service');
  // 2. La note ne s'applique qu'aux lignes « service 441 v6 » : ni à une candidate (sans version), ni à une autre grille.
  const r = await tableau(ch.note, {
    'fotmob-1301': { grille: 'modele-buts-441', engineVersion: 6 },
    'fotmob-1303': { grille: 'modele-buts-441', engineVersion: null, candidateHash: EMPREINTE },
    'fotmob-1305': { grille: 'ancien-81', engineVersion: 6 }
  });
  const par = Object.fromEntries(r.matchs.map((e) => [e.fotmobId, e.calcul.note]));
  assert.deepEqual([r.note.etat, par['5201'].applique, par['5202'].applique, par['5202'].raison, par['5203'].applique, par['5203'].raison], ['juge', true, false, 'pas-juge-pour-cette-version', false, 'pas-juge-pour-cette-version']);
  L.viderLesTables();
  // 3. Des candidates seules (un export d'avant l'adoption) : « version du moteur inconnue », AVANT tout verrou.
  const seules = BF.matchsFabriques(8, { prefixe: 'cs', grille: 'modele-buts-441', role: 'candidate', candidateHash: EMPREINTE, engineVersion: null });
  assert.match(B.controlerLExport(entete, seules, ch.d, { scellementSha1: ch.sceller.sceau }).refus.join(' | '), /version du moteur inconnue/);
  const f = path.join(ch.banc, 'export-candidates-seules.jsonl');
  fs.writeFileSync(f, BF.texteDExport({ colonne: 'adoptee', grille: 'modele-buts-441', matchs: seules, sceau: ch.sceller.sceau }));
  const k = ['--k', '5', '--regles', ch.p.regles, '--libelles-json', ch.p.libelles, '--export', f, '--sha1-export', sha1(f), '--comptes-json', ch.comptes1.sortie, '--passe', ch.p.passe];
  refuse(lancer(ch, ['--banc', ...k, '--verrou', path.join(ch.banc, 'v-c1.json'), '--sortie', path.join(ch.banc, 's-c1.json')], { env: ESSAI }), /version du moteur inconnue \(aucune ligne « service » numérotée/, '--banc, candidates seules');
  refuse(lancer(ch, ['--preuve', ...k, '--avenant', BF.avenantDe(path.join(ch.banc, 'avenant-c1.md'), { sha1Export: sha1(f), au: DATE_DU_REGISTRE }), '--sans-surete', '--verrou', path.join(ch.banc, 'v-c1b.json'), '--sortie', path.join(ch.banc, 's-c1b.json')], { env: ESSAI }), /version du moteur inconnue/, '--preuve, candidates seules');
  assert.deepEqual([fs.existsSync(path.join(ch.banc, 'v-c1.json')), fs.existsSync(path.join(ch.banc, 'v-c1b.json'))], [false, false], 'aucun verrou posé');
  // 4. Une candidate d'une AUTRE empreinte : jamais exportée (R19), refusée si elle se glissait dans un export, jamais comptée.
  assert.equal(matchs.some((m) => m.ligne.candidateHash === 'ffffffffffffffff'), false, 'jamais exportée');
  const glissee = [...matchs, { ...cand[0], matchKey: 'autre-empreinte', ligne: { ...cand[0].ligne, candidateHash: 'ffffffffffffffff' } }];
  const c = B.controlerLExport(entete, glissee, ch.d, { scellementSha1: ch.sceller.sceau });
  assert.match(c.refus.join(' | '), /1 ligne « candidate » d’une autre empreinte que l’adoptée \(f01dd8496f56a415\) : jamais jugée/);
  assert.deepEqual(c.versions, ['6'], 'jamais comptée dans les versions');
});

test('C2 (13/11) le sceau couvre toute la fermeture des imports des quatre modules qui calculent : 24 modules (K3), dont sept de core/ seulement listés ; hors du sceau, seulement bench/trialsRegistry.js, bench/lancements.js, roadmap/plan.js et utils/atomicJson.js ; état, mémoire, libellé et entrées du direct descellés', async () => {
  const ch = await chaineDe('non-adoptee');
  assert.equal(ch.sceller.modules, 24);
  const scelles = Object.keys(lireJson(path.join(ch.banc, 'sortie-preuve.json')).scellement.modules).sort();
  assert.equal(scelles.length, 24);
  // Correctif R8 du 13/11 après-midi (constat 8 du rebanc) : les chemins EXACTS du PROJET § 13, écrits en toutes lettres
  // — le compte seul laissait échanger un module scellé hors de la fermeture contre un autre (calibration.js ↔ lectureDuDirect.js).
  // Correctif K3 du 13/11 fin d'après-midi (constat 3 du calcul, option b) : 28 → 24 — etatDuDirect.js, memoireDuDirect.js,
  // libelleDuDirect.js et entreesDuDirect.js sortent du sceau (le banc ne les importe pas : ils ne calculent aucun chiffre jugé).
  const LES_24 = [
    'src/data/direct/reglagesDirect.js',
    'src/data/direct/calculDuDirect.js',
    'src/data/direct/rejeuDuDirect.js',
    'src/data/direct/bancDuDirect.js',
    'src/data/direct/declarationDuDirect.js',
    'scripts/etape46.mjs',
    'src/data/simulation/reglages.js',
    'src/data/simulation/simulationMatch.js',
    'src/data/simulation/entreesSimulation.js',
    'src/data/simulation/simulationNuit.js',
    'src/data/simulation/simulationMatchsEnfant.js',
    'src/data/simulation/simulationRead.js',
    'src/data/simulation/etatSimulation.js',
    'src/data/calibration.js',
    'src/data/db/dayTable.js',
    'src/bench/guard.js',
    'src/bench/metrics.js',
    'src/core/model/poisson.js',
    'src/core/model/dixonColes.js',
    'src/core/engine/goalModel.js',
    'src/core/engine/scorePrediction.js',
    'src/core/engine/noteDuModeleDeButs.js',
    'src/core/engine/motsDuModeleDeButs.js',
    'src/core/market/marginRemoval.js'
  ];
  assert.equal(new Set(LES_24).size, 24);
  assert.deepEqual(scelles, LES_24.sort(), 'les 24 modules scellés sont ceux du PROJET § 13, un par un');
  for (const m of ['src/core/model/poisson.js', 'src/core/model/dixonColes.js', 'src/core/engine/goalModel.js', 'src/core/engine/scorePrediction.js', 'src/core/market/marginRemoval.js', 'src/core/engine/noteDuModeleDeButs.js', 'src/core/engine/motsDuModeleDeButs.js']) assert.ok(scelles.includes(m), `${m} scellé`);
  const fermeture = fermetureDesImports(['src/data/direct/bancDuDirect.js', 'src/data/direct/rejeuDuDirect.js', 'src/data/direct/calculDuDirect.js', 'src/data/direct/declarationDuDirect.js']);
  assert.ok(fermeture.length >= 22, `la fermeture (${fermeture.length} modules)`);
  assert.deepEqual(fermeture.filter((m) => !scelles.includes(m)), ['src/bench/lancements.js', 'src/bench/trialsRegistry.js', 'src/data/roadmap/plan.js', 'src/utils/atomicJson.js'], 'tout module de la fermeture est scellé, sauf les quatre');
  // K3 : les quatre descellés ne sont ni scellés, ni dans la fermeture des modules qui calculent (le banc ne les importe pas).
  for (const m of ['src/data/direct/etatDuDirect.js', 'src/data/direct/memoireDuDirect.js', 'src/data/direct/libelleDuDirect.js', 'src/data/direct/entreesDuDirect.js']) {
    assert.equal(scelles.includes(m), false, `${m} n’est plus scellé (K3)`);
    assert.equal(fermeture.includes(m), false, `${m} hors de la fermeture des modules qui calculent`);
  }
});

test('C3 (13/11) une ligne « service » sans version du moteur est exclue à l’export, comptée (sansVersionDuMoteur) et nommée ; le reste de l’export passe', async () => {
  const ch = await chaineDe('non-adoptee');
  const rencontres = ch.rencontres.map((r) => (r.matchKey === 'banc-0001' ? { ...r, lignes: r.lignes.map((l) => ({ ...l, engineVersion: null })) } : r));
  const base = BF.magasinDuBanc(path.join(ch.copie.dossier, 'base', 'banc-c3.db'), { rencontres });
  const e = reussit(lancer(ch, ['--exporter', '--base', base, '--au', '2026-09-30', '--passe', ch.p.passe, '--sortie', path.join(ch.banc, 'export-c3.jsonl')]), 'export C3');
  const [entete, ...matchs] = lignesDExport(e.sortie);
  assert.deepEqual([entete.exclus.sansVersionDuMoteur, entete.nommes.sansVersionDuMoteur.length], [1, 1]);
  assert.match(entete.nommes.sansVersionDuMoteur[0], /^fotmob:fotmob-3002\|fotmob-3003\|2026-09-25 \(service, /);
  assert.equal(matchs.some((m) => m.matchKey === 'banc-0001'), false);
  assert.equal(matchs.length, ch.export1.matchs - 1);
  assert.deepEqual(entete.modele.engineVersions, { 5: matchs.length });
  assert.equal(entete.rencontresLues, matchs.length + Object.values(entete.exclus).reduce((s, n) => s + n, 0));
  const c = reussit(lancer(ch, ['--comptes', '--export', e.sortie, '--sha1-export', e.sha1, '--sortie', path.join(ch.banc, 'comptes-c3.json')]), 'comptes C3');
  assert.deepEqual(lireJson(c.sortie).controle.refus, []);
  const s = reussit(lancer(ch, ['--banc', ...communs(ch, e, c), '--verrou', path.join(ch.banc, 'v-c3.json'), '--sortie', path.join(ch.banc, 's-c3.json')], { env: ESSAI }), 'banc C3');
  assert.equal(lireJson(s.sortie).export.exclus.sansVersionDuMoteur, 1);
});

test('C4 (13/11) un seul regard de chaque nom : hors d’une copie d’essai, le verrou n’est que banc46 verrou-<regard>.json, contrôlé avant tout le reste ; un rejeu sur un AUTRE export est refusé sans --autre-export, et noté ; --preuve --sans-surete alors qu’un regard de sûreté a été pris : dit dans la sortie et dans la note', async () => {
  const ch = await chaineDe('non-adoptee');
  const { banc } = ch;
  // 1. Hors d'une copie d'essai : le chemin du verrou contrôlé AVANT tout le reste (ici, aucune autre option donnée).
  const r1 = lancerHorsEssai(ch, ['--banc', '--verrou', path.join(banc, 'verrou-autre-nom.json')]);
  refuse(r1, /^--verrou : le verrou du regard de sûreté est .+[\\/]banc46[\\/]verrou-surete\.json, et lui seul — un seul regard de chaque nom/, '--banc, un autre nom');
  const fixeSurete = /est (.+?), et lui seul/.exec(r1.json.refus)[1];
  // Correctif R5 du 13/11 après-midi (constat 5 du rebanc) : le chemin fixe est ancré sur la RACINE du bac (ici le faux bac
  // du faux dossier personnel), jamais sur le dossier qui contient le code (la copie cm-tests-… : son propre banc46).
  const racineDuFauxBac = path.join(ch.copie.maison, 'CoteMaster', 'bac-a-sable');
  assert.equal(path.resolve(fixeSurete).toLowerCase(), path.join(racineDuFauxBac, 'banc46', 'verrou-surete.json').toLowerCase(), 'le verrou fixe : <racine du bac>\\banc46\\verrou-surete.json');
  assert.equal(path.resolve(fixeSurete).toLowerCase().startsWith(path.resolve(ch.copie.dossier).toLowerCase()), false, 'pas le banc46 du dossier du code');
  const banc46 = path.dirname(fixeSurete);
  const fixePreuve = path.join(banc46, 'verrou-preuve.json');
  refuse(lancerHorsEssai(ch, ['--banc']), /^--verrou : le verrou du regard de sûreté est .+ \(reçu : rien\)/, '--banc sans verrou');
  refuse(lancerHorsEssai(ch, ['--preuve', '--sans-surete', '--verrou', path.join(banc, 'vp.json')]), /^--verrou : le verrou du regard de preuve est .+[\\/]banc46[\\/]verrou-preuve\.json, et lui seul/, '--preuve, un autre nom');
  refuse(lancerHorsEssai(ch, ['--preuve', '--verrou', fixePreuve, '--verrou-surete', path.join(banc, 'verrou-surete.json')]), /^--verrou-surete : le verrou du regard de sûreté est .+[\\/]banc46[\\/]verrou-surete\.json/, '--preuve, la sûreté d’un autre nom');
  // Au chemin fixe, le contrôle passe : le refus suivant est un autre (moins de 600 matchs, sans réglage d'essai) ; rien posé.
  refuse(lancerHorsEssai(ch, ['--banc', ...communs(ch, ch.export1, ch.comptes1), '--verrou', fixeSurete, '--sortie', path.join(banc, 's-c4-hors.json')]), /^moins de 600 matchs dans l’export/, '--banc au chemin fixe');
  assert.equal(fs.existsSync(banc46), false, 'rien écrit dans banc46');
  // 2. Un rejeu sur un AUTRE export que le dernier du verrou : refusé sans --autre-export ; avec, il passe et le verrou le note.
  reussit(lancer(ch, ['--banc', ...communs(ch, ch.export1, ch.comptes1), '--verrou', path.join(banc, 'v-c4.json'), '--sortie', path.join(banc, 's-c4-1.json')], { env: ESSAI }), 'premier passage');
  const eB = reussit(lancer(ch, ['--exporter', '--base', ch.base, '--au', '2026-09-29', '--passe', ch.p.passe, '--sortie', path.join(banc, 'export-c4.jsonl')]), 'un autre export');
  const cB = reussit(lancer(ch, ['--comptes', '--export', eB.sortie, '--sha1-export', eB.sha1, '--sortie', path.join(banc, 'comptes-c4.json')]), 'ses comptes');
  const kB = communs(ch, eB, cB);
  refuse(lancer(ch, ['--banc', ...kB, '--verrou', path.join(banc, 'v-c4.json'), '--sortie', path.join(banc, 's-c4-2.json'), '--rejouer-apres-correction', 'essai C4'], { env: ESSAI }), /rejoue le MÊME export \([0-9a-f]{40}\) ; [0-9a-f]{40} est un autre export : un autre export est un autre regard/, 'un autre export sans --autre-export');
  refuse(lancer(ch, ['--banc', ...kB, '--verrou', path.join(banc, 'v-c4-neuf.json'), '--sortie', path.join(banc, 's-c4-3.json'), '--autre-export'], { env: ESSAI }), /--autre-export sans passage précédent/, '--autre-export sans verrou');
  const r4 = reussit(lancer(ch, ['--banc', ...kB, '--verrou', path.join(banc, 'v-c4.json'), '--sortie', path.join(banc, 's-c4-4.json'), '--rejouer-apres-correction', 'essai C4', '--autre-export'], { env: ESSAI }), 'un autre export avec --autre-export');
  const v = lireJson(path.join(banc, 'v-c4.json'));
  assert.deepEqual([v.export.sha1, v.rejeux.length, v.rejeux[0].export.sha1, v.rejeux[0].autreExport, v.rejeux[0].raison], [ch.export1.sha1, 1, eB.sha1, true, 'essai C4']);
  assert.deepEqual([lireJson(r4.sortie).rejeu.autreExport, lireJson(r4.sortie).rejeu.exportPrecedent], [true, ch.export1.sha1]);
  reussit(lancer(ch, ['--banc', ...kB, '--verrou', path.join(banc, 'v-c4.json'), '--sortie', path.join(banc, 's-c4-5.json'), '--rejouer-apres-correction', 'le même export'], { env: ESSAI }), 'le même export rejoué');
  assert.equal(lireJson(path.join(banc, 'v-c4.json')).rejeux[1].autreExport, false, 'le même export : noté aussi');
  // 3. --preuve --sans-surete alors que banc46 verrou-surete.json existe : pas refusé, mais dit (sortie, verrou, note recopiée).
  fs.mkdirSync(banc46, { recursive: true });
  fs.copyFileSync(path.join(banc, 'verrou-surete.json'), fixeSurete);
  try {
    const r = lancer(ch, ['--preuve', ...communs(ch, ch.export2, ch.comptes2), '--avenant', ch.avenant, '--sans-surete', '--verrou', path.join(banc, 'v-c4-seul.json'), '--sortie', path.join(banc, 's-c4-seul.json')], { env: ESSAI });
    const p = reussit(r, 'la preuve seule après une sûreté');
    assert.equal(p.avertissement, PHRASE_C4);
    assert.match(r.erreurs, /ATTENTION : regard de preuve seul alors qu’un regard de sûreté a été pris/);
    const sortie = lireJson(p.sortie);
    assert.deepEqual([sortie.preuve.avertissement, sortie.preuve.chemin, lireJson(path.join(banc, 'v-c4-seul.json')).avertissement], [PHRASE_C4, PHRASE_C4, PHRASE_C4]);
    reussit(lancer(ch, ['--recopier', p.sortie, '--remplacer']), 'la recopie');
    assert.equal((await importer(ch.fichierNote)).NOTE_DU_DIRECT.preuve.avertissement, PHRASE_C4, 'dit dans la note recopiée');
  } finally {
    fs.rmSync(banc46, { recursive: true, force: true });
    reussit(lancer(ch, ['--note-nulle']), 'la note nulle (la chaîne remise)');
  }
});

test('C5 (13/11) ESSAI ne vaut que DANS une copie d’essai : CM_TEST_DOSSIER pointé sur un dossier étranger n’ouvre ni les réglages d’essai, ni la recopie d’une sortie d’essai', async () => {
  const ch = await chaineDe('non-adoptee');
  refuse(lancerHorsEssai(ch, ['--banc', ...communs(ch, ch.export1, ch.comptes1), '--verrou', path.join(ch.banc, 'v-c5.json'), '--sortie', path.join(ch.banc, 's-c5.json')], { env: ESSAI }), /les réglages d’essai \(CM_ESSAI_…\) ne valent que dans une copie d’essai/, 'les réglages d’essai hors d’une copie');
  refuse(lancerHorsEssai(ch, ['--recopier', path.join(ch.banc, 'sortie-preuve.json')]), /une sortie faite avec des réglages d’essai ne se recopie jamais hors d’une copie d’essai/, 'la recopie d’une sortie d’essai');
  // Correctif R4 du 13/11 après-midi (constat 4 du rebanc) : CM_TEST_DOSSIER = un PARENT de la copie (ici le faux dossier
  // personnel, qui contient le faux bac et la copie) n'ouvre pas davantage les réglages d'essai : une copie d'essai, c'est le
  // dossier cm-tests-… d'isolement.mjs ET ce script à sa place dedans (code\server).
  const parent = executerDansLeBac({ ...ch.copie, dossier: ch.copie.maison }, ch.script, { args: ['--banc', ...communs(ch, ch.export1, ch.comptes1), '--verrou', path.join(ch.banc, 'v-c5b.json'), '--sortie', path.join(ch.banc, 's-c5b.json')], env: ESSAI, timeout: 300_000 });
  assert.equal(parent.reseau, false, 'aucun appel réseau');
  refuse(parent, /les réglages d’essai \(CM_ESSAI_…\) ne valent que dans une copie d’essai/, 'les réglages d’essai, CM_TEST_DOSSIER = un parent de la copie');
  assert.deepEqual([fs.existsSync(path.join(ch.banc, 'v-c5.json')), fs.existsSync(path.join(ch.banc, 's-c5.json')), fs.existsSync(path.join(ch.banc, 'v-c5b.json')), fs.existsSync(path.join(ch.banc, 's-c5b.json'))], [false, false, false, false]);
  assert.equal(lireJson(path.join(ch.banc, 'sortie-surete.json')).essai.surete, 6, 'dans la copie d’essai, les réglages valent');
});

test('C9 (13/11) la note du regard de PREUVE est protégée : --recopier d’une sortie de sûreté est refusé sans --remplacer (rien copié, rien écrit) ; avec, il la remplace', async () => {
  const ch = await chaineDe('non-adoptee');
  const preuve = path.join(ch.banc, 'sortie-preuve.json');
  const surete = path.join(ch.banc, 'sortie-surete.json');
  const fixtureSurete = path.join(ch.copie.serveur, 'test', 'fixtures', 'banc-etape46-surete.json');
  try {
    reussit(lancer(ch, ['--recopier', preuve, '--remplacer']), 'la note de preuve');
    const avant = sha1(ch.fichierNote);
    const existait = fs.existsSync(fixtureSurete);
    refuse(lancer(ch, ['--recopier', surete]), /la note en vigueur est celle du regard de PREUVE \(verdict « [^»]+ », passé le \d{4}-\d{2}-\d{2}\) : une sortie du regard de sûreté ne la remplace pas sans --remplacer \(C9\)/, 'la sûreté sur la preuve');
    assert.equal(sha1(ch.fichierNote), avant, 'la note de preuve intacte');
    assert.equal(fs.existsSync(fixtureSurete), existait, 'aucune copie faite');
    reussit(lancer(ch, ['--recopier', surete, '--remplacer']), 'avec --remplacer');
    assert.equal((await importer(ch.fichierNote)).NOTE_DU_DIRECT.regard, 'surete');
    reussit(lancer(ch, ['--recopier', preuve, '--remplacer']), 'la preuve sur la sûreté (sans objet pour C9)');
  } finally {
    reussit(lancer(ch, ['--note-nulle']), 'la note nulle (la chaîne remise)');
  }
});

test('C11 (13/11) un match dont un état réel sort de F1 est retiré de TOUS les jugements, nommé et compté ; au-delà de 1 % des matchs du passage ou de 20 matchs, rien n’est jugé ; le critère ne lit que les masses du modèle, jamais une issue', () => {
  const ids = ['direct-v1', 'temps-restant'];
  const avecHors = (M, hors, issue = () => ({ hg: 1, ag: 0 })) => rejeuxSynthetiques(M, { ids, lecture: (id, m, e) => lectureFabriquee([0.5, 0.3, 0.2], 0.5, e, { masse: m < hors && id === 'direct-v1' ? 2e-5 : 1e-9 }), issue });
  // 1 sur 100 : toléré (au plus 1 % et au plus 20) ; retiré, nommé (son pire état).
  const e1 = B.etalonnageEtage2(avecHors(100, 1));
  assert.deepEqual([e1.ok, e1.horsF1.n, e1.horsF1.tolere, e1.retires.size, e1.horsF1.matchs[0].cle], [true, 1, true, 1, 's0']);
  assert.equal(e1.horsF1.matchs[0].ou, 's0, créneau 0 (0-0, rouges 0-0), direct-v1');
  assert.equal(Object.keys(e1).includes('retires'), false, 'l’ensemble des retirés n’est jamais écrit dans la sortie');
  // 1 sur 99 : au-delà de 1 % → écart, arrêt ; 20 sur 2 000 : toléré ; 21 sur 2 100 (1 %, mais plus de 20) : arrêt.
  const e2 = B.etalonnageEtage2(avecHors(99, 1));
  assert.deepEqual([e2.ok, e2.horsF1.tolere, e2.retires.size], [false, false, 0]);
  assert.match(e2.ecarts[0], /^1 match hors de F1 sur 99 \(au-delà de 1 % des matchs du passage ou de 20 matchs\) : un problème systématique ne se masque pas/);
  assert.deepEqual([B.etalonnageEtage2(avecHors(2000, 20)).ok, B.etalonnageEtage2(avecHors(2100, 21)).ok], [true, false]);
  // « masse négligée au-delà de 1e-4 » (lecture invalide) : hors de F1 ; une autre lecture invalide reste un écart.
  const neg = rejeuxSynthetiques(100, { ids, lecture: (id, m, e) => lectureFabriquee([0.5, 0.3, 0.2], 0.5, e, m === 3 && id === 'temps-restant' ? { valide: false, pourquoi: 'masse négligée au-delà de 1e-4', masse: 3e-4 } : {}), issue: () => ({ hg: 1, ag: 0 }) });
  const e3 = B.etalonnageEtage2(neg);
  assert.deepEqual([e3.ok, e3.horsF1.n, e3.horsF1.matchs[0].cle], [true, 1, 's3']);
  const autre = rejeuxSynthetiques(100, { ids, lecture: (id, m, e) => lectureFabriquee([0.5, 0.3, 0.2], 0.5, e, m === 3 ? { valide: false, pourquoi: 'lecture non finie ou hors de [0 ; 1]' } : {}), issue: () => ({ hg: 1, ag: 0 }) });
  assert.equal(B.etalonnageEtage2(autre).ok, false);
  // Le critère ne lit jamais l'issue : mêmes masses, autres issues → les mêmes matchs retirés.
  assert.deepEqual(B.etalonnageEtage2(avecHors(100, 1, (m) => ({ hg: m % 3, ag: 2 }))).horsF1, e1.horsF1);
  // Le passage (en mémoire) : 100 matchs fabriqués, l'un hors de F1 (12-0 à la pause pour λ = 4,5) → retiré de tous les
  // jugements, nommé ; F1 tenu sur les 99 autres.
  const d = { ...D.declarationDe('adoptee'), creneaux: CRENEAUX_ESSAI };
  const matchs = BF.matchsFabriques(100, { prefixe: 'hf', grille: d.modele.grille, engineVersion: 6 });
  matchs[2].ligne.lambda = 4.5;
  matchs[2].resultat = { hg90: 12, ag90: 0, buts: Array.from({ length: 12 }, (_, i) => [1 + i, 0]), rouges: [], prolongation: false, ajouts: { 45: [], 91: [] } };
  const r = B.passerLeBanc({ matchs, declaration: d, regard: 'surete', tirages: 100 });
  assert.equal(r.arret, false);
  assert.deepEqual([r.banc.n, r.banc.exclus.horsF1, r.banc.horsF1.n, r.banc.horsF1.matchs.map((x) => x.cle)], [99, 1, 1, [matchs[2].cle]]);
  assert.match(r.banc.horsF1.matchs[0].ou, /créneau 45 \(12-0/);
  assert.equal(r.banc.f1.tenu, true, 'F1 tenu sur les matchs jugés');
});

test('C12 (13/11) l’identité des lignes au regard de preuve : au plus 5 matchs communs ET au plus 0,5 % d’entre eux à la ligne changée sont nommés, comptés et retirés des DEUX côtés ; au-delà, refus (rien lu)', async () => {
  const lot = (n) => BF.matchsFabriques(n, { prefixe: 'id', jours: 7 });
  const change = (liste, k) => liste.map((m, i) => (i < k ? { ...m, ligne: { ...m.ligne, lambda: m.ligne.lambda + 0.2 } } : m));
  const a200 = lot(200);
  const t1 = B.identiteDesLignes(a200, change(a200, 1));
  assert.deepEqual([t1.communs, t1.rompues, t1.tolere, t1.tolerance], [200, ['id-0000'], true, { max: 5, part: 0.005 }]);
  assert.equal(B.identiteDesLignes(lot(199), change(lot(199), 1)).tolere, false, '1 sur 199 : plus de 0,5 %');
  assert.equal(B.identiteDesLignes(lot(1000), change(lot(1000), 5)).tolere, true, '5 sur 1 000');
  assert.equal(B.identiteDesLignes(lot(1400), change(lot(1400), 6)).tolere, false, '6 sur 1 400 : plus de 5');
  assert.deepEqual(B.identiteDesLignes(a200, [...a200, ...BF.matchsFabriques(5, { prefixe: 'nv', debut: '2026-10-01', jours: 3 })]).rompues, [], 'seuls les matchs communs comptent');
  // Correctif R9 du 13/11 après-midi (constat 9 du rebanc) : CHAQUE champ de la signature rompt l'identité à lui seul — la
  // clé, le rôle, calcule_le, μ, ρ, fair.home à 1e-9 près, fair absent (λ : t1 ci-dessus).
  const variantes = {
    cle: (m) => ({ ...m, cle: `${m.cle}-autre` }),
    role: (m) => ({ ...m, ligne: { ...m.ligne, role: 'candidate' } }),
    calculeLe: (m) => ({ ...m, ligne: { ...m.ligne, calculeLe: '2026-09-24T04:00:00.000Z' } }),
    mu: (m) => ({ ...m, ligne: { ...m.ligne, mu: m.ligne.mu + 0.2 } }),
    rho: (m) => ({ ...m, ligne: { ...m.ligne, rho: m.ligne.rho + 0.01 } }),
    fairHome: (m) => ({ ...m, ligne: { ...m.ligne, fair: { ...m.ligne.fair, home: m.ligne.fair.home + 1e-9 } } }),
    fairAbsent: (m) => ({ ...m, ligne: { ...m.ligne, fair: null } })
  };
  assert.equal(a200[0].ligne.calculeLe === '2026-09-24T04:00:00.000Z', false);
  for (const [champ, changer] of Object.entries(variantes)) {
    assert.deepEqual(B.identiteDesLignes(a200, a200.map((m, i) => (i === 0 ? changer(m) : m))).rompues, ['id-0000'], `${champ} changé seul : identité rompue`);
  }
  // Le script : 200 matchs au regard de sûreté, puis 220 au regard de preuve dont 1 commun à la ligne changée (toléré).
  const ch = await chaineDe('non-adoptee');
  const { banc } = ch;
  const reglages = { ...ESSAI, CM_ESSAI_T: '210', CM_ESSAI_CRENEAUX: '0' };
  const ecrireExport = (nom, matchs, au) => {
    const f = path.join(banc, nom);
    fs.writeFileSync(f, BF.texteDExport({ colonne: 'non-adoptee', grille: 'ancien-81', matchs, sceau: ch.sceller.sceau, au }));
    return { sortie: f, sha1: sha1(f) };
  };
  // Les comptes de l'étage 1 FABRIQUÉS, avec ce que le regard en vérifie (le mode, l'export, le sceau, l'étalonnage tenu) :
  // --comptes sur 220 matchs prend près d'une minute, et R20 essaie les siens ; ici, seule l'identité des lignes est regardée.
  const comptesDe = (e, nom) => {
    const f = path.join(banc, nom);
    fs.writeFileSync(f, JSON.stringify({ format: 1, mode: 'comptes', export: { sha1: e.sha1 }, sceau: ch.sceller.sceau, etalonnage: { ok: true, nEcarts: 0 }, fabrique: 'essai C12' }));
    return { sortie: f };
  };
  const premier = BF.matchsFabriques(200, { prefixe: 'ia', jours: 7 });
  const eA = ecrireExport('export-c12-a.jsonl', premier, '2026-09-30');
  const eB = ecrireExport('export-c12-b.jsonl', [...change(premier, 1), ...BF.matchsFabriques(20, { prefixe: 'ib', debut: '2026-10-01', jours: 3, graine: 9 })], DATE_DU_REGISTRE);
  const cA = comptesDe(eA, 'comptes-c12-a.json');
  const cB = comptesDe(eB, 'comptes-c12-b.json');
  reussit(lancer(ch, ['--banc', ...communs(ch, eA, cA), '--verrou', path.join(banc, 'v-c12-surete.json'), '--sortie', path.join(banc, 's-c12-surete.json')], { env: reglages }), 'la sûreté sur 200 matchs');
  const av = BF.avenantDe(path.join(banc, 'avenant-c12.md'), { sha1Export: eB.sha1, au: DATE_DU_REGISTRE });
  const r = lancer(ch, ['--preuve', ...communs(ch, eB, cB), '--avenant', av, '--verrou-surete', path.join(banc, 'v-c12-surete.json'), '--verrou', path.join(banc, 'v-c12-preuve.json'), '--sortie', path.join(banc, 's-c12-preuve.json')], { env: reglages });
  const j = reussit(r, 'la preuve, 1 match commun sur 200 à la ligne changée');
  assert.equal(j.identiteRompues, 1);
  assert.match(r.erreurs, /identité des lignes : 1 sur 200 matchs communs à la ligne changée \(tolérés, nommés, retirés des deux côtés\) : ia-0000/);
  const p = lireJson(j.sortie);
  assert.deepEqual([p.preuve.identite.communs, p.preuve.identite.rompues, p.preuve.identite.tolerance], [200, { n: 1, matchs: ['ia-0000'] }, { max: 5, part: 0.005 }]);
  assert.deepEqual([p.export.matchs, p.banc.n], [219, 219], 'retiré du regard de preuve');
  assert.deepEqual([p.ecartsDesExports.feuillesDeMatchManquantes.n, p.ecartsDesExports.resultatsChanges.n, p.ecartsDesExports.nouveauxDepuisLePremierExport], [0, 0, 20], 'retiré des deux côtés : jamais un écart entre les exports');
  assert.equal(lireJson(path.join(banc, 'v-c12-preuve.json')).identite.rompues.n, 1, 'noté dans le verrou');
});

test('C10 (13/11) deux gardes de l’export essayées : --de avant le 2026-09-24 est refusé ; une ligne calculée après la dernière nuit complète n’est jamais exportée', async () => {
  const ch = await chaineDe('non-adoptee');
  refuse(lancer(ch, ['--exporter', '--base', ch.base, '--de', '2026-09-23', '--au', DATE_DU_REGISTRE, '--passe', ch.p.passe, '--sortie', path.join(ch.banc, 'export-c10-de.jsonl')]), /^--de 2026-09-23 : la période du banc commence le 2026-09-24/, '--de avant le 24/09');
  assert.equal(fs.existsSync(path.join(ch.banc, 'export-c10-de.jsonl')), false);
  // La dernière nuit complète le 02/10 à 3 h (UTC) : banc-0009 (03/10) n'a qu'une ligne d'après elle ; banc-0008 (02/10, 14 h)
  // en a deux, l'une de 2 h (avant la nuit), l'autre de 8 h (après) → celle de 2 h.
  const rencontres = ch.rencontres.map((r) => (r.matchKey === 'banc-0008' ? { ...r, lignes: [...r.lignes, { ...r.lignes[0], calculeLe: '2026-10-02T08:00:00.000Z', lambda: r.lignes[0].lambda + 0.3 }] } : r));
  const base = BF.magasinDuBanc(path.join(ch.copie.dossier, 'base', 'banc-c10.db'), { rencontres, nuit: '2026-10-02T03:00:00.000Z' });
  const e = reussit(lancer(ch, ['--exporter', '--base', base, '--au', DATE_DU_REGISTRE, '--passe', ch.p.passe, '--sortie', path.join(ch.banc, 'export-c10.jsonl')]), 'l’export, nuit du 02/10');
  const [entete, ...matchs] = lignesDExport(e.sortie);
  const par = Object.fromEntries(matchs.map((m) => [m.matchKey, m]));
  assert.equal(entete.nuit, '2026-10-02T03:00:00.000Z');
  assert.equal(par['banc-0009'], undefined, 'sa seule ligne est d’après la dernière nuit complète');
  assert.equal(par['banc-0008'].ligne.calculeLe, '2026-10-02T02:00:00.000Z', 'la ligne d’avant la nuit, jamais la plus récente');
  assert.ok(matchs.every((m) => m.ligne.calculeLe <= entete.nuit), 'aucune ligne d’après la nuit');
  assert.equal(entete.exclus.sansLigneAvantLeCoupDEnvoi, 1);
});

test('C7 point 4 (13/11) la phrase du verdict : « il en faut environ T » seulement si n < T ; au regard de sûreté, « ; non montré : … » quand des familles ou des tranches ne sont pas montrées', () => {
  const d = D.declarationDe('non-adoptee');
  const tenu = { tenu: true, pire: { masse: 1e-9, ou: 'x' } };
  const v = (regard, o) => B.tableDuVerdict({ regard, f1: tenu, principal: { id: 'principal', verdict: 'pas-prouve', fourchette: [-0.0012, 0.0034] }, jugements: [], tranches: [], paires: { ecartees: [] }, declaration: d, ...o });
  assert.match(espaces(v('preuve', { n: 1234 }).phrase), /il en faut environ 2 300\.$/);
  assert.doesNotMatch(v('preuve', { n: 2300 }).phrase, /il en faut/);
  assert.doesNotMatch(v('preuve', { n: 2500, principal: { id: 'principal', verdict: 'pas-prouve' } }).phrase, /il en faut/);
  const s = v('surete', { n: 700, jugements: [{ id: 'J2-bothTeamsScore', verdict: 'moins-bon' }], tranches: [{ id: `principal@${D.TRANCHES[5]}`, verdict: 'moins-bon' }] });
  assert.equal(espaces(s.phrase), `Rien de moins bon : montré, pas encore jugé (700 matchs rejoués sur les 2 300 prévus) ; non montré : « les deux marquent », la tranche ${D.TRANCHES[5]}.`);
  assert.equal(espaces(v('surete', { n: 700 }).phrase), 'Rien de moins bon : montré, pas encore jugé (700 matchs rejoués sur les 2 300 prévus).');
});

// ------------------------------------------------------------ les derniers points (13/11 soir : K11, K12)

/** Une copie scellée à part (colonne fixée, 46 posée au registre de LA COPIE, sceau), sans base ni export ; `avant(c)` s'applique d'abord. */
function copieScellee(colonne, { avant = null } = {}) {
  const c = nouvelleCopie();
  if (avant) avant(c);
  const d = D.declarationDe(colonne);
  const banc = path.join(c.copie.dossier, 'banc');
  fs.mkdirSync(banc, { recursive: true });
  const p = BF.piecesDuBanc(path.join(c.copie.dossier, 'pieces'));
  reussit(lancer(c, ['--fixer-colonne', colonne]), `fixer-colonne ${colonne}`);
  BF.poserLe46(c.copie, { colonne, date: DATE_DU_REGISTRE });
  const sceller = reussit(lancer(c, ['--sceller', '--regles', p.regles, '--documents', p.documents]), `sceller ${colonne}`);
  return { ...c, colonne, d, banc, p, sceller };
}
const QUATRE_DESCELLES = Object.freeze(['src/data/direct/etatDuDirect.js', 'src/data/direct/memoireDuDirect.js', 'src/data/direct/libelleDuDirect.js', 'src/data/direct/entreesDuDirect.js']);

test('K11 (13/11 soir) le script scellé ne charge plus libelleDuDirect.js au démarrage : dans une copie d’essai où libelleDuDirect.js lève une erreur à l’import, --fixer-colonne, --sceller et --comptes (export fabriqué) passent, --libelles refuse avec un message clair (rien écrit) ; la fermeture STATIQUE des imports d’etape46.mjs n’a aucun des quatre modules descellés', async () => {
  // 1. La copie : libelleDuDirect.js y lève une erreur à l'import (le module descellé « cassé » par un correctif du rodage).
  const CASSE = 'libelleDuDirect.js cassé exprès (essai K11)';
  const c = copieScellee('non-adoptee', { avant: (x) => fs.writeFileSync(path.join(x.copie.serveur, 'src', 'data', 'direct', 'libelleDuDirect.js'), `// Essai K11 : ce module lève une erreur à l'import.\nthrow new Error('${CASSE}');\n`) });
  assert.equal(c.sceller.modules, 24, 'le sceau posé sans libelleDuDirect.js');
  const matchs = BF.matchsFabriques(7, { prefixe: 'k11' });
  const f = path.join(c.banc, 'export-k11.jsonl');
  fs.writeFileSync(f, BF.texteDExport({ colonne: 'non-adoptee', grille: 'ancien-81', matchs, sceau: c.sceller.sceau }));
  const comptes = reussit(lancer(c, ['--comptes', '--export', f, '--sha1-export', sha1(f), '--sortie', path.join(c.banc, 'comptes-k11.json')]), '--comptes sans libelleDuDirect.js');
  assert.equal(comptes.matchs, 7);
  const dossier = path.join(c.copie.dossier, 'libelles-k11');
  const r = lancer(c, ['--libelles', '--dossier', dossier]);
  refuse(r, /^--libelles : libelleDuDirect\.js ne se charge pas \(libelleDuDirect\.js cassé exprès \(essai K11\)\) : rien lu, rien écrit\. Ce module n’est pas scellé \(K3\)/, '--libelles sans libelleDuDirect.js');
  assert.equal(fs.existsSync(dossier), false, 'rien écrit : le dossier de sortie n’est pas créé');
  // 2. La fermeture des imports lancée depuis etape46.mjs (le motif de C2) : statique (ce que charge le démarrage), aucun des
  // quatre ; avec les import() de chaque mode, libelleDuDirect.js seulement — par l'import de --libelles, et par lui seul.
  const statique = fermetureDesImports(['scripts/etape46.mjs'], { statique: true });
  assert.deepEqual(QUATRE_DESCELLES.filter((m) => statique.includes(m)), [], `aucun des quatre au démarrage (${statique.join(', ')})`);
  assert.deepEqual(QUATRE_DESCELLES.filter((m) => fermetureDesImports(['scripts/etape46.mjs']).includes(m)), ['src/data/direct/libelleDuDirect.js']);
  const texte = fs.readFileSync(path.join(SERVEUR, 'scripts', 'etape46.mjs'), 'utf8');
  assert.equal((texte.match(/import\(\s*'\.\.\/src\/data\/direct\/libelleDuDirect\.js'\s*\)/g) ?? []).length, 1, 'un seul import de libelleDuDirect.js, dynamique');
  const bloc = texte.slice(texte.indexOf("if (MODE === '--libelles') {"), texte.indexOf('// ============================================================ --mesurer-additionnel'));
  assert.match(bloc, /libelle = await import\('\.\.\/src\/data\/direct\/libelleDuDirect\.js'\);/, 'l’import dynamique est dans le bloc de --libelles, et lui seul');
});

/**
 * K12 — LE JEU DE LA CONCORDANCE (rencontres du magasin, colonne « adoptee » : grille 441, rôles service puis candidate de
 * l'empreinte adoptée) : chaque rencontre a un coup d'envoi réel (`meta.kickoff`) ; le cas sans lui (la borne de minuit de
 * Paris, plus prudente) est celui de R19, hors de la concordance (ligneDeService n'a pas de coup d'envoi → aucune ligne).
 */
function rencontresDeConcordance(grille) {
  const AUTRE = 'ffffffffffffffff';
  const sub = { type: 'substitution', minute: 60, addedTime: 0, side: 'home' };
  const l = (o) => ({ role: 'service', grille, engineVersion: 6, candidateHash: null, kickoffConnu: 1, lambda: 1.4, mu: 1.1, rho: -0.06, fair: { home: 0.45, draw: 0.28, away: 0.27 }, apres: 0, ...o });
  const cand = (o) => l({ role: 'candidate', engineVersion: null, candidateHash: EMPREINTE, ...o });
  const r = (id, date, kickoff, lignes) => ({ id, home: 5000 + 2 * id, away: 5001 + 2 * id, matchKey: `conc-${id}`, date, kickoff, hg: 0, ag: 0, meta: { kickoff }, evenements: [sub], lignes });
  return [
    // 1. plusieurs lignes et plusieurs versions (v5 puis v6), une d'après le coup d'envoi → la plus récente d'avant : v6 du 25 à 3 h.
    r(1, '2026-09-25', '2026-09-25T18:00:00.000Z', [l({ calculeLe: '2026-09-23T03:00:00.000Z', engineVersion: 5, lambda: 1.11 }), l({ calculeLe: '2026-09-24T03:00:00.000Z', engineVersion: 5, lambda: 1.12 }), l({ calculeLe: '2026-09-25T03:00:00.000Z', lambda: 1.13 }), l({ calculeLe: '2026-09-25T19:00:00.000Z', lambda: 1.14 })]),
    // 2. « service » et candidates de deux empreintes, plus récentes → la ligne « service ».
    r(2, '2026-09-26', '2026-09-26T18:00:00.000Z', [l({ calculeLe: '2026-09-26T02:00:00.000Z', lambda: 1.21 }), cand({ calculeLe: '2026-09-26T04:00:00.000Z', lambda: 1.22 }), cand({ calculeLe: '2026-09-26T05:00:00.000Z', candidateHash: AUTRE, lambda: 1.23 })]),
    // 3. candidates seules, deux empreintes, deux dates à 1 ms → au banc, la plus récente de l'empreinte adoptée.
    r(3, '2026-09-27', '2026-09-27T18:00:00.000Z', [cand({ calculeLe: '2026-09-27T03:00:00.000Z', lambda: 1.31 }), cand({ calculeLe: '2026-09-27T03:00:00.001Z', lambda: 1.32 }), cand({ calculeLe: '2026-09-27T06:00:00.000Z', candidateHash: AUTRE, lambda: 1.33 })]),
    // 4. dates proches du coup d'envoi : 1 ms avant (gardée), à l'heure exacte (jamais).
    r(4, '2026-09-28', '2026-09-28T15:00:00.000Z', [l({ calculeLe: '2026-09-28T14:59:59.999Z', lambda: 1.41 }), l({ calculeLe: '2026-09-28T15:00:00.000Z', lambda: 1.42 })]),
    // 5. la clé du jour d'abord, même plus ancienne que celle de la veille (à moins de 3 h).
    r(5, '2026-09-29', '2026-09-29T12:00:00.000Z', [l({ calculeLe: '2026-09-28T20:00:00.000Z', lambda: 1.51 }), l({ calculeLe: '2026-09-29T02:00:00.000Z', lambda: 1.52, jourDeLaCle: '2026-09-28T12:00:00.000Z', kickoff: '2026-09-29T12:00:00.000Z' })]),
    // 6. ex-aequo au même instant : la clé du jour, celle du lendemain, une candidate de l'empreinte → la « service » du jour.
    r(6, '2026-09-30', '2026-09-30T13:00:00.000Z', [l({ calculeLe: '2026-09-30T03:00:00.000Z', lambda: 1.61 }), l({ calculeLe: '2026-09-30T03:00:00.000Z', lambda: 1.62, jourDeLaCle: '2026-10-01T13:00:00.000Z', kickoff: '2026-09-30T13:00:00.000Z' }), cand({ calculeLe: '2026-09-30T03:00:00.000Z', lambda: 1.63 })]),
    // 7. la clé de la veille seule, son heure à 1 h 30 du coup d'envoi réel → gardée.
    r(7, '2026-10-01', '2026-10-01T01:00:00.000Z', [l({ calculeLe: '2026-09-30T03:00:00.000Z', lambda: 1.71, jourDeLaCle: '2026-09-30T23:30:00.000Z', kickoff: '2026-09-30T23:30:00.000Z' })]),
    // 8. la clé du lendemain seule, son heure à 24 h → jamais (aucune ligne).
    r(8, '2026-10-01', '2026-10-01T12:00:00.000Z', [l({ calculeLe: '2026-10-01T03:00:00.000Z', lambda: 1.81, jourDeLaCle: '2026-10-02T12:00:00.000Z', kickoff: '2026-10-02T12:00:00.000Z' })]),
    // 9. la clé de la veille à heure inconnue (kickoff_connu = 0) → gardée quelle que soit l'heure.
    r(9, '2026-10-01', '2026-10-01T18:00:00.000Z', [l({ calculeLe: '2026-09-30T03:00:00.000Z', lambda: 1.91, jourDeLaCle: '2026-09-30T12:00:00.000Z', kickoff: '2026-09-30T12:00:00.000Z', kickoffConnu: 0 })]),
    // 10. la dernière nuit complète (2 octobre, 3 h) : la ligne de 3 h pile gardée, celle d'une ms après jamais.
    r(10, '2026-10-02', '2026-10-02T18:00:00.000Z', [l({ calculeLe: '2026-10-02T03:00:00.000Z', lambda: 1.01 }), l({ calculeLe: '2026-10-02T03:00:00.001Z', lambda: 1.02 })]),
    // 11. un match sans ligne : la seule marquée « après le coup d'envoi » par la nuit.
    r(11, '2026-09-25', '2026-09-25T20:00:00.000Z', [l({ calculeLe: '2026-09-25T03:00:00.000Z', apres: 1 })]),
    // 12. un match sans aucune ligne au magasin.
    r(12, '2026-09-26', '2026-09-26T20:00:00.000Z', []),
    // 13. un match dont la seule ligne est la candidate d'une autre empreinte.
    r(13, '2026-09-27', '2026-09-27T20:00:00.000Z', [cand({ calculeLe: '2026-09-27T03:00:00.000Z', candidateHash: AUTRE })])
  ];
}

test('K12 (13/11 soir) la concordance du choix de la ligne d’avant-match : ligneDuBanc (etape46.mjs, scellé, par --exporter) et ligneDeService (entreesDuDirect.js, descellé) donnent LA MÊME ligne — plusieurs lignes et versions par match, rôles service et candidate, plusieurs empreintes, dates proches, ex-aequo, matchs sans ligne ; les choix attendus écrits en toutes lettres', async () => {
  const c = copieScellee('adoptee');
  const { grille, empreinteAdoptee } = c.d.modele;
  assert.equal(empreinteAdoptee, EMPREINTE);
  const nuit = '2026-10-02T03:00:00.000Z';
  const rencontres = rencontresDeConcordance(grille);
  const base = BF.magasinDuBanc(path.join(c.copie.dossier, 'base', 'concordance.db'), { rencontres, nuit });
  // Le choix parmi les candidates de l'empreinte adoptée (le repli de R1 point 2) : ces seules lignes, réécrites « service ».
  const transposees = rencontres.map((r) => ({ ...r, lignes: r.lignes.filter((l) => l.role === 'candidate' && l.candidateHash === empreinteAdoptee).map((l) => ({ ...l, role: 'service' })) }));
  const baseC = BF.magasinDuBanc(path.join(c.copie.dossier, 'base', 'concordance-candidates.db'), { rencontres: transposees, nuit });
  const e = reussit(lancer(c, ['--exporter', '--base', base, '--au', DATE_DU_REGISTRE, '--passe', c.p.passe, '--sortie', path.join(c.banc, 'export-k12.jsonl')]), 'l’export de la concordance');
  const [entete, ...matchs] = lignesDExport(e.sortie);
  assert.equal(entete.nuit, nuit);
  const exportes = new Map(matchs.map((m) => [m.matchKey, m]));
  const dbS = new DatabaseSync(base, { readOnly: true });
  const dbC = new DatabaseSync(baseC, { readOnly: true });
  const choix = {};
  try {
    for (const r of rencontres) {
      const lire = (db) => ligneDeService({ homeId: `fotmob-${r.home}`, awayId: `fotmob-${r.away}`, kickoff: r.meta.kickoff, database: db });
      const s = lire(dbS);
      const k = lire(dbC);
      const attendue = s.trouve ? { ...s, role: 'service' } : k.trouve ? { ...k, role: 'candidate' } : null;
      const m = exportes.get(r.matchKey);
      if (attendue) {
        assert.ok(m, `${r.matchKey} : ligneDeService trouve une ligne, le banc doit l’exporter`);
        assert.deepEqual(
          [m.cle, m.ligne.role, m.ligne.calculeLe, m.ligne.lambda, m.ligne.mu, m.ligne.rho, m.ligne.fair, m.ligne.engineVersion, m.ligne.grille, m.ligne.candidateHash],
          [attendue.cle, attendue.role, attendue.calculeLe, attendue.lambda, attendue.mu, attendue.rho, attendue.fair, attendue.engineVersion, attendue.grille, attendue.role === 'candidate' ? empreinteAdoptee : null],
          `${r.matchKey} : la même ligne des deux côtés`
        );
        choix[r.matchKey] = `${m.ligne.role} ${m.ligne.calculeLe} ${m.ligne.lambda} (décalage ${attendue.decalageJours})`;
      } else {
        assert.equal(m, undefined, `${r.matchKey} : aucune ligne pour ligneDeService (${s.raison}), aucune au banc`);
        choix[r.matchKey] = `aucune : ${s.raison}`;
      }
    }
  } finally {
    dbS.close();
    dbC.close();
  }
  // Les choix attendus, en toutes lettres : si les deux codes changeaient ENSEMBLE, l'essai rougirait encore.
  assert.deepEqual(choix, {
    'conc-1': 'service 2026-09-25T03:00:00.000Z 1.13 (décalage 0)',
    'conc-2': 'service 2026-09-26T02:00:00.000Z 1.21 (décalage 0)',
    'conc-3': 'candidate 2026-09-27T03:00:00.001Z 1.32 (décalage 0)',
    'conc-4': 'service 2026-09-28T14:59:59.999Z 1.41 (décalage 0)',
    'conc-5': 'service 2026-09-28T20:00:00.000Z 1.51 (décalage 0)',
    'conc-6': 'service 2026-09-30T03:00:00.000Z 1.61 (décalage 0)',
    'conc-7': 'service 2026-09-30T03:00:00.000Z 1.71 (décalage -1)',
    'conc-8': 'aucune : aucune-ligne',
    'conc-9': 'service 2026-09-30T03:00:00.000Z 1.91 (décalage -1)',
    'conc-10': 'service 2026-10-02T03:00:00.000Z 1.01 (décalage 0)',
    'conc-11': 'aucune : calculee-apres',
    'conc-12': 'aucune : aucune-ligne',
    'conc-13': 'aucune : aucune-ligne'
  });
  // Les matchs sans ligne : la même raison des deux côtés (le banc ne voit pas conc-12, qui n'a aucune ligne au magasin).
  assert.equal(matchs.length, 9);
  assert.deepEqual(entete.nommes.calculeeApresLeCoupDEnvoi, ['conc-11']);
  assert.deepEqual([entete.exclus.calculeeApresLeCoupDEnvoi, entete.exclus.sansLigneAvantLeCoupDEnvoi], [1, 2], 'conc-11 ; conc-8 et conc-13');
  assert.equal(entete.rencontresLues, matchs.length + Object.values(entete.exclus).reduce((s, n) => s + n, 0));
});

// ------------------------------------------------------------ après la manœuvre : les essais restent valables

test('Avant le scellement : une copie SCELLÉE (la chaîne : colonne fixée, sceau, 46 posée, note) remise par copieAvantLeSceau ne garde rien du sceau — colonne et SCELLEMENT à null entre leurs balises, le reste des deux fichiers inchangé, le registre sans la 46, aucune note — et le script y refuse de nouveau « colonne non fixée »', async () => {
  const ch = await chaineDe('adoptee');
  const direct = path.join(ch.copie.serveur, 'src', 'data', 'direct');
  const lan = path.join(ch.copie.serveur, 'src', 'bench', 'lancements.js');
  const blancs = [
    ['declarationDuDirect.js', '// <COLONNE fixée par script au scellement — ne pas modifier à la main>', '// </COLONNE>', 'export const COLONNE = null;'],
    ['bancDuDirect.js', '// <SCELLEMENT rempli par script au scellement — ne pas modifier à la main>', '// </SCELLEMENT>', 'export const SCELLEMENT = null;']
  ];
  const lireBlanc = (f, debut, fin) => {
    const t = fs.readFileSync(path.join(direct, f), 'utf8');
    return { dedans: t.slice(t.indexOf(debut) + debut.length, t.indexOf(fin)), dehors: t.slice(0, t.indexOf(debut)) + t.slice(t.indexOf(fin)) };
  };
  const avant = blancs.map(([f, d, fi]) => lireBlanc(f, d, fi));
  assert.match(avant[0].dedans, /export const COLONNE = 'adoptee';/, 'la chaîne a bien fixé la colonne');
  assert.doesNotMatch(avant[1].dedans, /export const SCELLEMENT = null;/, 'la chaîne a bien scellé');
  assert.ok(fs.existsSync(path.join(direct, 'noteDuDirect.js')));
  BF.copieAvantLeSceau(ch.copie);
  for (const [i, [f, d, fi, vide]] of blancs.entries()) {
    const apres = lireBlanc(f, d, fi);
    assert.equal(apres.dedans, `${String.fromCharCode(10)}${vide}${String.fromCharCode(10)}`, f);
    assert.equal(apres.dehors, avant[i].dehors, `${f} : rien d’autre ne change`);
  }
  assert.equal(fs.readFileSync(lan, 'utf8'), sansLesAjoutsDe46('bench/lancements.js', fs.readFileSync(path.join(SERVEUR, 'src', 'bench', 'lancements.js'), 'utf8')), 'le registre de la copie sans la 46');
  assert.equal(fs.existsSync(path.join(direct, 'noteDuDirect.js')), false);
  refuse(lancer(ch, ['--exporter']), /^colonne non fixée/, 'colonne non fixée de nouveau');
});
