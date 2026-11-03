/**
 * LES CARTONS (étape 33, lot 1b, partie C1, 02/11/2026) — la nuit.
 *   node --test test/cartonsNuit.test.mjs        (depuis server/)
 *
 * Sur un MAGASIN FABRIQUÉ (cartonsFabrique.mjs, dans une copie isolée : base neuve, réseau coupé, heure figée), plusieurs
 * nuits de suite (script-cartons-nuit.mjs, phase « nuit ») :
 * T-N1 le cache n'est relu que pour les rencontres nouvelles ou changées (leur signature) ; une ligne d'une autre version
 *      relit tout ;
 * T-N2 les tables du jour (équipes, arbitres, compétitions) = l'état de CartonsAuJourJ au jour de la nuit, À L'OCTET ; les
 *      faux arbitres du placebo ne sont jamais rangés ; les homonymes restent deux arbitres ;
 * T-N3 le jeton du calcul lourd pris par un autre → « reportée », rien de rangé ; un délai dépassé → le processus à part
 *      arrêté, rien de rangé ; le calcul tourne bien dans un AUTRE processus ;
 * T-N4 le rangement par tranches (une transaction par tranche, 250 par défaut), « en cours » posé puis retiré, la reprise
 *      après une nuit interrompue ; le serveur jamais tenu plus de 300 ms d'affilée ;
 * T-N5 le contrôle anti-fuite : 20 couples recalculés par un second chemin (la composition des fenêtres, clés et comptes ;
 *      les sommes de l'arbitre), 0 écart ; une fuite plantée (les couples relevés APRÈS la publication de leur journée :
 *      une fenêtre « date <= J ») → des écarts nommés, chacun avec sa phrase, et l'alerte durable ;
 * T-N6 l'étape de la passe : une fois par jour civil de Paris, reprise si reportée, jamais au clic ; entre « contexteDuMatch »
 *      et « controleQuotidien » ; son résumé ; le module chargé par import() DYNAMIQUE — s'il ne se charge pas, l'étape est
 *      en échec et la passe ne lève pas (critique, constat 16) ; le module se charge ;
 * T-X10 les deux fichiers GELÉS retouchés par le lot 1b (règle du gel pendant l'essai 27 : matchStatsAutoRefresh.js et
 *      lineupContext.js) : privés de leurs blocs marqués « ajout pur », ils sont À L'OCTET ceux d'avant (sha1 relevés en
 *      partie 0 du lot 1b, = dépôt) — rien de ce qu'ils écrivaient ne change ; les blocs ajoutés n'écrivent rien et
 *      n'importent data/cartons/ que par import() dynamique ;
 * T-X11 les nouveaux fichiers de data/cartons/ : le contrôle et la lecture n'écrivent rien ; le serveur (cartonsNuit.js)
 *      est le seul écrivain, sur les seules tables cartons_* ; aucun n'est atteint par le moteur ni par le chemin de
 *      l'essai 27.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { __testing as JOB, __cartonsPourLesTests as CARTONS } from '../src/jobs/matchStatsAutoRefresh.js';
import { fichiersDuMoteur } from '../src/core/engine/engineVersions.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-cartons-nuit.mjs');
const SRC = path.join(SERVEUR, 'src');
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const sansCommentaires = (texte) => texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
let memo;
const nuit = () => {
  if (memo) return memo;
  const copie = preparerCopie({ base: false });
  try {
    const r = executer(copie, SCRIPT, { args: ['nuit', '{}'], timeout: 300_000 });
    assert.equal(r.code, 0, `nuit :\n${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false, 'un appel réseau a été tenté');
    memo = r.json;
    return memo;
  } finally {
    copie.nettoyer();
  }
};

test('T-N1 le cache n’est relu que pour les rencontres nouvelles ou changées (signature) ; la nuit suivante ne relit rien ; une ligne d’une autre version relit tout', () => {
  const s = nuit();
  assert.equal(s.nuitA.mode, 'complet', s.nuitA.erreur ?? '');
  assert.equal(s.nuitA.cache.mode, 'premier');
  assert.equal(s.nuitA.cache.relues, s.matchs, 'la première nuit relit tout le registre');
  assert.equal(s.nuitA.rencontres.ecrites, s.matchs);
  assert.equal(s.nuitA.base.rencontres, s.matchs);
  assert.deepEqual([s.nuitB.mode, s.nuitB.cache.mode, s.nuitB.cache.relues, s.nuitB.rencontres.ecrites], ['complet', 'rien', 0, 0], 'rien n’a changé : rien n’est relu');
  assert.deepEqual([s.nuitC.cache.mode, s.nuitC.cache.relues, s.nuitC.rencontres.ecrites], ['incremental', 2, 2], 'deux rencontres changées : deux relues');
  assert.deepEqual([s.nuitD.cache.mode, s.nuitD.cache.relues], ['complet', s.matchs], 'une ligne d’une autre version : tout est relu');
});

test('T-N2 les tables du jour = l’état de CartonsAuJourJ au jour de la nuit, à l’octet ; les faux arbitres jamais rangés ; deux homonymes restent deux arbitres', () => {
  const s = nuit();
  const o = s.oracle;
  assert.ok(o.equipes >= 18 && o.arbitres >= 5, JSON.stringify(o)); // les 6 clubs de la compétition aux déroulés de buts n’ont aucun match relevé
  assert.equal(o.equipesEgales, true, 'équipes');
  assert.equal(o.arbitresEgaux, true, 'arbitres');
  assert.equal(o.liguesEgales, true, 'compétitions');
  assert.equal(o.jourDesLigues, s.jourD);
  assert.ok(o.fauxArbitres > 0, 'le placebo existe en mémoire…');
  assert.ok(!s.nuitA.base.arbitres.some((a) => a.cle.startsWith('faux:')), '… et n’est jamais rangé');
  assert.deepEqual(o.homonymes.sort(), ['Jean Dupont|Belgium', 'Jean Dupont|France']);
  assert.equal(s.nuitA.base.equipes.length, s.nuitA.equipes.ecrites);
  const e = o.exempleEquipe;
  assert.ok(e.n > 0 && e.n <= 20 && e.pris > 0 && e.rho > 0 && e.pi > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.dernier) && typeof e.league === 'string', JSON.stringify(e));
  // La couverture par compétition-saison (statuts après la garde ; cartons du banc et du staff comptés à part).
  const parLigue = Object.fromEntries(s.couverture.lignes.map((c) => [c.league, c]));
  assert.ok(parLigue['Liga Buts'].releves === 0 && (parLigue['Liga Buts'].statuts['non-releve'] ?? 0) > 0, 'la compétition à déroulés de buts : jamais relevée');
  assert.ok(parLigue['Ligue Test'].horsTerrain > 0, 'les cartons du banc et du staff comptés à part');
  assert.ok((parLigue['Coupe Test'].statuts.prolonge ?? 0) > 0 && (parLigue['Coupe Test'].statuts.attribue ?? 0) > 0);
  assert.ok(s.nuitA.passe.releves > 0 && s.nuitA.passe.ligneAZero > 0);
});

test('T-N3 le jeton du calcul lourd pris par un autre : « reportée », rien de rangé ; un délai dépassé : le processus à part arrêté, rien de rangé ; le calcul tourne dans un AUTRE processus', () => {
  const s = nuit();
  assert.equal(s.reporte.mode, 'reporte');
  assert.match(s.reporte.raison, /un autre calcul lourd/);
  assert.equal(s.reporteInchange, true, 'rien de rangé quand c’est reporté');
  assert.equal(s.delai.mode, 'echec');
  assert.match(s.delai.erreur, /aucune réponse en 1 ms/);
  assert.equal(s.delaiInchange, true, 'rien de rangé quand le délai est dépassé');
  assert.ok(Number.isInteger(s.nuitA.aPart.pid) && s.nuitA.aPart.pid !== s.pid, `le calcul dans un autre processus (${s.nuitA.aPart.pid} ≠ ${s.pid})`);
  assert.ok(s.nuitA.aPart.rssMaxOctets > 0);
});

test('T-N4 le rangement par tranches (une transaction par tranche), « en cours » posé puis retiré, la reprise après une nuit interrompue ; le serveur jamais tenu plus de 300 ms d’affilée', () => {
  const s = nuit();
  const D = s.nuitD;
  assert.equal(D.mode, 'complet', D.erreur ?? '');
  assert.ok(D.transactions >= Math.ceil(D.rencontres.ecrites / 5), `${D.transactions} transactions pour ${D.rencontres.ecrites} rencontres par tranches de 5`);
  assert.ok(D.ordresMax >= 1 && D.ordresMax <= 5, `jamais plus de 5 ordres dans une transaction (${D.ordresMax})`);
  assert.ok(s.nuitA.ordresMax > 5 && s.nuitA.ordresMax <= 250, `nuit A : tranches de 250 (${s.nuitA.ordresMax})`);
  assert.equal(s.interrompue.mode, 'complet');
  assert.equal(s.interrompue.repriseApres, '2026-07-01T00:00:00.000Z');
  assert.deepEqual(s.interrompue.base.etat, ['controle', 'couverture', 'ligues', 'nuit'], '« en cours » retiré');
  assert.deepEqual(s.nuitA.base.etat, ['controle', 'couverture', 'ligues', 'nuit']);
  // La vraie nuit (le calcul dans le processus à part) : le serveur jamais tenu plus de 300 ms ; les nuits d’essai calculées ICI
  // (aPart: false) tiennent le processus le temps du calcul, mais leur rangement reste par tranches courtes.
  assert.ok(s.nuitA.blocMaxMs < 300, `tenu ${s.nuitA.blocMaxMs} ms d’affilée`);
  for (const n of [s.nuitA, s.nuitB, s.nuitC, s.nuitD, s.interrompue]) assert.ok(n.plusLongueTrancheMs < 300, `une tranche de ${n.plusLongueTrancheMs} ms`);
});

test('T-N5 le contrôle anti-fuite : 20 couples recalculés par un second chemin (clés et comptes des fenêtres, sommes de l’arbitre), 0 écart chaque nuit ; une fuite plantée → des écarts nommés, avec leur phrase, et l’alerte durable', () => {
  const s = nuit();
  for (const n of [s.nuitA, s.nuitB, s.nuitC, s.nuitD, s.interrompue]) {
    assert.equal(n.controle.couples, 20);
    assert.equal(n.controle.lignes, 20);
    assert.deepEqual(n.controle.ecarts, []);
    assert.ok(n.controle.ligues >= 2, 'des compétitions relues par le second chemin');
  }
  assert.deepEqual([s.controleRange.couples, s.controleRange.lignes, s.controleRange.ecarts], [20, 20, []]);
  assert.ok(s.fuite.ecarts > 0);
  assert.ok(s.fuite.colonnes.includes('fenetre'), s.fuite.colonnes.join(', '));
  for (const t of s.fuite.textes) assert.match(t, /avant le \d{2}\/\d{2}\/2026 : /);
  assert.match(s.fuite.textes.find((t) => /fenêtre/.test(t)), /fenêtre des cartons de \d+ match\(s\) pour la passe, \d+ pour le second chemin/);
  assert.equal(s.etape.alert.key, 'cartonsEtCorners');
  assert.equal(s.etape.alert.value, null, 'aucun écart : l’alerte retombe');
  assert.equal(s.etapeFuite.status, 'warn');
  assert.equal(s.etapeFuite.alert.value.total, s.fuite.ecarts);
  assert.ok(s.etapeFuite.alert.value.ecarts.every((e) => typeof e.texte === 'string' && e.texte));
  assert.match(s.etapeFuite.summary, /écarts? au contrôle anti-fuite .* — à regarder/);
});

test('T-N6 l’étape « cartonsEtCorners » : entre le contexte du match et le contrôle quotidien ; une fois par jour civil de Paris, reprise si reportée, jamais au clic ; son résumé ; le module chargé par import() dynamique (s’il ne se charge pas : l’étape en échec, la passe ne lève pas)', async () => {
  const etapes = JOB.ETAPES().map((e) => e.key);
  assert.deepEqual(etapes.slice(-3), ['contexteDuMatch', 'cartonsEtCorners', 'controleQuotidien']);
  assert.ok(etapes.indexOf('cartonsEtCorners') > etapes.indexOf('sauvegarde') && etapes.indexOf('cartonsEtCorners') > etapes.indexOf('moteurABlanc'));
  const ctx = (derniere, details = null, manuel = false) => ({ manuel, derniere: () => derniere, derniersDetails: () => details });
  assert.equal(CARTONS.dueCartonsEtCorners(ctx(null)), true);
  assert.equal(CARTONS.dueCartonsEtCorners(ctx(new Date().toISOString())), false);
  assert.equal(CARTONS.dueCartonsEtCorners(ctx(new Date().toISOString(), null, true)), false, 'jamais au clic');
  assert.equal(CARTONS.dueCartonsEtCorners(ctx(new Date().toISOString(), { reporte: true })), true, 'reprise si reportée');
  const s = nuit();
  assert.equal(s.etape.status, 'ok');
  assert.match(s.etape.summary, /^Cartons et corners : \d[\d  ]* rencontres au cache \(\d[\d  ]* relues\), \d[\d  ]* aux cartons relevés \(dont \d+ au déroulé seul : jaunes publiés à 0 par FotMob\), \d+ équipes, \d+ arbitres ; contrôle anti-fuite : 20 couples recalculés par un second chemin, 0 écart ; /);
  assert.match(s.etape.summary, /Preuve sur vos matchs : reportée \(étape 33, partie C2\)\. À blanc : jamais lu par le moteur ni envoyé à l’IA\.$/);
  assert.equal(s.etapeReporte.status, 'warn');
  assert.equal(s.etapeReporte.details.reporte, true);
  assert.equal(s.etapeEchec.status, 'error');
  // Le module des cartons qui ne se charge pas : l'étape en échec, la passe ne lève pas (rien n'est lu ni écrit).
  const illisible = await CARTONS.passeCartonsEtCorners({}, { chargerLeModule: () => Promise.reject(new Error('SyntaxError: module des cartons cassé')) });
  assert.equal(illisible.status, 'error');
  assert.match(illisible.summary, /le module des cartons ne se charge pas \(SyntaxError: module des cartons cassé\) — rien d’avancé ; le reste de la nuit n’en dépend pas/);
  // Une panne du calcul lui-même (ici : sans heure de passe lisible) : l'étape en échec, sans exception.
  const panne = await CARTONS.passeCartonsEtCorners({}, { chargerLeModule: async () => ({ faireLesCartonsDeLaNuit: async () => { throw new Error('panne fabriquée'); }, resultatDeLEtape: () => null }) });
  assert.deepEqual([panne.status, panne.details.erreur], ['error', 'panne fabriquée']);
  // Le module se charge (le garde « le module se charge », critique, constat 16).
  const m = await import('../src/data/cartons/cartonsNuit.js');
  assert.equal(typeof m.faireLesCartonsDeLaNuit, 'function');
  assert.equal(typeof (await import('../src/data/cartons/cartonsRead.js')).cartonsDuMatch, 'function');
});

/** Les sha1 (octets bruts) des fichiers GELÉS retouchés par le lot 1b, relevés en partie 0 du lot 1b (02/11/2026, 23 h 27, = dépôt). */
const GELES_RETOUCHES = Object.freeze([
  ['jobs/matchStatsAutoRefresh.js', '15e5c8893bcc5124d6aa029115580a83a6e3f45e'],
  ['data/providers/lineupContext.js', '0694ca054859bd2390bc721af33a61c83f8fa723']
]);
const DEBUT = /\[étape 33, lot 1b : ajout pur, début\]/;
const FIN = /\[étape 33, lot 1b : ajout pur, fin\]/;
function blocs(texte) {
  const garde = [];
  const ajoutes = [];
  let dans = null;
  for (const l of texte.split('\n')) {
    if (DEBUT.test(l)) {
      dans = [];
      continue;
    }
    if (FIN.test(l)) {
      ajoutes.push(dans.join('\n'));
      dans = null;
      continue;
    }
    (dans ?? garde).push(l);
  }
  return { garde: garde.join('\n'), ajoutes };
}

