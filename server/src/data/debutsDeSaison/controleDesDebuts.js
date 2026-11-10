/**
 * controleDesDebuts.js — LE CONTRÔLE ANTI-FUITE DE LA NUIT DES DÉBUTS DE SAISON (étape 35 du plan, lot 1b, 10/11/2026 ;
 * conception §6.5, point 4).
 * -----------------------------------------------------------------------
 * Le patron des contrôles de nuit (32, 33, 34, 36) : des couples (rencontre, camp) tirés avec la graine du jour parmi les
 * rencontres jouées (non attribuées) des 365 derniers jours ; pour chacun, ce que la passe savait AU JOUR J (relevé pendant
 * la passe, AVANT que la journée J soit publiée : `instantaneDuClub`) face à un SECOND CHEMIN qui relit directement les
 * tables sources (team_day, day_matches, player_day), sans la passe :
 *   - les sommes de la candidate de l'étape 27 (forcesButs.etatParLeSecondChemin, à 1e-12) ;
 *   - la case « cette saison » de l'état scindé (les faits du club relus en SQL et rejoués par jouerUnMatchScinde, à 1e-12) ;
 *   - la saison du club pour ce match, la trêve, le rang, le statut, le championnat de la saison d'avant (égalité exacte) ;
 *   - la continuité de l'effectif (les minutes de player_day, égalité exacte).
 * Chaque écart est nommé, avec sa phrase (`texte`, dite telle quelle à l'écran : ui/src/utils/controlesAntiFuite.js). Lecture
 * seule, sur la base de l'appelant (dans la nuit : celle du processus à part). Les clubs et les joueurs sont des NUMÉROS
 * FotMob ; le nom d'un club ne sert qu'à la phrase (l'annuaire, par son identifiant).
 * -----------------------------------------------------------------------
 */

import { etatParLeSecondChemin, ecartsDEtats, reglagesDeLEmpreinte } from '../db/forcesButs.js';
import { faitPourLesForces, matchPourLesForces, moyennesAvant, saisonEnNombre } from '../../core/engine/goalModel.js';
import { seasonOf } from '../providers/seasonWindows.js';
import { BASE_STATISTIQUE, EMPREINTE_DE_LA_BASE, NIVEAUX, NUIT } from './reglagesDebuts.js';
import { jouerUnMatchScinde, estUneTreve, saisonDuClub, statutDuClub, ligueLaPlusJouee, clubValide, etatScindeVide } from './formulesDebuts.js';
import { estDeChampionnat } from './debutsAuJourJ.js';
import { continuiteDe } from '../db/squadChanges.js';

const JOUR_MS = 86_400_000;
const TOLERANCE = 1e-12;
const vrai = (v) => v === true || v === 1;
const jourMoins = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) - n * JOUR_MS).toISOString().slice(0, 10);
const jourDit = (j) => (typeof j === 'string' && /^\d{4}-\d{2}-\d{2}/.test(j) ? `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}` : String(j ?? '?'));
const pourcentDit = (x) => (typeof x === 'number' && Number.isFinite(x) ? `${(100 * x).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} %` : 'aucune');
const texteDe = (v) => (v === null || v === undefined ? 'aucun' : String(v));

/** La graine du contrôle : le jour de la nuit (AAAAMMJJ, jour civil de Paris). */
export const graineDuJour = (jourD) => Number(String(jourD).slice(0, 10).replace(/-/g, ''));

/** Le hasard semé du contrôle (mulberry32, celui des contrôles des étapes 32 à 34). */
function tirage(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * LES COUPLES recontrôlés : `nombre` (rencontre, camp) tirés avec `graine` parmi les rencontres jouées (non attribuées)
 * des `jours` jours d'avant `jourD` (coupes comprises). Rend [{ matchKey, date, camp: 'home' | 'away', club }], triés.
 */
export function tirerLesCouples({ database, jourD, graine, nombre = NUIT.couples, jours = NUIT.joursDuControle }) {
  if (graine === null || graine === undefined || !nombre) return [];
  const lignes = database
    .prepare('SELECT d.match_key, d.date, d.home, d.away FROM day_matches d JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1 WHERE d.date >= ? AND d.date < ? AND t.attribue = 0 ORDER BY d.date, d.match_key')
    .all(jourMoins(jourD, jours), jourD);
  if (!lignes.length) return [];
  const hasard = tirage(graine);
  const choisis = new Map();
  for (let essai = 0; essai < nombre * 20 && choisis.size < Math.min(nombre, lignes.length * 2); essai++) {
    const l = lignes[Math.floor(hasard() * lignes.length)];
    const camp = hasard() < 0.5 ? 'home' : 'away';
    const club = Number(camp === 'home' ? l.home : l.away);
    if (!clubValide(club)) continue;
    choisis.set(`${l.match_key}|${camp}`, { matchKey: l.match_key, date: String(l.date).slice(0, 10), camp, club });
  }
  return [...choisis.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.matchKey < b.matchKey ? -1 : a.matchKey > b.matchKey ? 1 : a.camp < b.camp ? -1 : 1));
}

