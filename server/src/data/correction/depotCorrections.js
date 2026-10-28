/**
 * depotCorrections.js — LE SEUL ÉCRIVAIN des tables de la boucle de correction (étape 26 du plan, 27/10/2026).
 * -----------------------------------------------------------------------
 * Les tables (DDL dans data/db/matchStatsDb.js, CORRECTION_DDL) :
 *   correction_tri             le tri figé de chaque mois, par forme du tri (clé mois + version) : jamais réécrit,
 *                              jamais effacé (la base refuse) ; une forme corrigée s'AJOUTE, la lecture prend la
 *                              plus haute ;
 *   correction_propositions    les propositions et leur état (le serveur seul les fait avancer) ; leur contenu
 *                              (réglage, valeurs, déclaration) ne change jamais, aucune ne s'efface ;
 *   correction_journal         le journal, ajout seulement (la base refuse modification et effacement) ;
 *   correction_resumes         le résumé du mois en mots (partie D), par mois et forme du tri : jamais réécrit ;
 *   correction_resumes_essais  les essais ratés d'un résumé : ajout seulement.
 * Garanties : chaque changement d'état d'une proposition et son entrée de journal dans UNE transaction (jamais l'un
 * sans l'autre) ; une transition non permise (regles.js, TRANSITIONS) ou un état qui a changé depuis l'écran
 * (`vue`) ne change rien ; la phrase du journal est figée au moment de l'événement. Le SERVEUR seul appelle les
 * écritures (passe d'actualisation, routes) ; un test ne les appelle que dans une copie isolée (script).
 * Une table illisible lève : jamais une liste vide à la place. Une table absente (base ouverte en lecture seule,
 * d'avant l'étape 26) : rien d'écrit encore.
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { transitionPermise, ETATS_DE_PROPOSITION, EVENEMENTS, EVENEMENTS_SANS_ETAT, SOURCES_DU_JOURNAL, SOURCES_DE_PROPOSITION } from './regles.js';

/** Une écriture refusée : `raison` (inconnue, deja-change, transition, invalide…) et un statut HTTP ; rien n'a été écrit. */
export class CorrectionRefusee extends Error {
  constructor(raison, message, statut = 409) {
    super(message);
    this.raison = raison;
    this.statut = statut;
  }
}

const iso = (t) => new Date(t).toISOString();
const texte = (v) => typeof v === 'string' && v.trim() !== '';
const json = (v) => JSON.stringify(v ?? null);
const lire = (t) => {
  if (t === null || t === undefined) return null;
  return JSON.parse(t);
};

/** La table existe-t-elle ? (une base ouverte en lecture seule, d'avant l'étape 26, ne l'a pas). */
function tableExiste(database, nom) {
  return Boolean(database.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?").get(nom));
}

/** Une transaction d'écriture (BEGIN IMMEDIATE) ; ROLLBACK et l'erreur remontée à la première panne. */
function enTransaction(database, travail) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const r = travail();
    database.exec('COMMIT');
    return r;
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // déjà annulée
    }
    throw error;
  }
}

// ============================================================ le tri figé

/**
 * RANGE le tri d'un mois (trierLeMois) : UNE ligne par mois et par forme du tri, jamais réécrite (INSERT … ON
 * CONFLICT DO NOTHING ; la base refuse d'ailleurs UPDATE et DELETE) et son entrée « tri » au journal, dans la même
 * transaction. Un mois déjà trié sous cette forme garde son tri d'origine. Rend { ecrit, tri } — celui qui fait foi.
 */
export function ecrireLeTri(tri, { database = openDb(), phrase = null, maintenant = Date.now() } = {}) {
  if (!tri || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(tri.mois)) || !Number.isInteger(tri.version)) throw new CorrectionRefusee('invalide', 'Tri sans mois ou sans forme : rien n’est rangé.', 400);
  const ecrit = enTransaction(database, () => {
    const r = database
      .prepare(
        `INSERT INTO correction_tri (mois, version, calcule_le, lignee, regards, resume, cases, regimes, sommes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(mois, version) DO NOTHING`
      )
      .run(tri.mois, tri.version, tri.calculeLe, json(tri.lignee), tri.regards, json(tri.resume), json(tri.cases), json(tri.regimes), json(tri.sommes));
    const nouveau = Number(r.changes) === 1;
    if (nouveau) {
      ajouterAuJournalSansTransaction(database, {
        proposition: null,
        evenement: 'tri',
        source: 'nuit',
        phrase: texte(phrase) ? phrase : `Tri de ${tri.mois} figé.`,
        details: { mois: tri.mois, version: tri.version, versionEnService: tri.lignee?.versionEnService ?? null, statuts: tri.resume?.statuts ?? null, vraisDefauts: tri.resume?.vraisDefauts ?? [] }
      }, maintenant);
    }
    return nouveau;
  });
  return { ecrit, tri: ecrit ? tri : lireLeTri(tri.mois, { database, version: tri.version, avecSommes: true }) };
}

