/**
 * La page « BULLETIN » SE REND (étape 45 du plan, 24/10/2026) : « l'IA à l'écran » — le budget Claude en tête, le bulletin du jour et le bilan
 * de la semaine, la fiabilité de l'IA marché par marché et championnat par championnat, les dossiers et les leçons de la mémoire de l'IA.
 *   node --test test/bulletinPageEcran.test.mjs        (depuis server/)
 *
 * Les réponses sont celles du VRAI serveur, produites dans des copies isolées de la base d'essai (heure figée au 05/10/2026, réseau coupé,
 * AUCUN appel à Claude : les textes viennent d'un faux Claude) :
 *   - le bulletin et le bilan : test/aides/script-bulletins-service.mjs, phase « ecran » (écrits, refusés par la garde des chiffres, trois
 *     essais ratés, rien à commenter, fichier illisible…) ;
 *   - le carnet de l'IA : test/aides/script-carnet-ia.mjs, phase « ecran » ;
 *   - l'index et les dossiers, le budget Claude : test/aides/script-bulletin-page.mjs, phases « resume » et « budget » (un extrait RÉEL de
 *     trois championnats et sept clubs : test/fixtures/dossiers-etape-45.json).
 * Le rendu est fait côté serveur, sans navigateur (test/aides/rendu.mjs) : `fetch` remplacé — seules les routes données répondent, tout le
 * reste est refusé et compté. Les attentes sont RECOMPTÉES ICI, à la main, sur les réponses du serveur — jamais avec la règle qu'on teste.
 *
 *  1. Les règles de la page (utils/pageBulletin.js, utils/indexDesDossiers.js) : bandeau, moyenne par marché, pied, états, choix, pieds de tableaux.
 *  2. La page, dans chacun de ses états : prête, rien d'écrit, un texte refusé par la garde des chiffres (seul son motif est montré), serveur
 *     en erreur, budget économe ou dépassé, dossier ouvert depuis l'adresse — ses tableaux toujours complets, Σ et ⌀ compris.
 *  3. Le câblage et l'hygiène : UN SEUL composant de budget, une route par source, aucune écriture, aucun appel à Claude, le menu, la route.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { UI, imp, interfacePrete, optionsDuRendu, ouvrirLeRendu, reglesPures, espaces, blocDe, corps, pied, entetes, tableauDe, tableaux, texteDe } from './aides/rendu.mjs';

const options = optionsDuRendu;
const P = await imp(path.join(UI, 'src', 'utils', 'pageBulletin.js'));
const I = await imp(path.join(UI, 'src', 'utils', 'indexDesDossiers.js'));
const DI = await imp(path.join(UI, 'src', 'utils', 'dossiersIA.js'));
const lireUi = (...chemin) => fs.readFileSync(path.join(UI, 'src', ...chemin), 'utf8');

/** Exécute une phase d'un script d'essai dans une copie neuve et rend son JSON. */
function lancer(nom, phase) {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', nom), { args: [phase], timeout: 300_000, env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' } });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}

const trouve = (html, motif, message) => assert.ok(motif.test(html), message ?? `motif absent : ${motif}`);
const absent = (html, motif, message) => assert.ok(!motif.test(html), message ?? `motif présent : ${motif}`);
const cellules = (ligne) => [...ligne.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => espaces(texteDe(m[1])));
const nombre = (n) => espaces(Number(n).toLocaleString('fr-FR'));
const virgule = (x, d = 1) => espaces(x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));

let B; // bulletin et bilan
let C; // carnet
let D; // index et dossiers
let G; // budget
let rendu;
let Page;
let Board;
let Carte;
before(async () => {
  B = lancer('script-bulletins-service.mjs', 'ecran');
  C = lancer('script-carnet-ia.mjs', 'ecran').reponses;
  D = lancer('script-bulletin-page.mjs', 'resume').reponses;
  G = lancer('script-bulletin-page.mjs', 'budget').reponses;
  if (!interfacePrete) return;
  rendu = await ouvrirLeRendu({ cibles: /(BulletinView|BulletinsPanel|ClaudeBudgetPanel|AiDossierCard)\.vue$/ });
  Page = (await rendu.charger('/src/views/BulletinView.vue')).default;
  Board = (await rendu.charger('/src/components/analysis/AiDossiersBoard.vue')).default;
  Carte = (await rendu.charger('/src/components/analysis/AiDossierCard.vue')).default;
});
after(async () => {
  await rendu?.fermer();
});

const ok = (corpsDeLaReponse) => ({ code: 200, corps: corpsDeLaReponse });
const ROUTES = {
  bulletins: /\/api\/match-ai-analysis\/bulletins$/,
  carnet: /\/api\/match-ai\/scorecard$/,
  index: /\/api\/match-ai-analysis\/dossiers\/resume$/,
  budget: /\/api\/claude-budget(\?force=1)?$/,
  equipe: /\/api\/match-ai-analysis\/dossiers\?club=/,
  ligue: /\/api\/match-ai-analysis\/dossiers\?league=/
};
/** Les quatre sources d'un état de la page, et les routes d'un dossier ouvert. */
const prete = () => ({ bulletins: ok(B.ecrits), carnet: ok(C.calcule), index: ok(D.calcule), budget: ok(G.normal) });
const page = (sources, { props = {}, dossiers = true } = {}) =>
  rendu.rendre(
    Page,
    props,
    [
      [ROUTES.bulletins, sources.bulletins],
      [ROUTES.carnet, sources.carnet],
      [ROUTES.index, sources.index],
      [ROUTES.budget, sources.budget],
      ...(dossiers ? [[ROUTES.equipe, ok(D.equipe)], [ROUTES.ligue, ok(D.ligue)]] : [])
    ]
  );

