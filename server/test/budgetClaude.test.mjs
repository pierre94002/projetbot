/**
 * Le budget Claude (étape 4 du plan).
 *   node --test test/budgetClaude.test.mjs        (depuis server/)
 *
 * Tout tourne dans des copies ISOLÉES (cf. test/aides/isolement.mjs) : base
 * d'essai, data/runtime à part, réseau coupé, heure figée au 05/10/2026 12 h
 * UTC. Claude est SIMULÉ (test/aides/claudeSimule.mjs : la réponse du CLI est
 * fabriquée, le reste de callClaudeCode — contrôles et journal — tourne pour
 * de vrai) ; l'API Anthropic à la clé et FotMob aussi. AUCUN vrai appel :
 * l'exécutable Claude de l'essai n'existe pas, aucun jeton, et la simulation
 * est refusée hors d'une copie d'essai.
 *
 *  1. Le journal compte TOUT au point de passage commun : l'analyse d'avance
 *     remplacée par celle du coup d'envoi, la reprise après changement de
 *     onze, la revue, les clics, les échecs (avec leurs tokens quand la
 *     réponse en a), l'API à la clé à part ; un journal qu'on ne peut pas
 *     écrire ne perd rien (même quand tous les fichiers ont la même date de
 *     modification) ; un appel refusé avant de partir n'est pas noté.
 *  2. Une journée simulée avec les vraies fonctions de l'appli : le compteur
 *     du plafond et le journal tombent juste ; la passe qui franchit les 80 %
 *     passe en mode économe en cours de route.
 *  3. Le mode économe à 80 % du budget du jour et de la semaine (du lundi au
 *     dimanche), au choix de Pierre ; l'API à la clé hors budget.
 *  4. Le réglage : provisoire, PUT idempotent, refus en 400, fichier illisible
 *     jamais écrasé.
 *  5. Le plafond quotidien de 150 : intact, rappelé, et atteint = rien lancé.
 *  6. La règle des deux titulaires habituels.
 *  7. Les favoris d'abord, et l'analyse d'avance réservée aux favoris — aussi
 *     quand tous les fichiers ont la même date de modification (horloge de
 *     disque grossière : la cause d'un échec de temps en temps, 07/10/2026).
 *  8. Aucun autre chemin vers Claude que les deux points de passage.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { coutSimule } from './aides/claudeSimule.mjs';

const script = (nom) => path.join(SERVEUR, 'test', 'aides', nom);

/**
 * Exécute un script d'essai dans une copie neuve, rend son JSON (et l'échec lisible sinon).
 * `envEnPlus` : des variables d'environnement de plus pour ce sous-processus (rien par défaut).
 */
function lancer(nom, envEnPlus = {}) {
  const copie = preparerCopie({});
  try {
    const r = executer(copie, script(nom), {
      timeout: 180_000,
      // Un exécutable Claude qui n'existe pas (dans la copie), l'actualisation coupée : même lancés depuis le dépôt.
      env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false', ...envEnPlus }
    });
    assert.equal(r.code, 0, `${nom} a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-2000)}`);
    assert.ok(r.json?.ok, `${nom} : sortie illisible\n${r.sortie.slice(-2000)}`);
    assert.equal(r.reseau, false, `${nom} : un appel réseau a été tenté\n${r.erreurs.slice(-2000)}`);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}

/** Les nombres français s'écrivent avec des espaces insécables (milliers) : comparés en espaces simples. */
const espaces = (t) => String(t).replace(/[  ]/g, ' ');

const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};

const journal = uneFois(() => lancer('script-budget-journal.mjs'));
const journee = uneFois(() => lancer('script-budget-journee.mjs'));
const mode = uneFois(() => lancer('script-budget-mode.mjs'));
const reprise = uneFois(() => lancer('script-budget-reprise.mjs'));
const favoris = uneFois(() => lancer('script-budget-favoris.mjs'));

// Le même script, mais TOUS les fichiers écrits ont la même date de modification (aides/dateDeFichierFigee.mjs) : l'horloge d'un disque
// qui ne bat que toutes les 15,6 ms (Windows, tant qu'aucune application n'a demandé mieux), poussée à l'extrême.
const AIDE_DATE_FIGEE = pathToFileURL(path.join(SERVEUR, 'test', 'aides', 'dateDeFichierFigee.mjs')).href;
const DATE_FIGEE = '2026-10-05T11:00:00.000Z';
const datesFigees = { NODE_OPTIONS: `--import ${AIDE_DATE_FIGEE}`, CM_TEST_DATE_FICHIER: DATE_FIGEE };
const favorisDatesFigees = uneFois(() => lancer('script-budget-favoris.mjs', datesFigees));
const journalDatesFigees = uneFois(() => lancer('script-budget-journal.mjs', datesFigees));

