/**
 * etapeSauvegarde.js — l'étape « sauvegarde » de l'actualisation (étape 1 du plan).
 * -----------------------------------------------------------------------
 * Appelée chaque nuit par src/jobs/matchStatsAutoRefresh.js. Le serveur ne
 * fait ici que lancer deux scripts dans des PROCESSUS À PART et lire leur
 * ligne de bilan — la copie, la compression et la restauration d'essai ne
 * bloquent jamais l'API :
 *   1. scripts/backup-db.mjs : sauvegarde de la nuit, rotation, copie hors
 *      disque si une semaine a passé (ou si la destination est neuve) vers
 *      la destination en vigueur (OneDrive par défaut, cf.
 *      destinationHorsDisque.js) ;
 *   2. scripts/restore-test-db.mjs --si-du : restauration d'essai, une fois
 *      par semaine (contrôle complet tous les 28 jours), ou tant que la
 *      dernière n'était pas saine.
 * Puis le bilan d'une ligne (taille, durée, copies gardées…) et l'alerte
 * DURABLE du haut de l'appli, tirés du même état que la carte de Réglages.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { etatSauvegardes } from './etatSauvegardes.js';

const execFileAsync = promisify(execFile);
const SERVEUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Délais très au-dessus des durées mesurées le 05/10/2026 dans le bac à sable
// sur la base de 1,7 Go : sauvegarde 1 min 49 (copie 17 s, quick_check 41 s,
// compression 48 s) ; restauration d'essai 42 s, 2 min 42 avec le contrôle
// complet (integrity_check 2 min 23). La préparation du bac, copie VACUUM INTO
// de la vraie base comprise, a pris 1 min 24 le même jour.
export const DELAI_SAUVEGARDE_MS = 30 * 60_000;
export const DELAI_RESTAURATION_MS = 45 * 60_000;

const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${Math.abs(Number(n ?? 0)) > 1 ? plusieurs : un}`;
const go = (o) => `${(Number(o ?? 0) / 1024 ** 3).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Go`;
const mo = (o) => `${(Number(o ?? 0) / 1024 ** 2).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
const duree = (ms) => {
  const s = Math.round((ms ?? 0) / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
};
const HORS_DISQUE = {
  'non-configuree': 'hors disque : destination non réglée',
  refusee: 'hors disque : aucune (choix « Aucune »)',
  illisible: 'hors disque : choix de la destination illisible, rien copié',
  'pas-due': 'hors disque : pas due cette nuit',
  absente: 'hors disque : destination absente, rien copié',
  'place-insuffisante': 'hors disque : place insuffisante, rien copié',
  'rien-a-copier': 'hors disque : rien à copier',
  erreur: 'hors disque : en échec'
};

/** Un script dans un processus à part, et sa dernière ligne JSON — même quand il sort en erreur. */
async function lancer(script, args, timeout) {
  const derniereLigne = (sortie) => JSON.parse(String(sortie ?? '').trim().split('\n').pop());
  try {
    const { stdout } = await execFileAsync(process.execPath, [path.join(SERVEUR, 'scripts', script), ...args], { cwd: SERVEUR, timeout, maxBuffer: 4 * 1024 * 1024 });
    return derniereLigne(stdout);
  } catch (error) {
    try {
      return derniereLigne(error.stdout);
    } catch {
      return { ok: false, reason: String(error.message).slice(0, 300) };
    }
  }
}

/**
 * La passe de la nuit. `dossier` et `donnees` : seulement pour les essais
 * (sinon le dossier des sauvegardes à côté de la base, et data/runtime).
 * Rend { status, summary, details, alert }.
 */
export async function passeSauvegarde({ dossier = null, donnees = null, delais = {} } = {}) {
  const dir = dossier ? ['--dir', dossier] : [];
  const s = await lancer('backup-db.mjs', [...dir, ...(donnees ? ['--donnees', donnees] : [])], delais.sauvegarde ?? DELAI_SAUVEGARDE_MS);
  const r = s.ok ? await lancer('restore-test-db.mjs', [...dir, '--si-du'], delais.restauration ?? DELAI_RESTAURATION_MS) : null;
  let etat = null;
  try {
    etat = etatSauvegardes({ dossier, donnees });
  } catch (error) {
    console.error(`[sauvegarde] état des sauvegardes illisible : ${error.message}`);
  }
  const alertes = etat?.alertes ?? [];
  const parties = [];
  if (s.ok) {
    const c = s.compte ?? {};
    parties.push(
      `Base de ${go(s.baseBytes)} copiée et compressée à ${go(s.bytes)} en ${duree(s.durationMs)} (${path.basename(s.file)}, données de l'appli ${mo(s.donnees?.octets)})`,
      s.rotationErreur
        ? `rotation incomplète, reprise la nuit suivante (${s.rotationErreur}) : ${pluriel(c.jeux, 'copie', 'copies')} en place`
        : `gardées : ${pluriel(c.quotidiennes, 'quotidienne', 'quotidiennes')}, ${pluriel(c.hebdomadaires, 'hebdomadaire', 'hebdomadaires')}, ${pluriel(c.mensuelles, 'mensuelle', 'mensuelles')} (${pluriel(c.jeux, 'copie', 'copies')} en tout${s.removed?.length ? `, ${pluriel(s.removed.length, 'fichier retiré', 'fichiers retirés')}` : ''})`
    );
  } else {
    parties.push(`Sauvegarde NON faite : ${s.reason ?? 'raison inconnue'}`);
  }
  if (r?.fait === false) parties.push("restauration d'essai pas due cette nuit");
  else if (r?.saine === true) parties.push(`restauration d'essai saine en ${duree(r.durees?.totalMs)} (${r.controle === 'integrity_check' ? 'contrôle complet' : 'contrôle rapide'}, ${nombre(r.rencontres)} rencontres, dernière le ${r.derniereDate})`);
  else if (r?.impossible) parties.push(`restauration d'essai impossible : ${r.impossible}`);
  else if (r) parties.push(`restauration d'essai NON SAINE : ${(r.problemes ?? [r.reason]).join(' ; ')}`);
  if (s.ok) {
    const hd = s.horsDisque ?? {};
    parties.push(hd.statut === 'faite' ? `copie hors disque faite${hd.type === 'onedrive' ? ' sur OneDrive' : ''} (${hd.destination}, ${mo(hd.octets)})` : HORS_DISQUE[hd.statut] ?? `hors disque : ${hd.statut}`);
  }
  if (etat?.disque?.libre !== null && etat?.disque?.libre !== undefined) parties.push(`${go(etat.disque.libre)} libres sur le disque`);
  const malsaine = Boolean(r && r.fait !== false && r.saine === false);
  return {
    status: !s.ok || malsaine || alertes.some((a) => a.niveau === 'danger') ? 'error' : alertes.length ? 'warn' : 'ok',
    summary: `${parties.join(' ; ')}.`,
    details: { sauvegarde: s, restauration: r },
    // Alerte DURABLE (haut de l'appli, Réglages) jusqu'à la nuit suivante.
    alert: { key: 'sauvegarde', value: alertes.length ? { alertes, updatedAt: new Date().toISOString() } : null }
  };
}