/** Ce que doit avoir TOUTE version de la page : son bandeau, ses quatre chiffres, ses cartes dans l'ordre, ses cinq tableaux, sa provenance. */
function structure(r) {
  const t = espaces(r.texte);
  assert.deepEqual(r.avertissements, [], 'aucun avertissement de Vue pendant le rendu');
  assert.deepEqual(rendu.interdits, [], 'aucune autre lecture que les routes de la page');
  trouve(r.html, /data-page="bulletin"/);
  assert.match(t, /^Bulletin\b/, 'la page commence par son titre');
  for (const k of ['bulletin', 'bilan', 'fiabilite', 'memoire']) trouve(r.html, new RegExp(`data-kpi="${k}"`), `le chiffre clé ${k}`);
  const ordre = ['budget-claude', 'textes-ia', 'fiabilite-ia', 'dossiers-ia', 'provenance'].map((b) => r.html.indexOf(`data-bloc="${b}"`));
  assert.ok(ordre.every((i) => i > 0), `les cinq blocs sont là : ${ordre}`);
  assert.deepEqual(ordre, [...ordre].sort((a, b) => a - b), 'dans l’ordre : budget, textes, fiabilité, dossiers, provenance');
  // Les tableaux, toujours là : les textes, la fiabilité (marché, championnat), les leçons (confirmées, retirées).
  for (const cle of ['textes', 'fiabilite-par-marche', 'fiabilite-par-championnat', 'lecons-confirmees', 'lecons-retirees']) {
    const tab = tableauDe(r.html, cle);
    assert.ok(tab, `le tableau ${cle} est toujours là`);
    assert.ok(entetes(tab).length >= 5, `${cle} : ses en-têtes`);
    assert.equal(pied(tab).length, 2, `${cle} : Σ et ⌀`);
    const [sigma, moy] = pied(tab).map((x) => espaces(texteDe(x)));
    assert.ok(/^Σ /.test(sigma), `${cle} : ${sigma}`);
    assert.ok(/^⌀ /.test(moy), `${cle} : ${moy}`);
  }
  // Aucun bouton qui lance un appel : « Tout relire », « Relire » (un par source), « Voir … de plus », le « ? » d'une aide, le nom d'une équipe
  // ou d'un championnat qui ouvre un dossier. Les boutons des listes déroulantes (AppSelect, `aria-haspopup`) ouvrent un choix, rien de plus.
  const boutons = [...r.html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].filter((m) => !/aria-haspopup/.test(m[1])).map((m) => espaces(texteDe(m[2])));
  for (const b of boutons) assert.ok(/^(Tout relire|Relire|Voir \d+ lignes? de plus|Replier la liste|\?)$/.test(b) || /title="Ouvrir le dossier/.test(r.html), `bouton inattendu : « ${b} »`);
  absent(r.html, /<form\b|<textarea\b|<input\b[^>]*type="(?:text|number|password)"/);
  return t;
}

// ================================================================================ 1. les règles de la page

test('règles : les quatre chiffres du bandeau — l’état des deux textes, les avis tenus, les leçons confirmées ; toujours quatre, même quand une lecture manque', () => {
  const lecture = (data, extra = {}) => ({ loading: false, error: null, data, ...extra });
  const k = P.chiffresClesDeLaPage({ bulletins: lecture(B.ecrits), scorecard: lecture(C.calcule), resume: lecture(D.calcule) });
  assert.deepEqual(k.map((x) => x.cle), ['bulletin', 'bilan', 'fiabilite', 'memoire']);
  assert.deepEqual([k[0].valeur, k[0].detail, k[0].ton], ['Écrit', 'lundi 5 octobre 2026', 'is-accent']);
  assert.deepEqual([k[1].valeur, k[1].detail], ['Écrit', 'du lundi 28 septembre au dimanche 4 octobre 2026']);
  const t = C.calcule.carnet.total;
  assert.equal(k[2].valeur, `${t.bilan.aiRight} sur ${t.bilan.aiVerdicts} (${virgule((100 * t.bilan.aiRight) / t.bilan.aiVerdicts)} %)`);
  assert.equal(espaces(k[2].detail), `${t.matchsJuges} matchs jugés · les avis « nuance » ne comptent pas`);
  assert.deepEqual([k[3].valeur, espaces(k[3].detail)], ['8', '21 retirées · 7 équipes · 3 championnats']);
  // Rien de lu, rien d'écrit, une panne : la tuile dit pourquoi, jamais un zéro inventé.
  const vide = P.chiffresClesDeLaPage({});
  assert.deepEqual(vide.map((x) => x.valeur), ['non lu', 'non lu', 'non lu', 'non lu']);
  const rien = P.chiffresClesDeLaPage({ bulletins: lecture(B.jamais), scorecard: lecture(C.absent), resume: lecture(D.absent) });
  assert.deepEqual(rien.map((x) => x.valeur), ['Pas encore écrit', 'Pas encore écrit', 'pas encore calculé', 'pas encore écrites']);
  const panne = P.chiffresClesDeLaPage({ bulletins: { loading: false, error: 'Le serveur est occupé.', data: null }, scorecard: { loading: true, error: null, data: null }, resume: lecture(null, { error: 'x' }) });
  assert.deepEqual(panne.map((x) => x.valeur), ['illisible', 'illisible', 'lecture…', 'illisible']);
  assert.equal(panne[0].detail, 'Le serveur est occupé.');
  assert.equal(panne[0].ton, 'is-warning');
  // Un texte refusé par la garde : il n'est pas écrit, la tuile dit « Pas encore écrit ».
  const refuse = P.chiffresClesDeLaPage({ bulletins: lecture(B.refuse) });
  assert.equal(refuse[0].valeur, 'Pas encore écrit');
});

test('règles : le ⌀ du tableau « Par marché » — la moyenne des seuls marchés qui ont des avis, chaque marché pèse autant ; jamais une somme de pourcentages', () => {
  const avec = C.calcule.carnet.types.filter((t) => t.bilan.aiVerdicts > 0);
  const m = P.moyenneDesMarches(C.calcule.carnet);
  assert.equal(m.marches, avec.length);
  assert.equal(m.comptes, virgule(avec.reduce((s, t) => s + t.bilan.aiVerdicts, 0) / avec.length));
  assert.equal(m.tenus, virgule(avec.reduce((s, t) => s + t.bilan.aiRight, 0) / avec.length));
  assert.equal(m.taux, `${virgule(avec.reduce((s, t) => s + (100 * t.bilan.aiRight) / t.bilan.aiVerdicts, 0) / avec.length)} %`);
  assert.notEqual(m.taux, `${virgule((100 * avec.reduce((s, t) => s + t.bilan.aiRight, 0)) / avec.reduce((s, t) => s + t.bilan.aiVerdicts, 0))} %`, 'la moyenne des taux n’est pas le taux du total');
  // Calculé à la main sur un cas simple : 2 marchés, 1 sur 2 et 3 sur 4 → 2 avis comptés en moyenne… (2 + 4) / 2 = 3, tenus (1 + 3) / 2 = 2, taux (50 + 75) / 2 = 62,5 %.
  const simple = P.moyenneDesMarches({ types: [{ bilan: { aiVerdicts: 2, aiRight: 1 } }, { bilan: { aiVerdicts: 4, aiRight: 3 } }, { bilan: { aiVerdicts: 0, aiRight: 0 } }] });
  assert.deepEqual(simple, { marches: 2, comptes: '3,0', tenus: '2,0', taux: '62,5 %' });
  assert.deepEqual(P.moyenneDesMarches(null), { marches: 0, comptes: '—', tenus: '—', taux: '—' }, 'sans avis, la moyenne n’est pas un zéro');
  assert.deepEqual(P.moyenneDesMarches({ types: [] }), { marches: 0, comptes: '—', tenus: '—', taux: '—' });
});

test('règles : le bouton « voir plus » du tableau par championnat, le pied de la page, les titres et le lien du carnet', () => {
  assert.equal(P.CHAMPIONNATS_MONTRES, 12);
  assert.equal(espaces(P.boutonDesAutres(76, 12, false)), 'Voir 64 lignes de plus');
  assert.equal(P.boutonDesAutres(76, 12, true), 'Replier la liste');
  assert.equal(P.boutonDesAutres(12, 12, false), null, 'rien à déplier');
  assert.equal(espaces(P.boutonDesAutres(13, 12, false)), 'Voir 1 ligne de plus');
  assert.deepEqual(Object.keys(P.SECTIONS), ['budget', 'textes', 'fiabilite', 'dossiers']);
  assert.equal(P.LIEN_DU_CARNET.to, '/historique-moteur');
  assert.equal(P.LIEN_DU_BUDGET.to, '/reglages');
  const pied = P.piedDeLaPage({ bulletins: { data: B.ecrits }, scorecard: { data: C.calcule }, resume: { data: D.calcule } });
  assert.deepEqual(pied.map((p) => p.cle), ['bulletins', 'budget', 'carnet', 'dossiers']);
  assert.equal(pied[0].fichier, B.ecrits.fichier);
  assert.match(pied[0].quand, /^dernier texte écrit le 05\/10 à 06 h 10$/);
  assert.match(pied[2].quand, /^calculé le 05\/10 à 14 h 00$/);
  assert.match(pied[3].quand, /^écrit le 23\/10 à 01 h 29$/);
  assert.equal(P.piedDeLaPage({})[2].quand, 'non lu');
  assert.equal(P.piedDeLaPage({ resume: { data: D.absent } })[3].quand, 'pas encore écrit');
  reglesPures('pageBulletin.js');
  reglesPures('indexDesDossiers.js');
});

test('règles : l’état de l’index des dossiers — chargement, pas lu, jamais écrit, autre forme, sans leçon, prêt, serveur à relancer, illisible', () => {
  const e = (a) => I.etatDeLIndex(a).cle;
  assert.equal(e({ chargement: true }), 'chargement');
  assert.equal(e({}), 'non-lu');
  assert.equal(e({ reponse: D.absent }), 'jamais');
  assert.equal(e({ reponse: D.autreVersion }), 'autre-version');
  assert.equal(e({ reponse: D.calcule }), 'pret');
  assert.equal(e({ reponse: { ...D.calcule, totaux: { ...D.calcule.totaux, confirmees: 0, retirees: 0 } } }), 'sans-lecon');
  assert.equal(e({ erreur: 'Le serveur n’est pas à jour : relancez demarrer-cotemaster.bat pour activer cette fonction.' }), 'pas-a-jour-serveur');
  assert.equal(e({ erreur: 'Les dossiers de l’IA sont illisibles pour l’instant.' }), 'erreur');
  assert.equal(e({ erreur: 'x', reponse: D.calcule }), 'pret', 'une relecture ratée garde les derniers dossiers : l’erreur se dit à part');
  assert.match(I.etatDeLIndex({ reponse: { ...D.calcule, totaux: { confirmees: 0, retirees: 0 } } }).texte, /au moins 3 pour une équipe, 10 pour un championnat/);
  assert.match(I.resumeDeLIndex(D.calcule), /^Dossiers écrits : 7 équipes, 3 championnats · leçons gardées : 8 confirmées, 21 retirées · en tout : 8 confirmées, 55 retirées, 135 en attente du carnet$/);
  assert.equal(I.resumeDeLIndex(null), 'Rien à compter : les dossiers ne sont pas lus.');
  const p = I.provenanceDeLIndex(D.calcule);
  assert.equal(p.source, 'Écrit par le code · magasin FotMob et carnet de l’IA');
  assert.equal(p.releveLe, D.calcule.calculeLe);
  assert.equal(p.fichier, 'data/runtime/ai-dossiers.json');
});

test('règles : les choix du dossier — championnats favoris d’abord et étoilés, équipes du championnat choisi après « Le championnat seul »', () => {
  const favoris = new Set(['EPL']);
  const parFavori = (l) => [...l.filter((o) => favoris.has(o.league ?? o.label)), ...l.filter((o) => !favoris.has(o.league ?? o.label))];
  const o = I.optionsDesChampionnats(D.calcule, { favorisEnPremier: parFavori, estFavori: (n) => favoris.has(n) });
  assert.deepEqual(o.map((x) => x.value), ['EPL', 'Brazil Série A', 'Championship']);
  assert.deepEqual(o.map((x) => x.group), ['Favoris', 'Tous les championnats', 'Tous les championnats']);
  assert.equal(o[0].favorite, true);
  assert.equal(espaces(o[1].hint), '3 équipes · 2 leçons');
  const sans = I.optionsDesChampionnats(D.calcule);
  assert.deepEqual(sans.map((x) => x.value), ['Brazil Série A', 'Championship', 'EPL']);
  assert.ok(sans.every((x) => x.group === undefined), 'sans favori, pas de groupes');
  const eq = I.optionsDesEquipes(D.calcule, 'Brazil Série A');
  assert.deepEqual(eq.map((x) => [x.value, x.label]), [['', 'Le championnat seul'], ['fotmob-10272', 'Atlético-MG'], ['fotmob-109705', 'RB Bragantino'], ['fotmob-10277', 'São Paulo']]);
  assert.equal(espaces(eq[3].hint), '1 confirmée · 0 retirée');
  assert.deepEqual(I.optionsDesEquipes(D.calcule, ''), [], 'sans championnat, aucune équipe à choisir');
  assert.equal(I.equipeDeLIndex(D.calcule, 'fotmob-10277').nom, 'São Paulo');
  assert.equal(I.equipeDeLIndex(D.calcule, 'fotmob-1'), null);
});

test('règles : les lignes et le pied des tableaux de leçons — recomptés à la main sur l’extrait réel', () => {
  const lignes = I.lignesDesLeconsDeLIndex(D.calcule.lecons.confirmees);
  assert.equal(lignes.length, 8);
  const l = lignes.find((x) => x.portee.id === 'fotmob-10277');
  assert.equal(l.jour, '02/10/2026');
  assert.equal(l.confirmeeLe, '22/10/2026');
  assert.equal(l.marche, 'Corners — São Paulo');
  assert.equal(l.pronostic, 'São Paulo — Moins de 8.5 corners (pas passé)');
  assert.equal(l.sens, 'le moteur s’y est trompé');
  assert.match(l.preuve, /^sur 4 matchs suivants, le moteur annonçait 78 % en moyenne ; c’est passé 2 fois sur 8$/);
  assert.equal(l.porteeDite, 'équipe : São Paulo');
  assert.equal(lignes.find((x) => x.porteeGenre === 'championnat').porteeDite.startsWith('championnat : '), true);
  // Σ : 8 lignes, 7 leçons différentes (la leçon de São Paulo est gardée deux fois), 1 chez une équipe, 7 chez un championnat.
  const f = FIXTURE_PREUVES(D.calcule.lecons.confirmees);
  const p = I.piedDesLecons(lignes, { genre: 'confirmees', gardees: 8, enTout: 8 });
  assert.equal(p.sigma, '8 lignes confirmées · 7 leçons différentes · 1 chez une équipe, 7 chez un championnat');
  assert.equal(p.moyenne, `${virgule(f.moyenneMatchs)} matchs suivants comptés par leçon`);
  // Une liste plafonnée et un total « en tout » plus grand : dits.
  const retirees = I.lignesDesLeconsDeLIndex(D.calcule.lecons.retirees);
  const pr = I.piedDesLecons(retirees, { genre: 'retirees', gardees: 21, enTout: 55 });
  assert.match(pr.sigma, /^21 lignes retirées · \d+ leçons différentes · 1 chez une équipe, 20 chez un championnat · 55 retirées en tout$/);
  const court = I.piedDesLecons(retirees.slice(0, 5), { genre: 'retirees', gardees: 21, enTout: 55 });
  assert.match(court.sigma, /^5 lignes retirées \(les 5 plus récentes sur 21\)/);
  // Sans ligne : la structure reste, la moyenne n'est pas un zéro.
  assert.deepEqual(I.piedDesLecons([], { genre: 'confirmees' }), { sigma: '0 ligne confirmée', moyenne: '—' });
  assert.deepEqual(I.lignesDesLeconsDeLIndex(null), []);
});

/** Les matchs suivants comptés par leçon, recomptés sur les lignes de la route (la moyenne du pied). */
function FIXTURE_PREUVES(liste) {
  const m = liste.map((x) => x.preuve.matchs);
  return { moyenneMatchs: m.reduce((a, x) => a + x, 0) / m.length };
}

// ================================================================================ 2. la page, dans chacun de ses états

test('page — tout est prêt : le bandeau, le budget, les deux textes avec leur preuve, la fiabilité marché par marché et championnat par championnat, les leçons datées', options, async () => {
  const r = await page(prete());
  const t = structure(r);
  // Le bandeau : le jour, les quatre chiffres clés.
  trouve(r.html, /data-jour/);
  assert.ok(t.includes('lundi 5 octobre 2026'));
  const kpi = (cle) => espaces(texteDe(new RegExp(`<div[^>]*data-kpi="${cle}"[\\s\\S]*?</div>`).exec(r.html)[0]));
  assert.equal(kpi('bulletin'), 'Bulletin du jour Écrit lundi 5 octobre 2026');
  assert.equal(kpi('bilan'), 'Bilan de la semaine Écrit du lundi 28 septembre au dimanche 4 octobre 2026');
  const total = C.calcule.carnet.total;
  assert.equal(kpi('fiabilite'), `Avis de l’IA tenus ${total.bilan.aiRight} sur ${total.bilan.aiVerdicts} (${virgule((100 * total.bilan.aiRight) / total.bilan.aiVerdicts)} %) ${total.matchsJuges} matchs jugés · les avis « nuance » ne comptent pas`);
  assert.equal(kpi('memoire'), 'Leçons confirmées 8 21 retirées · 7 équipes · 3 championnats');
  // Une lecture par route, jamais deux : le bulletin n'est lu qu'une fois (la page le donne à la carte), le budget par son composant.
  const appels = r.appels.map((a) => a.replace('http://localhost:4000/api', ''));
  assert.deepEqual(appels.sort(), ['GET /claude-budget', 'GET /match-ai-analysis/bulletins', 'GET /match-ai-analysis/dossiers/resume', 'GET /match-ai/scorecard']);
  // Le budget en tête : les deux jauges et le plafond, ceux du serveur.
  const bud = espaces(texteDe(blocDe(r.html, 'budget-claude')));
  assert.ok(bud.includes('Budget Claude') && bud.includes('Mode normal') && bud.includes('réglage provisoire, à confirmer'));
  const jour = G.normal.aujourdhui;
  assert.ok(bud.includes(`${nombre(jour.tokens.total)} tokens sur ${nombre(jour.budget)}`), bud.slice(0, 600));
  assert.ok(bud.includes(`${nombre(G.normal.cetteSemaine.tokens.total)} tokens sur ${nombre(G.normal.cetteSemaine.budget)}`));
  assert.ok(bud.includes('Aujourd\'hui') && bud.includes('Cette semaine') && bud.includes('Plafond quotidien'));
  assert.ok(bud.includes(`${G.normal.plafond.aujourdhui} / ${G.normal.plafond.limite}`), 'le plafond de 150 rappelé, avec ce qui est pris');
  trouve(blocDe(r.html, 'budget-claude'), /href="\/reglages"/, 'le détail et le réglage restent dans Réglages');
  // Les deux textes : le texte de l'IA, la provenance réelle, les tokens, la preuve (la garde), la fiche.
  const txt = espaces(texteDe(blocDe(r.html, 'textes-ia')));
  const b = B.ecrits.bulletin;
  const w = B.ecrits.bilan;
  for (const x of [b.texte.titre, b.texte.resume, ...b.texte.sections.flatMap((s) => [s.titre, s.texte]), b.texte.aRetenir, w.texte.titre, w.texte.resume]) assert.ok(txt.includes(x), x);
  assert.ok(txt.includes('Claude Sonnet, par Claude Code (quota de l’abonnement)'));
  assert.ok(txt.includes(`${nombre(b.usage.total)} tokens`) && txt.includes('mode normal'));
  assert.ok(txt.includes(`${nombre(b.garde.nombresVus)} nombres cités, tous dans la fiche (${nombre(b.garde.nombresDeLaFiche)} nombres)`));
  assert.ok(!/Cotes marché|Odds API/.test(t));
  trouve(r.html, /data-fiche="bulletin"/);
  // La fiabilité : les onze marchés, leur Σ et leur ⌀ recomptés.
  const marches = tableauDe(r.html, 'fiabilite-par-marche');
  assert.deepEqual(entetes(marches), ['Marché', 'Avis comptés', 'Avis tenus', 'Face au moteur seul', 'État']);
  const lignesMarches = corps(marches).map(cellules);
  assert.equal(lignesMarches.length, 11, 'toujours les onze types de marché');
  assert.deepEqual(lignesMarches.map((x) => x[0]), C.calcule.typesDeMarche.map((x) => x.label), 'les onze types, dans l’ordre du serveur');
  for (const type of C.calcule.carnet.types) {
    const ligne = lignesMarches.find((x) => x[0] === type.label);
    assert.ok(ligne, type.label);
    assert.equal(ligne[1], nombre(type.bilan.aiVerdicts), `${type.label} : avis comptés`);
    assert.equal(ligne[2], type.bilan.aiVerdicts ? `${type.bilan.aiRight} sur ${type.bilan.aiVerdicts} (${virgule((100 * type.bilan.aiRight) / type.bilan.aiVerdicts)} %)` : 'aucun avis compté', `${type.label} : avis tenus`);
  }
  const vides = lignesMarches.filter((x) => x[1] === '0');
  assert.equal(vides.length, 11 - C.calcule.carnet.types.length);
  assert.ok(vides.every((x) => x[2] === 'aucun avis compté'), 'un marché sans avis le dit');
  const [sigmaM, moyM] = pied(marches).map(cellules);
  assert.deepEqual(sigmaM.slice(0, 3), ['Σ Tous les marchés', nombre(total.bilan.aiVerdicts), `${total.bilan.aiRight} sur ${total.bilan.aiVerdicts} (${virgule((100 * total.bilan.aiRight) / total.bilan.aiVerdicts)} %)`]);
  const avec = C.calcule.carnet.types.filter((x) => x.bilan.aiVerdicts > 0);
  assert.deepEqual(moyM.slice(0, 3), [`⌀ Par marché (${avec.length} avec des avis)`, virgule(avec.reduce((s, x) => s + x.bilan.aiVerdicts, 0) / avec.length), `${virgule(avec.reduce((s, x) => s + x.bilan.aiRight, 0) / avec.length)} tenus · ${virgule(avec.reduce((s, x) => s + (100 * x.bilan.aiRight) / x.bilan.aiVerdicts, 0) / avec.length)} %`]);
  // Par championnat : douze lignes montrées d'abord, le reste se déplie ; Σ et ⌀ sur toutes les lignes.
  const ligues = tableauDe(r.html, 'fiabilite-par-championnat');
  assert.deepEqual(entetes(ligues), ['Championnat', 'Marché', 'Avis comptés', 'Avis tenus', 'État']);
  const toutes = C.calcule.carnet.parChampionnat;
  assert.equal(corps(ligues).length, 12);
  const [sigmaL, moyL] = pied(ligues).map(cellules);
  assert.equal(sigmaL[0], `Σ Total (${toutes.length} lignes)`);
  assert.equal(sigmaL[1], nombre(toutes.reduce((s, x) => s + x.bilan.aiVerdicts, 0)));
  assert.match(moyL[0], /^⌀ Par ligne/);
  assert.equal(moyL[1], virgule(toutes.reduce((s, x) => s + x.bilan.aiVerdicts, 0) / toutes.length));
  assert.equal(espaces(texteDe(/data-autres[^>]*>([\s\S]*?)<\/button>/.exec(r.html)[1])), `Voir ${toutes.length - 12} lignes de plus`);
  // Le carnet complet reste à sa place : un lien, et les mêmes mots de provenance que le bloc d'Historique moteur.
  trouve(blocDe(r.html, 'fiabilite-ia'), /href="\/historique-moteur"/);
  const fiab = espaces(texteDe(blocDe(r.html, 'fiabilite-ia')));
  assert.ok(fiab.includes(P.PROVENANCE_DU_CARNET.source) && fiab.includes('Voir le carnet complet dans Historique moteur'));
  // Les leçons : 8 confirmées, 21 retirées, Σ et ⌀ recomptés, deux logos par match d'origine.
  const conf = tableauDe(r.html, 'lecons-confirmees');
  assert.deepEqual(entetes(conf), ['Jour', 'Match d’origine', 'Marché et pronostic', 'Leçon', 'Ce que le carnet a vu', 'Gardée par', 'Confirmée le']);
  const lignesConf = corps(conf);
  assert.equal(lignesConf.length, D.calcule.lecons.confirmees.length);
  const premiere = cellules(lignesConf[0]);
  const l0 = D.calcule.lecons.confirmees[0];
  assert.equal(premiere[0], `${l0.date.slice(8, 10)}/${l0.date.slice(5, 7)}/${l0.date.slice(0, 4)}`);
  assert.ok(premiere[1].includes(l0.match.home) && premiere[1].includes(l0.match.away));
  assert.ok(premiere[3].startsWith('« ') && premiere[3].includes(l0.texte));
  assert.equal(premiere[6], '22/10/2026');
  assert.equal([...lignesConf[0].matchAll(/class="crest"/g)].length >= 2, true, 'les deux logos du match d’origine');
  const [sigmaC, moyC] = pied(conf).map(cellules);
  assert.equal(sigmaC[1], '8 lignes confirmées · 7 leçons différentes · 1 chez une équipe, 7 chez un championnat');
  assert.equal(moyC[1], `${virgule(D.calcule.lecons.confirmees.reduce((s, x) => s + x.preuve.matchs, 0) / 8)} matchs suivants comptés par leçon`);
  assert.equal(corps(tableauDe(r.html, 'lecons-retirees')).length, 21);
  // Aucun dossier n'est ouvert tant qu'on n'a pas choisi : la page le dit, et ne lit aucun dossier.
  trouve(r.html, /data-raison="sans-choix"/);
  assert.ok(!r.appels.some((a) => /dossiers\?/.test(a)));
  // La provenance en pied : quatre sources, leur fichier réel.
  const prov = espaces(texteDe(blocDe(r.html, 'provenance', 'div')));
  for (const cle of ['bulletins', 'budget', 'carnet', 'dossiers']) trouve(r.html, new RegExp(`data-source="${cle}"`));
  assert.ok(prov.includes('data/runtime/carnet-ia.json') && prov.includes('data/runtime/ai-dossiers.json') && prov.includes('journal-claude'));
  assert.ok(prov.includes('jamais le pourcentage de l’abonnement'));
});

test('page — rien n’est encore écrit ni calculé : la raison est dite partout, les cinq tableaux restent, Σ à zéro et ⌀ sans valeur', options, async () => {
  const r = await page({ bulletins: ok(B.jamais), carnet: ok(C.absent), index: ok(D.absent), budget: ok(G.vide) });
  const t = structure(r);
  assert.ok(t.includes('Pas encore écrit'));
  const kpi = (cle) => espaces(texteDe(new RegExp(`<div[^>]*data-kpi="${cle}"[\\s\\S]*?</div>`).exec(r.html)[0]));
  assert.equal(kpi('fiabilite'), 'Avis de l’IA tenus pas encore calculé le carnet se remplit à la prochaine actualisation');
  assert.equal(kpi('memoire'), 'Leçons confirmées pas encore écrites les dossiers s’écrivent à la prochaine passe de nuit');
  // Le carnet : « Pas encore calculé », onze marchés toujours là, ⌀ sans valeur.
  assert.ok(espaces(texteDe(blocDe(r.html, 'fiabilite-ia'))).includes('Pas encore calculé'));
  const marches = tableauDe(r.html, 'fiabilite-par-marche');
  assert.equal(corps(marches).length, 11);
  assert.ok(corps(marches).map(cellules).every((x) => x[1] === '0' && x[2] === 'aucun avis compté'));
  assert.deepEqual(pied(marches).map(cellules).map((x) => x[0]), ['Σ Tous les marchés', '⌀ Par marché']);
  assert.deepEqual(cellules(pied(marches)[1]).slice(1, 3), ['—', '—'], 'la moyenne n’est pas un zéro');
  const ligues = tableauDe(r.html, 'fiabilite-par-championnat');
  assert.match(espaces(texteDe(corps(ligues)[0])), /Aucun championnat : aucun avis réglé pour l’instant\./);
  assert.equal(cellules(pied(ligues)[0])[0], 'Σ Total (0 ligne)');
  absent(r.html, /data-autres/, 'rien à déplier');
  // Les dossiers : « pas encore écrits », deux tableaux vides avec leur pied.
  const dossiers = blocDe(r.html, 'dossiers-ia');
  trouve(dossiers, /data-raison="jamais"/);
  assert.equal(espaces(texteDe(corps(tableauDe(r.html, 'lecons-confirmees'))[0])), 'aucune leçon confirmée pour l’instant');
  assert.equal(espaces(texteDe(corps(tableauDe(r.html, 'lecons-retirees'))[0])), 'aucune leçon retirée');
  assert.deepEqual(pied(tableauDe(r.html, 'lecons-confirmees')).map(cellules), [['Σ Total', '0 ligne confirmée'], ['⌀ Moyenne', '—']]);
  // Les textes : « pas encore de texte », rien d'inventé.
  const txt = espaces(texteDe(blocDe(r.html, 'textes-ia')));
  assert.ok(txt.includes('Pas encore de texte.'));
  assert.ok(!/Claude Sonnet, par Claude Code/.test(txt), 'aucune provenance pour un texte qui n’existe pas');
  // Le budget : « 0 tokens », le plafond coupé, le journal vide.
  const bud = espaces(texteDe(blocDe(r.html, 'budget-claude')));
  assert.ok(bud.includes('0 tokens sur') && bud.includes('analyses automatiques coupées'));
});

test('page — un texte REFUSÉ par la garde des chiffres n’est JAMAIS montré : seul son motif l’est (les nombres absents de la fiche), jamais la phrase refusée', options, async () => {
  const refus = B.refuse.essais.bulletin[0];
  assert.equal(refus.type, 'chiffres');
  const extrait = refus.refuses[0].extrait;
  assert.ok(extrait.length > 20 && refus.refuses[0].nombre === '4321,7', 'le serveur garde l’extrait refusé : il est dans la réponse, l’écran ne doit pas le montrer');
  const r = await page({ bulletins: ok(B.refuse), carnet: ok(C.calcule), index: ok(D.calcule), budget: ok(G.depasse) });
  const t = structure(r);
  assert.ok(!r.html.includes(extrait), 'la phrase refusée n’est nulle part dans la page (ni texte, ni attribut)');
  assert.ok(!r.html.includes('invente une cote'), 'ni un morceau de la phrase refusée');
  assert.ok(t.includes('texte refusé : chiffres absents de la fiche (4321,7)'), 'le motif est dit');
  trouve(r.html, /data-essais/);
  assert.ok(t.includes('Essai 1 raté à 14 h 00'));
  const kpi = (cle) => espaces(texteDe(new RegExp(`<div[^>]*data-kpi="${cle}"[\\s\\S]*?</div>`).exec(r.html)[0]));
  assert.ok(kpi('bulletin').startsWith('Bulletin du jour Pas encore écrit'));
  absent(r.html, /data-fiche="bulletin"/, 'pas de fiche dépliable pour un texte qui n’existe pas');
  assert.ok(!/Claude Sonnet, par Claude Code/.test(espaces(texteDe(blocDe(r.html, 'textes-ia')))));
  // Un bilan raté par une panne de Claude : dit aussi.
  assert.ok(t.includes('Claude Code n’a pas répondu'));
  // Trois essais ratés : l'abandon est dit.
  const abandon = await page({ ...prete(), bulletins: ok(B.abandon) });
  assert.ok(espaces(abandon.texte).includes('Abandonné'));
  assert.equal(abandon.html.includes('invente une cote'), false);
  // Rien à commenter : aucun appel, dit.
  const rien = await page({ ...prete(), bulletins: ok(B.rien) });
  assert.ok(espaces(rien.texte).includes('Rien à commenter'));
});

test('page — le dernier texte d’hier reste lisible, dit pour ce qu’il est ; les analyses automatiques coupées sont dites', options, async () => {
  const r = await page({ ...prete(), bulletins: ok(B.hier) });
  const t = structure(r);
  assert.match(t, /Le dernier texte écrit, 04\/10\/2026 :/);
  assert.ok(t.includes(B.hier.dernierBulletin.texte.titre));
  const coupe = await page({ ...prete(), bulletins: ok(B.coupe) });
  structure(coupe);
});

test('page — le serveur en erreur (textes illisibles, carnet illisible, dossiers illisibles, budget en panne) : chaque raison est dite, aucune carte ne disparaît', options, async () => {
  const r = await page({
    bulletins: { code: B.illisible.code, corps: B.illisible.corps },
    carnet: { code: C.codeIllisible, corps: C.illisible },
    index: { code: 503, corps: D.illisible },
    budget: { code: 500, corps: { error: 'Le journal du budget est occupé.' } }
  });
  const t = structure(r);
  assert.equal(B.illisible.code, 503);
  assert.ok(t.includes('Bulletin et bilan illisibles'));
  assert.ok(t.includes('Carnet de l’IA indisponible'));
  trouve(blocDe(r.html, 'dossiers-ia'), /data-raison="erreur"/);
  assert.ok(t.includes('Budget Claude illisible') && t.includes('Le journal du budget est occupé.'));
  const kpi = (cle) => espaces(texteDe(new RegExp(`<div[^>]*data-kpi="${cle}"[\\s\\S]*?</div>`).exec(r.html)[0]));
  for (const cle of ['bulletin', 'bilan', 'fiabilite', 'memoire']) assert.ok(kpi(cle).includes('illisible'), `${cle} : ${kpi(cle)}`);
  // Le serveur d'avant l'étape : « Route introuvable » devient « Serveur à relancer » pour les dossiers.
  const ancien = await page({ ...prete(), index: { code: 404, corps: { error: 'Route introuvable : GET /api/match-ai-analysis/dossiers/resume' } } });
  structure(ancien);
  trouve(blocDe(ancien.html, 'dossiers-ia'), /data-raison="pas-a-jour-serveur"/);
  assert.ok(espaces(ancien.texte).includes('relancez demarrer-cotemaster.bat'));
});

test('page — le budget économe, choisi puis imposé par un jour dépassé : la jauge change de ton et le mode est dit, le plafond de 150 reste', options, async () => {
  const choisi = await page({ ...prete(), budget: ok(G.economeChoisi) });
  structure(choisi);
  let bud = espaces(texteDe(blocDe(choisi.html, 'budget-claude')));
  assert.ok(bud.includes('Mode économe') && bud.includes('choisi dans Réglages (économe tout le temps)'));
  assert.ok(!bud.includes('réglage provisoire'), 'un budget enregistré n’est plus provisoire');
  const depasse = await page({ ...prete(), budget: ok(G.depasse) });
  structure(depasse);
  bud = espaces(texteDe(blocDe(depasse.html, 'budget-claude')));
  assert.ok(bud.includes('Mode économe'));
  assert.ok(bud.includes('110 % du budget du jour (11 000 / 10 000 tokens)'));
  assert.ok(bud.includes('11 000 tokens sur 10 000 (110 %)'), 'la jauge du jour dépasse le budget et le dit');
  assert.ok(bud.includes('11 000 tokens sur 12 000 (91,6 %)'));
  const bloc = blocDe(depasse.html, 'budget-claude');
  trouve(bloc, /class="is-danger cbud__jauge cm-block"/, 'le jour dépassé passe en rouge');
  trouve(bloc, /class="is-warning cbud__jauge cm-block"/, 'la semaine à 91,6 % passe en ambre');
  assert.ok(bud.includes('Inchangé par le budget : la seule limite dure'), 'le plafond de 150 est rappelé, pas touché');
});

test('page — un dossier ouvert depuis l’adresse : l’équipe (le composant de la page d’une équipe, repris tel quel) ou le championnat seul', options, async () => {
  await rendu.routeur.push({ path: '/bulletin', query: { championnat: 'Brazil Série A', equipe: 'fotmob-10277' } });
  try {
    const avecEquipe = await page(prete());
    structure(avecEquipe);
    assert.ok(avecEquipe.appels.some((a) => /dossiers\?club=fotmob-10277$/.test(a)), 'le dossier de l’équipe est lu par son identifiant FotMob');
    const carte = blocDe(avecEquipe.html, 'memoire-ia');
    assert.ok(carte, 'le bloc « Mémoire de l’IA » de la page d’une équipe');
    assert.ok(espaces(texteDe(carte)).includes('São Paulo'));
    trouve(avecEquipe.html, /data-etat="pret"/);
    absent(avecEquipe.html, /data-raison="sans-choix"/);
    // Le championnat seul : le dossier du championnat, sans les morceaux d'un club.
    await rendu.routeur.push({ path: '/bulletin', query: { championnat: 'Brazil Série A' } });
    const seul = await page(prete());
    structure(seul);
    assert.ok(seul.appels.some((a) => /dossiers\?league=Brazil%20S%C3%A9rie%20A$/.test(a)));
    const carteSeule = blocDe(seul.html, 'memoire-ia');
    assert.match(carteSeule, /data-portee="championnat"/);
    const txt = espaces(texteDe(carteSeule));
    assert.ok(txt.includes('Le championnat') && txt.includes('Brazil Série A'));
    assert.match(txt, /Matchs pris en compte jusqu’au 18\/10/, 'le dernier jour pris en compte, lu dans le dossier du championnat');
    assert.equal(D.ligue.championnat.jusquAu, '2026-10-18');
    assert.ok(!txt.includes('Faits du moment') && !txt.includes('Absents connus') && !txt.includes('Ce que l’IA lit de ce dossier'), 'aucun morceau de club pour un championnat seul');
    const tab = tableauDe(carteSeule, 'lecons-championnat');
    assert.ok(tab, 'ses leçons de championnat restent un tableau complet');
    assert.equal(pied(tab).length, 2);
    assert.equal(corps(tab).length, D.ligue.championnat.lecons.confirmees.length);
    // Un identifiant qui n'est pas celui d'un club FotMob dans l'adresse : ignoré, jamais lu.
    await rendu.routeur.push({ path: '/bulletin', query: { championnat: 'Brazil Série A', equipe: 'pas-un-club' } });
    const faux = await page(prete());
    assert.ok(!faux.appels.some((a) => /dossiers\?club=/.test(a)));
  } finally {
    await rendu.routeur.push('/');
  }
});

test('carte des dossiers — l’équipe choisie, le championnat seul et le choix « Le championnat seul » : ce que le composant lit selon le choix', options, async () => {
  const lire = (props, reponses) => rendu.rendre(Board, { reponse: D.calcule, ...props }, reponses);
  const seul = await lire({ ligueInitiale: 'Brazil Série A' }, [[ROUTES.ligue, ok(D.ligue)]]);
  assert.deepEqual(seul.avertissements, []);
  assert.ok(seul.appels.some((a) => /dossiers\?league=/.test(a)));
  assert.ok(!seul.appels.some((a) => /dossiers\?club=/.test(a)));
  const equipe = await lire({ ligueInitiale: 'Brazil Série A', equipeInitiale: 'fotmob-10277' }, [[ROUTES.equipe, ok(D.equipe)]]);
  assert.ok(equipe.appels.some((a) => /dossiers\?club=fotmob-10277$/.test(a)));
  assert.ok(espaces(equipe.texte).includes('São Paulo'));
  // Sans réponse de l'index (serveur à relancer) : la carte garde ses deux tableaux et le dit.
  const sans = await lire({ reponse: null, erreur: 'Le serveur n’est pas à jour : relancez demarrer-cotemaster.bat pour activer cette fonction.' }, []);
  assert.deepEqual(sans.avertissements, []);
  assert.equal(tableaux(sans.html).filter((x) => x.includes('data-tableau="lecons-')).length, 2);
  trouve(sans.html, /data-raison="pas-a-jour-serveur"/);
});

test('carte du dossier d’un championnat seul — chaque état est dit (aucun choisi, sans dossier, pas encore écrit, autre forme, serveur à relancer, illisible, en lecture) et le tableau des leçons reste', options, async () => {
  // Les mots, purs.
  const etat = (o) => DI.etatDuDossierChampionnat(o);
  assert.equal(etat({ league: null }).cle, 'sans-championnat');
  assert.equal(etat({ league: '' }).cle, 'sans-championnat');
  assert.equal(etat({ league: 'X', chargement: true }).cle, 'chargement');
  assert.equal(etat({ league: 'X' }).cle, 'chargement', 'pas encore de réponse : en lecture');
  assert.equal(etat({ league: 'X', erreur: 'boum' }).cle, 'erreur');
  assert.equal(etat({ league: 'X', erreur: 'Le serveur n’est pas à jour : relancez demarrer-cotemaster.bat pour activer cette fonction.' }).cle, 'pas-a-jour-serveur');
  assert.equal(etat({ league: 'X', reponse: { etat: 'absent' } }).cle, 'jamais');
  assert.equal(etat({ league: 'X', reponse: { etat: 'autreVersion' } }).cle, 'autre-version');
  assert.equal(etat({ league: 'X', reponse: { etat: 'lu', championnat: null } }).cle, 'sans-dossier');
  assert.equal(etat({ league: 'Brazil Série A', reponse: D.ligue }).cle, 'pret');
  assert.deepEqual([etat({ league: 'Brazil Série A', reponse: D.ligue }).titre, etat({ league: 'Brazil Série A', reponse: D.ligue }).texte], [null, null], 'prêt : aucune note');
  // À l'écran : la carte du championnat seul, dans chaque état.
  const carte = (props, reponse = ok(D.ligue)) => rendu.rendre(Carte, { portee: 'championnat', ...props }, [[ROUTES.ligue, reponse]]);
  const garde = (r, cle) => {
    assert.deepEqual(r.avertissements, []);
    assert.deepEqual(rendu.interdits, []);
    trouve(r.html, new RegExp(`data-etat="${cle}"`));
    const tab = tableauDe(r.html, 'lecons-championnat');
    assert.ok(tab, `${cle} : le tableau des leçons du championnat reste`);
    assert.equal(pied(tab).length, 2, `${cle} : Σ et ⌀`);
    return espaces(r.texte);
  };
  const aucun = await carte({ league: null });
  assert.deepEqual(aucun.appels, [], 'aucun championnat : aucune lecture');
  assert.ok(garde(aucun, 'sans-championnat').includes('Choisissez un championnat pour lire son dossier.'));
  trouve(aucun.html, /data-raison="sans-championnat"/);
  const sansDossier = await carte({ league: 'Nulle Part' }, ok({ ...D.ligue, championnat: null }));
  assert.ok(sansDossier.appels.some((a) => /dossiers\?league=Nulle%20Part$/.test(a)));
  assert.ok(garde(sansDossier, 'sans-dossier').includes('Pas de dossier pour ce championnat'));
  const jamais = await carte({ league: 'Brazil Série A' }, ok({ ...D.absent }));
  assert.ok(garde(jamais, 'jamais').includes('Pas encore calculé'));
  const autre = await carte({ league: 'Brazil Série A' }, ok({ ...D.autreVersion }));
  assert.ok(garde(autre, 'autre-version').includes('Dossier d’une autre forme'));
  const ancien = await carte({ league: 'Brazil Série A' }, { code: 404, corps: { error: 'Route introuvable : GET /api/match-ai-analysis/dossiers' } });
  assert.ok(garde(ancien, 'pas-a-jour-serveur').includes('relancez demarrer-cotemaster.bat'));
  const panne = await carte({ league: 'Brazil Série A' }, { code: 503, corps: { error: 'Le fichier des dossiers de l’IA est illisible.' } });
  assert.ok(garde(panne, 'erreur').includes('Dossier illisible'));
  const pret = await carte({ league: 'Brazil Série A' });
  garde(pret, 'pret');
  absent(pret.html, /data-raison=/, 'prêt : aucune note');
  // Le bouton « Relire » d'un championnat seul se désactive sans championnat (et non sans club).
  const relireDesactive = (html) => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].some((m) => /Relire/.test(m[2]) && /\bdisabled\b/.test(m[1]));
  assert.ok(relireDesactive(aucun.html), 'sans championnat, « Relire » est désactivé');
  assert.ok(!relireDesactive(pret.html), 'avec un championnat, « Relire » est actif');
});

