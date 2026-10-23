/**
 * ficheJoueur.js — les règles d'affichage de la FICHE PAR POSTE d'un joueur (étape 31 du plan, 22/10/2026 ; ce que
 * l'étape 30 calcule chaque nuit : playerRatings.js, GET /api/match-stats/player-ratings?player=…). JavaScript pur,
 * sans Vue ni navigateur : les tests du serveur le rejouent (server/test/fichesEcran.test.mjs) sur les vraies
 * réponses de la route.
 *
 * Rien n'est calculé ici : le serveur a ramené chaque composante à 90 minutes, l'a corrigée des adversaires et du
 * niveau du championnat, puis rapprochée de la moyenne de son poste quand le joueur a peu joué. La route rend des
 * entiers (par 90 minutes × 1000, poids de l'histoire × 100) : l'écran les remet en nombres et les met en mots.
 *
 * AFFICHAGE SEULEMENT (règle de Pierre) : ni le moteur ni l'analyse IA ne lisent ces fiches, et aucune note de
 * joueur n'est jamais posée sur le terrain des compositions — les notes de match et de saison y restent seules.
 *
 * Les couleurs : jamais le vert (réservé à la value et au « validé »), jamais le rouge. Un joueur bien classé est
 * BLEU (information), un joueur mal classé AMBRE ; la courbe de forme est une tendance, du bleu et de la couleur
 * de la section.
 */

import { duChampionnat } from './indiceDeForce.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const fr = (x, d = 0) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const MOINS = '−';
const signe = (x, d = 2) => {
  const r = Math.round(x * 10 ** d) / 10 ** d;
  return `${r < 0 ? MOINS : '+'}${fr(Math.abs(r), d)}`;
};

/** Les postes de la fiche (1 gardien … 4 attaquant ; le libéro, jamais vu au magasin, compte défenseur). */
export const POSTES = Object.freeze({
  1: Object.freeze({ nom: 'Gardien', pluriel: 'gardiens' }),
  2: Object.freeze({ nom: 'Défenseur', pluriel: 'défenseurs' }),
  3: Object.freeze({ nom: 'Milieu', pluriel: 'milieux' }),
  4: Object.freeze({ nom: 'Attaquant', pluriel: 'attaquants' })
});
export const posteDit = (poste) => POSTES[poste]?.nom ?? 'poste inconnu';

/**
 * Les composantes de la fiche, dans l'ordre du serveur (COMPOSANTES de playerRatings.js ; un test compare les
 * identifiants). `champ` : la colonne de la route ; `poids` : la colonne qui dit combien de matchs de 90 minutes
 * (× 100) la composante a pour histoire ; `chiffres` : décimales ; `unite` : ce que le nombre veut dire.
 */
export const COMPOSANTES = Object.freeze(
  [
    ['xgnp', 'xG hors penalty', 'xgnp', 'w_xg', 2, 'par 90 min'],
    ['xa', 'xA (passes décisives attendues)', 'xa', 'w_xg', 2, 'par 90 min'],
    ['xgot', 'xG des tirs cadrés', 'xgot', 'w_xg', 2, 'par 90 min'],
    ['tirs', 'Tirs', 'tirs', 'w_tirs', 2, 'par 90 min'],
    ['pc', 'Passes clés', 'pc', 'w_tirs', 2, 'par 90 min'],
    ['recup', 'Récupérations', 'recup', 'w_def', 2, 'par 90 min, rapportées à la possession adverse'],
    ['duels', 'Duels gagnés', 'duels', 'w_def', 2, 'par 90 min, rapportés à la possession adverse'],
    ['xga', 'xG concédés sur le terrain', 'xga', 'w_xga', 2, 'par 90 min, penalties retirés'],
    ['note', 'Note FotMob', 'note', 'w_note', 1, 'par apparition'],
    ['buts_evites', 'Buts évités (gardiens)', 'buts_evites', 'w_gardien', 2, 'par 90 min']
  ].map(([id, libelle, champ, poids, chiffres, unite]) => Object.freeze({ id, libelle, champ, poids, chiffres, unite }))
);

/** Ce qui se lit chez un gardien (les autres composantes sont des zéros de joueur de champ). */
export const PERTINENTES_DU_GARDIEN = Object.freeze(['buts_evites', 'xga', 'note', 'recup', 'duels']);

/** Ce qui compte à chaque poste, dans l'ordre : ces composantes passent en tête, les autres suivent. */
export const CLES_DU_POSTE = Object.freeze({
  4: Object.freeze(['xgnp', 'tirs', 'xgot', 'xa', 'note']),
  3: Object.freeze(['xa', 'pc', 'recup', 'xgnp', 'note']),
  2: Object.freeze(['xga', 'duels', 'recup', 'note']),
  1: Object.freeze(['buts_evites', 'xga', 'note'])
});

