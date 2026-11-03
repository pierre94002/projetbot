/**
 * LES CHIFFRES DES JOUEURS (étape 34, lot 1a, 03/11/2026) — le règlement à blanc et les relevés (purs).
 *   node --test test/joueursRegle.test.mjs        (depuis server/)
 *
 * T-R1 chaque marché × chaque statut (gagné, perdu, remboursé, en attente, non réglable) sur des matchs fabriqués ;
 * T-R2 joueur 0 et saisie par nom → non réglable ; identifiant fusionné (people_merges) → lu sous le nouvel identifiant
 *      (le lecteur : numeroApresFusion, derouleNormalise) ;
 * T-R3 csc : ne compte pas pour le buteur ; compte au camp crédité dans « buteurs relevés » ;
 * T-R4 prolongation : marque et averti à la 90e (90+x compris) ; tirs cadrés et passeur en attente ;
 * T-R5 non-partant (banc non entré, titulaire sans minute), match attribué → remboursé ; joueur absent de la compo LUE
 *      avant le match → non réglable (critique, constat 20.3) ;
 * T-R6 feuille douteuse ou buteurs non relevés → « perdu » attend, « gagné » non (critique, constat 20.1) ;
 * T-R7 averti : jaune, deuxième jaune, rouge direct → averti ; « not_on_pitch » compté par le MODÈLE (relevesDUnCamp),
 *      écarté par le RÈGLEMENT ; cartons non relevés → en attente ;
 * T-R8 tirs cadrés : NULL → 0 seulement si le camp est relevé ; players.shots n'est JAMAIS lu (recherche dans data/joueurs/) ;
 * T-R9 passes : players.assists, relevées par l'égalité de comptes (critique, constat 4) ; le NOM du passeur du déroulé
 *      n'est jamais gardé ni lu (seule sa présence : avecPasseur) ; ni rapprochement de noms, ni teamNamesLikelyMatch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reglerUnJoueur, relevesDeLaRencontre, MARCHES_JOUEURS, STATUTS_REGLEMENT } from '../src/data/joueurs/reglementJoueurs.js';
import { relevesDUnCamp } from '../src/data/joueurs/formulesDesJoueurs.js';
import { numeroApresFusion, derouleNormalise, ligneNormalisee } from '../src/data/joueurs/lectureDesJoueurs.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const JOUEURS = path.join(ICI, '..', 'src', 'data', 'joueurs');
/** Le code sans ses commentaires (les commentaires DISENT ce qui n'est jamais lu ; seul le code compte). */
const code = (t) => t.replace(new RegExp('/[*][^]*?[*]/', 'g'), '').replace(new RegExp('(^|[^:])//.*$', 'gm'), '$1');
const L = (o) => ({ id: 10, titulaire: true, poste: 4, minutes: 90, entre: false, xg: null, xgnp: null, shotsOnTarget: null, assists: null, xa: null, rating: 7, touches: 40, passes: 25, ...o });

/** Une rencontre fabriquée : camp home (joueurs 10, 11, 12 ; 13 remplaçant non entré), camp away (20, 21). */
function rencontre(o = {}) {
  return {
    statut: 'jouee',
    prolongation: false,
    cartonsReleves: true,
    douteuse: false,
    evenements: [
      { type: 'goal', side: 'home', minute: 12, playerId: 10, ownGoal: false, penalty: false, avecPasseur: true },
      { type: 'goal', side: 'home', minute: 50, playerId: 21, ownGoal: true },
      { type: 'goal', side: 'away', minute: 77, playerId: 20, ownGoal: false, penalty: true },
      { type: 'card', side: 'home', minute: 30, playerId: 11, card: 'yellow' },
      { type: 'card', side: 'away', minute: 88, playerId: 21, card: 'yellow', notOnPitch: true },
      { type: 'card', side: 'away', minute: 90, addedTime: 6, playerId: 20, card: 'red' },
      ...(o.evenementsEnPlus ?? [])
    ],
    camps: {
      home: {
        buts90: 2,
        cadresDEquipe: 3,
        lignes: [L({ id: 10, shotsOnTarget: 2 }), L({ id: 11, poste: 3, assists: 1, shotsOnTarget: 1 }), L({ id: 12, poste: 2 }), L({ id: 13, titulaire: false, minutes: null })]
      },
      away: { buts90: 1, cadresDEquipe: 1, lignes: [L({ id: 20, shotsOnTarget: 1 }), L({ id: 21, poste: 2 })] }
    },
    ...o
  };
}

