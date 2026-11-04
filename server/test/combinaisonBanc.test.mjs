/**
 * LE BANC DE L'ÉTAPE 38 (lot 1a, partie B, 03-04/11/2026) — sur des MONDES TIRÉS AU HASARD et un football-data FABRIQUÉ
 * dans une copie (aucun résultat réel : le banc ne lit son passage qu'une fois, au temps 2).
 *   node --test test/combinaisonBanc.test.mjs        (depuis server/)
 *
 * T-B1  un β planté (le signal lit la vérité) → 1n2-stats-residuel « retenu » ; un monde NUL (le signal redit le marché)
 *       → « pas prouvé » ; les placebos jamais « retenu » ;
 * T-B2  les placebos de football-data (1n2-placebo, faux-championnat, confiance-placebo, faux-ingredient, placebo-classe)
 *       « retenu » au plus 5 % des fois sur 50 graines ;
 * T-B3  sans écart propre aux championnats : poids-par-championnat « pas prouvé », bras A = le commun appris sur P1 (jamais
 *       une constante) ; avec un écart planté, τ² > 0 ;
 * T-B4  K = 38, z = 3,2125 ; une variante non déclarée, une forme absente ou un K faux sont refusés ;
 * T-B5  monde COURBE, classe tirée du pourcentage : bras A par dixièmes → pas « retenu » ; bras A de Cox → « retenu » à tort ;
 * T-B6  le seuil : TOUTES les décisions de la fenêtre (une ligne par match), 0 sans pari, blocs « jour|championnat » ;
 * T-B7  noteDeLaCombinaison.js = la note du passage unique (04/11/2026), refaite à l'octet depuis test/fixtures (sortie et
 *       règles scellées) ; les placebos « pas prouvé » ;
 * T-B8  aucune sortie « meilleur seuil » : la seule règle de choix est celle des emboîtées ;
 * T-B9  --comptes sans issue, valeur de clôture ni perte : la requête des comptes ne lit ni score ni clôture ; le module des
 *       comptes n'importe aucune perte ; les comptes d'une copie fabriquée ;
 * T-B10 le script : K, règles par sha1, modules scellés (un sha1 faux → refus), verrou obligatoire, passe attendue, sortie
 *       jamais écrasée ; second passage refusé sans raison ;
 * T-B11 UN passage juge les trois angles (combinaison, confiance, seuil) ;
 * T-B12 un écart d'étalonnage ARRÊTE tout : aucune variante jugée, la sortie le dit ;
 * T-B13 l'utilité sur la variante seule (paris ajoutés / retirés), jamais sur la base ;
 * T-B14 J1 décide, J2 qualifie : J1 « retenu » + clôture « moins bon » → « pas prouvé » ; J2 seul ne fait jamais « retenu » ;
 * T-B15 jamais la sortie du modèle 27 comme signal du 2,5 sur P2 : aucune forme n'a de signal sur le plus/moins ;
 * T-B16 les tailles décidées AVANT toute perte : « non jugeable ici » ne dépend d'aucune issue ;
 * T-B18 E2 : « retenu » refusé quand le signe du gain change d'une saison à l'autre.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { mondeFd, mondeP5 } from './aides/combinaisonMondes.mjs';
import { VARIANTES_DE_L_ETAPE_38 } from '../src/bench/lancements.js';
import { zPour } from '../src/bench/guard.js';
import * as B from '../src/data/combinaison/bancDeLaCombinaison.js';
import { SQL_FD_COMPTES, SQL_FD_BANC } from '../src/data/combinaison/bancFd.js';
import { comptesDeLaCombinaison } from '../src/data/combinaison/comptesDeLaCombinaison.js';

const SRC = path.join(SERVEUR, 'src');
const sha1 = (t) => crypto.createHash('sha1').update(t).digest('hex');
const sansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(new RegExp('/[*][^]*?[*]/', 'g'), '').replace(new RegExp('(^|[^:\'"`])//.*$', 'gm'), '$1');
const uneFois = (fabrique) => {
  let v;
  return () => (v ??= fabrique());
};
const OPTIONS = { tirages: 200 };
const NUL = uneFois(() => {
  const fd = mondeFd({ graine: 3 });
  return { fd, banc: B.jugerLesVariantes({ fd, ...OPTIONS }) };
});
const PLANTE = uneFois(() => {
  const fd = mondeFd({ graine: 4, beta: 0.3, signal: 'verite' });
  return { fd, banc: B.jugerLesVariantes({ fd, ...OPTIONS }) };
});
const v = (banc, id) => banc.variantes.find((x) => x.id === id);

test('T-B1 un β planté → 1n2-stats-residuel « retenu » ; un monde nul → « pas prouvé » ; les placebos jamais « retenu »', () => {
  const p = v(PLANTE().banc, '1n2-stats-residuel');
  assert.equal(p.verdict, 'retenu', JSON.stringify(p).slice(0, 400));
  assert.ok(Math.abs(p.betas[0] - 0.3) < 0.12, `β appris ${p.betas[0]}`);
  assert.ok(p.ampleur >= 0.5);
  const n = v(NUL().banc, '1n2-stats-residuel');
  assert.notEqual(n.verdict, 'retenu');
  for (const monde of [NUL(), PLANTE()]) for (const [id, verdict] of Object.entries(monde.banc.placebos)) assert.notEqual(verdict, 'retenu', `${id} retenu`);
  // Le rôle scellé de horloge-j2 : retenu avec 1n2-stats-residuel dans ce monde (l'horloge n'avance rien) → pas d'« avance d'horloge ».
  assert.equal(PLANTE().banc.horloge, v(PLANTE().banc, 'horloge-j2').verdict === 'retenu' ? null : 'avance-d-horloge');
});

test('T-B2 les placebos de football-data « retenu » au plus 5 % des fois sur 50 graines', () => {
  const ids = ['1n2-placebo', 'faux-championnat', 'confiance-placebo', 'faux-ingredient', 'placebo-classe'];
  const retenus = Object.fromEntries(ids.map((id) => [id, 0]));
  for (let g = 1; g <= 50; g++) {
    const fd = mondeFd({ graine: 500 + g, nP1: 5000, nP2: 3000, signal: g % 2 ? 'marche' : 'verite' });
    const ctx = B.contexteDuBanc({ fd, tirages: 100 });
    for (const id of ids) if (B.jugerUneVariante(id, ctx).verdict === 'retenu') retenus[id]++;
  }
  for (const id of ids) assert.ok(retenus[id] <= 2, `${id} : ${retenus[id]} « retenu » sur 50`);
});

test('T-B3 sans écart propre aux championnats : « pas prouvé », τ² ≈ 0, bras A = le commun appris sur P1 ; un écart planté donne τ² > 0', () => {
  const n = v(NUL().banc, 'poids-par-championnat');
  assert.notEqual(n.verdict, 'retenu');
  assert.ok(Number.isFinite(n.betaCommun), 'le commun appris sur P1');
  assert.equal(n.betaCommun, v(NUL().banc, '1n2-stats-residuel').betas[0], 'bras A = le β commun appris sur P1 (celui de 1n2-stats-residuel), jamais une constante');
  const fd = mondeFd({ graine: 12, beta: 0.2, signal: 'verite', ligueEffet: 0.5, nP1: 30000, nP2: 15000 });
  const ctx = B.contexteDuBanc({ fd, tirages: 100 });
  const r = B.jugerUneVariante('poids-par-championnat', ctx);
  assert.ok(r.tau2 > 0, `τ² ${r.tau2}`);
  assert.ok(r.championnats >= 6);
});

test('T-B4 K = 38, z = 3,2125 ; une variante non déclarée, une forme absente ou un K faux sont refusés', () => {
  assert.equal(VARIANTES_DE_L_ETAPE_38.length, 38);
  assert.equal(Object.keys(B.FORMES).length, 38);
  assert.equal(NUL().banc.K, 38);
  assert.ok(Math.abs(NUL().banc.z - 3.2125) < 1e-4);
  assert.equal(NUL().banc.z, zPour(0.05, 38));
  const fd = NUL().fd;
  assert.throws(() => B.jugerLesVariantes({ fd, K: 12, ...OPTIONS }), /K = 12/);
  assert.throws(() => B.jugerLesVariantes({ fd, declarees: [...VARIANTES_DE_L_ETAPE_38.slice(0, 37), { id: 'classe-fraicheur' }], ...OPTIONS }), /sans forme écrite avant le regard/);
  assert.throws(() => B.jugerLesVariantes({ fd, K: 37, declarees: VARIANTES_DE_L_ETAPE_38.slice(0, 37), ...OPTIONS }), /non déclarée/);
  assert.throws(() => B.jugerUneVariante('vieux-4pc', B.contexteDuBanc({ fd })), /sans forme/);
  for (const id of ['classe-fraicheur', 'vieux-4pc', 'huis-clos-5pc']) assert.ok(!VARIANTES_DE_L_ETAPE_38.some((x) => x.id === id), `${id} hors K`);
  assert.equal(B.PLACEBOS_DU_BANC.length, 6);
});

test('T-B5 monde COURBE, classe tirée du pourcentage : dixièmes → pas « retenu » ; Cox comme bras A → « retenu » à tort', () => {
  // Un marché du plus/moins mal calibré de façon COURBE (pas une droite en log-cotes) ; la clôture = la vérité ; la classe
  // tirée du POURCENTAGE (au-dessus ou au-dessous de 0,5, une borne des dixièmes) : elle ne dit rien que le recalage commun
  // par dixièmes ne sache déjà.
  let s = 2024;
  const u = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const lg = (p) => Math.log(p / (1 - p));
  const forme = (i) => {
    const t = 0.05 + 0.9 * u();
    const m = 1 / (1 + Math.exp(-(lg(t) + 0.35 * Math.sin(2 * Math.PI * t))));
    return { cle: `m${i}`, p: [m, 1 - m], q: [t, 1 - t], c: m > 0.5 ? 'haut' : 'bas' };
  };
  const apprendre = Array.from({ length: 20000 }, (_, i) => forme(i));
  const aJuger = Array.from({ length: 20000 }, (_, i) => forme(20000 + i));
  const dix = B.jugeDUneClasse({ apprendre, juger: aJuger });
  const cox = B.jugeDUneClasse({ apprendre, juger: aJuger, brasA: 'cox' });
  assert.notEqual(B.decisionConfiance({}, dix, { tirages: 200 }).verdict, 'retenu', `dixièmes : ampleur ${dix.ampleur}`);
  assert.equal(B.decisionConfiance({}, cox, { tirages: 200 }).verdict, 'retenu', `Cox comme bras A : le faux « retenu » du monde courbe (ampleur ${cox.ampleur})`);
  assert.doesNotMatch(sansCommentaires(path.join(SRC, 'data', 'combinaison', 'bancDeLaCombinaison.js')).replace(/brasA = 'dixiemes'/, ''), /brasA:\s*'cox'/, 'le banc n’appelle jamais Cox comme bras A');
});

test('T-B6 le seuil : toutes les décisions, une ligne par match, 0 sans pari, blocs « jour|championnat »', () => {
  const fd = NUL().fd;
  const fen = fd.filter((l) => l.fenetre === 'P2' || l.date >= '2012-07-27');
  const r = B.jugerUneRegle('pinnacle-1pc', fen, { tirages: 100 });
  assert.equal(r.lignes + r.sansCloture, fen.length, 'une ligne par décision cotée');
  assert.equal(r.matchs, r.lignes);
  assert.ok(r.blocs < r.lignes && r.blocs > 200, 'des blocs jour × championnat');
  const sansPari = fen.filter((l) => !B.decisionSousRegle(l, 'seuil-v1') && !B.decisionSousRegle(l, 'pinnacle-1pc')).length;
  assert.ok(sansPari > fen.length / 2, 'les matchs sans pari comptent (a = b = 0)');
  assert.equal(r.rendement.rapporteSeulement, true);
});

test('T-B7 la note du passage unique (04/11/2026) refaite à l’octet depuis la sortie et les règles scellées gardées dans test/fixtures ; une recopie refaite à l’octet depuis une sortie', async () => {
  const texte = fs.readFileSync(path.join(SRC, 'data', 'combinaison', 'noteDeLaCombinaison.js'), 'utf8');
  const fixture = path.join(SERVEUR, 'test', 'fixtures', 'banc-etape38.json');
  const brut = fs.readFileSync(fixture);
  assert.equal(sha1(brut), 'ccdab114620f6dd26637db3a0175861dfba63771', 'la sortie du passage unique');
  assert.equal(sha1(fs.readFileSync(path.join(SERVEUR, 'test', 'fixtures', 'banc-regles-etape38.md'))), '164cfd292d55ecdc6af9815bab98cc8bb5a786ac', 'les règles scellées');
  const sortieDuBanc = JSON.parse(brut.toString('utf8'));
  assert.equal(texte, B.texteDeLaNote(B.aRecopier(sortieDuBanc, { sortie: { fichier: 'test/fixtures/banc-etape38.json', sha1: sha1(brut) } })), 'la note, à l’octet');
  const N = await import('../src/data/combinaison/noteDeLaCombinaison.js');
  assert.equal(N.COMBINAISON_AU_BANC.variantes.length, 38);
  assert.equal(N.COMBINAISON_AU_BANC.etalonnage.ok, true, 'l’étalonnage à l’octet');
  assert.equal(N.COMBINAISON_AU_BANC.regles.sha1, '164cfd292d55ecdc6af9815bab98cc8bb5a786ac');
  assert.equal(N.motsDe('variante-inconnue'), 'pas encore mesuré');
  for (const id of ['1n2-placebo', 'faux-championnat', 'confiance-placebo', 'faux-ingredient', 'placebo-classe']) assert.equal(N.verdictDe(id), 'pas-prouve', id);
  assert.equal(N.verdictDe('contexte-placebo'), 'non-jugeable-ici');
  const sortie = { format: 1, premierRegard: '2026-11-04T10:00:00.000Z', regles: { copie: 'test/fixtures/banc-regles-etape38.md', sha1: 'a'.repeat(40) }, banc: NUL().banc };
  const note = B.aRecopier(sortie, { sortie: { fichier: 'x', sha1: 'b'.repeat(40) } });
  assert.equal(note.variantes.length, 38);
  assert.equal(note.limites.length, 4, 'les limites du lot 1a, en mots simples, dans la note');
  assert.match(note.limites[1], /relevées à la main/);
  assert.equal(B.texteDeLaNote(note), B.texteDeLaNote(B.aRecopier(JSON.parse(JSON.stringify(sortie)), { sortie: { fichier: 'x', sha1: 'b'.repeat(40) } })));
  assert.throws(() => B.aRecopier({ format: 2, banc: {} }), /ce n’est pas une sortie/);
});

test('T-B8 aucune sortie « meilleur seuil » ; la seule règle de choix est celle des emboîtées', () => {
  const texte = JSON.stringify(PLANTE().banc);
  assert.doesNotMatch(texte, /meilleur|optimal|best/i);
  assert.deepEqual(Object.keys(PLANTE().banc.emboitees).sort(), ['disperse', 'pinnacle']);
  assert.doesNotMatch(sansCommentaires(path.join(SRC, 'data', 'combinaison', 'reglesDeSeuil.js')), /argmax|Math\.max\(\.\.\.gains|meilleur/);
});

test('T-B9 --comptes : ni score, ni clôture, ni perte ; les comptes d’une copie fabriquée', () => {
  for (const c of ['bd', 'be', 'pin_c1', 'moy_c1', 'moy_cp25', 'pin_cp25']) assert.doesNotMatch(SQL_FD_COMPTES.replace(/CASE WHEN[^]*?END AS a_cloture25?/g, ''), new RegExp(`\\b${c}\\b`), `${c} lu en comptes`);
  assert.match(SQL_FD_BANC, /\bbd\b/);
  const code = sansCommentaires(path.join(SRC, 'data', 'combinaison', 'comptesDeLaCombinaison.js'));
  assert.doesNotMatch(code, /perteLogDe|entropieCroisee|valeurCloture|vcDe|\.q\b|\.y\b|jugerLesVariantes|juger\(/, 'les comptes ne calculent aucune perte ni VC');
  const fd = NUL().fd.map(({ y, y25, q, q25, ...reste }) => ({ ...reste, aCloture: true, aCloture25: true }));
  const c = comptesDeLaCombinaison({ fd });
  assert.equal(c.aucunResultatLu, true);
  assert.equal(c.jugeables['poids-par-regime'].startsWith('non'), true);
  assert.equal(c.jugeables['repos-court-residuel'], 'non (P5-b, après le lancement)');
  const copie = preparerCopie({ base: false });
  try {
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-combinaison.mjs'), { args: ['comptes', JSON.stringify({ pas: 30, parJour: 4 })], timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.ok(r.json.comptes.fenetres.P2.lignes > 100);
    assert.ok(r.json.comptes.p5.parOrigine.nuit.lignes > 0);
    assert.doesNotMatch(JSON.stringify(r.json.comptes), /perteLog|vcMoyenne"\s*:\s*[-0-9]/);
  } finally {
    copie.nettoyer();
  }
});

test('T-B10 / T-B11 / T-B12 le script : un seul regard — K, règles par sha1, modules scellés, verrou, passe, sortie jamais écrasée ; l’étalonnage en écart arrête tout ; un passage juge les trois angles', () => {
  const noteDuBac = sha1(fs.readFileSync(path.join(SRC, 'data', 'combinaison', 'noteDeLaCombinaison.js')));
  const copie = preparerCopie({ base: false });
  try {
    const cli = path.join(copie.serveur, 'scripts', 'etape38.mjs');
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.copyFileSync(path.join(SERVEUR, 'scripts', 'etape38.mjs'), cli);
    const fab = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-combinaison.mjs'), { args: ['fabriquer', JSON.stringify({ pas: 21, parJour: 6 })], timeout: 300_000 });
    assert.equal(fab.code, 0, fab.erreurs.slice(-3000));
    const d = (n) => path.join(copie.dossier, n);
    const modules = ['src/core/engine/goalModel.js', 'src/bench/prix.js', 'src/data/combinaison/bancFd.js'];
    const sceau = modules.map((f) => `- ${sha1(fs.readFileSync(path.join(copie.serveur, f)))} ${f}`).join('\n');
    fs.writeFileSync(d('regles.md'), `# Règles du banc (essai)\nK = 38\n\n## Modules scellés\n${sceau}\n`);
    fs.writeFileSync(d('regles-fausses.md'), `# Règles du banc (essai)\nK = 38\n\n## Modules scellés\n- ${'0'.repeat(40)} src/bench/prix.js\n`);
    fs.writeFileSync(d('regles-sans-sceau.md'), '# Règles (essai)\nK = 38\n');
    fs.writeFileSync(d('passe-libre.json'), JSON.stringify({ running: null }));
    fs.writeFileSync(d('passe-occupee.json'), JSON.stringify({ running: { reason: 'au démarrage' } }));
    const sR = sha1(fs.readFileSync(d('regles.md')));
    const banc = (sortie, enPlus = [], { k = '38', regles = sR, fichierRegles = 'regles.md', passe = 'passe-libre.json', verrou = true, env = {} } = {}) =>
      executer(copie, cli, { args: ['--banc', '--regles', d(fichierRegles), '--sha1-regles', regles, '--k', k, ...(verrou ? ['--verrou', d('banc.lock')] : []), '--passe', d(passe), '--attente-minutes', '0', '--sortie', d(sortie), ...enPlus], timeout: 600_000, env });
    assert.match(banc('a.json', [], { k: '37' }).json.refus, /K doit valoir le nombre de variantes déclarées \(38/);
    assert.match(banc('a.json', [], { regles: '0'.repeat(40) }).json.refus, /les règles ont changé/);
    assert.match(banc('a.json', [], { fichierRegles: 'regles-sans-sceau.md', regles: sha1(fs.readFileSync(d('regles-sans-sceau.md'))) }).json.refus, /ne scellent aucun module/);
    assert.match(banc('a.json', [], { fichierRegles: 'regles-fausses.md', regles: sha1(fs.readFileSync(d('regles-fausses.md'))) }).json.refus, /n’a plus le sha1 scellé/);
    assert.match(banc('a.json', [], { verrou: false }).json.refus, /--verrou <fichier> est obligatoire/);
    assert.match(banc('a.json', [], { passe: 'passe-occupee.json' }).json.refus, /la passe de Pierre tourne toujours/);
    assert.equal(fs.existsSync(d('banc.lock')), false, 'aucun verrou posé par un refus');
    assert.match(executer(copie, cli, { args: ['--ombre'] }).json.refus, /lot 1c/);
    // T-B12 : le magasin fabriqué n'a pas l'étalonnage de la note de départ → le passage S'ARRÊTE, rien n'est jugé.
    const premier = banc('premier.json');
    assert.equal(premier.code, 3, premier.erreurs.slice(-2000));
    assert.equal(premier.json.arret, 'etalonnage');
    const sortie1 = JSON.parse(fs.readFileSync(d('premier.json'), 'utf8'));
    assert.equal(sortie1.banc, null);
    assert.ok(sortie1.etalonnage.ecarts.length > 0);
    assert.ok(fs.existsSync(d('banc.lock')), 'le verrou est posé AVANT la lecture et reste');
    // Un second passage : refusé sans raison ; sortie jamais écrasée.
    assert.match(banc('second.json').json.refus, /DÉJÀ été passé/);
    assert.match(banc('premier.json', ['--rejouer-apres-correction', 'essai']).json.refus, /jamais écrasée/);
    // L'étalonnage ignoré : permis dans une copie d'essai seulement ; le passage juge les trois angles (T-B11).
    const second = banc('second.json', ['--rejouer-apres-correction', 'essai : étalonnage d’un magasin fabriqué'], { env: { CM_ESSAI_ETALONNAGE: 'ignorer', CM_ESSAI_TIRAGES: '100' } });
    assert.equal(second.code, 0, second.erreurs.slice(-3000));
    const s2 = JSON.parse(fs.readFileSync(d('second.json'), 'utf8'));
    assert.equal(s2.banc.variantes.length, 38);
    assert.deepEqual([...new Set(s2.banc.variantes.map((x) => x.angle))].sort(), ['combinaison', 'confiance', 'seuil']);
    assert.ok(s2.rejeu?.raison, 'les deux verdicts côte à côte');
    assert.ok(JSON.parse(fs.readFileSync(d('banc.lock'), 'utf8')).rejeux.length === 1);
    assert.deepEqual(Object.keys(s2.modulesScelles).sort(), [...modules].sort());
    // La recopie, par script, dans la copie seulement.
    const rec = executer(copie, cli, { args: ['--recopier', d('second.json')], timeout: 120_000 });
    assert.equal(rec.code, 0, rec.erreurs.slice(-2000));
    const note = fs.readFileSync(path.join(copie.serveur, 'src', 'data', 'combinaison', 'noteDeLaCombinaison.js'), 'utf8');
    assert.equal(note, B.texteDeLaNote(B.aRecopier(s2, { sortie: { fichier: 'test/fixtures/banc-etape38.json', sha1: sha1(fs.readFileSync(d('second.json'))) } })));
    assert.match(executer(copie, cli, { args: ['--note-nulle'] }).json.refus, /jamais remise à null/);
  } finally {
    copie.nettoyer();
  }
  // Le vrai bac n'a pas reçu de note : la sienne est toujours celle du passage unique.
  assert.equal(sha1(fs.readFileSync(path.join(SRC, 'data', 'combinaison', 'noteDeLaCombinaison.js'))), noteDuBac);
});

test('T-B13 l’utilité sur la variante seule : paris ajoutés (1 %) ou retirés (3 %), jamais sur la base', () => {
  const fd = PLANTE().fd;
  const fen = fd.filter((l) => l.fenetre === 'P2' || l.date >= '2012-07-27');
  const a = B.jugerUneRegle('pinnacle-1pc', fen, { tirages: 100 });
  assert.equal(a.utilite.sorte, 'ajoutes');
  assert.equal(a.utilite.n, fen.filter((l) => l.q && B.decisionSousRegle(l, 'pinnacle-1pc') && !B.decisionSousRegle(l, 'seuil-v1')).length);
  const r = B.jugerUneRegle('pinnacle-3pc', fen, { tirages: 100 });
  assert.equal(r.utilite.sorte, 'retires');
  assert.ok(Number.isFinite(r.utilite.vcMoyenne));
});

test('T-B14 J1 décide, J2 qualifie', () => {
  const lignes = (n, gainJ1, gainJ2) => {
    const j1 = [];
    const j2 = [];
    for (let i = 0; i < n; i++) {
      const bruit = ((i * 7919) % 1000) / 1000 - 0.5;
      j1.push({ bloc: `m${i}`, a: 1 + 0.01 * bruit, b: 1 + 0.01 * bruit - gainJ1 });
      j2.push({ bloc: `m${i}`, a: 1 + 0.01 * bruit, b: 1 + 0.01 * bruit - gainJ2 + 0.002 * bruit });
    }
    return { j1, j2, ampleur: 1 };
  };
  assert.equal(B.decisionCombinaison('1n2-stats-residuel', lignes(1000, 0.01, -0.01), {}, { tirages: 200 }).verdict, 'pas-prouve', 'J1 retenu, la clôture dit moins bon');
  assert.equal(B.decisionCombinaison('1n2-stats-residuel', lignes(1000, 0.01, 0.01), {}, { tirages: 200 }).verdict, 'retenu');
  assert.equal(B.decisionCombinaison('1n2-stats-residuel', lignes(1000, 0, 0.01), {}, { tirages: 200 }).verdict === 'retenu', false, 'J2 seul ne fait jamais « retenu »');
  const petit = B.decisionCombinaison('1n2-stats-residuel', { ...lignes(1000, 0.01, 0.01), ampleur: 0.2 }, {}, { tirages: 200 });
  assert.equal(petit.verdict, 'pas-prouve', 'ampleur sous 0,5 point (garde secondaire)');
});

test('T-B15 jamais la sortie du modèle 27 comme signal du 2,5 sur P2', () => {
  for (const [id, f] of Object.entries(B.FORMES)) if (f.signal) assert.ok(['pS', 'pSj2', 'pSautre'].includes(f.signal), `${id} : signal ${f.signal}`);
  assert.equal(B.FORMES['plusmoins25-recalage-marche'].signal, undefined, 'le 2,5 n’a que le recalage du marché');
  assert.doesNotMatch(sansCommentaires(path.join(SRC, 'data', 'combinaison', 'bancDeLaCombinaison.js')), /pS25|engine_candidate_picks|candidate/);
});

test('T-B16 les tailles AVANT toute perte : « non jugeable ici » ne dépend d’aucune issue', () => {
  const L = mondeP5({ graine: 9, nNuit: 2000, nCoup: 800 });
  const classe = (l) => l.classe;
  const a = B.varianteConfianceParOrigine('confiance-v1', L, classe, { tirages: 100 });
  const brouille = L.map((l) => ({ ...l, y: (l.y + 1) % 3, q: [...l.q].reverse() }));
  const b = B.varianteConfianceParOrigine('confiance-v1', brouille, classe, { tirages: 100 });
  assert.equal(a.verdict, 'non-jugeable-ici');
  assert.deepEqual(a.strates, b.strates);
  const r = B.jugerUneVariante('poids-par-regime', B.contexteDuBanc({ fd: NUL().fd }));
  assert.equal(r.verdict, 'non-jugeable-ici', 'P2 a moins de 2 000 lignes de repli');
});

test('T-B18 E2 : « retenu » refusé quand le signe du gain change d’une saison à l’autre', () => {
  const partout = mondeFd({ graine: 31, nP1: 30000, nP2: 24000, biais: () => 0.3 });
  const r1 = B.jugerUneVariante('1n2-recalage-marche', B.contexteDuBanc({ fd: partout, tirages: 200 }));
  assert.equal(r1.verdict, 'retenu', JSON.stringify(r1.parSaison));
  // Le marché presque juste une saison (décalé de 0,1 au lieu de 0,3) : le recalage appris (≈ 0,3) y dépasse ; le gain
  // d'ensemble reste positif, celui de 2021-22 non.
  const inverse = mondeFd({ graine: 31, nP1: 30000, nP2: 24000, biais: (jour) => (jour >= '2021-07-01' && jour <= '2022-06-30' ? 0.1 : 0.3) });
  const r2 = B.jugerUneVariante('1n2-recalage-marche', B.contexteDuBanc({ fd: inverse, tirages: 200 }));
  assert.notEqual(r2.verdict, 'retenu');
  assert.ok(r2.parSaison['2021-22'].gain < 0, JSON.stringify(r2.parSaison));
  assert.ok(r2.gain > 0 && r2.fourchette[0] > 0, `le gain d’ensemble reste « retenu » sans la règle du signe (${r2.gain}, ${r2.fourchette})`);
  assert.match(r2.raisons.join(' '), /saison par saison/);
});
