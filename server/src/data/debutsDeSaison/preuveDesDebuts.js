/**
 * preuveDesDebuts.js — LA PREUVE APRÈS LANCEMENT des débuts de saison (étape 35 du plan, lot 1c, 14/11/2026 ; conception
 * §5.10, patron de la C2 de l'étape 32 : data/contexte/preuveDuContexte.js).
 * -----------------------------------------------------------------------
 * Le banc (lot 1a, UN seul regard, noteDesDebuts.js, sha1 762efdde…) a retenu UNE famille utile : les NOUVEAUX VENUS
 * (`magasin-nouveaux-sans-cote`, z 4,13, ampleur 0,52 point : « effet mesuré, jugement prudent »). Ce module dit si cet effet
 * tient sur VOS matchs, joués APRÈS le lancement de l'étape 35 (registre de la mesure : lancementDe('35'), jamais une date
 * écrite à la main), avec ce que l'appli avait écrit AVANT le coup d'envoi.
 *
 *   LES LIGNES, FIGÉES AVANT LE COUP D'ENVOI (lireLesMatchsDeLaPreuve, lignesDeLaPreuve — dans le processus à part de la
 *   nuit, base en lecture seule) : chaque match JOUÉ après le jour du lancement et avant le jour de la nuit, dont la fiche
 *   (`debuts_fiches`) a été écrite par la nuit avant son coup d'envoi et rattachée à la rencontre (`match_key`). Écartées et
 *   comptées : une fiche écrite après le coup d'envoi (`apres_coup_d_envoi = 1`), d'une autre version de fiche, écrite avec
 *   une AUTRE note du banc que la note figée, illisible, aux camps inversés, un match attribué ou sans score à la 90e. Les
 *   deux bras sont CEUX DE LA FICHE (bras A et B de la famille, calculés la nuit avec les valeurs finales de la note figée) :
 *   rien n'est recalculé ni relu dans le magasin. Une ligne par match CONCERNÉ (la fiche porte les bras de la famille) : la
 *   perte log du SCORE EXACT à la 90e (grilleDuJuge, perteDuScore : celles du banc) du bras A (a) et du bras B (b).
 *
 *   LE RECALAGE (fixé le 14/11/2026 AVANT toute ligne de preuve calculée) : la fiche garde les bras « avant recalage » et la
 *   note ne porte pas de recalage des valeurs finales. Chaque bras reçoit donc ses deux niveaux (c_dom = ln(Σ buts dom. ÷ Σ λ),
 *   c_ext de même, la forme fermée de Poisson du banc) sur les matchs concernés de la preuve eux-mêmes : le même traitement
 *   pour les deux bras, si bien qu'un bras ne gagne jamais par un simple niveau (critique 33, constats 1 et 10) ; il ne gagne
 *   que par ce qui est propre au centre des nouveaux venus.
 *
 *   LES PREMIERS CHIFFRES (calculerLaPreuve → etatApresLaPreuve, `debuts_etat.preuve`) : des COMPTES seulement — matchs
 *   concernés depuis le lancement, jours écoulés, l'horizon. Aucun gain, aucun verdict, rien au registre.
 *
 *   L'HORIZON ET LA GARDE COMPTENT LES LIGNES QUE LE JUGE GARDERA (avis du 14/11, constat 3) : après le jour du lancement
 *   ET hors des fenêtres déjà vues (fenetresVues de l'étape 35 : DONNEES_VUES, celles de la 35, celles de portée « moteur »
 *   des autres étapes lancées ; bornes comprises, comparaison de textes, la règle de guard.js). Une version du moteur qui
 *   apprendrait sur des matchs d'après le lancement les retire donc aussi du compte (il peut reculer : la phrase le dit).
 *
 *   LE JUGEMENT PRINCIPAL (une seule fois par famille utile, à son horizon : les 1 767 matchs concernés de la note) :
 *   jugerEtape (le juge de preuve de l'étape 16 : lignes après le jour du lancement, K = les variantes déclarées de l'étape
 *   35, seuils par défaut) calculé dans le processus à part SANS enregistrer, puis RANGÉ au registre par le serveur
 *   (rangerLesPrincipaux), jamais à la place d'un autre : une famille dont le principal est pris (état de la nuit ou
 *   registre, pour CE lancement) n'est plus jamais rejugée. « Pas prouvé » ne rétrograde pas ; « moins bon » la dément.
 *
 *   LA GARDE DU MOIS : le premier soir de chaque mois civil (Paris) où le juge a assez de matchs (200 blocs), le cumul des
 *   lignes depuis le lancement passe par comparer avec 12 variantes (z ≈ 2,87 : douze regards par an) ; arrêtée après 12
 *   regards. « Moins bon » → la famille est DÉMENTIE (`debuts_etat.dementis`, lu par l'écran : « Explication seulement » et la
 *   note ambre « démenti sur vos matchs depuis le … ») et l'alerte durable de l'étape la garde.
 *
 * Seules les familles UTILES de la note sont jugées (jamais rappel, promus ni force de l'effectif, « explication
 * seulement »). Ni horloge (l'instant de la passe est reçu), ni hasard non semé, ni réseau ; aucune écriture de la base ici
 * (le serveur range, debutsNuit.js) ; le seul écrit est le registre de la mesure, par rangerLesPrincipaux, dans le serveur.
 * Hors de l'empreinte du moteur (data/debutsDeSaison/), et aucun fichier du moteur ne l'importe. Jamais lu par le moteur ni
 * envoyé à l'IA.
 * -----------------------------------------------------------------------
 */

