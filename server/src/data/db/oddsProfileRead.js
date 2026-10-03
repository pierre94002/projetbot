/**
 * oddsProfileRead.js — profilage de cotes
 * -----------------------------------------------------------------------
 * Pour un match à venir : retrouver les matchs PASSÉS dont les cotes
 * ressemblaient aux siennes, et compter comment ils ont fini.
 *
 * « Lorsque le favori à domicile est coté autour de 1,85 et l'extérieur
 * autour de 3,55, à 13 % près, le domicile a gagné 62 % des 21 matchs de
 * ce championnat sur cette saison et la précédente. » Si la cote proposée
 * aujourd'hui paie plus que ce pourcentage ne le justifie (62 % × 1,85 =
 * 1,15 > 1), le pari est « value ».
 *
 * Les cotes passées viennent de football-data.co.uk (table match_odds),
 * les RÉSULTATS de FotMob (table matches) : le score qui fait foi est celui
 * du magasin, comme partout ailleurs. La mi-temps se lit dans le déroulé :
 * un but contre son camp y compte déjà pour l'équipe qui en profite.
 *
 * Semblable = cote domicile ET cote extérieur à l'écart choisi près ;
 * pour les portées « équipe », la seule cote de cette équipe.
 * -----------------------------------------------------------------------
 */

import { openDb } from './matchStatsDb.js';
import { findTeams, canonicalTeamNames, ensureRegistries } from './identityRegistry.js';
import { nameTokens } from '../../utils/nameIdentity.js';
import { teamNamesEqual } from '../../utils/teamNameMatch.js';
import { seasonOf, seasonBounds, seasonLabel } from '../providers/seasonWindows.js';
import { LIGUES_AVEC_COTES, SOURCE } from '../providers/footballDataOdds.js';

export const PORTEES = ['championnat-2', 'championnat-1', 'championnat-tout', 'equipe-domicile', 'equipe-exterieur'];
export const SEGMENTS = ['complet', 'mt1', 'mt2'];
export const ECARTS = [5, 8, 10, 13, 15, 20, 25];
/** En dessous, les pourcentages sont trop fragiles pour être lus seuls. */
export const MINIMUM_FIABLE = 10;
const LIMITE_LISTE = 150;

const arrondi = (x, d = 2) => (x === null || x === undefined ? null : Math.round(x * 10 ** d) / 10 ** d);

function marches(segment) {
  const p = segment === 'complet' ? "90'" : segment === 'mt1' ? '1re MT' : '2e MT';
  const [a, b, c, d] = segment === 'complet' ? [1.5, 2.5, 2.5, 3.5] : [0.5, 1.5, 1.5, 2.5];
  return [
    { key: '1', label: 'Domicile gagne', test: (h, x) => h > x },
    { key: 'N', label: 'Match nul', test: (h, x) => h === x },
    { key: '2', label: 'Extérieur gagne', test: (h, x) => h < x },
    { key: '1N', label: 'Domicile ou nul', test: (h, x) => h >= x },
    { key: '12', label: 'Pas de match nul', test: (h, x) => h !== x },
    { key: 'N2', label: 'Extérieur ou nul', test: (h, x) => h <= x },
    { key: `+${a}`, label: `${p} +${a}`, test: (h, x) => h + x > a },
    { key: `+${b}`, label: `${p} +${b}`, test: (h, x) => h + x > b },
    { key: 'BTTS', label: `${p} BTTS`, test: (h, x) => h > 0 && x > 0 },
    { key: `-${c}`, label: `${p} -${c}`, test: (h, x) => h + x < c },
    { key: `-${d}`, label: `${p} -${d}`, test: (h, x) => h + x < d },
    { key: 'NO BTTS', label: `${p} NO BTTS`, test: (h, x) => !(h > 0 && x > 0) }
  ];
}

/**
 * Cote du marché pour un marché du temps complet. Les doubles chances se
 * déduisent de la cote 1X2, marge comprise, comme le font les bookmakers :
 * 1/(1/1,85 + 1/3,95) = 1,26. Plus/moins et BTTS : l'appli ne relève que
 * le 1X2 chez The Odds API, donc pas de cote de marché.
 */
function coteDuMarche(key, { home, draw, away }) {
  const double = (a, b) => (a && b ? 1 / (1 / a + 1 / b) : null);
  switch (key) {
    case '1': return { odds: home, kind: 'marché' };
    case 'N': return { odds: draw, kind: 'marché' };
    case '2': return { odds: away, kind: 'marché' };
    case '1N': return { odds: double(home, draw), kind: 'dérivée' };
    case '12': return { odds: double(home, away), kind: 'dérivée' };
    case 'N2': return { odds: double(draw, away), kind: 'dérivée' };
    default: return { odds: null, kind: null };
  }
}

