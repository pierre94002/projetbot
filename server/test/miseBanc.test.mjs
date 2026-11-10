/**
 * LA MISE — LE BANC (étape 39 « La mise juste », lot 1b, 09/11/2026) : copies isolées, réseau coupé, heure figée ; jamais la
 * base du bac ni la vraie ; jamais un résultat de P2 (les mondes sont FABRIQUÉS sur les cotes et les avantages des 555 paris,
 * fixture mise-p2-mises.json, lue sans issue ni clôture).
 *   node --test test/miseBanc.test.mjs        (depuis server/)
 *
 * T-B1  l'étalonnage des mises : 555 sur 555 à l'octet par la reproduction ARRONDIE (une part non arrondie diffère) ; un
 *       carnet qui n'est pas celui du service ARRÊTE le passage, rien n'est jugé ;
 * T-B2  J1 : ρ = 0 → « retenu » au plus 5 % des fois sur 50 graines ; ρ = 1 → au moins 80 % ; « confirmé » refusé si une
 *       bande haute est « moins bonne » (ou si la garde est illisible) ;
 * T-B3  le placebo (mises permutées dans le mois) : « retenu » au plus 5 % des fois sur 50 graines ; une permutation qui garde
 *       plus de la moitié des mises (dans la journée) est refusée ;
 * T-B4  K = 3, z ≈ 2,394, une variante non déclarée refusée, aucune fraction jugée (les niveaux sont rapportés) ;
 * T-B5  la plate a la mise moyenne de v1, calculée sans issue ;
 * T-B6  les comptes ne lisent ni issue ni clôture, jamais un carnet (ni les paris de Pierre, ni son capital) ;
 * T-B7  la note refaite à l'octet par la recopie ;
 * T-B8  le script : verrou posé avant la lecture et gardé, sha1 des règles et de l'export, modules scellés, un seul passage,
 *       la passe de Pierre, jamais la nuit, sortie jamais écrasée ; aucun processus à part (piège « exit » sans objet) ;
 * T-B9  le capital composé, exact sur trois paris connus (les mises d'un jour sur le capital du matin) ;
 * T-B10 une zone des creux sans horizon est refusée ;
 * T-B11 la conception scellée est antérieure au premier regard de la note de la 38 ;
 * T-B12 la valeur de clôture par bande d'avantage est LUE dans la note de la 38, jamais recalculée ;
 * T-B13 (temps 2, la fenêtre vue déclarée le 09/11/2026 vers 22 h 40) le placebo « moins bon » est RAPPORTÉ : la décision suit
 *       la forme et la raison nomme le placebo ; seul un placebo « retenu » rend les règles fautives ; la déclaration est
 *       dans la sortie du passage, dans la note recopiée et dans les règles scellées.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preparerCopie, executer, SERVEUR, FIXTURES } from './aides/isolement.mjs';
import * as B from '../src/data/mise/bancDeLaMise.js';
import { partDeMise } from '../src/data/mise/regleDeMise.js';
import { generateur, zPour } from '../src/bench/guard.js';
import { BANKROLL_DU_BANC } from '../src/bench/entrees.js';
import { VARIANTES_DE_L_ETAPE_39 } from '../src/bench/lancements.js';
import { COMBINAISON_AU_BANC } from '../src/data/combinaison/noteDeLaCombinaison.js';

const SRC = path.join(SERVEUR, 'src');
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const sansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(new RegExp('/[*][^]*?[*]/', 'g'), '').replace(new RegExp('(^|[^:\'"`])//.*$', 'gm'), '$1');
const MISES = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'mise-p2-mises.json'), 'utf8'));

/** Un tirage normal (Box-Muller) du générateur semé. */
const normal = (u) => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());

/**
 * UN MONDE FABRIQUÉ sur les 555 paris de P2 (dates, blocs, cotes, avantages, mises : la fixture, sans issue) : la probabilité
 * de clôture q = (1 + ρ·avantage + ε) / cote (ε normal, écart-type σ), l'issue tirée avec q. Rien de P2 n'y est un résultat.
 */
function mondeFabrique({ graine, rho, sigma = 0.06 }) {
  const u = generateur(graine);
  return MISES.paris.map((p) => {
    const q = Math.min(0.99, Math.max(0.01, (1 + rho * p.avantage + sigma * normal(u)) / p.cote));
    const gagne = u() < q;
    return { ...p, fixtureKey: p.cle.split('|result|')[0], coteJuste: Number((p.cote / (1 + p.avantage)).toFixed(2)), probaCloture: q, livreCloture: 'pinnacle', valeurCloture: p.cote * q - 1, gagne, gain: gagne ? p.cote - 1 : -1 };
  });
}

/** Le contexte du juge pour un monde (comme passerLeBanc). */
function contexteDe(paris, tirages = B.JUGE.tirages) {
  const tries = [...paris].sort(B.ordreDuCarnet);
  const v1 = Float64Array.from(tries, (p) => B.fractionDuPari(p));
  return { paris: tries, v1, plate: B.plateDeMemeMoyenne(tries), placebo: B.placeboDansLeMois(tries, v1).f, etalonnage: { ok: true, mises: { n: tries.length } }, tirages };
}

/** Un pari qui LÈVE dès qu'on lit un champ du résultat (T-B5, T-B6). */
const sansResultat = (p) => new Proxy({ ...p }, { get: (o, k) => { if (B.CHAMPS_DU_RESULTAT.includes(k)) throw new Error(`champ du résultat lu : ${String(k)}`); return o[k]; } });

