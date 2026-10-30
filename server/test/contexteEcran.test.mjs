/**
 * Étape 32 du plan — PARTIE D : LA LECTURE ET L'ÉCRAN « CONTEXTE DU MATCH » (conception §5.6 et §6, corrigée par la
 * critique, constats 16, 17, 19 et 20), rendus côté serveur, sans navigateur ni serveur de développement — le patron des
 * tests d'écran des étapes 26 et 28 (`fetch` remplacé : tout appel hors liste refusé et compté ; routeur de l'appli
 * remplacé par un faux ; horloge figée ; cache de Vite dans le dossier d'essais ; rien écrit dans ui/) :
 *   node --test test/contexteEcran.test.mjs        (depuis server/)
 *
 * Les réponses ne sont pas écrites à la main : le VRAI serveur les produit dans une copie isolée — la lecture du
 * contexte (contexteRead.contexteDuMatch) et l'arbitre désigné au magasin (lineupContext.arbitreAuMagasin), sur un
 * MAGASIN FABRIQUÉ et deux nuits de suite (aides/script-contexte-ecran.mjs : aucun résultat réel) ; la page du match
 * reçoit les réponses du vrai serveur (aides/donneesPageMatch.mjs). Seules quelques cases sont posées à la main pour
 * les extrêmes (un nouvel entraîneur, un démenti, un stade inhabituel), sur ces vraies formes.
 *   T-L1 la LECTURE : quelques lectures par clé, aucune écriture, < 25 ms ; « pas encore calculé », « hors fenêtre »,
 *        « clubs inconnus », « illisible » ; le vrai coup d'envoi refait les heures (jamais le midi UTC fictif du
 *        calendrier) ; une fiche gelée lue telle quelle ; l'ORPHELINE d'un match re-daté d'un jour jamais lue (bug 43) ;
 *        les statuts et le banc LUS dans noteDuContexte.js ; le bloc joint à l'analyse par la vraie route ; l'IA ne le
 *        reçoit pas ;
 *   T-L2 l'APERÇU : l'arbitre désigné au magasin (clé « nom|pays », homonymes), l'heure de la lecture FotMob ;
 *   T-E1 chaque phrase (§6.2 corrigé), exacte, sur ces vraies formes ;
 *   T-E2 les pastilles : « Explication seulement » par défaut ; « Effet mesuré » + « pas encore dans le pourcentage » pour
 *        un facteur utile au banc seulement ; jamais de vert ailleurs ; un démenti repasse en gris avec sa note ambre ;
 *   T-E3 la provenance de chaque ligne (§6.4), l'ambre au-delà de 24 h, un jour seul sans heure inventée ;
 *   T-E4 les états vides, dits en mots ; toujours neuf lignes ;
 *   T-E5 une seule place : ni pelouse, ni météo, ni arbitre dans « Rencontre » ; pas d'entraîneur dans « Actualités
 *        d'équipe » ; le chiffre de l'enjeu seulement dans son encadré ; la page d'un match joué inchangée ;
 *   T-E6 le tableau du banc : neuf facteurs et le contrôle, Σ et ⌀, « non mesurable » pour la météo et l'enjeu ;
 *   T-E7 le vent en km/h (ventEnKmH), jamais en m/s ni brut ;
 *   T-E8 aucune requête de plus à l'ouverture de la page (l'analyse et l'aperçu seulement).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import { reglesPures, texteDe, espaces, interfacePrete, optionsDuRendu, UI, tableauDe, entetes, corps, pied } from './aides/rendu.mjs';
import * as D from './aides/donneesPageMatch.mjs';
import { CONTEXTE_AU_BANC } from '../src/data/contexte/noteDuContexte.js';
import * as R from '../src/data/contexte/contexteRead.js';

const imp = (chemin) => import(pathToFileURL(chemin).href);
const options = optionsDuRendu;
const U = interfacePrete ? await imp(path.join(UI, 'src', 'utils', 'contexteDuMatch.js')) : null;
const SRC = path.join(SERVEUR, 'src');
const lireSrc = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8');
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8');
const copie = (x) => JSON.parse(JSON.stringify(x));
const compter = (texte, motif) => (texte.match(motif) ?? []).length;
const VERT = /is-mesure|is-compte|is-accent|cm-positive|vbadge|is-value/;
const MOINS = String.fromCharCode(0x2212);

// ------------------------------------------------------------ les réponses du vrai serveur (une fois)

let memo = null;
/** La lecture et l'aperçu, par le vrai code, sur un magasin fabriqué (une copie isolée, base neuve, deux nuits). */
function serveur() {
  if (memo) return memo;
  const c = preparerCopie({ base: false });
  try {
    const r = executer(c, path.join(SERVEUR, 'test', 'aides', 'script-contexte-ecran.mjs'), { args: ['{}'], timeout: 300_000 });
    assert.equal(r.code, 0, `script-contexte-ecran :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-1500)}`);
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
const nomsDe = (l) => ({ home: l.clubs.home.nom, away: l.clubs.away.nom });

/** La page FotMob du match (fabriquée, la forme de buildMatchPreview) avec ce que l'étape 32 y ajoute. */
function pageFotMob({ referee = { name: 'Jean Dupont', country: 'France', yellowCardsPerMatch: 9.9, foulsPerMatch: 30 }, arbitre = serveur().arbitres.homonyme, meta = {}, lineups = null, releveLe = '2026-10-01T09:58:00.000Z' } = {}) {
  return {
    loading: false,
    error: null,
    data: {
      available: true,
      fotmobMatchId: '4400001',
      kickoff: '2026-10-06T19:45:00.000Z',
      meta: { stadium: null, surface: 'grass', temperature: 14, weather: 'Cloudy', windSpeed: 12, ...(referee ? { referee } : {}), ...meta },
      lineups,
      lastLineups: null,
      releveLe,
      arbitreAuMagasin: arbitre
    }
  };
}
const ETEINT = { affichage: { saisons: 'eteint', matchs: 'eteint' }, enjeu: null, deroule: null };
const PRET = { loading: false, error: null };

// ================================================================ T-L : la lecture (le serveur)

test('T-L1 la LECTURE du contexte (contexteRead) : quelques lectures par clé, AUCUNE écriture, moins de 25 ms ; « pas encore calculé » avant la première nuit, « hors fenêtre » au-delà de 14 jours (et la nuit où il paraîtra), « clubs inconnus » sans identifiant (sans lire la base), « illisible » quand la base ne répond pas', () => {
  const s = serveur();
  assert.deepEqual([s.nuitA.mode, s.nuitB.mode], ['complet', 'complet']);
  for (const [cle, l] of Object.entries(s.lectures)) {
    if (!l?.__mesure) continue;
    assert.ok(l.__mesure.ms < 25, `${cle} : ${l.__mesure.ms} ms`);
    assert.ok(l.__mesure.ordres.length <= 5, `${cle} : ${l.__mesure.ordres.length} lectures`);
    for (const q of l.__mesure.ordres) assert.match(q.trim(), /^SELECT /, `${cle} : une lecture seulement (${q.slice(0, 60)})`);
  }
  assert.deepEqual(s.sqlsEcriture, [], 'aucune écriture');
  // La fiche par (date, identifiants) : la date exacte, puis la veille et le lendemain — une seule requête.
  assert.ok(s.lectures.calendrier.__mesure.ordres.some((q) => /FROM contexte_fiches WHERE date IN \(\?, \?, \?\) AND home_id = \? AND away_id = \?/.test(q)));
  assert.deepEqual([s.premiereNuit.etat, s.premiereNuit.raison, s.premiereNuit.fiche], ['pas-encore-calcule', 'premiere-nuit', null]);
  const loin = s.lectures.horsFenetre;
  assert.deepEqual([loin.etat, loin.date, loin.paraitLe, loin.fiche], ['hors-fenetre', '2026-10-24', '2026-10-10', null], 'la nuit du 10/10 calcule les matchs jusqu’au 24/10');
  const inconnus = s.lectures.clubsInconnus;
  assert.deepEqual([inconnus.etat, inconnus.clubs.home.id, inconnus.clubs.away.id, inconnus.__mesure.ordres.length], ['clubs-inconnus', null, null, 0], 'jamais un nom : rien n’est lu');
  assert.deepEqual([s.lectures.illisible.etat, s.lectures.illisible.raison], ['illisible', 'base-sans-reponse']);
  const c = s.lectures.calendrier;
  assert.equal(c.etat, 'pret');
  assert.deepEqual([c.fiche.date, c.fiche.calculeLe, c.fiche.fige, c.fiche.dateExacte], ['2026-10-06', s.nuitB.calculeLe, false, true]);
  assert.deepEqual(Object.keys(c.fiche.facteurs).sort(), ['altitude', 'arbitre', 'calculeLe', 'deplacement', 'enchainement', 'entraineur', 'heureInconnue', 'pelouse', 'repos', 'version'].sort());
  assert.deepEqual(c.nuit, { calculeLe: s.nuitB.calculeLe, jourD: '2026-10-01' });
  assert.equal(c.ligue.league, 'Ligue 1');
  assert.ok(c.ligue.jaunesParMatch > 0 && c.ligue.penaltiesParMatch > 0);
  assert.equal(c.archiveDepuis, '2026-09-29', 'le jour du lancement de l’étape 32 au registre : le début de la garde des prévisions');
  assert.deepEqual([c.stades.faitLe, c.stades.home, c.stades.away], ['2026-10-06', true, true]);
  assert.deepEqual([c.preuve, c.decision], [null, null], 'lot 1 : ni preuve sur vos matchs, ni décision de Pierre');
});

test('T-L1 le VRAI coup d’envoi refait les heures en mémoire (une cote relevée), jamais le midi UTC FICTIF d’un match du calendrier (reconnu à sa source, critique, constat 16) ; une fiche GELÉE se lit telle quelle ; l’ORPHELINE d’un match re-daté d’un jour n’est JAMAIS lue (critique, constat 17 ; bug n° 43)', () => {
  const s = serveur();
  // Le calendrier seul : 12:00Z fictif → heure inconnue, rien de refait.
  const cal = s.lectures.calendrier;
  assert.deepEqual([cal.coupDEnvoi.connu, cal.fiche.heuresRefaites, cal.fiche.facteurs.heureInconnue], [false, false, true]);
  // Une cote relevée (hasOdds) : le coup d'envoi est connu, les heures refaites ; un précédent « prévu » (sans heure) reste au jour près.
  const cote = s.lectures.avecCote;
  assert.deepEqual([cote.coupDEnvoi.iso, cote.fiche.heuresRefaites, cote.fiche.facteurs.heureInconnue], ['2026-10-06T19:45:00.000Z', true, false]);
  for (const camp of ['home', 'away']) {
    const r = cote.fiche.facteurs.repos[camp];
    if (r.precedent && !r.precedent.kickoffConnu) assert.equal(r.heureInconnue, true, 'un précédent sans heure : compté au jour près');
  }
  // Un match du calendrier coté gratuitement : l'heure de sa cote, pas le midi fictif.
  assert.deepEqual([s.lectures.coteDuCalendrier.coupDEnvoi.iso, s.lectures.coteDuCalendrier.fiche.heuresRefaites], ['2026-10-06T17:30:00.000Z', true]);
  // Une fiche gelée (match du 30/09, lu le 01/10) : celle de la nuit A, telle quelle ; avec son coup d'envoi, des heures exactes.
  const figee = s.lectures.figee;
  assert.deepEqual([figee.fiche.date, figee.fiche.calculeLe, figee.fiche.fige], ['2026-09-30', s.nuitA.calculeLe, true]);
  const exacte = s.lectures.figeeAvecCote.fiche.facteurs.repos.home;
  assert.equal(exacte.heureInconnue, false);
  assert.equal(exacte.precedent.kickoffConnu, true);
  assert.equal(exacte.heures, Math.round(((Date.parse('2026-09-30T18:00:00.000Z') - Date.parse(exacte.precedent.kickoff)) / 3_600_000) * 100) / 100, 'heures entre les deux coups d’envoi');
  assert.equal(exacte.classe, exacte.heures < 96 ? 'court' : 'normal');
  // Le match re-daté du 03/10 au 04/10 entre les deux nuits : deux fiches rangées, l'orpheline (nuit A) jamais lue.
  assert.deepEqual(s.orphelines.map((r) => [r.date, r.calcule_le]), [['2026-10-03', s.nuitA.calculeLe], ['2026-10-04', s.nuitB.calculeLe]]);
  for (const cle of ['redateNouvelle', 'redateAncienne']) {
    const l = s.lectures[cle];
    assert.deepEqual([l.etat, l.fiche.date, l.fiche.calculeLe], ['pret', '2026-10-04', s.nuitB.calculeLe], `${cle} : la fiche de la dernière nuit, jamais l’orpheline`);
  }
  assert.equal(s.lectures.redateAncienne.fiche.dateExacte, false);
  // Les règles, sur des lignes posées à la main : la date exacte d'abord, puis la plus récente ; une ligne « en cours » se lit.
  const nuit = { calculeLe: '2026-10-01T01:00:00.000Z', jourD: '2026-10-01' };
  const lignes = [
    { date: '2026-10-05', calcule_le: '2026-09-30T01:00:00.000Z', kickoff: null, kickoff_connu: 0 },
    { date: '2026-10-06', calcule_le: nuit.calculeLe, kickoff: null, kickoff_connu: 0 },
    { date: '2026-10-07', calcule_le: '2026-10-02T01:00:00.000Z', kickoff: null, kickoff_connu: 0 }
  ];
  assert.equal(R.choisirLaFiche(lignes, { date: '2026-10-05', nuit }).date, '2026-10-06', 'l’orpheline du 05 n’est pas lue');
  assert.equal(R.choisirLaFiche(lignes, { date: '2026-10-07', nuit, enCours: { calculeLe: '2026-10-02T01:00:00.000Z' } }).date, '2026-10-07', 'la nuit en cours de rangement');
  assert.equal(R.choisirLaFiche(lignes, { date: '2026-10-05', nuit: null }), null, 'aucune nuit : rien');
  assert.equal(R.ficheALire({ date: '2026-09-30', calcule_le: 'vieux', kickoff: null, kickoff_connu: 0 }, { nuit }), true, 'gelée : sa date est passée');
});

test('T-L1 les statuts et le banc sont LUS dans noteDuContexte.js (jamais recopiés) : repos, enchaînement, altitude « Effet mesuré » ; déplacement, pelouse, arbitre, entraîneur « Explication seulement » ; météo et enjeu « non mesurable » ; sans note, « pas encore mesuré » partout ; un démenti de vos matchs repasse en explication', () => {
  const c = lecture('calendrier');
  assert.deepEqual(Object.fromEntries(Object.entries(c.statuts).map(([f, s]) => [f, s.statut])), Object.fromEntries(Object.entries(CONTEXTE_AU_BANC.facteurs).map(([f, s]) => [f, s.statut])));
  assert.deepEqual(Object.entries(c.statuts).filter(([, s]) => s.statut === 'effet-mesure').map(([f]) => f), ['repos', 'enchainement', 'altitude']);
  assert.deepEqual(c.banc, R.bancPourLEcran(CONTEXTE_AU_BANC));
  assert.deepEqual([c.banc.K, c.banc.matchs.utilisables, c.banc.utiles], [9, 56730, ['repos-court', 'enchainement-serre', 'deplacement-altitude']]);
  assert.doesNotMatch(JSON.stringify(c.banc), /sha1|fichier|banc-regles/, 'ni chemins ni empreintes à l’écran');
  assert.ok(Object.values(R.statutsDesFacteurs(null)).every((s) => s.statut === 'pas-encore-mesure'));
  const dementi = R.statutsDesFacteurs(CONTEXTE_AU_BANC, { 'repos-court': { le: '2027-03-01' } });
  assert.deepEqual(dementi.repos, { statut: 'dementi', variante: 'repos-court', dementiLe: '2027-03-01' });
  assert.equal(dementi.enchainement.statut, 'effet-mesure');
  // Le code de l'écran ne recopie aucun chiffre du banc.
  const mots = lireUi('utils', 'contexteDuMatch.js');
  for (const chiffre of ['16870', '16 870', '0.000958', '56730', '2.7729']) assert.ok(!mots.includes(chiffre), chiffre);
});

test('T-L1 le bloc `contexte` est joint APRÈS l’analyse par la vraie route (GET /api/analysis/match/…), dans un try/catch : une lecture ratée n’empêche jamais l’analyse ; le verdict n’en sait rien ; l’IA ne le reçoit jamais (le résumé du moteur prend des champs nommés)', () => {
  const P = D.payloadsDuServeur();
  const a = P.analyses['essai-a'].corps;
  assert.ok(a.contexte, 'le vrai serveur joint le bloc');
  assert.ok(R.ETATS_DU_CONTEXTE.includes(a.contexte.etat), a.contexte.etat);
  assert.equal(a.contexte.version, 1);
  const controleur = lireSrc('api', 'controllers', 'analysis.controller.js');
  assert.match(controleur, /const contexte = sportId === 'football' \? contexteDuMatchAnalyse\(avecFraicheur\) : null;\n {2}res\.json\(\{ \.\.\.analyse, \.\.\.\(aVerifier \? \{ aVerifier \} : \{\}\), \.\.\.\(simulation \? \{ simulation \} : \{\}\), \.\.\.\(contexte \? \{ contexte \} : \{\}\) \}\);/);
  assert.match(controleur, /function contexteDuMatchAnalyse\(match\) \{\n {2}try \{\n {4}return contexteDuMatch\(\{ match, database: openDb\(\), maintenant: Date\.now\(\), lancement: \(\) => lancementDe\('32'\) \?\? null \}\);\n {2}\} catch \{\n {4}return \{ version: 1, etat: 'illisible', raison: 'lecture-ratee' \};/);
  const service = lireSrc('core', 'ai', 'matchAiAnalysisService.js');
  const resume = service.slice(service.indexOf('function resumeDuMoteur('), service.indexOf('\n}\n', service.indexOf('function resumeDuMoteur(')));
  assert.ok(resume.length > 200 && !/contexte|\.\.\.engineResult/.test(resume), 'le résumé donné à l’IA : des champs nommés, jamais le contexte');
  // La lecture reste hors du moteur : aucun fichier du moteur ne l'importe, elle n'importe que le contexte, la note et la table des stades.
  const imports = [...lireSrc('data', 'contexte', 'contexteRead.js').matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['../reference/donneesDeReference.js', './formulesDuContexte.js', './noteDuContexte.js', './reglagesContexte.js']);
});

test('T-L2 l’APERÇU de la page du match : l’arbitre désigné au MAGASIN (sa ligne de la table de la nuit, clé « nom|pays », jamais les moyennes que FotMob affiche), ses homonymes d’un autre pays, rien sans nom, null sans exception quand la base ne répond pas ; l’heure de la lecture FotMob (`releveLe`)', () => {
  const a = serveur().arbitres;
  assert.equal(a.connu.ligne.cle, 'Clément Turpin|France');
  assert.ok(a.connu.ligne.matchs > 0 && a.connu.ligne.matchs_cartons > 0);
  assert.ok(!('yellowCardsPerMatch' in a.connu.ligne) && !('foulsPerMatch' in a.connu.ligne));
  assert.deepEqual(a.connu.homonymes, []);
  assert.deepEqual(a.homonyme.homonymes.map((h) => h.pays), ['Belgium'], 'l’autre Jean Dupont, un autre pays, un autre arbitre');
  assert.deepEqual([a.inconnu.ligne, a.inconnu.homonymes], [null, []]);
  assert.equal(a.sansNom, null);
  assert.deepEqual([a.illisible.ligne, a.illisible.homonymes], [null, []]);
  const lc = lireSrc('data', 'providers', 'lineupContext.js');
  assert.match(lc, /releveLe: lu\.fetchedAt \?\? null,\n {4}arbitreAuMagasin: arbitreAuMagasin\(lu\.page\.meta\?\.referee, database\)/);
  assert.equal(compter(lc, /avecForceDuOnze\(/g), 3, 'la force du onze inchangée');
  assert.match(lc, /^import \{ lireLArbitre, homonymesDe \} from '\.\.\/db\/refereeRead\.js';$/m);
});

// ================================================================ le rendu

const appels = [];
const interdits = [];
const avertissements = [];
let scenario = {};
let ctx;
let originaux = {};
const reponseJson = (corps, statut = 200) => ({ ok: statut < 400, status: statut, headers: { get: () => 'application/json' }, json: async () => JSON.parse(JSON.stringify(corps)) });
const AUTORISES = [
  /\/api\/matches(\?|\/)/,
  /\/api\/analysis\/match\//,
  /\/api\/match-stats\/(preview|team-averages|team\?|team-ids|odds-profile)/,
  /\/api\/match-ai-analysis\/(status|match\/)/,
  /\/api\/odds\/(fixture|saisies|conseil-releve|fraicheur)/,
  /\/api\/team-stats\/team-news/,
  /\/api\/match-notes\//
];

before(async () => {
  if (!interfacePrete) return;
  originaux = { fetch: globalThis.fetch, warn: console.warn, setInterval: globalThis.setInterval, setTimeout: globalThis.setTimeout };
  globalThis.setInterval = (fn, ms, ...a) => {
    const t = originaux.setInterval(fn, ms, ...a);
    t.unref?.();
    return t;
  };
  globalThis.setTimeout = (fn, ms, ...a) => {
    const t = originaux.setTimeout(fn, ms, ...a);
    t.unref?.();
    return t;
  };
  globalThis.fetch = async (url) => {
    const u = String(url);
    appels.push(u);
    if (!AUTORISES.some((m) => m.test(u))) {
      interdits.push(u);
      return reponseJson({ error: `fetch interdit dans ce rendu : ${u}` }, 599);
    }
    const s = scenario;
    if (/\/api\/matches\?/.test(u)) return reponseJson({ source: 'odds-api', count: s.liste.length, matches: s.liste });
    if (/\/api\/matches\//.test(u)) return reponseJson(s.match);
    if (/\/api\/analysis\/match\//.test(u)) return reponseJson(s.analyse);
    if (/\/api\/match-stats\/preview/.test(u)) return reponseJson(s.apercu);
    if (/\/api\/match-stats\/team-averages\?name=([^&]*)/.test(u)) return reponseJson(D.moyennes(decodeURIComponent(/name=([^&]*)/.exec(u)[1])));
    if (/\/api\/match-stats\/team\?name=([^&]*)/.test(u)) return reponseJson(D.forme(decodeURIComponent(/name=([^&]*)/.exec(u)[1])));
    if (/\/api\/match-stats\/odds-profile/.test(u)) return reponseJson({ available: false, reason: 'essai' });
    if (/\/api\/match-ai-analysis\/match\//.test(u)) return reponseJson({ entry: s.ia });
    if (/\/api\/odds\/fixture/.test(u)) return reponseJson(s.fixture);
    if (/\/api\/odds\/saisies/.test(u)) return reponseJson(s.saisies);
    if (/\/api\/odds\/conseil-releve/.test(u)) return reponseJson(s.conseil);
    if (/\/api\/odds\/fraicheur/.test(u)) return reponseJson({ reglage: { maxAgeMinutes: 180, avantCompos: true }, source: 'defaut', bornes: { min: 15, max: 1440 } });
    if (/\/api\/team-stats\/team-news/.test(u)) return reponseJson(s.actualites ?? D.actualites());
    const neutre = D.neutre(u);
    if (neutre) return reponseJson(neutre);
    return reponseJson({ error: 'inconnu' }, 404);
  };
  console.warn = (...a) => avertissements.push(a.map(String).join(' ').slice(0, 300));
  const { createServer } = await imp(path.join(UI, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
  const vuePlugin = (await imp(path.join(UI, 'node_modules', '@vitejs', 'plugin-vue', 'dist', 'index.mjs'))).default;
  const { renderToString } = await imp(path.join(UI, 'node_modules', 'vue', 'server-renderer', 'index.mjs'));
  const { createSSRApp, h } = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));
  const { createPinia } = await imp(path.join(UI, 'node_modules', 'pinia', 'dist', 'pinia.mjs'));
  const { createRouter, createMemoryHistory } = await imp(path.join(UI, 'node_modules', 'vue-router', 'dist', 'vue-router.mjs'));
  // La page charge dans un `watch` immédiat : il devient un `onServerPrefetch`, et chaque chargement lancé sans attente
  // est attendu (le patron de pageMatchDecisionEcran et de simulationEcrans).
  const prefetch = {
    name: 'ssr-prefetch',
    enforce: 'pre',
    transform(code, id) {
      if (id.includes('?')) return null;
      if (/UpcomingMatchView\.vue$/.test(id)) {
        let c = code;
        const remplacer = (a, b) => {
          assert.ok(c.includes(a), `la page a changé : « ${a.slice(0, 70)} » introuvable`);
          c = c.replace(a, b);
        };
        remplacer("import { computed, nextTick, ref, watch } from 'vue';", "import { computed, nextTick, ref, watch, onServerPrefetch } from 'vue';");
        remplacer('watch(() => props.matchId, load, { immediate: true });', 'onServerPrefetch(load);');
        c = c.replace(/\n {2}(charger\w+\(\));/g, '\n  await $1;').replace(/\n {2}(aiStore\.fetch\w+\([^)]*\)\.catch\(\(\) => \{\}\));/g, '\n  await $1;');
        return c;
      }
      if (!/(ManualOddsEntry|PaidOddsAdvicePanel|TeamNewsCard)\.vue$/.test(id)) return null;
      let c = code.replace(/import \{ ([^}]*)\bonMounted\b([^}]*)\} from 'vue';/, (m, a, b) => `import { ${a}onMounted, onServerPrefetch${b}} from 'vue';`).replace(/onMounted\(/g, 'onServerPrefetch(');
      // Les actualités d'équipe se chargent dans un `watch` immédiat : attendues, pour que le rendu voie les clubs.
      if (/TeamNewsCard\.vue$/.test(id)) c = c.replace("import { ref, computed, watch } from 'vue';", "import { ref, computed, watch, onServerPrefetch } from 'vue';").replace('let matchIdCourant = null;', 'let matchIdCourant = null;\nonServerPrefetch(() => Promise.all([chargerActualites(), chargerNote()]));');
      return c;
    }
  };
  const ID_FAUX = '\0routeur-faux';
  const routeurFaux = {
    name: 'routeur-faux',
    enforce: 'pre',
    resolveId: (source) => (/(^@\/router\/index\.js$)|([\\/]src[\\/]router[\\/]index\.js$)/.test(source) ? ID_FAUX : null),
    load: (id) => (id === ID_FAUX ? 'export const router = { push: async () => null, resolve: () => ({ href: "/" }) };' : null)
  };
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  const cache = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-rendu-'));
  const vite = await createServer({
    configFile: false,
    root: UI,
    logLevel: 'error',
    appType: 'custom',
    cacheDir: cache,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    plugins: [routeurFaux, prefetch, vuePlugin()],
    resolve: { alias: { '@': path.join(UI, 'src') } }
  });
  const routeur = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:chemin(.*)*', component: { render: () => null } }] });
  await routeur.push('/');
  await routeur.isReady();
  const horloge = await vite.ssrLoadModule('/src/utils/liveClock.js');
  const charger = async (chemin) => (await vite.ssrLoadModule(chemin)).default;
  ctx = {
    vite,
    cache,
    composants: {
      Carte: await charger('/src/components/analysis/MatchContextCard.vue'),
      Cadre: await charger('/src/components/matches/MatchInfoPanel.vue'),
      Page: await charger('/src/views/UpcomingMatchView.vue')
    },
    async rendre(composant, props = {}, { heure = Date.parse('2026-10-01T10:00:00.000Z') } = {}) {
      appels.length = 0;
      const avant = avertissements.length;
      horloge.liveNow.value = heure;
      const app = createSSRApp({ render: () => h(composant, props) });
      app.use(createPinia());
      app.use(routeur);
      const html = (await renderToString(app)).replace(/ data-v-[a-z0-9]+(?==|\s|>)/g, '');
      const vide = /<path(?![^>]*\bd=)[^>]*>/.exec(html);
      assert.equal(vide, null, `une icône inconnue d'AppIcon (tracé vide) : ${vide?.[0]}`);
      return { html, texte: texteDe(html), avertissements: avertissements.slice(avant), appels: [...appels] };
    }
  };
});

after(async () => {
  if (!interfacePrete) return;
  globalThis.fetch = originaux.fetch;
  console.warn = originaux.warn;
  globalThis.setInterval = originaux.setInterval;
  globalThis.setTimeout = originaux.setTimeout;
  if (!ctx) return;
  await ctx.vite.close();
  fs.rmSync(ctx.cache, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

/** La carte seule, sur une lecture du vrai serveur. */
const carte = (contexte, { page = pageFotMob(), simulation = ETEINT, analyse = PRET, heure } = {}) => ctx.rendre(ctx.composants.Carte, { contexte, analyse, page, simulation, match: contexte ? nomsDe(contexte) : { home: 'Lens', away: 'Lille' } }, heure ? { heure } : {});
/** Les lignes de l'encadré rendu : { facteur → html }. */
const lignesRendues = (html) => {
  const debuts = [...html.matchAll(/<li class="mcc__ligne" data-facteur="(\w+)"/g)].map((m) => [m[1], m.index]);
  const finDesLignes = [html.indexOf('class="mcc__pied"'), html.indexOf('data-contexte="banc-d-essai"')].filter((i) => i > 0).sort((a, b) => a - b)[0] ?? html.length;
  return Object.fromEntries(debuts.map(([f, i], k) => [f, html.slice(i, k + 1 < debuts.length ? debuts[k + 1][1] : finDesLignes)]));
};
/** La carte (AppCard : <section class="card …">) qui contient la position `i`, de son ouverture à SA fermeture. */
function carteAutour(html, i) {
  const debut = html.lastIndexOf('<section class="card', i);
  const re = /<(\/?)section\b/g;
  re.lastIndex = debut;
  let profondeur = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    profondeur += m[1] ? -1 : 1;
    if (profondeur === 0) return html.slice(debut, html.indexOf('>', m.index) + 1);
  }
  return html.slice(debut);
}

// ================================================================ T-E1 les phrases

test('T-E1 les règles de l’écran (ui/src/utils/contexteDuMatch.js) sont PURES ; chaque phrase, exacte, sur les vraies formes : repos (heure de Paris, survol), enchaînement, déplacement, altitude, pelouse, météo, arbitre, entraîneur, enjeu, la phrase d’ouverture', options, () => {
  const vus = reglesPures('contexteDuMatch.js');
  assert.ok(vus.has('fotmobLabels.js') && vus.has('leagueDisplay.js'));
  const c = lecture('calendrier');
  const n = nomsDe(c);
  const f = c.fiche;
  // Repos : un « match prévu » du calendrier, au jour près.
  const r = f.facteurs.repos.home;
  const ph = U.phraseRepos(n.home, r, { heureDuMatchInconnue: true });
  assert.equal(ph.texte, `${n.home} : ${r.jours} jours de repos — match prévu ${U.jourSeulDit(r.precedent.date)} (heure inconnue), Ligue 1.`);
  assert.equal(ph.titre, `Compté au jour près : ${r.jours} jours entre les deux dates.`);
  assert.ok(ph.mentions.includes('heure du match pas encore connue : compté au jour près'));
  assert.ok(ph.mentions.includes(`si le match du ${U.jourSeulDit(r.precedent.date)} se joue comme prévu`));
  // Repos exact (le vrai coup d'envoi, un précédent du magasin) : l'heure de Paris, le survol en jours et heures.
  const ex = lecture('figeeAvecCote');
  const re = ex.fiche.facteurs.repos.home;
  const pe = U.phraseRepos(ex.clubs.home.nom, re);
  const heureParis = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(re.precedent.kickoff)).split(':');
  const heureDite = `${Number(heureParis[0])} h${heureParis[1] === '00' ? '' : ` ${heureParis[1]}`}`;
  assert.equal(pe.texte, `${ex.clubs.home.nom} : ${re.jours === 0 ? 'moins d’un jour de repos' : `${re.jours} jour${re.jours > 1 ? 's' : ''} de repos`} — dernier match ${U.jourDit(re.precedent.kickoff)} à ${heureDite} (heure de Paris), Ligue 1.`);
  const h = Math.round(re.heures - re.jours * 24);
  assert.equal(pe.titre, `${re.jours ? `${re.jours} jour${re.jours > 1 ? 's' : ''} et ` : ''}${h} heure${h > 1 ? 's' : ''} entre les deux coups d’envoi.`);
  assert.deepEqual(pe.mentions, ['repos court : moins de 4 jours']);
  // Les mentions fixes du repos.
  const long = U.phraseRepos('Lens', { ...re, heures: 300, jours: 12, classe: 'long', mentions: ['prolongation', 'long-competitions-non-suivies', 'bresil-championnats-d-etat'] });
  assert.deepEqual(long.mentions, ['après une prolongation', 'repos long : 10 jours ou plus — une compétition que l’appli ne suit pas (supercoupe, championnat d’État au Brésil, sélections…) a pu se jouer entre-temps', 'de janvier à avril, un club brésilien joue aussi son championnat d’État, que l’appli ne suit pas : son vrai repos peut être plus court']);
  assert.equal(U.phraseRepos('Lens', { heures: null, jours: null, classe: 'inconnu', precedent: null, mentions: ['premier-match'] }).texte, 'Lens : repos inconnu (premier match connu de ce club).', 'jamais « 0 jour »');
  // Enchaînement.
  const e = U.phraseEnchainement(n, f.facteurs.enchainement);
  const serres = ['home', 'away'].filter((camp) => f.facteurs.enchainement[camp].serre);
  assert.ok(serres.length > 0);
  for (const camp of serres) {
    const p = f.facteurs.enchainement[camp].prochain;
    assert.ok(e.phrases.some((x) => x.texte === `${n[camp]} rejoue dans ${Math.floor(f.facteurs.enchainement[camp].heures / 24)} jours : ${U.jourSeulDit(p.date)}, Ligue 1.`), JSON.stringify(e.phrases));
  }
  const calme = U.phraseEnchainement({ home: 'Lens', away: 'Lille' }, { home: { prochain: { date: '2026-10-12', kickoffConnu: false, league: 'Ligue 1 - France' }, heures: 144, serre: false }, away: { prochain: { date: '2026-10-13', kickoffConnu: false, league: 'UEFA Champions League' }, heures: 168, serre: false } });
  assert.deepEqual(calme.phrases.map((x) => x.texte), ['Rien de serré : aucun des deux clubs ne rejoue dans les 4 jours.']);
  assert.deepEqual(calme.mentions, ['Lens : prochain match dans 6 jours (lundi 12/10, Ligue 1).', 'Lille : prochain match dans 7 jours (mardi 13/10, UEFA Champions League).']);
  assert.equal(U.phraseEnchainementDUnClub('Lens', { prochain: null, heures: null, serre: null }).texte, 'Lens : prochain match inconnu (pas encore au calendrier).');
  // Déplacement : la distance de la fiche (haversine entre les stades habituels de venues.json).
  assert.equal(U.phraseDeplacement(n, { fiche: f, contexte: c, page: pageFotMob() }), `${n.away} fait ${f.facteurs.deplacement.km.toLocaleString('fr-FR')} km pour venir (entre les stades habituels, à vol d’oiseau).`);
  assert.equal(U.phraseDeplacement(n, { fiche: { facteurs: { deplacement: { ...f.facteurs.deplacement, km: 9 } } }, contexte: c, page: null }), 'Les deux stades sont tout proches (9 km à vol d’oiseau).');
  assert.equal(U.phraseDeplacement(n, { fiche: { facteurs: { deplacement: { ...f.facteurs.deplacement, km: 0 } } }, contexte: c, page: null }), 'Les deux clubs ont le même stade habituel : pas de déplacement.', 'jamais « fait 0 km pour venir »');
  assert.equal(U.phraseDeplacement(n, { fiche: { facteurs: { deplacement: { ...f.facteurs.deplacement, km: null } } }, contexte: { ...c, stades: { ...c.stades, away: false } }, page: null }), `Distance inconnue : ${n.away} n’a pas de stade dans la table des stades.`);
  const ailleurs = pageFotMob({ meta: { stadium: 'Stade de France' } });
  assert.equal(U.phraseDeplacement(n, { fiche: f, contexte: c, page: ailleurs }), `Match au Stade de France, pas au stade habituel de ${n.home} (${f.facteurs.deplacement.stade}) : distance non comptée.`);
  assert.equal(U.phraseAltitude(n, { fiche: f, contexte: c, page: ailleurs }).texte, 'Altitude : match hors du stade habituel, non comptée.');
  // Altitude : le club en altitude reçoit un club d'en bas ; un stade hors de la liste (toujours une ligne).
  const alt = lecture('altitude');
  const a = alt.fiche.facteurs.altitude;
  assert.equal(a.concerne, true);
  assert.deepEqual(U.phraseAltitude(nomsDe(alt), { fiche: alt.fiche, contexte: alt, page: null }), { texte: `${alt.clubs.home.nom} joue à ${a.stade.toLocaleString('fr-FR')} m d’altitude ; ${alt.clubs.away.nom} vient de basse altitude (moins de ${(1500).toLocaleString('fr-FR')} m).`, mentions: ['altitude : liste faite à la main (± 50 m), à relire'] });
  assert.equal(U.phraseAltitude(n, { fiche: f, contexte: c, page: null }).texte, `Altitude : stade sous ${(1500).toLocaleString('fr-FR')} m (liste faite à la main).`);
  assert.equal(U.phraseAltitude(n, { fiche: { facteurs: { altitude: { stade: 1870, visiteur: null, concerne: false } } }, contexte: c, page: null }).texte, `${n.home} joue à 1 870 m d’altitude : sous les 2 000 m retenus par le banc d’essai.`.replace(/1 870|2 000/g, (x) => x.replace(' ', String.fromCharCode(0x202f))));
  // Pelouse : la page FotMob d'abord, sinon le stade habituel ; ce que le visiteur connaît chez lui.
  const syn = lecture('synthetique');
  const ps = U.phrasePelouse(nomsDe(syn), { fiche: syn.fiche, page: pageFotMob({ meta: { surface: undefined } }) });
  assert.equal(ps.texte, 'Pelouse synthétique (stade habituel).');
  assert.deepEqual(ps.mentions, [`${syn.clubs.away.nom} joue sur gazon chez lui`]);
  assert.equal(U.phrasePelouse(nomsDe(syn), { fiche: syn.fiche, page: pageFotMob({ meta: { surface: 'Artificial turf' } }) }).texte, 'Pelouse synthétique (page FotMob du match).');
  assert.equal(U.phrasePelouse(n, { fiche: f, page: pageFotMob({ meta: { surface: 'Hybrid grass' } }) }).texte, 'Pelouse hybride (page FotMob du match).');
  assert.equal(U.phrasePelouse(n, { fiche: { facteurs: { pelouse: { surface: null } } }, page: pageFotMob({ meta: { surface: undefined } }) }).texte, 'Pelouse inconnue : ni la page FotMob ni la table des stades ne la donnent.');
  // Météo : la prévision FotMob, le vent en km/h, les mots fixés.
  assert.equal(U.phraseMeteo(pageFotMob()), 'Prévision FotMob au coup d’envoi : 14 °C, nuageux, vent 43 km/h (vent fort).');
  assert.equal(U.phraseMeteo(pageFotMob({ meta: { temperature: 31, weather: 'Thunderstorm', windSpeed: 4, precipitation: 6.2 } })), 'Prévision FotMob au coup d’envoi : 31 °C (chaleur), orage, vent 14 km/h, précipitations prévues : 6,2 mm.');
  assert.equal(U.phraseMeteo(pageFotMob({ meta: { temperature: -2, weather: 'Snow', windSpeed: 0 } })), `Prévision FotMob au coup d’envoi : ${MOINS}2 °C (froid), neige.`);
  assert.equal(U.phraseMeteo(pageFotMob({ meta: { temperature: undefined, weather: undefined, windSpeed: undefined } })), 'Météo : FotMob ne la donne pas encore (elle paraît en général la veille ou le jour du match).');
  assert.equal(U.phraseMeteo({ loading: true, error: null, data: null }), 'Météo : lecture de la page FotMob…');
  assert.equal(U.phraseMeteo({ loading: false, error: 'FotMob indisponible', data: null }), 'Météo : la page FotMob du match n’a pas pu être lue.');
  // Arbitre : ses moyennes AU MAGASIN, celles du championnat ; les homonymes ; aucun match ; pas désigné.
  const aj = serveur().arbitres.homonyme.ligne;
  const pa = U.phraseArbitre({ page: pageFotMob(), contexte: c });
  const x = Math.round((Math.exp(aj.indice_buts) - 1) * 100);
  const nb = (v, d) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  assert.equal(pa.texte, `Jean Dupont (France) : ${nb(aj.jaunes / aj.matchs_cartons, 1)} cartons jaunes par match sur ses ${aj.matchs} matchs relevés au magasin (championnat : ${nb(c.ligue.jaunesParMatch, 1)}) ; ${nb(aj.penalties / aj.matchs_deroule, 2)} penalty marqué par match (championnat : ${nb(c.ligue.penaltiesParMatch, 2)}) ; ${Math.abs(x)} % de buts ${x > 0 ? 'de plus' : 'de moins'} que la moyenne du championnat dans ses matchs.`);
  assert.ok(pa.mentions.includes('un autre arbitre du même nom (Belgium) n’est pas compté'));
  assert.ok(pa.mentions.includes('ramené vers la moyenne : un arbitre de peu de matchs compte peu'));
  assert.ok(pa.mentions.includes('Les moyennes que FotMob affiche ne sont pas reprises, pour rester la même mesure que le banc d’essai : tous ses matchs relevés au magasin.'));
  assert.doesNotMatch(JSON.stringify(pa), /9,9|30,0/, 'jamais les moyennes que FotMob affiche');
  assert.equal(U.phraseArbitre({ page: pageFotMob({ referee: { name: 'Arbitre Jamais Vu', country: 'Italy' }, arbitre: serveur().arbitres.inconnu }), contexte: c }).texte, 'Arbitre Jamais Vu (Italy) : aucun de ses matchs n’est au magasin — pas de moyenne.');
  assert.equal(U.phraseArbitre({ page: pageFotMob({ referee: { name: 'Arbitre Jamais Vu', country: 'Italy' }, arbitre: serveur().arbitres.inconnu }), contexte: copie(serveur().premiereNuit) }).texte, 'Arbitre Jamais Vu (Italy) : ses moyennes au magasin ne sont pas encore calculées (la prochaine passe de nuit le fera).');
  assert.equal(U.phraseArbitre({ page: pageFotMob({ referee: null }), contexte: c }).texte, 'Arbitre : pas encore désigné chez FotMob.');
  // Entraîneur : une ligne par club ; nouveau (posé à la main sur la vraie forme) ; inconnu ; la composition publiée qui en montre un autre.
  const en = U.phraseEntraineur(n, { fiche: f, page: pageFotMob() });
  assert.equal(en.phrases.length, 2);
  assert.match(en.phrases[0].texte, new RegExp(`^${n.home} : `));
  assert.ok(en.mentions.includes('D’après les compositions de ses derniers matchs : un changement fait depuis le dernier match n’apparaît qu’avec la composition publiée.'));
  const nouveau = copie(f);
  nouveau.facteurs.entraineur.home = { connu: true, nom: 'Pierre Sage', id: 1, depuisMatchs: 3, depuisLe: '2026-09-20', precedent: { nom: 'Franck Haise', id: 2 }, nouveau: true };
  nouveau.facteurs.entraineur.away = { connu: false, nom: null, id: null, depuisMatchs: null, depuisLe: null, precedent: null, nouveau: null };
  const avecCompo = pageFotMob({ lineups: { home: { coach: 'Will Still' }, away: { coach: null } } });
  const en2 = U.phraseEntraineur({ home: 'Lens', away: 'Lille' }, { fiche: nouveau, page: avecCompo });
  assert.deepEqual(en2.phrases.map((p) => p.texte), ['Lens : Pierre Sage dirige l’équipe depuis 3 matchs (avant lui : Franck Haise) — nouvel entraîneur.', 'Lille : entraîneur inconnu (aucune composition récente).']);
  assert.ok(en2.mentions.includes('Composition publiée : Will Still sur le banc de Lens (pas encore dans la fiche).'));
  // Enjeu : il renvoie à son encadré, sans recopier le chiffre.
  assert.equal(U.phraseEnjeu(ETEINT), 'Enjeu au classement : calculé à blanc chaque nuit, pas encore montré (Réglages › Versions du moteur › « Fins de saison et enjeu »).');
  assert.equal(U.phraseEnjeu({ affichage: { saisons: 'allume' } }), 'Enjeu au classement : voir l’encadré « Enjeu » juste au-dessus. Il n’entre dans aucun pourcentage.');
  // Ce que dit le banc, sous la ligne : « Effet mesuré » (jamais une cause), « pas prouvé », non mesurable.
  assert.equal(U.phraseDuBanc('repos', c), 'Effet mesuré au banc : sur 16 870 matchs de juillet 2023 à septembre 2026 où un club avait moins de 4 jours de repos, les statistiques seules sous-estimaient les buts du club au repos court (de 5 à 7 % selon la période) et surestimaient ceux de son adversaire (de 4 à 7 % selon la période) ; les corriger réduit de 0,096 % l’erreur de prévision du score exact (fourchette 0,039 % à 0,153 %, en tenant compte des 9 essais faits). Pas encore dans le pourcentage.'.replace('16 870', (16870).toLocaleString('fr-FR')));
  assert.equal(U.phraseDuBanc('altitude', c), 'Effet mesuré au banc : sur 1 085 matchs de juillet 2023 à septembre 2026 où le club qui reçoit jouait à 2 000 m ou plus face à un visiteur venu d’en bas, les statistiques seules sous-estimaient les buts du club qui reçoit (de 11 à 13 % selon la période) et surestimaient ceux du visiteur (de 4 à 11 % selon la période) ; les corriger réduit de 0,55 % l’erreur de prévision du score exact (fourchette 0,05 % à 1,06 %, en tenant compte des 9 essais faits). Pas encore dans le pourcentage.'.replace('1 085', (1085).toLocaleString('fr-FR')).replace('2 000', (2000).toLocaleString('fr-FR')));
  assert.equal(U.phraseDuBanc('pelouse', c), `Mesuré au banc d’essai sur ${(2674).toLocaleString('fr-FR')} matchs de juillet 2023 à septembre 2026 : pas prouvé.`);
  assert.match(U.phraseDuBanc('meteo', c), /^La météo des matchs passés a été relue après coup par FotMob \(c’est la météo observée, pas la prévision\) : elle ne peut pas être mesurée proprement au banc\. Les prévisions sont gardées depuis le 29\/09\/2026 : la mesure se fera sur vos matchs, dans un an environ\.$/);
  assert.equal(U.phraseDuBanc('repos', { ...c, banc: null, statuts: R.statutsDesFacteurs(null) }), 'Pas encore mesuré au banc d’essai.');
  // La phrase d'ouverture.
  const dit = U.contexteDit({ contexte: c, analyse: PRET, page: pageFotMob(), simulation: ETEINT, match: n });
  assert.equal(dit.ouverture, '« Effet mesuré » : le banc d’essai l’a prouvé sur les matchs de juillet 2023 à septembre 2026. Il n’entre dans aucun pourcentage aujourd’hui : il n’y entrera qu’avec votre accord, après un essai à blanc.');
  const sansBanc = U.contexteDit({ contexte: { ...c, banc: null, statuts: R.statutsDesFacteurs(null) }, analyse: PRET, page: pageFotMob(), simulation: ETEINT, match: n });
  assert.equal(sansBanc.ouverture, 'Aujourd’hui, aucune de ces lignes ne change un pourcentage : ce sont des explications.');
  // Un facteur mesuré qui ne touche pas CE match : dit.
  const altLigne = dit.lignes.find((l) => l.facteur === 'altitude');
  assert.deepEqual([altLigne.concerne, altLigne.mentions[0]], [false, `ce match n’est pas concerné : pas de stade à ${(2000).toLocaleString('fr-FR')} m ou plus face à un visiteur d’en bas`]);
});

// ================================================================ T-E2 les pastilles

test('T-E2 les pastilles : « Effet mesuré » + « pas encore dans le pourcentage » pour les SEULS facteurs utiles au banc (repos, enchaînement, altitude), « Explication seulement » partout ailleurs — gris, jamais de vert ; sans note du banc, « pas encore mesuré » partout ; un démenti repasse en gris avec sa note ambre ; icône, mot, role="note" et phrase complète dans aria-label', options, async () => {
  const c = lecture('calendrier');
  const r = await carte(c);
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(r.appels, [], 'la carte ne lit rien elle-même');
  const lignes = lignesRendues(r.html);
  assert.deepEqual(Object.keys(lignes), ['repos', 'enchainement', 'deplacement', 'altitude', 'pelouse', 'meteo', 'arbitre', 'entraineur', 'enjeu']);
  for (const [f, html] of Object.entries(lignes)) {
    const mesure = ['repos', 'enchainement', 'altitude'].includes(f);
    assert.match(html, new RegExp(`data-pastille="${mesure ? 'mesure' : 'explication'}"`), f);
    const t = texteDe(html);
    if (mesure) {
      assert.ok(t.includes('Effet mesuré pas encore dans le pourcentage'), `${f} : ${t.slice(0, 200)}`);
      assert.match(html, /class="(?:is-mesure mcc__pastille|mcc__pastille is-mesure)" role="note" aria-label="[^"]+ : Effet mesuré, pas encore dans le pourcentage\."/);
    } else {
      assert.ok(t.includes('Explication seulement'), f);
      assert.doesNotMatch(html, VERT, `${f} : jamais de vert`);
      assert.match(html, /role="note" aria-label="[^"]+ : Explication seulement[^"]*\."/);
    }
  }
  assert.match(lignes.meteo, /aria-label="Météo : Explication seulement, non mesurable au banc d’essai\."/);
  // Sans note du banc : tout « Explication seulement », « pas encore mesuré au banc d’essai ».
  const sans = await carte({ ...c, banc: null, statuts: R.statutsDesFacteurs(null) });
  const ls = lignesRendues(sans.html);
  for (const [f, html] of Object.entries(ls)) {
    assert.doesNotMatch(html, VERT, f);
    if (!['meteo', 'enjeu'].includes(f)) assert.ok(texteDe(html).includes('Explication seulement pas encore mesuré au banc d’essai'), f);
  }
  assert.equal(compter(sans.html, /is-mesure/g), 0, 'aucun vert, même dans le tableau');
  // Un démenti sur vos matchs (la garde mensuelle) : gris, avec la note ambre.
  const dementi = await carte({ ...c, statuts: R.statutsDesFacteurs(CONTEXTE_AU_BANC, { 'repos-court': { le: '2027-03-01' } }) });
  const repos = lignesRendues(dementi.html).repos;
  assert.match(repos, /data-pastille="dementi"/);
  assert.doesNotMatch(repos.split('data-contexte="banc"')[0], /is-mesure/);
  assert.ok(texteDe(repos).includes('Explication seulement démenti sur vos matchs depuis le 01/03/2027'));
  // Le vert : seulement les trois pastilles des facteurs mesurés et leurs trois verdicts du tableau.
  assert.equal(compter(r.html, /class="(?:is-mesure mcc__pastille|mcc__pastille is-mesure)"/g), 6);
  assert.doesNotMatch(r.html, /ValueBadge|vbadge|cm-positive|cm-negative|is-danger"[^>]*data-pastille/);
});

// ================================================================ T-E3 la provenance

test('T-E3 la provenance de chaque ligne (§6.4) : magasin FotMob (calculé, l’heure de la nuit), calendrier de saison (lu), table des stades et liste des altitudes (un jour sans heure inventée), page FotMob du match (relevé), Simulation CôteMaster pour l’enjeu allumé ; le pied (la fiche, la page, les stades) ; l’ambre au-delà de 24 h', options, async () => {
  const c = lecture('calendrier');
  const recent = await carte(c, { heure: Date.parse(c.fiche.calculeLe) + 2 * 3_600_000 });
  const L = lignesRendues(recent.html);
  const prov = (html) => [...html.matchAll(/<span class="prov ([^"]+)" title="([^"]*)"[\s\S]*?<span class="prov__source">([\s\S]*?)<\/span>(?:<span class="prov__when">([\s\S]*?)<\/span>)?/g)].map((m) => ({ classe: m[1], titre: m[2], source: texteDe(m[3]), quand: texteDe(m[4] ?? '') }));
  const nuit = 'le 01/10 à 1 h 30';
  assert.deepEqual(prov(L.repos).map((p) => [p.source, p.quand]), [['magasin FotMob (feuilles des matchs déjà joués)', `calculé ${nuit}`]]);
  assert.deepEqual(prov(L.enchainement).map((p) => [p.source, p.quand]), [['calendrier de saison (FotMob)', `lu ${nuit}`]]);
  assert.deepEqual(prov(L.deplacement).map((p) => [p.source, p.quand]), [['table des stades (venues.json, faite depuis FotMob)', 'faite le 06/10/2026']]);
  assert.deepEqual(prov(L.altitude).map((p) => [p.source, p.quand]), [['liste des altitudes faite à la main (± 50 m)', 'faite le 06/10/2026']]);
  assert.deepEqual(prov(L.pelouse).map((p) => p.source), ['FotMob, page du match']);
  assert.deepEqual(prov(L.meteo).map((p) => p.source), ['FotMob, page du match']);
  assert.deepEqual(prov(L.arbitre).map((p) => [p.source, p.quand.startsWith('calculé') ? p.quand : 'relevé']), [['FotMob, page du match', 'relevé'], ['magasin FotMob (feuilles des matchs déjà joués)', `calculé ${nuit}`]]);
  assert.deepEqual(prov(L.entraineur).map((p) => p.source), ['magasin FotMob (feuilles des matchs déjà joués)']);
  assert.deepEqual(prov(L.enjeu), [], 'éteint : rien à dater');
  for (const p of [...prov(L.repos), ...prov(L.meteo)]) assert.match(p.classe, /is-recent/);
  assert.match(prov(L.repos)[0].titre, /Lu dans la base du magasin \(match-stats\.db\)\./);
  assert.match(prov(L.enchainement)[0].titre, /Lu dans data\/runtime\/season-calendar\.json\./);
  // Le pied : la fiche, la page FotMob, les stades.
  const piedHtml = recent.html.slice(recent.html.indexOf('class="mcc__pied"'), recent.html.indexOf('data-contexte="banc-d-essai"'));
  assert.deepEqual(prov(piedHtml).map((p) => p.source), ['Fiche : magasin FotMob', 'Page FotMob du match', 'Stades : venues.json']);
  assert.equal(prov(piedHtml)[0].quand, `calculée ${nuit}`);
  assert.equal(prov(piedHtml)[2].quand, 'faite le 06/10/2026');
  // 30 heures après la nuit : l'ambre (la nuit n'est pas repassée) ; la table des stades, un jour sans heure, jamais ancienne.
  const vieux = await carte(c, { heure: Date.parse(c.fiche.calculeLe) + 30 * 3_600_000 });
  const V = lignesRendues(vieux.html);
  assert.match(prov(V.repos)[0].classe, /is-ancien/);
  assert.match(prov(V.repos)[0].quand, /^calculé le 01\/10 à 1 h 30 · /);
  assert.match(prov(V.deplacement)[0].classe, /is-recent/, 'un jour seul : jamais « ancien »');
  // L'enjeu allumé : sa provenance, celle de l'étape 28.
  const allume = await carte(c, { simulation: { affichage: { saisons: 'allume', matchs: 'eteint' }, enjeu: { calcule: true, calculeLe: '2026-09-30T23:40:00.000Z', phrase: 'X joue l’Europe : 60 % en cas de victoire, 40 % en cas de défaite' } } });
  assert.deepEqual(prov(lignesRendues(allume.html).enjeu).map((p) => p.source), ['Simulation CôteMaster, classement FotMob']);
});

// ================================================================ T-E4 les états vides

test('T-E4 les états vides, dits en mots (jamais « 0 », jamais le silence) : hors fenêtre (« il paraîtra la nuit du 10/10 »), pas encore calculé, absent de la dernière nuit, clubs non reconnus (nommés), illisible, l’analyse en panne, un serveur d’avant l’étape 32, la lecture en cours ; TOUJOURS neuf lignes, chacune avec sa raison ; la météo et l’arbitre de la page FotMob restent lus', options, async () => {
  const cas = [
    [lecture('horsFenetre'), 'hors-fenetre', 'Le contexte se calcule chaque nuit pour les matchs des 14 prochains jours : il paraîtra la nuit du 10/10.', 'Repos : paraîtra la nuit du 10/10.'],
    [copie(serveur().premiereNuit), 'pas-encore-calcule', 'Pas encore calculé : la prochaine passe de nuit le fera.', 'Repos : pas encore calculé.'],
    [{ ...lecture('horsFenetre'), etat: 'pas-encore-calcule', raison: 'absent-de-la-derniere-nuit', paraitLe: null }, 'pas-encore-calcule', 'Pas encore calculé : la dernière passe de nuit (le 01/10) n’avait pas ce match dans le calendrier de saison ; la suivante le reprendra s’il y est.', 'Repos : pas encore calculé.'],
    [{ ...lecture('clubsInconnus'), clubs: { home: { id: null, nom: 'SV Elversberg' }, away: { id: 8456, nom: 'Lens' } } }, 'clubs-inconnus', 'Contexte indisponible : SV Elversberg n’est pas reconnu par son identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent).', 'Repos : club non reconnu.'],
    [lecture('clubsInconnus'), 'clubs-inconnus', `Contexte indisponible : ${lecture('clubsInconnus').clubs.home.nom} et ${lecture('clubsInconnus').clubs.away.nom} ne sont pas reconnus par leur identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent).`, 'Repos : club non reconnu.'],
    [copie(serveur().lectures.illisible), 'illisible', 'Contexte illisible : la base n’a pas répondu. Les autres cartes ne sont pas touchées.', 'Repos : illisible.']
  ];
  for (const [contexte, cle, note, repos] of cas) {
    const r = await carte(contexte);
    assert.deepEqual(r.avertissements, []);
    assert.match(r.html, new RegExp(`data-etat="${cle}"`));
    const t = espaces(r.texte);
    assert.ok(t.includes(espaces(note)), `${cle} : ${t.slice(0, 600)}`);
    const L = lignesRendues(r.html);
    assert.equal(Object.keys(L).length, 9, `${cle} : toujours neuf lignes`);
    assert.ok(texteDe(L.repos).includes(repos), `${cle} : ${texteDe(L.repos)}`);
    assert.ok(texteDe(L.meteo).includes('Prévision FotMob au coup d’envoi : 14 °C'), `${cle} : la météo de la page reste lue`);
    assert.ok(texteDe(L.arbitre).startsWith('Arbitre Explication seulement Jean Dupont (France) :'), `${cle} : ${texteDe(L.arbitre).slice(0, 120)}`);
    for (const html of Object.values(L)) assert.doesNotMatch(texteDe(html), /: 0\.|: 0 jour/);
  }
  // L'analyse : en cours, en panne, un serveur d'avant (le bloc manque).
  const enCours = await carte(undefined, { analyse: { loading: true, error: null, result: null } });
  assert.match(enCours.html, /data-etat="chargement"/);
  assert.ok(enCours.texte.includes('Lecture du contexte…'));
  assert.equal(Object.keys(lignesRendues(enCours.html)).length, 9);
  const panne = await carte(undefined, { analyse: { loading: false, error: 'Le moteur n’a pas pu analyser ce match.', result: null } });
  assert.ok(panne.texte.includes('L’analyse du moteur n’a pas répondu : le contexte arrive avec elle. Les autres cartes ne sont pas touchées.'));
  const avant = await carte(undefined, { analyse: { loading: false, error: null, result: { label: 'x' } } });
  assert.match(avant.html, /data-etat="serveur-a-relancer"/);
  assert.ok(avant.texte.includes('Le serveur n’est pas à jour : relancez demarrer-cotemaster.bat pour voir le contexte du match.'));
  assert.ok(texteDe(lignesRendues(avant.html).arbitre).includes('Jean Dupont (France) : '), 'la ligne de l’arbitre lit l’aperçu');
  // La page FotMob en lecture, puis en panne : dit sur chaque ligne qui la lit.
  const lue = await carte(lecture('calendrier'), { page: { loading: true, error: null, data: null } });
  assert.ok(texteDe(lignesRendues(lue.html).meteo).includes('Météo : lecture de la page FotMob…'));
  assert.ok(texteDe(lignesRendues(lue.html).arbitre).includes('Arbitre : lecture de la page FotMob…'));
  const ratee = await carte(lecture('calendrier'), { page: { loading: false, error: 'FotMob indisponible', data: null } });
  assert.ok(texteDe(lignesRendues(ratee.html).meteo).includes('Météo : la page FotMob du match n’a pas pu être lue.'));
});

// ================================================================ T-E5 une seule place

/** Le scénario de la page : les réponses du vrai serveur, l'analyse avec (ou sans) le bloc `contexte`, l'aperçu de l'étape 32. */
function scenarioDeLaPage({ contexte = 'calendrier', simulation = undefined, actualites = undefined, apercu = undefined } = {}) {
  const P = D.payloadsDuServeur();
  const a = copie(P.analyses['essai-a'].corps);
  if (contexte === null) delete a.contexte;
  else a.contexte = { ...lecture(contexte), clubs: { home: { id: 8456, nom: 'Man City' }, away: { id: 8650, nom: 'Liverpool' } } };
  if (simulation !== undefined) a.simulation = simulation;
  const ligne = { ...serveur().arbitres.connu.ligne, cle: 'Arbitre Essai|ENG', nom: 'Arbitre Essai', pays: 'ENG' };
  return {
    match: P.liste.corps.matches.find((m) => m.matchId === 'essai-a'),
    liste: P.liste.corps.matches,
    analyse: a,
    apercu: apercu ?? { ...D.apercu(), releveLe: '2026-10-05T11:58:00.000Z', arbitreAuMagasin: { nom: 'Arbitre Essai', pays: 'ENG', ligne, homonymes: [] } },
    fixture: P.fixtureA,
    saisies: P.saisiesA,
    conseil: P.conseil,
    ia: D.avisIA(P.analyses['essai-a'].corps),
    actualites
  };
}
const position = (html, id) => html.indexOf(`id="${id}"`);

test('T-E5 une seule place sur la page d’un match à venir : l’encadré après le verdict (et après « Enjeu »), avant « Pourquoi ce pourcentage » ; « Rencontre » garde le stade et la capacité — ni pelouse, ni météo, ni arbitre ; « Actualités d’équipe » sans le changement d’entraîneur ; le chiffre de l’enjeu seulement dans son encadré ; la page d’un match joué inchangée (MatchInfoPanel sans la propriété garde tout)', options, async () => {
  const coach = { previousCoach: 'Ancien Coach', currentCoach: 'Nouveau Coach', since: '2026-09-20T18:00:00.000Z' };
  scenario = scenarioDeLaPage({ actualites: { ...D.actualites(), home: { ...D.actualites().home, coachChange: coach } } });
  const r = await ctx.rendre(ctx.composants.Page, { matchId: 'essai-a' }, { heure: D.MAINTENANT });
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(interdits, []);
  const p = (id) => position(r.html, id);
  assert.ok(p('upcoming-verdict') < p('upcoming-contexte') && p('upcoming-contexte') < p('upcoming-pourquoi'), 'l’encadré entre le verdict et le pourquoi');
  // « Rencontre » : le stade et la capacité, rien d'autre.
  const tr = espaces(texteDe(carteAutour(r.html, r.html.indexOf('Stade et capacité publiés par FotMob.'))));
  assert.ok(tr.includes('Rencontre Stade et capacité publiés par FotMob.'), tr.slice(0, 300));
  assert.ok(tr.includes('Etihad Stadium') && tr.includes('Capacité'), tr.slice(0, 400));
  for (const absent of ['Type de terrain', 'Météo', 'km/h', 'Arbitre Essai', 'Cartons jaunes', 'Fautes']) assert.ok(!tr.includes(absent), `« Rencontre » sans ${absent}`);
  // L'arbitre, la météo et la pelouse : UNE seule place, l'encadré.
  const resume = r.html.slice(0, r.html.indexOf('class="upcoming__more"'));
  assert.equal(compter(texteDe(resume), /Arbitre Essai/g), 1, 'l’arbitre une seule fois');
  assert.equal(compter(texteDe(resume), /vent 43 km\/h/g), 1, 'la météo une seule fois');
  assert.ok(!texteDe(resume).includes('3,6 / match'), 'jamais les moyennes que FotMob affiche');
  // « Actualités d'équipe » : blessures et suspensions, plus l'entraîneur (même quand l'actualité en annonce un).
  const actu = texteDe(r.html.slice(r.html.indexOf('Actualités d&#39;équipe'), position(r.html, 'upcoming-courbe')));
  assert.ok(actu.includes('Actualités d\'équipe Blessures et suspensions d\'après FotMob, gratuit.'), actu.slice(0, 200));
  assert.ok(actu.includes('Liverpool Blessé'), 'les absents restent');
  assert.ok(!/Changement d.entraîneur|Nouveau Coach|Ancien Coach/.test(actu), 'pas d’entraîneur ici');
  // L'enjeu allumé : son chiffre dans SON encadré ; la ligne du contexte y renvoie sans le recopier.
  const phrase = 'Man City joue l’Europe : 60 % en cas de victoire, 40 % en cas de défaite';
  scenario = scenarioDeLaPage({ simulation: { affichage: { saisons: 'allume', matchs: 'eteint' }, enjeu: { calcule: true, categorie: 'gros-enjeu', libelle: 'Gros enjeu', phrase, calculeLe: '2026-10-05T01:00:00.000Z', quand: 'calculé la nuit du 05/10', loiPhrase: 'loi : forces de buts du modèle de buts en service' }, deroule: null } });
  const allume = await ctx.rendre(ctx.composants.Page, { matchId: 'essai-a' }, { heure: D.MAINTENANT });
  assert.deepEqual(allume.avertissements, []);
  assert.ok(position(allume.html, 'upcoming-enjeu') < position(allume.html, 'upcoming-contexte'), 'après « Enjeu »');
  assert.ok(texteDe(carteAutour(allume.html, position(allume.html, 'upcoming-enjeu'))).includes(phrase), 'le chiffre de l’enjeu dans son encadré');
  const ligneEnjeu = texteDe(lignesRendues(allume.html).enjeu);
  assert.ok(ligneEnjeu.includes('Enjeu au classement : voir l’encadré « Enjeu » juste au-dessus. Il n’entre dans aucun pourcentage.'), ligneEnjeu);
  assert.ok(!ligneEnjeu.includes('60 %') && !ligneEnjeu.includes('40 %'), 'la ligne du contexte ne recopie pas le chiffre');
  // La page d'un match joué : MatchDetailView passe le cadre sans la propriété ; le cadre garde alors tout.
  assert.match(lireUi('views', 'MatchDetailView.vue'), /<MatchInfoPanel :meta="entry\.meta" \/>/);
  const cadre = await ctx.rendre(ctx.composants.Cadre, { meta: D.apercu().meta });
  const tc = espaces(cadre.texte);
  for (const present of ['Etihad Stadium', 'Type de terrain', 'Gazon', 'Météo', 'vent 43 km/h', 'Arbitre Essai', 'Cartons jaunes']) assert.ok(tc.includes(present), `match joué : ${present}`);
  const sans = espaces((await ctx.rendre(ctx.composants.Cadre, { meta: D.apercu().meta, sansContexte: true })).texte);
  for (const absent of ['Type de terrain', 'Météo', 'km/h', 'Arbitre Essai']) assert.ok(!sans.includes(absent), `sans contexte : ${absent}`);
  assert.ok(sans.includes('Etihad Stadium') && sans.includes('Capacité'));
});

// ================================================================ T-E6 le tableau du banc

test('T-E6 le tableau « Ce que dit le banc d’essai » (replié) : TOUJOURS les neuf facteurs et le contrôle, leurs colonnes ; « non mesurable au banc » pour la météo et l’enjeu ; Σ des matchs jugés (un compte) et ⌀ de la part concernée sur les facteurs mesurés — jamais une somme de pourcentages ; le pied (matchs, période, essais, date)', options, async () => {
  const c = lecture('calendrier');
  const r = await carte(c);
  assert.match(r.html, /<details class="mcc__details" data-contexte="banc-d-essai"><summary class="mcc__resume">[\s\S]*?Ce que dit le banc d’essai<\/summary>/);
  const t = tableauDe(r.html, 'banc-du-contexte');
  assert.ok(t, 'le tableau');
  assert.deepEqual(entetes(t), ['Facteur', 'Ce qui a été mesuré', 'Matchs jugés', 'Part des matchs', 'Gain (fourchette)', 'Verdict']);
  const lignes = corps(t).map((l) => [...l.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => espaces(texteDe(m[1]))));
  assert.deepEqual(lignes.map((l) => l[0]), ['Repos', 'Enchaînement', 'Déplacement', 'Altitude', 'Pelouse', 'Météo', 'Arbitre', 'Entraîneur', 'Enjeu', 'Contrôle (faux facteur)']);
  const parFacteur = Object.fromEntries(lignes.map((l) => [l[0], l]));
  for (const f of ['Météo', 'Enjeu']) assert.deepEqual(parFacteur[f].slice(2), ['—', '—', '—', 'non mesurable au banc'], f);
  const v = (id) => CONTEXTE_AU_BANC.variantes.find((x) => x.id === id);
  assert.deepEqual(parFacteur.Repos.slice(1), ['repos de moins de 4 jours (un des deux clubs)', espaces((16870).toLocaleString('fr-FR')), '29,7 %', '+0,096 % (+0,039 % à +0,153 %)', 'Effet mesuré']);
  assert.deepEqual(parFacteur.Pelouse.slice(2), [espaces((2674).toLocaleString('fr-FR')), '4,7 %', `${MOINS}0,015 % (${MOINS}0,077 % à +0,048 %)`, 'pas prouvé']);
  assert.equal(parFacteur['Contrôle (faux facteur)'][5], 'pas prouvé');
  // Σ et ⌀ : sur les sept facteurs mesurés, sans le contrôle.
  const mesures = ['repos-court', 'enchainement-serre', 'deplacement-distance', 'deplacement-altitude', 'pelouse-synthetique', 'arbitre-buts', 'entraineur-nouveau'].map(v);
  const somme = mesures.reduce((s, x) => s + x.matchsConcernes, 0);
  const moyenne = mesures.reduce((s, x) => s + x.partConcernee, 0) / mesures.length;
  const pieds = pied(t).map((l) => [...l.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => espaces(texteDe(m[1]))));
  assert.deepEqual(pieds[0].slice(0, 3), ['Σ et ⌀ sur les 7 facteurs mesurés, sans le contrôle', `Σ ${espaces(somme.toLocaleString('fr-FR'))} matchs jugés (un match compte une fois par facteur)`, `⌀ ${(moyenne * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} % des matchs concernés par facteur`]);
  assert.ok(espaces(r.texte).includes(`Banc d’essai : ${espaces((56730).toLocaleString('fr-FR'))} matchs de juillet 2023 à septembre 2026, en deux moitiés — chacune jugée avec ce qui a été appris sur l’autre —, en tenant compte des 9 essais faits, seuil sévère (calcul du 29/10/2026). Le contrôle (un faux facteur tiré au hasard) sort « pas prouvé », comme il se doit.`));
  // Sans banc : les dix lignes restent, dites « pas encore mesuré ».
  const sans = await carte({ ...c, banc: null, statuts: R.statutsDesFacteurs(null) });
  const ts = tableauDe(sans.html, 'banc-du-contexte');
  assert.equal(corps(ts).length, 10);
  assert.ok(espaces(sans.texte).includes('Σ pas encore mesuré') && espaces(sans.texte).includes('Banc d’essai : pas encore passé.'));
});

// ================================================================ T-E7 le vent

test('T-E7 le vent en km/h (ventEnKmH du correctif du 28/10 : m/s × 3,6), « vent fort » à 9 m/s (32 km/h) ou plus — jamais en m/s ni la valeur brute', options, async () => {
  assert.match(lireUi('utils', 'contexteDuMatch.js'), /^import \{ meteo, ventEnKmH \} from '\.\/fotmobLabels\.js';$/m);
  assert.doesNotMatch(lireUi('utils', 'contexteDuMatch.js'), /m\/s'|\bm\/s\b[^)]/);
  const vent = (windSpeed) => U.phraseMeteo(pageFotMob({ meta: { windSpeed, weather: null } }));
  assert.equal(vent(9), 'Prévision FotMob au coup d’envoi : 14 °C, vent 32 km/h (vent fort).');
  assert.equal(vent(8.9), 'Prévision FotMob au coup d’envoi : 14 °C, vent 32 km/h.');
  assert.equal(vent(4), 'Prévision FotMob au coup d’envoi : 14 °C, vent 14 km/h.');
  assert.equal(vent(0), 'Prévision FotMob au coup d’envoi : 14 °C.');
  assert.equal(vent('illisible'), 'Prévision FotMob au coup d’envoi : 14 °C.');
  const r = await carte(lecture('calendrier'), { page: pageFotMob({ meta: { windSpeed: 9 } }) });
  const t = texteDe(lignesRendues(r.html).meteo);
  assert.ok(t.includes('vent 32 km/h (vent fort)'));
  assert.ok(!/vent 9 km\/h|m\/s/.test(t));
});

// ================================================================ T-E8 aucune requête de plus

test('T-E8 aucune requête de plus à l’ouverture de la page : avec ou sans le bloc `contexte`, les MÊMES lectures (l’analyse et l’aperçu portent tout) ; la carte n’importe aucun service ; le câblage de la page ; ui/DESIGN.md (le paragraphe « Depuis l’étape 32 »)', options, async () => {
  const guide = fs.readFileSync(path.join(UI, 'DESIGN.md'), 'utf8');
  for (const morceau of [
    "Depuis l'étape 32 du plan (29/10/2026, lot 1 en partie) : **le contexte du match**",
    '`components/analysis/MatchContextCard.vue`',
    '`data-bloc="contexte-du-match"`',
    'TOUJOURS les neuf lignes',
    'TOUJOURS suivi de « pas encore dans le pourcentage » au lot 1',
    'jamais de vert ni de rouge',
    'le vent TOUJOURS en km/h (`ventEnKmH`',
    '`data-tableau="banc-du-contexte"`',
    '**Une seule place par information**',
    '`MatchInfoPanel sans-contexte`',
    '`utils/contexteDuMatch.js` (pur, sans Vue'
  ]) assert.ok(guide.includes(morceau), `DESIGN.md, manque : ${morceau}`);
  assert.ok(guide.indexOf("Depuis l'étape 37 du plan") < guide.indexOf("Depuis l'étape 32 du plan") && guide.indexOf("Depuis l'étape 32 du plan") < guide.indexOf("Depuis l'étape 44 du plan"), 'à la suite du paragraphe de l’étape 37');
  scenario = scenarioDeLaPage({ contexte: null });
  const sans = await ctx.rendre(ctx.composants.Page, { matchId: 'essai-a' }, { heure: D.MAINTENANT });
  scenario = scenarioDeLaPage();
  const avec = await ctx.rendre(ctx.composants.Page, { matchId: 'essai-a' }, { heure: D.MAINTENANT });
  assert.deepEqual([...avec.appels].sort(), [...sans.appels].sort(), 'les mêmes lectures, une à une');
  assert.ok(avec.appels.some((u) => /\/api\/analysis\/match\//.test(u)) && avec.appels.some((u) => /\/api\/match-stats\/preview/.test(u)));
  assert.deepEqual(interdits, []);
  assert.match(sans.html, /data-etat="serveur-a-relancer"/, 'le serveur d’avant : dit');
  assert.match(avec.html, /data-etat="pret"/);
  const carteSource = lireUi('components', 'analysis', 'MatchContextCard.vue');
  assert.doesNotMatch(carteSource, /services\/|Api\b|fetch\(|onMounted/);
  assert.doesNotMatch(carteSource, /#[0-9a-fA-F]{3,6}\b|rgb\(\d/, 'des jetons seulement');
  const page = lireUi('views', 'UpcomingMatchView.vue');
  assert.match(page, /<MatchContextCard\n {10}id="upcoming-contexte"\n {10}class="upcoming__block"\n {10}:contexte="analyse\.result\?\.contexte"\n {10}:analyse="analyse"\n {10}:page="page"\n {10}:simulation="simulationDuMatch"\n {10}:match="match"\n {8}\/>/);
  assert.match(page, /<MatchInfoPanel :meta="meta" sans-contexte \/>/);
  assert.ok(page.indexOf('<EnjeuDuMatch') < page.indexOf('<MatchContextCard') && page.indexOf('<MatchContextCard') < page.indexOf('<PercentageWhyCard'));
});
