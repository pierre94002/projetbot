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
 *    9. contrôle de cohérence des scores (une fois par jour) ;
 *   10. cotes passées football-data (toutes les douze heures) ;
 *   11. sauvegarde de la base (une fois par semaine, deux copies gardées).
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
import { settlePending } from '../data/providers/settlementService.js';
import { recentNoSheet } from '../data/db/matchStatsDb.js';
import { markRunning, markStep, recordPass, readRefreshStatus, clearStaleRunning } from '../data/repositories/refreshStatusRepository.js';
import { runAutoPreMatchAnalyses, runAutoPostMatchReviews } from '../core/ai/autoMatchAiTrigger.js';
import { budgetRestant, enregistrerUsage } from '../data/repositories/autoAiAnalysisRepository.js';
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
const SAUVEGARDE_MS = 7 * JOUR_MS;

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
 * personne d'autre n'écrit pendant ce temps. Les caches de noms du serveur
 * sont vidés ensuite, pour qu'il relise les annuaires neufs.
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
  const restant = budgetRestant(jour, plafond);
  if (restant === 0) {
    return { status: 'ok', summary: `Plafond quotidien (${plafond}) atteint : rien lancé à cette passe, reprise demain.`, details: { plafond } };
  }

  const r = await lancer({ limit: restant });
  if (r.nonConfigure) {
    return { status: 'warn', summary: 'Claude Code non configuré (CLAUDE_CODE_OAUTH_TOKEN absent de server/.env) : rien analysé.', details: {} };
  }

  // Interrompue par des pannes en série : ce qui reste n'a pas été écarté par
  // le plafond, la passe suivante le reprendra.
  const skipped = r.interrompu ? 0 : Math.max(0, r.candidates - r.ok - r.failed);
  if (r.ok || r.failed) enregistrerUsage(jour, usage(r.ok, skipped));
  ctx.ecrit ||= r.ok > 0;
  return {
    status: r.interrompu && !r.ok ? 'error' : r.failed ? 'warn' : 'ok',
    summary:
      `${pluriel(r.candidates, ...candidats)} : ${pluriel(r.ok, ...faits)}` +
      (r.failed ? `, ${pluriel(r.failed, 'échec', 'échecs')}` : '') +
      (r.interrompu ? " — arrêt après plusieurs pannes de Claude Code d'affilée (quota, jeton ou réseau), reprise à la passe suivante" : '') +
      (skipped ? `, ${nombre(skipped)} laissée(s) pour demain (plafond du jour)` : '') +
      '.',
    details: { candidates: r.candidates, ok: r.ok, failed: r.failed, skipped, interrompu: r.interrompu, samples: r.samples },
    changed: r.ok > 0
  };
}

/**
 * Les étapes. `due(ctx)` dit si l'étape tourne à cette passe (les autres
 * sont notées « non due »), `run(ctx)` rend { status, summary, details }.
 * status : 'ok', 'warn' (fait, avec des points à regarder), 'error'.
 */
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
          `Du ${from} à J+45 : ${pluriel(m.created ?? 0, 'rencontre ajoutée', 'rencontres ajoutées')}, ${pluriel(m.updated ?? 0, 'modifiée', 'modifiées')}${m.moved ? `, ${pluriel(m.moved, 'déplacée', 'déplacées')}` : ''} au calendrier ; ` +
          `${pluriel(res.created ?? 0, 'résultat nouveau', 'résultats nouveaux')}` +
          (points.length ? `. ${points.join(' ; ')}.` : '.'),
        details: { from: r.from, to: r.to, days: r.days, failures: r.failures, failedDates: r.failedDates ?? [], matches: r.matches, merge: r.merge, mergeError: r.mergeError ?? null, results: res, resultsError: r.resultsError ?? null },
        // Des journées en échec : le repère n'avance que jusqu'à la première,
        // que la passe suivante relira.
        resumeFrom: r.failedDates?.length ? r.failedDates[0] : undefined,
        changed: Boolean(m.created || m.updated || m.moved || m.removed || res.created || res.updated)
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
        summary: `Reconstruits en ${String(Math.round((b.ms ?? 0) / 100) / 10).replace('.', ',')} s, à part du serveur${b.teams ? ` : ${nombre(b.teams)} clubs, ${nombre(b.people)} joueurs` : ''}.`,
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
    label: 'Analyse IA automatique — avant-match',
    // Interrupteur pur : contrairement aux étapes "une fois par jour"
    // ci-dessus, `manuel` ne doit JAMAIS forcer cette étape quand elle est
    // désactivée (AUTO_AI_ANALYSIS=false) — c'est le coupe-circuit du quota
    // d'abonnement Claude Code (cf. claudeCodeClient.js).
    due: () => env.autoAiAnalysis.enabled,
    run: (ctx) =>
      passeIaAuto(ctx, {
        lancer: runAutoPreMatchAnalyses,
        usage: (ok, skipped) => ({ preMatch: ok, skippedPreMatch: skipped }),
        candidats: ['rencontre à venir sous 48 h sans analyse', 'rencontres à venir sous 48 h sans analyse'],
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
    key: 'sauvegarde',
    label: 'Sauvegarde de la base',
    due: (ctx) => !depuisMoinsDe(ctx.derniere('sauvegarde'), SAUVEGARDE_MS),
    async run() {
      const { stdout } = await execFileAsync(process.execPath, [path.join(SERVER_DIR, 'scripts/backup-db.mjs'), '--keep', '2'], {
        cwd: SERVER_DIR,
        timeout: 30 * 60_000,
        maxBuffer: 1024 * 1024
      });
      const r = jsonDe(stdout);
      if (!r.ok) return { status: 'error', summary: `Sauvegarde non faite : ${r.reason}.`, details: r };
      return {
        status: 'ok',
        summary: `Copie de ${(r.bytes / 1024 ** 3).toFixed(2).replace('.', ',')} Go en ${Math.round(r.durationMs / 1000)} s (${path.basename(r.file)}) ; ${pluriel(r.kept.length, 'copie automatique gardée', 'copies automatiques gardées')}.`,
        details: r
      };
    }
  }
];

export const REFRESH_STEPS = ETAPES.map((e) => ({ key: e.key, label: e.label }));

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
        derniere: (cle) => statut.stepsLastSuccess?.[cle] ?? null
      };
      const startedAt = new Date().toISOString();
      markRunning({ reason, steps: ETAPES.length });
      deferRegistryRebuilds(true);
      const etapes = [];
      try {
        for (const [index, etape] of ETAPES.entries()) {
          if (etape.due && !etape.due(ctx)) {
            etapes.push({ key: etape.key, label: etape.label, status: 'skipped', summary: 'Pas due à cette passe.', durationMs: 0 });
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
