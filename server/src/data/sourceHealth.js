/**
 * sourceHealth.js — la SANTÉ DE CHAQUE SOURCE, lue dans ce qui a été noté.
 * -----------------------------------------------------------------------
 * Étape 14 du plan (07/10/2026). Une ligne par source — FotMob,
 * football-data.co.uk, The Odds API, API-Football, Claude, et les cotes
 * gratuites de référence — avec son état (ok, à surveiller, en panne, coupée,
 * inconnu), la date de son dernier relevé et sa limite (crédits, appels du
 * jour, date d'expiration).
 *
 * RIEN N'EST DEMANDÉ À UNE SOURCE pour savoir si elle va bien : aucun appel
 * réseau ici, jamais. Tout se lit dans ce que l'appli a noté lors de ses
 * vrais appels :
 *   FotMob          le suivi de chaque réponse (data/relevesDesSources.js :
 *                   mémoire du serveur, et data/runtime/sante-fotmob.json à
 *                   la fin de chaque passe) et le bilan des passes
 *                   d'actualisation (data/runtime/refresh-status.json) ; le
 *                   texte minute par minute de la revue d'après-match (autre
 *                   serveur de FotMob : data.fotmob.com) y est noté à part
 *                   (07/10/2026) — une ligne de détail, jamais « en panne » ;
 *   football-data   l'état de chaque fichier (table fd_fichiers, étape 13),
 *                   le résumé de l'historique et l'étape « cotes passées » ;
 *   The Odds API    le bilan du dernier relevé payant (data/runtime/
 *                   releve-payant.json, étape 7 : crédits restants renvoyés
 *                   par la source), sinon la date du fichier du relevé ;
 *   API-Football    le compteur noté à chaque appel réel
 *                   (data/runtime/compteur-api-football.json) ;
 *   Claude          la date d'expiration du jeton, un RÉGLAGE saisi par
 *                   Pierre (data/runtime/jeton-claude.json — jamais
 *                   server/.env), et le journal des appels (étape 4) ;
 *   cotes gratuites le bilan de l'étape « cotes gratuites » des passes.
 * Seule la PRÉSENCE d'une clé dans l'environnement du serveur est regardée
 * (oui ou non), jamais sa valeur.
 *
 * Pour l'étape 46 (prédiction en direct, qui devra s'arrêter si FotMob
 * répond mal) : `etatFotmob()` — dernière réussite, erreurs de suite, panne.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { modeBacASable } from '../config/bacASable.js';
import { openDb } from './db/matchStatsDb.js';
import {
  suiviFotmobEnMemoire,
  lireSuiviFotmobEnregistre,
  lireCompteurApiFootball,
  ERREURS_DE_SUITE_PANNE,
  ERREURS_DE_SUITE_COMMENTAIRE,
  NATURES_ERREUR_FOTMOB,
  TYPES_FOTMOB,
  QUOTA_JOUR_API_FOOTBALL,
  FICHIER_SANTE_FOTMOB,
  FICHIER_COMPTEUR_API_FOOTBALL
} from './relevesDesSources.js';
import { readRefreshStatus, REFRESH_STATUS_FILE } from './repositories/refreshStatusRepository.js';
import { lireDernierRelevePayant } from './repositories/relevePayantRepository.js';
import { getFixturePaths } from './repositories/fixturesRepository.js';
import { lireJetonClaude } from './repositories/jetonClaudeRepository.js';
import { DOSSIER_JOURNAL, lireJour } from './repositories/claudeUsageLedger.js';
import { TRACKED_SPORT_KEYS, CREDITS_PAR_MOIS } from './providers/oddsApiCompetitions.js';
import { lireResume, REQUETES_PAR_PASSE, ECART_MS } from './providers/footballDataHistory.js';

/** Les six lignes, dans l'ordre de la carte « Santé des sources ». */
export const SOURCES = Object.freeze([
  Object.freeze({ cle: 'fotmob', nom: 'FotMob', role: 'Calendrier, résultats, statistiques, compositions et classements', payant: false }),
  Object.freeze({ cle: 'football-data', nom: 'football-data.co.uk', role: 'Cotes passées et historique depuis 2000 (fichiers CSV)', payant: false }),
  Object.freeze({ cle: 'odds-api', nom: 'The Odds API', role: 'Cotes de vos bookmakers (relevé fait à la main)', payant: true }),
  Object.freeze({ cle: 'api-football', nom: 'API-Football', role: 'Repli au clic seulement, quand le magasin ne connaît pas une équipe', payant: true }),
  Object.freeze({ cle: 'claude', nom: 'Claude (Claude Code)', role: 'Analyses IA d’avant et d’après-match (abonnement de Pierre)', payant: false }),
  Object.freeze({ cle: 'cotes-gratuites', nom: 'Cotes gratuites de référence', role: 'ESPN, football-data.co.uk, 365Scores, Kalshi, Smarkets — référence, jamais jouables', payant: false })
]);

