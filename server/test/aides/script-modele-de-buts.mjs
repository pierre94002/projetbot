/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-modele-de-buts.mjs <serveur de la copie> <manifeste de l'échantillon> coherence
 *   node --import garde.mjs script-modele-de-buts.mjs <serveur de la copie> <manifeste de l'échantillon> ecran
 *
 * Étape 27 — LE MODÈLE DE BUTS UNIQUE (core/engine/goalModel.js) sur la base d'essai. La table du jour J
 * construite ici ; des cotes plus/moins 2,5 PLANTÉES sur des matchs cibles à cotes (la moyenne football-data en
 * pré-clôture ; des livres ESPN en ouverture et en clôture, plus un relevé en direct absurde ; Smarkets seul) ; les
 * forces de buts calculées par l'étape de nuit (forcesDeButs, sur place) ; puis chaque match cible de
 * pronostics-figes analysé par le chemin de l'appli (enrichMatchWithRealAverages + analyzeMatch) avec la version
 * en service (sans la clé) ET avec la candidate (la clé `modeleDeButs`).
 *
 * À côté, le script RECALCULE à pleine précision : goalModel.modeleDeButs sur les mêmes entrées et la même
 * référence 1N2 (refaite comme oddsEngine.js), une grille Poisson × Dixon-Coles écrite à part
 * (modeleDeButsCommun.mjs), le mélange refait à la main, l'état de chaque club refait par le second chemin et par
 * l'accumulateur. Il rend, pour chaque contrôle C1 à C12 de la conception (§5.2), le nombre de cas, l'écart le
 * plus grand et les premiers cas fautifs : le TEST (modeleDeButs.test.mjs) les juge. Sortie : une ligne JSON.
 *
 * Phase « ecran » (étape 3 de l'étape 27, les écrans) : la même préparation et les mêmes analyses, mais la sortie
 * est faite des PAIRES d'analyses réelles d'un même match — version en service (sans la clé) et candidate (avec) —,
 * deux par régime du modèle de buts : ce que la page du match, le Repérage et la carte du score lisent
 * (modeleDeButsEcran.test.mjs). Les contrôles C1-C12 tournent quand même (ils ne sont pas rendus).
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REGLAGES_MODELE_DE_BUTS, avecLeModele, reglagesDuModele, poisson, tau, grille, masse } from './modeleDeButsCommun.mjs';

const [serveur, fichierManifeste, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
const chemin = path.resolve(resolveDbPath());
if (chemin.toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error(`Base inattendue : ${chemin}`);
const db = openDb();

const T = await imp('data/db/dayTable.js');
const G = await imp('core/engine/goalModel.js');
const F = await imp('data/db/forcesButs.js');
const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
const { getEngineConfig } = await imp('core/engine/engineConfig.js');
const { getTiltState } = await imp('core/engine/tiltState.js');
const { getSport } = await imp('sports/index.js');
const { adaptSeasonCalendarMatch } = await imp('data/adapters/seasonCalendarAdapter.js');
const { adaptSampleMatch } = await imp('data/adapters/sampleMatchAdapter.js');
const { fairFromBookmakers, fairFromAllValid } = await imp('core/engine/valueFinder.js');
const { removeMargin } = await imp('core/market/marginRemoval.js');
const { seasonOf } = await imp('data/providers/seasonWindows.js');

if (phase !== 'coherence' && phase !== 'ecran') throw new Error(`Phase inconnue : ${phase}`);
/** Phase « ecran » : deux paires d'analyses (en service, candidate) par régime du modèle de buts. */
const paires = [];
const parRegime = {};
const MAINTENANT = new Date().toISOString(); // l'heure figée de la garde (CM_TEST_MAINTENANT)
const MAINTENANT_MS = Date.parse(MAINTENANT);
const sortie = { ok: true, phase, maintenant: MAINTENANT };
const sport = getSport('football');
const manifeste = JSON.parse(fs.readFileSync(fichierManifeste, 'utf8'));

// ------------------------------------------------------------ le relevé des contrôles

const C = {};
/** Un cas d'un contrôle : son écart (nombre ; non fini = faute), sa tolérance ; les cinq premiers fautifs gardés. */
function noter(nom, cle, ecart, tolerance, detail = {}) {
  const c = (C[nom] ??= { n: 0, max: 0, fautes: 0, tolerance, exemples: [] });
  c.n++;
  const e = typeof ecart === 'number' && !Number.isNaN(ecart) ? Math.abs(ecart) : Infinity;
  if (e > c.max) c.max = e;
  if (!(e <= tolerance)) {
    c.fautes++;
    if (c.exemples.length < 5) c.exemples.push({ cle, ecart: Number.isFinite(e) ? e : 'infini', ...detail });
  }
}
const vrai = (nom, cle, condition, detail = {}) => noter(nom, cle, condition ? 0 : Infinity, 0, detail);
const relatif = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
const p6 = (x) => (Number.isFinite(x) ? Number(x.toFixed(6)) : null);
const r = (x, d) => Number(x.toFixed(d));
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------ la préparation

const cleDeCote = (source, basis) =>
  /^pinnacle/i.test(basis) ? 'pinnacle' : `${source}-${basis}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_');

/** Le match cible tel que l'appli le présente au moteur (même chemin que script-pronostics.mjs). */
function matchAdapte(r0) {
  const base = adaptSeasonCalendarMatch({ homeName: r0.home_name, awayName: r0.away_name, date: r0.date, league: r0.league, round: r0.round ?? null }, 10000);
  const coteComplete = [r0.o1, r0.ox, r0.o2].every((x) => Number.isFinite(x) && x > 1);
  if (!coteComplete) return base;
  return {
    ...base,
    hasOdds: true,
    oddsSource: 'gratuit',
    marketOdds: {
      odds1: r0.o1,
      oddsDraw: r0.ox,
      odds2: r0.o2,
      bookmakersCount: 1,
      byBookmaker: [{ key: cleDeCote(r0.osource, r0.basis), title: `${r0.basis} · ${r0.osource}`, odds1: r0.o1, oddsDraw: r0.ox, odds2: r0.o2, referenceOnly: true, source: r0.osource }],
      source: 'gratuit'
    }
  };
}

/** La référence 1N2 du moteur, refaite comme oddsEngine.js : les livres de référence, sinon le repli ; null sans cote. */
function referenceDuMoteur(match, config) {
  const mo = match.marketOdds;
  const dispo = Number.isFinite(mo?.odds1) && Number.isFinite(mo?.oddsDraw) && Number.isFinite(mo?.odds2);
  if (!dispo) return null;
  const net = removeMargin([mo.odds1, mo.oddsDraw, mo.odds2]);
  const reference = fairFromBookmakers(mo.byBookmaker ?? [], config);
  if (reference) return reference.probabilities;
  const repli = (mo.byBookmaker?.length ? fairFromAllValid(mo.byBookmaker)?.probabilities : !net.anomaly ? net.probabilities : null) ?? null;
  return repli;
}

const lireCible = db.prepare(`SELECT m.match_key, m.date, m.league, m.home_name, m.away_name, m.home_id, m.away_id, json_extract(m.meta, '$.round') AS round,
                                     o.source AS osource, o.basis, o.home AS o1, o.draw AS ox, o.away AS o2
                              FROM matches m LEFT JOIN match_odds o ON o.match_key = m.match_key WHERE m.match_key = ?`);
const cibles = manifeste.cibles.map((c) => {
  const r0 = lireCible.get(c.cle);
  if (!r0) throw new Error(`Cible absente de la base d'essai : ${c.cle}`);
  return { cle: c.cle, ligne: r0, avecCotes: [r0.o1, r0.ox, r0.o2].every((x) => Number.isFinite(x) && x > 1) };
});

