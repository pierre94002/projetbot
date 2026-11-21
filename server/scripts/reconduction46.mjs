/**
 * reconduction46.mjs — LA RECONDUCTION DU JUGEMENT DU DIRECT (étape 46, § 2.7 de la vérification ; PROJET § 1 point 7 ;
 * contrat : conception du second sceau, § 6). Écrit le 18/11/2026, corrigé le 18/11/2026 au matin (décision O15 : rencontres
 * et nuits distinctes, identité complète code + réglages, preuve recontrôlée, cible explicite). Trois gestes, dans cet ordre, à
 * la mise en service d'une version N′ venue après la version N jugée au banc du direct :
 *
 *   node scripts/reconduction46.mjs --extraire-reglages --registre <copie du registre> --version <N> --sortie <reglages-N.json>
 *     (O16, réponse (e)) LES RÉGLAGES D'UNE VERSION, tirés du REGISTRE (champ `reglages` de l'entrée dont `numero` vaut N),
 *     écrits tels quels (forme { "football": {…} }) dans un fichier du bac, hors pistes et hors OneDrive, jamais nommé
 *     engine-config.json. Jamais le engine-config.json de Pierre.
 *
 *   node scripts/reconduction46.mjs --preuve --code-n <server/ de N> --code-np <server/ de N′> --base <copie restaurée>
 *        --nuits <ISO>,<ISO>,<ISO> --sortie <preuve.json> --donnees <dossier> --reglages-n <json> --reglages-np <json>
 *        --registre <copie du registre des versions> --version-n <N> --version-np <N′> --travail <dossier du bac>
 *        [--lectures toujours]
 *     LA PREUVE D'IDENTITÉ, voie « recalcul-bac » : pour chaque nuit (un instant ISO, PASSÉ ; les nuits toutes de dates
 *     différentes, jamais deux fois le même instant), le code de N calcule la liste des matchs à venir, puis CHAQUE version
 *     calcule sa nuit des matchs sur cette MÊME liste, chacune dans sa copie de travail (son harnais : réseau coupé, heure
 *     figée, aucune clé) et sur SA copie de la MÊME base (deux copies à l'octet, sha1 contrôlé). Les lignes « service » sont
 *     comparées : grille, λ, μ, ρ, fair (écart ≤ 1e-12). Une RENCONTRE (l'identifiant du match) vue plusieurs nuits compte UNE
 *     fois ; les lignes sont comptées à part. Les modules du sceau rangés sous les dossiers du direct sont relus sous N′ (sha1,
 *     bancDuDirect.js à scellement vide) et comparés au sceau ; si l'un a changé (ou --lectures toujours), les lectures du
 *     direct aux états de l'étalonnage sont comparées aussi. Les RÉGLAGES de chaque côté sont des arguments EXPLICITES
 *     (--reglages-n / --reglages-np : posés, le temps du calcul, en data/runtime/engine-config.json de SA copie, puis effacés
 *     avec elle ; jamais lus ni affichés par ce script, qui n'en garde que le sha1) ; le registre des versions (--registre) est
 *     posé dans les deux copies : il donne les numéros des lignes. CHAQUE côté lit son IDENTITÉ (empreinte du code et des
 *     réglages) au moment du calcul. --donnees : un dossier recopié tel quel dans server/data/ des deux copies (calendrier,
 *     relevé de cotes ; ni réglages, ni registre, ni clés). --travail : où faire les copies de travail (dans le bac, hors des
 *     pistes ; OBLIGATOIRE, sans copie de travail d'avant : O16, M3). La sortie (liste fermée de clés, aucune issue de match)
 *     est écrite une fois (jamais réécrite), dans le bac hors pistes et hors OneDrive, après son propre contrôle ; son sha1
 *     est rendu.
 *     O16 (passe de corrections du 18/11 au soir) : AVANT les nuits, chaque code relit son identité avec ses réglages, et elle
 *     doit être celle que le registre donne à --version-n / --version-np (sinon arrêt, rien de calculé) ; les modules du sceau
 *     sont relus sous N ET sous N′ (N doit être le sceau) ; les sha1 (base et copies) se calculent PAR MORCEAUX (la vraie
 *     base fait ~3,06 Go, au-delà des 2 Gio d'une lecture d'un bloc) ; --donnees est une LISTE BLANCHE (fixtures/…,
 *     runtime/season-calendar.json, runtime/fixtures-status.json), chaque fichier gardé à son sha1 dans la preuve ; les
 *     réglages ne sont jamais sous OneDrive ni nommés engine-config.json.
 *
 *   node scripts/reconduction46.mjs --inscrire --fichier <bac>/code/server/src/data/direct/reconductionDuDirect.js
 *        --preuve <preuve.json> --sha1 <sha1> --base-attendue <sha1 de la copie restaurée> --registre <copie du registre en
 *        service> --version-jugee <N> --historique <texte qui cite le sha1 de la base et celui des données> [--entree-en-service AAAA-MM-JJ]
 *     L'INSCRIPTION (PROJET (d)) : la cible est EXACTEMENT <bac>/code/server/src/data/direct/reconductionDuDirect.js (jamais une
 *     piste, jamais l'appli de Pierre, jamais sous OneDrive) ; la preuve relue à son sha1, au texte exact écrit par ce script
 *     (une preuve retouchée est refusée), faite par CE script (sha1 du script, du calcul, et de reconductionDuDirect.js à
 *     RECONDUCTIONS vide, importé ET cible), sur la base attendue, recontrôlée (forme, nombres, « identique » recalculé, seuils) ; le code de
 *     N′ est celui où l'on inscrit (empreinte relue) et ses 19 modules du direct sont ceux de la preuve (relus sur le disque) ;
 *     le registre en service donne bien ces identités à ces numéros ; la note du banc existe et juge N ; l'inscription
 *     contrôlée (controlerUneInscription), puis AJOUTÉE (ajout pur, entre les balises) par un fichier temporaire renommé, relue
 *     par import, et défaite si la relecture ne la trouve pas.
 *
 *   node scripts/reconduction46.mjs --verifier --registre <copie du registre en service> [--fichier <reconductionDuDirect.js>]
 *     Chaque inscription contrôlée comme à l'écran (sceau, registre, preuve à son sha1), ses 19 modules RELUS SUR LE DISQUE
 *     du code où elle est, et le fichier gardé de sa preuve relu à son sha1 s'il est là.
 *
 * Jamais la vraie base ni la base du bac (ni leurs -wal/-shm) ; jamais .env ni ai-config.json ; aucun engine-config.json par
 * défaut (seulement les fichiers donnés, recopiés à l'octet, jamais lus ici) ; aucun réseau. Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RACINE_BAC, VRAIE_BASE, baseParDefautDuBac, estDans, cheminReel } from '../src/config/bacASable.js';
import * as R from '../src/data/direct/reconductionDuDirect.js';

const SCRIPT = fileURLToPath(import.meta.url);
const ICI = path.dirname(SCRIPT);
const SERVEUR = path.resolve(ICI, '..');
const FICHIER_PAR_DEFAUT = path.join(SERVEUR, 'src', 'data', 'direct', 'reconductionDuDirect.js');
const CALCUL = path.join(ICI, 'reconduction46-calcul.mjs');
const BALISES = Object.freeze(['// <RECONDUCTIONS inscrites par script (node scripts/reconduction46.mjs --inscrire) — ne pas modifier à la main>', '// </RECONDUCTIONS>']);
const BANC_RELATIF = 'src/data/direct/bancDuDirect.js';
const INTERDITS = /^(\.env(\..*)?|ai-config\.json|engine-config\.json|engine-versions\.json)$/i;
/** m10 (O16) : la LISTE BLANCHE de --donnees (chemins relatifs à server/data/) : le calendrier et le relevé de cotes, rien d'autre. */
const DONNEES_PERMISES = [/^fixtures\/[^/].*\.json$/i, /^runtime\/season-calendar\.json$/i, /^runtime\/fixtures-status\.json$/i];