/**
 * Le tri figé d'un mois — la forme la plus haute, ou celle demandée (`version`) — tel qu'il a été rangé, ou null.
 * `avecSommes` : les sommes par match (lourdes : la fenêtre du tri seulement).
 */
export function lireLeTri(mois, { database = openDb(), version = null, avecSommes = false } = {}) {
  if (!tableExiste(database, 'correction_tri')) return null;
  const colonnes = `mois, version, calcule_le AS calculeLe, lignee, regards, resume, cases, regimes${avecSommes ? ', sommes' : ''}`;
  const r = Number.isInteger(version)
    ? database.prepare(`SELECT ${colonnes} FROM correction_tri WHERE mois = ? AND version = ?`).get(mois, version)
    : database.prepare(`SELECT ${colonnes} FROM correction_tri WHERE mois = ? ORDER BY version DESC LIMIT 1`).get(mois);
  if (!r) return null;
  return {
    mois: r.mois,
    version: r.version,
    calculeLe: r.calculeLe,
    lignee: lire(r.lignee),
    regards: r.regards,
    resume: lire(r.resume),
    cases: lire(r.cases),
    regimes: lire(r.regimes),
    ...(avecSommes ? { sommes: lire(r.sommes) } : {})
  };
}

/** Les tris figés, du plus récent au plus ancien (toutes les formes) : { mois, version, calculeLe, resume }. */
export function listeDesTris({ database = openDb() } = {}) {
  if (!tableExiste(database, 'correction_tri')) return [];
  return database
    .prepare('SELECT mois, version, calcule_le AS calculeLe, resume FROM correction_tri ORDER BY mois DESC, version DESC')
    .all()
    .map((r) => ({ mois: r.mois, version: r.version, calculeLe: r.calculeLe, resume: lire(r.resume) }));
}

// ============================================================ le journal

function controlerEntree({ proposition = null, evenement, source, phrase, details = {} }) {
  if (!EVENEMENTS.includes(evenement)) throw new CorrectionRefusee('invalide', `Événement inconnu du journal : « ${String(evenement)} ».`, 400);
  if (!SOURCES_DU_JOURNAL.includes(source)) throw new CorrectionRefusee('invalide', `Source inconnue du journal : « ${String(source)} ».`, 400);
  if (!texte(phrase)) throw new CorrectionRefusee('invalide', 'Une entrée du journal dit toujours sa phrase pour Pierre.', 400);
  if (proposition !== null && !texte(proposition)) throw new CorrectionRefusee('invalide', 'Proposition illisible.', 400);
  return { proposition, evenement, source, phrase: phrase.trim(), details: details ?? {} };
}

function ajouterAuJournalSansTransaction(database, entree, maintenant) {
  const e = controlerEntree(entree);
  const r = database
    .prepare('INSERT INTO correction_journal (le, proposition, evenement, source, phrase, details) VALUES (?, ?, ?, ?, ?, ?)')
    .run(iso(maintenant), e.proposition, e.evenement, e.source, e.phrase, json(e.details));
  return Number(r.lastInsertRowid);
}

/**
 * AJOUTE une entrée au journal (un événement qui ne change l'état d'aucune proposition : demande du code, place
 * libérée, essai recommencé, résumé écrit…). Les changements d'état passent par changerLEtat. Rend son numéro.
 */
export function ajouterAuJournal(entree, { database = openDb(), maintenant = Date.now() } = {}) {
  if (!EVENEMENTS_SANS_ETAT.includes(entree?.evenement)) throw new CorrectionRefusee('invalide', `« ${String(entree?.evenement)} » change l’état d’une proposition : il passe par changerLEtat.`, 400);
  return enTransaction(database, () => ajouterAuJournalSansTransaction(database, entree, maintenant));
}

/**
 * Une page du journal, de la plus récente à la plus ancienne : les entrées de numéro < `avant` (toutes sans lui), au
 * plus `limite` (≤ 200) ; `proposition` / `evenement` (partie B) : celles d'une proposition, ou d'un événement.
 */
