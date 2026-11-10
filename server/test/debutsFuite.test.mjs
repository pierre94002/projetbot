/**
 * L'ABSENCE DE FUITE des débuts de saison (étape 35, lot 1a, 09/11/2026). Bases SQLite EN MÉMOIRE (aides/debutsFabrique.mjs),
 * jamais la base du bac ni la vraie base :
 *   T-F1  l'ORACLE DE LA COPIE TRONQUÉE : pour 6 jours J (trêve d'été, trêve d'hiver civile, jour d'un promu, jour d'un
 *         nouveau venu, milieu de saison, jour d'un faux point), l'état au jour J (sommes, rang, statut, saison d'avant,
 *         minutes et continuité, faux point, tirage du faux promu) est égal, à l'octet en JSON, sur la copie coupée à J et sur
 *         la base entière — la lecture SQL comprise ; aucune exemption ;
 *   T-F2  un match planté le jour J (buts, xG, minutes) ne change rien à l'état de J ; le lendemain, il compte ;
 *   T-F3  le classement officiel planté absurde (zones inversées) ne change ni un statut ni un chiffre : seul le compte de
 *         contrôle bouge ;
 *   T-F4  la page effectif FotMob (team_squad_reads) et les dates de naissance plantées absurdes ne changent aucun chiffre ;
 *         aucun fichier de data/debutsDeSaison/ ne lit team_squad_reads ;
 *   et : une journée dans le désordre, ou la lecture d'un jour déjà publié, LÈVE.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DebutsAuJourJ, passerLesRencontres } from '../src/data/debutsDeSaison/debutsAuJourJ.js';
import { rencontresDuMagasin, minutesParRencontre } from '../src/data/debutsDeSaison/lectureDesDebuts.js';
import { passeDesDebuts } from '../src/data/debutsDeSaison/passeDesDebuts.js';
import { comptesDUnePasse } from '../src/data/debutsDeSaison/comptesDesDebuts.js';
import { zonesOfficielles } from '../src/data/debutsDeSaison/debutsBancEnfant.js';
import { continuiteDe } from '../src/data/db/squadChanges.js';
import { NIVEAUX } from '../src/data/debutsDeSaison/reglagesDebuts.js';
import { fauxPointDe, saisonCivile } from '../src/data/debutsDeSaison/formulesDebuts.js';
import { executerSansPause } from '../src/utils/travailCooperatif.js';
import { magasinFabrique, baseEnMemoire, tronquer, rencontre } from './aides/debutsFabrique.mjs';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const triees = (m) => (m ? [...m.joueurs.entries()].sort((a, b) => a[0] - b[0]) : null);

/** L'état au jour J lu par SQL dans une base : chaque club de chaque rencontre de J (lu AVANT le jour), ses minutes, sa continuité. */
function etatAuJour(db, J) {
  const minutes = minutesParRencontre(db, { jusqua: J });
  const rencontres = rencontresDuMagasin({ database: db, jusqua: J, avecResultats: true, minutes });
  const debuts = new DebutsAuJourJ({ avecForces: true });
  let etat = null;
  executerSansPause(
    passerLesRencontres(debuts, rencontres, {
      avant: (jour, duJour) => {
        if (jour !== J) return;
        etat = duJour.map((r) => ({
          cle: r.cle,
          ligue: debuts.moyennes(r.league, J, r.saison),
          clubs: [r.home, r.away].map((c) => {
            const lu = debuts.lireLeClub(c, r);
            const s = debuts.minutesDuClub(c, lu.saison);
            const av = debuts.minutesDuClub(c, lu.saison - 1);
            return { ...lu, sommes: lu.sommes ? { tot: [...lu.sommes.tot], sai: [...lu.sommes.sai], n: lu.sommes.n, nx: lu.sommes.nx } : null, faux: lu.faux ? { rang: lu.faux.rang, dep: [...lu.faux.dep] } : null, minutes: triees(s), minutesAvant: triees(av), matchs: s?.matchs ?? 0, continuite: s && av ? continuiteDe(s.joueurs, new Set(av.joueurs.keys())) : null };
          })
        }));
      }
    })
  );
  return etat;
}

