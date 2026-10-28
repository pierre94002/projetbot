/**
 * La carte « BULLETIN DU JOUR ET BILAN DE LA SEMAINE » de Réglages SE REND (étape 42 du plan, 22/10/2026) — en attendant la page
 * « Bulletin » de l'étape 45 : les deux textes écrits par l'IA, comme deux étapes de l'actualisation.
 *   node --test test/bulletinsEcran.test.mjs        (depuis server/)
 *
 * Les réponses sont celles du VRAI serveur : la phase « ecran » de test/aides/script-bulletins-service.mjs écrit les textes avec un
 * FAUX Claude (aucun appel réel) dans une copie isolée de la base d'essai, puis appelle GET /api/match-ai-analysis/bulletins et
 * GET /api/claude-budget (application Express, sans réseau) : rien d'écrit, deux textes écrits, un texte refusé par la garde des
 * chiffres, trois essais ratés, rien à commenter, le dernier texte d'hier, interrupteur coupé, fichier illisible (503). Le rendu est
 * fait côté serveur, sans navigateur (test/aides/rendu.mjs) : `fetch` remplacé — seules les routes données répondent, tout le reste
 * est refusé et compté.
 *
 *  1. Les règles de l'écran (ui/src/utils/bulletins.js) : l'état d'un texte, les essais ratés, la garde, le tableau Σ et ⌀.
 *  2. La carte, dans chacun de ses états : toujours ses deux blocs et son tableau, la raison dite quand il n'y a pas de texte, la
 *     provenance réelle et les tokens quand il y en a un, la fiche envoyée à l'IA, aucun bouton qui lance un appel.
 *  3. Réglages : la carte est sous l'actualisation, et les deux étapes (libellé, résumé, raison d'une étape « pas due ») se lisent
 *     dans la liste des étapes ; la carte « Budget Claude » montre les deux types d'appel et le plafond partagé.
 *  4. L'hygiène : règles pures, un seul fichier de lecture, aucune écriture depuis l'écran.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { UI, imp, interfacePrete, optionsDuRendu, ouvrirLeRendu, reglesPures, espaces, blocDe, corps, pied, entetes, tableauDe, texteDe } from './aides/rendu.mjs';

const options = optionsDuRendu;
const U = await imp(path.join(UI, 'src', 'utils', 'bulletins.js'));
const lireUi = (...chemin) => fs.readFileSync(path.join(UI, 'src', ...chemin), 'utf8');

/** Exécute une phase d'un script d'essai dans une copie neuve et rend son JSON. */
function lancer(nom, phase) {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', nom), { args: [phase], timeout: 300_000, env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' } });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}

const trouve = (html, motif, message) => assert.ok(motif.test(html), message ?? `motif absent : ${motif}`);
const absent = (html, motif, message) => assert.ok(!motif.test(html), message ?? `motif présent : ${motif}`);
/** Les cellules d'une ligne de tableau : leur texte (espaces normalisées). */
const cellules = (ligne) => [...ligne.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => espaces(texteDe(m[1])));
const nombre = (n) => espaces(Number(n).toLocaleString('fr-FR'));

let s; // les réponses du serveur (la phase « ecran »)
let e; // la phase « etapes »
let rendu;
let Panneau;
let Budget;
let Actualisation;
before(async () => {
  s = lancer('script-bulletins-service.mjs', 'ecran');
  e = lancer('script-bulletins-service.mjs', 'etapes');
  if (!interfacePrete) return;
  rendu = await ouvrirLeRendu({ cibles: /(BulletinsPanel|ClaudeBudgetPanel|RefreshStatusPanel)\.vue$/ });
  Panneau = (await rendu.charger('/src/components/settings/BulletinsPanel.vue')).default;
  Budget = (await rendu.charger('/src/components/settings/ClaudeBudgetPanel.vue')).default;
  Actualisation = (await rendu.charger('/src/components/settings/RefreshStatusPanel.vue')).default;
});
after(async () => {
  await rendu?.fermer();
});

const ROUTE = /\/api\/match-ai-analysis\/bulletins$/;
const panneau = (reponse, props = {}) => rendu.rendre(Panneau, props, [[ROUTE, reponse]]);
const ok = (corpsDeLaReponse) => ({ code: 200, corps: corpsDeLaReponse });

