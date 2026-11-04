/**
 * avantMatchJoueurs.js — L'ENREGISTREUR D'AVANT-MATCH DES CHIFFRES DES JOUEURS (étape 34 du plan, lot 1b, 03/11/2026).
 * -----------------------------------------------------------------------
 * Dans le tour des enregistreurs (jobs/enregistreurs.js, par un import() DYNAMIQUE, EN DERNIER, toutes les 10 minutes) :
 * les compos que FotMob a publiées (le cache des compositions `upcoming_lineups`, écrit par la boucle des compositions et
 * la page du match — jamais ici) pour les matchs des 150 prochaines minutes, lues APRÈS la dernière ligne « publiee » de
 * l'archive, sont chiffrées avec les fiches et la base de la nuit (la même formule que la nuit et l'écran :
 * chiffresDesJoueurs.js) et gardées dans `joueurs_avant_match` (ligne « publiee ») — SEULEMENT avant le coup d'envoi
 * (heure sûre), une transaction courte par match. Synchrone (critique de l'étape 34, constat 15 : jamais l'attente d'un
 * verrou dans le tour) ; un budget de 2 s, ce qui reste est fait au tour suivant ; le verrou d'actualisation tenu, ou une
 * nuit en cours de rangement : rien. Ne touche ni lineupPrefetch.js, ni upcoming_lineups. Jamais lu par le moteur ni
 * envoyé à l'IA.
 * -----------------------------------------------------------------------
 */

import { AVANT_MATCH, VERSION_JOUEURS } from './reglagesJoueurs.js';
import { JOUEURS_AU_BANC } from './noteDesJoueurs.js';
import { parametresDeLEcran, ligneDArchive } from './chiffresDesJoueurs.js';
import { compoDeLaPage } from './lectureDesCompos.js';
import { fusions } from './lectureDesJoueurs.js';
import { ligneDuMatch, fichesDe, chiffresDuMatch } from './joueursRead.js';
import { ecrireLArchive, lireLaValeur } from './joueursNuit.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const numeroDuClub = (id) => {
  const m = String(id ?? '').trim().match(/^(?:fotmob-)?([1-9]\d*)$/);
  return m && Number.isSafeInteger(Number(m[1])) ? Number(m[1]) : null;
};
const JOUR_MS = 86_400_000;
const jourIso = (t) => new Date(t).toISOString().slice(0, 10);
/** Le budget d'un tour (critique, constat 15). */
export const BUDGET_MS = 2000;

/**
 * UN TOUR. `maintenant` (ms, OBLIGATOIRE : celui du tour), `database`, `verrouTenu()` (le verrou d'actualisation),
 * `note`, `budgetMs`, `chrono()` (le temps écoulé, pour les essais). Rend un bilan { matchs, ecrites, gardees,
 * apresCoupDEnvoi, sansBase, sansHeure, coupe, rien? }.
 */
