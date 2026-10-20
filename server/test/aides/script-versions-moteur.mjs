/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-versions-moteur.mjs <serveur de la copie> <phase> [manifeste de l'échantillon]
 *
 * Étape 25 du plan — LES VERSIONS DU MOTEUR, avec de VRAIS calculs du moteur sur la base d'essai (douze
 * matchs de l'échantillon, des cotes et sans), dans le data/runtime de la copie (jamais celui du bac ni du
 * dépôt). Réseau coupé, heure figée, aucun Claude. Phases :
 *   cycle        premier démarrage (version 1, chiffres inchangés), second démarrage (rien de réécrit),
 *                réglages enregistrés par la route (versions 2 et 3, ce qui a changé, même enregistrement =
 *                pas de version), retour arrière par la route (refus sans `depuis`, avec un `depuis` périmé,
 *                double clic ; chiffres EXACTEMENT ceux d'avant), valeurs par défaut = reprise de la 1,
 *                pendant une passe (verrou d'un autre processus, passe de ce processus) : refusé ;
 *   code-avant / code-apres   le code du moteur change entre deux démarrages : une version « code »,
 *                le retour arrière refusé (autre code) ;
 *   illisible    registre abîmé : jamais réécrit, réglages refusés (503), calculs « sans version » ;
 *   hors-appli   réglages modifiés à la main pendant que le serveur tourne : notés par le serveur, jamais
 *                des réglages d'essai ;
 *   lecteur      un autre processus (pas le serveur) ne fait que lire ;
 *   journal      le journal des pronostics : la version gardée, les entrées d'avant jamais réécrites ;
 *   ia           l'analyse IA (Claude SIMULÉ) : la version dans engineSnapshot, jamais dans le message ;
 *   gel          les pronostics gelés : version et distribution complète, les lignes d'avant intactes.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur, requeteExpress, photo, matchsDuCalendrier, moteurDe, sansVersion } from './versionsMoteurCommun.mjs';
import { recopierScripts } from './claudeSimule.mjs';

const [serveur, phase, fichierManifeste] = process.argv.slice(2);
const imp = importeur(serveur);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const FICHIER_CONFIG = path.join(RUNTIME, 'engine-config.json');
const FICHIER_VERSIONS = path.join(RUNTIME, 'engine-versions.json');
const FICHIER_VERROU = path.join(RUNTIME, 'espn-refresh.lock');

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const V = await imp('core/engine/engineVersions.js');
const C = await imp('core/engine/engineConfig.js');
// Le registre que le code lit et écrit est celui de la COPIE, jamais un autre.
if (path.resolve(V.FICHIER_VERSIONS).toLowerCase() !== path.resolve(FICHIER_VERSIONS).toLowerCase()) throw new Error(`Registre inattendu : ${V.FICHIER_VERSIONS}`);

const lire = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const s = { ok: true, phase };
// L'application importe l'actualisation, qui importe un script du serveur : recopié dans la copie seulement.
recopierScripts(serveur);
const { createApp } = await imp('app.js');
const app = createApp();
const requete = (methode, url, corps) => requeteExpress(app, methode, url, corps);

/** Douze matchs de l'échantillon (un sur seize), présentés comme des matchs du calendrier, avec leur cote passée quand ils en ont une. */
async function ciblesDeLEchantillon() {
  const { adaptSeasonCalendarMatch } = await imp('data/adapters/seasonCalendarAdapter.js');
  const manifeste = lire(fichierManifeste);
  const lireMatch = database.prepare(`SELECT m.match_key, m.date, m.league, m.home_name, m.away_name, json_extract(m.meta, '$.round') AS round,
                                             o.source AS osource, o.basis, o.home AS o1, o.draw AS ox, o.away AS o2
                                      FROM matches m LEFT JOIN match_odds o ON o.match_key = m.match_key WHERE m.match_key = ?`);
  const choisies = manifeste.cibles.filter((_, i) => i % 16 === 0).slice(0, 12);
  return choisies.map((c) => {
    const r = lireMatch.get(c.cle);
    const base = adaptSeasonCalendarMatch({ homeName: r.home_name, awayName: r.away_name, date: r.date, league: r.league, round: r.round ?? null }, 10000);
    if (![r.o1, r.ox, r.o2].every((x) => Number.isFinite(x) && x > 1)) return base;
    return {
      ...base,
      hasOdds: true,
      oddsSource: 'gratuit',
      marketOdds: {
        odds1: r.o1,
        oddsDraw: r.ox,
        odds2: r.o2,
        bookmakersCount: 1,
        byBookmaker: [{ key: `${r.osource}-${r.basis}`.toLowerCase().replace(/[^a-z0-9]+/g, '_'), title: `${r.basis} · ${r.osource}`, odds1: r.o1, oddsDraw: r.ox, odds2: r.o2, referenceOnly: true, source: r.osource }],
        source: 'gratuit'
      }
    };
  });
}

/** Le moteur sur chaque cible, avec les réglages EN SERVICE à cet instant : les DTO complets. */
async function analyser(cibles) {
  const sortie = [];
  for (const m of cibles) sortie.push(await moteurDe(imp, m));
  return sortie;
}
const memesChiffres = (a, b) => JSON.stringify(a.map(sansVersion)) === JSON.stringify(b.map(sansVersion));
const versionsDe = (dtos) => [...new Set(dtos.map((d) => d.engineVersion))];
const resumeRegistre = () => {
  const r = lire(FICHIER_VERSIONS);
  return {
    enService: r.enService,
    pile: r.pile,
    versions: r.versions.map((v) => ({ numero: v.numero, origine: v.origine, depuis: v.depuis, changements: v.changements, fichiers: Object.keys(v.code.fichiers).length })),
    journal: (r.journal ?? []).map((j) => ({ action: j.action, version: j.version, depuis: j.depuis ?? null, origine: j.origine ?? null }))
  };
};
const etatFichiers = () => ({ config: photo(FICHIER_CONFIG), versions: photo(FICHIER_VERSIONS) });

if (phase === 'cycle') {
  const cibles = await ciblesDeLEchantillon();
  s.cibles = { total: cibles.length, avecCotes: cibles.filter((m) => m.hasOdds).length };
  // 0. Avant toute version : ni registre, ni réglages écrits ; les calculs sont « sans version ».
  s.avant = { registre: fs.existsSync(FICHIER_VERSIONS), config: fs.existsSync(FICHIER_CONFIG) };
  const a0 = await analyser(cibles);
  s.avant.versions = versionsDe(a0);

  // 1. Premier démarrage : la version 1 = l'état du moteur, rien de changé.
  const d1 = V.demarrerVersions();
  s.demarrage1 = { numero: d1.versions.numero, change: d1.versions.change, nouvelle: d1.versions.nouvelle, origine: d1.versions.origine, candidate: d1.candidate, probleme: d1.probleme, config: fs.existsSync(FICHIER_CONFIG) };
  const reg1 = lire(FICHIER_VERSIONS);
  s.registre1 = { ...resumeRegistre(), reglagesParDefaut: JSON.stringify(reg1.versions[0].reglages.football) === JSON.stringify(C.DEFAULT_ENGINE_CONFIG_BY_SPORT.football), code: reg1.versions[0].code.empreinte, codeDuProcessus: V.empreinteDuCode().empreinte };
  const a1 = await analyser(cibles);
  s.apresDemarrage = { versions: versionsDe(a1), memesChiffres: memesChiffres(a0, a1) };

  // 2. Second démarrage : rien de réécrit.
  const avant2 = etatFichiers();
  const d2 = V.demarrerVersions();
  s.demarrage2 = { numero: d2.versions.numero, change: d2.versions.change, intact: JSON.stringify(etatFichiers()) === JSON.stringify(avant2) };

  // 3. Réglages enregistrés par la route (Réglages › Paramètres du moteur) : la version 2, avec ce qui a changé.
  const put1 = await requete('PUT', '/api/config', { defaultCorrelation: -0.15 });
  s.put1 = { code: put1.code, version: put1.corps?.version ?? null, rho: put1.corps?.config?.defaultCorrelation ?? null };
  const a2 = await analyser(cibles);
  s.apresV2 = { versions: versionsDe(a2), changes: a2.filter((d, i) => JSON.stringify(sansVersion(d)) !== JSON.stringify(sansVersion(a1[i]))).length };
  // 4. Le même enregistrement : aucune version de plus, le registre n'est pas réécrit.
  const avant4 = photo(FICHIER_VERSIONS);
  const put2 = await requete('PUT', '/api/config', { defaultCorrelation: -0.15 });
  s.put2 = { code: put2.code, version: put2.corps?.version ?? null, registreIntact: photo(FICHIER_VERSIONS) === avant4 };
  // 5. Deux réglages de plus (seuil et bookmakers) : la version 3.
  const put3 = await requete('PUT', '/api/config', { edgeThresholdMin: 0.03, valueBookmakers: ['williamhill', 'betsson', 'codere_it'] });
  s.put3 = { code: put3.code, version: put3.corps?.version ?? null };
  const a3 = await analyser(cibles);
  s.apresV3 = { versions: versionsDe(a3) };
  // 6. Ce que lit la carte.
  const get3 = await requete('GET', '/api/config/versions');
  s.get3 = { code: get3.code, corps: get3.corps };

  // 7. Le retour arrière : refusé sans `depuis`, avec un `depuis` périmé ; puis fait.
  const avant7 = etatFichiers();
  const r400 = await requete('POST', '/api/config/versions/retour', {});
  const r409 = await requete('POST', '/api/config/versions/retour', { depuis: 2 });
  s.refus7 = { sansDepuis: { code: r400.code, erreur: r400.corps?.error }, perime: { code: r409.code, raison: r409.corps?.raison, erreur: r409.corps?.error }, intact: JSON.stringify(etatFichiers()) === JSON.stringify(avant7) };
  const r1 = await requete('POST', '/api/config/versions/retour', { depuis: 3 });
  s.retour1 = { code: r1.code, de: r1.corps?.de, vers: r1.corps?.vers, changements: r1.corps?.changements, rho: r1.corps?.config?.defaultCorrelation, edge: r1.corps?.config?.edgeThresholdMin, bookmakers: r1.corps?.config?.valueBookmakers, enServiceRendu: r1.corps?.versions?.enService?.numero ?? null };
  const a4 = await analyser(cibles);
  s.retour1Exact = JSON.stringify(a4) === JSON.stringify(a2);
  s.retour1Versions = versionsDe(a4);
  // Le double clic : la version vue (3) n'est plus en service — rien ne bouge.
  const avantDouble = etatFichiers();
  const rDouble = await requete('POST', '/api/config/versions/retour', { depuis: 3 });
  s.doubleClic = { code: rDouble.code, raison: rDouble.corps?.raison, intact: JSON.stringify(etatFichiers()) === JSON.stringify(avantDouble) };

  // 8. Encore un retour : la version 1, exactement les chiffres du premier démarrage (et ceux d'avant les versions).
  const r2 = await requete('POST', '/api/config/versions/retour', { depuis: 2 });
  s.retour2 = { code: r2.code, de: r2.corps?.de, vers: r2.corps?.vers };
  const a5 = await analyser(cibles);
  s.retour2Exact = JSON.stringify(a5) === JSON.stringify(a1);
  s.retour2CommeAvantLesVersions = memesChiffres(a5, a0);
  s.configApresRetour2 = JSON.stringify(lire(FICHIER_CONFIG).football) === JSON.stringify(C.DEFAULT_ENGINE_CONFIG_BY_SPORT.football);
  // 9. Plus rien avant la 1.
  const avant9 = etatFichiers();
  const r3 = await requete('POST', '/api/config/versions/retour', { depuis: 1 });
  s.retour3 = { code: r3.code, raison: r3.corps?.raison, intact: JSON.stringify(etatFichiers()) === JSON.stringify(avant9) };
  const get9 = await requete('GET', '/api/config/versions');
  s.get9 = { retour: get9.corps?.retour, enService: get9.corps?.enService?.numero, precedentes: get9.corps?.precedentes?.map((v) => ({ numero: v.numero, dansLaPile: v.dansLaPile })) };

  // 10. Des réglages déjà vus reprennent leur numéro ; les valeurs par défaut, celui de la 1.
  const put4 = await requete('PUT', '/api/config', { defaultCorrelation: -0.15 });
  s.put4 = { code: put4.code, version: put4.corps?.version ?? null };
  const reset = await requete('POST', '/api/config/reset');
  s.reset = { code: reset.code, version: reset.corps?.version ?? null };
  const put5 = await requete('PUT', '/api/config', { defaultCorrelation: -0.15 });
  s.put5 = { code: put5.code, version: put5.corps?.version ?? null };

  // 11. Pendant une passe d'actualisation ou un import (le verrou d'un autre processus vivant) : refusé, rien ne bouge.
  const maintenant = new Date().toISOString();
  fs.writeFileSync(FICHIER_VERROU, JSON.stringify({ pid: process.pid, token: 'essai-25', startedAt: maintenant, heartbeatAt: maintenant }));
  const avant11 = etatFichiers();
  const rVerrou = await requete('POST', '/api/config/versions/retour', { depuis: 2 });
  const getVerrou = await requete('GET', '/api/config/versions');
  s.pendantLaPasse = { code: rVerrou.code, raison: rVerrou.corps?.raison, erreur: rVerrou.corps?.error, intact: JSON.stringify(etatFichiers()) === JSON.stringify(avant11), carte: getVerrou.corps?.retour };
  fs.rmSync(FICHIER_VERROU, { force: true });
  // … et pendant une passe de CE processus (withRefreshLock) : refusé aussi.
  const { withRefreshLock } = await imp('data/providers/refreshLock.js');
  s.dansLaPasse = await withRefreshLock(async () => {
    try {
      V.revenirALaVersionPrecedente({ depuis: 2 });
      return 'fait';
    } catch (error) {
      return { raison: error.raison, statut: error.statut };
    }
  }, { stamp: false });
  s.apresLaPasse = { intact: JSON.stringify(etatFichiers()) === JSON.stringify(avant11) };
  // 12. La passe finie : le retour se fait.
  const r12 = await requete('POST', '/api/config/versions/retour', { depuis: 2 });
  s.apresVerrou = { code: r12.code, de: r12.corps?.de, vers: r12.corps?.vers };
  s.registreFinal = resumeRegistre();
  s.configFinale = lire(FICHIER_CONFIG).football;
} else if (phase === 'code-avant' || phase === 'code-apres') {
  const [m] = await matchsDuCalendrier(imp);
  const d = V.demarrerVersions();
  s.demarrage = { numero: d.versions.numero, change: d.versions.change, nouvelle: d.versions.nouvelle, origine: d.versions.origine };
  if (phase === 'code-avant') {
    const put = await requete('PUT', '/api/config', { defaultCorrelation: -0.15 });
    s.put = { code: put.code, numero: put.corps?.version?.numero };
  }
  const dto = await moteurDe(imp, m);
  s.dto = dto;
  s.code = V.empreinteDuCode().empreinte;
  s.registre = resumeRegistre();
  const get = await requete('GET', '/api/config/versions');
  s.carte = { retour: get.corps?.retour, enService: get.corps?.enService };
  if (phase === 'code-apres') {
    const avant = etatFichiers();
    const r = await requete('POST', '/api/config/versions/retour', { depuis: s.registre.enService });
    s.retour = { code: r.code, raison: r.corps?.raison, erreur: r.corps?.error, intact: JSON.stringify(etatFichiers()) === JSON.stringify(avant) };
    // Les réglages de la version 1 avec le NOUVEAU code : aucune version n'est cet état (la 1 avait l'ancien code).
    const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
    const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
    const { getTiltState } = await imp('core/engine/tiltState.js');
    const { getSport } = await imp('sports/index.js');
    const enrichi = await enrichMatchWithRealAverages(m, { sansRepliPayant: true });
    s.reglagesDeLaV1 = (await analyzeMatch(enrichi, { ...C.DEFAULT_ENGINE_CONFIG_BY_SPORT.football }, getTiltState(), getSport('football'))).engineVersion;
  }
} else if (phase === 'premier-reglage') {
  // Des réglages enregistrés avant tout démarrage avec les versions (registre absent) : la version 1 est l'état
  // d'AVANT l'enregistrement, la 2 celui d'après.
  const put = await requete('PUT', '/api/config', { defaultCorrelation: -0.15 });
  s.put = { code: put.code, version: put.corps?.version ?? null };
  s.registre = resumeRegistre();
  s.v1ParDefaut = JSON.stringify(lire(FICHIER_VERSIONS).versions[0].reglages.football) === JSON.stringify(C.DEFAULT_ENGINE_CONFIG_BY_SPORT.football);
} else if (phase === 'illisible') {
  // Un registre de FORME inattendue (lu d'un coup, refusé sans attendre) pour les routes ; puis TRONQUÉ (relu
  // ~1,5 s par utils/atomicJson.js avant d'être dit illisible) pour le démarrage et le calcul du moteur.
  const [m] = await matchsDuCalendrier(imp);
  const avant = etatFichiers();
  const d = V.demarrerVersions();
  s.demarrage = { source: d.versions.source, probleme: d.versions.probleme, intact: JSON.stringify(etatFichiers()) === JSON.stringify(avant) };
  s.version = (await moteurDe(imp, m)).engineVersion;
  const put = await requete('PUT', '/api/config', { defaultCorrelation: -0.15 });
  const reset = await requete('POST', '/api/config/reset');
  const get = await requete('GET', '/api/config/versions');
  const retour = await requete('POST', '/api/config/versions/retour', { depuis: 1 });
  s.routes = {
    put: { code: put.code, erreur: put.corps?.error },
    reset: { code: reset.code },
    get: { code: get.code, source: get.corps?.source, probleme: get.corps?.probleme, retour: get.corps?.retour, enService: get.corps?.enService },
    retour: { code: retour.code, raison: retour.corps?.raison }
  };
  s.intact = JSON.stringify(etatFichiers()) === JSON.stringify(avant);
  s.configAbsente = !fs.existsSync(FICHIER_CONFIG);
  fs.writeFileSync(FICHIER_VERSIONS, '{"format":1,"versions":[{"numero":1');
  const avantTronque = etatFichiers();
  // Comme un serveur neuf : ni lecture en cache, ni tentative récente de noter (la minute d’attente entre deux
  // tentatives ne masque donc rien) — le calcul ne doit pas attendre le registre pour autant.
  V.__testing.oublier();
  const debut = performance.now();
  const d2 = V.demarrerVersions();
  s.tronque = { source: d2.versions.source, probleme: d2.versions.probleme, demarrageMs: Math.round(performance.now() - debut) };
  const debutCalcul = performance.now();
  s.tronque.version = (await moteurDe(imp, m)).engineVersion;
  s.tronque.calculMs = Math.round(performance.now() - debutCalcul);
  s.tronque.intact = JSON.stringify(etatFichiers()) === JSON.stringify(avantTronque);
} else if (phase === 'hors-appli') {
  const [m] = await matchsDuCalendrier(imp);
  V.demarrerVersions();
  s.v1 = (await moteurDe(imp, m)).engineVersion;
  // Le fichier des réglages modifié à la main pendant que le serveur tourne (relu à la date de modification).
  const config = { football: { ...C.DEFAULT_ENGINE_CONFIG_BY_SPORT.football, defaultCorrelation: -0.1 } };
  fs.writeFileSync(FICHIER_CONFIG, JSON.stringify(config, null, 2));
  const t = new Date(Date.now() + 5000);
  fs.utimesSync(FICHIER_CONFIG, t, t);
  s.v2 = (await moteurDe(imp, m)).engineVersion;
  s.registre = resumeRegistre();
  // Des réglages d'ESSAI (un autre objet, une candidate) : jamais notés, « sans version ».
  const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
  const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
  const { getTiltState } = await imp('core/engine/tiltState.js');
  const { getSport } = await imp('sports/index.js');
  const enrichi = await enrichMatchWithRealAverages(m, { sansRepliPayant: true });
  const avant = photo(FICHIER_VERSIONS);
  const essai = await analyzeMatch(enrichi, { ...C.getEngineConfig('football'), defaultCorrelation: -0.2 }, getTiltState(), getSport('football'));
  const commeLaV1 = await analyzeMatch(enrichi, { ...C.DEFAULT_ENGINE_CONFIG_BY_SPORT.football }, getTiltState(), getSport('football'));
  s.essai = { version: essai.engineVersion, registreIntact: photo(FICHIER_VERSIONS) === avant };
  s.commeLaV1 = commeLaV1.engineVersion;
} else if (phase === 'lecteur') {
  // Un autre processus que le serveur (aucun demarrerVersions) : il lit, il n'écrit jamais.
  const [m] = await matchsDuCalendrier(imp);
  s.lu = (await moteurDe(imp, m)).engineVersion;
  const config = { football: { ...C.DEFAULT_ENGINE_CONFIG_BY_SPORT.football, defaultCorrelation: -0.12 } };
  fs.writeFileSync(FICHIER_CONFIG, JSON.stringify(config, null, 2));
  const t = new Date(Date.now() + 10_000);
  fs.utimesSync(FICHIER_CONFIG, t, t);
  const avant = photo(FICHIER_VERSIONS);
  s.inconnu = (await moteurDe(imp, m)).engineVersion;
  s.registreIntact = photo(FICHIER_VERSIONS) === avant;
  s.ecrivain = V.__testing.estEcrivain();
} else if (phase === 'journal') {
  V.demarrerVersions();
  const avant = lire(path.join(RUNTIME, 'predictions.json'));
  const entree = (matchId, market, extra = {}) => ({ matchId, homeName: 'A', awayName: 'B', league: 'EPL', market, predictedOutcome: 'home', predictedLabel: 'A gagne', predictedOdds: 1.9, action: null, edgePercent: 0, commenceTime: '2026-10-06T18:00:00.000Z', marketId: 'result', params: { outcome: 'home' }, ...extra });
  const p1 = await requete('POST', '/api/predictions', { entries: [entree('nouveau-1', 'Résultat', { engineVersion: 1 }), entree('nouveau-2', 'Résultat'), entree('nouveau-3', 'Résultat', { engineVersion: 'deux' }), entree('ancien-2', 'Résultat', { engineVersion: 1, predictedOdds: 2.05 })] });
  s.p1 = { code: p1.code };
  const apres1 = lire(path.join(RUNTIME, 'predictions.json'));
  const parId = (log, id) => log.find((e) => e.matchId === id) ?? null;
  s.nouveau = { avecVersion: parId(apres1, 'nouveau-1')?.engineVersion ?? 'absent', sansVersion: 'engineVersion' in (parId(apres1, 'nouveau-2') ?? {}), versionIllisible: 'engineVersion' in (parId(apres1, 'nouveau-3') ?? {}) };
  s.ancienRescanne = { version: parId(apres1, 'ancien-2')?.engineVersion ?? 'absent', cote: parId(apres1, 'ancien-2')?.predictedOdds };
  s.anciensIntacts = ['ancien-1', 'ancien-3'].every((id) => JSON.stringify(parId(apres1, id)) === JSON.stringify(parId(avant, id)));
  s.anciensSansVersion = ['ancien-1', 'ancien-3'].every((id) => !('engineVersion' in parId(apres1, id)));
  // Un rescan SANS version (une interface pas encore rechargée) : l'ancien numéro ne colle plus aux chiffres, il est retiré.
  await requete('POST', '/api/predictions', { entries: [entree('nouveau-1', 'Résultat', { predictedOdds: 1.7 })] });
  const apres2 = lire(path.join(RUNTIME, 'predictions.json'));
  s.rescanSansVersion = 'engineVersion' in parId(apres2, 'nouveau-1');
  const get = await requete('GET', '/api/predictions');
  s.route = { code: get.code, versions: Object.fromEntries((get.corps?.entries ?? []).map((e) => [e.matchId, e.engineVersion ?? null])) };
} else if (phase === 'ia') {
  const { installerClaudeSimule } = await import('./claudeSimule.mjs');
  const { installerFauxFetch, listeDuJour } = await import('./fotmobSimule.mjs');
  installerFauxFetch({ listes: { 20261005: listeDuJour([]), 20261006: listeDuJour([]) } });
  const messages = [];
  const claude = await installerClaudeSimule(serveur, { tokens: () => 20_000 });
  const cc = await imp('core/ai/claudeCodeClient.js');
  // Le Claude simulé garde chaque message reçu (pour vérifier ce que l'IA lit).
  cc.__testing.simulerClaude(async ({ userMessage }) => {
    messages.push(userMessage);
    return { is_error: false, structured_output: { summary: 'Analyse simulée.', keyFactors: [], marketViews: [], marketReviews: [], caveats: 'simulée' }, usage: { input_tokens: 2, output_tokens: 100 }, total_cost_usd: 0 };
  });
  V.demarrerVersions();
  const [, , m3] = await matchsDuCalendrier(imp);
  const moteur = await moteurDe(imp, m3);
  s.versionDuMoteur = moteur.engineVersion;
  const service = await imp('core/ai/matchAiAnalysisService.js');
  const ident = { matchId: 'essai-ia-25', home: m3.home, away: m3.away, league: m3.league };
  // La composition passée telle quelle (aucune relecture FotMob) : l'essai va plus vite, rien d'autre ne change.
  const joueur = (id, name) => ({ id, name, stats: null });
  const compo = {
    source: 'FotMob',
    fotmobMatchId: '4900025',
    fetchedAt: '2026-10-05T12:00:00.000Z',
    minutesBeforeKickoff: 40,
    home: { team: m3.home, teamId: null, teamMatches: 0, startXI: [joueur('fotmob-1', 'Joueur 1')], bench: [], unavailable: [], usualStartersMissing: [] },
    away: { team: m3.away, teamId: null, teamMatches: 0, startXI: [joueur('fotmob-2', 'Joueur 2')], bench: [], unavailable: [], usualStartersMissing: [] }
  };
  // Le message de l'avant-match ne dépend du moteur que par son RÉSUMÉ : avec ou sans numéro, le même résumé.
  const { curateEngineSummary } = service.__testing;
  s.resumeIdentique = JSON.stringify(curateEngineSummary(moteur)) === JSON.stringify(curateEngineSummary(sansVersion(moteur)));
  for (const fiche of ['compacte', 'ancienne']) {
    const avec = await service.preparerAnalyseAvantMatch({ ...ident, engineResult: moteur, sansRepliPayant: true, lineups: compo, fiche });
    s[`avant-${fiche}`] = { version: /engineVersion|version du moteur/i.test(avec.userMessage), forme: avec.forme };
  }
  const entree = await service.runPreMatchAnalysis({ ...ident, engineResult: moteur, sansRepliPayant: true, lineups: compo, appel: { type: 'avance' } });
  s.snapshot = { version: entree.engineSnapshot?.engineVersion ?? 'absent', cles: Object.keys(entree.engineSnapshot ?? {}) };
  s.messageEnvoye = { nombre: messages.length, version: messages.some((t) => /engineVersion/.test(t)) };
  // La revue d'après-match : le résumé gardé porte la version, le message de l'IA jamais (les deux fiches).
  for (const fiche of ['compacte', 'ancienne']) {
    const prior = { ...entree };
    const avec = service.preparerRevueApresMatch({ prior, result: { homeGoals: 2, awayGoals: 1 }, fiche });
    const sans = service.preparerRevueApresMatch({ prior: { ...prior, engineSnapshot: sansVersion(prior.engineSnapshot) }, result: { homeGoals: 2, awayGoals: 1 }, fiche });
    s[`revue-${fiche}`] = { identique: avec.userMessage === sans.userMessage, version: /engineVersion/.test(avec.userMessage) };
  }
  claude.arreter();
} else if (phase === 'gel') {
  const gel = await imp('data/enregistreurs/gelPronostics.js');
  const { pronosticsGeles } = await imp('data/enregistreurs/depot.js');
  const [m1, m2, m3] = await matchsDuCalendrier(imp);
  // Des lignes gelées AVANT l'étape 25 (sans version ni distribution) : celles d'un serveur d'avant, pour M1.
  const { clubDuMagasin } = await imp('data/db/oddsProfileRead.js');
  const h1 = clubDuMagasin(m1.home, m1.league, database);
  const a1 = clubDuMagasin(m1.away, m1.league, database);
  const cle1 = gel.cleDuMatch({ homeId: h1, awayId: a1, date: '2026-10-06' });
  const ancienne = database.prepare(`INSERT INTO engine_picks (fixture_key, market_key, version, recorded_at, origin, match_id, league, date, kickoff, home_name, away_name, home_id, away_id,
      market_id, market, params, choice, label, probability, predicted_odds, market_odds, min_odds, odds_source, odds_at, lineup_state, lineup_at, engine_hash)
    VALUES (?, ?, 1, '2026-10-04T23:30:00.000Z', 'nuit', ?, ?, '2026-10-06', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1.2, 'aucune cote (modèle de buts)', NULL, 'inconnue (non relue)', NULL, 'ancienne000000')`);
  ancienne.run(cle1, 'result', m1.matchId, m1.league, m1.home, m1.away, h1, a1, 'result', 'Résultat', '{"outcome":"home"}', 'home', `${m1.home} gagne`, 0.4762, 2.1);
  ancienne.run(cle1, 'totalGoals', m1.matchId, m1.league, m1.home, m1.away, h1, a1, 'totalGoals', 'Total buts', '{"line":1.5,"side":"over"}', 'over', 'Plus de 1.5 buts', 0.7143, 1.4);
  const toutes = () => database.prepare('SELECT * FROM engine_picks ORDER BY fixture_key, market_key, version').all().map((r) => ({ ...r }));
  const avant = toutes();
  s.anciennes = avant.length;
  // La mise en service : la version 1, puis le gel de la nuit.
  V.demarrerVersions();
  s.g1 = await gel.gelerLaNuit({ maintenant: Date.parse('2026-10-05T12:00:00.000Z'), matchs: [m1, m2, m3], dansLaPasse: true, database });
  const apres1 = toutes();
  s.anciennesIntactes = avant.every((r) => JSON.stringify(apres1.find((x) => x.fixture_key === r.fixture_key && x.market_key === r.market_key && x.version === r.version)) === JSON.stringify(r));
  const nouvelles = apres1.filter((r) => !avant.some((x) => x.fixture_key === r.fixture_key && x.market_key === r.market_key && x.version === r.version));
  s.nouvelles = nouvelles.map((r) => ({ cle: r.fixture_key, marche: r.market_key, marketId: r.market_id, version: r.version, engineVersion: r.engine_version, choix: r.choice, params: r.params, cote: r.predicted_odds, probabilite: r.probability, distribution: r.distribution ? JSON.parse(r.distribution) : null }));
  s.revisionsM1 = nouvelles.filter((r) => r.fixture_key === cle1).map((r) => ({ marche: r.market_key, version: r.version }));
  // Regelé sans changement : rien.
  s.g2 = await gel.gelerLaNuit({ maintenant: Date.parse('2026-10-05T13:00:00.000Z'), matchs: [m1, m2, m3], dansLaPasse: true, database });
  // Une nouvelle version du moteur (réglages enregistrés) : chaque pronostic reçoit une révision qui porte la version 2.
  await requete('PUT', '/api/config', { defaultCorrelation: -0.15 });
  s.g3 = await gel.gelerLaNuit({ maintenant: Date.parse('2026-10-05T14:00:00.000Z'), matchs: [m1, m2, m3], dansLaPasse: true, database });
  const apres3 = toutes();
  s.versionsApresG3 = [...new Set(apres3.filter((r) => r.recorded_at === '2026-10-05T14:00:00.000Z').map((r) => r.engine_version))];
  s.anciennesToujoursIntactes = avant.every((r) => JSON.stringify(apres3.find((x) => x.fixture_key === r.fixture_key && x.market_key === r.market_key && x.version === r.version)) === JSON.stringify(r));
  s.premieresIntactes = apres1.filter((r) => r.version === 1).every((r) => JSON.stringify(apres3.find((x) => x.fixture_key === r.fixture_key && x.market_key === r.market_key && x.version === 1)) === JSON.stringify(r));
  s.lecture = pronosticsGeles(cle1, { database }).map((r) => ({ marche: r.marketKey, version: r.version, engineVersion: r.engineVersion, distribution: r.distribution !== null }));
} else if (phase === 'etats') {
  // Les réponses de GET /api/config/versions que la carte de Réglages doit savoir dessiner, toutes calculées par le
  // VRAI serveur (la route, etatDesVersions), dans cette copie.
  const etat = async () => (await requete('GET', '/api/config/versions')).corps;
  const e = {};
  e.absent = await etat();
  V.demarrerVersions();
  e.premier = await etat();
  await requete('PUT', '/api/config', { defaultCorrelation: -0.15 });
  await requete('PUT', '/api/config', { edgeThresholdMin: 0.03, valueBookmakers: ['williamhill', 'betsson', 'codere_it'] });
  e.troisVersions = await etat();
  // Une candidate (fabriquée : le code n'en déclare aucune) telle que la carte la lit, et une candidate fautive.
  const candidate = { id: 'essai-rho-015', etape: '27', quoi: 'Corrélation Dixon-Coles à −0,15 (candidate d’essai)', modifications: { football: { defaultCorrelation: -0.15 } }, marches: ['totalGoals', 'bothTeamsScore'] };
  e.avecCandidate = V.etatDesVersions({ candidate });
  e.candidateFautive = V.etatDesVersions({ candidate: { ...candidate, marches: ['buteurs'] } });
  // Une passe en cours (le verrou d'un autre processus vivant).
  const maintenant = new Date().toISOString();
  fs.writeFileSync(FICHIER_VERROU, JSON.stringify({ pid: process.pid, token: 'essai-25', startedAt: maintenant, heartbeatAt: maintenant }));
  e.passeEnCours = await etat();
  fs.rmSync(FICHIER_VERROU, { force: true });
  // Le code du moteur change (une mise à jour de l'appli), noté comme au démarrage : plus de retour arrière d'un clic.
  fs.appendFileSync(path.join(serveur, 'src', 'core', 'engine', 'valueFinder.js'), '\n// essai de l’étape 25 : un commentaire de plus\n');
  V.empreinteDuCode({ rafraichir: true });
  V.synchroniserVersions();
  e.codeDifferent = await etat();
  // Le registre abîmé.
  fs.writeFileSync(FICHIER_VERSIONS, '{"format":1,"versions":[');
  e.illisible = await etat();
  s.etats = e;
} else {
  throw new Error(`Phase inconnue : ${phase}`);
}

console.log(JSON.stringify(s));
