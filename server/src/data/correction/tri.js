/**
 * tri.js — LE TRI DU MOIS : malchance ou vrai défaut (étape 26 du plan, 27/10/2026).
 * -----------------------------------------------------------------------
 * Pour un mois écoulé M, déjà figé par la calibration (étape 20), et pour la version du moteur EN SERVICE à la fin
 * de M (et ses sœurs aux mêmes probabilités : lignee.js), les 22 cases de regles.js — 11 familles × niveau et
 * confiance —, chacune jugée sur sa fenêtre de 2 ou 3 mois par le juge de l'étape 16 TEL QUEL (bench/guard.js,
 * comparer : un bloc par match, m = 264 regards par an, 5 %, 200 matchs, 1 000 tirages, graine 26).
 *
 * LIRE : la table engine_picks du mois, EN FLUX, triée par match puis marché (index des dates) : un match à la
 * fois, réglé au magasin comme la calibration et l'essai à blanc (lecteurDesRencontres, revisionsRetenues :
 * la dernière révision gelée avant le coup d'envoi ; issueDeLaLigne de bench/essaiCandidate.js : la règle même
 * de l'essai), puis oublié — seules restent ses SOMMES PAR CASE (critique, constat 11). Rien n'est écrit ici.
 *
 * FIGER : les sommes par match et par case de chaque mois sont rangées avec son tri (correction_tri.sommes,
 * entiers : lignes, Σa en millionièmes, Σb) ; la fenêtre d'un mois réutilise les mois FIGÉS d'avant (même forme
 * du tri, même lignée) au lieu de relire trois mois de révisions. Le mois trié lui-même passe par la même forme
 * compacte avant d'être jugé : un tri se rejoue au bit près depuis ce qui est rangé.
 *
 * MOIS PARTIELS (regles.js) : seules les lignes de la lignée comptent ; un mois partiel avec au moins 200 matchs
 * pour une case est jugé comme les autres, sinon « mois de changement de version » ; un mois d'une autre lignée
 * coupe la fenêtre.
 *
 * Générateurs : ils rendent la main (`yield`) en lisant les révisions, entre deux matchs et entre deux juges —
 * à exécuter par utils/travailCooperatif.js (executerEnRendantLaMain dans le serveur, executerSansPause ailleurs).
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { revisionsRetenues, lecteurDesRencontres, cleNumerique, bornesDuMois, moisSuivant, moisPrecedent, moisEcoule, moisValide, listeDesMoisFiges, premierMoisDuJournal } from '../calibration.js';
import { issueDeLaLigne } from '../../bench/essaiCandidate.js';
import { comparer, zPour } from '../../bench/guard.js';
import {
  FAMILLES,
  FAMILLES_DE_BUTS,
  CASES_DU_TRI,
  lireLaCase,
  familleDe,
  JUGE_DU_TRI,
  REGARDS_PAR_AN,
  MATCHS_MIN_PAR_MOIS,
  MOIS_DE_LA_FENETRE,
  MOIS_MIN_DE_LA_FENETRE,
  PREMIER_MOIS_DU_TRI,
  MOIS_PAR_PASSE,
  VERSION_DU_TRI,
  RAISONS_DU_TRI,
  STATUTS,
  levierDeLaCase
} from './regles.js';
import { lireDistribution, contributions, decisionDeLaCase, confianceDAbord, sensDit, statutDit, ecartDesSommes } from './mesures.js';
import { ligneeALaFinDu } from './lignee.js';
import { lireLeTri, listeDesTris } from './depotCorrections.js';

/** Un tri qui ne peut pas se faire maintenant (registre des versions illisible, mois illisible) : rien n'est écrit, la passe suivante réessaie. */
export class TriImpossible extends Error {
  constructor(raison, message) {
    super(message);
    this.raison = raison;
  }
}

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const instant = (x) => {
  const t = Date.parse(x ?? '');
  return Number.isFinite(t) ? t : null;
};
const jourUtc = (t) => new Date(t).toISOString().slice(0, 10);
const compter = (obj, cle, n = 1) => {
  obj[cle] = (obj[cle] ?? 0) + n;
};
/** Les sommes de probabilités sont rangées en millionièmes (entiers) : une forme compacte, relue au bit près. */
const MICRO = 1_000_000;
/** Un match dans les sommes rangées : [lignes, Σa niveau, Σb niveau, Σa confiance, Σb confiance] — 5 entiers. */
const PAS = 5;
/** La forme des sommes rangées. */
export const FORME_DES_SOMMES = 1;
/** Les familles dont le détail par régime est gardé (pour comprendre, jamais jugé) : le 1N2 et les familles de buts. */
export const FAMILLES_DU_DETAIL = Object.freeze(['result', ...FAMILLES_DE_BUTS]);

