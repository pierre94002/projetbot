/**
 * conseilReleve.js — QUAND un relevé payant vaut le coup (étape 7 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * Un ENCART D'INFORMATION, rien d'autre : il dit quels championnats, combien
 * de crédits, combien il en reste (s'ils sont connus) et le bon moment. Le
 * relevé lui-même reste le bouton existant que Pierre clique (Réglages ›
 * Données › Cotes marché (The Odds API) › « Actualiser »,
 * POST /api/sources/odds/refresh). Ce fichier n'importe ni le client payant
 * (oddsApiClient.js) ni liveDataSync.js : rien ne peut partir d'ici.
 *
 * LE BON MOMENT. Les cotes bougent quand les compositions sont annoncées
 * (une heure avant le coup d'envoi : FotMob publie alors la composition
 * officielle). Un relevé fait avant ne dit plus le prix d'après (règle de
 * fraîcheur, core/engine/fraicheurCotes.js). Pour les matchs de vos
 * championnats suivis dans les prochaines 24 heures :
 *   - « maintenant »  : les compositions d'au moins un match sont annoncées
 *     (de H-1 au coup d'envoi) et vos cotes de ce match manquent, sont à
 *     rafraîchir ou ont été relevées avant l'annonce ;
 *   - « plus-tard »   : sinon, à l'annonce des compositions du prochain match
 *     qui en aura besoin (les matchs annoncés dans la même demi-heure vont
 *     ensemble) ;
 *   - « inutile »     : aucun match proche, ou des cotes déjà relevées après
 *     les compositions.
 * Un championnat qui n'a rendu AUCUN match au dernier relevé (hors saison chez
 * The Odds API) est mis à part : un relevé n'y apporterait rien.
 *
 * LES CRÉDITS. Le bouton relève TOUTES les compétitions suivies, une requête
 * chacune (1 région × 1 marché) : au plus un crédit par compétition. Les
 * crédits restants et le coût du dernier relevé viennent du bilan gardé par
 * ce relevé (data/runtime/releve-payant.json) ; inconnus, ils sont dits
 * inconnus.
 * -----------------------------------------------------------------------
 */

import { openDb, upcomingLineupByHome } from './db/matchStatsDb.js';
import { clubDuMagasin } from './db/oddsProfileRead.js';
import { listAdaptedMatches } from './matchSources.js';
import { heuresDesCotesPayantes, coteDeLInstantanePayant } from './cotesDeVosBookmakers.js';
import { lireReglageFraicheur } from './repositories/fraicheurCotesRepository.js';
import { lireDernierRelevePayant } from './repositories/relevePayantRepository.js';
import { TRACKED_SPORT_KEYS, NOMS_DES_CLES, CREDITS_PAR_COMPETITION, CREDITS_PAR_MOIS, REQUETE_RELEVE } from './providers/oddsApiCompetitions.js';
import { getEngineConfig } from '../core/engine/engineConfig.js';
import { fraicheurCote, heureDite, COMPOS_ANNONCEES_MINUTES, REGLAGE_FRAICHEUR_DEFAUT } from '../core/engine/fraicheurCotes.js';

const MINUTE_MS = 60_000;
const HEURE_MS = 3_600_000;
export const HORIZON_HEURES = 24;
/** Les matchs dont les compositions sont annoncées dans la même demi-heure : un seul relevé. */
export const GROUPE_MINUTES = 30;
export const OU_EST_LE_BOUTON = 'Réglages › Données › Cotes marché (The Odds API) › « Actualiser »';

