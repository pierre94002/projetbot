#!/usr/bin/env node
/**
 * recette.mjs — LES GESTES DE LA RECETTE GÉNÉRALE, LANCÉS À LA MAIN (étape 47 du plan, lot 1 ; modes de P3, 17/11/2026).
 * -----------------------------------------------------------------------
 * Modes (un seul par lancement) :
 *   --verifier-les-causes                    J0 : tout ce qui n'est pas vert doit avoir une cause (CR-30, trois issues :
 *                                            reconnu d'office ou rattachable à la main / laissé ouvert avec l'accord de
 *                                            Pierre / trou). Code 0 sans trou, 1 avec, 2 si un fichier ne se lit pas.
 *                                            Imprime aussi l'empreinte des causes (CR-19) et les niveaux de J0 des bornes.
 *   --empreinte                              l'empreinte des trois fichiers normalisés (CR-19), seule.
 *   --annoncer-la-mise-en-service "<quoi>"   écrit l'annonce (valable 60 min) que le journal lit au démarrage (CR-2).
 *   --resume-du-jour [--jour AAAA-MM-JJ]     le jour (par défaut : hier, jour de Paris) : contrôle de vie, couverture,
 *                                            événements, « à expliquer » et leur âge, appels au coup d'envoi (compte
 *                                            seul), épisodes, décompte (CR-20, CR-27, CR-28). Le coût de la veille est
 *                                            « non compté » (P4b-1, décision 25 a : season-calendar.json n'est plus lu) ;
 *                                            --noter-la-veille est donc refusé.
 *   --classer <id> --cause <id> --raison "…" [--remplacer]   rattacher un « à expliquer » à une cause (CR-28 : refus
 *                                            mécanique si la cause ne couvre pas son étape, son contrôle ou son alerte).
 *   --nouvelle <id> --raison "…" [--remplacer]              le déclarer panne nouvelle.
 *   --noter --raison "…" [--ouvert-a-j0 <clé>]              une note ; ou un point de J0 laissé ouvert avec l'accord
 *                                            de Pierre (la clé imprimée par --verifier-les-causes).
 *   --noter --evenement <id> --auteur <nom> --raison "…" [--remplacer]
 *                                            P4b-1 (RC-7, décision 26 c) : la note écrite qui explique une « alerte
 *                                            au-delà de la borne » ; l'événement devient « à part » (jamais « connu »).
 * P4b-1 (RC-8) : un identifiant se cherche dans le jour qu'il porte ET les jours suivants (16 jours au plus) : un
 * événement daté de la veille vit dans le fichier du jour où il a été noté.
 *
 * CE QU'IL NE FAIT JAMAIS (consigne § 3.1, § 7 règles 2, 8, 13) : ouvrir la base ; lire l'état de l'actualisation par
 * son lecteur à renommage (refreshStatusRepository.js) ou par le lecteur à reprises d'atomicJson.js ; importer
 * env.js, sourceHealth.js, enregistreurs/etat.js ou le journal lui-même (qui importe liveWatch.js puis la base) — un
 * essai suit la fermeture de ses imports. Il lit les fichiers d'exécution EN BRUT (fs.readFileSync + JSON.parse, une
 * tentative) et n'écrit que decisions.json (journal) et mise-en-service.json (hors OneDrive), par writeJsonAtomic.
 * Ses chemins : --racine et --journal (et --runtime, --sauvegardes pour lire) ; sans eux, cheminsParDefaut, qui REFUSE
 * sous un essai, sous le dossier temporaire, et vise <bac>\recette en mode bac. P4b-1 (RC-15) : en mode bac, --racine et
 * --journal donnés hors du bac sont refusés (sauf le dossier temporaire sous un essai) ; le code sous le dossier
 * temporaire n'écrit jamais dans %USERPROFILE%\CoteMaster\recette.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeJsonAtomic } from '../src/utils/atomicJson.js';
import { cheminsDeLaRecette, cheminsParDefaut, fichiersLus } from '../src/data/recette/cheminsDeLaRecette.js';
import { RECETTE, jourDeParis, ajouterJours, estUnJour, jourZero, finDeLaRecette } from '../src/data/recette/calendrierDeLaRecette.js';
import { CAUSES_CONNUES } from '../src/data/recette/causesConnues.js';
import { modeBacASable, dossierDuBac, estDans, RACINE_BAC } from '../src/config/bacASable.js';
import {
  verifierLesCauses,
  empreinteDesTextes,
  FICHIERS_DE_L_EMPREINTE,
  verifierUneDecision,
  appliquerLesDecisions,
  ageDUnAExpliquer,
  episodes,
  decompte,
  appelsAuCoupDEnvoi,
  decisionsVides,
  COUT_NON_COMPTE
} from '../src/data/recette/classerLesEvenements.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const DOSSIER_DES_CAUSES = path.resolve(ICI, '..', 'src', 'data', 'recette');

/** Les modes, dans l'ordre de l'aide. */
export const MODES = Object.freeze(['--verifier-les-causes', '--empreinte', '--annoncer-la-mise-en-service', '--resume-du-jour', '--classer', '--nouvelle', '--noter']);

