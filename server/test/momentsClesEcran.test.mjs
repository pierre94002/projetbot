/**
 * Les MOMENTS CLÉS de la page d'un match joué SE RENDENT (étape 45 du plan, 24/10/2026) : la carte « Moments clés » (KeyMomentsList.vue),
 * tirée du déroulé que l'étape 43 lit pour la revue d'après-match de l'IA.
 *   node --test test/momentsClesEcran.test.mjs        (depuis server/)
 *
 * Les réponses sont celles du VRAI serveur : la phase « deroule » de test/aides/script-bulletin-page.mjs appelle
 * GET /api/match-stats/:matchId/deroule dans une copie isolée de la base d'essai (cinq vrais matchs, six matchs fabriqués : lecture
 * récente, ancienne lecture, 0-0 sans moment, liste vide publiée, sans événements, pas joué). Le rendu est fait côté serveur, sans
 * navigateur (test/aides/rendu.mjs) : `fetch` remplacé — seules les routes données répondent, tout le reste est refusé et compté.
 *
 *  1. Les règles de l'écran (ui/src/utils/momentsCles.js), RECOMPTÉES sur les événements stockés : quels faits sont des moments clés,
 *     leurs mots, l'ordre, Σ et ⌀, ce qu'on ne sait pas.
 *  2. La carte dans chacun de ses états : tableau toujours là (en-têtes, Σ, ⌀), le logo du club à chaque ligne, le drapeau du joueur,
 *     la raison dite quand il n'y a rien, la provenance, un texte d'erreur sans tableau cassé.
 *  3. Le câblage : la page d'un match joué (onglet Résumé), la route, l'hygiène (aucune couleur en dur, aucun appel autre que la route).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { UI, imp, interfacePrete, optionsDuRendu, ouvrirLeRendu, reglesPures, espaces, blocDe, corps, pied, entetes, tableauDe, texteDe } from './aides/rendu.mjs';

const options = optionsDuRendu;
const U = await imp(path.join(UI, 'src', 'utils', 'momentsCles.js'));
const J = await imp(path.join(UI, 'src', 'utils', 'joueursDuMatch.js'));
const lireUi = (...chemin) => fs.readFileSync(path.join(UI, 'src', ...chemin), 'utf8');

/** Exécute une phase de script-bulletin-page.mjs dans une copie neuve et rend son JSON. */
function lancer(phase) {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-bulletin-page.mjs'), { args: [phase], timeout: 300_000, env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' } });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}

const trouve = (html, motif, message) => assert.ok(motif.test(html), message ?? `motif absent : ${motif}`);
const absent = (html, motif, message) => assert.ok(!motif.test(html), message ?? `motif présent : ${motif}`);
const cellules = (ligne) => [...ligne.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => espaces(texteDe(m[1])));
const penaltyMarque = (e) => e.type === 'goal' && !e.ownGoal && (e.penalty === true || /^penalty$/i.test(e.detail ?? ''));

let R; // les réponses du serveur, par nom de cas
let rendu;
let Carte;
let fetchDeBase;
before(async () => {
  R = lancer('deroule').reponses;
  if (!interfacePrete) return;
  rendu = await ouvrirLeRendu({ cibles: /KeyMomentsList\.vue$/ });
  Carte = (await rendu.charger('/src/components/analysis/KeyMomentsList.vue')).default;
  // Le drapeau d'un joueur se lit en UN appel POST (players-info) que la carte ne fait pas elle-même : réponse fabriquée ici.
  fetchDeBase = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    if ((opts.method ?? 'GET') === 'POST' && /\/match-stats\/players-info$/.test(String(url))) {
      const ids = JSON.parse(opts.body).ids;
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ players: Object.fromEntries(ids.map((id) => [id, { countryCode: 'FRA', countryName: 'France' }])) }) };
    }
    return fetchDeBase(url, opts);
  };
});
after(async () => {
  if (fetchDeBase) globalThis.fetch = fetchDeBase;
  await rendu?.fermer();
});

