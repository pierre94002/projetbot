/**
 * reglementJoueurs.js — LE RÈGLEMENT DES MARCHÉS DES JOUEURS, À BLANC (étape 34 du plan, lot 1a, 03/11/2026 ; correction 12).
 * -----------------------------------------------------------------------
 * Pur : ni base, ni fichier, ni horloge. Il sert au banc (issues et relevés), à l'archive (la preuve plus tard) et, au
 * lot 2 seulement, au règlement des paris de Pierre. settlementRules.js et settlementService.js NE SONT PAS touchés
 * (sha1 vérifiés, T-X6). Aucun pari n'est réglé au lot 1 (Q6).
 * Les règles de Pierre (02/11/2026, décision n° 6) : joueur non entré = pari REMBOURSÉ ; but contre son camp exclu ;
 * prolongation exclue (90 minutes et temps additionnel). Le joueur et les clubs se lisent par IDENTIFIANT FotMob (après
 * people_merges, fait par le lecteur), jamais par le nom (ni teamNamesLikelyMatch, ni rapprochement de noms).
 *
 * La rencontre, normalisée par le lecteur : { statut: 'jouee' | 'attribuee' | 'annulee' | 'reportee', prolongation,
 * evenements (le déroulé entier, identifiants en nombres), cartonsReleves (statut de la 33, garde comprise), douteuse
 * (la feuille « buteurs et score » rouge ou orange), camps: { home: { lignes, buts90, cadresDEquipe }, away } } ;
 * `compoLue` (facultatif) : les identifiants de la composition LUE AVANT le match (Set), pour distinguer un pari sur un
 * joueur qui n'était même pas sur la feuille (non réglable) d'un non-partant (remboursé) — critique, constat 20.3.
 * -----------------------------------------------------------------------
 */

import { relevesDUnCamp, nombre } from './formulesDesJoueurs.js';

/** Les marchés du lot 1 (décision n° 6 de Pierre). */
export const MARCHES_JOUEURS = Object.freeze(['marque', 'cadres', 'averti', 'passeur']);
/** Les statuts d'un règlement. */
export const STATUTS_REGLEMENT = Object.freeze(['gagne', 'perdu', 'rembourse', 'en-attente', 'non-reglable']);

const CARTONS = new Set(['yellow', 'yellowred', 'red']);
const horsTerrain = (e) => e?.notOnPitch === true || String(e?.note ?? '').toLowerCase() === 'not_on_pitch';
/** Un événement du temps réglementaire (temps additionnel compris : minute ≤ 90 ; un carton après le coup de sifflet final porte 90 + x : compté). */
export const dansLes90 = (e) => {
  const m = nombre(e?.minute);
  return m === null || m <= 90;
};

/**
 * LES RELEVÉS DE LA RENCONTRE (les drapeaux du §2.2, par camp) sur le temps réglementaire : buts de minute ≤ 90 face au
 * score à la 90e. Rend { home, away } (relevesDUnCamp).
 */
export function relevesDeLaRencontre(rencontre) {
  const ev = (rencontre?.evenements ?? []).filter(dansLes90);
  const out = {};
  for (const camp of ['home', 'away']) {
    const c = rencontre?.camps?.[camp] ?? {};
    out[camp] = relevesDUnCamp({ lignes: c.lignes ?? [], evenements: ev, camp, butsDuCamp: c.buts90 ?? null, cadresDEquipe: c.cadresDEquipe ?? null, cartonsReleves: rencontre?.cartonsReleves });
  }
  return out;
}

const resultat = (statut, valeur = null, raison = '') => ({ statut, valeur, raison });

