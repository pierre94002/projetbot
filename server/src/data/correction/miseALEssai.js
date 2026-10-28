/**
 * miseALEssai.js — LA PLACE DE L'ESSAI À BLANC, LA FILE DES CORRECTIONS ACCEPTÉES ET LE REGISTRE DES VERSIONS
 * (étape 26 du plan, partie B, 28/10/2026).
 * -----------------------------------------------------------------------
 * C'est le SEUL module de la boucle de correction qui appelle les écrivains de l'étape 25 et du registre de la mesure :
 *   - proposerUneCandidate(…, { origine: 'correction-mensuelle' }) : la correction acceptée en tête de file, mise à
 *     blanc quand la place est libre (mettreALEssaiLaSuivante) ;
 *   - mettreLaCandidateEnEssai({ candidate: null }) : la place libérée d'une correction refusée ou rejetée
 *     (libererLaPlace, avec trois gardes : la candidate du registre a CET identifiant, elle vient de la boucle de
 *     correction, et la candidate du code est absente ou adoptée — jamais celle de l'étape 27) ;
 *   - declarerVariante('26', …) : une correction COMPTÉE avant son banc (declarerAvantLeBanc).
 * La place est PRISE tant que la candidate déclarée dans le code (l'étape 27) y est, adoptée ou non : la retouche R1
 * de engineVersions.js est reportée au lot 2 (décision 9), et proposerUneCandidate refuse toute candidate tant qu'une
 * est déclarée dans le code. La file attend alors, et c'est DIT ; proposerUneCandidate n'est jamais atteint.
 * synchroniserAvecLesVersions accorde l'état des propositions à ce que dit le registre des versions (jugée, adoptée,
 * interrompue, essai recommencé, retour arrière), reprend une mise à l'essai interrompue (constat 3 : la candidate est
 * déjà au registre, la proposition encore « acceptée ») et libère la place d'une correction refusée ou rejetée.
 * Chaque changement d'état passe par depotCorrections.changerLEtat (l'état et le journal en une transaction).
 * -----------------------------------------------------------------------
 */

import { CANDIDATE_EN_ESSAI, etatDesVersions, proposerUneCandidate, mettreLaCandidateEnEssai } from '../../core/engine/engineVersions.js';
import { declarerVariante, compterVariantes } from '../../bench/trialsRegistry.js';
import { openDb } from '../db/matchStatsDb.js';
import { placeDeLEssai } from './tri.js';
import { changerLEtat, ajouterAuJournal, lireLesPropositions, lireLeJournal } from './depotCorrections.js';
import { partDesReglagesEnService, copieProfonde, jourDit, quandDit, nombreDit, libelleDuLevier, valeurDite, RETRAIT_PLUS_TARD } from './propositions.js';

const iso = (t) => new Date(t).toISOString();
const JOUR_MS = 86_400_000;
/** Le nom court d'une candidate connue (sa phrase `enMots` est longue). */
const NOMS_COURTS = Object.freeze({ 'modele-buts-v1': 'Modèle de buts unique' });
const nomDe = (c) => NOMS_COURTS[c?.id] ?? c?.enMots ?? c?.id ?? 'candidate';
/** Le nom court d'une correction de la boucle : son réglage et ses deux valeurs (« corrélation des petits scores : −0,05 → −0,02 »). */
const nomDUneCorrection = (c, propositions) => {
  const p = (propositions ?? []).find((x) => x.id === c?.id);
  return p ? `${libelleDuLevier(p.levier)} : ${valeurDite(p.levier, p.avant)} → ${valeurDite(p.levier, p.apres)}` : nomDe(c);
};

/** La candidate de ce nom adoptée au registre (candidatesPassees, fin « adoptee »), ou null. */
const adopteeAuRegistre = (brut, id) => [...(brut?.candidatesPassees ?? [])].reverse().find((x) => x?.id === id && x?.fin === 'adoptee') ?? null;
/** Le jour où le verdict d'un essai peut tomber au plus tôt : son début + les jours de son horizon. */
function auPlusTotLe(c) {
  const debut = Date.parse(c?.essai?.depuis ?? c?.enEssaiDepuis ?? '');
  const jours = c?.horizon?.jours ?? c?.declaration?.horizon?.jours;
  return Number.isFinite(debut) && Number.isFinite(jours) ? iso(debut + jours * JOUR_MS) : null;
}
/**
 * La phrase de la place prise par une candidate qui n'est PAS une correction de la boucle (vérification finale, constat
 * 2) : juste avec ou sans correction en file — ni « une autre candidate », ni « la correction attend son tour » quand
 * aucune correction n'existe. En essai : son verdict au plus tôt ; jugée : `apres`, ce qui libérera la place.
 */
