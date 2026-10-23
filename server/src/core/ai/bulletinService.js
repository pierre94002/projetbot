/**
 * bulletinService.js — le BULLETIN DU JOUR et le BILAN DE LA SEMAINE, écrits par l'IA (étape 42 du plan, 22/10/2026).
 * -----------------------------------------------------------------------
 * Deux textes, deux appels à Claude Code (le quota de l'abonnement de Pierre, jamais l'API à la clé) :
 *   - le BULLETIN, une fois par jour, le matin (pas avant 6 h, heure de Paris) : ce qui vaut le coup aujourd'hui et pourquoi ;
 *   - le BILAN, une fois par semaine (celle qui vient de finir, du lundi au dimanche) : ce qui a marché, ce qui a perdu, où
 *     l'IA s'est trompée.
 * Le code prépare d'abord une fiche chiffrée compacte, sans token (bulletinFiches.js) ; l'IA résume et commente ; la garde des
 * chiffres (gardeDesChiffres.js) refuse tout texte qui cite un nombre absent de la fiche ; le texte est rangé dans
 * data/runtime/ai-bulletins.json (aiBulletinRepository.js, par atomicJson).
 *
 * COMMENT ILS ENTRENT DANS LE BUDGET DE L'ÉTAPE 4 — comme les analyses automatiques, rien de plus, rien de moins :
 *   - le JOURNAL des appels les note au point de passage commun (claudeCodeClient.js) avec un type à eux (`bulletin`,
 *     `bilan-semaine`), leurs tokens et le mode du moment ;
 *   - le PLAFOND de 150 les compte : un appel réussi prend une place (enregistrerUsage), et sans place (budgetRestant à 0) rien
 *     ne part. Le plafond lui-même n'est pas touché ;
 *   - le MODE ÉCONOME (80 % du budget du jour ou de la semaine, ou choisi dans Réglages) les COMPACTE : la fiche a moins de
 *     lignes (LIMITES.econome) et l'IA est priée d'être brève. Il ne les supprime pas : un bulletin par jour, un bilan par
 *     semaine, quel que soit le mode ;
 *   - les PANNES se traitent comme pour les analyses : une panne de Claude Code (pas de réponse, jeton refusé, quota épuisé) arrête
 *     l'étape sans rien écrire, et une panne déjà constatée dans la passe par les analyses (`ctx.claudeEnPanne`) l'empêche
 *     de partir ; la passe suivante recommence ; au plus ESSAIS_MAX essais ratés par clé (par jour pour le bulletin, par semaine
 *     pour le bilan : chaque essai raté a consommé du quota), puis l'abandon, dit à l'écran ;
 *   - JAMAIS FORCÉS par un clic « Actualiser maintenant » : ni l'interrupteur des analyses automatiques (AUTO_AI_ANALYSIS) ni la règle
 *     « une fois » ne cèdent à un clic, comme les étapes d'analyse.
 *
 * UNE FOIS : la décision lit data/runtime/ai-bulletins.json (jamais l'historique de passes, qui ne dit pas si un texte a été
 * écrit) ; un texte déjà écrit pour le jour ou la semaine empêche tout appel, et le dépôt refuse de toute façon de l'écraser. Un
 * fichier illisible empêche l'appel : un texte qu'on ne pourrait pas ranger aurait coûté du quota pour rien.
 *
 * RATTRAPAGE : le bulletin se fait à la première passe d'un jour à partir de 6 h (la passe « au démarrage » après une nuit
 * d'arrêt le rattrape) ; le bilan à la première passe d'après la fin de la semaine — un seul, celui de la DERNIÈRE semaine
 * complète, jamais ceux des semaines manquées.
 *
 * Tout est injectable (`options`), pour les essais : l'appel à Claude (`appeler`), le fichier, le plafond, l'interrupteur, la lecture
 * des entrées. En service, rien n'est injecté. Aucun essai n'appelle un vrai Claude.
 * -----------------------------------------------------------------------
 */

