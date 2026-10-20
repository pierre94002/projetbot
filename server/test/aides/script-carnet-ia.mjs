/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-carnet-ia.mjs <serveur de la copie> <phase>
 *
 * Étape 21 — LE CARNET DE NOTES DE L'IA. Base = la copie de la base d'essai (rencontres jusqu'au 21/09/2026,
 * ~440 en septembre avec leurs statistiques), heure figée au 05/10/2026 12 h UTC. Aucun appel à Claude :
 * les analyses de l'IA sont FABRIQUÉES dans le data/runtime de la copie, ses avis choisis d'avance.
 *
 * Phases :
 *   tout    PLANTÉS : seize analyses-pièges sur des rencontres de septembre (identifiants par la composition,
 *           par le gel, par l'annuaire ; noms trompeurs « Leeds United » face à DC United ; deux sources
 *           contradictoires ; match attribué ; prolongé avec un but à la 105e ; corners 0-0 ; analyse après le
 *           coup d'envoi ; match à venir ; deux analyses du même match ; pronostics d'avant la règle du 30/09 ;
 *           analyse sans pronostics ; sans date ; trois matchs avec des cotes gratuites archivées) et 230
 *           analyses « de volume » (corners toujours confirmés, tirs à l'avis toujours juste, tirs cadrés à
 *           l'avis toujours faux). Les valeurs ATTENDUES sont recalculées ici par un SECOND chemin (SQL et règles
 *           écrites à la main, sans calibration.js, settlementRules.js ni closingValue.js) ; le test compare.
 *           Puis l'étape de la nuit (le fichier écrit), la route, les marchés coupés que lit l'analyse.
 *   fiches  les messages envoyés à l'IA — avant-match et revue, ancienne et compacte — sans carnet, puis (code
 *           de l'étape 21) avec un carnet qui coupe deux types de marché. Le code d'AVANT l'étape a produit la
 *           référence test/fixtures/fiche-ia-etape-21.json (ne pas la regénérer avec le code d'après).
 *   ecran   les réponses de la route pour l'écran : pas encore calculé, calculé (avec des marchés coupés),
 *           d'une autre forme, illisible.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';
import { installerFauxFetch, listeDuJour } from './fotmobSimule.mjs';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const ecrireRuntime = (nom, contenu) => fs.writeFileSync(path.join(RUNTIME, nom), typeof contenu === 'string' ? contenu : JSON.stringify(contenu, null, 1));
const sortie = { phase };

const { openDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const db = openDb();
const ecritures = () => db.prepare('SELECT total_changes() AS n').get().n;

const plusMinutes = (iso, n) => new Date(Date.parse(iso) + n * 60_000).toISOString();

/** Une requête à l'appli, sans port ni réseau (le routeur d'Express appelé directement). */
function requete(app, methode, url) {
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
      let rendu = null;
      try {
        rendu = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
      } catch {
        // laissé à null
      }
      resolve({ code: res.statusCode, corps: rendu });
      return res;
    };
    app.handle(req, res, reject);
  });
}

// ============================================================ les pronostics et les avis

const PRONOSTICS = (m, { minOdds = 1.2 } = {}) => [
  { marketId: 'result', params: { outcome: 'home' }, market: 'Résultat', predictedOutcome: 'home', predictedLabel: `${m.homeName} gagne`, predictedOdds: 2.0, probability: 50, minOdds },
  { marketId: 'totalGoals', params: { line: 2.5, side: 'over' }, market: 'Total buts', predictedOutcome: 'over', predictedLabel: 'Plus de 2.5 buts', predictedOdds: 1.8, probability: 56, minOdds },
  { marketId: 'bothTeamsScore', params: { outcome: 'yes' }, market: 'Les 2 équipes marquent', predictedOutcome: 'yes', predictedLabel: 'Oui', predictedOdds: 1.7, probability: 59, minOdds },
  { marketId: 'teamCorners', params: { team: 'home', line: 3.5, side: 'over' }, market: `Corners — ${m.homeName}`, predictedOutcome: 'over', predictedLabel: `${m.homeName} — Plus de 3.5 corners`, predictedOdds: 1.4, probability: 71, minOdds }
];
/** Les avis d'une analyse-piège : confirme (forte), contredit (moyenne), nuance (faible), confirme (moyenne) — décalés d'un cran par analyse. */
const VERDICTS = ['confirme', 'contredit', 'nuance', 'confirme'];
const CONFIANCES = ['forte', 'moyenne', 'faible', 'moyenne'];
const avisDe = (preds, decalage) =>
  preds.map((p, i) => ({ market: p.market, pick: p.predictedLabel, verdict: VERDICTS[(i + decalage) % 4], confidence: CONFIANCES[(i + decalage) % 4], explanation: 'essai', reasoning: 'essai', probability: p.probability }));

