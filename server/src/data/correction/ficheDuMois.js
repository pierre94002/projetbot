/**
 * ficheDuMois.js — LA FICHE CHIFFRÉE DU RÉSUMÉ DU MOIS, et la règle « faut-il l'écrire ? » (étape 26 du plan, partie D,
 * 28/10/2026).
 * -----------------------------------------------------------------------
 * Pur : ni base, ni fichier, ni horloge (`maintenant` est passé), ni hasard. Le code prépare TOUT ce qui est chiffré,
 * SANS DÉPENSER UN TOKEN (comme le bilan de la semaine de l'étape 42, bulletinFiches.js) : Claude n'a plus qu'à le dire
 * en mots simples, et la garde des chiffres (core/ai/gardeDesChiffres.js) refuse son texte s'il cite un nombre absent de
 * la fiche. La matière, lue par core/ai/resumeDuMois.js :
 *   - le TRI du mois (depotCorrections.lireLeTri) : la version jugée, les comptes, les statuts des 22 cases, les cases
 *     JUGÉES hors « malchance » (petit écart, à surveiller, vrai défaut : famille, mesure, sens en mots, écart arrondi à
 *     0,1 point, matchs, mois comptés, ce qui est proposé), les cases pas encore jugées regroupées par raison ;
 *   - le JOURNAL de la boucle depuis le dernier résumé écrit (ou depuis le 1er du mois) : ce qui est arrivé aux
 *     corrections (proposées, mesurées au banc, mises à l'essai, jugées, adoptées, refusées…) ;
 *   - l'ÉTAT des corrections (etatDesCorrections) : les propositions ouvertes et celles qui ont bougé, la place de
 *     l'essai à blanc, les corrections déjà essayées, le formulaire fermé et pourquoi ;
 *   - l'annoncé face au réalisé du mois figé par la calibration (étape 20), pour situer.
 * Tous les nombres sont écrits comme l'écran les écrit (à la française, le vrai signe moins : propositions.js).
 *
 * PAS D'APPEL POUR RIEN (constat 13 de la critique) : `ficheDuMoisVide` est VRAI quand aucune case n'est jugée ET que le
 * journal n'a, depuis le dernier résumé, que le tri lui-même — le cas courant pendant l'essai du modèle de buts de
 * l'étape 27 (le 01/11/2026 : familles de buts « en essai », le reste « trop tôt »). Le résumé est alors rangé « sans
 * appel », 0 token.
 *
 * LE MODE ÉCONOME du budget Claude (étape 4) compacte la fiche (LIMITES_DU_RESUME.econome : 6 cases, 3 propositions, 5
 * entrées du journal au plus), jamais une rubrique de moins.
 *
 * LA RÈGLE « FAUT-IL L'ÉCRIRE ? » (decisionDuResume) : le DERNIER mois trié seulement (jamais un mois manqué plus ancien),
 * une fois par mois et par forme du tri, l'interrupteur des analyses automatiques (AUTO_AI_ANALYSIS) allumé, moins de
 * trois essais ratés. Elle rend aussi ce que l'écran dit du résumé (Santé du moteur, « Le mois en mots »).
 * -----------------------------------------------------------------------
 */

import { STATUTS, familleDe } from './regles.js';
import { nombreDit, moisDit, deMois, jourDit, quandDit, libelleDuLevier, valeurDite } from './propositions.js';

// ============================================================ les règles

