/**
 * UN BANC FABRIQUÉ pour les essais du banc du direct (étape 46, lot 1, partie C, 12/11/2026) — ce n'est PAS un fichier de
 * test. Aucune donnée réelle : des clubs « fotmob-3… », des rencontres « banc-… », la ligue « Ligue fabriquée », des
 * règles et des documents écrits ici.
 *
 *   matchsFabriques(n, o)          des matchs d'EXPORT (ligne d'avant-match + `resultat`), tirés d'un générateur amorcé ;
 *   texteDExport(o)                un export JSONL (l'en-tête, puis les matchs) ;
 *   rencontresFabriquees(n, o)     des rencontres du MAGASIN (fiche, déroulé FotMob, ligne de nuit) ;
 *   magasinDuBanc(fichier, o)      une base FICHIER au DDL du serveur (simulation_matchs, simulation_state, matches,
 *                                  team_stats) remplie de ces rencontres ;
 *   matchsTires(n, o)              T-B4 : des matchs TIRÉS par simulerMatch (n = 1, une graine par match), le déroulé lu en
 *                                  relançant le même tirage avec le profil et les rouges COUPÉS après le créneau K ;
 *   poserLe46(copie, o)            le registre de la mesure DE LA COPIE avec l'ajout de la 46 (test/aides/ajouts46.mjs) ;
 *   copieAvantLeSceau(copie)       la copie remise avant le scellement (colonne et SCELLEMENT à null, 46 retirée, ni note
 *                                  ni fixture du banc) : les essais passent avant et après la manœuvre ;
 *   piecesDuBanc(dossier, o)       les règles (qui citent les documents par sha1), les documents, libelles.json, la passe.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { __testing as BASE } from '../../src/data/db/matchStatsDb.js';
import { cleDeNuit } from '../../src/data/simulation/simulationRead.js';
import { graineDuMatch, simulerMatch } from '../../src/data/simulation/simulationMatch.js';
import { VERSION_SIMULATION, NB_CRENEAUX } from '../../src/data/simulation/reglages.js';
import { creneauDe } from '../../src/data/simulation/simulationNuit.js';
import { generateur } from '../../src/bench/guard.js';
import { avecLesAjoutsDe46, sansLesAjoutsDe46 } from './ajouts46.mjs';

const sha1 = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const iso = (t) => new Date(t).toISOString();
const H = 3_600_000;
const JOUR = 24 * H;
export const LIGUE = 'Ligue fabriquée';

/** Un tirage de Poisson (au plus 15) sur l'uniforme `u`. */
function poisson(u, l) {
  let k = 0;
  let p = Math.exp(-l);
  let s = p;
  const x = u();
  while (x > s && k < 15) {
    k++;
    p *= l / k;
    s += p;
  }
  return k;
}
/** Le jour `i` de la période (à partir de `debut`). */
const jourDe = (debut, i) => new Date(Date.parse(`${debut}T12:00:00Z`) + i * JOUR).toISOString().slice(0, 10);

/**
 * DES MATCHS D'EXPORT (pour les essais purs du banc) : λ dans [0,8 ; 2,4], μ dans [0,6 ; 1,8], buts de Poisson placés à des
 * créneaux tirés, un rouge dans 15 % des matchs ; une ligne « service » de la grille donnée ; `fair` cohérent avec λ − μ.
 */
