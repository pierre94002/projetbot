/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-combinaison-lot2.mjs <serveur de la copie>
 *
 * Étape 38, LOT 2a (16/11/2026) — sur la base d'essai, des matchs FABRIQUÉS (aucune donnée réelle), sans réseau :
 *   1. LE MOTEUR D'AVANT, REFAIT DANS LA COPIE : oddsEngine.js où le bloc du combiner est remplacé par la fusion d'avant
 *      (le texte du 15/11/2026) — son sha1 doit être celui du fichier en service avant ce lot. Puis les deux moteurs sur
 *      les mêmes matchs (quatre sortes de cotes × trois clubs × quatre réglages) : sorties identiques à l'octet (T-L2-1).
 *   2. Aucun poids lu dans les réglages : une clé `combinaison` posée dans le réglage ne change rien (T-L2-2).
 *   3. Un réglage de pari (le seuil) et le refus « à vérifier » ne changent aucune probabilité (T-PA1).
 *   4. « À vérifier » : le conseil devient un refus, à chaque porte qui passe par ce script — le moteur, le Repérage et les
 *      Opportunités (avecVerdicts), le gel de la nuit (T-L2-7).
 *   5. Une nuit fabriquée : les quatre colonnes neuves remplies, les lignes d'avant intactes, une trace seule n'ajoute
 *      aucune version ; les chiffres gelés sont ceux du moteur d'avant (T-L2-6, T-L2-1).
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [serveur] = process.argv.slice(2);
const fichier = (rel) => path.join(serveur, 'src', rel);
const imp = (rel) => import(pathToFileURL(fichier(rel)).href);
const sha1 = (texte) => crypto.createHash('sha1').update(Buffer.from(texte, 'utf8')).digest('hex');

// ------------------------------------------------------------ 1. le moteur d'avant, refait dans la copie
const BLOC_DU_LOT = [
  "  // Étape 38 (lot 2a, 16/11/2026) : cette fusion vit dans combiner.js (combinerLe1N2), la même expression dans le même",
  "  // ordre ; les β de la combinaison (poidsDeLaCombinaison.js, recopiés par script) sont tous nuls : le résultat est",
  "  // celui d'avant, à l'octet (test/combinaisonLot2.test.mjs, T-L2-1).",
  '  const resultat = combinerLe1N2({',
  '    marche: [marketProbHome, marketProbDraw, marketProbAway],',
  '    structurel: probabilitiesStructural,',
  '    exogene: probabilitiesExogenous,',
  '    fusion: config.weights',
  '  });',
  ''
].join('\n');
const BLOC_D_AVANT = [
  '  const weights = config.weights;',
  '  const resultat = {',
  '    home: weights.market * marketProbHome + weights.structural * probabilitiesStructural.home + weights.exogenous * probabilitiesExogenous.home,',
  '    draw: weights.market * marketProbDraw + weights.structural * probabilitiesStructural.draw + weights.exogenous * probabilitiesExogenous.draw,',
  '    away: weights.market * marketProbAway + weights.structural * probabilitiesStructural.away + weights.exogenous * probabilitiesExogenous.away',
  '  };',
  ''
].join('\n');
const IMPORT_DU_LOT = "import { combinerLe1N2 } from './combiner.js';\n";
const texteDuJour = fs.readFileSync(fichier('core/engine/oddsEngine.js'), 'utf8');
const compte = (t, x) => t.split(x).length - 1;
if (compte(texteDuJour, BLOC_DU_LOT) !== 1 || compte(texteDuJour, IMPORT_DU_LOT) !== 1) throw new Error('oddsEngine.js : le bloc du combiner ou son import est introuvable (ou en double)');
const texteDAvant = texteDuJour.replace(BLOC_DU_LOT, BLOC_D_AVANT).replace(IMPORT_DU_LOT, '');
fs.writeFileSync(fichier('core/engine/oddsEngineAvant.js'), texteDAvant);

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const { adaptSeasonCalendarMatch } = await imp('data/adapters/seasonCalendarAdapter.js');
const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
const { analyzeMatch: analyzeMatchDAvant } = await imp('core/engine/oddsEngineAvant.js');
const { getEngineConfig } = await imp('core/engine/engineConfig.js');
const { configDeLaCandidate, CANDIDATE_EN_ESSAI } = await imp('core/engine/engineVersions.js');
const { getTiltState } = await imp('core/engine/tiltState.js');
const { getSport } = await imp('sports/index.js');
const gel = await imp('data/enregistreurs/gelPronostics.js');
const { ecrirePronostics } = await imp('data/enregistreurs/depot.js');
const { avecVerdicts } = await imp('data/screener.js');
const { ETATS_VERDICT } = await imp('core/engine/verdictPari.js');

