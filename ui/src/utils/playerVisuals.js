/**
 * playerVisuals.js — note d'un joueur (format et couleur) et images FotMob,
 * communs au terrain des compositions (LineupPitch.vue) et à la fiche d'un
 * joueur (PlayerView.vue).
 * -----------------------------------------------------------------------
 * Couleurs de note à la FotMob : bleu à partir de 9, vert foncé à partir
 * de 8, vert à partir de 7, orange à partir de 6, rouge en dessous.
 * Photos et logos publiés par FotMob par identifiant (`fotmob-<n>`) ; une
 * image absente répond 403 et l'appelant affiche autre chose à la place.
 * -----------------------------------------------------------------------
 */

const numeroFotMob = (id) => /^fotmob-(\d+)$/.exec(String(id ?? ''))?.[1] ?? null;

/** Le joueur a-t-il une fiche ? (identifiant FotMob : c'est celui du magasin) */
export const aUneFiche = (id) => numeroFotMob(id) !== null;

export const photoJoueur = (id) => (numeroFotMob(id) ? `https://images.fotmob.com/image_resources/playerimages/${numeroFotMob(id)}.png` : null);

export const logoEquipe = (id) => (numeroFotMob(id) ? `https://images.fotmob.com/image_resources/logo/teamlogo/${numeroFotMob(id)}.png` : null);

/** « 7,3 », ou null sans note. */
export const formatNote = (r) => (r === null || r === undefined || r === '' || !Number.isFinite(Number(r)) ? null : Number(r).toFixed(1).replace('.', ','));

/** Classe de couleur d'une note (is-top, is-great, is-good, is-mid, is-low). */
export function classeNote(r) {
  const n = Number(r);
  if (n >= 9) return 'is-top';
  if (n >= 8) return 'is-great';
  if (n >= 7) return 'is-good';
  if (n >= 6) return 'is-mid';
  return 'is-low';
}
