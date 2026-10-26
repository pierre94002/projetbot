/**
 * gardeDesChiffres.js — LA GARDE DES CHIFFRES du bulletin du jour et du bilan de la semaine (étape 42 du plan,
 * 22/10/2026).
 * -----------------------------------------------------------------------
 * LA RÈGLE de Pierre pour ces deux textes : l'IA résume et commente, elle n'écrit JAMAIS un chiffre à elle. Tous les
 * chiffres sont calculés par le code (la fiche chiffrée envoyée à l'IA, bulletinFiches.js) ; un texte qui en cite un
 * autre — une cote inventée, un pourcentage arrondi ou recalculé, un total qu'elle a fait elle-même — est FAUX, et il
 * s'agit de paris : un chiffre faux sur l'écran se lit comme un fait.
 *
 * CE QUE LA GARDE FAIT, À LA LETTRE : tout nombre du texte qui n'est pas dans la fiche fait REFUSER le texte entier.
 * Choix assumé (refuser plutôt que signaler) :
 *   - signaler (afficher le texte avec une marque sur le chiffre douteux) mettrait la vérification sur Pierre, à
 *     l'instant même où il décide d'un pari ; refuser garantit que tout texte affiché a passé la garde ;
 *   - le prix d'un refus est borné : le texte n'est pas écrit, le motif est dit à l'écran (les chiffres refusés), l'appel
 *     a consommé du quota et il est compté comme tel (journal, plafond), et la passe suivante recommence — trois essais
 *     par jour au plus, jamais d'enchaînement dans la même passe ;
 *   - le texte est court et bâti sur une fiche chiffrée complète (comptes, totaux et pourcentages déjà écrits) : une
 *     IA qui suit la consigne n'a aucune raison de sortir de la fiche.
 *
 * CE QUI COMPTE COMME UN NOMBRE :
 *   - tout nombre en chiffres : « 1,95 », « 1.95 », « 58 % », « 1 234 », « 21 h 30 », « 22/10/2026 », « 2-1 » (chacun
 *     de ses nombres), « −3,2 » (sa valeur absolue : « perte » ou « gain » portent le signe) ;
 *   - une valeur compte, pas une écriture : « 2,2 » et « 2,20 » sont le même nombre, « 02 » et « 2 » aussi. Mais
 *     « 58 » n'est pas « 57,6 » : l'IA n'arrondit pas, elle reprend ;
 *   - un nombre écrit en lettres, de trois à seize, et vingt, trente, quarante, cinquante, soixante, cent, mille : il doit
 *     valoir un nombre de la fiche (ou être un mot de la fiche). « un », « une » et « deux » ne sont PAS contrôlés
 *     (« les deux équipes », « un match » : des mots de tous les jours, pas des chiffres) ; « pour cent » non plus, ni
 *     « le onze » ou « les onze » quand le mot nomme la composition (voir plus bas).
 * CE QUI N'EN EST PAS UN : un chiffre collé à une lettre qui le précède (« N2 », « U21 », « J7 » : un nom), et « 1N2 » /
 * « 1X2 » (le nom du marché du résultat).
 *
 * « ONZE », LE NOM (correctif du 26/10/2026) : au football, « le onze » est la composition d'une équipe, pas le nombre 11.
 * Le bulletin du 25/10 a été refusé trois fois puis abandonné pour « FotMob ne publie les onze qu'environ une heure avant
 * le coup d'envoi ». LA RÈGLE, la plus simple qui reste sûre : « onze » est le NOM, et n'est pas contrôlé, seulement quand
 * DEUX conditions tiennent ensemble —
 *   1. un déterminant juste avant : le, les, un, des, du, au, aux, ce, cet, ces, son, ses, leur, leurs, mon, mes, ton,
 *      tes, notre, nos, votre, vos ;
 *   2. et juste après, rien qui puisse être compté : la fin du texte, une ponctuation, un début de proposition (« qu' »,
 *      « que », « qui », « dont »), ou un complément du nom (« de départ », « de base », « type », « titulaire »,
 *      « probable », « officiel », « habituel », au singulier ou au pluriel).
 * Tout le reste compte : « les onze matchs », « les onze derniers matchs », « onze sur douze », « onze points », « à onze
 * contre dix », « le onze novembre » restent des nombres contrôlés. La règle dit ce qui SUIT le mot plutôt que la liste
 * des noms qu'il pourrait compter (une liste qu'on ne finit jamais) : un mot inattendu après « onze » le laisse compté —
 * le texte est refusé à tort, jamais accepté à tort. La limite connue : « les onze qu'il a gagnés », où « onze » compte
 * un nom dit plus tôt (« matchs »), passe — mais ce nom a d'abord été compté là où il était écrit (« onze matchs »), et
 * c'est là que la garde le refuse. Seul « onze » est concerné : « le dix », « les trois » n'ont pas ce sens au football.
 *
 * LES NOMBRES AUTORISÉS sont ceux du texte de la fiche TELLE QUE L'IA L'A LUE (le message envoyé), pas ceux d'un objet
 * plus riche que le code garde de son côté : ce que l'IA n'a pas vu, elle ne peut pas le citer.
 *
 * Pur : pas de disque, pas de réseau, pas d'horloge.
 * -----------------------------------------------------------------------
 */

