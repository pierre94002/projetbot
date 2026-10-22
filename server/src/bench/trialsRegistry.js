/**
 * trialsRegistry.js — le REGISTRE du garde-fou de la mesure (étape 16 du plan, 07/10/2026).
 * -----------------------------------------------------------------------
 * data/runtime/registre-mesure.json, écrit par le serveur :
 *   { version: 1, majLe, etapes: { "27": {
 *       lancements: [{ version, quoi, le, heure, source }]   la date RÉELLE de mise en service ;
 *       variantes:  [{ id, quoi, ou, le }]                    les variantes essayées à chaud (étape 25) ;
 *       jugements:  [{ … }]                                   TOUS les jugements rendus, jamais remplacés
 *   } } }
 *
 * Qui écrit quoi, et quand :
 *   - server.js, à CHAQUE démarrage : enregistrerLancements() — toute
 *     déclaration (étape, version) de lancements.js absente du registre y est
 *     écrite, datée du jour de Paris du démarrage. C'est le premier démarrage
 *     de l'appli de Pierre avec ce code : la vraie date de mise en service,
 *     notée sans que personne y pense. Les démarrages suivants n'écrivent rien.
 *     Jamais bloquant : un registre illisible est signalé, pas réécrit ;
 *   - l'étape 25 : declarerLancement à l'adoption d'une version,
 *     declarerVariante à chaque candidate mise à blanc, et jugerEtape (guard.js)
 *     qui range chaque jugement par enregistrerJugement ;
 *   - le banc (étape 19) n'écrit rien ici et n'y lit rien : ses étiquettes « déjà vu » viennent du code
 *     (fenetresDeclarees, portée « moteur ») ; le juge de preuve, lui, écarte fenetresVues (par portée).
 * Ce que lit la feuille de route : etatPourFeuilleDeRoute(), SANS base ni réseau.
 *
 * Règles d'écriture, celles de roadmapRepository.js : toujours
 * utils/atomicJson.js (fichier temporaire renommé, nouvelles tentatives quand
 * OneDrive tient le fichier) ; AUCUN cache, chaque lecture relit le fichier ;
 * un fichier présent mais illisible ou de forme inattendue n'est JAMAIS pris
 * pour vide ni réécrit (RegistreIllisible, et la feuille de route le dit) ;
 * fusion champ par champ (un champ inconnu est gardé tel quel) ; une écriture
 * qui ne change rien ne réécrit rien.
 *
 * Toutes les fonctions prennent un dernier paramètre d'options
 * { fichier, lancements, donneesVues, maintenant } : les trois premiers ne
 * servent qu'aux essais (un fichier temporaire, des lancements fabriqués).
 * Aucun import de la base, des enregistreurs, des fournisseurs ni des tâches.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../utils/atomicJson.js';
import { LANCEMENTS, DONNEES_VUES, ETAPES_A_JUGER, verifierLancements, jourValide, pourLaPortee } from './lancements.js';
import { normaliserIdEtape } from '../data/roadmap/plan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FICHIER_REGISTRE = path.resolve(__dirname, '../../data/runtime/registre-mesure.json');
export const VERSION_REGISTRE = 1;

/** Le registre ne se lit pas : rien n'y est écrit, rien n'y est jugé. */
export class RegistreIllisible extends Error {}
/** L'étape n'a pas de date de lancement : aucun match n'est encore de la preuve neuve. */
export class EtapeNonLancee extends Error {}
/** Aucune variante déclarée : le juge ne sait pas combien d'essais corriger, il refuse. */
export class AucuneVariante extends Error {}

/** Le jour de Paris (AAAA-MM-JJ) d'un instant — jamais toISOString().slice(0, 10), décalé la nuit. */
const jourParis = (instant) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date(instant));
const iso = (instant) => new Date(instant).toISOString();
const objetSimple = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const texte = (v) => typeof v === 'string' && v.trim() !== '';
/** Une copie propre (sans référence partagée) d'une valeur JSON. */
const copie = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const ABSENT = Symbol('registre absent');

function optionsDe(options) {
  const { fichier = FICHIER_REGISTRE, lancements = LANCEMENTS, donneesVues = DONNEES_VUES, maintenant = Date.now() } = options ?? {};
  return { fichier, lancements, donneesVues, maintenant };
}

