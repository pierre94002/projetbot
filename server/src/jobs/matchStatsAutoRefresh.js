/**
 * matchStatsAutoRefresh.js — l'actualisation complète de l'appli.
 * -----------------------------------------------------------------------
 * Tient toutes les données à jour sans rien demander, depuis FotMob (et
 * football-data.co.uk pour les cotes passées) — les étapes 1 à 7 n'utilisent
 * ni Claude ni quota payant. Remplace, en plus complet, la tâche planifiée
 * Claude « actualisation quotidienne » supprimée le 24/09/2026 : elle
 * consommait le quota Claude de l'utilisateur et pouvait écrire en même temps
 * que cette boucle. Les étapes `iaAutoAvantMatch`/`iaAutoApresMatch` (ajoutées
 * le 26-27/09/2026) sont l'exception délibérée : elles utilisent Claude Code
 * (quota d'abonnement, cf. claudeCodeClient.js), sous un plafond quotidien
 * strict — voir leur propre commentaire plus bas.
 *
 * QUAND. Une passe au démarrage du serveur (une minute après), puis toutes
 * les trois heures tant qu'il tourne. Au démarrage, la passe RATTRAPE
 * l'absence : calendrier, résultats et rencontres repartent de la dernière
 * passe réussie (au plus soixante jours en arrière), et non d'une fenêtre
 * fixe de sept ou dix jours qui perdait tout ce qui la dépassait.
 *
 * QUOI, dans l'ordre, sous UN seul verrou partagé avec la ligne de commande :
 *    1. calendrier et résultats (qui alimentent le règlement) ;
 *    2. classements officiels de la saison en cours ;
 *    3. nouvelles rencontres terminées ;
 *    4. rencontres omises par la liste du jour (page de chaque compétition) ;
 *    5. feuilles publiées en retard : les rencontres récentes « sans
 *       feuille » sont redemandées (une fois par jour) ;
 *    6. feuilles de match manquantes ;
 *    7. annuaires d'identités, reconstruits UNE fois si un import a écrit ;
 *    8. règlement des pronostics et des paris ;
 *    9. contrôle de cohérence des scores (une fois par jour), puis les
 *       CONTRÔLES DES DONNÉES ET LE CARNET DE SANTÉ (étape 12 du plan,
 *       06/10/2026) : une fois par jour, seulement les rencontres nouvelles
 *       ou modifiées depuis le contrôle précédent (le contrôle complet la
 *       première fois), dans un processus à part, base en lecture seule ;
 *   10. cotes passées football-data (toutes les douze heures), puis
 *       l'HISTORIQUE FOOTBALL-DATA DEPUIS 2000 (étape 13 du plan, 06/10/2026 :
 *       l'import complet par morceaux de 150 requêtes la première fois, puis
 *       une fois par jour, en reprenant les fichiers que les cotes passées
 *       viennent de télécharger ; la saison en cours redemandée au plus une
 *       fois par semaine), puis les REPÈRES DE CHAQUE CHAMPIONNAT (étape 15
 *       du plan, 07/10/2026 : une fois par jour, seulement les saisons qui
 *       ont changé, dans le serveur en rendant la main ; mesurés seulement),
 *       puis la TABLE DU JOUR J (étape 17 du plan, 12/10/2026 : pour chaque
 *       match passé, ce qu'on savait la veille de chaque équipe et de chaque
 *       joueur ; une fois par jour, seulement les rencontres nouvelles,
 *       modifiées ou retirées, dans le serveur en rendant la main ; mesurée
 *       seulement, le moteur ne la lit pas encore) ;
 *       puis les cotes gratuites des matchs à venir, puis CONNAÎTRE LE MARCHÉ
 *       (étape 22 du plan, 13/10/2026 : justesse, vitesse, biais et marges de
 *       chaque bookmaker, meilleur moment pour parier de chaque championnat,
 *       sur toutes les cotes archivées ; une fois par jour, rien si aucune
 *       source n'a bougé, le calcul dans un processus à part en lecture
 *       seule, rangé ensuite par le serveur — cf. data/marketKnowledge.js),
 *       puis L'INDICE DE FORCE DES ÉQUIPES (étape 29 du plan, 14/10/2026 :
 *       pour chaque club et chaque jour de match, sa force la veille, corrigée
 *       de la force des adversaires, au total, à domicile et à l'extérieur ;
 *       une fois par jour, seulement les championnats touchés par une
 *       rencontre nouvelle, modifiée ou retirée, le rejeu dans un processus à
 *       part en lecture seule, rangé par le serveur ; proposé seulement, le
 *       moteur ne le lit pas — cf. data/db/teamStrength.js),
 *       et le GEL DES PRONOSTICS
 *       du moteur pour tous les matchs à venir, une fois par jour (étape E
 *       du plan, 05/10/2026 : enregistreurs, cf. data/enregistreurs/), puis
 *       la VERSION CANDIDATE DU MOTEUR À BLANC (étape 25 du plan, 07/10/2026 :
 *       une fois par jour, seulement s'il y a une candidate en essai et pour
 *       les marchés qu'elle change ; ses chiffres à part, jamais montrés,
 *       pariés ni envoyés à l'IA — cf. data/enregistreurs/moteurABlanc.js),
 *       puis la CALIBRATION DU MOIS ÉCOULÉ (étape 20 du plan, 13/10/2026 :
 *       le 1er du mois à partir de 6 h, ou la première passe d'après, le
 *       bilan annoncé / réalisé du mois écoulé est figé une fois pour toutes
 *       dans la base — cf. data/calibration.js), puis la CARTE « OÙ PARIER »
 *       (étape 23 du plan, 22/10/2026 : championnat × marché, l'avantage
 *       du moteur jugé par le juge de l'étape 16 ; dès qu'un rejeu du banc
 *       existe, puis le 1er du mois, à un nouveau rejeu ou à un changement
 *       de réglages — calculée dans un processus à part, rangée une fois
 *       dans la base ; cf. data/bettingMap.js). Après la passe, le verrou
 *       rendu, le BANC DU MOIS : relancé le 1er du mois si le moteur a
 *       changé depuis le dernier rejeu (jamais le premier rejeu, jamais
 *       pendant une passe ; cf. data/rejeuDuServeur.js) ;
 *   11. sauvegarde de la base, CHAQUE NUIT (étape 1 du plan, 06/10/2026) :
 *       copie compressée + données de l'appli, rotation 7 quotidiennes /
 *       4 hebdomadaires / 12 mensuelles, restauration d'essai chaque semaine
 *       (contrôle complet chaque mois), copie hors du disque chaque semaine
 *       si une destination est réglée — tout dans des processus à part ;
 *       puis LA SIMULATION COMPLÈTE (étape 28 du plan, 27/10/2026 : une fois
 *       par jour civil de Paris, jamais au clic, ni réseau ni Claude — les fins
 *       de saison et l’enjeu des rencontres dans un processus à part en lecture
 *       seule, puis le déroulé simulé des rencontres des 48 prochaines heures,
 *       chemins tirés dans un processus à part sans base ; rangés par le
 *       serveur, calculés à blanc, jamais lus par le moteur — cf.
 *       data/simulation/simulationNuit.js) ;
 *       puis le CARNET DE L'IA (étape 21 du plan, 14/10/2026 : une fois par
 *       jour ou au clic, chaque avis d'avant-match de l'IA réglé au magasin,
 *       sa clôture, sa fiabilité par marché et par championnat, et les
 *       marchés où elle n'apporte rien retirés de sa liste — 0 token,
 *       cf. data/aiScorecard.js), puis la MÉMOIRE DE L'IA (étape 44 du plan,
 *       23/10/2026 : un dossier par équipe et par championnat écrit par le
 *       code, refait seulement pour les équipes qui ont joué, ses leçons
 *       confirmées par le carnet — 0 token, cf. data/aiDossiers.js), puis le
 *       BULLETIN DU JOUR et le BILAN DE LA
 *       SEMAINE (étape 42 du plan, 22/10/2026 : deux textes écrits par l'IA —
 *       un appel à Claude Code le matin, un le lundi — à partir d'une fiche
 *       chiffrée que le code prépare sans token ; les chiffres du texte sont
 *       vérifiés, il est rangé dans data/runtime/ai-bulletins.json ; ils
 *       comptent dans le budget Claude de l'étape 4, jamais forcés par un clic,
 *       cf. core/ai/bulletinService.js) ;
 *   12. le CONTRÔLE QUOTIDIEN (étape 14 du plan, 07/10/2026), à CHAQUE
 *       passe et en dernier, quand tout ce qui écrit a écrit : une trentaine
 *       de contrôles rapides (ceux de l'étape 12 sur les 30 derniers jours,
 *       les scores face à football-data, les zéros « non relevé », les
 *       repères de l'étape 15, la santé des sources) donnent un feu vert,
 *       orange ou rouge ; rien n'est corrigé (data/db/dailyChecks.js).
 *
 * Chaque étape est protégée : une panne n'arrête pas les suivantes. Chaque
 * passe est consignée, étape par étape, dans data/runtime/refresh-status.json
 * (cf. refreshStatusRepository.js), que l'écran Réglages affiche.
 *
 * Réglages (variables d'environnement) :
 *   MATCH_STATS_AUTO_REFRESH          "false" pour désactiver
 *   MATCH_STATS_REFRESH_INTERVAL_MIN  période en minutes (défaut : 180)
 *   MATCH_STATS_REFRESH_DELAY_MIN     attente au démarrage (défaut : 1)
 *   MATCH_STATS_REFRESH_BATCH         feuilles par passe (défaut : 300)
 *   MATCH_STATS_REFRESH_CONCURRENCY   appels simultanés (défaut : 4)
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { withRefreshLock } from '../data/providers/refreshLock.js';
import { refreshFromFotMob, importMissingFromFotMob, importFotmobIds, deferRegistryRebuilds, takeDeferredRegistryRebuild } from '../data/providers/fotMobRefresh.js';
import { invalidateRegistryCaches } from '../data/db/identityRegistry.js';
import { refreshCalendarFromFotMob } from '../data/providers/fotMobCalendar.js';
import { fillFixtureGaps } from '../data/providers/fotMobFixtureGaps.js';
import { refreshOfficialStandings } from '../data/providers/fotMobStandingsRefresh.js';
import { refreshCurrentOdds } from '../data/providers/footballDataOdds.js';
import { passeHistorique, historiqueAFaire, REQUETES_PAR_PASSE } from '../data/providers/footballDataHistory.js';
import { collectUpcomingOdds, finalizeOdds } from '../data/providers/freeOdds.js';
import { readSourceState, writeSourceState } from '../data/db/oddsQuotesRepository.js';
import { invalidateFreeMarketOdds } from '../data/freeMarketOdds.js';
import { settlePending } from '../data/providers/settlementService.js';
import { recentNoSheet, openDb, resolveDbPath } from '../data/db/matchStatsDb.js';
import { markRunning, markStep, recordPass, readRefreshStatus, clearStaleRunning } from '../data/repositories/refreshStatusRepository.js';
import { runAutoPreMatchAnalyses, runAutoPostMatchReviews, reserveCoupDEnvoi } from '../core/ai/autoMatchAiTrigger.js';
import { budgetRestant, enregistrerUsage } from '../data/repositories/autoAiAnalysisRepository.js';
import { produireLeBulletin, produireLeBilan, decisionDuBulletin, decisionDuBilan } from '../core/ai/bulletinService.js';
import { passeSauvegarde } from '../data/sauvegardes/etapeSauvegarde.js';
import { gelerLaNuit } from '../data/enregistreurs/gelPronostics.js';
import { calculerABlanc } from '../data/enregistreurs/moteurABlanc.js';
import { connaitreLeMarche, dernierCalcul, VERSION_CONNAISSANCE } from '../data/marketKnowledge.js';
import { TYPES as TYPES_ANOMALIES } from '../data/db/dataHealth.js';
import { calculerReperes } from '../data/db/leagueBenchmarks.js';
import { construireTableJourJ, etatTableJourJ } from '../data/db/dayTable.js';
import { figerLesMoisEcoules, moisAFiger, preparerLeMoisEnCours, preparationAFaire } from '../data/calibration.js';
import { calculerEtEcrireLeCarnet } from '../data/aiScorecard.js';
import { calculerEtEcrireLesDossiers } from '../data/aiDossiers.js';
import { deriveDuMoteur, valeurDeLAlerte, CLE_ALERTE_DERIVE } from '../data/deriveMoteur.js';
import { indiceDeForce, etatIndiceDeForce } from '../data/db/teamStrength.js';
import { forcesDeButs, etatForcesButs, empreintesDemandees } from '../data/db/forcesButs.js';
import { fichesDesJoueurs, etatDesFiches } from '../data/db/playerRatings.js';
import { stylesDeJeu, etatDesStyles } from '../data/db/teamStyle.js';
import { simulerLesSaisonsDeLaNuit, simulerLesMatchsDeLaNuit } from '../data/simulation/simulationNuit.js';
import { N as N_SIMULATION } from '../data/simulation/reglages.js';
import { lancementDe } from '../bench/trialsRegistry.js';
import { candidatePourLeBanc } from '../core/engine/engineVersions.js';
import { getEngineConfig } from '../core/engine/engineConfig.js';
import { executerControleQuotidien } from '../data/controleQuotidien.js';
import { rejeuxUtilesALaCarte, rejeuDeLaCarte, lireLaCarte, ecrireLaCarte } from '../data/bettingMap.js';
import { carteAFaire, calculerAPart as calculerLaCarteAPart } from '../data/bettingMapCalcul.js';
import { relancerLeBancDuMoisSiBesoin } from '../data/rejeuDuServeur.js';
import { moteurDuRejeu } from '../bench/runner.js';
import { lireReglagesDuMoteur } from '../core/engine/engineConfig.js';
import { FICHIER_VERSIONS } from '../core/engine/engineVersions.js';
import { readJsonFile } from '../utils/atomicJson.js';
import { env } from '../config/env.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, '../..');
const RUNTIME_DIR = path.join(SERVER_DIR, 'data/runtime');

const JOUR_MS = 86_400_000;
/** Fenêtres minimales (passe ordinaire) et plafond du rattrapage. */
const FENETRE_CALENDRIER = 7;
const FENETRE_RENCONTRES = 10;
const RATTRAPAGE_MAX = 60;
/** Feuilles « sans feuille » redemandées sur cette période. */
const FEUILLES_TARDIVES_JOURS = 14;
/** Contrôle de cohérence : rencontres de cette période. */
const CONTROLE_JOURS = 30;
const COTES_PASSEES_MS = 12 * 3_600_000;

let timer = null;
let prochainePasse = null;

const iso = (d) => d.toISOString().slice(0, 10);
const joursAvant = (n) => iso(new Date(Date.now() - n * JOUR_MS));
/** Jour civil à Paris : c'est lui qui décide « une fois par jour ». */
const jourParis = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(d);
const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${Math.abs(Number(n ?? 0)) > 1 ? plusieurs : un}`;

/**
 * Début de la fenêtre : la dernière réussite de l'étape moins un jour (pour
 * les matchs finis tard), sans descendre sous `minimum` jours ni remonter
 * au-delà de RATTRAPAGE_MAX.
 */
function debutFenetre(derniereReussite, minimum) {
  const plancher = joursAvant(minimum);
  if (!derniereReussite) return plancher;
  const depuis = iso(new Date(Date.parse(derniereReussite) - JOUR_MS));
  const plafond = joursAvant(RATTRAPAGE_MAX);
  if (depuis < plafond) return plafond;
  return depuis < plancher ? depuis : plancher;
}

const faitAujourdhui = (derniere) => Boolean(derniere) && jourParis(new Date(derniere)) === jourParis();
const depuisMoinsDe = (derniere, ms) => Boolean(derniere) && Date.now() - Date.parse(derniere) < ms;

/**
 * Reconstruction des annuaires dans un processus à part (8 à 52 s de travail
 * synchrone qui bloquaient le serveur). Le verrou est tenu par la passe :
 * aucun IMPORT n'écrit pendant ce temps ; les boucles du serveur (cotes
 * gratuites, compositions, pages) si — le script patiente
 * (src/data/db/verrouEcriture.js). Les caches de noms du serveur sont vidés
 * ensuite, pour qu'il relise les annuaires neufs.
 */
async function reconstruireAnnuaires() {
  const { stdout } = await execFileAsync(process.execPath, [path.join(SERVER_DIR, 'scripts/rebuild-registries.mjs')], {
    cwd: SERVER_DIR,
    timeout: 15 * 60_000,
    maxBuffer: 1024 * 1024
  });
  invalidateRegistryCaches();
  return jsonDe(stdout);
}

/** Dernière ligne JSON d'une sortie de script. */
function jsonDe(stdout) {
  const ligne = String(stdout ?? '').trim().split('\n').pop();
  return JSON.parse(ligne);
}

/**
 * Bilan commun aux deux étapes d'analyse IA automatique (avant/après-match).
 * Le plafond du jour est vérifié AVANT de lancer quoi que ce soit : le
 * déclencheur ne compte même pas ses candidats sans budget, et un bilan
 * « 0 rencontre à analyser » laisserait croire qu'il n'y avait rien à faire.
 */
async function passeIaAuto(ctx, { lancer, usage, candidats, faits }) {
  const jour = jourParis();
  const plafond = env.autoAiAnalysis.dailyLimit;
  const disponible = budgetRestant(jour, plafond);
  if (disponible === 0) {
    return { status: 'ok', summary: `Plafond quotidien (${plafond}) atteint : rien lancé à cette passe, reprise demain.`, details: { plafond } };
  }
  // Priorité aux analyses d'avant coup d'envoi du reste de la journée (cf.
  // jobs/kickoffAiAnalysis.js) : leur part du plafond est mise de côté, les
  // analyses d'avance et les revues après-match peuvent attendre, elles non.
  let reserve = 0;
  try {
    reserve = await reserveCoupDEnvoi();
  } catch {
    // Liste des matchs illisible à cet instant : rien de mis de côté.
  }
  const restant = Math.max(0, disponible - reserve);
  if (restant === 0) {
    return {
      status: 'ok',
      summary: `${nombre(disponible)} analyse(s) encore permise(s) aujourd'hui, toutes gardées pour les ${nombre(reserve)} match(s) du jour à analyser une heure avant leur coup d'envoi : rien lancé à cette passe.`,
      details: { plafond, disponible, reserve }
    };
  }

  const r = await lancer({ limit: restant });
  if (r.nonConfigure) {
    return { status: 'warn', summary: 'Claude Code non configuré (CLAUDE_CODE_OAUTH_TOKEN absent de server/.env) : rien analysé.', details: {} };
  }

  // Interrompue par des pannes en série : ce qui reste n'a pas été écarté par
  // le plafond, la passe suivante le reprendra. Les matchs laissés par le mode
  // économe du budget Claude (étape 4 : analyse d'avance réservée aux favoris)
  // ne sont pas « laissés pour demain » par le plafond : comptés à part.
  const ecartes = r.ecartes ?? 0;
  const skipped = r.interrompu ? 0 : Math.max(0, r.candidates - r.ok - r.failed - ecartes);
  // Étape 42 : des pannes d'affilée de Claude Code (quota, jeton, réseau) valent pour le reste de la passe — le bulletin et le
  // bilan, plus bas, n'enchaînent pas un appel de plus sur une panne que les analyses viennent de constater.
  if (r.interrompu) ctx.claudeEnPanne = true;
  if (r.ok || r.failed) enregistrerUsage(jour, usage(r.ok, skipped));
  ctx.ecrit ||= r.ok > 0;
  return {
    status: r.interrompu && !r.ok ? 'error' : r.failed ? 'warn' : 'ok',
    summary:
      `${pluriel(r.candidates, ...candidats)} : ${pluriel(r.ok, ...faits)}` +
      (r.failed ? `, ${pluriel(r.failed, 'échec', 'échecs')}` : '') +
      (r.interrompu ? " — arrêt après plusieurs pannes de Claude Code d'affilée (quota, jeton ou réseau), reprise à la passe suivante" : '') +
      (skipped ? `, ${nombre(skipped)} laissée(s) pour demain (plafond du jour)` : '') +
      (ecartes ? `, ${pluriel(ecartes, 'non favorite laissée', 'non favorites laissées')} sans analyse d'avance` : '') +
      (r.mode === 'econome' ? ` — ${String(r.raisonMode ?? 'mode économe du budget Claude').replace(/\.$/, '')}` : '') +
      '.',
    details: { candidates: r.candidates, ok: r.ok, failed: r.failed, skipped, ecartesEconome: ecartes, mode: r.mode ?? 'normal', raisonMode: r.raisonMode ?? null, interrompu: r.interrompu, samples: r.samples },
    changed: r.ok > 0
  };
}