// ============================================================ la place de l'essai à blanc

/**
 * LA PLACE de l'essai à blanc (une candidate à la fois), lue dans ce que rend etatDesVersions() (engineVersions.js,
 * lecture seule) : prise dès qu'une candidate est déclarée ou proposée et pas adoptée (décision 9 de
 * l'orchestrateur : sans la retouche R1, la candidate du code déclarée et non adoptée occupe la place). Pur.
 */
export function placeDeLEssai(etat) {
  const c = etat?.candidate ?? null;
  if (!c) return { prise: false, candidate: null };
  return { prise: true, candidate: { id: c.id, etape: c.etape ?? null, marches: [...(c.marches ?? [])], enMots: c.enMots ?? null, statut: c.statut ?? null, origine: c.origine ?? 'code' } };
}

/** La candidate qui occupe la place, si une famille est parmi ses marchés : { candidate, etape, enMots } ou null. */
export function familleEnEssai(enSlot, familleId) {
  const c = enSlot?.candidate ?? null;
  if (!c || !Array.isArray(c.marches) || !c.marches.includes(familleId)) return null;
  return { candidate: c.id, etape: c.etape ?? null, enMots: c.enMots ?? null };
}

// ============================================================ les sommes d'un mois, en flux

const SELECTION = `SELECT fixture_key AS fixtureKey, market_key AS marketKey, version, recorded_at AS recordedAt, date, kickoff,
         home_id AS homeId, away_id AS awayId, market_id AS marketId, engine_version AS engineVersion, distribution, odds_source AS oddsSource
  FROM engine_picks WHERE date >= ? AND date <= ? ORDER BY date, fixture_key, market_key, version`;

/**
 * Les sommes d'UN match ajoutées aux tableaux du mois (pur) : `lignes` = ses lignes comptées, chacune
 * { familleId, contribution } (mesures.js, contributions) ; pour chaque famille où il en a, cinq entiers
 * [lignes, Σa niveau en millionièmes, Σb niveau, Σa confiance en millionièmes, Σb confiance]. C'est la forme
 * rangée (correction_tri.sommes) ; les simulations de l'étape s'en servent telle quelle.
 */
export function ajouterLeMatch(familles, lignes) {
  const parFamille = new Map();
  for (const { familleId, contribution: c } of lignes) {
    const s = parFamille.get(familleId) ?? { n: 0, na: 0, nb: 0, ca: 0, cb: 0 };
    s.n++;
    s.na += c.niveau.a;
    s.nb += c.niveau.b;
    s.ca += c.confiance.a;
    s.cb += c.confiance.b;
    parFamille.set(familleId, s);
  }
  for (const f of FAMILLES) {
    const s = parFamille.get(f.id);
    if (s) familles[f.id].push(s.n, Math.round(s.na * MICRO), s.nb, Math.round(s.ca * MICRO), s.cb);
  }
  return parFamille.size > 0;
}

/** Des tableaux du mois vides, une entrée par famille. */
export const famillesVides = () => Object.fromEntries(FAMILLES.map((f) => [f.id, []]));

/** Le régime d'une ligne pour le détail : la provenance du modèle de buts (« cotes-1n2-xg »…), sinon « cotes » / « aucune cote ». */
export function regimeDeLaLigne(distribution, oddsSource) {
  if (distribution?.provenance) return distribution.provenance;
  if (typeof oddsSource !== 'string' || !oddsSource) return 'inconnu';
  return /^aucune cote/i.test(oddsSource) ? 'aucune-cote' : 'cotes';
}

/**
 * LES SOMMES D'UN MOIS, en générateur. `lignee` : celle de la fin du mois (ligneeALaFinDu) ou null ; seules ses
 * versions comptent. Chaque pronostic gelé (match × marché) d'un match du mois est exactement une chose : à venir,
 * écarté (sa raison, comptée par famille) ou compté (une ligne de sa famille). Rend { sommes (forme compacte,
 * rangée telle quelle), regimes, comptes, ecartees, ecarteesParFamille }.
 */
