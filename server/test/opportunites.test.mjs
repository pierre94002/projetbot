/**
 * La page « Opportunités du jour » et la correction de « Meilleures chances » (étape 8 du plan).
 *   node --test test/opportunites.test.mjs        (depuis server/)
 *
 *  1. UNE SEULE SOURCE DE VERDICT : pour un même pari, la page Opportunités, le Repérage, l'analyse
 *     d'un match (la route que lisent l'onglet « Value bets » de Mes paris et la page du match) et le
 *     moteur disent la même chose — dans une copie isolée, avec un faux relevé The Odds API archivé,
 *     des cotes gratuites et des compositions fabriquées, réseau coupé, heure figée.
 *  2. LE VERT = LE VERDICT DE findValueBet, sur une cote fraîche : 3 000 matchs tirés au sort (bookmakers
 *     de référence, vos bookmakers, « juge et partie », bourses, cotes de référence, heures de relevé) ;
 *     l'ancienne lecture du Repérage montrait en vert des cotes que le moteur écarte : comptées.
 *  3. Les mêmes chiffres que le Repérage et les Chutes de cotes ; l'état des compositions ; un nouveau
 *     relevé refait le calcul, la surveillance des notifications ne le relance jamais pour rien.
 *  4. Filtres, tri par value, favoris en tête ; notifications (une par opportunité, jamais deux fois,
 *     au plus trois et un résumé, sans son).
 *  5. « Paris les plus probables » de Mes paris (ui safestPicks.js) = les probabilités du moteur
 *     (binomiale négative mesurée) sur des matchs de la base d'essai — plus de loi de Poisson.
 *  6. Lecture du code : rien de payant, ni réseau, ni Claude dans les modules de l'étape.
 * Les valeurs attendues sont écrites à la main ou recalculées par les fonctions du MOTEUR (valueFinder,
 * statMarkets), jamais recopiées de la sortie du code testé.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR, MANIFESTE_ECHANTILLON } from './aides/isolement.mjs';
import { findValueBet, fairFromBookmakers, estJouable, coteJouable } from '../src/core/engine/valueFinder.js';
import { fraicheurCote, findValueBetFraiche } from '../src/core/engine/fraicheurCotes.js';
import { decisionDePari, ETATS_VERDICT, ETATS_AVEC_OFFRE } from '../src/core/engine/verdictPari.js';
import { lineCandidates, STAT_KINDS, coteJusteLigne } from '../src/sports/football/statMarkets.js';
import { DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../src/core/engine/engineConfig.js';

const UI_SRC = path.resolve(SERVEUR, '..', 'ui', 'src');
const pret = ['langageParis.js', 'opportunites.js', 'safestPicks.js', 'favoris.js'].every((f) => fs.existsSync(path.join(UI_SRC, 'utils', f)));
const options = { skip: pret ? false : 'ui/src/utils (langageParis, opportunites, safestPicks, favoris) manque' };
const L = pret ? await import(pathToFileURL(path.join(UI_SRC, 'utils', 'langageParis.js')).href) : {};
const O = pret ? await import(pathToFileURL(path.join(UI_SRC, 'utils', 'opportunites.js')).href) : {};
const SP = pret ? await import(pathToFileURL(path.join(UI_SRC, 'utils', 'safestPicks.js')).href) : {};
const F = pret ? await import(pathToFileURL(path.join(UI_SRC, 'utils', 'favoris.js')).href) : {};

const CONFIG = DEFAULT_ENGINE_CONFIG_BY_SPORT.football;
const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-opportunites.mjs');
const T0 = Date.parse('2026-10-05T12:00:00.000Z');
const MIN = 60_000;
const H = 3_600_000;
const ISSUES = ['home', 'draw', 'away'];

/** Une phase du script dans une copie neuve (avec scripts/ : l'application complète les charge). Une fois par phase. */
const phases = new Map();
function phase(nom) {
  if (!phases.has(nom)) {
    const copie = preparerCopie({});
    try {
      fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
      const r = executer(copie, SCRIPT, { args: [nom, MANIFESTE_ECHANTILLON], timeout: 300_000 });
      assert.equal(r.code, 0, `phase ${nom} :\n${r.erreurs.slice(-3000)}`);
      assert.ok(r.json?.ok, `phase ${nom} : sortie illisible\n${r.sortie.slice(-1500)}`);
      assert.equal(r.reseau, false, `phase ${nom} : un appel réseau`);
      phases.set(nom, r.json);
    } finally {
      copie.nettoyer();
    }
  }
  return phases.get(nom);
}
const ligneDe = (s, cle) => s.page.lignes.find((l) => l.cle === cle);

// ------------------------------------------------- 1. une seule source de verdict

test('même verdict, issue par issue : la page Opportunités = l’analyse d’un match (onglet « Value bets » de Mes paris, page du match) = le moteur, au même instant', options, () => {
  const s = phase('verdicts');
  assert.deepEqual(s.reperage, { status: 'ready', error: null, matchs: 5, echecs: [] });
  let compares = 0;
  for (const id of ['essai-a', 'essai-b', 'essai-c', 'essai-d', 'essai-e']) {
    const route = s.route[id];
    assert.equal(route.code, 200, id);
    for (const issue of ISSUES) {
      const ligne = ligneDe(s, `${id}|${issue}`);
      assert.ok(ligne, `${id} ${issue} : une ligne (une cote de vos bookmakers)`);
      // Le même objet, champ par champ : état, avantage, cote, bookmaker, heure, fraîcheur, juges.
      assert.deepEqual(ligne.verdict, route.verdicts[issue], `${id} ${issue}`);
      compares++;
    }
    // Ce que l'onglet « Value bets » de Mes paris retient (scanMatches) : le pari RECOMMANDÉ, coté au moins 1,20.
    const pari = route.staking;
    const vertsMesParis = pari.action === 'RECOMMENDED' && (pari.displayedOdds ?? pari.odds) >= 1.2 ? [pari.outcome] : [];
    const vertsPage = ISSUES.filter((i) => ligneDe(s, `${id}|${i}`).verdict.vert);
    assert.deepEqual(vertsPage, vertsMesParis, `${id} : les mêmes value bets`);
    // Et à l'écran, la même pastille : etatVerdict sur le même verdict, au même instant.
    for (const issue of ISSUES) assert.equal(L.etatVerdict(ligneDe(s, `${id}|${issue}`).verdict, T0).vert, vertsMesParis.includes(issue));
  }
  assert.equal(compares, 15);
  // Les deux values du jour : Man City gagne chez William Hill, Newcastle gagne chez Unibet ; la route des vertes dit les mêmes.
  assert.deepEqual(s.page.lignes.filter((l) => l.verdict?.vert).map((l) => l.cle), ['essai-a|home', 'essai-d|home']);
  assert.deepEqual(s.vertes.corps.vertes.map((v) => v.cle), ['essai-a|home', 'essai-d|home']);
  assert.deepEqual(s.vertesFonction.vertes.map((v) => v.cle), ['essai-a|home', 'essai-d|home']);
  assert.deepEqual(s.page.resume, { matchs: 5, matchsAvecVosCotes: 5, matchsSansVosCotes: 0, lignes: 16, vertes: 2, aRafraichir: 0, chutes: 2, chutesSansVosCotes: 1, coupeCircuit: false });
  // Le Repérage, par sa route, porte le même verdict.
  assert.deepEqual(s.reperageRoute.verdictA, s.route['essai-a'].verdicts.home);
  assert.deepEqual([s.pageRoute.code, s.pageRoute.status, s.pageRoute.lignes], [200, 'ready', 16]);
});

