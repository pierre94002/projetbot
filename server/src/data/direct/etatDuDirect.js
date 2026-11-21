/**
 * etatDuDirect.js — L'ÉTAT D'UN MATCH EN DIRECT (étape 46 du plan, lot 1, partie A ; conception § 2.4 à § 2.8, critique
 * R3, R4, R5, R6, R34).
 * -----------------------------------------------------------------------
 * PUR : ni base, ni fichier, ni horloge (`maintenant` est toujours passé), ni réseau, ni hasard. Les heures sont des
 * nombres (millisecondes) : un état se sérialise tel quel.
 *
 * `phaseDuReleve({ liste, drapeaux })` : la PHASE d'un relevé (ligne de la liste FotMob, ou d'un détail : mêmes champs
 * `liveLabel`, `liveMinute`, `liveAddedTime`, `liveMaxTime`, `halfTime`, `started`, `finished`, `cancelled`, `awarded`),
 * avec les drapeaux COLLANTS de la mémoire (R5 point 3) : `prolongationVueA`, `tirsAuButVusA`, `pauseVueA`. Dans l'ordre :
 *   aucun relevé → sans-releve ; awarded → attribue ; cancelled → arrete ; finished → termine ; started faux → avant ;
 *   tirs au but (libellé, ou déjà vus) → tirs-au-but ;
 *   prolongation PROUVÉE (durée max > 90, libellé de la classe prolongation, ou déjà prouvée) → prolongation — JAMAIS par
 *     une simple minute > 90 (R5 point 3, R6) ;
 *   libellé de fin (FT) → fin-90 ; interrompu → interrompu ; mi-temps (libellé ou halfTime) → mi-temps, créneau 46, part 0 ;
 *   une minute (lue au libellé, ou au chrono `liveMinute` quand le libellé manque : minuteSource 'chrono') → placer() ;
 *   libellé inconnu → libelle-inconnu ; ni libellé ni minute → minute-inconnue.
 * placer() — LA TABLE CROISÉE AVEC LA DURÉE MAX (R6 point 2 ; l'étape 0 du 11/11 a relevé que FotMob écrit les arrêts de
 * jeu en MINUTES PLEINES, « 47’ » et « 93’ », jamais « 45+2’ ») :
 *   « 45+x » → créneau 45 ; « 90+x » → créneau 91 (la forme de la conception, gardée) ;
 *   0 → créneau 0, part 0 ; 1..45 → m − 1 ; part 0,5 ;
 *   46..60 et durée max 45 → créneau 45, ajout m − 45 ; 46..60 sans durée max → la pause déjà vue dit la 2e mi-temps,
 *     sinon minute-inconnue (on ne devine pas la mi-temps) ; 61..90 → m ; part 0,5 ;
 *   91..105 et durée max 90 → créneau 91, ajout m − 90 ; sans durée max → minute-inconnue (« minute 93 publiée sans durée de
 *     jeu ») ; au-delà de 105 (ou de 60 en durée max 45) → minute-inconnue, « hors-limites » (l'étape 0 a vu l'horloge
 *     FotMob tourner jusqu'à 186’ après la fin d'un match) ;
 *   dans les créneaux 45 et 91 : part = 1 − reste[min(ajout, X)] (RESTE_ADDITIONNEL, § 2.5).
 * La table des créneaux (`creneauDeLaMinute`, 5 lignes) est ÉCRITE ici (R34) : T-E2 la tient égale à `creneauDe` de
 * simulationNuit.js, importé dans le TEST seulement (le module de la nuit charge tout le serveur).
 *
 * `etatDuMatch({ match, maintenant })` : l'état d'un match de `getEtatMinute()` (sa ligne de liste `liste` et sa mémoire
 * `memoire`, memoireDuDirect.js) : phase, départ du calcul, score (la mémoire : R4), rouges (§ 2.7 et R3), âges (R3, R4),
 * score de la 90e (R5). `etatDepuisInstantane(ligne, { precedent })` : le même pour une ligne de `live_snapshots` (la
 * courbe, § 3.3), les drapeaux et les rouges portés d'instantané en instantané.
 * -----------------------------------------------------------------------
 */

