import { createRouter, createWebHistory } from 'vue-router';

// `meta.section` : la couleur d'ambiance de la page (cf. tokens.css [data-section]
// et AppShell.vue) — Matchs, Mes paris, Historique moteur, Feuille de route, Réglages.
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
    // « Bookmakers » (étape 31 du plan) : ce que l'étape 22 a mesuré du marché — le meilleur moment pour parier, qui est le
    // plus juste, qui bouge le premier, les marges et les biais. Couleur de « Mes paris » (aucune couleur de plus) ;
    // `meta.nav` la distingue dans le menu (une entrée active à la fois). Le championnat choisi vit dans ?championnat=.
    path: '/bookmakers',
    name: 'bookmakers',
    component: () => import('@/views/BookmakersView.vue'),
    meta: { title: 'Bookmakers', section: 'bets', nav: 'bookmakers' }
  },
  {
    path: '/historique-moteur',
    name: 'predictions-history',
    component: () => import('@/views/PredictionsHistoryView.vue'),
    meta: { title: 'Historique moteur', section: 'history' }
  },
  {
    // « Santé du moteur » (étape 24 du plan) : le tableau de bord du moteur — les feux, la note face au marché,
    // la calibration, la valeur de clôture, ce qu'il faut vérifier. Même couleur que Historique moteur (section
    // « history ») ; `meta.nav` la distingue dans le menu (une entrée active à la fois).
    path: '/sante-moteur',
    name: 'engine-health',
    component: () => import('@/views/EngineHealthView.vue'),
    meta: { title: 'Santé du moteur', section: 'history', nav: 'sante-moteur' }
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
    // La feuille de route (étape 5 du plan) : les 9 lots et 49 étapes, leur
    // état, ce qui a changé, et les notes de Pierre.
    path: '/feuille-de-route',
    name: 'roadmap',
    component: () => import('@/views/RoadmapView.vue'),
    meta: { title: 'Feuille de route', section: 'roadmap' }
  },
  {
    path: '/reglages',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: 'Réglages', section: 'settings' }
  },
  {
    // La page « Opportunités du jour » (étape 8 du plan) : un onglet de la page
    // Matchs ; cette adresse y mène (lien direct, clic sur une notification).
    path: '/opportunites',
    name: 'opportunities',
    redirect: { path: '/matches', query: { onglet: 'opportunites' } }
  },
  {
    // Le banc d'essai (étape 19 du plan) : un onglet d'Historique moteur ; cette adresse y mène.
    path: '/banc-d-essai',
    name: 'bench',
    redirect: { path: '/historique-moteur', query: { onglet: 'banc' } }
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
