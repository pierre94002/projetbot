/**
 * nuitDeLaCombinaison.js — LE CALCUL DE LA NUIT DE LA COMBINAISON, À BLANC (étape 38, lot 1b, 04/11/2026 ; conception §5.3-5.4).
 * -----------------------------------------------------------------------
 * Pour chaque révision gelée qui n'est pas encore rangée — celles d'engine_picks (le moteur en service : nuit, analyses
 * d'avance, analyses au coup d'envoi) et celles de la candidate en essai, lues PAR LE DÉPÔT des enregistreurs seulement
 * (pronosticsABlancParPages : seul le dépôt lit sa table) —, ce que la règle de confiance de la 38 en dit, à partir
 * d'ENTRÉES GELÉES SEULEMENT :
 *   - la ligne elle-même (source et heure des cotes, état de la compo, version du moteur) ;
 *   - les relevés payants archivés AU PLUS TARD à son `odds_at` (le palier n'a pas de colonne : reconstruit) ;
 *   - le contrôle « à vérifier » EN VIGUEUR à son `recorded_at` (celui de la veille, reçu de la passe ; sinon « inconnu ») ;
 *   - la case F de SA version (matchs datés au plus tard J − 2 : casesDeLaTranche.js) ;
 * et rien du magasin d'aujourd'hui. D'où : les ingrédients, les degrés, l'étiquette (« sur » / « fragile » : gardée pour la
 * preuve, JAMAIS envoyée à l'écran), « ce qui manque », la classe de seuil, le régime de l'ancre, P_M et P_comb = P_M (la
 * note du banc ne retient aucun β). Une révision rangée une nuit plus tard est donc exacte (`calcule_apres = 1`) ; une
 * révision gelée après le coup d'envoi est rangée, comptée et marquée (`apres_coup_d_envoi = 1` : jamais dans la preuve).
 * Les plus récentes d'abord, `limite` par nuit : les révisions du jour toujours, l'arriéré aux nuits suivantes.
 * Puis le CONTRÔLE ANTI-FUITE par un second chemin (controleDeLaCombinaison.js, 20 couples, graine = le jour).
 * Lit la base de l'appelant (jamais ouverte ici : combinaisonNuitEnfant.js l'ouvre en lecture seule) ; n'écrit rien ; ni
 * horloge (l'instant vient de la passe ; seules des durées), ni réseau, ni Claude ; jamais une clôture.
 * -----------------------------------------------------------------------
 */

import { pronosticsABlancParPages } from '../enregistreurs/depot.js';
import { aVerifierDuMatch, familleDuMarche } from '../db/dailyChecks.js';
import { ingredientsDe, palierDesReleves, sourceDe, origineDe, cleDeLaCaseF, caseFDe } from './ingredientsDUneLigne.js';
import { familleDe, degresDUneLigne, etiquetteDe, manquesDe } from './reglesDeConfiance.js';
import { classeDeSeuil } from './reglesDeSeuil.js';
import { VERSION_DE_LA_REGLE, REGLE_DE_CONFIANCE, NUIT } from './reglagesCombinaison.js';
import { COMBINAISON_AU_BANC } from './noteDeLaCombinaison.js';
import { pronosticsRegles, verdictsDesCases, dernierJourDesCases, dixiemeDe } from './casesDeLaTranche.js';
import { controlerLesPaliers } from './controleDeLaCombinaison.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const iso = (t) => new Date(t).toISOString();
const FORMAT_JOUR_PARIS = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' });
/** Le jour civil de Paris d'un instant (AAAA-MM-JJ). */
export const jourParis = (t) => FORMAT_JOUR_PARIS.format(new Date(t));

