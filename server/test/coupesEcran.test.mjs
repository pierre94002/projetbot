/**
 * L'ENCADRÉ « COUPE » (étape 36, lot 1, 09/11/2026) — la lecture et l'écran, rendus côté serveur, sans navigateur ni serveur
 * de développement (aides/rendu.mjs : `fetch` remplacé, tout appel refusé et compté ; horloge figée) :
 *   node --test test/coupesEcran.test.mjs        (depuis server/)
 *
 * Les blocs ne sont pas écrits à la main : le VRAI serveur les produit dans une copie isolée — la nuit puis la lecture
 * (coupesRead.coupeDuMatch) de huit matchs sur le MAGASIN FABRIQUÉ (aides/script-coupes.mjs, phase « nuit » : aucun résultat
 * réel, des clubs « Club 01 » à « Club 30 », « Port » et « Portsmouth »). Les variantes (avance, format, lieu, états) partent
 * de ces vraies formes.
 *   T-E1  chaque phrase, exacte, dans tous ses cas (avance −2 à +2, match unique, finale, formats, lieux ; « un but d'écart ») ;
 *   T-E2  les pastilles : « Explication seulement » partout, JAMAIS de vert (ni « Méthode mesurée » sous la chance) ;
 *   T-E3  la provenance de chaque ligne ; l'ambre au-delà de 24 h ; votre décision, un jour sans heure ; rien lu au magasin →
 *         aucune provenance (jamais une date vide) ;
 *   T-E4  les états vides, dits en mots ; toujours les huit lignes ;
 *   T-E5  une seule place : la phrase « 90 minutes » de l'onglet Marchés = la même constante ; ni l'IA ni le moteur ne
 *         reçoivent le bloc (ajouté à la réponse APRÈS l'analyse) ; la distance du déplacement reste au « Contexte du match » ;
 *   T-E6  les tours traduits (fotmobLabels) ; la pastille de l'en-tête prend le libellé du serveur ; « final » entre guillemets
 *         tant que le serveur ne l'a pas confirmée ;
 *   T-E7  la nature vue par l'écran avec le tour de la page quand le serveur dit « inconnue » ; T-E7 bis : la phase de ligue de
 *         septembre, avec des qualifications « 1 » en juillet → « groupe » (l'historique par famille) ;
 *   T-E8  aucune requête de plus : la carte et ses règles n'importent aucun service ; le rendu ne fait aucun appel ;
 *   T-E9  les clubs par identifiant FotMob : sans identifiant → « club non reconnu » ; « Portsmouth » n'emprunte rien à
 *         « Port » ; le logo sur chaque ligne qui nomme un club ; la lecture en quelques millisecondes ;
 *   T-E10 le tableau du banc : cinq lignes, Σ des confrontations, ⌀ de l'écart, « non mesuré » / « non mesurable » ;
 *         la ligne grise de la calibration avec le mot fixé d'avance ;
 *   T-E11 le repli (lot 2, 13/11/2026) : avant la première nuit, le tour de la page en numéro nu (« 1 », « 3 ») se dit comme
 *         le serveur (« 1er tour », « 3e tour » ; comparé au serveur de 1 à 12) ; un intitulé non numérique reste tel quel ;
 *         les journées de championnat ne changent pas (`tour('35', 'Ligue 1')` reste « 35 »).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { UI, imp, optionsDuRendu, ouvrirLeRendu, reglesPures, espaces, tableauDe, corps, pied } from './aides/rendu.mjs';
import * as R from '../src/data/coupes/coupesRead.js';
import { tourNormalise, libelleDuTour } from '../src/data/coupes/toursDeCoupe.js';

const U = await imp(path.join(UI, 'src', 'utils', 'coupeDuMatch.js'));
const L = await imp(path.join(UI, 'src', 'utils', 'fotmobLabels.js'));
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8');
const lireSrc = (...p) => fs.readFileSync(path.join(SERVEUR, 'src', ...p), 'utf8');
const copie = (x) => JSON.parse(JSON.stringify(x));
/** Les classes vertes de l'appli (ce qui ferait passer une ligne pour « mesurée »). */
const CLASSE_VERTE = /class="[^"]*\b(is-mesure|is-compte|cm-positive|is-positive|is-value)\b/;
const LECTURES = ['retour', 'retourArchive', 'unique', 'groupe', 'aller', 'sansIdentifiant', 'portsmouth'];

/** Les vrais blocs du serveur, sur le magasin fabriqué (une copie isolée, base neuve, une nuit). */
function lancer() {
  const c = preparerCopie({ base: false });
  try {
    const r = executer(c, path.join(SERVEUR, 'test', 'aides', 'script-coupes.mjs'), { args: ['nuit', '{}'], timeout: 300_000 });
    assert.equal(r.code, 0, `script-coupes nuit :\n${r.erreurs.slice(-3000)}`);
    assert.equal(r.reseau, false, 'un appel réseau a été tenté');
    return r.json;
  } finally {
    c.nettoyer();
  }
}
let memo = null;
const serveur = () => (memo ??= lancer());
const bloc = (k) => copie(serveur().lectures[k].r);
const ligne = (d, cle) => d.lignes.find((l) => l.cle === cle);
const dit = (b, extra = {}) => U.lignesDeLaCoupe({ coupe: b, ...extra });
const phrases = (d, cle) => ligne(d, cle).phrases.map(espaces);

