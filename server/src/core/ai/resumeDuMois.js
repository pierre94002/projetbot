/**
 * resumeDuMois.js — LE RÉSUMÉ DU MOIS EN MOTS de la boucle de correction, écrit par Claude (étape 26 du plan, partie D,
 * 28/10/2026).
 * -----------------------------------------------------------------------
 * Une fois par mois, juste après le tri du mois (l'étape « boucleCorrection » le fait le 1er à partir de 6 h, après le gel
 * de la calibration), un court texte en mots simples pour Pierre : ce que dit le tri (malchance ou vrai défaut), ce qui
 * est arrivé aux corrections, ce qui l'attend. Même chemin que le bilan de la semaine de l'étape 42 (bulletinService.js) :
 *   1. la FICHE chiffrée, préparée par le code SANS TOKEN (data/correction/ficheDuMois.js) ;
 *   2. UN appel à Claude Code (le quota de l'abonnement, jamais l'API à la clé), Sonnet effort bas, par le point de
 *      passage commun (claudeCodeClient.js : le journal des appels le note, type « resume-mois ») ;
 *   3. la GARDE DES CHIFFRES (gardeDesChiffres.js, champs nommés `titre`, `phrase1`… — constat 13) : un seul nombre absent
 *      de la fiche et le texte est refusé, rien n'est affiché ;
 *   4. le RANGEMENT dans le magasin (depotCorrections.ecrireUnResume : le résumé et son entrée au journal en une
 *      transaction, jamais réécrit), ou l'essai raté noté (noterUnEssaiDeResume) — trois essais au plus, puis l'abandon ;
 *      un rangement raté après un appel réussi compte aussi (vérification finale, constat 4).
 *
 * DANS LE BUDGET DE L'ÉTAPE 4, comme le bulletin (décision 12 de l'orchestrateur) : le type « resume-mois » est un appel
 * AUTOMATIQUE (claudeUsageLedger.js, TYPES_AUTOMATIQUES) et un appel réussi PREND SA PLACE sur le plafond des 150
 * (enregistrerUsage, `resumeMois`) — le contrôle « compteur du plafond = appels automatiques du journal » reste juste ;
 * sans place (plafond atteint), rien ne part ; le plafond lui-même (dailyLimit) n'est JAMAIS changé. Le mode économe
 * compacte la fiche, il ne supprime pas le résumé. Coupé avec les analyses automatiques (AUTO_AI_ANALYSIS, comme le
 * bulletin) ; une panne de Claude vue dans la passe l'empêche de partir ; JAMAIS forcé par un clic.
 *
 * PAS D'APPEL POUR RIEN (constat 13) : aucune case jugée et rien d'autre que le tri au journal → le résumé est rangé
 * « sans appel », 0 token (le cas courant pendant l'essai du modèle de buts de l'étape 27). Le DERNIER mois trié
 * seulement : un long arrêt de l'appli ne fait jamais écrire les résumés des mois manqués.
 *
 * Tout est injectable (`options`), pour les essais : l'appel à Claude (`appeler`), la base, l'interrupteur, le plafond,
 * le mode, l'authentification. En service, rien n'est injecté. Le bac à sable n'appelle jamais Claude : les essais
 * remplacent l'appel (claudeCodeClient.__testing.simulerClaude, refusé hors d'une copie d'essai).
 * -----------------------------------------------------------------------
 */