// 1. La table du jour J de la copie (sans contrôle à part).
await T.construireTableJourJ({ database: db, rendreLaMain: null, controle: { lignes: 0 } });

// 2. Les plus/moins 2,5 plantés, une rencontre-source par match : un tiers football-data (pré-clôture), un tiers ESPN
// (ouverture, clôture 5 min avant le coup d'envoi, un relevé en direct absurde), un tiers Smarkets seul (jamais admis).
const insererEvenement = db.prepare(`INSERT INTO odds_events (source, source_event, league, date, kickoff, home_name, away_name, home_id, away_id, match_key, provenance, updated_at)
                                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'essai étape 27', ?)`);
const insererCote = db.prepare(`INSERT INTO odds_quotes (event_id, bookmaker, market, selection, line, kind, seq, releve_at, price)
                                VALUES (?, ?, 'ou', ?, 2.5, ?, '', ?, ?)`);
const plantes = { fd: [], espn: [], smarkets: [] };
const decaler = (jour, minutes) => new Date(Date.parse(`${jour}T12:00:00.000Z`) + minutes * 60_000).toISOString();
cibles.filter((c) => c.avecCotes).forEach((c, k) => {
  const l = c.ligne;
  const over = 1.62 + 0.04 * (k % 11);
  const under = Number((1 / (1.065 - 1 / over)).toFixed(3));
  const genre = ['fd', 'espn', 'smarkets'][k % 3];
  const source = genre === 'fd' ? G.SOURCE_FD_PLUS_MOINS.source : genre === 'espn' ? G.SOURCE_ESPN_PLUS_MOINS : 'smarkets';
  const ev = Number(insererEvenement.run(source, `essai:${l.match_key}`, l.league, l.date, decaler(l.date, 0), l.home_name, l.away_name, l.home_id, l.away_id, genre === 'smarkets' ? null : l.match_key, MAINTENANT).lastInsertRowid);
  if (genre === 'fd') {
    insererCote.run(ev, G.SOURCE_FD_PLUS_MOINS.bookmaker, 'over', 'preclose', decaler(l.date, -24 * 60), over);
    insererCote.run(ev, G.SOURCE_FD_PLUS_MOINS.bookmaker, 'under', 'preclose', decaler(l.date, -24 * 60), under);
  } else if (genre === 'espn') {
    for (const livre of ['Bet365', 'DraftKings']) {
      insererCote.run(ev, livre, 'over', 'open', decaler(l.date, -3 * 24 * 60), over + 0.1);
      insererCote.run(ev, livre, 'under', 'open', decaler(l.date, -3 * 24 * 60), under - 0.08);
      insererCote.run(ev, livre, 'over', 'close', decaler(l.date, -5), over);
      insererCote.run(ev, livre, 'under', 'close', decaler(l.date, -5), under);
      insererCote.run(ev, livre, 'over', 'live', decaler(l.date, 10), 9.5);
      insererCote.run(ev, livre, 'under', 'live', decaler(l.date, 10), 1.02);
    }
  } else {
    insererCote.run(ev, 'Smarkets', 'over', 'snapshot', decaler(l.date, -90), over);
    insererCote.run(ev, 'Smarkets', 'under', 'snapshot', decaler(l.date, -90), under);
  }
  plantes[genre].push(c.cle);
});
sortie.plantes = Object.fromEntries(Object.entries(plantes).map(([k, v]) => [k, v.length]));

// 3. Les forces de buts : l'étape de nuit, sur place, pour l'empreinte de la candidate.
const configService = getEngineConfig('football');
const configCandidate = avecLeModele(configService);
const reglages = G.reglagesDuModeleDeButs(configCandidate);
const empreinte = G.empreinteDesForces(reglages);
const nuit = await F.forcesDeButs({ empreintes: [empreinte], database: db, aPart: false, maintenant: () => MAINTENANT });
sortie.nuit = { mode: nuit.mode, lignes: nuit.lignes, ecrites: nuit.ecrites, clubs: nuit.clubs, championnats: nuit.championnats, controle: nuit.controle ? { lignes: nuit.controle.lignes, ecarts: nuit.controle.ecarts.length } : null, erreur: nuit.erreur ?? null };