const ROUTE = /\/api\/match-stats\/[^/]+\/deroule$/;
const ok = (corpsDeLaReponse) => ({ code: 200, corps: corpsDeLaReponse });
const carte = (reponse, props = {}) => rendu.rendre(Carte, { matchId: 'un-match', ...props }, [[ROUTE, reponse]]);

/** Ce que doit avoir TOUTE version de la carte : ses quatre comptes, son tableau (en-têtes, Σ et ⌀), son seul bouton. */
function structure(r) {
  const t = espaces(r.texte);
  assert.deepEqual(r.avertissements, [], 'aucun avertissement de Vue pendant le rendu');
  assert.deepEqual(rendu.interdits, [], 'aucune autre lecture que la route du déroulé');
  assert.ok(blocDe(r.html, 'moments-cles'), 'le bloc est toujours là');
  for (const c of ['buts', 'penalties-manques', 'expulsions', 'blessures']) trouve(r.html, new RegExp(`data-compte="${c}"`), `le compte ${c}`);
  const tab = tableauDe(r.html, 'moments-cles');
  assert.ok(tab, 'le tableau est toujours là');
  assert.deepEqual(entetes(tab), ['Minute', 'Équipe', 'Moment', 'Score']);
  assert.equal(pied(tab).length, 2, 'Σ et ⌀');
  const [sigma, moy] = pied(tab).map((x) => espaces(texteDe(x)));
  assert.ok(sigma.startsWith('Σ Total'), sigma);
  assert.ok(moy.startsWith('⌀ Moyenne'), moy);
  assert.ok(t.includes('Moments clés') && t.includes('Déroulé du match'));
  const boutons = [...r.html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => espaces(texteDe(m[1])));
  assert.deepEqual(boutons, ['Relire'], 'un seul bouton : relire');
  absent(r.html, /<form\b|<input\b|<textarea\b/);
  return { t, tab };
}

// ================================================================================ 1. les règles de l'écran

test('règles : un but, un penalty, un but contre son camp, un penalty manqué, une expulsion, un blessé — chacun dit en mots simples, dans l’ordre du jeu', () => {
  const m = U.momentsCles(R.recent.corps);
  assert.equal(m.etat, 'pret');
  assert.deepEqual(
    m.moments.map((x) => [x.minuteDite, x.genre, x.sousGenre, x.camp]),
    [
      ["12'", 'but', 'jeu', 'home'],
      ["30'", 'penalty-manque', 'penalty-manque', 'away'],
      ["44'", 'expulsion', 'rouge', 'away'],
      ["58'", 'but', 'penalty', 'home'],
      ["62'", 'blessure', 'blessure', 'away'],
      ["70'", 'expulsion', 'deuxieme-jaune', 'home'],
      ["88'", 'but', 'contre-son-camp', 'away']
    ]
  );
  const titres = m.moments.map((x) => x.titre);
  assert.deepEqual(titres, ['But de Premier But', 'Penalty manqué par Tireur Manqué', 'Rouge direct pour Rouge Direct', 'But de Sur Penalty sur penalty', 'Blessé sort sur blessure', 'Deuxième jaune puis rouge pour Deuxième Jaune', 'But contre son camp de Défenseur Maladroit']);
  // Le score suit les buts crédités, y compris le but contre son camp (qui compte pour l'extérieur).
  assert.deepEqual(m.moments.filter((x) => x.genre === 'but').map((x) => x.score), ['1-0', '2-0', '2-1']);
  assert.equal(m.moments[6].joueurDe, 'home', 'le joueur du but contre son camp est dans l’autre équipe');
  assert.match(m.moments[6].detail, /le but compte pour/);
  // L'équipe « à dix » après chaque expulsion, avec la raison de la carte quand FotMob la donne.
  assert.match(m.moments[2].detail, /Raison : jeu dur grave\./);
  assert.match(m.moments[2].detail, / joue désormais à dix\.$/);
  assert.match(m.moments[5].detail, /Raison : faute\./);
  assert.equal(m.moments[4].detail, 'Entrant le remplace.');
  assert.equal(m.moments[1].detail, 'On ne sait pas comment il a été manqué : FotMob ne le dit pas pour ce penalty.');
  // Un fait qui n'est pas un moment (jaune, remplacement ordinaire) n'y est pas : le 0-0 de la base n'en a aucun.
  assert.equal(U.momentsCles(R.sansMoment.corps).moments.length, 0);
});

