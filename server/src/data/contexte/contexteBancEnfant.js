/**
 * contexteBancEnfant.js — LE BANC DU CONTEXTE, DANS UN PROCESSUS À PART (étape 32 du plan, partie B, 29/10/2026).
 * -----------------------------------------------------------------------
 * Lancé par scripts/match-context.mjs (fork, sérialisation « avancée », argument « --enfant-contexte-banc ») ; ce n'est
 * pas un script à lancer à la main. La base est ouverte EN LECTURE SEULE avant toute lecture (openDb({ readonly: true })) ;
 * aucune écriture, aucune horloge (seules des durées), ni réseau, ni Claude. (L'enfant de la nuit, contexteEnfant.js, est
 * celui du lot 1a : il n'est pas touché ; le banc a le sien.) Deux modes (le diagnostic de la météo vit à part, hors de
 * data/contexte/ : data/db/diagnosticMeteoEnfant.js — rien du contexte ne lit la météo d'une rencontre) :
 *   « comptes »          AUCUN RÉSULTAT LU : les rencontres sont lues sans score, sans buts, sans cartons, sans déroulé
 *                        (seule la PRÉSENCE d'un score à la 90e est comptée) ; la même passe chronologique que le banc
 *                        (ContexteAuJourJ) donne la fiche de chaque match, et les couvertures de chaque facteur sur
 *                        chaque fenêtre sont comptées ; la liste des clubs dont la pelouse a pu changer (la base, l'export
 *                        du 22/09 et venues.json en désaccord) en sort, à figer avant le regard ;
 *   « banc »             LE PASSAGE UNIQUE : la même lecture AVEC les résultats, bornée au dernier jour lu (rien de P5) ;
 *                        la base statistique au jour J (AccumulateurDesForces de la nuit, modeleDeButs sans cote, réglages
 *                        BASE_STATISTIQUE) ; la fiche au jour J ; puis bancDuContexte.js juge.
 * Une seule chaîne : les lignes du cache (ligneDuCache) et les rencontres (rencontreDuFlux) de lectureDuMagasin.js, la
 * fiche de contexteAuJourJ.js, les forces de forcesButs.js, le modèle de goalModel.js — importés, jamais modifiés.
 * `passeDuBanc`, `compterLeContexte` et `passerLeBanc` sont aussi appelables dans le processus
 * courant (les essais, sur une copie).
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { lireStades } from '../reference/donneesDeReference.js';
import { executerSansPause } from '../../utils/travailCooperatif.js';
import { AccumulateurDesForces } from '../db/forcesButs.js';
import { modeleDeButs, faitsDeLaRencontre, saisonEnNombre, empreinteDesForces } from '../../core/engine/goalModel.js';
import { ContexteAuJourJ, passerLesRencontres, indexDesProchains } from './contexteAuJourJ.js';
import { ligneDuCache, rencontreDuFlux } from './lectureDuMagasin.js';
import { numeroDuClub, pelouseDe, texteStable, jourDe } from './formulesDuContexte.js';
import { isCup } from '../providers/leagueCups.js';
import { PERIODES_DU_BANC } from './reglagesContexte.js';
import { BASE_STATISTIQUE, EMPREINTE_DE_LA_BASE, caracteristiquesDeLaFiche, recalagesDesPlis, indicesDArbitreParPli, jugerLesVariantes, FORMES, lignesDeLaForme, VARIANTES_JUGEES } from './bancDuContexte.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const dans = (jour, p) => jour >= p.de && jour <= p.a;
/** Le premier jour des deux plis (apprentissage ou jugement) : avant lui, la mise en route accumule sans rien juger. */
const debutDesPlis = (periodes) => periodes.plis.flatMap((p) => [p.apprendre.de, p.juger.de]).sort()[0];

if (empreinteDesForces(BASE_STATISTIQUE) !== EMPREINTE_DE_LA_BASE) throw new Error('banc du contexte : l’empreinte des forces de la base a changé');

