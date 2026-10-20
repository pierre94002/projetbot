/**
 * Les enregistreurs (étape E du plan).
 *   node --test test/enregistreurs.test.mjs        (depuis server/)
 *
 * Tout tourne dans des copies ISOLÉES (cf. test/aides/isolement.mjs) : base
 * d'essai, data/runtime à part, réseau coupé, heure figée au 05/10/2026 12 h
 * UTC. FotMob est SIMULÉ (test/aides/fotmobSimule.mjs) : aucun appel réel.
 *
 *  1. Lecture partagée de la liste du jour : une seule requête pour
 *     plusieurs appelants (les vraies boucles de l'appli, inchangées), une
 *     copie chacun, oubli après une minute, jamais d'erreur gardée ; minute
 *     et rouges lus sans rien inventer.
 *  2. Boucle du direct : plafond de détails par minute, rotation (favoris,
 *     pronostics, moteur, autres ; le plus ancien d'abord), un instantané au
 *     plus toutes les cinq minutes, mi-temps sans détail, instantané de la
 *     liste seule après trois minutes d'attente, dernier instantané à la fin,
 *     arrêt après cinq erreurs FotMob et alerte durable posée puis levée.
 *  3. Absents du jour : une lecture par match et par jour au plus, reprise
 *     du cache des compositions sans requête, identifiant 0 jamais pris pour
 *     une identité, plafond par passe, le cache des compositions jamais écrit.
 *  4. Gel des pronostics : la PREMIÈRE valeur jamais réécrite, des versions
 *     datées seulement quand quelque chose change, « plus de pronostic »
 *     quand un marché disparaît, gel d'une analyse avec sa composition.
 *  5. Cotes payantes archivées : chaque cote de chaque relevé avec son heure,
 *     rien de doublé au redémarrage, et les écrans des cotes GRATUITES
 *     inchangés.
 *  6. AUCUNE écriture pendant un import : verrou tenu par un autre processus
 *     ou par une passe — tout attend en mémoire, puis part par tranches ; la
 *     seule étape du gel écrit dans sa propre passe.
 *  7. L'état de la carte « Enregistreurs » (route en lecture seule).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';

const script = (nom) => path.join(SERVEUR, 'test', 'aides', nom);

/** Exécute un script d'essai dans une copie neuve, rend son JSON (et l'échec lisible sinon). */
function lancer(nom, { runtime = {}, args = [], env = {} } = {}) {
  const copie = preparerCopie({ runtime });
  try {
    const r = executer(copie, script(nom), { args, env, timeout: 180_000 });
    assert.equal(r.code, 0, `${nom} a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-2000)}`);
    assert.ok(r.json?.ok, `${nom} : sortie illisible\n${r.sortie.slice(-2000)}`);
    assert.equal(r.reseau, false, `${nom} : un appel réseau a été tenté\n${r.erreurs.slice(-2000)}`);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}

/** Un script lancé une seule fois, son résultat partagé par plusieurs tests. */
const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};

// ------------------------------------------------- 1. liste du jour partagée

const liste = uneFois(() => lancer('script-enregistreurs-liste.mjs'));