import { comparer, jugerEtape } from '../../bench/guard.js';
import { lancementDe, jugementsDe, enregistrerJugement, fenetresVues } from '../../bench/trialsRegistry.js';
import { JUGE, GARDE_MENSUELLE, VERSION_FICHE } from './reglagesDebuts.js';
import { grilleDuJuge, perteDuScore } from './formulesDebuts.js';
import { butsA90 } from './lectureDesDebuts.js';
import { DEBUTS_AU_BANC } from './noteDesDebuts.js';

const JOUR_MS = 86_400_000;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const iso = (t) => new Date(t).toISOString();
const joursEntre = (de, a) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / JOUR_MS);
/** Gèle un objet et tout ce qu'il contient. */
const gele = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) gele(v);
  }
  return o;
};

/** L'étape jugée (registre de la mesure). */
export const ETAPE_DE_LA_PREUVE = '35';
/** La mesure du juge de preuve (metrics.js) : la perte log, plus petite = mieux, en part de celle du bras A. */
export const MESURE_DE_LA_PREUVE = 'perte-log';
/** Les familles dont la fiche de la nuit porte les deux bras (debutsEnfant.brasDeLaFiche) : les seules que la preuve sait juger. */
export const FAMILLES_DE_LA_PREUVE = Object.freeze(['nouveaux', 'promus', 'rappel']);
/** La fenêtre du banc dont la fiche porte les valeurs finales (valeursFinales.magasin). */
export const FENETRE_DE_LA_PREUVE = 'magasin';
/** Les noms des familles dans les phrases. */
export const NOMS_DES_FAMILLES = Object.freeze({ nouveaux: 'nouveaux venus', promus: 'promus et relégués', rappel: 'oubli à la trêve', effectif: 'force de l’effectif' });
/**
 * L'horizon dit à Pierre tel quel (conception §5.10 : ≈ 2 à 3 débuts de saison ; avis du 14/11, constat 3 : 1 767 matchs à
 * 550-1 100 matchs concernés par an, d'août 2028 à 2030 — « 2027-2028 » ne tenait qu'au rythme récent).
 */
export const REPONSE_ATTENDUE = 'la réponse viendra entre fin 2028 et 2029 (il faut 2 à 3 débuts de saison)';

/** Le `quoi` du jugement principal d'une famille (distinct par variante retenue : un principal par famille utile). */
export const quoiDuPrincipal = (id) => `Débuts de saison, ${id} : la perte du score exact sur vos matchs, bras A face au bras B de la fiche (jugement principal, à l’horizon)`;

// ======================================================= les familles à prouver (ce que le banc a retenu)

/**
 * LES VARIANTES À PROUVER : pour chaque famille UTILE de la note (jamais un placebo, jamais une famille dont un banc est faux),
 * sa variante retenue sur la fenêtre du magasin (celle dont la fiche porte les valeurs finales) et son horizon (les matchs
 * concernés de la note). Pure. Rend [{ id, famille, fenetre, horizon: { matchs } }] (gelé).
 */
export function variantesDeLaPreuve(note = DEBUTS_AU_BANC) {
  if (!note || typeof note !== 'object' || !Array.isArray(note.utiles)) return gele([]);
  const out = [];
  for (const famille of note.utiles) {
    const f = note.familles?.[famille];
    if (!f || f.utile !== true || f.fenetre !== FENETRE_DE_LA_PREUVE || !FAMILLES_DE_LA_PREUVE.includes(famille)) continue;
    if (Object.values(note.bancFaux?.[famille] ?? {}).some(Boolean)) continue;
    const id = f.fenetres?.[f.fenetre]?.variante ?? null;
    const v = (note.variantes ?? []).find((x) => x.id === id);
    if (!v || v.placebo === true || v.famille !== famille || v.verdict !== 'retenu') continue;
    const matchs = note.horizons?.[famille]?.matchs;
    if (!Number.isInteger(matchs) || matchs <= 0 || note.horizons?.[famille]?.fenetre !== f.fenetre) continue;
    out.push({ id, famille, fenetre: f.fenetre, horizon: { matchs } });
  }
  return gele(out);
}

