import { httpClient } from './httpClient.js';

// Étape 26 du plan : LA BOUCLE DE CORRECTION (routes /api/corrections du serveur, corrections.controller.js).
// Trois lectures (l'état, le tri figé d'un mois, une page du journal : rien n'est calculé à l'ouverture) et les clics de
// Pierre — chacun envoie l'état VU à l'écran (`vue`) : un double clic n'agit jamais deux fois. Un refus du serveur
// ({ error, raison }, 400 / 404 / 409 / 503) arrive en mots dans le message de l'erreur. Aucune route n'écrit les
// réglages du moteur : l'adoption et le retour arrière restent dans Réglages › Versions du moteur.
const id = (x) => encodeURIComponent(x);
export const correctionsApi = {
  etat: () => httpClient.get('/corrections'),
  tri: (mois) => httpClient.get(`/corrections/tri?mois=${encodeURIComponent(mois)}`),
  journal: (avant = null, limite = 50) => httpClient.get(`/corrections/journal?limite=${limite}${avant ? `&avant=${avant}` : ''}`),
  // « Proposer une correction » (fermé pendant l'essai de l'étape 27 : le serveur le refuse avec sa raison).
  proposer: ({ levier, valeur, phrase = null }) => httpClient.post('/corrections/proposer', { levier, valeur, phrase }),
  // « Mesurer au banc — environ 10 min » : la mesure part au clic (réponse 202), son verdict arrive une dizaine de minutes plus tard.
  mesurerAuBanc: (correction, vue) => httpClient.post(`/corrections/${id(correction)}/banc`, { vue }),
  // « Mettre à l'essai » : en file pour l'essai à blanc (rien n'est écrit au registre des versions au clic).
  accepter: (correction, vue) => httpClient.post(`/corrections/${id(correction)}/accepter`, { vue }),
  refuser: (correction, vue, phrase = null) => httpClient.post(`/corrections/${id(correction)}/refuser`, { vue, phrase }),
  // Une correction adoptée : le serveur dit où cliquer pour le retour arrière (il n'écrit rien).
  retirer: (correction, vue) => httpClient.post(`/corrections/${id(correction)}/retirer`, { vue })
};