// ------------------------------------------------------------ les états de référence (C12)

/** L'état de chaque club « avant J » par l'ACCUMULATEUR rejoué ici sur la table du jour J, pour les couples demandés. */
function etatsParLAccumulateur(demandes) {
  const acc = new F.AccumulateurDesForces({ empreintes: [empreinte] });
  const parJour = [...demandes].sort((a, b) => (a.J < b.J ? -1 : a.J > b.J ? 1 : 0));
  const out = new Map();
  let i = 0;
  const repondre = (jusquA) => {
    while (i < parJour.length && (jusquA === null || parJour[i].J <= jusquA)) {
      const d = parJour[i++];
      out.set(`${d.club}|${d.J}`, { etat: acc.etat(empreinte, d.club), ligue: d.league ? acc.moyennes(d.league, d.J, d.saison) : null });
    }
  };
  let dernier = null;
  for (const ligne of F.faitsDeTeamDay(db)) {
    if (ligne.date !== dernier) {
      acc.finDeJournee();
      repondre(ligne.date);
      dernier = ligne.date;
    }
    const faits = G.faitsDeLaRencontre(ligne);
    if (faits) acc.ajouter(faits.dom, faits.ext);
  }
  acc.finDeJournee();
  repondre(null);
  return out;
}

const SOMMES = ['sa', 'wa', 'sd', 'wd', 'sga', 'wga', 'sgd', 'wgd'];
function ecartDEtat(a, b) {
  if (!a || !b) return a || b ? Infinity : 0;
  if (a.n !== b.n || a.nx !== b.nx || (a.ligue ?? null) !== (b.ligue ?? null)) return Infinity;
  return Math.max(...SOMMES.map((k) => Math.abs(a[k] - b[k])));
}
function ecartDeLigue(a, b) {
  if (!a || !b) return a || b ? Infinity : 0;
  if (a.matchs !== b.matchs || a.source !== b.source) return Infinity;
  return Math.max(Math.abs(a.buts.home - b.buts.home), Math.abs(a.buts.away - b.buts.away), Math.abs(a.xg.home - b.xg.home), Math.abs(a.xg.away - b.xg.away));
}

// ------------------------------------------------------------ chaque match cible

