/**
 * Étape 44 du plan — LA MÉMOIRE DE L'IA (core/ai/aiMemory.js, data/aiDossiers.js, data/repositories/aiDossiersRepository.js,
 * l'étape « dossiersIA », la route, la fiche compacte de l'avant-match).
 *   node --test test/aiMemoire.test.mjs        (depuis server/)
 *
 * Deux sortes d'essais :
 *   - PURS, dans ce processus (aucune base, aucun réseau) : le jugement d'une leçon par le carnet (confirmée, démentie,
 *     en attente, expirée, la part commune du type retirée, la fenêtre), l'état gardé (une leçon retirée ne revient
 *     jamais), le rattachement d'une leçon à son cas, le choix des 300 à 500 mots et leurs tokens ;
 *   - dans des COPIES ISOLÉES de la base d'essai (isolement.mjs), script test/aides/script-memoire-ia.mjs : la nuit (seulement
 *     les équipes qui ont joué ; atomicJson ; fichier illisible jamais écrasé ; l'étape ; la route), les homonymes
 *     (rattachement par identifiant FotMob), la fiche remise à l'IA (à la place des trois leçons) avec un Claude SIMULÉ, la
 *     note de Pierre. AUCUN appel réel à Claude ni au réseau.
 * Les valeurs attendues sont recalculées ICI, à la main, jamais recopiées d'une sortie.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import * as M from '../src/core/ai/aiMemory.js';
import { fichiersDuMoteur, MODULES_DU_MOTEUR } from '../src/core/engine/engineVersions.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-memoire-ia.mjs');
const SRC = path.join(SERVEUR, 'src');
const proche = (a, b, eps, quoi) => assert.ok(Math.abs(a - b) <= eps, `${quoi} : ${a} ≠ ${b} (± ${eps})`);

function lancer(phase) {
  const copie = preparerCopie();
  try {
    // Hors du bac (le dépôt, une copie d'essai), l'exécutable Claude de ce PC existe : un chemin qui n'existe pas, et
    // l'actualisation automatique coupée — le Claude simulé refuse sinon de s'installer.
    const r = executer(copie, SCRIPT, { args: [phase], timeout: 600_000, env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' } });
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
const homonymes = uneFois(() => lancer('homonymes'));
const fiche = uneFois(() => lancer('fiche'));

const MAINTENANT = Date.parse('2026-10-05T12:00:00.000Z');
/** Un cas réglé du carnet, à la forme de casDesAnalyses (marché du match, club 1 à domicile). */
let n = 0;
const cas = (date, p, realise, extra = {}) => ({ bloc: `m${++n}`, date, type: 'totalCorners', p, realise, homeId: 'fotmob-1', awayId: `fotmob-${900 + n}`, equipe: null, league: 'L1', ...extra });
const LECON = { id: 'a|totalCorners', bloc: 'origine', date: '2026-09-01', type: 'totalCorners', sens: -1, homeId: 'fotmob-1', awayId: 'fotmob-2', equipe: null, league: 'L1' };
const PORTEE = { cle: 'fotmob-1', genre: 'equipe', club: 'fotmob-1' };

// ------------------------------------------------------------ T1. les règles fixes, les mots, les tokens

test('T1 les règles fixées d’avance ; les mots (la ponctuation ne compte pas) ; les tokens au calibrage de l’étape 41 (1,92 caractère par token du message) ; le jour de Paris', () => {
  assert.deepEqual(M.MOTS_POUR_IA, { min: 300, max: 500 });
  assert.equal(M.CARACTERES_PAR_TOKEN, 1.92);
  assert.deepEqual(M.REGLES_LECONS.equipe, { minMatchs: 3, z: 2, ecartMin: 0.15, fenetre: 12 });
  assert.deepEqual(M.REGLES_LECONS.championnat, { minMatchs: 10, z: 2, ecartMin: 0.05, fenetre: 60 });
  assert.equal(M.REGLES_LECONS.zDementi, -1);
  assert.equal(M.REGLES_LECONS.expireApresJours, 120);
  assert.equal(M.compterMots('Leçon : [01/07, A – B] « c’est passé » · 0 fois | 80 %'), 9);
  assert.equal(M.compterMots(''), 0);
  const t = 'x'.repeat(193);
  assert.equal(M.estimerTokens(t), Math.ceil(193 / 1.92));
  assert.equal(M.jourDit('2026-10-22T23:30:00.000Z'), '23/10', 'un calcul à 1 h 30 du matin à Paris est du 23');
  assert.equal(M.jourDit('2026-10-22'), '22/10');
  assert.equal(M.jourDit('2026-10-22', { annee: true }), '22/10/2026');
  assert.equal(M.sensDuReglement(false), -1);
  assert.equal(M.sensDuReglement(true), 1);
  assert.equal(M.sensDuReglement(null), null);
});

// ------------------------------------------------------------ T2. le jugement d'une leçon par le carnet

