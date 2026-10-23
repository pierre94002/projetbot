/**
 * opportunities.js — la page « Opportunités du jour » (étape 8 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * UNE liste de ce que montraient trois écrans séparés : le Repérage
 * (probabilité du moteur, cote juste, meilleure cote de vos bookmakers), les
 * Chutes de cotes (mouvement depuis l'ouverture) et les value bets de Mes
 * paris (le verdict du moteur). Une ligne par pari possible :
 *   - une issue 1N2 que l'un de VOS bookmakers cote (relevé The Odds API) :
 *     son verdict, celui de findValueBet, pris maintenant (verdictPari.js) —
 *     value ou non, et aussi quand aucun avis n'est possible (pas assez de
 *     bookmakers de référence, coupe-circuit enclenché) : la cote est là, la
 *     raison aussi ;
 *   - toute issue dont la cote juste a chuté d'au moins 5 % depuis
 *     l'ouverture (la règle de la page Chutes de cotes), même sans cote chez
 *     vous : dite « pas de cote chez vos bookmakers ».
 * Chaque ligne porte aussi l'état de la composition (cache des compositions
 * FotMob, sans requête ; sinon « dernière alignée » si le magasin en a une)
 * et la confiance, « pas encore mesurée » tant que l'étape 38 n'existe pas.
 * Étape 23 (22/10/2026) : chaque ligne porte aussi la CASE de la carte « où
 * parier » de son championnat et de son marché (verte, grise, rouge, et la
 * phrase) ; le tri met les lignes des cases ROUGES à la fin de la liste, et,
 * à verdict égal, celles des cases VERTES d'abord. Rien n'est masqué ; le
 * verdict, la pastille de value et les notifications ne changent pas de
 * décision. Sans carte (aucun rejeu du banc encore), rien ne change.
 *
 * RIEN DE LOURD À LA LECTURE : tout vient de l'état préparé du Repérage
 * (screener.js, calculé en arrière-plan et gardé 30 minutes) ; seuls le
 * verdict (quelques microsecondes par match), la fraîcheur et l'état des
 * compositions (une requête sur une petite table) se prennent maintenant.
 * Aucun appel réseau, aucun crédit, aucun appel à Claude.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import { openDb } from './db/matchStatsDb.js';
import { getScreener, MARCHES } from './screener.js';
import { getFixturePaths } from './repositories/fixturesRepository.js';
import { ETATS_AVEC_OFFRE } from '../core/engine/verdictPari.js';
import { preparerAVerifier, familleDuMarche } from './controleQuotidien.js';
import { carteDesLecteurs, caseDuPari, rangDeLaCase } from './bettingMap.js';

const JOUR_MS = 86_400_000;
const AVEC_OFFRE = new Set(ETATS_AVEC_OFFRE);
/** Une cote de vos bookmakers est-elle au verdict (value lue ou non : pas de cote juste, coupe-circuit…) ? */
const aUneOffre = (verdict) => Boolean(verdict && verdict.cote != null && verdict.bookmaker);
const MARCHE = new Map(MARCHES.map((m) => [m.key, m]));

/** Le pari d'une ligne, en clair : « Arsenal gagne », « Plus de 2,5 buts »… */
export function libelleDuPari(cle, { home = 'Domicile', away = 'Extérieur' } = {}) {
  if (cle === 'home') return `${home} gagne`;
  if (cle === 'away') return `${away} gagne`;
  if (cle === 'draw') return 'Match nul';
  return MARCHE.get(cle)?.label ?? cle;
}

const arrondi = (x, n = 2) => Number(Number(x).toFixed(n));
const jour = (t) => new Date(t).toISOString().slice(0, 10);

/** Les noms d'une liste de joueurs lue en JSON (cache des compositions) : [{ name }]. */
function noms(texte) {
  try {
    const liste = JSON.parse(texte ?? '[]');
    return Array.isArray(liste) ? liste.filter((j) => j?.name).map((j) => ({ name: String(j.name) })) : [];
  } catch {
    return [];
  }
}

/**
 * Les compositions que FotMob a déjà publiées pour les matchs de la période,
 * lues dans le cache des compositions (upcoming_lineups, rempli par la boucle
 * des compositions et la page des matchs) — sans requête FotMob. Indexées par
 * « identifiant du club qui reçoit | identifiant du club qui se déplace ».
 */