export function* sommesDuMois(mois, { database, lignee, maintenant = Date.now() }) {
  const { du, au } = bornesDuMois(mois);
  const aujourdhui = jourUtc(maintenant);
  const versions = new Set(lignee?.versions ?? []);
  yield 'rencontres du magasin';
  const lire = yield* lecteurDesRencontres(database, { du, au });

  const familles = famillesVides();
  const regimes = Object.fromEntries(FAMILLES_DU_DETAIL.map((f) => [f, {}]));
  regimes.nul = {};
  const matchsDesRegimes = new Map();
  const ecartees = {};
  const ecarteesParFamille = {};
  const comptes = { revisions: 0, pronostics: 0, lignes: 0, matchs: 0, aVenir: 0, matchsAVenir: 0 };
  const ecarter = (raison, familleId) => {
    compter(ecartees, raison);
    const f = familleId ?? '—';
    ecarteesParFamille[f] ??= {};
    compter(ecarteesParFamille[f], raison);
  };
  const ajouterAuRegime = (cle, regime, fixtureKey, a, b) => {
    const r = (regimes[cle][regime] ??= { lignes: 0, matchs: 0, sa: 0, sb: 0 });
    r.lignes++;
    r.sa += a;
    r.sb += b;
    const k = `${cle}|${regime}`;
    if (!matchsDesRegimes.has(k)) matchsDesRegimes.set(k, new Set());
    matchsDesRegimes.get(k).add(fixtureKey);
  };

  const traiterLeMatch = (g) => {
    const futur = g.date > aujourdhui;
    let rencontre;
    if (futur) rencontre = { aVenir: true };
    else if (!cleNumerique(g.fixtureKey) || !g.homeId || !g.awayId) rencontre = { raison: 'sansIdentifiant' };
    else rencontre = lire({ fixtureKey: g.fixtureKey, homeId: g.homeId, awayId: g.awayId, date: g.date });
    // Pas (encore) de résultat pour un match d'aujourd'hui : à venir, jamais « écarté » (comme la calibration).
    if (rencontre.raison && !futur && g.date >= aujourdhui && (rencontre.raison === 'sansResultat' || rencontre.raison === 'sansScore')) rencontre = { aVenir: true };
    if (rencontre.aVenir) {
      comptes.aVenir += g.marches.size;
      comptes.matchsAVenir++;
      return;
    }
    const comptees = [];
    for (const revs of g.marches.values()) {
      comptes.pronostics++;
      const retenues = revisionsRetenues(revs, { coupDEnvoi: rencontre.coupDEnvoi ?? g.kickoff, jour: g.date });
      const r = retenues.derniere;
      const marche = revs[0].marketId;
      if (!r) {
        ecarter(retenues.raisonDerniere ?? 'heureInconnue', marche);
        continue;
      }
      if (!Number.isInteger(r.engineVersion)) {
        ecarter('sansVersion', marche);
        continue;
      }
      if (!versions.has(r.engineVersion)) {
        ecarter('autreVersion', marche);
        continue;
      }
      if (rencontre.raison) {
        ecarter(rencontre.raison, marche);
        continue;
      }
      const f = familleDe(r.marketId);
      if (!f) {
        ecarter('marcheInconnu', marche);
        continue;
      }
      const d = lireDistribution(f.id, r.distribution);
      if (!d) {
        ecarter('sansDistribution', f.id);
        continue;
      }
      const reglee = issueDeLaLigne({ marketId: r.marketId, distribution: d }, rencontre.reglement);
      if (reglee.raison) {
        ecarter(reglee.raison, f.id);
        continue;
      }
      const c = contributions(f.id, d, reglee.issue);
      if (c.raison) {
        ecarter(c.raison, f.id);
        continue;
      }
      comptes.lignes++;
      comptees.push({ familleId: f.id, contribution: c });
      if (regimes[f.id]) {
        const regime = regimeDeLaLigne(d, r.oddsSource);
        ajouterAuRegime(f.id, regime, g.fixtureKey, c.niveau.a, c.niveau.b);
        if (f.id === 'result') ajouterAuRegime('nul', regime, g.fixtureKey, d.issues.draw, reglee.issue === 'draw' ? 1 : 0);
      }
    }
    if (ajouterLeMatch(familles, comptees)) comptes.matchs++;
  };

  let groupe = null;
  let k = 0;
  for (const r of database.prepare(SELECTION).iterate(du, au)) {
    comptes.revisions++;
    if (groupe && groupe.fixtureKey !== r.fixtureKey) {
      traiterLeMatch(groupe);
      groupe = null;
      if (++k % 25 === 0) yield 'tri des pronostics';
    }
    if (!groupe) groupe = { fixtureKey: r.fixtureKey, date: r.date, homeId: r.homeId, awayId: r.awayId, kickoff: null, marches: new Map() };
    if (r.kickoff && instant(r.kickoff) !== null) groupe.kickoff = r.kickoff;
    if (!groupe.marches.has(r.marketKey)) groupe.marches.set(r.marketKey, []);
    groupe.marches.get(r.marketKey).push({ ...r });
    if (comptes.revisions % 500 === 0) yield 'pronostics gelés';
  }
  if (groupe) traiterLeMatch(groupe);

  for (const [cle, parRegime] of Object.entries(regimes)) {
    for (const [regime, r] of Object.entries(parRegime)) {
      r.matchs = matchsDesRegimes.get(`${cle}|${regime}`)?.size ?? 0;
      r.sa = Math.round(r.sa * MICRO) / MICRO;
    }
  }
  return { sommes: { forme: FORME_DES_SOMMES, familles }, regimes, comptes, ecartees, ecarteesParFamille, du, au };
}

