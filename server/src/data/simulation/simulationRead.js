/**
 * simulationRead.js — CE QUE L'APPLI LIT DE LA SIMULATION (étape 28 du plan, conception §2.3, §4.6 et §5).
 * -----------------------------------------------------------------------
 * LECTURE SEULE, jamais un calcul lourd : on lit les lignes rangées la nuit (une lecture et une repondération de
 * table, ~0,07 ms ; un combiné, quelques µs). AUCUNE simulation dans une requête (règle des 25 ms). Une nuit EN COURS
 * de rangement est ignorée : on lit la dernière nuit complète (nuit_* de simulation_state).
 *   loiAffichee   la loi des fins de saison montrée : « forces » si au moins 90 % des clubs de la table ont des
 *                 forces de buts de l'empreinte de la nuit, calculées depuis D − 3 au plus ; sinon « table », dite ;
 *   saisonDe      la fin de saison d'un championnat (la dernière nuit complète), ou { calcule: false, raison } ;
 *   enjeuxDu / enjeuDe   l'enjeu des rencontres, par identifiants FotMob, de la loi affichée (jamais un mélange) ;
 *   ligneDuMatch  la dernière ligne de nuit d'une rencontre et d'un rôle ;
 *   simulationDuMatch   le bloc de la page du match { affichage, enjeu, deroule } (ajouté APRÈS l'analyse) ;
 *   prixDuCombine le prix juste d'un ticket (POST /api/simulation/prix-combine), serveur seulement.
 * `maintenant` est passé par l'appelant (la route) : jamais l'horloge lue ici. Textes en français simple, virgule
 * décimale, provenance réelle avec l'heure.
 * -----------------------------------------------------------------------
 */

import { isCup } from '../providers/leagueCups.js';
import { etatForcesButs } from '../db/forcesButs.js';
import { reglagesDuModeleDeButs } from '../../core/engine/goalModel.js';
import { deriveBetLegOutcome } from '../../core/settlement/settlementRules.js';
import { distributionDuMarche } from '../../sports/football/markets.js';
import { lireEtat, affichageEffectif } from './etatSimulation.js';
import { FAMILLES, BORNES_AFFICHAGE, ARRONDI_ENJEU, SEUILS_ENJEU, LOI_AFFICHEE, DEPARTAGE_SIMPLIFIE, CHAMPIONNATS_A_SCISSION, LIBELLES_DE_SCISSION, ECARTS_MESURES_V, ECART_MAX, N } from './reglages.js';
import { lireTableJointe, marchesDeDeroule } from './simulationMatch.js';
import { grilleDesEntrees, alignerSurLe1N2, entreesDeLAnalyse, GRILLES } from './entreesSimulation.js';
import { probabiliteDuCombine, combinerLesMatchs, ecartALaCote, MARCHES_DE_DEROULE } from './jambes.js';
import { idFotMob } from './saisons.js';
import { marchesEcartes, estEcarte, jambeEcartee, combineEcarte } from './marchesEcartes.js';
import { NOTE_DE_LA_SIMULATION } from './noteDeLaSimulation.js';

