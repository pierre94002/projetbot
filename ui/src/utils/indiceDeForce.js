/**
 * indiceDeForce.js — les règles d'affichage du bloc « INDICE DE FORCE » de la page d'une équipe (étape 31 du plan,
 * 22/10/2026 ; ce que l'étape 29 calcule chaque nuit). JavaScript pur, sans Vue ni navigateur : les tests du serveur
 * le rejouent (server/test/fichesEcran.test.mjs) sur les vraies réponses de GET /api/match-stats/team-strength.
 *
 * Rien n'est calculé ici : le serveur a corrigé chaque statistique de la force des adversaires affrontés et rangé
 * la place du club dans son championnat (teamStrength.js). L'écran met en forme, en langage simple, et dit ce qui
 * manque au lieu d'un tiret : « pas encore calculé », « pas assez de matchs à domicile », « non relevé ».
 *
 * Les couleurs : un point fort est BLEU (information), un point faible AMBRE — jamais le vert (réservé à la value
 * et au « validé »), jamais le rouge (un club faible n'est pas une erreur). La forme est une tendance : ni bonne ni
 * mauvaise, son trait est celui de la couleur de la section.
 */

import { parseLeagueLabel } from './leagueDisplay.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const fr = (x, d = 0) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const MOINS = '−';
/**
 * Le championnat dans une phrase, par le nom que l'appli lui donne (celui du badge de la compétition : « EPL »,
 * « Bundesliga » pour « Bundesliga - Germany »), jamais le libellé brut de l'API : « du championnat (EPL) ».
 */
export const duChampionnat = (league) => (league ? `du championnat (${parseLeagueLabel(league).name})` : 'de son championnat');
/** Un nombre signé, le vrai signe moins ; zéro s'écrit « +0,00 » (les colonnes restent alignées). */
const signe = (x, d = 2) => {
  const r = Math.round(x * 10 ** d) / 10 ** d;
  return `${r < 0 ? MOINS : '+'}${fr(Math.abs(r), d)}`;
};

/** Un percentile à partir de 75 est un point fort (le quart du haut du championnat), à 25 ou moins un point faible. */
export const SEUILS = Object.freeze({ pointFort: 75, pointFaible: 25 });

/**
 * Les treize statistiques de l'indice, dans l'ordre du serveur (STATISTIQUES_INDICE de teamStrength.js ; un test
 * compare les deux) — de quoi garder le tableau entier quand le serveur ne répond pas. `cote` : ce que le club
 * produit (« pour »), ce qu'il concède (« contre »), ou une note (la possession).
 */
export const STATISTIQUES = Object.freeze(
  [
    ['xg_p', 'xG créés', 'pour'],
    ['xg_c', 'xG concédés', 'contre'],
    ['tirs_p', 'Tirs', 'pour'],
    ['tirs_c', 'Tirs concédés', 'contre'],
    ['cadres_p', 'Tirs cadrés', 'pour'],
    ['cadres_c', 'Tirs cadrés concédés', 'contre'],
    ['occasions_p', 'Grosses occasions', 'pour'],
    ['occasions_c', 'Grosses occasions concédées', 'contre'],
    ['buts_p', 'Buts marqués', 'pour'],
    ['buts_c', 'Buts encaissés', 'contre'],
    ['corners_p', 'Corners obtenus', 'pour'],
    ['corners_c', 'Corners concédés', 'contre'],
    ['possession', 'Possession', 'note']
  ].map(([id, libelle, cote]) => Object.freeze({ id, libelle, cote }))
);

export const LIEUX = Object.freeze([
  Object.freeze({ cle: 'tous', titre: 'Au total', phrase: 'tous ses matchs' }),
  Object.freeze({ cle: 'dom', titre: 'À domicile', phrase: 'ses matchs à domicile' }),
  Object.freeze({ cle: 'ext', titre: 'À l’extérieur', phrase: 'ses matchs à l’extérieur' })
]);

// ------------------------------------------------------------ petits mots

/** « 1er sur 20 », « 3e sur 18 » ; ce qui manque, dit. */
export function rangDit(rang, equipes) {
  if (!fini(rang) || !fini(equipes)) return 'place inconnue';
  return `${rang === 1 ? '1er' : `${fr(rang)}e`} sur ${fr(equipes)}`;
}