import { lireLibelle, nettoyerLibelle } from './libelleDuDirect.js';
import {
  VERSION_DU_DIRECT,
  RESTE_ADDITIONNEL,
  PART_PAR_DEFAUT,
  AMBRE_ETAT_MS,
  PERIME_APRES_MS,
  FIGE_APRES_MS,
  ROUGES_AMBRE_MS
} from './reglagesDirect.js';

/** Les phases (l'écran a une phrase pour chacune). Seules `jeu` et `mi-temps` se calculent. */
export const PHASES = Object.freeze([
  'sans-releve',
  'avant',
  'jeu',
  'mi-temps',
  'prolongation',
  'tirs-au-but',
  'fin-90',
  'interrompu',
  'attribue',
  'arrete',
  'termine',
  'minute-inconnue',
  'libelle-inconnu'
]);
export const PHASES_CALCULEES = Object.freeze(['jeu', 'mi-temps']);
/** Les raisons d'une minute qu'on ne place pas (une phrase chacune à l'écran). */
export const RAISONS_MINUTE = Object.freeze(['sans-duree-max', 'hors-limites', 'ajout-inattendu', 'sans-minute']);

/** Les bornes de R6 point 2 : arrêts de jeu de la 1re mi-temps jusqu'à la 60e, de la 2e jusqu'à la 105e. */
const ARRETS_PREMIERE_MAX = 60;
const ARRETS_SECONDE_MAX = 105;

const entier = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Math.trunc(Number(v)));
const estEntier = (v) => Number.isInteger(v);

/**
 * LA TABLE DES CRÉNEAUX (R34) — celle de `creneauDe` (simulationNuit.js) : minutes 1 à 45 → créneaux 0 à 44 ; 45+x → 45 ;
 * 46 à 90 → 46 à 90 ; 90+x → 91 ; hors de 1..90 → −1.
 */
export function creneauDeLaMinute(minute, ajout = 0) {
  const m = Number(minute);
  const a = Number(ajout ?? 0);
  if (!Number.isFinite(m) || m < 1 || m > 90) return -1;
  if (m === 45 && a > 0) return 45;
  if (m === 90 && a > 0) return 91;
  return m <= 45 ? m - 1 : m;
}

/** La part jouée du créneau 45 ou 91 à la minute additionnelle `ajout` (≥ 1) : 1 − reste[min(ajout, X)], dans [0 ; 1]. */
export function partDuTempsAdditionnel(creneau, ajout, table = RESTE_ADDITIONNEL) {
  if (!table) return PART_PAR_DEFAUT;
  const premiere = creneau === 45;
  const reste = premiere ? table.reste45 : table.reste91;
  const X = premiere ? table.X45 : table.X91;
  const x = Math.min(Math.max(1, Math.trunc(ajout)), X);
  const r = reste?.[x];
  if (!Number.isFinite(r)) return PART_PAR_DEFAUT;
  return Math.min(1, Math.max(0, 1 - r));
}

const inconnue = (raison, minute, ajout) => ({ phase: 'minute-inconnue', raison, creneau: null, part: null, minute, ajout });
const enJeu = (creneau, part, minute, ajout) => ({ phase: 'jeu', raison: null, creneau, part, minute, ajout });

