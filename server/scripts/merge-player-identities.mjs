#!/usr/bin/env node
/**
 * merge-player-identities.mjs
 * -----------------------------------------------------------------------
 * FotMob publie parfois le même homme sous DEUX identifiants : l'un dans
 * playerStats et l'autre dans la composition d'une même feuille (Matheus
 * Albino 1461840 / 1204392), ou l'un après l'autre au fil des saisons (Luis
 * Pavez 491925 / 50552). L'annuaire scindait alors une carrière en deux
 * fiches. Ce script trouve les candidats, les VÉRIFIE chez la source, puis
 * enregistre l'équivalence (table people_merges) et réécrit les lignes.
 *
 * Trois familles de candidats :
 *   1. même feuille : une ligne dont la clé (identifiant lu une première
 *      fois) et l'identifiant (lu ensuite) diffèrent ;
 *   2. même nom, même club, jamais alignés ensemble ;
 *   3. même nom de famille et prénom en préfixe (« Danny » / « Daniel »
 *      Lafferty), même club, jamais alignés ensemble.
 *
 * La preuve est la DATE DE NAISSANCE publiée par la page joueur FotMob
 * (playerData) : égale, c'est le même homme ; différente ou absente d'un
 * côté, on ne fusionne pas (Hugo Souza ×2 à Corinthians : 1985 et 1999,
 * deux hommes). L'identifiant conservé est celui qui a le plus
 * d'apparitions.
 *
 *   node scripts/merge-player-identities.mjs            # à blanc
 *   node scripts/merge-player-identities.mjs --apply    # enregistre et réécrit
 * -----------------------------------------------------------------------
 */

import { openDb } from '../src/data/db/matchStatsDb.js';
import { rebuildRegistries } from '../src/data/db/identityRegistry.js';

const APPLY = process.argv.includes('--apply');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const db = openDb();