// ============================================================ les sommes rangées, relues

/** Les agrégats d'une famille à partir de ses sommes rangées : { niveau: { lignes, matchs, sa, sb }, confiance: {…} }. */
export function agregatsDeLaFamille(tableau) {
  const t = Array.isArray(tableau) ? tableau : [];
  const niveau = { lignes: 0, matchs: 0, sa: 0, sb: 0 };
  const confiance = { lignes: 0, matchs: 0, sa: 0, sb: 0 };
  let na = 0;
  let ca = 0;
  for (let i = 0; i + PAS <= t.length; i += PAS) {
    niveau.lignes += t[i];
    confiance.lignes += t[i];
    niveau.matchs++;
    confiance.matchs++;
    na += t[i + 1];
    niveau.sb += t[i + 2];
    ca += t[i + 3];
    confiance.sb += t[i + 4];
  }
  niveau.sa = na / MICRO;
  confiance.sa = ca / MICRO;
  return { niveau: { ...niveau, ecart: ecartDesSommes(niveau) }, confiance: { ...confiance, ecart: ecartDesSommes(confiance) } };
}

/** Un mois tel qu'il est rangé (ou tel qu'il le sera) : { mois, empreinte, partiel, familles: { [famille]: { tableau, agregats } }, regimes }. */
export function moisRelu({ mois, lignee, sommes, regimes }) {
  if (sommes?.forme !== FORME_DES_SOMMES) throw new TriImpossible('forme-des-sommes', `Les sommes rangées du mois ${mois} ont une forme inconnue (${String(sommes?.forme)}).`);
  const familles = {};
  for (const f of FAMILLES) {
    const tableau = sommes.familles?.[f.id] ?? [];
    familles[f.id] = { tableau, agregats: agregatsDeLaFamille(tableau) };
  }
  return { mois, empreinte: lignee?.empreinte ?? null, partiel: lignee?.couverture ? Boolean(lignee.couverture.partiel) : true, familles, regimes: regimes ?? {} };
}

// ============================================================ la fenêtre et le juge

/**
 * LA FENÊTRE d'une case au mois M : les mois comptés, du plus ancien à M — M lui-même s'il a au moins
 * MATCHS_MIN_PAR_MOIS matchs pour la case, puis M−1, M−2 tant qu'ils sont figés, de la MÊME lignée et assez
 * fournis (un trou coupe la fenêtre : la persistance repart de zéro) ; au plus MOIS_DE_LA_FENETRE. Vide si M ne
 * compte pas. `precedents` : [M−1, M−2, …] relus (moisRelu) ou null.
 */
