/**
 * debutsRead.js — LA LECTURE DES DÉBUTS DE SAISON, pour la page du match et la page de l'équipe (étape 35 du plan, lot 1b,
 * 10/11/2026 ; conception §6.6).
 * -----------------------------------------------------------------------
 * Deux lectures, toutes deux EN LECTURE SEULE, par quelques lectures par clé — JAMAIS un calcul lourd (la règle des 25 ms) :
 *   - debutsDuMatch : le bloc « Début de saison » de l'encadré « Contexte du match » — la fiche de la nuit par (date à un jour
 *     près, identifiants FotMob), les deux lignes de `debuts_clubs`, l'état de la dernière nuit (`debuts_etat`). Joint APRÈS
 *     l'analyse (analysis.controller.js, import() dynamique) : le verdict n'en sait rien, l'IA ne le reçoit jamais, et une
 *     lecture qui échoue n'empêche jamais l'analyse (« illisible »). Un match de coupe n'a pas de fiche (un second tournoi
 *     n'est pas un début de saison, décision de Pierre du 02/11) : ses clubs sont dits par leur ligne de la nuit ;
 *   - effectifDuClub : la carte « Arrivées et départs » de la page de l'équipe (GET /api/match-stats/effectif?club=N) — une
 *     ligne de `debuts_clubs`, les noms (`people`) et les pays (`player_birthdates`) des joueurs, les noms des clubs (`teams`),
 *     par lots de 60 identifiants au plus.
 * Les clubs et les joueurs par IDENTIFIANT FotMob seulement (`scoreInputs`, la conversion unique numeroDuClub de l'étape 32),
 * jamais par un nom. Une fiche d'une date future que la dernière nuit n'a pas réécrite est ORPHELINE (match reporté ou re-daté) :
 * jamais lue (la règle de l'étape 32). Rien n'entre dans un pourcentage au lot 1 : « Effet mesuré » veut dire « mesuré utile
 * au banc d'essai, pas encore dans le pourcentage ». Les mots sont faits par l'écran (ui/src/utils/debutsDeSaison.js, pur).
 * Hors de l'empreinte du moteur ; aucun fichier du moteur, du chemin de l'essai 27 ni de l'IA ne l'importe.
 * -----------------------------------------------------------------------
 */

import { VERSION_DEBUTS, VERSION_FICHE, NUIT, N_PREMIERES, QUI_COMPTE, EFFECTIF, BASE_STATISTIQUE, DECISION_DE_PIERRE, LIMITES_DU_LOT_1A, PERIODES_DU_BANC } from './reglagesDebuts.js';
import { DEBUTS_AU_BANC } from './noteDesDebuts.js';
import { saisonCivile, forcesDeDebut } from './formulesDebuts.js';
import { numeroDuClub, jourDe } from '../contexte/formulesDuContexte.js';
import { isCup } from '../providers/leagueCups.js';

const JOUR_MS = 86_400_000;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const FORMAT_JOUR_PARIS = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' });
/** Le jour civil de Paris d'un instant (AAAA-MM-JJ), la même règle que debutsNuit.jourParis. */
export const jourParis = (t) => FORMAT_JOUR_PARIS.format(new Date(t));
/** Les lots des lectures `IN` (conception §6.6 : 60 identifiants au plus par requête). */
export const LOT_IN = 60;
/** Les clubs gardés par la nuit : vus dans les 400 derniers jours (la même règle que debutsEnfant.JOURS_DES_CLUBS, vérifiée par les essais). */
export const JOURS_DES_CLUBS = 400;

/** Les états de la lecture (les mots de l'étape 32). */
export const ETATS_DES_DEBUTS = Object.freeze(['pret', 'pas-encore-calcule', 'hors-fenetre', 'clubs-inconnus', 'illisible']);

/** L'instant de la lecture (ms) : `maintenant` (nombre, texte ISO, Date ou fonction), OBLIGATOIRE — jamais l'horloge lue ici. */
function instantDe(maintenant) {
  const v = typeof maintenant === 'function' ? maintenant() : maintenant;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : Number.NaN;
  if (!fini(t)) throw new Error('débuts de saison : « maintenant » (l’heure de la lecture) est obligatoire.');
  return t;
}

