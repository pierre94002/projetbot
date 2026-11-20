/**
 * journalWindows.js — LE JOURNAL WINDOWS lu par le journal de la recette (étape 47 du plan, lot 1, 17/11/2026).
 * -----------------------------------------------------------------------
 * Sert à une seule question : un trou du battement (S10, même processus) est-il couvert par une VEILLE du PC ? Et, pour
 * les démarrages (S11) : le PC a-t-il redémarré, proprement ou non ? Le journal de la recette ne lit le journal Windows
 * qu'au tour d'après un trou, jamais autrement.
 *
 * Trois parties, dont deux PURES :
 *   1. la requête (pure) : BORNÉE par la date et par fournisseur (correction CR-15 de la critique : sans borne, la sortie
 *      dépasse 4 Mo et la lecture échoue à chaque fois). Fenêtre = du début du trou jusqu'à maintenant, plus 1 h ;
 *   2. la lecture : `wevtutil.exe qe System` par son chemin ABSOLU (%SystemRoot%\System32), arguments en tableau, jamais
 *      par un shell ; tampon 4 Mo, fenêtre cachée, 10 s au plus. Le rappel d'execFile n'est appelé qu'à l'événement
 *      « close » du processus (pas « exit », qui peut venir avant la fin des sorties sous Windows). Elle ne lève JAMAIS :
 *      toute panne (pas Windows, commande absente, trop lente, sortie trop grosse, sortie illisible) rend
 *      { lisible: false, probleme } ;
 *   3. le parseur et l'explication d'un trou (purs).
 *
 * Règle de CR-15 point 3 : un journal Windows ILLISIBLE n'explique rien. Le trou est alors « à expliquer », jamais
 * « connu » d'office (il sera relu aux tours suivants, puis par la revue du jour).
 * Règle de CR-15 point 4 : un trou est expliqué par la veille si (durée du trou − minutes de veille dans le trou)
 * ≤ 12 min. Sinon « à expliquer », avec les deux pistes de CR-15 point 6.
 *
 * Les événements retenus (et SEULEMENT avec leur fournisseur : le même numéro chez un autre fournisseur est un leurre,
 * par exemple Kernel-General 1, FilterManager 1, UserModePowerService 12) :
 *   Microsoft-Windows-Kernel-Power 42 = mise en veille ; 107 = reprise après la veille ; 41 = redémarrage sans arrêt
 *   propre ; Microsoft-Windows-Power-Troubleshooter 1 = retour de veille (avec SleepTime et WakeTime) ;
 *   EventLog 6005 = démarrage du service du journal (démarrage du PC) ; 6006 = arrêt propre ; 6008 = arrêt inattendu ;
 *   Microsoft-Windows-Kernel-General 12 = démarrage du système ; 13 = arrêt du système.
 * N'écrit rien, n'ouvre ni base ni fichier, aucun réseau. N'importe que des modules node:.
 * -----------------------------------------------------------------------
 */

import { execFile } from 'node:child_process';
import path from 'node:path';

/** Les événements retenus, par fournisseur puis par numéro : leur type dans le journal de la recette. */
export const EVENEMENTS_RETENUS = Object.freeze({
  'Microsoft-Windows-Kernel-Power': Object.freeze({ 42: 'mise-en-veille', 107: 'reprise', 41: 'arret-brutal' }),
  'Microsoft-Windows-Power-Troubleshooter': Object.freeze({ 1: 'retour-de-veille' }),
  EventLog: Object.freeze({ 6005: 'demarrage-du-journal', 6006: 'arret-propre', 6008: 'arret-inattendu' }),
  'Microsoft-Windows-Kernel-General': Object.freeze({ 12: 'demarrage-du-systeme', 13: 'arret-du-systeme' })
});

/** Ce qu'il reste d'un trou sans veille pour qu'il soit encore « expliqué par la veille » (CR-15 point 4). */
export const ECART_ADMIS_MS = 12 * 60_000;

/** La marge ajoutée à la fenêtre de la requête (CR-15 point 1 : « durée du trou + 1 h »). */
export const MARGE_DE_LA_REQUETE_MS = 60 * 60_000;

/** Au plus tant d'événements rendus par une lecture (du plus récent au plus ancien). */
export const EVENEMENTS_MAX = 400;

/** Délai et tampon de la commande (CR-15 point 2). */
export const DELAI_MS = 10_000;
export const TAMPON_OCTETS = 4 * 1024 * 1024;

