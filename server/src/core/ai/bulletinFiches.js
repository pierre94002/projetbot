/**
 * bulletinFiches.js — les FICHES CHIFFRÉES du bulletin du jour et du bilan de la semaine (étape 42 du plan, 22/10/2026).
 * -----------------------------------------------------------------------
 * Le code prépare tout ce qui est chiffré, SANS DÉPENSER UN TOKEN : l'IA n'a plus qu'à résumer et commenter (et la garde
 * des chiffres, gardeDesChiffres.js, refuse son texte si elle écrit un nombre qui n'est pas dans la fiche). Deux fiches :
 *
 *   LE JOUR — d'après ce que l'appli sait déjà :
 *     - les opportunités du jour (la page Opportunités, étape 8 : data/opportunities.js — l'état PRÉPARÉ du Repérage, jamais
 *       un calcul de plus que celui de la page ; les value vertes d'abord, quelques chutes de cote ensuite), avec la case de la
 *       carte « où parier » (étape 23) et l'état de la composition ;
 *     - les matchs de vos favoris du jour (équipes et championnats, favoritesRepository.js lu comme le budget Claude le lit) ;
 *     - les compositions connues (le cache des compositions de FotMob, lu par la règle de la page Opportunités, et le même
 *       mot que l'écran : officielle, probable, dernière alignée, non publiée) et les absents annoncés ;
 *     - les alertes du contrôle quotidien (étape 14 : le feu et les contrôles en échec).
 *   LA SEMAINE (du lundi au dimanche qui vient de finir, jours de Paris) :
 *     - les pronostics réglés de la semaine (journal des pronostics) : justes et faux, par marché et par championnat ;
 *     - vos paris réglés (les règles de Performance paris, suiviParis.js : gain réel, gain attendu, ROI) et leurs extrêmes ;
 *     - la valeur de clôture de ces paris (closingValue.js) ;
 *     - le carnet de l'IA (étape 21) : ses avis tenus cette semaine et ses erreurs, puis sa fiabilité depuis le 30/09 ;
 *     - les championnats : vos paris par championnat, et la carte « où parier » (cases vertes).
 *
 * DEUX TEMPS : des LECTEURS (`lireLesEntreesDuJour`, `lireLesEntreesDeLaSemaine` : les lectures, asynchrones à cause de
 * l'attente du Repérage et de la valeur de clôture ; rien d'écrit nulle part, aucun réseau, aucun appel à Claude) et des
 * CONSTRUCTEURS PURS (`construireLaFicheDuJour`, `construireLaFicheDeLaSemaine`), qui trient, tronquent et arrondissent
 * pour l'affichage : à entrées égales, fiche égale — de quoi les tester sans base. Le TEXTE que lit l'IA vient de
 * bulletinPrompt.js (`rendreLaFicheDuJour`…), à partir de cet objet.
 *
 * LE MODE ÉCONOME du budget Claude (étape 4) compacte la fiche, pas le propos : moins de lignes par section (LIMITES.econome),
 * jamais une section de moins — l'IA ne doit pas croire qu'une rubrique vide est une rubrique sans nouvelle.
 * -----------------------------------------------------------------------
 */

import { openDb } from '../../data/db/matchStatsDb.js';
import { clubDuMagasin } from '../../data/db/oddsProfileRead.js';
import { aUneDerniereComposition } from '../../data/db/derniereComposition.js';
import { listAdaptedMatches } from '../../data/matchSources.js';
import { getOpportunities, compositionsDuCache, compositionDe } from '../../data/opportunities.js';
import { resumeDuControle } from '../../data/controleQuotidien.js';
import { rapportDeSuivi, LIBELLES_MARCHES } from '../../data/suiviParis.js';
import { closingValueReport } from '../../data/closingValue.js';
import { lireLeCarnet } from '../../data/aiScorecard.js';
import { carteDesLecteurs, libelleDeLaColonne } from '../../data/bettingMap.js';
import { listPredictions } from '../../data/repositories/predictionsRepository.js';
import { listBets } from '../../data/repositories/betsRepository.js';
import { listAll, typeDeMarche, TYPES_DE_MARCHE } from '../../data/repositories/matchAiAnalysisRepository.js';
import { jourParis } from '../../data/repositories/autoAiAnalysisRepository.js';
import { instantDeReglement } from '../risk/gardeFous.js';
import { semaineDe, lireFavoris, estFavori } from './claudeBudget.js';

const JOUR_MS = 86_400_000;
const MIN_MS = 60_000;
const FUSEAU = 'Europe/Paris';

// ------------------------------------------------------------------ les limites
/**
 * Combien de lignes par section. Le mode normal garde une fiche de l'ordre de 1 500 à 3 000 tokens ; le mode économe
 * (80 % du budget du jour ou de la semaine, ou choisi dans Réglages) la réduit de moitié environ.
 */
export const LIMITES = Object.freeze({
  normal: Object.freeze({ opportunites: 8, chutes: 3, favoris: 10, absents: 3, controle: 5, parMarche: 6, parChampionnat: 5, extremes: 3, erreursIA: 5, ligues: 4, casesVertes: 5, carnet: 6 }),
  econome: Object.freeze({ opportunites: 4, chutes: 1, favoris: 5, absents: 2, controle: 3, parMarche: 4, parChampionnat: 3, extremes: 2, erreursIA: 3, ligues: 3, casesVertes: 3, carnet: 4 })
});

