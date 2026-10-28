/**
 * La boucle de correction (étape 26 du plan, partie E, 28/10/2026) — LES ÉCRANS, rendus côté serveur sans navigateur ni
 * serveur de développement (test 8 du §11.1 de la conception ; le patron de simulationEcrans.test.mjs : `fetch` remplacé,
 * seules les routes données répondent, tout le reste est REFUSÉ et compté).
 *   node --test test/boucleCorrectionEcran.test.mjs        (depuis server/)
 *
 * Les réponses sont celles du VRAI serveur : test/aides/script-boucle-ecrans.mjs les calcule dans des copies isolées qui
 * portent une copie figée des deux registres de Pierre (la candidate de l'étape 27 en essai n° 2) — avant le premier tri,
 * avec un tri et une correction dans chaque état, avec une ligne abîmée, avec la candidate jugée « retenu ».
 *  1. Les règles de l'écran (ui/src/utils/corrections.js, versionsMoteur.js) : pures, les mêmes mots que le serveur, jamais
 *     de vert, jamais le jargon (constat 14), les cinq confirmations, les 22 lignes toujours, Σ et ⌀.
 *  2. Santé du moteur : le bloc des corrections dans ses états (pas mesuré, à décider, en file, à l'essai, retenue à adopter,
 *     adoptée surveillée, illisible), ses quatre parties, ses boutons, une seule lecture.
 *  3. Le câblage : chaque action passe par window.confirm et envoie `vue` (B33) ; le bloc n'appelle rien lui-même.
 *  4. Historique moteur : le panneau des 22 cases (toujours là, Σ/⌀), le détail par régime, les écartés, le journal.
 *  5. Le formulaire « Proposer une correction » (ouvert : réglages, bornes, phrase).
 *  6. Réglages : l'avertissement de « Paramètres du moteur » (candidate en essai, candidate jugée — B34, B46), la fin
 *     d'une correction de la boucle ; le budget Claude (le type du résumé) ; la puce du haut (l'alerte durable) ; DESIGN.md.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { ouvrirLeRendu, reglesPures, texteDe, blocDe, tableauDe, corps, pied, interfacePrete, optionsDuRendu, UI, espaces } from './aides/rendu.mjs';
import { REGLAGES_MODELE_DE_BUTS } from './aides/modeleDeButsCommun.mjs';

const imp = (chemin) => import(pathToFileURL(chemin).href);
const options = optionsDuRendu;
const C = await imp(path.join(UI, 'src', 'utils', 'corrections.js'));
const V = await imp(path.join(UI, 'src', 'utils', 'versionsMoteur.js'));
const FICHE = await imp(path.join(SERVEUR, 'src', 'data', 'correction', 'ficheDuMois.js'));
const REGLES = await imp(path.join(SERVEUR, 'src', 'data', 'correction', 'regles.js'));
const PROPS = await imp(path.join(SERVEUR, 'src', 'data', 'correction', 'propositions.js'));
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8');
const VERT = /is-accent|cm-positive|--cm-accent|vbadge|is-value/;
/** Le jargon interdit à l'écran (constat 14) : K, lignée, z, variante, levier, regards. */
const JARGON = /(?<![\p{L}\p{N}])(?:K|z)(?![\p{L}\p{N}])|lign[ée]e|variante|levier|regards/iu;
const compter = (texte, motif) => (texte.match(motif) ?? []).length;
/** Aucun mot du jargon dans un texte visible ; sinon le mot trouvé et son voisinage. */
function sansJargon(t, quoi = 'texte') {
  const m = JARGON.exec(t);
  assert.equal(m, null, `${quoi} : jargon « ${m?.[0]} » dans « …${m ? t.slice(Math.max(0, m.index - 80), m.index + 80) : ''}… »`);
}
/** Le source sans ses commentaires (JavaScript et gabarit). */
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

// ------------------------------------------------------------ les réponses du vrai serveur (une fois par phase)
const fixture = (n) => JSON.parse(fs.readFileSync(path.join(SERVEUR, 'test', 'fixtures', n), 'utf8'));
const memo = {};
function phase(nom) {
  if (memo[nom]) return memo[nom];
  const versions = fixture('engine-versions-27-en-essai.json');
  if (nom === 'jugee') versions.candidate.jugement = { verdict: 'retenu', le: '2026-11-14T15:00:00.000Z', gainPct: 1.8, fourchettePct: [0.4, 3.2], matchs: 812 };
  const copie = preparerCopie({ runtime: { 'engine-versions.json': versions, 'registre-mesure.json': fixture('registre-mesure-27-en-essai.json') } });
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-boucle-ecrans.mjs'), { args: [nom], maintenant: '2026-11-01T08:00:00.000Z', timeout: 300_000, env: { MATCH_STATS_AUTO_REFRESH: 'false' } });
    assert.equal(r.code, 0, `${nom} :\n${r.erreurs.slice(-4000)}`);
    assert.equal(r.reseau, false);
    memo[nom] = r.json.reponses;
    return memo[nom];
  } finally {
    copie.nettoyer();
  }
}

let rendu;
before(async () => {
  if (!interfacePrete) return;
  rendu = await ouvrirLeRendu({ cibles: /(EngineHealthView|CorrectionTriPanel|ClaudeBudgetPanel)\.vue$/, heure: '2026-11-01T08:00:00.000Z', routes: ['/sante-moteur', '/historique-moteur', '/reglages'] });
});
after(async () => {
  await rendu?.fermer();
});
const ok = (corps, code = 200) => ({ code, corps });

// ============================================================ 1. les règles de l'écran

test('règles : pures (aucun import, aucun effet) ; les mêmes mots que le serveur (événements du journal, les 11 familles) ; jamais de vert ; le mois en mots dans chaque état', () => {
  assert.deepEqual([...reglesPures('corrections.js')], ['corrections.js']);
  assert.deepEqual(C.EVENEMENTS_DITS, FICHE.EVENEMENTS_DITS, 'les mots du journal : ceux du serveur (ficheDuMois.js)');
  assert.deepEqual(C.FAMILLES.map((f) => [f.id, f.libelle]), REGLES.FAMILLES.map((f) => [f.id, f.libelle]), 'les 11 familles, dans l’ordre du serveur');
  for (const ton of [...Object.values(C.TONS), C.tonDuStatut('vrai-defaut'), C.tonDuStatut('a-surveiller'), C.tonDuStatut('en-essai'), C.tonDuStatut('dans-la-marge')]) assert.doesNotMatch(ton, VERT);
  for (const v of ['retenu', 'pas-prouve', 'moins-bon', 'pas-assez-de-matchs']) assert.doesNotMatch(C.verdictDuBancDit(v).ton, VERT);
  assert.deepEqual(C.verdictDuBancDit('retenu'), { texte: 'retenu', ton: 'is-info' });
  assert.deepEqual(C.verdictDuBancDit('moins-bon'), { texte: 'moins bon', ton: 'is-danger' });
  const r = phase('rempli');
  const resume = r.corrections.corps.resume;
  const ecrit = C.leMoisEnMots(resume);
  assert.deepEqual([ecrit.etat, ecrit.titre, ecrit.phrases.length], ['ecrit', 'Octobre 2026 : un vrai défaut sur les corners, rien à corriger par un réglage', 3]);
  assert.equal(ecrit.provenance.source, 'Écrit par Claude (Sonnet), octobre 2026 — chiffres vérifiés par la garde');
  assert.equal(espaces(ecrit.provenance.detail), '4 nombres cités, tous dans la fiche du mois ; 4 321 tokens');
  assert.equal(C.leMoisEnMots(null).etat, 'absent');
  assert.deepEqual(C.leMoisEnMots({ code: 'interrupteur', phrase: 'Les analyses IA automatiques sont coupées : pas de résumé du mois.' }), { etat: 'coupe', titre: null, phrases: [], phrase: 'Les analyses IA automatiques sont coupées : pas de résumé du mois.', ton: '', provenance: null });
  assert.equal(C.leMoisEnMots({ code: 'essais-epuises', phrase: 'Abandonné pour ce mois : 3 essais ratés.' }).ton, 'is-warning');
  assert.equal(C.leMoisEnMots({ code: 'sans-appel', phrase: 'Rien à commenter…', resume: { ecritLe: '2026-11-01T07:00:00.000Z' } }).provenance.source, 'Rangé sans appel à Claude (rien à commenter, 0 token)');
  assert.equal(C.leMoisEnMots({ code: 'a-faire', phrase: 'Pas encore écrit : …' }).etat, 'attente');
});