export function fenetreDeLaCase(cas, courant, precedents = []) {
  const { famille, mesure } = lireLaCase(cas);
  const agregat = (m) => m?.familles?.[famille]?.agregats?.[mesure] ?? null;
  const a = agregat(courant);
  if (!a || !(a.matchs >= MATCHS_MIN_PAR_MOIS)) return [];
  const fenetre = [courant];
  for (const p of precedents) {
    if (fenetre.length >= MOIS_DE_LA_FENETRE) break;
    const ap = agregat(p);
    if (!p || p.empreinte === null || p.empreinte !== courant.empreinte || !ap || !(ap.matchs >= MATCHS_MIN_PAR_MOIS)) break;
    fenetre.unshift(p);
  }
  return fenetre;
}

/**
 * Les lignes que reçoit le juge pour une case et sa fenêtre : un BLOC par match (« AAAA-MM#rang », dans l'ordre
 * des mois puis des matchs) ; la première ligne d'un match porte ses sommes (a = Σa, b = Σb), les autres lignes du
 * même match (deux pour une famille « d'une équipe ») a = b = 0 — le juge somme par bloc : mêmes sommes, même
 * nombre de lignes que les lignes d'origine, donc le même écart moyen par ligne et le même rééchantillonnage.
 */
export function lignesDuJuge(cas, fenetre) {
  const { famille, mesure } = lireLaCase(cas);
  const iA = mesure === 'niveau' ? 1 : 3;
  const lignes = [];
  for (const m of fenetre) {
    const t = m.familles?.[famille]?.tableau ?? [];
    for (let i = 0, rang = 0; i + PAS <= t.length; i += PAS, rang++) {
      const bloc = `${m.mois}#${rang}`;
      lignes.push({ bloc, match: bloc, a: t[i + iA] / MICRO, b: t[i + iA + 1] });
      for (let j = 1; j < t[i]; j++) lignes.push({ bloc, match: bloc, a: 0, b: 0 });
    }
  }
  return lignes;
}

/** Le z du tri : Bonferroni sur les 264 regards d'une année (≈ 3,733). */
export const Z_DU_TRI = zPour(JUGE_DU_TRI.alpha, REGARDS_PAR_AN);

/**
 * LE JUGE DU TRI : comparer (bench/guard.js) TEL QUEL sur les matchs de la fenêtre — mode moyenne, plus grand
 * = le réalisé au-dessus de l'annoncé (b = 1 arrivé, a = annoncé), m = REGARDS_PAR_AN, les seuils par défaut du
 * juge. Rend { verdict, gain, fourchette, ecartType, z, lignes, matchs, annonce, realise }.
 */
export function jugeParLesMatchs(cas, fenetre) {
  const r = comparer(lignesDuJuge(cas, fenetre), {
    mode: 'moyenne',
    sens: 'max',
    variantes: REGARDS_PAR_AN,
    alpha: JUGE_DU_TRI.alpha,
    minBlocs: JUGE_DU_TRI.minBlocs,
    tirages: JUGE_DU_TRI.tirages,
    graine: JUGE_DU_TRI.graine
  });
  return { verdict: r.verdict, gain: r.gain, fourchette: r.fourchette, ecartType: r.ecartType, z: r.seuil.z, lignes: r.n.lignes, matchs: r.n.matchs, annonce: r.a.moyenne, realise: r.b.moyenne };
}

/** Les sommes par régime d'une famille sur les mois d'une fenêtre (additionnées : les mois ne se recouvrent pas). */
export function regimesDeLaFenetre(familleId, fenetre) {
  const t = {};
  for (const m of fenetre) {
    for (const [regime, r] of Object.entries(m.regimes?.[familleId] ?? {})) {
      const x = (t[regime] ??= { lignes: 0, matchs: 0, sa: 0, sb: 0 });
      x.lignes += r.lignes ?? 0;
      x.matchs += r.matchs ?? 0;
      x.sa += r.sa ?? 0;
      x.sb += r.sb ?? 0;
    }
  }
  return t;
}

const arrondi = (x, d = 6) => (fini(x) ? Number(x.toFixed(d)) : null);

/**
 * LES 22 CASES d'un mois (le cœur pur du tri, sans base) : la fenêtre de chacune, son juge, sa décision, puis la
 * règle « confiance d'abord » et le réglage visé (regles.js, levierDeLaCase). `courant` et `precedents` : relus
 * (moisRelu) ; `juge` : jugeParLesMatchs (remplaçable dans les simulations, jamais dans l'appli). Générateur (un
 * point d'arrêt après chaque juge). Rend la liste des 22 cases, dans l'ordre de CASES_DU_TRI.
 */