/** La minute (m, ajout) placée dans un créneau, croisée avec la durée max (R6 point 2). */
export function placer(minute, ajout, dureeMax, { pauseVue = false } = {}) {
  const m = minute;
  const a = ajout ?? 0;
  if (!estEntier(m) || m < 0) return inconnue('sans-minute', null, null);
  if (a > 0) {
    if (m === 45) return enJeu(45, partDuTempsAdditionnel(45, a), m, a);
    if (m === 90) return enJeu(91, partDuTempsAdditionnel(91, a), m, a);
    return inconnue('ajout-inattendu', m, a);
  }
  if (m === 0) return enJeu(0, 0, 0, null);
  if (m <= 45) return enJeu(creneauDeLaMinute(m), PART_PAR_DEFAUT, m, null);
  if (dureeMax === 45) {
    if (m <= ARRETS_PREMIERE_MAX) return enJeu(45, partDuTempsAdditionnel(45, m - 45), m, m - 45);
    return inconnue('hors-limites', m, null);
  }
  if (m <= ARRETS_PREMIERE_MAX && dureeMax === null && !pauseVue) return inconnue('sans-duree-max', m, null);
  if (m <= 90) return enJeu(creneauDeLaMinute(m), PART_PAR_DEFAUT, m, null);
  if (dureeMax === 90) {
    if (m <= ARRETS_SECONDE_MAX) return enJeu(91, partDuTempsAdditionnel(91, m - 90), m, m - 90);
    return inconnue('hors-limites', m, null);
  }
  return inconnue(dureeMax === null ? 'sans-duree-max' : 'hors-limites', m, null);
}

/**
 * LA PHASE D'UN RELEVÉ (voir l'en-tête). `drapeaux` : { prolongationVueA, tirsAuButVusA, pauseVueA } (collants, de la
 * mémoire) ; rend { phase, raison, creneau, part, minute, ajout, minuteSource, libelle: { texte, type }, dureeMax }.
 */
export function phaseDuReleve({ liste, drapeaux = {} } = {}) {
  const L = liste ?? null;
  const vide = { creneau: null, part: null, minute: null, ajout: null, minuteSource: null };
  if (!L) return { phase: 'sans-releve', raison: null, ...vide, libelle: { texte: null, type: 'absent' }, dureeMax: null };
  const lu = lireLibelle(L.liveLabel);
  const libelle = { texte: lu.texte, type: lu.type };
  const dureeMax = entier(L.liveMaxTime);
  const base = { ...vide, libelle, dureeMax };
  const d = drapeaux ?? {};
  if (L.awarded === true) return { ...base, phase: 'attribue', raison: null };
  if (L.cancelled === true) return { ...base, phase: 'arrete', raison: null };
  if (L.finished === true) return { ...base, phase: 'termine', raison: null };
  if (L.started === false) return { ...base, phase: 'avant', raison: null };
  if (lu.type === 'tirs-au-but' || d.tirsAuButVusA) return { ...base, phase: 'tirs-au-but', raison: null };
  if ((dureeMax !== null && dureeMax > 90) || lu.type === 'prolongation' || d.prolongationVueA) return { ...base, phase: 'prolongation', raison: null };
  if (lu.type === 'fin') return { ...base, phase: 'fin-90', raison: null };
  if (lu.type === 'interrompu') return { ...base, phase: 'interrompu', raison: null };
  if (lu.type === 'mi-temps' || L.halfTime === true) return { ...base, phase: 'mi-temps', raison: null, creneau: 46, part: 0 };
  const pauseVue = Boolean(d.pauseVueA);
  if (lu.type === 'minute') return { ...base, ...placer(lu.minute, lu.ajout, dureeMax, { pauseVue }), minuteSource: 'libelle' };
  if (lu.type === 'absent') {
    const m = entier(L.liveMinute);
    if (m === null) return { ...base, ...inconnue('sans-minute', null, null) };
    const a = entier(L.liveAddedTime);
    return { ...base, ...placer(m, a, dureeMax, { pauseVue }), minuteSource: 'chrono' };
  }
  return { ...base, phase: 'libelle-inconnu', raison: null };
}

/** Le relevé est-il une PREUVE de prolongation (R5 point 3 : durée max > 90 ou libellé de prolongation, jamais m > 90 seul) ? */
export function prouveLaProlongation(liste) {
  if (!liste) return false;
  const dureeMax = entier(liste.liveMaxTime);
  return (dureeMax !== null && dureeMax > 90) || lireLibelle(liste.liveLabel).type === 'prolongation';
}