test('règles : les écarts EN COURT pour Santé (en-tête, une pastille par statut présent — vrai défaut ambre, à surveiller ambre en tirets, en essai bleu —, les vrais défauts, la règle avec les mots du constat 14) ; les cartes des corrections dans chaque état', () => {
  const r = phase('rempli');
  const e = C.ecartsEnCourt(r.corrections.corps.dernierTri, r.corrections.corps.regles);
  assert.equal(espaces(e.entete), 'Tri d’octobre 2026 (version n° 5, avec la n° 4 : mêmes pronostics ; mois partiel (en service depuis le 22/10/2026)) : 11 712 issues mesurées sur 1 420 matchs.');
  assert.deepEqual(e.pastilles.map((x) => [x.texte, x.ton]), [['1 vrai défaut', 'is-warning'], ['1 à surveiller', 'is-warning is-tirets'], ['1 petit écart', ''], ['2 malchance (dans la marge)', ''], ['9 trop tôt', ''], ['8 en essai', 'is-info']]);
  assert.deepEqual(e.defauts.map((d) => [d.texte, espaces(d.ecart), d.mois]), [['« Corners du match », niveau : annonce trop haut', `${String.fromCharCode(0x2212)}3,1 points`, 'septembre 2026 et octobre 2026']]);
  assert.match(e.defauts[0].propose, /^demande du code : la loi des corners et des tirs est écrite dans le moteur/);
  assert.match(e.enEssai, /^Familles de buts en essai : la candidate « modele-buts-v1 » \(étape 27\) les corrige déjà/);
  assert.equal(e.regle, 'Un « vrai défaut » dure (les deux derniers mois comptés vont dans le même sens), fait au moins 2 points et dépasse la marge du hasard — 22 cases × 12 mois : la marge du hasard en tient compte. Sinon, c’est de la malchance ou un petit écart.');
  assert.equal(C.ecartsEnCourt(null), null);
  const cartes = C.propositionsMontrees(r.corrections.corps.propositions);
  assert.deepEqual(cartes.map((c) => [c.etat, c.pastille.ton]), [['proposee', 'is-warning'], ['bancee', 'is-warning'], ['banc-impossible', 'is-warning'], ['acceptee', 'is-info'], ['a-blanc', 'is-info'], ['jugee', 'is-info'], ['adoptee', 'is-section']], 'la refusée reste au journal ; aucune pastille verte');
  const parEtat = Object.fromEntries(cartes.map((c) => [c.etat, c]));
  assert.equal(parEtat.proposee.banc.genre, 'pas-encore');
  assert.equal(espaces(parEtat.bancee.banc.texte), 'Gain mesuré au banc d’essai (2019-2023, indicatif) : 1,2 % d’erreur de prévision en moins, fourchette [+0,3 ; +2,1] %, sur 3 120 matchs.');
  assert.deepEqual(parEtat.bancee.banc.pastille, { texte: 'retenu', ton: 'is-info' });
  assert.equal(parEtat.bancee.banc.parFamille, 'totalGoals : retenu (+1,5 %) ; bothTeamsScore : pas prouvé (+0,4 %)');
  assert.match(parEtat['banc-impossible'].banc.texte, /^Banc impossible : pas d’historique football-data pour ces marchés\. Vous pouvez quand même la mettre à l’essai à blanc, ou la refuser\.$/);
  assert.equal(parEtat.acceptee.essai, 'En file pour l’essai à blanc (rang 4) : elle passe à blanc dès que la place de l’essai est libre.');
  assert.equal(parEtat['a-blanc'].essai, 'Essai à blanc n° 1 depuis le 28/10/2026 — le verdict se lit dans Réglages › Versions du moteur.');
  assert.deepEqual([parEtat.jugee.adopter, parEtat.jugee.essai], [true, 'Jugée « retenu » à l’horizon : à adopter dans Réglages › Versions du moteur (bouton « Adopter la candidate »).']);
  assert.match(parEtat.adoptee.essai, /^Adoptée : version n° 6 du moteur\./);
  assert.deepEqual(Object.fromEntries(cartes.map((c) => [c.etat, Object.entries(c.actions).filter(([, v]) => v).map(([k]) => k).join('+')])), { proposee: 'banc+refuser', bancee: 'accepter+refuser', 'banc-impossible': 'accepter+refuser', acceptee: 'refuser', 'a-blanc': 'refuser', jugee: 'refuser', adoptee: 'retirer' });
  for (const c of cartes) for (const t of [c.titre, c.pastille.texte, c.origine, c.changement, c.banc?.texte ?? '', c.essai ?? '']) assert.doesNotMatch(t, JARGON, `${c.etat} : ${t}`);
});

test('règles : les cinq confirmations (le banc part AU CLIC, environ 10 minutes, un seul calcul lourd à la fois ; l’essai à blanc, son horizon, l’adoption au clic dans Réglages ; le refus et ses 6 mois ; la proposition ; le retrait par le retour arrière) — toutes disent que rien ne change dans vos chiffres', () => {
  const p = phase('rempli').corrections.corps.propositions.find((x) => x.etat === 'bancee');
  const banc = C.confirmationDuBanc(phase('rempli').corrections.corps.propositions.find((x) => x.etat === 'proposee'));
  assert.match(banc, /^Mesurer « Vous proposez de changer un réglage du modèle de buts \(essai n° 1\)\. » au banc d’essai \?/);
  for (const morceau of ['environ 10 minutes', 'un seul calcul lourd à la fois', 'processus à part', 'indicatif', 'relisez la page dans une dizaine de minutes', 'parmi les corrections essayées', 'Rien ne change dans vos chiffres.']) assert.ok(banc.includes(morceau), `banc : ${morceau}`);
  assert.doesNotMatch(banc, /prochaine passe/, 'le banc part au clic, pas « après la prochaine passe »');
  const essai = C.confirmationDeLEssai(p, { prise: true });
  for (const morceau of ['au moins 21 jours et 800 matchs', 'jugée une seule fois', 'ET si vous cliquez « Adopter » dans Réglages', 'Une autre candidate est en essai : celle-ci attendra son tour.', 'Rien ne change dans vos chiffres']) assert.ok(espaces(essai).includes(morceau), `essai : ${morceau}`);
  assert.ok(!C.confirmationDeLEssai(p, { prise: false }).includes('attendra son tour'));
  const refus = C.confirmationDuRefus({ ...p, etat: 'a-blanc' });
  for (const morceau of ['notée « refusée » dans le journal', 'ne sera plus proposé avant 6 mois', 'Son essai à blanc s’arrêtera à la prochaine passe.', 'Rien ne change dans vos chiffres.']) assert.ok(refus.includes(morceau), `refus : ${morceau}`);
  const proposition = C.confirmationDeLaProposition({ libelle: 'Corrélation des petits scores', avantDit: '−0,05', apresDit: '−0,02' });
  assert.match(proposition, /^Proposer « Corrélation des petits scores : −0,05 → −0,02 » \?/);
  assert.ok(proposition.includes('c’est vous qui lancerez la mesure (environ 10 minutes)') && proposition.includes('Rien ne change dans vos chiffres.'));
  const retrait = C.confirmationDuRetrait({ enMots: 'Une correction adoptée.' });
  assert.ok(retrait.includes('Revenir à la version précédente') && retrait.includes('le retrait passera par un nouvel essai (plus tard)') && retrait.includes('Rien n’est retiré d’ici'));
  for (const t of [banc, essai, refus, proposition, retrait]) assert.doesNotMatch(t, JARGON);
  assert.match(C.messageApresLAction('banc'), /^Mesure au banc lancée : son verdict arrive dans une dizaine de minutes/);
  assert.equal(C.messageApresLAction('retirer', { phrase: 'Pour la retirer tout de suite : …' }), 'Pour la retirer tout de suite : …');
});