const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
const HEURE = 3_600_000;
const sport = getSport('football');
const tilt = getTiltState();

// ------------------------------------------------------------ les matchs fabriqués
const cal = (league, homeName, awayName) => adaptSeasonCalendarMatch({ league, homeName, awayName, date: '2026-10-06' }, 1000);
const CLUBS = [cal('EPL', 'Aston Villa', "Nott'm Forest"), cal('Championship', 'Charlton', 'Portsmouth'), cal('Serie A - Italy', 'Inter', 'Udinese')];
const ligne = (key, title, [odds1, oddsDraw, odds2], extra = {}) => ({ key, title, odds1, oddsDraw, odds2, ...extra });
const moyenne = (lignes, champ) => Number((lignes.reduce((s, l) => s + l[champ], 0) / lignes.length).toFixed(2));
const payant = (match, lignes) => ({
  ...match,
  hasOdds: true,
  commenceTime: '2026-10-06T19:00:00.000Z',
  marketOdds: { odds1: moyenne(lignes, 'odds1'), oddsDraw: moyenne(lignes, 'oddsDraw'), odds2: moyenne(lignes, 'odds2'), bookmakersCount: lignes.length, byBookmaker: lignes }
});
const gratuit = (match, cotes, releveAt = '2026-10-05T09:00:00.000Z') => ({
  ...match,
  hasOdds: true,
  oddsSource: 'gratuit',
  marketOdds: { odds1: cotes[0], oddsDraw: cotes[1], odds2: cotes[2], bookmakersCount: 1, byBookmaker: [ligne('espn_draftkings', 'DraftKings · ESPN', cotes, { referenceOnly: true, source: 'espn', releveAt })], source: 'gratuit', sources: ['espn'], releveAt, kickoff: null }
});
/** Quatre sortes de cotes : Pinnacle + une value chez William Hill ; palier 2 + une value ; cotes gratuites (repli) ; sans cote. */
const SORTES = {
  pinnacle: (m) => payant(m, [ligne('pinnacle', 'Pinnacle', [2.0, 3.5, 4.0]), ligne('williamhill', 'William Hill', [2.25, 3.3, 3.4]), ligne('unibet_fr', 'Unibet (FR)', [1.95, 3.4, 3.9])]),
  palier2: (m) => payant(m, [ligne('marathonbet', 'Marathon Bet', [2.6, 3.3, 2.8]), ligne('williamhill', 'William Hill', [2.45, 3.25, 3.15])]),
  repli: (m) => gratuit(m, [2.1, 3.3, 3.6]),
  sansCote: (m) => m
};
const enService = getEngineConfig('football');
const REGLAGES = {
  enService,
  anciensPoids: { ...enService, weights: { market: 0.7, structural: 0.2, exogenous: 0.1 } },
  poidsQuelconques: { ...enService, weights: { market: 0.55, structural: 0.3, exogenous: 0.15 } },
  avecLeModeleDeButs: configDeLaCandidate(enService, CANDIDATE_EN_ESSAI, 'football')
};
const enrichis = new Map();
const enrichir = async (m, cle) => {
  if (!enrichis.has(cle)) enrichis.set(cle, await enrichMatchWithRealAverages(m, { sansRepliPayant: true }));
  return enrichis.get(cle);
};
const texte = (x) => JSON.stringify(x);
const s = {};

