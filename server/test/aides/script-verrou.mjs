/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-verrou.mjs <serveur de la copie> <phase>
 *
 * Retouche du 12/10/2026 — le verrou d'écriture de la base. Tout se passe dans
 * la copie de la base d'essai (réseau coupé, heure figée) : un AUTRE ÉCRIVAIN
 * (script-verrou-tenu.mjs, un processus à part) tient le verrou d'écriture
 * pendant que l'étape « annuaires » (scripts/rebuild-registries.mjs, recopié
 * dans la copie par le test, lancé comme l'actualisation le lance) essaie de
 * l'obtenir. Sortie : une ligne JSON.
 *
 * Phases :
 *   patience      l'autre écrivain rend le verrou APRÈS le premier essai refusé de l'enfant :
 *                 l'enfant réussit à un essai suivant, les annuaires sont refaits en entier
 *   jamais        l'autre écrivain ne rend pas le verrou dans le temps permis : l'enfant
 *                 s'arrête proprement (code 1, message clair en tête de stderr), rien d'écrit
 *   rattachement  le rattachement des cotes aux rencontres (oddsQuotesRepository.js) : les
 *                 mêmes rattachements que l'ancienne requête (l'oracle, écrite ici), la
 *                 recherche hors de la transaction, et rien à rattacher = aucun verrou
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const GARDE = new URL('./garde.mjs', import.meta.url).href;
const TENEUR = fileURLToPath(new URL('./script-verrou-tenu.mjs', import.meta.url));
const ENFANT = path.join(serveur, 'scripts', 'rebuild-registries.mjs');
const BASE = process.env.MATCH_STATS_DB;

const { openDb, closeDb } = await imp('data/db/matchStatsDb.js');
if (!fs.existsSync(ENFANT)) throw new Error(`scripts/rebuild-registries.mjs absent de la copie (${ENFANT})`);

