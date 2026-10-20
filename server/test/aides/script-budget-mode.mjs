/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-budget-mode.mjs <serveur de la copie>
 *
 * Étape 4 — LE MODE ÉCONOME À 80 % et LE RÉGLAGE DU BUDGET, sur des journaux
 * fabriqués (data/runtime/journal-claude) : valeurs provisoires sans
 * réglage ; seuil du jour sur le budget provisoire de 1 200 000 (959 999 →
 * normal, 960 000 → économe) ; seuil de la semaine (6 000 000 : 4 800 000) du
 * lundi au dimanche, sans aucun jour au-dessus de 80 % ;
 * nouvelle semaine ; appels de l'API à la clé hors budget ; un échec avec ses
 * tokens compte ; choix « économe tout le temps » ; budget réglé plus bas ;
 * routes (PUT idempotent, refus en 400, GET) ; plafond de 150 intact, y
 * compris quand il est atteint (rien lancé, rien noté). Sans Claude, sans
 * réseau. Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur, recopierScripts, reponseFactice } from './claudeSimule.mjs';

const [serveur] = process.argv.slice(2);
const imp = importeur(serveur);
recopierScripts(serveur);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const JOURNAL = path.join(RUNTIME, 'journal-claude');

const budget = await imp('core/ai/claudeBudget.js');
const ledger = await imp('data/repositories/claudeUsageLedger.js');
const depot = await imp('data/repositories/claudeBudgetRepository.js');
const controleur = await imp('api/controllers/claudeBudget.controller.js');
const { env } = await imp('config/env.js');
const auto = await imp('data/repositories/autoAiAnalysisRepository.js');

/** Écrit le journal d'un jour : `lignes` = [[type, tokens, statut?, canal?], …]. */
function ecrireJour(jour, lignes, canal = 'claude-code') {
  fs.mkdirSync(JOURNAL, { recursive: true });
  const appels = lignes.map(([type, total, statut = 'ok'], i) => ({
    id: `${jour}-${canal}-${i}`,
    at: `${jour}T10:${String(i % 60).padStart(2, '0')}:00.000Z`,
    jour,
    canal,
    type,
    statut,
    tokens: total === null ? null : { entree: 2, ecritureCache: 0, lectureCache: 0, sortie: total - 2, total },
    equivalentApiUsd: total === null ? null : total / 250_000
  }));
  const nom = `${jour}${canal === 'api-anthropic' ? '.api-anthropic' : ''}.json`;
  fs.writeFileSync(path.join(JOURNAL, nom), JSON.stringify({ version: 1, jour, canal, appels, totaux: ledger.totauxDe(appels) }));
  ledger.__testing.oublier();
}
const viderJournal = () => {
  fs.rmSync(JOURNAL, { recursive: true, force: true });
  ledger.__testing.oublier();
};
const instant = (jour, heure = '15:00') => Date.parse(`${jour}T${heure}:00.000Z`);
const resume = (m) => ({ mode: m.mode, declencheurs: m.declencheurs.map((d) => d.cle), partJour: m.partJour, partSemaine: m.partSemaine, raison: m.raison, politique: m.politique });
const s = {};

// 0. Rien d'enregistré : les valeurs provisoires, le mode normal.
s.provisoire = depot.lireReglageBudget();
s.semaine = budget.semaineDe('2026-10-07');
s.semaineDimanche = budget.semaineDe('2026-10-11');
s.semaineLundi = budget.semaineDe('2026-10-12');
s.vide = resume(budget.modeBudget({ maintenant: instant('2026-10-07') }));

// 0 bis. Au volume mesuré (~0,76 M le 03/10, ~0,85 M le 04/10 avec les appels perdus, ~2,3 M sur trois jours),
// le budget provisoire ne change rien : mode normal.
ecrireJour('2026-10-05', [['coup-d-envoi', 760_000]]);
ecrireJour('2026-10-06', [['coup-d-envoi', 850_000]]);
ecrireJour('2026-10-07', [['coup-d-envoi', 700_000]]);
s.volumeMesure = { mardi: resume(budget.modeBudget({ maintenant: instant('2026-10-06') })), mercredi: resume(budget.modeBudget({ maintenant: instant('2026-10-07') })) };
viderJournal();

