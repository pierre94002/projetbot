/**
 * Les CORRECTIFS du 28/10/2026 (après la mise en service de l'étape 26), chacun gardé par un test nommé :
 *   node --test test/correctifs28Octobre.test.mjs        (depuis server/)
 *
 *  A. Le contrôle quotidien « Buteurs et score », au rouge depuis le 27/10 à cause de petits matchs de coupe dont FotMob
 *     donne le score sans tous les buteurs : des buteurs absents ou incomplets chez la source sont ORANGE, dits en mots ;
 *     le rouge reste aux vraies contradictions (un buteur en trop ; des buteurs manquants que les gardiens adverses
 *     contredisent aussi). Le carnet de santé reprend le même audit (et refait une fois ses anomalies d'avant la règle).
 *  B. Le vent : FotMob le donne en mètres par seconde (la preuve est rejouée ici sur la base d'essai) ; affiché en km/h
 *     (MatchInfoPanel) et donné en km/h à l'IA (lineupContext), jamais changé dans la base ni dans fotMobProvider.js.
 *  C. La nuit des déroulés (étape 28) : la liste des matchs à venir se calcule dans un processus à part (la base en
 *     lecture seule) ; le serveur garde la main ; repli dans le serveur si l'enfant ne répond pas.
 *  D. Petits textes : D1 la page « Bulletin » ne demande de relancer le serveur que si la route manque vraiment, jamais
 *     pendant la lecture ; D2 les retours de blessure en français dans les dossiers de l'IA ; D3 « 5e en Premier League ».
 *
 * Aucune base ouverte dans le processus du test : ce qui lit une base tourne dans une copie isolée (aides/isolement.mjs,
 * aides/bacSimule.mjs : réseau coupé, heure figée). Aucun appel à Claude.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SERVEUR, FIXTURES, preparerCopie, executer } from './aides/isolement.mjs';
import { preparerCopieDeBac, executerDansLeBac } from './aides/bacSimule.mjs';
import { UI, imp, optionsDuRendu, ouvrirLeRendu, espaces, texteDe, blocDe } from './aides/rendu.mjs';
import * as S from '../src/data/db/scoreAudit.js';
import * as H from '../src/data/db/dataHealth.js';
import * as D from '../src/data/db/dailyChecks.js';
import * as M from '../src/core/ai/aiMemory.js';
import * as C from '../src/core/ai/compactContext.js';
import * as P from '../src/core/ai/matchAiAnalysisPrompt.js';
import { cadreDuMatch } from '../src/data/providers/lineupContext.js';
import { ventEnKmH } from '../src/utils/libellesFotmob.js';
import * as SN from '../src/data/simulation/simulationNuit.js';

const SRC = path.join(SERVEUR, 'src');
const lireSrc = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
/** Les constats RÉELS du contrôle de Pierre du 28/10 (copie figée, lecture seule). */
const F = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'buteurs-27-10.json'), 'utf8'));
const F41 = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'fiche-ia-etape-41.json'), 'utf8'));
const L = await imp(path.join(UI, 'src', 'utils', 'fotmobLabels.js'));
const B = await imp(path.join(UI, 'src', 'utils', 'bulletins.js'));
const DI = await imp(path.join(UI, 'src', 'utils', 'dossiersIA.js'));

/** Une phase d'un script d'essai dans une copie neuve (rangée dans un bac simulé pour le contrôle quotidien). */
function phaseDuControle(phase, runtime = {}) {
  const copie = preparerCopieDeBac({ runtime });
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executerDansLeBac(copie, path.join(SERVEUR, 'test', 'aides', 'script-controle-quotidien.mjs'), { args: [phase], timeout: 300_000 });
    assert.equal(r.code, 0, `phase ${phase} : ${r.erreurs.slice(-3000)}`);
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json, `phase ${phase} : sortie illisible ${r.sortie.slice(-500)}`);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}
function phaseDesCorrectifs(phase) {
  const copie = preparerCopie({});
  try {
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-correctifs-28-10.mjs'), { args: [phase], timeout: 300_000 });
    assert.equal(r.code, 0, `phase ${phase} : ${r.erreurs.slice(-3000)}`);
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json, `phase ${phase} : sortie illisible ${r.sortie.slice(-500)}`);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}
const uneFois = (f) => {
  let v;
  return () => (v ??= f());
};
const buteursSource = uneFois(() => phaseDuControle('buteurs-source', { 'buteurs-27-10.json': F }));
const vent = uneFois(() => phaseDesCorrectifs('vent'));
const liste = uneFois(() => phaseDesCorrectifs('liste'));