export function* jugerLesCases({ mois, lignee, courant, precedents = [], enSlot = null, juge = jugeParLesMatchs }) {
  const cases = [];
  for (const cas of CASES_DU_TRI) {
    const { famille, mesure } = lireLaCase(cas);
    const a = courant?.familles?.[famille]?.agregats?.[mesure] ?? { lignes: 0, matchs: 0, sa: 0, sb: 0, ecart: null };
    const fenetre = fenetreDeLaCase(cas, courant, precedents);
    let j = null;
    if (fenetre.length >= MOIS_MIN_DE_LA_FENETRE) {
      j = juge(cas, fenetre);
      yield 'juge';
    }
    const enEssai = familleEnEssai(enSlot, famille);
    const moisDeLaFenetre = fenetre.map((m) => {
      const x = m.familles[famille].agregats[mesure];
      return { mois: m.mois, ecart: arrondi(x.ecart), lignes: x.lignes, matchs: x.matchs, partiel: Boolean(m.partiel) };
    });
    const d = decisionDeLaCase({ courant: { mois, lignes: a.lignes, matchs: a.matchs, ecart: a.ecart, partiel: Boolean(courant?.partiel) }, fenetre: moisDeLaFenetre, juge: j, enEssai });
    cases.push({
      cas,
      famille,
      mesure,
      statut: d.statut,
      dit: statutDit(d.statut),
      sens: d.sens,
      sensDit: sensDit(cas, fini(j?.gain) ? j.gain : a.ecart),
      canonique: mesure === 'niveau' ? familleDe(famille).canonique.dit : null,
      courant: { mois, ecart: arrondi(a.ecart), lignes: a.lignes, matchs: a.matchs, partiel: Boolean(courant?.partiel) },
      mois: moisDeLaFenetre,
      fenetre: j
        ? {
            mois: moisDeLaFenetre.map((m) => m.mois),
            lignes: j.lignes,
            matchs: j.matchs,
            ecart: arrondi(j.gain),
            annonce: arrondi(j.annonce),
            realise: arrondi(j.realise),
            fourchette: j.fourchette ? j.fourchette.map((x) => arrondi(x)) : null,
            ecartType: arrondi(j.ecartType),
            z: arrondi(j.z, 4),
            regards: REGARDS_PAR_AN,
            verdictDuJuge: j.verdict
          }
        : null,
      enEssai,
      regimes: mesure === 'niveau' && FAMILLES_DU_DETAIL.includes(famille) && fenetre.length ? regimesDeLaFenetre(famille, fenetre) : null
    });
  }
  return confianceDAbord(cases).map(({ regimes, ...c }) => ({ ...c, levier: levierDeLaCase(c, { avecModeleDeButs: Boolean(lignee?.avecModeleDeButs), regimes }) }));
}

// ============================================================ le tri d'un mois

const libelleDeRaison = (raison) => RAISONS_DU_TRI[raison] ?? raison;

/** Le résumé d'un tri (pour la liste des mois, la Santé du moteur et le journal) : comptes, statuts, écartés. */
function resumeDuTri({ lignee, s, cases, enSlot }) {
  const statuts = Object.fromEntries(Object.keys(STATUTS).map((k) => [k, 0]));
  for (const c of cases) statuts[c.statut]++;
  return {
    versionEnService: lignee?.versionEnService ?? null,
    versions: lignee?.versions ?? [],
    partiel: lignee ? Boolean(lignee.couverture?.partiel) : true,
    depuis: lignee?.couverture?.depuis ?? null,
    revisions: s.comptes.revisions,
    pronostics: s.comptes.pronostics,
    lignes: s.comptes.lignes,
    matchs: s.comptes.matchs,
    aVenir: s.comptes.aVenir,
    ecartees: Object.entries(s.ecartees)
      .map(([raison, n]) => ({ raison, libelle: libelleDeRaison(raison), n }))
      .sort((a, b) => b.n - a.n || (a.raison < b.raison ? -1 : 1)),
    ecarteesParFamille: s.ecarteesParFamille,
    statuts,
    vraisDefauts: cases.filter((c) => c.statut === 'vrai-defaut').map((c) => c.cas),
    enEssai: enSlot?.candidate ? { candidate: enSlot.candidate.id, etape: enSlot.candidate.etape, marches: enSlot.candidate.marches } : null,
    regards: REGARDS_PAR_AN,
    z: arrondi(Z_DU_TRI, 4)
  };
}

