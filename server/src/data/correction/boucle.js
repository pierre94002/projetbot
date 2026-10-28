/**
 * boucle.js — LA BOUCLE DE CORRECTION : l'étape de la passe d'actualisation et les clics de Pierre (étape 26 du plan,
 * partie B, 28/10/2026).
 * -----------------------------------------------------------------------
 * faireLaBoucle (l'étape « boucleCorrection », dans la passe, sous son verrou), dans cet ordre :
 *   1. relire les propositions (une table illisible : erreur, rien d'écrit, alerte) ; une mesure au banc restée
 *      « au-banc » sans banc en cours dans ce serveur (l'appli fermée pendant le banc) revient « à mesurer »
 *      (constat 2, l'événement « banc-interrompu ») ;
 *   2. accorder les propositions avec le registre des versions (miseALEssai.synchroniserAvecLesVersions : jugée,
 *      adoptée, interrompue, essai recommencé, retour arrière, reprise d'une mise à l'essai interrompue, place
 *      libérée d'une correction refusée ou rejetée) — registre illisible : rien d'autre que le tri n'attend pas ;
 *   3. TRIER les mois écoulés et figés par la calibration (tri.moisATrier : au plus 6 par passe, dans l'ordre ; le
 *      seul travail lourd, une fois par mois, en rendant la main) — un tri en échec n'écrit rien ;
 *   4. après le tri du DERNIER mois seulement : les propositions des règles (propositions.proposerPourLeTri —
 *      jamais depuis un mois rattrapé plus ancien) et les « demandes du code » (notées une fois par lignée) ; sans mois
 *      trié à cette passe, refaites sur le dernier tri rangé quand la passe précédente a échoué ici
 *      (`refaireLesPropositions`, vérification finale, constat 3) ;
 *   5. la suivante en file passe à blanc si la place est libre (miseALEssai.mettreALEssaiLaSuivante).
 * Aucun banc ici : le banc d'une correction part au CLIC de Pierre (bancDesCorrections.js). Rien n'écrit les
 * réglages du moteur, rien n'adopte : l'adoption reste le bouton de Réglages › Versions du moteur.
 * Les clics de Pierre (routes /api/corrections) : proposer (formulaire, fermé pendant l'essai de l'étape 27),
 * accepter (« Mettre à l'essai » : en file), refuser, et le retrait d'une correction adoptée — par le retour arrière
 * de Réglages tant qu'elle est la dernière version (le retrait par proposition inverse est reporté). Jamais pendant
 * une passe, un import ou un banc ; l'état vu à l'écran (`vue`) est comparé (un double clic n'agit pas deux fois).
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { FICHIER_VERSIONS, etatDesVersions } from '../../core/engine/engineVersions.js';
import { lireReglagesDuMoteur } from '../../core/engine/engineConfig.js';
import { readJsonFile } from '../../utils/atomicJson.js';
import { creerPauses, executerEnRendantLaMain } from '../../utils/travailCooperatif.js';
import { isRefreshRunning } from '../providers/refreshLock.js';
import { moisSuivant } from '../calibration.js';
import { PREMIER_MOIS_DU_TRI, VERSION_DU_TRI, ETATS_DE_PROPOSITION } from './regles.js';
import { moisATrier, trierLeMois, placeDeLEssai } from './tri.js';
import { empreinteDesPronostics } from './lignee.js';
import { ecrireLeTri, lireLeTri, listeDesTris, lireLesPropositions, lireUneProposition, creerUneProposition, changerLEtat, ajouterAuJournal, lireLeJournal, CorrectionRefusee } from './depotCorrections.js';
import { proposerPourLeTri, propositionDePierre, copieProfonde, moisDit, deMois, nombreDit, jourDit, caseDite, pointsDits, libelleDuLevier, valeurDite, RETRAIT_PLUS_TARD } from './propositions.js';
import { etatDeLaPlace, mettreALEssaiLaSuivante, synchroniserAvecLesVersions } from './miseALEssai.js';
import { bancDeCorrectionEnCours } from './bancDesCorrections.js';

const iso = (t) => new Date(t).toISOString();
const message = (error) => String(error?.message ?? error).slice(0, 300);
const pluriel = (n, un, plusieurs) => `${nombreDit(n)} ${n >= 2 ? plusieurs : un}`;

/** La phrase d'une mesure au banc interrompue (constat 2). */
export const PHRASE_DU_BANC_INTERROMPU =
  'Mesure au banc interrompue (l’appli a été fermée pendant la mesure) : la correction revient « à mesurer » ; relancez la mesure quand vous voulez — elle ne compte pas deux fois.';

