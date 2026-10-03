import { defineStore } from 'pinia';
import { router } from '@/router/index.js';

/**
 * Ouvre la PAGE d'une équipe (cf. views/TeamView.vue) depuis n'importe quel
 * nom d'équipe cliquable de l'appli — demande de Pierre le 01/10/2026 : « ça
 * aussi, affiche-le de la même façon, avec une page ». Remplace le panneau
 * latéral « Statistiques — équipe » (TeamStatsModal), qui appelait
 * API-Football (payant) à chaque ouverture pour l'historique et les joueurs ;
 * la page ne lit que le magasin et FotMob, gratuits.
 *
 * Le nom du magasin est resté (« Modal ») : une vingtaine de composants
 * appellent `openFor(nom, ligue, matchId)`, et rien ne change pour eux.
 */
export const useTeamStatsModalStore = defineStore('teamStatsModal', {
  actions: {
    openFor(teamName, league = null, matchId = null) {
      if (!teamName) return null;
      const query = {};
      if (league) query.league = league;
      if (matchId) query.match = matchId;
      return router.push({ name: 'team', params: { name: teamName }, query });
    }
  }
});