/** Les états d'une source, leur couleur et leurs mots. */
export const ETATS = Object.freeze({
  ok: Object.freeze({ couleur: 'vert', libelle: 'En bon état' }),
  'a-surveiller': Object.freeze({ couleur: 'orange', libelle: 'À surveiller' }),
  'en-panne': Object.freeze({ couleur: 'rouge', libelle: 'En panne' }),
  coupe: Object.freeze({ couleur: 'gris', libelle: 'Coupée' }),
  inconnu: Object.freeze({ couleur: 'gris', libelle: 'État inconnu' })
});

/** Les étapes de l'actualisation qui interrogent FotMob. */
const ETAPES_FOTMOB = ['calendrier', 'classements', 'nouvelles', 'omissions', 'feuillesTardives', 'feuilles'];
/** Une réponse FotMob de forme inattendue sur une part au moins aussi grande (et 20 réponses au moins) : à surveiller. */
const PART_FORME_INATTENDUE = 0.1;
/** The Odds API : un relevé complet coûte une requête par compétition suivie (1 crédit au plus chacune). */
export const CREDITS_PAR_RELEVE = TRACKED_SPORT_KEYS.length;
/** API-Football : au-delà, la journée est presque épuisée. */
const SEUIL_API_FOOTBALL = 90;
/** Claude : à surveiller dans les 30 derniers jours du jeton. */
const JOURS_AVANT_EXPIRATION = 30;

