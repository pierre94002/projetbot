/**
 * diagnosticMeteoEnfant.js — LE DIAGNOSTIC DE LA MÉTÉO RANGÉE, DANS UN PROCESSUS À PART (étape 32 du plan, partie B,
 * 29/10/2026).
 * -----------------------------------------------------------------------
 * Lancé par scripts/match-context.mjs --diagnostic-meteo (fork, argument « --enfant-diagnostic-meteo ») ; ce n'est pas un
 * script à lancer à la main. La base est ouverte EN LECTURE SEULE ; aucune écriture, aucune horloge (seules des dates
 * lues), ni réseau, ni Claude. AUCUN RÉSULTAT LU (ni score, ni but, ni carton).
 *
 * Il vit HORS de data/contexte/ exprès : rien du contexte du match (la fiche, la passe, le cache, le banc) ne lit la météo
 * d'une rencontre (test contexteFuite T-F3/T-F4) — la seule météo admise est celle de l'archive d'avant-match
 * (matchStatsDb.js). Ce diagnostic, lui, est une preuve pour Pierre : pour chaque instantané d'avant-match des analyses
 * IA (apporté par le script : identifiant FotMob, heure du relevé, météo PRÉVUE), relevé avant le coup d'envoi et dont la
 * rencontre est au magasin, l'écart entre la météo prévue et la météo RANGÉE (relue après le match) : la météo rangée
 * n'est pas la prévision, c'est pourquoi le banc ne la mesure pas.
 * -----------------------------------------------------------------------
 */

import { openDb } from './matchStatsDb.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const part = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : null);

/** La météo RANGÉE d'une rencontre (par son identifiant FotMob) et son coup d'envoi : jamais un score. */
export const SQL_DE_LA_METEO = `SELECT json_extract(meta, '$.temperature') AS temperature, json_extract(meta, '$.windSpeed') AS vent,
  json_extract(meta, '$.weather') AS description, json_extract(meta, '$.precipitation') AS pluie, json_extract(meta, '$.kickoff') AS kickoff,
  date FROM matches WHERE fotmob_id = ? LIMIT 1`;

/**
 * LE DIAGNOSTIC : `instantanes` = [{ fotmobMatchId, fetchedAt, commenceTime, prevu: { temperature, windSpeed, weather,
 * precipitation } }]. Un instantané relevé après le coup d'envoi (celui du magasin, sinon l'annoncé) est écarté et compté ;
 * une rencontre absente du magasin aussi. Rend les écarts (médiane et 90e centile des écarts absolus, écart moyen, nombre
 * d'égalités), la part de même description, la pluie prévue face à la pluie rangée, et quelques exemples.
 */
export function diagnostiquerLaMeteo({ database, instantanes }) {
  const st = database.prepare(SQL_DE_LA_METEO);
  const ecartsT = [];
  const ecartsV = [];
  const ecartsP = [];
  let memeDescription = 0;
  let descriptions = 0;
  const pluie = { prevueEtRangee: 0, prevueSeulement: 0, rangeeSeulement: 0, niLUneNiLAutre: 0 };
  const compte = { instantanes: instantanes.length, apresLeCoupDEnvoi: 0, absentsDuMagasin: 0, compares: 0 };
  const exemples = [];
  for (const i of instantanes) {
    const r = st.get(String(i.fotmobMatchId));
    if (!r) {
      compte.absentsDuMagasin += 1;
      continue;
    }
    const coup = Date.parse(r.kickoff ?? i.commenceTime ?? '');
    const releve = Date.parse(i.fetchedAt ?? '');
    if (!Number.isFinite(coup) || !Number.isFinite(releve) || !(releve < coup)) {
      compte.apresLeCoupDEnvoi += 1;
      continue;
    }
    compte.compares += 1;
    const p = i.prevu ?? {};
    if (fini(p.temperature) && fini(r.temperature)) ecartsT.push(r.temperature - p.temperature);
    if (fini(p.windSpeed) && fini(r.vent)) ecartsV.push(r.vent - p.windSpeed);
    if (fini(p.precipitation) && fini(r.pluie)) ecartsP.push(r.pluie - p.precipitation);
    if (typeof p.weather === 'string' && typeof r.description === 'string') {
      descriptions += 1;
      if (p.weather.trim() === r.description.trim()) memeDescription += 1;
    }
    if (fini(p.precipitation) && fini(r.pluie)) {
      const a = p.precipitation > 0;
      const b = r.pluie > 0;
      pluie[a && b ? 'prevueEtRangee' : a ? 'prevueSeulement' : b ? 'rangeeSeulement' : 'niLUneNiLAutre'] += 1;
    }
    if (exemples.length < 8) exemples.push({ date: r.date, prevu: { temperature: p.temperature ?? null, vent: p.windSpeed ?? null, description: p.weather ?? null, pluie: p.precipitation ?? null }, range: { temperature: r.temperature, vent: r.vent, description: r.description, pluie: r.pluie } });
  }
  const resume = (v) => {
    if (!v.length) return { n: 0 };
    const abs = v.map((x) => Math.abs(x)).sort((a, b) => a - b);
    const q = (p) => abs[Math.min(abs.length - 1, Math.round(p * (abs.length - 1)))];
    return { n: v.length, ecartAbsoluMedian: q(0.5), ecartAbsolu90: q(0.9), ecartMoyen: v.reduce((s, x) => s + x, 0) / v.length, identiques: v.filter((x) => x === 0).length };
  };
  return {
    aucunResultatLu: true,
    compte,
    temperature: resume(ecartsT),
    ventMetresParSeconde: resume(ecartsV),
    precipitations: resume(ecartsP),
    description: { comparees: descriptions, identiques: memeDescription, part: part(memeDescription, descriptions) },
    pluie,
    exemples
  };
}

// ------------------------------------------------------------ le processus à part
if (process.argv.includes('--enfant-diagnostic-meteo') && typeof process.send === 'function') {
  process.once('message', (m) => {
    try {
      const database = openDb({ file: m.chemin, readonly: true });
      const r = diagnostiquerLaMeteo({ database, instantanes: m.instantanes ?? [] });
      process.send({ fin: true, mode: 'diagnostic-meteo', resultat: r }, () => process.exit(0));
    } catch (error) {
      process.send({ erreur: String(error?.stack ?? error?.message ?? error).slice(0, 4000) }, () => process.exit(0));
    }
  });
}