test('règles : sur de vrais matchs, les moments clés sont EXACTEMENT les buts, penalties manqués, expulsions et blessures des événements stockés', () => {
  for (const nom of ['penalty', 'contreSonCamp', 'rougeDirect', 'deuxiemeJaune', 'ordinaire', 'recent', 'ancien']) {
    const r = R[nom];
    const ev = r.stocke.events;
    const m = U.momentsCles(r.corps);
    const attendu = {
      buts: ev.filter((e) => e.type === 'goal').length,
      penalties: ev.filter(penaltyMarque).length,
      contreSonCamp: ev.filter((e) => e.type === 'goal' && e.ownGoal).length,
      expulsions: ev.filter((e) => e.type === 'card' && /red/.test(e.card ?? '') && e.note !== 'not_on_pitch').length,
      blessures: ev.filter((e) => e.type === 'substitution' && e.injured).length,
      penaltiesManques: ev.filter((e) => e.type === 'missedpenalty').length + (r.stocke.shotmap ?? []).filter((s) => s.situation === 'penalty' && s.result && s.result !== 'goal' && s.minute <= 120).length
    };
    assert.deepEqual(
      [m.resume.buts, m.resume.penalties, m.resume.contreSonCamp, m.resume.expulsions, m.resume.blessures, m.resume.penaltiesManques],
      [attendu.buts, attendu.penalties, attendu.contreSonCamp, attendu.expulsions, attendu.blessures, attendu.penaltiesManques],
      nom
    );
    assert.equal(m.moments.length, attendu.buts + attendu.expulsions + attendu.blessures + attendu.penaltiesManques, `${nom} : le total`);
    const ordre = m.moments.map((x) => x.ordre);
    assert.deepEqual(ordre, [...ordre].sort((a, b) => a - b), `${nom} : dans l’ordre du jeu`);
    // Le dernier but porte le score final quand le déroulé le retrouve.
    const dernier = m.moments.filter((x) => x.genre === 'but').at(-1);
    if (dernier && r.corps.deroule.coherent) assert.equal(dernier.score, `${r.stocke.hg}-${r.stocke.ag}`, nom);
  }
  // Un penalty manqué d'un match d'avant l'étape 43 (carte des tirs) dit comment il a été manqué.
  const ancien = U.momentsCles(R.ancien.corps).moments.find((x) => x.genre === 'penalty-manque');
  assert.equal(ancien.detail, 'Arrêté par le gardien.');
});

test('règles : Σ et ⌀ du pied — les comptes en mots, la minute moyenne ; jamais une somme de minutes, jamais un zéro inventé', () => {
  const m = U.momentsCles(R.recent.corps);
  assert.equal(m.pied.sigma, '7 moments clés : 3 buts (dont 1 sur penalty, 1 contre son camp), 1 penalty manqué, 2 expulsions, 1 blessure');
  // (12 + 30 + 44 + 58 + 62 + 70 + 88) / 7 = 52
  assert.equal(m.pied.moyenne, 'minute moyenne des moments : 52\'');
  const vide = U.momentsCles(R.sansMoment.corps);
  assert.equal(vide.pied.sigma, '0 moment clé');
  assert.equal(vide.pied.moyenne, '—', 'sans moment, la moyenne n’est pas un zéro');
  assert.equal(U.piedDe([]).sigma, '0 moment clé');
  assert.deepEqual(U.resumeDe([]), { total: 0, buts: 0, sansPenaltyNiCsc: 0, penalties: 0, contreSonCamp: 0, penaltiesManques: 0, expulsions: 0, blessures: 0 });
});