// --- Les arguments --------------------------------------------------------------------------------------------------

const AVEC_VALEUR = new Set(['--annoncer-la-mise-en-service', '--classer', '--nouvelle', '--cause', '--raison', '--jour', '--racine', '--journal', '--runtime', '--sauvegardes', '--ouvert-a-j0', '--maintenant', '--evenement', '--auteur']);

/** Lit les arguments ; { mode, options } ou { erreur }. Pur. */
export function lireLesArguments(argv) {
  const options = {};
  const modes = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) return { erreur: `argument inattendu : ${a}` };
    if (MODES.includes(a)) modes.push(a);
    if (AVEC_VALEUR.has(a)) {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && a !== '--raison')) return { erreur: `${a} attend une valeur` };
      options[a.slice(2)] = v;
      i += 1;
    } else if (MODES.includes(a) || ['--remplacer', '--noter-la-veille'].includes(a)) options[a.slice(2)] = true;
    else return { erreur: `option inconnue : ${a}` };
  }
  if (modes.length !== 1) return { erreur: modes.length ? `un seul mode à la fois (${modes.join(', ')})` : `un mode attendu : ${MODES.join(', ')}` };
  return { mode: modes[0], options };
}

/**
 * Les chemins : tous donnés (--racine ET --journal ; --runtime et --sauvegardes pour lire), ou aucun (cheminsParDefaut,
 * qui refuse sous un essai). Jamais un mélange : un chemin de Pierre ne se glisse pas dans un essai.
 */
export function lesChemins(options, { parDefaut = cheminsParDefaut, environnement = process.env, bac = undefined, ici = ICI, tmpdir = os.tmpdir(), accueil = os.homedir() } = {}) {
  const donnes = ['racine', 'journal', 'runtime', 'sauvegardes'].filter((k) => options[k] !== undefined);
  if (donnes.length) {
    if (!options.racine || !options.journal) return { ok: false, raison: '--racine et --journal vont ensemble (jamais un chemin par défaut mêlé à un chemin donné)' };
    const garde = gardeDesCheminsEcrits([options.racine, options.journal], { environnement, bac, ici, tmpdir, accueil });
    if (!garde.ok) return garde;
    const runtime = options.runtime ?? null;
    return { ok: true, chemins: cheminsDeLaRecette({ racineHorsOneDrive: options.racine, dossierRuntime: options.journal }), sources: runtime ? { runtime: path.resolve(runtime), sauvegardes: path.resolve(options.sauvegardes ?? path.join(runtime, 'sauvegardes')) } : null };
  }
  const d = parDefaut();
  return d.ok ? { ok: true, chemins: d.chemins, sources: d.sources } : { ok: false, raison: d.raison };
}

const dansOuEgal = (chemin, dossier) => path.resolve(chemin).toLowerCase() === path.resolve(dossier).toLowerCase() || estDans(chemin, dossier);