/** Le rendu des écrans sans navigateur (aides/rendu.mjs), ouvert une fois pour B3 et D1. */
let rendu = null;
let Panneau = null;
before(async () => {
  if (optionsDuRendu.skip) return;
  rendu = await ouvrirLeRendu({ cibles: /BulletinsPanel\.vue$/ });
  Panneau = (await rendu.charger('/src/components/settings/BulletinsPanel.vue')).default;
});
after(async () => {
  await rendu?.fermer();
});

/** Les chiffres d'un constat d'avant le correctif : « (2-0) — 0 buts crédités aux joueurs (+ 0 csc adverses) pour un score de 2 : … ». */
function chiffresDu(c) {
  const m = /\((\d+)-(\d+)\) — (\d+) buts crédités aux joueurs \(\+ (\d+) csc adverses\) pour un score de (\d+) : (.*)$/.exec(c.texte);
  assert.ok(m, c.texte);
  const camp = c.id.endsWith(':home') ? 'home' : 'away';
  const [dom, ext] = c.label.split(' – ');
  return { camp, equipe: camp === 'home' ? dom : ext, credites: Number(m[3]), csc: Number(m[4]), marques: Number(m[5]), fin: m[6], ancien: c.texte.split(' — ').slice(1).join(' — ') };
}

// ======================================================================== A