/**
 * CE QUE LA PASSE SAVAIT au jour J pour un couple — appelé AVANT la publication de la journée J (le crochet `avant` de
 * passerLesRencontres) : la lecture du club (saison, trêve, rang, statut, championnat d'avant, case « cette saison »), l'état
 * de la candidate (copié) et la continuité. `rencontre` : la rencontre du couple dans le flux.
 */
export function instantaneDuClub(debuts, couple, rencontre) {
  const lu = debuts.lireLeClub(couple.club, rencontre);
  if (!lu.valide) return { valide: false };
  const cand = debuts.etatCandidate(couple.club);
  const ms = debuts.minutesDuClub(couple.club, lu.saison);
  const mav = debuts.minutesDuClub(couple.club, lu.saison - 1);
  return {
    valide: true,
    saison: lu.saison,
    treve: lu.treve,
    rang: lu.rang,
    statut: lu.statut,
    ligueAvant: lu.ligueAvant,
    candidate: cand ? { ...cand } : null,
    sai: lu.sommes ? Array.from(lu.sommes.sai) : null,
    continuite: ms && mav ? continuiteDe(ms.joueurs, new Set(mav.joueurs.keys())) : null
  };
}

// ======================================================= le second chemin (SQL direct, sans la passe)

/** Les lignes du club relues en SQL, date < J écrit en toutes lettres, dans l'ordre (jour, clé). */
const lignesDuClub = (database, club, J) =>
  database
    .prepare(`SELECT t.*, d.match_key AS matchKey FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre
              WHERE t.club = ? AND t.date < ? ORDER BY t.date, d.match_key`)
    .all(club, J);

/**
 * LES JOURNÉES DE TOUS LES CHAMPIONNATS refaites en SQL en UNE lecture : la requête de forcesButs.chargerLesJourneesEnSql
 * à l'identique, sans son filtre de championnat (chaque championnat de team_day a sa liste, vide au besoin) — la forme de
 * `liguesSql`. Sans elle, le second chemin de la candidate relit toute la table à chaque nouveau championnat (bac du
 * 10/11/2026 : 12 s pour 20 couples, une seconde ainsi).
 */
export function journeesDeTousLesChampionnats(database) {
  const liguesSql = new Map();
  for (const r of database.prepare('SELECT DISTINCT league FROM team_day').iterate()) liguesSql.set(r.league, []);
  for (const r of database
    .prepare(`SELECT h.league, h.date AS jour, h.saison, COUNT(*) AS n,
                SUM(CASE WHEN h.prolongation = 1 THEN COALESCE(h.bp90, 0) ELSE h.bp END) AS bd,
                SUM(CASE WHEN h.prolongation = 1 THEN COALESCE(h.bc90, 0) ELSE h.bc END) AS be,
                SUM(CASE WHEN h.prolongation = 0 AND h.xg_p IS NOT NULL AND h.xg_c IS NOT NULL THEN 1 ELSE 0 END) AS nx,
                SUM(CASE WHEN h.prolongation = 0 AND h.xg_p IS NOT NULL AND h.xg_c IS NOT NULL THEN h.xg_p ELSE 0 END) AS xd,
                SUM(CASE WHEN h.prolongation = 0 AND h.xg_p IS NOT NULL AND h.xg_c IS NOT NULL THEN h.xg_c ELSE 0 END) AS xe
              FROM team_day h WHERE h.camp = 1 AND h.attribue = 0 AND h.compte = 1
              GROUP BY h.league, h.date, h.saison ORDER BY h.league, h.date`)
    .iterate()) {
    let t = liguesSql.get(r.league);
    if (!t) liguesSql.set(r.league, (t = []));
    t.push({ jour: r.jour, saison: r.saison, n: r.n, bd: r.bd, be: r.be, nx: r.nx, xd: r.xd, xe: r.xe });
  }
  return liguesSql;
}

