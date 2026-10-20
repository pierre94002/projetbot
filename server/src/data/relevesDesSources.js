/**
 * relevesDesSources.js — ce que chaque source a dit lors de son DERNIER VRAI APPEL.
 * -----------------------------------------------------------------------
 * Étape 14 du plan (07/10/2026), « santé des sources ». La règle : on ne
 * questionne JAMAIS une source pour savoir si elle va bien. On note ce
 * qu'elle a répondu quand l'appli l'a vraiment appelée, et l'état se lit
 * dans ces notes (sourceHealth.js).
 *
 *   FotMob        chaque réponse que l'appli reçoit déjà (liste du jour,
 *                 feuille de match, page de compétition, d'équipe, de
 *                 joueur) passe par fetchJson (fotMobProvider.js), qui la
 *                 note ici : réussie ou non (accès refusé, limite, serveur,
 *                 réponse illisible, réseau), et sa FORME — les champs que
 *                 l'appli lit sont-ils là ? Gardé en mémoire (des milliers
 *                 de réponses par jour : rien n'est écrit à chaque fois),
 *                 enregistré à la fin de chaque passe d'actualisation
 *                 (étape « controleQuotidien ») dans data/runtime/sante-fotmob.json.
 *                 Depuis le 07/10/2026 (lot 3), le TEXTE MINUTE PAR MINUTE que lit
 *                 la revue d'après-match (providers/fotMobCommentaire.js, chez
 *                 data.fotmob.com : un autre serveur de FotMob) est noté de même,
 *                 sous la sorte « commentaire », sans requête de plus — mais À
 *                 PART : ni les totaux, ni la série d'échecs, ni la dernière
 *                 réussite ou erreur de FotMob n'en tiennent compte (« en panne »
 *                 dit que les résultats et les compositions ne se mettent plus à
 *                 jour). Il a sa propre série d'échecs, et un 403 y dit « ce fichier
 *                 n'existe pas dans cette langue » : compté à part (`absentes`),
 *                 jamais une panne.
 *   API-Football  chaque appel réel (repli payant, au clic seulement) note
 *                 l'heure, le statut et les en-têtes du compteur que la source
 *                 renvoie (x-ratelimit-requests-limit / -remaining : le
 *                 quota du jour) dans data/runtime/compteur-api-football.json,
 *                 avec le nombre d'appels du jour. Jamais la clé, jamais
 *                 l'adresse complète : le chemin seul.
 * The Odds API, football-data, Claude et les cotes gratuites ont déjà leurs
 * notes (relevé payant, fd_fichiers, journal des appels Claude, bilan des
 * passes) : sourceHealth.js les lit là où elles sont.
 *
 * Module FEUILLE : il n'importe rien de l'appli à part atomicJson.js, pour
 * que fotMobProvider.js et apiFootballClient.js puissent l'importer sans
 * boucle d'imports. Une note ratée ne fait JAMAIS échouer l'appel noté.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.resolve(__dirname, '../../data/runtime');
export const FICHIER_SANTE_FOTMOB = path.join(RUNTIME, 'sante-fotmob.json');
export const FICHIER_COMPTEUR_API_FOOTBALL = path.join(RUNTIME, 'compteur-api-football.json');
export const VERSION_RELEVES = 1;

/** Erreurs de suite au-delà desquelles FotMob est dit « en panne » (la règle de la boucle du direct, étape E). */
export const ERREURS_DE_SUITE_PANNE = 5;

/** Fichiers du texte minute par minute en échec de suite (hors langue absente) à partir desquels la ligne FotMob est « à surveiller » — jamais « en panne ». */
export const ERREURS_DE_SUITE_COMMENTAIRE = 3;

// =================================================================== FotMob

/** Les sortes de réponse FotMob, reconnues au chemin de l'adresse. */
export const TYPES_FOTMOB = Object.freeze({
  'liste-du-jour': 'Liste du jour',
  'feuille-de-match': 'Feuille de match',
  competition: 'Page de compétition (classement, calendrier)',
  equipe: "Page d'équipe",
  joueur: 'Page de joueur',
  commentaire: 'Texte minute par minute',
  autre: 'Autre page'
});

