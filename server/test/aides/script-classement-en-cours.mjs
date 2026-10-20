/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-classement-en-cours.mjs <serveur de la copie> <phase>
 *
 * Retouche du 12/10/2026 — le contrôle « classement officiel » face aux matchs
 * EN COURS. Le cas de la nuit du 11 au 12/10 (Flamengo : « 30 matchs joués au
 * classement officiel, 29 au magasin ») est FABRIQUÉ dans la copie de la base
 * d'essai, sur un championnat qu'elle contient — le Chili 2026, dont un vrai cas
 * de cette nuit-là : Deportes Concepción – Unión La Calera. La table officielle
 * de la saison est remise à l'exact (le classement calculé sur la copie), puis
 * les deux clubs reçoivent un match de plus, comme la table de FotMob relevée
 * pendant leur match ; le calendrier de saison de la copie (data/runtime) dit,
 * selon le scénario, que ce match est « scheduled » aujourd'hui, hier,
 * avant-hier, fini, reporté… L'heure est figée au 05/10/2026 12 h UTC.
 * Sortie : une ligne JSON.
 *
 * Phases :
 *   regle       les scénarios, sur le contrôle partagé (dataHealth.controlesClassements)
 *   chaine      le même cas par les TROIS chemins de l'appli : le carnet (scripts/data-health.mjs,
 *               complet puis la passe de nuit des jours suivants), le contrôle quotidien
 *               (executerControleQuotidien, qui lit le calendrier) et scripts/verify-standings.mjs
 *   sortie      verify-standings.mjs sans match en cours (sans calendrier, puis avec un calendrier
 *               où rien n'est en cours) : sa sortie, à comparer à celle du code d'avant
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const GARDE = new URL('./garde.mjs', import.meta.url).href;
const RUNTIME = path.join(serveur, 'data', 'runtime');
const CALENDRIER = path.join(RUNTIME, 'season-calendar.json');
const CARNET = path.join(RUNTIME, 'carnet-sante.json');
const CONTROLE = path.join(RUNTIME, 'controle-quotidien.json');

const { openDb, closeDb, upsertMatches } = await imp('data/db/matchStatsDb.js');
const { standingsFromStore, officialStandings } = await imp('data/db/matchStatsRead.js');

const CHILI = 'Primera División - Chile';
const SAISON = 2026;
const CONCEPCION = { id: 'fotmob-4134', nom: 'Deportes Concepción' };
const CALERA = { id: 'fotmob-192435', nom: 'Unión La Calera' };
const AUJOURDHUI = new Date().toISOString().slice(0, 10); // heure figée par la garde : 2026-10-05
const decaler = (jour, n) => new Date(Date.parse(`${jour}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Un script du serveur de la copie, comme en ligne de commande (même garde). */
function script(nom, args = [], { env = {} } = {}) {
  const r = spawnSync(process.execPath, ['--import', GARDE, path.join(serveur, 'scripts', nom), ...args], { cwd: serveur, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 180_000 });
  let json = null;
  try {
    json = JSON.parse((r.stdout ?? '').trim().split(/\r?\n/).pop());
  } catch {
    // laissé à null
  }
  return { code: r.status, json, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Écrire dans la copie, puis fermer. */
function ecrire(f) {
  const db = openDb();
  try {
    return f(db);
  } finally {
    closeDb();
  }
}

/**
 * La table officielle du Chili 2026 remise à l'EXACT (le classement calculé sur la
 * copie), sous les noms de la table officielle ; puis `enPlus` matchs joués (des
 * nuls, comme un 0-0 en cours) pour les clubs donnés.
 */
function tableOfficielle(enPlus = {}, { clubEnPlus = null } = {}) {
  ecrire((db) => {
    const officiel = officialStandings(CHILI, { season: SAISON, database: db });
    const table = officiel.tables[0];
    const noms = new Map(table.rows.map((r) => [r.teamId, r.teamName]));
    const calcule = standingsFromStore(CHILI, { season: SAISON, database: db });
    const lignes = calcule.rows.map((r, i) => {
      const n = enPlus[r.teamId] ?? 0;
      return { rank: i + 1, teamId: r.teamId, teamName: noms.get(r.teamId) ?? r.teamName, played: r.played + n, won: r.won, drawn: r.drawn + n, lost: r.lost, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, goalDiff: r.goalsFor - r.goalsAgainst, points: 3 * r.won + r.drawn + n };
    });
    // Un club de la table officielle sans aucune rencontre au magasin (son premier match, en cours).
    if (clubEnPlus) lignes.push({ rank: lignes.length + 1, teamId: clubEnPlus.id, teamName: clubEnPlus.nom, played: 1, won: 0, drawn: 1, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 1 });
    db.prepare('UPDATE standings_official SET rows = ? WHERE league = ? AND season = ? AND table_name = ?').run(JSON.stringify(lignes), CHILI, SAISON, table.name);
  });
}

/** Le calendrier de saison de la copie (data/runtime). */
function calendrier(entrees) {
  if (entrees === null) fs.rmSync(CALENDRIER, { force: true });
  else fs.writeFileSync(CALENDRIER, JSON.stringify(entrees));
}
const match = ({ date = AUJOURDHUI, home = CONCEPCION.nom, away = CALERA.nom, status = 'scheduled', buts = null } = {}) => ({
  id: `essai-${date}-${home}`,
  matchId: `cal-${date}-${home}`,
  date,
  league: CHILI,
  homeName: home,
  awayName: away,
  status,
  homeGoals: buts ? buts[0] : null,
  awayGoals: buts ? buts[1] : null,
  round: null,
  source: 'fotmob'
});

/** Le contrôle partagé, sur le Chili 2026, avec les matchs en cours du calendrier de la copie. */
async function controle() {
  const { controlesClassements } = await imp('data/db/dataHealth.js');
  const { matchsEnCoursDuCalendrier } = await imp('data/db/standingsCheck.js');
  const lu = fs.existsSync(CALENDRIER) ? JSON.parse(fs.readFileSync(CALENDRIER, 'utf8')) : null;
  const enCours = lu ? matchsEnCoursDuCalendrier(lu, { maintenant: Date.now() }) : null;
  const db = openDb();
  try {
    const r = controlesClassements(db, new Set([`${CHILI}|${SAISON}`]), { leagues: [CHILI], enCours });
    return r.anomalies.map((a) => ({ club: a.portee?.club ?? null, sorte: a.sorte, gravite: a.gravite, detail: a.detail })).sort((a, b) => String(a.club).localeCompare(String(b.club)));
  } finally {
    closeDb();
  }
}

const sortie = { phase, aujourdhui: AUJOURDHUI };

if (phase === 'regle') {
  const DEUX = { [CONCEPCION.id]: 1, [CALERA.id]: 1 };
  const scenarios = [
    ['exact', {}, [match()]],
    ['aujourdhui', DEUX, [match()]],
    ['hier', DEUX, [match({ date: decaler(AUJOURDHUI, -1) })]],
    ['avant-hier', DEUX, [match({ date: decaler(AUJOURDHUI, -2) })]],
    ['demain', DEUX, [match({ date: decaler(AUJOURDHUI, 1) })]],
    ['termine', DEUX, [match({ status: 'finished', buts: [0, 0] })]],
    ['reporte', DEUX, [match({ status: 'postponed' })]],
    ['avec-score', DEUX, [match({ buts: [0, 0] })]],
    ['sans-calendrier', DEUX, null],
    ['calendrier-vide', DEUX, []],
    ['deux-de-trop', { [CONCEPCION.id]: 2, [CALERA.id]: 2 }, [match()]],
    ['ecrit-deux-fois', { [CONCEPCION.id]: 2, [CALERA.id]: 2 }, [match(), match()]],
    ['inconnu', DEUX, [match({ away: 'Calera FC' })]],
    ['autre-championnat', DEUX, [{ ...match(), league: 'Primera B - Chile' }]]
  ];
  sortie.scenarios = {};
  for (const [nom, enPlus, entrees] of scenarios) {
    tableOfficielle(enPlus);
    calendrier(entrees);
    sortie.scenarios[nom] = await controle();
  }
  // Le premier match d'un club (une saison qui commence) : à la table officielle, aucune rencontre au magasin.
  const NOUVEAU = { id: 'fotmob-777', nom: 'Club Nouveau' };
  tableOfficielle({ [CALERA.id]: 1 }, { clubEnPlus: NOUVEAU });
  calendrier([match({ home: NOUVEAU.nom })]);
  sortie.scenarios['premier-match'] = await controle();
  calendrier([]);
  sortie.scenarios['premier-match-sans'] = await controle();
  // Une autre écriture du club, connue de l'annuaire du magasin (team_aliases) : le même club.
  ecrire((db) => db.prepare("INSERT OR IGNORE INTO team_aliases (slug, team_id, alias, seen) VALUES ('calera', ?, 'Calera', 1)").run(CALERA.id));
  tableOfficielle(DEUX);
  calendrier([match({ away: 'Calera' })]);
  sortie.scenarios.alias = await controle();
  // Le match est DÉJÀ au magasin (le calendrier n'a pas encore suivi) : il n'explique plus rien.
  ecrire((db) =>
    upsertMatches(
      [
        {
          date: AUJOURDHUI,
          league: CHILI,
          homeName: CONCEPCION.nom,
          homeId: CONCEPCION.id,
          awayName: CALERA.nom,
          awayId: CALERA.id,
          fotmobId: '88800001',
          homeGoals: 0,
          awayGoals: 0,
          meta: { leagueKey: 'CHI|Primera División', parentLeagueId: 273, coverage: 'xG' },
          sources: ['essai://classement-en-cours']
        }
      ],
      { database: db }
    )
  );
  tableOfficielle({ [CONCEPCION.id]: 1, [CALERA.id]: 1 }); // le magasin a 1 match de plus, la table officielle 2
  calendrier([match()]);
  sortie.scenarios['au-magasin'] = await controle();
} else if (phase === 'chaine') {
  tableOfficielle({ [CONCEPCION.id]: 1, [CALERA.id]: 1 });
  const lesAnomaliesDuChili = () => {
    const c = JSON.parse(fs.readFileSync(CARNET, 'utf8'));
    return {
      anomalies: c.anomalies.filter((a) => a.league === CHILI && /^classement-/.test(a.sorte)).map((a) => ({ id: a.id, sorte: a.sorte, gravite: a.gravite, type: a.type, detail: a.detail, trouveeLe: a.trouveeLe })),
      parType: c.parType,
      controle: { mode: c.controle.mode, nouvellesErreurs: c.controle.nouvellesErreurs, nouvellesAnomalies: c.controle.nouvellesAnomalies }
    };
  };
  // 1. Le carnet (étape 12), comme la passe le lance : pendant le match, puis sans le match au calendrier.
  calendrier([match()]);
  sortie.carnetPendant = { cli: script('data-health.mjs', ['--complet']), ...lesAnomaliesDuChili() };
  fs.rmSync(CARNET, { force: true });
  calendrier([]);
  sortie.carnetSans = { cli: script('data-health.mjs', ['--complet']), ...lesAnomaliesDuChili() };
  // La passe de NUIT des jours suivants, sans rencontre nouvelle : la saison est revue quand même.
  fs.rmSync(CARNET, { force: true });
  calendrier([match()]);
  script('data-health.mjs', ['--complet']);
  // Le lendemain, le calendrier dit encore « scheduled » (hier) : toujours une information.
  sortie.nuitLendemain = { cli: script('data-health.mjs', [], { env: { CM_TEST_MAINTENANT: `${decaler(AUJOURDHUI, 1)}T03:00:00.000Z` } }), ...lesAnomaliesDuChili() };
  // Après la fin du match et une passe : le calendrier dit « finished », le magasin ne l'a toujours pas.
  calendrier([match({ status: 'finished', buts: [0, 0] })]);
  sortie.nuitApres = { cli: script('data-health.mjs', [], { env: { CM_TEST_MAINTENANT: `${decaler(AUJOURDHUI, 1)}T06:00:00.000Z` } }), ...lesAnomaliesDuChili() };
  // Ou bien le calendrier n'a jamais suivi (encore « scheduled », mais d'avant-hier) : une anomalie aussi.
  fs.rmSync(CARNET, { force: true });
  calendrier([match()]);
  script('data-health.mjs', ['--complet']);
  sortie.nuitSurlendemain = { cli: script('data-health.mjs', [], { env: { CM_TEST_MAINTENANT: `${decaler(AUJOURDHUI, 2)}T03:00:00.000Z` } }), ...lesAnomaliesDuChili() };

  // 2. Le contrôle quotidien (étape 14), comme la passe le lance : il lit lui-même le calendrier de la copie.
  const { executerControleQuotidien } = await imp('data/controleQuotidien.js');
  const quotidien = async (entrees) => {
    calendrier(entrees);
    fs.rmSync(CONTROLE, { force: true });
    const db = openDb();
    try {
      const { etat } = await executerControleQuotidien({ database: db, maintenant: Date.now() });
      const c = etat.controles.find((x) => x.cle === 'classement-officiel');
      const duChili = c.constats.filter((x) => x.league === CHILI);
      const indexes = Object.values(etat.aVerifier.clubs).flat().filter((x) => x.controle === 'classement-officiel');
      return {
        feu: etat.feu,
        statut: c.statutLe,
        constat: c.constat,
        total: c.total,
        parClasse: c.parClasse,
        duChili: duChili.map((x) => ({ classe: x.classe, clubs: x.clubs, aVerifier: x.aVerifier, texte: x.texte })),
        aVerifierDuChili: indexes.filter((x) => /Deportes Concepción|Unión La Calera/.test(x.texte)).map((x) => x.texte),
        rougesHorsChili: c.constats.filter((x) => x.league !== CHILI && x.classe === 'rouge').length
      };
    } finally {
      closeDb();
    }
  };
  sortie.quotidienPendant = await quotidien([match()]);
  sortie.quotidienSans = await quotidien([]);

  // 3. Le script de toujours.
  calendrier([match()]);
  sortie.verifierPendant = script('verify-standings.mjs', ['--league', CHILI]);
  calendrier([]);
  sortie.verifierSans = script('verify-standings.mjs', ['--league', CHILI]);
} else if (phase === 'sortie') {
  // Rien de touché dans la base : la sortie du script, telle quelle.
  calendrier(null);
  sortie.sansCalendrier = script('verify-standings.mjs');
  calendrier([match({ status: 'finished', buts: [1, 0] }), match({ date: decaler(AUJOURDHUI, 7) }), match({ date: decaler(AUJOURDHUI, -3) })]);
  sortie.rienEnCours = script('verify-standings.mjs');
} else {
  throw new Error(`Phase inconnue : ${phase}`);
}

console.log(JSON.stringify(sortie));