/**
 * P4b-1 (RC-15) : où ce script peut ÉCRIRE quand les chemins sont donnés. Mode bac : dans le bac seulement (le dossier
 * temporaire en plus, sous un essai). Code sous le dossier temporaire (copie des poses) : jamais chez Pierre
 * (%USERPROFILE%\CoteMaster\recette). Rend { ok } ou { ok: false, raison }. Pur (tout est passé).
 */
export function gardeDesCheminsEcrits(chemins, { environnement = process.env, bac = undefined, ici = ICI, tmpdir = os.tmpdir(), accueil = os.homedir() } = {}) {
  const ecrits = chemins.map((p) => path.resolve(p));
  // Le dossier de Pierre, construit par cheminsParDefaut seule (T-J14 : aucun autre endroit ne le construit).
  const chezPierre = cheminsParDefaut({ environnement: {}, ici: accueil, tmpdir, bac: null, accueil }).chemins?.racine ?? null;
  if (chezPierre && dansOuEgal(ici, tmpdir)) {
    const p = ecrits.find((x) => dansOuEgal(x, chezPierre));
    if (p) return { ok: false, raison: `code sous le dossier temporaire : jamais d'écriture dans ${chezPierre} (${p})` };
  }
  const dossierBac = bac === undefined ? (modeBacASable(environnement) ? dossierDuBac() ?? RACINE_BAC : null) : bac;
  if (dossierBac) {
    const sousEssai = Boolean(environnement.NODE_TEST_CONTEXT || environnement.CM_TEST_DOSSIER);
    const hors = ecrits.find((x) => !dansOuEgal(x, dossierBac) && !(sousEssai && dansOuEgal(x, tmpdir)));
    if (hors) return { ok: false, raison: `mode bac : ${hors} est hors du bac (${dossierBac}) : rien n'est écrit` };
  }
  return { ok: true };
}

// --- Les lecteurs PROPRES (une tentative ; jamais de cache ; jamais le lecteur à renommage) --------------------------

/** { etat: 'lu' | 'absent' | 'illisible', valeur, probleme }. Ne lève jamais. */
export function lireBrut(fichier) {
  try {
    const v = JSON.parse(fs.readFileSync(fichier, 'utf8'));
    if (!v || typeof v !== 'object') return { etat: 'illisible', valeur: null, probleme: 'forme inattendue (pas un objet)' };
    return { etat: 'lu', valeur: v };
  } catch (e) {
    return e?.code === 'ENOENT' ? { etat: 'absent', valeur: null } : { etat: 'illisible', valeur: null, probleme: String(e?.message ?? e).slice(0, 200) };
  }
}

/** L'empreinte des causes lue dans un dossier (les trois fichiers, normalisés). null si un manque. */
export function empreinteDuDossier(dossier = DOSSIER_DES_CAUSES) {
  try {
    const textes = Object.fromEntries(FICHIERS_DE_L_EMPREINTE.map((nom) => [nom, fs.readFileSync(path.join(dossier, nom), 'utf8')]));
    return empreinteDesTextes(textes);
  } catch {
    return null;
  }
}

/** decisions.json : absent → vide ; illisible → REFUS (on ne réécrit jamais un fichier qu'on n'a pas su lire). */
function lireLesDecisions(chemins) {
  const lu = lireBrut(chemins.decisions);
  if (lu.etat === 'absent') return { ok: true, valeur: decisionsVides() };
  if (lu.etat !== 'lu' || !Array.isArray(lu.valeur.decisions)) return { ok: false, raison: `decisions.json illisible (${lu.probleme ?? 'forme inattendue'}) : rien n'est écrit` };
  return { ok: true, valeur: lu.valeur };
}

/** Les événements d'un ou plusieurs jours, en Map id → événement. */
function evenementsDesJours(chemins, jours) {
  const m = new Map();
  for (const j of jours) {
    if (!estUnJour(j)) continue;
    const lu = lireBrut(chemins.fichierDuJour(j));
    for (const ev of lu.valeur?.evenements ?? []) if (ev?.id) m.set(ev.id, ev);
  }
  return m;
}

// --- Les modes ------------------------------------------------------------------------------------------------------

