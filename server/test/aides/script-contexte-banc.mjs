/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-contexte-banc.mjs <serveur de la copie> <phase> <options JSON>
 *
 * LE BANC DU CONTEXTE (étape 32, partie B, 29/10/2026), sur un MAGASIN FABRIQUÉ (contexteFabrique.mjs : huit clubs réels de
 * venues.json, des matchs fabriqués — AUCUN résultat réel), réseau coupé, heure figée, base NEUVE de la copie :
 *   fabriquer   le magasin seul (pour les essais du script, qui le lisent ensuite) ;
 *   passe       la passe du banc AVEC et SANS les résultats : mêmes rencontres, mêmes caractéristiques ; la base au jour J
 *               = celle du banc de l'étape 27 (ForcesCourantes de bench/entrees.js + modeleDeButs sans cote) ; les
 *               rencontres = celles du flux de la nuit (rencontresChronologiques) jusqu'au dernier jour lu ;
 *   banc        le passage entier (passerLeBanc) sur des périodes d'essai : rien d'après le dernier jour lu ;
 *   meteo       une météo absurde plantée sur tous les matchs passés : le banc ne change pas d'un octet ;
 *   resultats   des scores, cartons et déroulés changés : les COMPTES ne changent pas d'un octet (aucun résultat lu) ;
 *   pelouse     un club au synthétique que l'export voit sur gazon : écarté (pelouse null au banc), et rien d'autre.
 * Sortie : une ligne JSON.
 */

import { importeur } from './versionsMoteurCommun.mjs';
import { fabriquerLeMagasin, plusJours } from './contexteFabrique.mjs';

const [serveur, phase, brut] = process.argv.slice(2);
const o = JSON.parse(brut ?? '{}');
const imp = importeur(serveur);
const M = await imp('data/db/matchStatsDb.js');
const s = { ok: true, phase };

/** Les périodes d'essai sur le magasin fabriqué (du 01/08/2026, 60 jours) : rien n'est lu après le dernier jour. */
const PERIODES_ESSAI = Object.freeze({
  miseEnRoute: { de: '2026-08-01', a: '2026-08-10' },
  plis: [
    { apprendre: { de: '2026-08-11', a: '2026-09-02' }, juger: { de: '2026-09-03', a: '2026-09-20' } },
    { apprendre: { de: '2026-09-03', a: '2026-09-20' }, juger: { de: '2026-08-11', a: '2026-09-02' } }
  ],
  dernierJourLu: '2026-09-20'
});

async function magasin(database) {
  const { lireStades } = await imp('data/reference/donneesDeReference.js');
  const { rebuildRegistries } = await imp('data/db/identityRegistry.js');
  return fabriquerLeMagasin(database, { venues: lireStades(), rebuildRegistries, debut: o.debut ?? '2026-08-01', jours: o.jours ?? 60 });
}
/** Les rencontres sans ce qui change d'un passage à l'autre (rien), triées. */
const sansFiche = (r) => {
  const { fiche, ...reste } = r;
  return reste;
};