// ======================================================= la lecture du magasin (deux formes : sans résultat, avec)

/**
 * SANS AUCUN RÉSULTAT (« comptes ») : le registre du jour J, les drapeaux de la table du jour J (attribué, prolongation,
 * coupe) et la seule PRÉSENCE d'un score à la 90e, la page d'avant-match (coup d'envoi, stade, pelouse, nom et pays de
 * l'arbitre) et les entraîneurs. Jamais un score, un but, un carton, un déroulé, ni la météo.
 */
export const SQL_DES_COMPTES = `SELECT d.match_key, d.fotmob_id, d.date, d.league, d.saison, d.home, d.away,
  t.attribue, t.prolongation, t.coupe,
  CASE WHEN t.bp90 IS NOT NULL AND t.bc90 IS NOT NULL THEN 1 ELSE 0 END AS a_score90,
  json_extract(m.meta, '$.kickoff') AS kickoff, json_extract(m.meta, '$.stadium') AS stade,
  json_extract(m.meta, '$.surface') AS surface, json_extract(m.meta, '$.referee.name') AS arbitre_nom,
  json_extract(m.meta, '$.referee.country') AS arbitre_pays,
  sh.coach AS coach_dom, sh.coach_id AS coach_id_dom, sa.coach AS coach_ext, sa.coach_id AS coach_id_ext
  FROM day_matches d
  JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1
  LEFT JOIN matches m ON m.match_key = d.match_key
  LEFT JOIN team_style_matches sh ON sh.match_key = d.match_key AND sh.camp = 1
  LEFT JOIN team_style_matches sa ON sa.match_key = d.match_key AND sa.camp = 0
  WHERE d.date <= ?
  ORDER BY d.date, d.match_key`;

/**
 * AVEC LES RÉSULTATS (« banc », le passage unique) : la même lecture, plus la ligne du camp qui reçoit pour les forces
 * (buts, buts à la 90e, xG, compte), les cartons et les fautes (l'arbitre), les moyennes du championnat au jour J
 * (league_day), le score et le déroulé (les penalties : règle de ligneDuCache). Bornée au dernier jour lu. Jamais la météo
 * ni les moyennes d'arbitre de FotMob.
 */
export const SQL_DU_BANC = `SELECT d.match_key, d.fotmob_id, d.date, d.league, d.saison, d.home, d.away,
  t.club, t.adversaire, t.camp, t.attribue, t.prolongation, t.compte, t.coupe, t.bp, t.bc, t.bp90, t.bc90, t.xg_p, t.xg_c,
  t.jaunes_p, t.jaunes_c, t.rouges_p, t.rouges_c, t.fautes_p, t.fautes_c,
  ld.l_source, ld.l_n, ld.l_bd, ld.l_be,
  sh.coach AS coach_dom, sh.coach_id AS coach_id_dom, sa.coach AS coach_ext, sa.coach_id AS coach_id_ext,
  json_extract(m.meta, '$.kickoff') AS kickoff, json_extract(m.meta, '$.stadium') AS stade,
  json_extract(m.meta, '$.surface') AS surface, json_extract(m.meta, '$.referee.name') AS arbitre_nom,
  json_extract(m.meta, '$.referee.country') AS arbitre_pays, m.home_goals, m.away_goals, m.events
  FROM day_matches d
  JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1
  LEFT JOIN league_day ld ON ld.league = d.league AND ld.date = d.date
  LEFT JOIN team_style_matches sh ON sh.match_key = d.match_key AND sh.camp = 1
  LEFT JOIN team_style_matches sa ON sa.match_key = d.match_key AND sa.camp = 0
  LEFT JOIN matches m ON m.match_key = d.match_key
  WHERE d.date <= ?
  ORDER BY d.date, d.match_key`;

