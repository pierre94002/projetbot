import { httpClient } from './httpClient.js';

// Feuille de route (étape 5 du plan) : les 9 lots et les 49 entrées du plan,
// l'historique des étapes terminées et la ligne « Tests » — tout cela est écrit
// dans le code du serveur — et les notes de Pierre, seule donnée enregistrée
// (data/runtime/roadmap.json). La lecture ne lance rien et ne lit ni la base,
// ni le réseau, ni Claude ; seule la note d'une étape s'enregistre ici.
export const roadmapApi = {
  overview: () => httpClient.get('/roadmap'),
  /**
   * `id` : l'identifiant de l'étape dans le plan (« 12 », « E »). `note` : le
   * texte, vide pour effacer. Renvoie l'état complet, à jour, et
   * `enregistrement: { id, change, fichier }` — idempotent : le même texte ne
   * réécrit rien (`change: false`).
   */
  saveNote: (id, note) => httpClient.put(`/roadmap/etapes/${encodeURIComponent(id)}/note`, { note })
};