/** La sorte d'une adresse FotMob : `/api/data/matches?date=` → « liste-du-jour »… */
export function typeDeRequeteFotmob(url) {
  let chemin = '';
  try {
    chemin = new URL(String(url)).pathname;
  } catch {
    chemin = String(url ?? '');
  }
  if (/\/matchDetails$/i.test(chemin)) return 'feuille-de-match';
  if (/\/matches$/i.test(chemin)) return 'liste-du-jour';
  if (/\/leagues$/i.test(chemin)) return 'competition';
  if (/\/teams$/i.test(chemin)) return 'equipe';
  if (/\/playerData$/i.test(chemin)) return 'joueur';
  // Les fichiers du texte minute par minute : data.fotmob.com/webcl/ltc/gsm/<match>_<langue>.json.gz
  if (/\/webcl\/ltc\/gsm\/[^/]+$/i.test(chemin)) return 'commentaire';
  return 'autre';
}

const estObjet = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/**
 * LA FORME ATTENDUE d'une réponse FotMob : les champs que fotMobProvider.js
 * lit vraiment. Rend la liste des champs absents ([] : forme attendue). Une
 * forme qui change (champ renommé, déplacé) se voit ici avant de se voir dans
 * les données : des matchs sans identifiant, des feuilles sans statistiques.
 */
export function champsManquantsFotmob(type, payload) {
  if (!estObjet(payload)) return ['réponse qui n’est pas un objet JSON'];
  const manques = [];
  if (type === 'liste-du-jour') {
    if (!Array.isArray(payload.leagues)) return ['leagues'];
    let sansMatchs = 0;
    const parChamp = { id: 0, 'home.id': 0, 'away.id': 0, 'status.utcTime': 0 };
    for (const ligue of payload.leagues) {
      if (!Array.isArray(ligue?.matches)) {
        sansMatchs++;
        continue;
      }
      for (const m of ligue.matches) {
        if (m?.id === undefined || m?.id === null) parChamp.id++;
        if (m?.home?.id === undefined || m?.home?.id === null) parChamp['home.id']++;
        if (m?.away?.id === undefined || m?.away?.id === null) parChamp['away.id']++;
        if (!m?.status?.utcTime) parChamp['status.utcTime']++;
      }
    }
    if (sansMatchs) manques.push('leagues[].matches');
    for (const [champ, n] of Object.entries(parChamp)) if (n) manques.push(`leagues[].matches[].${champ}`);
    return manques;
  }
  if (type === 'feuille-de-match') {
    // Une feuille SANS statistiques existe (couverture réduite, `noSheet`) : seuls
    // les blocs que toute page de match a sont exigés.
    if (!estObjet(payload.general)) manques.push('general');
    else {
      if (payload.general.homeTeam?.id === undefined || payload.general.homeTeam?.id === null) manques.push('general.homeTeam.id');
      if (payload.general.awayTeam?.id === undefined || payload.general.awayTeam?.id === null) manques.push('general.awayTeam.id');
    }
    if (!estObjet(payload.header?.status)) manques.push('header.status');
    if (!estObjet(payload.content)) manques.push('content');
    return manques;
  }
  if (type === 'competition') {
    if (!estObjet(payload.details)) manques.push('details');
    if (!Array.isArray(payload.table) && !estObjet(payload.fixtures)) manques.push('table ou fixtures');
    return manques;
  }
  if (type === 'equipe') {
    if (!estObjet(payload.squad)) manques.push('squad');
    return manques;
  }
  if (type === 'commentaire') {
    // L'enveloppe du texte : { Events: [{ IncidentCode, Elapsed, Description, … }] } (providers/fotMobCommentaire.js).
    if (!Array.isArray(payload.Events)) manques.push('Events');
    return manques;
  }
  return manques;
}

/** La nature d'un échec, en mots simples : accès refusé, limite, serveur, réponse illisible, réseau. */
export function natureDeLErreurFotmob({ statut = null, erreur = null } = {}) {
  const message = String(erreur?.message ?? erreur ?? '');
  const code = Number(statut ?? message.match(/HTTP (\d{3})/)?.[1]);
  if (code === 401 || code === 403) return 'acces-refuse';
  if (code === 429) return 'limite';
  if (code >= 500) return 'serveur';
  if (code === 404) return 'introuvable';
  if (Number.isFinite(code) && code >= 400) return 'refus';
  if (erreur?.name === 'SyntaxError' || /JSON|Unexpected token|not valid JSON/i.test(message)) return 'illisible';
  if (erreur?.name === 'AbortError' || /abort|timeout|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|socket|network/i.test(message)) return 'reseau';
  return 'autre';
}

export const NATURES_ERREUR_FOTMOB = Object.freeze({
  'acces-refuse': 'accès refusé (401/403) : FotMob refuse l’appli',
  limite: 'trop de requêtes (429)',
  serveur: 'serveur FotMob en panne (5xx)',
  introuvable: 'page introuvable (404)',
  refus: 'requête refusée',
  illisible: 'réponse illisible (pas du JSON : page de contrôle ou de maintenance ?)',
  reseau: 'pas de réponse (réseau, délai dépassé)',
  autre: 'échec'
});