import { callClaudeCode, ClaudeCodeIndisponible, isClaudeCodeAuthenticated } from './claudeCodeClient.js';
import { modeBudget } from './claudeBudget.js';
import {
  lireLesEntreesDuJour,
  construireLaFicheDuJour,
  ficheDuJourVide,
  lireLesEntreesDeLaSemaine,
  construireLaFicheDeLaSemaine,
  ficheDeLaSemaineVide,
  semaineEcoulee,
  semaineEnLettres,
  jourEnLettres,
  jourCourt,
  jourEtHeureDits,
  estimerLesTokens
} from './bulletinFiches.js';
import { demandeDuBulletin, demandeDuBilan, lireLeTexte, champsDuTexte, TexteInvalide } from './bulletinPrompt.js';
import { verifierLesChiffres, refusesDits } from './gardeDesChiffres.js';
import { budgetRestant, enregistrerUsage, jourParis } from '../../data/repositories/autoAiAnalysisRepository.js';
import { tokensDe } from '../../data/repositories/claudeUsageLedger.js';
import { lireLesBulletins, ecrireUnBulletin, ecrireUnBilan, noterUnEssaiRate, essaisRates, FICHIER_BULLETINS, GARDER_BULLETINS, GARDER_BILANS } from '../../data/repositories/aiBulletinRepository.js';
import { enregistrerSansPerdre } from '../../utils/atomicJson.js';
import { env } from '../../config/env.js';

// ------------------------------------------------------------------ les règles
/** Le bulletin du matin ne se fait pas avant cette heure (Paris) : composition, cotes et contrôle de la nuit sont alors faits. */
export const HEURE_DU_BULLETIN = 6;
/** Essais ratés (appel en échec, forme non respectée, chiffres refusés) par jour pour le bulletin, par semaine pour le bilan, avant l'abandon. */
export const ESSAIS_MAX = 3;
/** Passé cette heure, le bulletin part même si le Repérage n'est pas prêt (sa rubrique le dit) — s'il reste des matchs de vos favoris à commenter. */
export const HEURE_SANS_OPPORTUNITES = 12;
/** Le modèle et l'effort : ceux des analyses de match (Sonnet, effort bas) — la fiche fait le travail, l'IA écrit. */
export const REGLAGES_DE_L_IA = Object.freeze({ model: 'sonnet', effort: 'low' });
/** Les règles dites à l'écran. */
export const REGLES = Object.freeze({
  heureDuBulletin: HEURE_DU_BULLETIN,
  essaisMax: ESSAIS_MAX,
  heureSansOpportunites: HEURE_SANS_OPPORTUNITES,
  garderBulletins: GARDER_BULLETINS,
  garderBilans: GARDER_BILANS,
  politiqueDesChiffres: 'refuser',
  modele: 'Claude Sonnet (Claude Code, quota de l’abonnement)'
});

/** L'heure (0 à 23) à Paris d'un instant. */
export function heureDeParis(maintenant = Date.now()) {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Paris' }).format(new Date(maintenant)));
}

const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
/** Un message sans son point final (il est repris dans une phrase qui a le sien). */
const sansPoint = (t) => String(t).replace(/\.\s*$/, '');
const heureDite = (iso) => jourEtHeureDits(iso)?.replace(/^.* à /, '') ?? 'heure inconnue';

// ------------------------------------------------------------------ la décision
/**
 * Faut-il écrire le texte maintenant ? Pure. `lu` : ce que rend lireLesBulletins. Rend { genre, cle, du, code, pourquoi, essais }.
 * Les codes : interrupteur, illisible (due : l'étape le DIT), deja-fait, trop-tot, essais-epuises, a-faire.
 */