/** Une composition lue plus d'une heure avant le coup d'envoi est « probable » : la même limite que l'écran (langageParis.js). */
export const COMPO_OFFICIELLE_MINUTES = 60;
/** Au-delà de cet âge, le Repérage est relancé avant le bulletin (il ne l'est jamais pour un simple âge de 30 minutes). */
export const REPERAGE_PERIME_APRES_MS = 3 * 3_600_000;
/** Combien de temps le bulletin attend le calcul du Repérage (environ 80 s sur 370 matchs). */
export const ATTENTE_DU_REPERAGE_MS = 4 * MIN_MS;

// ------------------------------------------------------------------ des mots et des formats
const partiesLongues = (jour) => Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: FUSEAU }).formatToParts(new Date(`${jour}T12:00:00Z`)).map((p) => [p.type, p.value]));
/** Le quantième comme on l'écrit : « 1er », puis « 2 », « 3 »… */
const quantieme = (p) => (p.day === '1' ? '1er' : p.day);
/** « jeudi 22 octobre 2026 » (« dimanche 1er novembre 2026 »). */
export const jourEnLettres = (jour) => {
  const p = partiesLongues(jour);
  return `${p.weekday} ${quantieme(p)} ${p.month} ${p.year}`;
};
/** « 22/10/2026 ». */
export const jourCourt = (jour) => {
  const [a, m, j] = String(jour).split('-');
  return `${j}/${m}/${a}`;
};
const partiesDeParis = (iso) => {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  return Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map((p) => [p.type, p.value]));
};
/** « 21 h 00 » (heure de Paris), ou null. */
export function heureDite(iso) {
  const p = partiesDeParis(iso);
  return p ? `${p.hour} h ${p.minute}` : null;
}
/** « 22/10 à 05 h 58 » (heure de Paris), ou null. */
export function jourEtHeureDits(iso) {
  const p = partiesDeParis(iso);
  return p ? `${p.day}/${p.month} à ${p.hour} h ${p.minute}` : null;
}
const arrondi = (x, n = 2) => Number(Number(x).toFixed(n));
const finie = (x) => typeof x === 'number' && Number.isFinite(x);

/** L'estimation, en tokens, d'un texte français plein de chiffres : environ 3 caractères par token. Une estimation : la vraie mesure est celle du journal. */
export const estimerLesTokens = (texte) => Math.ceil(String(texte ?? '').length / 3);

// ------------------------------------------------------------------ les compositions
const aUnTitulaireIndisponible = (equipe) => {
  const absents = new Set((equipe?.unavailable ?? []).map((a) => a?.name));
  return (equipe?.startXI ?? []).some((j) => absents.has(j?.name));
};

/**
 * L'état d'une composition, mot pour mot la règle de l'écran (ui/src/utils/langageParis.js, etatComposition ; un test compare
 * les deux) : « officielle » dans l'heure qui précède le coup d'envoi, sauf si un joueur aligné est dit indisponible ;
 * « probable » avant, ou quand l'heure de la lecture est inconnue ; « derniere-alignee » quand FotMob n'a rien publié et que
 * le magasin garde le onze du dernier match ; « non-publiee » sinon.
 * @returns {'officielle'|'probable'|'derniere-alignee'|'non-publiee'}
 */
export function etatDeLaComposition(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return 'non-publiee';
  if (snapshot.source === 'magasin') return 'derniere-alignee';
  const minutes = snapshot.minutesBeforeKickoff;
  if (!finie(minutes)) return 'probable';
  if (aUnTitulaireIndisponible(snapshot.home) || aUnTitulaireIndisponible(snapshot.away)) return 'probable';
  return minutes <= COMPO_OFFICIELLE_MINUTES ? 'officielle' : 'probable';
}

// =================================================================================================================
//                                                      LE JOUR
// =================================================================================================================

const pause = (ms) => new Promise((fin) => setTimeout(fin, ms));

/**
 * Les opportunités préparées : l'état du Repérage, relancé s'il a plus de REPERAGE_PERIME_APRES_MS (l'ancien reste lu pendant
 * le calcul), attendu jusqu'à `attenteMs`. Rend { etat: 'pret' | 'en-calcul' | 'erreur', generatedAt, lignes, resume, erreur }.
 */
async function lireLesOpportunites({ maintenant, database, lireOpportunites, attenteMs, pasMs }) {
  let op = lireOpportunites({ calculSiPerime: false, maintenant, database });
  const age = op.data?.generatedAt ? maintenant - Date.parse(op.data.generatedAt) : Infinity;
  if (!op.data || age > REPERAGE_PERIME_APRES_MS) {
    if (op.status !== 'computing') op = lireOpportunites({ force: true, calculSiPerime: false, maintenant, database });
  }
  for (let i = 0; i < Math.ceil(attenteMs / pasMs) && op.status === 'computing'; i++) {
    await pause(pasMs);
    op = lireOpportunites({ calculSiPerime: false, maintenant, database });
  }
  if (op.data) return { etat: 'pret', generatedAt: op.data.generatedAt ?? null, lignes: op.data.lignes ?? [], resume: op.data.resume ?? {}, carte: op.data.carte ?? null, erreur: null, enRecalcul: op.status === 'computing' };
  if (op.status === 'computing') return { etat: 'en-calcul', generatedAt: null, lignes: [], resume: {}, carte: null, erreur: null, enRecalcul: true };
  return { etat: 'erreur', generatedAt: null, lignes: [], resume: {}, carte: null, erreur: op.error ?? 'le Repérage n’a rien rendu', enRecalcul: false };
}

