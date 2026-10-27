/**
 * controlesAntiFuite.js — les écarts des CONTRÔLES ANTI-FUITE de la nuit, en mots simples (étape 27 du plan,
 * vérification du branchement, constat 4 : ces alertes durables n'étaient lues par aucun écran).
 * -----------------------------------------------------------------------
 * Cinq alertes durables du serveur (refresh-status.json, GET /api/refresh → `alerts`), posées par l'actualisation
 * (server/src/jobs/matchStatsAutoRefresh.js) et gardées jusqu'à la nuit qui ne trouve plus d'écart :
 *   tableJourJ — la table du jour J (ce que l'appli savait la veille), des lignes recalculées depuis les tables sources ;
 *   forcesButs — les forces de buts du modèle de buts unique, des lignes recalculées par un second chemin ;
 *   fichesJoueurs — les fiches des joueurs (étape 30, 22/10/2026), des joueurs recalculés par un second chemin ;
 *   stylesDeJeu — les styles de jeu (étape 37, 22/10/2026), des clubs recalculés à un jour donné par un second chemin ;
 *   simulationMatchs — les déroulés simulés de la nuit (étape 28, 27/10/2026), les lignes rangées relues : des entrées
 *     modifiées après le tirage, une ligne calculée après le coup d'envoi (vérification du 27/10, constat 14) ; chaque
 *     écart y porte sa phrase (`texte`), dite telle quelle.
 * Valeur : { ecarts (20 au plus), total, lignes, updatedAt }, ou null quand la dernière nuit n'a trouvé aucun écart.
 * Un écart veut dire qu'un chiffre « d'avant le match » a pu voir le match lui-même. Pur : ne lit rien.
 * -----------------------------------------------------------------------
 */

/** Les cinq contrôles, dans l'ordre de la nuit, et leur nom pour Pierre. */
export const CONTROLES_ANTI_FUITE = Object.freeze([
  Object.freeze({ cle: 'tableJourJ', nom: 'Table du jour J (ce que l’appli savait la veille)' }),
  Object.freeze({ cle: 'forcesButs', nom: 'Forces de buts du modèle de buts' }),
  Object.freeze({ cle: 'fichesJoueurs', nom: 'Fiches des joueurs (force du onze)' }),
  Object.freeze({ cle: 'stylesDeJeu', nom: 'Styles de jeu des équipes' }),
  Object.freeze({ cle: 'simulationMatchs', nom: 'Déroulés simulés (lignes de la nuit relues)' })
]);

const entier = (x) => (Number.isFinite(Number(x)) ? Number(x).toLocaleString('fr-FR') : null);
/** « 2026-10-12 » → « 12/10/2026 » ; autre chose rendu tel quel. */
const jourDit = (j) => (typeof j === 'string' && /^\d{4}-\d{2}-\d{2}/.test(j) ? `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}` : String(j ?? '?'));
/** « 2026-10-12T05:00:00Z » → « 12/10/2026 à 07:00 » (heure de Paris). */
function quandDit(iso) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const jour = d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
  const heure = d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  return `${jour} à ${heure}`;
}

/** Un écart en quelques mots : sa phrase s'il en porte une, sinon le club et le jour (forces), le match, le joueur ou le championnat (table du jour J). */
export function ecartDit(e) {
  if (!e || typeof e !== 'object') return null;
  // Un écart qui porte sa phrase (le contrôle des déroulés simulés de l'étape 28) : dite telle quelle.
  if (typeof e.texte === 'string' && e.texte) return e.texte;
  if (e.club !== undefined && e.J) return `club n° ${e.club} avant le ${jourDit(e.J)}`;
  if (e.joueur !== undefined && e.J) return `joueur n° ${e.joueur} avant le ${jourDit(e.J)}`;
  if (e.matchKey) return `match ${e.matchKey}`;
  if (e.joueur !== undefined) return `joueur n° ${e.joueur} le ${jourDit(e.date)}`;
  if (e.league) return `${e.league} le ${jourDit(e.date)}`;
  return null;
}

/**
 * Les contrôles anti-fuite qui ont trouvé des écarts, en une phrase chacun : [{ cle, nom, total, texte }] (vide quand
 * aucun ou quand le serveur ne les connaît pas). Trois exemples au plus, sans doublon (un écart est compté par colonne :
 * un même club et un même jour peuvent en faire plusieurs).
 */
export function controlesAntiFuiteDits(alerts) {
  const out = [];
  for (const { cle, nom } of CONTROLES_ANTI_FUITE) {
    const a = alerts?.[cle];
    const total = Number(a?.total);
    if (!a || !(total > 0)) continue;
    const lignes = entier(a.lignes);
    const quand = quandDit(a.updatedAt);
    const exemples = (Array.isArray(a.ecarts) ? a.ecarts : []).map(ecartDit).filter(Boolean);
    const uniques = [...new Set(exemples)].slice(0, 3);
    const texte =
      `${nom} : ${entier(total)} écart${total > 1 ? 's' : ''}` +
      (lignes !== null ? ` sur ${lignes} ligne${Number(a.lignes) > 1 ? 's' : ''} recalculée${Number(a.lignes) > 1 ? 's' : ''}` : '') +
      (quand ? ` (contrôle du ${quand})` : '') +
      (uniques.length ? ` — par exemple ${uniques.join(' ; ')}` : '') +
      '.';
    out.push({ cle, nom, total, texte });
  }
  return out;
}