const VOLUME = [
  { marketId: 'totalCorners', params: { line: 8.5, side: 'over' }, market: 'Total corners', predictedOutcome: 'over', predictedLabel: 'Plus de 8.5 corners', predictedOdds: 1.6, probability: 63, minOdds: 1.2, stat: 'corners' },
  { marketId: 'totalShots', params: { line: 22.5, side: 'over' }, market: 'Total tirs', predictedOutcome: 'over', predictedLabel: 'Plus de 22.5 tirs', predictedOdds: 1.6, probability: 63, minOdds: 1.2, stat: 'shots' },
  { marketId: 'totalShotsOnTarget', params: { line: 7.5, side: 'over' }, market: 'Total tirs cadrés', predictedOutcome: 'over', predictedLabel: 'Plus de 7.5 tirs cadrés', predictedOdds: 1.6, probability: 63, minOdds: 1.2, stat: 'cadres' }
];

function analyse({ matchId, m, commenceTime, analysedAt, preds, views, lineup = null, fiche = 'compacte', homeName = m.homeName, awayName = m.awayName, league = m.league, extra = {} }) {
  return {
    matchId,
    homeName,
    awayName,
    league,
    ...(commenceTime === undefined ? {} : { commenceTime }),
    model: 'claude-code:sonnet',
    engineSnapshot: preds ? { label: `${homeName} vs ${awayName}`, marketPredictions: preds } : undefined,
    usage: null,
    analysedAt,
    timing: 'avance',
    fiche,
    lineupSnapshot: lineup,
    analysis: { summary: 'essai', keyFactors: [{ factor: 'forme récente', observation: 'essai', evidence: 'essai' }], alignmentWithModel: 'essai', marketViews: views },
    createdAt: analysedAt,
    // La revue d'après-match repousse updatedAt après le match : jamais l'heure de l'analyse.
    updatedAt: plusMinutes(commenceTime ?? analysedAt, 24 * 60),
    ...extra
  };
}

// ============================================================ le second chemin

/** L'issue d'un pronostic, écrite à la main : null = non réglable. */
function realiseALaMain(p, f) {
  if (f.attribue) return { raison: 'attribue' };
  const h = f.h90;
  const a = f.a90;
  switch (p.marketId) {
    case 'result': {
      const issue = h > a ? 'home' : h === a ? 'draw' : 'away';
      return { realise: issue === p.predictedOutcome };
    }
    case 'totalGoals':
      return { realise: (h + a > p.params.line ? 'over' : 'under') === p.predictedOutcome };
    case 'bothTeamsScore':
      return { realise: (h > 0 && a > 0 ? 'yes' : 'no') === p.predictedOutcome };
    default: {
      if (f.prolonge) return { raison: 'prolongationStats' };
      const stat = { teamCorners: 'corners', totalCorners: 'corners', totalShots: 'shots', totalShotsOnTarget: 'cadres' }[p.marketId];
      const dom = f.stats.home?.[stat];
      const ext = f.stats.away?.[stat];
      if (dom === null || dom === undefined || ext === null || ext === undefined || (dom === 0 && ext === 0)) return { raison: 'statNonRelevee' };
      const valeur = p.params.team === 'home' ? dom : p.params.team === 'away' ? ext : dom + ext;
      return { realise: (valeur > p.params.line ? 'over' : 'under') === p.predictedOutcome };
    }
  }
}
const tenuALaMain = (verdict, realise) => (verdict === 'confirme' ? realise : verdict === 'contredit' ? !realise : null);

// ============================================================ la plantation

const statsDe = db.prepare('SELECT side, corner_kicks AS corners, total_shots AS shots, shots_on_goal AS cadres FROM team_stats WHERE match_key = ?');
function faits(m) {
  const lignes = statsDe.all(m.matchKey).map((r) => ({ ...r }));
  return { home: lignes.find((r) => r.side === 'home') ?? null, away: lignes.find((r) => r.side === 'away') ?? null };
}

function septembre() {
  return db
    .prepare(
      `SELECT match_key AS matchKey, date, league, home_name AS homeName, away_name AS awayName, home_id AS homeId, away_id AS awayId, home_goals AS hg, away_goals AS ag,
              json_extract(meta, '$.kickoff') AS kickoff, json_extract(meta, '$.reason') AS reason
       FROM matches WHERE date >= '2026-09-01' AND date <= '2026-09-30' AND home_id IS NOT NULL AND away_id IS NOT NULL AND home_goals IS NOT NULL ORDER BY date, match_key`
    )
    .all()
    .map((r) => ({ ...r }));
}