/** Ce que doit avoir TOUTE version de la carte : ses deux blocs, ses puces, son tableau (en-têtes, Σ et ⌀), sa note. */
function structure(r) {
  const t = espaces(r.texte);
  assert.deepEqual(r.avertissements, [], 'aucun avertissement de Vue pendant le rendu');
  assert.deepEqual(rendu.interdits, [], 'aucune autre lecture que la route de la carte');
  for (const bloc of ['bulletin', 'bilan']) {
    assert.ok(blocDe(r.html, bloc), `le bloc ${bloc} est toujours là`);
    trouve(r.html, new RegExp(`data-puce="${bloc}"`), `la puce ${bloc}`);
  }
  assert.ok(t.includes('Bulletin du jour') && t.includes('Bilan de la semaine'));
  trouve(r.html, /data-puce="budget"/);
  const tab = tableauDe(r.html, 'textes');
  assert.ok(tab, 'le tableau des derniers textes est toujours là');
  assert.deepEqual(entetes(tab), ['Texte', 'Pour', 'Écrit le', 'Mode', 'Tokens']);
  assert.equal(pied(tab).length, 2, 'Σ et ⌀');
  const [sigma, moy] = pied(tab).map((x) => espaces(texteDe(x)));
  assert.ok(sigma.startsWith('Σ ') && sigma.includes('texte'), sigma);
  assert.ok(moy.startsWith('⌀ par texte écrit par Claude'), moy);
  assert.ok(t.includes('Comment ça tourne') && t.includes('un seul appel'), 'la note qui explique');
  // Aucun bouton qui lance un appel : seulement « Relire ».
  const boutons = [...r.html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => espaces(texteDe(m[1])));
  assert.deepEqual(boutons, ['Relire']);
  absent(r.html, /<form\b|<input\b|<textarea\b/);
  return t;
}

// ================================================================================ 1. les règles de l'écran

test('règles : l’état d’un texte, en un mot, une couleur et une phrase — écrit, rien à commenter, attend le matin, coupé, abandonné, illisible, à faire', () => {
  const ecrit = { ecritLe: '2026-10-05T04:10:00.000Z', sansAppel: false };
  assert.deepEqual(U.etatDuTexte({ entree: ecrit }), { code: 'ecrit', titre: 'Écrit', ton: 'is-accent', icone: 'check', phrase: 'Écrit le 05/10 à 06 h 10, en un seul appel à Claude Code.' });
  assert.deepEqual(U.etatDuTexte({ entree: { sansAppel: true, raison: 'Rien à commenter aujourd’hui.' } }).code, 'sans-appel');
  const cas = (code, pourquoi = `pourquoi ${code}`) => U.etatDuTexte({ situation: { code, pourquoi } });
  assert.deepEqual([cas('interrupteur').titre, cas('interrupteur').ton], ['Coupé', 'is-warning']);
  assert.deepEqual([cas('illisible').titre, cas('illisible').ton], ['Illisible', 'is-danger']);
  assert.deepEqual([cas('essais-epuises').titre, cas('essais-epuises').ton], ['Abandonné', 'is-danger']);
  assert.deepEqual([cas('trop-tot').titre, cas('trop-tot').ton], ['Attend le matin', '']);
  assert.deepEqual([cas('a-faire').titre, cas('a-faire').ton], ['Pas encore écrit', 'is-info']);
  assert.equal(cas('essais-epuises', 'Abandonné pour aujourd’hui.').phrase, 'Abandonné pour aujourd’hui.');
  assert.equal(U.etatDuTexte({ situation: null }).code, 'serveur-a-relancer', 'le serveur ne connaît pas la route : dit, pas deviné');
  const avecEssai = U.etatDuTexte({ situation: { code: 'a-faire' }, essais: [{ at: '2026-10-05T12:00:00.000Z', type: 'chiffres', refuses: [{ nombre: '1,95' }, { nombre: '1,95' }, { nombre: '62' }] }] });
  assert.match(avecEssai.phrase, /^Il s’écrit à la prochaine passe d’actualisation\. Dernier essai raté : à 14 h 00 — texte refusé : chiffres absents de la fiche \(1,95 ; 62\)\.$/);
  assert.equal(U.essaiDit({ at: '2026-10-05T12:00:00.000Z', type: 'panne', raison: 'Claude Code (headless) n’a pas répondu' }), 'à 14 h 00 — Claude Code n’a pas répondu (Claude Code (headless) n’a pas répondu)');
  assert.equal(U.essaiDit({ at: 'pas-une-date', type: 'inconnu' }), 'heure inconnue — essai raté');
});

