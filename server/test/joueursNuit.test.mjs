/**
 * LES CHIFFRES DES JOUEURS (étape 34, lot 1b, partie C1, 03/11/2026) — la nuit, l'archive d'avant-match, l'enregistreur.
 *   node --test test/joueursNuit.test.mjs        (depuis server/)
 *
 * Sur un MAGASIN FABRIQUÉ (joueursFabrique.mjs, dans une copie isolée : base neuve, réseau coupé, heure figée), plusieurs
 * nuits de suite et l'enregistreur d'avant-match (script-joueurs-nuit.mjs) :
 * T-N1 les tables du jour (fiches, repères) = l'état de JoueursAuJourJ au jour de la nuit, À L'OCTET ; les entrées d'une
 *      compo refaites depuis les fiches = celles de l'accumulateur ; la base de chaque match à venir (λ, S, C, dernière
 *      feuille) ; un club sans identifiant compté et nommé, jamais rapproché ;
 * T-N2 le jeton du calcul lourd pris par un autre → « reportée », rien de rangé ; un délai dépassé → le processus à part
 *      arrêté, rien de rangé ; le calcul tourne bien dans un AUTRE processus ;
 * T-N3 le rangement par tranches (250 par défaut ; 5 ici), « en cours » posé puis retiré (la lecture dit alors « pas encore
 *      calculé »), la reprise après une nuit interrompue ; le serveur jamais tenu plus de 300 ms d'affilée par la vraie nuit ;
 * T-N4 le contrôle anti-fuite : 20 couples (joueur, jour) recalculés par un second chemin, 0 écart ; une fuite plantée (les
 *      couples relevés APRÈS la publication de leur journée) → des écarts nommés, chacun avec sa phrase, et l'alerte durable ;
 * T-N5 l'enregistreur d'avant-match : « publiee » écrite avant le coup d'envoi, jamais après ; une compo relue plus tard la
 *      remplace ; la même compo n'est pas réécrite ; « derniere-alignee » jamais écrasée (ni par « publiee », ni par la nuit
 *      suivante) ; verrou d'actualisation tenu → rien ; budget dépassé → la suite au tour suivant ; sans note → rien ;
 * T-N6 la candidate de l'étape 27 : sa table n'est lue que par le dépôt des enregistreurs (gelé pendant l'essai 27 ;
 *      moteurABlanc.test.mjs) — l'archive garde la clé pour la rejoindre à la preuve (jour, clubs, match, heure du coup
 *      d'envoi) ; data/joueurs/ ne la lit jamais, ni pour un chiffre ;
 * T-F6 l'archive n'est jamais écrite après le coup d'envoi ; un match sans heure sûre n'est archivé que la veille ; rien
 *      au-delà de 36 heures ; les absents annoncés RETIRÉS de la dernière alignée (critique, constat 3), gardés dans la base ;
 * T-N7 l'étape de la passe : une fois par jour civil de Paris, reprise si reportée, jamais au clic ; entre « cartonsEtCorners »
 *      et « controleQuotidien » ; son résumé ; le module chargé par import() DYNAMIQUE — s'il ne se charge pas, l'étape est
 *      en échec et la passe ne lève pas ; le module se charge ; le tour des enregistreurs de même ;
 * T-X9 (lot 1b) seuls l'actualisation, les enregistreurs et la route de l'analyse atteignent data/joueurs/, par import()
 *      DYNAMIQUE seulement ; le graphe des imports statiques depuis server.js n'y mène pas ; lineupContext.js, le chemin de
 *      l'essai 27 et le moteur n'y mènent pas ;
 * T-X10 les deux fichiers GELÉS retouchés par le lot 1b (règle du gel pendant l'essai 27 : matchStatsAutoRefresh.js et
 *      enregistreurs.js) : privés de leurs blocs marqués « ajout pur », ils sont À L'OCTET ceux d'avant (sha1 relevés en
 *      partie 0 du lot 1b, = dépôt) ; les blocs ajoutés n'écrivent rien et n'atteignent data/joueurs/ que par import() ;
 * T-X11 les nouveaux fichiers : la lecture, les compos, les chiffres et le contrôle n'écrivent rien ; la nuit et
 *      l'enregistreur n'écrivent que les tables joueurs_* ; ni horloge ni hasard dans les modules de calcul.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { __testing as JOB, __joueursPourLesTests as JOUEURS } from '../src/jobs/matchStatsAutoRefresh.js';
import { fichiersDuMoteur } from '../src/core/engine/engineVersions.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-joueurs-nuit.mjs');
const SRC = path.join(SERVEUR, 'src');
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const sansCommentaires = (texte) => texte.replace(new RegExp('/[*][^]*?[*]/', 'g'), '').replace(new RegExp('(^|[^:\'"`])//.*$', 'gm'), '$1');
let memo;
const nuit = () => {
  if (memo) return memo;
  const copie = preparerCopie({ base: false });
  try {
    const r = executer(copie, SCRIPT, { args: ['{}'], timeout: 300_000 });
    assert.equal(r.code, 0, `nuit :\n${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false, 'un appel réseau a été tenté');
    memo = r.json;
    return memo;
  } finally {
    copie.nettoyer();
  }
};
const archiveDe = (s, rencontre, etat) => s.apresA.archive.find((a) => a.rencontre === rencontre && a.etat === etat) ?? null;

test('T-N1 les tables du jour = l’état de JoueursAuJourJ au jour de la nuit, à l’octet ; les entrées d’une compo depuis les fiches = celles de l’accumulateur ; la base de chaque match à venir ; un club sans identifiant compté, jamais rapproché', () => {
  const s = nuit();
  assert.equal(s.nuitA.mode, 'complet', s.nuitA.erreur ?? '');
  const o = s.oracle;
  assert.ok(o.fiches >= 300, `${o.fiches} fiches`);
  assert.equal(o.fichesEgales, true, 'fiches');
  assert.equal(o.reperesEgaux, true, 'repères (global, minutes, rapports des compétitions, chance d’entrer)');
  assert.deepEqual(o.calculeLe, [`${s.jourD}T04:00:00.000Z`]);
  assert.equal(o.entreesEgales, true, 'entrées d’une compo : fiches = accumulateur');
  assert.equal(o.titulairesComparés, 11);
  assert.equal(s.nuitA.ecrites.fiches.ecrites, o.fiches);
  // Trois matchs à venir chiffrés (le reporté et le club inconnu n'en sont pas), chacun avec sa base et sa dernière feuille.
  const j = (n) => new Date(Date.parse(`${s.jourD}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  assert.deepEqual(s.apresA.matchs.map((m) => m.rencontre).sort(), [`${j(1)}|7001|7002`, `${j(1)}|7003|7004`, `${j(3)}|7005|7006`]);
  for (const m of s.apresA.matchs) {
    assert.ok(m.lambda_dom > 0.2 && m.lambda_ext > 0.2, 'λ du modèle de buts sans cote');
    assert.ok(m.cadres_dom > 0 && m.cadres_ext > 0, 'S du moteur');
    assert.ok(m.cartes_dom > 0 && m.cartes_ext > 0, 'C de la 33');
    const src = JSON.parse(m.sources);
    assert.ok(src.dernieres.home.cle && src.dernieres.away.cle, 'la dernière feuille de chaque club');
    assert.ok(src.dernieres.home.date < s.jourD, 'une feuille d’avant la nuit');
  }
  assert.equal(s.nuitA.bilan.sansIdentifiant, 1);
  assert.deepEqual(s.nuitA.bilan.inconnus.map((x) => x.inconnus), [['Club Inconnu']]);
});

test('T-N2 le jeton pris → « reportée », rien de rangé ; le délai dépassé → arrêté, rien de rangé ; le calcul tourne dans un AUTRE processus', () => {
  const s = nuit();
  assert.notEqual(s.nuitA.bilan.aPart.pid, s.pid, 'le calcul de la nuit tourne dans un autre processus');
  assert.ok(s.nuitA.bilan.aPart.rssMaxOctets > 0);
  assert.equal(s.reporte.mode, 'reporte');
  assert.match(s.reporte.raison, /un autre calcul lourd|calcul lourd/i);
  assert.equal(s.reporteInchange, true);
  assert.equal(s.delai.mode, 'echec');
  assert.match(s.delai.erreur, /aucune réponse en 1 ms/);
  assert.equal(s.delaiInchange, true);
});

test('T-N3 par tranches, « en cours » posé puis retiré (la lecture attend), la reprise après une nuit interrompue ; le serveur jamais tenu plus de 300 ms par la vraie nuit', () => {
  const s = nuit();
  assert.equal(s.nuitA.ordresMax, 250, 'tranches de 250');
  assert.ok(s.nuitA.blocMaxMs < 300, `${s.nuitA.blocMaxMs} ms d’affilée`);
  assert.equal(s.interrompue.mode, 'complet');
  assert.equal(s.interrompue.repriseApres, '2023-01-01T00:00:00.000Z');
  assert.equal(s.interrompue.ordresMax, 5, 'tranches de 5');
  assert.ok(s.interrompue.transactions > 60, `${s.interrompue.transactions} transactions`);
  assert.ok(!s.interrompueEtat.includes('en_cours'), '« en cours » retiré');
  assert.deepEqual(s.interrompueEtat, ['controle', 'nuit', 'reperes']);
  assert.deepEqual([s.lectures.enCours.etat, s.lectures.enCours.raison], ['pas-encore-calcule', 'nuit-en-cours']);
});

test('T-N4 le contrôle anti-fuite : 20 couples recalculés par un second chemin, 0 écart ; une fuite plantée → des écarts nommés, avec leur phrase, et l’alerte durable', () => {
  const s = nuit();
  for (const n of [s.nuitA, s.nuitB, s.interrompue, s.sansNote]) {
    assert.equal(n.controle.couples, 20);
    assert.equal(n.controle.lignes, 20);
    assert.deepEqual(n.controle.ecarts, []);
  }
  assert.ok(s.fuite.ecarts > 0);
  assert.ok(s.fuite.colonnes.includes('apparitions') && s.fuite.colonnes.includes('derniere'), s.fuite.colonnes.join(', '));
  for (const t of s.fuite.textes) assert.match(t, /^joueur n° \d+ avant le \d{2}\/\d{2}\/\d{4} : /);
  assert.ok(s.fuite.textes.some((t) => /un jour qui n’est pas d’avant le match/.test(t)));
  assert.equal(s.etape.alert.key, 'joueursABlanc');
  assert.equal(s.etape.alert.value, null, 'aucun écart : l’alerte retombe');
  assert.equal(s.etapeFuite.status, 'warn');
  assert.equal(s.etapeFuite.alert.value.total, s.fuite.ecarts);
  assert.ok(s.etapeFuite.alert.value.ecarts.every((e) => typeof e.texte === 'string' && e.texte));
  assert.match(s.etapeFuite.summary, /écarts? au contrôle anti-fuite .* — à regarder/);
});

test('T-N5 l’enregistreur d’avant-match : « publiee » avant le coup d’envoi seulement ; une compo relue plus tard la remplace ; « derniere-alignee » jamais écrasée ; verrou tenu → rien ; budget → la suite au tour suivant', () => {
  const s = nuit();
  const a = s.avantMatch;
  assert.deepEqual([a.dejaLue.matchs, a.dejaLue.dejaLues, a.dejaLue.ecrites], [1, 1, 0], 'la même compo n’est pas réécrite');
  assert.equal(a.verrou.rien, 'verrou d’actualisation tenu');
  assert.deepEqual([a.budget.coupe, a.budget.matchs], [true, 0]);
  assert.deepEqual([a.relue.matchs, a.relue.ecrites], [1, 1], 'une compo relue plus tard remplace « publiee »');
  assert.ok(a.publiee.compo_lue_le > archiveDe(s, a.publiee.rencontre, 'publiee').compo_lue_le);
  assert.ok(a.publiee.compo_lue_le < a.publiee.kickoff && a.publiee.ecrit_le < a.publiee.kickoff, 'écrite avant le coup d’envoi');
  assert.equal(a.derniereInchangee, true, '« derniere-alignee » jamais écrasée');
  assert.equal(a.apres.matchs, 0, 'après le coup d’envoi : rien');
  assert.equal(a.directApres, 'apres-coup-d-envoi', 'une écriture après le coup d’envoi est refusée');
  assert.equal(a.publieeFinale.compo_lue_le, a.publiee.compo_lue_le);
  assert.equal(a.sansNote.rien, 'pas encore de banc d’essai');
  // La nuit suivante ne réécrit rien de l'archive.
  assert.deepEqual(s.nuitB.ecrites.archive, { ecrites: 0, gardees: 3, apresCoupDEnvoi: 0 });
  assert.equal(s.archiveGardee, true);
  // L'archive porte la compo, son état et son heure, la base et ses sources, la version.
  const p = archiveDe(s, a.publiee.rencontre, 'publiee');
  const base = JSON.parse(p.base);
  assert.deepEqual(Object.keys(base).sort(), ['C', 'S', 'absentsRetires', 'candidate27', 'compo', 'dernieres', 'fotmobId', 'lambdaS', 'note', 'recalees'].sort());
  assert.equal(base.compo.etat, 'publiee');
  const lignes = JSON.parse(p.joueurs);
  assert.ok(lignes.length >= 22 + 6, `${lignes.length} lignes (titulaires et remplaçants des deux camps)`);
  for (const l of lignes) assert.equal(l.length, 10);
});

test('T-N6 la candidate de l’étape 27 : l’archive garde la clé pour la rejoindre à la preuve (jour, clubs, match, heure du coup d’envoi) ; sa table n’est jamais lue par data/joueurs/ (seul le dépôt la lit) ni pour un chiffre', () => {
  const s = nuit();
  const a = archiveDe(s, s.avantMatch.publiee.rencontre, 'derniere-alignee');
  const d = JSON.parse(a.base);
  const [jour, home, away] = a.rencontre.split('|');
  assert.deepEqual({ ...d.candidate27, raison: undefined }, { date: jour, homeId: `fotmob-${home}`, awayId: `fotmob-${away}`, fotmobId: '777001', avantLe: a.kickoff, lu: false, raison: undefined });
  assert.match(d.candidate27.raison, /n’est lue que par le dépôt des enregistreurs/);
  for (const f of fs.readdirSync(path.join(SRC, 'data', 'joueurs'))) {
    const code = sansCommentaires(fs.readFileSync(path.join(SRC, 'data', 'joueurs', f), 'utf8'));
    assert.doesNotMatch(code, /engine_candidate_picks|pronosticsABlanc|candidateEnEssai|configDeLaCandidate/, `${f} lit la candidate`);
  }
});

test('T-F6 l’archive jamais après le coup d’envoi ; sans heure sûre, seulement la veille ; rien au-delà de 36 h ; les absents annoncés retirés de la dernière alignée', () => {
  const s = nuit();
  const etats = s.apresA.archive.map((a) => `${a.rencontre.split('|').slice(1).join('-')}:${a.etat}`).sort();
  assert.deepEqual(etats, ['7001-7002:derniere-alignee', '7001-7002:publiee', '7003-7004:derniere-alignee']);
  for (const a of s.apresA.archive) assert.ok(a.ecrit_le < a.kickoff, `${a.rencontre} ${a.etat} écrite avant le coup d’envoi`);
  const m2 = s.apresA.archive.find((a) => a.rencontre.endsWith('|7003|7004'));
  const base = JSON.parse(m2.base);
  assert.deepEqual(base.absentsRetires.home, [s.absent], 'l’absent annoncé est retiré…');
  assert.ok(!JSON.parse(m2.joueurs).some((l) => l[0] === s.absent), '… et n’a pas de ligne');
  assert.equal(JSON.parse(m2.joueurs).filter((l) => l[1] === 'h').length, 10);
  assert.deepEqual(s.nuitA.bilan.archive, { derniereAlignee: 2, publiee: 1, sansHeureSure: 0, sansNote: 0, sansBase: 0 });
  assert.equal(s.sansNote.bilan.archive.sansNote, 1);
  assert.deepEqual(s.sansNote.ecrites.archive, { ecrites: 0, gardees: 0, apresCoupDEnvoi: 0 }, 'sans note : rien gardé');
});

test('T-N7 l’étape « joueursABlanc » : entre les cartons et le contrôle quotidien ; une fois par jour, reprise si reportée, jamais au clic ; son résumé ; le module chargé par import() dynamique', async () => {
  const etapes = JOB.ETAPES().map((e) => e.key);
  // Étape 38 (lot 1b, 04/11/2026) : la combinaison à blanc entre les chiffres des joueurs et le contrôle quotidien.
  // Étape 36 (lot 1, 09/11/2026) : les coupes à blanc entre la combinaison à blanc et le contrôle quotidien.
  assert.deepEqual(etapes.slice(-5), ['cartonsEtCorners', 'joueursABlanc', 'combinaisonABlanc', 'coupesEtMatchsAPart', 'controleQuotidien']);
  assert.ok(etapes.indexOf('joueursABlanc') > etapes.indexOf('sauvegarde') && etapes.indexOf('joueursABlanc') > etapes.indexOf('moteurABlanc'));
  const ctx = (derniere, details = null, manuel = false) => ({ manuel, derniere: () => derniere, derniersDetails: () => details });
  assert.equal(JOUEURS.dueJoueursABlanc(ctx(null)), true);
  assert.equal(JOUEURS.dueJoueursABlanc(ctx(new Date().toISOString())), false);
  assert.equal(JOUEURS.dueJoueursABlanc(ctx(new Date().toISOString(), null, true)), false, 'jamais au clic');
  assert.equal(JOUEURS.dueJoueursABlanc(ctx(new Date().toISOString(), { reporte: true })), true, 'reprise si reportée');
  const s = nuit();
  assert.equal(s.etape.status, 'ok');
  assert.match(s.etape.summary, /^Chiffres des joueurs : \d[\d  ]* fiches, 3 matchs à venir chiffrés \(1 sans leurs deux identifiants : Club Inconnu – Club 7007\), 3 lignes gardées avant le coup d'envoi ; contrôle anti-fuite : 20 joueurs recalculés par un second chemin, 0 écart ; /);
  assert.match(s.etape.summary, /À blanc : jamais lu par le moteur ni envoyé à l’IA\.$/);
  assert.equal(s.etapeReporte.status, 'warn');
  assert.equal(s.etapeReporte.details.reporte, true);
  assert.equal(s.etapeEchec.status, 'error');
  assert.match(s.etapeSansNote.summary, /pas encore de banc d’essai : rien n’est gardé avant les matchs/);
  const illisible = await JOUEURS.passeJoueursABlanc({}, { chargerLeModule: () => Promise.reject(new Error('SyntaxError: module des joueurs cassé')) });
  assert.equal(illisible.status, 'error');
  assert.match(illisible.summary, /le module des chiffres des joueurs ne se charge pas \(SyntaxError: module des joueurs cassé\) — rien d’avancé ; le reste de la nuit n’en dépend pas/);
  const panne = await JOUEURS.passeJoueursABlanc({}, { chargerLeModule: async () => ({ faireLesJoueursDeLaNuit: async () => { throw new Error('panne fabriquée'); }, resultatDeLEtape: () => null }) });
  assert.deepEqual([panne.status, panne.details.erreur], ['error', 'panne fabriquée']);
  // Les modules se chargent (le garde « le module se charge »).
  for (const [f, nom] of [['joueursNuit.js', 'faireLesJoueursDeLaNuit'], ['joueursRead.js', 'joueursDuMatch'], ['avantMatchJoueurs.js', 'tourAvantMatch'], ['chiffresDesJoueurs.js', 'chiffresDUnCamp'], ['controleDesJoueurs.js', 'controlerLesInstantanes'], ['lectureDesCompos.js', 'compoPubliee']]) {
    assert.equal(typeof (await import(`../src/data/joueurs/${f}`))[nom], 'function', f);
  }
  // Le tour des enregistreurs : un module des joueurs qui ne se charge pas → le bilan le dit, le tour finit.
  const E = await import('../src/jobs/enregistreurs.js');
  const code = fs.readFileSync(path.join(SRC, 'jobs', 'enregistreurs.js'), 'utf8');
  assert.match(code, /bilan\.avantMatchJoueurs = await tourAvantMatchDesJoueurs\(\{ maintenant \}\);\n {4}\}\n {4}\/\/ \[étape 34, lot 1b : ajout pur, fin\]\n {4}return bilan;/, 'en DERNIER dans le tour');
  assert.equal(typeof E.__reglerAvantMatchDesJoueurs, 'function');
});

/** Les sha1 (octets bruts) des fichiers GELÉS retouchés par le lot 1b, relevés en partie 0 du lot 1b (03/11/2026, 18 h 50, = dépôt). */
const GELES_RETOUCHES = Object.freeze([
  ['jobs/matchStatsAutoRefresh.js', 'deb3f3a195bc251ba5b851d8ef101f8afb9fdeea'],
  ['jobs/enregistreurs.js', '84349ec9bde0b474d46185e03e6edb5ef4adcf11']
]);
const DEBUT = /\[étape 34, lot 1b : ajout pur, début\]/;
const FIN = /\[étape 34, lot 1b : ajout pur, fin\]/;
function blocs(brut) {
  // Étape 38 (lot 1b, 04/11/2026) : ses blocs « ajout pur » de l'actualisation retirés d'abord (combinaisonFuite.test.mjs, T-X10).
  // Étape 36 (lot 1, 09/11/2026) : de même pour ses blocs « ajout pur » (vérifiés par coupesFrontiere.test.mjs, T-X10).
  const texte = brut.replace(/^[^\n]*\[étape 38, lot 1b : ajout pur, début\][\s\S]*?\[étape 38, lot 1b : ajout pur, fin\][^\n]*\n/gm, '').replace(/^[^\n]*\[étape 36, lot 1 : ajout pur, début\][\s\S]*?\[étape 36, lot 1 : ajout pur, fin\][^\n]*\n/gm, '');
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

test('T-X10 les fichiers GELÉS retouchés (matchStatsAutoRefresh.js, enregistreurs.js) : sans leurs blocs « ajout pur », identiques À L’OCTET à ceux d’avant ; les blocs n’écrivent rien et n’atteignent data/joueurs/ que par import() dynamique', () => {
  for (const [f, attendu] of GELES_RETOUCHES) {
    const { garde, ajoutes } = blocs(fs.readFileSync(path.join(SRC, f), 'utf8'));
    assert.equal(ajoutes.length, 2, `${f} : deux blocs ajoutés`);
    assert.equal(sha1(Buffer.from(garde, 'utf8')), attendu, `${f} : hors des blocs marqués, rien ne change`);
    for (const b of ajoutes) {
      const code = sansCommentaires(b);
      assert.doesNotMatch(code, /\.run\(|INSERT\s|UPDATE\s|DELETE\s|upsert|writeJson|writeFile|\.exec\(/, `${f} : un bloc ajouté écrit`);
      assert.doesNotMatch(code, /^import .* from/m, `${f} : aucun import statique ajouté`);
      for (const m of code.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) assert.match(m[1], /\/joueurs\/(joueursNuit|avantMatchJoueurs)\.js$|\/db\/matchStatsDb\.js$|\/providers\/refreshLock\.js$/, m[1]);
    }
  }
});

test('T-X9 (lot 1b) seuls l’actualisation, les enregistreurs et la route de l’analyse atteignent data/joueurs/, par import() dynamique ; ni server.js (statique), ni lineupContext.js, ni l’essai 27, ni le moteur', () => {
  const atteint = new Map();
  const tous = fs.readdirSync(SRC, { recursive: true }).map(String).filter((f) => /\.m?js$/.test(f));
  for (const f of tous) {
    const r = f.split(path.sep).join('/');
    if (r.startsWith('data/joueurs/')) continue;
    const t = fs.readFileSync(path.join(SRC, f), 'utf8');
    if (/joueurs\/(joueursNuit|joueursRead|avantMatchJoueurs|chiffresDesJoueurs|lectureDesCompos|controleDesJoueurs|reglagesJoueurs|formulesDesJoueurs|joueursAuJourJ|lectureDesJoueurs|reglementJoueurs|comptesDesJoueurs|bancDesJoueurs|joueursEnfant|noteDesJoueurs)\.js/.test(t)) atteint.set(r, t);
  }
  assert.deepEqual([...atteint.keys()].sort(), ['api/controllers/analysis.controller.js', 'jobs/enregistreurs.js', 'jobs/matchStatsAutoRefresh.js']);
  for (const [r, t] of atteint) {
    assert.doesNotMatch(sansCommentaires(t), /^\s*import\s[^(]*from\s+['"][^'"]*joueurs\//m, `${r} : un import statique de data/joueurs/`);
  }
  const statiques = (depart) => {
    const vus = new Set();
    const pile = [...depart];
    while (pile.length) {
      const f = pile.pop();
      if (vus.has(f) || !fs.existsSync(f)) continue;
      vus.add(f);
      for (const m of sansCommentaires(fs.readFileSync(f, 'utf8')).matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"`;]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) pile.push(path.resolve(path.dirname(f), m[1]));
    }
    return [...vus].map((f) => path.relative(SRC, f).split(path.sep).join('/'));
  };
  const auDemarrage = statiques([path.join(SRC, 'server.js')]);
  assert.ok(auDemarrage.length > 100);
  assert.ok(!auDemarrage.some((f) => f.startsWith('data/joueurs/')), 'server.js n’atteint pas data/joueurs/ statiquement');
  const lc = fs.readFileSync(path.join(SRC, 'data', 'providers', 'lineupContext.js'), 'utf8');
  assert.doesNotMatch(lc, /joueurs\//, 'lineupContext.js n’est pas touché par la 34 (critique, constat 1)');
  const tout = (depart) => {
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
  const moteur = tout(fichiersDuMoteur().map((f) => path.join(SRC, f)));
  const essai = tout(['data/enregistreurs/moteurABlanc.js', 'data/enregistreurs/gelPronostics.js', 'bench/essaiCandidate.js', 'core/ai/autoMatchAiTrigger.js'].map((f) => path.join(SRC, f)));
  assert.ok(!moteur.some((f) => f.startsWith('data/joueurs/')), 'le moteur n’atteint pas data/joueurs/');
  assert.ok(!essai.some((f) => f.startsWith('data/joueurs/')), 'le chemin de l’essai 27 (et autoMatchAiTrigger) n’atteint pas data/joueurs/');
});

test('T-X11 les nouveaux fichiers : lecture, compos, chiffres et contrôle n’écrivent rien ; la nuit et l’enregistreur n’écrivent que joueurs_* ; ni horloge ni hasard dans les calculs', () => {
  const J = path.join(SRC, 'data', 'joueurs');
  const code = (f) => sansCommentaires(fs.readFileSync(path.join(J, f), 'utf8'));
  for (const f of ['joueursRead.js', 'lectureDesCompos.js', 'chiffresDesJoueurs.js', 'controleDesJoueurs.js']) {
    assert.doesNotMatch(code(f), /\.run\(|INSERT\s|UPDATE\s|DELETE\s|writeJsonAtomic|writeFileSync|\.exec\(/, `${f} : aucune écriture`);
    assert.doesNotMatch(code(f), /Date\.now\(|new Date\(\)|Math\.random|fetch\(/, `${f} : ni horloge, ni hasard, ni réseau`);
  }
  assert.doesNotMatch(code('chiffresDesJoueurs.js'), /openDb|prepare\(|from '\.\.\/db\//, 'les chiffres sont purs');
  assert.doesNotMatch(code('chiffresDesJoueurs.js'), /bancDesJoueurs/, 'le serveur ne charge pas le banc');
  for (const f of ['joueursNuit.js', 'avantMatchJoueurs.js']) {
    const c = code(f);
    assert.doesNotMatch(c, /Date\.now\(|new Date\(\)|Math\.random|fetch\(/, `${f} : l’heure est reçue`);
    for (const m of c.matchAll(/(?:INSERT INTO|DELETE FROM|(?<!DO )UPDATE)\s+(\$\{table\}|\w+)/g)) assert.match(m[1], /^(joueurs_\w+|\$\{table\})$/, `${f} : ${m[0]}`);
  }
  const tables = [...code('joueursNuit.js').matchAll(/table: '(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(tables, ['joueurs_fiches', 'joueurs_matchs']);
  // L'enfant (mode nuit compris) n'écrit toujours rien et ouvre la base en lecture seule.
  const enfant = code('joueursEnfant.js');
  assert.doesNotMatch(enfant, /\.run\(|INSERT\s|UPDATE\s|DELETE\s|writeFileSync/);
  assert.match(enfant, /openDb\(\{ file: m\.chemin, readonly: true \}\)/);
});
