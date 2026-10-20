/**
 * carnetIA.js — les règles d'affichage du CARNET DE L'IA (étape 21 du plan, 14/10/2026 ; bloc « Carnet de
 * l'IA » d'Historique moteur, AiScorecardPanel). JavaScript pur, sans Vue ni navigateur : les tests du serveur
 * le rejouent (server/test/aiScorecardEcran.test.mjs) sur les vraies réponses de la route.
 *
 * Rien n'est calculé ici : chaque nuit, le serveur a réglé chaque avis de l'IA au magasin, mesuré sa clôture,
 * et le juge de l'étape 16 a comparé l'IA au moteur seul (GET /api/match-ai/scorecard, src/data/aiScorecard.js).
 * L'écran met en forme, en langage simple, et dit ce qui manque au lieu d'un tiret.
 *
 * Les couleurs : aucun vert (ce n'est pas une value) ; ambre pour « trop peu de matchs » et pour un marché
 * retiré de la liste de l'IA ; rouge pour « moins bien que le moteur seul » ; bleu (information) pour un
 * marché où l'IA fait mieux ; le reste sans ton.
 */

import { nombreDit, pluriel, cloturePourcentDit, jourHeureDit } from './calibration.js';

export { nombreDit, pluriel, jourHeureDit };

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const fr = (x, d = 0) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Les types de marché, toujours tous, dans l'ordre de l'écran (la route les donne ; ceux-ci si elle manque). */
export const TYPES_PAR_DEFAUT = Object.freeze([
  { marketType: 'result', label: 'Résultat', avecCloture: true },
  { marketType: 'totalGoals', label: 'Total buts', avecCloture: true },
  { marketType: 'bothTeamsScore', label: 'Les 2 équipes marquent', avecCloture: true },
  { marketType: 'resultAndTotal', label: 'Résultat + Total buts', avecCloture: false },
  { marketType: 'teamGoals', label: 'Buts d’une équipe', avecCloture: false },
  { marketType: 'totalCorners', label: 'Total corners', avecCloture: false },
  { marketType: 'teamCorners', label: 'Corners d’une équipe', avecCloture: false },
  { marketType: 'totalShots', label: 'Total tirs', avecCloture: false },
  { marketType: 'teamShots', label: 'Tirs d’une équipe', avecCloture: false },
  { marketType: 'totalShotsOnTarget', label: 'Total tirs cadrés', avecCloture: false },
  { marketType: 'teamShotsOnTarget', label: 'Tirs cadrés d’une équipe', avecCloture: false }
]);

/** La phrase du type d'argument, si la route manque. */
export const TYPE_ARGUMENT_PAR_DEFAUT = 'Type d’argument : à ajouter au prompt, décision de Pierre.';

/** « 12 sur 17 (70,6 %) » : des avis tenus sur des avis comptés ; « aucun avis compté » sinon. */
export function tenusDits(tenus, comptes) {
  if (!fini(comptes) || comptes <= 0) return 'aucun avis compté';
  return `${nombreDit(tenus)} sur ${nombreDit(comptes)} (${fr((100 * (tenus ?? 0)) / comptes, 1)} %)`;
}

/** Le pourcentage seul, une décimale ; « — » sans avis compté. */
export const tauxDit = (n, d) => (fini(d) && d > 0 ? `${fr((100 * (n ?? 0)) / d, 1)} %` : '—');

/** Les avis d'une case : « 28 confirme · 30 nuance · 1 contredit ». */
export function avisDits(avis) {
  const a = avis ?? {};
  return `${nombreDit(a.confirme ?? 0)} confirme · ${nombreDit(a.nuance ?? 0)} nuance · ${nombreDit(a.contredit ?? 0)} contredit`;
}

/**
 * Le jugement « face au moteur seul » (le juge de l'étape 16) en mots et en ton : jamais de vert.
 * `juge` : { verdict, matchs, minimum, gain, fourchette, variantes } ou null.
 */
