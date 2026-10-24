/**
 * Les deux routes de lecture ajoutées pour « L'IA À L'ÉCRAN » (étape 45 du plan, 24/10/2026) :
 *   node --test test/bulletinPage.test.mjs        (depuis server/)
 *
 *   GET /api/match-ai-analysis/dossiers/resume   l'INDEX des dossiers de la mémoire de l'IA (la page « Bulletin ») : les championnats,
 *                                                les équipes, toutes les leçons gardées avec leur jour, leur match d'origine, leur portée
 *   GET /api/match-stats/:matchId/deroule        le déroulé d'un match joué, lu par la fonction de l'étape 43 (les moments clés)
 *
 * Les réponses sont celles du VRAI serveur : test/aides/script-bulletin-page.mjs les produit dans une copie isolée de la base d'essai
 * (heure figée au 05/10/2026, réseau coupé, aucun appel à Claude). Les attentes sont RECOMPTÉES ICI, à la main, sur le fichier
 * d'entrée (l'extrait réel des dossiers) ou sur les événements stockés dans la base — jamais avec la fonction qu'on teste.
 *
 *  1. L'index des dossiers : pas encore calculé, calculé (recompté), lecture seule, illisible, d'une autre forme, plafond.
 *  2. Le déroulé : chaque fait recompté sur les événements stockés, les pièges (penalty, but contre son camp, deuxième jaune, rouge),
 *     un match sans événements, un match pas joué, un inconnu, la lecture d'avant l'étape 43, lecture seule.
 *  3. L'hygiène : routes en lecture seule, aucun fichier du moteur touché.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';

const imp = (chemin) => import(pathToFileURL(chemin).href);
const FIXTURE = JSON.parse(fs.readFileSync(path.join(SERVEUR, 'test', 'fixtures', 'dossiers-etape-45.json'), 'utf8'));

/** Exécute une phase de script-bulletin-page.mjs dans une copie neuve et rend son JSON. */
function lancer(phase) {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-bulletin-page.mjs'), { args: [phase], timeout: 300_000, env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' } });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}

let resume;
let deroule;
before(() => {
  resume = lancer('resume');
  deroule = lancer('deroule');
});

// ============================================================================================ 1. l'index des dossiers

test('index : rien d’écrit encore — 200, la même forme, des listes vides, et la route ne crée aucun fichier', () => {
  const a = resume.reponses.absent;
  assert.equal(a.etat, 'absent');
  assert.equal(a.calculeLe, null);
  assert.deepEqual(a.championnats, []);
  assert.deepEqual(a.equipes, []);
  assert.deepEqual(a.lecons.confirmees, []);
  assert.deepEqual(a.lecons.retirees, []);
  assert.deepEqual(a.totaux, { equipes: 0, championnats: 0, confirmees: 0, retirees: 0, confirmeesEnTout: 0, retireesEnTout: 0, enAttente: 0 });
  assert.equal(a.fichier, 'data/runtime/ai-dossiers.json');
  assert.ok(a.regles?.equipe && a.regles?.championnat, 'les règles des leçons sont dites même sans dossier');
  assert.ok(a.provenance && a.etats, 'la provenance et les états des leçons aussi');
  assert.equal(resume.fichierCree, false, 'lire n’écrit rien : le fichier des dossiers n’est pas créé par la route');
});