test('règles : ce qu’on ne sait pas se DIT — pas joué, non publié, seuls les buts publiés, liste vide publiée, ancienne lecture, déroulé incomplet', () => {
  assert.equal(U.momentsCles(R.pasJoue.corps).etat, 'pas-joue');
  assert.equal(U.momentsCles(R.sansEvenements.corps).etat, 'non-publie');
  assert.equal(U.momentsCles(null).etat, 'inconnu');
  assert.equal(U.momentsCles(R.sansMoment.corps).etat, 'sans-moment');
  const e = (r) => U.etatDesMoments({ reponse: r, matchId: 'x' });
  assert.equal(e(R.pasJoue.corps).cle, 'pas-joue');
  assert.match(e(R.sansEvenements.corps).texte, /n’a pas publié le déroulé de ce match.*ce n’est pas « aucun but »/);
  assert.match(e(R.sansMoment.corps).texte, /^Ni but, ni penalty manqué, ni expulsion, ni blessure dans le déroulé de ce match\./);
  // Une liste vide publiée (rien du tout) : FotMob n'a publié que les buts — pas de « aucune expulsion ».
  const publieVide = e(R.videPublie.corps);
  assert.equal(publieVide.cle, 'sans-moment');
  assert.equal(publieVide.titre, 'Aucun but dans le déroulé');
  assert.match(publieVide.texte, /FotMob n’a publié que les buts de ce match : ses cartons et ses remplacements ne sont pas connus/);
  // Seuls les buts sont publiés : la note le dit, sans conclure à « aucune expulsion ».
  const partiel = U.momentsCles(R.penalty.corps);
  assert.equal(partiel.etat, 'pret');
  assert.ok(partiel.notes.some((n) => n.cle === 'partiel' && /n’a publié que les buts de ce match/.test(n.texte) && /ne veut pas dire qu’il n’y en a pas eu/.test(n.texte)));
  // Un match relevé avant l'étape 43 le dit ; un match de lecture récente non.
  assert.ok(U.momentsCles(R.penalty.corps).notes.some((n) => n.cle === 'ancienne-lecture'));
  assert.ok(!U.momentsCles(R.recent.corps).notes.some((n) => n.cle === 'ancienne-lecture'));
  // Un déroulé qui ne retrouve pas le score : dit « incomplet », rien n'en est conclu.
  const faux = JSON.parse(JSON.stringify(R.ordinaire.corps));
  faux.deroule.coherent = false;
  faux.deroule.score = { home: 5, away: 5 };
  assert.ok(U.momentsCles(faux).notes.some((n) => n.cle === 'incomplet' && /Déroulé incomplet : 9 buts listés pour un score de 5-5/.test(n.texte)));
  // L'état d'erreur et le serveur pas à jour, la lecture en cours, le match sans identifiant.
  assert.equal(U.etatDesMoments({ erreur: 'Match introuvable : x.', matchId: 'x' }).cle, 'erreur');
  assert.equal(U.etatDesMoments({ erreur: 'Le serveur n’est pas à jour : relancez demarrer-cotemaster.bat pour activer cette fonction.', matchId: 'x' }).cle, 'pas-a-jour-serveur');
  assert.equal(U.etatDesMoments({ chargement: true, matchId: 'x' }).cle, 'chargement');
  assert.equal(U.etatDesMoments({ matchId: null }).cle, 'sans-match');
});

test('règles : les minutes et les nombres à la française — « 45+2\' », « ?\' », « 1 234 », le pluriel', () => {
  assert.equal(U.minuteDite({ minute: 45, plus: 2 }), "45+2'");
  assert.equal(U.minuteDite({ minute: 78, plus: null }), "78'");
  assert.equal(U.minuteDite({ minute: null }), "?'");
  assert.equal(espaces(U.nombreDit(1234)), '1 234');
  assert.equal(U.pluriel(1, 'but', 'buts'), '1 but');
  assert.equal(U.pluriel(0, 'but', 'buts'), '0 but');
  assert.equal(U.pluriel(2, 'but', 'buts'), '2 buts');
});

