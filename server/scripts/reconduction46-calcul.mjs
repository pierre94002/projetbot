/**
 * reconduction46-calcul.mjs — LE CALCUL D'UN CÔTÉ de la preuve d'identité (étape 46, § 2.7 ; PROJET § 1 point 7 (b) et (c)).
 * Jamais lancé à la main : scripts/reconduction46.mjs --preuve le lance DANS une copie de travail de chaque version (le harnais
 * de cette version : test/aides/isolement.mjs, préchargé garde.mjs — réseau coupé, heure figée à l'instant de la nuit, base de
 * la copie contrôlée, aucune clé) :
 *   node --import garde.mjs reconduction46-calcul.mjs <serveur de la copie> --instant <ISO> [--liste <json>] [--lectures <ids>]
 * 1. La liste des matchs de la nuit : celle du fichier --liste (la MÊME pour les deux versions), sinon celle que calcule ce code
 *    (listeDesMatchsAVenir, dans le serveur), rendue pour l'autre côté.
 * 2. La vraie nuit des matchs de ce code (simulerLesMatchsDeLaNuit : enrichissement sans repli payant, analyse en service,
 *    entreesDeLAnalyse ; sans candidate, sans jugement) sur SA copie de la base ; puis ses lignes « service » relues.
 * 3. Si --lectures (les variantes du sceau, séparées par des virgules) : les lectures du direct de chaque ligne aux états de
 *    l'étalonnage (ETATS_D_ETALONNAGE × CRENEAUX_D_ETALONNAGE), comme etalonnageEtage1 du banc (lecturesDuRejeu, coupes du
 *    banc, sans effets de PARAMS_SANS_EFFETS), réduites à leurs nombres.
 * 4. (O15, 18/11) L'IDENTITÉ COMPLÈTE de ce côté, lue par ce code au moment de la preuve : l'empreinte de son code et celle de
 *    ses réglages (football, ceux de SA copie : data/runtime/engine-config.json, posé par --reglages-n / --reglages-np), et,
 *    pour chaque numéro de version porté par ses lignes, l'identité que SON registre des versions lui donne.
 * 5. (O16, 18/11 soir) Chaque ligne dit si elle porte une cote : `avecCotes` = son odds_source n'est PAS le texte « sans cote »
 *    de CE code (sourceDesCotes(null).oddsSource : gelPronostics.js n'est pas touché), et `typeCotes` (payant, gratuit, autre).
 *    Les matchs de la fenêtre restés SANS LIGNE (échecs, sans identifiant) sont nommés (`sansLigne`). La liste calculée par N
 *    repasse par le JSON avant le calcul (m9 : les deux côtés lisent la même chose). Avec --identite-seule : seulement
 *    l'identité et celles du registre (--numeros), sans ouvrir la base (le contrôle d'identité AVANT les nuits).
 * Aucune issue n'est lue ni rendue : seulement des chiffres d'avant-match. Dernière ligne de la sortie : le JSON du résultat.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [serveur, ...reste] = process.argv.slice(2);
const option = (nom) => {
  const i = reste.indexOf(nom);
  return i >= 0 ? reste[i + 1] : undefined;
};
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const EV = await imp('core/engine/engineVersions.js');
/** L'identité de ce côté (code + réglages du football) et celles que le registre de la copie donne aux numéros `numeros`. */
function identites(numeros) {
  const code = EV.empreinteDuCode({ racine: path.join(serveur, 'src'), rafraichir: true }).empreinte;
  const etat = EV.etatDuMoteur({ racine: path.join(serveur, 'src') });
  const identite = { code, reglages: etat.empreinteReglages?.football ?? null };
  if (etat.code?.empreinte !== code) throw new Error('empreinte du code : deux lectures différentes');
  const registre = {};
  let registreBrut = null;
  try {
    registreBrut = JSON.parse(fs.readFileSync(EV.FICHIER_VERSIONS, 'utf8'));
  } catch {
    registreBrut = null;
  }
  for (const n of numeros) {
    const v = Array.isArray(registreBrut?.versions) ? registreBrut.versions.filter((x) => x?.numero === n) : [];
    registre[n] = v.length === 1 ? { code: v[0].code?.empreinte ?? null, reglages: v[0].empreinteReglages?.football ?? null } : null;
  }
  return { code, identite, registre };
}
if (reste.includes('--identite-seule')) {
  const numeros = String(option('--numeros') ?? '').split(',').filter(Boolean).map(Number).filter(Number.isInteger);
  const { code, identite, registre } = identites(numeros);
  console.log(JSON.stringify({ ok: true, mode: 'identite-seule', empreinte: code, identite, registre }));
  process.exit(0);
}