function modeEmpreinte({ ecrire }) {
  const e = empreinteDuDossier();
  ecrire(e ? `Empreinte des causes (${FICHIERS_DE_L_EMPREINTE.join(' + ')}, normalisés) : ${e}` : 'Empreinte illisible : un des trois fichiers manque.');
  return e ? 0 : 2;
}

function modeVerifier({ sources, chemins, maintenant, ecrire }) {
  if (!sources) {
    ecrire('REFUS : --runtime manquant (avec des chemins donnés, il faut dire où lire).');
    return 2;
  }
  const lus = fichiersLus(sources);
  const refresh = lireBrut(lus.refresh);
  const controle = lireBrut(lus.controle);
  const sante = lireBrut(lus.sante);
  for (const [nom, r] of [['refresh-status.json', refresh], ['controle-quotidien.json', controle]]) {
    if (r.etat !== 'lu') {
      ecrire(`ÉCHEC : ${nom} ${r.etat}${r.probleme ? ` (${r.probleme})` : ''} — la vérification échoue fermée.`);
      return 2;
    }
  }
  if (sante.etat === 'illisible') {
    ecrire(`ÉCHEC : sante-fotmob.json illisible (${sante.probleme}) — la vérification échoue fermée.`);
    return 2;
  }
  const d = lireLesDecisions(chemins);
  if (!d.ok) {
    ecrire(`ÉCHEC : ${d.raison}`);
    return 2;
  }
  const ouverts = d.valeur.decisions.filter((x) => x?.sorte === 'ouvert-a-j0').map((x) => x.cle);
  const r = verifierLesCauses({ refresh: refresh.valeur, controle: controle.valeur, sante: sante.valeur, maintenant, ouverts });
  ecrire(`Liste des causes : ${CAUSES_CONNUES.length} causes ; empreinte ${empreinteDuDossier() ?? 'illisible'}.`);
  ecrire(`Points non verts : ${r.points} — reconnus d'office ${r.office.length}, rattachables à la main ${r.aLaMain.length}, laissés ouverts avec l'accord de Pierre ${r.ouverts.length}, TROUS ${r.trous.length}.`);
  for (const x of r.aLaMain) ecrire(`  à la main  ${x.cle}  → ${x.causes.join(', ')}`);
  for (const x of r.ouverts) ecrire(`  ouvert     ${x.cle}`);
  for (const x of r.trous) ecrire(`  TROU       ${x.cle}  ${x.texte.slice(0, 120)}${x.raison ? `  (${x.raison})` : ''}`);
  ecrire(`Niveaux de J0 (à écrire au lot 1b dans causesConnues.js, bornes = niveau × 1,5 + 5) : ${JSON.stringify(r.niveaux)}`);
  ecrire(`Championnats des chiffres non publiés à J0 : ${r.championnats.length ? r.championnats.join(' ; ') : 'aucun'}`);
  ecrire(r.code === 0 ? 'Rien d’inexpliqué au départ.' : 'Des points non verts n’ont aucune cause : à couvrir, ou à laisser ouverts avec l’accord de Pierre (--noter --ouvert-a-j0 <clé>).');
  return r.code;
}

function modeAnnoncer({ chemins, options, maintenant, ecrire }) {
  const quoi = String(options['annoncer-la-mise-en-service'] ?? '').trim();
  if (quoi.length < 3) {
    ecrire('REFUS : dites ce qui est mis en service (une phrase).');
    return 1;
  }
  writeJsonAtomic(chemins.miseEnService, { version: 1, le: new Date(maintenant).toISOString(), quoi: quoi.slice(0, 200) });
  ecrire(`Annonce écrite (${chemins.miseEnService}), valable 60 min : « ${quoi.slice(0, 200)} ».`);
  return 0;
}