/**
 * LES ENTRÉES DU JOUR : tout ce que la fiche du jour lit, tel quel (aucun tri, aucune troncature). Lecture seule.
 * Injections pour les essais : `lireOpportunites` (défaut : getOpportunities), `listerLesMatchs` (défaut : la liste de la page Matchs),
 * `attenteMs` / `pasMs` (l'attente du Repérage).
 */
export async function lireLesEntreesDuJour({ maintenant = Date.now(), database = null, lireOpportunites = getOpportunities, listerLesMatchs = () => listAdaptedMatches('odds-api', 10000), attenteMs = ATTENTE_DU_REPERAGE_MS, pasMs = 2000 } = {}) {
  const db = database ?? openDb();
  const jour = jourParis(new Date(maintenant));
  const problemes = [];

  const opportunites = await lireLesOpportunites({ maintenant, database: db, lireOpportunites, attenteMs, pasMs });

  // Les matchs d'aujourd'hui (la liste de la page Matchs) qui comptent : un favori, ou une ligne des opportunités.
  let matchsDuJour = [];
  const lectures = { matchs: true, compositions: true, controle: true };
  try {
    // Un match du calendrier ne connaît que son jour (son heure est un repli de midi UTC) : il ne se juge pas à l'heure.
    matchsDuJour = listerLesMatchs().filter((m) => jourParis(new Date(m.commenceTime ?? NaN)) === jour && (!m.hasOdds || Date.parse(m.commenceTime) > maintenant));
  } catch (error) {
    lectures.matchs = false;
    problemes.push(`liste des matchs illisible : ${error.message}`);
  }
  const favoris = lireFavoris();
  const vus = new Set();
  const clesDesOpportunites = new Set((opportunites.lignes ?? []).map((l) => `${l.league}|${l.home}|${l.away}|${String(l.commenceTime).slice(0, 10)}`));
  const cleDe = (m) => `${m.league}|${m.home}|${m.away}|${String(m.commenceTime).slice(0, 10)}`;
  const retenus = [];
  for (const m of matchsDuJour) {
    const cle = cleDe(m);
    if (vus.has(cle)) continue;
    vus.add(cle);
    const favori = pourquoiFavori(m, favoris, db);
    if (!favori && !clesDesOpportunites.has(cle)) continue;
    retenus.push({ m, cle, favori });
  }

  // Les compositions : le cache des compositions FotMob (une requête), et « dernière alignée » du magasin.
  const compos = [];
  let index = new Map();
  try {
    index = compositionsDuCache(db, jourVeille(jour), jourSurlendemain(jour));
  } catch (error) {
    lectures.compositions = false;
    problemes.push(`compositions illisibles : ${error.message}`);
  }
  const identifiant = (nom, league) => {
    try {
      return clubDuMagasin(nom, league ?? null, db);
    } catch {
      return null;
    }
  };
  for (const { m, cle, favori } of retenus) {
    const homeId = identifiant(m.home, m.league);
    const awayId = identifiant(m.away, m.league);
    let derniere = false;
    try {
      derniere = Boolean((homeId && aUneDerniereComposition(homeId, jour, { database: db })) || (awayId && aUneDerniereComposition(awayId, jour, { database: db })));
    } catch {
      derniere = false;
    }
    compos.push({
      cle,
      matchId: m.matchId ?? null,
      home: m.home,
      away: m.away,
      league: m.league ?? null,
      commenceTime: m.commenceTime,
      heureSure: Boolean(m.hasOdds),
      favori,
      compo: compositionDe({ homeId, awayId, commenceTime: m.commenceTime, lastLineupKnown: derniere }, index)
    });
  }

  let controle = null;
  try {
    controle = resumeDuControle({ maintenant, database: db });
  } catch (error) {
    lectures.controle = false;
    problemes.push(`contrôle quotidien illisible : ${error.message}`);
  }
  return { maintenant, jour, lectures, opportunites, matchs: compos, nombreDeMatchsDuJour: matchsDuJour.length, favoris: { equipes: favoris.equipes.length, ligues: favoris.ligues.size, illisible: Boolean(favoris.illisible) }, controle, problemes };
}

const jourVeille = (jour) => new Date(Date.parse(`${jour}T12:00:00Z`) - JOUR_MS).toISOString().slice(0, 10);
const jourSurlendemain = (jour) => new Date(Date.parse(`${jour}T12:00:00Z`) + 2 * JOUR_MS).toISOString().slice(0, 10);

/**
 * Pourquoi ce match est celui d'un favori : null s'il ne l'est pas, sinon { championnat: bool, equipes: [noms] }. Le
 * championnat se juge seul ; les équipes, par la règle du budget Claude (estFavori : identifiant FotMob de l'annuaire strict,
 * jamais une ressemblance de noms).
 */
function pourquoiFavori(m, favoris, database) {
  if (!favoris || favoris.illisible) return null;
  const championnat = estFavori({ league: m.league ?? null }, favoris, database);
  if (championnat) return { championnat: true, equipes: [] };
  if (!estFavori({ home: m.home, away: m.away, league: m.league ?? null }, favoris, database)) return null;
  const equipes = [];
  if (estFavori({ home: m.home, league: m.league ?? null }, favoris, database)) equipes.push(m.home);
  if (estFavori({ away: m.away, league: m.league ?? null }, favoris, database)) equipes.push(m.away);
  return { championnat: false, equipes };
}