/** Une valeur de `debuts_etat` (JSON) ; null si absente ou illisible ; LÈVE si la base ne répond pas (l'appelant dit « illisible »). */
function valeurDeLEtat(database, cle) {
  const r = database.prepare('SELECT valeur FROM debuts_etat WHERE cle = ?').get(cle);
  if (!r) return null;
  try {
    return JSON.parse(r.valeur);
  } catch {
    return null;
  }
}

/** Un JSON rangé par la nuit, ou null ; LÈVE sur un texte illisible (l'appelant dit « illisible »). */
const lireJson = (texte) => (texte === null || texte === undefined ? null : JSON.parse(texte));

/** La saison dite à l'écran : « 2026-27 » (juillet-juin, Liga MX comprise) ou « 2026 » (année civile). */
export function saisonDite(league, saison) {
  if (!Number.isSafeInteger(saison)) return null;
  return league && saisonCivile(league) ? String(saison) : `${saison}-${String((saison + 1) % 100).padStart(2, '0')}`;
}

/**
 * Une fiche rangée est-elle À LIRE ? Oui si la dernière nuit complète (ou celle en cours de rangement) l'a écrite, ou si elle
 * est FIGÉE pour cette nuit (son coup d'envoi passé ; sans heure, sa date au plus le jour de la nuit). Une fiche d'une date
 * future que la dernière nuit n'a pas réécrite est ORPHELINE : jamais lue (la règle `ficheALire` de l'étape 32).
 */
export function ficheALire(r, { nuit, enCours = null }) {
  if (!r) return false;
  const cles = [nuit?.calculeLe, enCours?.calculeLe].filter(Boolean);
  if (!cles.length) return false;
  if (cles.includes(r.calcule_le)) return true;
  if (!nuit?.calculeLe) return false;
  const ko = Date.parse(r.kickoff ?? '');
  if (Number(r.kickoff_connu) && fini(ko)) return ko <= Date.parse(nuit.calculeLe);
  return typeof r.date === 'string' && r.date <= (nuit.jourD ?? jourParis(Date.parse(nuit.calculeLe)));
}

/** La fiche à lire parmi celles de la date, de la veille et du lendemain : la date exacte d'abord, sinon la plus récente. */
export function choisirLaFiche(lignes, { date, nuit, enCours = null }) {
  const lisibles = (lignes ?? []).filter((r) => ficheALire(r, { nuit, enCours }));
  const exacte = lisibles.find((r) => r.date === date);
  if (exacte) return exacte;
  return lisibles.sort((a, b) => (a.calcule_le < b.calcule_le ? 1 : a.calcule_le > b.calcule_le ? -1 : 0))[0] ?? null;
}

/** Ce que l'écran dit du banc : la note recopiée par script, sans les chemins des fichiers ni leurs empreintes. */
export function bancPourLEcran(note = DEBUTS_AU_BANC) {
  if (!note || typeof note !== 'object') return null;
  return {
    calculeLe: note.calculeLe ?? null,
    premierRegard: note.premierRegard ?? null,
    K: note.K ?? null,
    z: note.z ?? null,
    mesure: note.mesure ?? null,
    variantes: (note.variantes ?? []).map((v) => ({
      id: v.id,
      famille: v.famille,
      fenetre: v.fenetre,
      placebo: v.placebo === true,
      verdict: v.verdict,
      matchsJuges: v.matchsJuges ?? null,
      gainRelatif: v.gainRelatif ?? null,
      fourchetteRelative: Array.isArray(v.fourchetteRelative) ? [...v.fourchetteRelative] : null,
      ampleur: v.ampleur ? { ...v.ampleur } : null,
      unDeuxSeul: v.unDeuxSeul ? { ...v.unDeuxSeul } : null
    })),
    familles: note.familles ? JSON.parse(JSON.stringify(note.familles)) : null,
    utiles: [...(note.utiles ?? [])],
    statuts: note.statuts ? { ...note.statuts } : null,
    horizons: note.horizons ? JSON.parse(JSON.stringify(note.horizons)) : null,
    periodes: JSON.parse(JSON.stringify(PERIODES_DU_BANC)),
    limites: [...(note.limites ?? LIMITES_DU_LOT_1A)]
  };
}