test('liste du jour partagée : une seule requête pour plusieurs appelants, une copie chacun, oubli après une minute, jamais d’erreur gardée', () => {
  const s = liste();

  // Cinq appelants en même temps : une requête.
  assert.equal(s.simultanes.requetes, 1);
  assert.equal(s.simultanes.compteurs.requetes, 1);
  assert.equal(s.simultanes.compteurs.servies, 4);
  assert.equal(s.simultanes.identiques, true);
  assert.equal(s.simultanes.taille, 5);

  // Les boucles de l'appli (compositions, analyse d'avant coup d'envoi, cotes
  // gratuites), les absents et le direct, dans la même minute : une requête
  // par journée en tout, toujours la même pour aujourd'hui.
  assert.equal(s.boucles.listeAujourdhui, 1, 'aujourd’hui : la lecture du point a sert à tous');
  assert.equal(s.boucles.listeDemain, 1);
  assert.equal(s.boucles.listeApresDemain, 1);
  assert.equal(s.boucles.autresAppels, 0);
  // Détails : 2 matchs en direct utiles (la mi-temps n'en demande pas) + 3 pages d'absents.
  assert.equal(s.boucles.details, 5);
  assert.equal(s.compositions.error, undefined);
  assert.equal(s.cotes.error, undefined);
  assert.equal(s.absents.candidats, 3, 'U1, T1 et P1 (sous 48 h, suivis) ; la compétition non suivie est écartée');
  assert.equal(s.absents.lus, 3);
  assert.equal(s.direct.enDirect, 3);
  assert.equal(s.direct.details, 2);

  // Chacun sa copie.
  assert.equal(s.copies.nom, 'Arsenal');
  assert.equal(s.copies.taille, 5);
  assert.equal(s.copies.requetes, 1, 'toujours la même lecture');

  // Une minute après : relue.
  assert.equal(s.apresUneMinute.requetes, 2);

  // Une lecture ratée : trois appelants l'attendaient, tous échouent avec elle (une requête, deux reprises internes), rien n'est gardé.
  assert.equal(s.erreurs.rejets, 3);
  assert.equal(s.erreurs.appels, 3, 'une seule requête (et ses deux reprises), pas une par appelant');
  assert.equal(s.erreurs.compteurs.echecs, 1);
  assert.deepEqual(s.erreurs.reprise, { ok: true, taille: 0 });
  assert.equal(s.erreurs.appelsApres, 4, 'la lecture suivante redemande');
});

test('direct dans la liste du jour et dans le détail : minute, mi-temps, rouges — un champ absent reste vide, jamais 0', () => {
  const s = liste();
  assert.deepEqual(s.liste.L1, { liveMinute: 88, liveAddedTime: null, liveLabel: '88’', liveMaxTime: 90, halfTime: false, homeRedCards: 0, awayRedCards: 1, started: true });
  assert.deepEqual(s.liste.L2, { liveMinute: null, liveAddedTime: null, liveLabel: 'HT', liveMaxTime: null, halfTime: true, homeRedCards: null, awayRedCards: null, started: true });
  assert.equal(s.liste.L3.liveMinute, 34, '« 33:12 » écoulées : on joue la 34e');
  assert.equal(s.liste.L3.homeRedCards, null);
  assert.deepEqual(s.liste.U1, { liveMinute: null, liveAddedTime: null, liveLabel: null, liveMaxTime: null, halfTime: false, homeRedCards: null, awayRedCards: null, started: false });
  assert.equal(s.formes.arretsDeJeu.liveMinute, 45);
  assert.equal(s.formes.arretsDeJeu.liveAddedTime, 2);
  assert.equal(s.formes.long.liveMinute, 62);
  assert.equal(s.formes.miTemps.halfTime, true);
  assert.equal(s.formes.miTemps.liveMinute, null);
  assert.equal(s.formes.rien.homeRedCards, null);
  assert.equal(s.formes.rien.liveMinute, null);
  assert.equal(s.formes.rougesEquipe.homeRedCards, 2);
  assert.equal(s.formes.rougesEquipe.awayRedCards, 0);

  // Détail : score, minute, xG, rouges du déroulé.
  const d = s.detail.L1;
  assert.equal(d.homeGoals, 2);
  assert.equal(d.awayGoals, 1);
  assert.equal(d.liveMinute, 89);
  assert.equal(d.xgHome, 1.84);
  assert.equal(d.xgAway, 0.62);
  assert.equal(d.stats.home['Total Shots'], 14);
  assert.equal(d.homeRedCards, 0, 'déroulé publié, aucun rouge à domicile');
  assert.equal(d.awayRedCards, 1);
  assert.equal(d.coverage, 'xG');
  // Couverture réduite : ni statistiques ni déroulé, donc rien d'inventé.
  assert.equal(s.detail.L3.stats, null);
  assert.equal(s.detail.L3.xgHome, null);
  assert.equal(s.detail.L3.homeRedCards, null);
});