if (phase === 'fabriquer') {
  const database = M.openDb();
  const fab = await magasin(database);
  s.matchs = fab.matchs.length;
  s.premier = fab.matchs[0].date;
  s.dernier = fab.matchs.at(-1).date;
  s.clubs = fab.clubs.map((c) => ({ id: c.id, nom: c.nom, synthetique: c.synthetique, altitude: c.altitude }));
} else if (phase === 'passe') {
  const database = M.openDb();
  const fab = await magasin(database);
  const E = await imp('data/contexte/contexteBancEnfant.js');
  const B = await imp('data/contexte/bancDuContexte.js');
  const L = await imp('data/contexte/lectureDuMagasin.js');
  const G = await imp('core/engine/goalModel.js');
  const F = await imp('data/db/forcesButs.js');
  const EN = await imp('bench/entrees.js');
  const { executerSansPause } = await imp('utils/travailCooperatif.js');
  const avec = E.passeDuBanc({ database, periodes: PERIODES_ESSAI, avecResultats: true });
  const sans = E.passeDuBanc({ database, periodes: PERIODES_ESSAI, avecResultats: false });
  s.matchsFabriques = fab.matchs.length;
  s.apresLeDernierJour = fab.matchs.filter((m) => m.date > PERIODES_ESSAI.dernierJourLu).length;
  s.avec = { rencontres: avec.rencontres.length, avecX: avec.rencontres.filter((r) => r.x).length, avecBase: avec.rencontres.filter((r) => r.base).length, avecButs: avec.rencontres.filter((r) => r.buts).length, dernier: avec.rencontres.at(-1).date };
  s.sans = { rencontres: sans.rencontres.length, avecX: sans.rencontres.filter((r) => r.x).length, avecBase: sans.rencontres.filter((r) => r.base).length, avecButs: sans.rencontres.filter((r) => r.buts).length, cartons: sans.rencontres.filter((r) => r.cartons).length, penalties: sans.rencontres.filter((r) => r.penalties !== null).length };
  // Les mêmes caractéristiques avec ou sans les résultats (la fiche ne lit aucun résultat).
  const xAvec = JSON.stringify(avec.rencontres.map((r) => [r.cle, r.x]));
  const xSans = JSON.stringify(sans.rencontres.map((r) => [r.cle, r.x]));
  s.memesCaracteristiques = xAvec === xSans;
  // La base au jour J = celle du banc de l'étape 27 (ForcesCourantes + modeleDeButs, régime sans cote).
  const fc = new EN.ForcesCourantes(B.BASE_STATISTIQUE);
  const attendues = new Map();
  let jour = null;
  for (const l of F.faitsDeTeamDay(database, { jusqua: PERIODES_ESSAI.dernierJourLu })) {
    if (jour !== null && l.date !== jour) fc.finDeJournee();
    jour = l.date;
    if (!l.attribue) {
      const st = G.modeleDeButs({ fair: null, entrees: fc.entrees({ source: 'magasin', home: l.club, away: l.adversaire, league: l.league, jour: l.date, saison: l.saison }), reglages: B.BASE_STATISTIQUE }).parties.statistiques;
      attendues.set(l.matchKey, { lambda: st.lambda, mu: st.mu });
    }
    fc.ajouter('magasin', l);
  }
  let ecartMax = 0;
  let comparees = 0;
  for (const r of avec.rencontres) {
    if (!r.base) continue;
    const a = attendues.get(r.cle);
    comparees += 1;
    ecartMax = Math.max(ecartMax, Math.abs(a.lambda - r.base.lambda), Math.abs(a.mu - r.base.mu));
  }
  s.base = { comparees, ecartMax, empreinte: G.empreinteDesForces(B.BASE_STATISTIQUE) };
  // Les rencontres du banc = celles du flux de la nuit (une seule chaîne), jusqu'au dernier jour lu.
  const maj = executerSansPause(L.mettreAJourLeCache(database));
  const flux = [...L.rencontresChronologiques({ database, cache: maj.cache, jusqua: PERIODES_ESSAI.dernierJourLu })];
  const lues = E.lireLesRencontres(database, { jusqua: PERIODES_ESSAI.dernierJourLu, avecResultats: true }).map((x) => x.r);
  s.memeFlux = JSON.stringify(flux) === JSON.stringify(lues);
  s.fluxRencontres = flux.length;
  s.exemple = avec.rencontres.find((r) => r.x && r.base && r.buts) ?? null;
} else if (phase === 'banc') {
  const database = M.openDb();
  const fab = await magasin(database);
  const E = await imp('data/contexte/contexteBancEnfant.js');
  const r = E.passerLeBanc({ database, periodes: PERIODES_ESSAI });
  s.matchsFabriques = fab.matchs.length;
  s.apresLeDernierJour = fab.matchs.filter((m) => m.date > PERIODES_ESSAI.dernierJourLu).length;
  s.comptes = r.comptes;
  s.K = r.banc.K;
  s.z = r.banc.z;
  s.plis = r.banc.matchs.plis;
  s.recalages = r.banc.recalages;
  s.variantes = r.banc.variantes.map((v) => ({ id: v.id, verdict: v.verdict, lignes: v.lignes, concernes: v.matchsConcernes, coefficients: v.coefficients.map((c) => ({ pli: c.pli, matchs: c.matchs, apprisSur: c.apprisSur, jugeSur: c.jugeSur })) }));
  s.zArbitreConnus = null;
} else if (phase === 'meteo') {
  const database = M.openDb();
  await magasin(database);
  const E = await imp('data/contexte/contexteBancEnfant.js');
  const avant = JSON.stringify(E.passerLeBanc({ database, periodes: PERIODES_ESSAI }).banc);
  const passeAvant = JSON.stringify(E.passeDuBanc({ database, periodes: PERIODES_ESSAI, avecResultats: true }).rencontres);
  // Une météo ABSURDE sur tous les matchs passés (99 °C, ouragan, 999 mm) : le banc ne la lit jamais.
  database.exec(`UPDATE matches SET meta = json_set(meta, '$.temperature', 99, '$.windSpeed', 99, '$.weather', 'Ouragan', '$.precipitation', 999)`);
  const apres = JSON.stringify(E.passerLeBanc({ database, periodes: PERIODES_ESSAI }).banc);
  const passeApres = JSON.stringify(E.passeDuBanc({ database, periodes: PERIODES_ESSAI, avecResultats: true }).rencontres);
  s.meteoPlantee = database.prepare("SELECT COUNT(*) AS n FROM matches WHERE json_extract(meta, '$.temperature') = 99").get().n;
  s.memeBanc = avant === apres;
  s.memePasse = passeAvant === passeApres;
  s.octets = avant.length;
} else if (phase === 'resultats') {
  const database = M.openDb();
  await magasin(database);
  const E = await imp('data/contexte/contexteBancEnfant.js');
  const { lireStades } = await imp('data/reference/donneesDeReference.js');
  const venues = lireStades();
  const exportPelouses = [];
  const nettoyer = (c) => {
    const { durees, ...reste } = c;
    return reste;
  };
  const avant = JSON.stringify(nettoyer(E.compterLeContexte({ database, periodes: PERIODES_ESSAI, venues, exportPelouses })));
  // Des scores, des cartons, des fautes et des déroulés CHANGÉS (jamais effacés : la présence d'un score reste la même).
  database.exec('UPDATE team_day SET bp = bp + 3, bc = bc + 1, bp90 = CASE WHEN bp90 IS NULL THEN NULL ELSE bp90 + 2 END, bc90 = CASE WHEN bc90 IS NULL THEN NULL ELSE bc90 + 1 END, jaunes_p = 9, jaunes_c = 9, rouges_p = 3, rouges_c = 3, fautes_p = 40, fautes_c = 40');
  database.exec(`UPDATE matches SET home_goals = home_goals + 3, away_goals = away_goals + 1, events = '[]'`);
  const apres = JSON.stringify(nettoyer(E.compterLeContexte({ database, periodes: PERIODES_ESSAI, venues, exportPelouses })));
  s.memesComptes = avant === apres;
  s.comptes = JSON.parse(avant);
} else if (phase === 'pelouse') {
  const database = M.openDb();
  const fab = await magasin(database);
  const E = await imp('data/contexte/contexteBancEnfant.js');
  const { lireStades } = await imp('data/reference/donneesDeReference.js');
  const venues = lireStades();
  const synthetique = fab.clubs.find((c) => c.synthetique);
  const ordinaire = fab.clubs.find((c) => !c.synthetique && c.altitude === null);
  // L'export gelé voyait le club au synthétique sur GAZON : désaccord → écarté ; l'ordinaire, d'accord partout → gardé.
  // L'export n'a pas l'identifiant du club : ses rencontres sont rattachées par leur clé (une clé inconnue est comptée).
  const exportParRencontre = [
    ...fab.matchs.filter((m) => m.home === synthetique.id).map((m) => [m.matchKey, 'naturelle']),
    ...fab.matchs.filter((m) => m.home === ordinaire.id).map((m) => [m.matchKey, 'naturelle']),
    ['2026-08-02-club-absent-autre-club', 'synthetique']
  ];
  const c = E.compterLeContexte({ database, periodes: PERIODES_ESSAI, venues, exportParRencontre });
  s.clubsEcartes = c.pelouse.clubs;
  s.rattachement = c.pelouse.exportRattache;
  s.attenduesRattachees = exportParRencontre.length - 1 - fab.matchs.filter((m) => m.date > PERIODES_ESSAI.dernierJourLu && (m.home === synthetique.id || m.home === ordinaire.id)).length;
  s.synthetique = synthetique.id;
  s.ordinaire = ordinaire.id;
  const garde = E.passeDuBanc({ database, periodes: PERIODES_ESSAI, avecResultats: true, pelousesEcartees: [] });
  const ecarte = E.passeDuBanc({ database, periodes: PERIODES_ESSAI, avecResultats: true, pelousesEcartees: c.pelouse.clubs.map((x) => x.club) });
  const dom = (liste, club) => liste.rencontres.filter((r) => r.x && r.home === club).map((r) => r.x.synthetique);
  s.syntheticGarde = dom(garde, synthetique.id);
  s.syntheticEcarte = dom(ecarte, synthetique.id);
  s.ordinaireEcarte = dom(ecarte, ordinaire.id);
  // Rien d'autre ne bouge : toutes les autres caractéristiques identiques.
  const autres = (liste) => JSON.stringify(liste.rencontres.map((r) => (r.x ? { ...r.x, synthetique: null } : null)));
  s.autresIdentiques = autres(garde) === autres(ecarte);
  s.plusJours = plusJours('2026-09-20', 1);
} else {
  s.ok = false;
  s.erreur = `phase inconnue « ${phase} »`;
}
console.log(JSON.stringify(s));