export function faceAuMoteurDit(juge, { minimum = 200 } = {}) {
  if (!juge) return { texte: 'aucun avis compté', ton: '', detail: 'Aucun avis « confirme » ou « contredit » réglé sur ce marché.' };
  const min = juge.minimum ?? minimum;
  const fourchette = Array.isArray(juge.fourchette) ? ` Fourchette [${signe2(juge.fourchette[0])} ; ${signe2(juge.fourchette[1])}] par avis, ${pluriel(juge.variantes ?? 1, 'marché jugé', 'marchés jugés')} ensemble.` : '';
  switch (juge.verdict) {
    case 'retenu':
      return { texte: 'mieux que le moteur seul', ton: 'is-info', detail: `Suivre ses avis fait mieux que le moteur seul, au-delà du hasard, sur ${pluriel(juge.matchs, 'match', 'matchs')}.${fourchette}` };
    case 'moins-bon':
      return { texte: 'moins bien que le moteur seul', ton: 'is-danger', detail: `Suivre ses avis fait moins bien que le moteur seul, au-delà du hasard, sur ${pluriel(juge.matchs, 'match', 'matchs')}.${fourchette}` };
    case 'pas-prouve':
      return { texte: 'pas mieux que le moteur seul', ton: '', detail: `Sur ${pluriel(juge.matchs, 'match', 'matchs')}, ses avis ne font pas mieux que le moteur seul : l’écart reste dans le hasard.${fourchette}` };
    default:
      return { texte: `trop peu de matchs (${nombreDit(juge.matchs ?? 0)} sur ${nombreDit(min)})`, ton: 'is-warning', detail: `Le juge ne conclut pas sous ${pluriel(min, 'match', 'matchs')} jugés : aucun marché n’est retiré avant.` };
  }
}

/** Un gain par avis (fraction de mise) signé, deux décimales, le vrai signe moins. */
function signe2(x) {
  if (!fini(x)) return '?';
  const r = Math.round(x * 100) / 100;
  return `${r < 0 ? '−' : '+'}${fr(Math.abs(r), 2)}`;
}

/** L'état d'un type de marché : l'étiquette et son ton. */
export function etatDit(etat, etiquette = null, { retire = etat === 'coupe' } = {}) {
  const textes = {
    coupe: 'l’IA n’apporte rien ici, elle ne commente plus',
    seraitRetire: 'serait retiré : l’IA n’apporte rien ici',
    garde: 'l’IA fait mieux que le moteur seul : elle commente',
    tropTot: 'trop tôt pour juger : elle commente',
    aucun: 'aucun avis compté : elle commente'
  };
  const tons = { coupe: 'is-warning', garde: 'is-info', tropTot: '', aucun: '' };
  // Retouche du 14/10 : la coupure désactivée, la règle dit seulement ce qu'elle ferait (le marché reste commenté).
  const seraitRetire = etat === 'coupe' && !retire;
  return { texte: etiquette ?? (seraitRetire ? textes.seraitRetire : textes[etat]) ?? textes.aucun, ton: tons[etat] ?? '', coupe: etat === 'coupe' && retire, seraitRetire };
}

/**
 * La clôture d'une case : « 16 dans son sens · 11 contre · 1 sans mouvement », la moyenne de sa valeur de
 * clôture, ou la raison de son absence (marché sans cote gratuite, aucun avis mesuré).
 */
export function clotureDite(c, { avecCloture = true } = {}) {
  if (!avecCloture) return { texte: 'pas de cote gratuite', moyenne: '—', detail: 'Seuls le 1N2, le plus/moins de buts et « les deux équipes marquent » ont des cotes de clôture gratuites.' };
  if (!c?.mesures) return { texte: 'aucun avis mesuré', moyenne: '—', detail: 'Aucun avis compté de ce marché n’a de cote archivée à l’heure de l’analyse et à la clôture.' };
  return {
    texte: `${nombreDit(c.dansSonSens)} dans son sens · ${nombreDit(c.contre)} contre${c.immobile ? ` · ${nombreDit(c.immobile)} sans mouvement` : ''}`,
    moyenne: cloturePourcentDit(c.moyenneIA),
    detail: `${pluriel(c.mesures, 'avis mesuré', 'avis mesurés')} entre l’heure de l’analyse et la clôture${c.approx ? ` (${nombreDit(c.approx)} au prix d’ouverture, faute de relevé daté)` : ''}. Valeur de clôture moyenne en suivant l’IA : ${cloturePourcentDit(c.moyenneIA)} (moteur seul : ${cloturePourcentDit(c.moyenneMoteur)}).`
  };
}

