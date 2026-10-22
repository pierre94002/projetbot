/**
 * bettingMapCalcul.js — le CALCUL de la carte « où parier » (étape 23 du plan, 22/10/2026).
 * -----------------------------------------------------------------------
 * Assemble des mesures déjà faites, sans rien rejouer :
 *   - le dernier rejeu du banc d'essai (étape 19) du moteur en service :
 *     sa carte (resume.carte) a déjà été jugée par le juge de l'étape 16
 *     avec K' = toutes ses cases ; on la relit (P2 = la preuve, jamais vue ;
 *     P3 = indicatif ; face au repère = information) ;
 *   - la valeur de clôture des pronostics GELÉS du moteur (engine_picks,
 *     première valeur), mesurée comme la calibration (étape 20 :
 *     closingValue.mesurerUneEntree), depuis la dernière adoption ;
 *   - vos vrais paris (étape 11) : pour information, jamais une couleur ;
 *   - le meilleur moment pour parier (étape 22) : pour information.
 *
 * LE JUGE (étape 16, `comparer`, jamais recodé) — pour la mesure en direct :
 * une ligne par pronostic { bloc: le match, a: 0, b: valeur de clôture },
 * sens « max », minBlocs 200 (jamais baissé), tirages 1 000, graine fixe,
 * alpha 5 %, et `variantes` = Kv × R : Kv = le nombre de cases qui ont au
 * moins une mesure (montrées ou non), compté AVANT le premier verdict ;
 * R = max(24, regards) — chaque carte REGARDE à nouveau les mêmes données
 * grossies : 24 regards prévus d'avance (deux ans), le juge est 24 fois plus
 * sévère à chacun, la somme des erreurs reste sous 5 %.
 *
 * Écartés ET comptés (jamais en silence) : les pronostics d'avant le
 * lancement (24/09/2026) ou d'avant la dernière adoption qui touche leur
 * famille de marchés, ceux d'une fenêtre « déjà vue », sans identifiant de
 * club, et les mesures « à l'ouverture » (le prix du moment du gel est
 * inconnu : pour le 1N2, le moteur suit la cote, et un mouvement d'avant le
 * gel lui serait crédité).
 *
 * Le calcul tourne dans un PROCESSUS À PART (bettingMapEnfant.js), base en
 * lecture seule, sous le jeton du calcul lourd ; le serveur range la carte.
 * -----------------------------------------------------------------------
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { comparer } from '../bench/guard.js';
import { valeurCloture } from '../bench/metrics.js';
import { fenetresDeclarees } from '../bench/lancements.js';
import { PERIODES } from '../bench/periodes.js';
import { lireRejeu } from '../bench/depotBanc.js';
import { DIVISIONS } from './providers/footballDataHistory.js';
import { contexteDeMesure, mesurerUneEntree, entreesDesParis } from './closingValue.js';
import { listBets } from './repositories/betsRepository.js';
import { commencerCalculLourd } from '../utils/calculLourd.js';
import {
  COLONNES,
  COLONNES_AVEC_COTE,
  MIN_MATCHS,
  VERSION_CARTE,
  RAISONS,
  colonneDuBanc,
  colonneDuPronostic,
  couleurDeLaCase,
  phraseDeLaCase,
  rejeuDeLaCarte,
  rejeuxUtilesALaCarte,
  cartesDepuis,
  moisDeParis,
  debutDuMois,
  apresLe1erA6h
} from './bettingMap.js';

const ENFANT = fileURLToPath(new URL('./bettingMapEnfant.js', import.meta.url));

/** Le juge de l'étape 16, tel quel (ses valeurs par défaut) ; seule la graine est fixée, pour qu'une carte se rejoue. */
export const JUGE = Object.freeze({ minBlocs: MIN_MATCHS, alpha: 0.05, tirages: 1000, graine: 23 });
/** Les regards prévus d'avance sur la mesure en direct (deux ans de cartes mensuelles). */
export const REGARDS_PREVUS = 24;
/** Le début de la preuve neuve (P5 du banc : depuis le lancement, 24/09/2026). */
export const DEBUT_DU_DIRECT = PERIODES.P5.de;
/** Les familles de la mesure en direct (les seules à cotes de clôture gratuites). */
export const FAMILLES_EN_DIRECT = Object.freeze(['result', 'totalGoals', 'bothTeamsScore']);
/** La période P2 dite à l'écran. */
const P2 = `${PERIODES.P2.de.slice(0, 4)}-${PERIODES.P2.a.slice(0, 4)}`;
const P3 = `${PERIODES.P3.de.slice(0, 4)}-${PERIODES.P3.a.slice(0, 4)}`;
export const DELAI_CALCUL_MS = 10 * 60_000;

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const familleDe = (colonne) => String(colonne).split(':')[0];
const compter = (o, k, n = 1) => {
  o[k] = (o[k] ?? 0) + n;
};
const jourDit = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// ------------------------------------------------------------ la fenêtre du direct