export function matchsFabriques(n, { grille = 'ancien-81', engineVersion = 5, role = 'service', candidateHash = null, graine = 7, debut = '2026-09-24', jours = 10, prefixe = 'm', avecFair = true } = {}) {
  const u = generateur(graine);
  return Array.from({ length: n }, (_, i) => {
    const lambda = 0.8 + u() * 1.6;
    const mu = 0.6 + u() * 1.2;
    const hg = poisson(u, lambda);
    const ag = poisson(u, mu);
    const buts = [...Array(hg).fill(0), ...Array(ag).fill(1)].map((c) => [Math.floor(u() * NB_CRENEAUX), c]).sort((a, b) => a[0] - b[0]);
    const rouges = u() < 0.15 ? [[30 + Math.floor(u() * 60), u() < 0.5 ? 0 : 1]] : [];
    const ph = Math.min(0.8, 0.45 + (lambda - mu) * 0.2);
    const pa = Math.max(0.1, 0.75 - ph);
    const date = jourDe(debut, i % jours);
    const kickoff = `${date}T15:00:00.000Z`;
    const cle = `fotmob:fotmob-${3000 + 2 * i}|fotmob-${3001 + 2 * i}|${date}`;
    return {
      type: 'match',
      cle,
      matchKey: `${prefixe}-${String(i).padStart(4, '0')}`,
      date,
      league: LIGUE,
      kickoff,
      ligne: { role, grille, engineVersion, candidateHash, calculeLe: `${date}T03:00:00.000Z`, lambda, mu, rho: -0.06, fair: avecFair ? { home: ph, draw: 1 - ph - pa, away: pa } : null, oddsSource: 'cotes gratuites : essai', oddsAt: null, kickoffConnu: true, version: VERSION_SIMULATION, graine: 0 },
      resultat: { hg90: hg, ag90: ag, buts, rouges, prolongation: false, ajouts: { 45: [], 91: [] } }
    };
  });
}

/** UN EXPORT (texte JSONL) : l'en-tête de --exporter (les champs que lit le banc), puis les matchs. */
export function texteDExport({ colonne, grille, matchs, sceau = null, scelleLe = null, principal28 = { verdict: 'retenu' }, de = '2026-09-24', au = '2026-10-03', exporteLe = '2026-10-05T10:00:00.000Z' }) {
  const entete = {
    type: 'entete',
    format: 1,
    quoi: 'Export FABRIQUÉ (essai du banc du direct).',
    colonne,
    modele: { grille, roles: ['service'], empreinteAdoptee: null, engineVersions: {} },
    fenetre: { de, au },
    exporteLe,
    base: { chemin: 'fabriquee', octets: 0 },
    nuit: '2026-10-05T03:00:00.000Z',
    principal28,
    scellement: { sha1: sceau, scelleLe },
    exclus: {},
    nommes: { graine: [], calculeeApresLeCoupDEnvoi: [] },
    rougesHorsTerrain: { rouges: 0, matchs: 0 },
    rencontresLues: matchs.length,
    matchs: matchs.length,
    passeDePierre: { verifiee: true, attenduS: 0 }
  };
  return `${[entete, ...matchs].map((x) => JSON.stringify(x)).join('\n')}\n`;
}

/**
 * DES RENCONTRES DU MAGASIN (pour --exporter) : une fiche (`matches` : score de la 90e, meta.kickoff, déroulé FotMob avec
 * un remplacement), et sa ligne de nuit (`simulation_matchs`, calculée 12 h avant le coup d'envoi, graine refaite). Les
 * minutes des buts sont 1 à 90, plus un 45+2 et un 90+3 de temps en temps (les ajouts du temps additionnel).
 */
export function rencontresFabriquees(n, { grille = 'ancien-81', engineVersion = 5, role = 'service', candidateHash = null, graine = 11, debut = '2026-09-24', jours = 10, premier = 0 } = {}) {
  const u = generateur(graine);
  return Array.from({ length: n }, (_, j) => {
    const i = premier + j;
    const lambda = Number((0.9 + u() * 1.4).toFixed(3));
    const mu = Number((0.7 + u() * 1.0).toFixed(3));
    const hg = poisson(u, lambda);
    const ag = poisson(u, mu);
    const date = jourDe(debut, i % jours);
    const kickoff = `${date}T${String(13 + (i % 7)).padStart(2, '0')}:00:00.000Z`;
    const evenements = [];
    for (const [nb, side] of [[hg, 'home'], [ag, 'away']]) {
      for (let k = 0; k < nb; k++) {
        const x = u();
        if (x < 0.06) evenements.push({ type: 'goal', minute: 45, addedTime: 2, side });
        else if (x < 0.12) evenements.push({ type: 'goal', minute: 90, addedTime: 3, side });
        else evenements.push({ type: 'goal', minute: 1 + Math.floor(u() * 90), addedTime: 0, side });
      }
    }
    if (u() < 0.2) evenements.push({ type: 'card', card: 'red', minute: 50 + Math.floor(u() * 30), addedTime: 0, side: u() < 0.5 ? 'home' : 'away' });
    evenements.push({ type: 'substitution', minute: 60, addedTime: 0, side: 'home' });
    evenements.sort((a, b) => creneauDe(a.minute, a.addedTime) - creneauDe(b.minute, b.addedTime));
    const ph = Math.min(0.8, 0.45 + (lambda - mu) * 0.2);
    const pa = Math.max(0.1, 0.75 - ph);
    return {
      id: i,
      home: 3000 + 2 * i,
      away: 3001 + 2 * i,
      matchKey: `banc-${String(i).padStart(4, '0')}`,
      date,
      kickoff,
      hg,
      ag,
      meta: { kickoff },
      evenements,
      lignes: [{ role, grille, engineVersion, candidateHash, calculeLe: iso(Date.parse(kickoff) - 12 * H), kickoff, kickoffConnu: 1, lambda, mu, rho: -0.06, fair: { home: Number(ph.toFixed(4)), draw: Number((1 - ph - pa).toFixed(4)), away: Number(pa.toFixed(4)) }, apres: 0 }]
    };
  });
}

