/**
 * conseilReleve.js — QUAND un relevé payant vaut le coup (étape 7 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * L'ENCART DU CONSEIL : il dit quels championnats, combien de crédits, combien
 * il en reste (s'ils sont connus) et le bon moment. Depuis le relevé ciblé
 * (18/11/2026), il prépare aussi le bouton qui relève SEULEMENT les
 * championnats de la vague (bloc `releveCible` : les clés, le coût, ce que
 * deviennent les autres championnats) ; le relevé lui-même part du serveur
 * (liveDataSync.js, POST /api/sources/odds/refresh-cible), sur le clic de
 * Pierre confirmé en deux temps. Le relevé complet reste le bouton de
 * Réglages › Données › Cotes marché (The Odds API) › « Actualiser »
 * (POST /api/sources/odds/refresh). Ce fichier n'importe ni le client payant
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
 * inconnus. Le relevé ciblé coûte un crédit au plus par championnat demandé.
 *
 * LES AUTRES CHAMPIONNATS APRÈS UN RELEVÉ CIBLÉ. L'instantané ne garde que
 * les championnats relevés : les autres perdent leurs cotes payantes (leurs
 * matchs restent, par le calendrier, à midi UTC faute d'heure). Leur heure de
 * coup d'envoi est alors reprise de l'archive des relevés (odds_events) —
 * l'HEURE seulement, jamais un prix — pour que le conseil reste juste.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import { openDb, upcomingLineupByHome } from './db/matchStatsDb.js';
import { loadOddsMatches, getFixturePaths } from './repositories/fixturesRepository.js';
import { teamNamesLikelyMatch } from '../utils/teamNameMatch.js';
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
const listeDite = (noms) => (noms.length <= 1 ? noms.join('') : `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}`);
const JOUR_MOIS = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });
/** « le 09/11 à 17 h 42 » (heure de Paris). */
const dateDite = (x) => {
  const t = instant(x);
  return Number.isFinite(t) ? `le ${JOUR_MOIS.format(t)} à ${heureDite(t)}` : 'à une heure inconnue';
};

/** Au plus 12 championnats par relevé ciblé : au-delà, l'écran propose le relevé complet. */
export const CLES_PAR_RELEVE_CIBLE_MAX = 12;

/** L'heure de l'instantané payant actuel (celle de toutes ses cotes), ou null s'il manque. */
export function heureDeLInstantane() {
  try {
    return fs.statSync(getFixturePaths().odds).mtime.toISOString();
  } catch {
    return null;
  }
}

/**
 * Les championnats de l'instantané payant actuel (fonction pure). Pour chaque clé : le nombre de matchs à venir et
 * « encore jouable » — un match pas encore commencé, dont l'annonce des compositions est PASSÉE (maintenant ≥ coup
 * d'envoi − 60 min), y a une cote FRAÎCHE à cet instant (règle de fraîcheur gelée ; l'heure du fichier est celle de
 * toutes ses cotes). Un relevé ciblé qui oublierait un championnat encore jouable effacerait un conseil encore valable :
 * il est redemandé avec la vague (+1 crédit, décision RC3). Correction S2 (décision RC3 bis, 18/11/2026) : une cote
 * fraîche d'un match dont l'annonce n'est pas passée n'est PAS « encore jouable » — elle ne permet encore aucune mise
 * (règle des compositions) et son match aura sa propre vague ; sans cela, juste après un relevé complet, chaque vague
 * comptait tous les championnats (plus de 12), le bouton s'éteignait et l'écran renvoyait au relevé complet, en cascade.
 * @param {Array} matchsBruts loadOddsMatches() (format The Odds API : sport_key, sport_title, commence_time, bookmakers)
 * @param {{ maintenant: number, releveAt?: string|null, reglage?: object, noms?: object, garderLivre?: (b: object) => boolean }} o
 *        garderLivre : les bookmakers qui comptent (vos bookmakers) ; tous par défaut
 * @returns {Array<{ cle, nom, matchsAVenir, releveAt, encoreJouable }>} dans l'ordre de l'instantané
 */