// ======================================================= les lignes (le processus à part, base en lecture seule)

/**
 * Les fiches gelées des matchs JOUÉS de `depuis` (exclu : le jour du lancement) à `avant` (exclu : le jour de la nuit),
 * rattachées à leur rencontre, avec la ligne du camp qui reçoit (attribué, prolongation, buts, buts à la 90e) — rien d'autre.
 */
export const SQL_DE_LA_PREUVE = `SELECT f.id AS fiche_id, f.date AS fiche_date, f.home_id, f.away_id, f.version, f.note, f.apres_coup_d_envoi, f.calcule_le, f.bras,
  d.match_key, d.date, d.league, d.saison, d.home, d.away,
  t.attribue, t.prolongation, t.bp, t.bc, t.bp90, t.bc90
  FROM debuts_fiches f
  JOIN day_matches d ON d.match_key = f.match_key
  JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1
  WHERE f.match_key IS NOT NULL AND d.date > ? AND d.date < ?
  ORDER BY d.date, d.match_key, f.id`;

const brasValide = (x) => Boolean(x) && fini(x.lambda) && fini(x.mu) && x.lambda > 0 && x.mu > 0;

/**
 * LES MATCHS DE LA PREUVE (lecture seule) : une fiche par rencontre (la date exacte d'abord, sinon la plus récente) ; écartés
 * et comptés : fiche après le coup d'envoi, d'une autre version, d'une autre note du banc, illisible, camps inversés, match
 * attribué, sans score à la 90e. Les bras de chaque famille sont ceux de la fiche. Rend { matchs: [{ cle, date, league,
 * buts, bras: { [famille]: { A, B } } }], comptes }.
 */
export function lireLesMatchsDeLaPreuve(database, { depuis, avant, note = DEBUTS_AU_BANC }) {
  const comptes = { fichesLues: 0, doublons: 0, apresCoupDEnvoi: 0, autreVersion: 0, autreNote: 0, illisibles: 0, campsInverses: 0, attribues: 0, sansScore90: 0, matchs: 0 };
  const parMatch = new Map();
  for (const l of database.prepare(SQL_DE_LA_PREUVE).iterate(depuis, avant)) {
    comptes.fichesLues++;
    const deja = parMatch.get(l.match_key);
    if (deja) {
      comptes.doublons++;
      const exacte = (r) => r.fiche_date === r.date;
      if (exacte(deja) || (!exacte(l) && String(deja.calcule_le) >= String(l.calcule_le))) continue;
    }
    parMatch.set(l.match_key, { ...l });
  }
  const noteFigee = note?.calculeLe ?? null;
  const matchs = [];
  for (const l of parMatch.values()) {
    if (Number(l.apres_coup_d_envoi) === 1) {
      comptes.apresCoupDEnvoi++;
      continue;
    }
    if (Number(l.version) !== VERSION_FICHE) {
      comptes.autreVersion++;
      continue;
    }
    if (noteFigee === null || l.note !== noteFigee) {
      comptes.autreNote++;
      continue;
    }
    if (Number(l.home) !== Number(l.home_id) || Number(l.away) !== Number(l.away_id)) {
      comptes.campsInverses++;
      continue;
    }
    if (Number(l.attribue)) {
      comptes.attribues++;
      continue;
    }
    const buts = butsA90(l);
    if (!buts) {
      comptes.sansScore90++;
      continue;
    }
    let lus;
    try {
      lus = JSON.parse(l.bras);
    } catch {
      lus = null;
    }
    if (!lus || typeof lus !== 'object' || !lus.familles || typeof lus.familles !== 'object') {
      comptes.illisibles++;
      continue;
    }
    const bras = {};
    for (const [famille, x] of Object.entries(lus.familles)) {
      if (brasValide(x?.A) && brasValide(x?.B)) bras[famille] = { A: { lambda: x.A.lambda, mu: x.A.mu }, B: { lambda: x.B.lambda, mu: x.B.mu } };
    }
    matchs.push({ cle: l.match_key, date: l.date, league: l.league, buts, bras });
  }
  matchs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0));
  comptes.matchs = matchs.length;
  return { matchs, comptes };
}

/** LE RECALAGE d'un bras sur des matchs (forme fermée de Poisson, celle du banc) : { cDom, cExt, matchs } ; null s'il est impossible. */
export function recalerLeBras(matchs, famille, bras) {
  let yd = 0;
  let ye = 0;
  let ld = 0;
  let le = 0;
  let n = 0;
  for (const m of matchs) {
    const x = m.bras?.[famille]?.[bras];
    if (!brasValide(x) || !m.buts) continue;
    yd += m.buts.dom;
    ye += m.buts.ext;
    ld += x.lambda;
    le += x.mu;
    n += 1;
  }
  if (!n || !(yd > 0) || !(ye > 0) || !(ld > 0) || !(le > 0)) return null;
  return { cDom: Math.log(yd / ld), cExt: Math.log(ye / le), matchs: n };
}