// ------------------------------------------------------- 2. boucle du direct

const direct = uneFois(() =>
  lancer('script-enregistreurs-direct.mjs', {
    runtime: { 'favorites.json': { teams: [{ id: 'fotmob-9825', name: 'Arsenal', league: 'EPL', addedAt: '2026-10-03T18:00:00.000Z' }], leagues: [{ name: 'Serie A - Italy', addedAt: '2026-10-03T18:00:00.000Z' }] } }
  })
);

test('direct : au plus 6 détails par minute, rotation favoris → pronostics → moteur → autres, un instantané au plus toutes les 5 minutes', () => {
  const r = direct().rotation;
  const tours = Object.fromEntries(r.tours.map((t) => [t.decalage, t]));
  // Les rangs vont à rebours des coups d'envoi (favoris = les derniers commencés).
  assert.deepEqual(tours[0].lus, [18, 19, 20, 15, 16, 17], 'favoris (La Liga) puis matchs avec un pronostic, même commencés plus tard');
  assert.equal(tours[0].horsPlafond, 14);
  assert.deepEqual(tours[1].lus, [12, 13, 14, 1, 2, 3], 'puis ceux du moteur, puis les autres, du plus ancien au plus récent');
  assert.deepEqual(tours[2].lus, [4, 5, 6, 7, 8, 9]);
  assert.deepEqual(tours[3].lus, [10, 11]);
  assert.deepEqual(tours[4].lus, [], 'personne n’est dû');
  assert.deepEqual(tours[5].lus, [18, 19, 20, 15, 16, 17], 'cinq minutes après, les premiers servis reviennent');
  for (const t of r.tours) assert.ok(t.details <= 6, `tour ${t.decalage} : ${t.details} détails`);
  assert.equal(r.appelsListe, 6, 'une lecture de la liste par minute, pas plus');
  const rangs = Object.fromEntries(r.rangs);
  assert.equal(rangs[18], 0);
  assert.equal(rangs[15], 1);
  assert.equal(rangs[12], 2);
  assert.equal(rangs[1], 3);

  // Dans la base : 26 instantanés, jamais deux à moins de 5 minutes pour un même match.
  assert.equal(r.lignes.length, 26);
  const parMatch = new Map();
  for (const l of r.lignes) parMatch.set(l.id, [...(parMatch.get(l.id) ?? []), l.t]);
  for (const [id, ts] of parMatch) for (let i = 1; i < ts.length; i++) assert.ok(ts[i] - ts[i - 1] >= 5, `match ${id} : ${ts.join(', ')}`);
  assert.deepEqual(parMatch.get(18), [0, 5]);
  assert.deepEqual(parMatch.get(11), [3]);
  assert.ok(r.lignes.every((l) => l.source === 'liste + détail' && l.minute === 30 && l.xg === 0.4));
  assert.deepEqual(JSON.parse(r.lignes[0].stats), { expected_goals: [0.4, 0.1] }, 'statistiques du moment, au format compact');
  assert.ok(r.lignes.some((l) => l.league === 'La Liga - Spain'));
});

test('direct : mi-temps sans détail, la liste seule après 3 minutes d’attente, dernier instantané à la fin du match', () => {
  const a = direct().attente;
  assert.deepEqual(a.lus, [{ id: 2, t: 0 }, { id: 3, t: 1 }, { id: 4, t: 2 }, { id: 5, t: 3 }], 'jamais de détail pour la mi-temps, un par minute (plafond 1)');
  const de = (id) => a.lignes.filter((l) => l.id === id);
  assert.deepEqual(de(1).map((l) => [l.t, l.status, l.source, l.detailAt]), [[0, 'mi-temps', 'liste', null]]);
  assert.deepEqual(de(6).map((l) => [l.t, l.source]), [[3, 'liste']], 'attente de 3 minutes : instantané de la liste seule');
  assert.deepEqual(de(5).map((l) => [l.t, l.source]), [[3, 'liste + détail']]);
  assert.deepEqual(de(2).map((l) => [l.t, l.kind, l.status, l.hg, l.ag]), [[0, 'direct', 'en cours', 1, 0], [4, 'fin', 'terminé', 2, 1]]);
  assert.equal(a.tours[4].fins, 1);
});