/**
 * Le début de la mesure en direct, famille par famille (ISO) : le lancement (24/09/2026), puis chaque ADOPTION
 * (journal des versions, action « adoption ») repart à zéro pour les familles que la candidate change (ses
 * `marches` ; toutes si elle ne les dit pas), et chaque RETOUR ARRIÈRE pour toutes. Pur. `brut` : le registre
 * des versions (engine-versions.json), ou null.
 */
export function fenetreDuDirect(brut) {
  const parFamille = Object.fromEntries(FAMILLES_EN_DIRECT.map((f) => [f, `${DEBUT_DU_DIRECT}T00:00:00.000Z`]));
  const evenements = [];
  const passees = Array.isArray(brut?.candidatesPassees) ? brut.candidatesPassees : [];
  for (const e of Array.isArray(brut?.journal) ? brut.journal : []) {
    if (typeof e?.le !== 'string') continue;
    let familles = null;
    if (e.action === 'adoption') {
      const c = passees.find((x) => x?.id === e.candidate && x?.fin === 'adoptee');
      familles = Array.isArray(c?.marches) && c.marches.length ? FAMILLES_EN_DIRECT.filter((f) => c.marches.includes(f)) : [...FAMILLES_EN_DIRECT];
    } else if (e.action === 'retour') familles = [...FAMILLES_EN_DIRECT];
    if (!familles) continue;
    for (const f of familles) if (e.le > parFamille[f]) parFamille[f] = e.le;
    evenements.push({ le: e.le, action: e.action, version: e.version ?? null, familles });
  }
  return { debut: DEBUT_DU_DIRECT, parFamille, evenements };
}

// ------------------------------------------------------------ le banc d'essai

/**
 * Ce que la carte relit d'un résumé du banc (resume.carte) : par « championnat|colonne », ses épreuves (H-PL : P2
 * face au marché ; H-VC : P2 paris simulés) et ses informations (P2 face au repère, P3 indicatif, paris
 * indicatifs). Pur. Rend { cases: Map, kBanc, employees }.
 */
export function lectureDuBanc(resume, { rejeuId = null } = {}) {
  const cases = new Map();
  const de = (league, colonne) => {
    const cle = `${league}|${colonne}`;
    if (!cases.has(cle)) cases.set(cle, { league, colonne, epreuves: [], infos: {} });
    return cases.get(cle);
  };
  const source = rejeuId !== null ? `banc d’essai, rejeu n° ${rejeuId}` : 'banc d’essai';
  let employees = 0;
  for (const c of Array.isArray(resume?.carte) ? resume.carte : []) {
    const j = c?.juge;
    if (!j || typeof c.league !== 'string') continue;
    if (c.type === 'probabilites') {
      const colonne = colonneDuBanc(c.marketKey, c.ligne);
      if (!colonne) continue;
      const k = de(c.league, colonne);
      if (c.tranche === 'P2' && c.face === 'marche') {
        employees++;
        k.epreuves.push({ id: 'H-PL', verdict: j.verdict, matchs: j.n?.matchs ?? c.n, blocs: j.n?.blocs ?? c.n, gain: j.gain, enPourcent: j.enPourcent, variantes: j.variantes, periode: P2, source });
      } else if (c.tranche === 'P2' && c.face === 'repere') {
        const r = (k.infos.repere ??= { cases: 0, retenu: 0, moinsBon: 0, periode: P2 });
        r.cases++;
        if (j.verdict === 'retenu') r.retenu++;
        if (j.verdict === 'moins-bon') r.moinsBon++;
      } else if (c.tranche === 'P3' && c.face === 'marche') {
        k.infos.indicatif = { quoi: 'probabilités face au marché', verdict: j.verdict, matchs: j.n?.matchs ?? c.n, enPourcent: j.enPourcent, periode: P3 };
      }
    } else if (c.type === 'paris' && c.marketKey === 'result') {
      const k = de(c.league, 'result');
      if (c.zone === 'preuve') {
        employees++;
        k.epreuves.push({ id: 'H-VC', verdict: j.verdict, matchs: j.n?.matchs ?? c.n, blocs: j.n?.blocs ?? c.n, gain: j.gain, enPourcent: j.enPourcent, variantes: j.variantes, periode: c.periode ?? P2, source });
      } else if (c.zone === 'indicatif') {
        k.infos.parisIndicatifs = { verdict: j.verdict, matchs: j.n?.matchs ?? c.n, enPourcent: j.enPourcent, periode: c.periode ?? P3 };
      }
    }
  }
  const kBanc = Number.isInteger(resume?.juge?.variantesCarte) ? resume.juge.variantesCarte : null;
  return { cases, kBanc, employees };
}

