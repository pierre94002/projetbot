import { httpClient } from './httpClient.js';

// Le banc d'essai (étape 19 du plan) : la note de départ (écrite dans le code du
// serveur), le dernier rejeu de cette appli et celui en cours. La lecture ne
// lance rien ; « Lancer le banc » rejoue le moteur sur le passé dans le serveur,
// sous le verrou d'actualisation (10 à 13 minutes), sans rien changer aux chiffres.
export const benchApi = {
  etat: () => httpClient.get('/bench'),
  /** L'avancement pendant un rejeu : le dernier rejeu sans son résumé (la page garde celui qu'elle a déjà). */
  avancement: () => httpClient.get('/bench?resume=non'),
  /** `options` : { periodes?, prix?, marches? } — par défaut P2 à P5, avant-match, cotes gratuites, vos bookmakers. Rend 202 et { lance, options, enCours }. */
  lancer: (options = {}) => httpClient.post('/bench/run', options)
};