const noms = (liste, n) => (liste ?? []).map((j) => j?.name).filter(Boolean).slice(0, n);

/**
 * LA FICHE DU JOUR (pure). `entrees` : ce que rend lireLesEntreesDuJour. `econome` : le mode économe du budget Claude.
 */
export function construireLaFicheDuJour(entrees, { econome = false } = {}) {
  const lim = econome ? LIMITES.econome : LIMITES.normal;
  const { jour, maintenant } = entrees;
  const op = entrees.opportunites ?? { etat: 'erreur', lignes: [] };
  const parCle = new Map((entrees.matchs ?? []).map((m) => [m.cle, m]));
  const cleDeLigne = (l) => `${l.league}|${l.home}|${l.away}|${String(l.commenceTime).slice(0, 10)}`;
  const etatDuMatch = (cle) => {
    const m = parCle.get(cle);
    return m ? etatDeLaComposition(m.compo) : 'non-publiee';
  };

  // --- les opportunités du jour : les value vertes, puis quelques chutes de cote.
  const duJour = (op.lignes ?? []).filter((l) => jourParis(new Date(l.commenceTime ?? NaN)) === jour && (!l.exactKickoff || Date.parse(l.commenceTime) > maintenant));
  const uneLigne = (l) => ({
    match: `${l.home} - ${l.away}`,
    championnat: l.league ?? null,
    heure: l.exactKickoff ? heureDite(l.commenceTime) : null,
    pari: l.pari ?? null,
    cote: finie(Number(l.verdict?.cote)) && l.verdict?.cote != null ? arrondi(l.verdict.cote, 2) : null,
    bookmaker: l.verdict?.bookmakerTitle ?? l.meilleureCote?.bookmaker ?? null,
    probabilitePct: finie(l.probabilite) ? Math.round(l.probabilite * 100) : null,
    coteJuste: finie(l.coteJuste) ? arrondi(l.coteJuste, 2) : null,
    valuePct: finie(l.verdict?.pourcent) ? arrondi(l.verdict.pourcent, 1) : null,
    coteRelevee: l.verdict?.fraicheur ? { fraiche: l.verdict.fraicheur.etat === 'fraiche', ageMinutes: finie(l.verdict.fraicheur.ageMinutes) ? Math.round(l.verdict.fraicheur.ageMinutes) : null } : null,
    carte: l.carte ? { couleur: l.carte.couleur ?? null, mot: l.carte.mot ?? null } : null,
    compo: etatDuMatch(cleDeLigne(l)),
    chutePct: l.chute && finie(l.mouvement?.dropPct) ? arrondi(l.mouvement.dropPct, 1) : null
  });
  const vertes = duJour.filter((l) => l.verdict?.vert).sort((a, b) => (b.verdict.pourcent ?? 0) - (a.verdict.pourcent ?? 0) || String(a.commenceTime).localeCompare(String(b.commenceTime)));
  const chutes = duJour.filter((l) => l.chute && !l.verdict?.vert).sort((a, b) => (b.mouvement?.dropPct ?? 0) - (a.mouvement?.dropPct ?? 0));
  const opportunites = {
    etat: op.etat,
    erreur: op.erreur ?? null,
    calculeLe: op.generatedAt ?? null,
    lignesLues: duJour.length,
    valuesVertes: vertes.length,
    chutes: chutes.length,
    valuesVertesSur7Jours: finie(op.resume?.vertes) ? op.resume.vertes : null,
    carteOuParier: op.carte ? { mois: op.carte.mois ?? null, aJour: op.carte.aJour !== false } : null,
    retenues: vertes.slice(0, lim.opportunites).map(uneLigne),
    chutesRetenues: chutes.slice(0, lim.chutes).map(uneLigne)
  };

  // --- les favoris : leurs matchs du jour.
  const matchsFavoris = (entrees.matchs ?? []).filter((m) => m.favori).sort((a, b) => String(a.commenceTime).localeCompare(String(b.commenceTime)));
  const nombreDeLignes = (m) => duJour.filter((l) => cleDeLigne(l) === m.cle && l.verdict?.vert).length;
  const favoris = {
    equipes: entrees.favoris?.equipes ?? 0,
    championnats: entrees.favoris?.ligues ?? 0,
    illisible: Boolean(entrees.favoris?.illisible),
    // La liste des matchs du jour s'est-elle lue ? Sinon « aucun match de vos favoris » ne serait pas « rien aujourd'hui ».
    lu: entrees.lectures?.matchs !== false,
    matchsDuJour: matchsFavoris.length,
    matchs: matchsFavoris.slice(0, lim.favoris).map((m) => ({
      match: `${m.home} - ${m.away}`,
      championnat: m.league ?? null,
      heure: m.heureSure ? heureDite(m.commenceTime) : null,
      pourquoi: m.favori.championnat ? 'championnat favori' : `équipe favorite : ${m.favori.equipes.join(' et ')}`,
      compo: etatDeLaComposition(m.compo),
      valuesVertes: nombreDeLignes(m)
    }))
  };

  // --- les compositions connues, pour les matchs qui sont dans la fiche.
  const dansLaFiche = new Set([...opportunites.retenues, ...opportunites.chutesRetenues].map((l) => l.match).concat(favoris.matchs.map((m) => m.match)));
  const concernes = (entrees.matchs ?? []).filter((m) => dansLaFiche.has(`${m.home} - ${m.away}`));
  const compte = (etat) => concernes.filter((m) => etatDeLaComposition(m.compo) === etat).length;
  const compositions = {
    lu: entrees.lectures?.compositions !== false,
    matchsConcernes: concernes.length,
    officielles: compte('officielle'),
    probables: compte('probable'),
    dernieresAlignees: compte('derniere-alignee'),
    nonPubliees: compte('non-publiee'),
    matchs: concernes
      .filter((m) => m.compo?.source === 'FotMob')
      .sort((a, b) => String(a.commenceTime).localeCompare(String(b.commenceTime)))
      .map((m) => ({
        match: `${m.home} - ${m.away}`,
        etat: etatDeLaComposition(m.compo),
        minutesAvantLeCoupDEnvoi: finie(m.compo.minutesBeforeKickoff) ? m.compo.minutesBeforeKickoff : null,
        absentsDomicile: noms(m.compo.home?.unavailable, lim.absents),
        absentsExterieur: noms(m.compo.away?.unavailable, lim.absents)
      }))
  };

  // --- le contrôle quotidien.
  const c = entrees.controle;
  const controle = !c
    ? { etat: 'illisible' }
    : {
        etat: c.etat,
        feu: c.feu ?? null,
        le: c.le ?? null,
        compte: c.compte ?? null,
        enEchecTotal: c.enEchecTotal ?? c.enEchec?.length ?? 0,
        enEchec: (c.enEchec ?? []).slice(0, lim.controle).map((x) => ({ libelle: x.libelle, statut: x.statut, constats: x.total ?? 0 }))
      };

  return {
    version: 1,
    genre: 'jour',
    jour,
    jourEnLettres: jourEnLettres(jour),
    genereeLe: new Date(maintenant).toISOString(),
    mode: econome ? 'econome' : 'normal',
    opportunites,
    favoris,
    compositions,
    controle,
    problemes: entrees.problemes ?? []
  };
}

