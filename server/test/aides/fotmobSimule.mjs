/**
 * Réponses FotMob SIMULÉES pour les tests des enregistreurs (étape E) — ce
 * n'est PAS un fichier de test. Aucun réseau : la garde des tests (garde.mjs)
 * bloque fetch, http, https, net, tls et dns ; un script de test peut
 * remplacer `fetch` par `installerFauxFetch`, qui ne répond qu'aux adresses
 * FotMob connues, avec ces réponses fabriquées, et refuse tout le reste.
 *
 * Les formes suivent celles que lit fotMobProvider.js : la liste du jour
 * (`matches?date=`), la page d'un match (`matchDetails?matchId=`) avec ses
 * statistiques, son déroulé et sa composition (absents compris), puis, depuis
 * l'étape 43, les fichiers du texte minute par minute (data.fotmob.com).
 */

import zlib from 'node:zlib';

export const BASE = 'https://www.fotmob.com/api/data';

/** Compétitions suivies (pays|nom tels que FotMob les publie) et une qui ne l'est pas. */
export const LIGUES = {
  EPL: ['ENG', 'Premier League', 47],
  LIGA: ['ESP', 'LaLiga', 87],
  SERIEA: ['ITA', 'Serie A', 55],
  BUNDES: ['GER', 'Bundesliga', 54],
  L1: ['FRA', 'Ligue 1', 53],
  HORS: ['XXX', 'Ligue inconnue', 999]
};

/**
 * Une rencontre de la liste du jour. `liveTime` : { short, long, maxTime } ;
 * `rouges` : [domicile, extérieur] publiés dans le statut (absents si non fournis).
 */
export function rencontre({ id, ligue = 'EPL', home = ['Domicile', 1], away = ['Exterieur', 2], coup, started = false, finished = false, cancelled = false, score = null, liveTime = null, rouges = null }) {
  const status = { utcTime: coup, started, finished, cancelled };
  if (score) status.scoreStr = score;
  if (liveTime) status.liveTime = liveTime;
  if (rouges) {
    status.numberOfHomeRedCards = rouges[0];
    status.numberOfAwayRedCards = rouges[1];
  }
  return { ligue, match: { id, leagueId: LIGUES[ligue][2], home: { id: home[1], name: home[0] }, away: { id: away[1], name: away[0] }, status } };
}

/** La réponse de `matches?date=` pour ces rencontres. */
export function listeDuJour(rencontres) {
  const parLigue = new Map();
  for (const r of rencontres) {
    if (!parLigue.has(r.ligue)) parLigue.set(r.ligue, []);
    parLigue.get(r.ligue).push(r.match);
  }
  return {
    leagues: [...parLigue.entries()].map(([ligue, matches]) => {
      const [ccode, name, id] = LIGUES[ligue];
      return { ccode, name, id, matches };
    })
  };
}

/** La page d'un match EN COURS : statut (minute), statistiques (xG…), déroulé (cartons). */
export function detailEnDirect({ id, home = ['Domicile', 1], away = ['Exterieur', 2], score = '0 - 0', liveTime = { short: '30’' }, xg = [0.5, 0.2], tirs = [5, 2], rougesStats = null, cartons = [], sansStats = false, coverage = 'xG' }) {
  const stats = sansStats
    ? []
    : [
        {
          title: 'Top stats',
          stats: [
            { title: 'Expected goals (xG)', stats: xg },
            { title: 'Total shots', stats: tirs },
            { title: 'Ball possession', stats: [55, 45] },
            ...(rougesStats ? [{ title: 'Red cards', stats: rougesStats }] : [])
          ]
        }
      ];
  return {
    general: { homeTeam: { id: home[1], name: home[0] }, awayTeam: { id: away[1], name: away[0] }, coverageLevel: coverage },
    header: { status: { started: true, finished: false, scoreStr: score, liveTime }, teams: [{ id: home[1] }, { id: away[1] }] },
    content: {
      stats: { Periods: { All: { stats } } },
      matchFacts: { events: { events: cartons.map((c) => ({ type: 'Card', time: c.minute, isHome: c.side === 'home', card: c.card, player: { id: c.id ?? 0, name: c.nom ?? 'Joueur' } })) } }
    }
  };
}