/** Une ligne d'un tableau (une case du carnet) mise en mots. */
function ligneDeCase(c, { avecCloture = true } = {}) {
  const b = c?.bilan ?? {};
  return {
    avis: avisDits(c?.avis),
    comptes: nombreDit(b.aiVerdicts ?? 0),
    tenus: tenusDits(b.aiRight, b.aiVerdicts),
    taux: tauxDit(b.aiRight, b.aiVerdicts),
    moteur: tenusDits(c?.moteurJusteSurLesAvis, b.aiVerdicts),
    matchs: nombreDit(c?.matchsJuges ?? 0),
    cloture: clotureDite(c?.cloture, { avecCloture })
  };
}

/**
 * Le tableau « Par marché » : TOUJOURS les onze types de marché (une ligne vide dit « aucun avis compté »),
 * puis le total (Σ des comptes, le pourcentage de tous les avis — jamais une somme de pourcentages).
 */
export function tableauDesTypes(carnet, { types = TYPES_PAR_DEFAUT, minimum = 200 } = {}) {
  const parType = new Map((carnet?.types ?? []).map((t) => [t.marketType, t]));
  const lignes = types.map((d) => {
    const t = parType.get(d.marketType) ?? null;
    const etat = etatDit(t?.etat ?? 'aucun', t?.etiquette ?? null, { retire: t?.retire === true });
    return {
      cle: d.marketType,
      libelle: t?.label ?? d.label,
      vide: !t,
      ...ligneDeCase(t, { avecCloture: d.avecCloture }),
      juge: faceAuMoteurDit(t?.juge?.issue ?? null, { minimum }),
      etat
    };
  });
  const tot = carnet?.total ?? null;
  return { lignes, total: { libelle: 'Σ Tous les marchés', ...ligneDeCase(tot, { avecCloture: true }) } };
}

/** Les options du choix du marché (« Tous les marchés » d'abord). */
export function optionsDesTypes(types = TYPES_PAR_DEFAUT) {
  return [{ value: 'tous', label: 'Tous les marchés' }, ...types.map((t) => ({ value: t.marketType, label: t.label }))];
}

/**
 * Le tableau « Par championnat » d'un marché (ou de tous) : une ligne par marché × championnat, puis Σ (les
 * comptes additionnés, le pourcentage de tous leurs avis) et ⌀ (la moyenne par ligne : chaque championnat pèse
 * autant). `ordonner` : les favoris d'abord.
 */
export function tableauDesChampionnats(carnet, { marche = 'tous', ordonner = (x) => x, types = TYPES_PAR_DEFAUT } = {}) {
  const avecCloture = new Map(types.map((t) => [t.marketType, t.avecCloture]));
  const brutes = (carnet?.parChampionnat ?? []).filter((c) => marche === 'tous' || c.marketType === marche);
  const lignes = ordonner(brutes).map((c) => ({
    cle: `${c.marketType}|${c.league ?? ''}`,
    league: c.league ?? 'Championnat inconnu',
    marche: c.label ?? c.marketType,
    ...ligneDeCase(c, { avecCloture: avecCloture.get(c.marketType) ?? false }),
    etat: etatDit(c.etat, null, { retire: c.retire === true })
  }));
  const somme = (f) => brutes.reduce((s, c) => s + (f(c) ?? 0), 0);
  const comptes = somme((c) => c.bilan?.aiVerdicts);
  const tenus = somme((c) => c.bilan?.aiRight);
  const n = brutes.length;
  const tauxMoyen = (() => {
    const avec = brutes.filter((c) => c.bilan?.aiVerdicts > 0);
    return avec.length ? `${fr(avec.reduce((s, c) => s + (100 * c.bilan.aiRight) / c.bilan.aiVerdicts, 0) / avec.length, 1)} %` : '—';
  })();
  return {
    lignes,
    total: { comptes: nombreDit(comptes), tenus: tenusDits(tenus, comptes), taux: tauxDit(tenus, comptes) },
    moyenne: { comptes: n ? fr(comptes / n, 1) : '0', tenus: n ? fr(tenus / n, 1) : '0', taux: tauxMoyen }
  };
}