/**
 * Les rencontres du magasin jusqu'au jour `jusqua` inclus, dans l'ordre (jour, clé) : { r (rencontreDuFlux), fait (la
 * ligne du camp qui reçoit, pour les forces ; null sans résultat), aScore90, surfaceBrute }. `avecResultats` : false pour
 * les comptes (rien de ce qui s'est passé pendant le match n'est lu).
 */
export function lireLesRencontres(database, { jusqua, avecResultats }) {
  const fin = jourDe(jusqua);
  if (!fin) throw new Error(`banc du contexte : dernier jour illisible (« ${String(jusqua)} »)`);
  const out = [];
  for (const l of database.prepare(avecResultats ? SQL_DU_BANC : SQL_DES_COMPTES).iterate(fin)) {
    const cache = ligneDuCache(
      { match_key: l.match_key, kickoff: l.kickoff, stade: l.stade, surface: l.surface, arbitre_nom: l.arbitre_nom, arbitre_pays: l.arbitre_pays, home_goals: avecResultats ? l.home_goals : null, away_goals: avecResultats ? l.away_goals : null, events: avecResultats ? l.events : null },
      ''
    );
    const r = rencontreDuFlux(avecResultats ? l : { ...l, bp: null, bc: null, bp90: null, bc90: null }, cache);
    out.push({
      r,
      fait: avecResultats ? { matchKey: l.match_key, club: l.club, adversaire: l.adversaire, camp: l.camp, date: l.date, league: l.league, saison: l.saison, attribue: l.attribue, prolongation: l.prolongation, compte: l.compte, coupe: l.coupe, bp: l.bp, bc: l.bc, bp90: l.bp90, bc90: l.bc90, xg_p: l.xg_p, xg_c: l.xg_c } : null,
      aScore90: avecResultats ? r.buts90 !== null : Boolean(Number(l.a_score90)) || !Number(l.prolongation),
      surfaceBrute: texteStable(l.surface)
    });
  }
  return out;
}

/** Ce qu'une fiche peut lire d'une rencontre passée : ce que la page d'avant-match publiait (jamais un fait du match). */
const avantMatch = (r) => ({ date: r.date, kickoff: r.kickoff, kickoffConnu: r.kickoffConnu, league: r.league, home: r.home, away: r.away, stade: r.stade, surface: r.surface, arbitre: r.arbitre, matchId: r.matchKey });

// ======================================================= la passe chronologique (comptes et banc)

/**
 * LA PASSE DU BANC (commune aux comptes et au banc) : les rencontres jusqu'au dernier jour lu ; le « prochain match » de
 * chaque club (le calendrier connu après coup, la petite fuite déclarée de l'enchaînement — bornée au dernier jour lu) ;
 * ContexteAuJourJ journée après journée ; AVANT de publier la journée J, pour chaque rencontre non attribuée des deux plis :
 * sa fiche au jour J et ses caractéristiques (bancDuContexte.caracteristiquesDeLaFiche) — et, avec les résultats, la base
 * statistique au jour J (forces de la candidate 27, régime sans cote) ; puis la journée est publiée. Rend { rencontres:
 * [{ cle, date, league, home, away, attribue, aScore90, base, buts, x, fiche?, arbitre, cartons, penalties,
 * moyenneButsLigue }], prochainsLus, durees }.
 */