/**
 * La page d'un match À VENIR : sa composition (même vide) avec les absents
 * de chaque équipe, ou rien du tout (`publiee: false`) quand FotMob n'a encore
 * rien publié pour ce match.
 */
export function pageAVenir({ home = ['Domicile', 1], away = ['Exterieur', 2], absentsDom = [], absentsExt = [], publiee = true }) {
  const equipe = ([nom, id], absents) => ({
    id,
    name: nom,
    starters: [],
    subs: [],
    unavailable: absents.map((a) => ({ id: a.id ?? 0, name: a.nom, unavailability: { type: a.type, expectedReturn: a.retour ?? null } }))
  });
  return {
    general: { homeTeam: { id: home[1], name: home[0] }, awayTeam: { id: away[1], name: away[0] }, matchTimeUTCDate: null },
    header: { status: { started: false, finished: false } },
    content: publiee ? { lineup: { homeTeam: equipe(home, absentsDom), awayTeam: equipe(away, absentsExt) } } : {}
  };
}

/** Où FotMob sert le TEXTE MINUTE PAR MINUTE d'un match (étape 43) : un fichier par langue. */
export const BASE_TEXTE = 'https://data.fotmob.com/webcl/ltc/gsm';

/**
 * Remplace `fetch` : seules les adresses FotMob connues répondent.
 * `listes` : { 'AAAAMMJJ': réponse | Error }, `details` : { id: réponse | Error },
 * `textes` (étape 43) : { '<id>_<langue>': contenu du fichier | Error } — servi
 * compressé (gzip) comme chez FotMob ; une langue absente répond 403 comme le
 * fichier qui n'existe pas. Rend le journal des appels (adresses), à lire après
 * coup, et celui des textes à part (`appelsTexte`).
 */
export function installerFauxFetch({ listes = {}, details = {}, textes = {} } = {}) {
  const appels = [];
  const appelsTexte = [];
  const reponse = (corps) => {
    if (corps instanceof Error) throw corps;
    if (corps === undefined) return { status: 404, ok: false, json: async () => ({}) };
    return { status: 200, ok: true, json: async () => JSON.parse(JSON.stringify(corps)) };
  };
  globalThis.fetch = async (url) => {
    const u = String(url);
    const texte = u.match(/^https:\/\/data\.fotmob\.com\/webcl\/ltc\/gsm\/(\d+_[\w-]+)\.json\.gz$/);
    if (texte) {
      appelsTexte.push(u);
      const corps = textes[texte[1]];
      if (corps instanceof Error) throw corps;
      if (corps === undefined) return { status: 403, ok: false, arrayBuffer: async () => Buffer.from('<Error><Code>AccessDenied</Code></Error>') };
      const compresse = zlib.gzipSync(Buffer.from(JSON.stringify(corps)));
      return { status: 200, ok: true, arrayBuffer: async () => compresse.buffer.slice(compresse.byteOffset, compresse.byteOffset + compresse.byteLength) };
    }
    if (!u.startsWith(`${BASE}/`)) throw new Error(`Appel réseau interdit dans les tests (faux FotMob : ${u})`);
    appels.push(u);
    const jour = u.match(/\/matches\?date=(\d{8})/);
    if (jour) return reponse(listes[jour[1]]);
    const match = u.match(/\/matchDetails\?matchId=(\d+)/);
    if (match) return reponse(details[match[1]]);
    return reponse(undefined);
  };
  return {
    appels,
    appelsTexte,
    listes,
    details,
    textes,
    compter: (motif) => appels.filter((a) => a.includes(motif)).length
  };
}