/** Les trois niveaux de confiance, toujours les trois. */
export function lignesDeConfiance(carnet) {
  const parNiveau = new Map((carnet?.parConfiance ?? []).map((c) => [c.niveau, c]));
  return ['faible', 'moyenne', 'forte'].map((niveau) => {
    const c = parNiveau.get(niveau) ?? { verdicts: 0, right: 0 };
    return { cle: niveau, niveau: `Confiance ${niveau}`, comptes: nombreDit(c.verdicts), tenus: tenusDits(c.right, c.verdicts), taux: tauxDit(c.right, c.verdicts) };
  });
}

/** Les deux formes de la fiche (étape 41), toujours les deux. */
export function lignesDesFiches(carnet) {
  const parFiche = new Map((carnet?.parFiche ?? []).map((f) => [f.fiche, f]));
  return [
    ['compacte', 'Fiche compacte (depuis le 06/10)'],
    ['ancienne', 'Ancienne fiche']
  ].map(([fiche, libelle]) => {
    const f = parFiche.get(fiche) ?? null;
    return { cle: fiche, libelle, ...ligneDeCase(f) };
  });
}

/** « 30 · annoncé 44,2 % → réalisé 30,0 % » : ce que le moteur annonçait et ce qui est arrivé, pour un groupe d'avis. */
export function annonceDite(a) {
  if (!a?.n) return 'aucun';
  return `${nombreDit(a.n)} · annoncé ${fr(100 * a.annonce, 1)} % → réalisé ${fr(100 * a.realise, 1)} %`;
}

/** Un écart en points, une décimale, le vrai signe moins (« −14,0 points », « +0,4 point »). */
function pointsDits(fraction) {
  if (!fini(fraction)) return 'pas mesuré';
  const r = Math.round(fraction * 1000) / 10;
  return `${r < 0 ? '−' : '+'}${fr(Math.abs(r), 1)} point${Math.abs(r) >= 2 ? 's' : ''}`;
}

/**
 * Le juge de l'étape 16 sur « réalisé face à annoncé » d'un groupe d'avis, en mots : POUR INFORMATION, jamais vert.
 * `juge` : { verdict, matchs, minimum, ecart, fourchette, variantes } ou null.
 */
export function realiseFaceAAnnonceDit(juge) {
  if (!juge) return { texte: 'aucun avis', ton: '', detail: 'Aucun avis de ce genre sur un pronostic réglé.' };
  const min = juge.minimum ?? 200;
  const fourchette = Array.isArray(juge.fourchette) ? ` Écart réalisé − annoncé : ${pointsDits(juge.ecart)}, fourchette [${pointsDits(juge.fourchette[0])} ; ${pointsDits(juge.fourchette[1])}], ${pluriel(juge.matchs, 'match', 'matchs')}, ${pluriel(juge.variantes ?? 1, 'case jugée', 'cases jugées')} ensemble.` : '';
  switch (juge.verdict) {
    case 'retenu':
      return { texte: 'arrive plus souvent qu’annoncé', ton: 'is-info', detail: `Au-delà du hasard.${fourchette}` };
    case 'moins-bon':
      return { texte: 'arrive moins souvent qu’annoncé', ton: 'is-warning', detail: `Au-delà du hasard.${fourchette}` };
    case 'pas-prouve':
      return { texte: 'dans le hasard', ton: '', detail: `L’écart peut venir du hasard.${fourchette}` };
    default:
      return { texte: `trop peu de matchs (${nombreDit(juge.matchs ?? 0)} sur ${nombreDit(min)})`, ton: 'is-warning', detail: `Le juge ne conclut pas sous ${pluriel(min, 'match', 'matchs')}.` };
  }
}

/** Une case « confirme » ou « nuance » : ses avis, l'annoncé et le réalisé, et le juge. */
const caseDAnnonce = (a) => ({ texte: annonceDite(a), juge: realiseFaceAAnnonceDit(a?.juge ?? null) });

