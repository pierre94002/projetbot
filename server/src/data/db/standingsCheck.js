/**
 * standingsCheck.js — le classement OFFICIEL face au classement CALCULÉ.
 * -----------------------------------------------------------------------
 * Logique de scripts/verify-standings.mjs, sortie en module (étape 12 du
 * plan, 06/10/2026) pour que le carnet de santé des données la réutilise au
 * lieu d'en écrire une seconde : le script n'en est plus que l'affichage.
 *
 * Compétition par compétition et saison par saison, le classement relevé chez
 * FotMob (standings_official) est confronté à celui que donnent les rencontres
 * du magasin (standingsFromStore). Ce que l'écart révèle :
 *
 *   - une équipe présente d'un côté seulement : un club mal identifié, une
 *     phase entière absente du magasin, ou des rencontres rangées dans la
 *     mauvaise compétition ;
 *   - un nombre de matchs joués différent : des rencontres manquent (ou sont
 *     en double) dans le magasin ;
 *   - un bilan différent à matchs égaux (victoires, nuls, défaites, buts) :
 *     un score faux, ou un résultat décidé hors du terrain (match attribué,
 *     annulé) que la source ne publie pas comme la fédération l'applique —
 *     ce qui est précisément pourquoi la table officielle est celle qu'on
 *     affiche.
 *
 * Le bilan se compare en victoires, nuls, défaites, buts pour et contre —
 * jamais en points : les pénalités et les points divisés par deux à l'entrée
 * des playoffs ne sont pas des erreurs de résultat. Une première version ne
 * comparait les points que sur les saisons à table unique et jamais les
 * buts : 84 saisons à plusieurs tables (Apertura/Clausura, conférences,
 * groupes) passaient sans contrôle du bilan, et deux scores brésiliens faux
 * sont restés invisibles.
 *
 * Ne corrige rien, n'écrit rien : une connexion en lecture seule suffit (à
 * condition que l'annuaire des clubs soit rempli, cf. ensureRegistries).
 *
 * Écrit UNE fois, en générateur (`confronterClassementsParMorceaux`, qui
 * `yield` entre deux saisons, pendant la lecture d'avance d'une saison, après
 * chaque classement calculé, avant chaque recherche de match attribué :
 * utils/travailCooperatif.js) ; `confronterClassements` garde son nom d'avant,
 * synchrone, pour le script verify-standings.mjs et le contrôle quotidien. Le
 * contrôle complet du carnet de santé le exécute en rendant la main au
 * serveur : 216 saisons, de 7 à 13 s sur la base du bac.
 *
 * Le classement CALCULÉ d'une saison (standingsFromStore, matchStatsRead.js :
 * un fichier du moteur, qu'on ne touche donc pas) lit d'un seul appel les
 * lignes ENTIÈRES de ses 380 à 560 matchs — les clubs et le champ `meta`
 * suivent des listes de plusieurs ko : 20 à 40 Mo par saison, comme chaque
 * recherche de match attribué qui suit. À chaud, 45 à 115 ms ; quand le disque
 * est sollicité, de 150 à 650 ms d'un seul appel. `prelireLaSaison` lit donc
 * ces lignes d'avance, par tranches de 2 matchs (2 à 6 ms), avec un point
 * d'arrêt entre deux : les appels qui suivent les trouvent en mémoire (le plus
 * long pas n'est plus que le calcul, ~70 ms). Elle ne change aucun résultat,
 * et coûte une seconde lecture (+5 s sur les 216 saisons) : le contrôle qui ne
 * rend pas la main (`confronterClassements`) ne la fait pas.
 *
 * LES MATCHS EN COURS (retouche du 12/10/2026). La table officielle est relevée
 * chez FotMob EN DIRECT (étape « classements » de la passe) : un match en cours
 * y compte déjà comme joué, alors que le magasin n'a que les matchs terminés et
 * importés. Dans la nuit du 11 au 12/10, 22 clubs d'Amérique du Sud (Flamengo –
 * Fluminense, Palmeiras – Corinthians…) avaient ainsi « 30 matchs joués au
 * classement officiel, 29 au magasin » : le contrôle quotidien a mis le feu au
 * rouge, le carnet a noté 22 « matchs manquants ». Quand l'écart de « joués »
 * d'un club s'explique par des matchs du CALENDRIER pas encore terminés
 * (statut « scheduled » : en cours, ou finis trop récemment pour être au
 * magasin), datés d'aujourd'hui ou d'hier, absents du magasin, ce n'est pas une
 * anomalie : le club va dans `enCours` (une information), jamais dans `played`.
 * Une fois le match fini, la passe suivante le marque « finished » au calendrier
 * et l'importe : l'écart disparaît, ou, s'il reste, redevient une anomalie.
 * L'appelant fournit ces matchs (matchsEnCoursDuCalendrier) ; sans eux, rien
 * ne change.
 * -----------------------------------------------------------------------
 */

