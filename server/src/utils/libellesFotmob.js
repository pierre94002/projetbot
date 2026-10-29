/**
 * libellesFotmob.js — ce que FotMob publie dans ses unités, dit en français, côté SERVEUR (correctif B du 28/10/2026).
 * Le pendant de ui/src/utils/fotmobLabels.js (l'écran) : la même règle, le test des correctifs les compare.
 * -----------------------------------------------------------------------
 *   ventEnKmH    la vitesse du vent de la page d'un match (`content.weather.windSpeed`, rangée TELLE QUELLE dans
 *                matches.meta.windSpeed par fotMobProvider.js) est en MÈTRES PAR SECONDE. La preuve (correctif B) : les
 *                descriptions « …/Wind » de cette météo — celle de The Weather Company, d'où viennent aussi iconCode,
 *                windDirectionCardinal, relativeHumidity et cloudCover — commencent exactement à 9 et jamais en dessous,
 *                dans 876 analyses de l'IA comme dans les 2 116 rencontres de la base d'essai ; 9 m/s = 20 mph = 32 km/h,
 *                le seuil « venteux » de cette source (en km/h, ce serait « venteux dès 9 km/h ») ; moyenne 4, maximum 15 :
 *                le vent à 10 m d'altitude en m/s. Converti à l'affichage et dans ce que lit l'IA, jamais dans la base.
 * Fonction pure : ni base, ni réseau, ni horloge.
 * -----------------------------------------------------------------------
 */

/** Mètres par seconde → kilomètres-heure, arrondis (× 3,6). null pour une valeur absente ou illisible. */
export function ventEnKmH(metresParSeconde) {
  if (metresParSeconde === null || metresParSeconde === undefined || metresParSeconde === '') return null;
  const v = Number(metresParSeconde);
  return Number.isFinite(v) ? Math.round(v * 3.6) : null;
}
