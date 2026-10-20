/**
 * carnetSante.js — les règles d'affichage du carnet de santé des données
 * (étape 12 du plan, 06/10/2026). JavaScript pur, sans Vue ni navigateur : les
 * tests du serveur le rejouent (server/test/carnetSante*.test.mjs).
 *
 * Rien n'est recalculé ici : les pourcentages de chaque ligne viennent du
 * serveur (dataHealth.js). L'écran ne fait que FILTRER les lignes et refaire,
 * pour les lignes affichées, le pied du tableau — Σ des comptes et ⌀ de
 * chaque donnée sur tous les matchs réunis (jamais une somme de pourcentages,
 * jamais la moyenne des pourcentages des lignes), exactement comme le
 * serveur le fait pour tout le carnet (totauxDuCarnet, test à l'appui).
 */

/** Vert à partir de 90 %, orange à partir de 50 %, rouge en dessous ; ceux du serveur s'il les donne. */
export const SEUILS_PAR_DEFAUT = Object.freeze({ bon: 90, partiel: 50 });

/** Les six données, au cas où le serveur (pas encore relancé) ne les donne pas. */
export const DONNEES_PAR_DEFAUT = Object.freeze([
  { cle: 'xg', libelle: 'xG', quoi: 'les buts attendus (xG) des deux équipes' },
  { cle: 'tirs', libelle: 'Tirs', quoi: 'les tirs des deux équipes' },
  { cle: 'corners', libelle: 'Corners', quoi: 'les corners des deux équipes' },
  { cle: 'cartons', libelle: 'Cartons', quoi: 'les cartons jaunes et rouges des deux équipes' },
  { cle: 'joueurs', libelle: 'Joueurs', quoi: 'des lignes joueur pour les deux équipes' },
  { cle: 'compos', libelle: 'Compos', quoi: 'la composition publiée (onze de départ et remplaçants)' }
]);

export const TYPES_PAR_DEFAUT = Object.freeze([
  { cle: 'doublon', libelle: 'Rencontre en double' },
  { cle: 'competition', libelle: 'Mauvaise compétition' },
  { cle: 'manquant', libelle: 'Match manquant' },
  { cle: 'impossible', libelle: 'Chiffre impossible' },
  { cle: 'zero', libelle: 'Zéro « non relevé »' },
  { cle: 'identite', libelle: 'Club ou joueur mal identifié' }
]);

/** L'icône de chaque sorte d'anomalie (noms d'AppIcon). */
export const ICONES_TYPES = Object.freeze({ doublon: 'layers', competition: 'trophy', manquant: 'search', impossible: 'alert', zero: 'minus', identite: 'users' });

/** Le ton d'une gravité (classes .cm-chip). */
export const TONS_GRAVITE = Object.freeze({ erreur: 'is-danger', 'a-verifier': 'is-warning', info: '' });

const arrondi1 = (x) => Math.round(x * 10) / 10;

/** Le ton d'un pourcentage : 'bon', 'partiel', 'faible', ou 'vide' sans match. */
export function tonDe(pourcent, seuils = SEUILS_PAR_DEFAUT) {
  if (pourcent === null || pourcent === undefined || !Number.isFinite(Number(pourcent))) return 'vide';
  const p = Number(pourcent);
  if (p >= (seuils?.bon ?? SEUILS_PAR_DEFAUT.bon)) return 'bon';
  if (p >= (seuils?.partiel ?? SEUILS_PAR_DEFAUT.partiel)) return 'partiel';
  return 'faible';
}

