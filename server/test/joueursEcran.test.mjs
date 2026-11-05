/**
 * LES CHIFFRES DES JOUEURS (étape 34, lot 1b, partie D, 03/11/2026) — la lecture et l'onglet « Joueurs », rendus côté
 * serveur, sans navigateur ni serveur de développement (aides/rendu.mjs : `fetch` remplacé, tout appel refusé et compté) :
 *   node --test test/joueursEcran.test.mjs        (depuis server/)
 *
 * Les réponses ne sont pas écrites à la main : le VRAI serveur les produit dans une copie isolée (script-joueurs-nuit.mjs :
 * un magasin fabriqué, une nuit dans le processus à part, la compo publiée, la dernière alignée et ses absents ; aucun
 * résultat réel).
 *   T-L1 la LECTURE : sept lectures par clé, AUCUNE écriture, moins de 25 ms ; « pas encore calculé » (avant la nuit, nuit en
 *        cours, match absent de la nuit), « clubs inconnus » (sans lire la base), « illisible » ; le bloc joint APRÈS
 *        l'analyse par un import() dynamique ; l'IA ne le reçoit jamais ;
 *   T-L2 l'écran = l'archive : les chiffres lus pour la compo publiée sont ceux gardés avant le coup d'envoi (même formule) ;
 *        la dernière alignée « s'il joue », l'absent annoncé retiré ;
 *   T-E1 chaque phrase (§8.2, corrigée par la critique : constats 3 et 16), exacte, sur ces vraies formes ;
 *   T-E2 les pastilles : « Effet mesuré » + « pas encore un marché » pour les familles mesurées ; sans note « pas encore
 *        mesuré » et AUCUN pourcentage ; jamais de vert sur une valeur ;
 *   T-E3 la provenance de chaque ligne, avec l'heure ; le banc : un jour sans heure inventée ;
 *   T-E4 les états vides, dits en mots ; les deux tableaux gardent TOUJOURS leurs colonnes et leurs en-têtes ;
 *   T-E5 le logo du club et le drapeau sur chaque ligne qui nomme un joueur ; le camp posé par le serveur ;
 *   T-E6 une seule place : rien sur le terrain des compositions, aucune famille « Joueurs » dans les pronostics, l'onglet
 *        juste après « Compositions » ;
 *   T-E7 aucune requête de plus à l'ouverture : l'onglet et ses règles n'importent aucun service ; la page lui passe le bloc
 *        de l'analyse déjà chargée ; le huitième contrôle anti-fuite dit en mots ;
 *   T-E8 « Tirs (plus de X) : pas calculé » et sa raison ; les mentions fixes ;
 *   T-E9 les clubs et les joueurs par identifiant FotMob : un club sans identifiant → « clubs inconnus » ; un joueur sans
 *        identifiant n'a pas de chiffre ;
 *   T-E10 le pied de chaque tableau : des nombres attendus, jamais une somme de pourcentages ; le tableau du banc (dix lignes,
 *        Σ au moins le plus grand compte, ⌀) ;
 *   T-C les constantes recopiées : les comptes de la dernière alignée = la fixture de `--comptes` ; la base recalée et les
 *        lignes du banc = celles du banc ; DESIGN.md et la feuille de route.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR, FIXTURES } from './aides/isolement.mjs';
import { UI, imp, interfacePrete, optionsDuRendu, ouvrirLeRendu, reglesPures, tableauDe, corps, entetes, texteDe } from './aides/rendu.mjs';
import { JOUEURS_AU_BANC } from '../src/data/joueurs/noteDesJoueurs.js';
import * as C from '../src/data/joueurs/chiffresDesJoueurs.js';
import * as R from '../src/data/joueurs/joueursRead.js';
import * as BANC from '../src/data/joueurs/bancDesJoueurs.js';
import { HISTORIQUE } from '../src/data/roadmap/historique.js';

const U = await imp(path.join(UI, 'src', 'utils', 'joueursABlanc.js'));
const SRC = path.join(SERVEUR, 'src');
const lireSrc = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8');
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8');
const copie = (x) => JSON.parse(JSON.stringify(x));
const VERT = /is-mesure|is-accent|cm-positive|vbadge|is-value/;

let memo = null;
function serveur() {
  if (memo) return memo;
  const c = preparerCopie({ base: false });
  try {
    const r = executer(c, path.join(SERVEUR, 'test', 'aides', 'script-joueurs-nuit.mjs'), { args: ['{}'], timeout: 300_000 });
    assert.equal(r.code, 0, `script-joueurs-nuit :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false, 'un appel réseau a été tenté');
    memo = r.json;
    return memo;
  } finally {
    c.nettoyer();
  }
}
const lecture = (cle) => {
  const l = copie(serveur().lectures[cle]);
  delete l.__mesure;
  return l;
};
const MATCH = { home: 'Club 7001', away: 'Club 7002', league: 'Ligue Joueurs', homeId: 'fotmob-7001', awayId: 'fotmob-7002' };

let rendu;
let Onglet;
before(async () => {
  if (!interfacePrete) return;
  rendu = await ouvrirLeRendu({ cibles: /PlayerPropsBoard\.vue$/, heure: '2023-06-10T11:30:00.000Z' });
  Onglet = (await rendu.charger('/src/components/analysis/PlayerPropsBoard.vue')).default;
});
after(async () => {
  await rendu?.fermer();
});
const onglet = (joueurs, match = MATCH) => rendu.rendre(Onglet, { joueurs, match });

// ================================================================ T-L : la lecture (le serveur)

test('T-L1 la LECTURE : sept lectures par clé, AUCUNE écriture, moins de 25 ms ; « pas encore calculé », « clubs inconnus » (sans lire la base), « illisible »', () => {
  const s = serveur();
  const p = s.lectures.pret;
  assert.equal(p.etat, 'pret');
  assert.ok(p.__mesure.deuxieme < 25, `${p.__mesure.deuxieme} ms`);
  assert.equal(p.__mesure.ordres.length, 7);
  assert.ok(p.__mesure.ordres.every((q) => /^SELECT /.test(q)), 'aucune écriture');
  assert.equal(p.__mesure.ordres.filter((q) => /FROM joueurs_etat WHERE cle/.test(q)).length, 3);
  assert.deepEqual([s.lectures.avant.etat, s.lectures.avant.raison], ['pas-encore-calcule', 'premiere-nuit']);
  assert.deepEqual([s.lectures.enCours.etat, s.lectures.enCours.raison], ['pas-encore-calcule', 'nuit-en-cours']);
  assert.deepEqual([s.lectures.pasDansLaNuit.etat, s.lectures.pasDansLaNuit.raison], ['pas-encore-calcule', 'match-pas-dans-la-nuit']);
  assert.deepEqual([s.lectures.clubsInconnus.etat, s.lectures.clubsInconnus.raison, s.lectures.clubsInconnus.__mesure.ordres.length], ['clubs-inconnus', 'les-deux', 0]);
  assert.deepEqual([s.lectures.illisible.etat, s.lectures.illisible.raison], ['illisible', 'base-sans-reponse']);
  assert.deepEqual([s.lectures.sansBase.etat, s.lectures.sansBase.raison], ['illisible', 'base-absente']);
  assert.deepEqual([s.lectures.sansNote.etat, s.lectures.sansNote.raison], ['pas-encore-mesure', 'note-nulle']);
  assert.ok(s.lectures.sansNote.camps.home.joueurs.length >= 11 && s.lectures.sansNote.camps.home.joueurs.every((j) => j.chiffres === null), 'sans note : les joueurs, aucun chiffre');
});

test('T-L1 le bloc `joueurs` est joint APRÈS l’analyse (import() dynamique, try/catch) ; le verdict n’en sait rien ; l’IA ne le reçoit jamais', () => {
  const controleur = lireSrc('api', 'controllers', 'analysis.controller.js');
  assert.match(controleur, /const cartons = sportId === 'football' \? await cartonsDuMatchAnalyse\(avecFraicheur, analyse\) : null;\n {2}\/\/ Étape 34[^\n]*\n {2}const joueurs = sportId === 'football' \? await joueursDuMatchAnalyse\(avecFraicheur\) : null;\n(?: {2}\/\/ Étape 38[^\n]*\n {2}const combinaison = sportId === 'football' \? await combinaisonDuMatchAnalyse\(avecFraicheur, getEngineConfig\(sportId\)\) : null;\n)? {2}(?:res\.json\(|const reponse = )\{ \.\.\.analyse, [^\n]*\.\.\.\(cartons \? \{ cartons \} : \{\}\), \.\.\.\(joueurs \? \{ joueurs \} : \{\}\)(?:, \.\.\.\(combinaison \? \{ combinaison \} : \{\}\))? \}(?:\);|;\n {2}res\.json\(analyseAvecLaMise\(reponse, \{ contexte: contexteMise, match: avecFraicheur \}\)\);)/);
  assert.match(controleur, /async function joueursDuMatchAnalyse\(match\) \{\n {2}try \{\n {4}const \{ joueursDuMatch \} = await import\('\.\.\/\.\.\/data\/joueurs\/joueursRead\.js'\);\n {4}return joueursDuMatch\(\{ match, database: openDb\(\), maintenant: Date\.now\(\) \}\);\n {2}\} catch \{\n {4}return \{ version: 1, etat: 'illisible', raison: 'lecture-ratee' \};/);
  assert.doesNotMatch(controleur, /^import .*joueurs/m, 'aucun import statique de data/joueurs/');
  const service = lireSrc('core', 'ai', 'matchAiAnalysisService.js');
  const resume = service.slice(service.indexOf('function resumeDuMoteur('), service.indexOf('\n}\n', service.indexOf('function resumeDuMoteur(')));
  assert.ok(resume.length > 200 && !/joueurs\b|\.\.\.engineResult/.test(resume), 'le résumé donné à l’IA : des champs nommés, jamais les joueurs à blanc');
  for (const f of ['core/ai/compactContext.js', 'core/ai/matchAiAnalysisPrompt.js', 'core/engine/verdictPari.js']) assert.doesNotMatch(lireSrc(...f.split('/')), /\.joueurs\b|joueursDuMatch|joueurs-a-blanc/, `${f} ne lit pas le bloc`);
});

test('T-L2 l’écran = l’archive : les chiffres lus pour la compo publiée sont ceux gardés avant le coup d’envoi ; la dernière alignée « s’il joue », l’absent annoncé retiré', () => {
  const s = serveur();
  const p = s.lectures.pret;
  assert.equal(p.compo.etat, 'publiee');
  assert.equal(p.compo.lueLe, s.avantMatch.publiee.compo_lue_le, 'la même compo que la ligne gardée');
  const lignes = JSON.parse(s.avantMatch.publiee.joueurs);
  let compares = 0;
  for (const camp of ['home', 'away']) {
    for (const j of p.camps[camp].joueurs) {
      const l = lignes.find((x) => x[0] === j.id && x[1] === (camp === 'home' ? 'h' : 'a'));
      assert.ok(l, `${j.id} gardé`);
      for (const [k, i] of [['marque', 5], ['cadres', 6], ['cadres2', 7], ['averti', 8], ['passeur', 9]]) assert.ok(Math.abs(j.chiffres[k].p - l[i]) < 6e-5, `${j.id} ${k} : écran ${j.chiffres[k].p}, archive ${l[i]}`);
      compares++;
    }
  }
  assert.ok(compares >= 28, `${compares} joueurs comparés`);
  const d = s.lectures.derniere;
  assert.equal(d.compo.etat, 'derniere-alignee');
  assert.deepEqual(d.compo.retires.home.map((r) => r.id), [s.absent]);
  assert.ok(!d.camps.home.joueurs.some((j) => j.id === s.absent));
  assert.equal(d.camps.home.joueurs.length, 10);
  assert.ok(d.camps.home.joueurs.every((j) => j.sIlJoue && j.titulaire));
  // « S'il joue » = le mélange des comptes de compositions (critique, constat 3).
  assert.ok(Math.abs(C.sIlJoue(0.4, 0.15) - (C.P_T * 0.4 + C.P_E * 0.15) / (C.P_T + C.P_E)) < 1e-15);
  assert.ok(C.sIlJoue(0.4, 0.15) < 0.4 && C.sIlJoue(0.4, 0.15) > 0.36, `${C.sIlJoue(0.4, 0.15)}`);
});

// ================================================================ T-E : l'écran (les mots et le rendu)

test('T-E1 chaque phrase, exacte, sur les vraies formes', () => {
  const d = U.joueursDit(lecture('pret'));
  assert.deepEqual(d.enTete, { eyebrow: 'À blanc · pas encore un marché', titre: 'Joueurs', sousTitre: 'Les chances de chaque joueur de marquer, de cadrer un tir, d’être averti et de faire une passe décisive, calculées depuis le magasin FotMob. Elles n’entrent dans aucun pronostic, aucune value et aucun pari conseillé.' });
  assert.equal(d.compo.texte, 'Compo publiée par FotMob, lue à 13 h 10. FotMob ne dit pas si c’est l’officielle : à moins d’une heure du coup d’envoi, c’est presque toujours elle.');
  const p = lecture('pret');
  const r = p.base.recalees;
  const v = (x, n) => x.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n });
  assert.equal(d.base.texte, `Buts attendus : Club 7001 ${v(r.home.lambda, 2)}, Club 7002 ${v(r.away.lambda, 2)} — calculés par le modèle de buts de l’étape 27 sans les cotes, recalé au banc d’essai de l’étape 34 (nuit du 09/06). Tirs cadrés attendus : ${v(r.home.S, 1)} et ${v(r.away.S, 1)}. Cartons attendus : ${v(r.home.C, 1)} et ${v(r.away.C, 1)} (étape 33).`);
  const dd = U.joueursDit(lecture('derniere'));
  assert.equal(dd.compo.texte, 'Compo pas encore publiée : chiffres « s’il joue », sur la dernière compo alignée par chaque équipe (Club 7003 le 07/06, Club 7004 le 07/06) ; les joueurs annoncés absents par FotMob sont retirés (Joueur 700304, blessé). Au banc d’essai, 74 % des titulaires d’une dernière compo l’ont été au match suivant, 10 % sont entrés en jeu.');
  // Une compo lue plus de 90 minutes avant le coup d'envoi : « ce peut être une prévision ».
  const tot = lecture('pret');
  tot.compo.minutesAvant = 300;
  assert.match(U.joueursDit(tot).compo.texte, / Lue 5 h avant le coup d’envoi : ce peut être une prévision de FotMob\.$/);
  // Une case : « 23 % » et « cote juste 4,35 » ; au moins deux tirs cadrés au survol.
  const j = d.camps[0].titulaires.find((x) => x.cases.marque.p !== '—');
  assert.match(j.cases.marque.p, /^\d+(,\d)? %$/);
  assert.match(j.cases.marque.cote, /^cote juste (\d+,\d{2}|—)$/);
  assert.match(j.cases.cadres.titre, /^Au moins deux tirs cadrés : \d+(,\d)? % \(cote juste (\d+,\d{2}|—)\)$/);
  assert.equal(U.pourcent(0.2312), '23 %');
  assert.equal(U.pourcent(0.0432), '4,3 %');
  assert.equal(U.coteDite(4.35), 'cote juste 4,35');
  assert.equal(U.coteDite(null), 'cote juste —');
});

test('T-E2 les pastilles : « Effet mesuré » + « pas encore un marché » pour les familles mesurées ; sans note « pas encore mesuré » et aucun pourcentage ; jamais de vert sur une valeur', async (t) => {
  const d = U.joueursDit(lecture('pret'));
  for (const p of d.pastilles) {
    const s = JOUEURS_AU_BANC.statuts[p.famille];
    assert.equal(p.cle, s.statut === 'mesure' ? 'mesure' : 'poste');
    if (p.vert) assert.equal(p.sous, 'pas encore un marché');
    assert.equal(p.calibration.texte, `Calibré au banc : écart moyen ${s.calibre.ecartMoyenPoints.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} point`);
  }
  assert.deepEqual(U.pastilleDe({ statut: 'poste' }), { cle: 'poste', libelle: 'Chiffre du poste', sous: null, titre: 'les chiffres propres au joueur ne sont pas prouvés au banc d’essai', vert: false });
  assert.deepEqual(U.calibrationDite({ calibre: { ecartMoyenPoints: 1.6, calibre: false } }), { cle: 'pas-calibre', texte: 'Pas calibré au banc : écart moyen 1,6 point — à prendre avec prudence', ambre: true });
  const sn = U.joueursDit(lecture('sansNote'));
  assert.deepEqual(sn.etat.texte, 'Pas encore mesuré au banc d’essai : aucun chiffre montré tant que le banc n’a pas parlé.');
  assert.ok(sn.pastilles.every((p) => p.cle === 'non-mesure' && !p.vert));
  // Les règles de l'écran elles-mêmes : un bloc qui n'est pas « prêt » ne montre aucun pourcentage, même s'il en porte.
  const pasPret = { ...lecture('pret'), etat: 'pas-encore-mesure' };
  for (const c of U.joueursDit(pasPret).camps) for (const l of [...c.titulaires, ...c.remplacants]) for (const f of U.FAMILLES) assert.equal(l.cases[f].p, '—', `${l.nom} ${f}`);
  for (const c of sn.camps) for (const l of [...c.titulaires, ...c.remplacants]) for (const f of U.FAMILLES) assert.equal(l.cases[f].p, '—');
  if (!interfacePrete) return t.skip(optionsDuRendu.skip);
  const r = await onglet(lecture('sansNote'));
  for (const t2 of ['joueurs-home', 'joueurs-away']) assert.doesNotMatch(texteDe(corps(tableauDe(r.html, t2)).join('')), /%/, 'sans note : aucun pourcentage');
  const html = (await onglet(lecture('pret'))).html;
  const verts = [...html.matchAll(/class="[^"]*\b(is-mesure)\b[^"]*"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => texteDe(m[2]));
  assert.ok(verts.length && verts.every((t3) => t3 === 'Effet mesuré'), 'le vert : « Effet mesuré » seulement');
  for (const l of corps(tableauDe(html, 'joueurs-home'))) assert.doesNotMatch(l, VERT, 'jamais de vert sur une valeur');
});

test('T-E3 la provenance : les sources réelles avec l’heure ; le banc : un jour sans heure inventée', () => {
  const d = U.joueursDit(lecture('pret'));
  assert.deepEqual(d.provenances.map((p) => [p.cle, p.source, p.action]), [
    ['parts', 'magasin FotMob (feuilles des matchs déjà joués)', 'calculé'],
    ['compo', 'FotMob, page du match', 'lue'],
    ['buts', 'modèle de buts de l’étape 27, sans les cotes, recalé au banc d’essai de l’étape 34', 'calculé'],
    ['cartons', 'étape 33 (moyenne du championnat pour ce côté)', 'calculé'],
    ['banc', 'banc d’essai de l’étape 34 (magasin 2023-2026)', 'calculé']
  ]);
  const p = lecture('pret');
  assert.equal(d.provenances[0].releveLe, p.nuit.calculeLe);
  assert.equal(d.provenances[1].releveLe, p.compo.lueLe);
  assert.equal(d.provenances[4].releveLe, null);
  assert.equal(d.provenances[4].jourSeul, '03/11/2026');
  const dd = U.joueursDit(lecture('derniere'));
  assert.equal(dd.provenances[1].source, 'magasin (dernière compo alignée du 07/06 et du 07/06)');
  assert.equal(dd.provenances[1].action, 'absents lus');
});

test('T-E4 les états vides, dits en mots ; les deux tableaux gardent leurs colonnes et leurs en-têtes', async (t) => {
  const vides = { avant: 'Pas encore calculé : la prochaine passe de nuit le fera.', clubsInconnus: 'Chiffres indisponibles : Club 7001 et Club 7002 ne sont pas reconnus par son identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent).', illisible: 'Chiffres des joueurs illisibles : la base n’a pas répondu. Les autres onglets ne sont pas touchés.' };
  for (const [cle, texte] of Object.entries(vides)) assert.equal(U.joueursDit(lecture(cle)).etat.texte, texte, cle);
  assert.equal(U.etatDit({ etat: 'pas-de-compo' }).texte, 'Pas encore de compo, ni de dernière compo au magasin : aucun chiffre.');
  assert.equal(U.etatDit(undefined).cle, 'ancien-serveur');
  assert.equal(U.etatDit({ etat: 'clubs-inconnus', raison: 'exterieur', clubs: { away: { nom: 'Port' } } }).texte, 'Chiffres indisponibles : Port n’est pas reconnu par son identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent).');
  if (!interfacePrete) return t.skip(optionsDuRendu.skip);
  const COLS = ['Joueur', 'Poste', 'Minutes attendues', 'Marque', 'Au moins un tir cadré', 'Averti', 'Passe décisive'];
  for (const bloc of [lecture('pret'), lecture('avant'), lecture('illisible'), lecture('sansNote'), undefined, { etat: 'illisible', raison: 'analyse-en-erreur' }]) {
    const r = await onglet(bloc);
    for (const t2 of ['joueurs-home', 'joueurs-away']) assert.deepEqual(entetes(tableauDe(r.html, t2)), COLS, `${bloc?.etat ?? 'undefined'} : ${t2}`);
    assert.equal(entetes(tableauDe(r.html, 'banc-des-joueurs')).length, 5);
    assert.match(r.html, /data-bloc="joueurs-a-blanc"/);
  }
});

test('T-E5 le logo du club et le drapeau sur chaque ligne qui nomme un joueur ; le camp vient du serveur', async (t) => {
  const p = lecture('pret');
  assert.ok(p.camps.home.joueurs.every((j) => j.pays === 'FRA'), 'la nationalité vient du bloc (aucune requête)');
  if (!interfacePrete) return t.skip(optionsDuRendu.skip);
  const r = await onglet(p);
  for (const [t2, id] of [['joueurs-home', '7001'], ['joueurs-away', '7002']]) {
    const lignes = corps(tableauDe(r.html, t2)).filter((l) => /data-joueur="\d+"/.test(l));
    assert.ok(lignes.length >= 14, `${lignes.length} lignes`);
    for (const l of lignes) {
      assert.match(l, /class="flag"/, 'un drapeau');
      assert.match(l, new RegExp(`crest|logo|fotmob-${id}|teamlogo`, 'i'), 'un logo');
    }
  }
});

test('T-E6 une seule place : l’onglet juste après « Compositions » ; rien sur le terrain ; aucune famille « Joueurs » dans les pronostics', () => {
  const vue = lireUi('views', 'UpcomingMatchView.vue');
  assert.match(vue, /\{ id: 'lineups', label: 'Compositions' \},\n {2}\/\/ Étape 34[^\n]*\n {2}\{ id: 'joueurs', label: 'Joueurs' \},\n {2}\{ id: 'stats', label: 'Statistiques' \},/);
  assert.match(vue, /<PlayerPropsBoard\n {8}v-else-if="tab === 'joueurs'"/);
  assert.doesNotMatch(lireUi('components', 'matches', 'LineupPitch.vue'), /PlayerProps|joueursABlanc|chiffres des joueurs|joueurs-a-blanc/i);
  assert.doesNotMatch(lireUi('components', 'analysis', 'MarketPicksBoard.vue'), /Joueurs|anytimeScorer|buteur/i);
  assert.deepEqual([(vue.match(/^import PlayerPropsBoard from /gm) ?? []).length, (vue.match(/<PlayerPropsBoard/g) ?? []).length], [1, 1], 'importé une fois, posé une fois');
});

test('T-E7 aucune requête de plus : l’onglet et ses règles n’importent aucun service ; le rendu ne fait aucun appel ; le huitième contrôle anti-fuite dit en mots', async (t) => {
  const carte = lireUi('components', 'analysis', 'PlayerPropsBoard.vue');
  assert.doesNotMatch(carte, /services\/|fetch\(|axios|playerInfoFor|matchStatsApi/, 'aucun service');
  // Le drapeau : le code pays du bloc, jamais l'identifiant (PlayerFlag le demanderait alors au serveur : players-info).
  assert.match(carte, /<PlayerFlag :code="l\.pays"/);
  assert.doesNotMatch(carte, /player-id|playerId/, 'aucun drapeau demandé par identifiant');
  assert.deepEqual([...reglesPures('joueursABlanc.js')].filter((f) => /services|stores/.test(f)), []);
  const A = await imp(path.join(UI, 'src', 'utils', 'controlesAntiFuite.js'));
  // Étape 38 (lot 1b, 04/11/2026) : le neuvième contrôle (la combinaison à blanc) vient après lui ; il reste le huitième.
  assert.deepEqual(A.CONTROLES_ANTI_FUITE[7], { cle: 'joueursABlanc', nom: 'Chiffres des joueurs (parts au jour du match)' });
  assert.deepEqual(
    A.controlesAntiFuiteDits({ joueursABlanc: { ecarts: [{ joueur: 700102, J: '2026-10-12', colonne: 'derniere', texte: 'joueur n° 700102 avant le 12/10/2026 : dernière apparition le 12/10/2026 dans la passe, le 05/10/2026 dans le magasin relu — un jour qui n’est pas d’avant le match' }], total: 1, lignes: 20, updatedAt: '2026-11-03T02:10:00.000Z' } }).map((x) => x.texte),
    ['Chiffres des joueurs (parts au jour du match) : 1 écart sur 20 lignes recalculées (contrôle du 03/11/2026 à 03:10) — par exemple joueur n° 700102 avant le 12/10/2026 : dernière apparition le 12/10/2026 dans la passe, le 05/10/2026 dans le magasin relu — un jour qui n’est pas d’avant le match.']
  );
  if (!interfacePrete) return t.skip(optionsDuRendu.skip);
  const r = await onglet(lecture('pret'));
  assert.deepEqual(r.appels, [], 'aucune requête');
});

test('T-E8 « Tirs (plus de X) : pas calculé » et sa raison ; les mentions fixes', () => {
  const d = U.joueursDit(lecture('pret'));
  assert.deepEqual(d.mentions, [
    'Un but contre son camp ne compte pas pour un buteur. Les chiffres valent pour le temps réglementaire et le temps additionnel. Un joueur qui ne joue pas : pari remboursé chez la plupart des bookmakers (à vérifier chez le vôtre).',
    'Avertissement : un carton jaune ou rouge, deuxième jaune comprise ; un carton reçu sur le banc compte aussi dans ces chiffres (FotMob ne le distingue pas avant octobre 2026).',
    'Tirs (plus de X) : pas calculé. Le magasin ne garde pas les tirs contrés d’un joueur ; ce sera possible après une correction du relevé FotMob.',
    JOUEURS_AU_BANC.statuts.marque.tireur ? 'Les penalties vont au tireur que l’appli reconnaît par son identifiant FotMob.' : 'Les penalties sont répartis comme d’habitude pour chaque poste : le tireur n’a pas été prouvé au banc d’essai.'
  ]);
});

test('T-E9 les clubs et les joueurs par identifiant FotMob : un club sans identifiant → « clubs inconnus » sans lire la base ; un joueur sans identifiant n’a pas de chiffre', () => {
  const s = serveur();
  assert.equal(s.lectures.clubsInconnus.__mesure.ordres.length, 0);
  const p = lecture('pret');
  p.camps.home.joueurs.push({ ...p.camps.home.joueurs[0], id: null, brut: null, nom: 'Inconnu Essai', sansIdentifiant: true, sansFiche: false });
  const l = U.joueursDit(p).camps[0].titulaires.find((x) => x.nom === 'Inconnu Essai');
  assert.deepEqual(l.note, { cle: 'sans-identifiant', texte: 'Inconnu Essai : sans identifiant FotMob, pas de chiffre (sa part reste comptée pour l’équipe).' });
  assert.ok(U.FAMILLES.every((f) => l.cases[f].p === '—'));
  // Côté serveur : un homonyme sans identifiant n'hérite jamais d'une fiche (les fiches par numéro seulement).
  assert.equal(R.fichesDe({ prepare: () => ({ all: () => { throw new Error('ne doit pas lire'); } }) }, [null, 0, -3]).size, 0);
});

test('T-E10 le pied de chaque tableau : des nombres attendus, jamais une somme de pourcentages ; le tableau du banc', () => {
  const d = U.joueursDit(lecture('pret'));
  for (const c of d.camps) {
    assert.match(c.pied, /^Σ attendus des titulaires : \d+,\d{2} buts? \(l’équipe \d+,\d{2} ; dont \d+,\d{2} sur des buts contre son camp de l’adversaire ; \d+,\d{2} pour les remplaçants qui entreront\), \d+,\d tirs? cadrés?, \d+,\d joueurs? avertis?, \d+,\d passes? décisives?\.$/);
    assert.doesNotMatch(c.pied, /%/);
  }
  const b = d.tableau;
  assert.equal(b.lignes.length, 10);
  const matchs = JOUEURS_AU_BANC.variantes.map((v) => v.matchsJuges);
  assert.equal(b.somme, `au moins ${Math.max(...matchs).toLocaleString('fr-FR')}`);
  assert.match(b.moyenne, /^\d,\d{2} point$/);
  assert.deepEqual(b.lignes.filter((l) => l.mesureUtile).map((l) => l.cle), ['buteurs', 'tireur', 'cadres', 'averti', 'passeur']);
  assert.ok(b.lignes.filter((l) => /^faux/.test(l.cle)).every((l) => !l.mesureUtile && /Pas prouvé|Moins bon/.test(l.verdict)));
  const MOINS = String.fromCharCode(0x2212);
  assert.ok(b.lignes.some((l) => l.gain.startsWith(MOINS)), 'le vrai signe moins');
  assert.match(b.pied, /11 essais comptés/);
});

test('T-C les constantes recopiées : la dernière alignée = la fixture de --comptes ; la base recalée et les lignes du banc = celles du banc ; DESIGN.md et la feuille de route', () => {
  const comptes = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'comptes-joueurs-etape34.json'), 'utf8'));
  const somme = (k) => ['A', 'B'].reduce((s, p) => s + comptes.comptes.parPli[p].dernieres[k], 0);
  assert.deepEqual(
    { t: C.DERNIERE_ALIGNEE.titulairesDeLaFeuille, m: C.DERNIERE_ALIGNEE.titulairesAuMatch, e: C.DERNIERE_ALIGNEE.entres, a: C.DERNIERE_ALIGNEE.absents },
    { t: somme('titulairesDeLaFeuille'), m: somme('titulairesAuMatch'), e: somme('entres'), a: somme('absents') }
  );
  assert.equal(comptes.aucunAttenduNiPerte, true, 'des comptes de compositions, aucun résultat');
  for (const [base, dom] of [[1.4, true], [0.9, false], [7, true]]) {
    const r = JOUEURS_AU_BANC.final.recalageLambda;
    assert.equal(C.baseRecalee(r, dom, base, [0.2, 6]), BANC.baseRecalee(r, dom, base, [0.2, 6]));
  }
  assert.deepEqual({ ...R.LIGNES_DU_BANC }, { ...BANC.LIGNES_DU_BANC });
  const design = fs.readFileSync(path.join(UI, 'DESIGN.md'), 'utf8');
  assert.match(design, /Depuis l'étape 34 du plan \(lot 1, 03\/11\/2026\) : \*\*les chiffres des joueurs, à blanc\*\*/);
  assert.match(design, /`components\/analysis\/PlayerPropsBoard\.vue` \(« Joueurs », sur-titre « À blanc · pas encore un marché »/);
  const h34 = HISTORIQUE.filter((h) => h.etape === '34');
  assert.equal(h34.length, 1);
  assert.match(h34[0].partielle, /^lot 1 livré : les chiffres des joueurs calculés à blanc, mesurés au banc, gardés avant chaque match ; lot 2 au verdict de l’étape 27 et avec votre accord/);
  assert.doesNotMatch(h34[0].mesure, /TESTS_34/, 'les chiffres des tests écrits');
});

