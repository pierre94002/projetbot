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
 * La vitesse du vent en km/h (correctif du 28/10/2026). FotMob la donne en MÈTRES PAR SECONDE (rangée telle quelle au
 * magasin, meta.windSpeed) : les descriptions « …/Wind » de sa météo commencent exactement à 9 m/s = 20 mph = 32 km/h,
 * le seuil « venteux » de la source. × 3,6, arrondi ; null pour une valeur absente ou illisible. Le serveur a la même
 * règle (server/src/utils/libellesFotmob.js) pour ce que lit l'IA.
 */
export function ventEnKmH(metresParSeconde) {
  if (metresParSeconde === null || metresParSeconde === undefined || metresParSeconde === '') return null;
  const v = Number(metresParSeconde);
  return Number.isFinite(v) ? Math.round(v * 3.6) : null;
}

/**
 * Étape 36 du plan (lot 1, 09/11/2026) : LES TOURS DE COUPE que FotMob écrit en anglais depuis 2026 (« Quarter-finals »,
 * « 8th Finals ») ou en fractions (« 1/8 »), en français — la COPIE de la table TOURS du serveur
 * (server/src/data/coupes/reglagesCoupes.js ; un test les compare, T-T6). Un intitulé inconnu reste tel quel (jamais deviné).
 */
export const TOURS_DE_COUPE = Object.freeze([
  Object.freeze({ code: '1/64', exacts: Object.freeze(['1/64', '64th finals', 'round of 128']), libelle: 'Soixante-quatrièmes de finale' }),
  Object.freeze({ code: '1/32', exacts: Object.freeze(['1/32', '32nd finals', 'round of 64']), libelle: 'Trente-deuxièmes de finale' }),
  Object.freeze({ code: '1/16', exacts: Object.freeze(['1/16', '16th finals', 'round of 32', 'last 32']), libelle: 'Seizièmes de finale' }),
  Object.freeze({ code: '1/8', exacts: Object.freeze(['1/8', '8th finals', 'round of 16', 'last 16']), libelle: 'Huitièmes de finale' }),
  Object.freeze({ code: '1/4', exacts: Object.freeze(['1/4', 'quarter-finals', 'quarter-final', 'quarterfinals', 'quarterfinal', 'quarter finals', 'quarter final']), libelle: 'Quarts de finale' }),
  Object.freeze({ code: '1/2', exacts: Object.freeze(['1/2', 'semi-finals', 'semi-final', 'semifinals', 'semifinal', 'semi finals', 'semi final']), libelle: 'Demi-finales' }),
  Object.freeze({ code: 'final', exacts: Object.freeze(['final', 'finals']), libelle: 'Finale' }),
  Object.freeze({ code: '3e-place', exacts: Object.freeze(['bronze', '3rd place', 'third place', 'third place play-off', '3rd place play-off']), libelle: 'Match pour la 3e place' }),
  Object.freeze({ code: 'preliminaire', exacts: Object.freeze(['preliminary round', 'preliminary', 'qualification', 'qualifying round']), libelle: 'Tour préliminaire' }),
  Object.freeze({ code: 'barrage', exacts: Object.freeze(['play-offs', 'playoffs', 'play-off', 'playoff', 'knockout round play-offs', 'knockout round playoffs']), libelle: 'Barrages' })
]);

/** Un intitulé sans casse ni accents, espaces réduits (la clé de TOURS_DE_COUPE : la règle cleDuTexte du serveur). */
export const cleDuTour = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

/** Le tour de coupe d'un intitulé FotMob (TOURS_DE_COUPE) : { code, libelle }, ou null. */
export function tourDeCoupe(texte) {
  const cle = cleDuTour(texte);
  const t = TOURS_DE_COUPE.find((x) => x.exacts.includes(cle));
  return t ? { code: t.code, libelle: t.libelle } : null;
}

/**
 * Tour d'une rencontre : FotMob écrit « Round 4 » aussi bien pour une
 * journée de championnat que pour un tour de coupe. Étape 36 : les tours de
 * coupe en anglais ou en fractions sont traduits (« Quarter-finals » → « Quarts
 * de finale ») ; « final » seul ne se dit « Finale » que si le serveur l’a
 * confirmée (`finaleConfirmee`), sinon il reste entre guillemets (FotMob appelle
 * aussi « final » le dernier tour de qualification d’août).
 */
export function tour(texte, competition, { finaleConfirmee = false } = {}) {
  const coupe = tourDeCoupe(texte);
  if (coupe) return coupe.code === 'final' && !finaleConfirmee ? `« ${texte} »` : coupe.libelle;
  const nieme = /^(\d{1,2})(?:st|nd|rd|th) round$/i.exec(texte ?? '');
  if (nieme) return Number(nieme[1]) === 1 ? '1er tour' : `${Number(nieme[1])}e tour`;
  const m = /^Round (\d+)$/.exec(texte ?? '');
  if (!m) return texte || null;
  if (!/cup|pokal|coupe|ta[cç]a|copa|coppa|beker|knvb/i.test(competition ?? '')) return `Journée ${m[1]}`;
  return m[1] === '1' ? '1er tour' : `${m[1]}e tour`;
}
