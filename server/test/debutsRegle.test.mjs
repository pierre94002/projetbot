/**
 * LES RÈGLES DES DÉBUTS DE SAISON (étape 35, lot 1a, 09/11/2026) : saisons, rangs, statuts, état scindé, oubli, centres,
 * identifiants, base. Purs : aucune base, aucun fichier lu hors du code, aucune horloge ; un magasin fabriqué
 * (aides/debutsFabrique.mjs) et un monde tiré au hasard (aides/debutsMondes.mjs).
 *   T-R1  la saison du club et la trêve : à cheval, civile, Liga MX (Clausura : pas de trêve), Argentine (trêve en janvier),
 *         le tour préliminaire de juillet ouvre la saison ;
 *   T-R2  le rang : championnat seul (ni coupe, compté, non attribué), le match reporté pris le jour où il se joue, jamais
 *         `meta.round` ;
 *   T-R3  le statut : promu, relégué (NIVEAUX), autre changement, nouveau venu, premier au magasin, retour après deux ans,
 *         deux championnats la saison d'avant ; à football-data par NIVEAUX_FD ;
 *   T-R4  l'état scindé : avant + saison = la candidate (1e-12), n, nx, ligue égaux ; d = 0, c = 1 : ses forces à l'octet et
 *         ses buts attendus (sans cote, 1N2) à 1e-12 ;
 *   T-R5  l'oubli : δ = 2^(−d/35), 2^(−d/25) ; la part de la moyenne aux rangs 1, 5, 10, 20 = la table §2.3 (c3) à 1e-3 ;
 *   T-R6  les centres : un promu (remise faite) vaut c au 1er match, l'effet s'efface comme 8/(W + 8) ; un nouveau venu (n = 0)
 *         vaut c ; la saison suivante, c = 1 ;
 *   T-R7  les identifiants : un club sans numéro bien formé n'a ni rang ni statut ; aucun nom n'est lu ; à football-data, un
 *         même club sous deux noms réuni PAR SON NUMÉRO (ALIAS_FD, jugé à la main, corrigé avant le regard le 09/11) ;
 *   T-R8  la base des bras = les réglages `modeleDeButs` de la candidate en essai (comparés), comme la 32.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DebutsAuJourJ, passerLesRencontres } from '../src/data/debutsDeSaison/debutsAuJourJ.js';
import * as F from '../src/data/debutsDeSaison/formulesDebuts.js';
import * as R from '../src/data/debutsDeSaison/reglagesDebuts.js';
import { bras, attendusDuBras } from '../src/data/debutsDeSaison/bancDesDebuts.js';
import { numeroFd, rencontresFd } from '../src/data/debutsDeSaison/lectureDesDebuts.js';
import { passeDesDebuts } from '../src/data/debutsDeSaison/passeDesDebuts.js';
import { forcesDe, modeleDeButs, reglagesDuModeleDeButs, empreinteDesForces } from '../src/core/engine/goalModel.js';
import { CANDIDATE_EN_ESSAI } from '../src/core/engine/engineVersions.js';
import { executerSansPause } from '../src/utils/travailCooperatif.js';
import { magasinFabrique, fdFabrique, rencontre, baseEnMemoire } from './aides/debutsFabrique.mjs';
import { mondeDesDebuts } from './aides/debutsMondes.mjs';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** La passe sur des rencontres : chaque club lu AVANT le jour (Map clé → { h, a }), et l'accumulateur à la fin. */
function lire(rencontres, opts = {}) {
  const debuts = new DebutsAuJourJ(opts);
  const lus = new Map();
  executerSansPause(
    passerLesRencontres(debuts, rencontres, {
      avant: (jour, duJour) => {
        for (const r of duJour) lus.set(r.cle, { r, h: debuts.lireLeClub(r.home, r), a: debuts.lireLeClub(r.away, r) });
      }
    })
  );
  return { debuts, lus };
}
const duClub = (lus, club, filtre = () => true) => [...lus.values()].filter((x) => (x.r.home === club || x.r.away === club) && filtre(x.r)).map((x) => ({ r: x.r, c: x.r.home === club ? x.h : x.a }));

