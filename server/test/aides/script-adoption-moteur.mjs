/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-adoption-moteur.mjs <serveur de la copie> parcours
 *
 * Étape 25 du plan, SECONDE MOITIÉ — le chemin « candidate → à blanc → jugée → adoptée » de bout en bout, sur la
 * base d'essai de la copie, réseau coupé, heure figée au 20/11/2026 (après l'essai), aucun Claude. Le code ne
 * déclare aucune candidate (la première viendra de l'étape 27) : les trois candidates sont FABRIQUÉES, comme
 * leurs 270 matchs joués (au magasin de la copie, du 02/10 au 15/11) et leurs lignes à blanc (dans leur table,
 * par le dépôt) — une moins bonne, une pas prouvée, une meilleure que la version en service. Tout le reste est
 * le VRAI code : l'étape de nuit (calculerABlanc, l'essai jugé), le juge de l'étape 16 et ses registres (ceux de
 * la COPIE : data/runtime), les routes de Réglages (GET versions, POST adopter, POST retour, POST banc).
 * Sortie : une ligne JSON (ce que les tests vérifient, et les réponses de la route pour l'écran).
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur, requeteExpress, photo, photoDuDossier, matchsDuCalendrier, moteurDe } from './versionsMoteurCommun.mjs';
import { recopierScripts } from './claudeSimule.mjs';

const [serveur, phase] = process.argv.slice(2);
if (phase !== 'parcours') throw new Error(`Phase inconnue : ${phase}`);
const imp = importeur(serveur);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const FICHIER_CONFIG = path.join(RUNTIME, 'engine-config.json');
const FICHIER_VERSIONS = path.join(RUNTIME, 'engine-versions.json');
const FICHIER_MESURE = path.join(RUNTIME, 'registre-mesure.json');
const FICHIER_VERROU = path.join(RUNTIME, 'espn-refresh.lock');
const FICHIER_ETAT = path.join(RUNTIME, 'refresh-status.json');

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const V = await imp('core/engine/engineVersions.js');
const T = await imp('bench/trialsRegistry.js');
// Les registres que le code lit et écrit sont ceux de la COPIE, jamais d'autres.
if (path.resolve(V.FICHIER_VERSIONS).toLowerCase() !== path.resolve(FICHIER_VERSIONS).toLowerCase()) throw new Error(`Registre inattendu : ${V.FICHIER_VERSIONS}`);
if (path.resolve(T.FICHIER_REGISTRE).toLowerCase() !== path.resolve(FICHIER_MESURE).toLowerCase()) throw new Error(`Registre de la mesure inattendu : ${T.FICHIER_REGISTRE}`);
recopierScripts(serveur);
const { createApp } = await imp('app.js');
const app = createApp();
const requete = (methode, url, corps) => requeteExpress(app, methode, url, corps);
const { calculerABlanc } = await imp('data/enregistreurs/moteurABlanc.js');
const { ecrirePronosticsABlanc } = await imp('data/enregistreurs/depot.js');
const C = await imp('data/calibration.js');
const D = await imp('data/deriveMoteur.js');
const R = await imp('data/repositories/refreshStatusRepository.js');
const job = await imp('jobs/matchStatsAutoRefresh.js');
const { getEngineConfig } = await imp('core/engine/engineConfig.js');

const lire = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const s = { ok: true, phase, routes: {} };
const DEBUT_ESSAI = Date.parse('2026-10-01T03:00:00.000Z');
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ------------------------------------------------ 270 matchs joués, fabriqués au magasin de la copie

const N = 270;
const MATCHS = Array.from({ length: N }, (_, i) => {
  const date = plusJours('2026-10-02', Math.floor(i / 6));
  // Trois fois sur quatre, les deux équipes marquent (1-1 ou 2-1) ; sinon 0-0, 1-0 ou 2-0.
  const deux = i % 4 !== 0;
  const [hg, ag] = deux ? [1 + (i % 2), 1] : [i % 3, 0];
  return { cle: `essai25b-${i}`, date, home: `fotmob-97${String(i).padStart(4, '0')}`, away: `fotmob-98${String(i).padStart(4, '0')}`, hg, ag, kickoff: `${date}T18:00:00.000Z`, deux };
});
const inserer = database.prepare(
  `INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, home_goals, away_goals, meta, updated_at)
   VALUES (?, ?, ?, 'Championship', ?, ?, ?, ?, ?, ?, ?, ?)`
);
database.exec('BEGIN');
for (const m of MATCHS) inserer.run(m.cle, m.cle, m.date, `Essai Dom ${m.cle}`, `Essai Ext ${m.cle}`, m.home, m.away, m.hg, m.ag, JSON.stringify({ kickoff: m.kickoff }), '2026-11-16T00:00:00.000Z');
database.exec('COMMIT');

