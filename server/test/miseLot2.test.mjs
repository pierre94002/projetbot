/**
 * LA MISE — LE LOT 2 (étape 39 « La mise juste », écrit le 16/11/2026) : UNE SEULE RÈGLE DE MISE, branchée dans le moteur.
 *   node --test test/miseLot2.test.mjs        (depuis server/)
 * Tout tourne sur des données FABRIQUÉES (aides/miseFabrique.mjs) : ni le carnet, ni le capital de Pierre, ni une nuit
 * réelle d'engine_picks (les montants sont neutres : 1 000, 2 000, 50 000 €).
 *
 * T-L2-0 core/engine/stakeSizing.js = data/mise/regleDeMise.js : le même CORPS, à l'octet ;
 * T-L2-1 sans contexte, la mise du moteur est celle d'avant le lot 2, à l'octet (10 000 conseils fabriqués, et les cas
 *        limites de la base) ; la décision n'a aucune clé de plus ;
 * T-L2-2 une « nuit » fabriquée rejouée sur les bases 1 000 et 50 000 : la même décision, seule la mise suit la base ;
 * T-L2-3 la mise ne lit AUCUN fichier : le capital, les attentes, le livre, le plancher sont passés par l'appelant ;
 * T-L2-4 core/risk/staking.js absent, plus importé ; la fixture historique de l'essai 27 intacte ;
 * T-L2-5 le réglage « écart maximal de buts attendus » absent partout, sauf son nom gardé pour la LIGNÉE des anciennes versions ;
 *        le bouton « valeurs par défaut » garde les bookmakers retenus (les 4 français) et ne change pas l'état du moteur ;
 * T-L2-6 compactContext.js n'a plus de copie de la formule ; le texte écrit à l'IA est identique à l'octet (10 000 cas) ;
 * T-L2-7 l'ancienne fiche ne porte plus ni mise en euros, ni plafond, ni « € » (une mise absente, « stake: null », reste : ce n'est pas un euro) ;
 * T-L2-8 le résumé gardé avec l'analyse note la base du calcul de la mise (jamais envoyée à l'IA) ;
 * T-L2-9 une mise au-dessus de la mise acceptée connue chez le bookmaker est RAMENÉE, la raison nommée ; « le plus petit gagne » ;
 * T-PA1  ni les réglages de pari ni le contexte de la mise ne changent une probabilité (ici : sur la cote juste et par la
 *        structure du code ; sur le moteur entier : leviersEtPari.test.mjs, T-PA1, dans une copie isolée).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SERVEUR, FIXTURES, preparerCopie, executer } from './aides/isolement.mjs';
import { semer, matchsFabriques, contexteFabrique, configAvec, LIVRES_FR, LIVRES_ETRANGERS } from './aides/miseFabrique.mjs';
import * as S from '../src/core/engine/stakeSizing.js';
import * as R from '../src/data/mise/regleDeMise.js';
import { findValueBet, miseDuConseil, fairFromBookmakers } from '../src/core/engine/valueFinder.js';
import { stakingDuMatch, decisionDePari, referenceDuMatch } from '../src/core/engine/verdictPari.js';
import { plafonnerLeConseil, PLAFONDS_NOMMES } from '../src/core/risk/gardeFous.js';
import { REGLAGES_DE_PARI, REGLAGES_DE_PARI_RETIRES } from '../src/data/correction/regles.js';
import { sansReglagesDePari, empreinteDesPronostics } from '../src/data/correction/lignee.js';
import { DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../src/core/engine/engineConfig.js';
import { LIBELLES_REGLAGES, fichiersDuMoteur } from '../src/core/engine/engineVersions.js';
import * as C from '../src/core/ai/compactContext.js';
import * as P from '../src/core/ai/matchAiAnalysisPrompt.js';

const SRC = path.join(SERVEUR, 'src');
// Le lot 0 (masque des buts de la v5) n'est PAS au bac (voulu : note de l'orchestrateur du 16/11/2026). Sans son fichier, la comparaison
// « avec le masque » est sautée ; là où il est (le dépôt), elle reste exigée (T-L2-6).
const LOT_0_PRESENT = fs.existsSync(path.join(SRC, 'data', 'masqueDesButs.js'));
const { masqueEnService } = LOT_0_PRESENT ? await import('../src/data/masqueDesButs.js') : { masqueEnService: () => null };
const UI = path.resolve(SERVEUR, '..', 'ui', 'src');
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const lire = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8');
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
const tousLesJs = (racine) => fs.readdirSync(racine, { recursive: true }).map((f) => String(f).split(path.sep).join('/')).filter((f) => /\.(m?js|vue)$/.test(f));
/** Le nom du réglage retiré, écrit en morceaux : ce fichier d'essai ne le porte pas en clair (T-L2-5 le cherche partout). */
const ECART = ['max', 'Expected', 'Rate', 'Gap'].join('');
const REGLAGE = Object.freeze({ kellyFraction: 0.125, maxStakePercent: 0.02 });
const TOUS_LES_LIVRES = [...LIVRES_ETRANGERS, ...LIVRES_FR];
const CONFIG_14 = configAvec(TOUS_LES_LIVRES);
const CONFIG_4 = configAvec(LIVRES_FR);

/** LA MISE D'AVANT LE LOT 2, figée ici telle qu'elle était écrite dans valueFinder.js (l. 243-247 du 15/11/2026). */
function miseDAvant({ ev, odds }, config, bankroll) {
  const kelly = (config.kellyFraction * ev) / (odds - 1);
  const stake = Math.min(Number(bankroll) * kelly, Number(bankroll) * config.maxStakePercent);
  return Number(Math.max(0, stake).toFixed(2));
}

