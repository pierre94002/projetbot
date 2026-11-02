/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-contexte-preuve.mjs <serveur de la copie> <phase> <options JSON>
 *
 * LA PREUVE APRÈS LANCEMENT du contexte du match (étape 32, partie C2, 02/11/2026), sur un MAGASIN FABRIQUÉ
 * (contexteFabrique.mjs : huit clubs réels de venues.json, des matchs fabriqués — aucun résultat réel), réseau coupé,
 * heure figée, base NEUVE de la copie, registre de la mesure de la copie :
 *   nuits   le lancement de l'étape 32 noté au registre (premier démarrage fabriqué, le 25/08/2026), un calendrier de saison
 *           fait des matchs du magasin, puis des nuits de suite (tous les 3 jours, dans le PROCESSUS À PART) avec un
 *           horizon d'essai court : à chaque nuit, ce que la nuit a calculé et rangé pour la preuve, l'état
 *           (`contexte_etat` : preuve, principal, surete, dementis) et le registre de l'étape 32 (T-N6) ; puis, sur la base
 *           de la dernière nuit, les lectures de la preuve (T-F6) : une fiche « après le coup d'envoi », un avant-match
 *           relevé après le coup d'envoi, un autre stade relevé avant, une météo absurde plantée ; et la base au jour J de
 *           la preuve face à celle du banc (contexteBancEnfant.passeDuBanc), à l'égalité exacte.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur } from './versionsMoteurCommun.mjs';
import { fabriquerLeMagasin, plusJours } from './contexteFabrique.mjs';

const [serveur, phase, brut] = process.argv.slice(2);
const o = JSON.parse(brut ?? '{}');
const imp = importeur(serveur);
const M = await imp('data/db/matchStatsDb.js');
const s = { ok: true, phase };
const dossier = process.env.CM_TEST_DOSSIER;