test('T-R1 chaque marché × chaque statut sur des matchs fabriqués', () => {
  const r = rencontre();
  const vus = new Set();
  const regler = (marche, joueur, x = r, ligne = 1, compoLue = null) => {
    const s = reglerUnJoueur({ marche, ligne, joueur, rencontre: x, compoLue });
    vus.add(`${marche}:${s.statut}`);
    return s.statut;
  };
  assert.equal(regler('marque', 10), 'gagne');
  assert.equal(regler('marque', 11), 'perdu');
  assert.equal(regler('marque', 13), 'rembourse');
  assert.equal(regler('marque', 0), 'non-reglable');
  assert.equal(regler('marque', 11, { ...r, douteuse: true }), 'en-attente');
  assert.equal(regler('cadres', 10, r, 2), 'gagne');
  assert.equal(regler('cadres', 12), 'perdu');
  assert.equal(regler('cadres', 13), 'rembourse');
  assert.equal(regler('cadres', 0), 'non-reglable');
  assert.equal(regler('cadres', 10, { ...r, prolongation: true }), 'en-attente');
  assert.equal(regler('averti', 11), 'gagne');
  assert.equal(regler('averti', 10), 'perdu');
  assert.equal(regler('averti', 13), 'rembourse');
  assert.equal(regler('averti', 0), 'non-reglable');
  assert.equal(regler('averti', 10, { ...r, cartonsReleves: false }), 'en-attente');
  assert.equal(regler('passeur', 11), 'gagne');
  assert.equal(regler('passeur', 10), 'perdu');
  assert.equal(regler('passeur', 13), 'rembourse');
  assert.equal(regler('passeur', 0), 'non-reglable');
  assert.equal(regler('passeur', 11, { ...r, prolongation: true }), 'en-attente');
  for (const m of MARCHES_JOUEURS) for (const s of STATUTS_REGLEMENT) assert.ok(vus.has(`${m}:${s}`), `${m} × ${s}`);
  assert.throws(() => reglerUnJoueur({ marche: 'premier-buteur', joueur: 10, rencontre: r }), /marché inconnu/);
});

test('T-R2 joueur sans identifiant → non réglable ; l’identifiant fusionné (people_merges) est lu sous le nouvel identifiant, jamais par le nom', () => {
  assert.equal(reglerUnJoueur({ marche: 'marque', joueur: 'Joueur 10', rencontre: rencontre() }).statut, 'non-reglable');
  assert.equal(reglerUnJoueur({ marche: 'marque', joueur: null, rencontre: rencontre() }).statut, 'non-reglable');
  const fusion = new Map([['fotmob-500', 'fotmob-777']]);
  assert.equal(numeroApresFusion('fotmob-500', fusion), 777);
  assert.equal(numeroApresFusion('fotmob-501', fusion), 501);
  assert.equal(numeroApresFusion('Kylian', fusion), null, 'un nom n’est jamais un identifiant');
  assert.equal(numeroApresFusion(null, fusion), null);
  const ev = derouleNormalise(JSON.stringify([{ type: 'goal', side: 'home', minute: 3, player: 'Ancien Nom', playerId: 'fotmob-500', assist: 'Quelqu’un' }]), fusion);
  assert.equal(ev[0].playerId, 777);
  assert.equal(ev[0].avecPasseur, true);
  assert.equal(ev[0].assist, undefined, 'le nom du passeur n’est pas gardé');
  assert.equal(ev[0].player, undefined, 'le nom du buteur n’est pas gardé');
  const l = ligneNormalisee({ player_id: 'fotmob-500', starter: 1, minutes: 90, position: 'Forward', name: 'X' }, fusion);
  assert.equal(l.id, 777);
  assert.equal(l.name, undefined);
  // Un homonyme sans identifiant n'hérite de rien : aucun nom n'est rapproché.
  const r = rencontre();
  r.camps.home.lignes.push(L({ id: null, titulaire: false, minutes: 10 }));
  assert.equal(reglerUnJoueur({ marche: 'marque', joueur: 10, rencontre: r }).statut, 'gagne');
});