export function lireLeJournal({ database = openDb(), avant = null, limite = 50, proposition = null, evenement = null } = {}) {
  if (!tableExiste(database, 'correction_journal')) return [];
  const n = Math.max(1, Math.min(200, Number.isInteger(limite) ? limite : 50));
  const conditions = [];
  const valeurs = [];
  if (Number.isInteger(avant)) {
    conditions.push('n < ?');
    valeurs.push(avant);
  }
  if (texte(proposition)) {
    conditions.push('proposition = ?');
    valeurs.push(proposition);
  }
  if (texte(evenement)) {
    conditions.push('evenement = ?');
    valeurs.push(evenement);
  }
  const ou = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return database
    .prepare(`SELECT n, le, proposition, evenement, source, phrase, details FROM correction_journal ${ou} ORDER BY n DESC LIMIT ?`)
    .all(...valeurs, n)
    .map((r) => ({ n: r.n, le: r.le, proposition: r.proposition, evenement: r.evenement, source: r.source, phrase: r.phrase, details: lire(r.details) }));
}

// ============================================================ les propositions

const COLONNES_PROPOSITION = `id, cree_le AS creeLe, source, etat, etat_le AS etatLe, levier, avant, apres, marches, declaration, base, tri_mois AS triMois,
  tri_version AS triVersion, cas, cible, banc, essai, version_adoptee AS versionAdoptee, rang_file AS rangFile, maj_le AS majLe`;

function enProposition(r) {
  if (!r) return null;
  return {
    id: r.id,
    creeLe: r.creeLe,
    source: r.source,
    etat: r.etat,
    etatLe: r.etatLe,
    levier: r.levier,
    avant: lire(r.avant),
    apres: lire(r.apres),
    marches: lire(r.marches),
    declaration: lire(r.declaration),
    base: r.base,
    triMois: r.triMois,
    triVersion: r.triVersion,
    cas: lire(r.cas),
    cible: r.cible,
    banc: lire(r.banc),
    essai: lire(r.essai),
    versionAdoptee: r.versionAdoptee,
    rangFile: r.rangFile,
    majLe: r.majLe
  };
}

/** Une proposition, ou null. */
export function lireUneProposition(id, { database = openDb() } = {}) {
  if (!tableExiste(database, 'correction_propositions')) return null;
  return enProposition(database.prepare(`SELECT ${COLONNES_PROPOSITION} FROM correction_propositions WHERE id = ?`).get(id));
}

/** Les propositions (toutes, ou celles des `etats` donnés), de la plus ancienne à la plus récente. */
export function lireLesPropositions({ database = openDb(), etats = null } = {}) {
  if (!tableExiste(database, 'correction_propositions')) return [];
  const liste = Array.isArray(etats) && etats.length ? etats : null;
  const sql = `SELECT ${COLONNES_PROPOSITION} FROM correction_propositions ${liste ? `WHERE etat IN (${liste.map(() => '?').join(', ')})` : ''} ORDER BY cree_le, id`;
  return database.prepare(sql).all(...(liste ?? [])).map(enProposition);
}

/**
 * CRÉE une proposition (état « proposee ») et son entrée « proposee » au journal, dans UNE transaction. `p` :
 * { id, source, levier, avant, apres, marches, declaration, base, triMois?, triVersion?, cas?, cible? } — la
 * déclaration est construite par propositions.js (partie B) sur une COPIE PROFONDE des réglages. Un identifiant
 * déjà pris : refusé, rien d'écrit. Rend la proposition.
 */