/** L'identifiant d'une étape du plan, ou une erreur claire (une écriture ne devine jamais l'étape). */
function idConnu(etape, ou) {
  const id = normaliserIdEtape(etape);
  if (!id) throw new TypeError(`${ou} : étape « ${String(etape).slice(0, 40)} » inconnue du plan.`);
  return id;
}

// ------------------------------------------------------------ lecture

/** Ce qui ne va pas dans la forme du fichier, en une phrase, ou null. */
function problemeDeForme(brut) {
  if (!objetSimple(brut)) return 'le contenu n’est pas un objet JSON';
  if (brut.etapes !== undefined && !objetSimple(brut.etapes)) return '« etapes » n’est pas un objet';
  for (const [id, entree] of Object.entries(brut.etapes ?? {})) {
    if (!objetSimple(entree)) return `l’entrée de l’étape « ${id} » n’est pas un objet`;
    for (const champ of ['lancements', 'variantes', 'jugements']) {
      if (entree[champ] === undefined) continue;
      if (!Array.isArray(entree[champ])) return `« ${champ} » de l’étape « ${id} » n’est pas une liste`;
      if (!entree[champ].every(objetSimple)) return `un élément de « ${champ} » de l’étape « ${id} » n’est pas un objet`;
    }
    for (const l of entree.lancements ?? []) {
      if (!texte(l.version)) return `un lancement de l’étape « ${id} » n’a pas de version`;
      if (!jourValide(l.le)) return `le lancement « ${l.version} » de l’étape « ${id} » n’a pas de jour valide`;
    }
    for (const v of entree.variantes ?? []) if (!texte(v.id)) return `une variante de l’étape « ${id} » n’a pas d’identifiant`;
  }
  return null;
}

/** Le fichier tel qu'il est : { source: 'absent' | 'enregistre' | 'illisible', brut, probleme }. */
function lireBrut(fichier) {
  let brut;
  try {
    brut = readJsonFile(fichier, ABSENT);
  } catch (error) {
    return { source: 'illisible', brut: null, probleme: error.message };
  }
  if (brut === ABSENT) return { source: 'absent', brut: null, probleme: null };
  const probleme = problemeDeForme(brut);
  if (probleme) return { source: 'illisible', brut: null, probleme: `forme inattendue (${probleme})` };
  return { source: 'enregistre', brut, probleme: null };
}

/** Pour juger ou écrire : un registre illisible arrête tout (jamais pris pour vide). */
function lireOuLever(fichier) {
  const lecture = lireBrut(fichier);
  if (lecture.source === 'illisible') {
    throw new RegistreIllisible(
      `Le registre de la mesure (${fichier}) est illisible : ${lecture.probleme}. Rien n’y est écrit ni jugé tant qu’il l’est. ` +
        'S’il est tenu par OneDrive, réessayer dans un instant ; sinon le réparer à la main plutôt que le supprimer : il garde les dates de lancement, les variantes essayées et les jugements.'
    );
  }
  return lecture;
}

/** Écrit le registre d'un bloc, en gardant tels quels les champs que ce code ne connaît pas. */
function ecrire(fichier, brut, etapes, maintenant) {
  const autres = { ...brut };
  for (const cle of ['version', 'majLe', 'etapes']) delete autres[cle];
  writeJsonAtomic(fichier, { version: brut.version ?? VERSION_REGISTRE, majLe: iso(maintenant), ...autres, etapes });
}

const registreNeuf = () => ({ version: VERSION_REGISTRE, etapes: {} });

/** Le fichier tel qu'il est : { source, fichier, probleme, majLe, etapes }. Jamais une lecture ratée gardée (aucun cache). */
export function lireRegistre(options) {
  const { fichier } = optionsDe(options);
  const { source, brut, probleme } = lireBrut(fichier);
  return { source, fichier, probleme, majLe: typeof brut?.majLe === 'string' ? brut.majLe : null, etapes: copie(brut?.etapes ?? {}) };
}

// ------------------------------------------------- fusion code + registre

const copieVues = (vues) => (Array.isArray(vues) ? vues.map((f) => ({ de: f.de, a: f.a, quoi: f.quoi ?? '', pour: Array.isArray(f.pour) ? [...f.pour] : [] })) : []);

/**
 * Tous les lancements d'une étape : ceux du registre (dans leur ordre), puis ceux du code à date
 * FIXE qui n'y sont pas encore (un lancement antérieur au registre est lancé par définition). Une
 * déclaration du code à `le: null` absente du registre n'est PAS lancée : le serveur ne l'a pas
 * encore notée au démarrage. Quand une version est au registre, sa date du registre fait foi (la
 * première notée) ; ses fenêtres vues sont celles du code.
 */
