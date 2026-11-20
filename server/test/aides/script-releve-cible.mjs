/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-releve-cible.mjs <serveur de la copie> <phase>
 *
 * LE RELEVÉ CIBLÉ (18/11/2026, conception (a) « le relevé de la vague ») : le bouton de l'encart du conseil relève
 * SEULEMENT les championnats de la vague. Le client payant (oddsApiClient.js) est REMPLACÉ par un espion qui note chaque
 * appel : rien ne part, aucun crédit de Pierre. Réseau coupé (garde.mjs), base d'essai, instantané de la COPIE. Phases :
 *   cible     E1 une demande invalide : 400, aucun appel, rien d'écrit (octets et heure) ; E2 seulement les clés demandées,
 *             la même requête que le relevé complet ; E3 le bilan des crédits écrit par le dépôt gelé tel quel ; E5 toutes
 *             les clés en échec : rien d'écrit ; E6 deux relevés à la fois : le second reçoit 409, sans appel ; E7 les
 *             championnats retirés, calculés AVANT l'écriture ; E10 le relevé complet inchangé (37 appels, mêmes champs) ;
 *   vieilles  E4 (horloge RÉELLE : l'heure du fichier est celle du disque) : après un relevé ciblé, AUCUNE vieille cote ne
 *             paraît fraîche — ni dans l'instantané, ni par la fraîcheur, ni dans l'archive, ni dans le conseil ;
 *   archive   E9 : un championnat absent de l'instantané garde l'heure de son coup d'envoi, tirée de l'archive (jamais un
 *             prix), sans doublon du calendrier.
 *   tard      E9 bis : un match du calendrier que l'archive ne répare pas suit la règle d'avant le lot (vu jusqu'à 3 h
 *             après midi UTC, pas plus).
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { Socket } from 'node:net';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const MIN = 60_000;
const H = 3_600_000;
const iso = (t) => new Date(t).toISOString();

// ------------------------------------------------- l'espion du client payant
// Le vrai oddsApiClient.js n'est JAMAIS chargé : un module à sa place note chaque appel (clé et options). Sans réponse
// prévue, il lève ; une réponse peut être une promesse (E6 : un relevé « en cours »).
globalThis.__appelsPayants = [];
const ESPION = `export async function getSportOddsRaw(sportKey, options = {}) {
  globalThis.__appelsPayants.push({ cle: sportKey, options });
  const r = globalThis.__reponsePayante ? await globalThis.__reponsePayante(sportKey, options) : null;
  if (!r) throw new Error('appel payant intercepté par le test : ' + sportKey);
  if (r.erreur) throw Object.assign(new Error(r.erreur), { quota: r.quota });
  return r;
}`;
// Correction S4 (18/11/2026) : le serveur relit le conseil avant tout appel payant et refuse (409) une liste qui n'est pas
// exactement celle du bouton allumé. Les essais relèvent des clés d'essai sans fabriquer une vague entière : le conseil
// « du clic » est alors INJECTÉ (globalThis.__conseilDuClic, posé par `injecter`) entre deux étapes attendues ; sans
// injection, c'est le vrai conseil de la copie qui est lu (phase « liste », cas d). La copie seule est touchée : le
// conseilReleve.js chargé ici reçoit une enveloppe autour de conseilReleveActuel, le fichier du code ne change pas.
registerHooks({
  load(url, context, nextLoad) {
    const chemin = decodeURIComponent(new URL(url).pathname);
    if (/[\\/]data[\\/]providers[\\/]oddsApiClient\.js$/.test(chemin)) {
      return { format: 'module', source: ESPION, shortCircuit: true };
    }
    if (/[\\/]data[\\/]conseilReleve\.js$/.test(chemin)) {
      const r = nextLoad(url, context);
      const source = String(r.source).replace(
        'export function conseilReleveActuel(',
        'export function conseilReleveActuel(o) {\n  return globalThis.__conseilDuClic ? globalThis.__conseilDuClic(o) : conseilReleveActuelDuCode(o);\n}\nfunction conseilReleveActuelDuCode('
      );
      return { ...r, source, shortCircuit: true };
    }
    return nextLoad(url, context);
  }
});
/** Le conseil « du clic » injecté : bouton allumé (ou non) avec exactement ces clés ; `null` rend le vrai conseil. */
const injecter = (cles, { actif = true, conseil = 'maintenant' } = {}) => {
  globalThis.__conseilDuClic = cles === null ? null : () => ({ conseil, releveCible: { actif, cles: [...cles] } });
};

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const { getFixturePaths } = await imp('data/repositories/fixturesRepository.js');
const fichierInstantane = getFixturePaths().odds;
if (!path.resolve(fichierInstantane).toLowerCase().startsWith(path.resolve(serveur).toLowerCase())) throw new Error(`Instantané hors de la copie : ${fichierInstantane}`);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const fichierBilan = path.join(RUNTIME, 'releve-payant.json');
const { NOMS_DES_CLES, TRACKED_SPORT_KEYS } = await imp('data/providers/oddsApiCompetitions.js');

// ------------------------------------------------- les faux relevés
const EPL = 'soccer_epl';
const LIGA = 'soccer_spain_la_liga';
const L1 = 'soccer_france_ligue_one';
const BUNDES = 'soccer_germany_bundesliga';
const h2h = (home, away, [o1, ox, o2], at) => ({ key: 'h2h', last_update: at, outcomes: [{ name: home, price: o1 }, { name: away, price: o2 }, { name: 'Draw', price: ox }] });
const livre = (key, title, home, away, cotes, at) => ({ key, title, last_update: at, markets: [h2h(home, away, cotes, at)] });
/** Un match The Odds API : trois bookmakers (dont William Hill, un des vôtres), cotes relevées à `at`. */
const match = ({ id, cle, home, away, coup, at, wh = [2.3, 3.4, 3.3] }) => ({
  id,
  sport_key: cle,
  sport_title: NOMS_DES_CLES[cle],
  commence_time: iso(coup),
  home_team: home,
  away_team: away,
  bookmakers: [livre('pinnacle', 'Pinnacle', home, away, [2.0, 3.6, 3.9], at), livre('williamhill', 'William Hill', home, away, wh, at), livre('betclic_fr', 'Betclic (FR)', home, away, [1.9, 3.3, 3.6], at)]
});
const ecrireInstantane = (matchs, mtime) => {
  fs.mkdirSync(path.dirname(fichierInstantane), { recursive: true });
  fs.writeFileSync(fichierInstantane, JSON.stringify([{ data: matchs }]));
  const t = new Date(mtime);
  fs.utimesSync(fichierInstantane, t, t);
};
const lireInstantane = () => JSON.parse(fs.readFileSync(fichierInstantane, 'utf8'))[0].data;
const ecrire = (nom, contenu) => {
  fs.mkdirSync(RUNTIME, { recursive: true });
  fs.writeFileSync(path.join(RUNTIME, nom), JSON.stringify(contenu, null, 1));
};
/** Octets et heure d'un fichier : ce qui doit rester identique quand rien ne doit être écrit. */
const empreinte = (f) => (fs.existsSync(f) ? { sha1: crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex'), mtimeMs: fs.statSync(f).mtimeMs } : null);

/** L'application Express, appelée sans réseau : une requête fabriquée, la réponse captée. */
async function application() {
  const { createApp } = await imp('app.js');
  const app = createApp();
  return (methode, url, corps) =>
    new Promise((resolve, reject) => {
      const req = new http.IncomingMessage(new Socket());
      req.method = methode;
      req.url = url;
      req.headers = { host: 'essai', ...(corps !== undefined ? { 'content-type': 'application/json' } : {}) };
      if (corps !== undefined) {
        req._body = true;
        req.body = corps;
      }
      const res = new http.ServerResponse(req);
      const morceaux = [];
      res.write = (c) => {
        morceaux.push(Buffer.from(c));
        return true;
      };
      res.end = (c) => {
        if (c) morceaux.push(Buffer.from(c));
        let rendu = null;
        try {
          rendu = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
        } catch {
          rendu = null;
        }
        resolve({ code: res.statusCode, corps: rendu });
        return res;
      };
      app.handle(req, res, reject);
    });
}

const sortie = { ok: true, phase };

if (phase === 'cible') {
  const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
  // L'instantané du dernier relevé (complet, il y a 2 h) : l'EPL (deux matchs à venir), la Liga et la Ligue 1 (un match
  // à venir chacune), la Bundesliga (un match déjà joué : rien à retirer).
  const avant = T0 - 2 * H;
  const ancien = [
    match({ id: 'epl-1', cle: EPL, home: 'Man City', away: 'Liverpool', coup: T0 + 5 * H, at: iso(avant) }),
    match({ id: 'epl-2', cle: EPL, home: 'Arsenal', away: 'Chelsea', coup: T0 + 30 * H, at: iso(avant) }),
    match({ id: 'liga-1', cle: LIGA, home: 'Betis', away: 'Sevilla', coup: T0 + 6 * H, at: iso(avant) }),
    match({ id: 'l1-1', cle: L1, home: 'Lyon', away: 'Nantes', coup: T0 + 7 * H, at: iso(avant) }),
    match({ id: 'bundes-1', cle: BUNDES, home: 'Bayern', away: 'Mainz', coup: T0 - 5 * H, at: iso(avant) })
  ];
  ecrireInstantane(ancien, avant);
  ecrire('releve-payant.json', { version: 1, at: iso(avant), clesDemandees: 37, clesRelevees: [EPL, LIGA, L1, BUNDES], echecs: [], matchs: 5, quota: { restants: 467, utilises: 33 }, cout: 4, coutParCle: {}, matchsParCle: {} });
  fs.utimesSync(fichierBilan, new Date(avant), new Date(avant));
  const appel = await application();
  const lds = await imp('data/providers/liveDataSync.js');
  const { releveEnCoursDe } = lds;
  // P2 : ce que liveDataSync exporte (chargé dans la copie, client payant remplacé par l'espion).
  sortie.exports = ['refreshLiveOdds', 'refreshLiveOddsCible', 'controlerLesCles', 'compteRenduDuReleveCible', 'releveEnCoursDe', 'CODE_RELEVE_EN_COURS', 'CLES_PAR_RELEVE_CIBLE_MAX', 'TRACKED_SPORT_KEYS'].filter((n) => n in lds);
  // Sur le code d'avant le lot (les poses), la fonction manque : c'est dit dans la sortie, sans arrêter l'essai.
  const verrouDe = () => (typeof releveEnCoursDe === 'function' ? releveEnCoursDe() : 'absent : pas de verrou');

  // E1 — une demande invalide : 400, aucun appel, ni l'instantané ni le bilan ne bougent (octets et heure).
  const avantE1 = { instantane: empreinte(fichierInstantane), bilan: empreinte(fichierBilan) };
  const treize = TRACKED_SPORT_KEYS.slice(0, 13);
  const invalides = [
    ['cle inconnue', { cles: ['soccer_inconnue'] }],
    ['doublon', { cles: [EPL, EPL] }],
    ['liste vide', { cles: [] }],
    ['13 cles', { cles: treize }],
    ['pas de liste', {}],
    ['une chaine', { cles: EPL }],
    ['sans corps', undefined]
  ];
  sortie.e1 = [];
  for (const [nom, corps] of invalides) {
    const r = await appel('POST', '/api/sources/odds/refresh-cible', corps);
    sortie.e1.push({ nom, code: r.code, erreur: r.corps?.error ?? null });
  }
  sortie.e1Appels = globalThis.__appelsPayants.length;
  sortie.e1Inchanges = JSON.stringify({ instantane: empreinte(fichierInstantane), bilan: empreinte(fichierBilan) }) === JSON.stringify(avantE1);

  // E5 — toutes les clés demandées échouent (le serveur répond, avec son quota) : erreur, rien d'écrit.
  globalThis.__reponsePayante = () => ({ erreur: 'The Odds API a répondu 500 : panne', quota: { remaining: 467, used: 33, last: 0 } });
  injecter([EPL, LIGA]);
  const r5 = await appel('POST', '/api/sources/odds/refresh-cible', { cles: [EPL, LIGA] });
  sortie.e5 = { code: r5.code, erreur: r5.corps?.error ?? null, appels: globalThis.__appelsPayants.map((a) => a.cle), inchanges: JSON.stringify({ instantane: empreinte(fichierInstantane), bilan: empreinte(fichierBilan) }) === JSON.stringify(avantE1), verrou: verrouDe() };

  // E2, E3, E7 — la vague : EPL et Liga. L'EPL répond (x-requests-last 1), la Liga sans match (0).
  globalThis.__appelsPayants = [];
  globalThis.__reponsePayante = (cle) =>
    cle === EPL
      ? { matches: [match({ id: 'epl-1', cle: EPL, home: 'Man City', away: 'Liverpool', coup: T0 + 5 * H, at: iso(T0), wh: [2.32, 3.4, 3.3] }), match({ id: 'epl-2', cle: EPL, home: 'Arsenal', away: 'Chelsea', coup: T0 + 30 * H, at: iso(T0) })], quota: { remaining: 466, used: 34, last: 1 } }
      : { matches: [], quota: { remaining: 466, used: 34, last: 0 } };
  const r2 = await appel('POST', '/api/sources/odds/refresh-cible', { cles: [EPL, LIGA] });
  const apres = lireInstantane();
  sortie.e2 = { code: r2.code, appels: globalThis.__appelsPayants, reponse: r2.corps };
  sortie.e3 = {
    bilan: JSON.parse(fs.readFileSync(fichierBilan, 'utf8')),
    sha1Depot: crypto.createHash('sha1').update(fs.readFileSync(path.join(serveur, 'src', 'data', 'repositories', 'relevePayantRepository.js'))).digest('hex')
  };
  sortie.e7 = { retires: r2.corps?.retires ?? null, instantaneApres: apres.map((m) => [m.id, m.sport_key]), cles: r2.corps?.cles ?? null };
  // Le conseil relu après (le VRAI, sans injection) : il lit le bilan de ce relevé (2 clés demandées, 466 restants).
  injecter(null);
  const c = await appel('GET', '/api/odds/conseil-releve');
  sortie.conseilApres = { code: c.code, restants: c.corps?.credits?.restants ?? null, releveCible: Boolean(c.corps?.releveCible) };

  // E6 — deux relevés à la fois : le premier attend sa réponse ; le second (ciblé ou complet) reçoit 409, sans appel.
  globalThis.__appelsPayants = [];
  let ouvrir;
  const porte = new Promise((r) => (ouvrir = r));
  globalThis.__reponsePayante = async (cle) => {
    await porte;
    return { matches: cle === EPL ? [match({ id: 'epl-1', cle: EPL, home: 'Man City', away: 'Liverpool', coup: T0 + 5 * H, at: iso(T0) })] : [], quota: { remaining: 465, used: 35, last: 1 } };
  };
  injecter([EPL]);
  const premier = appel('POST', '/api/sources/odds/refresh-cible', { cles: [EPL] });
  for (let i = 0; i < 10_000 && !verrouDe(); i++) await new Promise((r) => setImmediate(r));
  const enCours = verrouDe();
  // Le second et le complet sont lancés sans les attendre (sans verrou, ils attendraient la porte eux aussi), puis quelques
  // tours de boucle : un relevé parti sans verrou aurait déjà appelé le client payant.
  const secondEnVol = appel('POST', '/api/sources/odds/refresh-cible', { cles: [LIGA] });
  const completEnVol = appel('POST', '/api/sources/odds/refresh', undefined);
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
  const appelsPendant = globalThis.__appelsPayants.map((a) => a.cle);
  ouvrir();
  const [r6, second, complet] = await Promise.all([premier, secondEnVol, completEnVol]);
  const troisieme = await appel('POST', '/api/sources/odds/refresh-cible', { cles: [EPL] });
  injecter(null);
  sortie.e6 = { enCours, second: { code: second.code, erreur: second.corps?.error ?? null }, complet: { code: complet.code, erreur: complet.corps?.error ?? null }, appelsPendant, premier: r6.code, apres: { code: troisieme.code, verrou: verrouDe() }, appels: globalThis.__appelsPayants.map((a) => a.cle) };

  // E10 — le relevé complet, inchangé : les 37 clés, la même requête, les mêmes champs de réponse.
  globalThis.__appelsPayants = [];
  globalThis.__reponsePayante = (cle) => ({ matches: cle === EPL ? [match({ id: 'epl-1', cle: EPL, home: 'Man City', away: 'Liverpool', coup: T0 + 5 * H, at: iso(T0) })] : [], quota: { remaining: 430, used: 70, last: cle === EPL ? 1 : 0 } });
  const r10 = await appel('POST', '/api/sources/odds/refresh', undefined);
  sortie.e10 = {
    code: r10.code,
    champs: Object.keys(r10.corps ?? {}).sort(),
    appels: globalThis.__appelsPayants.length,
    cles: globalThis.__appelsPayants.map((a) => a.cle),
    options: [...new Set(globalThis.__appelsPayants.map((a) => JSON.stringify(a.options)))],
    bilan: (({ clesDemandees, cout, quota }) => ({ clesDemandees, cout, quota }))(JSON.parse(fs.readFileSync(fichierBilan, 'utf8')))
  };
  const { default: routes } = await imp('api/routes/sources.routes.js');
  sortie.routeur = routes.stack.map((c2) => [Object.keys(c2.route.methods).join(','), c2.route.path]);
} else if (phase === 'vieilles') {
  // E4, horloge RÉELLE : saveOddsMatches date le fichier à l'heure du disque.
  const maintenant = Date.now();
  const T0 = maintenant - 3 * H;
  ecrire('fraicheur-cotes.json', { maxAgeMinutes: 60, avantCompos: true, enregistreLe: iso(T0) });
  const coupL1 = maintenant + 50 * MIN; // compositions annoncées il y a 10 min
  const ancien = [
    match({ id: 'vieux-epl', cle: EPL, home: 'Man City', away: 'Liverpool', coup: maintenant + 5 * H, at: iso(T0) }),
    match({ id: 'vieux-l1', cle: L1, home: 'Essai Lyon', away: 'Essai Nantes', coup: coupL1, at: iso(T0) }),
    match({ id: 'vieux-liga', cle: LIGA, home: 'Essai Betis', away: 'Essai Sevilla', coup: maintenant + 4 * H, at: iso(T0) })
  ];
  // Le calendrier FotMob connaît le match de Ligue 1 (le jour seulement).
  ecrire('season-calendar.json', [{ league: NOMS_DES_CLES[L1], homeName: 'Essai Lyon', awayName: 'Essai Nantes', date: iso(coupL1).slice(0, 10) }]);
  ecrireInstantane(ancien, T0);
  const { archiverReleveSiNouveau } = await imp('data/enregistreurs/cotesPayantes.js');
  const { vider } = await imp('data/enregistreurs/file.js');
  archiverReleveSiNouveau({ maintenant, database });
  await vider({ maintenant, database });
  const { listAdaptedMatches } = await imp('data/matchSources.js');
  const anciensAutres = listAdaptedMatches('odds-api').filter((m) => !String(m.matchId).startsWith('cal-') && m.league !== NOMS_DES_CLES[EPL]);
  sortie.anciensAutres = anciensAutres.map((m) => m.matchId).sort();

  // Le relevé ciblé de l'EPL : des cotes relevées à l'instant.
  globalThis.__reponsePayante = (cle) => (cle === EPL ? { matches: [match({ id: 'vieux-epl', cle: EPL, home: 'Man City', away: 'Liverpool', coup: maintenant + 5 * H, at: iso(Date.now()), wh: [2.32, 3.4, 3.3] })], quota: { remaining: 400, used: 100, last: 1 } } : null);
  const appel = await application();
  // Le relevé de l'EPL seule (le conseil du clic injecté : la Ligue 1, à relever, n'est volontairement pas demandée).
  injecter([EPL]);
  const r = await appel('POST', '/api/sources/odds/refresh-cible', { cles: [EPL] });
  injecter(null);
  sortie.releve = { code: r.code, erreur: r.corps?.error ?? null, retires: r.corps?.retires?.map((c) => c.cle) ?? null };
  const heureFichier = fs.statSync(fichierInstantane).mtime.toISOString();
  const tApres = Date.now();
  archiverReleveSiNouveau({ maintenant: tApres, database });
  await vider({ maintenant: tApres, database });
  const contenu = lireInstantane();
  // (i) plus aucun match d'un autre championnat dans l'instantané.
  sortie.i = contenu.filter((m) => m.sport_key !== EPL).map((m) => m.id);
  // (ii) chaque heure de cote du fichier est à 30 min au plus de l'heure du fichier (détecteur indépendant de l'heure du fichier).
  const borne = Date.parse(heureFichier) - 30 * MIN;
  sortie.ii = contenu.flatMap((m) => m.bookmakers.flatMap((b) => [b.last_update, ...(b.markets ?? []).map((k) => k.last_update)])).filter((at) => Date.parse(at) < borne);
  // (iii) la fraîcheur des matchs des autres championnats : jamais « fraîche », jamais l'heure du nouveau fichier.
  const { fraicheurDuMatch } = await imp('data/cotesDeVosBookmakers.js');
  const { fraicheurCote } = await imp('core/engine/fraicheurCotes.js');
  const { lireReglageFraicheur } = await imp('data/repositories/fraicheurCotesRepository.js');
  const reglage = lireReglageFraicheur().reglage;
  const actuels = new Map(listAdaptedMatches('odds-api').map((m) => [m.matchId, m]));
  sortie.iii = [];
  for (const ancienMatch of anciensAutres) {
    const m = actuels.get(ancienMatch.matchId) ?? ancienMatch;
    const f = fraicheurDuMatch(m, { database, maintenant: tApres });
    for (const [livreCle, h] of Object.entries(f.parBookmaker)) {
      const etat = fraicheurCote({ releveAt: h.releveAt, maintenant: tApres, coupDEnvoi: m.commenceTime, heureSure: true, reglage }).etat;
      if (etat === 'fraiche' || h.releveAt === heureFichier) sortie.iii.push({ match: m.matchId, livre: livreCle, releveAt: h.releveAt, etat });
    }
    if (actuels.has(ancienMatch.matchId)) sortie.iii.push({ match: ancienMatch.matchId, encoreCote: true });
  }
  // (iv) l'archive n'a aucune cote d'un autre championnat à l'heure du nouveau fichier.
  sortie.iv = database
    .prepare(`SELECT e.source_event AS ev, COUNT(*) AS n FROM odds_events e JOIN odds_quotes q ON q.event_id = e.id WHERE e.source = 'odds-api' AND e.league != ? AND q.releve_at = ? GROUP BY e.id`)
    .all(NOMS_DES_CLES[EPL], heureFichier);
  // (v) le conseil : le match de Ligue 1 (compositions annoncées) n'a pas de cote fraîche — « cotes absentes », heure de l'archive.
  const { conseilReleveActuel } = await imp('data/conseilReleve.js');
  const c = conseilReleveActuel({ maintenant: tApres, database });
  sortie.v = { conseil: c.conseil, matchs: c.matchs.map((m) => ({ league: m.league, home: m.home, cotes: m.cotes, heureSure: m.heureSure, heureDe: m.heureDe ?? null })), cles: c.releveCible?.cles ?? null };
  sortie.heureFichier = heureFichier;
} else if (phase === 'archive') {
  // E9, heure figée (05/10 12 h) : le relevé complet de la veille (20 h) avait la Ligue 1 (coup d'envoi à 14 h) et l'EPL ;
  // le relevé ciblé de 11 h n'a relevé que l'EPL (coup d'envoi à 15 h).
  const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
  const coupL1 = T0 + 2 * H;
  const coupEpl = T0 + 3 * H;
  ecrire('season-calendar.json', [
    { league: NOMS_DES_CLES[L1], homeName: 'Essai Lyon', awayName: 'Essai Nantes', date: iso(coupL1).slice(0, 10) },
    { league: NOMS_DES_CLES[EPL], homeName: 'Man City', awayName: 'Liverpool', date: iso(coupEpl).slice(0, 10) }
  ]);
  const { archiverReleveSiNouveau } = await imp('data/enregistreurs/cotesPayantes.js');
  const { vider } = await imp('data/enregistreurs/file.js');
  const veille = T0 - 16 * H;
  ecrireInstantane([match({ id: 'l1-archive', cle: L1, home: 'Essai Lyon', away: 'Essai Nantes', coup: coupL1, at: iso(veille) }), match({ id: 'epl-1', cle: EPL, home: 'Man City', away: 'Liverpool', coup: coupEpl, at: iso(veille) })], veille);
  archiverReleveSiNouveau({ maintenant: veille + MIN, database });
  await vider({ maintenant: veille + MIN, database });
  const cible = T0 - H;
  ecrireInstantane([match({ id: 'epl-1', cle: EPL, home: 'Man City', away: 'Liverpool', coup: coupEpl, at: iso(cible) })], cible);
  archiverReleveSiNouveau({ maintenant: cible + MIN, database });
  await vider({ maintenant: cible + MIN, database });
  const { listAdaptedMatches } = await imp('data/matchSources.js');
  sortie.page = listAdaptedMatches('odds-api').map((m) => ({ matchId: m.matchId, league: m.league, hasOdds: Boolean(m.hasOdds) }));
  const { conseilReleveActuel } = await imp('data/conseilReleve.js');
  const c = conseilReleveActuel({ maintenant: T0, database });
  sortie.conseil = {
    conseil: c.conseil,
    moment: c.moment?.a ?? null,
    matchs: c.matchs.map((m) => ({ matchId: m.matchId, league: m.league, coupDEnvoi: m.coupDEnvoi, heureSure: m.heureSure, cotes: m.cotes, releveAt: m.releveAt, heureDe: m.heureDe ?? null, heureDonneeLe: m.heureDonneeLe ?? null })),
    proches: c.proches,
    raison: c.raison,
    releveCible: c.releveCible ? { actif: c.releveCible.actif, cles: c.releveCible.cles, encoreJouables: c.releveCible.encoreJouables.map((x) => x.cle), retires: c.releveCible.retires.map((x) => x.cle), plusTard: c.releveCible.textes.plusTard } : null
  };
} else if (phase === 'tard') {
  // E9 bis, heure figée (05/10 12 h) : deux matchs du calendrier, aujourd'hui, de championnats absents de l'instantané et
  // jamais archivés (Ligue 1, Bundesliga) : aucune heure à reprendre. Le conseil est lu à midi, 15 h, 15 h 01 et 18 h.
  const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
  const jour = iso(T0).slice(0, 10);
  ecrire('season-calendar.json', [
    { league: NOMS_DES_CLES[L1], homeName: 'Essai Lyon', awayName: 'Essai Nantes', date: jour },
    { league: NOMS_DES_CLES[BUNDES], homeName: 'Essai Bayern', awayName: 'Essai Mainz', date: jour }
  ]);
  // L'instantané n'a que l'EPL, avec un match au-delà des 24 h du conseil, à chacune des quatre lectures.
  ecrireInstantane([match({ id: 'epl-loin', cle: EPL, home: 'Man City', away: 'Liverpool', coup: T0 + 50 * H, at: iso(T0 - H) })], T0 - H);
  const { conseilReleveActuel } = await imp('data/conseilReleve.js');
  const lire = (maintenant) => {
    const c = conseilReleveActuel({ maintenant, database });
    return { conseil: c.conseil, proches: c.proches, sansHeure: /du calendrier sans heure connue/.test(c.raison ?? '') };
  };
  sortie.tard = { midi: lire(T0), quinzeHeures: lire(T0 + 3 * H), quinzeHeuresUne: lire(T0 + 3 * H + MIN), dixHuitHeures: lire(T0 + 6 * H) };
} else if (phase === 'liste') {
  // Correction S4, heure figée : le serveur relit le conseil AVANT tout appel payant. (a) clés ≠ conseil ; (b) conseil
  // « plus-tard » (bouton éteint) ; (d) sans injection, le VRAI conseil de la copie, qui ne peut pas proposer la
  // Bundesliga (son seul match est joué) : 409, aucun appel, ni l'instantané ni le bilan ne bougent (octets et heure),
  // verrou rendu. (c) les mêmes clés, dans un autre ordre : le relevé part.
  const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
  const avant = T0 - 2 * H;
  ecrireInstantane(
    [
      match({ id: 'epl-1', cle: EPL, home: 'Man City', away: 'Liverpool', coup: T0 + 5 * H, at: iso(avant) }),
      match({ id: 'liga-1', cle: LIGA, home: 'Betis', away: 'Sevilla', coup: T0 + 6 * H, at: iso(avant) }),
      match({ id: 'bundes-1', cle: BUNDES, home: 'Bayern', away: 'Mainz', coup: T0 - 5 * H, at: iso(avant) })
    ],
    avant
  );
  ecrire('releve-payant.json', { version: 1, at: iso(avant), clesDemandees: 37, clesRelevees: [EPL, LIGA, BUNDES], echecs: [], matchs: 3, quota: { restants: 467, utilises: 33 }, cout: 3, coutParCle: {}, matchsParCle: {} });
  fs.utimesSync(fichierBilan, new Date(avant), new Date(avant));
  const appel = await application();
  const { releveEnCoursDe } = await imp('data/providers/liveDataSync.js');
  globalThis.__appelsPayants = [];
  globalThis.__reponsePayante = (cle) => ({ matches: cle === EPL ? [match({ id: 'epl-1', cle: EPL, home: 'Man City', away: 'Liverpool', coup: T0 + 5 * H, at: iso(T0) })] : [], quota: { remaining: 465, used: 35, last: cle === EPL ? 1 : 0 } });
  const fichiers = () => JSON.stringify({ instantane: empreinte(fichierInstantane), bilan: empreinte(fichierBilan) });
  const essai = async (nom, cles) => {
    const avantEssai = fichiers();
    const n = globalThis.__appelsPayants.length;
    const r = await appel('POST', '/api/sources/odds/refresh-cible', { cles });
    return { nom, code: r.code, erreur: r.corps?.error ?? null, appels: globalThis.__appelsPayants.length - n, inchanges: fichiers() === avantEssai, verrou: typeof releveEnCoursDe === 'function' ? releveEnCoursDe() : 'absent' };
  };
  sortie.liste = [];
  injecter([EPL, LIGA]);
  sortie.liste.push(await essai('a cles differentes', [EPL]));
  injecter([EPL], { actif: false, conseil: 'plus-tard' });
  sortie.liste.push(await essai('b bouton eteint', [EPL]));
  injecter(null);
  sortie.liste.push(await essai('d vrai conseil', [BUNDES]));
  // (e) ajouté le 19/11 (remarque a de la contre-vérification) : autant de clés que le conseil, mais pas les mêmes — une
  // confirmation restée ouverte alors que la vague suivante a autant de championnats.
  injecter([EPL, LIGA]);
  sortie.liste.push(await essai('e meme nombre autres cles', [EPL, BUNDES]));
  injecter([EPL, LIGA]);
  sortie.liste.push(await essai('c memes cles', [LIGA, EPL]));
  injecter(null);
  sortie.listeAppels = globalThis.__appelsPayants.map((a) => a.cle);
  const { conseilReleveActuel } = await imp('data/conseilReleve.js');
  const vrai = conseilReleveActuel({ maintenant: T0, database });
  sortie.vraiConseil = { conseil: vrai.conseil, actif: vrai.releveCible?.actif ?? null, cles: vrai.releveCible?.cles ?? null };
} else if (phase === 'debut') {
  // Correction S7, horloge RÉELLE : l'instantané est daté du DÉBUT du relevé. La clé 1 (EPL) répond tout de suite (heure
  // t1), la clé 2 (Liga) après 1,2 s ; l'annonce des compositions du match de l'EPL tombe ENTRE t1 et l'écriture (t1 +
  // 0,6 s). Daté de la fin, sa cote de t1 passerait pour relevée après l'annonce (fraîche) ; datée du début, elle reste
  // « avant les compositions ».
  ecrire('fraicheur-cotes.json', { maxAgeMinutes: 60, avantCompos: true, enregistreLe: iso(Date.now() - H) });
  ecrireInstantane([], Date.now() - 2 * H);
  let t1 = null;
  let coupEpl = null;
  globalThis.__reponsePayante = async (cle) => {
    if (cle === EPL) {
      t1 = Date.now();
      coupEpl = t1 + 60 * MIN + 600;
      return { matches: [match({ id: 'epl-debut', cle: EPL, home: 'Man City', away: 'Liverpool', coup: coupEpl, at: iso(t1) })], quota: { remaining: 400, used: 100, last: 1 } };
    }
    await new Promise((r) => setTimeout(r, 1200));
    return { matches: [], quota: { remaining: 400, used: 100, last: 0 } };
  };
  const appel = await application();
  injecter([EPL, LIGA]);
  const debut = Date.now();
  const r = await appel('POST', '/api/sources/odds/refresh-cible', { cles: [EPL, LIGA] });
  injecter(null);
  const fin = Date.now();
  const heureFichier = fs.statSync(fichierInstantane).mtimeMs;
  const annonce = coupEpl - 60 * MIN;
  const tApres = Math.max(fin, annonce) + 50;
  const { fraicheurCote } = await imp('core/engine/fraicheurCotes.js');
  const f = fraicheurCote({ releveAt: new Date(heureFichier).toISOString(), maintenant: tApres, coupDEnvoi: iso(coupEpl), heureSure: true, reglage: { maxAgeMinutes: 60, avantCompos: true } });
  const { conseilReleveActuel } = await imp('data/conseilReleve.js');
  const c = conseilReleveActuel({ maintenant: tApres, database });
  sortie.debut = {
    code: r.code,
    erreur: r.corps?.error ?? null,
    fichierEntreDebutEtT1: heureFichier >= debut - 5 && heureFichier <= t1,
    annonceEntreT1EtFin: t1 < annonce && annonce < fin,
    dureeMs: fin - debut,
    fraicheur: { etat: f.etat, code: f.code },
    conseil: c.matchs.filter((m) => m.home === 'Man City').map((m) => ({ cotes: m.cotes, releveAt: m.releveAt === null ? null : Date.parse(m.releveAt) <= t1 }))
  };
} else {
  throw new Error(`Phase inconnue : ${phase}`);
}

console.log(JSON.stringify(sortie));
