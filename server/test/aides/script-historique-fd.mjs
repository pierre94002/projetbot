/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-historique-fd.mjs <serveur de la copie> <phase>
 *
 * Étape 13 — l'historique football-data.co.uk depuis 2000. Aucun réseau : le
 * SITE est FABRIQUÉ (des CSV écrits ici à partir des rencontres de la base
 * d'essai, servis par un faux `fetch` qui compte chaque requête), la base est
 * la copie de la base d'essai, l'heure est figée au 05/10/2026 12 h UTC
 * (saison en cours : 2026-27). Sortie : une ligne JSON.
 *
 * Phases :
 *   vote       six fichiers (E0 2000-01, 2025-26, 2026-27, E1 et EC 2026-27, new/USA) : les noms traduits
 *              par le vote (jour + score), jamais par leur ressemblance — deux noms échangés exprès —, la
 *              période commune, les clubs anciens, un conflit, un vote seul, un écart de score
 *   reprise    le curseur : budget de requêtes, reprise au fichier suivant, échec retenté, absent jamais
 *              redemandé pour une saison passée, trois échecs de suite, relecture hebdomadaire
 *   reimport   le même fichier deux fois, puis corrigé par le site : jamais de doublon, identités stables
 *   partage    l'étape « cotes passées » dépose ses fichiers dans le cache ; l'historique les reprend sans
 *              requête ; ses écarts de score sont rendus en liste
 *   etape      l'étape « historiqueFd » de l'actualisation (bilan, quand elle est due)
 *   provider   historicalMatchesProvider.js rebranché sur fd_history, par identifiants
 *   route      GET /api/match-stats/fd-history (application Express, sans réseau), lecture seule
 *   ecran      les réponses de la route (jamais, en cours, complet) pour le rendu de la carte
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const BASE = process.env.MATCH_STATS_DB;
const RUNTIME = path.join(serveur, 'data', 'runtime');

const { openDb, closeDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
const H = await imp('data/providers/footballDataHistory.js');
const O = await imp('data/providers/footballDataOdds.js');
const C = await imp('data/providers/footballDataCache.js');

const SITE = 'https://www.football-data.co.uk';
const FIGE = Date.now();
const JOUR = 86_400_000;
const empreinte = () => crypto.createHash('sha1').update(fs.readFileSync(BASE)).digest('hex');
const sortie = { phase };

// ------------------------------------------------------------- le site fabriqué

const BOM = '﻿';
const ENTETES_SAISON = [
  'Div', 'Date', 'Time', 'HomeTeam', 'AwayTeam', 'FTHG', 'FTAG', 'FTR', 'HTHG', 'HTAG', 'HTR', 'Referee', 'HS', 'AS', 'HST', 'AST', 'HF', 'AF', 'HC', 'AC', 'HY', 'AY', 'HR', 'AR',
  'B365H', 'B365D', 'B365A', 'WHH', 'WHD', 'WHA', 'MaxH', 'MaxD', 'MaxA', 'AvgH', 'AvgD', 'AvgA', 'Avg>2.5', 'Avg<2.5', 'AHh', 'AvgAHH', 'AvgAHA',
  'B365CH', 'B365CD', 'B365CA', 'AvgCH', 'AvgCD', 'AvgCA', 'WHCH', 'WHCD', 'WHCA'
];
const ENTETES_2000 = ['Div', 'Date', 'HomeTeam', 'AwayTeam', 'FTHG', 'FTAG', 'FTR', 'HTHG', 'HTAG', 'HTR', 'Attendance', 'Referee', 'HS', 'AS', 'HST', 'AST', 'HC', 'AC', 'HF', 'AF', 'HY', 'AY', 'HR', 'AR', 'WHH', 'WHD', 'WHA'];
const ENTETES_PAYS = ['Country', 'League', 'Season', 'Date', 'Time', 'Home', 'Away', 'HG', 'AG', 'Res', 'PSCH', 'PSCD', 'PSCA', 'MaxCH', 'MaxCD', 'MaxCA', 'AvgCH', 'AvgCD', 'AvgCA', 'B365CH', 'B365CD', 'B365CA'];
const jj = (iso) => iso.split('-').reverse().join('/');
const resultat = (h, a) => (h > a ? 'H' : h < a ? 'A' : 'D');
const csv = (entetes, lignes) => `${BOM}${entetes.join(',')}\r\n${lignes.map((v) => entetes.map((h) => v[h] ?? '').join(',')).join('\r\n')}\r\n`;

/** Le nom football-data d'un club : celui du magasin, sauf deux noms ÉCHANGÉS exprès et un nom sans rapport. */
const NOMS_FD = new Map([
  ['fotmob-10260', 'Man City'], // le club FotMob 10260 est Manchester United : le vote doit le dire malgré le nom
  ['fotmob-8456', 'Man United'], // et réciproquement
  ['fotmob-9879', 'Zeta Rovers'] // Fulham, sous un nom qui ne ressemble à rien
]);
const nomFd = (id, nom) => NOMS_FD.get(id) ?? nom;

function rencontres(db, league, depuis, jusqua) {
  return db
    .prepare(`SELECT match_key, date, home_id, away_id, home_name, away_name, home_goals, away_goals FROM matches
              WHERE league = ? AND date >= ? AND date <= ? AND home_goals IS NOT NULL AND home_id IS NOT NULL AND away_id IS NOT NULL ORDER BY date, match_key`)
    .all(league, depuis, jusqua);
}

/** Une ligne de fichier saisonnier pour une rencontre du magasin (scores du magasin, sauf `ajuster`). */
function ligneSaison(div, m, i, ajuster = {}) {
  const hg = m.home_goals;
  const ag = m.away_goals;
  return {
    Div: div,
    Date: jj(m.date),
    Time: '13:00', // heure britannique : 12:00 UTC en été, le même jour
    HomeTeam: nomFd(m.home_id, m.home_name),
    AwayTeam: nomFd(m.away_id, m.away_name),
    FTHG: hg,
    FTAG: ag,
    FTR: resultat(hg, ag),
    HTHG: Math.min(hg, 1),
    HTAG: 0,
    HTR: resultat(Math.min(hg, 1), 0),
    Referee: i % 3 ? 'M Oliver' : 'A Taylor',
    HS: 10 + (i % 5),
    AS: 8 + (i % 4),
    HST: 4,
    AST: 3,
    HF: 11,
    AF: 12,
    HC: 5 + (i % 3),
    AC: 4,
    HY: 1 + (i % 2),
    AY: 2,
    HR: 0,
    AR: i % 7 === 0 ? 1 : 0,
    B365H: '2.10',
    B365D: '3.40',
    B365A: '3.50',
    WHH: '2.05',
    WHD: '3.30',
    WHA: '3.60',
    MaxH: '2.20',
    MaxD: '3.60',
    MaxA: '3.75',
    AvgH: '2.08',
    AvgD: '3.38',
    AvgA: '3.52',
    'Avg>2.5': '1.90',
    'Avg<2.5': '1.95',
    AHh: '-0.25',
    AvgAHH: '1.95',
    AvgAHA: '1.93',
    B365CH: '2.00',
    B365CD: '3.50',
    B365CA: '3.70',
    AvgCH: '2.01',
    AvgCD: '3.45',
    AvgCA: '3.66',
    WHCH: '2.00',
    WHCD: '3.40',
    WHCA: '3.75',
    ...ajuster
  };
}

/** Les six fichiers du site fabriqué, à partir de la base d'essai. */
function fabriquerSite() {
  const db = openDb();
  const e0Avant = rencontres(db, 'EPL', '2026-02-01', '2026-06-30');
  const e0 = rencontres(db, 'EPL', '2026-07-01', '2026-10-05');
  const e1 = rencontres(db, 'Championship', '2026-07-01', '2026-10-05');
  const mls = rencontres(db, 'MLS', '2026-01-01', '2026-10-05');
  closeDb();
  // UN SEUL VOTE : « Brighton & HA », une seule fois, sur une rencontre que le jour et le score désignent seule.
  const seule = (m, liste) => liste.filter((x) => Math.abs(Date.parse(x.date) - Date.parse(m.date)) <= JOUR && x.home_goals === m.home_goals && x.away_goals === m.away_goals).length === 1;
  const brighton = e0.find((m) => m.away_id === 'fotmob-10204' && seule(m, e0));
  const lignesE0 = e0.map((m, i) => (m === brighton ? ligneSaison('E0', m, i, { AwayTeam: 'Brighton & HA' }) : ligneSaison('E0', m, i)));
  // ÉCART DE SCORE : une rencontre dont football-data donne un but de plus au club qui reçoit.
  const ecart = e0Avant.find((m) => m.home_id === 'fotmob-8650') ?? e0Avant[5];
  // CONFLIT : en 2025-26, Tottenham s'appelle « Spurs » à domicile et « Tottenham » à l'extérieur — deux noms qui
  // jouent EN MÊME TEMPS sous le même club : ni l'un ni l'autre n'est traduit.
  const lignesE0Avant = e0Avant.map((m, i) => {
    const ajuster = m.match_key === ecart.match_key ? { FTHG: m.home_goals + 1, FTR: resultat(m.home_goals + 1, m.away_goals) } : {};
    if (m.home_id === 'fotmob-8586') ajuster.HomeTeam = 'Spurs';
    return ligneSaison('E0', m, i, ajuster);
  });
  // Une ligne entre guillemets (arbitre « Wiley, A. G. ») : jamais une colonne décalée.
  lignesE0Avant[0].Referee = '"Wiley, A. G."';
  const lignesE1 = e1.map((m, i) => ligneSaison('E1', m, i));
  // 2000-01 : les mêmes noms football-data, plus un club disparu (Wimbledon), sans heure, année à deux chiffres.
  const anciens = ['Man City', 'Man United', 'Zeta Rovers', 'Arsenal', 'Wimbledon', 'Chelsea'];
  const lignes2000 = [];
  for (let k = 0; k < 12; k++) {
    const dom = anciens[k % anciens.length];
    const ext = anciens[(k + 1 + (k % 3)) % anciens.length];
    if (dom === ext) continue;
    const jour = String(5 + k).padStart(2, '0');
    lignes2000.push({ Div: 'E0', Date: `${jour}/09/00`, HomeTeam: dom, AwayTeam: ext, FTHG: k % 3, FTAG: (k + 1) % 2, FTR: resultat(k % 3, (k + 1) % 2), HTHG: 0, HTAG: 0, HTR: 'D', Attendance: 30000, Referee: 'Rob Harris', HS: 12, AS: 9, HST: 6, AST: 4, HC: 6, AC: 5, HF: 13, AF: 12, HY: 1, AY: 2, HR: 0, AR: 0, WHH: '2.10', WHD: '3.20', WHA: '3.10' });
  }
  // National League (EC) : un championnat que le magasin ne suit pas.
  const lignesEC = [
    { Div: 'EC', Date: '12/09/2026', Time: '15:00', HomeTeam: 'Yeovil', AwayTeam: 'Hartlepool', FTHG: 1, FTAG: 1, FTR: 'D' },
    { Div: 'EC', Date: '19/09/2026', Time: '15:00', HomeTeam: 'Hartlepool', AwayTeam: 'Yeovil', FTHG: 2, FTAG: 0, FTR: 'H' }
  ];
  // RENOMMÉ EN COURS DE SAISON (comme « Ham-Kam » -> « HamKam ») : le club MLS qui joue le plus s'appelle
  // autrement à partir du milieu de ses matchs. Les deux noms se SUCCÈDENT : le même club, pas un conflit.
  const parClub = new Map();
  for (const m of mls) for (const id of [m.home_id, m.away_id]) parClub.set(id, (parClub.get(id) ?? 0) + 1);
  const renomme = [...parClub.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  const sesMatchs = mls.filter((m) => m.home_id === renomme || m.away_id === renomme);
  const bascule = sesMatchs[Math.floor(sesMatchs.length / 2)].date;
  const nomUsa = (id, nom, date) => (id === renomme && date >= bascule ? `${nom} Renommé` : nom);
  // Fichier par pays (MLS) : Home/Away/HG/AG, saison civile, clôture seulement. Heure britannique : 00:30 = 23:30 UTC la veille.
  const lignesUsa = mls.map((m) => ({
    Country: 'USA',
    League: 'MLS',
    Season: '2026',
    Date: jj(new Date(Date.parse(`${m.date}T00:00:00Z`) + JOUR).toISOString().slice(0, 10)),
    Time: '00:30',
    Home: nomUsa(m.home_id, m.home_name, m.date),
    Away: nomUsa(m.away_id, m.away_name, m.date),
    HG: m.home_goals,
    AG: m.away_goals,
    Res: resultat(m.home_goals, m.away_goals),
    PSCH: '2.30',
    PSCD: '3.50',
    PSCA: '3.10',
    MaxCH: '2.40',
    MaxCD: '3.70',
    MaxCA: '3.30',
    AvgCH: '2.25',
    AvgCD: '3.45',
    AvgCA: '3.05',
    B365CH: '2.20',
    B365CD: '3.40',
    B365CA: '3.00'
  }));
  const fichiers = {
    'mmz4281/2627/E0': csv(ENTETES_SAISON, lignesE0),
    'mmz4281/2526/E0': csv(ENTETES_SAISON, lignesE0Avant),
    'mmz4281/2627/E1': csv(ENTETES_SAISON, lignesE1),
    'mmz4281/2627/EC': csv(ENTETES_SAISON, lignesEC),
    'mmz4281/0001/E0': csv(ENTETES_2000, lignes2000),
    'new/USA': csv(ENTETES_PAYS, lignesUsa)
  };
  const nomRenomme = mls.find((m) => m.home_id === renomme)?.home_name ?? mls.find((m) => m.away_id === renomme).away_name;
  return {
    fichiers,
    compte: { e0: lignesE0.length, e0Avant: lignesE0Avant.length, e1: lignesE1.length, ec: lignesEC.length, e2000: lignes2000.length, usa: lignesUsa.length },
    ecart: { matchKey: ecart.match_key, score: `${ecart.home_goals}-${ecart.away_goals}` },
    renomme: { id: renomme, avant: nomRenomme, apres: `${nomRenomme} Renommé`, bascule }
  };
}

/** La liste des fichiers d'un essai (dans l'ordre du curseur de la vraie liste). */
const descripteurs = (noms) => H.listeDesFichiers().filter((f) => noms.includes(f.fichier));

/** Un faux site : chaque fichier en 200, ou le statut voulu ; tout le reste en 404. Compte les requêtes par adresse. */
function fauxSite(fichiers, { statuts = {} } = {}) {
  const requetes = new Map();
  const fetchImpl = async (url) => {
    const u = String(url);
    requetes.set(u, (requetes.get(u) ?? 0) + 1);
    const nom = u.replace(`${SITE}/`, '').replace(/\.csv$/, '');
    const statut = typeof statuts[nom] === 'function' ? statuts[nom]() : statuts[nom];
    if (statut && statut !== 200) return { ok: false, status: statut, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) };
    if (!(nom in fichiers)) return { ok: false, status: 404, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) };
    const octets = Buffer.from(fichiers[nom], 'utf8');
    return { ok: true, status: 200, headers: { get: (h) => (/last-modified/i.test(h) ? 'Mon, 21 Sep 2026 17:50:49 GMT' : 'text/csv') }, arrayBuffer: async () => octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.length) };
  };
  return { requetes, telecharger: (url) => H.telechargerDuSite(url, { ecartMs: 0, attenteEssaiMs: 0, fetchImpl }), fetchImpl, total: () => [...requetes.values()].reduce((n, x) => n + x, 0) };
}