export function creerUneProposition(p, { database = openDb(), phrase, maintenant = Date.now(), sourceDuJournal = null } = {}) {
  if (!p || !/^[a-z0-9][a-z0-9._-]{1,60}$/i.test(String(p.id))) throw new CorrectionRefusee('invalide', 'Une proposition a un identifiant court (lettres, chiffres, « - », « . », « _ »).', 400);
  if (!SOURCES_DE_PROPOSITION.includes(p.source)) throw new CorrectionRefusee('invalide', `Source de proposition inconnue : « ${String(p.source)} ».`, 400);
  if (!texte(p.levier) || !texte(p.base) || p.declaration === null || typeof p.declaration !== 'object') throw new CorrectionRefusee('invalide', 'Une proposition dit son réglage, sa déclaration et la version d’où elle part.', 400);
  const le = iso(maintenant);
  return enTransaction(database, () => {
    if (database.prepare('SELECT 1 AS x FROM correction_propositions WHERE id = ?').get(p.id)) throw new CorrectionRefusee('deja-prise', `La proposition « ${p.id} » existe déjà : rien n’est créé.`);
    database
      .prepare(
        `INSERT INTO correction_propositions (id, cree_le, source, etat, etat_le, levier, avant, apres, marches, declaration, base, tri_mois, tri_version, cas, cible, banc, essai, version_adoptee, rang_file, maj_le)
         VALUES (?, ?, ?, 'proposee', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?)`
      )
      .run(p.id, le, p.source, le, p.levier, json(p.avant), json(p.apres), json(p.marches ?? []), json(p.declaration), p.base, p.triMois ?? null, Number.isInteger(p.triVersion) ? p.triVersion : null, p.cas === undefined ? null : json(p.cas), p.cible ?? null, le);
    ajouterAuJournalSansTransaction(database, { proposition: p.id, evenement: 'proposee', source: sourceDuJournal ?? (p.source === 'pierre' ? 'pierre' : 'regle'), phrase, details: { levier: p.levier, avant: p.avant ?? null, apres: p.apres ?? null, marches: p.marches ?? [], triMois: p.triMois ?? null } }, maintenant);
    return lireUneProposition(p.id, { database });
  });
}

/** Les champs qu'un changement d'état peut poser en même temps (le reste d'une proposition ne change jamais). */
const CHAMPS_MODIFIABLES = Object.freeze({ banc: 'banc', essai: 'essai', versionAdoptee: 'version_adoptee', rangFile: 'rang_file' });

/**
 * FAIT AVANCER une proposition : `evenement` (une transition de regles.js) depuis son état courant, l'entrée du
 * journal (phrase figée, détails) et les champs `maj` ({ banc, essai, versionAdoptee, rangFile }) — dans UNE
 * transaction. `vue` (facultatif) : l'état que l'écran ou l'appelant croit courant ; s'il a changé, rien n'est
 * écrit (« déjà changé : relisez »). Lève CorrectionRefusee (inconnue 404, deja-change 409, transition 409,
 * invalide 400). Rend la proposition après le changement.
 */
export function changerLEtat({ id, evenement, vue = null, source, phrase, details = {}, maj = {} }, { database = openDb(), maintenant = Date.now() } = {}) {
  if (EVENEMENTS_SANS_ETAT.includes(evenement) || !EVENEMENTS.includes(evenement)) throw new CorrectionRefusee('invalide', `« ${String(evenement)} » n’est pas un changement d’état.`, 400);
  if (vue !== null && !ETATS_DE_PROPOSITION.includes(vue)) throw new CorrectionRefusee('invalide', `État vu inconnu : « ${String(vue)} ».`, 400);
  const inconnus = Object.keys(maj ?? {}).filter((k) => !(k in CHAMPS_MODIFIABLES));
  if (inconnus.length) throw new CorrectionRefusee('invalide', `Champs non modifiables d’une proposition : ${inconnus.join(', ')}.`, 400);
  const le = iso(maintenant);
  return enTransaction(database, () => {
    const actuelle = database.prepare('SELECT etat FROM correction_propositions WHERE id = ?').get(id);
    if (!actuelle) throw new CorrectionRefusee('inconnue', `Aucune proposition « ${String(id)} ».`, 404);
    if (vue !== null && actuelle.etat !== vue) throw new CorrectionRefusee('deja-change', `La proposition « ${id} » n’est plus « ${vue} » mais « ${actuelle.etat} » : rien n’a changé. Relisez.`);
    const vers = transitionPermise(actuelle.etat, evenement);
    if (!vers) throw new CorrectionRefusee('transition', `« ${evenement} » n’est pas permis depuis l’état « ${actuelle.etat} » : rien n’a changé.`);
    const champs = ['etat = ?', 'etat_le = ?', 'maj_le = ?'];
    const valeurs = [vers, le, le];
    for (const [k, colonne] of Object.entries(CHAMPS_MODIFIABLES)) {
      if (!(k in (maj ?? {}))) continue;
      champs.push(`${colonne} = ?`);
      valeurs.push(k === 'banc' || k === 'essai' ? json(maj[k]) : maj[k] === null || maj[k] === undefined ? null : maj[k]);
    }
    const r = database.prepare(`UPDATE correction_propositions SET ${champs.join(', ')} WHERE id = ? AND etat = ?`).run(...valeurs, id, actuelle.etat);
    if (Number(r.changes) !== 1) throw new CorrectionRefusee('deja-change', `La proposition « ${id} » a changé pendant l’écriture : rien n’a changé.`);
    ajouterAuJournalSansTransaction(database, { proposition: id, evenement, source, phrase, details: { de: actuelle.etat, vers, ...(details ?? {}) } }, maintenant);
    return lireUneProposition(id, { database });
  });
}