// ------------------------------------------------------------ les rouges (§ 2.7, R2 point 2, R3 point 2)

const rougesConnus = (r) => Boolean(r) && estEntier(r.home) && estEntier(r.away);

/**
 * LES ROUGES retenus : rien de connu → inconnus (calcul à 11 contre 11, jamais un « 0 » affiché comme un fait) ; une seule
 * source → elle ; deux égales → la plus récente ; deux différentes → `desaccord`, et la source dont le COMPTE a changé le
 * plus récemment (`depuisA`) ; à égalité, le détail (correctif K1 du 13/11, constat 1 du calcul : la conception § 2.7
 * disait « le détail s'il a moins de 6 minutes au relevé de la liste » — un rouge lu par la liste restait alors ignoré
 * jusqu'à 6 minutes). Jamais un maximum ni un minimum : le dernier compte fait foi (un rouge annulé baisse).
 * La phrase (R3 point 2) : 'pas-encore-lus' (aucun détail lu pour ce match), 'non-publies' (détail lu, rouges absents),
 * 'lus' ; `avantLaPause` quand ils ont été lus avant la pause et que le match y est. `depuisA` : le tour où CE compte a été
 * vu pour la première fois (R2 point 2).
 */
export function rougesRetenus({ rougesListe = null, rougesDetail = null, detailLu = false, pauseVueA = null, phase = null, maintenant }) {
  const l = rougesConnus(rougesListe) ? rougesListe : null;
  const d = rougesConnus(rougesDetail) ? rougesDetail : null;
  let choisi = null;
  let source = null;
  let desaccord = false;
  if (l && d) {
    if (l.home === d.home && l.away === d.away) {
      choisi = d.vuA >= l.vuA ? d : l;
      source = d.vuA >= l.vuA ? 'detail' : 'liste';
    } else {
      desaccord = true;
      const listePlusRecente = (l.depuisA ?? l.vuA) > (d.depuisA ?? d.vuA);
      choisi = listePlusRecente ? l : d;
      source = listePlusRecente ? 'liste' : 'detail';
    }
  } else if (d) {
    choisi = d;
    source = 'detail';
  } else if (l) {
    choisi = l;
    source = 'liste';
  }
  if (!choisi) {
    return { connus: false, home: null, away: null, source: null, vuA: null, depuisA: null, ageS: null, ambre: false, desaccord: false, phrase: detailLu ? 'non-publies' : 'pas-encore-lus', avantLaPause: false };
  }
  const ageMs = Number.isFinite(maintenant) ? Math.max(0, maintenant - choisi.vuA) : null;
  const pause = phase === 'mi-temps';
  return {
    connus: true,
    home: choisi.home,
    away: choisi.away,
    source,
    vuA: choisi.vuA,
    depuisA: choisi.depuisA ?? choisi.vuA,
    ageS: ageMs === null ? null : Math.round(ageMs / 1000),
    ambre: !pause && ageMs !== null && ageMs >= ROUGES_AMBRE_MS,
    desaccord,
    phrase: 'lus',
    avantLaPause: pause && pauseVueA !== null && choisi.vuA < pauseVueA
  };
}

// ------------------------------------------------------------ l'état d'un match (la boucle, getEtatMinute)

/**
 * L'ÉTAT D'UN MATCH : `match` = une entrée de getEtatMinute() ({ liste, memoire, … }) ; `maintenant` en millisecondes.
 * Rend { v, phase, raison, calculable, depart: { creneau, part, h, a, rh, ra } | null, minute, score, rouges, releve,
 * prolongation, score90, fin, memoire }. Sans mémoire (module de la 46 indisponible dans la boucle) : le score et les
 * rouges de la liste, sans âge ni règle de R4 (`memoire: false`).
 */