function lancementsFusionnes(id, brut, lancements) {
  const duCode = (version) => lancements.find((d) => d.etape === id && d.version === version) ?? null;
  const notes = (brut?.etapes?.[id]?.lancements ?? []).map((l) => ({
    version: l.version,
    quoi: typeof l.quoi === 'string' ? l.quoi : duCode(l.version)?.quoi ?? '',
    le: l.le,
    heure: typeof l.heure === 'string' ? l.heure : null,
    source: typeof l.source === 'string' ? l.source : 'registre',
    vues: copieVues(duCode(l.version)?.vues)
  }));
  const fixes = lancements
    .filter((d) => d.etape === id && jourValide(d.le) && !notes.some((l) => l.version === d.version))
    .map((d) => ({ version: d.version, quoi: d.quoi, le: d.le, heure: null, source: 'code', vues: copieVues(d.vues) }));
  return [...notes, ...fixes];
}

/** Le lancement qui compte pour juger : le DERNIER (la version en service) — le jour le plus récent, à égalité le dernier écrit. */
function dernierLancement(liste) {
  let dernier = null;
  for (const l of liste) if (!dernier || l.le >= dernier.le) dernier = l;
  return dernier;
}

/** Les variantes d'une étape : celles du code (la construction), puis celles du registre (à chaud), dédoublonnées par identifiant. */
function variantesFusionnees(id, brut, lancements) {
  const vus = new Set();
  const liste = [];
  for (const d of lancements) {
    if (d.etape !== id) continue;
    for (const v of d.variantes ?? []) {
      if (!texte(v?.id) || vus.has(v.id)) continue;
      vus.add(v.id);
      liste.push({ id: v.id, quoi: v.quoi ?? '', ou: 'construction', le: null, source: 'code', version: d.version });
    }
  }
  for (const v of brut?.etapes?.[id]?.variantes ?? []) {
    if (!texte(v.id) || vus.has(v.id)) continue;
    vus.add(v.id);
    liste.push({ id: v.id, quoi: typeof v.quoi === 'string' ? v.quoi : '', ou: typeof v.ou === 'string' ? v.ou : 'a-blanc', le: v.le ?? null, source: 'registre' });
  }
  return liste;
}

// ------------------------------------------------------------ écritures

/**
 * Au démarrage du serveur : écrit tout lancement (étape, version) du code absent du registre, daté du
 * jour de Paris de `maintenant` (ou de son `le` fixe, recopié tel quel). Idempotent : rien de nouveau,
 * rien d'écrit. Ne lève PAS sur un registre illisible (le serveur doit démarrer) : rend
 * { nouveaux: [], source: 'illisible', probleme }. Lève LancementsInvalides si le code déclare mal.
 * @returns {{ nouveaux: { etape: string, version: string, le: string }[], source: string, probleme: string|null }}
 */
export function enregistrerLancements(options) {
  const { fichier, lancements, maintenant } = optionsDe(options);
  verifierLancements(lancements);
  const lecture = lireBrut(fichier);
  if (lecture.source === 'illisible') return { nouveaux: [], source: 'illisible', probleme: lecture.probleme };
  const brut = lecture.brut ?? registreNeuf();
  const etapes = { ...(brut.etapes ?? {}) };
  const nouveaux = [];
  for (const d of lancements) {
    const entree = etapes[d.etape] ?? {};
    const deja = entree.lancements ?? [];
    if (deja.some((l) => l.version === d.version)) continue;
    const le = d.le ?? jourParis(maintenant);
    etapes[d.etape] = { ...entree, lancements: [...deja, { version: d.version, quoi: d.quoi, le, heure: d.le ? null : iso(maintenant), source: 'code' }] };
    nouveaux.push({ etape: d.etape, version: d.version, le });
  }
  if (!nouveaux.length) return { nouveaux, source: lecture.source, probleme: null };
  ecrire(fichier, brut, etapes, maintenant);
  return { nouveaux, source: 'enregistre', probleme: null };
}

