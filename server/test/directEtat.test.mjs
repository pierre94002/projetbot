/**
 * Étape 46 du plan (« Prédiction en direct »), lot 1, partie A — T-E1 à T-E10 : le LIBELLÉ, l'ÉTAT et la MÉMOIRE d'un
 * match en direct (libelleDuDirect.js, etatDuDirect.js, memoireDuDirect.js), avec les corrections de la critique du
 * 11/11 : R4 (une copie de la liste n'est pas une observation), R5 (le score de la 90e), R6 (la table croisée avec la
 * durée max, sur les libellés RÉELS relevés par l'étape 0), R34 (la table des créneaux écrite dans l'état, tenue égale à
 * `creneauDe` importé ICI seulement). Correctif K1 (13/11, constat 1 du calcul) : T-E7 — en désaccord, la source dont le
 * compte a changé le plus récemment (à égalité, le détail) ; un rouge que la liste publie pour UN SEUL camp (8 scénarios).
 *   node --test test/directEtat.test.mjs        (depuis server/)
 * Modules purs : aucune copie de travail, aucune base, aucun réseau. Les caractères invisibles sont FABRIQUÉS par
 * String.fromCharCode (piège des suites d'échappement réécrites par les outils).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nettoyerLibelle, lireLibelle, patronDuLibelle, estApresProlongation, TYPES_DE_LIBELLE } from '../src/data/direct/libelleDuDirect.js';
import {
  creneauDeLaMinute,
  partDuTempsAdditionnel,
  placer,
  phaseDuReleve,
  prouveLaProlongation,
  rougesRetenus,
  etatDuMatch,
  etatDepuisInstantane,
  PHASES,
  PHASES_CALCULEES
} from '../src/data/direct/etatDuDirect.js';
import { suivre, memoireVide, VERSION_MEMOIRE } from '../src/data/direct/memoireDuDirect.js';
import {
  RESTE_ADDITIONNEL,
  PART_PAR_DEFAUT,
  AMBRE_ETAT_MS,
  PERIME_APRES_MS,
  FIGE_APRES_MS,
  ROUGES_AMBRE_MS,
  SCORE90_ECART_MAX_MS
} from '../src/data/direct/reglagesDirect.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ICI, '..', 'src');
const C = (n) => String.fromCharCode(n);
const LRM = C(0x200e);
const RSQ = C(0x2019);
const NBSP = C(0xa0);
/** La minute telle que FotMob l'écrit (étape 0) : chiffres, LRM, apostrophe typographique, LRM. */
const fm = (m) => `${m}${LRM}${RSQ}${LRM}`;
const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 10, 14, 19, 0, 0);

// ------------------------------------------------------------ T-E1 : le libellé

test('T-E1 le libellé FotMob : LRM en tête, en queue, des deux côtés, espace insécable → « 34’ » est la minute 34, « HT » la mi-temps ; aucun octet hors ASCII ni « barre + u » dans libelleDuDirect.js', () => {
  for (const f of [`${LRM}34${RSQ}`, `34${RSQ}${LRM}`, `${LRM}34${LRM}${RSQ}${LRM}`, fm(34), `${NBSP}34${RSQ}${NBSP}`, `${LRM}${NBSP}34${C(0x2032)}`, `34'`, `34`, `${LRM}34${LRM}`]) {
    const l = lireLibelle(f);
    assert.deepEqual([l.type, l.minute, l.ajout], ['minute', 34, null], JSON.stringify(f));
  }
  for (const f of [`${LRM}HT`, `HT${LRM}`, `${LRM}HT${LRM}`, `${NBSP}HT${NBSP}`, 'ht', 'Half-time', 'Mi-temps']) assert.equal(lireLibelle(f).type, 'mi-temps', JSON.stringify(f));
  assert.deepEqual(lireLibelle(`${LRM}45+2${RSQ}${LRM}`), { type: 'minute', minute: 45, ajout: 2, texte: "45+2'" });
  assert.deepEqual(lireLibelle(`90 + 3${RSQ}`), { type: 'minute', minute: 90, ajout: 3, texte: "90 + 3'" });
  assert.equal(nettoyerLibelle(fm(34)), "34'");
  assert.equal(nettoyerLibelle(`${C(0xfeff)}${C(0x200b)}Pen${C(0x2069)}`), 'Pen');
  assert.equal(nettoyerLibelle(null), '');
  assert.equal(nettoyerLibelle(nettoyerLibelle(fm(77))), nettoyerLibelle(fm(77)), 'nettoyage idempotent');
  assert.deepEqual(lireLibelle(null), { type: 'absent', minute: null, ajout: null, texte: null });
  assert.deepEqual(lireLibelle(`${LRM}${LRM}`), { type: 'absent', minute: null, ajout: null, texte: null });
  assert.equal(patronDuLibelle(fm(93)), "99'");
  assert.equal(estApresProlongation(`${LRM}AET`), true);
  assert.equal(estApresProlongation('ET'), false);
  assert.ok(TYPES_DE_LIBELLE.includes('interrompu') && TYPES_DE_LIBELLE.includes('inconnu'));
  const octets = fs.readFileSync(path.join(SRC, 'data', 'direct', 'libelleDuDirect.js'));
  let hors = 0;
  let barreU = 0;
  for (let i = 0; i < octets.length; i++) {
    if (octets[i] > 127) hors++;
    if (octets[i] === 92 && octets[i + 1] === 117) barreU++;
  }
  assert.equal(hors, 0, 'libelleDuDirect.js : aucun octet hors ASCII');
  assert.equal(barreU, 0, 'libelleDuDirect.js : aucune suite « barre oblique inverse + u »');
});