// ------------------------------------------------------------ la mesure en direct

const SELECTION = `SELECT fixture_key AS fixtureKey, recorded_at AS recordedAt, league, date, kickoff, home_name AS homeName, away_name AS awayName,
  home_id AS homeId, away_id AS awayId, market_id AS marketId, params, choice
  FROM engine_picks WHERE version = 1 AND market_id IN ('result', 'totalGoals', 'bothTeamsScore') ORDER BY date, fixture_key, market_key`;

/**
 * Les lignes de la mesure en direct, par « championnat|colonne » : la valeur de clôture de la PREMIÈRE valeur de
 * chaque pronostic gelé, dans la fenêtre de sa famille. Rend { parCase: Map(cle → [{ bloc, match, date, a, b }]),
 * pronostics, mesures, ecartees: { raison: n }, ligues: Set }. `mesurer` : la mesure d'une entrée (closingValue).
 */
export function lignesDuDirect({ database, fenetre, mesurer = null, vues = fenetresDeclarees({ portee: 'moteur' }) }) {
  const ctx = mesurer ? null : contexteDeMesure(database);
  const mesure = mesurer ?? ((e) => mesurerUneEntree(e, ctx));
  const parCase = new Map();
  const ecartees = {};
  const ligues = new Set();
  let pronostics = 0;
  let mesures = 0;
  let lus = [];
  try {
    lus = database.prepare(SELECTION).all();
  } catch (error) {
    if (!/no such table/i.test(String(error?.message))) throw error;
  }
  for (const p of lus) {
    const colonne = colonneDuPronostic(p.marketId, p.params);
    if (!colonne || !p.league) {
      compter(ecartees, 'horsCarte');
      continue;
    }
    pronostics++;
    ligues.add(p.league);
    const debut = fenetre.parFamille[familleDe(colonne)] ?? `${DEBUT_DU_DIRECT}T00:00:00.000Z`;
    if (p.date < DEBUT_DU_DIRECT || String(p.recordedAt ?? '') < debut) {
      compter(ecartees, 'avantLaFenetre');
      continue;
    }
    if (vues.some((f) => p.date >= f.de && p.date <= f.a)) {
      compter(ecartees, 'dejaVu');
      continue;
    }
    if (!p.homeId || !p.awayId) {
      compter(ecartees, 'sansIdentifiant');
      continue;
    }
    let params = {};
    try {
      params = JSON.parse(p.params ?? '{}') ?? {};
    } catch {
      params = {};
    }
    const r = mesure({
      marketId: p.marketId,
      params,
      predictedOutcome: p.choice,
      homeName: p.homeName,
      awayName: p.awayName,
      league: p.league,
      commenceTime: p.kickoff ?? null,
      pickAt: p.recordedAt,
      day: p.date,
      idsDuMagasin: { home: p.homeId, away: p.awayId }
    });
    if (r?.raison) {
      compter(ecartees, r.raison);
      continue;
    }
    if (r?.approx) {
      compter(ecartees, 'aLOuverture');
      continue;
    }
    if (!(r?.pickProb > 0 && r.pickProb < 1 && r.closeProb > 0 && r.closeProb < 1)) {
      compter(ecartees, 'marcheAbsent');
      continue;
    }
    mesures++;
    const cle = `${p.league}|${colonne}`;
    if (!parCase.has(cle)) parCase.set(cle, []);
    parCase.get(cle).push({ bloc: p.fixtureKey, match: p.fixtureKey, date: p.date, a: 0, b: valeurCloture({ cotePrise: 1 / r.pickProb, probaCloture: r.closeProb }) });
  }
  return { parCase, pronostics, mesures, ecartees, ligues };
}

