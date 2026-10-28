/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-boucle-circuit.mjs <serveur de la copie> <phase>
 *
 * Étape 26, partie B — LA CORRECTION FACTICE : le circuit complet de la boucle de correction, heure figée, matchs
 * fabriqués, une phase par sous-processus (son heure à elle), sur une copie isolée SANS la candidate du code
 * (sansCandidateDuCode) dont les réglages portent le modèle de buts de l'étape 27 : c'est l'état « après l'adoption
 * de la 27 et la mise à jour qui suit son verdict » (R1 est reporté au lot 2 : dans l'appli d'aujourd'hui, la 27
 * occupe la place et rien de ceci ne part — relaisEtape27.test.mjs le prouve). Tout est le VRAI code : l'étape de la
 * passe (calibration, boucle de correction), les routes /api/corrections et /api/config/versions, le banc dans son
 * processus à part (son rejeu de l'historique seul est fabriqué : test/aides/rejeuFabriqueCorrection.mjs), la nuit à
 * blanc et le juge de l'essai, l'adoption et le retour arrière de l'étape 25, les registres de la COPIE.
 * Les phases (leur heure figée est dans le test) :
 *   preparer     version 1 ; octobre → décembre 2026 : 360 matchs par mois et leurs pronostics gelés (version 1),
 *                exactement réalisés SAUF « les deux équipes marquent » annoncé 10 points trop haut (deux groupes de
 *                matchs, favori « oui » et favori « non » : la confiance, elle, reste juste) ;
 *   tri          la calibration fige les trois mois, puis la boucle les trie dans l'ordre (octobre « trop tôt ») et
 *                propose depuis DÉCEMBRE seulement : ρ −0,05 → −0,02 ; rien d'écrit ailleurs ; réglages intacts ;
 *   banc         refusé pendant un calcul lourd et pendant une passe (rien de compté) ; puis le banc au clic : la
 *                correction comptée AVANT le fork, l'enfant, « mesurée » ;
 *   accepter     une passe n'accepte rien toute seule ; « Mettre à l'essai » ; le double clic refusé ;
 *   nuit-1       la place est libre : la correction passe à blanc (proposerUneCandidate, origine correction-mensuelle) ;
 *   essai        900 matchs joués fabriqués et leurs lignes à blanc (la correction fait mieux), forces de buts à jour :
 *                la nuit juge à l'horizon (800 matchs, 21 jours) ; la boucle note « jugée », n'adopte rien ;
 *   adopter      le bouton de l'étape 25 (POST /api/config/versions/adopter) ; la boucle note « adoptée » ;
 *   retrait      le retour arrière de l'étape 25 ; la boucle note « retirée » ;
 *   negatifs-1…5 et orphelins : refus du formulaire, refus avant le banc (jamais compté), deux bancs (le second voit
 *                deux corrections comptées), la file servie dans l'ordre, refus à blanc (place libérée, aucune reprise
 *                après un changement de version), périmée, jugée « pas prouvé » (rejetée, place libérée), banc
 *                interrompu (de retour « à mesurer »), mise à l'essai interrompue (reprise).
 *   reprise-echec, reprise (vérification finale, constat 3 ; une copie à part, après « preparer ») : une erreur à
 *                l'étape « propositions » garde l'étape due tant que son alerte est levée ; la passe suivante refait les
 *                propositions sur le dernier tri rangé et lève l'alerte ; une reprise de trop ne crée aucun doublon.
 * Sortie : une ligne JSON par phase.
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur, requeteExpress, photo } from './versionsMoteurCommun.mjs';
import { recopierScripts } from './claudeSimule.mjs';

const [serveur, phase] = process.argv.slice(2);
const imp = importeur(serveur);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const FICHIER_CONFIG = path.join(RUNTIME, 'engine-config.json');
const FICHIER_VERSIONS = path.join(RUNTIME, 'engine-versions.json');
const FICHIER_MESURE = path.join(RUNTIME, 'registre-mesure.json');
const FICHIER_VERROU = path.join(RUNTIME, 'espn-refresh.lock');

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const V = await imp('core/engine/engineVersions.js');
const T = await imp('bench/trialsRegistry.js');
if (V.CANDIDATE_EN_ESSAI !== null) throw new Error('La copie doit être SANS la candidate du code (sansCandidateDuCode).');
if (path.resolve(V.FICHIER_VERSIONS).toLowerCase() !== path.resolve(FICHIER_VERSIONS).toLowerCase()) throw new Error(`Registre inattendu : ${V.FICHIER_VERSIONS}`);
if (path.resolve(T.FICHIER_REGISTRE).toLowerCase() !== path.resolve(FICHIER_MESURE).toLowerCase()) throw new Error(`Registre de la mesure inattendu : ${T.FICHIER_REGISTRE}`);
recopierScripts(serveur);
const { createApp } = await imp('app.js');
const app = createApp();
const requete = (methode, url, corps) => requeteExpress(app, methode, url, corps);
const job = await imp('jobs/matchStatsAutoRefresh.js');
const D = await imp('data/correction/depotCorrections.js');
const B = await imp('data/correction/bancDesCorrections.js');
const P = await imp('data/correction/propositions.js');
const E = await imp('data/correction/etatDesCorrections.js');
const { calculerABlanc } = await imp('data/enregistreurs/moteurABlanc.js');
const { ecrirePronosticsABlanc } = await imp('data/enregistreurs/depot.js');
const { lireReglagesDuMoteur } = await imp('core/engine/engineConfig.js');
const { commencerCalculLourd, calculLourdEnCours } = await imp('utils/calculLourd.js');
const { tacheEnCours } = await imp('data/providers/refreshLock.js');
const GM = await imp('core/engine/goalModel.js');
const F = await imp('data/db/forcesButs.js');

