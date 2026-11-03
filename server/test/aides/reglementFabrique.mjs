/**
 * LE MAGASIN FABRIQUÉ du correctif du règlement des vrais paris (02/11/2026) — ce n'est PAS un fichier de test.
 * Exécuté DANS une copie de travail (cf. isolement.mjs), sur une base NEUVE de la copie : jamais la base du bac, jamais la
 * vraie base. Les clubs des pièges portent leurs VRAIS numéros FotMob (manifeste de la base d'essai : Port Vale 9799,
 * Portsmouth 8462, FC Porto 9773, les deux « Nacional » 10214 et 49689…) ; les autres sont fabriqués (99xxxx), d'un seul
 * mot chacun, pour que la ressemblance des noms ne rapproche jamais deux clubs par hasard.
 *
 * Exporte : le magasin (`fabriquerLeMagasin`), les résultats importés, les saisies à la main, le carnet de paris et le
 * journal de pronostics de l'essai, et `ATTENDUS` (ce que le règlement doit décider, sélection par sélection).
 */

export const J = '2026-09-26';
const JOUR_MS = 86_400_000;
export const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const COUP = (jour, heure = '15:00') => `${jour}T${heure}:00Z`;

let numero = 990300;
const club = (nom, id = null) => ({ id: id ?? `fotmob-${numero++}`, nom });
export const CLUBS = {
  portVale: club('Port Vale', 'fotmob-9799'),
  portsmouth: club('Portsmouth', 'fotmob-8462'),
  porto: club('FC Porto', 'fotmob-9773'),
  exeter: club('Exeter City', 'fotmob-9833'),
  charlton: club('Charlton Athletic', 'fotmob-8451'),
  casaPia: club('Casa Pia AC', 'fotmob-212821'),
  portoB: club('Porto B', 'fotmob-990102'),
  wolfsberger: club('Wolfsberger AC', 'fotmob-990101'),
  sturm: club('Sturm Graz', 'fotmob-990103'),
  nacionalP: club('Nacional', 'fotmob-10214'),
  nacionalY: club('Nacional', 'fotmob-49689'),
  rioAve: club('Rio Ave', 'fotmob-990201'),
  olimpia: club('Olimpia', 'fotmob-990202')
};
for (const nom of ['Aldora', 'Brevik', 'Corvale', 'Dunmoor', 'Eskarra', 'Fennwick', 'Galdoro', 'Harlune', 'Istrava', 'Jorvik', 'Kelmarsh',
  'Lorvane', 'Mirador', 'Nordhavn', 'Ostrand', 'Pellucid', 'Quarrow', 'Rendale', 'Solvary', 'Tarnbeck', 'Ulvhamn', 'Varnholt', 'Wexmoor',
  'Yselberg', 'Bellmoor', 'Crestfall', 'Drummore', 'Elmsworth', 'Farrowdale', 'Glenmarsh', 'Hollinsby', 'Ironvale', 'Kestrel', 'Larkspur',
  'Marlow', 'Nettlebed', 'Orwell', 'Penhallow', 'Quillon', 'Rookwood', 'Saltash', 'Thornbury', 'Uvedale', 'Vexford', 'Ardmore', 'Belcastle',
  'Cobbleton', 'Dravenport']) {
  CLUBS[nom] = club(nom);
}

const COUPE = 'Coupe Fabriquée';
const but = (side, minute, extra = {}) => ({ type: 'goal', side, minute, ...extra });

/**
 * Les rencontres du magasin : { cle, date, league, home, away, hg, ag, meta, events (tableau, ou null = colonne NULL),
 * stats : { home: [corners, tirs, cadrés], away: [...] } — une ligne absente si le côté manque ; sans `stats` : aucune }.
 */
