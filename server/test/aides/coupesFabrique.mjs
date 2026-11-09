/**
 * UN MAGASIN FABRIQUÉ pour les essais des coupes (étape 36, lot 1, 09/11/2026) — ce n'est PAS un fichier de test.
 * Exécuté sur une base NEUVE (une copie de travail, cf. isolement.mjs, ou une base en mémoire) : jamais la base du bac,
 * jamais la vraie base, AUCUN résultat réel. Tout vient d'un générateur à graine : le même magasin, ligne pour ligne.
 *
 * Deux championnats (« Ligue 1 », 20 clubs ; « Liga X », 12 clubs) tous les samedis depuis août 2024, et des coupes qui
 * portent chacune ses pièges :
 *   - Coupe de France 2024 et 2025 (matchs uniques) : séance directe à la carte des tirs, séance sans carte ni déroulé
 *     complet, séance directe avec un CARTON à la 121e, une prolongation, un doublon (sans identifiant FotMob, le
 *     lendemain), une rencontre à identifiant NUL, un match ATTRIBUÉ, la finale au Stade de France (neutre) ;
 *   - Ligue Europa 2024 et 2025 (aller-retour) : la « final » d'août (dernier tour de qualification), la phase de ligue
 *     (« 1 » à « 4 », clé nue), les quarts « 1/4 » à l'aller et « Quarter-finals » au retour, un retour prolongé, un retour
 *     aux tirs au but après prolongation (carte après la 120e), une finale neutre ;
 *   - FA Cup 2023 : deux REJOUAGES (premier match nul) ;
 *   - Leagues Cup 2025 : phase de groupes (« Grp »), séance en groupe, la 3e place et la finale LE MÊME JOUR ;
 *   - Copa Libertadores 2026 : la qualification « 3 » de mars et la 3e journée de groupe d'avril, CHAÎNÉES à moins de
 *     40 jours ;
 *   - « Port » et « Portsmouth » (deux clubs, deux identifiants : jamais rapprochés par le nom).
 * Les tables écrites : matches, day_matches, team_day ; et, pour la nuit : upcoming_lineups, contexte_avant_match,
 * simulation_matchs (la grille de la page de l'étape 28) ; le calendrier de saison (un fichier JSON) à part.
 */

import fs from 'node:fs';
import path from 'node:path';

const JOUR_MS = 86_400_000;
export const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);