// Exportée (étape 42) : le bulletin du jour lit les compositions par la MÊME règle que cette page.
export function compositionsDuCache(database, debut, fin) {
  const index = new Map();
  let lignes = [];
  try {
    lignes = database
      .prepare(
        `SELECT home_id AS homeId, away_id AS awayId, date, kickoff, fetched_at AS fetchedAt,
                json_extract(payload, '$.available') AS available,
                json_extract(payload, '$.home.startXI') AS homeXI, json_extract(payload, '$.home.unavailable') AS homeAbsents,
                json_extract(payload, '$.away.startXI') AS awayXI, json_extract(payload, '$.away.unavailable') AS awayAbsents
         FROM upcoming_lineups WHERE date >= ? AND date <= ?`
      )
      .all(debut, fin);
  } catch {
    lignes = []; // table absente (base ancienne) : aucune composition connue, dit comme tel
  }
  for (const l of lignes) {
    if (!l.homeId || !l.awayId || !Number(l.available)) continue;
    const cle = `${l.homeId}|${l.awayId}`;
    index.set(cle, [...(index.get(cle) ?? []), l]);
  }
  return index;
}

/**
 * L'état de la composition d'un match, sous la forme que lit l'écran
 * (LineupStateBadge, règle etatComposition de ui/src/utils/langageParis.js) :
 *   - publiée par FotMob (cache) : { source: 'FotMob', minutesBeforeKickoff,
 *     home/away : titulaires et absents par leur nom } — « officielle » dans
 *     l'heure qui précède le coup d'envoi, « probable » avant ;
 *   - sinon, la dernière composition alignée gardée au magasin : { source: 'magasin' } ;
 *   - sinon : null (« Compo non publiée »).
 */
export function compositionDe(m, index) {
  const t = Date.parse(m.commenceTime ?? '');
  const lue = m.homeId && m.awayId ? (index.get(`${m.homeId}|${m.awayId}`) ?? []).find((l) => Number.isFinite(t) && Math.abs(Date.parse(`${l.date}T12:00:00Z`) - t) <= 1.5 * JOUR_MS) : null;
  if (lue) {
    const coupDEnvoi = Date.parse(lue.kickoff ?? m.commenceTime ?? '');
    const minutes = Number.isFinite(coupDEnvoi) && Number.isFinite(Date.parse(lue.fetchedAt)) ? Math.round((coupDEnvoi - Date.parse(lue.fetchedAt)) / 60_000) : null;
    return {
      source: 'FotMob',
      fetchedAt: lue.fetchedAt,
      minutesBeforeKickoff: minutes,
      home: { startXI: noms(lue.homeXI), unavailable: noms(lue.homeAbsents) },
      away: { startXI: noms(lue.awayXI), unavailable: noms(lue.awayAbsents) }
    };
  }
  return m.lastLineupKnown ? { source: 'magasin' } : null;
}

/** Le rang d'une ligne dans le tri : la value verte d'abord, puis les lectures réelles, puis ce qui est écarté, puis les chutes seules. */
export function rangDeTri(verdict) {
  const etat = verdict?.etat ?? null;
  if (etat === 'value') return 0;
  if (['a-rafraichir', 'value-secondaire', 'sous-seuil', 'sans-value'].includes(etat)) return 1;
  if (AVEC_OFFRE.has(etat) || aUneOffre(verdict)) return 2;
  return 3;
}

/**
 * Tri par défaut : les lignes des cases ROUGES de la carte « où parier » à la fin (étape 23), puis le rang, puis
 * la case (verte avant grise), puis value (la plus forte d'abord), puis chute, puis coup d'envoi. Sans carte,
 * toutes les lignes ont le même rang de case : l'ordre d'avant.
 */
export function trierLesLignes(lignes) {
  const valeur = (l) => (rangDeTri(l.verdict) <= 2 && Number.isFinite(l.verdict?.pourcent) ? l.verdict.pourcent : -Infinity);
  const chute = (l) => (l.mouvement?.chute ? l.mouvement.dropPct : -Infinity);
  const rouge = (l) => (l.carte?.couleur === 'rouge' ? 1 : 0);
  return [...lignes].sort(
    (a, b) =>
      rouge(a) - rouge(b) ||
      rangDeTri(a.verdict) - rangDeTri(b.verdict) ||
      rangDeLaCase(a.carte) - rangDeLaCase(b.carte) ||
      valeur(b) - valeur(a) ||
      chute(b) - chute(a) ||
      String(a.commenceTime).localeCompare(String(b.commenceTime)) ||
      a.cle.localeCompare(b.cle)
  );
}