test('T-X10 les fichiers GELÉS retouchés (matchStatsAutoRefresh.js, lineupContext.js) : sans leurs blocs « ajout pur », identiques À L’OCTET à ceux d’avant ; les blocs n’écrivent rien et n’atteignent data/cartons/ que par import() dynamique', () => {
  for (const [f, attendu] of GELES_RETOUCHES) {
    const { garde, ajoutes } = blocs(fs.readFileSync(path.join(SRC, f), 'utf8'));
    assert.ok(ajoutes.length >= 1, `${f} : au moins un bloc ajouté`);
    assert.equal(sha1(Buffer.from(garde, 'utf8')), attendu, `${f} : hors des blocs marqués, rien ne change (ce qu’il écrit non plus)`);
    for (const b of ajoutes) {
      const code = sansCommentaires(b);
      assert.doesNotMatch(code, /\.run\(|INSERT\s|UPDATE\s|DELETE\s|upsert|writeJson|writeFile|\.exec\(/, `${f} : un bloc ajouté écrit`);
      assert.doesNotMatch(code, /^import .* from/m, `${f} : aucun import statique ajouté`);
      for (const m of code.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) assert.match(m[1], /\/cartons\/(cartonsNuit|cartonsRead)\.js$/, m[1]);
    }
  }
});

test('T-X11 les nouveaux fichiers de data/cartons/ : le contrôle et la lecture n’écrivent rien ; cartonsNuit.js n’écrit que les tables cartons_* ; aucun n’est atteint par le moteur ni par le chemin de l’essai 27', () => {
  const C = path.join(SRC, 'data', 'cartons');
  for (const f of ['controleDesCartons.js', 'cartonsRead.js']) {
    const code = sansCommentaires(fs.readFileSync(path.join(C, f), 'utf8'));
    assert.doesNotMatch(code, /\.run\(|INSERT\s|UPDATE\s|DELETE\s|writeJsonAtomic|writeFileSync|\.exec\(/, `${f} : aucune écriture`);
    assert.doesNotMatch(code, /Date\.now\(|new Date\(\)|Math\.random|fetch\(/, `${f} : ni horloge, ni hasard, ni réseau`);
  }
  const nuitCode = sansCommentaires(fs.readFileSync(path.join(C, 'cartonsNuit.js'), 'utf8'));
  assert.doesNotMatch(nuitCode, /Date\.now\(|new Date\(\)|Math\.random|fetch\(/, 'la nuit : l’heure est reçue');
  for (const m of nuitCode.matchAll(/(?:INSERT INTO|DELETE FROM|(?<!DO )UPDATE)\s+(\$\{table\}|\w+)/g)) assert.match(m[1], /^(cartons_\w+|\$\{table\})$/, m[0]);
  const tables = [...nuitCode.matchAll(/table: '(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(tables, ['cartons_equipes', 'cartons_arbitres']);
  const atteints = (depart) => {
    const vus = new Set();
    const pile = [...depart];
    while (pile.length) {
      const f = pile.pop();
      if (vus.has(f) || !fs.existsSync(f)) continue;
      vus.add(f);
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) pile.push(path.resolve(path.dirname(f), m[1]));
    }
    return [...vus].map((f) => path.relative(SRC, f).split(path.sep).join('/'));
  };
  const moteur = atteints(fichiersDuMoteur().map((f) => path.join(SRC, f)));
  const essai = atteints(['data/enregistreurs/moteurABlanc.js', 'data/enregistreurs/gelPronostics.js', 'bench/essaiCandidate.js'].map((f) => path.join(SRC, f)));
  for (const f of ['cartonsNuit.js', 'controleDesCartons.js', 'cartonsRead.js', 'cartonsEnfant.js']) {
    assert.ok(!moteur.includes(`data/cartons/${f}`), `${f} atteint depuis le moteur`);
    assert.ok(!essai.includes(`data/cartons/${f}`), `${f} atteint depuis le chemin de l’essai 27`);
  }
});
