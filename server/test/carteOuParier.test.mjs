/**
 * La carte « où parier » (étape 23 du plan, 22/10/2026) : ses règles, son juge, sa table, son étape et ses lecteurs.
 *   node --test test/carteOuParier.test.mjs        (depuis server/)
 *
 * Le risque majeur de l'étape : déclarer verte une case PAR HASARD, et pousser Pierre à parier. D'où, en tête :
 *   1. une case à petit échantillon ne devient JAMAIS verte (ni rouge), même si on lui donnait un verdict ;
 *   2. K est compté (les cases jugées × les regards prévus), et le juge est celui de l'étape 16, jamais recodé ;
 *   3. une rouge prouvée sort rouge ; une case sans cote archivée reste TOUJOURS grise ;
 * puis la fenêtre du direct (lancement, adoptions, mesures « à l'ouverture » écartées), le banc relu (exact, code
 * précédent, K insuffisant), la table jamais réécrite, quand la carte et le banc du mois se font, le tri
 * d'Opportunités (rouges à la fin, vertes d'abord, rien de retiré), la route. Bases en mémoire, aucun réseau.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as M from '../src/data/bettingMap.js';
import * as C from '../src/data/bettingMapCalcul.js';
import { comparer, generateur } from '../src/bench/guard.js';
import { __testing as BASE } from '../src/data/db/matchStatsDb.js';
import { bancDuMoisDu, versionEnServiceDepuis } from '../src/data/rejeuDuServeur.js';
import { trierLesLignes } from '../src/data/opportunities.js';
import { etatPourLEcran, getBettingMap } from '../src/api/controllers/bettingMap.controller.js';

const SERVEUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.resolve(SERVEUR, '..', 'ui');

// ------------------------------------------------------------ des aides

/** Une base en mémoire avec les seules tables de la carte (bench_runs, engine_picks, betting_map, market_knowledge*). */
function base() {
  const db = new DatabaseSync(':memory:');
  for (const sql of BASE.DDL.filter((x) => /bench_runs|betting_map|engine_picks|market_knowledge/.test(x))) if (sql.startsWith('CREATE TABLE')) db.exec(sql);
  for (const sql of BASE.DDL.filter((x) => /bench_runs|betting_map|engine_picks|market_knowledge/.test(x))) if (!sql.startsWith('CREATE TABLE')) db.exec(sql);
  return db;
}

/** Des lignes du direct : `n` matchs, chacun `parMatch` lignes de valeur `valeur(i)`. */
const lignes = (n, valeur, parMatch = 1) => Array.from({ length: n * parMatch }, (_, k) => ({ bloc: `m${Math.floor(k / parMatch)}`, match: `m${Math.floor(k / parMatch)}`, date: '2026-10-10', a: 0, b: valeur(k) }));
/** Un « direct » fabriqué : { 'EPL|result': [...] }. */
const direct = (cases, ligues = []) => ({ parCase: new Map(Object.entries(cases)), pronostics: 0, mesures: 0, ecartees: {}, ligues: new Set(ligues) });
const FENETRE = C.fenetreDuDirect(null);
const MOTEUR = { empreinte: 'e-moteur', empreinteReglages: 'e-reglages', version: 4 };
const carteDe = (args) => C.construireLaCarte({ fenetre: FENETRE, moteur: MOTEUR, maintenant: Date.parse('2026-11-01T07:00:00Z'), ...args });
const caseDe = (carte, league, colonne) => carte.contenu.cases.find((k) => k.league === league && k.colonne === colonne);
/** Valeurs de clôture au hasard (graine fixe) autour de `moyenne`, écart-type ~ `sd`. */
function bruit(graine, moyenne, sd) {
  const u = generateur(graine);
  return () => moyenne + sd * (u() + u() + u() - 1.5) * 2;
}

/** Un résumé de banc fabriqué (la forme de resume.carte de bench/resume.js). */
function resumeDeBanc({ variantesCarte = 608 } = {}) {
  const j = (verdict, matchs, gain = -0.05, blocs = matchs) => ({ verdict, n: { lignes: matchs, blocs, matchs }, gain, fourchette: [gain - 0.03, gain + 0.03], enPourcent: { gain: gain * 100, fourchette: [(gain - 0.03) * 100, (gain + 0.03) * 100], quoi: 'de perte log en moins' }, variantes: variantesCarte });
  return {
    juge: { variantes: 114, variantesCarte },
    carte: [
      { type: 'probabilites', tranche: 'P2', league: 'EPL', marketKey: 'totalGoals', ligne: 2.5, face: 'marche', n: 1520, juge: j('moins-bon', 1520, -0.055) },
      { type: 'probabilites', tranche: 'P2', league: 'EPL', marketKey: 'result', ligne: null, face: 'marche', n: 1520, juge: j('pas-prouve', 1520, 0.0003) },
      { type: 'probabilites', tranche: 'P2', league: 'Serie A - Italy', marketKey: 'result', ligne: null, face: 'marche', n: 1519, juge: j('retenu', 1519, 0.004) },
      { type: 'probabilites', tranche: 'P2', league: 'EPL', marketKey: 'teamCorners:home', ligne: null, face: 'repere', n: 1500, juge: j('retenu', 1500, 0.05) },
      { type: 'probabilites', tranche: 'P2', league: 'EPL', marketKey: 'teamCorners:away', ligne: null, face: 'repere', n: 1500, juge: j('moins-bon', 1500, -0.05) },
      { type: 'probabilites', tranche: 'P3', league: 'Ligue 1 - France', marketKey: 'totalGoals', ligne: 2.5, face: 'marche', n: 380, juge: j('moins-bon', 380, -0.07) },
      { type: 'probabilites', tranche: 'P2', league: 'EPL', marketKey: 'scoreExact', ligne: null, face: 'repere', n: 1520, juge: j('retenu', 1520, 0.03) },
      { type: 'paris', zone: 'preuve', league: 'EPL', marketKey: 'result', n: 150, periode: '2019-07-01 → 2023-06-30', juge: { ...j('pas-assez-de-matchs', 150, 0.05, 104), enPourcent: { gain: 5, fourchette: null, quoi: 'de valeur de clôture en plus' } } },
      { type: 'paris', zone: 'preuve', league: 'fd:SC1', marketKey: 'result', n: 900, periode: '2019-07-01 → 2023-06-30', juge: { ...j('retenu', 900, 0.04, 400), enPourcent: { gain: 4, fourchette: [1, 7], quoi: 'de valeur de clôture en plus' } } },
      { type: 'paris', zone: 'indicatif', league: 'EPL', marketKey: 'result', n: 30, periode: '2023 → 2025', juge: j('retenu', 3000, 0.08) }
    ]
  };
}