test('règles : le tri détaillé — 22 lignes TOUJOURS (même sans tri : « pas encore mesuré », en panne : « illisible »), Σ des comptes du tri et ⌀ de l’écart absolu au pied, quatre chiffres clés, le détail par régime, les écartés ; le formulaire (bornes, valeur) ; l’alerte durable', () => {
  const vide = C.lignesDuTri(null);
  assert.equal(vide.length, 22);
  assert.ok(vide.every((l) => l.vide && l.statut.texte === 'pas encore mesuré'));
  assert.ok(C.lignesDuTri(null, { manque: 'illisible' }).every((l) => l.statut.texte === 'illisible'));
  const tri = phase('rempli').tri.corps.tri;
  const lignes = C.lignesDuTri(tri);
  assert.equal(lignes.length, 22);
  const corners = lignes.find((l) => l.cas === 'totalCorners|niveau');
  assert.deepEqual([corners.mesure, espaces(corners.ecartMois), espaces(corners.ecartFenetre), espaces(corners.fourchette), espaces(corners.matchs), corners.statut.ton], ['niveau : « plus de corners que la ligne »', `${String.fromCharCode(0x2212)}3,1 points`, `${String.fromCharCode(0x2212)}3,1 points`, `[${String.fromCharCode(0x2212)}4,2 ; ${String.fromCharCode(0x2212)}2,0]`, '1 420', 'is-warning']);
  assert.deepEqual(corners.moisComptes.map((m) => m.mois), ['septembre 2026', 'octobre 2026']);
  const p = C.piedDuTri(tri);
  assert.deepEqual([espaces(p.lignes), espaces(p.matchs), p.casesMesurees], ['11 712', '1 420', 22]);
  assert.match(p.ecartMoyen, /^\d+,\d points?$/);
  // ⌀ : la MOYENNE de l’écart absolu des cases mesurées (recalculée ici sans le module), jamais une somme de
  // pourcentages (la campagne des bugs, pose E3, l’a demandé : la forme seule laissait passer une somme).
  const ecartsDuMois = tri.cases.map((c) => c.courant?.ecart).filter((x) => typeof x === 'number' && Number.isFinite(x));
  const moyenneEnPoints = (ecartsDuMois.reduce((t, x) => t + Math.abs(x), 0) / ecartsDuMois.length) * 100;
  assert.equal(ecartsDuMois.length, 22);
  assert.ok(Math.abs(Number(p.ecartMoyen.replace(/ points?$/, '').replace(',', '.')) - moyenneEnPoints) <= 0.05 + 1e-9, `⌀ attendu ${moyenneEnPoints.toFixed(2)} point(s) : ${p.ecartMoyen}`);
  assert.deepEqual(C.kpisDuTri(tri, phase('rempli').corrections.corps.regles).map((k) => [k.label, k.valeur]), [['Version jugée', 'n° 5'], ['Mois comptés', 'octobre 2026'], ['Marge du hasard', '22 cases × 12 mois'], ['Seuil d’un vrai défaut', '2 points']]);
  assert.deepEqual(C.regimesDuTri(tri).map((r) => [r.famille, r.regime]), [['Résultat (1N2), victoire de l’équipe qui reçoit', 'avec cotes'], ['Résultat (1N2), match nul', 'avec cotes'], ['Total buts', 'avec cotes'], ['Total buts', 'sans cote'], ['Les 2 équipes marquent', 'avec cotes']]);
  assert.deepEqual(C.ecarteesDuTri(tri).map((e) => espaces(e.n)), ['4 210', '291']);
  const formulaire = PROPS.etatDuFormulaire({ place: { prise: false }, reglagesEnService: { modeleDeButs: REGLAGES_MODELE_DE_BUTS }, propositions: [] });
  const rho = formulaire.leviers.find((l) => l.cle === 'modeleDeButs.rho');
  assert.equal(C.bornesDites(rho), `entre ${String.fromCharCode(0x2212)}0,30 et 0,30, bornes exclues ; par pas de 0,01`);
  assert.equal(C.problemeDeLaValeur(rho, -0.02), null);
  assert.match(C.problemeDeLaValeur(rho, 0.3), /^La valeur doit être entre/);
  assert.match(C.problemeDeLaValeur(rho, -0.015), /^La valeur va par pas de 0,01\.$/);
  assert.match(C.problemeDeLaValeur(rho, -0.05), /^C’est déjà la valeur en service/);
  assert.equal(C.problemeDeLaValeur(null, 1), 'Choisissez d’abord le réglage.');
  assert.deepEqual(C.optionsDesReglages(formulaire).map((o) => o.value), Object.keys(REGLES.LEVIERS));
  assert.equal(C.alerteDeLaBoucleDite(null), null);
  assert.equal(C.alerteDeLaBoucleDite({ erreur: 'le tri de novembre ne se lit pas.', depuis: '2026-12-01T06:10:00.000Z', passes: 3 }), 'Boucle de correction — le tri de novembre ne se lit pas (depuis le 01/12/2026 à 07 h 10, 3 passes d’affilée)');
  assert.equal(C.alerteDeLaBoucleDite({ erreur: 'x', passes: 1 }), 'Boucle de correction — x');
  for (const l of lignes) for (const t of [l.mesure, l.statut.texte, l.propose]) assert.doesNotMatch(t, JARGON, `${l.cas} : ${t}`);
});

// ============================================================ 2. Santé du moteur

const santeAvec = (corps, code = 200) => [[/\/api\/engine-health$/, ok(corps, code)]];