/** La note de force : des buts d'écart par match face à une équipe moyenne de son championnat — « +0,93 but ». */
export function noteDite(force) {
  if (!fini(force)) return 'pas calculée';
  return `${signe(force)} ${Math.abs(force) >= 2 ? 'buts' : 'but'}`;
}

/** Une note de force seule, signée, le vrai signe moins : « +0,28 », « −0,22 » (les repères de la courbe). */
export const noteSignee = (force) => (fini(force) ? signe(force) : 'pas calculée');

/** La valeur d'une statistique, par match face à un adversaire moyen : la possession en %, le reste à deux décimales. */
export function valeurDite(id, valeur) {
  if (!fini(valeur)) return null;
  return id === 'possession' ? `${fr(valeur, 1)} %` : fr(valeur, 2);
}

/** La place d'une statistique (0 à 100, plus haut = mieux, y compris pour ce qu'on concède), en mots. */
export function placeDite(percentile) {
  if (!fini(percentile)) return null;
  return `${fr(percentile)} %`;
}

/** 'is-fort' (bleu), 'is-faible' (ambre) ou '' selon la place. */
export function tonDeLaPlace(percentile) {
  if (!fini(percentile)) return '';
  if (percentile >= SEUILS.pointFort) return 'is-fort';
  if (percentile <= SEUILS.pointFaible) return 'is-faible';
  return '';
}

/** Le sens d'une place, en une phrase (survol et lecteurs d'écran). */
export function phraseDeLaPlace(libelle, cote, percentile) {
  if (!fini(percentile)) return `${libelle} : place inconnue.`;
  return cote === 'contre' ? `${libelle} : il en concède moins que ${fr(percentile)} % des clubs de son championnat.` : `${libelle} : devant ${fr(percentile)} % des clubs de son championnat.`;
}

/** Comment l'indice est fait (xG, ou le repli sur les buts et les tirs quand FotMob n'en publie pas). */
export function formuleDite(ligne) {
  if (!ligne) return null;
  return ligne.sansXg || ligne.formule === 'sans-xg'
    ? 'Sans xG : FotMob n’en publie pas (ou trop peu) pour ce championnat. La force est faite des buts, des tirs, des tirs cadrés, des corners et de la possession.'
    : 'Avec les xG : la force est faite des xG, des tirs, des tirs cadrés, des grosses occasions, des buts, des corners et de la possession.';
}

// ------------------------------------------------------------ l'état du bloc

const SERVEUR_PAS_A_JOUR = /^Le serveur n.est pas à jour/;

/**
 * L'état du bloc, et la phrase qui le dit — le bloc reste TOUJOURS affiché :
 *   chargement   la lecture est en cours ;
 *   erreur / pas-a-jour-serveur   le serveur ne répond pas, ou n'a pas encore la route (à relancer) ;
 *   sans-club    la page n'a pas pu reconnaître le club (pas d'identifiant FotMob) ;
 *   jamais       l'indice n'a jamais été calculé (la première nuit de l'actualisation le fait) ;
 *   sans-ligne   l'indice existe mais pas pour ce club (trop peu de matchs dans un championnat suivi) ;
 *   pret         une ligne au moins ; `aRefaire` si le calcul est d'une autre forme (refait à la prochaine nuit).
 */
export function etatDuBloc({ chargement = false, erreur = null, reponse = null, clubId = null } = {}) {
  if (!clubId) {
    return { cle: 'sans-club', ton: 'is-warning', titre: 'Club non reconnu', texte: 'La page n’a pas trouvé l’identifiant FotMob de ce club : sans lui, l’indice de force ne peut pas être lu.' };
  }
  if (chargement && !reponse) return { cle: 'chargement', ton: '', titre: 'Lecture en cours', texte: 'Lecture de l’indice de force…' };
  if (erreur) {
    return SERVEUR_PAS_A_JOUR.test(erreur)
      ? { cle: 'pas-a-jour-serveur', ton: 'is-warning', titre: 'Serveur à relancer', texte: `${erreur} Les tableaux ci-dessous restent affichés, sans valeurs.` }
      : { cle: 'erreur', ton: 'is-danger', titre: 'Indice de force illisible', texte: `${erreur} Les tableaux ci-dessous restent affichés, sans valeurs.` };
  }
  if (!reponse) return { cle: 'chargement', ton: '', titre: 'Lecture en cours', texte: 'Lecture de l’indice de force…' };
  if (reponse.etat === 'jamais' || !reponse.lecture) {
    return { cle: 'jamais', ton: 'is-info', titre: 'Pas encore calculé', texte: 'L’indice de force n’a pas encore été calculé : la prochaine passe de nuit de l’actualisation le fera (quelques secondes). Les tableaux ci-dessous restent affichés, sans valeurs.' };
  }
  const l = reponse.lecture.lignes ?? {};
  if (!l.tous && !l.dom && !l.ext) {
    return {
      cle: 'sans-ligne',
      ton: 'is-info',
      titre: 'Pas d’indice pour ce club',
      texte: 'L’indice n’existe pas pour ce club : il lui faut au moins trois matchs relevés dans un championnat suivi par le magasin. Les tableaux ci-dessous restent affichés, sans valeurs.'
    };
  }
  return { cle: 'pret', ton: '', titre: null, texte: null, aRefaire: reponse.etat === 'pas-a-jour' };
}