// ============================================================ 1. une petite case n'est jamais verte

test('petit échantillon : 199 matchs à +20 % de valeur de clôture chacun → « trop peu de matchs », grise ; à 200 matchs, la même mesure peut verdir', () => {
  const peu = carteDe({ direct: direct({ 'EPL|result': lignes(199, () => 0.2) }) });
  const k = caseDe(peu, 'EPL', 'result');
  assert.equal(k.couleur, 'gris');
  assert.equal(k.raison, 'trop-peu');
  assert.match(k.phrase, /199 sur 200/);
  const assez = carteDe({ direct: direct({ 'EPL|result': lignes(200, (i) => 0.2 + (i % 7) * 0.001) }) });
  assert.equal(caseDe(assez, 'EPL', 'result').couleur, 'vert', 'au minimum du juge, un avantage énorme se prouve');
});

test('petit échantillon : 300 tirages au sort (taille de 1 à 199 matchs, moyenne de −30 % à +30 %) — jamais vert, jamais rouge, toujours « trop peu »', () => {
  const u = generateur(2310);
  for (let t = 0; t < 300; t++) {
    const n = 1 + Math.floor(u() * 199);
    const moyenne = (u() - 0.5) * 0.6;
    const carte = carteDe({ direct: direct({ 'EPL|bothTeamsScore': lignes(n, bruit(t + 1, moyenne, 0.01)) }) });
    const k = caseDe(carte, 'EPL', 'bothTeamsScore');
    assert.equal(k.couleur, 'gris', `tirage ${t} : ${n} matchs à ${moyenne}`);
    assert.equal(k.raison, 'trop-peu');
  }
});

test('petit échantillon : le juge compte des MATCHS (bloc = match) — 150 matchs à deux lignes chacun (300 lignes) restent « trop peu »', () => {
  const carte = carteDe({ direct: direct({ 'EPL|totalGoals:2.5': lignes(150, () => 0.3, 2) }) });
  const k = caseDe(carte, 'EPL', 'totalGoals:2.5');
  assert.equal(k.raison, 'trop-peu');
  assert.equal(k.epreuves[0].matchs, 150);
  assert.equal(k.epreuves[0].blocs, 150);
});

test('petit échantillon : même si une épreuve arrivait « retenu » ou « moins bon » sous 200 matchs (ou 200 matchs en moins de 200 journées), la règle la lit « trop peu »', () => {
  for (const verdict of ['retenu', 'moins-bon']) {
    assert.deepEqual(M.couleurDeLaCase({ colonne: 'result', epreuves: [{ id: 'V-VC', verdict, matchs: 150 }] }), { couleur: 'gris', raison: 'trop-peu' });
    assert.deepEqual(M.couleurDeLaCase({ colonne: 'result', epreuves: [{ id: 'H-VC', verdict, matchs: 900, blocs: 120 }] }), { couleur: 'gris', raison: 'trop-peu' });
    assert.deepEqual(M.couleurDeLaCase({ colonne: 'result', epreuves: [{ id: 'V-VC', verdict }] }), { couleur: 'gris', raison: 'trop-peu' }, 'sans nombre de matchs : rien');
  }
  assert.equal(M.couleurDeLaCase({ colonne: 'result', epreuves: [{ id: 'V-VC', verdict: 'retenu', matchs: 200, blocs: 200 }] }).couleur, 'vert');
  assert.equal(M.couleurDeLaCase({ colonne: 'result', epreuves: [{ id: 'V-VC', verdict: 'mystere', matchs: 5000 }] }).raison, 'trop-peu', 'un verdict inconnu ne colore rien');
  assert.equal(M.MIN_MATCHS, 200);
});

// ============================================================ 2. K compté, le juge de l'étape 16

test('K compté : le juge reçoit variantes = Kv × max(24, regards + 1), Kv = toutes les cases qui ont au moins une mesure (même maigres), avec ses réglages par défaut', () => {
  const appels = [];
  const espion = (l, o) => {
    appels.push({ n: l.length, o });
    return comparer(l, o);
  };
  const cases = { 'EPL|result': lignes(10, () => 0.01), 'EPL|bothTeamsScore': lignes(3, () => 0.01), 'Liga MX|totalGoals:2.5': lignes(250, () => 0.0) };
  const carte = carteDe({ direct: direct(cases), juge: espion });
  assert.equal(carte.kVivant, 3);
  assert.equal(appels.length, 3);
  for (const a of appels) {
    assert.deepEqual(Object.keys(a.o).sort(), ['alpha', 'graine', 'minBlocs', 'mode', 'sens', 'tirages', 'variantes']);
    assert.equal(a.o.variantes, 3 * 24);
    assert.equal(a.o.minBlocs, 200);
    assert.equal(a.o.alpha, 0.05);
    assert.equal(a.o.tirages, 1000);
    assert.equal(a.o.sens, 'max', 'valeur de clôture : plus grand est mieux');
    assert.equal(a.o.mode, 'moyenne');
  }
  // 40 cartes déjà calculées depuis le début de la fenêtre du 1N2 : son juge passe à 3 × 41 ; les autres familles gardent 24.
  appels.length = 0;
  const c2 = carteDe({ direct: direct(cases), regards: { result: 40, totalGoals: 3 }, juge: espion });
  assert.deepEqual(appels.map((a) => a.o.variantes).sort((x, y) => x - y), [72, 72, 123]);
  assert.equal(c2.regards, 41);
  // Une case de plus (même invisible dans la grille filtrée) : K grandit.
  appels.length = 0;
  carteDe({ direct: direct({ ...cases, 'Allsvenskan - Sweden|result': lignes(1, () => 0) }), juge: espion });
  assert.ok(appels.every((a) => a.o.variantes === 4 * 24));
});

