/**
 * Le TICKET et « J'ai parié » (étape 10 du plan).
 *   node --test test/ticket.test.mjs        (depuis server/)
 *
 *  1. Les règles du ticket (ui/src/utils/ticket.js, JavaScript pur) : la nature d'un ticket (la même que le
 *     serveur), ce qu'on prend et ce qu'on remplace, ce qui manque avant « J'ai parié », le corps envoyé, la
 *     cote prise et son heure, le gain potentiel et le gain attendu (simple seulement : un combiné attend
 *     l'étape 28), la cote face à la cote minimale.
 *  2. « J'ai parié » pour de vrai, dans une copie isolée (aides/script-ticket.mjs : base d'essai, relevé
 *     The Odds API et cotes gratuites FABRIQUÉS, heure figée, réseau coupé ; le corps est construit par les
 *     règles de l'écran) : le pari enregistré contient le bookmaker, la cote prise, la probabilité du moteur
 *     au moment du pari et l'heure de la cote ; il est dans Mes paris (GET /api/bets) ; sa valeur de clôture
 *     se calcule le lendemain ; le règlement le lit ; les anciens paris restent lus, inchangés.
 *  3. Les refus du serveur (deux bookmakers, combiné du même match sans sa cote, champs mal formés).
 * Les valeurs attendues sont écrites à la main ou recalculées par le serveur (gainAttenduDuPari,
 * natureDuPari), jamais recopiées de la sortie du code testé.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { natureDuPari, gainAttenduDuPari } from '../src/data/repositories/betsRepository.js';

const UI_SRC = path.resolve(SERVEUR, '..', 'ui', 'src');
const pret = ['ticket.js', 'comparateur.js', 'langageParis.js'].every((f) => fs.existsSync(path.join(UI_SRC, 'utils', f)));
const options = { skip: pret ? false : 'ui/src/utils (ticket, comparateur, langageParis) manque' };
const K = pret ? await import(pathToFileURL(path.join(UI_SRC, 'utils', 'ticket.js')).href) : {};
const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-ticket.mjs');
const T0 = Date.parse('2026-10-05T12:00:00.000Z');

// --------------------------------------------------------------- les paris d'avant (format du 21/09 au 05/10)

/** Les formes réellement rencontrées dans le carnet d'avant l'étape 10 (clés relevées, contenu fabriqué). */
const ANCIENS = [
  // Un simple réglé, statut porté par le ticket seul, sans heure de match.
  { id: 'ancien-simple', createdAt: '2026-09-20T10:00:00.000Z', settledAt: '2026-09-21T10:00:00.000Z', status: 'won', stake: 10, odds: 1.8, legs: [{ matchId: 'x1', homeName: 'Arsenal', awayName: 'Chelsea', league: 'EPL', market: 'Résultat', pick: 'Arsenal gagne', odds: 1.8, marketId: 'result', params: { outcome: 'home' } }] },
  // Un simple en attente, avec son heure de match et le statut de sa sélection.
  { id: 'ancien-attente', createdAt: '2026-10-04T08:00:00.000Z', settledAt: null, status: 'pending', stake: 5, odds: 1.72, legs: [{ matchId: 'x2', homeName: 'Fulham', awayName: 'Brentford', league: 'EPL', commenceTime: '2026-10-06T14:00:00Z', market: 'Total buts', pick: 'Plus de 2.5 buts', odds: 1.72, marketId: 'totalGoals', params: { line: 2.5, side: 'over' }, status: 'pending' }] },
  // Un combiné réglé à la main sélection par sélection.
  {
    id: 'ancien-combine',
    createdAt: '2026-09-28T09:00:00.000Z',
    settledAt: '2026-09-29T21:00:00.000Z',
    status: 'lost',
    stake: 4,
    odds: 3.06,
    legs: [
      { matchId: 'x3', homeName: 'Lyon', awayName: 'Nice', league: 'Ligue 1', commenceTime: '2026-09-28T19:00:00Z', market: 'Les 2 équipes marquent', pick: 'Oui', odds: 1.7, marketId: 'bothTeamsScore', params: { outcome: 'yes' }, status: 'won', settledBy: 'manual', settledScore: null },
      { matchId: 'x4', homeName: 'Lens', awayName: 'Lille', league: 'Ligue 1', commenceTime: '2026-09-29T19:00:00Z', market: 'Résultat', pick: 'Match nul', odds: 1.8, marketId: 'result', params: { outcome: 'draw' }, status: 'lost', settledBy: 'auto', settledScore: '2-1', settledResultId: 'r4' }
    ]
  }
];