/** Le résumé des mouvements d'un club pour le bloc de la page du match (les comptes ; le détail est sur la page de l'équipe). */
export function resumeDesMouvements(m) {
  if (!m) return null;
  const ref = m.reference ?? [];
  return {
    debut: m.debut ?? null,
    matchsSaison: m.matchsSaison ?? 0,
    matchsAvant: m.matchsAvant ?? 0,
    reference: ref.length,
    restes: ref.filter((r) => r.etat === 'joue').length,
    partis: ref.filter((r) => r.etat === 'parti').length,
    pasRevus: ref.filter((r) => r.etat === 'pas-revu').length,
    arrives: (m.arrives ?? []).length,
    arrivesQuiComptent: (m.arrives ?? []).filter((a) => a.compte).length,
    doubles: (m.doubles ?? []).length
  };
}

/** Une ligne de `debuts_clubs` pour l'écran (les JSON relus ; LÈVE sur un JSON illisible). */
function ligneDuClub(r) {
  if (!r) return null;
  const mouvements = lireJson(r.mouvements);
  return {
    league: r.league ?? null,
    saison: r.saison ?? null,
    saisonDite: saisonDite(r.league, r.saison),
    rang: r.rang ?? null,
    statut: r.statut ?? null,
    ligueAvant: r.ligue_avant ?? null,
    continuite: fini(r.continuite) ? r.continuite : null,
    contMoyLigue: fini(r.cont_moy_ligue) ? r.cont_moy_ligue : null,
    mouvements: resumeDesMouvements(mouvements),
    force: lireJson(r.force_effectif),
    sansIdentifiant: fini(r.sans_identifiant) ? r.sans_identifiant : null,
    calculeLe: r.calcule_le ?? null,
    version: r.version ?? null
  };
}

/** La part de la moyenne du championnat dans la force lue (le rétrécissement de la candidate, 8 / (W + 8) par club). */
function partDeLaMoyenne(e, r = BASE_STATISTIQUE) {
  const tot = Array.isArray(e?.tot) ? e.tot : null;
  if (!tot) return null;
  const part = (w) => (fini(w) && w >= 0 ? r.prior / (w + r.prior) : null);
  return { attaque: part(tot[1]), defense: part(tot[3]) };
}

/** Les forces de début de saison avec et sans l'oubli `d` (seulement quand la note dit le rappel utile), depuis la fiche. */
function forcesDuRappel(e, d) {
  if (!e?.valide || !Array.isArray(e.tot) || !Array.isArray(e.sai) || !fini(d)) return null;
  const lu = { tot: Float64Array.from(e.tot), sai: Float64Array.from(e.sai), n: e.n ?? 0, nx: e.nx ?? 0 };
  const sans = forcesDeDebut(lu, {});
  const avec = forcesDeDebut(lu, { d });
  return { sans: { attaque: sans.attaque, defense: sans.defense }, avec: { attaque: avec.attaque, defense: avec.defense } };
}

/** Un club de la fiche, pour l'écran : ce que la nuit a gelé pour CE match, et sa ligne de la nuit. */
function clubDeLaFiche(e, ligne, { id, nom, league, note }) {
  const rappelUtile = note?.familles?.rappel?.utile === true;
  return {
    id,
    nom,
    valide: e?.valide !== false,
    league,
    rang: e?.rang ?? null,
    statut: e?.statut ?? null,
    saison: e?.saison ?? null,
    saisonDite: saisonDite(league, e?.saison ?? null),
    ligueAvant: e?.ligueAvant ?? null,
    treve: e?.treve ?? null,
    matchs: e?.n ?? null,
    partDeLaMoyenne: partDeLaMoyenne(e),
    rappel: rappelUtile ? forcesDuRappel(e, note?.valeursFinales?.magasin?.dRappel) : null,
    continuite: fini(e?.continuite) ? e.continuite : null,
    contMoyLigue: fini(e?.contMoyLigue) ? e.contMoyLigue : null,
    effectif: e?.effectif ?? null,
    ligne
  };
}