const tilt = getTiltState();
const regimes = {};
const demarrages = { zero: 0, entre: 0, huitEtPlus: 0 };
const methodes = {};
const demandesC12 = [];
const pourC12 = [];
let n = 0;
for (const c of cibles) {
  const l = c.ligne;
  const match = matchAdapte(l);
  const enrichi = await enrichMatchWithRealAverages(match, { sansRepliPayant: true });
  const aS = await analyzeMatch(enrichi, configService, tilt, sport, { maintenant: MAINTENANT_MS });
  const aC = await analyzeMatch(enrichi, configCandidate, tilt, sport, { maintenant: MAINTENANT_MS });
  if (phase === 'ecran') {
    const code = aC.modeleDeButs?.provenance?.code ?? 'sans-modele';
    parRegime[code] = (parRegime[code] ?? 0) + 1;
    if (parRegime[code] <= 2) paires.push({ cle: c.cle, regime: code, match: { home: enrichi.home, away: enrichi.away, league: enrichi.league ?? null }, sans: aS, avec: aC });
  }
  const entrees = await sport.model.resolveGoalInputs(enrichi, reglages, { maintenant: MAINTENANT_MS });
  const fair = referenceDuMoteur(enrichi, configCandidate);
  const b = G.modeleDeButs({ fair, entrees, reglages });
  const cle = c.cle;
  n++;
  regimes[b.provenance.code] = (regimes[b.provenance.code] ?? 0) + 1;
  if (b.parties.marche) methodes[b.parties.marche.methode] = (methodes[b.parties.marche.methode] ?? 0) + 1;
  const pb = b.probabilites;
  const dC = aC.distributions;

  // -- La concordance : le moteur rend exactement ce que le modèle recalculé ici donne.
  noter('concordance.buts', cle, Math.max(Math.abs(aC.expectedGoals.home - r(b.lambda, 3)), Math.abs(aC.expectedGoals.away - r(b.mu, 3))), 0);
  let ecartD = 0;
  for (const L of G.LIGNES_DE_BUTS) {
    const s = String(L).replace('.', '');
    ecartD = Math.max(ecartD, Math.abs(dC.totalGoals[L].over - p6(pb[`over${s}`])), Math.abs(dC.totalGoals[L].under - p6(1 - pb[`over${s}`])));
    for (const [cote, seau] of [['home', pb.homeTeamGoals], ['away', pb.awayTeamGoals]]) {
      ecartD = Math.max(ecartD, Math.abs(dC.teamGoals[cote][L].over - p6(seau[`over${s}`])), Math.abs(dC.teamGoals[cote][L].under - p6(seau[`under${s}`])));
    }
  }
  ecartD = Math.max(ecartD, Math.abs(dC.bothTeamsScore.yes - p6(pb.bothTeamsScore)), Math.abs(dC.bothTeamsScore.no - p6(1 - pb.bothTeamsScore)));
  const casesM = dC.scoreExact?.cases ?? [];
  if (casesM.length !== 81) ecartD = Infinity;
  else b.cases.forEach((x, k) => (ecartD = Math.max(ecartD, Math.abs(casesM[k] - p6(x.p)))));
  ecartD = Math.max(ecartD, Math.abs((dC.scoreExact?.horsGrille ?? Infinity) - p6(b.horsGrille)));
  noter('concordance.distributions', cle, ecartD, 0);
  vrai('concordance.provenance', cle, aC.modeleDeButs?.provenance?.code === b.provenance.code, { moteur: aC.modeleDeButs?.provenance?.code ?? null, recalcul: b.provenance.code });
  vrai('concordance.reference', cle, fair ? egal(dC.result, { home: p6(fair[0]), draw: p6(fair[1]), away: p6(fair[2]) }) : aS.prediction?.source === 'statistiques', { fair });

  // -- C1 : les sommes.
  noter('C1.1n2', cle, pb.home + pb.draw + pb.away - 1, 1e-9);
  for (const L of G.LIGNES_DE_BUTS) {
    const s6 = Object.values(pb.resultAndTotal[L]).reduce((x, y) => x + y, 0);
    noter('C1.combine', `${cle}|${L}`, s6 - 1, 1e-9);
  }
  noter('C1.grille441', cle, b.grille.reduce((x, y) => x + y, 0) - 1, 1e-9);
  noter('C1.cases81', cle, b.cases.reduce((x, y) => x + y.p, 0) + b.horsGrille - 1, 1e-9);
  noter('C1.moteur', cle, dC.result.home + dC.result.draw + dC.result.away - 1, 2e-6);
  for (const L of G.LIGNES_DE_BUTS) {
    noter('C1.moteur', `${cle}|totalGoals|${L}`, dC.totalGoals[L].over + dC.totalGoals[L].under - 1, 1e-6);
    noter('C1.moteur', `${cle}|resultAndTotal|${L}`, Object.values(dC.resultAndTotal[L]).reduce((x, y) => x + y, 0) - 1, 5e-6);
    for (const cote of ['home', 'away']) noter('C1.moteur', `${cle}|teamGoals|${cote}|${L}`, dC.teamGoals[cote][L].over + dC.teamGoals[cote][L].under - 1, 1e-6);
  }
  noter('C1.moteur', `${cle}|btts`, dC.bothTeamsScore.yes + dC.bothTeamsScore.no - 1, 1e-6);
  vrai('C1.bornes', cle, b.lambda >= 0.2 && b.lambda <= 6 && b.mu >= 0.2 && b.mu <= 6, { lambda: b.lambda, mu: b.mu });

  // -- C2 et C3 : l'ancrage sur `parties.marche`, sur une grille écrite à part.
  if (fair) {
    const gM = grille(b.parties.marche.lambda, b.parties.marche.mu, reglages.rho).cases;
    const H = masse(gM, (i, j) => i > j);
    const A = masse(gM, (i, j) => i < j);
    noter('C2.equilibre', cle, H / (H + A) - fair[0] / (fair[0] + fair[2]), 1e-9);
    if (b.parties.marche.methode === '1N2-seul') noter('C2.1n2seul', cle, Math.max(Math.abs(H - fair[0]), Math.abs(A - fair[2])), 1e-9);
    vrai('C2.moteur1n2', cle, egal(dC.result, aS.distributions.result) && egal(aC.prediction, aS.prediction) && egal(dC.result, { home: p6(fair[0]), draw: p6(fair[1]), away: p6(fair[2]) }));
    if (b.parties.plusMoins) {
      noter('C3.total', cle, masse(gM, (i, j) => i + j > 2.5) - b.parties.plusMoins.pOver, 1e-9);
      vrai('C3.methode', cle, b.parties.marche.methode === 'total-equilibre');
    } else vrai('C3.methode', cle, b.parties.marche.methode === '1N2-seul');
  } else {
    vrai('C2.sansCote', cle, egal(dC.result, aS.distributions.result) && egal(aC.prediction, aS.prediction) && aC.prediction?.source === 'statistiques');
  }
  // Le mélange refait à la main (log, total et écart à part), borné, puis la grille finale à part.
  const st = b.parties.statistiques;
  let lf;
  if (fair) {
    const w = b.parties.plusMoins ? reglages.melange.avecPlusMoins : reglages.melange.sans;
    const m = b.parties.marche;
    const TT = (1 - w.wT) * (Math.log(m.lambda) + Math.log(m.mu)) / 2 + w.wT * (Math.log(st.lambda) + Math.log(st.mu)) / 2;
    const SS = (1 - w.wS) * (Math.log(m.lambda) - Math.log(m.mu)) / 2 + w.wS * (Math.log(st.lambda) - Math.log(st.mu)) / 2;
    lf = { lambda: Math.exp(TT + SS), mu: Math.exp(TT - SS) };
  } else lf = { lambda: st.lambda, mu: st.mu };
  const borne = (x) => Math.min(6, Math.max(0.2, x));
  noter('C3.melange', cle, Math.max(relatif(b.lambda, borne(lf.lambda)), relatif(b.mu, borne(lf.mu))), 1e-12);
  const gF = grille(b.lambda, b.mu, reglages.rho).cases;
  let ecartG = 0;
  for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) ecartG = Math.max(ecartG, Math.abs(b.grille[i * 21 + j] - gF[i][j]));
  noter('C3.grilleFinale', cle, ecartG, 1e-12);

  // -- C4 : monotonie des lignes (total et par équipe), à pleine précision (stricte) et au moteur.
  vrai('C4.total', cle, pb.over05 > pb.over15 && pb.over15 > pb.over25 && pb.over25 > pb.over35);
  for (const seau of [pb.homeTeamGoals, pb.awayTeamGoals]) vrai('C4.equipes', cle, seau.over05 > seau.over15 && seau.over15 > seau.over25 && seau.over25 > seau.over35);
  const lignesM = (o) => G.LIGNES_DE_BUTS.map((L) => o[L].over);
  for (const v of [lignesM(dC.totalGoals), lignesM(dC.teamGoals.home), lignesM(dC.teamGoals.away)]) vrai('C4.moteur', cle, v.every((x, k) => k === 0 || x <= v[k - 1]), { v });

  // -- C5 : bornes entre marchés, et tous les marchés tirés de LA grille qui donne le total.
  for (const [k, L] of G.LIGNES_DE_BUTS.entries()) {
    const s = ['over05', 'over15', 'over25', 'over35'][k];
    vrai('C5.bornes', `${cle}|${L}`, pb.homeTeamGoals[s] <= pb[s] + 1e-15 && pb.awayTeamGoals[s] <= pb[s] + 1e-15);
    vrai('C5.bornesMoteur', `${cle}|${L}`, dC.teamGoals.home[L].over <= dC.totalGoals[L].over + 1e-6 && dC.teamGoals.away[L].over <= dC.totalGoals[L].over + 1e-6);
  }
  vrai('C5.bornes', `${cle}|btts`, pb.bothTeamsScore <= pb.over15 + 1e-15 && pb.bothTeamsScore >= pb.homeTeamGoals.over05 + pb.awayTeamGoals.over05 - 1 - 1e-15);
  vrai('C5.bornesMoteur', `${cle}|btts`, dC.bothTeamsScore.yes <= dC.totalGoals[1.5].over + 1e-6 && dC.bothTeamsScore.yes >= dC.teamGoals.home[0.5].over + dC.teamGoals.away[0.5].over - 1 - 2e-6);
  {
    const gT = (f) => {
      let s = 0;
      for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) if (f(i, j)) s += b.grille[i * 21 + j];
      return s;
    };
    let e = Math.abs(gT((i, j) => i > 0 && j > 0) - pb.bothTeamsScore);
    for (const [k, L] of G.LIGNES_DE_BUTS.entries()) {
      const s = ['over05', 'over15', 'over25', 'over35'][k];
      e = Math.max(e, Math.abs(gT((i, j) => i + j > L) - pb[s]), Math.abs(gT((i) => i > L) - pb.homeTeamGoals[s]), Math.abs(gT((i, j) => j > L) - pb.awayTeamGoals[s]));
    }
    e = Math.max(e, Math.abs(gT((i, j) => i > j) - pb.home), Math.abs(gT((i, j) => i === j) - pb.draw));
    noter('C5.memeGrille', cle, e, 1e-12);
  }

  // -- C6 : le combiné aligné sur le 1N2 final (au moteur, 6 décimales), et refait ici.
  const resultat = fair ? { home: fair[0], draw: fair[1], away: fair[2] } : aS.distributions.result;
  for (const L of G.LIGNES_DE_BUTS) {
    for (const side of ['home', 'draw', 'away']) {
      const rt = dC.resultAndTotal[L];
      noter('C6.alignement', `${cle}|${L}|${side}`, rt[`${side}Over`] + rt[`${side}Under`] - dC.result[side], 2e-6);
      const brut = pb.resultAndTotal[L];
      const modele = brut[`${side}Over`] + brut[`${side}Under`];
      if (modele > 0) noter('C6.concordance', `${cle}|${L}|${side}`, Math.max(Math.abs(rt[`${side}Over`] - (brut[`${side}Over`] * resultat[side]) / modele), Math.abs(rt[`${side}Under`] - (brut[`${side}Under`] * resultat[side]) / modele)), 2e-6);
    }
  }

  // -- C7 : le score — la case la plus probable, les buts attendus, les issues, « autre score ».
  const sp = aC.scorePrediction;
  let max = b.cases[0];
  for (const x of b.cases) if (x.p > max.p) max = x;
  const celleAnnoncee = b.cases.find((x) => x.home === sp?.mostLikely?.home && x.away === sp?.mostLikely?.away);
  vrai('C7.plusProbable', cle, Boolean(sp && celleAnnoncee && celleAnnoncee.p === max.p && sp.mostLikely.probability === r(max.p, 4)), { annonce: sp?.mostLikely ?? null, max: { home: max.home, away: max.away, p: max.p } });
  noter('C7.buts', cle, sp ? Math.max(Math.abs(sp.expectedGoals.home - aC.expectedGoals.home), Math.abs(sp.expectedGoals.away - aC.expectedGoals.away)) : Infinity, 0.0051);
  vrai('C7.issues', cle, Boolean(sp && sp.outcomes.home === r(pb.home, 4) && sp.outcomes.draw === r(pb.draw, 4) && sp.outcomes.away === r(pb.away, 4) && sp.autreScore === r(b.horsGrille, 4) && sp.provenance?.code === b.provenance.code && sp.formEffect === null));

  // -- C9 : la provenance, décidée ici à partir des entrées.
  const fH = G.forcesDe(entrees?.forces?.home ?? null, reglages);
  const fA = G.forcesDe(entrees?.forces?.away ?? null, reglages);
  const xg = fH.matchs > 0 && fA.matchs > 0 && fH.matchsXg * 2 >= fH.matchs && fA.matchsXg * 2 >= fA.matchs;
  const attendu = fair ? `cotes-${entrees?.plusMoins ? 'plusmoins' : '1n2'}-${xg ? 'xg' : 'buts'}` : fH.matchs > 0 || fA.matchs > 0 ? `${xg ? 'xg' : 'buts'}-seuls` : 'moyennes-seules';
  vrai('C9.provenance', cle, b.provenance.code === attendu && aC.modeleDeButs?.provenance?.code === attendu, { attendu, rendu: b.provenance.code });
  if (plantes.smarkets.includes(cle)) vrai('C9.smarketsSeul', cle, entrees?.plusMoins === null && !b.provenance.code.includes('plusmoins'));
  // Les distributions gelées avec chaque pronostic (markets.distributionDuMarche) : la provenance avec la clé, sur
  // les marchés de buts seulement ; jamais sans la clé.
  const BUTS = ['totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal'];
  const gelS = (aS.marketPredictions ?? []).map((p) => sport.markets.distributionDuMarche(aS, p));
  const gelC = (aC.marketPredictions ?? []).map((p) => [p.marketId, sport.markets.distributionDuMarche(aC, p)]);
  vrai('C9.provenanceGel', `${cle}|en service`, gelS.every((d) => !d || !('provenance' in d)));
  vrai('C9.provenanceGel', `${cle}|candidate`, gelC.every(([id, d]) => (BUTS.includes(id) ? d?.provenance === b.provenance.code : !d || !('provenance' in d))), { marches: gelC.map(([id, d]) => [id, d?.provenance ?? null]) });
  if (plantes.fd.includes(cle) || plantes.espn.includes(cle)) vrai('C9.planteLu', cle, Boolean(entrees?.plusMoins) && b.provenance.code.includes('plusmoins'), { plusMoins: entrees?.plusMoins ?? null });
  if (plantes.espn.includes(cle)) {
    // La clôture ESPN (5 min avant le coup d'envoi, heure sûre) est le dernier relevé admis ; le direct absurde, jamais.
    vrai('C9.espnCloture', cle, entrees?.plusMoins?.source === 'ESPN (moyenne de 2 livres)' && entrees.plusMoins.pOver > 0.3 && entrees.plusMoins.pOver < 0.7, { plusMoins: entrees?.plusMoins ?? null });
  }

  // -- C10 : les 81 cases rendues = les cases 0-8 d'une grille 0-20 écrite à part, jamais renormalisées.
  let e81 = 0;
  for (const x of b.cases) e81 = Math.max(e81, Math.abs(x.p - gF[x.home][x.away]));
  noter('C10.cases', cle, e81, 1e-12);
  noter('C10.horsGrille', cle, b.horsGrille - (1 - b.cases.reduce((s, x) => s + x.p, 0)), 1e-12);

  // -- C11 : le démarrage à froid touche le total statistique, jamais l'écart.
  const brutes = st.brutes;
  const nMin = Math.min(fH.matchs, fA.matchs);
  const TL = (Math.log(st.ligue.buts.home) + Math.log(st.ligue.buts.away)) / 2;
  if (nMin === 0) {
    demarrages.zero++;
    noter('C11.zero', cle, (Math.log(st.lambda) + Math.log(st.mu)) / 2 - TL, 1e-12);
  } else if (nMin >= 8) {
    demarrages.huitEtPlus++;
    vrai('C11.huit', cle, st.lambda === brutes.lambda && st.mu === brutes.mu);
  } else {
    demarrages.entre++;
    const f = nMin / 8;
    noter('C11.entre', cle, (Math.log(st.lambda) + Math.log(st.mu)) / 2 - ((1 - f) * TL + f * (Math.log(brutes.lambda) + Math.log(brutes.mu)) / 2), 1e-12);
  }
  noter('C11.ecart', cle, (Math.log(st.lambda) - Math.log(st.mu)) / 2 - (Math.log(brutes.lambda) - Math.log(brutes.mu)) / 2, 1e-12);

  // -- C12 : à relire plus bas (l'accumulateur rejoue toute la table une seule fois).
  const ids = { home: Number(String(l.home_id).replace('fotmob-', '')), away: Number(String(l.away_id).replace('fotmob-', '')) };
  const saison = seasonOf(l.league, l.date);
  for (const cote of ['home', 'away']) demandesC12.push({ club: ids[cote], J: l.date, league: cote === 'home' ? l.league : null, saison });
  pourC12.push({ cle, J: l.date, league: l.league, saison, ids, entrees });

  // -- C8 (une partie des cibles) : ρ de la clé ; defaultCorrelation sans effet quand la clé existe.
  if (n <= 40) {
    const cfgRho = avecLeModele(configService, { rho: -0.2 });
    const aR = await analyzeMatch(enrichi, cfgRho, tilt, sport, { maintenant: MAINTENANT_MS });
    const bR = G.modeleDeButs({ fair, entrees, reglages: G.reglagesDuModeleDeButs(cfgRho) });
    let eR = 0;
    bR.cases.forEach((x, k) => (eR = Math.max(eR, Math.abs((aR.distributions.scoreExact?.cases?.[k] ?? Infinity) - p6(x.p)))));
    noter('C8.rhoDeLaCle', cle, eR, 0);
    // τ(1,1)/τ(2,2) = 1 − ρ : la case 1-1 rapportée au produit des deux lois, face à la case 2-2.
    const rapport = (bb, i) => bb.grille[i * 21 + i] / (poisson(i, bb.lambda) * poisson(i, bb.mu));
    noter('C8.tau11', cle, rapport(bR, 1) / rapport(bR, 2) - (1 - -0.2), 1e-9);
    noter('C8.tau11', `${cle}|-0,05`, rapport(b, 1) / rapport(b, 2) - (1 - -0.05), 1e-9);
    const aD = await analyzeMatch(enrichi, { ...configCandidate, defaultCorrelation: -0.3 }, tilt, sport, { maintenant: MAINTENANT_MS });
    const butsDe = (a) => ({ e: a.expectedGoals, t: a.distributions.totalGoals, g: a.distributions.teamGoals, b: a.distributions.bothTeamsScore, s: a.distributions.scoreExact, ...(fair ? { rt: a.distributions.resultAndTotal } : {}) });
    vrai('C8.defaultCorrelation', cle, egal(butsDe(aD), butsDe(aC)));
  }
}
sortie.cibles = { total: n, avecCotes: cibles.filter((c) => c.avecCotes).length, sansCotes: cibles.filter((c) => !c.avecCotes).length };
sortie.regimes = regimes;
sortie.methodes = methodes;
sortie.demarrages = demarrages;