/**
 * LES JOURS DE CHAMPIONNAT de chaque championnat (club valable, ni coupe, compté, non attribué), relus en UNE lecture : Map
 * championnat → jours triés — le « ses matchs la saison d'avant » du statut sans relire la table à chaque question.
 */
export function joursDesChampionnats(database) {
  const out = new Map();
  for (const r of database.prepare('SELECT DISTINCT league, date FROM team_day WHERE coupe = 0 AND compte = 1 AND attribue = 0 AND club >= 1 ORDER BY league, date').iterate()) {
    let t = out.get(r.league);
    if (!t) out.set(r.league, (t = []));
    t.push(String(r.date));
  }
  return out;
}

/**
 * Le championnat `league` avait-il un match de championnat (club valable) dans la saison `saison` avant le jour `T` (et
 * depuis moins de 900 jours) ? (le « ses matchs la saison d'avant » du statut, relu en SQL ; la saison de chaque jour par
 * seasonOf). `jours` : joursDesChampionnats (sinon, une lecture SQL par question).
 */
function ligueAvaitDesMatchs(database, league, saison, T, cache, jours = null) {
  const cle = `${league}|${saison}|${T}`;
  if (cache.has(cle)) return cache.get(cle);
  let oui = false;
  const borne = jourMoins(T, 900);
  if (jours) {
    const liste = jours.get(league) ?? [];
    let lo = 0;
    let hi = liste.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (liste[mid] < T) lo = mid + 1;
      else hi = mid;
    }
    for (let k = lo - 1; k >= 0 && liste[k] >= borne; k--) {
      if (seasonOf(league, liste[k].slice(0, 10)) === saison) {
        oui = true;
        break;
      }
    }
  } else {
    for (const r of database
      .prepare('SELECT DISTINCT date FROM team_day WHERE league = ? AND coupe = 0 AND compte = 1 AND attribue = 0 AND club >= 1 AND date < ? AND date >= ? ORDER BY date DESC')
      .iterate(league, T, borne)) {
      if (seasonOf(league, String(r.date).slice(0, 10)) === saison) {
        oui = true;
        break;
      }
    }
  }
  cache.set(cle, oui);
  return oui;
}

/**
 * L'ÉTAT D'UN CLUB AU JOUR J PAR LE SECOND CHEMIN : ses lignes relues en SQL (date < J), rejouées à la façon de la passe — la
 * saison du club pour chaque match (le championnat de la veille), la trêve, la remise à zéro, l'état scindé (moyennes du
 * championnat refaites en SQL), les matchs de championnat par saison et championnat, le statut fixé au premier match de
 * championnat de la saison. `rJ` : la rencontre du jour J ({ league, coupe, compte, attribue }) ; `liguesSql`, `jours` :
 * les lectures faites une fois pour tous les couples (journeesDeTousLesChampionnats, joursDesChampionnats). Rend { saison,
 * treve, rang, statut, ligueAvant, sai, candidate, saisonsDesRencontres }.
 */