export function etatDuMatch({ match, maintenant } = {}) {
  const L = match?.liste ?? null;
  const M = match?.memoire ?? null;
  const ph = phaseDuReleve({ liste: L, drapeaux: M ?? {} });
  const t = Number.isFinite(maintenant) ? maintenant : null;

  // Le score : celui de la mémoire (R4 : une copie n'est pas une observation ; la hausse crue, la baisse confirmée).
  let score;
  if (M?.score && estEntier(M.score.h) && estEntier(M.score.a)) {
    const s = M.score;
    score = { connu: true, h: s.h, a: s.a, source: s.source ?? null, depuisA: s.depuisA ?? null, precedent: s.precedent ?? null, baisseA: s.baisseA ?? null, aConfirmer: Boolean(s.aConfirmer) };
  } else if (!M && L && estEntier(L.homeGoals) && estEntier(L.awayGoals)) {
    score = { connu: true, h: L.homeGoals, a: L.awayGoals, source: 'liste', depuisA: null, precedent: null, baisseA: null, aConfirmer: false };
  } else {
    score = { connu: false, h: null, a: null, source: null, depuisA: null, precedent: null, baisseA: null, aConfirmer: false };
  }

  // Les rouges (§ 2.7). Correctif K1 (13/11) : la liste FotMob n'écrit que le camp sanctionné — un seul compteur connu,
  // l'autre vaut 0.
  const unCampConnu = Boolean(L) && (estEntier(L.homeRedCards) || estEntier(L.awayRedCards));
  const rougesListe = M ? M.rougesListe : unCampConnu ? { home: estEntier(L.homeRedCards) ? L.homeRedCards : 0, away: estEntier(L.awayRedCards) ? L.awayRedCards : 0, vuA: t, depuisA: null } : null;
  const rouges = rougesRetenus({
    rougesListe,
    rougesDetail: M?.rougesDetail ?? null,
    detailLu: Boolean(M?.detail),
    pauseVueA: M?.pauseVueA ?? null,
    phase: ph.phase,
    maintenant: t
  });

  // Les âges (R3 point 1, R4 points 1 et 3) : depuis la dernière VRAIE lecture de la liste.
  const listeLueA = M?.listeLueA ?? null;
  const ageMs = listeLueA !== null && t !== null ? Math.max(0, t - listeLueA) : null;
  const libelleDepuisA = M?.libelle?.depuisA ?? null;
  const releve = {
    listeLueA,
    ageS: ageMs === null ? null : Math.round(ageMs / 1000),
    ambre: ageMs !== null && ageMs > AMBRE_ETAT_MS,
    perime: ageMs !== null && ageMs > PERIME_APRES_MS,
    fige: ph.phase === 'jeu' && listeLueA !== null && libelleDepuisA !== null && listeLueA - libelleDepuisA >= FIGE_APRES_MS,
    libelleDepuisA,
    copies: M?.copies ?? 0
  };

  // Le score de la 90e (R5) : montré dans les phases sans calcul d'après le temps réglementaire.
  const apres90 = ['prolongation', 'tirs-au-but', 'fin-90', 'termine'].includes(ph.phase);
  const reg = M?.reglementaire ?? null;
  const score90 = apres90 && reg ? { h: reg.h, a: reg.a, sur: Boolean(reg.sur), vuA: reg.vuA, libelle: reg.libelle ?? null } : null;

  const calculable = PHASES_CALCULEES.includes(ph.phase) && score.connu && estEntier(ph.creneau);
  let raison = ph.raison;
  if (PHASES_CALCULEES.includes(ph.phase) && !score.connu) raison = 'score-inconnu';
  const depart = calculable ? { creneau: ph.creneau, part: ph.part, h: score.h, a: score.a, rh: rouges.connus ? rouges.home : 0, ra: rouges.connus ? rouges.away : 0 } : null;

  return {
    v: VERSION_DU_DIRECT,
    phase: ph.phase,
    raison,
    calculable,
    depart,
    minute: { valeur: ph.minute, ajout: ph.ajout, source: ph.minuteSource, libelle: ph.libelle.texte, type: ph.libelle.type, dureeMax: ph.dureeMax, creneau: ph.creneau, part: ph.part },
    score,
    rouges,
    releve,
    prolongation: { vueA: M?.prolongationVueA ?? null, joueeA: M?.prolongationJoueeA ?? null, tirsAuButVusA: M?.tirsAuButVusA ?? null },
    score90,
    score90Absent: apres90 && !reg,
    fin: { finished: L?.finished === true, cancelled: L?.cancelled === true, awarded: L?.awarded === true },
    memoire: Boolean(M)
  };
}