// Le rejeu de l'historique du banc, fabriqué (la base d'essai n'a pas football-data 2019-2023) : l'enfant le charge.
B.__testing.simulerLeRejeu(path.join(process.env.CM_TEST_MODULES, 'test', 'aides', 'rejeuFabriqueCorrection.mjs'));

const s = { ok: true, phase, maintenant: new Date().toISOString() };
const lire = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const photos = () => ({ config: photo(FICHIER_CONFIG), versions: photo(FICHIER_VERSIONS), mesure: photo(FICHIER_MESURE) });
const CTX = { manuel: false, derniere: () => null, derniersDetails: () => null };
// Vérification finale, constat 3 : la passe RANGÉE comme la vraie (recordPass, refresh-status.json de la copie) et le
// contexte de la vraie passe (runOnce : ce qu'a dit une étape à la dernière passe où elle a tourné).
const RS = await imp('data/repositories/refreshStatusRepository.js');
const BOUCLE = await imp('data/correction/boucle.js');
const ctxDeLaPasse = () => {
  const statut = RS.readRefreshStatus();
  return { ...CTX, derniersDetails: (cle) => (statut.history ?? []).map((p) => p?.steps?.find((e) => e?.key === cle && e.status !== 'skipped')).find(Boolean)?.details ?? null };
};
const rangerLaPasse = (r) => {
  const t = new Date().toISOString();
  RS.recordPass({ id: t, reason: 'essai', startedAt: t, finishedAt: t, durationMs: 0, outcome: r.status === 'error' ? 'error' : 'ok', steps: [{ key: 'boucleCorrection', label: 'Boucle de correction', ...r, durationMs: 0 }] });
};
const resumeDeLaPasse = (r) => ({ status: r.status, summary: r.summary, alert: r.alert, tris: r.details.tris.map((t) => t.mois), creees: r.details.propositions.creees, refaites: r.details.propositions.refaites ?? null, ecartees: r.details.propositions.ecartees.map((e) => e.raison), erreurs: r.details.erreurs });
const passe = async () => {
  const r = await job.__testing.passeBoucleCorrection(CTX);
  return { status: r.status, summary: r.summary, alert: r.alert, tris: r.details.tris.map((t) => ({ mois: t.mois, ecrit: t.ecrit, statuts: t.statuts, vraisDefauts: t.vraisDefauts })), creees: r.details.propositions.creees, ecartees: r.details.propositions.ecartees, synchro: r.details.synchro, miseALEssai: r.details.miseALEssai, orphelins: r.details.orphelins, place: r.details.place, erreurs: r.details.erreurs, avertissements: r.details.avertissements };
};
const propositions = () => D.lireLesPropositions({ database }).map((p) => ({ id: p.id, source: p.source, etat: p.etat, levier: p.levier, avant: p.avant, apres: p.apres, triMois: p.triMois, rangFile: p.rangFile, versionAdoptee: p.versionAdoptee, banc: p.banc ? { verdict: p.banc.verdict, variantes: p.banc.variantes, erreur: p.banc.erreur, serveur: p.banc.serveur, enfant: p.banc.enfant, matchs: p.banc.matchs, gainPct: p.banc.gainPct } : null, essai: p.essai }));
const uneProposition = (id) => propositions().find((p) => p.id === id) ?? null;
const journal = () => D.lireLeJournal({ database, limite: 200 }).reverse().map((e) => ({ n: e.n, evenement: e.evenement, proposition: e.proposition, source: e.source, phrase: e.phrase }));
const variantes26 = () => T.variantesDe('26').map((v) => [v.id, v.ou]);
const registre = () => {
  const r = lire(FICHIER_VERSIONS);
  return { enService: r.enService, pile: r.pile, versions: r.versions.map((v) => [v.numero, v.origine]), candidate: r.candidate ? { id: r.candidate.id, origine: r.candidate.origine, essai: r.candidate.essai, jugement: r.candidate.jugement ? { verdict: r.candidate.jugement.verdict, matchs: r.candidate.jugement.matchs, parFamille: Object.fromEntries(Object.entries(r.candidate.jugement.parFamille ?? {}).map(([k, x]) => [k, x?.verdict])), surete: Object.fromEntries(Object.entries(r.candidate.jugement.surete ?? {}).map(([k, x]) => [k, x?.verdict])) } : null, rho: r.candidate.declaration?.modifications?.football?.modeleDeButs?.rho ?? null, cles: Object.keys(r.candidate.declaration?.modifications?.football?.modeleDeButs ?? {}).sort() } : null, passees: (r.candidatesPassees ?? []).map((c) => [c.id, c.fin, c.version ?? null]), journal: (r.journal ?? []).map((e) => [e.action, e.version, e.depuis ?? null]) };
};
/** Attend la fin du banc de correction en cours (l'enfant), au plus ~3 min. */
async function attendreLeBanc() {
  for (let i = 0; i < 1800 && B.bancDeCorrectionEnCours(); i++) await new Promise((fin) => setTimeout(fin, 100));
  return B.bancDeCorrectionEnCours() === null;
}
const verrouDUnAutreProcessus = () => {
  const t = new Date().toISOString();
  fs.writeFileSync(FICHIER_VERROU, JSON.stringify({ pid: process.pid, token: 'essai-26-b', startedAt: t, heartbeatAt: t }));
};
const idDe = (levier, etats = null) => D.lireLesPropositions({ database }).filter((p) => p.levier === levier && (!etats || etats.includes(p.etat))).map((p) => p.id).at(-1) ?? null;