/** Les réglages que l'écran cite (seuils, fenêtre). */
const SEUILS_DE_L_ECRAN = Object.freeze({
  fenetreJours: NUIT.fenetreJours,
  nPremieres: N_PREMIERES,
  quiCompte: QUI_COMPTE.part,
  minMatchsArrivee: QUI_COMPTE.minMatchsArrivee,
  effectifMinMatchs: EFFECTIF.minMatchs,
  prior: BASE_STATISTIQUE.prior,
  demarrage: BASE_STATISTIQUE.demarrageAFroid?.matchs ?? BASE_STATISTIQUE.prior,
  joursDesClubs: JOURS_DES_CLUBS
});

/**
 * LE DÉBUT DE SAISON D'UN MATCH (lecture seule, quelques lectures par clé). `match` : le match de l'analyse (identifiants par
 * `scoreInputs.home/away.teamId`) ; `database` : la base (openDb) ; `maintenant` : l'instant de la lecture (obligatoire) ;
 * `note` : le banc (par défaut, la note recopiée). Rend { version, etat, raison, date, paraitLe, league, coupe, clubs
 * { home, away }, fiche, nuit, statuts, banc, decision, seuils } — jamais une exception pour une base qui ne répond pas.
 */
export function debutsDuMatch({ match, database, maintenant, note = DEBUTS_AU_BANC }) {
  const instant = instantDe(maintenant);
  const home = numeroDuClub(match?.scoreInputs?.home?.teamId ?? match?.homeId ?? null);
  const away = numeroDuClub(match?.scoreInputs?.away?.teamId ?? match?.awayId ?? null);
  const date = jourDe(match?.commenceTime);
  const league = typeof match?.league === 'string' && match.league ? match.league : null;
  const coupe = Boolean(league && isCup(league));
  const base = {
    version: VERSION_DEBUTS,
    etat: 'pret',
    raison: null,
    date,
    paraitLe: null,
    league,
    coupe,
    clubs: { home: { id: home, nom: match?.home ?? null }, away: { id: away, nom: match?.away ?? null } },
    fiche: null,
    nuit: null,
    statuts: note?.statuts ? { ...note.statuts } : null,
    banc: bancPourLEcran(note),
    decision: DECISION_DE_PIERRE.effectifDansLesChiffres,
    seuils: { ...SEUILS_DE_L_ECRAN }
  };
  if (!date) return { ...base, etat: 'illisible', raison: 'date-du-match-illisible' };
  if (home === null || away === null) return { ...base, etat: 'clubs-inconnus', raison: 'sans-identifiant' };
  if (!database) return { ...base, etat: 'illisible', raison: 'base-absente' };
  let nuit;
  let enCours;
  let lignes;
  let rangs;
  try {
    nuit = valeurDeLEtat(database, 'nuit');
    enCours = valeurDeLEtat(database, 'en_cours');
    lignes = coupe
      ? []
      : database
          .prepare('SELECT id, date, home_id, away_id, league, match_id, kickoff, kickoff_connu, calcule_le, version, note, apres_coup_d_envoi, entrees, bras, match_key FROM debuts_fiches WHERE date IN (?, ?, ?) AND home_id = ? AND away_id = ?')
          .all(plusJours(date, -1), date, plusJours(date, 1), home, away);
    rangs = database.prepare('SELECT * FROM debuts_clubs WHERE club IN (?, ?)').all(home, away);
  } catch {
    return { ...base, etat: 'illisible', raison: 'base-sans-reponse' };
  }
  let lignesDesClubs;
  try {
    lignesDesClubs = { home: ligneDuClub(rangs.find((r) => Number(r.club) === home) ?? null), away: ligneDuClub(rangs.find((r) => Number(r.club) === away) ?? null) };
  } catch {
    return { ...base, etat: 'illisible', raison: 'ligne-illisible' };
  }
  const avecEtat = {
    ...base,
    nuit: nuit?.calculeLe ? { calculeLe: nuit.calculeLe, jourD: nuit.jourD ?? jourParis(Date.parse(nuit.calculeLe)) } : null,
    clubs: {
      home: { ...base.clubs.home, ligne: lignesDesClubs.home },
      away: { ...base.clubs.away, ligne: lignesDesClubs.away }
    }
  };
  // Un match de coupe : jamais de fiche (pas un début de saison) ; ses clubs par leur ligne de la nuit.
  if (coupe) {
    if (!avecEtat.nuit) return { ...avecEtat, etat: 'pas-encore-calcule', raison: 'premiere-nuit' };
    return { ...avecEtat, raison: 'coupe' };
  }
  const r = choisirLaFiche(lignes, { date, nuit, enCours });
  if (!r) {
    const aujourdhui = jourParis(instant);
    if (date > plusJours(aujourdhui, NUIT.fenetreJours)) return { ...avecEtat, etat: 'hors-fenetre', raison: 'au-dela-de-14-jours', paraitLe: plusJours(date, -NUIT.fenetreJours) };
    if (!avecEtat.nuit) return { ...avecEtat, etat: 'pas-encore-calcule', raison: 'premiere-nuit' };
    const couvert = date >= avecEtat.nuit.jourD && date <= plusJours(avecEtat.nuit.jourD, NUIT.fenetreJours);
    return { ...avecEtat, etat: 'pas-encore-calcule', raison: couvert ? 'absent-de-la-derniere-nuit' : 'apres-la-derniere-nuit' };
  }
  if (Number(r.version) !== VERSION_FICHE) return { ...avecEtat, etat: 'illisible', raison: 'autre-version' };
  let entrees;
  let bras;
  try {
    entrees = JSON.parse(r.entrees);
    bras = lireJson(r.bras);
  } catch {
    return { ...avecEtat, etat: 'illisible', raison: 'fiche-illisible' };
  }
  const ligue = r.league ?? league;
  return {
    ...avecEtat,
    clubs: {
      home: clubDeLaFiche(entrees?.home, lignesDesClubs.home, { id: home, nom: base.clubs.home.nom, league: ligue, note }),
      away: clubDeLaFiche(entrees?.away, lignesDesClubs.away, { id: away, nom: base.clubs.away.nom, league: ligue, note })
    },
    fiche: {
      calculeLe: r.calcule_le,
      date: r.date,
      dateExacte: r.date === date,
      league: ligue,
      saison: entrees?.saison ?? null,
      saisonDite: saisonDite(ligue, entrees?.saison ?? null),
      fige: Boolean(avecEtat.nuit) && r.calcule_le !== nuit?.calculeLe && r.calcule_le !== enCours?.calculeLe,
      apresCoupDEnvoi: Number(r.apres_coup_d_envoi) === 1,
      note: r.note ?? null,
      ensembles: entrees?.ensembles ?? null,
      bras
    }
  };
}