/** Une note de la 38 fabriquée qui PORTE la valeur de clôture par bande d'avantage. */
const noteAvecBandes = (verdictHaut) => ({ premierRegard: '2026-11-04T01:35:13.000Z', rapports: { vcParBandeDAvantage: [{ de: 0.02, a: 0.05, paris: 300, vcMoyenne: 0.02, verdict: 'retenu', fourchette: [0.01, 0.03] }, { de: 0.05, a: 0.1, paris: 180, vcMoyenne: 0.05, verdict: 'retenu', fourchette: [0.02, 0.08] }, { de: 0.1, a: 0.25, paris: 75, vcMoyenne: verdictHaut === 'moins-bon' ? -0.03 : 0.04, verdict: verdictHaut, fourchette: verdictHaut === 'moins-bon' ? [-0.05, -0.01] : [-0.01, 0.09] }] } });

test('T-B1 l’étalonnage des mises : 555 sur 555 à l’octet (reproduction arrondie) ; une part non arrondie diffère ; un carnet étranger arrête le passage', () => {
  assert.equal(B.BASE_DU_BANC, BANKROLL_DU_BANC, 'la base du banc est celle de bench/entrees.js');
  assert.equal(MISES.paris.length, 555);
  assert.equal(MISES.export.sha1, '3039cafafc56ffc65382ce658c0c8421516bf6bc', 'l’export de P2 du 09/11/2026');
  for (const p of MISES.paris) for (const c of B.CHAMPS_DU_RESULTAT) assert.ok(!(c in p), `la fixture ne porte aucun résultat (${c})`);
  const e = B.etalonnerLesMises(MISES.paris);
  assert.deepEqual([e.n, e.egales, e.ecarts.length, e.ok], [555, 555, 0, true], JSON.stringify(e.ecarts.slice(0, 3)));
  // La même règle SANS l'arrondi du moteur : la plupart des mises diffèrent (le piège du semé b1).
  const nonArrondies = MISES.paris.filter((p) => B.BASE_DU_BANC * partDeMise({ ev: p.avantage, cote: p.cote, reglageMoteur: B.REGLAGE_DU_SERVICE }) === p.miseKelly).length;
  assert.ok(nonArrondies < 100, `${nonArrondies} égales sans arrondi`);
  // Une mise retouchée d'un centime est vue.
  const fausse = MISES.paris.map((p, i) => (i === 7 ? { ...p, miseKelly: Number((p.miseKelly + 0.01).toFixed(2)) } : p));
  assert.equal(B.etalonnerLesMises(fausse).ecarts.length, 1);
  // Le carnet d'un monde fabriqué n'est pas celui du service : le passage s'arrête, rien n'est jugé.
  const r = B.passerLeBanc({ paris: mondeFabrique({ graine: 1, rho: 1 }), bandesLues: B.lireLesBandesDeLa38(null), tirages: 100 });
  assert.equal(r.arret, true);
  assert.equal(r.banc, null);
  assert.equal(r.etalonnage.mises.egales, 555, 'les mises restent à l’octet');
  assert.ok(r.etalonnage.ecarts.length > 0);
});

test('T-B2 J1 : ρ = 0 → « retenu » ≤ 5 % sur 50 graines ; ρ = 1 → ≥ 80 % ; « confirmé » refusé si une bande haute est « moins bonne » ou la garde illisible', () => {
  const retenus = { 0: 0, 1: 0 };
  for (const rho of [0, 1]) {
    for (let g = 1; g <= 50; g++) {
      const v = B.jugerUneVariante('forme-kelly', contexteDe(mondeFabrique({ graine: 3900 + g, rho })));
      if (v.verdict === 'retenu') retenus[rho]++;
    }
  }
  assert.ok(retenus[0] <= 2, `ρ = 0 : ${retenus[0]} « retenu » sur 50`);
  assert.ok(retenus[1] >= 40, `ρ = 1 : ${retenus[1]} « retenu » sur 50`);
  // La garde : une bande ≥ 10 % « moins bonne » que 0 dans la note de la 38 → jamais « confirmé ».
  const monde = mondeFabrique({ graine: 77, rho: 1 });
  const ctx = contexteDe(monde);
  const forme = B.jugerUneVariante('forme-kelly', ctx);
  const placebo = B.jugerUneVariante('placebo-forme', ctx);
  assert.equal(forme.verdict, 'retenu');
  assert.equal(placebo.verdict, 'pas-prouve');
  const garde = (note) => B.gardeDUtilite({ bandesLues: B.lireLesBandesDeLa38(note), paris: ctx.paris, v1: ctx.v1 });
  assert.equal(B.decisionDeLaForme({ forme, placebo, garde: garde(noteAvecBandes('pas-prouve')) }).decision, 'confirmee');
  const moinsBonne = B.decisionDeLaForme({ forme, placebo, garde: garde(noteAvecBandes('moins-bon')) });
  assert.equal(moinsBonne.decision, 'pas-prouvee');
  assert.match(moinsBonne.raisons.join(' '), /moins bonne/);
  const illisible = B.decisionDeLaForme({ forme, placebo, garde: garde(null) });
  assert.equal(illisible.decision, 'pas-prouvee');
  assert.match(illisible.raisons.join(' '), /illisible/);
  // J2 « moins bon » : pas adoptable.
  assert.equal(B.decisionDeLaForme({ forme: { ...forme, j2: { verdict: 'moins-bon' } }, placebo, garde: garde(noteAvecBandes('pas-prouve')) }).decision, 'pas-prouvee');
  // Un placebo « retenu » : des règles fautives, pas de note (un placebo « moins bon » est RAPPORTÉ depuis la fenêtre vue
  // déclarée le 09/11/2026 : T-B13).
  assert.equal(B.decisionDeLaForme({ forme, placebo: { verdict: 'retenu' }, garde: garde(noteAvecBandes('pas-prouve')) }).decision, 'regles-fautives');
  assert.equal(B.decisionDeLaForme({ forme: { verdict: 'moins-bon', j2: { verdict: 'pas-prouve' } }, placebo, garde: garde(null) }).decision, 'plate-proposee');
});