/**
 * LES LIGNES DE LA PREUVE (pures) : pour chaque variante, sur les matchs CONCERNÉS (la fiche porte les deux bras de sa
 * famille), chaque bras recalé sur ces matchs ; une ligne par match { bloc, date, a, b } (la perte du score exact du bras A,
 * du bras B). Rend { lignes: { [id]: lignes }, recalages: { [id]: { A, B } | null } }.
 */
export function lignesDeLaPreuve(matchs, variantes) {
  const lignes = {};
  const recalages = {};
  for (const v of variantes) {
    const concernes = matchs.filter((m) => m.bras?.[v.famille]);
    const rA = recalerLeBras(concernes, v.famille, 'A');
    const rB = recalerLeBras(concernes, v.famille, 'B');
    recalages[v.id] = rA && rB ? { A: rA, B: rB } : null;
    if (!rA || !rB) {
      lignes[v.id] = [];
      continue;
    }
    const eA = [Math.exp(rA.cDom), Math.exp(rA.cExt)];
    const eB = [Math.exp(rB.cDom), Math.exp(rB.cExt)];
    lignes[v.id] = concernes.map((m) => {
      const { A, B } = m.bras[v.famille];
      return { bloc: m.cle, date: m.date, a: perteDuScore(grilleDuJuge(A.lambda * eA[0], A.mu * eA[1]), m.buts), b: perteDuScore(grilleDuJuge(B.lambda * eB[0], B.mu * eB[1]), m.buts) };
    });
  }
  return { lignes, recalages };
}

// ======================================================= l'horizon, le principal, la garde (le processus à part)

/** L'horizon d'une variante : { atteint, matchs, attendus, jours } (`horizon` : celui d'un essai, { matchs: { [id]: n } }). */
export function horizonDe(variante, { matchs, lancementLe, jourD, horizon = null }) {
  const attendus = horizon?.matchs?.[variante.id] ?? variante.horizon.matchs;
  const jours = Math.max(0, joursEntre(lancementLe, jourD));
  return { atteint: matchs >= attendus, matchs, attendus, jours };
}

/** Les principaux d'un état rangé qui sont ceux de CE lancement. */
const principauxDuLancement = (principal, le) => Object.fromEntries(Object.entries(principal && typeof principal === 'object' ? principal : {}).filter(([, p]) => p?.lancement === le));

/**
 * LE CALCUL DE LA PREUVE d'une nuit (dans le processus à part ; aucune écriture) : les premiers chiffres (des comptes), le
 * jugement principal des variantes qui atteignent leur horizon et ne l'ont pas encore (état de la nuit ou registre, pour CE
 * lancement) — jugerEtape SANS enregistrer —, et la garde du mois si elle est due. `lignes` : { [id]: lignes } ; `etat` :
 * { principal, surete, dementis } rangés ; `dejaAuRegistre` : les variantes dont le principal est au registre ; `fenetres` :
 * les fenêtres déjà vues que le juge écarte (fenetresVues de l'étape 35, calculées par preuveDansLaBase avec le même registre).
 * Rend { lancement, parVariante, principaux: { [id]: jugement }, garde }.
 */