test('T-R1 la saison du club et la trêve : à cheval, civile, Liga MX sans trêve au Clausura, Argentine en janvier, le tour de juillet ouvre la saison', () => {
  assert.equal(F.saisonDuClub({ league: 'EPL', date: '2026-08-21', coupe: false }), 2026);
  assert.equal(F.saisonDuClub({ league: 'EPL', date: '2027-05-20', coupe: false }), 2026);
  assert.equal(F.saisonDuClub({ league: 'Allsvenskan - Sweden', date: '2026-03-30', coupe: false }), 2026);
  assert.equal(F.saisonDuClub({ league: 'Brazil Série A', date: '2026-11-30', coupe: false }), 2026);
  assert.equal(F.saisonDuClub({ league: 'Liga MX', date: '2026-01-15', coupe: false }), 2025, 'Liga MX : juillet-juin (le Clausura est la même saison)');
  // une coupe compte dans la saison du championnat du club (UCL de juillet : saison de l'EPL), sinon dans la sienne
  assert.equal(F.saisonDuClub({ league: 'Copa Libertadores', date: '2026-07-20', coupe: true }, 'EPL'), 2026);
  assert.equal(F.saisonDuClub({ league: 'Copa Libertadores', date: '2026-07-20', coupe: true }, 'Liga MX'), 2026);
  assert.equal(F.saisonDuClub({ league: 'Copa Libertadores', date: '2026-02-20', coupe: true }, 'Liga MX'), 2025, 'la coupe d’un club de Liga MX en février : sa saison 2025-26');
  const { lus } = lire(magasinFabrique());
  const un = duClub(lus, 1);
  const ucl = un.find((x) => x.r.league === 'UEFA Champions League');
  assert.equal(ucl.c.treve, true, 'le tour préliminaire de juillet ouvre la saison 2024-25 du club 1');
  assert.equal(ucl.c.saison, 2024);
  const premierEpl = un.find((x) => x.r.league === 'EPL' && x.r.date >= '2024-08-01');
  assert.equal(premierEpl.c.treve, false, 'la saison était déjà ouverte par la coupe');
  assert.equal(premierEpl.c.rang, 1);
  const mx = duClub(lus, 51);
  assert.equal(mx.find((x) => x.r.date === '2025-01-10' || (x.r.date >= '2025-01-10' && x.r.date < '2025-02-01')).c.treve, false, 'Liga MX : aucune trêve au Clausura');
  assert.equal(mx.find((x) => x.r.date >= '2025-07-11').c.treve, true, 'Liga MX : la trêve à l’Apertura de juillet');
  const ar = duClub(lus, 41);
  assert.equal(ar.find((x) => x.r.date >= '2025-01-24').c.treve, true, 'Argentine : la trêve en janvier');
  assert.equal(ar[0].c.treve, false, 'le tout premier match n’est pas une trêve');
});

