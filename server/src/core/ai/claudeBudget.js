/**
 * claudeBudget.js — le budget Claude de l'appli et son mode économe (étape 4 du plan).
 * -----------------------------------------------------------------------
 * CE QUE L'APPLI VOIT : seulement SES propres appels — les tokens que chaque
 * réponse de Claude Code lui rend (`usage`, `total_cost_usd`), tenus dans le
 * journal (data/repositories/claudeUsageLedger.js). Jamais le pourcentage de
 * la semaine de l'abonnement Max : aucune réponse du CLI ne le donne, et ce
 * quota est partagé avec les sessions de construction de Pierre. Le mode
 * économe se déclenche donc à 80 % du budget de tokens fixé par Pierre POUR
 * L'APPLI, jamais à 80 % de l'abonnement (correction 16 du plan). La règle
 * « arrêt à 85 % tous modèles » ne vaut que pour les sessions de construction.
 *
 * Seuls comptent les appels Claude Code (quota de l'abonnement), réussis ou
 * non : un schéma non respecté a consommé ses tokens. Les appels de l'API
 * Anthropic à la clé (audit des pronostics, recherche web) sont facturés à
 * part : montrés à côté, hors budget.
 *
 * LE MODE ÉCONOME, à 80 % du budget du JOUR ou de la SEMAINE (lundi → dimanche,
 * jours de Paris), ou tout le temps si Pierre le choisit :
 *   a. une seule analyse d'avant-match, dès la composition officielle — celle
 *      d'avant coup d'envoi ; sans analyse d'avance (c) ni reprise (b) en plus ;
 *   b. reprise après changement de onze seulement si au moins DEUX titulaires
 *      habituels changent (en mode normal : au moindre changement) ;
 *   c. analyse d'avance (3 h à 48 h avant) réservée aux équipes et
 *      championnats favoris ;
 *   d. les favoris passent d'abord dans chaque liste (avance, coup d'envoi,
 *      revues) : si le plafond du jour coupe une liste, les autres attendent.
 * Le COMPACTAGE de ce qu'on envoie à l'IA (étape 41, cf. compactContext.js)
 * n'est plus une règle du mode économe : la fiche compacte est la forme
 * normale, dans les deux modes ; le drapeau `compactage` dit la forme en
 * vigueur (AI_ANALYSIS_FICHE=ancienne ramène l'ancienne, pour comparer).
 * L'ESSAI SANS MISE EN CACHE reste prévu, pas activé.
 *
 * Le mode économe ne bloque jamais un clic de Pierre et ne touche pas au
 * plafond quotidien de 150 analyses automatiques (env.autoAiAnalysis.dailyLimit),
 * qui reste la seule limite dure. Au-delà de 100 % du budget : rien de plus
 * que le mode économe (pas d'arrêt) — à décider avec Pierre.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env.js';
import { readJsonFile } from '../../utils/atomicJson.js';
import { openDb } from '../../data/db/matchStatsDb.js';
import { clubDuMagasin } from '../../data/db/oddsProfileRead.js';
import { nomNormalise } from '../../data/repositories/favoritesRepository.js';
import { jourParis, statutDuJour } from '../../data/repositories/autoAiAnalysisRepository.js';
import { lireReglageBudget } from '../../data/repositories/claudeBudgetRepository.js';
import { lireJour, debutDuJournal, etatEcriture, TYPES_APPEL, TYPES_AUTOMATIQUES, CANAUX, fichierDuJour } from '../../data/repositories/claudeUsageLedger.js';
import { FICHES, formeDeLaFiche } from './compactContext.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FICHIER_FAVORIS = path.resolve(__dirname, '../../../data/runtime/favorites.json');

/** Le mode économe à 80 % du budget du jour ou de la semaine. */
export const SEUIL_ECONOME = 0.8;
/** En mode économe : la reprise après changement de onze demande au moins deux titulaires habituels changés. */
export const TITULAIRES_HABITUELS_MIN = 2;

const JOUR_MS = 86_400_000;
const nombre = (n) => Math.round(Number(n ?? 0)).toLocaleString('fr-FR');
const pourcent = (p) => `${Math.floor(p * 1000) / 10} %`.replace('.', ',');

// --------------------------------------------------------------- semaine
/** Les sept jours (de Paris, « AAAA-MM-JJ ») de la semaine de `jour`, du lundi au dimanche. */
export function semaineDe(jour) {
  const midi = Date.parse(`${jour}T12:00:00Z`);
  const decalage = (new Date(midi).getUTCDay() + 6) % 7;
  const lundi = midi - decalage * JOUR_MS;
  return Array.from({ length: 7 }, (_, i) => new Date(lundi + i * JOUR_MS).toISOString().slice(0, 10));
}