test('règles : les jours et les heures à la française — « 1er », l’heure de Paris, jamais une date inventée ; les tokens inconnus ne sont jamais un zéro', () => {
  assert.equal(U.jourCourt('2026-10-05'), '05/10/2026');
  assert.equal(U.jourCourt('n’importe quoi'), 'date inconnue');
  assert.equal(U.jourEnLettres('2026-10-22'), 'jeudi 22 octobre 2026');
  assert.equal(U.jourEnLettres('2026-11-01'), 'dimanche 1er novembre 2026');
  assert.equal(U.jourEnLettres('xx'), 'jour inconnu');
  assert.equal(U.jourEtHeureDits('2026-10-05T04:10:00.000Z'), '05/10 à 06 h 10');
  assert.equal(U.jourEtHeureDits(null), 'heure inconnue');
  assert.equal(U.modeDit('econome'), 'mode économe');
  assert.equal(U.modeDit('normal'), 'mode normal');
  assert.equal(espaces(U.tokensDits(4215)), '4 215 tokens');
  assert.equal(U.tokensDits(null), 'tokens inconnus');
  assert.equal(U.tokensDits(undefined), 'tokens inconnus');
  assert.equal(espaces(U.pluriel(1, 'texte', 'textes')), '1 texte');
  assert.equal(espaces(U.pluriel(2, 'texte', 'textes')), '2 textes');
  assert.equal(espaces(U.pluriel(0, 'texte', 'textes')), '0 texte');
});

test('règles : le tableau des derniers textes — les plus récents d’abord, Σ des textes et des tokens, ⌀ par texte QUI A COÛTÉ (un texte sans appel ne tire pas la moyenne vers zéro)', () => {
  const t = U.tableauDesTextes({
    bulletins: [
      { cle: '2026-10-05', titre: 'B5', ecritLe: '2026-10-05T04:10:00.000Z', sansAppel: false, mode: 'normal', tokens: 4000 },
      { cle: '2026-10-04', titre: 'B4', ecritLe: '2026-10-04T04:10:00.000Z', sansAppel: true, mode: 'normal', tokens: null },
      { cle: '2026-10-03', titre: 'B3', ecritLe: '2026-10-03T04:10:00.000Z', sansAppel: false, mode: 'econome', tokens: 2000 }
    ],
    bilans: [{ cle: '2026-09-28', titre: 'W', ecritLe: '2026-10-05T04:20:00.000Z', sansAppel: false, mode: 'normal', tokens: 6000 }]
  });
  assert.deepEqual(t.lignes.map((l) => l.pour), ['semaine du 28/09/2026', '05/10/2026', '04/10/2026', '03/10/2026']);
  assert.deepEqual(t.lignes.map((l) => l.libelle), ['Bilan de la semaine', 'Bulletin du jour', 'Bulletin du jour', 'Bulletin du jour']);
  assert.deepEqual(t.total, { textes: 4, appels: 3, tokens: 12_000 });
  assert.deepEqual(t.moyenne, { tokens: 4000 }, '12 000 sur 3 appels, pas sur 4 textes');
  assert.deepEqual(U.tableauDesTextes({}), { lignes: [], total: { textes: 0, appels: 0, tokens: 0 }, moyenne: { tokens: null } }, 'sans texte : la structure reste, la moyenne n’est pas un zéro');
  assert.deepEqual(U.tableauDesTextes(null).total.textes, 0);
});