// ------------------------------------------------------------ T-L2-1 : avant / après, à l'octet
s.avant = { sha1: sha1(texteDAvant), sha1DuJour: sha1(texteDuJour) };
const cas = [];
for (const [i, club] of CLUBS.entries()) {
  for (const [sorte, faire] of Object.entries(SORTES)) cas.push({ nom: `${club.home}|${sorte}`, sorte, club: i, match: await enrichir(faire(club), `${i}|${sorte}`) });
}
let comparaisons = 0;
const ecarts = [];
const actions = {};
const sources = {};
const resultatDuJour = new Map();
for (const c of cas) {
  for (const [nom, reglage] of Object.entries(REGLAGES)) {
    const apres = await analyzeMatch(c.match, reglage, tilt, sport, { maintenant: T0 });
    const avant = await analyzeMatchDAvant(c.match, reglage, tilt, sport, { maintenant: T0 });
    comparaisons++;
    if (texte(apres) !== texte(avant)) ecarts.push(`${c.nom}|${nom}`);
    if (nom === 'enService') {
      resultatDuJour.set(c.nom, apres);
      actions[c.sorte] = [...new Set([...(actions[c.sorte] ?? []), `${apres.staking.action}:${apres.staking.reason ?? ''}`])];
      sources[c.sorte] = [...new Set([...(sources[c.sorte] ?? []), `${apres.prediction?.source}:${apres.verdicts?.home?.juges?.palier ?? ''}`])];
    }
  }
}
s.identite = { comparaisons, ecarts, actions, sources, tailleDUneSortie: texte(resultatDuJour.get(cas[0].nom)).length };

// ------------------------------------------------------------ T-L2-2 : aucun poids lu dans les réglages
{
  const m = cas[0].match;
  const reference = texte(await analyzeMatch(m, enService, tilt, sport, { maintenant: T0 }));
  const avecLaCle = texte(await analyzeMatch(m, { ...enService, combinaison: { '1n2': { statistiques: 0.5 }, buts: { statistiques: 0.5 } } }, tilt, sport, { maintenant: T0 }));
  // engineVersion peut différer (une clé de plus dans les réglages = une autre version notée) : comparée sans lui.
  const sansVersion = (t) => texte({ ...JSON.parse(t), engineVersion: null });
  s.poidsHorsDesReglages = { identique: sansVersion(reference) === sansVersion(avecLaCle) };
}

// ------------------------------------------------------------ T-PA1 : un réglage de pari ne change aucune probabilité
{
  const probabilites = (r) => texte({ expectedGoals: r.expectedGoals, trueOdds: r.trueOdds, prediction: r.prediction, scorePrediction: r.scorePrediction, distributions: r.distributions, marketPredictions: r.marketPredictions, statExpectations: r.statExpectations ?? null, statLines: r.statLines ?? null, modeleDeButs: r.modeleDeButs ?? null });
  const aVerifier = { raisons: [{ id: 'essai:1', controle: 'score-football-data', texte: 'Score fabriqué : deux sources se contredisent', familles: ['tout'], date: '2026-09-30' }], texte: 'Score fabriqué : deux sources se contredisent' };
  let n = 0;
  const differents = [];
  for (const c of cas) {
    for (const [nom, reglage] of [['enService', enService], ['avecLeModeleDeButs', REGLAGES.avecLeModeleDeButs]]) {
      const base = probabilites(await analyzeMatch(c.match, reglage, tilt, sport, { maintenant: T0 }));
      const variantes = {
        seuil1: await analyzeMatch(c.match, { ...reglage, edgeThresholdMin: 0.01 }, tilt, sport, { maintenant: T0 }),
        seuil5: await analyzeMatch(c.match, { ...reglage, edgeThresholdMin: 0.05 }, tilt, sport, { maintenant: T0 }),
        aVerifier: await analyzeMatch({ ...c.match, aVerifier }, reglage, tilt, sport, { maintenant: T0 }),
        aVerifierVrai: await analyzeMatch({ ...c.match, aVerifier: true }, reglage, tilt, sport, { maintenant: T0 })
      };
      for (const [v, r] of Object.entries(variantes)) {
        n++;
        if (probabilites(r) !== base) differents.push(`${c.nom}|${nom}|${v}`);
      }
    }
  }
  s.pari = { comparaisons: n, differents };
}

