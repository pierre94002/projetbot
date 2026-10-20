/**
 * dailyChecks.js — le CONTRÔLE QUOTIDIEN des données (étape 14 du plan, 07/10/2026).
 * -----------------------------------------------------------------------
 * Après CHAQUE passe d'actualisation (étape « controleQuotidien », la
 * dernière), une trentaine de contrôles rapides donnent un FEU : vert, orange
 * ou rouge. Ils CONSTATENT, ils ne réparent jamais : aucune écriture dans la
 * base, aucune correction automatique, aucun rapprochement de noms (les
 * clubs par leur identifiant FotMob, les rencontres par leur clé).
 *
 * CE QUI EST REGARDÉ — les rencontres des 30 derniers jours (la période du
 * contrôle de cohérence des scores de l'actualisation), avec les contrôles de
 * l'étape 12 (dataHealth.js) réutilisés tels quels sur cette fenêtre, plus :
 *   - les scores face à football-data.co.uk : la liste des écarts que
 *     l'étape 13 garde (le rattachement n'est pas refait), relue avec le
 *     score ACTUEL du magasin, et les matchs football-data de la fenêtre
 *     comparés au magasin (un score changé depuis le rattachement se voit) ;
 *     un écart EXPLIQUÉ (prolongation, tirs au but, résultat attribué) n'est
 *     qu'une information ; un écart sans explication est rouge ;
 *   - les zéros « non relevé » par championnat (cartons jaunes, corners,
 *     tirs à 0 des deux côtés) : le cas argentin — FotMob publie depuis
 *     janvier 2026 les jaunes à 0 alors que le déroulé en compte ;
 *   - les saisons et les matchs HORS REPÈRES (étape 15,
 *     leagueBenchmarks.valeursAttendues) : au plus ORANGE, jamais rouge,
 *     parce que le jeu évolue (la Premier League 2023-24, vraie saison hors
 *     norme, était à +2,7 écarts normaux de buts) ;
 *   - la complétude (matchs joués absents, feuilles en retard, magasin à
 *     jour) et la santé des sources (sourceHealth.js).
 *
 * LES COULEURS. Rouge = données impossibles ou contradictoires (score
 * différent de football-data et non expliqué, chiffres impossibles, doublon,
 * match joué absent…) ; orange = à regarder (zéros non relevés, hors repères,
 * identité incomplète…) ; vert = rien à dire. Un constat rouge reste rouge
 * 24 heures après sa découverte, puis passe à l'orange « connu depuis le … »
 * tant qu'il reste (la règle de l'étape 12 : seule une erreur NOUVELLE
 * alarme ; les connues restent listées). Les sources sont jugées à la
 * lecture, sur leurs notes du moment.
 *
 * « À VÉRIFIER ». Un constat qui touche les données d'un pronostic (une
 * rencontre récente d'un des deux clubs, un relevé absent du championnat,
 * FotMob en panne) le fait marquer « à vérifier », avec une raison courte
 * (aVerifierDuMatch). Informatif : le verdict du moteur (verdictPari.js) ne
 * change jamais. Exception voulue par Pierre (retouche du 07/10/2026) : les
 * contrôles « buteurs et score » et « gardiens et score » ne regardent que les
 * données des JOUEURS ; aucun marché du moteur ne s'en sert (résultat, buts,
 * « les deux marquent », corners, tirs et cartons se calculent au niveau de
 * l'équipe). Ils restent rouges et listés dans la carte, mais leurs constats
 * sont de la famille « joueurs » : le badge n'y viendra que sur les futurs
 * paris sur les joueurs (buteur, passeur… : étape 34 du plan), donc sur aucun
 * marché aujourd'hui, et jamais dans le bandeau d'un match.
 *
 * RAPIDE : quelques secondes sur la base complète, dans le serveur, en
 * rendant la main entre deux contrôles (`setImmediate`) et dans les boucles
 * longues ; jamais pendant un import (la passe tient le verrou).
 * -----------------------------------------------------------------------
 */

import {
  lireRencontres,
  lireStatsEquipes,
  lireLignesJoueurs,
  lireJoueursImpossibles,
  controlesDeRencontre,
  controlesDoublons,
  controlesAudit,
  controlesClassements,
  manquantsFotmob,
  cleLigueSaison,
  SORTES
} from './dataHealth.js';
import { TEAM_COLUMNS } from './columns.js';
import { valeursAttendues } from './leagueBenchmarks.js';
import { lireResume } from '../providers/footballDataHistory.js';
import { seasonOf, seasonLabel } from '../providers/seasonWindows.js';
import { isCup, hasStandings } from '../providers/leagueCups.js';

/** Forme de l'état gardé : un état d'une autre version ne sert pas aux dates de découverte. */
export const VERSION_CONTROLE = 1;
/** La fenêtre des rencontres contrôlées : celle du contrôle de cohérence des scores de l'actualisation. */
export const FENETRE_JOURS = 30;
/** Un constat rouge reste rouge tant qu'il a moins de 24 h ; ensuite « connu », orange. */
export const NOUVEAU_MS = 24 * 3_600_000;
/** Hors repères : à partir de 3 écarts normaux, sur une saison de 30 matchs au moins. */
export const SEUIL_HORS_REPERES = 3;
export const MINIMUM_MATCHS_REPERES = 30;
/** Un match hors norme : plus de 5 écarts-types d'un match au-dessus de l'attendu. */
export const ECARTS_MATCH_ABERRANT = 5;
/** Zéros non relevés : la moitié des matchs d'un championnat de la fenêtre, 5 au moins. */
export const PART_NON_RELEVE = 0.5;
export const MINIMUM_NON_RELEVE = 5;
/** Le magasin n'a rien reçu depuis plus longtemps : à regarder. */
export const MAGASIN_HEURES = 36;
/** Un constat d'une rencontre d'un club marque ses pronostics des 60 jours suivants. */
export const JOURS_A_VERIFIER = 60;
/** Constats gardés par contrôle (les rouges le sont tous). */
const CONSTATS_GARDES = 40;

const JOUR_MS = 86_400_000;
/** Les durées : l'horloge du processus, jamais celle du calendrier (elle avance même quand une heure est figée pour un essai). */
const chrono = () => performance.now();
const COL = Object.fromEntries(TEAM_COLUMNS.map((c) => [c.key, c.column]));
const HORS_JEU = /^(cancelled|abandoned|postponed)$/;

export const FAMILLES = Object.freeze([
  Object.freeze({ cle: 'scores', libelle: 'Scores', quoi: 'le score de chaque rencontre face à football-data.co.uk, aux buteurs, aux gardiens et au calendrier' }),
  Object.freeze({ cle: 'doublons', libelle: 'Doublons et identité', quoi: 'rencontres en double ou mal rangées, clubs et rencontres sans identifiant' }),
  Object.freeze({ cle: 'impossibles', libelle: 'Chiffres impossibles', quoi: 'des chiffres qui ne peuvent pas être vrais ensemble, et le classement officiel' }),
  Object.freeze({ cle: 'non-releves', libelle: 'Zéros « non relevé »', quoi: 'des 0 que la source publie à la place d’une donnée qu’elle n’a pas' }),
  Object.freeze({ cle: 'completude', libelle: 'Complétude et fraîcheur', quoi: 'matchs joués absents, feuilles en retard, magasin à jour' }),
  Object.freeze({ cle: 'reperes', libelle: 'Hors repères', quoi: 'une saison ou un match loin de ce qui est normal dans son championnat — au plus orange : le jeu évolue' }),
  Object.freeze({ cle: 'sources', libelle: 'Santé des sources', quoi: 'FotMob, football-data, The Odds API, API-Football, Claude, cotes gratuites' })
]);

const C = (cle, famille, libelle, classe, quoi) => Object.freeze({ cle, famille, libelle, classe, quoi });

/**
 * LES CONTRÔLES, dans l'ordre de l'écran. `classe` : la couleur la plus forte
 * qu'il peut donner (rouge : données impossibles ou contradictoires ; orange :
 * à regarder ; info : une information, toujours verte).
 */