// ------------------------------------------------------------ les matchs fabriqués

const groupe = (liste) => liste.flatMap(([score, n]) => Array(n).fill(score.split('-').map(Number)));
// Deux groupes de 90 scores : « les deux marquent » 63 fois (groupe P, favori « oui ») ou 27 fois (groupe Q, favori « non »).
const SCORES_P = groupe([['1-1', 15], ['2-1', 14], ['1-2', 10], ['2-2', 8], ['3-1', 8], ['1-3', 4], ['3-2', 4], ['1-0', 9], ['0-1', 6], ['2-0', 6], ['0-0', 4], ['0-2', 2]]);
const SCORES_Q = groupe([['1-1', 12], ['2-1', 8], ['1-2', 7], ['0-0', 16], ['1-0', 18], ['0-1', 14], ['2-0', 9], ['0-2', 6]]);
if (SCORES_P.length !== 90 || SCORES_Q.length !== 90) throw new Error('groupes faux');
const part = (liste, garder) => liste.filter(garder).length / 90;
const res = ([h, a]) => (h > a ? 'home' : h === a ? 'draw' : 'away');
function frequences(scores) {
  return {
    home: part(scores, (x) => res(x) === 'home'),
    draw: part(scores, (x) => res(x) === 'draw'),
    away: part(scores, (x) => res(x) === 'away'),
    plus25: part(scores, ([h, a]) => h + a > 2.5),
    oui: part(scores, ([h, a]) => h > 0 && a > 0),
    dom05: part(scores, ([h]) => h > 0.5),
    ext05: part(scores, ([, a]) => a > 0.5),
    combine: Object.fromEntries(['home', 'draw', 'away'].flatMap((r) => ['Over', 'Under'].map((t) => [`${r}${t}`, part(scores, (x) => res(x) === r && (x[0] + x[1] > 2.5) === (t === 'Over'))])))
  };
}
const FREQ = { P: frequences(SCORES_P), Q: frequences(SCORES_Q) };
const p4 = (x) => Number(x.toFixed(4));
const ou = (p) => ({ over: p4(p), under: p4(1 - p) });
/** Les distributions gelées d'un groupe ; `decalages` : écarts posés sur les issues de référence (« oui », « plus de »…). */
function distributions(g, { oui = 0, plus = 0, equipe = 0, combine = 0 } = {}, provenance = 'cotes-plusmoins-xg') {
  const f = FREQ[g];
  const pv = provenance ? { provenance } : {};
  const c = { ...f.combine };
  if (combine) {
    for (const r of ['home', 'draw', 'away']) {
      const transfert = Math.min(c[`${r}Under`], combine * (c[`${r}Under`] + c[`${r}Over`]));
      c[`${r}Over`] += transfert;
      c[`${r}Under`] -= transfert;
    }
  }
  return {
    result: { issues: { home: p4(f.home), draw: p4(f.draw), away: p4(f.away) } },
    totalGoals: { ligne: 2.5, issues: ou(f.plus25 + plus), ...pv },
    bothTeamsScore: { issues: { yes: p4(f.oui + oui), no: p4(1 - f.oui - oui) }, ...pv },
    'teamGoals:home': { equipe: 'home', ligne: 0.5, issues: ou(f.dom05 + equipe), ...pv },
    'teamGoals:away': { equipe: 'away', ligne: 0.5, issues: ou(f.ext05 + equipe), ...pv },
    resultAndTotal: { ligne: 2.5, issues: Object.fromEntries(Object.entries(c).map(([k, p]) => [k, p4(p)])), ...pv }
  };
}
const MARCHES = [
  { marketKey: 'result', marketId: 'result', market: 'Résultat' },
  { marketKey: 'totalGoals', marketId: 'totalGoals', market: 'Total buts' },
  { marketKey: 'bothTeamsScore', marketId: 'bothTeamsScore', market: 'Les 2 équipes marquent' },
  { marketKey: 'teamGoals:home', marketId: 'teamGoals', market: 'Buts — Dom' },
  { marketKey: 'teamGoals:away', marketId: 'teamGoals', market: 'Buts — Ext' },
  { marketKey: 'resultAndTotal', marketId: 'resultAndTotal', market: 'Résultat + Total buts' }
];
const meilleure = (issues) => Object.entries(issues).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0];
const jourPlus = (jour, n) => new Date(Date.parse(`${jour}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);
const insMatch = database.prepare(`INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, home_goals, away_goals, updated_at, meta)
                                   VALUES (?, ?, ?, 'Ligue Essai 26 B', ?, ?, ?, ?, ?, ?, '2027-03-01T00:00:00.000Z', ?)`);

/** Les pronostics gelés d'un mois : 360 matchs (90 P, 90 Q, 90 P, 90 Q), « oui » annoncé 10 points trop haut. */
function planterLeMois(mois, jours, premierNumero) {
  const COLONNES = ['fixture_key', 'market_key', 'version', 'recorded_at', 'origin', 'match_id', 'league', 'date', 'kickoff', 'home_name', 'away_name', 'home_id', 'away_id', 'market_id', 'market', 'params', 'choice', 'label', 'probability', 'predicted_odds', 'engine_version', 'distribution', 'odds_source'];
  const insPick = database.prepare(`INSERT INTO engine_picks (${COLONNES.join(', ')}) VALUES (${COLONNES.map(() => '?').join(', ')})`);
  for (let i = 0; i < 360; i++) {
    const n = premierNumero + i;
    const g = Math.floor(i / 90) % 2 === 0 ? 'P' : 'Q';
    const [h, a] = (g === 'P' ? SCORES_P : SCORES_Q)[i % 90];
    const date = `${mois}-${String(1 + Math.floor((i * jours) / 360)).padStart(2, '0')}`;
    const home = String(700000 + n);
    const away = String(750000 + n);
    const kickoff = `${date}T15:00:00.000Z`;
    insMatch.run(`c26b-${n}`, `c26b-${n}`, date, `Dom ${n}`, `Ext ${n}`, home, away, h, a, JSON.stringify({ kickoff }));
    const d = distributions(g, { oui: 0.1 });
    for (const m of MARCHES) {
      const [choix, p] = meilleure(d[m.marketKey].issues);
      insPick.run(`fotmob:${home}|${away}|${date}`, m.marketKey, 1, `${jourPlus(date, -1)}T05:00:00.000Z`, 'nuit', `c26bm-${n}`, 'Ligue Essai 26 B', date, kickoff, `Dom ${n}`, `Ext ${n}`, home, away, m.marketId, m.market, '{}', choix, choix, p, Number((1 / p).toFixed(2)), 1, JSON.stringify(d[m.marketKey]), 'cotes gratuites : ESPN');
    }
  }
}

/**
 * L'ESSAI À BLANC fabriqué d'une correction : `n` matchs joués du `premier` jour (au magasin de la copie) et leurs
 * lignes à blanc (5 marchés de buts), écrites par le dépôt comme la nuit. `meilleure` : la correction annonce les
 * fréquences exactes de son groupe et la version en service des fréquences décalées (elle fait mieux) ; sinon les deux
 * se valent (un écart minuscule qui change de sens d'un match à l'autre : « pas prouvé »).
 */
function planterLEssai({ candidate, premier, jours, n, prefixe, meilleure: mieux }) {
  const reg = lire(FICHIER_VERSIONS).candidate;
  if (reg?.id !== candidate) throw new Error(`la candidate du registre n’est pas ${candidate}`);
  const lignes = [];
  for (let i = 0; i < n; i++) {
    const g = Math.floor(i / 90) % 2 === 0 ? 'P' : 'Q';
    const [h, a] = (g === 'P' ? SCORES_P : SCORES_Q)[i % 90];
    const date = jourPlus(premier, i % jours);
    const home = `fotmob-${prefixe}1${String(i).padStart(5, '0')}`;
    const away = `fotmob-${prefixe}2${String(i).padStart(5, '0')}`;
    const kickoff = `${date}T18:00:00.000Z`;
    insMatch.run(`${prefixe}-${i}`, `${prefixe}-${i}`, date, `Essai Dom ${i}`, `Essai Ext ${i}`, home, away, h, a, JSON.stringify({ kickoff }));
    const db = distributions(g, {}, 'cotes-plusmoins-xg');
    const signe = i % 2 === 0 ? 1 : -1;
    const da = mieux ? distributions(g, { oui: 0.1, plus: 0.08, equipe: 0.06, combine: 0.08 }, null) : distributions(g, { oui: 0.002 * signe, plus: 0.002 * signe, equipe: 0.002 * signe, combine: 0.002 * (signe > 0 ? 1 : 0) }, null);
    for (const m of MARCHES.filter((x) => x.marketId !== 'result')) {
      const [cb, pb] = meilleure(db[m.marketKey].issues);
      const [ca, pa] = meilleure(da[m.marketKey].issues);
      const params = m.marketId === 'bothTeamsScore' ? (c) => ({ outcome: c }) : m.marketId === 'resultAndTotal' ? (c) => ({ key: c, line: 2.5 }) : m.marketId === 'totalGoals' ? (c) => ({ line: 2.5, side: c }) : (c) => ({ line: 0.5, side: c, team: m.marketKey.endsWith('home') ? 'home' : 'away' });
      const trie = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort(([x], [y]) => (x < y ? -1 : 1))));
      lignes.push({
        candidateId: candidate,
        candidateHash: reg.empreinte,
        serviceVersion: reg.essai.versionEnService,
        recordedAt: `${jourPlus(date, -1)}T03:00:00.000Z`,
        fixtureKey: `fotmob:${home}|${away}|${date}`,
        matchId: `${prefixe}-${i}`,
        league: 'Ligue Essai 26 B',
        date,
        kickoff,
        homeName: `Essai Dom ${i}`,
        awayName: `Essai Ext ${i}`,
        homeId: home,
        awayId: away,
        oddsSource: 'cotes gratuites : ESPN',
        oddsAt: `${jourPlus(date, -1)}T03:00:00.000Z`,
        lineupState: 'none',
        marketKey: m.marketKey,
        marketId: m.marketId,
        market: m.market,
        params: trie(params(cb)),
        choice: cb,
        label: `${m.market} ${cb}`,
        probability: pb,
        predictedOdds: Number((1 / pb).toFixed(2)),
        distribution: JSON.stringify(db[m.marketKey]),
        serviceParams: trie(params(ca)),
        serviceChoice: ca,
        serviceProbability: pa,
        servicePredictedOdds: Number((1 / pa).toFixed(2)),
        serviceDistribution: JSON.stringify(da[m.marketKey])
      });
    }
  }
  let ecrites = 0;
  for (let i = 0; i < lignes.length; i += 600) ecrites += ecrirePronosticsABlanc(lignes.slice(i, i + 600), { database });
  return { matchs: n, lignes: lignes.length, ecrites };
}

/** Les forces de buts de la candidate À JOUR (l'état seulement : la nuit à blanc ne calcule aucun match ici). */
function forcesAJour() {
  const mdb = lire(FICHIER_VERSIONS).candidate?.declaration?.modifications?.football?.modeleDeButs ?? lireReglagesDuMoteur().football.modeleDeButs;
  const empreinte = GM.empreinteDesForces(GM.reglagesDuModeleDeButs({ modeleDeButs: mdb }));
  const etat = database.prepare('INSERT OR REPLACE INTO forces_buts_state (cle, valeur) VALUES (?, ?)');
  etat.run('version', String(F.VERSION_FORCES_BUTS));
  etat.run('empreintes', JSON.stringify([empreinte]));
  etat.run('calcule_le', new Date().toISOString());
  etat.run('jusqua', new Date().toISOString().slice(0, 10));
  database.prepare("DELETE FROM forces_buts_state WHERE cle = 'en_cours'").run();
  return F.etatForcesButs({ database, empreintes: [empreinte] }).aJour;
}

/** Le modèle de buts EN SERVICE avec une sous-clé changée (pour un PUT /api/config qui la change dans Réglages). */
const modeleAvec = (cle, valeur) => P.avecLeLevier(lireReglagesDuMoteur().football.modeleDeButs, cle, valeur);

/** Propose (le formulaire), mesure au banc (l'enfant), et rend l'identifiant de la proposition. */
async function proposerEtMesurer(levier, valeur) {
  const r = await requete('POST', '/api/corrections/proposer', { levier, valeur });
  if (r.code !== 201) throw new Error(`proposer ${levier} : ${r.code} ${JSON.stringify(r.corps)}`);
  const id = r.corps.proposition.id;
  const b = await requete('POST', `/api/corrections/${id}/banc`, { vue: 'proposee' });
  if (b.code !== 202) throw new Error(`banc ${id} : ${b.code} ${JSON.stringify(b.corps)}`);
  if (!(await attendreLeBanc())) throw new Error(`le banc de ${id} n’a pas fini`);
  return id;
}

// ------------------------------------------------------------ les phases

if (phase === 'preparer') {
  fs.writeFileSync(path.join(RUNTIME, 'bets.json'), '[]');
  fs.writeFileSync(path.join(RUNTIME, 'predictions.json'), '[]');
  s.demarrage = V.demarrerVersions();
  database.exec('BEGIN');
  try {
    planterLeMois('2026-10', 31, 0);
    planterLeMois('2026-11', 30, 1000);
    planterLeMois('2026-12', 31, 2000);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  s.plantes = { pronostics: database.prepare('SELECT COUNT(*) AS n FROM engine_picks').get().n, matchs: database.prepare("SELECT COUNT(*) AS n FROM matches WHERE league = 'Ligue Essai 26 B'").get().n };
  s.frequences = FREQ;
  s.registre = registre();
  s.code = V.empreinteDuCode({ rafraichir: true }).empreinte;
  s.reglages = { avecModeleDeButs: Boolean(lireReglagesDuMoteur().football.modeleDeButs), rho: lireReglagesDuMoteur().football.modeleDeButs?.rho ?? null };
  s.photos = photos();
} else if (phase === 'tri') {
  const avant = photos();
  const vivant = lireReglagesDuMoteur();
  const empreinteAvant = V.empreinteDesReglages(vivant.football);
  const texteAvant = JSON.stringify(vivant);
  s.dueAvant = job.__testing.dueBoucleCorrection(CTX);
  s.calibration = await job.__testing.passeCalibrationMensuelle(CTX);
  s.calibration = { status: s.calibration.status, summary: s.calibration.summary };
  s.dueApres = job.__testing.dueBoucleCorrection(CTX);
  s.passe = await passe();
  s.apresLaPasse = photos();
  s.ecritures = { config: avant.config === s.apresLaPasse.config, versions: avant.versions === s.apresLaPasse.versions, mesure: avant.mesure === s.apresLaPasse.mesure };
  s.propositions = propositions();
  s.declaration = D.lireLesPropositions({ database })[0]?.declaration ?? null;
  // Une seconde passe à la même heure : rien de retrié, rien de reproposé.
  s.seconde = await passe();
  s.propositionsApres = propositions().length;
  s.journal = journal();
  s.etat = (await requete('GET', '/api/corrections')).corps;
  s.triDecembre = (await requete('GET', '/api/corrections/tri?mois=2026-12')).corps;
  s.sante = (await requete('GET', '/api/engine-health')).corps?.blocs?.corrections ?? null;
  // B43 : les règles et le formulaire, appelés avec l'OBJET VIVANT des réglages (celui du cache), pour chaque levier.
  const tri = D.lireLeTri('2026-12', { database });
  const brut = lire(FICHIER_VERSIONS);
  const base = (await imp('data/correction/lignee.js')).empreinteDesPronostics(brut.versions.find((v) => v.numero === brut.enService));
  const valeurs = { 'modeleDeButs.rho': -0.1, 'modeleDeButs.prior': 9, 'modeleDeButs.poidsXg': 0.6, 'modeleDeButs.melange.avecPlusMoins.wT': 0.2, 'modeleDeButs.melange.avecPlusMoins.wS': 0.2, 'modeleDeButs.melange.sans.wT': 0.5, 'modeleDeButs.melange.sans.wS': 0.2, 'modeleDeButs.demarrageAFroid.matchs': 9 };
  for (const [levier, valeur] of Object.entries(valeurs)) {
    P.declarationDe({ id: `c26-essai-${P.idDeProposition({ source: 'regle', levier, mois: '2026-12' })}`, levier, apres: valeur, reglagesEnService: vivant.football, quoi: 'essai', enMots: 'essai' });
    P.propositionDePierre({ levier, valeur }, { reglagesEnService: vivant.football, propositions: [], place: null, base, maintenant: Date.now() });
  }
  P.proposerPourLeTri({ tri, reglagesEnService: vivant.football, propositions: [], place: null, base, versionEnService: brut.enService, maintenant: Date.now() });
  P.etatDuFormulaire({ place: null, reglagesEnService: vivant.football, propositions: [] });
  P.partDesReglagesEnService(s.declaration, 'modeleDeButs.rho', -0.05, vivant.football);
  s.b43 = { memeObjet: lireReglagesDuMoteur() === vivant, empreinte: V.empreinteDesReglages(lireReglagesDuMoteur().football) === empreinteAvant, texte: JSON.stringify(lireReglagesDuMoteur()) === texteAvant };
} else if (phase === 'banc') {
  const id = D.lireLesPropositions({ database })[0].id;
  s.id = id;
  // Un autre calcul lourd tourne : refusé en mots, rien de compté, rien de lancé.
  const rendre = commencerCalculLourd('calcul d’essai');
  s.pendantUnCalculLourd = await requete('POST', `/api/corrections/${id}/banc`, { vue: 'proposee' });
  rendre();
  s.apresCalculLourd = { etat: uneProposition(id).etat, variantes: variantes26() };
  // Une passe tient la base (le verrou d'un autre processus) : refusé, rien de compté.
  verrouDUnAutreProcessus();
  s.pendantUnePasse = await requete('POST', `/api/corrections/${id}/banc`, { vue: 'proposee' });
  fs.rmSync(FICHIER_VERROU, { force: true });
  s.apresPasse = { etat: uneProposition(id).etat, variantes: variantes26() };
  s.vueFausse = await requete('POST', `/api/corrections/${id}/banc`, { vue: 'bancee' });
  // Le banc au clic.
  s.lance = await requete('POST', `/api/corrections/${id}/banc`, { vue: 'proposee' });
  s.pendant = { calculLourd: calculLourdEnCours()?.nom ?? null, verrou: tacheEnCours(), enCours: B.bancDeCorrectionEnCours()?.id ?? null };
  s.secondClic = await requete('POST', `/api/corrections/${id}/banc`, { vue: 'proposee' });
  s.refuserPendant = await requete('POST', `/api/corrections/${id}/refuser`, { vue: 'au-banc' });
  s.fini = await attendreLeBanc();
  s.apres = { calculLourd: calculLourdEnCours(), verrou: tacheEnCours() };
  s.proposition = uneProposition(id);
  s.variantes = variantes26();
  s.journal = journal();
  s.dernier = B.dernierBancDeCorrection();
  s.pidDuScript = process.pid;
  s.photos = photos();
} else if (phase === 'accepter') {
  const id = D.lireLesPropositions({ database })[0].id;
  s.id = id;
  s.passeAvant = await passe();
  s.etatApresLaPasse = uneProposition(id).etat;
  s.sante = (await requete('GET', '/api/engine-health')).corps?.blocs?.corrections ?? null;
  s.accepter = await requete('POST', `/api/corrections/${id}/accepter`, { vue: 'bancee' });
  s.doubleClic = await requete('POST', `/api/corrections/${id}/accepter`, { vue: 'bancee' });
  s.inconnue = await requete('POST', '/api/corrections/c26-inconnue-1/accepter', { vue: 'bancee' });
  s.sansVue = await requete('POST', `/api/corrections/${id}/accepter`, {});
  s.proposition = uneProposition(id);
  s.photos = photos();
} else if (phase === 'nuit-1') {
  const avant = photos();
  s.passe = await passe();
  s.registre = registre();
  s.proposition = uneProposition(D.lireLesPropositions({ database })[0].id);
  s.variantes = variantes26();
  s.config = avant.config === photo(FICHIER_CONFIG);
  s.carte = (await requete('GET', '/api/config/versions')).corps?.candidate ?? null;
  s.carte = s.carte ? { id: s.carte.id, statut: s.carte.statut, origine: s.carte.origine, origineDite: s.carte.origineDite, essai: s.carte.essai } : null;
} else if (phase === 'essai') {
  const id = D.lireLesPropositions({ database })[0].id;
  s.forces = forcesAJour();
  s.plante = planterLEssai({ candidate: id, premier: '2027-01-04', jours: 22, n: 900, prefixe: 'e26a', meilleure: true });
  const avant = photos();
  const nuit = await calculerABlanc({ matchs: [], dansLaPasse: true });
  s.nuit = { essai: nuit.essai, erreur: nuit.erreur, attente: nuit.attente ?? null };
  s.registre = registre();
  s.passe = await passe();
  s.seconde = await passe();
  s.proposition = uneProposition(id);
  s.config = avant.config === photo(FICHIER_CONFIG);
  s.adoption = (await requete('GET', '/api/config/versions')).corps?.adoption ?? null;
} else if (phase === 'adopter') {
  const id = D.lireLesPropositions({ database })[0].id;
  const avant = lire(FICHIER_CONFIG);
  s.adopter = await requete('POST', '/api/config/versions/adopter', { depuis: 1, candidate: id });
  s.configAvant = avant.football?.modeleDeButs?.rho ?? null;
  s.configApres = lire(FICHIER_CONFIG).football?.modeleDeButs?.rho ?? null;
  s.passe = await passe();
  s.proposition = uneProposition(id);
  s.registre = registre();
  s.lancement = T.lancementDe('26');
  const p0 = photos();
  s.retirer = await requete('POST', `/api/corrections/${id}/retirer`, { vue: 'adoptee' });
  s.retirerRienEcrit = JSON.stringify(photos()) === JSON.stringify(p0);
  s.etat = (await requete('GET', '/api/corrections')).corps?.propositions?.find((p) => p.id === id) ?? null;
} else if (phase === 'retrait') {
  const id = D.lireLesPropositions({ database })[0].id;
  s.retour = await requete('POST', '/api/config/versions/retour', { depuis: 2 });
  s.config = lire(FICHIER_CONFIG).football?.modeleDeButs?.rho ?? null;
  s.passe = await passe();
  s.proposition = uneProposition(id);
  s.journal = journal();
  s.code = V.empreinteDuCode({ rafraichir: true }).empreinte;
  s.registre = registre();
  s.retirerApres = await requete('POST', `/api/corrections/${id}/retirer`, { vue: 'retiree' });
} else if (phase === 'negatifs-1') {
  const formulaire = async (corps) => {
    const r = await requete('POST', '/api/corrections/proposer', corps);
    return { code: r.code, raison: r.corps?.raison ?? null, error: r.corps?.error ?? null, id: r.corps?.proposition?.id ?? null };
  };
  s.prior = await formulaire({ levier: 'modeleDeButs.prior', valeur: 12, phrase: 'essai du formulaire' });
  s.priorDeNouveau = await formulaire({ levier: 'modeleDeButs.prior', valeur: 10 });
  s.retire = await formulaire({ levier: 'defaultCorrelation', valeur: -0.1 });
  s.pari = await formulaire({ levier: 'valueBookmakers', valeur: 1 });
  s.horsBornes = await formulaire({ levier: 'modeleDeButs.rho', valeur: 0.31 });
  s.pas = await formulaire({ levier: 'modeleDeButs.rho', valeur: -0.025 });
  s.meme = await formulaire({ levier: 'modeleDeButs.rho', valeur: -0.05 });
  s.inconnu = await formulaire({ levier: 'modeleDeButs.ancrage.ligne', valeur: 3.5 });
  s.poidsXg = await formulaire({ levier: 'modeleDeButs.poidsXg', valeur: 0.6 });
  s.refuserAvantLeBanc = await requete('POST', `/api/corrections/${s.poidsXg.id}/refuser`, { vue: 'proposee', phrase: 'pas maintenant' });
  s.variantesApresRefus = variantes26();
  // Le banc de « prior » : il voit DEUX corrections comptées (la première, et elle).
  const b = await requete('POST', `/api/corrections/${s.prior.id}/banc`, { vue: 'proposee' });
  s.bancPrior = { code: b.code, fini: await attendreLeBanc(), proposition: uneProposition(s.prior.id) };
  s.accepterPrior = (await requete('POST', `/api/corrections/${s.prior.id}/accepter`, { vue: 'bancee' })).corps?.proposition ?? null;
  s.wt = await proposerEtMesurer('modeleDeButs.melange.sans.wT', 0.5);
  s.accepterWt = (await requete('POST', `/api/corrections/${s.wt}/accepter`, { vue: 'bancee' })).corps?.proposition ?? null;
  s.froid = await proposerEtMesurer('modeleDeButs.demarrageAFroid.matchs', 10);
  s.propositions = propositions();
  s.variantes = variantes26();
  s.journal = journal();
} else if (phase === 'negatifs-2') {
  s.passe = await passe();
  s.registre = registre();
  s.propositions = propositions();
  const prior = idDe('modeleDeButs.prior', ['a-blanc']);
  s.refuserABlanc = await requete('POST', `/api/corrections/${prior}/refuser`, { vue: 'a-blanc' });
  s.registreApresRefus = registre();
} else if (phase === 'negatifs-3') {
  // Réglages : la part des statistiques sans cote plus/moins passe de 55 % à 45 % — une nouvelle version du moteur.
  s.reglage = (await requete('PUT', '/api/config', { modeleDeButs: modeleAvec('modeleDeButs.melange.sans.wT', 0.45) })).corps?.version ?? null;
  s.passe = await passe();
  s.registre = registre();
  s.propositions = propositions();
  // La nuit : la correction refusée n'est plus dans la place, son essai ne recommence pas.
  const nuit = await calculerABlanc({ matchs: [], dansLaPasse: true });
  s.nuit = { candidate: nuit.candidate, essai: nuit.essai ?? null };
  s.variantes = variantes26();
} else if (phase === 'negatifs-4') {
  s.ws = await proposerEtMesurer('modeleDeButs.melange.avecPlusMoins.wS', 0.2);
  s.accepter = (await requete('POST', `/api/corrections/${s.ws}/accepter`, { vue: 'bancee' })).corps?.proposition ?? null;
  s.passe = await passe();
  s.registre = registre();
  s.proposition = uneProposition(s.ws);
} else if (phase === 'negatifs-5') {
  const ws = idDe('modeleDeButs.melange.avecPlusMoins.wS', ['a-blanc']);
  s.forces = forcesAJour();
  s.plante = planterLEssai({ candidate: ws, premier: '2027-02-02', jours: 21, n: 900, prefixe: 'e26b', meilleure: false });
  const nuit = await calculerABlanc({ matchs: [], dansLaPasse: true });
  s.nuit = { essai: nuit.essai, erreur: nuit.erreur, attente: nuit.attente ?? null };
  s.passe = await passe();
  s.registre = registre();
  s.proposition = uneProposition(ws);
  // Un changement de version ensuite : la correction rejetée n'est plus dans la place, son essai ne recommence pas.
  s.reglage = (await requete('PUT', '/api/config', { edgeThresholdMin: 0.031 })).corps?.version ?? null;
  const nuit2 = await calculerABlanc({ matchs: [], dansLaPasse: true });
  s.nuit2 = { candidate: nuit2.candidate, essai: nuit2.essai ?? null };
  s.variantes = variantes26();
  s.journal = journal();
} else if (phase === 'orphelins') {
  // Une mesure au banc interrompue (l'appli fermée pendant le banc) : simulée en posant « au-banc » sans banc en cours.
  const r = await requete('POST', '/api/corrections/proposer', { levier: 'modeleDeButs.prior', valeur: 10 });
  s.priorDeuxieme = { code: r.code, id: r.corps?.proposition?.id ?? null };
  D.changerLEtat({ id: s.priorDeuxieme.id, evenement: 'au-banc', vue: 'proposee', source: 'pierre', phrase: 'Essai : mesure au banc lancée, puis appli fermée.' });
  s.avant = uneProposition(s.priorDeuxieme.id).etat;
  s.passe = await passe();
  s.apres = uneProposition(s.priorDeuxieme.id).etat;
  // Une mise à l'essai interrompue entre le registre des versions et le magasin : la correction est au registre, la
  // proposition encore « acceptee » (proposerUneCandidate appelé ici, comme la passe l'aurait fait, puis l'appli « fermée »).
  const id = await proposerEtMesurer('modeleDeButs.poidsXg', 0.65);
  s.poidsXg = id;
  await requete('POST', `/api/corrections/${id}/accepter`, { vue: 'bancee' });
  V.proposerUneCandidate(D.lireUneProposition(id, { database }).declaration, { origine: 'correction-mensuelle' });
  s.avantReprise = { etat: uneProposition(id).etat, registre: registre().candidate?.id ?? null };
  s.reprise = await passe();
  s.apresReprise = uneProposition(id);
  s.refuser = await requete('POST', `/api/corrections/${id}/refuser`, { vue: 'a-blanc' });
  s.liberation = await passe();
  s.registre = registre();
  s.journal = journal();
  s.etat = (await requete('GET', '/api/corrections')).corps;
  s.etat = { disponible: s.etat.disponible, propositions: s.etat.propositions.map((p) => [p.id, p.etat, p.etatDit, p.ton]), essais: s.etat.essais, place: s.etat.place };
} else if (phase === 'reprise-echec') {
  // Vérification finale, constat 3 : une erreur à l'étape « propositions », APRÈS le tri du dernier mois — la base de la
  // copie refuse la création d'une proposition (un déclencheur posé ici seulement, retiré en fin de phase). La passe est
  // rangée comme la vraie (son alerte durable, ses détails) ; l'étape reste-t-elle due ?
  s.calibration = (await job.__testing.passeCalibrationMensuelle(CTX)).status;
  database.exec("CREATE TRIGGER essai_constat_3 BEFORE INSERT ON correction_propositions BEGIN SELECT RAISE(ABORT, 'création refusée (essai du constat 3)'); END;");
  const r = await job.__testing.passeBoucleCorrection(ctxDeLaPasse());
  rangerLaPasse(r);
  s.passe = resumeDeLaPasse(r);
  s.alerteRangee = RS.readRefreshStatus().alerts.boucleCorrection ?? null;
  s.dueSansLAlerte = BOUCLE.dueBoucle({}).du;
  s.dueAvecLAlerte = job.__testing.dueBoucleCorrection(ctxDeLaPasse());
  s.propositions = propositions();
  database.exec('DROP TRIGGER essai_constat_3');
} else if (phase === 'reprise') {
  // La passe suivante (3 h plus tard) : due (son alerte est levée), elle refait les propositions sur le dernier tri rangé
  // (décembre) et lève l'alerte ; ensuite l'étape n'est plus due ; une reprise de trop ne crée aucun doublon.
  s.due = job.__testing.dueBoucleCorrection(ctxDeLaPasse());
  const r = await job.__testing.passeBoucleCorrection(ctxDeLaPasse());
  rangerLaPasse(r);
  s.passe = resumeDeLaPasse(r);
  s.alerteRangee = RS.readRefreshStatus().alerts.boucleCorrection ?? null;
  s.dueApres = job.__testing.dueBoucleCorrection(ctxDeLaPasse());
  s.propositions = propositions();
  s.journal = journal();
  const deTrop = await job.__testing.passeBoucleCorrection({ ...CTX, derniersDetails: (cle) => (cle === 'boucleCorrection' ? { erreurs: [{ etape: 'propositions', message: 'essai' }], alerte: null } : null) });
  s.deTrop = resumeDeLaPasse(deTrop);
  s.propositionsApres = propositions().length;
} else {
  throw new Error(`Phase inconnue : ${phase}`);
}

// À la fin de chaque phase : les trois fichiers que seule l'étape 25 écrit (réglages, versions, registre de la mesure).
s.photosFin = photos();
console.log(JSON.stringify(s));
