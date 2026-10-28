/**
 * La boucle de correction (étape 26 du plan, partie B, 28/10/2026) — LA CORRECTION FACTICE du « fini quand » : le
 * circuit complet, dans le bac, heure figée, matchs fabriqués, une phase par sous-processus
 * (aides/script-boucle-circuit.mjs), dans UNE copie isolée SANS la candidate du code dont les réglages portent le
 * modèle de buts de l'étape 27 — l'état « après l'adoption de la 27 et la mise à jour qui suit son verdict » (R1 est
 * reporté : aujourd'hui la 27 occupe la place et rien ne part, cf. relaisEtape27.test.mjs) :
 *   tri du mois (vrai défaut) → proposition ρ → banc au clic (dans un processus à part) → « Mettre à l'essai » → essai à
 *   blanc → jugée « retenu » (compléments, sûreté et porte d'adoption de l'étape 25) → adoptée au clic → retirée par un
 *   retour arrière ; puis les chemins négatifs (formulaire, refus, file, périmée, rejetée, banc interrompu, reprise).
 * « Aucun gros changement sans clic de Pierre » : engine-config.json ne change qu'aux clics simulés (adopter, retour,
 * Réglages). Vérification finale, constat 3 (une copie à part) : une erreur à l'étape « propositions » garde l'étape due
 * tant que son alerte est levée, et la passe suivante refait les propositions sur le dernier tri rangé.
 *   node --test test/boucleCorrectionCircuit.test.mjs        (depuis server/)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { preparerCopie, sansCandidateDuCode, executer, SERVEUR } from './aides/isolement.mjs';
import { CANDIDATE_EN_ESSAI } from '../src/core/engine/engineVersions.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-boucle-circuit.mjs');
const MDB = JSON.parse(JSON.stringify(CANDIDATE_EN_ESSAI.modifications.football.modeleDeButs));
const PHASES = [
  ['preparer', '2026-09-30T12:00:00.000Z'],
  ['tri', '2027-01-01T07:00:00.000Z'],
  ['banc', '2027-01-01T08:00:00.000Z'],
  ['accepter', '2027-01-02T09:00:00.000Z'],
  ['nuit-1', '2027-01-03T03:00:00.000Z'],
  ['essai', '2027-01-27T03:00:00.000Z'],
  ['adopter', '2027-01-28T10:00:00.000Z'],
  ['retrait', '2027-01-29T10:00:00.000Z'],
  ['negatifs-1', '2027-01-30T10:00:00.000Z'],
  ['negatifs-2', '2027-01-31T03:00:00.000Z'],
  ['negatifs-3', '2027-01-31T12:00:00.000Z'],
  ['negatifs-4', '2027-02-01T03:00:00.000Z'],
  ['negatifs-5', '2027-02-24T03:00:00.000Z'],
  ['orphelins', '2027-02-24T10:00:00.000Z']
];
const RHO = 'c26-2026-12-rho-1';
const EMPREINTE_DU_MOTEUR = '16f2459db183a99576365047da98b7777687ef05';

let sorties = null;
function circuit() {
  if (sorties) return sorties;
  const copie = sansCandidateDuCode(preparerCopie({ runtime: { 'engine-config.json': { football: { modeleDeButs: MDB } } } }));
  try {
    const s = {};
    for (const [phase, maintenant] of PHASES) {
      const r = executer(copie, SCRIPT, { args: [phase], maintenant, timeout: 600_000 });
      assert.equal(r.code, 0, `${phase} : ${r.erreurs.slice(-3000)}`);
      assert.equal(r.reseau, false, `${phase} : aucun appel réseau`);
      assert.ok(r.json, `${phase} : sortie illisible : ${r.sortie.slice(-500)}`);
      s[phase] = r.json;
    }
    sorties = s;
    return s;
  } finally {
    copie.nettoyer();
  }
}

test('le départ : version 1 notée avec le modèle de buts de l’étape 27 (ρ −0,05), trois mois de pronostics gelés fabriqués ; le code du moteur de la copie est celui du bac (16f2459…)', () => {
  const p = circuit().preparer;
  assert.deepEqual(p.registre.versions, [[1, 'premier-demarrage']]);
  assert.equal(p.registre.candidate, null);
  assert.deepEqual(p.reglages, { avecModeleDeButs: true, rho: -0.05 });
  assert.deepEqual(p.plantes, { pronostics: 3 * 360 * 6, matchs: 3 * 360 });
  assert.equal(p.code, EMPREINTE_DU_MOTEUR);
});

test('le tri : la calibration fige octobre → décembre, puis la boucle les trie DANS L’ORDRE (octobre « trop tôt », novembre et décembre : « Les 2 équipes marquent » annonce trop haut, vrai défaut) ; l’étape attend le gel de la calibration', () => {
  const t = circuit().tri;
  assert.equal(t.dueAvant, false, 'avant le gel de la calibration, rien à trier');
  assert.equal(t.dueApres, true);
  assert.equal(t.calibration.status, 'ok');
  assert.equal(t.passe.status, 'ok');
  assert.deepEqual(t.passe.tris.map((x) => [x.mois, x.ecrit]), [['2026-10', true], ['2026-11', true], ['2026-12', true]]);
  assert.equal(t.passe.tris[0].statuts['trop-tot'], 10, 'octobre : un seul mois compté');
  assert.deepEqual(t.passe.tris[0].vraisDefauts, []);
  for (const m of [1, 2]) assert.deepEqual(t.passe.tris[m].vraisDefauts, ['bothTeamsScore|niveau'], t.passe.tris[m].mois);
  assert.equal(t.passe.tris[2].statuts['dans-la-marge'], 9, 'tout le reste est exactement réalisé : malchance');
  assert.equal(t.passe.alert.value, null);
  assert.match(t.passe.summary, /^Tri d’octobre 2026 figé \(version n° 1\) : 10 trop tôt/);
  assert.match(t.passe.summary, /La boucle ne change aucun chiffre du moteur/);
});

test('les propositions : UNE, depuis DÉCEMBRE seulement (jamais depuis un mois rattrapé plus ancien, B40) — ρ −0,05 → −0,02 (B38) ; sa déclaration porte l’objet modeleDeButs ENTIER, une seule sous-clé changée, les 4 familles de buts et le témoin, l’horizon 800/21, la fenêtre du tri ; rien d’écrit au registre des versions, à celui de la mesure ni aux réglages', () => {
  const t = circuit().tri;
  assert.deepEqual(t.passe.creees, [{ id: RHO, levier: 'modeleDeButs.rho', avant: -0.05, apres: -0.02 }]);
  assert.deepEqual(t.propositions.map((p) => [p.id, p.etat, p.source, p.triMois]), [[RHO, 'proposee', 'regle', '2026-12']]);
  const d = t.declaration;
  assert.equal(d.etape, '26');
  assert.deepEqual(d.modifications.football.modeleDeButs, { ...MDB, rho: -0.02 });
  assert.deepEqual(d.marches, ['totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal']);
  assert.deepEqual(d.temoins, ['scoreExact']);
  assert.deepEqual(d.horizon, { matchs: 800, jours: 21 });
  assert.deepEqual(d.vues.map((v) => [v.de, v.a]), [['2026-10-01', '2026-12-31']]);
  assert.doesNotMatch(d.enMots, /\n|rho|lignée|variante/i);
  assert.deepEqual(t.ecritures, { config: true, versions: true, mesure: true }, 'proposer n’écrit ni les réglages, ni le registre des versions, ni celui de la mesure');
  assert.deepEqual(t.seconde.tris, [], 'un tri figé ne se refait pas');
  assert.deepEqual(t.seconde.creees, []);
  assert.equal(t.propositionsApres, 1);
  assert.deepEqual(t.journal.map((e) => e.evenement), ['tri', 'tri', 'tri', 'proposee']);
  assert.match(t.journal[3].phrase, /^Proposée par le tri de décembre 2026 : « Les 2 équipes marquent » annonce trop souvent « les deux équipes marquent » \(10,0 points sur octobre-décembre 2026, 1\s080 matchs\) ; corrélation des petits scores : −0,05 → −0,02\./);
});

test('B43 : les règles, le formulaire et les déclarations appelés avec l’OBJET VIVANT des réglages en service (celui du cache du moteur), pour chaque levier, ne le modifient jamais (même empreinte, même texte)', () => {
  assert.deepEqual(circuit().tri.b43, { memeObjet: true, empreinte: true, texte: true });
});

test('ce que montrent la route et Santé du moteur après le tri : 1 correction à décider (« à mesurer au banc »), la place libre, le formulaire ouvert ; le bloc de Santé résume (« 1 à décider », la légende du tri, 3 entrées du journal au plus) et renvoie vers Historique moteur', () => {
  const t = circuit().tri;
  assert.equal(t.etat.disponible, true);
  assert.deepEqual(t.etat.aDecider, [RHO]);
  assert.equal(t.etat.place.prise, false);
  assert.equal(t.etat.formulaire.ouvert, true);
  assert.equal(t.etat.dernierTri.mois, '2026-12');
  assert.deepEqual(t.etat.propositions[0].actions, { banc: true, accepter: false, refuser: true, retirer: false });
  assert.equal(t.triDecembre.tri.cases.length, 22);
  const b = t.sante;
  assert.equal(b.etat, 'attention');
  assert.equal(b.valeur, '1 à décider');
  assert.match(b.legende, /^tri de décembre 2026 : 1 vrai défaut, 9 dans la marge/);
  assert.deepEqual(b.lien, { chemin: '/historique-moteur', query: { onglet: 'moteur' }, libelle: 'Historique moteur › Écarts du mois (malchance ou vrai défaut)' });
  assert.ok(b.journal.length <= 3);
  assert.equal(b.mesureLe, '2027-01-01T07:00:00.000Z');
});

test('le banc au clic : refusé en mots pendant un autre calcul lourd (B39) et pendant une passe, RIEN de compté ; lancé, il prend le jeton du calcul lourd et le verrou « banc-correction », compte la correction AVANT le fork, tourne dans un PROCESSUS À PART (B47), range le verdict, la mémoire et le retard de boucle ; « mesurée » (indicatif)', () => {
  const b = circuit().banc;
  assert.equal(b.pendantUnCalculLourd.code, 409);
  assert.equal(b.pendantUnCalculLourd.corps.raison, 'calcul-lourd');
  assert.match(b.pendantUnCalculLourd.corps.error, /réessayez dans quelques minutes\. Rien n’a été compté\./);
  assert.deepEqual(b.apresCalculLourd, { etat: 'proposee', variantes: [] });
  assert.equal(b.pendantUnePasse.code, 409);
  assert.deepEqual(b.apresPasse, { etat: 'proposee', variantes: [] });
  assert.equal(b.vueFausse.corps.raison, 'deja-change');
  assert.equal(b.lance.code, 202);
  assert.equal(b.lance.corps.lance, true);
  assert.deepEqual(b.pendant, { calculLourd: 'banc d’une correction', verrou: 'banc-correction', enCours: RHO });
  assert.equal(b.secondClic.corps.raison, 'banc-en-cours');
  assert.equal(b.refuserPendant.code, 409, 'rien ne s’écrit pendant le banc');
  assert.equal(b.fini, true);
  assert.deepEqual(b.apres, { calculLourd: null, verrou: null }, 'le jeton et le verrou rendus');
  assert.equal(b.proposition.etat, 'bancee');
  assert.equal(b.proposition.banc.verdict, 'retenu');
  assert.equal(b.proposition.banc.variantes, 1, 'la correction comptée avant le fork : le juge du banc la voit');
  assert.notEqual(b.proposition.banc.enfant.pid, b.pidDuScript, 'le banc a tourné dans un autre processus');
  for (const k of ['retardBoucleMaxMs', 'retardBoucleP99Ms', 'rssAvantOctets', 'rssMaxOctets', 'rssApresOctets']) assert.ok(Number.isFinite(b.proposition.banc.serveur[k]), k);
  assert.ok(Number.isFinite(b.proposition.banc.enfant.rssMaxOctets));
  assert.deepEqual(b.variantes, [[RHO, 'banc']]);
  assert.deepEqual(b.journal.slice(-2).map((e) => [e.evenement, e.source]), [['au-banc', 'pierre'], ['bancee', 'pierre']]);
  assert.match(b.journal.at(-1).phrase, /^Mesurée au banc d’essai \(matchs 2019-2023, 320 matchs, indicatif\) : 1,9 % d’erreur de prévision en moins/);
  assert.equal(b.photos.config, circuit().tri.photosFin.config);
  assert.equal(b.photos.versions, circuit().tri.photosFin.versions);
});

test('« Mettre à l’essai » : une passe n’accepte rien toute seule (B13) ; le clic met la correction en file (rang 1) ; le double clic est refusé (B25) ; une correction inconnue 404 ; sans « vue » 400 ; rien d’écrit au registre des versions', () => {
  const a = circuit().accepter;
  assert.equal(a.etatApresLaPasse, 'bancee');
  assert.equal(a.sante.valeur, '1 à décider');
  assert.equal(a.accepter.code, 200);
  assert.equal(a.accepter.corps.proposition.etat, 'acceptee');
  assert.equal(a.accepter.corps.proposition.rangFile, 1);
  assert.equal(a.doubleClic.code, 409);
  assert.equal(a.doubleClic.corps.raison, 'deja-change');
  assert.equal(a.inconnue.code, 404);
  assert.equal(a.sansVue.code, 400);
  assert.equal(a.photos.versions, circuit().banc.photosFin.versions);
});

test('la nuit suivante : la place est libre, la correction passe à blanc par le point d’entrée de l’étape 25, origine « correction-mensuelle » — essai n° 1 face à la version 1 ; déjà comptée au banc, elle ne l’est pas deux fois ; les réglages ne bougent pas', () => {
  const n = circuit()['nuit-1'];
  assert.equal(n.proposition.etat, 'a-blanc');
  assert.equal(n.proposition.essai.numero, 1);
  assert.equal(n.proposition.essai.versionEnService, 1);
  assert.equal(n.registre.candidate.id, RHO);
  assert.equal(n.registre.candidate.origine, 'correction-mensuelle');
  assert.equal(n.registre.candidate.rho, -0.02);
  assert.deepEqual(n.registre.candidate.cles, Object.keys(MDB).sort());
  assert.deepEqual(n.variantes, [[RHO, 'banc']]);
  assert.equal(n.config, true);
  assert.equal(n.carte.statut, 'en-essai');
  assert.match(n.carte.origineDite, /correction du mois \(étape 26\)/);
});

test('l’essai : forces de buts à jour, lignes à blanc fabriquées (la correction fait mieux) → la nuit juge à l’horizon « retenu », chaque famille « retenu », la porte de sûreté « dans le hasard » ; la boucle note « jugée » et N’ADOPTE PAS (B16) ; les réglages ne bougent pas', () => {
  const e = circuit().essai;
  assert.equal(e.forces, true);
  assert.deepEqual(e.plante, { matchs: 900, lignes: 4500, ecrites: 4500 });
  assert.equal(e.nuit.essai.principal, true);
  assert.equal(e.nuit.essai.verdict, 'retenu');
  assert.deepEqual(e.registre.candidate.jugement.parFamille, { bothTeamsScore: 'retenu', resultAndTotal: 'retenu', teamGoals: 'retenu', totalGoals: 'retenu' });
  assert.deepEqual(e.registre.candidate.jugement.surete, { 'totalGoals|2.5': 'dans-le-hasard', bothTeamsScore: 'dans-le-hasard' });
  assert.deepEqual(e.passe.synchro.changements, [{ id: RHO, de: 'a-blanc', vers: 'jugee' }]);
  assert.deepEqual(e.seconde.synchro.changements, [], 'une seconde passe : toujours jugée, jamais adoptée');
  assert.equal(e.proposition.etat, 'jugee');
  assert.equal(e.proposition.essai.verdict, 'retenu');
  assert.equal(e.config, true);
  assert.equal(e.adoption.possible, true, 'l’adoption est possible… au clic de Pierre');
});

test('l’adoption au clic (le bouton de l’étape 25) : engine-config.json change ICI (ρ −0,02), une version de plus ; la boucle note « adoptée » (version 2) ; le lancement de l’étape 26 est déclaré ; « retirer » dit où cliquer (retour arrière de Réglages) sans rien écrire', () => {
  const a = circuit().adopter;
  assert.equal(a.adopter.code, 200);
  assert.equal(a.adopter.corps.vers, 2);
  assert.deepEqual([a.configAvant, a.configApres], [-0.05, -0.02]);
  assert.equal(a.proposition.etat, 'adoptee');
  assert.equal(a.proposition.versionAdoptee, 2);
  assert.deepEqual(a.registre.passees, [[RHO, 'adoptee', 2]]);
  assert.equal(a.lancement.version, RHO);
  assert.equal(a.retirer.code, 200);
  assert.equal(a.retirer.corps.possible, true);
  assert.equal(a.retirer.corps.lien.libelle, 'Réglages › Versions du moteur › Revenir à la version précédente');
  assert.equal(a.retirerRienEcrit, true);
  assert.equal(a.etat.retrait.possible, true);
  assert.equal(a.etat.ton, 'section', 'jamais le vert');
});

test('le retrait : le retour arrière de l’étape 25 remet ρ −0,05 ; la boucle note « retirée » ; le journal dit tout, dans l’ordre (tri, proposée, au banc, mesurée, acceptée, mise à l’essai, jugée, adoptée, retirée) ; le code du moteur n’a pas bougé', () => {
  const r = circuit().retrait;
  assert.equal(r.retour.code, 200);
  assert.equal(r.config, -0.05);
  assert.equal(r.proposition.etat, 'retiree');
  assert.deepEqual(r.journal.map((e) => e.evenement), ['tri', 'tri', 'tri', 'proposee', 'au-banc', 'bancee', 'acceptee', 'mise-a-l-essai', 'jugee', 'adoptee', 'retiree']);
  assert.match(r.journal.at(-1).phrase, /^Retirée par un retour arrière le 29\/01\/2027 \(retour à la version n° 1\)\.$/);
  assert.equal(r.code, EMPREINTE_DU_MOTEUR);
  assert.equal(r.retirerApres.code, 409);
});

test('« aucun gros changement sans clic de Pierre » : d’une phase à l’autre, engine-config.json ne change qu’aux clics simulés (adopter, retour arrière, Réglages) — jamais par la boucle', () => {
  const s = circuit();
  const changees = [];
  for (let i = 1; i < PHASES.length; i++) if (s[PHASES[i][0]].photosFin.config !== s[PHASES[i - 1][0]].photosFin.config) changees.push(PHASES[i][0]);
  assert.deepEqual(changees, ['adopter', 'retrait', 'negatifs-3', 'negatifs-5']);
});

test('le formulaire de Pierre : une proposition par réglage ouvert, les réglages retirés et les réglages de pari refusés en mots, bornes et pas, même valeur, réglage inconnu ; refusée AVANT son banc, une correction n’est jamais comptée', () => {
  const n = circuit()['negatifs-1'];
  assert.equal(n.prior.code, 201);
  assert.deepEqual([n.priorDeNouveau.code, n.priorDeNouveau.raison], [409, 'deja-ouverte']);
  assert.deepEqual([n.retire.code, n.retire.raison], [400, 'levier-retire']);
  assert.deepEqual([n.pari.code, n.pari.raison], [400, 'reglage-de-pari']);
  assert.deepEqual([n.horsBornes.code, n.horsBornes.raison], [400, 'valeur']);
  assert.deepEqual([n.pas.code, n.pas.raison], [400, 'valeur']);
  assert.deepEqual([n.meme.code, n.meme.raison], [400, 'meme-valeur']);
  assert.deepEqual([n.inconnu.code, n.inconnu.raison], [400, 'levier-inconnu']);
  assert.match(n.pari.error, /ne changent aucune probabilité/);
  assert.equal(n.poidsXg.code, 201);
  assert.equal(n.refuserAvantLeBanc.corps.proposition.etat, 'refusee');
  assert.deepEqual(n.variantesApresRefus, [[RHO, 'banc']], 'refusée avant son banc : jamais comptée');
});

test('B14 : le second banc voit DEUX corrections comptées (la précédente et elle, déclarée avant son fork) ; la file garde son rang (1, 2, 3 : premier accepté, premier servi) ; un banc impossible est dit (« banc impossible »), la correction reste à décider', () => {
  const n = circuit()['negatifs-1'];
  assert.equal(n.bancPrior.code, 202);
  assert.equal(n.bancPrior.fini, true);
  assert.equal(n.bancPrior.proposition.banc.variantes, 2);
  assert.equal(n.accepterPrior.rangFile, 2);
  assert.equal(n.accepterWt.rangFile, 3);
  const froid = n.propositions.find((p) => p.id === n.froid);
  assert.equal(froid.etat, 'banc-impossible');
  assert.match(froid.banc.erreur, /aucun match de l’historique/);
  assert.deepEqual(n.variantes.map((v) => v[0]), [RHO, n.prior.id, n.wt, n.froid]);
});

test('B20 : la place libre, la passe met à blanc la PREMIÈRE acceptée (rang 2), pas la dernière (rang 3) ; refusée à blanc, la correction attend la passe suivante pour libérer la place', () => {
  const n = circuit()['negatifs-2'];
  const prior = circuit()['negatifs-1'].prior.id;
  assert.equal(n.registre.candidate.id, prior);
  assert.equal(n.propositions.find((p) => p.id === prior).etat, 'a-blanc');
  assert.equal(n.propositions.find((p) => p.id === circuit()['negatifs-1'].wt).etat, 'acceptee');
  assert.equal(n.refuserABlanc.corps.proposition.etat, 'refusee');
  assert.equal(n.registreApresRefus.candidate.id, prior);
});

test('B21, B23 : un réglage du modèle changé dans Réglages (une nouvelle version) — la correction refusée qui occupait la place est LIBÉRÉE (aucun « essai recommencé » la nuit suivante, B23) ; la correction en file partie d’autres réglages est « périmée », jamais mise à blanc (B21)', () => {
  const n = circuit()['negatifs-3'];
  const prior = circuit()['negatifs-1'].prior.id;
  const wt = circuit()['negatifs-1'].wt;
  assert.equal(n.reglage.numero, 3);
  assert.deepEqual(n.passe.synchro.liberees, [prior]);
  assert.deepEqual(n.passe.miseALEssai.perimees, [wt]);
  assert.equal(n.registre.candidate, null);
  assert.ok(n.registre.passees.some(([id, fin]) => id === prior && fin === 'retiree-du-code'));
  assert.equal(n.propositions.find((p) => p.id === wt).etat, 'perimee');
  assert.equal(n.nuit.candidate, null);
  assert.ok(!n.variantes.some(([id]) => id.startsWith(`${prior}~`)), 'aucun essai recommencé');
});

test('B22 : jugée « pas prouvé » à l’horizon → rejetée, et la place LIBÉRÉE dans la même passe ; un changement de version ensuite ne relance rien', () => {
  const n4 = circuit()['negatifs-4'];
  const n = circuit()['negatifs-5'];
  assert.equal(n4.proposition.etat, 'a-blanc');
  assert.equal(n4.registre.candidate.essai.versionEnService, 3);
  assert.equal(n.nuit.essai.verdict, 'pas-prouve');
  assert.deepEqual(n.passe.synchro.changements.map((c) => c.vers), ['jugee', 'rejetee']);
  assert.deepEqual(n.passe.synchro.liberees, [n4.ws]);
  assert.equal(n.registre.candidate, null);
  assert.equal(n.proposition.etat, 'rejetee');
  assert.equal(n.reglage.numero, 4);
  assert.equal(n.nuit2.candidate, null);
  assert.ok(!n.variantes.some(([id]) => id.startsWith(`${n4.ws}~`)));
  assert.match(n.journal.find((e) => e.evenement === 'rejetee' && e.proposition === n4.ws).phrase, /^Rejetée : l’écart avec la version en service peut venir du hasard \(900 matchs\)/);
});

test('B41 : une mesure au banc restée « au-banc » (l’appli fermée pendant le banc) revient « à mesurer » à la passe suivante, avec sa phrase ; B42 : une mise à l’essai interrompue (la correction au registre, la proposition encore « acceptée ») est REPRISE (« a-blanc ») ; refusée, sa place est libérée', () => {
  const o = circuit().orphelins;
  assert.equal(o.avant, 'au-banc');
  assert.equal(o.apres, 'proposee');
  assert.deepEqual(o.passe.orphelins, [o.priorDeuxieme.id]);
  assert.ok(o.journal.some((e) => e.evenement === 'banc-interrompu' && /revient « à mesurer »/.test(e.phrase)));
  assert.deepEqual(o.avantReprise, { etat: 'acceptee', registre: o.poidsXg });
  assert.deepEqual(o.reprise.synchro.changements, [{ id: o.poidsXg, de: 'acceptee', vers: 'a-blanc' }]);
  assert.equal(o.apresReprise.etat, 'a-blanc');
  assert.equal(o.apresReprise.essai.versionEnService, 4);
  assert.ok(o.journal.some((e) => e.evenement === 'mise-a-l-essai' && /reprise après un arrêt/.test(e.phrase)));
  assert.equal(o.refuser.code, 200);
  assert.deepEqual(o.liberation.synchro.liberees, [o.poidsXg]);
  assert.equal(o.registre.candidate, null);
  assert.equal(o.etat.essais.n, 6);
  for (const [, , , ton] of o.etat.propositions) assert.ok(!/vert|accent|positi/i.test(String(ton)), `jamais le vert : ${ton}`);
});

// ------------------------------------------------------------ vérification finale, constat 3 (une copie à part)

let sortiesReprise = null;
function reprise() {
  if (sortiesReprise) return sortiesReprise;
  const copie = sansCandidateDuCode(preparerCopie({ runtime: { 'engine-config.json': { football: { modeleDeButs: MDB } } } }));
  try {
    const s = {};
    for (const [phase, maintenant] of [['preparer', '2026-09-30T12:00:00.000Z'], ['reprise-echec', '2027-01-01T07:00:00.000Z'], ['reprise', '2027-01-01T10:00:00.000Z']]) {
      const r = executer(copie, SCRIPT, { args: [phase], maintenant, timeout: 600_000 });
      assert.equal(r.code, 0, `${phase} : ${r.erreurs.slice(-3000)}`);
      assert.equal(r.reseau, false, `${phase} : aucun appel réseau`);
      assert.ok(r.json, `${phase} : sortie illisible : ${r.sortie.slice(-500)}`);
      s[phase] = r.json;
    }
    sortiesReprise = s;
    return s;
  } finally {
    copie.nettoyer();
  }
}

test('vérification finale, constat 3 : une erreur à l’étape « propositions » (après le tri du dernier mois) garde l’étape due tant que son alerte est levée ; la passe suivante refait les propositions sur le dernier tri rangé (décembre) et lève l’alerte, puis l’étape n’est plus due ; une reprise de trop ne crée aucun doublon', () => {
  const { 'reprise-echec': e, reprise: r } = reprise();
  // La passe en échec : les trois mois triés et rangés, la proposition refusée par la base, l'alerte durable rangée.
  assert.equal(e.calibration, 'ok');
  assert.equal(e.passe.status, 'error');
  assert.deepEqual(e.passe.tris, ['2026-10', '2026-11', '2026-12']);
  assert.deepEqual(e.passe.creees, []);
  assert.deepEqual(e.passe.erreurs.map((x) => x.etape), ['propositions']);
  assert.match(e.passe.erreurs[0].message, new RegExp(`^« ${RHO} » : .*création refusée \\(essai du constat 3\\)`));
  assert.equal(e.passe.alert.value.passes, 1);
  assert.equal(e.alerteRangee?.passes, 1, 'l’alerte durable est rangée');
  assert.deepEqual(e.propositions, []);
  // Sans la correction, l'étape ne serait plus due (plus de mois à trier, aucune correction à suivre) : l'alerte serait restée figée.
  assert.equal(e.dueSansLAlerte, false);
  assert.equal(e.dueAvecLAlerte, true, 'son alerte la garde due');
  // La passe suivante : rien de retrié, les propositions refaites sur décembre, l'alerte levée.
  assert.equal(r.due, true);
  assert.equal(r.passe.status, 'ok', JSON.stringify(r.passe.erreurs));
  assert.deepEqual(r.passe.tris, []);
  assert.equal(r.passe.refaites, '2026-12');
  assert.deepEqual(r.passe.creees, [{ id: RHO, levier: 'modeleDeButs.rho', avant: -0.05, apres: -0.02 }]);
  assert.equal(r.passe.alert.value, null);
  assert.equal(r.alerteRangee, null, 'l’alerte durable est levée');
  assert.match(r.passe.summary, /^Propositions du tri de décembre 2026 refaites \(la passe précédente avait échoué à cette étape\) ; 1 correction proposée \(corrélation des petits scores : /);
  assert.deepEqual(r.propositions.map((p) => [p.id, p.etat, p.source, p.triMois]), [[RHO, 'proposee', 'regle', '2026-12']]);
  assert.deepEqual(r.journal.map((x) => x.evenement), ['tri', 'tri', 'tri', 'proposee']);
  assert.equal(r.dueApres, false, 'ensuite, plus due : rien à trier, rien à suivre, plus d’alerte');
  // Une reprise de trop : la garde « déjà ouverte » empêche le doublon, sans erreur.
  assert.deepEqual([r.deTrop.status, r.deTrop.creees, r.deTrop.erreurs], ['ok', [], []]);
  assert.ok(r.deTrop.ecartees.includes('deja-ouverte'), JSON.stringify(r.deTrop.ecartees));
  assert.equal(r.propositionsApres, 1);
});