test('T-R2 le rang : championnat seul, le match reporté pris le jour où il se joue, le match attribué jamais compté, jamais meta.round', () => {
  const { lus } = lire(magasinFabrique());
  for (const club of [1, 3, 4, 15]) {
    const tous = duClub(lus, club, (r) => !r.coupe && r.compte && !r.attribue);
    const parSaison = new Map();
    for (const x of tous.sort((a, b) => (a.r.date < b.r.date ? -1 : 1))) {
      const k = `${x.c.saison}|${x.r.league}`;
      parSaison.set(k, (parSaison.get(k) ?? 0) + 1);
      assert.equal(x.c.rang, parSaison.get(k), `club ${club} le ${x.r.date} : rang = 1 + les matchs de championnat d’avant`);
    }
  }
  const reporte = [...lus.values()].find((x) => x.r.date === '2024-09-10');
  assert.ok(reporte, 'le match reporté existe');
  const avantLui = (club) => duClub(lus, club, (r) => r.league === 'EPL' && r.date >= '2024-08-01' && r.date < '2024-09-10').length;
  assert.equal(reporte.h.rang, 1 + avantLui(reporte.r.home), 'le rang du jour où il se joue');
  // le match attribué (15 – 22 du 26/12/2024) : aucun rang ne le compte, aucune lecture ne le prend
  const attribue = [...lus.values()].find((x) => x.r.attribue);
  assert.ok(attribue);
  const apres = duClub(lus, 15, (r) => !r.coupe && !r.attribue && r.date > '2024-12-26' && r.date < '2025-07-01');
  const avant = duClub(lus, 15, (r) => !r.coupe && !r.attribue && r.date < '2024-12-26' && r.date >= '2024-07-01');
  if (apres.length) assert.equal(apres[0].c.rang, avant.length + 1);
  // une coupe n'a pas de rang
  assert.equal(duClub(lus, 1).find((x) => x.r.coupe).c.rang, null);
  // jamais meta.round : aucun fichier de l'étape ne le lit — ni « .round », ni « ?.round », ni « ['round'] » (la campagne, essai 2 :
  // « l.meta?.round » passait ; « Math.round( » est un calcul, pas une lecture)
  for (const f of fs.readdirSync(path.join(SRC, 'data', 'debutsDeSaison'))) assert.ok(!/\??\.round\b(?!\s*\()|\[\s*['"]round['"]\s*\]|\$\.round|json_extract\([^)]*meta/.test(fs.readFileSync(path.join(SRC, 'data', 'debutsDeSaison', f), 'utf8')), `${f} lit le numéro de journée`);
});

test('T-R3 le statut : promu, relégué, nouveau venu, premier au magasin, retour après deux ans, deux championnats ; football-data par NIVEAUX_FD', () => {
  const { lus } = lire(magasinFabrique());
  const statut = (club, apres) => duClub(lus, club, (r) => !r.coupe && r.date >= apres)[0].c.statut;
  assert.equal(statut(11, '2024-07-01'), 'promu');
  assert.equal(statut(12, '2024-07-01'), 'promu');
  assert.equal(statut(5, '2024-07-01'), 'relegue');
  assert.equal(statut(1, '2024-07-01'), 'debut');
  assert.equal(statut(21, '2024-07-01'), 'nouveau', 'aucun match de championnat au magasin la saison d’avant, son championnat en avait');
  assert.equal(statut(14, '2025-07-01'), 'nouveau', 'retour après deux ans : rien la saison d’avant');
  assert.equal(statut(1, '2023-07-01'), 'premier-au-magasin', 'le magasin commence : son championnat n’avait aucun match la saison d’avant');
  assert.equal(statut(51, '2024-07-01'), 'premier-au-magasin');
  assert.equal(statut(31, '2025-01-01'), 'debut');
  // le statut est gardé toute la saison (fixé au premier match de championnat)
  const tous11 = duClub(lus, 11, (r) => !r.coupe && r.date >= '2024-07-01' && r.date < '2025-07-01');
  assert.ok(tous11.length > 3 && tous11.every((x) => x.c.statut === 'promu'));
  // la règle pure : autre changement, deux championnats la saison d'avant (le plus de matchs, à égalité le plus récent)
  assert.equal(F.statutDuClub({ ligue: 'Liga MX', ligueAvant: 'EPL', ligueAvaitDesMatchs: true }, R.NIVEAUX), 'autre-changement');
  assert.equal(F.statutDuClub({ ligue: 'La Liga - Spain', ligueAvant: 'Championship', ligueAvaitDesMatchs: true }, R.NIVEAUX), 'autre-changement', 'deux pays : jamais promu');
  assert.equal(F.statutDuClub({ ligue: 'EPL', ligueAvant: 'League 1', ligueAvaitDesMatchs: true }, R.NIVEAUX), 'promu', 'deux niveaux d’un coup : promu');
  assert.equal(F.ligueLaPlusJouee(new Map([['A', { n: 10, dernier: '2024-05-01' }], ['B', { n: 12, dernier: '2024-03-01' }]])), 'B');
  assert.equal(F.ligueLaPlusJouee(new Map([['A', { n: 10, dernier: '2024-05-01' }], ['B', { n: 10, dernier: '2024-03-01' }]])), 'A', 'à égalité, le plus récent');
  // le sens vient de la table, jamais d'un nom : la table inversée inverse le statut
  const inverse = Object.fromEntries(Object.entries(R.NIVEAUX).map(([k, v]) => [k, { ...v, niveau: -v.niveau }]));
  assert.equal(F.statutDuClub({ ligue: 'EPL', ligueAvant: 'Championship', ligueAvaitDesMatchs: true }, inverse), 'relegue');
  // football-data : par NIVEAUX_FD et l'identité du club dans son pays
  const fd = lire(fdFabrique(), { fd: true, avecMinutes: false });
  const sfd = (club, apres) => duClub(fd.lus, club, (r) => r.date >= apres)[0].c.statut;
  assert.equal(sfd(5, '2019-07-01'), 'promu');
  assert.equal(sfd(4, '2019-07-01'), 'relegue');
  assert.equal(sfd(9, '2019-07-01'), 'nouveau');
  assert.equal(sfd(101, '2019-07-01'), 'debut');
  assert.equal(sfd(1, '2018-07-01'), 'premier-au-magasin');
});

test('T-R4 l’état scindé : avant + saison = la candidate (1e-12) ; d = 0, c = 1 : ses forces à l’octet, ses buts attendus à 1e-12 (sans cote et 1N2)', () => {
  const monde = mondeDesDebuts({ type: 'magasin', graine: 404, petit: true, rho: 0.8 });
  const debuts = new DebutsAuJourJ({ avecForces: true });
  let compares = 0;
  let ecartMax = 0;
  let unDeux = 0;
  executerSansPause(
    passerLesRencontres(debuts, monde.rencontres, {
      avant: (jour, duJour) => {
        if (jour < '2024-01-01') return;
        for (const r of duJour.slice(0, 2)) {
          const h = debuts.lireLeClub(r.home, r);
          const a = debuts.lireLeClub(r.away, r);
          const ch = debuts.etatCandidate(r.home);
          const ca = debuts.etatCandidate(r.away);
          const ligue = debuts.moyennes(r.league, jour, r.saison);
          const rec = { h, a, ligue, prix1n2: r.prix1n2 };
          const cand = modeleDeButs({ fair: null, entrees: { forces: { home: ch, away: ca }, ligue, plusMoins: null }, reglages: R.BASE_STATISTIQUE }).parties.statistiques;
          const lu = (c) => ({ tot: c.sommes.tot, sai: c.sommes.sai, n: c.sommes.n, nx: c.sommes.nx });
          assert.deepEqual(F.forcesDeDebut(lu(h), {}, R.BASE_STATISTIQUE), forcesDe(ch, R.BASE_STATISTIQUE), 'forces de la candidate À L’OCTET');
          const e = attendusDuBras(rec, bras('candidate'));
          ecartMax = Math.max(ecartMax, Math.abs(e.lambda - cand.lambda), Math.abs(e.mu - cand.mu));
          if (r.prix1n2) {
            const m = modeleDeButs({ fair: r.prix1n2, entrees: { forces: { home: ch, away: ca }, ligue, plusMoins: null }, reglages: R.BASE_STATISTIQUE });
            const e1 = attendusDuBras(rec, bras('candidate'), '1n2');
            const b = (x) => Math.min(6, Math.max(0.2, x));
            assert.ok(Math.abs(b(e1.lambda) - m.lambda) < 1e-12 && Math.abs(b(e1.mu) - m.mu) < 1e-12, '1N2 seul : le mélange de la candidate');
            unDeux += 1;
          }
          compares += 1;
        }
      }
    })
  );
  assert.ok(compares > 1000, `${compares} comparaisons`);
  assert.ok(unDeux > 200, `${unDeux} comparaisons « 1N2 seul »`);
  assert.ok(ecartMax < 1e-12, `écart ${ecartMax}`);
  // à la fin : chaque club, avant + saison = les sommes de la candidate ; n, nx, ligue égaux
  const NOMS = ['sa', 'wa', 'sd', 'wd', 'sga', 'wga', 'sgd', 'wgd'];
  let clubs = 0;
  for (const [club, st] of debuts.clubs) {
    const c = debuts.etatCandidate(club);
    if (!c) continue;
    clubs += 1;
    NOMS.forEach((k, i) => assert.ok(Math.abs(st.e.saison[i] + st.e.avant[i] - c[k]) <= 1e-12 * Math.max(1, Math.abs(c[k])), `${club} ${k}`));
    assert.equal(st.e.n, c.n);
    assert.equal(st.e.nx, c.nx);
    assert.equal(st.e.ligue, c.ligue);
  }
  assert.ok(clubs > 200);
});

test('T-R5 l’oubli : δ, d = 0 → la candidate ; la part de la moyenne aux rangs 1, 5, 10, 20 = la table §2.3 à 1e-3', () => {
  assert.equal(F.deltaDe(0, 35), 1);
  assert.equal(F.deltaDe(16, 35), Math.pow(2, -16 / 35));
  assert.equal(F.deltaDe(16, 25), Math.pow(2, -16 / 25));
  // un club de trois saisons (110 matchs « moyens ») puis r − 1 matchs de la nouvelle saison
  const L = { buts: { lieu: 1, adverse: 1 }, xg: { lieu: 1, adverse: 1 } };
  const m = { xgPour: 1, xgContre: 1, butsPour: 1, butsContre: 1, moyennes: L, championnat: 'X' };
  let e = F.etatScindeVide();
  for (let k = 0; k < 110; k++) e = F.jouerUnMatchScinde(e, m, R.BASE_STATISTIQUE, { saisonDuMatch: 2023 });
  const TABLE = { 0: { a: [15.0, 14.9, 14.8, 14.5], d: [18.7, 18.6, 18.5, 18.4] }, 16: { a: [19.5, 18.9, 18.2, 17.2], d: [26.4, 25.1, 23.9, 22.1] }, 32: { a: [25.0, 23.5, 22.0, 19.8] } };
  const etats = { 1: null, 5: null, 10: null, 20: null };
  let f = e;
  for (let r = 1; r <= 20; r++) {
    if (r in etats) etats[r] = f;
    f = F.jouerUnMatchScinde(f, m, R.BASE_STATISTIQUE, { saisonDuMatch: 2024 });
  }
  const partDeLaMoyenne = (etat, r, d, cote) => {
    const lu = F.sommesLues(etat, { treve: r === 1 });
    const k0 = R.BASE_STATISTIQUE.prior;
    const w = cote === 'a' ? 1 : 3;
    const delta = F.deltaDe(d, cote === 'a' ? 35 : 25);
    const W = lu.sai[w] + delta * (lu.tot[w] - lu.sai[w]);
    return (100 * k0) / (W + k0);
  };
  for (const [d, t] of Object.entries(TABLE)) {
    [1, 5, 10, 20].forEach((r, i) => {
      assert.ok(Math.abs(partDeLaMoyenne(etats[r], r, Number(d), 'a') - t.a[i]) < 0.1 + 1e-9, `attaque d ${d} rang ${r}`);
      if (t.d) assert.ok(Math.abs(partDeLaMoyenne(etats[r], r, Number(d), 'd') - t.d[i]) < 0.1 + 1e-9, `défense d ${d} rang ${r}`);
    });
  }
  // d = 0 : les forces lues = la candidate (les sommes totales)
  const lu = { ...F.sommesLues(etats[5]), tot: F.sommesLues(etats[5]).tot };
  assert.deepEqual(F.forcesDeDebut(lu, { d: 0 }), F.forcesDeDebut(lu, {}));
  // d > 0 PAR forcesDeDebut lui-même : δ s'applique à la part d'AVANT (tot − sai), jamais à « saison » ; deux demi-vies —
  // 2^(−d/35) sur les cases d'attaque (0, 1, 4, 5), 2^(−d/25) sur celles de défense (2, 3, 6, 7) ; le mélange de la base (0,7)
  const tot = Float64Array.from([30, 27, 24, 29, 31, 26, 22, 28]);
  const sai = Float64Array.from([4, 3, 5, 2, 6, 4, 3, 5]);
  const luD = { tot, sai, n: 30, nx: 30 };
  for (const d of [8, 16, 32]) {
    const dA = Math.pow(2, -d / 35);
    const dD = Math.pow(2, -d / 25);
    const S = [...tot].map((t, k) => sai[k] + ([0, 1, 4, 5].includes(k) ? dA : dD) * (t - sai[k]));
    const enXg = F.forcesDeDebut(luD, { d }, { ...R.BASE_STATISTIQUE, statistique: 'xg' });
    const enButs = F.forcesDeDebut(luD, { d }, { ...R.BASE_STATISTIQUE, statistique: 'buts' });
    assert.ok(Math.abs(enXg.attaque - (S[0] + 8) / (S[1] + 8)) < 1e-12, `attaque xG, d ${d}`);
    assert.ok(Math.abs(enXg.defense - (S[2] + 8) / (S[3] + 8)) < 1e-12, `défense xG, d ${d}`);
    assert.ok(Math.abs(enButs.attaque - (S[4] + 8) / (S[5] + 8)) < 1e-12, `attaque buts, d ${d}`);
    assert.ok(Math.abs(enButs.defense - (S[6] + 8) / (S[7] + 8)) < 1e-12, `défense buts, d ${d}`);
    const mix = F.forcesDeDebut(luD, { d });
    assert.ok(Math.abs(mix.attaque - Math.exp(0.7 * Math.log(enXg.attaque) + 0.3 * Math.log(enButs.attaque))) < 1e-12, `attaque mêlée, d ${d}`);
    assert.ok(Math.abs(mix.defense - Math.exp(0.7 * Math.log(enXg.defense) + 0.3 * Math.log(enButs.defense))) < 1e-12, `défense mêlée, d ${d}`);
  }
});

test('T-R6 les centres : un promu (remise faite) vaut c au 1er match et l’effet s’efface comme 8/(W + 8) ; un nouveau venu (n = 0) vaut c ; la saison suivante, c = 1', () => {
  const c = Math.exp(-0.2);
  const promu = { valide: true, statut: 'promu', remise: true, rang: 1, sommes: { tot: Float64Array.from([30, 40, 30, 40, 30, 40, 30, 40]), sai: new Float64Array(8), n: 50, nx: 50 } };
  const f1 = F.forcesDeDebut({ tot: new Float64Array(8), sai: new Float64Array(8), n: 50, nx: 50 }, { cA: c, cD: c });
  assert.ok(Math.abs(f1.attaque - c) < 1e-15 && Math.abs(f1.defense - c) < 1e-15, 'remise faite : exactement c');
  // l'effet en W matchs de la nouvelle saison : (S + 8c)/(W + 8) face à (S + 8)/(W + 8)
  for (const W of [1, 3, 7]) {
    const s = Float64Array.from([W, W, W, W, W, W, W, W]);
    const avec = F.forcesDeDebut({ tot: s, sai: s, n: W, nx: W }, { cA: c }).attaque;
    const sans = F.forcesDeDebut({ tot: s, sai: s, n: W, nx: W }, {}).attaque;
    assert.ok(Math.abs(avec - (W + 8 * c) / (W + 8)) < 1e-12 && Math.abs(sans - 1) < 1e-12, `W = ${W}`);
  }
  // dans les bras : la remise du 1er match faite dans les DEUX bras des promus (le commun et le dirigé)
  const ligue = { buts: { home: 1.4, away: 1.1 }, xg: { home: 1.4, away: 1.1 } };
  const autre = { valide: true, statut: 'debut', remise: false, rang: 1, sommes: { tot: Float64Array.from([20, 20, 20, 20, 20, 20, 20, 20]), sai: new Float64Array(8), n: 40, nx: 40 } };
  const rec = { h: promu, a: autre, ligue };
  const A = attendusDuBras(rec, bras('commun', { c0: [0, 0] }, { remise: true }));
  const B = attendusDuBras(rec, bras('dirige', { theta: [0, 0] }, { remise: true }));
  assert.deepEqual(A, B, 'centres neutres : les deux bras égaux');
  const cand = attendusDuBras(rec, bras('candidate'));
  assert.notDeepEqual(A, cand, 'la candidate, elle, lit encore les forces de l’ancien championnat au 1er match');
  const Bp = attendusDuBras(rec, bras('dirige', { theta: [Math.log(c), 0] }, { remise: true }));
  assert.ok(Math.abs(Bp.lambda / A.lambda - c) < 1e-12 || Math.abs(Bp.lambda / A.lambda - c) < 1e-9, 'l’effet entier au 1er match');
  // un relégué reçoit −θ
  const relegue = { ...promu, statut: 'relegue' };
  const Br = attendusDuBras({ h: relegue, a: autre, ligue }, bras('dirige', { theta: [Math.log(c), 0] }, { remise: true }));
  assert.ok(Math.abs(Br.lambda / A.lambda - 1 / c) < 1e-9);
  // un nouveau venu (n = 0) vaut c ; le démarrage à froid reste celui de la candidate
  const nouveau = { valide: true, statut: 'nouveau', remise: false, rang: 1, sommes: { tot: new Float64Array(8), sai: new Float64Array(8), n: 0, nx: 0 } };
  const fn = F.forcesDeDebut({ tot: new Float64Array(8), sai: new Float64Array(8), n: 0, nx: 0 }, { cA: c, cD: c });
  assert.ok(Math.abs(fn.attaque - c) < 1e-15 && fn.matchs === 0);
  const N0 = attendusDuBras({ h: nouveau, a: autre, ligue }, bras('nouveauxCommun', { c0: [0, 0] }, { remise: true }));
  const N1 = attendusDuBras({ h: nouveau, a: autre, ligue }, bras('nouveauxDirige', { theta: [Math.log(c), 0] }, { remise: true }));
  assert.ok(N1.lambda < N0.lambda && N1.mu > N0.mu, 'l’écart bouge (son attaque à c)');
  // le démarrage à froid de la candidate (nMin = 0) ramène le TOTAL à celui du championnat : un centre égal en attaque et en
  // défense ne change alors rien (seul l'écart compte)
  const N2 = attendusDuBras({ h: nouveau, a: autre, ligue }, bras('nouveauxDirige', { theta: [Math.log(c), Math.log(c)] }, { remise: true }));
  assert.ok(Math.abs(N2.lambda - N0.lambda) < 1e-12 && Math.abs(N2.mu - N0.mu) < 1e-12);
  // la saison suivante : le club est « debut », aucun centre ne s'applique
  const suivant = { ...promu, statut: 'debut', remise: false };
  const S0 = attendusDuBras({ h: suivant, a: autre, ligue }, bras('dirige', { theta: [Math.log(c), 0] }, { remise: true }));
  const S1 = attendusDuBras({ h: suivant, a: autre, ligue }, bras('dirige', { theta: [0, 0] }, { remise: true }));
  assert.deepEqual(S0, S1);
});

test('T-R7 les identifiants : un club sans numéro bien formé n’a ni rang ni statut ; aucun nom n’est lu ; Port et Portsmouth jamais confondus', () => {
  const d = new DebutsAuJourJ({ avecForces: false });
  for (const mauvais of [0, -3, 'fotmob-12', null, 1.5]) assert.deepEqual(d.lireLeClub(mauvais, rencontre({ date: '2024-08-17', league: 'EPL', home: 1, away: 2 })), { club: mauvais, valide: false });
  // deux clubs aux noms proches mais aux numéros différents : deux états
  const rs = [rencontre({ date: '2024-08-17', league: 'Championship', home: 8466, away: 1 }), rencontre({ date: '2024-08-24', league: 'Championship', home: 8462, away: 2 })];
  const { debuts } = lire(rs);
  assert.ok(debuts.clubs.has(8466) && debuts.clubs.has(8462));
  for (const f of fs.readdirSync(path.join(SRC, 'data', 'debutsDeSaison'))) {
    const t = fs.readFileSync(path.join(SRC, 'data', 'debutsDeSaison', f), 'utf8');
    assert.doesNotMatch(t, /home_name|away_name|homeName|awayName|teamName|team_aliases|rapprocheur|similar/i, `${f} lit un nom`);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(SRC, 'data', 'db', 'squadChanges.js'), 'utf8'), /name|nom du joueur/i);
  // football-data (corrigé avant le regard, 09/11) : un même club sous deux noms, jugé À LA MAIN (ALIAS_FD), réuni PAR SON
  // NUMÉRO, à partir d'un jour s'il le faut ; la clé de la rencontre reste celle de la ligne ; aucun autre numéro ne bouge
  assert.equal(numeroFd(1213, '2005-08-20'), 1223);
  assert.equal(numeroFd(1065, '2010-08-20'), 1162);
  assert.equal(numeroFd(1096, '2012-08-20'), 1134);
  assert.equal(numeroFd(1024, '2008-09-01'), 1024, 'le Mouscron de 2000-09, un autre club, garde son numéro');
  assert.equal(numeroFd(1024, '2016-08-01'), 1086);
  for (const n of [1223, 1162, 1134, 1086, 738, 942, 1]) assert.equal(numeroFd(n, '2015-01-01'), n);
  const ligne = (date, home, away, libelle) => ({ ...rencontre({ date, league: 'G1', home, away, bp: 1, bc: 0 }), libelle });
  const db = baseEnMemoire([], { fd: [ligne('2004-08-21', 1223, 5000, '2004-05'), ligne('2005-08-20', 1213, 5001, '2005-06'), ligne('2005-08-27', 5000, 5001, '2005-06')] });
  const lus = [...rencontresFd({ database: db, de: '2000-07-01', a: '2023-06-30', avecResultats: true })];
  assert.deepEqual(lus.map((r) => [r.home, r.away]), [[1223, 5000], [1223, 5001], [5000, 5001]]);
  assert.equal(lus[1].cle, 'fd:G1|2005-08-20|1213|5001', 'la clé reste celle de la ligne');
  assert.deepEqual([lus[1].faitDom.club, lus[1].faitDom.adversaire], [1223, 5001], 'le fait des forces porte le numéro corrigé');
  const p = executerSansPause(passeDesDebuts({ rencontres: lus, avecForces: true, fd: true, garderTout: true }));
  const statut = (club, saison) => [...p.comptes.clubsSaisons.values()].find((c) => c.club === club && c.saison === saison)?.statut;
  assert.equal(statut(1223, 2005), 'debut', 'Kallithea 2005-06 : « debut » (G1 la saison d’avant sous l’autre nom), plus un faux nouveau venu');
  assert.equal(statut(5001, 2005), 'nouveau');
  db.close();
});

test('T-R8 la base des bras = les réglages modeleDeButs de la candidate en essai (comparés), son empreinte des forces', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(R.BASE_STATISTIQUE)), JSON.parse(JSON.stringify(CANDIDATE_EN_ESSAI.modifications.football.modeleDeButs)));
  assert.doesNotThrow(() => reglagesDuModeleDeButs({ modeleDeButs: R.BASE_STATISTIQUE }));
  assert.equal(empreinteDesForces(R.BASE_STATISTIQUE), R.EMPREINTE_DE_LA_BASE);
  assert.ok(Object.isFrozen(R.BASE_STATISTIQUE) && Object.isFrozen(R.BASE_STATISTIQUE.demiVies));
  assert.equal(R.FAUSSE_RENTREE.modulo, 45);
  assert.equal(R.QUI_COMPTE.part, 0.3, 'Pierre, 02/11, n° 6');
  assert.equal(R.DECISION_DE_PIERRE.nonSuivis.reponse, 'promu moyen');
  assert.ok(R.FORMES_FD.includes(R.FORME_FD));
});
