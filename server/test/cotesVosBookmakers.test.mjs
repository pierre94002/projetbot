/**
 * Les cotes de VOS bookmakers : fraîches, archivées, saisies (étape 7 du plan).
 *   node --test test/cotesVosBookmakers.test.mjs        (depuis server/)
 *
 * Les règles (fonctions pures, sans base ni réseau) puis le serveur dans des
 * copies ISOLÉES (cf. test/aides/isolement.mjs) : base d'essai, data/runtime à
 * part, réseau coupé, heure figée au 05/10/2026 12 h UTC, un faux relevé The
 * Odds API dans la copie (test/aides/script-cotes-vos-bookmakers.mjs). Le client
 * payant est REMPLACÉ par un espion dans les phases qui touchent au relevé :
 * rien ne peut sortir.
 *
 *  1. La règle de fraîcheur : heure inconnue, délai (3 h pile : encore fraîche),
 *     annonce des compositions, match commencé, jour seul, réglage.
 *  2. La value avec la fraîcheur (findValueBetFraiche) : jamais recommandée sur
 *     une cote à rafraîchir, sinon la même que findValueBet.
 *  3. L'écran juge comme le serveur (langageParis.js contre fraicheurCotes.js et
 *     saisiesCotes.js), et la pastille n'est jamais verte « à rafraîchir ».
 *  4. La saisie express : contrôles, rangement dans l'archive, probabilité du
 *     moteur pour chaque marché (ou la raison de son absence), value.
 *  5. Dans une copie : saisir, rejouer (idempotent), corriger, retirer ;
 *     l'archive avec l'heure ; les cotes gratuites inchangées ; rien d'écrit
 *     pendant un import ; l'heure des cotes payantes lue dans l'archive ; la
 *     route du match.
 *  6. AUCUNE route n'appelle The Odds API, sauf le bouton de Réglages ; son
 *     bilan (crédits) est gardé ; le conseil de relevé sur des cas fabriqués.
 * Les valeurs attendues sont écrites à la main, jamais recopiées de la sortie du code testé.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { fraicheurCote, findValueBetFraiche, REGLAGE_FRAICHEUR_DEFAUT, COMPOS_ANNONCEES_MINUTES, reglageFraicheur } from '../src/core/engine/fraicheurCotes.js';
import { findValueBet } from '../src/core/engine/valueFinder.js';
import { DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../src/core/engine/engineConfig.js';
import { lineCandidates, coteJusteLigne, STAT_KINDS } from '../src/sports/football/statMarkets.js';
import * as S from '../src/data/saisiesCotes.js';
import { conseilDeReleve } from '../src/data/conseilReleve.js';
import { TRACKED_SPORT_KEYS, NOMS_DES_CLES } from '../src/data/providers/oddsApiCompetitions.js';
import { bilanDuReleve } from '../src/data/repositories/relevePayantRepository.js';
import { FOTMOB_LEAGUES } from '../src/data/providers/fotMobProvider.js';

const UI_SRC = path.resolve(SERVEUR, '..', 'ui', 'src');
const fichierRegles = path.join(UI_SRC, 'utils', 'langageParis.js');
const L = fs.existsSync(fichierRegles) ? await import(pathToFileURL(fichierRegles).href) : null;
const avecEcran = { skip: L ? false : 'ui/src/utils/langageParis.js manque' };

const MIN = 60_000;
const H = 3_600_000;
const t = (iso) => Date.parse(iso);
const CONFIG = DEFAULT_ENGINE_CONFIG_BY_SPORT.football;
const R = REGLAGE_FRAICHEUR_DEFAUT;

// Un tirage reproductible : mêmes cas à chaque passage.
function generateur(graine) {
  let s = graine >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// ------------------------------------------------- 1. la règle de fraîcheur

test('fraîcheur : 3 heures par défaut — 3 h pile est encore fraîche, une seconde de plus non ; heure inconnue : à rafraîchir', () => {
  assert.deepEqual(R, { maxAgeMinutes: 180, avantCompos: true });
  assert.equal(COMPOS_ANNONCEES_MINUTES, 60);
  const coup = '2026-10-07T19:00:00.000Z'; // le lendemain : l'annonce des compositions ne joue pas
  const f = (releve, maintenant) => fraicheurCote({ releveAt: releve, maintenant: t(maintenant), coupDEnvoi: coup, heureSure: true, reglage: R });
  const fraiche = f('2026-10-06T09:00:00Z', '2026-10-06T11:59:00Z');
  assert.deepEqual([fraiche.etat, fraiche.code, fraiche.ageMinutes], ['fraiche', 'fraiche', 179]);
  assert.match(fraiche.raison, /^Relevée il y a 2 h 59 \(délai : 3 h\)\.$/);
  assert.equal(f('2026-10-06T09:00:00Z', '2026-10-06T12:00:00Z').etat, 'fraiche', '3 h pile : pas « plus vieille que 3 h »');
  const vieille = f('2026-10-06T09:00:00Z', '2026-10-06T12:00:01Z');
  assert.deepEqual([vieille.etat, vieille.code], ['a-rafraichir', 'trop-vieille']);
  assert.match(vieille.raison, /^Relevée il y a 3 h, au-delà du délai de 3 h : à relever de nouveau avant de parier\.$/);
  assert.match(f('2026-10-04T09:00:00Z', '2026-10-06T12:00:00Z').raison, /il y a 2 jours/);
  for (const inconnue of [null, undefined, '', 'pas une date']) {
    const r = fraicheurCote({ releveAt: inconnue, maintenant: t('2026-10-06T12:00:00Z'), coupDEnvoi: coup, reglage: R });
    assert.deepEqual([r.etat, r.code, r.ageMinutes, r.releveAt], ['a-rafraichir', 'heure-inconnue', null, null], String(inconnue));
  }
  // Un relevé « dans le futur » (horloges décalées) n'a pas d'âge négatif.
  assert.deepEqual([f('2026-10-06T12:05:00Z', '2026-10-06T12:00:00Z').etat, f('2026-10-06T12:05:00Z', '2026-10-06T12:00:00Z').ageMinutes], ['fraiche', 0]);
  // Ce qui a décidé est rendu : l'écran réévalue à l'heure qui tourne.
  assert.deepEqual(
    { releveAt: fraiche.releveAt, coupDEnvoi: fraiche.coupDEnvoi, heureSure: fraiche.heureSure, composAnnonceesA: fraiche.composAnnonceesA, limiteMinutes: fraiche.limiteMinutes, reglage: fraiche.reglage },
    { releveAt: '2026-10-06T09:00:00.000Z', coupDEnvoi: coup, heureSure: true, composAnnonceesA: '2026-10-07T18:00:00.000Z', limiteMinutes: 180, reglage: R }
  );
});

test('fraîcheur : un match du jour — relevée avant l’annonce des compositions (une heure avant le coup d’envoi), à rafraîchir dès cette annonce ; match commencé : à rafraîchir', () => {
  const coup = '2026-10-06T19:00:00Z'; // compositions annoncées à 18 h (20 h à Paris)
  const f = (releve, maintenant, reglage = R) => fraicheurCote({ releveAt: releve, maintenant: t(maintenant), coupDEnvoi: coup, heureSure: true, reglage });
  assert.equal(f('2026-10-06T17:30:00Z', '2026-10-06T17:59:59Z').etat, 'fraiche', 'avant l’annonce : rien ne bouge encore');
  const avant = f('2026-10-06T17:30:00Z', '2026-10-06T18:00:00Z');
  assert.deepEqual([avant.etat, avant.code], ['a-rafraichir', 'avant-compos']);
  assert.match(avant.raison, /^Relevée il y a 30 min, avant l'annonce des compositions \(vers 20 h 00\) : les cotes bougent à ce moment-là\.$/, 'l’heure de Paris');
  assert.equal(f('2026-10-06T18:05:00Z', '2026-10-06T18:40:00Z').etat, 'fraiche', 'relevée après l’annonce');
  assert.equal(f('2026-10-06T17:30:00Z', '2026-10-06T18:10:00Z', { maxAgeMinutes: 180, avantCompos: false }).etat, 'fraiche', 'la règle des compositions se coupe');
  const commence = f('2026-10-06T18:55:00Z', '2026-10-06T19:00:00Z');
  assert.deepEqual([commence.etat, commence.code], ['a-rafraichir', 'match-commence']);
  assert.match(commence.raison, /^Le match a commencé à 21 h 00 : une cote d'avant-match n'est plus jouable\.$/);
  assert.equal(f('2026-10-06T18:59:00Z', '2026-10-06T21:00:00Z', { maxAgeMinutes: 180, avantCompos: false }).code, 'match-commence');
  // L'ordre : heure inconnue, match commencé, trop vieille, compositions.
  assert.equal(f('2026-10-06T10:00:00Z', '2026-10-06T19:30:00Z').code, 'match-commence');
  assert.equal(f('2026-10-06T10:00:00Z', '2026-10-06T18:30:00Z').code, 'trop-vieille');
});

test('fraîcheur : le jour seul (calendrier FotMob) ne compte ni l’annonce ni le coup d’envoi ; un réglage hors bornes reprend le défaut', () => {
  const jourSeul = (releve, maintenant) => fraicheurCote({ releveAt: releve, maintenant: t(maintenant), coupDEnvoi: '2026-10-06T12:00:00Z', heureSure: false, reglage: R });
  assert.equal(jourSeul('2026-10-06T12:30:00Z', '2026-10-06T13:00:00Z').etat, 'fraiche', 'midi UTC est une heure de repli, pas un coup d’envoi');
  assert.equal(jourSeul('2026-10-06T08:00:00Z', '2026-10-06T13:00:00Z').code, 'trop-vieille');
  assert.equal(jourSeul('2026-10-06T08:00:00Z', '2026-10-06T13:00:00Z').composAnnonceesA, null);
  // Un délai réglé à 60 min.
  const court = fraicheurCote({ releveAt: '2026-10-06T10:00:00Z', maintenant: t('2026-10-06T11:01:00Z'), reglage: { maxAgeMinutes: 60, avantCompos: true } });
  assert.deepEqual([court.code, court.limiteMinutes], ['trop-vieille', 60]);
  assert.match(court.raison, /au-delà du délai de 1 h/);
  // Hors bornes ou d'un autre type : la règle par défaut, jamais un délai inventé.
  for (const mauvais of [{ maxAgeMinutes: 5 }, { maxAgeMinutes: 2000 }, { maxAgeMinutes: '180' }, { maxAgeMinutes: 90.5 }, null, { avantCompos: 'oui' }]) {
    assert.deepEqual(reglageFraicheur(mauvais), { maxAgeMinutes: mauvais?.maxAgeMinutes === undefined || typeof mauvais.maxAgeMinutes !== 'number' || !Number.isInteger(mauvais.maxAgeMinutes) || mauvais.maxAgeMinutes < 15 || mauvais.maxAgeMinutes > 1440 ? 180 : mauvais.maxAgeMinutes, avantCompos: true }, JSON.stringify(mauvais));
  }
  assert.deepEqual(reglageFraicheur({ maxAgeMinutes: 15, avantCompos: false }), { maxAgeMinutes: 15, avantCompos: false });
  assert.deepEqual(reglageFraicheur({ maxAgeMinutes: 1440, avantCompos: true }), { maxAgeMinutes: 1440, avantCompos: true });
});

// ------------------------------------------- 2. la value avec la fraîcheur

/** Pinnacle fixe la cote juste ; William Hill (et Unibet) paient. */
const PINNACLE = { key: 'pinnacle', title: 'Pinnacle', odds1: 2.0, oddsDraw: 3.6, odds2: 3.9 };
const fairDePinnacle = () => {
  const inv = [1 / 2.0, 1 / 3.6, 1 / 3.9];
  // Méthode puissance, comme le moteur (marginRemoval.js) : on se contente ici d'une cote juste fixée à la main.
  return inv.map((x) => x / inv.reduce((a, b) => a + b, 0));
};
const pari = (byBookmaker, extra = {}) => ({ byBookmaker, fair: fairDePinnacle(), referenceKeys: ['pinnacle'], config: CONFIG, tiltState: {}, bankroll: 10000, labels: { home: 'Man City gagne', draw: 'Match nul', away: 'Liverpool gagne' }, ...extra });
const MAINTENANT = t('2026-10-05T12:00:00Z');
const fraicheur = (parBookmaker, extra = {}) => ({ parBookmaker, maintenant: MAINTENANT, coupDEnvoi: '2026-10-06T19:00:00Z', heureSure: true, reglage: R, ...extra });
const WH = { key: 'williamhill', title: 'William Hill', odds1: 2.3, oddsDraw: 3.4, odds2: 3.3 };