// ======================================================= la carte « Arrivées et départs » (page de l'équipe)

/** Les lignes d'une table par identifiants, par lots de LOT_IN : Map(clé → ligne). `sql` reçoit les « ? » du lot. */
function parLots(database, ids, sql, cle) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += LOT_IN) {
    const lot = ids.slice(i, i + LOT_IN);
    for (const r of database.prepare(sql(lot.map(() => '?').join(', '))).all(...lot)) out.set(r[cle], r);
  }
  return out;
}

/** Les noms (annuaire `people`) et les pays (`player_birthdates`) de ces joueurs : Map(numéro → { nom, pays, nomPays }). */
function joueursDeLAnnuaire(database, numeros) {
  const ids = [...new Set(numeros.filter((j) => Number.isSafeInteger(j) && j > 0))].map((j) => `fotmob-${j}`);
  const noms = parLots(database, ids, (q) => `SELECT player_id, name FROM people WHERE player_id IN (${q})`, 'player_id');
  let pays = new Map();
  try {
    pays = parLots(database, ids, (q) => `SELECT player_id, country_code, country_name FROM player_birthdates WHERE player_id IN (${q})`, 'player_id');
  } catch {
    // Sans la table : pas de drapeau (jamais une requête de plus à l'écran).
  }
  const out = new Map();
  for (const id of ids) {
    const n = noms.get(id);
    const p = pays.get(id);
    out.set(Number(id.slice(7)), { nom: n?.name ?? null, pays: p?.country_code ?? null, nomPays: p?.country_name ?? null });
  }
  return out;
}

