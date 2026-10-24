/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-reactivite-essai.mjs <serveur de la copie> <phase> <options JSON>
 *
 * LA RÉACTIVITÉ DE L'ÉTAPE DE NUIT « moteurABlanc » (24/10/2026) : la nuit du 23 au 24/10, elle a tenu le serveur
 * de Pierre jusqu'à 2 191 ms d'affilée. Ici, sur un essai FABRIQUÉ (essaiFabrique.mjs) de la candidate du code,
 * réseau coupé, aucun Claude, registres d'ESSAI de la copie (jamais data/runtime de l'appli) :
 *   fabriquer   l'essai à la taille voulue (options : depuis, maintenant, joues, aVenir, revisions, magasin,
 *               versions, mesure — les deux registres d'essai) ;
 *   mesurer     l'étape de nuit (calculerABlanc, sans match à calculer : l'essai jugé seul), avec, À CÔTÉ de son
 *               propre `blocMaxMs`, deux mesures indépendantes du code mesuré : le plus long retard d'un battement
 *               de 1 ms (setInterval) et le maximum de monitorEventLoopDelay — le serveur tenu, vu de dehors ;
 *               puis ce que la nuit a RANGÉ (premiers chiffres ou jugement, au registre des versions d'essai ; les
 *               jugements de l'étape au registre de la mesure d'essai), pour comparer deux versions du code ;
 *   reference   le même essai refait par les fonctions SYNCHRONES (sans jamais rendre la main, rien écrit), comparé à
 *               ce que la nuit a rangé ; et la table relue par pages comparée à la table lue d'un coup ;
 *   exporter    toutes les lignes à blanc de la candidate (comparer deux versions du code ligne à ligne) ;
 *   nuit        (diagnostic) la nuit entière sur des matchs du magasin vus « à venir » — ou la page Matchs
 *               (`reelle`) —, et avec `profil` le corps de la boucle refait, chronométré morceau par morceau.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { importeur } from './versionsMoteurCommun.mjs';
import { fabriquerEssai } from './essaiFabrique.mjs';

const [serveur, phase, brut] = process.argv.slice(2);
const o = JSON.parse(brut ?? '{}');
const imp = importeur(serveur);
const { openDb } = await imp('data/db/matchStatsDb.js');
const database = openDb();
const s = { ok: true, phase };

/** Le serveur tenu, vu de DEHORS : un battement toutes les 1 ms ; le plus long retard d'un battement. */
function battement() {
  const h = monitorEventLoopDelay({ resolution: 1 });
  h.enable();
  let derniere = performance.now();
  let pire = 0;
  const t = setInterval(() => {
    const ici = performance.now();
    pire = Math.max(pire, ici - derniere);
    derniere = ici;
  }, 1);
  return () => {
    clearInterval(t);
    h.disable();
    pire = Math.max(pire, performance.now() - derniere);
    return { battementMaxMs: Math.round(pire), eldMaxMs: Math.round(h.max / 1e6), eldP99Ms: Math.round(h.percentile(99) / 1e6) };
  };
}