function ajouterUneDecision({ chemins, decision, jours, ecrire }) {
  const d = lireLesDecisions(chemins);
  if (!d.ok) {
    ecrire(`REFUS : ${d.raison}`);
    return 2;
  }
  const evenements = evenementsDesJours(chemins, jours);
  const v = verifierUneDecision({ decision, evenements, decisions: d.valeur.decisions });
  if (!v.ok) {
    ecrire(`REFUS : ${v.raison}`);
    return 1;
  }
  const suivante = { numero: d.valeur.decisions.length + 1, ...decision };
  writeJsonAtomic(chemins.decisions, { ...d.valeur, version: 1, decisions: [...d.valeur.decisions, suivante] });
  ecrire(`Décision n° ${suivante.numero} notée (${decision.sorte}${decision.evenement ? ` ${decision.evenement}` : ''}${decision.cause ? ` → ${decision.cause}` : ''}).`);
  return 0;
}

const jourDeLId = (id) => String(id ?? '').slice(0, 10);

/** RC-8 : au plus 16 jours lus pour retrouver un identifiant (le jour qu'il porte, puis les suivants). */
export const JOURS_DE_RECHERCHE = 16;

/**
 * P4b-1 (RC-8) : les jours où chercher un identifiant : le jour qu'il porte, puis les jours suivants jusqu'à aujourd'hui
 * (jour de Paris), 16 au plus. Un arrêt à 23 h 58 noté au tour de 0 h 02 vit dans le fichier du lendemain. Pur.
 */
export function joursOuChercher(id, maintenant) {
  const premier = jourDeLId(id);
  if (!estUnJour(premier)) return [];
  const aujourdhui = jourDeParis(maintenant);
  const jours = [premier];
  while (jours.length < JOURS_DE_RECHERCHE && estUnJour(aujourdhui) && jours.at(-1) < aujourdhui) jours.push(ajouterJours(jours.at(-1), 1));
  return jours;
}

function modeClasserOuNouvelle({ chemins, options, maintenant, ecrire, sorte }) {
  const id = sorte === 'rattachement' ? options.classer : options.nouvelle;
  const decision = { sorte, le: new Date(maintenant).toISOString(), evenement: id, raison: options.raison ?? '', ...(sorte === 'rattachement' ? { cause: options.cause ?? null } : {}), ...(options.remplacer ? { remplacer: true } : {}) };
  return ajouterUneDecision({ chemins, decision, jours: joursOuChercher(id, maintenant), ecrire });
}

function modeNoter({ chemins, options, maintenant, ecrire }) {
  const le = new Date(maintenant).toISOString();
  if (options['ouvert-a-j0']) return ajouterUneDecision({ chemins, decision: { sorte: 'ouvert-a-j0', le, cle: options['ouvert-a-j0'], raison: options.raison ?? '' }, jours: [], ecrire });
  if (options.evenement !== undefined) {
    // RC-7 (décision 26 c) : la note qui explique un dépassement de borne ; vérifiée par verifierUneDecision (existe, type,
    // « à expliquer », auteur, pas de doublon sans --remplacer).
    const decision = { sorte: 'note', le, evenement: options.evenement, auteur: options.auteur ?? '', raison: options.raison ?? '', ...(options.remplacer ? { remplacer: true } : {}) };
    return ajouterUneDecision({ chemins, decision, jours: joursOuChercher(options.evenement, maintenant), ecrire });
  }
  return ajouterUneDecision({ chemins, decision: { sorte: 'note', le, raison: options.raison ?? '' }, jours: [], ecrire });
}

/** Le titre d'une cause (les mots de Pierre), sinon son identifiant. */
const titreDeLaCause = (id) => CAUSES_CONNUES.find((c) => c.id === id)?.titre ?? id;