// -- C12 : la table relue par le lecteur du moteur = l'accumulateur = le second chemin, à 1e-12.
{
  const parAcc = etatsParLAccumulateur(demandesC12);
  const liguesSql = new Map();
  for (const x of pourC12) {
    for (const cote of ['home', 'away']) {
      const club = x.ids[cote];
      const lu = x.entrees?.forces?.[cote] ?? null;
      const acc = parAcc.get(`${club}|${x.J}`)?.etat ?? null;
      const second = F.etatParLeSecondChemin({ database: db, club, J: x.J, reglages: F.reglagesDeLEmpreinte(empreinte), liguesSql });
      noter('C12.accumulateur', `${x.cle}|${cote}`, ecartDEtat(lu, acc), 1e-12);
      noter('C12.secondChemin', `${x.cle}|${cote}`, ecartDEtat(lu, second), 1e-12);
    }
    noter('C12.ligue', x.cle, ecartDeLigue(x.entrees?.ligue ?? null, parAcc.get(`${x.ids.home}|${x.J}`)?.ligue ?? null), 1e-12);
  }
}

// ------------------------------------------------------------ les cas plantés (sans base)

// C1 / bornes : des forces extrêmes, sans cote → λ au plafond (6), μ au plancher (0,2) ; la grille reste à 1.
{
  // Le club qui reçoit marque énormément et n'encaisse presque rien ; le visiteur, l'inverse.
  const fort = { sa: 600, wa: 30, sd: 0.3, wd: 30, sga: 600, wga: 30, sgd: 0.3, wgd: 30, n: 30, nx: 0, ligue: 'essai' };
  const faible = { sa: 0.3, wa: 30, sd: 600, wd: 30, sga: 0.3, wga: 30, sgd: 600, wgd: 30, n: 30, nx: 0, ligue: 'essai' };
  const x = G.modeleDeButs({ fair: null, entrees: { forces: { home: fort, away: faible }, ligue: null, plusMoins: null }, reglages });
  vrai('C1.bornesPlantees', 'λ très fort, μ très faible', x.lambda === 6 && x.mu === 0.2, { lambda: x.lambda, mu: x.mu, brutes: x.parties.statistiques.brutes });
  noter('C1.grillePlantee', 'grille à λ = 6, μ = 0,2', x.grille.reduce((s, p) => s + p, 0) - 1, 1e-9);
  const g66 = G.grilleDesButs(6, 6, -0.05);
  noter('C1.grillePlantee', 'grille à λ = μ = 6', g66.reduce((s, p) => s + p, 0) - 1, 1e-9);
}