const JOUR_MS = 86_400_000;
const formatParis = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
/** « 06/10/2026 à 17:00 » (heure de Paris), ou « date inconnue ». */
export function quand(iso) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return 'date inconnue';
  return formatParis.format(new Date(t)).replace(' ', ' à ').replace(',', '');
}
const jourFr = (iso) => {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'date inconnue';
};
const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${Math.abs(Number(n ?? 0)) > 1 ? plusieurs : un}`;
const plusRecent = (...dates) => dates.filter((d) => Number.isFinite(Date.parse(d ?? ''))).sort().at(-1) ?? null;
const jourParis = (t) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date(t));

/**
 * Ce que le serveur sait de lui-même : ses interrupteurs et la PRÉSENCE de ses
 * clés (oui ou non, jamais leur valeur). Les essais passent la leur (`config`) :
 * dans le bac à sable, les clés sont toujours vidées.
 */
export function configDuServeur() {
  return {
    actualisation: Boolean(env.matchStatsRefresh.enabled),
    intervalleMinutes: env.matchStatsRefresh.intervalMinutes,
    cotesGratuites: Boolean(env.freeOdds.enabled),
    cleOddsApi: Boolean(env.oddsApi.apiKey),
    cleApiFootball: Boolean(env.apiFootball.apiKey),
    jetonClaude: Boolean(env.claudeCode.oauthToken),
    bac: modeBacASable()
  };
}
const configAvec = (config) => ({ ...configDuServeur(), ...(config ?? {}) });

function ligne(cle, champs) {
  const s = SOURCES.find((x) => x.cle === cle);
  const etat = champs.etat ?? 'inconnu';
  return {
    cle,
    nom: s.nom,
    role: s.role,
    payant: s.payant,
    etat,
    couleur: ETATS[etat]?.couleur ?? 'gris',
    libelleEtat: ETATS[etat]?.libelle ?? etat,
    // Une source coupée dit pourquoi (bac à sable, clé absente, interrupteur).
    resume: etat === 'coupe' && champs.coupure ? `${champs.resume} ${champs.coupure}` : champs.resume,
    dernierReleve: champs.dernierReleve ?? { le: null, quoi: 'aucun relevé noté' },
    limite: champs.limite ?? { texte: 'aucune limite connue', valeur: null, max: null },
    details: (champs.details ?? []).filter(Boolean),
    provenance: champs.provenance ?? null,
    raison: champs.raison ?? null
  };
}

/** La dernière passe où une étape a vraiment tourné (pas « non due »), et son bilan d'étape. */
function derniereFoisQue(refresh, cle) {
  for (const passe of refresh?.history ?? []) {
    const etape = (passe?.steps ?? []).find((e) => e.key === cle);
    if (etape && etape.status !== 'skipped') return { passe, etape };
  }
  return null;
}

// =================================================================== FotMob

/**
 * L'état de FotMob, tel que les notes le disent. Pour l'étape 46 (la
 * prédiction en direct s'arrêtera si FotMob répond mal) comme pour la carte :
 * { etat, enPanne, derniereReussite, derniereErreur, erreursDeSuite, raison,
 *   requetes, echecs, depuis, formes, commentaire, source }. Aucun appel réseau.
 *
 * `commentaire` : le texte minute par minute de la revue d'après-match (autre
 * serveur de FotMob), noté à part — fichiers lus, langues absentes (le 403
 * attendu : jamais une panne), échecs, et SA série d'échecs. Elle met la ligne
 * « à surveiller » au bout de ERREURS_DE_SUITE_COMMENTAIRE échecs de suite
 * (de moins de 24 h), jamais « en panne » : `enPanne` et `erreursDeSuite` ne
 * parlent que du reste de FotMob, ce que l'étape 46 lit.
 */
export function etatFotmob({ maintenant = Date.now(), refresh = null, config = null } = {}) {
  const c = configAvec(config);
  const memoire = suiviFotmobEnMemoire();
  const enregistre = lireSuiviFotmobEnregistre();
  let r = refresh;
  if (!r) {
    try {
      r = readRefreshStatus();
    } catch {
      r = null;
    }
  }
  const succesActualisation = plusRecent(...ETAPES_FOTMOB.map((k) => r?.stepsLastSuccess?.[k] ?? null));
  // Le texte minute par minute est noté à part des totaux : un serveur qui n'en a lu que lui (ou n'en a reçu que des « fichier absent ») a tout de même des notes.
  const aDesNotes = memoire.requetes > 0 || (memoire.parType?.commentaire?.requetes ?? 0) + (memoire.parType?.commentaire?.absentes ?? 0) > 0;
  const base = aDesNotes ? memoire : enregistre;
  const derniereReussite = plusRecent(memoire.derniereReussite, enregistre?.derniereReussite ?? null, succesActualisation);
  const erreursDeSuite = aDesNotes ? memoire.erreursDeSuite : enregistre?.erreursDeSuite ?? 0;
  const derniereErreur = memoire.derniereErreur ?? enregistre?.derniereErreur ?? null;
  // La forme des réponses, sorte par sorte (mémoire du serveur, sinon la fin de la passe précédente).
  const formes = Object.entries(base?.parType ?? {}).map(([type, t]) => {
    // La dernière réponse lue de cette sorte avait-elle une forme inattendue ?
    const recente = t.derniereForme?.attendue === false;
    const part = t.reussites ? t.formeInattendue / t.reussites : 0;
    return {
      type,
      libelle: TYPES_FOTMOB[type] ?? type,
      requetes: t.requetes ?? 0,
      reussites: t.reussites ?? 0,
      echecs: t.echecs ?? 0,
      absentes: t.absentes ?? 0,
      formeInattendue: t.formeInattendue ?? 0,
      manques: Object.entries(t.manques ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([champ, n]) => ({ champ, n })),
      aSurveiller: Boolean(recente) || (t.reussites >= 20 && part >= PART_FORME_INATTENDUE)
    };
  });
  // Le texte minute par minute de la revue d'après-match, noté à part (data.fotmob.com).
  const notesTexte = base?.parType?.commentaire ?? null;
  const commentaire = {
    lus: notesTexte?.reussites ?? 0,
    absentes: notesTexte?.absentes ?? 0,
    echecs: notesTexte?.echecs ?? 0,
    erreursDeSuite: notesTexte?.erreursDeSuite ?? 0,
    derniereReussite: notesTexte?.derniereReussite ?? null,
    derniereAbsence: notesTexte?.derniereAbsence ?? null,
    derniereErreur: notesTexte?.derniereErreur ?? null
  };
  commentaire.notes = commentaire.lus + commentaire.absentes + commentaire.echecs > 0;
  const commentaireEnEchec = Boolean(commentaire.derniereErreur) && commentaire.erreursDeSuite >= ERREURS_DE_SUITE_COMMENTAIRE && maintenant - Date.parse(commentaire.derniereErreur.le) < JOUR_MS;
  // La dernière passe : les étapes FotMob qui ont tourné, toutes en échec ?
  const passe = r?.history?.[0] ?? null;
  const etapes = (passe?.steps ?? []).filter((e) => ETAPES_FOTMOB.includes(e.key) && e.status !== 'skipped');
  const passeEnEchec = etapes.length > 0 && etapes.every((e) => e.status === 'error');
  const intervalle = (c.intervalleMinutes || 180) * 60_000;
  const vieille = derniereReussite && maintenant - Date.parse(derniereReussite) > 2 * intervalle + 3_600_000;
  const accesRefuse = derniereErreur?.nature === 'acces-refuse' && maintenant - Date.parse(derniereErreur.le) < JOUR_MS;

  let etat = 'inconnu';
  let raison = null;
  if (erreursDeSuite >= ERREURS_DE_SUITE_PANNE) {
    etat = 'en-panne';
    raison = `${pluriel(erreursDeSuite, 'réponse en échec', 'réponses en échec')} de suite (${NATURES_ERREUR_FOTMOB[derniereErreur?.nature] ?? 'échec'})`;
  } else if (passeEnEchec) {
    etat = 'en-panne';
    raison = `toutes les étapes FotMob de la dernière passe (${quand(passe.finishedAt)}) sont en échec`;
  } else if (accesRefuse) {
    etat = 'a-surveiller';
    raison = `accès refusé le ${quand(derniereErreur.le)} (${derniereErreur.statut ?? '403'})`;
  } else if (erreursDeSuite > 0) {
    etat = 'a-surveiller';
    raison = `${pluriel(erreursDeSuite, 'réponse en échec', 'réponses en échec')} de suite, la dernière le ${quand(derniereErreur?.le)}`;
  } else if (formes.some((f) => f.aSurveiller)) {
    etat = 'a-surveiller';
    const f = formes.find((x) => x.aSurveiller);
    raison = `forme des réponses inattendue (${f.libelle.toLowerCase()} : ${f.manques.map((m) => m.champ).join(', ') || 'champs absents'})`;
  } else if (commentaireEnEchec) {
    // Le texte minute par minute seul (la revue d'après-match s'en passe) : à surveiller, jamais « en panne ».
    etat = 'a-surveiller';
    raison = `texte minute par minute de la revue (data.fotmob.com) : ${pluriel(commentaire.erreursDeSuite, 'fichier en échec', 'fichiers en échec')} de suite (${NATURES_ERREUR_FOTMOB[commentaire.derniereErreur.nature] ?? 'échec'}), le dernier le ${quand(commentaire.derniereErreur.le)}`;
  } else if (c.actualisation && vieille) {
    etat = 'a-surveiller';
    raison = `aucune réponse réussie depuis le ${quand(derniereReussite)}`;
  } else if (derniereReussite) {
    etat = 'ok';
  }
  return {
    etat,
    enPanne: etat === 'en-panne',
    raison,
    derniereReussite,
    derniereErreur,
    erreursDeSuite,
    requetes: base?.requetes ?? 0,
    reussites: base?.reussites ?? 0,
    echecs: base?.echecs ?? 0,
    depuis: base?.depuis ?? null,
    formes,
    commentaire,
    source: aDesNotes ? 'memoire' : enregistre ? 'fichier' : succesActualisation ? 'actualisation' : 'aucune',
    enregistreLe: enregistre?.enregistreLe ?? null
  };
}

/**
 * La ligne de détail du texte minute par minute (revue d'après-match, data.fotmob.com) : fichiers lus, langues absentes (le 403
 * attendu, jamais une panne), échecs — et le dernier échec, avec sa nature.
 */
function detailCommentaire(t) {
  const debut = 'texte minute par minute (revue d’après-match, data.fotmob.com)';
  if (!t.notes) return `${debut} : aucune lecture notée`;
  const dernier = t.derniereErreur
    ? ` ; dernier échec le ${quand(t.derniereErreur.le)} : ${NATURES_ERREUR_FOTMOB[t.derniereErreur.nature] ?? 'échec'}${t.derniereErreur.message ? ` (${t.derniereErreur.message})` : ''}`
    : '';
  return `${debut} : ${pluriel(t.lus, 'fichier lu', 'fichiers lus')}, ${pluriel(t.absentes, 'langue absente', 'langues absentes')} (403 attendu : le fichier n’existe pas dans cette langue, jamais une panne), ${pluriel(t.echecs, 'échec', 'échecs')}${dernier}`;
}

function ligneFotmob({ maintenant, refresh, c }) {
  const f = etatFotmob({ maintenant, refresh, config: c });
  const notes =
    f.source === 'memoire'
      ? `notes de ce serveur depuis le ${quand(f.depuis)} : ${pluriel(f.requetes, 'réponse', 'réponses')}, ${pluriel(f.echecs, 'échec', 'échecs')}`
      : f.source === 'fichier'
        ? `notes enregistrées à la fin de la passe du ${quand(f.enregistreLe)} : ${pluriel(f.requetes, 'réponse', 'réponses')}, ${pluriel(f.echecs, 'échec', 'échecs')}`
        : f.source === 'actualisation'
          ? 'aucune réponse notée encore par ce serveur : la dernière réussite vient du bilan des passes d’actualisation'
          : 'aucune réponse notée';
  const formes = f.formes.filter((x) => x.reussites);
  const coupe = !c.actualisation;
  const resume =
    f.etat === 'en-panne'
      ? `FotMob ne répond plus : ${f.raison}. Les résultats et les compositions ne se mettent plus à jour — plan de secours : docs/plan-secours-fotmob.md (rien ne bascule sans votre accord).`
      : f.etat === 'a-surveiller'
        ? `À surveiller : ${f.raison}.`
        : f.etat === 'ok'
          ? `Répond normalement ; dernière réponse réussie le ${quand(f.derniereReussite)}.`
          : 'Aucune réponse notée : pas encore d’actualisation depuis que l’appli note les réponses.';
  return ligne('fotmob', {
    etat: f.etat === 'inconnu' && coupe ? 'coupe' : f.etat,
    raison: f.raison,
    resume: coupe && f.etat !== 'en-panne' ? `${resume} Actualisation automatique coupée ${c.bac ? 'dans le bac à sable' : '(MATCH_STATS_AUTO_REFRESH=false)'} : ce serveur n’interroge pas FotMob.` : resume,
    dernierReleve: { le: f.derniereReussite, quoi: 'dernière réponse réussie' },
    limite: { texte: 'gratuite, sans clé ni limite publiée (API interne non documentée : elle peut changer ou se fermer sans préavis)', valeur: null, max: null },
    details: [
      notes,
      f.derniereErreur ? `dernier échec le ${quand(f.derniereErreur.le)} : ${NATURES_ERREUR_FOTMOB[f.derniereErreur.nature] ?? 'échec'}${f.derniereErreur.message ? ` (${f.derniereErreur.message})` : ''}` : 'aucun échec noté',
      formes.length
        ? `forme des réponses : ${formes.map((x) => `${x.libelle.toLowerCase()} ${nombre(x.reussites - x.formeInattendue)}/${nombre(x.reussites)} attendues`).join(', ')}`
        : 'forme des réponses : rien de lu encore',
      detailCommentaire(f.commentaire),
      'si FotMob coupe l’accès : docs/plan-secours-fotmob.md'
    ],
    provenance: { quoi: 'chaque réponse que l’actualisation reçoit déjà, notée par le serveur (aucune requête de plus) — le texte minute par minute que lit la revue d’après-match aussi, noté à part', fichiers: [FICHIER_SANTE_FOTMOB, REFRESH_STATUS_FILE] }
  });
}

// ============================================================ football-data

function ligneFootballData({ database, refresh }) {
  let fichiers = null;
  let probleme = null;
  try {
    fichiers = database
      .prepare(
        `SELECT COUNT(*) n, SUM(statut = 'importe') importes, SUM(statut = 'echec') echecs, SUM(statut = 'importe' AND erreur IS NOT NULL) relectures,
                SUM(statut = 'absent') absents, MAX(lu_le) dernier FROM fd_fichiers`
      )
      .get();
  } catch (error) {
    probleme = /no such table/i.test(error.message) ? 'historique pas encore importé (étape 13)' : error.message;
  }
  let resume = null;
  try {
    resume = lireResume({ database });
  } catch {
    resume = null;
  }
  const cotes = derniereFoisQue(refresh, 'cotesPassees');
  const historique = derniereFoisQue(refresh, 'historiqueFd');
  const dernier = plusRecent(fichiers?.dernier ?? null, refresh?.stepsLastSuccess?.cotesPassees ?? null, refresh?.stepsLastSuccess?.historiqueFd ?? null);
  const enEchec = (fichiers?.echecs ?? 0) + (fichiers?.relectures ?? 0);
  const etapeKo = [cotes, historique].filter((x) => x && (x.etape.status === 'error' || x.etape.status === 'warn'));
  let etat = 'inconnu';
  let raison = null;
  if (enEchec) {
    etat = 'a-surveiller';
    raison = `${pluriel(enEchec, 'fichier en échec', 'fichiers en échec')} (repris à la passe suivante)`;
  } else if (etapeKo.length) {
    etat = 'a-surveiller';
    raison = `${etapeKo.map((x) => x.etape.label).join(' et ')} : ${String(etapeKo[0].etape.summary ?? '').slice(0, 160)}`;
  } else if (dernier) {
    etat = 'ok';
  }
  return ligne('football-data', {
    etat,
    raison,
    resume:
      etat === 'ok'
        ? `Fichiers lus normalement ; dernier relevé le ${quand(dernier)}.`
        : etat === 'a-surveiller'
          ? `À surveiller : ${raison}.`
          : `Aucun relevé noté${probleme ? ` (${probleme})` : ''}.`,
    dernierReleve: { le: dernier, quoi: 'dernier fichier lu' },
    limite: { texte: `gratuit, sans clé ; au plus ${REQUETES_PAR_PASSE} requêtes par passe, ${String(ECART_MS / 1000).replace('.', ',')} s entre deux`, valeur: null, max: null },
    details: [
      fichiers ? `${pluriel(fichiers.importes ?? 0, 'fichier importé', 'fichiers importés')}, ${nombre(fichiers.absents ?? 0)} absent(s) chez le site, ${nombre(fichiers.echecs ?? 0)} en échec, ${nombre(fichiers.relectures ?? 0)} relecture(s) manquée(s)` : null,
      resume?.totaux ? `historique : ${pluriel(resume.totaux.matchs, 'match', 'matchs')}, ${pluriel(resume.totaux.ecarts, 'écart de score', 'écarts de score')} avec FotMob (contrôle quotidien)` : null,
      cotes ? `cotes passées : ${String(cotes.etape.summary ?? '').slice(0, 160)} (${quand(cotes.passe.finishedAt)})` : 'cotes passées : pas de passe notée'
    ],
    provenance: { quoi: 'état de chaque fichier (table fd_fichiers) et bilan des passes d’actualisation', fichiers: [REFRESH_STATUS_FILE] }
  });
}

// ============================================================= The Odds API

function ligneOddsApi({ maintenant, c }) {
  const lu = lireDernierRelevePayant();
  let snapshot = null;
  try {
    snapshot = fs.statSync(getFixturePaths().odds).mtime.toISOString();
  } catch {
    snapshot = null;
  }
  const cle = c.cleOddsApi;
  let etat = 'inconnu';
  let raison = null;
  let dernier = snapshot;
  let restants = null;
  let utilises = null;
  const details = [];
  if (lu.source === 'enregistre') {
    dernier = lu.bilan.at;
    restants = lu.bilan.quota.restants;
    utilises = lu.bilan.quota.utilises;
    const memeMois = String(jourParis(Date.parse(lu.bilan.at))).slice(0, 7) === String(jourParis(maintenant)).slice(0, 7);
    if (restants === null) {
      raison = 'la source n’a pas renvoyé ses crédits au dernier relevé';
    } else if (restants < CREDITS_PAR_RELEVE && !memeMois) {
      raison = `${pluriel(restants, 'crédit restant', 'crédits restants')} au relevé du ${quand(lu.bilan.at)}, d’un mois précédent : le compte a pu repartir depuis`;
    } else if (restants < CREDITS_PAR_RELEVE) {
      etat = 'a-surveiller';
      raison = restants === 0 ? 'crédits épuisés' : `${pluriel(restants, 'crédit restant', 'crédits restants')} : moins qu’un relevé complet (${CREDITS_PAR_RELEVE})`;
    } else {
      etat = 'ok';
    }
    details.push(`dernier relevé : ${pluriel(lu.bilan.clesRelevees.length, 'compétition relevée', 'compétitions relevées')} sur ${nombre(lu.bilan.clesDemandees)}, ${pluriel(lu.bilan.matchs, 'match', 'matchs')}${lu.bilan.cout !== null ? `, ${pluriel(lu.bilan.cout, 'crédit consommé', 'crédits consommés')}` : ''}`);
  } else if (lu.source === 'illisible') {
    raison = `bilan du dernier relevé illisible (${lu.probleme})`;
  } else if (snapshot) {
    raison = 'crédits restants pas notés à ce relevé : ils le sont depuis l’étape 7, à chaque relevé';
  } else {
    raison = 'jamais relevé sur ce PC';
  }
  details.push(`un relevé complet : ${pluriel(CREDITS_PAR_RELEVE, 'requête', 'requêtes')} (1 crédit au plus chacune), sur ${nombre(CREDITS_PAR_MOIS)} crédits par mois`);
  details.push(cle ? 'clé présente sur le serveur' : c.bac ? 'clé vidée par le bac à sable : aucun relevé possible ici' : 'clé absente (ODDS_API_KEY) : aucun relevé possible');
  details.push('jamais appelé pour lire ses crédits : ils viennent de la réponse au dernier relevé que vous avez lancé');
  return ligne('odds-api', {
    etat: !cle && etat !== 'a-surveiller' ? 'coupe' : etat,
    raison,
    coupure: c.bac ? 'Clé vidée par le bac à sable : aucun relevé possible ici.' : 'Clé absente (ODDS_API_KEY) : aucun relevé possible.',
    resume:
      restants !== null
        ? `${pluriel(restants, 'crédit restant', 'crédits restants')}${utilises !== null ? ` (${nombre(utilises)} consommés)` : ''} au relevé du ${quand(dernier)}.${raison && etat !== 'ok' ? ` ${raison.charAt(0).toUpperCase()}${raison.slice(1)}.` : ''}`
        : `Dernier relevé ${dernier ? `le ${quand(dernier)}` : 'inconnu'} ; ${raison ?? 'crédits restants inconnus'}.`,
    dernierReleve: { le: dernier, quoi: lu.source === 'enregistre' ? 'dernier relevé payant (bilan noté)' : 'dernier relevé payant (date du fichier des cotes)' },
    limite: {
      texte: restants !== null ? `${pluriel(restants, 'crédit restant', 'crédits restants')} sur ${nombre(CREDITS_PAR_MOIS)} par mois` : 'crédits restants inconnus',
      valeur: restants,
      max: CREDITS_PAR_MOIS
    },
    details,
    provenance: { quoi: 'bilan du dernier relevé que vous avez lancé (Réglages › Données › Actualiser)', fichiers: [lu.fichier, getFixturePaths().odds] }
  });
}

// ============================================================= API-Football

function ligneApiFootball({ maintenant, c }) {
  let compteur = null;
  let probleme = null;
  try {
    compteur = lireCompteurApiFootball();
  } catch (error) {
    probleme = error.message;
  }
  const cle = c.cleApiFootball;
  const jour = new Date(maintenant).toISOString().slice(0, 10);
  const aujourdhui = compteur?.jours?.[jour]?.appels ?? 0;
  const d = compteur?.dernier ?? null;
  const memeJour = d?.jour === jour;
  const restant = memeJour ? d.restantJour : null;
  const max = (memeJour ? d.limiteJour : null) ?? QUOTA_JOUR_API_FOOTBALL;
  let etat = 'inconnu';
  let raison = null;
  if (probleme) {
    raison = `compteur illisible (${probleme})`;
  } else if (memeJour && d.statut === 429) {
    etat = 'a-surveiller';
    raison = `limite atteinte au dernier appel (${quand(d.le)})`;
  } else if (aujourdhui >= SEUIL_API_FOOTBALL || (restant !== null && restant <= max - SEUIL_API_FOOTBALL)) {
    etat = 'a-surveiller';
    raison = `${pluriel(aujourdhui, 'appel', 'appels')} aujourd’hui sur ${nombre(max)}${restant !== null ? ` (${nombre(restant)} restants selon la source)` : ''}`;
  } else if (compteur?.existe) {
    etat = 'ok';
  } else {
    raison = 'aucun appel noté depuis que l’appli compte ses appels (07/10/2026) : elle ne l’appelle qu’au clic';
  }
  return ligne('api-football', {
    etat: !cle && etat !== 'a-surveiller' ? 'coupe' : etat,
    raison,
    coupure: c.bac ? 'Clé vidée par le bac à sable : aucun appel possible ici.' : 'Clé absente (API_FOOTBALL_KEY) : aucun appel possible.',
    resume: compteur?.existe
      ? `${pluriel(aujourdhui, 'appel', 'appels')} aujourd’hui (jour UTC) sur ${nombre(max)}${restant !== null ? ` ; ${nombre(restant)} restants selon API-Football à son dernier appel` : ''} ; dernier appel le ${quand(d?.le)}${d && !d.ok ? ` (en échec : ${d.statut ?? d.erreur ?? 'sans réponse'})` : ''}.`
      : `${raison ?? 'Aucun appel noté'}.`,
    dernierReleve: { le: d?.le ?? null, quoi: 'dernier appel réel' },
    limite: { texte: `${pluriel(aujourdhui, 'appel', 'appels')} aujourd’hui sur ${nombre(max)} (plan gratuit : 100 par jour)`, valeur: aujourdhui, max, restant },
    details: [
      cle ? 'clé présente sur le serveur' : c.bac ? 'clé vidée par le bac à sable : aucun appel possible ici' : 'clé absente (API_FOOTBALL_KEY) : aucun appel possible',
      'jamais appelé pour lire son compteur : il vient des en-têtes de la réponse au dernier vrai appel',
      'jamais appelé par les boucles automatiques : seulement au clic, quand le magasin ne connaît pas une équipe'
    ],
    provenance: { quoi: 'chaque appel réel noté par le serveur', fichiers: [FICHIER_COMPTEUR_API_FOOTBALL] }
  });
}

// =================================================================== Claude

/** Le dernier appel noté au journal des appels Claude (étape 4), et le dernier réussi. */
function derniersAppelsClaude() {
  let noms = [];
  try {
    noms = fs.readdirSync(DOSSIER_JOURNAL).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse();
  } catch {
    noms = [];
  }
  let dernier = null;
  let dernierOk = null;
  for (const nom of noms.slice(0, 14)) {
    const appels = lireJour(nom.slice(0, 10)).appels ?? [];
    for (const a of [...appels].reverse()) {
      dernier ??= a;
      if (a.statut === 'ok') {
        dernierOk = a;
        break;
      }
    }
    if (dernierOk) break;
  }
  return { dernier, dernierOk };
}

function ligneClaude({ maintenant, c }) {
  const jeton = lireJetonClaude();
  const jours = Math.floor((Date.parse(`${jeton.expireLe}T23:59:59Z`) - maintenant) / JOUR_MS);
  const present = c.jetonClaude;
  const { dernier, dernierOk } = derniersAppelsClaude();
  let etat = 'ok';
  let raison = null;
  if (jours < 0) {
    etat = 'en-panne';
    raison = `jeton expiré le ${jourFr(jeton.expireLe)}${jeton.aConfirmer ? ' (date à confirmer)' : ''} : les analyses IA échouent jusqu’au renouvellement (claude setup-token)`;
  } else if (jours <= JOURS_AVANT_EXPIRATION) {
    etat = 'a-surveiller';
    raison = `jeton à renouveler : il expire le ${jourFr(jeton.expireLe)}, dans ${pluriel(jours, 'jour', 'jours')}${jeton.aConfirmer ? ' (date à confirmer)' : ''}`;
  } else if (!present && !c.bac) {
    etat = 'a-surveiller';
    raison = 'jeton absent (CLAUDE_CODE_OAUTH_TOKEN) : aucune analyse IA possible';
  } else if (!present) {
    etat = 'coupe';
    raison = 'jeton vidé et analyses coupées dans le bac à sable';
  }
  return ligne('claude', {
    etat,
    raison,
    resume:
      (jours < 0
        ? `Jeton expiré le ${jourFr(jeton.expireLe)}${jeton.aConfirmer ? ' (date à confirmer)' : ''}`
        : `Jeton valable jusqu’au ${jourFr(jeton.expireLe)} (dans ${pluriel(jours, 'jour', 'jours')})${jeton.aConfirmer ? ', date à confirmer' : ''}`) +
      (dernierOk ? ` ; dernier appel réussi le ${quand(dernierOk.at)}` : ' ; aucun appel réussi noté') +
      (dernier && dernier.statut !== 'ok' ? ` ; dernier appel en échec le ${quand(dernier.at)}` : '') +
      (jours < 0
        ? '. Les analyses IA échouent jusqu’au renouvellement du jeton (claude setup-token)'
        : raison && etat !== 'ok'
          ? `. ${raison.charAt(0).toUpperCase()}${raison.slice(1)}`
          : '') +
      '.',
    dernierReleve: { le: dernierOk?.at ?? null, quoi: 'dernier appel réussi (journal des appels Claude)' },
    limite: {
      texte: `expire le ${jourFr(jeton.expireLe)}${jeton.aConfirmer ? ' — à confirmer' : ''}`,
      valeur: jours,
      max: null,
      expireLe: jeton.expireLe,
      aConfirmer: jeton.aConfirmer,
      reglage: jeton.source
    },
    details: [
      jeton.source === 'enregistre'
        ? `date saisie le ${quand(jeton.majLe)}`
        : jeton.source === 'illisible'
          ? `réglage illisible (${jeton.probleme}) : date par défaut gardée, à confirmer`
          : 'date notée à la création du jeton (un an après le 30/09/2026), pas encore confirmée par Pierre',
      present ? 'jeton présent sur le serveur' : c.bac ? 'jeton vidé par le bac à sable' : 'jeton absent du serveur',
      'le budget de tokens se lit dans la carte « Budget Claude »'
    ],
    provenance: { quoi: 'réglage saisi par Pierre et journal des appels Claude', fichiers: [jeton.fichier, DOSSIER_JOURNAL] }
  });
}

// =========================================================== cotes gratuites

function ligneCotesGratuites({ refresh, c }) {
  const fois = derniereFoisQue(refresh, 'cotesGratuites');
  const sources = Array.isArray(fois?.etape?.details?.sources) ? fois.etape.details.sources : [];
  const enEchec = refresh?.alerts?.cotes?.sources ?? [];
  const actif = c.cotesGratuites;
  let etat = 'inconnu';
  let raison = null;
  if (enEchec.length) {
    etat = 'a-surveiller';
    raison = `${enEchec.map((s) => s.name ?? s.source).join(', ')} : ${String(enEchec[0].error ?? 'en échec').slice(0, 120)}`;
  } else if (fois) {
    etat = fois.etape.status === 'error' ? 'a-surveiller' : 'ok';
    if (etat !== 'ok') raison = String(fois.etape.summary ?? '').slice(0, 160);
  }
  return ligne('cotes-gratuites', {
    etat: !actif && etat !== 'a-surveiller' ? 'coupe' : etat,
    raison,
    coupure: c.bac ? 'Coupées dans le bac à sable : ce serveur ne les relève pas.' : 'Coupées (FREE_ODDS=false) : ce serveur ne les relève pas.',
    resume:
      etat === 'ok'
        ? `${sources.length ? sources.map((s) => `${s.nom ?? s.source} ${s.error ? 'en échec' : s.status === 'absent' ? 'absent' : `${nombre(s.written ?? 0)} cote(s)`}`).join(', ') : 'relevées'} à la passe du ${quand(fois.passe.finishedAt)}.`
        : etat === 'a-surveiller'
          ? `À surveiller : ${raison}.`
          : 'Aucune passe des cotes gratuites notée.',
    dernierReleve: { le: refresh?.stepsLastSuccess?.cotesGratuites ?? null, quoi: 'dernière passe des cotes gratuites' },
    limite: { texte: 'gratuites ; des cotes de RÉFÉRENCE, jamais jouables', valeur: null, max: null },
    details: [actif ? 'relevées à chaque passe d’actualisation (et par la boucle des cotes)' : c.bac ? 'coupées dans le bac à sable (CM_BAC_COTES_GRATUITES=1 pour un essai)' : 'coupées (FREE_ODDS=false)'],
    provenance: { quoi: 'bilan de l’étape « cotes gratuites » des passes d’actualisation', fichiers: [REFRESH_STATUS_FILE] }
  });
}

/**
 * Les six lignes de la carte « Santé des sources », lues dans les notes.
 * Jamais un appel réseau. Une ligne qui ne se lit pas est dite « état
 * inconnu » avec sa raison : la carte garde ses six lignes.
 */
export function etatDesSources({ database = null, maintenant = Date.now(), refresh = null, config = null } = {}) {
  const c = configAvec(config);
  let r = refresh;
  if (!r) {
    try {
      r = readRefreshStatus();
    } catch {
      r = null;
    }
  }
  const t = typeof maintenant === 'number' ? maintenant : Date.parse(maintenant);
  const lignes = [];
  const essayer = (cle, f) => {
    try {
      lignes.push(f());
    } catch (error) {
      lignes.push(ligne(cle, { etat: 'inconnu', raison: error.message, resume: `État illisible : ${String(error.message).slice(0, 160)}.` }));
    }
  };
  essayer('fotmob', () => ligneFotmob({ maintenant: t, refresh: r, c }));
  essayer('football-data', () => ligneFootballData({ database: database ?? openDb(), refresh: r }));
  essayer('odds-api', () => ligneOddsApi({ maintenant: t, c }));
  essayer('api-football', () => ligneApiFootball({ maintenant: t, c }));
  essayer('claude', () => ligneClaude({ maintenant: t, c }));
  essayer('cotes-gratuites', () => ligneCotesGratuites({ refresh: r, c }));
  return { le: new Date(t).toISOString(), sources: lignes, bac: c.bac };
}

/** Pour les écrans : le nom de fichier seul (le chemin complet reste au survol). */
export const nomDeFichier = (f) => (f ? path.basename(f) : null);