function modeResume({ chemins, sources, options, maintenant, ecrire, recette }) {
  const jour = options.jour ?? ajouterJours(jourDeParis(maintenant), -1);
  if (!estUnJour(jour)) {
    ecrire(`REFUS : jour invalide (${jour}).`);
    return 1;
  }
  // P4b-1 (décision 25 a) : le coût de la veille n'est jamais compté hors du serveur (aucune heure de coup d'envoi sans la
  // base) : il n'y a rien à noter.
  if (options['noter-la-veille']) {
    ecrire(`REFUS : --noter-la-veille : le coût de la veille est ${COUT_NON_COMPTE} ; rien n'est noté.`);
    return 1;
  }
  const lu = lireBrut(chemins.fichierDuJour(jour));
  const battement = lireBrut(chemins.battement);
  const d = lireLesDecisions(chemins);
  const decisions = d.ok ? d.valeur.decisions : [];
  ecrire(`Résumé du ${jour} (jour de Paris).`);
  // Le contrôle de vie (CR-3, CR-55) : le journal tourne-t-il ?
  const b = battement.valeur;
  const age = b?.dernierTour ? Math.round((maintenant - Date.parse(b.dernierTour)) / 60_000) : null;
  ecrire(b ? `Journal : dernier tour il y a ${age ?? '?'} min (pid ${b.pid})${age !== null && age > 25 ? ' — LE JOURNAL NE TOURNE PAS (plus de 25 min)' : ''}${b.derniereErreur ? ` ; dernière erreur : ${b.derniereErreur.quoi} — ${b.derniereErreur.message}` : ''}.` : `Journal : aucun battement (${battement.etat}).`);
  if (!d.ok) ecrire(`ATTENTION : ${d.raison}`);
  const r = lu.etat === 'lu' ? lu.valeur : null;
  // P4b-1 (RC-26) : un fichier du jour illisible est « à expliquer » ; un fichier absent, un jour non observé. Le résumé
  // va quand même jusqu'au décompte et à « Non surveillé ».
  if (lu.etat === 'illisible') ecrire(`Fichier du jour illisible (${lu.probleme ?? 'forme inattendue'}) : à expliquer (jamais « tenu »).`);
  else if (!r) ecrire(`Aucun fichier du jour (${lu.etat}) : jour NON OBSERVÉ (jamais « tenu »).`);
  if (r) {
    const cv = r.couverture ?? {};
    ecrire(`Phase : ${r.phase ?? '?'} ; couverture : observé ${cv.minutesObservees ?? 0} min, veille ${cv.minutesDeVeille ?? 0} min, arrêt ${cv.minutesArret ?? 0} min, en erreur ${cv.minutesEnErreur ?? 0} min, non observé ${cv.minutesNonObservees ?? '?'} min ; tours ${cv.toursReussis ?? 0}/${cv.tours ?? 0}.`);
    ecrire(`Passes : ${r.passes?.total ?? 0} (ok ${r.passes?.ok ?? 0}, partielles ${r.passes?.partielles ?? 0}, en échec ${r.passes?.enEchec ?? 0}) ; rattrapages ${(r.passes?.rattrapages ?? []).length}.`);
    const evs = appliquerLesDecisions((r.evenements ?? []).filter((e) => e && e.classe !== 'info'), decisions);
    const parClasse = (c) => evs.filter((e) => e.classeFinale === c);
    ecrire(`Événements : ${evs.length} — connus ${parClasse('connue').length}, nouveaux ${parClasse('nouvelle').length}, à expliquer ${parClasse('a-expliquer').length}${parClasse('a-part').length ? `, à part (expliqués par une note) ${parClasse('a-part').length}` : ''}.`);
    for (const e of parClasse('a-expliquer')) ecrire(`  À EXPLIQUER  ${e.id}  ${String(e.texte ?? '').slice(0, 140)}  — ${ageDUnAExpliquer(e, maintenant)?.texte ?? ''}`);
    for (const e of parClasse('nouvelle')) ecrire(`  NOUVELLE     ${e.id}  ${String(e.texte ?? '').slice(0, 140)}${e.rechute ? ' (rechute : la correction n’a pas tenu)' : ''}`);
    for (const e of parClasse('a-part')) ecrire(`  À PART       ${e.id}  ${String(e.texte ?? '').slice(0, 140)}  — note de ${e.decision?.auteur ?? '?'}`);
    // Les appels au coup d'envoi (CR-20 point 4) : leur nombre seul. Le nombre de matchs du jour demanderait le calendrier
    // de saison, que ce script ne lit plus (décision 25 a).
    if (sources) {
      const ia = lireBrut(fichiersLus(sources).ia(jour));
      const appels = Array.isArray(ia.valeur?.appels) ? ia.valeur.appels : [];
      const ac = appelsAuCoupDEnvoi({ matchsDuJour: 0, appels });
      ecrire(ia.etat === 'lu' ? `Appels au coup d’envoi : ${ac.texte} (matchs du jour non comptés ici)` : `Appels au coup d’envoi : non comptés (journal des appels Claude ${ia.etat}).`);
    } else ecrire('Appels au coup d’envoi : non comptés (--runtime manquant).');
    const ep = episodes(evs);
    if (ep.connues.length) ecrire(`Épisodes connus du jour : ${ep.connues.map((e) => `${titreDeLaCause(e.cause)} (${e.evenements}${e.rattachees.length ? `, dont ${e.rattachees.length} rattaché(s) à la main` : ''})`).join(' ; ')}.`);
  }
  // Le décompte, si J0 est écrit.
  if (jourZero(recette)) {
    const fin = finDeLaRecette(recette);
    const jours = [];
    for (let j = ajouterJours(jourZero(recette), 1); j <= fin; j = ajouterJours(j, 1)) {
      const x = lireBrut(chemins.fichierDuJour(j));
      if (x.etat === 'lu') jours.push(x.valeur);
    }
    const dc = decompte({ jours, decisions, recette, aujourdhui: jourDeParis(maintenant) });
    ecrire(`Décompte : ${dc.phrase}`);
  } else ecrire('Décompte : la recette n’a pas commencé (J0 non écrit).');
  // « Non surveillé » porte le coût de la veille : il n'est écrit qu'une fois.
  const nonSurveille = typeof r?.nonSurveille === 'string' && r.nonSurveille.trim() ? r.nonSurveille : null;
  ecrire(nonSurveille ?? `Non surveillé par l'essai : la boucle des compositions, la boucle des cotes gratuites, et le détail de l'analyse au coup d'envoi. Coût de la veille (matchs commencés pendant que le PC dormait) : ${COUT_NON_COMPTE}.`);
  return 0;
}

