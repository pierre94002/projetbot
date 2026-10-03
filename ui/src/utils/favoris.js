/**
 * favoris.js — reconnaître une équipe ou un championnat favori, et ranger
 * une liste favoris d'abord (03/10/2026, Pierre : « des équipes favorites et
 * des ligues favorites, qui seront toujours affichées en premier par rapport
 * aux autres »).
 *
 * Fonctions pures : le magasin (favoritesStore) leur passe ses index. Une
 * équipe se reconnaît par son identifiant FotMob — c'est lui qui réunit
 * « Leeds United » (bookmakers) et « Leeds » (FotMob), et sépare deux
 * homonymes. Mais demander l'identifiant des centaines de clubs d'une liste
 * coûtait 16 s de calcul au serveur : on ne le demande que pour un nom qui
 * RESSEMBLE à un favori (un de ses noms connus, ou un mot distinctif en
 * commun) — tous les autres sont écartés sans requête.
 */

/**
 * Noms comparés sans casse, sans accents, ponctuation et tirets réduits à des
 * espaces : « Paris Saint-Germain » = « Paris Saint Germain ». Même règle que
 * le serveur (favoritesRepository.js).
 */
export const nomNormalise = (valeur) =>
  String(valeur ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Rang donné aux non-favoris : après tous les favoris, sans dépasser les entiers sûrs. */
export const HORS_FAVORIS = Number.MAX_SAFE_INTEGER;

/** Mots trop courants dans les noms de clubs pour en rapprocher deux. */
const MOTS_COURANTS = new Set([
  'club', 'city', 'united', 'town', 'county', 'rovers', 'wanderers', 'albion', 'athletic', 'athletico', 'atletico', 'atletica',
  'sporting', 'real', 'deportivo', 'deportes', 'olympique', 'olympic', 'olympiacos', 'union', 'racing', 'inter', 'internacional',
  'dynamo', 'dinamo', 'spartak', 'lokomotiv', 'rapid', 'national', 'nacional', 'saint', 'sainte', 'futbol', 'futebol', 'football',
  'clube', 'calcio', 'borussia', 'women', 'reserves', 'academy'
]);

/** Les mots distinctifs d'un nom : quatre lettres au moins, hors mots de club courants. */
export const motsDistinctifs = (nom) =>
  nomNormalise(nom)
    .split(' ')
    .filter((mot) => mot.length >= 4 && !MOTS_COURANTS.has(mot));

/**
 * Les index qui servent à reconnaître vite : identifiants des favoris, noms
 * des favoris enregistrés sans identifiant, tous les noms connus (noms et
 * `aliases` renvoyés par le serveur), leurs mots distinctifs, et le rang de
 * chaque championnat.
 */
export function indexerFavoris({ teams = [], leagues = [] } = {}) {
  const noms = new Set();
  const mots = new Set();
  for (const t of teams) {
    for (const n of [t.name, ...(t.aliases ?? [])]) {
      const cle = nomNormalise(n);
      if (cle) noms.add(cle);
      for (const m of motsDistinctifs(n)) mots.add(m);
    }
  }
  return {
    equipes: teams.length,
    ids: new Set(teams.map((t) => t.id).filter(Boolean)),
    nomsSansId: new Set(teams.filter((t) => !t.id).map((t) => nomNormalise(t.name))),
    noms,
    mots,
    rangLigue: new Map(leagues.map((l, i) => [nomNormalise(l.name), i]))
  };
}

/** Ce nom pourrait-il être celui d'une équipe favorite ? Sans requête : un nom connu, ou un mot distinctif commun. */
export function ressembleAUnFavori(index, nom) {
  if (!index.equipes || !nom) return false;
  return index.noms.has(nomNormalise(nom)) || motsDistinctifs(nom).some((m) => index.mots.has(m));
}

/**
 * Une équipe est-elle favorite ? `id` : son identifiant FotMob s'il est
 * connu, null s'il est inconnu du magasin, undefined s'il est encore en
 * route — on décide alors, provisoirement, par ses noms connus.
 */
export function estEquipeFavorite(index, nom, id) {
  if (!index.equipes || !nom) return false;
  const cle = nomNormalise(nom);
  if (id) return index.ids.has(id) || index.nomsSansId.has(cle);
  return index.noms.has(cle);
}

/** Le rang d'un championnat favori (0, 1, …), ou HORS_FAVORIS. */
export function rangLigue(index, ligue) {
  return index.rangLigue.get(nomNormalise(ligue)) ?? HORS_FAVORIS;
}

/**
 * Range des éléments favoris d'abord, sans rien perdre ni dupliquer :
 * 1. ceux qui touchent une équipe favorite (`aUneEquipeFavorite(element)`) ;
 * 2. ceux d'un championnat favori, dans l'ordre des favoris ;
 * 3. tout le reste.
 * L'ordre d'origine est gardé à l'intérieur de chaque bloc (tri stable).
 */
export function favorisDabord(elements, { ligue = () => null, aUneEquipeFavorite = () => false } = {}, index) {
  const cle = (element) => (aUneEquipeFavorite(element) ? -1 : rangLigue(index, ligue(element)));
  return elements
    .map((element, position) => ({ element, position, rang: cle(element) }))
    .sort((a, b) => (a.rang === b.rang ? a.position - b.position : a.rang < b.rang ? -1 : 1))
    .map((x) => x.element);
}
