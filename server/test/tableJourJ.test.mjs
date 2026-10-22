/**
 * La table du jour J (étape 17 du plan, 12/10/2026).
 *   node --test test/tableJourJ.test.mjs        (depuis server/)
 *
 * Les règles pures tournent ici, sans base ni réseau ; tout ce qui ouvre une
 * base tourne dans des copies isolées de la base d'essai (isolement.mjs :
 * réseau coupé, heure figée au 05/10/2026 12 h UTC), par
 * test/aides/script-table-jour-j.mjs, en trois phases :
 *   construction  la construction, l'exactitude face aux lecteurs du moteur
 *                 (201 cibles + 150 lignes tirées), les lectures, le contrôle
 *                 anti-fuite et deux fuites plantées ; puis, ICI, des lignes
 *                 tirées au hasard recalculées en SQL sur la copie (date < J)
 *                 et les comptes refaits depuis les tables sources ;
 *   nuit          les pièges de la nuit un par un (match tardif, même jour,
 *                 changement de date, annulée, attribuée après coup, fusion,
 *                 feuille relue sans un joueur, rien ne change), une nuit
 *                 ordinaire en petit, une panne au milieu et la reprise ;
 *   etape         l'étape « tableJourJ » de l'actualisation et la route
 *                 GET /api/match-stats/day-table, qui ne font que lire.
 * Les valeurs attendues ne sont jamais recopiées d'une sortie : les lecteurs
 * du moteur, une requête SQL écrite ici, ou un compte fait à la main.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';

const imp = (rel) => import(pathToFileURL(path.join(SERVEUR, 'src', rel)).href);
const T = await imp('data/db/dayTable.js');
const { seasonOf, seasonBounds } = await imp('data/providers/seasonWindows.js');
const { countsForTable } = await imp('data/db/matchStatsRead.js');
const { isCup } = await imp('data/providers/leagueCups.js');
const UI = path.resolve(SERVEUR, '..', 'ui');
const U = await import(pathToFileURL(path.join(UI, 'src', 'utils', 'tableJourJ.js')).href);
const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-table-jour-j.mjs');

/** Une phase du script d'essai dans une copie isolée ; `apres(copie)` lit la copie avant qu'elle soit effacée. */
function phase(nom, { scripts = false, apres = null } = {}) {
  const copie = preparerCopie({});
  try {
    if (scripts) fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, SCRIPT, { args: [nom], timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(0, 3000));
    assert.equal(r.reseau, false, 'aucun appel réseau');
    return { ...r.json, lu: apres ? apres(copie, r.json) : null };
  } finally {
    copie.nettoyer();
  }
}

/** Le tirage à graine (mulberry32), pour choisir ici d'autres lignes que celles du contrôle. */
function mulberry(graine) {
  let s = graine >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NON_ATTRIBUE = "COALESCE(json_extract(m.meta, '$.awarded'), 0) <> 1 AND COALESCE(json_extract(m.meta, '$.reason'), '') NOT IN ('awarded_win', 'id_reused')";
const JOUE = 'm.home_goals IS NOT NULL AND m.away_goals IS NOT NULL';
const somme = (liste, f) => liste.reduce((t, x) => t + f(x), 0);
const joursAvant = (iso, n) => {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - n);
  return t.toISOString().slice(0, 10);
};

/**
 * Une ligne de team_day recalculée ICI, en SQL sur les tables sources, avec `date < J` écrit en toutes lettres — un
 * troisième chemin, ni celui de la construction ni celui du contrôle (qui passe par les lecteurs du moteur).
 */
function equipeEnSql(db, r) {
  const id = `fotmob-${r.club}`;
  const J = r.date;
  const L = r.league;
  const rencontre = (k) => db.prepare('SELECT rencontre FROM day_matches WHERE match_key = ?').get(k)?.rencontre ?? null;
  const out = {};
  // (a) 30 + 30 candidats relevés, réunis du plus récent au plus ancien ; 10 relevés au plus (règle 0-0).
  const cote = (col, dom) => {
    const [moi, lui] = dom ? ['th', 'ta'] : ['ta', 'th'];
    return `SELECT * FROM (SELECT m.date, m.match_key k, ${moi}.corner_kicks cp, ${lui}.corner_kicks cc, ${moi}.total_shots tp, ${lui}.total_shots tc,
        ${moi}.shots_on_goal sp, ${lui}.shots_on_goal sc
      FROM matches m JOIN team_stats th ON th.match_key = m.match_key AND th.side = 'home' JOIN team_stats ta ON ta.match_key = m.match_key AND ta.side = 'away'
      WHERE m.${col} = ? AND m.date < ? AND m.home_goals IS NOT NULL ORDER BY m.date DESC, m.match_key DESC LIMIT 30)`;
  };
  const candidats = db.prepare(`${cote('home_id', true)} UNION ALL ${cote('away_id', false)} ORDER BY date DESC, k DESC`).all(id, J, id, J);
  for (const [s, p, c] of [['corners', 'cp', 'cc'], ['tirs', 'tp', 'tc'], ['cadres', 'sp', 'sc']]) {
    const retenus = candidats.filter((x) => x[p] !== null && x[c] !== null && !(x[p] === 0 && x[c] === 0)).slice(0, 10);
    out[`f10_${s}_p`] = somme(retenus, (x) => x[p]);
    out[`f10_${s}_c`] = somme(retenus, (x) => x[c]);
    out[`f10_${s}_n`] = retenus.length;
  }
  // (b) les 5 derniers matchs joués, toutes compétitions, attribués exclus.
  const f5 = db
    .prepare(`SELECT m.match_key k FROM matches m WHERE (m.home_id = ? OR m.away_id = ?) AND m.date < ? AND ${JOUE} AND ${NON_ATTRIBUE} ORDER BY m.date DESC, m.match_key DESC LIMIT 5`)
    .all(id, id, J)
    .map((x) => rencontre(x.k));
  for (let k = 0; k < 5; k++) out[`f5_${k + 1}`] = f5[k] ?? null;
  // (c) la saison de J dans L, attribués exclus ; moins de 6 : tout l'historique dans L.
  const sesMatchs = (exclureAttribues) =>
    db
      .prepare(`SELECT m.date, (m.home_id = ?) dom, m.home_goals hg, m.away_goals ag FROM matches m WHERE (m.home_id = ? OR m.away_id = ?) AND m.league = ? AND m.date < ? AND ${JOUE}${exclureAttribues ? ` AND ${NON_ATTRIBUE}` : ''}`)
      .all(id, id, id, L, J);
  const sommes = (liste, prefixe) => {
    const dom = liste.filter((x) => x.dom);
    const ext = liste.filter((x) => !x.dom);
    out[`${prefixe}_bp_dom`] = somme(dom, (x) => x.hg);
    out[`${prefixe}_bc_dom`] = somme(dom, (x) => x.ag);
    out[`${prefixe}_n_dom`] = dom.length;
    out[`${prefixe}_bp_ext`] = somme(ext, (x) => x.ag);
    out[`${prefixe}_bc_ext`] = somme(ext, (x) => x.hg);
    out[`${prefixe}_n_ext`] = ext.length;
  };
  const dansL = sesMatchs(true);
  const [deb, fin] = seasonBounds(L, seasonOf(L, J));
  const saisonJ = dansL.filter((x) => x.date >= deb && x.date < fin);
  sommes(saisonJ.length >= 6 ? saisonJ : dansL, 's');
  out.s_en_saison = saisonJ.length >= 6 ? 1 : 0;
  // (d) la saison la plus récente de L qui a un match avant J, attribués comptés ; moins de 6 : tout l'historique dans L.
  const derniere = db.prepare('SELECT MAX(date) d FROM matches WHERE league = ? AND date < ?').get(L, J).d;
  out.g_saison = derniere ? seasonOf(L, derniere) : null;
  const tousDansL = sesMatchs(false);
  const [dg, fg] = out.g_saison !== null ? seasonBounds(L, out.g_saison) : [null, null];
  const saisonG = out.g_saison !== null ? tousDansL.filter((x) => x.date >= dg && x.date < fg) : tousDansL;
  sommes(saisonG.length >= 6 ? saisonG : tousDansL, 'g');
  // Les faits du match.
  const m = db.prepare('SELECT * FROM matches WHERE match_key = ?').get(r.match_key);
  const st = Object.fromEntries(db.prepare('SELECT * FROM team_stats WHERE match_key = ?').all(r.match_key).map((x) => [x.side, x]));
  const [moi, lui] = r.camp === 1 ? [st.home, st.away] : [st.away, st.home];
  out.bp = r.camp === 1 ? m.home_goals : m.away_goals;
  out.bc = r.camp === 1 ? m.away_goals : m.home_goals;
  out.releve = st.home && st.away ? 1 : 0;
  const xgOk = st.home?.expected_goals != null && st.away?.expected_goals != null;
  out.xg_p = xgOk ? moi.expected_goals : null;
  out.xg_c = xgOk ? lui.expected_goals : null;
  for (const [s, col] of [['tirs', 'total_shots'], ['cadres', 'shots_on_goal'], ['corners', 'corner_kicks'], ['jaunes', 'yellow_cards'], ['rouges', 'red_cards'], ['fautes', 'fouls'], ['occasions', 'big_chances']]) {
    out[`${s}_p`] = moi?.[col] ?? null;
    out[`${s}_c`] = lui?.[col] ?? null;
  }
  const meta = JSON.parse(m.meta ?? '{}') ?? {};
  out.attribue = meta.awarded === 1 || meta.awarded === true || ['awarded_win', 'id_reused'].includes(meta.reason) ? 1 : 0;
  out.prolongation = ['afterextra', 'afterpenalties'].includes(meta.reason) ? 1 : 0;
  out.compte = countsForTable(meta) ? 1 : 0;
  out.coupe = isCup(m.league) ? 1 : 0;
  // Retouche du 13/10 : aussi le jour, le championnat, la saison, les deux clubs, la possession.
  const num = (id) => Number(String(id).replace(/^fotmob-/, ''));
  out.date = m.date;
  out.league = m.league;
  out.saison = seasonOf(m.league, m.date);
  out.club = num(r.camp === 1 ? m.home_id : m.away_id);
  out.adversaire = num(r.camp === 1 ? m.away_id : m.home_id);
  out.possession_p = moi?.ball_possession ?? null;
  return out;
}