test('index : l’extrait réel recompté à la main — championnats, équipes, leçons gardées, totaux', () => {
  const c = resume.reponses.calcule;
  assert.equal(resume.codeCalcule, 200);
  assert.equal(c.etat, 'lu');
  assert.equal(c.calculeLe, FIXTURE.calculeLe);
  // Les championnats : un par dossier, par ordre alphabétique, avec le nombre d'équipes recompté sur les clubs.
  const ligues = Object.keys(FIXTURE.championnats).sort((a, b) => a.localeCompare(b, 'fr'));
  assert.deepEqual(c.championnats.map((x) => x.league), ligues);
  for (const x of c.championnats) {
    const clubs = Object.values(FIXTURE.equipes).filter((e) => e.league === x.league);
    assert.equal(x.equipes, clubs.length, `${x.league} : équipes`);
    const l = FIXTURE.championnats[x.league].lecons;
    assert.equal(x.confirmees, l.confirmeesEnTout, `${x.league} : confirmées`);
    assert.equal(x.retirees, l.retireesEnTout, `${x.league} : retirées`);
    assert.equal(x.enAttente, l.enAttente);
  }
  // Les équipes : toutes, par championnat puis par nom, avec leurs leçons.
  assert.equal(c.equipes.length, Object.keys(FIXTURE.equipes).length);
  const attendues = Object.entries(FIXTURE.equipes)
    .map(([id, e]) => ({ id, nom: e.nom, league: e.league }))
    .sort((a, b) => a.league.localeCompare(b.league, 'fr') || a.nom.localeCompare(b.nom, 'fr'));
  assert.deepEqual(c.equipes.map((e) => ({ id: e.id, nom: e.nom, league: e.league })), attendues);
  const saoPaulo = c.equipes.find((e) => e.id === 'fotmob-10277');
  assert.deepEqual([saoPaulo.confirmees, saoPaulo.retirees, saoPaulo.enAttente], [1, 0, 2]);
  const atletico = c.equipes.find((e) => e.id === 'fotmob-10272');
  assert.deepEqual([atletico.confirmees, atletico.retirees], [0, 1]);
  // Les leçons : une ligne par leçon et par portée qui la garde.
  const attendue = { confirmees: [], retirees: [] };
  for (const [id, e] of Object.entries(FIXTURE.equipes)) {
    for (const g of ['confirmees', 'retirees']) for (const l of e.lecons[g]) attendue[g].push(`${l.id}@${id}`);
  }
  for (const [ligue, e] of Object.entries(FIXTURE.championnats)) {
    for (const g of ['confirmees', 'retirees']) for (const l of e.lecons[g]) attendue[g].push(`${l.id}@ligue:${ligue}`);
  }
  for (const g of ['confirmees', 'retirees']) {
    assert.deepEqual(c.lecons[g].map((l) => l.cle).sort(), attendue[g].sort(), `leçons ${g}`);
  }
  assert.deepEqual(c.totaux, { equipes: 7, championnats: 3, confirmees: 8, retirees: 21, confirmeesEnTout: 8, retireesEnTout: 55, enAttente: 135 });
  assert.equal(c.totaux.confirmees, c.lecons.confirmees.length);
  assert.equal(c.totaux.retirees, c.lecons.retirees.length);
  // Les plus récentes d'abord (confirmation, puis jour du match d'origine).
  const jours = c.lecons.confirmees.map((l) => `${l.confirmeeLe}|${l.date}`);
  assert.deepEqual(jours, [...jours].sort().reverse());
  // La portée dit qui garde la leçon : le club (identifiant FotMob) ou le championnat.
  const sp = c.lecons.confirmees.find((l) => l.portee.id === 'fotmob-10277');
  assert.deepEqual(sp.portee, { genre: 'equipe', id: 'fotmob-10277', nom: 'São Paulo', league: 'Brazil Série A' });
  assert.equal(sp.match.home, 'São Paulo');
  assert.equal(sp.match.homeId, 'fotmob-10277');
  assert.ok(sp.texte && sp.date === '2026-10-02' && sp.confirmeeLe === '2026-10-22');
  const ch = c.lecons.confirmees.find((l) => l.portee.genre === 'championnat' && l.portee.league === 'Championship');
  assert.deepEqual(ch.portee, { genre: 'championnat', id: null, nom: 'Championship', league: 'Championship' });
});

test('index : la preuve en mots de chaque leçon est celle des routes d’une équipe et d’un championnat — une seule façon de la dire', () => {
  const p = resume.reponses.preuves;
  assert.equal(p.length, 29, '8 confirmées + 21 retirées');
  for (const x of p) {
    assert.ok(x.preuveDite && x.preuveDite.length > 20, x.cle);
    assert.equal(x.preuveDite, x.preuveRoute, `${x.genre} ${x.cle}`);
  }
});

test('index : le plafond de lignes — `max` coupe les listes, les totaux disent tout (fonction pure, sur l’extrait réel)', async () => {
  const { resumeDesDossiers, LECONS_PAR_LISTE_MAX } = await imp(path.join(SERVEUR, 'src', 'core', 'ai', 'resumeDesDossiers.js'));
  assert.equal(LECONS_PAR_LISTE_MAX, 80);
  const r = resumeDesDossiers(FIXTURE, { max: 3 });
  assert.equal(r.lecons.confirmees.length, 3);
  assert.equal(r.lecons.retirees.length, 3);
  assert.equal(r.lecons.max, 3);
  assert.equal(r.totaux.confirmees, 8, 'le total ne dépend pas du plafond');
  assert.equal(r.totaux.retirees, 21);
  // Les trois premières sont les plus récentes, dans le même ordre que sans plafond.
  const complet = resumeDesDossiers(FIXTURE);
  assert.deepEqual(r.lecons.confirmees.map((l) => l.cle), complet.lecons.confirmees.slice(0, 3).map((l) => l.cle));
  // Des données absentes ou de travers : jamais une exception, des listes vides.
  for (const entree of [null, undefined, {}, { equipes: [], championnats: 'x' }]) {
    const v = resumeDesDossiers(entree);
    assert.deepEqual([v.championnats, v.equipes, v.lecons.confirmees, v.lecons.retirees], [[], [], [], []]);
    assert.equal(v.totaux.confirmees, 0);
  }
});

