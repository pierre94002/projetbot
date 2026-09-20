import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    redirect: '/matches'
  },
  {
    path: '/matches/:matchId?',
    name: 'matches',
    component: () => import('@/views/MatchesView.vue'),
    props: true,
    meta: { title: 'Matchs' }
  },
  {
    path: '/statistiques',
    redirect: '/matches'
  },
  {
    path: '/paris',
    name: 'my-bets',
    component: () => import('@/views/MyBetsView.vue'),
    meta: { title: 'Mes paris' }
  },
  {
    path: '/historique-moteur',
    name: 'predictions-history',
    component: () => import('@/views/PredictionsHistoryView.vue'),
    meta: { title: 'Historique moteur' }
  },
  {
    // Page de match detaillee (resume, evenements, compositions,
    // statistiques d equipe et de joueurs), alimentee par match-stats.
    path: '/match/:matchId',
    name: 'match-detail',
    component: () => import('@/views/MatchDetailView.vue'),
    props: true,
    meta: { title: 'Match' }
  },
  {
    path: '/historique-moteur/:matchId',
    name: 'prediction-match-detail',
    component: () => import('@/views/PredictionMatchDetailView.vue'),
    props: true,
    meta: { title: 'Détail du match' }
  },
  {
    path: '/performance-paris',
    redirect: '/historique-moteur'
  },
  {
    path: '/reglages',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: 'Réglages du moteur' }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/matches'
  }
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
});