// C8 : `defaultCorrelation` ne touche jamais la grille du modèle (il n'est même pas lu).
// C10 : λ = 5, μ = 0,6 — la grille 0-20 face aux sommes fermées de Poisson × Dixon-Coles (sur tout ℕ²).
{
  const l5 = 5;
  const m6 = 0.6;
  const rho = -0.05;
  const g = G.grilleDesButs(l5, m6, rho);
  const TAILLE = G.N_CALCUL + 1;
  const sur = (f) => {
    let s = 0;
    for (let i = 0; i <= G.N_CALCUL; i++) for (let j = 0; j <= G.N_CALCUL; j++) if (f(i, j)) s += g[i * TAILLE + j];
    return s;
  };
  // Sur ℕ², τ conserve la masse : P(total ≤ k) est une somme finie, P(dom ≤ 3) = Σ_{i ≤ 3} Poisson(i ; λ).
  const ferme = (k) => {
    let s = 0;
    for (let i = 0; i <= k; i++) for (let j = 0; i + j <= k; j++) s += poisson(i, l5) * poisson(j, m6) * tau(i, j, l5, m6, rho);
    return 1 - s;
  };
  let dom3 = 0;
  for (let i = 0; i <= 3; i++) dom3 += poisson(i, l5);
  noter('C10.ferme', 'P(total > 4,5)', sur((i, j) => i + j > 4.5) - ferme(4), 1e-6);
  noter('C10.ferme', 'P(total > 3,5)', sur((i, j) => i + j > 3.5) - ferme(3), 1e-6);
  noter('C10.ferme', 'P(dom > 3,5)', sur((i) => i > 3.5) - (1 - dom3), 1e-6);
  const marches = G.marchesDeLaGrille(g);
  noter('C10.ferme', 'marchés : plus de 3,5', marches.over35 - ferme(3), 1e-6);
  noter('C10.ferme', 'marchés : domicile plus de 3,5', marches.homeTeamGoals.over35 - (1 - dom3), 1e-6);
  // La masse hors de la grille de calcul, à λ = μ = 6 (le plafond) : sous 1e-5.
  let dans = 0;
  for (let i = 0; i <= G.N_CALCUL; i++) dans += poisson(i, 6);
  noter('C10.masseHors', `hors 0-${G.N_CALCUL} à λ = μ = 6`, 1 - dans * dans, 1e-5);
  vrai('C10.grilleDeCalcul', 'N_CALCUL = 20, 441 cases', G.N_CALCUL === 20 && g.length === 441);
  // Les 81 cases rendues du cas plantés : celles de la grille 0-20, telles quelles.
  const ref = grille(l5, m6, rho).cases;
  const { cases, horsGrille } = G.casesRendues(g);
  let e = 0;
  for (const x of cases) e = Math.max(e, Math.abs(x.p - ref[x.home][x.away]));
  noter('C10.cases', 'λ = 5, μ = 0,6', e, 1e-12);
  noter('C10.horsGrille', 'λ = 5, μ = 0,6 (masse au-delà de 8 buts)', horsGrille - (1 - cases.reduce((s, x) => s + x.p, 0)), 1e-12);
  vrai('C10.horsGrilleSensible', 'λ = 5 : « autre score » de plus de 6 %', horsGrille > 0.06, { horsGrille });
}