/** Les colonnes de combinaison_avant_match, dans l'ordre du DDL (matchStatsDb.js, COMBINAISON_DDL). */
export const COLONNES = Object.freeze([
  'source', 'candidate_id', 'fixture_key', 'market_key', 'revision', 'origin', 'recorded_at', 'calcule_le', 'calcule_apres', 'apres_coup_d_envoi',
  'regle_version', 'note_sha1', 'engine_version', 'engine_hash', 'league', 'date', 'kickoff', 'market_id', 'famille', 'choice', 'probability',
  'regime', 'palier', 'palier_reconstruit', 'p_marche', 'p_comb', 'odds_source', 'odds_at', 'age_min', 'avant_compo', 'lineup_state', 'lineup_at',
  'n_min', 'part_demarrage', 'releves_dom', 'releves_ext', 'regime_xg', 'a_verifier', 'controle_du', 'accord', 'tranche_case', 'tranche_verdict',
  'tranche_matchs', 'degres', 'etiquette', 'manques', 'classe_seuil'
]);

/** Au plus tant de révisions rangées par nuit (les plus récentes d'abord) : une nuit ordinaire en a 3 000 à 11 000 (R23). */
export const PLAFOND_PAR_NUIT = 60_000;
/** Les lignes d'un morceau envoyé par le processus à part. */
export const LIGNES_PAR_MORCEAU = 1000;

/** L'identité de la note recopiée (le sha1 de la sortie du banc dont elle vient), ou null avant le banc. */
export const NOTE_SHA1 = COMBINAISON_AU_BANC?.sortie?.sha1 ?? null;

const SELECTION_SERVICE = `fixture_key, market_key, version, recorded_at, origin, league, date, kickoff, home_id, away_id, market_id, choice, probability,
  odds_source, odds_at, lineup_state, lineup_at, engine_version, engine_hash`;

/** La table de la nuit existe-t-elle dans cette base ? (une base d'avant le lot 1a ne l'a pas : rien n'y est encore rangé). */
const tableExiste = (database, nom) => Boolean(database.prepare("SELECT 1 AS oui FROM sqlite_master WHERE type = 'table' AND name = ?").get(nom));

/**
 * LES RÉVISIONS À RANGER : celles du service (engine_picks) et de la candidate (par le dépôt), gelées au plus tard à
 * `calculeLe` et pas encore rangées, les plus récentes d'abord, `limite` au plus. Rend { lignes, restent }.
 */
export function revisionsARanger(database, { calculeLe, limite = PLAFOND_PAR_NUIT, candidats = [] }) {
  const avecTable = tableExiste(database, 'combinaison_avant_match');
  const pasRangee = avecTable
    ? `AND NOT EXISTS (SELECT 1 FROM combinaison_avant_match c WHERE c.source = 'service' AND c.candidate_id = '' AND c.fixture_key = p.fixture_key AND c.market_key = p.market_key AND c.revision = p.version)`
    : '';
  const total = Number(database.prepare(`SELECT COUNT(*) AS n FROM engine_picks p WHERE p.recorded_at <= ? ${pasRangee}`).get(calculeLe)?.n ?? 0);
  const service = database
    .prepare(`SELECT ${SELECTION_SERVICE} FROM engine_picks p WHERE p.recorded_at <= ? ${pasRangee} ORDER BY p.recorded_at DESC, p.fixture_key, p.market_key, p.version LIMIT ?`)
    .all(calculeLe, limite)
    .map((r) => ({ ...r, source: 'service', candidate_id: '', revision: r.version }));
  // La candidate en essai : lue PAR LE DÉPÔT (seul lecteur de sa table), jamais par une requête d'ici.
  const dejaCandidate = avecTable ? database.prepare(`SELECT 1 AS oui FROM combinaison_avant_match WHERE source = 'candidate' AND candidate_id = ? AND fixture_key = ? AND market_key = ? AND revision = ?`) : null;
  const candidate = [];
  for (const id of candidats ?? []) {
    if (!id) continue;
    const gen = pronosticsABlancParPages(id, { database });
    let r = gen.next();
    while (!r.done) r = gen.next();
    for (const l of r.value ?? []) {
      if (!(l.recordedAt <= calculeLe)) continue;
      if (dejaCandidate?.get(l.candidateId, l.fixtureKey, l.marketKey, l.revision)) continue;
      candidate.push({
        source: 'candidate',
        candidate_id: l.candidateId,
        fixture_key: l.fixtureKey,
        market_key: l.marketKey,
        revision: l.revision,
        recorded_at: l.recordedAt,
        // La candidate n'est calculée que par l'étape de nuit (moteurABlanc.js) : son origine est la nuit.
        origin: 'nuit',
        league: l.league,
        date: l.date,
        kickoff: l.kickoff,
        home_id: l.homeId,
        away_id: l.awayId,
        market_id: l.marketId,
        choice: l.choice,
        probability: l.probability,
        odds_source: l.oddsSource,
        odds_at: l.oddsAt,
        lineup_state: l.lineupState,
        lineup_at: null,
        engine_version: null,
        engine_hash: l.candidateHash
      });
    }
  }
  const toutes = [...service, ...candidate].sort((a, b) => (a.recorded_at > b.recorded_at ? -1 : a.recorded_at < b.recorded_at ? 1 : a.source < b.source ? 1 : a.source > b.source ? -1 : 0));
  return { lignes: toutes.slice(0, limite), restent: Math.max(0, total + candidate.length - Math.min(limite, toutes.length)) };
}