// ---------------------------------------------------------- consommation
const sansTypes = ({ parType, ...reste }) => reste;

function sommer(bilans) {
  const somme = { appels: 0, ok: 0, echecs: 0, sansTokens: 0, tokens: { entree: 0, ecritureCache: 0, lectureCache: 0, sortie: 0, total: 0 }, equivalentApiUsd: 0 };
  for (const b of bilans) {
    if (!b) continue;
    somme.appels += b.appels ?? 0;
    somme.ok += b.ok ?? 0;
    somme.echecs += b.echecs ?? 0;
    somme.sansTokens += b.sansTokens ?? 0;
    for (const k of Object.keys(somme.tokens)) somme.tokens[k] += b.tokens?.[k] ?? 0;
    somme.equivalentApiUsd = Math.round((somme.equivalentApiUsd + (b.equivalentApiUsd ?? 0)) * 1e6) / 1e6;
  }
  return somme;
}

/**
 * Ce que l'appli a consommé : le jour de Paris de `maintenant` et sa semaine
 * (lundi → aujourd'hui), pour un canal, en tout et par type d'appel.
 */
export function consommation({ maintenant = Date.now(), canal = 'claude-code' } = {}) {
  const jour = jourParis(new Date(maintenant));
  const semaine = semaineDe(jour);
  const lus = semaine.filter((j) => j <= jour).map((j) => lireJour(j, { canal }));
  const duJour = lus.find((l) => l.jour === jour);
  const parType = Object.fromEntries(
    Object.keys(TYPES_APPEL).map((type) => [type, { jour: sommer([duJour?.totaux.parType?.[type]]), semaine: sommer(lus.map((l) => l.totaux.parType?.[type])) }])
  );
  return {
    canal,
    jour,
    semaine,
    aujourdhui: sansTypes(sommer([duJour?.totaux])),
    cetteSemaine: sommer(lus.map((l) => l.totaux)),
    parJour: lus.map((l) => ({ jour: l.jour, appels: l.totaux.appels, tokens: l.totaux.tokens.total, equivalentApiUsd: l.totaux.equivalentApiUsd })),
    parType,
    appelsDuJour: duJour?.appels ?? [],
    problemes: lus.filter((l) => l.probleme).map((l) => ({ jour: l.jour, fichier: l.fichier, probleme: l.probleme })),
    enAttente: lus.reduce((n, l) => n + l.enAttente, 0)
  };
}

// ------------------------------------------------------------------ mode
/**
 * Les règles en vigueur, selon le mode. La fiche compacte (étape 41) ne
 * dépend pas du mode : forme normale en normal comme en économe, sauf réglage
 * AI_ANALYSIS_FICHE=ancienne. L'essai sans mise en cache reste éteint.
 */
export function politiqueBudget(econome, { fiche = env.ficheIa } = {}) {
  const forme = formeDeLaFiche(null, fiche);
  return {
    uneSeuleAnalyseAvantMatch: econome,
    repriseTitulairesHabituelsMin: econome ? TITULAIRES_HABITUELS_MIN : 1,
    avanceFavorisSeulement: econome,
    favorisDabord: econome,
    compactage: {
      actif: forme === FICHES.compacte,
      forme,
      depuis: 'étape 41',
      reglage: 'AI_ANALYSIS_FICHE',
      texte:
        forme === FICHES.compacte
          ? "fiche compacte envoyée à l'IA (petits tableaux, consignes fixes relues depuis la mémoire cache de Claude), en mode normal comme en mode économe"
          : "ancienne forme envoyée à l'IA (réglage AI_ANALYSIS_FICHE=ancienne), pour comparer"
    },
    essaiSansCache: { actif: false, prevu: 'essai sans mise en cache : prévu, pas activé' }
  };
}

// --------------------------------------------- coût moyen par forme (étape 41)
/**
 * Les deux analyses d'un match, leur coût mesuré le 04/10/2026 (mémoire du
 * plan : champ `usage` de match-ai-analyses.json, analyses depuis le 02/10,
 * sortie comprise) et l'objectif de l'étape 41.
 */
export const ANALYSES_DE_MATCH = Object.freeze({
  avantMatch: Object.freeze({ libelle: "Analyse d'avant-match", reference: 24_400, objectif: 17_000 }),
  revue: Object.freeze({ libelle: "Revue d'après-match", reference: 10_800, objectif: 7_000 })
});
export const REFERENCE_MESUREE = 'mesuré le 04/10/2026 (champ usage des analyses enregistrées depuis le 02/10, sortie comprise)';

