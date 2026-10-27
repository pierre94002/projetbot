/**
 * Étape 28 du plan — LES DEUX ÉTAPES DE NUIT DE LA SIMULATION (data/simulation/simulationNuit.js, ses deux enfants,
 * simulationRead.js), dans des COPIES ISOLÉES de la base d'essai (isolement.mjs : réseau coupé, heure figée) :
 *   node --test test/simulationNuit.test.mjs        (depuis server/)
 *
 *   T9      oracle des fins de saison : la nuit à D sur la base « entière » (rencontres, forces et calendrier d'après D)
 *           = la nuit sur la base tronquée à D, à l'octet ; un 9-0 planté le jour D sans effet ; un club à une
 *           rencontre de plus dans la table que dans le magasin → refusé, nommé ; une table orpheline ignorée ;
 *   B8      l'enjeu FIGÉ après le coup d'envoi (jamais réécrit), une rencontre reportée : ligne neuve à sa nouvelle
 *           date, l'ancienne jamais lue ; identifiants FotMob seulement ;
 *   T9 bis  la loi affichée : forces pour 95 % des clubs → « forces » ; 85 % → « table » et sa phrase ; forces de D − 4
 *           → « table » ; l'enjeu d'une rencontre garde la loi de sa ligne (jamais un mélange) ;
 *   T10     le contrôle de nuit : 40 rencontres refaites → 0 écart ; deux fuites plantées (un λ d'après-match, un
 *           calcule_le après le coup d'envoi) → deux écarts nommés, le second « écarté du jugement » ; une rencontre du
 *           calendrier seul du jour même → non écrite ;
 *   B5      le rangement : tranches de 250, aucune transaction ouverte quand on rend la main, en_cours posé puis retiré ;
 *   T16/B4  « maintenant » obligatoire ; un calcul lourd en cours → reporté ; délai dépassé → enfant arrêté, rien rangé ;
 *           rangement interrompu → en_cours, la nuit d'avant lue, repris ; les enfants n'écrivent rien ;
 *   « un seul principal » : le jugement principal pris une fois à l'horizon, jamais refait ;
 *   F6      le contrôle « sans effets » (rapporté) : à l'horizon, rejoué dans l'enfant sans effets ni rouges, retenté
 *           s'il a été reporté, jamais refait ensuite ; pertes = un oracle écrit ici ; enfant = processus ;
 *   B11     la rétention des déroulés (J + 2) et des fins de saison (14 jours, puis une nuit par semaine, 400 jours).
 * Les valeurs attendues sont recalculées ICI, jamais recopiées d'une sortie.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { graineDuMatch } from '../src/data/simulation/simulationMatch.js';
import { PHRASE_LOI_TABLE, PHRASE_LOI_TABLE_FORCES_PERIMEES, PHRASE_LOI_FORCES_ESSAI, loiAffichee } from '../src/data/simulation/simulationRead.js';
import { gardeDeSurete, GARDE_SURETE_PT, COMBINES_DE_LA_NUIT } from '../src/data/simulation/simulationNuit.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-simulation-nuit.mjs');

function lancer(phase, maintenant = '2026-10-20T01:00:00.000Z') {
  const copie = preparerCopie();
  try {
    const r = executer(copie, SCRIPT, { args: [phase], timeout: 600_000, maintenant });
    assert.equal(r.code, 0, `${phase} a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-2000)}`);
    assert.ok(r.json?.ok, `${phase} : sortie illisible\n${r.sortie.slice(-2000)}`);
    assert.equal(r.reseau, false, `${phase} : un appel réseau a été tenté`);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}
const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};
const saisons = uneFois(() => lancer('saisons'));
const loi = uneFois(() => lancer('loi'));
const matchs = uneFois(() => lancer('matchs', '2026-10-05T01:00:00.000Z'));
const garde = uneFois(() => lancer('garde'));
const principal = uneFois(() => lancer('principal', '2026-10-05T01:00:00.000Z'));
const retention = uneFois(() => lancer('retention'));

// ------------------------------------------------------------ T9 et B8 : les fins de saison

test('T9 la nuit des fins de saison, à part : les 48 championnats lus, le championnat planté simulé (aller-retour construit : 380 − 30 = 350 restantes), deux lois, l’enjeu des rencontres datées D..D+14, la nuit finie (en_cours retiré)', () => {
  const s = saisons();
  assert.equal(s.A.mode, 'complet', s.A.erreur);
  assert.equal(s.A.championnats, 48);
  assert.equal(s.A.simules, 1, 'le seul championnat cohérent de la copie');
  assert.equal(s.A.nonCalcules, 47);
  assert.equal(s.A.forces.empreinte, 'v1|35|25|remise-a-zero');
  assert.equal(s.A.forces.origine, 'candidate');
  assert.ok(s.A.rss > 0 && s.A.rss < 400 * 1048576, `mémoire de l’enfant ${s.A.rss}`);
  const e = s.A.etat;
  assert.equal(e.complet, 1);
  assert.equal(e.restants, 20 * 19 - 30);
  assert.equal(e.season, '2026');
  assert.deepEqual(JSON.parse(e.tables), ['Ligue 2']);
  assert.equal(e.table_relevee_le, '2026-10-19T20:00:00.000Z');
  assert.equal(e.forces_a_jour, 1);
  assert.equal(e.n, 2000);
  // Deux lois, et pour chacune les 20 rencontres des journées 4 (D+1) et 5 (D+8) ; la journée 6 (D+15) au-delà de 14 jours.
  assert.deepEqual(s.A.enjeux.map((x) => [x.loi, x.n, x.du, x.au]), [['forces', 20, '2026-10-21', '2026-10-28'], ['table', 20, '2026-10-21', '2026-10-28']]);
  // Chaque famille : Σ des clubs = nombre de rangs qui la portent (1re place 1, promotion 2, barrage 3, descente 2), par loi.
  const somme = Object.fromEntries(s.A.familles.map((f) => [`${f.loi}|${f.famille}`, f.somme]));
  for (const l of ['forces', 'table']) {
    assert.ok(Math.abs(somme[`${l}|premiere`] - 1) < 1e-9, `${l} 1re place`);
    assert.ok(Math.abs(somme[`${l}|promotion`] - 2) < 1e-9, `${l} promotion`);
    assert.ok(Math.abs(somme[`${l}|promotion_barrage`] - 3) < 1e-9, `${l} barrage`);
    assert.ok(Math.abs(somme[`${l}|relegation`] - 2) < 1e-9, `${l} descente`);
  }
  assert.equal(s.A.nuit, '2026-10-20T01:00:00.000Z');
  assert.equal(s.A.enCours, null);
});

test('T9 oracle : la base « entière » (rencontres jouées après D, forces datées du jour D lui-même et d’après, calendrier qui les dit finies) et la base tronquée à D donnent les MÊMES octets que la nuit à D ; un 9-0 planté LE JOUR D est sans effet (date < D strict) ; le processus à part et ce processus rangent les mêmes octets', () => {
  const s = saisons();
  assert.equal(s.B.mode, 'complet');
  assert.equal(s.B.identique, true, 'base entière = nuit à D');
  assert.equal(s.C.identique, true, 'base tronquée à D = nuit à D');
  assert.equal(s.neufZero.auMagasin, 1, 'le 9-0 était bien au magasin');
  assert.equal(s.neufZero.identique, true, 'un 9-0 du jour D ne change rien');
});

test('T9 garde anti-fuite : un club à une rencontre de plus dans la table que dans le magasin avant D → « table et magasin en désaccord », le club nommé, aucune probabilité ; une table orpheline (relevée plus d’une heure avant) ignorée', () => {
  const s = saisons();
  assert.equal(s.unDePlus.etat.complet, 0);
  assert.match(s.unDePlus.etat.raison, /^table et magasin en désaccord : Essai C \(table 4, magasin 3\)/);
  assert.equal(s.unDePlus.probas, 0);
  assert.equal(s.orpheline.identique, true);
});

test('B8 enjeu FIGÉ et rencontre REPORTÉE : la nuit du lendemain ne réécrit pas les enjeux des rencontres du jour (heure inconnue), réécrit les suivantes ; la rencontre reportée garde sa ligne orpheline (jamais lue) et en reçoit une neuve à sa nouvelle date ; lues par identifiants FotMob', () => {
  const f = saisons().figes;
  assert.equal(f.mode, 'complet');
  assert.equal(f.enjeuxFiges, 20, 'les 10 rencontres du jour × 2 lois');
  assert.deepEqual(f.jour4, [{ calcule_le: f.M, n: 20 }], 'les enjeux du jour gardent la nuit d’avant');
  assert.deepEqual(f.jour5, [{ calcule_le: f.M, n: 2 }, { calcule_le: f.M2, n: 18 }], 'journée 5 réécrite, sauf la rencontre reportée');
  assert.deepEqual(f.ancienneLigne.map((x) => x.calcule_le), [f.M, f.M]);
  assert.deepEqual(f.nouvelleLigne.map((x) => x.calcule_le), [f.M2, f.M2]);
  // La lecture : jamais l'ancienne ligne de la rencontre reportée ; la nouvelle, oui ; les figées du jour, oui.
  const deLaReportee = f.lus.filter((e) => e.h === f.reportee.h && e.a === f.reportee.a);
  assert.deepEqual(deLaReportee.map((e) => e.date), [f.reportee.nouvelle]);
  // Le report tel que FotMob l'écrit (deux entrées, vérification du 27/10, constat 1) : la paire garde sa NOUVELLE date et
  // le numéro de match de sa nouvelle entrée, jamais l'entrée « postponed ».
  assert.deepEqual(deLaReportee.map((e) => e.matchId), [f.reportee.matchIdNouveau]);
  assert.notEqual(f.reportee.matchIdNouveau, f.reportee.matchIdAncien);
  assert.equal(f.lus.filter((e) => e.date === '2026-10-21').length, 10);
  assert.ok(f.lus.filter((e) => e.date === '2026-10-21').every((e) => e.calculeLe === f.M));
  for (const e of f.lus) {
    assert.match(e.h, /^\d+$/, 'identifiant FotMob, jamais un nom');
    assert.match(e.a, /^\d+$/);
    assert.ok(['gros-enjeu', 'sans-enjeu', 'enjeu', 'non-calcule'].includes(e.categorie));
    // Refait chaque nuit jusqu'à la veille du match (vérification du 27/10, constat 19) : les lignes lues sont toutes d'une
    // rencontre APRÈS le jour de leur nuit (les rencontres du jour, figées, gardent la nuit d'avant).
    assert.match(e.quand, /^calculé la nuit du \d\d\/\d\d, refait chaque nuit jusqu’à la veille du match, puis gardé tel quel$/);
    if (e.enjeuDom !== null) assert.equal(e.enjeuDom % 5, 0, 'arrondi à 5');
    if (e.phrase) assert.match(e.phrase, /Essai [A-T] joue/);
  }
});

// ------------------------------------------------------------ T9 bis : la loi affichée

test('T9 bis loi affichée : forces de buts à jour pour 100 % puis 95 % des clubs → « forces » (modèle en essai) ; 85 % → « table » et sa phrase ; forces calculées à D − 4 → « table », à D − 3 → « forces » ; rangement des forces en cours → « table »', () => {
  const c = loi().cas;
  assert.equal(loi().nuit.mode, 'complet');
  assert.deepEqual([c.toutes.loi.loi, c.toutes.loi.part, c.toutes.loi.phrase], ['forces', 1, PHRASE_LOI_FORCES_ESSAI]);
  assert.deepEqual([c.p95.loi.loi, c.p95.loi.part], ['forces', 0.95]);
  // La nuit avait les forces : la loi « classement seul » dit la vraie cause (vérification du 27/10, constat 20).
  assert.deepEqual([c.p85.loi.loi, c.p85.loi.part, c.p85.loi.phrase], ['table', 0.85, PHRASE_LOI_TABLE_FORCES_PERIMEES]);
  assert.match(c.p85.loi.pourquoi, /85 % des clubs/);
  assert.equal(c.dMoins4.loi.loi, 'table');
  assert.equal(c.dMoins4.loi.phrase, PHRASE_LOI_TABLE_FORCES_PERIMEES);
  assert.match(c.dMoins4.loi.pourquoi, /plus vieilles que 3 jours/);
  assert.equal(c.dMoins3.loi.loi, 'forces');
  assert.equal(c.enCours.loi.loi, 'table');
  // Une nuit SANS la loi « forces » : la phrase « le modèle de buts n'est pas en service » (la vraie cause cette fois).
  const sansForces = loiAffichee('L', { database: null, maintenant: Date.parse('2026-10-20T09:00:00Z'), etat: { forces_empreinte: null } });
  assert.deepEqual([sansForces.loi, sansForces.phrase], ['table', PHRASE_LOI_TABLE]);
  assert.notEqual(PHRASE_LOI_TABLE_FORCES_PERIMEES, PHRASE_LOI_TABLE);
  assert.match(PHRASE_LOI_TABLE_FORCES_PERIMEES, /trop sûre d’elle/, 'la mise en garde porte sur la loi : gardée');
});

test('T9 bis la loi « forces » des fins de saison exige des forces À JOUR, version comprise (vérification du 27/10, constat 9) : des forces rangées par une autre version du calcul → loi « table » seule, la version nommée', () => {
  const v = loi().versionDesForces;
  assert.deepEqual([v.aJour.empreinte, v.aJour.raison], ['v1|35|25|remise-a-zero', null]);
  assert.equal(v.autre.empreinte, null);
  assert.match(v.autre.raison, /^forces de buts rangées par une autre version du calcul \(version 0, il faut la 1\) : loi « table » seule cette nuit$/);
});

test('T9 bis l’enjeu garde la loi de SA ligne : en « forces », les chiffres de la ligne forces ; la loi basculée en « table », ceux de la ligne table de la même nuit — jamais un mélange ; la fin de saison suit la loi (V1 arrondie à 10)', () => {
  const s = loi();
  const arr = (x) => Math.round(x / 5) * 5;
  assert.equal(s.cas.toutes.enjeu.calcule, true);
  assert.deepEqual([s.cas.toutes.enjeu.loi, s.cas.toutes.enjeu.enjeuDom, s.cas.toutes.enjeu.enjeuExt], ['forces', arr(s.lignes.forces.enjeu_dom), arr(s.lignes.forces.enjeu_ext)]);
  assert.deepEqual([s.cas.p85.enjeu.loi, s.cas.p85.enjeu.enjeuDom, s.cas.p85.enjeu.enjeuExt], ['table', arr(s.lignes.table.enjeu_dom), arr(s.lignes.table.enjeu_ext)]);
  // La nuit avait les forces (85 % des clubs seulement à la lecture) : la phrase des forces qui manquent (constat 20).
  assert.equal(s.cas.p85.enjeu.loiPhrase, PHRASE_LOI_TABLE_FORCES_PERIMEES);
  assert.equal(s.cas.dMoins4.enjeu.loi, 'table');
  // La fin de saison : en V1, des dizaines (ou les bornes) ; en V2, au point près entre 10 et 90.
  const textes = (saison) => saison.tables[0].clubs.flatMap((c) => Object.values(c.familles).map((f) => f.texte));
  assert.equal(s.cas.p85.saison.loi.loi, 'table');
  for (const t of textes(s.cas.p85.saison)) assert.match(t, /^(≥ 90 %|≤ 10 %|[1-8]0 %|acquis sauf surprise)$/, t);
  assert.equal(s.cas.toutes.saison.loi.loi, 'forces');
  assert.ok(textes(s.cas.toutes.saison).some((t) => /^[1-8][1-9] %$/.test(t)), 'au point près en V2');
  // L'ordre officiel, jamais réordonné.
  assert.deepEqual(s.cas.toutes.saison.tables[0].clubs.map((c) => c.rang), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.match(s.cas.toutes.saison.provenance.detail, /^2.000 fins de saison simulées la nuit du 20\/10 à 3 h 00 · classement relevé le 19\/10 à 22 h 00 · 350 rencontres restantes, dont \d+ pas encore datées · loi : forces de buts du modèle en essai/);
});

// ------------------------------------------------------------ T10, B5 : la nuit des matchs

test('T10 la nuit des matchs : les rencontres cotées des 48 h et celle du calendrier seul de DEMAIN écrites (heure fictive 12:00Z jamais prise : 00 h de Paris) ; celle du calendrier seul d’AUJOURD’HUI jamais écrite ; entrées, graine, table jointe et marchés rangés ; la candidate sans forces à jour sautée', () => {
  const s = matchs();
  assert.equal(s.nuit.mode, 'complet', s.nuit.erreur);
  assert.equal(s.nuit.bilan.candidate, null);
  assert.match(s.nuit.bilan.candidateEnAttente, /forces de buts de la candidate pas à jour/);
  const noms = s.lignes.map((l) => `${l.home_name} - ${l.away_name}`).sort();
  assert.deepEqual(noms, ['Arsenal - Chelsea', 'Fulham - Brentford', 'Man City - Liverpool', `${s.calendrierSeul.demain.home_name} - ${s.calendrierSeul.demain.away_name}`].sort());
  assert.ok(!s.lignes.some((l) => l.home_name === s.calendrierSeul.aujourdhui.home_name && l.date === '2026-10-05'), 'le calendrier seul du jour même n’est jamais écrit');
  for (const l of s.lignes) {
    assert.equal(l.role, 'service');
    assert.equal(l.grille, 'modele-buts-441');
    assert.equal(l.version, 1);
    assert.equal(l.calcule_le, '2026-10-05T01:00:00.000Z');
    assert.equal(l.graine, graineDuMatch({ cle: l.fixture_key, role: l.role, lambda: l.lambda, mu: l.mu, rho: l.rho }), 'la graine des entrées rangées');
    assert.equal(l.n, 10000);
    assert.ok(l.octets > 0 && l.octets % 7 === 0, 'table jointe : 7 octets par case');
    assert.equal(l.apres_coup_d_envoi, 0);
    assert.match(l.home_id, /^\d+$/);
    assert.match(l.fixture_key, /^fotmob:fotmob-\d+\|fotmob-\d+\|\d{4}-\d{2}-\d{2}$/);
    assert.equal(Number(l.lambda.toFixed(3)), l.lambda, 'λ à 3 décimales');
    const m = JSON.parse(l.marches);
    assert.ok(Math.abs(m.htH + m.htD + m.htA - 1) < 2e-6, 'mi-temps 1N2 = 1');
    assert.ok(l.masse_non_couverte >= 0 && l.masse_non_couverte < 0.005);
    if (l.home_name === 'Man City') assert.deepEqual([l.kickoff, l.kickoff_connu], ['2026-10-05T18:30:00.000Z', 1]);
    if (l.league === 'Championship') assert.deepEqual([l.kickoff, l.kickoff_connu, l.date], [null, 0, '2026-10-06']);
  }
  assert.equal(s.nuit.controleDesTables.lignes, 4, 'au plus 40 rencontres refaites : ici les 4');
  assert.deepEqual(s.nuit.controleDesTables.ecarts, []);
  assert.deepEqual([s.nuit.controle.lignes, s.nuit.controle.ecarts.length, s.nuit.controle.marquees], [4, 0, 0]);
  assert.equal(s.etat.nuits.matchs.calculeLe, '2026-10-05T01:00:00.000Z');
  assert.equal(s.etat.enCours.matchs, null);
  assert.ok(s.nuit.rss > 0 && s.nuit.rss < 256 * 1048576, `mémoire de l’enfant ${s.nuit.rss}`);
});

test('T10 contrôle : 40 rencontres refaites avec la graine du jour → 0 écart ; deux fuites plantées — un λ d’après-match (entrées changées sans nouveau tirage) et un calcule_le après le coup d’envoi → deux écarts NOMMÉS, le second « écarté du jugement » et marqué', () => {
  const s = matchs();
  assert.equal(s.quarante.graine, 20261005);
  assert.deepEqual(s.quarante.controle, { lignes: 40, ecarts: [] });
  const f = s.fuites;
  assert.equal(f.ecarts.length, 2, JSON.stringify(f.ecarts));
  const [entrees] = f.ecarts.filter((e) => e.type === 'entrees');
  const [apres] = f.ecarts.filter((e) => e.type === 'apresCoupDEnvoi');
  assert.match(entrees.texte, /^Man City – Liverpool du 2026-10-05 \(moteur en service, nuit du 05\/10 à 3 h 00\) : les buts attendus rangés .* ne redonnent pas la graine du tirage — entrées modifiées après coup$/);
  assert.match(apres.texte, /^Arsenal – Chelsea du 2026-10-05 .* : calculée après le coup d’envoi — gardée, comptée, écartée du jugement$/);
  assert.equal(f.marquees, 1);
  assert.equal(f.arsenal.apres_coup_d_envoi, 1);
});

test('B5 rangement : 600 lignes en tranches de 250 (trois transactions), la main rendue entre deux seulement — jamais une transaction ouverte à une pause ; en_cours posé pendant, retiré à la fin, la nuit notée', () => {
  const t = matchs().tranches;
  assert.equal(t.rangees, 600);
  // Une pause après l'effacement d'une nuit du même instant (aucune ici), puis « en cours », puis une par tranche de 250.
  assert.deepEqual(t.pauses.map((p) => p.ou), ['rangement', 'en cours', 'rangement', 'rangement']);
  assert.ok(t.pauses.every((p) => p.transaction === false), JSON.stringify(t.pauses));
  assert.equal(t.pauses[0].enCours, null);
  assert.ok(t.pauses.slice(1).every((p) => p.enCours === '2026-10-05T02:00:00.000Z'));
  assert.equal(t.enCoursApres, null);
  assert.equal(t.nuit, '2026-10-05T02:00:00.000Z');
  assert.equal(t.retour.ecrites, 600);
  assert.ok(t.retour.plusLongueTrancheMs < 1000);
});

// ------------------------------------------------------------ T16, B4 : la garde de la nuit

test('T16 « maintenant » obligatoire (les deux étapes, l’instant d’un rangement) ; B4 un calcul lourd en cours → « reporté », rien de rangé, la nuit d’avant toujours lue ; délai dépassé → l’enfant arrêté, rien rangé, le jeton rendu', () => {
  const g = garde();
  for (const k of ['saisons', 'matchs', 'ranger']) assert.match(g.sansMaintenant[k], /« maintenant » \(l’heure de la passe\) est obligatoire/, k);
  assert.equal(g.reporte.premiere, 'complet');
  assert.equal(g.reporte.saisons.mode, 'reporte');
  assert.match(g.reporte.saisons.raison, /Un autre calcul lourd tourne \(banc d’essai/);
  assert.equal(g.reporte.matchs.mode, 'reporte');
  // Reportée AVANT toute analyse dans le serveur (vérification du 27/10, constat 15) : aucune rencontre lue, aucune analyse.
  assert.deepEqual([g.reporte.matchs.analyses, g.reporte.matchs.dansLaFenetre], [0, 0]);
  assert.equal(g.reporte.nuitSaisons, '2026-10-20T01:00:00.000Z', 'la nuit d’avant reste lue');
  assert.equal(g.reporte.lignesDuLendemain, 0);
  assert.equal(g.reporte.lignesMatchs, 0);
  assert.equal(g.reporte.jetonApres, null);
  assert.equal(g.delai.mode, 'echec');
  assert.match(g.delai.erreur, /aucune réponse en 1 ms/);
  assert.equal(g.delai.lignes, 0);
  assert.equal(g.delai.jeton, null);
  assert.equal(g.delai.nuit, '2026-10-20T01:00:00.000Z');
});

test('T16 le jeton du calcul lourd est TENU pendant que l’enfant tourne : lu à chaque morceau, un second calcul lourd y est refusé ; rendu après (vérification du 27/10, constat 13 b)', () => {
  const j = garde().jeton;
  assert.equal(j.fin, true);
  assert.ok(j.morceaux >= 1, 'au moins un morceau reçu');
  assert.deepEqual(j.pendant, ['fins de saison'], 'le jeton, pris au nom du calcul, pendant tout l’enfant');
  assert.equal(j.second, 'refuse', 'un second calcul lourd pendant l’enfant : refusé');
  assert.equal(j.apres, null, 'rendu à la fin');
});

test('T16 les ÉTAPES de la passe (le job) quand un autre calcul lourd tient le jeton : « warn », details.reporte, et l’étape reste DUE le jour même (refaite à la passe suivante) — faite sans report, elle ne l’est plus (vérification du 27/10, constat 13 c)', () => {
  const p = garde().passes;
  for (const cle of ['saisons', 'matchs']) {
    const x = p[cle];
    assert.equal(x.status, 'warn', cle);
    assert.equal(x.reporte, true, `${cle} : details.reporte`);
    assert.match(x.summary, /^Reporté : Un autre calcul lourd tourne \(banc d’essai/, cle);
  }
  assert.equal(p.saisons.due, true, 'fins de saison reportées : dues à la passe suivante');
  assert.equal(p.saisons.dueSansReport, false, 'faites le même jour sans report : plus dues');
  assert.equal(p.matchs.due, p.enregistreurs, 'déroulés reportés : dus (avec les enregistreurs)');
  assert.equal(p.matchs.dueSansReport, false);
  assert.equal(p.lignesMatchs, 0, 'rien rangé');
});

test('T16 rangement interrompu : en_cours posé, aucune transaction ouverte, la nuit d’avant lue ; la nuit suivante retire les lignes interrompues et finit ; les enfants n’écrivent rien (base intacte à l’octet), tournent dans un autre processus', () => {
  const g = garde();
  assert.equal(g.interrompu.enCours, '2026-10-23T01:00:00.000Z');
  assert.equal(g.interrompu.nuit, '2026-10-20T01:00:00.000Z');
  assert.ok(g.interrompu.lignesInterrompues > 0, 'des lignes de la nuit interrompue');
  assert.equal(g.interrompu.transaction, false);
  assert.equal(g.interrompu.lu, '2026-10-20T01:00:00.000Z', 'les lecteurs lisent la nuit d’avant');
  assert.equal(g.reprise.mode, 'complet');
  assert.ok(g.reprise.retirees >= g.interrompu.lignesInterrompues);
  assert.equal(g.reprise.enCours, null);
  assert.equal(g.reprise.nuit, '2026-10-24T01:00:00.000Z');
  assert.equal(g.reprise.lignesInterrompues, 0);
  assert.equal(g.enfants.baseIntacte, true);
  assert.deepEqual([g.enfants.saisons.fin, g.enfants.saisons.morceaux, g.enfants.saisons.pidAutre, g.enfants.saisons.simules], [true, 1, true, 1]);
  assert.deepEqual([g.enfants.matchs.fin, g.enfants.matchs.pidAutre], [true, true]);
  assert.deepEqual(g.enfants.matchs.controle, { lignes: 1, ecarts: [] });
});

// ------------------------------------------------------------ un seul principal

test('un seul principal : avant l’horizon, des chiffres provisoires seulement ; à l’horizon, le jugement principal pris UNE fois et rangé au registre ; la nuit suivante le reprend, jamais refait (un seul principal au registre)', () => {
  const p = principal().principal;
  assert.deepEqual([p.avantLHorizon.calcule, p.avantLHorizon.principal, p.avantLHorizon.matchs], [true, false, 5]);
  assert.equal(p.avantLHorizon.sansEffets, null, 'avant l’horizon, aucun contrôle « sans effets »');
  assert.deepEqual([p.j1.calcule, p.j1.principal, p.j1.matchs, p.j1.lignes], [true, true, 5, 70]);
  assert.ok(typeof p.j1.verdict === 'string');
  assert.deepEqual([p.j2.calcule, p.j2.principal, p.j2.deja], [true, false, true]);
  assert.deepEqual([p.j3.calcule, p.j3.principal, p.j3.deja, p.j3.sansEffets], [true, false, true, null]);
  assert.equal(p.principauxAuRegistre, 1);
  assert.equal(p.jugementsAuRegistre, 1, 'les provisoires et le contrôle « sans effets » ne sont jamais rangés au registre');
  assert.equal(p.memePrincipal, true, 'le principal de l’horizon n’est jamais refait (seul son contrôle « sans effets » est complété)');
  assert.equal(p.rienRefait, true, 'une fois le contrôle fait, plus rien n’est refait');
  assert.equal(p.principal1.lancement, '2026-09-01');
  assert.equal(p.provisoire.matchs, 5);
  assert.equal(p.provisoire.ecartees.apresCoupDEnvoi, 1, 'la ligne calculée après le coup d’envoi : comptée, jamais jugée (5 rencontres, pas 6)');
});

test('après le jugement principal, la nuit ne relit plus que les 60 derniers jours (le rapport de Réglages), sans juge provisoire ; avant, tout depuis le lancement, avec les chiffres provisoires ; le principal n’est jamais touché (vérification du 27/10, constat 16)', () => {
  const p = principal().principal;
  assert.deepEqual(p.avantLHorizonDetail, { rapportJours: null, provisoire: true }, 'avant l’horizon : tout, et le juge provisoire');
  for (const j of [p.j2, p.j3]) {
    assert.equal(j.rapportJours, 60);
    assert.equal(j.provisoire, null, 'plus de juge provisoire après le principal');
    assert.equal(j.matchs, 5, 'les cinq rencontres de septembre sont dans les 60 derniers jours début octobre');
  }
  assert.deepEqual([p.j4.calcule, p.j4.deja, p.j4.rapportJours, p.j4.provisoire, p.j4.matchs], [true, true, 60, null, 0], 'le 25/11 : depuis le 26/09, plus aucune des rencontres de début septembre');
  assert.equal(p.principalInchange, true);
});

test('la garde de sûreté ne juge pas les marchés ni les combinés DÉJÀ écartés par la note (« un but dans chaque mi-temps », « au moins un rouge ») : jamais montrés, seulement rapportés ; un autre marché au-delà de 4 points s’éteint SEUL (vérification du 27/10, constat 7)', () => {
  const s = (marche, ecart, n = 900) => ({ marche, n, ecart });
  const parCombine = COMBINES_DE_LA_NUIT.map((c, i) => ({ nom: c.nom, n: 900, ecart: i === 4 ? -4.6 : 0.6 }));
  const g = gardeDeSurete({ parCombine, parMarche: [s('rougeAuMoinsUn', 4.5), s('deuxMiTemps05', -4.3), s('h2plusQueH1', -4.2), s('htD', 1.1), s('htFt6', 9, 0)] });
  assert.deepEqual(g.eteints, [COMBINES_DE_LA_NUIT[4].nom, 'h2plusQueH1']);
  assert.equal(g.ok, false);
  assert.equal(g.seuilPt, GARDE_SURETE_PT);
  const rien = gardeDeSurete({ parCombine: parCombine.map((c) => ({ ...c, ecart: 0.6 })), parMarche: [s('rougeAuMoinsUn', 4.5), s('deuxMiTemps05', -4.3)] });
  assert.deepEqual([rien.ok, rien.eteints], [true, []], 'les deux écartés de la note au-delà de 4 points : la garde ne bouge pas');
});

test('F6, le contrôle « sans effets » (rapporté) : à l’horizon, un autre calcul lourd en cours → principal pris, contrôle reporté et nommé ; la nuit suivante, les déroulés jugés rejoués SANS effets ni rouges (même graine) : 12 marchés × 5 rencontres, pertes = l’oracle écrit à la main', () => {
  const p = principal().principal;
  const s1 = p.principal1.sansEffets;
  assert.equal(s1.calcule, false);
  assert.equal(s1.reporte, true);
  assert.match(s1.raison, /^reporté : /);
  assert.equal(p.j1.sansEffets.reporte, true);
  const s = p.principal2.sansEffets;
  assert.equal(s.calcule, true, s.raison);
  assert.deepEqual([s.rejouees, s.matchs, s.lignes, s.marches, s.marchesDuBloc], [5, 5, 60, 12, 18], 'les marchés rangés de l’essai (mi-temps, 9 cases) seulement ; 18 au bloc');
  assert.equal(s.lignes, p.oracle.lignes);
  assert.ok(Math.abs(s.sommes.sansEffets - p.oracle.sansEffets) <= 1e-9, `sans effets : ${s.sommes.sansEffets} ≠ oracle ${p.oracle.sansEffets}`);
  assert.ok(Math.abs(s.sommes.avecEffets - p.oracle.avecEffets) <= 1e-9, `avec effets : ${s.sommes.avecEffets} ≠ oracle ${p.oracle.avecEffets}`);
  assert.notEqual(s.sommes.sansEffets, s.sommes.avecEffets);
  assert.equal(s.verdict, 'pas-assez-de-matchs', 'cinq rencontres : le juge le dit, jamais un faux verdict');
  assert.equal(s.pasMoinsBon, null);
  assert.equal(p.j2.sansEffets.calcule, true);
  // Dans l'enfant (un vrai processus à part, sans base) et dans le processus : les mêmes pertes, à l'octet.
  const e = p.enfant;
  assert.equal(e.oui.calcule, true, e.oui.raison);
  assert.ok(Number.isInteger(e.oui.pid) && e.oui.pid !== e.moi, 'calculé dans un autre processus');
  assert.equal(e.non.pid, null);
  assert.equal(e.oui.lignes, 5);
  assert.deepEqual(e.oui.sommes, e.non.sommes);
});

// ------------------------------------------------------------ B11 : la rétention

test('B11 rétention des déroulés : deux jours après la rencontre, seule la dernière ligne d’avant le coup d’envoi reste, table jointe vidée ; une rencontre d’hier intacte ; au-delà de 400 jours, plus rien', () => {
  const r = retention().matchs;
  assert.deepEqual(r.lignes, [
    { fixture_key: 'X', calcule_le: '2026-10-16T01:00:00.000Z', octets: null },
    { fixture_key: 'Y', calcule_le: '2026-10-18T01:00:00.000Z', octets: 7 },
    { fixture_key: 'Y', calcule_le: '2026-10-19T01:00:00.000Z', octets: 7 }
  ]);
});

test('B11 rétention des fins de saison : chaque nuit sur 14 jours, puis la première nuit de chaque semaine ; au-delà de 400 jours, plus rien (états et enjeux compris) — la saison à juger garde une nuit par semaine', () => {
  const s = retention().saisons;
  const M = Date.parse('2026-10-20T01:00:00.000Z');
  const recentes = s.toutes.filter((c) => Date.parse(c) >= M - 14 * 86_400_000);
  for (const c of recentes) assert.ok(s.nuits.includes(c), `nuit récente ${c} gardée`);
  assert.equal(recentes.length, 14);
  const anciennes = s.nuits.filter((c) => Date.parse(c) < M - 14 * 86_400_000);
  // Une par semaine (lundi → dimanche à Paris), la première de la semaine.
  const semaine = (c) => {
    const j = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date(c));
    const t = Date.parse(`${j}T00:00:00Z`);
    return new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
  };
  assert.equal(new Set(anciennes.map(semaine)).size, anciennes.length, 'une seule nuit par semaine');
  const attendues = [...new Set(s.toutes.filter((c) => Date.parse(c) < M - 14 * 86_400_000 && c > '2025-10-01').map(semaine))];
  assert.equal(anciennes.length, attendues.length);
  assert.ok(!s.nuits.includes('2025-09-01T01:00:00.000Z'));
  assert.deepEqual(s.etat, ['2026-10-19T01:00:00.000Z']);
  assert.deepEqual(s.enjeux, ['2026-10-25']);
});
