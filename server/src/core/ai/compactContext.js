/**
 * compactContext.js — la FICHE COMPACTE envoyée à l'IA d'analyse de match (étape 41 du plan).
 * -----------------------------------------------------------------------
 * Jusqu'ici, le message de chaque match était fait de gros blocs JSON : le
 * moteur, la forme, les moyennes, la composition complète, l'expérience
 * passée, chaque clé répétée à chaque ligne. Mesuré sur 47 vraies analyses du
 * bac (02-05/10/2026) : ~25 000 caractères pour un avant-match, ~15 000 pour
 * une revue, et des consignes qui commençaient par le nom des équipes.
 *
 * Ici, la MÊME information, rangée en petits tableaux de texte :
 *   - les pronostics du moteur à cote juste ≥ 1,20 (COTE_MINIMALE), une ligne
 *     chacun (marché, pronostic, pourcentage, cote juste) ;
 *   - le moteur, le classement, la forme et les moyennes en lignes courtes ;
 *   - les compositions réduites à l'essentiel : le onze, le banc qui a compté,
 *     les titulaires habituels absents, les absents (ceux qui ont joué cette
 *     saison d'abord, quand le magasin le sait), le cadre du match ;
 *   - l'expérience de l'IA, ses comptes et ses leçons, sans clés répétées.
 * Rien d'utile ne se perd : chaque valeur de l'ancien message se retrouve dans
 * la fiche, sauf les champs listés dans NON_RECOPIES (redondants ou internes,
 * la raison est écrite) — un test le vérifie valeur par valeur. Une donnée de
 * forme inconnue n'est jamais jetée : elle passe en ligne « clé : valeur ».
 *
 * Ce qui CHANGE d'un match à l'autre est ici, dans le message du match ; les
 * consignes, elles, sont FIXES (matchAiAnalysisPrompt.js : CONSIGNES_*), pour
 * que Claude les relise depuis sa mémoire cache au lieu de les réécrire à
 * chaque appel.
 *
 * L'ANCIENNE FORME reste disponible (réglage AI_ANALYSIS_FICHE=ancienne, cf.
 * config/env.js) : pour comparer, ou revenir en arrière si la fiche compacte
 * faisait baisser la qualité des avis. Chaque appel note sa forme au journal
 * (étape 4), chaque analyse l'enregistre (`fiche`).
 *
 * Ici aussi, le RATTACHEMENT de ce que l'IA écrit (un avis, un bilan) au
 * marché du moteur qu'il commente (rattacherAuxMarches) : aucun avis perdu,
 * aucun avis donné à deux marchés, quelle que soit la forme.
 *
 * Étape 43 (07/10/2026) : les faits de la REVUE portent le déroulé du match
 * (derouleDuMatch.js : buts et score qui suit, penalties, but contre son camp
 * écrit pour le bon camp, cartons et « à dix », remplacements, blessés) et,
 * quand FotMob en a un, des extraits de son texte minute par minute
 * (providers/fotMobCommentaire.js) — blocFaitsAvecDeroule. Un appelant qui ne
 * donne pas de déroulé (anciens essais) reçoit le bloc d'avant, mot pour mot.
 *
 * Fonctions pures : aucune base, aucun réseau, aucun Claude, aucune lecture
 * de l'environnement (le réglage est passé par l'appelant).
 * -----------------------------------------------------------------------
 */

import { COTE_MINIMALE } from '../../sports/football/markets.js';
import { lignesDuDeroule } from './derouleDuMatch.js';

export const FICHES = Object.freeze({ compacte: 'compacte', ancienne: 'ancienne' });

/**
 * La forme de la fiche : `demande` (paramètre d'un appel : essai,
 * comparaison) quand elle est valide, sinon le `reglage` (env.ficheIa, lu de
 * AI_ANALYSIS_FICHE par config/env.js) ; compacte par défaut — seule la
 * valeur « ancienne » ramène l'ancienne forme.
 */
export function formeDeLaFiche(demande = null, reglage = null) {
  if (demande === FICHES.compacte || demande === FICHES.ancienne) return demande;
  return reglage === FICHES.ancienne ? FICHES.ancienne : FICHES.compacte;
}

/**
 * Les pronostics que l'IA commente dans la fiche compacte : ceux à cote juste
 * d'au moins COTE_MINIMALE (1,20), dans l'ordre du moteur. Le moteur n'en
 * produit pas d'autres aujourd'hui (markets.js) ; une cote juste illisible est
 * gardée (elle était envoyée avant), une cote juste sous le plancher non.
 */
export function marchesPourIA(marketPredictions) {
  return (marketPredictions ?? []).filter((m) => {
    const cote = Number(m?.predictedOdds);
    return !(m?.predictedOdds !== null && m?.predictedOdds !== undefined && Number.isFinite(cote) && cote < COTE_MINIMALE);
  });
}

// ---------------------------------------------- rattachement des avis de l'IA
/** Libellé de marché comparable : l'IA recopie parfois « Buts — X » avec un autre tiret ou sans accent. */
export const cleMarche = (libelle) =>
  String(libelle ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‐-―-]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** En second recours : sans numéro de ligne en tête (« 3. », « 3) », « n° 3 : ») ni ponctuation. */
const cleSouple = (libelle) =>
  cleMarche(libelle)
    .replace(/^(n°\s*)?\d+\s*[.):\]-]\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Chaque élément écrit par l'IA (avis ou bilan) rattaché au marché du moteur
 * qu'il commente, sans jamais en perdre un ni en donner un à deux marchés :
 *   1. par libellé (tiret, accents et espaces près) — deux marchés de même
 *      libellé se partagent les avis par leur pronostic recopié ;
 *   2. par libellé sans numéro de ligne ni ponctuation (« 3. Buts Girona ») ;
 *   3. par position, quand l'IA a rendu autant d'éléments que de marchés (le
 *      schéma exige le même ordre) — seulement un élément encore libre dont
 *      le libellé ne désigne pas un AUTRE marché de la liste ;
 *   4. par le pronostic recopié (`pick`), s'il ne désigne qu'un seul marché
 *      encore sans avis.
 * Avant l'étape 41, le recours à la position pouvait donner à un marché
 * l'avis déjà rattaché à un autre (un avis en double, un autre perdu).
 * @returns {Array<object|null>} un élément (ou null) par marché, dans l'ordre des marchés
 */