/**
 * Les lignes à blanc d'une candidate (le marché « les deux équipes marquent ») : la version en service dit `a`, la
 * candidate `b` (des fonctions du match), gelées la veille du match. Écrites par le dépôt, comme la nuit.
 */
function planterLesLignes(candidate, empreinte, { a, b }) {
  const lignes = MATCHS.map((m, i) => {
    const da = a(i, m);
    const db = b(i, m);
    return {
      candidateId: candidate.id,
      candidateHash: empreinte,
      serviceVersion: 1,
      recordedAt: `${plusJours(m.date, -1)}T03:00:00.000Z`,
      fixtureKey: `fotmob:${m.home}|${m.away}|${m.date}`,
      matchId: m.cle,
      league: 'Championship',
      date: m.date,
      kickoff: m.kickoff,
      homeName: `Essai Dom ${m.cle}`,
      awayName: `Essai Ext ${m.cle}`,
      homeId: m.home,
      awayId: m.away,
      marketKey: 'bothTeamsScore',
      marketId: 'bothTeamsScore',
      market: 'Les 2 équipes marquent',
      params: null,
      choice: db.yes >= 0.5 ? 'yes' : 'no',
      label: db.yes >= 0.5 ? 'Oui' : 'Non',
      probability: Math.max(db.yes, db.no),
      predictedOdds: Number((1 / Math.max(db.yes, db.no)).toFixed(2)),
      distribution: JSON.stringify({ issues: db }),
      serviceParams: null,
      serviceChoice: da.yes >= 0.5 ? 'yes' : 'no',
      serviceProbability: Math.max(da.yes, da.no),
      servicePredictedOdds: Number((1 / Math.max(da.yes, da.no)).toFixed(2)),
      serviceDistribution: JSON.stringify({ issues: da }),
      oddsSource: null,
      oddsAt: null,
      lineupState: null
    };
  });
  return ecrirePronosticsABlanc(lignes, { database });
}
const egal = { yes: 0.5, no: 0.5 };
const PROFILS = {
  // La candidate donne 50/50 quand la version en service dit 70/30 (et les deux marquent trois fois sur quatre) : moins bonne.
  moinsBon: { a: () => ({ yes: 0.7, no: 0.3 }), b: () => egal },
  // Un écart dans un sens puis dans l'autre, par blocs de quatre matchs (sans lien avec le score) : pas prouvé.
  pasProuve: { a: () => egal, b: (i) => (Math.floor(i / 4) % 2 === 0 ? { yes: 0.55, no: 0.45 } : { yes: 0.45, no: 0.55 }) },
  // La candidate dit 70/30 quand la version en service dit 50/50 : meilleure, au-delà du hasard.
  retenu: { a: () => egal, b: () => ({ yes: 0.7, no: 0.3 }) }
};
const fabriquer = (id, rho) =>
  Object.freeze({
    id,
    etape: '27',
    quoi: `Corrélation Dixon-Coles à ${rho} (candidate d’essai)`,
    modifications: { football: { defaultCorrelation: rho } },
    marches: ['bothTeamsScore'],
    horizon: { matchs: 250, jours: 14 }
  });
const MOINS_BON = fabriquer('essai-moins-bon', -0.11);
const PAS_PROUVE = fabriquer('essai-pas-prouve', -0.12);
const RETENU = fabriquer('essai-retenu', -0.13);

const lignesDeLaTable = (id) => database.prepare('SELECT COUNT(*) AS n FROM engine_candidate_picks WHERE candidate_id = ?').get(id).n;
const etatDuRegistre = () => {
  const r = lire(FICHIER_VERSIONS);
  return { enService: r.enService, pile: r.pile, versions: r.versions.map((v) => [v.numero, v.origine]), candidate: r.candidate, passees: r.candidatesPassees, journal: r.journal, lancementADeclarer: r.lancementADeclarer ?? null };
};
const photos = () => ({ config: photo(FICHIER_CONFIG), versions: photo(FICHIER_VERSIONS), mesure: photo(FICHIER_MESURE) });
const versions = async () => (await requete('GET', '/api/config/versions')).corps;
const adopter = (corps) => requete('POST', '/api/config/versions/adopter', corps);