export function etatParLeSecondCheminDesDebuts({ database, club, J, rJ, liguesSql = new Map(), cacheLigues = new Map(), jours = null }) {
  const candidate = etatParLeSecondChemin({ database, club, J, reglages: reglagesDeLEmpreinte(EMPREINTE_DE_LA_BASE), liguesSql });
  const lignes = lignesDuClub(database, club, J);
  let e = etatScindeVide();
  const champ = new Map();
  const statuts = new Map();
  const saisonsDesRencontres = new Map();
  const statutAuJour = (league, s, T) => {
    const ligueAvant = ligueLaPlusJouee(champ.get(s - 1));
    const avait = ligueAvaitDesMatchs(database, league, s - 1, T, cacheLigues, jours);
    return { statut: statutDuClub({ ligue: league, ligueAvant, ligueAvaitDesMatchs: avait }, NIVEAUX), ligueAvant };
  };
  let i = 0;
  while (i < lignes.length) {
    const jour = String(lignes[i].date).slice(0, 10);
    const ligueVeille = e.ligue;
    const duJour = [];
    while (i < lignes.length && String(lignes[i].date).slice(0, 10) === jour) duJour.push(lignes[i++]);
    for (const l of duJour) {
      if (vrai(l.attribue)) continue;
      const s = saisonDuClub({ league: l.league, date: jour, coupe: vrai(l.coupe) }, ligueVeille);
      saisonsDesRencontres.set(Number(l.rencontre), s);
      const f = faitPourLesForces(l);
      if (!f) continue;
      const L = moyennesAvant(liguesSql.get(f.league) ?? [], { jour: f.jour, saison: saisonEnNombre(f.saison) });
      const deChampionnat = estDeChampionnat({ coupe: vrai(l.coupe), compte: vrai(l.compte), attribue: false });
      if (deChampionnat && !statuts.has(s)) statuts.set(s, statutAuJour(l.league, s, jour));
      e = jouerUnMatchScinde(e, matchPourLesForces(f, L), BASE_STATISTIQUE, { saisonDuMatch: s });
      if (deChampionnat) {
        let parLigue = champ.get(s);
        if (!parLigue) champ.set(s, (parLigue = new Map()));
        const v = parLigue.get(l.league) ?? { n: 0, dernier: '' };
        v.n += 1;
        v.dernier = jour;
        parLigue.set(l.league, v);
      }
    }
  }
  const sJ = saisonDuClub({ league: rJ.league, date: J, coupe: vrai(rJ.coupe) }, e.ligue);
  const treve = estUneTreve(e, sJ);
  const out = { saison: sJ, treve, rang: null, statut: null, ligueAvant: null, sai: treve ? new Array(8).fill(0) : Array.from(e.saison), candidate, saisonsDesRencontres };
  if (estDeChampionnat({ coupe: vrai(rJ.coupe), compte: vrai(rJ.compte), attribue: vrai(rJ.attribue) })) {
    out.rang = 1 + (champ.get(sJ)?.get(rJ.league)?.n ?? 0);
    const sd = statuts.get(sJ) ?? statutAuJour(rJ.league, sJ, J);
    out.statut = sd.statut;
    out.ligueAvant = sd.ligueAvant;
  }
  return out;
}

/**
 * Les minutes des joueurs des clubs demandés (UN balayage de player_day : joués, minutes > 0, identifiant ≥ 1) : Map club →
 * [{ joueur, rencontre, date, minutes }].
 */
export function minutesDesClubs(database, clubs, jusqua) {
  const out = new Map([...new Set(clubs)].map((c) => [c, []]));
  if (!out.size) return out;
  const liste = [...out.keys()];
  for (const l of database
    .prepare(`SELECT joueur, rencontre, club, date, minutes FROM player_day WHERE joue = 1 AND minutes > 0 AND joueur >= 1 AND date < ? AND club IN (${liste.map(() => '?').join(', ')})`)
    .iterate(jusqua, ...liste)) {
    out.get(Number(l.club))?.push({ joueur: Number(l.joueur), rencontre: Number(l.rencontre), date: String(l.date).slice(0, 10), minutes: Number(l.minutes) });
  }
  return out;
}

/** La continuité d'un club au jour J par le second chemin : ses minutes (date < J) rangées par la saison du club de chaque rencontre. */
function continuiteParLeSecondChemin(lignes, J, saisonsDesRencontres, s) {
  const saison = new Map();
  const avant = new Map();
  for (const l of lignes ?? []) {
    if (!(l.date < J)) continue;
    const sr = saisonsDesRencontres.get(l.rencontre);
    if (sr === undefined) continue;
    if (sr === s) saison.set(l.joueur, (saison.get(l.joueur) ?? 0) + l.minutes);
    else if (sr === s - 1) avant.set(l.joueur, (avant.get(l.joueur) ?? 0) + l.minutes);
  }
  if (!saison.size || !avant.size) return null;
  return continuiteDe(saison, new Set(avant.keys()));
}

const COLONNES_SOMMES = ['sa', 'wa', 'sd', 'wd', 'sga', 'wga', 'sgd', 'wgd'];