function decision(genre, { maintenant, lu, interrupteur }) {
  const jour = jourParis(new Date(maintenant));
  const semaine = semaineEcoulee(jour);
  const cle = genre === 'bulletin' ? jour : semaine.cle;
  const base = { genre, cle, jour, ...(genre === 'bilan' ? { semaine: { cle: semaine.cle, du: semaine.du, au: semaine.au, enLettres: semaineEnLettres(semaine) } } : {}) };
  const nom = genre === 'bulletin' ? `Le bulletin du ${jourCourt(jour)}` : `Le bilan de la semaine du ${jourCourt(semaine.du)} au ${jourCourt(semaine.au)}`;
  if (!interrupteur) return { ...base, du: false, code: 'interrupteur', pourquoi: 'Les analyses IA automatiques sont coupées (AUTO_AI_ANALYSIS=false) : ni le bulletin ni le bilan ne se font.', essais: 0 };
  if (lu.etat === 'illisible') return { ...base, du: true, code: 'illisible', pourquoi: `${sansPoint(lu.erreur)} — aucun appel à Claude ne part tant que ce fichier ne se relit pas.`, essais: 0 };
  const existant = (genre === 'bulletin' ? lu.donnees.bulletins : lu.donnees.bilans)[cle];
  const essais = essaisRates(lu.donnees, genre, cle);
  if (existant) return { ...base, du: false, code: 'deja-fait', pourquoi: `${nom} est déjà écrit (à ${heureDite(existant.ecritLe)}) : un seul par ${genre === 'bulletin' ? 'jour' : 'semaine'}.`, essais: essais.length, ecritLe: existant.ecritLe };
  if (heureDeParis(maintenant) < HEURE_DU_BULLETIN) return { ...base, du: false, code: 'trop-tot', pourquoi: `Pas avant ${HEURE_DU_BULLETIN} h (heure de Paris) : ${genre === 'bulletin' ? 'le bulletin du matin' : 'le bilan de la semaine'} attend.`, essais: essais.length };
  if (essais.length >= ESSAIS_MAX) {
    return { ...base, du: false, code: 'essais-epuises', pourquoi: `Abandonné ${genre === 'bulletin' ? 'pour aujourd’hui' : 'pour cette semaine'} : ${nombre(essais.length)} essais ratés (dernier : ${sansPoint(essais.at(-1)?.raison ?? 'raison inconnue')}). Nouvel essai ${genre === 'bulletin' ? 'demain' : 'la semaine prochaine'}.`, essais: essais.length };
  }
  return { ...base, du: true, code: 'a-faire', pourquoi: essais.length ? `À faire (${nombre(essais.length)} essai raté, ${nombre(ESSAIS_MAX)} au plus).` : 'À faire.', essais: essais.length };
}

/** La décision pour le bulletin d'aujourd'hui. */
export function decisionDuBulletin({ maintenant = Date.now(), lu = lireLesBulletins(), interrupteur = env.autoAiAnalysis.enabled } = {}) {
  return decision('bulletin', { maintenant, lu, interrupteur });
}

/** La décision pour le bilan de la dernière semaine complète. */
export function decisionDuBilan({ maintenant = Date.now(), lu = lireLesBulletins(), interrupteur = env.autoAiAnalysis.enabled } = {}) {
  return decision('bilan', { maintenant, lu, interrupteur });
}

// ------------------------------------------------------------------ produire un texte
const GENRES = {
  bulletin: {
    type: 'bulletin',
    detail: (cle) => `bulletin du ${cle}`,
    usage: { bulletin: 1 },
    decider: decisionDuBulletin,
    lire: (maintenant, o) => lireLesEntreesDuJour({ maintenant, ...(o.entreesOptions ?? {}) }),
    construire: construireLaFicheDuJour,
    vide: ficheDuJourVide,
    demande: demandeDuBulletin,
    ecrire: ecrireUnBulletin,
    nom: (d) => `Bulletin du ${jourEnLettres(d.jour)}`,
    videDit: "Rien à commenter aujourd'hui (aucun pari repéré, aucune chute de cote, aucun match de vos favoris) : aucun appel à Claude, 0 token."
  },
  bilan: {
    type: 'bilan-semaine',
    detail: (cle) => `bilan de la semaine du ${cle}`,
    usage: { bilanSemaine: 1 },
    decider: decisionDuBilan,
    lire: (maintenant, o) => lireLesEntreesDeLaSemaine({ maintenant, ...(o.entreesOptions ?? {}) }),
    construire: construireLaFicheDeLaSemaine,
    vide: ficheDeLaSemaineVide,
    demande: demandeDuBilan,
    ecrire: ecrireUnBilan,
    nom: (d) => `Bilan de la semaine ${d.semaine.enLettres}`,
    videDit: 'Rien à commenter cette semaine (aucun pronostic réglé, aucun pari réglé, aucun avis de l’IA jugé) : aucun appel à Claude, 0 token.'
  }
};