function phraseDUneCandidate(c, { date = null, apres }) {
  const nom = `« ${nomDe(c)} »${c?.etape ? ` (étape ${c.etape})` : ''}`;
  if (c?.statut === 'jugee') return `La candidate ${nom} est jugée : aucune correction ne passe à blanc avant ${apres}.`;
  return `La candidate ${nom} est en essai à blanc${date ? `, verdict attendu au plus tôt le ${jourDit(date)}` : ''} : aucune correction ne passe à blanc avant son verdict.`;
}

// ============================================================ la place

/**
 * LA PLACE DE L'ESSAI À BLANC (une candidate à la fois), lue dans etatDesVersions() (lecture seule) : { lisible,
 * prise, par, candidate, auPlusTotLe, phrase } — `par` : 'code' (la candidate de l'étape 27 en essai ou jugée, pas
 * adoptée), 'code-adoptee' (adoptée mais encore déclarée dans le code : la mise à jour qui suit son verdict n'est pas
 * faite), 'correction' (une correction de la boucle), 'autre', ou null (libre). Registre absent ou illisible : la
 * place n'est pas lisible, rien n'est mis à l'essai (jamais lu comme « libre »). `propositions` (facultatif) : pour
 * nommer une correction de la boucle par son réglage.
 */
export function etatDeLaPlace({ etat = null, candidateDuCode = CANDIDATE_EN_ESSAI, propositions = [] } = {}) {
  const e = etat ?? etatDesVersions();
  if (!e || e.source !== 'enregistre') {
    return {
      lisible: false,
      prise: true,
      par: null,
      candidate: null,
      auPlusTotLe: null,
      phrase: e?.source === 'absent' ? 'Le registre des versions du moteur n’existe pas encore : rien n’est mis à l’essai.' : 'Le registre des versions du moteur ne se lit pas pour l’instant : rien n’est mis à l’essai, la file attend.'
    };
  }
  const { candidate } = placeDeLEssai(e);
  const c = e.candidate ?? null;
  if (candidateDuCode) {
    if (c && c.id === candidateDuCode.id) {
      const date = auPlusTotLe(c);
      return {
        lisible: true,
        prise: true,
        par: 'code',
        candidate,
        auPlusTotLe: date,
        phrase: phraseDUneCandidate(c, { date, apres: 'la mise à jour de l’appli qui suit son verdict' })
      };
    }
    const adoptee = e.candidateAdoptee?.id === candidateDuCode.id;
    return {
      lisible: true,
      prise: true,
      par: adoptee ? 'code-adoptee' : 'code',
      candidate: null,
      auPlusTotLe: null,
      phrase: adoptee
        ? `La candidate « ${nomDe(candidateDuCode)} » (étape ${candidateDuCode.etape}) est adoptée mais encore déclarée dans le code de l’appli : la file attend la mise à jour qui suit son verdict.`
        : `La candidate « ${nomDe(candidateDuCode)} » (étape ${candidateDuCode.etape}) est déclarée dans le code : la file attend son tour.`
    };
  }
  if (c) {
    const correction = c.origine === 'correction-mensuelle';
    const date = auPlusTotLe(c);
    return {
      lisible: true,
      prise: true,
      par: correction ? 'correction' : 'autre',
      candidate,
      auPlusTotLe: date,
      phrase: correction
        ? `Une correction est déjà en essai à blanc (« ${nomDUneCorrection(c, propositions)} »${c.statut === 'jugee' ? ', jugée' : date ? `, verdict au plus tôt le ${jourDit(date)}` : ''}) : la suivante attend son tour.`
        : phraseDUneCandidate(c, { date, apres: 'qu’elle libère la place' })
    };
  }
  return { lisible: true, prise: false, par: null, candidate: null, auPlusTotLe: null, phrase: 'Place de l’essai à blanc : libre.' };
}