const LIBELLES_ANOMALIES = Object.fromEntries(TYPES_ANOMALIES.map((t) => [t.cle, t.libelle.toLowerCase()]));
const secondes = (ms) => `${String(Math.round((ms ?? 0) / 100) / 10).replace('.', ',')} s`;

/**
 * L'étape « carnetSante » (étape 12 du plan, 06/10/2026) : scripts/data-health.mjs
 * dans un processus à part — l'agrégation sur deux millions de lignes joueur ne
 * doit pas bloquer le serveur —, base ouverte en LECTURE SEULE, sous le verrou
 * que tient cette passe (le script vérifie que c'est celui de son parent : il
 * ne tourne jamais pendant un import ni en parallèle). Le rapport de l'étape
 * « omissions » lui arrive par l'entrée standard. Une erreur NOUVELLE de cette
 * nuit (doublon, rencontre manquante, chiffre impossible…) met l'étape en
 * « à regarder » ; les anomalies déjà connues, non : le carnet les garde.
 *
 * Retouche du 07/10/2026 au soir : le contrôle rend la main à son propre
 * processus (utils/travailCooperatif.js) et dit le plus long moment passé sans
 * la rendre (`blocMaxMs` du bilan, noté dans le résumé comme aux autres étapes :
 * « le serveur jamais tenu plus de X ms d'affilée »). Comme le contrôle tourne
 * ici dans un processus à part, le serveur n'est tenu par rien de ses 77 s : ce
 * chiffre est celui du processus du contrôle, donc une borne de ce que le
 * serveur subirait si le contrôle tournait chez lui.
 */