test('T-B3 le placebo dans le MOIS : « retenu » ≤ 5 % sur 50 graines ; une permutation qui garde plus de la moitié des mises (dans la journée) est refusée', () => {
  let retenus = 0;
  let moinsBons = 0;
  for (let g = 1; g <= 50; g++) {
    const v = B.jugerUneVariante('placebo-forme', contexteDe(mondeFabrique({ graine: 3950 + g, rho: 1 })));
    if (v.verdict === 'retenu') retenus++;
    if (v.verdict === 'moins-bon') moinsBons++;
  }
  assert.ok(retenus <= 2, `placebo « retenu » ${retenus} fois sur 50`);
  assert.ok(moinsBons <= 2, `placebo « moins bon » ${moinsBons} fois sur 50`);
  // Dans un monde où l'avantage ne dit rien (ρ = 0), le placebo n'est jamais « retenu » non plus. (Il peut dire « moins
  // bon » : le seul coût de mises inégales, 6 fois sur 50 mesurées le 09/11/2026 — point 0 d'avant-scellement.md.)
  let retenusSansAvantage = 0;
  for (let g = 1; g <= 50; g++) if (B.jugerUneVariante('placebo-forme', contexteDe(mondeFabrique({ graine: 3900 + g, rho: 0 }))).verdict === 'retenu') retenusSansAvantage++;
  assert.ok(retenusSansAvantage <= 2, `ρ = 0 : placebo « retenu » ${retenusSansAvantage} fois sur 50`);
  const tries = [...MISES.paris].sort(B.ordreDuCarnet);
  const f = Float64Array.from(tries, (p) => B.fractionDuPari(p));
  const mois = B.placeboDansLeMois(tries, f);
  assert.ok(mois.partGardee < 0.15, `dans le mois : ${mois.partGardee}`);
  assert.equal(mois.groupes, 41, 'les 41 mois de P2');
  // Mêmes mises, autre ordre : la moyenne ne bouge pas.
  assert.ok(Math.abs([...mois.f].reduce((s, x) => s + x, 0) - [...f].reduce((s, x) => s + x, 0)) < 1e-12);
  assert.throws(() => B.placeboDansLeMois(tries, f, { cle: (p) => p.date }), (e) => e instanceof B.BancRefuse && /placebo refusé/.test(e.message), 'dans la journée : plus de la moitié des mises gardées');
  assert.equal(B.cleDuMois({ date: '2021-03-14' }), '2021-03');
});

test('T-B4 K = 3, z ≈ 2,394 ; une variante non déclarée est refusée ; aucune fraction n’est jugée', () => {
  assert.equal(B.JUGE.K, 3);
  assert.deepEqual([...B.VARIANTES_JUGEES], VARIANTES_DE_L_ETAPE_39.map((v) => v.id));
  assert.ok(Math.abs(zPour(B.JUGE.alpha, B.JUGE.K) - 2.394) < 5e-4);
  const ctx = contexteDe(mondeFabrique({ graine: 5, rho: 1 }), 200);
  for (const id of ['kelly-1-4', 'kelly-1-16', 'kelly-rho', 'plate-1pc', 'plafond-jour-6pc', 'creux-zone-conseils']) assert.throws(() => B.jugerUneVariante(id, ctx), B.BancRefuse, id);
  const r = B.passerLeBanc({ paris: mondeFabrique({ graine: 5, rho: 1 }), bandesLues: B.lireLesBandesDeLa38(null), tirages: 200, ignorerEtalonnage: true });
  assert.deepEqual(r.banc.variantes.map((v) => v.id), ['mise-v1', 'forme-kelly', 'placebo-forme']);
  assert.ok(Math.abs(r.banc.z - 2.394) < 5e-4);
  assert.ok(!JSON.stringify(r.banc.rapportes).includes('"verdict"'), 'les rapportés ne portent aucun verdict');
  assert.deepEqual(Object.keys(r.banc.rapportes.regles), [...B.REGLES_RAPPORTEES]);
  assert.deepEqual(Object.keys(r.banc.rapportes.mondes), ['W-cloture', 'W-moteur', 'W-zero', 'W-reel']);
  for (const monde of Object.values(r.banc.rapportes.mondes)) assert.deepEqual(Object.keys(monde.regles), [...B.REGLES_RAPPORTEES]);
});

