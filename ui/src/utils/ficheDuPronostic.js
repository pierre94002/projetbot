/**
 * ficheDuPronostic.js — « Pourquoi ce pourcentage ? » (étape 40 du plan, lot 1, 10/11/2026).
 * -----------------------------------------------------------------------
 * D'où vient chaque pourcentage du verdict d'un match à venir, dit avec SEULEMENT ce que l'analyse du moteur porte déjà
 * (GET /api/analysis/match/:id, lue par la page) : aucune requête, aucun chiffre calculé (ceux de la réponse sont mis en
 * forme), rien dans les chiffres ni dans ce que lit l'IA. Les poids du moteur valent 1 / 0 / 0 (marché seul) : le 1 / N / 2
 * vient des cotes, les buts et les statistiques de leurs propres modèles (gardé par ficheDuPronosticFrontiere, T-G4).
 * Et le rattachement d'un avis de l'IA au pronostic figé qu'il explique : le même marché ET le même choix (constat 8 de la
 * critique : 4 avis sur 21 851 portaient sur un autre choix que le pronostic de leur marché).
 *
 * Règle PURE : ni Vue, ni service, ni horloge (l'instant est reçu) ; ni code Unicode échappé (les classes de caractères
 * se construisent par String.fromCharCode), nombres à la virgule (toLocaleString fr-FR). Rejouée par
 * server/test/ficheDuPronosticEcran.test.mjs sur les vraies réponses du serveur.
 * -----------------------------------------------------------------------
 */
import { etatFraicheur, reglageFraicheur, dureeDite } from './langageParis.js';
import { heureDite } from './avantDeParier.js';