let P; // les deux phases du script, dans la même copie
before(() => {
  if (!pret) return;
  const copie = preparerCopie({ runtime: { 'bets.json': ANCIENS } });
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const lancer = (phase, maintenant) => {
      const r = executer(copie, SCRIPT, { args: [phase, UI_SRC], timeout: 300_000, ...(maintenant ? { maintenant } : {}) });
      assert.equal(r.code, 0, `phase ${phase} :\n${r.erreurs.slice(-3000)}`);
      assert.ok(r.json?.ok, `phase ${phase} : sortie illisible\n${r.sortie.slice(-1500)}`);
      assert.equal(r.reseau, false, `phase ${phase} : un appel réseau`);
      return r.json;
    };
    P = { pari: lancer('pari'), cloture: lancer('cloture', '2026-10-06T12:00:00.000Z') };
  } finally {
    copie.nettoyer();
  }
});
after(() => {});

// ------------------------------------------------------------------ 1. les règles du ticket

const sel = (extra = {}) => ({
  matchId: 'm1',
  homeName: 'Man City',
  awayName: 'Liverpool',
  league: 'EPL',
  commenceTime: '2026-10-05T18:30:00Z',
  market: 'Résultat',
  pick: 'Man City gagne',
  marketId: 'result',
  params: { outcome: 'home' },
  cote: 2.3,
  bookmaker: 'williamhill',
  bookmakerTitle: 'William Hill',
  coteReleveeA: '2026-10-05T11:50:00.000Z',
  coteSource: 'the-odds-api',
  probabiliteMoteur: 0.5,
  probabiliteSource: 'cote juste',
  probabiliteLueA: '2026-10-05T12:00:00.000Z',
  coteJuste: 2,
  bornes: { coteMinimale: 2.04, coteMaximale: 2.5, code: 'value-possible', coteMax: 5 },
  ...extra
});
const BOOKMAKERS = [
  { cle: 'williamhill', titre: 'William Hill' },
  { cle: 'unibet_nl', titre: 'Unibet (NL)' }
];