if (phase === 'fabriquer') {
  const debut = performance.now();
  if (o.forces) {
    // La base d'essai n'a pas les forces de buts de la candidate : sans elles, la nuit l'attend (« en attente ») et
    // ne juge rien. Calculées comme la nuit (table du jour J, puis forces), sur place.
    const V = await imp('core/engine/engineVersions.js');
    const T = await imp('data/db/dayTable.js');
    const F = await imp('data/db/forcesButs.js');
    const GM = await imp('core/engine/goalModel.js');
    const empreinte = GM.empreinteDesForces(GM.reglagesDuModeleDeButs({ modeleDeButs: V.CANDIDATE_EN_ESSAI.modifications.football.modeleDeButs }));
    await T.construireTableJourJ({ database, rendreLaMain: null, controle: { lignes: 0 } });
    await F.forcesDeButs({ empreintes: [empreinte], database, aPart: false, maintenant: () => Date.now() });
    s.forcesAJour = F.etatForcesButs({ database, empreintes: [empreinte] }).aJour;
  }
  s.essai = await fabriquerEssai({
    imp,
    database,
    versions: { fichier: o.versions },
    mesure: { fichier: o.mesure },
    depuis: Date.parse(o.depuis),
    maintenant: Date.parse(o.maintenant),
    joues: o.joues,
    aVenir: o.aVenir ?? 676,
    revisions: o.revisions ?? { joues: 3, aVenir: 2 },
    magasin: o.magasin !== false
  });
  s.essai = { ...s.essai, candidate: { id: s.essai.candidate.id, empreinte: s.essai.candidate.empreinte, essai: s.essai.candidate.essai } };
  s.enBase = database.prepare('SELECT COUNT(*) AS n FROM engine_candidate_picks WHERE candidate_id = ?').get(s.essai.candidate.id).n;
  s.dureeMs = Math.round(performance.now() - debut);
} else if (phase === 'mesurer') {
  const { calculerABlanc } = await imp('data/enregistreurs/moteurABlanc.js');
  const { jugementsDe } = await imp('bench/trialsRegistry.js');
  // Les registres d'essai d'après la fabrication, recopiés : chaque mesure part du même état.
  fs.copyFileSync(o.versionsSource, o.versions);
  fs.copyFileSync(o.mesureSource, o.mesure);
  const fin = battement();
  const debut = performance.now();
  const bilan = await calculerABlanc({ maintenant: Date.parse(o.maintenant), database, matchs: [], dansLaPasse: true, versions: { fichier: o.versions }, mesure: { fichier: o.mesure } });
  s.dureeMs = Math.round(performance.now() - debut);
  s.dehors = fin();
  s.bilan = { blocMaxMs: bilan.blocMaxMs, blocMaxOu: bilan.blocMaxOu ?? null, essai: bilan.essai, erreur: bilan.erreur, attente: bilan.attente ?? null, ...(bilan.diag ? { diag: bilan.diag } : {}) };
  const registre = JSON.parse(fs.readFileSync(o.versions, 'utf8'));
  s.range = { premiersChiffres: registre.candidate?.premiersChiffres ?? null, jugement: registre.candidate?.jugement ?? null };
  s.jugementsDeLEtape = jugementsDe('27', { fichier: o.mesure });
} else if (phase === 'reference') {
  // LE MÊME ESSAI REFAIT SANS JAMAIS RENDRE LA MAIN, par les fonctions synchrones d'avant le 24/10 (la table lue
  // d'un coup, lignesDeLEssai, le juge, complementsDeLEssai, temoinDuScore : exactement le chemin de jugerLEssai
  // avant le correctif), sans rien écrire (juge `enregistrer: false`) ; puis comparé à ce que la nuit coopérative a
  // RANGÉ (registre des versions d'essai de la mesure) : premiers chiffres, ou jugement principal, à l'identique.
  const V = await imp('core/engine/engineVersions.js');
  const { pronosticsABlanc } = await imp('data/enregistreurs/depot.js');
  const { lecteurDesRencontres, cleNumerique } = await imp('data/calibration.js');
  const { executerSansPause } = await imp('utils/travailCooperatif.js');
  const { jugerEtape } = await imp('bench/guard.js');
  const { LANCEMENTS } = await imp('bench/lancements.js');
  const E = await imp('bench/essaiCandidate.js');
  const maintenant = Date.parse(o.maintenant);
  const candidate = V.candidateEnEssai({ fichier: o.versionsSource });
  const essai = candidate.essai;
  const aujourdhui = new Date(maintenant).toISOString().slice(0, 10);
  const revisions = pronosticsABlanc(candidate.id, { database });
  const dates = revisions.map((r) => r.date).filter(Boolean).sort();
  const du = dates[0];
  const au = [dates.at(-1) ?? aujourdhui, aujourdhui].sort()[0];
  const lecteur = executerSansPause(lecteurDesRencontres(database, { du, au }));
  const lire = (f) => (!cleNumerique(f.fixtureKey) || !f.homeId || !f.awayId ? { raison: 'sansIdentifiant' } : lecteur(f));
  const options = { empreinte: candidate.empreinte, versionEnService: essai.versionEnService, lire, aujourdhui };
  const reglement = E.lignesDeLEssai(revisions.filter((r) => r.marketId !== 'scoreExact'), options);
  const temoins = E.temoinDuScore(revisions.filter((r) => r.marketId === 'scoreExact'), options);
  const horizon = E.horizonDe(candidate);
  const registre = { fichier: o.mesureSource, lancements: [...LANCEMENTS, E.lancementDeLEssai(candidate, essai)] };
  const quoi = `Essai à blanc n° ${essai.numero ?? 1} de la candidate « ${candidate.id} » face à la version en service n° ${essai.versionEnService}`;
  const juger = (principal) => jugerEtape({ etape: candidate.etape, lignes: reglement.lignes, mesure: E.MESURE_DE_L_ESSAI, maintenant, quoi, principal, enregistrer: false, registre });
  const provisoire = juger(false);
  const etat = E.horizonAtteint({ matchs: provisoire.n.matchs, depuis: essai.depuis, maintenant, horizon });
  const range = JSON.parse(fs.readFileSync(o.versions, 'utf8')).candidate;
  const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // La table relue par pages (petites pages : beaucoup de reprises après la clé) = la table lue d'un coup.
  const { pronosticsABlancParPages } = await imp('data/enregistreurs/depot.js');
  const parPages = executerSansPause(pronosticsABlancParPages(candidate.id, { database, page: 777 }));
  s.pages = { identiques: egal(parPages, revisions) && parPages.length === revisions.length, lignes: parPages.length };
  if (!etat.atteint) {
    const complements = E.complementsDeLEssai(reglement, { variantes: provisoire.seuil.variantes });
    const attendu = E.premiersChiffres(provisoire, { essai, horizon, maintenant, reglement, complements, temoins });
    s.comparaison = { chemin: 'premiers-chiffres', identique: egal(attendu, range.premiersChiffres), jugementRange: range.jugement ?? null };
    s.attendu = { matchs: attendu.matchs, lignes: attendu.lignes, a: attendu.a, b: attendu.b, gainPct: attendu.gainPct, calibration: attendu.calibration, temoins: attendu.temoins };
  } else {
    const principal = juger(true);
    const complements = E.complementsDeLEssai(reglement, { variantes: principal.seuil.variantes });
    const attendu = E.resumeDuJugement(principal, { essai, versionEnService: essai.versionEnService, empreinte: candidate.empreinte, reglement, complements, temoins });
    const premiers = E.premiersChiffres(principal, { essai, horizon, maintenant, reglement, complements, temoins });
    s.comparaison = { chemin: 'jugement', identique: egal(attendu, range.jugement) && egal(premiers, range.premiersChiffres) };
    s.attendu = { verdict: attendu.verdict, matchs: attendu.matchs, lignes: attendu.lignes, gainPct: attendu.gainPct, fourchettePct: attendu.fourchettePct, calibration: attendu.calibration, surete: attendu.surete, parFamille: attendu.parFamille };
  }
} else if (phase === 'exporter') {
  // Toutes les lignes à blanc de la candidate du code, telles qu'en base (pour comparer deux versions du code).
  const { pronosticsABlanc } = await imp('data/enregistreurs/depot.js');
  const V = await imp('core/engine/engineVersions.js');
  const lignes = pronosticsABlanc(V.CANDIDATE_EN_ESSAI.id, { database }).map((l) => ({ ...l }));
  fs.writeFileSync(o.fichier, JSON.stringify(lignes));
  s.lignes = lignes.length;
} else if (phase === 'nuit') {
  // Diagnostic : la nuit ENTIÈRE (calcul des matchs « à venir » pris au magasin, écriture, essai jugé), et, à part,
  // le corps de la boucle refait match par match, chronométré morceau par morceau.
  const { calculerABlanc } = await imp('data/enregistreurs/moteurABlanc.js');
  fs.copyFileSync(o.versionsSource, o.versions);
  fs.copyFileSync(o.mesureSource, o.mesure);
  const { matchsAVenir } = await imp('data/enregistreurs/gelPronostics.js');
  const matchs = o.reelle ? matchsAVenir(Date.parse(o.maintenant)) : database
    .prepare(`SELECT match_key AS matchId, date, league, home_name AS home, away_name AS away FROM matches WHERE date IN (${o.jours.map(() => '?').join(',')}) AND home_id IS NOT NULL ORDER BY date, match_key LIMIT ?`)
    .all(...o.jours, o.limite ?? 100000)
    .map((m) => ({ ...m, commenceTime: `${m.date}T18:00:00.000Z`, hasOdds: false }));
  s.matchs = matchs.length;
  const fin = battement();
  const debut = performance.now();
  const bilan = await calculerABlanc({ maintenant: Date.parse(o.maintenant), database, matchs, dansLaPasse: true, versions: { fichier: o.versions }, mesure: { fichier: o.mesure } });
  s.dureeMs = Math.round(performance.now() - debut);
  s.dehors = fin();
  s.bilan = { blocMaxMs: bilan.blocMaxMs, blocMaxOu: bilan.blocMaxOu ?? null, pauses: bilan.pauses ?? null, calcules: bilan.calcules, echecs: bilan.echecs, echantillons: bilan.echantillons, lignes: bilan.lignes, ecrites: bilan.ecrites, essai: bilan.essai, erreur: bilan.erreur, attente: bilan.attente ?? null, ...(bilan.diag ? { diag: bilan.diag } : {}) };
  if (o.profil) {
    // Le corps de la boucle, refait morceau par morceau (mêmes fonctions, même ordre), chronométré.
    const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
    const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
    const { getEngineConfig } = await imp('core/engine/engineConfig.js');
    const { getTiltState } = await imp('core/engine/tiltState.js');
    const V = await imp('core/engine/engineVersions.js');
    const { getSport } = await imp('sports/index.js');
    const G = await imp('data/enregistreurs/gelPronostics.js');
    const M = await imp('data/enregistreurs/moteurABlanc.js');
    const sport = getSport('football');
    const enService = getEngineConfig('football');
    const cand = V.candidateEnEssai({ fichier: o.versions });
    const configCandidate = V.configDeLaCandidate(enService, cand, 'football');
    const club = G.resolveur(database);
    const parts = { enrichi: [], a: [], b: [], club: [], compo: [], grille: [], lignes: [], total: [] };
    const maintenant = Date.parse(o.maintenant);
    for (const match of matchs) {
      let t = performance.now();
      const tic = (k) => {
        const ici = performance.now();
        parts[k].push(ici - t);
        t = ici;
      };
      const t0 = t;
      const enrichi = await enrichMatchWithRealAverages(match, { sansRepliPayant: true });
      tic('enrichi');
      const tilt = getTiltState();
      const a = await analyzeMatch(enrichi, enService, tilt, sport, { maintenant });
      tic('a');
      const b = await analyzeMatch(enrichi, configCandidate, tilt, sport, { maintenant });
      tic('b');
      const homeId = club(match.home, match.league);
      const awayId = club(match.away, match.league);
      tic('club');
      G.etatDeLaCompo({ homeId, date: match.date, database });
      tic('compo');
      const service = M.grilleDuScoreEnService({ a, enrichi, config: enService });
      tic('grille');
      M.lignesDuMatch({ a, b, candidate: cand, commun: {}, temoins: { scoreExact: { service } } });
      tic('lignes');
      parts.total.push(performance.now() - t0);
      await new Promise((r) => setImmediate(r));
    }
    const resume = (xs) => {
      const tri = [...xs].sort((x, y) => x - y);
      return { moy: Math.round(xs.reduce((p, x) => p + x, 0) / xs.length), p50: Math.round(tri[Math.floor(tri.length / 2)]), max: Math.round(tri.at(-1)), premier: Math.round(xs[0]) };
    };
    s.profil = Object.fromEntries(Object.entries(parts).map(([k, xs]) => [k, resume(xs)]));
  }
}

console.log(JSON.stringify(s));