export function rattacherAuxMarches(ecrits = [], marches = []) {
  const liste = Array.isArray(ecrits) ? ecrits : [];
  const libres = new Set([...liste.keys()].filter((k) => liste[k] && typeof liste[k] === 'object'));
  const res = marches.map(() => null);
  const prendre = (i, k) => {
    res[i] = liste[k];
    libres.delete(k);
  };
  const pronosticDe = (m) => cleMarche(m?.predictedLabel ?? m?.pick);
  for (const cle of [cleMarche, cleSouple]) {
    marches.forEach((m, i) => {
      if (res[i]) return;
      const cible = cle(m?.market);
      if (!cible) return;
      const candidats = [...libres].filter((x) => cle(liste[x].market) === cible);
      if (!candidats.length) return;
      // Deux marchés de même libellé (deux lignes d'un même marché) : l'avis dont le
      // pronostic recopié est le sien ; sinon le premier qu'aucun AUTRE marché de ce
      // libellé, encore sans avis, ne réclame par son pronostic.
      const sien = pronosticDe(m);
      const reclames = new Set(marches.flatMap((x, j) => (j !== i && !res[j] && cle(x?.market) === cible && pronosticDe(x) ? [pronosticDe(x)] : [])));
      const k = candidats.find((x) => sien && cleMarche(liste[x].pick) === sien) ?? candidats.find((x) => !reclames.has(cleMarche(liste[x].pick)));
      if (k !== undefined) prendre(i, k);
    });
  }
  const libellesDuMoteur = marches.map((m) => cleSouple(m?.market));
  if (liste.length === marches.length) {
    marches.forEach((m, i) => {
      if (res[i] || !libres.has(i)) return;
      const sien = cleSouple(liste[i].market);
      const designeUnAutre = Boolean(sien) && libellesDuMoteur.some((l, j) => j !== i && l === sien);
      if (!designeUnAutre) prendre(i, i);
    });
  }
  const sansAvis = marches.map((m, i) => (res[i] ? null : cleMarche(m?.predictedLabel ?? m?.pick) || null));
  for (const k of [...libres]) {
    const pick = cleMarche(liste[k].pick);
    if (!pick) continue;
    const cibles = sansAvis.flatMap((x, i) => (x === pick ? [i] : []));
    if (cibles.length === 1) {
      prendre(cibles[0], k);
      sansAvis[cibles[0]] = null;
    }
  }
  return res;
}

// ------------------------------------------------------------ mise en forme
const estVide = (v) => v === null || v === undefined || v === '';

/** Un nombre à la française (virgule décimale), tel quel sinon ; « – » pour une valeur absente. */
export function nombre(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v).replace('.', ',');
  return estVide(v) ? '–' : String(v);
}

const texte = (v) => (typeof v === 'boolean' ? (v ? 'oui' : 'non') : nombre(v));

/** Un texte écrit (par l'IA, par Pierre) sur une seule ligne. */
const uneLigne = (v) => String(v ?? '').replace(/\s*\r?\n\s*/g, ' ').trim();

/**
 * Toute valeur, en ligne : « clé valeur · clé valeur », objets imbriqués en
 * « clé.sous-clé », listes de valeurs séparées par « , », listes d'objets
 * entre crochets. Sert aux sources rares (équipe inconnue du magasin) et à
 * tout champ que la fiche ne connaît pas encore : rien n'est jeté.
 */
export function enLigne(valeur) {
  if (estVide(valeur)) return '–';
  if (Array.isArray(valeur)) {
    if (!valeur.length) return 'aucun';
    return valeur.every((x) => x === null || typeof x !== 'object') ? valeur.map(texte).join(', ') : valeur.map((x) => `[${enLigne(x)}]`).join(' ');
  }
  if (typeof valeur === 'object') {
    const morceaux = [];
    const parcourir = (obj, prefixe) => {
      for (const [cle, v] of Object.entries(obj)) {
        if (estVide(v)) continue;
        const nom = prefixe ? `${prefixe}.${cle}` : cle;
        if (v && typeof v === 'object' && !Array.isArray(v)) parcourir(v, nom);
        else morceaux.push(`${nom} ${Array.isArray(v) ? enLigne(v) : texte(v)}`);
      }
    };
    parcourir(valeur, '');
    return morceaux.length ? morceaux.join(' · ') : '–';
  }
  return texte(valeur);
}

/** Les clés d'un objet que la fiche ne connaît pas (non vides), en ligne ; '' s'il n'y en a pas. */
function reste(obj, connues) {
  if (!obj || typeof obj !== 'object') return '';
  const autres = Object.fromEntries(Object.entries(obj).filter(([k, v]) => !connues.includes(k) && !estVide(v)));
  return Object.keys(autres).length ? enLigne(autres) : '';
}
const avecReste = (base, obj, connues) => {
  const r = reste(obj, connues);
  return r ? `${base} · autres : ${r}` : base;
};

/**
 * Ce que la fiche ne recopie PAS de l'ancien message, et pourquoi (chemins
 * de l'ancien message ; `*` = n'importe quel élément ou clé). Le test « rien
 * d'utile perdu » s'appuie sur cette liste : toute autre valeur doit se
 * retrouver dans la fiche.
 */
export const NON_RECOPIES = Object.freeze({
  'moteur.label': "« Équipe vs Équipe » : déjà en tête de la fiche",
  'moteur.marketPredictions.*.marketId': "identifiant interne du marché : le libellé (market) le dit",
  'moteur.marketPredictions.*.params': 'paramètres internes du marché : le libellé et le pronostic les disent',
  'moteur.marketPredictions.*.predictedOutcome': 'code interne de l’issue : le pronostic (predictedLabel) le dit',
  'moteur.marketPredictions.*.minOdds': 'le plancher de cote, identique pour tous : écrit une fois en tête du tableau',
  'moteur.staking.bookmaker': 'clé interne du bookmaker : son nom (bookmakerTitle) est écrit',
  'moteur.staking.candidates.*.bookmaker': 'clé interne du bookmaker : son nom (bookmakerTitle) est écrit',
  'moteur.staking.displayedOdds': 'égale à la cote (odds) ; écrite seulement quand elle diffère',
  'moteur.staking.candidates.*.displayedOdds': 'égale à la cote (odds) ; écrite seulement quand elle diffère',
  'moteur.staking.candidates.*.outcome': 'code interne de l’issue : son libellé (label) est écrit',
  'moteur.staking.outcome': 'code interne de l’issue : son libellé (label) est écrit',
  'contexte.standings.*.teamId': 'identifiant interne du club',
  'contexte.standings.*.teamLogo': 'image du club, pour l’écran',
  'contexte.standings.*.shortName': 'nom court du club, pour l’écran : le nom complet est écrit',
  'contexte.homeStats.source': 'écrite une fois en tête de la section',
  'contexte.awayStats.source': 'écrite une fois en tête de la section',
  'contexte.homeForm.source': 'écrite une fois en tête de la section',
  'contexte.awayForm.source': 'écrite une fois en tête de la section',
  'contexte.homeForm.sampleSize': 'le nombre de matchs listés le dit',
  'contexte.awayForm.sampleSize': 'le nombre de matchs listés le dit',
  'contexte.homeForm.matches.*.venue': 'écrit en abrégé : (dom) / (ext)',
  'contexte.awayForm.matches.*.venue': 'écrit en abrégé : (dom) / (ext)',
  'contexte.lineups.*.startXI.*.position': 'écrit en abrégé : G, D, M, A',
  'contexte.lineups.*.bench.*.position': 'écrit en abrégé : G, D, M, A',
  'contexte.lineups.*.usualStartersMissing.*.position': 'écrit en abrégé : G, D, M, A',
  'contexte.teamNews.*.teamName': 'le nom de l’équipe est écrit en tête de la ligne',
  // Les blessés et suspendus des actualités viennent de la même page FotMob que les
  // absents de la composition : quand la composition les donne (même nom), ils ne
  // sont écrits qu'une fois, avec le motif de la composition (« blessé ») au lieu
  // du type des actualités (« blessure »). Sans composition, tout est écrit.
  'contexte.teamNews.*.longTermAbsences.*.type': 'le motif de la composition est écrit à la place, quand elle donne déjà ce joueur',
  'experience.*.marketType': 'clé interne du type de marché : son libellé (label) est écrit'
});