/** Une ligne de player_day recalculée ICI en SQL : ses 10 dernières apparitions jouées d'un jour < J, hors matchs attribués. */
function joueurEnSql(db, r) {
  const pid = `fotmob-${r.joueur}`;
  const lignes = db
    .prepare(
      `SELECT p.minutes, p.rating, p.goals, p.xg,
         (SELECT expected_goals FROM team_stats WHERE match_key = m.match_key AND side = 'home') xh,
         (SELECT expected_goals FROM team_stats WHERE match_key = m.match_key AND side = 'away') xa
       FROM players p JOIN matches m ON m.match_key = p.match_key
       WHERE p.player_id = ? AND m.date < ? AND (p.minutes > 0 OR p.starter = 1) AND ${NON_ATTRIBUE}
       ORDER BY m.date DESC, m.match_key DESC LIMIT 10`
    )
    .all(pid, r.date);
  const notes = lignes.filter((l) => l.rating !== null);
  const couverts = lignes.filter((l) => l.xh !== null && l.xa !== null);
  const cle = db.prepare('SELECT match_key FROM day_matches WHERE rencontre = ?').get(r.rencontre).match_key;
  const p = db.prepare('SELECT * FROM players WHERE player_id = ? AND match_key = ?').get(pid, cle);
  const joue = (p.minutes !== null && p.minutes > 0) || p.starter === 1 ? 1 : 0;
  // Retouche du 13/10 : toutes les colonnes de faits, règles de couverture écrites ici (jamais faitsDUneFeuille).
  const m = db.prepare('SELECT date, home_id, away_id FROM matches WHERE match_key = ?').get(cle);
  const st = Object.fromEntries(db.prepare('SELECT side, expected_goals, xgot, yellow_cards FROM team_stats WHERE match_key = ?').all(cle).map((x) => [x.side, x]));
  const xgMatch = st.home?.expected_goals != null && st.away?.expected_goals != null;
  const xgotMatch = st.home?.xgot != null && st.away?.xgot != null;
  const jaunesReleves = st.home?.yellow_cards != null && st.away?.yellow_cards != null && st.home.yellow_cards + st.away.yellow_cards > 0;
  const zeroSiJoue = (v) => (joue ? v ?? 0 : null);
  const mille = (v) => Math.round((v ?? 0) * 1000);
  const postes = { Goalkeeper: 1, Defender: 2, Midfielder: 3, Forward: 4, Sweeper: 5 };
  const toutes = {
    date: m.date,
    club: Number(String(p.side === 'home' ? m.home_id : m.away_id).replace(/^fotmob-/, '')),
    entre: p.subbed_in,
    poste: postes[p.position] ?? null,
    passes_d: zeroSiJoue(p.assists),
    tirs: zeroSiJoue(p.shots),
    cadres: zeroSiJoue(p.shots_on_target),
    pc: zeroSiJoue(p.key_passes),
    recup: zeroSiJoue(p.recoveries),
    duels_g: zeroSiJoue(p.duels_won),
    duels_t: zeroSiJoue(p.duels_total),
    buts_concedes: zeroSiJoue(p.goals_conceded),
    csc: zeroSiJoue(p.own_goals),
    xg: joue && xgMatch ? mille(p.xg) : null,
    xa: joue && xgMatch ? mille(p.xa) : null,
    xgnp: joue && xgMatch ? mille(p.xg_non_penalty) : null,
    xgot: joue && xgotMatch ? mille(p.xgot) : null,
    buts_evites: p.goals_prevented === null ? null : Math.round(p.goals_prevented * 100),
    jaunes: joue && jaunesReleves ? p.yellow_cards ?? 0 : null,
    rouges: joue && jaunesReleves ? p.red_cards ?? 0 : null,
    entre_min: joue ? p.sub_in_minute : null,
    sorti_min: joue ? p.sub_out_minute : null
  };
  return {
    ...toutes,
    a10_n: lignes.length,
    a10_min: somme(lignes, (l) => l.minutes ?? 0),
    a10_note_s: somme(notes, (l) => Math.round(l.rating * 100)),
    a10_note_n: notes.length,
    a10_buts: somme(lignes, (l) => l.goals ?? 0),
    a10_xg: couverts.length ? somme(couverts, (l) => Math.round((l.xg ?? 0) * 1000)) : null,
    joue,
    titulaire: p.starter,
    minutes: p.minutes,
    note: p.rating === null ? null : Math.round(p.rating * 100),
    buts: joue ? p.goals ?? 0 : null,
    camp: p.side === 'home' ? 1 : 0
  };
}

/** Les colonnes qui diffèrent (1e-9 près pour les REAL). */
function ecartsDeColonnes(stocke, attendu) {
  return Object.entries(attendu)
    .filter(([c, v]) => {
      const s = stocke[c] ?? null;
      const a = v ?? null;
      return typeof s === 'number' && typeof a === 'number' ? Math.abs(s - a) > 1e-9 : s !== a;
    })
    .map(([c, v]) => `${c} : table ${stocke[c]}, SQL ${v}`);
}

/**
 * league_day ENTIÈRE refaite ici depuis les rencontres de chaque championnat : (e1) la saison de J (attribués et hors
 * classement exclus), moins de 30 → les 365 jours (J − 365 compris), moins de 10 → défaut ; xG et tirs cadrés quand
 * les deux côtés sont connus (0-0 compris) ; (e2) la saison la plus récente avec un match avant J, hors classement
 * exclus, attribués comptés.
 */
function ligueEnJs(db) {
  const parLigue = new Map();
  const lignes = db
    .prepare(
      `SELECT m.league, m.date, m.home_goals hg, m.away_goals ag, m.meta, th.expected_goals xh, ta.expected_goals xa, th.shots_on_goal sh, ta.shots_on_goal sa
       FROM matches m LEFT JOIN team_stats th ON th.match_key = m.match_key AND th.side = 'home' LEFT JOIN team_stats ta ON ta.match_key = m.match_key AND ta.side = 'away'
       WHERE m.home_goals IS NOT NULL AND m.away_goals IS NOT NULL`
    )
    .all();
  for (const m of lignes) {
    let meta = {};
    let lisible = true;
    try {
      meta = JSON.parse(m.meta ?? '{}') ?? {};
    } catch {
      lisible = false;
    }
    const attribue = lisible && (meta.awarded === 1 || meta.awarded === true || ['awarded_win', 'id_reused'].includes(meta.reason));
    if (!parLigue.has(m.league)) parLigue.set(m.league, []);
    parLigue.get(m.league).push({ ...m, attribue, compte: !lisible || countsForTable(meta) });
  }
  const faux = [];
  let verifiees = 0;
  for (const l of db.prepare('SELECT * FROM league_day').all()) {
    const ms = (parLigue.get(l.league) ?? []).filter((m) => m.date < l.date);
    const [deb, fin] = seasonBounds(l.league, seasonOf(l.league, l.date));
    const ok = ms.filter((m) => !m.attribue && m.compte);
    let fen = ok.filter((m) => m.date >= deb && m.date < fin);
    let source = 'saison';
    if (fen.length < 30) {
      const unAn = joursAvant(l.date, 365);
      fen = ok.filter((m) => m.date >= unAn);
      source = '365 jours';
    }
    if (fen.length < 10) source = 'défaut';
    const xg = fen.filter((m) => m.xh !== null && m.xa !== null);
    const cad = fen.filter((m) => m.sh !== null && m.sa !== null);
    const derniere = ms.reduce((a, m) => (a === null || m.date > a ? m.date : a), null);
    const cSaison = derniere ? seasonOf(l.league, derniere) : null;
    const [dc, fc] = cSaison !== null ? seasonBounds(l.league, cSaison) : [null, null];
    const cl = cSaison !== null ? ms.filter((m) => m.compte && m.date >= dc && m.date < fc) : [];
    const attendu = {
      l_source: source,
      l_n: fen.length,
      l_bd: somme(fen, (m) => m.hg),
      l_be: somme(fen, (m) => m.ag),
      l_xg_n: xg.length,
      l_xd: somme(xg, (m) => m.xh),
      l_xe: somme(xg, (m) => m.xa),
      l_cad_n: cad.length,
      l_cd: somme(cad, (m) => m.sh),
      l_ce: somme(cad, (m) => m.sa),
      c_saison: cSaison,
      c_n: cl.length,
      c_bd: somme(cl, (m) => m.hg),
      c_be: somme(cl, (m) => m.ag)
    };
    verifiees++;
    const e = ecartsDeColonnes(l, attendu);
    if (e.length) faux.push(`${l.league} ${l.date} : ${e.join(' ; ')}`);
  }
  // (d) : la saison « la plus récente de L avec un match avant J », pour TOUTES les lignes équipe.
  const gFaux = db
    .prepare('SELECT t.rencontre, t.camp, t.league, t.date, t.g_saison, (SELECT MAX(m.date) FROM matches m WHERE m.league = t.league AND m.date < t.date) derniere FROM team_day t')
    .all()
    .filter((r) => (r.g_saison ?? null) !== (r.derniere ? seasonOf(r.league, r.derniere) : null))
    .map((r) => `${r.rencontre}|${r.camp} ${r.league} ${r.date} : ${r.g_saison} au lieu de ${r.derniere ? seasonOf(r.league, r.derniere) : null}`);
  return { faux: faux.slice(0, 10), nFaux: faux.length, verifiees, gFaux: gFaux.slice(0, 10), nGFaux: gFaux.length };
}