const instant = (x) => (x === null || x === undefined || x === '' ? Number.NaN : new Date(x).getTime());
const jourUtc = (t) => new Date(t).toISOString().slice(0, 10);
const pluriel = (n, mot, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`;

/**
 * Le conseil, à partir de ce qui est connu (fonction pure, rien n'est lu ici).
 * @param {object} p
 * @param {number} p.maintenant
 * @param {Array}  p.matchs  [{ matchId, home, away, league, coupDEnvoi, heureSure, vosCotes, releveAt, compos: { publiee, lueA }|null }]
 * @param {object} p.reglage le réglage de fraîcheur
 * @param {object|null} p.dernierReleve  lireDernierRelevePayant()
 */
export function conseilDeReleve({ maintenant, matchs = [], reglage = REGLAGE_FRAICHEUR_DEFAUT, dernierReleve = null, cles = TRACKED_SPORT_KEYS, noms = NOMS_DES_CLES, horizonHeures = HORIZON_HEURES } = {}) {
  const nomVersCle = new Map(cles.map((k) => [noms[k] ?? k, k]));
  const bilan = dernierReleve?.bilan ?? null;
  const fin = maintenant + horizonHeures * HEURE_MS;
  const aujourdhui = jourUtc(maintenant);
  const dernierJour = jourUtc(fin);

  // Les championnats qui n'ont rendu aucun match au dernier relevé : hors saison chez The Odds API.
  const sansMatchAuDernier = new Set(
    Object.entries(bilan?.matchsParCle ?? {})
      .filter(([, n]) => n === 0)
      .map(([k]) => k)
  );

  const proches = [];
  for (const m of matchs) {
    const cle = nomVersCle.get(m.league);
    if (!cle) continue;
    const k = instant(m.coupDEnvoi);
    if (!Number.isFinite(k)) continue;
    if (m.heureSure) {
      if (k <= maintenant || k > fin) continue;
    } else if (jourUtc(k) < aujourdhui || jourUtc(k) > dernierJour) continue;
    const annonce = m.heureSure ? k - COMPOS_ANNONCEES_MINUTES * MINUTE_MS : Number.NaN;
    let cotes;
    if (!m.vosCotes) cotes = 'absentes';
    else {
      const f = fraicheurCote({ releveAt: m.releveAt ?? null, maintenant, coupDEnvoi: m.coupDEnvoi, heureSure: m.heureSure, reglage });
      if (f.etat === 'a-rafraichir') cotes = 'a-rafraichir';
      else if (m.heureSure && reglage?.avantCompos !== false && instant(m.releveAt) < annonce) cotes = 'avant-compos';
      else cotes = 'fraiches';
    }
    proches.push({
      matchId: m.matchId,
      home: m.home,
      away: m.away,
      league: m.league,
      cle,
      coupDEnvoi: new Date(k).toISOString(),
      heureSure: Boolean(m.heureSure),
      composAnnonceesA: Number.isFinite(annonce) ? new Date(annonce).toISOString() : null,
      compos: m.compos ?? null,
      releveAt: m.releveAt ?? null,
      cotes,
      horsSaison: sansMatchAuDernier.has(cle),
      utile: cotes !== 'fraiches' && !sansMatchAuDernier.has(cle)
    });
  }
  proches.sort((a, b) => a.coupDEnvoi.localeCompare(b.coupDEnvoi));

  const ouverts = proches.filter((m) => m.utile && m.heureSure && maintenant >= instant(m.composAnnonceesA));
  const aVenir = proches.filter((m) => m.utile && m.heureSure && maintenant < instant(m.composAnnonceesA));
  let conseil = 'inutile';
  let groupe = [];
  let moment = null;
  if (ouverts.length) {
    conseil = 'maintenant';
    groupe = ouverts;
    moment = maintenant;
  } else if (aVenir.length) {
    conseil = 'plus-tard';
    moment = instant(aVenir[0].composAnnonceesA);
    groupe = aVenir.filter((m) => instant(m.composAnnonceesA) <= moment + GROUPE_MINUTES * MINUTE_MS);
  }

  const parChampionnat = new Map();
  for (const m of groupe) {
    const c = parChampionnat.get(m.cle) ?? { cle: m.cle, nom: m.league, matchs: 0, premierCoupDEnvoi: m.coupDEnvoi, composPubliees: 0 };
    c.matchs++;
    if (m.coupDEnvoi < c.premierCoupDEnvoi) c.premierCoupDEnvoi = m.coupDEnvoi;
    if (m.compos?.publiee) c.composPubliees++;
    parChampionnat.set(m.cle, c);
  }
  const championnats = [...parChampionnat.values()];

  // Les crédits : au plus un par compétition suivie (le bouton les relève toutes).
  const parReleve = cles.length * CREDITS_PAR_COMPETITION;
  const restants = bilan?.quota?.restants ?? null;
  const credits = {
    parReleve,
    competitions: cles.length,
    detail: `Le bouton relève les ${cles.length} compétitions suivies, une requête chacune (1 région « ${REQUETE_RELEVE.regions} » × 1 marché « ${REQUETE_RELEVE.markets} ») : ${parReleve} crédits au plus par clic.`,
    restants,
    utilises: bilan?.quota?.utilises ?? null,
    connusLe: bilan?.at ?? null,
    dernierCout: bilan?.cout ?? null,
    apres: restants === null ? null : restants - parReleve,
    relevesPossibles: restants === null ? null : Math.max(0, Math.floor(restants / parReleve)),
    suffisants: restants === null ? null : restants >= parReleve,
    forfait: CREDITS_PAR_MOIS,
    source: dernierReleve?.source ?? 'absent',
    fichier: dernierReleve?.fichier ?? null,
    probleme: dernierReleve?.probleme ?? null
  };

  const noms2 = championnats.map((c) => c.nom);
  const listeNoms = noms2.length <= 1 ? noms2.join('') : `${noms2.slice(0, -1).join(', ')} et ${noms2.at(-1)}`;
  const nbMatchs = groupe.length;
  const composPubliees = groupe.filter((m) => m.compos?.publiee).length;
  let titre;
  let raison;
  let momentTexte;
  if (conseil === 'maintenant') {
    titre = 'Relevé conseillé maintenant';
    momentTexte = composPubliees ? 'maintenant (compositions publiées)' : 'maintenant (compositions annoncées)';
    const dernierCoup = groupe.map((m) => m.coupDEnvoi).sort().at(-1);
    raison = `Compositions annoncées pour ${pluriel(nbMatchs, 'match')} (${listeNoms}), coup d'envoi d'ici ${heureDite(dernierCoup)} : vos cotes ${
      groupe.every((m) => m.cotes === 'absentes') ? "n'y sont pas encore relevées" : 'y datent d’avant cette annonce ou sont à rafraîchir'
    }.${composPubliees ? ` FotMob les a déjà publiées pour ${pluriel(composPubliees, 'match')}.` : ''}`;
  } else if (conseil === 'plus-tard') {
    titre = `Relevé conseillé vers ${heureDite(moment)}`;
    momentTexte = `vers ${heureDite(moment)} (annonce des compositions)`;
    raison = `Le bon moment : vers ${heureDite(moment)}, à l'annonce des compositions de ${pluriel(nbMatchs, 'match')} (${listeNoms}), une heure avant le coup d'envoi. Un relevé fait avant ne dirait plus le prix d'après.`;
  } else {
    titre = "Pas de relevé conseillé pour l'instant";
    momentTexte = 'pas maintenant';
    const fraiches = proches.filter((m) => m.cotes === 'fraiches').length;
    const horsSaison = proches.filter((m) => m.horsSaison && m.cotes !== 'fraiches').length;
    const sansHeure = proches.filter((m) => !m.heureSure && m.cotes !== 'fraiches' && !m.horsSaison).length;
    const morceaux = [];
    if (!proches.length) morceaux.push(`Aucun match de vos ${cles.length} compétitions suivies chez The Odds API dans les ${horizonHeures} prochaines heures.`);
    if (fraiches) morceaux.push(`${pluriel(fraiches, 'match proche a', 'matchs proches ont')} déjà des cotes fraîches, relevées après les compositions.`);
    if (horsSaison) morceaux.push(`${pluriel(horsSaison, 'match')} d'un championnat qui n'a rendu aucune cote au dernier relevé (hors saison chez The Odds API) : un relevé n'y apporterait rien.`);
    if (sansHeure) morceaux.push(`${pluriel(sansHeure, 'match')} du calendrier sans heure connue : le relevé du jour du match donnera son heure.`);
    raison = morceaux.join(' ') || 'Rien à relever dans les prochaines heures.';
  }
  const resume =
    conseil === 'inutile' ? titre : `${titre} : ${pluriel(championnats.length, 'championnat')}, ${parReleve} crédits au plus, ${momentTexte}.`;

  return {
    genereLe: new Date(maintenant).toISOString(),
    conseil,
    titre,
    resume,
    raison,
    moment: moment === null ? null : { a: new Date(moment).toISOString(), texte: momentTexte },
    championnats,
    matchs: groupe,
    proches: proches.length,
    credits,
    bouton: { ou: OU_EST_LE_BOUTON, automatique: false, texte: "Rien ne part tout seul : le relevé ne se fait que si vous cliquez « Actualiser »." },
    reglage,
    horizonHeures
  };
}