const car = (n) => String.fromCharCode(n);
const ACCENTS = new RegExp(`[${car(0x300)}-${car(0x36f)}]`, 'g');
const TIRETS = new RegExp(`[${car(0x2010)}-${car(0x2015)}-]+`, 'g');
// Le choix d'un libellé est ce qui suit le dernier tiret entouré d'espaces (« Palermo — Plus de 9.5 tirs »).
const COUPURE = new RegExp(`\\s[${car(0x2010)}-${car(0x2015)}-]\\s`, 'g');
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const enFr = (x, n) => x.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n });
const listeFr = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l.at(-1)}` : (l[0] ?? ''));

export const MOTS_DE_LA_FICHE = Object.freeze({
  titre: 'Pourquoi ce pourcentage ?',
  eyebrow: 'Explication',
  sousTitre: 'D’où vient chaque pourcentage du verdict — seulement ce que l’analyse porte vraiment.',
  chargement: 'Le pourquoi arrive avec l’analyse du moteur…',
  erreur: (m) => `L’analyse du moteur n’a pas pu être lue (${String(m ?? 'erreur inconnue').replace(/[.\s]+$/, '')}) : rien n’est expliqué à la place.`,
  sansAnalyse: 'Pas d’analyse du moteur pour ce match : aucun pourcentage à expliquer.',
  serveurAncien: 'L’analyse ne dit pas d’où vient ce pourcentage.',
  familleResultat: 'Résultat (1 / N / 2)',
  familleButs: 'Buts (total, les deux équipes marquent, buts d’une équipe, résultat + total)',
  familleStats: 'Corners, tirs et tirs cadrés',
  libelles: Object.freeze({ origine: 'D’où il vient', releve: 'Cotes de référence relevées', releveMoyenne: 'Cotes relevées', compos: 'Compositions', attendus: 'Buts attendus', modele: 'Modèle de buts', origines: 'D’où ils viennent' }),
  origineReference: (livres) => `Des cotes de ${listeFr(livres)}, ${livres.length > 1 ? 'les bookmakers' : 'le bookmaker'} de référence de ce match, sans ${livres.length > 1 ? 'leur' : 'sa'} marge.`,
  origineMoyenne: 'De la moyenne des cotes relevées pour ce match, chacune sans la marge du bookmaker : aucun bookmaker de référence ne le cote.',
  origineStatistiques: (source) => `Du modèle de buts, ${source}, faute de cote pour ce match ; ramené vers les fréquences habituelles du 1, du nul et du 2, parce que, seul, il exagère les écarts entre les équipes.`,
  titreReleve: 'L’heure la plus ancienne des cotes qui font ce pourcentage. Vos bookmakers ont leur propre heure, dans le verdict.',
  titreReleveMoyenne: 'L’heure la plus ancienne des cotes relevées pour ce match. Vos bookmakers ont leur propre heure, dans le verdict.',
  releveTropVieux: (age, limite) => `Relevé il y a ${age}, au-delà du délai de ${limite} : le marché a pu bouger depuis, et ce pourcentage avec lui.`,
  releveHeureInconnue: 'L’heure du relevé d’au moins un de ces bookmakers est inconnue : impossible de dire si ce pourcentage est encore à jour.',
  releveMatchCommence: 'Le match a commencé : ce pourcentage est celui des cotes d’avant-match.',
  composNeLitPas: 'Le moteur ne lit pas les compositions : elles ne comptent dans ce pourcentage qu’à travers les cotes.',
  composAvantAnnonce: (h) => `Cotes de référence relevées avant l’annonce des compositions, attendue vers ${h} : elles n’en tiennent pas compte.`,
  composApresAnnonce: 'Cotes de référence relevées après l’heure habituelle de l’annonce des compositions : elles peuvent en tenir compte.',
  composStatistiques: 'Le modèle de buts ne lit pas les compositions : ce pourcentage n’en tient pas compte.',
  butsAttendus: (source) => `buts attendus par le modèle, ${source}.`,
  butsSansAttendus: 'Les buts attendus ne figurent pas dans l’analyse : ces pourcentages ne peuvent pas être expliqués ici.',
  butsSansCote: 'Les pourcentages du total de buts, de « les deux équipes marquent » et des buts d’une équipe sortent des buts attendus ci-dessus (chaque score possible y reçoit sa probabilité) : aucune cote n’y entre.',
  butsCombine: 'Pour « Résultat + total buts », la part du résultat vient du 1 / N / 2 ci-dessus ; le partage des buts vient du modèle.',
  statsOrigine: 'La moyenne de ce que chaque équipe obtient sur ses 10 derniers matchs relevés au magasin FotMob et de ce que l’adversaire concède sur les siens (toutes compétitions, 6 matchs au moins), corrigée de l’avantage du terrain.',
  statsLoi: 'Le pourcentage de chaque ligne (plus ou moins de…) en sort par une loi de comptage réglée une seule fois, pour tous les championnats, sur la saison 2024-25.',
  statsAbsentes: 'Aucun pronostic de corners ni de tirs pour ce match : l’une des deux équipes n’a pas 6 matchs relevés au magasin FotMob, ou le magasin ne la connaît pas.',
  statAbsente: (nom) => `${nom} : pas assez de matchs relevés (6 au moins) pour l’une des deux équipes.`,
  cotesHors1N2: 'Hors du 1 / N / 2, aucune cote de vos bookmakers n’est relevée automatiquement : la cote montrée est la cote juste du moteur (1 divisée par sa probabilité). Une cote vue chez votre bookmaker se saisit à la main dans l’onglet Marchés : elle sert au verdict, sans changer ce pourcentage.',
  // Les cartes de l'IA (AiMarketCard).
  coteJuste: (x) => `cote juste ${x}`,
  sansLivre: 'aucune cote de bookmaker relevée automatiquement',
  titreCoteJuste: 'Cote juste du moteur : 1 divisée par sa probabilité, sans marge de bookmaker.',
  titreSansLivre: 'Aucune cote de bookmaker n’est relevée automatiquement pour ce marché : la cote montrée est la cote juste du moteur. Une cote vue chez votre bookmaker se saisit à la main dans l’onglet Marchés.',
  autreChoix: (avis, moteur) => `Cet avis porte sur un autre choix (« ${avis} ») que le pronostic du moteur sur ce marché (« ${moteur} ») : aucun pourcentage du moteur ne lui correspond.`
});
const MOTS = MOTS_DE_LA_FICHE;

/** Les identifiants FotMob des deux clubs : la compo de la page d'abord (c'est ce match), sinon `combinaison.clubs` ; jamais un nom ni « fotmob-0 ». */
export function clubsDuMatch({ compo = null, combinaison = null } = {}) {
  const out = { home: null, away: null, sources: { home: null, away: null }, ecart: false };
  for (const cote of ['home', 'away']) {
    const a = /^fotmob-([1-9]\d*)$/.exec(String(compo?.[cote]?.teamId ?? ''));
    const b = /^(?:fotmob-)?([1-9]\d*)$/.exec(String(combinaison?.clubs?.[cote] ?? ''));
    if (a && b && a[1] !== b[1]) out.ecart = true;
    const id = a ?? b;
    if (id) [out[cote], out.sources[cote]] = [`fotmob-${id[1]}`, a ? 'compo' : 'combinaison'];
  }
  return out;
}

const souple = (t) => String(t ?? '').normalize('NFD').replace(ACCENTS, '').replace(TIRETS, '-').replace(/\s+/g, ' ').trim().toLowerCase();
/** Le choix d'un libellé, tel qu'écrit : après le dernier tiret entouré d'espaces, sinon le libellé entier. */
function choixDit(t) {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  let fin = -1;
  for (const m of s.matchAll(COUPURE)) fin = m.index + m[0].length;
  return fin >= 0 ? s.slice(fin).trim() : s;
}

/**
 * Le pronostic figé qu'un avis de l'IA explique : le libellé exact du marché (départagé par le pick s'il y en a deux),
 * sinon le libellé souple s'il est unique — jamais « le premier trouvé » ; puis le CHOIX, comparé sans accents ni casse :
 * différent → `autre-choix`, sans pronostic (aucun pourcentage du moteur ne lui correspond). Sans pick, rien à comparer.
 * Rend { fige, rattachement, raison, candidat, choix } ; `candidat` : le figé du même marché, même sur un autre choix.
 */
export function figeDeLAvis(vue, figes) {
  const liste = (Array.isArray(figes) ? figes : []).filter((f) => f && typeof f === 'object');
  const rien = (raison) => ({ fige: null, rattachement: null, raison, candidat: null, choix: null });
  let fige = null;
  let rattachement = 'libelle-exact';
  const exacts = liste.filter((f) => f.market === vue?.market);
  if (exacts.length === 1) fige = exacts[0];
  else if (exacts.length > 1) {
    const parPick = exacts.filter((f) => f.predictedLabel === vue?.pick);
    if (parPick.length !== 1) return rien('ambigu');
    [fige, rattachement] = [parPick[0], 'libelle-exact+pick'];
  } else {
    const souples = liste.filter((f) => souple(f.market) === souple(vue?.market));
    if (souples.length !== 1) return rien(souples.length ? 'ambigu' : 'sans-pronostic');
    [fige, rattachement] = [souples[0], 'libelle-souple'];
  }
  if (String(vue?.pick ?? '').trim() && souple(choixDit(vue.pick)) !== souple(choixDit(fige.predictedLabel))) {
    return { fige: null, rattachement, raison: 'autre-choix', candidat: fige, choix: { avis: choixDit(vue.pick), moteur: choixDit(fige.predictedLabel) } };
  }
  return { fige, rattachement, raison: null, candidat: fige, choix: null };
}

/** D'où vient le 1 / N / 2 : { cle: 'reference' | 'moyenne' | 'statistiques' | 'inconnue', livres }. */
export function origineDuResultat(result) {
  const source = result?.prediction?.source;
  if (source === 'statistiques') return { cle: 'statistiques', livres: [] };
  if (source !== 'cotes') return { cle: 'inconnue', livres: [] };
  const juges = result?.verdicts?.home?.juges?.livres;
  const livres = (Array.isArray(juges) && juges.length ? juges : Array.isArray(result?.prediction?.referenceBooks) ? result.prediction.referenceBooks : []).filter(Boolean);
  return livres.length ? { cle: 'reference', livres } : { cle: 'moyenne', livres: [] };
}

// Le bookmaker d'une ligne, et où elle a été lue : une ligne gratuite s'appelle « Pinnacle · ESPN » (freeMarketOdds.js).
const sansLaSource = (t) => (String(t).includes(' · ') ? String(t).slice(0, String(t).lastIndexOf(' · ')) : String(t));
const nomDuLivre = (l) => (l.referenceOnly ? sansLaSource(l.title ?? l.key ?? '') : String(l.title ?? l.key ?? ''));
const fournisseurDe = (l) => (!l.referenceOnly ? 'The Odds API' : String(l.title ?? '').includes(' · ') ? String(l.title).slice(String(l.title).lastIndexOf(' · ') + 3) : (l.source ?? null));

/**
 * Le relevé des cotes qui font le 1 / N / 2 (null sans cote, ou origine inconnue) : les bookmakers de référence (ou toutes
 * les lignes complètes pour la moyenne), où ils ont été lus, l'heure la PLUS ANCIENNE (elle borne l'âge du pourcentage ; une
 * heure manquante la rend inconnue), l'ambre au-delà du délai réglé, et la phrase d'alerte.
 */
export function releveDuResultat(result, match = null, maintenant = Date.now()) {
  const origine = origineDuResultat(result);
  if (origine.cle !== 'reference' && origine.cle !== 'moyenne') return null;
  const toutes = (Array.isArray(result?.market?.byBookmaker) ? result.market.byBookmaker : []).filter((l) => l && typeof l === 'object');
  const cles = result?.verdicts?.home?.juges?.cles;
  // Les juges dans leur ordre (celui de l'origine) ; sans leurs clés, les lignes dont le titre est un livre de référence.
  const lignes =
    origine.cle === 'reference'
      ? Array.isArray(cles) && cles.length
        ? cles.map((c) => toutes.find((l) => l.key === c)).filter(Boolean)
        : toutes.filter((l) => origine.livres.includes(String(l.title ?? l.key ?? '')))
      : toutes.filter((l) => [l.odds1, l.oddsDraw, l.odds2].every((x) => Number(x) > 1));
  const fc = result?.fraicheurCotes ?? null;
  const heures = lignes.map((l) => (l.referenceOnly ? l.releveAt : fc?.parBookmaker?.[l.key]?.releveAt) ?? null);
  const instants = heures.map((h) => Date.parse(String(h ?? '')));
  const retenue = lignes.length && instants.every(Number.isFinite) ? new Date(Math.min(...instants)).toISOString() : null;
  const noms = [...new Set(lignes.map(nomDuLivre).filter(Boolean))];
  const fournisseurs = [...new Set(lignes.map(fournisseurDe).filter(Boolean))].sort((a, b) => (b === 'The Odds API') - (a === 'The Odds API'));
  const montres = noms.length > 3 ? [...noms.slice(0, 3), `${noms.length - 3} autre${noms.length > 4 ? 's' : ''}`] : noms;
  const fraicheur = etatFraicheur({ releveAt: retenue, maintenant, coupDEnvoi: fc?.coupDEnvoi ?? match?.commenceTime ?? null, heureSure: fc ? fc.heureSure !== false : false, reglage: fc?.reglage ?? null });
  const phrases = {
    'trop-vieille': () => MOTS.releveTropVieux(dureeDite(fraicheur.ageMinutes), dureeDite(fraicheur.limiteMinutes)),
    'heure-inconnue': () => MOTS.releveHeureInconnue,
    'match-commence': () => MOTS.releveMatchCommence
  };
  const moyenne = origine.cle === 'moyenne';
  return {
    libelle: moyenne ? MOTS.libelles.releveMoyenne : MOTS.libelles.releve,
    source: noms.length ? `${listeFr(montres)} (${fournisseurs.length ? listeFr(fournisseurs) : 'source non indiquée'})` : null,
    retenue,
    quand: heureDite(retenue),
    payant: lignes.some((l) => !l.referenceOnly),
    vieuxApresHeures: reglageFraicheur(fc?.reglage).maxAgeMinutes / 60,
    detail: `${moyenne ? MOTS.titreReleveMoyenne : MOTS.titreReleve} ${lignes.map((l, i) => `${nomDuLivre(l)} : ${heureDite(heures[i]) ?? 'heure inconnue'}`).join(' · ')}.`,
    fraicheur,
    code: fraicheur.code,
    phrase: phrases[fraicheur.code]?.() ?? null
  };
}

const SOURCES_DES_BUTS = Object.freeze({
  fotmob: 'à partir des moyennes de buts des deux équipes au magasin FotMob',
  'api-football': 'à partir des moyennes de buts des deux équipes chez API-Football',
  'league-baseline': 'à partir des valeurs de base du championnat, faute de moyennes des deux équipes'
});
const sourceDesButs = (s) => (s === null || s === undefined || s === '' ? 'source des buts attendus non dite par l’analyse' : (SOURCES_DES_BUTS[s] ?? `à partir de « ${s} »`));

/** Les buts : les attendus de la réponse (deux décimales) et d'où viennent ces pourcentages ; candidate de la 27 adoptée : sa provenance. */
export function butsDuMatch(result, provenanceButs = null) {
  const eg = result?.expectedGoals ?? null;
  const attendus = !provenanceButs && fini(eg?.home) && fini(eg?.away) ? { home: enFr(eg.home, 2), away: enFr(eg.away, 2) } : null;
  return {
    attendus,
    texte: MOTS.butsAttendus(sourceDesButs(eg?.source)),
    sansAttendus: !provenanceButs && !attendus ? MOTS.butsSansAttendus : null,
    provenance: provenanceButs ?? null,
    phrases: [...(attendus ? [MOTS.butsSansCote] : []), MOTS.butsCombine]
  };
}

const STATS = Object.freeze([
  ['corners', 'Corners attendus', 'Corners'],
  ['shots', 'Tirs attendus', 'Tirs'],
  ['shotsOnTarget', 'Tirs cadrés attendus', 'Tirs cadrés']
]);

/** Corners, tirs et tirs cadrés attendus de la réponse (une décimale), et d'où ils viennent ; ce qui manque est dit. */
export function statsDuMatch(result) {
  const se = result?.statExpectations ?? null;
  const lignes = [];
  const absents = [];
  for (const [cle, nom, court] of STATS) {
    const s = se?.[cle];
    if (fini(s?.home) && fini(s?.away)) lignes.push({ cle, nom, home: enFr(s.home, 1), away: enFr(s.away, 1), total: fini(s.total) ? enFr(s.total, 1) : null });
    else if (se) absents.push(MOTS.statAbsente(court));
  }
  return { lignes, absents: se ? absents : [MOTS.statsAbsentes], phrases: lignes.length ? [MOTS.statsOrigine, MOTS.statsLoi] : [] };
}

/** Les phrases des compositions (O2) : le moteur ne les lit pas ; avant ou après l'heure habituelle de leur annonce. */
function composDuResultat(origine, releve) {
  if (origine.cle === 'statistiques') return [MOTS.composStatistiques];
  const phrases = [MOTS.composNeLitPas];
  const annonce = releve?.fraicheur?.composAnnonceesA ?? null;
  if (origine.cle === 'reference' && releve?.retenue && annonce) {
    phrases.push(Date.parse(releve.retenue) < Date.parse(annonce) ? MOTS.composAvantAnnonce(String(heureDite(annonce)).split(' à ')[1]) : MOTS.composApresAnnonce);
  }
  return phrases;
}

/**
 * La fiche entière : { etat, message, resultat, buts, stats, cotes, clubs }. `etat` : chargement, erreur, sans-analyse,
 * serveur-ancien (l'origine du 1 / N / 2 non dite : les buts et les statistiques restent), pret. Hors `pret`, une famille
 * vide (null) dit l'état ; la ligne des cotes hors du 1 / N / 2 est toujours là.
 */
export function pourquoiDuPourcentage({ analyse = null, match = null, homeId = null, awayId = null, provenanceButs = null, maintenant = Date.now() } = {}) {
  const clubs = { home: { nom: match?.home ?? 'Domicile', id: homeId ?? null }, away: { nom: match?.away ?? 'Extérieur', id: awayId ?? null } };
  const result = analyse?.result ?? null;
  const vide = (etat, message) => ({ etat, message, resultat: null, buts: null, stats: null, cotes: MOTS.cotesHors1N2, clubs });
  if (!analyse || (analyse.loading && !result)) return vide('chargement', MOTS.chargement);
  if (analyse.error && !result) return vide('erreur', MOTS.erreur(analyse.error));
  if (!result) return vide('sans-analyse', MOTS.sansAnalyse);
  const origine = origineDuResultat(result);
  const commun = { buts: butsDuMatch(result, provenanceButs), stats: statsDuMatch(result), cotes: MOTS.cotesHors1N2, clubs };
  if (origine.cle === 'inconnue') return { etat: 'serveur-ancien', message: MOTS.serveurAncien, resultat: null, ...commun };
  const releve = releveDuResultat(result, match, maintenant);
  const texte =
    // Le nom du bookmaker seulement (« Pinnacle », pas « Pinnacle · ESPN ») : où il a été lu, la ligne du relevé le dit.
    origine.cle === 'reference'
      ? MOTS.origineReference([...new Set(origine.livres.map(sansLaSource))])
      : origine.cle === 'moyenne'
        ? MOTS.origineMoyenne
        : MOTS.origineStatistiques(sourceDesButs(result?.expectedGoals?.source));
  return { etat: 'pret', message: null, resultat: { origine: { cle: origine.cle, texte }, releve, compos: composDuResultat(origine, releve) }, ...commun };
}