test('index : lecture seule — le fichier des dossiers n’a pas bougé d’un octet, la base n’a reçu aucune écriture, POST est refusé', () => {
  assert.equal(resume.lectureSeule.sha1Avant, resume.lectureSeule.sha1Apres);
  assert.equal(resume.lectureSeule.ecrituresBase, 0);
  assert.equal(resume.post.code, 404, 'aucune route n’écrit un dossier');
});

test('index : un fichier illisible répond 503 et n’est JAMAIS pris pour vide ni réécrit ; une autre forme est lue pour l’écran et dite', () => {
  assert.equal(resume.codeIllisible, 503);
  assert.equal(resume.reponses.illisible.etat, 'illisible');
  assert.match(resume.reponses.illisible.error, /illisibles pour l’instant/);
  assert.equal(resume.intactApresIllisible, true, 'le fichier cassé est resté tel quel');
  const a = resume.reponses.autreVersion;
  assert.equal(a.etat, 'autreVersion');
  assert.equal(a.totaux.equipes, 7, 'ses chiffres restent lus, l’écran dit que le calcul est d’une autre forme');
});

// ============================================================================================ 2. le déroulé

const R = deroule.reponses;
const MATCHS_REELS = ['penalty', 'contreSonCamp', 'rougeDirect', 'deuxiemeJaune', 'ordinaire'];
const penaltyMarque = (e) => e.type === 'goal' && !e.ownGoal && (e.penalty === true || /^penalty$/i.test(e.detail ?? ''));

test('déroulé : chaque but, penalty, but contre son camp et expulsion est recompté sur les événements stockés', () => {
  for (const nom of MATCHS_REELS) {
    const r = R[nom];
    assert.equal(r.code, 200, nom);
    const ev = r.stocke.events;
    const d = r.corps.deroule;
    assert.equal(r.corps.jouee, true, nom);
    assert.equal(d.disponible, true, nom);
    const faits = d.faits;
    const butsStockes = ev.filter((e) => e.type === 'goal');
    assert.equal(faits.filter((f) => f.genre === 'but').length, butsStockes.length, `${nom} : buts`);
    assert.equal(faits.filter((f) => f.genre === 'but' && f.penalty).length, butsStockes.filter(penaltyMarque).length, `${nom} : penalties marqués`);
    assert.equal(faits.filter((f) => f.genre === 'but' && f.csc).length, butsStockes.filter((e) => e.ownGoal).length, `${nom} : buts contre leur camp`);
    const expulses = ev.filter((e) => e.type === 'card' && /red/.test(e.card ?? '') && e.note !== 'not_on_pitch');
    assert.equal(faits.filter((f) => f.genre === 'carton' && f.expulsion).length, expulses.length, `${nom} : expulsions`);
    assert.equal(faits.filter((f) => f.genre === 'carton' && f.carton === 'deuxieme-jaune').length, ev.filter((e) => e.type === 'card' && e.card === 'yellowred').length, `${nom} : deuxièmes jaunes`);
    assert.equal(faits.filter((f) => f.genre === 'remplacement').length, ev.filter((e) => e.type === 'substitution').length, `${nom} : remplacements`);
    // Dans l'ordre du jeu.
    const minutes = faits.map((f) => (f.minute ?? 0) * 100 + (f.plus ?? 0));
    assert.deepEqual(minutes, [...minutes].sort((a, b) => a - b), `${nom} : ordre`);
    // Le score après le dernier but est le score final (le déroulé retrouve le score).
    assert.equal(d.coherent, true, nom);
    const dernier = faits.filter((f) => f.genre === 'but').at(-1);
    if (dernier) assert.deepEqual(dernier.apres, { home: r.stocke.hg, away: r.stocke.ag }, `${nom} : score après le dernier but`);
    assert.deepEqual(d.score, { home: r.stocke.hg, away: r.stocke.ag });
    // Le match, ses clubs et leurs identifiants.
    assert.ok(r.corps.home.name && r.corps.away.name && r.corps.league && r.corps.date, nom);
  }
  // Les cas voulus existent bien dans l'échantillon (sinon le test ne prouverait rien).
  assert.ok(R.penalty.corps.deroule.faits.some((f) => f.genre === 'but' && f.penalty));
  assert.ok(R.contreSonCamp.corps.deroule.faits.some((f) => f.genre === 'but' && f.csc));
  assert.ok(R.rougeDirect.corps.deroule.faits.some((f) => f.genre === 'carton' && f.carton === 'rouge' && f.expulsion));
  assert.ok(R.deuxiemeJaune.corps.deroule.faits.some((f) => f.genre === 'carton' && f.carton === 'deuxieme-jaune' && f.expulsion));
});