test('T-L3 la formule de l’écran : « s’il joue » = le mélange des chiffres titulaire et entrant ; un gardien montre le chiffre de son poste ; la base recalée comme au banc', () => {
  const p = C.parametresDeLEcran(JOUEURS_AU_BANC);
  const rep = [0.09, 0.009, 0.09, 0.08, 0.09];
  const joueur = (id, poste, fort) => ({ id, poste, m: 80, mEntre: 25, X: fort ? [3, 0.5, 9, 2, 3] : [0, 0, 0, 0, 0], E: fort ? [1, 0.1, 3, 1, 1] : [0, 0, 0, 0, 0], repere: rep, apparitions: fort ? 30 : 0 });
  const entrees = { titulaires: [joueur(1, 1, true), joueur(2, 1, false), ...Array.from({ length: 9 }, (_, i) => joueur(10 + i, 3, i === 0))], remplacants: [], bloc: { repere: rep }, r0: 25, e0: 0.4 };
  const base = { lambdaS: 1.4, Sraw: 4.5, C: 2.1 };
  const pub = C.chiffresDUnCamp({ entrees, base, dom: true, p, etat: 'publiee' });
  const der = C.chiffresDUnCamp({ entrees, base, dom: true, p, etat: 'derniere-alignee' });
  // Le gardien avec un passé fort et le gardien sans passé : le même chiffre (celui du poste), quelle que soit la compo.
  for (const c of [pub, der]) for (const f of ['marque', 'cadres', 'averti', 'passeur']) assert.ok(Math.abs(c.titulaires[0].chiffres[f] - c.titulaires[1].chiffres[f]) < 1e-12, f);
  // « S'il joue » : le mélange p_t, p_e du titulaire et de l'entrant (25 minutes), jamais le seul chiffre de titulaire.
  const j = der.titulaires[2];
  assert.ok(j.chiffres.marque < pub.titulaires[2].chiffres.marque, 's’il joue < s’il est titulaire');
  const seul = { ...entrees, titulaires: entrees.titulaires.map((x) => ({ ...x, m: x === entrees.titulaires[2] ? x.m : x.m })) };
  void seul;
  assert.ok(Math.abs(C.sIlJoue(pub.titulaires[2].chiffres.marque, 0) - (C.P_T * pub.titulaires[2].chiffres.marque) / (C.P_T + C.P_E)) < 1e-15);
  // La base recalée = celle du banc (recalages appris sur A ∪ B), λ bornée.
  const r = C.basesRecalees(base, true, p);
  assert.equal(r.lambda, BANC.baseRecalee(JOUEURS_AU_BANC.final.recalageLambda, true, 1.4, [0.2, 6]));
  assert.equal(r.S, BANC.baseRecalee(JOUEURS_AU_BANC.final.recalageCadres, true, 4.5));
  assert.equal(pub.base.lambda, r.lambda);
  // Les parts se rajoutent : Σ des titulaires + bloc = 1 pour chaque signal (la normalisation du banc).
  for (let s = 0; s < 5; s++) {
    const x = C.partsDUnSignal(entrees, s, 'B', p.kappa[['np', 'pen', 'sot', 'av', 'xa'][s]]);
    assert.ok(Math.abs(x.tit.reduce((a, b) => a + b, 0) + x.bloc - 1) < 1e-12);
  }
});