/** Ce que le test lit dans la copie de la phase « construction », avant qu'elle soit effacée. */
function lireLaCopie(copie, sortie) {
  const db = new DatabaseSync(copie.base, { readOnly: true });
  try {
    const un = (sql, ...a) => db.prepare(sql).get(...a);
    const lu = {
      comptes: {
        registre: un('SELECT COUNT(*) n FROM day_matches').n,
        registreDistinct: un('SELECT COUNT(DISTINCT rencontre) r, COUNT(DISTINCT match_key) k FROM day_matches'),
        magasin: un("SELECT COUNT(*) n FROM matches WHERE home_id GLOB 'fotmob-[1-9]*' AND away_id GLOB 'fotmob-[1-9]*' AND home_id NOT GLOB 'fotmob-*[^0-9]*' AND away_id NOT GLOB 'fotmob-*[^0-9]*'").n,
        equipe: un('SELECT COUNT(*) n FROM team_day').n,
        joueur: un('SELECT COUNT(*) n FROM player_day').n,
        feuilles: un(
          "SELECT COUNT(*) n FROM (SELECT DISTINCT p.player_id, p.match_key FROM players p JOIN day_matches d ON d.match_key = p.match_key WHERE p.player_id GLOB 'fotmob-[1-9]*' AND p.player_id NOT GLOB 'fotmob-*[^0-9]*' AND p.side IN ('home', 'away'))"
        ).n,
        // Les lignes sans identifiant de la base d'essai (la rencontre plantée par la phase mise à part).
        sansIdentifiant: un("SELECT COUNT(*) n FROM players p JOIN matches m ON m.match_key = p.match_key WHERE p.player_id IS NULL AND COALESCE(m.fotmob_id, '') <> '990000100'").n,
        dernierJour: un('SELECT MAX(date) d FROM matches').d,
        ligues: un('SELECT COUNT(*) n FROM (SELECT DISTINCT league, date FROM matches)').n,
        lignesLigue: un('SELECT COUNT(*) n FROM league_day').n
      },
      avantVides: un('SELECT COUNT(*) n FROM team_day WHERE f10_corners_n IS NULL OR f10_tirs_n IS NULL OR f10_cadres_n IS NULL OR s_n_dom IS NULL OR s_n_ext IS NULL OR g_n_dom IS NULL OR g_n_ext IS NULL OR s_en_saison IS NULL').n,
      formeVideAvecHistorique: un('SELECT COUNT(*) n FROM team_day t WHERE t.f5_1 IS NULL AND EXISTS (SELECT 1 FROM team_day u WHERE u.club = t.club AND u.date < t.date AND u.attribue = 0)').n,
      formeSansHistorique: un('SELECT COUNT(*) n FROM team_day t WHERE t.f5_1 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM team_day u WHERE u.club = t.club AND u.date < t.date)').n,
      a10Vides: un('SELECT COUNT(*) n FROM player_day WHERE a10_n IS NULL OR a10_min IS NULL OR a10_note_n IS NULL OR a10_buts IS NULL').n,
      reels: un('SELECT COUNT(*) n FROM player_day WHERE typeof(note) = \'real\' OR typeof(xg) = \'real\' OR typeof(a10_xg) = \'real\' OR typeof(buts_evites) = \'real\'').n
    };
    // Les indicateurs, rencontre par rencontre, face aux tables sources.
    const indic = { prolongees: 0, tirsAuBut: 0, prolongeesFausses: [], a90Complets: 0, a90Incomplets: 0, a90Faux: [], horsClassement: 0, compteFaux: [], sansStats: 0, releveFaux: [], coupes: 0, coupeFausse: [] };
    const lignes = db.prepare('SELECT d.match_key, t.camp, t.bp, t.bc, t.bp90, t.bc90, t.prolongation, t.compte, t.releve, t.coupe FROM day_matches d JOIN team_day t ON t.rencontre = d.rencontre').all();
    const matchs = new Map(db.prepare('SELECT match_key, league, home_goals hg, away_goals ag, meta, events, (SELECT COUNT(*) FROM team_stats s WHERE s.match_key = m.match_key) stats FROM matches m').all().map((m) => [m.match_key, m]));
    for (const l of lignes) {
      const m = matchs.get(l.match_key);
      const meta = JSON.parse(m.meta ?? '{}') ?? {};
      const prolonge = ['afterextra', 'afterpenalties'].includes(meta.reason);
      if (l.camp === 1 && prolonge) {
        indic.prolongees++;
        if (meta.reason === 'afterpenalties') indic.tirsAuBut++;
      }
      if (l.prolongation !== (prolonge ? 1 : 0) || (prolonge && l.bp90 !== null && l.bp90 > l.bp)) indic.prolongeesFausses.push(l.match_key);
      // Le déroulé complet : tous les buts du score, chacun avec sa minute et son camp crédité.
      const ev = JSON.parse(m.events ?? 'null');
      const buts = Array.isArray(ev) ? ev.filter((e) => e?.type === 'goal') : null;
      const complet =
        buts !== null &&
        buts.length === m.hg + m.ag &&
        buts.every((b) => Number.isFinite(Number(b.minute)) && b.minute !== null && (b.side === 'home' || b.side === 'away')) &&
        buts.filter((b) => b.side === 'home').length === m.hg;
      const attendu90 = complet ? (prolonge ? buts.filter((b) => b.side === (l.camp === 1 ? 'home' : 'away') && Number(b.minute) <= 90).length : l.camp === 1 ? m.hg : m.ag) : null;
      if (l.camp === 1) indic[complet ? 'a90Complets' : 'a90Incomplets']++;
      if (l.bp90 !== attendu90) indic.a90Faux.push(`${l.match_key}|${l.camp}`);
      const compte = countsForTable(meta) ? 1 : 0;
      if (l.camp === 1 && !compte) indic.horsClassement++;
      if (l.compte !== compte) indic.compteFaux.push(l.match_key);
      if (l.camp === 1 && m.stats === 0) indic.sansStats++;
      if (l.releve !== (m.stats === 2 ? 1 : 0)) indic.releveFaux.push(l.match_key);
      if (l.camp === 1 && isCup(m.league)) indic.coupes++;
      if (l.coupe !== (isCup(m.league) ? 1 : 0)) indic.coupeFausse.push(l.match_key);
    }
    lu.indicateurs = indic;
    // 60 lignes équipe et 40 lignes joueur tirées ICI (une autre graine que le contrôle), recalculées en SQL.
    const tirer = mulberry(2026);
    const equipes = db.prepare('SELECT t.*, d.match_key FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre ORDER BY t.rencontre, t.camp').all();
    const joueurs = db.prepare('SELECT * FROM player_day ORDER BY joueur, date, rencontre').all();
    const prendre = (liste, n) => {
      const vus = new Set();
      while (vus.size < Math.min(n, liste.length)) vus.add(Math.floor(tirer() * liste.length));
      return [...vus].map((i) => liste[i]);
    };
    lu.equipesSql = prendre(equipes, 60).map((r) => ({ cle: `${r.match_key}|${r.camp}`, ecarts: ecartsDeColonnes(r, equipeEnSql(db, r)), avecHistorique: r.f10_corners_n > 0 || r.f5_1 !== null }));
    lu.joueursSql = prendre(joueurs, 40).map((r) => ({ cle: `${r.joueur}|${r.date}|${r.rencontre}`, ecarts: ecartsDeColonnes(r, joueurEnSql(db, r)), avecHistorique: r.a10_n > 0 }));
    lu.ligue = ligueEnJs(db);
    // Les cas rares plantés avant la construction : les faits tels quels, le titulaire sans minutes (et sa ligne suivante).
    const pl = sortie.plantes;
    const faitsDe = (k) => db.prepare('SELECT t.camp, t.cadres_p, t.cadres_c, t.xg_p, t.xg_c FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre WHERE d.match_key = ? ORDER BY t.camp').all(k);
    const lignesDuTitulaire = db
      .prepare('SELECT p.* FROM player_day p JOIN day_matches d ON d.rencontre = p.rencontre WHERE p.joueur = ? AND p.date >= (SELECT date FROM matches WHERE match_key = ?) ORDER BY p.date, p.rencontre LIMIT 2')
      .all(pl.titulaire.joueur, pl.titulaire.matchKey);
    lu.plantes = {
      cadres00: faitsDe(pl.cadres00),
      xgUnCote: faitsDe(pl.xgUnCote),
      titulaire: lignesDuTitulaire.map((r) => ({ joue: r.joue, minutes: r.minutes, ecarts: ecartsDeColonnes(r, joueurEnSql(db, r)) }))
    };
    return lu;
  } finally {
    db.close();
  }
}

let C;
let N;
let E;
before(() => {
  C = phase('construction', { apres: lireLaCopie });
  N = phase('nuit');
  E = phase('etape', { scripts: true });
});

// ============================================================ 1. la construction

test('construction : les cinq tables créées à l’ouverture, une rencontre = une ligne au registre et deux lignes équipe, une ligne par joueur identifié et par feuille ; numéros uniques ; l’état ; moins de 2 s en rendant la main', () => {
  assert.deepEqual(C.tables, ['day_matches', 'day_state', 'league_day', 'player_day', 'team_day']);
  assert.equal(C.etatAvant.absente, true);
  assert.equal(C.etatAvant.aJour, false);
  const b = C.construction;
  assert.equal(b.mode, 'construction');
  assert.equal(b.erreur, null);
  assert.equal(b.rencontres.magasin, 2156);
  assert.deepEqual(b.rencontres.refusees, []);
  // Comptes refaits depuis les tables sources (la copie finale porte une rencontre plantée de plus : la phase en plante une).
  const k = C.lu.comptes;
  assert.equal(k.registre, k.magasin);
  assert.deepEqual([k.registreDistinct.r, k.registreDistinct.k], [k.registre, k.registre], 'numéro et clé uniques');
  assert.equal(k.equipe, 2 * k.registre);
  assert.equal(k.joueur, k.feuilles, 'une ligne par joueur identifié et par feuille');
  assert.equal(k.lignesLigue, k.ligues, 'une ligne par championnat et par jour de match');
  assert.equal(b.comptes.rencontres, 2156);
  assert.equal(b.comptes.lignesEquipe, 4312);
  assert.equal(b.feuilles.sansIdentifiant, k.sansIdentifiant, 'les lignes sans identifiant sont comptées, jamais rangées');
  assert.equal(C.etat.dernierJour, '2026-09-21');
  assert.equal(C.etat.aJour, true);
  assert.equal(C.etat.version, T.VERSION_TABLE_JOUR);
  assert.equal(C.etat.construiteLe, '2026-10-05T12:00:00.000Z');
  assert.equal(C.etat.rencontres, b.comptes.rencontres);
  assert.equal(C.etat.lignesJoueur, b.comptes.lignesJoueur);
  assert.ok(b.dureeMs < 2000, `${b.dureeMs} ms`);
  assert.ok(C.pauses > 0 && b.pauses === C.pauses, 'la main rendue pendant la construction');
  assert.ok('etapesMs' in b && 'blocMaxOu' in b && 'rssMaxOctets' in b && 'walMaxOctets' in b);
});

test('construction : aucune colonne « avant » vide là où il y a de l’historique, aucun REAL dans player_day ; les indicateurs (prolongations et tirs au but, score à 90 minutes, hors classement, relevé, coupe) face aux tables sources', () => {
  const lu = C.lu;
  assert.equal(lu.avantVides, 0);
  assert.equal(lu.formeVideAvecHistorique, 0);
  assert.equal(lu.formeSansHistorique, 0, 'aucune forme inventée sans match d’avant');
  assert.equal(lu.a10Vides, 0);
  assert.equal(lu.reels, 0, 'note ×100, xG ×1000 : des entiers');
  const i = lu.indicateurs;
  // L'échantillon : 47 tirs au but et 9 prolongations (coupes) ; 100 rencontres sans statistiques d'équipe.
  assert.equal(i.prolongees, 56);
  assert.equal(i.tirsAuBut, 47);
  assert.deepEqual(i.prolongeesFausses, []);
  assert.ok(i.a90Incomplets > 0 && i.a90Complets > 0, `${i.a90Complets} déroulés complets, ${i.a90Incomplets} incomplets`);
  assert.deepEqual(i.a90Faux, [], 'bp90 : le score à 90 minutes quand le déroulé est complet, NULL sinon');
  assert.ok(i.horsClassement > 0, 'des tours de coupe hors classement');
  assert.deepEqual(i.compteFaux, []);
  assert.ok(i.sansStats > 0, 'des rencontres sans statistiques d’équipe');
  assert.deepEqual(i.releveFaux, []);
  assert.ok(i.coupes > 0);
  assert.deepEqual(i.coupeFausse, []);
});