/** Les nombres en lettres contrôlés (de trois à seize, les dizaines, cent, mille). « deux » et « un » : volontairement absents. */
export const NOMBRES_EN_LETTRES = Object.freeze({
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  vingt: 20,
  trente: 30,
  quarante: 40,
  cinquante: 50,
  soixante: 60,
  cent: 100,
  mille: 1000
});

/** Combien de caractères d'un texte autour d'un chiffre refusé sont gardés pour le dire. */
const EXTRAIT = 48;

/** Les espaces insécables (nombres français), fines et étroites, ramenées à l'espace simple. */
const espacesSimples = (t) => String(t ?? '').replace(/[\u00A0\u2009\u202F]/g, ' ');

/**
 * Le texte prêt à lire : espaces simples, groupes de milliers réunis (« 1 234 » → « 1234 », seulement pour des groupes de
 * trois chiffres collés par UNE espace et non suivis d'un autre chiffre), noms de marché sans valeur retirés.
 */
function normaliser(texte) {
  let t = espacesSimples(texte);
  // « 21h30 » : les deux nombres sont lus (le second serait sinon collé à une lettre).
  t = t.replace(/(\d)h(\d)/gi, '$1 h $2');
  // Les milliers : « 1 234 » → « 1234 » (jamais la partie décimale d'un nombre : « 2,20 150 » reste deux nombres).
  t = t.replace(/(?<![\p{L}\p{N}])(?<!\d[.,])(\d{1,3})((?: \d{3})+)(?!\d)/gu, (m, tete, groupes) => `${tete}${groupes.replace(/ /g, '')}`);
  // « 1N2 », « 1X2 », « 1/N/2 » : le nom du marché du résultat, pas des nombres.
  t = t.replace(/(?<![\p{L}\p{N}])1\s?[NX]\s?2(?![\p{L}\p{N}])/giu, ' ').replace(/(?<![\p{L}\p{N}])1\/[NX]\/2(?![\p{L}\p{N}])/giu, ' ');
  return t;
}

/** La clé d'un nombre : sa valeur (6 décimales au plus), pour que « 2,2 » et « 2,20 » soient le même. */
const cleDuNombre = (valeur) => String(Number(Number(valeur).toFixed(6)));

const MOTIF_NOMBRE = /(?<![\p{L}_\d])(\d+(?:[.,]\d+)?)/gu;

/**
 * Les nombres en chiffres d'un texte : [{ texte: « 1,95 », valeur: 1.95, cle: « 1.95 », debut }]. Un chiffre collé à une
 * lettre qui le précède (« N2 ») n'en est pas un.
 */
export function nombresEnChiffres(texte) {
  const t = normaliser(texte);
  const liste = [];
  for (const m of t.matchAll(MOTIF_NOMBRE)) {
    const valeur = Number(m[1].replace(',', '.'));
    if (!Number.isFinite(valeur)) continue;
    liste.push({ texte: m[1], valeur, cle: cleDuNombre(valeur), debut: m.index });
  }
  return liste;
}

const MOTIF_LETTRES = new RegExp(`(?<![\\p{L}\\p{N}])(${Object.keys(NOMBRES_EN_LETTRES).join('|')})(?![\\p{L}\\p{N}])`, 'giu');

/** « onze », le NOM (la composition) : un déterminant juste avant (le texte qui PRÉCÈDE le mot finit ainsi). */
const AVANT_LE_ONZE_NOM = /(?:^|[^\p{L}\p{N}])(?:le|les|un|des|du|au|aux|ce|cet|ces|son|ses|leur|leurs|mon|mes|ton|tes|notre|nos|votre|vos)\s+$/iu;
/**
 * … et juste après, rien qui puisse être compté (le texte qui SUIT le mot commence ainsi) : la fin du texte, une
 * ponctuation, « qu' » / « que » / « qui » / « dont », ou un complément du nom. « qu » suivi d'autre chose qu'une lettre :
 * l'apostrophe droite comme la courbe, sans avoir à écrire la seconde.
 */
const APRES_LE_ONZE_NOM = /^(?:\s*$|\s*[^\p{L}\p{N}\s]|\s+(?:qu(?!\p{L})|que|qui|dont|de\s+départ|de\s+base|types?|titulaires?|probables?|officiels?|habituels?)(?![\p{L}\p{N}]))/iu;