const instant = Date.parse(option('--instant') ?? '');
if (!Number.isFinite(instant)) throw new Error('--instant : une date ISO');
const { openDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (!process.env.MATCH_STATS_DB || path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('base inattendue : seule la copie de la preuve est permise');
const db = openDb();
const SN = await imp('data/simulation/simulationNuit.js');
const { FENETRE_H } = await imp('data/simulation/reglages.js');
// B1 (O16) : le texte « sans cote » de CE code, tel que son moteur l'écrit (gelPronostics.js lu, jamais modifié).
const SANS_COTE = (await imp('data/enregistreurs/gelPronostics.js')).sourceDesCotes(null).oddsSource;

// 1. La liste.
let liste;
let listeCalculee = false;
const fichierListe = option('--liste');
if (fichierListe) liste = JSON.parse(fs.readFileSync(fichierListe, 'utf8'));
else {
  liste = (await SN.listeDesMatchsAVenir({ instant, aPart: false })).liste;
  listeCalculee = true;
  // m9 (O16) : la liste de N repasse par le JSON, comme celle que N′ relit du fichier.
  liste = JSON.parse(JSON.stringify(liste ?? null));
}
if (!Array.isArray(liste)) throw new Error('liste des matchs illisible');

// 2. La nuit des matchs de ce code.
const calculeLe = new Date(instant).toISOString();
const r = await SN.simulerLesMatchsDeLaNuit({ maintenant: calculeLe, database: db, matchs: liste, aPart: false, candidate: null, juger: false });
const lignes = db
  .prepare("SELECT fixture_key AS cle, match_id AS matchId, grille, engine_version AS engineVersion, lambda, mu, rho, fair, odds_source AS oddsSource, league, home_name AS home, away_name AS away, date FROM simulation_matchs WHERE role = 'service' AND calcule_le = ? ORDER BY fixture_key")
  .all(calculeLe)
  .map(({ home, away, date, ...l }) => {
    const avecCotes = typeof l.oddsSource === 'string' && l.oddsSource !== '' && l.oddsSource !== SANS_COTE;
    const typeCotes = !avecCotes ? null : l.oddsSource.startsWith('The Odds API') ? 'payant' : l.oddsSource.startsWith('cotes gratuites') ? 'gratuit' : 'autre';
    return { ...l, avecCotes, typeCotes, _qui: idDuMatch(l.matchId, home, away, date) };
  });

// I1 (O16) : les matchs de la fenêtre restés SANS LIGNE (échecs, sans identifiant), nommés par leur identifiant (sinon les noms et le jour).
function idDuMatch(matchId, home, away, date) {
  const s = matchId === null || matchId === undefined ? '' : String(matchId).trim();
  return s !== '' && s !== '0' ? `id:${s}` : `nom:${home ?? ''}|${away ?? ''}|${date ?? ''}`;
}
const avecLigne = new Set(lignes.map((l) => l._qui));
const sansLigne = [];
for (const m of liste) {
  const ko = SN.coupDEnvoiDe(m);
  if (!(Number.isFinite(ko.effectif) && ko.effectif > instant && ko.effectif <= instant + FENETRE_H * 3_600_000)) continue;
  const qui = idDuMatch(m.matchId, m.home, m.away, ko.date);
  if (!avecLigne.has(qui)) sansLigne.push(qui);
}
for (const l of lignes) delete l._qui;

// 3. Les lectures du direct aux états de l'étalonnage.
let lectures = null;
const ids = option('--lectures');
if (ids) {
  const variantes = ids.split(',').filter(Boolean);
  const R = await imp('data/direct/rejeuDuDirect.js');
  const D = await imp('data/direct/declarationDuDirect.js');
  const { COUPES } = await imp('data/direct/reglagesDirect.js');
  const { PARAMS_SANS_EFFETS } = await imp('data/simulation/simulationMatchsEnfant.js');
  const etats = [];
  for (const c of D.CRENEAUX_D_ETALONNAGE) for (const e of D.ETATS_D_ETALONNAGE) etats.push({ creneau: c, part: 0, ...e });
  lectures = { etats: D.ETATS_D_ETALONNAGE.length, creneaux: D.CRENEAUX_D_ETALONNAGE.length, variantes, parLigne: {} };
  for (const l of lignes) {
    const lu = R.lecturesDuRejeu({ ligne: { lambda: l.lambda, mu: l.mu, rho: l.rho, fair: l.fair, grille: l.grille }, etats, variantes, paramsSansEffets: PARAMS_SANS_EFFETS, coupes: COUPES.banc, championnat: l.league ?? null });
    const a = lu.ancrage ?? {};
    const nombres = [a.fait === true ? 1 : 0, a.lambda ?? null, a.mu ?? null, a.ecart ?? null];
    for (const p of lu.points) {
      for (const v of variantes) {
        const x = p.lectures[v] ?? {};
        nombres.push(x.valide ? 1 : 0, x.somme ?? null, x.negligee ?? null, x.plafonnee ?? null, ...(x.un2 ?? [null, null, null]), ...Object.values(x.buts ?? {}));
      }
    }
    lectures.parLigne[l.cle] = nombres.map((n) => (typeof n === 'number' && Number.isFinite(n) ? n : null));
  }
}

// 4. L'identité de ce côté (code + réglages du football), et celles que le registre de la copie donne aux numéros des lignes.
const { code, identite, registre } = identites([...new Set(lignes.map((l) => l.engineVersion).filter((x) => Number.isInteger(x)))]);
const nombre = (x) => (Number.isInteger(x) ? x : Array.isArray(x) ? x.length : null);
console.log(JSON.stringify({ ok: true, calculeLe, mode: r.mode ?? null, bilan: { matchs: nombre(r.bilan?.matchs), dansLaFenetre: nombre(r.bilan?.dansLaFenetre), analyses: nombre(r.bilan?.analyses), sansIdentifiant: nombre(r.bilan?.sansIdentifiant), echecs: nombre(r.bilan?.echecs), echantillons: r.bilan?.echantillons ?? [] }, sansLigne: [...new Set(sansLigne)].sort(), empreinte: code, identite, registre, liste: listeCalculee ? liste : null, lignes, lectures }));
