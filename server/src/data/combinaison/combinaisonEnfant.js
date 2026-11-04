/**
 * combinaisonEnfant.js — LE BANC DE L'ÉTAPE 38, DANS UN PROCESSUS À PART (lot 1a, 03-04/11/2026).
 * -----------------------------------------------------------------------
 * Lancé par scripts/etape38.mjs (fork, sérialisation « avancée », argument « --enfant-combinaison ») ; ce n'est pas un
 * script à lancer à la main. La base est ouverte EN LECTURE SEULE avant toute lecture (openDb({ readonly: true }) ;
 * T-X4) ; aucune écriture, aucune horloge (seules des durées), ni réseau, ni Claude. Modes :
 *   « comptes »  AUCUN RÉSULTAT LU : football-data sans score ni clôture (seule la PRÉSENCE d'une clôture), les lignes
 *                gelées de P5-a sans probabilité ni distribution ni issue ; comptesDeLaCombinaison.js ;
 *   « banc »     LE PASSAGE UNIQUE : les mêmes lectures AVEC les résultats ; l'ÉTALONNAGE d'abord (un écart arrête
 *                tout, aucune variante jugée : T-B12), puis les 38 variantes (bancDeLaCombinaison.js).
 * (Les modes « nuit » et « ombre » viennent aux lots 1b et 1c.) `passerLeBanc` et `compterLaCombinaison` sont aussi
 * appelables dans le processus courant (les essais, sur une copie).
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { passeFd } from './bancFd.js';
import { lignesGelees } from './lecteurP5.js';
import { etalonner, jugerLesVariantes } from './bancDeLaCombinaison.js';
import { comptesDeLaCombinaison } from './comptesDeLaCombinaison.js';
import { JUGE, PERIODES_DU_BANC } from './reglagesCombinaison.js';

const duree = (t0) => Math.round(performance.now() - t0);

/** Les comptes d'avant le regard (aucun résultat lu). */
export function compterLaCombinaison({ database, periodes = PERIODES_DU_BANC }) {
  const t0 = performance.now();
  const fd = passeFd({ database, avecResultats: false, periodes });
  const t1 = performance.now();
  const p5 = lignesGelees(database, { de: periodes.P5a.de, a: periodes.P5a.a, avecResultats: false });
  const comptes = comptesDeLaCombinaison({ fd: fd.lignes, p5: p5.lignes, bilanFd: fd.bilan, bilanP5: p5.bilan });
  return { comptes, durees: { fd: duree(t0), p5: duree(t1), total: duree(t0) }, aPart: { rssMaxOctets: process.memoryUsage.rss() } };
}

/** LE PASSAGE UNIQUE : étalonnage, puis les variantes (K déclaré exigé). */
export function passerLeBanc({ database, periodes = PERIODES_DU_BANC, K = JUGE.K, tirages = JUGE.tirages, ignorerEtalonnage = false }) {
  const t0 = performance.now();
  const fd = passeFd({ database, avecResultats: true, periodes });
  const t1 = performance.now();
  // Une copie d'essai (magasin fabriqué) peut ignorer l'étalonnage : le script ne le permet que hors du bac.
  const etalonnage = ignorerEtalonnage ? { ...etalonner(fd.lignes), ok: true, ignore: true } : etalonner(fd.lignes);
  if (!etalonnage.ok) {
    return { arret: true, etalonnage, comptesDuPassage: { fd: fd.bilan }, durees: { fd: duree(t0), total: duree(t0) }, aPart: { rssMaxOctets: process.memoryUsage.rss() } };
  }
  const p5 = lignesGelees(database, { de: periodes.P5a.de, a: periodes.P5a.a, avecResultats: true });
  const t2 = performance.now();
  const banc = jugerLesVariantes({ fd: fd.lignes, p5: p5.lignes, K, tirages });
  return { arret: false, etalonnage, banc, comptesDuPassage: { fd: fd.bilan, p5: p5.bilan }, durees: { fd: Math.round(t1 - t0), p5: Math.round(t2 - t1), juge: duree(t2), total: duree(t0) }, aPart: { rssMaxOctets: process.memoryUsage.rss() } };
}

// ------------------------------------------------------------ le processus à part
if (process.argv.includes('--enfant-combinaison') && typeof process.send === 'function') {
  process.once('message', (m) => {
    try {
      const database = openDb({ file: m.chemin, readonly: true });
      let r;
      if (m.mode === 'comptes') r = compterLaCombinaison({ database, periodes: m.periodes ?? PERIODES_DU_BANC });
      else if (m.mode === 'banc') r = passerLeBanc({ database, periodes: m.periodes ?? PERIODES_DU_BANC, K: m.K, tirages: m.tirages, ignorerEtalonnage: m.ignorerEtalonnage === true });
      else throw new Error(`mode inconnu « ${m?.mode ?? ''} »`);
      process.send({ fin: true, mode: m.mode, resultat: r }, () => process.exit(0));
    } catch (error) {
      process.send({ erreur: String(error?.stack ?? error?.message ?? error).slice(0, 4000) }, () => process.exit(0));
    }
  });
}