/** La version en service et l'empreinte de ses pronostics (lignee.js), lues dans le contenu du registre des versions. */
function versionDuMoment(brut) {
  const v = Array.isArray(brut?.versions) ? brut.versions.find((x) => x?.numero === brut.enService) ?? null : null;
  return v ? { versionEnService: v.numero, base: empreinteDesPronostics(v) } : { versionEnService: null, base: null };
}

/** La phrase d'un tri figé, pour le journal (sans jargon). */
export function phraseDuTri(tri) {
  const s = tri?.resume?.statuts ?? {};
  const morceaux = [];
  const dire = (code, un, plusieurs) => {
    if (s[code]) morceaux.push(pluriel(s[code], un, plusieurs));
  };
  dire('vrai-defaut', 'vrai défaut', 'vrais défauts');
  dire('a-surveiller', 'à surveiller', 'à surveiller');
  dire('petit-ecart', 'petit écart', 'petits écarts');
  dire('dans-la-marge', 'dans la marge (malchance)', 'dans la marge (malchance)');
  dire('trop-tot', 'trop tôt (un seul mois compté)', 'trop tôt (un seul mois compté)');
  dire('trop-peu', 'trop peu de matchs', 'trop peu de matchs');
  dire('mois-de-changement', 'mois de changement de version', 'mois de changement de version');
  dire('en-essai', 'en essai', 'en essai');
  const defauts = (tri?.cases ?? []).filter((c) => c.statut === 'vrai-defaut').map((c) => `${caseDite(c.cas)} : ${c.sensDit ?? 'écart'} (${pointsDits(c.fenetre?.ecart ?? 0)})`);
  const l = tri?.lignee;
  const version = l?.versionEnService ? `version n° ${l.versionEnService}${(l.versions ?? []).length > 1 ? `, avec ${(l.versions ?? []).filter((n) => n !== l.versionEnService).map((n) => `n° ${n}`).join(', ')} : mêmes pronostics` : ''}${l.couverture?.partiel ? ' ; mois partiel' : ''}` : 'aucune version en service';
  return `Tri ${deMois(tri?.mois)} figé (${version}) : ${morceaux.join(', ') || 'aucune case'}${defauts.length ? ` — ${defauts.join(' ; ')}` : ''}.`;
}

/**
 * L'ÉTAPE DE LA PASSE (« boucleCorrection ») : voir l'en-tête. `pauses` : celles de la passe (rendre la main au
 * serveur). `refaireLesPropositions` : la passe précédente a échoué à l'étape 4 (passeBoucleCorrection le lit dans ce
 * qu'elle a rangé). Ne lève jamais : chaque morceau dit son erreur. Rend { le, orphelins, synchro, tris, propositions
 * (creees, ecartees, refaites : le mois du tri sur lequel elles ont été refaites, ou null), demandesDuCode, miseALEssai,
 * place, erreurs, avertissements, dureeMs, blocMaxMs }.
 */
