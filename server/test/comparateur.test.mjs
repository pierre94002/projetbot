/**
 * Le COMPARATEUR DE VOS BOOKMAKERS et la COTE MINIMALE À PRENDRE (étape 10 du plan).
 *   node --test test/comparateur.test.mjs        (depuis server/)
 *
 *  1. La cote minimale au seuil EXACT : pour le 1 / N / 2, chaque cote au centième entre la cote minimale
 *     et la cote maximale est une value pour findValueBet (appliqué au seul bookmaker qui la paie), et
 *     aucune autre — sur des milliers de tirages (probabilité, seuils, cote maximale), virgule flottante
 *     comprise ; pour les autres marchés, la même chose avec la règle d'une cote saisie (verdictValue sur
 *     l'avantage arrondi au centième), et la pastille de l'écran (etatValue) dit pareil.
 *  2. Le bug trouvé en route : la pastille d'une cote saisie et le verdict du serveur ne lisaient pas le
 *     même nombre à quelques millièmes du seuil (cote juste 4,49, cote 4,58).
 *  3. Les cases du comparateur, face au moteur, sur 3 000 matchs tirés au sort : vert ⇔ le moteur conseille
 *     cette issue ET ce prix est lui-même une value fraîche chez ce bookmaker ; la case du pari du moteur
 *     est verte et « conseillée » ; juges, lignes incohérentes, cotes de référence jamais vertes ; une case
 *     verte est entre la cote minimale et la cote maximale.
 *  4. La route de l'analyse et celle des saisies, dans une copie isolée (le vrai serveur, aides/
 *     script-page-match.mjs) : le comparateur et les bornes de chaque cote saisie.
 *  5. L'assemblage de l'écran (ui/src/utils/comparateur.js) : les tables, les colonnes, les cases = celles du
 *     serveur, l'heure qui tourne, les cotes de référence à part, un match sans cote.
 *  6. Lecture du code : deux fichiers purs côté écran ; le moteur seul décide.
 * Les valeurs attendues viennent du MOTEUR (findValueBet, fraicheurCote, verdictValue) ou sont écrites à la
 * main, jamais recopiées de la sortie du code testé.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVEUR } from './aides/isolement.mjs';
import * as D from './aides/donneesPageMatch.mjs';
import { findValueBet, estJouable, estAutorise, coteJouable } from '../src/core/engine/valueFinder.js';
import { fraicheurCote } from '../src/core/engine/fraicheurCotes.js';
import { referenceDuMatch, stakingDuMatch, verdictsDuMatch, comparateurDuMatch, ETATS_VERDICT } from '../src/core/engine/verdictPari.js';
import { bornesDuMoteur, bornesDeLaRegle, pourcentDeLaCote, verdictValue, regleEnPourcent, faceAuxBornes } from '../src/core/engine/coteMinimale.js';
import { regleDuMoteur, verdictValue as verdictValueDeLaSaisie, valueDeLaSaisie } from '../src/data/saisiesCotes.js';
import { DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../src/core/engine/engineConfig.js';

const UI_SRC = path.resolve(SERVEUR, '..', 'ui', 'src');
const pret = ['comparateur.js', 'ticket.js', 'langageParis.js', 'verdictParMarche.js'].every((f) => fs.existsSync(path.join(UI_SRC, 'utils', f)));
const options = { skip: pret ? false : 'ui/src/utils (comparateur, ticket, langageParis, verdictParMarche) manque' };
const L = pret ? await import(pathToFileURL(path.join(UI_SRC, 'utils', 'langageParis.js')).href) : {};
const C = pret ? await import(pathToFileURL(path.join(UI_SRC, 'utils', 'comparateur.js')).href) : {};
const K = pret ? await import(pathToFileURL(path.join(UI_SRC, 'utils', 'ticket.js')).href) : {};

const CONFIG = DEFAULT_ENGINE_CONFIG_BY_SPORT.football;
const T0 = D.MAINTENANT;
const { MIN, H } = D;
const ISSUES = ['home', 'draw', 'away'];
const CHAMPS = { home: 'odds1', draw: 'oddsDraw', away: 'odds2' };

function generateur(graine) {
  let s = graine >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const cents = (x) => Math.round(x * 100);

/** Une ligne d'un seul bookmaker dont l'issue `index` paie `cote`, les deux autres complétant une marge de 6 % (ligne saine). */
function ligneAvec(index, cote, fair, key = 'williamhill') {
  const reste = 1.06 - 1 / cote;
  const autres = [0, 1, 2].filter((i) => i !== index);
  const total = autres.reduce((s, i) => s + fair[i], 0);
  const prix = [0, 0, 0];
  prix[index] = cote;
  for (const i of autres) prix[i] = 1 / ((reste * fair[i]) / total);
  return { key, title: key, odds1: prix[0], oddsDraw: prix[1], odds2: prix[2] };
}

// ------------------------------------------------------------- 1. la cote minimale au seuil exact

