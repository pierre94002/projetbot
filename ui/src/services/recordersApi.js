import { httpClient } from './httpClient.js';

// Enregistreurs (étape E du plan) : absents du jour, matchs en direct, cotes
// payantes archivées, pronostics du moteur gelés. Lecture seule : l'état est
// préparé par le serveur, l'écran ne lance aucun relevé.
export const recordersApi = {
  overview: () => httpClient.get('/recorders')
};