/** Combien de lignes par rubrique : la fiche normale et la fiche du mode économe (jamais une rubrique de moins). */
export const LIMITES_DU_RESUME = Object.freeze({
  normal: Object.freeze({ cases: 22, propositions: 8, journal: 12 }),
  econome: Object.freeze({ cases: 6, propositions: 3, journal: 5 })
});
/** Essais ratés (panne, forme non respectée, chiffres refusés) pour un mois, avant l'abandon : comme le bulletin. */
export const ESSAIS_MAX_DU_RESUME = 3;
/** Les statuts d'une case JUGÉE (sa fenêtre a au moins deux mois comptés) ; les autres ne sont pas encore jugés. */
export const STATUTS_JUGES = Object.freeze(['dans-la-marge', 'petit-ecart', 'a-surveiller', 'vrai-defaut']);
/** Les cases jugées que la fiche détaille : tout sauf la malchance (« dans la marge »), la plus grave d'abord. */
const STATUTS_DETAILLES = Object.freeze(['vrai-defaut', 'a-surveiller', 'petit-ecart']);
/** Les statuts « pas encore jugé », regroupés dans la fiche. */
const STATUTS_PAS_JUGES = Object.freeze(['en-essai', 'mois-de-changement', 'trop-tot', 'trop-peu']);
/** Les événements du journal qui ne sont pas une nouvelle à raconter : le tri lui-même (il a sa rubrique) et les résumés. */
export const EVENEMENTS_SANS_NOUVELLE = Object.freeze(['tri', 'resume-ecrit']);

/** Les événements du journal en mots (les mêmes à l'écran : ui/src/utils/corrections.js, comparé par un test). */
export const EVENEMENTS_DITS = Object.freeze({
  tri: 'tri du mois',
  proposee: 'proposée',
  'au-banc': 'mesure au banc lancée',
  bancee: 'mesurée au banc',
  'banc-impossible': 'banc impossible',
  'banc-interrompu': 'mesure au banc interrompue',
  acceptee: 'mise en file par vous',
  perimee: 'périmée',
  'mise-a-l-essai': 'mise à l’essai à blanc',
  'essai-recommence': 'essai recommencé',
  'essai-repris': 'essai repris',
  jugee: 'jugée',
  rejetee: 'rejetée',
  refusee: 'refusée par vous',
  adoptee: 'adoptée par vous',
  retiree: 'retirée',
  interrompue: 'interrompue',
  'demande-du-code': 'demande du code',
  'place-liberee': 'place de l’essai libérée',
  'resume-ecrit': 'résumé du mois écrit'
});

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const pluriel = (n, un, plusieurs) => `${nombreDit(n)} ${n >= 2 ? plusieurs : un}`;
const sansPoint = (t) => String(t ?? '').replace(/[.\s]+$/, '');
/** Un écart en points, signé, arrondi à 0,1 (« −3,1 points »). */
export const ecartEnPoints = (e) => (fini(e) ? `${nombreDit(e * 100, 1)} point${Math.abs(Number((e * 100).toFixed(1))) >= 2 ? 's' : ''}` : 'pas mesuré');
const pourcent = (p) => (fini(p) ? `${nombreDit(p * 100, 1)} %` : 'pas mesuré');
const VERDICTS_DU_BANC = Object.freeze({ retenu: 'retenu', 'pas-prouve': 'pas prouvé', 'moins-bon': 'moins bon', 'pas-assez-de-matchs': 'pas assez de matchs' });
const VERDICTS_DE_LA_CALIBRATION = Object.freeze({ 'trop-haut': 'annonce trop haut (au-delà du hasard)', 'trop-bas': 'annonce trop bas (au-delà du hasard)', 'dans-le-hasard': 'dans le hasard', 'trop-peu': 'trop peu de matchs' });

/** Les cases JUGÉES d'un tri (fenêtre d'au moins deux mois comptés). */
export const casesJugees = (tri) => (tri?.cases ?? []).filter((c) => STATUTS_JUGES.includes(c.statut));

/**
 * L'instant d'où part le journal raconté par le résumé du mois `mois` : le dernier résumé écrit (son entrée « résumé du
 * mois écrit », `dernierResumeLe`), sinon le 1er du mois à 00 h, heure de Paris (`debutDuMoisParis`). Pur.
 */
export function debutDuJournalDuResume({ mois, dernierResumeLe = null }) {
  return dernierResumeLe ?? debutDuMoisParis(mois);
}

/** Le 1er du mois `mois` à 00 h, heure de Paris, en ISO (heure d'été comprise). */
export function debutDuMoisParis(mois) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mois))) return null;
  const jour = `${mois}-01`;
  const format = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' });
  // Minuit à Paris tombe la veille à 22 h ou 23 h UTC : on avance par quarts d'heure jusqu'au premier instant du 1er.
  let t = Date.parse(`${jour}T00:00:00.000Z`) - 3 * 3_600_000;
  while (format.format(new Date(t)) !== jour) t += 15 * 60_000;
  return new Date(t).toISOString();
}