export function calculerLaPreuve({ lignes, variantes, lancement, jourD, instant, etat = null, dejaAuRegistre = [], registre = {}, horizon = null, fenetres = [] }) {
  const le = lancement.le;
  const apres = (L) => (L ?? []).filter((l) => l.date > le);
  // Les lignes que le juge GARDERA (guard.js, jugerEtape, point 4) : après le jour du lancement ET hors de toute fenêtre déjà vue,
  // bornes comprises, comparaison de textes AAAA-MM-JJ. L'horizon et la garde comptent celles-là (avis du 14/11, constat 3).
  const vues = Array.isArray(fenetres) ? fenetres : [];
  const gardees = (L) => apres(L).filter((l) => !vues.some((f) => l.date >= f.de && l.date <= f.a));
  const pris = new Set([...Object.keys(principauxDuLancement(etat?.principal, le)), ...dejaAuRegistre]);
  const dementis = etat?.dementis && typeof etat.dementis === 'object' ? etat.dementis : {};
  const parVariante = [];
  const principaux = {};
  for (const v of variantes) {
    const h = horizonDe(v, { matchs: gardees(lignes[v.id]).length, lancementLe: le, jourD, horizon });
    const ecarteesDejaVues = apres(lignes[v.id]).length - h.matchs;
    parVariante.push({ id: v.id, famille: v.famille, matchs: h.matchs, ecarteesDejaVues, attendus: h.attendus, jours: h.jours, atteint: h.atteint, principalPris: pris.has(v.id), dementi: Boolean(dementis[v.id]) });
    // Jamais refait : un principal déjà pris pour ce lancement n'est plus jamais rejugé.
    if (pris.has(v.id)) continue;
    // Rien avant l'horizon.
    if (!h.atteint) continue;
    principaux[v.id] = jugerEtape({ etape: ETAPE_DE_LA_PREUVE, lignes: lignes[v.id] ?? [], mesure: MESURE_DE_LA_PREUVE, maintenant: instant, quoi: quoiDuPrincipal(v.id), principal: true, enregistrer: false, registre, tirages: JUGE.tirages, graine: JUGE.graine });
  }
  // La garde du mois : une fois par mois civil (Paris), 12 regards au plus, sur le cumul depuis le lancement.
  const mois = jourD.slice(0, 7);
  const surete = etat?.surete?.lancement === le ? etat.surete : null;
  const regards = surete?.regards ?? 0;
  const garde = { mois, faite: false, regard: false, regards, raison: null, resultats: {} };
  if (regards >= GARDE_MENSUELLE.regardsMax) garde.raison = `arrêtée après ${GARDE_MENSUELLE.regardsMax} regards`;
  else if (surete?.dernierMois === mois) garde.raison = 'déjà faite ce mois-ci';
  else {
    garde.faite = true;
    for (const v of variantes) {
      if (dementis[v.id]) {
        garde.resultats[v.id] = { verdict: null, deja: 'dementi' };
        continue;
      }
      const r = comparer(gardees(lignes[v.id]), { mode: 'moyenne', sens: 'min', variantes: GARDE_MENSUELLE.variantes, tirages: JUGE.tirages, graine: JUGE.graine });
      garde.resultats[v.id] = { verdict: r.verdict, gain: r.gain, fourchette: r.fourchette, matchs: r.n.matchs, blocs: r.n.blocs, z: r.seuil.z, variantes: r.seuil.variantes, raison: r.raison };
    }
    // Un regard ne compte que si le juge a pu juger au moins une famille (« pas assez de matchs » n'est pas un regard).
    garde.regard = Object.values(garde.resultats).some((r) => r.verdict && r.verdict !== 'pas-assez-de-matchs');
    if (!garde.regard) garde.raison = Object.values(garde.resultats).every((r) => r.deja === 'dementi') ? 'chaque famille est déjà démentie' : 'pas encore assez de matchs pour juger (200 au moins)';
  }
  return { lancement: { le, version: lancement.version ?? null }, parVariante, principaux, garde };
}

/**
 * LE CALCUL ENTIER, dans le processus à part (base en LECTURE SEULE) : les matchs de la preuve, leurs lignes (les bras de la
 * fiche, recalés), puis calculerLaPreuve. `instant` et `jourD` : reçus de la passe ; `lancement` : { le, version } ; le reste :
 * reçu du serveur (demandeDeLaPreuve). Rend { comptes, ...calculerLaPreuve } — jamais les lignes elles-mêmes.
 */
export function preuveDansLaBase({ database, instant, jourD, lancement, etat = null, dejaAuRegistre = [], registre = {}, horizon = null, note = DEBUTS_AU_BANC }) {
  const variantes = variantesDeLaPreuve(note);
  // Les fenêtres que le juge écarte, avec le registre qu'il lira (lecture seule, comme jugerEtape) : un registre illisible lève
  // ici, la nuit le range dans `preuve.erreur` (« à regarder »), jamais en échec (avis du 14/11, constat 3).
  const fenetres = fenetresVues(ETAPE_DE_LA_PREUVE, { ...registre, maintenant: instant });
  const { matchs, comptes } = lireLesMatchsDeLaPreuve(database, { depuis: lancement.le, avant: jourD, note });
  const { lignes, recalages } = lignesDeLaPreuve(matchs, variantes);
  comptes.lignes = Object.fromEntries(Object.entries(lignes).map(([id, L]) => [id, L.length]));
  comptes.recalageImpossible = Object.entries(recalages).filter(([, r]) => r === null).map(([id]) => id);
  return { comptes, ...calculerLaPreuve({ lignes, variantes, lancement, jourD, instant, etat, dejaAuRegistre, registre, horizon, fenetres }) };
}

// ======================================================= le serveur : la demande, le registre, l'état rangé

/** Ce que le registre et l'état disent d'un principal (sans les tirages). */
const resumeDuPrincipal = (j) => ({ le: j.le ?? null, quoi: j.quoi ?? null, verdict: j.verdict ?? null, gain: j.gain ?? null, fourchette: j.fourchette ?? null, enPourcent: j.enPourcent ?? null, matchs: j.n?.matchs ?? null, lancement: j.lancement ?? null, version: j.version ?? null, variantes: j.seuil?.variantes ?? null });