// C11 : attenuerLeTotal pur — nMin 0, 3, 8, 20.
{
  const ligue = { buts: { home: 1.5, away: 1.1 } };
  const stats = { lambda: 2.4, mu: 0.7 };
  const TL = (Math.log(1.5) + Math.log(1.1)) / 2;
  const TS = (Math.log(2.4) + Math.log(0.7)) / 2;
  const S = (Math.log(2.4) - Math.log(0.7)) / 2;
  for (const nMin of [0, 3, 8, 20]) {
    const a = G.attenuerLeTotal(stats, ligue, nMin, 8);
    const f = Math.min(1, nMin / 8);
    noter('C11.pur', `nMin ${nMin} (total)`, (Math.log(a.lambda) + Math.log(a.mu)) / 2 - ((1 - f) * TL + f * TS), 1e-12);
    noter('C11.pur', `nMin ${nMin} (écart)`, (Math.log(a.lambda) - Math.log(a.mu)) / 2 - S, 1e-12);
  }
}

// C9 : deux clubs inconnus du magasin, sans cote → « moyennes-seules », les moyennes du championnat du match.
{
  const inconnu = adaptSeasonCalendarMatch({ homeName: 'Club inconnu du magasin A', awayName: 'Club inconnu du magasin B', date: '2026-09-25', league: 'EPL' }, 10000);
  const enrichi = await enrichMatchWithRealAverages(inconnu, { sansRepliPayant: true });
  const a = await analyzeMatch(enrichi, configCandidate, tilt, sport, { maintenant: MAINTENANT_MS });
  const e = await sport.model.resolveGoalInputs(enrichi, reglages, { maintenant: MAINTENANT_MS });
  const L = e?.ligue;
  vrai('C9.clubsInconnus', 'deux clubs inconnus, sans cote', a.modeleDeButs?.provenance?.code === 'moyennes-seules' && e.forces?.home === null && e.forces?.away === null && e.manques.some((m) => /club inconnu/.test(m)), { provenance: a.modeleDeButs?.provenance?.code ?? null, manques: e?.manques ?? null });
  noter('C9.clubsInconnus', 'buts attendus = moyennes du championnat', L ? Math.max(Math.abs(a.expectedGoals.home - r(L.buts.home, 3)), Math.abs(a.expectedGoals.away - r(L.buts.away, 3))) : Infinity, 0);
  vrai('C9.clubsInconnus', 'moyennes du championnat lues (pas le défaut)', Boolean(L && L.source !== 'défaut' && L.matchs >= 10), { ligue: L ?? null });
}