/**
 * LE CONTRÔLE « À VÉRIFIER » EN VIGUEUR à `recorded_at` : le dernier contrôle quotidien (celui de la veille, reçu de la
 * passe) n'est en vigueur que s'il a été écrit AVANT la révision ; sinon « inconnu » (compté). Rend { etat, du,
 * constats: [{ id, classe }] } — etat : 'rien', 'constat-rouge' (un constat rouge sur un des deux clubs dans les 60 jours,
 * sur le championnat ou général, pour la famille du marché), 'fotmob-en-panne', 'constat-orange' (gardé, degré 0) ou 'inconnu'.
 */
export function controleEnVigueur(controle, ligne, classeDe = null) {
  if (!controle?.le || !controle?.aVerifier || !ligne?.recorded_at || !(controle.le <= ligne.recorded_at)) return { etat: 'inconnu', du: null, constats: [] };
  const r = aVerifierDuMatch(
    { aVerifier: controle.aVerifier },
    { league: ligne.league ?? null, date: ligne.date ?? null, homeId: ligne.home_id ?? null, awayId: ligne.away_id ?? null, famille: familleDuMarche(ligne.market_id), fotmob: null }
  );
  if (!r) return { etat: 'rien', du: controle.le, constats: [] };
  const classes = classeDe ?? indexDesClasses(controle.aVerifier);
  const constats = r.raisons.map((x) => ({ id: x.id, classe: classes.get(x.id) ?? null, controle: x.controle ?? null }));
  const etat = constats.some((c) => c.classe === 'rouge') ? 'constat-rouge' : constats.some((c) => c.controle === 'source-fotmob') ? 'fotmob-en-panne' : 'constat-orange';
  return { etat, du: controle.le, constats: constats.map(({ id, classe }) => ({ id, classe })) };
}

/** La classe (rouge / orange) de chaque constat de l'index « à vérifier » du contrôle. */
export function indexDesClasses(aVerifier) {
  const m = new Map();
  for (const liste of [...Object.values(aVerifier?.clubs ?? {}), ...Object.values(aVerifier?.ligues ?? {}), aVerifier?.global ?? []]) for (const c of liste ?? []) if (c?.id) m.set(c.id, c.classe ?? null);
  return m;
}

/**
 * Le régime de l'ancre du match : r1 Pinnacle, r2 palier 2 ou 3, r3 repli, sans-cote ; r5 une ancre payante relevée AVANT la
 * publication de la compo (la compo PUBLIÉE, son heure après celle des cotes — conception §1.2 ; « pas encore publiée » n'a
 * pas d'heure de publication).
 */