// ============================================================ la fiche

/** La version jugée en une phrase (« version n° 5, avec la n° 4 : mêmes pronostics ; mois partiel… »). */
function ligneeDite(lignee) {
  if (!lignee?.versionEnService) return 'aucune version du moteur notée en service à la fin du mois : rien n’a pu être jugé';
  const soeurs = (lignee.versions ?? []).filter((n) => n !== lignee.versionEnService);
  const partiel = lignee.couverture?.partiel ? ` ; mois partiel : cette version est en service depuis le ${jourDit(lignee.couverture.depuis ?? lignee.enServiceDepuis)}, seuls ses pronostics comptent` : ' ; en service tout le mois';
  return `version n° ${lignee.versionEnService} du moteur${soeurs.length ? `, avec ${soeurs.map((n) => `la n° ${n}`).join(', ')} : mêmes pronostics` : ''}${partiel}`;
}

/** Une case jugée, pour la fiche. */
function caseDuResume(c) {
  const f = familleDe(c.famille);
  return {
    cas: c.cas,
    famille: f?.libelle ?? c.famille,
    mesure: c.mesure === 'niveau' ? `niveau (« ${f?.canonique?.dit ?? 'issue de référence'} »)` : 'confiance (le favori de chaque pronostic)',
    statutDit: STATUTS[c.statut]?.dit ?? c.statut,
    sensDit: c.sensDit ?? null,
    ecart: ecartEnPoints(c.fenetre?.ecart),
    matchs: fini(c.fenetre?.matchs) ? nombreDit(c.fenetre.matchs) : 'pas mesuré',
    mois: (c.fenetre?.mois ?? []).map(moisDit),
    propose: c.levier?.cle ? `réglage visé : ${libelleDuLevier(c.levier.cle)} (${c.levier.phrase})` : c.levier?.code ? sansPoint(c.levier.phrase) : c.levier?.attente ? sansPoint(c.levier.phrase) : null
  };
}

/** Les cases pas encore jugées, regroupées par raison : « Total buts (niveau et confiance), … ». */
function pasEncoreJugees(cases) {
  const out = [];
  for (const statut of STATUTS_PAS_JUGES) {
    const parFamille = new Map();
    for (const c of cases.filter((x) => x.statut === statut)) {
      const nom = familleDe(c.famille)?.libelle ?? c.famille;
      parFamille.set(nom, [...(parFamille.get(nom) ?? []), c.mesure]);
    }
    if (!parFamille.size) continue;
    const familles = [...parFamille].map(([nom, mesures]) => `${nom} (${mesures.length >= 2 ? 'niveau et confiance' : mesures[0]})`);
    out.push({ statut, statutDit: STATUTS[statut]?.dit ?? statut, cases: cases.filter((x) => x.statut === statut).length, familles: familles.join(', ') });
  }
  return out;
}

/** Une proposition (vue de etatDesCorrections), pour la fiche : son réglage, sa valeur, son état, son banc. */
function propositionDuResume(p) {
  const banc = p.banc
    ? p.banc.erreur
      ? `banc d’essai impossible (${sansPoint(p.banc.erreur)})`
      : `banc d’essai (2019-2023, indicatif) : ${VERDICTS_DU_BANC[p.banc.verdict] ?? p.banc.verdict ?? 'pas de verdict'}${fini(p.banc.gainPct) ? `, ${nombreDit(Math.abs(p.banc.gainPct), 1)} % d’erreur de prévision en ${p.banc.gainPct >= 0 ? 'moins' : 'plus'}` : ''}${fini(p.banc.matchs) && p.banc.matchs ? ` sur ${nombreDit(p.banc.matchs)} matchs` : ''}`
    : null;
  return {
    id: p.id,
    reglage: p.libelle ?? libelleDuLevier(p.levier),
    changement: `${p.avantDit ?? valeurDite(p.levier, p.avant)} → ${p.apresDit ?? valeurDite(p.levier, p.apres)}`,
    etatDit: p.etatDit ?? p.etat,
    sourceDite: p.sourceDite ?? p.source,
    banc,
    essai: p.premiersChiffres ? `essai à blanc : ${nombreDit(p.premiersChiffres.matchs ?? 0)} matchs comparés, jour ${nombreDit(p.premiersChiffres.joursEcoules ?? 0)}${p.premiersChiffres.horizon ? ` sur ${nombreDit(p.premiersChiffres.horizon.jours)}` : ''}` : null
  };
}