test('T2 UNE LEÇON N’ENTRE QU’AVEC LA CONFIRMATION DU CARNET : 4 matchs suivants où le moteur se trompe encore à 80 % → confirmée (z = 4, recalculé à la main) ; 2 matchs → en attente ; la même erreur commune à tous les clubs (part du type) → pas confirmée', () => {
  const quatre = [1, 2, 3, 4].map((i) => cas(`2026-09-0${i + 1}`, 0.8, false));
  const j = M.jugerLaLecon(LECON, quatre, { genre: 'equipe', base: 0, maintenant: MAINTENANT });
  // e = −1 × (0 − 0,8 − 0) = 0,8 par cas ; z = 3,2 / √(4 × 0,16) = 4.
  assert.equal(j.etat, 'confirmee');
  proche(j.preuve.z, 4, 1e-9, 'z');
  proche(j.preuve.ecart, 0.8, 1e-9, 'écart');
  assert.deepEqual([j.preuve.matchs, j.preuve.cas, j.preuve.realises], [4, 4, 0]);
  proche(j.preuve.annonce, 0.8, 1e-9, 'annoncé');
  assert.equal(M.preuveDite(j.preuve), 'sur 4 matchs suivants, le moteur annonçait 80 % en moyenne ; c’est passé 0 fois sur 4');
  // Deux matchs seulement : en attente (même s'ils vont dans le sens de la leçon).
  assert.equal(M.jugerLaLecon(LECON, quatre.slice(0, 2), { base: 0, maintenant: MAINTENANT }).etat, 'attente');
  // Le moteur se trompe autant pour TOUS les clubs sur ce type (part commune −0,8) : rien de propre à ce club.
  const commun = M.jugerLaLecon(LECON, quatre, { base: -0.8, maintenant: MAINTENANT });
  assert.equal(commun.etat, 'incertaine');
  proche(commun.preuve.z, 0, 1e-9, 'z corrigé');
  // Deux échecs sur trois à 80 % : z = (0,8 + 0,8 − 0,2) / √0,48 = 2,02 → confirmée ; un sur trois : non.
  const deuxSurTrois = [cas('2026-09-02', 0.8, false), cas('2026-09-03', 0.8, false), cas('2026-09-04', 0.8, true)];
  proche(M.jugerLaLecon(LECON, deuxSurTrois, { base: 0, maintenant: MAINTENANT }).preuve.z, 1.4 / Math.sqrt(0.48), 1e-9, 'z 2/3');
  assert.equal(M.jugerLaLecon(LECON, deuxSurTrois, { base: 0, maintenant: MAINTENANT }).etat, 'confirmee');
  const unSurTrois = [cas('2026-09-02', 0.8, false), cas('2026-09-03', 0.8, true), cas('2026-09-04', 0.8, true)];
  assert.equal(M.jugerLaLecon(LECON, unSurTrois, { base: 0, maintenant: MAINTENANT }).etat, 'incertaine');
  // Deux échecs sur trois à 60 % : l'écart moyen (0,27) passe, mais pas le hasard (z = 0,8 / √0,72 = 0,94) → pas confirmée.
  const hasard = [cas('2026-09-02', 0.6, false), cas('2026-09-03', 0.6, false), cas('2026-09-04', 0.6, true)];
  const h = M.jugerLaLecon(LECON, hasard, { base: 0, maintenant: MAINTENANT });
  proche(h.preuve.ecart, 0.8 / 3, 1e-9, 'écart 2/3 à 60 %');
  proche(h.preuve.z, 0.8 / Math.sqrt(0.72), 1e-9, 'z 2/3 à 60 %');
  assert.equal(h.etat, 'incertaine');
});

test('T3 UNE LEÇON DÉMENTIE EST RETIRÉE, POUR DE BON : 3 matchs suivants où le pronostic passe à 70 % → démentie (z = −1,13) ; l’état gardé ne se rejuge jamais, même si les matchs suivants la confirmeraient ; une leçon confirmée qui ne l’est plus sort du dossier sans être retirée ; jamais confirmée en 120 jours ou sur toute sa fenêtre → retirée', () => {
  const trois = [2, 3, 4].map((i) => cas(`2026-09-0${i}`, 0.7, true));
  const j = M.jugerLaLecon(LECON, trois, { base: 0, maintenant: MAINTENANT });
  proche(j.preuve.z, -0.9 / Math.sqrt(0.63), 1e-9, 'z');
  assert.equal(j.etat, 'dementie');
  const retiree = M.etatSuivant(null, j, '2026-10-05');
  assert.deepEqual([retiree.etat, retiree.retireeLe, retiree.raison, retiree.change], ['dementie', '2026-10-05', 'démentie par les matchs suivants', true]);
  const { change, ...garde } = retiree;
  const confirmerait = M.jugerLaLecon(LECON, [2, 3, 4, 5].map((i) => cas(`2026-09-0${i}`, 0.8, false)), { base: 0, maintenant: MAINTENANT });
  assert.equal(confirmerait.etat, 'confirmee');
  const rejugee = M.etatSuivant(garde, confirmerait, '2026-10-06');
  assert.deepEqual([rejugee.etat, rejugee.retireeLe, rejugee.change], ['dementie', '2026-10-05', false], 'une leçon retirée ne revient jamais');
  // Confirmée le 01/10, puis plus rien de net : elle sort du dossier (incertaine), sa date de confirmation reste.
  const confirmee = M.etatSuivant(null, confirmerait, '2026-10-01');
  const { change: c2, ...gardeC } = confirmee;
  const ensuite = M.etatSuivant(gardeC, { etat: 'incertaine', preuve: null }, '2026-10-05');
  assert.deepEqual([ensuite.etat, ensuite.confirmeeLe, ensuite.retireeLe], ['incertaine', '2026-10-01', null]);
  const etats = new Map([[M.cleDePortee(LECON.id, 'fotmob-1'), ensuite]]);
  const d = M.leconsDuDossier([{ ...LECON, matchId: 'a', texte: 't', realise: false, pick: 'p', market: 'Total corners' }], 'fotmob-1', etats);
  assert.deepEqual([d.confirmees.length, d.retirees.length, d.enAttente], [0, 0, 1]);
  // Démentie APRÈS avoir été confirmée : retirée, et dit.
  const dementieApres = M.etatSuivant(gardeC, j, '2026-10-07');
  assert.equal(dementieApres.raison, 'confirmée d’abord, puis démentie par les matchs suivants');
  // Jamais confirmée : 120 jours après le match d'origine, ou sa fenêtre pleine (12 matchs) sans rien de net.
  assert.equal(M.jugerLaLecon(LECON, [], { base: 0, maintenant: Date.parse('2027-01-02T00:00:00Z') }).etat, 'expiree');
  const douze = Array.from({ length: 12 }, (_, i) => cas(`2026-09-${String(i + 2).padStart(2, '0')}`, 0.5, i % 2 === 0));
  assert.equal(M.jugerLaLecon(LECON, douze, { base: 0, maintenant: MAINTENANT }).etat, 'expiree');
  // Seuls les 12 DERNIERS matchs comptent : 20 vieux échecs ne confirment plus une leçon que les récents ne disent plus.
  const vieux = Array.from({ length: 20 }, (_, i) => cas(`2026-08-${String(i + 2).padStart(2, '0')}`, 0.8, false));
  const fen = M.jugerLaLecon({ ...LECON, date: '2026-08-01' }, [...vieux, ...douze], { base: 0, maintenant: MAINTENANT });
  assert.deepEqual([fen.preuve.matchs, fen.preuve.du], [12, '2026-09-02']);
  assert.notEqual(fen.etat, 'confirmee');
  // Championnat : 10 matchs au moins.
  assert.equal(M.jugerLaLecon(LECON, [2, 3, 4, 5].map((i) => cas(`2026-09-0${i}`, 0.8, false)), { genre: 'championnat', base: 0, maintenant: MAINTENANT }).etat, 'attente');
});

