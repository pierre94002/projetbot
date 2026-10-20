/**
 * Étape 19 — le BANC D'ESSAI, la suite : les essais dans des COPIES ISOLÉES qui ne sont pas le rejeu lui-même
 * (banc.test.mjs) — l'anti-fuite, les paris et le règlement, les cotes archivées à la coupure, la route, le
 * script du bac (dans un bac simulé). Un fichier à part pour que les deux tournent en parallèle.
 * Phases de test/aides/script-banc.mjs ; valeurs attendues recalculées ici (SQL sur la copie, removeMargin).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { preparerCopieDeBac, executerDansLeBac } from './aides/bacSimule.mjs';
import { gainMiseFixe } from '../src/bench/metrics.js';
import { removeMargin } from '../src/core/market/marginRemoval.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-banc.mjs');
const proche = (a, b, eps, quoi) => assert.ok(Math.abs(a - b) <= eps, `${quoi} : ${a} ≠ ${b} (± ${eps})`);
const issue1N2 = (h, a) => (h > a ? 'home' : h === a ? 'draw' : 'away');
const cote = (v) => (v === null || v === undefined ? null : v / 100);

function lancer(phase, { runtime = {}, verifier = null, scripts = false } = {}) {
  const copie = preparerCopie({ runtime });
  try {
    if (scripts) fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, SCRIPT, { args: [phase], timeout: 300_000 });
    assert.equal(r.code, 0, `phase ${phase} : ${r.erreurs.slice(-3000)}`);
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json, `phase ${phase} : sortie illisible ${r.sortie.slice(-500)}`);
    let sql = null;
    if (verifier) {
      const db = new DatabaseSync(copie.base, { readOnly: true });
      try {
        sql = verifier(db, r.json);
      } finally {
        db.close();
      }
    }
    return { ...r.json, sql };
  } finally {
    copie.nettoyer();
  }
}
const uneFois = (f) => {
  let v;
  return () => (v ??= f());
};

// ==================================================================== l'anti-fuite

const antiFuite = uneFois(() => lancer('antiFuite'));

test('anti-fuite : un match FUTUR (J + 1, 9-0, 25 corners) ne change aucune ligne du jour J ; la clôture × 2 ne change ni distribution ni décision d’avant-match', () => {
  const j = antiFuite();
  assert.ok(j.lignesDuJour > 100);
  assert.equal(j.futur.planteRejoue, true, 'le match planté est bien dans la table et rejoué');
  assert.equal(j.futur.jourIdentique, true, 'les lignes du jour J sont identiques');
  assert.equal(j.cloture.lignesIdentiques, true);
  assert.equal(j.cloture.parisIdentiques, true, 'mêmes paris (hors valeur de clôture)');
  assert.ok(j.cloture.paris > 0, 'des paris à comparer');
  assert.equal(j.cloture.valeurChange, true, 'seule la valeur de clôture bouge');
});

test('anti-fuite : deux matchs d’un club le même jour ne se voient pas ; un 8-8 du jour J ne bouge pas le repère du jour, celui de la journée suivante oui', () => {
  const j = antiFuite();
  assert.equal(j.memeJour.lignes, 27);
  assert.equal(j.memeJour.identiques, true);
  assert.equal(j.huitHuit.jourIdentique, true, 'le repère des autres matchs du jour J');
  assert.equal(j.huitHuit.suivantChange, true, 'le repère de la journée suivante');
});

test('anti-fuite : un fait du jour J glissé dans l’histoire d’un club — avantEquipe lève, le rejeu S’ARRÊTE et le dit (jamais attrapé en silence) ; un 9-0 du magasin de 2023-09 ne change pas les lignes football-data de 2023-03', () => {
  const j = antiFuite();
  assert.match(j.fuite.erreur, /fuite refusée/);
  assert.equal(j.fuite.resume, null);
  assert.equal(j.magasinApres.identique, true);
  assert.equal(j.magasinApres.lignes, 27);
});

// ==================================================================== paris et règlement

const paris = uneFois(() =>
  lancer('paris', {
    // Le coupe-circuit de la COPIE enclenché : le banc l'ignore (coupe-circuit neutre).
    runtime: { 'tilt-state.json': { circuitBreakerActive: true, currentDownswing: 9 } },
    verifier: (db, j) => ({
      fd: Object.fromEntries(
        j.plantes.map((p) => {
          const [date, dom, ext] = p.fixtureKey.slice('fd:E0|'.length).split('|');
          return [p.fixtureKey, db.prepare("SELECT * FROM fd_history WHERE code = 'E0' AND date_fichier = ? AND dom = ? AND ext = ?").get(date, Number(dom), Number(ext))];
        })
      ),
      equipes: Object.fromEntries(j.reglement.prolonges.map((k) => [k, db.prepare('SELECT t.bp, t.bc, t.bp90, t.bc90, t.prolongation FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre WHERE d.match_key = ? AND t.camp = 1').get(k)]))
    })
  })
);

test('paris : la règle du moteur (Pinnacle juge, William Hill prix) — un pari à +4,7 %, mise 1 sur la cote nette, valeur de clôture à la main ; sans Pinnacle, Pinnacle sans William Hill, cote > 5 : refus comptés ; coupe-circuit de la copie ignoré', () => {
  const j = paris();
  const premier = j.plantes.find((p) => p.n === 1).fixtureKey;
  const pari = j.paris.find((p) => p.fixtureKey === premier && p.regle === 'moteur');
  assert.ok(pari, 'le pari du match 1 (le coupe-circuit de la copie est enclenché : il ne compte pas)');
  assert.deepEqual([pari.bookmaker, pari.issue, pari.cote], ['williamhill', 'home', 2.26]);
  assert.equal(pari.gain, gainMiseFixe({ cote: 2.26, gagne: true }));
  const pin = removeMargin([2.1, 3.4, 3.9]).probabilities;
  proche(1 / pari.coteJuste, pin[0], 0.005, 'cote juste = Pinnacle');
  const fd = j.sql.fd[premier];
  const pc = removeMargin([fd.pin_c1, fd.pin_cn, fd.pin_c2].map(cote)).probabilities[0];
  proche(pari.valeurCloture, 2.26 * pc - 1, 1e-12, 'valeur de clôture');
  assert.equal(pari.bloc, `${pari.date}|EPL`);
  // La mise de Kelly du moteur, calculée sur la bankroll du banc (1 000) : un nombre fini, jamais NaN (bug volontaire 31).
  assert.ok(Number.isFinite(pari.miseKelly) && pari.miseKelly > 0, `mise de Kelly : ${pari.miseKelly}`);
  const regle = j.resumeParis.find((p) => p.cle === 'P2|fd-avant-match|moteur');
  assert.ok(Number.isFinite(regle.kelly.mise) && regle.kelly.mise > 0 && Number.isFinite(regle.kelly.rendement), 'le résumé Kelly en nombres finis');
  assert.ok(regle.refus.trop_peu_de_bookmakers >= 1, 'sans Pinnacle');
  assert.ok(regle.refus.aucun_bookmaker_autorise >= 1, 'Pinnacle sans William Hill');
  assert.ok(regle.refus.value_hors_limites >= 1, 'au-delà de la cote 5');
  assert.ok(!j.paris.some((p) => p.fixtureKey === j.plantes.find((x) => x.n === 4).fixtureKey && p.regle === 'moteur'), 'jamais au-delà de 5');
  assert.equal(regle.n, j.paris.filter((p) => p.regle === 'moteur').length);
  const variante = j.resumeParis.find((p) => p.cle === 'P2|fd-avant-match|v-proxy-bet365');
  assert.ok(variante && variante.vosParis === false && /pas le prix d’un de vos bookmakers/i.test(variante.phrase), 'la variante Bet365, à part, jamais « vos paris »');
  assert.ok(!('verdict' in regle.rendement.juge), 'rendement sans verdict');
});

test('règlement : la coupe d’Allemagne prolongée réglée à la 90e minute (jamais la 120e), sans score à 90 non réglable, ses statistiques non réglables ; un match attribué écarté de tout ; des corners 0-0 « non relevés »', () => {
  const j = paris();
  let a90 = 0;
  for (const k of j.reglement.prolonges) {
    const t = j.sql.equipes[k];
    const l = j.reglement.lignes.find((x) => x.matchKey === k && x.marketKey === 'result');
    if (!l) continue;
    if (t.bp90 === null) assert.equal(l.nonReglable, 'prolongationSansScore90', k);
    else {
      assert.equal(l.issue, issue1N2(t.bp90, t.bc90), `${k} : la 90e minute`);
      a90++;
    }
    for (const stat of ['totalCorners', 'totalShots']) {
      const s = j.reglement.lignes.find((x) => x.matchKey === k && x.marketKey === stat);
      if (s) assert.ok(['prolongationStats', 'sansPronostic'].includes(s.nonReglable), `${k} ${stat} : ${s.nonReglable}`);
    }
  }
  assert.ok(a90 >= 2, 'des matchs prolongés réglés à 90 minutes');
  assert.ok(
    j.reglement.prolonges.some((k) => j.sql.equipes[k].bp90 !== null && issue1N2(j.sql.equipes[k].bp90, j.sql.equipes[k].bc90) !== issue1N2(j.sql.equipes[k].bp, j.sql.equipes[k].bc)),
    'un match dont la 120e change l’issue'
  );
  assert.ok(j.reglement.lignes.some((l) => l.marketKey === 'totalCorners' && l.nonReglable === 'prolongationStats'), 'des statistiques prolongées non réglables');
  assert.equal(j.reglement.bilan.attribue, 1);
  assert.ok(!j.reglement.lignes.some((l) => l.matchKey === j.reglement.attribue), 'attribué : ni pronostic ni pari');
  const zero = j.reglement.lignes.find((l) => l.matchKey === j.reglement.zero && l.marketKey === 'totalCorners');
  assert.ok(zero && ['statNonRelevee', 'sansPronostic'].includes(zero.nonReglable), `corners 0-0 : ${zero?.nonReglable}`);
});

// ==================================================================== les cotes archivées

test('cotes gratuites à la coupure (H − 60) : ouverture et pré-clôture toujours, relevé et clôture seulement avant, le direct jamais ; vos bookmakers : le dernier relevé admis, frais ou à rafraîchir ; la même construction que freeMarketOddsFor', () => {
  const j = lancer('prix');
  const [k1, k2, k3, k4] = j.gratuites;
  assert.deepEqual([k1.odds1, k1.byBookmaker[0].kind, k1.byBookmaker[0].releveAt], [2.3, 'snapshot', '2026-03-14T17:30:00.000Z'], 'le relevé H − 90');
  assert.deepEqual([k2.odds1, k2.byBookmaker[0].kind], [1.9, 'close'], 'une clôture relevée à J − 3 : prise');
  assert.equal(k3, null, 'une clôture relevée à H − 5 : écartée');
  assert.deepEqual([k4.odds1, k4.byBookmaker[0].kind], [2.6, 'open'], 'une ouverture rattrapée : prise, le direct jamais');
  assert.ok(k1.byBookmaker.every((b) => b.referenceOnly), 'référence seulement');
  const livres = Object.fromEntries(j.vos.byBookmaker.map((b) => [b.key, b]));
  assert.deepEqual([livres.williamhill.odds1, livres.williamhill.releveAt], [2.45, '2026-03-14T17:30:00.000Z'], 'William Hill : H − 90, jamais H − 30 ni le direct');
  assert.equal(livres.betsson.releveAt, '2026-03-11T19:00:00.000Z');
  assert.ok(!j.vos.byBookmaker.some((b) => b.referenceOnly), 'vos bookmakers sont jouables');
  assert.deepEqual(j.fraicheur, { williamhill: 'fraiche', betsson: 'a-rafraichir' });
  assert.deepEqual(j.egalite.banc, j.egalite.appli);
  assert.equal(j.egalite.appli.livres.length, 2, 'sans le maximum ni la bourse sans volume');
});

// ==================================================================== la route

test('route : GET /api/bench sans rejeu (structure complète) ; POST sous verrou → 409, invalide → 400 ; un rejeu dans le serveur → 202 ; une passe pendant le banc REPORTÉE (jamais son bilan) ; bench_runs : un INSERT, un UPDATE, un second refusé', () => {
  const j = lancer('route', { scripts: true });
  for (const cle of ['noteDeDepart', 'dernierRejeu', 'enCours', 'rejeux', 'periodes', 'jeux', 'regles', 'decisions', 'provenance']) assert.ok(cle in j.vide, cle);
  assert.equal(j.vide.dernierRejeu, null);
  assert.deepEqual(j.vide.rejeux, []);
  // La note de départ telle que la page la reçoit (conception §10, 8) ; la fiabilité affichée, pour la poser à côté.
  const note = j.vide.noteDeDepart;
  assert.equal(note.format, 1);
  assert.match(note.moteur.empreinte, /^[0-9a-f]{40}$/);
  assert.deepEqual([note.reproduction.lectureDirecte.matchs, note.reproduction.lectureDirecte.justes, note.reproduction.lectureDirecte.perteLog], [12997, 50.26, 1.0034]);
  assert.deepEqual(Object.keys(j.vide.fiabilite).sort(), ['cotes', 'score:cotes', 'score:statistiques', 'statistiques']);
  assert.equal(j.vide.fiabilite.cotes.length, 6);
  assert.equal(j.sousVerrou.code, 409);
  assert.match(j.sousVerrou.corps.error, /tient la base/);
  assert.equal(j.invalide.code, 400);
  assert.equal(j.lance.code, 202);
  assert.match(j.passePendantLeBanc.skipped, /banc en cours dans ce processus/);
  assert.ok(!('bilan' in j.passePendantLeBanc), 'jamais le bilan du banc');
  assert.equal(j.encore, 409, 'un second rejeu refusé pendant le premier');
  assert.equal(j.apres.enCours, null);
  assert.equal(j.apres.refus, null);
  assert.deepEqual([j.apres.dernier.ou, j.apres.dernier.finiLe, j.apres.dernier.erreur], ['serveur', true, null]);
  assert.deepEqual(j.apres.dernier.tranches, ['P3']);
  assert.ok(j.apres.dernier.variantes >= 1);
  assert.deepEqual(j.passeApres, { bilan: 'de la passe' });
  assert.deepEqual(j.depot.ouverte, { fini_le: null, bilan: null, resume: null });
  assert.equal(j.depot.second, 'RejeuDejaFini');
  assert.deepEqual(j.depot.apresSecond, j.depot.finie);
});

// ==================================================================== le script du bac

test('scripts/bench.mjs dans un bac simulé : bilan JSON, la main rendue, une ligne bench_runs finie par rejeu ; export JSON Lines (27 lignes par rencontre) ; --comparer (pas de verdict sans variantes) ; refus sous OneDrive et sous un verrou tenu', () => {
  const copie = preparerCopieDeBac({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const p = executerDansLeBac(copie, SCRIPT, { args: ['preparer'], timeout: 120_000 });
    assert.equal(p.code, 0, p.erreurs.slice(-2000));
    const BENCH = path.join(copie.serveur, 'scripts', 'bench.mjs');
    const a = path.join(copie.dossier, 'a.jsonl');
    const b = path.join(copie.dossier, 'b.jsonl');
    const run = (args, env = {}) => executerDansLeBac(copie, BENCH, { args, env, timeout: 120_000 });
    const r1 = run(['--json', '--periodes', 'P4', '--prix', 'fd-cloture', '--de', '2026-09-12', '--tirages', '100', '--lignes', a]);
    assert.equal(r1.code, 0, r1.erreurs.slice(-2000));
    assert.equal(r1.json.bilan.erreur, null);
    assert.ok(r1.json.bilan.blocMaxMs < 2000, `blocMaxMs ${r1.json.bilan.blocMaxMs}`);
    assert.ok(r1.json.bilan.pauses > 0, 'la main rendue (setImmediate) dans le script aussi');
    assert.ok(Number.isInteger(r1.json.bilan.battements), 'les battements du verrou sont comptés');
    assert.ok(r1.json.export.lignes > 0);
    const config = path.join(copie.dossier, 'candidate.json');
    fs.writeFileSync(
      config,
      JSON.stringify({ football: { edgeThresholdMin: 0.02, edgeThresholdMax: 0.25, valueBookmakers: ['williamhill'], maxValueOdds: 5, defaultCorrelation: -0.15, kellyFraction: 0.125, maxStakePercent: 0.02, homeAdvantage: 1.06, cornersAdjustmentMax: 0.08, maxExpectedRateGap: 0.4, weights: { market: 1, structural: 0, exogenous: 0 } } })
    );
    const r2 = run(['--json', '--periodes', 'P4', '--prix', 'fd-cloture', '--de', '2026-09-12', '--tirages', '100', '--lignes', b, '--config', config]);
    assert.equal(r2.code, 0, r2.erreurs.slice(-2000));
    assert.notEqual(r2.json.moteur.empreinte, r1.json.moteur.empreinte, 'une autre config : une autre empreinte');
    // Les réglages en service ont leurs fenêtres vues déclarées (lancements.js) ; une candidate sans --vues : étiquettes incomplètes (A §6.4).
    assert.equal(r1.json.bilan.etiquette, 'complete');
    assert.equal(r2.json.bilan.etiquette, 'incomplete');
    const entete = JSON.parse(fs.readFileSync(a, 'utf8').split('\n')[0]);
    assert.deepEqual([entete.formatEchange, entete.reglement, entete.moteur.empreinte], [1, 'bp90', r1.json.moteur.empreinte]);
    const lignesA = fs.readFileSync(a, 'utf8').trim().split('\n').slice(1).map((t) => JSON.parse(t)).filter((l) => l.type === 'ligne');
    const parMatch = new Map();
    for (const l of lignesA) parMatch.set(l.fixtureKey, (parMatch.get(l.fixtureKey) ?? 0) + 1);
    assert.ok(parMatch.size > 0 && [...parMatch.values()].every((n) => n === 27), '27 lignes par rencontre et par jeu');
    const c = run(['--comparer', a, b, '--mesure', 'perte-log', '--tirages', '100']);
    assert.equal(c.code, 0, c.erreurs.slice(-2000));
    assert.equal(c.json.verdict, null, 'sans --variantes ni --etapes : pas de verdict');
    assert.ok(c.json.paires > 0);
    assert.deepEqual([c.json.empreintes.a.empreinte, c.json.empreintes.b.empreinte], [r1.json.moteur.empreinte, r2.json.moteur.empreinte]);
    const cv = run(['--comparer', a, b, '--variantes', '2', '--tirages', '100']);
    assert.ok(['retenu', 'pas-prouve', 'moins-bon', 'pas-assez-de-matchs'].includes(cv.json.verdict));
    const db = new DatabaseSync(copie.base, { readOnly: true });
    let rangs;
    try {
      rangs = db.prepare('SELECT ou, fini_le, resume IS NOT NULL AS resume FROM bench_runs ORDER BY id').all();
    } finally {
      db.close();
    }
    assert.deepEqual(rangs.map((r) => [r.ou, Boolean(r.fini_le), r.resume]), [['bac', true, 1], ['bac', true, 1]]);
    // Refus : un export sous OneDrive (le faux OneDrive des essais) ; un verrou tenu par un autre processus vivant.
    const onedrive = path.join(copie.dossier, 'FauxOneDrive');
    fs.mkdirSync(onedrive);
    const o = run(['--json', '--lignes', path.join(onedrive, 'x.jsonl')], { CM_TEST_ONEDRIVE: onedrive });
    assert.equal(o.code, 2);
    assert.match(o.json.refus, /jamais sous OneDrive/);
    const maintenant = new Date().toISOString();
    fs.writeFileSync(path.join(copie.serveur, 'data', 'runtime', 'espn-refresh.lock'), JSON.stringify({ pid: process.pid, token: 'essai', startedAt: maintenant, heartbeatAt: maintenant }));
    const v = run(['--json', '--periodes', 'P4']);
    assert.equal(v.code, 2);
    assert.match(v.json.refus, /verrou d'actualisation est tenu/);
  } finally {
    copie.nettoyer();
  }
});
