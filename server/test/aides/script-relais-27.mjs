/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-relais-27.mjs <serveur de la copie>
 *
 * Étape 26, partie A — T-EV1 RÉDUIT (sans la retouche R1, reportée au lot 2) : la boucle de correction ne change
 * JAMAIS la place de la candidate de l'étape 27 et n'écrit ni le registre des versions ni celui de la mesure pendant
 * son essai. La copie porte, en data/runtime, une COPIE FIGÉE des deux registres de Pierre (27/10/2026 : la 27 en
 * essai n° 2 face à la version 5) ; heure figée au 01/11/2026 à 07 h UTC (octobre écoulé). PLANTÉS ici : des
 * pronostics gelés d'octobre (v3 avant le 22, v4 puis v5 ensuite) et leurs rencontres, et le gel de la calibration
 * d'octobre. Puis le chemin de la partie A (moisATrier, trierLeMois, ecrireLeTri) avec la place lue par
 * etatDesVersions(), une « nuit » (mettreLaCandidateEnEssai() sans option, comme l'étape moteurABlanc et le
 * démarrage), et les lectures de la carte. Les sha1 des deux registres AVANT et APRÈS. Partie B (28/10) : l'étape de
 * la passe, une correction acceptée qui attend, libererLaPlace refusé pour la 27, le formulaire fermé (route) — les
 * deux registres toujours à l'octet. Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { openDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const db = openDb();
const V = await imp('core/engine/engineVersions.js');
const { FICHIER_REGISTRE } = await imp('bench/trialsRegistry.js');
const T = await imp('data/correction/tri.js');
const D = await imp('data/correction/depotCorrections.js');
const { readJsonFile } = await imp('utils/atomicJson.js');
const { executerSansPause } = await imp('utils/travailCooperatif.js');

const sha1 = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const empreintes = () => ({ versions: sha1(V.FICHIER_VERSIONS), mesure: sha1(FICHIER_REGISTRE) });
const sortie = { ok: true, maintenant: new Date().toISOString(), avant: empreintes() };

// La carte et la candidate, avant.
const carte = (e) => ({ candidate: e.candidate?.id ?? null, statut: e.candidate?.statut ?? null, essai: e.candidate?.essai?.numero ?? null, enService: e.enService?.numero ?? null, adoption: e.adoption?.raison ?? null });
sortie.carteAvant = carte(V.etatDesVersions());
const c0 = V.candidateEnEssai();
sortie.candidateAvant = { id: c0?.id ?? null, essai: c0?.essai?.numero ?? null, empreinte: c0?.empreinte ?? null };

// Pronostics d'octobre : v3 du 1er au 21 (une autre lignée), v4 du 22 au 23, v5 ensuite (la même lignée que v4).
const COLONNES = ['fixture_key', 'market_key', 'version', 'recorded_at', 'origin', 'match_id', 'league', 'date', 'kickoff', 'home_name', 'away_name', 'home_id', 'away_id', 'market_id', 'market', 'params', 'choice', 'label', 'probability', 'predicted_odds', 'engine_version', 'distribution', 'odds_source'];
const insPick = db.prepare(`INSERT INTO engine_picks (${COLONNES.join(', ')}) VALUES (${COLONNES.map(() => '?').join(', ')})`);
const insMatch = db.prepare(`INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, home_goals, away_goals, updated_at, meta)
                             VALUES (?, ?, ?, 'Ligue Relais 27', ?, ?, ?, ?, ?, ?, '2026-11-01T00:00:00.000Z', ?)`);