// ================================================================================ 3. le câblage et l'hygiène

test('câblage — UN SEUL composant de budget : la page reprend ClaudeBudgetPanel (variante courte), comme la feuille de route ; aucune troisième version', () => {
  const composants = path.join(UI, 'src', 'components');
  const tous = fs.readdirSync(composants, { recursive: true }).filter((f) => f.endsWith('.vue')).map((f) => f.split(path.sep).join('/'));
  assert.ok(!tous.some((f) => /ClaudeBudgetGauge|BudgetGauge|JaugeBudget/i.test(f)), 'aucun composant de budget de plus');
  // Seul ClaudeBudgetPanel lit le service du budget.
  const lecteurs = [...tous, ...fs.readdirSync(path.join(UI, 'src', 'views')).map((f) => `../views/${f}`)].filter((f) => /claudeBudgetApi/.test(fs.readFileSync(path.join(composants, f), 'utf8')));
  assert.deepEqual(lecteurs, ['settings/ClaudeBudgetPanel.vue']);
  // Les trois pages qui le montrent l'importent depuis le même fichier.
  for (const vue of ['BulletinView.vue', 'RoadmapView.vue', 'SettingsView.vue']) {
    assert.match(lireUi('views', vue), /import ClaudeBudgetPanel from '@\/components\/settings\/ClaudeBudgetPanel\.vue';/, vue);
  }
  assert.match(lireUi('views', 'BulletinView.vue'), /<ClaudeBudgetPanel variante="compacte"/);
  assert.match(lireUi('views', 'RoadmapView.vue'), /<ClaudeBudgetPanel variante="compacte"/);
});