test('T-B5 la plate a la mise moyenne de v1, calculée SANS issue', () => {
  const tries = [...MISES.paris].sort(B.ordreDuCarnet);
  const moyenne = tries.reduce((s, p) => s + B.fractionDuPari(p), 0) / tries.length;
  const plate = B.plateDeMemeMoyenne(mondeFabrique({ graine: 9, rho: 1 }).map(sansResultat));
  assert.ok(Math.abs(plate - moyenne) < 1e-15, `${plate} ≠ ${moyenne}`);
  assert.ok(Math.abs(plate - 0.00513) < 5e-5, `la plate de P2 : ${plate}`);
  assert.notEqual(plate, 0.01, 'jamais la plate à 1 %');
  const r = B.passerLeBanc({ paris: mondeFabrique({ graine: 9, rho: 1 }), bandesLues: B.lireLesBandesDeLa38(null), tirages: 100, ignorerEtalonnage: true });
  assert.ok(Math.abs(r.banc.plate - moyenne) < 1e-15);
  assert.ok(Math.abs(r.banc.rapportes.regles['plate-meme-moyenne'].moyenne - r.banc.rapportes.regles['mise-v1'].moyenne) < 1e-15, 'même moyenne que v1');
});

test('T-B6 les comptes ne lisent ni issue ni clôture, jamais un carnet ; le script ne lit ni les paris de Pierre ni son capital', () => {
  const c = B.comptes(mondeFabrique({ graine: 11, rho: 1 }).map(sansResultat));
  assert.equal(c.paris, 555);
  assert.equal(c.plafonnes, 11);
  assert.equal(c.mois, 41);
  assert.equal(c.jours, 291);
  assert.equal(c.blocs, 415);
  assert.deepEqual(c.joursAuDessus, { '4 %': 6, '6 %': 3, '8 %': 0 });
  assert.ok(!c.placebo.refuse);
  assert.equal(c.partFraiche.lue, false);
  assert.ok(!/valeurCloture|probaCloture|gagne/.test(JSON.stringify(c)), 'aucun champ du résultat dans les comptes');
  for (const f of ['src/data/mise/bancDeLaMise.js', 'src/data/mise/noteDeLaMise.js', 'scripts/etape39.mjs']) {
    const code = sansCommentaires(path.join(SERVEUR, f));
    assert.doesNotMatch(code, /bets\.json|betsRepository|suiviParis|capital\.json|capitalDePierre|miseRead|comptesBookmakers|engine-config|ai-config|['"`/\\]\.env\b/, `${f} lit un carnet, le capital ou un réglage`);
  }
});

test('T-B7 la note refaite à l’octet par la recopie (nulle avant le passage)', () => {
  const note = fs.readFileSync(path.join(SRC, 'data', 'mise', 'noteDeLaMise.js'), 'utf8');
  const sortie = path.join(FIXTURES, 'banc-etape39.json');
  if (fs.existsSync(sortie)) {
    const json = JSON.parse(fs.readFileSync(sortie, 'utf8'));
    assert.equal(note, B.texteDeLaNote(B.aRecopier(json, { sortie: { fichier: 'test/fixtures/banc-etape39.json', sha1: sha1(fs.readFileSync(sortie)) } })));
  } else {
    assert.equal(note, B.texteDeLaNote(null), 'avant le passage : MISE_AU_BANC = null, écrit par le script');
  }
  // Une note recopiée d'une sortie fabriquée se relit : verdicts, creux, mots.
  const r = B.passerLeBanc({ paris: mondeFabrique({ graine: 13, rho: 1 }), bandesLues: B.lireLesBandesDeLa38(null), tirages: 100, ignorerEtalonnage: true });
  const fabriquee = { format: B.VERSION_DU_BANC, premierRegard: '2026-11-10T09:00:00.000Z', regles: { copie: 'test/fixtures/banc-regles-etape39.md', sha1: '0'.repeat(40) }, paris: { sha1: '1'.repeat(40) }, etalonnage: r.etalonnage, banc: r.banc };
  const n = B.aRecopier(fabriquee, { sortie: { fichier: 'x.json', sha1: '2'.repeat(40) } });
  assert.deepEqual(n.variantes.map((v) => v.id), ['mise-v1', 'forme-kelly', 'placebo-forme']);
  assert.equal(n.forme.decision, 'pas-prouvee', 'garde illisible : jamais « confirmée »');
  const texte = B.texteDeLaNote(n);
  assert.ok(texte.includes('export const MISE_AU_BANC = gele('));
  const p = B.phrasesDuBanc(n);
  assert.equal(p.mesure, true);
  assert.match(p.phrases[0], /^Avec 1\/8 de Kelly, sur 555 paris comme ceux de 2019-2023 : la moitié du temps votre capital redescend au plus de \d+ % sous son plus haut ; une fois sur cent, de \d+ %\. Avec 1\/16 : /);
  assert.equal(p.phrases[1], B.MOTS_DU_BANC.pasProuvee);
  assert.deepEqual(B.phrasesDuBanc(null), { mesure: false, titre: B.MOTS_DU_BANC.titre, phrases: [B.MOTS_DU_BANC.pasEncore], provenance: null });
  for (const t of [JSON.stringify(p), JSON.stringify(B.MOTS_DU_BANC), B.MOTS_DU_BANC.confirmee(555), B.MOTS_DU_BANC.plateProposee(555)]) {
    assert.doesNotMatch(t, /sûr|€|10 000|10000|seuil conseillé/, 'jamais « sûr », jamais un euro ni « 10 000 », jamais un seuil conseillé');
  }
});

test('T-B8 le script : verrou avant la lecture, sha1 des règles et de l’export, modules scellés, un seul passage, la passe, jamais la nuit, sortie jamais écrasée ; aucun processus à part', () => {
  for (const f of ['scripts/etape39.mjs', 'src/data/mise/bancDeLaMise.js', 'src/data/mise/noteDeLaMise.js']) {
    // Le piège du 09/11/2026 (un « calcul à part » qui conclut sur « exit ») est sans objet : le banc tourne dans le script.
    assert.doesNotMatch(sansCommentaires(path.join(SERVEUR, f)), /child_process|fork\(|spawn|Worker\(/, `${f} : aucun processus à part`);
  }
  const noteDuBac = sha1(fs.readFileSync(path.join(SRC, 'data', 'mise', 'noteDeLaMise.js')));
  const copie = preparerCopie({ base: false });
  try {
    const cli = path.join(copie.serveur, 'scripts', 'etape39.mjs');
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.copyFileSync(path.join(SERVEUR, 'scripts', 'etape39.mjs'), cli);
    const d = (n) => path.join(copie.dossier, n);
    // L'export fabriqué : l'en-tête du service, les 555 paris d'un monde fabriqué, des lignes « ligne » ignorées.
    const tete = { formatEchange: 1, versionBanc: 1, moteur: { empreinteCode: 'essai' }, options: { periodes: ['P2'], prix: ['fd-avant-match'], marches: ['result'], config: { reglages: { kellyFraction: 0.125, maxStakePercent: 0.02 } } }, reglement: 'bp90' };
    const paris = mondeFabrique({ graine: 21, rho: 1 }).map((p) => ({ type: 'pari', format: 1, periode: 'P2', prix: 'fd-avant-match', regle: 'moteur', ...p }));
    fs.writeFileSync(d('p2.jsonl'), [tete, { type: 'ligne', prix: 'sans-cote', periode: 'P2' }, ...paris].map((l) => JSON.stringify(l)).join('\n') + '\n');
    const sP = sha1(fs.readFileSync(d('p2.jsonl')));
    const modules = ['src/bench/guard.js', 'src/core/risk/seriesDePertes.js', 'src/data/mise/regleDeMise.js'];
    const sceau = modules.map((f) => `- ${sha1(fs.readFileSync(path.join(copie.serveur, f)))} ${f}`).join('\n');
    const c = B.SCELLEMENT.conception;
    const regles = (corps) => `# Règles du banc de la mise (essai)\nK = 3\nExport de P2 : ${sP}\nConception : ${c.sha1} écrite le ${c.ecriteLe}\n\n## Modules scellés\n${corps}\n`;
    fs.writeFileSync(d('regles.md'), regles(sceau));
    fs.writeFileSync(d('regles-fausses.md'), regles(`- ${'0'.repeat(40)} src/bench/guard.js`));
    fs.writeFileSync(d('regles-sans-sceau.md'), `# Règles (essai)\nExport : ${sP}\nConception : ${c.sha1} écrite le ${c.ecriteLe}\n`);
    fs.writeFileSync(d('regles-sans-export.md'), `# Règles (essai)\nConception : ${c.sha1} écrite le ${c.ecriteLe}\n\n${sceau}\n`);
    fs.writeFileSync(d('regles-sans-conception.md'), `# Règles (essai)\nExport : ${sP}\n\n${sceau}\n`);
    fs.writeFileSync(d('passe-libre.json'), JSON.stringify({ running: null }));
    fs.writeFileSync(d('passe-occupee.json'), JSON.stringify({ running: { reason: 'au démarrage' } }));
    const sR = (f) => sha1(fs.readFileSync(d(f)));
    const banc = (sortie, enPlus = [], { k = '3', fichierRegles = 'regles.md', regles: sha = sR(fichierRegles), passe = 'passe-libre.json', verrou = true, export: sExport = sP, env = {}, maintenant } = {}) =>
      executer(copie, cli, { args: ['--banc', '--paris', d('p2.jsonl'), '--sha1-paris', sExport, '--regles', d(fichierRegles), '--sha1-regles', sha, '--k', k, ...(verrou ? ['--verrou', d('banc.lock')] : []), '--passe', d(passe), '--attente-minutes', '0', '--sortie', d(sortie), ...enPlus], timeout: 300_000, env, ...(maintenant ? { maintenant } : {}) });
    assert.match(banc('a.json', [], { k: '4' }).json.refus, /K doit valoir le nombre de variantes déclarées \(3/);
    assert.match(banc('a.json', [], { regles: '0'.repeat(40) }).json.refus, /les règles ont changé/);
    assert.match(banc('a.json', [], { export: '0'.repeat(40) }).json.refus, /l’export a changé/);
    assert.match(banc('a.json', [], { fichierRegles: 'regles-sans-export.md' }).json.refus, /ne citent pas l’export/);
    assert.match(banc('a.json', [], { fichierRegles: 'regles-sans-conception.md' }).json.refus, /ne citent pas la conception scellée/);
    assert.match(banc('a.json', [], { fichierRegles: 'regles-sans-sceau.md' }).json.refus, /ne scellent aucun module/);
    assert.match(banc('a.json', [], { fichierRegles: 'regles-fausses.md' }).json.refus, /n’a plus le sha1 scellé/);
    assert.match(banc('a.json', [], { verrou: false }).json.refus, /--verrou <fichier> est obligatoire/);
    assert.match(banc('a.json', [], { passe: 'passe-occupee.json' }).json.refus, /la passe de Pierre tourne toujours/);
    assert.match(banc('a.json', [], { maintenant: '2026-10-05T23:30:00.000Z' }).json.refus, /jamais entre 0 h 10 et 2 h 30/, '1 h 30 à Paris');
    assert.equal(fs.existsSync(d('banc.lock')), false, 'aucun verrou posé par un refus');
    assert.match(executer(copie, cli, { args: ['--ombre'] }).json.refus, /lot 1c/);
    // Les comptes : sans résultat, jamais écrasés.
    const cpt = executer(copie, cli, { args: ['--comptes', '--paris', d('p2.jsonl'), '--sha1-paris', sP, '--sortie', d('comptes.json')] });
    assert.equal(cpt.code, 0, cpt.erreurs.slice(-2000));
    const comptes = JSON.parse(fs.readFileSync(d('comptes.json'), 'utf8'));
    assert.equal(comptes.aucunResultatLu, true);
    assert.equal(comptes.etalonnageDesMises.egales, 555);
    assert.ok(!/"(gagne|gain|probaCloture|valeurCloture|livreCloture)":/.test(JSON.stringify(comptes)), 'aucun champ du résultat dans la sortie des comptes');
    assert.match(executer(copie, cli, { args: ['--comptes', '--paris', d('p2.jsonl'), '--sha1-paris', sP, '--sortie', d('comptes.json')] }).json.refus, /jamais écrasée/);
    // Le carnet fabriqué n'a pas l'étalonnage du service : le passage S'ARRÊTE, rien n'est jugé ; le verrou reste.
    const premier = banc('premier.json');
    assert.equal(premier.code, 3, premier.erreurs.slice(-2000));
    assert.equal(premier.json.arret, 'etalonnage');
    const s1 = JSON.parse(fs.readFileSync(d('premier.json'), 'utf8'));
    assert.equal(s1.banc, null);
    assert.ok(fs.existsSync(d('banc.lock')), 'le verrou est posé AVANT la lecture et reste');
    assert.ok(Date.parse(JSON.parse(fs.readFileSync(d('banc.lock'), 'utf8')).pose) <= Date.parse(s1.premierRegard));
    assert.match(banc('second.json').json.refus, /DÉJÀ été passé/);
    assert.match(banc('premier.json', ['--rejouer-apres-correction', 'essai']).json.refus, /jamais écrasée/);
    const second = banc('second.json', ['--rejouer-apres-correction', 'essai : étalonnage d’un monde fabriqué'], { env: { CM_ESSAI_ETALONNAGE: 'ignorer', CM_ESSAI_TIRAGES: '200' } });
    assert.equal(second.code, 0, second.erreurs.slice(-3000));
    const s2 = JSON.parse(fs.readFileSync(d('second.json'), 'utf8'));
    assert.deepEqual(s2.banc.variantes.map((v) => v.id), ['mise-v1', 'forme-kelly', 'placebo-forme']);
    assert.ok(s2.rejeu?.raison, 'les deux verdicts côte à côte');
    assert.equal(JSON.parse(fs.readFileSync(d('banc.lock'), 'utf8')).rejeux.length, 1);
    assert.deepEqual(Object.keys(s2.modulesScelles).sort(), [...modules].sort());
    assert.equal(s2.scellement.conception.sha1, c.sha1);
    assert.equal(s2.banc.forme.garde.lisible, false, 'la note de la 38 ne porte pas les bandes : garde illisible');
    // La recopie, par script, dans la copie seulement.
    const rec = executer(copie, cli, { args: ['--recopier', d('second.json')] });
    assert.equal(rec.code, 0, rec.erreurs.slice(-2000));
    const note = fs.readFileSync(path.join(copie.serveur, 'src', 'data', 'mise', 'noteDeLaMise.js'), 'utf8');
    assert.equal(note, B.texteDeLaNote(B.aRecopier(s2, { sortie: { fichier: 'test/fixtures/banc-etape39.json', sha1: sha1(fs.readFileSync(d('second.json'))) } })));
    assert.match(executer(copie, cli, { args: ['--note-nulle'] }).json.refus, /jamais remise à null/);
  } finally {
    copie.nettoyer();
  }
  assert.equal(sha1(fs.readFileSync(path.join(SRC, 'data', 'mise', 'noteDeLaMise.js'))), noteDuBac, 'le vrai bac n’a pas reçu de note');
});

test('T-B9 le capital COMPOSÉ, exact sur trois paris connus : les mises d’un jour sur le capital du matin, jamais additionnées sur 1 000 €', () => {
  const r = B.cheminCompose({ jours: [[{ f: 0.02, cote: 2, gagne: true }], [{ f: 0.01, cote: 3, gagne: false }], [{ f: 0.02, cote: 1.5, gagne: true }]] });
  const attendus = [1020, 1020 * 0.99, 1020 * 0.99 * 1.01];
  r.soirs.forEach((x, i) => assert.ok(Math.abs(x - attendus[i]) < 1e-9, `soir ${i + 1} : ${x} ≠ ${attendus[i]}`));
  assert.ok(Math.abs(r.final - 1019.898) < 1e-9, `${r.final}`);
  assert.ok(Math.abs(r.creux - (1 - 0.99)) < 1e-12, 'le creux sous le plus haut');
  // Deux paris le même jour : chacun sur le capital du MATIN (l'ordre dans la journée ne change rien).
  const a = B.cheminCompose({ jours: [[{ f: 0.02, cote: 2, gagne: true }, { f: 0.02, cote: 2, gagne: false }]], capital: 2000 });
  assert.equal(a.final, 2000);
  const b = B.cheminCompose({ jours: [[{ f: 0.02, cote: 2, gagne: false }, { f: 0.02, cote: 2, gagne: true }]], capital: 2000 });
  assert.equal(b.final, a.final);
  assert.equal(B.cheminCompose({ jours: [[{ f: 0.01, cote: 2, gagne: false }], [{ f: 0.01, cote: 2, gagne: false }], [{ f: 0.01, cote: 2, gagne: true }]] }).pireSerie, 2);
});

test('T-B10 une zone des creux sans horizon est refusée ; chaque zone dit son horizon', () => {
  const tries = mondeFabrique({ graine: 31, rho: 1 }).sort(B.ordreDuCarnet);
  const v1 = Float64Array.from(tries, (p) => B.fractionDuPari(p));
  const probas = tries.map((p) => p.probaCloture);
  assert.throws(() => B.zoneDesConseils({ paris: tries, f: v1, probas, tirages: 100 }), (e) => e instanceof B.BancRefuse && /horizon/.test(e.message));
  assert.throws(() => B.zoneDesConseils({ paris: tries, f: v1, probas, horizon: 600, tirages: 100 }), B.BancRefuse, 'un horizon qui n’est pas un multiple des 555 paris');
  assert.throws(() => B.creuxParHorizon({ paris: tries, f: v1, probas, horizons: [], tirages: 100 }), B.BancRefuse);
  const z = B.zoneDesConseils({ paris: tries, f: v1, probas, horizon: 1110, tirages: 200 });
  assert.equal(z.horizon, 1110);
  assert.ok(z.creux > 0 && z.creux < 1);
  const zd = B.zonesEtDetection({ paris: tries, v1, tirages: 200 });
  assert.deepEqual(zd.zones.map((x) => x.horizon), [555, 1110, 1665]);
  assert.ok(zd.zones[0].creux <= zd.zones[2].creux, 'la zone grandit avec l’horizon');
  assert.equal(zd.detection.zone.horizon, 555);
  assert.deepEqual(zd.faussesCoupures.parHorizon.map((x) => x.horizon), [555, 1110, 1665, 2775]);
});

test('T-B11 la conception scellée (K, v1, plate, placebo) est antérieure au premier regard de la note de la 38', () => {
  const c = B.SCELLEMENT.conception;
  assert.equal(c.sha1, 'c74c0cbb6c9fdd4c836bbc7ecbeb2707d7503741');
  assert.equal(c.ecriteLe, '2026-11-03T18:10:13Z', 'conception.md du 03/11/2026 à 19 h 10 (heure de Paris)');
  assert.ok(COMBINAISON_AU_BANC?.premierRegard, 'la note de la 38 porte son premier regard');
  assert.ok(Date.parse(c.ecriteLe) < Date.parse(COMBINAISON_AU_BANC.premierRegard), `${c.ecriteLe} avant ${COMBINAISON_AU_BANC.premierRegard}`);
  const regles = path.join(FIXTURES, 'banc-regles-etape39.md');
  if (fs.existsSync(regles)) {
    const t = fs.readFileSync(regles, 'utf8');
    assert.ok(t.includes(c.sha1) && t.includes(c.ecriteLe), 'les règles scellées citent la conception et sa date');
  }
});

test('T-B12 la valeur de clôture par bande d’avantage est LUE dans la note de la 38, jamais recalculée', () => {
  const note = noteAvecBandes('moins-bon');
  const lues = B.lireLesBandesDeLa38(note);
  assert.equal(lues.lisible, true);
  assert.deepEqual(lues.bandes, note.rapports.vcParBandeDAvantage);
  // Des paris dont la valeur de clôture est partout positive : la bande haute reste « moins bonne », car elle est LUE.
  const monde = mondeFabrique({ graine: 41, rho: 1 }).map((p) => ({ ...p, valeurCloture: 0.2, probaCloture: Math.min(0.99, 1.2 / p.cote) }));
  const tries = monde.sort(B.ordreDuCarnet);
  const v1 = Float64Array.from(tries, (p) => B.fractionDuPari(p));
  const g = B.gardeDUtilite({ bandesLues: lues, paris: tries, v1 });
  assert.equal(g.bandeHauteMoinsBonne, true);
  assert.equal(g.permetConfirme, false);
  assert.equal(g.plafonnes.paris, 11);
  assert.ok(Math.abs(g.plafonnes.vcMoyenne - 0.2) < 1e-12, 'la VC des plafonnés est, elle, calculée ici');
  // La vraie note de la 38 ne porte pas ces bandes : garde illisible, jamais « confirmé ».
  const vraie = B.lireLesBandesDeLa38(COMBINAISON_AU_BANC);
  assert.equal(vraie.lisible, false);
  assert.match(vraie.raison, /ne porte pas/);
  // Une note sans bande de 10 % et plus, ou sans verdict : illisible.
  assert.equal(B.lireLesBandesDeLa38({ rapports: { vcParBandeDAvantage: [{ de: 0.02, a: 0.05, verdict: 'retenu' }] } }).lisible, false);
  assert.equal(B.lireLesBandesDeLa38({ rapports: { vcParBandeDAvantage: [{ de: 0.1, a: 0.25, vcMoyenne: 0.01 }] } }).lisible, false);
});

test('T-B13 le placebo « moins bon » est RAPPORTÉ (fenêtre vue déclarée le 09/11/2026) : la décision suit la forme et la raison nomme le placebo ; seul un placebo « retenu » rend les règles fautives', () => {
  const ctx = contexteDe(mondeFabrique({ graine: 77, rho: 1 }));
  const forme = B.jugerUneVariante('forme-kelly', ctx);
  assert.equal(forme.verdict, 'retenu');
  const garde = (note) => B.gardeDUtilite({ bandesLues: B.lireLesBandesDeLa38(note), paris: ctx.paris, v1: ctx.v1 });
  // Chaque issue de la forme : avec un placebo « moins bon », la MÊME décision qu'avec un placebo « pas prouvé », et la raison
  // du placebo ajoutée à la fin (elle seule) ; avec un placebo « retenu », des règles fautives, quelle que soit la forme.
  const cas = [
    ['confirmee', forme, garde(noteAvecBandes('pas-prouve'))],
    ['pas-prouvee', forme, garde(null)],
    ['pas-prouvee', forme, garde(noteAvecBandes('moins-bon'))],
    ['pas-prouvee', { ...forme, j2: { verdict: 'moins-bon' } }, garde(noteAvecBandes('pas-prouve'))],
    ['plate-proposee', { verdict: 'moins-bon', j2: { verdict: 'pas-prouve' } }, garde(null)],
    ['pas-prouvee', { verdict: 'pas-prouve', j2: { verdict: 'pas-prouve' } }, garde(noteAvecBandes('pas-prouve'))]
  ];
  for (const [attendue, f, g] of cas) {
    const sans = B.decisionDeLaForme({ forme: f, placebo: { verdict: 'pas-prouve' }, garde: g });
    const avec = B.decisionDeLaForme({ forme: f, placebo: { verdict: 'moins-bon' }, garde: g });
    assert.equal(sans.decision, attendue);
    assert.equal(avec.decision, attendue, `placebo « moins bon » : la décision suit la forme (${attendue}), le passage n’est pas annulé`);
    assert.deepEqual(avec.raisons, [...sans.raisons, B.RAISON_PLACEBO_MOINS_BON], 'la raison du placebo s’ajoute, à la fin');
    assert.ok(!sans.raisons.some((r) => /placebo/.test(r)), 'sans placebo « moins bon », aucune raison ne le nomme');
    const fautif = B.decisionDeLaForme({ forme: f, placebo: { verdict: 'retenu' }, garde: g });
    assert.equal(fautif.decision, 'regles-fautives', `placebo « retenu » : règles fautives (forme ${f.verdict})`);
    assert.match(fautif.raisons.join(' '), /placebo dit « retenu »/);
  }
  assert.match(B.RAISON_PLACEBO_MOINS_BON, /^le placebo dit « moins bon » : le coût de mises inégales, mesuré avant le regard ; rapporté, il n’annule pas le passage$/);
  // La déclaration : datée APRÈS le premier regard de la 38 (2026-11-04T01:35:13.412Z, cité dans les règles) — c'est une
  // fenêtre vue —, avec sa raison et la mesure d'avant le regard qui l'a motivée.
  const fv = B.FENETRE_VUE;
  assert.equal(fv.le, '2026-11-09T21:40:00Z');
  assert.ok(Date.parse(fv.le) > Date.parse('2026-11-04T01:35:13.412Z'));
  assert.equal(fv.par, 'orchestrateur');
  assert.match(fv.quoi, /seul un placebo « retenu » rend les règles fautives ; un placebo « moins bon » est rapporté/);
  assert.match(fv.quoi, /fenêtre vue, déclarée/);
  assert.match(fv.pourquoi, /marges-tb2-tb3\.json, sha1 f1fb84089cd2e89d8024554ea7def8405cf1f592/);
  assert.deepEqual({ ...fv.mesure }, { fichier: 'scratchpad/etape39/lot1b/marges-tb2-tb3.json', sha1: 'f1fb84089cd2e89d8024554ea7def8405cf1f592' });
  // La sortie du passage la porte, et la note recopiée aussi (refaite à l'octet par T-B7).
  const r = B.passerLeBanc({ paris: mondeFabrique({ graine: 13, rho: 1 }), bandesLues: B.lireLesBandesDeLa38(null), tirages: 100, ignorerEtalonnage: true });
  assert.deepEqual(r.banc.fenetreVue, fv);
  const fabriquee = { format: B.VERSION_DU_BANC, premierRegard: '2026-11-10T09:00:00.000Z', regles: { copie: 'x', sha1: '0'.repeat(40) }, paris: { sha1: '1'.repeat(40) }, etalonnage: r.etalonnage, banc: JSON.parse(JSON.stringify(r.banc)) };
  const n = B.aRecopier(fabriquee, { sortie: null });
  assert.deepEqual(n.fenetreVue, JSON.parse(JSON.stringify(fv)));
  assert.ok(B.texteDeLaNote(n).includes('"fenetreVue":{"le":"2026-11-09T21:40:00Z","par":"orchestrateur"'));
  // Après le passage : la sortie copiée dans test/fixtures porte la règle appliquée, et les règles scellées la déclarent.
  const sortie = path.join(FIXTURES, 'banc-etape39.json');
  if (fs.existsSync(sortie)) assert.deepEqual(JSON.parse(fs.readFileSync(sortie, 'utf8')).banc.fenetreVue, JSON.parse(JSON.stringify(fv)), 'le passage a appliqué la règle déclarée');
  const regles = path.join(FIXTURES, 'banc-regles-etape39.md');
  if (fs.existsSync(regles)) {
    const t = fs.readFileSync(regles, 'utf8');
    assert.ok(t.includes('Fenêtre vue (déclarée)') && t.includes(fv.mesure.sha1) && t.includes('seul un placebo « retenu »'), 'les règles scellées déclarent la fenêtre vue, sa mesure et la règle');
  }
});