const JOUR_MS = 86_400_000;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const tableAbsente = (error) => /no such table/i.test(String(error?.message ?? ''));
const toutesLes = (database, sql, ...p) => {
  try {
    return database.prepare(sql).all(...p);
  } catch (error) {
    if (tableAbsente(error)) return [];
    throw error;
  }
};
const uneLigne = (database, sql, ...p) => toutesLes(database, sql, ...p)[0] ?? null;
const json = (t) => {
  if (typeof t !== 'string' || !t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

// ------------------------------------------------------------ l'heure de Paris, en mots

const instantDe = (maintenant) => {
  const t = maintenant instanceof Date ? maintenant.getTime() : typeof maintenant === 'number' ? maintenant : Date.parse(String(maintenant ?? ''));
  if (!fini(t)) throw new Error('simulationRead : « maintenant » (l’heure de la requête) est obligatoire.');
  return t;
};
const FORMAT_JOUR = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' });
const PARTIES = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit', hour12: false });
const parties = (t) => Object.fromEntries(PARTIES.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
/** Le jour civil de Paris (AAAA-MM-JJ). */
export const jourParis = (t) => FORMAT_JOUR.format(new Date(t));
/** « 26/10 » (Paris). */
export const jourDit = (iso) => {
  const p = parties(Date.parse(iso));
  return `${p.day}/${p.month}`;
};
/** « 0 h 41 » (Paris). */
export const heureDite = (iso) => {
  const p = parties(Date.parse(iso));
  return `${Number(p.hour)} h ${p.minute}`;
};
/** « la nuit du 26/10 à 0 h 41 ». */
export const nuitDite = (iso) => `la nuit du ${jourDit(iso)} à ${heureDite(iso)}`;
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const virgule = (x, d = 1) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

// ------------------------------------------------------------ les phrases

/** La provenance et la mesure des fins de saison (conception §5). */
export const MESURE_DES_SAISONS = 'Mesuré sur les saisons 2023-2026 (149 phases) avec le calendrier connu après coup, pas encore sur la saison en cours.';
export const PHRASE_LOI_TABLE =
  'loi : classement officiel seul — le modèle de buts n’est pas en service. Sur 2023-2026, cette loi est trop sûre d’elle (Europe : 85 % annoncés, 77 % arrivés) : lisez les pourcentages comme des ordres de grandeur';
/**
 * La loi « classement seul » quand la nuit AVAIT les forces de buts du modèle, mais que la lecture les trouve absentes, en
 * cours de rangement, trop vieilles ou trop rares (vérification du 27/10, constat 20) : la cause n'est pas « le modèle de
 * buts n'est pas en service ». La mise en garde « trop sûre d'elle » porte sur la loi, pas sur la cause : gardée.
 */
export const PHRASE_LOI_TABLE_FORCES_PERIMEES =
  'loi : classement officiel seul — les forces de buts du modèle manquent ou ne sont pas à jour. Sur 2023-2026, cette loi est trop sûre d’elle (Europe : 85 % annoncés, 77 % arrivés) : lisez les pourcentages comme des ordres de grandeur';
export const PHRASE_LOI_FORCES_ESSAI = 'loi : forces de buts du modèle en essai (étape 27, pas encore adopté)';
export const PHRASE_LOI_FORCES_SERVICE = 'loi : forces de buts du modèle de buts en service';
export const PRIX_ETEINT = 'Prix juste : calculé à blanc chaque nuit, pas encore montré : il attend le modèle de buts (étape 27) et la preuve de l’étape 28.';
const LIBELLE_FAMILLE = Object.fromEntries(FAMILLES.map((f) => [f.cle, f.libelle]));

/**
 * Une probabilité de famille telle qu'on la MONTRE : loi « forces », au point près entre 10 et 90 %, « ≥ 90 % » et
 * « ≤ 10 % » au-delà ; loi « table » (trop sûre d'elle), arrondie à 10 et plafonnée ; 10 000 tirages sur 10 000 dans le
 * même sens : gris, « acquis sauf surprise » (jamais « 100 % »).
 */
export function texteDeProbabilite(p, { loi = 'forces', unanime = false } = {}) {
  if (!fini(p)) return { texte: '—', gris: true };
  if (unanime && p >= 0.5) return { texte: 'acquis sauf surprise', gris: true };
  if (p >= BORNES_AFFICHAGE.haut) return { texte: `≥ ${Math.round(BORNES_AFFICHAGE.haut * 100)} %`, gris: Boolean(unanime) };
  if (p <= BORNES_AFFICHAGE.bas) return { texte: `≤ ${Math.round(BORNES_AFFICHAGE.bas * 100)} %`, gris: Boolean(unanime) };
  if (loi === 'table') return { texte: `${Math.round(p * 10) * 10} %`, gris: false };
  return { texte: `${Math.round(p * 100)} %`, gris: false };
}

/** Un enjeu arrondi à 5 points (le bruit vaut ~1 point). */
export const arrondiEnjeu = (x) => (fini(x) ? Math.round(x / ARRONDI_ENJEU) * ARRONDI_ENJEU : null);
/**
 * Une probabilité de la phrase de l'enjeu, arrondie à 5 — jamais « 100 % » ni « 0 % » : rien n'est certain. Aux
 * extrêmes, les MÊMES seuils que le tableau « Fin de saison » (texteDeProbabilite, BORNES_AFFICHAGE) : « ≥ 90 % » dès
 * p ≥ 0,9 et « ≤ 10 % » dès p ≤ 0,1, comparés à p lui-même et non à l'arrondi (vérification du 27/10, constat 2 : la
 * phrase ne dit jamais « 95 % » quand le tableau dit « ≥ 90 % ») ; entre les deux, arrondie à 5.
 */
const pc5 = (p) => {
  if (!fini(p)) return '—';
  if (p >= BORNES_AFFICHAGE.haut) return `≥ ${Math.round(BORNES_AFFICHAGE.haut * 100)} %`;
  if (p <= BORNES_AFFICHAGE.bas) return `≤ ${Math.round(BORNES_AFFICHAGE.bas * 100)} %`;
  return `${arrondiEnjeu(100 * p)} %`;
};
/** Sous cet écart entre victoire et défaite (le seuil « sans enjeu », en probabilité), un camp n'a presque rien à jouer. */
const PRESQUE_RIEN = SEUILS_ENJEU.sans / 100;
/** « autour de 60 % » ; une borne (« ≥ 90 % », « ≤ 10 % ») se dit telle quelle. */
const autourDe = (x) => (/^[≥≤]/.test(x) ? x : `autour de ${x}`);

/** Ce qu'un camp « joue » dans une famille de zones, en mots. */
const CE_QUI_SE_JOUE = {
  premiere: (nom) => `${nom} joue la 1re place`,
  europe: (nom) => `${nom} joue l’Europe`,
  promotion: (nom) => `${nom} joue la montée`,
  promotion_barrage: (nom) => `${nom} joue le barrage de montée`,
  playoff: (nom) => `${nom} joue la phase finale`,
  relegation_barrage: (nom) => `${nom} joue sa place (barrage de descente)`,
  relegation: (nom) => `${nom} joue sa survie`
};

/** Avant la scission (14 championnats), les deux familles de la table régulière disent autre chose. */
const CE_QUI_SE_JOUE_AVANT_LA_SCISSION = {
  playoff: (nom) => `${nom} joue le haut du tableau`,
  relegation_barrage: (nom) => `${nom} joue pour éviter le groupe de relégation`
};

/**
 * La phrase d'un camp : la famille qui fait son enjeu (le plus grand écart entre victoire et défaite), arrondie à 5.
 * Rend { rien, texte } ou null : `rien` quand ce camp n'a presque rien à jouer (moins de 2 points dans toutes ses zones) —
 * le dire, plutôt que « joue la 1re place : 0 % en cas de victoire, 0 % en cas de défaite » (vu dans le bac le 27/10/2026,
 * l'autre camp portant seul le gros enjeu). Vérification du 27/10 (constats 18 et 22) : chaque chiffre dit s'il va avec la
 * victoire ou avec la défaite (« 45 % de descente en cas de victoire, 70 % en cas de défaite ») ; quand les deux chiffres
 * ARRONDIS coïncident (un écart de 2 à 5 points, ou deux bornes), « autour de 60 % quelle que soit l'issue » — jamais
 * deux fois le même chiffre sous « joue l'Europe » ; « points d'écart » ne se dit plus (à côté d'un classement, on y
 * lirait des points de classement).
 */
function phraseDUnCamp(nom, cote, { scission = false } = {}) {
  let meilleur = null;
  for (const [cle, v] of Object.entries(cote?.parFamille ?? {})) {
    if (!fini(v?.gagne) || !fini(v?.perd)) continue;
    const ecart = Math.abs(v.gagne - v.perd);
    if (!meilleur || ecart > meilleur.ecart) meilleur = { famille: cle.split('|').at(-1), ...v, ecart };
  }
  if (!meilleur) return null;
  if (meilleur.ecart < PRESQUE_RIEN) return { rien: true, nom, texte: `${nom} n’a presque rien à jouer : ses chances ne changent presque pas entre une victoire et une défaite, quelle que soit la zone` };
  const f = meilleur.famille;
  const dit = ((scission && CE_QUI_SE_JOUE_AVANT_LA_SCISSION[f]) || CE_QUI_SE_JOUE[f] || ((n) => `${n} joue ${LIBELLE_FAMILLE[f] ?? f}`))(nom);
  const g = pc5(meilleur.gagne);
  const p = pc5(meilleur.perd);
  if (f === 'relegation' || f === 'relegation_barrage') {
    const quoi = f === 'relegation' ? 'descente' : scission ? 'groupe de relégation' : 'barrage de descente';
    if (g === p) return { rien: false, nom, texte: `${dit} : ${autourDe(g)} de ${quoi} quelle que soit l’issue` };
    return { rien: false, nom, texte: `${dit} : ${g} de ${quoi} en cas de victoire, ${p} en cas de défaite` };
  }
  if (g === p) return { rien: false, nom, texte: `${dit} : ${autourDe(g)} quelle que soit l’issue` };
  return { rien: false, nom, texte: `${dit} : ${g} en cas de victoire, ${p} en cas de défaite` };
}

/** La phrase d'un enjeu (au survol et dans aria-label), depuis le détail rangé ; `league` : pour dire une scission. */
export function phraseDeLEnjeu(detail, { league = null } = {}) {
  const d = typeof detail === 'string' ? json(detail) : detail;
  if (!d) return null;
  const scission = CHAMPIONNATS_A_SCISSION.includes(league);
  const camps = [phraseDUnCamp(d.noms?.dom ?? 'Le club qui reçoit', d.dom, { scission }), phraseDUnCamp(d.noms?.ext ?? 'le visiteur', d.ext, { scission })].filter(Boolean);
  // Les deux camps sans rien à jouer : une seule phrase, pas deux fois la même.
  if (camps.length === 2 && camps.every((c) => c.rien)) {
    return `${camps[0].nom} et ${camps[1].nom} n’ont presque rien à jouer : leurs chances ne changent presque pas entre une victoire et une défaite, quelle que soit la zone.`;
  }
  return camps.length ? `${camps.map((c) => c.texte).join(' ; ')}.` : null;
}

const LIBELLE_CATEGORIE = { 'gros-enjeu': 'Gros enjeu', 'sans-enjeu': 'Sans enjeu', enjeu: null, 'non-calcule': 'Enjeu non calculé' };

// ------------------------------------------------------------ la nuit lue

/** La dernière nuit COMPLÈTE de fins de saison (jamais celle en cours de rangement), ou null. */
const nuitDesSaisons = (database) => lireEtat({ database }).nuits.saisons?.calculeLe ?? null;
const nuitDesMatchs = (database) => lireEtat({ database }).nuits.matchs?.calculeLe ?? null;

/** La ligne de saisons_etat d'un championnat pour la dernière nuit complète, ou null. */
export function etatDeLaSaison(database, league) {
  const nuit = nuitDesSaisons(database);
  return nuit ? uneLigne(database, 'SELECT * FROM saisons_etat WHERE league = ? AND calcule_le = ?', league, nuit) : null;
}

/**
 * LA LOI AFFICHÉE des fins de saison d'un championnat (règle C §1.2, T9 bis), choisie À LA LECTURE : « forces » si les
 * forces de buts de l'empreinte de la nuit sont servies (rangement fini), calculées le jour D − 3 ou après (D = le jour
 * de Paris de la lecture), et portent une ligne pour au moins 90 % des clubs de la table ; sinon « table ». La phrase dit
 * la loi dans chaque cas (forces du modèle en essai, forces du modèle en service, classement seul). Une nuit en cours
 * est ignorée. Rend { loi, phrase, part, pourquoi }.
 */
export function loiAffichee(league, { database, maintenant, reglagesEnService = null, etat = undefined } = {}) {
  const t = instantDe(maintenant);
  const e = etat === undefined ? etatDeLaSaison(database, league) : etat;
  // La nuit avait les forces de buts du modèle (forces_empreinte) mais la lecture les refuse : la phrase dit cette cause,
  // pas « le modèle de buts n'est pas en service » (vérification du 27/10, constat 20).
  const table = (pourquoi, part = 0) => ({ loi: 'table', phrase: e?.forces_empreinte ? PHRASE_LOI_TABLE_FORCES_PERIMEES : PHRASE_LOI_TABLE, part, pourquoi });
  if (!e?.forces_empreinte) return table('la nuit n’a pas calculé la loi « forces »');
  const clubs = toutesLes(database, "SELECT DISTINCT team_id FROM saisons_simulees WHERE league = ? AND calcule_le = ? AND loi = 'forces'", league, e.calcule_le).map((r) => r.team_id);
  if (!clubs.length) return table('aucune probabilité « forces » rangée');
  let f;
  try {
    f = etatForcesButs({ database, empreintes: [e.forces_empreinte] });
  } catch {
    return table('forces de buts illisibles');
  }
  if (f.absent || f.enCours || !f.empreintes.includes(e.forces_empreinte)) return table('forces de buts absentes ou en cours de rangement');
  const jourD = jourParis(t);
  if (!f.calculeLe || jourParis(Date.parse(f.calculeLe)) < plusJours(jourD, -LOI_AFFICHEE.joursMax)) return table(`forces de buts plus vieilles que ${LOI_AFFICHEE.joursMax} jours`);
  const lire = (() => {
    try {
      return database.prepare('SELECT 1 FROM forces_buts WHERE reglages = ? AND club = ? AND jour < ? LIMIT 1');
    } catch {
      return null;
    }
  })();
  const avec = lire ? clubs.filter((id) => lire.get(e.forces_empreinte, Number(id), jourD)).length : 0;
  const part = avec / clubs.length;
  if (part < LOI_AFFICHEE.partMin) return table(`forces de buts pour ${Math.round(part * 100)} % des clubs seulement (90 % demandés)`, part);
  let enService = false;
  try {
    enService = reglagesDuModeleDeButs(reglagesEnService) !== null;
  } catch {
    enService = false;
  }
  return { loi: 'forces', phrase: enService ? PHRASE_LOI_FORCES_SERVICE : PHRASE_LOI_FORCES_ESSAI, part, pourquoi: null };
}

/** L'ordre OFFICIEL d'une table (jamais réordonné) et les noms : la table relevée que la nuit a lue. */
function lignesOfficielles(database, { league, season, nom, avant }) {
  const t = uneLigne(database, 'SELECT rows FROM standings_official WHERE league = ? AND season = ? AND table_name = ? AND fetched_at <= ? ORDER BY fetched_at DESC LIMIT 1', league, Number(season), nom, avant);
  const rows = json(t?.rows) ?? [];
  return rows.map((r) => ({ teamId: idFotMob(r.teamId), nom: r.teamName ?? r.shortName ?? null, rang: r.rank ?? null, points: r.points ?? null, penalite: fini(Number(r.deduction)) && Number(r.deduction) !== 0 ? Math.abs(Number(r.deduction)) : 0 }));
}

/**
 * LA FIN DE SAISON d'un championnat (GET /api/simulation/saison?league=) : la dernière nuit complète, la loi affichée
 * et sa phrase, une colonne par famille présente, l'ordre officiel, les textes à montrer ; ou { calcule: false, raison }
 * (jamais une coupe).
 */
export function saisonDe(league, { database, maintenant, reglagesEnService = null } = {}) {
  const t = instantDe(maintenant);
  if (typeof league !== 'string' || !league.trim()) return { calcule: false, raison: 'Championnat non précisé.' };
  if (isCup(league)) return { calcule: false, raison: 'Pas de fin de saison pour une coupe.' };
  const nuit = nuitDesSaisons(database);
  if (!nuit) return { calcule: false, raison: 'Fin de saison pas encore calculée : la première nuit après la mise en service la calculera.' };
  const e = etatDeLaSaison(database, league);
  if (!e) return { calcule: false, raison: `Fin de saison non calculée cette nuit pour ce championnat (${nuitDite(nuit)}).`, calculeLe: nuit };
  if (!e.complet) return { calcule: false, raison: `Fin de saison non calculée — ${e.raison ?? 'raison non dite'}`, calculeLe: e.calcule_le };
  const loi = loiAffichee(league, { database, maintenant: t, reglagesEnService, etat: e });
  const lignes = toutesLes(database, 'SELECT table_name, team_id, famille, probabilite, unanime FROM saisons_simulees WHERE league = ? AND calcule_le = ? AND loi = ?', league, e.calcule_le, loi.loi);
  const parTable = new Map();
  for (const l of lignes) {
    if (!parTable.has(l.table_name)) parTable.set(l.table_name, new Map());
    const club = parTable.get(l.table_name).get(l.team_id) ?? {};
    club[l.famille] = { p: l.probabilite, unanime: l.unanime === 1, ...texteDeProbabilite(l.probabilite, { loi: loi.loi, unanime: l.unanime === 1 }) };
    parTable.get(l.table_name).set(l.team_id, club);
  }
  const noms = json(e.tables) ?? [...parTable.keys()];
  // Une table à scission : ses deux familles disent ce qu'elles veulent dire AVANT la scission.
  const scission = CHAMPIONNATS_A_SCISSION.includes(league);
  const libelleDe = (cle) => (scission && LIBELLES_DE_SCISSION[cle]) || LIBELLE_FAMILLE[cle];
  const tables = noms.map((nom) => {
    const officielles = lignesOfficielles(database, { league, season: e.season, nom, avant: e.calcule_le });
    const clubs = parTable.get(nom) ?? new Map();
    const familles = FAMILLES.map((f) => f.cle).filter((cle) => [...clubs.values()].some((c) => c[cle]));
    const ordre = officielles.length ? officielles : [...clubs.keys()].map((id) => ({ teamId: id, nom: null, rang: null, points: null, penalite: 0 }));
    return {
      nom,
      familles: familles.map((cle) => ({ cle, libelle: libelleDe(cle) })),
      clubs: ordre.map((o) => ({ ...o, familles: clubs.get(o.teamId) ?? {} }))
    };
  });
  const mentions = [];
  if (scission) mentions.push('jusqu’à la scission : titre, Europe et descente se jouent ensuite');
  if (DEPARTAGE_SIMPLIFIE.includes(league)) mentions.push('départage simplifié (différence de buts)');
  if (e.raison === 'saison terminée') mentions.push('saison terminée');
  const restants = e.restants ?? 0;
  const detail = [
    `${(e.n ?? N).toLocaleString('fr-FR')} fins de saison simulées ${nuitDite(e.calcule_le)}`,
    e.table_relevee_le ? `classement relevé le ${jourDit(e.table_relevee_le)} à ${heureDite(e.table_relevee_le)}` : null,
    `${restants.toLocaleString('fr-FR')} rencontres restantes${e.a_dater ? `, dont ${e.a_dater.toLocaleString('fr-FR')} pas encore datées` : ', toutes datées'}`,
    loi.phrase
  ].filter(Boolean);
  return {
    calcule: true,
    league,
    season: e.season,
    calculeLe: e.calcule_le,
    loi,
    tables,
    mentions,
    mesure: MESURE_DES_SAISONS,
    provenance: { source: 'Simulation CôteMaster, classement FotMob', detail: detail.join(' · '), calculeLe: e.calcule_le },
    restants,
    aDater: e.a_dater ?? 0
  };
}

// ------------------------------------------------------------ l'enjeu

/**
 * QUAND un enjeu a été calculé, en mots vrais (vérification du 27/10, constat 19) : la nuit recalcule l'enjeu de chaque
 * rencontre des 14 jours jusqu'à la VEILLE du match (une rencontre du jour de la nuit, heure inconnue, n'est plus
 * réécrite : figée). Une ligne d'une rencontre APRÈS le jour de sa nuit : « refait chaque nuit jusqu'à la veille du match,
 * puis gardé tel quel » ; sinon (la rencontre du jour même) : « gardé tel quel jusqu'au coup d'envoi ».
 */
export function quandDeLEnjeu(r) {
  const nuit = nuitDite(r.calcule_le).replace(/ à .*$/, '');
  const jourDeLaNuit = jourParis(Date.parse(r.calcule_le));
  return typeof r.date === 'string' && r.date > jourDeLaNuit ? `calculé ${nuit}, refait chaque nuit jusqu’à la veille du match, puis gardé tel quel` : `calculé ${nuit}, gardé tel quel jusqu’au coup d’envoi`;
}

/** Une ligne d'enjeu telle qu'on la montre (catégorie, enjeux arrondis à 5, phrase, quand). */
function enjeuMontre(r, loi) {
  const detail = json(r.detail);
  return {
    league: r.league,
    date: r.date,
    homeId: r.home_id,
    awayId: r.away_id,
    matchId: r.match_id ?? null,
    kickoff: r.kickoff ?? null,
    loi: r.loi,
    loiPhrase: loi?.phrase ?? null,
    categorie: r.categorie,
    libelle: LIBELLE_CATEGORIE[r.categorie] ?? null,
    enjeuDom: arrondiEnjeu(r.enjeu_dom),
    enjeuExt: arrondiEnjeu(r.enjeu_ext),
    phrase: phraseDeLEnjeu(detail, { league: r.league }),
    calculeLe: r.calcule_le,
    quand: quandDeLEnjeu(r)
  };
}

/**
 * Une ligne d'enjeu est-elle à lire ? Oui si la dernière nuit complète l'a écrite, ou si elle est FIGÉE (le coup d'envoi
 * était passé pour cette nuit : heure inconnue, la rencontre datée du jour de la nuit ou avant). Une ligne d'une date
 * future que la dernière nuit n'a pas réécrite est ORPHELINE (rencontre reportée, championnat non calculé cette nuit) :
 * jamais lue (conception §4.3, B C7).
 */
function aLire(r, nuit) {
  if (!nuit?.calculeLe) return false;
  if (r.calcule_le === nuit.calculeLe) return true;
  const ko = Date.parse(r.kickoff ?? '');
  if (fini(ko)) return ko <= Date.parse(nuit.calculeLe);
  return typeof r.date === 'string' && r.date <= (nuit.jourD ?? jourParis(Date.parse(nuit.calculeLe)));
}

/** Choisit, pour chaque rencontre, la ligne de la loi affichée de son championnat (l'autre loi de la même ligne sinon) — jamais un mélange. */
function parLoiAffichee(lignesBrutes, { database, maintenant, reglagesEnService }) {
  const nuit = lireEtat({ database }).nuits.saisons;
  const lignes = lignesBrutes.filter((r) => aLire(r, nuit));
  const lois = new Map();
  const loiDe = (league) => {
    if (!lois.has(league)) lois.set(league, loiAffichee(league, { database, maintenant, reglagesEnService }));
    return lois.get(league);
  };
  const parRencontre = new Map();
  for (const r of lignes) {
    const cle = `${r.league}|${r.date}|${r.home_id}|${r.away_id}`;
    if (!parRencontre.has(cle)) parRencontre.set(cle, []);
    parRencontre.get(cle).push(r);
  }
  const sortie = [];
  for (const liste of parRencontre.values()) {
    const loi = loiDe(liste[0].league);
    const r = liste.find((x) => x.loi === loi.loi) ?? liste[0];
    // Le repli (la rencontre n'a pas de ligne de la loi affichée) : une ligne « table » quand la loi affichée est
    // « forces » — la nuit avait donc les forces du modèle : la phrase des forces qui manquent (constat 20).
    sortie.push(enjeuMontre(r, r.loi === loi.loi ? loi : { phrase: r.loi === 'table' ? PHRASE_LOI_TABLE_FORCES_PERIMEES : PHRASE_LOI_FORCES_ESSAI }));
  }
  return sortie;
}

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * LES ENJEUX des rencontres de `du` à `au` (GET /api/simulation/enjeux) : par identifiants FotMob, la loi affichée de
 * chaque championnat. Rien tant que l'affichage des fins de saison est éteint. Rend { affichage, enjeux, phrase? }.
 */
export function enjeuxDu({ du, au, database, maintenant, reglagesEnService = null } = {}) {
  instantDe(maintenant);
  if (!JOUR.test(String(du ?? '')) || !JOUR.test(String(au ?? '')) || du > au) throw new RangeError('« du » et « au » : deux jours AAAA-MM-JJ, du ≤ au.');
  if ((Date.parse(au) - Date.parse(du)) / JOUR_MS > 31) throw new RangeError('31 jours au plus entre « du » et « au ».');
  const affichage = lireEtat({ database }).affichage.saisons;
  if (affichage !== 'allume') return { affichage, enjeux: [], phrase: 'Fins de saison et enjeu : calculés à blanc chaque nuit, pas encore montrés.' };
  const lignes = toutesLes(database, 'SELECT * FROM enjeux_rencontres WHERE date >= ? AND date <= ? ORDER BY date, league, home_id, away_id, loi', du, au);
  return { affichage, enjeux: parLoiAffichee(lignes, { database, maintenant, reglagesEnService }) };
}

/** L'ENJEU d'une rencontre (la page du match) : par identifiants FotMob seulement, jamais un nom. */
export function enjeuDe({ league, date, homeId, awayId, database, maintenant, reglagesEnService = null } = {}) {
  instantDe(maintenant);
  const h = idFotMob(homeId);
  const a = idFotMob(awayId);
  if (!league || !JOUR.test(String(date ?? '')) || !h || !a) return { calcule: false, libelle: 'Enjeu non calculé', raison: 'rencontre sans identifiants FotMob' };
  const lignes = toutesLes(database, 'SELECT * FROM enjeux_rencontres WHERE league = ? AND date = ? AND home_id = ? AND away_id = ?', league, date, h, a);
  const choisis = lignes.length ? parLoiAffichee(lignes, { database, maintenant, reglagesEnService }) : [];
  if (!choisis.length) return { calcule: false, libelle: 'Enjeu non calculé', raison: 'pas d’enjeu rangé pour cette rencontre (fin de saison non calculée, coupe, ou rencontre au-delà de 14 jours)' };
  return { calcule: true, ...choisis[0] };
}

// ------------------------------------------------------------ le déroulé

/** La dernière ligne de nuit d'une rencontre (clé de la nuit) et d'un rôle, d'une nuit COMPLÈTE ; null sinon. */
export function ligneDuMatch({ cle, role, database } = {}) {
  const nuit = nuitDesMatchs(database);
  if (!nuit || !cle || !role) return null;
  return uneLigne(database, 'SELECT * FROM simulation_matchs WHERE fixture_key = ? AND role = ? AND calcule_le <= ? ORDER BY calcule_le DESC LIMIT 1', cle, role, nuit);
}

/** La clé de nuit d'une rencontre : celle du gel (identifiants FotMob et jour UTC du coup d'envoi), ou null. */
export function cleDeNuit({ homeId, awayId, commenceTime }) {
  const h = idFotMob(homeId);
  const a = idFotMob(awayId);
  const t = Date.parse(commenceTime ?? '');
  if (!h || !a || !fini(t)) return null;
  return `fotmob:fotmob-${h}|fotmob-${a}|${new Date(t).toISOString().slice(0, 10)}`;
}

const ORDRE_DU_DEROULE = ['htH', 'htD', 'htA', 'htO05', 'htO15', 'htFt0', 'htFt1', 'htFt2', 'htFt3', 'htFt4', 'htFt5', 'htFt6', 'htFt7', 'htFt8', 'premierDom', 'premierExt', 'premierAvant30', 'deuxMiTemps05', 'h2plusQueH1', 'retourDom', 'retourExt', 'rougeAuMoinsUn'];
const lireM = (m, k) => (k.startsWith('htFt') ? m?.htFt?.[Number(k.slice(4))] : m?.[k]);

/** Les lignes MONTRÉES du déroulé : l'ordre de la carte, sans les marchés que la porte 1 a écartés (marchesEcartes.js). */
export const lignesMontrees = (ecartes = marchesEcartes()) => ORDRE_DU_DEROULE.filter((cle) => !estEcarte(cle, ecartes));

/**
 * La phrase de la carte « Déroulé simulé » (C §1.1), chiffres lus dans les écarts mesurés — sur les marchés MONTRÉS
 * seulement : la conception citait « un but dans chaque mi-temps » (−2,3 pt), écarté par la porte 1 ; l'exemple devient
 * le marché montré au plus grand écart (« 2e mi-temps plus de buts » : −1,7 pt, d'où « jusqu’à 2 points »). La période
 * est celle de la MESURE (la moitié jamais apprise, juillet 2025 – septembre 2026 : vérification du 27/10, constat 24),
 * la même qu'au survol de chaque ligne.
 */
export function phraseDuDeroule(calculeLe, ecartes = marchesEcartes()) {
  const v = ECARTS_MESURES_V.marches;
  const montres = lignesMontrees(ecartes).filter((cle) => v[cle] && cle !== 'retourExt');
  const pire = montres.reduce((a, cle) => (Math.abs(v[cle].ecart) > Math.abs(v[a]?.ecart ?? 0) ? cle : a), montres[0]);
  const jusqua = Math.max(1, Math.round(Math.abs(v[pire].ecart)));
  return (
    `Information, pas un pronostic. Ces pourcentages viennent de ${N.toLocaleString('fr-FR')} matchs simulés ${nuitDite(calculeLe).replace(/ à .*$/, '')}. ` +
    `Sur ${ECARTS_MESURES_V.mesure.matchs.toLocaleString('fr-FR')} matchs de juillet 2025 à septembre 2026 jamais appris, mesurés avec les cotes de clôture, ils se sont trompés jusqu’à ${jusqua} point${jusqua > 1 ? 's' : ''} selon le marché (« ${v[pire].libelle} » : annoncé ${Math.round(v[pire].annonce)} %, arrivé ${Math.round(v[pire].realise)} % ; « mené à la mi-temps et gagne » : annoncé ${virgule(v.retourExt.annonce)} %, arrivé ${virgule(v.retourExt.realise)} %). ` +
    'Le hasard du tirage seul vaut ± 0,5 point ; c’est l’écart au réel qui compte. La preuve sur vos matchs a commencé la nuit de la livraison.'
  );
}

/**
 * La phrase des marchés écartés, sous la carte (sans les nommer ni les chiffrer : jamais montrés sur un match) : ceux de
 * la preuve sur 2019-2023 (la porte 1) et ceux que la GARDE DE SÛRETÉ a éteints sur vos matchs (vérification du 27/10,
 * constats 7 et 12 : un marché fautif s'éteint seul, le reste du déroulé reste montré).
 */
export function phraseDesEcartes(ecartes = marchesEcartes()) {
  const n = ecartes.deroule.length;
  if (!n) return null;
  const parLaGarde = ecartes.deroule.filter((m) => m.parLaGarde).length;
  const parLaPreuve = n - parLaGarde;
  const qui = [
    parLaPreuve ? `la preuve sur 2019-2023 ${parLaPreuve > 1 ? `en a écarté ${parLaPreuve}` : 'en a écarté un'}` : null,
    parLaGarde ? `la garde de sûreté sur vos matchs ${parLaGarde > 1 ? `en a éteint ${parLaGarde}` : 'en a éteint un'}` : null
  ].filter(Boolean);
  const pourquoi = parLaGarde ? qui.join(', ') : `la preuve sur 2019-2023 ${n > 1 ? 'les a écartés' : 'l’a écarté'}`;
  return `${n === 1 ? 'Un marché de déroulé n’est' : `${n} marchés de déroulé ne sont`} pas montré${n > 1 ? 's' : ''} : ${pourquoi} (le détail est dans Réglages › Versions du moteur).`;
}

/**
 * LES ÉCARTÉS de ce que lit l'appli : ceux de la note (la porte 1) et, quand l'interrupteur des matchs est ouvert, ceux de
 * la garde de sûreté du jugement principal (`conditions.gardeDuPrincipal`, affichageEffectif) — chacun éteint SEUL.
 */
const ecartesDe = (effectif) => marchesEcartes(undefined, { garde: effectif?.conditions?.gardeDuPrincipal ?? null });

/** Les buts attendus ont-ils bougé de plus de 10 % depuis la nuit ? */
const bouge = (nuit, maintenant) => Math.abs(maintenant - nuit) / Math.max(nuit, 1e-9) > ECART_MAX;

/**
 * LE DÉROULÉ de la page (seulement en affichage « tout ») : la ligne de nuit à grille « modele-buts-441 », REPONDÉRÉE
 * sur la grille de CETTE analyse, alignée sur le 1N2 affiché ; λ ou μ bougés de plus de 10 % : pas de chiffre, la
 * phrase. Jamais une simulation. `ecartes` : les marchés jamais montrés (la note, et la garde de sûreté quand elle en a
 * éteint : simulationDuMatch et prixDuCombine les passent).
 */
export function derouleDeLaPage({ ligne, entrees, ecartes = marchesEcartes() }) {
  if (!ligne || !ligne.table_jointe) return { calcule: false, phrase: 'Pas de déroulé simulé pour ce match : seules les rencontres des 48 prochaines heures analysées par une passe de nuit en ont un.' };
  if (!entrees || entrees.grille !== GRILLES.modeleDeButs) return { calcule: false, phrase: 'Déroulé simulé : il attend le modèle de buts en service.' };
  if (bouge(ligne.lambda, entrees.lambda) || bouge(ligne.mu, entrees.mu)) {
    const avant = bouge(ligne.lambda, entrees.lambda) ? [ligne.lambda, entrees.lambda] : [ligne.mu, entrees.mu];
    return { calcule: false, phrase: `Les buts attendus ont changé depuis la nuit (${virgule(avant[0], 2)} → ${virgule(avant[1], 2)}) : déroulé refait la nuit prochaine.` };
  }
  const grille = entrees.fair ? alignerSurLe1N2(grilleDesEntrees(entrees), entrees.fair) : grilleDesEntrees(entrees);
  const table = lireTableJointe(ligne.table_jointe instanceof Uint8Array ? ligne.table_jointe : Uint8Array.from(ligne.table_jointe), grille);
  const m = marchesDeDeroule(table);
  // Les marchés écartés par la porte 1 (la note de la simulation) ou éteints par la garde de sûreté ne sont JAMAIS
  // montrés : ni chiffre, ni ligne.
  const lignes = lignesMontrees(ecartes).map((cle) => {
    const p = lireM(m, cle);
    const mesure = ECARTS_MESURES_V.marches[cle] ?? null;
    return { cle, libelle: mesure?.libelle ?? cle, p, texte: fini(p) ? `${virgule(100 * p, 1)} %` : '—', ecartMesure: mesure ? { ecart: mesure.ecart, annonce: mesure.annonce, realise: mesure.realise } : null };
  });
  return {
    calcule: true,
    calculeLe: ligne.calcule_le,
    lignes,
    ecartes: { nombre: ecartes.deroule.length, phrase: phraseDesEcartes(ecartes) },
    phrase: phraseDuDeroule(ligne.calcule_le, ecartes),
    provenance: `${N.toLocaleString('fr-FR')} matchs simulés ${nuitDite(ligne.calcule_le)}, effets du score mesurés sur 2023-2026 ; repondérés sur la grille de cette analyse, alignée sur le 1N2 affiché`,
    mention: 'Ni pronostic ni règlement automatique.'
  };
}

/**
 * LE BLOC DE LA PAGE DU MATCH (analysis.controller.js, APRÈS l'analyse) : { affichage, enjeu, deroule }. L'enjeu,
 * seulement quand les fins de saison sont allumées ; le déroulé, seulement en « tout ». Jamais envoyé à l'IA ; une
 * lecture ratée n'empêche jamais l'analyse (l'appelant attrape).
 */
export function simulationDuMatch({ match, analyse, config, database, maintenant, reglagesEnService = null, lancement = null }) {
  // Les interrupteurs RELUS AVEC LEURS CONDITIONS (affichageEffectif) : « tout » sans ses conditions = éteint, dit.
  const effectif = affichageEffectif({ database, reglagesEnService, lancement });
  const homeId = match?.scoreInputs?.home?.teamId ?? match?.homeId ?? null;
  const awayId = match?.scoreInputs?.away?.teamId ?? match?.awayId ?? null;
  const date = fini(Date.parse(match?.commenceTime ?? '')) ? new Date(Date.parse(match.commenceTime)).toISOString().slice(0, 10) : null;
  const enjeu = effectif.saisons === 'allume' ? enjeuDe({ league: match?.league ?? null, date, homeId, awayId, database, maintenant, reglagesEnService }) : null;
  let deroule = null;
  if (effectif.matchs === 'tout') {
    let entrees = null;
    try {
      entrees = entreesDeLAnalyse(analyse, config);
    } catch {
      entrees = null;
    }
    const cle = cleDeNuit({ homeId, awayId, commenceTime: match?.commenceTime });
    deroule = derouleDeLaPage({ ligne: cle ? ligneDuMatch({ cle, role: 'service', database }) : null, entrees, ecartes: ecartesDe(effectif) });
  }
  return { affichage: { saisons: effectif.saisons, matchs: effectif.matchs }, ...(effectif.pourquoi.matchs ? { pourquoi: effectif.pourquoi.matchs } : {}), enjeu, deroule };
}

// ------------------------------------------------------------ la porte 1, pour Réglages

/**
 * LA PORTE 1 de la simulation (la note : le passage unique sur football-data P2, 2019-2023), en chiffres pour l'écran de
 * Réglages (les mots sont faits par l'interface, utils/simulation.js) : réussie ou non, la date, les combinés face au
 * produit des simples, les effets du score, les marchés écartés et pourquoi, la règle qui les garde éteints. Pur.
 */
export function porte1PourLEcran(note = NOTE_DE_LA_SIMULATION) {
  if (!note || typeof note !== 'object') return null;
  const ecartes = marchesEcartes(note);
  const f3a = note.f3a ?? {};
  const f2c = note.f2c ?? {};
  const parMarche = new Map((f2c.marches ?? []).map((m) => [m.cle, m]));
  const nets = (f3a.combines ?? []).map((c) => Math.abs(c.net)).filter(fini);
  const bloc = (b) => (b ? { verdict: b.verdict ?? null, gainMillieme: b.gainMillieme ?? null, fourchette: b.fourchetteMillieme ?? null, matchs: b.matchs ?? null, variantes: b.variantes ?? null } : null);
  return {
    porte: note.porte ?? null,
    le: note.calculeeLe ?? null,
    periode: { de: '2019-07-01', a: '2023-06-30', source: 'football-data' },
    matchs: note.echantillon?.rencontres ?? null,
    combines: { ...bloc(f3a.bloc), nombre: (f3a.combines ?? []).length, eteints: [...(f3a.eteints ?? [])], netMaxPoints: nets.length ? Math.max(...nets) : null, seuilPoints: 1.5 },
    effets: { ...bloc(f2c.bloc), moinsBon: f2c.moinsBon ?? null },
    seuilMarche: f2c.parMarche?.seuilNet ?? 1,
    nonVerifie: ecartes.nonVerifie,
    ecartes: ecartes.deroule.map((m) => ({ cle: m.cle, libelle: m.libelle, annonce: m.annonce, realise: m.realise, netExact: m.netExact, brut: parMarche.get(m.cle)?.brut ?? null })),
    regle: ecartes.regle,
    reglesEcritesAvant: note.regles?.ecritesAvantLeRegard === true
  };
}

// ------------------------------------------------------------ le prix juste d'un ticket

const SCORES_D_ESSAI = Object.freeze([[0, 0], [1, 0], [0, 1], [2, 1], [1, 2], [3, 3]]);
const STATS_D_ESSAI = Object.freeze({ home: Object.freeze({ corners: 5, shots: 12, shotsOnTarget: 4 }), away: Object.freeze({ corners: 4, shots: 9, shotsOnTarget: 3 }) });

/**
 * « Pariable » : le RÈGLEMENT sait-il régler cette sélection (core/settlement/settlementRules.js, deriveBetLegOutcome,
 * lu jamais modifié) ? Oui s'il rend une issue pour chaque score d'essai (statistiques fournies) ; une jambe de
 * mi-temps ou de score exact rend `null` : elle se lit et se chiffre, « J'ai parié » la refuse en v1.
 */
export function selectionReglable(leg) {
  try {
    return SCORES_D_ESSAI.every(([h, a]) => deriveBetLegOutcome(leg ?? {}, h, a, STATS_D_ESSAI) !== null);
  } catch {
    return false;
  }
}

/** La clé de match d'une sélection (celle du ticket et de betsRepository.natureDuPari). */
const cleDeMatch = (leg) => leg?.matchId ?? `${leg?.homeName ?? ''}|${leg?.awayName ?? ''}|${leg?.commenceTime ?? ''}`;

/**
 * LE PRIX JUSTE D'UN TICKET (POST /api/simulation/prix-combine, serveur seulement). `legs` : les sélections du ticket
 * ({ matchId, homeName, awayName, league, commenceTime, market, marketId, params, pick }) ; `analyser(leg)` : l'analyse
 * fraîche du match de cette sélection, rendue par la route ({ analyse, config, match }, gardée 60 s) ; `cote` : la cote
 * du combiné tapée (facultative). Jambes groupées par match : pour chacun, la grille refaite depuis λ, μ, ρ de son
 * analyse, ALIGNÉE sur le 1N2 affiché ; le déroulé lu dans la table de la nuit repondérée (refus en mots hors « tout »,
 * sans ligne, au-delà de 10 %) ; corners et tirs : leur loi, supposée indépendante. Matchs différents : le produit,
 * dit. Refus en mots si l'affichage est éteint. Jamais une simulation.
 */
export async function prixDuCombine({ legs, database, maintenant, analyser, cote = null, reglagesEnService = null, lancement = null } = {}) {
  const t = instantDe(maintenant);
  // L'interrupteur relu avec ses conditions (affichageEffectif) : resté ouvert sans elles, il vaut « éteint », dit.
  const effectif = affichageEffectif({ database, reglagesEnService, lancement });
  if (effectif.matchs === 'eteint') {
    const pourquoi = effectif.pourquoi.matchs;
    return { eteint: true, probabilite: null, phrase: PRIX_ETEINT, ...(pourquoi ? { pourquoi } : {}), raisons: [PRIX_ETEINT, ...(pourquoi ? [pourquoi] : [])], mentions: [] };
  }
  if (!Array.isArray(legs) || !legs.length) return { probabilite: null, raisons: ['aucune sélection'], mentions: [] };
  const groupes = new Map();
  for (const leg of legs) {
    const k = cleDeMatch(leg);
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(leg);
  }
  const parMatch = [];
  const raisons = [];
  const mentions = [];
  const provenance = [];
  // Les écartés : ceux de la note (la porte 1) et ceux que la garde de sûreté a éteints, chacun SEUL.
  const ecartes = ecartesDe(effectif);
  for (const jambes of groupes.values()) {
    // Les marchés et les combinés écartés par la preuve (la porte 1) ou éteints par la garde de sûreté : refusés en
    // mots, jamais chiffrés ni montrés.
    const refus = [...jambes.map((j) => jambeEcartee(j, ecartes)?.phrase), combineEcarte(jambes, ecartes)?.phrase].filter(Boolean);
    if (refus.length) {
      raisons.push(...refus);
      continue;
    }
    let lu;
    try {
      lu = await analyser(jambes[0]);
    } catch (error) {
      raisons.push(`${jambes[0].homeName ?? '?'} – ${jambes[0].awayName ?? '?'} : analyse impossible (${String(error?.message ?? error).slice(0, 120)})`);
      continue;
    }
    let entrees;
    try {
      entrees = entreesDeLAnalyse(lu.analyse, lu.config);
    } catch (error) {
      raisons.push(`${jambes[0].homeName ?? '?'} – ${jambes[0].awayName ?? '?'} : ${error.message}`);
      continue;
    }
    const brute = grilleDesEntrees(entrees);
    const grille = entrees.fair ? alignerSurLe1N2(brute, entrees.fair) : brute;
    let table = null;
    if (jambes.some((j) => MARCHES_DE_DEROULE.includes(j.marketId))) {
      if (effectif.matchs !== 'tout') {
        raisons.push('une sélection de déroulé (mi-temps, premier but…) ne se chiffre qu’avec l’affichage « tout » du déroulé simulé');
        continue;
      }
      const cle = cleDeNuit({ homeId: lu.match?.scoreInputs?.home?.teamId, awayId: lu.match?.scoreInputs?.away?.teamId, commenceTime: lu.match?.commenceTime });
      const d = derouleDeLaPage({ ligne: cle ? ligneDuMatch({ cle, role: 'service', database }) : null, entrees, ecartes });
      if (!d.calcule) {
        raisons.push(d.phrase);
        continue;
      }
      const ligne = ligneDuMatch({ cle, role: 'service', database });
      table = lireTableJointe(ligne.table_jointe instanceof Uint8Array ? ligne.table_jointe : Uint8Array.from(ligne.table_jointe), grille);
      provenance.push(`déroulé simulé ${nuitDite(ligne.calcule_le).replace(/ à .*$/, '')}`);
    }
    const statLines = (jambe) => {
      const issues = distributionDuMarche(lu.analyse, jambe)?.issues ?? null;
      const p = issues?.[jambe.params?.side];
      return fini(p) ? p : null;
    };
    const r = probabiliteDuCombine({ jambes, grille, table, statLines });
    const pariable = jambes.every(selectionReglable);
    parMatch.push({ match: `${jambes[0].homeName ?? '?'} – ${jambes[0].awayName ?? '?'}`, jambes: jambes.length, probabilite: r.probabilite, prixJuste: r.prixJuste ?? null, siIndependants: r.siIndependants ?? null, impossible: Boolean(r.impossible), nonConseille: Boolean(r.nonConseille), pariable, mentions: r.mentions ?? [], raisons: r.raisons ?? [] });
    for (const x of r.mentions ?? []) if (!mentions.includes(x)) mentions.push(x);
    for (const x of r.raisons ?? []) raisons.push(x);
    if (!pariable && !mentions.some((x) => /ne se règle pas automatiquement/.test(x))) mentions.push('une sélection se lit et se chiffre, mais ne se règle pas automatiquement : « J’ai parié » la refuse en v1');
  }
  const calculeA = new Date(t).toISOString();
  provenance.unshift(`grille du moteur (modèle de buts unique) de ${heureDite(calculeA)}, alignée sur le 1N2 affiché`);
  if (parMatch.length !== groupes.size || parMatch.some((m) => m.probabilite === null)) {
    return { probabilite: null, prixJuste: null, siIndependants: null, coteMinimale: null, parMatch, calculeA, provenance, raisons: raisons.length ? raisons : ['pas de prix juste pour ce ticket'], mentions, pariable: false };
  }
  const total = parMatch.length > 1 ? combinerLesMatchs(parMatch.map((m) => m.probabilite)) : { probabilite: parMatch[0].probabilite, mentions: [] };
  for (const x of total.mentions) if (!mentions.includes(x)) mentions.push(x);
  const probabilite = total.probabilite;
  const siIndependants = parMatch.every((m) => fini(m.siIndependants)) ? parMatch.reduce((s, m) => s * m.siIndependants, 1) : null;
  const prixJuste = probabilite > 0 ? 1 / probabilite : null;
  return {
    probabilite,
    prixJuste,
    siIndependants,
    coteMinimale: prixJuste,
    ecartALaCote: fini(cote) ? ecartALaCote(cote, probabilite) : null,
    impossible: parMatch.some((m) => m.impossible),
    parMatch,
    calculeA,
    provenance,
    raisons,
    mentions,
    pariable: parMatch.every((m) => m.pariable)
  };
}