// ------------------------------------------------------------ le tableau

/** Une case : la valeur et la place d'une statistique à un lieu — ou pourquoi elle manque. */
function caseDe(stat, ligne, etat) {
  if (!ligne) {
    const texte = etat === 'pret' || etat === 'sans-ligne' ? 'pas assez de matchs' : 'pas encore calculé';
    return { valeur: null, valeurTexte: texte, percentile: null, placeTexte: null, ton: '', vide: true, titre: `${stat.libelle} : ${texte}.` };
  }
  const c = ligne.composantes?.[stat.id];
  if (!c || !fini(c.valeur)) {
    return {
      valeur: null,
      valeurTexte: 'non relevé',
      percentile: null,
      placeTexte: null,
      ton: '',
      vide: true,
      titre: `${stat.libelle} : non relevé pour ce club (FotMob ne publie pas cette statistique dans ce championnat, ou trop peu de fois).`
    };
  }
  return {
    valeur: c.valeur,
    valeurTexte: valeurDite(stat.id, c.valeur),
    percentile: fini(c.percentile) ? c.percentile : null,
    placeTexte: placeDite(c.percentile),
    ton: tonDeLaPlace(c.percentile),
    vide: false,
    titre: phraseDeLaPlace(stat.libelle, stat.cote, c.percentile)
  };
}

/** Les treize lignes du tableau (toujours les treize), chacune avec ses trois cases. */
export function lignesDuTableau(lecture, etat = 'jamais') {
  const l = lecture?.lignes ?? {};
  return STATISTIQUES.map((stat) => ({
    id: stat.id,
    libelle: stat.libelle,
    cote: stat.cote,
    cases: Object.fromEntries(LIEUX.map((lieu) => [lieu.cle, caseDe(stat, l[lieu.cle] ?? null, etat)]))
  }));
}

/**
 * Le pied du tableau : Σ = les statistiques comptées (jamais une somme de valeurs d'unités différentes, ni de
 * pourcentages), avec leurs points forts et leurs points faibles ; ⌀ = la place moyenne des statistiques relevées.
 */
export function piedDuTableau(lignes) {
  const sigma = {};
  const moyenne = {};
  for (const lieu of LIEUX) {
    const cases = lignes.map((l) => l.cases[lieu.cle]).filter((c) => c.percentile !== null);
    const forts = cases.filter((c) => c.percentile >= SEUILS.pointFort).length;
    const faibles = cases.filter((c) => c.percentile <= SEUILS.pointFaible).length;
    sigma[lieu.cle] = { n: cases.length, forts, faibles, milieu: cases.length - forts - faibles };
    moyenne[lieu.cle] = cases.length ? cases.reduce((t, c) => t + c.percentile, 0) / cases.length : null;
  }
  return { sigma, moyenne };
}

export const sigmaDit = (s) => (s.n ? `${fr(s.n)} sur ${fr(STATISTIQUES.length)} · ${fr(s.forts)} fort${s.forts > 1 ? 's' : ''} · ${fr(s.faibles)} faible${s.faibles > 1 ? 's' : ''}` : 'aucune statistique relevée');
export const moyenneDite = (m) => (fini(m) ? `${fr(m, 0)} %` : 'aucune place à moyenner');

// ------------------------------------------------------------ les points forts et faibles

