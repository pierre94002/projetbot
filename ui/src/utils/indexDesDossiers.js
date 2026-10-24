/**
 * indexDesDossiers.js — l'INDEX des dossiers de la mémoire de l'IA à l'écran (étape 45 du plan, 24/10/2026) : la section « Dossiers et
 * leçons » de la page « Bulletin » (AiDossiersBoard.vue). Règles PURES (ni Vue, ni service, ni horloge), pour que la section n'ait qu'à
 * les afficher et qu'un test les rejoue sans navigateur.
 *
 * Ce qu'elles lisent est la réponse de GET /api/match-ai-analysis/dossiers/resume : le fichier des dossiers, écrit chaque nuit par le
 * code, rangé en listes (les championnats, les équipes, toutes les leçons gardées avec leur portée et leur preuve en mots). Rien n'est
 * recalculé. Les lignes d'une leçon sont celles de la page d'une équipe (utils/dossiersIA.js, `ligneDeLecon`) : une leçon se dit de la
 * même façon partout. Les tableaux ont toujours leur Σ (comptes) et leur ⌀ (moyenne), jamais une somme de pourcentages.
 */

import { jourDit, ligneDeLecon } from './dossiersIA.js';
import { nombreDit, pluriel } from './bulletins.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const virgule = (x, d = 1) => (fini(x) ? String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ',') : '—');
const SERVEUR_PAS_A_JOUR = /^Le serveur n.est pas à jour/;

/** Aucun choix dans les listes (la valeur du champ avant qu'on choisisse). */
export const AUCUN = '';

/**
 * L'état de la section : { cle, ton, titre, texte }. `reponse` : la réponse de la route ; `erreur` : sa lecture ratée.
 * Les tableaux restent affichés dans tous les cas : la raison est dite en plus.
 */
export function etatDeLIndex({ chargement = false, erreur = null, reponse = null } = {}) {
  const garde = 'Les tableaux ci-dessous restent affichés, sans valeurs.';
  if (erreur && !reponse) {
    return SERVEUR_PAS_A_JOUR.test(erreur)
      ? { cle: 'pas-a-jour-serveur', ton: 'is-warning', titre: 'Serveur à relancer', texte: `${erreur} ${garde}` }
      : { cle: 'erreur', ton: 'is-danger', titre: 'Dossiers illisibles', texte: `${erreur} ${garde}` };
  }
  if (chargement && !reponse) return { cle: 'chargement', ton: '', titre: 'Lecture en cours', texte: 'Lecture des dossiers…' };
  if (!reponse) return { cle: 'non-lu', ton: 'is-info', titre: 'Pas encore lus', texte: `Les dossiers n’ont pas encore été lus. ${garde}` };
  if (reponse.etat === 'absent') return { cle: 'jamais', ton: 'is-info', titre: 'Pas encore écrits', texte: `Les dossiers de l’IA n’ont pas encore été écrits : la prochaine passe de nuit de l’actualisation les écrit (quelques secondes, sans aucun appel à Claude). ${garde}` };
  if (reponse.etat === 'autreVersion') return { cle: 'autre-version', ton: 'is-warning', titre: 'Dossiers d’une autre forme', texte: `Les dossiers ont été écrits par une autre forme du calcul : la prochaine passe de nuit les refait, et l’IA ne les lit pas en attendant. Leurs chiffres restent lus ici. ${garde}` };
  const t = reponse.totaux ?? {};
  if (!(t.confirmees > 0) && !(t.retirees > 0)) {
    return { cle: 'sans-lecon', ton: 'is-info', titre: 'Aucune leçon gardée pour l’instant', texte: `Une leçon n’entre dans un dossier que lorsque le carnet de l’IA la confirme sur plusieurs matchs suivants (au moins ${reponse.regles?.equipe?.minMatchs ?? 3} pour une équipe, ${reponse.regles?.championnat?.minMatchs ?? 10} pour un championnat). ${garde}` };
  }
  return { cle: 'pret', ton: '', titre: null, texte: null };
}

/** Les chiffres de la section en une ligne (elle sert de sous-titre à la liste). */
export function resumeDeLIndex(reponse) {
  const t = reponse?.totaux;
  if (!t) return 'Rien à compter : les dossiers ne sont pas lus.';
  return `Dossiers écrits : ${pluriel(t.equipes, 'équipe', 'équipes')}, ${pluriel(t.championnats, 'championnat', 'championnats')} · leçons gardées : ${pluriel(t.confirmees, 'confirmée', 'confirmées')}, ${pluriel(t.retirees, 'retirée', 'retirées')} · en tout : ${pluriel(t.confirmeesEnTout, 'confirmée', 'confirmées')}, ${pluriel(t.retireesEnTout, 'retirée', 'retirées')}, ${nombreDit(t.enAttente)} en attente du carnet`;
}

/** La vraie provenance de l'index : qui l'écrit, quand, où c'est rangé. */
export function provenanceDeLIndex(reponse) {
  const p = reponse?.provenance ?? {};
  const morceaux = [p.faits, p.absents, p.entraineur, p.style, p.lecons].filter(Boolean);
  return {
    source: 'Écrit par le code · magasin FotMob et carnet de l’IA',
    releveLe: reponse?.calculeLe ?? null,
    action: 'mis à jour',
    fichier: reponse?.fichier ?? 'data/runtime/ai-dossiers.json',
    detail: `${morceaux.length ? `D’où viennent les morceaux d’un dossier : ${morceaux.join(' ; ')}.` : ''} Refait chaque nuit, seulement pour les équipes qui ont joué.`.trim()
  };
}