test('T-F1 l’oracle de la copie tronquée : 6 jours J, l’état au jour J égal à l’octet (JSON) sur la copie coupée à J et sur la base entière', () => {
  const rs = magasinFabrique();
  // le jour d'un faux point : le premier match de championnat du club 61 à son jour ou après (Serie A 2024-25)
  const jourFaux = fauxPointDe(61, 2024, saisonCivile('Serie A - Italy'));
  const premierApresFaux = rs.find((r) => r.league === 'Serie A - Italy' && (r.home === 61 || r.away === 61) && r.date >= jourFaux && r.date < '2025-07-01')?.date;
  const jours = {
    'trêve d’été (et jour de deux promus)': '2024-08-17',
    'trêve d’hiver civile (Argentine)': rs.find((r) => r.league === 'Primera División - Argentina' && r.date >= '2025-01-01').date,
    'jour d’un nouveau venu (21)': '2024-08-10',
    'milieu de saison': rs.find((r) => r.league === 'EPL' && r.date >= '2024-11-01').date,
    'match reporté': '2024-09-10',
    'jour d’un faux point': premierApresFaux
  };
  let compares = 0;
  for (const [quoi, J] of Object.entries(jours)) {
    assert.ok(J, quoi);
    const entiere = etatAuJour(baseEnMemoire(rs), J);
    const coupee = etatAuJour(tronquer(baseEnMemoire(rs), J), J);
    assert.ok(entiere && entiere.length > 0, `${quoi} : des rencontres le ${J}`);
    assert.equal(JSON.stringify(coupee), JSON.stringify(entiere), `${quoi} (${J})`);
    compares += entiere.length;
  }
  assert.ok(compares >= 12);
  // le faux point a bien été vu ce jour-là (rang 1 depuis lui)
  const faux = etatAuJour(baseEnMemoire(rs), premierApresFaux).flatMap((x) => x.clubs).find((c) => c.club === 61);
  assert.equal(faux.faux?.rang, 1);
});

test('T-F2 un match planté le jour J ne change rien à l’état de J ; le lendemain, il compte', () => {
  const rs = magasinFabrique();
  const J = '2024-08-31';
  const plante = rencontre({ date: J, league: 'EFL Cup', home: 3, away: 99, coupe: true, bp: 9, bc: 0, xg: [6.5, 0.1], joueurs: [{ joueur: 3001, club: 3, minutes: 90 }, { joueur: 424242, club: 3, minutes: 90 }] });
  const avec = [...rs, plante].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.cle < b.cle ? -1 : 1));
  const etatJ = (liste) => JSON.stringify(etatAuJour(baseEnMemoire(liste), J).filter((x) => x.cle !== plante.cle));
  assert.equal(etatJ(avec), etatJ(rs), 'le jour J : rien ne change');
  const lendemain = rs.find((r) => r.date > J && (r.home === 3 || r.away === 3) && r.league === 'EPL').date;
  const club3 = (liste) => etatAuJour(baseEnMemoire(liste), lendemain).flatMap((x) => x.clubs).find((c) => c.club === 3);
  const a = club3(avec);
  const b = club3(rs);
  assert.notDeepEqual(a.sommes.tot, b.sommes.tot, 'le lendemain : les buts comptent');
  assert.ok(a.minutes.some(([j]) => j === 424242) && !b.minutes.some(([j]) => j === 424242), 'le lendemain : les minutes comptent');
  // la même chose PAR LA PASSE DU BANC (passeDesDebuts) : la continuité gardée au jour J ne voit pas les minutes de J (un
  // joueur planté dans le match d'EPL du club 3 ce jour-là, son 3e de la saison) ; son match suivant, si
  const du3 = rs.filter((r) => r.league === 'EPL' && r.saison === 2024 && (r.home === 3 || r.away === 3)).sort((x, y) => (x.date < y.date ? -1 : 1));
  const jourJ = du3[2];
  const avecMinutes = rs.map((r) => (r === jourJ ? { ...r, joueurs: [...r.joueurs, { joueur: 424242, club: 3, minutes: 90 }] } : r));
  const passe = (liste) => executerSansPause(passeDesDebuts({ rencontres: liste, avecForces: false })).records.filter((x) => x.league === 'EPL' && x.saison === 2024 && (x.h.club === 3 || x.a.club === 3));
  const p1 = passe(avecMinutes);
  const p0 = passe(rs);
  const c3 = (x) => (x.h.club === 3 ? x.h : x.a);
  const i = p0.findIndex((x) => x.date === jourJ.date);
  assert.ok(i >= 0 && i + 1 < p0.length && c3(p0[i]).rang === 3 && c3(p0[i]).continuite !== null, 'le 3e match du club 3 est gardé, avec sa continuité');
  assert.equal(JSON.stringify(p1[i]), JSON.stringify(p0[i]), 'le jour J, par la passe : rien ne change (la continuité non plus)');
  assert.notEqual(c3(p1[i + 1]).continuite, c3(p0[i + 1]).continuite, 'le match suivant : les minutes de J comptent');
});

test('T-F3 le classement officiel planté absurde ne change ni un statut ni un chiffre : seul le compte de contrôle bouge', () => {
  const rs = magasinFabrique();
  const zonesVraies = [
    { league: 'Championship', saison: 2023, rows: [{ teamId: 'fotmob-11', description: 'Promotion' }, { teamId: 'fotmob-12', description: 'Promotion playoff' }] },
    { league: 'EPL', saison: 2023, rows: [{ teamId: 'fotmob-5', description: 'Relegation' }, { teamId: 'fotmob-6', description: 'Relegation' }] }
  ];
  const zonesFausses = zonesVraies.map((z) => ({ ...z, rows: z.rows.map((r) => ({ ...r, description: /Promotion/.test(r.description) ? 'Relegation' : 'Promotion' })) }));
  const passe = (zones) => {
    const db = baseEnMemoire(rs, { zones });
    const minutes = minutesParRencontre(db, { jusqua: '2026-09-23' });
    const p = executerSansPause(passeDesDebuts({ rencontres: [...rencontresDuMagasin({ database: db, jusqua: '2026-09-23', avecResultats: true, minutes })], avecForces: true }));
    return { p, c: comptesDUnePasse(p, { source: 'magasin', zones: zonesOfficielles(db), niveaux: NIVEAUX }) };
  };
  const vrai = passe(zonesVraies);
  const faux = passe(zonesFausses);
  assert.equal(JSON.stringify(faux.p.records), JSON.stringify(vrai.p.records), 'les records (statuts, rangs, sommes) inchangés');
  assert.equal(vrai.c.zones.contraires, 0);
  assert.equal(faux.c.zones.contraires, 4, 'seul le compte de contrôle bouge');
  assert.deepEqual(faux.c.statuts, vrai.c.statuts);
});