test('Santé, avant le premier tri : le cadre « pas encore mesuré » garde ses quatre parties — le résumé qui attend, aucun tri, « Proposer une correction » FERMÉ avec la raison écrite du serveur (l’essai du modèle de buts), la place de l’essai, le journal vide — ; une seule lecture, aucun vert', options, async () => {
  const r0 = phase('vide');
  const V0 = (await rendu.charger('/src/views/EngineHealthView.vue')).default;
  const r = await rendu.rendre(V0, {}, santeAvec(r0.sante.corps));
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(rendu.interdits, []);
  assert.deepEqual(r.appels.map((a) => a.replace(/^GET .*\/api/, 'GET /api')), ['GET /api/engine-health'], 'une seule lecture');
  const b = blocDe(r.html, 'corrections');
  assert.match(b, /data-etat="pas-mesure"/);
  assert.deepEqual([...b.matchAll(/data-partie="([a-z-]+)"/g)].map((m) => m[1]), ['mois-en-mots', 'ecarts', 'propositions', 'journal']);
  const t = texteDe(b);
  const f = r0.sante.corps.blocs.corrections.formulaire;
  assert.equal(f.ouvert, false);
  for (const morceau of ['Le mois en mots', 'Pas encore de résumé', 'Les écarts du mois', 'Pas encore de tri', 'Aucune correction proposée pour l’instant.', 'Proposer une correction', f.raison, f.reglagesDePari, r0.sante.corps.blocs.corrections.place.phrase, 'Rien au journal pour l’instant.', 'étape 26']) assert.ok(t.includes(espaces(morceau)), `manque : ${morceau}`);
  assert.match(b, /<button[^>]*disabled[^>]*>[\s\S]*?Proposer une correction/, 'le bouton est désactivé, sa raison écrite');
  assert.doesNotMatch(b, VERT);
  sansJargon(t, 'bloc des corrections');
  assert.doesNotMatch(b.split('data-partie="mois-en-mots"')[1], /<section/, 'aucune <section> dans le bloc (le cadre se coupe à la sienne)');
});

test('Santé, avec une correction dans chaque état : « 4 à décider » ; le mois en mots écrit par Claude ; les écarts en court ; une carte par correction ouverte ou adoptée avec SES boutons (« Mesurer au banc — environ 10 min », « Mettre à l’essai », « Refuser », « Retirer », le lien « Adopter ») ; le journal réduit à 3 entrées et son lien', options, async () => {
  const r1 = phase('rempli');
  const V0 = (await rendu.charger('/src/views/EngineHealthView.vue')).default;
  const r = await rendu.rendre(V0, {}, santeAvec(r1.sante.corps));
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(rendu.interdits, []);
  assert.equal(r.appels.length, 1);
  const b = blocDe(r.html, 'corrections');
  assert.match(b, /data-etat="attention"/);
  const t = texteDe(b);
  for (const morceau of ['4 à décider', 'Octobre 2026 : un vrai défaut sur les corners, rien à corriger par un réglage', 'c’est un vrai défaut, mais il demande du code', 'Écrit par Claude (Sonnet), octobre 2026 — chiffres vérifiés par la garde', '1 vrai défaut', '8 en essai', '« Corners du match », niveau : annonce trop haut', '22 cases × 12 mois : la marge du hasard en tient compte', 'Familles de buts en essai', 'Aucune correction essayée pour l’instant.']) assert.ok(espaces(t).includes(morceau), `manque : ${morceau}`);
  const cartes = [...b.matchAll(/data-proposition="([^"]+)" data-etat-proposition="([a-z-]+)"/g)].map((m) => m[2]);
  assert.deepEqual(cartes, ['proposee', 'bancee', 'banc-impossible', 'acceptee', 'a-blanc', 'jugee', 'adoptee'], 'la refusée n’a plus de carte (elle reste au journal)');
  const carte = (etat) => {
    const debut = b.indexOf(`data-etat-proposition="${etat}"`);
    const suivante = b.indexOf('data-etat-proposition="', debut + 10);
    return texteDe(b.slice(debut, suivante > -1 ? suivante : b.indexOf('Proposer une correction', debut)));
  };
  assert.ok(carte('proposee').includes('Mesurer au banc — environ 10 min') && carte('proposee').includes('Refuser') && !carte('proposee').includes('Mettre à l’essai'));
  assert.ok(carte('bancee').includes('Mettre à l’essai') && carte('bancee').includes('Refuser') && !carte('bancee').includes('Mesurer au banc'));
  assert.ok(espaces(carte('bancee')).includes('1,2 % d’erreur de prévision en moins, fourchette [+0,3 ; +2,1] %, sur 3 120 matchs') && carte('bancee').includes('retenu'));
  assert.ok(carte('banc-impossible').includes('Banc impossible') && carte('banc-impossible').includes('Mettre à l’essai'));
  assert.ok(carte('acceptee').includes('En file pour l’essai à blanc (rang 4)') && !carte('acceptee').includes('Mettre à l’essai'));
  assert.ok(carte('a-blanc').includes('Essai à blanc n° 1 depuis le 28/10/2026'));
  assert.ok(carte('jugee').includes('retenue : à adopter dans Réglages › Versions du moteur') && carte('jugee').includes('Adopter dans Réglages › Versions du moteur'));
  assert.ok(carte('adoptee').includes('Retirer') && carte('adoptee').includes('La correction n’est plus la dernière version du moteur'));
  assert.match(b, /<a [^>]*href="\/reglages"[^>]*>Adopter dans Réglages › Versions du moteur/);
  // Le journal : 3 entrées, puis le lien vers tout le journal (Historique moteur).
  const journal = b.split('data-partie="journal"')[1];
  assert.equal(compter(journal.split('</ol>')[0], /<li\b/g), 3);
  assert.match(journal, /<a [^>]*href="\/historique-moteur\?onglet=moteur"[^>]*>Tout le journal : Historique moteur › Écarts du mois/);
  // Les tons : à décider ambre, en file / à l'essai / jugée bleu, adoptée couleur de section ; JAMAIS de vert ni de jargon.
  assert.doesNotMatch(b, VERT);
  sansJargon(t, 'bloc des corrections');
  // (Le rendu côté serveur met la classe dynamique d'abord : on lit le ton dans la liste des classes, sans compter sur l'ordre.)
  const tons = [...b.matchAll(/<span class="([^"]*\bcorr__etat\b[^"]*)"/g)].map((m) => m[1].split(/\s+/).filter((c) => c.startsWith('is-')).join(' '));
  assert.deepEqual(tons, ['is-warning', 'is-warning', 'is-warning', 'is-info', 'is-info', 'is-info', 'is-section'], 'à décider ambre, en file / à l’essai / jugée bleu, adoptée couleur de section');
  assert.ok(r.html.length < 120_000, `la page reste légère : ${r.html.length} octets`);
});

