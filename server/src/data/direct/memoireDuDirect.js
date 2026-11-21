/**
 * memoireDuDirect.js — LA MÉMOIRE D'UN MATCH SUIVI PAR LA BOUCLE DU DIRECT (étape 46 du plan, lot 1, partie A ; conception
 * § 3.1, critique R2 point 2, R4, R5).
 * -----------------------------------------------------------------------
 * PUR : ni base, ni fichier, ni horloge (`maintenant`, en millisecondes, est toujours passé), ni réseau. `suivre` rend un
 * objet NEUF, sérialisable (des nombres, des textes, null) ; l'ancien n'est jamais modifié.
 *
 *   suivre(memoire, { liste, detail, maintenant, listeReelle = true })
 *     - `liste` : la ligne de la liste FotMob du tour ; `listeReelle: false` = une COPIE servie par le partage de la liste
 *       (R4 : la boucle ne reçoit une liste fraîche qu'un tour sur deux) — une copie n'est JAMAIS une observation : elle ne
 *       change ni le score, ni `depuisA`, ni l'heure du relevé (`listeLueA`), ni `reglementaire`, ni les drapeaux ;
 *     - `detail` : le détail lu au même tour (après la liste) — une vraie lecture.
 *
 * LE SCORE (R4 point 2, § 3.1) : une HAUSSE (aucun des deux compteurs ne baisse) est crue tout de suite, de la liste comme
 * du détail ; une BAISSE lue par une VRAIE liste est annoncée tout de suite (`baisseA`) — la liste est lue en tête de
 * tour, donc après le détail qui a pu donner le score courant ; une baisse lue au DÉTAIL prime (R4 point 4 : un 0-0 lu au
 * détail après un but annulé), mais reste « à confirmer » (`aConfirmer`) jusqu'à la première vraie liste qui la redit —
 * `baisseA` est posé alors. `depuisA` : le tour où CE score a été vu pour la première fois ; `precedent` null = match
 * pris en route (« score vu pour la première fois à », R2 point 3).
 * LES ROUGES (§ 2.7, R2 point 2) : `rougesListe` et `rougesDetail`, la dernière valeur NON nulle de chaque source, avec
 * `vuA` (dernière lecture) et `depuisA` (première lecture de CE compte). Jamais un maximum : le dernier compte fait foi.
 * LES DRAPEAUX COLLANTS (R5 point 3) : `pauseVueA`, `prolongationVueA` (prouvée par la durée max > 90 ou un libellé de
 * prolongation, jamais par une minute > 90 seule), `prolongationJoueeA` (une minute de prolongation, « PET », « AET »),
 * `tirsAuButVusA`.
 * LE SCORE DE LA 90e (R5 points 1 et 2) : `reglementaire` n'est mis à jour que par une vraie lecture, en phase SÛRE
 * (`jeu`, mi-temps avant toute prolongation) ou par un relevé d'APRÈS la fin (libellé de fin, coupure d'avant la
 * prolongation, tirs au but sans prolongation, match terminé) pris à moins de 3 minutes d'un relevé en jeu — ou d'un relevé
 * d'après la fin lui-même retenu (la coupure dure plusieurs relevés) : il porte alors `sur: true`. Un relevé d'après la fin
 * isolé (trou de relevés) n'est pas retenu : « dernier score vu » reste celui du jeu. Figé dès que la prolongation SE JOUE.
 * LE LIBELLÉ (minute figée, § 2.8) : le libellé nettoyé de la liste et l'heure de son dernier changement.
 * -----------------------------------------------------------------------
 */

import { lireLibelle, nettoyerLibelle } from './libelleDuDirect.js';
import { phaseDuReleve, prouveLaProlongation } from './etatDuDirect.js';
import { SCORE90_ECART_MAX_MS } from './reglagesDirect.js';

/** La version de la forme de la mémoire : une mémoire d'une autre version est oubliée (recommencée). */
export const VERSION_MEMOIRE = 1;

const entier = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Math.trunc(Number(v)));
const estEntier = (v) => Number.isInteger(v);
const APRES_PROLONGATION = /^(PET|AET)$/i;

/** Une mémoire vide (le premier tour où le match est vu). */
export function memoireVide(maintenant) {
  return {
    v: VERSION_MEMOIRE,
    premiereVueA: maintenant,
    listeLueA: null,
    lecturesListe: 0,
    lecturesDetail: 0,
    copies: 0,
    derniereCopieA: null,
    score: null,
    libelle: null,
    pauseVueA: null,
    prolongationVueA: null,
    prolongationJoueeA: null,
    tirsAuButVusA: null,
    finiA: null,
    reglementaire: null,
    rougesListe: null,
    rougesDetail: null,
    detail: null
  };
}

/** Le score observé : la hausse crue, la baisse annoncée (liste) ou à confirmer (détail). */
function observerScore(m, h, a, t, source) {
  const s = m.score;
  if (!s) {
    m.score = { h, a, depuisA: t, precedent: null, baisseA: null, source, vuA: t, aConfirmer: false };
    return;
  }
  if (h === s.h && a === s.a) {
    s.vuA = t;
    if (s.aConfirmer && source === 'liste') {
      s.aConfirmer = false;
      s.baisseA = t;
    }
    return;
  }
  const hausse = h >= s.h && a >= s.a;
  const base = { h, a, depuisA: t, precedent: { h: s.h, a: s.a }, source, vuA: t };
  if (hausse) m.score = { ...base, baisseA: null, aConfirmer: false };
  else if (source === 'liste') m.score = { ...base, baisseA: t, aConfirmer: false };
  else m.score = { ...base, baisseA: null, aConfirmer: true };
}