/** Les rencontres « ordinaires » : coup d'envoi connu, pas de prolongation, corners, tirs et tirs cadrés relevés des deux côtés, affiche unique sur ±1 jour, pas DC United. */
function ordinaires(liste) {
  const paires = new Map();
  for (const m of liste) paires.set(`${m.homeId}|${m.awayId}`, (paires.get(`${m.homeId}|${m.awayId}`) ?? 0) + 1);
  return liste.filter((m) => {
    if (m.reason || !m.kickoff || paires.get(`${m.homeId}|${m.awayId}`) > 1) return false;
    if (m.homeName === 'DC United' || m.awayName === 'DC United') return false;
    const s = faits(m);
    return ['corners', 'shots', 'cadres'].every((k) => s.home?.[k] !== null && s.home?.[k] !== undefined && s.away?.[k] !== null && s.away?.[k] !== undefined && !(s.home[k] === 0 && s.away[k] === 0));
  });
}

function planter() {
  const tous = septembre();
  const ord = ordinaires(tous);
  if (ord.length < 260) throw new Error(`trop peu de rencontres ordinaires (${ord.length})`);
  const P = {};
  const analyses = [];
  const attendus = [];
  const insererGel = db.prepare(
    `INSERT INTO engine_picks (fixture_key, market_key, version, recorded_at, origin, match_id, league, date, kickoff, home_name, away_name, home_id, away_id, market_id, market, params, choice, label, probability, predicted_odds)
     VALUES (?, ?, 1, ?, 'analyse-avance', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const gel = (matchId, m, homeId = m.homeId, awayId = m.awayId) =>
    insererGel.run(`fotmob:${homeId}|${awayId}|${m.date}`, 'result', plusMinutes(m.kickoff, -600), matchId, m.league, m.date, m.kickoff, m.homeName, m.awayName, homeId, awayId, 'result', 'Résultat', '{"outcome":"home"}', 'home', `${m.homeName} gagne`, 0.5, 2.0);

  db.exec('BEGIN');
  try {
    // --- les pièges, chacun sur sa rencontre
    const T = (i) => ord[i];
    const a = (m) => plusMinutes(m.kickoff, -180);
    const pieges = {
      composition: T(0),
      gel: T(1),
      annuaire: T(2),
      contradiction: T(3),
      attribue: T(5),
      corners00: T(7),
      apres: T(8),
      doublon: T(9),
      avantLaRegle: T(10),
      sansPronostics: T(11),
      cote1: T(12),
      cote2: T(13),
      cote3: T(14),
      sansDate: T(15),
      prolonge: T(16)
    };
    const autre = T(4);
    // Les pièges du magasin.
    db.prepare("UPDATE matches SET meta = json_set(meta, '$.awarded', 1) WHERE match_key = ?").run(pieges.attribue.matchKey);
    db.prepare('UPDATE team_stats SET corner_kicks = 0 WHERE match_key = ?').run(pieges.corners00.matchKey);
    const deroule = [
      { type: 'goal', minute: 30, side: 'home', player: 'Essai A' },
      { type: 'goal', minute: 60, side: 'away', player: 'Essai B' },
      { type: 'goal', minute: 105, side: 'home', player: 'Essai C' }
    ];
    db.prepare("UPDATE matches SET home_goals = 2, away_goals = 1, events = ?, meta = json_set(meta, '$.reason', 'afterextra') WHERE match_key = ?").run(JSON.stringify(deroule), pieges.prolonge.matchKey);

    const ajouter = (cle, e, { m = null, prolonge = false, attribue = false } = {}) => {
      analyses.push(e);
      P[cle] = { matchId: e.matchId, matchKey: m?.matchKey ?? null };
      if (!m) return;
      const s = faits(m);
      const f = { h90: prolonge ? 1 : m.hg, a90: prolonge ? 1 : m.ag, stats: s, prolonge, attribue };
      e.engineSnapshot?.marketPredictions?.forEach((p, i) => {
        // L'avis de CE marché, par son libellé (une analyse peut rendre ses avis dans un autre ordre).
        const v = e.analysis.marketViews.find((x) => x.market === p.market) ?? null;
        attendus.push({ piege: cle, matchKey: m.matchKey, marketId: p.marketId, verdict: v?.verdict ?? null, confiance: v?.confidence ?? null, predictedOdds: p.predictedOdds, ...realiseALaMain(p, f) });
      });
    };
    const lineupDe = (m, homeId = m.homeId, awayId = m.awayId) => ({ source: 'FotMob', fotmobMatchId: '1', home: { team: m.homeName, teamId: homeId }, away: { team: m.awayName, teamId: awayId } });

    // 1. Identifiants de la composition (page FotMob du match). L'IA n'y a rien dit des deux équipes qui marquent :
    //    un marché sans avis n'est jamais compté comme un avis.
    {
      const m = pieges.composition;
      const preds = PRONOSTICS(m);
      ajouter('composition', analyse({ matchId: 'essai-composition', m, commenceTime: m.kickoff, analysedAt: a(m), preds, views: avisDe(preds, 0).filter((v) => v.market !== 'Les 2 équipes marquent'), lineup: lineupDe(m) }), { m });
    }
    // 2. Identifiants du gel (engine_picks.match_id), sous des noms que l'annuaire ne connaît pas.
    {
      const m = pieges.gel;
      const preds = PRONOSTICS({ ...m, homeName: 'Club renommé A' });
      gel('essai-gel', m);
      ajouter('gel', analyse({ matchId: 'essai-gel', m, commenceTime: m.kickoff, analysedAt: a(m), preds, views: avisDe(preds, 1), homeName: 'Club renommé A', awayName: 'Club renommé B' }), { m });
    }
    // 3. Identifiants de l'annuaire (les noms du magasin), sans composition ni gel ; ancienne fiche.
    {
      const m = pieges.annuaire;
      const preds = PRONOSTICS(m);
      // Ses avis rendus dans l'ordre inverse : chacun retrouve SON marché par le libellé, jamais par la position.
      ajouter('annuaire', analyse({ matchId: 'essai-annuaire', m, commenceTime: m.kickoff, analysedAt: a(m), preds, views: avisDe(preds, 2).reverse(), fiche: undefined }), { m });
    }
    // 4. La composition et le gel donnent deux clubs différents : écartée.
    {
      const m = pieges.contradiction;
      const preds = PRONOSTICS(m);
      gel('essai-contradiction', m, autre.homeId, autre.awayId);
      ajouter('contradiction', analyse({ matchId: 'essai-contradiction', m, commenceTime: m.kickoff, analysedAt: a(m), preds, views: avisDe(preds, 0), lineup: lineupDe(m) }));
    }
    // 5. Noms trompeurs : « Leeds United » face à l'adversaire de DC United, le jour de DC United (le rapprocheur souple les confond).
    {
      const dc = tous.find((m) => (m.homeName === 'DC United' || m.awayName === 'DC United') && m.kickoff);
      if (!dc) throw new Error('aucun match de DC United dans la base d’essai');
      const domicile = dc.homeName === 'DC United';
      const noms = domicile ? { homeName: 'Leeds United', awayName: dc.awayName } : { homeName: dc.homeName, awayName: 'Leeds United' };
      P.dcUnited = { matchKey: dc.matchKey, domicile };
      const preds = PRONOSTICS({ ...dc, ...noms });
      ajouter('leeds', analyse({ matchId: 'essai-leeds', m: dc, commenceTime: dc.kickoff, analysedAt: a(dc), preds, views: avisDe(preds, 0), ...noms }));
    }
    // 6. Match attribué : rien à régler.
    {
      const m = pieges.attribue;
      const preds = PRONOSTICS(m);
      ajouter('attribue', analyse({ matchId: 'essai-attribue', m, commenceTime: m.kickoff, analysedAt: a(m), preds, views: avisDe(preds, 0), lineup: lineupDe(m) }), { m, attribue: true });
    }
    // 7. Corners 0-0 : les corners non relevés, le reste réglé.
    {
      const m = pieges.corners00;
      const preds = PRONOSTICS(m);
      ajouter('corners00', analyse({ matchId: 'essai-corners00', m, commenceTime: m.kickoff, analysedAt: a(m), preds, views: avisDe(preds, 3), lineup: lineupDe(m) }), { m: { ...m } });
    }
    // 8. Analyse faite APRÈS le coup d'envoi.
    {
      const m = pieges.apres;
      const preds = PRONOSTICS(m);
      ajouter('apres', analyse({ matchId: 'essai-apres', m, commenceTime: m.kickoff, analysedAt: plusMinutes(m.kickoff, 5), preds, views: avisDe(preds, 0), lineup: lineupDe(m) }));
    }
    // 9. Match à venir (12/10/2026).
    {
      const m = { ...T(6), kickoff: '2026-10-12T18:00:00.000Z' };
      const preds = PRONOSTICS(m);
      ajouter('aVenir', analyse({ matchId: 'essai-avenir', m, commenceTime: m.kickoff, analysedAt: '2026-10-04T10:00:00.000Z', preds, views: avisDe(preds, 0), lineup: lineupDe(m) }));
    }
    // 10. Deux analyses du même match (un identifiant de calendrier la veille, puis celui des cotes) : la plus récente compte.
    {
      const m = pieges.doublon;
      const preds = PRONOSTICS(m);
      ajouter('doublonAncienne', analyse({ matchId: 'cal-essai-doublon', m, commenceTime: new Date(Date.parse(`${m.date}T12:00:00.000Z`) - 86_400_000).toISOString(), analysedAt: plusMinutes(m.kickoff, -2000), preds, views: avisDe(preds, 1), lineup: lineupDe(m) }));
      ajouter('doublon', analyse({ matchId: 'essai-doublon', m, commenceTime: m.kickoff, analysedAt: a(m), preds, views: avisDe(preds, 2), lineup: lineupDe(m) }), { m });
    }
    // 11. Pronostics d'avant la règle du 30/09 (sans minOdds).
    {
      const m = pieges.avantLaRegle;
      const preds = PRONOSTICS(m, { minOdds: null });
      ajouter('avantLaRegle', analyse({ matchId: 'essai-avant-regle', m, commenceTime: m.kickoff, analysedAt: a(m), preds, views: avisDe(preds, 0), lineup: lineupDe(m) }));
    }
    // 12. Analyse sans les pronostics du moteur gardés avec elle.
    {
      const m = pieges.sansPronostics;
      const preds = PRONOSTICS(m);
      ajouter('sansPronostics', analyse({ matchId: 'essai-sans-pronostics', m, commenceTime: m.kickoff, analysedAt: a(m), preds: null, views: avisDe(preds, 0), lineup: lineupDe(m) }));
    }
    // 13. Sans date du match.
    {
      const m = pieges.sansDate;
      const preds = PRONOSTICS(m);
      ajouter('sansDate', analyse({ matchId: 'essai-sans-date', m, commenceTime: undefined, analysedAt: a(m), preds, views: avisDe(preds, 0), lineup: lineupDe(m) }));
    }
    // 14. Prolongé, but à la 105e : réglé sur le 1-1 de la 90e ; ses corners non réglables.
    {
      const m = pieges.prolonge;
      const preds = PRONOSTICS(m);
      ajouter('prolonge', analyse({ matchId: 'essai-prolonge', m, commenceTime: m.kickoff, analysedAt: a(m), preds, views: avisDe(preds, 0), lineup: lineupDe(m) }), { m, prolonge: true });
    }
    // 15. Trois matchs avec des cotes gratuites archivées (ESPN) : ouverture, un relevé avant l'analyse, la clôture.
    sortie.cotes = [];
    for (const [k, cle] of ['cote1', 'cote2', 'cote3'].entries()) {
      const m = pieges[cle];
      const preds = PRONOSTICS(m);
      const analyseA = a(m);
      ajouter(cle, analyse({ matchId: `essai-${cle}`, m, commenceTime: m.kickoff, analysedAt: analyseA, preds, views: avisDe(preds, k), lineup: lineupDe(m) }), { m });
      const id = Number(
        db
          .prepare(`INSERT INTO odds_events (source, source_event, league, date, kickoff, home_name, away_name, home_id, away_id, match_key, provenance, updated_at) VALUES ('espn', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'essai', ?)`)
          .run(`essai-${cle}`, m.league, m.date, m.kickoff, m.homeName, m.awayName, m.homeId, m.awayId, m.matchKey, m.kickoff).lastInsertRowid
      );
      const prix = {
        '1x2': { open: { home: 2.3, draw: 3.3, away: 3.1 }, snapshot: { home: 2.2 - k / 10, draw: 3.3, away: 3.3 }, close: { home: 1.9 + k / 5, draw: 3.4, away: 3.7 } },
        ou: { open: { over: 1.9, under: 1.9 }, snapshot: { over: 1.85, under: 1.95 }, close: { over: 2.05 - k / 10, under: 1.78 + k / 20 } },
        btts: { open: { yes: 1.8, no: 2.0 }, snapshot: { yes: 1.75, no: 2.05 }, close: { yes: 1.7 + k / 10, no: 2.12 - k / 20 } }
      };
      const quand = { open: plusMinutes(m.kickoff, -2 * 24 * 60), snapshot: plusMinutes(analyseA, -60), close: plusMinutes(m.kickoff, -5) };
      const q = db.prepare(`INSERT INTO odds_quotes (event_id, bookmaker, market, selection, line, kind, seq, releve_at, price) VALUES (?, 'DraftKings', ?, ?, ?, ?, ?, ?, ?)`);
      for (const [market, phases] of Object.entries(prix)) {
        const line = market === 'ou' ? 2.5 : 0;
        for (const [kind, sel] of Object.entries(phases)) for (const [selection, price] of Object.entries(sel)) q.run(id, market, selection, line, kind, kind === 'snapshot' ? quand.snapshot : '', quand[kind], price);
      }
      sortie.cotes.push({ piege: cle, matchKey: m.matchKey, prix, verdicts: avisDe(preds, k).slice(0, 3).map((v) => v.verdict) });
    }

    // --- le volume : 230 rencontres, trois marchés chacune
    const volume = ord.slice(20, 250);
    for (const [i, m] of volume.entries()) {
      const s = faits(m);
      const f = { h90: m.hg, a90: m.ag, stats: s, prolonge: false, attribue: false };
      const preds = VOLUME.map(({ stat, ...p }) => p);
      const views = preds.map((p) => {
        const r = realiseALaMain(p, f).realise;
        const verdict = p.marketId === 'totalCorners' ? 'confirme' : p.marketId === 'totalShots' ? (r ? 'confirme' : 'contredit') : r ? 'contredit' : 'confirme';
        return { market: p.market, pick: p.predictedLabel, verdict, confidence: p.marketId === 'totalShots' ? 'forte' : p.marketId === 'totalCorners' ? 'moyenne' : 'faible', explanation: 'essai', reasoning: 'essai', probability: p.probability };
      });
      const e = analyse({ matchId: `essai-volume-${i}`, m, commenceTime: m.kickoff, analysedAt: plusMinutes(m.kickoff, -240), preds, views, lineup: lineupDe(m), league: m.league });
      analyses.push(e);
      preds.forEach((p, k) => attendus.push({ piege: 'volume', matchKey: m.matchKey, marketId: p.marketId, verdict: views[k].verdict, confiance: views[k].confidence, predictedOdds: p.predictedOdds, ...realiseALaMain(p, f) }));
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  ecrireRuntime('match-ai-analyses.json', analyses);
  return { P, attendus };
}

// ============================================================ les phases

if (phase === 'tout') {
  const { P, attendus } = planter();
  sortie.plantes = P;
  sortie.attendus = attendus.map((x) => ({ ...x, tenu: x.realise === undefined ? null : tenuALaMain(x.verdict, x.realise) }));
  const S = await imp('data/aiScorecard.js');
  sortie.coupureActive = S.COUPURE_ACTIVE;
  const { teamNamesLikelyMatch } = await imp('utils/teamNameMatch.js');
  sortie.pieges = { leedsRessembleADcUnited: teamNamesLikelyMatch('Leeds United', 'DC United') };
  const avant = ecritures();
  const { carnet, cas } = S.calculerLeCarnet({ database: db });
  sortie.ecrituresDuCalcul = ecritures() - avant;
  sortie.carnet = carnet;
  sortie.cas = cas.filter((k) => !k.cle.includes('|totalShots') && !k.cle.includes('|totalCorners') && !k.cle.includes('|totalShotsOnTarget'));
  sortie.casVolume = cas.length - sortie.cas.length;
  sortie.casCles = cas.map((k) => k.cle);
  // Le même calcul une seconde fois : au bit près (le juge a sa graine).
  sortie.rejeuIdentique = JSON.stringify({ ...S.calculerLeCarnet({ database: db }).carnet, calculeLe: null }) === JSON.stringify({ ...carnet, calculeLe: null });
  // L'étape de la nuit : le fichier écrit par atomicJson, la base seulement lue.
  const coupesAvant = [...S.lireLesMarchesCoupes()];
  const job = await imp('jobs/matchStatsAutoRefresh.js');
  const avantEtape = ecritures();
  sortie.etape = await job.__testing.passeCarnetIA({ manuel: false, derniere: () => null });
  sortie.ecrituresEtape = ecritures() - avantEtape;
  sortie.fichier = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'carnet-ia.json'), 'utf8'));
  sortie.coupesAvant = coupesAvant;
  sortie.coupesApres = [...S.lireLesMarchesCoupes()];
  sortie.etapes = job.REFRESH_STEPS.map((e) => e.key);
  // Une seconde passe : rien de nouveau, rien de nouvellement coupé.
  sortie.etape2 = await job.__testing.passeCarnetIA({ manuel: false, derniere: () => null });
  // La route : la même chose que le fichier.
  const { createApp } = await imp('app.js');
  const app = createApp();
  sortie.route = await requete(app, 'GET', '/api/match-ai/scorecard');
}

if (phase === 'fiches') {
  // Le code d'avant l'étape n'a pas de carnet : la phase marche avec les deux.
  const S = await imp('data/aiScorecard.js').catch(() => null);
  installerFauxFetch({ listes: Object.fromEntries(['20261006', '20261007', '20261008', '20260905', '20260906', '20260907'].map((j) => [j, listeDuJour([])])) });
  const service = await imp('core/ai/matchAiAnalysisService.js');
  // L'expérience de l'IA : trois revues passées (Résultat, Total corners, Corners d'une équipe).
  const revuePassee = (i, type, market, outcome, aiWasRight) => ({
    matchId: `passee-${i}`,
    homeName: `Passé ${i} A`,
    awayName: `Passé ${i} B`,
    league: 'EPL',
    commenceTime: `2026-09-0${i}T15:00:00.000Z`,
    engineSnapshot: { marketPredictions: [] },
    analysis: { marketViews: [] },
    createdAt: `2026-09-0${i}T10:00:00.000Z`,
    postMatchReview: {
      createdAt: `2026-09-0${i}T20:00:00.000Z`,
      marketReviews: [{ market, marketId: type, pick: 'essai', minOdds: 1.2, outcome, aiVerdict: 'confirme', aiConfidence: 'moyenne', aiWasRight, lesson: `Leçon ${i} sur ${market}.` }]
    }
  });
  ecrireRuntime('match-ai-analyses.json', [revuePassee(1, 'result', 'Résultat', 'juste', true), revuePassee(2, 'totalCorners', 'Total corners', 'faux', false), revuePassee(3, 'teamCorners', 'Corners — Passé 3 A', 'juste', true)]);
  const home = 'Everton';
  const away = 'Man United';
  const p = (marketId, params, market, predictedOutcome, predictedLabel, predictedOdds) => ({ marketId, params, market, predictedOutcome, predictedLabel, predictedOdds, minOdds: 1.2 });
  const engineResult = {
    label: `${home} vs ${away}`,
    commenceTime: '2026-10-07T19:00:00.000Z',
    expectedGoals: { home: 1.4, away: 1.2, source: 'fotmob' },
    trueOdds: { home: 2.4, draw: 3.4, away: 3.0 },
    market: { odds1: 2.5, oddsDraw: 3.3, odds2: 2.9 },
    edgePercent: 1.2,
    staking: { action: 'PASS', stake: null, reason: 'pas_de_value', candidates: [], limits: { edgeThresholdMin: 0.02 } },
    statExpectations: { corners: { home: 5.1, away: 4.6, total: 9.7 }, shots: { home: 13.1, away: 11.9, total: 25 }, shotsOnTarget: { home: 4.4, away: 4.1, total: 8.5 } },
    marketPredictions: [
      p('result', { outcome: 'home' }, 'Résultat', 'home', `${home} gagne`, 2.4),
      p('totalGoals', { line: 2.5, side: 'over' }, 'Total buts', 'over', 'Plus de 2.5 buts', 1.83),
      p('bothTeamsScore', { outcome: 'yes' }, 'Les 2 équipes marquent', 'yes', 'Oui', 1.66),
      p('totalCorners', { line: 8.5, side: 'over' }, 'Total corners', 'over', 'Plus de 8.5 corners', 1.52),
      p('totalCorners', { line: 3.5, side: 'over' }, 'Total corners (ligne basse)', 'over', 'Plus de 3.5 corners', 1.04),
      p('teamCorners', { team: 'home', line: 3.5, side: 'over' }, `Corners — ${home}`, 'over', `${home} — Plus de 3.5 corners`, 1.36),
      p('teamCorners', { team: 'away', line: 3.5, side: 'over' }, `Corners — ${away}`, 'over', `${away} — Plus de 3.5 corners`, 1.48),
      p('totalShots', { line: 22.5, side: 'over' }, 'Total tirs', 'over', 'Plus de 22.5 tirs', 1.4)
    ]
  };
  const avantMatch = async (fiche) => {
    const d = await service.preparerAnalyseAvantMatch({ matchId: 'essai-fiche', home, away, league: 'EPL', engineResult, fiche, sansRepliPayant: true });
    return { system: d.system, user: d.userMessage, marches: d.marches.map((m) => m.market), marchesRetires: d.marchesRetires ?? null };
  };
  // La revue : l'analyse d'avant-match d'Everton – Man United du 06/09 (joué, au magasin), ses avis par marché.
  const prior = {
    matchId: 'essai-revue',
    homeName: home,
    awayName: away,
    league: 'EPL',
    commenceTime: '2026-09-06T15:30:00.000Z',
    analysedAt: '2026-09-06T14:30:00.000Z',
    timing: 'coup-d-envoi',
    engineSnapshot: { ...service.__testing.curateEngineSummary(engineResult) },
    analysis: {
      summary: 'Lecture d’essai.',
      keyFactors: [{ factor: 'forme récente', observation: 'essai', evidence: 'essai' }],
      alignmentWithModel: 'essai',
      marketViews: engineResult.marketPredictions
        .filter((m) => m.predictedOdds >= 1.2)
        .map((m, i) => ({ market: m.market, pick: m.predictedLabel, verdict: ['confirme', 'nuance', 'contredit'][i % 3], confidence: 'moyenne', explanation: `Explication ${i}.`, reasoning: `Raisonnement ${i}.` }))
    }
  };
  // La même analyse faite AVEC un carnet qui coupait les corners : ni avis sur eux, et leur liste gardée avec elle.
  const COUPES = ['totalCorners', 'teamCorners'];
  const priorCoupe = {
    ...prior,
    marchesRetires: COUPES,
    analysis: { ...prior.analysis, marketViews: prior.analysis.marketViews.filter((v) => !/corners/i.test(v.market)) }
  };
  const resultat = { homeGoals: 2, awayGoals: 2, date: '2026-09-06', homeName: home };
  const revue = (fiche, p = prior) => {
    const d = service.preparerRevueApresMatch({ prior: p, result: resultat, fiche });
    return { system: d.system, user: d.userMessage, aJuger: d.aJuger.map((o) => o.market), issues: d.marketOutcomes.map((o) => [o.market, o.outcome, o.aiVerdict, o.aiWasRight]) };
  };
  sortie.sans = { avant: { ancienne: await avantMatch('ancienne'), compacte: await avantMatch('compacte') }, revue: { ancienne: revue('ancienne'), compacte: revue('compacte') } };
  // Le code d'avant l'étape ignore marchesRetires : sa revue de cette analyse est la référence de l'ancienne forme.
  sortie.priorCoupe = { revue: { ancienne: revue('ancienne', priorCoupe), compacte: revue('compacte', priorCoupe) } };
  if (S) {
    // Un carnet qui coupe deux types de marché (les totaux de corners et les corners d'une équipe).
    const types = Object.keys((await imp('data/repositories/matchAiAnalysisRepository.js')).TYPES_DE_MARCHE);
    // Un carnet écrit par une nuit « coupure active » : le code de la copie décide s'il en tient compte (COUPURE_ACTIVE).
    ecrireRuntime('carnet-ia.json', { version: S.VERSION_CARNET, seuil: S.SEUIL_MATCHS_POUR_COUPER, calculeLe: '2026-10-05T03:00:00.000Z', coupureActive: true, types: types.map((t) => ({ marketType: t })), coupes: COUPES });
    sortie.coupureActive = S.COUPURE_ACTIVE;
    sortie.coupesLues = [...S.lireLesMarchesCoupes()];
    sortie.avec = { avant: { ancienne: await avantMatch('ancienne'), compacte: await avantMatch('compacte') } };
    // Un carnet d'un autre seuil, puis illisible : rien n'est retiré, l'analyse ne lève pas.
    ecrireRuntime('carnet-ia.json', { version: S.VERSION_CARNET, seuil: S.SEUIL_MATCHS_POUR_COUPER + 1, coupureActive: true, types: [], coupes: ['totalCorners'] });
    sortie.autreSeuil = { coupes: [...S.lireLesMarchesCoupes()], compacte: await avantMatch('compacte') };
    ecrireRuntime('carnet-ia.json', '{ "version": 1, "coupes": ["totalCo');
    sortie.illisible = { coupes: [...S.lireLesMarchesCoupes()], compacte: await avantMatch('compacte') };
    // L'analyse ENREGISTRÉE (Claude simulé, aucun appel réel) : les types retirés gardés avec elle, puis effacés
    // quand une nouvelle analyse du même match n'en retire plus.
    const { installerClaudeSimule } = await import('./claudeSimule.mjs');
    const simule = await installerClaudeSimule(serveur, { tokens: () => 12_000 });
    const { getByMatchId } = await imp('data/repositories/matchAiAnalysisRepository.js');
    ecrireRuntime('carnet-ia.json', { version: S.VERSION_CARNET, seuil: S.SEUIL_MATCHS_POUR_COUPER, coupureActive: true, types: [], coupes: COUPES });
    await service.runPreMatchAnalysis({ matchId: 'essai-enregistree', home, away, league: 'EPL', engineResult, sansRepliPayant: true, appel: { type: 'manuel' } });
    const lu = () => JSON.parse(fs.readFileSync(path.join(RUNTIME, 'match-ai-analyses.json'), 'utf8')).find((e) => e.matchId === 'essai-enregistree');
    sortie.enregistree = { avecCoupe: getByMatchId('essai-enregistree')?.marchesRetires ?? null, fichierAvecCoupe: lu()?.marchesRetires ?? null };
    ecrireRuntime('carnet-ia.json', { version: S.VERSION_CARNET, seuil: S.SEUIL_MATCHS_POUR_COUPER, coupureActive: true, types: [], coupes: [] });
    await service.runPreMatchAnalysis({ matchId: 'essai-enregistree', home, away, league: 'EPL', engineResult, sansRepliPayant: true, appel: { type: 'manuel' } });
    sortie.enregistree.apres = 'marchesRetires' in (lu() ?? {}) ? lu().marchesRetires : 'absent';
    sortie.enregistree.appels = simule.appels.length;
    simule.arreter();
  }
}

if (phase === 'ecran') {
  const S = await imp('data/aiScorecard.js');
  const { createApp } = await imp('app.js');
  const app = createApp();
  const lire = async () => (await requete(app, 'GET', '/api/match-ai/scorecard')).corps;
  sortie.reponses = { absent: await lire() };
  planter();
  await S.calculerEtEcrireLeCarnet({ database: db });
  sortie.reponses.calcule = await lire();
  const brut = JSON.parse(fs.readFileSync(S.FICHIER_CARNET, 'utf8'));
  ecrireRuntime('carnet-ia.json', { ...brut, seuil: S.SEUIL_MATCHS_POUR_COUPER + 50 });
  sortie.reponses.autreSeuil = await lire();
  ecrireRuntime('carnet-ia.json', '{ "version": 1, "typ');
  const illisible = await requete(app, 'GET', '/api/match-ai/scorecard');
  sortie.reponses.illisible = illisible.corps;
  sortie.reponses.codeIllisible = illisible.code;
}

process.stdout.write(`${JSON.stringify(sortie)}\n`);
process.exit(0);