/** Buts de chaque équipe dans le segment, ou null si le déroulé ne le dit pas. */
function butsDuSegment(m, segment) {
  if (segment === 'complet') return [m.home_goals, m.away_goals];
  let evenements;
  try {
    evenements = JSON.parse(m.events || '[]');
  } catch {
    return null;
  }
  const buts = evenements.filter((e) => e.type === 'goal' && e.minute !== null && e.minute !== undefined);
  const dom = buts.filter((e) => e.side === 'home');
  const ext = buts.filter((e) => e.side === 'away');
  // Un déroulé incomplet donnerait une mi-temps fausse : on l'écarte.
  if (dom.length !== m.home_goals || ext.length !== m.away_goals) return null;
  const avantPause = (liste) => liste.filter((e) => Number(e.minute) <= 45).length;
  const mt1 = [avantPause(dom), avantPause(ext)];
  return segment === 'mt1' ? mt1 : [m.home_goals - mt1[0], m.away_goals - mt1[1]];
}

export function clubDuMagasin(nom, league, database) {
  if (!nom) return null;
  ensureRegistries({ database });
  const clubs = findTeams(nom, { database });
  const memeCompetition = clubs.filter((c) => c.league === league);
  if (memeCompetition.length === 1) return memeCompetition[0].teamId;
  if (clubs.length === 1) return clubs[0].teamId;
  // The Odds API écrit « Lillestrom », « Girona FC », « Brighton and Hove
  // Albion » ; FotMob « Lillestrøm », « Girona », « Brighton & Hove
  // Albion ». Secours en deux temps, parmi les seuls clubs qui ont joué
  // dans CETTE compétition, et seulement s'il en reste un seul :
  //   1. mêmes mots translittérés (ø -> o, ł -> l, đ -> d) ;
  //   2. tous les mots d'une écriture présents dans l'autre (« Girona » dans
  //      « Girona FC »), avec au moins un mot de trois lettres.
  // Jamais une ressemblance approximative : « Port » ne vaut pas « Porto ».
  const mots = nameTokens(nom);
  const cle = mots.join(' ');
  const ecritures = database
    .prepare(`SELECT a.team_id, a.alias FROM team_aliases a
              WHERE a.team_id IN (SELECT home_id FROM matches WHERE league = ? UNION SELECT away_id FROM matches WHERE league = ?)`)
    .all(league, league)
    .map((e) => ({ id: e.team_id, alias: e.alias, mots: nameTokens(e.alias) }));
  const unique = (liste) => {
    const ids = new Set(liste.map((e) => e.id));
    return ids.size === 1 ? [...ids][0] : null;
  };
  // 0. La table d'alias du projet (« Athletic Bilbao » = « Athletic Club »).
  const connus = ecritures.filter((e) => teamNamesEqual(nom, e.alias));
  if (connus.length) return unique(connus);
  const egaux = ecritures.filter((e) => e.mots.join(' ') === cle);
  if (egaux.length) return unique(egaux);
  const inclus = (a, b) => a.length > 0 && a.every((m) => b.includes(m)) && a.some((m) => m.length >= 3);
  return unique(ecritures.filter((e) => inclus(e.mots, mots) || inclus(mots, e.mots)));
}

/**
 * Profil d'un match à venir.
 *
 * @param {object} p
 * @param {string} p.league      compétition, au libellé du magasin
 * @param {string} p.home        équipe qui reçoit (nom de la source des cotes)
 * @param {string} p.away        équipe qui se déplace
 * @param {string} p.kickoff     coup d'envoi ISO ; seuls les matchs d'avant comptent
 * @param {{home:number, draw:number|null, away:number}} p.odds  cotes 1X2 actuelles
 * @param {string} p.scope       une de PORTEES
 * @param {string} p.segment     une de SEGMENTS
 * @param {number} p.tolerance   écart des cotes, en pour cent
 */