test('règles : la garde dite en mots — les nombres cités et ceux de la fiche ; rien quand le texte n’a pas de garde (sans appel)', () => {
  assert.match(espaces(U.gardeDite({ garde: { nombresVus: 14, nombresDeLaFiche: 61 } })), /^Chiffres vérifiés par le code : 14 nombres cités, tous dans la fiche \(61 nombres\)\. Un texte qui citerait un autre nombre serait refusé\.$/);
  assert.equal(U.gardeDite({ garde: null }), null);
  assert.equal(U.gardeDite(null), null);
  assert.deepEqual(U.sectionsDuTexte({ texte: { sections: [{ cle: 'a', titre: 'A', texte: 'x', autre: 1 }, { cle: 'b', titre: 'B', texte: 'y' }] } }), [{ cle: 'a', titre: 'A', texte: 'x' }, { cle: 'b', titre: 'B', texte: 'y' }], 'dans l’ordre où l’IA les a écrites');
  assert.deepEqual(U.sectionsDuTexte(null), []);
});

// ================================================================================ 2. la carte, dans chacun de ses états

test('carte — les deux textes écrits : le texte de l’IA, sa provenance réelle et son heure, ses tokens, la preuve que ses chiffres sont ceux du code (la fiche), le tableau avec Σ et ⌀', options, async () => {
  const r = await panneau(ok(s.ecrits));
  const t = structure(r);
  const b = s.ecrits.bulletin;
  const w = s.ecrits.bilan;
  // Le bulletin.
  const bl = blocDe(r.html, 'bulletin');
  const blt = espaces(texteDe(bl));
  assert.ok(blt.includes('Bulletin du jour') && blt.includes('lundi 5 octobre 2026'));
  assert.ok(blt.includes(b.texte.titre) && blt.includes(b.texte.resume));
  for (const sec of b.texte.sections) {
    assert.ok(blt.includes(sec.titre) && blt.includes(sec.texte), sec.cle);
    trouve(bl, new RegExp(`data-section="${sec.cle}"`));
  }
  assert.ok(blt.includes(b.texte.aRetenir));
  assert.match(blt, /Écrit/, 'son état');
  assert.match(blt, /Écrit le 05\/10 à 06 h 10, en un seul appel à Claude Code\./);
  // Sa provenance : le vrai fournisseur et l'heure, jamais « Cotes marché (Odds API) ».
  assert.ok(blt.includes('Claude Sonnet, par Claude Code (quota de l’abonnement)'), blt.slice(0, 400));
  assert.match(blt, /écrit/);
  assert.ok(blt.includes(`${nombre(b.usage.total)} tokens`) && blt.includes('mode normal'));
  assert.ok(!/Cotes marché|Odds API/.test(t));
  // La preuve : la fiche envoyée à l'IA, dépliable, et la garde dite en mots.
  const fiche = /<details[^>]*data-fiche="bulletin"[\s\S]*?<\/details>/.exec(bl)?.[0];
  assert.ok(fiche, 'la fiche dépliable');
  assert.ok(texteDe(fiche).includes('Voir la fiche chiffrée envoyée à l’IA') && texteDe(fiche).includes('FICHE DU JOUR'));
  assert.ok(blt.includes(`${nombre(b.garde.nombresVus)} nombres cités, tous dans la fiche (${nombre(b.garde.nombresDeLaFiche)} nombres)`));
  // Le bilan.
  const wl = espaces(texteDe(blocDe(r.html, 'bilan')));
  assert.ok(wl.includes('du lundi 28 septembre au dimanche 4 octobre 2026') && wl.includes(w.texte.titre) && wl.includes(w.texte.resume));
  for (const sec of w.texte.sections) assert.ok(wl.includes(sec.texte));
  assert.ok(!wl.includes('Une value est une estimation'), 'le bilan n’a pas de champ « à retenir »');
  assert.ok(wl.includes('FICHE DE LA SEMAINE') && wl.includes(`${nombre(w.usage.total)} tokens`));
  // Les puces du haut.
  trouve(r.html, /data-puce="bulletin"[^>]*>[\s\S]*?Bulletin du jour : Écrit/);
  trouve(r.html, /data-puce="bilan"[^>]*>[\s\S]*?Bilan de la semaine : Écrit/);
  assert.ok(t.includes('Budget Claude : mode normal'));
  // Le tableau : une ligne par texte, Σ et ⌀ recomptés sur les lignes du serveur.
  const tab = tableauDe(r.html, 'textes');
  const lignes = corps(tab).map(cellules);
  assert.equal(lignes.length, 2);
  const parGenre = Object.fromEntries(lignes.map((l) => [l[0], l]));
  assert.deepEqual(parGenre['Bulletin du jour'].slice(1, 3), ['05/10/2026', '05/10 à 06 h 10']);
  assert.deepEqual(parGenre['Bilan de la semaine'].slice(1, 3), ['semaine du 28/09/2026', '05/10 à 06 h 10']);
  assert.deepEqual([parGenre['Bulletin du jour'][3], parGenre['Bulletin du jour'][4]], ['mode normal', nombre(b.usage.total)]);
  const somme = b.usage.total + w.usage.total;
  const [sigma, moy] = pied(tab).map((x) => cellules(x));
  assert.equal(sigma[0], 'Σ 2 textes, dont 2 appels à Claude');
  assert.equal(sigma[1], nombre(somme));
  assert.equal(moy[1], nombre(Math.round(somme / 2)));
});