/** L'analyse de match que fait un appel du journal, ou null (autre appel). */
function analyseDe(a) {
  if (a.type === 'avance' || a.type === 'coup-d-envoi' || a.type === 'reprise') return 'avantMatch';
  if (a.type === 'revue') return 'revue';
  if (a.type === 'manuel') return /^après/i.test(a.detail ?? '') ? 'revue' : /^avant/i.test(a.detail ?? '') ? 'avantMatch' : null;
  return null;
}

/**
 * Le coût moyen d'une analyse de match, par forme de fiche, sur la semaine
 * (lundi → aujourd'hui, jours de Paris), lu dans le journal : appels
 * réussis ou non, dès que leurs tokens sont connus. Une ligne sans forme
 * notée vient du code d'avant l'étape 41 : ancienne forme. C'est la mesure
 * réelle du gain, à côté de la référence du 04/10 et de l'objectif.
 */
export function coutMoyenParForme({ maintenant = Date.now() } = {}) {
  const jour = jourParis(new Date(maintenant));
  const semaine = semaineDe(jour);
  const lignes = semaine.filter((j) => j <= jour).flatMap((j) => lireJour(j).appels);
  const vide = () => ({ appels: 0, echecs: 0, sansTokens: 0, tokens: 0, entree: 0, sortie: 0, avecTaille: 0, caracteres: 0 });
  const groupes = Object.fromEntries(Object.keys(ANALYSES_DE_MATCH).map((cle) => [cle, { ancienne: vide(), compacte: vide() }]));
  for (const a of lignes) {
    const analyse = analyseDe(a);
    if (!analyse) continue;
    const g = groupes[analyse][a.fiche === FICHES.compacte ? 'compacte' : 'ancienne'];
    if (!a.tokens) {
      g.sansTokens++;
      continue;
    }
    g.appels++;
    if (a.statut !== 'ok') g.echecs++;
    g.tokens += a.tokens.total;
    g.entree += a.tokens.entree + a.tokens.ecritureCache + a.tokens.lectureCache;
    g.sortie += a.tokens.sortie;
    if (Number.isInteger(a.taille?.consignes) && Number.isInteger(a.taille?.message)) {
      g.avecTaille++;
      g.caracteres += a.taille.consignes + a.taille.message;
    }
  }
  const moyenne = (somme, n) => (n ? Math.round(somme / n) : null);
  return {
    du: semaine[0],
    au: jour,
    reference: REFERENCE_MESUREE,
    analyses: Object.entries(ANALYSES_DE_MATCH).map(([cle, a]) => ({
      analyse: cle,
      libelle: a.libelle,
      reference: a.reference,
      objectif: a.objectif,
      formes: ['ancienne', 'compacte'].map((forme) => {
        const g = groupes[cle][forme];
        return {
          forme,
          appels: g.appels,
          echecs: g.echecs,
          sansTokens: g.sansTokens,
          tokensMoyens: moyenne(g.tokens, g.appels),
          entreeMoyenne: moyenne(g.entree, g.appels),
          sortieMoyenne: moyenne(g.sortie, g.appels),
          caracteresMoyens: moyenne(g.caracteres, g.avecTaille)
        };
      })
    }))
  };
}

/**
 * Le mode du moment : normal, ou économe (et pourquoi). Lu à chaque décision
 * (passe d'actualisation, boucle du coup d'envoi, avant chaque analyse
 * d'avance) : c'est la consommation de l'instant qui décide.
 */
export function modeBudget({ maintenant = Date.now(), reglage = null, conso = null } = {}) {
  const r = reglage ?? lireReglageBudget();
  const c = conso ?? consommation({ maintenant });
  const tokensJour = c.aujourdhui.tokens.total;
  const tokensSemaine = c.cetteSemaine.tokens.total;
  const partJour = tokensJour / r.tokensParJour;
  const partSemaine = tokensSemaine / r.tokensParSemaine;
  const declencheurs = [];
  if (r.mode === 'econome') declencheurs.push({ cle: 'manuel', texte: 'choisi dans Réglages (économe tout le temps)' });
  if (partJour >= SEUIL_ECONOME) declencheurs.push({ cle: 'jour', texte: `${pourcent(partJour)} du budget du jour (${nombre(tokensJour)} / ${nombre(r.tokensParJour)} tokens)` });
  if (partSemaine >= SEUIL_ECONOME) declencheurs.push({ cle: 'semaine', texte: `${pourcent(partSemaine)} du budget de la semaine (${nombre(tokensSemaine)} / ${nombre(r.tokensParSemaine)} tokens)` });
  const econome = declencheurs.length > 0;
  return {
    mode: econome ? 'econome' : 'normal',
    econome,
    declencheurs,
    partJour,
    partSemaine,
    raison: econome
      ? `Mode économe : ${declencheurs.map((d) => d.texte).join(' ; ')}.`
      : `Mode normal : ${pourcent(partJour)} du budget du jour, ${pourcent(partSemaine)} de celui de la semaine (économe à ${SEUIL_ECONOME * 100} %).`,
    politique: politiqueBudget(econome)
  };
}

