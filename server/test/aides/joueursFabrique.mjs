/**
 * UN MAGASIN FABRIQUÉ pour les essais des chiffres des joueurs (étape 34, lot 1a, 03/11/2026) — ce n'est PAS un fichier
 * de test. Exécuté DANS une copie de travail (cf. isolement.mjs), sur une base NEUVE de la copie : jamais la base du bac,
 * jamais la vraie base, et AUCUN résultat réel (le banc est unique ; les essais n'utilisent que des matchs fabriqués).
 *
 * Trois compétitions fabriquées, des clubs et des joueurs aux identifiants FotMob fictifs :
 *   « Ligue Joueurs » (12 clubs, tous les 4 jours) : feuilles complètes (titulaires, banc listé avec des remplaçants non
 *     entrés, entrées en jeu), xG et xG hors penalty des joueurs (les cinq cas de la règle P : présent, absent multiple de
 *     0,785, absent sous 0,70, absent inconnu, xG absent), tirs cadrés (Σ = la ligne d'équipe, sauf quelques camps),
 *     passes décisives (colonne, et passeur nommé au déroulé), déroulés complets (buts, csc, penalties marqués et manqués,
 *     cartons dont des deuxièmes jaunes et des cartons « not_on_pitch », remplacements) ; des feuilles où seuls les
 *     remplaçants entrés sont listés (critique, constat 2) ; des joueurs sans identifiant ; des camps à playerStats vide ;
 *   « Ligue Sans xG » (8 clubs, tous les 7 jours) : aucune xG des joueurs (les buts se lisent au déroulé) ;
 *   « Coupe Joueurs » : des clubs de la Ligue Joueurs, avec prolongations, tirs au but et un résultat attribué.
 * Une fusion d'identité (people_merges) : un joueur change d'identifiant à mi-parcours (ses feuilles réécrites, son
 * ancien identifiant gardé au déroulé). Les tables écrites : matches, team_stats, players, day_matches, team_day
 * (fenêtres f10 des tirs cadrés), people_merges. Tout vient d'un générateur à graine : le même magasin à chaque fois.
 * `effet` : la force d'un écart propre au joueur (0 = aucun écart entre joueurs d'un même poste).
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

export const LIGUE = 'Ligue Joueurs';
export const SANS_XG = 'Ligue Sans xG';
export const COUPE = 'Coupe Joueurs';
const POSTES = ['Goalkeeper', 'Goalkeeper', 'Defender', 'Defender', 'Defender', 'Defender', 'Defender', 'Sweeper', 'Midfielder', 'Midfielder', 'Midfielder', 'Midfielder', 'Midfielder', 'Midfielder', 'Forward', 'Forward', 'Forward', 'Forward'];
/** La part « vraie » d'un poste dans les occasions de l'équipe (par 90 minutes). */
const PART_DU_POSTE = { Goalkeeper: 0.002, Defender: 0.04, Sweeper: 0.04, Midfielder: 0.1, Forward: 0.25 };

const poisson = (u, l) => {
  let k = 0;
  let p = Math.exp(-l);
  let s = p;
  const x = u();
  while (x > s && k < 15) {
    k++;
    p *= l / k;
    s += p;
  }
  return k;
};
const tirer = (u, poids) => {
  const total = poids.reduce((s, w) => s + w, 0);
  let x = u() * total;
  for (let i = 0; i < poids.length; i++) {
    x -= poids[i];
    if (x <= 0) return i;
  }
  return poids.length - 1;
};

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
 * ÉCRIT le magasin fabriqué dans `database` (une base NEUVE). Options : `debut`, `jours`, `graine`, `effet`. Rend
 * { matchs, joueurs, fusion: { de, vers, le } } (chaque match avec ce qui a été écrit).
 */