import { callClaudeCode, ClaudeCodeIndisponible, isClaudeCodeAuthenticated } from './claudeCodeClient.js';
import { modeBudget } from './claudeBudget.js';
import { verifierLesChiffres, refusesDits } from './gardeDesChiffres.js';
import { demandeDuResume, lireLeResume, champsDuResume, ResumeInvalide } from './resumeDuMoisPrompt.js';
import { budgetRestant, enregistrerUsage, jourParis } from '../../data/repositories/autoAiAnalysisRepository.js';
import { tokensDe } from '../../data/repositories/claudeUsageLedger.js';
import { openDb } from '../../data/db/matchStatsDb.js';
import { lireLeTri, lireLeJournal, ecrireUnResume, noterUnEssaiDeResume, essaisDeResume } from '../../data/correction/depotCorrections.js';
import { etatDesCorrections, etatDuResume } from '../../data/correction/etatDesCorrections.js';
import { construireLaFicheDuMois, ficheDuMoisVide, raisonSansAppel, debutDuJournalDuResume, ESSAIS_MAX_DU_RESUME } from '../../data/correction/ficheDuMois.js';
import { nombreDit, deMois } from '../../data/correction/propositions.js';
import { listeDesMoisFiges } from '../../data/calibration.js';
import { env } from '../../config/env.js';

/** Le modèle et l'effort : ceux du bulletin et du bilan de la semaine (bulletinService.js) — la fiche fait le travail, l'IA écrit. */
export const REGLAGES_DE_L_IA = Object.freeze({ model: 'sonnet', effort: 'low' });
/** Le type de l'appel au journal (claudeUsageLedger.js, TYPES_APPEL et TYPES_AUTOMATIQUES). */
export const TYPE_D_APPEL = 'resume-mois';
/** Au plus tant d'entrées du journal relues pour la fiche (le journal d'un mois en a quelques dizaines). */
const JOURNAL_MAX = 1000;

const message = (error) => String(error?.message ?? error).slice(0, 240);
const sansPoint = (t) => String(t ?? '').replace(/[.\s]+$/, '');
/** L'estimation, en tokens, d'un texte français plein de chiffres : environ 3 caractères par token (la règle de bulletinFiches.js). */
const estimerLesTokens = (texte) => Math.ceil(String(texte ?? '').length / 3);
const resultat = (statut, code, resume, details = {}) => ({ statut, code, fait: code === 'ecrit' || code === 'ecrit-sans-appel', appelFait: Boolean(details.appelFait), resume, details });

/**
 * FAUT-IL ÉCRIRE LE RÉSUMÉ ? (lecture seule) — la décision de ficheDuMois.decisionDuResume sur le dernier mois trié,
 * lue par l'étape « resumeCorrection » (son « due » et son « pourquoi ») et par Santé du moteur.
 */
export function decisionDuResumeDuMois({ database = null, interrupteur = env.autoAiAnalysis.enabled } = {}) {
  return etatDuResume({ database, interrupteur });
}

/** Les entrées du journal de la boucle écrites APRÈS `depuis`, de la plus ancienne à la plus récente (au plus JOURNAL_MAX). */
function journalDepuis(database, depuis) {
  const out = [];
  let avant = null;
  for (;;) {
    const page = lireLeJournal({ database, avant, limite: 200 });
    for (const e of page) {
      if (depuis && String(e.le) <= String(depuis)) return out.reverse();
      out.push(e);
      if (out.length >= JOURNAL_MAX) return out.reverse();
    }
    if (page.length < 200) return out.reverse();
    avant = page.at(-1).n;
  }
}

/**
 * ÉCRIT LE RÉSUMÉ DU DERNIER MOIS TRIÉ, si c'est le moment (la décision), dans l'ordre le moins cher : la décision (rien
 * à lire d'autre), la fiche (lectures sans token), la fiche vide (rangée sans appel, 0 token), l'authentification, la
 * panne de la passe, le plafond, puis l'appel.
 * @returns {Promise<{ statut: 'ok'|'warn'|'error', code: string, fait: boolean, appelFait: boolean, resume: string, details: object }>}
 */