/** Un lancement à chaud (adoption d'une version, étape 25) : ajouté si (étape, version) est absent ; rend { change, lancement }. Lève RegistreIllisible. */
export function declarerLancement(etape, { version, quoi = '' } = {}, options) {
  const id = idConnu(etape, 'declarerLancement');
  if (!texte(version)) throw new TypeError('declarerLancement : la version est vide.');
  const { fichier, maintenant } = optionsDe(options);
  const brut = lireOuLever(fichier).brut ?? registreNeuf();
  const entree = brut.etapes?.[id] ?? {};
  const deja = entree.lancements ?? [];
  const existant = deja.find((l) => l.version === version);
  if (existant) return { change: false, lancement: copie(existant) };
  const lancement = { version, quoi: typeof quoi === 'string' ? quoi : '', le: jourParis(maintenant), heure: iso(maintenant), source: 'a-chaud' };
  ecrire(fichier, brut, { ...(brut.etapes ?? {}), [id]: { ...entree, lancements: [...deja, lancement] } }, maintenant);
  return { change: true, lancement };
}

/**
 * Une variante essayée à chaud (une candidate mise à blanc, étape 25) : ajoutée si son identifiant
 * n'est pas déjà déclaré pour l'étape (dans le code ou au registre) ; rend { change, variante }.
 * Lève RegistreIllisible : une variante qui ne peut pas être comptée ne doit pas passer inaperçue.
 */
export function declarerVariante(etape, { id, quoi = '', ou = 'a-blanc' } = {}, options) {
  const idEtape = idConnu(etape, 'declarerVariante');
  if (!texte(id)) throw new TypeError('declarerVariante : l’identifiant de la variante est vide.');
  if (!texte(ou)) throw new TypeError('declarerVariante : « ou » est vide (a-blanc, banc, appli…).');
  const { fichier, lancements, maintenant } = optionsDe(options);
  const brut = lireOuLever(fichier).brut ?? registreNeuf();
  if (variantesFusionnees(idEtape, brut, lancements).some((v) => v.id === id)) return { change: false, variante: null };
  const entree = brut.etapes?.[idEtape] ?? {};
  const variante = { id, quoi: typeof quoi === 'string' ? quoi : '', ou, le: iso(maintenant) };
  ecrire(fichier, brut, { ...(brut.etapes ?? {}), [idEtape]: { ...entree, variantes: [...(entree.variantes ?? []), variante] } }, maintenant);
  return { change: true, variante };
}

/**
 * PLUSIEURS variantes d'une étape d'un coup (étape 27, vérification du branchement, constat 3 : la candidate mise à
 * blanc et les 319 variantes de sa construction) : UNE lecture et UNE écriture du registre (aucune si rien de neuf) —
 * le fichier vit sous OneDrive, 320 écritures de suite y étaient un risque de verrou. Même règle que declarerVariante :
 * un identifiant déjà déclaré (dans le code ou au registre), ou répété dans la liste, est sauté. Tout est vérifié
 * avant d'écrire (rien d'écrit si une variante est fautive). Rend { ajoutees, variantes } — `variantes` dans l'ordre
 * de la liste : { id, change, variante }. Lève RegistreIllisible.
 */
export function declarerVariantes(etape, liste, options) {
  const idEtape = idConnu(etape, 'declarerVariantes');
  if (!Array.isArray(liste)) throw new TypeError('declarerVariantes : une liste de variantes est attendue.');
  for (const v of liste) {
    if (!texte(v?.id)) throw new TypeError('declarerVariantes : l’identifiant d’une variante est vide.');
    if (!texte(v.ou ?? 'a-blanc')) throw new TypeError('declarerVariantes : « ou » est vide (a-blanc, banc, appli…).');
  }
  const { fichier, lancements, maintenant } = optionsDe(options);
  const brut = lireOuLever(fichier).brut ?? registreNeuf();
  const deja = new Set(variantesFusionnees(idEtape, brut, lancements).map((v) => v.id));
  const ajoutees = [];
  const variantes = liste.map(({ id, quoi = '', ou = 'a-blanc' }) => {
    if (deja.has(id)) return { id, change: false, variante: null };
    deja.add(id);
    const variante = { id, quoi: typeof quoi === 'string' ? quoi : '', ou, le: iso(maintenant) };
    ajoutees.push(variante);
    return { id, change: true, variante };
  });
  if (ajoutees.length) {
    const entree = brut.etapes?.[idEtape] ?? {};
    ecrire(fichier, brut, { ...(brut.etapes ?? {}), [idEtape]: { ...entree, variantes: [...(entree.variantes ?? []), ...ajoutees] } }, maintenant);
  }
  return { ajoutees, variantes };
}