test('la cote minimale du 1 / N / 2 au seuil EXACT : de la cote minimale à la cote maximale, chaque cote au centième est une value pour findValueBet, et aucune autre — 4 000 tirages, virgule flottante comprise', options, () => {
  const hasard = generateur(20261010);
  const vus = { possibles: 0, auDela: 0, cotesEssayees: 0 };
  for (let n = 0; n < 4000; n++) {
    const p = 0.03 + hasard() * 0.94;
    const config = {
      ...CONFIG,
      edgeThresholdMin: [0, 0.005, 0.01, 0.02, 0.03, 0.05][Math.floor(hasard() * 6)],
      edgeThresholdMax: [0.1, 0.15, 0.25, 0.4][Math.floor(hasard() * 4)],
      maxValueOdds: [2.5, 3, 5, 8][Math.floor(hasard() * 4)]
    };
    const index = Math.floor(hasard() * 3);
    const autres = [hasard() + 0.1, hasard() + 0.1];
    const fair = [0, 0, 0];
    fair[index] = p;
    [0, 1, 2].filter((i) => i !== index).forEach((i, k) => (fair[i] = ((1 - p) * autres[k]) / (autres[0] + autres[1])));
    const b = bornesDuMoteur(p, config);
    const juge = (cote) => {
      const r = findValueBet({ byBookmaker: [ligneAvec(index, cote, fair)], fair, referenceKeys: [], config, tiltState: {}, bankroll: 1000 });
      const c = r.candidates.find((x) => x.outcome === ISSUES[index]);
      assert.ok(c, `tirage ${n} : ${cote} jugée`);
      return c.exclusion === null;
    };
    if (b.code === 'au-dela-cote-max') {
      vus.auDela++;
      // Aucune cote jusqu'à la cote maximale n'est une value (on en essaie quelques-unes, dont la plus haute).
      for (const x of [cents(config.maxValueOdds), cents(config.maxValueOdds) - 1, 101 + Math.floor(hasard() * (cents(config.maxValueOdds) - 101))]) {
        if (x >= 101) assert.equal(juge(x / 100), false, `tirage ${n} : ${x / 100} serait une value`);
      }
      assert.ok(b.minimumTheorique > config.maxValueOdds);
      continue;
    }
    assert.equal(b.code, 'value-possible', `tirage ${n}`);
    vus.possibles++;
    assert.ok(b.coteMinimale <= b.coteMaximale && b.coteMaximale <= config.maxValueOdds);
    // Autour de chaque borne, au centième : value ⇔ dans l'intervalle.
    for (let x = cents(b.coteMinimale) - 4; x <= cents(b.coteMinimale) + 4; x++) {
      if (x < 101) continue;
      vus.cotesEssayees++;
      assert.equal(juge(x / 100), x >= cents(b.coteMinimale) && x <= cents(b.coteMaximale), `tirage ${n} (p ${p}) : ${x / 100}, bornes ${b.coteMinimale}–${b.coteMaximale}`);
    }
    for (let x = cents(b.coteMaximale) - 3; x <= cents(b.coteMaximale) + 3; x++) {
      if (x < 101 || x > cents(config.maxValueOdds) + 3) continue;
      vus.cotesEssayees++;
      assert.equal(juge(x / 100), x >= cents(b.coteMinimale) && x <= cents(b.coteMaximale), `tirage ${n} : ${x / 100}`);
    }
  }
  assert.ok(vus.possibles >= 2500 && vus.auDela >= 100, JSON.stringify(vus));
  // Le seuil exact se juge comme le moteur, en virgule flottante : à 50 %, seuil 2 %, 2,04 donne 0,020000000000000018.
  assert.equal(bornesDuMoteur(0.5, { ...CONFIG, edgeThresholdMin: 0.02 }).coteMinimale, 2.04);
  assert.ok(0.5 * 2.04 - 1 > 0.02);
  // Pile le maximum (25 %, exact en virgule flottante à 50 % et 2,50) : encore une value pour le moteur ; un centime de plus, « trop beau ».
  const pile = { ...CONFIG, edgeThresholdMin: 0.02, edgeThresholdMax: 0.25, maxValueOdds: 5 };
  assert.equal(0.5 * 2.5 - 1, 0.25);
  assert.equal(bornesDuMoteur(0.5, pile).coteMaximale, 2.5);
  const fair = [0.5, 0.3, 0.2];
  const exclusion = (cote) => findValueBet({ byBookmaker: [ligneAvec(0, cote, fair)], fair, referenceKeys: [], config: pile, tiltState: {} }).candidates.find((x) => x.outcome === 'home').exclusion;
  assert.equal(exclusion(2.5), null);
  assert.equal(exclusion(2.51), 'avantage_invraisemblable');
  // Pile la cote maximale (5,00) : encore une value ; 5,01 non (cote trop haute).
  assert.equal(bornesDuMoteur(0.24, pile).coteMaximale, 5);
  assert.equal(findValueBet({ byBookmaker: [ligneAvec(0, 5.01, [0.24, 0.4, 0.36])], fair: [0.24, 0.4, 0.36], referenceKeys: [], config: pile, tiltState: {} }).candidates[0].exclusion, 'cote_trop_haute');
  // Les cas à la main : 48,9 % (Man City de l'essai) → 2,09 ; 14 % → au-delà de la cote maximale ; sans probabilité ni seuils : dit.
  assert.deepEqual(bornesDuMoteur(0.4887, CONFIG), { coteMinimale: 2.09, coteMaximale: 2.55, code: 'value-possible', coteMax: 5 });
  assert.equal(bornesDuMoteur(0.14, CONFIG).code, 'au-dela-cote-max');
  assert.equal(bornesDuMoteur(null, CONFIG).code, 'probabilite-inconnue');
  assert.equal(bornesDuMoteur(0.5, { edgeThresholdMin: 0.02 }).code, 'seuils-inconnus');
  assert.equal(bornesDuMoteur(0.5, { ...CONFIG, edgeThresholdMax: 0.01 }).code, 'seuils-incoherents');
});

