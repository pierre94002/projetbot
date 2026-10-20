/**
 * depotBanc.js — les REJEUX du banc d'essai rangés dans la base (étape 19 du plan, 13/10/2026).
 * -----------------------------------------------------------------------
 * Table `bench_runs` (DDL de matchStatsDb.js), hors OneDrive, écrite par le
 * banc seul et sous le verrou d'actualisation (le script du bac, ou le
 * serveur de Pierre) : un rejeu = UNE ligne.
 *   - ouvrirRejeu : un INSERT au lancement (fini_le, bilan, resume vides : un
 *     rejeu interrompu — panne, serveur arrêté — reste « interrompu ») ;
 *   - finirRejeu  : un UPDATE … WHERE id = ? AND fini_le IS NULL, dans une
 *     transaction ; 0 ligne touchée = une erreur dite, jamais une seconde
 *     écriture sur une ligne finie.
 * L'état du rejeu EN COURS (partie, fait, total) vit en mémoire du serveur :
 * la page le lit, rien ne l'écrit dans la base. Lit et écrit la base de
 * l'appelant, n'en ouvre jamais.
 * -----------------------------------------------------------------------
 */

import { VERSION_BANC, FORMAT_LIGNES } from './periodes.js';

/** Une écriture refusée : la ligne n'existe pas, ou elle est déjà finie. */
export class RejeuDejaFini extends Error {}

const lireJson = (texte) => {
  if (texte === null || texte === undefined) return null;
  try {
    return JSON.parse(texte);
  } catch {
    return { illisible: true };
  }
};

/** Le lancement d'un rejeu : une ligne, sans bilan ni résumé. Rend son identifiant. */
export function ouvrirRejeu({ database, ou, moteur, options, maintenant = new Date().toISOString() }) {
  if (ou !== 'bac' && ou !== 'serveur') throw new RangeError(`ouvrirRejeu : « ou » vaut « bac » ou « serveur » (${String(ou)}).`);
  const r = database
    .prepare('INSERT INTO bench_runs (lance_le, fini_le, ou, version_banc, format_lignes, empreinte_moteur, empreinte_code, version_moteur, options, bilan, resume) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)')
    .run(maintenant, ou, VERSION_BANC, FORMAT_LIGNES, moteur.empreinte, moteur.empreinteCode, Number.isInteger(moteur.version) ? moteur.version : null, JSON.stringify(options));
  return Number(r.lastInsertRowid);
}

/** La fin d'un rejeu : bilan et résumé, en une transaction, sur une ligne encore ouverte — sinon RejeuDejaFini. */
export function finirRejeu({ database, id, bilan, resume, maintenant = new Date().toISOString() }) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const r = database.prepare('UPDATE bench_runs SET fini_le = ?, bilan = ?, resume = ? WHERE id = ? AND fini_le IS NULL').run(maintenant, JSON.stringify(bilan ?? null), resume === null || resume === undefined ? null : JSON.stringify(resume), id);
    if (r.changes !== 1) throw new RejeuDejaFini(`Le rejeu n° ${id} est déjà fini, ou n'existe pas : rien n'est réécrit.`);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function enRejeu(r, { avecResume = true } = {}) {
  if (!r) return null;
  return {
    id: r.id,
    lanceLe: r.lance_le,
    finiLe: r.fini_le,
    interrompu: r.fini_le === null,
    ou: r.ou,
    versionBanc: r.version_banc,
    formatLignes: r.format_lignes,
    moteur: { empreinte: r.empreinte_moteur, empreinteCode: r.empreinte_code, version: r.version_moteur },
    options: lireJson(r.options),
    bilan: lireJson(r.bilan),
    ...(avecResume ? { resume: lireJson(r.resume) } : {})
  };
}

const tableAbsente = (error) => /no such table/i.test(String(error?.message ?? ''));

/**
 * Le dernier rejeu FINI, ou null. `avecResume: false` : sans son résumé (2 à 4 Mo de JSON) — la page relit
 * l'avancement toutes les 5 s pendant un rejeu, sans relire ni renvoyer ce qu'elle a déjà.
 */
export function dernierRejeu({ database, avecResume = true }) {
  try {
    const colonnes = avecResume ? '*' : 'id, lance_le, fini_le, ou, version_banc, format_lignes, empreinte_moteur, empreinte_code, version_moteur, options, bilan, NULL AS resume';
    return enRejeu(database.prepare(`SELECT ${colonnes} FROM bench_runs WHERE fini_le IS NOT NULL ORDER BY id DESC LIMIT 1`).get(), { avecResume });
  } catch (error) {
    if (tableAbsente(error)) return null;
    throw error;
  }
}

/** Un rejeu par son identifiant (avec son résumé), ou null. */
export function lireRejeu(id, { database }) {
  try {
    return enRejeu(database.prepare('SELECT * FROM bench_runs WHERE id = ?').get(id));
  } catch (error) {
    if (tableAbsente(error)) return null;
    throw error;
  }
}

/** Les derniers rejeux, sans leur résumé (la liste de la page), du plus récent au plus ancien. */
export function rejeuxDe({ database, limite = 10 }) {
  try {
    return database.prepare('SELECT id, lance_le, fini_le, ou, version_banc, format_lignes, empreinte_moteur, empreinte_code, version_moteur, options, bilan, NULL AS resume FROM bench_runs ORDER BY id DESC LIMIT ?').all(limite).map((r) => enRejeu(r, { avecResume: false }));
  } catch (error) {
    if (tableAbsente(error)) return [];
    throw error;
  }
}

// ------------------------------------------------------------ en mémoire du serveur

let enCours = null;

/** Le rejeu en cours dans CE processus : { id, debut, partie, fait, total, date }, ou null. */
export const rejeuEnCours = () => (enCours ? { ...enCours } : null);
export function commencerRejeu({ id = null, debut = new Date().toISOString() } = {}) {
  enCours = { id, debut, partie: 'préparation', fait: 0, total: null, date: null };
}
export function avancerRejeu({ partie, fait, total, date = null }) {
  if (enCours) Object.assign(enCours, { partie, fait, total, date });
}
export function terminerRejeu() {
  enCours = null;
}