/** Les noms et championnats de ces clubs (annuaire `teams`) : Map(numéro → { id, teamId, nom, league }). */
function clubsDeLAnnuaire(database, numeros) {
  const ids = [...new Set(numeros.filter((c) => Number.isSafeInteger(c) && c > 0))].map((c) => `fotmob-${c}`);
  const lus = parLots(database, ids, (q) => `SELECT team_id, name, league FROM teams WHERE team_id IN (${q})`, 'team_id');
  const out = new Map();
  for (const id of ids) {
    const r = lus.get(id);
    out.set(Number(id.slice(7)), { id: Number(id.slice(7)), teamId: id, nom: r?.name ?? null, league: r?.league ?? null });
  }
  return out;
}

const part = (minutes, matchs) => (fini(minutes) && matchs > 0 ? minutes / (90 * matchs) : null);

/**
 * L'EFFECTIF D'UN CLUB (lecture seule) : `club` (« fotmob-N » ou N) ; `database`. Rend { version, etat, raison, club, saison,
 * mouvements: { debut, matchsSaison, matchsAvant }, reference, arrives, doubles, sansSaisonDAvant, nuit, banc, decision,
 * seuils } — les joueurs par identifiant FotMob, leur nom et leur pays par l'annuaire ; « parti » seulement vu jouer
 * ailleurs (sinon « pas revu ») ; un double possible dit, jamais réuni.
 */