test('value et fraîcheur : une value sur une cote fraîche est recommandée comme avant, avec l’heure de sa cote ; sur une cote trop vieille, « à rafraîchir », jamais recommandée', () => {
  const seul = findValueBet(pari([PINNACLE, WH]));
  assert.equal(seul.action, 'RECOMMENDED');
  const frais = findValueBetFraiche(pari([PINNACLE, WH]), fraicheur({ williamhill: { releveAt: '2026-10-05T11:00:00Z', origine: 'archive' } }));
  assert.deepEqual([frais.action, frais.outcome, frais.bookmaker, frais.ev, frais.stake], [seul.action, seul.outcome, seul.bookmaker, seul.ev, seul.stake]);
  assert.deepEqual([frais.releveAt, frais.origineReleve, frais.fraicheur.etat], ['2026-10-05T11:00:00.000Z', 'archive', 'fraiche']);
  assert.ok(frais.candidates.every((c) => c.fraicheur && 'releveAt' in c), 'chaque candidat porte l’heure de sa cote');
  const vieux = findValueBetFraiche(pari([PINNACLE, WH]), fraicheur({ williamhill: { releveAt: '2026-10-05T08:59:00Z', origine: 'archive' } }));
  assert.deepEqual([vieux.action, vieux.reason, vieux.stake], ['PASS', 'a_rafraichir', null]);
  assert.deepEqual([vieux.aRafraichir.outcome, vieux.aRafraichir.bookmaker, vieux.aRafraichir.ev, vieux.aRafraichir.fraicheur.code], [seul.outcome, 'williamhill', seul.ev, 'trop-vieille']);
  assert.deepEqual(vieux.limits, seul.limits);
  // Aucune heure pour ce bookmaker : à rafraîchir aussi (jamais une value sur une cote dont on ignore l'âge).
  const inconnu = findValueBetFraiche(pari([PINNACLE, WH]), fraicheur({}));
  assert.deepEqual([inconnu.reason, inconnu.aRafraichir.fraicheur.code], ['a_rafraichir', 'heure-inconnue']);
  // Le match a commencé : à rafraîchir.
  assert.equal(findValueBetFraiche(pari([PINNACLE, WH]), fraicheur({ williamhill: { releveAt: '2026-10-06T18:59:00Z' } }, { maintenant: t('2026-10-06T19:01:00Z') })).aRafraichir.fraicheur.code, 'match-commence');
});

test('value et fraîcheur : une value fraîche ailleurs passe devant une plus forte périmée ; sans value nulle part, la même réponse que le moteur ; coupe-circuit et cotes de référence inchangés', () => {
  const UNIBET = { key: 'unibet_nl', title: 'Unibet (NL)', odds1: 2.2, oddsDraw: 3.45, odds2: 3.35 };
  const melange = findValueBetFraiche(
    pari([PINNACLE, WH, UNIBET]),
    fraicheur({ williamhill: { releveAt: '2026-10-05T06:00:00Z' }, unibet_nl: { releveAt: '2026-10-05T11:50:00Z' } })
  );
  assert.deepEqual([melange.action, melange.bookmaker, melange.fraicheur.etat], ['RECOMMENDED', 'unibet_nl', 'fraiche']);
  assert.ok(melange.ev < findValueBet(pari([PINNACLE, WH, UNIBET])).ev, 'la value de William Hill, plus forte, est périmée');
  // Pas de value : jamais « à rafraîchir », la raison du moteur.
  const SANS = { key: 'williamhill', title: 'William Hill', odds1: 1.9, oddsDraw: 3.3, odds2: 3.6 };
  const r = findValueBetFraiche(pari([PINNACLE, SANS]), fraicheur({ williamhill: { releveAt: '2026-10-01T00:00:00Z' } }));
  assert.deepEqual([r.action, r.reason], ['PASS', findValueBet(pari([PINNACLE, SANS])).reason]);
  assert.equal(r.aRafraichir, undefined);
  // Coupe-circuit : rien.
  assert.equal(findValueBetFraiche(pari([PINNACLE, WH], { tiltState: { circuitBreakerActive: true } }), fraicheur({ williamhill: { releveAt: '2026-10-05T11:50:00Z' } })).action, 'CIRCUIT_BREAKER_ACTIVE');
  // Une cote gratuite de référence, même « fraîche », n'est jamais jouable.
  const REF = { ...WH, key: 'espn-draftkings', referenceOnly: true };
  const ref = findValueBetFraiche(pari([PINNACLE, REF]), fraicheur({ 'espn-draftkings': { releveAt: '2026-10-05T11:59:00Z' } }));
  assert.notEqual(ref.action, 'RECOMMENDED');
});

test('value et fraîcheur : toutes cotes fraîches, 400 tirages — exactement le verdict de findValueBet', () => {
  const hasard = generateur(20261007);
  const livres = ['williamhill', 'unibet_nl', 'betsson', 'betclic_fr'];
  let recommandes = 0;
  for (let i = 0; i < 400; i++) {
    const offres = livres.map((key) => {
      const p = fairDePinnacle();
      const marge = 1.02 + hasard() * 0.07;
      const cotes = p.map((x) => Number((1 / (x * marge * (0.9 + hasard() * 0.2))).toFixed(2)));
      return { key, title: key, odds1: Math.max(1.05, cotes[0]), oddsDraw: Math.max(1.05, cotes[1]), odds2: Math.max(1.05, cotes[2]) };
    });
    const a = findValueBet(pari([PINNACLE, ...offres]));
    const b = findValueBetFraiche(pari([PINNACLE, ...offres]), fraicheur(Object.fromEntries(livres.map((k) => [k, { releveAt: '2026-10-05T11:30:00Z' }]))));
    assert.deepEqual([b.action, b.reason ?? null, b.outcome ?? null, b.bookmaker ?? null, b.ev ?? null, b.stake], [a.action, a.reason ?? null, a.outcome ?? null, a.bookmaker ?? null, a.ev ?? null, a.stake], `tirage ${i}`);
    if (a.action === 'RECOMMENDED') recommandes++;
  }
  assert.ok(recommandes >= 40, `${recommandes} recommandés : le tirage doit en contenir`);
});

// ------------------------------------------- 3. l'écran juge comme le serveur

