#!/usr/bin/env node
/**
 * import-historical-matches.mjs
 * -------------------------------------------------------------------------
 * Récupère l'historique des rencontres (résultats + stats d'équipe par match :
 * buts, tirs, tirs cadrés, corners, fautes, cartons, arbitre, cotes book) pour
 * les grands championnats européens sur les 5 dernières saisons, depuis les
 * fichiers CSV publics de football-data.co.uk, puis calcule le classement
 * (points, victoires/nuls/défaites, buts pour/contre, diff.) de chaque
 * championnat/saison à partir de ces résultats.
 *
 * Usage :
 *   node scripts/import-historical-matches.mjs
 *
 * Sortie (créée automatiquement) :
 *   server/data/fixtures/historique/<code-ligue>/<saison>.csv        (rencontres brutes)
 *   server/data/fixtures/historique/<code-ligue>/<saison>-classement.csv (classement calculé)
 *   server/data/fixtures/historique/_resume-import.json              (résumé de l'import)
 *
 * Source : https://www.football-data.co.uk (réutilisation libre, usage non
 * commercial / personnel — voir leurs conditions avant un usage commercial).
 * -------------------------------------------------------------------------
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "data", "fixtures", "historique");

// Codes de championnat football-data.co.uk -> nom lisible.
// (Liste "grands championnats européens" ; ajoute/retire des lignes au besoin.)
const LEAGUES = {
  E0: "Angleterre - Premier League",
  E1: "Angleterre - Championship",
  SC0: "Ecosse - Premiership",
  D1: "Allemagne - Bundesliga",
  D2: "Allemagne - 2. Bundesliga",
  I1: "Italie - Serie A",
  I2: "Italie - Serie B",
  SP1: "Espagne - La Liga",
  SP2: "Espagne - La Liga 2",
  F1: "France - Ligue 1",
  F2: "France - Ligue 2",
  N1: "Pays-Bas - Eredivisie",
  B1: "Belgique - Pro League",
  P1: "Portugal - Primeira Liga",
  T1: "Turquie - Super Lig",
  G1: "Grece - Super League",
};

// 5 dernières saisons (2021-22 -> 2025-26 en cours), format attendu par
// football-data.co.uk : "2122", "2223", "2324", "2425", "2526".
const SEASONS = ["2122", "2223", "2324", "2425", "2526"];

const BASE_URL = "https://www.football-data.co.uk/mmz4281";
const DELAY_MS = 600; // pour rester poli avec le serveur (pas d'API officielle)

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Parseur CSV minimal mais robuste aux champs entre guillemets contenant des virgules.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => (obj[h] = r[i] ?? ""));
    return obj;
  });
}

function computeStandings(matches) {
  const table = new Map();

  const ensure = (team) => {
    if (!table.has(team)) {
      table.set(team, {
        Equipe: team,
        J: 0,
        V: 0,
        N: 0,
        D: 0,
        BP: 0,
        BC: 0,
        Diff: 0,
        Pts: 0,
      });
    }
    return table.get(team);
  };

  for (const m of matches) {
    const home = m.HomeTeam;
    const away = m.AwayTeam;
    const fthg = parseInt(m.FTHG, 10);
    const ftag = parseInt(m.FTAG, 10);
    if (!home || !away || Number.isNaN(fthg) || Number.isNaN(ftag)) continue;

    const h = ensure(home);
    const a = ensure(away);

    h.J += 1;
    a.J += 1;
    h.BP += fthg;
    h.BC += ftag;
    a.BP += ftag;
    a.BC += fthg;

    if (fthg > ftag) {
      h.V += 1;
      h.Pts += 3;
      a.D += 1;
    } else if (fthg < ftag) {
      a.V += 1;
      a.Pts += 3;
      h.D += 1;
    } else {
      h.N += 1;
      a.N += 1;
      h.Pts += 1;
      a.Pts += 1;
    }
  }

  const standings = [...table.values()].map((t) => ({ ...t, Diff: t.BP - t.BC }));
  standings.sort((x, y) => y.Pts - x.Pts || y.Diff - x.Diff || y.BP - x.BP);
  standings.forEach((t, i) => (t.Rang = i + 1));
  return standings;
}

function toCSV(objects) {
  if (!objects.length) return "";
  const header = Object.keys(objects[0]);
  const escape = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(",")];
  for (const o of objects) lines.push(header.map((h) => escape(o[h])).join(","));
  return lines.join("\n");
}

async function fetchCSV(url) {
  const res = await fetch(url, { headers: { "User-Agent": "CoteMaster-DataImport/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  // Les fichiers football-data.co.uk sont en latin1 (accents dans noms d'arbitres, etc.)
  return new TextDecoder("latin1").decode(buf);
}

async function main() {
  const summary = { genere_le: new Date().toISOString(), championnats: {} };

  for (const [code, label] of Object.entries(LEAGUES)) {
    summary.championnats[code] = { label, saisons: {} };
    const leagueDir = path.join(OUT_DIR, code);
    await mkdir(leagueDir, { recursive: true });

    for (const season of SEASONS) {
      const url = `${BASE_URL}/${season}/${code}.csv`;
      process.stdout.write(`-> ${label} (${code}) ${season} ... `);
      try {
        const text = await fetchCSV(url);
        const rows = parseCSV(text);
        const objects = rowsToObjects(rows).filter((o) => o.HomeTeam);

        if (!objects.length) {
          console.log("aucune donnee (saison probablement non disponible)");
          summary.championnats[code].saisons[season] = { statut: "vide" };
          await sleep(DELAY_MS);
          continue;
        }

        await writeFile(path.join(leagueDir, `${season}.csv`), text, "latin1");

        const standings = computeStandings(objects);
        await writeFile(
          path.join(leagueDir, `${season}-classement.csv`),
          toCSV(standings)
        );

        console.log(`${objects.length} matchs, ${standings.length} equipes`);
        summary.championnats[code].saisons[season] = {
          statut: "ok",
          matchs: objects.length,
          equipes: standings.length,
        };
      } catch (err) {
        console.log(`ECHEC (${err.message})`);
        summary.championnats[code].saisons[season] = { statut: "echec", erreur: err.message };
      }
      await sleep(DELAY_MS);
    }
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUT_DIR, "_resume-import.json"),
    JSON.stringify(summary, null, 2)
  );
  console.log(`\nTermine. Resume ecrit dans ${path.join(OUT_DIR, "_resume-import.json")}`);
}

main().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
