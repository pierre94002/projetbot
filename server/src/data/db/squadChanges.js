/**
 * squadChanges.js — LES ARRIVÉES, LES DÉPARTS, LA CONTINUITÉ ET LA FORCE DE L'EFFECTIF d'un club (étape 35 du plan, lot 1a,
 * 09/11/2026 ; le nom de la fiche du plan).
 * -----------------------------------------------------------------------
 * Pur : ni base, ni fichier, ni horloge, ni hasard ; aucun import. Tout se fait par IDENTIFIANT de joueur FotMob (un
 * numéro ≥ 1 : l'identifiant 0 et les lignes sans identifiant n'entrent JAMAIS ; leur part des minutes est rendue), jamais
 * par un nom. Les minutes sont celles des feuilles des matchs DÉJÀ JOUÉS (date < J), toutes compétitions.
 *   - « qui compte » (Pierre, 02/11, n° 6) : au moins 30 % des minutes qu'il pouvait jouer, 90 × les matchs du club ;
 *   - « parti » seulement s'il a été VU jouer pour un autre club depuis le premier jour de la saison du club ; sinon
 *     « pas revu » (blessé, prêté hors des championnats suivis, écarté…) — JAMAIS « parti » sans preuve ;
 *   - un « pas revu » et un « arrivé » de même date de naissance et de même poste : une MENTION (peut-être le même joueur
 *     sous deux identifiants), jamais une fusion, jamais dans un chiffre ;
 *   - la continuité : la part des minutes de la saison jouées par des joueurs qui avaient joué pour le club la saison d'avant ;
 *   - la force de l'effectif (à blanc) : la somme des apports des joueurs (fiches de l'étape 30) pondérés par leurs minutes,
 *     cette saison face à la saison d'avant, avec les MÊMES fiches ; un joueur sans fiche vaut 0 (compté).
 * -----------------------------------------------------------------------
 */

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
/** Un identifiant de joueur valable : un numéro FotMob entier ≥ 1 (jamais 0, jamais un nom). */
export const joueurValide = (j) => Number.isSafeInteger(j) && j > 0;

/** Les minutes d'une liste, rangées par joueur valable ; rend aussi celles écartées (identifiant 0 ou mal formé). */
export function minutesParJoueur(lignes) {
  const parJoueur = new Map();
  let ecartees = 0;
  let total = 0;
  for (const l of lignes ?? []) {
    const m = Number(l?.minutes);
    if (!(m > 0)) continue;
    total += m;
    if (!joueurValide(l.joueur)) {
      ecartees += m;
      continue;
    }
    parJoueur.set(l.joueur, (parJoueur.get(l.joueur) ?? 0) + m);
  }
  return { parJoueur, ecartees, total };
}

/**
 * CEUX QUI COMPTAIENT la saison d'avant (la référence) : les joueurs dont les minutes pour le club font au moins `seuil` des
 * minutes possibles (90 × `matchsAvant`, les matchs du club avec une feuille). `minutesAvant` : Map joueur → minutes.
 */
export function referenceDeLaSaison(minutesAvant, matchsAvant, seuil = 0.3) {
  const possible = 90 * (matchsAvant ?? 0);
  const ref = new Map();
  if (!(possible > 0)) return ref;
  for (const [j, m] of minutesAvant ?? []) if (joueurValide(j) && m >= seuil * possible) ref.set(j, m);
  return ref;
}

/**
 * LES MOUVEMENTS DE L'EFFECTIF d'un club dans sa saison, au jour J. `reference` (referenceDeLaSaison), `saison` : Map joueur →
 * minutes pour le club dans la saison avant J ; `avantClub` : Map joueur → minutes pour le club la saison d'avant (toutes,
 * la référence comprise : un joueur qui y a joué n'est jamais un « arrivé ») ; `ailleurs` : Map joueur → { club, date } (le premier match pour un AUTRE club
 * du magasin depuis le premier jour de la saison du club) ; `matchsSaison` : les matchs du club avec une feuille dans la
 * saison avant J ; `avantAilleurs` : Map joueur → club (où il a joué la saison d'avant, pour un autre club) ; `naissances` :
 * Map joueur → date de naissance ; `postes` : Map joueur → poste dominant ; `seuil`, `minMatchsArrivee`. Rend { restes,
 * partisVusAilleurs, pasRevus, arrives, doublesPossibles } (listes triées par identifiant).
 */