test('K compté : avec K, un vrai petit avantage que le juge seul (K = 1) retiendrait reste « pas prouvé » sur la carte', () => {
  const l = lignes(300, bruit(77, 0.01, 0.05));
  assert.equal(comparer(l, { sens: 'max', graine: 23 }).verdict, 'retenu', 'seul, il passerait');
  const cases = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`L${i}|result`, i === 0 ? l : lignes(5, () => 0)]));
  const carte = carteDe({ direct: direct(cases) });
  assert.equal(carte.kVivant, 100);
  assert.equal(caseDe(carte, 'L0', 'result').raison, 'pas-prouve', '100 cases × 24 regards : la fourchette s’élargit d’autant');
});

test('jamais recoder le juge : la carte n’importe que comparer (guard.js) et ne tire rien au hasard', () => {
  for (const f of ['bettingMap.js', 'bettingMapCalcul.js', 'bettingMapEnfant.js']) {
    const texte = fs.readFileSync(path.join(SERVEUR, 'src', 'data', f), 'utf8');
    assert.doesNotMatch(texte, /Math\.random|generateur\(|quantile|zPour|loiNormale|percentile/, `${f} : un bout de juge recodé`);
    const imports = [...texte.matchAll(/import \{([^}]*)\} from '\.\.\/bench\/guard\.js'/g)].map((m) => m[1].trim());
    assert.ok(imports.every((x) => x === 'comparer'), `${f} : seulement comparer de guard.js`);
  }
  assert.match(fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'bettingMapCalcul.js'), 'utf8'), /import \{ comparer \} from '\.\.\/bench\/guard\.js'/);
});

// ============================================================ 3. rouge prouvée, sans cote toujours grise

test('rouge prouvée : 400 matchs où la cote part contre le moteur (−6 %) → rouge « moins bien que le marché » ; la perte log du banc « moins bon » → rouge ; « retenu » en perte log seule → jamais vert', () => {
  const carte = carteDe({ direct: direct({ 'EPL|bothTeamsScore': lignes(400, bruit(5, -0.06, 0.03)) }) });
  const k = caseDe(carte, 'EPL', 'bothTeamsScore');
  assert.equal(k.couleur, 'rouge');
  assert.match(k.phrase, /^Moins bien que le marché : après ses choix, la cote est partie contre le moteur/);
  const banc = C.lectureDuBanc(resumeDeBanc(), { rejeuId: 10 });
  const c2 = carteDe({ banc, rejeu: { id: 10, etiquette: 'exact' }, direct: direct({}) });
  const rouge = caseDe(c2, 'EPL', 'totalGoals:2.5');
  assert.equal(rouge.couleur, 'rouge');
  assert.match(rouge.phrase, /se trompe plus que la cote \(−5,5 % \[−8,5 ; −2,5\] de perte log, sur 1\s520 matchs, 2019-2023\) — son écart avec la cote n’est pas une value\./);
  const pl = caseDe(c2, 'Serie A - Italy', 'result');
  assert.equal(pl.couleur, 'gris', 'mieux que la cote juste ne paie pas la marge : jamais vert sur la perte log');
  assert.equal(pl.raison, 'pas-prouve');
});

test('sans cote archivée : toujours grise, quoi qu’on lui donne (repère retenu, épreuve de prix fabriquée, lignes du direct)', () => {
  for (const colonne of ['teamGoals', 'resultAndTotal', 'totalCorners', 'teamCorners', 'totalShots', 'teamShots', 'totalShotsOnTarget', 'teamShotsOnTarget']) {
    assert.deepEqual(M.couleurDeLaCase({ colonne, epreuves: [{ id: 'H-VC', verdict: 'retenu', matchs: 5000, blocs: 5000 }, { id: 'V-VC', verdict: 'retenu', matchs: 5000 }] }), { couleur: 'gris', raison: 'sans-cote' });
  }
  const banc = C.lectureDuBanc(resumeDeBanc(), { rejeuId: 10 });
  const carte = carteDe({ banc, rejeu: { id: 10, etiquette: 'exact' }, direct: direct({ 'EPL|teamCorners': lignes(900, () => 0.3) }) });
  const k = caseDe(carte, 'EPL', 'teamCorners');
  assert.equal(k.couleur, 'gris');
  assert.equal(k.raison, 'sans-cote');
  assert.equal(k.phrase, 'Pas de cote archivée pour ce marché : impossible de mesurer un avantage contre le bookmaker.');
  assert.deepEqual(k.infos.repere, { cases: 2, retenu: 1, moinsBon: 1, periode: '2019-2023' }, 'le repère reste une information');
  assert.deepEqual([...M.COLONNES_AVEC_COTE].sort(), ['bothTeamsScore', 'result', 'totalGoals:1.5', 'totalGoals:2.5', 'totalGoals:3.5']);
});

test('contradictoire : un « retenu » de prix et un « moins bon » ensemble → grise « contradictoire », jamais verte', () => {
  const r = M.couleurDeLaCase({ colonne: 'result', epreuves: [{ id: 'H-VC', verdict: 'retenu', matchs: 900, blocs: 400 }, { id: 'H-PL', verdict: 'moins-bon', matchs: 1500 }] });
  assert.deepEqual(r, { couleur: 'gris', raison: 'contradictoire' });
  assert.match(M.phraseDeLaCase({ ...r, epreuves: [] }), /rien n’est conclu/);
});

// ============================================================ 4. le banc relu, les informations