/**
 * LA FICHE DU MOIS (pure). `tri` : le tri figé du mois (lireLeTri) ; `journal` : les entrées du journal de la boucle
 * DEPUIS `depuis` (exclu), dans n'importe quel ordre ; `etat` : etatDesCorrections() ; `calibration` : le résumé du mois
 * figé par la calibration (resumeDuBilan) ou null ; `econome` : le mode économe du budget Claude ; `problemes` : les
 * lectures ratées (dites à l'IA, jamais devinées). Rend un objet — le TEXTE que lit l'IA vient de
 * core/ai/resumeDuMoisPrompt.js (rendreLaFicheDuMois).
 */
export function construireLaFicheDuMois({ tri, journal = [], depuis = null, etat = null, calibration = null, econome = false, problemes = [] }) {
  const limites = econome ? LIMITES_DU_RESUME.econome : LIMITES_DU_RESUME.normal;
  const cases = Array.isArray(tri?.cases) ? tri.cases : [];
  const statuts = Object.keys(STATUTS)
    .map((code) => ({ code, dit: STATUTS[code].dit, n: cases.filter((c) => c.statut === code).length }))
    .filter((s) => s.n > 0)
    .sort((a, b) => STATUTS[b.code].rang - STATUTS[a.code].rang);
  const detaillees = cases
    .filter((c) => STATUTS_DETAILLES.includes(c.statut))
    .sort((a, b) => STATUTS_DETAILLES.indexOf(a.statut) - STATUTS_DETAILLES.indexOf(b.statut) || Math.abs(b.fenetre?.ecart ?? 0) - Math.abs(a.fenetre?.ecart ?? 0));
  const entrees = [...(Array.isArray(journal) ? journal : [])].filter((e) => !depuis || String(e.le) > String(depuis)).sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
  const nouvelles = entrees.filter((e) => !EVENEMENTS_SANS_NOUVELLE.includes(e.evenement));
  const parEvenement = new Map();
  for (const e of nouvelles) parEvenement.set(e.evenement, (parEvenement.get(e.evenement) ?? 0) + 1);
  const gardees = nouvelles.slice(-limites.journal);
  const propositions = (etat?.propositions ?? []).filter((p) => p.aDecider || ['au-banc', 'acceptee', 'a-blanc', 'jugee'].includes(p.etat) || (depuis && String(p.etatLe ?? '') > String(depuis)));
  const r = tri?.resume ?? {};
  return {
    forme: 1,
    mois: tri?.mois ?? null,
    moisDit: moisDit(tri?.mois),
    deMois: deMois(tri?.mois),
    version: tri?.version ?? null,
    mode: econome ? 'econome' : 'normal',
    calculeLe: tri?.calculeLe ?? null,
    calculeLeDit: tri?.calculeLe ? quandDit(tri.calculeLe) : 'heure inconnue',
    lignee: ligneeDite(tri?.lignee),
    comptes: {
      pronostics: fini(r.pronostics) ? r.pronostics : 0,
      lignes: fini(r.lignes) ? r.lignes : 0,
      matchs: fini(r.matchs) ? r.matchs : 0,
      ecartees: (r.ecartees ?? []).slice(0, 3).map((x) => ({ libelle: x.libelle ?? x.raison, n: x.n }))
    },
    statuts,
    jugees: casesJugees(tri).length,
    malchance: cases.filter((c) => c.statut === 'dans-la-marge').length,
    cases: detaillees.slice(0, limites.cases).map(caseDuResume),
    casesTotal: detaillees.length,
    pasEncoreJugees: pasEncoreJugees(cases),
    enEssai: r.enEssai ? `familles en essai : la candidate « ${r.enEssai.candidate} » (étape ${r.enEssai.etape ?? '?'}) les corrige déjà ; rien n’est proposé sur elles avant son verdict` : null,
    journal: {
      depuis,
      depuisDit: depuis ? quandDit(depuis) : null,
      compte: nouvelles.length,
      parEvenement: [...parEvenement].map(([evenement, n]) => ({ evenement, dit: EVENEMENTS_DITS[evenement] ?? evenement, n })),
      evenements: gardees.map((e) => ({ jour: jourDit(e.le), dit: EVENEMENTS_DITS[e.evenement] ?? e.evenement, phrase: sansPoint(e.phrase) })),
      nonListes: Math.max(0, nouvelles.length - gardees.length)
    },
    propositions: propositions.slice(0, limites.propositions).map(propositionDuResume),
    propositionsTotal: propositions.length,
    place: etat?.place?.phrase ?? null,
    essais: etat?.essais?.phrase ?? null,
    formulaire: etat?.formulaire && !etat.formulaire.ouvert ? etat.formulaire.raison ?? null : null,
    calibration: calibration && fini(calibration.annonce)
      ? {
          pronostics: calibration.pronostics ?? 0,
          matchs: calibration.matchs ?? 0,
          annonce: pourcent(calibration.annonce),
          realise: pourcent(calibration.realise),
          ecart: ecartEnPoints(calibration.ecart),
          verdict: VERDICTS_DE_LA_CALIBRATION[calibration.verdict] ?? calibration.verdict ?? 'pas jugé'
        }
      : null,
    problemes: [...problemes]
  };
}

