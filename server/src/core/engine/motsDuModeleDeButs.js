/**
 * motsDuModeleDeButs.js — LES MOTS du modèle de buts unique (étape 27 du plan, 21/10/2026).
 * -----------------------------------------------------------------------
 * goalModel.js ne garde que les CODES (les régimes, les sources, les champs d'un réglage) et vient chercher ici tout
 * ce que Pierre lit : le mot court et la phrase de chaque régime (la pastille de provenance, la puce du score, le
 * Repérage, l'origine d'une saisie), le nom des sources du plus/moins 2,5, les messages d'un réglage fautif et ceux
 * d'une erreur du calcul.
 *
 * HORS DE L'EMPREINTE du moteur (engineVersions.js, MODULES_DU_MOTEUR.horsEmpreinte), comme noteDuModeleDeButs.js :
 * corriger une phrase ne crée pas de version et ne recommence pas l'essai de la candidate (son empreinte lit celle du
 * code). Aucun chiffre ne vient d'ici. Pur : ne lit rien, ne calcule rien.
 *
 * Le régime « buts » est décidé CLUB PAR CLUB (provenanceDe : un des deux clubs a des xG sur moins de la moitié de ses
 * matchs comptés) : sa phrase le dit ainsi, jamais « pas d'xG pour ce championnat ».
 * -----------------------------------------------------------------------
 */

/** Les régimes, leur mot court et leur phrase : une seule source pour l'écran, l'essai à blanc et la calibration. */
export const PROVENANCES = Object.freeze({
  'cotes-plusmoins-xg': Object.freeze({ court: 'cotes + xG', phrase: 'calé sur les cotes (1N2 et plus/moins 2,5), ajusté par les xG des deux équipes' }),
  'cotes-plusmoins-buts': Object.freeze({
    court: 'cotes + buts',
    phrase: 'calé sur les cotes (1N2 et plus/moins 2,5), ajusté surtout par les buts des deux équipes (trop peu d’xG connus pour l’une des deux équipes)'
  }),
  'cotes-1n2-xg': Object.freeze({ court: 'cotes 1N2 + xG', phrase: 'calé sur la cote 1N2 ; sans cote plus/moins relevée, le total de buts vient pour moitié des xG' }),
  'cotes-1n2-buts': Object.freeze({
    court: 'cotes 1N2 + buts',
    phrase: 'calé sur la cote 1N2 ; sans cote plus/moins relevée, le total de buts vient pour moitié des statistiques des deux équipes, surtout leurs buts (trop peu d’xG connus pour l’une des deux équipes)'
  }),
  'xg-seuls': Object.freeze({ court: 'xG seuls', phrase: 'aucune cote : estimation statistique seule, tirée des xG pondérés dans le temps' }),
  'buts-seuls': Object.freeze({
    court: 'buts seuls',
    phrase: 'aucune cote : estimation statistique seule, tirée surtout des buts pondérés dans le temps (trop peu d’xG connus pour l’une des deux équipes)'
  }),
  'moyennes-seules': Object.freeze({ court: 'moyennes du championnat', phrase: 'aucune cote et des équipes inconnues du magasin : les moyennes du championnat' })
});

/** Le nom, pour Pierre, de la source qui cale le total : la moyenne football-data, sinon la moyenne des livres ESPN. */
export const NOMS_DES_SOURCES_DU_PLUS_MOINS = Object.freeze({
  footballData: 'football-data (moyenne du marché)',
  espn: (n) => `ESPN (moyenne de ${n} livre${n > 1 ? 's' : ''})`
});

/** Les messages d'un réglage du modèle fautif (la candidate est alors refusée, avec eux, sur la carte des versions). */
export const MOTS_DES_REGLAGES = Object.freeze({
  objetAttendu: 'modeleDeButs : un objet est attendu.',
  version: (lue, attendue) => `version ${String(lue)} (${attendue} attendue)`,
  clesInconnues: (cles) => `clés inconnues (${cles.join(', ')})`,
  ancrage: 'ancrage (ligne 2,5, méthode total-equilibre)',
  fautifs: (fautes) => `modeleDeButs : réglages fautifs — ${fautes.join(' ; ')}.`
});

/** Les messages d'une erreur du calcul (une étape de nuit qui échoue les montre dans son compte rendu). */
export const MOTS_DES_ERREURS = Object.freeze({
  pasLeCampQuiRecoit: 'faitsDeLaRencontre : la ligne du camp qui reçoit est attendue.'
});