test('banc relu : P2 face au marché et paris « preuve » sont des épreuves ; P3, paris indicatifs, repère et score exact ne sont que des informations (ou rien)', () => {
  const b = C.lectureDuBanc(resumeDeBanc(), { rejeuId: 10 });
  assert.equal(b.kBanc, 608);
  assert.equal(b.employees, 5, '3 perte log P2 face au marché + 2 paris preuve');
  assert.deepEqual(b.cases.get('EPL|result').epreuves.map((e) => e.id).sort(), ['H-PL', 'H-VC']);
  assert.equal(b.cases.get('Ligue 1 - France|totalGoals:2.5').epreuves.length, 0, 'P3 : jamais une épreuve');
  assert.equal(b.cases.get('Ligue 1 - France|totalGoals:2.5').infos.indicatif.verdict, 'moins-bon');
  assert.ok(b.cases.get('EPL|result').infos.parisIndicatifs);
  assert.ok(![...b.cases.keys()].some((k) => k.includes('scoreExact')), 'le score exact n’est pas une colonne');
  const carte = carteDe({ banc: b, rejeu: { id: 10, etiquette: 'exact' }, direct: direct({}) });
  assert.equal(caseDe(carte, 'Ligue 1 - France', 'totalGoals:2.5').couleur, 'gris', '2023-2024 déjà regardé : indicatif seulement');
  assert.equal(caseDe(carte, 'fd:SC1', 'result').couleur, 'vert', 'une épreuve de prix retenue au banc (400 journées) : verte');
  assert.equal(carte.contenu.aAjouter.find((x) => x.league === 'fd:SC1').statut, 'a-ajouter');
  assert.equal(carte.contenu.championnats.find((x) => x.league === 'fd:SC1').nom, 'Écosse — Championship');
});

test('banc relu : un K′ du banc plus petit que les cases employées → ses verdicts ne valent rien (« pas prouvé », banc à relancer), jamais recalculés', () => {
  const b = C.lectureDuBanc(resumeDeBanc({ variantesCarte: 3 }), { rejeuId: 9 });
  const carte = carteDe({ banc: b, rejeu: { id: 9, etiquette: 'exact' }, direct: direct({}) });
  assert.equal(caseDe(carte, 'fd:SC1', 'result').couleur, 'gris');
  assert.equal(caseDe(carte, 'EPL', 'totalGoals:2.5').couleur, 'gris');
  assert.equal(carte.banc.etiquette, 'k-insuffisant');
  assert.match(caseDe(carte, 'EPL', 'totalGoals:2.5').epreuves[0].note, /banc à relancer/);
});

test('le rejeu de la carte : même empreinte (« exact »), sinon mêmes réglages (« code-precedent »), sinon aucun ; seuls les rejeux réussis avec P2 et l’avant-match comptent', () => {
  const db = base();
  const ins = db.prepare('INSERT INTO bench_runs (lance_le, fini_le, ou, version_banc, format_lignes, empreinte_moteur, empreinte_code, version_moteur, options, bilan, resume) VALUES (?, ?, ?, 1, 1, ?, ?, NULL, ?, ?, ?)');
  const opts = (periodes, prix, reglages) => JSON.stringify({ periodes, prix, config: { empreinte: { football: reglages } } });
  ins.run('2026-10-19T10:00:00Z', '2026-10-19T10:10:00Z', 'serveur', 'A', 'c1', opts(['P2', 'P3'], ['fd-avant-match'], 'R1'), '{}', '{"carte":[]}');
  ins.run('2026-10-20T10:00:00Z', '2026-10-20T10:10:00Z', 'serveur', 'B', 'c2', opts(['P2'], ['fd-avant-match'], 'R1'), '{}', '{"carte":[]}');
  ins.run('2026-10-21T10:00:00Z', '2026-10-21T10:10:00Z', 'serveur', 'C', 'c3', opts(['P3'], ['fd-avant-match'], 'R2'), '{}', '{"carte":[]}');
  ins.run('2026-10-21T11:00:00Z', '2026-10-21T11:10:00Z', 'serveur', 'D', 'c4', opts(['P2'], ['fd-avant-match'], 'R2'), '{"erreur":"enfant arrêté"}', null);
  ins.run('2026-10-21T12:00:00Z', null, 'serveur', 'E', 'c5', opts(['P2'], ['fd-avant-match'], 'R2'), null, null);
  const rejeux = M.rejeuxUtilesALaCarte({ database: db });
  assert.deepEqual(rejeux.map((r) => r.id), [2, 1]);
  assert.deepEqual(M.rejeuDeLaCarte(rejeux, { empreinte: 'A', empreinteReglages: 'R1' }), { ...rejeux[1], etiquette: 'exact' });
  assert.equal(M.rejeuDeLaCarte(rejeux, { empreinte: 'Z', empreinteReglages: 'R1' }).etiquette, 'code-precedent');
  assert.equal(M.rejeuDeLaCarte(rejeux, { empreinte: 'Z', empreinteReglages: 'R1' }).id, 2);
  assert.equal(M.rejeuDeLaCarte(rejeux, { empreinte: 'Z', empreinteReglages: 'R2' }), null, 'réglages changés : banc à relancer');
});

test('vos vrais paris ne décident jamais : 500 paris gagnants à +30 % de valeur de clôture ne changent aucune couleur (ils sont dits, pour information)', () => {
  const bets = Array.from({ length: 500 }, (_, i) => ({ id: `b${i}`, createdAt: '2026-10-10T10:00:00Z', status: 'won', legs: [{ marketId: 'result', params: { outcome: 'home' }, predictedOutcome: 'home', league: 'EPL', odds: 2.5, status: 'won', homeName: 'A', awayName: 'B' }] }));
  const vosParis = C.vosParisParCase({ bets, mesurer: () => ({ closeProb: 0.52 }) });
  const v = vosParis.get('EPL|result');
  assert.equal(v.paris, 500);
  assert.ok(v.valeurCloture > 29);
  const sans = carteDe({ direct: direct({}, ['EPL']) });
  const avec = carteDe({ direct: direct({}, ['EPL']), vosParis });
  assert.equal(caseDe(avec, 'EPL', 'result').couleur, caseDe(sans, 'EPL', 'result').couleur);
  assert.equal(caseDe(avec, 'EPL', 'result').raison, 'pas-mesuree');
  assert.match(caseDe(avec, 'EPL', 'result').infos.vosParis.quoi, /ne décident jamais/);
});

// ============================================================ 5. la fenêtre du direct

