/**
 * combinaisonNuitEnfant.js — LA NUIT DE LA COMBINAISON, DANS UN PROCESSUS À PART (étape 38, lot 1b, 04/11/2026).
 * -----------------------------------------------------------------------
 * Lancé par combinaisonNuit.js (fork, sérialisation « avancée », argument « --enfant-combinaison-nuit », tas plafonné à
 * 512 Mo, délai de 10 min) ; ce n'est pas un script à lancer à la main. La base est ouverte EN LECTURE SEULE, une fois,
 * avant toute lecture (openDb({ readonly: true })) ; aucune écriture, aucune horloge (l'instant vient de la passe), ni
 * réseau, ni Claude. Un seul mode, « nuit » : nuitDeLaCombinaison.calculerLaNuitDeLaCombinaison, les lignes envoyées par
 * morceaux, puis la fin (bilan, contrôle anti-fuite). Les modes du banc restent dans combinaisonEnfant.js (scellé au
 * regard du 04/11, jamais retouché).
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { calculerLaNuitDeLaCombinaison } from './nuitDeLaCombinaison.js';

if (process.argv.includes('--enfant-combinaison-nuit') && typeof process.send === 'function') {
  process.once('message', (m) => {
    try {
      if (m?.mode !== 'nuit') throw new Error(`mode inconnu « ${m?.mode ?? ''} »`);
      const database = openDb({ file: m.chemin, readonly: true });
      const fin = calculerLaNuitDeLaCombinaison({ ...m, database, envoyer: (lignes) => process.send({ morceau: { lignes } }) });
      process.send({ fin: true, mode: m.mode, ...fin, aPart: { rssMaxOctets: process.resourceUsage().maxRSS * 1024 } }, () => process.exit(0));
    } catch (error) {
      process.send({ erreur: String(error?.stack ?? error?.message ?? error).slice(0, 4000), reporte: Boolean(error?.reporte) }, () => process.exit(0));
    }
  });
}