test('câblage — la route /bulletin et son entrée du menu : couleur d’Historique moteur, une seule entrée active à la fois', () => {
  const routeur = lireUi('router', 'index.js');
  assert.match(routeur, /path: '\/bulletin',\s*name: 'bulletin',\s*component: \(\) => import\('@\/views\/BulletinView\.vue'\),\s*meta: \{ title: 'Bulletin', section: 'history', nav: 'bulletin' \}/);
  const menu = lireUi('components', 'layout', 'AppSidebar.vue');
  assert.match(menu, /\{ to: '\/bulletin', section: 'history', nav: 'bulletin', label: 'Bulletin', hint: 'Texte du jour, fiabilité IA', icon: 'sparkles' \}/);
  const entrees = [...menu.matchAll(/^\s*\{ to: '([^']+)'/gm)].map((m) => m[1]);
  assert.deepEqual(entrees, ['/matches', '/paris', '/bookmakers', '/historique-moteur', '/sante-moteur', '/bulletin', '/feuille-de-route', '/reglages']);
  assert.ok(entrees.indexOf('/bulletin') === entrees.indexOf('/sante-moteur') + 1, 'juste après Santé du moteur');
});

test('câblage — la page lit quatre routes (le budget par son composant), n’écrit rien, n’appelle ni Claude ni FotMob, relit sur le signal des données', () => {
  const src = lireUi('views', 'BulletinView.vue');
  const script = src.slice(0, src.indexOf('</script>')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.deepEqual([...script.matchAll(/(bulletinsApi|matchAiAnalysisApi)\.(\w+)\(/g)].map((m) => `${m[1]}.${m[2]}`).sort(), ['bulletinsApi.overview', 'matchAiAnalysisApi.dossiersResume', 'matchAiAnalysisApi.scorecard']);
  assert.doesNotMatch(script, /\.post\(|\.put\(|\.delete\(|\.patch\(|fetch\(|localStorage|runPreMatch|runPostMatch|callClaude|claude-code/i);
  assert.match(script, /watch\(\s*\(\) => dataVersion\.version/, 'relue quand les fichiers de données changent');
  assert.match(script, /derniers\[cle\]/, 'une réponse tardive est ignorée');
  // Les trois cartes de lecture ne lisent rien d'elles-mêmes : la page leur donne leurs réponses.
  for (const f of ['AiReliabilityTable.vue', 'AiDossiersBoard.vue']) {
    const c = lireUi('components', 'analysis', f);
    const code = c.slice(0, c.indexOf('</script>')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\bfetch\(|httpClient|Api\.\w+\(/, `${f} : aucune lecture ni écriture`);
  }
  // La carte du bulletin se laisse nourrir : sans `lecture` elle lit seule (Réglages), avec elle ne lit rien.
  const panneau = lireUi('components', 'settings', 'BulletinsPanel.vue');
  assert.match(panneau, /lecture: \{ type: Object, default: null \}/);
  assert.match(panneau, /if \(props\.lecture\) return;/);
  assert.match(panneau, /const relire = \(\) => \(props\.lecture \? emit\('relire'\) : charger\(\)\);/, '« Relire » demande à la page de relire quand elle a donné la lecture');
  assert.match(panneau, /@click="relire"/);
  // Les gestes de la page (rien ne se clique dans un rendu côté serveur : le câblage se lit dans le texte) : chaque « Relire » relit SA route,
  // « Tout relire » relit les trois et fait relire le budget, le choix d'un dossier REMPLACE l'adresse au lieu de l'empiler.
  assert.match(src, /<BulletinsPanel :lecture="bulletins" @relire="lireLesBulletins" \/>/);
  assert.match(src, /<AiReliabilityTable [^>]*@relire="lireLeCarnet" \/>/);
  assert.match(src, /@relire="lireLIndex"[\s\S]*?@choisi="dossierChoisi"/);
  assert.match(src, /data-action="tout-relire" @click="toutRelire"/);
  assert.match(script, /function toutRelire\(\) \{\s*relectureLe\.value = new Date\(\)\.toISOString\(\);\s*return toutLire\(\);\s*\}/, '« Tout relire » fait relire le budget');
  assert.match(script, /const toutLire = \(\) => Promise\.all\(\[lireLesBulletins\(\), lireLeCarnet\(\), lireLIndex\(\)\]\);/);
  assert.match(script, /router\.replace\(\{ query \}\)/, 'on remplace l’adresse, on n’empile pas l’historique');
  assert.doesNotMatch(script, /router\.push\(/);
});

test('hygiène — les nouveaux fichiers : des jetons seulement (le vert est celui de l’état « écrit »), pas de !important, polices ≥ 10 px, icônes connues, pas de code Unicode échappé, règles pures', () => {
  const fichiers = [
    ['views', 'BulletinView.vue'],
    ['components', 'analysis', 'AiReliabilityTable.vue'],
    ['components', 'analysis', 'AiDossiersBoard.vue'],
    ['components', 'analysis', 'KeyMomentsList.vue'],
    ['utils', 'pageBulletin.js'],
    ['utils', 'indexDesDossiers.js'],
    ['utils', 'momentsCles.js'],
    ['utils', 'joueursDuMatch.js']
  ];
  const icones = lireUi('components', 'common', 'AppIcon.vue');
  for (const f of fichiers) {
    const src = lireUi(...f);
    const nom = f.join('/');
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/, `${nom} : aucune couleur en dur`);
    assert.doesNotMatch(src, /!important/, `${nom} : pas de !important`);
    for (const m of src.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 10, `${nom} : police ${m[1]}px`);
    assert.doesNotMatch(src, new RegExp(`${String.fromCharCode(92)}${String.fromCharCode(92)}u[0-9a-fA-F]{4}`), `${nom} : pas de code ${String.fromCharCode(92)}uXXXX`);
    // Le vert : seulement dans l'état d'un texte « écrit » de la page ; ni le rouge ni le vert ailleurs que pour l'état.
    if (!/BulletinView/.test(nom)) assert.doesNotMatch(src, /--cm-accent|--cm-danger/, `${nom} : jamais le vert ni le rouge d’une value`);
    for (const m of src.matchAll(/<AppIcon[^>]*\bname="([a-zA-Z]+)"/g)) assert.match(icones, new RegExp(`\\b${m[1]}\\b`), `${nom} : icône ${m[1]}`);
  }
  // Les termes d'aide employés existent au guide de lecture.
  const guide = lireUi('utils', 'langageParis.js');
  for (const f of fichiers.filter((x) => x[0] !== 'utils')) for (const m of lireUi(...f).matchAll(/<HelpTip[^>]*\bterme="([a-z-]+)"/g)) assert.match(guide, new RegExp(`'${m[1]}'|${m[1]}:`), m[1]);
});

test('hygiène — la provenance du carnet est la MÊME que celle du bloc d’Historique moteur (les mots ne se séparent pas)', () => {
  const bloc = lireUi('components', 'analysis', 'AiScorecardPanel.vue');
  assert.ok(bloc.includes(`source="${P.PROVENANCE_DU_CARNET.source}"`));
  assert.ok(bloc.includes(`fichier="${P.PROVENANCE_DU_CARNET.fichier}"`));
  assert.ok(bloc.includes(`action="${P.PROVENANCE_DU_CARNET.action}"`));
});