const neuf = () => ({ depuis: new Date().toISOString(), requetes: 0, reussites: 0, echecs: 0, erreursDeSuite: 0, derniereReussite: null, derniereErreur: null, parType: {} });
let suivi = neuf();

function typeVide() {
  // `derniereForme` : la forme de la DERNIÈRE réponse lue de cette sorte ({ le, attendue, manques }) ; `erreursDeSuite` : la série
  // d'échecs de cette sorte seule ; `absentes` : les réponses « ce fichier n'existe pas » attendues (le texte minute par minute), ni réussies ni en échec.
  return { requetes: 0, reussites: 0, echecs: 0, absentes: 0, erreursDeSuite: 0, formeInattendue: 0, derniereReussite: null, derniereErreur: null, derniereAbsence: null, derniereForme: null, derniereFormeInattendue: null, manques: {} };
}

/**
 * Note UNE réponse FotMob (après les nouvelles tentatives de fetchJson : la
 * requête telle que l'appelant la voit). `payload` : le JSON lu, pour en
 * vérifier la forme. Ne lève jamais.
 *
 * Le texte minute par minute (sorte « commentaire », lu pour la revue
 * d'après-match chez data.fotmob.com) est noté par le même chemin, mais À
 * PART : ni les totaux de FotMob, ni sa série d'échecs, ni sa dernière
 * réussite ou erreur n'en tiennent compte — ce que lit l'étape 46 reste celui
 * de l'API : une panne du seul texte ne doit pas dire que les résultats et les
 * compositions ne se mettent plus à jour. Un 403 y dit « ce fichier n'existe
 * pas dans cette langue » : une réponse ATTENDUE, comptée à part (`absentes`),
 * ni réussite ni échec, qui ne touche aucune série.
 */
export function noterReponseFotmob({ url, ok, statut = null, erreur = null, payload = undefined, maintenant = Date.now() }) {
  try {
    const le = new Date(maintenant).toISOString();
    const type = typeDeRequeteFotmob(url);
    const t = (suivi.parType[type] ??= typeVide());
    if (!ok && type === 'commentaire' && Number(statut) === 403) {
      t.absentes = (t.absentes ?? 0) + 1;
      t.derniereAbsence = le;
      return;
    }
    // Le texte est noté À PART : ni les totaux de FotMob, ni sa série d'échecs, ni sa dernière réussite ou erreur n'en tiennent compte.
    const annexe = type === 'commentaire';
    if (!annexe) suivi.requetes++;
    t.requetes++;
    if (ok) {
      if (!annexe) {
        suivi.reussites++;
        suivi.erreursDeSuite = 0;
        suivi.derniereReussite = le;
      }
      t.reussites++;
      t.erreursDeSuite = 0;
      t.derniereReussite = le;
      if (payload !== undefined) {
        const manques = champsManquantsFotmob(type, payload);
        t.derniereForme = { le, attendue: manques.length === 0, manques: manques.slice(0, 6) };
        if (manques.length) {
          t.formeInattendue++;
          t.derniereFormeInattendue = { le, manques: manques.slice(0, 6) };
          for (const m of manques) t.manques[m] = (t.manques[m] ?? 0) + 1;
        }
      }
    } else {
      const nature = natureDeLErreurFotmob({ statut, erreur });
      const e = { le, type, nature, statut: statut ?? null, message: String(erreur?.message ?? erreur ?? '').slice(0, 160) };
      if (!annexe) {
        suivi.echecs++;
        suivi.erreursDeSuite++;
        suivi.derniereErreur = e;
      }
      t.echecs++;
      t.erreursDeSuite = (t.erreursDeSuite ?? 0) + 1;
      t.derniereErreur = e;
    }
  } catch {
    // Une note ratée ne doit jamais toucher l'appel noté.
  }
}

/** Le suivi tenu en mémoire depuis le démarrage du serveur (une copie). */
export function suiviFotmobEnMemoire() {
  return JSON.parse(JSON.stringify(suivi));
}

/** Le dernier suivi enregistré (fin de la passe précédente), ou null. Ne lève jamais. */
export function lireSuiviFotmobEnregistre({ fichier = FICHIER_SANTE_FOTMOB } = {}) {
  try {
    const lu = readJsonFile(fichier, null);
    return lu && typeof lu === 'object' && !Array.isArray(lu) ? lu : null;
  } catch {
    return null;
  }
}