// ============================================================ compter une correction avant son banc

/**
 * Une correction COMPTÉE parmi les corrections essayées de l'étape 26 AVANT son banc (registre de la mesure,
 * declarerVariante, « banc ») : le juge du banc élargit sa marge d'autant. Idempotent (une correction déjà comptée ne
 * l'est pas deux fois). Lève RegistreIllisible : un banc qui ne peut pas être compté ne part pas. Rend
 * { change, variantes } (le nombre de corrections essayées, elle comprise).
 */
export function declarerAvantLeBanc(proposition, { maintenant = Date.now() } = {}) {
  const r = declarerVariante('26', { id: proposition.id, quoi: proposition.declaration?.quoi ?? proposition.id, ou: 'banc' }, { maintenant });
  return { change: r.change, variantes: compterVariantes('26') };
}

// ============================================================ libérer la place

/**
 * LIBÈRE LA PLACE d'une correction refusée ou rejetée qui l'occupe encore (sinon, au prochain changement de version
 * en service, son essai recommencerait : bug B23). Trois gardes, sans lesquelles l'appel sortirait la candidate de
 * l'étape 27 de son essai (bug B17) : la candidate du registre a CET identifiant ; elle vient de la boucle de
 * correction (origine « correction-mensuelle ») ; la candidate du code est absente ou adoptée. Rend { libere, raison }.
 */
export function libererLaPlace(id, { brut, database = openDb(), maintenant = Date.now(), candidateDuCode = CANDIDATE_EN_ESSAI, pourquoi = 'refusée' } = {}) {
  const notee = brut?.candidate ?? null;
  if (!notee || notee.id !== id) return { libere: false, raison: 'pas-dans-la-place' };
  if (notee.origine !== 'correction-mensuelle') return { libere: false, raison: 'autre-origine' };
  if (candidateDuCode && !adopteeAuRegistre(brut, candidateDuCode.id)) return { libere: false, raison: 'candidate-du-code' };
  mettreLaCandidateEnEssai({ candidate: null, maintenant });
  ajouterAuJournal(
    {
      proposition: id,
      evenement: 'place-liberee',
      source: 'nuit',
      phrase: `Place de l’essai à blanc libérée : la correction (${pourquoi}) n’est plus calculée à blanc ; la suivante en file peut passer.`,
      details: { candidate: id, essai: notee.essai ?? null }
    },
    { database, maintenant }
  );
  return { libere: true, raison: null };
}

// ============================================================ la file

const parRang = (a, b) => (a.rangFile ?? Infinity) - (b.rangFile ?? Infinity) || (a.etatLe < b.etatLe ? -1 : a.etatLe > b.etatLe ? 1 : 0);

/**
 * LA SUIVANTE EN FILE PASSE À BLANC, si la place est libre (une par passe ; premier accepté, premier servi) : celle
 * dont les réglages en service ne sont plus ceux d'où elle partait est « périmée » (on passe à la suivante) ; sinon
 * proposerUneCandidate (déclarée par l'étape 25 au registre de la mesure : déjà comptée au banc, rien deux fois), puis
 * l'état « a-blanc » et son essai. Place prise ou illisible : RIEN n'est appelé, et c'est dit. Une erreur (registre
 * illisible, candidate refusée) : l'état ne change pas, l'erreur est rendue (la passe suivante réessaie).
 * `reglagesEnService` : les réglages du football EN SERVICE (une copie est faite ici). Rend { mise, essai, perimees,
 * attend, phrase, erreur }.
 */