const resultat = (statut, code, resume, details = {}) => ({ statut, code, fait: code === 'ecrit' || code === 'ecrit-sans-appel', appelFait: Boolean(details.appelFait), resume, details });

/**
 * Écrit le bulletin du jour ou le bilan de la semaine, SI c'est le moment (la décision), dans l'ordre le moins cher :
 * l'interrupteur et la règle « une fois » (rien à lire), l'authentification, la panne de la passe, le plafond, puis la fiche
 * (lectures sans token), le mode du budget, la fiche vide (pas d'appel), et enfin l'appel.
 *
 * @param {'bulletin'|'bilan'} genre
 * @param {object} p  { maintenant, ctx, options }
 * @returns {Promise<{ statut: 'ok'|'warn'|'error', code: string, fait: boolean, appelFait: boolean, resume: string, details: object }>}
 */
async function produire(genre, { maintenant = Date.now(), ctx = null, options = {} } = {}) {
  const g = GENRES[genre];
  const fichier = options.fichier ?? FICHIER_BULLETINS;
  const interrupteur = options.interrupteur ?? env.autoAiAnalysis.enabled;
  const lu = lireLesBulletins({ fichier });
  const d = g.decider({ maintenant, lu, interrupteur });
  const jour = jourParis(new Date(maintenant));
  const commun = { genre, cle: d.cle, jour };

  if (d.code === 'illisible') return resultat('error', 'illisible', d.pourquoi, { ...commun });
  if (!d.du) return resultat('ok', d.code, d.pourquoi, { ...commun, essais: d.essais });

  const authentifie = options.authentifie ?? isClaudeCodeAuthenticated();
  if (!authentifie) return resultat('warn', 'non-configure', 'Claude Code non configuré (CLAUDE_CODE_OAUTH_TOKEN absent de server/.env) : rien écrit.', { ...commun });
  if (ctx?.claudeEnPanne) {
    return resultat('warn', 'panne-en-cours', `Claude Code est en panne à cette passe (les analyses se sont arrêtées sur des pannes d’affilée) : ${genre === 'bulletin' ? 'le bulletin' : 'le bilan'} est repoussé à la passe suivante, aucun appel.`, { ...commun });
  }
  const plafond = options.plafond ?? env.autoAiAnalysis.dailyLimit;
  if (budgetRestant(jour, plafond) <= 0) {
    return resultat('ok', 'plafond', `Plafond quotidien (${nombre(plafond)}) atteint : ${genre === 'bulletin' ? 'le bulletin' : 'le bilan'} attend, reprise demain.`, { ...commun, plafond });
  }

  // Les lectures (sans token), puis le mode du budget.
  let mode;
  try {
    mode = options.mode ?? modeBudget({ maintenant });
  } catch (error) {
    mode = { mode: 'normal', econome: false, raison: `Mode normal (le budget ne se lit pas : ${error.message}).` };
  }
  const entrees = options.entrees ?? (await g.lire(maintenant, options));
  const fiche = g.construire(entrees, { econome: mode.econome });

  // Le bulletin sans Repérage : il attend le matin ; l'après-midi il part avec ce qu'il y a.
  if (genre === 'bulletin' && fiche.opportunites.etat !== 'pret') {
    const raison = fiche.opportunites.etat === 'en-calcul' ? 'le Repérage est encore en calcul' : `le Repérage n’a rien rendu : ${sansPoint(fiche.opportunites.erreur ?? 'raison inconnue')}`;
    if (heureDeParis(maintenant) < HEURE_SANS_OPPORTUNITES) {
      return resultat('ok', 'opportunites-en-attente', `Les opportunités du jour ne sont pas prêtes (${raison}) : le bulletin attend la passe suivante, aucun appel.`, { ...commun, opportunites: fiche.opportunites.etat });
    }
    if (!fiche.favoris.matchsDuJour) {
      return resultat('ok', 'opportunites-en-attente', `Les opportunités du jour ne sont pas prêtes (${raison}) et aucun match de vos favoris ne se joue : rien à écrire pour l’instant, aucun appel.`, { ...commun, opportunites: fiche.opportunites.etat });
    }
  }

  // Rien à dire : le jour (ou la semaine) est fait, sans appel.
  if (g.vide(fiche)) {
    const entree = { ...(genre === 'bilan' ? { semaine: d.semaine } : { jour: d.jour }), ecritLe: new Date(maintenant).toISOString(), modele: null, mode: mode.mode, texte: null, sansAppel: true, raison: g.videDit, fiche: null, garde: null, usage: null, coutUsd: null, essai: 0 };
    const ecriture = await enregistrerSansPerdre(() => g.ecrire(d.cle, entree, { fichier, maintenant }), `${genre} IA`);
    if (!ecriture.ecrit) return resultat('ok', 'deja-fait', `${g.nom(d)} a été écrit entre-temps : rien à faire.`, { ...commun });
    return resultat('ok', 'ecrit-sans-appel', g.videDit, { ...commun, mode: mode.mode, appelFait: false });
  }

  // L'appel : un seul, par Claude Code.
  const demande = g.demande(fiche, { apresUnRefus: d.essais > 0 && essaisRates(lu.donnees, genre, d.cle).some((e) => e.type === 'chiffres') });
  const taille = { consignes: demande.system.length, message: demande.userMessage.length };
  const tokensDeLaFiche = estimerLesTokens(demande.userMessage);
  const appeler = options.appeler ?? callClaudeCode;
  const essaiNumero = d.essais + 1;
  const rate = (type, raison, statut, extra = {}) => {
    let noteLeEssai = true;
    try {
      noterUnEssaiRate(genre, d.cle, { type, raison: String(raison).slice(0, 300), ...extra }, { fichier, maintenant });
    } catch (error) {
      noteLeEssai = false;
      console.warn(`[${genre} IA] essai raté non noté : ${error.message}`);
    }
    return { statut, noteLeEssai, restants: Math.max(0, ESSAIS_MAX - essaiNumero) };
  };

  let reponse;
  try {
    reponse = await appeler({
      system: demande.system,
      userMessage: demande.userMessage,
      jsonSchema: demande.jsonSchema,
      ...REGLAGES_DE_L_IA,
      appel: { type: g.type, detail: g.detail(d.cle), mode: mode.mode, taille }
    });
  } catch (error) {
    // Une panne touchera aussi les appels suivants (ClaudeCodeIndisponible) ; un schéma non respecté est propre à cette réponse.
    const panne = error instanceof ClaudeCodeIndisponible;
    const r = rate(panne ? 'panne' : 'forme', error.message, panne ? 'error' : 'warn');
    return resultat(
      r.statut,
      panne ? 'panne' : 'forme',
      panne
        ? `Panne de Claude Code (${sansPoint(String(error.message).slice(0, 160))}) : rien d’écrit, essai ${nombre(essaiNumero)} sur ${nombre(ESSAIS_MAX)}, nouvel essai à la passe suivante.`
        : `La réponse de Claude n’a pas la forme demandée (${sansPoint(String(error.message).slice(0, 160))}) : rien d’écrit, essai ${nombre(essaiNumero)} sur ${nombre(ESSAIS_MAX)}.`,
      { ...commun, appelFait: true, essai: essaiNumero, mode: mode.mode, tokensDeLaFiche }
    );
  }

  // L'appel a réussi : il a consommé du quota et prend sa place sur le plafond, que la garde accepte le texte ou non.
  try {
    enregistrerUsage(jour, g.usage);
  } catch (error) {
    console.warn(`[${genre} IA] compteur du plafond non mis à jour : ${error.message}`);
  }
  const usage = tokensDe(reponse.usage);

  let texte;
  try {
    texte = lireLeTexte(reponse.structuredOutput, genre);
  } catch (error) {
    if (!(error instanceof TexteInvalide)) throw error;
    rate('forme', error.message, 'warn', { tokens: usage?.total ?? null });
    return resultat('warn', 'forme', `La réponse de Claude n’a pas la forme demandée (${error.message}) : rien d’écrit, essai ${nombre(essaiNumero)} sur ${nombre(ESSAIS_MAX)}.`, { ...commun, appelFait: true, essai: essaiNumero, mode: mode.mode, tokens: usage?.total ?? null, tokensDeLaFiche });
  }

  // LA GARDE DES CHIFFRES : tout nombre du texte doit être dans la fiche, sinon le texte est refusé.
  const garde = verifierLesChiffres({ textes: champsDuTexte(texte), fiche: demande.ficheTexte });
  if (!garde.ok) {
    rate('chiffres', `chiffres absents de la fiche : ${refusesDits(garde.refuses)}`, 'warn', { tokens: usage?.total ?? null, refuses: garde.refuses.slice(0, 12).map((x) => ({ nombre: x.nombre, champ: x.champ, extrait: x.extrait })) });
    return resultat(
      'warn',
      'chiffres-refuses',
      `Texte refusé : il citait ${refusesDits(garde.refuses)}, absent(s) de la fiche. Rien n’est affiché ; essai ${nombre(essaiNumero)} sur ${nombre(ESSAIS_MAX)}, nouvel essai à la passe suivante.`,
      { ...commun, appelFait: true, essai: essaiNumero, mode: mode.mode, tokens: usage?.total ?? null, tokensDeLaFiche, refuses: garde.refuses }
    );
  }

  const entree = {
    ...(genre === 'bilan' ? { semaine: d.semaine } : { jour: d.jour }),
    ecritLe: new Date(maintenant).toISOString(),
    modele: 'claude-code:sonnet',
    mode: mode.mode,
    texte,
    sansAppel: false,
    raison: null,
    fiche: demande.ficheTexte,
    garde: { politique: 'refuser', nombresVus: garde.nombresVus, nombresDeLaFiche: garde.nombresDeLaFiche },
    usage,
    coutUsd: reponse.costUsd ?? null,
    essai: essaiNumero
  };
  // Un appel vient de coûter du quota : jamais jeté sur un blocage OneDrive (nouvelles tentatives sur une vingtaine de secondes).
  const ecriture = await enregistrerSansPerdre(() => g.ecrire(d.cle, entree, { fichier, maintenant }), `${genre} IA`);
  if (!ecriture.ecrit) {
    // Un autre écrivain a rangé un texte entre la décision et l'appel : le premier reste, celui-ci est jeté (il a coûté, il est au journal).
    return resultat('warn', 'deja-ecrit', `${g.nom(d)} a été écrit pendant l’appel : le premier est gardé, celui-ci est jeté.`, { ...commun, appelFait: true, essai: essaiNumero, mode: mode.mode, tokens: usage?.total ?? null, tokensDeLaFiche });
  }
  return resultat(
    'ok',
    'ecrit',
    `${g.nom(d)} écrit en un seul appel à Claude Code (${nombre(usage?.total ?? 0)} tokens, mode ${mode.econome ? 'économe' : 'normal'}) : ${nombre(texte.sections.length)} partie(s), ${nombre(garde.nombresVus)} nombre(s) cité(s), tous dans la fiche. Il se lit dans Réglages.`,
    { ...commun, appelFait: true, essai: essaiNumero, mode: mode.mode, tokens: usage?.total ?? null, coutUsd: reponse.costUsd ?? null, tokensDeLaFiche, sections: texte.sections.length, nombresVus: garde.nombresVus }
  );
}