/**
 * La fiche du jour n'a rien à dire : le Repérage est prêt et ne trouve aucun pari ni aucune chute de cote aujourd'hui, et
 * aucun match de vos favoris ne se joue. Alors l'appel n'a pas lieu (0 token). Un Repérage pas prêt n'est PAS « rien » :
 * c'est « on ne sait pas » (le bulletin attend la passe suivante).
 */
export const ficheDuJourVide = (fiche) =>
  fiche.opportunites.etat === 'pret' && fiche.opportunites.lignesLues === 0 && fiche.opportunites.chutes === 0 && fiche.favoris.matchsDuJour === 0 && fiche.favoris.lu && !fiche.favoris.illisible;

// =================================================================================================================
//                                                    LA SEMAINE
// =================================================================================================================

/** Les sept jours (lundi → dimanche, Paris) de la dernière semaine COMPLÈTE avant `jour`. */
export function semaineEcoulee(jour) {
  const lundiCourant = semaineDe(jour)[0];
  const lundiPrecedent = new Date(Date.parse(`${lundiCourant}T12:00:00Z`) - 7 * JOUR_MS).toISOString().slice(0, 10);
  const jours = semaineDe(lundiPrecedent);
  return { cle: jours[0], du: jours[0], au: jours[6], jours };
}

/**
 * « du lundi 12 au dimanche 18 octobre 2026 » ; sur deux mois : « du lundi 28 septembre au dimanche 4 octobre 2026 » ; sur deux années :
 * « du lundi 28 décembre 2026 au dimanche 3 janvier 2027 ».
 */
export function semaineEnLettres({ du, au }) {
  const mois = (j) => partiesLongues(j).month;
  const jourDeSemaine = (j) => {
    const p = partiesLongues(j);
    return `${p.weekday} ${quantieme(p)}`;
  };
  const anneeDu = du.slice(0, 4);
  const anneeAu = au.slice(0, 4);
  if (anneeDu !== anneeAu) return `du ${jourDeSemaine(du)} ${mois(du)} ${anneeDu} au ${jourDeSemaine(au)} ${mois(au)} ${anneeAu}`;
  return mois(du) === mois(au) ? `du ${jourDeSemaine(du)} au ${jourDeSemaine(au)} ${mois(au)} ${anneeAu}` : `du ${jourDeSemaine(du)} ${mois(du)} au ${jourDeSemaine(au)} ${mois(au)} ${anneeAu}`;
}

const dansLaSemaine = (jourDeLInstant, semaine) => Boolean(jourDeLInstant) && jourDeLInstant >= semaine.du && jourDeLInstant <= semaine.au;
const jourDeParisDe = (iso) => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? jourParis(new Date(t)) : null;
};

/** Les mesures de clôture des paris (closingValue.js, scope « bets »), au format que lit rapportDeSuivi — comme suiviDesParis. */
async function mesuresDeCloture({ database, lireCloture }) {
  try {
    const r = await (lireCloture ?? closingValueReport)({ scope: 'bets', database });
    return { disponible: true, mesures: r.toutesLesMesures ?? r.entries ?? [], manques: r.missing ?? [], calculeLe: r.generatedAt ?? null, sur: r.totalEntries ?? null, mesurees: r.measured ?? null };
  } catch (error) {
    return { disponible: false, raison: error.message, mesures: [], manques: [] };
  }
}