/** Même liste pour la revue d'après-match (chemins de l'ancien message de revue). */
export const NON_RECOPIES_REVUE = Object.freeze({
  'moteur.label': "« Équipe vs Équipe » : déjà en tête de la fiche",
  'moteur.marketPredictions.*.marketId': 'identifiant interne du marché : le libellé le dit',
  'moteur.marketPredictions.*.params': 'paramètres internes du marché : le libellé et le pronostic les disent',
  'moteur.marketPredictions.*.predictedOutcome': 'code interne de l’issue : le pronostic le dit',
  'moteur.marketPredictions.*.minOdds': 'le plancher de cote : dans la consigne, inutile pour juger l’issue',
  'moteur.staking.bookmaker': 'clé interne du bookmaker : son nom est écrit',
  'moteur.staking.candidates.*.bookmaker': 'clé interne du bookmaker : son nom est écrit',
  'moteur.staking.displayedOdds': 'égale à la cote ; écrite seulement quand elle diffère',
  'moteur.staking.candidates.*.displayedOdds': 'égale à la cote ; écrite seulement quand elle diffère',
  'moteur.staking.candidates.*.outcome': 'code interne de l’issue : son libellé est écrit',
  'moteur.staking.outcome': 'code interne de l’issue : son libellé est écrit',
  'issues.*.marketId': 'identifiant interne du marché : le libellé le dit',
  'issues.*.minOdds': 'le plancher de cote : dans la consigne, inutile pour juger l’issue',
  'faits.goals.*.side': 'écrit avec le nom de l’équipe',
  'faits.redCards.*.side': 'écrit avec le nom de l’équipe',
  'faits.goals.*.ownGoal': 'écrit seulement quand c’est vrai (« contre son camp »)',
  'faits.goals.*.penalty': 'écrit seulement quand c’est vrai (« penalty »)'
});

// ---------------------------------------------------------------- le moteur
function mise(s) {
  if (!s || typeof s !== 'object') return 'aucune information';
  const morceaux = [];
  if (s.action === 'RECOMMENDED') {
    const affichee = !estVide(s.displayedOdds) && s.displayedOdds !== s.odds ? ` (affichée ${texte(s.displayedOdds)})` : '';
    morceaux.push(
      `RECOMMENDED : ${texte(s.stake)} sur ${texte(s.label)} à ${texte(s.odds)}${affichee} chez ${texte(s.bookmakerTitle ?? s.bookmaker)} (cote juste ${texte(s.fairOdds)}, EV ${texte(s.ev)}${s.exclusion ? `, ${s.exclusion}` : ''})`
    );
  } else if (s.action) {
    morceaux.push(`${s.action}${s.reason ? ` (${s.reason})` : ''}${estVide(s.stake) ? '' : `, mise ${texte(s.stake)}`}`);
  }
  if ('recommended' in s) morceaux.push(`recommended ${texte(s.recommended)}`);
  if (Array.isArray(s.candidates) && s.candidates.length) {
    const candidat = (c) => {
      const affichee = !estVide(c.displayedOdds) && c.displayedOdds !== c.odds ? ` (affichée ${texte(c.displayedOdds)})` : '';
      const base = `${texte(c.label)} ${texte(c.odds)}${affichee} chez ${texte(c.bookmakerTitle ?? c.bookmaker)} (juste ${texte(c.fairOdds)}, EV ${texte(c.ev)}${c.exclusion ? `, ${c.exclusion}` : ''})`;
      return avecReste(base, c, ['outcome', 'label', 'odds', 'displayedOdds', 'bookmaker', 'bookmakerTitle', 'fairOdds', 'ev', 'exclusion']);
    };
    morceaux.push(`cotes jugées : ${s.candidates.map(candidat).join(' · ')}`);
  }
  if (s.limits) morceaux.push(`seuils : ${enLigne(s.limits)}`);
  const connues = ['action', 'stake', 'reason', 'recommended', 'candidates', 'limits'];
  if (s.action === 'RECOMMENDED') connues.push('outcome', 'label', 'odds', 'displayedOdds', 'bookmaker', 'bookmakerTitle', 'fairOdds', 'ev', 'exclusion');
  const r = reste(s, connues);
  if (r) morceaux.push(`autres : ${r}`);
  return morceaux.length ? morceaux.join(' ; ') : 'aucune information';
}

const STATS_ATTENDUES = [
  ['corners', 'corners'],
  ['shots', 'tirs'],
  ['shotsOnTarget', 'tirs cadrés']
];

/** Le moteur en quelques lignes : buts attendus, 1N2 (cote juste et du marché), edge, mise, attendus. */
function blocMoteur(es, { home, away }) {
  if (!es || typeof es !== 'object') return ['Moteur : indisponible.'];
  const lignes = [];
  const xg = es.expectedGoals;
  lignes.push(
    xg
      ? avecReste(`Buts attendus (expectedGoals${xg.source ? `, ${xg.source}` : ''}) : ${home} ${texte(xg.home)} · ${away} ${texte(xg.away)}`, xg, ['home', 'away', 'source'])
      : 'Buts attendus (expectedGoals) : inconnus'
  );
  const t = es.trueOdds ?? {};
  const m = es.market ?? {};
  const marche = [m.odds1, m.oddsDraw, m.odds2].some((x) => !estVide(x)) ? `1 ${texte(m.odds1)} · N ${texte(m.oddsDraw)} · 2 ${texte(m.odds2)}` : 'aucune';
  lignes.push(
    `1N2 — cote juste du moteur (trueOdds) : 1 ${texte(t.home)} · N ${texte(t.draw)} · 2 ${texte(t.away)} ; cotes du marché (market) : ${marche} ; edgePercent : ${estVide(es.edgePercent) ? 'aucun' : `${texte(es.edgePercent)} %`}`
  );
  lignes.push(`Mise (staking) : ${mise(es.staking)}`);
  const se = es.statExpectations;
  if (se && typeof se === 'object') {
    const cases = STATS_ATTENDUES.filter(([cle]) => se[cle]).map(([cle, nom]) => avecReste(`${nom} ${texte(se[cle].home)} / ${texte(se[cle].away)} / ${texte(se[cle].total)}`, se[cle], ['home', 'away', 'total']));
    const autres = reste(se, STATS_ATTENDUES.map(([cle]) => cle));
    lignes.push(`Attendus du moteur (statExpectations, ${home} / ${away} / total) : ${[...cases, ...(autres ? [`autres : ${autres}`] : [])].join(' · ') || 'aucun'}`);
  } else {
    lignes.push('Attendus du moteur (statExpectations) : aucun (pas assez de relevés de corners et de tirs)');
  }
  const autres = reste(es, ['label', 'expectedGoals', 'trueOdds', 'market', 'edgePercent', 'staking', 'statExpectations', 'marketPredictions']);
  if (autres) lignes.push(`Moteur, autres : ${autres}`);
  return lignes;
}

/** Le pourcentage d'un pronostic : celui du moteur, sinon 1 / cote juste. */
const pourcentage = (m) => (Number.isFinite(Number(m?.probability)) && m?.probability !== null ? Number(m.probability) : Number(m?.predictedOdds) > 1 ? Math.round(100 / Number(m.predictedOdds)) : null);