export async function produireLeResumeDuMois({ maintenant = Date.now(), ctx = null, options = {} } = {}) {
  const interrupteur = options.interrupteur ?? env.autoAiAnalysis.enabled;
  const d = etatDuResume({ database: options.database ?? null, interrupteur });
  const jour = jourParis(new Date(maintenant));
  const commun = { mois: d.mois, version: d.version, jour };
  if (d.code === 'illisible') return resultat('error', 'illisible', d.pourquoi, commun);
  if (!d.du) return resultat('ok', d.code, d.pourquoi, { ...commun, essais: d.essais });
  const leMois = deMois(d.mois);

  // 1. Les lectures, sans token : le tri, le journal depuis le dernier résumé, l'état des corrections, la calibration figée.
  let db;
  let tri;
  let depuis;
  let journal;
  try {
    db = options.database ?? openDb();
    tri = lireLeTri(d.mois, { database: db, version: d.version });
    depuis = debutDuJournalDuResume({ mois: d.mois, dernierResumeLe: lireLeJournal({ database: db, evenement: 'resume-ecrit', limite: 1 })[0]?.le ?? null });
    journal = journalDepuis(db, depuis);
  } catch (error) {
    return resultat('error', 'illisible', `Les tables de la boucle de correction ne se lisent pas (${message(error)}) : le résumé ${leMois} attend, aucun appel.`, commun);
  }
  if (!tri) return resultat('error', 'illisible', `Le tri ${leMois} ne se relit pas : le résumé attend, aucun appel.`, commun);
  const problemes = [];
  let etat = options.etat ?? null;
  if (!etat) {
    try {
      etat = etatDesCorrections({ database: db, maintenant });
    } catch (error) {
      etat = null;
      problemes.push(`L’état des corrections ne se lit pas (${message(error)}) : ne dis rien des propositions.`);
    }
  }
  if (etat && etat.disponible === false) problemes.push(`L’état des corrections est illisible (${etat.raison ?? 'raison inconnue'}) : ne dis rien des propositions.`);
  let calibration = null;
  try {
    calibration = listeDesMoisFiges({ database: db }).find((m) => m.mois === d.mois)?.resume ?? null;
  } catch (error) {
    problemes.push(`Le bilan figé de la calibration ne se lit pas (${message(error)}).`);
  }
  let mode;
  try {
    mode = options.mode ?? modeBudget({ maintenant });
  } catch (error) {
    mode = { mode: 'normal', econome: false, raison: `Mode normal (le budget ne se lit pas : ${message(error)}).` };
  }
  const fiche = construireLaFicheDuMois({ tri, journal, depuis, etat: etat?.disponible === false ? null : etat, calibration, econome: Boolean(mode.econome), problemes });

  // 2. Rien à dire (constat 13) : rangé sans appel — ni Claude, ni plafond, 0 token.
  if (ficheDuMoisVide(fiche)) {
    const raison = raisonSansAppel(fiche);
    let ecrit;
    try {
      ecrit = ecrireUnResume(
        { mois: d.mois, version: d.version, modele: null, mode: mode.mode ?? 'normal', texte: null, fiche: null, garde: null, usage: null, coutUsd: null, essai: 0, sansAppel: true, raison },
        { database: db, maintenant, phrase: `Résumé ${leMois} rangé sans appel à Claude : rien à commenter (aucune case jugée, rien d’autre que le tri au journal).` }
      ).ecrit;
    } catch (error) {
      return resultat('error', 'ecriture', `Le résumé ${leMois} (sans appel) n’a pas pu être rangé (${message(error)}) : la passe suivante recommence.`, commun);
    }
    if (!ecrit) return resultat('ok', 'deja-fait', `Le résumé ${leMois} a été rangé entre-temps : rien à faire.`, commun);
    return resultat('ok', 'ecrit-sans-appel', raison, { ...commun, mode: mode.mode ?? 'normal', appelFait: false });
  }

  // 3. Les conditions de l'appel : Claude Code connecté, pas de panne vue dans la passe, une place sur le plafond.
  const authentifie = options.authentifie ?? isClaudeCodeAuthenticated();
  if (!authentifie) return resultat('warn', 'non-configure', `Claude Code non configuré (CLAUDE_CODE_OAUTH_TOKEN absent de server/.env) : le résumé ${leMois} attend, rien écrit.`, commun);
  if (ctx?.claudeEnPanne) {
    return resultat('warn', 'panne-en-cours', `Claude Code est en panne à cette passe (les analyses se sont arrêtées sur des pannes d’affilée) : le résumé ${leMois} est repoussé à la passe suivante, aucun appel.`, commun);
  }
  const plafond = options.plafond ?? env.autoAiAnalysis.dailyLimit;
  if (budgetRestant(jour, plafond) <= 0) return resultat('ok', 'plafond', `Plafond quotidien (${nombreDit(plafond)}) atteint : le résumé ${leMois} attend, reprise demain.`, { ...commun, plafond });

  // 4. L'appel : un seul, par Claude Code.
  let apresUnRefus = false;
  try {
    apresUnRefus = essaisDeResume(d.mois, { database: db, version: d.version }).some((e) => e.type === 'chiffres');
  } catch {
    apresUnRefus = false;
  }
  const demande = demandeDuResume(fiche, { apresUnRefus });
  const taille = { consignes: demande.system.length, message: demande.userMessage.length };
  const tokensDeLaFiche = estimerLesTokens(demande.userMessage);
  const appeler = options.appeler ?? callClaudeCode;
  const essaiNumero = d.essais + 1;
  const sur = `essai ${nombreDit(essaiNumero)} sur ${nombreDit(ESSAIS_MAX_DU_RESUME)}`;
  const rate = (type, raison, tokens = null) => {
    try {
      noterUnEssaiDeResume({ mois: d.mois, version: d.version, type, raison: String(raison).slice(0, 300), tokens }, { database: db, maintenant });
      return true;
    } catch (error) {
      console.warn(`[résumé du mois] essai raté non noté : ${message(error)}`);
      return false;
    }
  };

  let reponse;
  try {
    reponse = await appeler({
      system: demande.system,
      userMessage: demande.userMessage,
      jsonSchema: demande.jsonSchema,
      ...REGLAGES_DE_L_IA,
      appel: { type: TYPE_D_APPEL, detail: `résumé ${leMois}`, mode: mode.mode ?? 'normal', taille }
    });
  } catch (error) {
    // Une panne touchera aussi les appels suivants (ClaudeCodeIndisponible) ; un schéma non respecté est propre à cette réponse.
    const panne = error instanceof ClaudeCodeIndisponible;
    rate(panne ? 'panne' : 'forme', error.message);
    return resultat(
      panne ? 'error' : 'warn',
      panne ? 'panne' : 'forme',
      panne
        ? `Panne de Claude Code (${sansPoint(String(error.message).slice(0, 160))}) : rien d’écrit, ${sur}, nouvel essai à la passe suivante.`
        : `La réponse de Claude n’a pas la forme demandée (${sansPoint(String(error.message).slice(0, 160))}) : rien d’écrit, ${sur}.`,
      { ...commun, appelFait: true, essai: essaiNumero, mode: mode.mode ?? 'normal', tokensDeLaFiche }
    );
  }

  // L'appel a réussi : il a consommé du quota et PREND SA PLACE sur le plafond des 150, que la garde accepte le texte ou non.
  try {
    enregistrerUsage(jour, { resumeMois: 1 });
  } catch (error) {
    console.warn(`[résumé du mois] compteur du plafond non mis à jour : ${message(error)}`);
  }
  const usage = tokensDe(reponse.usage);

  let texte;
  try {
    texte = lireLeResume(reponse.structuredOutput);
  } catch (error) {
    if (!(error instanceof ResumeInvalide)) throw error;
    rate('forme', error.message, usage?.total ?? null);
    return resultat('warn', 'forme', `La réponse de Claude n’a pas la forme demandée (${error.message}) : rien d’écrit, ${sur}.`, { ...commun, appelFait: true, essai: essaiNumero, mode: mode.mode ?? 'normal', tokens: usage?.total ?? null, tokensDeLaFiche });
  }

  // 5. LA GARDE DES CHIFFRES : tout nombre du texte doit être dans la fiche, sinon le texte est refusé.
  const garde = verifierLesChiffres({ textes: champsDuResume(texte), fiche: demande.ficheTexte });
  if (!garde.ok) {
    rate('chiffres', `chiffres absents de la fiche : ${refusesDits(garde.refuses)}`, usage?.total ?? null);
    return resultat(
      'warn',
      'chiffres-refuses',
      `Texte refusé : il citait ${refusesDits(garde.refuses)}, absent(s) de la fiche. Rien n’est affiché ; ${sur}, nouvel essai à la passe suivante.`,
      { ...commun, appelFait: true, essai: essaiNumero, mode: mode.mode ?? 'normal', tokens: usage?.total ?? null, tokensDeLaFiche, refuses: garde.refuses }
    );
  }

  // 6. Le rangement : le résumé et son entrée au journal, en une transaction ; jamais réécrit.
  const entree = {
    mois: d.mois,
    version: d.version,
    modele: 'claude-code:sonnet',
    mode: mode.mode ?? 'normal',
    texte,
    fiche: demande.ficheTexte,
    garde: { politique: 'refuser', nombresVus: garde.nombresVus, nombresDeLaFiche: garde.nombresDeLaFiche },
    usage,
    coutUsd: reponse.costUsd ?? null,
    essai: essaiNumero,
    sansAppel: false,
    raison: null
  };
  let ecrit;
  try {
    ecrit = ecrireUnResume(entree, { database: db, maintenant, phrase: `Résumé ${leMois} écrit par Claude (Sonnet) : ${nombreDit(texte.phrases.length)} phrase${texte.phrases.length >= 2 ? 's' : ''}, chiffres vérifiés.` }).ecrit;
  } catch (error) {
    // Vérification finale, constat 4 : l'appel a réussi (et compte sur le plafond) mais le rangement a échoué — l'échec
    // compte parmi les trois essais, sinon chaque passe referait un appel (l'abandon vient au troisième, comme les autres).
    rate('ecriture', `le rangement a échoué : ${message(error)}`, usage?.total ?? null);
    return resultat('error', 'ecriture', `Le résumé ${leMois} n’a pas pu être rangé (${message(error)}) : l’appel est au journal ; ${sur}, nouvel essai à la passe suivante.`, { ...commun, appelFait: true, essai: essaiNumero, tokens: usage?.total ?? null });
  }
  if (!ecrit) {
    return resultat('warn', 'deja-ecrit', `Le résumé ${leMois} a été rangé pendant l’appel : le premier est gardé, celui-ci est jeté (il est au journal).`, { ...commun, appelFait: true, essai: essaiNumero, tokens: usage?.total ?? null });
  }
  return resultat(
    'ok',
    'ecrit',
    `Résumé ${leMois} écrit en un seul appel à Claude Code (${nombreDit(usage?.total ?? 0)} tokens, mode ${mode.econome ? 'économe' : 'normal'}) : ${nombreDit(texte.phrases.length)} phrase${texte.phrases.length >= 2 ? 's' : ''}, ${nombreDit(garde.nombresVus)} nombre${garde.nombresVus >= 2 ? 's' : ''} cité${garde.nombresVus >= 2 ? 's' : ''}, tous dans la fiche. Il se lit dans Santé du moteur.`,
    { ...commun, appelFait: true, essai: essaiNumero, mode: mode.mode ?? 'normal', tokens: usage?.total ?? null, coutUsd: reponse.costUsd ?? null, tokensDeLaFiche, phrases: texte.phrases.length, nombresVus: garde.nombresVus }
  );
}