// ------------------------------------------------------- 1. le journal

test('journal : chaque appel noté au point de passage, avec son type, son match et ses tokens — l’analyse d’avance remplacée et la reprise comprises', () => {
  const s = journal();
  for (const cle of ['avance', 'coupDEnvoi', 'reprise', 'revue', 'clicAvant', 'clicApres', 'sansType', 'apiOk']) assert.equal(s[cle], 'ABOUTI', cle);
  assert.deepEqual(s.clicCodes, [201, 201]);

  // Le fichier des analyses perd l'usage de l'analyse d'avance (earlierAnalysis) et celui du premier coup d'envoi (écrasé par la reprise)…
  assert.equal(s.fichierAnalyses.timing, 'coup-d-envoi');
  assert.equal(s.fichierAnalyses.kickoffRuns, 2);
  assert.equal(s.fichierAnalyses.earlier, true);
  assert.equal(s.fichierAnalyses.earlierAUsage, false, "l'analyse d'avance remplacée n'a plus son usage dans le fichier");
  assert.equal(s.fichierAnalyses.usageTotal, s.simules[2].total, 'le fichier ne garde que l’usage de la reprise');
  // … le journal, lui, a les trois, avec leurs tokens exacts, et tous les autres appels.
  assert.deepEqual(s.journal.types, ['avance', 'coup-d-envoi', 'reprise', 'revue', 'manuel', 'manuel', 'avance', 'avance', 'avance', 'autre', 'manuel', 'manuel']);
  assert.deepEqual(s.journal.statuts, ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'echec', 'echec', 'echec', 'ok', 'ok', 'ok']);
  assert.deepEqual(s.journal.tokens, s.simules.map((a) => a.total), 'chaque appel simulé est au journal, avec ses tokens (inconnus = null, jamais 0)');
  assert.deepEqual(s.journal.usd, s.simules.map((a) => (a.total === null ? null : coutSimule(a.total))));
  assert.deepEqual(s.journal.matchs.slice(0, 4), Array(4).fill('cal-2026-10-05-Man City-Everton'));
  assert.deepEqual(s.journal.matchs.slice(4, 6), ['clic-fulham-leeds', 'clic-fulham-leeds']);
  assert.deepEqual(s.journal.details.slice(4, 6), ['avant-match', 'après-match']);
  assert.deepEqual(s.journal.modes.slice(0, 4), ['normal', 'normal', 'normal', 'normal']);
  assert.deepEqual(s.journal.canaux, ['claude-code']);
  assert.equal(s.journal.jour, '2026-10-05');

  // Une ligne complète.
  const e = s.journal.exemple;
  assert.equal(e.canal, 'claude-code');
  assert.equal(e.type, 'avance');
  assert.equal(e.statut, 'ok');
  assert.equal(e.modele, 'claude-code:sonnet');
  assert.deepEqual(e.match, { matchId: 'cal-2026-10-05-Man City-Everton', home: 'Man City', away: 'Everton', league: 'EPL' });
  assert.deepEqual(Object.keys(e.tokens), ['entree', 'ecritureCache', 'lectureCache', 'sortie', 'total']);
  assert.equal(e.tokens.entree + e.tokens.ecritureCache + e.tokens.lectureCache + e.tokens.sortie, e.tokens.total);
  assert.equal(e.at, '2026-10-05T12:00:00.000Z');

  // Totaux tenus dans le fichier = totaux du lecteur = somme des lignes.
  const somme = s.journal.tokens.reduce((n, t) => n + (t ?? 0), 0);
  assert.equal(s.journal.totaux.tokens.total, somme);
  assert.equal(s.journal.totaux.appels, 12);
  assert.equal(s.journal.totaux.echecs, 3);
  assert.equal(s.journal.totaux.sansTokens, 1);
  assert.deepEqual(s.lecteur, s.journal.totaux);
  assert.equal(s.journal.totaux.parType.avance.appels, 4);
  assert.equal(s.journal.totaux.parType.avance.echecs, 3);
});