/**
 * LE TRI DU MOIS M, en générateur — N'ÉCRIT RIEN (depotCorrections.ecrireLeTri le range) :
 *   `database`  le magasin (lecture : engine_picks, matches, team_stats, et les tris figés d'avant) ;
 *   `versions`  le CONTENU du registre des versions (readJsonFile de FICHIER_VERSIONS) — illisible : l'appelant
 *               n'appelle pas ; une chronologie impossible lève TriImpossible (jamais devinée) ;
 *   `enSlot`    la place de l'essai (placeDeLEssai) : les familles de sa candidate sont « en essai ».
 * Rend { mois, version, calculeLe, lignee, regards, resume, cases, regimes, sommes, dureeMs }.
 */
export function* trierLeMois(mois, { database, versions, enSlot = null, maintenant = Date.now() }) {
  if (!moisValide(mois)) throw new TriImpossible('mois-illisible', `Mois illisible : « ${String(mois)} » (AAAA-MM attendu).`);
  const debut = performance.now();
  const lignee = ligneeALaFinDu(versions, mois);
  if (lignee?.probleme) throw new TriImpossible('registre-des-versions', `Le tri attend : ${lignee.probleme}.`);
  const s = yield* sommesDuMois(mois, { database, lignee, maintenant });
  // Le mois trié passe par la forme rangée (JSON) avant d'être jugé : le tri se rejoue au bit près depuis la table.
  const sommes = JSON.parse(JSON.stringify(s.sommes));
  const courant = moisRelu({ mois, lignee, sommes, regimes: s.regimes });
  const precedents = [];
  for (let k = 1, m = moisPrecedent(mois); k < MOIS_DE_LA_FENETRE; k++, m = moisPrecedent(m)) {
    const t = lireLeTri(m, { database, version: VERSION_DU_TRI, avecSommes: true });
    precedents.push(t ? moisRelu({ mois: m, lignee: t.lignee, sommes: t.sommes, regimes: t.regimes?.mois }) : null);
    yield 'mois figés';
  }
  const cases = yield* jugerLesCases({ mois, lignee, courant, precedents, enSlot });
  return {
    mois,
    version: VERSION_DU_TRI,
    calculeLe: new Date(maintenant).toISOString(),
    lignee: lignee
      ? {
          versionEnService: lignee.versionEnService,
          versions: lignee.versions,
          empreinte: lignee.empreinte,
          code: lignee.code,
          avecModeleDeButs: lignee.avecModeleDeButs,
          enServiceDepuis: lignee.enServiceDepuis,
          couverture: lignee.couverture
        }
      : null,
    regards: REGARDS_PAR_AN,
    resume: resumeDuTri({ lignee, s, cases, enSlot }),
    cases,
    regimes: { mois: s.regimes },
    sommes,
    dureeMs: Math.round(performance.now() - debut)
  };
}

// ============================================================ quels mois trier

/**
 * Les mois à trier maintenant, dans l'ordre : depuis PREMIER_MOIS_DU_TRI, chaque mois ÉCOULÉ (le 1er du mois
 * suivant à 6 h, heure de Paris) pas encore trié sous cette forme du tri, déjà FIGÉ par la calibration (« après
 * le gel » ; un mois sans aucun pronostic gelé n'attend rien) ; le premier mois qui attend fait attendre les
 * suivants (la fenêtre d'un mois réutilise les mois d'avant) ; au plus `limite`. LIT seulement.
 */
export function moisATrier({ database = openDb(), maintenant = Date.now(), limite = MOIS_PAR_PASSE } = {}) {
  const tries = new Set(listeDesTris({ database }).filter((t) => t.version === VERSION_DU_TRI).map((t) => t.mois));
  const figes = new Set(listeDesMoisFiges({ database }).map((m) => m.mois));
  const premierDuJournal = premierMoisDuJournal({ database });
  const out = [];
  for (let m = PREMIER_MOIS_DU_TRI; moisEcoule(m, maintenant) && out.length < limite; m = moisSuivant(m)) {
    if (tries.has(m)) continue;
    const rienAFiger = !premierDuJournal || m < premierDuJournal;
    if (!figes.has(m) && !rienAFiger) break;
    out.push(m);
  }
  return out;
}