// ============================================================ le résumé du mois en mots (partie D)

/**
 * RANGE le résumé d'un mois (une forme du tri) : jamais réécrit (INSERT … DO NOTHING ; la base refuse UPDATE et
 * DELETE). `phrase` (partie D) : l'entrée « résumé du mois écrit » du journal, ajoutée dans la MÊME transaction et
 * seulement si le résumé est nouveau (jamais l'un sans l'autre). Rend { ecrit }.
 */
export function ecrireUnResume(resume, { database = openDb(), maintenant = Date.now(), phrase = null } = {}) {
  if (!resume || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(resume.mois)) || !Number.isInteger(resume.version)) throw new CorrectionRefusee('invalide', 'Résumé sans mois ou sans forme du tri : rien n’est rangé.', 400);
  const ecrit = enTransaction(database, () => {
    const r = database
      .prepare(
        `INSERT INTO correction_resumes (mois, version, ecrit_le, modele, mode, texte, fiche, garde, usage, cout_usd, essai, sans_appel, raison) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(mois, version) DO NOTHING`
      )
      .run(resume.mois, resume.version, iso(maintenant), resume.modele ?? null, resume.mode ?? null, resume.texte === undefined ? null : json(resume.texte), json(resume.fiche ?? null), resume.garde === undefined ? null : json(resume.garde), resume.usage === undefined ? null : json(resume.usage), Number.isFinite(resume.coutUsd) ? resume.coutUsd : null, Number.isInteger(resume.essai) ? resume.essai : 1, resume.sansAppel ? 1 : 0, resume.raison ?? null);
    const nouveau = Number(r.changes) === 1;
    if (nouveau && texte(phrase)) {
      ajouterAuJournalSansTransaction(database, { proposition: null, evenement: 'resume-ecrit', source: 'nuit', phrase, details: { mois: resume.mois, version: resume.version, sansAppel: Boolean(resume.sansAppel), essai: Number.isInteger(resume.essai) ? resume.essai : 1, modele: resume.modele ?? null } }, maintenant);
    }
    return nouveau;
  });
  return { ecrit };
}

/** NOTE un essai raté du résumé d'un mois (panne, forme, chiffres refusés) : ajout seulement. */
export function noterUnEssaiDeResume({ mois, version, type, raison = null, tokens = null }, { database = openDb(), maintenant = Date.now() } = {}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mois)) || !Number.isInteger(version) || !texte(type)) throw new CorrectionRefusee('invalide', 'Essai de résumé sans mois, forme ou type : rien n’est noté.', 400);
  database.prepare('INSERT INTO correction_resumes_essais (mois, version, le, type, raison, tokens) VALUES (?, ?, ?, ?, ?, ?)').run(mois, version, iso(maintenant), type, raison, Number.isInteger(tokens) ? tokens : null);
  return { note: true };
}

/** Les résumés rangés (d'un mois, ou tous), du plus récent au plus ancien. */
export function lireLesResumes({ database = openDb(), mois = null } = {}) {
  if (!tableExiste(database, 'correction_resumes')) return [];
  const sql = `SELECT mois, version, ecrit_le AS ecritLe, modele, mode, texte, fiche, garde, usage, cout_usd AS coutUsd, essai, sans_appel AS sansAppel, raison FROM correction_resumes ${mois ? 'WHERE mois = ?' : ''} ORDER BY mois DESC, version DESC`;
  return database
    .prepare(sql)
    .all(...(mois ? [mois] : []))
    .map((r) => ({ ...r, texte: lire(r.texte), fiche: lire(r.fiche), garde: lire(r.garde), usage: lire(r.usage), sansAppel: Boolean(r.sansAppel) }));
}

/** Les essais ratés du résumé d'un mois (une forme du tri), du plus ancien au plus récent. */
export function essaisDeResume(mois, { database = openDb(), version } = {}) {
  if (!tableExiste(database, 'correction_resumes_essais')) return [];
  return database
    .prepare('SELECT mois, version, le, type, raison, tokens FROM correction_resumes_essais WHERE mois = ? AND version = ? ORDER BY le')
    .all(mois, version)
    .map((r) => ({ ...r }));
}