test('fenêtre du direct : depuis le lancement (24/09/2026) ; une ADOPTION la fait repartir pour les familles de sa candidate, un retour arrière pour toutes', () => {
  const f0 = C.fenetreDuDirect(null);
  assert.deepEqual(f0.parFamille, { result: '2026-09-24T00:00:00.000Z', totalGoals: '2026-09-24T00:00:00.000Z', bothTeamsScore: '2026-09-24T00:00:00.000Z' });
  const brut = {
    journal: [
      { le: '2026-10-07T16:00:00Z', action: 'creation', version: 1 },
      { le: '2026-11-15T09:00:00Z', action: 'adoption', version: 5, candidate: 'modele-buts-v1' },
      { le: '2026-11-20T09:00:00Z', action: 'reglages', version: 6 }
    ],
    candidatesPassees: [{ id: 'modele-buts-v1', fin: 'adoptee', marches: ['totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal'] }]
  };
  const f1 = C.fenetreDuDirect(brut);
  assert.equal(f1.parFamille.result, '2026-09-24T00:00:00.000Z', 'le 1N2 n’est pas touché par le modèle de buts');
  assert.equal(f1.parFamille.totalGoals, '2026-11-15T09:00:00Z');
  assert.equal(f1.parFamille.bothTeamsScore, '2026-11-15T09:00:00Z');
  const f2 = C.fenetreDuDirect({ ...brut, journal: [...brut.journal, { le: '2026-12-01T08:00:00Z', action: 'retour', version: 4 }] });
  assert.ok(Object.values(f2.parFamille).every((d) => d === '2026-12-01T08:00:00Z'));
});

test('les lignes du direct : première valeur seulement ; avant la fenêtre, déjà vu, sans identifiant, « à l’ouverture » ou sans clôture → écartés ET comptés ; le reste devient une ligne par pronostic', () => {
  const db = base();
  const ins = db.prepare("INSERT INTO engine_picks (fixture_key, market_key, version, recorded_at, origin, league, date, kickoff, home_name, away_name, home_id, away_id, market_id, params, choice) VALUES (?, ?, ?, ?, 'nuit', ?, ?, ?, 'A', 'B', ?, ?, ?, ?, ?)");
  ins.run('f1', 'result', 1, '2026-10-01T02:00:00Z', 'EPL', '2026-10-04', '2026-10-04T14:00:00Z', '1', '2', 'result', '{}', 'home');
  ins.run('f1', 'result', 2, '2026-10-02T02:00:00Z', 'EPL', '2026-10-04', '2026-10-04T14:00:00Z', '1', '2', 'result', '{}', 'away');
  ins.run('f0', 'result', 1, '2026-09-20T02:00:00Z', 'EPL', '2026-09-23', null, '1', '2', 'result', '{}', 'home');
  ins.run('f2', 'totalGoals', 1, '2026-11-10T02:00:00Z', 'EPL', '2026-11-12', null, '3', '4', 'totalGoals', '{"line":2.5,"side":"over"}', 'over');
  ins.run('f3', 'totalGoals', 1, '2026-11-17T02:00:00Z', 'EPL', '2026-11-19', null, '3', '4', 'totalGoals', '{"line":2.5,"side":"over"}', 'over');
  ins.run('f4', 'result', 1, '2026-10-05T02:00:00Z', 'EPL', '2026-10-06', null, null, '2', 'result', '{}', 'home');
  ins.run('f5', 'result', 1, '2026-10-05T02:00:00Z', 'Liga MX', '2026-10-06', null, '5', '6', 'result', '{}', 'home');
  ins.run('f6', 'bothTeamsScore', 1, '2026-10-05T02:00:00Z', 'Liga MX', '2026-10-06', null, '5', '6', 'bothTeamsScore', '{}', 'yes');
  ins.run('f7', 'totalGoals', 1, '2026-10-05T02:00:00Z', 'Liga MX', '2026-10-06', null, '5', '6', 'totalGoals', '{"line":0.5,"side":"over"}', 'over');
  const fenetre = C.fenetreDuDirect({ journal: [{ le: '2026-11-15T00:00:00Z', action: 'adoption', candidate: 'c' }], candidatesPassees: [{ id: 'c', fin: 'adoptee', marches: ['totalGoals'] }] });
  const vus = [];
  const mesurer = (e) => {
    vus.push(e);
    if (e.league === 'Liga MX' && e.marketId === 'result') return { pickProb: 0.5, closeProb: 0.55, approx: 'ouverture' };
    if (e.marketId === 'bothTeamsScore') return { raison: 'marcheAbsent' };
    return { pickProb: 0.5, closeProb: 0.55 };
  };
  const d = C.lignesDuDirect({ database: db, fenetre, mesurer, vues: [] });
  assert.deepEqual(d.ecartees, { horsCarte: 1, avantLaFenetre: 2, sansIdentifiant: 1, aLOuverture: 1, marcheAbsent: 1 });
  assert.deepEqual([...d.parCase.keys()].sort(), ['EPL|result', 'EPL|totalGoals:2.5']);
  assert.equal(d.parCase.get('EPL|result').length, 1, 'la révision 2 n’est jamais lue');
  assert.equal(d.parCase.get('EPL|result')[0].bloc, 'f1');
  assert.ok(Math.abs(d.parCase.get('EPL|result')[0].b - (2 * 0.55 - 1)) < 1e-12, 'valeur de clôture = cote juste du choix × probabilité de clôture − 1');
  assert.equal(d.mesures, 2);
  assert.ok(vus.every((e) => e.idsDuMagasin?.home && e.idsDuMagasin?.away), 'les identifiants du gel, jamais les noms');
  const d2 = C.lignesDuDirect({ database: db, fenetre, mesurer, vues: [{ de: '2026-10-01', a: '2026-10-31' }] });
  assert.equal(d2.ecartees.dejaVu, 4, 'une fenêtre déjà vue écarte, et le dit');
});

// ============================================================ 6. la table, jamais réécrite