test('T-E1 — chaque phrase, exacte : l’aller et le cumul (avance −2 à +2), le match unique, la finale, les formats, les lieux', () => {
  const retour = bloc('retour');
  const d = dit(retour);
  assert.equal(d.titre, 'UEFA Europa League — Quarts de finale, match retour');
  assert.deepEqual(phrases(d, 'tour'), ['Tour : Quarts de finale (match retour).']);
  assert.deepEqual(ligne(d, 'tour').mentions, ['tour déduit du match aller']);
  assert.deepEqual(phrases(d, 'aller'), [
    'Aller le 9 avril : Club 17 2-0 Club 21. Cumul avant le retour : Club 21 0 – 2 Club 17.',
    'Club 21 doit gagner par 3 buts d’écart pour se qualifier dans les 90 minutes ; par 2 buts d’écart, la prolongation ou directement les tirs au but (règle incertaine).'
  ]);
  assert.deepEqual(phrases(d, 'chance'), ['Chance de se qualifier : Club 21 16 %, Club 17 84 %.', 'Dans les 90 minutes : Club 21 9 %, Club 17 77 %. Égalité après 90 minutes : 14 %.', 'En cas d’égalité : pile ou face (prolongation et tirs au but).']);
  assert.deepEqual(ligne(d, 'chance').barres, { dom: 16, ext: 84 });
  // L'avance de −2 à +2, avec chaque règle d'après 90 minutes (« un but d'écart » au singulier).
  const avec = (avance, format) => {
    const b = copie(retour);
    b.aller.avance = avance;
    b.aller.score = { home: avance < 0 ? -avance : 0, away: avance > 0 ? avance : 0 };
    b.format = { ...b.format, valeur: format, prolongations: format === 'prolongation' ? 9 : 0, directs: format === 'direct' ? 9 : 0, source: 'saison', saison: 2025 };
    return phrases(dit(b), 'aller');
  };
  assert.deepEqual(avec(-2, 'prolongation'), ['Aller le 9 avril : Club 17 2-0 Club 21. Cumul avant le retour : Club 21 0 – 2 Club 17.', 'Club 21 doit gagner par 3 buts d’écart pour se qualifier dans les 90 minutes ; par 2 buts d’écart, la prolongation (2 × 15 minutes) puis les tirs au but.']);
  assert.equal(avec(-1, 'prolongation')[1], 'Club 21 doit gagner par 2 buts d’écart pour se qualifier dans les 90 minutes ; par un but d’écart, la prolongation (2 × 15 minutes) puis les tirs au but.');
  assert.deepEqual(avec(0, 'direct'), ['Aller le 9 avril : Club 17 0-0 Club 21. Cumul avant le retour : Club 21 0 – 0 Club 17.', 'Cumul à égalité : le vainqueur du retour se qualifie ; un nul mène à la séance de tirs au but.']);
  assert.deepEqual(avec(1, 'prolongation'), ['Aller le 9 avril : Club 17 0-1 Club 21. Cumul avant le retour : Club 21 1 – 0 Club 17.', 'Club 21 se qualifie s’il ne perd pas par un but d’écart ou plus ; une défaite par un but d’écart mène à la prolongation (2 × 15 minutes) puis les tirs au but.']);
  assert.equal(avec(2, 'direct')[1], 'Club 21 se qualifie s’il ne perd pas par 2 buts d’écart ou plus ; une défaite par 2 buts d’écart mène à la séance de tirs au but.');
  const sansScore = copie(retour);
  sansScore.aller.avance = null;
  assert.equal(phrases(dit(sansScore), 'aller')[1], 'Le score de l’aller n’est pas connu : chance de qualification non calculée.');
  // Le match unique (un tour lu sur la page), la finale.
  const unique = dit(bloc('unique'));
  assert.equal(unique.titre, 'Coupe de France — Demi-finales, match unique');
  // La compétition par le nom que l'appli lui donne (DESIGN.md ; critique, constat 7), jamais le libellé brut de FotMob.
  const fa = dit({ ...bloc('unique'), league: 'FA Cup - England' });
  assert.equal(fa.titre, 'FA Cup — Demi-finales, match unique');
  assert.equal(phrases(fa, 'apres90')[0], 'Règle d’après 90 minutes incertaine pour FA Cup 2025-26 : jamais observée.');
  // Le logo des clubs sur chaque ligne qui les nomme (l'aller, la chance, le lieu), par leur identifiant FotMob.
  assert.deepEqual(ligne(d, 'aller').clubs.map((c) => c.teamId), ['fotmob-9017', 'fotmob-9021']);
  assert.deepEqual(ligne(d, 'chance').clubs.map((c) => c.teamId), ['fotmob-9021', 'fotmob-9017']);
  assert.deepEqual(ligne(unique, 'lieu').clubs.map((c) => c.teamId), ['fotmob-9016']);
  assert.deepEqual(ligne(unique, 'tour').mentions.map(espaces), ['intitulé FotMob : « 1/2 »']);
  assert.deepEqual(phrases(unique, 'aller'), ['Match unique : le vainqueur se qualifie ; en cas d’égalité, la prolongation ou directement les tirs au but (règle incertaine).']);
  assert.deepEqual(phrases(unique, 'chance'), ['Chance de se qualifier : Club 16 61 %, Club 15 39 %.', 'Dans les 90 minutes : Club 16 47 %, Club 15 26 %. Égalité après 90 minutes : 27 %.', 'En cas d’égalité : pile ou face (prolongation et tirs au but).']);
  assert.deepEqual(ligne(unique, 'chance').mentions, ['Part du 1N2 de cette page sur 90 minutes, puis du cumul et de la règle de la compétition.']);
  assert.deepEqual(ligne(unique, 'chance').barres, { dom: 61, ext: 39 });
  assert.equal(phrases(unique, 'avance')[0], 'Avance au cumul : sans objet (pas de match aller avant celui-ci).');
  const finale = copie(bloc('unique'));
  finale.nature = { valeur: 'finale', certitude: 'probable', source: 'nuit:tour-de-la-page' };
  finale.tour = { ...finale.tour, code: 'final', libelle: 'Finale', brut: 'final' };
  assert.equal(dit(finale).titre, 'Coupe de France — Finale');
  assert.deepEqual(phrases(dit(finale), 'tour'), ['Tour : Finale (match unique).']);
  assert.deepEqual(phrases(dit(finale), 'aller'), phrases(unique, 'aller'));
  // La règle d'après 90 minutes : connue, mixte, jamais vue (avec la saison, civile ou à cheval).
  assert.equal(U.phraseApres90({ valeur: 'prolongation' }), 'Après 90 minutes : prolongation (2 × 15 minutes) puis tirs au but.');
  assert.equal(U.phraseApres90({ valeur: 'direct' }), 'Après 90 minutes : tirs au but directs, sans prolongation.');
  assert.equal(U.phraseApres90({ valeur: 'mixte', prolongations: 1, directs: 10 }, 'Copa Libertadores', '2026'), 'Règle d’après 90 minutes incertaine pour Copa Libertadores 2026 : observée 1 fois avec prolongation et 10 fois sans.');
  assert.equal(phrases(unique, 'apres90')[0], 'Règle d’après 90 minutes incertaine pour Coupe de France 2025-26 : jamais observée.');
  assert.equal(phrases(dit(bloc('groupe')), 'apres90')[0], 'Règle d’après 90 minutes incertaine pour Copa Libertadores 2026 : jamais observée.', 'une coupe à saison civile');
  const vue = copie(bloc('unique'));
  vue.format = { valeur: 'direct', source: 'saison-precedente', saison: 2024, prolongations: 0, directs: 31, nature: 'match-unique' };
  assert.equal(phrases(dit(vue), 'apres90')[0], 'Après 90 minutes : tirs au but directs, sans prolongation.');
  assert.deepEqual(ligne(dit(vue), 'apres90').mentions, ['observée sur 31 matchs de Coupe de France la saison d’avant']);
  assert.equal(phrases(dit(vue), 'aller')[0], 'Match unique : le vainqueur se qualifie ; en cas d’égalité, la séance de tirs au but.');
  // Les lieux (la distance n'est dite que pour un terrain neutre : le déplacement reste au « Contexte du match »).
  const lieu = (l) => {
    const b = copie(bloc('unique'));
    b.lieu = { ...b.lieu, ...l };
    return phrases(dit(b), 'lieu')[0];
  };
  assert.equal(lieu({ valeur: 'neutre', stade: 'Stade de France', ville: 'Saint-Denis', distances: { dom: 12, ext: 1480 } }), 'Terrain neutre : Stade de France (Saint-Denis), stade d’aucun des deux clubs — à 12 km de chez Club 16, 1 480 km de chez Club 15. L’avantage du terrain ne joue pas : une explication, pas dans les pourcentages.');
  assert.equal(lieu({ valeur: 'chez-le-visiteur', stade: 'Stade Club 15' }), 'Au Stade Club 15, stade habituel de Club 15 : pas un terrain neutre, Club 15 joue chez lui.');
  assert.equal(phrases(unique, 'lieu')[0], 'Au Stade Club 16, stade habituel de Club 16.');
  assert.equal(phrases(dit(bloc('retourArchive')), 'lieu')[0], 'Au Stade Club 22, stade habituel de Club 22.');
  assert.equal(phrases(d, 'lieu')[0], 'Lieu pas encore publié par FotMob.');
  // Les tirs au but (la phrase corrigée : aucune part « favorite » calculée), l'avance, les 90 minutes.
  assert.equal(phrases(d, 'tirsAuBut')[0], 'Tirs au but : pile ou face (50/50). Sur les quelque 700 séances connues, un petit avantage de la favorite (55 sur 100, par exemple) ne se verrait qu’une fois sur deux : le banc d’essai ne le compte pas.');
  assert.equal(phrases(d, 'avance')[0], 'Effet de l’avance au cumul sur les buts du retour : non mesuré au banc d’essai (trop peu de matchs retour, et le score de l’aller dit aussi la force des équipes).');
  assert.equal(ligne(d, '90minutes').phrases[0], U.PHRASE_90_MINUTES);
  assert.equal(U.PHRASE_90_MINUTES, 'Les pronostics de cette page comptent les 90 minutes et le temps additionnel : ni la prolongation, ni les tirs au but.');
});

