/**
 * Étape 27 du plan — LES FORCES DE BUTS de la nuit et ce qui les nourrit (conception §3.4, §3.5, §5.1, §5.3).
 *   node --test test/forcesButs.test.mjs        (depuis server/)
 *
 * Dans des COPIES ISOLÉES de la base d'essai (isolement.mjs), script test/aides/script-forces-buts.mjs :
 *   nuit          rien à faire ; « maintenant » obligatoire ; l'enfant en lecture seule (base intacte) ; premier
 *                 calcul = la reconstruction complète ; feuille tardive ; rangement interrompu ; deux empreintes ;
 *                 aucune transaction ouverte à un point d'arrêt ; un calcul lourd à la fois ; l'étape de la passe ;
 *                 les réglages du moteur jamais touchés ;
 *   plantations   club promu, coupe, deux matchs le même jour, coupe prolongée, contrôle anti-fuite (deux fuites).
 * Puis, dans le processus du test (sans base) : les livres du plus/moins à la coupure, le plus/moins du banc
 * (football-data), l'accumulateur (fin de journée), la remise à zéro, le jeton du calcul lourd, le texte de l'enfant.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { reglagesDuModele } from './aides/modeleDeButsCommun.mjs';
import * as G from '../src/core/engine/goalModel.js';
import { AccumulateurDesForces, reglagesDeLEmpreinte } from '../src/data/db/forcesButs.js';
import { commencerCalculLourd, calculLourdEnCours, CalculLourdEnCours, avecCalculLourd, phraseDuReport } from '../src/utils/calculLourd.js';
import { prixFd, colonne } from '../src/bench/prix.js';
import { removeMargin } from '../src/core/market/marginRemoval.js';
import { ForcesCourantes } from '../src/bench/entrees.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-forces-buts.mjs');
const SRC = path.join(SERVEUR, 'src');

function lancer(phase) {
  const copie = preparerCopie();
  try {
    const r = executer(copie, SCRIPT, { args: [phase], timeout: 300_000 });
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
const nuit = uneFois(() => lancer('nuit'));
const plantations = uneFois(() => lancer('plantations'));
const E1 = 'v1|35|25|remise-a-zero';

// ------------------------------------------------------------ la nuit

test('T-nuit : aucune version ne lit les forces → rien ; « maintenant » obligatoire ; premier calcul À PART (autre processus, base et journal intacts pendant son calcul) = la reconstruction complète, contrôle 40 couples, 0 écart ; rien de changé → rien', () => {
  const s = nuit();
  assert.deepEqual(s.rien, { mode: 'rien', raison: 'aucune version du moteur ne lit les forces de buts' });
  assert.match(s.sansMaintenant, /« maintenant » .* est obligatoire/);
  assert.equal(s.enfant.autrePid, true, 'le calcul tourne dans un autre processus');
  assert.equal(s.enfant.baseIntacte, true, 'l’enfant n’a écrit ni dans la base ni dans son journal');
  assert.ok(s.enfant.lignes > 1000, JSON.stringify(s.enfant));
  assert.deepEqual(s.enfant.controle, { lignes: 40, ecarts: 0 });
  assert.equal(s.premier.mode, 'premier');
  assert.equal(s.premier.erreur, null);
  assert.equal(s.premier.ecrites, s.premier.lignes);
  assert.deepEqual(s.premier.controle, { lignes: 40, ecarts: 0 });
  assert.equal(s.premier.face.identiques, true, `table ≠ reconstruction : ${JSON.stringify(s.premier.face.ecarts)}`);
  assert.equal(s.premier.face.liguesIdentiques, true, `journées ≠ reconstruction : ${JSON.stringify(s.premier.face.ecartsLigues)}`);
  assert.deepEqual(s.premier.etat, { aJour: true, empreintes: [E1], enCours: null, version: 1 });
  assert.equal(s.second.mode, 'rien', 'rien de changé : rien de recalculé ni d’écrit');
});

test('T-nuit « feuille tardive » : un match ANCIEN corrigé après coup → la nuit refait tout et la table redevient exactement la reconstruction complète (jamais un incrément à l’aveugle) ; les lignes d’avant le match ne bougent pas, celle de son jour oui', () => {
  const t = nuit().tardive;
  assert.equal(t.mode, 'complet');
  assert.ok(t.clubs > 0 && t.ecrites > 0, JSON.stringify(t));
  assert.equal(t.face.identiques, true, `table ≠ reconstruction : ${JSON.stringify(t.face.ecarts)}`);
  assert.equal(t.face.liguesIdentiques, true, JSON.stringify(t.face.ecartsLigues));
  assert.equal(t.avantLeMatchInchange, true);
  assert.equal(t.duJourChange, true);
});

test('T-nuit « rangement interrompu » : « en cours » reste posé, aucune transaction ouverte, le lecteur du moteur IGNORE la table (forces et moyennes nulles, la raison dite), l’étape est due ; la nuit suivante refait tout → la reconstruction, « en cours » retiré', () => {
  const s = nuit();
  assert.equal(s.interrompu.pas, 3);
  assert.equal(s.interrompu.transactionOuverte, false);
  assert.equal(s.interrompu.etat.aJour, false);
  assert.ok(s.interrompu.etat.enCours, 'en cours posé');
  assert.equal(s.interrompu.lecteur.forces, null);
  assert.equal(s.interrompu.lecteur.ligue, null);
  assert.ok(s.interrompu.lecteur.manques.includes('forces de buts en cours de rangement'), JSON.stringify(s.interrompu.lecteur.manques));
  assert.equal(s.interrompu.due, true);
  assert.equal(s.reprise.mode, 'complet');
  assert.equal(s.reprise.face.identiques, true, JSON.stringify(s.reprise.face.ecarts));
  assert.deepEqual(s.reprise.etat, { aJour: true, enCours: null });
  assert.equal(s.reprise.lecteur, true);
});

test('T-nuit « deux empreintes » : deux réglages de forces rangés côte à côte, chacun = sa reconstruction, lus chacun par son empreinte ; une empreinte plus demandée est retirée la nuit suivante, l’autre intacte', () => {
  const s = nuit();
  assert.deepEqual(s.deux.empreintes, ['v1|20|20|remise-a-zero', E1]);
  assert.equal(s.deux.faceE1, true);
  assert.equal(s.deux.faceE2, true);
  assert.ok(s.deux.lignesE2 > 1000);
  assert.equal(s.deux.etatsDifferents, true, 'deux demi-vies, deux états');
  assert.deepEqual(s.deux.etat, ['v1|20|20|remise-a-zero', E1]);
  // Vérification des fuites (constat 2) : la nuit contrôle LES DEUX empreintes demandées, 40 couples chacune (80 en tout).
  assert.deepEqual(s.deuxControle, {
    lignes: 80,
    ecarts: 0,
    empreintes: [{ empreinte: 'v1|20|20|remise-a-zero', lignes: 40, ecarts: 0 }, { empreinte: E1, lignes: 40, ecarts: 0 }],
    empreinte: `v1|20|20|remise-a-zero ; ${E1}`
  });
  // Une fuite plantée dans les lignes de la SECONDE empreinte seule : trouvée, et nommée avec son empreinte ; la première intacte.
  assert.deepEqual(s.fuiteSurLaSeconde.empreintes, [[E1, 1, false], ['v1|20|20|remise-a-zero', 1, true]]);
  assert.equal(s.fuiteSurLaSeconde.lignes, 2);
  assert.deepEqual(s.fuiteSurLaSeconde.nommees, [s.fuiteSurLaSeconde.attendue]);
  assert.equal(s.retrait.lignesE2, 0);
  assert.equal(s.retrait.retirees >= s.deux.lignesE2, true);
  assert.equal(s.retrait.faceE1, true);
  assert.deepEqual(s.retrait.etat, [E1]);
});

test('T-nuit : le rangement ne laisse JAMAIS une transaction ouverte quand il rend la main (tranches de 100, table réécrite entière)', () => {
  const t = nuit().transactions;
  assert.ok(t.pointsDArret > 10, `${t.pointsDArret} points d’arrêt`);
  assert.equal(t.ouvertes, 0);
  assert.equal(t.face, true);
});

test('un calcul lourd à la fois : un banc tourne → les forces sont REPORTÉES (rien lancé), l’étape le dit en français et revient à la passe suivante ; les forces tournent → le banc est refusé (409, reporté) ; le jeton est rendu', () => {
  const s = nuit();
  assert.equal(s.reporte.forces.mode, 'reporte');
  assert.match(s.reporte.forces.raison, /banc d’essai/);
  assert.equal(s.reporte.passe.status, 'warn');
  assert.equal(s.reporte.passe.reporte, true);
  assert.match(s.reporte.passe.summary, /^Reporté : .* les forces de buts seront calculées à la passe suivante\.$/);
  assert.equal(s.reporte.due, true, 'reportée : due à la passe suivante');
  assert.deepEqual([s.bancPendantLesForces.reporte, s.bancPendantLesForces.statut], [true, 409]);
  assert.match(s.bancPendantLesForces.message, /forces de buts/);
  assert.equal(s.jetonRendu, null);
});

test('l’étape « forcesButs » de la passe : après l’indice de force, avant le gel et la candidate à blanc ; résumé en français (lignes, clubs, championnats, durée, contrôle anti-fuite) ; rien de neuf → « rien à refaire » ; table pas à jour → attente ; plus aucune version → l’empreinte retirée, et dit ; due ; jamais les réglages du moteur', () => {
  const s = nuit();
  const i = (k) => s.etapes.indexOf(k);
  assert.ok(i('forcesButs') > i('indiceForce') && i('forcesButs') < i('gelPronostics') && i('forcesButs') < i('moteurABlanc') && i('forcesButs') < i('sauvegarde'), s.etapes.join(', '));
  assert.equal(s.passe.status, 'ok');
  assert.equal(s.passe.mode, 'complet');
  assert.deepEqual(s.passe.controle, { lignes: 40, ecarts: 0 });
  assert.match(s.passe.summary, /^Forces de buts : \d[\d  ]* lignes? écrites? \(\d+ clubs?\), \d+ championnats? mis à jour, .* à part \(\d+ Mo\), rangement .*, le serveur jamais tenu plus de \d+ ms d'affilée ; contrôle anti-fuite : 40 lignes recalculées par un second chemin, 0 écart\.$/);
  assert.deepEqual(s.passe.alerte, { key: 'forcesButs', value: null }, 'aucun écart : l’alerte durable est levée');
  assert.equal(s.passe.changed, false);
  assert.equal(s.passe.face, true);
  assert.equal(s.passeRienANeuf.mode, 'rien');
  assert.match(s.passeRienANeuf.summary, /^Rien à refaire : aucune rencontre de la table du jour J n’a bougé/);
  assert.deepEqual([s.passeAttente.status, s.passeAttente.mode], ['warn', 'attente']);
  assert.match(s.passeAttente.summary, /La table du jour J n’est pas à jour/);
  assert.match(s.passeRien.summary, /^Plus aucune version du moteur ne lit les forces de buts : 4\s312 lignes retirées/);
  assert.equal(s.passeRien.lignesE1, 0);
  assert.deepEqual(s.passeVide, { status: 'ok', summary: 'Rien à faire : aucune version du moteur ne lit les forces de buts.' });
  assert.deepEqual(s.due, { faitAujourdhuiAJour: false, jamaisFait: true, clic: true, autreEmpreinte: true });
  assert.deepEqual(s.reglages.apres, s.reglages.avant, 'la passe n’apprend rien : réglages du moteur et leur empreinte identiques');
});

// ------------------------------------------------------------ les plantations

test('club PROMU (ou relégué) : la remise à zéro se fait à son PREMIER match du nouveau championnat — la veille, les sommes de l’ancien (une coupe entre deux ne remet rien à zéro) ; après, un seul match pèse (poids 1) ; n compte tous les matchs', () => {
  const s = plantations();
  assert.ok(s.promus.length >= 5, `${s.promus.length} clubs`);
  for (const p of s.promus) {
    assert.ok(p.veille && p.apres, JSON.stringify(p));
    assert.equal(p.apres.ligue, p.vers);
    assert.deepEqual([p.apres.wa, p.apres.wd, p.apres.wga, p.apres.wgd], [1, 1, 1, 1], `${p.club} : remise à zéro au premier match en ${p.vers}`);
    assert.equal(p.veille.ligue, p.de, `${p.club} : la veille, encore l’ancien championnat`);
    assert.ok(p.veille.wa > 1 || p.veille.n === 1, `${p.club} : la veille, les sommes de l’ancien championnat (${p.veille.wa})`);
    assert.equal(p.apres.n, p.veille.n + 1);
  }
  assert.ok(s.promus.some((p) => p.coupesEntre > 0), 'au moins un club avec une coupe entre ses deux championnats');
  assert.ok(s.coupes.length >= 10);
  for (const c of s.coupes) {
    assert.equal(c.ligue, c.ligueAvant, `${c.club} : une coupe ne change pas le dernier championnat`);
    assert.ok(c.wa > 1, `${c.club} : une coupe ne remet rien à zéro`);
  }
});

test('deux matchs d’un club le MÊME jour : lus « avant J », aucun ne compte ; le lendemain, les deux ; l’état rangé = le second chemin (moyennes du championnat sans leur propre jour), pour lui et pour son adversaire', () => {
  const m = plantations().memeJour;
  assert.equal(m.matchsDuClubCeJour, 2);
  assert.deepEqual([m.ecartsAvant, m.ecartsLendemain, m.ecartsAdversaire], [0, 0, 0]);
  assert.equal(m.nLendemain, m.nAvant + 2);
});

test('coupe PROLONGÉE (comptée dans les moyennes pour l’essai) dont on change le score final : forces et moyennes du championnat inchangées — seuls comptent les buts de la 90e', () => {
  const c = plantations().coupeProlongee;
  assert.equal(c.trouvee, true);
  assert.equal(c.dansLesMoyennes, true);
  assert.equal(c.inchangees, true);
});

test('contrôle anti-fuite des lignes rangées : 40 couples, 0 écart ; deux fuites plantées (le match du jour vu avant lui ; la moyenne qui compte son propre jour) → exactement ces deux couples en écart, nommés', () => {
  const s = plantations();
  assert.deepEqual(s.controleAvant, { lignes: 40, ecarts: 0 });
  assert.deepEqual(s.controleApres.couplesEnEcart, s.controleApres.attendus);
  assert.equal(s.controleApres.lignes, 42);
  assert.ok(s.controleApres.colonnes.includes('n') && s.controleApres.colonnes.includes('sa'), JSON.stringify(s.controleApres.colonnes));
});

// ------------------------------------------------------------ sans base

const H = '2026-09-12T15:00:00.000Z';
const avant = (minutes) => new Date(Date.parse(H) - minutes * 60_000).toISOString();
const COUPURE = { instant: avant(60), heureSure: true };
const cote = (source, bookmaker, selection, kind, minutes, price) => ({ source, bookmaker, selection, line: 2.5, kind, releveAt: avant(minutes), price });

test('livres du plus/moins à la coupure (H − 60) : la clôture relevée à H − 5 écartée, le relevé de H − 90 pris, le direct jamais ; Smarkets, une cote payante ou saisie seule = pas d’ancre ; la moyenne football-data d’abord', () => {
  const espn = (kind, m, o, u) => [cote('espn', 'Bet365', 'over', kind, m, o), cote('espn', 'Bet365', 'under', kind, m, u)];
  const livres = G.livresDuPlusMoins([...espn('snapshot', 90, 1.9, 1.95), ...espn('close', 5, 3.2, 1.3), ...espn('live', -10, 9, 1.01)], COUPURE);
  assert.deepEqual(livres.map((l) => [l.bookmaker, l.over, l.under]), [['Bet365', 1.9, 1.95]], 'H − 90 pris, H − 5 et le direct écartés');
  const a = G.ancrageDuPlusMoins(livres);
  assert.equal(a.pOver, removeMargin([1.9, 1.95]).probabilities[0]);
  assert.equal(a.source, 'ESPN (moyenne de 1 livre)');
  // Le relevé de H − 5 compte si la coupure est plus tard (le direct, une fois le match commencé, jamais).
  const tard = G.livresDuPlusMoins([...espn('snapshot', 90, 1.9, 1.95), ...espn('close', 5, 3.2, 1.3), ...espn('live', -10, 9, 1.01)], { instant: avant(0), heureSure: true });
  assert.deepEqual(tard.map((l) => [l.over, l.under]), [[3.2, 1.3]]);
  // L'ouverture est toujours admise ; la plus récente gagne.
  assert.deepEqual(G.livresDuPlusMoins([...espn('open', 4000, 2.1, 1.75), ...espn('snapshot', 90, 1.9, 1.95)], COUPURE).map((l) => l.over), [1.9]);
  // Smarkets seul, une cote payante seule, une saisie seule : aucun livre, aucune ancre.
  for (const [source, livre] of [['smarkets', 'Smarkets'], ['odds-api', 'Pinnacle'], ['saisie', 'Winamax']]) {
    const l = G.livresDuPlusMoins([cote(source, livre, 'over', 'snapshot', 90, 1.9), cote(source, livre, 'under', 'snapshot', 90, 1.95)], COUPURE);
    assert.deepEqual(l, [], `${source} seul : aucun livre`);
    assert.equal(G.ancrageDuPlusMoins(l), null, `${source} seul : pas d’ancre`);
  }
  // Moyenne football-data ET ESPN : la moyenne football-data.
  const fd = [cote('football-data.co.uk', 'Moyenne du marché', 'over', 'preclose', 1440, 2.0), cote('football-data.co.uk', 'Moyenne du marché', 'under', 'preclose', 1440, 1.85)];
  const deux = G.ancrageDuPlusMoins(G.livresDuPlusMoins([...fd, ...espn('snapshot', 90, 1.9, 1.95)], COUPURE));
  assert.equal(deux.source, 'football-data (moyenne du marché)');
  assert.equal(deux.pOver, removeMargin([2.0, 1.85]).probabilities[0]);
  // Une seule sélection : pas un livre.
  assert.deepEqual(G.livresDuPlusMoins([cote('espn', 'Bet365', 'over', 'snapshot', 90, 1.9)], COUPURE), []);
});

test('banc, plus/moins football-data : l’avant-match = la moyenne moy_p25 / moy_m25 (méthode puissance) ; la CLÔTURE n’en donne jamais (même avec moy_cp25) ; une colonne de clôture lue pour le moteur lève', () => {
  const ligne = { moy_1: 210, moy_n: 340, moy_2: 360, moy_c1: 200, moy_cn: 350, moy_c2: 380, moy_p25: 190, moy_m25: 195, moy_cp25: 150, moy_cm25: 260 };
  const m = prixFd(ligne, { jeu: 'fd-avant-match' });
  assert.equal(m.plusMoins.pOver, removeMargin([1.9, 1.95]).probabilities[0]);
  assert.equal(m.plusMoins.ligne, 2.5);
  assert.equal(m.plusMoins.source, 'football-data (moyenne du marché)');
  assert.equal(prixFd(ligne, { jeu: 'fd-cloture' }).plusMoins, null, 'fd-cloture : ancrage 1N2 seul');
  assert.equal(prixFd({ ...ligne, moy_m25: null }, { jeu: 'fd-avant-match' }).plusMoins, null, 'une seule cote : pas d’ancre');
  assert.throws(() => colonne(ligne, 'moy_cp25', 'fd-avant-match'), /n'appartient pas au jeu/);
  assert.throws(() => colonne(ligne, 'moy_cm25', 'fd-avant-match'), /n'appartient pas au jeu/);
  // Une ligne qui LÈVE sur toute lecture d'une colonne de clôture : l'avant-match ne la touche jamais, plus/moins compris.
  const piege = new Proxy(ligne, { get: (o, k) => { if (typeof k === 'string' && /_c(1|n|2|p25|m25)$/.test(k)) throw new Error(`clôture lue : ${k}`); return o[k]; } });
  assert.ok(prixFd(piege, { jeu: 'fd-avant-match' }).plusMoins);
});

test('accumulateur (nuit et banc) : un match ne voit jamais son jour — deux matchs du même club le même jour, l’état publié reste celui d’avant jusqu’à la fin de la journée, puis compte les deux ; moyennes du championnat sans leur jour ; journées dans l’ordre', () => {
  const r = reglagesDuModele();
  const acc = new AccumulateurDesForces({ empreintes: [E1] });
  const fait = (club, adversaire, domicile, jour, bp, bc) => ({ club, adversaire, domicile, jour, league: 'Essai', saison: 2026, coupe: false, compte: true, butsPour: bp, butsContre: bc, xgPour: null, xgContre: null });
  const rencontre = (dom, ext, jour, bd, be) => [fait(dom, ext, true, jour, bd, be), fait(ext, dom, false, jour, be, bd)];
  acc.ajouter(...rencontre(1, 2, '2026-08-01', 2, 1));
  acc.ajouter(...rencontre(3, 4, '2026-08-01', 0, 0));
  acc.finDeJournee();
  const veille = acc.etat(E1, 1);
  acc.ajouter(...rencontre(1, 3, '2026-08-08', 3, 0));
  assert.deepEqual(acc.etat(E1, 1), veille, 'avant la fin de la journée : l’état d’avant');
  acc.ajouter(...rencontre(4, 1, '2026-08-08', 1, 1));
  assert.deepEqual(acc.etat(E1, 1), veille, 'le second match du jour ne voit pas le premier');
  const moyennesDuJour = acc.moyennes('Essai', '2026-08-08', 2026);
  assert.equal(moyennesDuJour.matchs, 2, 'les moyennes du 08/08 ne comptent que le 01/08');
  acc.finDeJournee();
  const apres = acc.etat(E1, 1);
  assert.equal(apres.n, 3);
  // Les deux matchs du 08/08 joués avec les moyennes d'AVANT le 08/08 (celles du défaut : 2 matchs < 10).
  const L = G.moyennesAvant([{ jour: '2026-08-01', saison: 2026, n: 2, bd: 2, be: 1, nx: 0, xd: 0, xe: 0 }], { jour: '2026-08-08', saison: 2026 });
  const rr = reglagesDeLEmpreinte(E1);
  const attendu = G.jouerUnMatch(G.jouerUnMatch(veille, G.matchPourLesForces(fait(1, 3, true, '2026-08-08', 3, 0), L), rr), G.matchPourLesForces(fait(1, 4, false, '2026-08-08', 1, 1), L), rr);
  assert.deepEqual(apres, attendu);
  assert.equal(acc.moyennes('Essai', '2026-08-09', 2026).matchs, 4);
  assert.throws(() => acc.ajouter(...rencontre(5, 6, '2026-08-02', 1, 0)), /dans l'ordre/);
  // Le banc lit par le même accumulateur (ForcesCourantes) : pendant la journée, l'état d'avant.
  const banc = new ForcesCourantes(r);
  banc.ajouter('magasin', { club: 7, adversaire: 8, camp: 1, date: '2026-08-01', league: 'Essai', saison: 2026, attribue: 0, prolongation: 0, compte: 1, coupe: 0, bp: 2, bc: 0, bp90: null, bc90: null, xg_p: null, xg_c: null });
  const pendant = banc.entrees({ source: 'magasin', home: 7, away: 8, league: 'Essai', jour: '2026-08-01', saison: 2026 });
  assert.deepEqual([pendant.forces.home, pendant.forces.away, pendant.ligue.matchs], [null, null, 0], 'le jour même : rien de ce jour');
  banc.finDeJournee();
  assert.equal(banc.entrees({ source: 'magasin', home: 7, away: 8, league: 'Essai', jour: '2026-08-02', saison: 2026 }).forces.home.n, 1);
});

test('remise à zéro (pur) : championnat A, coupe, championnat A, puis championnat B → les sommes repartent à zéro au premier match de B seulement ; « garder » ne remet jamais à zéro ; n compte tout', () => {
  const r = reglagesDuModele();
  const m = (championnat, bp) => ({ xgPour: null, xgContre: null, butsPour: bp, butsContre: 1, moyennes: { buts: { lieu: 1.4, adverse: 1.1 }, xg: { lieu: 1.4, adverse: 1.1 } }, championnat });
  let e = null;
  e = G.jouerUnMatch(e, m('A', 2), r);
  e = G.jouerUnMatch(e, m(null, 5), r);
  assert.equal(e.ligue, 'A', 'une coupe ne change pas le championnat');
  assert.ok(e.wa > 1);
  e = G.jouerUnMatch(e, m('A', 1), r);
  const avantB = e;
  e = G.jouerUnMatch(e, m('B', 3), r);
  assert.deepEqual([e.wa, e.wd, e.wga, e.wgd, e.n, e.ligue], [1, 1, 1, 1, 4, 'B']);
  assert.equal(e.sa, 3 / 1.4);
  const garde = G.jouerUnMatch(avantB, m('B', 3), { ...r, changementDeChampionnat: 'garder' });
  assert.ok(garde.wa > 1, '« garder » : pas de remise à zéro');
});

test('un calcul lourd à la fois (utils/calculLourd.js) : le second lève CalculLourdEnCours (reporté, 409, la phrase nomme le premier) ; rendu, le suivant passe ; rendu aussi sur une erreur ; rendre deux fois ne rend pas le jeton d’un autre', async () => {
  assert.equal(calculLourdEnCours(), null);
  const fin = commencerCalculLourd('banc d’essai', { maintenant: Date.parse('2026-10-05T12:00:00Z') });
  assert.deepEqual(calculLourdEnCours(), { nom: 'banc d’essai', depuis: '2026-10-05T12:00:00.000Z' });
  let erreur = null;
  try {
    commencerCalculLourd('forces de buts', { maintenant: Date.parse('2026-10-05T12:12:00Z') });
  } catch (e) {
    erreur = e;
  }
  assert.ok(erreur instanceof CalculLourdEnCours);
  assert.deepEqual([erreur.reporte, erreur.statut], [true, 409]);
  assert.equal(erreur.message, 'Un autre calcul lourd tourne (banc d’essai, depuis 12 min) : celui-ci attend son tour — il sera fait à la passe suivante.');
  fin();
  const fin2 = commencerCalculLourd('forces de buts');
  fin();
  assert.equal(calculLourdEnCours()?.nom, 'forces de buts', 'rendre deux fois le premier ne rend pas le jeton du second');
  fin2();
  assert.equal(calculLourdEnCours(), null);
  await assert.rejects(avecCalculLourd('essai', async () => {
    throw new Error('panne');
  }), /panne/);
  assert.equal(calculLourdEnCours(), null, 'rendu après une erreur');
  assert.equal(await avecCalculLourd('essai', async () => 42), 42);
  assert.equal(phraseDuReport(null), 'Aucun calcul lourd en cours.');
});

test('le code : l’enfant ouvre la base en LECTURE SEULE et n’écrit rien ; le calcul (calculerLesForces) n’a aucun ordre d’écriture ; chaque processus lourd prend le jeton', () => {
  const enfant = fs.readFileSync(path.join(SRC, 'data', 'db', 'forcesButsEnfant.js'), 'utf8');
  assert.match(enfant, /new DatabaseSync\(chemin, \{ readOnly: true \}\)/);
  assert.doesNotMatch(enfant.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /\b(INSERT|UPDATE|DELETE|CREATE|DROP|BEGIN|COMMIT|REPLACE)\b|openDb/);
  const forces = fs.readFileSync(path.join(SRC, 'data', 'db', 'forcesButs.js'), 'utf8');
  const calcul = forces.slice(forces.indexOf('export function* calculerLesForces'), forces.indexOf('// ======================================================= le contrôle anti-fuite'));
  assert.ok(calcul.length > 1000);
  assert.doesNotMatch(calcul, /\b(INSERT|UPDATE|DELETE FROM|BEGIN|COMMIT)\b|\.run\(/, 'le calcul ne fait que lire');
  for (const [fichier, nom] of [['data/db/forcesButs.js', 'forces de buts'], ['data/db/bancAPart.js', 'banc d’essai'], ['data/db/valeurStatsAPart.js', 'valeur des statistiques'], ['data/db/teamStrength.js', 'indice de force'], ['data/marketKnowledge.js', 'connaissance du marché'], ['data/db/dayTable.js', 'contrôle de la table du jour J']]) {
    const source = fs.readFileSync(path.join(SRC, ...fichier.split('/')), 'utf8');
    assert.ok(source.includes(`commencerCalculLourd('${nom}')`), `${fichier} : le jeton « ${nom} »`);
  }
});