/** Les points forts et faibles de la ligne « au total » : { id, libelle, percentile, phrase }. */
export function pointsDeLaLigne(ligne) {
  const dire = (liste) =>
    (liste ?? []).map((p) => {
      const stat = STATISTIQUES.find((s) => s.id === p.id);
      return { id: p.id, libelle: p.libelle ?? stat?.libelle ?? p.id, percentile: p.percentile, place: placeDite(p.percentile), phrase: phraseDeLaPlace(p.libelle ?? stat?.libelle ?? p.id, stat?.cote ?? 'pour', p.percentile) };
    });
  return { forts: dire(ligne?.pointsForts), faibles: dire(ligne?.pointsFaibles) };
}

// ------------------------------------------------------------ les chiffres clés

/** Les quatre chiffres clés du bloc : la note, la place, domicile et extérieur, ce que le calcul a lu. */
export function chiffresCles(lecture, etat = null) {
  const tous = lecture?.lignes?.tous ?? null;
  const dom = lecture?.lignes?.dom ?? null;
  const ext = lecture?.lignes?.ext ?? null;
  // Sans lecture (pas encore calculé, serveur muet) : rien à comparer ; avec une lecture, un lieu sans ligne manque de matchs.
  const lieu = (l) => (l ? `${noteDite(l.force)} · ${rangDit(l.rang, l.equipes)}` : lecture ? 'pas assez de matchs' : 'pas encore calculé');
  const vide = etat === 'sans-ligne' ? 'pas d’indice' : 'pas encore calculée';
  return {
    note: tous
      ? { valeur: noteDite(tous.force), detail: 'buts d’écart attendus par match face à une équipe moyenne de son championnat, adversaires corrigés' }
      : { valeur: vide, detail: 'indice indisponible' },
    place: tous
      ? {
          valeur: rangDit(tous.rang, tous.equipes),
          detail: fini(tous.percentileForce) ? `devant ${fr(tous.percentileForce)} % des clubs ${duChampionnat(tous.championnat)}` : `clubs ${duChampionnat(tous.championnat)}`
        }
      : { valeur: vide, detail: 'indice indisponible' },
    terrain: { dom: lieu(dom), ext: lieu(ext) },
    memoire: tous
      ? {
          valeur: `${fr(tous.matchs)} matchs`,
          detail: tous.sansXg ? 'dont aucun avec xG : repli sur les buts et les tirs' : `dont ${fr(tous.matchsXg ?? 0)} avec xG ; les plus récents comptent davantage`
        }
      : { valeur: 'non lu', detail: 'indice indisponible' }
  };
}

// ------------------------------------------------------------ la forme

/**
 * Les dernières valeurs de la note dans le temps (`historique` de la route : une ligne par jour de match du club,
 * la plus ancienne d'abord) : au plus `derniers` points, l'échelle du dessin, le chemin de la courbe. Une courbe
 * demande deux points au moins.
 */
export function courbeDeForme(historique, { largeur = 600, hauteur = 110, derniers = 30 } = {}) {
  const lignes = (historique ?? []).filter((h) => fini(h?.force)).slice(-derniers);
  if (lignes.length < 2) return { vide: true, points: [], chemin: '', min: null, max: null, premiere: lignes[0]?.jour ?? null, derniere: lignes.at(-1)?.jour ?? null };
  const valeurs = lignes.map((h) => h.force);
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const marge = 12;
  const etendue = max - min || 1;
  const points = lignes.map((h, i) => ({
    jour: h.jour,
    force: h.force,
    rang: h.rang ?? null,
    equipes: h.equipes ?? null,
    actuel: Boolean(h.actuel),
    x: (largeur * i) / (lignes.length - 1),
    y: max === min ? hauteur / 2 : marge + ((max - h.force) / etendue) * (hauteur - 2 * marge)
  }));
  const chemin = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return { vide: false, points, chemin, min, max, premiere: lignes[0].jour, derniere: lignes.at(-1).jour };
}

/** « 21/09/2026 ». */
export const jourDit = (jour) => (typeof jour === 'string' && /^\d{4}-\d{2}-\d{2}/.test(jour) ? `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}` : 'jour inconnu');