export function championnatsDeLInstantane(matchsBruts, { maintenant, releveAt = null, reglage = REGLAGE_FRAICHEUR_DEFAUT, noms = NOMS_DES_CLES, garderLivre = () => true } = {}) {
  const parCle = new Map();
  for (const m of Array.isArray(matchsBruts) ? matchsBruts : []) {
    const cle = m?.sport_key;
    if (!cle) continue;
    const c = parCle.get(cle) ?? { cle, nom: noms[cle] ?? m.sport_title ?? cle, matchsAVenir: 0, releveAt, encoreJouable: false };
    const k = instant(m.commence_time);
    if (Number.isFinite(k) && k > maintenant) {
      c.matchsAVenir++;
      const vosLivres = (Array.isArray(m.bookmakers) ? m.bookmakers : []).filter(garderLivre);
      const annoncePassee = maintenant >= k - COMPOS_ANNONCEES_MINUTES * MINUTE_MS;
      if (annoncePassee && vosLivres.length && fraicheurCote({ releveAt, maintenant, coupDEnvoi: m.commence_time, heureSure: true, reglage }).etat === 'fraiche') c.encoreJouable = true;
    }
    parCle.set(cle, c);
  }
  return [...parCle.values()];
}

/**
 * LE BLOC DU RELEVÉ CIBLÉ (fonction pure) : ce que le bouton de l'encart relèverait, son coût et ce que deviennent les
 * autres championnats — tout est dit AVANT le clic. Le bouton ne s'allume que pour « maintenant » (les compositions sont
 * annoncées) : un relevé fait avant ne permettrait aucune mise (règle des compositions). « plus-tard » donne déjà le coût
 * et l'heure ; « inutile » ne propose rien.
 */
function blocReleveCible({ conseil, championnats, instantane, cles, noms, credits, moment }) {
  const suivies = new Set(cles);
  const duGroupe = conseil === 'inutile' ? [] : championnats.map((c) => c.cle);
  const encoreJouables =
    conseil === 'inutile'
      ? []
      : (instantane ?? [])
          .filter((c) => c.encoreJouable && suivies.has(c.cle) && !duGroupe.includes(c.cle))
          .map(({ cle, nom, matchsAVenir, releveAt }) => ({ cle, nom, matchsAVenir, releveAt }));
  const clesCible = [...duGroupe, ...encoreJouables.map((c) => c.cle)];
  const nomsCible = clesCible.map((k) => noms[k] ?? k);
  const n = clesCible.length;
  const cout = n * CREDITS_PAR_COMPETITION;
  const restants = credits.restants;
  // Correction S5 (18/11/2026) : des crédits restants CONNUS sous le coût éteignent le bouton (les premières clés
  // passeraient, les suivantes seraient refusées, et l'instantané réécrit perdrait les championnats encore frais,
  // demandés en dernier) ; jamais de nombre négatif à l'écran.
  const suffisants = restants === null ? null : restants >= cout;
  const apres = restants === null ? null : Math.max(0, restants - cout);
  const retires = (instantane ?? [])
    .filter((c) => c.matchsAVenir > 0 && !clesCible.includes(c.cle))
    .map(({ cle, nom, matchsAVenir, releveAt }) => ({ cle, nom, matchsAVenir, releveAt }));
  const tropDeCles = n > CLES_PAR_RELEVE_CIBLE_MAX;
  const actif = conseil === 'maintenant' && n > 0 && !tropDeCles && suffisants !== false;
  const releveDesRetires = retires.find((c) => c.releveAt)?.releveAt ?? null;
  const textes = {
    bouton: n ? `Relever ${pluriel(n, 'championnat')} (${pluriel(cout, 'crédit')})` : null,
    confirmer: n ? `Confirmer : ${pluriel(cout, 'crédit')}` : null,
    cout: n
      ? `Relever seulement ${n > 1 ? `ces ${n} championnats` : 'ce championnat'} (${listeDite(nomsCible)}) : ${pluriel(cout, 'crédit')} au plus (1 par championnat ; un championnat sans match ne coûte rien).`
      : null,
    credits:
      restants === null
        ? 'Crédits restants inconnus : ils seront connus après ce relevé.'
        : suffisants
          ? `Il vous reste ${pluriel(restants, 'crédit')} (compte ${dateDite(credits.connusLe)}). Après ce relevé : au moins ${apres}.`
          : `Il vous reste ${pluriel(restants, 'crédit')}, il en faut ${cout} : pas assez pour ce relevé.`,
    autres: retires.length
      ? `Les cotes de ${pluriel(retires.length, 'autre championnat', 'autres championnats')}, relevées ${dateDite(releveDesRetires)}, seront retirées. Leurs matchs restent sur la page Matchs, avec les cotes gratuites quand il y en a. Aucune mise ne sera conseillée sur eux tant qu'ils ne seront pas relevés à leur tour.`
      : "Aucun autre championnat n'a de cotes à venir dans le relevé actuel : rien ne sera retiré.",
    encoreJouables: encoreJouables.length
      ? `${listeDite(encoreJouables.map((c) => c.nom))} ${encoreJouables.length > 1 ? 'ont' : 'a'} encore des cotes fraîches pour un match qui n'a pas commencé : redemandé pour garder ses cotes (+1 crédit chacun).`
      : null,
    pied: `Rien ne part tout seul : le relevé ne se fait que si vous cliquez, puis confirmez. Le relevé complet (${cles.length} compétitions, jusqu'à ${cles.length} crédits) reste dans Réglages › Données.`,
    // Correction S9 : la page ne se relit pas toute seule, elle le dit.
    plusTard:
      conseil === 'plus-tard' && moment !== null
        ? `Le bouton s'allumera vers ${heureDite(moment)}, à l'annonce des compositions : rechargez cette page à ce moment-là (elle ne se met pas à jour toute seule). Un relevé fait avant ne permettrait aucune mise.`
        : null,
    // Correction S2 (RC3 bis) : le coût du relevé complet est dit, sans y pousser.
    tropDeCles: tropDeCles ? `${n} championnats à relever : ${CLES_PAR_RELEVE_CIBLE_MAX} au plus par relevé ciblé. Le relevé complet (Réglages › Données) les relève tous, pour jusqu'à ${pluriel(cles.length, 'crédit')}.` : null
  };
  return { actif, cles: clesCible, noms: nomsCible, groupe: duGroupe, encoreJouables, credits: cout, restants, apres, suffisants, retires, tropDeCles, max: CLES_PAR_RELEVE_CIBLE_MAX, textes };
}