test('la cote minimale d’un autre marché (cote saisie, pronostic du moteur) : verdictValue sur l’avantage arrondi au centième — et la pastille de l’écran dit pareil, au centième près de chaque borne', options, () => {
  const regle = regleEnPourcent(CONFIG);
  assert.deepEqual(regle, regleDuMoteur(CONFIG), 'la même règle que la saisie');
  assert.equal(verdictValueDeLaSaisie, verdictValue, 'la saisie réexporte LA règle (un seul endroit)');
  const hasard = generateur(4242);
  let essais = 0;
  for (let n = 0; n < 3000; n++) {
    const coteJuste = (120 + Math.floor(hasard() * 480)) / 100;
    const p = 1 / coteJuste;
    const b = bornesDeLaRegle(p, regle);
    const estValue = (x) => verdictValue({ pourcent: pourcentDeLaCote(p, x), cote: x, regle, jouable: true }) === 'value';
    const ecran = (x) => L.etatValue({ pourcent: pourcentDeLaCote(p, x), jouable: true, cote: x, regle }).vert;
    if (b.code !== 'value-possible') {
      assert.equal(b.code, 'au-dela-cote-max', `cote juste ${coteJuste}`);
      assert.equal(estValue(regle.coteMax), false);
      continue;
    }
    for (const borne of [b.coteMinimale, b.coteMaximale]) {
      for (let x = cents(borne) - 3; x <= cents(borne) + 3; x++) {
        if (x < 101) continue;
        essais++;
        const attendu = x >= cents(b.coteMinimale) && x <= cents(b.coteMaximale);
        assert.equal(estValue(x / 100), attendu, `cote juste ${coteJuste} : ${x / 100}`);
        assert.equal(ecran(x / 100), attendu, `cote juste ${coteJuste} : l'écran à ${x / 100}`);
        assert.equal(faceAuxBornes(x / 100, b), attendu ? 'value' : x < cents(b.coteMinimale) ? 'sous-minimum' : 'au-dessus');
        assert.equal(K.faceAuxBornes(x / 100, b), faceAuxBornes(x / 100, b), 'la phrase de l’écran = le serveur');
      }
    }
  }
  assert.ok(essais > 20000, `${essais} cotes essayées`);
  // Pile le seuil, ici, n'est PAS une value : l'avantage arrondi vaut 2,00 (cote juste 2,00, cote 2,04).
  assert.equal(bornesDeLaRegle(0.5, regle).coteMinimale, 2.05);
});

test('bug corrigé (étape 7) : la pastille d’une cote saisie et le verdict du serveur lisent le même avantage — à 4,58 pour une cote juste de 4,49, le serveur disait « value » (2,0045 %) et la pastille « sous le seuil » (2,00 %)', options, () => {
  const regle = regleEnPourcent(CONFIG);
  const p = 1 / 4.49;
  const exact = (p * 4.58 - 1) * 100;
  assert.ok(exact > 2 && exact < 2.005, `avantage exact ${exact}`);
  // Avant : le serveur jugeait le nombre exact, l'écran relisait le nombre arrondi qu'il recevait.
  assert.equal(verdictValue({ pourcent: exact, cote: 4.58, regle, jouable: true }), 'value');
  assert.equal(L.etatValue({ pourcent: Math.round(exact * 100) / 100, jouable: true, cote: 4.58, regle }).etat, 'sous-seuil');
  // Maintenant : un seul nombre, arrondi au centième, envoyé ET jugé.
  const envoye = pourcentDeLaCote(p, 4.58);
  assert.equal(envoye, 2);
  assert.equal(verdictValue({ pourcent: envoye, cote: 4.58, regle, jouable: true }), 'sous-seuil');
  assert.equal(L.etatValue({ pourcent: envoye, jouable: true, cote: 4.58, regle }).etat, 'sous-seuil');
  // Et la cote minimale à prendre le dit : 4,59.
  assert.equal(bornesDeLaRegle(p, regle).coteMinimale, 4.59);
  // Par la vraie fonction de la saisie (data/saisiesCotes.js) : « plus de 2,5 buts » à 4,58 chez William Hill, le moteur à 4,49.
  const resultat = { trueOdds: { over25: 4.49 } };
  const commun = { saisie: { bookmaker: 'williamhill', marketId: 'totalGoals', sens: 'over', ligne: 2.5 }, releveAt: new Date(T0).toISOString(), resultat, config: CONFIG, reglage: null, maintenant: T0, coupDEnvoi: '2026-10-05T18:30:00Z', heureSure: true };
  const v = valueDeLaSaisie({ ...commun, cote: 4.58 });
  assert.deepEqual([v.pourcent, v.verdict], [2, 'sous-seuil']);
  assert.equal(L.etatValue({ pourcent: v.pourcent, jouable: v.jouable, cote: 4.58, regle: v.regle, fraicheur: L.fraicheurVivante(v.fraicheur, T0) }).etat, v.verdict, 'la pastille dit le verdict du serveur');
  assert.deepEqual([v.bornes.coteMinimale, valueDeLaSaisie({ ...commun, cote: 4.59 }).verdict], [4.59, 'value']);
});

// ------------------------------------------------------- 3. les cases face au moteur, 3 000 matchs

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