test('écran = serveur : la règle de fraîcheur de l’écran (etatFraicheur) donne le même état, pour le même motif, que celle du serveur, sur 3 000 tirages', avecEcran, () => {
  const hasard = generateur(7);
  const vus = {};
  for (let i = 0; i < 3000; i++) {
    // Autour du coup d'envoi : de 5 h avant à 1 h après ; relevée de quelques minutes à 5 h plus tôt (parfois « après », parfois jamais).
    const coup = t('2026-10-06T19:00:00Z') + Math.round((hasard() - 0.5) * 6 * H);
    const maintenant = coup + Math.round((hasard() * 6 - 5) * H);
    const releve = hasard() < 0.06 ? null : new Date(maintenant - Math.round((hasard() * 5.2 - 0.2) * H)).toISOString();
    const reglage = [R, { maxAgeMinutes: 60, avantCompos: true }, { maxAgeMinutes: 360, avantCompos: false }, { maxAgeMinutes: 15, avantCompos: true }][i % 4];
    const heureSure = hasard() > 0.15;
    const p = { releveAt: releve, maintenant, coupDEnvoi: new Date(coup).toISOString(), heureSure, reglage };
    const s = fraicheurCote(p);
    const e = L.etatFraicheur(p);
    assert.deepEqual([e.etat, e.code, e.ageMinutes, e.composAnnonceesA], [s.etat, s.code, s.ageMinutes, s.composAnnonceesA], `tirage ${i} : ${JSON.stringify(p)}`);
    vus[s.code] = (vus[s.code] ?? 0) + 1;
  }
  for (const code of ['fraiche', 'trop-vieille', 'avant-compos', 'match-commence', 'heure-inconnue']) assert.ok((vus[code] ?? 0) >= 40, `${code} vu ${vus[code] ?? 0} fois`);
  // Les cas à la limite, un par un : le tirage ne tombe jamais pile dessus.
  const coup = '2026-10-06T19:00:00Z';
  const limites = [
    ['3 h pile', { releveAt: '2026-10-06T09:00:00Z', maintenant: t('2026-10-06T12:00:00Z') }, 'fraiche'],
    ['3 h et 1 ms', { releveAt: '2026-10-06T09:00:00Z', maintenant: t('2026-10-06T12:00:00Z') + 1 }, 'trop-vieille'],
    ['annonce pile', { releveAt: '2026-10-06T17:59:59Z', maintenant: t('2026-10-06T18:00:00Z') }, 'avant-compos'],
    ['juste avant l’annonce', { releveAt: '2026-10-06T17:00:00Z', maintenant: t('2026-10-06T17:59:59Z') }, 'fraiche'],
    ['relevée à l’annonce pile', { releveAt: '2026-10-06T18:00:00Z', maintenant: t('2026-10-06T18:30:00Z') }, 'fraiche'],
    ['coup d’envoi pile', { releveAt: '2026-10-06T18:50:00Z', maintenant: t(coup) }, 'match-commence'],
    ['une ms avant le coup d’envoi', { releveAt: '2026-10-06T18:50:00Z', maintenant: t(coup) - 1 }, 'fraiche'],
    ['délai de 15 min pile', { releveAt: '2026-10-06T11:45:00Z', maintenant: t('2026-10-06T12:00:00Z'), reglage: { maxAgeMinutes: 15, avantCompos: true } }, 'fraiche'],
    ['réglage illisible', { releveAt: '2026-10-06T09:00:00Z', maintenant: t('2026-10-06T12:00:00Z') + 1, reglage: { maxAgeMinutes: '600' } }, 'trop-vieille']
  ];
  for (const [nom, p, attendu] of limites) {
    const complet = { coupDEnvoi: coup, heureSure: true, reglage: R, ...p };
    assert.equal(fraicheurCote(complet).code, attendu, `serveur : ${nom}`);
    assert.equal(L.etatFraicheur(complet).code, attendu, `écran : ${nom}`);
  }
  // fraicheurVivante : l'heure tourne, la cote vieillit ; un verdict « à rafraîchir » du serveur ne redevient jamais frais.
  const duServeur = fraicheurCote({ releveAt: '2026-10-05T11:00:00Z', maintenant: t('2026-10-05T12:00:00Z'), coupDEnvoi: '2026-10-06T19:00:00Z', reglage: R });
  assert.equal(L.fraicheurVivante(duServeur, t('2026-10-05T12:30:00Z')).etat, 'fraiche');
  assert.equal(L.fraicheurVivante(duServeur, t('2026-10-05T14:00:01Z')).code, 'trop-vieille', 'trois heures après le relevé, sans recharger la page');
  const perimee = fraicheurCote({ releveAt: '2026-10-05T08:00:00Z', maintenant: t('2026-10-05T12:00:00Z'), reglage: R });
  assert.equal(L.fraicheurVivante(perimee, t('2026-10-05T09:00:00Z')).etat, 'a-rafraichir', 'horloge de ce poste en retard : le verdict du serveur tient');
  assert.equal(L.fraicheurVivante(null, MAINTENANT), null);
});