export function oddsProfile({ league, home, away, kickoff, odds, scope = 'championnat-2', segment = 'complet', tolerance = 13, database = openDb() }) {
  const portee = PORTEES.includes(scope) ? scope : 'championnat-2';
  const seg = SEGMENTS.includes(segment) ? segment : 'complet';
  const ecart = Number.isFinite(tolerance) && tolerance > 0 && tolerance <= 50 ? tolerance : 13;
  const jourMatch = String(kickoff ?? new Date().toISOString()).slice(0, 10);
  const saison = seasonOf(league, jourMatch);
  const base = { league, scope: portee, segment: seg, tolerance: ecart, odds, season: seasonLabel(league, saison), source: SOURCE, minimum: MINIMUM_FIABLE };

  const avertissements = [];
  if (!LIGUES_AVEC_COTES.has(league)) {
    return { ...base, analyzed: 0, markets: [], matches: [], history: { count: 0 }, warnings: ["Pas d'historique de cotes pour cette compétition : football-data.co.uk ne la couvre pas."] };
  }

  const colonnes = `m.match_key, m.date, m.home_id, m.away_id, m.home_name, m.away_name, m.home_goals, m.away_goals, m.events,
    json_extract(m.meta, '$.awarded') AS awarded, o.home AS oh, o.draw AS od, o.away AS oa`;
  const joue = 'm.home_goals IS NOT NULL AND m.away_goals IS NOT NULL';
  let lignes;
  let semblable;
  let historique;
  let equipe = null;

  if (portee.startsWith('equipe')) {
    const aDomicile = portee === 'equipe-domicile';
    const nom = aDomicile ? home : away;
    const club = clubDuMagasin(nom, league, database);
    if (!club) {
      return { ...base, analyzed: 0, markets: [], matches: [], history: { count: 0 }, warnings: [`« ${nom} » est introuvable dans le magasin : profil par équipe impossible.`] };
    }
    equipe = canonicalTeamNames({ database }).get(club) ?? nom;
    const colonne = aDomicile ? 'm.home_id' : 'm.away_id';
    // Toutes compétitions : un promu garde ainsi sa saison précédente, et la
    // ressemblance des cotes suffit à comparer ce qui est comparable.
    lignes = database
      .prepare(`SELECT ${colonnes} FROM match_odds o JOIN matches m ON m.match_key = o.match_key WHERE ${colonne} = ? AND m.date < ? AND ${joue} ORDER BY m.date DESC`)
      .all(club, jourMatch);
    const cible = aDomicile ? odds.home : odds.away;
    semblable = (l) => Math.abs((aDomicile ? l.oh : l.oa) / cible - 1) <= ecart / 100;
    historique = lignes.length;
  } else {
    const debut = portee === 'championnat-2' ? seasonBounds(league, saison - 1)[0] : portee === 'championnat-1' ? seasonBounds(league, saison)[0] : '2000-01-01';
    lignes = database
      .prepare(`SELECT ${colonnes} FROM match_odds o JOIN matches m ON m.match_key = o.match_key WHERE m.league = ? AND m.date >= ? AND m.date < ? AND ${joue} ORDER BY m.date DESC`)
      .all(league, debut, jourMatch);
    semblable = (l) => Math.abs(l.oh / odds.home - 1) <= ecart / 100 && Math.abs(l.oa / odds.away - 1) <= ecart / 100;
    historique = lignes.length;
  }

  // Un résultat attribué sur tapis vert n'est pas un résultat de football.
  const retenus = [];
  let sansMiTemps = 0;
  for (const l of lignes) {
    if (l.awarded || !semblable(l)) continue;
    const buts = butsDuSegment(l, seg);
    if (!buts) {
      sansMiTemps++;
      continue;
    }
    retenus.push({ ...l, buts });
  }

  const n = retenus.length;
  const markets = marches(seg).map((marche) => {
    const hits = retenus.filter((r) => marche.test(r.buts[0], r.buts[1])).length;
    const prob = n ? hits / n : null;
    // Les cotes du jour sont celles du match entier : elles ne valent pas
    // pour une mi-temps.
    const { odds: coteMarche, kind } = seg === 'complet' ? coteDuMarche(marche.key, odds) : { odds: null, kind: null };
    const value = prob !== null && coteMarche ? prob * coteMarche - 1 : null;
    return {
      key: marche.key,
      label: marche.label,
      hits,
      pct: prob === null ? null : Math.round(prob * 100),
      odds: arrondi(coteMarche),
      oddsKind: kind,
      fairOdds: prob ? arrondi(1 / prob) : null,
      value: arrondi(value, 3),
      isValue: value !== null && value > 0
    };
  });

  if (n > 0 && n < MINIMUM_FIABLE) avertissements.push(`Moins de ${MINIMUM_FIABLE} matchs analysés : pourcentages fragiles.`);
  if (n === 0) avertissements.push("Aucun match passé n'a des cotes assez proches : élargissez l'écart ou la portée.");
  if (sansMiTemps) avertissements.push(`${sansMiTemps} match(s) écarté(s) : leur déroulé ne permet pas de situer les buts par mi-temps.`);

  const noms = canonicalTeamNames({ database });
  const matches = retenus.slice(0, LIMITE_LISTE).map((r) => ({
    matchKey: r.match_key ?? null,
    date: r.date,
    home: noms.get(r.home_id) ?? r.home_name,
    away: noms.get(r.away_id) ?? r.away_name,
    homeId: r.home_id ?? null,
    awayId: r.away_id ?? null,
    homeGoals: r.home_goals,
    awayGoals: r.away_goals,
    score: `${r.home_goals}-${r.away_goals}`,
    segmentScore: seg === 'complet' ? null : `${r.buts[0]}-${r.buts[1]}`,
    odds: { home: r.oh, draw: r.od, away: r.oa }
  }));

  return { ...base, team: equipe, analyzed: n, markets, matches, history: { count: historique }, warnings: avertissements };
}
