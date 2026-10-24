/**
 * resumeDesDossiers.js — l'INDEX des dossiers de la mémoire de l'IA, pour la page « Bulletin » (étape 45 du plan, 24/10/2026).
 * -----------------------------------------------------------------------
 * La page « Bulletin » montre, à un seul endroit, toutes les leçons que le carnet de l'IA a confirmées (ou retirées) avec leur
 * jour et leur match d'origine, et laisse choisir un championnat puis une équipe pour ouvrir son dossier complet
 * (AiDossierCard). Les routes de l'étape 44 donnent UN dossier à la fois, par identifiant de club ou par championnat ; il leur
 * manquait de quoi LISTER. Cette fonction, PURE (aucune base, aucun réseau, aucun Claude, aucune horloge), range ce que le fichier
 * des dossiers contient déjà, sans rien recalculer :
 *   - `championnats` : un par championnat qui a un dossier, avec le nombre d'équipes et de leçons ;
 *   - `equipes`      : une par club, compacte (identifiant FotMob, nom, championnat, leçons) pour le choix de l'équipe ;
 *   - `lecons`       : toutes les leçons gardées dans les dossiers, confirmées d'une part, retirées d'autre part, chacune avec sa
 *                      PORTÉE (l'équipe ou le championnat qui la garde) et sa preuve en mots (celle que l'IA et la page d'une équipe
 *                      lisent : `preuveDite`) ; les plus récentes d'abord, au plus `max` par liste (le total dit le reste).
 * Une même leçon peut figurer deux ou trois fois (le club de l'un, le club de l'autre, le championnat) : une ligne par portée.
 * Les mots viennent de aiMemory.js : une seule façon de dire la preuve.
 * -----------------------------------------------------------------------
 */

import { preuveDite } from './aiMemory.js';

/** Au plus tant de leçons montrées par liste (le total dit le reste). */
export const LECONS_PAR_LISTE_MAX = 80;

const estUnObjet = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const entier = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);
const texte = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'fr');

/** Une leçon d'un dossier, avec sa portée et sa preuve en mots. */
function ligneDeLecon(l, portee) {
  return {
    id: l.id,
    // La clé de la ligne : la leçon dans sa portée (la même leçon est gardée par plusieurs portées).
    cle: `${l.id}@${portee.genre === 'equipe' ? portee.id : `ligue:${portee.league}`}`,
    date: l.date ?? null,
    match: l.match ?? null,
    type: l.type ?? null,
    market: l.market ?? null,
    pick: l.pick ?? null,
    issue: l.issue ?? null,
    sens: l.sens ?? null,
    texte: l.texte ?? null,
    etat: l.etat ?? null,
    confirmeeLe: l.confirmeeLe ?? null,
    retireeLe: l.retireeLe ?? null,
    raison: l.raison ?? null,
    preuve: l.preuve ?? null,
    preuveDite: preuveDite(l.preuve),
    portee
  };
}

/**
 * @param {object|null} donnees  le contenu de ai-dossiers.json ({ equipes, championnats, … }), tel que le lit le dépôt
 * @param {{ max?: number }} options
 */
export function resumeDesDossiers(donnees, { max = LECONS_PAR_LISTE_MAX } = {}) {
  const equipesBrutes = estUnObjet(donnees?.equipes) ? Object.entries(donnees.equipes) : [];
  const championnatsBruts = estUnObjet(donnees?.championnats) ? Object.entries(donnees.championnats) : [];

  const parLigue = new Map();
  for (const [, d] of equipesBrutes) parLigue.set(d?.league ?? null, (parLigue.get(d?.league ?? null) ?? 0) + 1);

  const championnats = championnatsBruts
    .map(([league, c]) => ({
      league,
      equipes: parLigue.get(league) ?? 0,
      matchs: Number.isFinite(c?.matchs) ? c.matchs : null,
      jusquAu: c?.jusquAu ?? null,
      majLe: c?.majLe ?? null,
      confirmees: entier(c?.lecons?.confirmeesEnTout ?? c?.lecons?.confirmees?.length),
      retirees: entier(c?.lecons?.retireesEnTout ?? c?.lecons?.retirees?.length),
      enAttente: entier(c?.lecons?.enAttente)
    }))
    .sort((a, b) => texte(a.league, b.league));

  const equipes = equipesBrutes
    .map(([id, d]) => ({
      id,
      nom: d?.nom ?? id,
      league: d?.league ?? null,
      jusquAu: d?.jusquAu ?? null,
      confirmees: entier(d?.lecons?.confirmeesEnTout ?? d?.lecons?.confirmees?.length),
      retirees: entier(d?.lecons?.retireesEnTout ?? d?.lecons?.retirees?.length),
      enAttente: entier(d?.lecons?.enAttente)
    }))
    .sort((a, b) => texte(a.league, b.league) || texte(a.nom, b.nom) || texte(a.id, b.id));

  const confirmees = [];
  const retirees = [];
  const ranger = (dossier, portee) => {
    for (const l of dossier?.lecons?.confirmees ?? []) confirmees.push(ligneDeLecon(l, portee));
    for (const l of dossier?.lecons?.retirees ?? []) retirees.push(ligneDeLecon(l, portee));
  };
  for (const [id, d] of equipesBrutes) ranger(d, { genre: 'equipe', id, nom: d?.nom ?? id, league: d?.league ?? null });
  for (const [league, c] of championnatsBruts) ranger(c, { genre: 'championnat', id: null, nom: league, league });

  // Les plus récentes d'abord : la date de confirmation (ou de retrait), puis le jour du match d'origine, puis la clé (ordre stable).
  confirmees.sort((a, b) => texte(b.confirmeeLe, a.confirmeeLe) || texte(b.date, a.date) || texte(a.cle, b.cle));
  retirees.sort((a, b) => texte(b.retireeLe, a.retireeLe) || texte(b.date, a.date) || texte(a.cle, b.cle));

  const somme = (liste, champ) => liste.reduce((n, x) => n + x[champ], 0);
  return {
    totaux: {
      equipes: equipes.length,
      championnats: championnats.length,
      // Les leçons GARDÉES dans les dossiers (au plus 12 confirmées et 10 retirées par dossier) ; « en tout » compte aussi celles qui ne le sont plus.
      confirmees: confirmees.length,
      retirees: retirees.length,
      confirmeesEnTout: somme(equipes, 'confirmees') + somme(championnats, 'confirmees'),
      retireesEnTout: somme(equipes, 'retirees') + somme(championnats, 'retirees'),
      enAttente: somme(equipes, 'enAttente') + somme(championnats, 'enAttente')
    },
    championnats,
    equipes,
    lecons: {
      max,
      confirmees: confirmees.slice(0, max),
      retirees: retirees.slice(0, max)
    }
  };
}