export function rencontres() {
  const C = CLUBS;
  const m = (cle, date, league, home, away, hg, ag, { reason = null, events, stats = { home: [5, 12, 4], away: [4, 9, 3] }, meta = null } = {}) => ({
    cle,
    date,
    league,
    home,
    away,
    hg,
    ag,
    meta: meta ?? { kickoff: COUP(date), ...(reason ? { reason } : {}) },
    events: events === undefined ? [...Array(hg)].map((_, i) => but('home', 10 + i)).concat([...Array(ag)].map((_, i) => but('away', 50 + i))) : events,
    stats
  });
  const J1 = plusJours(J, 1);
  const J4 = plusJours(J, 4);
  const J8 = plusJours(J, 8);
  return [
    // T-R1 : prolongation, 1-2 ; 1-1 à la 90e.
    m('r1', J, COUPE, C.Aldora, C.Brevik, 1, 2, { reason: 'afterextra', events: [but('home', 30), but('away', 75), but('away', 105)] }),
    // T-R1b : match retour, 2-1 à la 90e, 2-2 après prolongation.
    m('r1b', J, COUPE, C.Corvale, C.Dunmoor, 2, 2, { reason: 'afterextra', events: [but('home', 10), but('home', 50), but('away', 80), but('away', 100)] }),
    // T-R2 : déroulés incomplets (un but manquant, sans minute, sans camp) et absent.
    m('r2a', J, COUPE, C.Eskarra, C.Fennwick, 2, 1, { reason: 'afterextra', events: [but('home', 20), but('away', 30)] }),
    m('r2b', J, COUPE, C.Galdoro, C.Harlune, 2, 1, { reason: 'afterextra', events: [but('home', 20), but('home', null), but('away', 100)] }),
    m('r2c', J, COUPE, C.Istrava, C.Jorvik, 2, 1, { reason: 'afterextra', events: [but('home', 20), { type: 'goal', minute: 40 }, but('away', 100)] }),
    m('r2d', J, COUPE, C.Kelmarsh, C.Lorvane, 2, 1, { reason: 'afterextra', events: null }),
    // T-R3 : tirs au but sans prolongation (aucun événement après la 90e), 1-1.
    m('r3', J, COUPE, C.Mirador, C.Nordhavn, 1, 1, { reason: 'afterpenalties', events: [but('home', 12), but('away', 67), { type: 'card', side: 'home', minute: 85 }], stats: { home: [6, 14, 5], away: [5, 10, 4] } }),
    // T-R4 : but contre son camp d'un joueur du club qui reçoit à la 88e (crédité à l'extérieur).
    m('r4', J, COUPE, C.Ostrand, C.Pellucid, 1, 2, { reason: 'afterextra', events: [but('home', 20), but('away', 88, { ownGoal: true }), but('away', 110)] }),
    // T-R5 : but à la 90+4 (minute 90, temps ajouté 4), puis à la 115e.
    m('r5', J, COUPE, C.Quarrow, C.Rendale, 1, 1, { reason: 'afterextra', events: [but('home', 90, { addedTime: 4 }), but('away', 115)] }),
    // T-R6 : prolongation jouée puis tirs au but ; 0-0 à la 90e, buts à la 91e et à la 118e.
    m('r6', J, COUPE, C.Solvary, C.Tarnbeck, 1, 1, { reason: 'afterpenalties', events: [but('home', 91), but('away', 118)] }),
    // T-R7 : les noms proches, le même jour dans la même coupe ; FC Porto ailleurs.
    m('r7a', J, 'EFL Cup', C.portVale, C.exeter, 1, 0, { stats: { home: [6, 12, 4], away: [4, 9, 3] } }),
    m('r7b', J, 'EFL Cup', C.portsmouth, C.charlton, 0, 0, { stats: { home: [3, 7, 2], away: [2, 6, 1] } }),
    m('r7c', J, 'Primeira Liga - Portugal', C.porto, C.casaPia, 3, 1, { stats: { home: [9, 17, 7], away: [8, 11, 3] } }),
    m('r7d', J, 'EFL Cup', C.portoB, C.wolfsberger, 2, 1, { stats: { home: [5, 11, 4], away: [4, 8, 3] } }),
    // T-R7 : deux « Nacional » dans la même coupe, le même jour ; et la variante où l'annuaire prend le mauvais.
    m('r7n1', J, 'Copa Fabricada', C.nacionalP, C.Uvedale, 1, 0, { stats: { home: [7, 12, 4], away: [3, 9, 3] } }),
    m('r7n2', J, 'Copa Fabricada', C.nacionalY, C.Vexford, 2, 2, { stats: { home: [2, 8, 2], away: [6, 10, 5] } }),
    m('r7n3', J1, 'Taça Fabricada', C.nacionalP, C.rioAve, 2, 0, { stats: { home: [8, 15, 6], away: [2, 7, 2] } }),
    // Les championnats principaux des deux « Nacional » : celui de leur rencontre la plus RÉCENTE (identityRegistry,
    // dominante « recent ») — le Portugais, la Primeira Liga ; le Paraguayen, la Taça fabriquée.
    m('nP1', plusJours(J, 3), 'Primeira Liga - Portugal', C.nacionalP, C.casaPia, 1, 1),
    m('nP2', '2026-09-08', 'Primeira Liga - Portugal', C.porto, C.nacionalP, 2, 0),
    m('nY1', '2026-09-02', 'División Profesional - Paraguay', C.nacionalY, C.olimpia, 0, 0),
    m('nY2', '2026-09-03', 'Taça Fabricada', C.nacionalY, C.Cobbleton, 1, 0),
    m('nY3', plusJours(J, 2), 'Taça Fabricada', C.Cobbleton, C.nacionalY, 1, 2),
    m('nY4', plusJours(J, 5), 'Taça Fabricada', C.nacionalY, C.Dravenport, 3, 1),
    // T-R8 (b) : « Wolfsberg AC » au carnet, « Wolfsberger AC » au magasin ; un match normal, puis un match prolongé.
    m('r8b', J4, 'Bundesliga Fabriquée', C.wolfsberger, C.sturm, 2, 0, { stats: { home: [6, 13, 5], away: [4, 8, 2] } }),
    m('r8p', J8, 'Coupe d’Autriche Fabriquée', C.wolfsberger, C.sturm, 1, 2, { reason: 'afterextra', events: [but('home', 30), but('away', 60), but('away', 100)] }),
    // T-R8 (c) : enregistré dans l'autre sens au magasin.
    m('r8c', J, 'Ligue Fabriquée', C.Ulvhamn, C.Varnholt, 1, 1),
    // T-R8 (d) : un pari sans coup d'envoi, créé cinq jours avant.
    m('r8d', J, 'Ligue Fabriquée', C.Wexmoor, C.Yselberg, 2, 1, { stats: { home: [7, 14, 5], away: [5, 9, 3] } }),
    // T-R10 : saisie à la main sur un match prolongé (2-1 après prolongation, 1-1 à la 90e).
    m('r10', J, COUPE, C.Bellmoor, C.Crestfall, 2, 1, { reason: 'afterextra', events: [but('home', 30), but('away', 60), but('home', 100)] }),
    // T-R11 : scores qui ne s'accordent pas (prolongé ; normal avec corners).
    m('r11a', J, COUPE, C.Drummore, C.Elmsworth, 2, 2, { reason: 'afterextra', events: [but('home', 10), but('away', 20), but('home', 95), but('away', 110)] }),
    m('r11b', J, 'Ligue Fabriquée', C.Farrowdale, C.Glenmarsh, 2, 0, { stats: { home: [5, 12, 4], away: [5, 9, 3] } }),
    // T-R12 : deux rencontres des mêmes clubs, à un jour d'écart.
    m('r12a', J, 'Ligue Fabriquée', C.Hollinsby, C.Ironvale, 1, 0),
    m('r12b', J1, 'Ligue Fabriquée', C.Hollinsby, C.Ironvale, 0, 0),
    // T-R18 : statistiques non relevées — paire 0-0 ; aucune ligne ; une seule équipe relevée.
    m('r18a', J, 'Ligue Fabriquée', C.Kestrel, C.Larkspur, 1, 0, { stats: { home: [0, 0, 0], away: [0, 0, 0] } }),
    m('r18b', J, 'Ligue Fabriquée', C.Marlow, C.Nettlebed, 1, 0, { stats: null }),
    m('r18c', J, 'Ligue Fabriquée', C.Orwell, C.Penhallow, 1, 0, { stats: { home: [6, 12, 4] } }),
    // T-R20 : entré sans page FotMob (fin inconnue) ; et un match attribué sur tapis vert.
    m('r20', J, COUPE, C.Quillon, C.Rookwood, 1, 1, { events: null, stats: null, meta: { rev: 1, noSheet: true } }),
    m('r20b', J, 'Ligue Fabriquée', C.Saltash, C.Thornbury, 0, 3, { meta: { kickoff: COUP(J), awarded: true, reason: 'awarded_win' } }),
    // T-R19 : réglé à la 90e, puis le club n'est plus reconnu (voir revue-b du script).
    m('r19', J, COUPE, C.Ardmore, C.Belcastle, 0, 1, { reason: 'afterextra', events: [but('away', 120)] })
  ];
}