test('T4 le rattachement d’une leçon à SON cas du carnet (même analyse, même place, même marché) ; le sens lu dans le RÈGLEMENT, jamais dans le texte ; sans cas, sans identifiants ou d’avant la règle du 30/09 : jamais rattachée ; ses portées (club(s) par identifiant, championnat) ; les cas suivants sans le match d’origine', () => {
  const k = { matchId: 'A1', index: 0, market: 'Total corners', pick: 'Plus de 9.5 corners', marche: 'totalCorners', bloc: 'cle-1', date: '2026-09-01', league: 'L1', homeId: 'fotmob-1', awayId: 'fotmob-2', type: 'totalCorners', equipe: null, realise: false, p: 0.8, verdict: 'confirme' };
  const kEquipe = { ...k, index: 1, market: 'Corners — A', marche: 'teamCorners:away', type: 'teamCorners', equipe: 'away', realise: true };
  const analyses = [
    {
      matchId: 'A1',
      homeName: 'A',
      awayName: 'B',
      postMatchReview: {
        createdAt: '2026-09-02T10:00:00Z',
        marketReviews: [
          // Le bilan dit « juste », le règlement du carnet dit « pas passé » : le carnet fait foi.
          { market: 'Total corners', pick: 'Plus de 9.5 corners', minOdds: 1.2, outcome: 'juste', aiVerdict: 'confirme', lesson: '  Leçon\n une ' },
          { market: 'Corners — A', pick: 'x', minOdds: 1.2, outcome: 'juste', lesson: 'Leçon deux' },
          { market: 'Résultat', pick: 'A gagne', minOdds: null, outcome: 'faux', lesson: 'Leçon d’avant la règle' },
          { market: 'Total buts', pick: 'Plus de 2.5', minOdds: 1.2, outcome: 'faux', lesson: 'Leçon sans cas' }
        ]
      }
    },
    { matchId: 'A2', homeName: 'C', awayName: 'D', postMatchReview: { marketReviews: [{ market: 'Total corners', minOdds: 1.2, lesson: 'Club sans identifiant' }] } }
  ];
  const casSansId = { ...k, matchId: 'A2', homeId: null };
  const r = M.leconsDesAnalyses(analyses, [k, kEquipe, casSansId]);
  assert.deepEqual([r.total, r.lecons.length, r.sansCas], [4, 2, 2]);
  const [l1, l2] = r.lecons;
  assert.deepEqual([l1.id, l1.sens, l1.texte, l1.date, l1.homeId, l1.awayId], ['A1|totalCorners', -1, 'Leçon une', '2026-09-01', 'fotmob-1', 'fotmob-2']);
  assert.deepEqual(M.porteesDeLaLecon(l1).map((p) => p.cle), ['fotmob-1', 'fotmob-2', 'ligue:L1']);
  assert.deepEqual([l2.sens, l2.equipe], [1, 'away']);
  assert.deepEqual(M.porteesDeLaLecon(l2).map((p) => p.cle), ['fotmob-2', 'ligue:L1'], 'un marché d’équipe : ce seul club');
  // L'index : un cas du match compte pour ses deux clubs ; un cas d'équipe pour son seul club ; le match d'origine écarté.
  const suivant = { ...k, bloc: 'cle-2', date: '2026-09-08', matchId: 'A3' };
  const memeJour = { ...k, bloc: 'cle-3', date: '2026-09-01', matchId: 'A4' };
  const idx = M.indexDesCas([k, kEquipe, suivant, memeJour]);
  assert.deepEqual(M.casSuivants(idx, l1, { cle: 'fotmob-1' }).map((x) => x.bloc), ['cle-2']);
  assert.deepEqual(M.casSuivants(idx, l1, { cle: 'fotmob-2' }).map((x) => x.bloc), ['cle-2']);
  assert.deepEqual((idx.parCle.get('teamCorners|fotmob-1') ?? []).length, 0, 'le cas d’équipe de B ne compte pas pour A');
  proche(idx.bases.get('totalCorners'), (0 - 0.8) * 3 / 3, 1e-9, 'part commune du type');
});

// ------------------------------------------------------------ T5. les 300 à 500 mots

/** Un dossier de club complet, fabriqué. */
function dossierPlein(nom, id, { lecons = 3, longueur = 30 } = {}) {
  const derniers = Array.from({ length: 10 }, (_, i) => ({ date: `2026-09-${String(28 - 2 * i).padStart(2, '0')}`, league: 'EPL', coupe: false, adversaireId: `fotmob-${700 + i}`, adversaire: `Adversaire ${i}`, lieu: i % 2 ? 'ext' : 'dom', bp: 2, bc: i % 3, issue: i % 3 === 2 ? 'N' : 'V' }));
  return {
    club: id,
    nom,
    league: 'EPL',
    majLe: '2026-10-05T01:00:00.000Z',
    jusquAu: '2026-09-28',
    classement: { league: 'EPL', table: null, rang: 2, equipes: 20, points: 18, joues: 7, premier: { nom: 'Leader FC', points: 21 }, zone: 'Champions League' },
    series: [{ cle: 'victoires', n: 4, texte: '4 victoires de suite' }],
    forme: { derniers, bilan: { matchs: 10, v: 7, n: 3, d: 0, bp: 20, bc: 9, points: 24 }, tendance: { cinq: 2.6, avant: 2.2 }, dernierMatch: '2026-09-28' },
    entraineur: { nom: 'Entraîneur Neuf', depuis: '2026-09-01', auMoins: false, bilan: { matchs: 6, v: 5, n: 1, d: 0 }, precedent: { nom: 'Ancien', dernierMatch: '2026-08-25' }, nouveau: true },
    style: { libelle: 'possession', secondLibelle: 'coups de pied arrêtés', provisoire: false, n: 20, jour: '2026-10-04' },
    absents: { lusLe: '2026-10-04T10:00:00Z', match: { date: '2026-10-05', adversaire: 'Rival' }, liste: Array.from({ length: 4 }, (_, i) => ({ nom: `Joueur ${i}`, motif: 'injury', retour: 'Late October 2026' })) },
    carnet: { matchs: 6, pronostics: 80, justes: 55, avis: 60, tenus: 44 },
    lecons: {
      confirmees: Array.from({ length: lecons }, (_, i) => ({
        id: `${id}-L${i}`,
        date: `2026-09-1${i}`,
        match: { home: nom, away: 'Autre', homeId: id, awayId: 'fotmob-9' },
        type: i === 2 ? 'teamGoals' : 'totalCorners',
        market: i === 2 ? `Buts — ${nom}` : 'Total corners',
        pick: 'Plus de 9.5 corners',
        issue: 'faux',
        sens: -1,
        texte: Array.from({ length: longueur }, (_, w) => `mot${w}`).join(' '),
        preuve: { matchs: 4, cas: 4, annonce: 0.8, realises: 0 }
      }))
    }
  };
}
const championnatPlein = {
  league: 'EPL',
  majLe: '2026-10-05T01:00:00.000Z',
  profil: { saison: '2026-27', matchs: 69, buts: 2.9, victoiresDom: 0.45, nuls: 0.25, victoiresExt: 0.3, plus25: 0.52, deuxMarquent: 0.51, corners: 10.6, toutes: { buts: 2.8, plus25: 0.5 } },
  tete: [{ nom: 'Leader FC', points: 21, joues: 7 }, { nom: 'Deuxième', points: 18, joues: 7 }],
  carnet: { avis: 70, tenus: 52, types: [{ label: 'Total buts', avis: 14, tenus: 9 }] },
  lecons: { confirmees: [] }
};