/** Rien à dire : aucune case jugée, et le journal n'a, depuis le dernier résumé, que le tri (constat 13) — aucun appel. */
export function ficheDuMoisVide(fiche) {
  return Boolean(fiche) && fiche.jugees === 0 && fiche.journal.compte === 0;
}

/** La raison d'un résumé rangé sans appel, en une phrase (rangée avec lui, dite à l'écran). */
export function raisonSansAppel(fiche) {
  const pas = fiche.pasEncoreJugees.map((g) => `${nombreDit(g.cases)} ${g.statut === 'en-essai' ? 'en essai' : g.statut === 'trop-tot' ? 'trop tôt' : g.statut === 'trop-peu' ? 'avec trop peu de matchs' : 'en mois de changement de version'}`);
  return `Rien à commenter pour ${fiche.moisDit} : aucune case n’est encore jugée${pas.length ? ` (${pas.join(', ')})` : ''} et le journal de la boucle n’a que le tri du mois. Résumé rangé sans appel à Claude, 0 token.`;
}

// ============================================================ faut-il l'écrire ?

/** Le résumé tel que l'écran le montre (ou null). */
function vueDuResume(resume) {
  if (!resume) return null;
  const texte = resume.texte && typeof resume.texte === 'object' ? resume.texte : null;
  return {
    mois: resume.mois,
    version: resume.version,
    titre: texte?.titre ?? null,
    phrases: Array.isArray(texte?.phrases) ? texte.phrases : [],
    ecritLe: resume.ecritLe ?? null,
    ecritLeDit: resume.ecritLe ? quandDit(resume.ecritLe) : null,
    modele: resume.modele ?? null,
    mode: resume.mode ?? null,
    sansAppel: Boolean(resume.sansAppel),
    raison: resume.raison ?? null,
    nombresVus: fini(resume.garde?.nombresVus) ? resume.garde.nombresVus : null,
    tokens: fini(resume.usage?.total) ? resume.usage.total : null,
    essai: fini(resume.essai) ? resume.essai : null
  };
}

const raisonDuDernierEssai = (essais) => sansPoint(essais.at(-1)?.raison ?? 'raison inconnue');

/**
 * FAUT-IL ÉCRIRE LE RÉSUMÉ MAINTENANT ? (pur) — sur le DERNIER mois trié seulement (`dernierTri` : { mois, version,
 * calculeLe } ; jamais un mois manqué plus ancien), le résumé déjà rangé pour ce mois et cette forme du tri (`resume`,
 * lireLesResumes), ses essais ratés (`essais`), l'interrupteur des analyses automatiques. `illisible` : la raison d'une
 * lecture ratée des tables. Rend { du, code, pourquoi (l'étape), phrase (l'écran), mois, moisDit, version, essais,
 * essaisMax, resume } ; les codes : illisible (dû : l'étape le DIT), pas-de-tri, deja-fait, sans-appel, interrupteur,
 * essais-epuises, a-faire. Un résumé déjà rangé se montre même l'interrupteur coupé.
 */