/**
 * LA DEMANDE de la nuit (le serveur, AVANT le processus à part) : les variantes à prouver, le lancement de l'étape 35 au
 * registre, les principaux déjà au registre pour ce lancement, et l'état rangé. Rien à demander (rend { rien }) : aucune
 * famille utile au banc, l'étape pas encore lancée, un registre illisible, ou tout est fait (chaque famille a son principal ou
 * un démenti, et la garde est arrêtée). Rend { lancement, etat, dejaAuRegistre, jugementsDejaAuRegistre, horizon } sinon.
 */
export function demandeDeLaPreuve({ instant, registre = {}, etat = null, horizon = null, note = DEBUTS_AU_BANC }) {
  const variantes = variantesDeLaPreuve(note);
  if (!variantes.length) return { rien: 'aucune famille utile au banc : rien à confirmer ; les fiches sont gardées' };
  let lancement;
  let deja;
  try {
    lancement = lancementDe(ETAPE_DE_LA_PREUVE, { ...registre, maintenant: instant });
    if (!lancement?.le) return { rien: 'l’étape 35 n’est pas encore lancée au registre de la mesure (le premier démarrage du serveur avec ce code la date) : rien à juger' };
    const ids = new Map(variantes.map((v) => [quoiDuPrincipal(v.id), v.id]));
    deja = jugementsDe(ETAPE_DE_LA_PREUVE, { ...registre, maintenant: instant }).filter((j) => j.principal === true && j.lancement === lancement.le && ids.has(j.quoi)).map((j) => ({ id: ids.get(j.quoi), jugement: resumeDuPrincipal(j) }));
  } catch (error) {
    return { rien: `registre de la mesure illisible : ${String(error?.message ?? error).slice(0, 160)} — rien de jugé cette nuit` };
  }
  const e = { principal: etat?.principal ?? null, surete: etat?.surete ?? null, dementis: etat?.dementis ?? null };
  const pris = new Set([...Object.keys(principauxDuLancement(e.principal, lancement.le)), ...deja.map((d) => d.id)]);
  const dementis = e.dementis && typeof e.dementis === 'object' ? e.dementis : {};
  const gardeArretee = e.surete?.lancement === lancement.le && (e.surete.regards ?? 0) >= GARDE_MENSUELLE.regardsMax;
  // Un principal « moins bon » au registre sans son démenti dans l'état (la transaction de sa nuit a échoué) : la preuve n'est pas
  // terminée, la nuit doit encore le démentir (etatApresLaPreuve) — vérification du 14/11, constat 2, cas de la garde arrêtée.
  const sansSonDementi = deja.some((d) => d.jugement?.verdict === 'moins-bon' && !dementis[d.id]);
  if (gardeArretee && !sansSonDementi && variantes.every((v) => pris.has(v.id) || dementis[v.id])) return { rien: 'preuve terminée : chaque famille a son jugement principal (ou un démenti) et la garde du mois s’est arrêtée après 12 regards' };
  return { lancement: { le: lancement.le, version: lancement.version ?? null }, etat: e, dejaAuRegistre: deja.map((d) => d.id), jugementsDejaAuRegistre: deja, horizon: horizon ?? null };
}

/**
 * LE RANGEMENT DES PRINCIPAUX au registre de la mesure (le serveur, seul écrivain) : chacun n'est écrit que s'il est bien
 * un principal de CE lancement, avec son `quoi`, et qu'aucun principal de même `quoi` n'y est déjà — jamais à la place
 * d'un autre, jamais deux fois. Rend { enregistres: { [id]: jugement rangé }, refuses: [{ id, raison }] }.
 */
export function rangerLesPrincipaux({ principaux = {}, lancement, registre = {}, instant }) {
  const enregistres = {};
  const refuses = [];
  const ids = Object.keys(principaux);
  if (!ids.length) return { enregistres, refuses };
  const options = { ...registre, maintenant: instant };
  const deja = jugementsDe(ETAPE_DE_LA_PREUVE, options).filter((j) => j.principal === true && j.lancement === lancement.le);
  for (const id of ids) {
    const j = principaux[id];
    if (deja.some((x) => x.quoi === quoiDuPrincipal(id))) refuses.push({ id, raison: 'déjà au registre pour ce lancement' });
    else if (!j || j.principal !== true || j.quoi !== quoiDuPrincipal(id) || j.lancement !== lancement.le || j.etape !== ETAPE_DE_LA_PREUVE) refuses.push({ id, raison: 'pas un principal de ce lancement' });
    else enregistres[id] = enregistrerJugement(ETAPE_DE_LA_PREUVE, j, options);
  }
  return { enregistres, refuses };
}