// ------------------------------------------------ 0. le départ : version 1, ce que l'appli montre

fs.writeFileSync(path.join(RUNTIME, 'bets.json'), '[]');
fs.writeFileSync(path.join(RUNTIME, 'predictions.json'), '[]');
s.demarrage = V.demarrerVersions();
const calendrier = await matchsDuCalendrier(imp);
const montre = async () => {
  const out = [];
  for (const m of calendrier) out.push(await moteurDe(imp, m));
  return out;
};
const avantTout = await montre();
s.routes.depart = await versions();
const journaux = () => ({ paris: photo(path.join(RUNTIME, 'bets.json')), pronostics: photo(path.join(RUNTIME, 'predictions.json')), analyses: photo(path.join(RUNTIME, 'match-ai-analyses.json')) });
const journauxAvant = journaux();

// ------------------------------------------------ 1. une candidate MOINS BONNE

// Proposée par un « module » (origine « essai ») : la route la voit comme celle du code ; l'essai commence le 01/10.
const x = V.proposerUneCandidate(MOINS_BON, { origine: 'essai', maintenant: DEBUT_ESSAI });
s.moinsBon = { misEnEssai: { essai: x.candidate.essai, change: x.change }, plantees: planterLesLignes(MOINS_BON, x.candidate.empreinte, PROFILS.moinsBon) };
s.moinsBon.nuit = await calculerABlanc({ matchs: [], dansLaPasse: true });
s.moinsBon.registre = etatDuRegistre().candidate;
s.moinsBon.route = await versions();
s.routes.moinsBon = s.moinsBon.route;
let avant = photos();
s.moinsBon.adopter = await adopter({ depuis: 1, candidate: MOINS_BON.id });
s.moinsBon.rienEcrit = JSON.stringify(photos()) === JSON.stringify(avant);
// Une seconde nuit : rien de plus calculé, jamais un second jugement.
s.moinsBon.secondeNuit = await calculerABlanc({ matchs: [], dansLaPasse: true });
s.moinsBon.etapeDeLaPasse = await job.__testing.passeMoteurABlanc({}, { matchs: [] });
s.moinsBon.jugementsAuRegistre = T.jugementsDe('27').filter((j) => j.version === MOINS_BON.id).map((j) => ({ principal: j.principal, verdict: j.verdict, matchs: j.n?.matchs, variantes: j.seuil?.variantes, lancement: j.lancement, fenetre: j.fenetre }));

// ------------------------------------------------ 2. une candidate PAS PROUVÉE (elle remplace la première)

const y = V.proposerUneCandidate(PAS_PROUVE, { origine: 'essai', remplacer: true, maintenant: DEBUT_ESSAI });
s.pasProuve = { plantees: planterLesLignes(PAS_PROUVE, y.candidate.empreinte, PROFILS.pasProuve) };
s.pasProuve.nuit = await calculerABlanc({ matchs: [], dansLaPasse: true });
s.pasProuve.route = await versions();
s.routes.pasProuve = s.pasProuve.route;
avant = photos();
s.pasProuve.adopter = await adopter({ depuis: 1, candidate: PAS_PROUVE.id });
s.pasProuve.rienEcrit = JSON.stringify(photos()) === JSON.stringify(avant);

// ------------------------------------------------ 3. une candidate MEILLEURE : premiers chiffres, puis le verdict