test('A1 — buteurs absents ou incomplets chez la source : les deux cas réels du 27/10 (Arosa SC – Pontevedra, Boluspor – Karşıyaka) ne sont plus une erreur et le disent en mots ; le buteur en trop (Lille – Galatasaray) et des buteurs manquants que les gardiens adverses contredisent (le faux 4-3) restent des contradictions ; un seul but sans buteur reste un csc non relevé ; le constat orange ne marque aucun pronostic et ne dit jamais « Score à vérifier »', () => {
  const [arosa, boluspor, lille] = F.constats.map(chiffresDu);
  // Avant le correctif, chez Pierre : les trois rouges, « à vérifier ».
  assert.deepEqual(F.constats.map((c) => [c.matchKey, c.classe, c.aVerifier]), [['2026-10-27-arosa-sc-pontevedra', 'rouge', true], ['2026-10-27-boluspor-kars-yaka', 'rouge', true], ['2026-10-21-lille-galatasaray', 'rouge', true]]);
  // Arosa : 2 buts, aucun crédité, aucun gardien relevé (feuille de petit club) ; Boluspor : le gardien encaisse bien les 3 buts de Karşıyaka.
  const a = S.jugerLesButeurs({ marques: arosa.marques, credites: arosa.credites, cscAdverses: arosa.csc, gardiensAdverses: null, equipe: arosa.equipe });
  assert.deepEqual(a, { ecart: 'incomplets', manque: 2, detail: 'buteurs absents ou incomplets chez la source : Arosa SC marque 2 buts, aucun n’a de buteur' });
  const b = S.jugerLesButeurs({ marques: boluspor.marques, credites: boluspor.credites, cscAdverses: boluspor.csc, gardiensAdverses: { keepers: 1, conceded: 3, gkJoue: 1, gkSorti: 0 }, equipe: boluspor.equipe });
  assert.deepEqual(b, { ecart: 'incomplets', manque: 2, detail: 'buteurs absents ou incomplets chez la source : Karşıyaka marque 3 buts, un seul a un buteur' });
  // Lille – Galatasaray : 3 buts crédités + 2 csc pour 4 — un buteur EN TROP, rouge, avec les mots d'avant à l'octet.
  const l = S.jugerLesButeurs({ marques: lille.marques, credites: lille.credites, cscAdverses: lille.csc, gardiensAdverses: { keepers: 1, conceded: 4, gkJoue: 1, gkSorti: 0 }, equipe: lille.equipe });
  assert.deepEqual([l.ecart, l.detail], ['en-trop', lille.ancien]);
  // Le faux score des essais (Leeds – Newcastle 4-1 → 4-3) : 1 but crédité pour 3, le gardien de Leeds n'en encaisse qu'un — contredit, rouge.
  const faux = S.jugerLesButeurs({ marques: 3, credites: 1, cscAdverses: 0, gardiensAdverses: { keepers: 1, conceded: 1, gkJoue: 1, gkSorti: 0 }, equipe: 'Newcastle' });
  assert.deepEqual([faux.ecart, faux.detail], ['contredits', '1 but crédité aux joueurs (+ 0 csc adverse) pour un score de 3 (2 sans buteur), et les gardiens adverses en encaissent 1 : le score lui-même ne colle pas']);
  // Un gardien exclu ou sorti sans relayeur ne contredit rien (le contrôle des gardiens l'excuse aussi) ; trop de buts encaissés contredit.
  assert.equal(S.jugerLesButeurs({ marques: 4, credites: 2, gardiensAdverses: { keepers: 1, conceded: 2, gkJoue: 1, gkSorti: 1 }, equipe: 'X' }).ecart, 'incomplets');
  assert.equal(S.jugerLesButeurs({ marques: 2, credites: 0, gardiensAdverses: { keepers: 1, conceded: 3, gkJoue: 1, gkSorti: 0 }, equipe: 'X' }).ecart, 'contredits');
  // Un seul but sans buteur : un csc non relevé (compté, jamais signalé) ; tout crédité : rien.
  assert.deepEqual(S.jugerLesButeurs({ marques: 3, credites: 2, equipe: 'X' }), { ecart: 'csc-non-releve', manque: 1, detail: null });
  assert.deepEqual(S.jugerLesButeurs({ marques: 2, credites: 1, cscAdverses: 1, equipe: 'X' }), { ecart: null, manque: 0, detail: null });
  assert.equal(S.jugerLesButeurs({ marques: 4, credites: 1, cscAdverses: 1, equipe: 'Z' }).detail, 'buteurs absents ou incomplets chez la source : Z marque 4 buts, 2 seulement ont un buteur (dont 1 contre son camp)');
  // Le contrôle quotidien : « à vérifier » de l'audit → ORANGE, sans badge sur les pronostics, raison vraie ; « erreur » → rouge, « Score à vérifier ».
  const ctx = { rencontres: new Map([['k', { homeId: 'fotmob-474525', awayId: 'fotmob-7862' }]]) };
  const orange = D.__testing.depuisAnomalie({ id: 'impossible:buteurs:k:home', sorte: 'buteurs', gravite: 'a-verifier', label: 'Arosa SC – Pontevedra', date: '2026-10-27', score: '2-0', detail: a.detail, matchKey: 'k' }, ctx);
  assert.deepEqual([orange.controle, orange.classe, orange.aVerifier, orange.familles], ['buteurs-score', 'orange', false, ['joueurs']]);
  assert.equal(orange.raison, 'Buteurs absents ou incomplets chez la source : Arosa SC – Pontevedra du 27/10/2026');
  assert.equal(orange.texte, 'Arosa SC – Pontevedra du 27/10/2026 (2-0) — buteurs absents ou incomplets chez la source : Arosa SC marque 2 buts, aucun n’a de buteur');
  const rouge = D.__testing.depuisAnomalie({ id: 'impossible:buteurs:k:away', sorte: 'buteurs', gravite: 'erreur', label: 'Lille – Galatasaray', date: '2026-10-21', detail: l.detail, matchKey: 'k' }, ctx);
  assert.deepEqual([rouge.classe, rouge.aVerifier, rouge.raison], ['rouge', true, 'Score à vérifier : Lille – Galatasaray du 21/10/2026 (buteurs et score ne collent pas)']);
  assert.equal(D.couleurDuConstat(orange, Date.parse('2026-10-28T05:00:00Z')), 'orange');
  // Les mots de l'écran et du carnet ; le contrôle peut toujours être rouge (classe = la couleur la plus forte).
  assert.match(H.SORTES.buteurs.explication, /buteurs absents ou incomplets chez la source/);
  assert.equal(D.CONTROLES.find((c) => c.cle === 'buteurs-score').classe, 'rouge');
  assert.match(D.CONTROLES.find((c) => c.cle === 'buteurs-score').quoi, /orange pour des buteurs absents ou incomplets chez la source/);
  // La règle du carnet : les anomalies d'AVANT (erreur, « N buteurs manquants ») sont refaites une fois ; jamais celles d'aujourd'hui.
  for (const c of [arosa, boluspor]) assert.equal(H.anomalieDeButeursDAvant({ sorte: 'buteurs', gravite: 'erreur', detail: c.ancien }), true, c.ancien);
  for (const detail of [a.detail, b.detail, faux.detail, l.detail]) assert.equal(H.anomalieDeButeursDAvant({ sorte: 'buteurs', gravite: detail === a.detail || detail === b.detail ? 'a-verifier' : 'erreur', detail }), false, detail);
});