export function passeDuBanc({ database, periodes = PERIODES_DU_BANC, venues = undefined, pelousesEcartees = [], avecResultats, garderLesFiches = false }) {
  const durees = {};
  let t = performance.now();
  const lues = lireLesRencontres(database, { jusqua: periodes.dernierJourLu, avecResultats });
  durees.lecture = Math.round(performance.now() - t);
  t = performance.now();
  const ecartees = new Set(pelousesEcartees.map((c) => numeroDuClub(c)).filter((c) => c !== null));
  const prochains = indexDesProchains(lues.map((x) => x.r));
  const contexte = new ContexteAuJourJ({ venues: venues === undefined ? lireStades() : venues });
  const acc = avecResultats ? new AccumulateurDesForces({ empreintes: [EMPREINTE_DE_LA_BASE] }) : null;
  const parCle = new Map(lues.map((x) => [x.r.matchKey, x]));
  const debut = debutDesPlis(periodes);
  const rencontres = [];
  executerSansPause(
    passerLesRencontres(
      contexte,
      lues.map((x) => x.r),
      {
        avantLaJournee: (jour, duJour) => {
          for (const r of duJour) {
            const x = parCle.get(r.matchKey);
            let base = null;
            if (acc && !r.attribue) {
              const s = modeleDeButs({
                fair: null,
                entrees: { forces: { home: acc.etat(EMPREINTE_DE_LA_BASE, r.home), away: acc.etat(EMPREINTE_DE_LA_BASE, r.away) }, ligue: acc.moyennes(r.league, jour, saisonEnNombre(r.saison)), plusMoins: null },
                reglages: BASE_STATISTIQUE
              }).parties.statistiques;
              base = { lambda: s.lambda, mu: s.mu };
            }
            let carac = null;
            let fiche = null;
            if (!r.attribue && jour >= debut && jour <= periodes.dernierJourLu) {
              fiche = contexte.fiche({ rencontre: avantMatch(r), prochains, calculeLe: null });
              carac = caracteristiquesDeLaFiche(fiche, { matchKey: r.matchKey, pelouseEcartee: ecartees.has(r.home) });
            }
            rencontres.push({
              cle: r.matchKey,
              date: r.date,
              league: r.league,
              home: r.home,
              away: r.away,
              attribue: r.attribue,
              aScore90: x.aScore90,
              surfaceBrute: x.surfaceBrute,
              base,
              buts: avecResultats && !r.attribue ? r.buts90 : null,
              x: carac,
              ...(garderLesFiches && fiche ? { fiche } : {}),
              arbitre: r.arbitre,
              cartons: avecResultats ? r.cartons : null,
              penalties: avecResultats ? r.penalties : null,
              moyenneButsLigue: avecResultats ? r.moyenneButsLigue : null
            });
          }
          if (acc) {
            for (const r of duJour) {
              const f = faitsDeLaRencontre(parCle.get(r.matchKey).fait);
              if (f) acc.ajouter(f.dom, f.ext);
            }
            acc.finDeJournee();
          }
        }
      }
    )
  );
  durees.passe = Math.round(performance.now() - t);
  return { rencontres, prochainsLus: lues.length, durees };
}

// ======================================================= le mode « banc »

/**
 * LE PASSAGE DU BANC : la passe avec les résultats, les recalages des deux plis, l'indice d'arbitre de chaque pli, puis
 * le juge (bancDuContexte.jugerLesVariantes, K = les variantes déclarées). Rend { banc, comptes, durees, aPart }.
 */