const z = V.proposerUneCandidate(RETENU, { origine: 'essai', remplacer: true, maintenant: DEBUT_ESSAI });
s.retenu = { essai: z.candidate.essai, plantees: planterLesLignes(RETENU, z.candidate.empreinte, PROFILS.retenu) };
// La nuit du 12/10 : dix jours de matchs joués, sous l'horizon — des premiers chiffres, aucun verdict.
s.retenu.nuitDu12 = await calculerABlanc({ matchs: [], dansLaPasse: true, maintenant: Date.parse('2026-10-12T03:00:00.000Z') });
s.retenu.premiers = etatDuRegistre().candidate;
// Le banc avant l'essai dit « retenu » sur l'historique (verdict fabriqué, rangé par le vrai code) : INDICATIF.
s.retenu.bancRange = V.noterLeBancDeLaCandidate(
  { indicatif: true, le: '2026-10-12T09:00:00.000Z', periodes: ['P2'], prix: ['fd-avant-match'], marches: ['bothTeamsScore'], paires: 30158, matchs: 30158, variantes: 3, a: 0.7276, b: 0.7012, gainPct: 3.63, fourchettePct: [2.1, 5.2], verdict: 'retenu', raison: 'L’amélioration dépasse ce que le hasard explique.', dejaVues: { lignes: 0, part: 0, vuesDeclarees: false }, erreur: null },
  { id: RETENU.id, empreinte: z.candidate.empreinte }
);
s.retenu.routeAvant = await versions();
s.routes.essaiEnCours = s.retenu.routeAvant;
avant = photos();
s.retenu.adopterTropTot = await adopter({ depuis: 1, candidate: RETENU.id });
s.retenu.rienEcritTropTot = JSON.stringify(photos()) === JSON.stringify(avant);
// Rien de ce que l'appli montre n'a bougé : trois essais, trois candidates, deux jugements plus tard.
s.invisible = { moteur: JSON.stringify(await montre()) === JSON.stringify(avantTout), journaux: JSON.stringify(journaux()) === JSON.stringify(journauxAvant) };
// La nuit d'aujourd'hui (20/11) : l'horizon est atteint, le juge se prononce.
s.retenu.nuit = await calculerABlanc({ matchs: [], dansLaPasse: true });
s.retenu.jugement = etatDuRegistre().candidate.jugement;
s.retenu.route = await versions();
s.routes.retenu = s.retenu.route;

// ------------------------------------------------ 4. les refus avant l'adoption (rien ne bouge)

avant = photos();
const maintenantIso = new Date().toISOString();
fs.writeFileSync(FICHIER_VERROU, JSON.stringify({ pid: process.pid, token: 'essai-25b', startedAt: maintenantIso, heartbeatAt: maintenantIso }));
s.refus = { pendantUnePasse: await adopter({ depuis: 1, candidate: RETENU.id }) };
s.routes.passeEnCours = await versions();
fs.rmSync(FICHIER_VERROU, { force: true });
s.refus.sansDepuis = await adopter({ candidate: RETENU.id });
s.refus.sansCandidate = await adopter({ depuis: 1 });
s.refus.depuisPerime = await adopter({ depuis: 7, candidate: RETENU.id });
s.refus.autreCandidate = await adopter({ depuis: 1, candidate: MOINS_BON.id });
s.refus.rienEcrit = JSON.stringify(photos()) === JSON.stringify(avant);
// Le registre de la mesure illisible (OneDrive le tient) : le lancement ne pourrait pas y être déclaré — 503, rien n'est adopté.
const mesureLisible = fs.readFileSync(FICHIER_MESURE, 'utf8');
fs.writeFileSync(FICHIER_MESURE, '{"version":1,"etapes":');
const avantIllisible = { config: photo(FICHIER_CONFIG), versions: photo(FICHIER_VERSIONS) };
s.refus.mesureIllisible = await adopter({ depuis: 1, candidate: RETENU.id });
s.refus.mesureIllisibleRienEcrit = JSON.stringify({ config: photo(FICHIER_CONFIG), versions: photo(FICHIER_VERSIONS) }) === JSON.stringify(avantIllisible) && fs.readFileSync(FICHIER_MESURE, 'utf8') === '{"version":1,"etapes":';
fs.writeFileSync(FICHIER_MESURE, mesureLisible);


// ------------------------------------------------ 5. L'ADOPTION : une seule écriture des réglages, une version de plus