export function mettreALEssaiLaSuivante({ place, reglagesEnService, database = openDb(), maintenant = Date.now() } = {}) {
  const sortie = { mise: null, essai: null, perimees: [], attend: false, phrase: null, erreur: null };
  const file = lireLesPropositions({ database, etats: ['acceptee'] }).sort(parRang);
  if (!file.length) return { ...sortie, phrase: 'Aucune correction en file.' };
  if (!place?.lisible || place.prise) return { ...sortie, attend: true, phrase: place?.phrase ?? 'La place de l’essai à blanc ne se lit pas : la file attend.' };
  const reglages = copieProfonde(reglagesEnService ?? {});
  for (const p of file) {
    if (!partDesReglagesEnService(p.declaration, p.levier, p.avant, reglages)) {
      changerLEtat(
        {
          id: p.id,
          evenement: 'perimee',
          vue: 'acceptee',
          source: 'nuit',
          phrase: `Périmée : les réglages du modèle de buts ont changé depuis la proposition (« ${libelleDuLevier(p.levier)} » partait de ${valeurDite(p.levier, p.avant)}) ; elle n’est pas mise à l’essai. Une nouvelle proposition reste possible.`,
          details: { levier: p.levier, avant: p.avant }
        },
        { database, maintenant }
      );
      sortie.perimees.push(p.id);
      continue;
    }
    let r;
    try {
      r = proposerUneCandidate(p.declaration, { origine: 'correction-mensuelle', maintenant });
    } catch (error) {
      return { ...sortie, erreur: `la correction « ${p.id} » n’a pas pu être mise à l’essai : ${String(error?.message ?? error).slice(0, 300)}` };
    }
    const c = r.candidate ?? {};
    const essai = { candidate: p.id, numero: c.essai?.numero ?? 1, depuis: c.essai?.depuis ?? iso(maintenant), versionEnService: c.essai?.versionEnService ?? null, auPlusTotLe: auPlusTotLe({ ...c, horizon: c.horizon ?? p.declaration?.horizon }) };
    const n = compterVariantes('26');
    changerLEtat(
      {
        id: p.id,
        evenement: 'mise-a-l-essai',
        vue: 'acceptee',
        source: 'nuit',
        phrase: `Mise à l’essai à blanc (essai n° ${essai.numero}, face à la version en service n° ${essai.versionEnService ?? '?'}) : rien ne change dans vos chiffres. Verdict au plus tôt le ${jourDit(essai.auPlusTotLe)} (${nombreDit(p.declaration?.horizon?.matchs ?? 800)} matchs joués et ${nombreDit(p.declaration?.horizon?.jours ?? 21)} jours). ${nombreDit(n)} correction${n >= 2 ? 's' : ''} déjà essayée${n >= 2 ? 's' : ''} : chacune élargit la marge du juge.`,
        details: { essai, corrections: n },
        maj: { essai }
      },
      { database, maintenant }
    );
    return { ...sortie, mise: p.id, essai };
  }
  return { ...sortie, phrase: 'Toutes les corrections en file étaient périmées.' };
}

// ============================================================ la synchronisation avec le registre des versions

const VERDICTS_DITS = Object.freeze({ retenu: 'retenue', 'pas-prouve': 'pas prouvé', 'moins-bon': 'moins bonne', 'pas-assez-de-matchs': 'pas assez de matchs' });
/** Les raisons d'adoption impossible pour TOUJOURS (étape 25, etatDeLAdoption) : la correction est rejetée. */
const ADOPTION_IMPOSSIBLE_POUR_TOUJOURS = Object.freeze(['moins-bon', 'pas-prouve', 'famille-moins-bonne', 'calibration']);

/** Le verdict rangé avec la candidate (registre des versions), résumé pour la proposition. */
const verdictResume = (j) => (j ? { verdict: j.verdict ?? null, jugeLe: j.le ?? null, matchs: j.matchs ?? null, gainPct: j.gainPct ?? null, fourchettePct: j.fourchettePct ?? null, variantes: j.variantes ?? null } : null);

/**
 * ACCORDE les propositions avec le registre des versions (`brut` : son contenu ; `etat` : etatDesVersions()) :
 *   acceptee   + la candidate du registre est elle          → a-blanc « reprise après un arrêt » (constat 3, B42) ;
 *   a-blanc    + son essai a recommencé                      → noté une fois au journal ;
 *              + jugée à l'horizon                           → jugee ; pas « retenu » (ou adoption impossible pour
 *                                                              toujours) → rejetee, et la place libérée ;
 *              + adoptée entre deux passes                   → jugee puis adoptee ;
 *              + sortie de l'essai sans la boucle            → interrompue ;
 *   jugee      + adoptée (Réglages)                          → adoptee ; jugement effacé (version changée) → a-blanc ;
 *              + pas retenue                                 → rejetee, place libérée ;
 *   adoptee    + retour arrière depuis sa version            → retiree (le retrait par proposition inverse est reporté) ;
 *   refusee / rejetee qui occupe encore la place             → place libérée.
 * Rend { changements: [{ id, de, vers }], liberees: [ids], erreurs: [] }.
 */