// --------------------------------------------------------------- favoris
/**
 * Les favoris de Pierre (data/runtime/favorites.json), tels que les reconnaît
 * favoritesRepository.js : un championnat par son libellé, une équipe par son
 * identifiant FotMob quand il est connu des deux côtés, sinon par son nom.
 * Illisibles : personne n'est favori (la décision se refait à la passe suivante).
 */
export function lireFavoris() {
  try {
    const f = readJsonFile(FICHIER_FAVORIS, null);
    return {
      ligues: new Set((f?.leagues ?? []).map((l) => nomNormalise(l?.name)).filter(Boolean)),
      equipes: (f?.teams ?? []).filter((t) => t?.name).map((t) => ({ id: typeof t.id === 'string' && /^fotmob-\d+$/.test(t.id) ? t.id : null, nom: nomNormalise(t.name) }))
    };
  } catch {
    return { ligues: new Set(), equipes: [], illisible: true };
  }
}

/** Le match `{ home, away, league }` touche-t-il un favori ? Club rapproché par l'annuaire strict (clubDuMagasin), jamais par ressemblance. */
export function estFavori(match, favoris, database = null) {
  if (!favoris || !match) return false;
  if (match.league && favoris.ligues.has(nomNormalise(match.league))) return true;
  if (!favoris.equipes.length) return false;
  for (const nom of [match.home, match.away]) {
    if (!nom) continue;
    let id = null;
    if (favoris.equipes.some((e) => e.id)) {
      try {
        id = clubDuMagasin(nom, match.league ?? null, database ?? openDb());
      } catch {
        id = null;
      }
    }
    const cle = nomNormalise(nom);
    // Identifiant connu des deux côtés : seuls les identifiants comptent (deux « Nacional » restent deux clubs).
    if (favoris.equipes.some((e) => (e.id && id ? e.id === id : e.nom === cle))) return true;
  }
  return false;
}

/** Les favoris d'abord, l'ordre d'origine gardé dans chaque groupe. `acces(x)` rend { home, away, league }. */
export function favorisDabord(liste, acces, favoris = lireFavoris(), database = null) {
  const favs = [];
  const autres = [];
  for (const x of liste) (estFavori(acces(x), favoris, database) ? favs : autres).push(x);
  return [...favs, ...autres];
}

// ---------------------------------------------- effets du mode économe
/**
 * Ce que le mode économe a évité AUJOURD'HUI (depuis le démarrage du serveur) :
 * les analyses d'avance non faites (non favoris) et les reprises non faites
 * (moins de deux titulaires habituels changés). En mémoire : une relance du
 * serveur remet ces comptes à zéro, le journal, lui, reste.
 */
const effets = { jour: null, avances: new Set(), reprises: new Set() };

export function noterEffetEconome(type, cle, maintenant = Date.now()) {
  const jour = jourParis(new Date(maintenant));
  if (effets.jour !== jour) Object.assign(effets, { jour, avances: new Set(), reprises: new Set() });
  const ensemble = type === 'reprise' ? effets.reprises : effets.avances;
  const nouveau = !ensemble.has(cle);
  ensemble.add(cle);
  return nouveau;
}

export function effetsEconome(maintenant = Date.now()) {
  const jour = jourParis(new Date(maintenant));
  if (effets.jour !== jour) return { jour, avancesEcartees: 0, reprisesEvitees: 0 };
  return { jour, avancesEcartees: effets.avances.size, reprisesEvitees: effets.reprises.size };
}

// ---------------------------------------------------------------- l'état
const bilanPublic = (b) => ({ appels: b.appels, ok: b.ok, echecs: b.echecs, sansTokens: b.sansTokens, tokens: b.tokens, equivalentApiUsd: b.equivalentApiUsd });