/** Le tableau des pronostics du moteur : une ligne par marché, dans l'ordre (le schéma exige le même). */
function tableauDesMarches(marches) {
  const planchers = [...new Set(marches.map((m) => m.minOdds ?? null))];
  const plancherCommun = planchers.length === 1 ? planchers[0] : undefined;
  const plancher = plancherCommun === undefined ? 'minOdds par ligne' : plancherCommun === null ? 'minOdds non noté' : `minOdds ${texte(plancherCommun)}`;
  const lignes = [
    `## marketPredictions — ${marches.length} pronostic(s) du moteur (${plancher}) : un avis par ligne, dans cet ordre`,
    `market | predictedLabel | probability | cote juste${plancherCommun === undefined ? ' | minOdds' : ''}`
  ];
  for (const m of marches) {
    const p = pourcentage(m);
    let ligne = `${uneLigne(m.market)} | ${uneLigne(m.predictedLabel)} | ${p === null ? '–' : `${texte(p)} %`} | ${texte(m.predictedOdds)}`;
    if (plancherCommun === undefined) ligne += ` | ${texte(m.minOdds)}`;
    const autres = reste(m, ['marketId', 'params', 'market', 'predictedOutcome', 'predictedLabel', 'predictedOdds', 'probability', 'minOdds']);
    lignes.push(autres ? `${ligne} | ${autres}` : ligne);
  }
  if (!marches.length) lignes.push('(aucun pronostic du moteur pour ce match)');
  return lignes;
}

/**
 * Étape 21 : UNE ligne quand le carnet de l'IA a retiré des types de marché de sa liste (data/aiScorecard.js) —
 * rien sinon (la fiche d'avant, à l'octet). Elle va dans la fiche du match, jamais dans les consignes fixes.
 */
function ligneDesRetires(retires) {
  const noms = [...new Set((Array.isArray(retires) ? retires : []).map((r) => uneLigne(r?.label ?? r?.type)).filter(Boolean))];
  if (!noms.length) return [];
  return [`Retirés de ta liste : ${noms.join(' · ')} — ton carnet montre que, sur assez de matchs, tes avis n'y font pas mieux que le moteur seul.`];
}

// ---------------------------------------------------- classement, forme, moyennes
const BILAN_LIEU = (b) => (b ? `${texte(b.played)} J ${texte(b.won)}-${texte(b.drawn)}-${texte(b.lost)} buts ${texte(b.goalsFor)}-${texte(b.goalsAgainst)}${reste(b, ['played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst']) ? ` (${reste(b, ['played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst'])})` : ''}` : '–');

function ligneClassement(row, nomParDefaut) {
  if (!row) return `${nomParDefaut} : absent du classement`;
  const connues = ['rank', 'teamId', 'teamName', 'shortName', 'teamLogo', 'played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst', 'goalDiff', 'points', 'deduction', 'description', 'home', 'away'];
  let ligne = `${texte(row.rank)}. ${texte(row.teamName ?? nomParDefaut)} — ${texte(row.played)} J, ${texte(row.won)}-${texte(row.drawn)}-${texte(row.lost)}, buts ${texte(row.goalsFor)}-${texte(row.goalsAgainst)} (diff ${texte(row.goalDiff)}), ${texte(row.points)} pts`;
  if (!estVide(row.deduction)) ligne += `, pénalité ${texte(row.deduction)}`;
  if (!estVide(row.description)) ligne += `, ${row.description}`;
  if (row.home || row.away) ligne += ` ; à domicile ${BILAN_LIEU(row.home)} ; à l'extérieur ${BILAN_LIEU(row.away)}`;
  const autres = reste(row, connues);
  return autres ? `${ligne} ; ${autres}` : ligne;
}

function blocClassement(standings, { home, away }) {
  if (!standings) return ['## standings — classement : indisponible (coupe, ou équipes non trouvées)'];
  return [
    '## standings — classement : rang. équipe — joués, V-N-D, buts pour-contre (diff), points ; à domicile ; à l’extérieur',
    ligneClassement(standings.home, home),
    ligneClassement(standings.away, away),
    ...(reste(standings, ['home', 'away']) ? [`autres : ${reste(standings, ['home', 'away'])}`] : [])
  ];
}

function ligneForme(forme, nom) {
  if (!forme) return `${nom} : forme non trouvée`;
  if (forme.source === 'FotMob (magasin)' && Array.isArray(forme.matches)) {
    const matchs = forme.matches.map((m) =>
      avecReste(`${texte(m.date)} ${texte(m.opponent)} (${m.venue === 'domicile' ? 'dom' : m.venue === 'extérieur' ? 'ext' : texte(m.venue)}) ${texte(m.score)} ${texte(m.result)}`, m, ['date', 'opponent', 'venue', 'score', 'result'])
    );
    const autres = reste(forme, ['source', 'matches', 'sampleSize']);
    return `${nom} : ${matchs.length ? matchs.join(' · ') : 'aucun match'}${autres ? ` · autres : ${autres}` : ''}`;
  }
  // API-Football (clic seulement, saison du plan souvent dépassée) ou forme inconnue.
  return `${nom} (${texte(forme.source)}) : ${enLigne(Object.fromEntries(Object.entries(forme).filter(([k]) => k !== 'source')))}`;
}

const COLONNES_MOYENNES = [
  ['xg', 'xG'],
  ['shots', 'tirs'],
  ['shotsOnTarget', 'cadrés'],
  ['bigChances', 'grosses occasions'],
  ['corners', 'corners'],
  ['possession', 'possession %'],
  ['yellowCards', 'jaunes']
];

function lignesMoyennes(stats, nom, lieu) {
  if (!stats) return [`${nom} : moyennes non trouvées`];
  if (stats.source !== 'FotMob (magasin)') return [`${nom} (${texte(stats.source)}) : ${enLigne(Object.fromEntries(Object.entries(stats).filter(([k]) => k !== 'source')))}`];
  const bloc = (b, periode) => {
    if (!b) return `${nom} | ${periode} | aucun match`;
    const cases = COLONNES_MOYENNES.map(([cle]) => `${texte(b.for?.[cle])} / ${texte(b.against?.[cle])}`);
    const autres = [reste(b, ['matches', 'results', 'goalsFor', 'goalsAgainst', 'for', 'against']), reste(b.for, COLONNES_MOYENNES.map(([c]) => c)), reste(b.against, COLONNES_MOYENNES.map(([c]) => c))].filter(Boolean);
    return `${nom} | ${periode} | ${texte(b.matches)} | ${texte(b.results)} | ${texte(b.goalsFor)} / ${texte(b.goalsAgainst)} | ${cases.join(' | ')}${autres.length ? ` | autres : ${autres.join(' · ')}` : ''}`;
  };
  const cleLieu = lieu === 'home' ? 'atHome' : 'away';
  const lignes = [`${nom} : du ${texte(stats.from)} au ${texte(stats.to)}`, bloc(stats.last10, '10 derniers'), bloc(stats[cleLieu], lieu === 'home' ? 'à domicile' : "à l'extérieur")];
  const autres = reste(stats, ['source', 'from', 'to', 'last10', cleLieu]);
  if (autres) lignes.push(`${nom}, autres : ${autres}`);
  return lignes;
}