test('la nature d’un ticket : simple, combiné de plusieurs matchs, combiné du même match — la même règle que le serveur, sur 2 000 tickets tirés au sort', options, () => {
  assert.equal(K.natureDuTicket([]), 'vide');
  assert.equal(K.natureDuTicket([sel()]), 'simple');
  assert.equal(K.natureDuTicket([sel(), sel({ matchId: 'm2' })]), 'combine');
  assert.equal(K.natureDuTicket([sel(), sel({ market: 'Total buts', pick: 'Plus de 2.5 buts' })]), 'combine-meme-match');
  // Deux matchs, dont un en double : le combiné contient des sélections liées.
  assert.equal(K.natureDuTicket([sel(), sel({ matchId: 'm2' }), sel({ market: 'Total buts', pick: 'Oui' })]), 'combine-meme-match');
  // Sans identifiant de match : les deux clubs et l'heure (comme le serveur).
  assert.equal(K.natureDuTicket([sel({ matchId: undefined }), sel({ matchId: undefined, pick: 'Oui' })]), 'combine-meme-match');
  let graine = 7;
  const hasard = () => ((graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let n = 0; n < 2000; n++) {
    const jambes = Array.from({ length: 1 + Math.floor(hasard() * 4) }, (_, i) => sel({ matchId: hasard() < 0.15 ? undefined : `m${Math.floor(hasard() * 3)}`, homeName: `H${Math.floor(hasard() * 3)}`, pick: `p${i}` }));
    assert.equal(K.natureDuTicket(jambes), natureDuPari(jambes), `ticket ${n}`);
  }
});

test('prendre une sélection : un second clic la retire, un autre bookmaker la met à jour, une autre issue du même marché la remplace, un seul pari par match tant que le combiné n’est pas demandé', options, () => {
  let r = K.prendre([], sel());
  assert.equal(r.action, 'ajoutee');
  r = K.prendre(r.selections, sel());
  assert.equal(r.action, 'retiree');
  assert.deepEqual(r.selections, []);
  // La même issue chez Unibet : mise à jour (une sélection, le nouveau bookmaker).
  r = K.prendre([sel()], sel({ bookmaker: 'unibet_nl', cote: 2.25 }));
  assert.equal(r.action, 'mise-a-jour');
  assert.deepEqual(r.selections.map((s) => [s.bookmaker, s.cote]), [['unibet_nl', 2.25]]);
  // Le nul après la victoire : même marché, ils s'excluent.
  r = K.prendre([sel()], sel({ pick: 'Match nul', params: { outcome: 'draw' } }), { memeMatch: true });
  assert.equal(r.action, 'remplacee');
  assert.deepEqual(r.selections.map((s) => s.pick), ['Match nul']);
  assert.match(r.message, /Deux issues d'un même marché s'excluent/);
  // Un autre marché du même match : remplacé sans le combiné, ajouté avec.
  const buts = sel({ market: 'Total buts', pick: 'Plus de 2.5 buts', marketId: 'totalGoals', params: { line: 2.5, side: 'over' } });
  r = K.prendre([sel()], buts);
  assert.equal(r.action, 'remplacee');
  assert.match(r.message, /Un seul pari par match/);
  assert.match(r.message, /Combiner les paris d'un même match/);
  r = K.prendre([sel()], buts, { memeMatch: true });
  assert.equal(r.action, 'ajoutee');
  assert.equal(r.selections.length, 2);
  // Les buts de l'autre équipe : un autre marché (l'équipe compte) ; ceux de la même équipe : le même.
  const butsDom = sel({ market: 'Buts — Man City', pick: 'Man City — Plus de 1.5 buts', marketId: 'teamGoals', params: { team: 'home', line: 1.5, side: 'over' } });
  const butsExt = sel({ market: 'Buts — Liverpool', pick: 'Liverpool — Plus de 0.5 buts', marketId: 'teamGoals', params: { team: 'away', line: 0.5, side: 'over' } });
  assert.equal(K.prendre([butsDom], butsExt, { memeMatch: true }).action, 'ajoutee');
  assert.equal(K.prendre([butsDom], { ...butsDom, pick: 'Man City — Plus de 2.5 buts', params: { team: 'home', line: 2.5, side: 'over' } }, { memeMatch: true }).action, 'remplacee');
  // Un autre match : ajouté (le combiné d'avant).
  assert.equal(K.prendre([sel()], sel({ matchId: 'm2' })).action, 'ajoutee');
});

test('ce qui manque avant « J’ai parié » : la mise, le bookmaker (un des vôtres), la cote prise de chaque sélection, la cote d’un combiné du même match', options, () => {
  const edition = { bookmaker: 'williamhill', cotes: {}, coteCombinee: null };
  assert.deepEqual(K.controleDuTicket({ selections: [], edition, mise: 10, bookmakers: BOOKMAKERS }), ['Aucune sélection sur le ticket.']);
  assert.deepEqual(K.controleDuTicket({ selections: [sel()], edition, mise: 10, bookmakers: BOOKMAKERS }), []);
  assert.match(K.controleDuTicket({ selections: [sel()], edition, mise: 0, bookmakers: BOOKMAKERS })[0], /mise/);
  assert.match(K.controleDuTicket({ selections: [sel()], edition: { ...edition, bookmaker: null }, mise: 10, bookmakers: BOOKMAKERS })[0], /Choisissez le bookmaker/);
  assert.match(K.controleDuTicket({ selections: [sel()], edition: { ...edition, bookmaker: 'betclic_fr' }, mise: 10, bookmakers: BOOKMAKERS })[0], /n'est pas un de vos bookmakers/);
  // Une sélection sans cote de bookmaker (un pronostic) : la cote prise est à taper.
  const sansCote = sel({ cote: null, bookmaker: null, coteReleveeA: null, coteSource: null });
  assert.match(K.controleDuTicket({ selections: [sansCote], edition, mise: 10, bookmakers: BOOKMAKERS })[0], /Cote prise de « Man City gagne »/);
  assert.deepEqual(K.controleDuTicket({ selections: [sansCote], edition: { ...edition, cotes: { [K.cleDeSelection(sansCote)]: 2.2 } }, mise: 10, bookmakers: BOOKMAKERS }), []);
  // Un combiné du même match : la cote du bookmaker est obligatoire.
  const buts = sel({ market: 'Total buts', pick: 'Plus de 2.5 buts', marketId: 'totalGoals', params: { line: 2.5, side: 'over' }, cote: 1.9 });
  assert.match(K.controleDuTicket({ selections: [sel(), buts], edition, mise: 10, bookmakers: BOOKMAKERS }).at(-1), /tapez la cote que donne le bookmaker/);
  assert.deepEqual(K.controleDuTicket({ selections: [sel(), buts], edition: { ...edition, coteCombinee: 4.1 }, mise: 10, bookmakers: BOOKMAKERS }), []);
  // Un combiné de deux matchs : la cote du combiné est facultative (le produit).
  assert.deepEqual(K.controleDuTicket({ selections: [sel(), sel({ matchId: 'm2' })], edition, mise: 10, bookmakers: BOOKMAKERS }), []);
});

test('le corps envoyé : le format d’avant, plus le bookmaker, la probabilité du moteur et l’heure de la cote ; une cote changée ou un autre bookmaker = cote vue au moment du pari', options, () => {
  const edition = { bookmaker: 'williamhill', cotes: {}, coteCombinee: null };
  const corps = K.pariAEnregistrer({ selections: [sel()], edition, mise: 10, origine: 'page-du-match', maintenant: T0, bookmakers: BOOKMAKERS });
  assert.deepEqual(corps, {
    stake: 10,
    legs: [
      {
        matchId: 'm1',
        homeName: 'Man City',
        awayName: 'Liverpool',
        league: 'EPL',
        commenceTime: '2026-10-05T18:30:00Z',
        market: 'Résultat',
        marketId: 'result',
        params: { outcome: 'home' },
        pick: 'Man City gagne',
        odds: 2.3,
        bookmaker: 'williamhill',
        bookmakerTitle: 'William Hill',
        probabiliteMoteur: 0.5,
        probabiliteSource: 'cote juste',
        probabiliteLueA: '2026-10-05T12:00:00.000Z',
        coteReleveeA: '2026-10-05T11:50:00.000Z',
        coteSource: 'the-odds-api'
      }
    ],
    origine: 'page-du-match'
  });
  // La cote a bougé chez William Hill (tapée 2,25) : vue au moment du pari.
  const bouge = K.pariAEnregistrer({ selections: [sel()], edition: { ...edition, cotes: { [K.cleDeSelection(sel())]: 2.25 } }, mise: 10, origine: 'mes-paris', maintenant: T0, bookmakers: BOOKMAKERS });
  assert.deepEqual([bouge.legs[0].odds, bouge.legs[0].coteSource, bouge.legs[0].coteReleveeA], [2.25, 'au-pari', '2026-10-05T12:00:00.000Z']);
  // Même prix chez un AUTRE bookmaker que celui du relevé : l'heure du relevé ne vaut pas pour lui.
  const ailleurs = K.pariAEnregistrer({ selections: [sel()], edition: { ...edition, bookmaker: 'unibet_nl' }, mise: 10, origine: 'mes-paris', maintenant: T0, bookmakers: BOOKMAKERS });
  assert.deepEqual([ailleurs.legs[0].bookmaker, ailleurs.legs[0].bookmakerTitle, ailleurs.legs[0].coteSource], ['unibet_nl', 'Unibet (NL)', 'au-pari']);
  // Un combiné du même match : sa cote part en « cotePrise » ; un simple n'en a pas.
  const buts = sel({ market: 'Total buts', pick: 'Plus de 2.5 buts', marketId: 'totalGoals', params: { line: 2.5, side: 'over' }, cote: 1.9 });
  assert.equal(K.pariAEnregistrer({ selections: [sel(), buts], edition: { ...edition, coteCombinee: 4.1 }, mise: 4, origine: 'mes-paris', maintenant: T0 }).cotePrise, 4.1);
  assert.equal('cotePrise' in corps, false);
});

test('gain potentiel et gain attendu : mise × (probabilité × cote prise − 1) pour un simple (la formule du serveur) ; jamais pour un combiné, qui attend l’étape 28', options, () => {
  const edition = { bookmaker: 'williamhill', cotes: {}, coteCombinee: null };
  const g = K.gainsDuTicket({ selections: [sel()], edition, mise: 10 });
  assert.deepEqual([g.nature, g.cote, g.potentiel], ['simple', 2.3, 23]);
  // Le serveur, sur le même pari : la même chose.
  const serveur = gainAttenduDuPari({ stake: 10, odds: 2.3, legs: [{ probabiliteMoteur: 0.5 }] });
  assert.deepEqual(g.attendu, { montant: serveur.montant, pourcent: serveur.pourcent });
  assert.deepEqual(serveur, { montant: 1.5, pourcent: 15, raison: null });
  // Sur 1 000 tirages : l'écran et le serveur, au centime près, le même nombre.
  let graine = 11;
  const hasard = () => ((graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let n = 0; n < 1000; n++) {
    const p = 0.05 + hasard() * 0.9;
    const cote = Math.round((1.05 + hasard() * 8) * 100) / 100;
    const mise = Math.round((1 + hasard() * 99) * 100) / 100;
    const ecran = K.gainsDuTicket({ selections: [sel({ probabiliteMoteur: p, cote })], edition, mise }).attendu;
    const s = gainAttenduDuPari({ stake: mise, odds: cote, legs: [{ probabiliteMoteur: p }] });
    assert.deepEqual(ecran, { montant: s.montant, pourcent: s.pourcent }, `tirage ${n}`);
  }
  // Un simple sans probabilité : inconnu, jamais 0.
  const sansP = K.gainsDuTicket({ selections: [sel({ probabiliteMoteur: null })], edition, mise: 10 });
  assert.equal(sansP.attendu, null);
  assert.match(sansP.raisonAttendu, /pas de probabilité/);
  // Un combiné de deux matchs : produit des cotes, pas de gain attendu.
  const deux = K.gainsDuTicket({ selections: [sel(), sel({ matchId: 'm2', cote: 1.5 })], edition, mise: 10 });
  assert.deepEqual([deux.nature, deux.cote, deux.attendu], ['combine', 2.3 * 1.5, null]);
  assert.match(deux.raisonAttendu, /étape 28/);
  // Un combiné du même match : sans la cote du bookmaker, ni cote ni gain ; avec, la cote tapée — jamais le produit.
  const buts = sel({ market: 'Total buts', pick: 'Plus de 2.5 buts', marketId: 'totalGoals', params: { line: 2.5, side: 'over' }, cote: 1.9 });
  const meme = K.gainsDuTicket({ selections: [sel(), buts], edition, mise: 10 });
  assert.deepEqual([meme.nature, meme.cote, meme.potentiel, meme.attendu], ['combine-meme-match', null, null, null]);
  const memeAvec = K.gainsDuTicket({ selections: [sel(), buts], edition: { ...edition, coteCombinee: 4.1 }, mise: 10 });
  assert.deepEqual([memeAvec.cote, memeAvec.potentiel, memeAvec.attendu], [4.1, 41, null]);
  assert.match(K.PRIX_JUSTE_COMBINE, /étape 28 du plan/);
  assert.match(K.PRIX_JUSTE_COMBINE, /ni value ni gain attendu/);
  // Le gain attendu d'un pari du carnet, en mots.
  assert.equal(K.gainAttenduDit({ gainAttendu: { montant: 1.5, pourcent: 15 } }), '+1,50 € (+15 %)');
  assert.equal(K.gainAttenduDit({ gainAttendu: { montant: -0.4, pourcent: -4 } }), '−0,40 € (−4 %)');
  assert.equal(K.gainAttenduDit({ gainAttendu: { montant: null, raison: 'combine' } }), 'pas encore (combiné : étape 28)');
  assert.equal(K.gainAttenduDit({}), 'non noté');
});

test('les paris de Mes paris dans le ticket : un value bet garde son bookmaker, sa cote relevée et la probabilité juste ; un pronostic n’a qu’une cote JUSTE (la cote prise est à taper) et sa probabilité est 1 / cette cote', options, () => {
  const verdict = { bookmaker: 'williamhill', bookmakerTitle: 'William Hill', releveAt: '2026-10-05T11:50:00.000Z', probabilite: 0.4887, coteJuste: 2.05, juges: { palier: 'Pinnacle', livres: ['Pinnacle'] } };
  const value = K.selectionDuCandidat({ matchId: 'm1', homeName: 'A', awayName: 'B', league: 'EPL', commenceTime: '2026-10-05T18:30:00Z', market: 'Résultat', pick: 'A gagne', marketId: 'result', params: { outcome: 'home' }, odds: 2.3, modelOdds: 2.05, bookmaker: 'William Hill', verdict, lueA: '2026-10-05T12:00:00.000Z', bornes: { coteMinimale: 2.09, coteMaximale: 2.55, code: 'value-possible' } });
  assert.deepEqual(
    [value.cote, value.bookmaker, value.bookmakerTitle, value.coteReleveeA, value.coteSource, value.probabiliteMoteur, value.coteJuste, value.probabiliteLueA, value.bornes.coteMinimale],
    [2.3, 'williamhill', 'William Hill', '2026-10-05T11:50:00.000Z', 'the-odds-api', 0.4887, 2.05, '2026-10-05T12:00:00.000Z', 2.09]
  );
  assert.equal(value.probabiliteSource, 'cote juste des bookmakers de référence (Pinnacle), marge retirée');
  const palier3 = K.selectionDuCandidat({ market: 'Résultat', pick: 'A gagne', odds: 2.3, verdict: { ...verdict, juges: { palier: 'palier 3', livres: ['William Hill', 'Betsson'] } } });
  assert.equal(palier3.probabiliteSource, 'cote juste des bookmakers de référence (palier 3 : William Hill, Betsson), marge retirée');
  // Un pronostic (« Tous les paris », « Paris les plus probables ») : sa cote est la cote JUSTE du moteur, jamais celle d'un bookmaker.
  const pick = K.selectionDuCandidat({ matchId: 'm1', homeName: 'A', awayName: 'B', market: 'Total buts', pick: 'Plus de 2.5 buts', marketId: 'totalGoals', params: { line: 2.5, side: 'over' }, odds: 1.72 });
  assert.deepEqual([pick.cote, pick.bookmaker, pick.coteReleveeA, pick.coteSource, pick.coteJuste], [null, null, null, null, 1.72]);
  assert.equal(pick.probabiliteMoteur, 1 / 1.72);
  assert.equal(pick.probabiliteSource, 'cote juste du moteur (1 / probabilité)');
  assert.equal(K.cleDeSelection(pick), 'm1|Total buts|Plus de 2.5 buts', 'la clé des paris de Mes paris (legKey)');
  // Sa cote prise est à taper : rien ne part sans elle.
  assert.match(K.controleDuTicket({ selections: [pick], edition: { bookmaker: 'williamhill', cotes: {}, coteCombinee: null }, mise: 5, bookmakers: BOOKMAKERS })[0], /Cote prise de « Plus de 2\.5 buts »/);
  assert.equal(K.bookmakerPropose([pick, value]), 'williamhill');
  assert.equal(K.bookmakerPropose([pick]), null);
});

test('une cote prise face à la cote minimale du serveur : « encore une value », « plus de value », « trop belle » — en mots, jamais en vert', options, () => {
  const b = { coteMinimale: 2.04, coteMaximale: 2.5, code: 'value-possible', coteMax: 5 };
  assert.equal(K.faceAuxBornes(2.03, b), 'sous-minimum');
  assert.equal(K.faceAuxBornes(2.04, b), 'value');
  assert.equal(K.faceAuxBornes(2.5, b), 'value');
  assert.equal(K.faceAuxBornes(2.51, b), 'au-dessus');
  assert.equal(K.faceAuxBornes(2.2, { coteMinimale: null }), 'inconnu');
  assert.equal(K.phraseFaceAuxBornes(2.3, b), '2,30 : au moins 2,04, encore une value au seuil du moteur.');
  assert.equal(K.phraseFaceAuxBornes(2.03, b), '2,03 : sous 2,04, plus de value à ce prix au seuil du moteur.');
  assert.match(K.phraseFaceAuxBornes(2.6, b), /trop belle pour être vraie/);
});

// ------------------------------------------------------------------ 2. « J'ai parié », pour de vrai

const envoi = (nom) => P.pari.envois[nom];

test('« J’ai parié » sur la case de William Hill : le pari contient le bookmaker, la cote prise, la probabilité du moteur au moment du pari et l’heure de la cote', options, () => {
  const a = P.pari.analyse.corps;
  const e = envoi('domicile');
  assert.equal(e.code, 201, JSON.stringify(e.reponse));
  const pari = e.reponse;
  const jambe = pari.legs[0];
  // Le format d'avant, tel quel.
  assert.deepEqual(
    Object.keys(pari).slice(0, 7),
    ['id', 'createdAt', 'settledAt', 'status', 'stake', 'odds', 'legs'],
    'les champs d’avant, dans le même ordre'
  );
  assert.deepEqual([pari.status, pari.stake, pari.odds, pari.createdAt], ['pending', 10, 2.3, '2026-10-05T12:00:00.000Z']);
  assert.deepEqual([jambe.matchId, jambe.market, jambe.pick, jambe.marketId, jambe.params, jambe.odds, jambe.status], ['essai-a', 'Résultat', 'Man City gagne', 'result', { outcome: 'home' }, 2.3, 'pending']);
  // Ce que l'étape 10 ajoute : le bookmaker…
  assert.deepEqual([jambe.bookmaker, jambe.bookmakerTitle, pari.bookmaker, pari.bookmakerTitle], ['williamhill', 'William Hill', 'williamhill', 'William Hill']);
  // … la probabilité du MOTEUR au moment du pari : celle de la cote juste (Pinnacle, marge retirée), exactement celle qu'il a jugée…
  assert.equal(jambe.probabiliteMoteur, a.verdicts.home.probabilite);
  assert.equal(jambe.probabiliteMoteur, a.comparateur.issues.find((i) => i.issue === 'home').probabilite);
  assert.match(jambe.probabiliteSource, /cote juste des bookmakers de référence \(Pinnacle/);
  assert.equal(jambe.probabiliteLueA, a.comparateur.calculeLe);
  // … et l'heure de la cote : celle du relevé archivé (11 h 50), de source The Odds API.
  assert.deepEqual([jambe.coteReleveeA, jambe.coteSource], ['2026-10-05T11:50:00.000Z', 'the-odds-api']);
  assert.equal(pari.nature, 'simple');
  assert.equal(pari.origine, 'page-du-match');
  // Le gain attendu, calculé à la lecture : 10 × (p × 2,30 − 1).
  assert.deepEqual(pari.gainAttendu, gainAttenduDuPari(pari));
  assert.ok(Math.abs(pari.gainAttendu.montant - 10 * (jambe.probabiliteMoteur * 2.3 - 1)) < 0.006);
  // Il n'est PAS écrit dans le carnet (une valeur calculée ne s'enregistre pas).
  const ecrit = P.pari.carnet.find((b) => b.id === pari.id);
  assert.equal('gainAttendu' in ecrit, false);
  // La même issue chez Unibet, cote tapée au moment du pari : l'heure du pari.
  const t = envoi('tapee').reponse;
  assert.deepEqual([t.odds, t.legs[0].bookmaker, t.legs[0].coteSource, t.legs[0].coteReleveeA], [2.25, 'unibet_nl', 'au-pari', '2026-10-05T12:00:00.000Z']);
  // Les corners saisis : la probabilité de la binomiale négative, l'heure de la saisie.
  const c = envoi('corners').reponse.legs[0];
  const saisie = P.pari.saisies.saisies.find((s) => s.cle === 'williamhill|corners|over|9.5');
  assert.deepEqual([c.market, c.pick, c.marketId, c.params], ['Total corners', 'Plus de 9.5 corners', 'totalCorners', { line: 9.5, side: 'over' }]);
  assert.deepEqual([c.probabiliteMoteur, c.coteSource, c.coteReleveeA], [saisie.moteur.probabilite, 'saisie', saisie.releveAt]);
  assert.match(c.probabiliteSource, /binomiale négative/);
});

test('le pari « J’ai parié » est dans Mes paris, avec les anciens paris, qui restent lus tels quels', options, () => {
  const liste = P.pari.liste.bets;
  const ids = liste.map((b) => b.id);
  for (const nom of ['domicile', 'tapee', 'corners', 'combine', 'ancien', 'deuxMatchs']) assert.ok(ids.includes(envoi(nom).reponse.id), `${nom} dans la liste`);
  // Les anciens : présents, inchangés champ par champ (seul le gain attendu s'ajoute à la lecture, « non noté »).
  for (const ancien of ANCIENS) {
    const lu = liste.find((b) => b.id === ancien.id);
    assert.ok(lu, ancien.id);
    const { gainAttendu, ...reste } = lu;
    assert.deepEqual(reste, ancien, `${ancien.id} : relu à l'identique`);
    assert.deepEqual(gainAttendu.raison, ancien.legs.length > 1 ? 'combine' : 'non-note');
    // Et sur le disque, après l'écriture des nouveaux paris : à l'identique.
    assert.deepEqual(P.pari.carnet.find((b) => b.id === ancien.id), ancien);
  }
  // Rangés du plus récent au plus ancien, comme avant.
  assert.deepEqual([...liste].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((b) => b.id), ids);
  // Le format d'avant (sans aucun champ de l'étape 10) : enregistré comme avant, plus sa nature.
  const ancien = envoi('ancien').reponse;
  assert.equal(envoi('ancien').code, 201);
  assert.deepEqual(Object.keys(ancien.legs[0]).sort(), ['awayName', 'commenceTime', 'homeName', 'league', 'market', 'marketId', 'matchId', 'odds', 'params', 'pick', 'status'].sort());
  assert.deepEqual([ancien.nature, ancien.bookmaker, ancien.gainAttendu.raison], ['simple', undefined, 'non-note']);
  // Deux matchs différents : la cote est le produit, comme avant.
  const deux = envoi('deuxMatchs').reponse;
  assert.deepEqual([deux.nature, deux.odds, deux.cotePrise], ['combine', Number((1.28 * 2.1).toFixed(4)), undefined]);
});

test('un combiné du même match : refusé sans la cote du bookmaker ; enregistré à SA cote (jamais le produit), sans gain attendu (étape 28)', options, () => {
  assert.equal(envoi('combineSansCote').code, 400);
  assert.match(envoi('combineSansCote').reponse.error, /combiné du même match se paie à la cote que donne le bookmaker/);
  const c = envoi('combine');
  assert.equal(c.code, 201);
  assert.deepEqual([c.reponse.nature, c.reponse.odds, c.reponse.cotePrise, c.reponse.produitDesCotes], ['combine-meme-match', 4.6, 4.6, Number((2.3 * 2.25).toFixed(4))]);
  assert.deepEqual(c.reponse.legs.map((l) => [l.pick, l.bookmaker, l.odds]), [['Man City gagne', 'williamhill', 2.3], ['Plus de 9.5 corners', 'williamhill', 2.25]]);
  assert.deepEqual(c.reponse.gainAttendu, { montant: null, pourcent: null, raison: 'combine' });
});

test('les refus du serveur : deux bookmakers sur un ticket, probabilité hors de 0 à 1 (ou en %), source de cote inconnue, bookmaker en clair, date illisible, origine inconnue, cote de combiné ≤ 1 — rien d’écrit', options, () => {
  const refus = {
    deuxBookmakers: /chez un seul bookmaker/,
    probabiliteHors: /strictement entre 0 et 1/,
    probabiliteEnPourcent: /strictement entre 0 et 1/,
    sourceInconnue: /« coteSource » vaut/,
    bookmakerEnClair: /la clé du bookmaker/,
    dateIllisible: /doit être une date/,
    origineInconnue: /« origine » vaut/,
    cotePriseBasse: /« cotePrise »/
  };
  for (const [nom, motif] of Object.entries(refus)) {
    assert.equal(envoi(nom).code, 400, nom);
    assert.match(envoi(nom).reponse.error, motif, nom);
  }
  // Rien d'écrit pour un refus : le carnet = les anciens + les envois acceptés.
  const acceptes = Object.values(P.pari.envois).filter((e) => e.code === 201).length;
  assert.equal(P.pari.carnet.length, ANCIENS.length + acceptes);
  assert.equal(acceptes, 6);
});

test('le lendemain : la valeur de clôture du pari « J’ai parié » se calcule (cote prise × probabilité de clôture − 1), avec son bookmaker et sa probabilité du moment', options, () => {
  const r = P.cloture.cloture;
  const id = envoi('domicile').reponse.id;
  const m = r.entries.find((x) => x.betId === id);
  assert.ok(m, 'le pari est mesuré');
  // La probabilité de clôture : DraftKings à 18 h 25 (1,95 / 3,70 / 4,10), marge retirée — recalculée ici à la main.
  assert.equal(m.oddsTaken, 2.3);
  assert.ok(m.closeProb > 0.49 && m.closeProb < 0.52, `clôture ${m.closeProb}`);
  assert.ok(Math.abs(m.valueAtClosePct - (2.3 * m.closeProb - 1) * 100) < 1e-9);
  assert.ok(m.valueAtClosePct > 0, 'la cote a baissé après le pari : le marché a donné raison');
  // Au moment du pari (12 h) : le relevé de 11 h, pas l'ouverture.
  assert.equal(m.approx, null);
  assert.ok(m.pickProb < m.closeProb);
  assert.deepEqual([m.bookmaker, m.bookmakerTitle], ['williamhill', 'William Hill']);
  assert.equal(m.probabiliteMoteur, envoi('domicile').reponse.legs[0].probabiliteMoteur);
  assert.equal(m.gainAttenduPct, envoi('domicile').reponse.gainAttendu.pourcent);
  // Les trois paris qui ont leur probabilité et une cote gratuite (simple WH, simple Unibet, combiné) en ont une ; pas les autres.
  assert.equal(r.avecProbabilite, 3);
  // Les corners n'ont pas de cote gratuite : comptés dans « ce qui manque », jamais ignorés.
  assert.ok(r.missing.some((x) => x.reason === 'marche' && x.count >= 2));
  // Les anciens paris : mesurés ou dans ce qui manque — jamais perdus.
  assert.equal(r.totalEntries, ANCIENS.reduce((s, b) => s + b.legs.length, 0) + Object.values(P.pari.envois).filter((e) => e.code === 201).reduce((s, e) => s + e.reponse.legs.length, 0));
  assert.equal(r.measured + r.missing.reduce((s, x) => s + x.count, 0), r.totalEntries);
  for (const x of r.entries.filter((e) => e.betId?.startsWith('ancien'))) assert.equal(x.bookmaker, null);
});

test('le règlement lit les paris « J’ai parié » comme les autres : chaque sélection a sa règle, la passe complète tourne sans rien écrire', options, () => {
  const issues = P.cloture.issues;
  const de = (nom) => issues.filter((i) => i.betId === envoi(nom).reponse.id).map((i) => i.issue);
  // Man City 2 – 1 Liverpool, 6 + 5 corners.
  assert.deepEqual(de('domicile'), ['won']);
  assert.deepEqual(de('tapee'), ['won']);
  assert.deepEqual(de('corners'), ['won']);
  assert.deepEqual(de('combine'), ['won', 'won']);
  assert.deepEqual(de('ancien'), ['won']);
  // La passe complète (à blanc) : toutes les sélections en attente vues, aucune écriture.
  const rb = P.cloture.reglement.bets;
  assert.equal(P.cloture.reglement.applied, false);
  const enAttente = P.cloture.carnet.reduce((s, b) => s + b.legs.filter((l) => (l.status ?? (b.legs.length === 1 ? b.status : 'pending')) === 'pending').length, 0);
  assert.equal(rb.pendingLegs, enAttente);
  assert.deepEqual(P.cloture.carnet, P.pari.carnet, 'le règlement à blanc n’a rien écrit');
});