test('T5 LE TEXTE REMIS À L’IA : 300 à 500 mots, ses tokens (1,92 caractère par token) ; les leçons d’abord (2 par dossier au plus, une par type et par sens, jamais deux fois la même) ; ce que la fiche dit déjà seulement sous le plancher ; jamais plus de 500 mots, même avec des leçons très longues ; un club sans dossier dit en une ligne', () => {
  const equipes = { home: { nom: 'Arsenal', club: 'fotmob-9825', dossier: dossierPlein('Arsenal', 'fotmob-9825') }, away: { nom: 'Leeds United', club: 'fotmob-8463', dossier: dossierPlein('Leeds United', 'fotmob-8463') } };
  const r = M.texteDesDossiersPourIA({ equipes, championnat: { league: 'EPL', dossier: championnatPlein }, contexte: { absentsConnus: { home: true, away: true }, formeConnue: { home: true, away: true } } });
  assert.ok(r.mots >= 300 && r.mots <= 500, `${r.mots} mots`);
  assert.equal(r.mots, M.compterMots(r.texte));
  assert.equal(r.tokens, Math.ceil(r.texte.length / 1.92));
  assert.ok(r.texte.startsWith(M.ENTETE_POUR_IA));
  assert.ok(r.texte.indexOf('### Arsenal (à domicile) — dossier du 05/10, matchs jusqu’au 28/09') < r.texte.indexOf('### Leeds United (à l’extérieur)'));
  assert.ok(r.texte.includes('### EPL — dossier du 05/10'));
  // Deux leçons par club, une par type et par sens : L0 (Total corners), pas L1 (Total corners encore, même sens), L2 (Buts).
  assert.deepEqual([...r.lecons].sort(), ['fotmob-8463-L0', 'fotmob-8463-L2', 'fotmob-9825-L0', 'fotmob-9825-L2']);
  assert.ok(r.texte.includes('Leçon : [10/09, Arsenal – Autre, Total corners : « Plus de 9.5 corners » faux] « mot0'), 'la leçon avec sa date et son match d’origine');
  assert.ok(r.texte.includes('confirmée par ton carnet : le moteur s’y est trompé à nouveau (sur 4 matchs suivants, le moteur annonçait 80 % en moyenne ; c’est passé 0 fois sur 4)'));
  assert.ok(r.texte.includes('Nouvel entraîneur : Entraîneur Neuf, depuis le 01/09/2026 (6 matchs : 5 V, 1 N, 0 D), après Ancien (dernier match le 25/08/2026).'));
  assert.ok(!r.texte.includes('Derniers matchs :'), 'la forme du magasin est déjà dans la fiche : pas de détail au-dessus du plancher');
  assert.ok(r.ecartes.some((e) => e.cle === 'cinqDerniers' && e.raison === 'deja-dans-la-fiche'));
  // Sans leçon, de la place sous le plafond : ce que la fiche dit déjà (absents de CE match, forme du magasin) n'entre pas
  // pour autant, le plancher étant atteint par le neuf.
  const sansLecon = { home: { ...equipes.home, dossier: dossierPlein('Arsenal', 'fotmob-9825', { lecons: 0 }) }, away: { ...equipes.away, dossier: dossierPlein('Leeds United', 'fotmob-8463', { lecons: 0 }) } };
  const r5 = M.texteDesDossiersPourIA({ equipes: sansLecon, championnat: { league: 'EPL', dossier: championnatPlein }, contexte: { absentsConnus: { home: true, away: true }, formeConnue: { home: true, away: true } } });
  assert.ok(r5.mots >= 300 && r5.mots < 450, `${r5.mots} mots`);
  assert.ok(!r5.texte.includes('Derniers matchs :') && !r5.texte.includes('Absents connus'), 'rien de redit au-dessus du plancher');
  // Sans forme ni absents dans la fiche, et des leçons courtes : le détail revient tant que le plafond le permet.
  const court = { home: { ...equipes.home, dossier: dossierPlein('Arsenal', 'fotmob-9825', { lecons: 0 }) }, away: { nom: 'X', club: null, dossier: null, raison: 'club sans identifiant FotMob sûr' } };
  const r2 = M.texteDesDossiersPourIA({ equipes: court, championnat: { league: 'Coupe', dossier: null } });
  assert.ok(r2.texte.includes('### X : pas de dossier (club sans identifiant FotMob sûr).'));
  assert.ok(r2.texte.includes('### Coupe : pas de dossier de championnat.'));
  assert.ok(r2.texte.includes('Derniers matchs : V 2-0 contre Adversaire 0 (EPL, 28/09)'));
  assert.ok(r2.mots <= 500);
  // Des leçons de 400 mots : le plafond tient, les leçons qui ne rentrent pas sont dites écartées.
  const longues = { home: { ...equipes.home, dossier: dossierPlein('Arsenal', 'fotmob-9825', { longueur: 400 }) }, away: equipes.away };
  const r3 = M.texteDesDossiersPourIA({ equipes: longues, championnat: { league: 'EPL', dossier: championnatPlein } });
  assert.ok(r3.mots <= 500, `${r3.mots} mots`);
  assert.ok(r3.ecartes.some((e) => e.cle.startsWith('lecon:') && e.raison === 'plafond'));
  // Une même leçon (même identifiant) n'est jamais citée deux fois (match du championnat ET dossier du club).
  const partagee = { ...championnatPlein, lecons: { confirmees: [equipes.home.dossier.lecons.confirmees[0]] } };
  const r4 = M.texteDesDossiersPourIA({ equipes, championnat: { league: 'EPL', dossier: partagee } });
  assert.equal(r4.lecons.filter((x) => x === 'fotmob-9825-L0').length, 1);
});