/**
 * Le conseil, à partir de ce qui est connu (fonction pure, rien n'est lu ici).
 * @param {object} p
 * @param {number} p.maintenant
 * @param {Array}  p.matchs  [{ matchId, home, away, league, coupDEnvoi, heureSure, vosCotes, releveAt, compos: { publiee, lueA }|null }]
 * @param {object} p.reglage le réglage de fraîcheur
 * @param {object|null} p.dernierReleve  lireDernierRelevePayant()
 * @param {Array|null}  p.instantane  championnatsDeLInstantane(…) : les championnats de l'instantané actuel (relevé ciblé)
 */
export function conseilDeReleve({ maintenant, matchs = [], reglage = REGLAGE_FRAICHEUR_DEFAUT, dernierReleve = null, cles = TRACKED_SPORT_KEYS, noms = NOMS_DES_CLES, horizonHeures = HORIZON_HEURES, instantane = null } = {}) {
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
    // Correction S3 (18/11/2026) : un match de l'instantané payant que vos bookmakers ne cotent pas, relevé APRÈS
    // l'annonce de ses compositions (`instantaneA`, l'heure de l'instantané) : « non cotées », pas « utile » — un nouveau
    // relevé n'y changerait rien et chaque clic recoûterait. Un instantané d'AVANT l'annonce le laisse « utile » (un seul
    // nouvel essai, pas une boucle).
    if (!m.vosCotes) cotes = m.heureSure && Number.isFinite(annonce) && instant(m.instantaneA) >= annonce ? 'non-cotees' : 'absentes';
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
      utile: cotes !== 'fraiches' && cotes !== 'non-cotees' && !sansMatchAuDernier.has(cle),
      ...(cotes === 'non-cotees' ? { instantaneA: new Date(instant(m.instantaneA)).toISOString() } : {}),
      // Heure reprise de l'archive (championnat absent du dernier relevé ciblé) : l'écran dit d'où elle vient.
      ...(m.heureDe ? { heureDe: m.heureDe, heureDonneeLe: m.heureDonneeLe ?? null } : {})
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
    // Correction S1 : ces chiffres sont ceux du relevé COMPLET (Réglages › Données), dit comme tel.
    detail: `Le relevé complet (Réglages › Données) relève les ${cles.length} compétitions suivies, une requête chacune (1 région « ${REQUETE_RELEVE.regions} » × 1 marché « ${REQUETE_RELEVE.markets} ») : ${parReleve} crédits au plus par clic.`,
    restants,
    utilises: bilan?.quota?.utilises ?? null,
    connusLe: bilan?.at ?? null,
    dernierCout: bilan?.cout ?? null,
    // Correction S5 : jamais de nombre négatif (« pas assez » est dit par `suffisants`).
    apres: restants === null ? null : Math.max(0, restants - parReleve),
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
    // Correction S3 : dit, pour qu'aucun clic ne soit refait pour rien.
    const nonCotees = proches.filter((m) => m.cotes === 'non-cotees');
    if (nonCotees.length) {
      const heureDuReleve = nonCotees.map((m) => m.instantaneA).sort().at(-1);
      morceaux.push(
        `Relevé fait à ${heureDite(heureDuReleve)} : vos bookmakers ne cotent pas ${nonCotees.length > 1 ? `ces ${nonCotees.length} matchs` : 'ce match'} (${listeDite(nonCotees.map((m) => `${m.home} – ${m.away}`))}) ; un nouveau relevé n'y changerait rien.`
      );
    }
    raison = morceaux.join(' ') || 'Rien à relever dans les prochaines heures.';
  }
  const releveCible = blocReleveCible({ conseil, championnats, instantane, cles, noms, credits, moment });
  // Correction S1 (18/11/2026) : quand le relevé ciblé est proposé (des championnats, pas plus de 12), le résumé (page
  // du match, Opportunités) et le bouton nommé sont les siens — 1 crédit par championnat, pas les 37 du relevé complet.
  // Sans relevé ciblé possible, les textes du relevé complet restent.
  const cibleProposee = releveCible.cles.length > 0 && !releveCible.tropDeCles;
  const boutonCible = `Relever ${pluriel(releveCible.cles.length, 'championnat')}`;
  const resume =
    conseil === 'inutile'
      ? titre
      : cibleProposee
        ? `${titre} : ${pluriel(releveCible.cles.length, 'championnat')}, ${pluriel(releveCible.credits, 'crédit')} au plus, ${momentTexte}.`
        : `${titre} : ${pluriel(championnats.length, 'championnat')}, ${parReleve} crédits au plus, ${momentTexte}.`;
  const bouton = cibleProposee
    ? { ou: `Réglages › Cotes de vos bookmakers › « ${boutonCible} »`, automatique: false, texte: `Rien ne part tout seul : le relevé ne se fait que si vous cliquez « ${boutonCible} » puis confirmez.` }
    : { ou: OU_EST_LE_BOUTON, automatique: false, texte: "Rien ne part tout seul : le relevé ne se fait que si vous cliquez « Actualiser »." };

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
    bouton,
    releveCible,
    reglage,
    horizonHeures
  };
}