/** Les patrons RÉELS de l'étape 0 (fixture recopiée de banc46\libelles.txt) : les exemples extrêmes, relus depuis leur hex. */
function patronsReels() {
  const texte = fs.readFileSync(path.join(ICI, 'fixtures', 'direct-libelles.txt'), 'utf8').split(/\r?\n/);
  const debut = texte.findIndex((l) => l.startsWith('statut | patron | type lu'));
  assert.ok(debut > 0, 'fixture : la table des patrons');
  const lignes = [];
  for (let i = debut + 1; i < texte.length && texte[i].trim(); i++) {
    const col = texte[i].split(' | ');
    assert.equal(col.length, 7, texte[i]);
    const hexDe = (c) => (c.match(/\(([0-9A-F]*)\)\s*$/) ?? [])[1] ?? '';
    const exemples = [hexDe(col[5]), hexDe(col[6])].filter(Boolean).map((h) => Buffer.from(h, 'hex').toString('utf8'));
    lignes.push({ statut: col[0], patron: col[1], n: Number(col[3]), exemples });
  }
  return lignes;
}

test('T-E1 (R6 point 1a) les libellés RÉELS de l’étape 0 (28 136 instantanés, fixture) : aucun n’est « inconnu » ; IR → interrompu, PET → prolongation, Pen → tirs au but, ET → prolongation, « 90 » sans apostrophe → minute 90', () => {
  const lignes = patronsReels();
  assert.equal(lignes.length, 12, 'douze patrons relevés');
  const attendu = { "99'": 'minute', "9'": 'minute', "999'": 'minute', Pen: 'tirs-au-but', IR: 'interrompu', ET: 'prolongation', PET: 'prolongation', 99: 'minute', HT: 'mi-temps' };
  let vus = 0;
  for (const l of lignes) {
    for (const ex of l.exemples) {
      const lu = lireLibelle(ex);
      assert.notEqual(lu.type, 'inconnu', `${l.statut} « ${l.patron} » : ${JSON.stringify(ex)}`);
      assert.equal(lu.type, attendu[l.patron], `${l.statut} « ${l.patron} »`);
      assert.equal(patronDuLibelle(ex), l.patron, 'le patron se refait');
      if (lu.type === 'minute') assert.equal(lu.minute, Number(nettoyerLibelle(ex).replace(/'/g, '')), JSON.stringify(ex));
      vus++;
    }
  }
  assert.ok(vus >= 18, `${vus} exemples relus`);
  assert.deepEqual(lireLibelle('90'), { type: 'minute', minute: 90, ajout: null, texte: '90' });
});

// ------------------------------------------------------------ T-E2 : la table des créneaux (R34)

test('T-E2 la table des créneaux : 1 → 0 ; 45 → 44 ; 45+2 → 45 ; mi-temps → 46 part 0 ; 46 → 46 ; 90 → 90 ; 90+3 → 91 ; pour toute minute 0..130 et tout ajout 0..25, creneauDeLaMinute = creneauDe de simulationNuit.js (importé dans le TEST seulement)', async () => {
  const { creneauDe } = await import('../src/data/simulation/simulationNuit.js');
  for (let m = 0; m <= 130; m++) {
    for (let a = 0; a <= 25; a++) assert.equal(creneauDeLaMinute(m, a), creneauDe(m, a), `${m}+${a}`);
    assert.equal(creneauDeLaMinute(m), creneauDe(m), `${m}`);
    assert.equal(creneauDeLaMinute(m, null), creneauDe(m, null), `${m} (ajout null)`);
  }
  const p = (liveLabel, extra = {}, drapeaux = {}) => phaseDuReleve({ liste: { liveLabel, ...extra }, drapeaux });
  const cas = [
    [p(fm(1)), 'jeu', 0, PART_PAR_DEFAUT],
    [p(fm(45)), 'jeu', 44, PART_PAR_DEFAUT],
    [p(`45+2${RSQ}`), 'jeu', 45, 1 - RESTE_ADDITIONNEL.reste45[2]],
    [p('HT'), 'mi-temps', 46, 0],
    [p(null, { halfTime: true }), 'mi-temps', 46, 0],
    [p(fm(46), { liveMaxTime: 90 }), 'jeu', 46, PART_PAR_DEFAUT],
    [p(fm(46), {}, { pauseVueA: T0 }), 'jeu', 46, PART_PAR_DEFAUT],
    [p(fm(90)), 'jeu', 90, PART_PAR_DEFAUT],
    [p('90'), 'jeu', 90, PART_PAR_DEFAUT],
    [p(`90+3${RSQ}`), 'jeu', 91, 1 - RESTE_ADDITIONNEL.reste91[3]],
    [p(fm(0)), 'jeu', 0, 0]
  ];
  for (const [r, phase, creneau, part] of cas) {
    assert.equal(r.phase, phase, JSON.stringify(r));
    assert.equal(r.creneau, creneau, JSON.stringify(r));
    assert.ok(Math.abs(r.part - part) < 1e-15, JSON.stringify(r));
  }
});

// ------------------------------------------------------------ T-E3 : la part jouée ; R6 : la table croisée

test('T-E3 la part jouée : 0,5 en minute ordinaire ; 1 − reste[x] dans le temps additionnel, x plafonné à X ; toujours dans [0 ; 1] (table fabriquée hors bornes comprise)', () => {
  assert.equal(placer(30, null, 90).part, 0.5);
  assert.equal(placer(77, null, 90).part, 0.5);
  for (const [k, reste, X] of [[45, RESTE_ADDITIONNEL.reste45, RESTE_ADDITIONNEL.X45], [91, RESTE_ADDITIONNEL.reste91, RESTE_ADDITIONNEL.X91]]) {
    assert.ok(X >= 3, `X du créneau ${k}`);
    let avant = -1;
    for (let x = 1; x <= 25; x++) {
      const part = partDuTempsAdditionnel(k, x);
      assert.ok(Math.abs(part - (1 - reste[Math.min(x, X)])) < 1e-15, `${k}, ajout ${x}`);
      assert.ok(part >= 0 && part <= 1, `${k}, ajout ${x} : ${part}`);
      assert.ok(part >= avant, `${k} : la part ne baisse jamais quand l’ajout monte`);
      avant = part;
    }
  }
  const fabriquee = { X45: 2, X91: 2, reste45: [null, 1.3, -0.2], reste91: [null, Number.NaN, 0.5] };
  assert.equal(partDuTempsAdditionnel(45, 1, fabriquee), 0, 'reste > 1 → part 0');
  assert.equal(partDuTempsAdditionnel(45, 2, fabriquee), 1, 'reste < 0 → part 1');
  assert.equal(partDuTempsAdditionnel(91, 1, fabriquee), PART_PAR_DEFAUT, 'reste illisible → 0,5');
  assert.equal(partDuTempsAdditionnel(91, 7, fabriquee), 0.5, 'x plafonné à X');
  assert.equal(partDuTempsAdditionnel(91, 3, null), PART_PAR_DEFAUT, 'sans table → 0,5');
});

test('R6 point 2 — la table croisée avec la durée max (arrêts de jeu en MINUTES PLEINES, relevé de l’étape 0) : 47’ est la 1re mi-temps en durée 45, la 47e en durée 90 ou après la pause ; 93’ est le 90+3 en durée 90, « minute inconnue » sans durée ; au-delà de 105 (ou 60) : hors limites', () => {
  const r45 = placer(47, null, 45);
  assert.deepEqual([r45.phase, r45.creneau, r45.ajout], ['jeu', 45, 2]);
  assert.ok(Math.abs(r45.part - (1 - RESTE_ADDITIONNEL.reste45[2])) < 1e-15);
  assert.deepEqual([placer(60, null, 45).creneau, placer(61, null, 45).raison], [45, 'hors-limites']);
  assert.equal(placer(47, null, 90).creneau, 47);
  assert.equal(placer(47, null, null, { pauseVue: true }).creneau, 47);
  assert.deepEqual([placer(47, null, null).phase, placer(47, null, null).raison], ['minute-inconnue', 'sans-duree-max']);
  assert.equal(placer(61, null, null).creneau, 61, 'au-delà de 60, la 2e mi-temps sans doute possible');
  const r90 = placer(93, null, 90);
  assert.deepEqual([r90.phase, r90.creneau, r90.ajout], ['jeu', 91, 3]);
  assert.ok(Math.abs(r90.part - (1 - RESTE_ADDITIONNEL.reste91[3])) < 1e-15);
  assert.equal(placer(105, null, 90).creneau, 91);
  assert.deepEqual([placer(106, null, 90).phase, placer(106, null, 90).raison], ['minute-inconnue', 'hors-limites']);
  assert.deepEqual([placer(186, null, 90).raison, placer(93, null, null).raison], ['hors-limites', 'sans-duree-max']);
  assert.equal(placer(93, null, 120).raison, 'hors-limites', 'durée 120 : la prolongation se décide avant placer()');
  assert.deepEqual([placer(30, 2, 90).phase, placer(30, 2, 90).raison], ['minute-inconnue', 'ajout-inattendu']);
  assert.equal(placer(null, null, 90).raison, 'sans-minute');
  assert.equal(placer(-3, null, 90).raison, 'sans-minute');
});

// ------------------------------------------------------------ T-E4 à T-E6 : les phases

test('T-E4 la prolongation par chacune de ses preuves (durée max 120, « ET », « AET », drapeau collant), JAMAIS par une minute > 90 seule (R5 point 3) ; tirs au but ; « fin » avant `finished` ; aucun créneau rendu', () => {
  const p = (liste, drapeaux = {}) => phaseDuReleve({ liste, drapeaux });
  for (const r of [p({ liveLabel: fm(97), liveMaxTime: 120 }), p({ liveLabel: 'ET', liveMaxTime: 90 }), p({ liveLabel: `${LRM}AET` }), p({ liveLabel: fm(97) }, { prolongationVueA: T0 }), p({ liveLabel: 'HT' }, { prolongationVueA: T0 })]) {
    assert.equal(r.phase, 'prolongation', JSON.stringify(r));
    assert.equal(r.creneau, null);
  }
  assert.deepEqual([p({ liveLabel: fm(97), liveMaxTime: 90 }).phase, p({ liveLabel: fm(97), liveMaxTime: 90 }).creneau], ['jeu', 91]);
  assert.equal(p({ liveLabel: fm(97) }).phase, 'minute-inconnue');
  assert.equal(prouveLaProlongation({ liveMaxTime: 120 }), true);
  assert.equal(prouveLaProlongation({ liveLabel: 'ET' }), true);
  assert.equal(prouveLaProlongation({ liveLabel: fm(97), liveMaxTime: 90 }), false);
  assert.equal(prouveLaProlongation({ liveLabel: fm(118) }), false);
  assert.equal(p({ liveLabel: 'Pen' }).phase, 'tirs-au-but');
  assert.equal(p({ liveLabel: fm(120), liveMaxTime: 120 }, { tirsAuButVusA: T0 }).phase, 'tirs-au-but');
  assert.equal(p({ liveLabel: 'FT', finished: false }).phase, 'fin-90');
  assert.equal(p({ liveLabel: 'FT', finished: true }).phase, 'termine');
  for (const ph of ['prolongation', 'tirs-au-but', 'fin-90', 'termine']) assert.ok(!PHASES_CALCULEES.includes(ph), `${ph} : aucun calcul`);
  assert.deepEqual(PHASES_CALCULEES, ['jeu', 'mi-temps']);
});

test('T-E5 la minute sans libellé : `liveMinute` → minuteSource « chrono » ; durée max 45 et minute 47 → créneau 45 ; minute 93 sans durée max → minute inconnue ; ni libellé ni minute → minute inconnue', () => {
  const p = (liste) => phaseDuReleve({ liste });
  const a = p({ liveLabel: null, liveMinute: 33, liveMaxTime: 45 });
  assert.deepEqual([a.phase, a.creneau, a.minuteSource], ['jeu', 32, 'chrono']);
  const b = p({ liveLabel: '', liveMinute: 47, liveMaxTime: 45 });
  assert.deepEqual([b.phase, b.creneau, b.ajout, b.minuteSource], ['jeu', 45, 2, 'chrono']);
  const c = p({ liveLabel: null, liveMinute: 93 });
  assert.deepEqual([c.phase, c.raison], ['minute-inconnue', 'sans-duree-max']);
  const d = p({ liveLabel: null, liveMinute: 90, liveAddedTime: 3 });
  assert.deepEqual([d.creneau, d.ajout, d.minuteSource], [91, 3, 'chrono']);
  const e = p({ liveLabel: null, liveMinute: null });
  assert.deepEqual([e.phase, e.raison], ['minute-inconnue', 'sans-minute']);
  assert.equal(p({ liveLabel: fm(12), liveMinute: 99 }).minuteSource, 'libelle', 'le libellé prime sur le chrono');
  assert.equal(p({ liveLabel: fm(12), liveMinute: 99 }).creneau, 11);
});

test('T-E6 libellé inconnu gardé tel quel ; interrompu (IR, Susp.) ; attribué, arrêté, pas commencé, sans relevé : aucun calcul', () => {
  const p = (liste) => phaseDuReleve({ liste });
  const inconnu = p({ liveLabel: `${LRM}Abc 7${LRM}` });
  assert.deepEqual([inconnu.phase, inconnu.libelle.texte, inconnu.libelle.type, inconnu.creneau], ['libelle-inconnu', 'Abc 7', 'inconnu', null]);
  assert.equal(p({ liveLabel: 'IR' }).phase, 'interrompu');
  assert.equal(p({ liveLabel: 'Susp.' }).phase, 'interrompu');
  assert.equal(p({ liveLabel: fm(50), awarded: true }).phase, 'attribue');
  assert.equal(p({ liveLabel: fm(50), cancelled: true }).phase, 'arrete');
  assert.equal(p({ liveLabel: null, started: false }).phase, 'avant');
  assert.equal(phaseDuReleve({ liste: null }).phase, 'sans-releve');
  for (const ph of ['libelle-inconnu', 'interrompu', 'attribue', 'arrete', 'avant', 'sans-releve', 'minute-inconnue']) assert.ok(PHASES.includes(ph) && !PHASES_CALCULEES.includes(ph));
  const e = etatDuMatch({ match: { liste: { liveLabel: fm(50), awarded: true, homeGoals: 3, awayGoals: 0 }, memoire: null }, maintenant: T0 });
  assert.deepEqual([e.phase, e.calculable, e.depart, e.fin.awarded], ['attribue', false, null, true]);
});

// ------------------------------------------------------------ T-E7 : les rouges (§ 2.7, R2, R3)

test('T-E7 les quatre règles des rouges : inconnus jamais 0 ; en désaccord, la source dont le COMPTE a changé le plus récemment (à égalité, le détail — K1) ; la baisse du compte suivie (jamais un maximum)', () => {
  const inconnus = rougesRetenus({ maintenant: T0 });
  assert.deepEqual([inconnus.connus, inconnus.home, inconnus.away, inconnus.phrase], [false, null, null, 'pas-encore-lus']);
  assert.equal(rougesRetenus({ detailLu: true, maintenant: T0 }).phrase, 'non-publies');
  const liste = { home: 0, away: 0, vuA: T0 + 5 * MIN, depuisA: T0 };
  const detail = { home: 1, away: 0, vuA: T0, depuisA: T0 };
  // À égalité (les deux comptes vus pour la première fois au même tour) : le détail.
  const frais = rougesRetenus({ rougesListe: liste, rougesDetail: detail, maintenant: T0 + 5 * MIN });
  assert.deepEqual([frais.source, frais.home, frais.desaccord], ['detail', 1, true]);
  // Correctif K1 (13/11, constat 1 du calcul ; la conception § 2.7 amendée) : en désaccord, la source dont le COMPTE a changé
  // le plus récemment l'emporte — plus « le détail s'il a moins de 6 minutes » (ROUGES_DETAIL_PRIME_MS : retirée le 13/11 (K10),
  // plus lue depuis K1).
  const listeRecente = rougesRetenus({ rougesListe: { home: 1, away: 0, vuA: T0 + 2 * MIN, depuisA: T0 + 2 * MIN }, rougesDetail: { home: 0, away: 0, vuA: T0, depuisA: T0 }, maintenant: T0 + 2 * MIN });
  assert.deepEqual([listeRecente.source, listeRecente.home, listeRecente.desaccord], ['liste', 1, true]);
  const detailRecent = rougesRetenus({ rougesListe: { home: 1, away: 0, vuA: T0 + 6 * MIN, depuisA: T0 + 2 * MIN }, rougesDetail: { home: 2, away: 0, vuA: T0 + 5 * MIN, depuisA: T0 + 5 * MIN }, maintenant: T0 + 6 * MIN });
  assert.deepEqual([detailRecent.source, detailRecent.home, detailRecent.desaccord], ['detail', 2, true]);
  // Jamais un maximum : le détail, plus récent, dit 0-0 contre une liste plus ancienne à 1-0 (un rouge annulé) → 0-0.
  const annule = rougesRetenus({ rougesListe: { home: 1, away: 0, vuA: T0 + 6 * MIN, depuisA: T0 + 2 * MIN }, rougesDetail: { home: 0, away: 0, vuA: T0 + 5 * MIN, depuisA: T0 + 5 * MIN }, maintenant: T0 + 6 * MIN });
  assert.deepEqual([annule.source, annule.home, annule.away, annule.desaccord], ['detail', 0, 0, true]);
  const egaux = rougesRetenus({ rougesListe: { home: 1, away: 0, vuA: T0 + 2 * MIN }, rougesDetail: { home: 1, away: 0, vuA: T0 + MIN }, maintenant: T0 + 2 * MIN });
  assert.deepEqual([egaux.source, egaux.desaccord], ['liste', false]);
  // La baisse suivie : un rouge annulé (détail 1 puis 0) — le dernier compte fait foi.
  let m = suivre(null, { liste: { liveLabel: fm(30), homeGoals: 0, awayGoals: 0 }, detail: { liveLabel: fm(30), homeGoals: 0, awayGoals: 0, homeRedCards: 1, awayRedCards: 0 }, maintenant: T0 });
  m = suivre(m, { liste: { liveLabel: fm(35), homeGoals: 0, awayGoals: 0 }, detail: { liveLabel: fm(35), homeGoals: 0, awayGoals: 0, homeRedCards: 0, awayRedCards: 0 }, maintenant: T0 + 5 * MIN });
  const e = etatDuMatch({ match: { liste: { liveLabel: fm(35), homeGoals: 0, awayGoals: 0 }, memoire: m }, maintenant: T0 + 5 * MIN });
  assert.deepEqual([e.rouges.connus, e.rouges.home, e.rouges.away, e.rouges.depuisA], [true, 0, 0, T0 + 5 * MIN]);
  assert.equal(e.depart.rh, 0);
  // Inconnus : le calcul part à 11 contre 11, l'écran ne dit jamais « 0 ».
  const sans = suivre(null, { liste: { liveLabel: fm(20), homeGoals: 1, awayGoals: 0 }, maintenant: T0 });
  const es = etatDuMatch({ match: { liste: { liveLabel: fm(20), homeGoals: 1, awayGoals: 0 }, memoire: sans }, maintenant: T0 });
  assert.deepEqual([es.rouges.connus, es.rouges.home, es.depart.rh, es.depart.ra, es.rouges.phrase], [false, null, 0, 0, 'pas-encore-lus']);
  // Ambre dès 6 minutes hors mi-temps ; à la mi-temps, « lus avant la pause ».
  const lus = { home: 0, away: 1, vuA: T0, depuisA: T0 };
  assert.equal(rougesRetenus({ rougesDetail: lus, phase: 'jeu', maintenant: T0 + ROUGES_AMBRE_MS }).ambre, true);
  assert.equal(rougesRetenus({ rougesDetail: lus, phase: 'jeu', maintenant: T0 + ROUGES_AMBRE_MS - 1 }).ambre, false);
  const pause = rougesRetenus({ rougesDetail: lus, phase: 'mi-temps', pauseVueA: T0 + MIN, maintenant: T0 + 20 * MIN });
  assert.deepEqual([pause.ambre, pause.avantLaPause], [false, true]);
});

test('T-E7 (K1) un rouge que la liste FotMob publie pour UN SEUL camp (elle n’écrit que le camp sanctionné) : retenu tout de suite, l’autre camp à 0 ; la liste muette oubliée ; le détail plus récent l’emporte ; sans détail, sans mémoire, dans la courbe (les 8 scénarios de verif/calcul/rouges-liste-corrigee.mjs)', () => {
  const APO = RSQ;
  const LR = (minute, rh = null, ra = null) => ({ matchId: '4700001', started: true, finished: false, cancelled: false, awarded: false, homeGoals: 0, awayGoals: 0, liveLabel: `${minute}${APO}`, liveMinute: null, liveAddedTime: null, liveMaxTime: 90, halfTime: false, homeRedCards: rh, awayRedCards: ra });
  const vu = (m, liste, t) => {
    const e = etatDuMatch({ match: { liste, memoire: m }, maintenant: t + 20_000 });
    return { liste: m.rougesListe && [m.rougesListe.home, m.rougesListe.away], detail: m.rougesDetail && [m.rougesDetail.home, m.rougesDetail.away], retenus: e.rouges.connus ? [e.rouges.home, e.rouges.away] : null, source: e.rouges.source, desaccord: e.rouges.desaccord, phrase: e.rouges.phrase, depart: [e.depart.rh, e.depart.ra] };
  };
  const attendu = (liste, detail, retenus, source, desaccord, depart) => ({ liste, detail, retenus, source, desaccord, phrase: 'lus', depart });
  // 1. Détail 0-0 à la 60e, puis la liste dit « domicile 1 » (61e) : retenu tout de suite, source liste, le calcul part à 10 contre 11.
  let m = suivre(null, { liste: LR(60), detail: LR(60, 0, 0), maintenant: T0 });
  m = suivre(m, { liste: LR(61, 1, null), maintenant: T0 + MIN });
  assert.deepEqual(vu(m, LR(61, 1, null), T0 + MIN), attendu([1, 0], [0, 0], [1, 0], 'liste', true, [1, 0]), '1. la liste dit « domicile 1 »');
  // 2. Le détail le confirme (65e).
  m = suivre(m, { liste: LR(65, 1, null), detail: LR(65, 1, 0), maintenant: T0 + 5 * MIN });
  assert.deepEqual(vu(m, LR(65, 1, null), T0 + 5 * MIN), attendu([1, 0], [1, 0], [1, 0], 'detail', false, [1, 0]), '2. le détail confirme');
  // 3. Rouge retiré : la liste ne dit plus rien (66e) → son compte est oublié ; le détail (65e) reste.
  m = suivre(m, { liste: LR(66), maintenant: T0 + 6 * MIN });
  assert.deepEqual(vu(m, LR(66), T0 + 6 * MIN), attendu(null, [1, 0], [1, 0], 'detail', false, [1, 0]), '3. la liste muette oubliée');
  // 4. Le détail relu dit 0-0 (70e) : le dernier compte fait foi.
  m = suivre(m, { liste: LR(70), detail: LR(70, 0, 0), maintenant: T0 + 10 * MIN });
  assert.deepEqual(vu(m, LR(70), T0 + 10 * MIN), attendu(null, [0, 0], [0, 0], 'detail', false, [0, 0]), '4. le détail relu 0-0');
  // 5. Second rouge vu d'abord par le détail (65e), la liste en retard dit encore 1 (66e) : le détail, plus récent.
  let n = suivre(null, { liste: LR(60, 1, null), detail: LR(60, 1, 0), maintenant: T0 });
  n = suivre(n, { liste: LR(65, 1, null), detail: LR(65, 2, 0), maintenant: T0 + 5 * MIN });
  n = suivre(n, { liste: LR(66, 1, null), maintenant: T0 + 6 * MIN });
  assert.deepEqual(vu(n, LR(66, 1, null), T0 + 6 * MIN), attendu([1, 0], [2, 0], [2, 0], 'detail', true, [2, 0]), '5. le détail plus récent');
  // 6. Aucun détail lu, la liste dit « visiteur 1 ».
  const p = suivre(null, { liste: LR(61, null, 1), maintenant: T0 });
  assert.deepEqual(vu(p, LR(61, null, 1), T0), attendu([0, 1], null, [0, 1], 'liste', false, [0, 1]), '6. sans détail');
  // 7. Sans mémoire (module de la 46 indisponible dans la boucle), la liste dit « domicile 1 ».
  const sansMemoire = etatDuMatch({ match: { liste: LR(61, 1, null), memoire: null }, maintenant: T0 });
  assert.deepEqual([sansMemoire.rouges.home, sansMemoire.rouges.away, sansMemoire.depart.rh, sansMemoire.depart.ra], [1, 0, 1, 0], '7. sans mémoire');
  // 8. La courbe : un instantané de la liste seule « domicile 1 » (away_red null) → 1-0 lu, pas reporté.
  const c = etatDepuisInstantane(
    { taken_at: '2026-11-14T20:01:00.000Z', status: 'en cours', minute: 61, added_time: null, minute_label: `61${APO}`, home_goals: 0, away_goals: 0, home_red: 1, away_red: null },
    { precedent: { rouges: { home: 0, away: 0 }, pauseVue: true, prolongationVue: false, tirsAuButVus: false } }
  );
  assert.deepEqual([c.etat.rh, c.etat.ra, c.etat.rougesReportes], [1, 0, false], '8. la courbe');
});

// ------------------------------------------------------------ T-E8 : la mémoire (R4, R5)

const L = (label, h, a, extra = {}) => ({ liveLabel: label, homeGoals: h, awayGoals: a, ...extra });

test('T-E8 la mémoire : `depuisA` ne bouge que si le score change ; `baisseA` quand il baisse ; le détail du même tour prime ; `libelle.depuisA` ; un objet neuf à chaque tour ; `maintenant` obligatoire', () => {
  let m = suivre(null, { liste: L(fm(10), 0, 0), maintenant: T0 });
  assert.deepEqual([m.score.h, m.score.a, m.score.depuisA, m.score.precedent, m.lecturesListe], [0, 0, T0, null, 1]);
  const avant = JSON.parse(JSON.stringify(m));
  const m2 = suivre(m, { liste: L(fm(11), 0, 0), maintenant: T0 + MIN });
  assert.deepEqual(m, avant, 'l’ancienne mémoire n’est jamais modifiée');
  assert.equal(m2.score.depuisA, T0, 'même score : depuisA inchangé');
  assert.equal(m2.score.vuA, T0 + MIN);
  const m3 = suivre(m2, { liste: L(fm(12), 1, 0), maintenant: T0 + 2 * MIN });
  assert.deepEqual([m3.score.h, m3.score.depuisA, m3.score.precedent, m3.score.baisseA], [1, T0 + 2 * MIN, { h: 0, a: 0 }, null]);
  const m4 = suivre(m3, { liste: L(fm(13), 0, 0), maintenant: T0 + 3 * MIN });
  assert.deepEqual([m4.score.h, m4.score.baisseA, m4.score.precedent], [0, T0 + 3 * MIN, { h: 1, a: 0 }], 'baisse lue par une vraie liste : annoncée');
  // Le détail du même tour prime (lu après la liste).
  const m5 = suivre(m4, { liste: L(fm(14), 0, 0), detail: L(fm(14), 1, 0), maintenant: T0 + 4 * MIN });
  assert.deepEqual([m5.score.h, m5.score.source], [1, 'detail']);
  // Une baisse lue au DÉTAIL prime aussi, « à confirmer » jusqu'à la vraie liste qui la redit.
  const m6 = suivre(m5, { liste: L(fm(15), 1, 0), detail: L(fm(15), 0, 0), maintenant: T0 + 5 * MIN });
  assert.deepEqual([m6.score.h, m6.score.aConfirmer, m6.score.baisseA], [0, true, null]);
  const m7 = suivre(m6, { liste: L(fm(16), 0, 0), maintenant: T0 + 6 * MIN });
  assert.deepEqual([m7.score.aConfirmer, m7.score.baisseA, m7.score.depuisA], [false, T0 + 6 * MIN, T0 + 5 * MIN]);
  // Le libellé : son heure de changement.
  const l1 = suivre(null, { liste: L(fm(60), 0, 0), maintenant: T0 });
  const l2 = suivre(l1, { liste: L(fm(60), 0, 0), maintenant: T0 + MIN });
  const l3 = suivre(l2, { liste: L(fm(61), 0, 0), maintenant: T0 + 2 * MIN });
  assert.deepEqual([l2.libelle.depuisA, l3.libelle.depuisA, l3.libelle.texte], [T0, T0 + 2 * MIN, "61'"]);
  assert.throws(() => suivre(null, { liste: L(fm(1), 0, 0) }), TypeError);
  const autre = suivre({ v: VERSION_MEMOIRE + 1, score: { h: 9, a: 9 } }, { liste: L(fm(2), 0, 0), maintenant: T0 });
  assert.deepEqual([autre.v, autre.score.h, autre.premiereVueA], [VERSION_MEMOIRE, 0, T0], 'une mémoire d’une autre version est recommencée');
  assert.deepEqual(Object.keys(memoireVide(T0)).sort(), Object.keys(autre).sort());
});

test('R4 — une COPIE de la liste n’est pas une observation : « détail 1-0, copie 0-0, puis 1-0 » → aucune baisse annoncée, `depuisA` inchangé, l’heure du relevé reste celle de la dernière VRAIE liste', () => {
  let m = suivre(null, { liste: L(fm(20), 0, 0), detail: L(fm(20), 1, 0), maintenant: T0 });
  assert.deepEqual([m.score.h, m.score.depuisA], [1, T0]);
  m = suivre(m, { liste: L(fm(20), 0, 0), listeReelle: false, maintenant: T0 + MIN });
  assert.deepEqual([m.score.h, m.score.baisseA, m.listeLueA, m.copies, m.derniereCopieA, m.lecturesListe], [1, null, T0, 1, T0 + MIN, 1]);
  m = suivre(m, { liste: L(fm(22), 1, 0), maintenant: T0 + 2 * MIN });
  assert.deepEqual([m.score.h, m.score.baisseA, m.score.depuisA, m.listeLueA], [1, null, T0, T0 + 2 * MIN]);
  const e = etatDuMatch({ match: { liste: L(fm(22), 1, 0), memoire: m }, maintenant: T0 + 3 * MIN });
  assert.deepEqual([e.score.h, e.score.baisseA, e.releve.copies, e.releve.listeLueA], [1, null, 1, T0 + 2 * MIN]);
});

test('R5 — le score de la 90e : relevé à la coupure d’avant la prolongation (à moins de 3 min d’un relevé en jeu, `sur`), FIGÉ dès que la prolongation se joue (même si un but y tombe) ; un trou de relevés n’est pas comblé ; libellé inconnu ou minute inconnue ne le changent pas ; AET le fige ; la pause de la prolongation n’est jamais une mi-temps', () => {
  // (1) la coupure : 89’ 1-1, puis « ET » à +2 min et +3 min (relevés de la coupure), puis la prolongation jouée.
  let m = suivre(null, { liste: L(fm(89), 1, 1, { liveMaxTime: 90 }), maintenant: T0 });
  assert.deepEqual([m.reglementaire.h, m.reglementaire.sur, m.reglementaire.phase], [1, false, 'jeu']);
  m = suivre(m, { liste: L('ET', 1, 1, { liveMaxTime: 90 }), maintenant: T0 + 2 * MIN });
  assert.deepEqual([m.reglementaire.sur, m.reglementaire.apresLaFin, m.reglementaire.vuA], [true, true, T0 + 2 * MIN]);
  m = suivre(m, { liste: L('ET', 1, 1, { liveMaxTime: 90 }), maintenant: T0 + 5 * MIN });
  assert.equal(m.reglementaire.vuA, T0 + 5 * MIN, 'la coupure dure plusieurs relevés : chaînés à moins de 3 min');
  assert.ok(3 * MIN <= SCORE90_ECART_MAX_MS);
  m = suivre(m, { liste: L(fm(92), 1, 1, { liveMaxTime: 120 }), maintenant: T0 + 8 * MIN });
  assert.equal(m.prolongationJoueeA, T0 + 8 * MIN);
  m = suivre(m, { liste: L(fm(95), 2, 1, { liveMaxTime: 120 }), maintenant: T0 + 11 * MIN });
  assert.deepEqual([m.reglementaire.h, m.reglementaire.a, m.score.h], [1, 1, 2], 'le but de la prolongation ne touche pas la 90e');
  const e = etatDuMatch({ match: { liste: L(fm(95), 2, 1, { liveMaxTime: 120 }), memoire: m }, maintenant: T0 + 11 * MIN });
  assert.deepEqual([e.phase, e.calculable, e.score90], ['prolongation', false, { h: 1, a: 1, sur: true, vuA: T0 + 5 * MIN, libelle: 'ET' }]);
  // (2) le trou : vu 1-0 à la 80e, revu 25 minutes plus tard à « ET » 1-1 : la 90e reste « dernier score vu en jeu ».
  let t = suivre(null, { liste: L(fm(80), 1, 0, { liveMaxTime: 90 }), maintenant: T0 });
  t = suivre(t, { liste: L('ET', 1, 1, { liveMaxTime: 90 }), maintenant: T0 + 25 * MIN });
  assert.deepEqual([t.reglementaire.h, t.reglementaire.a, t.reglementaire.sur, t.reglementaire.vuA], [1, 0, false, T0]);
  const et = etatDuMatch({ match: { liste: L('ET', 1, 1, { liveMaxTime: 90 }), memoire: t }, maintenant: T0 + 25 * MIN });
  assert.deepEqual([et.score90.h, et.score90.a, et.score90.sur], [1, 0, false]);
  // (3) libellé inconnu, minute inconnue : rien de changé.
  let u = suivre(null, { liste: L(fm(70), 0, 0, { liveMaxTime: 90 }), maintenant: T0 });
  u = suivre(u, { liste: L('Abc', 1, 0), maintenant: T0 + MIN });
  u = suivre(u, { liste: L(fm(99), 1, 0), maintenant: T0 + 2 * MIN });
  assert.deepEqual([u.reglementaire.h, u.reglementaire.vuA], [0, T0]);
  // (4) AET : la prolongation a été jouée → figé.
  let w = suivre(null, { liste: L(fm(88), 0, 0, { liveMaxTime: 90 }), maintenant: T0 });
  w = suivre(w, { liste: L('AET', 1, 0), maintenant: T0 + 40 * MIN });
  assert.deepEqual([w.prolongationJoueeA, w.reglementaire.h], [T0 + 40 * MIN, 0]);
  // (5) la pause de la prolongation : « HT » après « ET » → prolongation, jamais une mi-temps calculée.
  let x = suivre(null, { liste: L('ET', 1, 1), maintenant: T0 });
  x = suivre(x, { liste: L('HT', 1, 1), maintenant: T0 + 20 * MIN });
  const ex = etatDuMatch({ match: { liste: L('HT', 1, 1), memoire: x }, maintenant: T0 + 20 * MIN });
  assert.deepEqual([ex.phase, ex.calculable, ex.minute.creneau, x.pauseVueA], ['prolongation', false, null, null]);
  // (6) les finis portent le score de la 90e.
  let f = suivre(null, { liste: L(fm(89), 2, 1, { liveMaxTime: 90 }), maintenant: T0 });
  f = suivre(f, { liste: L('FT', 2, 1, { finished: true }), maintenant: T0 + 2 * MIN });
  const ef = etatDuMatch({ match: { liste: L('FT', 2, 1, { finished: true }), memoire: f }, maintenant: T0 + 2 * MIN });
  assert.deepEqual([ef.phase, ef.score90.h, ef.score90.a, ef.score90.sur, ef.fin.finished], ['termine', 2, 1, true, true]);
});

// ------------------------------------------------------------ T-E9 : minute figée, relevé périmé

test('T-E9 minute figée à 4 min de relevés, jamais à la mi-temps ; relevé en ambre après 150 s, périmé après 5 min ; aucune horloge lue dans les modules', () => {
  let m = suivre(null, { liste: L(fm(60), 0, 0, { liveMaxTime: 90 }), maintenant: T0 });
  m = suivre(m, { liste: L(fm(60), 0, 0, { liveMaxTime: 90 }), maintenant: T0 + FIGE_APRES_MS - 1000 });
  const pasEncore = etatDuMatch({ match: { liste: L(fm(60), 0, 0, { liveMaxTime: 90 }), memoire: m }, maintenant: T0 + FIGE_APRES_MS - 1000 });
  assert.equal(pasEncore.releve.fige, false);
  m = suivre(m, { liste: L(fm(60), 0, 0, { liveMaxTime: 90 }), maintenant: T0 + FIGE_APRES_MS });
  const fige = etatDuMatch({ match: { liste: L(fm(60), 0, 0, { liveMaxTime: 90 }), memoire: m }, maintenant: T0 + FIGE_APRES_MS });
  assert.deepEqual([fige.releve.fige, fige.calculable], [true, true]);
  let p = suivre(null, { liste: L('HT', 0, 0), maintenant: T0 });
  p = suivre(p, { liste: L('HT', 0, 0), maintenant: T0 + 15 * MIN });
  assert.equal(etatDuMatch({ match: { liste: L('HT', 0, 0), memoire: p }, maintenant: T0 + 15 * MIN }).releve.fige, false, 'jamais à la mi-temps');
  const age = (ms) => etatDuMatch({ match: { liste: L(fm(30), 0, 0), memoire: suivre(null, { liste: L(fm(30), 0, 0), maintenant: T0 }) }, maintenant: T0 + ms }).releve;
  assert.deepEqual([age(AMBRE_ETAT_MS).ambre, age(AMBRE_ETAT_MS + 1000).ambre], [false, true]);
  assert.deepEqual([age(PERIME_APRES_MS).perime, age(PERIME_APRES_MS + 1000).perime, age(PERIME_APRES_MS + 1000).ageS], [false, true, 301]);
  assert.equal(PERIME_APRES_MS, 5 * MIN, 'R3 / R4 : un seul nombre, celui de l’alerte de E');
  for (const f of ['libelleDuDirect.js', 'etatDuDirect.js', 'memoireDuDirect.js']) {
    const code = fs.readFileSync(path.join(SRC, 'data', 'direct', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    for (const interdit of [/Date\.now/, /new Date\s*\(/, /performance\.now/, /process\.hrtime/]) assert.ok(!interdit.test(code), `${f} : ${interdit}`);
  }
});

// ------------------------------------------------------------ T-E10 : les instantanés (la courbe)

test('T-E10 etatDepuisInstantane : rouges `null` reportés de l’instantané précédent et marqués ; aucun rouge jamais connu → inconnus (calcul à 0-0, jamais affirmé) ; pause, prolongation et tirs au but portés', () => {
  const snap = (extra) => ({ status: 'en cours', minute_label: fm(30), minute: 30, added_time: null, home_goals: 0, away_goals: 0, home_red: null, away_red: null, taken_at: '2026-11-14T19:30:00Z', ...extra });
  const a = etatDepuisInstantane(snap({ home_red: 1, away_red: 0 }));
  assert.deepEqual([a.etat.rh, a.etat.rougesConnus, a.etat.rougesReportes, a.etat.creneau], [1, true, false, 29]);
  const b = etatDepuisInstantane(snap({ minute_label: fm(31), minute: 31 }), { precedent: a.suite });
  assert.deepEqual([b.etat.rh, b.etat.ra, b.etat.rougesConnus, b.etat.rougesReportes], [1, 0, true, true]);
  const jamais = etatDepuisInstantane(snap({}));
  assert.deepEqual([jamais.etat.rh, jamais.etat.ra, jamais.etat.rougesConnus, jamais.etat.calculable], [0, 0, false, true]);
  const pause = etatDepuisInstantane(snap({ status: 'mi-temps', minute_label: 'HT', minute: 45 }));
  assert.deepEqual([pause.etat.phase, pause.etat.creneau, pause.etat.part, pause.suite.pauseVue], ['mi-temps', 46, 0, true]);
  assert.equal(etatDepuisInstantane(snap({ minute_label: fm(47), minute: 47 }), { precedent: pause.suite }).etat.creneau, 47);
  assert.equal(etatDepuisInstantane(snap({ minute_label: fm(47), minute: 47 })).etat.phase, 'minute-inconnue', 'sans pause vue ni durée : on ne devine pas');
  const et = etatDepuisInstantane(snap({ minute_label: 'ET', minute: 90 }));
  assert.deepEqual([et.etat.phase, et.suite.prolongationVue], ['prolongation', true]);
  assert.equal(etatDepuisInstantane(snap({ minute_label: 'HT', status: 'mi-temps' }), { precedent: et.suite }).etat.phase, 'prolongation');
  assert.equal(etatDepuisInstantane(snap({ status: 'terminé', minute_label: null })).etat.phase, 'termine');
  const sansScore = etatDepuisInstantane(snap({ home_goals: null }));
  assert.deepEqual([sansScore.etat.calculable, sansScore.etat.raison], [false, 'score-inconnu']);
});