test('direct : cinq erreurs FotMob d’affilée arrêtent la boucle 30 minutes (plus aucune requête) et posent l’alerte durable, levée à la reprise', () => {
  const e = direct().erreurs;
  assert.equal(e.t1.erreurs, 5);
  assert.equal(e.t1.details, 0);
  assert.ok(e.t1.suspendu, 'arrêtée au cinquième échec');
  assert.equal(e.t1.instantanes, 6, 'les instantanés de la liste seule, déjà lue, sont gardés');
  assert.equal(e.apresPanne.appelsDetail, 5, 'pas de sixième essai');
  assert.equal(e.apresPanne.suspendu, true);
  assert.equal(e.apresPanne.erreur.erreurs, 5);
  assert.deepEqual(e.pendantArret, { appelsListe: 1, appelsDetail: 5 }, 'pendant l’arrêt : aucune requête');
  assert.equal(e.t2.listeLue, false);
  assert.equal(e.alertePosee?.releves?.length, 1);
  assert.equal(e.alertePosee.releves[0].cle, 'direct');
  assert.match(e.alertePosee.releves[0].probleme, /5 erreurs FotMob d’affilée/);
  assert.equal(e.t3.listeLue, true);
  assert.equal(e.t3.details, 6);
  assert.equal(e.repris.suspendu, false);
  assert.equal(e.repris.erreur, null);
  assert.equal(e.alerteLevee, null, 'alerte levée dès la reprise');
});

test('direct : priorités lues dans les favoris (équipes par identifiant FotMob, championnats par libellé)', () => {
  const f = direct().favoris;
  assert.deepEqual(f.equipes, ['fotmob-9825']);
  assert.deepEqual(f.ligues, ['Serie A - Italy']);
  assert.deepEqual(f.rangs, { favori: 0, pronostic: 1, moteur: 2, autre: 3 });
});

// ------------------------------------------------------- 3. absents du jour

const absents = uneFois(() => lancer('script-enregistreurs-absents.mjs'));

test('absents : matchs suivis sous 48 h, le cache des compositions du jour sans requête, une lecture par match et par jour', () => {
  const s = absents();
  assert.equal(s.p1.candidats, 5, 'ni le match commencé, ni la compétition non suivie, ni le match à 49 h');
  assert.equal(s.p1.depuisCache, 1, 'A, lu ce jour par les compositions');
  assert.deepEqual(s.p1.appels, [5005, 5006, 5004, 5007], 'C (cache d’hier : relu), F, B, E — du plus proche au plus lointain');
  assert.equal(s.p1.lus, 2);
  assert.equal(s.p1.echecs, 2);
  assert.deepEqual(
    s.lecturesJour1.map((l) => [l.id, l.origin, l.status, l.h, l.a]),
    [
      ['5001', 'cache des compositions', 'publiee', 1, 0],
      ['5004', 'lecture du jour', 'non-publiee', null, null],
      ['5005', 'lecture du jour', 'publiee', 2, 1]
    ]
  );
  assert.equal(s.lecturesJour1[0].lueA, '2026-10-05T10:00:00.000Z', 'l’heure de la lecture reprise du cache');
  assert.deepEqual(s.p2.appels, [5006, 5007], 'une lecture déjà faite aujourd’hui n’est pas refaite ; les échecs sont retentés');
  assert.equal(s.p2.dejaReleves, 3);
  assert.deepEqual(s.p3.appels, [5006, 5008], 'troisième essai pour F ; D (13 h le surlendemain) vient d’entrer dans les 48 h');
  assert.deepEqual(s.p4.appels, [], 'plus d’essai après trois échecs dans la journée');
  assert.equal(s.p4.reportes, 1);
  // Après un redémarrage (mémoire perdue) : la base dit ce qui est déjà relevé ; seul F, jamais lu, est retenté.
  assert.deepEqual(s.p5.appels, [5006], 'après un redémarrage, rien de déjà relevé aujourd’hui n’est relu');
  assert.equal(s.p5.dejaReleves, 5);
});

