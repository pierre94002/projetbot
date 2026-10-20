/**
 * fotMobCommentaire.js — le TEXTE MINUTE PAR MINUTE de FotMob (étape 43 du
 * plan, 07/10/2026), lu pour la revue d'après-match de l'IA.
 * -----------------------------------------------------------------------
 * POINT D'ENTRÉE (vérifié le 07/10/2026 sur 5 matchs de 4 championnats) : ce
 * n'est PAS la page du match (matchDetails ne porte que `content.liveticker`
 * = { langs: « de_gen,en_gen,… », teams }) mais un fichier statique du CDN de
 * FotMob, un par langue :
 *
 *     https://data.fotmob.com/webcl/ltc/gsm/<identifiant du match>_<langue>.json.gz
 *
 * <langue> est l'une de celles de `langs` : la langue d'origine telle quelle
 * (« en » pour un match américain, « de » pour un match allemand), les
 * traductions automatiques suffixées « _gen » (« en_gen », « fr_gen »…). Un
 * fichier qui n'existe pas répond 403 (AccessDenied) : « en » n'existe pas
 * pour un match dont le texte est écrit en allemand, « en_gen » si. Gratuit,
 * sans clé, comme le reste de FotMob ; un seul GET par fichier (≈ 50-70 Ko
 * compressés), jamais plus de trois par revue.
 *
 * DEUX FORMES DE TEXTE selon le match, même enveloppe
 * { Events: [{ IncidentCode, Elapsed, ElapsedPlus, Description, … }] }, du plus
 * récent au plus ancien :
 *   - un commentaire de rédaction (MLS, Ligue des champions…) : phrases
 *     longues (jusqu'à 500 caractères), « highlight » (grosses occasions,
 *     poteaux), « var » (revues VAR), cartons, buts, résumés avant/après match ;
 *   - un fil de faits automatique (Liga MX, Bundesliga, Argentine…, au format
 *     des données Opta) : phrases courtes, ~100 à 140 lignes par match
 *     (fautes, corners, tirs, hors-jeu…), dont « contentious referee
 *     decisions » (décisions VAR : « VAR Decision: Goal León 1-0 Juárez »),
 *     « penalty lost » (« Penalty conceded by X (équipe) with a handball… »),
 *     « start delay » (« Delay in match because of an injury X (équipe) »).
 * Entier, un match pèse de 3 000 à 7 000 tokens (11 000 à 23 000 caractères de
 * texte selon la forme) : bien au-delà de ce qu'une revue peut recevoir. On
 * n'en retient donc que ce que les événements du magasin ne disent pas et qui
 * explique un marché — les décisions VAR, les penalties concédés (et
 * pourquoi), les arrêts de jeu pour blessure, les grosses occasions et poteaux
 * de la rédaction — au plus MAX_MOMENTS (5) lignes de LARGEUR_MAX (130)
 * caractères : ≈ 100 à 300 tokens, pour que la revue entière ne dépasse pas
 * d'environ 2 000 tokens celle d'avant l'étape. Buts, cartons et remplacements
 * sont déjà dans le déroulé : jamais répétés ici.
 *
 * Rien ne casse : toute erreur (réseau, 403, fichier illisible, forme
 * inattendue) rend « pas de texte », jamais une exception ; la revue se fait
 * alors sans cette section, comme avant l'étape.
 *
 * SANTÉ DES SOURCES (07/10/2026, lot 3) : chaque réponse est NOTÉE comme celles
 * du reste de FotMob (data/relevesDesSources.js, sorte « commentaire » : lue,
 * en échec, ou de forme inattendue) — sans une requête de plus, la note se fait
 * sur la réponse que cette lecture reçoit déjà. Un 403 y est compté à part
 * (« ce fichier n'existe pas dans cette langue » : attendu, jamais une panne).
 * -----------------------------------------------------------------------
 */

import zlib from 'node:zlib';
import { noterReponseFotmob } from '../relevesDesSources.js';

export const BASE_COMMENTAIRE = 'https://data.fotmob.com/webcl/ltc/gsm';
/** Les langues essayées quand le match ne dit pas lesquelles existent (matchs d'avant l'étape 43). */
export const LANGUES_SANS_LISTE = Object.freeze(['en', 'en_gen']);
/** Dans l'ordre où on les préfère : l'anglais d'abord (le moins de tokens), puis le français. */
const LANGUES_PREFEREES = Object.freeze(['en', 'en_gen', 'fr', 'fr_gen']);

