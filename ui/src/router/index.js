import { createRouter, createWebHistory } from 'vue-router';

// `meta.section` : la couleur d'ambiance de la page (cf. tokens.css [data-section]
// et AppShell.vue) — Matchs, Mes paris, Historique moteur, Réglages.
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
    meta: { title: 'Matchs', section: 'matches' }
  },
  {
    path: '/statistiques',
    redirect: '/matches'
  },
  {
    path: '/paris',
    name: 'my-bets',
    component: () => import('@/views/MyBetsView.vue'),
    meta: { title: 'Mes paris', section: 'bets' }
  },
  {
    path: '/historique-moteur',
    name: 'predictions-history',
    component: () => import('@/views/PredictionsHistoryView.vue'),
    meta: { title: 'Historique moteur', section: 'history' }
  },
  {
    // Page de match detaillee (resume, evenements, compositions,
    // statistiques d equipe et de joueurs), alimentee par match-stats.
    path: '/match/:matchId',
    name: 'match-detail',
    component: () => import('@/views/MatchDetailView.vue'),
    props: true,
    meta: { title: 'Match', section: 'matches' }
  },
  {
    // Page d'un match à venir, construite comme celle d'un match joué
    // (en-tête, onglets, barres de statistiques) — ouverte au clic dans Matchs.
    path: '/match-a-venir/:matchId',
    name: 'upcoming-match',
    component: () => import('@/views/UpcomingMatchView.vue'),
    props: true,
    meta: { title: 'Match à venir', section: 'matches' }
  },
  {
    // Page d'une équipe (01/10/2026), construite comme celle d'un match :
    // ouverte au clic sur un nom d'équipe, n'importe où dans l'appli.
    // `league` et `match` (identifiant du match d'où vient le clic) en query.
    path: '/equipe/:name',
    name: 'team',
    component: () => import('@/views/TeamView.vue'),
    props: (route) => ({ name: route.params.name, league: route.query.league ?? null, matchId: route.query.match ?? null }),
    meta: { title: 'Équipe', section: 'matches' }
  },
  {
    // Fiche d'un joueur (01/10/2026) : ouverte au clic sur un joueur des
    // compositions ou du classement des joueurs. Identifiant FotMob dans
    // l'adresse, saison en query.
    path: '/joueur/:playerId',
    name: 'player',
    component: () => import('@/views/PlayerView.vue'),
    props: (route) => ({ playerId: route.params.playerId, season: route.query.saison ?? null }),
    meta: { title: 'Joueur', section: 'matches' }
  },
  {
    path: '/historique-moteur/:matchId',
    name: 'prediction-match-detail',
    component: () => import('@/views/PredictionMatchDetailView.vue'),
    props: true,
    meta: { title: 'Détail du match', section: 'history' }
  },
  {
    path: '/performance-paris',
    redirect: '/historique-moteur'
  },
  {
    path: '/reglages',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: 'Réglages', section: 'settings' }
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
