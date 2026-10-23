/**
 * La route « connaître le marché » et les règles de la page BOOKMAKERS (étape 31 du plan, 22/10/2026).
 *   node --test test/bookmakers.test.mjs        (depuis server/)
 *
 * Les réponses sont celles du VRAI serveur : test/aides/script-bookmakers.mjs plante, dans une copie isolée de la base
 * d'essai, 400 rencontres et leurs cotes archivées (ESPN, football-data, Kalshi, un relevé payant) et 300 lignes
 * football-data, lance le calcul de l'étape 22 (dans un processus à part, comme chez Pierre), puis appelle
 * GET /api/market-knowledge (application Express, sans réseau) : avant le calcul, après, pour tous les championnats,
 * pour un championnat, pour un inconnu, et les demandes refusées.
 *
 *  1. La route : lecture seule (aucune écriture, aucun réseau), la même forme avant et après le calcul, un championnat
 *     à la fois, les refus, le câblage (une fois, GET seulement), le nom en clair d'un championnat de football-data.
 *  2. Les règles de ui/src/utils/bookmakers.js, recomptées à la main sur ces réponses : le classement (le meneur bat
 *     le plus d'autres livres), les marges (une bourse montre sa commission), les biais, le meilleur moment, la liste
 *     des championnats, le 23/09, les états de la page — avec Σ et ⌀ (jamais une somme de pourcentages).
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { UI, imp } from './aides/rendu.mjs';

const B = await imp(path.join(UI, 'src', 'utils', 'bookmakers.js'));
const V = await imp(path.join(UI, 'src', 'utils', 'vosBookmakers.js'));
const K = await imp(path.join(SERVEUR, 'src', 'data', 'marketKnowledge.js'));
const C = await imp(path.join(SERVEUR, 'src', 'api', 'controllers', 'marketKnowledge.controller.js'));
const FD = await imp(path.join(SERVEUR, 'src', 'data', 'providers', 'footballDataHistory.js'));

const fr = (x, d = 0) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const lire = (...chemin) => fs.readFileSync(path.join(SERVEUR, ...chemin), 'utf8');
const lireUi = (...chemin) => fs.readFileSync(path.join(UI, 'src', ...chemin), 'utf8');
const moyenne = (xs) => xs.reduce((t, x) => t + x, 0) / xs.length;

let s; // la sortie du script : les réponses de la route
before(() => {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-bookmakers.mjs'), { args: ['ecran'], timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    s = r.json;
  } finally {
    copie.nettoyer();
  }
});

// ================================================ 1. la route

test('route : la même forme avant et après le calcul — avant, « jamais » avec des lignes vides ; après, « pret » avec le calcul, les livres, le résumé et les lignes du championnat', () => {
  const avant = s.jamais;
  const apres = s.pret;
  assert.equal(avant.code, 200);
  assert.equal(apres.code, 200);
  assert.deepEqual(Object.keys(avant.corps).sort(), Object.keys(apres.corps).sort(), 'la même forme : la page garde ses tableaux');
  assert.deepEqual(Object.keys(avant.corps.lignes), ['justesse', 'vitesse', 'biais', 'marges', 'moments']);
  assert.deepEqual(Object.keys(apres.corps.lignes), ['justesse', 'vitesse', 'biais', 'marges', 'moments']);
  // Avant tout calcul.
  assert.deepEqual([avant.corps.etat, avant.corps.calcul, avant.corps.resume, avant.corps.bilan, avant.corps.livres, avant.corps.championnats], ['jamais', null, null, null, [], []]);
  assert.ok(Object.values(avant.corps.lignes).every((l) => Array.isArray(l) && l.length === 0));
  assert.deepEqual(avant.corps.provenance, apres.corps.provenance, 'la provenance se dit même sans calcul');
  assert.deepEqual(avant.corps.regles, apres.corps.regles);
  // Après le calcul.
  const r = apres.corps;
  assert.equal(r.etat, 'pret');
  assert.equal(r.aJour, true);
  assert.equal(r.versionAttendue, K.VERSION_CONNAISSANCE);
  assert.deepEqual(Object.keys(r.calcul).sort(), ['empreinte', 'finiLe', 'id', 'ou', 'version']);
  assert.equal(r.calcul.version, K.VERSION_CONNAISSANCE);
  assert.match(r.calcul.finiLe, /^2026-10-05T/, 'l’heure du calcul (figée dans l’essai)');
  assert.equal(r.portee, '*');
  assert.equal(r.nom, 'Tous les championnats');
  assert.equal(r.base.endsWith('match-stats.db'), true, 'le fichier lu est dit');
  // Les livres : leur type, leur commission, leur prix jouable.
  const livre = (cle) => r.livres.find((l) => l.cle === cle);
  assert.deepEqual([livre('fd|Pinnacle').type, livre('fd|Pinnacle').prixJouable], ['bookmaker', true]);
  assert.deepEqual([livre('kalshi|Kalshi').type, livre('kalshi|Kalshi').prixJouable], ['bourse', false]);
  assert.deepEqual([livre('fd|Betfair Exchange').type, livre('fd|Betfair Exchange').commission], ['bourse', 0.05]);
  assert.equal(livre('fd|Moyenne du marché').type, 'composite');
  // Le résumé du calcul : de quoi remplir la page sans autre lecture.
  assert.deepEqual(Object.keys(r.resume).sort(), ['biais', 'marges', 'moments', 'momentsParType', 'plusJuste', 'premier', 'reproduction']);
  assert.ok(r.resume.moments.some((m) => m.championnat === '*') && r.resume.moments.some((m) => m.championnat === 'Ligue Essai'));
  assert.equal(r.bilan.options.minMatchs, 200);
  assert.ok(r.bilan.releves.cotes > 0 && r.bilan.releves.rencontres > 0, 'ce que le calcul a lu est dit');
  // Chaque ligne de tous les championnats porte la portée « * », son nombre de matchs, son verdict.
  for (const [mesure, lignes] of Object.entries(r.lignes)) {
    assert.ok(lignes.length > 0 || mesure === 'vitesse', `${mesure} : des lignes`);
    for (const l of lignes) {
      assert.equal(l.portee, '*', `${mesure} : la portée`);
      assert.ok(Number.isFinite(l.n) && l.n > 0, `${mesure} ${l.cle} : son nombre de matchs`);
    }
  }
  assert.ok(s.pretTaille < 400_000, `${s.pretTaille} octets : un championnat à la fois, jamais les 5,6 Mo du calcul`);
});

test('route : un championnat à la fois — ses lignes seules ; « * » est le défaut ; un championnat inconnu garde la forme ; la liste des championnats est toujours là', () => {
  const l = s.ligue.corps;
  assert.equal(l.etat, 'pret');
  assert.equal(l.portee, 'Ligue Essai');
  assert.equal(l.nom, 'Ligue Essai');
  for (const lignes of Object.values(l.lignes)) assert.ok(lignes.every((x) => x.portee === 'Ligue Essai'), 'aucune ligne d’un autre championnat');
  assert.equal(l.lignes.justesse.length, s.lecture.brute, 'la route rend exactement ce que le lecteur de l’étape 22 lit');
  assert.equal(s.lecture.reponse, s.lecture.brute);
  assert.ok(l.lignes.justesse.length < s.pret.corps.lignes.justesse.length + l.lignes.justesse.length);
  assert.deepEqual(l.resume, s.pret.corps.resume, 'le résumé est celui du calcul, quel que soit le championnat lu');
  assert.deepEqual(l.championnats, s.pret.corps.championnats);
  assert.deepEqual(l.livres, s.pret.corps.livres);
  assert.deepEqual(s.etoile.corps.lignes, s.pret.corps.lignes, '« * » demandé = le défaut');
  // Les championnats mesurés : nom en clair, nombre de lignes, triés.
  const ch = s.pret.corps.championnats;
  assert.deepEqual(ch.map((c) => c.portee).sort(), ['EPL', 'Ligue Essai']);
  assert.ok(ch.every((c) => c.lignes > 0 && c.nom === c.portee && c.horsAppli === false));
  assert.deepEqual(ch.map((c) => c.nom), [...ch.map((c) => c.nom)].sort((a, b) => a.localeCompare(b, 'fr')));
  // Un championnat inconnu : 200, la même forme, des lignes vides, la liste pour en choisir un autre.
  const i = s.inconnu.corps;
  assert.equal(s.inconnu.code, 200);
  assert.equal(i.etat, 'championnat-inconnu');
  assert.equal(i.portee, 'Championnat de nulle part');
  assert.ok(Object.values(i.lignes).every((x) => x.length === 0));
  assert.deepEqual(i.championnats, s.pret.corps.championnats);
  assert.deepEqual(Object.keys(i).sort(), Object.keys(s.pret.corps).sort());
  // Un calcul d’une autre forme : lu, et dit « pas à jour ».
  assert.equal(s.autreVersion.corps.etat, 'pas-a-jour');
  assert.equal(s.autreVersion.corps.aJour, false);
  assert.ok(s.autreVersion.corps.lignes.justesse.length > 0, 'ses chiffres restent lus en attendant la prochaine nuit');
});

test('route : les demandes refusées le sont avant toute lecture ; une demande vide vaut « * » ; la route ne répond qu’à GET', () => {
  assert.equal(s.refus.tableau.code, 400);
  assert.match(s.refus.tableau.corps.error, /"championnat" est requis/);
  assert.equal(s.refus.long.code, 400);
  assert.match(s.refus.long.corps.error, /trop long/);
  assert.equal(s.refus.reproduction.code, 400);
  assert.match(s.refus.reproduction.corps.error, /23-09/);
  assert.equal(s.refus.vide.code, 200, 'un paramètre vide : le défaut');
  assert.equal(s.refus.vide.corps.portee, '*');
  assert.equal(s.post, 404, 'aucune écriture par cette route');
});

test('route : LECTURE SEULE — aucune écriture dans la base, aucun fichier d’exécution touché, aucun réseau', () => {
  assert.equal(s.ecritures, 0, 'la base n’a pas bougé pendant les lectures');
  assert.equal(s.runtimeInchange, true);
  const routes = lire('src', 'api', 'routes', 'marketKnowledge.routes.js');
  assert.match(routes, /router\.get\('\/', asyncHandler\(getMarketKnowledge\)\);/);
  assert.doesNotMatch(routes, /router\.(post|put|patch|delete)\(/);
  const controleur = lire('src', 'api', 'controllers', 'marketKnowledge.controller.js');
  // Il lit : jamais le calcul de nuit, jamais le rangement, jamais un fournisseur.
  assert.doesNotMatch(controleur.replace(/\/\*[\s\S]*?\*\//g, ''), /connaitreLeMarche|calculerAPart|calculerSiBesoin|ouvrirCalcul|finirCalcul|rangerLe|noterEchec|\.run\(|INSERT |UPDATE |DELETE |fetch\(|axios|https?:\/\//);
  assert.match(controleur, /import \{ dernierCalcul, lireConnaissanceDuMarche, MOMENTS, CATEGORIES_DE_BIAIS, MIN_MATCHS, VERSION_CONNAISSANCE \} from '\.\.\/\.\.\/data\/marketKnowledge\.js';/);
  // Branchée une fois, sous /market-knowledge.
  const index = lire('src', 'api', 'routes', 'index.js');
  assert.equal((index.match(/marketKnowledgeRoutes/g) ?? []).length, 2, 'importée et branchée, une fois');
  assert.match(index, /router\.use\('\/market-knowledge', marketKnowledgeRoutes\);/);
  // Aucun fichier du moteur n’est touché : la route n’est pas dans son empreinte.
  const moteur = lire('src', 'core', 'engine', 'engineVersions.js');
  assert.match(moteur, /dossiers: Object\.freeze\(\['core\/engine', 'core\/market', 'core\/model', 'core\/risk', 'core\/signals', 'core\/xg', 'sports'\]\)/);
});

test('route : le nom en clair d’un championnat de football-data hors de l’appli (« fd:EC »), ceux du magasin tels quels ; les mots du calcul sont ceux de la page', () => {
  assert.equal(C.nomDuChampionnat('*'), 'Tous les championnats');
  assert.equal(C.nomDuChampionnat('fd:EC'), FD.nomDuCode('EC'));
  assert.equal(C.nomDuChampionnat('fd:EC'), 'Angleterre — National League');
  assert.equal(C.nomDuChampionnat('fd:ZZZ'), 'ZZZ', 'un code inconnu : le code tel quel');
  assert.equal(C.nomDuChampionnat('EPL'), 'EPL');
  // Les sept moments et les quatre biais de la page = ceux du serveur, mot pour mot.
  assert.deepEqual(Object.keys(B.MOMENTS).sort(), Object.keys(K.MOMENTS).sort());
  for (const [cle, m] of Object.entries(B.MOMENTS)) assert.equal(m.long, K.MOMENTS[cle], cle);
  assert.deepEqual(Object.keys(B.CATEGORIES_DE_BIAIS).sort(), Object.keys(K.CATEGORIES_DE_BIAIS).sort());
  for (const [cle, c] of Object.entries(B.CATEGORIES_DE_BIAIS)) assert.equal(c.long, K.CATEGORIES_DE_BIAIS[cle], cle);
  assert.deepEqual(s.pret.corps.regles.moments, K.MOMENTS);
  assert.equal(s.pret.corps.regles.minimumDeMatchs, K.MIN_MATCHS);
  assert.deepEqual([...B.MOMENTS_DE_JUSTESSE], [...K.MOMENTS_DE_JUSTESSE]);
  assert.deepEqual([...B.MOMENTS_DE_VITESSE], [...K.PAIRES_DE_VITESSE.map((p) => p[0])]);
  assert.deepEqual([...B.MOMENTS_DE_MARGE].sort(), Object.keys(K.MOMENTS).sort(), 'chaque moment du prix a sa colonne de marge');
});

// ================================================ 2. les règles de la page

const toutes = () => s.pret.corps;

test('classement : le meneur bat le plus d’autres livres ; une ligne par livre, du meneur au dernier ; Σ victoires = Σ défaites ; chaque chiffre est lu sur la ligne du serveur', () => {
  const r = toutes();
  for (const [mesure, moments] of [['justesse', B.MOMENTS_DE_JUSTESSE], ['vitesse', B.MOMENTS_DE_VITESSE]]) {
    for (const moment of moments) {
      const men = r.lignes[mesure].find((l) => l.cle === 'meneur' && l.moment === moment);
      const c = B.classementDuMoment({ lignes: r.lignes, livres: r.livres, mesure, moment });
      if (!men) {
        assert.equal(c.disponible, false, `${mesure} ${moment} : pas de meneur, pas de tableau rempli`);
        assert.deepEqual(c.lignes, []);
        assert.equal(c.phrase, null);
        assert.equal(c.pied.n, 0);
        continue;
      }
      assert.equal(c.disponible, true);
      assert.equal(c.meneur.livre, men.livre);
      assert.equal(c.lignes.length, men.detail.classement.length);
      assert.deepEqual(c.lignes.map((l) => l.livre), men.detail.classement.map((x) => x.livre), 'l’ordre du serveur');
      assert.deepEqual(c.lignes.map((l) => l.rang), c.lignes.map((_, i) => i + 1));
      assert.equal(c.lignes[0].meneur, true);
      assert.equal(c.lignes.filter((l) => l.meneur).length, 1);
      // Le meneur est celui qui a le meilleur solde (victoires − défaites).
      const solde = (l) => l.bat - l.perd;
      assert.ok(c.lignes.every((l) => solde(c.lignes[0]) >= solde(l)), 'le meneur a le meilleur solde');
      // Une victoire est la défaite d’un autre : Σ victoires = Σ défaites.
      assert.equal(c.pied.sigma.bat, c.pied.sigma.perd, `${mesure} ${moment} : Σ victoires = Σ défaites`);
      for (const l of c.lignes) {
        const propres = r.lignes[mesure].find((x) => x.moment === moment && x.livre === l.livre && x.cle === (mesure === 'justesse' ? 'propres' : 'avance'));
        assert.equal(l.n, propres?.n ?? null, `${l.livre} : ses matchs`);
        assert.equal(l.valeur, propres?.valeur ?? null, `${l.livre} : sa valeur sur SES matchs`);
        if (!l.meneur) {
          const face = r.lignes[mesure].find((x) => x.moment === moment && x.livre === men.livre && x.cle === `face|${l.livre}`);
          assert.equal(l.face?.verdict ?? null, face?.verdict ?? null, `${l.livre} : le verdict du juge face au meneur`);
          if (face) assert.equal(l.face.n, face.n);
        }
      }
      // ⌀ = la moyenne de la colonne, chaque livre comptant pour un.
      const valeurs = c.lignes.map((l) => l.valeur).filter(Number.isFinite);
      assert.ok(Math.abs(c.pied.moyenne.valeur - moyenne(valeurs)) < 1e-12);
      assert.equal(c.pied.sigma.cotes, c.lignes.reduce((t, l) => t + (l.n ?? 0), 0));
    }
  }
  const c = B.classementDuMoment({ lignes: r.lignes, livres: r.livres, mesure: 'justesse', moment: 'cloture' });
  assert.equal(c.meneur.titre, 'Pinnacle (football-data)', 'le résultat du 23/09 : Pinnacle le plus juste sur ce panier');
  assert.match(c.phrase, /^Clôture : Pinnacle \(football-data\) est le plus juste — il bat \d+ livres? sur \d+ sur leurs matchs communs\.$/);
  // Les mots d’une valeur.
  assert.equal(B.perteLogDite(1.041295), '1,0413');
  assert.equal(B.perteLogDite(null), 'pas mesurée');
  assert.equal(B.avanceDite(0.0127), '+1,3 %');
  assert.equal(B.avanceDite(-0.0103), '−1,0 %');
  assert.equal(B.avanceDite(null), 'pas mesurée');
});

test('titre et type d’un livre : le titre du calcul, sinon déduit de sa clé ; bookmaker, bourse (commission) ou moyenne ; le ton d’un verdict (jamais vert, jamais rouge)', () => {
  const r = toutes();
  assert.equal(B.titreDuLivre('fd|Pinnacle', r.livres), 'Pinnacle (football-data)');
  assert.equal(B.titreDuLivre('xyz|Nouveau livre', []), 'Nouveau livre (xyz)');
  assert.equal(B.titreDuLivre('sans-barre', []), 'sans-barre');
  const kalshi = B.typeDuLivre('kalshi|Kalshi', r.livres);
  assert.deepEqual([kalshi.cle, kalshi.texte, kalshi.jouable], ['bourse', 'bourse', false]);
  assert.match(kalshi.titre, /Une bourse : pas de marge mais une commission.*milieu du carnet/);
  const betfair = B.typeDuLivre('fd|Betfair Exchange', r.livres);
  assert.deepEqual([betfair.commission, betfair.jouable], [0.05, true]);
  assert.match(betfair.titre, /commission de 5 %/);
  assert.equal(B.typeDuLivre('fd|Moyenne du marché', r.livres).texte, 'moyenne');
  assert.equal(B.typeDuLivre('fd|Pinnacle', r.livres).texte, 'bookmaker');
  assert.deepEqual(['retenu', 'moins-bon', 'pas-prouve', 'pas-assez-de-matchs', null].map(B.tonDuVerdict), ['is-info', 'is-info', '', 'is-warning', '']);
  // Aucune page de bookmakers n’emploie le vert ni le rouge d’un résultat.
  assert.ok(!['is-accent', 'is-danger'].some((t) => ['retenu', 'moins-bon', 'pas-prouve', 'pas-assez-de-matchs'].map(B.tonDuVerdict).includes(t)));
});

test('vos bookmakers (The Odds API) : le NOM que Réglages montre, sinon le titre de l’API, sinon un nom lisible — jamais la clé « winamax_fr » ; une seule liste pour Réglages et pour la page', () => {
  // Les six noms que la page doit dire (les clés brutes de la base : winamax_fr, pmu_fr, betclic_fr, unibet_fr, winamax_de, betfair_ex_eu).
  assert.deepEqual(['winamax_fr', 'pmu_fr', 'betclic_fr', 'unibet_fr', 'winamax_de', 'betfair_ex_eu'].map(V.titreDuBookmaker), ['Winamax (FR)', 'PMU', 'Betclic', 'Unibet (FR)', 'Winamax (DE)', 'Betfair Exchange (EU)']);
  // UNE seule liste : celle de Réglages › Vos bookmakers (16 clés, leurs groupes), lue par le formulaire ET par la page.
  const reglages = lireUi('components', 'settings', 'EngineConfigForm.vue');
  assert.match(reglages, /import \{ BOOKMAKERS \} from '@\/utils\/vosBookmakers\.js';/, 'Réglages lit la liste partagée');
  assert.doesNotMatch(reglages, /key: '[a-z_0-9]+', title:/, 'Réglages ne garde plus sa propre copie de la liste');
  assert.equal(V.BOOKMAKERS.length, 16);
  assert.deepEqual(V.BOOKMAKERS.filter((b) => b.groupe === 'france').map((b) => b.title), ['Betclic', 'Unibet (FR)', 'Winamax (FR)', 'PMU'], 'les quatre bookmakers agréés en France, dans l’ordre de Réglages');
  assert.ok(V.BOOKMAKERS.every((b) => Object.isFrozen(b)) && Object.isFrozen(V.BOOKMAKERS), 'une liste qu’aucun écran ne modifie');
  assert.equal(new Set(V.BOOKMAKERS.map((b) => b.key)).size, 16);
  // Les clés que The Odds API a réellement envoyées (son relevé du 21/09/2026, gardé dans les données d’essai) : un nom pour chacune.
  const releve = JSON.parse(fs.readFileSync(path.join(SERVEUR, 'data', 'fixtures', 'odds', 'odds-snapshot.json'), 'utf8'));
  const api = new Map();
  const parcourir = (o) => {
    if (Array.isArray(o)) o.forEach(parcourir);
    else if (o && typeof o === 'object') {
      if (typeof o.key === 'string' && typeof o.title === 'string' && o.markets) api.set(o.key, o.title);
      Object.values(o).forEach(parcourir);
    }
  };
  parcourir(releve);
  assert.equal(api.size, 25, 'les 25 bookmakers du relevé');
  const reglagesDes = new Map(V.BOOKMAKERS.map((b) => [b.key, b.title]));
  for (const [cle, titreApi] of api) {
    const nom = V.titreDuBookmaker(cle);
    assert.ok(!nom.includes('_'), `${cle} → ${nom} : une clé brute à l’écran`);
    assert.notEqual(nom, cle, `${cle} : la clé brute à l’écran`);
    if (reglagesDes.has(cle)) assert.equal(nom, reglagesDes.get(cle), `${cle} : le nom de Réglages`);
    else if (cle !== 'betfair_ex_eu') assert.equal(nom, titreApi, `${cle} : le titre de The Odds API`);
  }
  assert.equal(api.get('betfair_ex_eu'), 'Betfair', 'The Odds API appelle la bourse « Betfair » ; la page dit « Betfair Exchange (EU) », le nom que l’appli lui donne partout ailleurs');
  assert.equal(V.titreDuBookmaker('betfair_ex_eu'), 'Betfair Exchange (EU)');
  assert.equal(V.titreDuBookmaker('pmu_fr'), 'PMU', 'le nom de Réglages, pas le « PMU (FR) » de l’API');
  assert.equal(V.titreDuBookmaker('tipico_de'), 'Tipico');
  // Une clé jamais vue : un nom lisible fabriqué, jamais « mot_mot ».
  assert.deepEqual(['foo_bar_nl', 'nouveau_livre', 'seulement', 'x_y_z_fr', 'a_b_c'].map(V.titreParDefaut), ['Foo Bar (NL)', 'Nouveau Livre', 'Seulement', 'X Y Z (FR)', 'A B C']);
  assert.equal(V.titreDuBookmaker('un_bookmaker_de_plus'), 'Un Bookmaker De Plus');
  assert.equal(V.titreDuBookmaker('nouveau_livre_it'), 'Nouveau Livre (IT)');
  assert.equal(V.titreParDefaut(''), '');
  assert.equal(V.titreParDefaut(null), '');
});

test('le titre d’un livre de la famille « vos bookmakers » vient des noms de Réglages, pas du titre brut que le calcul range ; les autres familles gardent le leur', () => {
  const r = toutes();
  const brut = r.livres.find((l) => l.cle === 'odds-api|pinnacle');
  assert.equal(brut.titre, 'pinnacle (vos bookmakers)', 'le calcul range la clé telle quelle');
  assert.equal(B.titreDuLivre('odds-api|pinnacle', r.livres), 'Pinnacle (vos bookmakers)');
  assert.equal(B.titreDuLivre('fd|Pinnacle', r.livres), 'Pinnacle (football-data)', 'le Pinnacle de football-data reste distinct de celui de vos bookmakers');
  assert.equal(B.titreDuLivre('odds-api|winamax_fr', []), 'Winamax (FR) (vos bookmakers)', 'même sans la liste du calcul');
  assert.equal(B.titreDuLivre('odds-api|betfair_ex_eu', [{ cle: 'odds-api|betfair_ex_eu', titre: 'betfair_ex_eu (vos bookmakers)' }]), 'Betfair Exchange (EU) (vos bookmakers)');
  assert.equal(B.titreDuLivre('espn|DraftKings', r.livres), 'DraftKings (ESPN)');
  // Aucun livre du calcul ne s'affiche avec une clé brute.
  for (const l of r.livres) {
    const t = B.titreDuLivre(l.cle, r.livres);
    assert.ok(!t.includes('_'), `${l.cle} → ${t}`);
    if (l.cle.startsWith('odds-api|')) assert.equal(t, `${V.titreDuBookmaker(l.cle.slice('odds-api|'.length))} (vos bookmakers)`);
  }
  assert.ok(r.livres.filter((l) => l.cle.startsWith('odds-api|')).length >= 9, 'les neuf bookmakers du relevé payant planté');
  // Le plus juste et celui qui bouge le premier : leur nom passe par la même règle quand ils viennent de vos bookmakers.
  const reponse = { calcul: { id: 1, finiLe: '2026-10-05T12:00:00.000Z', ou: 'serveur' }, bilan: { releves: { cotes: 10, rencontres: 5 } }, livres: [], resume: { plusJuste: { cloture: { livre: 'odds-api|pmu_fr', titre: 'pmu_fr (vos bookmakers)', perteLog: 0.99 } }, premier: { releve: { livre: 'odds-api|winamax_de', titre: 'winamax_de (vos bookmakers)' } } } };
  const cles = B.chiffresCles(reponse);
  assert.equal(cles.plusJuste.valeur, 'PMU (vos bookmakers)');
  assert.equal(cles.premier.valeur, 'Winamax (DE) (vos bookmakers)');
});

test('marges : une ligne par livre, les sept moments toujours là ; une bourse montre sa commission, jamais une marge ; Σ des cotes lues ; ⌀ des seules marges des bookmakers', () => {
  const r = toutes();
  const t = B.tableauDesMarges({ lignes: r.lignes, livres: r.livres });
  const brutes = r.lignes.marges.filter((l) => l.cle === 'marge');
  assert.deepEqual(t.lignes.map((l) => l.livre).sort(), [...new Set(brutes.map((l) => l.livre))].sort());
  assert.ok(t.lignes.every((l) => B.MOMENTS_DE_MARGE.every((m) => m in l.cases)), 'les sept moments, mesurés ou non');
  for (const l of brutes) {
    const ligne = t.lignes.find((x) => x.livre === l.livre);
    const c = ligne.cases[l.moment];
    assert.equal(c.vide, false);
    assert.equal(c.n, l.n);
    if (l.valeur === null) {
      assert.equal(c.valeur, null, `${l.livre} : une bourse n’a pas de marge`);
      assert.match(c.texte, /^(commission \d+ %|sans marge)$/);
    } else assert.equal(c.texte, `${fr(l.valeur, 1)} %`);
  }
  const betfair = t.lignes.find((l) => l.livre === 'fd|Betfair Exchange');
  assert.equal(betfair.cases.cloture.texte, 'commission 5 %');
  assert.equal(t.lignes.find((l) => l.livre === 'kalshi|Kalshi').cases.cloture.texte, 'sans marge', 'Kalshi : pas de commission connue, pas de marge');
  assert.equal(betfair.cases['h-3'].vide, true);
  assert.equal(betfair.cases['h-3'].texte, 'pas coté');
  // Du moins cher au plus cher (marge de la clôture).
  const marges = t.lignes.map((l) => l.tri).filter((x) => x !== null);
  assert.deepEqual(marges, [...marges].sort((a, b) => a - b));
  // Σ et ⌀ recomptés à la main.
  for (const m of B.MOMENTS_DE_MARGE) {
    const du = brutes.filter((l) => l.moment === m);
    assert.equal(t.pied.sigma[m], du.reduce((s_, l) => s_ + l.n, 0), `Σ ${m}`);
    const vals = du.map((l) => l.valeur).filter((x) => x !== null);
    if (vals.length) assert.ok(Math.abs(t.pied.moyenne[m] - moyenne(vals)) < 1e-12, `⌀ ${m} : la moyenne des marges, bourses exclues`);
    else assert.equal(t.pied.moyenne[m], null);
    assert.equal(t.pied.texte.sigma[m], du.length ? `${fr(t.pied.sigma[m])} cotes` : 'aucune cote');
  }
  const vide = B.tableauDesMarges({ lignes: { marges: [] }, livres: [] });
  assert.deepEqual([vide.lignes.length, vide.pied.texte.sigma.cloture, vide.pied.texte.moyenne.cloture], [0, 'aucune cote', 'pas de moyenne']);
});

test('biais : l’écart « réalisé moins annoncé » en points, son verdict et ses matchs ; quatre catégories toujours là ; Σ des biais prouvés ; ⌀ des écarts', () => {
  const r = toutes();
  const t = B.tableauDesBiais({ lignes: r.lignes, livres: r.livres, moment: 'cloture' });
  const brutes = r.lignes.biais.filter((l) => l.moment === 'cloture');
  assert.deepEqual(t.lignes.map((l) => l.livre).sort(), [...new Set(brutes.map((l) => l.livre))].sort());
  assert.ok(t.lignes.every((l) => Object.keys(B.CATEGORIES_DE_BIAIS).every((c) => c in l.cases)));
  for (const l of brutes) {
    const c = t.lignes.find((x) => x.livre === l.livre).cases[l.cle];
    assert.equal(c.vide, false);
    assert.equal(c.valeur, l.valeur);
    assert.equal(c.n, l.n);
    assert.equal(c.verdict, l.verdict);
    assert.equal(c.ton, B.tonDuVerdict(l.verdict));
    assert.equal(c.texte, `${l.valeur < 0 ? '−' : '+'}${fr(Math.abs(l.valeur), 1)} point${Math.abs(l.valeur) >= 2 ? 's' : ''}`);
    assert.equal(c.dit, l.detail.dit);
  }
  for (const cat of Object.keys(B.CATEGORIES_DE_BIAIS)) {
    const du = brutes.filter((l) => l.cle === cat);
    assert.equal(t.pied.sigma[cat].cotes, du.reduce((s_, l) => s_ + l.n, 0), `Σ ${cat}`);
    assert.equal(t.pied.sigma[cat].prouves, du.filter((l) => l.verdict === 'retenu' || l.verdict === 'moins-bon').length, `biais prouvés ${cat}`);
    assert.ok(Math.abs(t.pied.moyenne[cat] - moyenne(du.map((l) => l.valeur))) < 1e-12, `⌀ ${cat}`);
  }
  // Chaque moment du biais a son tableau : une ligne par livre mesuré à CE moment, jamais celles d’un autre moment.
  for (const moment of B.MOMENTS_DE_BIAIS) {
    const tableau = B.tableauDesBiais({ lignes: r.lignes, livres: r.livres, moment });
    const livresDuMoment = [...new Set(r.lignes.biais.filter((l) => l.moment === moment).map((l) => l.livre))].sort();
    assert.deepEqual(tableau.lignes.map((l) => l.livre).sort(), livresDuMoment, `biais ${moment} : une ligne par livre mesuré`);
    assert.ok(tableau.lignes.every((l) => Object.keys(B.CATEGORIES_DE_BIAIS).every((c) => c in l.cases)), `biais ${moment} : les quatre catégories`);
  }
  assert.ok(brutes.length > 0, 'la clôture a des biais mesurés dans l’essai');
  // Un moment sans aucune ligne : le tableau est vide, ses colonnes et son pied restent, dits « aucune cote ».
  const sans = B.tableauDesBiais({ lignes: { biais: [] }, livres: [], moment: 'cloture' });
  assert.deepEqual(sans.lignes, []);
  assert.equal(sans.pied.texte.sigma.nuls, 'aucune cote');
  assert.equal(B.tableauDesBiais({ lignes: r.lignes, livres: r.livres, moment: 'ouverture' }).lignes.length, 0, 'un moment que le biais ne mesure pas : aucune ligne inventée');
});

test('meilleur moment : la conclusion du serveur, les quatre moments et les cinq comparaisons toujours là, Σ et ⌀ recomptés ; la liste championnat par championnat', () => {
  const r = toutes();
  const m = B.meilleurMomentDuChampionnat({ lignes: r.lignes });
  const conclusion = r.resume.moments.find((x) => x.championnat === '*');
  assert.equal(m.mesure, true);
  assert.equal(m.conclusion.cle, conclusion.conclusion);
  assert.equal(m.conclusion.phrase, conclusion.phrase);
  assert.equal(m.conclusion.n, conclusion.n);
  assert.deepEqual(m.valeurs.map((v) => v.moment), ['ouverture', 'releve', 'apres-compos', 'juste-avant']);
  assert.equal(m.comparaisons.length, 5);
  for (const v of m.valeurs) {
    const brute = r.lignes.moments.find((x) => x.moment === v.moment && x.cle === 'valeur');
    assert.equal(v.mesure, Boolean(brute), v.moment);
    if (brute) assert.deepEqual([v.n, v.valeur, v.texte], [brute.n, brute.valeur, `${brute.valeur < 0 ? '−' : '+'}${fr(Math.abs(brute.valeur), 1)} %`]);
    else assert.equal(v.texte, 'pas mesurée');
  }
  for (const c of m.comparaisons) {
    const brute = r.lignes.moments.find((x) => x.moment === c.tot && x.cle === `face|${c.tard}`);
    assert.equal(c.mesuree, Boolean(brute), `${c.tot} contre ${c.tard}`);
    if (brute) assert.deepEqual([c.n, c.ecart, c.verdict, c.dit], [brute.n, brute.valeur, brute.verdict, brute.detail.dit]);
    else assert.match(c.dit, /^pas mesuré/);
  }
  const mesurees = m.valeurs.filter((v) => v.mesure);
  assert.ok(Math.abs(m.pied.valeurs.moyenne - moyenne(mesurees.map((v) => v.valeur))) < 1e-12, '⌀ de la valeur de clôture');
  const comp = m.comparaisons.filter((c) => c.mesuree);
  assert.equal(m.pied.comparaisons.n, comp.length);
  assert.equal(m.pied.comparaisons.retenues, comp.filter((c) => c.verdict === 'retenu').length);
  assert.ok(Math.abs(m.pied.comparaisons.moyenne - moyenne(comp.map((c) => c.ecart))) < 1e-12);
  assert.equal(B.conclusionDe('juste-avant').court, 'Juste avant le coup d’envoi');
  assert.equal(B.conclusionDe(null).court, 'Pas de moment meilleur prouvé');
  assert.equal(B.conclusionDe('releve').court, 'Parier tôt');
  // Sans aucune ligne : tout reste, « pas mesuré ».
  const vide = B.meilleurMomentDuChampionnat({ lignes: { moments: [] } });
  assert.deepEqual([vide.mesure, vide.valeurs.length, vide.comparaisons.length, vide.pied.texte.valeursMoyenne], [false, 4, 5, 'pas de moyenne']);
  // Championnat par championnat : « Tous » d’abord, puis les favoris, puis le reste ; le championnat regardé est marqué.
  const base = { resume: r.resume, championnats: r.championnats, selection: 'Ligue Essai' };
  const sans = B.lignesDesChampionnats(base);
  assert.deepEqual(sans.lignes.map((l) => l.portee), ['*', 'EPL', 'Ligue Essai']);
  assert.deepEqual(sans.lignes.filter((l) => l.choisi).map((l) => l.portee), ['Ligue Essai']);
  const fav = B.lignesDesChampionnats(base, { favorisEnPremier: (liste) => [...liste].sort((a, b) => Number(b.portee === 'Ligue Essai') - Number(a.portee === 'Ligue Essai')), estFavori: (p) => p === 'Ligue Essai' });
  assert.deepEqual(fav.lignes.map((l) => l.portee), ['*', 'Ligue Essai', 'EPL'], 'les favoris d’abord, « Tous » jamais déplacé');
  assert.deepEqual(fav.lignes.filter((l) => l.favori).map((l) => l.portee), ['Ligue Essai']);
  const mesures = sans.lignes.filter((l) => !l.tous && l.mesure);
  assert.equal(sans.pied.n.matchs, mesures.reduce((t, l) => t + l.n, 0), 'Σ des matchs : un match n’est que dans un championnat');
  assert.equal(sans.pied.n.tot + sans.pied.n.apresCompos + sans.pied.n.justeAvant + sans.pied.n.aucun, mesures.length, 'chaque championnat a une conclusion et une seule');
  assert.ok(Math.abs(sans.pied.moyenne - moyenne(mesures.map((l) => l.n))) < 1e-12);
  for (const l of mesures) assert.equal(l.cle, r.resume.moments.find((x) => x.championnat === l.portee).conclusion ?? 'aucune');
  // Un championnat que le résumé n’a pas : la ligne reste, « pas assez de relevés datés ».
  const sansMoment = B.lignesDesChampionnats({ resume: { moments: [] }, championnats: r.championnats, selection: '*' });
  assert.ok(sansMoment.lignes.every((l) => l.mesure === false && l.conclusion === 'pas assez de relevés datés'));
  assert.equal(sansMoment.pied.texte.repartition, 'aucun championnat mesuré');
});

test('un championnat où le calcul n’a comparé AUCUN match (n = 0, « trop peu de matchs pour juger ») n’a pas de conclusion : il est dit non mesuré, jamais « pas de moment meilleur prouvé »', () => {
  const r = toutes();
  // Ce que le calcul range quand rien n'a pu être comparé (relevé sur la vraie base : 20 championnats sur 75).
  const ligne = { mesure: 'moment', portee: 'Ligue Essai', moment: '-', livre: '-', cle: 'conclusion', n: 0, valeur: null, bas: null, haut: null, verdict: 'trop-peu', detail: { conclusion: null, phrase: 'trop peu de matchs pour juger', jugees: 0, type: 'une issue au hasard', comparaisons: [] } };
  const valeur = r.lignes.moments.find((x) => x.cle === 'valeur');
  const m = B.meilleurMomentDuChampionnat({ lignes: { moments: [ligne, { ...ligne, cle: 'conclusion|favori' }, valeur] } });
  assert.equal(m.mesure, false);
  assert.equal(m.conclusion, null);
  assert.deepEqual(Object.values(m.parType), [null, null, null], 'aucune phrase par type d’issue sans comparaison');
  assert.equal(m.valeurs.filter((v) => v.mesure).length, 1, 'les moments qui ont des cotes gardent leur valeur de clôture');
  assert.equal(m.comparaisons.filter((c) => c.mesuree).length, 0);
  // Comparé (n > 0) mais rien de prouvé : c'est une conclusion, « pas de moment meilleur prouvé ».
  const compare = B.meilleurMomentDuChampionnat({ lignes: { moments: [{ ...ligne, n: 5380, verdict: 'aucun', detail: { ...ligne.detail, phrase: 'pas de moment meilleur prouvé', jugees: 2 } }] } });
  assert.equal(compare.mesure, true);
  assert.deepEqual([compare.conclusion.cle, compare.conclusion.phrase, compare.conclusion.n], [null, 'pas de moment meilleur prouvé', 5380]);
  // La liste championnat par championnat : la ligne reste, dite « pas assez de relevés datés », sans nombre de matchs, hors du Σ.
  const resume = { moments: [{ championnat: 'EPL', conclusion: null, phrase: 'pas de moment meilleur prouvé', n: 5380, comparaisons: [] }, { championnat: 'Ligue Essai', conclusion: null, phrase: 'trop peu de matchs pour juger', n: 0, comparaisons: [] }] };
  const t = B.lignesDesChampionnats({ resume, championnats: r.championnats, selection: '*' });
  const essai = t.lignes.find((l) => l.portee === 'Ligue Essai');
  assert.deepEqual([essai.mesure, essai.conclusion, essai.precision, essai.n, essai.cle], [false, 'pas assez de relevés datés', 'aucune comparaison tôt / tard possible ici', null, null]);
  const epl = t.lignes.find((l) => l.portee === 'EPL');
  assert.deepEqual([epl.mesure, epl.conclusion, epl.n], [true, 'Pas de moment meilleur prouvé', 5380]);
  assert.deepEqual(t.pied.n, { championnats: 2, mesures: 1, tot: 0, apresCompos: 0, justeAvant: 0, aucun: 1, matchs: 5380 }, 'Σ : seuls les championnats comparés sont comptés');
  assert.equal(t.pied.texte.sigma, '2 championnats, 1 mesuré');
  assert.equal(t.pied.moyenne, 5380);
});

test('le 23/09 retrouvé, le choix du championnat, les états de la page, les chiffres clés et la provenance', () => {
  const r = toutes();
  const rep = B.reproductionDite(r.resume, r.livres);
  assert.equal(rep.mesuree, true);
  assert.equal(rep.retrouve, false, 'la base d’essai n’a pas le panier de 18 championnats du 23/09');
  assert.match(rep.texte, /^Pas retrouvé : le panier de matchs du 23\/09/);
  assert.equal(rep.reference.titre, 'Pinnacle (football-data)');
  assert.equal(rep.reference.perteLog, '0,9925');
  assert.equal(rep.reference.matchs, fr(15885));
  const trouve = B.reproductionDite({ reproduction: { retrouve: true, reference: { livre: 'fd|Pinnacle', perteLog: 0.9925, matchs: 15885, source: 's' }, mesure: { perteLog: 0.9925, matchs: 15878 }, meneur: 'fd|Pinnacle', classement: [{ livre: 'fd|Pinnacle', victoires: 3, defaites: 0, egalites: 0 }, { livre: 'fd|Bet365', victoires: 0, defaites: 3, egalites: 0 }], jugements: [{ autre: 'fd|Bet365', verdict: 'retenu', n: 15874, gain: 0.00078 }], periode: { de: '2023-07-01', a: '2026-09-23' } } }, r.livres);
  assert.equal(trouve.retrouve, true);
  assert.equal(trouve.texte, 'Retrouvé : Pinnacle (football-data) reste le plus juste, avec la même perte log qu’au 23/09.');
  assert.deepEqual(trouve.mesure, { perteLog: '0,9925', matchs: fr(15878) });
  assert.equal(trouve.jugements[0].ton, 'is-info');
  assert.deepEqual([B.reproductionDite(null).mesuree, B.reproductionDite(null).classement], [false, []]);
  // Les options du sélecteur : « Tous » d’abord, les favoris ensuite (groupes), un championnat hors appli sans drapeau.
  assert.deepEqual(B.optionsDesChampionnats(r).map((o) => o.value), ['*', 'EPL', 'Ligue Essai']);
  assert.equal(B.optionsDesChampionnats(r)[0].label, 'Tous les championnats');
  const opts = B.optionsDesChampionnats(r, { favorisEnPremier: (l) => [...l].reverse(), estFavori: (p) => p === 'Ligue Essai' });
  assert.deepEqual(opts.map((o) => [o.value, o.group ?? null, o.favorite ?? null]), [['*', null, null], ['Ligue Essai', 'Favoris', true], ['EPL', 'Tous les championnats', false]]);
  const horsAppli = B.optionsDesChampionnats({ championnats: [{ portee: 'fd:EC', nom: 'Angleterre — National League', horsAppli: true, lignes: 3 }] });
  assert.deepEqual([horsAppli[1].label, horsAppli[1].league ?? null, horsAppli[1].hint], ['Angleterre — National League', null, 'football-data']);
  // Les états de la page.
  const e = (x) => B.etatDeLaPage(x);
  assert.deepEqual([e({ chargement: true }).cle, e({ chargement: true }).vide], ['chargement', 'lecture en cours']);
  assert.equal(e({ reponse: s.jamais.corps }).cle, 'jamais');
  assert.equal(e({ reponse: s.pret.corps }).cle, 'pret');
  assert.equal(e({ reponse: s.pret.corps }).aRefaire, false);
  assert.equal(e({ reponse: s.autreVersion.corps }).aRefaire, true);
  assert.equal(e({ reponse: s.inconnu.corps }).cle, 'championnat-inconnu');
  assert.match(e({ reponse: s.inconnu.corps }).texte, /Le calcul n’a rien mesuré pour « Championnat de nulle part »/);
  assert.deepEqual([e({ erreur: 'Erreur interne du serveur.' }).cle, e({ erreur: 'Erreur interne du serveur.' }).ton], ['erreur', 'is-danger']);
  assert.equal(e({ erreur: 'Le serveur n\'est pas à jour : relancez demarrer-cotemaster.bat pour activer cette fonction.' }).cle, 'pas-a-jour-serveur');
  // Une case vide ne dit POURQUOI que si les chiffres du championnat sont lus (`calculLu`) : sinon, seulement ce qu'elle sait.
  const mots = (x) => [e(x).calculLu, e(x).vide, e(x).videControle];
  assert.deepEqual(mots({ reponse: s.pret.corps }), [true, 'pas mesuré dans ce championnat', 'aucun livre à classer']);
  assert.deepEqual(mots({ reponse: s.autreVersion.corps }), [true, 'pas mesuré dans ce championnat', 'aucun livre à classer'], 'un calcul d’une autre forme est lu comme un autre');
  assert.deepEqual(mots({ reponse: s.jamais.corps }), [false, 'pas encore mesuré', 'pas encore mesuré']);
  assert.deepEqual(mots({ reponse: s.inconnu.corps }), [false, 'championnat non mesuré', 'aucun livre à classer'], 'le contrôle du 23/09 ne dépend pas du championnat choisi');
  assert.deepEqual(mots({ chargement: true }), [false, 'lecture en cours', 'lecture en cours']);
  assert.deepEqual(mots({ erreur: 'Erreur interne du serveur.' }), [false, 'illisible : voir l’erreur plus haut', 'illisible : voir l’erreur plus haut']);
  assert.deepEqual(mots({ erreur: 'Le serveur n\'est pas à jour : relancez demarrer-cotemaster.bat pour activer cette fonction.' }), [false, 'serveur à relancer', 'serveur à relancer']);
  assert.deepEqual(mots({ erreur: 'Erreur interne du serveur.', reponse: s.pret.corps }), [false, 'illisible : voir l’erreur plus haut', 'illisible : voir l’erreur plus haut'], 'une erreur passe avant la dernière page lue');
  // Un lien vers un championnat inconnu : le champ garde son nom, dit « non mesuré » (au lieu de « Choisir… »).
  const inconnu = B.optionsDesChampionnats(s.inconnu.corps);
  assert.deepEqual(inconnu.slice(0, 2).map((o) => [o.value, o.label, o.hint ?? null]), [['*', 'Tous les championnats', null], ['Championnat de nulle part', 'Championnat de nulle part', 'non mesuré']]);
  assert.deepEqual(inconnu.slice(2).map((o) => o.value), ['EPL', 'Ligue Essai'], 'les championnats mesurés suivent');
  assert.equal(B.optionsDesChampionnats(s.pret.corps).some((o) => o.hint === 'non mesuré'), false);
  // Les chiffres clés et la provenance : lus dans le résumé et le calcul.
  const cles = B.chiffresCles(r);
  assert.equal(cles.calcul.valeur, `n° ${r.calcul.id}`);
  assert.equal(cles.cotes.valeur, fr(r.bilan.releves.cotes));
  assert.equal(cles.plusJuste.valeur, r.resume.plusJuste.cloture.titre);
  assert.equal(cles.plusJuste.detail, `à la clôture, perte log ${B.perteLogDite(r.resume.plusJuste.cloture.perteLog)}`);
  assert.equal(B.chiffresCles(s.jamais.corps).cotes.valeur, 'non lu');
  assert.equal(B.jourHeure('2026-10-18T19:16:10.109Z'), '18/10/2026 à 21 h 16', 'heure de Paris');
  assert.equal(B.jourHeure(null), 'date inconnue');
  const prov = B.provenanceDeLaPage(r);
  assert.equal(prov.source, 'football-data.co.uk · ESPN · 365Scores · Kalshi · Smarkets · The Odds API');
  assert.equal(prov.releveLe, r.calcul.finiLe);
  assert.equal(prov.fichier, r.base);
  assert.equal(B.provenanceDeLaPage(s.jamais.corps).releveLe, null);
});

test('le menu et le routeur : « Bookmakers » est une entrée de plus, de la couleur de Mes paris (aucune couleur de plus), une entrée active à la fois', () => {
  const routeur = lireUi('router', 'index.js');
  assert.match(routeur, /path: '\/bookmakers',\s*name: 'bookmakers',\s*component: \(\) => import\('@\/views\/BookmakersView\.vue'\),\s*meta: \{ title: 'Bookmakers', section: 'bets', nav: 'bookmakers' \}/);
  const menu = lireUi('components', 'layout', 'AppSidebar.vue');
  assert.match(menu, /\{ to: '\/bookmakers', section: 'bets', nav: 'bookmakers', label: 'Bookmakers', hint: '[^']+', icon: 'euro' \}/);
  const ordre = ["to: '/matches'", "to: '/paris'", "to: '/bookmakers'", "to: '/historique-moteur'", "to: '/sante-moteur'", "to: '/feuille-de-route'", "to: '/reglages'"].map((m) => menu.indexOf(m));
  assert.ok(ordre.every((x, i) => x > 0 && (i === 0 || x > ordre[i - 1])), 'Bookmakers juste après Mes paris, avant les pages du moteur');
  // Une entrée active à la fois : on rejoue les trois lignes du menu qui décident.
  const lignes = menu.split('\n').filter((l) => /^const (sectionActive|entreeActive|estActive) =/.test(l)).join('\n');
  const NAV = [
    { to: '/paris', section: 'bets' },
    { to: '/bookmakers', section: 'bets', nav: 'bookmakers' },
    { to: '/historique-moteur', section: 'history' }
  ];
  const actives = (meta) => {
    const calcul = new Function('route', 'computed', `${lignes}; return estActive;`);
    const estActive = calcul({ meta }, (fn) => ({ get value() { return fn(); } }));
    return NAV.filter(estActive).map((i) => i.to);
  };
  assert.deepEqual(actives({ section: 'bets' }), ['/paris'], 'Mes paris : seule son entrée');
  assert.deepEqual(actives({ section: 'bets', nav: 'bookmakers' }), ['/bookmakers'], 'Bookmakers : seule son entrée');
  assert.deepEqual(actives({ section: 'history' }), ['/historique-moteur']);
  // La section « bets » existe dans le bandeau du haut : la page y est nommée.
  assert.match(lireUi('components', 'layout', 'AppTopbar.vue'), /bets: 'Mes paris'/);
  assert.match(lireUi('assets', 'styles', 'tokens.css'), /\[data-section='bets'\]/);
});
