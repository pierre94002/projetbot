/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-budget-journal.mjs <serveur de la copie>
 *
 * Étape 4 — LE JOURNAL COMPTE TOUT, au point de passage commun : pour un même
 * match, l'analyse d'avance, puis celle du coup d'envoi (qui la remplace : le
 * fichier des analyses la garde dans earlierAnalysis SANS son usage), puis la
 * reprise après changement de onze (qui écrase l'usage de la précédente),
 * puis la revue ; deux clics (avant et après-match) ; trois échecs (réponse
 * en erreur, schéma non respecté, pas de réponse) ; l'API à la clé dans son
 * propre fichier ; un journal qu'on ne peut pas écrire (rien de perdu) ; et
 * l'appel refusé avant de partir (bac à sable, Claude non configuré) : pas
 * de ligne. Claude et l'API SIMULÉS (claudeSimule.mjs), FotMob SIMULÉ (404).
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { installerClaudeSimule, installerAnthropicSimule, importeur, reponseFactice, lireFichierJournal } from './claudeSimule.mjs';
import { installerFauxFetch, listeDuJour } from './fotmobSimule.mjs';

const [serveur] = process.argv.slice(2);
const imp = importeur(serveur);

const { resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');

// FotMob : des journées vides (les actualités d'équipe les demandent), rien d'autre ne sort.
const faux = installerFauxFetch({ listes: { 20261004: listeDuJour([]), 20261005: listeDuJour([]), 20261006: listeDuJour([]) } });
const totaux = [24_400, 25_700, 24_100, 10_800, 16_000, 9_000, 7_000, 5_000];
let k = 0;
const claude = await installerClaudeSimule(serveur, { tokens: () => totaux[k++] ?? 1_000 });
const api = await installerAnthropicSimule(serveur, {
  reponse: (i) => (i === 0 ? { status: 200, corps: { model: 'claude-essai', usage: { input_tokens: 1200, output_tokens: 300 }, content: [] } } : { status: 401, corps: { error: { message: 'clé refusée' } } })
});

const service = await imp('core/ai/matchAiAnalysisService.js');
const { getByMatchId } = await imp('data/repositories/matchAiAnalysisRepository.js');
const controleur = await imp('api/controllers/matchAiAnalysis.controller.js');
const { callAnthropicMessages } = await imp('core/ai/anthropicClient.js');
const ledger = await imp('data/repositories/claudeUsageLedger.js');
const { modeBacASable } = await imp('config/bacASable.js');

const JOUR = '2026-10-05';
const s = {};
// Réécrit le fichier du jour SANS passer par le journal du serveur, en faisant TOUJOURS changer sa date de modification : le journal ne
// relit son fichier que si cette date a changé. Écrit juste après sa dernière écriture, avec une horloge de fichiers qui ne bat que
// toutes les 15,6 ms (Windows, tant qu'aucune application ne l'a affinée), le fichier abîmé gardait la même date : le journal ne voyait
// rien (« probleme: false ») et le test échouait de temps en temps (07/10/2026 ; même cause que script-budget-favoris.mjs).
const ecrireAvecDateNeuve = (fichier, texte) => {
  const avant = fs.existsSync(fichier) ? fs.statSync(fichier).mtimeMs : null;
  fs.writeFileSync(fichier, texte);
  if (avant !== null && fs.statSync(fichier).mtimeMs <= avant) {
    const secondes = (avant + 1000) / 1000;
    fs.utimesSync(fichier, secondes, secondes);
  }
};
const essai = async (f) => {
  try {
    await f();
    return 'ABOUTI';
  } catch (e) {
    return `ECHEC ${e.message}`;
  }
};

// Un match d'EPL connu du magasin. Moteur réduit au minimum : l'IA (simulée) n'en lit rien.
const M1 = { matchId: 'cal-2026-10-05-Man City-Everton', home: 'Man City', away: 'Everton', league: 'EPL' };
const moteur = (commenceTime) => ({ label: 'essai', commenceTime, marketPredictions: [{ marketId: 'result', params: {}, market: 'Résultat', predictedOutcome: 'home', predictedLabel: 'Man City', predictedOdds: 1.6, minOdds: 1.2 }] });
// La composition passée telle quelle (aucune relecture FotMob) : celle du coup d'envoi.
const compo = (signe) => ({
  source: 'FotMob',
  fotmobMatchId: '4900001',
  fetchedAt: '2026-10-05T12:00:00.000Z',
  minutesBeforeKickoff: 40,
  home: { team: 'Man City', teamId: 'fotmob-8456', teamMatches: 0, startXI: [{ id: `fotmob-${signe}`, name: `Joueur ${signe}`, stats: null }], bench: [], unavailable: [], usualStartersMissing: [] },
  away: { team: 'Everton', teamId: 'fotmob-8668', teamMatches: 0, startXI: [{ id: 'fotmob-2', name: 'Joueur 2', stats: null }], bench: [], unavailable: [], usualStartersMissing: [] }
});

// 1. L'analyse d'avance, puis celle du coup d'envoi qui la remplace, puis la reprise.
s.avance = await essai(() => service.runPreMatchAnalysis({ ...M1, engineResult: moteur(null), sansRepliPayant: true, appel: { type: 'avance', mode: 'normal' } }));
s.coupDEnvoi = await essai(() =>
  service.runPreMatchAnalysis({ ...M1, engineResult: moteur('2026-10-05T12:40:00.000Z'), sansRepliPayant: true, lineups: compo(1), timing: 'coup-d-envoi', appel: { type: 'coup-d-envoi', mode: 'normal' } })
);
s.reprise = await essai(() =>
  service.runPreMatchAnalysis({ ...M1, engineResult: moteur('2026-10-05T12:40:00.000Z'), sansRepliPayant: true, lineups: compo(3), timing: 'coup-d-envoi', appel: { type: 'reprise', mode: 'normal' } })
);
const entree = getByMatchId(M1.matchId);
s.fichierAnalyses = {
  timing: entree?.timing,
  kickoffRuns: entree?.kickoffRuns,
  usageTotal: entree?.usage ? entree.usage.input_tokens + entree.usage.cache_creation_input_tokens + entree.usage.cache_read_input_tokens + entree.usage.output_tokens : null,
  earlier: Boolean(entree?.earlierAnalysis),
  earlierAUsage: Boolean(entree?.earlierAnalysis?.usage)
};

// 2. La revue d'après-match (résultat fourni, comme l'automatique).
s.revue = await essai(() => service.runPostMatchAnalysis({ matchId: M1.matchId, result: { homeGoals: 2, awayGoals: 0, date: JOUR, homeName: 'Man City' }, appel: { type: 'revue', mode: 'normal' } }));

// 3. Deux clics de Pierre, par le contrôleur (avant-match, puis après-match : son score saisi à la main).
const M2 = { matchId: 'clic-fulham-leeds', home: 'Fulham', away: 'Leeds', league: 'EPL' };
fs.writeFileSync(path.join(serveur, 'data', 'runtime', 'match-results.json'), JSON.stringify([{ matchId: M2.matchId, homeName: M2.home, awayName: M2.away, league: M2.league, homeGoals: 1, awayGoals: 1 }]));
const r1 = reponseFactice();
s.clicAvant = await essai(() => controleur.postPreMatch({ params: { matchId: M2.matchId }, body: { home: M2.home, away: M2.away, league: M2.league, engineResult: moteur(null) } }, r1));
const r2 = reponseFactice();
s.clicApres = await essai(() => controleur.postPostMatch({ params: { matchId: M2.matchId } }, r2));
s.clicCodes = [r1.code, r2.code];

// 4. Trois échecs : réponse en erreur (ses tokens comptent), schéma non respecté (idem), pas de réponse (tokens inconnus).
claude.prochain('erreur');
s.echecErreur = await essai(() => service.runPreMatchAnalysis({ ...M2, matchId: 'echec-1', engineResult: moteur(null), sansRepliPayant: true, appel: { type: 'avance' } }));
claude.prochain('sans-sortie');
s.echecSchema = await essai(() => service.runPreMatchAnalysis({ ...M2, matchId: 'echec-2', engineResult: moteur(null), sansRepliPayant: true, appel: { type: 'avance' } }));
claude.prochain('panne');
s.echecPanne = await essai(() => service.runPreMatchAnalysis({ ...M2, matchId: 'echec-3', engineResult: moteur(null), sansRepliPayant: true, appel: { type: 'avance' } }));

// 5. Un appel sans type : compté « autre », jamais oublié.
s.sansType = await essai(() => claude.cc.callClaudeCode({ system: 's', userMessage: 'u', jsonSchema: { type: 'object' } }));

// 6. L'API à la clé : un appel réussi, un refusé (401) — dans SON fichier, hors du budget.
s.apiOk = await essai(() => callAnthropicMessages({ apiKey: 'cle-factice-de-test', model: 'claude-essai', system: 's', messages: [{ role: 'user', content: 'u' }], maxTokens: 10, appel: { type: 'autre', detail: 'audit des pronostics (Réglages)' } }));
s.api401 = await essai(() => callAnthropicMessages({ apiKey: 'cle-factice-de-test', model: 'claude-essai', system: 's', messages: [{ role: 'user', content: 'u' }], maxTokens: 10, appel: { type: 'autre', detail: 'test de la clé API (Réglages)' } }));

const avantBlocage = lireFichierJournal(serveur, JOUR);

// 7. Le fichier du jour ne peut plus être écrit (tenu, illisible) : la ligne attend en mémoire, comptée ; puis repart.
const fichierJour = path.join(serveur, 'data', 'runtime', 'journal-claude', `${JOUR}.json`);
const contenu = fs.readFileSync(fichierJour, 'utf8');
ecrireAvecDateNeuve(fichierJour, '{ illisible');
s.pendantBlocage = { appel: await essai(() => claude.cc.callClaudeCode({ system: 's', userMessage: 'u', jsonSchema: { type: 'object' }, appel: { type: 'manuel', detail: 'pendant le blocage' } })) };
s.pendantBlocage.enAttente = ledger.etatEcriture().enAttente;
const luPendant = ledger.lireJour(JOUR);
s.pendantBlocage.lu = { appels: luPendant.appels.length, enAttente: luPendant.enAttente, probleme: Boolean(luPendant.probleme) };
s.pendantBlocage.fichierIntact = fs.readFileSync(fichierJour, 'utf8') === '{ illisible';
ecrireAvecDateNeuve(fichierJour, contenu);
s.apresBlocage = { appel: await essai(() => claude.cc.callClaudeCode({ system: 's', userMessage: 'u', jsonSchema: { type: 'object' }, appel: { type: 'manuel', detail: 'après le blocage' } })) };
s.apresBlocage.enAttente = ledger.etatEcriture().enAttente;

// 8. Refusé avant de partir : rien ne coûte, rien n'est noté.
claude.arreter();
api.arreter();
const avantRefus = (lireFichierJournal(serveur, JOUR)?.appels ?? []).length;
s.nonConfigure = await essai(() => service.runPreMatchAnalysis({ ...M2, matchId: 'non-configure', engineResult: moteur(null), sansRepliPayant: true, appel: { type: 'avance' } }));
s.bac = modeBacASable();
// Dans le bac seulement (hors du bac, l'appel partirait vers l'exécutable configuré — inexistant, mais on ne l'essaie pas).
s.refusBac = s.bac ? await essai(() => claude.cc.callClaudeCode({ system: 's', userMessage: 'u', jsonSchema: { type: 'object' }, appel: { type: 'manuel' } })) : 'non essayé hors du bac';
s.apiRefusBac = s.bac ? await essai(() => callAnthropicMessages({ apiKey: 'cle-factice-de-test', model: 'm', system: 's', messages: [], maxTokens: 1 })) : 'non essayé hors du bac';
s.lignesApresRefus = (lireFichierJournal(serveur, JOUR)?.appels ?? []).length - avantRefus;

// 9. La simulation elle-même est refusée hors d'une copie d'essai : l'appli ne peut pas s'en servir.
const dossierEssai = process.env.CM_TEST_DOSSIER;
delete process.env.CM_TEST_DOSSIER;
s.simulationHorsEssai = {
  claude: await essai(async () => claude.cc.__testing.simulerClaude(async () => ({}))),
  api: await essai(async () => api.an.__testing.simulerEnvoi(async () => ({})))
};
process.env.CM_TEST_DOSSIER = dossierEssai;
s.simulationRetablie = !claude.cc.isClaudeCodeAuthenticated();

// Ce que dit le journal (relu sur le disque, sans le code testé) et ce que dit son lecteur.
const journal = lireFichierJournal(serveur, JOUR);
const journalApi = lireFichierJournal(serveur, JOUR, '.api-anthropic');
s.journal = {
  lignes: journal.appels.length,
  parType: journal.appels.reduce((m, a) => ({ ...m, [a.type]: (m[a.type] ?? 0) + 1 }), {}),
  statuts: journal.appels.map((a) => a.statut),
  types: journal.appels.map((a) => a.type),
  tokens: journal.appels.map((a) => a.tokens?.total ?? null),
  matchs: journal.appels.map((a) => a.match?.matchId ?? null),
  details: journal.appels.map((a) => a.detail),
  modes: journal.appels.map((a) => a.mode),
  usd: journal.appels.map((a) => a.equivalentApiUsd),
  canaux: [...new Set(journal.appels.map((a) => a.canal))],
  jour: journal.jour,
  totaux: journal.totaux,
  exemple: journal.appels[0],
  avantBlocage: avantBlocage.appels.length
};
s.journalApi = journalApi
  ? { lignes: journalApi.appels.length, statuts: journalApi.appels.map((a) => a.statut), tokens: journalApi.appels.map((a) => a.tokens?.total ?? null), canal: journalApi.canal, contientCle: JSON.stringify(journalApi).includes('cle-factice') }
  : null;
s.lecteur = ledger.lireJour(JOUR).totaux;
s.simules = claude.appels.map((a) => ({ type: a.type, genre: a.genre, total: a.total }));
s.envoisApi = api.envois.length;
s.fotmob = faux.appels.length;
// La date d'un fichier écrit une seule fois et jamais réécrit : sous l'aide « date de fichier figée », c'est la date figée (le test le vérifie).
s.dateDeFichier = fs.statSync(path.join(serveur, 'data', 'runtime', 'match-results.json')).mtimeMs;

console.log(JSON.stringify({ ok: true, ...s }));