test('déroulé : le but contre son camp est écrit pour l’équipe à qui il compte, et une expulsion laisse l’équipe à dix', () => {
  const csc = R.contreSonCamp;
  const stocke = csc.stocke.events.filter((e) => e.type === 'goal' && e.ownGoal);
  const faits = csc.corps.deroule.faits.filter((f) => f.genre === 'but' && f.csc);
  assert.equal(faits.length, stocke.length);
  stocke.forEach((e, i) => {
    assert.equal(faits[i].camp, e.side, 'le camp du fait est le camp CRÉDITÉ du but (celui que FotMob range dans « side »)');
    assert.equal(faits[i].joueur, e.player);
  });
  // Le score progresse du camp crédité : recomptage but par but.
  const score = { home: 0, away: 0 };
  for (const f of csc.corps.deroule.faits.filter((x) => x.genre === 'but')) {
    score[f.camp]++;
    assert.deepEqual(f.apres, { ...score });
  }
  // Après chaque expulsion, l'équipe a un joueur de moins (onze moins le nombre d'expulsés avant, elle comprise).
  for (const nom of ['rougeDirect', 'deuxiemeJaune']) {
    const reste = { home: 11, away: 11 };
    for (const f of R[nom].corps.deroule.faits.filter((x) => x.genre === 'carton' && x.expulsion)) {
      reste[f.camp]--;
      assert.equal(f.reste, reste[f.camp], `${nom} : ${f.joueur}`);
    }
  }
});

test('déroulé : les faits sont ceux que reçoit l’IA — la même fonction (étape 43) sur les mêmes événements donne les mêmes faits', async () => {
  const { lireDeroule } = await imp(path.join(SERVEUR, 'src', 'core', 'ai', 'derouleDuMatch.js'));
  for (const nom of [...MATCHS_REELS, 'recent', 'ancien']) {
    const r = R[nom];
    const direct = lireDeroule({ events: r.stocke.events, shotmap: r.stocke.shotmap, meta: r.stocke.meta, score: { home: r.stocke.hg, away: r.stocke.ag } });
    assert.deepEqual(r.corps.deroule, JSON.parse(JSON.stringify(direct)), nom);
  }
});

test('déroulé : un match de lecture récente — penalty manqué, blessé, deuxième jaune, but contre son camp ; les langues du texte minute par minute marquent la lecture', () => {
  const r = R.recent.corps;
  assert.equal(r.lectureRecente, true);
  const faits = r.deroule.faits;
  assert.deepEqual(
    faits.map((f) => `${f.minute}:${f.camp}:${f.genre}`),
    ['12:home:but', '30:away:penalty-manque', '44:away:carton', '58:home:but', '62:away:remplacement', '70:home:carton', '88:away:but']
  );
  assert.equal(faits[1].joueur, 'Tireur Manqué');
  assert.equal(faits[2].carton, 'rouge');
  assert.equal(faits[2].reste, 10);
  assert.equal(faits[3].penalty, true);
  assert.equal(faits[4].blesse, true);
  assert.equal(faits[5].carton, 'deuxieme-jaune');
  assert.equal(faits[6].csc, true);
  // Le score suit les buts crédités : 1-0, 2-0, puis le but contre son camp compte pour l'extérieur (2-1) = le score stocké.
  assert.deepEqual(faits.filter((f) => f.genre === 'but').map((f) => f.apres), [{ home: 1, away: 0 }, { home: 2, away: 0 }, { home: 2, away: 1 }]);
  assert.deepEqual(r.deroule.score, { home: 2, away: 1 });
  assert.equal(r.deroule.coherent, true);
  assert.deepEqual(r.deroule.cartons.away, { jaunes: 0, deuxiemesJaunes: 0, rouges: 1, horsTerrain: 0 });
  assert.deepEqual(r.deroule.cartons.home, { jaunes: 0, deuxiemesJaunes: 1, rouges: 0, horsTerrain: 0 });
});