/** Des conseils RECOMMENDED du vrai findValueBet, sans contexte, sur des marchés tirés (le générateur de miseRegle.test.mjs, T-M1). */
function conseilsFabriques(n, graine = 392) {
  const tirer = semer(graine);
  const sortie = [];
  for (let essai = 0; sortie.length < n && essai < n * 40; essai++) {
    const base = essai % 4 === 0 ? 1000 : essai % 4 === 1 ? 2000 : essai % 4 === 2 ? 50000 : Math.round((10 + tirer() * 250000) * 100) / 100;
    const p1 = 0.15 + tirer() * 0.7;
    const p2 = (1 - p1) * (0.15 + tirer() * 0.7);
    const fair = [p1, p2, 1 - p1 - p2];
    const i = Math.floor(tirer() * 3);
    const b = 0.97 + tirer() * 0.28;
    const marge = 1.01 + tirer() * 0.24;
    const resteImplicite = Math.max(0.02, marge - fair[i] / b);
    const offre = fair.map((p, j) => Number((j === i ? b / p : (1 - fair[i]) / (p * resteImplicite)).toFixed(2)));
    const cle = essai % 5 === 0 ? 'unibet_fr' : 'williamhill';
    const byBookmaker = [{ key: cle, title: cle, odds1: offre[0], oddsDraw: offre[1], odds2: offre[2] }];
    const parametres = { byBookmaker, fair, referenceKeys: [], config: { ...CONFIG_14, valueBookmakers: [] }, tiltState: {}, bankroll: base, labels: {} };
    const r = findValueBet(parametres);
    if (r.action === 'RECOMMENDED') sortie.push({ base, r, parametres });
  }
  return sortie;
}
const CONSEILS = conseilsFabriques(10000);
const MATCHS = matchsFabriques(600);

// ------------------------------------------------------------------ T-L2-0

/** Le corps d'un des deux fichiers de la règle : tout ce qui suit son commentaire d'en-tête. */
function corps(texte, nom) {
  assert.ok(texte.startsWith('/**\n'), `${nom} : commence par son en-tête`);
  const fin = texte.indexOf(' */\n');
  assert.ok(fin > 0, `${nom} : fin de l’en-tête`);
  return texte.slice(fin + 4);
}

