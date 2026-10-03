/**
 * fotmobLabels.js — les libellés que FotMob publie en anglais, en français.
 * -----------------------------------------------------------------------
 * Retour prévu d'un blessé (« Early October 2026 », « Doubtful »), pelouse
 * (« artificial turf ») et météo (« Clear », « Cloudy ») : affichés tels quels
 * avant le 01/10/2026 sur la page d'un match et dans les actualités d'équipe.
 * Un libellé inconnu est rendu tel quel plutôt que deviné.
 * -----------------------------------------------------------------------
 */

const MOIS = {
  January: 'janvier', February: 'février', March: 'mars', April: 'avril', May: 'mai', June: 'juin',
  July: 'juillet', August: 'août', September: 'septembre', October: 'octobre', November: 'novembre', December: 'décembre'
};
const RETOURS = { 'Out for season': 'saison terminée', Doubtful: 'incertain', 'Back in training': "reprise de l'entraînement", Unknown: 'inconnu' };

/** Retour prévu d'un joueur indisponible. */
export function retourPrevu(texte) {
  if (!texte) return null;
  if (RETOURS[texte]) return RETOURS[texte];
  const m = /^(Early|Mid|Late)\s+([A-Z][a-z]+)\s+(\d{4})$/.exec(texte);
  if (!m || !MOIS[m[2]]) return texte;
  return `${{ Early: 'début ', Mid: 'mi-', Late: 'fin ' }[m[1]]}${MOIS[m[2]]} ${m[3]}`;
}

/** Type de pelouse (« grass », « artificial turf »…). */
export function pelouse(texte) {
  const t = String(texte ?? '').toLowerCase();
  if (!t) return null;
  if (t.includes('hybrid')) return 'Hybride';
  if (t.includes('artificial') || t.includes('synthetic')) return 'Synthétique';
  if (t.includes('grass')) return 'Gazon';
  return texte;
}

const METEO = [
  [/thunder/, 'Orage'],
  [/snow/, 'Neige'],
  [/drizzle/, 'Bruine'],
  [/shower/, 'Averses'],
  [/light rain/, 'Pluie légère'],
  [/heavy rain/, 'Forte pluie'],
  [/rain/, 'Pluie'],
  [/fog|mist/, 'Brouillard'],
  [/partly cloudy/, 'Partiellement nuageux'],
  [/overcast/, 'Couvert'],
  [/cloud/, 'Nuageux'],
  [/sunny/, 'Ensoleillé'],
  [/clear/, 'Dégagé'],
  [/wind/, 'Venteux']
];

/** Description de la météo. */
export function meteo(texte) {
  const t = String(texte ?? '').toLowerCase();
  if (!t) return null;
  return METEO.find(([motif]) => motif.test(t))?.[1] ?? texte;
}

/**
 * Tour d'une rencontre : FotMob écrit « Round 4 » aussi bien pour une
 * journée de championnat que pour un tour de coupe.
 */
export function tour(texte, competition) {
  const m = /^Round (\d+)$/.exec(texte ?? '');
  if (!m) return texte || null;
  if (!/cup|pokal|coupe|ta[cç]a|copa|coppa|beker|knvb/i.test(competition ?? '')) return `Journée ${m[1]}`;
  return m[1] === '1' ? '1er tour' : `${m[1]}e tour`;
}