test('table betting_map : une carte rangée par INSERT, relue (la dernière, par mois, par numéro), jamais réécrite (UPDATE refusé), toutes gardées ; les regards se comptent dessus', () => {
  const db = base();
  const carte = carteDe({ direct: direct({ 'EPL|result': lignes(5, () => 0) }) });
  const id1 = M.ecrireLaCarte({ database: db, carte });
  const id2 = M.ecrireLaCarte({ database: db, carte: { ...carte, mois: '2026-12', calculeLe: '2026-12-01T07:00:00.000Z', raison: 'mensuelle' } });
  assert.deepEqual([id1, id2], [1, 2]);
  assert.equal(M.lireLaCarte({ database: db }).id, 2);
  assert.equal(M.lireLaCarte({ database: db, mois: '2026-11' }).id, 1);
  assert.equal(M.lireLaCarte({ database: db, id: 1 }).contenu.cases.length, carte.contenu.cases.length);
  assert.equal(M.lireLaCarte({ database: db, avecContenu: false }).contenu, undefined);
  assert.throws(() => db.prepare("UPDATE betting_map SET raison = 'x' WHERE id = 1").run(), /ne se réécrit jamais/);
  assert.equal(M.listeDesCartes({ database: db }).length, 2);
  assert.equal(M.cartesDepuis({ database: db, depuis: '2026-11-15T00:00:00Z' }), 1);
  assert.equal(M.lireLaCarte({ database: new DatabaseSync(':memory:') }), null, 'table absente : aucune carte, pas d’erreur');
});

test('lecteurs : sans carte, rien ne change ; une carte d’autres réglages suspend ses couleurs (« Carte d’un autre moteur »)', () => {
  const db = base();
  assert.equal(M.carteDesLecteurs({ database: db, empreinteReglages: 'e-reglages' }), null);
  const banc = C.lectureDuBanc(resumeDeBanc(), { rejeuId: 10 });
  M.ecrireLaCarte({ database: db, carte: carteDe({ banc, rejeu: { id: 10, etiquette: 'exact' }, direct: direct({}) }) });
  const lue = M.carteDesLecteurs({ database: db, empreinteReglages: 'e-reglages' });
  assert.equal(lue.aJour, true);
  assert.equal(M.caseDuPari(lue, 'EPL', 'over25').couleur, 'rouge');
  assert.equal(M.caseDuPari(lue, 'EPL', 'under25').couleur, 'rouge', 'plus ET moins de 2,5 : une seule case');
  assert.equal(M.caseDuPari(lue, 'EPL', 'over15').raison, 'pas-mesuree');
  const perimee = M.carteDesLecteurs({ database: db, empreinteReglages: 'autres' });
  assert.equal(M.caseDuPari(perimee, 'EPL', 'over25').couleur, 'gris');
  assert.equal(M.caseDuPari(perimee, 'EPL', 'over25').raison, 'perimee');
  const data = { matches: [{ league: 'EPL', markets: [{ key: 'over25' }, { key: 'home' }] }] };
  assert.equal(M.avecLaCarteSurLeReperage(data, null), data, 'sans carte : les mêmes données, rien d’ajouté');
  const avec = M.avecLaCarteSurLeReperage(data, lue);
  assert.equal(avec.matches[0].markets[0].carte.couleur, 'rouge');
  assert.equal(avec.carte.aJour, true);
});

test('les colonnes : les 9 clés du Repérage et d’Opportunités, les cases du banc et les pronostics gelés tombent dans la bonne colonne', () => {
  assert.deepEqual(
    ['home', 'draw', 'away', 'over15', 'over25', 'under25', 'over35', 'bttsYes', 'bttsNo', 'inconnu'].map(M.colonneDuMarcheDuReperage),
    ['result', 'result', 'result', 'totalGoals:1.5', 'totalGoals:2.5', 'totalGoals:2.5', 'totalGoals:3.5', 'bothTeamsScore', 'bothTeamsScore', null]
  );
  assert.deepEqual([['totalGoals', 2.5], ['totalGoals', 0.5], ['teamGoals:home', 1.5], ['teamCorners:away', null], ['scoreExact', null], ['result', null]].map(([k, l]) => M.colonneDuBanc(k, l)), ['totalGoals:2.5', null, 'teamGoals', 'teamCorners', null, 'result']);
  assert.deepEqual([['totalGoals', '{"line":3.5}'], ['totalGoals', { line: 1.5 }], ['totalGoals', 'illisible'], ['bothTeamsScore', null]].map(([k, p]) => M.colonneDuPronostic(k, p)), ['totalGoals:3.5', 'totalGoals:1.5', null, 'bothTeamsScore']);
  assert.equal(M.COLONNES.length, 13);
});

// ============================================================ 7. quand la carte, quand le banc du mois

test('quand la carte se calcule : jamais sans rejeu du banc (« Lancer le banc ») ; dès qu’un rejeu existe ; à un nouveau rejeu ; aux réglages changés ; le 1er du mois à 6 h (Paris) ; jamais au simple clic', () => {
  const rejeu = { id: 10, etiquette: 'exact' };
  const derniere = { id: 1, mois: '2026-10', calculeLe: '2026-10-22T08:00:00.000Z', banc: { id: 10 }, moteur: { empreinteReglages: 'e-reglages' } };
  const a = (x) => C.carteAFaire({ moteur: MOTEUR, maintenant: Date.parse('2026-10-25T10:00:00Z'), ...x });
  assert.equal(a({ rejeu: null }).du, false);
  assert.match(a({ rejeu: null }).pourquoi, /Lancer le banc/);
  assert.deepEqual([a({ rejeu }).du, a({ rejeu }).raison], [true, 'premiere']);
  assert.deepEqual([a({ rejeu: { id: 11 }, derniere }).du, a({ rejeu: { id: 11 }, derniere }).raison], [true, 'nouveau-banc']);
  assert.equal(a({ rejeu, derniere: { ...derniere, moteur: { empreinteReglages: 'anciens' } } }).raison, 'reglages');
  assert.equal(a({ rejeu, derniere, manuel: true }).du, false, 'un clic ne fabrique pas de regard');
  assert.match(a({ rejeu, derniere, manuel: true }).pourquoi, /un clic ne recalcule pas/);
  // Le 1er novembre : 5 h 59 de Paris (4 h 59 UTC), non ; 6 h, oui.
  assert.equal(C.carteAFaire({ rejeu, derniere, moteur: MOTEUR, maintenant: Date.parse('2026-11-01T04:59:00Z') }).du, false);
  assert.deepEqual(C.carteAFaire({ rejeu, derniere, moteur: MOTEUR, maintenant: Date.parse('2026-11-01T05:00:00Z') }).raison, 'mensuelle');
  assert.equal(C.carteAFaire({ rejeu, derniere: { ...derniere, mois: '2026-11', calculeLe: '2026-11-01T05:30:00.000Z' }, moteur: MOTEUR, maintenant: Date.parse('2026-11-02T05:00:00Z') }).du, false, 'une fois par mois');
  assert.equal(M.debutDuMois('2026-11'), '2026-10-31T23:00:00.000Z');
  assert.equal(M.debutDuMois('2026-07'), '2026-06-30T22:00:00.000Z', 'heure d’été');
});