test('T-L2-0 core/engine/stakeSizing.js = data/mise/regleDeMise.js recopié à l’identité (sha1 du corps)', () => {
  const moteur = corps(lire('core', 'engine', 'stakeSizing.js'), 'stakeSizing.js');
  const regle = corps(lire('data', 'mise', 'regleDeMise.js'), 'regleDeMise.js');
  assert.ok(regle.length > 12000, `le corps de la règle : ${regle.length} caractères`);
  assert.equal(sha1(moteur), sha1(regle), 'le corps de stakeSizing.js n’est plus celui de regleDeMise.js : on ne retouche jamais l’un sans l’autre');
  assert.deepEqual(Object.keys(S).sort(), Object.keys(R).sort(), 'les mêmes exports');
  // Aucun import, d'aucune sorte : la règle reçoit tout par ses arguments.
  assert.doesNotMatch(sansCommentaires(moteur), /\bimport\b|\brequire\s*\(/);
  // La règle est DANS l'empreinte du moteur (une version neuve) ; l'ancienne ne l'est plus.
  assert.ok(fichiersDuMoteur().includes('core/engine/stakeSizing.js'));
  assert.ok(!fichiersDuMoteur().includes('core/risk/staking.js'));
  // Les deux copies répondent pareil, à l'octet, sur 2 000 conseils et sur la règle entière.
  for (const { base, r } of CONSEILS.slice(0, 2000)) {
    assert.equal(S.partDeMise({ ev: r.ev, cote: r.odds, reglageMoteur: REGLAGE }), R.partDeMise({ ev: r.ev, cote: r.odds, reglageMoteur: REGLAGE }));
    const entree = { decision: 'RECOMMENDED', ev: r.ev, cote: r.odds, livre: { cle: r.bookmaker, titre: r.bookmaker, francais: S.LIVRES_FRANCAIS.includes(r.bookmaker) }, reglageMoteur: REGLAGE, enAttenteDuMatch: [base * 0.003], gardeFous: { miseMaxParPari: base * 0.01, resteSemaine: base }, compte: { miseMaxAcceptee: base * 0.008 }, capital: { indique: true, montant: base, plusHaut: base } };
    assert.deepEqual(S.fractionDeMise(entree), R.fractionDeMise(entree));
  }
});

// ------------------------------------------------------------------ T-L2-1, T-L2-2

const CLES_DE_LA_DECISION = ['action', 'stake', 'outcome', 'label', 'odds', 'displayedOdds', 'bookmaker', 'bookmakerTitle', 'fairOdds', 'ev', 'exclusion', 'candidates', 'limits'];

test('T-L2-1 sans contexte, la mise du moteur est celle d’avant le lot 2 À L’OCTET (10 000 conseils fabriqués ; les cas limites de la base) et la décision n’a aucune clé de plus', () => {
  assert.equal(CONSEILS.length, 10000);
  let plafonnes = 0;
  for (const { base, r, parametres } of CONSEILS) {
    assert.ok(Object.is(r.stake, miseDAvant(r, parametres.config, base)), `base ${base}, ev ${r.ev}, cote ${r.odds} : ${r.stake} ≠ ${miseDAvant(r, parametres.config, base)}`);
    assert.deepEqual(Object.keys(r), CLES_DE_LA_DECISION, 'sans contexte : aucune clé de plus (ni regleDeMise)');
    assert.equal(r.stake, Number((S.partDeMise({ ev: r.ev, cote: r.odds, reglageMoteur: REGLAGE }) * base).toFixed(2)));
    if (r.stake === Number((0.02 * base).toFixed(2))) plafonnes++;
  }
  assert.ok(plafonnes > 50, `le plafond de 2 % mord sur une partie des conseils (${plafonnes})`);
  // `contexteDeMise: null` et l'absence de la clé : la même décision, à l'octet.
  for (const { parametres, r } of CONSEILS.slice(0, 500)) {
    assert.equal(JSON.stringify(findValueBet({ ...parametres, contexteDeMise: null })), JSON.stringify(r));
    assert.equal(JSON.stringify(findValueBet({ ...parametres, contexteDeMise: undefined })), JSON.stringify(r));
  }
  // Les cas limites de la base (absente, nulle, négative, un texte, minuscule, énorme) et des avantages : la même valeur
  // qu'avant, NaN compris.
  const tirer = semer(7);
  for (const base of [undefined, null, 0, -500, '1000', '1 000', 1e-9, 1e12, NaN]) {
    for (let i = 0; i < 300; i++) {
      const choix = { ev: Number((tirer() * 0.3 - 0.02).toFixed(4)), odds: Number((1.05 + tirer() * 6).toFixed(3)), bookmaker: 'williamhill', bookmakerTitle: 'William Hill' };
      const neuve = miseDuConseil(choix, CONFIG_14, base, null);
      assert.ok(Object.is(neuve.stake, miseDAvant(choix, CONFIG_14, base)), `base ${String(base)}, ev ${choix.ev}, cote ${choix.odds} : ${neuve.stake} ≠ ${miseDAvant(choix, CONFIG_14, base)}`);
      assert.equal(neuve.regleDeMise, null);
    }
  }
});

test('T-L2-2 une « nuit » fabriquée (600 matchs) rejouée sur les bases 1 000 et 50 000, sans contexte : la même décision, seule la mise suit la base — et c’est la mise d’avant, à l’octet', () => {
  let conseils = 0;
  const actions = new Map();
  for (const config of [CONFIG_14, CONFIG_4]) {
    for (const m of MATCHS) {
      const sur = (base) => {
        const match = { ...m, bankroll: base };
        const ref = referenceDuMatch(match, config);
        return stakingDuMatch(match, ref, config, {});
      };
      const a = sur(1000);
      const b = sur(50000);
      actions.set(a.reason ?? a.action, (actions.get(a.reason ?? a.action) ?? 0) + 1);
      const sansMise = ({ stake, ...reste }) => JSON.stringify(reste);
      assert.equal(sansMise(a), sansMise(b), `${m.matchId} : la décision dépend de la base`);
      assert.ok(!('regleDeMise' in a) && !('misePlafonnee' in a));
      if (a.action !== 'RECOMMENDED') {
        assert.equal(a.stake, null);
        assert.equal(b.stake, null);
        continue;
      }
      conseils++;
      assert.ok(Object.is(a.stake, miseDAvant(a, config, 1000)), `${m.matchId} : base 1 000`);
      assert.ok(Object.is(b.stake, miseDAvant(b, config, 50000)), `${m.matchId} : base 50 000`);
      assert.equal(a.stake, Number((S.partDeMise({ ev: a.ev, cote: a.odds, reglageMoteur: config }) * 1000).toFixed(2)));
    }
  }
  assert.ok(conseils >= 60, `des conseils dans la nuit fabriquée : ${conseils}`);
  assert.ok(actions.size >= 4, `des décisions variées : ${[...actions.keys()].join(', ')}`);
});

// ------------------------------------------------------------------ T-L2-3

/** Les fichiers atteints par les imports relatifs d'un fichier de src/. */
function atteints(depart) {
  const vus = new Set();
  const pile = [path.join(SRC, depart)];
  const re = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|export\s[^'"]*?from\s*|import\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f) || !fs.existsSync(f)) continue;
    vus.add(f);
    for (const m of sansCommentaires(fs.readFileSync(f, 'utf8')).matchAll(re)) pile.push(path.resolve(path.dirname(f), m[1]));
  }
  return [...vus].map((f) => path.relative(SRC, f).split(path.sep).join('/')).sort();
}

test('T-L2-3 la mise ne lit aucun fichier : le capital, les attentes, le livre, le plancher sont passés par l’APPELANT (match.contexteDeMise) ; valueFinder.js n’atteint que la marge et la règle', () => {
  assert.deepEqual(atteints('core/engine/valueFinder.js'), ['core/engine/stakeSizing.js', 'core/engine/valueFinder.js', 'core/market/marginRemoval.js']);
  const INTERDITS = /node:fs|node:path|readJsonFile|readFileSync|capital\.json|capitalDePierre|data\/mise|betsRepository|listBets|comptesBookmakers|lireComptes|gardeFousRepository|bets\.json|Date\.now|new Date|Math\.random|process\.env/;
  for (const f of ['core/engine/stakeSizing.js', 'core/engine/valueFinder.js', 'core/market/marginRemoval.js']) {
    const m = sansCommentaires(lire(...f.split('/'))).match(INTERDITS);
    assert.equal(m, null, `${f} lit « ${m?.[0]} » : la mise ne lit ni fichier, ni carnet, ni capital, ni horloge`);
  }
  // L'appelant (le contrôleur de l'analyse) lit le capital et le reste par data/mise/miseRead.js — JAMAIS dans la requête : depuis
  // le lot 2, la mise en euros vient du capital du contexte ; une base lue dans la requête ne se verrait plus à la mise (pose 30
  // du lot 1), elle est donc refusée ici, dans le code.
  const controleur = sansCommentaires(lire('api', 'controllers', 'analysis.controller.js'));
  assert.doesNotMatch(controleur, /req\.(query|body|params)\??\.(bankroll|capital|base)\b/, 'le contrôleur de l’analyse lit une base ou un capital dans la requête');
  assert.match(controleur, /const contexteMise = contexteDeLaMise\(\{ sportId \}\);\s+const bankroll = contexteMise\.base;/);
  assert.match(controleur, /contexteDeMise: contexteDuMoteur\(contexteMise, avecFraicheur\)/);
  // Le verdict et les garde-fous (purs eux aussi) ne lisent ni le capital ni le carnet ni une fiche : ils les reçoivent.
  for (const f of ['core/engine/verdictPari.js', 'core/risk/gardeFous.js']) {
    const m = sansCommentaires(lire(...f.split('/'))).match(/node:fs|readJsonFile|readFileSync|capital\.json|capitalDePierre|data\/mise|betsRepository|listBets|comptesBookmakers|lireComptes|gardeFousRepository|bets\.json|process\.env/);
    assert.equal(m, null, `${f} lit « ${m?.[0]} »`);
  }
  // Aucun fichier du moteur n'importe data/mise/ (la frontière du lot 1 tient : miseFrontiere.test.mjs, T-X2).
  for (const f of fichiersDuMoteur()) assert.doesNotMatch(sansCommentaires(lire(...f.split('/'))), /data\/mise\//, `${f} importe data/mise/`);
  // Le contexte vient du match donné par l'appelant, et de lui seul : même match, même réglage, contextes différents → mises différentes.
  let vus = 0;
  for (const m of MATCHS) {
    const match = { ...m, bankroll: 2000 };
    const ref = referenceDuMatch(match, CONFIG_14);
    const sans = stakingDuMatch(match, ref, CONFIG_14, {});
    if (sans.action !== 'RECOMMENDED') continue;
    const libre = stakingDuMatch({ ...match, contexteDeMise: { capital: { indique: true, montant: 2000, plusHaut: 2000 }, enAttenteDuMatch: [], gardeFous: null, comptes: {}, plancher: null } }, ref, CONFIG_14, {});
    assert.equal(libre.stake, sans.stake, `${m.matchId} : un contexte qui ne contraint rien ne change pas la mise`);
    assert.equal(libre.regleDeMise.regle, 'mise-v1');
    const prise = stakingDuMatch({ ...match, contexteDeMise: { capital: { indique: true, montant: 2000, plusHaut: 2000 }, enAttenteDuMatch: [50], gardeFous: null, comptes: {}, plancher: null } }, ref, CONFIG_14, {});
    assert.equal(prise.stake, 0, `${m.matchId} : 50 € en attente sur ce match (2,5 % de 2 000 €) : la place est prise`);
    assert.equal(prise.regleDeMise.raisons.at(-1).code, 'lie-au-match');
    assert.equal(prise.action, 'RECOMMENDED', 'la value reste dite : c’est la mise qui tombe à zéro');
    const sousLePlancher = stakingDuMatch({ ...match, contexteDeMise: { capital: { indique: true, montant: 2000, plusHaut: 2300 }, enAttenteDuMatch: [], gardeFous: null, comptes: {}, plancher: 300 } }, ref, CONFIG_14, {});
    assert.equal(sousLePlancher.stake, 0, `${m.matchId} : 300 € sous le plus haut, plancher de 300 € : plus aucune mise`);
    assert.equal(sousLePlancher.misePlafonnee.par, 'plancher');
    // Sans capital indiqué : la part de la règle sur la base de l'appelant (un nombre de calcul), les attentes dites non comptées.
    const sansCapital = stakingDuMatch({ ...match, contexteDeMise: { capital: { indique: false }, enAttenteDuMatch: [50], gardeFous: { miseMaxParPari: 1, resteSemaine: 1 }, comptes: {}, plancher: null } }, ref, CONFIG_14, {});
    assert.equal(sansCapital.stake, sans.stake);
    assert.ok(sansCapital.regleDeMise.raisons.some((r) => r.code === 'attente-non-comptee'));
    assert.ok(sansCapital.regleDeMise.raisons.some((r) => r.code === 'plafonds-sans-capital'));
    assert.equal(sansCapital.regleDeMise.plafond, null);
    assert.ok(!('misePlafonnee' in sansCapital));
    vus++;
  }
  assert.ok(vus >= 30, `conseils regardés : ${vus}`);
});

// ------------------------------------------------------------------ T-L2-4, T-L2-5

test('T-L2-4 core/risk/staking.js absent et plus importé nulle part ; la fixture historique engine-versions-27-en-essai.json intacte', () => {
  assert.ok(!fs.existsSync(path.join(SRC, 'core', 'risk', 'staking.js')), 'core/risk/staking.js est retiré (code mort, formule fausse)');
  for (const f of tousLesJs(SRC)) {
    const t = sansCommentaires(fs.readFileSync(path.join(SRC, f), 'utf8'));
    assert.doesNotMatch(t, /risk\/staking(\.js)?['"]|evaluateStakingDecision/, `${f} emploie encore staking.js`);
  }
  const fixture = fs.readFileSync(path.join(FIXTURES, 'engine-versions-27-en-essai.json'));
  assert.equal(sha1(fixture), '7f0738c0642888aea449a735a08263263f3a20e7', 'la fixture historique de l’essai 27 ne se retouche jamais');
  // Elle dit l'état du jour de l'essai : staking.js y est encore, le réglage retiré aussi.
  assert.match(fixture.toString('utf8'), /core\/risk\/staking\.js/);
  assert.ok(fixture.toString('utf8').includes(`"${ECART}"`));
});

test('T-L2-5 le réglage « écart maximal de buts attendus » absent partout (réglages par défaut, libellés, réglages de pari, code, écran) — son nom ne reste que pour la LIGNÉE des anciennes versions', () => {
  assert.ok(!(ECART in DEFAULT_ENGINE_CONFIG_BY_SPORT.football));
  assert.ok(!(ECART in LIBELLES_REGLAGES));
  assert.ok(!REGLAGES_DE_PARI.includes(ECART));
  assert.deepEqual([...REGLAGES_DE_PARI], ['edgeThresholdMin', 'edgeThresholdMax', 'valueBookmakers', 'maxValueOdds', 'kellyFraction', 'maxStakePercent']);
  assert.deepEqual([...REGLAGES_DE_PARI_RETIRES], [ECART]);
  // Dans le code : une seule ligne le nomme (regles.js, REGLAGES_DE_PARI_RETIRES) ; la note de départ du banc (historique) le cite.
  const ou = [];
  for (const f of tousLesJs(SRC)) {
    const n = fs.readFileSync(path.join(SRC, f), 'utf8').split(ECART).length - 1;
    if (n) ou.push(`${f}:${n}`);
  }
  assert.deepEqual(ou.sort(), ['bench/noteDeDepart.js:1', 'data/correction/regles.js:1']);
  assert.match(lire('data', 'correction', 'regles.js'), new RegExp(`REGLAGES_DE_PARI_RETIRES = gel\\(\\['${ECART}'\\]\\)`));
  for (const f of tousLesJs(UI)) assert.ok(!fs.readFileSync(path.join(UI, f), 'utf8').includes(ECART), `ui/src/${f} nomme le réglage retiré`);
  // LA LIGNÉE : une ancienne version (qui porte encore la clé) garde son empreinte des pronostics — celle d'une version sans la clé.
  const reglages = { ...DEFAULT_ENGINE_CONFIG_BY_SPORT.football };
  const ancienne = { code: { empreinte: 'abc' }, reglages: { football: { ...reglages, [ECART]: 0.4 } } };
  const neuve = { code: { empreinte: 'abc' }, reglages: { football: reglages } };
  assert.ok(!(ECART in sansReglagesDePari(ancienne.reglages.football)));
  assert.equal(empreinteDesPronostics(ancienne), empreinteDesPronostics(neuve), 'la clé retirée ne change pas la lignée');
  assert.equal(empreinteDesPronostics({ ...ancienne, reglages: { football: { ...ancienne.reglages.football, [ECART]: 0.05, kellyFraction: 0.5 } } }), empreinteDesPronostics(neuve));
  // Les valeurs par défaut du moteur gardent leurs autres réglages, dans le même ordre.
  assert.deepEqual(Object.keys(DEFAULT_ENGINE_CONFIG_BY_SPORT.football), ['edgeThresholdMin', 'edgeThresholdMax', 'valueBookmakers', 'maxValueOdds', 'defaultCorrelation', 'kellyFraction', 'maxStakePercent', 'homeAdvantage', 'cornersAdjustmentMax', 'weights']);
  // LE BOUTON « VALEURS PAR DÉFAUT » DE RÉGLAGES (correction 1.1 du 17/11/2026) : il garde les bookmakers retenus (D3, les
  // 4 français) au lieu de rendre les 10 étrangers ; l'état du moteur ne change pas, donc aucune version ne naît. Dans une
  // copie isolée (le bouton écrit engine-config.json), par l'aide `aides/script-remise-defaut.mjs` — jamais dans le
  // processus des tests (versionsMoteur.test.mjs, « le garde des essais ») : 1) « défaut + 4 français », 2) un seuil changé.
  const FRANCAIS = ['unibet_fr', 'betclic_fr', 'winamax_fr', 'pmu_fr'];
  const copie = preparerCopie({ base: false });
  try {
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-remise-defaut.mjs'), { args: [JSON.stringify(FRANCAIS)] });
    assert.equal(r.code, 0, r.erreurs.slice(-800));
    assert.ok(r.json, r.sortie.slice(-800));
    assert.deepEqual(r.json.rendus, FRANCAIS, 'la remise rend les 4 français, pas les 10 étrangers');
    assert.deepEqual(r.json.lus, FRANCAIS);
    assert.deepEqual(r.json.relu, FRANCAIS, 'engine-config.json garde les 4 français');
    assert.equal(r.json.memeEtat, true, 'l’état du moteur ne change pas : aucune version de plus');
    assert.equal(r.json.defaut, true);
    // Un autre réglage changé est bien remis à sa valeur par défaut ; les bookmakers restent.
    assert.equal(r.json.seuil2, DEFAULT_ENGINE_CONFIG_BY_SPORT.football.edgeThresholdMin);
    assert.deepEqual(r.json.livres2, FRANCAIS);
    assert.equal(r.json.memeEtat2, true);
  } finally {
    copie.nettoyer();
  }
});

// ------------------------------------------------------------------ T-L2-6, T-L2-7, T-L2-8 : ce que lit l'IA

const F = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'fiche-ia-etape-41.json'), 'utf8'));
/** LA COPIE du lot 1a, figée ici telle qu'elle était écrite dans compactContext.js (retirée au lot 2). */
function partDuLot1a({ ev, cote, reglage }) {
  const k = reglage?.kellyFraction;
  const sMax = reglage?.maxStakePercent;
  const fini = (x) => typeof x === 'number' && Number.isFinite(x);
  if (!fini(ev) || !fini(cote) || !(cote > 1) || !fini(k) || !fini(sMax)) return null;
  const kelly = (k * ev) / (cote - 1);
  return Math.max(0, Math.min(kelly, sMax));
}
const partDiteDuLot1a = (f) => (typeof f !== 'number' || !Number.isFinite(f) ? 'part du capital non calculée' : `${(100 * f).toFixed(2).replace('.', ',')} % du capital`);
const texteDe = (demande) => demande.messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
const ligneDeMise = (demande) => texteDe(demande).split('\n').find((l) => l.startsWith('Mise (staking) : '));
const ficheCompacte = (x, staking, masque) =>
  P.buildPreMatchAnalysisRequestCompacte({ home: x.home, away: x.away, league: x.league, engineSummary: { ...x.engineSummary, staking }, marches: C.marchesPourIA(x.engineSummary.marketPredictions), context: x.contexte, lineups: x.compoBrute, experience: x.experience, commenceTime: x.commenceTime, timing: x.timing, masque });

test('T-L2-6 compactContext.js n’a plus de copie de la formule (il importe la règle du moteur) ; le texte « RECOMMENDED : … % du capital » écrit à l’IA est identique à l’octet sur 10 000 cas, avec et sans le masque des buts', () => {
  const code = sansCommentaires(lire('core', 'ai', 'compactContext.js'));
  assert.doesNotMatch(code, /\/\s*\(\s*cote\s*-\s*1\s*\)/, 'plus aucune formule k · ev / (cote − 1) dans compactContext.js');
  assert.doesNotMatch(code, /Math\.min\(\s*kelly/);
  assert.match(code, /import \{ partDeMise \} from '\.\.\/engine\/stakeSizing\.js';/);
  assert.doesNotMatch(lire('core', 'ai', 'compactContext.js'), /COPIE TEMPORAIRE/);
  assert.doesNotMatch(code, /data\/mise\//);
  // 10 000 cas : la part, à l'octet, illisibles compris (null, comme avant).
  for (const { r } of CONSEILS) {
    assert.ok(Object.is(C.partDuCapitalPourIA({ ev: r.ev, cote: r.odds, reglage: REGLAGE }), partDuLot1a({ ev: r.ev, cote: r.odds, reglage: REGLAGE })));
  }
  for (const entree of [{ ev: null, cote: 2 }, { ev: 0.05, cote: 1 }, { ev: 0.05, cote: 0.5 }, { ev: NaN, cote: 2 }, { ev: 0.05, cote: '2' }, { ev: -0.03, cote: 2.2 }, { ev: 0.9, cote: 1.2 }, {}]) {
    assert.ok(Object.is(C.partDuCapitalPourIA({ ...entree, reglage: REGLAGE }), partDuLot1a({ ...entree, reglage: REGLAGE })), JSON.stringify(entree));
  }
  for (const reglage of [null, {}, { kellyFraction: 0.125 }, { kellyFraction: '0.125', maxStakePercent: 0.02 }]) assert.equal(C.partDuCapitalPourIA({ ev: 0.05, cote: 2, reglage }), null);
  // La ligne de la fiche, à l'octet : 10 000 décisions fabriquées, sans masque ; une sur vingt aussi avec le masque en service
  // et avec la décision « enrichie » par un contexte de mise (le message entier, à l'octet).
  const x = F.avantA.entree;
  const masque = masqueEnService({});
  let avecMasque = 0;
  let enrichies = 0;
  CONSEILS.forEach(({ r }, i) => {
    const { candidates, limits, ...conseil } = r;
    const staking = { ...conseil, label: 'Domicile gagne', bookmakerTitle: 'William Hill', candidates: [], limits };
    const attendue = `Mise (staking) : RECOMMENDED : ${partDiteDuLot1a(partDuLot1a({ ev: r.ev, cote: r.odds, reglage: REGLAGE }))} sur Domicile gagne à `;
    const sans = ficheCompacte(x, staking, null);
    const ligne = ligneDeMise(sans);
    assert.ok(ligne?.startsWith(attendue), `${String(ligne).slice(0, 120)} — attendu : ${attendue}`);
    assert.doesNotMatch(ligne, /€|stake|misePlafonnee|regleDeMise/);
    if (i % 20 !== 0) return;
    // La décision calculée AVEC un contexte (elle porte regleDeMise et parfois misePlafonnee) : le même message, à l'octet.
    const enrichie = { ...staking, stake: 3.21, regleDeMise: { regle: 'mise-v1', f: 0.001, fKelly: 0.004, raisons: [{ code: 'mise-max', avant: 0.004, apres: 0.001, texte: 'ramenée par : votre mise maximale par pari (2 €)' }], plafond: { par: 'mise-max', mise: 8, plafond: 2 } }, misePlafonnee: { mise: 8, plafond: 2, par: 'mise-max', texte: 'Mise conseillée ramenée à 2 €' } };
    assert.equal(JSON.stringify(ficheCompacte(x, enrichie, null)), JSON.stringify(sans), 'le détail de la règle et ses euros ne changent pas un octet du message');
    enrichies++;
    if (masque) {
      assert.equal(JSON.stringify(ficheCompacte(x, enrichie, masque)), JSON.stringify(ficheCompacte(x, staking, masque)));
      assert.ok(ligneDeMise(ficheCompacte(x, staking, masque))?.startsWith(attendue));
      avecMasque++;
    }
  });
  assert.equal(enrichies, 500);
  if (LOT_0_PRESENT) {
    assert.ok(masque, 'le masque des buts est en service (lot 0) : le texte est comparé avec lui aussi');
    assert.equal(avecMasque, 500, 'comparé aussi avec le masque des buts en service');
  }
});

test('T-L2-7 l’ancienne fiche (AI_ANALYSIS_FICHE=ancienne) passe par le même filtre que la compacte : ni mise en euros, ni plafond, ni « € » — la part du capital à la place (3 matchs fabriqués)', () => {
  const service = lire('core', 'ai', 'matchAiAnalysisService.js');
  assert.ok(service.includes('demande = buildPreMatchAnalysisRequest({ home, away, league, engineSummary: { ...engineSummary, staking: stakingSansEuros(engineSummary.staking) }, context, experience });'), 'l’ancienne fiche reçoit la décision filtrée');
  assert.equal(service.split('buildPreMatchAnalysisRequest({').length - 1, 1, 'un seul appel de l’ancienne fiche d’avant-match dans le service');
  const decisions = CONSEILS.slice(0, 3).map(({ r }, i) => ({
    ...r,
    stake: [39.17, 6, 1234.56][i],
    ...(i === 1 ? { misePlafonnee: { mise: 9.4, plafond: 6, par: 'mise-max', texte: 'Mise conseillée ramenée à 6 € : votre mise maximale par pari, fixée dans Réglages. Le moteur conseillait 9,40 €.' } } : {}),
    regleDeMise: { regle: 'mise-v1', f: 0.003, fKelly: 0.0047, raisons: [{ code: 'mise-max', avant: 0.0047, apres: 0.003, texte: 'ramenée par : votre mise maximale par pari (6 €)' }], plafond: { par: 'mise-max', mise: 9.4, plafond: 6 } }
  }));
  decisions.forEach((staking, i) => {
    const x = i === 2 ? F.avantB.entree : F.avantA.entree;
    const filtree = C.stakingSansEuros(staking);
    assert.ok(!('stake' in filtree) && !('misePlafonnee' in filtree) && !('regleDeMise' in filtree));
    assert.ok(typeof filtree.partDuCapital === 'number' && filtree.partDuCapital > 0 && filtree.partDuCapital < 1, `la part du capital : ${filtree.partDuCapital}`);
    for (const masque of [null, masqueEnService({})]) {
      const fiche = (s) => texteDe(P.buildPreMatchAnalysisRequest({ home: x.home, away: x.away, league: x.league, engineSummary: { ...x.engineSummary, staking: s }, context: { ...x.contexte, lineups: x.lineupsAncienne }, experience: x.experience, masque }));
      const message = fiche(filtree);
      assert.doesNotMatch(message, /"stake"|misePlafonnee|regleDeMise|€/, `match fabriqué ${i + 1} : un euro dans l’ancienne fiche`);
      assert.match(message, /"partDuCapital"/, 'la part du capital y est');
      // Sans le filtre, la même fiche porterait la mise en euros : c'est bien le filtre qui la retire.
      assert.match(fiche(staking), /"stake"/);
    }
  });
  // Une décision sans conseil : rendue À L'OCTET (une mise absente, « stake: null », n'est pas un euro : l'ancienne fiche d'un match
  // sans conseil garde ses octets d'avant le lot 2) ; rien d'ajouté.
  const sansConseil = { action: 'PASS', stake: null, reason: 'pas_de_value', candidates: [], limits: { edgeThresholdMin: 0.02 } };
  assert.equal(JSON.stringify(C.stakingSansEuros(sansConseil)), JSON.stringify(sansConseil));
  const coupe = { ...sansConseil, action: 'CIRCUIT_BREAKER_ACTIVE', coupeCircuit: { motif: 'manuel' } };
  assert.equal(JSON.stringify(C.stakingSansEuros(coupe)), JSON.stringify(coupe));
  assert.equal(C.stakingSansEuros(null), null);
});

test('T-L2-8 le résumé gardé avec l’analyse (engineSnapshot) note la base du calcul de la mise — le capital réglé, la base interne ou « inconnue » — et l’IA ne la lit jamais', () => {
  assert.deepEqual(C.baseDuCalculDe({ mise: { capital: { indique: true, montant: 2000 } }, bankroll: 10000 }), { montant: 2000, origine: 'capital-regle' });
  assert.deepEqual(C.baseDuCalculDe({ mise: { capital: { indique: false, montant: null } }, bankroll: 10000 }), { montant: 10000, origine: 'base-interne' });
  assert.deepEqual(C.baseDuCalculDe({ bankroll: 1000 }), { montant: 1000, origine: 'base-interne' });
  for (const sans of [{}, null, undefined, { bankroll: '10000' }, { bankroll: 0 }, { mise: { capital: { indique: true, montant: 0 } } }]) assert.deepEqual(C.baseDuCalculDe(sans), { montant: null, origine: 'inconnue' });
  const service = lire('core', 'ai', 'matchAiAnalysisService.js');
  assert.ok(service.includes('const avecLaBase = { ...engineSummary, baseDuCalcul: baseDuCalculDe(engineResult) };'));
  assert.ok(service.includes('engineSnapshot: avecLaVersion(engineSummary, engineResult)'), 'le résumé gardé passe par avecLaVersion');
  assert.ok(service.includes('const { engineVersion, baseDuCalcul, ...resume } = engineSnapshot;'), 'pourIA retire la base du calcul');
  assert.ok(service.includes('const { regleDeMise, ...staking } = resume.staking;'), 'pourIA retire le détail de la règle de mise');
  // Le service ne lit toujours pas le capital lui-même (aucun import de data/mise/).
  assert.doesNotMatch(sansCommentaires(service), /data\/mise\//);
});

// ------------------------------------------------------------------ T-L2-9 : les plafonds

test('T-L2-9 une mise au-dessus de la mise acceptée connue chez le bookmaker est RAMENÉE (plus une simple alerte), la raison nommée ; « le plus petit gagne » entre tous les plafonds en euros', () => {
  let ramenees = 0;
  let vus = 0;
  for (const m of MATCHS) {
    const match = { ...m, bankroll: 2000 };
    const ref = referenceDuMatch(match, CONFIG_14);
    const sans = stakingDuMatch(match, ref, CONFIG_14, {});
    if (sans.action !== 'RECOMMENDED' || !(sans.stake > 1)) continue;
    vus++;
    const capital = { indique: true, montant: 2000, plusHaut: 2000 };
    const acceptee = Number((sans.stake / 2).toFixed(2));
    const contexte = { capital, enAttenteDuMatch: [], gardeFous: null, comptes: { [sans.bookmaker]: { miseMaxAcceptee: acceptee, soldeDeclare: 500 } }, plancher: null };
    const r = stakingDuMatch({ ...match, contexteDeMise: contexte }, ref, CONFIG_14, {});
    assert.equal(r.action, 'RECOMMENDED');
    assert.ok(r.stake <= acceptee, `${m.matchId} : jamais un centime au-dessus de la mise acceptée connue`);
    assert.ok(r.stake > acceptee - 0.011, `${m.matchId} : ramenée à la mise acceptée connue (${r.stake} pour ${acceptee})`);
    assert.deepEqual({ par: r.misePlafonnee.par, mise: r.misePlafonnee.mise, plafond: r.misePlafonnee.plafond }, { par: 'mise-acceptee', mise: sans.stake, plafond: r.stake });
    assert.ok(r.misePlafonnee.texte.includes(PLAFONDS_NOMMES['mise-acceptee']) && r.misePlafonnee.texte.startsWith('Mise conseillée ramenée à '), r.misePlafonnee.texte);
    assert.equal(r.regleDeMise.raisons.at(-1).code, 'mise-acceptee');
    // La fiche d'un AUTRE bookmaker ne plafonne rien.
    const ailleurs = stakingDuMatch({ ...match, contexteDeMise: { ...contexte, comptes: { un_autre_livre: { miseMaxAcceptee: 0.5 } } } }, ref, CONFIG_14, {});
    assert.equal(ailleurs.stake, sans.stake);
    assert.ok(!('misePlafonnee' in ailleurs));
    // Le plus petit gagne, chacun nommé : mise maximale, reste de la semaine, mise acceptée, solde déclaré, plancher.
    const ordre = Object.keys(PLAFONDS_NOMMES);
    const k = ordre[vus % ordre.length];
    const montants = Object.fromEntries(ordre.map((code, j) => [code, Number((sans.stake * (code === k ? 0.3 : 0.9 - j * 0.1)).toFixed(2))]));
    const tous = {
      capital: { indique: true, montant: 2000, plusHaut: 2000 + 100 - montants.plancher },
      enAttenteDuMatch: [],
      gardeFous: { miseMaxParPari: montants['mise-max'], resteSemaine: montants['perte-semaine'] },
      comptes: { [sans.bookmaker]: { miseMaxAcceptee: montants['mise-acceptee'], soldeDeclare: montants['solde-declare'] } },
      plancher: 100
    };
    const p = stakingDuMatch({ ...match, contexteDeMise: tous }, ref, CONFIG_14, {});
    assert.equal(p.misePlafonnee.par, k, `${m.matchId} : le plus petit plafond (${k}) est celui qui est nommé`);
    assert.ok(p.stake <= montants[k] + 1e-9 && p.stake > montants[k] - 0.011, `${p.stake} pour un plafond de ${montants[k]}`);
    assert.ok(p.misePlafonnee.texte.includes(PLAFONDS_NOMMES[k]));
    ramenees++;
  }
  assert.ok(ramenees >= 25, `conseils ramenés : ${ramenees}`);
  // Les garde-fous seuls (une décision sans règle, le plafond du moment de tiltState) : comme avant le lot 2, mot pour mot.
  const d = { action: 'RECOMMENDED', stake: 12.5, ev: 0.05, odds: 2.4 };
  assert.equal(plafonnerLeConseil(d, {}), d);
  assert.equal(plafonnerLeConseil(d, { plafondDeMise: { montant: 20, par: 'mise-max' } }), d);
  const ramenee = plafonnerLeConseil(d, { plafondDeMise: { montant: 5, par: 'mise-max' } }).misePlafonnee;
  assert.deepEqual({ mise: ramenee.mise, plafond: ramenee.plafond, par: ramenee.par }, { mise: 12.5, plafond: 5, par: 'mise-max' });
  assert.equal(ramenee.texte.replace(/\s/g, ' '), 'Mise conseillée ramenée à 5 € : votre mise maximale par pari, fixée dans Réglages. Le moteur conseillait 12,50 €.');
  assert.deepEqual(Object.keys(PLAFONDS_NOMMES), ['mise-max', 'perte-semaine', 'mise-acceptee', 'solde-declare', 'plancher']);
});

// ------------------------------------------------------------------ T-PA1

test('T-PA1 un changement des seuls réglages de pari, ou du contexte de la mise, ne change aucune probabilité : la cote juste est la même, et aucun module de probabilité ne lit ni un réglage de pari ni la mise', () => {
  // (1) La cote juste (les probabilités `fair` d'où sortent le 1N2 et la value) ne dépend ni des réglages de pari ni du contexte.
  const CHANGES = { edgeThresholdMin: 0.07, edgeThresholdMax: 0.6, valueBookmakers: ['pinnacle', 'unibet_fr'], maxValueOdds: 2.1, kellyFraction: 0.5, maxStakePercent: 0.1 };
  assert.deepEqual(Object.keys(CHANGES), [...REGLAGES_DE_PARI], 'chaque réglage de pari a sa valeur changée');
  let references = 0;
  let decisionsChangees = 0;
  let misesChangees = 0;
  MATCHS.forEach((m, i) => {
    const octets = (x) => JSON.stringify(x ?? null);
    if (referenceDuMatch(m, CONFIG_14).reference) references++;
    assert.equal(octets(fairFromBookmakers(m.marketOdds?.byBookmaker ?? [], CONFIG_4)), octets(fairFromBookmakers(m.marketOdds?.byBookmaker ?? [], CONFIG_14)));
    const avant = decisionDePari(m, CONFIG_14, {});
    for (const [cle, valeur] of Object.entries(CHANGES)) {
      const apres = decisionDePari(m, { ...CONFIG_14, [cle]: valeur }, {});
      assert.equal(octets(apres.reference), octets(avant.reference), `${m.matchId} : ${cle} change la cote juste`);
      assert.equal(apres.disponible, avant.disponible);
      if (octets(apres.staking) !== octets(avant.staking)) decisionsChangees++;
    }
    const avecContexte = decisionDePari({ ...m, contexteDeMise: contexteFabrique(i, m.bankroll) }, CONFIG_14, {});
    assert.equal(octets(avecContexte.reference), octets(avant.reference), `${m.matchId} : le contexte de la mise change la cote juste`);
    // Avec un contexte, la décision ne diffère que par la mise et ce qui la dit.
    const hors = ({ stake, regleDeMise, misePlafonnee, ...reste }) => JSON.stringify(reste);
    assert.equal(hors(avecContexte.staking), hors(avant.staking), `${m.matchId} : le contexte change autre chose que la mise`);
    const sansLesMises = (verdicts) => JSON.stringify(verdicts, (k, v) => (k === 'mise' ? undefined : v));
    assert.equal(sansLesMises(avecContexte.verdicts), sansLesMises(avant.verdicts), `${m.matchId} : le contexte change un verdict autrement que par sa mise`);
    if (avecContexte.staking.stake !== avant.staking.stake) misesChangees++;
  });
  assert.ok(references >= 400, `matchs avec une cote juste : ${references}`);
  assert.ok(decisionsChangees >= 200, `témoin : les réglages de pari changent bien des décisions de pari (${decisionsChangees})`);
  assert.ok(misesChangees >= 10, `témoin : le contexte change bien des mises (${misesChangees})`);
  // (2) La structure : la règle de mise n'est importée que par la value et par la fiche de l'IA ; aucun module qui calcule
  // une probabilité ne lit un réglage de pari, le contexte de la mise ou la mise elle-même.
  const importeurs = tousLesJs(SRC).filter((f) => /stakeSizing\.js['"]/.test(sansCommentaires(fs.readFileSync(path.join(SRC, f), 'utf8'))));
  assert.deepEqual(importeurs.sort(), ['core/ai/compactContext.js', 'core/engine/valueFinder.js']);
  const deProbabilite = fichiersDuMoteur().filter((f) => /^(core\/(engine|market|model|signals|xg)|sports)\//.test(f) && !/engineVersions|engineConfig|stakeSizing|valueFinder|coteMinimale|verdictPari|vosBookmakers|tiltState|fraicheurCotes|oddsEngine/.test(f));
  assert.ok(deProbabilite.length >= 12, `modules de probabilité : ${deProbabilite.length}`);
  for (const f of deProbabilite) {
    const t = sansCommentaires(lire(...f.split('/')));
    for (const cle of [...REGLAGES_DE_PARI, 'contexteDeMise', 'regleDeMise', 'misePlafonnee', 'partDeMise', 'fractionDeMise']) assert.doesNotMatch(t, new RegExp(`\\b${cle}\\b`), `${f} lit ${cle}`);
  }
  // L'analyse elle-même (oddsEngine.js) ne fait que PASSER le match à la décision de pari : elle ne lit ni le contexte ni la règle.
  assert.doesNotMatch(sansCommentaires(lire('core', 'engine', 'oddsEngine.js')), /contexteDeMise|regleDeMise|partDeMise|fractionDeMise/);
});