/**
 * UNE BASE FICHIER pour --exporter : les tables (et index) du DDL du serveur que lit l'export, les rencontres, la dernière
 * nuit complète (`nuit`) et le principal de la 28 (`principal`, ou rien : « pas rendu »). Rend le chemin.
 */
export function magasinDuBanc(fichier, { rencontres, nuit = '2026-10-05T03:00:00.000Z', principal = { verdict: 'retenu', lancement: '2026-10-28' } }) {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const db = new DatabaseSync(fichier);
  try {
    const tables = ['simulation_matchs', 'simulation_state', 'matches', 'team_stats'];
    for (const s of BASE.DDL) {
      const m = String(s).match(/^\s*CREATE (?:UNIQUE )?(TABLE|INDEX) IF NOT EXISTS (\w+)(?:\s+ON\s+(\w+))?/);
      if (m && tables.includes(m[1] === 'TABLE' ? m[2] : m[3])) db.exec(s);
    }
    const fiche = db.prepare('INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, fotmob_id, home_goals, away_goals, updated_at, events, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const ligne = db.prepare(
      `INSERT INTO simulation_matchs (fixture_key, role, calcule_le, version, grille, engine_version, candidate_hash, date, kickoff, kickoff_connu, home_id, away_id, lambda, mu, rho, fair, odds_source, odds_at, graine, apres_coup_d_envoi)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of rencontres) {
      fiche.run(r.matchKey, `stats-${r.matchKey}`, r.date, LIGUE, 'Domicile', 'Exterieur', `fotmob-${r.home}`, `fotmob-${r.away}`, String(9_000_000 + r.id), r.hg, r.ag, `${r.date}T23:00:00.000Z`, JSON.stringify(r.evenements), r.meta === null ? null : JSON.stringify(r.meta));
      for (const l of r.lignes) {
        const k = l.kickoff ?? r.kickoff;
        const cle = cleDeNuit({ homeId: `fotmob-${r.home}`, awayId: `fotmob-${r.away}`, commenceTime: l.jourDeLaCle ?? k });
        const g = l.graine ?? graineDuMatch({ cle, role: l.role, lambda: l.lambda, mu: l.mu, rho: l.rho, version: VERSION_SIMULATION });
        ligne.run(cle, l.role, l.calculeLe, VERSION_SIMULATION, l.grille, l.engineVersion, l.candidateHash ?? null, String(l.jourDeLaCle ?? k).slice(0, 10), k, l.kickoffConnu ?? 1, String(r.home), String(r.away), l.lambda, l.mu, l.rho, l.fair === null ? null : JSON.stringify(l.fair), 'cotes gratuites : essai', null, g, l.apres ?? 0);
      }
    }
    const etat = db.prepare('INSERT OR REPLACE INTO simulation_state (cle, valeur) VALUES (?, ?)');
    etat.run('nuit_matchs', JSON.stringify({ calculeLe: nuit, bilan: { matchs: rencontres.length } }));
    if (principal) etat.run('principal', JSON.stringify(principal));
  } finally {
    db.close();
  }
  return fichier;
}

// ------------------------------------------------------------ T-B4 : des matchs tirés par simulerMatch

/** Les paramètres coupés APRÈS le créneau K : profil à 0 et rouges à 0 au-delà (bandes recoupées en K). */
function coupes(params, K) {
  const bandes = [];
  const rougeBande = [];
  for (const [i, [nom, de, a]] of params.bandes.entries()) {
    if (a <= K) {
      bandes.push([nom, de, a]);
      rougeBande.push(params.rougeBande[i]);
    } else if (de <= K) {
      bandes.push([nom, de, K]);
      rougeBande.push(params.rougeBande[i]);
      bandes.push([`${nom}+`, K + 1, a]);
      rougeBande.push(0);
    } else {
      bandes.push([nom, de, a]);
      rougeBande.push(0);
    }
  }
  return { ...params, profil: params.profil.map((x, k) => (k <= K ? x : 0)), bandes, rougeBande };
}

/**
 * T-B4 — DES MATCHS TIRÉS par simulerMatch (n = 1, la graine 1000 + i) sous `params` : l'état à chaque créneau évalué se lit
 * en relançant LE MÊME tirage avec le profil et les rouges coupés après le créneau précédent (le hasard est consommé à
 * l'identique jusque-là : les comptes sont exacts). λ, μ tirés du générateur amorcé `graine`. Rend des matchs d'export.
 */
export function matchsTires(n, { params, creneaux, graine = 4646, grille = 'ancien-81' }) {
  const u = generateur(graine);
  const cache = new Map();
  const coupe = (K) => {
    if (K >= NB_CRENEAUX - 1) return params;
    if (!cache.has(K)) cache.set(K, coupes(params, K));
    return cache.get(K);
  };
  const etat = (K, lambda, mu, seed) => {
    if (K < 0) return [0, 0, 0, 0];
    const s = simulerMatch({ lambda, mu, params: coupe(K), n: 1, seed });
    return [s.ftH[0], s.ftA[0], s.rougesH[0], s.rougesA[0]];
  };
  return Array.from({ length: n }, (_, i) => {
    const lambda = 0.8 + u() * 1.6;
    const mu = 0.6 + u() * 1.2;
    const seed = 1000 + i;
    const pts = [...creneaux.map((c) => c - 1), NB_CRENEAUX - 1];
    const f = pts.map((K) => etat(K, lambda, mu, seed));
    const buts = [];
    const rouges = [];
    let avant = [0, 0, 0, 0];
    pts.forEach((K, j) => {
      const x = f[j];
      const k = Math.max(0, K);
      for (let q = avant[0]; q < x[0]; q++) buts.push([k, 0]);
      for (let q = avant[1]; q < x[1]; q++) buts.push([k, 1]);
      for (let q = avant[2]; q < x[2]; q++) rouges.push([k, 0]);
      for (let q = avant[3]; q < x[3]; q++) rouges.push([k, 1]);
      avant = x;
    });
    return { type: 'match', cle: `t${i}`, matchKey: `t${i}`, date: '2026-10-01', ligne: { lambda, mu, rho: 0, grille, fair: null }, resultat: { hg90: f.at(-1)[0], ag90: f.at(-1)[1], buts, rouges } };
  });
}

// ------------------------------------------------------------ la copie : registre, règles, documents, passe

/** Le registre de la mesure DE LA COPIE avec l'ajout de la 46 (colonne, date), posé sur le texte SANS la 46 ; rend le texte d'avant. */
export function poserLe46(copie, { colonne, date }) {
  const f = path.join(copie.serveur, 'src', 'bench', 'lancements.js');
  const avant = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, avecLesAjoutsDe46(sansLesAjoutsDe46('bench/lancements.js', avant), { colonne, date }));
  return avant;
}

/** Les balises des deux blancs remplis par script (les mêmes que scripts/etape46.mjs, BALISES_DU_BANC). */
const BALISES_COLONNE = ['// <COLONNE fixée par script au scellement — ne pas modifier à la main>', '// </COLONNE>'];
const BALISES_SCELLEMENT = ['// <SCELLEMENT rempli par script au scellement — ne pas modifier à la main>', '// </SCELLEMENT>'];
function entreBalises(fichier, [debut, fin], contenu) {
  const texte = fs.readFileSync(fichier, 'utf8');
  const i = texte.indexOf(debut);
  const j = texte.indexOf(fin);
  if (i < 0 || j < i || texte.indexOf(debut, i + 1) >= 0 || texte.indexOf(fin, j + 1) >= 0) throw new Error(`balises absentes, en double ou dans le désordre : ${debut} (${fichier})`);
  fs.writeFileSync(fichier, `${texte.slice(0, i + debut.length)}\n${contenu}\n${texte.slice(j)}`);
}

/**
 * LA COPIE REMISE « AVANT LE SCELLEMENT » : la colonne à null, SCELLEMENT à null, la 46 retirée de son registre, aucune note ni
 * aucune fixture du banc. Le code, lui, est scellé à la manœuvre (colonne fixée, SCELLEMENT rempli, 46 posée, note recopiée) :
 * les essais du banc passent ainsi AVANT et APRÈS elle. Rend la copie.
 */
export function copieAvantLeSceau(copie) {
  const direct = path.join(copie.serveur, 'src', 'data', 'direct');
  entreBalises(path.join(direct, 'declarationDuDirect.js'), BALISES_COLONNE, 'export const COLONNE = null;');
  entreBalises(path.join(direct, 'bancDuDirect.js'), BALISES_SCELLEMENT, 'export const SCELLEMENT = null;');
  const lancements = path.join(copie.serveur, 'src', 'bench', 'lancements.js');
  fs.writeFileSync(lancements, sansLesAjoutsDe46('bench/lancements.js', fs.readFileSync(lancements, 'utf8')));
  fs.rmSync(path.join(direct, 'noteDuDirect.js'), { force: true });
  for (const f of ['banc-etape46-surete.json', 'banc-etape46-preuve.json', 'banc-regles-etape46.md', 'banc-avenant-etape46.md']) fs.rmSync(path.join(copie.serveur, 'test', 'fixtures', f), { force: true });
  return copie;
}

/**
 * LES PIÈCES D'UN BANC dans `dossier` : deux documents fabriqués, les règles qui les citent par sha1 (`citer: false` : la
 * seconde citation manque), libelles.json (règle de R16 non déclenchée, sauf `declenchee`), la passe de Pierre (null, sauf
 * `running`). Rend les chemins.
 */
export function piecesDuBanc(dossier, { citer = true, declenchee = false, running = null } = {}) {
  fs.mkdirSync(dossier, { recursive: true });
  const conception = path.join(dossier, 'conception-fabriquee.md');
  const critique = path.join(dossier, 'critique-fabriquee.md');
  fs.writeFileSync(conception, '# Conception fabriquée (essai du banc du direct)\n');
  fs.writeFileSync(critique, '# Critique fabriquée (essai du banc du direct)\n');
  const regles = path.join(dossier, 'regles-fabriquees.md');
  fs.writeFileSync(regles, `# Règles du banc 46 (FABRIQUÉES pour l'essai)\n\n- conception : ${sha1(conception)}\n${citer ? `- critique : ${sha1(critique)}\n` : ''}`);
  const libelles = path.join(dossier, 'libelles.json');
  fs.writeFileSync(libelles, JSON.stringify({ regleR16: { declenchee, retardMedianMin: 1, partSansRougeLu: 0.1 } }));
  const passe = path.join(dossier, 'refresh-status.json');
  fs.writeFileSync(passe, JSON.stringify({ running }));
  return { conception, critique, documents: `${conception},${critique}`, regles, libelles, passe };
}

/** Un avenant (R15 point 3) qui cite le sha1 du second export et sa date. */
export function avenantDe(fichier, { sha1Export, au }) {
  fs.writeFileSync(fichier, `# Avenant fabriqué au regard de preuve\n\nexport ${sha1Export}, jusqu'au ${au}\n`);
  return fichier;
}