export function passerLeBanc({ database, periodes = PERIODES_DU_BANC, venues = undefined, pelousesEcartees = [], K = undefined, variantes = VARIANTES_JUGEES }) {
  const t0 = performance.now();
  let rssMax = process.memoryUsage.rss();
  const passe = passeDuBanc({ database, periodes, venues, pelousesEcartees, avecResultats: true });
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  let t = performance.now();
  const dansLesPlis = passe.rencontres.filter((m) => m.x && m.base && m.buts);
  const recalages = recalagesDesPlis(dansLesPlis, periodes);
  indicesDArbitreParPli(passe.rencontres, recalages);
  const dureeArbitres = Math.round(performance.now() - t);
  t = performance.now();
  const banc = jugerLesVariantes(dansLesPlis, { periodes, recalages, variantes, ...(K === undefined ? {} : { K }) });
  const dureeJuge = Math.round(performance.now() - t);
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  const debut = debutDesPlis(periodes);
  const fenetres = { miseEnRoute: periodes.miseEnRoute, ...Object.fromEntries(periodes.plis.map((p, f) => [`pli${f}`, p.apprendre])) };
  const comptes = {
    rencontresLues: passe.prochainsLus,
    dernierJourLu: passe.rencontres.length ? passe.rencontres.at(-1).date : null,
    avantLesPlis: passe.rencontres.filter((m) => m.date < debut).length,
    dansLesPlis: passe.rencontres.filter((m) => m.date >= debut).length,
    attribuees: passe.rencontres.filter((m) => m.date >= debut && m.attribue).length,
    sansScore90: passe.rencontres.filter((m) => m.date >= debut && !m.attribue && !m.buts).length,
    jugeables: dansLesPlis.length,
    parFenetre: Object.fromEntries(Object.entries(fenetres).map(([k, p]) => [k, passe.rencontres.filter((m) => dans(m.date, p)).length]))
  };
  return {
    banc,
    comptes,
    durees: { ...passe.durees, arbitres: dureeArbitres, juge: dureeJuge, total: Math.round(performance.now() - t0) },
    aPart: { pid: process.pid, rssMaxOctets: Math.max(rssMax, process.memoryUsage.rss()) }
  };
}

// ======================================================= le mode « comptes » (aucun résultat)