export function decisionDuResume({ dernierTri = null, resume = null, essais = [], interrupteur = true, illisible = null } = {}) {
  const base = { essaisMax: ESSAIS_MAX_DU_RESUME };
  if (illisible) {
    const pourquoi = `Les tables de la boucle de correction ne se lisent pas (${sansPoint(illisible)}) : aucun appel à Claude tant qu’elles ne se relisent pas.`;
    return { ...base, du: true, code: 'illisible', pourquoi, phrase: `Résumé du mois illisible pour l’instant : ${sansPoint(illisible)}.`, mois: null, moisDit: null, version: null, essais: 0, resume: null };
  }
  if (!dernierTri?.mois) {
    const pourquoi = 'Pas encore de tri à résumer : le premier tri se fait le 1er du mois à partir de 6 h, après le gel de la calibration.';
    return { ...base, du: false, code: 'pas-de-tri', pourquoi, phrase: `Pas encore de résumé : ${pourquoi.replace(/^Pas encore de tri à résumer : /, '')}`, mois: null, moisDit: null, version: null, essais: 0, resume: null };
  }
  const m = dernierTri.mois;
  const commun = { ...base, mois: m, moisDit: moisDit(m), version: dernierTri.version, essais: essais.length };
  if (resume) {
    const vue = vueDuResume(resume);
    if (vue.sansAppel) {
      const pourquoi = `Le résumé ${deMois(m)} est rangé sans appel à Claude (rien à commenter) : un seul par mois.`;
      return { ...commun, du: false, code: 'sans-appel', pourquoi, phrase: vue.raison ?? pourquoi, resume: vue };
    }
    const pourquoi = `Le résumé ${deMois(m)} est déjà écrit (le ${vue.ecritLeDit ?? 'date inconnue'}) : un seul par mois.`;
    return { ...commun, du: false, code: 'deja-fait', pourquoi, phrase: `Écrit par Claude (Sonnet) le ${vue.ecritLeDit ?? 'date inconnue'} — chiffres vérifiés.`, resume: vue };
  }
  if (!interrupteur) {
    const pourquoi = 'Les analyses IA automatiques sont coupées (AUTO_AI_ANALYSIS=false) : pas de résumé du mois.';
    return { ...commun, du: false, code: 'interrupteur', pourquoi, phrase: 'Les analyses IA automatiques sont coupées : pas de résumé du mois.', resume: null };
  }
  if (essais.length >= ESSAIS_MAX_DU_RESUME) {
    const pourquoi = `Abandonné pour ${moisDit(m)} : ${pluriel(essais.length, 'essai raté', 'essais ratés')} (dernier : ${raisonDuDernierEssai(essais)}). Le prochain résumé suivra le tri du mois prochain.`;
    return { ...commun, du: false, code: 'essais-epuises', pourquoi, phrase: `Abandonné pour ce mois : ${pluriel(essais.length, 'essai raté', 'essais ratés')} (dernier : ${raisonDuDernierEssai(essais)}).`, resume: null };
  }
  const pourquoi = essais.length ? `À faire (${pluriel(essais.length, 'essai raté', 'essais ratés')}, ${nombreDit(ESSAIS_MAX_DU_RESUME)} au plus).` : 'À faire.';
  const phrase = essais.length
    ? `Pas encore écrit : ${pluriel(essais.length, 'essai raté', 'essais ratés')} (dernier : ${raisonDuDernierEssai(essais)}) ; nouvel essai à la prochaine passe d’actualisation (${nombreDit(ESSAIS_MAX_DU_RESUME)} au plus).`
    : `Pas encore écrit : le tri ${deMois(m)} est fait, le résumé suit à la prochaine passe d’actualisation.`;
  return { ...commun, du: true, code: 'a-faire', pourquoi, phrase, resume: null };
}
