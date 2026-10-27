import { onUnmounted, reactive, watch } from 'vue';
import { simulationApi } from '@/services/simulationApi.js';
import { natureDuTicket } from '@/utils/ticket.js';
import { jambesDuTicket } from '@/utils/simulation.js';

/**
 * LE PRIX JUSTE D'UN TICKET (étape 28 du plan, 27/10/2026), pour TicketDuPari : demandé au serveur
 * (POST /api/simulation/prix-combine — la grille du moteur, jamais une simulation dans la requête) quand le ticket
 * devient un COMBINÉ, après une courte pause (les clics s'enchaînent) ; jamais au chargement d'une page, jamais pour un
 * pari simple. `affichage()` : l'affichage effectif des matchs quand la page le connaît (la page du match : celui de
 * son analyse) — « éteint » (la livraison) : aucune demande, le ticket dit qu'il attend. Une réponse tardive (le ticket a
 * changé depuis) est ignorée.
 * Vérification du 27/10 (constat 11) : dès que le ticket change, la réponse d'avant — celle d'un AUTRE ticket — est
 * retirée tout de suite : pendant le recalcul (350 ms et le temps du serveur), le ticket ne montre ni n'enregistre jamais
 * la probabilité des sélections d'avant. Constat 23 : `allume` dit si l'affichage est connu comme allumé (la page le dit,
 * ou la dernière réponse n'était pas « éteint ») — le ticket ne dit « calcul en cours » que dans ce cas (Mes paris, tout
 * éteint : rien de visible ne change).
 * Rend un objet réactif { enCours, reponse, erreur, allume }.
 */
export const PAUSE_DU_PRIX_JUSTE_MS = 350;

export function usePrixJuste(selections, coteCombinee, affichage = () => null) {
  const etat = reactive({ enCours: false, reponse: null, erreur: null, allume: null });
  let minuteur = null;
  let numero = 0;

  async function demander(n) {
    const liste = selections() ?? [];
    try {
      const reponse = await simulationApi.prixCombine(jambesDuTicket(liste), coteCombinee() ?? null);
      if (n !== numero) return;
      Object.assign(etat, { enCours: false, reponse, erreur: null, allume: reponse?.eteint !== true });
    } catch (error) {
      if (n !== numero) return;
      Object.assign(etat, { enCours: false, reponse: null, erreur: error.message });
    }
  }

  watch(
    () => [selections(), coteCombinee(), affichage()],
    () => {
      clearTimeout(minuteur);
      numero += 1;
      const liste = selections() ?? [];
      const a = affichage();
      if (a === 'combines' || a === 'tout') etat.allume = true;
      if (natureDuTicket(liste) === 'simple' || natureDuTicket(liste) === 'vide' || a === 'eteint') {
        Object.assign(etat, { enCours: false, reponse: null, erreur: null, ...(a === 'eteint' ? { allume: false } : {}) });
        return;
      }
      // Le ticket a changé : la réponse d'avant n'est plus la sienne — retirée tout de suite (constat 11).
      Object.assign(etat, { enCours: true, reponse: null, erreur: null });
      const n = numero;
      minuteur = setTimeout(() => demander(n), PAUSE_DU_PRIX_JUSTE_MS);
    },
    { deep: true }
  );
  onUnmounted(() => clearTimeout(minuteur));
  return etat;
}