// ------------------------------------------------------------ l'état

const SERVEUR_PAS_A_JOUR = /^Le serveur n.est pas à jour/;
const SANS_FICHE = /^Aucune fiche pour le joueur/;

/**
 * L'état du bloc — il reste TOUJOURS affiché :
 *   chargement · erreur · pas-a-jour-serveur · jamais (les fiches n'ont jamais été calculées) · sans-fiche (le joueur
 *   n'a pas de fiche : aucun match joué relevé avec un identifiant FotMob) · pret (`peuJoue` : sous 270 minutes, la
 *   fiche est rapprochée de la moyenne du poste et n'a pas de place) ; `aRefaire` : un calcul d'une autre forme.
 */
export function etatDeLaFiche({ chargement = false, erreur = null, reponse = null } = {}) {
  if (chargement && !reponse) return { cle: 'chargement', ton: '', titre: 'Lecture en cours', texte: 'Lecture de la fiche du joueur…' };
  if (erreur) {
    if (SANS_FICHE.test(erreur)) {
      return {
        cle: 'sans-fiche',
        ton: 'is-info',
        titre: 'Pas de fiche pour ce joueur',
        texte: 'Les fiches n’existent que pour les joueurs qui ont joué au moins un match relevé avec un identifiant FotMob. Les tableaux ci-dessous restent affichés, sans valeurs.'
      };
    }
    return SERVEUR_PAS_A_JOUR.test(erreur)
      ? { cle: 'pas-a-jour-serveur', ton: 'is-warning', titre: 'Serveur à relancer', texte: `${erreur} Les tableaux ci-dessous restent affichés, sans valeurs.` }
      : { cle: 'erreur', ton: 'is-danger', titre: 'Fiche illisible', texte: `${erreur} Les tableaux ci-dessous restent affichés, sans valeurs.` };
  }
  if (!reponse) return { cle: 'chargement', ton: '', titre: 'Lecture en cours', texte: 'Lecture de la fiche du joueur…' };
  if (reponse.etat === 'jamais' || !reponse.lecture) {
    return { cle: 'jamais', ton: 'is-info', titre: 'Pas encore calculé', texte: 'Les fiches des joueurs n’ont pas encore été calculées : la prochaine passe de nuit de l’actualisation le fera (une minute environ). Les tableaux ci-dessous restent affichés, sans valeurs.' };
  }
  const f = reponse.lecture.fiche;
  if (!f) return { cle: 'sans-fiche', ton: 'is-info', titre: 'Pas de fiche pour ce joueur', texte: 'Ce joueur n’a pas de fiche. Les tableaux ci-dessous restent affichés, sans valeurs.' };
  return { cle: 'pret', ton: '', titre: null, texte: null, peuJoue: f.etablie !== 1, aRefaire: reponse.etat === 'pas-a-jour' };
}

// ------------------------------------------------------------ les chiffres

/** Une composante de la fiche : sa valeur remise en nombre, son texte, la mémoire derrière (matchs de 90 minutes). */
function composanteDe(def, fiche) {
  const brut = fiche?.[def.champ];
  const valeur = fini(brut) ? brut / 1000 : null;
  const poids = fiche && fini(fiche[def.poids]) ? fiche[def.poids] / 100 : null;
  return {
    id: def.id,
    libelle: def.libelle,
    unite: def.unite,
    valeur,
    valeurTexte: valeur === null ? 'non relevée' : fr(valeur, def.chiffres),
    memoire: valeur === null ? null : poids === null ? null : `mémoire : ${fr(poids, poids < 10 ? 1 : 0)} match${poids >= 2 ? 's' : ''} de 90 min`
  };
}

/**
 * Les composantes montrées, celles du poste d'abord (`cle: true`), les autres ensuite ; seules celles que la fiche
 * a (une composante absente — les buts évités d'un joueur de champ — n'est pas une tuile vide).
 */
export function composantesDuPoste(fiche) {
  const cles = CLES_DU_POSTE[fiche?.poste] ?? [];
  // Un gardien ne tire ni ne passe : ses zéros de joueur de champ ne sont pas des tuiles.
  const lues = (fiche?.poste === 1 ? COMPOSANTES.filter((def) => PERTINENTES_DU_GARDIEN.includes(def.id)) : COMPOSANTES);
  const toutes = lues.map((def) => composanteDe(def, fiche)).filter((c) => c.valeur !== null);
  const premieres = cles.map((id) => toutes.find((c) => c.id === id)).filter(Boolean);
  const reste = toutes.filter((c) => !cles.includes(c.id));
  return [...premieres.map((c) => ({ ...c, cle: true })), ...reste.map((c) => ({ ...c, cle: false }))];
}