/** Générateur à graine (mulberry32). */
export function generateur(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const poisson = (u, l) => {
  const x = u();
  let k = 0;
  let p = Math.exp(-l);
  let s = p;
  while (x > s && k < 9) {
    k++;
    p *= l / k;
    s += p;
  }
  return k;
};

/** Les clubs : 20 de « Ligue 1 » (9001-9020), 12 de « Liga X » (9021-9032) ; « Port » (9031) et « Portsmouth » (9032). */
export const CLUBS = Object.freeze(
  Array.from({ length: 32 }, (_, i) => {
    const id = 9001 + i;
    const nom = id === 9031 ? 'Port' : id === 9032 ? 'Portsmouth' : `Club ${String(i + 1).padStart(2, '0')}`;
    return Object.freeze({ id, nom, stade: `Stade ${nom}`, ville: `Ville ${i + 1}`, lat: 40 + i * 0.37, long: -3 + i * 0.29, ligue: id <= 9020 ? 'Ligue 1' : 'Liga X' });
  })
);
const club = (id) => CLUBS.find((c) => c.id === id);
export const NEUTRES = Object.freeze({ cdf: { stade: 'Stade de France', ville: 'Saint-Denis', lat: 48.9245, long: 2.3601 }, uel: { stade: 'Arena Final', ville: 'Ailleurs', lat: 52.1, long: 21.0 } });

/** Le magasin entier se fabrique jusqu'à ce jour (la nuit d'essai est le 12/04/2026, heure de Paris). */
export const JUSQUA = '2026-04-11';
export const NUIT_D_ESSAI = '2026-04-12T00:40:00.000Z';

/**
 * Les RENCONTRES fabriquées (pures, sans base) : [{ matchKey, fotmobId, date, league, home, away, hg, ag, round, phase,
 * fin, awarded, events, shotmap, stade, ville, lat, long, homeId? }] et les attendus nommés des essais.
 */
export function rencontresFabriquees({ jusqua = JUSQUA, graine = 36 } = {}) {
  const u = generateur(graine);
  const out = [];
  let n = 0;
  const cle = (league, date, h, a) => `${league}|${date}|${h}|${a}`;
  const ajouter = (m) => {
    n++;
    const H = club(m.home) ?? null;
    const lieu = m.lieu ?? (H ? { stade: H.stade, ville: H.ville, lat: H.lat, long: H.long } : {});
    const r = { matchKey: m.matchKey ?? cle(m.league, m.date, m.home, m.away), fotmobId: m.fotmobId === undefined ? String(5_000_000 + n) : m.fotmobId, date: m.date, league: m.league, home: m.home, away: m.away, homeId: m.homeId, awayId: m.awayId, hg: m.hg, ag: m.ag, round: m.round ?? null, phase: m.phase ?? null, fin: m.fin ?? null, awarded: Boolean(m.awarded), events: m.events ?? null, shotmap: m.shotmap ?? null, ...lieu, kickoff: `${m.date}T19:00:00.000Z` };
    if (r.date <= jusqua) out.push(r);
    return r;
  };
  // Un déroulé : chaque but à sa minute, et un remplacement de chaque camp (« complet ») ou les buts seuls.
  const deroule = ({ hg, ag, complet = true, butsApres90 = [], plus = [] }) => {
    const ev = [];
    for (let g = 0; g < hg; g++) ev.push({ type: 'goal', side: 'home', minute: 10 + g * 17 });
    for (let g = 0; g < ag; g++) ev.push({ type: 'goal', side: 'away', minute: 15 + g * 19 });
    for (const b of butsApres90) ev.push({ type: 'goal', side: b.side, minute: b.minute });
    if (complet) ev.push({ type: 'substitution', side: 'home', minute: 62, addedTime: 0 }, { type: 'substitution', side: 'away', minute: 66, addedTime: 0 });
    ev.push(...plus);
    return ev.sort((x, y) => x.minute - y.minute);
  };
  // Une séance sur la carte des tirs : `tirs` [[camp, but?], …] à partir de la minute `de`.
  const seance = (de, tirs) => tirs.map(([side, but], i) => ({ side, minute: de + Math.floor(i / 2), situation: 'penalty', result: but ? 'goal' : 'attemptsaved' }));
  // Cinq tirs par camp ; le perdant manque son cinquième.
  const seance5 = (de, gagnant) => {
    const tirs = [];
    for (let i = 0; i < 5; i++) {
      tirs.push(['home', !(gagnant === 'away' && i === 4)]);
      tirs.push(['away', !(gagnant === 'home' && i === 4)]);
    }
    return seance(de, tirs);
  };

  // ------------------------------------------------ les championnats (les forces, les stades habituels)
  for (const [ligue, ids] of [['Ligue 1', CLUBS.filter((c) => c.ligue === 'Ligue 1').map((c) => c.id)], ['Liga X', CLUBS.filter((c) => c.ligue === 'Liga X').map((c) => c.id)]]) {
    const k = ids.length;
    let semaine = 0;
    for (let d = '2024-08-03'; d <= jusqua; d = plusJours(d, 7)) {
      const mois = Number(d.slice(5, 7));
      if (mois === 6 || mois === 7) {
        semaine++;
        continue;
      }
      // La méthode du cercle : le premier fixe, les autres tournent.
      const tour = semaine % (k - 1);
      const rot = ids.slice(1);
      const tournes = [ids[0], ...rot.slice(rot.length - tour), ...rot.slice(0, rot.length - tour)];
      for (let i = 0; i < k / 2; i++) {
        let h = tournes[i];
        let a = tournes[k - 1 - i];
        if ((semaine + i) % 2) [h, a] = [a, h];
        const hg = poisson(u, 1.5);
        const ag = poisson(u, 1.1);
        ajouter({ league: ligue, date: d, home: h, away: a, hg, ag, round: String(tour + 1), phase: ligue === 'Ligue 1' ? 'FRA|Ligue 1' : 'ESP|Liga X', events: deroule({ hg, ag }) });
      }
      semaine++;
    }
  }

  // ------------------------------------------------ Coupe de France 2024 (2024-12 → 2025-04) et 2025
  const CDF = 'Coupe de France';
  const P_CDF = 'FRA|Coupe de France';
  const unMatch = (date, round, h, a, hg, ag, extra = {}) => ajouter({ league: CDF, date, home: h, away: a, hg, ag, round, phase: P_CDF, events: deroule({ hg, ag }), ...extra });
  // 1/32 (2024-12-14) : une rencontre à identifiant NUL, une ordinaire.
  ajouter({ league: CDF, date: '2024-12-14', home: 9001, away: 9017, homeId: null, hg: 2, ag: 0, round: '1/32', phase: P_CDF, events: deroule({ hg: 2, ag: 0 }) });
  unMatch('2024-12-14', '1/32', 9002, 9018, 3, 1);
  // 1/8 (2025-01-11) : 8 matchs ; un ATTRIBUÉ (9007-9010), une séance directe à la carte, un doublon.
  const huitiemes24 = [[9001, 9016], [9002, 9015], [9003, 9014], [9004, 9013], [9005, 9012], [9006, 9011], [9007, 9010], [9008, 9009]];
  const vainqueurs24 = [];
  huitiemes24.forEach(([h, a], i) => {
    if (i === 6) {
      ajouter({ league: CDF, date: '2025-01-11', home: h, away: a, hg: 3, ag: 0, round: '1/8', phase: P_CDF, fin: 'awarded_win', awarded: true, events: null });
      vainqueurs24.push(h);
      return;
    }
    if (i === 2) {
      // Séance directe : déroulé complet, aucun événement après la 90e, la carte en 91, 92… : le club qui reçoit gagne.
      ajouter({ league: CDF, date: '2025-01-11', home: h, away: a, hg: 1, ag: 1, round: '1/8', phase: P_CDF, fin: 'afterpenalties', events: deroule({ hg: 1, ag: 1 }), shotmap: seance5(91, 'home') });
      vainqueurs24.push(h);
      return;
    }
    const hg = i % 3 === 0 ? 2 : 1;
    const ag = i % 3 === 0 ? 0 : 2;
    unMatch('2025-01-11', '1/8', h, a, hg, ag);
    vainqueurs24.push(hg > ag ? h : a);
    if (i === 4) ajouter({ league: CDF, date: '2025-01-12', home: h, away: a, hg, ag, round: '1/8', phase: P_CDF, fotmobId: null, matchKey: `doublon|${h}|${a}`, events: null });
  });
  // 1/4 (2025-02-08) : une séance avec un CARTON à la 121e (séance directe), une séance au déroulé de buts seuls, sans carte.
  const quarts24 = [[vainqueurs24[0], vainqueurs24[7]], [vainqueurs24[1], vainqueurs24[6]], [vainqueurs24[2], vainqueurs24[5]], [vainqueurs24[3], vainqueurs24[4]]];
  const v24q = [];
  quarts24.forEach(([h, a], i) => {
    if (i === 0) {
      ajouter({ league: CDF, date: '2025-02-08', home: h, away: a, hg: 0, ag: 0, round: '1/4', phase: P_CDF, fin: 'afterpenalties', events: deroule({ hg: 0, ag: 0, plus: [{ type: 'card', side: 'away', minute: 121, card: 'yellow' }] }), shotmap: seance5(91, 'away') });
      v24q.push(a);
    } else if (i === 1) {
      ajouter({ league: CDF, date: '2025-02-08', home: h, away: a, hg: 2, ag: 2, round: '1/4', phase: P_CDF, fin: 'afterpenalties', events: deroule({ hg: 2, ag: 2, complet: false }), shotmap: null });
      v24q.push(h);
    } else {
      unMatch('2025-02-08', '1/4', h, a, 2, 1);
      v24q.push(h);
    }
  });
  // 1/2 (2025-03-08) et finale au Stade de France (2025-04-26).
  unMatch('2025-03-08', '1/2', v24q[0], v24q[3], 1, 0);
  unMatch('2025-03-08', '1/2', v24q[1], v24q[2], 3, 2);
  ajouter({ league: CDF, date: '2025-04-26', home: v24q[0], away: v24q[1], hg: 2, ag: 1, round: 'final', phase: P_CDF, events: deroule({ hg: 2, ag: 1 }), lieu: NEUTRES.cdf });
  // Saison 2025 : 1/8 (2026-01-10), 1/4 (2026-02-07) avec une PROLONGATION et une séance directe à la carte ; 1/2 au calendrier.
  const huitiemes25 = [[9016, 9001], [9015, 9002], [9014, 9003], [9013, 9004], [9012, 9005], [9011, 9006], [9010, 9007], [9009, 9008]];
  const v25 = huitiemes25.map(([h, a], i) => {
    const hg = i % 2 ? 0 : 2;
    const ag = i % 2 ? 1 : 0;
    unMatch('2026-01-10', '1/8', h, a, hg, ag);
    return hg > ag ? h : a;
  });
  ajouter({ league: CDF, date: '2026-02-07', home: v25[0], away: v25[7], hg: 2, ag: 1, round: '1/4', phase: P_CDF, fin: 'afterextra', events: deroule({ hg: 1, ag: 1, butsApres90: [{ side: 'home', minute: 105 }], plus: [{ type: 'substitution', side: 'home', minute: 98, addedTime: 0 }] }) });
  ajouter({ league: CDF, date: '2026-02-07', home: v25[1], away: v25[6], hg: 1, ag: 1, round: '1/4', phase: P_CDF, fin: 'afterpenalties', events: deroule({ hg: 1, ag: 1 }), shotmap: seance5(91, 'away') });
  unMatch('2026-02-07', '1/4', v25[2], v25[5], 3, 0);
  unMatch('2026-02-07', '1/4', v25[3], v25[4], 0, 1);

  // ------------------------------------------------ Ligue Europa 2024 (quarts, demies, finale) et 2025
  const UEL = 'UEFA Europa League';
  const allerRetour = (dateA, dateR, roundA, roundR, phaseA, phaseR, h, a, s1, s2, extra = {}) => {
    ajouter({ league: UEL, date: dateA, home: h, away: a, hg: s1[0], ag: s1[1], round: roundA, phase: phaseA, events: deroule({ hg: s1[0], ag: s1[1] }) });
    ajouter({ league: UEL, date: dateR, home: a, away: h, hg: s2[0], ag: s2[1], round: roundR, phase: phaseR, events: deroule({ hg: s2[0], ag: s2[1], ...(extra.deroule ?? {}) }), fin: extra.fin ?? null, shotmap: extra.shotmap ?? null });
  };
  const FS = 'INT|Europa League Final Stage';
  // 2024 : quarts — un retour prolongé (cumul égal après 90 : 1-0 / 0-1, but à la 108e pour le club qui reçoit), un retour
  // aux tirs au but après prolongation (remplacements en prolongation, carte après la 120e), deux décidés à la 90e.
  allerRetour('2025-04-10', '2025-04-17', '1/4', '1/4', FS, FS, 9017, 9021, [1, 0], [2, 0], { fin: 'afterextra', deroule: { hg: 1, ag: 0, butsApres90: [{ side: 'home', minute: 108 }] } });
  allerRetour('2025-04-10', '2025-04-17', '1/4', '1/4', FS, FS, 9018, 9022, [2, 1], [1, 0], { fin: 'afterpenalties', deroule: { hg: 1, ag: 0, plus: [{ type: 'substitution', side: 'home', minute: 101, addedTime: 0 }, { type: 'substitution', side: 'away', minute: 104, addedTime: 0 }] }, shotmap: seance5(121, 'away') });
  allerRetour('2025-04-10', '2025-04-17', '1/4', '1/4', FS, FS, 9019, 9023, [0, 2], [1, 1]);
  allerRetour('2025-04-10', '2025-04-17', '1/4', '1/4', FS, FS, 9020, 9024, [3, 0], [0, 2]);
  // Qualifiés : 9021 (retour 2-0, cumul 2-1 après prolongation), 9018 (aux tirs au but), 9023, 9020.
  allerRetour('2025-05-01', '2025-05-08', '1/2', '1/2', FS, FS, 9021, 9018, [1, 1], [2, 0]);
  allerRetour('2025-05-01', '2025-05-08', '1/2', '1/2', FS, FS, 9023, 9020, [0, 1], [1, 1]);
  ajouter({ league: UEL, date: '2025-05-21', home: 9018, away: 9020, hg: 1, ag: 0, round: 'final', phase: FS, events: deroule({ hg: 1, ag: 0 }), lieu: NEUTRES.uel });
  // 2025 : la « final » d'août (dernier tour de qualification, aller-retour), la phase de ligue « 1 » à « 4 », les quarts.
  const Q = 'INT|Europa League Qualification';
  const qualif = [[9025, 9017], [9026, 9018], [9027, 9019], [9028, 9020]];
  // Trois retours décidés à la 90e ; le quatrième à égalité de cumul SANS prolongation (un cas de « buts à l’extérieur » : un contrôle seulement).
  const retoursQualif = [[2, 0], [2, 0], [0, 2], [1, 0]];
  qualif.forEach(([h, a], i) => allerRetour('2025-08-21', '2025-08-28', 'final', 'final', Q, Q, h, a, [1, 0], retoursQualif[i]));
  const ligue = [9017, 9018, 9019, 9020, 9021, 9022, 9023, 9024];
  const datesLigue = ['2025-09-25', '2025-10-23', '2025-11-27', '2026-01-29'];
  datesLigue.forEach((d, j) => {
    for (let i = 0; i < 4; i++) {
      const h = ligue[(i + j) % 8];
      const a = ligue[(7 - i + j) % 8];
      if (h === a) continue;
      const hg = poisson(u, 1.4);
      const ag = poisson(u, 1.2);
      ajouter({ league: UEL, date: d, home: h, away: a, hg, ag, round: String(j + 1), phase: 'INT|Europa League', events: deroule({ hg, ag }) });
    }
  });
  // Les quarts 2025 : l'aller « 1/4 » joué le 09/04/2026 ; le retour « Quarter-finals » au calendrier le 16/04.
  const quarts25 = [[9017, 9021], [9018, 9022], [9019, 9023], [9020, 9024]];
  const allers25 = [[2, 0], [1, 1], [0, 1], [3, 2]];
  quarts25.forEach(([h, a], i) => ajouter({ league: UEL, date: '2026-04-09', home: h, away: a, hg: allers25[i][0], ag: allers25[i][1], round: '1/4', phase: FS, events: deroule({ hg: allers25[i][0], ag: allers25[i][1] }) }));

  // ------------------------------------------------ FA Cup 2023 : deux rejouages
  const FA = 'FA Cup - England';
  const tour3 = [[9001, 9002], [9003, 9004], [9005, 9006], [9007, 9008], [9009, 9010], [9011, 9012], [9013, 9014], [9015, 9016]];
  const v3 = [];
  tour3.forEach(([h, a], i) => {
    if (i < 2) {
      ajouter({ league: FA, date: '2024-01-06', home: h, away: a, hg: 1, ag: 1, round: '3', phase: 'ENG|FA Cup', events: deroule({ hg: 1, ag: 1 }) });
      ajouter({ league: FA, date: '2024-01-16', home: a, away: h, hg: 2, ag: 0, round: '3', phase: 'ENG|FA Cup', events: deroule({ hg: 2, ag: 0 }) });
      v3.push(a);
      return;
    }
    ajouter({ league: FA, date: '2024-01-06', home: h, away: a, hg: 2, ag: 1, round: '3', phase: 'ENG|FA Cup', events: deroule({ hg: 2, ag: 1 }) });
    v3.push(h);
  });
  for (let i = 0; i < 4; i++) ajouter({ league: FA, date: '2024-01-27', home: v3[i], away: v3[7 - i], hg: 1, ag: 0, round: '4', phase: 'ENG|FA Cup', events: deroule({ hg: 1, ag: 0 }) });

  // ------------------------------------------------ Leagues Cup 2025 : groupes, une séance en groupe, 3e place et finale le même jour
  const LC = 'Leagues Cup';
  const g1 = [9021, 9022, 9023];
  const g2 = [9024, 9025, 9026];
  [['2025-07-30', 0], ['2025-08-03', 1], ['2025-08-07', 2]].forEach(([d, j]) => {
    for (const [g, nom] of [[g1, 'INT|Leagues Cup East Grp. 1'], [g2, 'INT|Leagues Cup East Grp. 2']]) {
      const h = g[j % 3];
      const a = g[(j + 1) % 3];
      if (j === 1 && nom.endsWith('1')) ajouter({ league: LC, date: d, home: h, away: a, hg: 1, ag: 1, round: String(j + 1), phase: nom, fin: 'afterpenalties', events: deroule({ hg: 1, ag: 1 }), shotmap: seance5(91, 'home') });
      else ajouter({ league: LC, date: d, home: h, away: a, hg: 2, ag: j % 2, round: String(j + 1), phase: nom, events: deroule({ hg: 2, ag: j % 2 }) });
    }
  });
  ajouter({ league: LC, date: '2025-08-20', home: 9021, away: 9025, hg: 2, ag: 0, round: '1/2', phase: 'INT|Leagues Cup Final Stage', events: deroule({ hg: 2, ag: 0 }) });
  ajouter({ league: LC, date: '2025-08-20', home: 9024, away: 9022, hg: 1, ag: 3, round: '1/2', phase: 'INT|Leagues Cup Final Stage', events: deroule({ hg: 1, ag: 3 }) });
  ajouter({ league: LC, date: '2025-09-01', home: 9025, away: 9024, hg: 2, ag: 2, round: 'bronze', phase: 'INT|Leagues Cup Final Stage', fin: 'afterpenalties', events: deroule({ hg: 2, ag: 2 }), shotmap: seance5(91, 'home') });
  ajouter({ league: LC, date: '2025-09-01', home: 9021, away: 9022, hg: 1, ag: 0, round: 'final', phase: 'INT|Leagues Cup Final Stage', events: deroule({ hg: 1, ag: 0 }), lieu: NEUTRES.uel });

  // ------------------------------------------------ Copa Libertadores 2026 : qualification « 3 » (mars), groupes « 1 » à « 3 »
  const CL = 'Copa Libertadores';
  ajouter({ league: CL, date: '2026-03-03', home: 9027, away: 9028, hg: 1, ag: 0, round: '3', phase: 'INT|Copa Libertadores Qualification', events: deroule({ hg: 1, ag: 0 }) });
  ajouter({ league: CL, date: '2026-03-03', home: 9029, away: 9030, hg: 0, ag: 0, round: '3', phase: 'INT|Copa Libertadores Qualification', events: deroule({ hg: 0, ag: 0 }) });
  ajouter({ league: CL, date: '2026-03-10', home: 9028, away: 9027, hg: 1, ag: 1, round: '3', phase: 'INT|Copa Libertadores Qualification', events: deroule({ hg: 1, ag: 1 }) });
  ajouter({ league: CL, date: '2026-03-10', home: 9030, away: 9029, hg: 0, ag: 2, round: '3', phase: 'INT|Copa Libertadores Qualification', events: deroule({ hg: 0, ag: 2 }) });
  const groupe = [9027, 9029, 9031, 9032];
  [['2026-03-24', '1'], ['2026-04-01', '2'], ['2026-04-08', '3']].forEach(([d, r], j) => {
    const paires = j === 0 ? [[0, 1], [2, 3]] : j === 1 ? [[2, 0], [3, 1]] : [[0, 3], [1, 2]];
    for (const [x, y] of paires) ajouter({ league: CL, date: d, home: groupe[x], away: groupe[y], hg: 1, ag: j % 2, round: r, phase: 'INT|Copa Libertadores Grp. A', events: deroule({ hg: 1, ag: j % 2 }) });
  });

  const attendus = {
    seanceDirecteCarte: cle(CDF, '2025-01-11', 9003, 9014),
    attribue: cle(CDF, '2025-01-11', 9007, 9010),
    doublon: { garde: cle(CDF, '2025-01-11', 9005, 9012), ecarte: 'doublon|9005|9012' },
    identifiantNul: cle(CDF, '2024-12-14', 9001, 9017),
    carton121: cle(CDF, '2025-02-08', quarts24[0][0], quarts24[0][1]),
    seanceSansCarte: cle(CDF, '2025-02-08', quarts24[1][0], quarts24[1][1]),
    finaleCdf24: cle(CDF, '2025-04-26', v24q[0], v24q[1]),
    prolongationCdf25: cle(CDF, '2026-02-07', v25[0], v25[7]),
    retourProlonge: cle(UEL, '2025-04-17', 9021, 9017),
    retourTab: cle(UEL, '2025-04-17', 9022, 9018),
    finaleUel24: cle(UEL, '2025-05-21', 9018, 9020),
    rejouages: [cle(FA, '2024-01-16', 9002, 9001), cle(FA, '2024-01-16', 9004, 9003)],
    bronze: cle(LC, '2025-09-01', 9025, 9024),
    finaleLc: cle(LC, '2025-09-01', 9021, 9022),
    quarts25: quarts25.map(([h, a]) => ({ h, a, aller: allers25[quarts25.findIndex((q) => q[0] === h)] })),
    finaleUel24Clubs: [9018, 9020]
  };
  return { rencontres: out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.matchKey < b.matchKey ? -1 : 1)), attendus };
}