/** Les deux pistes écrites quand un trou n'est pas couvert par une veille (CR-15 point 6). */
export const PISTES_D_UN_TROU = Object.freeze(['fenêtre du serveur figée ?', 'fil du serveur bloqué par un calcul ?']);

/** Le chemin absolu de wevtutil.exe (jamais cherché dans le PATH). */
export function cheminDeWevtutil(environnement = process.env) {
  const racine = typeof environnement.SystemRoot === 'string' && environnement.SystemRoot.trim() ? environnement.SystemRoot.trim() : 'C:/Windows';
  return path.win32.join(racine, 'System32', 'wevtutil.exe');
}

/** La fenêtre de la requête, en millisecondes avant maintenant : du début du trou jusqu'à maintenant, plus 1 h. */
export function borneDeLaRequete({ debutDuTrou, maintenant = Date.now() } = {}) {
  const debut = typeof debutDuTrou === 'number' ? debutDuTrou : Date.parse(debutDuTrou);
  if (!Number.isFinite(debut) || !Number.isFinite(maintenant) || debut > maintenant) return null;
  return Math.ceil(maintenant - debut) + MARGE_DE_LA_REQUETE_MS;
}

/** La requête XPath bornée (CR-15 point 1), construite depuis EVENEMENTS_RETENUS. */
export function requeteXPath(fenetreMs) {
  const ms = Math.floor(Number(fenetreMs));
  if (!Number.isFinite(ms) || ms <= 0) throw new RangeError(`fenêtre de la requête invalide : ${fenetreMs}`);
  const parFournisseur = Object.entries(EVENEMENTS_RETENUS).map(([nom, numeros]) => {
    const ids = Object.keys(numeros).map((id) => `EventID=${id}`);
    return `(Provider[@Name='${nom}'] and ${ids.length > 1 ? `(${ids.join(' or ')})` : ids[0]})`;
  });
  return `*[System[TimeCreated[timediff(@SystemTime) <= ${ms}] and (${parFournisseur.join(' or ')})]]`;
}

/** Les arguments de wevtutil : « qe » seulement (lecture), sortie XML, du plus récent au plus ancien, 400 au plus. */
export function argumentsDeWevtutil(fenetreMs) {
  return ['qe', 'System', `/q:${requeteXPath(fenetreMs)}`, '/f:xml', '/rd:true', `/c:${EVENEMENTS_MAX}`];
}

// --- Le parseur (pur) -------------------------------------------------------------------------------------------

/** La valeur d'un attribut, entre apostrophes ou guillemets. */
function attribut(texte, nom) {
  const m = texte.match(new RegExp(`\\b${nom}\\s*=\\s*(['"])(.*?)\\1`));
  return m ? m[2] : null;
}