export function tourAvantMatch({ maintenant, database, verrouTenu = () => false, note = JOUEURS_AU_BANC, budgetMs = BUDGET_MS, chrono = null }) {
  if (!fini(maintenant)) throw new Error('avant-match des joueurs : « maintenant » est obligatoire');
  const t0 = performance.now();
  const ecoule = typeof chrono === 'function' ? chrono : () => performance.now() - t0;
  const bilan = { matchs: 0, ecrites: 0, gardees: 0, apresCoupDEnvoi: 0, sansBase: 0, sansHeure: 0, dejaLues: 0, coupe: false };
  if (verrouTenu()) return { ...bilan, rien: 'verrou d’actualisation tenu' };
  const p = parametresDeLEcran(note);
  if (!p) return { ...bilan, rien: 'pas encore de banc d’essai' };
  if (lireLaValeur(database, 'en_cours')) return { ...bilan, rien: 'la nuit range ses tables' };
  const reperes = lireLaValeur(database, 'reperes');
  if (!reperes) return { ...bilan, rien: 'pas encore de nuit' };
  const jours = [jourIso(maintenant - JOUR_MS), jourIso(maintenant), jourIso(maintenant + JOUR_MS)];
  let lignes;
  try {
    lignes = database.prepare('SELECT fotmob_id, date, kickoff, home_id, away_id, payload, fetched_at FROM upcoming_lineups WHERE date IN (?, ?, ?) ORDER BY kickoff, fotmob_id').all(...jours);
  } catch {
    return { ...bilan, rien: 'cache des compositions illisible' };
  }
  const parFusion = fusions(database);
  const derniereLue = database.prepare("SELECT compo_lue_le FROM joueurs_avant_match WHERE rencontre = ? AND etat = 'publiee'");
  for (const l of lignes) {
    const ko = Date.parse(l.kickoff ?? '');
    if (!fini(ko)) {
      bilan.sansHeure += 1;
      continue;
    }
    if (!(ko > maintenant && ko - maintenant <= AVANT_MATCH.fenetreMin * 60_000)) continue;
    if (!(Date.parse(l.fetched_at) < ko)) continue;
    if (ecoule() > budgetMs) {
      bilan.coupe = true;
      break;
    }
    bilan.matchs += 1;
    const home = numeroDuClub(l.home_id);
    const away = numeroDuClub(l.away_id);
    const ligne = home && away ? ligneDuMatch(database, { home, away, date: l.date }) : null;
    if (!ligne) {
      bilan.sansBase += 1;
      continue;
    }
    const deja = derniereLue.get(ligne.rencontre)?.compo_lue_le ?? '';
    if (deja && !(l.fetched_at > deja)) {
      bilan.dejaLues += 1;
      continue;
    }
    let page;
    try {
      page = JSON.parse(l.payload);
    } catch {
      continue;
    }
    if (!page?.available) continue;
    const cote = compoDeLaPage(page, parFusion);
    const compo = { etat: 'publiee', home: { joueurs: [...cote.home.titulaires, ...cote.home.remplacants] }, away: { joueurs: [...cote.away.titulaires, ...cote.away.remplacants] } };
    const ficheDe = fichesDe(database, [...compo.home.joueurs, ...compo.away.joueurs].map((j) => j.id));
    const ch = chiffresDuMatch({ ligne, compo, ficheDe, reperes, p });
    const joueurs = [];
    const recalees = {};
    for (const camp of ['home', 'away']) {
      const c = ch[camp];
      if (!c) continue;
      recalees[camp] = c.base;
      for (const j of c.titulaires) joueurs.push(ligneDArchive(camp === 'home' ? 'h' : 'a', j, true));
      for (const j of c.remplacants) joueurs.push(ligneDArchive(camp === 'home' ? 'h' : 'a', j, false));
    }
    if (!joueurs.length) continue;
    let sources = {};
    try {
      sources = JSON.parse(ligne.sources ?? '{}');
    } catch {
      sources = {};
    }
    const base = {
      lambdaS: { dom: ligne.lambda_dom, ext: ligne.lambda_ext },
      S: { home: ligne.cadres_dom, away: ligne.cadres_ext },
      C: { dom: ligne.cartes_dom, ext: ligne.cartes_ext },
      recalees,
      nuit: ligne.calcule_le,
      dernieres: sources.dernieres ?? null,
      note: { calculeLe: p.calculeLe, bras: p.bras, tireur: p.tireur },
      fotmobId: String(l.fotmob_id),
      absentsRetires: { home: [], away: [] },
      compo: { etat: 'publiee', lueLe: l.fetched_at }
    };
    const r = ecrireLArchive(database, { rencontre: ligne.rencontre, etat: 'publiee', kickoff: l.kickoff, compo_lue_le: l.fetched_at, ecrit_le: new Date(maintenant).toISOString(), base: JSON.stringify(base), joueurs: JSON.stringify(joueurs), version: VERSION_JOUEURS }, maintenant);
    if (r === 'ecrite') bilan.ecrites += 1;
    else if (r === 'gardee') bilan.gardees += 1;
    else bilan.apresCoupDEnvoi += 1;
  }
  bilan.dureeMs = Math.round(ecoule());
  return bilan;
}