/**
 * Étape 14 du plan : le badge « à vérifier » de chaque ligne — les raisons du
 * contrôle quotidien qui touchent les données de ce match (ses deux clubs par
 * leur identifiant FotMob, son championnat, la famille du marché).
 * Informatif : le verdict, le tri et les notifications ne changent pas. Sans
 * état du contrôle, ou s'il ne se lit pas : aucune marque.
 */
export function marquerAVerifier(lignes, { maintenant = Date.now(), verifier = null } = {}) {
  let regle = verifier;
  if (!regle) {
    try {
      regle = preparerAVerifier({ maintenant });
    } catch {
      regle = null;
    }
  }
  return lignes.map((l) => {
    let a = null;
    try {
      a = regle ? regle({ league: l.league, date: String(l.commenceTime ?? '').slice(0, 10), homeId: l.homeId, awayId: l.awayId, famille: familleDuMarche(l.marche) }) : null;
    } catch {
      a = null;
    }
    // Le champ n'existe que s'il y a une raison : une ligne sans doute reste telle qu'avant.
    return a ? { ...l, aVerifier: a } : l;
  });
}

/** La date du dernier relevé The Odds API (le fichier de l'instantané) : la cote jouable vient de là. */
function releveDesCotesDeVosBookmakers() {
  const fichier = getFixturePaths().odds;
  try {
    return { fichier, releveAt: fs.statSync(fichier).mtime.toISOString() };
  } catch {
    return { fichier, releveAt: null };
  }
}

/**
 * Les lignes de la page à partir des données du Repérage (avec leurs
 * verdicts et leur fraîcheur, pris à la lecture). Pur, à part l'état des
 * compositions qu'on lui passe : de quoi le rejouer dans les tests.
 */
export function lignesDesOpportunites(donnees, { compositions = new Map(), carte = null } = {}) {
  const lignes = [];
  for (const m of donnees?.matches ?? []) {
    const compo = compositionDe(m, compositions);
    for (const k of m.markets ?? []) {
      const verdict = k.verdict ?? null;
      const avecOffre = aUneOffre(verdict);
      const chute = Boolean(k.movement?.chute);
      if (!avecOffre && !chute) continue;
      const def = MARCHE.get(k.key);
      lignes.push({
        cle: `${m.matchId}|${k.key}`,
        matchId: m.matchId,
        league: m.league,
        home: m.home,
        away: m.away,
        homeId: m.homeId ?? null,
        awayId: m.awayId ?? null,
        commenceTime: m.commenceTime,
        exactKickoff: Boolean(m.exactKickoff),
        oddsSource: m.oddsSource ?? null,
        marche: k.key,
        groupe: def?.group ?? null,
        libelleMarche: def?.label ?? k.key,
        pari: libelleDuPari(k.key, m),
        // Les chiffres du Repérage, tels quels (mêmes champs, mêmes valeurs).
        probabilite: k.engineProb ?? null,
        coteJuste: k.engineProb > 0 ? arrondi(1 / k.engineProb) : null,
        probabiliteMarche: k.marketProb ?? null,
        bookmakersMarche: k.marketBookmakers ?? 0,
        ecartPoints: k.gapPoints ?? null,
        meilleureCote:
          k.bestOdds != null
            ? { cote: k.bestOdds, bookmaker: k.bestBookmaker ?? null, cle: k.bestBookmakerKey ?? null, releveAt: k.bestOddsAt ?? null, origine: k.bestOddsOrigin ?? null, fraicheur: k.freshness ?? null }
            : null,
        // Le verdict du moteur (verdictPari.js) : la même source que l'onglet « Value bets » de Mes paris.
        verdict,
        avecOffre,
        // Les chiffres des Chutes de cotes, tels quels.
        mouvement: k.movement ?? null,
        chute,
        compo,
        // L'étape 38 du plan la mesurera ; d'ici là, rien n'est inventé.
        confiance: null,
        // Étape 23 : la case de la carte « où parier » (championnat × marché) ; absente tant qu'aucune carte n'existe.
        ...(carte ? { carte: caseDuPari(carte, m.league, k.key) } : {})
      });
    }
  }
  return trierLesLignes(lignes);
}

/**
 * La page « Opportunités du jour » : ce qui est connu tout de suite (le
 * Repérage relance son calcul s'il n'y a rien, s'il est trop vieux, ou si un
 * relevé The Odds API a eu lieu depuis), avec l'avancement pendant le calcul.
 * `calculSiPerime` faux : ne relance le calcul que s'il n'y a rien ou après un
 * nouveau relevé (la surveillance des notifications ne doit pas le relancer
 * toutes les 30 minutes).
 */