const renommages = [];
const renommer = fs.renameSync;
fs.renameSync = (de, vers) => {
  renommages.push(path.basename(String(vers)));
  return renommer(de, vers);
};
const configAvant = fs.existsSync(FICHIER_CONFIG) ? lire(FICHIER_CONFIG) : null;
s.adoption = { reponse: await adopter({ depuis: 1, candidate: RETENU.id }) };
fs.renameSync = renommer;
s.adoption.ecrituresConfig = renommages.filter((n) => n === 'engine-config.json').length;
s.adoption.ecrituresVersions = renommages.filter((n) => n === 'engine-versions.json').length;
s.adoption.configAvant = configAvant;
s.adoption.configApres = lire(FICHIER_CONFIG);
s.adoption.registre = etatDuRegistre();
s.adoption.mesure = lire(FICHIER_MESURE).etapes?.['27'] ?? null;
s.adoption.variantes = T.variantesDe('27').map((v) => [v.id, v.ou]);
s.adoption.lancement = T.lancementDe('27');
s.adoption.enService = { reglage: getEngineConfig('football').defaultCorrelation, numero: V.numeroDeVersion(getEngineConfig('football'), 'football') };
s.adoption.moteur = (await montre()).map((r) => r.engineVersion);
s.routes.apresAdoption = await versions();
s.adoption.doubleClic = await adopter({ depuis: 1, candidate: RETENU.id });
// La nuit suivante : la candidate adoptée n'est plus jamais calculée à blanc.
const lignesAvant = lignesDeLaTable(RETENU.id);
s.adoption.nuitApres = await calculerABlanc({ candidate: RETENU, matchs: calendrier, dansLaPasse: true });
s.adoption.lignesApres = lignesDeLaTable(RETENU.id) - lignesAvant;
// Et elle se défait comme toute version : le retour arrière remet la version 1, exactement.
s.adoption.retour = await requete('POST', '/api/config/versions/retour', { depuis: 2 });
s.adoption.apresRetour = { reglage: getEngineConfig('football').defaultCorrelation, enService: lire(FICHIER_VERSIONS).enService, moteur: JSON.stringify(await montre()) === JSON.stringify(avantTout) };

// ------------------------------------------------ 6. un lancement resté « à déclarer » : déclaré au démarrage suivant

const brut = lire(FICHIER_VERSIONS);
fs.writeFileSync(FICHIER_VERSIONS, JSON.stringify({ ...brut, lancementADeclarer: { etape: '28', version: 'essai-en-attente', quoi: 'Lancement fabriqué resté à déclarer' } }));
s.enAttente = { route: (await versions()).lancementADeclarer };
s.enAttente.demarrage = V.demarrerVersions();
s.enAttente.apres = lire(FICHIER_VERSIONS).lancementADeclarer ?? null;
s.enAttente.lancement = T.lancementDe('28');

// ------------------------------------------------ 7. la candidate proposée par un module (le point d'entrée de l'étape 26)

try {
  V.proposerUneCandidate({ ...fabriquer('essai-proposee', -0.14), horizon: undefined }, {});
} catch (error) {
  s.proposeeSansOrigine = error.message;
}
try {
  V.proposerUneCandidate({ id: 'essai-code', etape: '27', quoi: 'Q', modifications: { football: { defaultCorrelation: -0.14 } }, marches: ['totalGoals'] }, { origine: 'code' });
} catch (error) {
  s.proposeeOrigineCode = error.message;
}
// Avec une variante regardée pendant sa construction : comptée dès la mise à blanc (« construction »).
s.proposee = V.proposerUneCandidate(
  { id: 'essai-proposee', etape: '27', quoi: 'Proposée par la correction du mois (essai)', modifications: { football: { defaultCorrelation: -0.14 } }, marches: ['totalGoals'], variantes: [{ id: 'essai-proposee-v0', quoi: 'sans le réglage du mois' }] },
  { origine: 'correction-mensuelle' }
);
s.proposeeVariantes = T.variantesDe('27').map((v) => [v.id, v.ou]);
s.proposeeRoute = (await versions()).candidate;
s.proposeeAuDemarrage = V.demarrerVersions().candidate?.candidate?.id ?? null;
s.proposeeEnEssai = V.candidateEnEssai()?.id ?? null;
try {
  V.proposerUneCandidate({ id: 'essai-autre', etape: '27', quoi: 'Une autre', modifications: { football: { defaultCorrelation: -0.16 } }, marches: ['totalGoals'] }, { origine: 'correction-mensuelle' });
} catch (error) {
  s.proposeeDejaUne = error.message;
}

// ------------------------------------------------ 8. le banc avant l'essai par la route (la base d'essai n'a pas d'historique)