// ------------------------------------------------------------- compositions
const POSTES = { Goalkeeper: 'G', Defender: 'D', Midfielder: 'M', Forward: 'A' };
const poste = (p) => POSTES[p] ?? (estVide(p) ? '?' : String(p));
const cleNom = (n) =>
  String(n ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** « joués/titularisations buts+passes xG note » ; « inconnu du magasin » sans chiffres. */
function chiffresJoueur(s) {
  if (!s) return 'inconnu du magasin';
  const base = `${texte(s.apps)}/${texte(s.starts)} ${texte(s.goals)}+${texte(s.assists)} ${texte(s.xg)} ${texte(s.rating)}`;
  const autres = reste(s, ['apps', 'starts', 'minutes', 'goals', 'assists', 'xg', 'rating']);
  return autres ? `${base} (${autres})` : base;
}

/** Les champs de la composition qui ne servent qu'à l'écran (identifiants, numéros, âge, nationalité, case du terrain). */
const CHAMPS_JOUEUR_ECRAN = ['id', 'number', 'age', 'countryCode', 'countryName', 'x', 'y'];

const joueur = (j) => avecReste(`${poste(j.position)} ${uneLigne(j.name)} ${chiffresJoueur(j.stats)}`, j, ['name', 'position', 'stats', ...CHAMPS_JOUEUR_ECRAN]);

/** Remplaçant qui a compté cette saison : au moins 3 titularisations, ou un but ou une passe décisive (la règle d'avant). */
const aCompte = (j) => j.stats && (j.stats.starts >= 3 || j.stats.goals > 0 || j.stats.assists > 0);

const retour = (r) => (estVide(r) ? '' : `, retour ${r}`);

function blocEquipe(t, nom, lineups) {
  if (!t) return [`### ${nom} : composition inconnue`];
  const lignes = [
    `### ${texte(t.team ?? nom)} — ${texte(t.formation)}, entraîneur ${texte(t.coach)} ; chiffres depuis le ${texte(t.statsSince)}, toutes compétitions, sur ${texte(t.teamMatches)} matchs de l'équipe`
  ];
  if (t.lastMatch) {
    const d = t.lastMatch;
    lignes.push(avecReste(`Onze du dernier match aligné (lastMatch) : ${texte(d.date)}, ${texte(d.league)}, ${texte(d.home)} ${texte(d.homeGoals)}-${texte(d.awayGoals)} ${texte(d.away)}`, d, ['date', 'league', 'home', 'away', 'homeGoals', 'awayGoals', 'fotmobId', 'matchKey']));
  }
  lignes.push(`Onze (startXI) : ${(t.startXI ?? []).map(joueur).join(' · ') || 'aucun'}`);
  const banc = (t.bench ?? []).filter(aCompte);
  lignes.push(`Banc qui a compté (bench) : ${banc.length ? banc.map(joueur).join(' · ') : 'aucun'}`);

  // Les absents annoncés pour CE match : ceux qui sont aussi titulaires
  // habituels sont écrits une seule fois, avec leur retour, dans la ligne des
  // titulaires habituels absents. Rapprochés par identifiant FotMob quand les
  // deux en ont un, sinon par le nom (accents et casse près).
  const absents = t.unavailable ?? [];
  const habituels = t.usualStartersMissing ?? [];
  const idValide = (j) => (j?.id && String(j.id) !== '0' ? String(j.id) : null);
  const absentDe = (h) => absents.find((a) => (idValide(a) && idValide(h) ? idValide(a) === idValide(h) : cleNom(a.name) === cleNom(h.name))) ?? null;
  const absentsDesHabituels = new Set();
  const habituel = (h) => {
    const absent = absentDe(h);
    if (absent) absentsDesHabituels.add(absent);
    // Absent annoncé pour un autre motif que son statut (cas contradictoire de FotMob) : les deux sont écrits.
    const motif = absent && !estVide(absent.reason) && absent.reason !== h.status ? `, annoncé ${absent.reason}` : '';
    // Le nom que donne FotMob, quand il s'écrit autrement que celui du magasin (« Inaki » / « Iñaki »).
    const graphie = absent && uneLigne(absent.name) !== uneLigne(h.name) ? ` (annoncé « ${uneLigne(absent.name)} »)` : '';
    const base = `${uneLigne(h.name)}${graphie} (${poste(h.position)}, ${texte(h.starts)} tit., ${texte(h.goals)}+${texte(h.assists)}) : ${texte(h.status)}${motif}${absent ? retour(absent.expectedReturn) : ''}`;
    return avecReste(base, h, ['name', 'position', 'starts', 'goals', 'assists', 'status', ...CHAMPS_JOUEUR_ECRAN]);
  };
  lignes.push(`Titulaires habituels absents du onze (usualStartersMissing) : ${habituels.length ? habituels.map(habituel).join(' · ') : 'aucun'}`);

  const autresAbsents = absents.filter((a) => !absentsDesHabituels.has(a));
  const absent = (a) => avecReste(`${a.stats ? `${poste(a.position)} ` : ''}${uneLigne(a.name)}${a.stats ? ` ${chiffresJoueur(a.stats)}` : ''} : ${texte(a.reason)}${retour(a.expectedReturn)}`, a, ['name', 'reason', 'expectedReturn', 'stats', 'position', ...CHAMPS_JOUEUR_ECRAN]);
  // Quand le magasin connaît leurs chiffres (compositions relues depuis l'étape 41) :
  // ceux qui ont joué cette saison d'abord, les autres en une ligne.
  const ontJoue = autresAbsents.filter((a) => a.stats && (a.stats.apps > 0 || a.stats.starts > 0));
  const sansMatch = autresAbsents.filter((a) => !ontJoue.includes(a));
  const dejaCites = absents.length - autresAbsents.length;
  const titre = lineups?.source === 'magasin' ? 'Absents annoncés par FotMob pour CE match (unavailable)' : 'Absents annoncés (unavailable)';
  if (!absents.length) lignes.push(`${titre} : aucun`);
  else {
    if (ontJoue.length) lignes.push(`${titre}, qui ont joué cette saison : ${ontJoue.map(absent).join(' · ')}`);
    if (sansMatch.length) lignes.push(`${ontJoue.length ? 'Autres absents' : titre} : ${sansMatch.map(absent).join(' · ')}`);
    if (dejaCites) lignes.push(`(${dejaCites} absent(s) titulaire(s) habituel(s), écrit(s) ci-dessus avec leur motif et leur retour)`);
  }
  const autres = reste(t, ['team', 'teamId', 'formation', 'coach', 'statsSince', 'teamMatches', 'startXI', 'bench', 'unavailable', 'usualStartersMissing', 'lastMatch']);
  if (autres) lignes.push(`Autres : ${autres}`);
  return lignes;
}

function cadreDuMatch(mi) {
  if (!mi) return null;
  const morceaux = [];
  if (!estVide(mi.round)) morceaux.push(`journée ${texte(mi.round)}`);
  const lieu = [mi.stadium, mi.city].filter((x) => !estVide(x)).map(uneLigne).join(', ');
  const stade = [lieu, estVide(mi.capacity) ? '' : `${texte(mi.capacity)} places`, estVide(mi.surface) ? '' : `pelouse ${mi.surface}`].filter(Boolean).join(', ');
  if (stade) morceaux.push(stade);
  const meteo = [
    estVide(mi.weather) ? '' : uneLigne(mi.weather),
    estVide(mi.temperature) ? '' : `${texte(mi.temperature)} °C`,
    estVide(mi.windSpeed) ? '' : `vent ${texte(mi.windSpeed)} km/h`,
    estVide(mi.precipitation) ? '' : `précipitations ${texte(mi.precipitation)}`
  ].filter(Boolean);
  if (meteo.length) morceaux.push(`météo ${meteo.join(', ')}`);
  const r = mi.referee;
  if (r && typeof r === 'object') {
    const qui = [r.country, r.league].filter((x) => !estVide(x)).join(', ');
    const chiffres = [
      estVide(r.matches) ? '' : `${texte(r.matches)} matchs`,
      estVide(r.yellowCardsPerMatch) ? '' : `jaunes ${texte(r.yellowCardsPerMatch)} par match (championnat ${texte(r.yellowCardsLeagueAverage)})`,
      estVide(r.foulsPerMatch) ? '' : `fautes ${texte(r.foulsPerMatch)} par match (championnat ${texte(r.foulsLeagueAverage)})`,
      estVide(r.redCards) ? '' : `rouges ${texte(r.redCards)}`,
      estVide(r.penalties) ? '' : `penalties ${texte(r.penalties)}`
    ].filter(Boolean);
    const autres = reste(r, ['name', 'country', 'league', 'matches', 'yellowCardsPerMatch', 'yellowCardsLeagueAverage', 'foulsPerMatch', 'foulsLeagueAverage', 'redCards', 'penalties']);
    morceaux.push(`arbitre ${texte(r.name)}${qui ? ` (${qui})` : ''}${chiffres.length ? ` : ${chiffres.join(', ')}` : ''}${autres ? ` ; ${autres}` : ''}`);
  } else if (!estVide(r)) {
    morceaux.push(`arbitre ${texte(r)}`);
  }
  const autres = reste(mi, ['round', 'stadium', 'city', 'capacity', 'surface', 'weather', 'temperature', 'windSpeed', 'precipitation', 'referee']);
  if (autres) morceaux.push(`autres : ${autres}`);
  return morceaux.join(' · ');
}

function blocCompositions(lineups, { home, away }) {
  if (!lineups) return ['## lineups — compositions : aucune connue (ni publiée par FotMob, ni dernière composition alignée)'];
  const source =
    lineups.source === 'FotMob'
      ? `source FotMob : la composition de CE match, relue ${texte(lineups.minutesBeforeKickoff)} min avant le coup d'envoi`
      : lineups.source === 'magasin'
        ? 'source magasin : FotMob n’a encore rien publié, c’est la DERNIÈRE composition alignée par chaque équipe (onze probable, pas celui de ce match)'
        : `source ${texte(lineups.source)}`;
  const lignes = [`## lineups — compositions, ${source}`, ...blocEquipe(lineups.home, home, lineups), ...blocEquipe(lineups.away, away, lineups)];
  const cadre = cadreDuMatch(lineups.matchInfo);
  if (cadre) lignes.push(`Cadre du match (lineups.matchInfo) : ${cadre}`);
  const autres = reste(lineups, ['source', 'fotmobMatchId', 'fetchedAt', 'minutesBeforeKickoff', 'home', 'away', 'matchInfo']);
  if (autres) lignes.push(`Compositions, autres : ${autres}`);
  return lignes;
}

// ---------------------------------------------------- actualités, note, sources
const LIBELLE_ABSENCE = { blessure: 'blessure', suspension: 'suspension' };

/** Les actualités d'équipe que la composition ne dit pas déjà : changement d'entraîneur, absents qu'elle n'a pas. */
function blocActualites(teamNews, lineups, { home, away }) {
  if (!teamNews) return [];
  const lignes = [];
  for (const [cote, nom] of [['home', home], ['away', away]]) {
    const n = teamNews[cote];
    if (!n) continue;
    const dejaDansLaCompo = new Set((lineups?.[cote]?.unavailable ?? []).map((a) => cleNom(a.name)));
    const absences = (n.longTermAbsences ?? []).filter((a) => !dejaDansLaCompo.has(cleNom(a.name)));
    const morceaux = [];
    if (absences.length) morceaux.push(`blessés et suspendus : ${absences.map((a) => `${uneLigne(a.name)} (${LIBELLE_ABSENCE[a.type] ?? texte(a.type)}${retour(a.expectedReturn)})`).join(' · ')}`);
    else if ((n.longTermAbsences ?? []).length) morceaux.push('blessés et suspendus : ceux des absents de la composition');
    const c = n.coachChange;
    if (c) morceaux.push(avecReste(`changement d'entraîneur : ${texte(c.previousCoach)} → ${texte(c.currentCoach)} (dernier match connu avec l'ancien : ${texte(c.since)})`, c, ['previousCoach', 'currentCoach', 'since']));
    const autres = reste(n, ['teamName', 'longTermAbsences', 'coachChange']);
    if (autres) morceaux.push(`autres : ${autres}`);
    if (morceaux.length) lignes.push(`${nom} : ${morceaux.join(' ; ')}`);
  }
  const autres = reste(teamNews, ['home', 'away']);
  if (autres) lignes.push(`autres : ${autres}`);
  return lignes.length ? ["## teamNews — actualités d'équipe (FotMob)", ...lignes] : [];
}

const SOURCES_SECONDAIRES = [
  ['homeFlashscoreStats', 'FlashScore'],
  ['awayFlashscoreStats', 'FlashScore'],
  ['homeHistoricalStats', 'historique football-data.co.uk, moyennes'],
  ['awayHistoricalStats', 'historique football-data.co.uk, moyennes'],
  ['homeHistoricalForm', 'historique football-data.co.uk, forme'],
  ['awayHistoricalForm', 'historique football-data.co.uk, forme'],
  ['homeTeamProfile', 'profil web'],
  ['awayTeamProfile', 'profil web']
];

/** Les clés de contexte que la fiche range elle-même ; toute autre passe en « Autres données ». */
const CLES_CONTEXTE = ['standings', 'homeStats', 'awayStats', 'homeForm', 'awayForm', 'teamNews', 'userNote', 'lineups', ...SOURCES_SECONDAIRES.map(([cle]) => cle)];

// --------------------------------------------------------------- l'expérience
const NIVEAUX = ['faible', 'moyenne', 'forte'];

/** Repère d'un match des leçons : a, b, … z, aa, ab… */
function lettre(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(97 + ((n - 1) % 26)) + s;
  return s;
}

function blocExperience(experience) {
  if (!Array.isArray(experience) || !experience.length) return [];
  // Les matchs d'où viennent les leçons, écrits une fois chacun en légende ([a], [b]…).
  const matchs = [];
  for (const t of experience) {
    for (const l of t.recentLessons ?? []) {
      const m = texte(l.match);
      if (!matchs.includes(m)) matchs.push(m);
    }
  }
  const lignes = ['## experience — ton bilan par type de marché et tes dernières leçons'];
  if (matchs.length) lignes.push(`Matchs des leçons : ${matchs.map((m, i) => `[${lettre(i)}] ${m}`).join(' · ')}`);
  for (const t of experience) {
    const rang = (niveau) => (NIVEAUX.includes(niveau) ? NIVEAUX.indexOf(niveau) : NIVEAUX.length);
    const conf = Object.entries(t.byConfidence ?? {})
      .sort(([a], [b]) => rang(a) - rang(b))
      .map(([niveau, c]) => avecReste(`${niveau} ${texte(c?.right)}/${texte(c?.verdicts)}`, c, ['right', 'verdicts']));
    const autres = reste(t, ['marketType', 'label', 'matches', 'engineRight', 'aiVerdicts', 'aiRight', 'byConfidence', 'recentLessons']);
    lignes.push(
      `${texte(t.label ?? t.marketType)} : moteur ${texte(t.engineRight)}/${texte(t.matches)} · tes avis ${texte(t.aiRight)}/${texte(t.aiVerdicts)}${conf.length ? ` (${conf.join(' · ')})` : ''}${autres ? ` · autres : ${autres}` : ''}`
    );
    for (const l of t.recentLessons ?? []) {
      const repere = `[${lettre(matchs.indexOf(texte(l.match)))}]`;
      lignes.push(avecReste(`- ${repere} ${texte(l.pick)} · ${texte(l.outcome)} · ${texte(l.aiVerdict)} : ${uneLigne(l.lesson)}`, l, ['match', 'pick', 'outcome', 'aiVerdict', 'lesson']));
    }
  }
  return lignes;
}

// -------------------------------------------------------------- les fiches
const MOMENTS = { avance: "d'avance (la veille ou quelques heures avant)", 'coup-d-envoi': "au coup d'envoi (composition du jour)" };

/**
 * La fiche compacte d'AVANT-MATCH : tout ce qui change d'un match à l'autre.
 * `marches` : les pronostics commentés (marchesPourIA), dans l'ordre que
 * l'IA doit suivre ; `lineups` : la composition telle que la décrit
 * lineupContext.js (ou telle que compositionPourIA la réduisait : même forme).
 * `retires` (étape 21) : les types de marché que son carnet a retirés de la
 * liste ([{ type, label }]) — UNE ligne sous le tableau ; aucun : la fiche
 * d'avant, à l'octet.
 */
export function ficheAvantMatch({ home, away, league = null, commenceTime = null, timing = null, engineSummary, marches = null, context = {}, lineups = null, experience = [], retires = [] }) {
  const equipes = { home, away };
  const ctx = context ?? {};
  const compo = lineups ?? ctx.lineups ?? null;
  const lignes = [
    `# ${home} – ${away}`,
    `Compétition : ${texte(league ?? 'inconnue')} · coup d'envoi : ${texte(commenceTime ?? 'inconnu')} · analyse : ${MOMENTS[timing] ?? texte(timing ?? 'inconnue')} · domicile : ${home} · extérieur : ${away}`,
    '',
    '## Moteur',
    ...blocMoteur(engineSummary, equipes),
    '',
    ...tableauDesMarches(marches ?? marchesPourIA(engineSummary?.marketPredictions)),
    ...ligneDesRetires(retires),
    '',
    ...blocClassement(ctx.standings, equipes),
    '',
    '## homeForm / awayForm — forme, FotMob (magasin), du plus récent au plus ancien',
    ligneForme(ctx.homeForm, home),
    ligneForme(ctx.awayForm, away),
    '',
    '## homeStats / awayStats — moyennes par match, FotMob (magasin) ; case = produit / concédé',
    `équipe | période | matchs | résultats | buts | ${COLONNES_MOYENNES.map(([, nom]) => nom).join(' | ')}`,
    ...lignesMoyennes(ctx.homeStats, home, 'home'),
    ...lignesMoyennes(ctx.awayStats, away, 'away'),
    '',
    ...blocCompositions(compo, equipes)
  ];
  const actualites = blocActualites(ctx.teamNews, compo, equipes);
  if (actualites.length) lignes.push('', ...actualites);
  if (ctx.userNote) {
    lignes.push('', avecReste(`## userNote — note de Pierre, écrite le ${texte(ctx.userNote.updatedAt)} : ${uneLigne(ctx.userNote.text)}`, ctx.userNote, ['text', 'updatedAt']));
  }
  const secondaires = SOURCES_SECONDAIRES.filter(([cle]) => ctx[cle]).map(([cle, nom]) => `${cle.startsWith('home') ? home : away} — ${nom} (${cle}) : ${enLigne(ctx[cle])}`);
  if (secondaires.length) lignes.push('', '## sources secondaires (équipe inconnue du magasin)', ...secondaires);
  const autres = Object.entries(ctx).filter(([cle, v]) => !CLES_CONTEXTE.includes(cle) && !estVide(v));
  if (autres.length) lignes.push('', '## autres données', ...autres.map(([cle, v]) => `${cle} : ${enLigne(v)}`));
  const exp = blocExperience(experience);
  if (exp.length) lignes.push('', ...exp);
  return lignes.join('\n');
}

const NOMS_STATS_MATCH = [
  ['expected_goals', 'xG'],
  ['Total Shots', 'tirs'],
  ['Shots on Goal', 'tirs cadrés'],
  ['big_chances', 'grosses occasions'],
  ['Ball Possession', 'possession'],
  ['Corner Kicks', 'corners'],
  ['Yellow Cards', 'jaunes'],
  ['Red Cards', 'rouges']
];

/**
 * Les statistiques du match dont un 0 des DEUX côtés veut dire « non relevé »
 * (FotMob publie des cases jamais remplies : le règlement le sait déjà pour
 * les corners et les tirs, cf. statsPourReglement). Les rouges et les grosses
 * occasions en sont exclus : un 0 / 0 y est un vrai zéro.
 */
const ZERO_PARTOUT_NON_RELEVE = new Set(['expected_goals', 'Total Shots', 'Shots on Goal', 'Ball Possession', 'Corner Kicks', 'Yellow Cards']);
const nombreDeStat = (v) => {
  const n = Number(String(v ?? '').replace('%', '').replace(',', '.'));
  return String(v ?? '').trim() === '' || !Number.isFinite(n) ? null : n;
};

/**
 * Les faits du match AVEC le déroulé (étape 43, cf. derouleDuMatch.js) : la
 * ligne de score, le déroulé en 10 à 20 lignes courtes, le récapitulatif des
 * cartons, les extraits du texte minute par minute quand il existe, puis les
 * statistiques — sans ce que le déroulé dit mieux (cartons) ni les zéros des
 * deux côtés (non relevés, dits comme tels).
 */
function blocFaitsAvecDeroule(faits, { home, away }) {
  const d = faits.deroule;
  const sh = faits.stats?.home ?? {};
  const sa = faits.stats?.away ?? {};
  const lignes = ['## matchStats — faits du match, FotMob (magasin)', ...lignesDuDeroule(d, { home, away })];
  const moments = Array.isArray(faits.commentaire) ? faits.commentaire : [];
  if (moments.length) {
    lignes.push(
      'Texte minute par minute de FotMob, extraits (VAR, penalties, blessures, occasions) :',
      ...moments.map((m) => `${texte(m.minute)}${m.plus ? `+${m.plus}` : ''}' ${uneLigne(m.texte)}`)
    );
  }
  const cles = [...new Set([...NOMS_STATS_MATCH.map(([c]) => c).filter((c) => c in sh || c in sa), ...Object.keys(sh), ...Object.keys(sa)])];
  const nomStat = (c) => NOMS_STATS_MATCH.find(([k]) => k === c)?.[1] ?? c;
  const nonReleves = [];
  const gardees = cles.filter((c) => {
    if (d.disponible && !d.partiel && (c === 'Yellow Cards' || c === 'Red Cards')) return false; // dits par le déroulé (s'il en publie)
    if (ZERO_PARTOUT_NON_RELEVE.has(c) && nombreDeStat(sh[c]) === 0 && nombreDeStat(sa[c]) === 0) {
      nonReleves.push(nomStat(c));
      return false;
    }
    return true;
  });
  lignes.push(
    `Statistiques (${home} / ${away}) : ${gardees.length ? gardees.map((c) => `${nomStat(c)} ${texte(sh[c])} / ${texte(sa[c])}`).join(' · ') : 'aucune relevée'}${nonReleves.length ? ` · non relevé (0 des deux côtés) : ${nonReleves.join(', ')}` : ''}`
  );
  const autres = reste(faits, ['score', 'goals', 'redCards', 'stats', 'deroule', 'commentaire', 'pageFotMob']);
  if (autres) lignes.push(`Autres : ${autres}`);
  return lignes;
}

function blocFaits(faits, equipes) {
  const { home, away } = equipes;
  if (!faits) return ['## matchStats — faits du match : indisponibles dans le magasin'];
  // Étape 43 : avec le déroulé lu par derouleDuMatch.js, le bloc neuf ; sans (anciens appelants, essais), celui d'avant.
  if (faits.deroule) return blocFaitsAvecDeroule(faits, equipes);
  const cote = (s) => (s === 'home' ? home : s === 'away' ? away : texte(s));
  const buts = (faits.goals ?? []).map((g) =>
    avecReste(`${texte(g.minute)}' ${cote(g.side)} (${texte(g.player)})${g.ownGoal ? ', contre son camp' : ''}${g.penalty ? ', penalty' : ''}`, g, ['minute', 'side', 'player', 'ownGoal', 'penalty'])
  );
  const rouges = (faits.redCards ?? []).map((r) => avecReste(`${texte(r.minute)}' ${cote(r.side)} (${texte(r.player)})`, r, ['minute', 'side', 'player']));
  const sh = faits.stats?.home ?? {};
  const sa = faits.stats?.away ?? {};
  const cles = [...new Set([...NOMS_STATS_MATCH.map(([c]) => c).filter((c) => c in sh || c in sa), ...Object.keys(sh), ...Object.keys(sa)])];
  const nomStat = (c) => NOMS_STATS_MATCH.find(([k]) => k === c)?.[1] ?? c;
  const score = faits.score && typeof faits.score === 'object' ? `${texte(faits.score.home)}-${texte(faits.score.away)}` : texte(faits.score);
  const lignes = [
    '## matchStats — faits du match, FotMob (magasin)',
    `Score ${score} · buts : ${buts.length ? buts.join(' · ') : 'aucun'} · cartons rouges : ${rouges.length ? rouges.join(' · ') : 'aucun'}`,
    `Statistiques (${home} / ${away}) : ${cles.length ? cles.map((c) => `${nomStat(c)} ${texte(sh[c])} / ${texte(sa[c])}`).join(' · ') : 'aucune relevée'}`
  ];
  const autres = reste(faits, ['score', 'goals', 'redCards', 'stats']);
  if (autres) lignes.push(`Autres : ${autres}`);
  return lignes;
}

const OUI_NON = (v) => (v === true ? 'oui' : v === false ? 'non' : '–');

/**
 * La fiche compacte de la REVUE d'après-match : la lecture d'avant-match,
 * le moteur à ce moment-là, chaque marché avec son issue et l'avis que l'IA
 * en avait donné (pourcentage, explication, raisonnement), les faits du match.
 * `marketOutcomes` : issuesDesMarches (matchAiAnalysisService.js), dans
 * l'ordre que l'IA doit suivre.
 */
export function ficheApresMatch({ home, away, league = null, commenceTime = null, timing = null, analysedAt = null, priorAnalysis, engineSummary, result, marketOutcomes = [], matchStats = null }) {
  const equipes = { home, away };
  const p = priorAnalysis ?? {};
  const score = result ? `${texte(result.homeGoals)}-${texte(result.awayGoals)}` : 'inconnu';
  const lignes = [
    `# Revue d'après-match : ${home} – ${away}`,
    `Compétition : ${texte(league ?? 'inconnue')} · coup d'envoi : ${texte(commenceTime ?? 'inconnu')} · score final (${home} – ${away}) : ${score}`,
    `Ton analyse d'avant-match : ${MOMENTS[timing] ?? texte(timing ?? 'moment inconnu')}${analysedAt ? `, faite le ${analysedAt}` : ''}`,
    '',
    "## priorAnalysis — ton analyse d'avant-match",
    `Synthèse (summary) : ${texte(uneLigne(p.summary) || null)}`,
    `Facteurs clés (keyFactors) : ${
      (p.keyFactors ?? []).map((k) => avecReste(`${texte(k.factor)} — ${uneLigne(k.observation)} (preuve : ${uneLigne(k.evidence)})`, k, ['factor', 'observation', 'evidence'])).join(' · ') || 'aucun'
    }`,
    `Face au moteur (alignmentWithModel) : ${texte(uneLigne(p.alignmentWithModel) || null)}`,
    `Compositions (lineupImpact) : ${texte(uneLigne(p.lineupImpact) || null)}`,
    `Limites (caveats) : ${texte(uneLigne(p.caveats) || null)}`
  ];
  const autresAvant = reste(p, ['summary', 'keyFactors', 'alignmentWithModel', 'lineupImpact', 'caveats', 'marketViews']);
  if (autresAvant) lignes.push(`Autres : ${autresAvant}`);

  lignes.push('', '## Moteur, au moment de ton analyse', ...blocMoteur(engineSummary, equipes));

  // Chaque bilan à faire, avec l'avis d'avant-match sur CE marché (rattaché
  // par libellé, puis position, comme à l'enregistrement).
  const avis = Array.isArray(p.marketViews) ? p.marketViews : [];
  const rattaches = rattacherAuxMarches(avis, marketOutcomes);
  const pris = new Set(rattaches.filter(Boolean));
  const parLibelle = new Map((engineSummary?.marketPredictions ?? []).map((m) => [String(m.market ?? ''), m]));
  lignes.push(
    '',
    `## marketOutcomes — ${marketOutcomes.length} marché(s) joué(s) et leur issue : un bilan par ligne, dans cet ordre`,
    'market | pick | probability | cote juste | outcome | aiVerdict, aiConfidence | aiWasRight'
  );
  marketOutcomes.forEach((o, i) => {
    const v = rattaches[i];
    const m = parLibelle.get(String(o.market ?? ''));
    const pc = v?.probability ?? pourcentage(m);
    const cote = m?.predictedOdds;
    const avisTexte = o.aiVerdict ? `${o.aiVerdict}${o.aiConfidence ? `, ${o.aiConfidence}` : ''}` : 'aucun';
    const autres = reste(o, ['market', 'marketId', 'pick', 'minOdds', 'outcome', 'aiVerdict', 'aiConfidence', 'aiWasRight']);
    lignes.push(`${uneLigne(o.market)} | ${uneLigne(o.pick)} | ${pc === null || pc === undefined ? '–' : `${texte(pc)} %`} | ${texte(cote)} | ${texte(o.outcome)} | ${avisTexte} | ${OUI_NON(o.aiWasRight)}${autres ? ` | ${autres}` : ''}`);
    if (v) {
      if (!estVide(v.explanation)) lignes.push(`  explication : ${uneLigne(v.explanation)}`);
      if (!estVide(v.reasoning)) lignes.push(`  raisonnement : ${uneLigne(v.reasoning)}`);
      const autresAvis = reste(v, ['market', 'pick', 'verdict', 'confidence', 'explanation', 'reasoning', 'probability']);
      if (autresAvis) lignes.push(`  autres : ${autresAvis}`);
    }
  });
  if (!marketOutcomes.length) lignes.push('(aucun marché à juger)');
  const orphelins = avis.filter((v) => !pris.has(v));
  if (orphelins.length) {
    lignes.push(
      '',
      "Autres avis d'avant-match (sur un marché qui n'est plus dans la liste) :",
      ...orphelins.map((v) => `- ${texte(v.market)} | ${texte(v.pick)} | ${texte(v.verdict)}, ${texte(v.confidence)}${estVide(v.explanation) ? '' : ` | explication : ${uneLigne(v.explanation)}`}${estVide(v.reasoning) ? '' : ` | raisonnement : ${uneLigne(v.reasoning)}`}`)
    );
  }
  lignes.push('', ...blocFaits(matchStats, equipes));
  return lignes.join('\n');
}