// Le Simulateur libre (xG saisis à la main, Opta ou StatsBomb) : le chemin d'avant, même avec la clé.
{
  const bruts = [
    { matchId: 'sim_1', home: 'Lens', away: 'Lille', xgHomeBrut: 1.9, xgAwayBrut: 0.8, providerSource: 'Opta', facteursContextuels: { avantageTerrain: 1.15, fatigueHome: 1, fatigueAway: 0.95 }, cotesMarche: { cote1: 1.9, coteN: 3.5, cote2: 4.2 } },
    { matchId: 'sim_2', home: 'Monaco', away: 'Lyon', xgHomeBrut: 1.2, xgAwayBrut: 1.6, providerSource: 'StatsBomb', facteursContextuels: { avantageTerrain: 1.15, fatigueHome: 1.05, fatigueAway: 1 }, cotesMarche: { cote1: 2.6, coteN: 3.4, cote2: 2.7 } },
    { matchId: 'sim_3', home: 'Metz', away: 'Lorient', xgHomeBrut: 0.6, xgAwayBrut: 2.9, providerSource: 'Opta', facteursContextuels: { avantageTerrain: 1.15, fatigueHome: 0.9, fatigueAway: 1.1 }, cotesMarche: {} }
  ];
  const normaliser = (a) => {
    const c = JSON.parse(JSON.stringify(a));
    delete c.engineVersion;
    if (c.comparateur) delete c.comparateur.calculeLe;
    return JSON.stringify(c);
  };
  for (const raw of bruts) {
    const m = adaptSampleMatch(raw, 1000);
    const aS = await analyzeMatch(m, configService, tilt, sport, { maintenant: MAINTENANT_MS });
    const aC = await analyzeMatch(m, configCandidate, tilt, sport, { maintenant: MAINTENANT_MS });
    vrai('simulateur', raw.matchId, normaliser(aS) === normaliser(aC) && !('modeleDeButs' in aC) && !aC.distributions?.scoreExact);
  }
}

// Des réglages fautifs : refusés (jamais calculés à moitié), et la clé nulle = le chemin d'avant.
{
  const refus = (changements) => {
    try {
      G.reglagesDuModeleDeButs({ modeleDeButs: { ...reglagesDuModele(), ...changements } });
      return false;
    } catch (error) {
      return error instanceof G.ReglagesDuModeleDeButsInvalides;
    }
  };
  sortie.reglages = {
    nulle: G.reglagesDuModeleDeButs({ modeleDeButs: null }) === null && G.reglagesDuModeleDeButs({}) === null,
    valides: G.reglagesDuModeleDeButs({ modeleDeButs: reglagesDuModele() }) !== null,
    refus: {
      cleInconnue: refus({ poidsDuMarche: 0.5 }),
      version: refus({ version: 2 }),
      rho: refus({ rho: 0.7 }),
      bornes: refus({ bornes: [6, 0.2] }),
      ancrage: refus({ ancrage: { ligne: 3.5, methode: 'total-equilibre' } }),
      melange: refus({ melange: { avecPlusMoins: { wT: 1.5, wS: 0.1 }, sans: { wT: 0.55, wS: 0.1 } } }),
      demarrage: refus({ demarrageAFroid: { matchs: 0 } })
    },
    empreinteDesForces: G.empreinteDesForces(reglagesDuModele()),
    empreinteSansPrior: G.empreinteDesForces(reglagesDuModele({ prior: 3, poidsXg: 0.2, statistique: 'xg' }))
  };
}

sortie.controles = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, { ...v, max: Number.isFinite(v.max) ? v.max : 'infini' }]));
sortie.reglagesDeLaCandidate = REGLAGES_MODELE_DE_BUTS;
if (phase === 'ecran') console.log(JSON.stringify({ ok: true, phase, maintenant: MAINTENANT, regimes: parRegime, paires }));
else console.log(JSON.stringify(sortie));