test('absents : identifiant FotMob, jamais l’identifiant 0 ; doublon écarté ; motif et retour gardés', () => {
  const s = absents();
  assert.deepEqual(
    s.joueursJour1.map((j) => [j.id, j.side, j.cle, j.pid, j.nom, j.reason, j.retour]),
    [
      ['5001', 'home', 'fotmob-501', 'fotmob-501', 'Mauro Arambarri', 'injury', 'Late October 2026'],
      ['5005', 'away', 'nom:joueur inconnu', null, 'Joueur Inconnu', 'suspension', null],
      ['5005', 'home', 'fotmob-777', 'fotmob-777', 'Lautaro Martínez', 'injury', 'Mid October 2026'],
      ['5007', 'home', 'fotmob-888', 'fotmob-888', 'Bukayo Saka', 'internationalDuty', null]
    ]
  );
  assert.equal(s.joueursJour1[0].equipe, 'fotmob-50010');
});

test('absents : le lendemain, de nouvelles lectures sous le plafond de la passe ; le cache des compositions jamais réécrit', () => {
  const s = absents();
  assert.equal(s.j2a.candidats, 4);
  assert.equal(s.j2a.appels.length, 1, 'plafond d’une lecture par passe');
  assert.equal(s.j2a.reportes, 3);
  assert.deepEqual(s.j2b.appels, [5006, 5004, 5007, 5008]);
  assert.deepEqual(s.lecturesJour2.map((l) => l.id), ['5004', '5007', '5008']);
  assert.equal(s.cacheIntact, true);
  assert.equal(s.cacheA, '2026-10-05T10:00:00.000Z');
  assert.deepEqual(s.unitaire.vide, { joueurs: [], compte: { home: null, away: null }, statut: 'non-publiee' });
  assert.deepEqual(s.unitaire.sansListe.compte, { home: 0, away: null });
  assert.equal(s.unitaire.sansListe.statut, 'publiee');
});

// ------------------------------------------------- 4. gel des pronostics

const gel = uneFois(() => lancer('script-enregistreurs-gel.mjs'));

test('gel : la première valeur de chaque pronostic, par identifiants FotMob, avec la source des cotes et l’état de la compo', () => {
  const s = gel();
  assert.deepEqual({ matchs: s.g1.matchs, calcules: s.g1.calcules, echecs: s.g1.echecs, sansIdentifiant: s.g1.sansIdentifiant }, { matchs: 3, calcules: 3, echecs: 0, sansIdentifiant: 0 });
  assert.ok(s.g1.pronostics >= 20, `${s.g1.pronostics} pronostics`);
  assert.equal(s.g1.ecrits, s.g1.pronostics, 'un pronostic = une première valeur');
  assert.equal(s.v1.lignes, s.g1.pronostics);
  assert.equal(s.v1.cles.length, 3);
  for (const c of s.v1.cles) assert.match(c, /^fotmob:fotmob-\d+\|fotmob-\d+\|2026-10-06$/);
  assert.deepEqual(s.v1.origines, ['nuit']);
  assert.deepEqual(Object.values(s.v1.sources).sort(), ['aucune cote (modèle de buts)', 'aucune cote (modèle de buts)', 'cotes gratuites : espn']);
  assert.deepEqual(s.v1.compos, ['inconnue (non relue)'], 'aucune composition en cache pour ces matchs');
  const e = s.v1.exemple;
  assert.equal(e.version, 1);
  assert.equal(e.recorded_at, '2026-10-05T12:00:00.000Z');
  assert.ok(e.probability > 0 && e.probability < 1);
  assert.equal(e.probability, Math.round((1 / e.predicted_odds) * 10_000) / 10_000);
  assert.equal(e.min_odds, 1.2);
  assert.equal(e.market_odds, null, 'pas de cote du marché sans cote : jamais 0');
  assert.match(e.engine_hash, /^[0-9a-f]{12}$/);
});