test('le banc du mois : jamais le premier rejeu (aucun rejeu → rien) ; une tentative par mois ; seulement pour un moteur changé AVANT le 1er ; pas avant 6 h le 1er', () => {
  const rejeux = [{ id: 10, moteur: { empreinte: 'ancien' } }];
  const b = (x) => bancDuMoisDu({ maintenant: Date.parse('2026-11-01T06:00:00Z'), empreinteMoteur: 'nouveau', enServiceDepuis: '2026-10-22T05:00:00Z', rejeux, tentatives: [], ...x });
  assert.equal(b({}).du, true);
  assert.match(b({ rejeux: [] }).raison, /premier se lance d’un clic/);
  assert.equal(b({ rejeux: [] }).du, false);
  assert.equal(b({ tentatives: [{ id: 11 }] }).du, false);
  assert.equal(b({ empreinteMoteur: 'ancien' }).du, false, 'rien n’a changé');
  assert.equal(b({ enServiceDepuis: '2026-11-15T09:00:00Z', maintenant: Date.parse('2026-11-20T10:00:00Z') }).du, false, 'une adoption du 15 attend le 1er du mois suivant');
  assert.equal(b({ maintenant: Date.parse('2026-11-01T04:30:00Z') }).du, false, '5 h 30 à Paris');
  assert.equal(b({ maintenant: Date.parse('2026-11-03T10:00:00Z') }).du, true, 'appli fermée le 1er : la première vérification d’après');
  assert.equal(versionEnServiceDepuis({ enService: 4, journal: [{ le: '2026-10-07T00:00:00Z', version: 1 }, { le: '2026-10-22T05:00:00Z', version: 4 }] }), '2026-10-22T05:00:00Z');
  assert.equal(versionEnServiceDepuis(null), null);
  // Jamais pendant une passe : appelé après runOnce, le verrou rendu (matchStatsAutoRefresh.js).
  const job = fs.readFileSync(path.join(SERVEUR, 'src', 'jobs', 'matchStatsAutoRefresh.js'), 'utf8');
  assert.match(job, /await runOnce\(reason\);\n(?: {4}\/\/.*\n)* {4}const banc = relancerLeBancDuMoisSiBesoin\(\);/);
  const rejeuDuServeur = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'rejeuDuServeur.js'), 'utf8');
  assert.match(rejeuDuServeur, /if \(isRefreshRunning\(\)\) return dire\(false/);
  assert.match(rejeuDuServeur, /withRefreshLock\(tacheDeRejeu\(/);
  assert.match(fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'db', 'bancAPart.js'), 'utf8'), /commencerCalculLourd\('banc d’essai'\)/, 'le rejeu prend le jeton du calcul lourd');
});

test('l’étape « carteOuParier » : après la calibration, avant la sauvegarde ; sans rejeu, « rien à faire » ; avec un rejeu, la carte calculée à part est rangée une fois, puis plus due au clic', async () => {
  const { __testing: J } = await import('../src/jobs/matchStatsAutoRefresh.js');
  const job = fs.readFileSync(path.join(SERVEUR, 'src', 'jobs', 'matchStatsAutoRefresh.js'), 'utf8');
  const cles = [...job.matchAll(/^ {4}key: '(\w+)',$/gm)].map((m) => m[1]);
  assert.equal(cles.indexOf('carteOuParier'), cles.indexOf('calibrationMensuelle') + 1);
  // Étape 26 (28/10/2026) : la boucle de correction s'intercale entre la carte et la sauvegarde.
  assert.equal(cles.indexOf('boucleCorrection'), cles.indexOf('carteOuParier') + 1);
  assert.equal(cles.indexOf('sauvegarde'), cles.indexOf('boucleCorrection') + 1);
  const db = base();
  const ctx = { manuel: false };
  const r0 = await J.passeCarteOuParier(ctx, { database: db, calculer: () => assert.fail('aucun calcul sans rejeu') });
  assert.equal(r0.status, 'ok');
  assert.match(r0.summary, /^Rien à faire : aucun rejeu du banc d’essai/);
  assert.equal(J.dueCarteOuParier(ctx, { database: db }), false);
  // Un rejeu du moteur EN SERVICE (même empreinte que celle que la passe calcule).
  const { moteurDuRejeu } = await import('../src/bench/runner.js');
  const { lireReglagesDuMoteur } = await import('../src/core/engine/engineConfig.js');
  const m = moteurDuRejeu(JSON.parse(JSON.stringify(lireReglagesDuMoteur().football)));
  db.prepare('INSERT INTO bench_runs (lance_le, fini_le, ou, version_banc, format_lignes, empreinte_moteur, empreinte_code, version_moteur, options, bilan, resume) VALUES (?, ?, ?, 1, 1, ?, ?, NULL, ?, ?, ?)').run(
    '2026-10-22T08:00:00Z', '2026-10-22T08:05:00Z', 'serveur', m.empreinte, m.empreinteCode, JSON.stringify({ periodes: ['P2'], prix: ['fd-avant-match'], config: { empreinte: m.empreinteReglages } }), '{}', JSON.stringify(resumeDeBanc())
  );
  assert.equal(J.dueCarteOuParier(ctx, { database: db }), true);
  let recu = null;
  const r1 = await J.passeCarteOuParier(ctx, {
    database: db,
    maintenant: Date.parse('2026-10-22T09:00:00Z'),
    calculer: async ({ options }) => {
      recu = options;
      return { carte: C.construireLaCarte({ banc: C.lectureDuBanc(resumeDeBanc(), { rejeuId: 1 }), rejeu: { id: 1, etiquette: 'exact' }, direct: direct({}), fenetre: FENETRE, moteur: options.moteur, maintenant: options.maintenant, raison: options.raison }) };
    }
  });
  assert.equal(r1.status, 'ok', r1.summary);
  assert.equal(recu.raison, 'premiere');
  assert.equal(recu.moteur.empreinte, m.empreinte);
  assert.match(r1.summary, /^Carte n° 1 \(première carte\) : .* 1 rouge, .* banc d’essai n° 1 ; .*Rien ne change dans les chiffres du moteur\.$/);
  assert.equal(M.lireLaCarte({ database: db }).banc.id, 1);
  assert.equal(J.dueCarteOuParier({ manuel: true }, { database: db }), false, 'au clic : déjà à jour');
  // Un calcul lourd en cours : reportée, rien d'écrit.
  db.prepare('INSERT INTO bench_runs (lance_le, fini_le, ou, version_banc, format_lignes, empreinte_moteur, empreinte_code, version_moteur, options, bilan, resume) SELECT lance_le, fini_le, ou, version_banc, format_lignes, empreinte_moteur, empreinte_code, version_moteur, options, bilan, resume FROM bench_runs WHERE id = 1').run();
  const r2 = await J.passeCarteOuParier(ctx, { database: db, calculer: async () => Promise.reject(Object.assign(new Error('Un autre calcul lourd tourne'), { reporte: true })) });
  assert.equal(r2.status, 'warn');
  assert.match(r2.summary, /^Carte reportée/);
  assert.equal(M.listeDesCartes({ database: db }).length, 1);
});