// ------------------------------------------------------------ l'état d'un instantané (la courbe, § 3.3)

/**
 * L'ÉTAT D'UNE LIGNE DE `live_snapshots` (la courbe) : la même table de phases sur `minute_label` nettoyé (sans durée max :
 * `live_snapshots` ne la garde pas), le statut de la ligne (« mi-temps », « terminé », « annulé »), et ce que porte
 * l'instantané précédent (`precedent` = le `suite` rendu pour lui) : les rouges (les DEUX valeurs null sont REPORTÉES,
 * marquées `rougesReportes` ; un seul camp lu → l'autre vaut 0, correctif K1 du 13/11 ; aucun rouge jamais connu → `rougesConnus: false`, calcul à 0-0, jamais un 0 affirmé), la pause déjà
 * vue, la prolongation et les tirs au but déjà prouvés (collants, R5 point 3). Rend { etat, suite }.
 */
export function etatDepuisInstantane(ligne, { precedent = null } = {}) {
  const p = precedent ?? { rouges: null, pauseVue: false, prolongationVue: false, tirsAuButVus: false };
  const r = ligne ?? {};
  const statut = r.status ?? null;
  const texte = nettoyerLibelle(r.minute_label);
  const lu = lireLibelle(texte);
  const liste = {
    liveLabel: texte || null,
    liveMinute: entier(r.minute),
    liveAddedTime: entier(r.added_time),
    liveMaxTime: null,
    halfTime: statut === 'mi-temps',
    started: true,
    finished: statut === 'terminé',
    cancelled: statut === 'annulé',
    awarded: false
  };
  const ph = phaseDuReleve({
    liste,
    drapeaux: { prolongationVueA: p.prolongationVue ? 1 : null, tirsAuButVusA: p.tirsAuButVus ? 1 : null, pauseVueA: p.pauseVue ? 1 : null }
  });
  const rougesLus = estEntier(entier(r.home_red)) || estEntier(entier(r.away_red));
  const rouges = rougesLus ? { home: entier(r.home_red) ?? 0, away: entier(r.away_red) ?? 0 } : p.rouges;
  const h = entier(r.home_goals);
  const a = entier(r.away_goals);
  const scoreConnu = estEntier(h) && estEntier(a);
  const calculable = PHASES_CALCULEES.includes(ph.phase) && scoreConnu && estEntier(ph.creneau);
  const etat = {
    takenAt: r.taken_at ?? null,
    phase: ph.phase,
    raison: PHASES_CALCULEES.includes(ph.phase) && !scoreConnu ? 'score-inconnu' : ph.raison,
    calculable,
    creneau: ph.creneau,
    part: ph.part,
    minute: ph.minute,
    ajout: ph.ajout,
    h: scoreConnu ? h : null,
    a: scoreConnu ? a : null,
    rh: rouges ? rouges.home : 0,
    ra: rouges ? rouges.away : 0,
    rougesConnus: Boolean(rouges),
    rougesReportes: !rougesLus && Boolean(rouges)
  };
  const suite = {
    rouges,
    pauseVue: p.pauseVue || ph.phase === 'mi-temps',
    prolongationVue: p.prolongationVue || lu.type === 'prolongation',
    tirsAuButVus: p.tirsAuButVus || lu.type === 'tirs-au-but'
  };
  return { etat, suite };
}
