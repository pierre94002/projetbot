/**
 * LES CARTONS (étape 33, lot 1b, partie D, 02/11/2026) — la lecture et l'écran, rendus côté serveur, sans navigateur ni
 * serveur de développement (aides/rendu.mjs : `fetch` remplacé, tout appel refusé et compté ; horloge figée) :
 *   node --test test/cartonsEcran.test.mjs        (depuis server/)
 *
 * Les réponses ne sont pas écrites à la main : le VRAI serveur les produit dans une copie isolée — la lecture des cartons
 * d'un match (cartonsRead.cartonsDuMatch) et l'arbitre désigné dans la table des cartons (cartonsRead.arbitreDesCartons),
 * sur un MAGASIN FABRIQUÉ, avant et après une nuit (aides/script-cartons-ecran.mjs : aucun résultat réel). La page FotMob
 * du match est posée autour de ces vraies réponses.
 *   T-L1 la LECTURE : cinq lectures par clé, AUCUNE écriture, moins de 25 ms ; « pas encore calculé », « clubs inconnus »
 *        (sans lire la base), « compétition sans cartons », « illisible » ; le bloc joint APRÈS l'analyse par un import()
 *        dynamique ; l'IA ne le reçoit jamais ;
 *   T-L2 l'APERÇU : l'arbitre désigné dans la table des cartons (clé « nom|pays », homonymes), jamais les moyennes FotMob ;
 *   T-E1 chaque phrase (§7.2, corrigée par la critique : constats 3, 4 et 14), exacte, sur ces vraies formes ;
 *   T-E2 les pastilles : « Explication seulement » par défaut ; « Effet mesuré » + « pas encore un marché » (cartons) ou
 *        « pas encore dans le pourcentage » (corners, tirs cadrés) pour les seules familles utiles au banc ;
 *   T-E3 la provenance de chaque ligne ; l'ambre au-delà de 24 h ; le banc : un jour, sans heure inventée, jamais ambre ;
 *   T-E4 les états vides, dits en mots ; toujours les cinq lignes et les quatre mentions fixes ;
 *   T-E5 une seule place : pas de famille « Cartons » dans MarketPicksBoard, aucun pourcentage à blanc des corners ni des
 *        tirs, la carte du moteur « Corners et tirs attendus » inchangée, ni les moyennes brutes de l'arbitre ni le chiffre
 *        de l'enjeu dans la carte ;
 *   T-E6 la loi de l'écran = celle du serveur à 1e-12 (binomiale négative, binomiale, Poisson) ; les lignes du total
 *        seulement si les cartons des équipes sont utiles au banc ;
 *   T-E7 le tableau du banc : huit lignes, Σ (matchs distincts, jamais une somme), ⌀, « non mesurable » pour l'enjeu ; le
 *        tableau des réglages par championnat ;
 *   T-E8 aucune requête de plus à l'ouverture de la page : la carte et ses règles n'importent aucun service ; la page lui
 *        passe ce qu'elle a déjà ; le septième contrôle anti-fuite dit en mots ; DESIGN.md et la feuille de route ;
 *   T-E9 le libellé de compétition retrouve la ligne de la note par championnat ; un libellé inconnu : réglage commun ;
 *   T-E10 les clubs par identifiant FotMob : « Port » sans identifiant n'emprunte jamais les cartons d'un autre club.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { UI, imp, interfacePrete, optionsDuRendu, ouvrirLeRendu, reglesPures, espaces, tableauDe, corps, pied, entetes } from './aides/rendu.mjs';
import { CARTONS_AU_BANC } from '../src/data/cartons/noteDesCartons.js';
import * as F from '../src/data/cartons/formulesDesCartons.js';
import * as R from '../src/data/cartons/cartonsRead.js';
import { HISTORIQUE } from '../src/data/roadmap/historique.js';

const U = interfacePrete || fs.existsSync(path.join(UI, 'src', 'utils', 'cartonsABlanc.js')) ? await imp(path.join(UI, 'src', 'utils', 'cartonsABlanc.js')) : null;
const SRC = path.join(SERVEUR, 'src');
const lireSrc = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8');
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8');
const copie = (x) => JSON.parse(JSON.stringify(x));
const MOINS = String.fromCharCode(0x2212);
const VERT = /is-mesure|is-compte|is-accent|cm-positive|vbadge|is-value/;

let memo = null;
/** La lecture et l'aperçu, par le vrai code, sur un magasin fabriqué (une copie isolée, base neuve, une nuit). */
function serveur() {
  if (memo) return memo;
  const c = preparerCopie({ base: false });
  try {
    const r = executer(c, path.join(SERVEUR, 'test', 'aides', 'script-cartons-ecran.mjs'), { args: ['{}'], timeout: 300_000 });
    assert.equal(r.code, 0, `script-cartons-ecran :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-1500)}`);
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
const MATCH = { home: 'Club 6001', away: 'Club 6002', league: 'Ligue Test', homeId: 'fotmob-6001', awayId: 'fotmob-6002' };
const PRET = { loading: false, error: null, result: {} };
const ETEINT = { affichage: { saisons: 'eteint', matchs: 'eteint' }, enjeu: null, deroule: null };
/** La page FotMob du match (la forme de buildMatchPreview) avec l'arbitre de la table des cartons. */
function pageFotMob({ referee = { name: 'Clément Arbitre', country: 'France', yellowCardsPerMatch: 9.9, foulsPerMatch: 30 }, arbitre = serveur().arbitres.connu, releveLe = '2026-07-26T09:58:00.000Z' } = {}) {
  const a = arbitre ? copie(arbitre) : arbitre;
  if (a) delete a.__mesure;
  return { loading: false, error: null, data: { available: true, kickoff: '2026-07-26T18:00:00.000Z', meta: { ...(referee ? { referee } : {}) }, releveLe, arbitreDesCartons: a, arbitreAuMagasin: null } };
}
const dit = (cartons, { page = pageFotMob(), simulation = ETEINT, analyse = PRET, match = MATCH } = {}) => U.cartonsDit({ cartons, analyse, page, simulation, match });
const ligne = (d, cle) => d.lignes.find((l) => l.cle === cle);
const textes = (l) => l.phrases.map((p) => p.texte);

let rendu;
let Carte;
before(async () => {
  if (!interfacePrete) return;
  rendu = await ouvrirLeRendu({ cibles: /CartonsABlancCard\.vue$/, heure: '2026-07-24T18:00:00.000Z' });
  Carte = (await rendu.charger('/src/components/analysis/CartonsABlancCard.vue')).default;
});
after(async () => {
  await rendu?.fermer();
});
const carte = (cartons, { page = pageFotMob(), simulation = ETEINT, analyse = PRET, match = MATCH, heure = null } = {}) => {
  if (heure) rendu.horloge.liveNow.value = Date.parse(heure);
  return rendu.rendre(Carte, { cartons, analyse, page, simulation, match });
};

// ================================================================ T-L : la lecture (le serveur)

test('T-L1 la LECTURE (cartonsRead) : cinq lectures par clé, AUCUNE écriture, moins de 25 ms ; « pas encore calculé » avant la première nuit ; « clubs inconnus » sans identifiant (sans lire la base) ; « compétition sans cartons » ; « illisible » quand la base ne répond pas', () => {
  const s = serveur();
  assert.equal(s.nuit.mode, 'complet');
  const p = s.lectures.pret;
  assert.equal(p.etat, 'pret');
  assert.ok(p.__mesure.deuxieme < 25, `${p.__mesure.deuxieme} ms`);
  assert.equal(p.__mesure.ordres.length, 5);
  assert.ok(p.__mesure.ordres.every((q) => /^SELECT /.test(q)), 'aucune écriture');
  assert.equal(p.__mesure.ordres.filter((q) => /FROM cartons_etat WHERE cle = \?/.test(q)).length, 3);
  assert.equal(p.__mesure.ordres.filter((q) => /FROM cartons_equipes WHERE club = \?/.test(q)).length, 2);
  assert.deepEqual([s.lectures.avant.etat, s.lectures.avant.raison], ['pas-encore-calcule', 'premiere-nuit']);
  assert.deepEqual([s.lectures.port.etat, s.lectures.port.raison, s.lectures.port.__mesure.ordres.length], ['clubs-inconnus', 'domicile', 0]);
  assert.deepEqual([s.lectures.lesDeuxInconnus.raison, s.lectures.lesDeuxInconnus.__mesure.ordres.length], ['les-deux', 0]);
  assert.deepEqual([s.lectures.sansCartons.etat, s.lectures.sansCartons.raison, s.lectures.sansCartons.sansArbitre], ['competition-sans-cartons', 'moins-de-30-matchs', null]);
  assert.deepEqual([s.lectures.illisible.etat, s.lectures.illisible.raison], ['illisible', 'base-sans-reponse']);
  assert.deepEqual([s.lectures.sansBase.etat, s.lectures.sansBase.raison], ['illisible', 'base-absente']);
  // Les attendus = la formule pure, les paramètres FIGÉS de la note (bras complet, z = 0), l'état de la nuit.
  const c = CARTONS_AU_BANC.final.cartons.complet;
  const l = s.ligueTest;
  const e = p.equipes;
  const attendu = F.attendusDesCartons({ m: { dom: l.m.dom, ext: l.m.ext }, tendance: l.tendance.valeur, equipes: { rhoH: e.home.rho, piH: e.home.pi, rhoA: e.away.rho, piA: e.away.pi }, z: 0, parametres: c.parametres, bras: 'complet' });
  assert.deepEqual(p.sansArbitre, attendu);
  assert.deepEqual([p.parametres.beta, p.parametres.avecArbitre.invKTotal, p.parametres.sansArbitre.invKTotal], [c.parametres.beta, c.invKTotal, CARTONS_AU_BANC.final.cartons.equipes.invKTotal]);
  assert.deepEqual([e.home.n, e.home.pris, e.home.rho], [s.equipe6001.n, s.equipe6001.pris, s.equipe6001.rho]);
  // Un club sans match relevé : la moyenne (rapports à 1), jamais une erreur.
  assert.deepEqual([s.lectures.clubSansMatch.etat, s.lectures.clubSansMatch.equipes.away.n, s.lectures.clubSansMatch.equipes.away.rho], ['pret', 0, 1]);
  // Sans note du banc : « pas encore mesuré » partout, aucun attendu.
  assert.ok(Object.values(s.lectures.sansNote.statuts).every((x) => x.statut === 'non-mesure'));
  assert.equal(s.lectures.sansNote.sansArbitre, null);
});

test('T-L1 le bloc `cartons` est joint APRÈS l’analyse (import() dynamique, try/catch) : une lecture ratée n’empêche jamais l’analyse ; le verdict n’en sait rien ; l’IA ne le reçoit jamais', () => {
  const controleur = lireSrc('api', 'controllers', 'analysis.controller.js');
  assert.match(controleur, /const cartons = sportId === 'football' \? await cartonsDuMatchAnalyse\(avecFraicheur, analyse\) : null;\n(?: {2}\/\/.*\n| {2}const joueurs = sportId === 'football' \? await joueursDuMatchAnalyse\(avecFraicheur\) : null;\n| {2}const combinaison = sportId === 'football' \? await combinaisonDuMatchAnalyse\(avecFraicheur, getEngineConfig\(sportId\)\) : null;\n| {2}const coupe = sportId === 'football' \? await coupeDuMatchAnalyse\(avecFraicheur, analyse, getEngineConfig\(sportId\)\) : null;\n| {2}const debutsDeSaison = sportId === 'football' \? await debutsDeSaisonDuMatchAnalyse\(avecFraicheur\) : null;\n)* {2}(?:res\.json\(|const reponse = )\{ \.\.\.analyse, [^\n]*\.\.\.\(cartons \? \{ cartons \} : \{\}\)(?:, \.\.\.\(joueurs \? \{ joueurs \} : \{\}\))?(?:, \.\.\.\(combinaison \? \{ combinaison \} : \{\}\))?(?:, \.\.\.\(coupe \? \{ coupe \} : \{\}\))?(?:, \.\.\.\(debutsDeSaison \? \{ debutsDeSaison \} : \{\}\))? \}(?:\);|;\n {2}res\.json\(analyseAvecLaMise\(reponse, \{ contexte: contexteMise, match: avecFraicheur \}\)\);)/);
  assert.match(controleur, /async function cartonsDuMatchAnalyse\(match, analyse\) \{\n {2}try \{\n {4}const \{ cartonsDuMatch \} = await import\('\.\.\/\.\.\/data\/cartons\/cartonsRead\.js'\);\n {4}return cartonsDuMatch\(\{ match, analyse, database: openDb\(\) \}\);\n {2}\} catch \{\n {4}return \{ version: 1, etat: 'illisible', raison: 'lecture-ratee' \};/);
  assert.doesNotMatch(controleur, /^import .*cartons/m, 'aucun import statique de data/cartons/');
  const service = lireSrc('core', 'ai', 'matchAiAnalysisService.js');
  const resume = service.slice(service.indexOf('function resumeDuMoteur('), service.indexOf('\n}\n', service.indexOf('function resumeDuMoteur(')));
  assert.ok(resume.length > 200 && !/cartons\b|\.\.\.engineResult/.test(resume), 'le résumé donné à l’IA : des champs nommés, jamais les cartons à blanc');
  const imports = [...lireSrc('data', 'cartons', 'cartonsRead.js').matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['../contexte/formulesDuContexte.js', './formulesDesCartons.js', './noteDesCartons.js', './reglagesCartons.js']);
});

test('T-L2 l’APERÇU : l’arbitre désigné dans la table des cartons (clé « nom|pays », jamais les moyennes que FotMob affiche), ses homonymes d’un autre pays, rien sans nom, sans exception quand la base ne répond pas ; ajouté par lineupContext (bloc « ajout pur », import() dynamique)', () => {
  const a = serveur().arbitres;
  assert.equal(a.connu.cle, 'Clément Arbitre|France');
  assert.ok(a.connu.ligne.matchs > 20 && Number.isFinite(a.connu.ligne.indice) && a.connu.ligne.observes > 0);
  assert.ok(!('yellowCardsPerMatch' in a.connu.ligne) && !('foulsPerMatch' in a.connu.ligne));
  assert.deepEqual(a.connu.homonymes, []);
  assert.deepEqual(a.homonyme.homonymes.map((h) => h.pays), ['Belgium'], 'l’autre Jean Dupont, un autre pays, un autre arbitre');
  assert.deepEqual([a.inconnu.ligne, a.inconnu.homonymes], [null, []]);
  assert.equal(a.sansNom, null);
  assert.deepEqual([a.illisible.ligne, a.illisible.illisible], [null, true]);
  assert.ok(a.homonyme.__mesure.ordres.length === 2 && a.homonyme.__mesure.ordres.every((q) => /^SELECT .* FROM cartons_arbitres WHERE /.test(q)));
  const lc = lireSrc('data', 'providers', 'lineupContext.js');
  assert.match(lc, /arbitreDesCartons: await arbitreDesCartonsAuMagasin\(lu\.page\.meta\?\.referee, database\),/);
  assert.match(lc, /const \{ arbitreDesCartons \} = await import\('\.\.\/cartons\/cartonsRead\.js'\);/);
});

// ================================================================ T-E : l'écran

test('T-E1 les règles (ui/src/utils/cartonsABlanc.js) sont PURES ; chaque phrase, exacte, sur les vraies formes : en-tête, barres, équipes, championnat, arbitre (connu, de moins, sans match, pas désigné, homonyme, peu de matchs), enjeu, corners et tirs par championnat, banc, total, mentions', () => {
  assert.deepEqual([...reglesPures('cartonsABlanc.js')].sort(), ['cartonsABlanc.js', 'contexteDuMatch.js', 'fotmobLabels.js', 'leagueDisplay.js'].sort());
  const c = lecture('pret');
  const d = dit(c);
  assert.deepEqual(d.enTete, { eyebrow: 'À blanc · pas encore un marché', titre: 'Cartons attendus', sousTitre: 'Calculés depuis le magasin FotMob : ce que chaque équipe prend et fait prendre, l’arbitre et le championnat. Ils n’entrent dans aucun pronostic, aucune value et aucun pari conseillé.' });
  // L'arbitre désigné (z connu) : le même bras, × e^(β·z), sa dispersion.
  const z = serveur().arbitres.connu.ligne.indice;
  const m = Math.exp(c.parametres.beta * z);
  assert.ok(Math.abs(d.attendus.total - c.sansArbitre.total * m) < 1e-12 && d.attendus.avecArbitre && d.attendus.invKTotal === c.parametres.avecArbitre.invKTotal);
  assert.equal(d.barres.group.rows[0].label, `Cartons attendus · ${d.attendus.total.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} au total`);
  assert.equal(espaces(d.modele.banc), 'Effet mesuré au banc : sur 46 995 matchs de 2023 à 2026, ce calcul se trompe moins que la moyenne du championnat (0,37 % d’erreur en moins, fourchette 0,31 à 0,43 %, en tenant compte des 8 essais faits ; les probabilités des lignes bougent jusqu’à 3,6 points en moyenne).');
  assert.deepEqual(textes(ligne(d, 'equipes')), ['Club 6001 prend 2,1 cartons par match et en fait prendre 1,7 à ses adversaires, sur ses 20 derniers matchs relevés ; Club 6002 : 2,8 et 1,6 (20 matchs).']);
  assert.deepEqual(textes(ligne(d, 'championnat')), ['Ligue Test : 1,8 cartons par équipe à domicile, 2,4 à l’extérieur, sur ses 297 matchs relevés des 365 derniers jours.']);
  assert.deepEqual(textes(ligne(d, 'arbitre')), ['Clément Arbitre (France) : ses 54 matchs relevés au magasin ont eu 6 % de cartons de plus que ce que prenaient d’habitude les équipes : la sévérité de l’arbitre et le genre de matchs qu’on lui confie, que le banc ne sépare pas. Sur ce match : +0,2 carton attendu. Ses moyennes sont dans « Contexte du match ».']);
  assert.deepEqual(ligne(d, 'arbitre').mentions, ['Les moyennes que FotMob affiche ne sont pas reprises : tous ses matchs relevés au magasin.']);
  assert.equal(espaces(ligne(d, 'arbitre').banc), 'Effet mesuré au banc : sur 39 216 matchs de 2023 à 2026, le calcul avec l’arbitre se trompe moins que le même calcul sans l’arbitre (0,34 % d’erreur en moins, fourchette 0,28 à 0,41 %, en tenant compte des 8 essais faits ; les probabilités des lignes bougent jusqu’à 3,8 points en moyenne).');
  // De moins (le vrai signe moins), un homonyme d'un autre pays.
  const dupont = dit(c, { page: pageFotMob({ referee: { name: 'Jean Dupont', country: 'France' }, arbitre: serveur().arbitres.homonyme }) });
  assert.deepEqual(textes(ligne(dupont, 'arbitre')), [`Jean Dupont (France) : ses 51 matchs relevés au magasin ont eu 2 % de cartons de moins que ce que prenaient d’habitude les équipes : la sévérité de l’arbitre et le genre de matchs qu’on lui confie, que le banc ne sépare pas. Sur ce match : ${MOINS}0,1 carton attendu. Ses moyennes sont dans « Contexte du match ».`]);
  assert.deepEqual(ligne(dupont, 'arbitre').mentions, ['un autre arbitre du même nom (Belgium) n’est pas compté', 'Les moyennes que FotMob affiche ne sont pas reprises : tous ses matchs relevés au magasin.']);
  // Sans match relevé ; pas désigné ; peu de matchs.
  const inconnu = dit(c, { page: pageFotMob({ referee: { name: 'Personne Inconnue', country: 'Spain' }, arbitre: serveur().arbitres.inconnu }) });
  assert.deepEqual(textes(ligne(inconnu, 'arbitre')), ['Personne Inconnue (Spain) : aucun de ses matchs relevés au magasin — sans effet sur les cartons attendus.']);
  assert.equal(inconnu.attendus.avecArbitre, false);
  assert.equal(inconnu.attendus.invKTotal, c.parametres.sansArbitre.invKTotal, 'sans arbitre connu : la dispersion du bras sans arbitre');
  const sans = dit(c, { page: pageFotMob({ referee: null, arbitre: null }) });
  assert.deepEqual(textes(ligne(sans, 'arbitre')), ['Arbitre pas encore désigné chez FotMob : cartons attendus sans lui.']);
  assert.ok(Math.abs(sans.attendus.total - c.sansArbitre.total) < 1e-12);
  const peu = copie(serveur().arbitres.connu);
  peu.ligne.matchs = 12;
  assert.equal(dit(c, { page: pageFotMob({ arbitre: peu }) }).lignes[2].mentions[0], 'ramené vers la moyenne : un arbitre de peu de matchs compte peu');
  // Enjeu : éteint, puis allumé (jamais son chiffre).
  assert.deepEqual(textes(ligne(d, 'enjeu')), ['Enjeu au classement : calculé à blanc chaque nuit, pas encore montré.']);
  assert.deepEqual(textes(ligne(dit(c, { simulation: { affichage: { saisons: 'allume', matchs: 'eteint' }, enjeu: { calculeLe: '2026-07-24T03:00:00.000Z', score: 0.42 } } }), 'enjeu')), ['Enjeu au classement : dans l’encadré « Enjeu » du Résumé. Il n’entre pas dans les cartons attendus : son effet n’est pas mesurable, faute d’historique avant le 27/10/2026.']);
  // Corners et tirs par championnat : réglage commun (la Ligue Test n'est pas dans la note), puis propre.
  assert.deepEqual(textes(ligne(d, 'reglages')), ['À blanc (étape 33) : Ligue Test n’a pas assez de matchs pour un réglage propre — réglage commun : 10,1 corners, 24,5 tirs et 8,4 tirs cadrés attendus au total (le moteur : 10,1 · 24,3 · 8,4). Pas encore dans les pourcentages.']);
  const propre = dit(lecture('reglagePropre'), { match: { ...MATCH, league: 'Allsvenskan - Sweden' } });
  assert.match(textes(ligne(propre, 'reglages'))[0], /^À blanc \(étape 33\) : avec les réglages mesurés pour Allsvenskan, \d+,\d corners, \d+,\d tirs et \d+,\d tirs cadrés attendus au total \(le moteur : 10,1 · 24,3 · 8,4\)\. Pas encore dans les pourcentages\.$/);
  assert.match(espaces(ligne(propre, 'reglages').survol), /^Avantage du terrain : corners 1,09\/0,92 \(moteur 1,10\/0,90\), tirs \d,\d\d\/\d,\d\d \(moteur 1,10\/0,90\), tirs cadrés \d,\d\d\/\d,\d\d \(moteur 1,10\/0,90\) ; dispersion par équipe : corners 0,099 \(moteur 0,105\), /);
  assert.deepEqual(textes(ligne(dit(lecture('sansStats')), 'reglages')), ['À blanc (étape 33) : le moteur n’a pas assez de matchs des deux équipes pour les corners et les tirs de ce match.']);
  // Les lignes du total ; les mentions fixes (convention dite par Pierre ; banc et staff ; déroulé ; prolongations).
  assert.deepEqual(d.total.lignes.map((x) => x.titre), ['Plus de 3,5', 'Plus de 4,5', 'Plus de 5,5']);
  assert.ok(d.total.lignes.every((x) => /^\d{1,2} %$/.test(espaces(x.p))));
  assert.equal(d.total.pied, 'À blanc : ni un pronostic, ni une cote juste. Le moteur ne calcule pas encore les cartons (étape 33, lot 2).');
  assert.deepEqual(d.mentions, [
    'Cartons comptés : jaunes et rouges, temps additionnel compris ; un joueur exclu après deux jaunes compte pour deux cartons (le premier jaune, puis le second qui est le rouge).',
    'Les cartons du banc et des entraîneurs comptent comme les autres : FotMob ne les distingue pas sur les matchs d’avant octobre 2026.',
    'Comptés sur le déroulé du match : depuis octobre 2026, FotMob publie des cartons jaunes à 0 dans treize championnats, alors que le déroulé les donne.',
    'Les matchs prolongés et ceux dont FotMob ne publie pas le déroulé complet ne comptent pas.'
  ]);
  // Peu de matchs relevés pour une équipe ; une équipe sans aucun.
  const peuDeMatchs = copie(c);
  peuDeMatchs.equipes.home.n = 7;
  assert.deepEqual(ligne(dit(peuDeMatchs), 'equipes').mentions, ['peu de matchs relevés : ramené vers la moyenne']);
  assert.deepEqual(textes(ligne(dit(lecture('clubSansMatch'), { match: { ...MATCH, away: 'Club Neuf' } }), 'equipes')), ['Club 6001 prend 2,1 cartons par match et en fait prendre 1,7 à ses adversaires, sur ses 20 derniers matchs relevés.', 'Club Neuf : aucun match relevé au magasin — la moyenne du championnat.']);
});

test('T-E2 les pastilles : « Effet mesuré » + « pas encore un marché » (équipes, arbitre) ou « pas encore dans le pourcentage » (corners, tirs cadrés) pour les SEULES familles utiles ; « Explication seulement » ailleurs (championnat, enjeu « non mesurable », tirs) ; sans note, « pas encore mesuré » ; un démenti repasse en gris avec sa note ambre ; role="note" et aria-label', optionsDuRendu, async () => {
  const c = lecture('pret');
  const d = dit(c);
  assert.deepEqual([ligne(d, 'equipes').pastille.libelle, ligne(d, 'equipes').pastille.sous], ['Effet mesuré', 'pas encore un marché']);
  assert.deepEqual([ligne(d, 'arbitre').pastille.libelle, ligne(d, 'arbitre').pastille.sous], ['Effet mesuré', 'pas encore un marché']);
  assert.deepEqual([ligne(d, 'championnat').pastille.libelle, ligne(d, 'championnat').pastille.vert], ['Explication seulement', false]);
  assert.deepEqual([ligne(d, 'enjeu').pastille.libelle, ligne(d, 'enjeu').pastille.sous], ['Explication seulement', 'non mesurable au banc d’essai']);
  assert.deepEqual(ligne(d, 'reglages').pastilles.map((p) => [p.stat, p.libelle, p.sous]), [['corners', 'Effet mesuré', 'pas encore dans le pourcentage'], ['tirs', 'Explication seulement', null], ['cadres', 'Effet mesuré', 'pas encore dans le pourcentage']]);
  const sansNote = dit(lecture('sansNote'));
  assert.ok(sansNote.lignes.filter((l) => l.pastille).every((l) => !l.pastille.vert));
  assert.equal(ligne(sansNote, 'equipes').pastille.sous, 'pas encore mesuré au banc d’essai');
  assert.equal(sansNote.total.montre, false, 'sans note : aucune ligne du total');
  const dementi = copie(c);
  dementi.statuts.arbitre = { statut: 'dementi', variante: 'cartons-arbitre', dementiLe: '2026-12-01' };
  assert.deepEqual([ligne(dit(dementi), 'arbitre').pastille.libelle, ligne(dit(dementi), 'arbitre').pastille.note], ['Explication seulement', 'démenti sur vos matchs depuis le 01/12/2026']);
  const r = await carte(c);
  const lignes = [...r.html.matchAll(/<li class="cab__ligne" data-ligne="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(lignes, ['equipes', 'championnat', 'arbitre', 'enjeu', 'reglages']);
  const bloc = (cle) => r.html.slice(r.html.indexOf(`data-ligne="${cle}"`), r.html.indexOf('</li>', r.html.indexOf(`data-ligne="${cle}"`)));
  assert.match(bloc('equipes'), /role="note" aria-label="Équipes : effet mesuré, pas encore un marché\. Club 6001 prend/);
  assert.doesNotMatch(bloc('championnat'), VERT, 'le championnat : gris');
  assert.doesNotMatch(bloc('enjeu'), VERT);
  assert.match(bloc('reglages'), /data-stat="tirs"[^>]*>|class="cab__pastille is-explication" data-pastille="explication" data-stat="tirs"/);
  const rd = await carte(dementi);
  const blocArb = rd.html.slice(rd.html.indexOf('data-ligne="arbitre"'), rd.html.indexOf('</li>', rd.html.indexOf('data-ligne="arbitre"')));
  assert.match(blocArb, /data-cartons="dementi"/);
  assert.doesNotMatch(blocArb.split('data-cartons="banc"')[0], /cab__pastille is-mesure/, 'un démenti : plus de vert sur la ligne');
});

test('T-E3 la provenance de chaque ligne : magasin FotMob (calculé, l’heure de la nuit, la base), page FotMob du match (relevé), banc d’essai de l’étape 33 (un jour sans heure, jamais ambre), la simulation pour l’enjeu allumé ; l’ambre au-delà de 24 h', optionsDuRendu, async () => {
  const c = lecture('pret');
  const d = dit(c);
  assert.deepEqual(ligne(d, 'equipes').provenances, [{ source: 'magasin FotMob (déroulés des matchs déjà joués)', releveLe: c.calculeLe, action: 'calculé', quand: 'calculé le 24/07 à 12:00', fichier: 'la base du magasin (match-stats.db)' }].map((p) => ({ ...p, quand: ligne(d, 'equipes').provenances[0].quand })));
  assert.match(ligne(d, 'equipes').provenances[0].quand, /^calculé le 24\/07 à 12/);
  assert.deepEqual(ligne(d, 'arbitre').provenances.map((p) => [p.source, p.action]), [['FotMob, page du match', 'relevé'], ['magasin FotMob (déroulés des matchs déjà joués)', 'calculé']]);
  assert.deepEqual(ligne(d, 'reglages').provenances, [{ source: 'banc d’essai de l’étape 33 (magasin 2023-2026)', releveLe: '2026-11-02', action: 'calculé', jourSeul: '02/11/2026', vieuxApresHeures: null }]);
  assert.deepEqual(ligne(d, 'enjeu').provenances, []);
  const allume = dit(c, { simulation: { affichage: { saisons: 'allume', matchs: 'eteint' }, enjeu: { calculeLe: '2026-07-24T03:00:00.000Z' } } });
  assert.deepEqual(ligne(allume, 'enjeu').provenances.map((p) => p.source), ['Simulation CôteMaster, classement FotMob']);
  const frais = await carte(c, { heure: '2026-07-24T18:00:00.000Z' });
  assert.match(frais.texte, /magasin FotMob \(déroulés des matchs déjà joués\) calculé le 24\/07 à 12/);
  assert.match(frais.texte, /banc d’essai de l’étape 33 \(magasin 2023-2026\) calculé le 02\/11\/2026/);
  assert.doesNotMatch(frais.html, /class="prov is-ancien/);
  const vieux = await carte(c, { heure: '2026-07-26T18:00:00.000Z' });
  assert.match(vieux.html, /class="prov is-ancien prov--ligne"[^>]*title="[^"]*magasin FotMob/);
  assert.ok((vieux.html.match(/is-ancien/g) ?? []).length >= 3, 'les lignes du magasin passent à l’ambre au-delà de 24 h');
  const banc = vieux.html.slice(vieux.html.indexOf('data-ligne="reglages"'));
  assert.doesNotMatch(banc.slice(0, banc.indexOf('</li>')), /is-ancien/, 'le banc : jamais ambre');
  rendu.horloge.liveNow.value = Date.parse('2026-07-24T18:00:00.000Z');
});

test('T-E4 les états vides, dits en mots (jamais « 0 », jamais le silence) : pas encore calculé, clubs non reconnus (nommés), compétition sans cartons, illisible, l’analyse en panne, un serveur d’avant l’étape 33, la lecture en cours ; TOUJOURS les cinq lignes et les quatre mentions', optionsDuRendu, async () => {
  const cas = [
    [lecture('avant'), 'pas-encore-calcule', 'Pas encore calculé : la prochaine passe de nuit le fera.'],
    [lecture('port'), 'clubs-inconnus', 'Cartons attendus indisponibles : Port n’est pas reconnu par son identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent).'],
    [lecture('lesDeuxInconnus'), 'clubs-inconnus', 'Cartons attendus indisponibles : Port et Portsmouth ne sont pas reconnus par leur identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent).'],
    [lecture('sansCartons'), 'competition-sans-cartons', 'Liga Buts : moins de 30 matchs aux cartons relevés dans les 365 derniers jours (FotMob n’y publie pas le déroulé complet) — pas de cartons attendus.'],
    [lecture('illisible'), 'illisible', 'Cartons attendus illisibles : la base n’a pas répondu. Les autres cartes ne sont pas touchées.']
  ];
  for (const [c, cle, texte] of cas) {
    const d = dit(c, { match: { ...MATCH, home: c.clubs.home.nom ?? MATCH.home, away: c.clubs.away.nom ?? MATCH.away, league: c.ligue?.league ?? MATCH.league } });
    assert.deepEqual([d.etat.cle, d.etat.texte], [cle, texte]);
    assert.equal(d.lignes.length, 5);
    assert.ok(d.lignes.every((l) => l.phrases.length && l.phrases.every((p) => typeof p.texte === 'string' && p.texte.length > 10)), `${cle} : chaque ligne dit sa raison`);
    assert.equal(d.barres, null);
    assert.equal(d.total.montre, false);
    assert.equal(d.mentions.length, 4);
    const r = await carte(c, { match: { ...MATCH, home: c.clubs.home.nom ?? MATCH.home, away: c.clubs.away.nom ?? MATCH.away } });
    assert.match(r.html, new RegExp(`data-etat="${cle}"`));
    assert.equal((r.html.match(/class="cab__ligne"/g) ?? []).length, 5);
    assert.ok(espaces(r.texte).includes(texte), `${cle} rendu`);
  }
  assert.equal(dit(undefined).etat.cle, 'serveur-a-relancer');
  assert.equal(dit(lecture('pret'), { analyse: { loading: false, error: 'boum', result: null } }).etat.cle, 'analyse-en-echec');
  assert.equal(dit(lecture('pret'), { analyse: { loading: true, error: null, result: null } }).etat.cle, 'chargement');
  assert.equal(dit(lecture('sansCartons')).lignes[1].phrases[0].texte, 'Liga Buts : moins de 30 matchs aux cartons relevés dans les 365 derniers jours — pas de moyenne.');
  const r = await carte(lecture('pret'), { page: { loading: true, error: null, data: null } });
  assert.match(r.texte, /Lecture de la page FotMob du match…/);
});

test('T-E5 une seule place : aucune famille « Cartons » dans MarketPicksBoard ; aucun pourcentage à blanc des corners ni des tirs ; la carte du moteur « Corners et tirs attendus » inchangée, la carte des cartons juste après, dans l’onglet Statistiques ; ni les moyennes brutes de l’arbitre ni le chiffre de l’enjeu dans la carte', optionsDuRendu, async () => {
  const board = lireUi('components', 'analysis', 'MarketPicksBoard.vue');
  const familles = /const FAMILLES = \[([\s\S]*?)\];/.exec(board)[1];
  assert.deepEqual([...familles.matchAll(/cle: '(\w+)'/g)].map((m) => m[1]), ['buts', 'corners', 'tirs', 'cadres']);
  const vue = lireUi('views', 'UpcomingMatchView.vue');
  const stats = vue.slice(vue.indexOf("<template v-else-if=\"tab === 'stats'\">"), vue.indexOf("<template v-else-if=\"tab === 'form'\">"));
  const moteur = stats.slice(stats.indexOf('<AppCard'), stats.indexOf('</AppCard>'));
  assert.match(moteur, /title="Corners et tirs attendus"/);
  assert.doesNotMatch(moteur, /blanc|cartons|Cartons/, 'la carte du moteur : aucune ligne à blanc');
  assert.ok(stats.indexOf('<CartonsABlancCard') > stats.indexOf('title="Corners et tirs attendus"') && stats.indexOf('<CartonsABlancCard') < stats.indexOf('Moyennes par match'), 'juste après la carte du moteur');
  assert.equal((vue.match(/<CartonsABlancCard\b/g) ?? []).length, 1, 'une seule place');
  const r = await carte(lecture('pret'), { simulation: { affichage: { saisons: 'allume', matchs: 'eteint' }, enjeu: { calculeLe: '2026-07-24T03:00:00.000Z', score: 0.4242 } } });
  const reglages = r.html.slice(r.html.indexOf('data-ligne="reglages"'), r.html.indexOf('</li>', r.html.indexOf('data-ligne="reglages"')));
  assert.doesNotMatch(reglages.replace(/<[^>]+>/g, ' '), /\d\s?%/, 'aucun pourcentage à blanc pour les corners et les tirs');
  assert.doesNotMatch(r.texte, /9,9|jaunes par match|yellowCards|42 %|0,42/, 'ni les moyennes FotMob de l’arbitre, ni le chiffre de l’enjeu');
});

test('T-E6 la loi de l’écran = celle du serveur à 1e-12 (binomiale négative, binomiale sous-dispersée, Poisson) ; les lignes du total seulement si les cartons des équipes sont utiles au banc', optionsDuRendu, async () => {
  for (const mu of [0.8, 2.3, 4.06, 5.7, 9.2]) {
    for (const invK of [0.015181, 0.01866, 0, -0.05, -0.034163, 0.3]) {
      for (const l of [0.5, 2.5, 3.5, 4.5, 7.5]) {
        const a = U.probabilitePlusDe(mu, invK, l);
        const b = F.probabilitePlusDe(mu, invK, l);
        assert.ok(Math.abs(a - b) < 1e-12, `μ ${mu}, 1/k ${invK}, ligne ${l} : ${a} ≠ ${b}`);
      }
    }
  }
  const c = lecture('pret');
  const d = dit(c);
  for (const x of d.total.lignes) assert.ok(Math.abs(x.plus - F.probabilitePlusDe(d.attendus.total, d.attendus.invKTotal, x.ligne)) < 1e-12);
  const r = await carte(c);
  const t = tableauDe(r.html, 'total-des-cartons');
  assert.deepEqual(entetes(t), ['Total des cartons', 'Plus de 3,5', 'Plus de 4,5', 'Plus de 5,5']);
  const nonUtile = copie(c);
  nonUtile.statuts.equipes = { statut: 'explication', variante: 'cartons-equipes' };
  assert.equal(dit(nonUtile).total.montre, false);
  assert.equal(tableauDe((await carte(nonUtile)).html, 'total-des-cartons'), null, 'pas utile au banc : aucune ligne du total');
});

test('T-E7 le tableau « Ce que dit le banc d’essai » : TOUJOURS huit lignes, leurs colonnes, Σ des matchs distincts (au moins le plus grand compte, jamais une somme), ⌀ de l’écart des variantes mesurées, « non mesurable » pour l’enjeu ; le tableau des réglages par championnat (Σ, ⌀)', optionsDuRendu, async () => {
  const r = await carte(lecture('pret'));
  const t = tableauDe(r.html, 'banc-des-cartons');
  assert.deepEqual(entetes(t), ['Ce qui a été comparé', 'Matchs jugés', 'Erreur en moins (fourchette)', 'Annoncé face au réalisé (avant → après)', 'Verdict']);
  const lignes = corps(t);
  assert.equal(lignes.length, 8);
  assert.deepEqual(lignes.map((l) => /data-ligne="([\w-]+)"/.exec(l)[1]), ['cartons-equipes', 'cartons-arbitre', 'cartons-placebo', 'corners-championnat', 'tirs-championnat', 'cadres-championnat', 'championnat-placebo', 'enjeu']);
  assert.match(espaces(lignes[0]), /46 995[\s\S]*0,37 % \(0,31 % à 0,43 %\)[\s\S]*0,16 → 0,10 pt[\s\S]*Effet mesuré/);
  assert.match(espaces(lignes[3]), /41 696[\s\S]*0,013 % \(0,004 % à 0,021 %\)/);
  assert.match(espaces(lignes[6]), /0,000 % \(0,002 % à 0,002 %\)|0,000 % \(\S*0,002 % à 0,002 %\)/);
  assert.match(lignes[7], /Non mesurable au banc d’essai/);
  const p = pied(t)[0];
  assert.match(espaces(p), /Σ au moins 46 995 matchs distincts/);
  assert.match(espaces(p), /⌀ 0,09 pt/);
  assert.match(espaces(r.texte), /Banc d’essai : magasin de juillet 2023 à septembre 2026, deux moitiés croisées \(chacune jugée avec ce qui a été appris sur l’autre\), 8 essais comptés, seuil sévère \(calcul du 02\/11\/2026\)\./);
  const c2 = tableauDe(r.html, 'reglages-par-championnat');
  assert.equal(corps(c2).length, R.reglagesPourLEcran(CARTONS_AU_BANC).championnats.length);
  assert.ok(corps(c2).length >= 40);
  const somme = R.reglagesPourLEcran(CARTONS_AU_BANC).championnats.reduce((s, x) => s + x.n, 0);
  assert.match(espaces(pied(c2)[0]), new RegExp(`Σ ${somme.toLocaleString('fr-FR').replace(/[  ]/g, ' ')} matchs`));
  assert.match(espaces(pied(c2)[0]), /⌀ corners 1,\d\d \/ 0,\d\d · tirs 1,\d\d \/ 0,\d\d · tirs cadrés 1,\d\d \/ 0,\d\d/);
  // Sans note : huit lignes quand même, « pas encore mesuré ».
  const vide = U.tableauDuBanc(null);
  assert.equal(vide.lignes.length, 8);
  assert.ok(vide.lignes.slice(0, 7).every((l) => l.verdict === 'Pas encore mesuré'));
});

test('T-E8 aucune requête de plus à l’ouverture de la page : la carte rendue n’appelle rien ; elle et ses règles n’importent aucun service ; la page lui passe le bloc de l’analyse et la page FotMob déjà chargés ; le septième contrôle anti-fuite dit en mots ; DESIGN.md (« Depuis l’étape 33 ») ; la feuille de route (33 en cours, 32 remise à jour)', optionsDuRendu, async () => {
  const r = await carte(lecture('pret'));
  assert.deepEqual(r.appels, [], 'aucune requête');
  const vueCarte = lireUi('components', 'analysis', 'CartonsABlancCard.vue');
  assert.doesNotMatch(vueCarte, /services\/|Api\b|fetch\(|axios/);
  assert.doesNotMatch(lireUi('utils', 'cartonsABlanc.js'), /fetch\(|services\//);
  const vue = lireUi('views', 'UpcomingMatchView.vue');
  assert.match(vue, /<CartonsABlancCard\n {10}id="upcoming-cartons"\n {10}class="upcoming__block"\n {10}:cartons="analyse\.result\?\.cartons"\n {10}:analyse="analyse"\n {10}:page="page"\n {10}:simulation="simulationDuMatch"\n {10}:match="match"\n {8}\/>/);
  const A = await imp(path.join(UI, 'src', 'utils', 'controlesAntiFuite.js'));
  // Étape 34 (lot 1b, 03/11/2026) : le contrôle des chiffres des joueurs vient après celui des cartons.
  assert.deepEqual(A.CONTROLES_ANTI_FUITE.find((c) => c.cle === 'cartonsEtCorners'), { cle: 'cartonsEtCorners', nom: 'Cartons attendus (équipes et arbitre au jour du match)' });
  assert.deepEqual(
    A.controlesAntiFuiteDits({ cartonsEtCorners: { ecarts: [{ matchKey: 'm', J: '2026-10-12', club: 8456, colonne: 'fenetre', texte: 'Lens avant le 12/10/2026 : fenêtre des cartons de 20 match(s) pour la passe, 19 pour le second chemin' }], total: 1, lignes: 20, updatedAt: '2026-11-03T02:10:00.000Z' } }).map((x) => x.texte),
    ['Cartons attendus (équipes et arbitre au jour du match) : 1 écart sur 20 lignes recalculées (contrôle du 03/11/2026 à 03:10) — par exemple Lens avant le 12/10/2026 : fenêtre des cartons de 20 match(s) pour la passe, 19 pour le second chemin.']
  );
  const design = fs.readFileSync(path.join(UI, 'DESIGN.md'), 'utf8');
  assert.match(design, /Depuis l'étape 33 du plan \(lot 1, 03\/11\/2026\) : \*\*les cartons attendus, à blanc\*\*/);
  assert.match(design, /`components\/analysis\/CartonsABlancCard\.vue`[\s\S]{0,200}sur-titre « À blanc · pas encore un marché »/);
  const h33 = HISTORIQUE.filter((h) => h.etape === '33');
  assert.equal(h33.length, 1);
  assert.match(h33[0].partielle, /^lot 1 livré : cartons attendus et réglages par championnat calculés à blanc, mesurés au banc ; lot 2 au verdict de l’étape 27 et avec votre accord/);
  assert.match(h33[0].change, /un joueur exclu après deux jaunes compte pour deux cartons/);
  const h32 = HISTORIQUE.filter((h) => h.etape === '32').at(-1);
  assert.match(h32.partielle, /depuis le 02\/11, la preuve sur vos matchs/);
  assert.doesNotMatch(h32.partielle, /restent la preuve/);
});

test('T-E9 le libellé de compétition de l’analyse retrouve la ligne de la note par championnat (« propre ») ; un libellé inconnu donne le réglage commun, jamais une erreur', () => {
  const note = CARTONS_AU_BANC.final.parChampionnat;
  for (const league of Object.keys(note.corners.championnats).slice(0, 12)) {
    const r = R.reglageDuChampionnat(CARTONS_AU_BANC, 'corners', league);
    const c = note.corners.championnats[league];
    assert.deepEqual([r.dom, r.ext, r.propre], c.propre ? [c.dom, c.ext, true] : [note.corners.commun.dom, note.corners.commun.ext, false], league);
  }
  const p = lecture('reglagePropre').statsParChampionnat;
  assert.equal(p.league, 'Allsvenskan - Sweden');
  assert.deepEqual([p.stats.corners.reglage.dom, p.stats.corners.reglage.propre], [note.corners.championnats['Allsvenskan - Sweden'].dom, true]);
  const inconnu = lecture('labelInconnu').statsParChampionnat;
  assert.deepEqual([inconnu.stats.corners.reglage.dom, inconnu.stats.corners.reglage.propre, inconnu.stats.tirs.reglage.propre], [note.corners.commun.dom, false, false]);
  assert.equal(R.reglageDuChampionnat(null, 'corners', 'X'), null);
  // L'attendu à blanc = les neutres du moteur × le réglage (jamais les attendus du moteur, déjà multipliés par 1,10 / 0,90).
  const s = lecture('pret').statsParChampionnat.stats.corners;
  assert.ok(Math.abs(s.aBlanc.home - s.reglage.dom * (5.6 + 5.1) / 2) < 1e-12 && Math.abs(s.aBlanc.away - s.reglage.ext * (4.9 + 4.4) / 2) < 1e-12);
});

test('T-E10 les clubs par identifiant FotMob (scoreInputs, la conversion unique numeroDuClub) : « Port » sans identifiant donne « clubs inconnus », jamais les cartons d’un autre club ; la lecture ne prend jamais un nom', () => {
  const s = serveur();
  assert.equal(s.lectures.port.etat, 'clubs-inconnus');
  assert.equal(s.lectures.port.equipes, null);
  assert.equal(s.lectures.port.__mesure.ordres.length, 0, 'aucune lecture de la base sans identifiant');
  const code = lireSrc('data', 'cartons', 'cartonsRead.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(code, /numeroDuClub\(match\?\.scoreInputs\?\.home\?\.teamId \?\? match\?\.homeId \?\? null\)/);
  assert.doesNotMatch(code, /home_name|away_name|teamNamesEqual|findTeams|clubDuMagasin|nameTokens/, 'jamais un rapprochement par le nom');
});