export function getOpportunities({ force = false, calculSiPerime = true, maintenant = Date.now(), database = null } = {}) {
  const lu = getScreener({ force, calculSiPerime, maintenant });
  const base = { status: lu.status, progress: lu.progress, error: lu.error };
  if (!lu.data) return { ...base, data: null };
  let compositions = new Map();
  try {
    compositions = compositionsDuCache(database ?? openDb(), jour(maintenant - JOUR_MS), jour(maintenant + (lu.data.days + 1) * JOUR_MS));
  } catch {
    compositions = new Map();
  }
  // Étape 23 : la carte « où parier » (une requête d'une ligne ; relue seulement quand une nouvelle carte est rangée).
  let carte = null;
  try {
    carte = carteDesLecteurs({ database: database ?? openDb() });
  } catch {
    carte = null;
  }
  const lignes = marquerAVerifier(lignesDesOpportunites(lu.data, { compositions, carte }), { maintenant });
  const matchs = lu.data.matches ?? [];
  const avecVosCotes = matchs.filter((m) => (m.markets ?? []).some((k) => aUneOffre(k.verdict)));
  return {
    ...base,
    data: {
      generatedAt: lu.data.generatedAt,
      durationMs: lu.data.durationMs,
      evalueeLe: new Date(maintenant).toISOString(),
      days: lu.data.days,
      markets: lu.data.markets,
      freshness: lu.data.freshness ?? null,
      releve: releveDesCotesDeVosBookmakers(),
      lignes,
      resume: {
        matchs: matchs.length,
        matchsAvecVosCotes: avecVosCotes.length,
        matchsSansVosCotes: matchs.length - avecVosCotes.length,
        lignes: lignes.length,
        vertes: lignes.filter((l) => l.verdict?.vert).length,
        aRafraichir: lignes.filter((l) => l.verdict?.etat === 'a-rafraichir').length,
        chutes: lignes.filter((l) => l.chute).length,
        chutesSansVosCotes: lignes.filter((l) => l.chute && !l.avecOffre).length,
        // Le coupe-circuit de Réglages enclenché : aucun pari n'est conseillé, la page le dit.
        coupeCircuit: lignes.some((l) => l.verdict?.etat === 'coupe-circuit'),
        // Étape 23 : combien de lignes tombent dans une case verte, rouge de la carte « où parier » (seulement quand une carte existe).
        ...(carte ? { enCaseVerte: lignes.filter((l) => l.carte?.couleur === 'vert').length, enCaseRouge: lignes.filter((l) => l.carte?.couleur === 'rouge').length } : {})
      },
      // Étape 23 : la carte lue (null sans carte) ; `aJour` faux : réglages du moteur changés, couleurs suspendues.
      carte: carte ? { id: carte.id, mois: carte.mois, calculeLe: carte.calculeLe, aJour: carte.aJour, resume: carte.resume } : null,
      failures: lu.data.failures ?? []
    }
  };
}

/**
 * Les seules opportunités VERTES, en peu de mots : ce que la surveillance des
 * notifications lit (toutes les deux minutes, quand Pierre l'a activée). Ne
 * relance jamais le calcul pour un simple âge de 30 minutes.
 */
export function getOpportunitesVertes({ maintenant = Date.now() } = {}) {
  const lu = getScreener({ calculSiPerime: false, maintenant });
  // Étape 23 : la case de la carte, pour dire « case rouge » dans la notification (jamais pour en retirer une).
  let carte = null;
  try {
    carte = lu.data ? carteDesLecteurs() : null;
  } catch {
    carte = null;
  }
  const vertes = [];
  for (const m of lu.data?.matches ?? []) {
    for (const k of m.markets ?? []) {
      const v = k.verdict;
      if (!v?.vert) continue;
      vertes.push({
        cle: `${m.matchId}|${k.key}`,
        matchId: m.matchId,
        league: m.league,
        home: m.home,
        away: m.away,
        commenceTime: m.commenceTime,
        exactKickoff: Boolean(m.exactKickoff),
        pari: libelleDuPari(k.key, m),
        verdict: v,
        ...(carte ? { carte: caseDuPari(carte, m.league, k.key) } : {})
      });
    }
  }
  return {
    status: lu.status,
    error: lu.error,
    generatedAt: lu.data?.generatedAt ?? null,
    evalueeLe: new Date(maintenant).toISOString(),
    vertes: vertes.sort((a, b) => b.verdict.pourcent - a.verdict.pourcent)
  };
}
