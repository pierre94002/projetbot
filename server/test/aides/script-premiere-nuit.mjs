/**
 * Exécuté DANS une copie de travail rangée dans un BAC SIMULÉ (bacSimule.mjs), jamais directement :
 *   node --import garde.mjs script-premiere-nuit.mjs <serveur de la copie>
 *
 * Étape 27 — LA PREMIÈRE NUIT de la candidate déclarée dans le code (CANDIDATE_EN_ESSAI, le modèle de buts unique),
 * comme chez Pierre après la recopie : la table du jour J de la copie, puis les deux étapes de la passe qui la
 * concernent, dans l'ordre de REFRESH_STEPS — « forcesButs » (les forces de buts pour l'empreinte de la candidate,
 * à part) puis « moteurABlanc » (la candidate mise à blanc et comptée au registre de la mesure de la copie). On lit
 * ensuite ce que le juge comptera : K au registre (compterVariantes) et au banc (variantesDuBanc). Les réglages en
 * service n'ont pas la clé : rien de la version en service ne change. Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { recopierScripts } from './claudeSimule.mjs';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const BASE = process.env.MATCH_STATS_DB;
recopierScripts(serveur);

const { openDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
const db = openDb();
const T = await imp('data/db/dayTable.js');
const V = await imp('core/engine/engineVersions.js');
const job = await imp('jobs/matchStatsAutoRefresh.js');
const { compterVariantes, variantesDe, FICHIER_REGISTRE } = await imp('bench/trialsRegistry.js');
const { variantesDuBanc } = await imp('bench/bancCandidate.js');
const { etatForcesButs } = await imp('data/db/forcesButs.js');
const { empreinteDesForces, reglagesDuModeleDeButs } = await imp('core/engine/goalModel.js');
const { getEngineConfig } = await imp('core/engine/engineConfig.js');
const { modeBacASable } = await imp('config/bacASable.js');
const bac = modeBacASable();

const RUNTIME = path.join(serveur, 'data', 'runtime');
const sha1 = (f) => (fs.existsSync(f) ? crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex') : 'absent');
const avant = { reglages: sha1(path.join(RUNTIME, 'engine-config.json')), empreinte: JSON.stringify(V.etatDuMoteur().empreinteReglages) };
V.demarrerVersions();
await T.construireTableJourJ({ database: db, rendreLaMain: null, controle: { lignes: 0 } });

const candidate = V.CANDIDATE_EN_ESSAI;
const empreinte = empreinteDesForces(reglagesDuModeleDeButs(V.configDeLaCandidate(getEngineConfig('football'), candidate, 'football')));
const ordre = job.REFRESH_STEPS.map((e) => e.key);
const forces = await job.__testing.passeForcesButs({}, { database: db, chemin: BASE });
const aBlanc = await job.__testing.passeMoteurABlanc({}, {});
const registre = {};
const variantes = variantesDe('27', registre);
console.log(
  JSON.stringify({
    ok: true,
    bac,
    candidate: { id: candidate.id, variantes: candidate.variantes.length, temoins: candidate.temoins, horizon: candidate.horizon },
    ordre: { forcesButs: ordre.indexOf('forcesButs'), moteurABlanc: ordre.indexOf('moteurABlanc') },
    forces: { status: forces.status, mode: forces.details?.mode ?? null, empreintes: forces.details?.empreintes ?? null, controle: forces.details?.controle ?? null, etat: etatForcesButs({ database: db, empreintes: [empreinte] }).aJour, empreinte },
    aBlanc: { status: aBlanc.status, summary: aBlanc.summary, candidate: aBlanc.details?.candidate ?? null, erreur: aBlanc.details?.erreur ?? null },
    registre: { fichier: path.relative(serveur, FICHIER_REGISTRE), K: compterVariantes('27', registre), parOu: variantes.reduce((o, v) => ((o[v.ou] = (o[v.ou] ?? 0) + 1), o), {}), premiere: variantes.find((v) => v.ou === 'a-blanc')?.id ?? null },
    banc: { K: variantesDuBanc(candidate, registre) },
    enService: { sansCle: getEngineConfig('football').modeleDeButs === undefined, apres: { reglages: sha1(path.join(RUNTIME, 'engine-config.json')), empreinte: JSON.stringify(V.etatDuMoteur().empreinteReglages) }, avant }
  })
);