/** Ajoute un jugement (JAMAIS de remplacement : chaque jugement garde sa date) ; rend l'objet rangé. Lève RegistreIllisible. */
export function enregistrerJugement(etape, jugement, options) {
  const id = idConnu(etape, 'enregistrerJugement');
  if (!objetSimple(jugement)) throw new TypeError('enregistrerJugement : un jugement est un objet.');
  const { fichier, maintenant } = optionsDe(options);
  const brut = lireOuLever(fichier).brut ?? registreNeuf();
  const entree = brut.etapes?.[id] ?? {};
  const range = copie(jugement);
  ecrire(fichier, brut, { ...(brut.etapes ?? {}), [id]: { ...entree, jugements: [...(entree.jugements ?? []), range] } }, maintenant);
  return range;
}

// ------------------------------------------------------------ lectures

/** Le dernier lancement de l'étape, fusion code + registre : { version, quoi, le, heure, source, vues } ou null. Lève RegistreIllisible. */
export function lancementDe(etape, options) {
  const id = normaliserIdEtape(etape);
  if (!id) return null;
  const { fichier, lancements } = optionsDe(options);
  return dernierLancement(lancementsFusionnes(id, lireOuLever(fichier).brut, lancements));
}

/** Les variantes de l'étape (code + registre, dédoublonnées par identifiant). Lève RegistreIllisible. */
export function variantesDe(etape, options) {
  const id = normaliserIdEtape(etape);
  if (!id) return [];
  const { fichier, lancements } = optionsDe(options);
  return variantesFusionnees(id, lireOuLever(fichier).brut, lancements);
}

/** Le nombre de variantes essayées pour l'étape : le `m` de la correction (guard.js). */
export function compterVariantes(etape, options) {
  return variantesDe(etape, options).length;
}

/**
 * Les fenêtres que le juge de preuve ÉCARTE pour une étape (correction du 19/10/2026 : par portée et par version
 * en service, au lieu de « DONNEES_VUES + le dernier lancement de l'étape ») :
 *   - DONNEES_VUES (portée « tout ») ;
 *   - TOUTES les fenêtres de l'étape jugée — chacune de ses déclarations du code, toutes versions, toutes
 *     portées : ce qu'elle a regardé pour se construire, même pour une version d'avant ;
 *   - les fenêtres de portée « moteur » (ou « tout ») des lancements ENREGISTRÉS des autres étapes (registre +
 *     code à date fixe, toutes versions) : le moteur jugé est construit sur les leurs ; jamais celles d'une
 *     autre grandeur (l'indice de 29, les demi-vies de 18, le marché de 22) ni d'un lancement pas encore noté.
 * Rend [{ de, a, quoi, pour }] sans doublon de jours. Lève RegistreIllisible.
 */
export function fenetresVues(etape, options) {
  const id = normaliserIdEtape(etape);
  const { fichier, lancements, donneesVues } = optionsDe(options);
  const brut = lireOuLever(fichier).brut;
  const fenetres = [...donneesVues.map((f) => ({ de: f.de, a: f.a, quoi: f.quoi ?? '', pour: ['tout'] }))];
  if (id) for (const d of lancements) if (d.etape === id) fenetres.push(...copieVues(d.vues));
  const autres = new Set([...lancements.map((d) => d.etape), ...Object.keys(brut?.etapes ?? {})]);
  autres.delete(id);
  for (const autre of autres) {
    if (normaliserIdEtape(autre) !== autre) continue;
    for (const l of lancementsFusionnes(autre, brut, lancements)) fenetres.push(...l.vues.filter((f) => pourLaPortee(f.pour, 'moteur')));
  }
  const vus = new Set();
  return fenetres.filter((f) => {
    const cle = `${f.de}|${f.a}`;
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });
}

/** Les jugements rangés de l'étape, du plus ancien au plus récent. Lève RegistreIllisible. */
export function jugementsDe(etape, options) {
  const id = normaliserIdEtape(etape);
  if (!id) return [];
  const { fichier } = optionsDe(options);
  return copie(lireOuLever(fichier).brut?.etapes?.[id]?.jugements ?? []);
}

// ------------------------------------------------- pour la feuille de route