test('league_day entière refaite ici (saison de J, 365 jours J − 365 compris, défaut ; xG et tirs cadrés 0-0 compris ; classement) et la saison (d) de chaque ligne équipe ; les cas rares plantés (tirs cadrés 0-0, xG d’un seul côté, titulaire sans minutes)', () => {
  const g = C.lu.ligue;
  assert.ok(g.verifiees > 500, `${g.verifiees} journées`);
  assert.deepEqual(g.faux, [], `${g.nFaux} journée(s) fausse(s)`);
  assert.deepEqual(g.gFaux, [], `${g.nGFaux} ligne(s) équipe à la mauvaise saison (d)`);
  const p = C.lu.plantes;
  assert.ok(C.plantes.cible && C.plantes.cadres00 && C.plantes.xgUnCote, 'les cas plantés dans les deux derniers matchs d’un club d’une cible');
  assert.deepEqual(p.cadres00.map((x) => [x.cadres_p, x.cadres_c]), [[0, 0], [0, 0]], 'un 0-0 de tirs cadrés reste 0 et 0');
  assert.deepEqual(p.xgUnCote.map((x) => [x.xg_p, x.xg_c]), [[null, null], [null, null]], 'un xG d’un seul côté : aucun des deux');
  assert.equal(p.titulaire.length, 2);
  assert.deepEqual([p.titulaire[0].joue, p.titulaire[0].minutes], [1, null], 'un titulaire sans minutes a joué');
  assert.deepEqual(p.titulaire.flatMap((x) => x.ecarts), []);
});

test('exactitude (le « fini quand ») : 201 cibles + 150 lignes tirées — la table rend exactement ce que lisent les lecteurs du moteur, (a) (b) (c) (e1) au jour J, (d) (e2) au lendemain du dernier match de chaque championnat', () => {
  const x = C.exactitude;
  assert.equal(x.cibles, 201);
  assert.equal(x.ciblesAbsentes, 0);
  assert.equal(x.tirees, 150);
  assert.deepEqual(x.sansEntrees, []);
  assert.equal(x.comparees, 351);
  assert.deepEqual(x.a.ecarts, [], '(a) statInputsFromStore');
  assert.ok(x.a.comparees >= 0.95 * x.comparees, `(a) : ${x.a.nomsAmbigus} paires de noms que clubDuMagasin ne rend pas aux bons identifiants`);
  assert.deepEqual(x.bce1.ecarts, [], '(b) (c) (e1) scoreInputsFromStore');
  assert.equal(x.bce1.comparees, 351);
  assert.deepEqual(x.d.ecarts, [], '(d) teamGoalsFromStore');
  assert.ok(x.d.comparees >= 30, `(d) : ${x.d.comparees} clubs comparés`);
  assert.ok(x.d.nomsAmbigus <= 0.05 * (x.d.comparees + x.d.nomsAmbigus), `(d) : ${x.d.nomsAmbigus} noms ambigus`);
  assert.deepEqual(x.e2.ecarts, [], '(e2) splitAverages(standingsFromStore)');
  assert.ok(x.e2.comparees - x.e2.nulles >= 20, `(e2) : ${x.e2.comparees} championnats, ${x.e2.nulles} sans classement (coupes)`);
});

test('lectures : entreesMoteurAvant (un match à venir) = entreesMoteur (la rencontre stockée) ; ligneLigue à la volée pour un jour sans match = la ligne qu’écrit la nuit quand une rencontre a lieu ce jour-là', () => {
  assert.deepEqual(C.lectures.ecarts, []);
  assert.equal(C.lectures.formeDomicile, 5);
  const v = C.ligneALaVolee;
  assert.equal(v.stockeeAvant, false);
  assert.equal(v.stockeeApres, true);
  assert.equal(v.nuit.erreur, null);
  assert.equal(v.nuit.rencontres.nouvelles, 1);
  assert.deepEqual(v.ecarts, [], 'même fonction (avantLigue), jamais une seconde formule');
});

test('anti-fuite au hasard : 60 lignes équipe et 40 lignes joueur tirées ici, recalculées en SQL sur les tables sources (date < J écrit en toutes lettres) = la table, colonne par colonne — toutes les colonnes de faits depuis le 13/10', () => {
  const eq = C.lu.equipesSql;
  const jo = C.lu.joueursSql;
  assert.equal(eq.length, 60);
  assert.equal(jo.length, 40);
  assert.deepEqual(eq.filter((l) => l.ecarts.length), []);
  assert.deepEqual(jo.filter((l) => l.ecarts.length), []);
  assert.ok(eq.filter((l) => l.avecHistorique).length >= 40, 'des lignes avec de l’historique, pas seulement des premières journées');
  assert.ok(jo.filter((l) => l.avecHistorique).length >= 10);
});

test('controleAntiFuite : 40 lignes, 0 écart ; puis deux fuites plantées (f10_corners_p calculé avec le jour J, a10_min avec le match lui-même) → exactement ces deux écarts, nommés ; « tout » répare ces deux lignes et elles seules', () => {
  assert.equal(C.controle.lignes, 40);
  assert.deepEqual(C.controle.ecarts, []);
  const f = C.fuites;
  assert.ok(f.equipe && f.joueur, 'deux lignes à corrompre trouvées parmi celles que le contrôle revoit');
  assert.equal(f.memesLignes, true, 'la même graine revoit les mêmes lignes');
  assert.equal(f.ecarts.length, 2);
  const [e, j] = [f.ecarts.find((x) => x.table === 'team_day'), f.ecarts.find((x) => x.table === 'player_day')];
  assert.deepEqual([e.rencontre, e.camp, e.colonne, e.source], [f.equipe.rencontre, f.equipe.camp, 'f10_corners_p', 'statInputsRead.moyennesEquipe']);
  assert.deepEqual([j.joueur, j.date, j.rencontre, j.colonne, j.stocke, j.attendu], [f.joueur.joueur, f.joueur.date, f.joueur.rencontre, 'a10_min', f.joueur.apres, f.joueur.avant]);
  assert.deepEqual(C.reparation.changements, { registre: 0, faitsEquipe: 0, faitsJoueur: 0, joueurRetirees: 0, ligue: 0, avantEquipe: 1, avantJoueur: 1 });
  assert.equal(C.apresReparation, 0);
});

test('controleAntiFuite voit TOUTES les colonnes de faits (retouche du 13/10) : faits de joueur (xG, buts contre son camp, camp, poste), possession et saison d’une équipe, et le contenu des rencontres de la forme — chaque valeur fausse plantée est un écart nommé, que « tout » répare', () => {
  const p = C.colonnesPlantees;
  assert.deepEqual(p.joueur1, ['csc', 'xg']);
  assert.deepEqual(p.joueur2, ['camp', 'poste']);
  assert.deepEqual(p.equipe, ['possession_p', 'saison']);
  assert.deepEqual(p.forme, ['f5_1.bp']);
  assert.equal(C.colonnesReparees.changements.faitsEquipe, 2);
  assert.equal(C.colonnesReparees.changements.faitsJoueur, 2);
  assert.equal(C.colonnesReparees.apres, 0);
});

test('une nuit sans rien de neuf : « rien à faire », aucune écriture ; « tout » refait chaque fait sans rien changer, et garde les numéros de rencontre', () => {
  assert.equal(C.rien.mode, 'rien');
  assert.equal(C.rienEcritures, 0);
  assert.equal(C.tout.mode, 'tout');
  assert.deepEqual(C.tout.changements, { registre: 0, faitsEquipe: 0, faitsJoueur: 0, joueurRetirees: 0, ligue: 0, avantEquipe: 0, avantJoueur: 0 });
  assert.equal(C.registreStable, true);
});

// ============================================================ 2. les pièges de la nuit

const sansHorsPermis = (b) => {
  for (const t of ['equipe', 'ligue', 'joueur']) assert.deepEqual(b[t].horsPermis, [], `${t} : rien d’autre ne bouge`);
};

test('match tardif (40 jours avant le dernier match du club) : ses deux lignes et sa feuille entrent ; seules bougent les lignes d’après dans les deux clubs, leur championnat et ses joueurs', () => {
  const p = N.pieges.tardif;
  assert.equal(p.nuit.mode, 'nuit');
  assert.equal(p.nuit.erreur, null);
  assert.equal(p.nuit.rencontres.nouvelles, 1);
  assert.equal(p.lignesNouvelles, 2);
  assert.equal(p.lignesJoueurNouvelles, p.joueursSurLaFeuille);
  assert.ok(p.suivante?.changee, 'le match suivant du club voit le match tardif');
  sansHorsPermis(p.bouge);
  assert.ok(p.bouge.equipe.modifiees > 0 && p.bouge.ligue.modifiees > 0 && p.bouge.joueur.modifiees > 0);
});

test('deux matchs le même jour pour un club : aucun ne voit l’autre, le match suivant voit les deux', () => {
  const p = N.pieges.memeJour;
  assert.ok(!p.f5X.includes(p.rY) && !p.f5Y.includes(p.rX));
  // À date égale, le moteur range par clé décroissante (jamais par numéro de rencontre) : X d'abord.
  assert.equal(p.clesDepartagees, true);
  assert.deepEqual(p.f5Suivante, [p.rX, p.rY]);
  assert.deepEqual(p.ecartsMoteur, [], 'le match suivant : la table = scoreInputsFromStore');
  sansHorsPermis(p.bouge);
});

test('changement de date (même identifiant FotMob) : l’ancien numéro disparaît des trois tables, le nouveau existe ; seules bougent les lignes d’après l’ancienne date', () => {
  const p = N.pieges.changementDeDate;
  assert.equal(p.rekeyed, 1);
  assert.notEqual(p.nouvelleCle, p.ancienneCle);
  assert.deepEqual(p.ancienneRestante, { registre: 0, equipe: 0, joueur: 0 });
  assert.ok(p.nouvelle !== null && p.nouvelle !== p.ancienne);
  assert.equal(p.lignesNouvelles, 2);
  assert.deepEqual([p.nuit.rencontres.nouvelles, p.nuit.rencontres.disparues], [1, 1]);
  assert.equal(p.bouge.equipe.retirees, 2);
  assert.ok(p.bouge.joueur.retirees > 0 && p.bouge.joueur.retirees === p.bouge.joueur.ajoutees, 'les joueurs de la feuille suivent la rencontre');
  sansHorsPermis(p.bouge);
});