test('T-E2 — les pastilles : « Explication seulement » partout ; jamais de vert, ni « Méthode mesurée » sous la chance', async (t) => {
  for (const k of LECTURES) {
    const d = dit(bloc(k));
    assert.equal(d.lignes.length, 8, k);
    for (const l of d.lignes) {
      assert.equal(l.pastille.cle, 'explication', `${k} ${l.cle}`);
      assert.equal(l.pastille.libelle, 'Explication seulement');
      assert.equal(l.pastille.vert, false);
    }
    assert.doesNotMatch(JSON.stringify(d.lignes.map((l) => [l.pastille, l.mentions])), /Méthode mesurée|Effet mesuré/);
  }
  if (optionsDuRendu.skip) return t.skip(optionsDuRendu.skip);
  const rendu = await ouvrirLeRendu({ cibles: /CoupeDuMatchCard/ });
  try {
    const Carte = (await rendu.charger('/src/components/analysis/CoupeDuMatchCard.vue')).default;
    for (const k of ['retour', 'unique', 'groupe', 'sansIdentifiant']) {
      const b = bloc(k);
      const r = await rendu.rendre(Carte, { coupe: b, page: null, analyse: { loading: false }, match: { league: b.league } });
      assert.doesNotMatch(r.html, CLASSE_VERTE, `${k} : une classe verte dans la carte`);
      assert.doesNotMatch(r.texte, /Méthode mesurée|Effet mesuré/, `${k} : un mot des étapes mesurées`);
      assert.equal((r.html.match(/data-pastille="explication"/g) ?? []).length, 8, k);
      assert.equal((r.texte.match(/Explication seulement/g) ?? []).length, 8, k);
      assert.deepEqual(r.appels, [], `${k} : aucune requête`);
    }
    // Pas de bloc (un serveur d'avant l'étape 36) ou pas une coupe : rien du tout.
    for (const coupe of [null, undefined]) {
      const r = await rendu.rendre(Carte, { coupe, page: null, analyse: { loading: false }, match: null });
      assert.doesNotMatch(r.html, /data-bloc="coupe"/);
    }
  } finally {
    await rendu.fermer();
  }
});