if (phase === 'nuits') {
  const database = M.openDb();
  const { lireStades } = await imp('data/reference/donneesDeReference.js');
  const { rebuildRegistries } = await imp('data/db/identityRegistry.js');
  const fab = fabriquerLeMagasin(database, { venues: lireStades(), rebuildRegistries, jours: o.jours ?? 75 });
  const N = await imp('data/contexte/contexteNuit.js');
  const P = await imp('data/contexte/preuveDuContexte.js');
  const R = await imp('bench/trialsRegistry.js');
  const CB = await imp('data/contexte/contexteBancEnfant.js');
  // Le premier démarrage fabriqué : le lancement de l'étape 32 (et des autres) noté au registre de la COPIE.
  const lancementLe = o.lancement ?? '2026-08-25';
  R.enregistrerLancements({ maintenant: Date.parse(`${plusJours(lancementLe, -1)}T22:30:00.000Z`) });
  s.lancement = R.lancementDe('32', { maintenant: Date.parse(`${lancementLe}T12:00:00.000Z`) });
  // Le calendrier de saison : les matchs du magasin à partir du jour du lancement, à venir (noms des clubs).
  const nomDe = new Map(fab.clubs.map((c) => [c.id, c.nom]));
  const fichierCalendrier = path.join(dossier, 'calendrier.json');
  const cal = fab.matchs.filter((m) => m.date >= lancementLe).map((m) => ({ id: `cal-${m.matchKey}`, matchId: `cal-${m.matchKey}`, date: m.date, league: m.league, homeName: nomDe.get(m.home), awayName: nomDe.get(m.away), status: 'scheduled', homeGoals: null, awayGoals: null, round: null, source: 'fotmob', updatedAt: `${lancementLe}T00:00:00.000Z` }));
  fs.writeFileSync(fichierCalendrier, JSON.stringify(cal));
  s.calendrier = cal.length;
  s.dernierMatch = fab.matchs.at(-1).date;
  const horizon = o.horizon ?? { jours: 18, matchs: { 'repos-court': 6, 'enchainement-serre': 6, 'deplacement-altitude': 3 } };
  s.horizon = horizon;
  const registre = (t) => R.jugementsDe('32', { maintenant: t }).map((j) => ({ quoi: j.quoi, principal: j.principal === true, lancement: j.lancement, le: j.le, verdict: j.verdict, etape: j.etape }));
  const nuits = [];
  const dernierJour = o.dernierJour ?? '2026-10-11';
  for (let jourD = lancementLe; jourD <= dernierJour; jourD = plusJours(jourD, 3)) {
    const maintenant = `${plusJours(jourD, -1)}T23:30:00.000Z`;
    const r = await N.faireLeContexteDeLaNuit({ maintenant, fichierCalendrier, aPart: true, horizonDeLaPreuve: horizon });
    const p = r.preuve ?? null;
    nuits.push({
      jourD,
      maintenant,
      mode: r.mode,
      erreur: r.erreur ?? null,
      preuve: p ? { rien: p.rien ?? null, erreur: p.erreur ?? null, principauxCalcules: p.principauxCalcules ?? [], principauxRanges: p.principauxRanges ?? [], refuses: p.refuses ?? [], garde: p.garde ? { faite: p.garde.faite, regard: p.garde.regard, raison: p.garde.raison, regards: p.garde.regards } : null, nouveauxDementis: p.nouveauxDementis ?? [] } : null,
      etat: { preuve: N.lireLaValeur(database, 'preuve'), principal: N.lireLaValeur(database, 'principal'), surete: N.lireLaValeur(database, 'surete'), dementis: N.lireLaValeur(database, 'dementis') },
      registre: registre(Date.parse(maintenant)),
      blocMaxMs: r.blocMaxMs ?? null,
      dureePreuveMs: r.bilan?.durees?.preuve ?? null,
      phrase: P.phraseDeLaPreuve(p)
    });
  }
  s.nuits = nuits;

  // ---------------------------------------------------- T-F6 : les lectures de la preuve, sur la base de la dernière nuit
  const avant = plusJours(dernierJour, 1);
  const variantes = P.variantesDeLaPreuve();
  const lire = () => {
    const r = P.lireLesMatchsDeLaPreuve(database, { depuis: lancementLe, avant });
    P.basesDesMatchs(database, r.matchs, { jusqua: plusJours(avant, -1) });
    return { r, lignes: P.lignesDeLaPreuve(r.matchs, variantes) };
  };
  const resume = (x) => ({ matchs: x.r.matchs.length, comptes: x.r.comptes, cles: x.r.matchs.map((m) => m.cle), dates: [x.r.matchs[0]?.date ?? null, x.r.matchs.at(-1)?.date ?? null], lignes: Object.fromEntries(Object.entries(x.lignes).map(([id, L]) => [id, L.map((l) => l.bloc)])) });
  const ref = lire();
  s.reference = resume(ref);
  s.lignesReference = JSON.stringify(ref.lignes);
  s.toutesLesDatesDansLaFenetre = ref.r.matchs.every((m) => m.date > lancementLe && m.date < avant);
  // Les bornes sont STRICTES : relu entre deux jours qui ont des matchs, ces deux jours sont exclus.
  const jours = [...new Set(ref.r.matchs.map((m) => m.date))];
  const [b1, b2] = [jours[2], jours.at(-3)];
  const entre = P.lireLesMatchsDeLaPreuve(database, { depuis: b1, avant: b2 });
  s.bornes = { depuis: b1, avant: b2, lus: entre.matchs.length, dansLaFenetre: entre.matchs.every((m) => m.date > b1 && m.date < b2), attendus: ref.r.matchs.filter((m) => m.date > b1 && m.date < b2).length, auxBornes: ref.r.matchs.filter((m) => m.date === b1 || m.date === b2).length };
  // La base au jour J de la preuve = celle du banc (la même chaîne), à l'égalité exacte.
  const periodes = { miseEnRoute: { de: '2026-01-01', a: '2026-07-31' }, plis: [{ apprendre: { de: '2026-08-01', a: '2026-08-31' }, juger: { de: '2026-09-01', a: '2026-12-31' } }, { apprendre: { de: '2026-09-01', a: '2026-12-31' }, juger: { de: '2026-08-01', a: '2026-08-31' } }], dernierJourLu: plusJours(avant, -1) };
  const banc = new Map(CB.passeDuBanc({ database, periodes, avecResultats: true }).rencontres.map((x) => [x.cle, x.base]));
  const ecartsDeBase = ref.r.matchs.filter((m) => JSON.stringify(m.base) !== JSON.stringify(banc.get(m.cle) ?? null)).map((m) => m.cle);
  s.bases = { comparees: ref.r.matchs.length, toutesPosees: ref.r.matchs.every((m) => m.base && Number.isFinite(m.base.lambda) && Number.isFinite(m.base.mu)), ecarts: ecartsDeBase };
  // Un avant-match planté sur un match en altitude : relevé APRÈS le coup d'envoi (ignoré), puis AVANT (un autre stade :
  // plus d'altitude), puis une météo absurde ajoutée (rien ne change).
  const alt = ref.lignes['deplacement-altitude']?.[0]?.bloc ?? null;
  s.altitude = { match: alt };
  if (alt) {
    const d = database.prepare('SELECT d.fotmob_id, d.date, d.league, d.home, d.away, c.kickoff FROM day_matches d LEFT JOIN contexte_rencontres c ON c.match_key = d.match_key WHERE d.match_key = ?').get(alt);
    const ko = Date.parse(d.kickoff);
    database.prepare('INSERT INTO contexte_avant_match (fotmob_id, date, kickoff, league, home_id, away_id, releve_le, avant_match, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)').run(String(d.fotmob_id), d.date, new Date(ko).toISOString(), d.league, d.home, d.away, new Date(ko + 3_600_000).toISOString(), JSON.stringify({ stadium: 'Stade Tout Ailleurs', surface: 'grass' }));
    const apres = lire();
    s.altitude.apres = { comptes: apres.r.comptes.avantMatch, garde: (apres.lignes['deplacement-altitude'] ?? []).some((l) => l.bloc === alt) };
    database.prepare('UPDATE contexte_avant_match SET releve_le = ? WHERE fotmob_id = ?').run(new Date(ko - 7_200_000).toISOString(), String(d.fotmob_id));
    const avantKo = lire();
    s.altitude.avant = { comptes: avantKo.r.comptes.avantMatch, garde: (avantKo.lignes['deplacement-altitude'] ?? []).some((l) => l.bloc === alt), ailleurs: avantKo.r.matchs.find((m) => m.cle === alt)?.x?.ailleurs === true, stade: avantKo.r.matchs.find((m) => m.cle === alt)?.avantMatch?.stade ?? null };
    database.prepare("UPDATE contexte_avant_match SET avant_match = json_set(avant_match, '$.temperature', 99, '$.windSpeed', 99, '$.precipitation', 99, '$.weather', 'Hurricane', '$.referee', json_object('name', 'Arbitre Absurde', 'country', 'Nulle Part')) WHERE fotmob_id = ?").run(String(d.fotmob_id));
    const absurde = lire();
    s.altitude.meteoAbsurde = { lignesEgales: JSON.stringify(absurde.lignes) === JSON.stringify(avantKo.lignes), matchsEgaux: JSON.stringify(absurde.r.matchs) === JSON.stringify(avantKo.r.matchs) };
  }
  // Une fiche marquée « après le coup d'envoi » : écartée et comptée.
  const rk = ref.lignes['repos-court']?.find((l) => l.bloc !== alt)?.bloc ?? null;
  s.apresCoupDEnvoi = { match: rk };
  if (rk) {
    database.prepare('UPDATE contexte_fiches SET apres_coup_d_envoi = 1 WHERE match_key = ?').run(rk);
    const x = lire();
    s.apresCoupDEnvoi.apres = { comptes: x.r.comptes.apresCoupDEnvoi, dansLesMatchs: x.r.matchs.some((m) => m.cle === rk), dansLesLignes: Object.values(x.lignes).some((L) => L.some((l) => l.bloc === rk)) };
  }
} else {
  throw new Error(`phase inconnue : ${phase}`);
}

console.log(JSON.stringify(s));