/**
 * Les composantes SANS fiche (pas encore calculée, joueur sans fiche, serveur muet) : toutes, avec le mot qui dit
 * pourquoi — les tuiles restent là.
 */
export function composantesVides(texte = 'pas encore calculée') {
  return COMPOSANTES.map((def) => ({ id: def.id, libelle: def.libelle, unite: def.unite, valeur: null, valeurTexte: texte, memoire: null, cle: false }));
}

/** La place d'un apport parmi les joueurs de même poste du championnat, en mots (« devant 99 % des milieux du championnat (EPL) »). */
export function placeDite(percentile, poste, championnat) {
  if (!fini(percentile)) return null;
  const qui = POSTES[poste]?.pluriel ?? 'joueurs';
  // Le championnat par le nom que l'appli lui donne (« EPL », « Bundesliga » pour « Bundesliga - Germany »), comme l'indice de force.
  return `devant ${fr(percentile)} % des ${qui} ${championnat ? duChampionnat(championnat) : 'du championnat'}`;
}

/** Les deux apports (buts par 90 minutes au-dessus de la moyenne du poste) et leur place. */
export function apportsDuJoueur(fiche) {
  const off = fini(fiche?.apport_off) ? fiche.apport_off / 1000 : null;
  const def = fini(fiche?.apport_def) ? fiche.apport_def / 1000 : null;
  const gardien = fiche?.poste === 1;
  return {
    offensif: {
      libelle: 'Apport offensif',
      valeur: off,
      valeurTexte: off === null || gardien ? (gardien ? 'sans objet' : 'non calculé') : `${signe(off)} but${Math.abs(off) >= 2 ? 's' : ''}`,
      detail: gardien ? 'un gardien n’a pas d’apport offensif' : 'buts par 90 minutes (xG hors penalty + xA) au-dessus de la moyenne de son poste',
      place: gardien ? null : placeDite(fiche?.pct_off, fiche?.poste, fiche?.league),
      percentile: gardien ? null : fiche?.pct_off ?? null
    },
    defensif: {
      libelle: 'Apport défensif',
      valeur: def,
      valeurTexte: def === null ? 'non calculé' : `${signe(def)} but${Math.abs(def) >= 2 ? 's' : ''}`,
      detail: 'xG concédés par 90 minutes pendant qu’il est sur le terrain, comparés à la moyenne de son poste : plus c’est haut, moins son équipe concède avec lui',
      place: placeDite(fiche?.pct_def, fiche?.poste, fiche?.league),
      percentile: fiche?.pct_def ?? null
    }
  };
}

/** Un apport seul, signé, le vrai signe moins : « +0,28 », « −0,07 » (les repères de la courbe). */
export const apportSigne = (x) => (fini(x) ? signe(x) : 'pas calculé');

export const tonDeLaPlace = (percentile) => (!fini(percentile) ? '' : percentile >= 75 ? 'is-fort' : percentile <= 25 ? 'is-faible' : '');

/** Les chiffres clés d'identité de la fiche : poste, minutes, apparitions, fiche établie ou non, dernier match. */
export function identiteDeLaFiche(fiche) {
  if (!fiche) return null;
  const jour = (iso) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null);
  return {
    poste: posteDit(fiche.poste),
    partDuPoste: fini(fiche.part_poste) ? `${fr(fiche.part_poste)} % de ses minutes à ce poste` : null,
    minutes: fr(fiche.minutes ?? 0),
    apparitions: fr(fiche.apparitions ?? 0),
    etablie: fiche.etablie === 1,
    formule: fiche.formule === 'xg' ? 'avec les xG' : 'sans xG : repli sur les tirs et les passes clés (FotMob n’en publie pas pour ses matchs récents)',
    dernierMatch: jour(fiche.dernier_match),
    valableDepuis: jour(fiche.jour),
    facteur: fini(fiche.facteur) ? fiche.facteur / 1000 : null
  };
}

// ------------------------------------------------------------ la courbe de forme

/**
 * La courbe de forme : les vingt dernières apparitions (la route : [jour, apport offensif × 1000, apport défensif ×
 * 1000], la plus ancienne d'abord). Rend les points, l'échelle commune des deux traits et leurs chemins. Un gardien
 * n'a que l'apport défensif. Il faut deux points au moins.
 */