test('T-R3 contre son camp : jamais au buteur ; crédité au camp dans « buteurs relevés »', () => {
  const r = rencontre();
  // Le csc (playerId 21, camp away) est au camp home : il ne compte ni pour 21 ni pour un joueur de home.
  assert.equal(reglerUnJoueur({ marche: 'marque', joueur: 21, rencontre: r }).statut, 'perdu');
  const rel = relevesDeLaRencontre(r);
  assert.equal(rel.home.releves.buteurs, true, 'déroulé (1 but + 1 csc) = score (2)');
  assert.equal(rel.home.equipe.csc, 1);
  assert.equal(rel.home.parJoueur.get(10).buts, 1);
  const sansCsc = rencontre({ evenements: rencontre().evenements.filter((e) => !e.ownGoal) });
  assert.equal(relevesDeLaRencontre(sansCsc).home.releves.buteurs, false, 'sans le csc, le déroulé (1) ≠ le score (2)');
});

test('T-R4 prolongation : marque et averti sur le temps réglementaire (90 + x compris) ; tirs cadrés et passes en attente', () => {
  const r = rencontre({ prolongation: true, evenementsEnPlus: [{ type: 'goal', side: 'home', minute: 105, playerId: 12, ownGoal: false }, { type: 'card', side: 'home', minute: 112, playerId: 12, card: 'yellow' }] });
  assert.equal(reglerUnJoueur({ marche: 'marque', joueur: 12, rencontre: r }).statut, 'perdu', 'un but de la prolongation ne compte pas');
  assert.equal(reglerUnJoueur({ marche: 'averti', joueur: 12, rencontre: r }).statut, 'perdu', 'un carton de la prolongation ne compte pas');
  assert.equal(reglerUnJoueur({ marche: 'averti', joueur: 20, rencontre: r }).statut, 'gagne', 'un carton à 90+6 compte (règle unique de la 33)');
  assert.equal(reglerUnJoueur({ marche: 'cadres', joueur: 10, rencontre: r }).statut, 'en-attente');
  assert.equal(reglerUnJoueur({ marche: 'passeur', joueur: 11, rencontre: r }).statut, 'en-attente');
});

test('T-R5 non-partant et match attribué → remboursé ; un joueur absent de la compo lue avant le match → non réglable', () => {
  const r = rencontre();
  assert.equal(reglerUnJoueur({ marche: 'marque', joueur: 13, rencontre: r }).statut, 'rembourse', 'banc non entré');
  r.camps.home.lignes.push(L({ id: 14, titulaire: true, minutes: 0 }));
  assert.equal(reglerUnJoueur({ marche: 'marque', joueur: 14, rencontre: r }).statut, 'rembourse', 'titulaire sans minute');
  for (const statut of ['attribuee', 'annulee', 'reportee']) assert.equal(reglerUnJoueur({ marche: 'cadres', joueur: 10, rencontre: { ...r, statut } }).statut, 'rembourse', statut);
  assert.equal(reglerUnJoueur({ marche: 'marque', joueur: 99, rencontre: r, compoLue: new Set([10, 11, 12]) }).statut, 'non-reglable');
  assert.equal(reglerUnJoueur({ marche: 'marque', joueur: 13, rencontre: r, compoLue: new Set([10, 11, 12, 13]) }).statut, 'rembourse');
});

test('T-R6 feuille douteuse ou buteurs non relevés : « perdu » attend, « gagné » non', () => {
  const r = rencontre({ douteuse: true });
  assert.equal(reglerUnJoueur({ marche: 'marque', joueur: 10, rencontre: r }).statut, 'gagne');
  const s = reglerUnJoueur({ marche: 'marque', joueur: 12, rencontre: r });
  assert.equal(s.statut, 'en-attente');
  // Un buteur coéquipier sans identifiant : la camp n'est pas relevé ; son but suffit pour « gagné », pas pour « perdu ».
  const x = rencontre({ evenementsEnPlus: [{ type: 'goal', side: 'home', minute: 60, playerId: null, ownGoal: false }] });
  x.camps.home.buts90 = 3;
  assert.equal(relevesDeLaRencontre(x).home.releves.buteurs, false);
  assert.equal(reglerUnJoueur({ marche: 'marque', joueur: 10, rencontre: x }).statut, 'gagne');
  const y = reglerUnJoueur({ marche: 'marque', joueur: 12, rencontre: x });
  assert.equal(y.statut, 'en-attente');
  assert.match(y.raison, /déroulé 3, score 3|buteurs non relevés/);
});