test('journal : les échecs comptent (avec les tokens d’une réponse en erreur ou hors schéma), l’API à la clé à part et sans la clé', () => {
  const s = journal();
  assert.match(s.echecErreur, /quota simulé épuisé/);
  assert.match(s.echecSchema, /schéma non respecté/);
  assert.match(s.echecPanne, /n'a pas répondu/);
  const i = s.journal.types.indexOf('avance', 1);
  assert.equal(s.journal.tokens[i], s.simules[i].total, 'réponse en erreur : ses tokens sont comptés');
  assert.equal(s.journal.tokens[i + 1], s.simules[i + 1].total, 'schéma non respecté : ses tokens sont comptés');
  assert.equal(s.journal.tokens[i + 2], null, 'pas de réponse : tokens inconnus, pas zéro');

  assert.equal(s.apiOk, 'ABOUTI');
  assert.match(s.api401, /invalide ou révoquée/);
  assert.equal(s.envoisApi, 2);
  assert.deepEqual(s.journalApi, { lignes: 2, statuts: ['ok', 'echec'], tokens: [1500, null], canal: 'api-anthropic', contientCle: false });
});

test('journal : un fichier qu’on ne peut pas écrire ne perd rien et ne fait pas échouer l’appel ; un appel refusé avant de partir n’est pas noté', () => {
  const s = journal();
  assert.equal(s.pendantBlocage.appel, 'ABOUTI', "l'appel réussit même si le journal ne s'écrit pas");
  assert.equal(s.pendantBlocage.enAttente, 1);
  assert.equal(s.pendantBlocage.lu.enAttente, 1);
  assert.equal(s.pendantBlocage.lu.appels, s.journal.avantBlocage + 1, 'la ligne en attente est comptée, la dernière version lue aussi');
  assert.equal(s.pendantBlocage.lu.probleme, true);
  assert.equal(s.pendantBlocage.fichierIntact, true, 'un fichier illisible n’est jamais écrasé');
  assert.equal(s.apresBlocage.appel, 'ABOUTI');
  assert.equal(s.apresBlocage.enAttente, 0, 'la ligne en attente repart avec la suivante');
  assert.deepEqual(s.journal.details.slice(-2), ['pendant le blocage', 'après le blocage']);

  assert.match(s.nonConfigure, /^ECHEC Claude Code non configuré/);
  if (s.bac) {
    assert.match(s.refusBac, /^ECHEC Bac à sable/);
    assert.match(s.apiRefusBac, /^ECHEC Bac à sable/);
  }
  assert.equal(s.lignesApresRefus, 0, 'rien de noté pour un appel qui n’est pas parti');
  assert.match(s.simulationHorsEssai.claude, /^ECHEC .*réservée aux tests/);
  assert.match(s.simulationHorsEssai.api, /^ECHEC .*réservée aux tests/);
  assert.equal(s.simulationRetablie, true);
});

// ------------------------------------------------- 2. une journée simulée

test('journée simulée : le compteur du plafond et le journal tombent juste (plus d’écart 39 / 29)', () => {
  const s = journee();
  assert.equal(s.plafond, 150);
  assert.equal(s.compteur.count, 6);
  assert.equal(s.journal.automatiquesReussis, s.compteur.count, 'compteur = appels automatiques réussis du journal');
  assert.equal(s.compteur.preMatch, 5);
  assert.equal(s.compteur.postMatch, 1);
  assert.equal(s.journal.lignes, 9, '6 automatiques + 1 revue en échec + 2 clics');
  assert.deepEqual(s.journal.suite, [
    'coup-d-envoi:ok:Brentford:normal',
    'coup-d-envoi:ok:Norwich:normal',
    'reprise:ok:Brentford:normal',
    'manuel:ok:Man City:-',
    'avance:ok:Watford:normal',
    'avance:ok:Everton:econome',
    'revue:echec:Leeds:econome',
    'revue:ok:Blackburn:econome',
    'manuel:ok:Man City:-'
  ]);
  assert.deepEqual(s.simules, s.journal.suite.map((x) => x.split(':').slice(0, 3).join(':').replace(':echec:', ':erreur:')));
  assert.equal(s.journal.tokens, 9 * 30_000);
  // Le fichier des analyses, lui, n'en garde que 7 (le premier coup d'envoi de Brentford écrasé par la reprise, la revue ratée).
  assert.equal(s.fichierAnalyses.usagesDuJour, 7);
  assert.equal(s.fichierAnalyses.brentfordKickoffRuns, 2);
  assert.equal(s.etat.coherence.egal, true);
  assert.equal(s.etat.coherence.compteur, 6);
  assert.equal(s.etat.coherence.journalAutomatiques, 6);
  assert.equal(s.etat.aujourdhui.appels, 9);
  assert.equal(s.etat.aujourdhui.echecs, 1);
  assert.equal(s.etat.derniers, 9);
  assert.equal(s.reseauFotmob, 0);
});

test('journée simulée : la passe qui franchit les 80 % passe en mode économe en cours de route ; au-delà de 100 %, rien ne s’arrête', () => {
  const s = journee();
  const [kick, rep, clic, avance, revues, onze, onzeBis, clic2] = s.journee;
  assert.equal(kick.mode, 'normal');
  assert.equal(kick.r.ok, 2);
  assert.equal(rep.r.reprises, 1, 'mode normal : reprise au moindre changement');
  assert.equal(clic.r.code, 201);
  // Avance : 120 000 tokens au départ (normal), 150 000 après la première (= 80 % de 187 500) → économe.
  assert.equal(avance.r.details.ok, 2);
  assert.equal(avance.r.details.ecartesEconome, 4);
  assert.equal(avance.r.details.skipped, 0, 'les non-favoris laissés ne sont pas « laissés pour demain » par le plafond');
  assert.equal(avance.r.details.mode, 'econome');
  assert.match(espaces(avance.r.summary), /6 rencontres à venir : 2 analysées, 4 non favorites laissées sans analyse d'avance — Mode économe : 96 % du budget du jour \(180 000 \/ 187 500 tokens\)\.$/);
  assert.equal(avance.compteur, 5);
  // Revues : le favori d'abord (Leeds, EPL), en échec ; puis l'autre.
  assert.equal(revues.r.details.ok, 1);
  assert.equal(revues.r.details.failed, 1);
  assert.equal(revues.r.status, 'warn');
  assert.equal(revues.compteur, 6, 'une revue ratée ne compte pas sur le plafond');
  // Onze changé sans titulaire habituel touché : reprise évitée, une seule fois comptée.
  assert.equal(onze.r.reprisesEvitees, 1);
  assert.equal(onze.appels, 8);
  assert.equal(onzeBis.r.reprisesEvitees, 0);
  assert.equal(onzeBis.appels, 8);
  // Au-delà de 100 % (240 000 / 187 500) : le clic passe, rien n'est coupé.
  assert.equal(clic2.r.code, 201);
  assert.ok(s.etat.aujourdhui.part > 1);
  assert.equal(s.etat.mode, 'econome');
  assert.deepEqual(s.etat.declencheurs, ['jour']);
  assert.deepEqual(s.etat.effets, { jour: '2026-10-05', avancesEcartees: 4, reprisesEvitees: 1 });
  assert.equal(s.etat.plafond.limite, 150);
  assert.equal(s.etat.plafond.restant, 144);
});

// ----------------------------------------------------- 3. le mode économe

test('mode économe à 80 % du budget du JOUR (provisoire 1 200 000) : 959 999 tokens → normal, 960 000 → économe ; au volume mesuré, rien ne change', () => {
  const s = mode();
  assert.equal(s.vide.mode, 'normal');
  // La promesse faite à Pierre : au volume mesuré (03/10 et 04/10), le budget provisoire ne change rien.
  assert.equal(s.volumeMesure.mardi.mode, 'normal', '~0,85 M dans la journée (04/10) : normal');
  assert.equal(s.volumeMesure.mercredi.mode, 'normal', '~2,3 M sur trois jours : normal');
  assert.equal(s.jour959999.mode, 'normal');
  assert.match(espaces(s.jour959999.raison), /^Mode normal : 79,9 % du budget du jour/);
  assert.equal(s.jour960000.mode, 'econome');
  assert.deepEqual(s.jour960000.declencheurs, ['jour']);
  assert.equal(espaces(s.jour960000.raison), 'Mode économe : 80 % du budget du jour (960 000 / 1 200 000 tokens).');
  // Un budget réglé plus bas : la bascule suit.
  assert.equal(s.bas79999.mode, 'normal');
  assert.equal(s.bas80000.mode, 'econome');
});

test('mode économe à 80 % du budget de la SEMAINE (provisoire 6 000 000 : 4 800 000 ; lundi → dimanche, jours de Paris), sans aucun jour au-dessus de 80 %', () => {
  const s = mode();
  assert.deepEqual(s.semaine, ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  assert.deepEqual(s.semaineDimanche, s.semaine);
  assert.equal(s.semaineLundi[0], '2026-10-12');
  assert.equal(s.semaine4799999.mode, 'normal');
  assert.equal(s.semaine4800000.mode, 'econome');
  assert.deepEqual(s.semaine4800000.declencheurs, ['semaine']);
  assert.equal(s.semaine4800000.partJour, 50_000 / 1_200_000, 'le jour seul est loin des 80 %');
  assert.equal(espaces(s.semaine4800000.raison), 'Mode économe : 80 % du budget de la semaine (4 800 000 / 6 000 000 tokens).');
  assert.equal(s.semaineDimanche4800000.mode, 'econome');
  assert.equal(s.lundiSuivant.mode, 'normal', 'nouvelle semaine : la précédente ne compte plus');
  assert.deepEqual(s.consoSamedi, {
    jour: '2026-10-10',
    aujourdhui: 50_000,
    semaine: 4_800_000,
    parJour: [['2026-10-05', 950_000], ['2026-10-06', 950_000], ['2026-10-07', 950_000], ['2026-10-08', 950_000], ['2026-10-09', 950_000], ['2026-10-10', 50_000]]
  });
});

test('mode économe : au choix de Pierre ; l’API à la clé hors budget ; un échec compte ses tokens ; règles et drapeaux de l’étape 41', () => {
  const s = mode();
  assert.equal(s.manuel.mode, 'econome');
  assert.deepEqual(s.manuel.declencheurs, ['manuel']);
  assert.equal(s.manuel.partJour, 0);
  assert.equal(s.manuelEtat.choixReglage, 'econome');
  // 10 millions de tokens de l'API à la clé : rien sur le budget.
  assert.equal(s.apiEtEchecs.mode, 'normal');
  assert.deepEqual(s.etatApi, { api: 10_000_000, jour: 959_999, appels: 3, echecs: 2, sansTokens: 1 });
  assert.equal(s.echecQuiFranchit.mode, 'econome', 'un appel en échec avec ses tokens compte');
  // Les règles. Depuis l'étape 41, le compactage n'est plus une règle du mode économe :
  // la fiche compacte est la forme normale, dans les deux modes ; l'essai sans mise en cache reste éteint.
  const { compactage, ...regles } = s.jour960000.politique;
  assert.deepEqual(regles, {
    uneSeuleAnalyseAvantMatch: true,
    repriseTitulairesHabituelsMin: 2,
    avanceFavorisSeulement: true,
    favorisDabord: true,
    essaiSansCache: { actif: false, prevu: 'essai sans mise en cache : prévu, pas activé' }
  });
  assert.deepEqual([compactage.actif, compactage.forme, compactage.depuis, compactage.reglage], [true, 'compacte', 'étape 41', 'AI_ANALYSIS_FICHE']);
  assert.match(compactage.texte, /^fiche compacte envoyée à l'IA .*en mode normal comme en mode économe$/);
  assert.equal(s.vide.politique.repriseTitulairesHabituelsMin, 1);
  assert.equal(s.vide.politique.avanceFavorisSeulement, false);
  assert.equal(s.vide.politique.favorisDabord, false);
  assert.deepEqual(s.vide.politique.compactage, compactage, 'même fiche en mode normal');
  assert.equal(s.vide.politique.essaiSansCache.actif, false);
});

// -------------------------------------------------------- 4. le réglage

test('réglage : provisoire (1 200 000 / 6 000 000) tant que rien n’est enregistré, PUT idempotent, refus en 400, illisible jamais écrasé', () => {
  const s = mode();
  assert.equal(s.provisoire.tokensParJour, 1_200_000);
  assert.equal(s.provisoire.tokensParSemaine, 6_000_000);
  assert.equal(s.provisoire.mode, 'auto');
  assert.equal(s.provisoire.provisoire, true);
  assert.equal(s.provisoire.source, 'defaut');
  assert.equal(s.get.reglage.provisoire, true);
  assert.equal(s.get.fichierExiste, false, 'la lecture n’écrit rien');
  // Étape 42 : le bulletin du jour et le bilan de la semaine ont leur type d'appel (automatiques, comptés sur le plafond).
  // Étape 26 (partie D) : le résumé du mois de la boucle de correction aussi, juste après le bilan.
  assert.deepEqual(s.get.parType, ['avance', 'coup-d-envoi', 'reprise', 'revue', 'bulletin', 'bilan-semaine', 'resume-mois', 'manuel', 'autre']);

  assert.equal(s.put.premier.change, true, 'enregistrer les valeurs provisoires les confirme');
  assert.equal(s.put.reglageApres.source, 'enregistre');
  assert.equal(s.put.reglageApres.provisoire, false);
  assert.equal(s.put.second.change, false);
  assert.equal(s.put.memeFichier, true, 'le même réglage ne réécrit rien');
  assert.deepEqual(Object.keys(s.put.contenu), ['tokensParJour', 'tokensParSemaine', 'mode', 'enregistreLe']);
  assert.equal(s.put.contenu.tokensParJour, 1_200_000);
  assert.equal(s.put.contenu.tokensParSemaine, 6_000_000);
  for (const [cas, r] of Object.entries(s.refus)) assert.match(r, /^400 /, cas);
  assert.equal(s.apresRefus, true);

  assert.equal(s.illisible.source, 'illisible');
  assert.equal(s.illisible.provisoire, true);
  assert.equal(s.apresIllisible.change, true);
  assert.equal(s.apresIllisible.misDeCote, true, 'mis de côté, pas effacé');
  assert.equal(s.apresIllisible.source, 'enregistre');
});

// ---------------------------------------------------------- 5. le plafond

test('plafond quotidien de 150 intact : inchangé par le budget, rappelé dans l’état, atteint = rien lancé, rien noté', () => {
  const s = mode();
  assert.deepEqual(s.plafond, { dailyLimit: 150, variable: null });
  assert.equal(s.plafondAtteint.summary, 'Plafond quotidien (150) atteint : rien lancé à cette passe, reprise demain.');
  assert.equal(s.plafondAtteint.lances, 0);
  assert.deepEqual(s.plafondAtteint.journal, []);
  assert.equal(s.plafondAtteint.restant, 0);
  assert.equal(s.etatPlafond.limite, 150);
  assert.equal(s.etatPlafond.aujourdhui, 150);
  assert.equal(s.etatPlafond.restant, 0);
});

// ------------------------------------------- 6. les deux titulaires habituels

test('règle des deux titulaires habituels : qui compte comme habituel, et ce qui compte comme changement', () => {
  const { A } = reprise();
  assert.deepEqual(A.identique, []);
  assert.deepEqual(A.remplacantContreRemplacant, [], 'un remplaçant contre un autre : rien');
  assert.deepEqual(A.sansStatsRemplace, []);
  assert.deepEqual(A.unHabituelSorti, ['home:Joueur 1008:sorti'], '5 titularisations sur 10 : habituel');
  assert.deepEqual(A.deuxHabituelsSortis, ['home:Joueur 1007:sorti', 'home:Joueur 1008:sorti']);
  assert.deepEqual(A.habituelContreHabituel, ['home:Joueur 1008:sorti', 'home:Habituel absent 1000:entré'], 'un habituel remplacé par un autre compte pour deux');
  assert.deepEqual(A.habituelRevient, ['home:Habituel absent 1000:entré']);
  assert.deepEqual(A.unDeChaqueCote, ['home:Joueur 1008:sorti', 'away:Joueur 2000:sorti']);
  assert.equal(A.coteSansCompo, 1, 'un côté sans composition connue est ignoré');
  assert.equal(A.peuDeMatchs, 1, 'sur 2 matchs, 2 titularisations font un habituel');
  assert.equal(A.avecOnzesDe, 2);
});

test('règle des deux titulaires habituels : la reprise attend deux habituels en économe, un changement suffit en normal ; les règles d’avant intactes', () => {
  const { B, C } = reprise();
  assert.deepEqual(B.unHabituel, { change: true, econome: false, normal: true });
  assert.deepEqual(B.deuxHabituels, { change: true, econome: true, normal: true });
  assert.deepEqual(B.unRemplacant, { change: true, econome: false, normal: true });
  assert.deepEqual(B.compoPlusAncienne, { change: false, econome: null, normal: null });
  assert.deepEqual(B.dejaRefaite, { change: false, econome: null, normal: null });
  // La vraie passe d'avant coup d'envoi.
  assert.deepEqual(C.econome1, { ok: 0, reprises: 0, reprisesEvitees: 1, mode: 'econome', appels: 0 });
  assert.deepEqual(C.econome1bis, { ok: 0, reprises: 0, reprisesEvitees: 0, mode: 'econome', appels: 0 }, 'comptée une fois, jamais refaite');
  assert.deepEqual(C.econome2, { ok: 1, reprises: 1, reprisesEvitees: 0, mode: 'econome', appels: 1 });
  assert.equal(C.kickoffRunsK, 2);
  assert.deepEqual(C.normal1, { ok: 1, reprises: 1, reprisesEvitees: 0, mode: 'normal', appels: 2 });
  assert.equal(C.kickoffRunsK2, 2);
  assert.deepEqual(C.journal, ['reprise:Brentford:econome', 'reprise:Norwich:normal']);
  assert.equal(C.effets.reprisesEvitees, 1);
});

// ---------------------------------------------------------- 7. les favoris

test('favoris : reconnus par championnat et par identifiant FotMob — jamais l’homonyme', () => {
  const s = favoris();
  assert.notEqual(s.nacionalParaguay, s.nacionalPortugal);
  assert.deepEqual(s.estFavori, { everton: true, norwichParIdentifiant: true, nacionalParaguay: false, nacionalPortugal: true, watford: false });
});

test('mode économe : analyse d’avance réservée aux favoris, favoris d’abord ; en mode normal, tout comme avant', () => {
  const s = favoris();
  assert.deepEqual(s.avanceEconome.appels, ['avance:Everton', 'avance:Norwich']);
  assert.equal(s.avanceEconome.ok, 2);
  assert.equal(s.avanceEconome.ecartes, 3);
  assert.equal(s.avanceEconome.effets.avancesEcartees, 3);
  assert.deepEqual(s.avanceNormal.appels, ['avance:Watford', 'avance:Everton', 'avance:Nacional', 'avance:Norwich', 'avance:DC United']);
  assert.equal(s.avanceNormal.ecartes, 0);
});

test('mode économe : quand le plafond coupe la liste, les favoris passent d’abord (coup d’envoi et revues) ; en normal, l’ordre d’avant', () => {
  const s = favoris();
  assert.deepEqual(s.coupDEnvoiEconome.appels, ['coup-d-envoi:Leeds'], 'le favori, même à 40 min');
  assert.deepEqual(s.coupDEnvoiNormal.appels, ['coup-d-envoi:Birmingham'], 'le plus proche du coup d’envoi');
  assert.deepEqual(s.revuesEconome.appels, ['revue:Fulham']);
  assert.deepEqual(s.revuesNormal.appels, ['revue:Birmingham']);
});

// Le test précédent échouait de temps en temps (07/10/2026), sans raison apparente. Cause : le script d'essai réécrit le fichier des
// analyses SANS passer par le dépôt du serveur (matchAiAnalysisRepository.js), et ce dépôt ne rouvre son fichier que si sa DATE DE
// MODIFICATION a changé. Réécrit juste après une écriture du serveur, avec une horloge de fichiers qui bat toutes les 15,6 ms, le
// fichier gardait la même date : le dépôt servait l'ancien contenu — « revues : aucun candidat », analyses d'avance crues déjà faites.
// C'était le script d'essai, pas le code du serveur : en production seul le serveur écrit ce fichier (et réaligne son cache).
test('l’aide « date de fichier figée » fait bien ce qu’elle dit : tous les fichiers écrits reçoivent la même date de modification, et sans elle les dates sont celles de l’horloge', () => {
  const copie = preparerCopie({ base: false });
  try {
    const code = [
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      "const dates = [];",
      "for (let i = 0; i < 5; i++) {",
      "  const f = path.join(process.env.DOSSIER_ESSAI, `essai-${i}.json`);",
      "  fs.writeFileSync(f, JSON.stringify({ i }));",
      "  dates.push(fs.statSync(f).mtimeMs);",
      "}",
      "console.log(JSON.stringify(dates));"
    ].join('\n');
    const dates = (avecAide) => {
      const r = spawnSync(process.execPath, [...(avecAide ? ['--import', AIDE_DATE_FIGEE] : []), '--input-type=module', '-e', code], {
        cwd: copie.dossier,
        env: { SystemRoot: process.env.SystemRoot ?? '', PATH: process.env.PATH ?? '', DOSSIER_ESSAI: copie.donnees, ...(avecAide ? { CM_TEST_DATE_FICHIER: DATE_FIGEE } : {}) },
        encoding: 'utf8',
        timeout: 60_000
      });
      assert.equal(r.status, 0, r.stderr);
      return JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1));
    };
    assert.deepEqual(dates(true), Array(5).fill(Date.parse(DATE_FIGEE)), 'cinq écritures, une seule date');
    const maintenant = Date.now();
    for (const d of dates(false)) assert.ok(Math.abs(d - maintenant) < 3_600_000, 'sans l’aide : la date de l’écriture');
    // Une date absente : l'aide refuse de s'installer (elle ne servirait à rien).
    const sansDate = spawnSync(process.execPath, ['--import', AIDE_DATE_FIGEE, '--input-type=module', '-e', '1'], { cwd: copie.dossier, env: { SystemRoot: process.env.SystemRoot ?? '', PATH: process.env.PATH ?? '' }, encoding: 'utf8', timeout: 60_000 });
    assert.notEqual(sansDate.status, 0);
    assert.match(sansDate.stderr, /CM_TEST_DATE_FICHIER manque/);
  } finally {
    copie.nettoyer();
  }
});

test('mode économe, les favoris, avec des fichiers qui ont TOUS la même date de modification (horloge de disque grossière) : le même déroulé — jamais « aucune revue » ni des analyses d’avance crues déjà faites', () => {
  const s = favorisDatesFigees();
  // Le script a bien tourné avec l'horloge de fichiers figée (sinon ce test ne prouverait rien) ; sans l'aide, ses fichiers ont la date du jour.
  assert.equal(s.dateDeFichier, Date.parse(DATE_FIGEE));
  assert.notEqual(favoris().dateDeFichier, Date.parse(DATE_FIGEE));
  assert.deepEqual(s.avanceEconome.appels, ['avance:Everton', 'avance:Norwich']);
  assert.equal(s.avanceEconome.ok, 2);
  assert.equal(s.avanceEconome.ecartes, 3);
  assert.deepEqual(s.avanceNormal.appels, ['avance:Watford', 'avance:Everton', 'avance:Nacional', 'avance:Norwich', 'avance:DC United'], 'les analyses faites par la passe d’avant ne sont plus au fichier');
  assert.equal(s.avanceNormal.ecartes, 0);
  assert.deepEqual(s.coupDEnvoiEconome.appels, ['coup-d-envoi:Leeds'], 'le favori, même à 40 min');
  assert.deepEqual(s.coupDEnvoiNormal.appels, ['coup-d-envoi:Birmingham'], 'le plus proche du coup d’envoi');
  assert.deepEqual(s.revuesEconome.appels, ['revue:Fulham'], 'les analyses d’avant-match que le script vient d’écrire sont lues, pas celles de la passe précédente');
  assert.deepEqual(s.revuesNormal.appels, ['revue:Birmingham']);
  // Le même déroulé que dans les conditions normales (les trois tests des favoris plus haut).
  const normal = favoris();
  for (const cle of ['avanceEconome', 'avanceNormal', 'coupDEnvoiEconome', 'coupDEnvoiNormal', 'revuesEconome', 'revuesNormal']) assert.deepEqual(s[cle].appels, normal[cle].appels, cle);
});

// La même fragilité, trouvée en cherchant : le script du journal abîme puis répare le fichier du jour SANS passer par le journal du serveur,
// qui ne le relit que si sa date de modification a changé (le test « un fichier qu'on ne peut pas écrire ne perd rien », plus haut).
test('journal, avec des fichiers qui ont TOUS la même date de modification : le fichier du jour abîmé est vu (la ligne attend, comptée), jamais écrasé, puis relu une fois réparé', () => {
  const s = journalDatesFigees();
  assert.equal(s.dateDeFichier, Date.parse(DATE_FIGEE), 'le script a bien tourné avec l’horloge de fichiers figée');
  assert.notEqual(journal().dateDeFichier, Date.parse(DATE_FIGEE));
  assert.equal(s.pendantBlocage.appel, 'ABOUTI', "l'appel réussit même si le journal ne s'écrit pas");
  assert.equal(s.pendantBlocage.enAttente, 1);
  assert.equal(s.pendantBlocage.lu.enAttente, 1);
  assert.equal(s.pendantBlocage.lu.probleme, true, 'le fichier abîmé est vu, malgré une date de modification inchangée');
  assert.equal(s.pendantBlocage.fichierIntact, true, 'un fichier illisible n’est jamais écrasé');
  assert.equal(s.apresBlocage.appel, 'ABOUTI');
  assert.equal(s.apresBlocage.enAttente, 0, 'la ligne en attente repart avec la suivante');
  assert.deepEqual(s.journal.details.slice(-2), ['pendant le blocage', 'après le blocage']);
  const normal = journal();
  assert.deepEqual(s.pendantBlocage, normal.pendantBlocage);
  assert.deepEqual(s.apresBlocage, normal.apresBlocage);
});

// ------------------------------------------- 8. un seul chemin vers Claude

test('aucun autre chemin vers Claude que les deux points de passage, et chaque appelant dit ce qu’il demande', () => {
  const src = path.join(SERVEUR, 'src');
  const fichiers = fs.readdirSync(src, { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => path.join(src, f));
  const lire = (f) => fs.readFileSync(f, 'utf8');
  const rel = (f) => path.relative(src, f).split(path.sep).join('/');
  const avec = (motif) => fichiers.filter((f) => motif.test(lire(f))).map(rel).sort();
  // Le CLI Claude et l'API Anthropic ne sont lancés qu'à leur point de passage.
  assert.deepEqual(avec(/claudeCode\.bin\b/), ['core/ai/claudeCodeClient.js']);
  assert.deepEqual(avec(/api\.anthropic\.com/), ['core/ai/anthropicClient.js']);
  // Le journal n'est écrit que par eux.
  assert.deepEqual(avec(/journaliserAppel\s*\(/), ['core/ai/anthropicClient.js', 'core/ai/claudeCodeClient.js', 'data/repositories/claudeUsageLedger.js'].sort());
  // Chaque appel passe un contexte (`appel`) — sinon il serait noté « autre ».
  for (const f of avec(/\bcall(ClaudeCode|AnthropicMessages)\s*\(\s*\{/)) {
    if (f.endsWith('Client.js')) continue;
    const blocs = lire(path.join(src, f)).split(/\bcall(?:ClaudeCode|AnthropicMessages)\s*\(\s*\{/).slice(1);
    for (const bloc of blocs) {
      const appelComplet = bloc.slice(0, bloc.indexOf('});') + 1);
      assert.match(appelComplet, /\bappel\s*:|\.\.\.params/, `${f} : un appel sans « appel » (type) — il serait noté « autre »`);
    }
  }
});