const naissances = new Map();
async function naissance(playerId) {
  if (naissances.has(playerId)) return naissances.get(playerId);
  let valeur = null;
  try {
    const r = await fetch(`https://www.fotmob.com/api/data/playerData?id=${playerId.replace('fotmob-', '')}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (r.ok) {
      const d = await r.json();
      valeur = d?.birthDate?.utcTime ? String(d.birthDate.utcTime).slice(0, 10) : null;
    }
  } catch { /* page absente : pas de preuve */ }
  naissances.set(playerId, valeur);
  return valeur;
}

const apparitions = (id) => db.prepare('SELECT COUNT(*) n FROM players WHERE player_id = ?').get(id).n;
// L'identifiant CONSERVÉ est celui que FotMob emploie aujourd'hui : celui de
// la lecture la plus récente (la clé d'une ligne garde l'identifiant sous
// lequel elle a été lue la première fois). Ses listes officielles sont
// publiées sous cet identifiant-là — garder le plus ancien rendait Luis
// Pavez « absent » des buteurs de la Sudamericana.
const derniereLecture = (id) => db.prepare('SELECT MAX(m.date) d FROM players p JOIN matches m ON m.match_key = p.match_key WHERE p.player_key = ? OR p.player_id = ?').get(id, id).d ?? '';
const coPresents = db.prepare('SELECT 1 FROM players x JOIN players y ON y.match_key = x.match_key WHERE x.player_id = ? AND y.player_id = ? LIMIT 1');
const dejaFusionne = new Set(db.prepare('SELECT from_id FROM people_merges').all().map((r) => r.from_id));

// --- 1. Même feuille -------------------------------------------------------
const candidats = new Map(); // "a|b" -> { a, b, famille }
for (const r of db.prepare(`SELECT player_key a, player_id b FROM players WHERE player_key LIKE 'fotmob-%' AND player_id IS NOT NULL AND player_id <> player_key GROUP BY a, b`).all()) {
  candidats.set([r.a, r.b].sort().join('|'), { a: r.a, b: r.b, famille: 'meme-feuille' });
}
// --- 2. Même nom, même club --------------------------------------------------
for (const r of db.prepare(`SELECT a.player_id a, b.player_id b FROM people a JOIN people b ON b.slug = a.slug AND b.team_id = a.team_id AND b.player_id > a.player_id
  WHERE a.player_id LIKE 'fotmob-%' AND b.player_id LIKE 'fotmob-%'`).all()) {
  const cle = [r.a, r.b].sort().join('|');
  if (!candidats.has(cle)) candidats.set(cle, { a: r.a, b: r.b, famille: 'meme-nom' });
}
// --- 3. Prénom en préfixe, même nom de famille, même club ---------------------
const gens = db.prepare(`SELECT player_id, slug, team_id FROM people WHERE player_id LIKE 'fotmob-%' AND team_id IS NOT NULL AND slug LIKE '%-%'`).all();
const parClubEtNom = new Map();
for (const g of gens) {
  const parts = g.slug.split('-');
  const cle = `${g.team_id}|${parts[parts.length - 1]}`;
  if (!parClubEtNom.has(cle)) parClubEtNom.set(cle, []);
  parClubEtNom.get(cle).push({ ...g, prenom: parts[0] });
}
for (const liste of parClubEtNom.values()) {
  for (let i = 0; i < liste.length; i++) for (let j = i + 1; j < liste.length; j++) {
    const p = liste[i].prenom, q = liste[j].prenom;
    if (p === q || p.length < 3 || q.length < 3 || !(p.startsWith(q) || q.startsWith(p))) continue;
    const cle = [liste[i].player_id, liste[j].player_id].sort().join('|');
    if (!candidats.has(cle)) candidats.set(cle, { a: liste[i].player_id, b: liste[j].player_id, famille: 'prenom-prefixe' });
  }
}

console.error(`${candidats.size} paire(s) candidate(s) : ${[...candidats.values()].reduce((acc, c) => ({ ...acc, [c.famille]: (acc[c.famille] ?? 0) + 1 }), {}) && JSON.stringify([...candidats.values()].reduce((acc, c) => ({ ...acc, [c.famille]: (acc[c.famille] ?? 0) + 1 }), {}))}`);

// Deux lignes du même homme sur une même feuille (ligne ESPN identifiée par
// la composition à côté de la ligne playerStats) : la ligne sans identité
// d'origine (clé « name: »), ou à défaut la moins renseignée, est de trop.
const doublons = db.prepare(`SELECT x.match_key, x.side, x.player_key kx, y.player_key ky,
    (x.rating IS NOT NULL) + (x.passes IS NOT NULL) + (x.minutes IS NOT NULL) sx,
    (y.rating IS NOT NULL) + (y.passes IS NOT NULL) + (y.minutes IS NOT NULL) sy
  FROM players x JOIN players y ON y.match_key = x.match_key AND y.side = x.side WHERE x.player_id = ? AND y.player_id = ?`);
const ligneDeTrop = (d) => {
  if (d.kx.startsWith('name:') && !d.ky.startsWith('name:')) return d.kx;
  if (d.ky.startsWith('name:') && !d.kx.startsWith('name:')) return d.ky;
  return d.sx >= d.sy ? d.ky : d.kx;
};

const fusions = [];
const refus = [];
for (const { a, b, famille } of candidats.values()) {
  if (dejaFusionne.has(a) || dejaFusionne.has(b)) continue;
  if (!/^fotmob-\d+$/.test(a) || !/^fotmob-\d+$/.test(b)) { refus.push(`${a} / ${b} (${famille}) : identifiant bouchon`); continue; }
  const [na, nb] = await Promise.all([naissance(a), naissance(b)]);
  if (!na || !nb) { refus.push(`${a} / ${b} (${famille}) : date de naissance absente (${na ?? '?'} / ${nb ?? '?'})`); continue; }
  if (na !== nb) { refus.push(`${a} / ${b} (${famille}) : dates de naissance différentes (${na} / ${nb})`); continue; }
  const [appA, appB] = [apparitions(a), apparitions(b)];
  const [dA, dB] = [derniereLecture(a), derniereLecture(b)];
  const [garde, fusionne] = dA === dB ? (appA >= appB ? [a, b] : [b, a]) : dA > dB ? [a, b] : [b, a];
  const nom = db.prepare('SELECT name FROM people WHERE player_id = ?').get(garde)?.name ?? db.prepare('SELECT name FROM players WHERE player_id = ? LIMIT 1').get(garde)?.name ?? '?';
  const enDouble = doublons.all(a, b).map((d) => ({ match_key: d.match_key, side: d.side, key: ligneDeTrop(d) }));
  fusions.push({ from: fusionne, to: garde, evidence: `${famille} + naissance ${na}`, nom, appA: Math.max(appA, appB), appB: Math.min(appA, appB), enDouble });
}

for (const f of fusions) console.error(`fusion : ${f.from} → ${f.to} ${f.nom} (${f.evidence}, ${f.appB} + ${f.appA} apparitions${f.enDouble.length ? `, ${f.enDouble.length} ligne(s) en double à retirer` : ''})`);
for (const r of refus) console.error(`refus  : ${r}`);
const totalDoubles = fusions.reduce((n, f) => n + f.enDouble.length, 0);
console.error(`\n${fusions.length} fusion(s) retenue(s), ${refus.length} refusée(s), ${totalDoubles} ligne(s) en double${APPLY ? '' : ' — à blanc, rien n\'est écrit (--apply pour appliquer)'}.`);

let lignes = 0;
let retirees = 0;
if (APPLY && fusions.length) {
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const ins = db.prepare('INSERT OR REPLACE INTO people_merges (from_id, to_id, evidence, created_at) VALUES (?, ?, ?, ?)');
    const upd = db.prepare('UPDATE players SET player_id = ? WHERE player_id = ?');
    const del = db.prepare('DELETE FROM players WHERE match_key = ? AND side = ? AND player_key = ?');
    for (const f of fusions) {
      for (const d of f.enDouble) retirees += del.run(d.match_key, d.side, d.key).changes;
      ins.run(f.from, f.to, f.evidence, now);
      lignes += upd.run(f.to, f.from).changes;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  console.error(`${lignes} ligne(s) joueur réécrite(s), ${retirees} retirée(s) ; annuaires : ${JSON.stringify(rebuildRegistries({ database: db }))}`);
}
console.log(JSON.stringify({ candidates: candidats.size, merged: fusions.length, refused: refus.length, rowsRewritten: lignes, rowsRemoved: retirees, applied: APPLY, merges: fusions.map((f) => ({ from: f.from, to: f.to, name: f.nom, evidence: f.evidence, duplicates: f.enDouble.length })) }));