const insStats = db.prepare('INSERT INTO team_stats (match_key, side, corner_kicks) VALUES (?, ?, ?)');
const SCORES = [[1, 0], [0, 0], [2, 1], [1, 1], [0, 2], [3, 1], [1, 2], [2, 0], [0, 1], [2, 2]];
const jourPlus = (jour, n) => new Date(Date.parse(`${jour}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);
db.exec('BEGIN');
try {
  for (let i = 0; i < 650; i++) {
    const jour = 1 + Math.floor((i * 31) / 650);
    const date = `2026-10-${String(jour).padStart(2, '0')}`;
    const version = jour < 22 ? 3 : jour < 24 ? 4 : 5;
    const [h, a] = SCORES[i % 10];
    const home = String(800000 + i);
    const away = String(850000 + i);
    const fixtureKey = `fotmob:${home}|${away}|${date}`;
    const kickoff = `${date}T18:00:00.000Z`;
    insMatch.run(`r27-${i}`, `r27-${i}`, date, `Dom ${i}`, `Ext ${i}`, home, away, h, a, JSON.stringify({ kickoff }));
    insStats.run(`r27-${i}`, 'home', 5 + (i % 3));
    insStats.run(`r27-${i}`, 'away', 3 + (i % 4));
    const veille = `${jourPlus(date, -1)}T05:00:00.000Z`;
    const pick = (marketKey, marketId, distribution) =>
      insPick.run(fixtureKey, marketKey, 1, veille, 'nuit', `r27m-${i}`, 'Ligue Relais 27', date, kickoff, `Dom ${i}`, `Ext ${i}`, home, away, marketId, marketId, '{}', 'x', 'x', 0.6, 1.67, version, JSON.stringify(distribution), 'cotes gratuites : ESPN');
    pick('result', 'result', { issues: { home: 0.45, draw: 0.28, away: 0.27 } });
    pick('bothTeamsScore', 'bothTeamsScore', { issues: { yes: 0.52, no: 0.48 } });
    pick('totalCorners', 'totalCorners', { ligne: 9.5, attendu: 9.9, issues: { over: 0.47, under: 0.53 } });
  }
  db.prepare("INSERT INTO calibration_monthly (mois, version, fige_le, du, au, pronostics, paris, resume, bilan) VALUES ('2026-10', 1, '2026-11-01T06:00:00.000Z', '2026-10-01', '2026-10-31', 0, 0, '{}', '{}')").run();
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

// Le chemin de la partie A, tel que la passe le fera (place lue par etatDesVersions, lecture seule).
const place = T.placeDeLEssai(V.etatDesVersions());
sortie.place = place;
sortie.aTrier = T.moisATrier({ database: db });
const versions = readJsonFile(V.FICHIER_VERSIONS, null);
const tri = executerSansPause(T.trierLeMois('2026-10', { database: db, versions, enSlot: place }));
const ecrit = D.ecrireLeTri(tri, { database: db, phrase: 'Tri d’octobre 2026 figé (essai du relais).' });
sortie.tri = {
  ecrit: ecrit.ecrit,
  lignee: tri.lignee,
  statuts: Object.fromEntries(tri.cases.map((c) => [c.cas, c.statut])),
  leviers: tri.cases.filter((c) => c.levier).map((c) => c.cas),
  ecartees: tri.resume.ecartees.map((e) => [e.raison, e.n]),
  lignes: tri.resume.lignes
};
sortie.apresLeTri = empreintes();

// Une « nuit » (moteurABlanc, démarrage) : mettreLaCandidateEnEssai() sans option, comme l'appli.
const nuit = V.mettreLaCandidateEnEssai();
sortie.nuit = { change: nuit.change, recommence: Boolean(nuit.recommence), candidate: nuit.candidate?.id ?? null, essai: nuit.candidate?.essai?.numero ?? null };
// Le point d'entrée des candidates proposées reste fermé tant que la 27 est déclarée dans le code.
try {
  V.proposerUneCandidate({ id: 'c26-2026-10-rho-1', etape: '26', quoi: 'Correction d’essai', modifications: { football: { modeleDeButs: V.CANDIDATE_EN_ESSAI.modifications.football.modeleDeButs } }, marches: ['bothTeamsScore'] }, { origine: 'correction-mensuelle' });
  sortie.proposer = 'accepté';
} catch (error) {
  sortie.proposer = `${error.constructor.name} : ${error.message}`;
}
sortie.apres = empreintes();
sortie.carteApres = carte(V.etatDesVersions());
const c1 = V.candidateEnEssai();
sortie.candidateApres = { id: c1?.id ?? null, essai: c1?.essai?.numero ?? null, empreinte: c1?.empreinte ?? null };

// ------------------------------------------------ partie B (28/10) : la boucle pendant l'essai de la 27
// L'étape de la passe (octobre déjà trié : rien de retrié, rien de proposé), puis une correction ACCEPTÉE fabriquée
// (comme si elle avait été acceptée pendant l'essai) : la file attend, proposerUneCandidate n'est jamais appelé ;
// libererLaPlace refuse la candidate de l'étape 27 (B17) ; le formulaire est fermé (route). Les deux registres : à l'octet.
const { requeteExpress } = await import('./versionsMoteurCommun.mjs');
const { recopierScripts } = await import('./claudeSimule.mjs');
recopierScripts(serveur);
const job = await imp('jobs/matchStatsAutoRefresh.js');
const M = await imp('data/correction/miseALEssai.js');
const P = await imp('data/correction/propositions.js');
const { createApp } = await imp('app.js');
const app = createApp();
const CTX = { manuel: false, derniere: () => null, derniersDetails: () => null };
const resumeDeLaPasse = (r) => ({ status: r.status, summary: r.summary, tris: r.details.tris.map((t) => t.mois), creees: r.details.propositions.creees, ecartees: r.details.propositions.ecartees, place: r.details.place, miseALEssai: r.details.miseALEssai, erreurs: r.details.erreurs });
sortie.partieB = { passe: resumeDeLaPasse(await job.__testing.passeBoucleCorrection(CTX)) };
const service = { ...JSON.parse(JSON.stringify((await imp('core/engine/engineConfig.js')).lireReglagesDuMoteur().football)), modeleDeButs: JSON.parse(JSON.stringify(V.CANDIDATE_EN_ESSAI.modifications.football.modeleDeButs)) };
const id = 'c26-p20261101-rho-1';
const declaration = P.declarationDe({ id, levier: 'modeleDeButs.rho', apres: -0.02, reglagesEnService: service, quoi: 'Correction fabriquée (relais 27)', enMots: 'Correction fabriquée pour l’essai du relais.' });
D.creerUneProposition({ id, source: 'pierre', levier: 'modeleDeButs.rho', avant: -0.05, apres: -0.02, marches: declaration.marches, declaration, base: 'essai-relais' }, { database: db, phrase: 'Proposée (essai du relais).' });
for (const [evenement, vue] of [['au-banc', 'proposee'], ['bancee', 'au-banc'], ['acceptee', 'bancee']]) D.changerLEtat({ id, evenement, vue, source: 'pierre', phrase: `Essai du relais : ${evenement}.`, maj: evenement === 'acceptee' ? { rangFile: 1 } : {} }, { database: db });
sortie.partieB.avecUneAcceptee = resumeDeLaPasse(await job.__testing.passeBoucleCorrection(CTX));
sortie.partieB.etatDeLaFile = D.lireUneProposition(id, { database: db }).etat;
sortie.partieB.liberer = M.libererLaPlace('modele-buts-v1', { brut: readJsonFile(V.FICHIER_VERSIONS, null), database: db });
const formulaire = await requeteExpress(app, 'POST', '/api/corrections/proposer', { levier: 'modeleDeButs.rho', valeur: -0.02 });
sortie.partieB.proposer = { code: formulaire.code, raison: formulaire.corps?.raison ?? null, error: formulaire.corps?.error ?? null };
const etat = (await requeteExpress(app, 'GET', '/api/corrections')).corps;
sortie.partieB.etat = { place: etat.place, formulaireOuvert: etat.formulaire.ouvert, dernierTri: etat.dernierTri?.mois ?? null, enEssai: etat.dernierTri?.enEssai ?? null };
sortie.apresPartieB = empreintes();
sortie.carteApresPartieB = carte(V.etatDesVersions());
console.log(JSON.stringify(sortie));