export async function faireLaBoucle({ maintenant = Date.now(), database = null, pauses = creerPauses(), refaireLesPropositions = false } = {}) {
  const debut = performance.now();
  const bilan = { le: iso(maintenant), orphelins: [], synchro: null, tris: [], propositions: { creees: [], ecartees: [], refaites: null }, demandesDuCode: [], miseALEssai: null, place: null, erreurs: [], avertissements: [], dureeMs: 0 };
  const fin = () => {
    const b = pauses.bilan();
    return { ...bilan, dureeMs: Math.round(performance.now() - debut), blocMaxMs: b.blocMaxMs, blocMaxOu: b.blocMaxOu };
  };
  let db;
  let propositions;
  try {
    db = database ?? openDb();
    propositions = lireLesPropositions({ database: db });
  } catch (error) {
    bilan.erreurs.push({ etape: 'lecture', message: `les tables de la boucle de correction ne se lisent pas : ${message(error)}` });
    return fin();
  }
  // 1. Une mesure au banc interrompue (appli fermée pendant le banc) : de retour « à mesurer » (constat 2).
  const banc = bancDeCorrectionEnCours();
  for (const p of propositions.filter((x) => x.etat === 'au-banc' && x.id !== banc?.id)) {
    try {
      changerLEtat({ id: p.id, evenement: 'banc-interrompu', vue: 'au-banc', source: 'nuit', phrase: PHRASE_DU_BANC_INTERROMPU, details: { auBancDepuis: p.etatLe } }, { database: db, maintenant });
      bilan.orphelins.push(p.id);
    } catch (error) {
      bilan.erreurs.push({ etape: 'banc-interrompu', message: `« ${p.id} » : ${message(error)}` });
    }
  }
  await pauses.pause('propositions relues');
  // 2. Le registre des versions : la synchronisation, puis la place.
  let brut = null;
  let etat = null;
  try {
    brut = readJsonFile(FICHIER_VERSIONS, null);
    etat = etatDesVersions();
    if (etat.source !== 'enregistre') {
      bilan.avertissements.push({ etape: 'versions', message: etat.source === 'absent' ? 'le registre des versions n’existe pas encore' : `le registre des versions est illisible (${etat.probleme ?? 'raison inconnue'})` });
      brut = null;
    }
  } catch (error) {
    bilan.avertissements.push({ etape: 'versions', message: `le registre des versions ne se lit pas : ${message(error)}` });
    brut = null;
  }
  if (brut) {
    try {
      bilan.synchro = synchroniserAvecLesVersions({ brut, etat, database: db, maintenant });
      for (const e of bilan.synchro.erreurs) bilan.erreurs.push({ etape: 'synchronisation', message: e });
      if (bilan.synchro.changements.length || bilan.synchro.liberees.length) {
        brut = readJsonFile(FICHIER_VERSIONS, null);
        etat = etatDesVersions();
      }
    } catch (error) {
      bilan.erreurs.push({ etape: 'synchronisation', message: message(error) });
    }
  }
  let place = etatDeLaPlace({ etat: etat ?? { source: 'illisible' }, propositions });
  await pauses.pause('registre des versions');
  // 3. Le tri des mois écoulés (au plus 6, dans l'ordre), seulement avec un registre des versions lisible.
  let aTrier = [];
  try {
    aTrier = moisATrier({ database: db, maintenant });
  } catch (error) {
    bilan.erreurs.push({ etape: 'tri', message: `les mois à trier ne se lisent pas : ${message(error)}` });
  }
  if (aTrier.length && !brut) {
    bilan.avertissements.push({ etape: 'tri', message: `${moisDit(aTrier[0])} attend : le registre des versions ne se lit pas` });
    aTrier = [];
  }
  let dernierTri = null;
  for (const mois of aTrier) {
    try {
      const tri = await executerEnRendantLaMain(trierLeMois(mois, { database: db, versions: brut, enSlot: placeDeLEssai(etat), maintenant }), pauses.siLongtemps);
      const r = ecrireLeTri(tri, { database: db, phrase: phraseDuTri(tri), maintenant });
      bilan.tris.push({ mois, ecrit: r.ecrit, version: r.tri.version, lignee: r.tri.lignee ? { versionEnService: r.tri.lignee.versionEnService, versions: r.tri.lignee.versions, partiel: Boolean(r.tri.lignee.couverture?.partiel) } : null, statuts: r.tri.resume?.statuts ?? null, vraisDefauts: r.tri.resume?.vraisDefauts ?? [], dureeMs: tri.dureeMs, phrase: phraseDuTri(r.tri) });
      dernierTri = r.tri;
    } catch (error) {
      bilan.erreurs.push({ etape: 'tri', mois, message: `${moisDit(mois)} : ${message(error)}` });
      dernierTri = null;
      break;
    }
    await pauses.pause('entre deux mois triés');
  }
  // 4. Après le tri du DERNIER mois seulement (jamais depuis un mois rattrapé plus ancien). Vérification finale,
  //    constat 3 : sans mois trié à cette passe, l'étape est refaite sur le DERNIER tri rangé quand la passe précédente
  //    a échoué ici (sinon ses propositions ne naissaient jamais : elles ne partent qu'après le tri) ; les gardes « déjà
  //    ouverte » et « déjà proposée par ce tri » évitent les doublons.
  let triDesPropositions = dernierTri && bilan.tris.length === aTrier.length ? dernierTri : null;
  if (!triDesPropositions && refaireLesPropositions && !aTrier.length && brut) {
    try {
      const t = listeDesTris({ database: db }).find((x) => x.version === VERSION_DU_TRI) ?? null;
      triDesPropositions = t ? lireLeTri(t.mois, { database: db, version: t.version, avecSommes: true }) : null;
      if (triDesPropositions) bilan.propositions.refaites = triDesPropositions.mois;
    } catch (error) {
      bilan.erreurs.push({ etape: 'propositions', message: `le dernier tri rangé ne se relit pas : ${message(error)}` });
    }
  }
  if (triDesPropositions) {
    try {
      const actuelles = lireLesPropositions({ database: db });
      const { base, versionEnService } = versionDuMoment(brut);
      const r = proposerPourLeTri({ tri: triDesPropositions, reglagesEnService: copieProfonde(lireReglagesDuMoteur().football), propositions: actuelles, place, base, versionEnService, maintenant });
      for (const { proposition, phrase } of r.aCreer) {
        try {
          creerUneProposition(proposition, { database: db, phrase, maintenant, sourceDuJournal: 'regle' });
          bilan.propositions.creees.push({ id: proposition.id, levier: proposition.levier, avant: proposition.avant, apres: proposition.apres });
        } catch (error) {
          if (error instanceof CorrectionRefusee && error.raison === 'deja-prise') continue;
          bilan.erreurs.push({ etape: 'propositions', message: `« ${proposition.id} » : ${message(error)}` });
        }
      }
      bilan.propositions.ecartees = r.ecartees.map((e) => ({ cas: e.cas ?? null, raison: e.raison }));
      const notees = new Set(lireLeJournal({ database: db, evenement: 'demande-du-code', limite: 200 }).map((e) => `${e.details?.cas}|${e.details?.lignee}`));
      for (const d of r.demandesDuCode) {
        if (notees.has(`${d.details.cas}|${d.details.lignee}`)) continue;
        ajouterAuJournal({ proposition: null, evenement: 'demande-du-code', source: 'regle', phrase: d.phrase, details: d.details }, { database: db, maintenant });
        bilan.demandesDuCode.push(d.cas);
      }
    } catch (error) {
      bilan.erreurs.push({ etape: 'propositions', message: message(error) });
    }
  }
  await pauses.pause('propositions des règles');
  // 5. La suivante en file passe à blanc, si la place est libre.
  try {
    bilan.miseALEssai = mettreALEssaiLaSuivante({ place, reglagesEnService: copieProfonde(lireReglagesDuMoteur().football), database: db, maintenant });
    if (bilan.miseALEssai.erreur) bilan.avertissements.push({ etape: 'mise-a-l-essai', message: bilan.miseALEssai.erreur });
    if (bilan.miseALEssai.mise) place = etatDeLaPlace({ propositions });
  } catch (error) {
    bilan.erreurs.push({ etape: 'mise-a-l-essai', message: message(error) });
  }
  bilan.place = { lisible: place.lisible, prise: place.prise, par: place.par, candidate: place.candidate?.id ?? null, phrase: place.phrase };
  return fin();
}