export function regimeDe(ancre, { oddsAt = null, lineupAt = null, compoPubliee = false } = {}) {
  const payante = ancre === 'pinnacle' || ancre === 'palier2' || ancre === 'palier3';
  if (payante && compoPubliee && oddsAt && lineupAt && oddsAt < lineupAt) return 'r5';
  if (ancre === 'pinnacle') return 'r1';
  if (payante) return 'r2';
  if (ancre === 'repli') return 'r3';
  return 'sans-cote';
}

/**
 * L'ANCRE D'UNE LIGNE SELON SA FAMILLE (conception §2.1, A) : le 1N2 garde l'ancre de ses cotes (palier reconstruit, repli,
 * sans cote) ; les buts (et les joueurs, qui en héritent) du SERVICE viennent de l'ancien modèle (« buts-service », 2) ;
 * ceux de la candidate sont calés sur la cote 1N2 quand il y en a une (« buts-1n2 », 1 — la distribution gelée ne dit pas
 * si le plus/moins 2,5 était relevé), sinon sur les seules statistiques (« buts-stats-seules », 2) ; corners, tirs et tirs
 * cadrés n'ont un pronostic qu'avec au moins 6 relevés de chaque côté (« corners-releves », 0).
 */
export function ancreDeLaFamille(famille, { source, ancreDuMatch, sourceDesCotes }) {
  if (famille === 'buts' || famille === 'joueurs') {
    if (source === 'service') return 'buts-service';
    return sourceDesCotes === 'sans-cote' ? 'buts-stats-seules' : 'buts-1n2';
  }
  if (famille === 'corners' || famille === 'tirs' || famille === 'cadres') return 'corners-releves';
  return ancreDuMatch;
}

/**
 * UNE LIGNE DE LA NUIT (pure, entrées gelées) : `ligne` (forme d'engine_picks, `source` 'service' ou 'candidate'),
 * `releves` (les relevés payants de la rencontre), `controle` ({ etat, du, constats } en vigueur), `caseF` ({ verdict,
 * matchs, cle } ou null), `calculeLe` (l'instant de la nuit), `fuite` (essais : la coupure à odds_at oubliée).
 * Rend la ligne de combinaison_avant_match (COLONNES) et, à part, le palier de la nuit (pour le contrôle).
 */