test('T-E3 — la provenance de chaque ligne ; l’ambre au-delà de 24 h ; votre décision, un jour sans heure', async (t) => {
  const d = dit(bloc('unique'));
  const vu = (l) => l.provenances.map((p) => [p.source, p.action, p.releveLe, p.vieux ?? null]);
  assert.deepEqual(vu(ligne(d, 'tour')), [['FotMob, page du match', 'relevé', '2026-04-11T10:00:00.000Z', null]]);
  assert.deepEqual(vu(ligne(d, 'aller')), [['magasin FotMob (feuilles des matchs déjà joués)', 'rangé', '2026-04-12T00:40:00.000Z', 24]]);
  assert.deepEqual(vu(ligne(d, 'chance')), [['Calcul CôteMaster, à blanc : le 1N2 de cette page', 'calculé', '2026-04-12T01:40:00.000Z', null]]);
  assert.deepEqual(vu(ligne(d, 'apres90')), [['magasin FotMob (feuilles des matchs déjà joués)', 'rangé', '2026-04-12T00:40:00.000Z', 24]]);
  assert.deepEqual(ligne(d, 'tirsAuBut').provenances, [{ source: 'votre décision du 02/11/2026', action: 'décidé', releveLe: null, jourSeul: '02/11/2026' }]);
  assert.deepEqual(vu(ligne(d, 'lieu')), [['FotMob, page du match', 'relevé', '2026-04-11T10:00:00.000Z', null], ['magasin FotMob (stades des 365 derniers jours)', 'rangé', '2026-04-12T00:40:00.000Z', 24]]);
  assert.deepEqual(ligne(d, 'avance').provenances, []);
  assert.deepEqual(ligne(d, '90minutes').provenances, []);
  // Le tour déduit de l'aller vient du magasin ; le lieu lu dans une archive d'avant-match le dit ; l'aller à venir, le calendrier.
  assert.deepEqual(vu(ligne(dit(bloc('retour')), 'tour')), [['magasin FotMob (feuilles des matchs déjà joués)', 'rangé', '2026-04-12T00:40:00.000Z', 24]]);
  assert.deepEqual(vu(ligne(dit(bloc('retourArchive')), 'lieu'))[0], ['archive d’avant-match (page FotMob relevée avant le coup d’envoi)', 'relevé', '2026-04-11T09:00:00.000Z', null]);
  assert.deepEqual(vu(ligne(dit(bloc('aller')), 'aller')), [['calendrier de saison (FotMob)', 'lu', '2026-04-12T00:40:00.000Z', 24]]);
  // Rien lu au magasin (le club sans identifiant, la nuit jamais passée) : aucune provenance, jamais une date vide.
  for (const b of [bloc('sansIdentifiant'), { ...bloc('retour'), etat: 'pas-encore-calcule', calculeLe: null }]) {
    for (const l of dit(b).lignes) for (const p of l.provenances) assert.ok(p.releveLe || p.jourSeul, `${b.etat} ${l.cle} : ${JSON.stringify(p)}`);
  }
  if (optionsDuRendu.skip) return t.skip(optionsDuRendu.skip);
  // L'ambre : au-delà de 24 h, chaque relevé est « ancien » ; neuf avant.
  const rendu = await ouvrirLeRendu({ cibles: /CoupeDuMatchCard/, heure: '2026-04-12T08:00:00.000Z' });
  try {
    const Carte = (await rendu.charger('/src/components/analysis/CoupeDuMatchCard.vue')).default;
    const props = { coupe: bloc('unique'), page: null, analyse: { loading: false }, match: { league: 'Coupe de France' } };
    const neuf = await rendu.rendre(Carte, props);
    assert.equal((neuf.html.match(/class="prov is-recent/g) ?? []).length, 6, 'six relevés datés, tous de moins de 24 h');
    assert.equal((neuf.html.match(/class="prov is-ancien/g) ?? []).length, 0);
    assert.match(espaces(neuf.texte), /votre décision du 02\/11\/2026\s*décidé le 02\/11\/2026/);
    rendu.horloge.liveNow.value = Date.parse('2026-04-13T08:00:00.000Z');
    const vieux = await rendu.rendre(Carte, props);
    assert.equal((vieux.html.match(/class="prov is-ancien/g) ?? []).length, 6, 'un jour plus tard : les six en ambre');
  } finally {
    await rendu.fermer();
  }
});

test('T-E4 — les états vides, dits en mots ; toujours les huit lignes', () => {
  const huit = ['tour', 'aller', 'chance', 'apres90', 'tirsAuBut', 'lieu', 'avance', '90minutes'];
  for (const [e, texte] of [
    ['pas-encore-calcule', 'Pas encore calculé : la prochaine passe de nuit rangera les tours et les matchs aller.'],
    ['sans-buts-attendus', 'Chance non calculée : le moteur n’a pas de buts attendus pour ce match.'],
    ['illisible', 'Coupe illisible : la base n’a pas répondu. Les autres cartes ne sont pas touchées.']
  ]) {
    const d = dit({ ...bloc('retour'), etat: e, chance: null });
    assert.equal(d.etat.texte, texte);
    assert.deepEqual(d.lignes.map((l) => l.cle), huit, e);
  }
  // Le bloc d'une lecture ratée (analysis.controller.js : { version, etat: 'illisible', raison }) : les huit lignes aussi.
  const rate = dit({ version: 1, etat: 'illisible', raison: 'lecture-ratee' });
  assert.equal(rate.titre, 'Coupe');
  assert.equal(rate.etat.cle, 'illisible');
  assert.deepEqual(rate.lignes.map((l) => l.cle), huit);
  assert.equal(phrases(rate, 'chance')[0], 'Chance de qualification : —');
  assert.equal(phrases(dit({ ...bloc('retour'), etat: 'sans-buts-attendus', chance: null }), 'chance')[0], 'Chance non calculée : le moteur n’a pas de buts attendus pour ce match.');
  for (const k of LECTURES) assert.deepEqual(dit(bloc(k)).lignes.map((l) => l.cle), huit, k);
  assert.equal(phrases(dit(bloc('groupe')), 'aller')[0], 'Phase de groupes ou de ligue : personne n’est éliminé à l’issue de ce match.');
  assert.equal(phrases(dit(bloc('groupe')), 'chance')[0], 'Chance de qualification : sans objet en phase de groupes.');
  assert.equal(phrases(dit(bloc('groupe')), 'tour')[0], 'Tour : tour pas encore publié par FotMob.');
  assert.equal(phrases(dit(bloc('aller')), 'aller')[0], 'Match aller d’une double confrontation : le retour se joue le 30 avril chez Club 19. La chance de qualification sera calculée avant le retour, avec le score de l’aller.');
  assert.equal(phrases(dit(bloc('aller')), 'chance')[0], 'Chance de qualification : calculée avant le retour, avec le score de l’aller.');
  assert.equal(phrases(dit(bloc('portsmouth')), 'aller')[0], 'Tour pas encore connu (FotMob ne l’a pas publié) : chance de qualification non montrée.');
  assert.equal(phrases(dit(bloc('portsmouth')), 'chance')[0], 'Chance de qualification non montrée : la nature du match n’est pas connue.');
  assert.deepEqual(dit(null), { montre: false }, 'pas un match de coupe : rien');
  assert.deepEqual(dit(undefined), { montre: false }, 'un serveur d’avant l’étape 36 : rien');
  assert.equal(dit(undefined, { analyse: { loading: true } }).etat.cle, 'chargement');
});

test('T-E5 — une seule place : la phrase « 90 minutes » de l’onglet Marchés = la même constante ; ni l’IA ni le moteur ne reçoivent le bloc', () => {
  const vue = lireUi('views', 'UpcomingMatchView.vue');
  assert.match(vue, /import \{ PHRASE_90_MINUTES, montrerLaPhrase90, libelleDuTourPourLEnTete \} from '@\/utils\/coupeDuMatch\.js';/);
  assert.match(vue, /data-phrase="90-minutes">\{\{ PHRASE_90_MINUTES \}\}<\/p>/);
  assert.doesNotMatch(vue, /ni la prolongation, ni les tirs au but/, 'la phrase n’est jamais recopiée');
  assert.equal((vue.match(/<CoupeDuMatchCard /g) ?? []).length, 1);
  assert.ok(vue.indexOf('<EnjeuDuMatch') < vue.indexOf('<CoupeDuMatchCard') && vue.indexOf('<CoupeDuMatchCard') < vue.indexOf('<MatchContextCard'), 'entre « Enjeu » et « Contexte du match »');
  assert.equal(U.montrerLaPhrase90(bloc('retour')), true);
  assert.equal(U.montrerLaPhrase90(bloc('unique')), true);
  assert.equal(U.montrerLaPhrase90(bloc('portsmouth')), true, 'nature inconnue : peut-être une prolongation');
  assert.equal(U.montrerLaPhrase90(bloc('aller')), false);
  assert.equal(U.montrerLaPhrase90(bloc('groupe')), false);
  assert.equal(U.montrerLaPhrase90(null), false);
  // Ni l'IA ni le moteur : aucun de leurs fichiers ne lit le bloc ; la réponse le reçoit APRÈS l'analyse.
  for (const f of ['core/ai/compactContext.js', 'core/ai/matchAiAnalysisService.js', 'core/ai/autoMatchAiTrigger.js', 'core/ai/matchAiAnalysisPrompt.js', 'core/engine/oddsEngine.js']) {
    assert.doesNotMatch(lireSrc(...f.split('/')), /coupesRead|data\/coupes|coupeDuMatch|\.coupe\b|\bcoupe:/, `${f} : ne lit jamais le bloc`);
  }
  const ctrl = lireSrc('api', 'controllers', 'analysis.controller.js');
  const iAnalyse = ctrl.indexOf('const analyse = await analyzeMatch(');
  const iCoupe = ctrl.indexOf("const coupe = sportId === 'football' ? await coupeDuMatchAnalyse(avecFraicheur, analyse, getEngineConfig(sportId)) : null;");
  assert.ok(iAnalyse > 0 && iCoupe > iAnalyse && ctrl.indexOf('...(coupe ? { coupe } : {})') > iCoupe, 'le bloc ajouté à la réponse après l’analyse');
  // La distance du déplacement reste au « Contexte du match » : jamais de kilomètres hors d'un terrain neutre.
  for (const valeur of ['domicile', 'chez-le-visiteur', 'inconnu']) {
    const b = { ...bloc('unique'), lieu: { valeur, stade: 'Stade Club 16', distances: { dom: 0, ext: 480 } } };
    assert.doesNotMatch(JSON.stringify(dit(b).lignes), /\bkm\b/, valeur);
  }
});

test('T-E6 — les tours traduits ; la pastille de l’en-tête prend le libellé du serveur ; « final » entre guillemets sans confirmation', () => {
  assert.equal(L.tour('Quarter-finals', 'UEFA Europa League'), 'Quarts de finale');
  assert.equal(L.tour('8th Finals', 'Copa Libertadores'), 'Huitièmes de finale');
  assert.equal(L.tour('1/8', 'Coupe de France'), 'Huitièmes de finale');
  assert.equal(L.tour('Round of 16', 'UEFA Champions League'), 'Huitièmes de finale');
  assert.equal(L.tour('Play-offs', 'UEFA Conference League'), 'Barrages');
  assert.equal(L.tour('Third place play-off', 'Copa America'), 'Match pour la 3e place');
  assert.equal(L.tour('4th Round', 'FA Cup - England'), '4e tour');
  assert.equal(L.tour('Semi-finals', 'Türkiye Kupası'), 'Demi-finales', 'une coupe que l’ancienne expression ne reconnaissait pas');
  assert.equal(espaces(L.tour('final', 'UEFA Champions League')), '« final »', 'FotMob appelle aussi « final » le dernier tour de qualification d’août');
  assert.equal(L.tour('final', 'UEFA Champions League', { finaleConfirmee: true }), 'Finale');
  assert.equal(L.tour('Round 4', 'Ligue 1 - France'), 'Journée 4', 'les journées de championnat inchangées');
  assert.equal(L.tour('Round 4', 'Coupe de France'), '4e tour');
  assert.equal(L.tour('Coupe des Clubs', 'X'), 'Coupe des Clubs', 'un intitulé inconnu reste tel quel');
  assert.equal(U.libelleDuTourPourLEnTete(bloc('retour')), 'Quarts de finale');
  assert.equal(U.libelleDuTourPourLEnTete({ tour: { code: 'final', libelle: 'Dernier tour de qualification' } }), 'Dernier tour de qualification');
  assert.equal(U.libelleDuTourPourLEnTete(bloc('groupe')), null);
  assert.equal(U.libelleDuTourPourLEnTete(undefined), null);
  const vue = lireUi('views', 'UpcomingMatchView.vue');
  assert.match(vue, /const duServeur = libelleDuTourPourLEnTete\(analyse\.value\.result\?\.coupe\);\n {2}if \(duServeur\) return duServeur;/);
});

test('T-E7 — la nature vue par l’écran avec le tour de la page ; T-E7 bis : la phase de ligue de septembre (« 1 ») n’est pas la qualification « 1 » de juillet', () => {
  const b = { ...bloc('groupe'), nature: { valeur: 'inconnue' }, historique: { '1/2': 'match-unique', 'tour-1': 'groupe' }, chanceSiMatchUnique: bloc('unique').chance };
  assert.equal(U.natureVue(b, '1/2').valeur, 'match-unique');
  assert.equal(U.natureVue(b, 'Semi-finals').valeur, 'match-unique');
  assert.equal(U.natureVue(b, '1').valeur, 'groupe');
  assert.equal(U.natureVue(b, '1/4').valeur, 'inconnue');
  assert.equal(U.natureVue(b, null).valeur, 'inconnue');
  const d = dit(b, { page: { data: { meta: { round: '1/2' } } } });
  assert.equal(d.nature.source, 'tour-de-la-page');
  assert.equal(phrases(d, 'chance')[0], 'Chance de se qualifier : Club 27 61 %, Port 39 %.', 'la chance du match unique quand la page résout la nature');
  assert.equal(ligne(dit(b), 'chance').barres, null, 'sans la page : pas de chance');
  // L'historique du serveur, par famille de phase (critique, constat 5) — la règle elle-même.
  const h = R.historiqueDesTours([
    { tour: 'tour-1', nature_du_bloc: 'aller-retour', famille: 'qualification', saison: 2026, date: '2026-07-15' },
    { tour: 'tour-1', nature_du_bloc: 'aller-retour', famille: 'qualification', saison: 2026, date: '2026-07-22' },
    { tour: 'tour-1', nature_du_bloc: 'groupe', famille: 'autre', saison: 2025, date: '2025-09-17' },
    { tour: 'tour-1', nature_du_bloc: 'ambigu', famille: 'autre', saison: 2026, date: '2026-09-16' }
  ]);
  assert.deepEqual(h['tour-1'].map((x) => [x.famille, x.nature, x.saison]).sort(), [['autre', 'groupe', 2025], ['qualification', 'aller', 2026]]);
  assert.equal(R.natureParLHistorique(h, 'tour-1', { famille: 'autre' }), 'groupe');
  assert.equal(R.natureParLHistorique(h, 'tour-1', { famille: 'qualification' }), 'aller');
  assert.equal(R.natureParLHistorique(h, 'tour-1', { mois: '09' }), 'groupe', 'à défaut de famille, le même mois');
  assert.equal(R.natureParLHistorique(h, 'tour-1', { mois: '07' }), 'aller');
  assert.equal(R.natureParLHistorique(h, 'tour-1'), null, 'deux familles en désaccord : rien deviné');
});

test('T-E8 — aucune requête de plus : la carte et ses règles n’importent aucun service', () => {
  assert.deepEqual([...reglesPures('coupeDuMatch.js')].sort(), ['coupeDuMatch.js', 'fotmobLabels.js', 'leagueDisplay.js']);
  const carte = lireUi('components', 'analysis', 'CoupeDuMatchCard.vue');
  assert.doesNotMatch(carte, /services\/|fetch\(|Api\.|axios|onMounted|stores\//);
  assert.deepEqual([...carte.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]), ['vue', '@/components/common/AppCard.vue', '@/components/common/AppIcon.vue', '@/components/common/HelpTip.vue', '@/components/common/LoadingSpinner.vue', '@/components/common/ProvenanceChip.vue', '@/components/matches/TeamCrest.vue', '@/utils/coupeDuMatch.js']);
});

test('T-E9 — les clubs par identifiant FotMob : sans identifiant → « club non reconnu » ; « Portsmouth » n’emprunte rien à « Port »', (t) => {
  const s = bloc('sansIdentifiant');
  assert.deepEqual([s.etat, s.raison], ['clubs-inconnus', 'sans-identifiant']);
  assert.equal(s.aller ?? null, null);
  assert.equal(s.chance ?? null, null);
  assert.equal(dit(s).etat.texte, 'Coupe : Club sans identifiant n’est pas reconnu par son identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent) — ni aller, ni chance de qualification.');
  const p = bloc('portsmouth');
  assert.deepEqual(p.clubs.home, { id: 9032, nom: 'Portsmouth' });
  assert.equal(p.aller ?? null, null);
  assert.equal(p.nature.valeur, 'inconnue');
  assert.equal(serveur().lectures.championnat.r, null, 'pas une coupe : aucun bloc');
  // Les logos : chaque ligne qui nomme un club porte son identifiant FotMob.
  const d = dit(bloc('retour'));
  assert.deepEqual(ligne(d, 'aller').clubs, [{ nom: 'Club 17', teamId: 'fotmob-9017' }, { nom: 'Club 21', teamId: 'fotmob-9021' }]);
  assert.deepEqual(ligne(d, 'chance').clubs, [{ nom: 'Club 21', teamId: 'fotmob-9021' }, { nom: 'Club 17', teamId: 'fotmob-9017' }]);
  for (const k of LECTURES) {
    for (const l of dit(bloc(k)).lignes) {
      for (const c of l.clubs) assert.ok(l.phrases.some((x) => x.includes(c.nom)), `${k} ${l.cle} : logo de ${c.nom} sans son nom`);
      for (const nom of ['Club 15', 'Club 16', 'Club 17', 'Club 19', 'Club 21', 'Club 22']) if (l.phrases.some((x) => x.includes(nom))) assert.ok(l.clubs.some((c) => c.nom === nom), `${k} ${l.cle} : ${nom} nommé sans son logo`);
    }
  }
  // La lecture en quelques millisecondes (un minutage sous la charge se relance une fois, et le dit).
  const lent = (j) => LECTURES.filter((k) => !(j.lectures[k].ms < 50));
  let trop = lent(serveur());
  if (trop.length) {
    t.diagnostic(`minutage relancé (sous la charge ?) : ${trop.map((k) => `${k} ${Math.round(serveur().lectures[k].ms)} ms`).join(', ')}`);
    trop = lent(lancer());
  }
  assert.deepEqual(trop, [], 'chaque lecture en moins de 50 ms');
});

test('T-E10 — le tableau du banc : cinq lignes, Σ, ⌀, « non mesuré » ; la ligne grise de la calibration avec le mot', async (t) => {
  const vide = U.tableauDuBanc(R.bancPourLEcran(null));
  assert.deepEqual(vide.lignes.map((l) => l.cle), ['chance', 'prolongation', 'tirsAuBut', 'terrainNeutre', 'avanceAuCumul']);
  assert.equal(vide.lignes[0].mot, 'pas encore vérifiée');
  assert.deepEqual([vide.somme, vide.moyenne], ['—', '—']);
  assert.equal(U.ligneDeLaCalibration(R.bancPourLEcran(null)), 'Formule pas encore vérifiée sur les matchs passés. La chance de cette page part de son 1N2 : elle sera vérifiée sur vos matchs à partir de 2027.');
  // Une note de la forme que recopie le script (calibrationDesCoupes.aRecopier) : des chiffres d'essai, pas un résultat.
  const note = { format: 1, calculeLe: '2026-11-09', calibration: { toutes: { n: 5120, annonce: 0.684, realise: 0.669, mot: 'trop sûre d’elle', beta: 0.82, betaIc: [0.78, 0.86], ecartMoyen: 0.021 }, retours: { n: 900, annonce: 0.7, realise: 0.69 } }, lignes: {} };
  const banc = R.bancPourLEcran(note);
  assert.equal(banc.mesure, true);
  const plein = U.tableauDuBanc(banc);
  assert.equal(espaces(plein.somme), '5 120');
  assert.equal(espaces(plein.lignes[0].annonceRealise), '68,4 % face à 66,9 %');
  assert.equal(plein.lignes[0].mot, 'trop sûre d’elle');
  assert.equal(plein.moyenne, '2,1 points d’écart moyen par dixième');
  for (const l of plein.lignes.slice(1)) {
    assert.match(l.mot, /non mesur/);
    assert.deepEqual([l.matchs, l.annonceRealise], ['—', '—'], 'jamais un chiffre pour ce qui n’est pas mesuré');
  }
  assert.match(plein.pied, /^Calibration : magasin de juillet 2023 à septembre 2026, deux moitiés croisées, un seul regard \(calcul du 9 novembre 2026\)\./);
  assert.equal(espaces(U.ligneDeLaCalibration(banc)), 'Formule vérifiée sur les matchs 2023-2026 avec les statistiques seules : annoncé 68,4 %, réalisé 66,9 % (trop sûre d’elle). La chance de cette page part de son 1N2 : elle sera vérifiée sur vos matchs à partir de 2027.');
  // La VRAIE note (recopiée par script après le passage unique) : la ligne grise dit son mot fixé d'avance, jamais un vert.
  const vraie = R.bancPourLEcran();
  assert.equal(vraie.mesure, true);
  assert.match(espaces(U.ligneDeLaCalibration(vraie)), /^Formule vérifiée sur les matchs 2023-2026 avec les statistiques seules : annoncé \d{1,2},\d %, réalisé \d{1,2},\d % \((calibrée|trop sûre d’elle|pas assez sûre d’elle|non tranché|pas assez de matchs)\)\. La chance de cette page part de son 1N2 : elle sera vérifiée sur vos matchs à partir de 2027\.$/);
  assert.equal(U.tableauDuBanc(vraie).lignes[0].mot, vraie.chance.mot);
  if (optionsDuRendu.skip) return t.skip(optionsDuRendu.skip);
  const rendu = await ouvrirLeRendu({ cibles: /CoupeDuMatchCard/ });
  try {
    const Carte = (await rendu.charger('/src/components/analysis/CoupeDuMatchCard.vue')).default;
    const b = { ...bloc('retour'), banc };
    const r = await rendu.rendre(Carte, { coupe: b, page: null, analyse: { loading: false }, match: { league: b.league } });
    const tab = tableauDe(r.html, 'banc-des-coupes');
    assert.ok(tab, 'le tableau replié');
    assert.equal(corps(tab).length, 5);
    assert.equal(pied(tab).length, 1);
    assert.match(espaces(r.texte), /annoncé 68,4 %, réalisé 66,9 % \(trop sûre d’elle\)/);
    assert.equal((r.html.match(/data-ligne="/g) ?? []).length, 8 + 5, 'les huit lignes et les cinq du tableau');
    assert.equal((r.html.match(/data-ligne-calibration="chance"/g) ?? []).length, 1, 'la ligne grise sous la chance, une fois');
    assert.equal((r.html.match(/data-logos="clubs"/g) ?? []).length, 2, 'les logos sur l’aller et la chance');
    assert.equal((r.html.match(/class="crest"/g) ?? []).length, 4);
    assert.match(r.html, /data-barres="chance"/);
    assert.doesNotMatch(r.html, CLASSE_VERTE);
    assert.deepEqual(r.appels, []);
  } finally {
    await rendu.fermer();
  }
});

test('T-E11 — le repli (lot 2) : avant la première nuit, le tour de la page en numéro nu se dit comme le serveur ; les journées de championnat inchangées', () => {
  // Le bloc d'avant la première nuit, de la forme que rend le serveur (coupesRead.coupeDuMatch : « pas-encore-calcule »,
  // tour null, nature « inconnue », historique vide), parti d'un vrai bloc.
  const premiereNuit = { ...bloc('portsmouth'), etat: 'pas-encore-calcule', raison: 'premiere-nuit', calculeLe: null, tour: null, nature: { valeur: 'inconnue', certitude: null, source: null }, aller: null, chance: null, chanceSiMatchUnique: null, historique: {} };
  const surLaPage = (round) => dit(premiereNuit, { page: { data: { meta: { round } } } });
  const un = surLaPage('1');
  assert.equal(un.titre, 'Coupe de France — 1er tour', 'jamais « Coupe de France — 1 »');
  assert.deepEqual(phrases(un, 'tour'), ['Tour : 1er tour (nature pas encore connue).'], 'jamais « Tour : 1 »');
  assert.deepEqual(ligne(un, 'tour').mentions, ['intitulé FotMob : « 1 »']);
  assert.equal(ligne(un, 'tour').provenances[0].source, 'FotMob, page du match');
  const trois = surLaPage('3');
  assert.equal(trois.titre, 'Coupe de France — 3e tour');
  assert.deepEqual(phrases(trois, 'tour'), ['Tour : 3e tour (nature pas encore connue).']);
  assert.equal(surLaPage(3).titre, 'Coupe de France — 3e tour', 'le numéro rendu en nombre');
  // Un intitulé non numérique reste tel quel (jamais deviné) ; un tour de la table reste traduit.
  assert.equal(surLaPage('Group A').titre, 'Coupe de France — Group A');
  assert.deepEqual(phrases(surLaPage('Group A'), 'tour'), ['Tour : Group A (nature pas encore connue).']);
  assert.equal(surLaPage('Quarter-finals').titre, 'Coupe de France — Quarts de finale');
  // Le serveur (toursDeCoupe.js, lu) et l'écran disent la même chose, de 1 à 12 ; au-delà de deux chiffres, l'intitulé brut des deux côtés.
  for (let n = 1; n <= 12; n++) {
    const duServeur = libelleDuTour(tourNormalise(String(n)));
    assert.equal(U.tourNumeroteDit(String(n)), duServeur, `numéro ${n}`);
    assert.equal(surLaPage(String(n)).titre, `Coupe de France — ${duServeur}`, `titre, numéro ${n}`);
  }
  assert.deepEqual([libelleDuTour(tourNormalise('1')), libelleDuTour(tourNormalise('3'))], ['1er tour', '3e tour'], 'la règle du serveur elle-même');
  assert.equal(libelleDuTour(tourNormalise('100')), '100');
  assert.equal(surLaPage('100').titre, 'Coupe de France — 100');
  assert.equal(U.tourNumeroteDit('Round 3'), null, 'seulement le numéro nu');
  // Le serveur connaît le tour : son libellé prime sur la page.
  assert.equal(dit(bloc('retour'), { page: { data: { meta: { round: '1' } } } }).titre, 'UEFA Europa League — Quarts de finale, match retour');
  // Non-régression : les journées de championnat ne deviennent pas des tours (`tourDeCoupe` n'apprend pas le numéro nu).
  assert.equal(L.tour('35', 'Ligue 1'), '35');
  assert.equal(L.tour('Round 3', 'Premier League'), 'Journée 3');
  assert.equal(L.tourDeCoupe('1'), null);
});