/** Le résumé de l'étape pour l'historique des passes (des mots, pas de jargon). */
export function resumeDeLaBoucle(r) {
  const morceaux = [];
  for (const t of r.tris ?? []) morceaux.push(t.ecrit ? t.phrase.replace(/\.$/, '') : `${moisDit(t.mois)} : déjà trié, rien réécrit`);
  if (r.propositions?.refaites) morceaux.push(`propositions du tri ${deMois(r.propositions.refaites)} refaites (la passe précédente avait échoué à cette étape)`);
  const creees = r.propositions?.creees ?? [];
  if (creees.length) morceaux.push(`${pluriel(creees.length, 'correction proposée', 'corrections proposées')} (${creees.map((c) => `${libelleDuLevier(c.levier)} : ${valeurDite(c.levier, c.avant)} → ${valeurDite(c.levier, c.apres)}`).join(' ; ')}) — à mesurer au banc d’essai ou à refuser, dans Santé du moteur`);
  if ((r.demandesDuCode ?? []).length) morceaux.push(`${pluriel(r.demandesDuCode.length, 'défaut noté « demande du code »', 'défauts notés « demande du code »')}`);
  const vers = (etat) => (r.synchro?.changements ?? []).filter((c) => c.vers === etat).length;
  const dits = [
    [vers('a-blanc'), 'correction reprise à l’essai à blanc', 'corrections reprises à l’essai à blanc'],
    [vers('jugee'), 'correction jugée à l’horizon', 'corrections jugées à l’horizon'],
    [vers('adoptee'), 'correction adoptée (par vous, dans Réglages)', 'corrections adoptées (par vous, dans Réglages)'],
    [vers('rejetee'), 'correction rejetée', 'corrections rejetées'],
    [vers('retiree'), 'correction retirée par un retour arrière', 'corrections retirées par un retour arrière'],
    [vers('interrompue'), 'correction interrompue hors de la boucle', 'corrections interrompues hors de la boucle'],
    [(r.synchro?.liberees ?? []).length, 'place de l’essai libérée', 'places de l’essai libérées'],
    [(r.orphelins ?? []).length, 'mesure au banc interrompue remise « à mesurer »', 'mesures au banc interrompues remises « à mesurer »'],
    [(r.miseALEssai?.perimees ?? []).length, 'correction périmée (réglages changés depuis)', 'corrections périmées (réglages changés depuis)']
  ];
  for (const [n, un, plusieurs] of dits) if (n) morceaux.push(pluriel(n, un, plusieurs));
  if (r.miseALEssai?.mise) morceaux.push(`la correction « ${r.miseALEssai.mise} » passe à l’essai à blanc (verdict au plus tôt le ${jourDit(r.miseALEssai.essai?.auPlusTotLe)})`);
  else if (r.miseALEssai?.attend) morceaux.push(`file d’attente : ${String(r.miseALEssai.phrase ?? '').replace(/\.$/, '')}`);
  if (r.place?.prise && !r.miseALEssai?.attend && !r.miseALEssai?.mise && r.place.phrase) morceaux.push(r.place.phrase.replace(/\.$/, ''));
  for (const e of r.erreurs ?? []) morceaux.push(`en échec — ${e.message}`);
  for (const a of r.avertissements ?? []) morceaux.push(`à regarder — ${a.message}`);
  const tete = morceaux.length ? `${morceaux.join(' ; ')}.` : 'Rien de nouveau : aucun mois à trier, aucune correction qui avance.';
  return `${tete.replace(/^./, (x) => x.toUpperCase())} La boucle ne change aucun chiffre du moteur (le serveur jamais tenu plus de ${nombreDit(Math.round(r.blocMaxMs ?? 0))} ms d’affilée).`;
}