/**
 * L'épreuve « V-VC » d'une case : le juge de l'étape 16 (comparer), variantes = Kv × R. `juge` : la fonction du
 * juge (les essais y mettent un espion). Rend l'épreuve.
 */
export function epreuveDuDirect(lignes, { variantes, debut, juge = comparer }) {
  const j = juge(lignes, { mode: 'moyenne', sens: 'max', variantes, minBlocs: JUGE.minBlocs, alpha: JUGE.alpha, tirages: JUGE.tirages, graine: JUGE.graine });
  return {
    id: 'V-VC',
    verdict: j.verdict,
    matchs: j.n.matchs,
    blocs: j.n.blocs,
    gain: j.gain,
    enPourcent: { gain: fini(j.gain) ? j.gain * 100 : null, fourchette: j.fourchette ? j.fourchette.map((x) => x * 100) : null, quoi: 'de valeur de clôture en plus' },
    variantes,
    periode: `depuis le ${jourDit(debut)}`,
    source: 'pronostics gelés du moteur (première valeur), cotes gratuites archivées'
  };
}

// ------------------------------------------------------------ les informations

/** Vos vrais paris (simples), par « championnat|colonne » : nombre, valeur de clôture moyenne, rendement à mise fixe. Pour information. */
export function vosParisParCase({ bets, mesurer }) {
  const parCase = new Map();
  for (const e of entreesDesParis(bets ?? [])) {
    if (e.legsCount !== 1) continue;
    const colonne = colonneDuPronostic(e.marketId, e.params);
    if (!colonne || !e.league) continue;
    const cle = `${e.league}|${colonne}`;
    const x = parCase.get(cle) ?? { paris: 0, regles: 0, gain: 0, mesures: 0, sommeVc: 0 };
    parCase.set(cle, x);
    x.paris++;
    const cote = Number(e.oddsTaken);
    if (e.status === 'won' && cote > 1) {
      x.regles++;
      x.gain += cote - 1;
    } else if (e.status === 'lost') {
      x.regles++;
      x.gain -= 1;
    } else if (e.status === 'void') x.regles++;
    if (COLONNES_AVEC_COTE.has(colonne) && cote > 1 && mesurer) {
      const r = mesurer(e);
      if (!r?.raison && r?.closeProb > 0 && r.closeProb < 1) {
        x.mesures++;
        x.sommeVc += valeurCloture({ cotePrise: cote, probaCloture: r.closeProb });
      }
    }
  }
  const sortie = new Map();
  for (const [cle, x] of parCase) {
    sortie.set(cle, { paris: x.paris, regles: x.regles, rendement: x.regles ? (100 * x.gain) / x.regles : null, mesures: x.mesures, valeurCloture: x.mesures ? (100 * x.sommeVc) / x.mesures : null, quoi: 'pour information : vos paris ne décident jamais de la couleur' });
  }
  return sortie;
}

/** Le meilleur moment pour parier, par championnat (étape 22, dernier calcul fini) : Map(league → phrase). */
export function momentsDuMarche(database) {
  const sortie = new Map();
  try {
    const calcul = database.prepare('SELECT MAX(id) AS id FROM market_knowledge_runs WHERE fini_le IS NOT NULL').get()?.id;
    if (!calcul) return sortie;
    for (const r of database.prepare("SELECT portee, detail FROM market_knowledge WHERE calcul = ? AND mesure = 'moment' AND cle = 'conclusion'").all(calcul)) {
      let d = null;
      try {
        d = JSON.parse(r.detail);
      } catch {
        d = null;
      }
      if (d?.phrase) sortie.set(r.portee, d.phrase);
    }
  } catch {
    // tables absentes : aucun moment connu
  }
  return sortie;
}