/** Écrit le bulletin du jour s'il est dû. Cf. produire. */
export function produireLeBulletin(p = {}) {
  return produire('bulletin', p);
}

/** Écrit le bilan de la dernière semaine complète s'il est dû. Cf. produire. */
export function produireLeBilan(p = {}) {
  return produire('bilan', p);
}

// ------------------------------------------------------------------ ce que lit l'écran
const resume = (entree, genre) =>
  entree
    ? {
        cle: genre === 'bulletin' ? entree.jour : entree.semaine?.cle,
        titre: entree.texte?.titre ?? null,
        ecritLe: entree.ecritLe,
        sansAppel: Boolean(entree.sansAppel),
        mode: entree.mode ?? null,
        tokens: entree.usage?.total ?? null,
        essai: entree.essai ?? null
      }
    : null;

/**
 * L'état complet que lit GET /api/match-ai-analysis/bulletins : le bulletin d'aujourd'hui et le bilan de la dernière semaine
 * complète (ou leur dernier en date quand ils ne sont pas encore écrits), ce qui empêche d'écrire un texte maintenant, la liste
 * des derniers textes, les règles. LECTURE SEULE : rien n'est écrit, aucun appel.
 */
export function etatDesBulletins({ maintenant = Date.now(), fichier = FICHIER_BULLETINS, interrupteur = env.autoAiAnalysis.enabled, mode = null } = {}) {
  const lu = lireLesBulletins({ fichier });
  const jour = jourParis(new Date(maintenant));
  const semaine = semaineEcoulee(jour);
  let budget;
  try {
    const m = mode ?? modeBudget({ maintenant });
    budget = { mode: m.mode, econome: m.econome, raison: m.raison };
  } catch (error) {
    budget = { mode: 'normal', econome: false, raison: `Le budget ne se lit pas : ${error.message}` };
  }
  const base = { generatedAt: new Date(maintenant).toISOString(), fichier, jour, semaine: { cle: semaine.cle, du: semaine.du, au: semaine.au, enLettres: semaineEnLettres(semaine) }, regles: REGLES, budget, interrupteur };
  if (lu.etat === 'illisible') {
    return { ...base, etat: 'illisible', erreur: lu.erreur, bulletin: null, dernierBulletin: null, bilan: null, dernierBilan: null, situation: { bulletin: decision('bulletin', { maintenant, lu, interrupteur }), bilan: decision('bilan', { maintenant, lu, interrupteur }) }, historique: { bulletins: [], bilans: [] } };
  }
  const d = lu.donnees;
  const cles = (table) => Object.keys(table).sort();
  const dernierBulletin = cles(d.bulletins).at(-1);
  const dernierBilan = cles(d.bilans).at(-1);
  return {
    ...base,
    etat: lu.etat,
    erreur: null,
    bulletin: d.bulletins[jour] ?? null,
    dernierBulletin: dernierBulletin ? d.bulletins[dernierBulletin] : null,
    bilan: d.bilans[semaine.cle] ?? null,
    dernierBilan: dernierBilan ? d.bilans[dernierBilan] : null,
    situation: { bulletin: decision('bulletin', { maintenant, lu, interrupteur }), bilan: decision('bilan', { maintenant, lu, interrupteur }) },
    essais: { bulletin: essaisRates(d, 'bulletin', jour), bilan: essaisRates(d, 'bilan', semaine.cle) },
    historique: {
      bulletins: cles(d.bulletins).reverse().slice(0, 14).map((k) => resume(d.bulletins[k], 'bulletin')),
      bilans: cles(d.bilans).reverse().slice(0, 8).map((k) => resume(d.bilans[k], 'bilan'))
    }
  };
}