/** Les propositions qui demandent à l'étape de tourner à chaque passe (synchronisation avec le registre des versions). */
const ETATS_SUIVIS = Object.freeze(['au-banc', 'acceptee', 'a-blanc', 'jugee', 'adoptee']);

/**
 * Le prochain mois à trier et le jour où il peut l'être (« novembre 2026 », le 01/12/2026 à partir de 6 h, après le
 * gel de la calibration) : le mois qui suit le dernier trié, ou le premier mois du tri.
 */
function prochainTri({ database }) {
  const tries = listeDesTris({ database }).filter((t) => t.version === VERSION_DU_TRI).map((t) => t.mois).sort();
  const mois = tries.length ? moisSuivant(tries.at(-1)) : PREMIER_MOIS_DU_TRI;
  return { mois, le: `${moisSuivant(mois)}-01` };
}

/**
 * L'ÉTAPE EST-ELLE DUE ? Un mois à trier (une fois par mois, rattrapage jusqu'à 6 par passe), une correction qui
 * avance ou à surveiller, une correction qui occupe la place de l'essai, ou un clic « Actualiser » (qui ne refait
 * jamais un tri figé). LIT seulement ; une lecture impossible fait tourner l'étape, qui dira pourquoi. Rend { du, raison }.
 */
export function dueBoucle({ database = null, maintenant = Date.now(), manuel = false } = {}) {
  try {
    const db = database ?? openDb();
    if (manuel) return { du: true, raison: 'au clic « Actualiser »' };
    const mois = moisATrier({ database: db, maintenant });
    if (mois.length) return { du: true, raison: `${moisDit(mois[0])} à trier` };
    const suivies = lireLesPropositions({ database: db, etats: [...ETATS_SUIVIS] });
    if (suivies.length) return { du: true, raison: `${pluriel(suivies.length, 'correction à suivre', 'corrections à suivre')}` };
    if (readJsonFile(FICHIER_VERSIONS, null)?.candidate?.origine === 'correction-mensuelle') return { du: true, raison: 'une correction occupe la place de l’essai à blanc' };
    const p = prochainTri({ database: db });
    return { du: false, raison: `Rien à faire à cette passe : aucun mois à trier (le prochain, ${moisDit(p.mois)}, se trie à partir du ${jourDit(`${p.le}T12:00:00.000Z`)} à 6 h, après le gel de la calibration) et aucune correction en cours.` };
  } catch (error) {
    return { du: true, raison: `vérification impossible (${message(error)}) : l’étape tourne et dira pourquoi` };
  }
}