/**
 * LES ENTRÉES DE LA SEMAINE : tout ce que la fiche de la semaine lit, tel quel. Lecture seule, aucun réseau. Une lecture qui
 * échoue est dite (`problemes`), jamais prise pour « rien » : la fiche le dit à l'IA.
 */
export async function lireLesEntreesDeLaSemaine({ maintenant = Date.now(), database = null, lireCloture = null } = {}) {
  const db = database ?? openDb();
  const jour = jourParis(new Date(maintenant));
  const semaine = semaineEcoulee(jour);
  const problemes = [];
  const lectures = { pronostics: true, paris: true, analyses: true };
  const lire = (nom, cle, fonction, defaut) => {
    try {
      return fonction();
    } catch (error) {
      if (cle) lectures[cle] = false;
      problemes.push(`${nom} illisible : ${error.message}`);
      return defaut;
    }
  };
  const pronostics = lire('journal des pronostics', 'pronostics', () => listPredictions(), []);
  const paris = lire('carnet de paris', 'paris', () => listBets(), []);
  const analyses = lire('analyses de l’IA', 'analyses', () => listAll(), []);
  const carnet = lire('carnet de l’IA', null, () => lireLeCarnet(), { etat: 'illisible', carnet: null });
  const carte = lire('carte « où parier »', null, () => carteDesLecteurs({ database: db }), null);
  const cloture = await mesuresDeCloture({ database: db, lireCloture });
  return { maintenant, jour, semaine, lectures, pronostics, paris, cloture, analyses, carnet, carte, problemes };
}

const pourcentDe = (n, d) => (d > 0 ? Math.round((100 * n) / d) : null);

/** Les lignes d'un regroupement (par marché, par championnat) : régles, justes, taux — les plus fournies d'abord. */
function regrouper(liste, cle, libelle, n) {
  const groupes = new Map();
  for (const p of liste) {
    const k = cle(p);
    const g = groupes.get(k) ?? { libelle: libelle(p), regles: 0, justes: 0 };
    g.regles++;
    if (p.status === 'correct') g.justes++;
    groupes.set(k, g);
  }
  return [...groupes.values()]
    .sort((a, b) => b.regles - a.regles || b.justes - a.justes || a.libelle.localeCompare(b.libelle, 'fr'))
    .slice(0, n)
    .map((g) => ({ ...g, tauxPct: pourcentDe(g.justes, g.regles) }));
}

/** Sous ce nombre d'avis, le taux d'un marché du carnet de l'IA ne prouve rien (le hasard suffit) : le marché n'est pas listé, il est seulement compté. */
export const SEUIL_AVIS_DU_CARNET = 20;
/** Au plus autant d'erreurs de l'IA par match dans la fiche : cinq lignes du même match n'apprennent rien de plus qu'une ou deux. */
export const ERREURS_PAR_MATCH = 2;
const RANG_DE_CONFIANCE = Object.freeze({ forte: 0, moyenne: 1, faible: 2 });

/**
 * Les erreurs de l'IA à montrer dans la fiche, les plus instructives d'abord : celles où elle se disait SÛRE (confiance « forte », puis
 * « moyenne », puis « faible » ou non dite), les plus récentes d'abord ; UNE par match d'abord, puis une seconde par match tant qu'il reste
 * de la place, jamais plus de ERREURS_PAR_MATCH. Pure, sans hasard : la même liste donne toujours la même sélection.
 */
export function choisirLesErreurs(erreurs, n) {
  const rang = (e) => RANG_DE_CONFIANCE[e.confiance] ?? 3;
  const ordre = [...erreurs].sort((a, b) => rang(a) - rang(b) || String(b.jour).localeCompare(String(a.jour)) || a.match.localeCompare(b.match, 'fr') || String(a.marche).localeCompare(String(b.marche), 'fr'));
  const parMatch = new Map();
  const prises = new Set();
  const choisies = [];
  for (let tour = 1; tour <= ERREURS_PAR_MATCH; tour++) {
    for (const e of ordre) {
      if (choisies.length >= n) break;
      const match = `${e.jour}|${e.match}`;
      if (prises.has(e) || (parMatch.get(match) ?? 0) !== tour - 1) continue;
      parMatch.set(match, tour);
      prises.add(e);
      choisies.push(e);
    }
  }
  return choisies.sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b));
}

/**
 * Les marchés du carnet de l'IA à montrer : ceux d'au moins SEUIL_AVIS_DU_CARNET avis, du MOINS fiable au plus fiable (les faiblesses
 * d'abord : c'est ce que le bilan doit dire). Quand ils sont plus nombreux que la place, les moins fiables ET les plus fiables, le
 * milieu est seulement compté. Les marchés trop peu fournis sont comptés, jamais listés.
 */
export function marchesDuCarnet(types, n) {
  const mesures = (types ?? [])
    .filter((t) => (t.bilan?.aiVerdicts ?? 0) > 0)
    .map((t) => ({ libelle: t.label ?? t.marketType, avis: t.bilan.aiVerdicts, tenus: t.bilan.aiRight ?? 0, tauxPct: pourcentDe(t.bilan.aiRight ?? 0, t.bilan.aiVerdicts) }));
  const assez = mesures.filter((g) => g.avis >= SEUIL_AVIS_DU_CARNET).sort((a, b) => a.tauxPct - b.tauxPct || b.avis - a.avis || a.libelle.localeCompare(b.libelle, 'fr'));
  const faibles = Math.ceil(n / 2);
  const montres = assez.length > n ? [...assez.slice(0, faibles), ...assez.slice(assez.length - (n - faibles))] : assez;
  return { parMarche: montres, marchesJuges: assez.length, marchesDuMilieu: assez.length - montres.length, marchesTropPeuFournis: mesures.length - assez.length };
}

