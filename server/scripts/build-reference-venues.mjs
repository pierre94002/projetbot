#!/usr/bin/env node
/**
 * build-reference-venues.mjs — fabrique src/data/reference/venues.json (étape 13 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * Un stade par club, fait UNE fois (à refaire en début de saison pour les
 * promus) :
 *   1. le magasin (lecture seule) dit, pour chaque club qui a reçu en
 *      championnat ou en coupe continentale depuis le 1er juillet de l'an
 *      dernier, le stade où il a le plus joué à domicile (meta.stadium de ses
 *      rencontres) et la dernière rencontre jouée là ;
 *   2. FotMob (gratuit) donne, sur la page de cette rencontre, le stade
 *      complet : nom, ville, pays, latitude, longitude, capacité, pelouse
 *      (infoBox.Stadium) — une requête par stade distinct, 2 s entre deux ;
 *   3. l'altitude vient d'une courte liste faite à la main (src/data/reference/
 *      altitudes.js : villes à environ 1 500 m ou plus des compétitions du
 *      magasin), jamais devinée ; ailleurs : null.
 *
 *   node scripts/build-reference-venues.mjs                  tout (réseau FotMob : ~950 requêtes, ~35 min)
 *   node scripts/build-reference-venues.mjs --lus <fichier>  reprend les pages déjà lues (JSON { "stade|ville": { stade } })
 *   node scripts/build-reference-venues.mjs --sans-reseau    seulement ce que --lus contient
 *
 * Lecture seule de la base (jamais d'écriture) ; n'écrit que venues.json et,
 * avec --lus, le fichier de reprise.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { resolveDbPath } from '../src/data/db/matchStatsDb.js';
import { ALTITUDES, SOURCE_ALTITUDE } from '../src/data/reference/altitudes.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SORTIE = path.resolve(ICI, '../src/data/reference/venues.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const COUPES_NATIONALES = /^(FA Cup|EFL Cup|Coupe de|Copa del Rey|DFB Pokal|Coppa Italia|KNVB Cup|Taça|Türkiye Kupası|Copa do Brasil|Copa Argentina|Copa Chile|Canadian Championship|US Open Cup|Leagues Cup)/;

const argv = process.argv.slice(2);
const valeur = (o) => (argv.includes(o) ? argv[argv.indexOf(o) + 1] : undefined);
const fichierLus = valeur('--lus') ?? null;
const sansReseau = argv.includes('--sans-reseau');
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const dire = (t) => process.stderr.write(`${t}\n`);

// 1. Les clubs et leur stade habituel (base en LECTURE SEULE).
const maintenant = new Date();
const depuis = `${maintenant.getUTCFullYear() - 1}-07-01`;
const db = new DatabaseSync(resolveDbPath(), { readOnly: true });
const lignes = db
  .prepare(`SELECT fotmob_id, date, league, home_id, home_name, json_extract(meta,'$.stadium') stade, json_extract(meta,'$.city') ville,
      json_extract(meta,'$.capacity') capacite, json_extract(meta,'$.surface') pelouse
    FROM matches WHERE date >= ? AND home_id IS NOT NULL ORDER BY date DESC`)
  .all(depuis);
db.close();
const clubs = new Map();
for (const m of lignes) {
  if (COUPES_NATIONALES.test(m.league)) continue;
  const c = clubs.get(m.home_id) ?? { id: m.home_id, nom: m.home_name, ligues: new Map(), stades: new Map(), domicile: 0 };
  c.domicile++;
  c.ligues.set(m.league, (c.ligues.get(m.league) ?? 0) + 1);
  const cle = m.stade ? `${m.stade}|${m.ville ?? ''}` : null;
  if (cle) {
    const s = c.stades.get(cle) ?? { cle, n: 0, fotmobId: null, date: null, autres: [] };
    s.n++;
    if (!s.fotmobId && m.fotmob_id) Object.assign(s, { fotmobId: m.fotmob_id, date: m.date });
    else if (m.fotmob_id && s.autres.length < 2) s.autres.push(m.fotmob_id);
    c.stades.set(cle, s);
  }
  clubs.set(m.home_id, c);
}

// 2. Les pages FotMob, une par stade distinct. Une page qui ne donne pas le
//    stade (cela arrive) : la rencontre précédente jouée là, deux fois au plus.
const lus = fichierLus && fs.existsSync(fichierLus) ? JSON.parse(fs.readFileSync(fichierLus, 'utf8')) : {};
const choisis = [...clubs.values()].map((c) => ({ ...c, stade: [...c.stades.values()].sort((a, b) => b.n - a.n || String(b.date).localeCompare(String(a.date)))[0] ?? null }));
let requetes = 0;
async function lirePage(fotmobId) {
  await new Promise((r) => setTimeout(r, 2000));
  requetes++;
  try {
    const r = await fetch(`https://www.fotmob.com/api/data/matchDetails?matchId=${fotmobId}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const p = await r.json();
    return { fotmobId, lu: new Date().toISOString(), stade: p?.content?.matchFacts?.infoBox?.Stadium ?? null };
  } catch (error) {
    return { fotmobId, lu: new Date().toISOString(), erreur: error.message };
  }
}
for (const c of choisis) {
  if (!c.stade?.fotmobId || sansReseau) continue;
  const essais = [c.stade.fotmobId, ...c.stade.autres];
  let lu = lus[c.stade.cle];
  if (lu?.stade || lu?.erreur) continue;
  const dejaEssayes = new Set(lu?.essayes ?? (lu ? [lu.fotmobId] : []));
  for (const id of essais.filter((x) => !dejaEssayes.has(x))) {
    lu = await lirePage(id);
    dejaEssayes.add(id);
    lus[c.stade.cle] = { ...lu, essayes: [...dejaEssayes] };
    if (lu.stade || lu.erreur) break;
  }
  if (fichierLus && requetes % 25 === 0) fs.writeFileSync(fichierLus, JSON.stringify(lus));
}
if (fichierLus && requetes) fs.writeFileSync(fichierLus, JSON.stringify(lus));

// 3. Le fichier.
const altitudeDe = (ville, pays) => ALTITUDES.find((a) => norm(a.pays) === norm(pays) && a.villes.some((v) => norm(v) === norm(ville))) ?? null;
const venues = {};
const manques = [];
for (const c of choisis.sort((a, b) => a.id.localeCompare(b.id))) {
  const ligue = [...c.ligues.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const lu = c.stade ? lus[c.stade.cle] : null;
  const s = lu?.stade;
  const lat = Number(s?.lat);
  const long = Number(s?.long);
  const coordonnees = Number.isFinite(lat) && Number.isFinite(long) && Math.abs(lat) <= 90 && Math.abs(long) <= 180 && !(lat === 0 && long === 0);
  if (!c.stade) {
    manques.push({ id: c.id, nom: c.nom, raison: 'aucune rencontre à domicile avec un stade au magasin' });
    continue;
  }
  if (!s) {
    const raison = lu?.erreur ? `page FotMob en échec : ${lu.erreur}` : lu ? `les pages FotMob de ${lu.essayes?.length ?? 1} rencontre(s) jouée(s) là ne donnent pas le stade` : 'page FotMob pas lue';
    manques.push({ id: c.id, nom: c.nom, raison });
    continue;
  }
  const pelouse = s.surface ? String(s.surface) : null;
  const alt = altitudeDe(s.city, s.country);
  venues[c.id] = {
    nom: c.nom,
    championnat: ligue,
    stade: s.name ?? c.stade.cle.split('|')[0],
    ville: s.city ?? null,
    pays: s.country ?? null,
    lat: coordonnees ? lat : null,
    long: coordonnees ? long : null,
    capacite: Number.isFinite(Number(s.capacity)) && Number(s.capacity) > 0 ? Number(s.capacity) : null,
    pelouse,
    synthetique: pelouse ? /artificial|synthetic|turf/i.test(pelouse) : null,
    altitude: alt ? alt.altitude : null,
    matchsAuStade: c.stade.n,
    matchsADomicile: c.domicile,
    lu: { rencontreFotmob: c.stade.fotmobId, le: c.stade.date }
  };
  if (!coordonnees) manques.push({ id: c.id, nom: c.nom, raison: 'FotMob ne donne pas les coordonnées de ce stade' });
}
const fichier = {
  version: 1,
  faitLe: maintenant.toISOString().slice(0, 10),
  sources: {
    clubs: `Magasin FotMob du bac à sable (lecture seule) : clubs qui ont reçu en championnat ou en coupe continentale depuis le ${depuis}, et le stade où chacun a le plus joué à domicile (meta.stadium).`,
    stades: 'FotMob, page d’une rencontre jouée à ce stade (infoBox.Stadium : nom, ville, pays, latitude, longitude, capacité, pelouse), une requête par stade distinct.',
    synthetique: 'Pelouse « artificial turf » (ou synthétique) chez FotMob ; « grass » = naturelle ; pelouse non donnée = null.',
    altitude: SOURCE_ALTITUDE
  },
  altitudes: ALTITUDES,
  clubs: venues,
  manques
};
// Un club par ligne : le fichier se relit (et se compare d'une version à l'autre) club par club.
const { clubs: _clubs, manques: _manques, ...tete } = fichier;
const entete = JSON.stringify(tete, null, 1).replace(/\n}$/, '');
const lignesClubs = Object.entries(venues).map(([id, v]) => `  ${JSON.stringify(id)}: ${JSON.stringify(v)}`);
const lignesManques = manques.map((m) => `  ${JSON.stringify(m)}`);
fs.writeFileSync(SORTIE, `${entete},\n "clubs": {\n${lignesClubs.join(',\n')}\n },\n "manques": [\n${lignesManques.join(',\n')}\n ]\n}\n`);
JSON.parse(fs.readFileSync(SORTIE, 'utf8')); // relu : un fichier mal formé ne reste jamais
const avec = Object.values(venues);
dire(`${avec.length} clubs, ${avec.filter((v) => v.lat !== null).length} avec coordonnées, ${avec.filter((v) => v.synthetique === true).length} pelouses synthétiques, ${avec.filter((v) => v.altitude !== null).length} en altitude ; ${manques.length} manque(s) ; ${requetes} requête(s) FotMob.`);
process.stdout.write(`${JSON.stringify({ clubs: avec.length, coordonnees: avec.filter((v) => v.lat !== null).length, synthetiques: avec.filter((v) => v.synthetique === true).length, altitude: avec.filter((v) => v.altitude !== null).length, manques: manques.length, requetes, sortie: SORTIE })}\n`);