/**
 * L'ÉTAT RANGÉ APRÈS LA NUIT (pur ; le serveur l'écrit dans `debuts_etat`) : `preuve` (les premiers chiffres — des comptes,
 * jamais un gain ni un verdict), `principal` (ceux de ce lancement : l'état d'avant, ceux du registre, ceux rangés cette
 * nuit), `surete` (la garde : regards, dernier mois, historique) et `dementis` (jamais retirés ; ajoutés pour un « moins
 * bon » de la garde ou du principal). Rend { preuve, principal, surete, dementis, nouveauxDementis }.
 */
export function etatApresLaPreuve({ etatAvant = null, calcul, enregistres = {}, dejaAuRegistre = [], lancement, instant, jourD, variantes = variantesDeLaPreuve() }) {
  const le = lancement.le;
  const quand = iso(instant);
  const familleDe = (id) => variantes.find((v) => v.id === id)?.famille ?? (calcul.parVariante ?? []).find((v) => v.id === id)?.famille ?? null;
  const principal = principauxDuLancement(etatAvant?.principal, le);
  for (const d of dejaAuRegistre) if (!principal[d.id]) principal[d.id] = d.jugement;
  for (const [id, j] of Object.entries(enregistres)) principal[id] = resumeDuPrincipal(j);
  const dementis = { ...(etatAvant?.dementis && typeof etatAvant.dementis === 'object' ? etatAvant.dementis : {}) };
  const nouveauxDementis = [];
  const dementir = (id, valeur) => {
    if (dementis[id]) return;
    dementis[id] = { famille: familleDe(id), jour: jourD, ...valeur };
    nouveauxDementis.push(id);
  };
  for (const [id, j] of Object.entries(enregistres)) {
    if (j.verdict === 'moins-bon') dementir(id, { le: quand, depuis: le, source: 'principal', verdict: j.verdict, gain: j.gain ?? null, fourchette: j.fourchette ?? null, matchs: j.n?.matchs ?? null });
  }
  // Un principal « moins bon » déjà au registre mais absent de l'état (la transaction de la nuit qui l'a rangé a échoué) dément
  // quand même, la nuit suivante : sinon son démenti et son alerte seraient perdus (vérification du 14/11, constat 2).
  for (const d of dejaAuRegistre) {
    if (d?.jugement?.verdict === 'moins-bon') dementir(d.id, { le: d.jugement.le ?? quand, depuis: le, source: 'principal', verdict: d.jugement.verdict, gain: d.jugement.gain ?? null, fourchette: d.jugement.fourchette ?? null, matchs: d.jugement.matchs ?? null });
  }
  const g = calcul.garde ?? { faite: false, regard: false };
  const avant = etatAvant?.surete?.lancement === le ? etatAvant.surete : { lancement: le, regards: 0, dernierMois: null, historique: [] };
  let surete;
  if (g.regard) {
    const verdicts = Object.fromEntries(Object.entries(g.resultats).map(([id, r]) => [id, r.verdict ?? r.deja ?? null]));
    surete = { lancement: le, regards: (avant.regards ?? 0) + 1, regardsMax: GARDE_MENSUELLE.regardsMax, variantes: GARDE_MENSUELLE.variantes, dernierMois: g.mois, dernier: { le: quand, mois: g.mois, resultats: g.resultats }, historique: [...(avant.historique ?? []), { mois: g.mois, le: quand, verdicts }].slice(-GARDE_MENSUELLE.regardsMax) };
    for (const [id, r] of Object.entries(g.resultats)) {
      if (r.verdict === 'moins-bon') dementir(id, { le: quand, depuis: le, source: 'garde-du-mois', mois: g.mois, verdict: r.verdict, gain: r.gain ?? null, fourchette: r.fourchette ?? null, matchs: r.matchs ?? null, z: r.z ?? null, variantes: r.variantes ?? null });
    }
  } else {
    surete = { ...avant, regardsMax: GARDE_MENSUELLE.regardsMax, variantes: GARDE_MENSUELLE.variantes, essai: { le: quand, mois: g.mois ?? jourD.slice(0, 7), raison: g.raison ?? null } };
  }
  const preuve = {
    le: quand,
    jourD,
    lancement: le,
    version: lancement.version ?? null,
    variantes: (calcul.parVariante ?? []).map((v) => ({ ...v, principalPris: Boolean(principal[v.id]), dementi: Boolean(dementis[v.id]) })),
    comptes: calcul.comptes ?? null,
    garde: { regards: surete.regards ?? 0, regardsMax: GARDE_MENSUELLE.regardsMax, dernierMois: surete.dernierMois ?? null, faiteCetteNuit: Boolean(g.regard), raison: g.regard ? null : g.raison ?? null }
  };
  return { preuve, principal, surete, dementis, nouveauxDementis };
}

// ======================================================= les mots (l'étape de nuit) et l'alerte durable