test('A2 — les trois constats RÉELS de Pierre plantés dans une copie (noms, identifiants, compétition, date, score) : « Buteurs et score » passe au ORANGE avec les mots « buteurs absents ou incomplets chez la source », le buteur en trop de Lille – Galatasaray reste rouge tant qu’il est nouveau ; aucun badge de joueur pour les deux coupes ; le carnet de santé reprend le même audit et refait UNE fois ses anomalies d’avant la règle', () => {
  const s = buteursSource();
  const bE = s.etat.controles['buteurs-score'];
  // Chez Pierre (ses dates de découverte) : orange, plus rouge — le feu ne l'est plus à cause de ces matchs.
  assert.deepEqual([bE.statut, bE.total], ['orange', 3]);
  assert.notEqual(s.etat.feu, 'rouge');
  assert.equal(s.relu, 'orange', 'relu une heure plus tard : la même couleur');
  const par = Object.fromEntries(bE.constats.map((c) => [c.matchKey, c]));
  assert.deepEqual(Object.keys(par).sort(), F.constats.map((c) => c.matchKey).sort());
  for (const c of F.constats) assert.equal(par[c.matchKey].id, c.id, 'les identifiants de constat ne changent pas');
  assert.equal(par['2026-10-27-arosa-sc-pontevedra'].texte, 'Arosa SC – Pontevedra du 27/10/2026 (2-0) — buteurs absents ou incomplets chez la source : Arosa SC marque 2 buts, aucun n’a de buteur');
  assert.equal(par['2026-10-27-boluspor-kars-yaka'].texte, 'Boluspor – Karşıyaka du 27/10/2026 (1-3) — buteurs absents ou incomplets chez la source : Karşıyaka marque 3 buts, un seul a un buteur');
  for (const k of ['2026-10-27-arosa-sc-pontevedra', '2026-10-27-boluspor-kars-yaka']) {
    assert.deepEqual([par[k].classe, par[k].aVerifier], ['orange', false], k);
    assert.match(par[k].raison, /^Buteurs absents ou incomplets chez la source : /);
  }
  const lille = par['2026-10-21-lille-galatasaray'];
  assert.deepEqual([lille.classe, lille.aVerifier, lille.texte, lille.trouveLe], ['rouge', true, F.constats[2].texte, F.constats[2].trouveLe]);
  // À neuf (aucune date de découverte) : le buteur en trop est NOUVEAU, donc rouge ; les deux coupes restent orange.
  const bN = s.etatNeuf.controles['buteurs-score'];
  assert.equal(bN.statut, 'rouge');
  assert.deepEqual(bN.constats.map((c) => [c.matchKey, c.classe]).sort(), [['2026-10-21-lille-galatasaray', 'rouge'], ['2026-10-27-arosa-sc-pontevedra', 'orange'], ['2026-10-27-boluspor-kars-yaka', 'orange']]);
  // Rien ne contredit le score : gardiens et score au vert.
  assert.deepEqual([s.etat.controles['gardiens-score'].statut, s.etat.controles['gardiens-score'].total], ['vert', 0]);
  // Un futur pari sur un joueur : badge pour Lille (score à vérifier), aucun pour les deux matchs de coupe.
  const controlesDu = (k) => (s.badgeJoueur[k]?.raisons ?? []).map((r) => r.controle);
  assert.ok(!controlesDu('2026-10-27-arosa-sc-pontevedra').includes('buteurs-score'));
  assert.ok(!controlesDu('2026-10-27-boluspor-kars-yaka').includes('buteurs-score'));
  assert.ok(controlesDu('2026-10-21-lille-galatasaray').includes('buteurs-score'));
  // Le carnet de santé : le même audit, les mêmes gravités.
  const gravites = (o) => Object.fromEntries(Object.entries(o).map(([id, a]) => [id, a.gravite]));
  const attendu = {
    'impossible:buteurs:2026-10-21-lille-galatasaray:away': 'erreur',
    'impossible:buteurs:2026-10-27-arosa-sc-pontevedra:home': 'a-verifier',
    'impossible:buteurs:2026-10-27-boluspor-kars-yaka:away': 'a-verifier'
  };
  assert.deepEqual(Object.fromEntries(s.audit.map((a) => [a.id, a.gravite])), attendu);
  assert.deepEqual(gravites(s.carnet.complet), attendu);
  // Un carnet écrit AVANT le correctif (les deux écarts en « erreur », « N buteurs manquants ») : la nuit les refait une fois…
  assert.deepEqual(Object.values(s.carnet.ancien).map((a) => a.gravite), ['erreur', 'erreur', 'erreur']);
  const n1 = s.carnet.nuit1;
  assert.deepEqual(gravites(n1.buteurs), attendu);
  assert.equal(n1.audit.rencontres, 2, 'les deux rencontres d’avant la règle, et elles seules');
  for (const id of ['impossible:buteurs:2026-10-27-arosa-sc-pontevedra:home', 'impossible:buteurs:2026-10-27-boluspor-kars-yaka:away']) {
    assert.match(n1.buteurs[id].detail, /^buteurs absents ou incomplets chez la source : /);
    assert.equal(n1.buteurs[id].trouveeLe, s.carnet.complet[id].trouveeLe, 'trouvée au premier contrôle');
  }
  assert.equal(n1.buteurs['impossible:buteurs:2026-10-21-lille-galatasaray:away'].controleLe, s.carnet.complet['impossible:buteurs:2026-10-21-lille-galatasaray:away'].controleLe, 'Lille n’est pas relu');
  assert.deepEqual([n1.ids, n1.nouvelles, n1.levees], [s.carnet.idsComplet, 0, 0]);
  // … et la nuit suivante ne relit plus rien.
  assert.deepEqual([s.carnet.nuit2.audit.rencontres, s.carnet.nuit2.ids], [0, s.carnet.idsComplet]);
});