test('T5b les faits d’un club, recomptés à la main : la forme sans les matchs attribués, les séries en cours, le classement trouvé par IDENTIFIANT (jamais par le nom), l’entraîneur nouveau ou non', () => {
  const m = (date, bp, bc, extra = {}) => ({ date, league: 'L1', coupe: false, attribue: false, lieu: 'dom', adversaireId: 'fotmob-9', adversaire: 'Z', bp, bc, issue: M.issueDe(bp, bc), ...extra });
  const matchs = [m('2026-09-20', 2, 0), m('2026-09-13', 1, 0), m('2026-09-06', 3, 0, { lieu: 'ext' }), m('2026-08-30', 0, 5, { attribue: true }), m('2026-08-23', 1, 1), m('2026-08-16', 0, 2)];
  const f = M.formeDuClub(matchs);
  assert.deepEqual(f.bilan, { matchs: 5, v: 3, n: 1, d: 1, bp: 7, bc: 3, points: 10 }, 'le match attribué ne compte pas');
  assert.equal(f.derniers.length, 5);
  assert.equal(f.tendance, null, 'moins de 8 matchs : pas de tendance');
  assert.deepEqual(M.seriesDuClub(matchs).map((s) => s.texte), ['3 victoires de suite', 'n’a pas encaissé de but depuis 3 matchs']);
  const tables = [{ league: 'L1', season: 2026, table_name: 'L1', ord: 0, fetched_at: '2026-10-04T10:00:00Z', rows: [
    { rank: 1, teamId: 'fotmob-7', teamName: 'Nacional', points: 20, played: 8 },
    { rank: 4, teamId: 'fotmob-3', teamName: 'Nacional', points: 12, played: 8, description: 'Relegation' }
  ] }];
  const c = M.classementDuClub(tables, 'fotmob-3');
  assert.deepEqual([c.rang, c.points, c.premier.id, c.zone, c.table], [4, 12, 'fotmob-7', 'Relegation', null]);
  assert.equal(M.classementDit(c), '4e en L1 (sur 2) : 12 pts en 8 matchs, à 8 pts du 1er, Nacional ; zone : Relegation');
  assert.equal(M.classementDuClub(tables, 'fotmob-99'), null, 'un club absent de la table : rien, jamais un homonyme');
  const coach = (date, nom) => ({ date, coach: nom, coach_id: null });
  const recent = M.entraineurDuClub([coach('2026-09-20', 'B'), coach('2026-09-13', 'B'), coach('2026-08-01', 'A')], matchs, { maintenant: MAINTENANT });
  assert.deepEqual([recent.nom, recent.depuis, recent.nouveau, recent.precedent.nom, recent.bilan.matchs], ['B', '2026-09-13', true, 'A', 2]);
  const ancien = M.entraineurDuClub([coach('2026-09-20', 'B'), coach('2026-03-01', 'B'), coach('2026-02-01', 'A')], matchs, { maintenant: MAINTENANT });
  assert.equal(ancien.nouveau, false, 'en place depuis plus de 90 jours');
  // « Marcão » puis « Marcao » : le même homme (accents près), jamais un « nouvel entraîneur » après lui-même.
  const accents = M.entraineurDuClub([coach('2026-09-20', 'Marcão'), coach('2026-09-13', 'Marcao'), coach('2026-03-01', 'Marcão')], matchs, { maintenant: MAINTENANT });
  assert.deepEqual([accents.depuis, accents.precedent, accents.nouveau, accents.auMoins], ['2026-03-01', null, false, true]);
  const seul = M.entraineurDuClub([coach('2026-09-20', 'B')], matchs, { maintenant: MAINTENANT });
  assert.equal(seul.auMoins, true);
  assert.match(M.entraineurDit(seul), /^Entraîneur : B, en place depuis au moins le 20\/09\/2026/);
});

// ------------------------------------------------------------ T6. la nuit (copie isolée)

test('T6 LA NUIT, SEULEMENT POUR LES ÉQUIPES QUI ONT JOUÉ : la première (tout, les cas du carnet repris), une nuit sans match (rien de refait, identique à l’octet), un club qui joue (lui et son adversaire refaits, les 438 autres identiques, les leçons inchangées) ; la base jamais écrite', () => {
  const s = nuit();
  assert.equal(s.carnet.status, 'ok');
  assert.equal(s.casRepris, 52, 'les cas réglés du carnet, repris par l’étape qui suit');
  assert.equal(s.premiere.status, 'ok');
  assert.equal(s.premiere.details.mode, 'premier');
  assert.equal(s.premiere.details.casDuCarnet, true, 'les cas du carnet repris, rien relu');
  assert.equal(s.rien.details.casDuCarnet, false, 'sans le carnet dans la passe : les cas recalculés');
  assert.ok(s.premiere.details.clubs.refaits > 100, JSON.stringify(s.premiere.details.clubs));
  assert.equal(s.premiere.details.lecons.rattachees, 6);
  assert.equal(s.ecrituresBase, 0, 'la base n’est que LUE');
  assert.match(s.premiere.summary, /Aucun appel à Claude ; le moteur ne lit pas les dossiers\.$/);
  assert.equal(s.rien.details.mode, 'rien');
  assert.equal(s.rien.details.clubs.refaits, 0);
  assert.equal(s.rienIdentique, true);
  assert.match(s.rien.summary, /^Rien à refaire : aucune équipe n'a joué depuis la nuit d'avant/);
  assert.equal(s.joue.details.mode, 'nuit');
  assert.equal(s.joue.details.clubs.refaits, 2);
  assert.deepEqual([...s.changes].sort(), [s.X, s.plantes.C.club].sort(), 'seulement le club qui a joué et son adversaire');
  assert.deepEqual(s.disparus, []);
  assert.deepEqual(s.liguesChangees, ['Essai League']);
  assert.deepEqual(s.leconsChangees, [], 'les leçons des autres clubs ne sont pas rejugées');
  assert.deepEqual([s.cApres.jusquAu, s.cApres.dernier.adversaireId, s.cApres.dernier.score ?? `${s.cApres.dernier.bp}-${s.cApres.dernier.bc}`], ['2026-09-29', s.X, '2-1']);
});