export function ligneDeLaNuit({ ligne, releves = [], controle = null, caseF = null, calculeLe, fuite = false }) {
  const famille = familleDe(ligne.market_id);
  const lueSansCoupure = fuite ? { ...ligne, odds_at: '9999-12-31T23:59:59.999Z' } : ligne;
  // Les ingrédients du 1N2 (l'ancre des cotes du match, le palier reconstruit) — le seul calcul du palier (T-F2, T-F10).
  const base = ingredientsDe({ ligne: lueSansCoupure, releves, controle: controle ? { etat: controle.etat, du: controle.du, constats: controle.constats } : null, caseF: caseF?.verdict ?? null, resume: null });
  // Le palier de la nuit, tel que les ingrédients l'ont reconstruit (un seul calcul : celui que le contrôle recompte).
  const palier = base.source === 'odds-api' ? { ancre: base.ancre, basis: base.ancreDetail?.basis ?? null, probabilites: base.probabilitesDuPalier ?? null } : null;
  const ancre = ancreDeLaFamille(famille, { source: ligne.source, ancreDuMatch: base.ancre, sourceDesCotes: base.source });
  const ingredients = {
    ...base,
    origine: origineDe(ligne.origin),
    // B (la fraîcheur, une explication) : l'âge des cotes au gel — aucune pour un pronostic sans cote.
    fraicheur: base.source !== 'sans-cote' && ligne.odds_at && ligne.recorded_at && fini(Date.parse(ligne.odds_at)) && fini(Date.parse(ligne.recorded_at)) ? { ageMinutes: (Date.parse(ligne.recorded_at) - Date.parse(ligne.odds_at)) / 60000, releveA: ligne.odds_at, source: 'heure du relevé des cotes' } : null,
    ancre,
    ancreSurUnPrix: famille === '1n2' ? base.ancreSurUnPrix : false,
    ancreDetail: famille === '1n2' ? base.ancreDetail : { ...base.ancreDetail, lignes: null, basis: null },
    service: ligne.source === 'service',
    accord: famille === '1n2' ? base.accord : null
  };
  const degres = degresDUneLigne(ingredients, famille);
  const etiquette = etiquetteDe(degres);
  const manques = manquesDe(degres, ingredients);
  const classe = classeDeSeuil({ ancre: famille === '1n2' ? base.ancre : 'sans-cote', accord: famille === '1n2' ? base.accord : null, aVerifier: { etat: controle?.etat ?? 'inconnu' }, livre: null });
  const pM = famille === '1n2' && ['pinnacle', 'palier2', 'palier3', 'repli'].includes(base.ancre) && fini(ligne.probability) ? ligne.probability : null;
  const age = ingredients.fraicheur ? Math.round(ingredients.fraicheur.ageMinutes) : null;
  const ko = Date.parse(ligne.kickoff ?? '');
  const apres = fini(ko) ? Date.parse(ligne.recorded_at) > ko : String(ligne.recorded_at ?? '').slice(0, 10) > String(ligne.date ?? '');
  const sortie = {
    source: ligne.source,
    candidate_id: ligne.candidate_id ?? '',
    fixture_key: ligne.fixture_key,
    market_key: ligne.market_key,
    revision: ligne.revision,
    origin: ligne.origin ?? 'inconnue',
    recorded_at: ligne.recorded_at,
    calcule_le: calculeLe,
    calcule_apres: jourParis(Date.parse(ligne.recorded_at)) < jourParis(Date.parse(calculeLe)) ? 1 : 0,
    apres_coup_d_envoi: apres ? 1 : 0,
    regle_version: VERSION_DE_LA_REGLE,
    note_sha1: NOTE_SHA1,
    engine_version: Number.isInteger(ligne.engine_version) ? ligne.engine_version : null,
    engine_hash: ligne.engine_hash ?? null,
    league: ligne.league ?? null,
    date: ligne.date,
    kickoff: ligne.kickoff ?? null,
    market_id: ligne.market_id,
    famille: famille ?? 'inconnue',
    choice: ligne.choice ?? null,
    probability: fini(ligne.probability) ? ligne.probability : null,
    regime: regimeDe(base.ancre, { oddsAt: ligne.odds_at, lineupAt: ligne.lineup_at, compoPubliee: base.compo === 'publiee' }),
    palier: palier?.basis ?? null,
    palier_reconstruit: 1,
    p_marche: pM,
    p_comb: pM,
    odds_source: ligne.odds_source ?? null,
    odds_at: ligne.odds_at ?? null,
    age_min: age,
    avant_compo: base.compo === 'publiee' && ligne.odds_at && ligne.lineup_at ? (ligne.odds_at < ligne.lineup_at ? 1 : 0) : null,
    lineup_state: ligne.lineup_state ?? null,
    lineup_at: ligne.lineup_at ?? null,
    // Couverture des statistiques et accord des buts : pas gardés dans les pronostics gelés (limite 4 de la note) — inconnus.
    n_min: null,
    part_demarrage: null,
    releves_dom: null,
    releves_ext: null,
    regime_xg: null,
    a_verifier: controle && controle.etat !== 'inconnu' ? JSON.stringify(controle.constats ?? []) : 'inconnu',
    controle_du: controle?.du ?? null,
    accord: fini(ingredients.accord) ? ingredients.accord : null,
    tranche_case: caseF?.cle ?? null,
    tranche_verdict: caseF?.verdict ?? null,
    tranche_matchs: fini(caseF?.matchs) ? caseF.matchs : null,
    degres: JSON.stringify(degres),
    etiquette,
    manques: JSON.stringify(manques),
    classe_seuil: JSON.stringify(classe)
  };
  return { sortie, palier };
}