/**
 * RÉGLER UN JOUEUR (pur) : `marche` ('marque' | 'cadres' | 'averti' | 'passeur'), `ligne` (au moins N, N ≥ 1 ; 1 par
 * défaut), `joueur` (identifiant FotMob, un nombre), `rencontre`, `compoLue`. Rend { statut, valeur, raison } :
 *   - joueur sans identifiant (FotMob 0, saisie par nom) : « non-reglable » ;
 *   - match attribué, annulé, reporté : « rembourse » ;
 *   - aucune ligne jouée (minutes > 0) : « rembourse » (non-partant ; un titulaire sans minute aussi) — sauf si la compo
 *     lue avant le match est connue et ne le contient pas : « non-reglable » ;
 *   - marque : ses buts hors csc de minute ≤ 90 à son identifiant ; atteint → « gagne » (même si un coéquipier buteur n'a
 *     pas d'identifiant : critique, constat 20.1) ; sinon « perdu » seulement si les buteurs sont relevés et la feuille
 *     n'est pas douteuse, sinon « en-attente » ;
 *   - cadres et passeur : statistiques sur 120 minutes → « en-attente » pour un match prolongé ; relevé exigé ;
 *   - averti : un carton (jaune, deuxième jaune, rouge) de minute ≤ 90 à son identifiant, REÇU SUR LE TERRAIN (un carton
 *     noté « not_on_pitch » ne compte pas au RÈGLEMENT — le modèle, lui, le compte : règle unique de la 33) ; atteint →
 *     « gagne » ; sinon « perdu » si les cartons sont relevés, sinon « en-attente ».
 */
export function reglerUnJoueur({ marche, ligne = 1, joueur, rencontre, compoLue = null }) {
  if (!MARCHES_JOUEURS.includes(marche)) throw new Error(`reglerUnJoueur : marché inconnu « ${marche} »`);
  const N = Math.max(1, Math.ceil(Number(ligne) || 1));
  if (!Number.isSafeInteger(joueur) || joueur <= 0) return resultat('non-reglable', null, 'joueur sans identifiant FotMob');
  const statut = rencontre?.statut ?? 'jouee';
  if (statut !== 'jouee') return resultat('rembourse', null, `match ${statut}`);
  let camp = null;
  let l = null;
  for (const c of ['home', 'away']) {
    const trouve = (rencontre?.camps?.[c]?.lignes ?? []).find((x) => x.id === joueur);
    if (trouve) {
      camp = c;
      l = trouve;
      break;
    }
  }
  const joue = l && nombre(l.minutes) !== null && nombre(l.minutes) > 0;
  if (!joue) {
    if (compoLue instanceof Set && !compoLue.has(joueur)) return resultat('non-reglable', null, 'joueur absent de la composition lue avant le match');
    return resultat('rembourse', null, 'le joueur n’a pas joué');
  }
  const releves = relevesDeLaRencontre(rencontre)[camp];
  const ev = (rencontre.evenements ?? []).filter(dansLes90);
  if (marche === 'marque') {
    const buts = ev.filter((e) => e?.type === 'goal' && !e.ownGoal && e.side === camp && e.playerId === joueur).length;
    if (buts >= N) return resultat('gagne', buts, 'buts à son identifiant');
    if (!releves.releves.buteurs) return resultat('en-attente', buts, `buteurs non relevés (déroulé ${ev.filter((e) => e?.type === 'goal' && e.side === camp).length}, score ${rencontre.camps[camp].buts90 ?? '?'})`);
    if (rencontre.douteuse) return resultat('en-attente', buts, 'feuille douteuse (buteurs et score)');
    return resultat('perdu', buts, 'buteurs relevés');
  }
  if (marche === 'averti') {
    const cartons = ev.filter((e) => e?.type === 'card' && e.side === camp && e.playerId === joueur && CARTONS.has(String(e.card ?? 'yellow').toLowerCase()) && !horsTerrain(e)).length;
    if (cartons >= N) return resultat('gagne', cartons, 'carton reçu sur le terrain');
    if (!rencontre.cartonsReleves) return resultat('en-attente', cartons, 'cartons non relevés');
    return resultat('perdu', cartons, 'cartons relevés');
  }
  if (rencontre.prolongation) return resultat('en-attente', null, 'match prolongé : la statistique couvre 120 minutes');
  if (marche === 'cadres') {
    if (!releves.releves.cadres) return resultat('en-attente', null, 'tirs cadrés non relevés');
    const x = nombre(l.shotsOnTarget) ?? 0;
    return resultat(x >= N ? 'gagne' : 'perdu', x, 'tirs cadrés relevés');
  }
  // passeur
  if (!releves.releves.passes) return resultat('en-attente', null, 'passes non relevées');
  const x = nombre(l.assists) ?? 0;
  return resultat(x >= N ? 'gagne' : 'perdu', x, 'passes relevées');
}