// ======================================================================== B

test('B1 — la PREUVE que FotMob donne le vent en m/s, rejouée sur la base d’essai : pour la même description, « …/Wind » commence à 9 et la description seule n’y arrive jamais (9 m/s = 20 mph = 32 km/h, le seuil « venteux » de la source) ; moyenne de 3 à 5 : le vent à 10 m en m/s', () => {
  const v = vent().vent;
  assert.ok(v.rencontres > 1000, `${v.rencontres} rencontres`);
  const avecWind = Object.keys(v.parMeteo).filter((m) => m.endsWith('/Wind'));
  assert.ok(avecWind.length >= 3, avecWind.join(', '));
  for (const m of avecWind) {
    const seule = m.slice(0, -'/Wind'.length);
    assert.equal(v.parMeteo[m].min, 9, `${m} commence à 9`);
    assert.ok(v.parMeteo[seule], `la description seule « ${seule} » existe`);
    assert.ok(v.parMeteo[seule].max <= 8, `« ${seule} » seule reste sous 9 (${v.parMeteo[seule].max})`);
  }
  assert.ok(v.toutes.moyenne >= 3 && v.toutes.moyenne <= 5, `moyenne ${v.toutes.moyenne}`);
  assert.equal(Math.round(20 * 1.609344), ventEnKmH(9), '20 mph = 32 km/h = 9 m/s');
});

