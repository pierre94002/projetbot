/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-forces-buts.mjs <serveur de la copie> <phase>
 *
 * Étape 27 — LES FORCES DE BUTS de la nuit (data/db/forcesButs.js, étape « forcesButs » de l'actualisation) sur
 * la base d'essai, la table du jour J construite ici. Réseau coupé, heure figée. Phases :
 *   nuit          rien à faire ; « maintenant » obligatoire ; le calcul À PART (l'enfant en lecture seule : la base
 *                 n'a pas bougé) ; premier calcul = la reconstruction complète ; rien de changé → rien ; une feuille
 *                 TARDIVE (un match ancien corrigé) → la table = la reconstruction ; un rangement INTERROMPU (le
 *                 lecteur l'ignore, la nuit suivante refait tout) ; DEUX empreintes, puis une retirée ; aucune
 *                 transaction ouverte à un point d'arrêt ; un autre calcul lourd en cours → « reporté » (et le
 *                 banc refusé pendant les forces) ; l'étape de la passe (résumé, due) ; les réglages du moteur
 *                 jamais touchés par la passe.
 *   plantations   un club PROMU (remise à zéro à son premier match du nouveau championnat, pas avant ; une coupe ne
 *                 la déclenche pas) ; deux matchs d'un club le MÊME jour ; une COUPE PROLONGÉE dont on change le
 *                 score final (seuls comptent les buts de la 90e) ; le contrôle anti-fuite : 40 couples, 0 écart,
 *                 puis deux fuites plantées → exactement deux écarts nommés.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { reglagesDuModele } from './modeleDeButsCommun.mjs';
import { recopierScripts } from './claudeSimule.mjs';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const BASE = process.env.MATCH_STATS_DB;

const { openDb, resolveDbPath, upsertMatches } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
const T = await imp('data/db/dayTable.js');
const F = await imp('data/db/forcesButs.js');
const G = await imp('core/engine/goalModel.js');
const L = await imp('utils/calculLourd.js');
const { lireEntreesButs } = await imp('data/db/entreesButs.js');
const { TEAM_COLUMNS, PLAYER_COLUMNS } = await imp('data/db/columns.js');
const { executerSansPause } = await imp('utils/travailCooperatif.js');

const MAINTENANT = new Date().toISOString();
const M = () => MAINTENANT;
const sortie = { ok: true, phase, maintenant: MAINTENANT };
const db = openDb();
const E1 = G.empreinteDesForces(reglagesDuModele());
const E2 = G.empreinteDesForces(reglagesDuModele({ demiVies: { attaque: 20, defense: 20 } }));
const SOMMES = ['sa', 'wa', 'sd', 'wd', 'sga', 'wga', 'sgd', 'wgd'];

const construireTable = () => T.construireTableJourJ({ database: db, rendreLaMain: null, controle: { lignes: 0 } });
const garder = (o, cles) => Object.fromEntries(cles.map((k) => [k, o?.[k] ?? null]));
const sha1 = (f) => (fs.existsSync(f) ? crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex') : 'absent');

/** Les lignes rangées d'une empreinte (ordre club, jour) et les journées de championnat rangées. */
const lignesRangees = (e) => db.prepare('SELECT club, jour, ligue, n, nx, sa, wa, sd, wd, sga, wga, sgd, wgd FROM forces_buts WHERE reglages = ? ORDER BY club, jour').all(e).map((x) => ({ ...x }));
const liguesRangees = () => db.prepare('SELECT league, jour, saison, n, bd, be, nx, xd, xe FROM forces_buts_ligues ORDER BY league, jour').all().map((x) => ({ ...x }));

/** LA RECONSTRUCTION complète, ici : l'accumulateur rejoué sur toute la table du jour J (chaque fin de journée gardée). */
function reconstruction(e) {
  const lignes = [];
  const ligues = [];
  const acc = new F.AccumulateurDesForces({
    empreintes: [e],
    surJournee: ({ jour, etats, ligues: l }) => {
      for (const x of etats) lignes.push({ club: x.club, jour, ligue: x.etat.ligue ?? null, n: x.etat.n, nx: x.etat.nx, ...garder(x.etat, SOMMES) });
      for (const y of l) ligues.push({ league: y.league, jour: y.jour, saison: y.saison, n: y.n, bd: y.bd, be: y.be, nx: y.nx, xd: y.xd, xe: y.xe });
    }
  });
  let dernier = null;
  for (const r of F.faitsDeTeamDay(db)) {
    if (dernier !== null && r.date !== dernier) acc.finDeJournee();
    dernier = r.date;
    const f = G.faitsDeLaRencontre(r);
    if (f) acc.ajouter(f.dom, f.ext);
  }
  acc.finDeJournee();
  lignes.sort((a, b) => a.club - b.club || (a.jour < b.jour ? -1 : a.jour > b.jour ? 1 : 0));
  ligues.sort((a, b) => (a.league < b.league ? -1 : a.league > b.league ? 1 : a.jour < b.jour ? -1 : a.jour > b.jour ? 1 : 0));
  return { lignes, ligues };
}

/** La table rangée face à la reconstruction : lignes et journées de championnat, à l'octet. */
function faceALaReconstruction(e) {
  const r = reconstruction(e);
  const t = lignesRangees(e);
  const tl = liguesRangees();
  const ecarts = [];
  const n = Math.max(r.lignes.length, t.length);
  for (let i = 0; i < n && ecarts.length < 5; i++) if (JSON.stringify(r.lignes[i]) !== JSON.stringify(t[i])) ecarts.push({ i, attendu: r.lignes[i] ?? null, range: t[i] ?? null });
  const ecartsLigues = [];
  for (let i = 0; i < Math.max(r.ligues.length, tl.length) && ecartsLigues.length < 5; i++) if (JSON.stringify(r.ligues[i]) !== JSON.stringify(tl[i])) ecartsLigues.push({ i, attendu: r.ligues[i] ?? null, range: tl[i] ?? null });
  return { lignes: t.length, attendues: r.lignes.length, identiques: ecarts.length === 0 && r.lignes.length === t.length, ecarts, ligues: tl.length, liguesIdentiques: ecartsLigues.length === 0 && r.ligues.length === tl.length, ecartsLigues };
}

/** L'entrée d'upsertMatches d'une rencontre existante, avec des changements (le patron de script-banc.mjs). */
function entreeDe(matchKey, changements = {}) {
  const m = db.prepare('SELECT * FROM matches WHERE match_key = ?').get(matchKey);
  const parse = (t) => (t ? JSON.parse(t) : null);
  const teamStats = {};
  for (const t of db.prepare('SELECT * FROM team_stats WHERE match_key = ?').all(matchKey)) {
    teamStats[t.side] = Object.fromEntries(TEAM_COLUMNS.map((c) => [c.key, t[c.column]]).filter(([, v]) => v !== null && v !== undefined));
  }
  const players = { home: [], away: [] };
  for (const p of db.prepare('SELECT * FROM players WHERE match_key = ? ORDER BY side, ord').all(matchKey)) {
    const j = Object.fromEntries(PLAYER_COLUMNS.map((c) => [c.key, p[c.column]]).filter(([, v]) => v !== null && v !== undefined));
    if (j.starter !== undefined) j.starter = j.starter === 1;
    if (j.subbedIn !== undefined) j.subbedIn = j.subbedIn === 1;
    players[p.side]?.push(j);
  }
  return { date: m.date, league: m.league, homeName: m.home_name, awayName: m.away_name, homeId: m.home_id, awayId: m.away_id, fotmobId: m.fotmob_id, homeGoals: m.home_goals, awayGoals: m.away_goals, events: null, lineups: parse(m.lineups), meta: parse(m.meta), shotmap: null, sources: ['essai'], teamStats, players, ...changements };
}

const numero = (id) => Number(String(id).replace('fotmob-', ''));

if (phase === 'nuit') {
  // L'actualisation importe un script du serveur (fusion des statistiques) : recopié dans la copie.
  recopierScripts(serveur);
  const job = await imp('jobs/matchStatsAutoRefresh.js');
  const J = job.__testing;
  const V = await imp('core/engine/engineVersions.js');
  const { rejouerAPart } = await imp('data/db/bancAPart.js');
  const RUNTIME = path.join(serveur, 'data', 'runtime');
  const reglagesAvant = { fichier: sha1(path.join(RUNTIME, 'engine-config.json')), empreinte: JSON.stringify(V.etatDuMoteur().empreinteReglages) };

  // 0. Aucune version ne lit les forces, rien de rangé : rien. Sans « maintenant » : refus.
  sortie.rien = garder(await F.forcesDeButs({ empreintes: [], database: db, aPart: false, maintenant: M }), ['mode', 'raison']);
  sortie.sansMaintenant = await F.forcesDeButs({ empreintes: [E1], database: db, aPart: false }).then(() => 'accepté', (e) => e.message);
  await construireTable();

  // 1. Le calcul À PART, réel : l'enfant ouvre la base en lecture seule — ni la base ni son journal ne bougent.
  const fichiers = () => ({ base: sha1(BASE), wal: sha1(`${BASE}-wal`) });
  const avantEnfant = fichiers();
  const calc = await F.calculerAPart({ chemin: BASE, empreintes: [E1], precedente: null, force: true, graine: 20261005 });
  sortie.enfant = { autrePid: calc.bilan?.aPart?.pid !== process.pid && Number.isInteger(calc.bilan?.aPart?.pid), lignes: calc.nLignes, morceaux: calc.lignes.length, controle: calc.controle ? { lignes: calc.controle.lignes, ecarts: calc.controle.ecarts.length } : null, baseIntacte: JSON.stringify(avantEnfant) === JSON.stringify(fichiers()), rssMaxMo: Math.round((calc.bilan?.aPart?.rssMaxOctets ?? 0) / 1048576) };

  // 2. Le premier calcul (par l'étape, à part) = la reconstruction complète ; puis rien de changé → rien.
  const premier = await F.forcesDeButs({ empreintes: [E1], database: db, chemin: BASE, aPart: true, maintenant: M });
  sortie.premier = { ...garder(premier, ['mode', 'lignes', 'ecrites', 'clubs', 'championnats', 'jusqua', 'erreur']), controle: premier.controle ? { lignes: premier.controle.lignes, ecarts: premier.controle.ecarts.length } : null, face: faceALaReconstruction(E1), etat: garder(F.etatForcesButs({ database: db, empreintes: [E1] }), ['aJour', 'empreintes', 'enCours', 'version']) };
  sortie.second = garder(await F.forcesDeButs({ empreintes: [E1], database: db, aPart: false, maintenant: M }), ['mode', 'ecrites']);

  // 3. Une feuille TARDIVE : un match ancien (mars 2026) corrigé après coup (+3 buts à domicile).
  const tardif = db.prepare("SELECT match_key, date, home_id, home_goals FROM matches WHERE league = 'EPL' AND date < '2026-04-01' ORDER BY date, match_key LIMIT 1 OFFSET 10").get();
  const clubTardif = numero(tardif.home_id);
  const avantTardif = lignesRangees(E1).filter((x) => x.club === clubTardif);
  upsertMatches([entreeDe(tardif.match_key, { homeGoals: tardif.home_goals + 3 })], { database: db });
  await construireTable();
  const tard = await F.forcesDeButs({ empreintes: [E1], database: db, aPart: false, maintenant: M });
  const apresTardif = lignesRangees(E1).filter((x) => x.club === clubTardif);
  const memeAvant = (l) => avantTardif.filter((x) => x.jour < tardif.date).every((x, i) => JSON.stringify(x) === JSON.stringify(l[i]));
  sortie.tardive = {
    ...garder(tard, ['mode', 'clubs', 'ecrites', 'retirees']),
    face: faceALaReconstruction(E1),
    avantLeMatchInchange: memeAvant(apresTardif),
    duJourChange: JSON.stringify(avantTardif.find((x) => x.jour === tardif.date)) !== JSON.stringify(apresTardif.find((x) => x.jour === tardif.date))
  };

  // 4. Un rangement INTERROMPU : « en cours » reste, le lecteur ignore la table ; la nuit suivante refait tout.
  const autre = db.prepare("SELECT match_key, away_goals FROM matches WHERE league = 'Championship' AND date < '2026-05-01' ORDER BY date, match_key LIMIT 1 OFFSET 5").get();
  upsertMatches([entreeDe(autre.match_key, { awayGoals: autre.away_goals + 2 })], { database: db });
  await construireTable();
  const precedente = (() => {
    const e = F.etatForcesButs({ database: db, empreintes: [E1] });
    return { version: e.version, empreintes: e.empreintes, empreinteRencontres: e.empreinteRencontres };
  })();
  const calcul = executerSansPause(F.calculerLesForces({ database: db, empreintes: [E1], precedente, graine: null }));
  const rangement = F.rangerLesForces({ database: db, calcul, maintenant: M, tranche: 1 });
  let pas = 0;
  while (pas < 3 && !rangement.next().done) pas++;
  rangement.return();
  const cible = db.prepare("SELECT date, league, home_name, away_name, home_id, away_id FROM matches WHERE league = 'EPL' ORDER BY date DESC LIMIT 1").get();
  const matchCible = { league: cible.league, home: cible.home_name, away: cible.away_name, commenceTime: `${cible.date}T12:00:00Z`, scoreInputs: { home: { teamId: cible.home_id }, away: { teamId: cible.away_id } } };
  const lu = lireEntreesButs({ match: matchCible, reglages: reglagesDuModele(), database: db, maintenant: Date.parse(MAINTENANT) });
  sortie.interrompu = {
    pas,
    transactionOuverte: db.isTransaction,
    etat: garder(F.etatForcesButs({ database: db, empreintes: [E1] }), ['aJour', 'enCours']),
    lecteur: { forces: lu.forces, ligue: lu.ligue, manques: lu.manques },
    due: J.dueForcesButs({ manuel: false, derniere: () => MAINTENANT }, { database: db, empreintes: [E1] })
  };
  const reprise = await F.forcesDeButs({ empreintes: [E1], database: db, aPart: false, maintenant: M });
  sortie.reprise = { ...garder(reprise, ['mode', 'ecrites']), face: faceALaReconstruction(E1), etat: garder(F.etatForcesButs({ database: db, empreintes: [E1] }), ['aJour', 'enCours']), lecteur: Boolean(lireEntreesButs({ match: matchCible, reglages: reglagesDuModele(), database: db, maintenant: Date.parse(MAINTENANT) }).forces?.home) };

  // 5. DEUX empreintes (deux candidates aux demi-vies différentes), puis la seconde plus demandée : retirée.
  const deux = await F.forcesDeButs({ empreintes: [E1, E2], database: db, aPart: false, maintenant: M });
  const luE2 = lireEntreesButs({ match: matchCible, reglages: reglagesDuModele({ demiVies: { attaque: 20, defense: 20 } }), database: db, maintenant: Date.parse(MAINTENANT) });
  const luE1 = lireEntreesButs({ match: matchCible, reglages: reglagesDuModele(), database: db, maintenant: Date.parse(MAINTENANT) });
  sortie.deux = { ...garder(deux, ['mode', 'empreintes']), faceE1: faceALaReconstruction(E1).identiques, faceE2: faceALaReconstruction(E2).identiques, lignesE2: lignesRangees(E2).length, etatsDifferents: JSON.stringify(luE1.forces) !== JSON.stringify(luE2.forces), etat: F.etatForcesButs({ database: db, empreintes: [E1, E2] }).empreintes };
  // Vérification des fuites (constat 2) : la nuit contrôle TOUTES les empreintes demandées (40 couples chacune) ; une
  // fuite plantée dans les lignes de la SECONDE seule est trouvée, et chaque écart nomme son empreinte.
  sortie.deuxControle = deux.controle ? { lignes: deux.controle.lignes, ecarts: deux.controle.ecarts.length, empreintes: deux.controle.empreintes, empreinte: deux.controle.empreinte } : null;
  {
    const parClub = new Map();
    for (const l of lignesRangees(E2)) {
      if (!parClub.has(l.club)) parClub.set(l.club, []);
      parClub.get(l.club).push(l);
    }
    const club = [...parClub.keys()].find((c) => parClub.get(c).length >= 6);
    const l = parClub.get(club);
    // La ligne du 3e jour de E2 réécrite avec l'état du 4e (le match du 4e jour vu « avant » lui) ; E1 intacte.
    db.prepare('UPDATE forces_buts SET ligue = ?, n = ?, nx = ?, sa = ?, wa = ?, sd = ?, wd = ?, sga = ?, wga = ?, sgd = ?, wgd = ? WHERE reglages = ? AND club = ? AND jour = ?')
      .run(l[3].ligue, l[3].n, l[3].nx, l[3].sa, l[3].wa, l[3].sd, l[3].wd, l[3].sga, l[3].wga, l[3].sgd, l[3].wgd, E2, club, l[2].jour);
    const couple = { club, J: l[3].jour };
    const lireLigne = db.prepare('SELECT ligue, n, nx, sa, wa, sd, wd, sga, wga, sgd, wgd FROM forces_buts WHERE reglages = ? AND club = ? AND jour < ? ORDER BY jour DESC LIMIT 1');
    const lire = (e, c, J) => {
      const r = lireLigne.get(e, c, J);
      return r ? { ...r, ligue: r.ligue ?? null } : null;
    };
    const c = executerSansPause(F.controleDesEmpreintesPas({ database: db, graine: 20261005, empreintes: [E1, E2], lire, tampons: new Map(), lignes: 0, imposes: { [E1]: [couple], [E2]: [couple] } }));
    sortie.fuiteSurLaSeconde = {
      lignes: c.lignes,
      empreintes: c.empreintes.map((p) => [p.empreinte, p.lignes, p.ecarts > 0]),
      nommees: [...new Set(c.ecarts.map((e) => `${e.empreinte}|${e.club}|${e.J}`))],
      attendue: `${E2}|${couple.club}|${couple.J}`
    };
  }
  const retrait = await F.forcesDeButs({ empreintes: [E1], database: db, aPart: false, maintenant: M });
  sortie.retrait = { ...garder(retrait, ['mode', 'retirees']), lignesE2: lignesRangees(E2).length, faceE1: faceALaReconstruction(E1).identiques, etat: F.etatForcesButs({ database: db, empreintes: [E1] }).empreintes };

  // 6. Aucune transaction ouverte à un point d'arrêt du rangement (table vidée : tout est réécrit, tranches de 100).
  db.prepare('DELETE FROM forces_buts WHERE reglages = ?').run(E1);
  const tout = executerSansPause(F.calculerLesForces({ database: db, empreintes: [E1], precedente: null, graine: null }));
  const g = F.rangerLesForces({ database: db, calcul: tout, maintenant: M, tranche: 100 });
  let points = 0;
  let ouvertes = 0;
  for (let e = g.next(); !e.done; e = g.next()) {
    points++;
    if (db.isTransaction) ouvertes++;
  }
  sortie.transactions = { pointsDArret: points, ouvertes, face: faceALaReconstruction(E1).identiques };

  // 7. UN CALCUL LOURD À LA FOIS : un banc tourne → les forces sont reportées (rien de lancé), l'étape le dit et
  // reviendra à la passe suivante ; pendant les forces, le banc est refusé.
  const finBanc = L.commencerCalculLourd('banc d’essai');
  const pendantBanc = await F.forcesDeButs({ empreintes: [E1], database: db, chemin: BASE, aPart: true, force: true, maintenant: M });
  const passeReportee = await J.passeForcesButs({}, { empreintes: [E1], etatDeLaTable: () => ({ aJour: true }), database: db, chemin: BASE, force: true });
  sortie.reporte = {
    forces: garder(pendantBanc, ['mode', 'raison']),
    passe: { status: passeReportee.status, summary: passeReportee.summary, reporte: passeReportee.details?.reporte ?? null },
    due: J.dueForcesButs({ manuel: false, derniere: () => MAINTENANT, derniersDetails: () => passeReportee.details }, { database: db, empreintes: [E1] })
  };
  finBanc();
  const finForces = L.commencerCalculLourd('forces de buts');
  sortie.bancPendantLesForces = await rejouerAPart({ chemin: BASE, options: { periodes: ['P4'] } }).then(() => 'lancé', (e) => ({ reporte: e.reporte === true, statut: e.statut ?? null, message: e.message }));
  finForces();
  sortie.jetonRendu = L.calculLourdEnCours();

  // 8. L'étape de la passe, normale, après une autre feuille tardive : résumé en français (lignes, contrôle), puis
  // rien de neuf → « rien à refaire » ; due (fait aujourd'hui et à jour → non).
  const encore = db.prepare("SELECT match_key, home_goals FROM matches WHERE league = 'League 1' AND date < '2026-05-01' ORDER BY date, match_key LIMIT 1 OFFSET 3").get();
  upsertMatches([entreeDe(encore.match_key, { homeGoals: encore.home_goals + 1 })], { database: db });
  await construireTable();
  const passe = await J.passeForcesButs({}, { empreintes: [E1], database: db, chemin: BASE });
  sortie.passe = { status: passe.status, summary: passe.summary, mode: passe.details?.mode ?? null, controle: passe.details?.controle ?? null, alerte: passe.alert ?? null, changed: passe.changed, face: faceALaReconstruction(E1).identiques };
  const passeRienANeuf = await J.passeForcesButs({}, { empreintes: [E1], database: db, chemin: BASE });
  sortie.passeRienANeuf = { status: passeRienANeuf.status, summary: passeRienANeuf.summary, mode: passeRienANeuf.details?.mode ?? null };
  sortie.due = {
    faitAujourdhuiAJour: J.dueForcesButs({ manuel: false, derniere: () => MAINTENANT }, { database: db, empreintes: [E1] }),
    jamaisFait: J.dueForcesButs({ manuel: false, derniere: () => null }, { database: db, empreintes: [E1] }),
    clic: J.dueForcesButs({ manuel: true, derniere: () => MAINTENANT }, { database: db, empreintes: [E1] }),
    autreEmpreinte: J.dueForcesButs({ manuel: false, derniere: () => MAINTENANT }, { database: db, empreintes: [E1, E2] })
  };
  const passeAttente = await J.passeForcesButs({}, { empreintes: [E1], etatDeLaTable: () => ({ aJour: false, enCours: true }), database: db });
  sortie.passeAttente = { status: passeAttente.status, summary: passeAttente.summary, mode: passeAttente.details?.mode ?? null };
  // Plus aucune version ne lit les forces : la nuit retire l'empreinte (rien n'est jamais gardé pour rien).
  const passeRien = await J.passeForcesButs({}, { empreintes: [], database: db, chemin: BASE });
  sortie.passeRien = { status: passeRien.status, summary: passeRien.summary, mode: passeRien.details?.mode ?? null, lignesE1: lignesRangees(E1).length };
  sortie.passeVide = await J.passeForcesButs({}, { empreintes: [], database: db, chemin: BASE }).then((p) => ({ status: p.status, summary: p.summary }));
  // La place de l'étape : après l'indice de force, avant le gel et la candidate à blanc.
  sortie.etapes = job.REFRESH_STEPS.map((e) => e.key);
  // Les réglages du moteur : jamais touchés par la passe (rien n'est appris la nuit).
  sortie.reglages = { avant: reglagesAvant, apres: { fichier: sha1(path.join(RUNTIME, 'engine-config.json')), empreinte: JSON.stringify(V.etatDuMoteur().empreinteReglages) } };
} else if (phase === 'plantations') {
  await construireTable();
  await F.forcesDeButs({ empreintes: [E1], database: db, aPart: false, maintenant: M });
  const lignes = lignesRangees(E1);
  const parClub = new Map();
  for (const l of lignes) {
    if (!parClub.has(l.club)) parClub.set(l.club, []);
    parClub.get(l.club).push(l);
  }

  // 1. Un club PROMU (ou relégué) : ses matchs de championnat dans deux championnats ; la remise à zéro à son premier
  // match du nouveau, jamais avant (ni au début de la saison, ni sur une coupe), et n compte tous les matchs.
  const faitsDuClub = (club) => db.prepare('SELECT t.date, t.league, t.coupe, t.compte, t.attribue FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre WHERE t.club = ? ORDER BY t.date, d.match_key').all(club);
  const promus = [];
  for (const club of parClub.keys()) {
    const faits = faitsDuClub(club).filter((f) => !f.attribue);
    const ligues = faits.filter((f) => !f.coupe);
    const k = ligues.findIndex((f, i) => i > 0 && f.league !== ligues[i - 1].league);
    if (k < 0) continue;
    const premier = ligues[k];
    const lignesDuClub = parClub.get(club);
    const jourDuChangement = lignesDuClub.find((x) => x.jour === premier.date);
    const veille = [...lignesDuClub].reverse().find((x) => x.jour < premier.date);
    const coupesEntre = faits.filter((f) => f.coupe && f.date > ligues[k - 1].date && f.date < premier.date).length;
    promus.push({
      club,
      de: ligues[k - 1].league,
      vers: premier.league,
      jour: premier.date,
      veille: veille ? garder(veille, ['jour', 'ligue', 'n', 'wa', 'wd', 'wga', 'wgd']) : null,
      apres: jourDuChangement ? garder(jourDuChangement, ['jour', 'ligue', 'n', 'wa', 'wd', 'wga', 'wgd']) : null,
      coupesEntre
    });
  }
  sortie.promus = promus;
  // Une coupe entre deux matchs de championnat ne remet rien à zéro : la ligne du jour de coupe a wa > 1.
  const coupes = [];
  for (const [club, l] of parClub) {
    const faits = faitsDuClub(club).filter((f) => !f.attribue);
    for (let i = 1; i < faits.length; i++) {
      if (!faits[i].coupe || faits[i - 1].coupe) continue;
      const x = l.find((y) => y.jour === faits[i].date);
      if (x) coupes.push({ club, jour: x.jour, ligue: x.ligue, ligueAvant: faits[i - 1].league, wa: x.wa, n: x.n });
      break;
    }
    if (coupes.length >= 20) break;
  }
  sortie.coupes = coupes;

  // 2. Deux matchs d'un club le MÊME jour (planté : une seconde rencontre de championnat le même jour, contre un
  // autre club) : lu « avant J », aucun des deux ne compte ; le lendemain, les deux — et les moyennes du jour J
  // n'entrent dans aucun des deux (second chemin, SQL date < J).
  const x = db.prepare("SELECT match_key, date, home_id FROM matches WHERE league = 'Championship' AND date >= '2026-08-01' ORDER BY date, match_key LIMIT 1").get();
  const adversaire = db
    .prepare("SELECT home_id, home_name FROM matches WHERE league = 'Championship' AND date >= '2026-08-01' AND home_id NOT IN (SELECT home_id FROM matches WHERE date = ? UNION SELECT away_id FROM matches WHERE date = ?) ORDER BY match_key LIMIT 1")
    .get(x.date, x.date);
  const base = entreeDe(x.match_key);
  upsertMatches([{ ...base, fotmobId: '990000401', awayId: adversaire.home_id, awayName: adversaire.home_name, homeGoals: 4, awayGoals: 1, meta: { ...(base.meta ?? {}), kickoff: `${x.date}T19:45:00.000Z` } }], { database: db });
  await construireTable();
  await F.forcesDeButs({ empreintes: [E1], database: db, aPart: false, maintenant: M });
  const club = numero(x.home_id);
  const lendemain = new Date(Date.parse(`${x.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const reglages = F.reglagesDeLEmpreinte(E1);
  const lire = (c, J0) => {
    const r = db.prepare('SELECT ligue, n, nx, sa, wa, sd, wd, sga, wga, sgd, wgd FROM forces_buts WHERE reglages = ? AND club = ? AND jour < ? ORDER BY jour DESC LIMIT 1').get(E1, c, J0);
    return r ? { ...r } : null;
  };
  const ecart = (a, b) => F.ecartsDEtats(b, a).length;
  const matchsDuJour = db.prepare('SELECT COUNT(*) n FROM team_day WHERE club = ? AND date = ?').get(club, x.date).n;
  const avantJ = lire(club, x.date);
  const apresJ = lire(club, lendemain);
  sortie.memeJour = {
    matchsDuClubCeJour: matchsDuJour,
    ecartsAvant: ecart(avantJ, F.etatParLeSecondChemin({ database: db, club, J: x.date, reglages })),
    ecartsLendemain: ecart(apresJ, F.etatParLeSecondChemin({ database: db, club, J: lendemain, reglages })),
    ecartsAdversaire: ecart(lire(numero(adversaire.home_id), lendemain), F.etatParLeSecondChemin({ database: db, club: numero(adversaire.home_id), J: lendemain, reglages })),
    nAvant: avantJ?.n ?? 0,
    nLendemain: apresJ?.n ?? 0
  };

  // 3. Une COUPE PROLONGÉE dont on change le score FINAL (prolongation), les buts de la 90e intacts : comptée au
  // classement pour l'essai (elle entre alors dans les moyennes de son championnat) — forces et moyennes inchangées.
  const prolongee = db.prepare('SELECT rencontre, date, league, club FROM team_day WHERE prolongation = 1 AND camp = 1 AND attribue = 0 AND bp90 IS NOT NULL ORDER BY date LIMIT 1').get();
  sortie.coupeProlongee = { trouvee: Boolean(prolongee) };
  if (prolongee) {
    db.prepare('UPDATE team_day SET compte = 1 WHERE rencontre = ?').run(prolongee.rencontre);
    const avant = await F.forcesDeButs({ empreintes: [E1], database: db, aPart: false, force: true, maintenant: M });
    const instantane = () => JSON.stringify({ l: lignesRangees(E1), g: liguesRangees() });
    const photo = instantane();
    const liguesDuChampionnat = liguesRangees().filter((y) => y.league === prolongee.league && y.jour === prolongee.date);
    db.prepare('UPDATE team_day SET bp = bp + 2 WHERE rencontre = ? AND camp = 1').run(prolongee.rencontre);
    db.prepare('UPDATE team_day SET bc = bc + 2 WHERE rencontre = ? AND camp = 0').run(prolongee.rencontre);
    const apres = await F.forcesDeButs({ empreintes: [E1], database: db, aPart: false, force: true, maintenant: M });
    sortie.coupeProlongee = { trouvee: true, league: prolongee.league, date: prolongee.date, modes: [avant.mode, apres.mode], dansLesMoyennes: liguesDuChampionnat.length === 1 && liguesDuChampionnat[0].n >= 1, inchangees: photo === instantane() };
  }

  // 4. LE CONTRÔLE ANTI-FUITE des lignes rangées : 40 couples, 0 écart ; puis deux fuites plantées — (a) « le match du
  // jour » (la ligne d'avant un match remplacée par celle d'après), (b) « la moyenne qui compte le jour J » (l'état
  // refait avec les moyennes du championnat qui comptent son propre jour) → exactement deux écarts, nommés.
  await F.forcesDeButs({ empreintes: [E1], database: db, aPart: false, force: true, maintenant: M });
  const avantFuites = F.controleAntiFuiteForces({ database: db, graine: 20261005, empreinte: E1 });
  sortie.controleAvant = { lignes: avantFuites.lignes, ecarts: avantFuites.ecarts.length };
  const lignes2 = lignesRangees(E1);
  const parClub2 = new Map();
  for (const l of lignes2) {
    if (!parClub2.has(l.club)) parClub2.set(l.club, []);
    parClub2.get(l.club).push(l);
  }
  const clubs = [...parClub2.keys()].filter((c) => parClub2.get(c).length >= 6);
  // (a) club A : la ligne du 3e jour réécrite avec l'état du 4e (le match du 4e jour vu « avant » lui).
  const A = clubs[3];
  const lA = parClub2.get(A);
  const majLigne = db.prepare('UPDATE forces_buts SET ligue = ?, n = ?, nx = ?, sa = ?, wa = ?, sd = ?, wd = ?, sga = ?, wga = ?, sgd = ?, wgd = ? WHERE reglages = ? AND club = ? AND jour = ?');
  const ecrire = (club, jour, e) => majLigne.run(e.ligue, e.n, e.nx, e.sa, e.wa, e.sd, e.wd, e.sga, e.wga, e.sgd, e.wgd, E1, club, jour);
  ecrire(A, lA[2].jour, lA[3]);
  const fuiteA = { club: A, J: lA[3].jour };
  // (b) club B : l'état après son 5e match refait avec des moyennes qui COMPTENT le jour de ce match.
  const B = clubs[7];
  const lB = parClub2.get(B);
  const jourB = lB[4].jour;
  const faitsB = db.prepare('SELECT t.*, d.match_key AS matchKey FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre WHERE t.club = ? AND t.date <= ? ORDER BY t.date, d.match_key').all(B, jourB);
  const journees = (league, jusquA) =>
    db
      .prepare(`SELECT date AS jour, saison, COUNT(*) n, SUM(CASE WHEN prolongation = 1 THEN COALESCE(bp90, 0) ELSE bp END) bd, SUM(CASE WHEN prolongation = 1 THEN COALESCE(bc90, 0) ELSE bc END) be,
                SUM(CASE WHEN prolongation = 0 AND xg_p IS NOT NULL AND xg_c IS NOT NULL THEN 1 ELSE 0 END) nx, SUM(CASE WHEN prolongation = 0 AND xg_p IS NOT NULL AND xg_c IS NOT NULL THEN xg_p ELSE 0 END) xd,
                SUM(CASE WHEN prolongation = 0 AND xg_p IS NOT NULL AND xg_c IS NOT NULL THEN xg_c ELSE 0 END) xe
              FROM team_day WHERE camp = 1 AND attribue = 0 AND compte = 1 AND league = ? AND date <= ? GROUP BY date, saison ORDER BY date`)
      .all(league, jusquA)
      .map((y) => ({ ...y }));
  let etatB = null;
  for (const r of faitsB) {
    const f = G.faitPourLesForces(r);
    if (!f) continue;
    const decale = f.jour === jourB ? journees(f.league, f.jour).map((y) => ({ ...y, jour: y.jour === f.jour ? '0000-00-00' : y.jour })) : journees(f.league, f.jour);
    const Lg = G.moyennesAvant(decale.sort((p, q) => (p.jour < q.jour ? -1 : 1)), { jour: f.jour, saison: G.saisonEnNombre(f.saison) });
    etatB = G.jouerUnMatch(etatB, G.matchPourLesForces(f, Lg), reglages);
  }
  ecrire(B, jourB, etatB);
  const fuiteB = { club: B, J: lB[5].jour };
  const apresFuites = F.controleAntiFuiteForces({ database: db, graine: 20261005, empreinte: E1, couples: [fuiteA, fuiteB] });
  const nommes = [...new Set(apresFuites.ecarts.map((e) => `${e.club}|${e.J}`))].sort();
  sortie.controleApres = { lignes: apresFuites.lignes, ecarts: apresFuites.ecarts.length, couplesEnEcart: nommes, attendus: [`${fuiteA.club}|${fuiteA.J}`, `${fuiteB.club}|${fuiteB.J}`].sort(), colonnes: [...new Set(apresFuites.ecarts.map((e) => e.colonne))].sort() };
} else {
  throw new Error(`Phase inconnue : ${phase}`);
}

console.log(JSON.stringify(sortie));
