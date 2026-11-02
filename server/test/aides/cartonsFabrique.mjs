/**
 * UN MAGASIN FABRIQUÉ pour les essais des cartons (étape 33, lot 1a, 02/11/2026) — ce n'est PAS un fichier de test.
 * Exécuté DANS une copie de travail (cf. isolement.mjs), sur une base NEUVE de la copie : jamais la base du bac, jamais la
 * vraie base, et AUCUN résultat réel (le banc est unique ; les essais n'utilisent que des matchs fabriqués).
 *
 * Trois compétitions fabriquées, des clubs aux identifiants FotMob fictifs :
 *   « Ligue Test » (12 clubs, aller-retour tous les 3 ou 4 jours) : déroulés complets (remplacements des deux camps),
 *     cartons joueur par joueur (jaunes, deuxièmes jaunes, rouges, cartons du banc « not_on_pitch », cartons notés après
 *     la 90e), lignes d'équipe à la convention de FotMob (jaunes − deuxièmes jaunes, rouges + deuxièmes jaunes), avec
 *     des écarts d'un carton, des désaccords, des lignes absentes et des jaunes « fabriqués » à 0 sur une période ;
 *   « Ligue Zéro » (6 clubs) : beaucoup de déroulés complets SANS carton et de lignes 0-0 (la garde des vrais zéros) ;
 *   « Liga Buts » (6 clubs) : des déroulés de buts seulement (aucun remplacement : jamais relevés) ;
 *   « Coupe Test » : des clubs de la Ligue Test, avec prolongations, tirs au but et un résultat attribué.
 * Des arbitres (dont deux homonymes de pays différents, des matchs sans arbitre), avec les moyennes que FotMob affiche
 * (que rien ne doit lire). Les tables écrites : matches, team_stats, day_matches, team_day (fenêtres f10, corners, tirs,
 * tirs cadrés). Tout vient d'un générateur à graine : le même magasin, ligne pour ligne, à chaque fois.
 */

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

export const LIGUE = 'Ligue Test';
export const ZERO = 'Ligue Zéro';
export const BUTS = 'Liga Buts';
export const COUPE = 'Coupe Test';
export const ARBITRES = Object.freeze([
  { name: 'Clément Arbitre', country: 'France' },
  { name: 'Jean Dupont', country: 'France' },
  { name: 'Jean Dupont', country: 'Belgium' },
  { name: 'Anna Svensson', country: 'Sweden' },
  { name: 'Marco Rossi', country: 'Italy' },
  null
]);

const poisson = (u, l) => {
  let k = 0;
  let p = Math.exp(-l);
  let s = p;
  const x = u();
  while (x > s && k < 12) {
    k++;
    p *= l / k;
    s += p;
  }
  return k;
};

/** Le calendrier d'une compétition : journées aller puis retour (méthode du cercle), tous les `pas` jours. Pur. */
function calendrier(ids, league, debut, jours, pas, decalage = 0) {
  const n = ids.length;
  const rondes = [];
  const rot = [...ids];
  for (let r = 0; r < n - 1; r++) {
    const paires = [];
    for (let i = 0; i < n / 2; i++) paires.push(r % 2 ? [rot[n - 1 - i], rot[i]] : [rot[i], rot[n - 1 - i]]);
    rondes.push(paires);
    rot.splice(1, 0, rot.pop());
  }
  const out = [];
  let ronde = 0;
  for (let j = decalage; j < jours; j += pas) {
    const date = plusJours(debut, j);
    const retour = Math.floor(ronde / rondes.length) % 2 === 1;
    for (const [h, a] of rondes[ronde % rondes.length]) out.push({ date, league, home: retour ? a : h, away: retour ? h : a });
    ronde++;
  }
  return out;
}

/**
 * ÉCRIT le magasin fabriqué dans `database` (une base NEUVE). Rend { matchs } (chaque match avec ce qui a été écrit).
 * Options : `debut` (premier jour), `jours`, `graine`, `aZeroDe` / `aZeroA` (jaunes « fabriqués » à 0 en Ligue Test).
 */