test('T7 les leçons plantées : C CONFIRMÉE (4 matchs suivants, 0 passé sur 4 à 80 %, z recalculé), D DÉMENTIE et retirée pour de bon (même quand ses matchs suivants la confirmeraient ensuite), E en attente (jamais dans le dossier) ; chacune garde sa date et son match d’origine', () => {
  const s = nuit();
  const C = s.f1.equipes[s.plantes.C.club];
  const D = s.f1.equipes[s.plantes.D.club];
  const E = s.f1.equipes[s.plantes.E.club];
  assert.equal(C.lecons.confirmees.length, 1);
  const l = C.lecons.confirmees[0];
  const m1 = s.plantes.C.matchs[0];
  assert.deepEqual([l.id, l.date, l.match.home, l.match.away, l.match.homeId, l.match.awayId], ['essai-C-0|totalCorners', m1.date, m1.homeName, m1.awayName, m1.homeId, m1.awayId]);
  assert.equal(l.texte, 'Leçon C : sur les corners, le moteur surestime ce club ; se méfier du « plus » même à 80 %.');
  assert.deepEqual([l.etat, l.confirmeeLe, l.preuve.matchs, l.preuve.realises], ['confirmee', '2026-10-05', 4, 0]);
  // La part commune de « Total corners » sur les 52 cas plantés : C 5 échecs, D 1 échec + 3 passés à 70 %, E 1 échec + 2 passés, volume 32 passés / 8 échecs à 80 %.
  const base = (5 * -0.8 + -0.8 + 3 * 0.3 + -0.8 + 2 * 0.2 + 32 * 0.2 + 8 * -0.8) / 52;
  proche(l.preuve.base, base, 1e-9, 'part commune');
  proche(l.preuve.z, (4 * (0.8 + base)) / Math.sqrt(4 * 0.16), 1e-9, 'z de C');
  assert.deepEqual([D.lecons.confirmees.length, D.lecons.retirees.length], [0, 1]);
  assert.deepEqual([D.lecons.retirees[0].etat, D.lecons.retirees[0].raison], ['dementie', 'démentie par les matchs suivants']);
  proche(D.lecons.retirees[0].preuve.z, (3 * -(0.3 - base)) / Math.sqrt(3 * 0.21), 1e-9, 'z de D');
  assert.deepEqual([E.lecons.confirmees.length, E.lecons.retirees.length, E.lecons.enAttente], [0, 0, 1]);
  // D a joué, ses matchs suivants diraient maintenant le contraire : la leçon reste retirée.
  assert.equal(s.sansEtatGarde, 'confirmee', 'sans l’état gardé, elle serait confirmée');
  assert.equal(s.f4.lecons[`essai-D-0|totalCorners@${s.plantes.D.club}`].etat, 'dementie');
  assert.deepEqual(s.f4.d.lecons.confirmees, []);
  assert.deepEqual(s.f4.d.lecons.retirees.map((x) => x.id), ['essai-D-0|totalCorners']);
});