/** Ce que dit l'étape quand elle n'est pas due. */
export function pourquoiPasDue(options = {}) {
  const d = dueBoucle(options);
  return d.du ? 'Pas due à cette passe.' : d.raison;
}

// ============================================================ les clics de Pierre

/** Aucune écriture pendant une passe, un import ou un banc (le verrou de l'actualisation). */
function gardeDesEcritures() {
  if (isRefreshRunning()) throw new CorrectionRefusee('passe-en-cours', 'Une actualisation, un import ou un banc tient la base : rien n’a changé. Réessayez dans quelques minutes.', 409);
}
function vueRequise(vue) {
  if (typeof vue !== 'string' || !ETATS_DE_PROPOSITION.includes(vue)) throw new CorrectionRefusee('vue', '« vue » est requis : l’état de la correction vu à l’écran. Rien n’a changé.', 400);
}
function lireOuRefuser(id, database) {
  const p = lireUneProposition(id, { database });
  if (!p) throw new CorrectionRefusee('inconnue', `Aucune correction « ${String(id)} ».`, 404);
  return p;
}

/**
 * PROPOSER (le formulaire de Pierre, POST /api/corrections/proposer) : la proposition est construite et contrôlée
 * par propositions.propositionDePierre (fermé pendant l'essai de l'étape 27), puis créée « à mesurer » avec son
 * entrée au journal. Lève CorrectionRefusee / PropositionRefusee (avec `statut`) ; rend la proposition.
 */
export function proposerUneCorrection(corps, { database = null, maintenant = Date.now() } = {}) {
  gardeDesEcritures();
  const db = database ?? openDb();
  const propositions = lireLesPropositions({ database: db });
  let etat;
  let brut;
  try {
    etat = etatDesVersions();
    brut = etat.source === 'enregistre' ? readJsonFile(FICHIER_VERSIONS, null) : null;
  } catch (error) {
    throw new CorrectionRefusee('versions-illisibles', `Le registre des versions ne se lit pas (${message(error)}) : rien n’est proposé. Réessayez dans un instant.`, 503);
  }
  const place = etatDeLaPlace({ etat, propositions });
  const { base } = versionDuMoment(brut);
  const { proposition, phrase } = propositionDePierre(corps, { reglagesEnService: copieProfonde(lireReglagesDuMoteur().football), propositions, place, base, maintenant });
  return creerUneProposition(proposition, { database: db, phrase, maintenant, sourceDuJournal: 'pierre' });
}

/**
 * ACCEPTER (« Mettre à l'essai », POST /api/corrections/:id/accepter { vue }) : seulement après le banc (mesurée, ou
 * banc impossible) ; la correction entre en file (premier accepté, premier servi) — rien n'est écrit au registre des
 * versions au clic : la passe suivante la met à blanc si la place est libre.
 */
export function accepterUneCorrection({ id, vue }, { database = null, maintenant = Date.now() } = {}) {
  gardeDesEcritures();
  vueRequise(vue);
  const db = database ?? openDb();
  lireOuRefuser(id, db);
  const rang = 1 + Math.max(0, ...lireLesPropositions({ database: db }).map((p) => (Number.isInteger(p.rangFile) ? p.rangFile : 0)));
  let place = null;
  try {
    place = etatDeLaPlace();
  } catch {
    place = null;
  }
  return changerLEtat(
    {
      id,
      evenement: 'acceptee',
      vue,
      source: 'pierre',
      phrase: `Acceptée par vous : en file pour l’essai à blanc (rang ${nombreDit(rang)}).${place?.prise ? ' Une autre candidate est en essai : celle-ci attendra son tour.' : ' Elle passera à blanc à la prochaine passe d’actualisation.'} Rien ne change dans vos chiffres.`,
      details: { rang },
      maj: { rangFile: rang }
    },
    { database: db, maintenant }
  );
}