export const CONTROLES = Object.freeze([
  C('score-football-data', 'scores', 'Score différent de football-data', 'rouge', 'le score du magasin face à celui de football-data.co.uk, sans prolongation, tirs au but ni résultat attribué pour l’expliquer'),
  C('score-football-data-explique', 'scores', 'Écarts expliqués avec football-data', 'info', 'les écarts de score qu’explique une prolongation, une séance de tirs au but ou un résultat attribué sur tapis vert'),
  C('buteurs-score', 'scores', 'Buteurs et score', 'rouge', 'les buts des joueurs (et les csc adverses) font-ils le score ? (audit des scores)'),
  C('gardiens-score', 'scores', 'Gardiens et score', 'rouge', 'les buts encaissés des gardiens font-ils le score de l’adversaire ? (audit des scores)'),
  C('score-calendrier', 'scores', 'Score du calendrier et des résultats', 'rouge', 'le magasin, le calendrier et les résultats disent-ils le même score ? (contrôle quotidien des scores)'),
  C('score-futur', 'scores', 'Score d’un match à venir', 'rouge', 'un match daté après demain qui a déjà un score'),
  C('score-absent', 'scores', 'Match passé sans score', 'orange', 'un match daté d’avant hier, ni reporté ni annulé, qui n’a pas de score au magasin'),
  C('doublon-meme-sens', 'doublons', 'Rencontre en double', 'rouge', 'même jour, mêmes deux clubs (par identifiant), même sens'),
  C('doublon-sens-inverse', 'doublons', 'Rencontre dans les deux sens', 'rouge', 'même jour, mêmes deux clubs, une fois dans chaque sens'),
  C('doublon-meme-identifiant', 'doublons', 'Même rencontre FotMob deux fois', 'rouge', 'un identifiant de rencontre FotMob sous deux clés du magasin'),
  C('club-deux-fois', 'doublons', 'Club deux fois le même jour', 'orange', 'un club qui joue deux matchs le même jour : club mal identifié ou date fausse'),
  C('mauvaise-competition', 'doublons', 'Rencontre mal rangée', 'rouge', 'rangée dans une compétition que FotMob ne lui donne pas, ou club absent du classement officiel'),
  C('clubs-sans-identifiant', 'doublons', 'Club sans identifiant', 'orange', 'une rencontre dont un club n’a pas d’identifiant FotMob : rien ne s’y rattache sans le nom'),
  C('rencontres-sans-identifiant', 'doublons', 'Rencontre sans identifiant FotMob', 'orange', 'une rencontre sans identifiant FotMob (ou l’identifiant 0, partagé)'),
  C('joueurs-sans-identifiant', 'doublons', 'Joueurs sans identifiant', 'info', 'joueurs à l’identifiant 0 de FotMob, rangés par leur nom (limite connue de la source)'),
  C('chiffres-equipe', 'impossibles', 'Chiffres d’équipe impossibles', 'rouge', 'tirs cadrés > tirs, possession qui ne fait pas 100 %, passes réussies > passes…'),
  C('chiffres-joueurs', 'impossibles', 'Chiffres de joueurs impossibles', 'rouge', 'trois jaunes, deux rouges, plus de tirs cadrés que de tirs, minutes impossibles…'),
  C('classement-officiel', 'impossibles', 'Classement officiel', 'rouge', 'le classement calculé sur le magasin face à la table officielle : matchs joués et bilan'),
  C('jaunes-non-releves', 'non-releves', 'Cartons jaunes non relevés', 'orange', 'un championnat où la plupart des matchs ont 0 jaune des deux côtés (le cas argentin : 0 publié, le déroulé en compte)'),
  C('corners-non-releves', 'non-releves', 'Corners non relevés', 'orange', 'un championnat où la plupart des matchs ont 0 corner des deux côtés'),
  C('tirs-non-releves', 'non-releves', 'Tirs non relevés', 'orange', 'un championnat où la plupart des matchs ont 0 tir des deux côtés'),
  C('zeros-non-releves', 'non-releves', 'Autres zéros « non relevé »', 'orange', 'passes, tacles ou possession à 0, plusieurs champs défensifs à 0 ensemble'),
  C('rencontres-manquantes', 'completude', 'Match joué absent du magasin', 'rouge', 'joué selon la page de la compétition chez FotMob (étape « omissions » de cette passe), toujours absent après l’import'),
  C('feuilles-en-retard', 'completude', 'Feuilles de match en retard', 'orange', 'un match joué depuis plus d’un jour sans statistiques, ni marqué « sans feuille » par la source'),
  C('magasin-a-jour', 'completude', 'Magasin à jour', 'orange', `le magasin a-t-il reçu des rencontres dans les ${MAGASIN_HEURES} dernières heures ?`),
  C('hors-reperes-buts', 'reperes', 'Buts hors repères', 'orange', `buts, nuls, plus de 2,5 buts, les deux marquent, avantage du terrain de la saison en cours, à ${SEUIL_HORS_REPERES} écarts normaux ou plus de l’attendu`),
  C('hors-reperes-statistiques', 'reperes', 'Corners et tirs hors repères', 'orange', `corners, tirs et tirs cadrés de la saison en cours, à ${SEUIL_HORS_REPERES} écarts normaux ou plus de l’attendu`),
  C('hors-reperes-cartons', 'reperes', 'Cartons hors repères', 'orange', `cartons jaunes et rouges de la saison en cours, à ${SEUIL_HORS_REPERES} écarts normaux ou plus de l’attendu`),
  C('match-aberrant', 'reperes', 'Match hors norme', 'orange', `un match à plus de ${ECARTS_MATCH_ABERRANT} écarts-types d’un match au-dessus de l’attendu de son championnat (buts, corners, tirs)`),
  C('source-fotmob', 'sources', 'FotMob', 'rouge', 'répond-il, et ses réponses ont-elles la forme attendue ? (lu dans les réponses que l’actualisation reçoit déjà)'),
  C('source-football-data', 'sources', 'football-data.co.uk', 'orange', 'fichiers lus sans échec ?'),
  C('source-odds-api', 'sources', 'The Odds API', 'orange', 'crédits restants au dernier relevé (jamais appelé pour les lire)'),
  C('source-api-football', 'sources', 'API-Football', 'orange', 'appels du jour face aux 100 du plan gratuit (lus dans les en-têtes du dernier vrai appel)'),
  C('source-claude', 'sources', 'Claude', 'rouge', 'date d’expiration du jeton (réglage saisi par Pierre) et dernier appel'),
  C('source-cotes-gratuites', 'sources', 'Cotes gratuites', 'orange', 'chaque source de référence a-t-elle répondu à la dernière passe ?')
]);
const PAR_CLE = new Map(CONTROLES.map((c) => [c.cle, c]));

/** Les couleurs, de la plus calme à la plus forte. */
export const COULEURS = Object.freeze(['vert', 'orange', 'rouge']);
const RANG = { vert: 0, gris: 0, 'non-fait': 0, orange: 1, erreur: 1, rouge: 2 };
const pire = (a, b) => ((RANG[b] ?? 0) > (RANG[a] ?? 0) ? b : a);

// ===================================================================== aides