test('gel : rien d’ajouté si rien ne change ; une cote qui bouge ajoute des versions datées ; la PREMIÈRE valeur n’est jamais réécrite', () => {
  const s = gel();
  assert.equal(s.g2.ecrits, 0);
  assert.equal(s.apresG2, s.v1.lignes);
  assert.ok(s.g3.ecrits >= 1);
  assert.ok(s.g3lignes.every((l) => l.cle === 'fotmob:fotmob-8451|fotmob-8462|2026-10-06' && l.version === 2 && l.origine === 'nuit' && l.quand === '2026-10-05T14:00:00.000Z'), JSON.stringify(s.g3lignes));
  assert.ok(s.g3lignes.some((l) => l.marche === 'result'));
  assert.ok(s.g3lignes.every((l) => l.a === '2026-10-05T13:00:00.000Z'), 'l’heure des nouvelles cotes');
  assert.equal(s.premieresIntactes, true, 'versions 1 identiques, colonne par colonne, après tous les gels');
});

test('gel : une analyse est gelée avec la composition qu’elle a lue (en file, puis écrite) ; un marché sans pronostic reçoit « plus de pronostic » une fois', () => {
  const s = gel();
  assert.equal(s.analyseEnFile, true);
  assert.ok(s.vidage.ecrites > 0);
  assert.equal(s.analyse.length, s.vidage.ecrites);
  assert.ok(s.analyse.every((a) => a.compo === 'publiée (FotMob)' && a.compoA === '2026-10-06T17:05:00.000Z' && a.version === 2));
  assert.equal(s.retrait1, 1);
  assert.equal(s.retrait2, 0);
  assert.equal(s.retire.versions.length, 2);
  assert.ok(s.retire.versions[0].choice !== null);
  assert.deepEqual(s.retire.versions[1], { version: 2, choice: null, label: 'plus de pronostic' });
});

// ------------------------------------------------ 5. cotes payantes archivées

const cotes = uneFois(() => lancer('script-enregistreurs-cotes.mjs'));

test('cotes payantes : chaque cote de chaque relevé, avec l’heure du relevé, par identifiants FotMob', () => {
  const s = cotes();
  assert.equal(s.r1.statut, 'mis en file');
  assert.equal(s.r1.releveAt, '2026-10-05T11:30:00.000Z', 'l’heure du relevé : celle de l’instantané');
  assert.deepEqual([s.r1.matchs, s.r1.cotes, s.r1.ignorees], [3, 17, 1], 'h2h et totals gardés ; un marché inconnu (h2h_lay) écarté');
  assert.equal(s.avantVidage, 0, 'rien d’écrit avant le vidage de la file');
  assert.equal(s.apresR1, 17);
  assert.equal(s.etat1.sourceAt, '2026-10-05T11:30:00.000Z');
  assert.deepEqual(s.evenements.map((e) => [e.id, e.h, e.a]), [
    ['oddsapi-m1', s.homeId, s.awayId],
    ['oddsapi-m2', 'fotmob-8636', 'fotmob-8600'],
    ['oddsapi-m3', 'fotmob-8455', 'fotmob-8667']
  ]);
  assert.ok(s.evenements.every((e) => /^The Odds API · relevé manuel du 2026-10-05T11:30:00\.000Z · .+odds-snapshot\.json$/.test(e.provenance)));
  assert.deepEqual(s.kinds.map((k) => [k.id, k.kind, k.n]), [['oddsapi-m1', 'snapshot', 8], ['oddsapi-m2', 'snapshot', 6], ['oddsapi-m3', 'live', 3]], 'un relevé fait après le coup d’envoi est du direct');
  assert.equal(s.rejoue.statut, 'déjà archivé');
  // Second relevé : les 17 cotes, même celles qui n'ont pas bougé.
  assert.equal(s.apresR2, 34);
  assert.deepEqual(
    s.serieWinamax.map((q) => [q.selection, q.r, q.price]),
    [
      ['away', '2026-10-05T11:30:00.000Z', 3.6], ['away', '2026-10-05T11:50:00.000Z', 3.5],
      ['draw', '2026-10-05T11:30:00.000Z', 3.3], ['draw', '2026-10-05T11:50:00.000Z', 3.3],
      ['home', '2026-10-05T11:30:00.000Z', 2.1], ['home', '2026-10-05T11:50:00.000Z', 2.2]
    ]
  );
});