test('B2 — le vent en km/h dans ce que reçoit l’IA (lineupContext.cadreDuMatch : fiche compacte, ancienne forme, instantané) et à l’écran (fotmobLabels.ventEnKmH, la même règle) ; la base et fotMobProvider.js gardent la valeur de FotMob', async () => {
  // La même règle des deux côtés : × 3,6, arrondi ; rien pour une valeur absente ou illisible.
  for (const [ms, kmh] of [[0, 0], [1, 4], [2, 7], [3, 11], [9, 32], [15, 54], ['4', 14], [null, null], [undefined, null], ['', null], ['vent', null]]) {
    assert.equal(ventEnKmH(ms), kmh, `serveur ${ms}`);
    assert.equal(L.ventEnKmH(ms), kmh, `écran ${ms}`);
  }
  // Le cadre que lit l'IA : la meta de FotMob (fixture de l'étape 41, Girona – Mallorca) avec un vent de 9 m/s.
  const meta = { ...F41.avantA.entree.compoBrute.matchInfo, windSpeed: 9 };
  const avant = JSON.stringify(meta);
  const cadre = cadreDuMatch(meta);
  assert.equal(cadre.windSpeed, 32);
  assert.equal(JSON.stringify(meta), avant, 'la meta reçue n’est jamais modifiée');
  assert.deepEqual(Object.keys(cadre), Object.keys(F41.avantA.entree.compoBrute.matchInfo), 'les mêmes champs');
  assert.equal('windSpeed' in cadreDuMatch({ stadium: 'X', windSpeed: 'illisible' }), false, 'un vent illisible n’est pas donné à l’IA');
  // La fiche compacte : « vent 32 km/h », jamais « vent 9 km/h ».
  const A = F41.avantA.entree;
  const compacte = P.buildPreMatchAnalysisRequestCompacte({ home: A.home, away: A.away, league: A.league, engineSummary: A.engineSummary, marches: C.marchesPourIA(A.engineSummary.marketPredictions), context: A.contexte, lineups: { ...A.compoBrute, matchInfo: cadre }, experience: A.experience, commenceTime: A.commenceTime, timing: A.timing });
  const message = JSON.stringify(compacte.messages ?? compacte);
  assert.ok(message.includes('vent 32 km/h'), 'la fiche compacte dit 32 km/h');
  assert.ok(!message.includes('vent 9 km/h'));
  // L'ancienne forme (JSON) : « windSpeed » à 32, et les consignes disent bien « en km/h ».
  const ancienne = P.buildPreMatchAnalysisRequest({ home: A.home, away: A.away, league: A.league, engineSummary: A.engineSummary, context: { ...A.contexte, lineups: { ...A.lineupsAncienne, matchInfo: cadre } }, experience: A.experience });
  assert.ok(JSON.stringify(ancienne).includes('\\"windSpeed\\":32'), 'l’ancienne forme reçoit 32');
  assert.match(lireSrc('core', 'ai', 'matchAiAnalysisPrompt.js'), /`windSpeed` en km\/h/);
  assert.match(lireSrc('core', 'ai', 'matchAiAnalysisService.js'), /matchInfo: lineups\.matchInfo \?\? null/, 'l’ancienne forme passe le cadre tel quel');
  // Rien de changé dans ce qui est rangé : fotMobProvider.js garde la valeur de FotMob.
  const fournisseur = lireSrc('data', 'providers', 'fotMobProvider.js');
  assert.match(fournisseur, /const wind = firstNumber\(weather\.windSpeed\);\n\s*if \(wind !== null\) meta\.windSpeed = wind;/);
  assert.doesNotMatch(fournisseur, /ventEnKmH|3\.6/);
  // L'écran : MatchInfoPanel affiche ventEnKmH(meta.windSpeed), jamais la valeur brute suivie de « km/h ».
  const panneau = fs.readFileSync(path.join(UI, 'src', 'components', 'matches', 'MatchInfoPanel.vue'), 'utf8');
  assert.match(panneau, /vent \{\{ ventEnKmH\(meta\.windSpeed\) \}\} km\/h/);
  assert.doesNotMatch(panneau, /\{\{ meta\.windSpeed \}\}/);
});

test('B3 — l’écran : le cadre d’un match (MatchInfoPanel, rendu sans navigateur) dit « vent 32 km/h » pour les 9 m/s de FotMob, rien pour un vent nul ou absent', optionsDuRendu, async () => {
  const Cadre = (await rendu.charger('/src/components/matches/MatchInfoPanel.vue')).default;
  const t = espaces(texteDe((await rendu.rendre(Cadre, { meta: { temperature: 14, weather: 'Rain/Wind', windSpeed: 9 } })).html));
  assert.ok(t.includes('vent 32 km/h'), t);
  assert.ok(!t.includes('vent 9 km/h'));
  for (const windSpeed of [0, undefined]) assert.ok(!espaces(texteDe((await rendu.rendre(Cadre, { meta: { temperature: 14, windSpeed } })).html)).includes('km/h'), String(windSpeed));
});

// ======================================================================== C

test('C1 — la liste des matchs à venir de la nuit des déroulés se calcule À PART : la même liste que dans le serveur (à l’octet), reçue en gardant la main ; l’enfant qui ne répond pas à temps → la liste refaite dans le serveur, le repli dit ; un essai (aPart faux) dans le serveur ; un autre calcul lourd en cours → l’erreur remonte (nuit reportée) ; la nuit entière jamais tenue longtemps', () => {
  const s = liste();
  assert.ok(s.reference.matchs >= 4, JSON.stringify(s.reference));
  assert.deepEqual(s.aPart, { lieu: 'a-part', repli: null, ms: true, matchs: s.reference.matchs, memes: true });
  assert.equal(s.repli.lieu, 'serveur');
  assert.match(s.repli.repli, /aucune réponse en 1 ms/);
  assert.deepEqual([s.repli.matchs, s.repli.memes], [s.reference.matchs, true]);
  assert.deepEqual(s.essai, { lieu: 'serveur', repli: null, memes: true });
  assert.deepEqual([s.pendantUnCalculLourd.leve, s.pendantUnCalculLourd.nom], [true, 'CalculLourdEnCours']);
  assert.deepEqual([s.nuit.mode, s.nuit.erreur, s.nuit.liste.lieu, s.nuit.matchs], ['complet', null, 'a-part', s.reference.matchs]);
  assert.ok(s.nuit.blocMaxMs < 300 && s.nuit.dehorsMaxMs < 300, `tenu ${s.nuit.blocMaxMs} ms (« ${s.nuit.blocMaxOu} »), vu de dehors ${s.nuit.dehorsMaxMs} ms`);
  assert.deepEqual([s.donnee.mode, s.donnee.liste], ['complet', { lieu: 'donnee' }], 'une liste donnée : jamais d’enfant');
});