test('les cases du comparateur face au moteur, 3 000 matchs tirés au sort : vert ⇔ le moteur conseille l’issue ET ce prix est une value fraîche chez ce bookmaker ; le pari du moteur est vert et « conseillé » ; jamais de vert chez un juge, sur une ligne incohérente ou une cote de référence', options, () => {
  const hasard = generateur(20261006);
  const vus = { verts: 0, conseillees: 0, autresVertes: 0, parEtat: {}, matchsConseilles: 0 };
  for (let n = 0; n < 3000; n++) {
    const brut = [0.2 + hasard() * 0.5, 0.15 + hasard() * 0.2, 0.1 + hasard() * 0.45];
    const somme = brut[0] + brut[1] + brut[2];
    const vrai = brut.map((p) => p / somme);
    const presents = LIVRES.filter(() => hasard() < 0.5);
    const byBookmaker = presents.map(([key, title]) => {
      const marge = 1.02 + hasard() * 0.08;
      const implicites = vrai.map((p) => p * marge * (0.95 + hasard() * 0.1));
      if (hasard() < 0.4) implicites[Math.floor(hasard() * 3)] *= 0.84 + hasard() * 0.12; // une offre généreuse
      else if (hasard() < 0.1) {
        // Une cote périmée, trop belle pour être vraie, sur une ligne qui reste cohérente (les deux autres issues paient moins).
        const i = Math.floor(hasard() * 3);
        for (let j = 0; j < 3; j++) implicites[j] *= j === i ? 0.66 + hasard() * 0.08 : 1.16;
      }
      const ligne = { key, title, odds1: Number((1 / implicites[0]).toFixed(2)), oddsDraw: Number((1 / implicites[1]).toFixed(2)), odds2: Number((1 / implicites[2]).toFixed(2)) };
      if (hasard() < 0.03) ligne.odds2 = 1.05; // une ligne incohérente
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
    const ref = referenceDuMatch(match, CONFIG);
    const staking = stakingDuMatch(match, ref, CONFIG, {});
    const verdicts = verdictsDuMatch(match, { ...ref, staking }, CONFIG, {});
    const c = comparateurDuMatch(match, { ...ref, staking }, CONFIG, {}, {});
    const reference = ref.reference;
    // Les colonnes : vos bookmakers (cochés dans Réglages, jamais une cote de référence), et seulement eux ; les autres à part.
    // L'oracle est écrit ici, sans la fonction testée (estAutorise) : cochés et pas `referenceOnly`.
    const vos = (b) => !b.referenceOnly && CONFIG.valueBookmakers.includes(b.key);
    assert.deepEqual(c.livres.map((l) => l.cle), byBookmaker.filter(vos).map((b) => b.key), `match ${n} : colonnes`);
    assert.deepEqual(c.references.map((r) => r.cle), byBookmaker.filter((b) => !vos(b)).map((b) => b.key), `match ${n} : références`);
    assert.deepEqual(byBookmaker.map((b) => estAutorise(b, CONFIG)), byBookmaker.map(vos), `match ${n} : estAutorise`);
    for (const b of byBookmaker.filter((x) => x.referenceOnly)) assert.ok(!c.livres.some((l) => l.cle === b.key), `match ${n} : une cote de référence en colonne`);
    const conseil = staking.action === 'RECOMMENDED' ? staking : null;
    if (conseil) vus.matchsConseilles++;
    let conseillees = 0;
    for (const l of c.livres) {
      const b = byBookmaker.find((x) => x.key === l.cle);
      const fraiche = fraicheurCote({ releveAt: parBookmaker[b.key].releveAt, maintenant: T0, coupDEnvoi, heureSure: true }).etat === 'fraiche';
      const juge = Boolean(reference?.keys.includes(b.key));
      const sain = estJouable(b, CONFIG);
      const seul = reference && sain && !juge ? findValueBet({ byBookmaker: [b], fair: reference.probabilities, referenceKeys: reference.keys, config: CONFIG, tiltState: {} }) : null;
      for (const issue of ISSUES) {
        const k = l.cellules[issue];
        assert.ok(ETATS_VERDICT.includes(k.etat), `match ${n} ${b.key} ${issue} : état ${k.etat}`);
        assert.ok(k.raison && k.raison.length > 20, `match ${n} ${b.key} ${issue} : une raison`);
        vus.parEtat[k.etat] = (vus.parEtat[k.etat] ?? 0) + 1;
        const cand = seul?.candidates.find((x) => x.outcome === issue) ?? null;
        const vertAttendu = Boolean(conseil && conseil.outcome === issue && cand && cand.exclusion === null && (fraiche || conseil.bookmaker === b.key));
        assert.equal(k.vert, vertAttendu, `match ${n} ${b.key} ${issue} : vert (${k.etat}, ${staking.action}/${staking.reason}, exclusion ${cand?.exclusion}, fraîche ${fraiche})`);
        assert.equal(k.conseillee, Boolean(vertAttendu && conseil.bookmaker === b.key), `match ${n} ${b.key} ${issue} : conseillée`);
        // L'écran : la même pastille, au même instant (etatVerdict ne refait rien).
        assert.equal(L.etatVerdict(k, T0).vert, k.vert, `match ${n} ${b.key} ${issue} : l'écran`);
        if (juge) assert.equal(k.etat, 'juge', `match ${n} ${b.key} : un juge`);
        if (reference && !sain && !juge) assert.equal(k.etat, 'incoherente', `match ${n} ${b.key} : ligne incohérente`);
        if (!reference) assert.equal(k.etat, 'pas-de-reference');
        if (k.vert) {
          vus.verts++;
          if (k.conseillee) conseillees++;
          else vus.autresVertes++;
          // Un vert est un prix entre la cote minimale et la cote maximale de son issue.
          const bornes = c.issues.find((i) => i.issue === issue).bornes;
          const nette = coteJouable(b, CHAMPS[issue]);
          assert.ok(nette >= bornes.coteMinimale && nette <= bornes.coteMaximale, `match ${n} ${b.key} ${issue} : ${nette} hors de ${bornes.coteMinimale}–${bornes.coteMaximale}`);
          assert.equal(fraiche || k.conseillee, true);
        }
        // Une value fraîche sur une issue que le moteur ne retient pas : « pas retenue », jamais verte.
        if (cand && cand.exclusion === null && fraiche && !(conseil && conseil.outcome === issue)) assert.equal(k.etat, 'value-secondaire', `match ${n} ${b.key} ${issue}`);
      }
    }
    if (conseil) {
      vus.conseillees += conseillees;
      // La case du pari du moteur existe quand le moteur conseille chez un de vos bookmakers.
      assert.equal(conseillees, 1, `match ${n} : la case du pari du moteur`);
      assert.equal(verdicts[conseil.outcome].vert, true);
    } else {
      assert.equal(conseillees, 0);
      for (const l of c.livres) for (const issue of ISSUES) assert.equal(l.cellules[issue].vert, false, `match ${n} : vert sans conseil du moteur`);
    }
    // Le vert d'une issue au verdict par marché ⇔ au moins une case verte dans cette issue.
    for (const issue of ISSUES) assert.equal(verdicts[issue].vert, c.livres.some((l) => l.cellules[issue].vert), `match ${n} ${issue} : verdict et comparateur`);
  }
  assert.ok(vus.verts >= 300 && vus.autresVertes >= 30 && vus.conseillees >= 200, JSON.stringify(vus));
  for (const etat of ['value', 'value-secondaire', 'a-rafraichir', 'sous-seuil', 'sans-value', 'trop-beau', 'juge', 'incoherente', 'pas-de-reference']) {
    assert.ok((vus.parEtat[etat] ?? 0) >= 10, `état ${etat} vu ${vus.parEtat[etat] ?? 0} fois`);
  }
});

test('coupe-circuit et match sans cote : aucune case verte, la raison dite ; la cote minimale reste calculée tant que la cote juste existe', options, () => {
  const byBookmaker = [
    { key: 'pinnacle', title: 'Pinnacle', odds1: 2.0, oddsDraw: 3.6, odds2: 3.9 },
    { key: 'williamhill', title: 'William Hill', odds1: 2.3, oddsDraw: 3.4, odds2: 3.3 }
  ];
  const match = { home: 'A', away: 'B', bankroll: 10000, marketOdds: { odds1: 2, oddsDraw: 3.6, odds2: 3.9, byBookmaker } };
  const ref = referenceDuMatch(match, CONFIG);
  const staking = stakingDuMatch(match, ref, CONFIG, { circuitBreakerActive: true });
  const c = comparateurDuMatch(match, { ...ref, staking }, CONFIG, { circuitBreakerActive: true }, {});
  assert.deepEqual(ISSUES.map((i) => c.livres[0].cellules[i].etat), ['coupe-circuit', 'coupe-circuit', 'coupe-circuit']);
  assert.ok(ISSUES.every((i) => !c.livres[0].cellules[i].vert));
  assert.equal(c.issues[0].bornes.code, 'value-possible');
  // Sans aucune cote de marché : pas de colonne, pas de cote minimale, dit.
  const sans = { home: 'A', away: 'B', bankroll: 10000, marketOdds: null };
  const r2 = referenceDuMatch(sans, CONFIG);
  const c2 = comparateurDuMatch(sans, { ...r2, staking: stakingDuMatch(sans, r2, CONFIG, {}) }, CONFIG, {}, {});
  assert.deepEqual([c2.disponible, c2.livres.length, c2.issues[0].bornes.code], [false, 0, 'pas-de-cote']);
  // Les autres marchés gardent leur cote minimale (pronostics du moteur).
  const c3 = comparateurDuMatch(sans, { ...r2, staking: null }, CONFIG, {}, { marketPredictions: [{ marketId: 'totalGoals', params: { line: 2.5, side: 'over' }, market: 'Total buts', predictedLabel: 'Plus de 2.5 buts', predictedOdds: 1.85 }] });
  assert.deepEqual(c3.marches.map((m) => [m.libelle, m.bornes.coteMinimale, m.origine]), [['Plus de 2.5 buts', 1.89, 'modèle de buts du moteur']]);
});

// ------------------------------------------------------------- 4. les routes, dans une copie isolée

let P;
before(() => {
  if (pret) P = D.payloadsDuServeur();
});

test('la route de l’analyse rend le comparateur (vrai serveur, copie isolée) : vos bookmakers côte à côte, l’heure du relevé, le verdict de chacun, la cote minimale de chaque issue', options, () => {
  const a = P.analyses['essai-a'].corps;
  const c = a.comparateur;
  assert.ok(c, 'le comparateur est dans l’analyse');
  assert.equal(c.calculeLe, '2026-10-05T12:00:00.000Z');
  assert.equal(c.source, 'The Odds API (relevé manuel)');
  // Man City – Liverpool : William Hill seul de vos bookmakers ; Pinnacle (juge) et Betclic à part.
  assert.deepEqual(c.livres.map((l) => [l.cle, l.titre, l.releveAt, l.juge]), [['williamhill', 'William Hill', '2026-10-05T11:50:00.000Z', false]]);
  assert.deepEqual(c.references.map((r) => [r.cle, r.juge]), [['pinnacle', true], ['betclic_fr', false]]);
  const wh = c.livres[0].cellules;
  // Les probabilités et cotes justes : celles du verdict (la même source), les bornes : la règle de findValueBet.
  for (const [k, i] of ISSUES.entries()) {
    const issue = c.issues[k];
    assert.equal(issue.probabilite, a.verdicts[i].probabilite);
    assert.deepEqual(issue.bornes, bornesDuMoteur(a.verdicts[i].probabilite, CONFIG));
  }
  assert.deepEqual(c.issues.map((i) => [i.issue, i.bornes.coteMinimale, i.bornes.coteMaximale]), [['home', 2.09, 2.55], ['draw', 3.84, 4.69], ['away', 4.17, 5]]);
  // La case du pari du moteur : verte, conseillée, la mise de Kelly ; les deux autres : sans value.
  assert.deepEqual([wh.home.etat, wh.home.conseillee, wh.home.cote, wh.home.mise], ['value', true, 2.3, a.staking.stake]);
  assert.deepEqual([wh.draw.etat, wh.away.etat], ['sans-value', 'sans-value']);
  assert.equal(wh.home.pourcent, a.verdicts.home.pourcent, 'le même avantage que le verdict');
  assert.equal(c.issues[0].retenue, true);
  assert.deepEqual(c.issues[0].conseil, { bookmaker: 'williamhill', bookmakerTitle: 'William Hill', cote: 2.3, mise: a.staking.stake });
  // Les autres pronostics du moteur : leur cote minimale (règle d'une cote saisie).
  const pronostics = a.marketPredictions.filter((p) => p.marketId !== 'result');
  assert.equal(c.marches.length, pronostics.length);
  for (const m of c.marches) assert.deepEqual(m.bornes, bornesDeLaRegle(1 / m.coteJuste, regleEnPourcent(CONFIG)), m.libelle);
  // Vos bookmakers (Réglages), pour le ticket.
  assert.deepEqual(c.vosBookmakers.map((b) => b.cle), CONFIG.valueBookmakers);
  // Arsenal – Chelsea : tous juges ; Fulham – Brentford : cote trop haute, et Brentford sans value possible sous la cote maximale.
  const b = P.analyses['essai-b'].corps.comparateur;
  assert.ok(b.livres.length === 3 && b.livres.every((l) => ISSUES.every((i) => l.cellules[i].etat === 'juge')));
  const e = P.analyses['essai-e'].corps.comparateur;
  assert.deepEqual([e.livres[0].cellules.away.etat, e.issues[2].bornes.code], ['cote-haute', 'au-dela-cote-max']);
  // Le résumé donné à l'IA ne change pas : il ne lit que ses champs.
  for (const corps of Object.values(P.analyses).map((x) => x.corps)) assert.ok(corps.verdicts && corps.staking);
});

test('la route des saisies : chaque cote saisie porte sa cote minimale (la même règle) et ce que « J’ai parié » enregistrerait (marché et issue écrits comme le moteur)', options, () => {
  const regle = regleEnPourcent(CONFIG);
  const parCle = Object.fromEntries(P.saisiesA.saisies.map((s) => [s.cle, s]));
  const corners = parCle['williamhill|corners|over|9.5'];
  assert.deepEqual(corners.bornes, bornesDeLaRegle(corners.moteur.probabilite, regle));
  assert.deepEqual([corners.bornes.coteMinimale, corners.bornes.coteMaximale], [1.89, 2.31]);
  assert.deepEqual(corners.pari, { market: 'Total corners', pick: 'Plus de 9.5 corners', marketId: 'totalCorners', params: { line: 9.5, side: 'over' } });
  assert.equal(corners.verdict, 'value');
  assert.equal(corners.pourcent, pourcentDeLaCote(corners.moteur.probabilite, 2.25));
  assert.deepEqual(parCle['betsson|btts|yes|0'].pari, { market: 'Les 2 équipes marquent', pick: 'Oui', marketId: 'bothTeamsScore', params: { outcome: 'yes' } });
  assert.deepEqual(parCle['unibet_nl|ou|over|2.5'].pari, { market: 'Total buts', pick: 'Plus de 2.5 buts', marketId: 'totalGoals', params: { line: 2.5, side: 'over' } });
  // Les cartons : pas de probabilité du moteur, donc pas de cote minimale ; le pari se règle à la main.
  const cartons = parCle['tipico_de|cards|over|4.5'];
  assert.equal(cartons.bornes, null);
  assert.deepEqual(cartons.pari, { market: 'Total cartons', pick: 'Plus de 4.5 cartons', marketId: 'totalCards', params: { line: 4.5, side: 'over' } });
});

// ------------------------------------------------------------- 5. l'assemblage de l'écran

const matchA = { matchId: 'essai-a', home: 'Man City', away: 'Liverpool', league: 'EPL', commenceTime: '2026-10-05T18:30:00Z' };
const lire = (extra = {}) => C.lireLeComparateur({ result: P.analyses['essai-a'].corps, saisies: P.saisiesA, cotes: P.fixtureA, match: matchA, maintenant: T0, ...extra });

test('l’écran assemble sans rien calculer : le 1 / N / 2 d’abord (une colonne par bookmaker), puis chaque famille de marchés, chaque case = celle du serveur', options, () => {
  const lu = lire();
  assert.equal(lu.present, true);
  assert.deepEqual(lu.tables.map((t) => t.cle), ['resultat', 'match', 'buts', 'corners', 'tirs', 'cadres', 'autres']);
  const r = lu.tables[0];
  assert.deepEqual(r.colonnes.map((c) => [c.cle, c.titre, c.releve]), [['williamhill', 'William Hill', 'relevée il y a 10 min']]);
  assert.deepEqual(r.lignes.map((l) => l.libelle), ['Man City gagne', 'Match nul', 'Liverpool gagne']);
  const c = P.analyses['essai-a'].corps.comparateur;
  for (const l of r.lignes) {
    // La case EST la cellule du serveur (même objet de verdict), jamais refaite.
    assert.deepEqual(l.cases.williamhill.verdict, c.livres[0].cellules[l.issue]);
    assert.deepEqual(l.bornes, c.issues.find((i) => i.issue === l.issue).bornes);
    assert.deepEqual(l.pari, { market: 'Résultat', pick: l.libelle, marketId: 'result', params: { outcome: l.issue } });
  }
  assert.deepEqual(r.lignes.map((l) => l.bornesTexte.court), ['à prendre à 2,09 minimum', 'à prendre à 3,84 minimum', 'à prendre à 4,17 minimum']);
  assert.equal(r.lignes[0].cases.williamhill.vert, true);
  // Un bookmaker seul n'est pas « la meilleure cote » : rien à comparer.
  assert.equal(r.lignes[0].meilleure, null);
  // Deux bookmakers (Unibet ajouté à 2,25, William Hill à 2,30) : la meilleure est William Hill ; un juge n'est jamais « la meilleure ».
  const avecUnibet = structuredClone(P.analyses['essai-a'].corps);
  const wh = avecUnibet.comparateur.livres[0];
  avecUnibet.comparateur.livres.push({ ...wh, cle: 'unibet_nl', titre: 'Unibet (NL)', cellules: Object.fromEntries(Object.entries(wh.cellules).map(([i, k]) => [i, { ...k, bookmaker: 'unibet_nl', bookmakerTitle: 'Unibet (NL)', cote: Math.round((k.cote - 0.05) * 100) / 100 }])) });
  const deux = C.lireLeComparateur({ result: avecUnibet, saisies: P.saisiesA, cotes: P.fixtureA, match: matchA, maintenant: T0 });
  assert.deepEqual(deux.tables[0].lignes.map((l) => l.meilleure), ['williamhill', 'williamhill', 'williamhill']);
  avecUnibet.comparateur.livres[0] = { ...wh, juge: true, cellules: Object.fromEntries(Object.entries(wh.cellules).map(([i, k]) => [i, { ...k, etat: 'juge', vert: false }])) };
  avecUnibet.comparateur.livres.push({ ...avecUnibet.comparateur.livres[1], cle: 'betsson', titre: 'Betsson', cellules: Object.fromEntries(Object.entries(avecUnibet.comparateur.livres[1].cellules).map(([i, k]) => [i, { ...k, bookmaker: 'betsson', cote: Math.round((k.cote - 0.1) * 100) / 100 }])) });
  const juge = C.lireLeComparateur({ result: avecUnibet, saisies: P.saisiesA, cotes: P.fixtureA, match: matchA, maintenant: T0 });
  assert.deepEqual(juge.tables[0].lignes.map((l) => l.meilleure), ['unibet_nl', 'unibet_nl', 'unibet_nl'], 'William Hill, juge, n’est pas la meilleure cote');
  // Les autres familles : le pronostic du moteur, puis les cotes saisies sur une autre ligne.
  const corners = lu.tables.find((t) => t.cle === 'corners');
  assert.deepEqual(corners.colonnes.map((c) => c.cle), ['williamhill']);
  const neuf = corners.lignes.find((l) => l.libelle === 'Plus de 9,5 corners');
  assert.equal(neuf.cases.williamhill.cote, 2.25);
  assert.equal(neuf.cases.williamhill.vert, true);
  assert.deepEqual([neuf.bornes.coteMinimale, neuf.bornesTexte.court], [1.89, 'à prendre à 1,89 minimum']);
  const sept = corners.lignes.find((l) => l.libelle === 'Plus de 7.5 corners');
  assert.equal(sept.cases.williamhill, null, 'aucune cote saisie sur ce pronostic : la case est vide, et le dit');
  assert.equal(sept.pronostic, true);
  // « Les 2 équipes marquent : Oui » (Betsson 1,80) rejoint le pronostic « Oui ».
  const oui = lu.tables.find((t) => t.cle === 'match').lignes.find((l) => l.libelle === 'Oui');
  assert.equal(oui.cases.betsson.cote, 1.8);
  // Les cartons : à part, sans probabilité ni cote minimale, la raison dite.
  const cartons = lu.tables.find((t) => t.cle === 'autres').lignes[0];
  assert.deepEqual([cartons.libelle, cartons.probabilite, cartons.bornesTexte.court], ['Plus de 4,5 cartons', null, 'pas de cote minimale']);
  assert.match(cartons.raisonSansProbabilite, /cartons \(étape 33 du plan\)/);
  assert.equal(lu.resume.vertes, 2, 'deux cases vertes : William Hill sur Man City, les corners saisis');
});

test('l’heure qui tourne : quatre heures plus tard, plus aucune case verte (« à rafraîchir »), les cotes minimales restent', options, () => {
  const lu = lire({ maintenant: T0 + 4 * H });
  assert.equal(lu.resume.vertes, 0);
  const r = lu.tables[0];
  assert.equal(r.lignes[0].cases.williamhill.etat, 'a-rafraichir');
  assert.equal(r.colonnes[0].releve, 'relevée il y a 4 h');
  assert.equal(r.colonnes[0].fraicheur.etat, 'a-rafraichir');
  assert.equal(lu.tables.find((t) => t.cle === 'corners').lignes.find((l) => l.libelle === 'Plus de 9,5 corners').cases.williamhill.etat, 'a-rafraichir');
  assert.equal(r.lignes[0].bornesTexte.court, 'à prendre à 2,09 minimum');
});

test('les cotes de référence, à part : Pinnacle (qui fixe la cote juste) et Betclic du relevé, DraftKings et Bet365 gratuits — leur cote et son heure, jamais de value', options, () => {
  const refs = lire().references;
  const resultat = refs.find((t) => t.cle === 'ref:1x2');
  // Le relevé payant d'abord (les bookmakers qui ne sont pas à vous), puis les sources gratuites, dans l'ordre où le serveur les rend.
  assert.deepEqual(resultat.colonnes.slice(0, 2).map((c) => [c.titre, c.source, c.juge]), [
    ['Pinnacle', 'The Odds API, pas un de vos bookmakers', true],
    ['Betclic (FR)', 'The Odds API, pas un de vos bookmakers', false]
  ]);
  assert.deepEqual(resultat.colonnes.slice(2).map((c) => `${c.titre} · ${c.source}`).sort(), ['Bet365 · 365Scores', 'DraftKings · ESPN']);
  // La dernière cote d'avant-match de chaque source (11 h pour les gratuites) : Pinnacle 2,00, Betclic 1,90, DraftKings 2,00, Bet365 2,02 sur Man City.
  const home = resultat.lignes.find((l) => l.cle === 'home');
  assert.deepEqual([home.valeurs['payant|pinnacle'].cote, home.valeurs['payant|betclic_fr'].cote, home.valeurs['espn|DraftKings'].cote, home.valeurs['365scores|Bet365'].cote], [2.0, 1.9, 2.0, 2.02]);
  assert.equal(home.valeurs['espn|DraftKings'].releve, 'relevée il y a 1 h');
  assert.ok(refs.some((t) => t.cle === 'ref:ou:2.5'));
  // Rien de vert, rien de « value » dans une référence : aucune case n'a de verdict.
  for (const t of refs) for (const l of t.lignes) for (const v of Object.values(l.valeurs)) assert.deepEqual(Object.keys(v).sort(), ['cote', 'releve', 'releveAt']);
});

test('un match sans cote : pas de table du 1 / N / 2, les autres marchés gardent leur cote minimale ; un serveur d’avant l’étape 10 : dit', options, () => {
  const lu = C.lireLeComparateur({ result: P.sansCotes.analyse, saisies: null, cotes: P.fixtureSansCotes, match: P.sansCotes.match, maintenant: T0 });
  assert.equal(lu.sansCoteDeMarche, true);
  assert.ok(!lu.tables.some((t) => t.cle === 'resultat'));
  assert.ok(lu.tables.length >= 3);
  for (const t of lu.tables) {
    assert.deepEqual(t.colonnes, []);
    for (const l of t.lignes) assert.match(l.bornesTexte.court, /à prendre à \d,\d\d minimum|aucune value possible/);
  }
  assert.equal(lu.resume.vertes, 0);
  const vieux = C.lireLeComparateur({ result: { ...P.analyses['essai-a'].corps, comparateur: undefined }, match: matchA, maintenant: T0 });
  assert.equal(vieux.present, false);
  assert.match(vieux.raison, /relancez demarrer-cotemaster\.bat/);
});

test('« Prendre » une case : la sélection du ticket porte le bookmaker, la cote, l’heure du relevé, la probabilité du moteur et quand il l’a calculée ; « Autre cote » : rien de tout cela, à taper', options, () => {
  const lu = lire();
  const ligne = lu.tables[0].lignes[0];
  const s = K.selectionDeLaLigne({ match: matchA, ligne, case: ligne.cases.williamhill, calculeLe: lu.calculeLe });
  assert.deepEqual(
    [s.market, s.pick, s.cote, s.bookmaker, s.bookmakerTitle, s.coteReleveeA, s.coteSource, s.probabiliteLueA],
    ['Résultat', 'Man City gagne', 2.3, 'williamhill', 'William Hill', '2026-10-05T11:50:00.000Z', 'the-odds-api', '2026-10-05T12:00:00.000Z']
  );
  assert.equal(s.probabiliteMoteur, P.analyses['essai-a'].corps.verdicts.home.probabilite);
  assert.equal(K.cleDeSelection(s), 'essai-a|Résultat|Man City gagne', 'la clé des paris de Mes paris');
  const autre = K.selectionDeLaLigne({ match: matchA, ligne, case: null, calculeLe: lu.calculeLe });
  assert.deepEqual([autre.cote, autre.bookmaker, autre.coteReleveeA, autre.coteSource], [null, null, null, null]);
  assert.equal(autre.probabiliteMoteur, s.probabiliteMoteur);
});

// ------------------------------------------------------------------ 6. lecture du code

test('lecture du code : comparateur.js et ticket.js sont purs (ni réseau, ni service de l’appli, ni Vue, ni horloge cachée) ; le serveur seul décide d’une value', options, () => {
  for (const f of ['comparateur.js', 'ticket.js']) {
    // L'heure ne s'y lit que si l'appelant ne la donne pas (`maintenant = Date.now()`, comme langageParis.js) : jamais cachée.
    const source = fs.readFileSync(path.join(UI_SRC, 'utils', f), 'utf8').replace(/maintenant = Date\.now\(\)/g, '');
    assert.doesNotMatch(source, /@\/services\/|fetch\(|httpClient|from 'vue'|Date\.now\(|new Date\(\)/, `${f} : pur`);
    assert.doesNotMatch(source, /findValueBet|edgeThreshold|\* cote - 1\) \* 100 >/, `${f} : aucune règle de value refaite`);
  }
  const moteur = fs.readFileSync(path.join(SERVEUR, 'src', 'core', 'engine', 'coteMinimale.js'), 'utf8');
  assert.doesNotMatch(moteur, /from '\.\.\/\.\.\/data|openDb|fetch\(|Date\.now/);
});