test('rencontre annulée (deleteMatches) : disparue partout, l’avant des deux clubs refait', () => {
  const p = N.pieges.annulee;
  assert.equal(p.restante, 0);
  assert.equal(p.nuit.rencontres.disparues, 1);
  assert.equal(p.bouge.equipe.retirees, 2);
  sansHorsPermis(p.bouge);
});

test('résultat attribué après coup : attribue = 1 ; exclu de la forme (b), de la saison (c) et des moyennes du championnat (e1) ; gardé dans la fenêtre (a), les buts de la saison (d) et le classement (e2)', () => {
  const p = N.pieges.attribuee;
  assert.deepEqual(p.attribue, [1, 1]);
  assert.equal(p.suivanteAvant.f5[0], p.rencontre);
  assert.ok(!p.suivanteApres.f5.includes(p.rencontre), '(b)');
  assert.equal(p.suivanteApres.s_n, p.suivanteAvant.s_n - 1, '(c)');
  assert.equal(p.suivanteApres.f10_corners_n, p.suivanteAvant.f10_corners_n, '(a)');
  assert.equal(p.suivanteApres.g_n, p.suivanteAvant.g_n, '(d)');
  assert.equal(p.ligueAvant.source, p.ligueApres.source);
  assert.equal(p.ligueApres.l_n, p.ligueAvant.l_n - 1, '(e1)');
  assert.equal(p.ligueApres.c_n, p.ligueAvant.c_n, '(e2)');
  sansHorsPermis(p.bouge);
});

test('fusion d’identité (people_merges + UPDATE players) : les lignes de l’ancien identifiant passent sous le nouveau, dont les dix dernières apparitions comptent les deux carrières', () => {
  const p = N.pieges.fusion;
  assert.ok(p.reecrites > 0);
  assert.equal(p.nuit.erreur, null);
  assert.equal(p.nuit.fusions, 4, 'les quatre identifiants des deux équivalences relus');
  assert.equal(p.lignesApres.de, 0);
  assert.equal(p.lignesApres.vers, p.lignesAvant.de + p.lignesAvant.vers);
  assert.equal(p.a10DerniereLigne, p.a10Attendu);
  // Deux coéquipiers d'une même feuille : la ligne en double retirée par le script, les autres sous le nouvel identifiant.
  const m = p.memeFeuille;
  assert.equal(m.enDouble, 1);
  assert.equal(m.lignesApres.de, 0);
  assert.equal(m.lignesApres.vers, m.lignesAvant.de + m.lignesAvant.vers - 1);
  sansHorsPermis(p.bouge);
});

test('feuille relue sans un joueur : sa ligne disparaît, ses lignes suivantes sont refaites, rien d’autre', () => {
  const p = N.pieges.feuilleRelue;
  assert.equal(p.ligneRestante, 0);
  assert.equal(p.nuit.rencontres.modifiees, 1);
  assert.equal(p.bouge.joueur.retirees, 1);
  sansHorsPermis(p.bouge);
});

test('base restaurée : une date de mise à jour qui RECULE, un chiffre changé — la rencontre est relue (le registre compare par égalité)', () => {
  const p = N.pieges.restauree;
  assert.equal(p.nuit.rencontres.modifiees, 1);
  assert.equal(p.coinsApres, p.coinsAvant + 2);
});

test('rien ne change : la seconde nuit ne fait rien et n’écrit rien (ni ligne, ni état, ni fichier) ; après ces nuits, « tout » ne trouve rien à corriger et le contrôle aucun écart', () => {
  const p = N.pieges;
  assert.equal(p.rien.nuit.mode, 'rien');
  assert.equal(p.rien.ecritures, 0);
  assert.equal(p.rien.fichiersIdentiques, true);
  assert.equal(p.tout.erreur, null);
  assert.deepEqual(p.tout.changements, { registre: 0, faitsEquipe: 0, faitsJoueur: 0, joueurRetirees: 0, ligue: 0, avantEquipe: 0, avantJoueur: 0 });
  assert.equal(p.tout.controle.lignes, 80);
  assert.deepEqual(p.tout.controle.ecarts, []);
});

// ============================================================ 3. la nuit : durée, main rendue, panne

test('une nuit ordinaire en petit (3 rencontres modifiées, 1 retirée, 1 en retard) : moins d’une seconde, la main rendue, jamais plus de ~25 ms d’affilée', () => {
  const n = N.nuit;
  assert.equal(n.mode, 'nuit');
  assert.equal(n.erreur, null);
  assert.deepEqual([n.rencontres.nouvelles, n.rencontres.modifiees, n.rencontres.disparues], [1, 3, 1]);
  // Visé : < 1 s (0,25 à 0,47 s mesurés seul) ; 3 s laissent la place aux autres fichiers de tests qui tournent en même temps.
  assert.ok(n.dureeMs < 3000, `${n.dureeMs} ms`);
  assert.equal(n.controle.graine, 20261005, 'la graine du contrôle : le jour (AAAAMMJJ), différente chaque nuit');
  assert.ok(n.pauses > 0);
  // Visé : < 50 ms (mesuré 26 ms seul) ; la borne de 100 laisse la place aux autres fichiers de tests qui tournent en même temps.
  assert.ok(n.blocMaxMs < 100, `${n.blocMaxMs} ms (${n.blocMaxOu})`);
  assert.equal(n.controle.lignes, 40);
  assert.equal(n.controle.ecarts, 0);
  // Le contrôle de la nuit tourne dans un processus à part (lecture seule) : ses lecteurs du moteur ne tiennent jamais le serveur.
  assert.ok(n.aPart && !n.aPart.erreur, JSON.stringify(n.aPart));
  assert.ok(n.aPart.rssMaxOctets > 0);
});

test('le contrôle à part qui ne répond pas à temps est arrêté et noté « pas fait » avec sa raison — jamais refait dans le serveur', () => {
  const d = N.delai;
  assert.equal(d.erreur, null);
  assert.match(d.aPart.erreur, /aucune réponse en 1 ms/);
  assert.deepEqual([d.controle.lignes, d.controle.ecarts, d.controle.graine], [0, [], 20261005]);
  assert.match(d.controle.pasFait, /aucune réponse en 1 ms/);
  assert.ok(d.blocMaxMs < 100, `${d.blocMaxMs} ms : aucun contrôle refait dans le serveur`);
  assert.equal(d.etat.pasFait, d.controle.pasFait, 'gardé dans l’état : la carte le dit');
});

test('une panne au milieu (une écriture refusée DANS une transaction, après la deuxième pause) : erreur rendue, jamais levée ; repère et état pas avancés, passe marquée « en cours » ; la nuit suivante reprend tout et retombe sur les tables sources', () => {
  const p = N.panne;
  assert.equal(p.leve, null);
  assert.match(p.erreur, /panne provoquée/);
  assert.equal(p.repereAvance, false);
  assert.equal(p.miseAJourAvancee, false);
  assert.ok(p.enCours);
  assert.equal(p.aJour, false);
  assert.deepEqual(N.reprise, { mode: 'reprise', erreur: null, aJour: true, enCours: null });
  assert.equal(N.comptes.registre, N.comptes.magasin);
  assert.equal(N.comptes.equipe, 2 * N.comptes.registre);
  assert.equal(N.comptes.joueur, N.comptes.feuilles);
  assert.deepEqual(N.tout.changements, { registre: 0, faitsEquipe: 0, faitsJoueur: 0, joueurRetirees: 0, ligue: 0, avantEquipe: 0, avantJoueur: 0 });
});

// ============================================================ 4. l'étape et la route

test('l’étape « tableJourJ » : après les repères, avant les cotes gratuites ; due sans table, une fois par jour de Paris, au clic, ou si la table n’est pas à jour ; due, l’état et la route n’écrivent rien', () => {
  const i = E.etapes.indexOf('tableJourJ');
  assert.equal(E.etapes[i - 1], 'reperes');
  assert.equal(E.etapes[i + 1], 'cotesGratuites');
  assert.ok(E.etapes.indexOf('sauvegarde') > i, 'dans la sauvegarde de la nuit');
  assert.deepEqual(E.dueSansTable, { jamais: true, aujourdhui: true });
  assert.deepEqual(E.due, { jamais: true, hier: true, aujourdhui: false, clic: true });
  assert.equal(E.dueAutreVersion, true);
  assert.equal(E.dueEnCours, true);
  assert.equal(E.etatEnCours.aJour, false);
  assert.deepEqual(E.rienEcritSansTable, { ecritures: 0, fichiersIdentiques: true });
  assert.deepEqual(E.rienEcritAvecTable, { ecritures: 0, fichiersIdentiques: true });
});