// ------------------------------------------------------------ la carte

/** Le nom d'un championnat : celui du magasin, ou, pour un championnat de football-data hors de l'appli (« fd:EC »), son nom en clair. */
export function nomDuChampionnat(league) {
  if (league.startsWith('fd:')) return DIVISIONS[league.slice(3)]?.nom ?? league.slice(3);
  return league;
}

/**
 * LA CARTE, assemblée (pure, à part le juge qu'on lui passe) : `banc` (lectureDuBanc, ou null), `rejeu` (le rejeu
 * lu, ou null), `direct` (lignesDuDirect), `regards` ({ famille: cartes déjà calculées dans sa fenêtre }),
 * `fenetre`, `vosParis` (Map), `moments` (Map), `moteur`, `maintenant`, `raison`.
 */
export function construireLaCarte({ banc = null, rejeu = null, direct, regards = {}, fenetre, vosParis = new Map(), moments = new Map(), moteur, maintenant = Date.now(), raison = 'mensuelle', juge = comparer }) {
  // 1. Le banc : ses verdicts ne valent que si son K' couvre les cases que la carte emploie (sinon « banc à relancer »).
  const bancValable = Boolean(banc) && Number.isInteger(banc.kBanc) && banc.kBanc >= banc.employees;
  // 2. K du direct : les cases qui ont au moins une mesure, comptées AVANT le premier verdict.
  const kVivant = direct.parCase.size;
  const regardsDe = (famille) => Math.max(REGARDS_PREVUS, (regards[famille] ?? 0) + 1);
  // 3. Les championnats : ceux du banc, du direct (même sans mesure) et de vos paris.
  const ligues = new Set([...direct.ligues, ...[...direct.parCase.keys()].map((k) => k.split('|')[0])]);
  if (banc) for (const k of banc.cases.values()) ligues.add(k.league);
  for (const cle of vosParis.keys()) ligues.add(cle.split('|')[0]);
  const championnats = [...ligues].sort((a, b) => nomDuChampionnat(a).localeCompare(nomDuChampionnat(b), 'fr')).map((league) => ({ league, nom: nomDuChampionnat(league), horsAppli: league.startsWith('fd:'), moment: moments.get(league) ?? null }));

  const cases = [];
  const parRaison = {};
  let plusGrosse = null;
  for (const ch of championnats) {
    for (const col of COLONNES) {
      const cle = `${ch.league}|${col.id}`;
      const lu = banc?.cases.get(cle) ?? null;
      const epreuves = [];
      if (lu) {
        for (const e of lu.epreuves) epreuves.push(bancValable ? { ...e, ...(rejeu?.etiquette === 'code-precedent' ? { etiquette: 'code-precedent' } : {}) } : { ...e, verdict: 'pas-prouve', note: 'banc à relancer : son K ne couvre pas les cases de la carte' });
      }
      const lignes = direct.parCase.get(cle);
      if (lignes?.length) {
        const famille = familleDe(col.id);
        const e = epreuveDuDirect(lignes, { variantes: kVivant * regardsDe(famille), debut: fenetre.parFamille[famille] ?? `${DEBUT_DU_DIRECT}T00:00:00.000Z`, juge });
        epreuves.push(e);
        if (!plusGrosse || e.matchs > plusGrosse.matchs) plusGrosse = { league: ch.league, colonne: col.id, matchs: e.matchs };
      }
      const { couleur, raison: r } = couleurDeLaCase({ colonne: col.id, epreuves });
      compter(parRaison, r);
      const infos = { ...(lu?.infos ?? {}) };
      const vp = vosParis.get(cle);
      if (vp) infos.vosParis = vp;
      const matchs = epreuves.reduce((m, e) => Math.max(m, fini(e.matchs) ? e.matchs : 0), 0);
      cases.push({ league: ch.league, colonne: col.id, couleur, raison: r, mot: RAISONS[r], phrase: phraseDeLaCase({ couleur, raison: r, epreuves }), matchs: epreuves.length ? matchs : null, epreuves, infos });
    }
  }
  const nb = (c) => cases.filter((k) => k.couleur === c).length;
  const aAjouter = championnats
    .filter((c) => c.horsAppli)
    .map((c) => {
      const siennes = cases.filter((k) => k.league === c.league);
      const vertes = siennes.filter((k) => k.couleur === 'vert').length;
      const rouges = siennes.filter((k) => k.couleur === 'rouge').length;
      const statut = vertes ? 'a-ajouter' : rouges ? 'a-eviter' : 'rien-de-prouve';
      const phrase = vertes
        ? `À ajouter : ${vertes} case${vertes > 1 ? 's' : ''} verte${vertes > 1 ? 's' : ''} au banc d’essai.`
        : rouges
          ? `À éviter : ${rouges} case${rouges > 1 ? 's' : ''} rouge${rouges > 1 ? 's' : ''}, rien de prouvé gagnant.`
          : 'Rien de prouvé : pas de raison de l’ajouter pour l’instant.';
      return { league: c.league, nom: c.nom, statut, vertes, rouges, phrase };
    });
  const kBancDit = banc?.kBanc ?? null;
  return {
    mois: moisDeParis(maintenant),
    calculeLe: new Date(maintenant).toISOString(),
    raison,
    moteur,
    banc: rejeu ? { id: rejeu.id, etiquette: bancValable ? rejeu.etiquette : 'k-insuffisant', variantes: kBancDit, finiLe: rejeu.finiLe ?? null } : { id: null, etiquette: 'aucun', variantes: null },
    kVivant,
    regards: Math.max(0, ...FAMILLES_EN_DIRECT.map((f) => regardsDe(f))),
    fenetre,
    resume: {
      versionCarte: VERSION_CARTE,
      cases: cases.length,
      championnats: championnats.length,
      vertes: nb('vert'),
      rouges: nb('rouge'),
      grises: nb('gris'),
      parRaison,
      plusGrosseCaseDuDirect: plusGrosse,
      direct: { pronostics: direct.pronostics, mesures: direct.mesures, ecartees: direct.ecartees, cases: kVivant },
      banc: rejeu ? { id: rejeu.id, etiquette: bancValable ? rejeu.etiquette : 'k-insuffisant', variantes: kBancDit, employees: banc?.employees ?? 0 } : null,
      aAjouter: aAjouter.filter((x) => x.statut === 'a-ajouter').length
    },
    contenu: { championnats, colonnes: COLONNES.map((c) => c.id), cases, aAjouter, horsCarte: 'Les 15 championnats « par pays » de football-data n’ont que la cote de clôture du 1N2 : impossibles à juger au banc (pas de cote d’avant-match).' }
  };
}