/**
 * La forme en quelques repères : la note d'aujourd'hui, et celle d'il y a 5, 10 et 20 matchs (jours de match du
 * club) quand elles existent, avec l'écart et la place d'alors. Un repère trop ancien pour l'historique le dit.
 */
export function reperesDeForme(historique) {
  const lignes = (historique ?? []).filter((h) => fini(h?.force));
  const maintenant = lignes.at(-1) ?? null;
  const repere = (n) => {
    const avant = lignes.length > n ? lignes[lignes.length - 1 - n] : null;
    if (!maintenant) return { n, libelle: `Il y a ${n} matchs`, note: 'pas calculée', ecart: null, ecartNombre: null, place: null, jour: null };
    if (!avant) return { n, libelle: `Il y a ${n} matchs`, note: 'pas assez d’historique', ecart: null, ecartNombre: null, place: null, jour: null };
    const ecartNombre = maintenant.force - avant.force;
    return { n, libelle: `Il y a ${n} matchs`, note: signe(avant.force), ecart: signe(ecartNombre), ecartNombre, place: rangDit(avant.rang, avant.equipes), jour: jourDit(avant.jour) };
  };
  return {
    maintenant: maintenant ? { note: signe(maintenant.force), place: rangDit(maintenant.rang, maintenant.equipes), jour: jourDit(maintenant.jour) } : null,
    reperes: [5, 10, 20].map(repere)
  };
}

/** La phrase de la forme (une seule, sans jargon). */
export function formeDite(historique) {
  const r = reperesDeForme(historique);
  if (!r.maintenant) return 'Pas encore de forme : l’indice n’a pas d’historique pour ce club.';
  const dix = r.reperes.find((x) => x.n === 10);
  if (!dix?.ecart) return `Sa note est de ${r.maintenant.note} but par match (${r.maintenant.place}) ; pas assez de matchs pour parler d’une tendance.`;
  const e = dix.ecartNombre;
  const sens = Math.abs(e) < 0.02 ? 'stable' : e > 0 ? 'en hausse' : 'en baisse';
  return `Sa note est ${sens} sur ses dix derniers matchs : ${dix.note} il y a dix matchs, ${r.maintenant.note} aujourd’hui (${dix.ecart}).`;
}

// ------------------------------------------------------------ la mesure au banc

/** Ce que le banc d'essai a dit de l'indice (face au classement corrigé par les xG), ou « pas encore mesuré ». */
export function bancDit(banc) {
  const principal = (banc?.jugements ?? []).find((j) => j.id === 'v1-xg' && j.preuve === true) ?? (banc?.jugements ?? []).find((j) => j.id === 'v1-xg') ?? null;
  if (!principal) return { mesure: false, texte: 'pas encore mesuré : le banc d’essai n’a pas encore comparé l’indice au classement corrigé par les xG.' };
  const f = Array.isArray(principal.fourchettePourcent) && principal.fourchettePourcent.every(fini) ? ` [${signe(principal.fourchettePourcent[0], 1)} ; ${signe(principal.fourchettePourcent[1], 1)}]` : '';
  const gain = fini(principal.gainPourcent) ? `${signe(principal.gainPourcent, 1)} %${f} d’erreur de prévision` : 'écart non mesuré';
  const mots = { retenu: 'retenu', 'pas-prouve': 'pas prouvé', 'moins-bon': 'moins bon', 'pas-assez-de-matchs': 'trop peu de matchs' };
  return { mesure: true, texte: `face au classement corrigé par les xG : ${gain} sur ${fr(principal.matchs ?? 0)} matchs, ${mots[principal.verdict] ?? String(principal.verdict)}.` };
}

// ------------------------------------------------------------ la provenance

/** La provenance du bloc, pour ProvenanceChip : le vrai fournisseur, l'heure du calcul, le fichier. */
export function provenanceDuBloc(reponse) {
  const jusquA = reponse?.jusquA ?? reponse?.lecture?.jusquA ?? null;
  return {
    source: 'FotMob (magasin) · indice de force',
    releveLe: reponse?.calculeLe ?? null,
    action: 'calculé',
    fichier: reponse?.base ?? null,
    detail: jusquA ? `Tient compte des matchs jusqu’au ${jourDit(jusquA)}. Calculé chaque nuit par l’actualisation, à partir de la table du jour J (ce qu’on savait la veille de chaque match).` : 'Calculé chaque nuit par l’actualisation.'
  };
}