test('cotes payantes : rien de doublé au redémarrage ni après un arrêt en pleine écriture', () => {
  const s = cotes();
  assert.equal(s.apresRedemarrage.statut, 'déjà archivé');
  assert.equal(s.r3.statut, 'mis en file', 'marqueur perdu : le relevé est repris');
  assert.equal(s.v3.ecrites, 0, '… sans rien doubler');
  assert.equal(s.apresR3, 34);
  assert.equal(s.etat3.sourceAt, '2026-10-05T11:50:00.000Z');
});

test('cotes payantes : les écrans des cotes GRATUITES restent exactement les mêmes ; l’archive se lit en la demandant', () => {
  const s = cotes();
  assert.deepEqual(s.gratuitesInchangees, { fixture: true, parNoms: true, reference: true, resume: true, chutes: true, couverture: true });
  assert.deepEqual(s.sourcesFixture, ['espn']);
  assert.deepEqual(s.avecPayantes, [{ source: 'espn', bookmakers: ['DraftKings'] }, { source: 'odds-api', bookmakers: ['unibet_fr', 'winamax_fr'] }]);
  assert.deepEqual(s.resumeAvecPayantes, [{ source: 'espn', quotes: 6 }, { source: 'odds-api', quotes: 34 }]);
});

// ------------------------------------- 6. aucune écriture pendant un import

const verrou = uneFois(() => lancer('script-enregistreurs-verrou.mjs'));

test('verrou tenu par un import (autre processus) : les quatre enregistreurs relèvent, RIEN n’est écrit, tout attend en file', () => {
  const s = verrou();
  assert.deepEqual(s.depart, { direct: 0, lectures: 0, absents: 0, gel: 0, payantes: 0, comptes: 0 });
  assert.equal(s.verrouTenu, true);
  assert.equal(s.direct.instantanes, 2);
  assert.equal(s.absents.misEnFile, 2);
  assert.equal(s.payantes.statut, 'mis en file');
  assert.equal(s.analyseEnFile, true);
  assert.equal(s.gelHorsPasse.reporte, true, 'le gel de nuit lancé hors de sa passe attend aussi');
  assert.equal(s.gelHorsPasse.ecrits, 0);
  assert.equal(s.vidage.reporte, true);
  assert.equal(s.vidage.ecrites, 0);
  assert.equal(s.tour.ecriture.reporte, true, 'le tour du planificateur n’écrit pas non plus');
  assert.deepEqual(s.pendantImport, { direct: 0, lectures: 0, absents: 0, gel: 0, payantes: 0, comptes: 0 }, 'aucune ligne, aucun compteur');
  assert.deepEqual(s.fileAttente, { direct: 2, absents: 2, 'cotes-payantes': 4, gel: 2 });
});