export function fabriquerLeMagasinDesCartons(database, { debut = '2023-01-02', jours = 150, graine = 33, aZeroDe = null, aZeroA = null } = {}) {
  const u = generateur(graine);
  const ligue = Array.from({ length: 12 }, (_, i) => 6001 + i);
  const zero = Array.from({ length: 6 }, (_, i) => 6101 + i);
  const buts = Array.from({ length: 6 }, (_, i) => 6201 + i);
  const effet = new Map([...ligue, ...zero, ...buts].map((id) => [id, { prend: Math.exp((u() - 0.5) * 0.6), fait: Math.exp((u() - 0.5) * 0.6) }]));
  let matchs = [...calendrier(ligue, LIGUE, debut, jours, 4), ...calendrier(zero, ZERO, debut, jours, 7, 1), ...calendrier(buts, BUTS, debut, jours, 7, 2)];
  for (let j = 10; j < jours; j += 21) {
    const d = plusJours(debut, j);
    for (let i = 0; i < 4; i++) matchs.push({ date: d, league: COUPE, home: ligue[(i * 3 + j) % 12], away: ligue[(i * 3 + j + 5) % 12] });
  }
  matchs = matchs.filter((m) => m.home !== m.away).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.league < b.league ? -1 : a.league > b.league ? 1 : a.home - b.home));
  const insMatch = database.prepare(
    `INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, fotmob_id, home_goals, away_goals, updated_at, events, lineups, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
  );
  const insStats = database.prepare('INSERT INTO team_stats (match_key, side, yellow_cards, red_cards, corner_kicks, total_shots, shots_on_goal) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insDay = database.prepare('INSERT INTO day_matches (match_key, fotmob_id, date, league, saison, home, away, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insTeam = database.prepare(
    `INSERT INTO team_day (rencontre, camp, club, adversaire, date, league, saison, attribue, prolongation, compte, coupe, releve, bp, bc, bp90, bc90,
       tirs_p, tirs_c, cadres_p, cadres_c, corners_p, corners_c, jaunes_p, jaunes_c, rouges_p, rouges_c,
       f10_corners_p, f10_corners_c, f10_corners_n, f10_tirs_p, f10_tirs_c, f10_tirs_n, f10_cadres_p, f10_cadres_c, f10_cadres_n)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const joues = new Map();
  const ecrits = [];
  database.exec('BEGIN');
  try {
    matchs.forEach((m, i) => {
      const matchKey = `cartons-${m.date}-${m.home}-${m.away}`;
      const fotmobId = String(8_000_000 + i);
      const coupe = m.league === COUPE;
      const attribue = coupe && i % 37 === 11;
      const reason = attribue ? 'awarded_win' : coupe && i % 5 === 1 ? 'afterextra' : coupe && i % 5 === 3 ? 'afterpenalties' : null;
      const hg = poisson(u, 1.4);
      const ag = poisson(u, 1.1);
      const arbitre = ARBITRES[(i * 7) % ARBITRES.length];
      // Les cartons, joueur par joueur.
      const events = [];
      const complet = m.league !== BUTS;
      for (let g = 0; g < hg; g++) events.push({ type: 'goal', side: 'home', minute: 1 + Math.floor(u() * 89) });
      for (let g = 0; g < ag; g++) events.push({ type: 'goal', side: 'away', minute: 1 + Math.floor(u() * 89) });
      if (complet) for (const side of ['home', 'away']) for (let s = 0; s < 3; s++) events.push({ type: 'substitution', side, minute: 55 + s * 10, playerIn: `E${s}`, playerOut: `S${s}` });
      const vide = m.league === ZERO && u() < 0.3;
      const comptes = { home: { y: 0, yr: 0, r: 0 }, away: { y: 0, yr: 0, r: 0 } };
      if (complet && !vide) {
        for (const [side, club, adv, base] of [['home', m.home, m.away, 1.8], ['away', m.away, m.home, 2.1]]) {
          const n = poisson(u, base * effet.get(club).prend * effet.get(adv).fait);
          let k = 0;
          for (let c = 0; c < n; c++) {
            const joueur = `fotmob-${club * 100 + (k++ % 11)}`;
            const minute = u() < 0.06 ? 91 + Math.floor(u() * 5) : 5 + Math.floor(u() * 85);
            if (u() < 0.07) {
              events.push({ type: 'card', side, minute, player: `Joueur ${joueur}`, playerId: joueur, card: 'yellow' });
              events.push({ type: 'card', side, minute: Math.min(90, minute + 3), player: `Joueur ${joueur}`, playerId: joueur, card: 'yellowred' });
              comptes[side].y += 1;
              comptes[side].yr += 1;
            } else if (u() < 0.04) {
              events.push({ type: 'card', side, minute, player: `Joueur ${joueur}`, playerId: joueur, card: 'red' });
              comptes[side].r += 1;
            } else if (u() < 0.05) {
              events.push({ type: 'card', side, minute, player: 'Entraîneur adjoint', card: 'yellow', note: 'not_on_pitch' });
              comptes[side].y += 1;
            } else {
              events.push({ type: 'card', side, minute, player: `Joueur ${joueur}`, playerId: joueur, card: 'yellow' });
              comptes[side].y += 1;
            }
          }
        }
      }
      events.sort((a, b) => a.minute - b.minute);
      // La ligne d'équipe de FotMob : jaunes − deuxièmes jaunes, rouges + deuxièmes jaunes ; parfois fausse ou absente.
      const ligne = (c) => ({ j: c.y - c.yr, r: c.r + c.yr });
      let lh = ligne(comptes.home);
      let la = ligne(comptes.away);
      const tirage = u();
      let sansLigne = false;
      if (tirage < 0.05) lh = { ...lh, j: lh.j + 1 };
      else if (tirage < 0.07) la = { ...la, j: la.j + 2 };
      else if (tirage < 0.1) sansLigne = true;
      if (m.league === LIGUE && aZeroDe && m.date >= aZeroDe && m.date <= (aZeroA ?? '9999-12-31')) {
        lh = { ...lh, j: 0 };
        la = { ...la, j: 0 };
      }
      const corners = [poisson(u, 5.2), poisson(u, 4.4)];
      const tirs = [poisson(u, 12.5), poisson(u, 10.2)];
      const cadres = [poisson(u, 4.4), poisson(u, 3.6)];
      const meta = {
        kickoff: `${m.date}T19:00:00.000Z`,
        ...(arbitre ? { referee: { name: arbitre.name, country: arbitre.country, yellowCardsPerMatch: 4.4, foulsPerMatch: 22.1, matches: 12, redCards: 1 } } : {}),
        ...(attribue ? { awarded: true } : {}),
        ...(reason ? { reason } : {})
      };
      const maj = `${m.date}T23:59:00.000Z`;
      insMatch.run(matchKey, matchKey, m.date, m.league, `Club ${m.home}`, `Club ${m.away}`, `fotmob-${m.home}`, `fotmob-${m.away}`, fotmobId, hg, ag, maj, JSON.stringify(events), JSON.stringify(meta));
      if (!sansLigne) {
        insStats.run(matchKey, 'home', lh.j, lh.r, corners[0], tirs[0], cadres[0]);
        insStats.run(matchKey, 'away', la.j, la.r, corners[1], tirs[1], cadres[1]);
      }
      const r = insDay.run(matchKey, fotmobId, m.date, m.league, 2023, m.home, m.away, maj);
      const rencontre = Number(r.lastInsertRowid);
      const prol = reason === 'afterextra' || reason === 'afterpenalties' ? 1 : 0;
      const f10 = (club) => {
        const n = Math.min(10, joues.get(club) ?? 0);
        return [Math.round(n * (5 + u())), Math.round(n * (4.6 + u())), n, Math.round(n * (12 + u() * 2)), Math.round(n * (11 + u() * 2)), n, Math.round(n * (4 + u())), Math.round(n * (3.8 + u())), n];
      };
      const fh = f10(m.home);
      const fa = f10(m.away);
      const lig = (x, y) => (sansLigne ? [null, null] : [x, y]);
      insTeam.run(rencontre, 1, m.home, m.away, m.date, m.league, 2023, attribue ? 1 : 0, prol, 1, coupe ? 1 : 0, 1, hg, ag, hg, ag, ...lig(tirs[0], tirs[1]), ...lig(cadres[0], cadres[1]), ...lig(corners[0], corners[1]), ...lig(lh.j, la.j), ...lig(lh.r, la.r), ...fh);
      insTeam.run(rencontre, 0, m.away, m.home, m.date, m.league, 2023, attribue ? 1 : 0, prol, 1, coupe ? 1 : 0, 1, ag, hg, ag, hg, ...lig(tirs[1], tirs[0]), ...lig(cadres[1], cadres[0]), ...lig(corners[1], corners[0]), ...lig(la.j, lh.j), ...lig(la.r, lh.r), ...fa);
      joues.set(m.home, (joues.get(m.home) ?? 0) + 1);
      joues.set(m.away, (joues.get(m.away) ?? 0) + 1);
      ecrits.push({ ...m, matchKey, fotmobId, rencontre, arbitre, attribue, reason, comptes, complet, vide, sansLigne });
    });
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return { matchs: ecrits };
}