/**
 * LE CALCUL COMPLET, sur la base qu'on lui donne (l'enfant l'ouvre en lecture seule) : le rejeu de la carte, la
 * fenêtre du direct, les regards, les mesures, vos paris, les moments. `moteur` : { empreinte, empreinteReglages,
 * version } du moteur en service (le serveur le calcule) ; `versions` : le registre des versions (ou null) ;
 * `bets` : vos paris (sinon lus par betsRepository). Rend la carte (construireLaCarte), ou { rien: raison } sans rejeu.
 */
export function calculerLaCarte({ database, moteur, versions = null, maintenant = Date.now(), raison = 'mensuelle', bets = null }) {
  const rejeu = rejeuDeLaCarte(rejeuxUtilesALaCarte({ database }), moteur);
  const resume = rejeu ? lireRejeu(rejeu.id, { database })?.resume : null;
  const banc = resume ? lectureDuBanc(resume, { rejeuId: rejeu.id }) : null;
  const fenetre = fenetreDuDirect(versions);
  const regards = Object.fromEntries(FAMILLES_EN_DIRECT.map((f) => [f, cartesDepuis({ database, depuis: fenetre.parFamille[f] })]));
  const ctx = contexteDeMesure(database);
  const mesurer = (e) => mesurerUneEntree(e, ctx);
  const direct = lignesDuDirect({ database, fenetre, mesurer });
  const vosParis = vosParisParCase({ bets: bets ?? listBets(), mesurer });
  return construireLaCarte({ banc, rejeu, direct, regards, fenetre, vosParis, moments: momentsDuMarche(database), moteur, maintenant, raison });
}

// ------------------------------------------------------------ quand la calculer