const iso = (t) => new Date(t).toISOString().slice(0, 10);
const jourFr = (j) => {
  const m = String(j ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'date inconnue';
};
const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${Math.abs(Number(n ?? 0)) > 1 ? plusieurs : un}`;
const decimal = (x, n = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '?' : x.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n }));
const signe = (x) => `${x >= 0 ? '+' : '−'}${decimal(Math.abs(x), 1)}`;
const parse = (texte) => {
  if (!texte) return null;
  try {
    return JSON.parse(texte);
  } catch {
    return null;
  }
};
const marques = (n) => Array.from({ length: n }, () => '?').join(',');
const lots = (liste, taille = 500) => Array.from({ length: Math.ceil(liste.length / taille) }, (_, i) => liste.slice(i * taille, i * taille + taille));

/** Les familles de marché que touche un constat : « tout », ou buts, corners, tirs, cartons, joueurs. */
export const FAMILLES_DE_MARCHE = Object.freeze(['buts', 'corners', 'tirs', 'cartons', 'joueurs']);

/**
 * Les familles dont AUCUN marché n'existe encore dans le moteur : les paris sur
 * un joueur (buteur, passeur, tireur, joueur averti — étape 34 du plan). Le
 * moteur calcule tout au niveau de l'équipe ; un constat qui ne touche que les
 * données des joueurs (« buteurs et score », « gardiens et score ») ne marque
 * donc aucun pronostic d'aujourd'hui. Conséquences, voulues par Pierre
 * (07/10/2026) : ses raisons ne viennent JAMAIS dans le résumé d'un match
 * (aVerifierDuMatch sans famille : le bandeau de la page du match) et ne
 * comptent pas dans les « clubs aux données douteuses » de la carte ; elles ne
 * se posent que sur la ligne d'un marché de cette famille, demandée avec
 * `famille: 'joueurs'`.
 */
export const FAMILLES_SANS_MARCHE = Object.freeze(['joueurs']);

/**
 * Des familles touchent-elles au moins un marché que le moteur calcule
 * aujourd'hui ? Faux seulement pour des familles toutes sans marché (les
 * joueurs). Une liste vide compte pour vraie : la règle d'avant, inchangée.
 */
export function toucheUnMarcheDuMoteur(familles) {
  const liste = familles ?? ['tout'];
  return !(liste.length > 0 && liste.every((f) => FAMILLES_SANS_MARCHE.includes(f)));
}

/** Les identifiants de marché du moteur (markets.js, statMarkets.js) qui ne viennent pas du score, et le seul marché de joueur qui existe déjà (saisie à la main, saisiesCotes.js). */
export const FAMILLE_PAR_MARCHE = Object.freeze({
  totalCorners: 'corners',
  teamCorners: 'corners',
  totalShots: 'tirs',
  teamShots: 'tirs',
  totalShotsOnTarget: 'tirs',
  teamShotsOnTarget: 'tirs',
  totalCards: 'cartons',
  teamCards: 'cartons',
  anytimeScorer: 'joueurs'
});

/** Un identifiant du moteur (un seul mot, jamais un libellé) d'un marché sur un joueur à venir : firstScorer, playerShots, playerCards, assists… */
const ID_DE_JOUEUR = /^(player[A-Z0-9_].*|.*[Ss]corer|assists?)$/;

/**
 * La famille d'un marché : corners, tirs (tirs et tirs cadrés), cartons,
 * joueurs (buteur, passeur, tireur, joueur averti : paris sur un joueur, dont
 * le moteur ne calcule encore aucun) ; tout le reste vient du score (buts) —
 * résultat, totaux, les deux marquent, buts d'une équipe, et les marchés du
 * Repérage. Par identifiant du moteur ; pour un ancien pronostic qui n'a que
 * son libellé, par son premier mot (« Corners — … », « Buteur — … ») — jamais
 * par un mot pris au milieu d'un nom de club.
 */
export function familleDuMarche(marche) {
  const m = String(marche ?? '').trim();
  if (FAMILLE_PAR_MARCHE[m]) return FAMILLE_PAR_MARCHE[m];
  if (/^[A-Za-z][A-Za-z0-9_]*$/.test(m) && ID_DE_JOUEUR.test(m)) return 'joueurs';
  if (/^(buteurs?|passeurs?|joueurs?)\b/i.test(m)) return 'joueurs';
  if (/^corners?\b/i.test(m)) return 'corners';
  if (/^(tirs?|shots?)\b/i.test(m)) return 'tirs';
  if (/^(cartons?|cards?)\b/i.test(m)) return 'cartons';
  return 'buts';
}

/**
 * Pourquoi le score de FotMob (le magasin) et celui de football-data ne sont
 * pas les mêmes, quand une raison connue l'explique. `meta` : la colonne meta
 * de la rencontre ; `buts` : ses buts du déroulé ({ side, minute }). FotMob
 * note un but du temps additionnel en minute 90 (+ temps ajouté) : une minute
 * au-delà de 90 est une prolongation.
 * Rend { explique, cle, texte }.
 */
export function expliquerEcart({ fd, magasin, meta = null, buts = null }) {
  const m = meta ?? {};
  if (m.awarded === 1 || m.awarded === true || m.reason === 'awarded_win') {
    return { explique: true, cle: 'attribue', texte: 'résultat attribué sur tapis vert : FotMob donne le score décidé, football-data celui du terrain' };
  }
  if (m.reason === 'afterpenalties') {
    return { explique: true, cle: 'tirs-au-but', texte: 'décidé aux tirs au but : les deux sources ne comptent pas la séance de la même façon' };
  }
  if (m.reason === 'afterextra') {
    return { explique: true, cle: 'prolongation', texte: 'décidé en prolongation : football-data donne le score à 90 minutes, FotMob celui d’après la prolongation' };
  }
  if (Array.isArray(buts) && magasin && fd && buts.some((b) => Number(b?.minute) > 90)) {
    const a90 = (side) => buts.filter((b) => b?.side === side && Number(b.minute) <= 90).length;
    if (buts.length === Number(magasin[0]) + Number(magasin[1]) && a90('home') === Number(fd[0]) && a90('away') === Number(fd[1])) {
      return { explique: true, cle: 'prolongation', texte: 'prolongation : le déroulé FotMob a des buts après la 90e, et son score à 90 minutes est celui de football-data' };
    }
  }
  return { explique: false, cle: 'non-explique', texte: 'aucune prolongation, séance de tirs au but ni résultat attribué ne l’explique' };
}

/** La couleur d'un constat à l'instant `maintenant` : un rouge de plus de 24 h est « connu », orange. */
export function couleurDuConstat(c, maintenant = Date.now()) {
  if (c?.classe === 'rouge') {
    const t = Date.parse(c.trouveLe ?? '');
    return Number.isFinite(t) && maintenant - t >= NOUVEAU_MS ? 'orange' : 'rouge';
  }
  if (c?.classe === 'orange') return 'orange';
  return 'vert';
}

/** Le statut d'un contrôle à l'instant `maintenant` (ses constats re-datés). */
export function statutDuControle(controle, maintenant = Date.now()) {
  if (controle?.statut === 'non-fait' || controle?.statut === 'erreur') return controle.statut;
  if (controle?.statutDirect) return controle.statutDirect;
  let s = 'vert';
  for (const c of controle?.constats ?? []) s = pire(s, couleurDuConstat(c, maintenant));
  // Les constats non gardés (au-delà de 40) sont orange ou info : comptés à part.
  if ((controle?.parClasse?.orange ?? 0) > 0) s = pire(s, 'orange');
  return s;
}

/** Le feu : la couleur la plus forte des contrôles (un contrôle en panne compte orange). */
export function couleurDuFeu(controles, maintenant = Date.now()) {
  let feu = 'vert';
  for (const c of controles ?? []) feu = pire(feu, statutDuControle(c, maintenant) === 'erreur' ? 'orange' : statutDuControle(c, maintenant));
  return feu === 'erreur' ? 'orange' : feu === 'non-fait' ? 'vert' : feu;
}

/** Un constat, toujours de la même forme. */
function constat({ controle, cle, classe, texte, detail = null, sorte = null, r = null, league = null, saison = null, date = null, label = null, score = null, clubs = null, familles = ['tout'], aVerifier = true, raison = null }) {
  return {
    id: `${controle}:${cle}`,
    controle,
    classe,
    texte,
    detail,
    sorte,
    matchKey: r?.matchKey ?? null,
    date: r?.date ?? date,
    league: r?.league ?? league,
    saison: saison ?? (r ? seasonLabel(r.league, r.season ?? seasonOf(r.league, r.date)) : null),
    label: r ? `${r.homeName} – ${r.awayName}` : label,
    score: r ? (r.homeGoals !== null && r.homeGoals !== undefined ? `${r.homeGoals}-${r.awayGoals}` : null) : score,
    clubs: (clubs ?? (r ? [r.homeId, r.awayId] : [])).filter(Boolean),
    familles,
    aVerifier: Boolean(aVerifier),
    raison: raison ?? texte
  };
}

// ============================================================ les contrôles

/**
 * Les contrôles de l'étape 12 sur la fenêtre, rangés dans ceux de l'étape 14 :
 * la sorte d'anomalie → le contrôle, sa gravité → sa classe.
 */
const DEPUIS_L_ETAPE_12 = {
  'autre-competition': { controle: 'mauvaise-competition', raison: 'Rencontre mal rangée' },
  intitule: { controle: 'mauvaise-competition', raison: 'Rencontre mal rangée' },
  'non-suivie': { controle: 'mauvaise-competition', raison: 'Rencontre mal rangée' },
  'hors-classement': { controle: 'mauvaise-competition', raison: 'Club absent du classement officiel' },
  equipe: { controle: 'chiffres-equipe', familles: ['corners', 'tirs'], raison: 'Statistiques impossibles' },
  joueurs: { controle: 'chiffres-joueurs', aVerifier: false },
  // Données de JOUEURS seulement : rouges et listés dans la carte comme avant, mais le badge n'y vient que sur un marché de joueurs (aucun aujourd'hui).
  gardiens: { controle: 'gardiens-score', familles: ['joueurs'], raison: 'Score à vérifier', precision: 'gardiens et score ne collent pas' },
  buteurs: { controle: 'buteurs-score', familles: ['joueurs'], raison: 'Score à vérifier', precision: 'buteurs et score ne collent pas' },
  'score-fichiers': { controle: 'score-calendrier', raison: 'Score à vérifier' },
  'classement-bilan': { controle: 'classement-officiel', raison: 'Bilan différent du classement officiel' },
  'classement-club': { controle: 'classement-officiel', raison: 'Club du classement officiel sans rencontre au magasin' },
  'classement-matchs': { controle: 'classement-officiel', raison: 'Matchs manquants face au classement officiel' },
  'classement-ecart': { controle: 'classement-officiel', raison: 'Matchs joués à vérifier' },
  'classement-en-trop': { controle: 'classement-officiel', raison: 'Plus de matchs qu’au classement officiel' },
  // Retouche du 12/10/2026 : un match en cours (ou pas encore enregistré) que la table officielle, relevée en direct, compte déjà —
  // une INFORMATION (gravité « info », donc classe « info ») : jamais rouge ni orange, jamais de badge « à vérifier ».
  'classement-en-cours': { controle: 'classement-officiel', raison: 'Match en cours ou pas encore enregistré', aVerifier: false },
  'meme-sens': { controle: 'doublon-meme-sens', raison: 'Rencontre en double' },
  'sens-inverse': { controle: 'doublon-sens-inverse', raison: 'Rencontre en double, dans les deux sens' },
  'meme-identifiant': { controle: 'doublon-meme-identifiant', raison: 'Rencontre en double' },
  'club-deux-fois': { controle: 'club-deux-fois', raison: 'Club deux fois le même jour' },
  'calendrier-fotmob': { controle: 'rencontres-manquantes', raison: 'Match joué absent du magasin' },
  zeros: { controle: 'zeros-non-releves', aVerifier: false },
  'sans-identifiant': { controle: 'joueurs-sans-identifiant', aVerifier: false }
};
const CLASSE_DE_GRAVITE = { erreur: 'rouge', 'a-verifier': 'orange', info: 'info' };

/** Une anomalie de l'étape 12 → un constat de l'étape 14 (même identifiant de fond). */
function depuisAnomalie(a, ctx, clubsEnPlus = null) {
  const regle = DEPUIS_L_ETAPE_12[a.sorte];
  if (!regle) return null;
  const classe = CLASSE_DE_GRAVITE[a.gravite] ?? 'orange';
  // Les clubs : ceux des rencontres touchées, sinon celui d'une ligne de classement.
  const cles = a.matchs?.length ? a.matchs : a.matchKey ? [a.matchKey] : [];
  const clubs = new Set();
  for (const k of cles) {
    const r = ctx.rencontres.get(k);
    if (r?.homeId) clubs.add(r.homeId);
    if (r?.awayId) clubs.add(r.awayId);
  }
  if (a.portee?.club) clubs.add(a.portee.club);
  for (const id of clubsEnPlus ?? []) if (id) clubs.add(id);
  const libelle = a.label ?? 'rencontre';
  const quand = a.date ? ` du ${jourFr(a.date)}` : '';
  const sorte = SORTES[a.sorte]?.libelle ?? a.sorte;
  // La raison courte du badge « à vérifier » : « Score à vérifier : Blackpool – Bromley du 12/09/2026 (buteurs et score ne collent pas) ».
  const qui = String(libelle).replace(/ · classement officiel$/, '');
  const raison = `${regle.raison ?? sorte} : ${qui}${quand}${regle.precision ? ` (${regle.precision})` : ''}`;
  return {
    id: `${regle.controle}:${a.id}`,
    controle: regle.controle,
    classe,
    texte: `${libelle}${quand}${a.score ? ` (${a.score})` : ''} — ${a.detail}`,
    detail: SORTES[a.sorte]?.explication ?? null,
    matchKey: a.matchKey ?? null,
    date: a.date ?? null,
    league: a.league ?? null,
    saison: a.saison ?? null,
    label: libelle,
    score: a.score ?? null,
    clubs: [...clubs],
    familles: regle.familles ?? ['tout'],
    aVerifier: (regle.aVerifier ?? true) && classe === 'rouge',
    raison
  };
}

/** Les lectures se font par tranches de rencontres, en rendant la main entre deux. */
const TRANCHE = 250;

/** Les rencontres de la fenêtre (clés par l'index des dates), lues une fois, par tranches. */
async function lireLaFenetre(ctx) {
  const { database, du, au } = ctx;
  const cles = database.prepare('SELECT match_key FROM matches WHERE date >= ? AND date <= ?').all(du, au).map((r) => r.match_key);
  const rencontres = new Map();
  const stats = new Map();
  const joueurs = new Map();
  const impossibles = new Map();
  for (const tranche of lots(cles, TRANCHE)) {
    for (const [k, v] of lireRencontres(database, { cles: tranche })) rencontres.set(k, v);
    for (const [k, v] of lireStatsEquipes(database, tranche)) stats.set(k, v);
    for (const [k, v] of lireLignesJoueurs(database, tranche)) joueurs.set(k, v);
    for (const [k, v] of lireJoueursImpossibles(database, tranche)) impossibles.set(k, v);
    await ctx.pause('lecture de la fenêtre');
  }
  ctx.premiereDate = database.prepare('SELECT MIN(date) AS d FROM matches').get().d ?? null;
  Object.assign(ctx, { cles, rencontres, stats, joueurs, impossibles });
}

/** Les contrôles d'une rencontre (étape 12) sur chaque rencontre de la fenêtre. */
function controlesParRencontre(ctx) {
  const out = [];
  for (const r of ctx.rencontres.values()) {
    for (const a of controlesDeRencontre(r, ctx.stats.get(r.matchKey) ?? null, ctx.joueurs.get(r.matchKey) ?? null, ctx.impossibles.get(r.matchKey) ?? null)) {
      const c = depuisAnomalie(a, ctx);
      if (c) out.push(c);
    }
  }
  return out;
}

/** Doublons et club deux fois le même jour, en mémoire : un doublon a le même jour, donc ses deux copies sont dans la fenêtre. */
function doublons(ctx) {
  return controlesDoublons(ctx.database, ctx.rencontres, null)
    .map((a) => depuisAnomalie(a, ctx))
    .filter(Boolean);
}

/** L'audit des scores (étape 12, scoreAudit.js) sur la fenêtre : gardiens et buteurs, par tranches. */
async function audit(ctx) {
  const out = [];
  for (const tranche of lots(ctx.cles, TRANCHE)) {
    for (const a of controlesAudit(ctx.database, { cles: tranche, rencontres: ctx.rencontres }).anomalies) {
      const c = depuisAnomalie(a, ctx);
      if (c) out.push(c);
    }
    await ctx.pause('audit des scores');
  }
  return out;
}

/**
 * Le classement officiel des saisons de la fenêtre (étape 12, standingsCheck.js), un championnat à la fois en rendant la main.
 * `ctx.enCours` (retouche du 12/10/2026) : les matchs en cours du calendrier ; l'écart qu'ils expliquent est une information.
 */
async function classements(ctx) {
  const parLigue = new Map();
  for (const r of ctx.rencontres.values()) {
    if (!hasStandings(r.league)) continue;
    if (!parLigue.has(r.league)) parLigue.set(r.league, new Set());
    parLigue.get(r.league).add(cleLigueSaison(r.league, r.season));
  }
  const out = [];
  for (const league of [...parLigue.keys()].sort((a, b) => a.localeCompare(b, 'fr'))) {
    for (const a of controlesClassements(ctx.database, parLigue.get(league), { leagues: [league], enCours: ctx.enCours ?? null }).anomalies) {
      const c = depuisAnomalie(a, ctx);
      if (c) out.push(c);
    }
    await ctx.pause(`classement ${league}`);
  }
  return out;
}

/** Les matchs joués que la page de la compétition connaît et que le magasin n'a toujours pas (rapport de l'étape « omissions » de la passe). */
function manquants(ctx) {
  if (!ctx.omissions) return null;
  const parId = new Map((ctx.omissions.missing ?? []).map((m) => [String(m.matchId), m]));
  return manquantsFotmob(ctx.database, ctx.omissions, { premiereDate: ctx.premiereDate })
    .anomalies.map((a) => {
      const m = parId.get(String(a.portee?.fotmob ?? ''));
      return depuisAnomalie(a, ctx, m ? [m.homeId, m.awayId] : null);
    })
    .filter(Boolean);
}

/** Les buts du déroulé d'une rencontre : [{ side, minute }]. */
function butsDuDeroule(events) {
  const liste = parse(events);
  return Array.isArray(liste) ? liste.filter((e) => e?.type === 'goal').map((e) => ({ side: e.side, minute: e.minute })) : null;
}

/**
 * Les scores face à football-data : la liste des écarts gardée par l'étape 13
 * (résumé de l'historique, sans refaire le rattachement), plus les matchs
 * football-data de la fenêtre dont le score n'est plus celui du magasin. Le
 * score du magasin est relu MAINTENANT : un écart corrigé depuis disparaît,
 * un score changé depuis le rattachement apparaît.
 */
function scoresFootballData(ctx) {
  const { database, du } = ctx;
  const candidats = new Map();
  let resume = null;
  try {
    resume = lireResume({ database });
  } catch {
    resume = null;
  }
  for (const e of resume?.ecarts?.liste ?? []) {
    const m = String(e.scoreFootballData ?? '').match(/^(\d+)-(\d+)$/);
    if (e.matchKey && m) candidats.set(e.matchKey, { fd: [Number(m[1]), Number(m[2])], code: e.code, saison: e.saison, noms: `${e.dom} – ${e.ext}`, origine: 'liste de l’étape 13' });
  }
  let fenetre = 0;
  let sansHistorique = !resume;
  try {
    const codes = database.prepare('SELECT DISTINCT code FROM fd_fichiers').all().map((r) => r.code);
    if (codes.length) sansHistorique = false;
    const lire = database.prepare(
      `SELECT h.code, h.saison, h.bd, h.be, h.match_key, td.nom AS dom, te.nom AS ext FROM fd_history h
       JOIN fd_teams td ON td.id = h.dom JOIN fd_teams te ON te.id = h.ext JOIN matches m ON m.match_key = h.match_key
       WHERE h.code = ? AND h.date >= ? AND h.match_key IS NOT NULL AND (h.bd IS NOT m.home_goals OR h.be IS NOT m.away_goals)`
    );
    const compter = database.prepare('SELECT COUNT(*) AS n FROM fd_history WHERE code = ? AND date >= ? AND match_key IS NOT NULL');
    for (const code of codes) {
      fenetre += compter.get(code, du).n;
      for (const l of lire.all(code, du)) {
        if (!candidats.has(l.match_key)) candidats.set(l.match_key, { fd: [l.bd, l.be], code: l.code, saison: l.saison, noms: `${l.dom} – ${l.ext}`, origine: 'fenêtre des 30 jours' });
      }
    }
  } catch (error) {
    if (!/no such table/i.test(error.message)) throw error;
    sansHistorique = true;
  }
  const lireMatch = database.prepare('SELECT match_key, date, league, home_name, away_name, home_id, away_id, home_goals, away_goals, meta, events FROM matches WHERE match_key = ?');
  const non = [];
  const oui = [];
  for (const [cle, c] of candidats) {
    const m = lireMatch.get(cle);
    if (!m || m.home_goals === null || m.away_goals === null) continue;
    if (m.home_goals === c.fd[0] && m.away_goals === c.fd[1]) continue;
    const r = { matchKey: m.match_key, date: m.date, league: m.league, season: seasonOf(m.league, m.date), homeName: m.home_name, awayName: m.away_name, homeId: m.home_id, awayId: m.away_id, homeGoals: m.home_goals, awayGoals: m.away_goals };
    const e = expliquerEcart({ fd: c.fd, magasin: [m.home_goals, m.away_goals], meta: parse(m.meta), buts: butsDuDeroule(m.events) });
    const deux = `FotMob ${m.home_goals}-${m.away_goals}, football-data ${c.fd[0]}-${c.fd[1]}`;
    if (e.explique) {
      oui.push(constat({ controle: 'score-football-data-explique', cle, classe: 'info', r, texte: `${r.homeName} – ${r.awayName} du ${jourFr(r.date)} (${deux}) : ${e.texte}.`, detail: `football-data ${c.code} ${c.saison} (${c.noms})`, sorte: e.cle, aVerifier: false }));
    } else {
      non.push(
        constat({
          controle: 'score-football-data',
          cle,
          classe: 'rouge',
          r,
          texte: `${r.homeName} – ${r.awayName} du ${jourFr(r.date)} : ${deux} — ${e.texte}.`,
          detail: `${c.code} ${c.saison} (${c.noms}) ; trouvé dans la ${c.origine}`,
          raison: `Score à vérifier : ${r.homeName} – ${r.awayName} du ${jourFr(r.date)} (${deux})`
        })
      );
    }
  }
  return { non, oui, compte: { candidats: candidats.size, fenetre, listeEtape13: resume?.ecarts?.total ?? null, sansHistorique } };
}

/** Les zéros « non relevé » par championnat : jaunes, corners, tirs à 0 des deux côtés dans la plupart des matchs. */
function nonRelevesParChampionnat(ctx) {
  const parLigue = new Map();
  for (const r of ctx.rencontres.values()) {
    if (r.homeGoals === null || r.homeGoals === undefined || HORS_JEU.test(String(r.reason ?? ''))) continue;
    const s = ctx.stats.get(r.matchKey);
    if (!s?.home || !s?.away) continue;
    let l = parLigue.get(r.league);
    if (!l) parLigue.set(r.league, (l = { n: 0, depuis: r.date, jaunes: [], corners: 0, tirs: 0, rouges: 0 }));
    l.n++;
    if (r.date < l.depuis) l.depuis = r.date;
    const zero = (cle) => s.home[COL[cle]] === 0 && s.away[COL[cle]] === 0;
    if (zero('Yellow Cards')) {
      l.jaunes.push(r.matchKey);
      if ((s.home[COL['Red Cards']] ?? 0) + (s.away[COL['Red Cards']] ?? 0) > 0) l.rouges++;
    }
    if (zero('Corner Kicks')) l.corners++;
    if (zero('Total Shots')) l.tirs++;
  }
  // Les jaunes du DÉROULÉ des matchs « à 0 » des championnats signalés : la contradiction qui prouve le « non relevé ».
  const deroule = ctx.database.prepare(
    `SELECT COUNT(*) AS n FROM matches m, json_each(m.events) e WHERE m.match_key IN (SELECT value FROM json_each(?))
     AND json_extract(e.value, '$.type') = 'card' AND json_extract(e.value, '$.card') = 'yellow'`
  );
  const out = { jaunes: [], corners: [], tirs: [] };
  for (const [league, l] of parLigue) {
    const assez = (k) => l.n >= MINIMUM_NON_RELEVE && k >= MINIMUM_NON_RELEVE && k / l.n >= PART_NON_RELEVE;
    if (assez(l.jaunes.length)) {
      const auDeroule = deroule.get(JSON.stringify(l.jaunes)).n;
      out.jaunes.push(
        constat({
          controle: 'jaunes-non-releves',
          cle: league,
          classe: 'orange',
          league,
          date: l.depuis,
          label: league,
          familles: ['cartons'],
          texte: `${league} : cartons jaunes publiés à 0 des deux côtés dans ${nombre(l.jaunes.length)} matchs sur ${nombre(l.n)} depuis le ${jourFr(l.depuis)}${l.rouges ? ` (rouges relevés dans ${nombre(l.rouges)})` : ''} ; le déroulé de ces matchs en compte ${decimal(auDeroule / l.jaunes.length, 1)} par match — non relevés par FotMob.`,
          detail: 'Un 0 des deux côtés veut dire « non relevé » (étapes 12 et 15) : ces matchs sont écartés des repères ; aucune donnée n’est corrigée.',
          raison: `Cartons jaunes non relevés par FotMob en ${league} depuis le ${jourFr(l.depuis)}`
        })
      );
    }
    for (const [cle, k, controle, mot, famille] of [
      ['corners', l.corners, 'corners-non-releves', 'corners', 'corners'],
      ['tirs', l.tirs, 'tirs-non-releves', 'tirs', 'tirs']
    ]) {
      if (!assez(k)) continue;
      out[cle].push(
        constat({
          controle,
          cle: league,
          classe: 'orange',
          league,
          date: l.depuis,
          label: league,
          familles: [famille],
          texte: `${league} : ${mot} publiés à 0 des deux côtés dans ${nombre(k)} matchs sur ${nombre(l.n)} depuis le ${jourFr(l.depuis)} — non relevés par FotMob (le moteur écarte ces matchs de ses moyennes).`,
          raison: `${mot.charAt(0).toUpperCase()}${mot.slice(1)} non relevés par FotMob en ${league} depuis le ${jourFr(l.depuis)}`
        })
      );
    }
  }
  return out;
}

/** Scores impossibles dans le temps : un score pour un match à venir, pas de score pour un match passé. */
function scoresDansLeTemps(ctx) {
  const { database, maintenant, du } = ctx;
  const demain = iso(maintenant + JOUR_MS);
  const hier = iso(maintenant - JOUR_MS);
  const ligne = (m) => ({ matchKey: m.match_key, date: m.date, league: m.league, season: seasonOf(m.league, m.date), homeName: m.home_name, awayName: m.away_name, homeId: m.home_id, awayId: m.away_id, homeGoals: m.home_goals, awayGoals: m.away_goals });
  const futurs = database
    .prepare('SELECT match_key, date, league, home_name, away_name, home_id, away_id, home_goals, away_goals FROM matches WHERE date > ? AND home_goals IS NOT NULL ORDER BY date LIMIT 200')
    .all(demain)
    .map((m) =>
      constat({ controle: 'score-futur', cle: m.match_key, classe: 'rouge', r: ligne(m), texte: `${m.home_name} – ${m.away_name}, daté du ${jourFr(m.date)}, a déjà un score (${m.home_goals}-${m.away_goals}) : date ou score faux.`, raison: `Score à vérifier : ${m.home_name} – ${m.away_name} du ${jourFr(m.date)}` })
    );
  // Les rencontres de la fenêtre sont déjà lues : sans elles (lecture en échec), une requête sur l'index des dates.
  const passees = ctx.rencontres?.size
    ? [...ctx.rencontres.values()]
        .filter((r) => r.date >= du && r.date < hier && (r.homeGoals === null || r.homeGoals === undefined || r.awayGoals === null || r.awayGoals === undefined))
        .map((r) => ({ match_key: r.matchKey, date: r.date, league: r.league, home_name: r.homeName, away_name: r.awayName, home_id: r.homeId, away_id: r.awayId, home_goals: r.homeGoals, away_goals: r.awayGoals, reason: r.reason }))
    : database
        .prepare(
          `SELECT match_key, date, league, home_name, away_name, home_id, away_id, home_goals, away_goals, json_extract(meta, '$.reason') AS reason FROM matches
           WHERE date >= ? AND date < ? AND (home_goals IS NULL OR away_goals IS NULL) ORDER BY date LIMIT 400`
        )
        .all(du, hier);
  const absents = passees
    .filter((m) => !HORS_JEU.test(String(m.reason ?? '')))
    .map((m) =>
      constat({ controle: 'score-absent', cle: m.match_key, classe: 'orange', r: ligne(m), texte: `${m.home_name} – ${m.away_name} du ${jourFr(m.date)} n’a pas de score au magasin (ni reporté ni annulé).`, raison: `Match sans score au magasin : ${m.home_name} – ${m.away_name} du ${jourFr(m.date)}` })
    );
  return { futurs, absents };
}

/** Clubs et rencontres sans identifiant FotMob, dans la fenêtre. */
function identifiants(ctx) {
  const clubs = [];
  const rencontres = [];
  for (const r of ctx.rencontres.values()) {
    if (!r.homeId || !r.awayId) {
      const qui = [!r.homeId ? r.homeName : null, !r.awayId ? r.awayName : null].filter(Boolean).join(' et ');
      clubs.push(constat({ controle: 'clubs-sans-identifiant', cle: r.matchKey, classe: 'orange', r, aVerifier: false, texte: `${r.homeName} – ${r.awayName} du ${jourFr(r.date)} : ${qui} sans identifiant FotMob.` }));
    }
    if (!r.fotmobId || r.fotmobId === '0') {
      rencontres.push(constat({ controle: 'rencontres-sans-identifiant', cle: r.matchKey, classe: 'orange', r, aVerifier: false, texte: `${r.homeName} – ${r.awayName} du ${jourFr(r.date)} : pas d’identifiant de rencontre FotMob.` }));
    }
  }
  return { clubs, rencontres };
}

/** Feuilles en retard (match joué depuis plus d'un jour, sans statistiques ni « sans feuille ») et fraîcheur du magasin. */
function completude(ctx) {
  const { database, maintenant } = ctx;
  const avantHier = iso(maintenant - 3 * JOUR_MS);
  const hier = iso(maintenant - JOUR_MS);
  const retards = [];
  for (const r of ctx.rencontres.values()) {
    if (r.date < avantHier || r.date >= hier) continue;
    if (r.homeGoals === null || r.homeGoals === undefined || HORS_JEU.test(String(r.reason ?? '')) || r.awarded) continue;
    if (ctx.stats.has(r.matchKey) || r.noSheet) continue;
    retards.push(constat({ controle: 'feuilles-en-retard', cle: r.matchKey, classe: 'orange', r, aVerifier: false, texte: `${r.homeName} – ${r.awayName} du ${jourFr(r.date)} (${r.homeGoals}-${r.awayGoals}) : pas encore de statistiques, ni « sans feuille » chez la source.` }));
  }
  const recent = database.prepare('SELECT MAX(updated_at) AS u, COUNT(*) AS n FROM matches WHERE date >= ?').get(avantHier);
  const derniere = recent?.u ?? database.prepare('SELECT MAX(date) AS d FROM matches').get()?.d ?? null;
  const age = derniere ? maintenant - Date.parse(derniere) : Infinity;
  const magasin =
    age > MAGASIN_HEURES * 3_600_000
      ? [
          constat({
            controle: 'magasin-a-jour',
            cle: 'magasin',
            classe: 'orange',
            label: 'Magasin',
            date: derniere ? String(derniere).slice(0, 10) : null,
            texte: derniere ? `Le magasin n’a rien reçu depuis le ${jourFr(derniere)} (plus de ${MAGASIN_HEURES} h) : actualisation arrêtée, ou FotMob muet ?` : 'Le magasin est vide.',
            raison: derniere ? `Le magasin n’a rien reçu depuis le ${jourFr(derniere)} : résultats récents peut-être manquants` : 'Magasin vide'
          })
        ]
      : [];
  return { retards, magasin, derniereMiseAJour: recent?.u ?? null };
}

/** Les attendus d'un championnat et d'une saison (étape 15), gardés le temps du contrôle. */
function attendus(ctx, league, saison) {
  const cle = `${league}|${saison}`;
  if (!ctx.attendus.has(cle)) {
    let v = null;
    try {
      v = valeursAttendues(league, seasonLabel(league, saison), { database: ctx.database });
    } catch (error) {
      v = { etat: 'erreur', erreur: error.message, reperes: {} };
    }
    ctx.attendus.set(cle, v);
  }
  return ctx.attendus.get(cle);
}

const REPERES_DU_CONTROLE = {
  'hors-reperes-buts': ['buts', 'nuls', 'plus_2_5', 'deux_marquent', 'avantage_terrain'],
  'hors-reperes-statistiques': ['corners', 'tirs', 'tirs_cadres'],
  'hors-reperes-cartons': ['cartons_jaunes', 'cartons_rouges']
};
const LIBELLES_REPERES = {
  buts: ['buts par match', 2],
  nuls: ['nuls', 'part'],
  plus_2_5: ['plus de 2,5 buts', 'part'],
  deux_marquent: ['« les deux marquent »', 'part'],
  avantage_terrain: ['avantage du terrain (buts)', 2],
  corners: ['corners par match', 1],
  tirs: ['tirs par match', 1],
  tirs_cadres: ['tirs cadrés par match', 1],
  cartons_jaunes: ['cartons jaunes par match', 1],
  cartons_rouges: ['cartons rouges par match', 2]
};
const valeurDuRepere = (cle, x) => (LIBELLES_REPERES[cle][1] === 'part' ? `${decimal(100 * x, 0)} %` : decimal(x, LIBELLES_REPERES[cle][1]));

/**
 * Hors repères (étape 15) : la saison EN COURS de chaque championnat de la
 * fenêtre face à sa valeur attendue (les cinq saisons les plus proches,
 * ramenées vers la moyenne des championnats), en écarts normaux. Au plus
 * orange : « à regarder », le jeu évolue.
 */
function horsReperes(ctx) {
  const out = { 'hors-reperes-buts': [], 'hors-reperes-statistiques': [], 'hors-reperes-cartons': [] };
  const ligues = [...new Set([...ctx.rencontres.values()].map((r) => r.league))].filter((l) => !isCup(l)).sort((a, b) => a.localeCompare(b, 'fr'));
  let calcules = 0;
  for (const league of ligues) {
    const saison = seasonOf(league, iso(ctx.maintenant));
    const v = attendus(ctx, league, saison);
    if (v?.etat !== 'pret') continue;
    calcules++;
    for (const [controle, cles] of Object.entries(REPERES_DU_CONTROLE)) {
      for (const cle of cles) {
        const x = v.reperes?.[cle];
        if (!x || x.ecarts === null || x.ecarts === undefined || !Number.isFinite(x.ecarts) || (x.matchs ?? 0) < MINIMUM_MATCHS_REPERES) continue;
        if (Math.abs(x.ecarts) < SEUIL_HORS_REPERES) continue;
        out[controle].push(
          constat({
            controle,
            cle: `${league}|${v.saison}|${cle}`,
            classe: 'orange',
            league,
            saison: v.saison,
            label: league,
            aVerifier: false,
            texte: `${league} ${v.saison} : ${LIBELLES_REPERES[cle][0]} ${valeurDuRepere(cle, x.valeur)}, attendu ${valeurDuRepere(cle, x.attendu)} (${signe(x.ecarts)} écarts normaux, sur ${pluriel(x.matchs, 'match', 'matchs')}) — à regarder : le jeu évolue.`,
            detail: `attendu sur ${(x.base?.saisons ?? []).join(', ') || 'la moyenne des championnats'} (${nombre(x.base?.matchs ?? 0)} matchs), source ${v.source ?? 'inconnue'}`
          })
        );
      }
    }
  }
  return { ...out, championnats: ligues.length, calcules };
}

/** Un match hors norme : buts, corners ou tirs à plus de 5 écarts-types d'un match au-dessus de l'attendu de son championnat. */
function matchsAberrants(ctx) {
  const out = [];
  for (const r of ctx.rencontres.values()) {
    if (isCup(r.league) || r.homeGoals === null || r.homeGoals === undefined) continue;
    const v = attendus(ctx, r.league, r.season);
    if (v?.etat !== 'pret') continue;
    const s = ctx.stats.get(r.matchKey);
    const paire = (cle) => {
      const a = s?.home?.[COL[cle]];
      const b = s?.away?.[COL[cle]];
      return a === null || a === undefined || b === null || b === undefined || (a === 0 && b === 0) ? null : a + b;
    };
    for (const [cle, valeur, mot, famille] of [
      ['buts', r.homeGoals + r.awayGoals, 'buts', 'buts'],
      ['corners', paire('Corner Kicks'), 'corners', 'corners'],
      ['tirs', paire('Total Shots'), 'tirs', 'tirs']
    ]) {
      const x = v.reperes?.[cle];
      if (valeur === null || !x?.ecartMatch || x.attendu === null || x.attendu === undefined) continue;
      const z = (valeur - x.attendu) / x.ecartMatch;
      if (z < ECARTS_MATCH_ABERRANT) continue;
      out.push(
        constat({
          controle: 'match-aberrant',
          cle: `${r.matchKey}|${cle}`,
          classe: 'orange',
          r,
          familles: [famille],
          texte: `${r.homeName} – ${r.awayName} du ${jourFr(r.date)} : ${nombre(valeur)} ${mot}, pour ${decimal(x.attendu, 1)} attendus par match en ${r.league} (${signe(z)} écarts-types) — vrai match fou, ou chiffre faux ?`,
          raison: `Match hors norme : ${r.homeName} – ${r.awayName} du ${jourFr(r.date)} (${nombre(valeur)} ${mot})`
        })
      );
    }
  }
  return out;
}

/** Le score du magasin face au calendrier et aux résultats : le dernier contrôle des scores de l'actualisation (étape « controle »), repris tel quel. */
function scoresDesFichiers(ctx) {
  const a = ctx.alertes?.audit ?? null;
  if (!a) return { constats: [], le: null };
  const fichiers = (a.samples ?? []).filter((s) => s.kind === 'fichiers');
  return {
    le: a.updatedAt ?? null,
    total: a.parType?.fichiers ?? fichiers.length,
    constats: fichiers.map((s) => constat({ controle: 'score-calendrier', cle: s.label, classe: 'rouge', label: s.label, date: String(s.label ?? '').slice(0, 10), aVerifier: false, texte: `${s.label} : ${s.detail}.` }))
  };
}

/** Les sources (sourceHealth.js) : un contrôle par source, à sa couleur du moment. */
export function controlesDesSources(sources) {
  const parCle = new Map((sources?.sources ?? []).map((s) => [s.cle, s]));
  const CORRESPONDANCE = { 'source-fotmob': 'fotmob', 'source-football-data': 'football-data', 'source-odds-api': 'odds-api', 'source-api-football': 'api-football', 'source-claude': 'claude', 'source-cotes-gratuites': 'cotes-gratuites' };
  return Object.entries(CORRESPONDANCE).map(([cle, source]) => {
    const def = PAR_CLE.get(cle);
    const s = parCle.get(source);
    // La couleur d'une source ne dépasse jamais la classe de son contrôle.
    const couleur = !s ? 'non-fait' : s.couleur === 'gris' ? 'vert' : s.couleur === 'rouge' && def.classe !== 'rouge' ? 'orange' : s.couleur;
    return {
      ...def,
      statut: s ? 'fait' : 'non-fait',
      statutDirect: s ? couleur : null,
      raisonNonFait: s ? null : 'santé des sources non lue',
      constat: s ? `${s.libelleEtat} — ${s.resume}` : 'Santé des sources non lue.',
      etatSource: s?.etat ?? null,
      constats: [],
      total: 0,
      parClasse: { rouge: 0, orange: 0, info: 0 },
      dureeMs: 0
    };
  });
}

// ============================================================ l'orchestration

/**
 * La phrase d'un contrôle, selon ce qu'il a trouvé. Les INFORMATIONS rangées
 * dans un contrôle qui peut être rouge (retouche du 12/10/2026 : « match en
 * cours ou pas encore enregistré », au classement officiel) sont dites à part,
 * après ce qu'il y a à regarder, et jamais comptées comme des constats.
 */
function phraseDuControle(def, constats, enPlus = '') {
  const infos = def.classe === 'info' ? [] : constats.filter((c) => c.classe === 'info');
  if (!infos.length) return phraseSansInformation(def, constats, enPlus);
  const aRegarder = constats.filter((c) => c.classe !== 'info');
  const debut = phraseSansInformation(def, aRegarder, '').replace(/\.$/, '');
  const quoi =
    def.cle === 'classement-officiel'
      ? `${pluriel(infos.length, 'club compte', 'clubs comptent')} au classement officiel un match en cours ou pas encore enregistré (une information, rien à corriger)`
      : `${pluriel(infos.length, 'information', 'informations')}, rien à corriger`;
  return `${debut} ; ${quoi} — par exemple : ${infos[0].texte}${enPlus}`;
}

function phraseSansInformation(def, constats, enPlus = '') {
  const n = constats.length;
  if (!n) {
    const calme = {
      'score-football-data': 'Aucun score différent de football-data sans explication.',
      'score-football-data-explique': 'Aucun écart de score avec football-data.',
      'magasin-a-jour': 'Le magasin a reçu des rencontres dans les dernières heures.',
      'joueurs-sans-identifiant': 'Aucun joueur sans identifiant FotMob dans la fenêtre.'
    };
    return `${calme[def.cle] ?? 'Rien à signaler.'}${enPlus}`;
  }
  if (def.cle === 'score-football-data-explique') {
    const par = { prolongation: 0, 'tirs-au-but': 0, attribue: 0 };
    for (const c of constats) par[c.sorte] = (par[c.sorte] ?? 0) + 1;
    const morceaux = [
      par.prolongation ? pluriel(par.prolongation, 'prolongation', 'prolongations') : null,
      par['tirs-au-but'] ? pluriel(par['tirs-au-but'], 'séance de tirs au but', 'séances de tirs au but') : null,
      par.attribue ? pluriel(par.attribue, 'résultat attribué', 'résultats attribués') : null
    ].filter(Boolean);
    return `${pluriel(n, 'écart expliqué', 'écarts expliqués')} (${morceaux.join(', ')}) : une information, rien à corriger.${enPlus}`;
  }
  const premier = constats[0].texte;
  if (def.classe === 'info') return `${pluriel(n, 'constat', 'constats')} — une information, rien à corriger ; par exemple : ${premier}${enPlus}`;
  return `${pluriel(n, 'constat', 'constats')}${n > 1 ? `, dont : ${premier}` : ` : ${premier}`}${enPlus}`;
}

/**
 * LE CONTRÔLE QUOTIDIEN. `precedent` : l'état gardé de la passe d'avant (les
 * dates de découverte) ; `omissions` : le rapport de l'étape « omissions » de
 * la même passe ; `alertes` : les alertes de l'actualisation (le dernier
 * contrôle des scores) ; `sources` : etatDesSources() ; `enCours` : les matchs
 * en cours du calendrier (standingsCheck.matchsEnCoursDuCalendrier, retouche du
 * 12/10/2026 — l'écart de « joués » qu'ils expliquent au classement officiel est
 * une information, jamais du rouge ni de l'orange). Rend l'état à garder.
 * N'écrit RIEN : ni dans la base (lecture seule), ni ailleurs.
 */
export async function lancerControleQuotidien({
  database,
  maintenant = new Date(),
  precedent = null,
  omissions = null,
  alertes = null,
  sources = null,
  enCours = null,
  fenetreJours = FENETRE_JOURS,
  rendreLaMain = () => new Promise((fin) => setImmediate(fin)),
  journal = null
} = {}) {
  const debut = chrono();
  const t = new Date(maintenant).getTime();
  const maintenantIso = new Date(t).toISOString();
  let dernierePause = chrono();
  let blocMax = { ms: 0, ou: null };
  let pauses = 0;
  const pause = async (ou) => {
    const ms = chrono() - dernierePause;
    if (ms > blocMax.ms) blocMax = { ms, ou };
    pauses++;
    await rendreLaMain();
    dernierePause = chrono();
  };
  const ctx = { database, maintenant: t, du: iso(t - fenetreJours * JOUR_MS), au: iso(t), omissions, alertes, enCours, pause, attendus: new Map() };

  const trouves = new Map(CONTROLES.map((c) => [c.cle, []]));
  const statuts = new Map();
  const temps = {};
  const notes = {};
  const ranger = (liste) => {
    for (const c of liste ?? []) if (c && trouves.has(c.controle)) trouves.get(c.controle).push(c);
  };
  const etape = async (nom, cles, f) => {
    const d = chrono();
    try {
      await f();
    } catch (error) {
      journal?.(`[contrôle quotidien] ${nom} en échec : ${error.message}`);
      for (const k of cles) statuts.set(k, { statut: 'erreur', raison: String(error.message).slice(0, 300) });
    }
    temps[nom] = Math.round(chrono() - d);
    await pause(nom);
  };

  // Les contrôles qui lisent la fenêtre : si elle ne se lit pas, ils sont « en panne », jamais « rien à signaler ».
  const SUR_LA_FENETRE = [
    'mauvaise-competition', 'chiffres-equipe', 'chiffres-joueurs', 'zeros-non-releves', 'joueurs-sans-identifiant', 'doublon-meme-sens', 'doublon-sens-inverse',
    'doublon-meme-identifiant', 'club-deux-fois', 'buteurs-score', 'gardiens-score', 'clubs-sans-identifiant', 'rencontres-sans-identifiant',
    'classement-officiel', 'jaunes-non-releves', 'corners-non-releves', 'tirs-non-releves', 'rencontres-manquantes', 'feuilles-en-retard',
    'hors-reperes-buts', 'hors-reperes-statistiques', 'hors-reperes-cartons', 'match-aberrant'
  ];
  await etape('fenêtre', SUR_LA_FENETRE, () => lireLaFenetre(ctx));
  const fenetreLue = Boolean(ctx.rencontres);
  const surFenetre = async (nom, cles, f) => (fenetreLue ? etape(nom, cles, f) : undefined);
  if (!fenetreLue) {
    ctx.rencontres = new Map();
    ctx.stats = new Map();
    ctx.joueurs = new Map();
    ctx.impossibles = new Map();
    ctx.cles = [];
  }
  await surFenetre('contrôles par rencontre', ['mauvaise-competition', 'chiffres-equipe', 'chiffres-joueurs', 'zeros-non-releves', 'joueurs-sans-identifiant'], () => ranger(controlesParRencontre(ctx)));
  await surFenetre('doublons', ['doublon-meme-sens', 'doublon-sens-inverse', 'doublon-meme-identifiant', 'club-deux-fois'], () => ranger(doublons(ctx)));
  await surFenetre('audit des scores', ['buteurs-score', 'gardiens-score'], async () => ranger(await audit(ctx)));
  await etape('scores face à football-data', ['score-football-data', 'score-football-data-explique'], () => {
    const r = scoresFootballData(ctx);
    ranger(r.non);
    ranger(r.oui);
    notes.footballData = r.compte;
    if (r.compte.sansHistorique && !r.compte.candidats) {
      for (const k of ['score-football-data', 'score-football-data-explique']) statuts.set(k, { statut: 'non-fait', raison: 'historique football-data pas encore importé (étape 13)' });
    }
  });
  await etape('scores des fichiers', ['score-calendrier'], () => {
    const r = scoresDesFichiers(ctx);
    ranger(r.constats);
    notes.scoresFichiers = { le: r.le, total: r.total ?? 0 };
    if (!ctx.alertes) statuts.set('score-calendrier', { statut: 'non-fait', raison: 'alertes de l’actualisation non lues' });
  });
  await etape('scores dans le temps', ['score-futur', 'score-absent'], () => {
    const r = scoresDansLeTemps(ctx);
    ranger(r.futurs);
    ranger(r.absents);
  });
  await surFenetre('identifiants', ['clubs-sans-identifiant', 'rencontres-sans-identifiant'], () => {
    const r = identifiants(ctx);
    ranger(r.clubs);
    ranger(r.rencontres);
  });
  await surFenetre('classements officiels', ['classement-officiel'], async () => ranger(await classements(ctx)));
  await surFenetre('zéros non relevés', ['jaunes-non-releves', 'corners-non-releves', 'tirs-non-releves'], () => {
    const r = nonRelevesParChampionnat(ctx);
    ranger(r.jaunes);
    ranger(r.corners);
    ranger(r.tirs);
  });
  await surFenetre('matchs manquants', ['rencontres-manquantes'], () => {
    const r = manquants(ctx);
    if (r === null) statuts.set('rencontres-manquantes', { statut: 'non-fait', raison: 'pas de rapport de l’étape « omissions » à cette passe' });
    else ranger(r);
  });
  await etape('complétude', ['feuilles-en-retard', 'magasin-a-jour'], () => {
    const r = completude(ctx);
    ranger(r.retards);
    ranger(r.magasin);
    notes.derniereMiseAJour = r.derniereMiseAJour;
  });
  await surFenetre('hors repères', ['hors-reperes-buts', 'hors-reperes-statistiques', 'hors-reperes-cartons'], () => {
    const r = horsReperes(ctx);
    ranger(r['hors-reperes-buts']);
    ranger(r['hors-reperes-statistiques']);
    ranger(r['hors-reperes-cartons']);
    notes.reperes = { championnats: r.championnats, calcules: r.calcules };
    if (r.championnats && !r.calcules) {
      for (const k of ['hors-reperes-buts', 'hors-reperes-statistiques', 'hors-reperes-cartons']) statuts.set(k, { statut: 'non-fait', raison: 'repères pas encore calculés (étape 15)' });
    }
  });
  await surFenetre('matchs hors norme', ['match-aberrant'], () => {
    ranger(matchsAberrants(ctx));
    if (notes.reperes?.championnats && !notes.reperes.calcules) statuts.set('match-aberrant', { statut: 'non-fait', raison: 'repères pas encore calculés (étape 15)' });
  });

  // Les dates de découverte, gardées d'une passe à l'autre.
  const vusAvant = precedent?.version === VERSION_CONTROLE ? precedent.vus ?? {} : {};
  const vus = {};
  const controles = [];
  for (const def of CONTROLES) {
    if (def.famille === 'sources') continue;
    const tous = trouves.get(def.cle);
    for (const c of tous) {
      c.trouveLe = vusAvant[c.id] ?? maintenantIso;
      vus[c.id] = c.trouveLe;
    }
    const tries = [...tous].sort((a, b) => (a.classe === b.classe ? String(b.date ?? '').localeCompare(String(a.date ?? '')) : a.classe === 'rouge' ? -1 : b.classe === 'rouge' ? 1 : 0));
    const gardes = [...tries.filter((c) => c.classe === 'rouge'), ...tries.filter((c) => c.classe !== 'rouge').slice(0, CONSTATS_GARDES)];
    const parClasse = { rouge: 0, orange: 0, info: 0 };
    for (const c of tous) parClasse[c.classe] = (parClasse[c.classe] ?? 0) + 1;
    const force = statuts.get(def.cle);
    const enPlus = def.cle === 'score-calendrier' && notes.scoresFichiers?.le ? ` (dernier contrôle des scores le ${jourFr(notes.scoresFichiers.le)})` : '';
    const ligne = {
      ...def,
      statut: force?.statut ?? 'fait',
      raisonNonFait: force?.raison ?? null,
      constat: force ? (force.statut === 'erreur' ? `Contrôle en panne : ${force.raison}` : `Pas fait : ${force.raison}.`) : phraseDuControle(def, tries, enPlus),
      constats: gardes,
      total: tous.length,
      parClasse
    };
    ligne.statutLe = statutDuControle(ligne, t);
    controles.push(ligne);
  }
  for (const s of controlesDesSources(sources)) controles.push({ ...s, statutLe: statutDuControle(s, t) });
  const ordre = new Map(CONTROLES.map((c, i) => [c.cle, i]));
  controles.sort((a, b) => ordre.get(a.cle) - ordre.get(b.cle));

  // L'index « à vérifier » : par club (identifiant FotMob), par championnat, et pour tout.
  const aVerifier = { clubs: {}, ligues: {}, global: [] };
  for (const def of CONTROLES) {
    for (const c of trouves.get(def.cle) ?? []) {
      if (!c.aVerifier) continue;
      const entree = { id: c.id, controle: c.controle, texte: c.raison, date: c.date, matchKey: c.matchKey, familles: c.familles, classe: c.classe };
      if (c.controle === 'magasin-a-jour') aVerifier.global.push(entree);
      else if (['jaunes-non-releves', 'corners-non-releves', 'tirs-non-releves'].includes(c.controle)) (aVerifier.ligues[c.league] ??= []).push(entree);
      else for (const id of c.clubs) (aVerifier.clubs[id] ??= []).push(entree);
    }
  }

  const dureeMs = Math.round(chrono() - debut);
  const dernier = chrono() - dernierePause;
  if (dernier > blocMax.ms) blocMax = { ms: dernier, ou: 'bilan' };
  const feu = couleurDuFeu(controles, t);
  const compte = { vert: 0, orange: 0, rouge: 0, nonFait: 0, erreur: 0 };
  for (const c of controles) {
    const s = c.statutLe;
    if (s === 'non-fait') compte.nonFait++;
    else if (s === 'erreur') compte.erreur++;
    else compte[s] = (compte[s] ?? 0) + 1;
  }
  return {
    version: VERSION_CONTROLE,
    le: maintenantIso,
    dureeMs,
    blocMaxMs: Math.round(blocMax.ms),
    blocMaxOu: blocMax.ou,
    pauses,
    temps,
    fenetre: { du: ctx.du, au: ctx.au, jours: fenetreJours, rencontres: ctx.rencontres.size },
    feu,
    compte,
    controles,
    notes,
    vus,
    aVerifier,
    historique: [{ le: maintenantIso, feu, dureeMs, rouges: compte.rouge, oranges: compte.orange }, ...(precedent?.historique ?? [])].slice(0, 30)
  };
}

/**
 * L'état à montrer à l'instant `maintenant` : les constats re-datés (un rouge
 * de plus de 24 h devient orange), les sources lues MAINTENANT (`sources` :
 * etatDesSources()), le feu recalculé. Pur.
 */
export function etatAuMoment(etat, { maintenant = Date.now(), sources = null } = {}) {
  if (!etat) return null;
  const t = typeof maintenant === 'number' ? maintenant : Date.parse(maintenant);
  const donnees = (etat.controles ?? []).filter((c) => c.famille !== 'sources');
  const desSources = sources ? controlesDesSources(sources) : (etat.controles ?? []).filter((c) => c.famille === 'sources');
  const controles = [...donnees, ...desSources].map((c) => ({
    ...c,
    statutLe: statutDuControle(c, t),
    constats: (c.constats ?? []).map((x) => ({ ...x, couleur: couleurDuConstat(x, t), nouveau: x.classe === 'rouge' && couleurDuConstat(x, t) === 'rouge' }))
  }));
  const ordre = new Map(CONTROLES.map((c, i) => [c.cle, i]));
  controles.sort((a, b) => (ordre.get(a.cle) ?? 99) - (ordre.get(b.cle) ?? 99));
  const compte = { vert: 0, orange: 0, rouge: 0, nonFait: 0, erreur: 0 };
  for (const c of controles) {
    if (c.statutLe === 'non-fait') compte.nonFait++;
    else if (c.statutLe === 'erreur') compte.erreur++;
    else compte[c.statutLe] = (compte[c.statutLe] ?? 0) + 1;
  }
  const rangs = { rouge: 0, erreur: 1, orange: 2 };
  const enEchec = controles
    .filter((c) => ['rouge', 'orange', 'erreur'].includes(c.statutLe))
    .sort((a, b) => rangs[a.statutLe] - rangs[b.statutLe] || (ordre.get(a.cle) ?? 99) - (ordre.get(b.cle) ?? 99))
    .map((c) => ({ cle: c.cle, libelle: c.libelle, famille: c.famille, statut: c.statutLe, constat: c.constat, total: c.total ?? 0 }));
  return { ...etat, controles, compte, enEchec, feu: couleurDuFeu(controles, t), luLe: new Date(t).toISOString() };
}

const decaler = (jour, n) => iso(Date.parse(`${jour}T12:00:00Z`) + n * JOUR_MS);

/**
 * « À VÉRIFIER » : les raisons pour lesquelles les données d'un pronostic sont
 * douteuses — un constat rouge sur une rencontre d'un des deux clubs dans les
 * 60 jours qui précèdent le match (ou sur le match lui-même), un relevé absent
 * de son championnat pour la famille du marché, le magasin pas à jour, FotMob
 * en panne. `famille` : celle du marché (familleDuMarche), ou null pour le
 * résumé d'un match, qui vaut pour les marchés que le moteur calcule : toutes
 * les raisons (chacune dit alors ses familles), SAUF celles qui ne touchent que
 * des familles sans marché aujourd'hui (FAMILLES_SANS_MARCHE : les joueurs) —
 * pas de bandeau pour elles ; leur badge se demande avec `famille: 'joueurs'`.
 * Clubs par identifiant FotMob seulement ; sans identifiant, seules les
 * raisons du championnat et les raisons générales s'appliquent. Rend null ou
 * { raisons, texte }.
 */
export function aVerifierDuMatch(etat, { league = null, date = null, homeId = null, awayId = null, famille = null, fotmob = null } = {}) {
  const index = etat?.aVerifier;
  const raisons = [];
  const vues = new Set();
  const jour = String(date ?? '').slice(0, 10);
  const pour = (c) => {
    const familles = c.familles ?? ['tout'];
    return familles.includes('tout') || (famille ? familles.includes(famille) : toucheUnMarcheDuMoteur(familles));
  };
  const ajouter = (c) => {
    if (vues.has(c.id) || !pour(c)) return;
    vues.add(c.id);
    raisons.push({ id: c.id, controle: c.controle, texte: c.texte, familles: c.familles ?? ['tout'], date: c.date ?? null });
  };
  if (index && /^\d{4}-\d{2}-\d{2}$/.test(jour)) {
    const debut = decaler(jour, -JOURS_A_VERIFIER);
    for (const id of [homeId, awayId]) {
      if (!id) continue;
      // Un constat sans date (le classement officiel de la saison) vaut pour toute la fenêtre.
      for (const c of index.clubs?.[id] ?? []) if (!c.date || (c.date <= jour && c.date >= debut)) ajouter(c);
    }
    for (const c of index.ligues?.[league] ?? []) if (!c.date || c.date <= jour) ajouter(c);
  }
  for (const c of index?.global ?? []) ajouter(c);
  if (fotmob?.enPanne) {
    ajouter({ id: 'source-fotmob:panne', controle: 'source-fotmob', texte: `FotMob ne répond plus${fotmob.derniereReussite ? ` depuis le ${jourFr(fotmob.derniereReussite)}` : ''} : résultats et compositions récents peut-être manquants`, familles: ['tout'] });
  }
  if (!raisons.length) return null;
  return { raisons, texte: raisons.length > 1 ? `${raisons[0].texte} (et ${pluriel(raisons.length - 1, 'autre raison', 'autres raisons')})` : raisons[0].texte };
}

/** Pour les écrans et les tests : les sortes de constats de l'étape 12 reprises ici. */
export const __testing = { DEPUIS_L_ETAPE_12, depuisAnomalie, scoresFootballData, nonRelevesParChampionnat, horsReperes, matchsAberrants, completude, scoresDansLeTemps, PAR_CLE };
