import { computed, effectScope, getCurrentInstance, inject, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import { routeLocationKey } from 'vue-router';
import { directApi } from '@/services/directApi.js';
import { compteDesEnCours, enCoursDeLaPaire, indexDesEnCours, instantDeLAdresse } from '@/utils/direct.js';
import { pageCachee, surVisible } from '@/composables/usePageVisible.js';

/**
 * useDirectEnCours.js — LES MATCHS EN COURS, POUR TOUTE L'APPLI (étape 46 du plan, lot 1, correctifs D2, 12/11/2026,
 * point 2 b ; demande de Pierre : le direct sur TOUS les matchs, même ceux du calendrier sans heure de coup d'envoi).
 *
 * Le seul témoin sûr qu'un match se joue, c'est la boucle du direct (FotMob) : GET /api/direct/en-cours rend TOUS les
 * matchs qu'elle suit en cours, chacun avec les identifiants FotMob de ses deux clubs. Ce composable PARTAGÉ en tient
 * l'ensemble, indexé par la PAIRE d'identifiants (« fotmob-1|fotmob-2 »), jamais par un nom : la puce « Direct » des
 * cartes de rencontre (MatchCard), le compte « N en direct » de la page Matchs et l'encart de la page du match le lisent.
 *
 * UNE SEULE LECTURE PAR MINUTE pour toute l'appli, quel que soit le nombre de cartes affichées : chacune s'abonne à son
 * montage et se désabonne au démontage ; le premier abonné arme un seul minuteur, le dernier parti l'arrête. Onglet caché :
 * aucune lecture ; dès qu'il redevient visible, une relecture si la dernière a plus d'une minute. Dans le bac, l'adresse
 * courante donne l'instant d'un rejeu (`?instant=`, R28) : l'ensemble est celui de cet instant, relu quand il change.
 * Rendu côté serveur : rien n'est monté, donc ni lecture, ni minuteur, ni écoute.
 */
const LECTURE_MS = 60_000;
const TIC_MS = 15_000;
const GARDE_SUR_PANNE_MS = 3 * LECTURE_MS;
const VIDE = Object.freeze({ reponse: null, instant: undefined, reponseA: null, tenteA: null, erreur: null });

const lu = shallowRef(VIDE);
const routeDeLAppli = shallowRef(null);
const instant = computed(() => instantDeLAdresse(routeDeLAppli.value?.query ?? {}));
// L'ensemble ne vaut que pour l'instant où il a été lu : un autre rejeu (ou le direct) n'en montre rien avant sa lecture.
const reponseValable = computed(() => (lu.value.instant === instant.value ? lu.value.reponse : null));
const index = computed(() => indexDesEnCours(reponseValable.value));
const compte = computed(() => compteDesEnCours(reponseValable.value));
const erreur = computed(() => lu.value.erreur);

let abonnes = 0;
let enVol = null;
let ecoutes = null; // { minuteur, arreter, portee } tant qu'au moins un abonné est monté (navigateur seulement)

/** Lit l'ensemble (une lecture à la fois ; rien quand l'onglet est caché) ; rend l'état lu. */
function lire() {
  if (enVol) return enVol;
  if (pageCachee()) return Promise.resolve(lu.value);
  const voulu = instant.value;
  enVol = (async () => {
    try {
      const reponse = await directApi.enCours({ instant: voulu });
      lu.value = { reponse, instant: voulu, reponseA: Date.now(), tenteA: Date.now(), erreur: null };
    } catch (error) {
      // Une lecture ratée : l'ensemble d'avant reste trois minutes au plus (jamais un ensemble inventé), l'erreur est gardée.
      const garde = lu.value.instant === voulu && lu.value.reponseA !== null && Date.now() - lu.value.reponseA < GARDE_SUR_PANNE_MS;
      lu.value = { ...(garde ? lu.value : VIDE), instant: voulu, tenteA: Date.now(), erreur: String(error?.message ?? error) };
    } finally {
      enVol = null;
    }
    return lu.value;
  })();
  return enVol;
}

/** Lit si la dernière lecture a plus d'une minute, ou valait un autre instant ; sinon rend l'état lu. */
function lireSiBesoin() {
  const v = lu.value;
  const frais = v.tenteA !== null && Date.now() - v.tenteA < LECTURE_MS && v.instant === instant.value;
  return frais ? Promise.resolve(v) : lire();
}

function abonner() {
  abonnes += 1;
  if (!ecoutes && typeof window !== 'undefined') {
    // Une portée détachée : l'écoute de l'adresse survit au démontage du premier abonné (elle s'arrête avec le dernier).
    const portee = effectScope(true);
    portee.run(() => watch(instant, () => lire(), { flush: 'sync' }));
    ecoutes = {
      minuteur: setInterval(() => {
        if (!pageCachee()) lireSiBesoin();
      }, TIC_MS),
      arreter: surVisible(() => lireSiBesoin()),
      portee
    };
  }
  return lireSiBesoin();
}

function arreterDEcouter() {
  if (!ecoutes) return;
  clearInterval(ecoutes.minuteur);
  ecoutes.arreter();
  ecoutes.portee.stop();
  ecoutes = null;
}

function desabonner() {
  abonnes = Math.max(0, abonnes - 1);
  if (abonnes === 0) arreterDEcouter();
}

/**
 * L'ensemble des matchs en cours : { index, compte, instant, erreur, dePaire({ homeId, awayId, jour }), lire }.
 * `suivre` (défaut) : le composant s'abonne à son montage (la lecture par minute) et se désabonne à son démontage ; sans
 * lui, il ne fait que lire l'ensemble tenu pour les autres.
 */
export function useDirectEnCours({ suivre = true } = {}) {
  if (getCurrentInstance()) {
    // La route de l'appli (jamais d'avertissement sans routeur) : son `?instant=` choisit l'ensemble lu.
    const route = inject(routeLocationKey, null);
    if (route && routeDeLAppli.value !== route) routeDeLAppli.value = route;
    if (suivre) {
      onMounted(abonner);
      onBeforeUnmount(desabonner);
    }
  }
  return { index, compte, instant, erreur, dePaire: (q) => enCoursDeLaPaire(index.value, q), lire: lireSiBesoin };
}

/**
 * Pour les essais (rendu côté serveur, où rien n'est monté) : poser l'ensemble lu pour un instant (null : le direct), ou,
 * sans réponse, tout remettre à zéro (abonnés, minuteur, écoute, lecture en cours).
 */
export function __poserLesEnCours(reponse = null, { instant: i = null } = {}) {
  arreterDEcouter();
  abonnes = 0;
  enVol = null;
  lu.value = reponse ? { reponse, instant: i, reponseA: Date.now(), tenteA: Date.now(), erreur: null } : VIDE;
}