s.banc = { lance: await requete('POST', '/api/config/versions/candidate/banc', {}) };
const { bancDeLaCandidateEnCours, dernierRefusDuBanc } = await imp('bench/bancCandidate.js');
for (let i = 0; i < 400 && bancDeLaCandidateEnCours(); i++) await new Promise((fin) => setTimeout(fin, 25));
s.banc.fini = bancDeLaCandidateEnCours() === null;
s.banc.refus = dernierRefusDuBanc();
s.banc.range = lire(FICHIER_VERSIONS).candidate?.banc ?? null;
// Pendant une passe (le verrou d'un autre processus) : refusé, rien de lancé.
const t = new Date().toISOString();
fs.writeFileSync(FICHIER_VERROU, JSON.stringify({ pid: process.pid, token: 'essai-25b', startedAt: t, heartbeatAt: t }));
s.banc.pendantUnePasse = await requete('POST', '/api/config/versions/candidate/banc', {});
fs.rmSync(FICHIER_VERROU, { force: true });
s.banc.sansCandidateLancee = bancDeLaCandidateEnCours();

// ------------------------------------------------ 8 bis. la version en service change pendant l'essai : il recommence

s.recommence = { avant: lire(FICHIER_VERSIONS).candidate.essai };
s.recommence.reglage = (await requete('PUT', '/api/config', { edgeThresholdMin: 0.03 })).corps?.version ?? null;
s.recommence.nuit = (await calculerABlanc({ matchs: [], dansLaPasse: true })).essai ?? null;
const apresRecommence = lire(FICHIER_VERSIONS).candidate;
s.recommence.apres = { essai: apresRecommence.essai, premiersChiffres: apresRecommence.premiersChiffres?.matchs ?? null, banc: Boolean(apresRecommence.banc) };
s.recommence.variantes = T.variantesDe('27').map((v) => v.id);
s.recommence.route = (await versions()).candidate?.statut ?? null;

// ------------------------------------------------ 9. la dérive : un mois figé fabriqué, l'alerte durable

const caseDe = (marche, libelle, matchs, annonce, realise, verdict, fourchette) => ({ marche, libelle, pronostics: matchs + 20, matchs, annonce, realise, ecart: realise - annonce, juge: { verdict, matchs, minimum: 200, ecart: realise - annonce, fourchette, variantes: 14 } });
const bilanOctobre = {
  version: 1,
  mois: '2026-10',
  du: '2026-10-01',
  au: '2026-10-31',
  pronostics: { geles: 1500 },
  vues: {
    premiere: {
      global: { pronostics: 1400, matchs: 520, annonce: 0.6, realise: 0.55, ecart: -0.05 },
      parMarche: [
        caseDe('totalGoals', 'Total buts', 480, 0.62, 0.48, 'trop-haut', [-0.2, -0.08]),
        caseDe('bothTeamsScore', 'Les 2 équipes marquent', 460, 0.6, 0.51, 'trop-haut', [-0.15, -0.03]),
        caseDe('result', 'Résultat (1N2)', 150, 0.6, 0.3, 'trop-peu', null)
      ],
      cloture: { mesures: 300, moyenne: -2.1, juge: { verdict: 'negative', matchs: 260, minimum: 200, fourchette: [-3.4, -0.8] } }
    }
  },
  paris: { cloture: { paris: 0, mesures: 0 } }
};
s.derive = { fige: C.figerLeMois(bilanOctobre, { database }).ecrit };
const evaluation = D.evaluerDerive(C.bilanFige('2026-10', { database }));
R.setAlert(D.CLE_ALERTE_DERIVE, D.valeurDeLAlerte(evaluation));
s.derive.route = (await versions()).derive;
s.routes.derive = await versions();
s.derive.feuille = (await requete('GET', '/api/roadmap')).corps?.alerteDerive ?? null;
// L'étape mensuelle sans mois à figer ne touche pas à l'alerte (durable) : aucune clé « alert » dans son bilan.
s.derive.etapeRien = await job.__testing.passeCalibrationMensuelle({});
s.derive.alerteGardee = lire(FICHIER_ETAT).alerts?.deriveMoteur?.mois ?? null;

s.runtime = Object.keys(photoDuDossier(RUNTIME)).sort();
console.log(JSON.stringify(s));
