/**
 * LE CONTEXTE DU MATCH (étape 32, lot 1a, 29/10/2026) — l'absence de fuite.
 *   node --test test/contexteFuite.test.mjs        (depuis server/)
 *
 * T-F1 L'ORACLE DE LA COPIE TRONQUÉE (critique de l'étape 32, constat 7) : sur un MAGASIN FABRIQUÉ (contexteFabrique.mjs,
 *      dans une copie isolée : base neuve, réseau coupé), la fiche et les arbitres au jour J calculés sur la base ENTIÈRE et
 *      sur une copie coupée à J (après J : plus rien ; le jour J : le registre et la page d'avant-match seulement — meta
 *      réduite à la liste blanche coup d'envoi, stade, pelouse, nom et pays de l'arbitre ; déroulé, compositions et score
 *      effacés ; table du jour J et cache des styles retirés) sont ÉGAUX à l'octet, sauf le bloc « enchaînement » ENTIER
 *      (le calendrier connu après coup, la seule exemption, déclarée) ;
 * T-F2 un 9-0 et six rouges plantés le jour J avec l'arbitre du jour J ne changent rien à la fiche de J ni aux sommes de
 *      l'arbitre au jour J ; le lendemain, ils comptent ;
 * T-F3 les moyennes d'arbitre que FotMob affiche, plantées absurdes (999), ne changent rien ;
 * T-F4 une météo absurde plantée sur les matchs passés (99 °C, ouragan) ne change rien : la passe ne la lit jamais ;
 * T-F5 un nouvel entraîneur publié dans la composition du jour J ne change pas la fiche de J ; au match suivant, il compte.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { ContexteAuJourJ, passerLesRencontres } from '../src/data/contexte/contexteAuJourJ.js';
import { executerSansPause } from '../src/utils/travailCooperatif.js';
import { lireStades } from '../src/data/reference/donneesDeReference.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-contexte.mjs');
const SRC = path.join(SERVEUR, 'src');

const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};
const oracle = uneFois(() => {
  const copie = preparerCopie({ base: false });
  try {
    const r = executer(copie, SCRIPT, { args: ['oracle', '{}'], timeout: 300_000 });
    assert.equal(r.code, 0, `oracle :\n${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false);
    return r.json;
  } finally {
    copie.nettoyer();
  }
});

test('T-F1 l’oracle de la copie tronquée : pour 6 jours J, la fiche de chaque match et l’état de chaque arbitre au jour J sont ÉGAUX sur la base entière et sur la copie coupée à J — seule exemption, le bloc « enchaînement » entier (il diffère bien : l’exemption est réelle)', () => {
  const o = oracle();
  assert.equal(o.jours.length, 6);
  assert.ok(o.matchs > 60, `un magasin fabriqué de taille utile (${o.matchs} matchs)`);
  let fiches = 0;
  let enchainements = 0;
  for (const x of o.oracle) {
    assert.ok(x.fiches > 0, `${x.J} : des matchs ce jour-là`);
    assert.deepEqual(x.differences, [], `${x.J} : la fiche ne diffère que par l’enchaînement`);
    assert.equal(x.arbitresEgaux, true, `${x.J} : les arbitres au jour J`);
    assert.ok(x.arbitres >= 3, `${x.J} : des arbitres connus (${x.arbitres})`);
    fiches += x.fiches;
    enchainements += x.enchainementsDifferents;
  }
  assert.ok(fiches >= 10, `${fiches} fiches comparées`);
  assert.ok(enchainements > 0, 'l’enchaînement diffère bien sur la copie tronquée (le prochain match n’y est plus)');
});

test('T-F2 un 9-0 et six cartons rouges plantés le jour J, avec l’arbitre du jour J, ne changent rien à la fiche de J ni aux sommes de l’arbitre au jour J ; le lendemain, ils comptent', () => {
  const venues = lireStades();
  const ids = Object.keys(venues.clubs).sort().slice(0, 4).map((k) => Number(k.replace('fotmob-', '')));
  const arbitre = { nom: 'Arbitre Témoin', pays: 'France' };
  const m = (date, home, away, extra = {}) => ({ matchKey: `${date}-${home}`, date, kickoff: `${date}T19:00:00.000Z`, kickoffConnu: true, league: 'Ligue 1', coupe: false, home, away, attribue: false, prolongation: false, arbitre, penalties: 0, buts90: { dom: 1, ext: 1 }, cartons: { jaunes: 3, rouges: 0, fautes: 20 }, moyenneButsLigue: 2.6, entraineurs: { home: null, away: null }, ...extra });
  const avant = [m('2026-10-01', ids[0], ids[1]), m('2026-10-04', ids[2], ids[3])];
  const jourJ = '2026-10-07';
  const neuf = m(jourJ, ids[2], ids[0], { buts90: { dom: 9, ext: 0 }, cartons: { jaunes: 8, rouges: 6, fautes: 40 }, penalties: 3 });
  const calcul = (avecLeNeuf) => {
    const ctx = new ContexteAuJourJ({ venues });
    const fiches = {};
    let etatJ = null;
    let etatLendemain = null;
    const jours = [...avant, ...(avecLeNeuf ? [neuf] : []), m('2026-10-08', ids[1], ids[3])];
    executerSansPause(
      passerLesRencontres(ctx, jours, {
        avantLaJournee: (jour, du) => {
          if (jour === jourJ) {
            fiches.J = ctx.fiche({ rencontre: { ...m(jourJ, ids[1], ids[3]), matchKey: 'autre' }, calculeLe: 'x' });
            etatJ = ctx.arbitres.etat('Arbitre Témoin|France');
          }
          if (jour === '2026-10-08') etatLendemain = ctx.arbitres.etat('Arbitre Témoin|France');
        }
      })
    );
    if (!avecLeNeuf) fiches.J = (() => {
      const c = new ContexteAuJourJ({ venues });
      executerSansPause(passerLesRencontres(c, avant));
      etatJ = c.arbitres.etat('Arbitre Témoin|France');
      return c.fiche({ rencontre: { ...m(jourJ, ids[1], ids[3]), matchKey: 'autre' }, calculeLe: 'x' });
    })();
    return { fiche: fiches.J, etatJ, etatLendemain };
  };
  const sans = calcul(false);
  const avec = calcul(true);
  assert.equal(JSON.stringify(avec.fiche), JSON.stringify(sans.fiche), 'la fiche du jour J ne voit pas le 9-0 du jour J');
  assert.equal(JSON.stringify(avec.etatJ), JSON.stringify(sans.etatJ), 'les sommes de l’arbitre au jour J non plus');
  assert.deepEqual([avec.etatJ.matchs, avec.etatJ.rouges, avec.etatJ.buts90], [2, 0, 4]);
  assert.deepEqual([avec.etatLendemain.matchs, avec.etatLendemain.rouges, avec.etatLendemain.buts90, avec.etatLendemain.penalties], [3, 6, 13, 3], 'le lendemain, le 9-0 compte');
});

test('T-F3 et T-F4 les moyennes d’arbitre de FotMob (999 partout) et une météo absurde (99 °C, ouragan) plantées sur TOUS les matchs, relus : la fiche et les arbitres au jour J ne bougent pas d’un octet', () => {
  const o = oracle();
  assert.equal(o.absurde.fichesEgales, true);
  assert.equal(o.absurde.arbitresEgaux, true);
  // Et dans le code : ni la passe, ni le cache, ni l'arbitre ne lisent ces champs (l'archive d'avant-match seule lit la météo PRÉVUE).
  const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const fichiers = [...fs.readdirSync(path.join(SRC, 'data', 'contexte')).map((f) => path.join(SRC, 'data', 'contexte', f)), path.join(SRC, 'data', 'db', 'refereeRead.js')];
  for (const f of fichiers) {
    const code = sansCommentaires(fs.readFileSync(f, 'utf8'));
    assert.doesNotMatch(code, /yellowCardsPerMatch|foulsPerMatch|yellowCardsLeagueAverage|redCards|referee\.matches|referee\.penalties/, `${path.basename(f)} : les moyennes FotMob de l’arbitre ne sont jamais lues`);
    assert.doesNotMatch(code, /temperature|windSpeed|precipitation|weather/, `${path.basename(f)} : la météo d’un match n’est jamais lue (l’avant-match, archivé avant le coup d’envoi, l’est par matchStatsDb.js)`);
  }
});

test('T-F5 un nouvel entraîneur publié dans la composition du jour J (cache des styles et composition) ne change pas la fiche de J ; au match suivant du club, il est bien l’entraîneur', () => {
  const o = oracle();
  assert.equal(o.entraineur.ficheEgale, true);
  assert.notEqual(o.entraineur.entraineurAuJourJ, 'Entraîneur Publié Le Jour J');
  assert.equal(o.entraineur.entraineurAuMatchSuivant, 'Entraîneur Publié Le Jour J');
});