/** Le nom d'un club pour la phrase (l'annuaire, par son identifiant FotMob) ; « club n° … » sinon. */
export function nomDuClubParLAnnuaire(database) {
  const cache = new Map();
  let st = null;
  return (club) => {
    if (cache.has(club)) return cache.get(club);
    let nom = null;
    try {
      st ??= database.prepare('SELECT name FROM teams WHERE team_id = ?');
      nom = st.get(`fotmob-${club}`)?.name ?? null;
    } catch {
      nom = null;
    }
    const dit = nom ? String(nom) : `club n° ${club}`;
    cache.set(club, dit);
    return dit;
  };
}

/**
 * LE CONTRÔLE : pour chaque couple, l'instantané de la passe face au second chemin. `instantanes` : Map(« clé|camp » →
 * instantané). Rend { lignes, ecarts: [{ matchKey, J, club, camp, colonne, attendu, lu, texte }] }.
 */
export function controlerLesInstantanes({ database, couples, instantanes, nomDuClub = (club) => `club n° ${club}` }) {
  const ecarts = [];
  let lignes = 0;
  if (!couples.length) return { lignes, ecarts };
  const liguesSql = journeesDeTousLesChampionnats(database);
  const jours = joursDesChampionnats(database);
  const cacheLigues = new Map();
  const jusqua = couples.reduce((m, c) => (c.date > m ? c.date : m), '0000-00-00');
  const minutes = minutesDesClubs(database, couples.map((c) => c.club), jusqua);
  const ligneDuJour = database.prepare('SELECT t.league, t.coupe, t.compte, t.attribue FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre WHERE d.match_key = ? AND t.club = ?');
  for (const c of couples) {
    const lu = instantanes.get(`${c.matchKey}|${c.camp}`);
    const qui = `${nomDuClub(c.club)} avant le ${jourDit(c.date)}`;
    const ecart = (colonne, attendu, valeur, phrase) => ecarts.push({ matchKey: c.matchKey, J: c.date, club: c.club, camp: c.camp, colonne, attendu, lu: valeur, texte: `${qui} : ${phrase}` });
    if (!lu || !lu.valide) {
      ecart('instantane', 'relevé', null, 'la passe n’a rien relevé ce jour-là (rencontre sautée)');
      continue;
    }
    const rJ = ligneDuJour.get(c.matchKey, c.club);
    if (!rJ) {
      ecart('rencontre', 'une ligne', null, 'la rencontre n’est plus dans la table du jour (second chemin impossible)');
      continue;
    }
    lignes++;
    const a = etatParLeSecondCheminDesDebuts({ database, club: c.club, J: c.date, rJ, liguesSql, cacheLigues, jours });
    for (const x of ecartsDEtats(a.candidate, lu.candidate, TOLERANCE)) {
      ecart(`candidate.${x.colonne}`, x.attendu, x.lu, `sommes de la candidate, ${x.colonne} : ${texteDe(x.lu)} pour la passe, ${texteDe(x.attendu)} pour le second chemin`);
    }
    const differentes = COLONNES_SOMMES.filter((_, k) => !(Math.abs((a.sai[k] ?? 0) - (lu.sai?.[k] ?? 0)) <= TOLERANCE));
    if (differentes.length) ecart('saison', a.sai, lu.sai, `case « cette saison » (${differentes.join(', ')}) différente entre la passe et le second chemin`);
    for (const [colonne, mot] of [['saison', 'saison du club'], ['treve', 'trêve'], ['rang', 'rang'], ['statut', 'statut'], ['ligueAvant', 'championnat de la saison d’avant']]) {
      if ((a[colonne] ?? null) !== (lu[colonne] ?? null)) ecart(colonne, a[colonne] ?? null, lu[colonne] ?? null, `${mot} « ${texteDe(lu[colonne])} » pour la passe, « ${texteDe(a[colonne])} » pour le second chemin`);
    }
    const cont = continuiteParLeSecondChemin(minutes.get(c.club), c.date, a.saisonsDesRencontres, a.saison);
    if ((cont ?? null) !== (lu.continuite ?? null)) ecart('continuite', cont, lu.continuite ?? null, `continuité ${pourcentDit(lu.continuite)} pour la passe, ${pourcentDit(cont)} pour le second chemin`);
  }
  return { lignes, ecarts };
}