test('T8 L’ÉCRITURE PAR atomicJson : aucun fichier temporaire laissé ; un fichier ILLISIBLE n’est jamais écrasé (l’étape lève, le fichier reste à l’octet, une analyse ne reçoit aucun dossier) ; le code passe par utils/atomicJson.js', () => {
  const s = nuit();
  assert.deepEqual(s.tmpRestants, []);
  assert.deepEqual([s.illisible.leve, s.illisible.nom, s.illisible.intact, s.illisible.lecture], [true, 'DossiersIllisibles', true, 'illisible']);
  assert.deepEqual([s.illisible.pourUneAnalyse.etat, s.illisible.pourUneAnalyse.home], ['illisible', null]);
  const repo = fs.readFileSync(path.join(SRC, 'data', 'repositories', 'aiDossiersRepository.js'), 'utf8');
  assert.match(repo, /import \{ readJsonFile, writeJsonAtomic \} from '\.\.\/\.\.\/utils\/atomicJson\.js';/);
  assert.match(repo, /writeJsonAtomic\(fichier, donnees, \{ indent: 0 \}\)/);
  assert.doesNotMatch(repo.replace(/\/\*[\s\S]*?\*\//g, ''), /writeFileSync|renameSync/);
  assert.match(repo, /data\/runtime\/ai-dossiers\.json/);
  const nuitJs = fs.readFileSync(path.join(SRC, 'data', 'aiDossiers.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(nuitJs, /writeFileSync|writeJsonAtomic|INSERT |UPDATE |DELETE /, 'la nuit n’écrit que par le dépôt');
});

test('T9 l’étape « dossiersIA » : juste après le carnet de l’IA, avant le bulletin et le contrôle quotidien ; due une fois par jour ou au clic ; la route lit par identifiant (un nom refusé), 503 sur un fichier illisible', () => {
  const s = nuit();
  const i = s.etapes.indexOf('dossiersIA');
  assert.equal(s.etapes[i - 1], 'carnetIA');
  assert.equal(s.etapes[i + 1], 'bulletin');
  assert.equal(s.etapes.at(-1), 'controleQuotidien');
  assert.deepEqual(s.due, { jamais: true, aujourdhui: false, manuel: true });
  assert.equal(s.route.club.code, 200);
  assert.deepEqual([s.route.club.corps.etat, s.route.club.corps.club, s.route.club.corps.dossier, s.route.club.corps.championnat], ['lu', s.plantes.C.club, true, true]);
  assert.ok(s.route.club.corps.texteIA.texte.includes('Leçon : ['));
  assert.equal(s.route.club.corps.texteIA.mots, M.compterMots(s.route.club.corps.texteIA.texte));
  assert.equal(s.route.nom.code, 400);
  assert.match(s.route.nom.corps.error, /jamais par le nom/);
  assert.equal(s.route.rien.code, 400);
  assert.deepEqual([s.route.inconnu.code, s.route.inconnu.corps.dossier], [200, null]);
  assert.equal(s.route.illisible.code, 503);
});

// ------------------------------------------------------------ T10. homonymes

test('T10 LE RATTACHEMENT PAR IDENTIFIANT FotMob : les deux « Nacional » (Paraguay, Portugal) chacun le sien, jamais sans championnat ; Porto ≠ Portsmouth ≠ Shanghai Port ; Leeds United ≠ DC United ; deux sources contradictoires ou un même club des deux côtés : aucun dossier pris au hasard — alors que le rapprocheur souple les confond', () => {
  const s = homonymes();
  assert.deepEqual(s.souple, { leedsDc: true, portPorto: true }, 'le piège est réel dans cette base');
  assert.deepEqual(s.cas.nacionalParaguay.slice(0, 2), ['fotmob-49689', 'fotmob-1242560']);
  assert.deepEqual(s.cas.nacionalPortugal.slice(0, 2), ['fotmob-10214', 'fotmob-9773']);
  assert.equal(s.cas.nacionalSansLigue[0], null);
  assert.match(s.cas.nacionalSansLigue[2], /sans identifiant FotMob sûr/);
  assert.equal(s.cas.porto[0], 'fotmob-9773');
  assert.equal(s.cas.portsmouth[0], 'fotmob-8462');
  assert.equal(s.cas.portChine[0], 'fotmob-198616');
  assert.equal(s.cas.leeds[0], 'fotmob-8463');
  assert.equal(s.cas.contradiction[0], null);
  assert.match(s.cas.contradiction[2], /deux sources donnent deux clubs différents/);
  assert.deepEqual(s.cas.memeClub.slice(0, 2), [null, null]);
  const [paraguay, portugal] = s.nacionaux;
  assert.deepEqual([paraguay.league, portugal.league], ['División Profesional - Paraguay', 'Primeira Liga - Portugal']);
  assert.equal(paraguay.adversaires.filter((a) => portugal.adversaires.includes(a)).length, 0, 'aucun match de l’un dans le dossier de l’autre');
  assert.equal(s.memoireParaguay.home.id, 'fotmob-49689');
  // Correctif du 28/10/2026 (D3) : « 4e en … » (et plus « 4e de … ») dans le classement du dossier.
  assert.ok(s.memoireParaguay.texte.includes('en División Profesional - Paraguay'));
  assert.ok(!s.memoireParaguay.texte.includes('Primeira Liga'));
});

// ------------------------------------------------------------ T11. la fiche remise à l'IA

test('T11 LE TEXTE REMIS À L’IA À LA PLACE DES 3 LEÇONS : sans dossiers, la fiche d’avant (les trois dernières leçons, dont une démentie et une jamais confirmée) ; avec, la section « dossiers » (la seule leçon confirmée, sa date et son match) et l’expérience sans leçons ; consignes fixes inchangées ; mots et tokens recomptés', () => {
  const s = fiche();
  assert.equal(s.sans.memoire, null);
  assert.ok(!s.sans.user.includes('## dossiers'));
  assert.ok(s.sans.user.includes('## experience — ton bilan par type de marché et tes dernières leçons'));
  assert.ok(s.sans.user.includes('Matchs des leçons : '));
  assert.ok(s.sans.user.includes('Leçon D : le total de corners de ce club déçoit'), 'avant : la leçon démentie était redonnée');
  assert.ok(s.sans.user.includes('Leçon E : à confirmer'), 'avant : la leçon jamais confirmée aussi');
  const m = s.avec.memoire;
  assert.ok(m, 'la mémoire est lue');
  assert.ok(s.avec.user.includes(`\n\n${m.texte}\n\n## experience — ton bilan par type de marché (tes leçons confirmées sont dans les dossiers)`));
  assert.ok(!s.avec.user.includes('Matchs des leçons : '));
  assert.ok(!s.avec.user.includes('Leçon D :') && !s.avec.user.includes('Leçon E :'), 'ni la démentie, ni celle en attente');
  assert.equal((s.avec.user.match(/Leçon C : sur les corners/g) ?? []).length, 1);
  assert.deepEqual(m.lecons, ['essai-C-0|totalCorners']);
  assert.equal(m.mots, M.compterMots(m.texte));
  assert.equal(m.tokens, Math.ceil(m.texte.length / 1.92));
  assert.ok(m.mots <= 500);
  assert.deepEqual([m.equipes.home.id, m.equipes.away.id], [s.club.C, s.club.adv]);
  assert.equal(s.memoireDirecte.texte.length > 0, true);
  assert.equal(s.sans.system, s.avec.system, 'les consignes fixes ne changent pas (le cache de Claude)');
  assert.deepEqual(s.sans.engineSummary, s.avec.engineSummary, 'le résumé du moteur ne bouge pas');
});

test('T12 L’ANALYSE ENREGISTRÉE, CLAUDE SIMULÉ : le message reçu porte les dossiers ; l’analyse garde ce que la mémoire a remis (mots, tokens, leçons citables, clubs reconnus) sans le texte ; la réponse simulée cite la leçon par sa date et son match', () => {
  const s = fiche();
  assert.equal(s.simule.recus, 1);
  assert.ok(s.simule.message.includes('## dossiers — ta mémoire, tenue par le code'));
  assert.deepEqual(Object.keys(s.simule.memoire).sort(), ['championnat', 'dossiersDu', 'equipes', 'lecons', 'mots', 'tokens']);
  assert.deepEqual(s.simule.memoire.lecons, ['essai-C-0|totalCorners']);
  assert.equal(s.simule.memoire.equipes.home.id, s.club.C);
  assert.match(s.simule.resume, /^Je m’appuie sur la leçon du \d{2}\/\d{2} \(.+ – .+\)/);
  assert.equal('memoire' in (s.simule.engineSnapshot ?? {}), false, 'jamais dans le résumé du moteur');
});

test('T13 LA NOTE DE PIERRE N’ENTRE JAMAIS DANS LES CHIFFRES : une seule fois dans la fiche, dans sa section ; jamais dans les dossiers ni dans le fichier ; aucun fichier du moteur ni de la mémoire ne lit les notes', () => {
  const s = fiche();
  assert.equal(s.avec.user.split(s.note).length - 1, 1);
  assert.ok(s.avec.user.includes(`## userNote — note de Pierre, écrite le 2026-10-04T18:00:00.000Z : ${s.note}`));
  assert.ok(!s.avec.memoire.texte.includes('NOTE-DE-PIERRE'));
  assert.ok(!s.fichierDossiers.includes('NOTE-DE-PIERRE'));
  const sansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  for (const f of ['core/ai/aiMemory.js', 'data/aiDossiers.js', 'data/repositories/aiDossiersRepository.js', ...fichiersDuMoteur()]) {
    assert.doesNotMatch(sansCommentaires(path.join(SRC, f)), /matchNotesRepository|match-notes|getMatchNote/, f);
  }
});

// ------------------------------------------------------------ T14. le moteur ne lit pas les dossiers

const codeSansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
function atteints(depart) {
  const vus = new Set();
  const pile = [...depart];
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f) || !fs.existsSync(f)) continue;
    vus.add(f);
    const texte = fs.readFileSync(f, 'utf8');
    for (const m of texte.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) pile.push(path.resolve(path.dirname(f), m[1]));
  }
  return vus;
}

test('T14 LE MOTEUR NE LIT PAS LES DOSSIERS : aucun fichier de l’empreinte du moteur n’atteint (même de loin) la mémoire ; ces modules sont HORS de l’empreinte ; aucun fichier du moteur ne nomme le fichier ; les règles de la mémoire sont pures (ni base, ni horloge, ni réseau)', () => {
  const duMoteur = fichiersDuMoteur().map((rel) => path.join(SRC, rel));
  assert.ok(duMoteur.length > 20);
  const graphe = [...atteints(duMoteur)].map((f) => path.relative(SRC, f).split(path.sep).join('/'));
  for (const interdit of ['core/ai/aiMemory.js', 'data/aiDossiers.js', 'data/repositories/aiDossiersRepository.js', 'api/controllers/aiDossiers.controller.js']) {
    assert.ok(!graphe.includes(interdit), `${interdit} atteint depuis le moteur`);
    assert.ok(!fichiersDuMoteur().includes(interdit), `${interdit} dans l’empreinte`);
    for (const d of MODULES_DU_MOTEUR.dossiers) assert.ok(!interdit.startsWith(`${d}/`), `${interdit} dans ${d}`);
  }
  for (const f of duMoteur) assert.doesNotMatch(codeSansCommentaires(f), /ai-dossiers|aiDossiers|aiMemory|dossiersPour|memoireDuMatch/, path.relative(SRC, f));
  const pur = codeSansCommentaires(path.join(SRC, 'core', 'ai', 'aiMemory.js'));
  assert.doesNotMatch(pur, /^import /m, 'aucune dépendance');
  assert.doesNotMatch(pur, /Date\.now\(\)|new Date\(\)|fetch\(|openDb|DatabaseSync|readFileSync/);
});

// ------------------------------------------------------------ T15. le script de l'analyse réelle (chez Pierre)

test('T15 le script de l’analyse RÉELLE à faire chez Pierre (scripts/essai-dossier-ia.mjs) : sans --accord-de-pierre, AUCUN appel d’analyse (lectures seulement) ; avec, UNE seule demande au serveur ; jamais une autre adresse que ce PC ; il dit si l’analyse cite une leçon', async () => {
  const E = await import('../scripts/essai-dossier-ia.mjs');
  assert.deepEqual(E.lireOptions(['--accord-de-pierre', '--match', 'abc']), { accord: true, matchId: 'abc', serveur: 'http://localhost:4000' });
  assert.deepEqual(E.lireOptions([]).accord, false);
  const texteMemoire = 'Leçon : [01/07, LDU de Quito – Orense, Total corners : « Plus de 8.5 corners » faux] « … »';
  const memoire = { texte: texteMemoire, mots: 320, tokens: 1000, lecons: ['x'], equipes: { home: { dossier: true }, away: { dossier: true } } };
  const fauxFetch = (journal) => async (url, opts = {}) => {
    journal.push(`${opts.method ?? 'GET'} ${url}`);
    const corps = url.includes('/status')
      ? { connected: true }
      : url.includes('/matches?')
        ? { matches: [{ matchId: 'm1', home: 'LDU de Quito', away: 'Orense', league: 'Serie A - Ecuador', commenceTime: '2026-10-06T00:00:00.000Z' }] }
        : url.includes('/dossiers/apercu')
          ? { etat: 'lu', memoire }
          : url.includes('/analysis/match/')
            ? { label: 'essai' }
            : { usage: { input_tokens: 2, cache_creation_input_tokens: 9000, cache_read_input_tokens: 5000, output_tokens: 3000 }, memoire: { mots: 320 }, analysis: { summary: 'Selon la leçon du 01/07 (LDU de Quito – Orense)…' } };
    return { ok: true, status: 200, json: async () => corps };
  };
  const sortie = [];
  const j1 = [];
  const a = await E.essai({ fetch: fauxFetch(j1), accord: false, ecrire: (l) => sortie.push(l), maintenant: Date.parse('2026-10-05T12:00:00Z') });
  assert.equal(a.etape, 'apercu');
  assert.ok(j1.every((x) => x.startsWith('GET ')), 'sans accord : des lectures seulement');
  assert.ok(!j1.some((x) => x.includes('/analysis/match/')), 'sans accord : même pas le moteur');
  assert.ok(sortie.some((l) => l.includes('APERÇU SEULEMENT : aucun appel à Claude')));
  const j2 = [];
  const b = await E.essai({ fetch: fauxFetch(j2), accord: true, ecrire: () => {}, maintenant: Date.parse('2026-10-05T12:00:00Z') });
  assert.equal(j2.filter((x) => x.startsWith('POST ')).length, 1, 'avec accord : UNE seule analyse');
  assert.equal(b.analyse.tokens, 17002);
  assert.deepEqual(b.analyse.cite.lecons, [{ jour: '01/07', match: 'LDU de Quito – Orense' }]);
  await assert.rejects(E.essai({ fetch: fauxFetch([]), serveur: 'https://exemple.com' }), /ne parle qu’à l’appli de ce PC/);
});