import { executerSansPause } from '../../utils/travailCooperatif.js';
import { standingsFromStore, officialStandings, seasonsForLeague } from './matchStatsRead.js';
import { hasStandings } from '../providers/leagueCups.js';
import { FOTMOB_LEAGUES } from '../providers/fotMobProvider.js';
import { seasonLabel, seasonBounds } from '../providers/seasonWindows.js';
import { slug } from '../../utils/nameIdentity.js';

const CHAMPS = ['played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst'];
const vide = (teamName) => ({ teamName, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 });
export const bilanTexte = (r) => `${r.played} J ${r.won}V ${r.drawn}N ${r.lost}D ${r.goalsFor}-${r.goalsAgainst}`;
const memeBilan = (a, b) => CHAMPS.every((c) => (a[c] ?? 0) === (b[c] ?? 0));

// ================================================================ matchs en cours

const JOUR_MS = 86_400_000;
const jourUtc = (t) => new Date(t).toISOString().slice(0, 10);
/** « 11/10/2026 » */
const jourFr = (j) => {
  const m = String(j ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(j ?? '');
};
/** Au calendrier, un match fini, reporté ou annulé n'est plus « en cours ». */
const PAS_EN_COURS = /^(finished|postponed|cancelled|abandoned)$/;

/**
 * Les matchs du calendrier de saison (data/runtime/season-calendar.json) qui
 * peuvent compter au classement officiel relevé en direct sans être encore au
 * magasin : pas terminés au calendrier (ni reportés ni annulés), sans score,
 * datés d'AUJOURD'HUI ou d'HIER (jours UTC de `maintenant`, ceux du
 * calendrier). Plus vieux, un match devrait être fini et importé : l'écart
 * redevient une anomalie. Rend { jours, parLigue } (une liste par compétition),
 * à passer tel quel à confronterClassements (`enCours`).
 */
export function matchsEnCoursDuCalendrier(calendrier, { maintenant = Date.now() } = {}) {
  const t = typeof maintenant === 'number' ? maintenant : new Date(maintenant).getTime();
  const jours = [jourUtc(t - JOUR_MS), jourUtc(t)];
  const parLigue = new Map();
  const vus = new Set();
  for (const e of Array.isArray(calendrier) ? calendrier : []) {
    if (!e?.league || !e.homeName || !e.awayName || !jours.includes(String(e.date ?? '').slice(0, 10))) continue;
    if (PAS_EN_COURS.test(String(e.status ?? '')) || (e.homeGoals !== null && e.homeGoals !== undefined)) continue;
    // Le même match écrit deux fois au calendrier ne compte qu'une fois.
    const cle = `${e.league}|${e.date}|${slug(e.homeName)}|${slug(e.awayName)}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    if (!parLigue.has(e.league)) parLigue.set(e.league, []);
    parLigue.get(e.league).push({ date: String(e.date).slice(0, 10), homeName: e.homeName, awayName: e.awayName });
  }
  return { jours, parLigue };
}

/**
 * L'écart de « joués » d'un club s'explique-t-il par `enAttente` matchs en
 * cours (ou pas encore enregistrés) ? Oui si l'une des lectures de la table
 * officielle (`officiels`) dépasse le magasin d'au plus `enAttente` matchs.
 */
export function ecartExpliqueParDesMatchsEnCours(officiels, magasin, enAttente) {
  if (!(enAttente > 0)) return false;
  return (officiels ?? []).some((o) => o > magasin && o <= magasin + enAttente);
}

/**
 * Pour une saison : les matchs en cours (au calendrier) de chaque club, par
 * identifiant FotMob. Un nom du calendrier ne désigne un club que s'il est,
 * à l'écriture près (slug : casse, accents, ponctuation), le nom d'UN SEUL club
 * de cette table — son nom au classement officiel, au classement calculé ou
 * dans l'annuaire du magasin (team_aliases) — jamais par ressemblance. Un match
 * déjà au magasin (mêmes clubs, à un jour près ; même jour si l'adversaire est
 * inconnu) n'explique rien. Lecture seule.
 */
function matchsEnAttenteParClub(database, league, bornes, enCours, nomsParClub) {
  const candidats = (enCours?.parLigue?.get(league) ?? []).filter((m) => m.date >= bornes[0] && m.date < bornes[1]);
  const parClub = new Map();
  if (!candidats.length) return parClub;
  const parSlug = new Map();
  const noter = (nom, id) => {
    const s = slug(nom);
    if (!s || !id) return;
    if (!parSlug.has(s)) parSlug.set(s, new Set());
    parSlug.get(s).add(id);
  };
  for (const [id, noms] of nomsParClub) for (const nom of noms) noter(nom, id);
  const ids = [...nomsParClub.keys()];
  if (ids.length) {
    try {
      const marques = ids.map(() => '?').join(',');
      for (const a of database.prepare(`SELECT slug, team_id FROM team_aliases WHERE team_id IN (${marques})`).all(...ids)) {
        if (!parSlug.has(a.slug)) parSlug.set(a.slug, new Set());
        parSlug.get(a.slug).add(a.team_id);
      }
    } catch {
      // Pas d'annuaire lisible : les noms des deux classements seulement.
    }
  }
  const club = (nom) => {
    const s = parSlug.get(slug(nom));
    return s?.size === 1 ? [...s][0] : null;
  };
  const decaler = (jour, n) => jourUtc(Date.parse(`${jour}T12:00:00Z`) + n * JOUR_MS);
  const parPaire = database.prepare('SELECT 1 AS ok FROM matches WHERE league = ? AND home_id = ? AND away_id = ? AND date >= ? AND date <= ? LIMIT 1');
  const parClubEtJour = database.prepare('SELECT 1 AS ok FROM matches WHERE league = ? AND date = ? AND (home_id = ? OR away_id = ?) LIMIT 1');
  for (const m of candidats) {
    const domicile = club(m.homeName);
    const exterieur = club(m.awayName);
    if (!domicile && !exterieur) continue;
    const auMagasin =
      domicile && exterieur
        ? Boolean(parPaire.get(league, domicile, exterieur, decaler(m.date, -1), decaler(m.date, 1)))
        : Boolean(parClubEtJour.get(league, m.date, domicile ?? exterieur, domicile ?? exterieur));
    if (auMagasin) continue;
    for (const id of [domicile, exterieur]) {
      if (!id) continue;
      if (!parClub.has(id)) parClub.set(id, []);
      parClub.get(id).push(m);
    }
  }
  return parClub;
}

/** « Flamengo – Fluminense du 11/10/2026 » */
const matchEnMots = (m) => `${m.homeName} – ${m.awayName} du ${jourFr(m.date)}`;

/**
 * Lit d'avance, au fil de l'eau, les lignes que `standingsFromStore` lira d'un
 * seul appel (mêmes matchs : ceux qui ont un score, dans les bornes de la
 * saison). `fotmob_id` est le DERNIER champ de la ligne, et SQLite ne l'atteint
 * qu'en lisant tout ce qui le précède (les listes qui débordent de la page, une
 * page après l'autre) : les pages passent en mémoire, tranche après tranche.
 * Aucun résultat n'en dépend.
 */
function* prelireLaSaison(database, league, season) {
  const [du, au] = seasonBounds(league, season);
  let lues = 0;
  for (const ligne of database
    .prepare('SELECT length(fotmob_id) AS taille FROM matches WHERE league = ? AND home_goals IS NOT NULL AND away_goals IS NOT NULL AND date >= ? AND date < ?')
    .iterate(league, du, au)) {
    if (ligne.taille !== undefined && (++lues & 1) === 0) yield `classements : ${league} ${season} (lecture)`;
  }
}

/**
 * @param {object} p
 * @param {import('node:sqlite').DatabaseSync} p.database   une connexion (en lecture seule suffit) : ce module n'en ouvre aucune
 * @param {string[]|null} [p.leagues]       ces compétitions seulement (à classement)
 * @param {Set<string>|null} [p.saisons]    ces saisons seulement, en « compétition|année de début »
 * @param {(texte: string) => void} [p.journal]  le détail, ligne par ligne (le script l'écrit sur stderr)
 * @param {{ jours: string[], parLigue: Map<string, object[]> }|null} [p.enCours]  les matchs en cours du
 *   calendrier (matchsEnCoursDuCalendrier) ; sans eux (null), aucun écart n'est mis à part pour eux
 * @returns {{ resume: object, details: object[] }}
 *   `details` : une entrée par saison qui a un écart (ou un écart expliqué par
 *   un résultat attribué, ou par un match en cours : `enCours`, retouche du
 *   12/10/2026), avec pour chaque club concerné son identifiant, ses comptes
 *   des deux côtés et la ligne de texte du script d'origine. `resume` garde
 *   ses clés d'avant : un club « en cours » n'y est compté que dans
 *   `exactOrExplained` (sa saison, si rien d'autre ne cloche).
 */
export function confronterClassements(options = {}) {
  // Sans pause possible, lire d'avance ne servirait à rien : ce serait lire deux fois.
  return executerSansPause(confronterClassementsParMorceaux({ ...options, prelecture: false }));
}

/**
 * La même chose, en générateur : voir utils/travailCooperatif.js.
 * `prelecture` : lire d'avance chaque saison par tranches (prelireLaSaison),
 * pour qui rend la main aux points d'arrêt.
 */
export function* confronterClassementsParMorceaux({ database, leagues = null, saisons = null, journal = null, prelecture = true, enCours = null } = {}) {
  if (!database) throw new Error("confronterClassements : une connexion à la base est requise (une connexion en lecture seule suffit).");
  const cibles = Object.keys(FOTMOB_LEAGUES).filter((l) => hasStandings(l) && (!leagues || leagues.includes(l)));
  const resume = { leagues: 0, seasons: 0, withOfficial: 0, tables: 0, teamsOnlyOfficial: 0, teamsOnlyComputed: 0, playedMismatch: 0, recordMismatch: 0, awardedExplained: 0, exact: 0, exactOrExplained: 0 };
  const details = [];

  // Un match ATTRIBUÉ sur tapis vert n'est pas toujours appliqué par la
  // fédération comme FotMob l'écrit en en-tête (Mannucci - Municipal 0-0
  // « awarded_win », Bastia - Red Star 0-3 sans buts dans la table) : un
  // bilan qui diverge pour un club ayant un tel match dans la saison est un
  // écart de la source, pas du magasin.
  const matchsAttribues = database.prepare(`SELECT COUNT(*) n FROM matches WHERE league = ? AND date >= ? AND date < ? AND (home_id = ? OR away_id = ?) AND json_extract(meta, '$.awarded') = 1`);

  for (const league of cibles) {
    yield `classements : ${league}`;
    const lesSaisons = seasonsForLeague(league, { database }).filter(({ season }) => !saisons || saisons.has(`${league}|${season}`));
    // Sans filtre, chaque compétition à classement compte (comme le script d'origine).
    if (saisons && !lesSaisons.length) continue;
    resume.leagues++;
    for (const { season } of lesSaisons) {
      resume.seasons++;
      yield `classements : ${league} ${season}`;
      if (prelecture) yield* prelireLaSaison(database, league, season);
      const officiel = officialStandings(league, { season, database });
      const calcule = standingsFromStore(league, { season, database });
      // Le classement calculé lit toutes les rencontres de la saison : il tient seul entre deux points d'arrêt.
      yield `classements : ${league} ${season} (calculé)`;
      if (!officiel) {
        journal?.(`${league} ${seasonLabel(league, season)} : pas de table officielle relevée`);
        continue;
      }
      resume.withOfficial++;
      const parId = new Map((calcule?.rows ?? []).map((r) => [r.teamId, r]));

      // Une compétition à plusieurs tables ne se compare pas table par table
      // au calcul, qui cumule toutes les phases. Les formats diffèrent : en
      // Colombie, Apertura, Clausura et groupes de playoffs sont DISJOINTS et
      // s'additionnent ; au Danemark, la table du tour final REPREND les
      // matchs de la phase régulière, et c'est son total qui vaut ; en MLS, le
      // Supporters' Shield répète les conférences. Le bilan est donc tenu pour
      // exact s'il vaut l'une des trois lectures : les seules tables
      // régulières, la somme de toutes (sans les doublons), ou la table où le
      // club a le plus de matchs.
      const nonDoublon = officiel.tables.filter((t) => !/shield|annual|overall|aggregate/i.test(t.name));
      const regulieres = nonDoublon.filter((t) => !/playoff|final stage|championship group|relegation group/i.test(t.name));
      const tablesDeBase = regulieres.length ? regulieres : nonDoublon;
      const cumuler = (tables) => {
        const cumul = new Map();
        for (const t of tables) {
          for (const r of t.rows) {
            const c = cumul.get(r.teamId) ?? vide(r.teamName);
            for (const champ of CHAMPS) c[champ] += r[champ] ?? 0;
            cumul.set(r.teamId, c);
          }
        }
        return cumul;
      };
      const base = cumuler(tablesDeBase);
      const toutes = cumuler(nonDoublon);
      const maxTable = new Map();
      for (const t of nonDoublon) {
        for (const r of t.rows) {
          const connu = maxTable.get(r.teamId);
          if (!connu || (r.played ?? 0) > connu.played) maxTable.set(r.teamId, { ...vide(r.teamName), ...Object.fromEntries(CHAMPS.map((c) => [c, r[c] ?? 0])) });
        }
      }
      resume.tables += nonDoublon.length;

      const detail = { league, season, seasonLabel: seasonLabel(league, season), tables: nonDoublon.map((t) => t.name), onlyOfficial: [], onlyComputed: [], played: [], record: [], awarded: [], enCours: [] };
      const bornes = seasonBounds(league, season);
      // Les matchs en cours de chaque club de cette saison, cherchés une fois et
      // seulement s'il le faut (un écart de « joués », des matchs en cours fournis).
      let enAttente = null;
      const enAttenteDe = (teamId) => {
        if (!enCours) return [];
        if (!enAttente) {
          const nomsParClub = new Map();
          for (const [id, o] of toutes) nomsParClub.set(id, new Set([o.teamName]));
          for (const [id, c] of parId) {
            if (!nomsParClub.has(id)) nomsParClub.set(id, new Set());
            nomsParClub.get(id).add(c.teamName);
          }
          enAttente = matchsEnAttenteParClub(database, league, bornes, enCours, nomsParClub);
        }
        return enAttente.get(teamId) ?? [];
      };
      const enCoursDe = (teamId, teamName, officiels, magasin, matchs) => ({
        teamId,
        teamName,
        officiel: officiels,
        magasin,
        matchs: matchs.map((m) => ({ date: m.date, homeName: m.homeName, awayName: m.awayName })),
        ligne: `${teamName} : officiel ${officiels.join('/')} J, magasin ${magasin} J — match en cours ou pas encore enregistré : ${matchs.map(matchEnMots).join(', ')}`
      });
      for (const [teamId, o] of toutes) {
        const c = parId.get(teamId);
        // Un club de la table à zéro match (phase de ligue non commencée) n'est
        // pas un club que le magasin ignore.
        if (!c) {
          if (o.played > 0) {
            // Son premier match, en cours (une saison qui commence) : une information.
            const attente = enAttenteDe(teamId);
            if (ecartExpliqueParDesMatchsEnCours([o.played], 0, attente.length)) detail.enCours.push(enCoursDe(teamId, o.teamName, [o.played], 0, attente));
            else detail.onlyOfficial.push({ teamId, teamName: o.teamName, officiel: o.played, ligne: `${o.teamName} (${o.played} J)` });
          }
          continue;
        }
        const lectures = [base.get(teamId), toutes.get(teamId), maxTable.get(teamId)].filter(Boolean);
        const memesJ = lectures.filter((l) => l.played === c.played);
        if (!memesJ.length) {
          const officiels = [...new Set(lectures.map((l) => l.played))];
          const attente = enAttenteDe(teamId);
          if (ecartExpliqueParDesMatchsEnCours(officiels, c.played, attente.length)) detail.enCours.push(enCoursDe(teamId, o.teamName, officiels, c.played, attente));
          else detail.played.push({ teamId, teamName: o.teamName, officiel: officiels, magasin: c.played, ligne: `${o.teamName} : officiel ${officiels.join('/')} J, magasin ${c.played} J` });
        } else if (!memesJ.some((l) => memeBilan(l, c))) {
          const ligne = `${o.teamName} : officiel ${[...new Set(memesJ.map(bilanTexte))].join(' | ')}, magasin ${bilanTexte(c)}`;
          const entree = { teamId, teamName: o.teamName, officiel: [...new Set(memesJ.map(bilanTexte))], magasin: bilanTexte(c), ligne };
          // Une recherche de match attribué lit toute la saison de ce club (JSON de chaque rencontre) : un point d'arrêt avant chacune.
          yield `classements : ${league} ${season} (match attribué)`;
          if (matchsAttribues.get(league, bornes[0], bornes[1], teamId, teamId).n > 0) detail.awarded.push(entree);
          else detail.record.push(entree);
        }
      }
      for (const [teamId, c] of parId) {
        if (!toutes.has(teamId)) detail.onlyComputed.push({ teamId, teamName: c.teamName, magasin: c.played, ligne: `${c.teamName} (${c.played} J)` });
      }

      resume.teamsOnlyOfficial += detail.onlyOfficial.length;
      resume.teamsOnlyComputed += detail.onlyComputed.length;
      resume.playedMismatch += detail.played.length;
      resume.recordMismatch += detail.record.length;
      resume.awardedExplained += detail.awarded.length;
      const propre = !detail.onlyOfficial.length && !detail.onlyComputed.length && !detail.played.length && !detail.record.length;
      if (propre) resume.exactOrExplained++;
      if (propre && !detail.awarded.length && !detail.enCours.length) resume.exact++;
      if (!propre || detail.awarded.length || detail.enCours.length) {
        details.push(detail);
        const explique = detail.enCours.length
          ? ` — écart expliqué par ${detail.awarded.length ? 'un résultat attribué et ' : ''}un match en cours ou pas encore enregistré`
          : ' — écart expliqué par un résultat attribué';
        journal?.(`\n${league} ${detail.seasonLabel} [${detail.tables.join(' + ')}]${propre ? explique : ''}`);
        if (detail.onlyOfficial.length) journal?.(`  seulement officiel : ${detail.onlyOfficial.map((x) => x.ligne).join(' ; ')}`);
        if (detail.onlyComputed.length) journal?.(`  seulement magasin  : ${detail.onlyComputed.map((x) => x.ligne).join(' ; ')}`);
        for (const p of detail.played) journal?.(`  J : ${p.ligne}`);
        for (const p of detail.record) journal?.(`  bilan : ${p.ligne}`);
        for (const p of detail.awarded) journal?.(`  attribué : ${p.ligne}`);
        for (const p of detail.enCours) journal?.(`  en cours : ${p.ligne}`);
      }
    }
  }
  return { resume, details };
}