test('carte — rien d’écrit encore : les deux blocs et le tableau gardent leur place, la raison est dite, aucun texte inventé', options, async () => {
  const r = await panneau(ok(s.jamais));
  const t = structure(r);
  for (const bloc of ['bulletin', 'bilan']) {
    const bt = espaces(texteDe(blocDe(r.html, bloc)));
    assert.ok(bt.includes('Pas encore écrit') && bt.includes('Il s’écrit à la prochaine passe d’actualisation.'), bloc);
    assert.ok(bt.includes('Pas encore de texte.'), `${bloc} : sa place, vide`);
    absent(blocDe(r.html, bloc), /data-section=/);
    absent(blocDe(r.html, bloc), /data-fiche=/);
  }
  assert.ok(espaces(texteDe(blocDe(r.html, 'bulletin'))).includes('lundi 5 octobre 2026'));
  assert.ok(espaces(texteDe(blocDe(r.html, 'bilan'))).includes('du lundi 28 septembre au dimanche 4 octobre 2026'));
  const tab = tableauDe(r.html, 'textes');
  assert.equal(corps(tab).length, 1);
  assert.match(espaces(texteDe(corps(tab)[0])), /^Aucun texte écrit pour l’instant : le premier bulletin s’écrit à la première passe d’actualisation d’une matinée\.$/);
  const [sigma, moy] = pied(tab).map((x) => cellules(x));
  assert.deepEqual([sigma[0], sigma[1]], ['Σ 0 texte, dont 0 appel à Claude', '0']);
  assert.deepEqual(moy, ['⌀ par texte écrit par Claude', '–'], 'la moyenne de rien n’est pas zéro');
  assert.ok(!/Claude Sonnet, par Claude Code/.test(t), 'aucune provenance quand aucun texte n’existe');
});