/**
 * LA NUIT ENTIÈRE (le processus à part l'appelle ; un essai peut l'appeler ici) : les révisions à ranger, leurs lignes, le
 * contrôle anti-fuite. `envoyer(lignes)` reçoit les morceaux ; rend { bilan, controle }. `controle` : le contrôle
 * quotidien en vigueur reçu de la passe ({ le, aVerifier }) ou null ; `candidats` : les identifiants des candidates en
 * essai ; `graine` : celle du contrôle (le jour) ; `fuite` : essais (la coupure à odds_at oubliée par la nuit).
 */
export function calculerLaNuitDeLaCombinaison({ database, instant, graine, couples = NUIT.couples, fuite = false, limite = PLAFOND_PAR_NUIT, controle = null, candidats = [], envoyer = () => {}, lignesParMorceau = LIGNES_PAR_MORCEAU }) {
  if (!fini(instant)) throw new Error('combinaison à blanc : l’instant de la passe est obligatoire — jamais l’horloge lue ici.');
  const t0 = performance.now();
  const calculeLe = iso(instant);
  const { lignes: aRanger, restent } = revisionsARanger(database, { calculeLe, limite, candidats });
  const t1 = performance.now();
  // Les cases F : les jours demandés (J − 2 du gel de chaque révision du SERVICE dont la famille lit F).
  const lisentF = new Set(Object.entries(REGLE_DE_CONFIANCE.lectures).filter(([, l]) => l.includes('F')).map(([f]) => f));
  const besoins = [];
  const caseDe = new Map();
  for (const l of aRanger) {
    if (l.source !== 'service' || !Number.isInteger(l.engine_version) || !lisentF.has(familleDe(l.market_id))) continue;
    const d = dixiemeDe(l.probability);
    const jusquA = dernierJourDesCases(l.recorded_at);
    if (d === null || !jusquA) continue;
    const cle = cleDeLaCaseF({ engineVersion: l.engine_version, marketId: l.market_id, dixieme: d });
    besoins.push({ jusquA, cle });
    caseDe.set(l, { jusquA, cle });
  }
  let reglesF = { lignes: [], bilan: { revisions: 0, pronostics: 0, regles: 0, ecartes: {} } };
  let verdicts = new Map();
  if (besoins.length) {
    const jusquAMax = besoins.reduce((m, b) => (b.jusquA > m ? b.jusquA : m), besoins[0].jusquA);
    const du = database.prepare('SELECT MIN(date) AS d FROM engine_picks').get()?.d ?? null;
    reglesF = pronosticsRegles(database, { du, au: jusquAMax });
    verdicts = verdictsDesCases(reglesF.lignes, besoins);
  }
  const t2 = performance.now();
  // Les relevés payants d'une rencontre (identifiants FotMob + jour), lus une fois par rencontre.
  const evenements = database.prepare(`SELECT id FROM odds_events WHERE source = 'odds-api' AND home_id = ? AND away_id = ? AND date = ?`);
  const relevesDe = database.prepare(`SELECT bookmaker, selection, releve_at, price FROM odds_quotes WHERE event_id = ? AND market = '1x2' AND kind = 'snapshot'`);
  const cacheReleves = new Map();
  const releves = (homeId, awayId, date) => {
    const k = `${homeId}|${awayId}|${date}`;
    if (!cacheReleves.has(k)) cacheReleves.set(k, homeId && awayId ? evenements.all(homeId, awayId, date).flatMap((e) => relevesDe.all(e.id)) : []);
    return cacheReleves.get(k);
  };
  const classes = controle?.aVerifier ? indexDesClasses(controle.aVerifier) : new Map();
  const bilan = {
    lues: aRanger.length,
    restent,
    parSource: {},
    parFamille: {},
    parEtiquette: {},
    parOrigine: {},
    parRegime: {},
    calculeApres: 0,
    apresCoupDEnvoi: 0,
    controleInconnu: 0,
    casesF: { reglees: reglesF.bilan.regles, jours: new Set(besoins.map((b) => b.jusquA)).size, nonTropPeu: 0 }
  };
  const compter = (o, k) => {
    o[k] = (o[k] ?? 0) + 1;
  };
  let morceau = [];
  const poolControle = [];
  const palierDeLaNuit = new Map();
  for (const l of aRanger) {
    const sourceCotes = sourceDe(l.odds_source);
    const rel = sourceCotes === 'odds-api' ? releves(l.home_id, l.away_id, l.date) : [];
    const ctrl = controleEnVigueur(controle, l, classes);
    const c = caseDe.get(l);
    const v = c ? verdicts.get(`${c.jusquA}#${c.cle}`) ?? null : null;
    const caseF = c && v ? { cle: c.cle, verdict: v.verdict, matchs: v.matchs } : null;
    const { sortie, palier } = ligneDeLaNuit({ ligne: l, releves: rel, controle: ctrl, caseF, calculeLe, fuite });
    compter(bilan.parSource, sortie.source);
    compter(bilan.parFamille, sortie.famille);
    compter(bilan.parEtiquette, sortie.etiquette);
    compter(bilan.parOrigine, sortie.origin);
    compter(bilan.parRegime, sortie.regime);
    if (sortie.calcule_apres) bilan.calculeApres++;
    if (sortie.apres_coup_d_envoi) bilan.apresCoupDEnvoi++;
    if (ctrl.etat === 'inconnu') bilan.controleInconnu++;
    if (caseF && caseF.verdict !== 'trop-peu') bilan.casesF.nonTropPeu++;
    if (sortie.famille === '1n2' && palier && l.odds_at) {
      const couple = { cle: l.fixture_key, homeId: l.home_id, awayId: l.away_id, date: l.date, oddsAt: l.odds_at };
      poolControle.push(couple);
      palierDeLaNuit.set(`${couple.homeId}|${couple.awayId}|${couple.date}|${couple.oddsAt}`, palier);
    }
    morceau.push(sortie);
    if (morceau.length >= lignesParMorceau) {
      envoyer(morceau);
      morceau = [];
    }
  }
  if (morceau.length) envoyer(morceau);
  const t3 = performance.now();
  // Le contrôle anti-fuite : les couples de la nuit, complétés par d'autres pronostics 1N2 payants gelés si la nuit en a peu.
  if (poolControle.length < couples) {
    for (const r of database
      .prepare(`SELECT DISTINCT fixture_key, home_id, away_id, date, odds_at FROM engine_picks WHERE market_id = 'result' AND odds_source LIKE 'The Odds API%' AND odds_at IS NOT NULL AND recorded_at <= ? ORDER BY fixture_key, odds_at`)
      .iterate(calculeLe)) {
      poolControle.push({ cle: r.fixture_key, homeId: r.home_id, awayId: r.away_id, date: r.date, oddsAt: r.odds_at });
    }
  }
  const principal = (c) => {
    const deja = palierDeLaNuit.get(`${c.homeId}|${c.awayId}|${c.date}|${c.oddsAt}`);
    if (deja) return deja;
    const p = palierDesReleves(releves(c.homeId, c.awayId, c.date), fuite ? '9999-12-31T23:59:59.999Z' : c.oddsAt);
    return { ancre: p.ancre, basis: p.basis, probabilites: p.probabilites };
  };
  const ctl = controlerLesPaliers(database, { pool: poolControle, principal, graine, couples });
  const t4 = performance.now();
  return {
    bilan: { ...bilan, durees: { revisions: Math.round(t1 - t0), casesF: Math.round(t2 - t1), lignes: Math.round(t3 - t2), controle: Math.round(t4 - t3) } },
    controle: { lignes: ctl.lignes, couples: ctl.couples, ecarts: ctl.ecarts }
  };
}

export const __pourLesTests = { tableExiste, caseFDe };