const COLONNES_STATS = ['corner_kicks', 'total_shots', 'shots_on_goal'];

/** Écrit les rencontres dans la base NEUVE de la copie (matches, team_stats), puis les annuaires (comme la nuit). */
export function fabriquerLeMagasin(database, { rebuildRegistries, liste = rencontres() } = {}) {
  const insMatch = database.prepare(
    `INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, fotmob_id, home_goals, away_goals, updated_at, events, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insStats = database.prepare(`INSERT INTO team_stats (match_key, side, ${COLONNES_STATS.join(', ')}) VALUES (?, ?, ?, ?, ?)`);
  database.exec('BEGIN');
  try {
    liste.forEach((r, i) => {
      const cle = `${r.date}-${r.cle}`;
      insMatch.run(cle, cle, r.date, r.league, r.home.nom, r.away.nom, r.home.id, r.away.id, String(7000000 + i), r.hg, r.ag, `${r.date}T23:00:00.000Z`,
        r.events === null ? null : JSON.stringify(r.events), JSON.stringify(r.meta));
      for (const side of ['home', 'away']) {
        const s = r.stats?.[side];
        if (s) insStats.run(cle, side, ...s);
      }
    });
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  rebuildRegistries({ database });
  return liste.length;
}

// ------------------------------------------------------------------ les résultats importés et les saisies

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const resultat = (date, home, away, league, hg, ag) => ({
  id: `r-${date}-${slug(home)}-${slug(away)}`,
  matchId: `web-${date}-${slug(home)}-${slug(away)}`,
  homeName: home,
  awayName: away,
  league,
  homeGoals: hg,
  awayGoals: ag,
  source: 'fotmob',
  settledAt: `${date}T23:30:00.000Z`
});
const saisie = (matchId, home, away, league, hg, ag) => ({ id: `s-${matchId}`, matchId, homeName: home, awayName: away, league, homeGoals: hg, awayGoals: ag, settledAt: `${plusJours(J, 1)}T08:00:00.000Z` });

export function resultats() {
  const C = CLUBS;
  const J1 = plusJours(J, 1);
  const J4 = plusJours(J, 4);
  const J8 = plusJours(J, 8);
  const r = (x) => resultat(J, x.home, x.away, x.league, x.hg, x.ag);
  return [
    r({ home: 'Aldora', away: 'Brevik', league: COUPE, hg: 1, ag: 2 }),
    r({ home: 'Corvale', away: 'Dunmoor', league: COUPE, hg: 2, ag: 2 }),
    r({ home: 'Eskarra', away: 'Fennwick', league: COUPE, hg: 2, ag: 1 }),
    r({ home: 'Galdoro', away: 'Harlune', league: COUPE, hg: 2, ag: 1 }),
    r({ home: 'Istrava', away: 'Jorvik', league: COUPE, hg: 2, ag: 1 }),
    r({ home: 'Kelmarsh', away: 'Lorvane', league: COUPE, hg: 2, ag: 1 }),
    r({ home: 'Mirador', away: 'Nordhavn', league: COUPE, hg: 1, ag: 1 }),
    r({ home: 'Ostrand', away: 'Pellucid', league: COUPE, hg: 1, ag: 2 }),
    r({ home: 'Quarrow', away: 'Rendale', league: COUPE, hg: 1, ag: 1 }),
    r({ home: 'Solvary', away: 'Tarnbeck', league: COUPE, hg: 1, ag: 1 }),
    r({ home: 'Port Vale', away: 'Exeter City', league: 'EFL Cup', hg: 1, ag: 0 }),
    r({ home: 'Portsmouth', away: 'Charlton Athletic', league: 'EFL Cup', hg: 0, ag: 0 }),
    r({ home: 'FC Porto', away: 'Casa Pia AC', league: 'Primeira Liga - Portugal', hg: 3, ag: 1 }),
    // Le piège : le carnet écrit « Port Vale – Wolfsberg AC » ; le magasin n'a, ce jour-là, que « Porto B – Wolfsberger AC ».
    r({ home: 'Port Vale', away: 'Wolfsberg AC', league: 'EFL Cup', hg: 2, ag: 1 }),
    r({ home: 'Nacional', away: 'Uvedale', league: 'Copa Fabricada', hg: 1, ag: 0 }),
    r({ home: 'Nacional', away: 'Vexford', league: 'Copa Fabricada', hg: 2, ag: 2 }),
    resultat(J1, 'Nacional', 'Rio Ave', 'Taça Fabricada', 2, 0),
    resultat(J4, 'Wolfsberg AC', 'Sturm Graz', 'Bundesliga Fabriquée', 2, 0),
    resultat(J8, 'Wolfsberg AC', 'Sturm Graz', 'Coupe d’Autriche Fabriquée', 1, 2),
    r({ home: 'Varnholt', away: 'Ulvhamn', league: 'Ligue Fabriquée', hg: 1, ag: 1 }),
    r({ home: 'Wexmoor', away: 'Yselberg', league: 'Ligue Fabriquée', hg: 2, ag: 1 }),
    r({ home: 'Drummore', away: 'Elmsworth', league: COUPE, hg: 2, ag: 1 }),
    r({ home: 'Farrowdale', away: 'Glenmarsh', league: 'Ligue Fabriquée', hg: 1, ag: 0 }),
    r({ home: 'Hollinsby', away: 'Ironvale', league: 'Ligue Fabriquée', hg: 1, ag: 0 }),
    r({ home: 'Kestrel', away: 'Larkspur', league: 'Ligue Fabriquée', hg: 1, ag: 0 }),
    r({ home: 'Marlow', away: 'Nettlebed', league: 'Ligue Fabriquée', hg: 1, ag: 0 }),
    r({ home: 'Orwell', away: 'Penhallow', league: 'Ligue Fabriquée', hg: 1, ag: 0 }),
    r({ home: 'Quillon', away: 'Rookwood', league: COUPE, hg: 1, ag: 1 }),
    r({ home: 'Saltash', away: 'Thornbury', league: 'Ligue Fabriquée', hg: 0, ag: 3 }),
    r({ home: 'Ardmore', away: 'Belcastle', league: COUPE, hg: 0, ag: 1 }),
    // T-R10 : Pierre tape 1-1 (la 90e) pour une sélection, 2-1 (le score final) pour une autre — la saisie fait foi.
    saisie('odds-r10a', 'Bellmoor', 'Crestfall', COUPE, 1, 1),
    saisie('odds-r10b', 'Bellmoor', 'Crestfall', COUPE, 2, 1),
    // Le résultat importé du même match (score final) : jamais pris pour ces deux sélections.
    r({ home: 'Bellmoor', away: 'Crestfall', league: COUPE, hg: 2, ag: 1 })
  ];
}

// ------------------------------------------------------------------ le carnet et les pronostics

const jambe = (id, home, away, league, market, pick, extra = {}) => ({
  matchId: `odds-${id}`,
  homeName: home,
  awayName: away,
  league,
  commenceTime: extra.commenceTime === undefined ? COUP(extra.jour ?? J) : extra.commenceTime,
  market,
  pick,
  odds: 1.9,
  status: 'pending',
  ...(extra.matchId ? { matchId: extra.matchId } : {}),
  ...(extra.marketId ? { marketId: extra.marketId, params: extra.params ?? {} } : {})
});
const simple = (id, leg, extra = {}) => {
  const { commenceTime: _c, jour: _j, matchId: _m, ...reste } = extra;
  return { id, createdAt: extra.createdAt ?? `${plusJours(J, -1)}T10:00:00.000Z`, settledAt: null, status: 'pending', stake: 10, odds: 1.9, legs: [leg], ...reste };
};

/** T-R18 : les huit libellés de corners et de tirs qui ont une règle, sur un match (domicile = `home`). */
const HUIT = (home) => [
  ['Total corners', 'Moins de 9.5'],
  ['Total corners', 'Plus de 9.5'],
  ['Total tirs cadrés', 'Moins de 7.5'],
  ['Qui fait le plus de corners', 'Égalité'],
  ['Qui fait le plus de tirs', home],
  ['Qui fait le plus de tirs cadrés', 'Égalité'],
  ['Tirs par équipe', `${home} Plus de 9.5`],
  ['Tirs cadrés par équipe', `${home} Plus de 3.5`]
];

export function carnet() {
  const COUPE_ = COUPE;
  const J1 = plusJours(J, 1);
  const J4 = plusJours(J, 4);
  const J8 = plusJours(J, 8);
  const b = [];
  const p = (id, home, away, league, market, pick, extra = {}) => b.push(simple(id, jambe(id, home, away, league, market, pick, extra), extra));
  // T-R1
  p('r1-dom', 'Aldora', 'Brevik', COUPE_, 'Résultat', 'Aldora');
  p('r1-nul', 'Aldora', 'Brevik', COUPE_, '1N2', 'Match nul');
  p('r1-plus', 'Aldora', 'Brevik', COUPE_, 'Total buts', 'Plus de 2.5 buts');
  p('r1-btts', 'Aldora', 'Brevik', COUPE_, 'Les 2 équipes marquent', 'Oui');
  p('r1-ext', 'Aldora', 'Brevik', COUPE_, 'Buts par équipe', 'Brevik — Plus de 1.5 buts');
  p('r1-rt', 'Aldora', 'Brevik', COUPE_, 'Résultat + Total buts', 'Nul & Moins de 2.5 buts');
  // T-R1b
  p('r1b-dom', 'Corvale', 'Dunmoor', COUPE_, 'Résultat', 'Corvale');
  // T-R2
  p('r2a', 'Eskarra', 'Fennwick', COUPE_, 'Résultat', 'Eskarra');
  p('r2b', 'Galdoro', 'Harlune', COUPE_, 'Résultat', 'Galdoro');
  p('r2c', 'Istrava', 'Jorvik', COUPE_, 'Résultat', 'Istrava');
  p('r2d', 'Kelmarsh', 'Lorvane', COUPE_, 'Résultat', 'Kelmarsh');
  // T-R3
  p('r3-dom', 'Mirador', 'Nordhavn', COUPE_, 'Résultat', 'Mirador');
  p('r3-nul', 'Mirador', 'Nordhavn', COUPE_, 'Résultat', 'Match nul');
  p('r3-corners', 'Mirador', 'Nordhavn', COUPE_, 'Total corners', 'Plus de 9.5', { marketId: 'totalCorners', params: { line: 9.5, side: 'over' } });
  // T-R4, T-R5, T-R6
  p('r4-nul', 'Ostrand', 'Pellucid', COUPE_, 'Résultat', 'Match nul');
  p('r4-ext', 'Ostrand', 'Pellucid', COUPE_, 'Résultat', 'Pellucid');
  p('r5-dom', 'Quarrow', 'Rendale', COUPE_, 'Résultat', 'Quarrow');
  p('r6-moins', 'Solvary', 'Tarnbeck', COUPE_, 'Total buts', 'Moins de 0.5 buts');
  // T-R7
  p('r7-portvale', 'Port Vale', 'Exeter City', 'EFL Cup', 'Total corners', 'Plus de 9.5');
  p('r7-portsmouth', 'Portsmouth', 'Charlton Athletic', 'EFL Cup', 'Total corners', 'Moins de 5.5');
  p('r7-porto', 'FC Porto', 'Casa Pia AC', 'Primeira Liga - Portugal', 'Total corners', 'Plus de 16.5');
  p('r7-piege', 'Port Vale', 'Wolfsberg AC', 'EFL Cup', 'Total corners', 'Plus de 7.5');
  p('r7-nacional-1', 'Nacional', 'Uvedale', 'Copa Fabricada', 'Total corners', 'Plus de 9.5');
  p('r7-nacional-2', 'Nacional', 'Vexford', 'Copa Fabricada', 'Total corners', 'Plus de 7.5');
  p('r7-nacional-variante', 'Nacional', 'Rio Ave', 'Taça Fabricada', 'Total corners', 'Plus de 9.5', { jour: J1 });
  // T-R8
  p('r8b-corners', 'Wolfsberg AC', 'Sturm Graz', 'Bundesliga Fabriquée', 'Total corners', 'Plus de 8.5', { jour: J4 });
  p('r8b-1n2', 'Wolfsberg AC', 'Sturm Graz', 'Bundesliga Fabriquée', 'Résultat', 'Wolfsberg AC', { jour: J4 });
  p('r8b-prolonge', 'Wolfsberg AC', 'Sturm Graz', 'Coupe d’Autriche Fabriquée', 'Résultat', 'Sturm Graz', { jour: J8 });
  p('r8c', 'Varnholt', 'Ulvhamn', 'Ligue Fabriquée', 'Total corners', 'Plus de 7.5');
  p('r8d', 'Wexmoor', 'Yselberg', 'Ligue Fabriquée', 'Total corners', 'Plus de 10.5', { commenceTime: null, createdAt: `${plusJours(J, -5)}T09:00:00.000Z` });
  // T-R10 : deux sélections, deux saisies (1-1, puis 2-1).
  p('r10-nul', 'Bellmoor', 'Crestfall', COUPE_, 'Résultat', 'Match nul', { matchId: 'odds-r10a' });
  p('r10-dom', 'Bellmoor', 'Crestfall', COUPE_, 'Résultat', 'Bellmoor', { matchId: 'odds-r10b' });
  // T-R11, T-R12
  p('r11-prolonge', 'Drummore', 'Elmsworth', COUPE_, 'Résultat', 'Drummore');
  p('r11-corners', 'Farrowdale', 'Glenmarsh', 'Ligue Fabriquée', 'Total corners', 'Plus de 8.5');
  p('r12', 'Hollinsby', 'Ironvale', 'Ligue Fabriquée', 'Total corners', 'Plus de 7.5');
  // T-R18 : huit libellés sur trois matchs aux statistiques non relevées.
  for (const [suffixe, home, away] of [['a', 'Kestrel', 'Larkspur'], ['b', 'Marlow', 'Nettlebed'], ['c', 'Orwell', 'Penhallow']]) {
    HUIT(home).forEach(([market, pick], i) => p(`r18${suffixe}-${i}`, home, away, 'Ligue Fabriquée', market, pick));
  }
  // T-R20
  p('r20', 'Quillon', 'Rookwood', COUPE_, 'Résultat', 'Match nul');
  p('r20-attribue', 'Saltash', 'Thornbury', 'Ligue Fabriquée', 'Résultat', 'Thornbury');
  // Un marché sans règle (libellé du moteur) : en attente « pas-de-regle ».
  p('sans-regle', 'Port Vale', 'Exeter City', 'EFL Cup', 'Total tirs', 'Plus de 20.5', { marketId: 'totalShots', params: { line: 20.5, side: 'over' } });
  // T-R14 : un combiné (sélection 0 réglée à la 90e, sélection 1 en attente), et les paris que la lecture ne touche pas.
  b.push({
    id: 'combine-90e',
    createdAt: `${plusJours(J, -1)}T11:00:00.000Z`,
    settledAt: null,
    status: 'pending',
    stake: 5,
    odds: 3.4,
    legs: [jambe('c0', 'Aldora', 'Brevik', COUPE_, '1N2', 'Match nul'), jambe('c1', 'Eskarra', 'Fennwick', COUPE_, 'Résultat', 'Eskarra')]
  });
  p('sans-resultat', 'Cobbleton', 'Dravenport', 'Ligue Fabriquée', 'Résultat', 'Cobbleton', { commenceTime: '2026-10-04T18:00:00Z' });
  p('tout-juste-fini', 'Dravenport', 'Cobbleton', 'Ligue Fabriquée', 'Résultat', 'Dravenport', { commenceTime: '2026-10-05T11:00:00Z' });
  p('a-venir', 'Cobbleton', 'Dravenport', 'Ligue Fabriquée', 'Résultat', 'Cobbleton', { commenceTime: '2026-10-07T18:00:00Z' });
  b.push({
    id: 'ancien-main',
    createdAt: '2026-08-01T10:00:00.000Z',
    settledAt: '2026-08-02T10:00:00.000Z',
    status: 'won',
    stake: 10,
    odds: 2,
    legs: [{ ...jambe('m0', 'Aldora', 'Brevik', COUPE_, 'Résultat', 'Aldora', { commenceTime: '2026-08-01T15:00:00Z' }), status: 'won', settledBy: 'manual' }]
  });
  return b;
}

/** T-R15 : le journal des pronostics — le règlement d'avant, mot pour mot (prolongé en attente, saisie, corners par les noms). */
export function pronostics() {
  const prono = (id, matchId, home, away, league, market, predictedOutcome, extra = {}) => ({
    id, matchId, homeName: home, awayName: away, league, market, predictedOutcome, predictedLabel: extra.predictedLabel ?? market, status: 'pending', settledAt: null,
    day: extra.day ?? plusJours(J, -1), commenceTime: extra.commenceTime ?? null, firstSeenAt: `${plusJours(J, -1)}T10:00:00.000Z`, lastSeenAt: `${plusJours(J, -1)}T10:00:00.000Z`,
    marketId: extra.marketId ?? null, params: extra.params ?? null
  });
  return [
    prono('p-prolonge', 'odds-p1', 'Aldora', 'Brevik', COUPE, 'Résultat', 'draw', { commenceTime: COUP(J) }),
    prono('p-saisie', 'odds-r10a', 'Bellmoor', 'Crestfall', COUPE, 'Résultat', 'draw', { commenceTime: COUP(J) }),
    prono('p-corners-noms', 'odds-p3', 'Wolfsberg AC', 'Sturm Graz', 'Bundesliga Fabriquée', 'Total corners', 'over', { commenceTime: COUP(plusJours(J, 4)), marketId: 'totalCorners', params: { line: 8.5, side: 'over' } })
  ];
}

/** Ce que le règlement doit décider (statut, score réglé, ou code d'attente), sélection par sélection. */
export const ATTENDUS = Object.freeze({
  'r1-dom': { status: 'lost', score: '1-1 à la 90e (prolongation)' },
  'r1-nul': { status: 'won', score: '1-1 à la 90e (prolongation)' },
  'r1-plus': { status: 'lost', score: '1-1 à la 90e (prolongation)' },
  'r1-btts': { status: 'won', score: '1-1 à la 90e (prolongation)' },
  'r1-ext': { status: 'lost', score: '1-1 à la 90e (prolongation)' },
  'r1-rt': { status: 'won', score: '1-1 à la 90e (prolongation)' },
  'r1b-dom': { status: 'won', score: '2-1 à la 90e (prolongation)' },
  r2a: { code: 'prolongation-deroule-incomplet' },
  r2b: { code: 'prolongation-deroule-incomplet' },
  r2c: { code: 'prolongation-deroule-incomplet' },
  r2d: { code: 'prolongation-sans-deroule' },
  'r3-dom': { status: 'lost', score: '1-1 à la 90e (tirs au but)' },
  'r3-nul': { status: 'won', score: '1-1 à la 90e (tirs au but)' },
  'r3-corners': { code: 'prolongation-statistiques' },
  'r4-nul': { status: 'won', score: '1-1 à la 90e (prolongation)' },
  'r4-ext': { status: 'lost', score: '1-1 à la 90e (prolongation)' },
  'r5-dom': { status: 'won', score: '1-0 à la 90e (prolongation)' },
  'r6-moins': { status: 'won', score: '0-0 à la 90e (prolongation et tirs au but)' },
  'r7-portvale': { status: 'won', score: '1-0' },
  'r7-portsmouth': { status: 'won', score: '0-0' },
  'r7-porto': { status: 'won', score: '3-1' },
  'r7-piege': { code: 'equipe-non-reconnue' },
  'r7-nacional-1': { code: 'equipe-non-reconnue' },
  'r7-nacional-2': { code: 'equipe-non-reconnue' },
  'r7-nacional-variante': { code: 'match-introuvable' },
  'r8b-corners': { code: 'equipe-non-reconnue' },
  'r8b-1n2': { status: 'won', score: '2-0' },
  'r8b-prolonge': { code: 'prolongation-non-identifiee' },
  r8c: { code: 'match-introuvable' },
  r8d: { status: 'won', score: '2-1' },
  'r10-nul': { status: 'won', score: '1-1' },
  'r10-dom': { status: 'won', score: '2-1' },
  'r11-prolonge': { code: 'scores-divergents' },
  'r11-corners': { code: 'scores-divergents' },
  r12: { code: 'deux-rencontres' },
  ...Object.fromEntries(['a', 'b', 'c'].flatMap((s) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [`r18${s}-${i}`, { code: 'statistiques-non-relevees' }]))),
  r20: { code: 'fin-inconnue' },
  'r20-attribue': { code: 'match-attribue' },
  'sans-regle': { code: 'pas-de-regle' }
});