export function synchroniserAvecLesVersions({ brut, etat, database = openDb(), maintenant = Date.now(), candidateDuCode = CANDIDATE_EN_ESSAI } = {}) {
  const sortie = { changements: [], liberees: [], erreurs: [] };
  if (!brut) return sortie;
  const notee = brut.candidate ?? null;
  const passees = brut.candidatesPassees ?? [];
  const finDe = (id) => [...passees].reverse().find((x) => x?.id === id) ?? null;
  const changer = (p, evenement, vue, phrase, details = {}, maj = {}) => {
    const apres = changerLEtat({ id: p.id, evenement, vue, source: 'registre', phrase, details, maj }, { database, maintenant });
    sortie.changements.push({ id: p.id, de: vue, vers: apres.etat });
    return apres;
  };
  const liberer = (p, pourquoi) => {
    const r = libererLaPlace(p.id, { brut, database, maintenant, candidateDuCode, pourquoi });
    if (r.libere) sortie.liberees.push(p.id);
    return r;
  };
  const rejeter = (p, verdict) => {
    const v = p.essai ?? {};
    changer(
      p,
      'rejetee',
      'jugee',
      verdict === 'retenu'
        ? `Rejetée : retenue en bloc, mais l’adoption est impossible (${etat?.adoption?.texte ?? 'une famille ou la porte de sûreté'}) ; la place de l’essai est libérée.`
        : `Rejetée : ${verdict === 'moins-bon' ? 'elle fait moins bien que la version en service, au-delà du hasard' : 'l’écart avec la version en service peut venir du hasard'} (${nombreDit(v.matchs ?? 0)} matchs) ; la place de l’essai est libérée.`,
      { verdict }
    );
  };
  const propositions = lireLesPropositions({ database, etats: ['acceptee', 'a-blanc', 'jugee', 'adoptee', 'refusee', 'rejetee'] });
  for (const p of propositions) {
    try {
      const dansLaPlace = notee?.id === p.id && notee?.origine === 'correction-mensuelle';
      if (p.etat === 'acceptee') {
        if (!dansLaPlace) continue;
        const essai = { candidate: p.id, numero: notee.essai?.numero ?? 1, depuis: notee.essai?.depuis ?? notee.enEssaiDepuis ?? iso(maintenant), versionEnService: notee.essai?.versionEnService ?? null, auPlusTotLe: auPlusTotLe(notee) };
        changer(p, 'mise-a-l-essai', 'acceptee', `Mise à l’essai à blanc (reprise après un arrêt de l’appli : la correction était déjà au registre des versions) : essai n° ${essai.numero}, verdict au plus tôt le ${jourDit(essai.auPlusTotLe)}.`, { essai, reprise: true }, { essai });
        continue;
      }
      if (p.etat === 'a-blanc' || p.etat === 'jugee') {
        if (dansLaPlace) {
          const numero = notee.essai?.numero ?? 1;
          const dejaNote = (p.essai?.numero ?? 1) >= numero || lireLeJournal({ database, proposition: p.id, limite: 200 }).some((e) => e.evenement === 'essai-recommence' && e.details?.numero === numero);
          if (!dejaNote) {
            ajouterAuJournal(
              {
                proposition: p.id,
                evenement: 'essai-recommence',
                source: 'registre',
                phrase: `Essai recommencé (la version en service a changé : essai n° ${numero} face à la version n° ${notee.essai?.versionEnService ?? '?'}, depuis le ${quandDit(notee.essai?.depuis)}) : il compte comme une correction essayée de plus.`,
                details: { numero, versionEnService: notee.essai?.versionEnService ?? null, depuis: notee.essai?.depuis ?? null }
              },
              { database, maintenant }
            );
          }
          const essaiDuRegistre = { ...(p.essai ?? {}), numero, depuis: notee.essai?.depuis ?? p.essai?.depuis ?? null, versionEnService: notee.essai?.versionEnService ?? null, auPlusTotLe: auPlusTotLe(notee) };
          if (p.etat === 'jugee' && !notee.jugement) {
            // Le verdict a été effacé (la version en service a changé avant l'adoption) : l'essai recommence.
            changer(p, 'essai-repris', 'jugee', `Verdict effacé : la version en service a changé avant l’adoption — l’essai à blanc recommence (essai n° ${numero}, verdict au plus tôt le ${jourDit(essaiDuRegistre.auPlusTotLe)}).`, { essai: essaiDuRegistre }, { essai: essaiDuRegistre });
            continue;
          }
          if (p.etat === 'a-blanc' && notee.jugement) {
            const v = verdictResume(notee.jugement);
            const essai = { ...essaiDuRegistre, ...v };
            const dit = VERDICTS_DITS[v.verdict] ?? v.verdict;
            const apres = changer(
              p,
              'jugee',
              'a-blanc',
              `Jugée à l’horizon (${nombreDit(v.matchs ?? 0)} matchs joués) : ${dit}${v.verdict === 'retenu' ? ' — elle fait mieux que la version en service au-delà du hasard. À adopter (ou non) dans Réglages › Versions du moteur.' : '.'}`,
              { essai },
              { essai }
            );
            p.etat = apres.etat;
            p.essai = apres.essai;
          }
          if (p.etat === 'jugee') {
            const verdict = p.essai?.verdict ?? notee.jugement?.verdict ?? null;
            const adoption = etat?.candidate?.id === p.id ? etat.adoption?.raison ?? null : null;
            if (verdict !== 'retenu' || ADOPTION_IMPOSSIBLE_POUR_TOUJOURS.includes(adoption)) {
              rejeter(p, verdict);
              liberer(p, 'rejetée');
            }
          }
          continue;
        }
        const fin = finDe(p.id);
        if (fin?.fin === 'adoptee') {
          if (p.etat === 'a-blanc') {
            const v = verdictResume(fin.jugement);
            const apres = changer(p, 'jugee', 'a-blanc', `Jugée à l’horizon (${nombreDit(v?.matchs ?? 0)} matchs joués) : ${VERDICTS_DITS[v?.verdict] ?? v?.verdict ?? 'retenue'}.`, { essai: { ...(p.essai ?? {}), ...v } }, { essai: { ...(p.essai ?? {}), ...v } });
            p.etat = apres.etat;
          }
          changer(
            p,
            'adoptee',
            'jugee',
            `Adoptée par vous le ${jourDit(fin.finLe)} : version n° ${fin.version ?? '?'}. Pour la retirer : Réglages › Versions du moteur › « Revenir à la version précédente », tant qu’elle est la dernière version ; ${RETRAIT_PLUS_TARD}.`,
            { version: fin.version ?? null, le: fin.finLe ?? null },
            { versionAdoptee: Number.isInteger(fin.version) ? fin.version : null }
          );
          continue;
        }
        changer(
          p,
          'interrompue',
          p.etat,
          `Interrompue : l’essai à blanc a été arrêté hors de la boucle de correction (${fin?.fin === 'remplacee' ? 'remplacée par une autre candidate' : fin?.fin === 'modifiee' ? 'candidate modifiée' : fin?.fin === 'refusee' ? 'refusée par le registre des versions' : fin ? 'retirée' : 'absente du registre des versions'}).`,
          { fin: fin?.fin ?? null }
        );
        continue;
      }
      if (p.etat === 'adoptee') {
        // L'heure de l'adoption (registre des versions), sinon celle du passage à « adoptee » : un retour arrière fait
        // juste après l'adoption, avant la passe suivante, compte aussi.
        const adoptee = Date.parse(finDe(p.id)?.finLe ?? p.etatLe);
        const retour = (brut.journal ?? []).find((e) => e?.action === 'retour' && Number.isInteger(p.versionAdoptee) && e.depuis === p.versionAdoptee && Date.parse(e.le) >= adoptee);
        if (retour) changer(p, 'retiree', 'adoptee', `Retirée par un retour arrière le ${jourDit(retour.le)} (retour à la version n° ${retour.version}).`, { retour });
        continue;
      }
      if ((p.etat === 'refusee' || p.etat === 'rejetee') && dansLaPlace) liberer(p, p.etat === 'refusee' ? 'refusée par vous' : 'rejetée');
    } catch (error) {
      sortie.erreurs.push(`« ${p.id} » : ${String(error?.message ?? error).slice(0, 300)}`);
    }
  }
  return sortie;
}