// ------------------------------------------------------------ T-L2-7 : « à vérifier », porte par porte
{
  const m = cas.find((c) => c.sorte === 'pinnacle' && c.club === 0).match;
  const raison = 'Aston Villa – Everton du 28/09 (2-1) : score différent chez football-data (fabriqué)';
  const aVerifier = { raisons: [{ id: 'essai:2', controle: 'score-football-data', texte: raison, familles: ['tout'], date: '2026-09-28' }], texte: raison };
  const libre = await analyzeMatch(m, enService, tilt, sport, { maintenant: T0 });
  const refuse = await analyzeMatch({ ...m, aVerifier }, enService, tilt, sport, { maintenant: T0 });
  const parTrue = await analyzeMatch({ ...m, aVerifier: true }, enService, tilt, sport, { maintenant: T0 });
  const cellules = (r) => (r.comparateur?.livres ?? []).flatMap((l) => Object.values(l.cellules));
  const resume = (r) => ({
    action: r.staking.action,
    raison: r.staking.reason ?? null,
    mise: r.staking.stake ?? null,
    regleDeMise: r.staking.regleDeMise ?? null,
    candidats: (r.staking.candidates ?? []).length,
    conseilRefuse: r.staking.conseilRefuse ?? null,
    texte: r.staking.aVerifier?.texte ?? null,
    etats: Object.fromEntries(Object.entries(r.verdicts).map(([k, v]) => [k, v.etat])),
    verts: Object.values(r.verdicts).filter((v) => v.vert).length,
    mises: Object.values(r.verdicts).filter((v) => v.mise !== null && v.mise !== undefined).length,
    raisons: Object.fromEntries(Object.entries(r.verdicts).map(([k, v]) => [k, v.raison])),
    etatsConnus: Object.values(r.verdicts).every((v) => ETATS_VERDICT.includes(v.etat)),
    cellulesVertes: cellules(r).filter((c) => c.vert || c.conseillee).length,
    cellulesAVerifier: cellules(r).filter((c) => /à vérifier/.test(c.raison ?? '')).length,
    conseilsDuComparateur: (r.comparateur?.issues ?? []).filter((i) => i.conseil).length,
    retenue: r.comparateur?.retenue ?? null,
    avantage: r.edgePercent
  });
  const sansRaison = [undefined, null, false, {}, { raisons: [] }, { texte: '  ' }];
  const inchanges = [];
  for (const v of sansRaison) inchanges.push(texte(await analyzeMatch({ ...m, aVerifier: v }, enService, tilt, sport, { maintenant: T0 })) === texte(libre));
  s.moteur = { libre: resume(libre), refuse: resume(refuse), parTrue: resume(parTrue), sansRaisonInchange: inchanges };

  // Le Repérage et les Opportunités : la décision reprise à la lecture (avecVerdicts), par identifiants FotMob.
  const club = gel.resolveur(database);
  const homeId = club(m.home, m.league);
  const awayId = club(m.away, m.league);
  const data = { matches: [{ matchId: 'essai-1', league: m.league, home: m.home, away: m.away, homeId, awayId, commenceTime: m.commenceTime, markets: [{ key: 'home' }, { key: 'draw' }, { key: 'away' }] }] };
  const releveAt = new Date(T0 - 10 * 60_000).toISOString();
  const internes = new Map([['essai-1', { match: { ...m }, heures: { fichier: 'fabrique', parBookmaker: Object.fromEntries(m.marketOdds.byBookmaker.map((b) => [b.key, { releveAt, origine: 'fabrique' }])) } }]]);
  const options = { maintenant: T0, reglage: { maxAgeMinutes: 60, avantCompos: false }, config: enService, tiltState: tilt };
  const vus = [];
  const lu = (aVerifierDe) => {
    const r = avecVerdicts(data, internes, { ...options, ...(aVerifierDe ? { aVerifierDe } : {}) }).matches[0];
    return { action: r.pari.action, raison: r.pari.raison, conseil: r.pari.conseil ?? null, verts: r.markets.filter((k) => k.verdict?.vert).length, conseilsAuxIssues: r.markets.filter((k) => k.verdict?.conseil).length, etats: r.markets.map((k) => k.verdict?.etat ?? null) };
  };
  s.reperage = {
    homeId,
    awayId,
    parDefaut: lu(null),
    libre: lu(() => null),
    refuse: lu((x) => {
      vus.push(x);
      return x.homeId === homeId ? aVerifier : null;
    }),
    demande: vus
  };
}