/** Les avis de l'IA jugés cette semaine, d'après les revues d'après-match (les mêmes comptes que l'expérience redonnée à l'IA). */
function iaDeLaSemaine(analyses, semaine, lim) {
  const parType = new Map();
  const erreurs = [];
  let avis = 0;
  let tenus = 0;
  for (const e of analyses) {
    const revue = e.postMatchReview;
    if (!revue?.marketReviews?.length) continue;
    const jourDuMatch = jourDeParisDe(e.commenceTime) ?? jourDeParisDe(revue.createdAt);
    if (!dansLaSemaine(jourDuMatch, semaine)) continue;
    for (const r of revue.marketReviews) {
      // L'expérience de l'IA repart de la cote minimale (30/09/2026) : seuls comptent les pronostics qui portent `minOdds`.
      if (!r.minOdds || (r.aiWasRight !== true && r.aiWasRight !== false)) continue;
      avis++;
      const type = typeDeMarche(r) ?? 'autre';
      const g = parType.get(type) ?? { libelle: TYPES_DE_MARCHE[type] ?? type, avis: 0, tenus: 0 };
      g.avis++;
      if (r.aiWasRight) {
        tenus++;
        g.tenus++;
      } else {
        erreurs.push({ jour: jourDuMatch, match: `${e.homeName} - ${e.awayName}`, championnat: e.league ?? null, marche: r.market ?? g.libelle, pari: r.pick ?? null, avisDeLIA: r.aiVerdict ?? null, confiance: r.aiConfidence ?? null, issue: r.outcome ?? null });
      }
      parType.set(type, g);
    }
  }
  return {
    avis,
    tenus,
    tauxPct: pourcentDe(tenus, avis),
    parMarche: [...parType.values()].sort((a, b) => b.avis - a.avis || a.libelle.localeCompare(b.libelle, 'fr')).slice(0, lim.carnet).map((g) => ({ ...g, tauxPct: pourcentDe(g.tenus, g.avis) })),
    erreursTotal: erreurs.length,
    erreurs: choisirLesErreurs(erreurs, lim.erreursIA)
  };
}

/** La fiabilité de l'IA depuis le 30/09, d'après le carnet de la nuit (étape 21). */
function carnetDeLIA(lu, lim) {
  if (lu?.etat !== 'lu') return { etat: lu?.etat ?? 'absent' };
  const c = lu.carnet;
  const bilan = c.total?.bilan ?? {};
  return {
    etat: 'lu',
    calculeLe: c.calculeLe ?? null,
    depuis: c.depuis?.jour ?? null,
    matchsAnalysesEtJoues: c.analyses?.reglees ?? null,
    avis: bilan.aiVerdicts ?? 0,
    tenus: bilan.aiRight ?? 0,
    tauxPct: pourcentDe(bilan.aiRight ?? 0, bilan.aiVerdicts ?? 0),
    seuilAvis: SEUIL_AVIS_DU_CARNET,
    ...marchesDuCarnet(c.types, lim.carnet)
  };
}

/** Un pari, en une ligne : sa première sélection (ou « n sélections »), sa cote, sa mise, son gain. */
function pariEnClair(p) {
  const s = p.selections?.[0];
  const quoi = p.selections?.length > 1 ? `combiné de ${p.selections.length} sélections` : s ? `${s.homeName ?? '?'} - ${s.awayName ?? '?'} : ${s.pick ?? s.market ?? '?'}` : 'pari';
  return { pari: quoi, championnat: p.selections?.length === 1 ? (s?.league ?? null) : null, cote: arrondi(p.odds, 2), mise: arrondi(p.stake, 2), gain: arrondi(p.gainReel, 2), bookmaker: p.bookmakerTitle ?? null };
}

/**
 * LA FICHE DE LA SEMAINE (pure). `entrees` : ce que rend lireLesEntreesDeLaSemaine. Les paris passent par rapportDeSuivi (les
 * règles de Performance paris) : un gain, un ROI, un gain attendu comptés comme sur cette page.
 */