/**
 * La carte est-elle à faire ? Pur sur ce qu'on lui donne. `derniere` : la dernière carte rangée (sans ses cases)
 * ou null ; `rejeu` : le rejeu que la carte lirait (rejeuDeLaCarte) ou null ; `moteur` ; `manuel` : un clic.
 * Rend { du, raison, pourquoi }. Chaque carte est un REGARD de plus sur la mesure en direct : jamais sans raison.
 *   - aucun rejeu du banc pour ce moteur : non (« pas encore mesuré » — le premier rejeu se lance d'un clic) ;
 *   - aucune carte : oui, tout de suite (« premiere ») ;
 *   - un rejeu plus récent que celui de la carte : oui (« nouveau-banc ») ;
 *   - les réglages du moteur ont changé depuis la carte : oui (« reglages »), si un rejeu les mesure ;
 *   - le 1er du mois à partir de 6 h (Paris), sans carte de ce mois : oui (« mensuelle ») ;
 *   - un clic avec une carte déjà là : non (un clic ne fabrique pas de regard).
 */
export function carteAFaire({ derniere = null, rejeu = null, moteur, maintenant = Date.now(), manuel = false }) {
  if (!rejeu) return { du: false, raison: null, pourquoi: 'aucun rejeu du banc d’essai pour le moteur en service : la carte attend un premier rejeu (Historique moteur › Banc d’essai › « Lancer le banc »)' };
  if (!derniere) return { du: true, raison: 'premiere', pourquoi: 'première carte' };
  if (rejeu.id !== derniere.banc?.id) return { du: true, raison: 'nouveau-banc', pourquoi: `un rejeu plus récent du banc (n° ${rejeu.id})` };
  if (moteur?.empreinteReglages && moteur.empreinteReglages !== derniere.moteur?.empreinteReglages) return { du: true, raison: 'reglages', pourquoi: 'les réglages du moteur ont changé depuis la dernière carte' };
  const mois = moisDeParis(maintenant);
  if (derniere.mois !== mois && apresLe1erA6h(maintenant) && derniere.calculeLe < debutDuMois(mois)) return { du: true, raison: 'mensuelle', pourquoi: `la carte de ${mois}` };
  return { du: false, raison: null, pourquoi: manuel ? 'déjà à jour : un clic ne recalcule pas la carte (chaque calcul rend le juge plus sévère)' : 'déjà à jour' };
}

// ------------------------------------------------------------ dans un processus à part

/**
 * Le calcul dans un PROCESSUS À PART (patron de marketKnowledge.calculerAPart) : base en lecture seule, réponse par
 * le canal du processus, sous le jeton du calcul lourd (un à la fois : un autre en cours, rejet CalculLourdEnCours).
 * Rend une promesse de la carte (ou { rien }).
 */
export function calculerAPart({ chemin, options, delaiMs = DELAI_CALCUL_MS }) {
  let rendre;
  try {
    rendre = commencerCalculLourd('carte « où parier »');
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    let fini = false;
    let erreurs = '';
    const enfant = fork(ENFANT, [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [...process.execArgv, '--max-old-space-size=512'] });
    const minuterie = setTimeout(() => {
      if (fini) return;
      fini = true;
      try {
        enfant.kill();
      } catch {
        // déjà arrêté
      }
      reject(new Error(`calcul de la carte arrêté : aucune réponse en ${Math.round(delaiMs / 60_000)} min`));
    }, delaiMs);
    minuterie.unref?.();
    enfant.stderr?.on('data', (d) => {
      erreurs = (erreurs + d).slice(-2000);
    });
    enfant.on('message', (m) => {
      clearTimeout(minuterie);
      if (fini) return;
      fini = true;
      if (m?.erreur) reject(new Error(m.erreur));
      else resolve(m);
    });
    enfant.on('error', (error) => {
      clearTimeout(minuterie);
      if (!fini) reject(error);
      fini = true;
    });
    enfant.on('exit', (code) => {
      clearTimeout(minuterie);
      if (!fini) reject(new Error(`calcul de la carte arrêté sans réponse (code ${code}) ${erreurs.trim().slice(-300)}`));
      fini = true;
    });
    enfant.send({ chemin, options });
  }).finally(rendre);
}