test('Santé, une table illisible : le cadre dit « illisible » (sa raison), sans rien inventer — aucune partie du bloc, un seul lien (sa vraie place)', options, async () => {
  const ri = phase('illisible');
  assert.equal(ri.corrections.corps.disponible, false);
  const V0 = (await rendu.charger('/src/views/EngineHealthView.vue')).default;
  const r = await rendu.rendre(V0, {}, santeAvec(ri.sante.corps));
  assert.deepEqual(r.avertissements, []);
  const b = blocDe(r.html, 'corrections');
  assert.match(b, /data-etat="indisponible"/);
  assert.ok(texteDe(b).includes('illisible'));
  assert.doesNotMatch(b, /data-partie=/);
  assert.equal(compter(b, /<a [^>]*href="/g), 1);
});

// ============================================================ 3. le câblage

test('câblage (B33) : CHAQUE action passe par window.confirm AVANT la route et envoie l’état vu (`vue`) ; la page se relit ensuite (une seule lecture) ; le bloc et le formulaire n’appellent rien eux-mêmes ; le panneau d’Historique moteur ne fait que lire', () => {
  const vue = lireUi('views', 'EngineHealthView.vue');
  const agir = vue.split('async function agir(')[1].split('\n}\n')[0];
  assert.ok(agir.indexOf('if (!texte || !window.confirm(texte)) return;') > -1, 'la confirmation, toujours');
  assert.ok(agir.indexOf('window.confirm(texte)') < agir.indexOf('await appel()'), 'la confirmation AVANT la route');
  assert.ok(agir.indexOf('await charger();') > agir.indexOf('await appel()'), 'puis la page se relit');
  for (const [fn, appel, confirmation] of [
    ['mesurerAuBanc', 'correctionsApi.mesurerAuBanc(p.id, p.etat)', 'confirmationDuBanc(p)'],
    ['mettreALEssai', 'correctionsApi.accepter(p.id, p.etat)', 'confirmationDeLEssai(p, '],
    ['refuserLaCorrection', 'correctionsApi.refuser(p.id, p.etat)', 'confirmationDuRefus(p)'],
    ['retirerLaCorrection', 'correctionsApi.retirer(p.id, p.etat)', 'confirmationDuRetrait(p)'],
    ['proposerUneCorrection', 'correctionsApi.proposer(corps)', 'confirmationDeLaProposition(corps)']
  ]) {
    const ligne = vue.split('\n').find((l) => l.startsWith(`const ${fn} = `)) ?? '';
    assert.ok(ligne.includes('agir(') && ligne.includes(appel) && ligne.includes(confirmation), `${fn} : agir + confirmation + vue`);
  }
  assert.equal(compter(vue, /window\.confirm\(/g), 1, 'un seul endroit confirme : agir()');
  assert.equal(compter(vue, /engineHealthApi\.overview\(\)/g), 1, 'une seule lecture');
  assert.doesNotMatch(vue, /httpClient\.|fetch\(/);
  const api = lireUi('services', 'correctionsApi.js');
  for (const r of ['banc', 'accepter', 'retirer']) assert.match(api, new RegExp(`/\\$\\{id\\(correction\\)\\}/${r}\`, \\{ vue \\}\\)`), `POST /${r} envoie vue`);
  assert.match(api, /\/refuser`, \{ vue, phrase \}\)/);
  assert.match(api, /httpClient\.post\('\/corrections\/proposer', \{ levier, valeur, phrase \}\)/);
  for (const f of [['components', 'analysis', 'CorrectionsBlock.vue'], ['components', 'analysis', 'CorrectionProposalForm.vue']]) {
    const src = sansCommentaires(lireUi(...f));
    assert.doesNotMatch(src, /correctionsApi|httpClient|fetch\(|window\.confirm/, `${f.at(-1)} : affichage pur (la page confirme et appelle)`);
    assert.doesNotMatch(src, /<select|<section|data-bloc=/, `${f.at(-1)} : jamais de <select> natif, ni <section>, ni data-bloc`);
    assert.doesNotMatch(src, /#[0-9a-f]{3,6}\b|!important|--cm-section-soft\)/i, `${f.at(-1)} : jetons seulement`);
  }
  assert.match(lireUi('components', 'analysis', 'CorrectionsBlock.vue'), /defineEmits\(\['banc', 'accepter', 'refuser', 'retirer', 'proposer'\]\)/);
  const panneau = lireUi('components', 'analysis', 'CorrectionTriPanel.vue');
  assert.doesNotMatch(panneau, /correctionsApi\.(proposer|mesurerAuBanc|accepter|refuser|retirer)|httpClient|fetch\(/, 'le panneau ne fait que lire');
  assert.doesNotMatch(panneau, /<select|#[0-9a-f]{3,6}\b|!important|--cm-section-soft\)/i);
  const historique = lireUi('views', 'PredictionsHistoryView.vue');
  assert.match(historique, /import CorrectionTriPanel from '@\/components\/analysis\/CorrectionTriPanel\.vue';/);
  assert.ok(historique.indexOf('<CalibrationPanel />') < historique.indexOf('<CorrectionTriPanel />') && historique.indexOf('<CorrectionTriPanel />') < historique.indexOf('<AiScorecardPanel />'), 'juste après la calibration, avant le carnet de l’IA');
  assert.equal(compter(historique, /<CorrectionTriPanel \/>/g), 1, 'une seule place');
  // Vérification finale, constat 1 (décision 17) : le tri ne regarde pas « toutes les issues », et il est plus bas dans l'onglet.
  assert.match(lireUi('components', 'analysis', 'CalibrationPanel.vue'), /Ces verdicts sont ceux du mois, sur l’issue choisie par le moteur\. Le tri « malchance ou vrai défaut » \(issue de référence et issue favorite de chaque marché, en comptant toute l’année\) est plus bas dans cet onglet/);
});

// ============================================================ 4. Historique moteur

const triAvec = (r, { etatCode = 200 } = {}) => [
  [/\/api\/corrections$/, ok(r.corrections.corps, etatCode)],
  [/\/api\/corrections\/tri\?mois=2026-10$/, ok(r.tri.corps)],
  [/\/api\/corrections\/journal\?limite=50$/, ok(r.journal.corps)]
];

test('Historique moteur, le tri d’octobre : les mois triés, quatre chiffres clés, le tableau des 22 cases (Σ des issues et des matchs, ⌀ de l’écart absolu au pied), le détail par régime, les écartés, tout le journal, la provenance ; trois lectures, aucun vert, aucun jargon', options, async () => {
  const r1 = phase('rempli');
  const P = (await rendu.charger('/src/components/analysis/CorrectionTriPanel.vue')).default;
  const r = await rendu.rendre(P, {}, triAvec(r1));
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(rendu.interdits, []);
  assert.deepEqual(r.appels.map((a) => a.replace(/^GET .*\/api/, 'GET /api')), ['GET /api/corrections', 'GET /api/corrections/tri?mois=2026-10', 'GET /api/corrections/journal?limite=50']);
  const cases = tableauDe(r.html, 'cases-du-tri');
  assert.equal(corps(cases).length, 22, '22 lignes');
  const piedCases = texteDe(pied(cases)[0]);
  for (const morceau of ['Σ 11 712 issues mesurées', 'Σ 1 420 matchs du mois', '⌀', 'cases mesurées sur 22']) assert.ok(espaces(piedCases).includes(morceau), `pied, manque : ${morceau}`);
  const corners = texteDe(corps(cases).find((l) => l.includes('data-cas="totalCorners|niveau"')));
  for (const morceau of ['Corners du match', 'niveau : « plus de corners que la ligne »', 'septembre 2026', 'octobre 2026', '1 420', 'vrai défaut : à corriger', 'demande du code']) assert.ok(espaces(corners).includes(morceau), `ligne des corners, manque : ${morceau}`);
  assert.equal(corps(tableauDe(r.html, 'regimes-du-tri')).length, 5);
  assert.equal(corps(tableauDe(r.html, 'journal')).length, r1.journal.corps.entrees.length);
  const t = texteDe(r.html);
  for (const morceau of ['Écarts du mois : malchance ou vrai défaut (étape 26)', 'octobre 2026', 'Version jugée', 'n° 5', 'Marge du hasard', '22 cases × 12 mois', 'Seuil d’un vrai défaut', 'Par régime (pour comprendre, jamais jugé)', 'Calculé par une autre version du moteur', 'Le journal de la boucle de correction', 'Boucle de correction : pronostics gelés (table engine_picks du magasin) et résultats FotMob du magasin', 'Tri d’octobre 2026 figé : il ne sera jamais recalculé.']) assert.ok(espaces(t).includes(morceau), `panneau, manque : ${morceau}`);
  assert.match(r.html, /<button[^>]*aria-pressed="true"[^>]*>octobre 2026<\/button>/);
  assert.doesNotMatch(r.html.replace(/<style[\s\S]*?<\/style>/g, ''), VERT);
  sansJargon(t, 'panneau d’Historique moteur');
});

test('Historique moteur, avant le premier tri puis en panne : le tableau garde ses 22 lignes — « pas encore mesuré » et la raison, puis « illisible » et l’erreur dite', options, async () => {
  const r0 = phase('vide');
  const P = (await rendu.charger('/src/components/analysis/CorrectionTriPanel.vue')).default;
  const avant = await rendu.rendre(P, {}, triAvec(r0));
  assert.deepEqual(avant.avertissements, []);
  assert.equal(corps(tableauDe(avant.html, 'cases-du-tri')).length, 22);
  assert.ok(texteDe(avant.html).includes('Aucun mois trié pour l’instant : le premier tri se fait le 1er du mois à partir de 6 h, après le gel de la calibration.'));
  assert.equal(compter(texteDe(tableauDe(avant.html, 'cases-du-tri')), /pas encore mesuré/g), 22 * 2);
  const panne = await rendu.rendre(P, {}, [[/\/api\/corrections$/, ok({ error: 'Le serveur ne répond pas' }, 503)]]);
  assert.equal(corps(tableauDe(panne.html, 'cases-du-tri')).length, 22);
  assert.ok(texteDe(panne.html).includes('Écarts du mois indisponibles') && texteDe(panne.html).includes('Le serveur ne répond pas'));
  assert.ok(texteDe(tableauDe(panne.html, 'cases-du-tri')).includes('illisible'));
});

// ============================================================ 5. le formulaire

test('le formulaire « Proposer une correction », ouvert (après l’essai du modèle de buts) : le réglage dans une liste dessinée, la nouvelle valeur bornée par le pas du serveur, la valeur en service, les marchés touchés, la phrase facultative et son compteur, « Proposer » / « Annuler »', options, async () => {
  const formulaire = PROPS.etatDuFormulaire({ place: { prise: false }, reglagesEnService: { modeleDeButs: REGLAGES_MODELE_DE_BUTS }, propositions: [] });
  assert.equal(formulaire.ouvert, true);
  const Form = (await rendu.charger('/src/components/analysis/CorrectionProposalForm.vue')).default;
  const r = await rendu.rendre(Form, { formulaire });
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(r.appels, [], 'le formulaire n’appelle rien');
  const t = espaces(r.texte);
  for (const morceau of ['Réglage', 'Corrélation des petits scores', 'Nouvelle valeur', `entre ${String.fromCharCode(0x2212)}0,30 et 0,30, bornes exclues ; par pas de 0,01`, 'Valeur en service', 'Total buts, Les 2 équipes marquent, Buts d’une équipe, Résultat + total buts', 'Pourquoi (facultatif)', '0 / 300 caractères', 'Proposer', 'Annuler', 'Rien ne change dans vos chiffres sans votre clic « Adopter » dans Réglages']) assert.ok(t.includes(morceau), `formulaire, manque : ${morceau}`);
  assert.match(r.html, /<input[^>]*type="number"[^>]*min="-0\.3"[^>]*max="0\.3"[^>]*step="0\.01"/);
  assert.doesNotMatch(r.html, /<select/);
  assert.doesNotMatch(r.html, VERT);
  sansJargon(t, 'formulaire');
});

// ============================================================ 6. Réglages, budget, barre du haut, guide

const CONFIG = { edgeThresholdMin: 0.02, edgeThresholdMax: 0.3, kellyFraction: 0.25, maxStakePercent: 0.02, defaultCorrelation: -0.05, cornersAdjustmentMax: 0.08, valueBookmakers: [], maxValueOdds: 5 };
const TEXTE_JUGEE = 'Enregistrer efface le verdict « retenu » de la candidate et recommence son essai (au moins 21 jours) : adoptez-la d’abord, ou attendez.';

test('Réglages (B34, B46) : avec la candidate de l’étape 27 EN ESSAI, la note dit « si cette version est encore en service la nuit prochaine, l’essai repart de zéro » ; JUGÉE « retenu », le texte exact du constat 8 ; sans candidate, aucune note — et « Enregistrer » redemande (window.confirm), la remise à zéro aussi', options, async () => {
  const versionsEnEssai = phase('vide').versions.corps;
  const versionsJugee = phase('jugee').versions.corps;
  assert.deepEqual([versionsEnEssai.candidate.statut, versionsJugee.candidate.statut, versionsJugee.candidate.jugement.verdict], ['en-essai', 'jugee', 'retenu']);
  const a1 = V.avertissementDeLEnregistrement(versionsEnEssai);
  assert.equal(a1.genre, 'en-essai');
  assert.equal(
    a1.texte,
    'Une candidate est en essai à blanc (« Modèle de buts unique », essai n° 2 depuis le 24/10). Enregistrer ces réglages crée une nouvelle version du moteur, même pour un réglage de pari (vos bookmakers, le seuil de value, la mise) : si cette version est encore en service la nuit prochaine, l’essai repart de zéro (verdict repoussé d’au moins 2 jours). Si ce n’est pas urgent, attendez le verdict (au plus tôt le 14/11).'
  );
  assert.ok(a1.confirmation.endsWith('Enregistrer quand même ?') && a1.confirmation.includes('cette version est encore en service la nuit prochaine'));
  assert.ok(a1.confirmationRemise.startsWith('Remettre les valeurs par défaut ?'));
  const a2 = V.avertissementDeLEnregistrement(versionsJugee);
  assert.deepEqual([a2.genre, a2.texte], ['jugee', TEXTE_JUGEE]);
  assert.equal(a2.confirmation, `${TEXTE_JUGEE}\n\nEnregistrer quand même ?`);
  assert.equal(V.avertissementDeLEnregistrement({ candidate: null }), null);
  assert.equal(V.avertissementDeLEnregistrement(null), null);
  assert.equal(V.avertissementDeLEnregistrement({ candidate: { ...versionsEnEssai.candidate, statut: 'pas-en-essai' } }), null, 'déclarée mais pas encore calculée : rien à recommencer');
  assert.ok(!a1.texte.includes('Proposer une correction'), 'le formulaire de la boucle est fermé pendant l’essai : la note n’y renvoie pas (constat 8a)');
  const Form = (await rendu.charger('/src/components/settings/EngineConfigForm.vue')).default;
  const enEssai = await rendu.rendre(Form, { config: CONFIG, essai: versionsEnEssai });
  assert.deepEqual(enEssai.avertissements, []);
  assert.match(enEssai.html, /class="cm-note is-warning config-form__avertissement"[^>]*data-avertissement-essai[^>]*data-genre="en-essai"/);
  assert.ok(espaces(enEssai.texte).includes(a1.texte));
  assert.ok(enEssai.html.indexOf('data-avertissement-essai') < enEssai.html.indexOf('Enregistrer'), 'au-dessus des boutons');
  const jugee = await rendu.rendre(Form, { config: CONFIG, essai: versionsJugee });
  assert.match(jugee.html, /data-genre="jugee"/);
  assert.ok(espaces(jugee.texte).includes(TEXTE_JUGEE));
  assert.ok(!espaces(jugee.texte).includes('la nuit prochaine'), 'jugée : jamais le texte de l’essai en cours (B46)');
  const sans = await rendu.rendre(Form, { config: CONFIG, essai: null });
  assert.doesNotMatch(sans.html, /data-avertissement-essai/);
  // Sur le source : la confirmation à l'enregistrement et à la remise à zéro, l'état émis par la carte des versions.
  const form = lireUi('components', 'settings', 'EngineConfigForm.vue');
  const save = form.split('function handleSave() {')[1].split('\n}\n')[0];
  assert.ok(save.indexOf('if (avertissement.value && !window.confirm(avertissement.value.confirmation)) return;') > -1 && save.indexOf('window.confirm') < save.indexOf("emit('save'"), 'confirmer AVANT d’envoyer');
  const reglages = lireUi('views', 'SettingsView.vue');
  assert.match(reglages, /<EngineConfigForm :config="configStore\.config" :saving="saving" :essai="etatDesVersions" @save="handleSaveConfig" @reset="handleResetConfig" \/>/);
  assert.match(reglages, /@lu="\(d\) => \(etatDesVersions = d\)"/);
  assert.match(reglages, /if \(essaiEnCours && !window\.confirm\(essaiEnCours\.confirmationRemise\)\) return;/);
  const panneau = lireUi('components', 'settings', 'EngineVersionsPanel.vue');
  assert.match(panneau, /defineEmits\(\['retour', 'lu'\]\)/);
  assert.match(panneau, /if \(donnees\) emit\('lu', donnees\);/);
});

test('Réglages : la fin d’une correction de la boucle (« fermée par la boucle de correction (voir Santé du moteur) »), les autres fins en mots, la liste des candidates passées sur la carte des versions', () => {
  assert.equal(V.finDUneCandidateDite({ fin: 'retiree-du-code', origine: 'correction-mensuelle' }), 'fermée par la boucle de correction (voir Santé du moteur)');
  assert.equal(V.finDUneCandidateDite({ fin: 'retiree-du-code', origine: 'code' }), 'retirée du code');
  assert.equal(V.finDUneCandidateDite({ fin: 'adoptee' }), 'adoptée');
  assert.equal(V.finDUneCandidateDite({ fin: 'remplacee' }), 'remplacée par une autre candidate');
  const liste = V.candidatesPasseesDites({ candidatesPassees: [{ id: 'modele-buts-v1', etape: '27', fin: 'adoptee', finLe: '2026-11-15T10:00:00.000Z', version: 6, origine: 'code' }, { id: 'c26-2027-01-rho-1', etape: '26', fin: 'retiree-du-code', finLe: '2027-02-20T10:00:00.000Z', origine: 'correction-mensuelle' }] });
  assert.deepEqual(liste.map((c) => [c.nom, c.fin]), [['une correction du mois (c26-2027-01-rho-1)', 'fermée par la boucle de correction (voir Santé du moteur)'], ['Modèle de buts unique', 'adoptée']]);
  const panneau = lireUi('components', 'settings', 'EngineVersionsPanel.vue');
  assert.match(panneau, /<li v-for="c in candidatesPassees" :key="`\$\{c\.id\}-\$\{c\.le\}`" class="ev__petit">« \{\{ c\.nom \}\} » \(étape \{\{ c\.etape \}\}\) — \{\{ c\.fin \}\}, le \{\{ c\.le \}\}/);
});

test('budget Claude : le type « Résumé du mois (boucle de correction) » — automatique, compté sur le plafond, une fois par mois — et sa place sous le plafond ; le compteur d’accord avec le journal', options, async () => {
  const budget = phase('rempli').budget.corps;
  assert.deepEqual([budget.plafond.resumeMois, budget.plafond.aujourdhui, budget.coherence.egal], [1, 1, true]);
  const Panel = (await rendu.charger('/src/components/settings/ClaudeBudgetPanel.vue')).default;
  const r = await rendu.rendre(Panel, { variante: 'complete' }, [[/\/api\/claude-budget/, ok(budget)]]);
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(rendu.interdits, []);
  const t = espaces(r.texte);
  assert.ok(t.includes('Résumé du mois (boucle de correction) automatique · compté sur le plafond une fois par mois, juste après le tri du mois'), 'la ligne du type');
  assert.ok(t.includes('dont 1 pour le résumé du mois (boucle de correction).'));
  assert.equal(compter(t, /automatique · compté sur le plafond/g), 7, 'sept types automatiques');
});

test('la puce du haut : l’alerte durable « boucleCorrection » (ses erreurs seulement) compte dans les alertes et se dit au survol, insérée avant les lignes d’avant', () => {
  const barre = lireUi('components', 'layout', 'AppTopbar.vue');
  assert.match(barre, /import \{ alerteDeLaBoucleDite \} from '@\/utils\/corrections\.js';/);
  assert.match(barre, /const alerteBoucle = computed\(\(\) => alerteDeLaBoucleDite\(refresh\.value\?\.alerts\?\.boucleCorrection \?\? null\)\);/);
  assert.match(barre, /alerteBoucle\.value \|\|\n {6}alertesSauvegarde\.value\.length \|\|/);
  assert.match(barre, /'Actualisation automatique — détails dans Réglages',\n {4}\.\.\.\(alerteBoucle\.value \? \[alerteBoucle\.value\] : \[\]\),/);
});

// ============================================================ 7. Les corrections de la vérification finale (28/10/2026)

test('vérification finale, constat 1 (décision 17) : jamais « sur toutes les issues » à l’écran — le tri regarde, pour chaque marché, l’issue de référence (niveau) et l’issue favorite (confiance), pour le 1N2 la victoire à domicile et le favori ; le renvoi de la calibration dit « plus bas dans cet onglet »', () => {
  const panneau = lireUi('components', 'analysis', 'CorrectionTriPanel.vue');
  const calibration = lireUi('components', 'analysis', 'CalibrationPanel.vue');
  const historique = lireUi('views', 'PredictionsHistoryView.vue');
  for (const [nom, source] of [['CorrectionTriPanel.vue', panneau], ['CalibrationPanel.vue', calibration], ['PredictionsHistoryView.vue', historique]]) assert.doesNotMatch(source, /toutes les issues/, `${nom} : la promesse fausse de la décision 17`);
  assert.ok(panneau.includes('subtitle="Chaque mois, pour chaque marché, l’issue de référence (niveau) et l’issue favorite (confiance) des pronostics gelés de la version du moteur en service (pour le 1N2 : la victoire à domicile et le favori). Un écart qui peut venir du hasard est de la malchance ;'), 'le sous-titre du panneau');
  assert.ok(calibration.includes('Le tri « malchance ou vrai défaut » (issue de référence et issue favorite de chaque marché, en comptant toute l’année) est plus bas dans cet onglet (« Écarts du mois », étape 26).'), 'le renvoi de la calibration');
  assert.doesNotMatch(calibration, /juste en dessous/, 'le panneau suit toute la calibration, pas le bloc « Par marché »');
  // Ce que disent les écrans est ce que le tri mesure (regles.js, mesures.js) : l'issue de référence du 1N2 est la victoire de l'équipe qui reçoit.
  assert.equal(REGLES.FAMILLES.find((f) => f.id === 'result').canonique.cle, 'home');
});

test('vérification finale, constat 5 : tant que l’état des versions n’est pas lu (lecture lente ou en échec), « Enregistrer » et « Réinitialiser » demandent une confirmation générique AVANT d’envoyer ; lu, seule une candidate en essai ou jugée la demande', () => {
  assert.equal(V.confirmationSansEtat(null), 'L’état de l’essai à blanc n’est pas lu : si une candidate est en essai, enregistrer peut faire repartir son essai.\n\nEnregistrer quand même ?');
  assert.equal(V.confirmationSansEtat(undefined, { remise: true }), 'L’état de l’essai à blanc n’est pas lu : si une candidate est en essai, remettre les valeurs par défaut peut faire repartir son essai.\n\nRemettre les valeurs par défaut quand même ?');
  assert.equal(V.confirmationSansEtat(phase('vide').versions.corps), null, 'lu, avec la candidate en essai : son avertissement suffit');
  assert.equal(V.confirmationSansEtat({ candidate: null }), null, 'lu sans candidate : rien à redemander');
  assert.equal(V.confirmationSansEtat({ candidate: null }, { remise: true }), null);
  for (const t of Object.values(V.CONFIRMATIONS_SANS_ETAT)) sansJargon(t, 'confirmation générique');
  // Le câblage : chaque bouton la demande AVANT d'envoyer (« Annuler » n'envoie rien).
  const save = lireUi('components', 'settings', 'EngineConfigForm.vue').split('function handleSave() {')[1].split('\n}\n')[0];
  assert.ok(save.includes('const sansEtat = confirmationSansEtat(props.essai);') && save.includes('if (sansEtat && !window.confirm(sansEtat)) return;'), 'Enregistrer');
  assert.ok(save.indexOf('window.confirm(sansEtat)') < save.indexOf("emit('save'"), 'confirmer AVANT d’envoyer');
  const remise = lireUi('views', 'SettingsView.vue').split('async function handleResetConfig() {')[1].split('\n}\n')[0];
  assert.ok(remise.includes('const sansEtat = confirmationSansEtat(etatDesVersions.value, { remise: true });') && remise.includes('if (sansEtat && !window.confirm(sansEtat)) return;'), 'Réinitialiser');
  assert.ok(remise.indexOf('window.confirm(sansEtat)') < remise.indexOf('configStore.resetConfig()'), 'confirmer AVANT de remettre à zéro');
});

/** Les règles CSS du <style scoped> d'un composant, commentaires retirés : [{ selecteurs, corps }]. */
const reglesCss = (source) =>
  (source.split('<style scoped>')[1] ?? '')
    .split('</style>')[0]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((bloc) => bloc.split('{'))
    .filter((p) => p.length === 2)
    .map(([sel, corps]) => ({ selecteurs: sel.split(',').map((x) => x.trim()), corps: corps.trim() }));

test('vérification finale, constat 6 : la pastille « adoptée » (l’état d’une correction, le journal de Santé et celui d’Historique moteur) n’a jamais le fond émeraude — chaque pastille qui peut la porter a sa règle locale en teinte légère de la section', () => {
  const blocSrc = lireUi('components', 'analysis', 'CorrectionsBlock.vue');
  const panneauSrc = lireUi('components', 'analysis', 'CorrectionTriPanel.vue');
  // Les pastilles qui peuvent porter « is-section » : l'état « adoptée » et l'entrée « adoptée » du journal — et elles seules.
  assert.equal(C.tonDe('section'), 'is-section');
  assert.equal(C.journalDit([{ n: 1, le: '2026-11-01T08:00:00.000Z', evenement: 'adoptee', phrase: 'Adoptée.' }])[0].ton, 'is-section');
  assert.ok(blocSrc.includes('<span class="cm-chip corr__etat" :class="c.pastille.ton">') && blocSrc.includes('<span class="cm-chip corr__evenement" :class="e.ton">'));
  assert.ok(panneauSrc.includes('<span class="cm-chip ctri__statut" :class="e.ton">'));
  const teinte = 'background: rgba(var(--cm-section-rgb) / 0.12);';
  const bloc = reglesCss(blocSrc);
  const panneau = reglesCss(panneauSrc);
  for (const [quoi, regles, selecteur] of [['Santé, l’état d’une correction', bloc, '.corr__etat.is-section'], ['Santé, le journal', bloc, '.corr__evenement.is-section'], ['Historique moteur, le journal', panneau, '.ctri__statut.is-section'], ['Historique moteur, le mois choisi', panneau, '.ctri__pastille.is-section']]) {
    assert.ok(regles.some((r) => r.selecteurs.includes(selecteur) && r.corps.includes(teinte)), `${quoi} : ${selecteur} en teinte légère`);
  }
  for (const r of [...bloc, ...panneau]) assert.doesNotMatch(r.corps, /--cm-section-soft|--cm-accent/, r.selecteurs.join(', '));
});

test('vérification finale, constat 7 : la confirmation du banc dit que l’actualisation automatique attend pendant la mesure — une passe prévue pendant ce temps est repoussée à la suivante (environ 3 h)', () => {
  const banc = C.confirmationDuBanc(phase('rempli').corrections.corps.propositions.find((x) => x.etat === 'proposee'));
  assert.ok(banc.includes('Pendant la mesure, l’actualisation automatique attend : une passe prévue pendant ce temps est repoussée à la suivante (environ 3 h).'), banc);
  assert.ok(banc.indexOf('un seul calcul lourd à la fois') < banc.indexOf('Pendant la mesure') && banc.indexOf('Pendant la mesure') < banc.indexOf('Son verdict est indicatif'), 'après la durée, avant le verdict');
  assert.doesNotMatch(banc, /prochaine passe/, 'le banc part au clic, pas « après la prochaine passe »');
  sansJargon(banc, 'confirmation du banc');
});

test('vérification finale, constat 10 : l’en-tête de Santé du moteur garde sa phrase entière (« Un bloc dont la donnée manque reste affiché avec « pas encore mesuré » »), le paragraphe des clics de l’étape 26 vient après elle', () => {
  const entete = lireUi('views', 'EngineHealthView.vue').split('/**')[1].split('*/')[0];
  const lignes = entete.split('\n').map((l) => l.replace(/^\s*\*\s?/, ''));
  const i = lignes.findIndex((l) => l.endsWith('Un bloc dont la donnée'));
  assert.ok(i > -1, 'la phrase commence');
  assert.ok(lignes[i + 1].startsWith('manque reste affiché avec « pas encore mesuré »'), `coupée : ${lignes[i + 1]}`);
  const fin = lignes.findIndex((l) => l.includes('Les mots viennent de utils/santeMoteur.js (et des règles des vraies places).'));
  const clics = lignes.findIndex((l) => l.startsWith("Les CLICS de l'étape 26"));
  assert.ok(fin > i && clics > fin, 'le paragraphe des clics après la phrase entière');
});

test('ui/DESIGN.md : le paragraphe « Depuis l’étape 26 » (le bloc, ses quatre parties, ses boutons, window.confirm, aucun vert, le panneau d’Historique moteur, l’avertissement de Réglages) et l’exception écrite du constat 14 ; la place réservée n’est plus dite', () => {
  const guide = fs.readFileSync(path.join(UI, 'DESIGN.md'), 'utf8');
  for (const morceau of ["Depuis l'étape 26 du plan (28/10/2026, la **boucle de correction**)", '`components/analysis/CorrectionsBlock.vue`', '« Mesurer au banc — environ 10 min »', 'TOUTE action passe par `window.confirm`', '**Exception écrite (constat 14 de la critique de l\'étape 26)**', '« 22 cases × 12 mois : la marge du hasard en tient compte »', '`CorrectionTriPanel.vue`', '`avertissementDeLEnregistrement`', 'fermée par', 'Historique moteur › Écarts du mois)']) assert.ok(guide.includes(morceau), `DESIGN.md, manque : ${morceau}`);
  assert.doesNotMatch(guide, /la place est réservée à\nl'étape 26/);
  assert.doesNotMatch(guide, /Feuille de route › étape 26\)/);
});