/**
 * Ce que disent ses avis « confirme » et « nuance », MARCHÉ PAR MARCHÉ : le taux réalisé face au taux annoncé par
 * le moteur, et le juge de l'étape 16 quand l'échantillon le permet ; puis tous les marchés. Pour information :
 * ni l'avis tenu ni la règle de la coupure ne comptent les « nuance ».
 */
export function lignesDesNuances(carnet, { types = TYPES_PAR_DEFAUT } = {}) {
  const parType = new Map((carnet?.types ?? []).map((t) => [t.marketType, t]));
  const lignes = types
    .map((d) => parType.get(d.marketType))
    .filter((t) => t?.annonces && (t.annonces.confirme?.n || t.annonces.nuance?.n))
    .map((t) => ({ cle: t.marketType, libelle: t.label, confirmes: caseDAnnonce(t.annonces.confirme), nuances: caseDAnnonce(t.annonces.nuance) }));
  const tot = carnet?.total?.annonces;
  return { lignes, total: { confirmes: caseDAnnonce(tot?.confirme), nuances: caseDAnnonce(tot?.nuance) } };
}

/** Les pronostics commentés qui n'entrent pas dans le carnet, raison par raison. */
export function ecartesDits(carnet) {
  return (carnet?.ecartes ?? []).map((e) => ({ cle: e.raison, texte: `${e.libelle} : ${nombreDit(e.n)}` }));
}

/** L'état du carnet en une phrase (calculé quand, pas encore calculé, d'un autre seuil). */
export function etatDuCarnet(reponse) {
  if (!reponse) return { titre: 'Pas encore lu', ton: 'is-info', phrase: 'Lecture du carnet…' };
  const c = reponse.carnet;
  if (!c) return { titre: 'Pas encore calculé', ton: 'is-info', phrase: 'Pas encore calculé : le carnet se remplit tout seul à la prochaine actualisation (chaque nuit, ou au clic « Actualiser »).' };
  const quand = `Calculé le ${jourHeureDit(c.calculeLe)} par l’actualisation (chaque nuit) : tous les avis d’avant-match relus depuis la règle du 30/09.`;
  if (reponse.aJour === false) return { titre: 'À recalculer', ton: 'is-warning', phrase: `${quand} Il a été calculé avec un autre seuil ou une autre forme : il ne retire aucun marché jusqu’au prochain calcul.` };
  return { titre: 'À jour', ton: '', phrase: quand };
}

/** Les marchés retirés de la liste de l'IA, en une phrase. */
/** La phrase de la page tant que la coupure est désactivée (la même que celle du serveur). */
export const DECISION_EN_ATTENTE = 'Aucun marché n’est retiré pour l’instant : c’est à vous de décider de la règle.';

/**
 * Les marchés retirés, en une phrase. La coupure désactivée (`coupureActive` faux, retouche du 14/10) : la phrase
 * de la décision, puis ce que la règle retirerait si elle était en service.
 */
export function coupesDites(carnet, { coupureActive = carnet?.coupureActive ?? false } = {}) {
  const libelle = (t) => (carnet?.types ?? []).find((x) => x.marketType === t)?.label ?? t;
  if (!coupureActive) {
    const seraient = carnet?.seraientRetires ?? [];
    if (!carnet) return DECISION_EN_ATTENTE;
    return seraient.length
      ? `${DECISION_EN_ATTENTE} Si la règle était en service, elle retirerait : ${seraient.map(libelle).join(', ')}.`
      : `${DECISION_EN_ATTENTE} Même en service, la règle ne retirerait aucun marché aujourd’hui.`;
  }
  const coupes = carnet?.coupes ?? [];
  if (!coupes.length) return 'Aucun marché retiré : l’IA commente tous les marchés de sa liste.';
  return `Retiré${coupes.length > 1 ? 's' : ''} de la liste de l’IA dès sa prochaine analyse : ${coupes.map(libelle).join(', ')}.`;
}

/** La règle de la coupure, en une phrase (le seuil vient de la route). */
export const regleDeCoupure = (seuil = 200) =>
  `Un marché n’est retiré de la liste de l’IA que sur preuve : au moins ${nombreDit(seuil)} matchs jugés, et ses avis ne font pas mieux que le moteur seul (le juge de l’étape 16), ni sur l’issue ni à la clôture. Les avis « nuance » ne sont jamais comptés.`;