test('règles : retrouver le drapeau d’un joueur — même nom sans accents, sinon le seul porteur du nom de famille dans son camp, sinon rien', () => {
  const players = {
    home: [{ playerId: 'fotmob-1', name: 'Pascal Gross' }, { playerId: 'fotmob-2', name: 'Jurrien Timber' }, { playerId: 'fotmob-3', name: 'Ana Silva' }, { playerId: 'fotmob-4', name: 'Rui Silva' }],
    away: [{ playerId: 'fotmob-9', name: 'Jurriën Timber' }, { name: 'Sans Identifiant' }]
  };
  const idx = J.indexDesJoueurs(players);
  assert.equal(J.idDuJoueur(idx, 'home', 'Pascal Groß'), 'fotmob-1', 'ß et accents');
  assert.equal(J.idDuJoueur(idx, 'home', 'Jurriën Timber'), 'fotmob-2');
  assert.equal(J.idDuJoueur(idx, 'away', 'Jurriën Timber'), 'fotmob-9', 'le même nom dans l’autre camp');
  assert.equal(J.idDuJoueur(idx, 'home', 'Timber'), 'fotmob-2', 'le nom de famille seul, porté par un seul joueur');
  assert.equal(J.idDuJoueur(idx, 'home', 'Silva'), null, 'deux Silva : jamais un drapeau au hasard');
  assert.equal(J.idDuJoueur(idx, 'away', 'Sans Identifiant'), null);
  assert.equal(J.idDuJoueur(idx, 'home', null), null);
  assert.equal(J.idDuJoueur(J.indexDesJoueurs(null), 'home', 'Pascal Gross'), null);
  assert.equal(J.simplifier('Pascal Groß'), 'pascal gross');
  reglesPures('momentsCles.js');
  reglesPures('joueursDuMatch.js');
});

// ================================================================================ 2. la carte, dans chacun de ses états

test('carte — un match de lecture récente : les sept moments, le logo de chaque équipe, le score qui suit, Σ et ⌀, la provenance réelle', options, async () => {
  const r = await carte(ok(R.recent.corps));
  const { t, tab } = structure(r);
  const lignes = corps(tab);
  assert.equal(lignes.length, 7, 'une ligne par moment clé');
  const c = lignes.map(cellules);
  assert.deepEqual(c.map((x) => x[0]), ["12'", "30'", "44'", "58'", "62'", "70'", "88'"]);
  assert.ok(c[0][2].startsWith('But de Premier But'));
  assert.ok(c[1][2].startsWith('Penalty manqué par Tireur Manqué'));
  assert.ok(c[2][2].startsWith('Rouge direct pour Rouge Direct'));
  assert.deepEqual(c.filter((x) => /^\d+-\d+$/.test(x[3])).map((x) => x[3]), ['1-0', '2-0', '2-1']);
  // Les équipes : le nom des clubs du match, avec leur logo (TeamCrest) sur chaque ligne.
  const home = R.recent.corps.home.name;
  const away = R.recent.corps.away.name;
  assert.deepEqual(c.map((x) => x[1]), [home, away, away, home, away, home, away]);
  // Le logo de CHAQUE ligne est celui de son club : l'identifiant FotMob donné par la route, jamais deviné par le nom ni remplacé par des initiales.
  const numero = (id) => String(id).replace('fotmob-', '');
  const logos = lignes.map((l) => /class="[^"]*km__equipe[^"]*"[\s\S]*?images\.fotmob\.com\/image_resources\/logo\/teamlogo\/(\d+)\.png/.exec(l)?.[1] ?? null);
  const camps = ['home', 'away', 'away', 'home', 'away', 'home', 'away'];
  assert.deepEqual(logos, camps.map((camp) => numero(R.recent.corps[camp].id)), 'le logo du bon club sur chacune des sept lignes');
  assert.notEqual(numero(R.recent.corps.home.id), numero(R.recent.corps.away.id));
  // Les quatre comptes : 3 buts, 1 penalty manqué, 2 expulsions, 1 blessure.
  const compte = (nom) => espaces(texteDe(new RegExp(`<span[^>]*data-compte="${nom}"[\\s\\S]*?</span>`).exec(r.html)[0]));
  assert.match(compte('buts'), /^3 buts/);
  assert.match(compte('penalties-manques'), /^1 penalty manqué/);
  assert.match(compte('expulsions'), /^2 expulsions/);
  assert.match(compte('blessures'), /^1 blessure/);
  // Σ et ⌀.
  const [sigma, moy] = pied(tab).map((x) => espaces(texteDe(x)));
  assert.equal(sigma, 'Σ Total 7 moments clés : 3 buts (dont 1 sur penalty, 1 contre son camp), 1 penalty manqué, 2 expulsions, 1 blessure');
  assert.equal(moy, "⌀ Moyenne minute moyenne des moments : 52'");
  // La provenance : le vrai fournisseur et l'endroit des données, jamais « Cotes marché (Odds API) ».
  assert.ok(t.includes('FotMob · événements du match rangés au magasin'));
  assert.match(t, /rangés au magasin\s+relevé /, 'un relevé (et non un calcul) : le déroulé vient de FotMob, le code ne l’a pas calculé');
  assert.ok(!/Cotes marché|Odds API/.test(t));
  assert.match(r.html, /title="[^"]*matches \(colonnes events, shotmap, meta\)/, 'la table au survol');
  // Rien n'est dit « à venir » ni « aucun » : le match est lu en entier, sans note d'ancienne lecture.
  absent(r.html, /data-note="ancienne-lecture"|data-note="partiel"/);
  assert.equal(r.appels.length, 1, 'une seule lecture : la route du déroulé');
});