/** Le score à la 90e d'une rencontre (la règle de butsA90 : seulement avec tous les buts et leur minute). */
function buts90(r) {
  if (!Array.isArray(r.events)) return [null, null];
  const buts = r.events.filter((e) => e.type === 'goal');
  if (buts.length !== r.hg + r.ag) return [null, null];
  return [buts.filter((b) => b.side === 'home' && b.minute <= 90).length, buts.filter((b) => b.side === 'away' && b.minute <= 90).length];
}

const saisonDe = (league, date) => {
  const civile = ['Leagues Cup', 'Copa Libertadores'].includes(league);
  const y = Number(date.slice(0, 4));
  return civile ? y : Number(date.slice(5, 7)) >= 7 ? y : y - 1;
};

/**
 * ÉCRIT le magasin fabriqué dans `database` (une base NEUVE). Rend { rencontres, attendus }. `jusqua` : le dernier jour
 * écrit. `rebuildRegistries` : l'annuaire (identityRegistry.js) reconstruit depuis `matches`, comme la nuit.
 */
export function fabriquerLesCoupes(database, { jusqua = JUSQUA, graine = 36, rebuildRegistries = null } = {}) {
  const { rencontres, attendus } = rencontresFabriquees({ jusqua, graine });
  const insMatch = database.prepare(
    `INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, fotmob_id, home_goals, away_goals, updated_at, events, lineups, meta, shotmap)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
  );
  const insDay = database.prepare('INSERT INTO day_matches (match_key, fotmob_id, date, league, saison, home, away, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insTeam = database.prepare(
    `INSERT INTO team_day (rencontre, camp, club, adversaire, date, league, saison, attribue, prolongation, compte, coupe, releve, bp, bc, bp90, bc90)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const coupes = new Set(['Coupe de France', 'UEFA Europa League', 'FA Cup - England', 'Leagues Cup', 'Copa Libertadores']);
  database.exec('BEGIN');
  try {
    for (const r of rencontres) {
      const H = club(r.home);
      const A = club(r.away);
      const meta = { round: r.round, leagueKey: r.phase, kickoff: r.kickoff, stadium: r.stade, city: r.ville, ...(Number.isFinite(r.lat) ? { lat: r.lat, long: r.long } : {}), ...(r.fin ? { reason: r.fin } : {}), ...(r.awarded ? { awarded: true } : {}) };
      const homeId = r.homeId === null ? null : `fotmob-${r.home}`;
      const maj = `${r.date}T23:59:00.000Z`;
      insMatch.run(r.matchKey, r.matchKey, r.date, r.league, H.nom, A.nom, homeId, `fotmob-${r.away}`, r.fotmobId, r.hg, r.ag, maj, r.events ? JSON.stringify(r.events) : null, JSON.stringify(meta), r.shotmap ? JSON.stringify(r.shotmap) : null);
      if (homeId === null || r.matchKey.startsWith('doublon|')) continue;
      const saison = saisonDe(r.league, r.date);
      const d = insDay.run(r.matchKey, r.fotmobId, r.date, r.league, saison, r.home, r.away, maj);
      const rencontre = Number(d.lastInsertRowid);
      const prolongation = r.fin === 'afterextra' || r.fin === 'afterpenalties' ? 1 : 0;
      const [b90h, b90a] = buts90(r);
      const coupe = coupes.has(r.league) ? 1 : 0;
      const attribue = r.awarded ? 1 : 0;
      insTeam.run(rencontre, 1, r.home, r.away, r.date, r.league, saison, attribue, prolongation, coupe ? 0 : 1, coupe, 1, r.hg, r.ag, b90h, b90a);
      insTeam.run(rencontre, 0, r.away, r.home, r.date, r.league, saison, attribue, prolongation, coupe ? 0 : 1, coupe, 1, r.ag, r.hg, b90a, b90h);
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  if (rebuildRegistries) rebuildRegistries({ database });
  return { rencontres, attendus };
}

/**
 * LES MATCHS À VENIR de la nuit d'essai (12/04/2026) : le calendrier de saison (un fichier JSON : noms des clubs), la page
 * relevée (upcoming_lineups), l'archive d'avant-match, la grille de la page (simulation_matchs). `apresLeCoupDEnvoi` :
 * ajoute une page relevée APRÈS le coup d'envoi (T-F4). Rend les lignes du calendrier.
 */
export function fabriquerLesMatchsAVenir(database, fichierCalendrier, { apresLeCoupDEnvoi = false } = {}) {
  const ligne = (date, league, h, a, round = null) => ({ id: `cal-${date}-${h}-${a}`, matchId: `cal-${date}-${h}-${a}`, date, league, homeName: club(h).nom, awayName: club(a).nom, status: 'scheduled', homeGoals: null, awayGoals: null, round, source: 'fotmob', updatedAt: '2026-04-11T00:00:00.000Z' });
  const lignes = [
    // Les retours des quarts de la Ligue Europa (l'aller joué le 09/04).
    ...[[9021, 9017], [9022, 9018], [9023, 9019], [9024, 9020]].map(([h, a]) => ligne('2026-04-16', 'UEFA Europa League', h, a)),
    // Les demies de la Coupe de France (matchs uniques : le tour vient de la page relevée).
    ligne('2026-04-15', 'Coupe de France', 9016, 9015),
    // La 4e journée de groupe de la Libertadores.
    ligne('2026-04-21', 'Copa Libertadores', 9027, 9031),
    // Un aller (son retour au calendrier 7 jours plus tard) et ce retour.
    ligne('2026-04-23', 'UEFA Europa League', 9017, 9019),
    ligne('2026-04-30', 'UEFA Europa League', 9019, 9017),
    // Un match de championnat (jamais une fiche de coupe).
    ligne('2026-04-18', 'Ligue 1', 9001, 9002)
  ];
  fs.mkdirSync(path.dirname(fichierCalendrier), { recursive: true });
  fs.writeFileSync(fichierCalendrier, JSON.stringify(lignes));
  const insPage = database.prepare('INSERT INTO upcoming_lineups (fotmob_id, date, kickoff, league, home_id, away_id, home_name, away_name, payload, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insPage.run('7000001', '2026-04-15', '2026-04-15T19:00:00.000Z', 'Coupe de France', 'fotmob-9016', 'fotmob-9015', club(9016).nom, club(9015).nom, JSON.stringify({ meta: { round: '1/2', leagueKey: 'FRA|Coupe de France', kickoff: '2026-04-15T19:00:00.000Z', stadium: club(9016).stade, city: club(9016).ville } }), '2026-04-11T10:00:00.000Z');
  if (apresLeCoupDEnvoi) insPage.run('7000002', '2026-04-16', '2026-04-16T19:00:00.000Z', 'UEFA Europa League', 'fotmob-9021', 'fotmob-9017', club(9021).nom, club(9017).nom, JSON.stringify({ meta: { round: 'Quarter-finals', leagueKey: 'INT|Europa League - Quarter-finals', kickoff: '2026-04-16T19:00:00.000Z', stadium: NEUTRES.uel.stade } }), '2026-04-16T21:00:00.000Z');
  database
    .prepare('INSERT INTO contexte_avant_match (fotmob_id, date, kickoff, league, home_id, away_id, releve_le, avant_match, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)')
    .run('7000003', '2026-04-16', '2026-04-16T19:00:00.000Z', 'UEFA Europa League', 9022, 9018, '2026-04-11T09:00:00.000Z', JSON.stringify({ stadium: club(9022).stade, city: club(9022).ville }));
  const insSim = database.prepare(
    `INSERT INTO simulation_matchs (fixture_key, role, calcule_le, version, grille, match_id, league, date, kickoff, kickoff_connu, home_id, away_id, home_name, away_name, lambda, mu, rho, fair, odds_source, odds_at, apres_coup_d_envoi)
     VALUES (?, 'service', ?, 1, 'modele-buts-441', ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, -0.05, ?, ?, ?, 0)`
  );
  insSim.run('fx-9021-9017', '2026-04-12T00:20:00.000Z', 'cal-2026-04-16-9021-9017', 'UEFA Europa League', '2026-04-16', '2026-04-16T19:00:00.000Z', 'fotmob-9021', 'fotmob-9017', club(9021).nom, club(9017).nom, 1.42, 1.08, JSON.stringify({ home: 0.47, draw: 0.27, away: 0.26 }), 'odds-api', '2026-04-11T08:00:00.000Z');
  // Une ligne de la candidate en essai de l'étape 27 (rôle « candidate »), plus récente : la fiche ne la recopie jamais.
  database
    .prepare(
      `INSERT INTO simulation_matchs (fixture_key, role, calcule_le, version, grille, match_id, league, date, kickoff, kickoff_connu, home_id, away_id, home_name, away_name, lambda, mu, rho, fair, odds_source, odds_at, apres_coup_d_envoi)
     VALUES (?, 'candidate', ?, 1, 'modele-buts-441', ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, -0.05, ?, ?, ?, 0)`
    )
    .run('fx-9021-9017', '2026-04-12T00:30:00.000Z', 'cal-2026-04-16-9021-9017', 'UEFA Europa League', '2026-04-16', '2026-04-16T19:00:00.000Z', 'fotmob-9021', 'fotmob-9017', club(9021).nom, club(9017).nom, 1.9, 0.9, JSON.stringify({ home: 0.6, draw: 0.22, away: 0.18 }), 'odds-api', '2026-04-11T08:00:00.000Z');
  return lignes;
}

/** L'annuaire d'essai (nom → identifiant FotMob), pour une nuit DANS le processus courant (aPart: false). */
export const clubDeLEssai = (nom) => {
  const c = CLUBS.find((x) => x.nom === nom);
  return c ? `fotmob-${c.id}` : null;
};