export function mouvementsDeLEffectif({ reference, saison, avantClub = new Map(), ailleurs = new Map(), matchsSaison = 0, avantAilleurs = new Map(), naissances = new Map(), postes = new Map(), indisponibles = new Map(), seuil = 0.3, minMatchsArrivee = 2 }) {
  const restes = [];
  const partisVusAilleurs = [];
  const pasRevus = [];
  const arrives = [];
  const possible = 90 * matchsSaison;
  for (const [j, minutesAvant] of [...(reference ?? [])].sort((a, b) => a[0] - b[0])) {
    const m = saison?.get(j) ?? 0;
    if (m > 0) restes.push({ joueur: j, minutesAvant, minutes: m });
    else if (ailleurs.has(j)) partisVusAilleurs.push({ joueur: j, minutesAvant, club: ailleurs.get(j).club, date: ailleurs.get(j).date });
    else pasRevus.push({ joueur: j, minutesAvant, raison: indisponibles.get(j) ?? null });
  }
  for (const [j, m] of [...(saison ?? [])].sort((a, b) => a[0] - b[0])) {
    if (!joueurValide(j) || reference?.has(j) || avantClub.has(j)) continue;
    // d'où : « vu la saison passée à {club} » (un autre club du magasin), sinon « nouveau au magasin » (dOu null)
    arrives.push({
      joueur: j,
      minutes: m,
      part: possible > 0 ? m / possible : null,
      quiCompte: possible > 0 && matchsSaison >= minMatchsArrivee && m >= seuil * possible,
      dOu: avantAilleurs.has(j) ? { club: avantAilleurs.get(j) } : null
    });
  }
  const doublesPossibles = [];
  for (const p of pasRevus) {
    const n = naissances.get(p.joueur);
    if (!n) continue;
    for (const a of arrives) {
      if (naissances.get(a.joueur) === n && (postes.get(a.joueur) ?? null) === (postes.get(p.joueur) ?? null)) doublesPossibles.push({ pasRevu: p.joueur, arrive: a.joueur, naissance: n, poste: postes.get(p.joueur) ?? null });
    }
  }
  return { restes, partisVusAilleurs, pasRevus, arrives, doublesPossibles };
}

/**
 * LA CONTINUITÉ d'un club dans sa saison, au jour J : minutes de la saison jouées par des joueurs qui avaient joué au moins
 * une minute pour le club la saison d'avant ÷ toutes les minutes de la saison (joueurs valables). null avant le premier
 * match de la saison ou sans saison d'avant (aucun joueur).
 */
export function continuiteDe(minutesSaison, joueursSaisonAvant) {
  let tout = 0;
  let deja = 0;
  for (const [j, m] of minutesSaison ?? []) {
    if (!joueurValide(j) || !(m > 0)) continue;
    tout += m;
    if (joueursSaisonAvant?.has(j)) deja += m;
  }
  if (!(tout > 0) || !joueursSaisonAvant || joueursSaisonAvant.size === 0) return null;
  return deja / tout;
}

/**
 * LA FORCE DE L'EFFECTIF (conception §2.8) : E = Σ_j (minutes_j / (90 × M)) × apport_j, cette saison (avant J, M ≥ 2 matchs
 * avec feuille) et la saison d'avant entière, avec les MÊMES fiches (`fiches` : Map joueur → { apportOff, apportDef } ; un
 * joueur sans fiche vaut 0 et est compté). Rend { dOff, dDef, eOff, eDef, eOffAvant, eDefAvant, couverture: part des
 * minutes (des deux saisons) portée par une fiche } ou null (moins de `minMatchs` matchs cette saison, ou aucune saison
 * d'avant).
 */
export function forceDeLEffectif({ minutesSaison, matchsSaison, minutesAvant, matchsAvant, fiches, minMatchs = 2 }) {
  if (!(matchsSaison >= minMatchs) || !(matchsAvant >= 1)) return null;
  let couvertes = 0;
  let toutes = 0;
  const somme = (minutes, M) => {
    let off = 0;
    let def = 0;
    for (const [j, m] of minutes ?? []) {
      if (!joueurValide(j) || !(m > 0)) continue;
      toutes += m;
      const f = fiches?.get(j);
      if (!f) continue;
      const po = (m / (90 * M)) * (fini(f.apportOff) ? f.apportOff : 0);
      const pd = (m / (90 * M)) * (fini(f.apportDef) ? f.apportDef : 0);
      off += po;
      def += pd;
      couvertes += m;
    }
    return { off, def };
  };
  const s = somme(minutesSaison, matchsSaison);
  const a = somme(minutesAvant, matchsAvant);
  return { dOff: s.off - a.off, dDef: s.def - a.def, eOff: s.off, eDef: s.def, eOffAvant: a.off, eDefAvant: a.def, couverture: toutes > 0 ? couvertes / toutes : null };
}