const part = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : null);
const quantiles = (valeurs) => {
  const v = valeurs.filter((x) => fini(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  return { n: v.length, min: v[0], q1: q(0.25), mediane: q(0.5), q3: q(0.75), max: v.at(-1) };
};
/** Une pelouse en mot de la mesure : synthétique ou naturelle (hybride = naturelle) ; un mot déjà ramené passe tel quel. */
const normaliserPelouse = (s) => {
  const p = ['synthetique', 'naturelle', 'hybride'].includes(s) ? s : pelouseDe(s);
  return p === 'hybride' ? 'naturelle' : p;
};

/**
 * LES CLUBS DONT LA PELOUSE A PU CHANGER (constat 6 de la critique) : pour chaque club qui reçoit, les pelouses vues
 * (synthétique ou naturelle ; hybride = naturelle) dans la base (ses matchs à domicile), dans l'export gelé du 22/09
 * (`exportPelouses` : [[club, [pelouses…]]]) et dans venues.json (son stade habituel) : plus d'une pelouse en tout → le
 * club est ÉCARTÉ (sa pelouse vaut null au banc). Pur. Rend [{ club, nom, base, export, venues }] trié par club.
 */
export function pelousesEnDesaccord({ base, exportPelouses = [], venues = null }) {
  const exp = new Map(exportPelouses.map(([c, l]) => [numeroDuClub(c), new Set(l.map(normaliserPelouse).filter(Boolean))]));
  const clubs = new Set([...base.keys(), ...exp.keys()]);
  const out = [];
  for (const club of [...clubs].filter((c) => c !== null).sort((a, b) => a - b)) {
    const v = venues?.clubs?.[`fotmob-${club}`] ?? null;
    const sv = v ? (v.synthetique === true ? 'synthetique' : normaliserPelouse(v.pelouse)) : null;
    const sb = [...(base.get(club) ?? [])].sort();
    const se = [...(exp.get(club) ?? [])].sort();
    const toutes = new Set([...sb, ...se, ...(sv ? [sv] : [])]);
    if (toutes.size > 1) out.push({ club, nom: v?.nom ?? null, base: sb, export: se, venues: sv });
  }
  return out;
}

/**
 * LES COMPTES (AUCUN RÉSULTAT LU) : la passe sans résultat, puis, sur chaque fenêtre (mise en route, les deux périodes
 * des plis), les couvertures et les distributions de chaque facteur, la part concernée de chaque variante, et la liste
 * des clubs dont la pelouse a pu changer. Les pelouses de l'export gelé, apportées par le script : `exportPelouses`
 * ([[club, [pelouses…]]]) ou `exportParRencontre` ([[clé de la rencontre, pelouse]] : l'export n'a pas l'identifiant
 * du club ; le club qui reçoit est celui de la même rencontre au magasin, par sa clé).
 */
export function compterLeContexte({ database, periodes = PERIODES_DU_BANC, venues = undefined, exportPelouses = [], exportParRencontre = [] }) {
  const t0 = performance.now();
  const lesVenues = venues === undefined ? lireStades() : venues;
  // 1. La pelouse : d'abord la liste (elle dépend de la base entière, aucun résultat), puis la passe avec elle.
  let t = performance.now();
  const sansEcart = passeDuBanc({ database, periodes, venues: lesVenues, pelousesEcartees: [], avecResultats: false, garderLesFiches: true });
  const surfacesBase = new Map();
  for (const m of sansEcart.rencontres) {
    const s = normaliserPelouse(m.surfaceBrute);
    if (!s) continue;
    if (!surfacesBase.has(m.home)) surfacesBase.set(m.home, new Set());
    surfacesBase.get(m.home).add(s);
  }
  // L'export gelé par rencontre : rattaché au club qui reçoit par la clé de la rencontre au magasin (jamais par un nom).
  const domicileDe = new Map(sansEcart.rencontres.map((m) => [m.cle, m.home]));
  const parClub = new Map(exportPelouses.map(([c, l]) => [numeroDuClub(c), new Set(l)]));
  const rattachement = { rencontres: exportParRencontre.length, rattachees: 0, absentesDuMagasin: 0 };
  for (const [cle, p] of exportParRencontre) {
    const club = domicileDe.get(cle);
    if (club === undefined) {
      rattachement.absentesDuMagasin += 1;
      continue;
    }
    rattachement.rattachees += 1;
    if (!parClub.has(club)) parClub.set(club, new Set());
    parClub.get(club).add(p);
  }
  const desaccords = pelousesEnDesaccord({ base: surfacesBase, exportPelouses: [...parClub].map(([c, s]) => [c, [...s]]), venues: lesVenues });
  const ecartes = new Set(desaccords.map((d) => d.club));
  const dureePasse = Math.round(performance.now() - t);
  t = performance.now();
  // La mise en route (aucune fiche : rien n'y est appris ni jugé), puis les deux périodes des plis (chacune apprise par
  // un pli et jugée par l'autre).
  const fenetres = {
    miseEnRoute: periodes.miseEnRoute,
    periodeA: periodes.plis[0].apprendre,
    periodeB: periodes.plis[1].apprendre
  };
  const parFenetre = {};
  for (const [nom, p] of Object.entries(fenetres)) {
    const ms = sansEcart.rencontres.filter((m) => dans(m.date, p));
    const avecFiche = ms.filter((m) => m.fiche);
    const jugeables = avecFiche.filter((m) => m.aScore90);
    const camps = avecFiche.flatMap((m) => [
      { m, f: m.fiche, camp: 'home' },
      { m, f: m.fiche, camp: 'away' }
    ]);
    const compteSi = (liste, test) => liste.filter(test).length;
    const classes = { court: 0, normal: 0, long: 0, inconnu: 0 };
    for (const c of camps) classes[c.f.repos[c.camp].classe] += 1;
    const km = avecFiche.map((m) => m.fiche.deplacement.km);
    const arbitres = new Map();
    for (const m of avecFiche) {
      const cle = m.fiche.arbitre?.cle;
      if (!cle) continue;
      arbitres.set(cle, (arbitres.get(cle) ?? 0) + 1);
    }
    const noms = new Map();
    for (const cle of arbitres.keys()) {
      const i = cle.lastIndexOf('|');
      const nomA = cle.slice(0, i);
      if (!noms.has(nomA)) noms.set(nomA, new Set());
      noms.get(nomA).add(cle.slice(i + 1));
    }
    const concernes = {};
    for (const id of VARIANTES_JUGEES) {
      const forme = FORMES[id];
      if (forme.sorte === 'arbitre') {
        // L'indice dépend de la base (des résultats d'avant J) : ici, l'arbitre CONNU au jour J (au moins un match d'avant J).
        const n = compteSi(jugeables, (m) => m.fiche.arbitre?.connu === true);
        concernes[id] = { matchs: n, part: part(n, jugeables.length), note: 'arbitre connu au jour J (l’indice lui-même dépend de la base : compté au banc)' };
        continue;
      }
      // La distance concerne tout match dont elle est connue (son centre n'est fixé qu'à l'apprentissage) ; la pelouse,
      // celle des clubs qui ne sont pas écartés.
      const x = (m) => (forme.cle === 'synthetique' ? { ...m.x, synthetique: ecartes.has(m.home) ? null : m.x.synthetique } : m.x);
      const n = forme.sorte === 'distance' ? compteSi(jugeables, (m) => fini(m.x.lnKm)) : compteSi(jugeables, (m) => lignesDeLaForme(forme, x(m)) !== null);
      concernes[id] = { matchs: n, part: part(n, jugeables.length) };
    }
    parFenetre[nom] = {
      de: p.de,
      a: p.a,
      rencontres: ms.length,
      attribuees: compteSi(ms, (m) => m.attribue),
      sansScore90: compteSi(ms, (m) => !m.attribue && !m.aScore90),
      avecFiche: avecFiche.length,
      jugeables: jugeables.length,
      repos: {
        camps: camps.length,
        classes,
        heureInconnue: compteSi(camps, (c) => c.f.repos[c.camp].heureInconnue),
        apresProlongation: compteSi(camps, (c) => c.f.repos[c.camp].mentions.includes('prolongation')),
        matchsAvecUnCampCourt: compteSi(avecFiche, (m) => m.x.reposCourt.dom || m.x.reposCourt.ext)
      },
      enchainement: {
        campsSerres: compteSi(camps, (c) => c.f.enchainement[c.camp].serre === true),
        sansProchain: compteSi(camps, (c) => c.f.enchainement[c.camp].prochain === null),
        matchsAvecUnCampSerre: compteSi(avecFiche, (m) => m.x.serre.dom || m.x.serre.ext)
      },
      deplacement: {
        distanceConnue: compteSi(avecFiche, (m) => fini(m.fiche.deplacement.lnKm)),
        partConnue: part(compteSi(avecFiche, (m) => fini(m.fiche.deplacement.lnKm)), avecFiche.length),
        km: quantiles(km),
        stadesInhabituels: compteSi(avecFiche, (m) => m.fiche.deplacement.stadeHabituel === false),
        stadeInconnu: compteSi(avecFiche, (m) => m.fiche.deplacement.stadeHabituel === null)
      },
      altitude: {
        concernes: compteSi(avecFiche, (m) => m.fiche.altitude.concerne === true),
        concernesEnCoupe: compteSi(avecFiche, (m) => m.fiche.altitude.concerne === true && isCup(m.league)),
        stadeA2000mOuPlus: compteSi(avecFiche, (m) => fini(m.fiche.altitude.stade) && m.fiche.altitude.stade >= 2000)
      },
      pelouse: {
        synthetique: compteSi(avecFiche, (m) => m.fiche.pelouse.surface === 'synthetique'),
        naturelle: compteSi(avecFiche, (m) => m.fiche.pelouse.surface === 'naturelle'),
        hybride: compteSi(avecFiche, (m) => m.fiche.pelouse.surface === 'hybride'),
        inconnue: compteSi(avecFiche, (m) => !m.fiche.pelouse.surface),
        sourceMatch: compteSi(avecFiche, (m) => m.fiche.pelouse.source === 'fotmob-match'),
        sourceStadeHabituel: compteSi(avecFiche, (m) => m.fiche.pelouse.source === 'stade-habituel'),
        matchsDeClubsEcartes: compteSi(avecFiche, (m) => ecartes.has(m.home)),
        synthetiqueEcartes: compteSi(avecFiche, (m) => ecartes.has(m.home) && m.fiche.pelouse.surface === 'synthetique'),
        synthetiqueGardes: compteSi(avecFiche, (m) => !ecartes.has(m.home) && m.fiche.pelouse.surface === 'synthetique')
      },
      arbitre: {
        matchsAvecArbitre: compteSi(avecFiche, (m) => Boolean(m.fiche.arbitre?.cle)),
        clesDistinctes: arbitres.size,
        nomsDansPlusieursPays: [...noms.values()].filter((s) => s.size > 1).length,
        clesSansPays: [...arbitres.keys()].filter((c) => c.endsWith('|')).length,
        connusAuJourJ: compteSi(avecFiche, (m) => m.fiche.arbitre?.connu === true),
        dixMatchsOuPlusAuJourJ: compteSi(avecFiche, (m) => (m.fiche.arbitre?.etat?.matchs ?? 0) >= 10)
      },
      entraineur: {
        campsConnus: compteSi(camps, (c) => c.f.entraineur[c.camp].connu),
        campsAvecIdentifiant: compteSi(camps, (c) => c.f.entraineur[c.camp].id !== null),
        campsNouveaux: compteSi(camps, (c) => c.f.entraineur[c.camp].nouveau === true),
        retoursSous365Jours: compteSi(camps, (c) => c.f.entraineur[c.camp].connu && c.f.entraineur[c.camp].precedent && c.f.entraineur[c.camp].depuisMatchs <= 5 && c.f.entraineur[c.camp].nouveau === false)
      },
      placebo: {
        campsConcernes: compteSi(camps, (c) => (c.camp === 'home' ? c.m.x.placebo.dom : c.m.x.placebo.ext) === 1),
        partDesCamps: part(compteSi(camps, (c) => (c.camp === 'home' ? c.m.x.placebo.dom : c.m.x.placebo.ext) === 1), camps.length)
      },
      variantes: concernes
    };
  }
  return {
    aucunResultatLu: true,
    dernierJourLu: periodes.dernierJourLu,
    rencontresLues: sansEcart.prochainsLus,
    parFenetre,
    pelouse: { regle: 'un club qui reçoit vu sur plus d’une pelouse (synthétique / naturelle ; hybride = naturelle) dans la base, l’export gelé du 22/09 ou venues.json est écarté : sa pelouse vaut null au banc', exportRattache: rattachement, clubsDeLExport: parClub.size, clubsEcartes: desaccords.length, clubs: desaccords },
    durees: { passe: dureePasse, comptes: Math.round(performance.now() - t), total: Math.round(performance.now() - t0), ...sansEcart.durees }
  };
}

// ------------------------------------------------------------ le processus à part
if (process.argv.includes('--enfant-contexte-banc') && typeof process.send === 'function') {
  process.once('message', (m) => {
    try {
      const database = openDb({ file: m.chemin, readonly: true });
      let r;
      if (m.mode === 'comptes') r = compterLeContexte({ database, periodes: m.periodes ?? PERIODES_DU_BANC, exportPelouses: m.exportPelouses ?? [], exportParRencontre: m.exportParRencontre ?? [], ...(m.venues === undefined ? {} : { venues: m.venues }) });
      else if (m.mode === 'banc') r = passerLeBanc({ database, periodes: m.periodes ?? PERIODES_DU_BANC, pelousesEcartees: m.pelousesEcartees ?? [], K: m.K, ...(m.venues === undefined ? {} : { venues: m.venues }) });
      else throw new Error(`mode inconnu « ${m?.mode ?? ''} »`);
      process.send({ fin: true, mode: m.mode, resultat: r }, () => process.exit(0));
    } catch (error) {
      process.send({ erreur: String(error?.stack ?? error?.message ?? error).slice(0, 4000) }, () => process.exit(0));
    }
  });
}