/** Un processus avec la garde des essais ; `surLigne` reçoit chaque ligne de stdout. */
function lancer(script, args = [], { surLigne = () => {} } = {}) {
  const enfant = spawn(process.execPath, ['--import', GARDE, script, ...args], { cwd: serveur, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  let sortie = '';
  let erreurs = '';
  let reste = '';
  enfant.stdout.setEncoding('utf8');
  enfant.stderr.setEncoding('utf8');
  enfant.stdout.on('data', (texte) => {
    sortie += texte;
    reste += texte;
    const lignes = reste.split(/\r?\n/);
    reste = lignes.pop();
    for (const l of lignes) if (l.trim()) surLigne(l.trim());
  });
  enfant.stderr.on('data', (texte) => {
    erreurs += texte;
  });
  const debut = performance.now();
  const fini = new Promise((ok) => enfant.on('close', (code) => ok({ code, sortie, erreurs, ms: Math.round(performance.now() - debut) })));
  return { enfant, fini };
}
const json = (l) => {
  try {
    return JSON.parse(l);
  } catch {
    return null;
  }
};
const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** L'autre écrivain : rend la main quand il TIENT le verrou. */
async function autreEcrivain(tenirAuPlusMs = 30_000) {
  let tenu;
  const pret = new Promise((ok) => (tenu = ok));
  const p = lancer(TENEUR, [String(tenirAuPlusMs)], { surLigne: (l) => json(l)?.tenu && tenu() });
  await Promise.race([pret, p.fini.then((r) => Promise.reject(new Error(`l'autre écrivain s'est arrêté : ${r.erreurs.slice(-500)}`)))]);
  return { rendre: () => p.enfant.stdin.write('rendre\n'), fini: p.fini };
}

/** Ce que contiennent les annuaires, et la ligne témoin de l'autre écrivain. */
function etatDesAnnuaires() {
  const db = openDb();
  try {
    const n = (sql) => db.prepare(sql).get().n;
    return {
      teams: n('SELECT COUNT(*) n FROM teams'),
      teamAliases: n('SELECT COUNT(*) n FROM team_aliases'),
      people: n('SELECT COUNT(*) n FROM people'),
      peopleAliases: n('SELECT COUNT(*) n FROM people_aliases'),
      fantome: n("SELECT COUNT(*) n FROM teams WHERE team_id = 'fotmob-fantome'"),
      temoin: db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'essai_verrou'").get().n ? n('SELECT COUNT(*) n FROM essai_verrou') : 0
    };
  } finally {
    closeDb();
  }
}

/** Un annuaire « d'avant » reconnaissable : un club qui n'existe dans aucune rencontre. Une reconstruction l'efface. */
function planterUnFantome() {
  const db = openDb();
  try {
    db.prepare(
      "INSERT OR REPLACE INTO teams (team_id, name, slug, league, first_seen, last_seen, played, updated_at) VALUES ('fotmob-fantome', 'Club Fantôme', 'club-fantome', 'EPL', '2026-01-01', '2026-01-01', 1, '2026-01-01T00:00:00.000Z')"
    ).run();
  } finally {
    closeDb();
  }
}

const sortie = { phase };

if (phase === 'patience') {
  planterUnFantome();
  sortie.avant = etatDesAnnuaires();
  const ecrivain = await autreEcrivain();
  const essais = [];
  let renduApres = null;
  const enfant = lancer(ENFANT, ['--attente-par-essai-ms', '300', '--duree-max-ms', '30000', '--pauses-ms', '200,400,800'], {
    surLigne: (l) => {
      const x = json(l);
      if (!x?.essai) return;
      essais.push(x);
      // Le verrou est rendu seulement APRÈS un premier essai refusé : l'enfant a dû patienter.
      if (renduApres === null) {
        renduApres = x.essai;
        attendre(100).then(() => ecrivain.rendre());
      }
    }
  });
  const r = await enfant.fini;
  const e = await ecrivain.fini;
  sortie.enfant = { code: r.code, erreurs: r.erreurs.slice(-2000), bilan: json(r.sortie.trim().split(/\r?\n/).pop()), essaisRefuses: essais, ms: r.ms };
  sortie.renduApresEssai = renduApres;
  sortie.autreEcrivain = { code: e.code, rendu: json(e.sortie.trim().split(/\r?\n/).pop()) };
  sortie.apres = etatDesAnnuaires();
  // La même reconstruction, faite ici sans personne pour gêner : les mêmes annuaires (l'enfant les avait refaits EN ENTIER).
  const { rebuildRegistries } = await imp('data/db/identityRegistry.js');
  const db = openDb();
  try {
    sortie.temoinDeReconstruction = rebuildRegistries({ database: db });
  } finally {
    closeDb();
  }
} else if (phase === 'jamais') {
  planterUnFantome();
  sortie.avant = etatDesAnnuaires();
  const ecrivain = await autreEcrivain(20_000);
  const essais = [];
  const enfant = lancer(ENFANT, ['--attente-par-essai-ms', '300', '--duree-max-ms', '2000', '--pauses-ms', '200,400'], {
    surLigne: (l) => {
      const x = json(l);
      if (x?.essai) essais.push(x);
    }
  });
  const r = await enfant.fini;
  // Rien n'a été écrit PENDANT que l'autre écrivain tenait encore le verrou.
  sortie.pendant = etatDesAnnuaires();
  ecrivain.rendre();
  const e = await ecrivain.fini;
  sortie.enfant = { code: r.code, erreurs: r.erreurs, sortie: r.sortie, essaisRefuses: essais, ms: r.ms };
  sortie.autreEcrivain = { code: e.code };
  sortie.apres = etatDesAnnuaires();
} else if (phase === 'rattachement') {
  const { attachQuotesToMatches } = await imp('data/db/oddsQuotesRepository.js');
  const db = openDb();
  // Des cotes FABRIQUÉES autour de vraies rencontres de la base d'essai (des clubs identifiés, des dates connues).
  const rencontres = db
    .prepare("SELECT match_key, date, league, home_id, away_id, home_name, away_name FROM matches WHERE home_id IS NOT NULL AND away_id IS NOT NULL AND date >= '2026-08-01' ORDER BY date, match_key LIMIT 6")
    .all();
  const decaler = (jour, n) => new Date(Date.parse(`${jour}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const inserer = db.prepare(
    `INSERT INTO odds_events (source, source_event, league, date, kickoff, home_name, away_name, home_id, away_id, match_key, provenance, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'essai', '2026-10-05T00:00:00.000Z')`
  );
  let n = 0;
  const cote = (r, { date = r.date, homeId = r.home_id, awayId = r.away_id, matchKey = null } = {}) =>
    inserer.run('essai', `e${++n}`, r.league, date, r.home_name, r.away_name, homeId, awayId, matchKey);
  for (const [i, r] of rencontres.entries()) {
    cote(r); // même jour : rattachée
    cote(r, { date: decaler(r.date, i % 2 ? 1 : -1) }); // un jour d'écart : rattachée
    cote(r, { date: decaler(r.date, 3) }); // trois jours d'écart : non
    cote(r, { homeId: r.away_id, awayId: r.home_id }); // sens inverse : non (sauf rencontre retour le même jour, aucune ici)
    cote(r, { homeId: null }); // club sans identifiant : non
    cote(r, { matchKey: 'deja-rattachee' }); // déjà rattachée : jamais réécrite
    cote(r, { date: '2020-01-01' }); // hors de la période : non
  }
  sortie.cotes = n;
  // L'ORACLE : la requête d'AVANT la retouche, dans une transaction annulée ensuite.
  const ANCIENNE = `UPDATE odds_events SET match_key = (
        SELECT m.match_key FROM matches m
        WHERE m.home_id = odds_events.home_id AND m.away_id = odds_events.away_id
          AND m.date >= date(odds_events.date, '-1 day') AND m.date <= date(odds_events.date, '+1 day')
        ORDER BY abs(julianday(m.date) - julianday(odds_events.date)) LIMIT 1)
      WHERE match_key IS NULL AND home_id IS NOT NULL AND away_id IS NOT NULL AND date >= ? AND date <= ?
        AND EXISTS (SELECT 1 FROM matches m2 WHERE m2.home_id = odds_events.home_id AND m2.away_id = odds_events.away_id
                    AND m2.date >= date(odds_events.date, '-1 day') AND m2.date <= date(odds_events.date, '+1 day'))`;
  const jour = new Date().toISOString().slice(0, 10);
  const bornes = [decaler(jour, -1200), decaler(jour, 1)];
  const lesCles = () => Object.fromEntries(db.prepare("SELECT source_event, match_key FROM odds_events WHERE source = 'essai' ORDER BY id").all().map((x) => [x.source_event, x.match_key]));
  db.exec('BEGIN IMMEDIATE');
  sortie.oracle = { rattachees: db.prepare(ANCIENNE).run(...bornes).changes, cles: lesCles() };
  db.exec('ROLLBACK');
  // Le nouveau, à travers un ESPION qui note chaque requête et si une transaction est ouverte.
  const journal = [];
  let ouverte = false;
  const espion = {
    exec: (sql) => {
      journal.push({ quoi: 'exec', sql, ouverte });
      const r = db.exec(sql);
      if (/^BEGIN/i.test(sql)) ouverte = true;
      if (/^(COMMIT|ROLLBACK)/i.test(sql)) ouverte = false;
      return r;
    },
    prepare: (sql) => {
      const st = db.prepare(sql);
      const note = (quoi) => (...a) => {
        journal.push({ quoi, sql: sql.replace(/\s+/g, ' ').trim(), ouverte });
        return st[quoi](...a);
      };
      return { run: note('run'), all: note('all'), get: note('get'), iterate: note('iterate') };
    }
  };
  const r1 = attachQuotesToMatches({ database: espion });
  sortie.nouveau = { rattachees: r1.attached, cles: lesCles(), journal: journal.splice(0) };
  // Rien à rattacher (tout l'est déjà) : aucune écriture, aucune transaction.
  const r2 = attachQuotesToMatches({ database: espion });
  sortie.rienARattacher = { rattachees: r2.attached, journal: journal.splice(0) };
  closeDb();
  // Un AUTRE écrivain tient le verrou : rien à rattacher, la recherche passe quand même, sans attendre ni échouer ;
  // l'ancienne requête, elle, voulait le verrou d'écriture même pour ne rien changer.
  const ecrivain = await autreEcrivain();
  const { DatabaseSync } = await import('node:sqlite');
  const lecteur = new DatabaseSync(BASE);
  lecteur.exec('PRAGMA busy_timeout = 300;');
  let d = performance.now();
  try {
    sortie.sousVerrou = { rattachees: attachQuotesToMatches({ database: lecteur }).attached, ms: Math.round(performance.now() - d) };
  } catch (error) {
    sortie.sousVerrou = { erreur: error.message, ms: Math.round(performance.now() - d) };
  }
  d = performance.now();
  try {
    lecteur.prepare(ANCIENNE).run(...bornes);
    sortie.ancienneSousVerrou = { erreur: null };
  } catch (error) {
    sortie.ancienneSousVerrou = { erreur: error.message, ms: Math.round(performance.now() - d) };
  }
  lecteur.close();
  ecrivain.rendre();
  await ecrivain.fini;
} else {
  throw new Error(`Phase inconnue : ${phase}`);
}

console.log(JSON.stringify(sortie));
