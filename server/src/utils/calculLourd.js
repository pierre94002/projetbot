/**
 * calculLourd.js — UN CALCUL LOURD À LA FOIS (étape 27 du plan, 21/10/2026).
 * -----------------------------------------------------------------------
 * Le PC de Pierre a 7,9 Go de mémoire, dont ~2,2 Go libres quand l'appli
 * tourne ; un rejeu du banc d'essai prend 1,1 Go dans son processus à part, la
 * valeur des statistiques ~0,6 Go, les forces de buts ~0,35 Go. Deux calculs
 * lourds en même temps pourraient faire manquer de mémoire tout le poste.
 *
 * Chaque PROCESSUS À PART lourd (bancs des étapes 19 et 25, valeur des
 * statistiques, indice de force, forces de buts, connaissance du marché,
 * contrôle anti-fuite de la table du jour J) prend ce jeton avant de partir
 * (commencerCalculLourd(nom) → fin()) et le rend à la fin. Un second calcul
 * lourd pendant qu'un premier tourne lève CalculLourdEnCours : son appelant le
 * REPORTE et le dit (« un banc d'essai tourne depuis 12 min : les forces de
 * buts seront calculées à la passe suivante »). Le verrou d'actualisation
 * sérialise déjà les passes, les imports et les bancs entre processus ; ce jeton
 * garde le serveur lui-même, quel que soit le chemin qui lance un calcul.
 * -----------------------------------------------------------------------
 */

/** Un calcul lourd tourne déjà : le second est reporté. `enCours` : { nom, depuis }. */
export class CalculLourdEnCours extends Error {
  constructor(enCours, maintenant = Date.now()) {
    super(phraseDuReport(enCours, maintenant));
    this.enCours = enCours;
    this.reporte = true;
    this.statut = 409;
  }
}

let courant = null;

/** Le calcul lourd en cours ({ nom, depuis }), ou null. */
export const calculLourdEnCours = () => (courant ? { ...courant } : null);

/** La phrase du report, en mots simples. */
export function phraseDuReport(enCours, maintenant = Date.now()) {
  if (!enCours) return 'Aucun calcul lourd en cours.';
  const minutes = Math.max(0, Math.round((maintenant - Date.parse(enCours.depuis)) / 60_000));
  return `Un autre calcul lourd tourne (${enCours.nom}, depuis ${minutes} min) : celui-ci attend son tour — il sera fait à la passe suivante.`;
}

/**
 * Prend le jeton du calcul lourd `nom` : rend fin() (à appeler une fois le calcul fini, quel qu'en soit l'issue ;
 * un second appel ne fait rien). Lève CalculLourdEnCours si un autre calcul lourd tourne.
 */
export function commencerCalculLourd(nom, { maintenant = Date.now() } = {}) {
  if (courant) throw new CalculLourdEnCours(courant, maintenant);
  const jeton = { nom: String(nom), depuis: new Date(maintenant).toISOString() };
  courant = jeton;
  let rendu = false;
  return () => {
    if (rendu) return;
    rendu = true;
    if (courant === jeton) courant = null;
  };
}

/** Lance `travail` (une fonction qui rend une promesse) sous le jeton `nom` ; le jeton est rendu à la fin, réussie ou non. */
export async function avecCalculLourd(nom, travail) {
  const fin = commencerCalculLourd(nom);
  try {
    return await travail();
  } finally {
    fin();
  }
}