export function courbeDeForme(courbe, { largeur = 600, hauteur = 120, gardien = false } = {}) {
  const points = (courbe ?? []).filter((p) => Array.isArray(p) && typeof p[0] === 'string' && fini(p[1]) && fini(p[2])).map(([jour, off, def]) => ({ jour, off: off / 1000, def: def / 1000 }));
  if (points.length < 2) return { vide: true, points, offensif: '', defensif: '', min: null, max: null, zeroY: null, premiere: points[0]?.jour ?? null, derniere: points.at(-1)?.jour ?? null };
  const valeurs = points.flatMap((p) => (gardien ? [p.def] : [p.off, p.def]));
  const min = Math.min(...valeurs, 0);
  const max = Math.max(...valeurs, 0);
  const marge = 12;
  const etendue = max - min || 1;
  const yDe = (v) => marge + ((max - v) / etendue) * (hauteur - 2 * marge);
  const placees = points.map((p, i) => ({ ...p, x: (largeur * i) / (points.length - 1), yOff: yDe(p.off), yDef: yDe(p.def) }));
  const chemin = (cle) => placees.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p[cle].toFixed(1)}`).join(' ');
  return { vide: false, points: placees, offensif: gardien ? '' : chemin('yOff'), defensif: chemin('yDef'), min, max, zeroY: yDe(0), premiere: points[0].jour, derniere: points.at(-1).jour };
}

const jourCourt = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

/**
 * Les lignes du tableau de la courbe, la plus récente d'abord. `matchs` (facultatif) : les matchs de la page du
 * joueur — un match joué le même jour donne l'adversaire (nom, identifiant FotMob, championnat) pour son logo.
 */
export function lignesDeLaCourbe(courbe, { matchs = [], gardien = false } = {}) {
  const parJour = new Map((matchs ?? []).filter((m) => m?.date).map((m) => [m.date, m]));
  const lignes = (courbe ?? [])
    .filter((p) => Array.isArray(p) && typeof p[0] === 'string' && fini(p[1]) && fini(p[2]))
    .map(([jour, off, def]) => {
      const m = parJour.get(jour) ?? null;
      return {
        jour,
        jourTexte: jourCourt(jour),
        adversaire: m ? { nom: m.opponent ?? null, id: (m.home ? m.awayId : m.homeId) ?? null, championnat: m.league ?? null, domicile: Boolean(m.home), cle: m.matchKey ?? null } : null,
        off: off / 1000,
        def: def / 1000,
        offTexte: gardien ? 'sans objet' : signe(off / 1000),
        defTexte: signe(def / 1000)
      };
    });
  return lignes.reverse();
}

/**
 * Le pied du tableau : Σ = le nombre d'apparitions et la fourchette de chaque apport (jamais une somme d'apports :
 * des buts par 90 minutes au-dessus d'une moyenne ne s'additionnent pas) ; ⌀ = la moyenne de chaque apport.
 */
export function piedDeLaCourbe(lignes, { gardien = false } = {}) {
  const n = lignes.length;
  const de = (cle) => lignes.map((l) => l[cle]);
  const fourchette = (xs) => (xs.length ? `de ${signe(Math.min(...xs))} à ${signe(Math.max(...xs))}` : 'aucune apparition');
  const moyenne = (xs) => (xs.length ? signe(xs.reduce((t, x) => t + x, 0) / xs.length) : 'aucune apparition');
  return {
    n,
    sigma: { texte: `${fr(n)} apparition${n > 1 ? 's' : ''}`, offensif: gardien ? 'sans objet' : fourchette(de('off')), defensif: fourchette(de('def')) },
    moyenne: { offensif: gardien ? 'sans objet' : moyenne(de('off')), defensif: moyenne(de('def')) }
  };
}

/** La phrase de la forme : le dernier apport face à la moyenne des vingt dernières apparitions. */
export function formeDite(courbe, { gardien = false } = {}) {
  const lignes = lignesDeLaCourbe(courbe, { gardien });
  if (lignes.length < 2) return 'Pas assez d’apparitions pour parler d’une forme : il en faut deux au moins.';
  const cle = gardien ? 'def' : 'off';
  const dernier = lignes[0][cle];
  const moyenne = lignes.reduce((t, l) => t + l[cle], 0) / lignes.length;
  const ecart = dernier - moyenne;
  const sens = Math.abs(ecart) < 0.02 ? 'dans sa moyenne' : ecart > 0 ? 'au-dessus de sa moyenne' : 'en dessous de sa moyenne';
  return `Son dernier apport ${gardien ? 'défensif' : 'offensif'} (${signe(dernier)}) est ${sens} des ${fr(lignes.length)} dernières apparitions (${signe(moyenne)}).`;
}

// ------------------------------------------------------------ la provenance

export function provenanceDeLaFiche(reponse) {
  const jusqua = reponse?.jusqua ?? null;
  return {
    source: 'FotMob (magasin) · fiches des joueurs',
    releveLe: reponse?.calculeLe ?? null,
    action: 'calculé',
    fichier: reponse?.base ?? null,
    detail: `${jusqua ? `Tient compte des matchs jusqu’au ${jusqua.slice(8, 10)}/${jusqua.slice(5, 7)}/${jusqua.slice(0, 4)}. ` : ''}Calculé chaque nuit par l’actualisation, à partir de la table du jour J (ce qu’on savait la veille de chaque match).`
  };
}