const sha1Texte = (t) => crypto.createHash('sha1').update(t).digest('hex');
const args = process.argv.slice(2);
/**
 * B2 (O16) : le sha1 d'un fichier PAR MORCEAUX (64 Mo ; --morceau <octets> pour les essais) — fs.readFileSync refuse un fichier
 * de plus de 2 Gio et la vraie base fait ~3,06 Go. `morceauxLus` compte les morceaux (l'essai T-R6 le relit).
 */
const TAILLE_DU_MORCEAU = (() => {
  const i = args.indexOf('--morceau');
  const n = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isInteger(n) && n >= 1024 ? n : 64 * 1024 * 1024;
})();
let morceauxLus = 0;
function sha1Fichier(f) {
  const h = crypto.createHash('sha1');
  const fd = fs.openSync(f, 'r');
  try {
    const tampon = Buffer.alloc(Math.max(1, Math.min(TAILLE_DU_MORCEAU, fs.fstatSync(fd).size)));
    for (;;) {
      const n = fs.readSync(fd, tampon, 0, tampon.length, null);
      if (n <= 0) break;
      morceauxLus++;
      h.update(n === tampon.length ? tampon : tampon.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}
const jourParis = (t = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const jourValide = (j) => typeof j === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j) && new Date(`${j}T12:00:00Z`).toISOString().slice(0, 10) === j;
const barres = (f) => f.split(path.sep).join('/');
// Le mode est cherché parmi les arguments (lancé dans une copie d'essai, le premier est le dossier server/ de la copie).
// (Le PREMIER mode trouvé : --preuve est aussi une option de --inscrire.)
const MODE = args.find((a) => ['--preuve', '--inscrire', '--verifier', '--extraire-reglages'].includes(a));
const option = (nom) => {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : undefined;
};

class Refus extends Error {}
const refuser = (texte) => {
  throw new Refus(texte);
};

/** Un fichier donné EXPLICITEMENT (jamais de chemin par défaut) ; refuse s'il manque. */
function fichierExige(nom, quoi) {
  const v = option(nom);
  if (!v) refuser(`${nom} : ${quoi} (argument explicite, aucun fichier par défaut)`);
  const f = path.resolve(v);
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) refuser(`${nom} : fichier introuvable (${barres(f)})`);
  return f;
}

/** Une base permise : un fichier, ni la vraie base ni la base du bac (ni leurs annexes), ni un lien, sans journal à côté. */
function baseDeLaPreuve(fichier) {
  if (!fichier) refuser('--base : la copie restaurée de la base');
  const f = path.resolve(fichier);
  // Le chemin d'abord, avant tout accès au disque : la vraie base et la base du bac ne sont jamais ouvertes, ni même regardées.
  const interdites = [VRAIE_BASE, baseParDefautDuBac(RACINE_BAC)].flatMap((b) => ['', '-wal', '-shm', '-journal'].map((s) => path.resolve(b + s).toLowerCase()));
  if (interdites.includes(f.toLowerCase())) refuser(`${f} : la vraie base ou la base du bac — jamais`);
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) refuser(`base introuvable : ${f}`);
  const reelle = fs.realpathSync.native(f).toLowerCase();
  if (interdites.includes(reelle)) refuser(`${f} : un autre nom de la vraie base ou de la base du bac — jamais`);
  // Un lien physique (plusieurs noms pour les mêmes octets) pourrait être la vraie base : seule une vraie copie est permise.
  if (fs.statSync(f).nlink > 1) refuser(`${f} : un fichier à plusieurs noms (lien physique) — faire une vraie copie de la base`);
  for (const s of ['-wal', '-journal']) if (fs.existsSync(f + s) && fs.statSync(f + s).size > 0) refuser(`${f}${s} existe : restaurer une copie complète de la base, sans journal à côté`);
  return f;
}

/** Le SCELLEMENT d'un bancDuDirect.js, relu comme TEXTE (jamais importé) ; null s'il est vide. */
function scellementDe(fichierBanc) {
  try {
    return R.scellementDuTexte(fs.readFileSync(fichierBanc, 'utf8'));
  } catch (error) {
    refuser(`${barres(fichierBanc)} : ${error.message}`);
  }
}

/** Le sha1 d'un module scellé sous un code (server/) : octets bruts ; bancDuDirect.js « à scellement vide » (etape46.mjs). */
function sha1DuModule(serveur, relatif) {
  const f = path.join(serveur, relatif);
  if (!fs.existsSync(f)) return null;
  if (relatif !== BANC_RELATIF) return sha1Fichier(f);
  const vide = R.texteAScellementVide(fs.readFileSync(f, 'utf8'));
  return vide === null ? null : sha1Texte(vide);
}

/** Un dossier server/ qui porte le harnais d'essai (test/aides/isolement.mjs et garde.mjs) et le banc du direct. */
function codeDe(nom) {
  const v = option(nom);
  if (!v) refuser(`${nom} : le dossier server/ de la version`);
  const s = path.resolve(v);
  for (const f of ['src/data/direct/bancDuDirect.js', 'src/data/simulation/simulationNuit.js', 'test/aides/isolement.mjs', 'test/aides/garde.mjs']) if (!fs.existsSync(path.join(s, f))) refuser(`${nom} : ${f} absent sous ${s}`);
  return s;
}

/**
 * Les fichiers d'un dossier --donnees (O16, m10 et I2) : chacun DANS la liste blanche (le calendrier et le relevé de cotes ;
 * chemin relatif à server/data/), aucun lien, aucun nom interdit ; rend { chemin relatif: sha1 }, trié. Refuse sinon.
 */
function fichiersDesDonnees(source, rel = '', sortie = {}) {
  for (const e of fs.readdirSync(path.join(source, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    const s = path.join(source, r);
    if (e.isSymbolicLink() || fs.lstatSync(s).isSymbolicLink()) refuser(`--donnees : un lien (${barres(s)})`);
    if (e.isDirectory()) fichiersDesDonnees(source, r, sortie);
    else {
      if (INTERDITS.test(e.name)) refuser(`--donnees : ${e.name} n'est jamais recopié par --donnees (réglages : --reglages-n / --reglages-np ; registre : --registre)`);
      if (!DONNEES_PERMISES.some((m) => m.test(r))) refuser(`--donnees : ${r} n'est pas dans la liste blanche (fixtures/…json, runtime/season-calendar.json, runtime/fixtures-status.json)`);
      sortie[r] = sha1Fichier(s);
    }
  }
  return Object.fromEntries(Object.entries(sortie).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Recopie les fichiers listés de --donnees dans server/data/ d'une copie, chacun recontrôlé à son sha1. */
function recopierDonnees(source, fichiers, cible) {
  for (const [r, s] of Object.entries(fichiers)) {
    const c = path.join(cible, ...r.split('/'));
    fs.mkdirSync(path.dirname(c), { recursive: true });
    fs.copyFileSync(path.join(source, ...r.split('/')), c);
    if (sha1Fichier(c) !== s) refuser(`--donnees : ${r} a changé pendant la preuve`);
  }
}

/** Un fichier de sortie (preuve, réglages extraits) : dans le bac, hors des pistes et hors OneDrive (O16, m11). */
function sortieDansLeBac(nom) {
  const v = option(nom);
  if (!v) refuser(`${nom} : le fichier à écrire (dans le bac, hors pistes et hors OneDrive)`);
  const f = path.resolve(v);
  const dossier = cheminReel(path.dirname(f));
  if (!estDans(f, RACINE_BAC) || !estDans(dossier, cheminReel(RACINE_BAC)) || estDans(dossier, cheminReel(path.join(RACINE_BAC, 'pistes'))) || /onedrive/i.test(dossier) || /onedrive/i.test(f)) refuser(`${nom} : un fichier du bac, hors des pistes et de OneDrive (${barres(f)})`);
  return f;
}

/** Un fichier de réglages donné (--reglages-n / --reglages-np) : jamais sous OneDrive, jamais nommé engine-config.json (O16, I3). */
function reglagesDonnes(nom, quoi) {
  const f = fichierExige(nom, quoi);
  if (/^engine-config\.json$/i.test(path.basename(f))) refuser(`${nom} : jamais un fichier nommé engine-config.json (les réglages se tirent du registre : --extraire-reglages)`);
  if (/onedrive/i.test(cheminReel(f)) || /onedrive/i.test(f)) refuser(`${nom} : jamais un fichier sous OneDrive (les réglages se tirent du registre : --extraire-reglages)`);
  return f;
}

/** Le dossier des copies de travail : dans le bac, hors des pistes (les réglages y passent le temps du calcul). */
function dossierDeTravail() {
  const v = option('--travail');
  // M3 (O16) : obligatoire — sans lui, les réglages de travail iraient dans le dossier d'essais d'une piste.
  if (!v) refuser("--travail : le dossier des copies de travail (dans le bac, hors des pistes et de OneDrive) — obligatoire");
  const d = path.resolve(v);
  const reel = cheminReel(d);
  if (!estDans(reel, cheminReel(RACINE_BAC)) || estDans(reel, cheminReel(path.join(RACINE_BAC, 'pistes'))) || /onedrive/i.test(reel)) refuser(`--travail : un dossier du bac, hors des pistes et de OneDrive (${barres(d)})`);
  fs.mkdirSync(d, { recursive: true });
  const restes = copiesDeTravailRestees(d);
  if (restes.length) refuser(`--travail : des copies de travail d'avant sont restées (${restes.join(', ')}) — les effacer d'abord (elles peuvent tenir des réglages)`);
  return d;
}

/** Les copies de travail du harnais (cm-tests-*) restées dans un dossier. */
function copiesDeTravailRestees(d) {
  return fs.existsSync(d) ? fs.readdirSync(d).filter((n) => n.startsWith('cm-tests-')) : [];
}

/** Le registre des versions donné (--registre) : ses identités { numéro: { code, reglages } } ; refuse s'il ne se lit pas. */
function registreDonne() {
  const f = fichierExige('--registre', 'une COPIE du registre des versions du moteur EN SERVICE (data/runtime/engine-versions.json)');
  if (/onedrive/i.test(cheminReel(f))) refuser("--registre : une COPIE, jamais le fichier de l'appli (sous OneDrive)");
  let brut;
  try {
    brut = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    refuser('--registre : JSON illisible');
  }
  const identites = R.identitesDuRegistre(brut);
  if (!identites) refuser("--registre : ce n'est pas un registre des versions lisible");
  return { fichier: f, sha1: sha1Fichier(f), identites, brut };
}

// ============================================================================================ --extraire-reglages

/** O16 (e) : les réglages de la version N, tirés du registre (champ `reglages`, tel quel), écrits une fois dans le bac. */
function extraireReglages() {
  const registre = registreDonne();
  const N = R.numeroStrict(option('--version'));
  if (N === null) refuser('--version : le numéro de la version (un entier)');
  const sortie = sortieDansLeBac('--sortie');
  if (/^engine-config\.json$/i.test(path.basename(sortie))) refuser('--sortie : jamais nommé engine-config.json');
  if (fs.existsSync(sortie)) refuser(`${barres(sortie)} existe déjà : jamais réécrit`);
  const entrees = registre.brut.versions.filter((v) => v?.numero === N);
  if (entrees.length !== 1) refuser(`--version ${N} : ${entrees.length} entrée(s) de ce numéro dans le registre (une seule attendue)`);
  const reglages = entrees[0].reglages;
  if (!reglages || typeof reglages !== 'object' || Array.isArray(reglages) || !reglages[R.SPORT_DES_REGLAGES] || typeof reglages[R.SPORT_DES_REGLAGES] !== 'object') refuser(`--version ${N} : le registre n'a pas de champ reglages { ${R.SPORT_DES_REGLAGES}: {…} } pour elle`);
  const texte = `${JSON.stringify(reglages, null, 2)}\n`;
  fs.mkdirSync(path.dirname(sortie), { recursive: true });
  fs.writeFileSync(sortie, texte, { flag: 'wx' });
  return { ok: true, mode: '--extraire-reglages', version: N, sortie: barres(sortie), sha1: sha1Texte(texte), attendu: registre.identites[N] ?? null, registre: registre.sha1 };
}

// ============================================================================================ --preuve

async function preuve() {
  const codeN = codeDe('--code-n');
  const codeNP = codeDe('--code-np');
  const base = baseDeLaPreuve(option('--base'));
  if (!option('--sortie')) refuser('--sortie : le fichier de la preuve (écrit une seule fois)');
  const sortie = sortieDansLeBac('--sortie');
  if (fs.existsSync(sortie)) refuser(`${sortie} existe déjà : une preuve n'est jamais réécrite`);
  const lues = R.nuitsDeLaPreuve(String(option('--nuits') ?? '').split(',').filter(Boolean), { maintenant: Date.now() });
  if (!lues.ok) refuser(`--nuits : ${lues.raisons.join(' ; ')}`);
  const nuits = lues.nuits;
  if (!option('--donnees')) refuser('--donnees : le dossier des données de ces nuits (calendrier, relevé de cotes) — obligatoire');
  const donnees = path.resolve(option('--donnees'));
  if (!fs.existsSync(donnees) || !fs.statSync(donnees).isDirectory()) refuser('--donnees : un dossier');
  const fichiersDonnees = fichiersDesDonnees(donnees);
  if (!Object.keys(fichiersDonnees).length) refuser('--donnees : aucun fichier');
  const reglages = { n: reglagesDonnes('--reglages-n', 'les réglages du moteur de N'), nPrime: reglagesDonnes('--reglages-np', 'les réglages du moteur de N′') };
  const registre = registreDonne();
  const attendues = { n: R.numeroStrict(option('--version-n')), nPrime: R.numeroStrict(option('--version-np')) };
  if (attendues.n === null || attendues.nPrime === null) refuser('--version-n et --version-np : les numéros attendus de N et de N′ (le registre donne leurs identités, contrôlées avant les nuits)');
  for (const [k, nom] of [['n', '--version-n'], ['nPrime', '--version-np']]) if (!R.identiteValide(registre.identites[attendues[k]])) refuser(`${nom} ${attendues[k]} : le registre donné n'a pas d'identité lisible pour ce numéro`);
  const travail = dossierDeTravail();
  const scellement = scellementDe(path.join(codeNP, BANC_RELATIF));
  if (!scellement) refuser("le banc de N′ n'est pas scellé : rien à reconduire");
  const scN = scellementDe(path.join(codeN, BANC_RELATIF));
  if (!scN || JSON.stringify(scN) !== JSON.stringify(scellement)) refuser('N et N′ ne portent pas le même SCELLEMENT');
  // (c) les modules du direct sous N′, face au sceau ; I5 (O16) : sous N aussi, et N doit être le sceau.
  const liste = R.modulesDuDirectDuSceau(scellement.modules);
  const changesSousN = liste.filter((f) => sha1DuModule(codeN, f) !== scellement.modules[f]);
  if (changesSousN.length) refuser(`les modules du direct de N ne sont pas ceux du sceau (${changesSousN.join(', ')}) : N doit être le code jugé par le banc`);
  const modulesDuDirect = Object.fromEntries(liste.map((f) => [f, sha1DuModule(codeNP, f)]));
  const modulesDuDirectChanges = liste.filter((f) => modulesDuDirect[f] !== scellement.modules[f]);
  const avecLectures = modulesDuDirectChanges.length > 0 || option('--lectures') === 'toujours';
  const variantes = scellement.declaration?.variantes ?? [];
  const sha1Base = sha1Fichier(base);
  const texteR = R.texteAReconductionsVides(fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'direct', 'reconductionDuDirect.js'), 'utf8'));
  if (texteR === null) refuser('reconductionDuDirect.js : balises des RECONDUCTIONS absentes');
  const script = { preuve: sha1Fichier(SCRIPT), calcul: sha1Fichier(CALCUL), reconduction: sha1Texte(texteR) };
  const cotes = {};
  for (const [cote, code] of [['n', codeN], ['nPrime', codeNP]]) cotes[cote] = { code, harnais: await import(pathToFileURL(path.join(code, 'test', 'aides', 'isolement.mjs')).href) };
  /** Une copie de travail d'un côté, ses réglages et le registre posés ; `avecBase` : la copie de la base (contrôlée) et les données. */
  const dansUneCopie = (cote, avecBase, faire) => {
    const { harnais } = cotes[cote];
    const copie = harnais.preparerCopie({ base: false, racine: travail });
    try {
      let fichierBase = copie.base;
      if (avecBase) {
        fichierBase = path.join(copie.dossier, 'base', 'match-stats.db');
        fs.mkdirSync(path.dirname(fichierBase), { recursive: true });
        fs.copyFileSync(base, fichierBase);
        if (sha1Fichier(fichierBase) !== sha1Base) refuser('copie de la base : sha1 différent');
        recopierDonnees(donnees, fichiersDonnees, path.join(copie.serveur, 'data'));
      }
      const runtime = path.join(copie.serveur, 'data', 'runtime');
      fs.mkdirSync(runtime, { recursive: true });
      fs.copyFileSync(reglages[cote], path.join(runtime, 'engine-config.json'));
      fs.copyFileSync(registre.fichier, path.join(runtime, 'engine-versions.json'));
      return faire({ ...copie, base: fichierBase }, harnais);
    } finally {
      copie.nettoyer();
    }
  };
  // I3 (O16) : AVANT les nuits, chaque code relit son identité avec ses réglages ; elle doit être celle du registre au numéro attendu.
  const identitesAvant = {};
  for (const [cote, qui] of [['n', 'N'], ['nPrime', 'N′']]) {
    const r = dansUneCopie(cote, false, (copie, harnais) => harnais.executer(copie, CALCUL, { args: ['--identite-seule', '--numeros', String(attendues[cote])], timeout: 10 * 60_000 }));
    if (r.code !== 0 || !r.json?.ok) refuser(`identité de ${qui} : lecture impossible — ${(r.erreurs || r.sortie).slice(-400)}`);
    const lue = { code: r.json.identite?.code ?? null, reglages: r.json.identite?.reglages ?? null };
    const attendue = registre.identites[attendues[cote]];
    if (lue.code !== attendue.code || lue.reglages !== attendue.reglages) refuser(`identité de ${qui} (avant les nuits) : le code relit code ${String(lue.code).slice(0, 8)}… + réglages ${String(lue.reglages).slice(0, 8)}…, le registre donne à la version ${attendues[cote]} code ${attendue.code.slice(0, 8)}… + réglages ${attendue.reglages.slice(0, 8)}… — rien calculé`);
    identitesAvant[cote] = lue;
  }
  const calculer = (cote, instant, fichierListe) =>
    dansUneCopie(cote, true, (copie, harnais) => {
      let listeDansLaCopie = null;
      if (fichierListe) {
        listeDansLaCopie = path.join(copie.dossier, 'liste.json');
        fs.copyFileSync(fichierListe, listeDansLaCopie);
      }
      const r = harnais.executer(copie, CALCUL, {
        args: ['--instant', instant, ...(listeDansLaCopie ? ['--liste', listeDansLaCopie] : []), ...(avecLectures ? ['--lectures', variantes.join(',')] : [])],
        maintenant: instant,
        timeout: 60 * 60_000
      });
      if (r.code !== 0 || !r.json?.ok) refuser(`calcul de ${cote === 'n' ? 'N' : 'N′'} à ${instant} : ${(r.erreurs || r.sortie).slice(-600)}`);
      return r.json;
    });
  const resultats = [];
  const identites = { n: null, nPrime: null };
  const registres = { n: {}, nPrime: {} };
  const zero = () => Object.fromEntries(R.CLES_DU_BILAN.map((k) => [k, 0]));
  const bilans = { n: zero(), nPrime: zero() };
  const echecs = { n: [], nPrime: [] };
  const travailListes = fs.mkdtempSync(path.join(travail, 'preuve-listes-'));
  try {
    for (const [k, instant] of nuits.entries()) {
      const a = calculer('n', instant, null);
      const fichierListe = path.join(travailListes, `liste-${k}-${Date.parse(instant)}.json`);
      fs.writeFileSync(fichierListe, JSON.stringify(a.liste ?? []));
      const b = calculer('nPrime', instant, fichierListe);
      for (const [cote, x] of [['n', a], ['nPrime', b]]) {
        const id = { code: x.identite?.code ?? null, reglages: x.identite?.reglages ?? null };
        if (!R.identiteValide(id)) refuser(`${cote === 'n' ? 'N' : 'N′'} : identité (code, réglages) illisible à ${instant}`);
        if (id.code !== identitesAvant[cote].code || id.reglages !== identitesAvant[cote].reglages) refuser(`${cote === 'n' ? 'N' : 'N′'} : l'identité a changé depuis le contrôle d'avant les nuits (${instant})`);
        if (identites[cote] && (identites[cote].code !== id.code || identites[cote].reglages !== id.reglages)) refuser(`${cote === 'n' ? 'N' : 'N′'} : l'identité a changé entre deux nuits`);
        identites[cote] = id;
        for (const [num, v] of Object.entries(x.registre ?? {})) registres[cote][num] = v;
        for (const c of R.CLES_DU_BILAN) bilans[cote][c] += Number.isInteger(x.bilan?.[c]) ? x.bilan[c] : 0;
        for (const qui of Array.isArray(x.sansLigne) ? x.sansLigne : []) echecs[cote].push(`${instant}|${qui}`);
      }
      resultats.push({ instant, a, b });
    }
  } finally {
    fs.rmSync(travailListes, { recursive: true, force: true });
  }
  for (const k of ['n', 'nPrime']) echecs[k] = [...new Set(echecs[k])].sort();
  const c = R.comparerLesNuits(resultats, { avecLectures });
  const seule = (liste) => (liste.length === 1 && Number.isInteger(liste[0]) ? liste[0] : null);
  const de = seule(c.versions.n);
  const vers = seule(c.versions.nPrime);
  const identiteLue = (cote, num) => (num !== null && R.identiteValide(registres[cote][num]) ? registres[cote][num] : null);
  const memes = (x, y) => x !== null && y !== null && x.code === y.code && x.reglages === y.reglages;
  const empreinteDonnees = sha1Texte(Object.entries(fichiersDonnees).map(([r, s]) => `${r} ${s}`).join(String.fromCharCode(10)));
  const objet = {
    format: R.FORMAT_DE_LA_PREUVE,
    quoi: "preuve d'identité de reconduction (étape 46, § 2.7 ; PROJET § 1 point 7 (b) et (c) ; O15, O16) : aucune issue de match lue ni écrite",
    script,
    de,
    vers,
    versionsLues: false,
    grille: c.grille,
    voie: 'recalcul-bac',
    faiteLe: new Date().toISOString(),
    nuits: c.nuits,
    jours: nuits,
    rencontres: c.rencontres,
    lignesComparees: c.lignesComparees,
    nulles: c.nulles,
    ecartMax: c.ecartMax,
    modulesDuDirect,
    modulesDuDirectChanges,
    lectures: c.lectures,
    codes: { n: { serveur: barres(codeN), empreinte: identites.n.code }, nPrime: { serveur: barres(codeNP), empreinte: identites.nPrime.code } },
    reglages: { n: { fichier: sha1Fichier(reglages.n), empreinte: identites.n.reglages }, nPrime: { fichier: sha1Fichier(reglages.nPrime), empreinte: identites.nPrime.reglages } },
    registre: { sha1: registre.sha1, de: identiteLue('n', de), vers: identiteLue('nPrime', vers) },
    base: { sha1: sha1Base, octets: fs.statSync(base).size },
    donnees: { empreinte: empreinteDonnees, fichiers: fichiersDonnees },
    cotes: c.cotes,
    bilans,
    echecs,
    seulementN: c.seulementN,
    seulementNPrime: c.seulementNPrime,
    differences: c.differences,
    identique: false
  };
  objet.versionsLues = de !== null && vers !== null && memes(objet.registre.de, identites.n) && memes(objet.registre.vers, identites.nPrime);
  objet.identique = R.identiqueSelonLesNombres(objet);
  const controle = R.controlerUnePreuve(objet);
  if (!controle.ok) refuser(`la preuve ne passe pas son propre contrôle (rien d'écrit) : ${controle.raisons.join(' ; ')}`);
  const texte = R.texteDeLaPreuve(objet);
  fs.mkdirSync(path.dirname(sortie), { recursive: true });
  fs.writeFileSync(sortie, texte, { flag: 'wx' });
  const restes = copiesDeTravailRestees(travail);
  const pourquoiPas = R.raisonsDeNePasInscrire(objet);
  return {
    ok: true,
    mode: '--preuve',
    sortie: barres(sortie),
    sha1: sha1Texte(texte),
    identique: objet.identique,
    inscriptible: objet.identique && pourquoiPas.length === 0,
    pourquoiPas,
    nuits: objet.nuits,
    rencontres: objet.rencontres,
    lignesComparees: objet.lignesComparees,
    nulles: objet.nulles,
    cotes: objet.cotes,
    echecs: { n: echecs.n.length, nPrime: echecs.nPrime.length, memes: JSON.stringify(echecs.n) === JSON.stringify(echecs.nPrime) },
    ecartMax: objet.ecartMax,
    modulesDuDirectChanges,
    lectures: objet.lectures,
    de,
    vers,
    versionsLues: objet.versionsLues,
    identites: { n: identites.n, nPrime: identites.nPrime },
    identitesAvantLesNuits: identitesAvant,
    base: objet.base,
    donnees: { empreinte: empreinteDonnees, fichiers: Object.keys(fichiersDonnees).length },
    morceauxLus,
    travail: restes.length ? `NON VIDE : ${restes.join(', ')}` : 'dossier vide',
    seulementN: objet.seulementN,
    seulementNPrime: objet.seulementNPrime,
    differences: objet.differences.slice(0, 5)
  };
}

// ============================================================================================ --inscrire et --verifier

/** La preuve relue : à son sha1, au texte EXACT que ce script écrit (une retouche à la main se voit), et recontrôlée. */
function lirePreuve(fichier, sha1Attendu) {
  if (!fs.existsSync(fichier)) return { ok: false, raison: `preuve introuvable : ${fichier}` };
  const octets = fs.readFileSync(fichier);
  if (sha1Texte(octets) !== sha1Attendu) return { ok: false, raison: `preuve : sha1 ${sha1Texte(octets)} ≠ ${sha1Attendu}` };
  const texte = octets.toString('utf8');
  let p;
  try {
    p = JSON.parse(texte);
  } catch {
    return { ok: false, raison: 'preuve : JSON illisible' };
  }
  if (R.texteDeLaPreuve(p) !== texte) return { ok: false, raison: "preuve : ce n'est pas le texte exact écrit par le script (preuve retouchée)" };
  const c = R.controlerUnePreuve(p);
  if (!c.ok) return { ok: false, raison: c.raisons.join(' ; ') };
  return { ok: true, preuve: p };
}

/** Le chemin de la preuve tel qu'inscrit : relatif au bac quand elle y est, sinon absolu ; barres obliques. */
const cheminInscrit = (f) => barres(estDans(path.resolve(f), RACINE_BAC) ? path.relative(RACINE_BAC, path.resolve(f)) : path.resolve(f));
const cheminRelu = (f) => (path.isAbsolute(f) ? f : path.join(RACINE_BAC, f));

/** Le texte du module, ses balises contrôlées : { avant, apres } — l'inscription se pose juste avant la ligne « ]); ». */
function blocDesReconductions(texte) {
  const i = texte.indexOf(BALISES[0]);
  const j = texte.indexOf(BALISES[1]);
  if (i < 0 || j < i || texte.indexOf(BALISES[0], i + 1) >= 0 || texte.indexOf(BALISES[1], j + 1) >= 0) refuser('reconductionDuDirect.js : balises absentes, en double ou dans le désordre');
  const bloc = texte.slice(i, j);
  const fin = bloc.lastIndexOf(']);\n');
  if (!bloc.includes('export const RECONDUCTIONS = Object.freeze([\n') || fin < 0 || bloc.slice(fin) !== ']);\n') refuser('reconductionDuDirect.js : bloc RECONDUCTIONS d’une forme inconnue');
  return { avant: texte.slice(0, i) + bloc.slice(0, fin), apres: bloc.slice(fin) + texte.slice(j) };
}

const importerFrais = (fichier) => import(`${pathToFileURL(fichier).href}?lu=${Date.now()}-${Math.random()}`);

/** La cible EXPLICITE de --inscrire : EXACTEMENT <bac>/code/server/src/data/direct/reconductionDuDirect.js (O16, m11), hors OneDrive. */
function cibleDeLInscription() {
  const v = option('--fichier');
  if (!v) refuser("--fichier : la cible explicite (…/code/server/src/data/direct/reconductionDuDirect.js du bac) — jamais d'office le code d'où le script est lancé");
  const f = path.resolve(v);
  const parties = f.split(path.sep).slice(-5).map((x) => x.toLowerCase());
  if (parties.join('/') !== 'server/src/data/direct/reconductiondudirect.js') refuser(`--fichier : un …/server/src/data/direct/reconductionDuDirect.js (${barres(f)})`);
  if (!fs.existsSync(f)) refuser(`--fichier : introuvable (${barres(f)})`);
  const reel = cheminReel(f);
  if (!estDans(f, RACINE_BAC) || !estDans(reel, cheminReel(RACINE_BAC))) refuser(`--fichier : hors du bac à sable (${barres(f)}) — l'inscription se fait dans le bac, puis se recopie`);
  if (/onedrive/i.test(reel)) refuser(`--fichier : sous OneDrive (${barres(reel)}) — jamais l'appli de Pierre`);
  const exacte = path.join(RACINE_BAC, 'code', 'server', 'src', 'data', 'direct', 'reconductionDuDirect.js');
  if (f.toLowerCase() !== exacte.toLowerCase() || reel.toLowerCase() !== cheminReel(exacte).toLowerCase()) refuser(`--fichier : exactement ${barres(exacte)} (le code du bac, jamais une piste ni une copie) — ici ${barres(f)}`);
  return f;
}

/** Écrit un fichier par un fichier temporaire à côté, puis un renommage (jamais un fichier à moitié écrit). */
function ecrireParRenommage(fichier, texte) {
  const tmp = `${fichier}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, texte, { flag: 'wx' });
  try {
    fs.renameSync(tmp, fichier);
  } catch (error) {
    fs.rmSync(tmp, { force: true });
    throw error;
  }
}

/** Les modules du direct relus SUR LE DISQUE d'un code (server/) face à ceux d'une inscription : la liste des écarts. */
function modulesQuiOntBouge(serveur, modules) {
  return Object.entries(modules ?? {})
    .filter(([f, s]) => sha1DuModule(serveur, f) !== s)
    .map(([f]) => f);
}

async function inscrire() {
  const fichier = cibleDeLInscription();
  const dossier = path.dirname(fichier);
  const serveurCible = path.resolve(dossier, '..', '..', '..');
  const fichierPreuve = option('--preuve');
  const sha1 = option('--sha1');
  const N = R.numeroStrict(option('--version-jugee'));
  const historique = option('--historique');
  const baseAttendue = option('--base-attendue');
  const entree = option('--entree-en-service');
  const aujourdhui = jourParis();
  if (!fichierPreuve || !/^[0-9a-f]{40}$/.test(sha1 ?? '')) refuser('--preuve <fichier> et --sha1 <sha1 de la preuve>');
  if (N === null) refuser('--version-jugee : la version N jugée au banc du direct (un entier)');
  if (!/^[0-9a-f]{40}$/.test(baseAttendue ?? '')) refuser('--base-attendue : le sha1 de la copie restaurée de la base, noté au journal le jour de la preuve (O16, I2)');
  if (!historique || !historique.trim()) refuser("--historique : la référence de l'entrée d'historique qui cite l'inscription");
  if (entree !== undefined && !jourValide(entree)) refuser('--entree-en-service : un jour AAAA-MM-JJ');
  const registre = registreDonne();
  const lue = lirePreuve(path.resolve(fichierPreuve), sha1);
  if (!lue.ok) refuser(lue.raison);
  const p = lue.preuve;
  const pasInscrire = R.raisonsDeNePasInscrire(p);
  if (pasInscrire.length) refuser(pasInscrire.join(' ; '));
  if (p.script.preuve !== sha1Fichier(SCRIPT) || p.script.calcul !== sha1Fichier(CALCUL)) refuser("la preuve n'a pas été faite par ce script (sha1 du script ou du calcul différent) : la refaire avec lui");
  // m8 (O16) : reconductionDuDirect.js, à RECONDUCTIONS vide, est celui de la preuve — celui qu'importe ce script ET la cible.
  const sha1R = (f) => {
    const x = R.texteAReconductionsVides(fs.readFileSync(f, 'utf8'));
    return x === null ? null : sha1Texte(x);
  };
  if (p.script.reconduction !== sha1R(path.join(SERVEUR, 'src', 'data', 'direct', 'reconductionDuDirect.js')) || p.script.reconduction !== sha1R(fichier)) refuser("la preuve n'a pas été faite avec ce reconductionDuDirect.js (celui du script ou celui de la cible a changé hors du bloc des inscriptions) : la refaire");
  // I2 (O16) : la preuve est celle de la base attendue, et la phrase d'historique cite le sha1 de la base et celui des données.
  if (p.base.sha1 !== baseAttendue) refuser(`la preuve a été faite sur la base ${p.base.sha1.slice(0, 12)}…, pas sur la base attendue ${baseAttendue.slice(0, 12)}…`);
  for (const [quoi, s] of [['de la base', p.base.sha1], ['des données', p.donnees.empreinte]]) if (!historique.includes(s.slice(0, 12))) refuser(`--historique : la phrase doit citer le sha1 ${quoi} (au moins ses 12 premiers caractères : ${s.slice(0, 12)})`);
  // N′ est le code où l'on inscrit : son empreinte relue, et ses modules du direct sur le disque = ceux de la preuve.
  const EV = await import(pathToFileURL(path.join(serveurCible, 'src', 'core', 'engine', 'engineVersions.js')).href);
  const empreinteCible = EV.empreinteDuCode({ racine: path.join(serveurCible, 'src'), rafraichir: true }).empreinte;
  if (empreinteCible !== p.codes.nPrime.empreinte) refuser(`le code où l'on inscrit (${empreinteCible.slice(0, 12)}…) n'est pas N′ de la preuve (${p.codes.nPrime.empreinte.slice(0, 12)}…)`);
  const bouges = modulesQuiOntBouge(serveurCible, p.modulesDuDirect);
  if (bouges.length) refuser(`modules du direct différents de la preuve sur le disque du code où l'on inscrit : ${bouges.join(', ')}`);
  // La note du banc : posée, et elle juge N.
  const note = (await importerFrais(path.join(dossier, 'noteDuDirect.js'))).NOTE_DU_DIRECT;
  if (!note) refuser("aucune note du banc posée : rien à reconduire (une reconduction s'inscrit quand le banc a jugé N)");
  if (R.numeroStrict(note.version) !== N) refuser(`la note du banc juge la version ${note.version}, pas ${N}`);
  const scellement = scellementDe(path.join(dossier, 'bancDuDirect.js'));
  if (!scellement) refuser("le banc du direct n'est pas scellé : rien à reconduire");
  const i = {
    de: p.de,
    vers: p.vers,
    grille: p.grille,
    le: aujourdhui,
    ...(entree !== undefined ? { entreeEnService: entree } : {}),
    nuits: p.nuits,
    rencontres: p.rencontres,
    lignesComparees: p.lignesComparees,
    ecartMax: p.ecartMax,
    voie: p.voie,
    empreintes: { de: { code: p.codes.n.empreinte, reglages: p.reglages.n.empreinte }, vers: { code: p.codes.nPrime.empreinte, reglages: p.reglages.nPrime.empreinte } },
    modulesDuDirect: p.modulesDuDirect,
    modulesDuDirectChanges: p.modulesDuDirectChanges,
    lectures: p.lectures,
    preuve: { fichier: cheminInscrit(fichierPreuve), sha1, contenu: p },
    historique: historique.trim()
  };
  const texte = fs.readFileSync(fichier, 'utf8');
  const { avant, apres } = blocDesReconductions(texte);
  const { RECONDUCTIONS } = await importerFrais(fichier);
  const identiteDe = (n) => registre.identites[n] ?? null;
  const c = R.controlerUneInscription(i, { scellement, versionJugee: N, aujourdhui, toutes: [...RECONDUCTIONS, i], identiteDe, sha1: sha1Texte });
  if (!c.ok) refuser(`inscription refusée : ${c.raisons.join(' ; ')}`);
  const ligne = `  geler(${JSON.stringify(i)}),\n`;
  const nouveau = avant + ligne + apres;
  if (nouveau.replace(ligne, '') !== texte) refuser('ajout pur impossible');
  const sha1Avant = sha1Texte(texte);
  ecrireParRenommage(fichier, nouveau);
  try {
    const relu = (await importerFrais(fichier)).RECONDUCTIONS;
    const derniere = relu.at(-1);
    if (relu.length !== RECONDUCTIONS.length + 1 || JSON.stringify(derniere) !== JSON.stringify(i) || R.reconductionPour({ grille: i.grille, de: i.de, vers: i.vers }, relu, { scellement, identiteDe, sha1: sha1Texte, aujourdhui }) !== derniere) {
      throw new Refus("relue, l'inscription n'est pas trouvée");
    }
  } catch (error) {
    ecrireParRenommage(fichier, texte);
    refuser(`inscription défaite (le fichier est rendu à l'octet) : ${error.message}`);
  }
  return { ok: true, mode: '--inscrire', fichier: barres(fichier), base: p.base.sha1, donnees: p.donnees.empreinte, cotes: p.cotes, sha1Avant, sha1Apres: sha1Fichier(fichier), inscription: { ...i, preuve: { fichier: i.preuve.fichier, sha1 } }, sha1Texte: sha1Texte(JSON.stringify(i)) };
}

async function verifier() {
  const fichier = path.resolve(option('--fichier') ?? FICHIER_PAR_DEFAUT);
  const serveurCode = path.resolve(path.dirname(fichier), '..', '..', '..');
  const registre = registreDonne();
  blocDesReconductions(fs.readFileSync(fichier, 'utf8'));
  const { RECONDUCTIONS } = await importerFrais(fichier);
  const scellement = scellementDe(path.join(path.dirname(fichier), 'bancDuDirect.js'));
  const aujourdhui = jourParis();
  const identiteDe = (n) => registre.identites[n] ?? null;
  const inscriptions = RECONDUCTIONS.map((i) => {
    const c = R.controlerUneInscription(i, { scellement, aujourdhui, toutes: RECONDUCTIONS, identiteDe, sha1: sha1Texte });
    const raisons = [...c.raisons];
    if (!scellement) raisons.push("le banc du direct n'est pas scellé");
    // Les modules RELUS SUR LE DISQUE (le code où est l'inscription) face à ceux de la preuve.
    for (const f of modulesQuiOntBouge(serveurCode, i?.modulesDuDirect)) raisons.push(`module ${f} : sur le disque, il n'a plus le sha1 de la preuve`);
    // Le fichier gardé de la preuve, s'il est là : le même octet pour octet que la copie de l'inscription.
    let preuveSurLeDisque = 'absente';
    const chemin = typeof i?.preuve?.fichier === 'string' ? cheminRelu(i.preuve.fichier) : null;
    if (chemin && fs.existsSync(chemin)) {
      preuveSurLeDisque = sha1Fichier(chemin) === i.preuve.sha1 ? 'la-meme' : 'differente';
      if (preuveSurLeDisque === 'differente') raisons.push(`le fichier de la preuve (${i.preuve.fichier}) n'a plus son sha1`);
    }
    return { de: i?.de ?? null, vers: i?.vers ?? null, ok: raisons.length === 0, preuveSurLeDisque, raisons };
  });
  return { ok: inscriptions.every((x) => x.ok), mode: '--verifier', fichier: barres(fichier), registre: registre.sha1, inscriptions };
}

try {
  const faire = { '--preuve': preuve, '--inscrire': inscrire, '--verifier': verifier, '--extraire-reglages': extraireReglages }[MODE];
  if (!faire) refuser('mode : --extraire-reglages, --preuve, --inscrire ou --verifier');
  console.log(JSON.stringify(await faire()));
} catch (error) {
  console.log(JSON.stringify({ ok: false, mode: MODE ?? null, refus: error instanceof Refus, raison: String(error?.message ?? error) }));
  process.exitCode = 1;
}