// ------------------------------------------------------------ T-L2-6 (et T-L2-1) : une nuit fabriquée
{
  const colonnes = database.prepare("SELECT name, type FROM pragma_table_info('engine_picks')").all();
  s.colonnes = colonnes.map((c) => `${c.name}:${c.type}`);
  const toutes = () =>
    database
      .prepare('SELECT * FROM engine_picks ORDER BY fixture_key, market_key, version')
      .all()
      .map((r) => ({ ...r }));
  const club = gel.resolveur(database);
  const M1 = SORTES.pinnacle(CLUBS[0]);
  const M2 = SORTES.repli(CLUBS[1]);
  const M3 = CLUBS[2];
  const M3b = gratuit(CLUBS[2], [1.6, 4.0, 5.5], '2026-10-05T10:00:00.000Z');
  const idDe = (m) => ({ homeId: club(m.home, m.league), awayId: club(m.away, m.league) });

  // Des LIGNES D'AVANT (écrites comme avant ce lot : aucune trace) pour M3, la veille.
  const r3 = await analyzeMatchDAvant(await enrichMatchWithRealAverages(M3, { sansRepliPayant: true }), enService, tilt, sport, { maintenant: T0 - 24 * HEURE });
  const ancien = gel.elementDuGel({ match: M3, engineResult: r3, origine: gel.ORIGINES.nuit, maintenant: T0 - 24 * HEURE, ...idDe(M3), cotes: gel.sourceDesCotes(M3), compo: gel.etatDeLaCompo({}), engineHash: gel.empreinteMoteur(enService) });
  ancien.pronostics = ancien.pronostics.map(({ confiance, classeSeuil, seuilApplique, palier, ...reste }) => reste);
  s.lignesDAvantEcrites = ecrirePronostics([ancien], { database });
  const avantLaNuit = toutes();

  // La nuit : M1 (Pinnacle, une value), M2 (cotes gratuites, « à vérifier »), M3 dont les cotes arrivent.
  const raison = 'Charlton – Hull du 27/09 (0-0) : score différent chez football-data (fabriqué)';
  const aVerifierM2 = { raisons: [{ id: 'essai:3', controle: 'score-football-data', texte: raison, familles: ['tout'], date: '2026-09-27' }], texte: raison };
  const idM2 = idDe(M2);
  const aVerifierDe = (x) => (x.homeId === idM2.homeId ? aVerifierM2 : null);
  // Le score douteux (famille « tout ») vaut pour chaque famille : la même réponse, quelle que soit la famille (17/11/2026).
  const aVerifierParFamilleDe = (x) => aVerifierDe(x);
  s.nuit = await gel.gelerLaNuit({ maintenant: T0, matchs: [M1, M2, M3b], dansLaPasse: true, database, aVerifierDe, aVerifierParFamilleDe });
  const apresLaNuit = toutes();
  const neuves = apresLaNuit.filter((r) => r.recorded_at === new Date(T0).toISOString());
  const parMatch = (m) => neuves.filter((r) => r.home_name === m.home);
  const traces = (lignes) => ({
    lignes: lignes.length,
    paliers: [...new Set(lignes.map((r) => r.palier))],
    classes: [...new Set(lignes.map((r) => r.classe_seuil))],
    seuilDuResultat: lignes.filter((r) => r.market_id === 'result').map((r) => r.seuil_applique),
    seuilsDesAutres: [...new Set(lignes.filter((r) => r.market_id !== 'result').map((r) => r.seuil_applique))],
    confiances: [...new Set(lignes.map((r) => r.confiance))],
    versions: [...new Set(lignes.map((r) => r.version))]
  });
  s.traces = { M1: traces(parMatch(M1)), M2: traces(parMatch(M2)), M3: traces(parMatch(M3b)) };
  s.seuilEnService = enService.edgeThresholdMin;
  // Les lignes d'avant : identiques à l'octet après la nuit, leurs quatre colonnes toujours vides.
  const cleDe = (r) => `${r.fixture_key}|${r.market_key}|${r.version}`;
  const apresParCle = new Map(apresLaNuit.map((r) => [cleDe(r), r]));
  s.lignesDAvant = {
    nombre: avantLaNuit.length,
    intactes: avantLaNuit.every((r) => texte(apresParCle.get(cleDe(r))) === texte(r)),
    sansTraces: avantLaNuit.every((r) => r.confiance === null && r.classe_seuil === null && r.seuil_applique === null && r.palier === null)
  };

  // Les chiffres gelés cette nuit sont ceux du MOTEUR D'AVANT (hors les quatre colonnes neuves).
  const copie = { attendues: [] };
  for (const m of [M1, M2]) {
    const avant = await analyzeMatchDAvant(await enrichMatchWithRealAverages(m, { sansRepliPayant: true }), enService, tilt, sport, { maintenant: T0 });
    const e = gel.elementDuGel({ match: m, engineResult: avant, origine: gel.ORIGINES.nuit, maintenant: T0, ...idDe(m), cotes: gel.sourceDesCotes(m, { heureInstantanePayant: null }), compo: gel.etatDeLaCompo({ ...idDe(m), date: '2026-10-06', database }), engineHash: gel.empreinteMoteur(enService) });
    for (const p of e.pronostics) copie.attendues.push({ home: m.home, marketKey: p.marketKey, choice: p.choice, probability: p.probability, predictedOdds: p.predictedOdds, marketOdds: p.marketOdds, minOdds: p.minOdds, distribution: p.distribution, params: p.params });
  }
  const geles = [...parMatch(M1), ...parMatch(M2)].map((r) => ({ home: r.home_name, marketKey: r.market_key, choice: r.choice, probability: r.probability, predictedOdds: r.predicted_odds, marketOdds: r.market_odds, minOdds: r.min_odds, distribution: r.distribution, params: r.params }));
  const tri = (a, b) => `${a.home}|${a.marketKey}`.localeCompare(`${b.home}|${b.marketKey}`);
  s.chiffresDAvant = { lignes: geles.length, identiques: texte([...geles].sort(tri)) === texte([...copie.attendues].sort(tri)) };

  // Regelé : mêmes chiffres, mais « à vérifier » a changé de match — une trace seule n'ajoute aucune version.
  const idM1 = idDe(M1);
  const aVerifierDuRegel = (x) => (x.homeId === idM1.homeId ? aVerifierM2 : null);
  s.regel = await gel.gelerLaNuit({ maintenant: T0 + HEURE, matchs: [M1, M2, M3b], dansLaPasse: true, database, aVerifierDe: aVerifierDuRegel, aVerifierParFamilleDe: aVerifierDuRegel });
  s.apresRegel = { lignes: toutes().length, avant: apresLaNuit.length };

  // Le gel d'une ANALYSE (autoMatchAiTrigger.js) : la donnée « à vérifier » suit le résultat jusqu'aux colonnes.
  const m1 = await enrichMatchWithRealAverages(SORTES.palier2(CLUBS[0]), { sansRepliPayant: true });
  const analyse = await analyzeMatch({ ...m1, aVerifier: aVerifierM2 }, enService, tilt, sport, { maintenant: T0 + 2 * HEURE });
  s.analyse = { action: analyse.staking.action, raison: analyse.staking.reason ?? null, enFile: gel.gelerAnalyse({ match: SORTES.palier2(CLUBS[0]), engineResult: analyse, origine: gel.ORIGINES.avance, database, maintenant: T0 + 2 * HEURE, aVerifier: aVerifierM2, aVerifierParFamilleDe: () => aVerifierM2 }) };
  const { vider } = await imp('data/enregistreurs/file.js');
  await vider({ maintenant: T0 + 2 * HEURE, database });
  s.analyse.traces = traces(toutes().filter((r) => r.origin === 'analyse-avance'));

  // Correction du 17/11/2026 (« à vérifier » C3) : des CORNERS douteux seulement, sur un match neuf (Arsenal – Chelsea), par la
  // VRAIE règle du contrôle quotidien sur un état fabriqué : le moteur ne reçoit rien pour le 1 / N / 2 (le conseil reste),
  // le gel marque « a-verifier » les seules lignes de corners et de tirs, chacune par la famille de SON marché.
  const { preparerAVerifierParFamille, FAMILLE_DU_CONSEIL, familleDuMarche } = await imp('data/aVerifierPourLeMoteur.js');
  const { aVerifierDuMatch } = await imp('data/db/dailyChecks.js');
  const MC = SORTES.pinnacle(cal('EPL', 'Arsenal', 'Chelsea'));
  const idMC = idDe(MC);
  const etatCorners = { aVerifier: { clubs: { [idMC.homeId]: [{ id: 'essai:corners', controle: 'chiffres-equipe', texte: 'Statistiques impossibles : Arsenal – Spurs du 27/09 (fabriqué)', date: '2026-09-27', familles: ['corners', 'tirs'] }] }, ligues: {}, global: [] } };
  const parFamille = preparerAVerifierParFamille({ verifier: (x) => aVerifierDuMatch(etatCorners, x) });
  const idsMC = { league: MC.league, commenceTime: MC.commenceTime, ...idMC };
  const aVerifierMC = parFamille(idsMC, FAMILLE_DU_CONSEIL);
  const analyseMC = await analyzeMatch({ ...(await enrichMatchWithRealAverages(MC, { sansRepliPayant: true })), ...(aVerifierMC ? { aVerifier: aVerifierMC } : {}) }, enService, tilt, sport, { maintenant: T0 + 3 * HEURE });
  const enFileMC = gel.gelerAnalyse({ match: MC, engineResult: analyseMC, origine: gel.ORIGINES.coupDEnvoi, database, maintenant: T0 + 3 * HEURE, aVerifier: aVerifierMC, aVerifierParFamilleDe: parFamille });
  await vider({ maintenant: T0 + 3 * HEURE, database });
  const lignesMC = toutes().filter((r) => r.origin === 'analyse-coup-d-envoi' && r.home_name === 'Arsenal');
  const classesPar = (f) => [...new Set(lignesMC.filter((r) => familleDuMarche(r.market_id) === f).map((r) => r.classe_seuil))].sort();
  s.cornersDouteux = {
    ids: idMC,
    aVerifierDuConseil: aVerifierMC,
    action: analyseMC.staking.action,
    enFile: enFileMC,
    lignes: lignesMC.length,
    familles: [...new Set(lignesMC.map((r) => familleDuMarche(r.market_id)))].sort(),
    corners: classesPar('corners'),
    tirs: classesPar('tirs'),
    buts: classesPar('buts'),
    resultat: lignesMC.filter((r) => r.market_id === 'result').map((r) => ({ classe: r.classe_seuil, seuil: r.seuil_applique, confiance: r.confiance })),
    confiancesCorners: [...new Set(lignesMC.filter((r) => familleDuMarche(r.market_id) === 'corners').map((r) => r.confiance))]
  };
}

console.log(JSON.stringify({ ok: true, ...s }));