const plusRecent = (a, b) => (!a ? b ?? null : !b ? a : a > b ? a : b);

/**
 * Enregistre le suivi (fin de passe) : celui de la mémoire, avec la dernière
 * réussite connue même d'avant un redémarrage. Rend { ecrit, fichier, erreur? }.
 */
export function enregistrerSuiviFotmob({ fichier = FICHIER_SANTE_FOTMOB, maintenant = Date.now() } = {}) {
  const avant = lireSuiviFotmobEnregistre({ fichier });
  const s = suiviFotmobEnMemoire();
  const etat = {
    version: VERSION_RELEVES,
    enregistreLe: new Date(maintenant).toISOString(),
    pid: process.pid,
    ...s,
    derniereReussite: plusRecent(s.derniereReussite, avant?.derniereReussite ?? null),
    // La dernière erreur connue, même d'un serveur précédent, tant qu'aucune n'est plus récente.
    derniereErreur: s.derniereErreur ?? avant?.derniereErreur ?? null
  };
  try {
    writeJsonAtomic(fichier, etat);
    return { ecrit: true, fichier };
  } catch (error) {
    return { ecrit: false, fichier, erreur: error.message };
  }
}

// =============================================================== API-Football

/** Plan gratuit d'API-Football : 100 requêtes par jour. */
export const QUOTA_JOUR_API_FOOTBALL = 100;
const JOURS_GARDES = 14;
/** Le jour du compteur : API-Football compte par jour UTC. */
const jourUtc = (t) => new Date(t).toISOString().slice(0, 10);

const entier = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

/** Le compteur enregistré, ou un compteur vide. Lève si le fichier est illisible (jamais pris pour vide). */
export function lireCompteurApiFootball({ fichier = FICHIER_COMPTEUR_API_FOOTBALL } = {}) {
  const lu = readJsonFile(fichier, null);
  if (!lu) return { version: VERSION_RELEVES, jours: {}, dernier: null, existe: false };
  return { version: lu.version ?? VERSION_RELEVES, jours: lu.jours && typeof lu.jours === 'object' ? lu.jours : {}, dernier: lu.dernier ?? null, existe: true };
}

/**
 * Note un appel RÉEL à API-Football (apiFootballClient.js) : l'heure, le
 * statut, le chemin (sans paramètres ni clé) et le compteur que renvoie la
 * source. `entetes` : la fonction `get` des en-têtes de la réponse (ou null
 * si la requête n'a pas eu de réponse). Ne lève jamais ; rend { ecrit }.
 */
export function noterAppelApiFootball({ chemin = null, ok = false, statut = null, entetes = null, erreur = null, maintenant = Date.now(), fichier = FICHIER_COMPTEUR_API_FOOTBALL }) {
  try {
    const lire = (nom) => {
      try {
        return typeof entetes === 'function' ? entetes(nom) : entetes?.get?.(nom) ?? null;
      } catch {
        return null;
      }
    };
    const le = new Date(maintenant).toISOString();
    const c = lireCompteurApiFootball({ fichier });
    const jour = jourUtc(maintenant);
    const j = (c.jours[jour] ??= { appels: 0, echecs: 0, premier: le, dernier: null });
    j.appels++;
    if (!ok) j.echecs++;
    j.dernier = le;
    c.dernier = {
      le,
      jour,
      ok: Boolean(ok),
      statut: statut ?? null,
      // Seul le chemin (« /fixtures ») : jamais l'adresse avec ses paramètres, jamais la clé (elle est dans un en-tête).
      chemin: chemin ? String(chemin).split('?')[0].slice(0, 60) : null,
      limiteJour: entier(lire('x-ratelimit-requests-limit')),
      restantJour: entier(lire('x-ratelimit-requests-remaining')),
      erreur: erreur ? String(erreur?.message ?? erreur).replace(/[A-Za-z0-9_-]{24,}/g, '…').slice(0, 160) : null
    };
    const garder = Object.keys(c.jours).sort().slice(-JOURS_GARDES);
    c.jours = Object.fromEntries(garder.map((k) => [k, c.jours[k]]));
    writeJsonAtomic(fichier, { version: VERSION_RELEVES, jours: c.jours, dernier: c.dernier });
    return { ecrit: true };
  } catch (error) {
    return { ecrit: false, erreur: error.message };
  }
}

/** Pour les tests : repartir d'un suivi FotMob vide. */
export const __testing = {
  viderSuiviFotmob() {
    suivi = neuf();
  },
  existe: (fichier) => fs.existsSync(fichier)
};