export const MAX_MOMENTS = 5;
export const LARGEUR_MAX = 130;
const ESSAIS_MAX = 3;
const DELAI_MS = 8000;
// Le même en-tête que le lecteur des pages FotMob (fotMobProvider.js) : c'est avec lui que le point d'entrée a été vérifié.
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

const uneLigne = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Les langues à essayer, dans l'ordre. `langs` : ce que FotMob annonce pour le
 * match (`meta.tickerLangs`, « de,en_gen,es_gen »). Chaîne vide : pas de texte
 * pour ce match, rien à essayer. Absent (null) : inconnu, « en » puis « en_gen ».
 */
export function languesDuCommentaire(langs) {
  if (langs === null || langs === undefined) return [...LANGUES_SANS_LISTE];
  const liste = String(langs).split(',').map((l) => l.trim()).filter(Boolean);
  const preferees = LANGUES_PREFEREES.filter((l) => liste.includes(l));
  return [...preferees, ...liste.filter((l) => !preferees.includes(l))].slice(0, ESSAIS_MAX);
}

export const urlDuCommentaire = (matchId, langue) => `${BASE_COMMENTAIRE}/${matchId}_${langue}.json.gz`;

async function corpsJson(reponse) {
  if (typeof reponse.arrayBuffer === 'function') {
    const tampon = Buffer.from(await reponse.arrayBuffer());
    let brut = tampon;
    if (tampon.length > 2 && tampon[0] === 0x1f && tampon[1] === 0x8b) {
      try {
        brut = zlib.gunzipSync(tampon);
      } catch (error) {
        // Un fichier compressé abîmé est « illisible », comme du JSON qui n'en est pas (c'est ainsi que la santé des sources le note).
        throw new SyntaxError(`fichier compressé illisible (${error.message})`);
      }
    }
    return JSON.parse(brut.toString('utf8'));
  }
  return reponse.json();
}

/**
 * Le texte d'un match chez FotMob : { langue, evenements } ou null. Essaie
 * chaque langue à son tour (une seule requête quand la première existe) ;
 * n'attend jamais plus de `delaiMs` une réponse, ne relance rien, ne lève
 * jamais d'exception.
 */
export async function lireCommentaire(matchId, { langues = null, fetchImpl = (...a) => globalThis.fetch(...a), delaiMs = DELAI_MS } = {}) {
  const id = String(matchId ?? '').trim();
  if (!/^\d{1,12}$/.test(id)) return null;
  const aEssayer = Array.isArray(langues) ? langues.slice(0, ESSAIS_MAX) : languesDuCommentaire(null);
  for (const langue of aEssayer) {
    const url = urlDuCommentaire(id, langue);
    const controle = new AbortController();
    let minuteur;
    // Le délai coupe aussi un `fetch` qui n'honore pas le signal d'arrêt : la revue n'attend jamais plus que ça.
    const delai = new Promise((_, rejet) => {
      minuteur = setTimeout(() => {
        controle.abort();
        // « AbortError » : la santé des sources le range parmi les « pas de réponse (réseau, délai dépassé) ».
        rejet(Object.assign(new Error(`délai dépassé (${delaiMs} ms)`), { name: 'AbortError' }));
      }, delaiMs);
    });
    delai.catch(() => {});
    let statut = null;
    try {
      const envoi = Promise.resolve().then(() => fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: '*/*' }, signal: controle.signal }));
      envoi.catch(() => {}); // une réponse qui arrive après le délai ne doit jamais devenir une erreur non gérée
      const reponse = await Promise.race([envoi, delai]);
      statut = reponse?.status ?? null;
      if (!reponse?.ok) {
        // Noté sur la réponse reçue, sans requête de plus. Un 403 : ce fichier n'existe pas dans cette langue — attendu, jamais une panne.
        noterReponseFotmob({ url, ok: false, statut, erreur: new Error(`HTTP ${statut ?? 'sans statut'}`) });
        continue;
      }
      const lecture = corpsJson(reponse);
      lecture.catch(() => {});
      const json = await Promise.race([lecture, delai]);
      noterReponseFotmob({ url, ok: true, payload: json });
      if (Array.isArray(json?.Events)) return { langue, evenements: json.Events };
    } catch (error) {
      // réseau, délai, fichier illisible : noté, puis on passe à la langue suivante, puis à « pas de texte »
      noterReponseFotmob({ url, ok: false, statut, erreur: error });
    } finally {
      clearTimeout(minuteur);
    }
  }
  return null;
}