const NOMS_SITE = ['new/USA', 'mmz4281/2627/E0', 'mmz4281/2627/E1', 'mmz4281/2627/EC', 'mmz4281/2526/E0', 'mmz4281/0001/E0'];
const clubs = (db) => Object.fromEntries(db.prepare('SELECT pays, nom, team_id, votes, total, etat, id FROM fd_teams ORDER BY pays, nom').all().map((c) => [`${c.pays}|${c.nom}`, c]));
const liens = (db, code, saison = null) =>
  Object.fromEntries(db.prepare(`SELECT lien, COUNT(*) n FROM fd_history WHERE code = ?${saison ? ' AND saison = ?' : ''} GROUP BY lien`).all(...(saison ? [code, saison] : [code])).map((r) => [r.lien, r.n]));

async function requeteExpress(app, methode, url) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage(new Socket());
    req.method = methode;
    req.url = url;
    req.headers = { host: 'essai' };
    const res = new http.ServerResponse(req);
    const morceaux = [];
    res.write = (c) => {
      morceaux.push(Buffer.from(c));
      return true;
    };
    res.end = (c) => {
      if (c) morceaux.push(Buffer.from(c));
      let corps = null;
      try {
        corps = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
      } catch {
        // laissé à null
      }
      resolve({ code: res.statusCode, corps });
      return res;
    };
    app.handle(req, res, reject);
  });
}
const etatRuntime = () => Object.fromEntries(fs.readdirSync(RUNTIME).sort().map((f) => [f, fs.statSync(path.join(RUNTIME, f)).mtimeMs]));