// --- Le lanceur ---------------------------------------------------------------------------------------------------

/** Lance un mode ; rend le code de sortie. Tout est injectable pour les essais (jamais de chemin par défaut sous essai). */
export function lancer(argv, { ecrire = (l) => console.log(l), maintenant = Date.now(), parDefaut = cheminsParDefaut, recette = RECETTE, bac = undefined, environnement = process.env, ici = ICI, tmpdir = os.tmpdir(), accueil = os.homedir() } = {}) {
  const a = lireLesArguments(argv);
  if (a.erreur) {
    ecrire(`REFUS : ${a.erreur}`);
    return 1;
  }
  const t = a.options.maintenant ? Date.parse(a.options.maintenant) : maintenant;
  if (!Number.isFinite(t)) {
    ecrire('REFUS : --maintenant illisible');
    return 1;
  }
  if (a.mode === '--empreinte') return modeEmpreinte({ ecrire });
  const c = lesChemins(a.options, { parDefaut, bac, environnement, ici, tmpdir, accueil });
  if (!c.ok) {
    ecrire(`REFUS : ${c.raison}`);
    return 2;
  }
  const ctx = { chemins: c.chemins, sources: c.sources, options: a.options, maintenant: t, ecrire, recette };
  switch (a.mode) {
    case '--verifier-les-causes':
      return modeVerifier(ctx);
    case '--annoncer-la-mise-en-service':
      return modeAnnoncer(ctx);
    case '--resume-du-jour':
      return modeResume(ctx);
    case '--classer':
      return modeClasserOuNouvelle({ ...ctx, sorte: 'rattachement' });
    case '--nouvelle':
      return modeClasserOuNouvelle({ ...ctx, sorte: 'nouvelle' });
    case '--noter':
      return modeNoter(ctx);
    default:
      ecrire(`REFUS : mode non écrit (${a.mode})`);
      return 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  let code;
  try {
    code = lancer(process.argv.slice(2));
  } catch (e) {
    console.error(`ÉCHEC : ${e?.message ?? e}`);
    code = 2;
  }
  process.exitCode = code;
}