test('le bilan de l’étape : la première construction, « rien à faire », une nuit, une rencontre refusée — les comptes, le plus long blocage, « Mesuré seulement » ; l’alerte durable ; aucun rechargement de l’interface', () => {
  const nombre = (n) => Number(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
  const espaces = (t) => t.replace(/[  ]/g, ' ');
  const p = E.premiere;
  assert.equal(p.status, 'ok');
  assert.equal(p.changed, false);
  assert.deepEqual(p.alert, { key: 'tableJourJ', value: null });
  assert.match(espaces(p.summary), new RegExp(`^Première construction : ${nombre(p.details.comptes.rencontres)} rencontres, ${nombre(p.details.comptes.lignesEquipe)} lignes équipe, ${nombre(p.details.comptes.lignesJoueur)} lignes joueur, ${nombre(p.details.comptes.lignesLigue)} journées de championnat, en .+ \\(le serveur jamais tenu plus de \\d+ ms d'affilée\\) ; contrôle anti-fuite : 40 lignes recalculées depuis les tables sources, 0 écart\\. Mesuré seulement : le moteur ne lit pas encore cette table\\.$`));
  assert.ok(E.premierePauses > 0);
  assert.ok(p.details.controleAPart && !p.details.controleAPart.erreur, 'le contrôle dans un processus à part');
  assert.equal(E.rien.status, 'ok');
  assert.match(espaces(E.rien.summary), /^Rien à faire : aucune rencontre nouvelle, modifiée ni retirée, aucune fusion depuis la dernière passe \(2 156 rencontres dans la table\) ; en \d+ ms .+ Mesuré seulement : le moteur ne lit pas encore cette table\.$/);
  assert.equal(E.nuit.status, 'ok');
  assert.match(espaces(E.nuit.summary), /^1 rencontre nouvelle ou modifiée, 0 retirée ; \d+ lignes? équipe et \d+ lignes? joueur réécrites, \d+ lignes? « avant » mises? à jour \(toutes les équipes recalculées, 444 clubs ; \d+ joueurs?\) ; contrôle anti-fuite : 10 lignes recalculées depuis les tables sources, 0 écart ; en .+\. Mesuré seulement : le moteur ne lit pas encore cette table\.$/);
  // Une rencontre au club mal formé : refusée, sortie de la table, l'étape « à regarder ».
  assert.equal(E.refus.status, 'warn');
  assert.match(E.refus.summary, /1 rencontre refusée \(identifiant de club mal formé : \d{4}-\d{2}-\d{2}-[a-z0-9-]+\)/);
  assert.equal(E.refus.details.rencontres.disparues, 1);
  assert.equal(E.routeApres.corps.rencontres, 2155);
  // La passe suivante n'a rien à faire, mais la rencontre est toujours refusée : « à regarder », et le résumé dit pourquoi.
  assert.equal(E.rienAvecRefus.status, 'warn');
  assert.equal(E.rienAvecRefus.details.mode, 'rien');
  assert.match(E.rienAvecRefus.summary, /^Rien à faire : .+ ; 1 rencontre refusée \(identifiant de club mal formé : \d{4}-\d{2}-\d{2}-[a-z0-9-]+\)\. Mesuré seulement/);
  assert.deepEqual(E.routeApres.corps.refusees.map((x) => x.matchKey), [E.refus.details.rencontres.refusees[0].matchKey]);
  // Un contrôle à part sans réponse à temps : « à regarder », la raison dite, l'alerte durable pas touchée.
  assert.equal(E.pasFait.status, 'warn');
  assert.match(E.pasFait.summary, /contrôle anti-fuite PAS FAIT \(contrôle à part arrêté : aucune réponse en 1 ms\) — refait à la prochaine passe, jamais dans le serveur/);
  assert.ok(!('alert' in E.pasFait));
  assert.match(E.routePasFait.corps.controle.pasFait, /aucune réponse en 1 ms/);
  // La graine du contrôle de nuit : le jour (heure figée au 05/10/2026), gardée avec le contrôle pour le rejouer.
  assert.equal(E.premiere.details.controle.graine, 20261005);
  assert.equal(E.route.corps.controle.graine, 20261005);
});

test('GET /api/match-stats/day-table : sans table, « absente » et la même forme ; avec la table, les comptes notés par la dernière passe ; avant les routes à paramètre', () => {
  const sans = E.routeSansTable;
  const avec = E.route;
  assert.equal(sans.code, 200);
  assert.equal(avec.code, 200);
  assert.equal(sans.corps.absente, true);
  assert.equal(avec.corps.absente, false);
  assert.deepEqual(Object.keys(sans.corps).sort(), Object.keys(avec.corps).sort(), 'la structure complète, même sans table');
  for (const k of ['rencontres', 'lignesEquipe', 'lignesJoueur', 'lignesLigue', 'joueurs', 'dernierJour', 'construiteLe', 'miseAJourLe', 'controle', 'aJour', 'version']) assert.deepEqual(avec.corps[k], E.etat[k], k);
  assert.match(avec.corps.base, /match-stats\.db$/);
  assert.equal(avec.corps.dernierJourMagasin, E.dernierJourMagasin, 'le dernier jour du magasin, pour dire « pas à jour »');
  assert.deepEqual(avec.corps.refusees, []);
  const routes = fs.readFileSync(path.join(SERVEUR, 'src', 'api', 'routes', 'matchStats.routes.js'), 'utf8');
  assert.ok(routes.indexOf("router.get('/day-table'") > 0 && routes.indexOf("router.get('/day-table'") < routes.indexOf("router.get('/:matchId'"));
});

test('la carte « Table du jour J » : quatre lignes, toujours les quatre — sans table, pas lue, à jour, d’une autre version, en cours, avec des écarts', () => {
  const noms = (l) => l.map((x) => x.nom);
  const QUATRE = ['Équipes', 'Joueurs', 'À jour', 'Contrôle anti-fuite'];
  const espaces = (t) => String(t ?? '').replace(/[  ]/g, ' ');
  // Pas encore lue (ou en erreur) : les quatre lignes, « non lu ».
  const rien = U.lignesDeLaTable(null);
  assert.deepEqual(noms(rien), QUATRE);
  assert.ok(rien.every((l) => l.valeur === 'non lu'));
  // Sans table : la prochaine nuit la construit.
  const sans = U.lignesDeLaTable(E.routeSansTable.corps);
  assert.deepEqual(noms(sans), QUATRE);
  assert.equal(sans[0].valeur, U.PAS_ENCORE_CONSTRUITE);
  assert.equal(sans[1].valeur, U.PAS_ENCORE_CONSTRUITE);
  assert.equal(sans[2].valeur, 'jamais construite');
  assert.equal(sans[3].valeur, 'pas encore contrôlée');
  // Avec la table : les comptes de la route, mot pour mot.
  const d = E.route.corps;
  const avec = U.lignesDeLaTable(d);
  assert.deepEqual(noms(avec), QUATRE);
  assert.equal(espaces(avec[0].valeur), `${espaces(d.lignesEquipe.toLocaleString('fr-FR'))} lignes (${espaces(d.rencontres.toLocaleString('fr-FR'))} rencontres, ${d.lignesLigue} journées de championnat)`);
  assert.equal(espaces(avec[1].valeur), `${espaces(d.lignesJoueur.toLocaleString('fr-FR'))} lignes (${espaces(d.joueurs.toLocaleString('fr-FR'))} joueurs)`);
  assert.equal(avec[2].valeur, 'au 21/09/2026 (dernière rencontre), mise à jour le 05/10 à 14:00');
  assert.equal(avec[3].valeur, '40 lignes recalculées depuis les tables sources, 0 écart');
  assert.deepEqual(avec[3].pastille, { texte: '0 écart', ton: 'is-accent', icone: 'check' });
  // Une autre version, une passe pas finie, des écarts.
  assert.equal(U.lignesDeLaTable({ ...d, version: 0 })[2].ton, 'is-warning');
  assert.match(U.lignesDeLaTable({ ...d, enCours: '2026-10-05T01:00:00.000Z' })[2].detail, /^passe commencée le 05\/10 à 03:00 et pas terminée/);
  const ecart = { table: 'team_day', rencontre: 12, camp: 1, matchKey: '2026-09-12-a-b', colonne: 'f10_corners_p', stocke: 6.3, attendu: 6.5, source: 'statInputsRead.moyennesEquipe' };
  const mal = U.lignesDeLaTable({ ...d, controle: { le: d.controle.le, lignes: 40, ecarts: [ecart, { ...ecart, colonne: 'a10_min' }] } })[3];
  assert.equal(mal.valeur, '2 écarts : à regarder');
  assert.equal(mal.ton, 'is-danger');
  assert.equal(mal.pastille.ton, 'is-danger');
  assert.equal(U.phraseEcart(ecart), 'f10_corners_p — rencontre 2026-09-12-a-b (domicile) : 6,3 dans la table, 6,5 recalculé (statInputsRead.moyennesEquipe).');
  assert.match(U.messageDErreur('Statistiques introuvables pour le match day-table'), /^Le serveur n'est pas à jour/);
  // Retouche du 13/10 : les rencontres refusées, le magasin en avance sur la table, un contrôle pas fait, la graine.
  const refus = U.lignesDeLaTable(E.routeApres.corps)[0];
  assert.equal(refus.ton, 'is-warning');
  assert.match(refus.detail, /1 rencontre refusée \(identifiant de club mal formé, à regarder\) : \d{4}-\d{2}-\d{2}-/);
  const enRetard = U.lignesDeLaTable({ ...d, dernierJourMagasin: '2026-12-01' })[2];
  assert.equal(enRetard.ton, 'is-warning');
  assert.equal(enRetard.detail, "le magasin va jusqu'au 01/12/2026 : la prochaine actualisation rattrape");
  assert.equal(U.lignesDeLaTable({ ...d, dernierJourMagasin: d.dernierJour })[2].ton, '');
  const pasFait = U.lignesDeLaTable(E.routePasFait.corps)[3];
  assert.match(pasFait.valeur, /^pas fait le 05\/10 à 14:00 : contrôle à part arrêté : aucune réponse en 1 ms$/);
  assert.deepEqual(pasFait.pastille, { texte: 'pas fait', ton: 'is-warning', icone: 'alert' });
  assert.match(avec[3].detail, /graine 20261005 \(pour le rejouer\)$/);
  assert.match(U.PAS_ENCORE_CONSTRUITE, /première passe d’actualisation/);
  assert.doesNotMatch(U.PAS_ENCORE_CONSTRUITE, /nuit/);
});

test('la carte dans Réglages : juste après l’historique football-data, lecture seule, provenance réelle, le terme du guide, jetons du thème ; jamais « Gain mesuré » ni « pas encore mesuré »', () => {
  const lireUi = (...c) => fs.readFileSync(path.join(UI, 'src', ...c), 'utf8');
  const vue = lireUi('components', 'settings', 'DayTablePanel.vue');
  assert.match(vue, /<HelpTip v-if="l\.cle === 'controle'" terme="table-du-jour-j" \/>/);
  assert.match(vue, /source="magasin SQLite, calculé chaque nuit par l'actualisation"/);
  assert.match(vue, /matchStatsApi\.dayTable\(\)/);
  assert.doesNotMatch(vue, /Gain mesuré|pas encore mesuré/i);
  assert.doesNotMatch(vue, /httpClient|\.post\(|\.put\(|\.delete\(/);
  assert.doesNotMatch(vue, /!important/);
  const style = vue.split('<style scoped>')[1];
  assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b/i);
  for (const m of style.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(m[1]) >= 10, `police de ${m[1]} px`);
  const jetons = lireUi('assets', 'styles', 'tokens.css');
  for (const m of style.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(jetons.includes(`${m[1]}:`), `jeton inconnu ${m[1]}`);
  const reglages = lireUi('views', 'SettingsView.vue');
  assert.match(reglages, /import DayTablePanel from '@\/components\/settings\/DayTablePanel\.vue';/);
  assert.match(reglages, /title="Table du jour J"[\s\S]*?<DayTablePanel :passe-terminee-le="refreshOverview\?\.lastCompletedAt \?\? null" \/>/);
  assert.ok(reglages.indexOf('<FdHistoryPanel') < reglages.indexOf('<DayTablePanel'), 'juste après l’historique football-data');
  assert.match(lireUi('services', 'matchStatsApi.js'), /dayTable: \(\) => httpClient\.get\('\/match-stats\/day-table'\)/);
});

// ============================================================ 5. les règles pures (sans base)

/** Un fait d'équipe fabriqué. */
const fait = (date, k, champs = {}) => ({ date, matchKey: k, rencontre: k, league: 'L', saison: 2025, home: true, attribue: false, prolongation: false, compte: true, coupe: false, releve: true, bp: 1, bc: 0, ...champs });

test('fenetre : les n derniers matchs joués, la règle 0-0 pour les comptes de FotMob (pas pour les buts), les exclusions, le championnat, la date de départ', () => {
  const faits = [
    fait('2025-08-01', 'a', { corners_p: 5, corners_c: 3, bp: 2, bc: 1 }),
    fait('2025-08-08', 'b', { corners_p: 0, corners_c: 0, bp: 0, bc: 0 }),
    fait('2025-08-15', 'c', { corners_p: 7, corners_c: 2, attribue: true, bp: 3, bc: 0 }),
    fait('2025-08-22', 'd', { corners_p: 4, corners_c: 6, league: 'Coupe', coupe: true, prolongation: true, compte: false }),
    fait('2025-08-29', 'e', { corners_p: null, corners_c: 4 }),
    fait('2025-09-05', 'f', { corners_p: 6, corners_c: 5, bp: 1, bc: 1 })
  ];
  // corners : e (un côté manque) et b (0-0 = non relevé) écartés, c (attribué) exclu par défaut → f, d, a.
  const c = T.fenetre(faits, { stat: 'corners' });
  assert.deepEqual(c.matchs.map((f) => f.matchKey), ['f', 'd', 'a']);
  assert.equal(c.pour, (6 + 4 + 5) / 3);
  assert.equal(c.contre, (5 + 6 + 3) / 3);
  // buts : le 0-0 compte (pas de règle 0-0 pour les buts).
  assert.deepEqual(T.fenetre(faits, { stat: 'buts', n: 10 }).matchs.map((f) => f.matchKey), ['f', 'e', 'd', 'b', 'a']);
  assert.equal(T.fenetre(faits, { stat: 'corners', exclure: [] }).n, 4, 'l’attribué compté sans exclusion');
  assert.deepEqual(T.fenetre(faits, { stat: 'corners', exclure: ['attribues', 'coupes'] }).matchs.map((f) => f.matchKey), ['f', 'a']);
  assert.deepEqual(T.fenetre(faits, { stat: 'corners', exclure: ['prolongations'] }).matchs.map((f) => f.matchKey), ['f', 'c', 'a']);
  assert.deepEqual(T.fenetre(faits, { stat: 'corners', exclure: ['horsClassement'] }).matchs.map((f) => f.matchKey), ['f', 'c', 'a']);
  assert.deepEqual(T.fenetre(faits, { stat: 'corners', league: 'L' }).matchs.map((f) => f.matchKey), ['f', 'a']);
  assert.deepEqual(T.fenetre(faits, { stat: 'corners', depuis: '2025-08-20' }).matchs.map((f) => f.matchKey), ['f', 'd']);
  assert.equal(T.fenetre(faits, { stat: 'corners', n: 1 }).pour, 6);
  assert.equal(T.fenetre(faits, { stat: 'corners', releve: false }).n, 4, 'sans la règle 0-0, le 0-0 compte');
  const vide = T.fenetre([], { stat: 'corners' });
  assert.deepEqual([vide.pour, vide.contre, vide.n], [null, null, 0], 'aucun match : null, jamais une division par 0');
  assert.throws(() => T.fenetre(faits, { stat: 'inconnue' }), /statistique inconnue/);
  assert.throws(() => T.fenetre(faits, { stat: 'corners', exclure: ['tout'] }), /exclusion inconnue/);
  assert.deepEqual(T.EXCLUSIONS, ['attribues', 'prolongations', 'horsClassement', 'coupes']);
});

test('faitsDUneFeuille : joué = minutes > 0 ou titulaire ; NULL → 0 seulement s’il a joué ; xG, xA, xG hors penalty seulement si le match est couvert, xGOT si les deux xGOT d’équipe le sont, cartons si les jaunes sont relevés ; entrée et sortie telles quelles ; un banc non entré ; un joueur deux fois sur la feuille ; une ligne sans identifiant', () => {
  const ligne = (id, champs = {}) => ({ player_id: id, side: 'home', starter: 1, subbed_in: 0, position: 'Midfielder', minutes: 90, rating: 7.05, goals: null, assists: null, shots: 2, shots_on_target: null, xg: 0.31, xa: null, xg_non_penalty: 0.31, xgot: 0.4, key_passes: 1, recoveries: null, duels_won: 3, duels_total: 5, goals_prevented: null, goals_conceded: null, yellow_cards: null, red_cards: null, sub_in_minute: null, sub_out_minute: 77, own_goals: null, ...champs });
  const lignes = [
    ligne('fotmob-11'),
    ligne('fotmob-12', { starter: 1, minutes: null, rating: null, xg: null, xgot: null }),
    ligne('fotmob-13', { side: 'away', starter: 0, subbed_in: 0, minutes: 0, position: 'Forward', shots: null, xg: null, xgot: null, duels_won: null, duels_total: null, key_passes: null, sub_out_minute: null }),
    ligne('fotmob-14', { side: 'away', starter: 0, subbed_in: 1, minutes: 12, position: 'Goalkeeper', goals_prevented: 0.37, goals_conceded: 1, sub_in_minute: 78, sub_out_minute: null, yellow_cards: 1 }),
    ligne('fotmob-15', { starter: 0, minutes: 0 }),
    ligne('fotmob-15', { starter: 0, minutes: 25 }),
    ligne(null, { minutes: 90 }),
    ligne('nom:Untel')
  ];
  const sans = T.faitsDUneFeuille({ rencontre: 7, date: '2025-09-13', home: 100, away: 200, lignes, couverture: { xg: false, xgot: false, cartons: false } });
  const avec = T.faitsDUneFeuille({ rencontre: 7, date: '2025-09-13', home: 100, away: 200, lignes, couverture: { xg: true, xgot: true, cartons: true } });
  const de = (r, j) => r.faits.find((x) => x.joueur === j);
  assert.deepEqual([sans.faits.length, sans.sansIdentifiant, sans.refusees, sans.doublons], [5, 1, ['nom:Untel'], 1]);
  // Titulaire à 90 minutes : NULL → 0 pour les comptes, xG seulement quand le match est couvert, cartons seulement si relevés.
  const t = de(sans, 11);
  assert.deepEqual([t.club, t.camp, t.joue, t.titulaire, t.entre, t.poste, t.minutes, t.note], [100, 1, 1, 1, 0, 3, 90, 705]);
  assert.deepEqual([t.buts, t.passes_d, t.tirs, t.cadres, t.pc, t.recup, t.duels_g, t.duels_t, t.buts_concedes, t.csc], [0, 0, 2, 0, 1, 0, 3, 5, 0, 0]);
  assert.deepEqual([t.xg, t.xa, t.xgnp, t.xgot, t.jaunes, t.rouges], [null, null, null, null, null, null], 'match non couvert : non relevé, jamais 0');
  const tc = de(avec, 11);
  assert.deepEqual([tc.xg, tc.xa, tc.xgnp, tc.xgot, tc.jaunes, tc.rouges], [310, 0, 310, 400, 0, 0], 'couvert : ×1000, un xA absent vaut 0');
  assert.deepEqual([tc.entre_min, tc.sorti_min, tc.buts_evites], [null, 77, null]);
  assert.equal(T.faitsDUneFeuille({ rencontre: 7, date: '2025-09-13', home: 100, away: 200, lignes: [lignes[0]], couverture: { xg: true, xgot: false, cartons: true } }).faits[0].xgot, null, 'xGOT : sa propre couverture');
  // Titulaire sans minutes : il a joué.
  const sm = de(avec, 12);
  assert.deepEqual([sm.joue, sm.minutes, sm.note, sm.xg, sm.xgot, sm.buts], [1, null, null, 0, 0, 0]);
  // Banc non entré : titulaire, entré, poste, minutes tels quels, statistiques NULL.
  const b = de(avec, 13);
  assert.deepEqual([b.club, b.camp, b.joue, b.titulaire, b.entre, b.poste, b.minutes], [200, 0, 0, 0, 0, 4, 0]);
  assert.deepEqual([b.buts, b.tirs, b.xg, b.xgot, b.jaunes, b.entre_min, b.sorti_min, b.csc], [null, null, null, null, null, null, null, null]);
  // Gardien entré : buts évités ×100, entrée gardée, jaune relevé.
  const g = de(avec, 14);
  assert.deepEqual([g.joue, g.entre, g.poste, g.buts_evites, g.buts_concedes, g.entre_min, g.sorti_min, g.jaunes], [1, 1, 1, 37, 1, 78, null, 1]);
  // Deux fois sur la feuille : la ligne jouée.
  assert.equal(de(avec, 15).minutes, 25);
});

test('fenêtre (a) : 30 candidats relevés à domicile et 30 à l’extérieur AVANT la règle 0-0 — un club à 40 matchs à domicile (vérification du 13/10)', () => {
  const jour = (i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
  // 40 matchs à domicile : les 15 premiers relevés, les 25 derniers sans statistiques (releve = 0) — jamais candidats.
  const a = Array.from({ length: 40 }, (_, i) => fait(jour(i), `a${String(i).padStart(2, '0')}`, i < 15 ? { corners_p: i + 1, corners_c: 1, tirs_p: 10, tirs_c: 8, cadres_p: 4, cadres_c: 3 } : { releve: false, corners_p: null, corners_c: null, tirs_p: null, tirs_c: null, cadres_p: null, cadres_c: null }));
  const x = T.avantEquipe(a, [], { date: jour(60), league: 'L', saison: 2025 });
  assert.deepEqual([x.f10_corners_n, x.f10_corners_p], [10, 105], 'des non-relevés admis donneraient [5, 65]');
  // 32 matchs relevés : 30 candidats seulement, les 25 plus récents à 0-0 (non relevés pour la fenêtre).
  const b = Array.from({ length: 32 }, (_, i) => fait(jour(i), `b${String(i).padStart(2, '0')}`, i < 7 ? { corners_p: i + 1, corners_c: 1 } : { corners_p: 0, corners_c: 0 }));
  const y = T.avantEquipe(b, [], { date: jour(60), league: 'L', saison: 2025 });
  assert.deepEqual([y.f10_corners_n, y.f10_corners_p], [5, 25], 'sans le plafond de 30, [7, 28]');
});

test('avantJoueur : ses dix dernières apparitions jouées d’un jour strictement antérieur, attribués exclus ; minutes inconnues d’un titulaire, note absente, xG non couvert ; deux matchs le même jour', () => {
  const app = (date, k, champs = {}) => ({ date, matchKey: k, rencontre: k, joue: true, attribue: false, minutes: 90, note: 7, buts: 0, xg: 0.1, titulaire: true, ...champs });
  const carriere = [
    app('2025-08-01', 'a', { minutes: null, note: null, buts: 1, xg: null }),
    app('2025-08-08', 'b', { joue: false, minutes: 0, note: null, buts: null, xg: null, titulaire: false }),
    app('2025-08-15', 'c', { attribue: true, minutes: 90, buts: 2 }),
    app('2025-08-22', 'd', { minutes: 64, note: 6.85, buts: 1, xg: 0.42 }),
    app('2025-08-22', 'e', { minutes: 26, note: 7.15, xg: 0.08 })
  ];
  const a = T.avantJoueur(carriere, { date: '2025-09-01' });
  // a (titulaire à minutes inconnues : joué), d, e ; b (banc) et c (attribué) écartés.
  assert.deepEqual(a, { a10_n: 3, a10_min: 90, a10_note_s: 1400, a10_note_n: 2, a10_buts: 2, a10_xg: 500 });
  // Le 22/08 ne voit aucun des deux matchs de ce jour-là ; l'xG non couvert (a) ne fait pas un zéro.
  assert.deepEqual(T.avantJoueur(carriere.slice(0, 3), { date: '2025-08-22' }), { a10_n: 1, a10_min: 0, a10_note_s: 0, a10_note_n: 0, a10_buts: 1, a10_xg: null });
  assert.throws(() => T.avantJoueur(carriere, { date: '2025-08-22' }), /fuite refusée/);
  const onze = Array.from({ length: 11 }, (_, i) => app(`2025-09-${String(i + 1).padStart(2, '0')}`, `k${i}`, { minutes: i + 1 }));
  assert.equal(T.avantJoueur(onze, { date: '2025-10-01' }).a10_min, somme(onze.slice(1), (f) => f.minutes), 'dix, les plus récentes');
  const depuis = T.avantJoueur(onze, { date: '2025-10-01' }, { depuis: '2025-09-06' }).depuis;
  assert.deepEqual([depuis.feuilles, depuis.minutes], [6, 6 + 7 + 8 + 9 + 10 + 11]);
});

test('football-data → faits (zéro = vrai zéro, vide = NULL, saison du fichier), puis les règles « avant » dessus sans lever ; et chaque règle LÈVE devant un fait du jour J ou d’après', () => {
  // La Premier League 2021-22 plantée par script-reperes.mjs (dix matchs, un 0-0 de corners, des corners non publiés).
  const E0_2122 = [
    ['2021-08-14', 2, 1, 5, 3, 12, 8, 5, 3, 1, 2, 0, 0],
    ['2021-08-21', 0, 0, 0, 0, 7, 6, 2, 1, 0, 0, 0, 0],
    ['2021-09-11', 1, 1, 6, 4, 14, 9, 4, 4, 2, 1, 0, 1],
    ['2021-09-18', 3, 2, null, null, 15, 13, 7, 6, 3, 3, 0, 0],
    ['2021-10-02', 0, 1, 4, 7, 9, 16, 2, 5, 1, 2, 0, 0],
    ['2021-10-16', 2, 0, 8, 2, 18, 5, 8, 1, 0, 1, 1, 0],
    ['2021-11-06', 1, 0, 3, 3, 10, 10, 3, 3, 2, 2, 0, 0],
    ['2021-12-04', 4, 0, 9, 1, 21, 4, 10, 1, 1, 0, 0, 0],
    ['2022-01-15', 2, 2, 5, 5, 11, 12, 5, 5, 2, 3, 0, 0],
    ['2022-03-05', 0, 3, 2, 6, 6, 15, 1, 7, 0, 0, 0, 0]
  ];
  const lignes = E0_2122.map(([date, bd, be, cd, ce, td, te, sd, se, jd, je, rd, re], i) => ({
    id: i + 1, code: 'E0', saison: '2021-22', date, date_fichier: date, dom: 1, ext: 2, bd, be,
    corners_d: cd, corners_e: ce, tirs_d: td, tirs_e: te, cadres_d: sd, cadres_e: se, jaunes_d: jd, jaunes_e: je, rouges_d: rd, rouges_e: re
  }));
  const faits = T.faitsDepuisFd(lignes, { fdTeams: [{ id: 1, team_id: 'fotmob-8456' }, { id: 2, team_id: null }] });
  assert.equal(faits.length, 20);
  const dom = faits.filter((f) => f.club === 1);
  assert.equal(dom[1].corners_p, 0, 'un 0 de football-data est un vrai 0');
  assert.equal(dom[3].corners_p, null, 'une case vide est NULL');
  assert.ok(faits.every((f) => f.saison === '2021-22' && f.xg_p === null && f.bp90 === f.bp));
  assert.equal(dom[0].clubFotmob, 'fotmob-8456');
  // (a) du club 1 le 2022-04-01 : 10 matchs, le 0-0 et la case vide écartés → 8 relevés de corners.
  const av = T.avantEquipe(dom, faits.filter((f) => f.home), { date: '2022-04-01', league: 'E0', saison: '2021-22' });
  assert.equal(av.f10_corners_n, 8);
  assert.equal(av.f10_corners_p, 5 + 6 + 4 + 8 + 3 + 9 + 5 + 2);
  assert.equal(av.f10_cadres_n, 10, 'tirs cadrés relevés partout');
  assert.equal(av.s_n_dom, 10);
  assert.equal(av.s_bp_dom, 15);
  assert.equal(av.g_saison, '2021-22');
  assert.equal(av.f5_1, 10);
  const lg = T.avantLigue(faits.filter((f) => f.home), { date: '2022-04-01', league: 'E0', saison: '2021-22' });
  assert.deepEqual([lg.l_source, lg.l_n, lg.l_bd, lg.l_be, lg.c_n], ['365 jours', 10, 15, 10, 10], 'moins de 30 en saison : les 365 jours (10 matchs, juste assez)');
  assert.equal(T.avantLigue(faits.filter((f) => f.home).slice(0, 9), { date: '2022-04-01', league: 'E0', saison: '2021-22' }).l_source, 'défaut', 'moins de 10 : 1,45 / 1,15');
  // La fenêtre des 365 jours (moins de 30 matchs en saison) : J − 365 compris, J − 366 non, comme leagueAveragesBefore.
  const an = ['2024-09-30', '2024-10-01', '2025-01-11', '2025-02-08', '2025-03-08', '2025-04-12', '2025-05-10', '2025-06-14', '2025-08-09', '2025-09-13', '2025-09-27'];
  const l365 = T.avantLigue(an.map((d, i) => fait(d, `k${i}`, { saison: 2024 })), { date: '2025-10-01', league: 'L', saison: 2099 });
  assert.deepEqual([l365.l_source, l365.l_n], ['365 jours', 10]);
  // La garde anti-fuite : jamais un `<=` silencieux.
  assert.throws(() => T.avantEquipe(dom, [], { date: '2022-03-05', league: 'E0', saison: '2021-22' }), /fuite refusée/);
  assert.throws(() => T.avantEquipe([], dom, { date: '2022-01-15', league: 'E0', saison: '2021-22' }), /fuite refusée/);
  assert.throws(() => T.avantLigue(dom, { date: '2021-08-14', league: 'E0' }), /fuite refusée/);
  assert.doesNotThrow(() => T.avantEquipe(dom.slice(0, 9), [], { date: '2022-03-05', league: 'E0', saison: '2021-22' }));
});

test('les constantes recopiées sont celles des lecteurs du moteur ; dayTable.js n’importe ni core/ ni un fournisseur (hors saisons et coupes), et les lecteurs du moteur seulement pour le contrôle', async () => {
  const { STAT_SAMPLE, STAT_MIN_SAMPLE } = await imp('data/db/statInputsRead.js');
  const { FORME_MATCHS } = await imp('data/db/scoreFormRead.js');
  assert.deepEqual([T.CONSTANTES.fenetre, T.CONSTANTES.minimumFenetre, T.CONSTANTES.forme], [STAT_SAMPLE, STAT_MIN_SAMPLE, FORME_MATCHS]);
  const lire = (rel) => fs.readFileSync(path.join(SERVEUR, 'src', rel), 'utf8');
  const sf = lire('data/db/scoreFormRead.js');
  const constante = (nom) => Number(new RegExp(`const ${nom} = (\\d+);`).exec(sf)?.[1]);
  assert.deepEqual(
    [constante('MINIMUM_SAISON_EQUIPE'), constante('MINIMUM_SAISON_LIGUE'), constante('MINIMUM_LIGUE'), constante('MINIMUM_XG')],
    [T.CONSTANTES.minimumSaisonEquipe, T.CONSTANTES.minimumSaisonLigue, T.CONSTANTES.minimumLigue, T.CONSTANTES.minimumXg]
  );
  assert.match(sf, /const DEFAUT = \{ home: 1\.45, away: 1\.15 \};/);
  assert.deepEqual(T.CONSTANTES.defaut, { home: 1.45, away: 1.15 });
  assert.match(sf, /joursAvant\(date, 365\)/);
  assert.match(lire('data/db/statInputsRead.js'), /ORDER BY m\.date DESC LIMIT 30\)/);
  assert.match(lire('data/db/matchStatsRead.js'), /const MINIMUM_SAISON = 6;/);
  const code = lire('data/db/dayTable.js');
  const imports = [...code.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).sort();
  // Étape 27 : le jeton « un calcul lourd à la fois » (utils/calculLourd.js) autour du contrôle à part.
  assert.deepEqual(imports, ['../../utils/calculLourd.js', '../providers/leagueCups.js', '../providers/seasonWindows.js', './columns.js', './identityRegistry.js', './leagueBenchmarks.js', './matchStatsDb.js', './matchStatsRead.js', './scoreFormRead.js', './statInputsRead.js', 'node:child_process', 'node:fs', 'node:sqlite', 'node:url']);
  // Le contrôle de la nuit dans un processus à part : en lecture seule, rien d'autre que dayTable.js.
  const aPart = lire('data/db/dayTableControle.js');
  assert.deepEqual([...aPart.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).sort(), ['./dayTable.js', 'node:sqlite']);
  assert.ok(aPart.includes('new DatabaseSync(chemin, { readOnly: true })'), 'le contrôle à part ouvre la base en lecture seule');
  // Les lecteurs du moteur ne servent qu'au second chemin du contrôle.
  const debutControle = code.indexOf('// ======================================================= le contrôle anti-fuite');
  for (const f of ['moyennesEquipe(', 'scoreInputsFromStore(', 'leagueAveragesBefore(']) {
    const avant = code.slice(0, debutControle).split('\n').filter((l) => l.includes(f) && !/^\s*(\*|\/\/)/.test(l) && !/^import /.test(l));
    assert.deepEqual(avant, [], `${f} hors du contrôle`);
  }
  // Toutes les listes de clés passent par json_each (jamais des milliers de « ? »).
  assert.doesNotMatch(code, /IN \(\$\{[^}]*\.map\(\(\) => '\?'\)/);
});
