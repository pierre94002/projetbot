/**
 * enregistreurs.js — le planificateur des enregistreurs (étape E du plan, 05/10/2026).
 * -----------------------------------------------------------------------
 * Une boucle à part, comme les compositions et les cotes gratuites, qui ne
 * touche à aucune boucle existante. Chaque minute :
 *   - l'instantané payant (The Odds API) est archivé s'il est nouveau
 *     (data/enregistreurs/cotesPayantes.js — lecture d'un fichier, aucun
 *     appel réseau) ;
 *   - toutes les `absentsIntervalleMinutes` (30) : la passe des absents du
 *     jour (data/enregistreurs/absents.js) ;
 *   - la file d'écriture est vidée par petites tranches si personne ne tient
 *     le verrou d'actualisation (data/enregistreurs/file.js) ;
 *   - toutes les cinq minutes : l'alerte durable est mise à jour
 *     (data/enregistreurs/etat.js).
 * La boucle du direct (jobs/liveWatch.js) a son propre rythme (une minute)
 * et ne fait que mettre en file. Le gel des pronostics vit dans
 * l'actualisation (une étape de nuit, pas de nouveau planificateur) et à
 * chaque analyse automatique (autoMatchAiTrigger.js).
 *
 * Démarrée par server.js avec l'actualisation (même interrupteur :
 * MATCH_STATS_AUTO_REFRESH, donc coupée dans le bac à sable sauf
 * CM_BAC_ACTUALISATION=1), et ENREGISTREURS=false la coupe à elle seule.
 * Un tour ne chevauche jamais le précédent ; une panne n'arrête pas le suivant.
 * -----------------------------------------------------------------------
 */

import { archiverReleveSiNouveau } from '../data/enregistreurs/cotesPayantes.js';
import { passeAbsents } from '../data/enregistreurs/absents.js';
import { vider } from '../data/enregistreurs/file.js';
import { actualiserAlerte, noterPlanificateur } from '../data/enregistreurs/etat.js';
import { iso, MINUTE_MS } from '../data/enregistreurs/communs.js';
import { startLiveWatch, stopLiveWatch } from './liveWatch.js';

const ALERTE_TOUS_LES_MS = 5 * MINUTE_MS;

let timer = null;
let enCours = false;
const rythme = { absentsMs: 30 * MINUTE_MS, maxLectures: 25, derniersAbsents: 0, derniereAlerte: 0 };

/** Un tour du planificateur. `maintenant` et les options : pour les tests. */
export async function tourEnregistreurs({ maintenant = Date.now(), absents = true } = {}) {
  if (enCours) return { skipped: 'tour précédent encore en cours' };
  enCours = true;
  const bilan = { at: iso(maintenant) };
  try {
    try {
      bilan.cotesPayantes = archiverReleveSiNouveau({ maintenant });
    } catch (error) {
      bilan.cotesPayantes = { erreur: error.message };
    }
    if (absents && maintenant - rythme.derniersAbsents >= rythme.absentsMs) {
      rythme.derniersAbsents = maintenant;
      try {
        bilan.absents = await passeAbsents({ maintenant, maxLectures: rythme.maxLectures });
      } catch (error) {
        bilan.absents = { erreur: error.message };
      }
    }
    try {
      bilan.ecriture = await vider({ maintenant });
    } catch (error) {
      bilan.ecriture = { erreur: error.message };
    }
    if (maintenant - rythme.derniereAlerte >= ALERTE_TOUS_LES_MS) {
      rythme.derniereAlerte = maintenant;
      bilan.problemes = actualiserAlerte({ maintenant });
    }
    return bilan;
  } finally {
    noterPlanificateur({ dernierTour: bilan });
    enCours = false;
  }
}

/**
 * Démarre les enregistreurs (et la boucle du direct si elle n'est pas
 * coupée). Sans effet s'ils tournent déjà ou sont coupés.
 */
export function startEnregistreurs(options = {}) {
  if (timer) return false;
  if (options.enabled === false) {
    noterPlanificateur({ demarre: false, raison: 'coupés par ENREGISTREURS=false' });
    return false;
  }
  rythme.absentsMs = Math.max(10, Number(options.absentsIntervalleMinutes) || 30) * MINUTE_MS;
  rythme.maxLectures = Math.max(1, Number(options.absentsMaxLecturesParPasse) || 25);
  const delai = Math.max(0, Number(options.startupDelayMinutes ?? 2)) * MINUTE_MS;
  noterPlanificateur({ demarre: true, demarreA: iso(), raison: null });
  if (options.direct !== false) {
    startLiveWatch({
      pasMinutes: options.directPasMinutes,
      maxDetailsParMinute: options.directMaxDetailsParMinute,
      startupDelayMinutes: delai / MINUTE_MS
    });
  }
  const lancer = () => tourEnregistreurs().catch((error) => console.error(`[enregistreurs] tour en échec : ${error.message}`));
  timer = setTimeout(() => {
    lancer();
    timer = setInterval(lancer, MINUTE_MS);
    timer.unref?.();
  }, delai);
  timer.unref?.();
  console.log(
    `[enregistreurs] absents du jour toutes les ${rythme.absentsMs / MINUTE_MS} min, ` +
      `${options.direct !== false ? 'direct chaque minute (instantané au plus toutes les 5 min par match)' : 'direct coupé'}, ` +
      'cotes payantes archivées à chaque relevé, gel des pronostics chaque nuit et à chaque analyse.'
  );
  return true;
}

export function stopEnregistreurs() {
  clearTimeout(timer);
  clearInterval(timer);
  timer = null;
  stopLiveWatch();
  noterPlanificateur({ demarre: false, raison: 'arrêtés' });
}

/** Pour les tests : régler le rythme sans démarrer de minuterie. */
export function __reglerPlanificateur({ absentsMs = 30 * MINUTE_MS, maxLectures = 25 } = {}) {
  Object.assign(rythme, { absentsMs, maxLectures, derniersAbsents: 0, derniereAlerte: 0 });
  enCours = false;
}