async function passeCarnetSante(ctx, { script = path.join(SERVER_DIR, 'scripts/data-health.mjs') } = {}) {
  const args = [script, '--dans-la-passe', ...(ctx.omissions ? ['--omissions', '-'] : [])];
  const enCours = execFileAsync(process.execPath, args, { cwd: SERVER_DIR, timeout: 30 * 60_000, maxBuffer: 16 * 1024 * 1024 });
  enCours.child.stdin?.end(ctx.omissions ? JSON.stringify(ctx.omissions) : undefined);
  const { stdout } = await enCours;
  const r = jsonDe(stdout);
  if (r.refus || r.reporte) return { status: 'error', summary: `Rien fait : ${r.refus ?? r.reporte}`, details: r };
  const types = Object.entries(r.parType ?? {})
    .filter(([, n]) => n)
    .map(([k, n]) => `${LIBELLES_ANOMALIES[k] ?? k} : ${nombre(n)}`)
    .join(', ');
  return {
    status: r.nouvellesErreurs ? 'warn' : 'ok',
    summary:
      (r.mode === 'complet'
        ? `Contrôle complet de ${pluriel(r.rencontresAuMagasin, 'rencontre', 'rencontres')}${r.raison ? ` (${r.raison})` : ''}`
        : `${pluriel(r.rencontresControlees, 'rencontre nouvelle ou modifiée contrôlée', 'rencontres nouvelles ou modifiées contrôlées')}, ${pluriel(r.saisonsRecomptees, 'saison recomptée', 'saisons recomptées')}`) +
      ` en ${secondes(r.dureeMs)}${Number.isFinite(r.blocMaxMs) ? ` (le serveur jamais tenu plus de ${nombre(r.blocMaxMs)} ms d'affilée)` : ''} : ${pluriel(r.anomalies, 'anomalie', 'anomalies')} au carnet${types ? ` (${types})` : ''}` +
      (r.nouvellesAnomalies ? `, dont ${nombre(r.nouvellesAnomalies)} nouvelle(s)` : '') +
      (r.nouvellesErreurs ? ` — ${pluriel(r.nouvellesErreurs, 'erreur nouvelle', 'erreurs nouvelles')} à regarder dans Réglages › Carnet de santé` : '') +
      ". Rien n'est corrigé automatiquement.",
    details: r,
    // Aucune page ne se recharge pour lui : la carte du carnet se relit à la fin de la passe.
    changed: false
  };
}

/**
 * L'étape « historiqueFd » (étape 13 du plan, 06/10/2026) : l'historique
 * football-data.co.uk depuis 2000 (footballDataHistory.js). La première fois,
 * l'import complet (~605 fichiers) s'étale sur quatre à cinq passes, 150
 * requêtes au plus par passe ; ensuite, une fois par jour, les fichiers que
 * l'étape « cotes passées » vient de déposer dans le cache sont relus sans
 * requête, et chaque fichier de la saison en cours est redemandé au site au
 * plus une fois par semaine. Écrit dans la base : sous le verrou de la passe.
 */
async function passeHistoriqueFd(ctx, options = {}) {
  const r = await passeHistorique(options);
  const res = r.resume ?? {};
  const pct = res.periode ? `${String(Math.round((1000 * res.rattachees) / res.periode) / 10).replace('.', ',')} %` : 'aucun match';
  const points = [];
  if (r.echecs) points.push(`${pluriel(r.echecs, 'fichier en échec', 'fichiers en échec')}${r.erreurs?.length ? ` (${r.erreurs.slice(0, 3).join(' ; ')}${r.erreurs.length > 3 ? ' ; …' : ''})` : ''}, repris à la passe suivante`);
  if (r.arrete && !/budget|durée/.test(r.arrete)) points.push(r.arrete);
  const passes = Math.ceil((r.reste ?? 0) / (options.budget ?? REQUETES_PAR_PASSE));
  const tete = r.complet
    ? `${pluriel(r.telecharges, 'fichier téléchargé', 'fichiers téléchargés')} (${pluriel(r.requetes, 'requête', 'requêtes')}), ${pluriel(r.reprisDuCache, 'repris du relevé des cotes passées', 'repris du relevé des cotes passées')}, ${pluriel(r.importes, 'fichier importé', 'fichiers importés')}${r.inchanges ? `, ${nombre(r.inchanges)} inchangé(s)` : ''}`
    : `Import complet en cours : ${pluriel(r.telecharges, 'fichier téléchargé', 'fichiers téléchargés')} à cette passe (${pluriel(r.requetes, 'requête', 'requêtes')}), ${pluriel(r.importes, 'fichier importé', 'fichiers importés')} ; reste ${pluriel(r.reste, 'fichier', 'fichiers')}, environ ${pluriel(passes, 'passe', 'passes')}`;
  const { resume, ...details } = r;
  return {
    // En échec seulement quand l'import complet n'avance plus du tout ; une relecture
    // hebdomadaire manquée (l'historique reste celui de la semaine d'avant) est à regarder.
    status: r.echecs && !r.telecharges && !r.importes && !r.complet ? 'error' : points.length ? 'warn' : 'ok',
    summary: `${tete} ; historique : ${pluriel(res.matchs ?? 0, 'match', 'matchs')}, ${pct} des matchs depuis 2023 rattachés à FotMob avec le même score, ${pluriel(res.ecarts ?? 0, 'écart de score', 'écarts de score')}${points.length ? ` ; ${points.join(' ; ')}` : ''}.`,
    details: { ...details, resume: { matchs: res.matchs, saisons: res.saisons, periode: res.periode, rattachees: res.rattachees, ecarts: res.ecarts, taille: res.taille } },
    // Aucun écran de match ne lit l'historique : rien à recharger dans l'interface (la carte de Réglages se relit seule).
    changed: false
  };
}

/** Due : import complet pas fini (chaque passe), rattachement à refaire, sinon une fois par jour civil de Paris, ou au clic. */
const dueHistoriqueFd = (ctx) => ctx.manuel || !faitAujourdhui(ctx.derniere('historiqueFd')) || historiqueAFaire();

const decimal = (x, chiffres) => (x === null || x === undefined || !Number.isFinite(x) ? '?' : x.toLocaleString('fr-FR', { minimumFractionDigits: chiffres, maximumFractionDigits: chiffres }));

/**
 * L'étape « reperes » (étape 15 du plan, 07/10/2026) : les repères de chaque
 * championnat (data/db/leagueBenchmarks.js) — saison par saison, une source
 * chacune (FotMob quand la saison est entière au magasin, sinon
 * football-data), seulement les saisons qui ont changé ; puis la moyenne de
 * toutes les saisons, la moyenne des championnats et la valeur retenue des
 * petits championnats ; puis la dispersion et le facteur de terrain des
 * corners, tirs et tirs cadrés, mesurés hors échantillon. Dans le serveur, en
 * rendant la main entre deux saisons (et toutes les ~25 ms des boucles
 * longues) ; écrit la table league_benchmarks sous le verrou de la passe.
 * MESURER SEULEMENT : rien n'entre dans le moteur (étape 33, après le banc
 * d'essai).
 */
async function passeReperes(ctx, options = {}) {
  const r = await calculerReperes(options);
  const recalculees = r.recalculees.fotmob + r.recalculees.footballData;
  const c = r.dispersion?.corners;
  const tirs = r.dispersion?.tirs;
  return {
    status: r.championnats ? 'ok' : 'warn',
    summary: r.championnats
      ? `${pluriel(r.championnats, 'championnat', 'championnats')}, ${pluriel(r.saisons.fotmob + r.saisons.footballData, 'saison', 'saisons')} (${nombre(r.saisons.fotmob)} FotMob, ${nombre(r.saisons.footballData)} football-data) : ` +
        `${pluriel(recalculees, 'recalculée', 'recalculées')}, ${pluriel(r.inchangees, 'inchangée', 'inchangées')}, en ${secondes(r.dureeMs)} (le serveur jamais tenu plus de ${nombre(r.blocMaxMs)} ms d'affilée)` +
        (c ? ` ; dispersion mesurée sur ${pluriel(c.matchs, 'match', 'matchs')} : corners 1/k ${decimal(c.equipe, 3)} (moteur ${decimal(c.moteur.equipe, 3)}), facteur de terrain ${decimal(c.dom, 3)} / ${decimal(c.ext, 3)} (moteur ${decimal(c.moteur.dom, 2)} / ${decimal(c.moteur.ext, 2)})` : '') +
        (tirs ? `, tirs 1/k ${decimal(tirs.equipe, 3)} (moteur ${decimal(tirs.moteur.equipe, 3)})` : '') +
        '. Mesuré seulement : rien n’entre dans le moteur.'
      : 'Aucun championnat au magasin : aucun repère calculé.',
    details: r,
    // Aucun écran de match ne lit les repères : rien à recharger (le bloc de Statistiques ligue se relit à l'ouverture).
    changed: false
  };
}

/** Due : une fois par jour civil de Paris (la première passe après minuit), ou au clic (il ne refait alors que ce qui a changé). */
const dueReperes = (ctx) => ctx.manuel || !faitAujourdhui(ctx.derniere('reperes'));

/** Une durée lisible : « 14 ms », « 7,0 s », « 2 min 08 s ». */
const duree = (ms) => {
  if ((ms ?? 0) < 1000) return `${nombre(Math.round(ms ?? 0))} ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? secondes(ms) : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
};

/** Un écart du contrôle anti-fuite en quelques mots : la colonne et la ligne. */
const ecartEnClair = (e) => `${e.colonne ?? 'ligne'} de ${e.matchKey ?? (e.joueur !== undefined ? `joueur ${e.joueur} le ${e.date}` : e.league ? `${e.league} le ${e.date}` : '?')}`;

/**
 * L'étape « tableJourJ » (étape 17 du plan, 12/10/2026) : la TABLE DU JOUR J
 * (data/db/dayTable.js) — pour chaque match passé, ce que l'appli savait la
 * veille de chaque équipe et de chaque joueur (jamais le match lui-même ni
 * ceux d'après), que les étapes 18, 19, 27, 29 et 30 liront au lieu de
 * refaire chacune ses lectures « avant J ». La première fois, la construction
 * complète (~1 min 30 s sur la base de Pierre) ; ensuite, une fois par jour,
 * seulement les rencontres nouvelles, modifiées ou retirées et les fusions
 * d'identité, puis un contrôle anti-fuite (des lignes tirées au hasard,
 * recalculées depuis les tables sources par les lecteurs du moteur). Dans le
 * serveur, en rendant la main toutes les ~25 ms ; écrit sous le verrou de la
 * passe. MESURÉE SEULEMENT : le moteur ne lit pas encore cette table.
 *
 * En échec (`erreur` du bilan), les repères et l'état n'ont pas avancé (ils
 * ne bougent qu'à la fin) : l'étape est « en échec », la passe suivante reprend
 * tout en comparant, et l'alerte durable reste celle de la passe d'avant. Un
 * contrôle anti-fuite « pas fait » (processus à part en échec ou sans réponse
 * dans le délai) : l'étape est « à regarder », la raison dite, l'alerte pas
 * touchée ; il n'est jamais refait dans le serveur. Une rencontre refusée est
 * dite à chaque passe, même « rien à faire ».
 */
async function passeTableJourJ(ctx, options = {}) {
  const r = await construireTableJourJ(options);
  const l = r.lignes ?? {};
  const c = r.comptes ?? {};
  const ecarts = r.controle?.ecarts ?? [];
  const refusees = r.rencontres?.refusees ?? [];
  const tenu = `en ${duree(r.dureeMs)} (le serveur jamais tenu plus de ${nombre(Math.round(r.blocMaxMs ?? 0))} ms d'affilée)`;
  const pasFait = r.controle?.pasFait ?? null;
  const controle = pasFait
    ? `contrôle anti-fuite PAS FAIT (${String(pasFait).replace(/\.$/, '')}) — refait à la prochaine passe, jamais dans le serveur`
    : r.controle
      ? `contrôle anti-fuite : ${pluriel(r.controle.lignes, 'ligne recalculée', 'lignes recalculées')} depuis les tables sources, ${pluriel(ecarts.length, 'écart', 'écarts')}` +
        (ecarts.length ? ` (${ecarts.slice(0, 3).map(ecartEnClair).join(' ; ')}${ecarts.length > 3 ? ' ; …' : ''}) — à regarder` : '')
      : 'contrôle anti-fuite non fait';
  const refus = refusees.length ? ` ; ${pluriel(refusees.length, 'rencontre refusée', 'rencontres refusées')} (identifiant de club mal formé : ${refusees.slice(0, 3).map((x) => x?.matchKey ?? String(x)).join(', ')}${refusees.length > 3 ? ', …' : ''})` : '';
  const mesure = ' Mesuré seulement : le moteur ne lit pas encore cette table.';
  let summary;
  if (r.erreur) {
    summary = `Interrompue (${r.mode ?? 'avant de commencer'}) : ${String(r.erreur).slice(0, 200)} — les repères et l'état n'ont pas avancé (des lignes relues ont pu être écrites) ; la passe suivante reprend tout en comparant.`;
  } else if (r.mode === 'rien') {
    summary = `Rien à faire : aucune rencontre nouvelle, modifiée ni retirée, aucune fusion depuis la dernière passe (${pluriel(c.rencontres, 'rencontre', 'rencontres')} dans la table) ; ${tenu}${refus}.${mesure}`;
  } else if (r.mode === 'construction') {
    summary =
      `Première construction : ${pluriel(c.rencontres, 'rencontre', 'rencontres')}, ${pluriel(c.lignesEquipe, 'ligne équipe', 'lignes équipe')}, ${pluriel(c.lignesJoueur, 'ligne joueur', 'lignes joueur')}, ` +
      `${pluriel(c.lignesLigue, 'journée de championnat', 'journées de championnat')}, ${tenu} ; ${controle}${refus}.${mesure}`;
  } else if (r.mode === 'tout' || r.mode === 'reprise') {
    const changees = Object.values(r.changements ?? {}).reduce((n, x) => n + (x ?? 0), 0);
    summary =
      `${r.mode === 'reprise' ? 'Reprise complète (la passe précédente ne s’était pas terminée)' : 'Tout refait'} : ${pluriel(c.rencontres, 'rencontre', 'rencontres')}, ` +
      `${pluriel(changees, 'ligne changée', 'lignes changées')}, ${tenu} ; ${controle}${refus}.${mesure}`;
  } else {
    const n = r.rencontres ?? {};
    summary =
      `${pluriel((n.nouvelles ?? 0) + (n.modifiees ?? 0), 'rencontre nouvelle ou modifiée', 'rencontres nouvelles ou modifiées')}, ${pluriel(n.disparues ?? 0, 'retirée', 'retirées')}` +
      (r.fusions ? `, ${pluriel(r.fusions, 'identifiant de joueur fusionné relu', 'identifiants de joueur fusionnés relus')}` : '') +
      ` ; ${pluriel(l.equipeEcrites, 'ligne équipe', 'lignes équipe')} et ${pluriel(l.joueurEcrites, 'ligne joueur', 'lignes joueur')} réécrites, ` +
      `${pluriel((l.avantEquipe ?? 0) + (l.avantJoueur ?? 0), 'ligne « avant » mise à jour', 'lignes « avant » mises à jour')} ` +
      `(toutes les équipes recalculées, ${pluriel(r.clubsRecalcules, 'club', 'clubs')} ; ${pluriel(r.joueursRecalcules, 'joueur', 'joueurs')}) ; ` +
      `${controle} ; ${tenu}${refus}.${mesure}`;
  }
  return {
    status: r.erreur ? 'error' : ecarts.length || refusees.length || pasFait ? 'warn' : 'ok',
    summary,
    details: r,
    // Les écarts du contrôle restent visibles jusqu'à la nuit qui n'en trouve plus ; une passe en échec, ou un contrôle
    // pas fait, ne touche pas l'alerte.
    ...(r.erreur || pasFait ? {} : { alert: { key: 'tableJourJ', value: ecarts.length ? { ecarts: ecarts.slice(0, 20), total: ecarts.length, lignes: r.controle.lignes, updatedAt: r.controle.le } : null } }),
    // Aucun écran de match ne lit la table : rien à recharger (la carte de Réglages se relit à la fin de la passe).
    changed: false
  };
}

/**
 * Due : au clic, une fois par jour civil de Paris, ou quand la table n'est pas
 * à jour (absente, d'une autre version, ou passe précédente interrompue).
 * LIT seulement : `etatTableJourJ` n'écrit jamais, pas même l'état.
 */
const dueTableJourJ = (ctx, { database } = {}) => {
  if (ctx.manuel || !faitAujourdhui(ctx.derniere('tableJourJ'))) return true;
  try {
    return etatTableJourJ(database ? { database } : {}).aJour === false;
  } catch {
    // Base illisible à cet instant : l'étape tourne et dira pourquoi.
    return true;
  }
};

const COULEURS_DU_FEU = { vert: 'vert', orange: 'orange', rouge: 'rouge' };

/**
 * L'étape « controleQuotidien » (étape 14 du plan, 07/10/2026) : à CHAQUE
 * passe, en dernier — quand tout ce qui écrit a écrit —, une trentaine de
 * contrôles rapides sur les 30 derniers jours (data/db/dailyChecks.js) et la
 * santé des sources (data/sourceHealth.js), dans le serveur, en rendant la
 * main entre deux ; l'état va dans data/runtime/controle-quotidien.json, le
 * suivi des réponses FotMob dans data/runtime/sante-fotmob.json. LECTURE
 * SEULE : rien n'est écrit dans la base, rien n'est corrigé. Comme le carnet
 * de santé, l'étape n'est « à regarder » que pour du NOUVEAU (un feu rouge :
 * une contradiction trouvée depuis moins de 24 h) ; l'orange (connu, à
 * regarder) se lit dans la carte « Contrôle quotidien » et la puce du haut.
 */
async function passeControleQuotidien(ctx, options = {}) {
  const { etat, suivi } = await executerControleQuotidien({ omissions: ctx.omissions ?? null, ...options });
  const parCouleur = (couleur) => etat.controles.filter((c) => c.statutLe === couleur || (couleur === 'orange' && c.statutLe === 'erreur'));
  const rouges = parCouleur('rouge');
  const oranges = parCouleur('orange');
  const noms = (liste) => liste.map((c) => c.libelle.toLowerCase()).join(', ');
  return {
    status: etat.feu === 'rouge' ? 'warn' : 'ok',
    summary:
      `Feu ${COULEURS_DU_FEU[etat.feu] ?? etat.feu} : ${pluriel(etat.controles.length, 'contrôle', 'contrôles')} en ${secondes(etat.dureeMs)} sur ${pluriel(etat.fenetre.rencontres, 'rencontre', 'rencontres')} des ${etat.fenetre.jours} derniers jours (le serveur jamais tenu plus de ${nombre(etat.blocMaxMs)} ms d'affilée)` +
      (rouges.length ? ` — rouge : ${noms(rouges)}` : '') +
      (oranges.length ? ` — orange : ${noms(oranges)}` : '') +
      ". Rien n'est corrigé automatiquement ; le détail est dans Réglages › Contrôle quotidien.",
    details: {
      feu: etat.feu,
      compte: etat.compte,
      dureeMs: etat.dureeMs,
      blocMaxMs: etat.blocMaxMs,
      blocMaxOu: etat.blocMaxOu,
      pauses: etat.pauses,
      temps: etat.temps,
      fenetre: etat.fenetre,
      enEchec: [...rouges, ...oranges].map((c) => ({ cle: c.cle, statut: c.statutLe, total: c.total ?? 0 })),
      suiviFotmob: suivi
    },
    // Aucune page ne se recharge pour lui : la carte et la puce du haut le relisent d'elles-mêmes.
    changed: false
  };
}

/**
 * L'étape « moteurABlanc » (étape 25 du plan, le socle, 07/10/2026) : la
 * VERSION CANDIDATE du moteur, calculée à blanc sur les matchs à venir, à côté
 * de la version en service, seulement pour les marchés qu'elle change
 * (data/enregistreurs/moteurABlanc.js). Sans candidate en essai — le cas
 * jusqu'à l'étape 27 —, rien : ni calcul, ni base ouverte, ni fichier écrit.
 * Ses chiffres vont dans une table à part (engine_candidate_picks), écrite
 * sous le verrou de la passe ; jamais montrés comme pronostic, jamais pariés,
 * jamais envoyés à l'IA.
 */
/** Un verdict du juge en mots simples. */
const verdictDit = (v) => ({ retenu: 'retenu', 'pas-prouve': 'pas prouvé', 'moins-bon': 'moins bon', 'pas-assez-de-matchs': 'pas assez de matchs' })[v] ?? String(v);

/**
 * L'étape « moteurABlanc » : une fois par jour de Paris, avec l'interrupteur des enregistreurs — et, depuis l'étape 27,
 * refaite à la passe suivante quand la dernière était « en attente » (les forces de buts de la candidate pas à jour).
 */
const dueMoteurABlanc = (ctx) => Boolean(env.enregistreurs?.enabled) && (!faitAujourdhui(ctx.derniere('moteurABlanc')) || Boolean(ctx.derniersDetails?.('moteurABlanc')?.attente));

async function passeMoteurABlanc(ctx, options = {}) {
  const r = await calculerABlanc({ dansLaPasse: true, ...options });
  if (!r.candidate) {
    return {
      status: r.erreur ? 'warn' : 'ok',
      summary: r.erreur ? `Rien calculé à blanc : ${r.erreur}.` : 'Aucune version candidate du moteur en essai : rien calculé à blanc.',
      details: { candidate: null, erreur: r.erreur ?? null },
      changed: false
    };
  }
  // Étape 25, seconde moitié : jugée à l'horizon, la candidate attend la décision de Pierre ; plus rien de calculé.
  if (r.essai?.jugee) {
    return {
      status: 'ok',
      summary: `Candidate « ${r.candidate.id} » (étape ${r.candidate.etape}) jugée sur ${pluriel(r.essai.matchs ?? 0, 'match joué', 'matchs joués')} : « ${verdictDit(r.essai.verdict)} » — sa décision attend dans Réglages › Versions du moteur ; plus rien calculé à blanc.`,
      details: r,
      changed: false
    };
  }
  // Étape 27 : ses forces de buts pas à jour — rien calculé ; l'étape est refaite à la passe suivante (`due`).
  if (r.attente) {
    return {
      status: 'warn',
      summary: `Candidate « ${r.candidate.id} » (étape ${r.candidate.etape}) en attente : ${r.attente} — rien calculé à blanc cette fois, la passe suivante refera le calcul.`,
      details: r,
      changed: false
    };
  }
  const hors = Object.entries(r.horsDeclaration).filter(([, n]) => n);
  const points = [];
  if (hors.length) points.push(`elle change aussi des marchés qu’elle n’a pas déclarés (${hors.map(([m, n]) => `${m} : ${nombre(n)}`).join(', ')}) — à regarder, rien de gardé pour eux`);
  if (r.echecs) points.push(`${pluriel(r.echecs, 'match en échec', 'matchs en échec')} (${r.echantillons.join(' ; ')})`);
  if (r.reporte) points.push('écriture reportée : une autre tâche tient les données');
  if (r.erreur) points.push(r.erreur);
  if (r.essai && !r.essai.calcule && r.essai.erreur) points.push(`essai pas jugé cette nuit : ${r.essai.erreur}`);
  // Étape 25, seconde moitié : où en est l'essai (matchs joués comparés, l'horizon), ou le verdict pris cette nuit.
  let essai = '';
  if (r.essai?.principal) essai = ` ; essai jugé cette nuit sur ${pluriel(r.essai.matchs, 'match joué', 'matchs joués')} : « ${verdictDit(r.essai.verdict)} » (Réglages › Versions du moteur)`;
  else if (r.essai?.calcule) {
    essai = ` ; essai : ${pluriel(r.essai.matchs, 'match joué comparé', 'matchs joués comparés')} sur ${nombre(r.essai.horizon.matchs)}, ${pluriel(r.essai.joursEcoules, 'jour', 'jours')} sur ${nombre(r.essai.horizon.jours)} (verdict à l’horizon)`;
  }
  return {
    status: r.erreur && !r.ecrites ? 'error' : points.length ? 'warn' : 'ok',
    summary:
      `Candidate « ${r.candidate.id} » (étape ${r.candidate.etape}) sur ${pluriel(r.matchs, 'match à venir', 'matchs à venir')} : ` +
      `${pluriel(r.lignes, 'chiffre à blanc', 'chiffres à blanc')} (${r.candidate.marches.join(', ')}), ${pluriel(r.ecrites, 'valeur nouvelle gardée à part', 'valeurs nouvelles gardées à part')} ` +
      `en ${secondes(r.dureeMs)} (le serveur jamais tenu plus de ${nombre(r.blocMaxMs)} ms d'affilée)${essai} — jamais montrés comme pronostic, jamais pariés, jamais envoyés à l'IA` +
      (points.length ? ` ; ${points.join(' ; ')}.` : '.'),
    details: r,
    // Aucun écran ne lit ces chiffres : rien à recharger dans l'interface.
    changed: false
  };
}

const NOMS_DES_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « 2026-10 » → « octobre 2026 ». */
const moisDit = (mois) => `${NOMS_DES_MOIS[Number(mois.slice(5, 7)) - 1] ?? mois} ${mois.slice(0, 4)}`;
const pourcent1 = (x) => (Number.isFinite(x) ? `${(x * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %` : '?');
const signe1 = (x) => (Number.isFinite(x) ? `${x > 0 ? '+' : x < 0 ? '−' : '+'}${Math.abs(x).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : '?');
const VERDICTS_DE_CALIBRATION = { 'trop-haut': 'annoncé trop haut, au-delà du hasard', 'trop-bas': 'annoncé trop bas, au-delà du hasard', 'dans-le-hasard': 'écart dans le hasard', 'trop-peu': 'trop peu de matchs pour juger' };

/**
 * La seconde moitié de l'étape « calibrationMensuelle » (étape 24, 14/10/2026) : PRÉPARER le bilan du MOIS EN
 * COURS, écrit d'un bloc dans data/runtime/calibration-en-cours.json (data/calibration.js) — une fois par jour
 * de Paris, ou au clic « Actualiser ». Ne lève jamais : une préparation en échec ne fait pas échouer le gel d'un
 * mois, elle passe l'étape à « warn » et la passe suivante reprend.
 */
async function preparerLeMoisEnCoursDeLaNuit(ctx, options = {}) {
  try {
    const { afaire } = preparationAFaire({ fichier: options.fichierDuMois, maintenant: options.maintenant });
    if (!ctx?.manuel && !afaire) return { echec: false, phrase: '', details: { fait: false, raison: 'déjà préparé aujourd’hui' } };
    const p = await preparerLeMoisEnCours({ database: options.database, maintenant: options.maintenant, bets: options.bets, juge: options.juge, fichier: options.fichierDuMois });
    const phrase =
      ` Mois en cours préparé : ${moisDit(p.mois)}, ${pluriel(p.reglees, 'pronostic réglé', 'pronostics réglés')} sur ${pluriel(p.geles, 'pronostic gelé', 'pronostics gelés')} (première valeur), ` +
      `en ${duree(p.dureeMs)} (le serveur jamais tenu plus de ${nombre(Math.round(p.blocMaxMs ?? 0))} ms d'affilée) — Calibration du mois et Santé du moteur le lisent sans rien calculer.`;
    return { echec: false, phrase, details: { fait: true, mois: p.mois, dureeMs: p.dureeMs, blocMaxMs: p.blocMaxMs, geles: p.geles, reglees: p.reglees, matchs: p.matchs } };
  } catch (error) {
    const message = String(error?.message ?? error).slice(0, 300);
    return { echec: true, phrase: ` Mois en cours non préparé — ${message} : repris à la passe suivante.`, details: { fait: false, erreur: message } };
  }
}

/**
 * L'étape « calibrationMensuelle » (étape 20 du plan, 13/10/2026) : le BILAN DU MOIS ÉCOULÉ — ce que le
 * moteur avait annoncé (pronostics gelés, engine_picks) face à ce qui s'est passé, par tranche, par marché
 * et par championnat, et la valeur de clôture des pronostics et des paris — figé UNE fois dans la base
 * (calibration_monthly), jamais réécrit (data/calibration.js). Un clic ne refige rien. Dans le serveur, en
 * rendant la main toutes les ~25 ms, sous le verrou de la passe. Une passe interrompue ne fige rien à moitié
 * (une seule écriture par mois) ; la suivante reprend.
 *
 * Étape 24 (14/10/2026) : la même étape PRÉPARE ensuite le bilan du mois en cours (preparerLeMoisEnCoursDeLaNuit) :
 * la route de la calibration et le tableau de bord du moteur le LISENT, ils ne le calculent plus (le calcul à la
 * demande prenait 1,7 s à chaud, 6 s à froid chez Pierre, dans la requête). Due quand un mois écoulé n'est pas
 * encore figé (le 1er du mois suivant à partir de 6 h, heure de Paris), quand le mois en cours n'a pas été
 * préparé aujourd'hui, ou au clic.
 */
async function passeCalibrationMensuelle(ctx, options = {}) {
  const r = await figerLesMoisEcoules(options);
  const tenu = `en ${duree(r.dureeMs)} (le serveur jamais tenu plus de ${nombre(Math.round(r.blocMaxMs ?? 0))} ms d'affilée)`;
  const phrases = r.figes.map(({ mois, ecrit, resume: s }) => {
    if (!ecrit) return `${moisDit(mois)} : déjà figé le ${s.figeLe ? new Date(s.figeLe).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '?'}, rien réécrit`;
    const juge = VERDICTS_DE_CALIBRATION[s.verdict] ?? s.verdict ?? 'pas jugé';
    const cp = s.cloturePronostics?.mesures ? `${signe1(s.cloturePronostics.moyenne)} % sur ${pluriel(s.cloturePronostics.mesures, 'pronostic', 'pronostics')}` : 'aucun pronostic mesuré';
    const cb = s.clotureParis?.mesures ? `${signe1(s.clotureParis.moyenne)} % sur ${pluriel(s.clotureParis.mesures, 'pari', 'paris')}` : 'aucun pari mesuré';
    return (
      `${moisDit(mois)} figé : ${pluriel(s.pronostics, 'pronostic réglé', 'pronostics réglés')} sur ${pluriel(s.geles, 'pronostic gelé', 'pronostics gelés')} (première valeur, ${pluriel(s.matchs, 'match', 'matchs')})` +
      (s.pronostics ? `, annoncé ${pourcent1(s.annonce)}, réalisé ${pourcent1(s.realise)} (écart ${signe1((s.ecart ?? NaN) * 100)} points, ${juge})` : '') +
      ` ; valeur de clôture des pronostics ${cp}, de vos paris ${cb}`
    );
  });
  // Étape 24 : le mois en cours, préparé APRÈS le gel (un mois à figer passe d'abord).
  const prepare = await preparerLeMoisEnCoursDeLaNuit(ctx, options);
  if (r.erreur && !r.figes.length) {
    return { status: 'error', summary: `Aucun mois figé : ${r.erreur} — la passe suivante réessaie.${prepare.echec ? prepare.phrase : ''}`, details: { ...r, preparation: prepare.details }, changed: false };
  }
  if (!r.figes.length) {
    return { status: prepare.echec ? 'warn' : 'ok', summary: `Rien à figer : aucun mois écoulé n’attend son bilan.${prepare.phrase}`, details: { ...r, preparation: prepare.details }, changed: false };
  }
  // Étape 25, seconde moitié : l'ALERTE DE DÉRIVE, jugée sur le dernier mois figé (data/deriveMoteur.js) —
  // seulement quand un mois vient d'être figé ; posée ou levée ici, elle reste jusqu'au mois figé suivant.
  let alerte;
  let derive = '';
  if (r.figes.some((f) => f.ecrit)) {
    const d = deriveDuMoteur({ database: options.database, alerte: null });
    if (!d.probleme) {
      alerte = { key: CLE_ALERTE_DERIVE, value: valeurDeLAlerte(d.dernierMois) };
      if (d.dernierMois?.derive) {
        const quoi = d.dernierMois.signaux.map((x) => (x.type === 'cloture' ? 'valeur de clôture des pronostics négative' : x.libelle)).join(', ');
        derive = ` Dérive du moteur en ${moisDit(d.dernierMois.mois)} (${quoi}) : voir Réglages › Versions du moteur.`;
      }
    }
  }
  return {
    status: r.erreur || derive || prepare.echec ? 'warn' : 'ok',
    summary: `${phrases.join(' ; ')} ; ${tenu}` + (r.erreur ? ` ; puis en échec — ${r.erreur} : repris à la passe suivante.` : '.') + ' Le détail est dans Historique moteur › Calibration du mois.' + derive + (prepare.echec ? prepare.phrase : ''),
    details: { ...(alerte ? { ...r, derive: alerte.value } : r), preparation: prepare.details },
    // L'écran relit la route quand on l'ouvre : rien à recharger.
    changed: false,
    ...(alerte ? { alert: alerte } : {})
  };
}

/**
 * Due : un mois écoulé pas encore figé, ou (étape 24) le mois en cours pas encore préparé aujourd'hui, ou un clic
 * « Actualiser ». LIT seulement ; une base illisible fait tourner l'étape, qui dira pourquoi.
 */
const dueCalibrationMensuelle = (options = {}, ctx = null) => {
  try {
    if (moisAFiger(options).length > 0) return true;
    return Boolean(ctx?.manuel) || preparationAFaire({ fichier: options.fichierDuMois, maintenant: options.maintenant }).afaire;
  } catch {
    return true;
  }
};

const pourcent0 = (n, d) => (d ? `${Math.round((100 * n) / d)} %` : '—');

/**
 * L'étape « carnetIA » (étape 21 du plan, 14/10/2026) : LE CARNET DE NOTES DE L'IA — chaque avis d'avant-match
 * relu, réglé au magasin par les identifiants FotMob des clubs (règles du banc d'essai), mesuré à la clôture
 * pour les trois marchés à cotes gratuites, puis la fiabilité par marché, championnat, confiance, et les
 * marchés où l'IA ne fait pas mieux que le moteur seul (au moins 200 matchs jugés) retirés de sa liste dès
 * l'analyse suivante (data/aiScorecard.js). Recalculé en entier, dans le serveur, en rendant la main ; écrit
 * d'un bloc (data/runtime/carnet-ia.json, atomicJson). Aucun appel à Claude ; la base n'est que lue.
 */
async function passeCarnetIA(ctx, options = {}) {
  const r = await calculerEtEcrireLeCarnet(options);
  // Étape 44 : les cas réglés de cette nuit, repris par l'étape « dossiersIA » qui suit (rien à relire).
  if (ctx && Array.isArray(r.cas)) ctx.casDuCarnet = r.cas;
  const c = r.carnet;
  const t = c.total;
  const tenu = `en ${duree(r.dureeMs)} (le serveur jamais tenu plus de ${nombre(Math.round(r.blocMaxMs ?? 0))} ms d'affilée)`;
  const libelle = (type) => c.types.find((x) => x.marketType === type)?.label ?? type;
  // Retouche du 14/10 : la coupure désactivée (COUPURE_ACTIVE de aiScorecard.js), la nuit dit ce que la règle ferait.
  const enAttente = c.coupureActive
    ? ''
    : ` : la coupure est désactivée tant que Pierre n'a pas décidé de la règle${c.seraientRetires?.length ? ` (la règle retirerait : ${c.seraientRetires.map(libelle).join(', ')})` : ''}`;
  const coupes = c.coupes.length ? `${pluriel(c.coupes.length, 'marché retiré', 'marchés retirés')} de sa liste (${c.coupes.map(libelle).join(', ')})` : `aucun marché retiré de sa liste${enAttente}`;
  const nouvelles = r.nouvellesCoupes.length ? ` — nouveau cette nuit : ${r.nouvellesCoupes.map(libelle).join(', ')}, retiré${r.nouvellesCoupes.length > 1 ? 's' : ''} dès la prochaine analyse` : '';
  return {
    status: r.nouvellesCoupes.length ? 'warn' : 'ok',
    summary:
      `${pluriel(c.analyses.reglees, 'match analysé et joué', 'matchs analysés et joués')} : ${pluriel(t.bilan.aiVerdicts, 'avis compté', 'avis comptés')}, ${nombre(t.bilan.aiRight)} tenus (${pourcent0(t.bilan.aiRight, t.bilan.aiVerdicts)}), ` +
      `${pluriel(t.avis.nuance, 'avis nuancé', 'avis nuancés')} jamais comptés ; ${coupes}${nouvelles} ; ${tenu}. Aucun appel à Claude. Le détail est dans Historique moteur › Carnet de l'IA.`,
    details: { coupureActive: c.coupureActive, seraientRetires: c.seraientRetires, coupes: c.coupes, nouvellesCoupes: r.nouvellesCoupes, coupesAvant: r.coupesAvant, analyses: c.analyses, dureeMs: r.dureeMs, blocMaxMs: r.blocMaxMs },
    // L'écran relit la route quand on l'ouvre : rien à recharger.
    changed: false
  };
}

/**
 * L'étape « dossiersIA » (étape 44 du plan, 23/10/2026) : LA MÉMOIRE DE L'IA — un dossier par équipe et par championnat,
 * écrit par le code (faits du moment, forme, absents, entraîneur, style, et les seules leçons que le carnet confirme sur
 * plusieurs matchs ; une leçon démentie est retirée pour de bon), refait SEULEMENT pour les équipes qui ont joué et les
 * championnats qui ont eu un match (data/aiDossiers.js). Juste APRÈS le carnet (ses cas de la nuit sont repris, rien
 * n'est relu) ; dans le serveur, en rendant la main ; écrit d'un bloc (data/runtime/ai-dossiers.json, atomicJson). Aucun
 * appel à Claude ; la base n'est que LUE ; le moteur ne lit jamais les dossiers.
 */
async function passeDossiersIA(ctx, options = {}) {
  const r = await calculerEtEcrireLesDossiers({ cas: ctx?.casDuCarnet ?? null, force: Boolean(options.force), ...options });
  const b = r.bilan;
  const tenu = `en ${duree(r.dureeMs)} (le serveur jamais tenu plus de ${nombre(Math.round(r.blocMaxMs ?? 0))} ms d'affilée)`;
  const quoi =
    b.mode === 'rien'
      ? `Rien à refaire : aucune équipe n'a joué depuis la nuit d'avant (${pluriel(b.clubs.gardes, 'dossier gardé', 'dossiers gardés')})`
      : b.mode === 'nuit'
        ? `Dossiers : ${pluriel(b.clubs.refaits, 'équipe qui a joué', 'équipes qui ont joué')} et ${pluriel(b.championnats.refaits, 'championnat', 'championnats')} mis à jour, ${pluriel(b.clubs.gardes, 'dossier gardé', 'dossiers gardés')} tel quel`
        : `${b.mode === 'premier' ? 'Premier calcul' : 'Tout refait'} : ${pluriel(b.clubs.refaits, 'équipe', 'équipes')} (jouées dans l'année) et ${pluriel(b.championnats.refaits, 'championnat', 'championnats')}`;
  const lecons =
    `leçons : ${pluriel(b.lecons.rattachees, 'leçon rattachée', 'leçons rattachées')} à leur match (sur ${nombre(b.lecons.ecrites)} écrites), ` +
    `${pluriel(b.lecons.confirmees, 'confirmée', 'confirmées')} par le carnet (${nombre(b.lecons.nouvellesConfirmees)} cette nuit), ${pluriel(b.lecons.retirees, 'retirée', 'retirées')} (${nombre(b.lecons.nouvellesRetirees)} cette nuit)`;
  return {
    status: 'ok',
    summary: `${quoi} ; ${lecons} ; fichier de ${nombre(Math.round(r.octets / 1024))} Ko ${tenu}. Aucun appel à Claude ; le moteur ne lit pas les dossiers.`,
    details: { mode: b.mode, casDuCarnet: Array.isArray(ctx?.casDuCarnet), clubs: b.clubs, championnats: b.championnats, lecons: b.lecons, sourcesDesMatchs: b.sourcesDesMatchs, octets: r.octets, dureeMs: r.dureeMs, blocMaxMs: r.blocMaxMs },
    // La page de l'équipe relit la route quand on l'ouvre : rien à recharger.
    changed: false
  };
}

/**
 * Les étapes « bulletin » et « bilanSemaine » (étape 42 du plan, 22/10/2026) : le BULLETIN DU JOUR (un appel à Claude Code par
 * jour, le matin) et le BILAN DE LA SEMAINE (un par semaine, le lundi) — des textes écrits par l'IA sur une fiche chiffrée que
 * le code prépare sans token ; tout nombre du texte doit être dans la fiche (sinon il est refusé) ; rangés dans
 * data/runtime/ai-bulletins.json. Ils comptent dans le budget Claude de l'étape 4 (journal, plafond de 150, mode économe, pannes)
 * et ne sont JAMAIS forcés : ni par un clic « Actualiser maintenant », ni contre l'interrupteur AUTO_AI_ANALYSIS. Due : le texte
 * n'est pas encore écrit, l'heure est venue (pas avant 6 h à Paris), moins de trois essais ratés. LIT seulement (le fichier des
 * textes) ; tout le travail est dans core/ai/bulletinService.js.
 */
async function passeBulletin(ctx, options = {}) {
  const r = await produireLeBulletin({ maintenant: options.maintenant ?? Date.now(), ctx, options });
  return { status: r.statut, summary: r.resume, details: { code: r.code, ...r.details }, changed: false };
}

async function passeBilanSemaine(ctx, options = {}) {
  const r = await produireLeBilan({ maintenant: options.maintenant ?? Date.now(), ctx, options });
  return { status: r.statut, summary: r.resume, details: { code: r.code, ...r.details }, changed: false };
}

/** Due : la règle « une fois » lue dans le fichier des textes (jamais dans l'historique des passes), l'interrupteur des analyses IA, l'heure. */
const dueBulletin = (ctx, options = {}) => decisionDuBulletin({ maintenant: options.maintenant ?? Date.now() }).du;
const dueBilanSemaine = (ctx, options = {}) => decisionDuBilan({ maintenant: options.maintenant ?? Date.now() }).du;

/**
 * L'étape « connaitreMarche » (étape 22 du plan, 13/10/2026) : CONNAÎTRE LE MARCHÉ — la justesse, la
 * vitesse, les biais et la marge de chaque bookmaker, et le meilleur moment pour parier de chaque
 * championnat, sur toutes les cotes archivées (data/marketKnowledge.js). Tout se lit dans un PROCESSUS À
 * PART, base en lecture seule : d'abord l'empreinte des sources (cotes, historique football-data, résultats)
 * — rien de neuf depuis le dernier calcul : rien (une seconde, rien d'écrit) ; sinon le calcul complet
 * (~2 min, ~370 Mo chez lui), attendu sans tenir la main, puis
 * rangé par le serveur — seul écrivain, sous le verrou de la passe — par tranches courtes en rendant la
 * main. En échec : rien d'écrit, le calcul précédent reste lu, la passe suivante recommence. MESURÉ
 * SEULEMENT : le moteur ne lit rien d'ici ; les étapes 23 et 31 le liront.
 */
async function passeConnaitreMarche(ctx, options = {}) {
  const r = await connaitreLeMarche({ ou: 'serveur', force: Boolean(options.force), ...options });
  const tenu = `le serveur jamais tenu plus de ${nombre(Math.round(r.blocMaxMs ?? 0))} ms d'affilée`;
  const mesure = ' Mesuré seulement : le moteur ne lit rien d’ici.';
  if (r.mode === 'rien') {
    return {
      status: 'ok',
      summary: `Rien à refaire : aucune cote, aucun résultat ni historique football-data n’a bougé depuis le calcul n° ${r.calcul} du ${new Date(r.finiLe).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} (${duree(r.dureeMs)}, ${tenu}).${mesure}`,
      details: { mode: r.mode, calcul: r.calcul, dureeMs: r.dureeMs, blocMaxMs: r.blocMaxMs },
      changed: false
    };
  }
  if (r.mode === 'echec') {
    return {
      status: 'error',
      summary: `En échec : ${String(r.erreur).slice(0, 240)} — rien d’écrit, le calcul précédent reste lu ; la passe suivante recommence (${duree(r.dureeMs)}).`,
      details: { mode: r.mode, calcul: r.calcul, erreur: r.erreur, dureeMs: r.dureeMs },
      changed: false
    };
  }
  const b = r.bilanDuCalcul ?? {};
  const s = r.resume ?? {};
  const juste = s.plusJuste?.cloture ?? s.plusJuste?.releve ?? null;
  const premier = s.premier?.releve ?? null;
  const tous = (s.moments ?? []).find((m) => m.championnat === '*') ?? null;
  const phrases = [
    juste ? `le plus juste : ${juste.titre}` : 'le plus juste : trop peu de matchs communs',
    premier?.livre ? `bouge le premier : ${premier.titre}` : `bouge le premier : ${premier?.raison ?? 'pas mesuré'}`,
    `${pluriel(s.biais?.length ?? 0, 'biais prouvé', 'biais prouvés')}`,
    `meilleur moment (tous championnats) : ${tous?.phrase ?? 'pas mesuré'}`,
    s.reproduction ? `référence du 23/09 ${s.reproduction.retrouve ? 'retrouvée' : 'PAS retrouvée'} (Pinnacle ${decimal(s.reproduction.mesure?.perteLog, 4)} sur ${nombre(s.reproduction.mesure?.matchs ?? 0)} matchs)` : null
  ].filter(Boolean);
  return {
    status: s.reproduction && !s.reproduction.retrouve ? 'warn' : 'ok',
    summary:
      `${r.mode === 'premier' ? 'Premier calcul' : 'Recalcul'} n° ${r.calcul} : ${pluriel(b.releves?.rencontres ?? 0, 'rencontre', 'rencontres')}, ${pluriel(b.releves?.cotes ?? 0, 'cote', 'cotes')} de ${pluriel(b.livres?.length ?? 0, 'livre', 'livres')}, ` +
      `${pluriel(r.lignes, 'ligne rangée', 'lignes rangées')} en ${duree(r.dureeMs)} (calcul à part ${duree(b.dureeMs)}, ${Math.round((b.rssMax ?? 0) / 1048576)} Mo chez lui ; rangement ${duree(r.rangementMs)}, ${tenu}) — ${phrases.join(' ; ')}.${mesure}`,
    details: {
      mode: r.mode,
      calcul: r.calcul,
      lignes: r.lignes,
      dureeMs: r.dureeMs,
      rangementMs: r.rangementMs,
      blocMaxMs: r.blocMaxMs,
      calculAPart: { dureeMs: b.dureeMs ?? null, rssMax: b.rssMax ?? null, parties: b.parties ?? null, comptes: b.comptes ?? null },
      plusJuste: juste ? { livre: juste.livre, perteLog: juste.perteLog } : null,
      premier: premier?.livre ? { livre: premier.livre, avance: premier.avance } : null,
      biais: s.biais?.length ?? 0,
      momentTous: tous?.conclusion ?? null,
      reproduction: s.reproduction ? { retrouve: s.reproduction.retrouve, mesure: s.reproduction.mesure } : null
    },
    // Aucun écran ne lit encore ces chiffres (la page « Bookmakers » viendra à l'étape 31) : rien à recharger.
    changed: false
  };
}

/**
 * Due : au clic, une fois par jour civil de Paris (la première passe après minuit), ou quand le dernier
 * calcul fini est d'une autre version du calcul. LIT seulement (la fiche du dernier calcul, une ligne).
 * Rien de neuf dans les sources : l'étape tourne mais ne refait rien (quelques millisecondes).
 */
const dueConnaitreMarche = (ctx, { database = null } = {}) => {
  if (ctx.manuel || !faitAujourdhui(ctx.derniere('connaitreMarche'))) return true;
  try {
    return dernierCalcul({ database: database ?? openDb(), avecResume: false })?.version !== VERSION_CONNAISSANCE;
  } catch {
    // Base illisible à cet instant : l'étape tourne et dira pourquoi.
    return true;
  }
};

/**
 * L'étape « indiceForce » (étape 29 du plan, 14/10/2026) : L'INDICE DE FORCE DES ÉQUIPES — pour chaque club,
 * chaque jour où il joue, sa force la veille (buts d'écart attendus face à une équipe moyenne de son
 * championnat), ses statistiques corrigées de la force des adversaires et leurs percentiles, au total, à
 * domicile et à l'extérieur (data/db/teamStrength.js), lus dans la table du jour J. Le rejeu se fait dans un
 * PROCESSUS À PART, base en lecture seule : d'abord l'empreinte des rencontres (par compétition et par mois) —
 * rien de neuf : rien (rien d'écrit) ; sinon le rejeu des seuls championnats touchés (tout, la première fois,
 * ~30 s chez lui) —, attendu sans tenir la main, puis rangé par le serveur — seul écrivain, sous le verrou de
 * la passe — par tranches courtes en rendant la main. La table du jour J pas à jour (absente, interrompue,
 * d'une autre version) : rien n'est recalculé, la passe suivante le fera. PROPOSÉ SEULEMENT : le moteur ne lit
 * pas l'indice ; l'écran (étape 31) et les modèles (27, 30) le liront.
 */
async function passeIndiceForce(ctx, options = {}) {
  const { etatDeLaTable = () => etatTableJourJ(), ...reste } = options;
  let table;
  try {
    table = etatDeLaTable();
  } catch (error) {
    table = { aJour: false, raison: error.message };
  }
  if (!table?.aJour) {
    const pourquoi = table?.absente ? 'jamais construite' : table?.enCours ? 'passe interrompue' : table?.raison ?? 'autre version';
    return {
      status: 'warn',
      summary: `La table du jour J n’est pas à jour (${pourquoi}) : l’indice de force n’est pas recalculé ; la passe suivante le fera.`,
      details: { mode: 'attente', pourquoi },
      changed: false
    };
  }
  const r = await indiceDeForce({ force: Boolean(reste.force), ...reste });
  const tenu = `le serveur jamais tenu plus de ${nombre(Math.round(r.blocMaxMs ?? 0))} ms d'affilée`;
  const propose = ' Proposé seulement : le moteur ne lit pas l’indice.';
  if (r.mode === 'rien') {
    return {
      status: 'ok',
      summary: `Rien à refaire : aucune rencontre de la table du jour J n’a bougé depuis le calcul du ${r.calculeLe ? new Date(r.calculeLe).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '?'} (${duree(r.dureeMs)}, ${tenu}).${propose}`,
      details: { mode: r.mode, dureeMs: r.dureeMs, blocMaxMs: r.blocMaxMs },
      changed: false
    };
  }
  if (r.mode === 'echec') {
    return {
      status: 'error',
      summary: `En échec : ${String(r.erreur).slice(0, 240)} — rien d’avancé, l’indice précédent reste lu ; la passe suivante recommence (${duree(r.dureeMs)}).`,
      details: { mode: r.mode, erreur: r.erreur, dureeMs: r.dureeMs },
      changed: false
    };
  }
  const b = r.bilanDuCalcul ?? {};
  const ecartees = b.ecartees?.championnatsDifferents ?? 0;
  const portee = r.portee ? Object.keys(r.portee) : [];
  const quoi = r.complet
    ? `${r.mode === 'premier' ? 'Premier calcul' : 'Tout refait'} : ${pluriel(b.championnats ?? 0, 'championnat', 'championnats')}`
    : `${pluriel(portee.length, 'championnat rejoué', 'championnats rejoués')} (${portee.slice(0, 4).join(', ')}${portee.length > 4 ? ', …' : ''})`;
  return {
    status: b.nonConvergees ? 'warn' : 'ok',
    summary:
      `${quoi}, ${pluriel(r.ecrites, 'ligne écrite', 'lignes écrites')} (${pluriel(b.actuelles ?? 0, 'ligne actuelle', 'lignes actuelles')}), ${pluriel(r.retirees, 'retirée', 'retirées')} en ${duree(r.dureeMs)} ` +
      `(rejeu à part ${duree(b.dureeMs)}, ${Math.round((b.aPart?.rssMaxOctets ?? 0) / 1048576)} Mo chez lui ; rangement ${duree(r.rangementMs)}, ${tenu}) ; ` +
      `${pluriel(b.utilisees ?? 0, 'rencontre utilisée', 'rencontres utilisées')}, ${pluriel(ecartees, 'coupe ou barrage entre deux championnats écarté', 'coupes ou barrages entre deux championnats écartés')}` +
      (b.nonConvergees ? ` ; ${pluriel(b.nonConvergees, 'correction non convergée', 'corrections non convergées')} — à regarder` : '') +
      `.${propose}`,
    details: {
      mode: r.mode,
      complet: r.complet,
      portee: r.portee,
      jusquA: r.jusquA,
      lignes: r.lignes,
      ecrites: r.ecrites,
      retirees: r.retirees,
      dureeMs: r.dureeMs,
      rangementMs: r.rangementMs,
      blocMaxMs: r.blocMaxMs,
      calculAPart: { dureeMs: b.dureeMs ?? null, rssMax: b.aPart?.rssMaxOctets ?? null, parties: b.parties ?? null, resolutions: b.resolutions ?? null, toursMax: b.toursMax ?? null, nonConvergees: b.nonConvergees ?? null, ecartees: b.ecartees ?? null }
    },
    // Aucun écran ne lit encore l'indice (le bloc « Indice de force » viendra à l'étape 31) : rien à recharger.
    changed: false
  };
}

/**
 * Due : au clic, une fois par jour civil de Paris (la première passe après minuit), ou quand l'indice n'est pas
 * à jour (jamais calculé, autre version ou autres réglages, rangement interrompu). LIT seulement (team_strength_state).
 * Rien de neuf dans la table du jour J : l'étape tourne mais ne refait rien (une seconde).
 */
const dueIndiceForce = (ctx, { database = null } = {}) => {
  if (ctx.manuel || !faitAujourdhui(ctx.derniere('indiceForce'))) return true;
  try {
    return etatIndiceDeForce(database ? { database } : {}).aJour === false;
  } catch {
    // Base illisible à cet instant : l'étape tourne et dira pourquoi.
    return true;
  }
};

/**
 * Étape 27 : les empreintes des forces de buts que lisent la version en service et la candidate en essai (la clé
 * `modeleDeButs` de leurs réglages) — aucune tant qu'aucune version ne porte le modèle de buts unique.
 */
function empreintesDeLaNuit() {
  let reglagesCandidate = null;
  try {
    reglagesCandidate = candidatePourLeBanc()?.reglagesCandidate ?? null;
  } catch {
    reglagesCandidate = null;
  }
  return empreintesDemandees({ reglagesEnService: getEngineConfig('football'), reglagesCandidate });
}

/** Un écart du contrôle anti-fuite des forces de buts en quelques mots : le club, le jour, la colonne. */
const ecartDesForcesEnClair = (e) => `club ${e.club} avant le ${e.J} (${e.colonne})`;

/**
 * L'étape « forcesButs » (étape 27 du plan, 21/10/2026) : LES FORCES DE BUTS de chaque club et les moyennes de chaque
 * championnat à la 90e minute, « avant le jour J », que lit le modèle de buts unique (core/engine/goalModel.js) —
 * seulement pour les réglages qui le portent (version en service, candidate en essai) ; aucun : rien à faire. Le calcul
 * complet se fait dans un PROCESSUS À PART, base en lecture seule (data/db/forcesButs.js) : l'empreinte des rencontres
 * — rien de neuf : rien —, sinon le calcul, la différence avec la table et un contrôle anti-fuite (40 couples
 * recalculés par un second chemin) ; le serveur range seul, sous le verrou de la passe, par tranches courtes en rendant
 * la main. Un autre calcul lourd en cours (un banc) : REPORTÉ, la passe suivante le fera. La table du jour J pas à jour :
 * rien, la passe suivante le fera. APRÈS « indiceForce », AVANT le gel et la candidate à blanc (ils trouvent les forces
 * de la veille) et la sauvegarde (la copie de la nuit les contient).
 */
async function passeForcesButs(ctx, options = {}) {
  const { etatDeLaTable = () => etatTableJourJ(), empreintes = empreintesDeLaNuit(), ...reste } = options;
  let table;
  try {
    table = etatDeLaTable();
  } catch (error) {
    table = { aJour: false, raison: error.message };
  }
  if (!table?.aJour) {
    const pourquoi = table?.absente ? 'jamais construite' : table?.enCours ? 'passe interrompue' : table?.raison ?? 'autre version';
    return {
      status: 'warn',
      summary: `La table du jour J n’est pas à jour (${pourquoi}) : les forces de buts ne sont pas recalculées ; la passe suivante le fera.`,
      details: { mode: 'attente', pourquoi },
      changed: false
    };
  }
  // L'heure est lue ici (la passe), jamais dans forcesButs.js.
  const r = await forcesDeButs({ empreintes, force: Boolean(reste.force), maintenant: () => new Date().toISOString(), ...reste });
  const tenu = `le serveur jamais tenu plus de ${nombre(Math.round(r.blocMaxMs ?? 0))} ms d'affilée`;
  if (r.mode === 'rien') {
    return {
      status: 'ok',
      summary: r.raison ? `Rien à faire : ${r.raison}.` : `Rien à refaire : aucune rencontre de la table du jour J n’a bougé depuis le calcul du ${r.calculeLe ? new Date(r.calculeLe).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '?'} (${duree(r.dureeMs)}, ${tenu}).`,
      details: { mode: r.mode, empreintes: r.empreintes, dureeMs: r.dureeMs },
      changed: false
    };
  }
  if (r.mode === 'reporte') {
    return {
      status: 'warn',
      summary: `Reporté : ${String(r.raison).replace(/\.$/, '')} — les forces de buts seront calculées à la passe suivante.`,
      details: { mode: r.mode, reporte: true, raison: r.raison },
      changed: false
    };
  }
  if (r.mode === 'echec') {
    return {
      status: 'error',
      summary: `En échec : ${String(r.erreur).slice(0, 240)} — rien d’avancé, les forces précédentes restent lues ; la passe suivante recommence (${duree(r.dureeMs)}).`,
      details: { mode: r.mode, erreur: r.erreur, dureeMs: r.dureeMs },
      changed: false
    };
  }
  const b = r.bilanDuCalcul ?? {};
  const ecarts = r.controle?.ecarts ?? [];
  const retirees = r.empreintesRetirees ?? [];
  const details = { mode: r.mode, empreintes: r.empreintes, empreintesRetirees: retirees, lignes: r.lignes, ecrites: r.ecrites, retirees: r.retirees, clubs: r.clubs, championnats: r.championnats, jusqua: r.jusqua, dureeMs: r.dureeMs, rangementMs: r.rangementMs, blocMaxMs: r.blocMaxMs, controle: r.controle ? { lignes: r.controle.lignes, ecarts: ecarts.length } : null, calculAPart: { dureeMs: b.dureeMs ?? null, rssMax: b.aPart?.rssMaxOctets ?? null, parties: b.parties ?? null } };
  // Plus aucune version du moteur ne lit les forces : la nuit retire ce qui était rangé, et le dit.
  if (!r.empreintes?.length) {
    return {
      status: 'ok',
      summary: `Plus aucune version du moteur ne lit les forces de buts : ${pluriel(r.retirees, 'ligne retirée', 'lignes retirées')} (${duree(r.dureeMs)}, ${tenu}).`,
      details,
      changed: false
    };
  }
  const controle = r.controle
    ? `contrôle anti-fuite : ${pluriel(r.controle.lignes, 'ligne recalculée', 'lignes recalculées')} par un second chemin, ${pluriel(ecarts.length, 'écart', 'écarts')}` +
      (ecarts.length ? ` (${ecarts.slice(0, 3).map(ecartDesForcesEnClair).join(' ; ')}${ecarts.length > 3 ? ' ; …' : ''}) — à regarder` : '')
    : 'contrôle anti-fuite non fait';
  return {
    status: ecarts.length ? 'warn' : 'ok',
    summary:
      `${r.mode === 'premier' ? 'Premier calcul' : 'Forces de buts'} : ${pluriel(r.ecrites, 'ligne écrite', 'lignes écrites')} (${pluriel(r.clubs, 'club', 'clubs')}), ` +
      `${pluriel(r.championnats, 'championnat mis à jour', 'championnats mis à jour')}, ${duree(b.dureeMs ?? 0)} à part (${Math.round((b.aPart?.rssMaxOctets ?? 0) / 1048576)} Mo), ` +
      `rangement ${duree(r.rangementMs)}, ${tenu} ; ${controle}` +
      (retirees.length ? ` ; ${pluriel(retirees.length, 'réglage que plus aucune version ne lit', 'réglages que plus aucune version ne lit')} : ${retirees.length > 1 ? 'leurs' : 'ses'} lignes retirées` : '') +
      '.',
    details,
    // Les écarts du contrôle restent visibles jusqu'à la nuit qui n'en trouve plus (comme ceux de la table du jour J).
    ...(r.controle ? { alert: { key: 'forcesButs', value: ecarts.length ? { ecarts: ecarts.slice(0, 20), total: ecarts.length, lignes: r.controle.lignes, updatedAt: new Date().toISOString() } : null } } : {}),
    // Aucun écran ne lit les forces tant que le modèle de buts n'est pas en service : rien à recharger.
    changed: false
  };
}

/**
 * Due : au clic, une fois par jour civil de Paris, quand la passe d'avant l'a REPORTÉE (un banc tournait), ou quand les
 * forces ne sont pas à jour (jamais calculées, rangement interrompu, autre version, une empreinte demandée manquante).
 * LIT seulement (forces_buts_state).
 */
const dueForcesButs = (ctx, { database = null, empreintes = null } = {}) => {
  if (ctx.manuel || !faitAujourdhui(ctx.derniere('forcesButs'))) return true;
  if (ctx.derniersDetails?.('forcesButs')?.reporte) return true;
  try {
    const demandees = empreintes ?? empreintesDeLaNuit();
    return demandees.length > 0 && etatForcesButs({ ...(database ? { database } : {}), empreintes: demandees }).aJour === false;
  } catch {
    // Base illisible à cet instant : l'étape tourne et dira pourquoi.
    return true;
  }
};

/** Le jour du lancement de l'étape 30 au registre de la mesure (la mesure à blanc ne lit que les matchs d'après), ou null. */
function lancementDesFiches() {
  try {
    return lancementDe('30')?.le ?? null;
  } catch {
    // Registre illisible : la mesure à blanc attend (les fiches, elles, se calculent).
    return null;
  }
}

/**
 * L'étape « fichesJoueurs » (étape 30 du plan, 22/10/2026) : LES FICHES DES JOUEURS PAR POSTE et l'équipe habituelle
 * de chaque club, « au lendemain du dernier jour de la table du jour J » (data/db/playerRatings.js) — par 90 minutes,
 * pondérées dans le temps, corrigées des adversaires et du championnat, ramenées vers la moyenne du poste. Le calcul
 * COMPLET se fait dans un PROCESSUS À PART, base en lecture seule : l'empreinte de la table du jour J — rien de neuf :
 * rien —, sinon le rejeu, la différence avec ce qui est rangé, un contrôle anti-fuite (40 couples recalculés par un
 * second chemin) et la mesure à blanc depuis le lancement de l'étape ; le serveur range seul, sous le verrou de la
 * passe, par tranches courtes en rendant la main. Un autre calcul lourd en cours (un banc) : REPORTÉ. La table du
 * jour J pas à jour : rien. APRÈS « forcesButs », AVANT le gel et la candidate à blanc, et la sauvegarde (la copie de
 * la nuit les contient). AFFICHAGE SEULEMENT : le moteur ne lit pas les fiches (règle de Pierre).
 */
async function passeFichesJoueurs(ctx, options = {}) {
  const { etatDeLaTable = () => etatTableJourJ(), depuis = lancementDesFiches(), ...reste } = options;
  let table;
  try {
    table = etatDeLaTable();
  } catch (error) {
    table = { aJour: false, raison: error.message };
  }
  if (!table?.aJour) {
    const pourquoi = table?.absente ? 'jamais construite' : table?.enCours ? 'passe interrompue' : table?.raison ?? 'autre version';
    return {
      status: 'warn',
      summary: `La table du jour J n’est pas à jour (${pourquoi}) : les fiches des joueurs ne sont pas recalculées ; la passe suivante le fera.`,
      details: { mode: 'attente', pourquoi },
      changed: false
    };
  }
  // L'heure est lue ici (la passe), jamais dans playerRatings.js.
  const r = await fichesDesJoueurs({ force: Boolean(reste.force), maintenant: () => new Date().toISOString(), depuis, ...reste });
  const tenu = `le serveur jamais tenu plus de ${nombre(Math.round(r.blocMaxMs ?? 0))} ms d'affilée`;
  const affichage = ' Affichage seulement : le moteur ne lit pas les fiches.';
  if (r.mode === 'rien') {
    return {
      status: 'ok',
      summary: `Rien à refaire : la table du jour J n’a pas bougé depuis le calcul du ${r.calculeLe ? new Date(r.calculeLe).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '?'} (${duree(r.dureeMs)}, ${tenu}).${affichage}`,
      details: { mode: r.mode, dureeMs: r.dureeMs },
      changed: false
    };
  }
  if (r.mode === 'reporte') {
    return {
      status: 'warn',
      summary: `Reporté : ${String(r.raison).replace(/\.$/, '')} — les fiches des joueurs seront calculées à la passe suivante.`,
      details: { mode: r.mode, reporte: true, raison: r.raison },
      changed: false
    };
  }
  if (r.mode === 'echec') {
    return {
      status: 'error',
      summary: `En échec : ${String(r.erreur).slice(0, 240)} — rien d’avancé, les fiches précédentes restent lues ; la passe suivante recommence (${duree(r.dureeMs)}).`,
      details: { mode: r.mode, erreur: r.erreur, dureeMs: r.dureeMs },
      changed: false
    };
  }
  const b = r.bilanDuCalcul ?? {};
  const ecarts = r.controle?.ecarts ?? [];
  const controle = r.controle
    ? `contrôle anti-fuite : ${pluriel(r.controle.lignes, 'joueur recalculé', 'joueurs recalculés')} par un second chemin, ${pluriel(ecarts.length, 'écart', 'écarts')}` +
      (ecarts.length ? ` (${ecarts.slice(0, 3).map((e) => `joueur ${e.joueur} avant le ${e.J} (${e.colonne})`).join(' ; ')}${ecarts.length > 3 ? ' ; …' : ''}) — à regarder` : '')
    : 'contrôle anti-fuite non fait';
  const mesure = r.mesure?.lancee ? ` ; mesure à blanc depuis le ${r.mesure.depuis} : ${pluriel(r.mesure.matchs ?? 0, 'match mesuré', 'matchs mesurés')}` : '';
  return {
    status: ecarts.length ? 'warn' : 'ok',
    summary:
      `${r.mode === 'premier' ? 'Premier calcul' : 'Fiches des joueurs'} : ${pluriel(r.fiches ?? 0, 'joueur', 'joueurs')} (${pluriel(b.etablies ?? 0, 'fiche établie', 'fiches établies')}), ${pluriel(r.equipes ?? 0, 'équipe habituelle', 'équipes habituelles')} ; ` +
      `${pluriel(r.ecrites, 'ligne écrite', 'lignes écrites')}, ${pluriel(r.retirees, 'retirée', 'retirées')} en ${duree(r.dureeMs)} (calcul à part ${duree(b.dureeMs ?? 0)}, ${Math.round((b.aPart?.rssMaxOctets ?? 0) / 1048576)} Mo chez lui ; rangement ${duree(r.rangementMs)}, ${tenu}) ; ${controle}${mesure}.${affichage}`,
    details: {
      mode: r.mode,
      fiches: r.fiches,
      equipes: r.equipes,
      ecrites: r.ecrites,
      retirees: r.retirees,
      jusqua: r.jusqua,
      dureeMs: r.dureeMs,
      rangementMs: r.rangementMs,
      blocMaxMs: r.blocMaxMs,
      controle: r.controle ? { lignes: r.controle.lignes, ecarts: ecarts.length } : null,
      mesure: r.mesure ? { lancee: Boolean(r.mesure.lancee), depuis: r.mesure.depuis ?? null, matchs: r.mesure.matchs ?? 0 } : null,
      calculAPart: { dureeMs: b.dureeMs ?? null, rssMax: b.aPart?.rssMaxOctets ?? null, parties: b.parties ?? null }
    },
    // Les écarts du contrôle restent visibles jusqu'à la nuit qui n'en trouve plus (comme ceux des forces de buts).
    ...(r.controle ? { alert: { key: 'fichesJoueurs', value: ecarts.length ? { ecarts: ecarts.slice(0, 20), total: ecarts.length, lignes: r.controle.lignes, updatedAt: new Date().toISOString() } : null } } : {}),
    // Aucun écran ne lit encore les fiches (étape 31) ; la page du match les relit à chaque ouverture : rien à recharger.
    changed: false
  };
}

/**
 * Due : au clic, une fois par jour civil de Paris, quand la passe d'avant l'a REPORTÉE (un banc tournait), ou quand les
 * fiches ne sont pas à jour (jamais calculées, rangement interrompu, autre version ou d'autres réglages). LIT seulement
 * (player_ratings_state).
 */
const dueFichesJoueurs = (ctx, { database = null } = {}) => {
  if (ctx.manuel || !faitAujourdhui(ctx.derniere('fichesJoueurs'))) return true;
  if (ctx.derniersDetails?.('fichesJoueurs')?.reporte) return true;
  try {
    return etatDesFiches(database ? { database } : {}).aJour === false;
  } catch {
    // Base illisible à cet instant : l'étape tourne et dira pourquoi.
    return true;
  }
};

/**
 * L'étape « stylesDeJeu » (étape 37 du plan, 22/10/2026) : LE STYLE DE JEU de chaque club et de chaque entraîneur
 * (data/db/teamStyle.js) — possession, jeu direct, contre-attaque, coups de pied arrêtés, lus sur les 20 derniers matchs
 * de championnat et comparés aux clubs du même championnat. La carte des tirs est lourde (~185 Mo de JSON) : le
 * PROCESSUS À PART (base en lecture seule) ne relit que les rencontres NOUVELLES ou CHANGÉES depuis la nuit d'avant (leur
 * signature), recalcule les styles en mémoire depuis son cache, fait la différence et un contrôle anti-fuite (20
 * instantanés recalculés par un second chemin) ; le serveur range seul, sous le verrou de la passe, par tranches
 * courtes. Rien de neuf : rien. Un autre calcul lourd en cours : REPORTÉ. APRÈS « fichesJoueurs », AVANT le gel et la
 * sauvegarde (la copie de la nuit les contient). EXPLICATION SEULEMENT : le moteur ne lit pas les styles.
 */
async function passeStylesDeJeu(ctx, options = {}) {
  // L'heure est lue ici (la passe), jamais dans teamStyle.js.
  const r = await stylesDeJeu({ force: Boolean(options.force), maintenant: () => new Date().toISOString(), ...options });
  const tenu = `le serveur jamais tenu plus de ${nombre(Math.round(r.blocMaxMs ?? 0))} ms d'affilée`;
  const regle = ' Explication seulement : le moteur ne lit pas les styles.';
  if (r.mode === 'rien') {
    return {
      status: 'ok',
      summary: `Rien à refaire : aucune rencontre nouvelle ou changée depuis le calcul du ${r.calculeLe ? new Date(r.calculeLe).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '?'} (${duree(r.dureeMs)}, ${tenu}).${regle}`,
      details: { mode: r.mode, dureeMs: r.dureeMs },
      changed: false
    };
  }
  if (r.mode === 'reporte') {
    return {
      status: 'warn',
      summary: `Reporté : ${String(r.raison).replace(/\.$/, '')} — les styles de jeu seront calculés à la passe suivante.`,
      details: { mode: r.mode, reporte: true, raison: r.raison },
      changed: false
    };
  }
  if (r.mode === 'echec') {
    return {
      status: 'error',
      summary: `En échec : ${String(r.erreur).slice(0, 240)} — rien d’avancé, les styles précédents restent lus ; la passe suivante recommence (${duree(r.dureeMs)}).`,
      details: { mode: r.mode, erreur: r.erreur, dureeMs: r.dureeMs },
      changed: false
    };
  }
  const b = r.bilanDuCalcul ?? {};
  const ecarts = r.controle?.ecarts ?? [];
  const controle = r.controle
    ? `contrôle anti-fuite : ${pluriel(r.controle.lignes, 'instantané recalculé', 'instantanés recalculés')} par un second chemin, ${pluriel(ecarts.length, 'écart', 'écarts')}` +
      (ecarts.length ? ` (${ecarts.slice(0, 3).map((e) => `club ${e.club} avant le ${e.J} (${e.colonne})`).join(' ; ')}${ecarts.length > 3 ? ' ; …' : ''}) — à regarder` : '')
    : 'contrôle anti-fuite non fait';
  const lecture = r.mode === 'incremental' ? `${pluriel(b.relues ?? 0, 'rencontre relue', 'rencontres relues')} (nouvelles ou changées)` : `${pluriel(b.relues ?? 0, 'rencontre lue', 'rencontres lues')} en entier`;
  return {
    status: ecarts.length ? 'warn' : 'ok',
    summary:
      `${r.mode === 'premier' ? 'Premier calcul' : 'Styles de jeu'} : ${pluriel(r.actuels ?? 0, 'club', 'clubs')} et ${pluriel(r.entraineurs ?? 0, 'entraîneur', 'entraîneurs')} au ${r.jourActuel ?? '?'} ; ${lecture} ; ` +
      `${pluriel(r.ecrites, 'ligne écrite', 'lignes écrites')}, ${pluriel(r.retirees, 'retirée', 'retirées')} en ${duree(r.dureeMs)} (calcul à part ${duree(b.dureeMs ?? 0)}, ${Math.round((b.aPart?.rssMaxOctets ?? 0) / 1048576)} Mo chez lui ; rangement ${duree(r.rangementMs)}, ${tenu}) ; ${controle}.${regle}`,
    details: {
      mode: r.mode,
      styles: r.styles,
      actuels: r.actuels,
      entraineurs: r.entraineurs,
      ecrites: r.ecrites,
      retirees: r.retirees,
      relues: b.relues ?? null,
      jusqua: r.jusqua,
      jourActuel: r.jourActuel,
      dureeMs: r.dureeMs,
      rangementMs: r.rangementMs,
      blocMaxMs: r.blocMaxMs,
      repartition: b.repartition ?? null,
      controle: r.controle ? { lignes: r.controle.lignes, ecarts: ecarts.length } : null,
      calculAPart: { dureeMs: b.dureeMs ?? null, rssMax: b.aPart?.rssMaxOctets ?? null, parties: b.parties ?? null }
    },
    // Les écarts du contrôle restent visibles jusqu'à la nuit qui n'en trouve plus (comme ceux des fiches des joueurs).
    ...(r.controle ? { alert: { key: 'stylesDeJeu', value: ecarts.length ? { ecarts: ecarts.slice(0, 20), total: ecarts.length, lignes: r.controle.lignes, updatedAt: new Date().toISOString() } : null } } : {}),
    // La page de l'équipe et la page du match relisent à chaque ouverture : rien à recharger.
    changed: false
  };
}

/**
 * Due : au clic, une fois par jour civil de Paris, quand la passe d'avant l'a REPORTÉE, ou quand les styles ne sont pas
 * à jour (jamais calculés, rangement interrompu, autre version ou d'autres réglages). LIT seulement (team_style_state).
 */
const dueStylesDeJeu = (ctx, { database = null } = {}) => {
  if (ctx.manuel || !faitAujourdhui(ctx.derniere('stylesDeJeu'))) return true;
  if (ctx.derniersDetails?.('stylesDeJeu')?.reporte) return true;
  try {
    return etatDesStyles(database ? { database } : {}).aJour === false;
  } catch {
    // Base illisible à cet instant : l'étape tourne et dira pourquoi.
    return true;
  }
};

/** Une raison de « non calculé » en peu de mots (le résumé de l'étape ; la phrase entière est dans les détails et dans Réglages). */
const raisonCourte = (raison) => String(raison ?? 'raison non dite').split(' — ')[0].replace(/ : non calculé$/, '').slice(0, 90);

/**
 * L'étape « simulationSaisons » (étape 28 du plan, 27/10/2026) : LES FINS DE SAISON des championnats (jamais une coupe)
 * et L'ENJEU de chaque rencontre des 14 prochains jours — 10 000 fins de phase par championnat, deux lois chaque nuit
 * (les forces de buts du modèle de buts, et la table officielle), calculées dans un PROCESSUS À PART en lecture seule ;
 * rangées par le serveur sous le verrou de la passe, par tranches courtes en rendant la main ; ce qui n'est PAS calculé
 * est dit, avec sa raison. Un autre calcul lourd en cours : REPORTÉE. APRÈS la sauvegarde (une panne ici ne coûte rien
 * à l'essai de l'étape 27 ; la copie de la nuit n'a ces lignes que la nuit suivante). Calculées à blanc : rien n'est
 * montré tant que l'interrupteur de Réglages est éteint ; jamais lues par le moteur. Un nom du calendrier inconnu qui
 * bloque un championnat : alerte durable, jusqu'à la nuit qui le reconnaît.
 */
async function passeSimulationSaisons(ctx, options = {}) {
  // L'heure est lue ici (la passe), jamais dans data/simulation.
  const r = await simulerLesSaisonsDeLaNuit({ ...options, maintenant: options.maintenant ?? Date.now() });
  const tenu = `le serveur jamais tenu plus de ${nombre(Math.round(r.blocMaxMs ?? 0))} ms d'affilée`;
  if (r.mode === 'reporte') {
    return { status: 'warn', summary: `Reporté : ${String(r.raison).replace(/\.$/, '')} — les fins de saison seront calculées à la passe suivante.`, details: { mode: r.mode, reporte: true, raison: r.raison }, changed: false };
  }
  if (r.mode === 'echec') {
    return { status: 'error', summary: `En échec : ${String(r.erreur).slice(0, 240)} — rien d’avancé, la nuit d’avant reste lue ; la passe suivante recommence (${duree(r.dureeMs)}).`, details: { mode: r.mode, erreur: r.erreur, dureeMs: r.dureeMs }, changed: false };
  }
  const b = r.bilan ?? {};
  const non = b.nonCalcules ?? [];
  const inconnus = b.inconnus ?? [];
  const loi = r.forces?.empreinte
    ? `loi « forces » : forces de buts ${r.forces.origine === 'service' ? 'du modèle de buts en service' : 'du modèle en essai (étape 27)'}`
    : `loi « forces » non calculée (${r.forces?.raison ?? 'raison non dite'})`;
  return {
    status: inconnus.length || r.elague?.erreur ? 'warn' : 'ok',
    summary:
      `Fins de saison : ${pluriel(b.simules ?? 0, 'championnat simulé', 'championnats simulés')} ${nombre(N_SIMULATION)} fois, ${pluriel(non.length, 'non calculé', 'non calculés')}` +
      (non.length ? ` (${non.slice(0, 4).map((x) => `${x.league} : ${raisonCourte(x.raison)}`).join(' ; ')}${non.length > 4 ? ' ; …' : ''})` : '') +
      `, ${pluriel(r.ecrites?.enjeux ?? 0, 'enjeu rangé', 'enjeux rangés')}${r.ecrites?.enjeuxFiges ? ` (${nombre(r.ecrites.enjeuxFiges)} figé(s) : coup d’envoi passé)` : ''} ; ${loi} ; ` +
      `${duree(b.dureeMs ?? 0)} à part (${Math.round((b.aPart?.rssMaxOctets ?? 0) / 1048576)} Mo chez lui), rangement ${duree(r.rangementMs ?? 0)}, ${tenu}.` +
      (inconnus.length ? ` Noms du calendrier inconnus : ${inconnus.slice(0, 3).map((x) => `${x.league} (${x.noms.slice(0, 3).join(', ')})`).join(' ; ')} — à regarder.` : '') +
      ' Calculé à blanc : rien n’est montré tant que l’affichage est éteint (Réglages) ; jamais lu par le moteur.',
    details: {
      mode: r.mode,
      calculeLe: r.calculeLe,
      simules: b.simules ?? 0,
      nonCalcules: non,
      inconnus,
      enjeux: r.ecrites?.enjeux ?? 0,
      enjeuxFiges: r.ecrites?.enjeuxFiges ?? 0,
      lignes: { etat: r.ecrites?.etat ?? 0, simulees: r.ecrites?.simulees ?? 0 },
      forces: r.forces ?? null,
      elague: r.elague ?? null,
      dureeMs: r.dureeMs,
      rangementMs: r.rangementMs,
      blocMaxMs: r.blocMaxMs,
      plusLongueTrancheMs: r.ecrites?.plusLongueTrancheMs ?? null,
      calculAPart: { dureeMs: b.dureeMs ?? null, rssMax: b.aPart?.rssMaxOctets ?? null }
    },
    alert: { key: 'simulationSaisons', value: inconnus.length ? { inconnus, updatedAt: new Date().toISOString() } : null },
    // L'écran ne lit les fins de saison qu'allumé, à l'ouverture d'un classement : rien à recharger.
    changed: false
  };
}

/** Due : une fois par jour civil de Paris, ou quand la passe d'avant l'a REPORTÉE ; jamais forcée par un clic. */
const dueSimulationSaisons = (ctx) => !faitAujourdhui(ctx.derniere('simulationSaisons')) || Boolean(ctx.derniersDetails?.('simulationSaisons')?.reporte);

/**
 * L'étape « simulationMatchs » (étape 28 du plan, 27/10/2026) : LE DÉROULÉ SIMULÉ des rencontres des 48 prochaines
 * heures — pour chacune, l'analyse du moteur en service et celle de la candidate au modèle de buts dont les forces sont à
 * jour (dans le serveur, en rendant la main), les entrées rangées pour les deux rôles, les chemins de la grille du
 * modèle de buts seule tirés 10 000 fois dans un PROCESSUS À PART sans base (40 rencontres refaites avec la graine du
 * jour : la même table à l'octet, sinon rien n'est rangé) ; puis le contrôle des lignes et le juge de la nuit
 * (provisoire chaque nuit, principal une fois à 800 matchs et 21 jours). Une fois par jour civil de Paris, avec
 * l'interrupteur des enregistreurs (un relevé pour la preuve, comme le gel) ; jamais aux autres passes ni au clic.
 * Calculé à blanc : jamais montré tant que l'affichage est éteint ; jamais lu par le moteur ni envoyé à l'IA.
 */
async function passeSimulationMatchs(ctx, options = {}) {
  // L'heure est lue ici (la passe), jamais dans data/simulation.
  const r = await simulerLesMatchsDeLaNuit({ ...options, maintenant: options.maintenant ?? Date.now() });
  const tenu = `le serveur jamais tenu plus de ${nombre(Math.round(r.blocMaxMs ?? 0))} ms d'affilée`;
  if (r.mode === 'reporte') {
    return { status: 'warn', summary: `Reporté : ${String(r.raison).replace(/\.$/, '')} — le déroulé simulé sera calculé à la passe suivante.`, details: { mode: r.mode, reporte: true, raison: r.raison }, changed: false };
  }
  if (r.mode === 'echec') {
    return { status: 'error', summary: `En échec : ${String(r.erreur).slice(0, 240)} — rien n’est rangé, la nuit d’avant reste lue ; la passe suivante recommence (${duree(r.dureeMs)}).`, details: { mode: r.mode, erreur: r.erreur, dureeMs: r.dureeMs, controleDesTables: r.controleDesTables ?? null }, changed: false };
  }
  const b = r.bilan ?? {};
  const c = r.controle ?? { lignes: 0, ecarts: [] };
  const j = r.jugement;
  const juge = j?.calcule
    ? `jugement provisoire : ${pluriel(j.matchs ?? 0, 'match joué comparé', 'matchs joués comparés')} sur ${nombre(j.horizon?.matchs ?? 800)}, ${pluriel(j.joursEcoules ?? 0, 'jour', 'jours')} sur ${nombre(j.horizon?.jours ?? 21)}${j.principal ? ` ; jugé à l’horizon : « ${j.verdict} »` : ''}`
    : `pas de jugement cette nuit (${j?.raison ?? 'juge non lancé'})`;
  const points = [];
  if (b.echecs) points.push(`${pluriel(b.echecs, 'échec', 'échecs')} (${b.echantillons.slice(0, 2).join(' ; ')})`);
  if (c.ecarts?.length) points.push(`${pluriel(c.ecarts.length, 'écart au contrôle des lignes', 'écarts au contrôle des lignes')} (${c.ecarts.slice(0, 2).map((e) => e.texte).join(' ; ')}) — à regarder`);
  if (r.elague?.erreur) points.push(`élagage en échec : ${r.elague.erreur}`);
  const aPartMo = r.calculAPart?.aPart?.rssMaxOctets ? `, ${Math.round(r.calculAPart.aPart.rssMaxOctets / 1048576)} Mo chez lui` : '';
  return {
    status: points.length ? 'warn' : 'ok',
    summary:
      `Déroulés simulés : ${pluriel(b.dansLaFenetre ?? 0, 'rencontre des 48 prochaines heures', 'rencontres des 48 prochaines heures')}, ${pluriel(b.lignes ?? 0, 'ligne rangée', 'lignes rangées')} ` +
      `(${nombre(b.tirees ?? 0)} tirée(s) ${nombre(N_SIMULATION)} fois sur la grille du modèle de buts, ${nombre(b.entreesSeules ?? 0)} en entrées seules)` +
      (b.sansIdentifiant ? `, ${pluriel(b.sansIdentifiant, 'rencontre sans identifiant FotMob', 'rencontres sans identifiant FotMob')} (pas de ligne)` : '') +
      (b.candidateEnAttente ? ` ; ${b.candidateEnAttente}` : '') +
      ` ; contrôle : ${nombre(r.controleDesTables?.lignes ?? 0)} rencontre(s) refaite(s) avec la graine du jour, ${pluriel(r.controleDesTables?.ecarts?.length ?? 0, 'écart', 'écarts')} ; ${juge} ; ` +
      `${duree(r.dureeMs)} (analyses ${duree(b.analysesMs ?? 0)}, à part ${duree(r.aPartMs ?? 0)}${aPartMo}), ${tenu}` +
      (points.length ? ` ; ${points.join(' ; ')}.` : '.') +
      ' Jamais montré tant que l’affichage est éteint ; jamais lu par le moteur ni envoyé à l’IA.',
    details: {
      mode: r.mode,
      calculeLe: r.calculeLe,
      bilan: b,
      controleDesTables: r.controleDesTables ?? null,
      controle: { lignes: c.lignes ?? 0, ecarts: (c.ecarts ?? []).length, marquees: c.marquees ?? 0 },
      jugement: j ? { calcule: Boolean(j.calcule), raison: j.raison ?? null, matchs: j.matchs ?? 0, joursEcoules: j.joursEcoules ?? 0, principal: Boolean(j.principal), verdict: j.verdict ?? null } : null,
      ecrites: r.ecrites ?? null,
      elague: r.elague ?? null,
      dureeMs: r.dureeMs,
      aPartMs: r.aPartMs,
      rangementMs: r.rangementMs,
      blocMaxMs: r.blocMaxMs,
      calculAPart: { dureeMs: r.calculAPart?.dureeMs ?? null, rssMax: r.calculAPart?.aPart?.rssMaxOctets ?? null }
    },
    alert: { key: 'simulationMatchs', value: c.ecarts?.length ? { ecarts: c.ecarts.slice(0, 20), total: c.ecarts.length, updatedAt: new Date().toISOString() } : null },
    changed: false
  };
}

/** Due : une fois par jour civil de Paris, avec l'interrupteur des enregistreurs, ou quand la passe d'avant l'a REPORTÉE ; jamais forcée par un clic. */
const dueSimulationMatchs = (ctx) => Boolean(env.enregistreurs?.enabled) && (!faitAujourdhui(ctx.derniere('simulationMatchs')) || Boolean(ctx.derniersDetails?.('simulationMatchs')?.reporte));

/** Pour les tests : l'étape d'analyse IA automatique telle que la passe la lance (plafond, réserve, bilan) ; l'étape du carnet de santé ; celle de l'historique football-data ; celle des repères ; celle de la table du jour J ; celle du contrôle quotidien ; celle de la candidate à blanc ; celle de la calibration du mois écoulé ; celle de connaître le marché ; celle de l'indice de force ; celle des forces de buts ; celle des fiches des joueurs ; celle du carnet de l'IA ; celles du bulletin du jour et du bilan de la semaine. */
export const __testing = { ETAPES: () => ETAPES, passeBulletin, passeBilanSemaine, dueBulletin, dueBilanSemaine, passeCarteOuParier, dueCarteOuParier, dueMoteurABlanc, passeIaAuto, passeCarnetSante, passeHistoriqueFd, dueHistoriqueFd, passeReperes, dueReperes, passeTableJourJ, dueTableJourJ, passeControleQuotidien, passeMoteurABlanc, passeCalibrationMensuelle, dueCalibrationMensuelle, passeConnaitreMarche, dueConnaitreMarche, passeIndiceForce, dueIndiceForce, passeForcesButs, dueForcesButs, passeFichesJoueurs, dueFichesJoueurs, passeStylesDeJeu, dueStylesDeJeu, passeCarnetIA, passeDossiersIA, passeSimulationSaisons, dueSimulationSaisons, passeSimulationMatchs, dueSimulationMatchs };

/**
 * Les étapes. `due(ctx)` dit si l'étape tourne à cette passe (les autres
 * sont notées « non due »), `run(ctx)` rend { status, summary, details }.
 * status : 'ok', 'warn' (fait, avec des points à regarder), 'error'.
 */
/**
 * L'étape « carteOuParier » (étape 23 du plan, 22/10/2026) : la CARTE « OÙ PARIER », championnat × marché. Elle
 * relit le dernier rejeu du banc d'essai du moteur en service (sa carte déjà jugée), mesure la valeur de clôture
 * des pronostics gelés depuis la dernière adoption, juge chaque case par le juge de l'étape 16 (K compté), et la
 * range UNE fois (table betting_map, jamais réécrite). Le calcul dans un PROCESSUS À PART, base en lecture seule,
 * sous le jeton du calcul lourd ; le serveur range. Due (carteAFaire) : dès qu'un rejeu existe et qu'aucune carte
 * n'est faite ; à un nouveau rejeu ; quand les réglages ont changé (et qu'un rejeu les mesure) ; le 1er du mois à
 * partir de 6 h. Un clic ne la refait pas : chaque calcul est un regard de plus, que le juge compte. Sans rejeu du
 * banc : rien (« pas encore mesuré »). Ne change aucun chiffre du moteur : elle trie et avertit.
 */
function etatDeLaCarte(ctx, { database = null, maintenant = Date.now() } = {}) {
  const db = database ?? openDb();
  const reglages = JSON.parse(JSON.stringify(lireReglagesDuMoteur().football));
  const r = moteurDuRejeu(reglages);
  const moteur = { empreinte: r.empreinte, empreinteReglages: r.empreinteReglages?.football ?? null, version: Number.isInteger(r.version) ? r.version : null };
  const rejeu = rejeuDeLaCarte(rejeuxUtilesALaCarte({ database: db }), moteur);
  const derniere = lireLaCarte({ database: db, avecContenu: false });
  return { db, moteur, rejeu, derniere, avis: carteAFaire({ derniere, rejeu, moteur, maintenant, manuel: Boolean(ctx?.manuel) }) };
}

async function passeCarteOuParier(ctx, options = {}) {
  const maintenant = options.maintenant ?? Date.now();
  const { db, moteur, rejeu, avis } = etatDeLaCarte(ctx, { database: options.database, maintenant });
  if (!avis.du) return { status: 'ok', summary: `Rien à faire : ${avis.pourquoi}.`, details: { fait: false, pourquoi: avis.pourquoi }, changed: false };
  const debut = Date.now();
  let r;
  try {
    r = await (options.calculer ?? calculerLaCarteAPart)({ chemin: options.chemin ?? resolveDbPath(), options: { moteur, versions: readJsonFile(FICHIER_VERSIONS, null), maintenant, raison: avis.raison } });
  } catch (error) {
    const message = String(error?.message ?? error).slice(0, 300);
    if (error?.reporte) return { status: 'warn', summary: `Carte reportée — ${message}`, details: { fait: false, reporte: true, erreur: message }, changed: false };
    return { status: 'error', summary: `Carte non calculée : ${message} — rien d’écrit, la passe suivante recommence.`, details: { fait: false, erreur: message }, changed: false };
  }
  const carte = r.carte;
  const id = ecrireLaCarte({ database: db, carte });
  const s = carte.resume;
  const banc = rejeu ? `banc d’essai n° ${rejeu.id}${rejeu.etiquette === 'code-precedent' ? ' (version de code précédente du moteur)' : ''}` : 'sans banc';
  return {
    status: 'ok',
    summary:
      `Carte n° ${id} (${avis.pourquoi}) : ${pluriel(s.cases, 'case', 'cases')} sur ${pluriel(s.championnats, 'championnat', 'championnats')} — ` +
      `${pluriel(s.vertes, 'verte', 'vertes')}, ${pluriel(s.rouges, 'rouge', 'rouges')}, ${pluriel(s.grises, 'grise', 'grises')} ; ${banc} ; ` +
      `direct : ${pluriel(s.direct.mesures, 'pronostic mesuré', 'pronostics mesurés')} sur ${nombre(s.direct.pronostics)} gelés, ${pluriel(carte.kVivant, 'case jugée', 'cases jugées')} (juge à ${nombre(carte.kVivant)} × ${nombre(carte.regards)} regards) ; en ${duree(Date.now() - debut)}. Rien ne change dans les chiffres du moteur.`,
    details: { fait: true, id, raison: avis.raison, resume: s, banc: carte.banc, kVivant: carte.kVivant, regards: carte.regards, dureeMs: Date.now() - debut, calculAPart: { dureeMs: r.dureeMs ?? null, rssFinOctets: r.rssFinOctets ?? null } },
    changed: false
  };
}

/** Due : la règle de carteAFaire, LUE seulement ; une base illisible fait tourner l'étape, qui dira pourquoi. */
function dueCarteOuParier(ctx, options = {}) {
  try {
    return etatDeLaCarte(ctx, options).avis.du;
  } catch {
    return true;
  }
}

const ETAPES = [
  {
    key: 'calendrier',
    label: 'Calendrier et résultats',
    async run(ctx) {
      const from = debutFenetre(ctx.derniere('calendrier'), FENETRE_CALENDRIER);
      const r = await refreshCalendarFromFotMob({ from, days: 45, concurrency: ctx.concurrency });
      const m = r.merge ?? {};
      const res = r.results ?? {};
      const points = [];
      if (r.failures) points.push(`${pluriel(r.failures, 'journée', 'journées')} FotMob en échec sur ${nombre(r.days)}`);
      if (res.conflicts) points.push(`${pluriel(res.conflicts, 'score divergent refusé', 'scores divergents refusés')} (le score connu est gardé)`);
      if (r.mergeError) points.push(`calendrier non fusionné (rien n'est écrit) : ${r.mergeError.slice(0, 200)}`);
      if (r.resultsError) points.push(`résultats non fusionnés : ${r.resultsError.slice(0, 200)}`);
      const toutEnEchec = r.days > 0 && r.failures === r.days;
      return {
        status: toutEnEchec || r.resultsError || r.mergeError ? 'error' : points.length ? 'warn' : 'ok',
        summary:
          `Du ${from} à J+45 : ${pluriel(m.created ?? 0, 'rencontre ajoutée', 'rencontres ajoutées')}, ${pluriel(m.updated ?? 0, 'modifiée', 'modifiées')}${m.moved ? `, ${pluriel(m.moved, 'déplacée', 'déplacées')}` : ''}${m.postponed ? `, ${pluriel(m.postponed, 'reportée', 'reportées')}` : ''} au calendrier ; ` +
          `${pluriel(res.created ?? 0, 'résultat nouveau', 'résultats nouveaux')}` +
          (points.length ? `. ${points.join(' ; ')}.` : '.'),
        details: { from: r.from, to: r.to, days: r.days, failures: r.failures, failedDates: r.failedDates ?? [], matches: r.matches, merge: r.merge, mergeError: r.mergeError ?? null, results: res, resultsError: r.resultsError ?? null },
        // Des journées en échec : le repère n'avance que jusqu'à la première,
        // que la passe suivante relira.
        resumeFrom: r.failedDates?.length ? r.failedDates[0] : undefined,
        changed: Boolean(m.created || m.updated || m.moved || m.removed || m.postponed || res.created || res.updated)
      };
    }
  },
  {
    key: 'classements',
    label: 'Classements officiels',
    async run(ctx) {
      const r = await refreshOfficialStandings({ concurrency: ctx.concurrency });
      const echecs = r.failed ?? [];
      return {
        status: echecs.length && !r.tables ? 'error' : echecs.length ? 'warn' : 'ok',
        summary: `${pluriel(r.leagues, 'compétition', 'compétitions')}, ${pluriel(r.tables, 'table relevée', 'tables relevées')}` +
          (echecs.length ? ` ; ${pluriel(echecs.length, 'compétition en échec', 'compétitions en échec')}.` : '.'),
        details: { leagues: r.leagues, seasons: r.seasons, tables: r.tables, failed: echecs.slice(0, 30), unavailable: (r.unavailable ?? []).slice(0, 30) }
      };
    }
  },
  {
    key: 'nouvelles',
    label: 'Nouvelles rencontres terminées',
    async run(ctx) {
      const from = debutFenetre(ctx.derniere('nouvelles'), FENETRE_RENCONTRES);
      const r = await importMissingFromFotMob({ from, to: iso(new Date()), concurrency: ctx.concurrency });
      ctx.ecrit ||= r.merged > 0;
      const points = [];
      if (r.dayFailures) points.push(`${pluriel(r.dayFailures, 'journée', 'journées')} en échec`);
      if (r.failed) points.push(`${pluriel(r.failed, 'rencontre', 'rencontres')} en échec`);
      return {
        status: r.days && r.dayFailures === r.days ? 'error' : points.length ? 'warn' : 'ok',
        summary: `Depuis le ${from} : ${pluriel(r.created ?? r.merged, 'rencontre nouvelle', 'rencontres nouvelles')}` +
          (r.updated ? `, ${pluriel(r.updated, 'déjà connue complétée', 'déjà connues complétées')}` : '') +
          (r.noStats ? ` (${nombre(r.noStats)} sans feuille)` : '') +
          (points.length ? ` ; ${points.join(', ')}.` : '.'),
        details: { from, days: r.days, dayFailures: r.dayFailures, failedDates: r.failedDates ?? [], discovered: r.discovered, merged: r.merged, created: r.created, updated: r.updated, playersMerged: r.playersMerged, noStats: r.noStats, failed: r.failed },
        resumeFrom: r.failedDates?.length ? [...r.failedDates].sort()[0] : undefined,
        changed: r.merged > 0
      };
    }
  },
  {
    key: 'omissions',
    label: 'Rencontres omises par la liste du jour',
    async run(ctx) {
      const r = await fillFixtureGaps({ scope: 'current', concurrency: ctx.concurrency });
      // Le carnet de santé (étape « carnetSante », plus bas) reprend ce rapport
      // tel quel : ce qui manque encore après l'import, sans requête de plus.
      ctx.omissions = r;
      const imports = Object.entries(r.imports ?? {});
      const importees = imports.reduce((n, [, i]) => n + (i.merged ?? 0), 0);
      const nonImportees = imports.reduce((n, [, i]) => n + (i.failed ?? 0) + (i.notFinished ?? 0) + (i.idReused ?? 0), 0);
      ctx.ecrit ||= importees > 0;
      const echecs = r.failed ?? [];
      return {
        status: echecs.length && echecs.length === r.leagues ? 'error' : echecs.length || nonImportees ? 'warn' : 'ok',
        summary: `${pluriel(r.leagues, 'compétition relue', 'compétitions relues')} : ${pluriel(r.missing?.length ?? 0, 'rencontre manquante', 'rencontres manquantes')}, ${pluriel(importees, 'importée', 'importées')}` +
          (nonImportees ? `, ${nombre(nonImportees)} non importée(s)` : '') +
          (echecs.length ? ` ; ${pluriel(echecs.length, 'compétition en échec', 'compétitions en échec')}.` : '.'),
        details: {
          leagues: r.leagues,
          missing: r.missing?.length ?? 0,
          imported: importees,
          byLeague: Object.fromEntries(imports.map(([l, i]) => [l, { merged: i.merged, failed: i.failed, notFinished: i.notFinished, idReused: i.idReused }])),
          failed: echecs.slice(0, 30)
        },
        changed: importees > 0
      };
    }
  },
  {
    key: 'feuillesTardives',
    label: 'Feuilles publiées en retard',
    due: (ctx) => ctx.manuel || !faitAujourdhui(ctx.derniere('feuillesTardives')),
    async run(ctx) {
      const since = joursAvant(FEUILLES_TARDIVES_JOURS);
      // Redemandées par IDENTIFIANT : la liste du jour omet justement une
      // partie de ces rencontres (celles entrées par l'étape des omissions).
      const aRelire = recentNoSheet({ since });
      if (!aRelire.length) return { status: 'ok', summary: `Aucune rencontre récente sans feuille (depuis le ${since}).`, details: { since, requested: 0 } };
      const parLigue = new Map();
      for (const { fotmobId, league } of aRelire) {
        if (!parLigue.has(league)) parLigue.set(league, []);
        parLigue.get(league).push(fotmobId);
      }
      let obtenues = 0;
      let toujours = 0;
      let echecs = 0;
      for (const [league, ids] of parLigue) {
        const r = await importFotmobIds(ids, { league, concurrency: ctx.concurrency });
        obtenues += r.fetched ?? 0;
        toujours += r.noStats ?? 0;
        echecs += r.failed ?? 0;
      }
      return {
        status: echecs ? 'warn' : 'ok',
        summary:
          `${pluriel(aRelire.length, 'rencontre récente sans feuille redemandée', 'rencontres récentes sans feuille redemandées')} (depuis le ${since}) : ` +
          `${pluriel(obtenues, 'feuille obtenue', 'feuilles obtenues')}, ${nombre(toujours)} toujours sans feuille chez la source` +
          (echecs ? `, ${nombre(echecs)} en échec.` : '.'),
        details: { since, requested: aRelire.length, fetched: obtenues, noStats: toujours, failed: echecs },
        changed: obtenues > 0
      };
    }
  },
  {
    key: 'feuilles',
    label: 'Feuilles de match manquantes',
    async run(ctx) {
      const r = await refreshFromFotMob({ limit: ctx.batchSize, concurrency: ctx.concurrency });
      ctx.ecrit ||= r.merged > 0;
      const points = [];
      if (r.failed) points.push(`${nombre(r.failed)} en échec`);
      if (r.unmatched) points.push(`${nombre(r.unmatched)} introuvable(s) chez la source`);
      if (r.warnings?.length) points.push(r.warnings.join(' ; '));
      return {
        status: points.length ? 'warn' : 'ok',
        // `merged` compte aussi les pages relues SANS feuille (score, journée,
        // compositions) : les feuilles obtenues, ce sont `fetched`.
        summary: `${pluriel(r.considered, 'rencontre à compléter', 'rencontres à compléter')} : ${pluriel(r.fetched ?? 0, 'feuille obtenue', 'feuilles obtenues')}` +
          (r.noStats ? `, ${nombre(r.noStats)} toujours sans feuille chez la source` : '') +
          (r.cancelled ? `, ${nombre(r.cancelled)} annulée(s) retirée(s)` : '') +
          (points.length ? ` ; ${points.join(', ')}.` : '.'),
        changed: (r.fetched ?? 0) > 0 || (r.cancelled ?? 0) > 0,
        details: { considered: r.considered, fetched: r.fetched, merged: r.merged, playersMerged: r.playersMerged, noStats: r.noStats, markedNoSheet: r.markedNoSheet ?? 0, cancelled: r.cancelled, idReused: r.idReused, unmatched: r.unmatched, failed: r.failed, samples: r.samples, warnings: r.warnings ?? [] }
      };
    }
  },
  {
    key: 'annuaires',
    label: "Annuaires d'identités",
    due: () => true,
    async run(ctx) {
      // Demandée par un import de cette passe, ou restée due d'une passe
      // précédente (échec, serveur arrêté entre l'import et la reconstruction).
      const due = takeDeferredRegistryRebuild() || ctx.annuairesDus;
      if (!due) return { status: 'ok', summary: 'Rien de nouveau : annuaires inchangés.', details: {} };
      ctx.annuairesDus = true;
      const b = await reconstruireAnnuaires();
      ctx.annuairesDus = false;
      return {
        status: 'ok',
        summary:
          `Reconstruits en ${String(Math.round((b.ms ?? 0) / 100) / 10).replace('.', ',')} s, à part du serveur${b.teams ? ` : ${nombre(b.teams)} clubs, ${nombre(b.people)} joueurs` : ''}` +
          (b.essais > 1
            ? ` (${nombre(b.essais)} essais : la base était tenue par un autre écrivain, ${secondes(b.attenteVerrouMs)} d'attente)`
            : b.essais === 1
              ? ' (base prise au premier essai)'
              : '') +
          '.',
        details: b
      };
    }
  },
  {
    key: 'reglement',
    label: 'Règlement des pronostics et des paris',
    async run() {
      const r = settlePending({ apply: true });
      const p = r.predictions;
      const b = r.bets;
      const parties = [
        `${pluriel(p.settled, 'pronostic réglé', 'pronostics réglés')}${p.settled ? ` (${nombre(p.correct)} juste(s), ${nombre(p.incorrect)} faux)` : ''}`,
        `${pluriel(b.settled, 'sélection de pari réglée', 'sélections de pari réglées')}${b.settled ? ` (${nombre(b.won)} gagnée(s), ${nombre(b.lost)} perdue(s))` : ''}`
      ];
      if (p.resettled || b.resettled) parties.push(`${nombre(p.resettled + b.resettled)} revu(s) après correction d'un score`);
      const attente = p.pending - p.settled;
      if (attente > 0) parties.push(`${pluriel(attente, 'pronostic attend', 'pronostics attendent')} encore (${nombre(p.noResult)} match(s) pas encore joué(s) ou sans résultat${p.noRule ? `, ${nombre(p.noRule)} sans règle` : ''})`);
      if (r.contradictions.count) parties.push(`${pluriel(r.contradictions.count, 'statut ancien contredit', 'statuts anciens contredisent')} le score final (à vérifier)`);
      if (p.extraTime || b.extraTime) parties.push(`${nombre(p.extraTime + b.extraTime)} décidé(s) après prolongation ou tirs au but, à régler à la main (le score final n'est pas celui des 90 minutes)`);
      return {
        status: r.contradictions.count ? 'warn' : 'ok',
        summary: `${parties.join(' ; ')}.`,
        details: { predictions: p, bets: b, contradictions: { count: r.contradictions.count }, extraTime: r.extraTime, samples: r.samples },
        changed: p.settled + b.settled + p.resettled + b.resettled > 0,
        // Liste complète gardée à part, jusqu'à la passe ou la correction suivante.
        alert: { key: 'contradictions', value: r.contradictions.count ? { ...r.contradictions, updatedAt: new Date().toISOString() } : null }
      };
    }
  },
  {
    key: 'iaAutoAvantMatch',
    label: "Analyse IA automatique — avant-match (d'avance)",
    // Interrupteur pur : contrairement aux étapes "une fois par jour"
    // ci-dessus, `manuel` ne doit JAMAIS forcer cette étape quand elle est
    // désactivée (AUTO_AI_ANALYSIS=false) — c'est le coupe-circuit du quota
    // d'abonnement Claude Code (cf. claudeCodeClient.js).
    due: () => env.autoAiAnalysis.enabled,
    run: (ctx) =>
      passeIaAuto(ctx, {
        lancer: runAutoPreMatchAnalyses,
        usage: (ok, skipped) => ({ preMatch: ok, skippedPreMatch: skipped }),
        candidats: ['rencontre à venir entre 3 h et 48 h sans analyse', 'rencontres à venir entre 3 h et 48 h sans analyse'],
        faits: ['analysée', 'analysées']
      })
  },
  {
    key: 'iaAutoApresMatch',
    label: 'Analyse IA automatique — après-match',
    due: () => env.autoAiAnalysis.enabled,
    run: (ctx) =>
      passeIaAuto(ctx, {
        lancer: runAutoPostMatchReviews,
        usage: (ok, skipped) => ({ postMatch: ok, skippedPostMatch: skipped }),
        candidats: ['rencontre terminée avec analyse avant-match, sans revue', 'rencontres terminées avec analyse avant-match, sans revue'],
        faits: ['revue faite', 'revues faites']
      })
  },
  {
    key: 'controle',
    label: 'Contrôle de cohérence des scores',
    due: (ctx) => ctx.manuel || !faitAujourdhui(ctx.derniere('controle')),
    async run() {
      const since = joursAvant(CONTROLE_JOURS);
      // Processus à part : l'agrégation sur les lignes joueur prend plusieurs
      // secondes, que le serveur ne doit pas passer bloqué.
      const { stdout } = await execFileAsync(process.execPath, [path.join(SERVER_DIR, 'scripts/audit-score-consistency.mjs'), '--since', since], {
        cwd: SERVER_DIR,
        timeout: 5 * 60_000,
        maxBuffer: 16 * 1024 * 1024
      });
      const r = jsonDe(stdout);
      const { samples, ...resume } = r;
      return {
        alert: { key: 'audit', value: r.anomalies ? { ...resume, samples, updatedAt: new Date().toISOString() } : null },
        status: r.anomalies ? 'warn' : 'ok',
        summary: `Depuis le ${since} : ${pluriel(r.matchsAvecStats, 'rencontre contrôlée', 'rencontres contrôlées')}, ${pluriel(r.anomalies, 'anomalie', 'anomalies')}` +
          (r.anomalies ? ` (${Object.entries(r.parType ?? {}).map(([k, v]) => `${k} : ${v}`).join(', ')}). Rien n'est corrigé automatiquement.` : '.'),
        details: resume
      };
    }
  },
  {
    key: 'carnetSante',
    label: 'Contrôles et carnet de santé des données',
    // Étape 12 du plan (06/10/2026) : une fois par jour civil de Paris, comme le
    // contrôle des scores — la première passe après minuit ; un clic la refait
    // (elle ne relit que les rencontres nouvelles, en quelques secondes). La
    // toute première fois (pas encore de carnet), le contrôle complet.
    due: (ctx) => ctx.manuel || !faitAujourdhui(ctx.derniere('carnetSante')),
    run: (ctx) => passeCarnetSante(ctx)
  },
  {
    key: 'cotesPassees',
    label: 'Cotes passées (football-data.co.uk)',
    due: (ctx) => !depuisMoinsDe(ctx.derniere('cotesPassees'), COTES_PASSEES_MS),
    async run() {
      const r = await refreshCurrentOdds({ force: true });
      const points = [];
      if (r.failedFiles?.length) points.push(`${pluriel(r.failedFiles.length, 'fichier en échec', 'fichiers en échec')}`);
      if (r.weakLeagues?.length) points.push(`rattachement faible : ${r.weakLeagues.map((w) => w.league ?? w.code).join(', ')}`);
      return {
        status: r.rows && !r.linked ? 'error' : points.length ? 'warn' : 'ok',
        summary: `${pluriel(r.linked, 'cote rattachée', 'cotes rattachées')} sur ${pluriel(r.rows, 'ligne', 'lignes')}` + (points.length ? ` ; ${points.join(' ; ')}.` : '.'),
        details: r
      };
    }
  },
  {
    key: 'historiqueFd',
    label: 'Historique football-data (depuis 2000)',
    // Étape 13 du plan (06/10/2026) : APRÈS les cotes passées, dont il reprend
    // les fichiers tout juste téléchargés (cache à côté de la base) au lieu de
    // les redemander. Cf. passeHistoriqueFd.
    due: (ctx) => dueHistoriqueFd(ctx),
    run: (ctx) => passeHistoriqueFd(ctx)
  },
  {
    key: 'reperes',
    label: 'Repères de chaque championnat',
    // Étape 15 du plan (07/10/2026) : APRÈS l'historique football-data, dont
    // elle lit les saisons d'avant le magasin. Cf. passeReperes.
    due: (ctx) => dueReperes(ctx),
    run: (ctx) => passeReperes(ctx)
  },
  {
    key: 'tableJourJ',
    label: 'Table du jour J (ce qu’on savait la veille)',
    // Étape 17 du plan (12/10/2026) : APRÈS les repères et avant les cotes
    // gratuites, donc avant la sauvegarde (la copie de la nuit la contient).
    // Cf. passeTableJourJ.
    due: (ctx) => dueTableJourJ(ctx),
    run: (ctx) => passeTableJourJ(ctx)
  },
  {
    key: 'cotesGratuites',
    label: 'Cotes gratuites des matchs à venir (ESPN, football-data, 365Scores, Kalshi, Smarkets)',
    due: () => env.freeOdds.enabled,
    async run(ctx) {
      // Les trois prochains jours à chaque passe ; les quatorze une fois par
      // jour (l'ouverture des matchs lointains bouge peu, inutile d'y revenir
      // toutes les trois heures).
      const longue = ctx.manuel || !faitAujourdhui(readSourceState('freeOdds', 'avenir-14-jours')?.updatedAt ?? null);
      const r = await collectUpcomingOdds({ days: longue ? 14 : 3 });
      const fin = finalizeOdds();
      invalidateFreeMarketOdds();
      const ecrites = r.sources.reduce((n, s) => n + (s.written ?? 0), 0);
      const enEchec = r.sources.filter((s) => s.error || s.status === 'absent');
      const nonResolus = r.sources.reduce((n, s) => n + (s.unresolved ?? 0), 0);
      if (longue) writeSourceState('freeOdds', 'avenir-14-jours', { detail: { fixtures: r.fixtures } });
      return {
        status: enEchec.length === r.sources.length && r.sources.length ? 'error' : enEchec.length ? 'warn' : 'ok',
        summary:
          `${pluriel(r.fixtures, 'rencontre à venir', 'rencontres à venir')} sur ${longue ? '14' : '3'} jours : ` +
          r.sources.map((s) => `${s.nom} ${s.error ? 'en échec' : s.status === 'absent' ? 'absent' : nombre(s.written ?? 0)}`).join(', ') +
          ` cote(s) écrite(s)` +
          (nonResolus ? ` ; ${pluriel(nonResolus, 'nom non reconnu', 'noms non reconnus')}` : '') +
          (fin.matchOddsFilled ? ` ; profilage complété pour ${pluriel(fin.matchOddsFilled, 'rencontre', 'rencontres')}` : '') +
          '.',
        details: { ...r, finalize: fin, longue },
        changed: ecrites > 0,
        // Une source muette ou en panne se voit en haut de l'appli (« à
        // vérifier ») et dans Réglages, jusqu'à la passe qui la retrouve.
        alert: {
          key: 'cotes',
          value: enEchec.length
            ? { sources: enEchec.map((s) => ({ source: s.source, name: s.nom, error: s.error ?? 'connecteur absent' })), updatedAt: new Date().toISOString() }
            : null
        }
      };
    }
  },
  {
    key: 'connaitreMarche',
    label: 'Connaître le marché (justesse, vitesse, biais et marges des bookmakers, meilleur moment pour parier)',
    // Étape 22 du plan (13/10/2026) : APRÈS les cotes gratuites (les clôtures
    // de la veille sont écrites), l'historique football-data et la table du
    // jour J (les résultats à la 90e minute), et AVANT la sauvegarde (la copie
    // de la nuit contient le calcul) ; une fois par jour civil de Paris, ou au
    // clic. Cf. passeConnaitreMarche.
    due: (ctx) => dueConnaitreMarche(ctx),
    run: (ctx) => passeConnaitreMarche(ctx)
  },
  {
    key: 'indiceForce',
    label: 'Indice de force des équipes (corrigé de la force des adversaires)',
    // Étape 29 du plan (14/10/2026) : APRÈS la table du jour J (les faits de la
    // veille, qu'il lit) — juste après « connaitreMarche », sans toucher à
    // l'ordre des étapes d'avant —, AVANT le gel des pronostics (un modèle qui
    // le lira, étape 27, trouvera l'indice du jour) et la sauvegarde (la copie
    // de la nuit le contient) ; une fois par jour civil de Paris, au clic, ou
    // quand il n'est pas à jour. Cf. passeIndiceForce.
    due: (ctx) => dueIndiceForce(ctx),
    run: (ctx) => passeIndiceForce(ctx)
  },
  {
    key: 'forcesButs',
    label: 'Forces de buts des équipes (modèle de buts unique)',
    // Étape 27 du plan (21/10/2026) : APRÈS « indiceForce » (et la table du jour J qu'il lit), sans toucher à
    // l'ordre des étapes d'avant, AVANT le gel des pronostics et la candidate à blanc (ils trouvent les forces de la
    // veille) et la sauvegarde (la copie de la nuit les contient) ; une fois par jour civil de Paris, au clic, quand
    // la passe d'avant l'a reportée, ou quand les forces ne sont pas à jour. Cf. passeForcesButs.
    due: (ctx) => dueForcesButs(ctx),
    run: (ctx) => passeForcesButs(ctx)
  },
  {
    key: 'fichesJoueurs',
    label: 'Fiches des joueurs par poste et équipes habituelles (force du onze)',
    // Étape 30 du plan (22/10/2026) : APRÈS « forcesButs » (et la table du jour J qu'elles lisent), sans toucher à
    // l'ordre des étapes d'avant, AVANT le gel des pronostics et la candidate à blanc (une candidate future trouvera
    // les fiches de la veille) et la sauvegarde (la copie de la nuit les contient) ; une fois par jour civil de Paris,
    // au clic, quand la passe d'avant l'a reportée, ou quand les fiches ne sont pas à jour. Affichage seulement : le
    // moteur ne les lit pas. Cf. passeFichesJoueurs.
    due: (ctx) => dueFichesJoueurs(ctx),
    run: (ctx) => passeFichesJoueurs(ctx)
  },
  {
    key: 'stylesDeJeu',
    label: 'Styles de jeu des équipes et des entraîneurs (explication seulement)',
    // Étape 37 du plan (22/10/2026) : APRÈS « fichesJoueurs », sans toucher à l'ordre des étapes d'avant, AVANT le gel
    // des pronostics et la sauvegarde (la copie de la nuit les contient) ; une fois par jour civil de Paris, au clic,
    // quand la passe d'avant l'a reportée, ou quand les styles ne sont pas à jour. La carte des tirs est relue pour les
    // seules rencontres nouvelles ou changées. Le moteur ne les lit pas. Cf. passeStylesDeJeu.
    due: (ctx) => dueStylesDeJeu(ctx),
    run: (ctx) => passeStylesDeJeu(ctx)
  },
  {
    key: 'gelPronostics',
    label: 'Gel des pronostics du moteur (enregistreurs)',
    // Étape E du plan (correction 7) : une fois par jour civil de Paris — la
    // première passe après minuit, comme la sauvegarde, que la passe soit
    // automatique ou non (un clic ne refait pas les ~370 calculs). Le moteur
    // sur chaque match à venir de la page Matchs, sans repli payant ni
    // Claude ; la première valeur de chaque pronostic n'est jamais réécrite,
    // les suivantes sont des versions datées (engine_picks). Avant la
    // sauvegarde : la copie de la nuit les contient.
    due: (ctx) => Boolean(env.enregistreurs?.enabled) && !faitAujourdhui(ctx.derniere('gelPronostics')),
    async run() {
      const r = await gelerLaNuit({ dansLaPasse: true });
      const points = [];
      if (r.echecs) points.push(`${pluriel(r.echecs, 'match en échec', 'matchs en échec')} (${r.echantillons.join(' ; ')})`);
      if (r.sansIdentifiant) points.push(`${pluriel(r.sansIdentifiant, 'match reconnu par ses noms', 'matchs reconnus par leurs noms')} (club inconnu de l'annuaire)`);
      if (r.erreur) points.push(`écriture en échec : ${r.erreur}`);
      return {
        status: r.erreur || (r.matchs && !r.calcules) ? 'error' : r.echecs ? 'warn' : 'ok',
        summary:
          `${pluriel(r.matchs, 'match à venir', 'matchs à venir')} : ${pluriel(r.pronostics, 'pronostic de marché', 'pronostics de marché')}, ` +
          `${pluriel(r.ecrits, 'version nouvelle gardée', 'versions nouvelles gardées')} (les valeurs inchangées ne sont pas redites)` +
          (points.length ? ` ; ${points.join(' ; ')}.` : '.'),
        details: r,
        // Aucune page n'affiche ces versions (la carte « Enregistreurs » lit
        // sa route) : pas de rechargement de l'interface pour elles.
        changed: false
      };
    }
  },
  {
    key: 'moteurABlanc',
    label: 'Version candidate du moteur, calculée à blanc',
    // Étape 25 du plan (07/10/2026, le socle) : APRÈS le gel (la version en
    // service des mêmes matchs y est gelée) et avant la sauvegarde (la copie
    // de la nuit contient les chiffres à blanc) ; une fois par jour civil de
    // Paris, avec le même interrupteur que les enregistreurs. Sans candidate
    // en essai, l'étape ne fait rien. Cf. passeMoteurABlanc.
    due: (ctx) => dueMoteurABlanc(ctx),
    run: (ctx) => passeMoteurABlanc(ctx)
  },
  {
    key: 'calibrationMensuelle',
    label: 'Calibration : mois écoulé figé, mois en cours préparé (annoncé face au réalisé)',
    // Étape 20 du plan (13/10/2026) : APRÈS le gel et la candidate à blanc
    // (les pronostics de la nuit sont gelés, les résultats de la veille
    // importés en tête de passe) et AVANT la sauvegarde (la copie de la nuit
    // contient le mois figé). Due seulement quand un mois écoulé n'est pas
    // encore figé — le 1er du mois suivant à partir de 6 h (heure de Paris),
    // ou la première passe d'après ; un clic ne refige rien. Étape 24 : due
    // aussi quand le mois en cours n'a pas été préparé aujourd'hui (jour de
    // Paris), ou au clic — la préparation que lisent la route de la
    // calibration et Santé du moteur. Pas d'interrupteur : elle n'écrit
    // qu'une ligne par mois et un petit fichier, sans réseau ni Claude. Cf.
    // passeCalibrationMensuelle.
    due: (ctx) => dueCalibrationMensuelle({}, ctx),
    run: (ctx) => passeCalibrationMensuelle(ctx)
  },
  {
    key: 'carteOuParier',
    label: 'Carte « où parier » : championnat × marché (avantage du moteur jugé)',
    // Étape 23 du plan (22/10/2026) : APRÈS la calibration (les pronostics de
    // la nuit gelés, le mois écoulé figé) et AVANT la sauvegarde (la copie de
    // la nuit contient la carte). Due dès qu'un rejeu du banc existe sans
    // carte, à un nouveau rejeu, à un changement de réglages, le 1er du mois
    // à partir de 6 h ; jamais au simple clic quand une carte existe. Pas
    // d'interrupteur : ni réseau, ni Claude, une ligne par carte. Cf.
    // passeCarteOuParier.
    due: (ctx) => dueCarteOuParier(ctx),
    run: (ctx) => passeCarteOuParier(ctx)
  },
  {
    key: 'sauvegarde',
    label: 'Sauvegarde de la base',
    // Chaque nuit (étape 1 du plan ; avant, une fois par semaine avec
    // SAUVEGARDE_MS) : une fois par jour civil de Paris, comme le contrôle des
    // scores — la première passe après minuit la fait, et une passe qui glisse
    // de 0 h 10 à 2 h 50 ne la repousse pas d'un jour ; serveur éteint la nuit,
    // la première passe du jour. En échec, reprise à la passe suivante. Tout
    // le travail lourd (copie, compression, restauration d'essai) tourne dans
    // des processus à part : le serveur n'attend que leur ligne de bilan.
    due: (ctx) => !faitAujourdhui(ctx.derniere('sauvegarde')),
    // Sauvegarde, rotation, copie hors disque hebdomadaire, restauration
    // d'essai hebdomadaire, bilan et alerte durable : cf.
    // data/sauvegardes/etapeSauvegarde.js.
    run: () => passeSauvegarde()
  },
  {
    key: 'simulationSaisons',
    label: 'Fins de saison et enjeu des rencontres (simulation, à blanc)',
    // Étape 28 du plan (27/10/2026) : juste APRÈS la sauvegarde (l'ordre de l'essai de l'étape 27, du gel à la
    // sauvegarde, ne bouge pas ; une panne ici ne lui coûte rien), AVANT le carnet de l’IA et le contrôle quotidien
    // (toujours dernier). Une fois par jour civil de Paris, ou si la passe d’avant l’a reportée ; jamais au clic ; ni
    // réseau ni Claude. Cf. passeSimulationSaisons.
    due: (ctx) => dueSimulationSaisons(ctx),
    run: (ctx) => passeSimulationSaisons(ctx)
  },
  {
    key: 'simulationMatchs',
    label: 'Déroulé simulé des matchs des 48 prochaines heures (simulation, à blanc)',
    // Étape 28 du plan : juste après les fins de saison, AVANT le carnet de l’IA. Une fois par jour civil de Paris,
    // avec l’interrupteur des enregistreurs (un relevé pour la preuve, comme le gel), ou si la passe d’avant l’a
    // reportée ; jamais aux autres passes ni au clic. Cf. passeSimulationMatchs.
    due: (ctx) => dueSimulationMatchs(ctx),
    run: (ctx) => passeSimulationMatchs(ctx)
  },
  {
    key: 'carnetIA',
    label: "Carnet de l'IA (avis tenus, clôture, marchés où elle n'apporte rien)",
    // Étape 21 du plan (14/10/2026) : APRÈS les résultats (en tête de passe) et
    // les clôtures de la veille (« cotesGratuites ») ; juste après la
    // sauvegarde (le carnet est un fichier de data/runtime, refait en entier
    // chaque fois, pas une table de la base) et avant le contrôle quotidien,
    // toujours dernier. Une fois par jour civil de Paris, ou au clic. Pas
    // d'interrupteur : aucun appel à Claude, ni réseau, ni écriture dans la
    // base. Cf. passeCarnetIA.
    due: (ctx) => ctx.manuel || !faitAujourdhui(ctx.derniere('carnetIA')),
    run: (ctx) => passeCarnetIA(ctx)
  },
  {
    key: 'dossiersIA',
    label: "Mémoire de l'IA (dossiers des équipes et des championnats)",
    // Étape 44 du plan (23/10/2026) : juste APRÈS le carnet de l'IA (ses cas de la nuit sont repris ; une leçon n'entre que
    // confirmée par lui) et AVANT le bulletin, le bilan et le contrôle quotidien (toujours dernier). Une fois par jour civil
    // de Paris, au clic, ou quand le fichier n'a jamais été écrit. Pas d'interrupteur : aucun appel à Claude, ni réseau, ni
    // écriture dans la base. Seules les équipes qui ont joué sont refaites. Cf. passeDossiersIA.
    due: (ctx) => ctx.manuel || !faitAujourdhui(ctx.derniere('dossiersIA')),
    run: (ctx) => passeDossiersIA(ctx)
  },
  {
    key: 'bulletin',
    label: "Bulletin du jour (texte de l'IA, un seul appel par jour)",
    // Étape 42 du plan (22/10/2026) : APRÈS les analyses de match (une panne qu'elles ont vue l'arrête), le règlement, le carnet de l'IA
    // et les cotes du jour, AVANT le contrôle quotidien (toujours dernier). Interrupteur pur comme les étapes d'analyse : AUTO_AI_ANALYSIS=false
    // le coupe, un clic ne le force JAMAIS. Une fois par jour, le matin (pas avant 6 h à Paris) ; rattrapé par la première passe qui suit un arrêt.
    // Cf. passeBulletin.
    due: (ctx) => env.autoAiAnalysis.enabled && dueBulletin(ctx),
    pourquoiPasDue: () => decisionDuBulletin().pourquoi,
    run: (ctx) => passeBulletin(ctx)
  },
  {
    key: 'bilanSemaine',
    label: "Bilan de la semaine (texte de l'IA, un seul appel par semaine)",
    // Étape 42 du plan : à la suite du bulletin, mêmes règles ; une fois par semaine, pour la dernière semaine COMPLÈTE (lundi → dimanche,
    // jours de Paris), à la première passe d'après sa fin. Cf. passeBilanSemaine.
    due: (ctx) => env.autoAiAnalysis.enabled && dueBilanSemaine(ctx),
    pourquoiPasDue: () => decisionDuBilan().pourquoi,
    run: (ctx) => passeBilanSemaine(ctx)
  },
  {
    key: 'controleQuotidien',
    label: 'Contrôle quotidien des données et santé des sources',
    // Étape 14 du plan (07/10/2026) : à CHAQUE passe (pas de `due`), en
    // dernier, après toutes les étapes qui écrivent. Cf. passeControleQuotidien.
    run: (ctx) => passeControleQuotidien(ctx)
  }
];

export const REFRESH_STEPS = ETAPES.map((e) => ({ key: e.key, label: e.label }));

/**
 * Ce que dit une étape « pas due » : par défaut « Pas due à cette passe. » ; une étape peut dire POURQUOI (`pourquoiPasDue`,
 * étape 42 : « le bulletin du 22/10 est déjà écrit », « pas avant 6 h », « essais épuisés »…). Ne lève jamais.
 */
function pourquoiPasDue(etape, ctx) {
  try {
    return etape.pourquoiPasDue?.(ctx) || 'Pas due à cette passe.';
  } catch {
    return 'Pas due à cette passe.';
  }
}

function issue(etapes) {
  const faites = etapes.filter((e) => e.status !== 'skipped');
  if (!faites.length) return 'ok';
  if (faites.every((e) => e.status === 'error')) return 'error';
  return faites.some((e) => e.status === 'error' || e.status === 'warn') ? 'partial' : 'ok';
}

async function runOnce(reason) {
  const { batchSize, concurrency } = env.matchStatsRefresh;
  const manuel = reason === 'manuel';
  try {
    const passe = await withRefreshLock(async () => {
      const statut = readRefreshStatus();
      const ctx = {
        reason,
        manuel,
        batchSize,
        concurrency,
        ecrit: false,
        annuairesDus: Boolean(statut.registryRebuildPending),
        derniere: (cle) => statut.stepsLastSuccess?.[cle] ?? null,
        // Étape 27 : ce qu'a dit une étape à la dernière passe où elle a tourné (« reportée » ?).
        derniersDetails: (cle) => (statut.history ?? []).map((p) => p?.steps?.find((e) => e?.key === cle && e.status !== 'skipped')).find(Boolean)?.details ?? null
      };
      const startedAt = new Date().toISOString();
      markRunning({ reason, steps: ETAPES.length });
      deferRegistryRebuilds(true);
      const etapes = [];
      try {
        for (const [index, etape] of ETAPES.entries()) {
          if (etape.due && !etape.due(ctx)) {
            etapes.push({ key: etape.key, label: etape.label, status: 'skipped', summary: pourquoiPasDue(etape, ctx), durationMs: 0 });
            continue;
          }
          markStep({ key: etape.key, label: etape.label, index: index + 1 });
          const debut = Date.now();
          try {
            const r = await etape.run(ctx);
            etapes.push({ key: etape.key, label: etape.label, ...r, durationMs: Date.now() - debut });
          } catch (error) {
            console.error(`[actualisation] ${etape.label} en échec : ${error.message}`);
            etapes.push({ key: etape.key, label: etape.label, status: 'error', summary: `En échec : ${String(error.message).slice(0, 300)}`, durationMs: Date.now() - debut });
          }
        }
      } finally {
        deferRegistryRebuilds(false);
        // Une étape d'après les annuaires (ou la passe elle-même) a planté
        // alors qu'une reconstruction restait due : elle n'attend pas la
        // passe suivante.
        if (takeDeferredRegistryRebuild() || ctx.annuairesDus) {
          ctx.annuairesDus = true;
          await reconstruireAnnuaires()
            .then(() => {
              ctx.annuairesDus = false;
            })
            .catch((error) => console.error(`[actualisation] annuaires non reconstruits, repris à la passe suivante : ${error.message}`));
        }
      }
      const finishedAt = new Date().toISOString();
      const bilan = {
        id: startedAt,
        reason,
        startedAt,
        finishedAt,
        durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
        outcome: issue(etapes),
        steps: etapes
      };
      recordPass(bilan, { registryRebuildPending: ctx.annuairesDus });
      return bilan;
    }, { stamp: false });

    if (passe.skipped) {
      console.log(`[actualisation] passe ${reason} reportée : ${passe.skipped}.`);
      return { skipped: passe.skipped };
    }
    const aSignaler = passe.steps.filter((e) => e.status === 'warn' || e.status === 'error');
    console.log(
      `[actualisation] passe ${reason} ${passe.outcome === 'ok' ? 'réussie' : passe.outcome === 'partial' ? 'faite avec des points à regarder' : 'en échec'} ` +
        `en ${Math.round(passe.durationMs / 1000)} s` +
        (aSignaler.length ? ` — ${aSignaler.map((e) => `${e.label} : ${e.summary}`).join(' | ')}` : '.')
    );
    return passe;
  } catch (error) {
    // Une panne ne doit pas faire tomber l'API : la passe suivante réessaiera.
    console.error(`[actualisation] passe ${reason} en échec : ${error.message}`);
    return { error: error.message };
  }
}

function planifier(delaiMs, reason) {
  clearTimeout(timer);
  prochainePasse = new Date(Date.now() + delaiMs).toISOString();
  timer = setTimeout(async () => {
    await runOnce(reason);
    // Étape 23 : le banc du mois, APRÈS la passe (verrou rendu), seulement s'il est dû (rejeuDuServeur.js) ; il
    // tourne ensuite seul, sous le verrou « banc » et le jeton du calcul lourd. Ne lève jamais.
    const banc = relancerLeBancDuMoisSiBesoin();
    if (banc.lance) console.log(`[banc du mois] lancé : ${banc.raison}.`);
    planifier(env.matchStatsRefresh.intervalMinutes * 60_000, 'périodique');
  }, delaiMs);
  // Le minuteur ne doit pas retenir le processus à l'arrêt.
  timer.unref?.();
}

function pidVivant(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** Démarre la boucle. Sans effet si elle tourne déjà ou si elle est désactivée. */
export function startMatchStatsAutoRefresh() {
  const { enabled, intervalMinutes, startupDelayMinutes } = env.matchStatsRefresh;
  // Une passe notée « en cours » par un serveur arrêté au milieu ne l'est plus.
  clearStaleRunning(pidVivant);
  if (!enabled || timer) return false;
  planifier(startupDelayMinutes * 60_000, 'au démarrage');
  console.log(`[actualisation] complète toutes les ${intervalMinutes} min (première passe dans ${startupDelayMinutes} min, avec rattrapage depuis la dernière passe réussie).`);
  return true;
}

/** Une passe tout de suite, sous le verrou : ce qu'appelle la route HTTP. */
export function refreshNow() {
  return runOnce('manuel');
}

/** Heure de la prochaine passe automatique, ou null si la boucle est arrêtée. */
export function nextRefreshAt() {
  return timer ? prochainePasse : null;
}

export function stopMatchStatsAutoRefresh() {
  clearTimeout(timer);
  timer = null;
  prochainePasse = null;
}

export { RUNTIME_DIR as REFRESH_RUNTIME_DIR };