// 1. Le JOUR : 959 999 tokens → normal ; 960 000 → économe (80 % du budget provisoire de 1 200 000).
ecrireJour('2026-10-07', [['coup-d-envoi', 480_000], ['avance', 479_999]]);
s.jour959999 = resume(budget.modeBudget({ maintenant: instant('2026-10-07') }));
ecrireJour('2026-10-07', [['coup-d-envoi', 480_000], ['avance', 479_999], ['revue', 1]]);
s.jour960000 = resume(budget.modeBudget({ maintenant: instant('2026-10-07') }));

// 2. La SEMAINE (lundi 05/10 → dimanche 11/10, budget provisoire de 6 000 000 : économe à 4 800 000) :
// 950 000 par jour du lundi au vendredi, jamais 80 % d'un jour (960 000).
viderJournal();
for (const j of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']) ecrireJour(j, [['coup-d-envoi', 950_000]]);
ecrireJour('2026-10-10', [['revue', 49_999]]);
s.semaine4799999 = resume(budget.modeBudget({ maintenant: instant('2026-10-10') }));
ecrireJour('2026-10-10', [['revue', 49_999], ['manuel', 1]]);
s.semaine4800000 = resume(budget.modeBudget({ maintenant: instant('2026-10-10') }));
s.semaineDimanche4800000 = resume(budget.modeBudget({ maintenant: instant('2026-10-11') }));
// Le lundi suivant : nouvelle semaine, plus rien ne compte.
s.lundiSuivant = resume(budget.modeBudget({ maintenant: instant('2026-10-12') }));
// Le jour dit aussi la consommation de la semaine, jour par jour.
s.consoSamedi = budget.consommation({ maintenant: instant('2026-10-10') });
s.consoSamedi = { jour: s.consoSamedi.jour, aujourdhui: s.consoSamedi.aujourdhui.tokens.total, semaine: s.consoSamedi.cetteSemaine.tokens.total, parJour: s.consoSamedi.parJour.map((p) => [p.jour, p.tokens]) };

// 3. L'API à la clé ne compte pas ; un échec avec ses tokens compte ; un échec sans réponse n'a pas de tokens.
viderJournal();
ecrireJour('2026-10-07', [['autre', 10_000_000]], 'api-anthropic');
ecrireJour('2026-10-07', [['avance', 860_000], ['avance', 99_999, 'echec'], ['avance', null, 'echec']]);
s.apiEtEchecs = resume(budget.modeBudget({ maintenant: instant('2026-10-07') }));
const etat1 = budget.etatBudgetClaude({ maintenant: instant('2026-10-07') });
s.etatApi = { api: etat1.apiAnthropic.aujourdhui.tokens.total, jour: etat1.aujourdhui.tokens.total, appels: etat1.aujourdhui.appels, echecs: etat1.aujourdhui.echecs, sansTokens: etat1.aujourdhui.sansTokens };
ecrireJour('2026-10-07', [['avance', 860_000], ['avance', 100_000, 'echec'], ['avance', null, 'echec']]);
s.echecQuiFranchit = resume(budget.modeBudget({ maintenant: instant('2026-10-07') }));

// 4. Les routes : GET (lecture seule), PUT qui confirme le provisoire, PUT identique (rien réécrit), refus en 400.
viderJournal();
const get1 = reponseFactice();
controleur.getClaudeBudget({ query: { force: '1' } }, get1);
s.get = { reglage: get1.corps.reglage, mode: get1.corps.mode.mode, plafond: get1.corps.plafond.limite, fichierExiste: fs.existsSync(depot.FICHIER_BUDGET), parType: get1.corps.parType.map((t) => t.type) };
const put1 = reponseFactice();
controleur.putClaudeBudgetSetting({ body: { tokensParJour: 1_200_000, tokensParSemaine: 6_000_000, mode: 'auto' } }, put1);
const mtime1 = fs.statSync(depot.FICHIER_BUDGET).mtimeMs;
const contenu1 = fs.readFileSync(depot.FICHIER_BUDGET, 'utf8');
const put2 = reponseFactice();
controleur.putClaudeBudgetSetting({ body: { tokensParJour: 1_200_000, tokensParSemaine: 6_000_000, mode: 'auto' } }, put2);
s.put = {
  premier: put1.corps.enregistrement,
  reglageApres: put1.corps.reglage,
  second: put2.corps.enregistrement,
  memeFichier: fs.readFileSync(depot.FICHIER_BUDGET, 'utf8') === contenu1 && fs.statSync(depot.FICHIER_BUDGET).mtimeMs === mtime1,
  contenu: JSON.parse(contenu1)
};
const refus = (body) => {
  try {
    controleur.putClaudeBudgetSetting({ body }, reponseFactice());
    return 'ACCEPTÉ';
  } catch (e) {
    return `${e.statusCode ?? 'sans code'} ${e.message}`;
  }
};
s.refus = {
  semaineSousJour: refus({ tokensParJour: 2_000_000, tokensParSemaine: 1_000_000, mode: 'auto' }),
  modeInconnu: refus({ tokensParJour: 1_000_000, tokensParSemaine: 5_000_000, mode: 'arret' }),
  pasEntier: refus({ tokensParJour: 1_000_000.5, tokensParSemaine: 5_000_000, mode: 'auto' }),
  texte: refus({ tokensParJour: '1000000', tokensParSemaine: 5_000_000, mode: 'auto' }),
  tropPetit: refus({ tokensParJour: 10, tokensParSemaine: 5_000_000, mode: 'auto' }),
  manquant: refus({ tokensParJour: 1_000_000, mode: 'auto' })
};
s.apresRefus = fs.readFileSync(depot.FICHIER_BUDGET, 'utf8') === contenu1;

// 5. « Économe tout le temps » : économe même à zéro token, raison dite.
const put3 = reponseFactice();
controleur.putClaudeBudgetSetting({ body: { tokensParJour: 1_000_000, tokensParSemaine: 5_000_000, mode: 'econome' } }, put3);
s.manuel = resume(budget.modeBudget({ maintenant: instant('2026-10-07') }));
s.manuelEtat = put3.corps.mode;

// 6. Un budget réglé plus bas : la bascule suit (80 % de 100 000 = 80 000).
controleur.putClaudeBudgetSetting({ body: { tokensParJour: 100_000, tokensParSemaine: 5_000_000, mode: 'auto' } }, reponseFactice());
ecrireJour('2026-10-07', [['coup-d-envoi', 79_999]]);
s.bas79999 = resume(budget.modeBudget({ maintenant: instant('2026-10-07') }));
ecrireJour('2026-10-07', [['coup-d-envoi', 80_000]]);
s.bas80000 = resume(budget.modeBudget({ maintenant: instant('2026-10-07') }));

// 7. Un réglage illisible : jamais pris pour « rien », les valeurs provisoires s'appliquent, l'enregistrement suivant le met de côté.
fs.writeFileSync(depot.FICHIER_BUDGET, '{ abîmé');
s.illisible = depot.lireReglageBudget();
const put4 = reponseFactice();
controleur.putClaudeBudgetSetting({ body: { tokensParJour: 1_000_000, tokensParSemaine: 5_000_000, mode: 'auto' } }, put4);
s.apresIllisible = { change: put4.corps.enregistrement.change, misDeCote: Boolean(put4.corps.enregistrement.misDeCote && fs.existsSync(put4.corps.enregistrement.misDeCote)), source: put4.corps.reglage.source };

// 8. Le plafond de 150 : intact, rappelé, et atteint = rien lancé, rien noté.
s.plafond = { dailyLimit: env.autoAiAnalysis.dailyLimit, variable: process.env.AUTO_AI_ANALYSIS_DAILY_LIMIT ?? null };
viderJournal();
const jourFige = auto.jourParis();
auto.enregistrerUsage(jourFige, { preMatch: 150 });
const { __testing: refresh } = await imp('jobs/matchStatsAutoRefresh.js');
const { runAutoPreMatchAnalyses } = await imp('core/ai/autoMatchAiTrigger.js');
let lances = 0;
const r = await refresh.passeIaAuto(
  { ecrit: false },
  {
    lancer: async (o) => {
      lances++;
      return runAutoPreMatchAnalyses(o);
    },
    usage: (ok, skipped) => ({ preMatch: ok, skippedPreMatch: skipped }),
    candidats: ['rencontre', 'rencontres'],
    faits: ['analysée', 'analysées']
  }
);
s.plafondAtteint = { summary: r.summary, lances, journal: fs.existsSync(JOURNAL) ? fs.readdirSync(JOURNAL) : [], restant: auto.budgetRestant(jourFige, env.autoAiAnalysis.dailyLimit) };
const etatPlafond = budget.etatBudgetClaude();
s.etatPlafond = etatPlafond.plafond;
s.etatCoherence = etatPlafond.coherence;

console.log(JSON.stringify({ ok: true, ...s }));