const entier = (n) => (fini(Number(n)) ? Number(n).toLocaleString('fr-FR') : '?');
const jourDit = (j) => (typeof j === 'string' && /^\d{4}-\d{2}-\d{2}/.test(j) ? `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}` : String(j ?? '?'));
const nomDe = (famille, id) => NOMS_DES_FAMILLES[famille] ?? id;
const VERDICTS_DITS = Object.freeze({ retenu: 'confirmé', 'pas-prouve': 'pas prouvé (la famille garde son statut du banc)', 'moins-bon': 'moins bon : démenti', 'pas-assez-de-matchs': 'pas assez de matchs' });
/**
 * Les matchs d'après le lancement que le juge écarte (déjà vus par une version du moteur) : jamais comptés ni jugés, dits à part
 * — « autres » : le compte affiché ne les contient pas ; il peut reculer le jour où une telle fenêtre est déclarée (constat 3).
 */
const ecartesDits = (v) => {
  const n = Number(v?.ecarteesDejaVues);
  return fini(n) && n > 0 ? ` (${entier(n)} ${n > 1 ? 'autres écartés : déjà vus' : 'autre écarté : déjà vu'} par une version du moteur)` : '';
};

/**
 * LE MORCEAU DE LA PREUVE pour le résumé de l'étape de nuit (`p` : le bloc `preuve` rendu par faireLesDebutsDeLaNuit),
 * posé AVANT le contrôle anti-fuite (qui reste le dernier morceau du résumé) : « preuve sur vos matchs : … », sans point
 * final. Toujours dit, jamais un silence ; jamais un chiffre provisoire (des comptes seulement avant l'horizon).
 */
export function phraseDeLaPreuve(p) {
  const dit = (texte) => `preuve sur vos matchs : ${texte}`;
  if (!p) return dit('pas calculée cette nuit');
  if (p.rien) return dit(String(p.rien).replace(/\.$/, ''));
  if (p.erreur) return dit(`en échec (${String(p.erreur).replace(/\.$/, '')}) — rien de jugé ni de rangé cette nuit, les fiches restent`);
  const e = p.etat ?? {};
  const vs = e.variantes ?? [];
  const morceaux = [];
  const enAttente = vs.filter((v) => !v.principalPris && !v.dementi);
  if (enAttente.length) {
    morceaux.push(`${enAttente.map((v) => `${nomDe(v.famille, v.id)} ${entier(v.matchs)} ${v.matchs > 1 ? 'matchs concernés' : 'match concerné'} sur ${entier(v.attendus)}${ecartesDits(v)}`).join(', ')} depuis le ${jourDit(e.lancement)}, rien de jugé avant l’horizon, des comptes seulement — ${REPONSE_ATTENDUE}`);
  }
  const ranges = new Set(p.principauxRanges ?? []);
  for (const id of ranges) {
    const v = vs.find((x) => x.id === id);
    const j = p.principal?.[id];
    morceaux.push(`jugement principal pris cette nuit pour ${nomDe(v?.famille, id)} : ${VERDICTS_DITS[j?.verdict] ?? j?.verdict ?? '?'} (${entier(j?.matchs)} matchs)`);
  }
  const anciens = vs.filter((v) => v.principalPris && !ranges.has(v.id));
  if (anciens.length) {
    const ancien = (v) => {
      const j = p.principal?.[v.id];
      return `${nomDe(v.famille, v.id)} ${VERDICTS_DITS[j?.verdict] ?? j?.verdict ?? '?'} le ${jourDit(String(j?.le ?? '').slice(0, 10))}`;
    };
    morceaux.push(`jugement principal déjà pris, jamais refait (${anciens.map(ancien).join(', ')})`);
  }
  const g = e.garde ?? {};
  const regards = `${entier(g.regards)} regard${g.regards > 1 ? 's' : ''} sur ${entier(g.regardsMax)}`;
  if (g.faiteCetteNuit) morceaux.push(`garde du mois faite (${regards})`);
  else if (g.raison) morceaux.push(`garde du mois : ${g.raison} (${regards})`);
  const dementis = Object.entries(p.dementis ?? {});
  if (dementis.length) morceaux.push(`DÉMENTI sur vos matchs : ${dementis.map(([id, d]) => `${nomDe(d?.famille ?? vs.find((x) => x.id === id)?.famille, id)} depuis le ${jourDit(d?.jour ?? String(d?.le ?? '').slice(0, 10))}`).join(', ')}, repassé en « Explication seulement »`);
  return dit(morceaux.length ? morceaux.join(' ; ') : 'rien de neuf');
}

/** Les démentis pour l'alerte durable : [{ variante, famille, le, depuis, source }] (vide sans démenti). */
export function dementisDeLAlerte(dementis) {
  return dementis && typeof dementis === 'object' ? Object.entries(dementis).map(([variante, x]) => ({ variante, famille: x?.famille ?? null, le: x?.le ?? null, jour: x?.jour ?? null, depuis: x?.depuis ?? null, source: x?.source ?? null })) : [];
}