/** Ce que la feuille de route montre d'un jugement (la page n'a besoin ni des tirages ni du contrôle). */
function resumeJugement(j) {
  const fourchette = j.enPourcent?.fourchette;
  return {
    le: typeof j.le === 'string' ? j.le : null,
    quoi: typeof j.quoi === 'string' ? j.quoi : '',
    mesure: typeof j.mesure === 'string' ? j.mesure : null,
    principal: j.principal === true,
    version: typeof j.version === 'string' ? j.version : null,
    lancement: typeof j.lancement === 'string' ? j.lancement : null,
    verdict: typeof j.verdict === 'string' ? j.verdict : null,
    raison: typeof j.raison === 'string' ? j.raison : '',
    n: { matchs: j.n?.matchs ?? null, blocs: j.n?.blocs ?? null, lignes: j.n?.lignes ?? null },
    fenetre: { de: j.fenetre?.de ?? null, a: j.fenetre?.a ?? null },
    enPourcent: {
      gain: typeof j.enPourcent?.gain === 'number' ? j.enPourcent.gain : null,
      fourchette: Array.isArray(fourchette) && fourchette.length === 2 && fourchette.every((x) => typeof x === 'number') ? [...fourchette] : null,
      quoi: typeof j.enPourcent?.quoi === 'string' ? j.enPourcent.quoi : ''
    },
    seuil: { variantes: j.seuil?.variantes ?? null }
  };
}

/**
 * Ce que lit la feuille de route, SANS base ni réseau, et SANS jamais lever (un registre illisible ne
 * fait pas tomber la page) : { source, fichier, probleme, majLe, nombre, etapes: { [id]: { aJuger,
 * registre, lancement, variantes, jugement } } } pour chaque étape de ETAPES_A_JUGER, chaque étape
 * ayant une entrée au registre et chaque étape déclarée dans lancements.js. `jugement` = le dernier
 * `principal`, sinon le dernier, sinon null ; `nombre` = le nombre de jugements rangés. Registre
 * illisible : chaque étape garde `aJuger`, avec `registre: 'illisible'`, `lancement`, `variantes` et
 * `jugement` à null — jamais « pas encore lancée » quand on ne peut pas le savoir.
 */
export function etatPourFeuilleDeRoute(options) {
  const { fichier, lancements } = optionsDe(options);
  let lecture = lireBrut(fichier);
  let etapes;
  try {
    etapes = etatDesEtapes(lecture, lancements);
  } catch (error) {
    // Un contenu inattendu qui aurait échappé au contrôle de forme : la page reste debout et le dit.
    lecture = { source: 'illisible', brut: null, probleme: `contenu inattendu (${error.message})` };
    etapes = etatDesEtapes(lecture, lancements);
  }
  const nombre = Object.values(lecture.brut?.etapes ?? {}).reduce((n, e) => n + (Array.isArray(e?.jugements) ? e.jugements.length : 0), 0);
  return { source: lecture.source, fichier, probleme: lecture.probleme, majLe: typeof lecture.brut?.majLe === 'string' ? lecture.brut.majLe : null, nombre, etapes };
}

function etatDesEtapes(lecture, lancements) {
  const lisible = lecture.source !== 'illisible';
  const ids = [...ETAPES_A_JUGER];
  const ajouter = (id) => {
    if (normaliserIdEtape(id) === id && !ids.includes(id)) ids.push(id);
  };
  for (const d of lancements) ajouter(d.etape);
  for (const id of Object.keys(lecture.brut?.etapes ?? {})) ajouter(id);
  const etapes = {};
  for (const id of ids) {
    const aJuger = ETAPES_A_JUGER.includes(id);
    if (!lisible) {
      etapes[id] = { aJuger, registre: 'illisible', lancement: null, variantes: null, jugement: null };
      continue;
    }
    const dernier = dernierLancement(lancementsFusionnes(id, lecture.brut, lancements));
    const jugements = lecture.brut?.etapes?.[id]?.jugements ?? [];
    const choisi = [...jugements].reverse().find((j) => j.principal === true) ?? jugements.at(-1) ?? null;
    etapes[id] = {
      aJuger,
      registre: lecture.source,
      lancement: dernier ? { version: dernier.version, quoi: dernier.quoi, le: dernier.le, heure: dernier.heure } : null,
      variantes: variantesFusionnees(id, lecture.brut, lancements).length,
      jugement: choisi ? resumeJugement(choisi) : null
    };
  }
  return etapes;
}
