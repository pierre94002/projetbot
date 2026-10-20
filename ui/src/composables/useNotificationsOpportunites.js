import { onMounted, onUnmounted, reactive } from 'vue';
import { opportunitiesApi } from '@/services/opportunitiesApi.js';
import { router } from '@/router/index.js';
import { opportunitesANotifier, contenuDeNotification, contenuDuResume, memoireNettoyee } from '@/utils/opportunites.js';

/**
 * useNotificationsOpportunites.js — une notification Windows quand une NOUVELLE
 * opportunité verte apparaît (étape 8 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 *   - Rien ne sort du PC : c'est la notification du navigateur (API
 *     Notification), sans service de « push », sans serveur tiers, sans compte.
 *   - La permission est demandée UNE fois, par le navigateur lui-même, au clic
 *     de Pierre sur l'interrupteur de la page — jamais au chargement. Refusée :
 *     la page le dit, rien n'est redemandé (le navigateur s'en souvient).
 *   - Réglable : l'interrupteur « Me prévenir » de la page Opportunités ; le
 *     choix vit dans CE navigateur (localStorage), comme la permission.
 *   - Jamais de son (`silent`), une notification par opportunité (la mémoire
 *     des opportunités déjà notifiées est partagée par les onglets ; deux
 *     onglets qui la notifieraient au même instant n'en montrent qu'une, même
 *     étiquette `tag`), au plus trois par vérification et une qui résume le reste.
 *   - Vertes à l'heure qu'il est (etatVerdict) : une value devenue « à
 *     rafraîchir » ne notifie rien.
 *   - La surveillance (montée une fois, dans AppShell) ne tourne que si
 *     l'interrupteur est mis ET la permission accordée : une lecture légère
 *     toutes les deux minutes (GET /api/opportunities/vertes), qui ne relance
 *     jamais le calcul du Repérage pour un simple âge — seulement s'il n'y en a
 *     pas encore, ou après un nouveau relevé The Odds API.
 * Les règles (quoi notifier, le texte, la mémoire) sont dans
 * utils/opportunites.js, testées sans navigateur.
 * -----------------------------------------------------------------------
 */

const CLE = 'cotemaster.notificationsOpportunites';
export const INTERVALLE_SURVEILLANCE_MS = 2 * 60_000;

function lireReglage() {
  try {
    const r = JSON.parse(localStorage.getItem(CLE) ?? 'null');
    return r && typeof r === 'object' ? r : {};
  } catch {
    return {}; // stockage refusé ou illisible : rien d'activé
  }
}

function ecrireReglage(reglage) {
  try {
    localStorage.setItem(CLE, JSON.stringify(reglage));
  } catch {
    // Stockage refusé (navigation privée…) : le choix ne survivra pas au rechargement, c'est tout.
  }
}

const supporte = () => typeof window !== 'undefined' && 'Notification' in window;
const permissionActuelle = () => (supporte() ? window.Notification.permission : 'non-supporte');

/** L'état que lit la page : l'interrupteur, la permission du navigateur, la dernière vérification. */
export const etatNotifications = reactive({
  actif: false,
  permission: 'default', // 'default' | 'granted' | 'denied' | 'non-supporte'
  derniereVerification: null,
  notifiees: 0,
  erreur: null
});

let minuteur = null;
let enCours = false;
// Une activation à la fois : l'interrupteur (AppToggle) peut appeler son setter deux fois pour un seul clic.
let activation = null;

/** L'état relu (la permission a pu changer dans les réglages du navigateur) : la page l'appelle à son ouverture. */
export function relireEtatNotifications() {
  relireEtat();
}

function relireEtat() {
  etatNotifications.permission = permissionActuelle();
  etatNotifications.actif = Boolean(lireReglage().actif) && etatNotifications.permission === 'granted';
}

function montrer({ titre, corps, tag, silent }) {
  const n = new window.Notification(titre, { body: corps, tag, silent });
  n.onclick = () => {
    window.focus();
    router.push({ path: '/matches', query: { onglet: 'opportunites' } });
    n.close();
  };
}

/**
 * Une vérification : les opportunités vertes du serveur, celles qui ne sont
 * pas encore notifiées, notifiées (sauf `base` : celles déjà à l'écran quand
 * Pierre active la surveillance, gardées comme vues sans notification).
 */
export async function verifierMaintenant({ maintenant = Date.now(), base = false } = {}) {
  if (enCours) return;
  enCours = true;
  try {
    const reponse = await opportunitiesApi.vertes();
    const reglage = lireReglage();
    const memoire = memoireNettoyee(reglage.vues, maintenant);
    const { individuelles, resumees, cles } = opportunitesANotifier(reponse?.vertes ?? [], memoire, { maintenant });
    if (!base && supporte() && window.Notification.permission === 'granted') {
      for (const o of individuelles) montrer(contenuDeNotification(o));
      if (resumees.length) montrer(contenuDuResume(resumees));
      etatNotifications.notifiees += individuelles.length + (resumees.length ? 1 : 0);
    }
    const quand = new Date(maintenant).toISOString();
    for (const cle of cles) memoire[cle] = quand;
    ecrireReglage({ ...reglage, vues: memoire });
    etatNotifications.derniereVerification = quand;
    etatNotifications.erreur = null;
  } catch (error) {
    etatNotifications.erreur = error.message;
  } finally {
    enCours = false;
  }
}

function arreter() {
  clearInterval(minuteur);
  minuteur = null;
}

function demarrer() {
  arreter();
  if (!etatNotifications.actif) return;
  minuteur = setInterval(() => verifierMaintenant(), INTERVALLE_SURVEILLANCE_MS);
  verifierMaintenant();
}

/** À monter UNE seule fois, dans AppShell : la surveillance tourne quelle que soit la page affichée. */
export function useSurveillanceOpportunites() {
  relireEtat();
  onMounted(demarrer);
  onUnmounted(arreter);
}

/** L'interrupteur, mis par un clic de Pierre : le navigateur peut alors demander sa permission (une fois). */
export function activerNotifications() {
  activation ??= activer().finally(() => {
    activation = null;
  });
  return activation;
}

async function activer() {
  if (!supporte()) {
    etatNotifications.permission = 'non-supporte';
    etatNotifications.actif = false;
    return etatNotifications;
  }
  let permission = window.Notification.permission;
  if (permission === 'default') permission = await window.Notification.requestPermission();
  etatNotifications.permission = permission;
  if (permission !== 'granted') {
    ecrireReglage({ ...lireReglage(), actif: false });
    etatNotifications.actif = false;
    return etatNotifications;
  }
  ecrireReglage({ ...lireReglage(), actif: true });
  etatNotifications.actif = true;
  // Ce qui est déjà vert à l'écran quand Pierre active : vu, jamais notifié après coup.
  await verifierMaintenant({ base: true });
  demarrer();
  return etatNotifications;
}

/** L'interrupteur, retiré : plus aucune vérification. */
export function desactiverNotifications() {
  ecrireReglage({ ...lireReglage(), actif: false });
  etatNotifications.actif = false;
  arreter();
}
