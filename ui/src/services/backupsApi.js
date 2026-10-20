import { httpClient } from './httpClient.js';

// Sauvegardes de la base (étape 1 du plan, server/scripts/backup-db.mjs et
// restore-test-db.mjs). L'état est préparé chaque nuit par l'actualisation ;
// l'écran ne lance aucune sauvegarde. Il enregistre seulement la destination
// de la copie hors disque (OneDrive, clé USB ou autre dossier, aucune) et la
// fait vérifier, sans que le serveur n'écrive rien pour la vérification.
export const backupsApi = {
  overview: () => httpClient.get('/backups'),
  /** { type: 'onedrive'|'dossier'|'aucune', chemin? } → l'état complet, à jour. */
  saveDestination: (choix) => httpClient.put('/backups/destination', choix),
  /** { type, chemin? } → { utilisable, existe, libre, requis, onedrive, problemes, avertissements… } */
  checkDestination: (choix) => httpClient.post('/backups/destination/check', choix)
};