test('déroulé : un match d’avant l’étape 43 — le penalty manqué se lit dans la carte des tirs (son issue en mots), pas de marque de lecture récente', () => {
  const r = R.ancien.corps;
  assert.equal(r.lectureRecente, false);
  const manque = r.deroule.faits.filter((f) => f.genre === 'penalty-manque');
  assert.equal(manque.length, 1);
  assert.deepEqual([manque[0].minute, manque[0].camp, manque[0].joueur, manque[0].issue], [55, 'home', 'Tireur Arrêté', 'arrêté par le gardien']);
  assert.equal(r.deroule.faits.filter((f) => f.genre === 'but').length, 1, 'le tir réussi de la carte des tirs n’est pas un but de plus');
});

test('déroulé : sans événements stockés — « non publié », jamais « aucun but » ; un match pas encore joué — pas de score', () => {
  const s = R.sansEvenements;
  assert.equal(s.stocke.events, null);
  assert.equal(s.corps.jouee, true);
  assert.equal(s.corps.deroule.disponible, false);
  assert.deepEqual(s.corps.deroule.faits, []);
  assert.deepEqual(s.corps.deroule.score, { home: s.stocke.hg, away: s.stocke.ag }, 'le score final du magasin est dit, les événements non');
  const p = R.pasJoue;
  assert.equal(p.code, 200);
  assert.equal(p.corps.jouee, false);
  assert.equal(p.corps.deroule.disponible, false);
  assert.equal(p.corps.deroule.score, null);
  assert.equal(p.stocke.hg, null);
});

test('déroulé : un match inconnu répond 404 avec un message, POST est refusé, et rien n’est écrit dans la base', () => {
  assert.equal(deroule.inconnu.code, 404);
  assert.match(deroule.inconnu.corps.error, /Match introuvable/);
  assert.equal(deroule.post.code, 404);
  assert.equal(deroule.ecritures.apres, deroule.ecritures.avant, 'aucune écriture');
  // La route d’un match n’a pas changé : elle ne porte toujours pas le déroulé.
  assert.equal(deroule.entree.code, 200);
  assert.equal(deroule.entree.aDeroule, false);
  assert.ok(deroule.entree.cles.includes('events') && deroule.entree.cles.includes('homeGoals'));
});

test('déroulé : la provenance est dite — le fournisseur réel, la table, le fichier de la base', () => {
  const p = R.penalty.corps.provenance;
  assert.equal(p.source, 'FotMob · événements du match rangés au magasin');
  assert.match(p.table, /matches/);
  assert.match(p.fichier, /match-stats\.db$/);
  assert.ok(!/Odds API|Cotes marché/.test(JSON.stringify(R.penalty.corps)));
});

// ============================================================================================ 3. l'hygiène

test('hygiène : les deux routes lisent seulement — ni écriture, ni appel à Claude, ni réseau ; aucun fichier du moteur touché', async () => {
  const lire = (...c) => fs.readFileSync(path.join(SERVEUR, 'src', ...c), 'utf8');
  const resumeSrc = lire('core', 'ai', 'resumeDesDossiers.js');
  const controleurResume = lire('api', 'controllers', 'aiDossiers.controller.js');
  const controleurDeroule = lire('api', 'controllers', 'derouleMatch.controller.js');
  for (const [nom, src] of [['resumeDesDossiers.js', resumeSrc], ['derouleMatch.controller.js', controleurDeroule]]) {
    assert.doesNotMatch(src, /writeFile|writeJson|appendFile|\.run\(|INSERT|UPDATE |DELETE |callClaudeCode|fetch\(|https?:\/\//, `${nom} : lecture seule`);
  }
  assert.doesNotMatch(controleurResume.slice(controleurResume.indexOf('export function getResume')), /writeFile|ecrireLesDossiers|callClaudeCode|fetch\(/);
  // Le moteur : l'empreinte de son code est celle d'avant l'étape (ces deux routes ne sont pas dans MODULES_DU_MOTEUR).
  const V = await imp(path.join(SERVEUR, 'src', 'core', 'engine', 'engineVersions.js'));
  const modules = V.MODULES_DU_MOTEUR;
  const interdits = [...modules.fichiers, ...modules.dossiers];
  for (const touche of ['core/ai/resumeDesDossiers.js', 'api/controllers/derouleMatch.controller.js', 'api/controllers/aiDossiers.controller.js', 'api/routes/matchStats.routes.js', 'api/routes/matchAiAnalysis.routes.js']) {
    assert.ok(!interdits.some((m) => touche === m || touche.startsWith(`${m}/`)), `${touche} n’est pas un fichier du moteur`);
  }
});