// ------------------------------------------------------------------ les choix
/**
 * Les championnats à choisir, favoris d'abord (le même dessin que les autres sélecteurs de championnat : drapeau et nom, étoile des
 * favoris, groupes « Favoris » / « Tous les championnats ») ; en précision, le nombre d'équipes et de leçons.
 */
export function optionsDesChampionnats(reponse, { favorisEnPremier = (l) => l, estFavori = () => false } = {}) {
  const liste = (reponse?.championnats ?? []).map((c) => ({
    value: c.league,
    label: c.league,
    league: c.league,
    favorite: estFavori(c.league),
    hint: `${pluriel(c.equipes, 'équipe', 'équipes')} · ${pluriel(c.confirmees, 'leçon', 'leçons')}`
  }));
  const rangees = favorisEnPremier(liste);
  const avecGroupes = rangees.some((o) => o.favorite);
  return rangees.map((o) => ({ ...o, group: avecGroupes ? (o.favorite ? 'Favoris' : 'Tous les championnats') : undefined }));
}

/**
 * Les équipes d'un championnat, favorites d'abord, après le choix « Le championnat seul » (son dossier sans celui d'une équipe) ; la
 * précision dit combien de leçons son dossier garde. Sans championnat choisi : aucune option (le champ est désactivé et le dit).
 */
export function optionsDesEquipes(reponse, league, { favorisEnPremier = (l) => l, estFavorite = () => false } = {}) {
  if (!league) return [];
  const liste = (reponse?.equipes ?? [])
    .filter((e) => e.league === league)
    .map((e) => ({
      value: e.id,
      label: e.nom,
      favorite: estFavorite(e.nom, e.league, e.id),
      hint: `${pluriel(e.confirmees, 'confirmée', 'confirmées')} · ${pluriel(e.retirees, 'retirée', 'retirées')}`
    }));
  const rangees = favorisEnPremier(liste);
  const avecGroupes = rangees.some((o) => o.favorite);
  const seul = { value: AUCUN, label: 'Le championnat seul', icon: 'trophy', hint: pluriel(liste.length, 'équipe', 'équipes') };
  return [seul, ...rangees.map((o) => ({ ...o, group: avecGroupes ? (o.favorite ? 'Favoris' : 'Toutes les équipes') : undefined }))];
}

/** L'équipe d'un identifiant FotMob dans l'index, ou null. */
export const equipeDeLIndex = (reponse, id) => (reponse?.equipes ?? []).find((e) => e.id === id) ?? null;

// ------------------------------------------------------------------ les tableaux de leçons
/** Les lignes d'un tableau de leçons de l'index : celles d'une page d'équipe, plus la portée qui garde la leçon. */
export function lignesDesLeconsDeLIndex(liste) {
  return (liste ?? []).map((l) => {
    const ligne = ligneDeLecon(l, { [l.id]: l.preuveDite ?? '—' });
    return {
      ...ligne,
      cle: l.cle ?? ligne.cle,
      portee: l.portee ?? null,
      porteeGenre: l.portee?.genre ?? null,
      porteeDite: l.portee?.genre === 'equipe' ? `équipe : ${l.portee.nom}` : l.portee ? `championnat : ${l.portee.league}` : 'portée inconnue',
      matchsSuivants: fini(l.preuve?.matchs) ? l.preuve.matchs : null
    };
  });
}

/**
 * Le pied d'un tableau de leçons : Σ (les lignes, par portée, et les leçons différentes — une même leçon est gardée par plusieurs
 * portées) et ⌀ (les matchs suivants comptés par leçon, jamais une somme de pourcentages). Sans ligne : la structure reste.
 */
export function piedDesLecons(lignes, { genre = 'confirmees', gardees = null, enTout = null } = {}) {
  const mot = genre === 'confirmees' ? ['confirmée', 'confirmées'] : ['retirée', 'retirées'];
  const n = lignes.length;
  const equipes = lignes.filter((l) => l.porteeGenre === 'equipe').length;
  const ligues = lignes.filter((l) => l.porteeGenre === 'championnat').length;
  const differentes = new Set(lignes.map((l) => l.cle.split('@')[0])).size;
  const matchs = lignes.map((l) => l.matchsSuivants).filter(fini);
  const reste = fini(gardees) && gardees > n ? ` (les ${nombreDit(n)} plus récentes sur ${nombreDit(gardees)})` : '';
  return {
    sigma: n
      ? `${pluriel(n, `ligne ${mot[0]}`, `lignes ${mot[1]}`)}${reste} · ${pluriel(differentes, 'leçon différente', 'leçons différentes')} · ${nombreDit(equipes)} chez une équipe, ${nombreDit(ligues)} chez un championnat${fini(enTout) && enTout !== n ? ` · ${nombreDit(enTout)} ${mot[1]} en tout` : ''}`
      : `0 ligne ${mot[0]}`,
    moyenne: matchs.length ? `${virgule(matchs.reduce((a, x) => a + x, 0) / matchs.length)} matchs suivants comptés par leçon` : '—'
  };
}

/** Le jour d'une mise à jour, au jour de Paris (réexport : une seule façon de dire un jour). */
export { jourDit };