/**
 * Les rouges d'une source ; `depuisA` ne bouge que si le compte change. Correctif K1 (13/11, constat 1 du calcul) : la liste
 * FotMob n'écrit que le camp sanctionné — un seul compteur connu → l'autre vaut 0 ; aucun des deux → le dernier compte de la
 * LISTE est oublié (celui du détail reste). Avant : les deux compteurs étaient exigés, et le rouge lu par la liste était jeté.
 */
function observerRouges(m, cle, home, away, t) {
  if (!estEntier(home) && !estEntier(away)) {
    // La liste ne dit plus rien (elle n'écrit que le camp sanctionné) : son dernier compte ne vaut plus ; le détail reste.
    if (cle === 'rougesListe') m[cle] = null;
    return;
  }
  const h = estEntier(home) ? home : 0;
  const a = estEntier(away) ? away : 0;
  const prec = m[cle];
  m[cle] = prec && prec.home === h && prec.away === a ? { ...prec, vuA: t } : { home: h, away: a, vuA: t, depuisA: t };
}

/** Une VRAIE lecture (liste ou détail) : drapeaux, libellé, rouges, score, puis le score de la 90e. */
function observer(m, R, t, source) {
  const texte = nettoyerLibelle(R.liveLabel);
  const lu = lireLibelle(texte);
  const dureeMax = entier(R.liveMaxTime);

  // Les drapeaux collants (R5 point 3).
  if (!m.prolongationVueA && prouveLaProlongation(R)) m.prolongationVueA = t;
  if (!m.pauseVueA && !m.prolongationVueA && (lu.type === 'mi-temps' || R.halfTime === true)) m.pauseVueA = t;
  if (!m.tirsAuButVusA && lu.type === 'tirs-au-but') m.tirsAuButVusA = t;
  if (!m.prolongationJoueeA) {
    const minuteEnProlongation =
      (lu.type === 'minute' || (lu.type === 'absent' && entier(R.liveMinute) !== null)) && ((dureeMax !== null && dureeMax > 90) || Boolean(m.prolongationVueA));
    const pauseDeProlongation = lu.type === 'mi-temps' && Boolean(m.prolongationVueA);
    if (minuteEnProlongation || pauseDeProlongation || APRES_PROLONGATION.test(texte)) m.prolongationJoueeA = t;
  }
  if (R.finished === true && !m.finiA) m.finiA = t;

  // Le libellé (la minute figée) : celui de la liste seulement.
  if (source === 'liste' && (!m.libelle || m.libelle.texte !== texte)) m.libelle = { texte, depuisA: t };

  // Les rouges et le score.
  observerRouges(m, source === 'liste' ? 'rougesListe' : 'rougesDetail', entier(R.homeRedCards), entier(R.awayRedCards), t);
  const h = entier(R.homeGoals);
  const a = entier(R.awayGoals);
  if (estEntier(h) && estEntier(a) && h >= 0 && a >= 0) observerScore(m, h, a, t, source);
  if (source === 'detail') m.detail = { at: t, libelle: texte || null, h: estEntier(h) ? h : null, a: estEntier(a) ? a : null };

  // Le score de la 90e (R5 points 1 et 2).
  if (m.prolongationJoueeA || !m.score) return;
  const ph = phaseDuReleve({ liste: R, drapeaux: m });
  const enJeu = ph.phase === 'jeu' || (ph.phase === 'mi-temps' && !m.prolongationVueA);
  const coupure = ph.phase === 'prolongation' && lu.type === 'prolongation' && !APRES_PROLONGATION.test(texte);
  const apresLaFin = coupure || ph.phase === 'tirs-au-but' || ph.phase === 'fin-90' || ph.phase === 'termine';
  const entree = { h: m.score.h, a: m.score.a, vuA: t, libelle: texte || null, phase: ph.phase };
  if (enJeu) {
    m.reglementaire = { ...entree, apresLaFin: false, sur: false };
    return;
  }
  if (!apresLaFin) return;
  const prec = m.reglementaire;
  const sur = Boolean(prec) && t - prec.vuA <= SCORE90_ECART_MAX_MS && (prec.apresLaFin || prec.phase === 'jeu');
  if (sur) m.reglementaire = { ...entree, apresLaFin: true, sur: true };
}

/**
 * SUIVRE un match d'un tour à l'autre (voir l'en-tête). Rend une mémoire NEUVE. Lève si `maintenant` n'est pas un nombre
 * fini (la boucle appelle `suivre` dans un try/catch : une faute ici n'arrête jamais E).
 */
export function suivre(memoire, { liste = null, detail = null, maintenant, listeReelle = true } = {}) {
  if (!Number.isFinite(maintenant)) throw new TypeError('suivre : `maintenant` (millisecondes) est obligatoire.');
  const m = memoire && memoire.v === VERSION_MEMOIRE ? JSON.parse(JSON.stringify(memoire)) : memoireVide(maintenant);
  if (liste) {
    if (listeReelle === false) {
      m.copies += 1;
      m.derniereCopieA = maintenant;
    } else {
      m.listeLueA = maintenant;
      m.lecturesListe += 1;
      observer(m, liste, maintenant, 'liste');
    }
  }
  if (detail) {
    m.lecturesDetail += 1;
    observer(m, detail, maintenant, 'detail');
  }
  return m;
}