/**
 * REFUSER (POST /api/corrections/:id/refuser { vue, phrase? }) : possible avant comme après le banc, et pendant
 * l'essai à blanc (la place est libérée à la passe suivante) ; le réglage n'est plus proposé par les règles avant
 * 6 mois. Une correction refusée avant son banc n'a jamais été comptée.
 */
export function refuserUneCorrection({ id, vue, phrase = null }, { database = null, maintenant = Date.now() } = {}) {
  gardeDesEcritures();
  vueRequise(vue);
  const db = database ?? openDb();
  const p = lireOuRefuser(id, db);
  const mot = phrase === null || phrase === undefined ? '' : String(phrase).replace(/\s+/g, ' ').trim();
  if (mot.length > 300) throw new CorrectionRefusee('phrase', 'La phrase fait plus de 300 caractères. Rien n’a changé.', 400);
  const aBlanc = p.etat === 'a-blanc' || p.etat === 'jugee';
  return changerLEtat(
    {
      id,
      evenement: 'refusee',
      vue,
      source: 'pierre',
      phrase: `Refusée par vous${mot ? ` : « ${mot} »` : ''}. Ce réglage ne sera plus proposé avant 6 mois.${aBlanc ? ' Son essai à blanc s’arrête à la prochaine passe.' : ''}${p.etat === 'proposee' ? ' Elle n’avait pas été mesurée : elle ne compte pas parmi les corrections essayées.' : ''} Rien ne change dans vos chiffres.`,
      details: { phrase: mot || null }
    },
    { database: db, maintenant }
  );
}

/**
 * RETIRER une correction adoptée (POST /api/corrections/:id/retirer { vue }) : par le RETOUR ARRIÈRE de Réglages ›
 * Versions du moteur, seulement si sa version est encore la dernière (au sommet de la pile) — la route ne l'exécute
 * pas elle-même (aucun module de la boucle n'écrit les réglages) : elle dit où cliquer. Sinon refusé : le retrait
 * par une proposition inverse est reporté (plus tard). N'écrit rien.
 */
export function retirerUneCorrection({ id, vue }, { database = null } = {}) {
  gardeDesEcritures();
  vueRequise(vue);
  const db = database ?? openDb();
  const p = lireOuRefuser(id, db);
  if (p.etat !== vue) throw new CorrectionRefusee('deja-change', `La correction « ${id} » n’est plus « ${vue} » mais « ${p.etat} » : rien n’a changé. Relisez.`, 409);
  if (p.etat !== 'adoptee') throw new CorrectionRefusee('transition', 'Seule une correction adoptée se retire.', 409);
  let etat;
  try {
    etat = etatDesVersions();
  } catch (error) {
    throw new CorrectionRefusee('versions-illisibles', `Le registre des versions ne se lit pas (${message(error)}) : rien n’a changé.`, 503);
  }
  const auSommet = etat?.enService?.numero === p.versionAdoptee;
  if (!auSommet) {
    throw new CorrectionRefusee('pas-au-sommet', `La correction n’est plus la dernière version du moteur (version n° ${etat?.enService?.numero ?? '?'} en service, elle est entrée avec la n° ${p.versionAdoptee ?? '?'}) : ${RETRAIT_PLUS_TARD}. Rien n’a changé.`, 409);
  }
  if (!etat.retour?.possible) throw new CorrectionRefusee('retour-impossible', `Le retour arrière n’est pas possible pour l’instant : ${etat.retour?.texte ?? 'raison inconnue'} Rien n’a changé.`, 409);
  return {
    possible: true,
    depuis: etat.enService.numero,
    vers: etat.retour.vers,
    lien: { chemin: '/reglages', query: null, libelle: 'Réglages › Versions du moteur › Revenir à la version précédente' },
    phrase: `Pour la retirer tout de suite : Réglages › Versions du moteur › « Revenir à la version précédente » (version n° ${etat.enService.numero} → n° ${etat.retour.vers}), avec sa confirmation. Rien n’est retiré d’ici ; la boucle notera le retrait à la passe suivante.`
  };
}