/**
 * L'état complet que lit la carte « Budget Claude » (GET /api/claude-budget) :
 * le réglage (provisoire ou enregistré), les tokens du jour et de la semaine
 * face au budget, par type d'appel, le mode et pourquoi, ce que le mode
 * économe a évité, le plafond de 150 rappelé avec son compteur, l'accord
 * entre ce compteur et le journal, l'API à la clé (hors budget), les derniers
 * appels du jour et la provenance réelle (dossier du journal, fichier du
 * réglage). Lecture seule.
 */
export function etatBudgetClaude({ maintenant = Date.now() } = {}) {
  const reglage = lireReglageBudget();
  const conso = consommation({ maintenant });
  const api = consommation({ maintenant, canal: 'api-anthropic' });
  const mode = modeBudget({ maintenant, reglage, conso });
  const jour = conso.jour;

  let compteur = null;
  let compteurErreur = null;
  try {
    compteur = statutDuJour(jour);
  } catch (error) {
    compteurErreur = String(error.message).slice(0, 200);
  }
  const automatiquesDuJournal = conso.appelsDuJour.filter((a) => a.statut === 'ok' && TYPES_AUTOMATIQUES.includes(a.type)).length;
  const debut = debutDuJournal();
  const ecriture = etatEcriture();

  return {
    generatedAt: new Date(maintenant).toISOString(),
    jour,
    semaine: { du: conso.semaine[0], au: conso.semaine[6], jours: conso.semaine },
    seuil: SEUIL_ECONOME,
    reglage,
    aujourdhui: { ...bilanPublic(conso.aujourdhui), budget: reglage.tokensParJour, part: conso.aujourdhui.tokens.total / reglage.tokensParJour, seuilTokens: Math.ceil(reglage.tokensParJour * SEUIL_ECONOME) },
    cetteSemaine: { ...bilanPublic(conso.cetteSemaine), budget: reglage.tokensParSemaine, part: conso.cetteSemaine.tokens.total / reglage.tokensParSemaine, seuilTokens: Math.ceil(reglage.tokensParSemaine * SEUIL_ECONOME), parJour: conso.parJour },
    parType: Object.entries(TYPES_APPEL).map(([type, libelle]) => ({
      type,
      libelle,
      automatique: TYPES_AUTOMATIQUES.includes(type),
      aujourdhui: bilanPublic(conso.parType[type].jour),
      cetteSemaine: bilanPublic(conso.parType[type].semaine)
    })),
    mode: { mode: mode.mode, econome: mode.econome, declencheurs: mode.declencheurs, raison: mode.raison, politique: mode.politique, choixReglage: reglage.mode },
    effets: effetsEconome(maintenant),
    plafond: {
      limite: env.autoAiAnalysis.dailyLimit,
      actif: env.autoAiAnalysis.enabled,
      aujourdhui: compteur?.count ?? null,
      avantMatch: compteur?.preMatch ?? null,
      apresMatch: compteur?.postMatch ?? null,
      laissesAvantMatch: compteur?.skippedPreMatch ?? null,
      laissesApresMatch: compteur?.skippedPostMatch ?? null,
      restant: compteur ? Math.max(0, env.autoAiAnalysis.dailyLimit - compteur.count) : null,
      erreur: compteurErreur
    },
    coherence: {
      compteur: compteur?.count ?? null,
      journalAutomatiques: automatiquesDuJournal,
      egal: compteur ? compteur.count === automatiquesDuJournal : null,
      journalDepuis: debut,
      journalCommenceAujourdhui: Boolean(debut) && jourParis(new Date(debut)) === jour
    },
    apiAnthropic: { libelle: CANAUX['api-anthropic'], aujourdhui: bilanPublic(api.aujourdhui), cetteSemaine: bilanPublic(api.cetteSemaine) },
    // Étape 41 : le coût moyen d'une analyse de match, ancienne fiche et fiche compacte, face à la référence du 04/10.
    coutParForme: coutMoyenParForme({ maintenant }),
    derniersAppels: [...conso.appelsDuJour].reverse().slice(0, 25),
    journal: {
      dossier: ecriture.dossier,
      fichierDuJour: fichierDuJour(jour),
      depuis: debut,
      enAttente: ecriture.enAttente,
      derniereEcriture: ecriture.derniereEcriture,
      erreur: ecriture.erreur,
      problemes: [...conso.problemes, ...api.problemes]
    },
    abonnement: {
      visible: false,
      texte:
        "L'appli ne voit que ses propres appels : les tokens que Claude Code lui rend à chaque réponse. Elle ne voit jamais le pourcentage de la semaine de l'abonnement Max, " +
        'partagé avec les sessions de construction : le mode économe se déclenche à 80 % du budget fixé ici, pas à 80 % de l’abonnement.'
    }
  };
}
