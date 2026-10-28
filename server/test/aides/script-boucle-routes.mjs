/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-boucle-routes.mjs <serveur de la copie>
 *
 * Étape 26, partie B — LES ROUTES /api/corrections et leurs gardes, dans une copie qui porte une COPIE FIGÉE des deux
 * registres de Pierre (27/10/2026 : la candidate de l'étape 27 en essai n° 2 ; la candidate déclarée dans le code de la
 * copie). Heure figée au 01/11/2026 à 07 h UTC. Rien n'est trié ici (aucun pronostic gelé) : les lectures à vide, les
 * refus (formulaire fermé pendant l'essai de la 27, paramètres, inconnue, vue absente, une passe en cours), le temps
 * d'une lecture, puis une ligne ILLISIBLE plantée dans la table des propositions : « illisible », jamais « aucune
 * proposition » (B30). Les sha1 des deux registres avant / après. Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { importeur, requeteExpress } from './versionsMoteurCommun.mjs';
import { recopierScripts } from './claudeSimule.mjs';

const [serveur] = process.argv.slice(2);
const imp = importeur(serveur);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const FICHIER_VERROU = path.join(RUNTIME, 'espn-refresh.lock');
const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const V = await imp('core/engine/engineVersions.js');
const T = await imp('bench/trialsRegistry.js');
recopierScripts(serveur);
const { createApp } = await imp('app.js');
const app = createApp();
const requete = (methode, url, corps) => requeteExpress(app, methode, url, corps);
const sha1 = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const empreintes = () => ({ versions: sha1(V.FICHIER_VERSIONS), mesure: sha1(T.FICHIER_REGISTRE) });
const court = (r) => ({ code: r.code, raison: r.corps?.raison ?? null, error: r.corps?.error ?? null });

const s = { ok: true, avant: empreintes() };

// Les lectures, à vide (aucun tri, aucune proposition) ; le temps d'une lecture (le meilleur de trois).
const temps = [];
let etat;
for (let i = 0; i < 3; i++) {
  const t0 = performance.now();
  etat = (await requete('GET', '/api/corrections')).corps;
  temps.push(performance.now() - t0);
}
s.lectureMs = Math.round(Math.min(...temps));
s.etat = { disponible: etat.disponible, dernierTri: etat.dernierTri, propositions: etat.propositions, aDecider: etat.aDecider, place: etat.place, formulaire: { ouvert: etat.formulaire.ouvert, raison: etat.formulaire.raison, leviers: etat.formulaire.leviers.map((l) => [l.cle, l.ouvert]) }, essais: etat.essais, journal: etat.journal, regles: etat.regles };
s.sante = (await requete('GET', '/api/engine-health')).corps?.blocs?.corrections ?? null;
s.tri = {
  sansMois: court(await requete('GET', '/api/corrections/tri')),
  moisIllisible: court(await requete('GET', '/api/corrections/tri?mois=2026-13')),
  moisAVenir: court(await requete('GET', '/api/corrections/tri?mois=2099-01')),
  pasEncore: (await requete('GET', '/api/corrections/tri?mois=2026-09')).corps
};
s.journal = {
  tropLong: court(await requete('GET', '/api/corrections/journal?limite=500')),
  avantIllisible: court(await requete('GET', '/api/corrections/journal?avant=abc')),
  vide: (await requete('GET', '/api/corrections/journal')).corps
};
// Les écritures : le formulaire fermé pendant l'essai de l'étape 27 ; les paramètres.
s.proposer = court(await requete('POST', '/api/corrections/proposer', { levier: 'modeleDeButs.rho', valeur: -0.02 }));
s.inconnue = court(await requete('POST', '/api/corrections/c26-inconnue-1/accepter', { vue: 'bancee' }));
s.sansVue = court(await requete('POST', '/api/corrections/c26-inconnue-1/refuser', {}));
s.bancInconnue = court(await requete('POST', '/api/corrections/c26-inconnue-1/banc', { vue: 'proposee' }));
s.retirerInconnue = court(await requete('POST', '/api/corrections/c26-inconnue-1/retirer', { vue: 'adoptee' }));
// Pendant une passe (le verrou d'un autre processus) : chaque écriture refusée, rien de changé (B24).
const t = new Date().toISOString();
fs.writeFileSync(FICHIER_VERROU, JSON.stringify({ pid: process.pid, token: 'essai-26-routes', startedAt: t, heartbeatAt: t }));
s.pendantUnePasse = {
  proposer: court(await requete('POST', '/api/corrections/proposer', { levier: 'modeleDeButs.rho', valeur: -0.02 })),
  accepter: court(await requete('POST', '/api/corrections/c26-inconnue-1/accepter', { vue: 'bancee' })),
  refuser: court(await requete('POST', '/api/corrections/c26-inconnue-1/refuser', { vue: 'bancee' })),
  banc: court(await requete('POST', '/api/corrections/c26-inconnue-1/banc', { vue: 'proposee' })),
  retirer: court(await requete('POST', '/api/corrections/c26-inconnue-1/retirer', { vue: 'adoptee' })),
  lecture: (await requete('GET', '/api/corrections')).code
};
fs.rmSync(FICHIER_VERROU, { force: true });
s.apresLesEcritures = empreintes();
s.propositionsApres = database.prepare('SELECT COUNT(*) AS n FROM correction_propositions').get().n;
// B30 : une ligne illisible dans la table des propositions (sa déclaration n'est pas du JSON).
database
  .prepare(`INSERT INTO correction_propositions (id, cree_le, source, etat, etat_le, levier, avant, apres, marches, declaration, base, maj_le)
            VALUES ('c26-abimee-1', '2026-11-01T07:00:00.000Z', 'pierre', 'proposee', '2026-11-01T07:00:00.000Z', 'modeleDeButs.rho', '-0.05', '-0.02', '[]', '{pas du json', 'x', '2026-11-01T07:00:00.000Z')`)
  .run();
const illisible = await requete('GET', '/api/corrections');
s.illisible = { code: illisible.code, corps: illisible.corps };
s.santeIllisible = (await requete('GET', '/api/engine-health')).corps?.blocs?.corrections ?? null;
s.apres = empreintes();
console.log(JSON.stringify(s));