/**
 * Les matchs ARCHIVÉS à venir des championnats absents de l'instantané actuel (lecture seule) : leur heure de coup d'envoi
 * donnée par The Odds API au dernier relevé qui les a demandés. L'HEURE seulement : aucun prix n'est rendu. Rend [] si la
 * base manque ou n'a pas encore l'archive.
 * @param {object|null} base la base locale
 * @param {{ debut: number, fin: number, absentes: Set<string> }} o les noms (sport_title) des championnats absents
 */
export function heuresDeLArchive(base, { debut, fin, absentes }) {
  if (!base || !absentes?.size) return [];
  try {
    return base
      .prepare(
        `SELECT e.source_event, e.league, e.kickoff, e.home_name, e.away_name, MAX(q.releve_at) AS releve_at
         FROM odds_events e LEFT JOIN odds_quotes q ON q.event_id = e.id AND q.market = '1x2'
         WHERE e.source = 'odds-api' AND e.date >= ? AND e.date <= ?
         GROUP BY e.id`
      )
      .all(jourUtc(debut - HEURE_MS * 24), jourUtc(fin + HEURE_MS * 24))
      .filter((l) => absentes.has(l.league))
      .filter((l) => {
        const k = instant(l.kickoff);
        return Number.isFinite(k) && k > debut && k <= fin;
      })
      .map((l) => ({ sourceEvent: l.source_event, league: l.league, kickoff: new Date(instant(l.kickoff)).toISOString(), home: l.home_name, away: l.away_name, releveAt: l.releve_at ?? null }));
  } catch {
    return [];
  }
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
  const heureInstantane = heureDeLInstantane();
  for (const m of listAdaptedMatches('odds-api')) {
    const k = instant(m.commenceTime);
    if (!suivis.has(m.league) || !Number.isFinite(k) || m.postponed) continue;
    // Un match du calendrier sans heure (midi UTC) est gardé 24 h, le temps que son heure vienne de l'archive (plus bas) ;
    // s'il n'est pas réparé, il retrouve la règle d'avant (3 h), juste avant le conseil.
    if (k > fin + HEURE_MS * 24 || k < maintenant - HEURE_MS * (m.hasOdds ? 3 : 24)) continue;
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
    // Correction S3 : un match de l'instantané payant sans vos bookmakers porte l'heure de l'instantané (celle de toutes
    // ses cotes) : relevé après l'annonce de ses compositions, il est « non coté » chez vous, pas « à relever ».
    const instantaneA = coteDeLInstantanePayant(m) && !vosLivres.length ? heureInstantane : null;
    matchs.push({ matchId: m.matchId, home: m.home, away: m.away, league: m.league, coupDEnvoi: m.commenceTime, heureSure: Boolean(m.hasOdds), vosCotes: vosLivres.length > 0, releveAt, compos, ...(instantaneA ? { instantaneA } : {}) });
  }
  // Relevé ciblé : un championnat suivi absent de l'instantané actuel n'a plus d'heure sûre par la page Matchs (ses
  // matchs viennent du calendrier, à midi UTC). Son heure est reprise de l'archive — jamais un prix : vosCotes reste
  // faux, le match compte « cotes absentes ». Seuls les matchs du calendrier DÉJÀ listés sont réparés (aucun match
  // inventé, aucun doublon) : même championnat, mêmes équipes, à 36 h au plus de la date du calendrier.
  const brut = loadOddsMatches();
  const instantane = championnatsDeLInstantane(brut, { maintenant, releveAt: heureInstantane, reglage, garderLivre: deVous });
  const presentes = new Set(brut.flatMap((m) => [m?.sport_title, NOMS_DES_CLES[m?.sport_key]]).filter(Boolean));
  const absentes = new Set([...suivis].filter((nom) => !presentes.has(nom)));
  for (const a of heuresDeLArchive(base, { debut: maintenant, fin, absentes })) {
    const i = matchs.findIndex(
      (m) =>
        !m.heureSure &&
        String(m.matchId).startsWith('cal-') &&
        m.league === a.league &&
        teamNamesLikelyMatch(m.home, a.home) &&
        teamNamesLikelyMatch(m.away, a.away) &&
        Math.abs(instant(`${String(m.coupDEnvoi).slice(0, 10)}T12:00:00Z`) - instant(a.kickoff)) <= 36 * HEURE_MS
    );
    if (i >= 0) matchs[i] = { ...matchs[i], coupDEnvoi: a.kickoff, heureSure: true, vosCotes: false, releveAt: null, heureDe: 'archive', heureDonneeLe: a.releveAt };
  }
  // Un match du calendrier que l'archive n'a pas réparé garde la règle d'avant le relevé ciblé : vu jusqu'à 3 h après
  // midi UTC, pas plus (jamais compté « sans heure » toute la soirée).
  const lus = matchs.filter((m) => m.heureSure || instant(m.coupDEnvoi) >= maintenant - HEURE_MS * 3);
  return conseilDeReleve({ maintenant, matchs: lus, reglage, dernierReleve: lireDernierRelevePayant(), instantane });
}