/** Un texte raccourci à `largeur` caractères, à la fin d'un mot. */
function abreger(texte, largeur) {
  if (texte.length <= largeur) return texte;
  const coupe = texte.slice(0, largeur - 1);
  const espace = coupe.lastIndexOf(' ');
  return `${(espace > largeur * 0.6 ? coupe.slice(0, espace) : coupe).replace(/[\s,;:.\-–—]+$/, '')}…`;
}

/**
 * Ce que le texte apporte de plus que les événements, par ordre d'intérêt
 * (1 = le plus utile), ou null si la ligne ne sert pas à la revue :
 *   1  décision VAR (« var », « contentious referee decisions »)
 *   2  penalty concédé, et pourquoi (« penalty lost »)
 *   3  arrêt de jeu pour blessure (« start delay » qui parle de blessure)
 *   4  grosse occasion ou poteau noté par la rédaction (« highlight »)
 *   5  tir sur le poteau (« post »)
 * Jamais : buts, cartons, remplacements (déjà dans le déroulé), faits courants
 * (fautes, corners, hors-jeu, tirs), compositions et résumés (Elapsed 0).
 */
function interet(e) {
  if (!e || !(Number(e.Elapsed) >= 1)) return null; // pas de minute (compositions, résumés : 0) ou illisible
  const code = String(e.IncidentCode ?? '').trim().toLowerCase();
  const texte = uneLigne(e.Description);
  if (!texte) return null;
  if (code === 'var' || code === 'contentious referee decisions') return 1;
  if (code === 'penalty lost') return 2;
  if (code === 'start delay') return /injur/i.test(texte) ? 3 : null;
  if (code === 'highlight') return 4;
  if (code === 'post') return 5;
  return null;
}

/**
 * Les moments à donner à l'IA : { minute, plus, code, texte }, dans l'ordre du
 * jeu, au plus `max`. S'il y en a trop, ceux de plus d'intérêt d'abord, puis
 * les plus anciens.
 */
export function momentsDuCommentaire(commentaire, { max = MAX_MOMENTS, largeur = LARGEUR_MAX } = {}) {
  const evenements = Array.isArray(commentaire?.evenements) ? commentaire.evenements : Array.isArray(commentaire?.Events) ? commentaire.Events : [];
  const candidats = [];
  evenements.forEach((e, rang) => {
    const p = interet(e);
    if (p === null) return;
    const plus = Number(e.ElapsedPlus) > 0 ? Number(e.ElapsedPlus) : null;
    candidats.push({ p, rang, minute: Number(e.Elapsed), plus, code: String(e.IncidentCode).trim().toLowerCase(), texte: abreger(uneLigne(e.Description), largeur) });
  });
  const dansLOrdre = (a, b) => a.minute - b.minute || (a.plus ?? 0) - (b.plus ?? 0) || b.rang - a.rang;
  const vus = new Set();
  return candidats
    .sort((a, b) => a.p - b.p || dansLOrdre(a, b))
    .filter((c) => {
      const cle = `${c.minute}|${c.plus}|${c.texte}`;
      if (vus.has(cle)) return false;
      vus.add(cle);
      return true;
    })
    .slice(0, Math.max(0, max))
    .sort(dansLOrdre)
    .map(({ minute, plus, code, texte }) => ({ minute, plus, code, texte }));
}

/**
 * Le texte retenu d'un match : lit puis filtre. `reference` : { fotmobId,
 * langs } (cf. matchStatsRead.matchDetailsFromStore, `meta.tickerLangs`).
 * [] quand FotMob n'a pas de texte pour ce match (ou si rien n'y sert).
 */
export async function commentaireDuMatch(reference, options = {}) {
  if (!reference?.fotmobId) return [];
  const langues = languesDuCommentaire(reference.langs ?? null);
  if (!langues.length) return [];
  const lu = await lireCommentaire(reference.fotmobId, { ...options, langues });
  return lu ? momentsDuCommentaire(lu, options) : [];
}