/**
 * Le conseil du moment : les matchs à venir de la page Matchs, l'heure de vos
 * cotes (archives), les compositions déjà lues (cache FotMob, sans requête),
 * le dernier bilan de relevé. Lecture seule, aucun appel réseau.
 */
export function conseilReleveActuel({ maintenant = Date.now(), database = null } = {}) {
  let base = null;
  try {
    base = database ?? openDb();
  } catch {
    base = null;
  }
  const reglage = lireReglageFraicheur().reglage;
  const config = getEngineConfig('football');
  const coches = new Set(Array.isArray(config?.valueBookmakers) ? config.valueBookmakers : []);
  const deVous = (b) => !b.referenceOnly && (!coches.size || coches.has(b.key));
  const suivis = new Set(TRACKED_SPORT_KEYS.map((k) => NOMS_DES_CLES[k] ?? k));
  const fin = maintenant + HORIZON_HEURES * HEURE_MS;
  const vus = new Set();
  const matchs = [];
  for (const m of listAdaptedMatches('odds-api')) {
    const k = instant(m.commenceTime);
    if (!suivis.has(m.league) || !Number.isFinite(k) || m.postponed) continue;
    if (k > fin + HEURE_MS * 24 || k < maintenant - HEURE_MS * 3) continue;
    const cleUnique = `${m.league}|${m.home}|${m.away}|${String(m.commenceTime).slice(0, 10)}`;
    if (vus.has(cleUnique)) continue;
    vus.add(cleUnique);
    const vosLivres = coteDeLInstantanePayant(m) ? (m.marketOdds?.byBookmaker ?? []).filter(deVous) : [];
    let releveAt = null;
    if (vosLivres.length && base) {
      const heures = heuresDesCotesPayantes(m, { database: base });
      releveAt = vosLivres.map((b) => heures.parBookmaker[b.key]?.releveAt).filter(Boolean).sort().at(-1) ?? null;
    }
    let compos = null;
    if (base) {
      try {
        const homeId = clubDuMagasin(m.home, m.league, base);
        const lu = homeId ? upcomingLineupByHome(homeId, jourUtc(k), { database: base }) : null;
        compos = lu ? { publiee: Boolean(lu.available), lueA: lu.fetchedAt ?? null } : null;
      } catch {
        compos = null;
      }
    }
    matchs.push({ matchId: m.matchId, home: m.home, away: m.away, league: m.league, coupDEnvoi: m.commenceTime, heureSure: Boolean(m.hasOdds), vosCotes: vosLivres.length > 0, releveAt, compos });
  }
  return conseilDeReleve({ maintenant, matchs, reglage, dernierReleve: lireDernierRelevePayant() });
}