test('pendant une passe d’actualisation : seule l’étape du gel écrit (ses lignes seulement) ; verrou libre : tout part', () => {
  const s = verrou();
  const p = s.dansLaPasse;
  assert.equal(p.verrou, true);
  assert.equal(p.autres.reporte, true, 'les autres enregistreurs attendent la fin de la passe');
  assert.deepEqual(p.avantGel, { direct: 0, lectures: 0, absents: 0, gel: 0, payantes: 0, comptes: 0 });
  assert.ok(p.gel.ecrits > 0);
  assert.equal(p.gel.reporte, false);
  assert.deepEqual({ ...p.apresGel, gel: 0, comptes: 0 }, { direct: 0, lectures: 0, absents: 0, gel: 0, payantes: 0, comptes: 0 }, 'rien d’autre que le gel');
  assert.equal(s.verrouApresPasse, false);
  assert.equal(s.vidageLibre.ecrites, 9, '2 instantanés + 2 lectures et 2 absents + 3 cotes payantes');
  assert.deepEqual({ ...s.apres, gel: 0, comptes: 0 }, { direct: 2, lectures: 2, absents: 2, gel: 0, payantes: 3, comptes: 0 });
  assert.deepEqual(s.fileVide, { direct: 0, absents: 0, 'cotes-payantes': 0, gel: 0 });
});

test('par tranches : un import qui démarre entre deux tranches arrête l’écriture, le reste attend puis part', () => {
  const s = verrou();
  assert.deepEqual(s.coupe, { ecrites: 200, restantes: 800, reporte: true });
  assert.equal(s.ecritesAvantCoupure, 200, 'une tranche de 200 instantanés, puis plus rien');
  assert.deepEqual(s.reprise, { ecrites: 800, restantes: 0 });
  assert.equal(s.ecritesFin, 1000);
});

// ----------------------------------------- 7. l'état de la carte de Réglages

test('carte « Enregistreurs » : pour chaque relevé, depuis quand, lignes du jour, dernier relevé, état, provenance ; route en lecture seule', () => {
  const e = verrou().etat;
  assert.equal(e.coupure, null);
  assert.match(e.base, /match-stats\.db$/);
  assert.deepEqual(e.lignes.map((l) => l.cle), ['absents', 'direct', 'cotes-payantes', 'gel']);
  const de = Object.fromEntries(e.lignes.map((l) => [l.cle, l]));
  assert.equal(de.absents.aujourdhui, 4, '2 lectures + 2 joueurs');
  assert.equal(de.direct.aujourdhui, 1002);
  assert.equal(de['cotes-payantes'].aujourdhui, 3);
  assert.ok(de.gel.aujourdhui > 0);
  for (const l of e.lignes) {
    assert.equal(l.etat, 'actif', l.cle);
    assert.equal(l.hier, 0);
    assert.ok(l.depuis && l.dernier, `${l.cle} : depuis ${l.depuis}, dernier ${l.dernier}`);
    assert.ok(l.fournisseur && l.tables.length, `${l.cle} : provenance`);
    assert.equal(l.enAttente, 0);
  }
  assert.equal(de['cotes-payantes'].depuis, '2026-10-05T11:30:00.000Z', 'l’heure du relevé payant');
  assert.equal(e.totaux.nombre, 4);
  assert.equal(e.totaux.actifs, 4);
  assert.equal(e.totaux.aujourdhui, e.lignes.reduce((n, l) => n + l.aujourdhui, 0));
  assert.equal(e.totaux.moyenneAujourdhui, e.totaux.aujourdhui / 4);
  assert.deepEqual(e.deja.map((d) => d.cle), ['cotes-gratuites-direct', 'deroule']);
  assert.deepEqual(e.problemes, []);
  assert.ok(['requetes', 'servies', 'echecs'].every((k) => Number.isInteger(e.listeDuJour?.[k])), 'compteurs de la liste du jour partagée');
  assert.deepEqual(e.route, { code: 200, cles: ['absents', 'direct', 'cotes-payantes', 'gel'], generatedAt: true });
  assert.equal(e.rienEcrit, true, 'lire l’état n’écrit rien');
});