export function effectifDuClub({ club, database, note = DEBUTS_AU_BANC }) {
  const id = numeroDuClub(club);
  const base = {
    version: VERSION_DEBUTS,
    etat: 'pret',
    raison: null,
    club: { id, teamId: id === null ? null : `fotmob-${id}`, nom: null, league: null },
    saison: null,
    mouvements: null,
    reference: [],
    arrives: [],
    doubles: [],
    sansSaisonDAvant: false,
    force: null,
    sansIdentifiant: null,
    continuite: null,
    contMoyLigue: null,
    rang: null,
    statut: null,
    ligueAvant: null,
    calculeLe: null,
    nuit: null,
    banc: bancPourLEcran(note),
    decision: DECISION_DE_PIERRE.effectifDansLesChiffres,
    seuils: { ...SEUILS_DE_L_ECRAN }
  };
  if (id === null) return { ...base, etat: 'clubs-inconnus', raison: 'sans-identifiant' };
  if (!database) return { ...base, etat: 'illisible', raison: 'base-absente' };
  let nuit;
  let r;
  let equipe;
  try {
    nuit = valeurDeLEtat(database, 'nuit');
    r = database.prepare('SELECT * FROM debuts_clubs WHERE club = ?').get(id) ?? null;
    equipe = database.prepare('SELECT name, league FROM teams WHERE team_id = ?').get(`fotmob-${id}`) ?? null;
  } catch {
    return { ...base, etat: 'illisible', raison: 'base-sans-reponse' };
  }
  const avecEtat = {
    ...base,
    club: { ...base.club, nom: equipe?.name ?? null, league: equipe?.league ?? null },
    nuit: nuit?.calculeLe ? { calculeLe: nuit.calculeLe, jourD: nuit.jourD ?? jourParis(Date.parse(nuit.calculeLe)) } : null
  };
  if (!r) return { ...avecEtat, etat: 'pas-encore-calcule', raison: avecEtat.nuit ? 'absent-de-la-derniere-nuit' : 'premiere-nuit' };
  if (Number(r.version) !== VERSION_DEBUTS) return { ...avecEtat, etat: 'illisible', raison: 'autre-version' };
  let m;
  let force;
  try {
    m = lireJson(r.mouvements);
    force = lireJson(r.force_effectif);
  } catch {
    return { ...avecEtat, etat: 'illisible', raison: 'ligne-illisible' };
  }
  const commun = {
    ...avecEtat,
    club: { ...avecEtat.club, league: r.league ?? avecEtat.club.league },
    saison: { valeur: r.saison ?? null, dite: saisonDite(r.league, r.saison) },
    rang: r.rang ?? null,
    statut: r.statut ?? null,
    ligueAvant: r.ligue_avant ?? null,
    continuite: fini(r.continuite) ? r.continuite : null,
    contMoyLigue: fini(r.cont_moy_ligue) ? r.cont_moy_ligue : null,
    force,
    sansIdentifiant: fini(r.sans_identifiant) ? r.sans_identifiant : null,
    calculeLe: r.calcule_le ?? null
  };
  if (!m) return { ...commun, sansSaisonDAvant: true };
  let joueurs;
  let clubs;
  try {
    const numeros = [...(m.reference ?? []).map((x) => x.j), ...(m.arrives ?? []).map((x) => x.j), ...(m.doubles ?? []).flatMap((d) => [d.pasRevu, d.arrive])];
    joueurs = joueursDeLAnnuaire(database, numeros);
    clubs = clubsDeLAnnuaire(database, [...(m.reference ?? []).filter((x) => x.etat === 'parti').map((x) => x.club), ...(m.arrives ?? []).map((x) => x.dOu?.club)]);
  } catch {
    return { ...commun, etat: 'illisible', raison: 'annuaire-sans-reponse' };
  }
  const joueur = (j) => ({ id: j, playerId: `fotmob-${j}`, ...(joueurs.get(j) ?? { nom: null, pays: null, nomPays: null }) });
  const leClub = (c) => (Number.isSafeInteger(c) ? clubs.get(c) ?? { id: c, teamId: `fotmob-${c}`, nom: null, league: null } : null);
  const ms = m.matchsSaison ?? 0;
  const mav = m.matchsAvant ?? 0;
  return {
    ...commun,
    mouvements: { debut: m.debut ?? null, matchsSaison: ms, matchsAvant: mav },
    reference: (m.reference ?? []).map((x) => ({
      ...joueur(x.j),
      poste: x.poste ?? null,
      minutesAvant: x.avant ?? 0,
      partAvant: part(x.avant, mav),
      minutes: x.m ?? 0,
      partSaison: part(x.m, ms),
      etat: x.etat,
      club: x.etat === 'parti' ? leClub(x.club) : null,
      date: x.etat === 'parti' ? x.date ?? null : null,
      raison: x.etat === 'pas-revu' ? x.raison ?? null : null,
      jourRaison: x.etat === 'pas-revu' ? x.jourRaison ?? null : null
    })),
    arrives: (m.arrives ?? []).map((x) => ({
      ...joueur(x.j),
      poste: x.poste ?? null,
      minutes: x.m ?? 0,
      partSaison: part(x.m, ms),
      compte: x.compte === true,
      dOu: x.dOu ? { club: leClub(x.dOu.club), date: x.dOu.date ?? null, recent: x.dOu.recent === true } : null
    })),
    doubles: (m.doubles ?? []).map((d) => ({ pasRevu: joueur(d.pasRevu), arrive: joueur(d.arrive), naissance: d.naissance ?? null, poste: d.poste ?? null }))
  };
}

export const __pourLesTests = { valeurDeLEtat, ligneDuClub, partDeLaMoyenne, forcesDuRappel, plusJours, parLots };