test('écran = serveur : la pastille d’une cote saisie (etatValue) et le verdict du serveur (verdictValue) disent la même chose ; « à rafraîchir » n’est jamais vert', avecEcran, () => {
  const hasard = generateur(77);
  const REGLE = S.regleDuMoteur(CONFIG);
  assert.deepEqual(REGLE, { min: 2, max: 25, coteMax: 5 });
  const fraiche = fraicheurCote({ releveAt: '2026-10-05T11:30:00Z', maintenant: MAINTENANT, reglage: R });
  const vieille = fraicheurCote({ releveAt: '2026-10-05T07:00:00Z', maintenant: MAINTENANT, reglage: R });
  const vus = {};
  for (let i = 0; i < 1500; i++) {
    const pourcent = hasard() < 0.08 ? null : -15 + hasard() * 50;
    const cote = Number((1.2 + hasard() * 6).toFixed(2));
    const jouable = hasard() > 0.1;
    const f = [fraiche, vieille, null][i % 3];
    const regle = hasard() < 0.05 ? null : REGLE;
    const serveur = S.verdictValue({ pourcent, cote, regle, jouable, fraicheur: f });
    const ecran = L.etatValue({ pourcent, jouable, cote, regle, fraicheur: f });
    assert.equal(ecran.etat, serveur, `tirage ${i} : ${JSON.stringify({ pourcent, cote, jouable, f: f?.etat, regle: Boolean(regle) })}`);
    if (f?.etat === 'a-rafraichir' && jouable) assert.equal(ecran.vert, false);
    vus[serveur] = (vus[serveur] ?? 0) + 1;
  }
  for (const etat of ['value', 'a-rafraichir', 'sous-seuil', 'sans-value', 'trop-beau', 'cote-haute', 'non-jouable', 'inconnue', 'seuil-inconnu']) assert.ok((vus[etat] ?? 0) >= 5, `${etat} vu ${vus[etat] ?? 0} fois`);
  // Une forte value sur une cote trop vieille : la phrase le dit, en toutes lettres.
  const dit = L.etatValue({ pourcent: 19.6, jouable: true, cote: 2.3, regle: REGLE, fraicheur: vieille });
  assert.deepEqual([dit.etat, dit.vert, dit.qualificatif], ['a-rafraichir', false, 'à rafraîchir']);
  assert.match(dit.raison, /^Cote à rafraîchir : Relevée il y a 5 h, au-delà du délai de 3 h : à relever de nouveau avant de parier\. Au dernier relevé, l'avantage était de \+19,6 % : ce n'est pas une value tant que la cote n'est pas relevée de nouveau\.$/);
  // Une cote de référence ou d'un bookmaker non coché reste dite comme avant, fraîche ou non.
  assert.equal(L.etatValue({ pourcent: 12, jouable: true, reference: true, cote: 2.5, regle: REGLE, fraicheur: vieille }).etat, 'reference');
  assert.equal(L.etatValue({ pourcent: 12, jouable: false, cote: 2.5, regle: REGLE, fraicheur: vieille }).etat, 'non-jouable');
  // Sans fraîcheur donnée (avant l'étape 7), la règle d'avant.
  assert.equal(L.etatValue({ pourcent: 12, jouable: true, cote: 2.5, regle: REGLE }).etat, 'value');
});

test('écran : le pari du moteur à montrer (pariDuMoteur, page du match et pronostic du résultat) — conseillé seulement frais ; vieilli depuis l’analyse, « à rafraîchir » ; dit à rafraîchir par le serveur, jamais conseillé', avecEcran, () => {
  const recommande = { action: 'RECOMMENDED', outcome: 'home', bookmaker: 'williamhill', ev: 0.12, fraicheur: fraicheurCote({ releveAt: '2026-10-05T11:00:00Z', maintenant: MAINTENANT, coupDEnvoi: '2026-10-06T19:00:00Z', reglage: R }) };
  const frais = L.pariDuMoteur(recommande, MAINTENANT);
  assert.deepEqual([frais.conseille, frais.aRafraichir, frais.fraicheur.etat], [recommande, null, 'fraiche']);
  const vieilli = L.pariDuMoteur(recommande, t('2026-10-05T14:00:01Z'));
  assert.deepEqual([vieilli.conseille, vieilli.aRafraichir, vieilli.fraicheur.code], [null, recommande, 'trop-vieille'], 'la page restée ouverte : plus conseillé');
  const parLeServeur = { action: 'PASS', reason: 'a_rafraichir', aRafraichir: { outcome: 'home', fraicheur: fraicheurCote({ releveAt: '2026-10-05T06:00:00Z', maintenant: MAINTENANT, reglage: R }) } };
  const dit = L.pariDuMoteur(parLeServeur, MAINTENANT - 6 * H);
  assert.deepEqual([dit.conseille, dit.aRafraichir, dit.fraicheur.etat], [null, parLeServeur.aRafraichir, 'a-rafraichir'], 'même avec une horloge en retard');
  // Avant l'étape 7 (pas de fraîcheur dans la réponse) : le pari conseillé comme avant.
  const ancien = { action: 'RECOMMENDED', outcome: 'away' };
  assert.deepEqual(L.pariDuMoteur(ancien, MAINTENANT), { conseille: ancien, aRafraichir: null, fraicheur: null });
  for (const rien of [null, undefined, { action: 'PASS', reason: 'pas_de_value' }, { action: 'CIRCUIT_BREAKER_ACTIVE' }]) {
    assert.deepEqual(L.pariDuMoteur(rien, MAINTENANT), { conseille: null, aRafraichir: null, fraicheur: null }, JSON.stringify(rien));
  }
});

// ----------------------------------------------------- 4. la saisie (pure)

const RESULTAT = {
  trueOdds: {
    over25: 1.75, under25: 2.33, over15: 1.28, under15: 4.57, over05: 1.06, under05: 17.9, over35: 2.9, under35: 1.53,
    bothTeamsScore: 1.62, bothTeamsScoreNo: 2.61,
    homeTeamGoals: { over05: 1.25, under05: 5.0, over15: 2.1, under15: 1.9, over25: 4.3, under25: 1.3, over35: 9.5, under35: 1.12 },
    awayTeamGoals: { over05: 1.45, under05: 3.2, over15: 3.1, under15: 1.48, over25: 7.4, under25: 1.16, over35: 19, under35: 1.06 }
  },
  statExpectations: { corners: { home: 5.56, away: 4.54, total: 10.1 }, shots: { home: 14.08, away: 11.12, total: 25.2 } }
};

test('saisie : une cote de VOS bookmakers seulement, sur un marché saisissable — jamais le 1N2 —, une demi-ligne, une cote décimale ; tout le reste refusé en clair', () => {
  const ok = S.validerSaisie({ bookmaker: 'williamhill', marketId: 'totalCorners', sens: 'over', ligne: 9.5, cote: 2.1 }, { config: CONFIG });
  assert.deepEqual(ok, { bookmaker: 'williamhill', marketId: 'totalCorners', sens: 'over', ligne: 9.5, equipe: null, joueur: null, cote: 2.1 });
  assert.deepEqual(S.validerSaisie({ bookmaker: 'coolbet', marketId: 'anytimeScorer', sens: 'yes', joueur: '  Erling   Haaland ', cote: 1.954321 }, { config: CONFIG }), { bookmaker: 'coolbet', marketId: 'anytimeScorer', sens: 'yes', ligne: null, equipe: null, joueur: 'Erling Haaland', cote: 1.954 });
  const refus = (corps, motif) => assert.throws(() => S.validerSaisie(corps, { config: CONFIG }), (e) => e instanceof S.SaisieInvalide && motif.test(e.message), JSON.stringify(corps));
  const base = { bookmaker: 'williamhill', marketId: 'totalCorners', sens: 'over', ligne: 9.5, cote: 2.1 };
  refus({ ...base, bookmaker: 'betclic_fr' }, /n'est pas un de vos bookmakers/);
  refus({ ...base, bookmaker: 'pinnacle' }, /n'est pas un de vos bookmakers/);
  refus({ ...base, marketId: 'result' }, /Le 1N2 se relève chez The Odds API/);
  refus({ ...base, sens: 'yes' }, /Issue inconnue/);
  refus({ ...base, ligne: 9 }, /demi-ligne/);
  refus({ ...base, ligne: 2.25 }, /demi-ligne/);
  refus({ ...base, ligne: 61.5 }, /demi-ligne/);
  refus({ ...base, ligne: '9.5' }, /demi-ligne/);
  refus({ ...base, cote: 1 }, /cote décimale/);
  refus({ ...base, cote: '2,10' }, /cote décimale/);
  refus({ ...base, cote: 1001 }, /cote décimale/);
  refus({ ...base, marketId: 'teamCorners', ligne: 4.5 }, /« equipe »/);
  refus({ bookmaker: 'coolbet', marketId: 'anytimeScorer', sens: 'yes', joueur: '', cote: 2 }, /« joueur »/);
  refus(null, /Corps attendu/);
  refus([], /Corps attendu/);
  // Les dix bookmakers cochés par Pierre le 23/09/2026, et eux seuls.
  assert.deepEqual(S.vosBookmakers(CONFIG), ['williamhill', 'sport888', 'betsson', 'nordicbet', 'unibet_nl', 'unibet_se', 'leovegas_se', 'tipico_de', 'coolbet', 'codere_it']);
});

test('saisie : chaque marché se range dans l’archive et se relit à l’identique ; ses libellés', () => {
  const cas = [
    [{ bookmaker: 'williamhill', marketId: 'totalGoals', sens: 'under', ligne: 2.5 }, { market: 'ou', selection: 'under', line: 2.5 }, 'Moins de 2,5 buts'],
    [{ bookmaker: 'betsson', marketId: 'bothTeamsScore', sens: 'no', ligne: null }, { market: 'btts', selection: 'no', line: 0 }, 'Les 2 équipes marquent : Non'],
    [{ bookmaker: 'betsson', marketId: 'teamGoals', sens: 'over', ligne: 1.5, equipe: 'home' }, { market: 'team_total', selection: 'home_over', line: 1.5 }, 'Man City — Plus de 1,5 buts'],
    [{ bookmaker: 'nordicbet', marketId: 'teamCorners', sens: 'under', ligne: 4.5, equipe: 'away' }, { market: 'team_corners', selection: 'away_under', line: 4.5 }, 'Liverpool — Moins de 4,5 corners'],
    [{ bookmaker: 'tipico_de', marketId: 'totalShotsOnTarget', sens: 'over', ligne: 8.5 }, { market: 'shots_on_target', selection: 'over', line: 8.5 }, 'Plus de 8,5 tirs cadrés'],
    [{ bookmaker: 'tipico_de', marketId: 'teamCards', sens: 'over', ligne: 1.5, equipe: 'home' }, { market: 'team_cards', selection: 'home_over', line: 1.5 }, 'Man City — Plus de 1,5 cartons'],
    [{ bookmaker: 'coolbet', marketId: 'anytimeScorer', sens: 'yes', ligne: null, joueur: 'Mohamed Salah' }, { market: 'scorer', selection: 'joueur:Mohamed Salah', line: 0 }, 'Mohamed Salah marque']
  ];
  for (const [s, k, libelle] of cas) {
    const saisie = { equipe: null, joueur: null, ...s };
    assert.deepEqual(S.cleArchive(saisie), k, s.marketId);
    assert.deepEqual(S.depuisArchive({ bookmaker: s.bookmaker, ...k }), { bookmaker: s.bookmaker, marketId: s.marketId, sens: s.sens, equipe: saisie.equipe, joueur: saisie.joueur, ligne: saisie.ligne }, `${s.marketId} relu`);
    assert.equal(S.libelleSaisie(saisie, { home: 'Man City', away: 'Liverpool' }), libelle);
  }
  assert.equal(S.cleDeSaisie('williamhill', { market: 'corners', selection: 'over', line: 9.5 }), 'williamhill|corners|over|9.5');
  assert.equal(S.depuisArchive({ bookmaker: 'x', market: '1x2', selection: 'home', line: 0 }), null, 'un marché que la saisie ne connaît pas');
  assert.deepEqual(S.MARCHES_SAISIE.map((m) => m.id), ['totalGoals', 'bothTeamsScore', 'teamGoals', 'totalCorners', 'teamCorners', 'totalShots', 'teamShots', 'totalShotsOnTarget', 'teamShotsOnTarget', 'totalCards', 'teamCards', 'anytimeScorer']);
});

test('saisie : la probabilité du MOTEUR pour l’issue saisie — modèle de buts, binomiale négative mesurée ; cartons, buteurs, ligne de buts hors 0,5–3,5 : pas de probabilité, pas de value, et la raison', () => {
  const p = (s) => S.probabiliteDuMoteur(RESULTAT, { equipe: null, joueur: null, ligne: null, ...s });
  // Le total de buts et les 2 marquent : 1 / la cote juste du moteur.
  assert.deepEqual(p({ marketId: 'totalGoals', sens: 'over', ligne: 2.5 }), { probabilite: 1 / 1.75, coteJuste: 1.75, origine: 'modèle de buts du moteur', raison: null });
  assert.equal(p({ marketId: 'totalGoals', sens: 'under', ligne: 1.5 }).coteJuste, 4.57);
  assert.equal(p({ marketId: 'bothTeamsScore', sens: 'no' }).coteJuste, 2.61);
  assert.equal(p({ marketId: 'teamGoals', sens: 'under', ligne: 1.5, equipe: 'away' }).coteJuste, 1.48);
  assert.equal(p({ marketId: 'teamGoals', sens: 'over', ligne: 0.5, equipe: 'home' }).coteJuste, 1.25);
  // Corners : la binomiale négative du moteur, la même cote juste que ses pronostics (lineCandidates).
  const corners = p({ marketId: 'totalCorners', sens: 'over', ligne: 9.5 });
  const attendue = lineCandidates(10.1, STAT_KINDS.corners.invKTotal).find((c) => c.line === 9.5 && c.side === 'over').odds;
  assert.equal(corners.coteJuste, attendue);
  assert.equal(corners.probabilite, 1 / attendue);
  assert.match(corners.origine, /corners attendus par le moteur \(binomiale négative mesurée\)/);
  assert.equal(p({ marketId: 'teamCorners', sens: 'under', ligne: 4.5, equipe: 'away' }).coteJuste, lineCandidates(4.54, STAT_KINDS.corners.invKTeam).find((c) => c.line === 4.5 && c.side === 'under').odds);
  // Une ligne que lineCandidates ne propose pas (elle commence à 4,5 pour 10,1 attendus) : la même loi, la même règle d'arrondi.
  assert.equal(lineCandidates(10.1, STAT_KINDS.corners.invKTotal).some((c) => c.line === 3.5), false);
  const basse = p({ marketId: 'totalCorners', sens: 'under', ligne: 3.5 });
  assert.equal(basse.coteJuste, coteJusteLigne(10.1, STAT_KINDS.corners.invKTotal, 3.5, 'under'));
  assert.ok(basse.coteJuste > 50, `moins de 3,5 corners pour 10,1 attendus : très peu probable (${basse.coteJuste})`);
  assert.equal(coteJusteLigne(10.1, STAT_KINDS.corners.invKTotal, 9, 'over'), null, 'jamais une ligne entière');
  // Une cote juste de 1,00 (probabilité arrondie à 1) ne fait pas une probabilité : pas de value.
  assert.equal(coteJusteLigne(10.1, STAT_KINDS.corners.invKTotal, 30.5, 'under'), 1);
  assert.equal(p({ marketId: 'totalCorners', sens: 'under', ligne: 30.5 }).probabilite, null);
  // Ce que le moteur ne calcule pas : dit, jamais inventé.
  const sans = (s, motif) => {
    const r = p(s);
    assert.deepEqual([r.probabilite, r.coteJuste], [null, null], JSON.stringify(s));
    assert.match(r.raison, motif, JSON.stringify(s));
  };
  sans({ marketId: 'totalGoals', sens: 'over', ligne: 4.5 }, /lignes 0,5 à 3,5 : pas de probabilité pour 4,5/);
  sans({ marketId: 'totalCards', sens: 'over', ligne: 4.5 }, /cartons \(étape 33 du plan\)/);
  sans({ marketId: 'anytimeScorer', sens: 'yes', joueur: 'Haaland' }, /buteurs \(étape 34 du plan\)/);
  sans({ marketId: 'totalShotsOnTarget', sens: 'over', ligne: 8.5 }, /Pas assez de matchs relevés.*tirs cadrés attendus/);
  assert.match(S.probabiliteDuMoteur(null, { marketId: 'totalCorners', sens: 'over', ligne: 9.5 }).raison, /n'a pas pu se faire/);
});

test('saisie : la value = probabilité du moteur × cote − 1, jugée par les seuils du moteur et la fraîcheur de la saisie', () => {
  const v = (cote, releveAt, saisie = { bookmaker: 'williamhill', marketId: 'totalGoals', sens: 'over', ligne: 2.5, equipe: null, joueur: null }) =>
    S.valueDeLaSaisie({ saisie, cote, releveAt, resultat: RESULTAT, config: CONFIG, reglage: R, maintenant: MAINTENANT, coupDEnvoi: '2026-10-06T19:00:00Z', heureSure: true });
  const a = v(1.95, '2026-10-05T11:58:00Z');
  assert.equal(a.pourcent, 11.43, '1 / 1,75 × 1,95 − 1 = +11,43 %');
  assert.deepEqual([a.verdict, a.jouable, a.fraicheur.etat], ['value', true, 'fraiche']);
  assert.equal(v(1.78, '2026-10-05T11:58:00Z').verdict, 'sous-seuil', '+1,7 % : sous les 2 %');
  assert.equal(v(1.7, '2026-10-05T11:58:00Z').verdict, 'sans-value');
  assert.equal(v(2.3, '2026-10-05T11:58:00Z').verdict, 'trop-beau', '+31 % : au-delà des 25 %');
  assert.equal(v(1.95, '2026-10-05T08:00:00Z').verdict, 'a-rafraichir', 'saisie il y a 4 h');
  const cartons = v(1.9, '2026-10-05T11:58:00Z', { bookmaker: 'tipico_de', marketId: 'totalCards', sens: 'over', ligne: 4.5, equipe: null, joueur: null });
  assert.deepEqual([cartons.pourcent, cartons.verdict], [null, 'inconnue']);
  // Un bookmaker décoché depuis la saisie : plus jouable.
  const decoche = S.valueDeLaSaisie({ saisie: { bookmaker: 'williamhill', marketId: 'totalGoals', sens: 'over', ligne: 2.5 }, cote: 1.95, releveAt: '2026-10-05T11:58:00Z', resultat: RESULTAT, config: { ...CONFIG, valueBookmakers: ['betsson'] }, reglage: R, maintenant: MAINTENANT, coupDEnvoi: null, heureSure: false });
  assert.deepEqual([decoche.jouable, decoche.verdict], [false, 'non-jouable']);
});

// ------------------------------------------------ 5. dans une copie isolée

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-cotes-vos-bookmakers.mjs');
/** Une phase du script dans une copie neuve (avec scripts/ : l'application complète les charge). */
function lancer(phase, { maintenant } = {}) {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, SCRIPT, { args: [phase], timeout: 180_000, ...(maintenant ? { maintenant } : {}) });
    assert.equal(r.code, 0, `${phase} a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-2000)}`);
    assert.ok(r.json?.ok, `${phase} : sortie illisible\n${r.sortie.slice(-2000)}`);
    assert.equal(r.reseau, false, `${phase} : un appel réseau a été tenté\n${r.erreurs.slice(-2000)}`);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}
const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};
const saisies = uneFois(() => lancer('saisies'));
const analyse = uneFois(() => lancer('analyse'));
const routes = uneFois(() => lancer('routes'));
const releve = uneFois(() => lancer('releve'));
const conseil = uneFois(() => lancer('conseil'));

test('copie : une cote saisie donne AUSSITÔT sa value face au moteur, et part dans l’archive (source « saisie ») avec son heure', () => {
  const s = saisies();
  assert.ok(s.ids.homeId && s.ids.awayId, 'Man City et Liverpool connus par leur identifiant FotMob');
  assert.deepEqual([s.vide.saisies, s.vide.marches.length, s.vide.regle, s.vide.heureSure], [0, 12, { min: 2, max: 25, coteMax: 5 }, true]);
  assert.equal(s.vide.cleArchive, `fotmob:${s.ids.homeId}|${s.ids.awayId}|2026-10-06`);
  assert.equal(s.vide.bookmakers.length, 10);
  const p = s.p1;
  assert.deepEqual([p.change, p.correction, p.ecrite, p.enAttente, p.cle], [true, false, true, false, 'williamhill|corners|over|9.5']);
  // La value : celle du moteur pour Plus de 9,5 corners (10,1 attendus), face à 2,10.
  const moteurCorners = s.moteurBrut.statExpectations.corners.total;
  const coteJuste = coteJusteLigne(moteurCorners, STAT_KINDS.corners.invKTotal, 9.5, 'over');
  assert.equal(p.saisie.moteur.coteJuste, coteJuste);
  assert.equal(p.saisie.pourcent, Math.round(((1 / coteJuste) * 2.1 - 1) * 10000) / 100);
  assert.deepEqual([p.saisie.verdict, p.saisie.jouable, p.saisie.fraicheur.etat, p.saisie.libelle, p.saisie.bookmakerTitre], ['value', true, 'fraiche', 'Plus de 9,5 corners', 'William Hill']);
  assert.deepEqual(p.lignes, [{ bookmaker: 'williamhill', market: 'corners', selection: 'over', line: 9.5, r: '2026-10-05T12:00:00.000Z', price: 2.1, kind: 'snapshot' }]);
  assert.deepEqual(s.evenements, [{ source: 'saisie', ev: s.vide.cleArchive, league: 'EPL', date: '2026-10-06', kickoff: '2026-10-06T19:00:00.000Z', h: s.ids.homeId, a: s.ids.awayId, provenance: 'Saisie à la main dans CôteMaster (page du match)' }]);
});

test('copie : la même cote rejouée n’écrit rien ; corrigée, une ligne de plus — l’ancienne reste ; retirée, une ligne sans prix ; deux fois, rien ; inconnue, refusée', () => {
  const s = saisies();
  assert.deepEqual(s.p2, { change: false, lignes: 1 });
  assert.deepEqual([s.p3.change, s.p3.correction, s.p3.cote, s.p3.coteAvant, s.p3.versions, s.p3.premiere, s.p3.releveAt], [true, true, 2.25, 2.1, 2, '2026-10-05T12:00:00.000Z', '2026-10-05T12:01:00.000Z']);
  assert.deepEqual(s.p3.lignes.map((l) => [l.r, l.price]), [['2026-10-05T12:00:00.000Z', 2.1], ['2026-10-05T12:01:00.000Z', 2.25]]);
  assert.deepEqual([s.retrait.r1.change, s.retrait.r1.ecrite, s.retrait.r1.enVigueur], [true, true, false]);
  assert.deepEqual(s.retrait.r1.retirees, [['williamhill|corners|over|9.5', '2026-10-05T12:09:00.000Z']]);
  assert.deepEqual(s.retrait.r2, { change: false });
  assert.match(s.retrait.r3, /^SaisieIntrouvable : Aucune cote saisie sous/);
  assert.deepEqual(s.retrait.lignesCorners.map((l) => [l.r, l.price]), [['2026-10-05T12:00:00.000Z', 2.1], ['2026-10-05T12:01:00.000Z', 2.25], ['2026-10-05T12:09:00.000Z', null]], 'rien d’effacé : la ligne du retrait n’a pas de prix');
  assert.deepEqual(s.revient, { change: true, correction: false, enVigueur: true }, 'saisie de nouveau après un retrait');
  // Le même buteur autrement écrit : la même saisie.
  assert.deepEqual(s.buteurBis, { change: false, cle: 'coolbet|scorer|joueur:Erling Haaland|0' });
  assert.equal(s.lignesFinales, 11);
});

test('copie : les autres marchés — « les 2 marquent » et buts d’une équipe par le modèle de buts ; buts 4,5, cartons, buteur : gardés SANS value, avec la raison', () => {
  const a = saisies().autres;
  const m = saisies().moteurBrut;
  assert.equal(a.btts.moteur.coteJuste, m.bothTeamsScore);
  assert.equal(a.btts.pourcent, Math.round(((1 / m.bothTeamsScore) * 1.8 - 1) * 10000) / 100);
  assert.equal(a.equipe.moteur.coteJuste, m.awayUnder15);
  assert.equal(a.equipe.libelle, 'Liverpool — Moins de 1,5 buts');
  for (const k of ['buts45', 'cartons', 'buteur']) {
    assert.deepEqual([a[k].pourcent, a[k].verdict, a[k].moteur.probabilite], [null, 'inconnue', null], k);
    assert.ok(a[k].moteur.raison.length > 30, k);
  }
  assert.match(a.cartons.moteur.raison, /étape 33/);
  assert.match(a.buteur.moteur.raison, /étape 34/);
  assert.equal(a.buteur.libelle, 'Erling Haaland marque');
});

test('copie : une saisie refusée n’écrit rien — bookmaker qui n’est pas à vous, 1N2, ligne entière ou en quart, cote impossible, équipe ou buteur absents, match inconnu', () => {
  const s = saisies();
  assert.equal(s.refusRienEcrit, true);
  const attendu = {
    pasVotreBookmaker: /^SaisieInvalide : « betclic_fr » n'est pas un de vos bookmakers/,
    resultat: /^SaisieInvalide : Marché inconnu : « result »/,
    ligneEntiere: /^SaisieInvalide : « ligne »/,
    ligneQuart: /^SaisieInvalide : « ligne »/,
    cote: /^SaisieInvalide : « cote »/,
    coteTexte: /^SaisieInvalide : « cote »/,
    equipeAbsente: /^SaisieInvalide : « equipe »/,
    joueurVide: /^SaisieInvalide : « joueur »/,
    matchInconnu: /^SaisieIntrouvable : Match introuvable : pas-un-match$/,
    sansMatch: /^SaisieInvalide : « matchId »/
  };
  assert.deepEqual(Object.keys(s.refus), Object.keys(attendu));
  for (const [k, motif] of Object.entries(attendu)) assert.match(s.refus[k], motif, k);
});

test('copie : les écrans des cotes GRATUITES restent exactement les mêmes (onglet Cotes, cotes payantes demandées, résumés, cotes de référence du moteur) — les saisies n’y entrent jamais', () => {
  assert.deepEqual(saisies().gratuitesInchangees, { fixture: true, avecPayantes: true, resume: true, resumePayantes: true, reference: true });
});

test('copie : un import tient la base (autre processus) — la saisie donne sa value mais RIEN n’est écrit, « en attente » ; rejouée, rien de plus ; le verrou libéré, elle part dans l’archive', () => {
  const v = saisies().verrou;
  assert.deepEqual([v.pv.change, v.pv.ecrite, v.pv.enAttente], [true, false, true]);
  assert.match(v.pv.raison, /une passe d'actualisation ou un import tient la base/);
  assert.deepEqual(v.pvBis, { change: false, enAttente: true }, 'idempotente même en attente');
  assert.equal(v.pendantEcrites, 0, 'aucune ligne écrite pendant l’import');
  assert.equal(v.pendantAffichee, true, 'la page la montre « en attente d’écriture »');
  assert.equal(v.file, 1);
  assert.deepEqual(v.apresLiberation, { ecrites: 1, affichee: false, file: 0 });
});

test('copie : une saisie vieillit comme une cote relevée — quatre heures après, toutes « à rafraîchir » ; saisie la veille du coup d’envoi puis compositions annoncées : à rafraîchir', () => {
  const s = saisies();
  assert.equal(s.fraicheurTard.length, 7);
  for (const [cle, etat, code, verdict] of s.fraicheurTard) assert.deepEqual([etat, code, verdict], ['a-rafraichir', 'trop-vieille', 'a-rafraichir'], cle);
  assert.deepEqual([s.fraicheurCompos.avantAnnonce, s.fraicheurCompos.etat, s.fraicheurCompos.code, s.fraicheurCompos.verdict], ['fraiche', 'a-rafraichir', 'avant-compos', 'a-rafraichir']);
  assert.match(s.fraicheurCompos.raison, /avant l'annonce des compositions \(vers 20 h 00\)/);
});

test('copie : l’heure de chaque cote payante est lue dans l’ARCHIVE (relevé The Odds API gardé par les Enregistreurs) ; archive en retard : l’heure du fichier ; prix différent : inconnue ; cote gratuite : rien', () => {
  const a = analyse();
  assert.deepEqual(a.heures.parBookmaker, {
    pinnacle: { releveAt: '2026-10-05T11:00:00.000Z', origine: 'archive' },
    williamhill: { releveAt: '2026-10-05T11:00:00.000Z', origine: 'archive' },
    betclic_fr: { releveAt: '2026-10-05T11:00:00.000Z', origine: 'archive' }
  });
  assert.equal(a.heures.archive, '2026-10-05T11:00:00.000Z');
  assert.deepEqual(a.heuresEnRetard.parBookmaker.williamhill, { releveAt: '2026-10-06T17:45:00.000Z', origine: 'instantane' }, 'nouveau relevé pas encore archivé : l’heure du fichier');
  assert.deepEqual(a.heuresIncoherentes.parBookmaker.williamhill, { releveAt: null, origine: 'archive-differente' });
  assert.deepEqual(a.heuresGratuites, { parBookmaker: {}, archive: null, fichier: null });
});

test('copie : le moteur ne recommande la value que sur une cote fraîche — 3 h pile encore, une seconde de plus « à rafraîchir » ; compositions annoncées, match commencé, délai court ; ses probabilités ne bougent pas', () => {
  const a = analyse();
  assert.deepEqual([a.sansFraicheur.action, a.sansFraicheur.bookmaker, a.sansFraicheur.champ], ['RECOMMENDED', 'williamhill', false], 'sans heure fournie, le moteur d’avant');
  const r = (x) => [x.action, x.reason, x.bookmaker, x.releveAt, x.fraicheur];
  assert.deepEqual(r(a.fraiche), ['RECOMMENDED', null, 'williamhill', '2026-10-05T11:00:00.000Z', 'fraiche']);
  assert.equal(a.fraiche.ev, a.sansFraicheur.ev);
  assert.equal(a.fraiche.origine, 'archive');
  assert.deepEqual(r(a.limite), ['RECOMMENDED', null, 'williamhill', '2026-10-05T11:00:00.000Z', 'fraiche']);
  assert.deepEqual(r(a.perimee), ['PASS', 'a_rafraichir', 'williamhill', '2026-10-05T11:00:00.000Z', 'trop-vieille']);
  assert.equal(a.perimee.stake, null);
  assert.equal(a.perimee.edgePercent, a.fraiche.edgePercent, 'l’avantage au dernier relevé reste dit');
  assert.deepEqual(r(a.avantAnnonce), ['RECOMMENDED', null, 'williamhill', '2026-10-06T17:30:00.000Z', 'fraiche']);
  assert.deepEqual(r(a.avantCompos), ['PASS', 'a_rafraichir', 'williamhill', '2026-10-06T17:30:00.000Z', 'avant-compos']);
  assert.deepEqual(r(a.commence), ['PASS', 'a_rafraichir', 'williamhill', '2026-10-06T17:30:00.000Z', 'match-commence']);
  assert.deepEqual(r(a.sansRegleCompos), ['RECOMMENDED', null, 'williamhill', '2026-10-06T17:30:00.000Z', 'fraiche']);
  assert.deepEqual(r(a.delaiCourt), ['PASS', 'a_rafraichir', 'williamhill', '2026-10-06T17:30:00.000Z', 'trop-vieille']);
  assert.equal(a.memeChiffres, true, 'cotes justes et pronostics de marché identiques avec ou sans la fraîcheur');
  assert.deepEqual(a.candidats, [['home', 'williamhill', '2026-10-05T11:00:00.000Z', 'fraiche'], ['draw', 'williamhill', '2026-10-05T11:00:00.000Z', 'fraiche'], ['away', 'williamhill', '2026-10-05T11:00:00.000Z', 'fraiche']]);
  // La route de la page du match.
  assert.equal(a.route.code, 200);
  assert.deepEqual(a.route.staking, { action: 'RECOMMENDED', releveAt: '2026-10-05T11:00:00.000Z', fraicheur: 'fraiche' });
  assert.deepEqual([a.route.fraicheurCotes.reglage, a.route.fraicheurCotes.heureSure, a.route.fraicheurCotes.source, a.route.fraicheurCotes.parBookmaker.williamhill], [R, true, 'The Odds API (relevé manuel)', { releveAt: '2026-10-05T11:00:00.000Z', origine: 'archive' }]);
});

test('copie : le Repérage — la cote jouable porte l’heure lue dans l’archive, sa fraîcheur est jugée à la lecture (fraîche à midi, à rafraîchir à 14 h 30) ; rien pour un marché sans cote jouable', () => {
  const r = analyse().reperage;
  assert.deepEqual([r.status, r.error], ['ready', null]);
  assert.deepEqual([r.bestBookmakerKey, r.bestOddsAt, r.origine, r.freshness], ['williamhill', '2026-10-05T11:00:00.000Z', 'archive', 'fraiche']);
  assert.deepEqual(r.reglage, R);
  assert.equal(r.sansCoteJouable, null);
  assert.equal(analyse().reperageTard, 'trop-vieille');
});

// --------------------------------- 6. rien de payant tout seul, et le conseil

test('aucune route n’appelle The Odds API : toutes celles de l’étape 7 et les pages qui montrent vos cotes répondent sans un seul appel ; le seul chemin est POST /api/sources/odds/refresh, le bouton de Réglages', () => {
  const s = routes();
  for (const r of s.reponses) assert.equal(r.code, 200, `${r.methode} ${r.url} : ${r.erreur}`);
  assert.deepEqual(s.appelsApresLesRoutes, [], 'aucun appel au client payant');
  assert.equal(s.releve.appels, TRACKED_SPORT_KEYS.length, 'le bouton : une requête par compétition suivie');
  assert.equal(s.releve.cles, 37);
  assert.equal(s.releve.code, 500, 'l’espion ne répond pas : aucune cote, rien d’écrit');
  assert.equal(s.fichierBilan, false, 'un relevé entièrement en échec ne laisse pas de bilan');
  assert.deepEqual(s.routeur, [
    ['get', '/fixture'], ['get', '/status'], ['get', '/coverage'], ['post', '/refresh'], ['get', '/dropping'], ['get', '/closing-value'],
    ['get', '/fraicheur'], ['put', '/fraicheur'], ['get', '/conseil-releve'], ['get', '/saisies'], ['put', '/saisies'], ['put', '/saisies/retrait']
  ]);
});

test('le réglage de fraîcheur (Réglages) : enregistré dans data/runtime, rejoué sans rien réécrire, refusé hors bornes ou d’un autre type (400), un fichier illisible jamais pris pour vide — mis de côté au prochain enregistrement', () => {
  const r = routes().reglage;
  assert.deepEqual(r.r1, { code: 200, change: true, reglage: { maxAgeMinutes: 90, avantCompos: false }, source: 'enregistre' });
  assert.deepEqual(r.r2, { code: 200, change: false });
  assert.equal(r.inchange, true, 'le même réglage ne réécrit pas le fichier');
  assert.equal(r.refus.length, 6);
  for (const [code, erreur] of r.refus) {
    assert.equal(code, 400, erreur);
    assert.match(erreur, /maxAgeMinutes|avantCompos|Corps attendu/);
  }
  assert.match(r.refus[0][1], /entre 15 minutes et 24 heures/);
  assert.deepEqual(r.lu, { reglage: { maxAgeMinutes: 90, avantCompos: false }, source: 'enregistre', defaut: R, bornes: { min: 15, max: 1440 } });
  assert.deepEqual([r.illisible.source, r.illisible.reglage], ['illisible', R], 'illisible : la règle par défaut, et dit');
  assert.match(r.illisible.probleme, /fraicheur-cotes\.json illisible/);
  assert.deepEqual([r.apresIllisible.code, r.apresIllisible.change, r.apresIllisible.misDeCote], [200, true, 1]);
  assert.deepEqual({ maxAgeMinutes: r.apresIllisible.fichier.maxAgeMinutes, avantCompos: r.apresIllisible.fichier.avantCompos }, R);
  // Un réglage, pas une donnée : l'enregistrer n'annonce pas « nouvelles données » partout.
  assert.match(fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'repositories', 'dataVersionRepository.js'), 'utf8'), /SETTINGS_FILES = new Set\([^)]*'fraicheur-cotes\.json'/);
});

/** Les imports d'un fichier source (chemins relatifs résolus). */
function importsDe(fichier) {
  const source = fs.readFileSync(fichier, 'utf8');
  return [...source.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => (m[1].startsWith('.') ? path.resolve(path.dirname(fichier), m[1]) : m[1]));
}
const SRC = path.join(SERVEUR, 'src');
const tousLesFichiers = fs.readdirSync(SRC, { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => path.join(SRC, f));
const relatif = (f) => path.relative(SRC, f).split(path.sep).join('/');

test('aucun appel payant possible ailleurs (lecture du code) : seul liveDataSync importe le client payant, seul le contrôleur des sources l’appelle, sur une seule route POST ; aucune boucle n’y touche ; les modules de l’étape 7 n’importent rien de payant', () => {
  const importeurs = (cible) => tousLesFichiers.filter((f) => importsDe(f).includes(path.join(SRC, cible))).map(relatif).sort();
  assert.deepEqual(importeurs('data/providers/oddsApiClient.js'), ['data/providers/liveDataSync.js']);
  assert.deepEqual(importeurs('data/providers/liveDataSync.js'), ['api/controllers/sources.controller.js']);
  assert.deepEqual(importeurs('api/controllers/sources.controller.js'), ['api/routes/sources.routes.js']);
  const routesSources = fs.readFileSync(path.join(SRC, 'api', 'routes', 'sources.routes.js'), 'utf8');
  assert.deepEqual([...routesSources.matchAll(/router\.(\w+)\('([^']+)',\s*asyncHandler\((\w+)\)\)/g)].filter((m) => m[3] === 'postRefreshOdds').map((m) => [m[1], m[2]]), [['post', '/odds/refresh']]);
  const appelants = tousLesFichiers.filter((f) => /\brefreshLiveOdds\s*\(/.test(fs.readFileSync(f, 'utf8'))).map(relatif).sort();
  assert.deepEqual(appelants, ['api/controllers/sources.controller.js', 'data/providers/liveDataSync.js']);
  // Les boucles et le démarrage n'importent ni le relevé payant ni son contrôleur.
  for (const f of tousLesFichiers.filter((x) => /[\\/]jobs[\\/]/.test(x) || /server\.js$|app\.js$/.test(x))) {
    for (const i of importsDe(f)) assert.doesNotMatch(i, /liveDataSync|oddsApiClient|sources\.controller/, `${relatif(f)} importe ${i}`);
  }
  // Les modules de l'étape 7 : ni payant, ni Claude, ni réseau, ni minuterie.
  const ETAPE7 = ['core/engine/fraicheurCotes.js', 'data/cotesDeVosBookmakers.js', 'data/saisiesCotes.js', 'data/conseilReleve.js', 'data/repositories/relevePayantRepository.js', 'data/repositories/fraicheurCotesRepository.js', 'data/providers/oddsApiCompetitions.js', 'api/controllers/cotesVosBookmakers.controller.js'];
  for (const rel of ETAPE7) {
    const fichier = path.join(SRC, rel);
    for (const i of importsDe(fichier)) {
      assert.doesNotMatch(i, /oddsApiClient|liveDataSync|apiFootballClient|sportMonksClient|flashscoreClient|teamStatsService|claudeCodeClient|anthropicClient|aiAnalysisService|matchAiAnalysisService|webLookupService|node:(http|https|net|tls|dns|child_process)/, `${rel} importe ${i}`);
    }
    const source = fs.readFileSync(fichier, 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(|setInterval\s*\(|setTimeout\s*\(/, `${rel} : un appel réseau ou une minuterie`);
  }
  // Le moteur de la saisie tourne sans repli payant.
  assert.match(fs.readFileSync(path.join(SRC, 'data', 'saisiesCotes.js'), 'utf8'), /enrichMatchWithRealAverages\(match, \{ sansRepliPayant: true \}\)/);
});

test('le relevé payant (bouton de Réglages) garde son bilan : crédits restants et consommés, coût de chaque requête, matchs par compétition ; le conseil de relevé le lit ; un coût non communiqué reste inconnu, jamais 0', () => {
  const s = releve();
  assert.equal(s.reponse.code, 200);
  assert.equal(s.appels, 37);
  assert.deepEqual([s.bilan.version, s.bilan.at, s.bilan.clesDemandees, s.bilan.clesRelevees.length, s.bilan.matchs], [1, '2026-10-05T12:00:00.000Z', 37, 36, 2]);
  assert.deepEqual(s.bilan.echecs, [{ sportKey: 'soccer_spl', message: 'The Odds API a répondu 404 : compétition inconnue' }]);
  assert.deepEqual(s.bilan.quota, { restants: 378, utilises: 122 });
  assert.equal(s.bilan.cout, 2, 'deux requêtes avec des matchs, à 1 crédit ; les autres à 0 (en-tête x-requests-last)');
  assert.deepEqual([s.bilan.matchsParCle.soccer_epl, s.bilan.matchsParCle.soccer_spain_la_liga, s.bilan.matchsParCle.soccer_spl, s.bilan.matchsParCle.soccer_italy_serie_a], [1, 1, null, 0]);
  assert.equal(s.reponse.corps.cout, 2);
  const c = s.conseil.credits;
  assert.deepEqual([c.parReleve, c.competitions, c.restants, c.utilises, c.dernierCout, c.apres, c.relevesPossibles, c.suffisants, c.forfait, c.source], [37, 37, 378, 122, 2, 341, 10, true, 500, 'enregistre']);
  assert.equal(s.conseil.appelsApres, 37, 'lire le conseil n’appelle rien');
  assert.deepEqual(s.secondCout, { code: 200, cout: null, fichier: null, restants: 376 });
  assert.deepEqual([s.conseilIllisible.code, s.conseilIllisible.source, s.conseilIllisible.restants], [200, 'illisible', null]);
  assert.match(s.conseilIllisible.probleme, /releve-payant\.json illisible/);
});

test('le bilan d’un relevé (fonction pure) : dernier quota connu, coût seulement si chaque réponse le donne', () => {
  const b = bilanDuReleve({
    at: '2026-10-05T12:00:00.000Z',
    reponses: [
      { sportKey: 'a', ok: true, matchs: 3, quota: { remaining: 99, used: 1, last: 1 } },
      { sportKey: 'b', ok: false, matchs: 0, quota: null, message: 'panne réseau' },
      { sportKey: 'c', ok: true, matchs: 0, quota: { remaining: 99, used: 1, last: 0 } }
    ]
  });
  assert.deepEqual([b.clesDemandees, b.clesRelevees, b.matchs, b.quota, b.cout, b.coutParCle, b.matchsParCle], [3, ['a', 'c'], 3, { restants: 99, utilises: 1 }, null, { a: 1, b: null, c: 0 }, { a: 3, b: null, c: 0 }]);
  assert.equal(bilanDuReleve({ at: 'x', reponses: [] }).cout, null);
  assert.deepEqual(bilanDuReleve({ at: 'x', reponses: [{ sportKey: 'a', ok: true, matchs: 1, quota: { remaining: 10, used: 5, last: 1 } }] }).quota, { restants: 10, utilises: 5 });
});

test('les compétitions suivies : 37 clés (et non 18 : dix-neuf ajoutées le 21/09), chacune avec le nom que la page Matchs lui donne, présent dans le calendrier FotMob de l’appli', () => {
  assert.equal(TRACKED_SPORT_KEYS.length, 37);
  assert.equal(new Set(TRACKED_SPORT_KEYS).size, 37);
  assert.deepEqual(Object.keys(NOMS_DES_CLES).sort(), [...TRACKED_SPORT_KEYS].sort());
  for (const [cle, nom] of Object.entries(NOMS_DES_CLES)) assert.ok(nom in FOTMOB_LEAGUES, `${cle} : « ${nom} » n'est pas un nom du calendrier`);
  assert.equal(NOMS_DES_CLES.soccer_epl, 'EPL');
  assert.equal(NOMS_DES_CLES.soccer_usa_mls, 'MLS');
});

/** Un match du conseil. */
const proche = (extra) => ({ matchId: 'm', home: 'Man City', away: 'Liverpool', league: 'EPL', coupDEnvoi: '2026-10-05T19:00:00Z', heureSure: true, vosCotes: true, releveAt: '2026-10-05T11:00:00Z', compos: null, ...extra });
const BILAN = { source: 'enregistre', fichier: 'C:\\essai\\releve-payant.json', bilan: { at: '2026-10-05T09:00:00.000Z', quota: { restants: 300, utilises: 200 }, cout: 18, matchsParCle: { soccer_epl: 10, soccer_spl: 0 } } };

test('conseil de relevé : compositions annoncées et cotes d’avant — « maintenant », avec les championnats concernés, les crédits et le bouton', () => {
  const c = conseilDeReleve({
    maintenant: t('2026-10-05T18:15:00Z'),
    matchs: [proche({ compos: { publiee: true, lueA: '2026-10-05T18:02:00Z' } }), proche({ matchId: 'm2', home: 'Arsenal', away: 'Chelsea', coupDEnvoi: '2026-10-05T19:00:00Z', vosCotes: false }), proche({ matchId: 'm3', league: 'La Liga - Spain', home: 'Betis', away: 'Sevilla', coupDEnvoi: '2026-10-05T21:00:00Z' })],
    reglage: R,
    dernierReleve: BILAN
  });
  assert.equal(c.conseil, 'maintenant');
  assert.equal(c.titre, 'Relevé conseillé maintenant');
  assert.deepEqual(c.matchs.map((m) => [m.matchId, m.cotes]), [['m', 'a-rafraichir'], ['m2', 'absentes']], 'le match de 21 h attend ses propres compositions');
  assert.deepEqual(c.championnats, [{ cle: 'soccer_epl', nom: 'EPL', matchs: 2, premierCoupDEnvoi: '2026-10-05T19:00:00.000Z', composPubliees: 1 }]);
  assert.equal(c.resume, 'Relevé conseillé maintenant : 1 championnat, 37 crédits au plus, maintenant (compositions publiées).');
  assert.match(c.raison, /^Compositions annoncées pour 2 matchs \(EPL\), coup d'envoi d'ici 21 h 00 : vos cotes y datent d’avant cette annonce ou sont à rafraîchir\. FotMob les a déjà publiées pour 1 match\.$/);
  assert.deepEqual([c.credits.parReleve, c.credits.restants, c.credits.apres, c.credits.relevesPossibles, c.credits.suffisants, c.credits.dernierCout], [37, 300, 263, 8, true, 18]);
  assert.deepEqual(c.bouton, { ou: 'Réglages › Données › Cotes marché (The Odds API) › « Actualiser »', automatique: false, texte: "Rien ne part tout seul : le relevé ne se fait que si vous cliquez « Actualiser »." });
});

test('conseil de relevé : sinon « vers 18 h 00 », à l’annonce des compositions du prochain match qui en aura besoin (ceux de la même demi-heure ensemble) ; cotes relevées après les compositions, hors saison, rien de proche : « pas de relevé »', () => {
  const plusTard = conseilDeReleve({
    maintenant: t('2026-10-05T12:00:00Z'),
    matchs: [proche({ coupDEnvoi: '2026-10-05T17:00:00Z' }), proche({ matchId: 'm2', coupDEnvoi: '2026-10-05T17:20:00Z' }), proche({ matchId: 'm3', coupDEnvoi: '2026-10-05T19:30:00Z' })],
    reglage: R,
    dernierReleve: BILAN
  });
  assert.deepEqual([plusTard.conseil, plusTard.moment.a, plusTard.titre], ['plus-tard', '2026-10-05T16:00:00.000Z', 'Relevé conseillé vers 18 h 00']);
  assert.deepEqual(plusTard.matchs.map((m) => m.matchId), ['m', 'm2'], 'annoncés à 16 h et 16 h 20 : le même relevé ; 18 h 30 attendra');
  assert.deepEqual(plusTard.matchs.map((m) => m.cotes), ['avant-compos', 'avant-compos'], 'fraîches à midi, mais relevées avant l’annonce');
  // Relevées après l'annonce : rien à faire.
  const fraiches = conseilDeReleve({ maintenant: t('2026-10-05T18:30:00Z'), matchs: [proche({ releveAt: '2026-10-05T18:10:00Z' })], reglage: R, dernierReleve: BILAN });
  assert.equal(fraiches.conseil, 'inutile');
  assert.match(fraiches.raison, /1 match proche a déjà des cotes fraîches, relevées après les compositions\./);
  // Un championnat qui n'a rendu aucun match au dernier relevé (hors saison chez The Odds API) : mis à part.
  const horsSaison = conseilDeReleve({ maintenant: t('2026-10-05T18:30:00Z'), matchs: [proche({ league: 'Premiership - Scotland' })], reglage: R, dernierReleve: BILAN });
  assert.equal(horsSaison.conseil, 'inutile');
  assert.match(horsSaison.raison, /hors saison chez The Odds API/);
  // Un championnat que The Odds API ne suit pas : ignoré ; rien de proche : dit.
  const rien = conseilDeReleve({ maintenant: t('2026-10-05T12:00:00Z'), matchs: [proche({ league: 'Virsliga - Latvia' }), proche({ coupDEnvoi: '2026-10-07T19:00:00Z' })], reglage: R, dernierReleve: BILAN });
  assert.deepEqual([rien.conseil, rien.proches], ['inutile', 0]);
  assert.match(rien.raison, /Aucun match de vos 37 compétitions suivies chez The Odds API dans les 24 prochaines heures\./);
  // Sans la règle des compositions, une cote fraîche le reste jusqu'au coup d'envoi.
  assert.equal(conseilDeReleve({ maintenant: t('2026-10-05T18:15:00Z'), matchs: [proche({ releveAt: '2026-10-05T17:00:00Z' })], reglage: { maxAgeMinutes: 180, avantCompos: false }, dernierReleve: BILAN }).conseil, 'inutile');
});

test('conseil de relevé : crédits inconnus tant qu’aucun relevé n’a laissé de bilan — jamais un chiffre deviné ; pas assez de crédits : dit', () => {
  const sans = conseilDeReleve({ maintenant: t('2026-10-05T18:15:00Z'), matchs: [proche()], reglage: R, dernierReleve: { source: 'absent', fichier: 'C:\\essai\\releve-payant.json', bilan: null } });
  assert.deepEqual([sans.credits.restants, sans.credits.apres, sans.credits.relevesPossibles, sans.credits.suffisants, sans.credits.dernierCout, sans.credits.source], [null, null, null, null, null, 'absent']);
  const peu = conseilDeReleve({ maintenant: t('2026-10-05T18:15:00Z'), matchs: [proche()], reglage: R, dernierReleve: { ...BILAN, bilan: { ...BILAN.bilan, quota: { restants: 20, utilises: 480 } } } });
  assert.deepEqual([peu.credits.restants, peu.credits.apres, peu.credits.relevesPossibles, peu.credits.suffisants], [20, -17, 0, false]);
});

test('conseil de relevé dans une copie : la page Matchs, l’heure de vos cotes dans l’archive, les compositions déjà lues (sans requête), le bilan du dernier relevé — et la route en lecture seule', () => {
  const s = conseil();
  const c = s.conseil;
  assert.deepEqual([c.conseil, c.titre], ['maintenant', 'Relevé conseillé maintenant']);
  assert.deepEqual(c.matchs.map((m) => [m.matchId, m.cotes, m.releveAt, m.compos]), [['essai-city-liverpool', 'a-rafraichir', '2026-10-05T10:00:00.000Z', { publiee: true, lueA: '2026-10-05T11:45:00.000Z' }]]);
  assert.deepEqual(c.championnats, [{ cle: 'soccer_epl', nom: 'EPL', matchs: 1, premierCoupDEnvoi: '2026-10-05T12:40:00.000Z', composPubliees: 1 }]);
  assert.deepEqual([c.credits.restants, c.credits.dernierCout, c.credits.apres], [300, 18, 263]);
  assert.deepEqual(s.route, { code: 200, conseil: 'maintenant', titre: 'Relevé conseillé maintenant' });
});
