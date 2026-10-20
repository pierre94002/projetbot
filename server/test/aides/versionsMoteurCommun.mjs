/**
 * Ce que partagent les scripts d'essai de l'étape 25 (versions du moteur, candidate à blanc) — ce n'est
 * PAS un fichier de test. Chargé par test/aides/script-versions-moteur.mjs et script-moteur-a-blanc.mjs,
 * exécutés dans une copie isolée (isolement.mjs : réseau coupé, heure figée, base d'essai copiée,
 * data/runtime à elle) : jamais le registre des versions de data/runtime du bac ni du dépôt.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

export const importeur = (serveur) => (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

export const sha1 = (texte) => crypto.createHash('sha1').update(texte).digest('hex');
/** Un fichier tel qu'il est (octets et date), ou « absent » : prouve qu'une demande n'a rien réécrit. */
export function photo(fichier) {
  if (!fs.existsSync(fichier)) return 'absent';
  return `${sha1(fs.readFileSync(fichier))}:${fs.statSync(fichier).mtimeMs}`;
}
/** Le contenu de data/runtime : nom → empreinte (prouve qu'aucun fichier n'apparaît ni ne change). */
export function photoDuDossier(dossier) {
  if (!fs.existsSync(dossier)) return {};
  return Object.fromEntries(
    fs
      .readdirSync(dossier, { recursive: true })
      .map(String)
      .filter((f) => fs.statSync(path.join(dossier, f)).isFile())
      .sort()
      .map((f) => [f.split(path.sep).join('/'), sha1(fs.readFileSync(path.join(dossier, f)))])
  );
}

/** L'application Express, appelée sans réseau : une requête fabriquée (corps JSON facultatif), la réponse captée. */
export function requeteExpress(app, methode, url, corps = undefined) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage(new Socket());
    req.method = methode;
    req.url = url;
    req.headers = { host: 'essai', ...(corps !== undefined ? { 'content-type': 'application/json' } : {}) };
    if (corps !== undefined) {
      const texte = JSON.stringify(corps);
      req.headers['content-length'] = String(Buffer.byteLength(texte));
      req.push(texte);
    }
    req.push(null);
    const res = new http.ServerResponse(req);
    const morceaux = [];
    res.write = (c) => {
      morceaux.push(Buffer.from(c));
      return true;
    };
    res.end = (c) => {
      if (c) morceaux.push(Buffer.from(c));
      let r = null;
      try {
        r = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
      } catch {
        // laissé à null
      }
      resolve({ code: res.statusCode, corps: r });
      return res;
    };
    app.handle(req, res, reject);
  });
}

/** Un faux relevé The Odds API (le fichier de la COPIE), deux matchs d'EPL le 05/10/2026 au soir (après l'heure figée, 12 h). */
const h2h = (home, away, [o1, ox, o2]) => ({ key: 'h2h', outcomes: [{ name: home, price: o1 }, { name: away, price: o2 }, { name: 'Draw', price: ox }] });
const livre = (key, title, home, away, cotes) => ({ key, title, last_update: '2026-10-05T11:45:00Z', markets: [h2h(home, away, cotes)] });
const rencontre = (id, home, away, coup, livres) => ({
  id,
  sport_key: 'soccer_epl',
  sport_title: 'EPL',
  commence_time: coup,
  home_team: home,
  away_team: away,
  bookmakers: livres.map(([key, title, cotes]) => livre(key, title, home, away, cotes))
});
export const MATCHS_COTES = [
  rencontre('essai-v1', 'Man City', 'Liverpool', '2026-10-05T18:30:00Z', [
    ['pinnacle', 'Pinnacle', [2.0, 3.6, 3.9]],
    ['williamhill', 'William Hill', [2.3, 3.4, 3.3]],
    ['betclic_fr', 'Betclic (FR)', [1.9, 3.3, 3.6]]
  ]),
  rencontre('essai-v2', 'Arsenal', 'Chelsea', '2026-10-05T19:00:00Z', [
    ['pinnacle', 'Pinnacle', [1.8, 3.9, 4.6]],
    ['unibet_nl', 'Unibet (NL)', [1.85, 3.8, 4.4]]
  ])
];
export async function ecrireInstantane(imp) {
  const { getFixturePaths } = await imp('data/repositories/fixturesRepository.js');
  const fichier = getFixturePaths().odds;
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, JSON.stringify([{ data: MATCHS_COTES }]));
  const t = new Date('2026-10-05T11:50:00.000Z');
  fs.utimesSync(fichier, t, t);
  return fichier;
}

/** Trois matchs du calendrier du 06/10/2026 (ceux du test du gel, étape E), dont un avec des cotes gratuites. */
export async function matchsDuCalendrier(imp) {
  const { adaptSeasonCalendarMatch } = await imp('data/adapters/seasonCalendarAdapter.js');
  const cal = (league, homeName, awayName) => adaptSeasonCalendarMatch({ league, homeName, awayName, date: '2026-10-06' }, 10000);
  const avecCotes = (match, [o1, ox, o2], releveAt) => ({
    ...match,
    hasOdds: true,
    oddsSource: 'gratuit',
    marketOdds: {
      odds1: o1,
      oddsDraw: ox,
      odds2: o2,
      bookmakersCount: 1,
      byBookmaker: [{ key: 'espn_draftkings', title: 'DraftKings · ESPN', odds1: o1, oddsDraw: ox, odds2: o2, referenceOnly: true, source: 'espn', releveAt }],
      source: 'gratuit',
      sources: ['espn'],
      releveAt,
      kickoff: null
    }
  });
  return [cal('EPL', 'Aston Villa', "Nott'm Forest"), avecCotes(cal('Championship', 'Charlton', 'Portsmouth'), [2.1, 3.3, 3.6], '2026-10-05T09:00:00.000Z'), cal('Serie A - Italy', 'Inter', 'Udinese')];
}

/** Le moteur sur un match (le chemin des analyses automatiques : sans repli payant), avec les réglages EN SERVICE. */
export async function moteurDe(imp, match) {
  const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
  const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
  const { getEngineConfig } = await imp('core/engine/engineConfig.js');
  const { getTiltState } = await imp('core/engine/tiltState.js');
  const { getSport } = await imp('sports/index.js');
  return analyzeMatch(await enrichMatchWithRealAverages(match, { sansRepliPayant: true }), getEngineConfig('football'), getTiltState(), getSport('football'));
}

/** Un résultat du moteur sans son numéro de version : pour comparer les CHIFFRES de deux calculs. */
export const sansVersion = (dto) => {
  const { engineVersion, ...reste } = dto ?? {};
  return reste;
};