test('carte — un vrai match où seuls les buts sont publiés : les buts avec leur score, et la note qui dit de ne pas conclure à « aucune expulsion »', options, async () => {
  const r = await carte(ok(R.penalty.corps));
  const { tab } = structure(r);
  const c = corps(tab).map(cellules);
  const buts = R.penalty.stocke.events.filter((e) => e.type === 'goal');
  assert.equal(c.length, buts.length);
  assert.ok(c.some((x) => /sur penalty/.test(x[2])), 'le penalty est dit');
  assert.deepEqual(c.map((x) => x[3]).at(-1), `${R.penalty.stocke.hg}-${R.penalty.stocke.ag}`, 'le dernier but porte le score final');
  trouve(r.html, /data-note="partiel"/);
  assert.match(espaces(r.texte), /n’a publié que les buts de ce match/);
  trouve(r.html, /data-note="ancienne-lecture"/);
});

test('carte — un but contre son camp et un rouge direct sur de vrais matchs : le but compte pour l’équipe crédité, l’équipe joue à dix', options, async () => {
  const csc = await carte(ok(R.contreSonCamp.corps));
  structure(csc);
  const lignesCsc = corps(tableauDe(csc.html, 'moments-cles')).map(cellules);
  const stocke = R.contreSonCamp.stocke.events.filter((e) => e.type === 'goal' && e.ownGoal);
  const ligne = lignesCsc.find((x) => x[2].startsWith('But contre son camp de'));
  assert.ok(ligne);
  assert.ok(ligne[2].includes(stocke[0].player));
  const equipeCredite = stocke[0].side === 'home' ? R.contreSonCamp.corps.home.name : R.contreSonCamp.corps.away.name;
  assert.equal(ligne[1], equipeCredite, 'la ligne est rangée sous l’équipe à qui le but compte');
  assert.match(ligne[2], /le but compte pour/);
  const rouge = await carte(ok(R.rougeDirect.corps));
  const lignesRouge = corps(tableauDe(rouge.html, 'moments-cles')).map(cellules);
  const expulsion = lignesRouge.find((x) => /^Rouge direct pour/.test(x[2]));
  assert.ok(expulsion, 'le rouge direct est un moment clé');
  assert.match(expulsion[2], /joue désormais à dix\./);
  const deux = await carte(ok(R.deuxiemeJaune.corps));
  assert.ok(corps(tableauDe(deux.html, 'moments-cles')).map(cellules).some((x) => /^Deuxième jaune puis rouge pour/.test(x[2])));
});