test('T-F4 la page effectif FotMob et les dates de naissance plantées absurdes ne changent aucun chiffre ; team_squad_reads jamais lue', () => {
  const rs = magasinFabrique();
  const etat = (opts) => JSON.stringify(etatAuJour(baseEnMemoire(rs, opts), '2024-09-10'));
  const sans = etat({});
  const absurde = etat({ squad: [{ team_id: 'fotmob-1', rows: [{ id: 'fotmob-999999', name: 'X' }] }], naissances: [{ player_id: 'fotmob-1001', birth_date: '1800-01-01' }] });
  assert.equal(absurde, sans);
  for (const f of fs.readdirSync(path.join(SRC, 'data', 'debutsDeSaison'))) assert.ok(!/team_squad_reads/.test(fs.readFileSync(path.join(SRC, 'data', 'debutsDeSaison', f), 'utf8')), f);
  assert.ok(!/team_squad_reads/.test(fs.readFileSync(path.join(SRC, 'data', 'db', 'squadChanges.js'), 'utf8')));
});

test('le désordre et la lecture d’un jour publié LÈVENT (jamais un `<=` silencieux)', () => {
  const d = new DebutsAuJourJ({ avecForces: true });
  const r1 = rencontre({ date: '2024-08-17', league: 'EPL', home: 1, away: 2 });
  const r0 = rencontre({ date: '2024-08-10', league: 'EPL', home: 3, away: 4 });
  d.ajouter(r1);
  d.finDeJournee();
  assert.throws(() => d.ajouter(r0), /dans l'ordre/);
  assert.throws(() => d.lireLeClub(1, r1), /fuite refusée/);
  assert.throws(() => executerSansPause(passerLesRencontres(new DebutsAuJourJ({ avecForces: false }), [r1, r0], {})), /désordre/);
});

// ------------------------------------------------------------------ étape 35, lot 1b (10/11/2026) : les fiches de la nuit
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';

test('T-F5 une fiche gelée n’est jamais réécrite ; la première écriture d’après le coup d’envoi est marquée ; une fiche d’un match joué n’est jamais élaguée', () => {
  const c = preparerCopie({ base: false });
  let x;
  try {
    x = executer(c, path.join(SERVEUR, 'test', 'aides', 'script-debuts-nuit.mjs'), { args: ['gel', '{}'], timeout: 120_000 });
  } finally {
    c.nettoyer();
  }
  assert.equal(x.code, 0, x.erreurs.slice(-3000));
  assert.equal(x.reseau, false);
  const s = x.json;
  // Seconde écriture (le 01/07 à 21 h) : la fiche du 01/07 (heure inconnue, son jour) et celle du 05/07 (coup d'envoi connu,
  // passé) sont figées ; celle du 08/07 réécrite ; celle du 01/07 entre 7 et 8, neuve, marquée « après le coup d'envoi ».
  assert.deepEqual(s.rangement.seconde, { ecrites: 2, nouvelles: 1, reecrites: 1, figees: 2, apresCoupDEnvoi: 1 });
  const f = Object.fromEntries(s.fiches.map((l) => [`${l.date}|${l.home_id}`, l]));
  assert.equal(f['2025-07-01|1'].calcule_le, '2025-06-20T00:40:00.000Z');
  assert.equal(JSON.parse(f['2025-07-01|1'].entrees).calcule, '2025-06-20T00:40:00.000Z');
  assert.equal(f['2025-07-05|5'].calcule_le, '2025-06-20T00:40:00.000Z', 'coup d’envoi connu et passé : figée');
  assert.equal(f['2025-07-08|11'].calcule_le, '2025-07-01T21:00:00.000Z');
  assert.equal(f['2025-07-01|7'].apres_coup_d_envoi, 1);
  assert.equal(f['2025-07-01|1'].apres_coup_d_envoi, 0);
  // 45 jours après : les deux fiches des matchs joués rattachées (date à un jour près) et gardées ; les orphelines parties.
  assert.deepEqual(s.elagage, { rattachees: 2, orphelines: 4 });
  // La fiche d'un match joué que le rattachement ne trouve pas (camps inversés) : l'élagage relit team_day et la garde.
  assert.deepEqual(s.apres.map((l) => `${l.date}|${l.home_id}|${l.match_key}`), ['2025-07-01|1|joue-1-2', '2025-07-03|9|joue-9-10', '2025-07-04|10|null']);
});