/** Un instant ISO de Windows (7 décimales) en millisecondes, ou null. */
export function instantWindows(texte) {
  if (typeof texte !== 'string') return null;
  const t = texte.trim().replace(/(\.\d{3})\d+/, '$1');
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

/** Les champs <Data Name='…'>…</Data> d'un événement. */
function donnees(bloc) {
  const out = {};
  for (const m of bloc.matchAll(/<Data\s+Name\s*=\s*(['"])([^'"]+)\1\s*>([^<]*)<\/Data>/g)) out[m[2]] = m[3];
  return out;
}

/**
 * La sortie XML de wevtutil (des <Event>…</Event> à la suite, SANS racine unique, attributs entre apostrophes) en une
 * liste d'événements retenus, du plus ancien au plus récent :
 * { type, fournisseur, numero, le (ISO), ms, sommeil?, reveil? } (sommeil/réveil : Power-Troubleshooter 1 seulement).
 * Les événements d'un autre fournisseur ou d'un autre numéro sont ignorés. Ne lève jamais : un texte qui n'est pas une
 * chaîne rend [].
 */
export function parserEvenementsWindows(xml) {
  if (typeof xml !== 'string' || !xml) return [];
  const evenements = [];
  for (const m of xml.matchAll(/<Event[\s>][\s\S]*?<\/Event>/g)) {
    const bloc = m[0];
    const balise = bloc.match(/<Provider\b[^>]*>/);
    const fournisseur = balise ? attribut(balise[0], 'Name') : null;
    const id = bloc.match(/<EventID\b[^>]*>\s*(\d+)\s*<\/EventID>/);
    const numero = id ? Number(id[1]) : null;
    const type = fournisseur && numero !== null ? EVENEMENTS_RETENUS[fournisseur]?.[numero] ?? null : null;
    if (!type) continue;
    const temps = bloc.match(/<TimeCreated\b[^>]*>/);
    const ms = temps ? instantWindows(attribut(temps[0], 'SystemTime')) : null;
    if (ms === null) continue;
    const ev = { type, fournisseur, numero, le: new Date(ms).toISOString(), ms };
    if (type === 'retour-de-veille') {
      const d = donnees(bloc);
      const sommeil = instantWindows(d.SleepTime);
      const reveil = instantWindows(d.WakeTime);
      ev.sommeil = sommeil !== null ? new Date(sommeil).toISOString() : null;
      ev.reveil = reveil !== null ? new Date(reveil).toISOString() : null;
    }
    evenements.push(ev);
  }
  return evenements.sort((a, b) => a.ms - b.ms);
}

// --- Les veilles et l'explication d'un trou (purs) -------------------------------------------------------------

/** Réunit des intervalles [de, a] (ms) qui se chevauchent. */
function reunir(intervalles) {
  const tries = intervalles.filter(([de, a]) => Number.isFinite(de) && Number.isFinite(a) && a > de).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [de, a] of tries) {
    const dernier = out.at(-1);
    if (dernier && de <= dernier[1]) dernier[1] = Math.max(dernier[1], a);
    else out.push([de, a]);
  }
  return out;
}

/**
 * Les veilles du PC, en intervalles [de, a] (ms) réunis : celles que Power-Troubleshooter 1 date (SleepTime → WakeTime),
 * et chaque mise en veille (Kernel-Power 42) suivie d'une reprise (Kernel-Power 107) avant la mise en veille suivante.
 */
export function veillesDuPC(evenements) {
  const liste = Array.isArray(evenements) ? [...evenements].sort((a, b) => a.ms - b.ms) : [];
  const intervalles = [];
  for (const e of liste) {
    if (e.type === 'retour-de-veille' && e.sommeil && e.reveil) intervalles.push([Date.parse(e.sommeil), Date.parse(e.reveil)]);
  }
  liste.forEach((e, i) => {
    if (e.type !== 'mise-en-veille') return;
    for (const suivant of liste.slice(i + 1)) {
      if (suivant.type === 'mise-en-veille') break;
      if (suivant.type === 'reprise') {
        intervalles.push([e.ms, suivant.ms]);
        break;
      }
    }
  });
  return reunir(intervalles);
}

/** Les millisecondes de veille comprises dans [de, a]. */
export function veilleDansLeTrou(evenements, { de, a }) {
  return veillesDuPC(evenements).reduce((somme, [v0, v1]) => somme + Math.max(0, Math.min(a, v1) - Math.max(de, v0)), 0);
}

/**
 * Le trou du battement [de, a] (ISO ou ms) face à une lecture du journal Windows ({ lisible, evenements } ou
 * { lisible: false, probleme }) :
 *   - lecture illisible → { classe: 'a-expliquer', cause: null, raison: 'journal Windows illisible (…)', relire: true } ;
 *   - veille qui couvre le trou à 12 min près → { classe: 'connue', cause: 'veille-du-pc', minutesDeVeille, … } ;
 *   - sinon → { classe: 'a-expliquer', cause: null, pistes: PISTES_D_UN_TROU, minutesDeVeille, … }.
 * Ne lève jamais (un trou mal formé est « à expliquer »).
 */
export function expliquerLeTrou({ de, a, lecture } = {}) {
  const t0 = typeof de === 'number' ? de : Date.parse(de);
  const t1 = typeof a === 'number' ? a : Date.parse(a);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) {
    return { classe: 'a-expliquer', cause: null, raison: 'trou mal daté', relire: false, pistes: PISTES_D_UN_TROU };
  }
  const minutesDuTrou = Math.round((t1 - t0) / 60_000);
  if (!lecture || lecture.lisible !== true || !Array.isArray(lecture.evenements)) {
    const probleme = lecture?.probleme ? String(lecture.probleme) : 'aucune lecture';
    return { classe: 'a-expliquer', cause: null, raison: `journal Windows illisible (${probleme})`, relire: true, minutesDuTrou, minutesDeVeille: null, pistes: PISTES_D_UN_TROU };
  }
  const veilleMs = veilleDansLeTrou(lecture.evenements, { de: t0, a: t1 });
  const minutesDeVeille = Math.round(veilleMs / 60_000);
  if (veilleMs > 0 && t1 - t0 - veilleMs <= ECART_ADMIS_MS) {
    return { classe: 'connue', cause: 'veille-du-pc', raison: `veille du PC : ${minutesDeVeille} min sur un trou de ${minutesDuTrou} min`, relire: false, minutesDuTrou, minutesDeVeille };
  }
  return {
    classe: 'a-expliquer',
    cause: null,
    raison: veilleMs > 0 ? `veille du PC trop courte : ${minutesDeVeille} min sur un trou de ${minutesDuTrou} min` : `aucune veille du PC pendant le trou de ${minutesDuTrou} min`,
    relire: false,
    minutesDuTrou,
    minutesDeVeille,
    pistes: PISTES_D_UN_TROU
  };
}

/**
 * Les arrêts et démarrages du PC dans [de, a] (pour S11) : démarrages (6005, Kernel-General 12), arrêts propres (6006,
 * Kernel-General 13), arrêts brutaux (Kernel-Power 41, 6008). Un arrêt brutal n'est jamais un « redémarrage du PC »
 * connu d'office (critique § 1.4, « redemarrage-du-pc ») : c'est au classement d'en décider.
 */
export function arretsEtDemarrages(evenements, { de, a }) {
  const t0 = typeof de === 'number' ? de : Date.parse(de);
  const t1 = typeof a === 'number' ? a : Date.parse(a);
  const dans = (Array.isArray(evenements) ? evenements : []).filter((e) => e.ms >= t0 && e.ms <= t1);
  const de_ = (types) => dans.filter((e) => types.includes(e.type)).map((e) => e.le);
  return {
    demarrages: de_(['demarrage-du-journal', 'demarrage-du-systeme']),
    arretsPropres: de_(['arret-propre', 'arret-du-systeme']),
    arretsBrutaux: de_(['arret-brutal', 'arret-inattendu'])
  };
}

// --- La lecture (ne lève jamais) --------------------------------------------------------------------------------

/**
 * Lit le journal Windows sur la fenêtre `fenetreMs` (voir borneDeLaRequete). Rend TOUJOURS une promesse résolue :
 * { lisible: true, evenements, octets, dureeMs } ou { lisible: false, probleme, dureeMs }.
 * `executer` (même forme qu'execFile : fichier, arguments, options, rappel) et `plateforme` servent aux essais ; par
 * défaut execFile, dont Node n'appelle le rappel qu'à l'événement « close » du processus.
 */
export function lireJournalWindows({ fenetreMs, executer = execFile, plateforme = process.platform, environnement = process.env, horloge = Date.now } = {}) {
  const debut = horloge();
  const illisible = (probleme) => ({ lisible: false, probleme, dureeMs: Math.max(0, horloge() - debut) });
  return new Promise((resoudre) => {
    let fini = false;
    let garde = null;
    const terminer = (r) => {
      if (fini) return;
      fini = true;
      if (garde) clearTimeout(garde);
      resoudre(r);
    };
    try {
      if (plateforme !== 'win32') return terminer(illisible(`pas Windows (${plateforme})`));
      const args = argumentsDeWevtutil(fenetreMs);
      // Filet : si le rappel ne venait jamais, la lecture rend « illisible » après le délai, plus 5 s.
      garde = setTimeout(() => terminer(illisible('aucune réponse de wevtutil')), DELAI_MS + 5_000);
      garde.unref?.();
      executer(cheminDeWevtutil(environnement), args, { windowsHide: true, timeout: DELAI_MS, maxBuffer: TAMPON_OCTETS, encoding: 'utf8' }, (erreur, sortie) => {
        try {
          if (erreur) {
            const pourquoi = erreur.killed || erreur.signal ? 'trop lente (arrêtée après 10 s)' : erreur.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'sortie de plus de 4 Mo' : erreur.code === 'ENOENT' ? 'wevtutil introuvable' : `en échec (${erreur.code ?? erreur.message})`;
            return terminer(illisible(`commande ${pourquoi}`));
          }
          const texte = typeof sortie === 'string' ? sortie : Buffer.isBuffer(sortie) ? sortie.toString('utf8') : '';
          if (texte.trim() && !/<Event[\s>]/.test(texte)) return terminer(illisible('sortie sans événement XML'));
          terminer({ lisible: true, evenements: parserEvenementsWindows(texte), octets: Buffer.byteLength(texte), dureeMs: Math.max(0, horloge() - debut) });
        } catch (e) {
          terminer(illisible(`sortie illisible (${e?.message ?? e})`));
        }
      });
    } catch (e) {
      terminer(illisible(`lecture impossible (${e?.message ?? e})`));
    }
  });
}