test('carte — le drapeau de chaque joueur nommé, retrouvé sur la feuille du match (un seul appel de plus : les nationalités)', options, async () => {
  const m = R.recent.corps;
  const players = {
    home: [{ playerId: 'fotmob-7001', name: 'Premier But' }, { playerId: 'fotmob-7002', name: 'Sur Penalty' }, { playerId: 'fotmob-7003', name: 'Deuxième Jaune' }],
    away: [{ playerId: 'fotmob-7101', name: 'Tireur Manqué' }, { playerId: 'fotmob-7102', name: 'Rouge Direct' }, { playerId: 'fotmob-7103', name: 'Blessé' }]
  };
  // Le défenseur du but contre son camp n'est pas sur la feuille fabriquée : pas de drapeau pour lui, son nom reste écrit.
  const playerInfo = await rendu.charger('/src/utils/playerInfo.js');
  const ids = [...players.home, ...players.away].map((p) => p.playerId);
  for (const id of ids) playerInfo.playerInfoFor(id);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const r = await carte(ok(m), { players });
  structure(r);
  const lignes = [...corps(tableauDe(r.html, 'moments-cles'))];
  const avecDrapeau = lignes.filter((l) => /class="flag"/.test(l));
  // 6 lignes nomment un joueur de la feuille ; le but contre son camp en nomme un qui n'y est pas.
  assert.equal(avecDrapeau.length, 6, `${avecDrapeau.length} drapeaux`);
  assert.ok(!/class="flag"/.test(lignes[6]), 'le défenseur du but contre son camp n’a pas de drapeau');
  assert.match(avecDrapeau[0], /title="France"/);
  assert.deepEqual(rendu.interdits, []);
});

test('carte — sans événements stockés : « non publié », jamais « aucun but » ; le tableau reste, Σ à zéro et ⌀ sans valeur', options, async () => {
  const r = await carte(ok(R.sansEvenements.corps));
  const { t, tab } = structure(r);
  assert.ok(t.includes('Déroulé non publié'));
  assert.match(t, /n’a pas publié le déroulé de ce match/);
  assert.match(t, /ce n’est pas « aucun but »/);
  assert.equal(corps(tab).length, 1, 'une ligne qui dit pourquoi');
  assert.match(espaces(texteDe(corps(tab)[0])), /n’a pas publié le déroulé de ce match/);
  const [sigma, moy] = pied(tab).map((x) => espaces(texteDe(x)));
  assert.equal(sigma, 'Σ Total 0 moment clé');
  assert.equal(moy, '⌀ Moyenne —');
  const compteDesButs = /<span[^>]*data-compte="buts"[\s\S]*?<\/span>/.exec(r.html)[0];
  assert.match(espaces(texteDe(compteDesButs)), /^0 but/, 'les comptes restent, à zéro');
  trouve(r.html, /data-raison="non-publie"/);
});

test('carte — un match pas encore joué, un 0-0 sans moment, une liste vide publiée : chacun dit sa raison et garde sa structure', options, async () => {
  const pas = await carte(ok(R.pasJoue.corps));
  structure(pas);
  assert.match(espaces(pas.texte), /Match pas encore joué/);
  trouve(pas.html, /data-raison="pas-joue"/);
  const rien = await carte(ok(R.sansMoment.corps));
  structure(rien);
  assert.match(espaces(rien.texte), /Rien de marquant/);
  assert.match(espaces(rien.texte), /Ni but, ni penalty manqué, ni expulsion, ni blessure dans le déroulé de ce match/);
  trouve(rien.html, /data-raison="sans-moment"/);
  const vide = await carte(ok(R.videPublie.corps));
  structure(vide);
  assert.match(espaces(vide.texte), /Aucun but dans le déroulé/);
  assert.match(espaces(vide.texte), /n’a publié que les buts de ce match/);
});