/** « 89,3 % » ; sans match : « aucun match », jamais un tiret muet. */
export function pourcentTexte(pourcent) {
  if (pourcent === null || pourcent === undefined || !Number.isFinite(Number(pourcent))) return 'aucun match';
  return `${Number(pourcent).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

export const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');

/**
 * Σ et ⌀ des lignes affichées : la règle du serveur (totauxDuCarnet). Les
 * comptes s'additionnent ; la part de chaque donnée est celle de tous les
 * matchs réunis ; la moyenne, la part des cases remplies sur les six données.
 */
export function totauxDuCarnet(lignes, donnees = DONNEES_PAR_DEFAUT) {
  const t = { lignes: lignes.length, rencontres: 0, matchs: 0, attribues: 0, horsJeu: 0, sansFeuille: 0, avec: Object.fromEntries(donnees.map((d) => [d.cle, 0])) };
  for (const l of lignes) {
    t.rencontres += l.rencontres ?? 0;
    t.matchs += l.matchs ?? 0;
    t.attribues += l.attribues ?? 0;
    t.horsJeu += l.horsJeu ?? 0;
    t.sansFeuille += l.sansFeuille ?? 0;
    for (const d of donnees) t.avec[d.cle] += l.avec?.[d.cle] ?? 0;
  }
  const total = donnees.reduce((n, d) => n + t.avec[d.cle], 0);
  t.pourcent = Object.fromEntries(donnees.map((d) => [d.cle, t.matchs ? arrondi1((100 * t.avec[d.cle]) / t.matchs) : null]));
  t.moyenne = t.matchs ? arrondi1((100 * total) / (donnees.length * t.matchs)) : null;
  return t;
}

/** Les filtres du carnet : un championnat ('' = tous), et 'toutes' les saisons ou la saison 'en-cours'. */
export function filtrerCarnet(lignes, { ligue = '', saisons = 'toutes' } = {}) {
  return (lignes ?? []).filter((l) => (!ligue || l.league === ligue) && (saisons !== 'en-cours' || l.enCours));
}

/**
 * Ce que la ligne ne peut pas avoir, dit plutôt que laissé à un rouge muet :
 * FotMob ne publie pas les xG d'un championnat suivi en couverture « ratings »
 * ou « lower » (la moitié au moins de ses matchs).
 */
export function noteDeLigne(ligne) {
  const notes = [];
  const c = ligne?.couverture ?? {};
  const total = Object.values(c).reduce((n, x) => n + x, 0);
  const sansXg = (c.ratings ?? 0) + (c.lower ?? 0);
  if (total && sansXg * 2 >= total && (ligne.pourcent?.xg ?? 0) < 50) {
    notes.push(`xG non publiés par FotMob pour ${nombre(sansXg)} des ${nombre(total)} matchs (couverture ${(c.lower ?? 0) >= (c.ratings ?? 0) ? '« lower »' : '« ratings »'})`);
  }
  if (ligne?.sansFeuille) notes.push(`${nombre(ligne.sansFeuille)} sans feuille chez la source`);
  if (ligne?.attribues) notes.push(`${nombre(ligne.attribues)} résultat(s) attribué(s), hors calcul`);
  if (ligne?.partielle) notes.push(`saison partielle : ${ligne.partielle}`);
  if (ligne?.enCours) notes.push('saison en cours');
  return notes;
}

/** Les onglets du filtre des anomalies, avec leurs comptes (le serveur les donne pour tout le carnet). */
export function ongletsAnomalies(types, parType, total) {
  return [
    { cle: '', libelle: 'Toutes', compte: total ?? 0 },
    ...(types ?? TYPES_PAR_DEFAUT).map((t) => ({ cle: t.cle, libelle: t.libelle, compte: parType?.[t.cle]?.total ?? 0, erreurs: parType?.[t.cle]?.erreur ?? 0 }))
  ];
}

/** Ce que dit le dernier contrôle, en une phrase. */
export function phraseDuControle(controle) {
  if (!controle) return 'Pas encore de contrôle.';
  const duree = `${(Number(controle.dureeMs ?? 0) / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`;
  if (controle.mode === 'complet') return `Contrôle complet${controle.raison ? ` (${controle.raison})` : ''} : ${nombre(controle.rencontresControlees)} rencontres relues en ${duree}.`;
  return `Passe de nuit : ${nombre(controle.rencontresControlees)} rencontre(s) nouvelle(s) ou modifiée(s) contrôlée(s), ${nombre(controle.saisonsRecomptees)} saison(s) recomptée(s), en ${duree}.`;
}