test('C2 — la frontière : l’enfant de la liste ouvre la base EN LECTURE SEULE avant toute lecture et n’écrit rien ; la nuit ne calcule plus la liste d’une traite qu’en essai ou en repli ; tas plafonné ; aucun fichier du chemin de nuit de l’essai de l’étape 27 ni de l’empreinte du moteur ne change ni ne le cite', () => {
  const enfant = sansCommentaires(lireSrc('data', 'simulation', 'simulationListeEnfant.js'));
  const ouverture = enfant.indexOf('openDb({ readonly: true });');
  assert.ok(ouverture > 0 && ouverture < enfant.indexOf('matchsAVenir(instant)'), 'la base en lecture seule AVANT la liste');
  assert.equal(enfant.match(/openDb\(/g).length, 1);
  assert.doesNotMatch(enfant, /\b(INSERT|UPDATE|DELETE|REPLACE INTO|CREATE TABLE|DROP)\b|DatabaseSync|writeFile|writeJsonAtomic/);
  assert.deepEqual([...enfant.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]), ['../db/matchStatsDb.js', '../enregistreurs/gelPronostics.js']);
  const nuit = sansCommentaires(lireSrc('data', 'simulation', 'simulationNuit.js'));
  assert.equal(nuit.match(/matchsAVenir\(instant\)/g).length, 2, 'seulement l’essai et le repli de listeDesMatchsAVenir');
  assert.doesNotMatch(nuit, /matchs \?\? matchsAVenir\(/);
  assert.match(nuit, /await listeDesMatchsAVenir\(\{ instant, aPart, pauses, delaiMs: Math\.min\(delaiMs, DELAI_LISTE_MS\) \}\)/);
  assert.deepEqual([...SN.OPTIONS_ENFANT_LISTE], ['--max-old-space-size=512', '--max-semi-space-size=8']);
  assert.equal(SN.DELAI_LISTE_MS, 180_000);
  for (const f of ['data/enregistreurs/gelPronostics.js', 'data/enregistreurs/depot.js', 'data/enregistreurs/moteurABlanc.js', 'bench/essaiCandidate.js', 'core/engine/engineVersions.js', 'core/engine/engineConfig.js']) {
    assert.doesNotMatch(lireSrc(...f.split('/')), /simulationListeEnfant|listeDesMatchsAVenir/, f);
  }
});

// ======================================================================== D

test('D1 — page « Bulletin » : pendant la lecture, jamais « relancez » (« Lecture… ») ; la route qui manque vraiment (404 « Route introuvable ») et une réponse sans la situation (serveur d’avant) disent de relancer ; une autre erreur est « Illisible »', optionsDuRendu, async () => {
  const RELANCE = /relancez/;
  // Les règles.
  const enLecture = B.etatDuTexte({ lecture: { loading: true, error: null, data: null } });
  assert.deepEqual([enLecture.code, enLecture.titre], ['lecture', 'Lecture…']);
  assert.doesNotMatch(enLecture.phrase, RELANCE);
  assert.equal(B.etatDuTexte({ lecture: { loading: false, error: null, data: null } }).code, 'non-lu');
  const manque = B.etatDuTexte({ lecture: { loading: false, error: 'Le serveur n’est pas à jour : relancez demarrer-cotemaster.bat pour activer cette fonction.', data: null } });
  assert.deepEqual([manque.code, manque.ton], ['serveur-a-relancer', 'is-warning']);
  assert.match(manque.phrase, /relancez demarrer-cotemaster\.bat/);
  const autre = B.etatDuTexte({ lecture: { loading: false, error: 'Les textes du bulletin sont illisibles pour l’instant', data: null } });
  assert.deepEqual([autre.code, autre.titre], ['lecture-impossible', 'Illisible']);
  assert.doesNotMatch(autre.phrase, RELANCE);
  // Une réponse du serveur SANS la situation (un serveur d'avant) : relancer, comme avant ; sans lecture donnée : la règle d'avant.
  assert.equal(B.etatDuTexte({ situation: null, lecture: { loading: false, error: null, data: { jour: '2026-10-28' } } }).code, 'serveur-a-relancer');
  assert.equal(B.etatDuTexte({ situation: null }).code, 'serveur-a-relancer');
  // L'écran : la carte de la page « Bulletin » pendant la lecture (la page lui passe sa lecture).
  const r = await rendu.rendre(Panneau, { lecture: { loading: true, error: null, data: null } });
  const t = espaces(texteDe(r.html));
  assert.doesNotMatch(t, RELANCE, t.slice(0, 600));
  for (const bloc of ['bulletin', 'bilan']) assert.ok(espaces(texteDe(blocDe(r.html, bloc))).includes('Lecture en cours.'), bloc);
  assert.match(t, /Bulletin du jour : Lecture…/);
  assert.deepEqual(r.appels, [], 'la carte ne lit rien quand la page lui donne sa lecture');
  // La route qui manque vraiment : le message de relance, dans les blocs comme au-dessus.
  const ancien = await rendu.rendre(Panneau, { lecture: { loading: false, error: 'Le serveur n’est pas à jour : relancez demarrer-cotemaster.bat pour activer cette fonction.', data: null } });
  for (const bloc of ['bulletin', 'bilan']) assert.match(espaces(texteDe(blocDe(ancien.html, bloc))), /Pas lu .*relancez demarrer-cotemaster\.bat/, bloc);
});

test('D2 — les retours de blessure en français dans les dossiers de l’IA : le texte remis à l’IA et les phrases de l’écran (aiMemory.absentsDits), le tableau des absents (dossiersIA) — « Early January 2027 » → « début janvier 2027 » ; la règle du serveur = celle de l’écran', () => {
  const cas = ['Early January 2027', 'Mid February 2027', 'Late November 2026', 'Doubtful', 'Out for season', 'Back in training', 'Unknown', 'Early Smarch 2027', 'Fin de saison', null, ''];
  for (const x of cas) assert.equal(M.retourDit(x), L.retourPrevu(x), String(x));
  assert.equal(M.retourDit('Early January 2027'), 'début janvier 2027');
  assert.equal(M.retourDit('Mid February 2027'), 'mi-février 2027');
  const absents = { lusLe: '2026-10-27T20:00:00.000Z', match: { date: '2026-10-25', adversaire: 'Slovan Liberec' }, liste: [{ nom: 'Abdallah Gning', id: 'fotmob-1356592', motif: 'injury', retour: 'Early January 2027' }, { nom: 'X Y', id: 'fotmob-2', motif: 'suspension', retour: 'Doubtful' }, { nom: 'Z', id: null, motif: 'injury', retour: null }] };
  const phrase = M.absentsDits(absents);
  assert.ok(phrase.includes('Abdallah Gning (blessure, retour : début janvier 2027)'), phrase);
  assert.ok(phrase.includes('X Y (suspension, retour : incertain)'), phrase);
  assert.ok(phrase.includes('Z (blessure)'), phrase);
  const MOIS_ANGLAIS = /\b(Early|Mid|Late) (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b|Doubtful/;
  assert.doesNotMatch(phrase, MOIS_ANGLAIS);
  assert.doesNotMatch(M.phrasesDuDossier({ absents }).absents, MOIS_ANGLAIS);
  assert.deepEqual(DI.lignesDesAbsents({ absents }).lignes.map((l) => l.retour), ['début janvier 2027', 'incertain', 'retour non annoncé']);
});

test('D3 — le classement dans les dossiers de l’IA : « 5e en Premier League (sur 20) », jamais « 5e de EPL » ; les autres championnats gardent leur nom', () => {
  const c = { rang: 5, league: 'EPL', table: null, equipes: 20, points: 15, joues: 9, premier: { nom: 'Arsenal', points: 21 }, second: null, zone: null };
  assert.equal(M.classementDit(c), '5e en Premier League (sur 20) : 15 pts en 9 matchs, à 6 pts du 1er, Arsenal');
  assert.equal(M.classementDit({ ...c, rang: 1, premier: null, second: { nom: 'Chelsea', points: 12 } }), '1er en Premier League (sur 20) : 15 pts en 9 matchs, 3 pts d’avance sur Chelsea');
  assert.equal(M.classementDit({ ...c, league: 'La Liga - Spain', premier: null }), '5e en La Liga - Spain (sur 20) : 15 pts en 9 matchs');
  assert.equal(M.classementDit({ ...c, league: 'Copa Libertadores', table: 'Group A', premier: null }), '5e en Copa Libertadores, Group A (sur 20) : 15 pts en 9 matchs');
  assert.doesNotMatch(M.faitsDits({ classement: c, series: [] }), / de EPL\b/);
  assert.equal(M.championnatDit('EPL'), 'Premier League');
});