test('carte — le serveur en erreur ou pas à jour : la raison est dite, le tableau (en-têtes, Σ, ⌀) reste', options, async () => {
  const panne = await carte({ code: 500, corps: { error: 'La base est occupée.' } });
  structure(panne);
  assert.match(espaces(panne.texte), /Moments clés illisibles/);
  assert.match(espaces(panne.texte), /La base est occupée\./);
  trouve(panne.html, /data-raison="erreur"/);
  const ancien = await carte({ code: 404, corps: { error: 'Route introuvable : GET /api/match-stats/x/deroule' } });
  structure(ancien);
  assert.match(espaces(ancien.texte), /Serveur à relancer/);
  assert.match(espaces(ancien.texte), /relancez demarrer-cotemaster\.bat/);
  const inconnu = await carte({ code: 404, corps: { error: 'Match introuvable : x.' } });
  structure(inconnu);
  assert.match(espaces(inconnu.texte), /Match introuvable : x\./);
});

test('carte — sans identifiant de match : aucune lecture ne part, la carte le dit et garde son tableau', options, async () => {
  const r = await rendu.rendre(Carte, { matchId: null }, []);
  structure(r);
  trouve(r.html, /data-raison="sans-match"/);
  assert.equal(r.appels.length, 0, 'aucune lecture sans identifiant');
});

// ================================================================================ 3. le câblage et l'hygiène

test('câblage — la page d’un match joué montre la carte dans son onglet Résumé, avec l’identifiant du match et la feuille des joueurs', () => {
  const page = lireUi('views', 'MatchDetailView.vue');
  assert.match(page, /import KeyMomentsList from '@\/components\/analysis\/KeyMomentsList\.vue';/);
  const bloc = /<KeyMomentsList[\s\S]*?\/>/.exec(page)?.[0] ?? '';
  for (const attendu of [':match-id="matchId"', ':home-name="entry.homeName"', ':away-name="entry.awayName"', ':league=', ':home-id=', ':away-id=', ':players="entry.players ?? null"']) assert.ok(bloc.includes(attendu), attendu);
  // Dans le Résumé seulement, avant les meilleures statistiques.
  const iResume = page.indexOf("v-if=\"tab === 'resume'\"");
  assert.ok(iResume > 0 && page.indexOf('<KeyMomentsList') > iResume && page.indexOf('<KeyMomentsList') < page.indexOf('title="Meilleures statistiques"'));
  assert.equal(page.split('<KeyMomentsList').length, 2, 'une seule fois');
  const api = lireUi('services', 'matchStatsApi.js');
  assert.match(api, /deroule: \(matchId\) => httpClient\.get\(`\/match-stats\/\$\{encodeURIComponent\(matchId\)\}\/deroule`\)/);
});

test('hygiène — la carte ne lit qu’une route, n’écrit rien, n’appelle ni Claude ni FotMob, n’a aucune couleur en dur ; les règles sont pures', () => {
  const src = lireUi('components', 'analysis', 'KeyMomentsList.vue');
  // Le code de la carte, sans ses commentaires (qui disent justement « aucun appel à Claude »).
  const script = src.slice(0, src.indexOf('</script>')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.deepEqual([...script.matchAll(/matchStatsApi\.(\w+)\(/g)].map((m) => m[1]), ['deroule']);
  assert.doesNotMatch(script, /\bfetch\(|httpClient|\.post\(|\.put\(|\.delete\(|localStorage|matchAiAnalysisApi|claude/i);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/, 'aucune couleur en dur : des jetons seulement');
  for (const icone of [...src.matchAll(/name="([a-zA-Z]+)"/g)].map((m) => m[1]).concat(Object.values(U.GENRES_DE_MOMENT).map((g) => g.icone))) {
    assert.match(lireUi('components', 'common', 'AppIcon.vue'), new RegExp(`\\b${icone}\\b`), `icône ${icone}`);
  }
  // Pas d'unicode échappé ni de caractère invisible dans les fichiers écrits.
  for (const f of [['utils', 'momentsCles.js'], ['utils', 'joueursDuMatch.js'], ['components', 'analysis', 'KeyMomentsList.vue']]) {
    const texte = lireUi(...f);
    assert.doesNotMatch(texte, new RegExp(`${String.fromCharCode(92)}${String.fromCharCode(92)}u[0-9a-fA-F]{4}`), `${f.join('/')} : pas de code ${String.fromCharCode(92)}uXXXX`);
  }
});