export function fabriquerLeMagasinDesJoueurs(database, { debut = '2023-01-02', jours = 160, graine = 34, effet = 0.4 } = {}) {
  const u = generateur(graine);
  const ligue = Array.from({ length: 12 }, (_, i) => 7001 + i);
  const sansXg = Array.from({ length: 8 }, (_, i) => 7101 + i);
  const effectifs = new Map();
  for (const club of [...ligue, ...sansXg]) {
    effectifs.set(
      club,
      POSTES.map((poste, k) => ({ id: club * 100 + k, poste, talent: Math.exp((u() - 0.5) * 2 * effet), averti: Math.exp((u() - 0.5) * 2 * effet), tireur: k === 14 }))
    );
  }
  const fusion = { de: `fotmob-${7001 * 100 + 15}`, vers: `fotmob-${7001 * 100 + 15 + 50}`, le: plusJours(debut, Math.floor(jours / 2)) };
  let matchs = [...calendrier(ligue, LIGUE, debut, jours, 4), ...calendrier(sansXg, SANS_XG, debut, jours, 7, 1)];
  for (let j = 10; j < jours; j += 21) {
    const d = plusJours(debut, j);
    for (let i = 0; i < 3; i++) matchs.push({ date: d, league: COUPE, home: ligue[(i * 3 + j) % 12], away: ligue[(i * 3 + j + 5) % 12] });
  }
  matchs = matchs.filter((m) => m.home !== m.away).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.league < b.league ? -1 : a.league > b.league ? 1 : a.home - b.home));
  const insMatch = database.prepare(
    `INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, fotmob_id, home_goals, away_goals, updated_at, events, lineups, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
  );
  const insStats = database.prepare('INSERT INTO team_stats (match_key, side, yellow_cards, red_cards, corner_kicks, total_shots, shots_on_goal) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insPlayer = database.prepare(
    `INSERT INTO players (match_key, side, player_key, ord, player_id, name, position, shirt_number, starter, subbed_in, sub_in_minute, sub_out_minute,
       minutes, rating, goals, assists, shots, shots_on_target, xg, xa, xg_non_penalty, touches, passes, yellow_cards, own_goals)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insDay = database.prepare('INSERT INTO day_matches (match_key, fotmob_id, date, league, saison, home, away, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insTeam = database.prepare(
    `INSERT INTO team_day (rencontre, camp, club, adversaire, date, league, saison, attribue, prolongation, compte, coupe, releve, bp, bc, bp90, bc90, xg_p, xg_c,
       tirs_p, tirs_c, cadres_p, cadres_c, f10_cadres_p, f10_cadres_c, f10_cadres_n)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  database.prepare('INSERT INTO people_merges (from_id, to_id, evidence, created_at) VALUES (?, ?, ?, ?)').run(fusion.de, fusion.vers, 'essai : même joueur', `${fusion.le}T00:00:00.000Z`);
  const fenetres = new Map();
  const ecrits = [];
  database.exec('BEGIN');
  try {
    matchs.forEach((m, i) => {
      const matchKey = `joueurs-${m.date}-${m.home}-${m.away}`;
      const fotmobId = String(9_000_000 + i);
      const coupe = m.league === COUPE;
      const attribue = coupe && i % 23 === 7;
      const reason = attribue ? 'awarded_win' : coupe && i % 4 === 1 ? 'afterextra' : coupe && i % 4 === 3 ? 'afterpenalties' : null;
      const avecXg = m.league !== SANS_XG;
      const events = [];
      const camps = {};
      for (const [side, club, adv] of [['home', m.home, m.away], ['away', m.away, m.home]]) {
        const eff = effectifs.get(club);
        // La composition : 1 gardien, 4 défenseurs, 4 milieux, 2 attaquants, avec rotation ; 7 remplaçants listés.
        const parPoste = (p) => eff.filter((x) => (p === 'Defender' ? x.poste === 'Defender' || x.poste === 'Sweeper' : x.poste === p));
        const choisir = (liste, n) => [...liste].sort((a, b) => (u() < 0.15 ? 1 : 0) - (u() < 0.15 ? 1 : 0) || a.id - b.id).slice(0, n);
        const titulaires = [...choisir(parPoste('Goalkeeper'), 1), ...choisir(parPoste('Defender'), 4), ...choisir(parPoste('Midfielder'), 4), ...choisir(parPoste('Forward'), 2)];
        const banc = eff.filter((x) => !titulaires.includes(x)).slice(0, 7);
        const entrants = banc.filter((x) => x.poste !== 'Goalkeeper').slice(0, 3);
        const sortants = [titulaires[10], titulaires[8], titulaires[4]];
        const minutes = new Map(titulaires.map((x) => [x, 90]));
        entrants.forEach((x, k) => {
          const mi = 60 + k * 10;
          minutes.set(x, 90 - mi);
          minutes.set(sortants[k], mi);
          events.push({ type: 'substitution', side, minute: mi, playerIn: `Joueur ${x.id}`, playerOut: `Joueur ${sortants[k].id}` });
        });
        const presents = [...titulaires, ...entrants];
        // Les buts : Poisson ; le buteur selon sa part vraie × minutes ; penalties au tireur ; csc de l'adversaire.
        const lambda = (side === 'home' ? 1.45 : 1.15) * (m.league === SANS_XG ? 0.9 : 1);
        const buts = poisson(u, lambda);
        const poids = presents.map((x) => PART_DU_POSTE[x.poste] * x.talent * minutes.get(x));
        const st = presents.map(() => ({ buts: 0, pen: 0, passes: 0, xg: 0, xgPen: 0, cadres: 0, cartons: 0 }));
        for (let b = 0; b < buts; b++) {
          const minute = 1 + Math.floor(u() * 90);
          const tirage = u();
          if (tirage < 0.03) {
            // But contre son camp d'un joueur adverse : crédité à ce camp, au déroulé seulement.
            const victime = effectifs.get(adv)[2 + Math.floor(u() * 6)];
            events.push({ type: 'goal', side, minute, player: `Joueur ${victime.id}`, playerId: `fotmob-${victime.id}`, ownGoal: true });
            continue;
          }
          let k;
          let penalty = false;
          if (tirage < 0.13) {
            penalty = true;
            k = presents.findIndex((x) => x.tireur);
            if (k < 0) k = tirer(u, poids);
          } else k = tirer(u, poids);
          const x = presents[k];
          st[k].buts += 1;
          st[k].cadres += 1;
          if (penalty) {
            st[k].pen += 1;
            st[k].xgPen += 0.785;
          } else st[k].xg += 0.1 + u() * 0.4;
          let idAuDeroule = `fotmob-${x.id}`;
          const e = { type: 'goal', side, minute, player: `Joueur ${x.id}`, playerId: idAuDeroule };
          if (penalty) {
            e.penalty = true;
            e.detail = 'Penalty';
          }
          if (!penalty && u() < 0.6) {
            const passeur = tirer(u, presents.map((y, j) => (j === k ? 0 : PART_DU_POSTE[y.poste] + 0.05)));
            st[passeur].passes += 1;
            e.assist = `Joueur ${presents[passeur].id}`;
          }
          events.push(e);
        }
        // Un penalty manqué de temps en temps.
        if (u() < 0.04) {
          const k = presents.findIndex((x) => x.tireur);
          if (k >= 0) {
            st[k].xgPen += 0.785;
            events.push({ type: 'missedpenalty', side, minute: 30 + Math.floor(u() * 50), player: `Joueur ${presents[k].id}`, playerId: `fotmob-${presents[k].id}` });
          }
        }
        // Les tirs non convertis et les occasions.
        presents.forEach((x, k) => {
          const n = poisson(u, 2.2 * PART_DU_POSTE[x.poste] * x.talent * (minutes.get(x) / 90) * 4);
          for (let s = 0; s < n; s++) {
            st[k].xg += 0.04 + u() * 0.1;
            if (u() < 0.4) st[k].cadres += 1;
          }
        });
        // Les cartons, joueur par joueur (et parfois au banc).
        const nCartons = poisson(u, 1.9);
        const ligneCartons = { y: 0, yr: 0, r: 0 };
        for (let c = 0; c < nCartons; c++) {
          const k = tirer(u, presents.map((x) => (x.poste === 'Goalkeeper' ? 0.2 : 1) * x.averti));
          const x = presents[k];
          const minute = 5 + Math.floor(u() * 85);
          st[k].cartons += 1;
          if (u() < 0.05) {
            events.push({ type: 'card', side, minute, player: 'Entraîneur adjoint', card: 'yellow', note: 'not_on_pitch' });
            ligneCartons.y += 1;
          } else if (u() < 0.06) {
            events.push({ type: 'card', side, minute, player: `Joueur ${x.id}`, playerId: `fotmob-${x.id}`, card: 'yellow' });
            events.push({ type: 'card', side, minute: Math.min(90, minute + 4), player: `Joueur ${x.id}`, playerId: `fotmob-${x.id}`, card: 'yellowred' });
            ligneCartons.y += 1;
            ligneCartons.yr += 1;
          } else {
            const rouge = u() < 0.04;
            events.push({ type: 'card', side, minute, player: `Joueur ${x.id}`, playerId: `fotmob-${x.id}`, card: rouge ? 'red' : 'yellow' });
            if (rouge) ligneCartons.r += 1;
            else ligneCartons.y += 1;
          }
        }
        camps[side] = { club, titulaires, banc, entrants, minutes, presents, st, buts, ligneCartons };
      }
      events.sort((a, b) => a.minute - b.minute);
      const butsDe = (side) => events.filter((e) => e.type === 'goal' && e.side === side).length;
      const hg = butsDe('home');
      const ag = butsDe('away');
      const prol = reason === 'afterextra' || reason === 'afterpenalties' ? 1 : 0;
      const meta = { kickoff: `${m.date}T19:00:00.000Z`, ...(attribue ? { awarded: true } : {}), ...(reason ? { reason } : {}) };
      const maj = `${m.date}T23:59:00.000Z`;
      insMatch.run(matchKey, matchKey, m.date, m.league, `Club ${m.home}`, `Club ${m.away}`, `fotmob-${m.home}`, `fotmob-${m.away}`, fotmobId, hg, ag, maj, JSON.stringify(events), JSON.stringify(meta));
      const cadresEq = {};
      const vides = {};
      for (const side of ['home', 'away']) {
        const c = camps[side];
        // playerStats vide (aucune statistique publiée) pour quelques camps ; « remplaçants seuls » pour d'autres.
        vides[side] = u() < 0.04;
        const remplacantsSeuls = u() < 0.08;
        const lignes = [];
        let ord = 0;
        const ajouterLigne = (x, starter) => {
          const k = c.presents.indexOf(x);
          const joue = k >= 0;
          const s = joue ? c.st[k] : null;
          const apresFusion = `fotmob-${x.id}` === fusion.de && m.date >= fusion.le;
          let pid = apresFusion ? fusion.vers : `fotmob-${x.id}`;
          if (!joue && !starter && remplacantsSeuls) return; // non entré, non listé (la relecture : absent de playerStats)
          if (x.id % 97 === 3 && u() < 0.5) pid = null; // un joueur sans identifiant
          let xg = null;
          let xgnp = null;
          if (avecXg && joue && !vides[side] && s.xg + s.xgPen > 0) {
            xg = Number((s.xg + s.xgPen).toFixed(2));
            const r = u();
            if (s.xgPen > 0 && s.xg === 0 && r < 0.6) xgnp = null; // cas 2 : FotMob omet un xG hors penalty NUL (xG multiple de 0,785)
            else if (s.xgPen === 0 && r < 0.03) xgnp = null; // absent : cas 3 sous 0,70, cas 4 (inconnu) sinon
            else xgnp = Number(s.xg.toFixed(2)); // cas 1 (écart penalty ou écart 0)
          }
          const cadres = joue && !vides[side] ? s.cadres : null;
          lignes.push({
            pid,
            name: `Joueur ${x.id}`,
            position: starter ? x.poste : u() < 0.3 ? null : x.poste,
            starter: starter ? 1 : 0,
            subbed_in: !starter && joue ? 1 : 0,
            minutes: joue ? c.minutes.get(x) : starter ? 0 : null,
            rating: joue && !vides[side] ? 6 + u() * 2 : null,
            goals: joue ? s.buts || null : null,
            assists: joue && !vides[side] ? s.passes || null : null,
            shots: cadres === null ? null : cadres + 1,
            shots_on_target: cadres || null,
            xg,
            xa: avecXg && joue && !vides[side] ? Number((s.passes * 0.3 + u() * 0.2).toFixed(2)) || null : null,
            xgnp,
            touches: joue && !vides[side] ? 20 + Math.floor(u() * 60) : null,
            passes: joue && !vides[side] ? 10 + Math.floor(u() * 50) : null,
            yellow: joue ? s.cartons || null : null,
            ord: ord++
          });
        };
        c.titulaires.forEach((x) => ajouterLigne(x, true));
        c.banc.forEach((x) => ajouterLigne(x, false));
        for (const l of lignes) {
          insPlayer.run(matchKey, side, l.pid ?? `nom:${l.name}`, l.ord, l.pid, l.name, l.position, null, l.starter, l.subbed_in, null, null, l.minutes, l.rating, l.goals, l.assists, l.shots, l.shots_on_target, l.xg, l.xa, l.xgnp, l.touches, l.passes, l.yellow, null);
        }
        const somme = lignes.reduce((s, l) => s + (l.shots_on_target ?? 0), 0);
        cadresEq[side] = vides[side] ? 3 : somme + (u() < 0.03 ? 1 : 0);
        // La ligne d'équipe des cartons à la convention de FotMob (jaunes − deuxièmes jaunes, rouges + deuxièmes jaunes).
        const lc = c.ligneCartons;
        insStats.run(matchKey, side, lc.y - lc.yr, lc.r + lc.yr, 5, cadresEq[side] + 6, cadresEq[side]);
      }
      const r = insDay.run(matchKey, fotmobId, m.date, m.league, 2023, m.home, m.away, maj);
      const rencontre = Number(r.lastInsertRowid);
      const f10 = (club) => {
        const f = fenetres.get(club) ?? [];
        const n = Math.min(10, f.length);
        const der = f.slice(-10);
        return [der.reduce((s, x) => s + x[0], 0), der.reduce((s, x) => s + x[1], 0), n];
      };
      const fh = f10(m.home);
      const fa = f10(m.away);
      const xgEq = (side) => Number(camps[side].st.reduce((s, x) => s + x.xg + x.xgPen, 0).toFixed(2));
      insTeam.run(rencontre, 1, m.home, m.away, m.date, m.league, 2023, attribue ? 1 : 0, prol, 1, coupe ? 1 : 0, 1, hg, ag, prol ? Math.max(0, hg - 1) : hg, prol ? ag : ag, xgEq('home'), xgEq('away'), cadresEq.home + 6, cadresEq.away + 6, cadresEq.home, cadresEq.away, ...fh);
      insTeam.run(rencontre, 0, m.away, m.home, m.date, m.league, 2023, attribue ? 1 : 0, prol, 1, coupe ? 1 : 0, 1, ag, hg, prol ? ag : ag, prol ? Math.max(0, hg - 1) : hg, xgEq('away'), xgEq('home'), cadresEq.away + 6, cadresEq.home + 6, cadresEq.away, cadresEq.home, ...fa);
      for (const [club, side, adv] of [[m.home, 'home', 'away'], [m.away, 'away', 'home']]) {
        const f = fenetres.get(club) ?? [];
        f.push([cadresEq[side], cadresEq[adv]]);
        fenetres.set(club, f);
      }
      ecrits.push({ ...m, matchKey, fotmobId, rencontre, attribue, reason, hg, ag, vides });
    });
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return { matchs: ecrits, joueurs: [...effectifs.values()].flat().length, fusion };
}