export function construireLaFicheDeLaSemaine(entrees, { econome = false } = {}) {
  const lim = econome ? LIMITES.econome : LIMITES.normal;
  const { semaine, maintenant } = entrees;

  // --- les pronostics réglés cette semaine.
  const regles = (entrees.pronostics ?? []).filter((p) => (p.status === 'correct' || p.status === 'incorrect') && dansLaSemaine(jourDeParisDe(p.settledAt), semaine));
  const justes = regles.filter((p) => p.status === 'correct').length;
  const pronostics = {
    lu: entrees.lectures?.pronostics !== false,
    regles: regles.length,
    justes,
    faux: regles.length - justes,
    tauxPct: pourcentDe(justes, regles.length),
    parMarche: regrouper(regles, (p) => p.marketId ?? `texte:${p.market}`, (p) => LIBELLES_MARCHES[p.marketId] ?? p.market ?? 'Marché non noté', lim.parMarche),
    parChampionnat: regrouper(regles, (p) => p.league ?? 'non-note', (p) => p.league ?? 'Championnat non noté', lim.parChampionnat)
  };

  // --- vos paris réglés cette semaine (gagnés, perdus ou annulés), comptés comme Performance paris.
  const jourDuReglement = (b) => {
    const instant = instantDeReglement(b);
    return Number.isFinite(instant) ? jourParis(new Date(instant)) : null;
  };
  const parisDeLaSemaine = (entrees.paris ?? []).filter((b) => ['won', 'lost', 'void'].includes(b.status) && dansLaSemaine(jourDuReglement(b), semaine));
  const rapport = rapportDeSuivi({ paris: parisDeLaSemaine, cloture: entrees.cloture, maintenant });
  const k = rapport.carnet;
  const detail = rapport.paris.filter((p) => p.gainReel !== null);
  const parGain = [...detail].sort((a, b) => b.gainReel - a.gainReel);
  const attente = (entrees.paris ?? []).filter((b) => b.status === 'pending');
  const paris = {
    lu: entrees.lectures?.paris !== false,
    regles: k.regles,
    gagnes: k.gagnes,
    perdus: k.perdus,
    annules: k.annules,
    mise: arrondi(k.mise, 2),
    gainReel: arrondi(k.gainReel, 2),
    roiPct: finie(k.roi) ? arrondi(k.roi, 1) : null,
    tauxReussitePct: finie(k.tauxReussite) ? Math.round(k.tauxReussite) : null,
    coteMoyenne: finie(k.coteMoyenne) ? arrondi(k.coteMoyenne, 2) : null,
    attendu: rapport.attendu.regles
      ? { paris: rapport.attendu.regles, gainAttendu: arrondi(rapport.attendu.gainAttendu, 2), gainReel: arrondi(rapport.attendu.gainReel, 2), ecart: arrondi(rapport.attendu.ecart, 2) }
      : null,
    enAttente: attente.length,
    meilleurs: parGain.filter((p) => p.gainReel > 0).slice(0, lim.extremes).map(pariEnClair),
    pires: [...parGain].reverse().filter((p) => p.gainReel < 0).slice(0, lim.extremes).map(pariEnClair)
  };

  // --- la valeur de clôture de ces paris.
  const cl = rapport.cloture;
  const valeurDeCloture = {
    disponible: Boolean(entrees.cloture?.disponible),
    raison: entrees.cloture?.disponible ? null : (entrees.cloture?.raison ?? null),
    parisMesures: cl.parisSimplesMesures,
    moyennePct: finie(cl.moyenne) ? arrondi(cl.moyenne, 1) : null,
    positifs: cl.positifs
  };

  // --- l'IA : ses avis de la semaine, et sa fiabilité d'ensemble.
  const ia = { semaine: { lu: entrees.lectures?.analyses !== false, ...iaDeLaSemaine(entrees.analyses ?? [], semaine, lim) }, carnet: carnetDeLIA(entrees.carnet, lim) };

  // --- les championnats : vos paris de la semaine par championnat, puis la carte « où parier ».
  const lignes = (rapport.tableaux.find((t) => t.cle === 'championnat')?.lignes ?? []).filter((l) => l.paris > 0);
  const uneLigne = (l) => ({ championnat: l.libelle, regles: l.regles, gagnes: l.gagnes, perdus: l.perdus, gain: arrondi(l.gainReel, 2), roiPct: finie(l.roi) ? arrondi(l.roi, 1) : null });
  const carte = entrees.carte;
  const casesVertes = carte ? [...carte.index.values()].filter((c) => c.couleur === 'vert') : [];
  const championnats = {
    rentables: lignes.filter((l) => l.gainReel > 0).sort((a, b) => b.gainReel - a.gainReel).slice(0, lim.ligues).map(uneLigne),
    perdants: lignes.filter((l) => l.gainReel < 0).sort((a, b) => a.gainReel - b.gainReel).slice(0, lim.ligues).map(uneLigne),
    carteOuParier: carte
      ? { mois: carte.mois, aJour: carte.aJour !== false, cases: carte.resume.cases, vertes: carte.resume.vertes, rouges: carte.resume.rouges, grises: carte.resume.grises, listeDesVertes: casesVertes.slice(0, lim.casesVertes).map((c) => ({ championnat: c.league, marche: libelleDeLaColonne(c.colonne), matchs: c.matchs ?? null })) }
      : null
  };

  return {
    version: 1,
    genre: 'semaine',
    semaine: { cle: semaine.cle, du: semaine.du, au: semaine.au, enLettres: semaineEnLettres(semaine) },
    genereeLe: new Date(maintenant).toISOString(),
    mode: econome ? 'econome' : 'normal',
    pronostics,
    paris,
    valeurDeCloture,
    ia,
    championnats,
    problemes: entrees.problemes ?? []
  };
}

/** La fiche de la semaine n'a rien à dire : ni pronostic réglé, ni pari réglé, ni avis de l'IA jugé cette semaine. */
export const ficheDeLaSemaineVide = (fiche) =>
  fiche.pronostics.lu && fiche.paris.lu && fiche.ia.semaine.lu && fiche.pronostics.regles === 0 && fiche.paris.regles === 0 && fiche.paris.annules === 0 && fiche.ia.semaine.avis === 0;