// ====================================================================== phases

if (phase === 'vote') {
  const site = fabriquerSite();
  const faux = fauxSite(site.fichiers);
  const db = openDb();
  const bilan = await H.passeHistorique({ database: db, fichiers: descripteurs(NOMS_SITE), telecharger: faux.telecharger, budget: 50 });
  sortie.bilan = { ...bilan, resume: undefined, rattachement: bilan.rattachement };
  sortie.compte = site.compte;
  sortie.ecartPlante = site.ecart;
  sortie.renomme = site.renomme;
  sortie.clubs = clubs(db);
  sortie.liens = { e0: liens(db, 'E0', '2026-27'), e0Avant: liens(db, 'E0', '2025-26'), e0Ancien: liens(db, 'E0', '2000-01'), e1: liens(db, 'E1'), ec: liens(db, 'EC'), usa: liens(db, 'USA') };
  // Les matchs de 2000-01 du nom « Man City » : leur club FotMob est celui que le vote a donné au NOM.
  sortie.ancienManCity = db
    .prepare(`SELECT COUNT(*) n, MIN(t.team_id) teamId FROM fd_history h JOIN fd_teams t ON t.id = h.dom WHERE h.saison = '2000-01' AND t.nom = 'Man City'`)
    .get();
  // Chaque ligne rattachée retrouve la rencontre du magasin aux mêmes clubs, au même score.
  sortie.incoherents = db
    .prepare(`SELECT COUNT(*) n FROM fd_history h JOIN matches m ON m.match_key = h.match_key JOIN fd_teams td ON td.id = h.dom JOIN fd_teams te ON te.id = h.ext
              WHERE h.lien = 1 AND (m.home_id <> td.team_id OR m.away_id <> te.team_id OR m.home_goals <> h.bd OR m.away_goals <> h.be)`)
    .get().n;
  sortie.ecarts = H.ecartsDeScore({ database: db });
  // Les lignes des noms piégés (conflit, vote seul) : les seules qui doivent rester sans traduction.
  sortie.pieges = db
    .prepare(`SELECT COUNT(*) AS nonTraduits FROM fd_history h WHERE h.lien = 3 AND EXISTS (SELECT 1 FROM fd_teams t WHERE t.id IN (h.dom, h.ext) AND t.nom IN ('Spurs', 'Tottenham', 'Brighton & HA'))`)
    .get();
  sortie.lignesNonTraduites = db
    .prepare(`SELECT h.code, h.date, td.nom AS dom, td.etat AS etatDom, te.nom AS ext, te.etat AS etatExt FROM fd_history h JOIN fd_teams td ON td.id = h.dom JOIN fd_teams te ON te.id = h.ext WHERE h.lien = 3 ORDER BY h.date`)
    .all();
  sortie.arbitreGuillemets = db.prepare(`SELECT arbitre, tirs_d, tirs_e, corners_d, b365_1 FROM fd_history WHERE arbitre LIKE 'Wiley%'`).all();
  sortie.usaUnJour = db.prepare(`SELECT date, date_fichier AS dateFichier, heure FROM fd_history WHERE code = 'USA' LIMIT 1`).get();
  sortie.resume = H.lireResume({ database: db });
  sortie.requetes = faux.total();
  // Le rattachement refait à l'identique (idempotent).
  const avant = db.prepare('SELECT id, lien, match_key FROM fd_history ORDER BY id').all();
  const clubsAvant = clubs(db);
  H.rattacherHistorique({ database: db });
  sortie.idempotent = JSON.stringify(db.prepare('SELECT id, lien, match_key FROM fd_history ORDER BY id').all()) === JSON.stringify(avant) && JSON.stringify(clubs(db)) === JSON.stringify(clubsAvant);
  closeDb();
} else if (phase === 'reprise') {
  const site = fabriquerSite();
  const db = openDb();
  const liste = descripteurs(NOMS_SITE);
  // 1. Budget de 2 requêtes : les deux premiers fichiers du curseur, puis le curseur dit le suivant.
  let faux = fauxSite(site.fichiers);
  const p1 = await H.passeHistorique({ database: db, fichiers: liste, telecharger: faux.telecharger, budget: 2 });
  sortie.p1 = { requetes: faux.total(), parAdresse: Object.fromEntries(faux.requetes), importes: p1.importes, reste: p1.reste, complet: p1.complet, arrete: p1.arrete, curseur: H.lireEtatImport({ database: db }).curseur };
  // 2. Le suivant : E1 2026-27 en panne (500, trois essais), EC 2026-27 absent (404), le reste servi.
  faux = fauxSite(site.fichiers, { statuts: { 'mmz4281/2627/E1': 500, 'mmz4281/2627/EC': 404 } });
  const p2 = await H.passeHistorique({ database: db, fichiers: liste, telecharger: faux.telecharger, budget: 50 });
  sortie.p2 = { requetes: faux.total(), parAdresse: Object.fromEntries(faux.requetes), importes: p2.importes, echecs: p2.echecs, absents: p2.absents, erreurs: p2.erreurs, reste: p2.reste, complet: p2.complet };
  sortie.fichiersApres2 = Object.fromEntries(db.prepare('SELECT fichier, statut, essais, erreur FROM fd_fichiers').all().map((f) => [f.fichier, f]));
  // 3. La passe suivante ne redemande QUE le fichier en échec et l'absent de la saison en cours si sa dernière demande a une semaine.
  faux = fauxSite(site.fichiers, { statuts: { 'mmz4281/2627/EC': 404 } });
  const p3 = await H.passeHistorique({ database: db, fichiers: liste, telecharger: faux.telecharger, budget: 50 });
  sortie.p3 = { parAdresse: Object.fromEntries(faux.requetes), importes: p3.importes, reste: p3.reste, complet: p3.complet };
  db.prepare(`UPDATE fd_fichiers SET updated_at = ? WHERE fichier = 'mmz4281/2627/EC'`).run(new Date(FIGE - 8 * JOUR).toISOString());
  faux = fauxSite(site.fichiers);
  const p4 = await H.passeHistorique({ database: db, fichiers: liste, telecharger: faux.telecharger, budget: 50 });
  sortie.p4 = { parAdresse: Object.fromEntries(faux.requetes), importes: p4.importes, reste: p4.reste, complet: p4.complet, etat: H.lireEtatImport({ database: db }) };
  // 4. Rien de plus à demander : aucune requête.
  faux = fauxSite(site.fichiers);
  const p5 = await H.passeHistorique({ database: db, fichiers: liste, telecharger: faux.telecharger, budget: 50 });
  sortie.p5 = { requetes: faux.total(), importes: p5.importes, inchanges: p5.inchanges };
  // 5. Une semaine plus tard pour UN fichier en cours (copie gardée vieille de 8 jours) : lui seul est relu ;
  //    un fichier en cours relu hier, et les saisons passées, jamais.
  const dossier = C.dossierCache({ database: db });
  const vieux = new Date(FIGE - 8 * JOUR);
  fs.utimesSync(C.cheminDansLeCache(`${SITE}/mmz4281/2627/E0.csv`, dossier), vieux, vieux);
  const hier = new Date(FIGE - JOUR);
  fs.utimesSync(C.cheminDansLeCache(`${SITE}/new/USA.csv`, dossier), hier, hier);
  faux = fauxSite(site.fichiers);
  const p6 = await H.passeHistorique({ database: db, fichiers: liste, telecharger: faux.telecharger, budget: 50 });
  sortie.p6 = { parAdresse: Object.fromEntries(faux.requetes), importes: p6.importes, inchanges: p6.inchanges };
  // Relu (même contenu) : sa copie est remise à l'heure ; la passe suivante ne le redemande pas.
  faux = fauxSite(site.fichiers);
  await H.passeHistorique({ database: db, fichiers: liste, telecharger: faux.telecharger, budget: 50 });
  sortie.p6b = { requetes: faux.total() };
  // 6. Trois échecs de suite arrêtent les téléchargements de la passe.
  db.exec('DELETE FROM fd_fichiers');
  fs.rmSync(dossier, { recursive: true, force: true });
  faux = fauxSite(site.fichiers, { statuts: Object.fromEntries(NOMS_SITE.map((n) => [n, 503])) });
  const p7 = await H.passeHistorique({ database: db, fichiers: liste, telecharger: faux.telecharger, budget: 50 });
  sortie.p7 = { parAdresse: Object.fromEntries(faux.requetes), echecs: p7.echecs, arrete: p7.arrete };
  closeDb();
} else if (phase === 'reimport') {
  const site = fabriquerSite();
  const db = openDb();
  const liste = descripteurs(['mmz4281/2526/E0', 'new/USA']);
  let faux = fauxSite(site.fichiers);
  await H.passeHistorique({ database: db, fichiers: liste, telecharger: faux.telecharger, budget: 10 });
  const compter = () => ({
    lignes: db.prepare('SELECT COUNT(*) n FROM fd_history').get().n,
    doublons: db.prepare('SELECT COUNT(*) n FROM (SELECT code, date_fichier, dom, ext FROM fd_history GROUP BY code, date_fichier, dom, ext HAVING COUNT(*) > 1)').get().n,
    clubs: db.prepare('SELECT COUNT(*) n FROM fd_teams').get().n,
    parCode: Object.fromEntries(db.prepare('SELECT code, COUNT(*) n FROM fd_history GROUP BY code').all().map((r) => [r.code, r.n]))
  });
  sortie.premier = compter();
  const idsAvant = clubs(db);
  // Le même fichier relu : rien de réimporté (même empreinte), rien de doublé — même relu de force.
  const dossier = C.dossierCache({ database: db });
  const demain = new Date(FIGE + 60_000);
  fs.utimesSync(C.cheminDansLeCache(`${SITE}/mmz4281/2526/E0.csv`, dossier), demain, demain);
  const r2 = await H.passeHistorique({ database: db, fichiers: liste, telecharger: fauxSite(site.fichiers).telecharger, budget: 10 });
  sortie.second = { ...compter(), importes: r2.importes, inchanges: r2.inchanges };
  const r3 = await H.passeHistorique({ database: db, fichiers: liste, telecharger: fauxSite(site.fichiers).telecharger, budget: 10, reimporter: true });
  sortie.force = { ...compter(), importes: r3.importes };
  // Le site corrige le fichier : un score changé, une ligne retirée, une ajoutée (un club nouveau), une ligne en double.
  const lignes = site.fichiers['mmz4281/2526/E0'].replace(BOM, '').trim().split(/\r?\n/);
  const entetes = lignes[0];
  const corps = lignes.slice(1);
  const retiree = corps.pop();
  const champs = corps[0].split(',');
  const iGoals = ENTETES_SAISON.indexOf('FTHG');
  champs[iGoals] = String(Number(champs[iGoals]) + 3);
  corps[0] = champs.join(',');
  const nouvelle = corps[1].split(',');
  nouvelle[ENTETES_SAISON.indexOf('HomeTeam')] = 'Nouveau Club';
  nouvelle[ENTETES_SAISON.indexOf('Date')] = '30/06/2026';
  corps.push(nouvelle.join(','));
  corps.push(corps[2]);
  const corrige = `${BOM}${entetes}\r\n${corps.join('\r\n')}\r\n`;
  faux = fauxSite({ ...site.fichiers, 'mmz4281/2526/E0': corrige });
  // La copie gardée a plus d'une semaine ? Non : c'est une saison passée. Le site la corrige, on la redépose (comme l'étape des cotes passées).
  C.deposerDansLeCache(`${SITE}/mmz4281/2526/E0.csv`, Buffer.from(corrige, 'utf8'), { dossier, maintenant: new Date(FIGE + 120_000) });
  const r4 = await H.passeHistorique({ database: db, fichiers: liste, telecharger: faux.telecharger, budget: 10 });
  sortie.corrige = { ...compter(), importes: r4.importes, requetes: faux.total(), retiree: retiree.split(',').slice(1, 5).join(','), scoreLu: db.prepare(`SELECT bd FROM fd_history WHERE code = 'E0' AND date_fichier = ? AND dom = (SELECT id FROM fd_teams WHERE pays = 'ENG' AND nom = ?)`).get(...(() => { const c = corps[0].split(','); return [c[1].split('/').reverse().join('-'), c[3]]; })())?.bd, attendu: Number(champs[iGoals]) };
  const idsApres = clubs(db);
  sortie.identitesStables = Object.entries(idsAvant).every(([k, c]) => idsApres[k]?.id === c.id);
  sortie.nouveauClub = idsApres['ENG|Nouveau Club'] ?? null;
  closeDb();
} else if (phase === 'partage') {
  const site = fabriquerSite();
  // L'étape « cotes passées » (importOddsHistory, via son téléchargement) : un faux fetch GLOBAL, comme le site.
  const faux = fauxSite(site.fichiers);
  globalThis.fetch = faux.fetchImpl;
  const db = openDb();
  const r = await O.importOddsHistory({ codes: ['E0'], saisons: ['2526', '2627'], apply: false, database: db });
  sortie.cotesPassees = { requetes: faux.total(), parAdresse: Object.fromEntries(faux.requetes), linked: r.linked, scoreMismatch: r.scoreMismatch, scoreMismatches: r.scoreMismatches, rows: r.rows };
  const dossier = C.dossierCache({ database: db });
  sortie.cache = Object.fromEntries(
    ['mmz4281/2526/E0', 'mmz4281/2627/E0'].map((n) => {
      const lu = C.lireDuCache(`${SITE}/${n}.csv`, { dossier });
      return [n, lu ? { identique: lu.octets.equals(Buffer.from(site.fichiers[n], 'utf8')), version: lu.version, lu: lu.lu } : null];
    })
  );
  // Puis l'historique : les deux fichiers sont repris du cache, SANS requête ; les autres sont demandés.
  const faux2 = fauxSite(site.fichiers);
  const h = await H.passeHistorique({ database: db, fichiers: descripteurs(['mmz4281/2627/E0', 'mmz4281/2526/E0', 'mmz4281/2627/E1']), telecharger: faux2.telecharger, budget: 10 });
  sortie.historique = { parAdresse: Object.fromEntries(faux2.requetes), importes: h.importes, reprisDuCache: h.reprisDuCache, telecharges: h.telecharges };
  closeDb();
} else if (phase === 'etape') {
  const site = fabriquerSite();
  const { __testing } = await import(pathToFileURL(path.join(serveur, 'src', 'jobs', 'matchStatsAutoRefresh.js')).href);
  const faux = fauxSite(site.fichiers);
  const liste = descripteurs(NOMS_SITE);
  const ctx = (derniere = null, manuel = false) => ({ manuel, derniere: () => derniere });
  sortie.dueAvant = __testing.dueHistoriqueFd(ctx());
  const enCours = await __testing.passeHistoriqueFd(ctx(), { fichiers: liste, telecharger: faux.telecharger, budget: 2 });
  sortie.enCours = { status: enCours.status, summary: enCours.summary, changed: enCours.changed };
  sortie.dueEnCours = __testing.dueHistoriqueFd(ctx(new Date().toISOString()));
  const fini = await __testing.passeHistoriqueFd(ctx(), { fichiers: liste, telecharger: faux.telecharger, budget: 50 });
  sortie.fini = { status: fini.status, summary: fini.summary, changed: fini.changed, details: { complet: fini.details?.complet, requetes: fini.details?.requetes } };
  sortie.dueFiniAujourdhui = __testing.dueHistoriqueFd(ctx(new Date().toISOString()));
  sortie.dueFiniHier = __testing.dueHistoriqueFd(ctx(new Date(FIGE - JOUR).toISOString()));
  sortie.dueManuel = __testing.dueHistoriqueFd(ctx(new Date().toISOString(), true));
  const panne = fauxSite(site.fichiers, { statuts: { 'mmz4281/2627/E0': 503 } });
  fs.utimesSync(C.cheminDansLeCache(`${SITE}/mmz4281/2627/E0.csv`, C.dossierCache({ database: openDb() })), new Date(FIGE - 9 * JOUR), new Date(FIGE - 9 * JOUR));
  const enPanne = await __testing.passeHistoriqueFd(ctx(), { fichiers: liste, telecharger: panne.telecharger, budget: 50 });
  sortie.enPanne = { status: enPanne.status, summary: enPanne.summary };
  const apresPanne = openDb();
  sortie.enPanneFichier = apresPanne.prepare(`SELECT statut, erreur, lignes FROM fd_fichiers WHERE fichier = 'mmz4281/2627/E0'`).get();
  sortie.enPanneResume = H.lireResume({ database: apresPanne }).fichiers.echecs;
  closeDb();
} else if (phase === 'provider') {
  const site = fabriquerSite();
  const db = openDb();
  await H.passeHistorique({ database: db, fichiers: descripteurs(NOMS_SITE), telecharger: fauxSite(site.fichiers).telecharger, budget: 50 });
  const P = await imp('data/providers/historicalMatchesProvider.js');
  // Ce que devraient donner les fonctions : recalculé ici, à la main, depuis les lignes du club (identifiant FotMob).
  const lignesDuClub = (teamId, n) =>
    db
      .prepare(`SELECT h.*, td.team_id AS domId FROM fd_history h JOIN fd_teams td ON td.id = h.dom JOIN fd_teams te ON te.id = h.ext
                WHERE h.code = 'E0' AND (td.team_id = ? OR te.team_id = ?) ORDER BY h.date DESC, h.id DESC LIMIT ?`)
      .all(teamId, teamId, n);
  sortie.attenduArsenal = lignesDuClub('fotmob-9825', 10).map((l) => ({ date: l.date, dom: l.domId === 'fotmob-9825', bd: l.bd, be: l.be, tirs: l.domId === 'fotmob-9825' ? l.tirs_d : l.tirs_e }));
  sortie.stats = P.resolveHistoricalStatsByName('Arsenal', 'EPL');
  sortie.forme = P.resolveHistoricalFormByName('Arsenal', 'EPL');
  sortie.classement = P.resolveHistoricalStandingRow('Arsenal', 'EPL');
  // Le nom FotMob de Manchester United : le club au nom football-data « Man City » (le vote l'a dit).
  sortie.statsUnited = P.resolveHistoricalStatsByName('Manchester United', 'EPL');
  sortie.attenduUnited = lignesDuClub('fotmob-10260', 10).length;
  // Jamais une ressemblance de nom : rien pour un nom qui n'est ni un club du magasin ni un nom football-data exact.
  sortie.ressemblants = ['Arsenal Tula', 'Arsenl', 'Man', 'Manchester', 'Zeta'].map((n) => [n, P.resolveHistoricalStatsByName(n, 'EPL')]);
  // Un club disparu avant 2023, par son nom football-data EXACT (aucun identifiant FotMob).
  sortie.wimbledon = P.resolveHistoricalFormByName('Wimbledon', 'EPL');
  sortie.horsCouverture = P.resolveHistoricalStatsByName('Arsenal', 'Copa Libertadores');
  sortie.codes = ['EPL', 'Championship', 'La Liga - Spain', 'Belgium First Div', 'MLS', 'Premier League - Russia', 'Copa Libertadores'].map((l) => [l, P.resolveLeagueCode(l)]);
  closeDb();
} else if (phase === 'route' || phase === 'ecran') {
  const { createApp } = await imp('app.js');
  const app = createApp();
  const get = (url) => requeteExpress(app, 'GET', url);
  // La base d'essai n'a pas encore les tables de l'historique : la première ouverture les crée (c'est
  // l'ouverture qui écrit, pas la route) ; l'empreinte se prend après.
  openDb();
  closeDb();
  const e0 = empreinte();
  const runtimeAvant = etatRuntime();
  sortie.jamais = await get('/api/match-stats/fd-history');
  closeDb();
  sortie.baseInchangeeJamais = empreinte() === e0;
  const site = fabriquerSite();
  const db = openDb();
  const liste = descripteurs(NOMS_SITE);
  await H.passeHistorique({ database: db, fichiers: liste, telecharger: fauxSite(site.fichiers).telecharger, budget: 3 });
  sortie.enCours = await get('/api/match-stats/fd-history');
  await H.passeHistorique({ database: db, fichiers: liste, telecharger: fauxSite(site.fichiers, { statuts: { 'mmz4281/2627/EC': 500 } }).telecharger, budget: 50 });
  sortie.avecEchec = await get('/api/match-stats/fd-history');
  await H.passeHistorique({ database: db, fichiers: liste, telecharger: fauxSite(site.fichiers).telecharger, budget: 50 });
  closeDb();
  const e1 = empreinte();
  sortie.complet = await get('/api/match-stats/fd-history');
  closeDb();
  sortie.baseInchangee = empreinte() === e1;
  sortie.runtimeInchange = JSON.stringify(etatRuntime()) === JSON.stringify(runtimeAvant);
  sortie.match = await get('/api/match-stats/fd-history-bidon');
} else {
  throw new Error(`phase inconnue : ${phase}`);
}

process.stdout.write(`${JSON.stringify(sortie)}\n`);