/** Vrai quand « onze » (de `debut` à `fin` dans le texte normalisé `t`) est le NOM — la composition —, pas le nombre 11. */
export function onzeEstLeNom(t, debut, fin) {
  return AVANT_LE_ONZE_NOM.test(t.slice(0, debut)) && APRES_LE_ONZE_NOM.test(t.slice(fin));
}

/**
 * Les nombres écrits en lettres (ceux de NOMBRES_EN_LETTRES) : [{ texte, valeur, cle, mot, debut }]. « pour cent » n'en est
 * pas un, « le onze » / « les onze » (la composition) non plus — voir l'en-tête.
 */
export function nombresEnLettres(texte) {
  const t = normaliser(texte);
  const liste = [];
  for (const m of t.matchAll(MOTIF_LETTRES)) {
    const mot = m[1].toLowerCase();
    if (mot === 'cent' && /pour\s*$/i.test(t.slice(Math.max(0, m.index - 6), m.index))) continue;
    if (mot === 'onze' && onzeEstLeNom(t, m.index, m.index + m[1].length)) continue;
    const valeur = NOMBRES_EN_LETTRES[mot];
    liste.push({ texte: m[1], valeur, cle: cleDuNombre(valeur), mot, debut: m.index });
  }
  return liste;
}

/** Ce que la fiche autorise : les valeurs de ses nombres et ses mots (pour un nombre en lettres déjà écrit dans la fiche). */
export function autorisationsDeLaFiche(fiche) {
  const texte = normaliser(fiche);
  const valeurs = new Set(nombresEnChiffres(texte).map((n) => n.cle));
  const mots = new Set([...texte.toLowerCase().matchAll(/\p{L}+/gu)].map((m) => m[0]));
  return { valeurs, mots };
}

const extraitAutour = (texte, debut, longueur) => {
  const t = espacesSimples(texte);
  const a = Math.max(0, debut - EXTRAIT);
  const b = Math.min(t.length, debut + longueur + EXTRAIT);
  return `${a > 0 ? '…' : ''}${t.slice(a, b).replace(/\s+/g, ' ').trim()}${b < t.length ? '…' : ''}`;
};

/**
 * LA GARDE. `textes` : { nomDuChamp: texte } (le titre, le résumé, chaque section du texte de l'IA) ; `fiche` : le texte
 * de la fiche envoyée à l'IA.
 * @returns {{ ok: boolean, politique: 'refuser', nombresVus: number, nombresDeLaFiche: number,
 *            refuses: Array<{ nombre: string, valeur: number, enLettres: boolean, champ: string, extrait: string }> }}
 *   `ok` seulement quand AUCUN nombre du texte n'est absent de la fiche. Un même nombre refusé n'est dit qu'une fois par champ.
 */
export function verifierLesChiffres({ textes, fiche }) {
  const { valeurs, mots } = autorisationsDeLaFiche(fiche);
  const refuses = [];
  let vus = 0;
  for (const [champ, texte] of Object.entries(textes ?? {})) {
    if (typeof texte !== 'string' || !texte) continue;
    const dejaDit = new Set();
    for (const n of nombresEnChiffres(texte)) {
      vus++;
      if (valeurs.has(n.cle)) continue;
      const cle = `${n.cle}|chiffres`;
      if (dejaDit.has(cle)) continue;
      dejaDit.add(cle);
      refuses.push({ nombre: n.texte, valeur: n.valeur, enLettres: false, champ, extrait: extraitAutour(normaliser(texte), n.debut, n.texte.length) });
    }
    for (const n of nombresEnLettres(texte)) {
      vus++;
      if (valeurs.has(n.cle) || mots.has(n.mot)) continue;
      const cle = `${n.cle}|lettres`;
      if (dejaDit.has(cle)) continue;
      dejaDit.add(cle);
      refuses.push({ nombre: n.texte, valeur: n.valeur, enLettres: true, champ, extrait: extraitAutour(normaliser(texte), n.debut, n.texte.length) });
    }
  }
  return { ok: refuses.length === 0, politique: 'refuser', nombresVus: vus, nombresDeLaFiche: valeurs.size, refuses };
}

/** Les chiffres refusés, dits en une phrase simple (« 1,95 ; 62 ; trois »), pour l'écran et le résumé de l'étape. */
export function refusesDits(refuses, { max = 6 } = {}) {
  const noms = [...new Set((refuses ?? []).map((r) => r.nombre))];
  return `${noms.slice(0, max).join(' ; ')}${noms.length > max ? ` ; … (${noms.length} au total)` : ''}`;
}