// ============================================================ 8. ce que lisent Opportunités et la route

test('Opportunités (serveur et écran) : les lignes des cases rouges à la fin (même un favori), à verdict égal les vertes d’abord ; rien de retiré, le verdict inchangé ; sans carte, l’ordre d’avant', async () => {
  const L = (cle, etat, pourcent, couleur, league = 'EPL') => ({ cle, league, home: 'A', away: 'B', commenceTime: '2026-11-02T15:00:00Z', avecOffre: true, verdict: { etat, pourcent, vert: etat === 'value' }, ...(couleur ? { carte: { couleur } } : {}) });
  const lignesServeur = [L('a', 'value', 3, 'rouge'), L('b', 'value', 2, 'gris'), L('c', 'value', 1, 'vert'), L('d', 'sans-value', -1, 'vert'), L('e', 'sans-value', -2, 'rouge')];
  assert.deepEqual(trierLesLignes(lignesServeur).map((l) => l.cle), ['c', 'b', 'd', 'a', 'e']);
  const sans = lignesServeur.map(({ carte, ...l }) => l);
  assert.deepEqual(trierLesLignes(sans).map((l) => l.cle), ['a', 'b', 'c', 'd', 'e'], 'sans carte : par value, comme avant');
  const O = await import(pathToFileURL(path.join(UI, 'src', 'utils', 'opportunites.js')).href);
  const favoritesFirst = (liste) => [...liste.filter((l) => l.cle === 'a'), ...liste.filter((l) => l.cle !== 'a')];
  const affichees = O.opportunitesAffichees(lignesServeur, { filtres: { periode: 'tout', valeurMin: 'toutes' }, maintenant: Date.parse('2026-11-01T10:00:00Z'), favoritesFirst });
  assert.equal(affichees.length, 5, 'rien n’est retiré');
  assert.deepEqual(affichees.slice(-2).map((l) => l.cle).sort(), ['a', 'e'], 'les rouges à la fin, même la favorite');
  assert.deepEqual(affichees.map((l) => l.verdict.etat), affichees.map((l) => lignesServeur.find((x) => x.cle === l.cle).verdict.etat));
  const n = O.contenuDeNotification({ ...L('a', 'value', 3, 'rouge'), pari: 'A gagne', exactKickoff: false });
  assert.match(n.corps, /case rouge de la carte « où parier »$/);
  assert.doesNotMatch(O.contenuDeNotification({ ...L('b', 'value', 3, 'gris'), pari: 'A gagne' }).corps, /case rouge/);
});

test('la route GET /api/betting-map : une demande illisible refusée (400) sans ouvrir la base ; sans carte, « pas encore mesuré » et quoi faire ; une carte d’autres réglages, « suspendue »', () => {
  assert.throws(() => getBettingMap({ query: { mois: '2026-13' } }, {}), (e) => e.statusCode === 400 || e.status === 400 || /AAAA-MM/.test(e.message));
  assert.throws(() => getBettingMap({ query: { id: 'x' } }, {}), /entier/);
  const sans = etatPourLEcran({ carte: null, rejeux: [], empreinteReglages: 'R' });
  assert.equal(sans.etat, 'pas-encore-mesure');
  assert.match(sans.phrase, /^Pas encore mesuré : .*« Lancer le banc »/);
  assert.equal(etatPourLEcran({ carte: null, rejeux: [{ id: 1 }], empreinteReglages: 'R' }).etat, 'en-attente');
  assert.equal(etatPourLEcran({ carte: { moteur: { empreinteReglages: 'R' } }, rejeux: [], empreinteReglages: 'R' }).etat, 'ok');
  const p = etatPourLEcran({ carte: { moteur: { empreinteReglages: 'R1' } }, rejeux: [], empreinteReglages: 'R2' });
  assert.equal(p.etat, 'perimee');
  assert.match(p.phrase, /couleurs sont suspendues/);
});

test('le chiffre attendu se dit honnêtement : une carte sans case verte dit « information, pas une panne » ; la plus grosse case du direct est nommée', async () => {
  const E = await import(pathToFileURL(path.join(UI, 'src', 'utils', 'carteOuParier.js')).href);
  const carte = carteDe({ banc: C.lectureDuBanc(resumeDeBanc(), { rejeuId: 10 }), rejeu: { id: 10, etiquette: 'exact' }, direct: direct({ 'MLS|result': lignes(46, () => 0) }) });
  const b = E.bandeauDeLaCarte({ carte: { ...carte, resume: { ...carte.resume, vertes: 0 } }, minimum: 200 });
  assert.match(b.phrase, /Rien n’est prouvé gagnant aujourd’hui : c’est une information, pas une panne\./);
  assert.match(b.phrase, /la plus remplie en direct en a 46/);
  assert.match(b.titre, /^Carte de novembre 2026 : /);
});