test('carte — un texte REFUSÉ par la garde (des chiffres absents de la fiche) et une panne : rien n’est affiché de la réponse, les essais ratés sont dits avec leur raison', options, async () => {
  const r = await panneau(ok(s.refuse));
  structure(r);
  const bt = espaces(texteDe(blocDe(r.html, 'bulletin')));
  assert.ok(bt.includes('Pas encore écrit') && bt.includes('Pas encore de texte.'));
  const essaisB = /<ul[^>]*data-essais[\s\S]*?<\/ul>/.exec(blocDe(r.html, 'bulletin'))?.[0];
  assert.ok(essaisB, 'la liste des essais ratés du bulletin');
  assert.match(espaces(texteDe(essaisB)), /^Essai 1 raté à 14 h 00 — texte refusé : chiffres absents de la fiche \(4321,7\)$/);
  assert.ok(bt.includes('Dernier essai raté : à 14 h 00 — texte refusé : chiffres absents de la fiche (4321,7).'));
  assert.ok(!bt.includes('4321,7 et un score'), 'le texte refusé n’est jamais montré');
  const wt = espaces(texteDe(blocDe(r.html, 'bilan')));
  assert.match(wt, /Essai 1 raté à 14 h 00 — Claude Code n’a pas répondu \(Claude Code \(headless\) n'a pas répondu : panne simulée\)/);
  // Le journal du budget : l'appel refusé a coûté, il est compté — mais il n'a pas de ligne au tableau, faute de texte.
  assert.equal(corps(tableauDe(r.html, 'textes')).length, 1);
});

test('carte — trois essais ratés : l’abandon est dit (« Abandonné »), avec le dernier motif et la prochaine chance ; le bilan, lui, peut encore s’écrire', options, async () => {
  const r = await panneau(ok(s.abandon));
  structure(r);
  const bt = espaces(texteDe(blocDe(r.html, 'bulletin')));
  assert.ok(bt.includes('Abandonné'));
  assert.match(bt, /Abandonné pour aujourd’hui : 3 essais ratés \(dernier : .*\)\. Nouvel essai demain\./);
  assert.equal((blocDe(r.html, 'bulletin').match(/<li\b/g) ?? []).length, 3, 'les trois essais ratés, un par ligne');
  trouve(r.html, /data-puce="bulletin"[^>]*>[\s\S]*?Bulletin du jour : Abandonné/);
  assert.ok(espaces(texteDe(blocDe(r.html, 'bilan'))).includes('Pas encore écrit'));
});

test('carte — rien à commenter : le jour est fait sans appel (0 token), la raison est dite, le tableau compte le texte sans l’appeler un coût', options, async () => {
  const r = await panneau(ok(s.rien));
  structure(r);
  for (const bloc of ['bulletin', 'bilan']) {
    const bt = espaces(texteDe(blocDe(r.html, bloc)));
    assert.ok(bt.includes('Rien à commenter'), bloc);
    assert.ok(bt.includes('Aucun texte : il n’y avait rien à commenter, donc aucun appel à Claude.'), bloc);
  }
  assert.ok(espaces(texteDe(blocDe(r.html, 'bulletin'))).includes("Rien à commenter aujourd'hui (aucun pari repéré, aucune chute de cote, aucun match de vos favoris) : aucun appel à Claude, 0 token."));
  const tab = tableauDe(r.html, 'textes');
  const lignes = corps(tab).map(cellules);
  assert.deepEqual(lignes.map((l) => [l[3], l[4]]), [['sans appel', '0'], ['sans appel', '0']]);
  const [sigma, moy] = pied(tab).map((x) => cellules(x));
  assert.deepEqual([sigma[0], sigma[1]], ['Σ 2 textes, dont 0 appel à Claude', '0']);
  assert.equal(moy[1], '–', 'aucun appel : pas de moyenne');
});

test('carte — le texte d’aujourd’hui n’est pas encore écrit : le dernier reste lisible, dit pour ce qu’il est (du jour d’avant) ; l’interrupteur des analyses coupé est dit', options, async () => {
  const r = await panneau(ok(s.hier));
  structure(r);
  const bt = espaces(texteDe(blocDe(r.html, 'bulletin')));
  assert.ok(bt.includes('Pas encore écrit'));
  assert.ok(bt.includes('Le dernier texte écrit, 04/10/2026 :'), bt.slice(0, 500));
  assert.ok(bt.includes(s.hier.dernierBulletin.texte.titre) && bt.includes(s.hier.dernierBulletin.texte.resume));
  trouve(blocDe(r.html, 'bulletin'), /data-fiche="bulletin"/);
  absent(blocDe(r.html, 'bilan'), /data-section=/);
  const c = await panneau(ok(s.coupe));
  structure(c);
  const ct = espaces(texteDe(blocDe(c.html, 'bulletin')));
  assert.ok(ct.includes('Coupé') && ct.includes('Les analyses IA automatiques sont coupées (AUTO_AI_ANALYSIS=false)'));
  trouve(c.html, /data-puce="bulletin"[^>]*>[\s\S]*?Bulletin du jour : Coupé/);
});

test('carte — fichier illisible (503) ou serveur pas relancé : l’erreur est dite, les deux blocs et le tableau restent, aucun texte n’est présenté comme vide ; la relecture garde le dernier texte', options, async () => {
  const r = await panneau({ code: s.illisible.code, corps: s.illisible.corps });
  const t = structure(r);
  assert.ok(t.includes('Bulletin et bilan illisibles') && t.includes('Les textes du bulletin sont illisibles pour l’instant'));
  assert.ok(t.includes('les deux blocs ci-dessous restent affichés, sans texte.'));
  for (const bloc of ['bulletin', 'bilan']) assert.ok(espaces(texteDe(blocDe(r.html, bloc))).includes('Pas encore de texte.'), bloc);
  // Le serveur d'avant l'étape : la route n'existe pas.
  const ancien = await panneau({ code: 404, corps: { error: 'Route introuvable : GET /api/match-ai-analysis/bulletins' } });
  const at = structure(ancien);
  assert.ok(at.includes('Le serveur n\'est pas à jour : relancez demarrer-cotemaster.bat pour activer cette fonction.'));
  assert.ok(at.includes('Pas encore de texte.'));
  // Le composant relit à chaque fin de passe et garde le dernier texte quand la relecture échoue.
  const source = lireUi('components', 'settings', 'BulletinsPanel.vue');
  assert.match(source, /watch\(\s*\(\) => props\.passeTermineeLe,/);
  assert.match(source, /etat\.value = \{ loading: false, error: error\.message, data: etat\.value\.data \};/);
  assert.match(source, /if \(numero === derniereDemande\)/, 'une réponse tardive d’une ancienne lecture est ignorée');
});

// ================================================================================ 3. Réglages

test('Réglages : la carte vient juste après « Actualisation automatique » et se relit à chaque fin de passe ; les deux étapes se lisent dans la liste des étapes de la passe, avec leur résumé et la raison d’une étape pas due', options, async () => {
  const reglages = lireUi('views', 'SettingsView.vue');
  assert.match(reglages, /import BulletinsPanel from '@\/components\/settings\/BulletinsPanel\.vue';/);
  const iA = reglages.indexOf('<RefreshStatusPanel');
  const iB = reglages.indexOf('<BulletinsPanel');
  const iC = reglages.indexOf('<DailyChecksPanel');
  assert.ok(iA > 0 && iA < iB && iB < iC, 'actualisation, puis bulletin et bilan, puis contrôle quotidien');
  assert.match(reglages, /<BulletinsPanel :passe-terminee-le="refreshOverview\?\.lastCompletedAt \?\? null" \/>/);
  assert.match(reglages, /title="Bulletin du jour et bilan de la semaine"/);
  assert.ok((reglages.match(/<BulletinsPanel/g) ?? []).length === 1, 'une seule carte');
  // La liste des étapes de la dernière passe : les deux étapes avec leur libellé et leur résumé (ceux du vrai serveur).
  const etape = (key, label, status, summary, durationMs = 1200) => ({ key, label, status, summary, durationMs });
  const resume = (cle) => ({ bulletin: e.passeBulletin.summary, bilanSemaine: e.passeBilan.summary }[cle]);
  const apresCarnet = [
    etape('carnetIA', "Carnet de l'IA (avis tenus, clôture, marchés où elle n'apporte rien)", 'ok', 'Le carnet est à jour.'),
    etape('bulletin', e.labels.bulletin, 'ok', resume('bulletin')),
    etape('bilanSemaine', e.labels.bilanSemaine, 'skipped', e.pourquoi.bilan, 0),
    etape('controleQuotidien', 'Contrôle quotidien des données et santé des sources', 'ok', 'Feu vert.')
  ];
  const overview = {
    enabled: true,
    running: null,
    nextRunAt: null,
    intervalMinutes: 180,
    steps: apresCarnet.map(({ key, label }) => ({ key, label })),
    history: [],
    alerts: {},
    lastPass: { id: 'p1', outcome: 'ok', reason: 'périodique', finishedAt: '2026-10-05T12:00:00.000Z', durationMs: 5000, steps: apresCarnet }
  };
  const r = await rendu.rendre(Actualisation, { overview });
  assert.deepEqual(r.avertissements, []);
  const lignes = [...r.html.matchAll(/<li\b[^>]*class="[^"]*\bstep\b[^"]*"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => espaces(texteDe(m[1])));
  assert.equal(lignes.length, 4, `les quatre étapes de la liste : ${r.html.slice(r.html.indexOf('<ol'), r.html.indexOf('<ol') + 300)}`);
  const bulletin = lignes.find((l) => l.includes('Bulletin du jour'));
  const bilan = lignes.find((l) => l.includes('Bilan de la semaine'));
  assert.ok(bulletin?.includes(e.labels.bulletin), 'le libellé de l’étape du bulletin');
  assert.ok(bulletin.includes('écrit en un seul appel à Claude Code (4 000 tokens, mode normal)'), bulletin);
  assert.ok(bilan?.includes(e.labels.bilanSemaine));
  assert.ok(bilan.includes('Le bilan de la semaine du 28/09/2026 au 04/10/2026 est déjà écrit (à 06 h 10) : un seul par semaine.'), 'une étape pas due dit POURQUOI, pas seulement « pas due »');
  assert.ok(!bilan.includes('Pas due à cette passe.'));
  assert.ok(lignes.findIndex((l) => l.includes('Carnet de l\'IA')) < lignes.findIndex((l) => l.includes('Bulletin du jour')) && lignes.findIndex((l) => l.includes('Bilan de la semaine')) < lignes.findIndex((l) => l.includes('Contrôle quotidien')), 'l’ordre de la passe');
});

test('Réglages › Budget Claude : les deux types d’appel ont leur ligne (« automatique · compté sur le plafond »), le plafond de 150 compte leurs appels, le compteur et le journal s’accordent', options, async () => {
  const r = await rendu.rendre(Budget, { reglable: true }, [[/\/api\/claude-budget(\?|$)/, { code: 200, corps: s.budget }]]);
  assert.deepEqual(r.avertissements, []);
  const t = espaces(r.texte);
  assert.ok(t.includes('Bulletin du jour') && t.includes('Bilan de la semaine'), 'les deux types dans le tableau par type');
  // Étape 26 (partie E, 28/10/2026) : le résumé du mois de la boucle de correction, automatique lui aussi (décision 12).
  assert.equal((t.match(/automatique · compté sur le plafond/g) ?? []).length, 7, 'sept types automatiques : avance, coup d’envoi, reprise, revue, bulletin, bilan, résumé du mois');
  assert.ok(t.includes('2 bulletin ou bilan'), 'le plafond dit combien de places les deux textes ont prises');
  assert.ok(t.includes('2 / 150'), '2 places sur 150');
  assert.equal(s.budget.coherence.egal, true);
  assert.deepEqual([s.budget.plafond.bulletin, s.budget.plafond.bilanSemaine, s.budget.plafond.limite], [1, 1, 150]);
  // Étape 26 (partie D, décision 12) : le résumé du mois de la boucle de correction est un appel automatique de plus.
  assert.deepEqual(s.budget.parType.filter((x) => x.automatique).map((x) => x.type), ['avance', 'coup-d-envoi', 'reprise', 'revue', 'bulletin', 'bilan-semaine', 'resume-mois']);
  const ligneDe = (type) => s.budget.parType.find((x) => x.type === type);
  assert.deepEqual([ligneDe('bulletin').aujourdhui.appels, ligneDe('bilan-semaine').aujourdhui.appels], [1, 1]);
  // La source du panneau : ses deux types, dans l'ordre du serveur.
  const source = lireUi('components', 'settings', 'ClaudeBudgetPanel.vue');
  assert.match(source, /\{ type: 'bulletin', libelle: 'Bulletin du jour' \},\s*\{ type: 'bilan-semaine', libelle: 'Bilan de la semaine' \}/);
});

// ================================================================================ 4. l'hygiène

test('hygiène : règles pures sans Vue ni service, un seul service de lecture, aucune écriture ni appel depuis l’écran, les mots du guide de design', () => {
  assert.deepEqual([...reglesPures('bulletins.js')], ['bulletins.js'], 'les règles de la carte sont pures');
  const service = lireUi('services', 'bulletinsApi.js');
  assert.match(service, /overview: \(\) => httpClient\.get\('\/match-ai-analysis\/bulletins'\)/);
  assert.doesNotMatch(service, /post\(|put\(|patch\(|delete\(/, 'le service ne fait que lire');
  const composant = lireUi('components', 'settings', 'BulletinsPanel.vue');
  assert.doesNotMatch(composant, /httpClient|fetch\(|localStorage|\.post\(|\.put\(|window\./, 'le composant lit par son service seulement');
  assert.equal((composant.match(/<AppButton/g) ?? []).length, 1, 'un seul bouton : Relire');
  assert.doesNotMatch(composant, /#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(\s*\d/, 'jamais une couleur en dur : des jetons');
  assert.match(composant, /<ProvenanceChip/);
  assert.match(composant, /data-bloc|:data-bloc/, 'chaque bloc se repère dans le rendu');
  const design = lireUi('..', 'DESIGN.md');
  assert.match(design, /BulletinsPanel/);
});
