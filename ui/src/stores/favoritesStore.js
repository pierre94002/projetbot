import { defineStore } from 'pinia';
import { favoritesApi } from '@/services/favoritesApi.js';
import { useToastStore } from '@/stores/toastStore.js';
import { teamIdFor, teamIdForAsync } from '@/utils/teamIds.js';
import { indexerFavoris, estEquipeFavorite, ressembleAUnFavori, rangLigue, favorisDabord, nomNormalise, HORS_FAVORIS } from '@/utils/favoris.js';
import { parseLeagueLabel } from '@/utils/leagueDisplay.js';

/**
 * Les équipes et championnats favoris de Pierre (03/10/2026 : « toujours
 * affichés en premier par rapport aux autres »), enregistrés par le serveur
 * (data/runtime/favorites.json) et chargés au démarrage (AppShell) — avec de
 * nouvelles tentatives si le serveur démarre après l'interface.
 *
 * Lectures (isFavoriteTeam, favoritesFirst…) : des getters qui renvoient une
 * fonction, appelés des milliers de fois par les listes. Une équipe n'est
 * comparée par identifiant que si son nom ressemble à un favori : les autres
 * sont écartées sans rien demander au serveur.
 *
 * Écritures : l'identifiant du club est attendu avant de décider (sinon un
 * clic rapide enregistrait l'équipe par son seul nom) ; l'étoile change tout
 * de suite à l'écran ; seule la réponse de la DERNIÈRE demande s'applique ;
 * en cas d'échec, l'état réel est relu sur le serveur et une alerte dit
 * pourquoi.
 */

const ID_FOTMOB = /^fotmob-\d+$/;
const idValide = (id) => typeof id === 'string' && ID_FOTMOB.test(id);

/** Même équipe : même identifiant quand les deux en ont un, sinon même nom (règle du serveur). */
const memeEquipe = (a, b) => (a.id && b.id ? a.id === b.id : nomNormalise(a.name) === nomNormalise(b.name));

/** L'identifiant du club, attendu s'il est en route ; null s'il est inconnu. */
async function idAttendu(name, league, id) {
  if (idValide(id)) return id;
  return (await teamIdForAsync(name, league)) ?? null;
}

export const useFavoritesStore = defineStore('favorites', {
  state: () => ({
    teams: [], // [{ id, name, league, addedAt, aliases }] dans l'ordre d'ajout
    leagues: [], // [{ name, addedAt }]
    loaded: false,
    error: null,
    sequence: 0 // numéro de la dernière demande d'écriture partie
  }),
  getters: {
    index: (state) => indexerFavoris(state),
    hasFavorites: (state) => state.teams.length > 0 || state.leagues.length > 0,

    /** (nom, championnat, identifiant?) → l'identifiant donné s'il est valide, sinon celui du cache (undefined en route). */
    idOf() {
      return (name, league = null, id = undefined) => (idValide(id) ? id : teamIdFor(name, league));
    },

    /** (nom, championnat, identifiant?) → favorite ? Sans requête pour un nom qui ne ressemble à aucun favori. */
    isFavoriteTeam() {
      return (name, league = null, id = undefined) => {
        const index = this.index;
        if (!index.equipes || !name) return false;
        if (idValide(id) && index.ids.has(id)) return true;
        if (!ressembleAUnFavori(index, name)) return false;
        return estEquipeFavorite(index, name, this.idOf(name, league, id));
      };
    },

    isFavoriteLeague() {
      return (name) => rangLigue(this.index, name) !== HORS_FAVORIS;
    },

    leagueRank() {
      return (name) => rangLigue(this.index, name);
    },

    /**
     * (liste, { league, teams }) → la liste favoris d'abord : éléments qui
     * touchent une équipe favorite, puis championnats favoris dans l'ordre des
     * favoris, puis le reste (ordre d'origine gardé dans chaque bloc).
     * `league(element)` : son championnat ; `teams(element)` : ses équipes, en
     * [nom, championnat, identifiant?].
     */
    favoritesFirst() {
      return (elements, { league = () => null, teams = () => [] } = {}) => {
        if (!this.hasFavorites) return elements;
        const avecEquipes = this.index.equipes > 0;
        const aUneEquipeFavorite = (element) => avecEquipes && teams(element).some(([nom, ligue, id]) => this.isFavoriteTeam(nom, ligue, id));
        return favorisDabord(elements, { ligue: league, aUneEquipeFavorite }, this.index);
      };
    }
  },
  actions: {
    async fetch({ tentative = 0 } = {}) {
      try {
        const { teams, leagues } = await favoritesApi.list();
        this.teams = teams ?? [];
        this.leagues = leagues ?? [];
        this.error = null;
      } catch (error) {
        this.error = error.message;
        // Serveur pas encore démarré (le .bat lance l'interface en même temps)
        // ou fichier tenu par OneDrive : on réessaie, de plus en plus espacé.
        if (tentative < 6) setTimeout(() => this.fetch({ tentative: tentative + 1 }), Math.min(30_000, 2_000 * 2 ** tentative));
      } finally {
        this.loaded = true;
      }
    },

    /** Applique la réponse du serveur si elle répond à la dernière demande partie. */
    appliquer(numero, reponse) {
      if (numero !== this.sequence) return;
      this.teams = reponse.teams ?? [];
      this.leagues = reponse.leagues ?? [];
      this.error = null;
    },

    async setTeam({ name, league = null, id = undefined }, favorite) {
      if (!name) return;
      const equipe = { id: await idAttendu(name, league, id), name, league };
      this.teams = favorite
        ? this.teams.some((t) => memeEquipe(t, equipe))
          ? this.teams
          : [...this.teams, { ...equipe, addedAt: new Date().toISOString(), aliases: [] }]
        : this.teams.filter((t) => !memeEquipe(t, equipe));
      const numero = ++this.sequence;
      try {
        this.appliquer(numero, await favoritesApi.setTeam(equipe, favorite));
        useToastStore().success(favorite ? `${name} : ajoutée à vos équipes favorites.` : `${name} : retirée de vos favoris.`);
      } catch (error) {
        useToastStore().error(`Favori non enregistré : ${error.message}`);
        await this.fetch(); // L'état réel du serveur, plutôt qu'un instantané devenu faux.
      }
    },

    async toggleTeam({ name, league = null, id = undefined }) {
      if (!name) return;
      const connu = await idAttendu(name, league, id);
      return this.setTeam({ name, league, id: connu }, !this.isFavoriteTeam(name, league, connu ?? undefined));
    },

    async setLeague(name, favorite) {
      if (!name) return;
      const cle = nomNormalise(name);
      this.leagues = favorite
        ? this.leagues.some((l) => nomNormalise(l.name) === cle)
          ? this.leagues
          : [...this.leagues, { name, addedAt: new Date().toISOString() }]
        : this.leagues.filter((l) => nomNormalise(l.name) !== cle);
      const numero = ++this.sequence;
      const court = parseLeagueLabel(name).name || name;
      try {
        this.appliquer(numero, await favoritesApi.setLeague(name, favorite));
        useToastStore().success(favorite ? `${court} : ajouté à vos championnats favoris.` : `${court} : retiré de vos favoris.`);
      } catch (error) {
        useToastStore().error(`Favori non enregistré : ${error.message}`);
        await this.fetch();
      }
    },

    toggleLeague(name) {
      return this.setLeague(name, !this.isFavoriteLeague(name));
    }
  }
});