test('le vert seulement si findValueBet le recommande ET que la cote est fraîche : juge et partie, une seule value par match, cote trop haute, puis à 16 h tout est « à rafraîchir »', options, () => {
  const s = phase('verdicts');
  const v = (cle) => ligneDe(s, cle).verdict;
  // A — la value : William Hill 2,30 face à la cote juste de Pinnacle, relevée à 11 h 50 (archive), fraîche à midi.
  assert.equal(v('essai-a|home').etat, 'value');
  assert.equal(v('essai-a|home').bookmaker, 'williamhill');
  assert.equal(v('essai-a|home').cote, 2.3);
  assert.equal(v('essai-a|home').releveAt, '2026-10-05T11:50:00.000Z');
  assert.equal(v('essai-a|home').origineReleve, 'archive');
  assert.equal(v('essai-a|home').fraicheur.etat, 'fraiche');
  assert.deepEqual(v('essai-a|home').juges, { palier: 'Pinnacle', livres: ['Pinnacle'], cles: ['pinnacle'] });
  // L'avantage : celui de findValueBet (probabilité juste × cote − 1), recalculé ici sur les cotes du relevé.
  const fair = fairFromBookmakers([{ key: 'pinnacle', title: 'Pinnacle', odds1: 2.0, oddsDraw: 3.6, odds2: 3.9 }], CONFIG);
  assert.ok(Math.abs(v('essai-a|home').pourcent - (fair.probabilities[0] * 2.3 - 1) * 100) < 0.006);
  assert.match(v('essai-a|home').raison, /^Value : William Hill paie 2\.30 pour une cote juste de \d\.\d\d, soit un avantage de \+12,4 %, au-dessus du seuil de 2 % du moteur\.$/);
  // B — ni Pinnacle ni palier 2 : la cote juste vient de William Hill, Betsson et Unibet, tous à vous → juge et partie, jamais vert.
  for (const i of ISSUES) {
    assert.equal(v(`essai-b|${i}`).etat, 'juge', `B ${i}`);
    assert.equal(v(`essai-b|${i}`).vert, false);
    assert.deepEqual([...v(`essai-b|${i}`).juges.cles].sort(), ['betsson', 'unibet_nl', 'williamhill']);
  }
  assert.equal(s.route['essai-b'].staking.reason, 'bookmakers_juges');
  // L'ANCIENNE lecture du Repérage (meilleure cote de vos bookmakers × probabilité du moteur) la montrait en vert : c'est la limite corrigée.
  const b = s.reperageMarches['essai-b'].markets.find((k) => k.key === 'home');
  assert.equal(b.bestBookmaker, 'Betsson');
  const ancienne = L.etatValue({ pourcent: b.edgePct, jouable: true, cote: b.bestOdds, regle: { min: 2, max: 25, coteMax: 5 }, fraicheur: b.freshness });
  assert.equal(ancienne.etat, 'value', "l'ancienne lecture était verte (+4,3 % chez Betsson)");
  assert.match(v('essai-b|home').raison, /^Betsson a servi à fixer la cote juste de ce match \(palier 3 : .*\) : sa cote, c'est la cote juste plus sa marge — juge et partie, jamais une value\./);
  // C — palier 2 : Codere (à vous) a fixé la cote juste et paie le plus ; le moteur juge William Hill, et dit Codere écarté.
  const c = v('essai-c|home');
  assert.equal(c.bookmaker, 'williamhill');
  assert.equal(c.etat, 'sans-value');
  assert.deepEqual([c.offreJuge.bookmaker, c.offreJuge.cote], ['codere_it', 2.3]);
  assert.match(c.raison, /Codere \(IT\) paie davantage \(2\.30\) mais a servi à fixer la cote juste \(palier 2 : Marathon Bet, Codere \(IT\)\) : écarté, juge et partie\.$/);
  const ancienneC = s.reperageMarches['essai-c'].markets.find((k) => k.key === 'home');
  assert.equal(L.etatValue({ pourcent: ancienneC.edgePct, jouable: true, cote: ancienneC.bestOdds, regle: { min: 2, max: 25, coteMax: 5 }, fraicheur: ancienneC.freshness }).etat, 'value', "l'ancienne lecture : Codere en vert");
  // D — deux issues au-dessus du seuil chez Unibet : le moteur retient la plus forte, l'autre est dite « pas retenue », jamais verte.
  assert.equal(v('essai-d|home').etat, 'value');
  assert.equal(v('essai-d|draw').etat, 'value-secondaire');
  assert.equal(v('essai-d|draw').retenue, 'home');
  assert.ok(v('essai-d|draw').pourcent > 2 && v('essai-d|draw').pourcent < v('essai-d|home').pourcent);
  assert.match(v('essai-d|draw').raison, /le moteur ne retient qu'un pari par match, « Newcastle gagne », qui paie davantage\.$/);
  // E — 7,40 : au-delà de la cote maximale.
  assert.equal(v('essai-e|away').etat, 'cote-haute');
  assert.equal(s.route['essai-e'].staking.reason, 'value_hors_limites');
  // À 16 h : la cote a plus de 3 h (et A a commencé) — plus aucun vert, partout ; la page et le moteur disent la même chose.
  for (const l of s.pageTard.lignes) {
    if (!l.verdict) continue;
    const [id, issue] = l.cle.split('|');
    assert.notEqual(l.verdict.etat, 'value', l.cle);
    if (id !== 'essai-b') assert.equal(l.verdict.etat, 'a-rafraichir', l.cle);
    assert.deepEqual(l.verdict, s.moteurTard[id].verdicts[issue], `${l.cle} à 16 h`);
  }
  assert.equal(s.moteurTard['essai-a'].staking.reason, 'a_rafraichir');
  assert.equal(s.moteurTard['essai-a'].verdicts.home.fraicheur.code, 'match-commence');
  assert.equal(s.moteurTard['essai-d'].verdicts.home.fraicheur.code, 'trop-vieille');
  // Et l'écran, s'il est resté ouvert depuis midi : la pastille passe d'elle-même à « à rafraîchir » (horloge).
  assert.equal(L.etatVerdict(v('essai-d|home'), T0).vert, true);
  assert.equal(L.etatVerdict(v('essai-d|home'), Date.parse('2026-10-05T14:50:00Z')).vert, true, '3 h pile après le relevé : encore fraîche');
  assert.equal(L.etatVerdict(v('essai-d|home'), Date.parse('2026-10-05T14:50:01Z')).etat, 'a-rafraichir', 'une seconde de plus');
  assert.equal(L.etatVerdict(v('essai-b|home'), T0 + 5 * H).etat, 'juge', 'juge et partie ne dépend pas de l’heure');
});

// --------------------------------------------- 2. le vert = le verdict du moteur

function generateur(graine) {
  let s = graine >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const LIVRES = [
  ['pinnacle', 'Pinnacle'],
  ['marathonbet', 'Marathon Bet'],
  ['codere_it', 'Codere (IT)'],
  ['williamhill', 'William Hill'],
  ['sport888', '888sport'],
  ['betsson', 'Betsson'],
  ['nordicbet', 'Nordic Bet'],
  ['unibet_nl', 'Unibet (NL)'],
  ['leovegas_se', 'LeoVegas (SE)'],
  ['tipico_de', 'Tipico (DE)'],
  ['coolbet', 'Coolbet'],
  ['betclic_fr', 'Betclic (FR)'],
  ['betfair_ex_eu', 'Betfair']
];

test('le vert = le verdict de findValueBet sur les seules cotes fraîches, 3 000 matchs tirés au sort ; jamais deux verts par match, jamais chez un juge ni hors de vos bookmakers', options, () => {
  const hasard = generateur(20261008);
  const vus = { verts: 0, parEtat: {}, ancienneVerteEcartee: 0, juges: 0 };
  for (let n = 0; n < 3000; n++) {
    const brut = [0.2 + hasard() * 0.5, 0.15 + hasard() * 0.2, 0.1 + hasard() * 0.45];
    const somme = brut[0] + brut[1] + brut[2];
    const vrai = brut.map((p) => p / somme);
    const presents = LIVRES.filter(() => hasard() < 0.45);
    const byBookmaker = presents.map(([key, title]) => {
      const marge = 1.02 + hasard() * 0.08;
      const implicites = vrai.map((p) => p * marge * (0.95 + hasard() * 0.1));
      if (hasard() < 0.35) implicites[Math.floor(hasard() * 3)] *= 0.86 + hasard() * 0.1; // une offre généreuse
      const ligne = { key, title, odds1: Number((1 / implicites[0]).toFixed(2)), oddsDraw: Number((1 / implicites[1]).toFixed(2)), odds2: Number((1 / implicites[2]).toFixed(2)) };
      return hasard() < 0.08 ? { ...ligne, referenceOnly: true } : ligne;
    });
    if (!byBookmaker.length) continue;
    const coupDEnvoi = new Date(T0 + (hasard() < 0.1 ? -30 * MIN : (1 + hasard() * 30) * H)).toISOString();
    const parBookmaker = Object.fromEntries(byBookmaker.map((b) => [b.key, { releveAt: hasard() < 0.1 ? null : new Date(T0 - hasard() * 5 * H).toISOString(), origine: 'archive' }]));
    const match = {
      matchId: `m${n}`,
      home: 'Domicile',
      away: 'Extérieur',
      bankroll: 10000,
      marketOdds: { odds1: byBookmaker[0].odds1, oddsDraw: byBookmaker[0].oddsDraw, odds2: byBookmaker[0].odds2, byBookmaker },
      fraicheurCotes: { maintenant: T0, coupDEnvoi, heureSure: true, reglage: { maxAgeMinutes: 180, avantCompos: true }, parBookmaker }
    };
    const { reference, staking, verdicts } = decisionDePari(match, CONFIG, {});
    // L'oracle, sans verdictPari : findValueBet sur les seules cotes fraîches (fraicheurCote), avec les juges de la cote juste.
    let oracle = null;
    if (reference) {
      const fraiches = byBookmaker.filter((b) => fraicheurCote({ releveAt: parBookmaker[b.key].releveAt, maintenant: T0, coupDEnvoi, heureSure: true }).etat === 'fraiche');
      const r = findValueBet({ byBookmaker: fraiches, fair: reference.probabilities, referenceKeys: reference.keys, config: CONFIG, tiltState: {}, bankroll: 10000 });
      oracle = r.action === 'RECOMMENDED' ? r.outcome : null;
      // Et la décision officielle (findValueBetFraiche) dit la même chose.
      const officielle = findValueBetFraiche({ byBookmaker, fair: reference.probabilities, referenceKeys: reference.keys, config: CONFIG, tiltState: {}, bankroll: 10000 }, match.fraicheurCotes);
      assert.equal(officielle.action === 'RECOMMENDED' ? officielle.outcome : null, oracle, `match ${n}`);
    }
    const verts = ISSUES.filter((i) => verdicts[i].vert);
    assert.ok(verts.length <= 1, `match ${n} : deux verts`);
    assert.deepEqual(verts, oracle ? [oracle] : [], `match ${n} : vert ⇔ findValueBet sur les cotes fraîches (${staking.action}/${staking.reason})`);
    for (const i of ISSUES) {
      const v = verdicts[i];
      assert.ok(ETATS_VERDICT.includes(v.etat), `match ${n} ${i} : état ${v.etat}`);
      assert.ok(v.raison && v.raison.length > 20, `match ${n} ${i} : une raison`);
      vus.parEtat[v.etat] = (vus.parEtat[v.etat] ?? 0) + 1;
      if (v.vert) {
        vus.verts++;
        assert.ok(CONFIG.valueBookmakers.includes(v.bookmaker), `match ${n} : vert hors de vos bookmakers`);
        assert.ok(!reference.keys.includes(v.bookmaker), `match ${n} : vert chez un juge`);
        assert.equal(v.fraicheur.etat, 'fraiche');
        assert.ok(v.pourcent > CONFIG.edgeThresholdMin * 100 && v.pourcent <= CONFIG.edgeThresholdMax * 100 + 0.01 && v.coteNette <= CONFIG.maxValueOdds);
        assert.equal(L.etatVerdict(v, T0).vert, true, "l'écran le dit vert au même instant");
      } else {
        assert.equal(L.etatVerdict(v, T0).vert, false, `match ${n} ${i} : l'écran ne le fait jamais vert`);
      }
      if (v.etat === 'juge') {
        vus.juges++;
        assert.ok(reference.keys.includes(v.bookmaker), `match ${n} ${i} : un juge qui n'en est pas un`);
      }
      if (ETATS_AVEC_OFFRE.includes(v.etat)) assert.ok(v.cote > 1 && v.bookmakerTitle, `match ${n} ${i} : une offre sans cote`);
      // Un de vos bookmakers qui n'a pas fixé la cote juste cote cette issue (ligne saine) : le verdict porte sur SON offre,
      // même quand elle est à rafraîchir alors que le moteur recommande une autre issue sur des cotes fraîches.
      const champI = { home: 'odds1', draw: 'oddsDraw', away: 'odds2' }[i];
      const nonJuge = reference && staking.action !== 'CIRCUIT_BREAKER_ACTIVE' && byBookmaker.some((b) => estJouable(b, CONFIG) && !reference.keys.includes(b.key) && b[champI] > 1);
      if (nonJuge) assert.ok(!['juge', 'non-cote'].includes(v.etat) && !reference.keys.includes(v.bookmaker), `match ${n} ${i} : ${v.etat} chez ${v.bookmaker} alors qu'un bookmaker non juge la cote`);
      // L'ancienne lecture du Repérage : la meilleure de vos cotes (juges compris) × probabilité juste, seuils et fraîcheur de l'écran.
      const champ = { home: 'odds1', draw: 'oddsDraw', away: 'odds2' }[i];
      const meilleure = byBookmaker.filter((b) => estJouable(b, CONFIG)).reduce((m, b) => (!m || coteJouable(b, champ) > coteJouable(m, champ) ? b : m), null);
      if (meilleure && reference) {
        const p = reference.probabilities[ISSUES.indexOf(i)];
        const fraicheur = L.etatFraicheur({ releveAt: parBookmaker[meilleure.key].releveAt, maintenant: T0, coupDEnvoi, heureSure: true });
        const ancienne = L.etatValue({ pourcent: (p * coteJouable(meilleure, champ) - 1) * 100, jouable: true, cote: coteJouable(meilleure, champ), regle: { min: 2, max: 25, coteMax: 5 }, fraicheur });
        if (ancienne.vert && !v.vert) vus.ancienneVerteEcartee++;
      }
    }
  }
  // Le tirage couvre les cas (sinon la comparaison ne prouverait rien).
  assert.ok(vus.verts >= 100, `${vus.verts} verts`);
  for (const etat of ['value', 'value-secondaire', 'a-rafraichir', 'sous-seuil', 'sans-value', 'juge', 'non-jouable', 'pas-de-reference']) {
    assert.ok((vus.parEtat[etat] ?? 0) >= 10, `état « ${etat} » vu ${vus.parEtat[etat] ?? 0} fois`);
  }
  // Ce que l'ancienne lecture montrait en vert alors que le moteur l'écarte (juge et partie, pari non retenu…) : plus de vert.
  assert.ok(vus.ancienneVerteEcartee >= 50, `${vus.ancienneVerteEcartee} anciens verts écartés par le moteur`);
});

test('coupe-circuit enclenché, pas assez de bookmakers de référence, aucun de vos bookmakers : jamais de vert, la cote de vos bookmakers dite quand elle existe, la raison toujours', options, () => {
  const livres = [
    { key: 'pinnacle', title: 'Pinnacle', odds1: 2.0, oddsDraw: 3.6, odds2: 3.9 },
    { key: 'williamhill', title: 'William Hill', odds1: 2.3, oddsDraw: 3.4, odds2: 3.3 }
  ];
  const match = (byBookmaker) => ({ home: 'Man City', away: 'Liverpool', bankroll: 10000, marketOdds: { odds1: byBookmaker[0].odds1, oddsDraw: byBookmaker[0].oddsDraw, odds2: byBookmaker[0].odds2, byBookmaker } });
  // Coupe-circuit : la value de William Hill n'est pas conseillée ; sa cote reste dite.
  const coupe = decisionDePari(match(livres), CONFIG, { circuitBreakerActive: true });
  assert.equal(coupe.staking.action, 'CIRCUIT_BREAKER_ACTIVE');
  for (const i of ISSUES) {
    assert.deepEqual([coupe.verdicts[i].etat, coupe.verdicts[i].vert, coupe.verdicts[i].bookmaker], ['coupe-circuit', false, 'williamhill']);
    assert.match(coupe.verdicts[i].raison, /coupe-circuit de Réglages est enclenché/);
  }
  // Sans Pinnacle ni palier 2, un seul avis du palier 3 : pas de cote juste, pas de value — la cote dite.
  const seul = decisionDePari(match([livres[1]]), CONFIG, {});
  assert.equal(seul.staking.reason, 'trop_peu_de_bookmakers');
  assert.deepEqual([seul.verdicts.home.etat, seul.verdicts.home.cote, seul.verdicts.home.pourcent], ['pas-de-reference', 2.3, null]);
  // Aucun de vos bookmakers (cotes de référence gratuites seulement) : non jouable, aucune cote à vous.
  const reference = decisionDePari(match(livres.map((b) => ({ ...b, referenceOnly: true }))), CONFIG, {});
  assert.deepEqual([reference.verdicts.home.etat, reference.verdicts.home.cote, reference.verdicts.home.vert], ['non-jouable', null, false]);
  // Pas de cote du tout.
  assert.equal(decisionDePari({ home: 'A', away: 'B', marketOdds: null }, CONFIG, {}).verdicts.draw.etat, 'pas-de-cote');
  // La page garde ces lignes quand une cote de vos bookmakers existe (après les lectures de value), jamais en vert.
  const ligneCoupe = { cle: 'x|home', verdict: coupe.verdicts.home, avecOffre: true, commenceTime: '2026-10-05T18:00:00Z' };
  assert.equal(O.rangVivant(ligneCoupe, T0), 2);
  assert.equal(L.etatVerdict(coupe.verdicts.home, T0).vert, false);
  assert.equal(O.valueDeLaLigne(ligneCoupe), null, 'pas une value : exclue par « value minimale »');
});

test('etatVerdict (l’écran) : ne refait aucun calcul de value — seule la fraîcheur se réévalue ; un verdict absent ou inconnu n’est jamais vert', options, () => {
  const fraicheur = (releveAt) => ({ etat: 'fraiche', code: 'fraiche', raison: 'Relevée il y a 10 min.', releveAt, coupDEnvoi: '2026-10-05T19:00:00.000Z', heureSure: true, reglage: { maxAgeMinutes: 180, avantCompos: true } });
  const value = { etat: 'value', pourcent: 6.4, bookmakerTitle: 'Unibet (NL)', raison: 'Value : Unibet (NL) paie 2.75.', fraicheur: fraicheur('2026-10-05T11:50:00.000Z') };
  assert.deepEqual(L.etatVerdict(value, T0), { etat: 'value', vert: true, qualificatif: '', raison: 'Value : Unibet (NL) paie 2.75.' });
  const tard = L.etatVerdict(value, T0 + 3 * H);
  assert.equal(tard.etat, 'a-rafraichir');
  assert.match(tard.raison, /^Cote à rafraîchir : Relevée il y a 3 h 10, au-delà du délai de 3 h : à relever de nouveau avant de parier\. Au dernier relevé, l'avantage chez Unibet \(NL\) était de \+6,4 % : ce n'est pas une value tant que la cote n'est pas relevée de nouveau\.$/);
  // Le serveur l'a dite à rafraîchir : elle le reste, même si l'horloge de ce poste retarde.
  assert.equal(L.etatVerdict({ ...value, etat: 'a-rafraichir', fraicheur: { ...value.fraicheur, etat: 'a-rafraichir' } }, T0 - H).etat, 'a-rafraichir');
  // Sans heure (verdict calculé sans fraîcheur) : pas de contrôle — comme l'étape 7.
  assert.equal(L.etatVerdict({ ...value, fraicheur: null }, T0 + 30 * H).vert, true);
  for (const x of [null, undefined, {}, { etat: 'vert' }, 'value', { etat: 'value-ish' }]) {
    const e = L.etatVerdict(x, T0);
    assert.equal(e.etat, 'inconnue', JSON.stringify(x));
    assert.equal(e.vert, false);
  }
  // Chaque état du serveur a son mot ; aucun autre que « value » n'est vert.
  for (const etat of ETATS_VERDICT) {
    assert.ok(etat in L.QUALIFICATIFS_VERDICT, etat);
    assert.equal(L.etatVerdict({ etat, raison: 'x' }, T0).vert, etat === 'value', etat);
  }
});

// ------------------------------------- 3. mêmes chiffres, compositions, recalcul

test('les mêmes chiffres que le Repérage (probabilité, cote juste, cote de vos bookmakers, son heure) et que les Chutes de cotes (mouvement depuis l’ouverture)', options, () => {
  const s = phase('verdicts');
  for (const l of s.page.lignes) {
    const [id, cle] = l.cle.split('|');
    const k = s.reperageMarches[id].markets.find((x) => x.key === cle);
    assert.equal(l.probabilite, k.engineProb, l.cle);
    assert.equal(l.probabiliteMarche, k.marketProb, l.cle);
    assert.equal(l.coteJuste, k.engineProb > 0 ? Number((1 / k.engineProb).toFixed(2)) : null, l.cle);
    if (k.bestOdds != null) assert.deepEqual([l.meilleureCote.cote, l.meilleureCote.bookmaker, l.meilleureCote.releveAt], [k.bestOdds, k.bestBookmaker, k.bestOddsAt], l.cle);
    assert.deepEqual(l.verdict, k.verdict ?? null, l.cle);
    assert.deepEqual(l.mouvement, k.movement ?? null, l.cle);
  }
  // Les chutes : Man City gagne (−13,9 % de cote juste) et « Plus de 2,5 buts » (−10,3 %), les deux chiffres de la page Chutes de cotes.
  const fixture = s.chutes.fixtures.find((f) => f.homeId === s.ids['Man City']);
  assert.ok(fixture, 'la rencontre est dans les Chutes de cotes');
  const chute = (market, line, issue) => fixture.drops.find((d) => d.market === market && Number(d.line) === line && d.issue === issue);
  for (const [cle, market, line, issue] of [
    ['essai-a|home', '1x2', 0, 'home'],
    ['essai-a|over25', 'ou', 2.5, 'over']
  ]) {
    const l = ligneDe(s, cle);
    const d = chute(market, line, issue);
    assert.ok(l.chute && d, cle);
    for (const champ of ['dropPct', 'deltaPoints', 'fromProb', 'toProb', 'agreeing', 'bookmakersCount', 'fromAt', 'toAt']) assert.equal(l.mouvement[champ], d[champ], `${cle} ${champ}`);
  }
  assert.ok(Math.abs(ligneDe(s, 'essai-a|home').mouvement.dropPct - 13.86) < 0.01);
  // Le pari en clair, avec les noms du relevé.
  assert.deepEqual(['essai-a|home', 'essai-a|draw', 'essai-a|away', 'essai-a|over25'].map((c) => ligneDe(s, c).pari), ['Man City gagne', 'Match nul', 'Liverpool gagne', 'Plus de 2,5 buts']);
  // Une chute sans cote chez vos bookmakers (The Odds API ne relève que le 1N2) : une ligne quand même, sans verdict.
  const plus25 = ligneDe(s, 'essai-a|over25');
  assert.deepEqual([plus25.avecOffre, plus25.verdict, plus25.pari], [false, null, 'Plus de 2,5 buts']);
  // Une hausse de cote n'est pas une chute ; un mouvement absent est absent, jamais 0.
  assert.equal(ligneDe(s, 'essai-a|away').chute, false);
  assert.ok(ligneDe(s, 'essai-a|away').mouvement.dropPct < 0);
  assert.equal(ligneDe(s, 'essai-b|home').mouvement, null);
  // La confiance : pas encore mesurée (étape 38), jamais un niveau inventé.
  assert.ok(s.page.lignes.every((l) => l.confiance === null));
  assert.equal(L.etatConfiance({ valeur: ligneDe(s, 'essai-a|home').confiance }).etat, 'non-mesuree');
});

test('l’état de la composition : officielle (lue 45 min avant), probable (5 h avant, ou un titulaire dit indisponible), dernière alignée (magasin) — la règle de l’écran, sans requête FotMob', options, () => {
  const s = phase('verdicts');
  const etat = (cle) => L.etatComposition(ligneDe(s, cle).compo).etat;
  assert.deepEqual([ligneDe(s, 'essai-a|home').compo.source, ligneDe(s, 'essai-a|home').compo.minutesBeforeKickoff], ['FotMob', 45]);
  assert.equal(etat('essai-a|home'), 'officielle');
  assert.equal(etat('essai-d|home'), 'probable');
  assert.equal(etat('essai-b|home'), 'probable', 'un titulaire de Chelsea dit indisponible : prévisionnelle');
  for (const id of ['essai-c', 'essai-e']) {
    assert.equal(s.reperageMarches[id].lastLineupKnown, true, id);
    assert.equal(etat(`${id}|home`), 'derniere', id);
  }
  // Les titulaires et absents ne sont transmis que par leur nom (la règle n'a besoin que de ça).
  assert.deepEqual(Object.keys(ligneDe(s, 'essai-b|home').compo.away.startXI[0]), ['name']);
  assert.deepEqual(ligneDe(s, 'essai-b|home').compo.away.unavailable, [{ name: 'Chelsea Joueur 4' }]);
});

test('un nouveau relevé The Odds API rend le calcul périmé et il se refait ; sans nouveau relevé, la surveillance des vertes ne relance rien', options, () => {
  const s = phase('invalidation');
  assert.deepEqual(s.sansNouveauReleve, { status: 'ready', vertes: ['essai-a|home', 'essai-d|home'] });
  assert.equal(s.nouveauReleve.status, 'computing', 'le fichier du relevé a changé : nouveau calcul');
  assert.deepEqual(s.apresCalcul, { status: 'ready', vertes: ['essai-d|home'] }, "William Hill est passé à 2,02 : plus de value sur Man City");
});

// --------------------------------- 4. filtres, tri, favoris, notifications (écran)

const verdict = (etat, pourcent, extra = {}) => ({ etat, vert: etat === 'value', pourcent, raison: `${etat} ${pourcent}`, cote: 2.1, bookmaker: 'williamhill', bookmakerTitle: 'William Hill', limites: { min: 2, max: 25, coteMax: 5 }, fraicheur: null, ...extra });
const ligne = (cle, league, home, away, v, extra = {}) => ({
  cle,
  matchId: cle.split('|')[0],
  league,
  home,
  away,
  homeId: null,
  awayId: null,
  commenceTime: '2026-10-05T18:00:00.000Z',
  exactKickoff: true,
  marche: cle.split('|')[1],
  verdict: v,
  avecOffre: Boolean(v && ETATS_AVEC_OFFRE.includes(v.etat)),
  mouvement: null,
  chute: false,
  pari: cle,
  ...extra
});
const LIGNES = [
  ligne('m1|home', 'EPL', 'Arsenal', 'Chelsea', verdict('sous-seuil', 1.2)),
  ligne('m2|home', 'Ligue 1 - France', 'Lyon', 'Nice', verdict('value', 4.1)),
  ligne('m3|draw', 'EPL', 'Leeds', 'Everton', verdict('value', 7.5)),
  ligne('m4|away', 'La Liga - Spain', 'Betis', 'Real Madrid', verdict('trop-beau', 31)),
  ligne('m5|home', 'EPL', 'Fulham', 'Brentford', verdict('juge', 9)),
  ligne('m6|over25', 'Serie A - Italy', 'Milan', 'Inter', null, { mouvement: { dropPct: 12, chute: true }, chute: true }),
  ligne('m7|home', 'Ligue 1 - France', 'Lens', 'Lille', verdict('a-rafraichir', 6)),
  ligne('m8|home', 'EPL', 'Burnley', 'Wolves', verdict('value-secondaire', 2.5), { commenceTime: '2026-10-09T18:00:00.000Z' }),
  ligne('m9|away', 'Serie A - Italy', 'Roma', 'Lazio', null, { mouvement: { dropPct: 6, chute: true }, chute: true })
];

test('tri par value : la value verte d’abord (la plus forte en tête), puis les lectures réelles, puis ce que le moteur écarte, puis les chutes seules', options, () => {
  const ordre = O.trierLesOpportunites(LIGNES, T0).map((l) => l.cle);
  assert.deepEqual(ordre, ['m3|draw', 'm2|home', 'm7|home', 'm8|home', 'm1|home', 'm4|away', 'm5|home', 'm6|over25', 'm9|away']);
  // Une value qui vieillit pendant que la page est ouverte descend d'elle-même (rang vivant).
  const vieillit = { ...LIGNES[2], verdict: { ...LIGNES[2].verdict, fraicheur: { etat: 'fraiche', releveAt: '2026-10-05T11:00:00.000Z', coupDEnvoi: '2026-10-05T18:00:00.000Z', heureSure: true, reglage: { maxAgeMinutes: 180, avantCompos: true } } } };
  assert.equal(O.rangVivant(vieillit, T0), 0);
  assert.equal(O.rangVivant(vieillit, T0 + 3 * H), 1);
  assert.deepEqual(O.trierLesOpportunites([vieillit, LIGNES[1]], T0 + 3 * H).map((l) => l.cle), ['m2|home', 'm3|draw']);
});

test('filtres : championnat, marché, value minimale (jamais l’avantage d’un « juge »), période', options, () => {
  const f = (filtres) => O.filtrerLesOpportunites(LIGNES, { ...filtres, maintenant: T0 }).map((l) => l.cle).sort();
  assert.equal(f({}).length, 9);
  assert.deepEqual(f({ competition: 'EPL' }), ['m1|home', 'm3|draw', 'm5|home', 'm8|home']);
  assert.deepEqual(f({ marche: 'away' }), ['m4|away', 'm9|away']);
  assert.deepEqual(f({ valeurMin: 'positive' }), ['m1|home', 'm2|home', 'm3|draw', 'm4|away', 'm7|home', 'm8|home'], 'le +9 % d’un juge n’est pas une value ; une chute seule n’a pas de value');
  assert.deepEqual(f({ valeurMin: 'seuil' }), ['m2|home', 'm3|draw', 'm4|away', 'm7|home', 'm8|home']);
  assert.deepEqual(O.filtrerLesOpportunites([ligne('x|home', 'EPL', 'A', 'B', verdict('sous-seuil', 2))], { valeurMin: 'seuil', maintenant: T0 }), [], 'pile le seuil : pas au-dessus (règle de findValueBet)');
  assert.deepEqual(f({ valeurMin: '5' }), ['m3|draw', 'm4|away', 'm7|home']);
  assert.deepEqual(f({ valeurMin: '10' }), ['m4|away']);
  assert.deepEqual(f({ periode: 'today' }), f({}).filter((c) => c !== 'm8|home'));
  assert.deepEqual(f({ periode: '3' }), f({ periode: 'today' }));
  assert.deepEqual(f({ competition: 'EPL', valeurMin: 'positive', periode: 'today' }), ['m1|home', 'm3|draw']);
  assert.deepEqual(O.VALEURS_MINIMALES.map((v) => v.value), ['toutes', 'positive', 'seuil', '5', '10']);
});

test('favoris en tête : les lignes d’une équipe favorite, puis des championnats favoris, puis le reste — le tri par value gardé dans chaque bloc', options, () => {
  const index = F.indexerFavoris({ teams: [{ id: null, name: 'Lens', aliases: [] }], leagues: [{ name: 'EPL' }] });
  const favoritesFirst = (elements, { league = () => null, teams = () => [] } = {}) =>
    F.favorisDabord(elements, { ligue: league, aUneEquipeFavorite: (e) => teams(e).some(([nom, , id]) => F.estEquipeFavorite(index, nom, id)) }, index);
  const ordre = O.opportunitesAffichees(LIGNES, { maintenant: T0, favoritesFirst }).map((l) => l.cle);
  assert.deepEqual(ordre, ['m7|home', 'm3|draw', 'm8|home', 'm1|home', 'm5|home', 'm2|home', 'm4|away', 'm6|over25', 'm9|away']);
  // Sans favoris : l'ordre de la value.
  assert.deepEqual(O.opportunitesAffichees(LIGNES, { maintenant: T0 }).map((l) => l.cle), O.trierLesOpportunites(LIGNES, T0).map((l) => l.cle));
  // Les filtres s'appliquent avant.
  assert.deepEqual(O.opportunitesAffichees(LIGNES, { maintenant: T0, favoritesFirst, filtres: { valeurMin: 'seuil' } }).map((l) => l.cle), ['m7|home', 'm3|draw', 'm8|home', 'm2|home', 'm4|away']);
});

test('notifications : une par opportunité verte NOUVELLE, jamais deux fois (même cote), une nouvelle cote en est une autre, au plus trois puis un résumé, vertes à l’heure qu’il est, sans son', options, () => {
  const fraiche = { etat: 'fraiche', releveAt: '2026-10-05T11:50:00.000Z', coupDEnvoi: '2026-10-05T19:00:00.000Z', heureSure: true, reglage: { maxAgeMinutes: 180, avantCompos: true } };
  const verte = (cle, pourcent, extra = {}) => ({ cle, matchId: cle.split('|')[0], home: 'Newcastle', away: 'Leeds', pari: 'Newcastle gagne', commenceTime: '2026-10-05T19:30:00.000Z', exactKickoff: true, verdict: { etat: 'value', vert: true, pourcent, cote: 2.75, bookmaker: 'unibet_nl', bookmakerTitle: 'Unibet (NL)', fraicheur: fraiche, ...extra } });
  const vertes = [verte('a|home', 6.4), verte('b|home', 12.4), verte('c|draw', 3.1), verte('d|away', 4.0), verte('e|home', 9.9)];
  const premiere = O.opportunitesANotifier(vertes, {}, { maintenant: T0 });
  assert.deepEqual(premiere.individuelles.map((o) => o.cle), ['b|home', 'e|home', 'a|home'], 'les trois plus fortes');
  assert.deepEqual(premiere.resumees.map((o) => o.cle), ['d|away', 'c|draw']);
  assert.equal(premiere.cles.length, 5, 'toutes gardées en mémoire : aucune ne reviendra');
  // La vérification suivante : rien de nouveau, rien de notifié.
  const memoire = Object.fromEntries(premiere.cles.map((c) => [c, new Date(T0).toISOString()]));
  assert.deepEqual(O.opportunitesANotifier(vertes, memoire, { maintenant: T0 + 2 * MIN }).cles, []);
  assert.deepEqual(O.opportunitesANotifier(vertes, new Set(premiere.cles), { maintenant: T0 + 2 * MIN }).cles, [], 'mémoire en Set aussi');
  // Un nouveau relevé, une nouvelle cote : une nouvelle opportunité (une seule notification).
  const nouvelleCote = [verte('a|home', 8.2, { cote: 2.85 })];
  assert.deepEqual(O.opportunitesANotifier(nouvelleCote, memoire, { maintenant: T0 + 3 * MIN }).individuelles.map((o) => o.verdict.cote), [2.85]);
  // Vertes à l'heure qu'il est : une value devenue « à rafraîchir » ne notifie rien ; un juge jamais.
  assert.deepEqual(O.opportunitesANotifier(vertes, {}, { maintenant: T0 + 4 * H }).cles, []);
  assert.deepEqual(O.opportunitesANotifier([verte('j|home', 9, { etat: 'juge', vert: false })], {}, { maintenant: T0 }).cles, []);
  // Le contenu : sans son, une étiquette par opportunité (deux onglets n'en montrent qu'une), le résumé à part.
  const n = O.contenuDeNotification(vertes[0]);
  assert.equal(n.silent, true);
  assert.equal(n.titre, 'Value +6,4 % : Newcastle gagne');
  assert.match(n.corps, /^Newcastle – Leeds · Unibet \(NL\) 2\.75 · coup d'envoi \d\d:\d\d$/);
  assert.equal(n.tag, `cotemaster-opportunite|${O.cleDeNotification(vertes[0])}`);
  assert.notEqual(O.contenuDeNotification(vertes[1]).tag, n.tag);
  assert.deepEqual(O.contenuDuResume(premiere.resumees), { titre: '2 autres values vertes', corps: 'Page Matchs › Opportunités du jour.', tag: 'cotemaster-opportunites-resume', silent: true });
  assert.equal(O.contenuDuResume([vertes[0]]).titre, '1 autre value verte');
  // La mémoire se nettoie après 14 jours (et une valeur illisible ne survit pas).
  const vieille = { ancienne: new Date(T0 - 15 * 86_400_000).toISOString(), recente: new Date(T0 - 86_400_000).toISOString(), illisible: 'pas une date' };
  assert.deepEqual(Object.keys(O.memoireNettoyee(vieille, T0)), ['recente']);
  assert.deepEqual(O.memoireNettoyee(null, T0), {});
});

test('la surveillance des notifications : la permission n’est demandée qu’au clic (jamais au chargement), rien ne sort du PC, deux minutes entre deux lectures légères', options, () => {
  const source = fs.readFileSync(path.join(UI_SRC, 'composables', 'useNotificationsOpportunites.js'), 'utf8');
  // requestPermission : une seule fois, dans l'activation (appelée par l'interrupteur), une activation à la fois.
  const appels = [...source.matchAll(/requestPermission\(/g)];
  assert.equal(appels.length, 1);
  const activer = source.slice(source.indexOf('async function activer()'));
  assert.ok(source.includes('async function activer()') && activer.includes('requestPermission('), "dans l'activation");
  assert.match(source, /activation \?\?= activer\(\)/, 'une activation à la fois (AppToggle peut appeler son setter deux fois)');
  assert.doesNotMatch(source.slice(0, source.indexOf('export function activerNotifications')), /requestPermission\(/, 'jamais avant le clic');
  assert.match(source, /silent/);
  assert.match(source, /INTERVALLE_SURVEILLANCE_MS = 2 \* 60_000/);
  // Rien d'autre que l'API de l'appli : pas de service de push, pas d'autre adresse.
  assert.doesNotMatch(source, /fetch\(|PushManager|serviceWorker|https?:\/\//);
  assert.match(source, /opportunitiesApi\.vertes\(\)/);
  // La page pose l'interrupteur ; AppShell monte la surveillance une fois.
  assert.match(fs.readFileSync(path.join(UI_SRC, 'views', 'OpportunitiesView.vue'), 'utf8'), /<AppToggle v-model="notifier"/);
  assert.match(fs.readFileSync(path.join(UI_SRC, 'components', 'layout', 'AppShell.vue'), 'utf8'), /^useSurveillanceOpportunites\(\);$/m);
});

// ------------------------------------ 5. « Paris les plus probables » = le moteur

test('« Paris les plus probables » de Mes paris : corners, tirs et tirs cadrés = les cotes justes du moteur (binomiale négative mesurée) sur 12 matchs de la base d’essai — plus de Poisson', options, () => {
  const s = phase('moteur');
  assert.equal(s.analyses.length, 12);
  let picksStats = 0;
  const ecarts = [];
  const poisson = (mu, line) => {
    let p = 0;
    let t = Math.exp(-mu);
    for (let k = 0; k <= Math.floor(line); k++) {
      p += t;
      t *= mu / (k + 1);
    }
    return p; // P(X ≤ ligne)
  };
  for (const a of s.analyses) {
    // 1. Les lignes que l'analyse transmet sont EXACTEMENT celles du moteur (lineCandidates, même loi, même arrondi).
    for (const [kind, e] of Object.entries(a.statExpectations)) {
      const loi = STAT_KINDS[kind];
      for (const [cote, mu, invK] of [
        ['total', e.total, loi.invKTotal],
        ['home', e.home, loi.invKTeam],
        ['away', e.away, loi.invKTeam]
      ]) {
        const attendu = lineCandidates(mu, invK);
        const recu = a.statLines[kind][cote].flatMap((l) => [{ line: l.line, side: 'under', odds: l.under }, { line: l.line, side: 'over', odds: l.over }]);
        assert.deepEqual(recu, attendu, `${a.match} ${kind} ${cote}`);
      }
    }
    // 2. Ce que l'onglet propose : dans chaque marché, la ligne la plus probable cotée au moins 1,35, avec la cote du moteur.
    const picks = SP.computeSafestPicks(a);
    const home = a.teamStats?.home?.name ?? 'Domicile';
    const away = a.teamStats?.away?.name ?? 'Extérieur';
    const attenduDe = (kind, cote) => {
      const loi = STAT_KINDS[kind];
      const mu = a.statExpectations[kind][cote];
      return lineCandidates(mu, cote === 'total' ? loi.invKTotal : loi.invKTeam)
        .filter((c) => c.odds >= 1.35)
        .reduce((m, c) => (!m || c.odds < m.odds ? c : m), null);
    };
    const sens = (s2) => (s2 === 'over' ? 'Plus de' : 'Moins de');
    const attendus = [
      ['Total tirs cadrés', 'totalShotsOnTarget', 'shotsOnTarget', 'total', null, 'tirs cadrés'],
      ['Total corners', 'totalCorners', 'corners', 'total', null, 'corners'],
      ['Tirs par équipe', 'teamShots', 'shots', 'home', home, 'tirs'],
      ['Tirs cadrés par équipe', 'teamShotsOnTarget', 'shotsOnTarget', 'home', home, 'tirs cadrés'],
      ['Tirs par équipe', 'teamShots', 'shots', 'away', away, 'tirs'],
      ['Tirs cadrés par équipe', 'teamShotsOnTarget', 'shotsOnTarget', 'away', away, 'tirs cadrés']
    ];
    for (const [market, marketId, kind, cote, equipe, unite] of attendus) {
      const c = attenduDe(kind, cote);
      const libelle = `${equipe ? `${equipe} — ` : ''}${sens(c.side)} ${c.line} ${unite}`;
      const pick = picks.find((p) => p.market === market && p.pick === libelle);
      assert.ok(pick, `${a.match} : ${market} « ${libelle} » absent (${picks.filter((p) => p.market === market).map((p) => p.pick).join(' ; ')})`);
      assert.equal(pick.odds, c.odds, `${a.match} ${libelle}`);
      assert.equal(pick.marketId, marketId);
      assert.deepEqual(pick.params, cote === 'total' ? { line: c.line, side: c.side } : { team: cote, line: c.line, side: c.side });
      // La probabilité affichée (1 / cote) = celle du moteur pour cette ligne (coteJusteLigne, la même loi).
      assert.equal(pick.odds, coteJusteLigne(a.statExpectations[kind][cote], cote === 'total' ? STAT_KINDS[kind].invKTotal : STAT_KINDS[kind].invKTeam, c.line, c.side));
      picksStats++;
      // Ce que disait la loi de Poisson pour la même ligne (l'ancien calcul) : de combien elle était plus optimiste.
      const pMoinsPoisson = poisson(a.statExpectations[kind][cote], c.line);
      const pPoisson = c.side === 'under' ? pMoinsPoisson : 1 - pMoinsPoisson;
      ecarts.push((pPoisson - 1 / c.odds) * 100);
    }
    // Plus de « Qui fait le plus de… » (aucune probabilité du moteur) ; aucun autre marché que ceux d'avant.
    assert.ok(!picks.some((p) => /^Qui fait le plus/.test(p.market)));
    for (const p of picks) {
      assert.ok(['Résultat', 'Total buts', 'Les 2 équipes marquent', 'Résultat + Total buts', 'Buts par équipe', 'Total tirs cadrés', 'Total corners', 'Tirs par équipe', 'Tirs cadrés par équipe'].includes(p.market), p.market);
    }
    // Et le pronostic du moteur (cote minimale 1,20) sur ces marchés lit les mêmes lignes.
    for (const p of a.marketPredictions.filter((x) => x.marketId === 'totalCorners')) {
      assert.ok(lineCandidates(a.statExpectations.corners.total, STAT_KINDS.corners.invKTotal).some((c) => c.line === p.params.line && c.side === p.params.side && c.odds === p.predictedOdds));
    }
  }
  assert.equal(picksStats, 72);
  // Les marchés de buts restent (lus dans les cotes justes du moteur, comme avant ; « Plus de 3,5 » sous 1,35 : pas de pari, comme avant).
  assert.ok(s.analyses.filter((a) => SP.computeSafestPicks(a).some((p) => p.market === 'Total buts')).length >= 10);
  // L'alignement rend ces pourcentages plus prudents : en moyenne la loi de Poisson annonçait davantage.
  const moyenne = ecarts.reduce((t, x) => t + x, 0) / ecarts.length;
  assert.ok(moyenne > 0.5, `Poisson plus optimiste de ${moyenne.toFixed(2)} point en moyenne sur ces lignes`);
  assert.ok(Math.max(...ecarts) >= 2, `jusqu'à ${Math.max(...ecarts).toFixed(1)} points`);
});

test('« Paris les plus probables » : sans lignes du moteur, aucun pari de corners ni de tirs inventé ; le calcul Poisson de l’interface a disparu', options, () => {
  const sansStats = SP.computeSafestPicks({ trueOdds: { home: 2.1, draw: 3.4, away: 3.6, over05: 1.06, over15: 1.3, over25: 1.95, over35: 3.4, bothTeamsScore: 1.8 }, statLines: null });
  assert.ok(sansStats.length > 0);
  assert.ok(!sansStats.some((p) => /corners|tirs/i.test(`${p.market} ${p.pick}`)));
  assert.equal(fs.existsSync(path.join(UI_SRC, 'utils', 'shotsModel.js')), false, 'le modèle Poisson de l’interface est retiré');
  const source = fs.readFileSync(path.join(UI_SRC, 'utils', 'safestPicks.js'), 'utf8');
  assert.doesNotMatch(source, /Poisson\(|shotsModel|poissonProbability|averagesComparison\b(?!.*recevait)/);
  assert.match(fs.readFileSync(path.join(UI_SRC, 'views', 'MyBetsView.vue'), 'utf8'), /computeSafestPicks\(data\)/);
});

// --------------------------------------------------- 6. lecture du code

function importsDe(fichier) {
  const source = fs.readFileSync(fichier, 'utf8');
  return [...source.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
}

test('les modules de l’étape 8 : ni API payante, ni Claude, ni réseau, ni minuterie ; GET seulement ; le moteur a une seule décision de pari', options, () => {
  const SRC = path.join(SERVEUR, 'src');
  const ETAPE8 = ['core/engine/verdictPari.js', 'data/opportunities.js', 'data/db/derniereComposition.js', 'api/controllers/opportunities.controller.js', 'api/routes/opportunities.routes.js'];
  for (const rel of ETAPE8) {
    const fichier = path.join(SRC, rel);
    for (const i of importsDe(fichier)) {
      assert.doesNotMatch(i, /oddsApiClient|liveDataSync|apiFootballClient|sportMonksClient|flashscoreClient|teamStatsService|claudeCodeClient|anthropicClient|aiAnalysisService|matchAiAnalysisService|webLookupService|fotMobProvider|lineupPrefetch|node:(http|https|net|tls|dns|child_process)/, `${rel} importe ${i}`);
    }
    assert.doesNotMatch(fs.readFileSync(fichier, 'utf8'), /\bfetch\s*\(|setInterval\s*\(|setTimeout\s*\(/, `${rel} : un appel réseau ou une minuterie`);
  }
  // Le Repérage ne charge plus que la lecture de la dernière composition (pas la boucle des compositions).
  assert.ok(importsDe(path.join(SRC, 'data', 'screener.js')).includes('./db/derniereComposition.js'));
  assert.ok(!importsDe(path.join(SRC, 'data', 'screener.js')).some((i) => /lineupContext|lineupPrefetch|fotMobProvider/.test(i)));
  // Les routes : GET seulement.
  const routes = fs.readFileSync(path.join(SRC, 'api', 'routes', 'opportunities.routes.js'), 'utf8');
  assert.deepEqual([...routes.matchAll(/router\.(\w+)\('([^']+)'/g)].map((m) => [m[1], m[2]]), [['get', '/'], ['get', '/vertes']]);
  assert.match(fs.readFileSync(path.join(SRC, 'api', 'routes', 'index.js'), 'utf8'), /router\.use\('\/opportunities', opportunitiesRoutes\);/);
  // Une seule décision de pari : findValueBet / findValueBetFraiche ne sont appelés que par verdictPari.js (et fraicheurCotes.js).
  const appelants = fs
    .readdirSync(SRC, { recursive: true })
    .filter((f) => f.endsWith('.js'))
    .filter((f) => /\bfindValueBet(Fraiche)?\s*\(/.test(fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')))
    .map((f) => f.split(path.sep).join('/'))
    .sort();
  assert.deepEqual(appelants, ['core/engine/fraicheurCotes.js', 'core/engine/valueFinder.js', 'core/engine/verdictPari.js']);
  const moteur = fs.readFileSync(path.join(SRC, 'core', 'engine', 'oddsEngine.js'), 'utf8');
  assert.match(moteur, /const staking = stakingDuMatch\(match, decision, config, tiltState\);/);
  assert.match(moteur, /verdicts: verdictsDuMatch\(match, \{ \.\.\.decision, staking \}, config, tiltState\)/);
  // Le résumé donné à l'IA ne prend pas les verdicts (rien ne change pour elle).
  assert.doesNotMatch(fs.readFileSync(path.join(SRC, 'core', 'ai', 'matchAiAnalysisService.js'), 'utf8'), /verdicts|statLines/);
});