test('T-R7 averti : jaune, deuxième jaune, rouge → averti ; « not_on_pitch » compté par le MODÈLE, écarté par le RÈGLEMENT ; cartons non relevés → en attente', () => {
  const r = rencontre({ evenementsEnPlus: [{ type: 'card', side: 'home', minute: 40, playerId: 12, card: 'yellowred' }] });
  assert.equal(reglerUnJoueur({ marche: 'averti', joueur: 12, rencontre: r }).statut, 'gagne');
  assert.equal(reglerUnJoueur({ marche: 'averti', joueur: 20, rencontre: r }).statut, 'gagne', 'rouge direct');
  assert.equal(reglerUnJoueur({ marche: 'averti', joueur: 21, rencontre: r }).statut, 'perdu', 'un carton « not_on_pitch » ne compte pas au règlement');
  const modele = relevesDUnCamp({ lignes: r.camps.away.lignes, evenements: r.evenements, camp: 'away', butsDuCamp: 1, cadresDEquipe: 1, cartonsReleves: true });
  assert.equal(modele.parJoueur.get(21).x.av, 1, 'le modèle le compte (règle unique de la 33)');
  assert.equal(reglerUnJoueur({ marche: 'averti', joueur: 10, rencontre: { ...r, cartonsReleves: false } }).statut, 'en-attente');
});

test('T-R8 tirs cadrés : NULL → 0 seulement si le camp est relevé ; players.shots n’est jamais lu dans data/joueurs/', () => {
  const r = rencontre();
  assert.equal(reglerUnJoueur({ marche: 'cadres', joueur: 12, rencontre: r }).valeur, 0);
  const nonReleve = rencontre();
  nonReleve.camps.home.cadresDEquipe = 9;
  assert.equal(reglerUnJoueur({ marche: 'cadres', joueur: 12, rencontre: nonReleve }).statut, 'en-attente');
  const rel = relevesDUnCamp({ lignes: nonReleve.camps.home.lignes, evenements: [], camp: 'home', butsDuCamp: 0, cadresDEquipe: 9, cartonsReleves: false });
  assert.equal(rel.parJoueur.get(12).x.sot, null);
  assert.equal(rel.parJoueur.get(12).cadres, null);
  // playerStats vide (aucune statistique publiée) : jamais relevé, même à 0 tir cadré d'équipe.
  const vide = relevesDUnCamp({ lignes: [L({ id: 1, rating: null, touches: null, passes: null })], evenements: [], camp: 'home', butsDuCamp: 0, cadresDEquipe: 0, cartonsReleves: false });
  assert.equal(vide.releves.cadres, false);
  for (const f of fs.readdirSync(JOUEURS)) {
    const t = code(fs.readFileSync(path.join(JOUEURS, f), 'utf8'));
    assert.ok(!/\bp\.shots\b|['"`]shots['"`]|\.shots\b(?!_)|\bshots,|yellow_cards|player_day|\bjaunes\b|shotmap/.test(t.replace(/shots_on_target|shotsOnTarget|shots_on_goal/g, '')), `${f} ne lit ni players.shots, ni les cartons des lignes joueur, ni player_day, ni la carte des tirs`);
  }
});

test('T-R9 passes : la colonne, relevée par l’égalité de comptes ; le NOM du passeur n’est jamais gardé ni lu ; aucun rapprochement de noms', () => {
  const r = rencontre();
  const rel = relevesDeLaRencontre(r);
  assert.equal(rel.home.releves.passes, true, 'Σ passes (1) = buts non csc avec passeur (1)');
  const faux = rencontre();
  faux.camps.home.lignes[1].assists = 2;
  assert.equal(relevesDeLaRencontre(faux).home.releves.passes, false);
  assert.equal(reglerUnJoueur({ marche: 'passeur', joueur: 11, rencontre: faux }).statut, 'en-attente');
  for (const f of fs.readdirSync(JOUEURS)) {
    const t = code(fs.readFileSync(path.join(JOUEURS, f), 'utf8'));
    assert.ok(!/teamNamesLikelyMatch|nomNormalise|sharesNameToken|\.name\b|\.player\b(?!Id)/.test(t), `${f} : aucun nom lu ni rapproché`);
    const assists = t.match(/e\.assist\b/g) ?? [];
    assert.ok(f === 'lectureDesJoueurs.js' ? assists.length === 2 : assists.length === 0, `${f} : le passeur du déroulé n’est lu que pour sa présence (avecPasseur), dans le lecteur`);
  }
});
