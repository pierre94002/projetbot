/**
 * calendrierDeLaRecette.js — LES DATES DE LA RECETTE GÉNÉRALE (étape 47 du plan, lot 1 ; squelette écrit le 17/11/2026).
 * -----------------------------------------------------------------------
 * Une seule constante, RECETTE, écrite EN DUR dans le code (jamais par un script de l'appli, jamais dans un fichier
 * d'exécution), et des fonctions PURES qui la lisent (aucun fichier, aucune base, aucun réseau, aucune horloge : le jour
 * est toujours passé en argument).
 *
 *   rodageDepuis       le premier jour du rodage (jour de Paris, « AAAA-MM-JJ »), ou null : le rodage commence au
 *                      premier démarrage du journal (mise en service n° 1). Rien n'est compté pendant le rodage.
 *   debut              J0 (le jour de la mise en service n° 2, celle du lot 1b). null jusqu'au lot 1b : ÉCRIT EN DUR AU
 *                      LOT 1b par l'orchestrateur, jamais avant. Tant qu'il vaut null, tout est « rodage ».
 *   jours              14 : la recette compte J1 à J14 (J1 = le lendemain de J0).
 *   relances           [{ le, apres }] : une relance après une panne nouvelle corrigée ; son `le` devient le nouveau J0 (les
 *                      deux semaines repartent le lendemain). Une relance sans changement de l'empreinte du moteur ne
 *                      déplace PAS le début de la fenêtre de mesure (CR-1 point 4, CR-29 point 3).
 *   empreinteDesCauses sha1 de causesConnues.js, écrit au lot 1b (le scellé de J0) ; null avant.
 *   debutDeLaFenetre   le début de la fenêtre de MESURE (décision D47-1, choix (b)) : le lendemain, 00:00 heure de Paris,
 *                      du dernier changement de pourcentage avant J0. null jusqu'au lot 1b : ÉCRIT EN DUR AU LOT 1b par
 *                      l'orchestrateur. Tant qu'il vaut null, aucune mesure n'est possible (fenetreDeMesure le refuse,
 *                      etape47.mjs --mesurer sort en erreur avec la phrase « début de la fenêtre non fixé »).
 *
 * Les jours du journal sont des jours de PARIS (jourDeParis). Les jours de la mesure, eux, sont des jours du magasin
 * (UTC) : la mesure ne lit que debutDeLaFenetre et finDeLaRecette, jamais un jour de Paris calculé ici (CR-52).
 * -----------------------------------------------------------------------
 */

export const RECETTE = Object.freeze({
  rodageDepuis: null,
  debut: null,
  jours: 14,
  relances: Object.freeze([]),
  empreinteDesCauses: null,
  debutDeLaFenetre: null
});

/** La phrase de refus d'une mesure tant que le début de la fenêtre n'est pas écrit (D47-1 point 4). */
export const DEBUT_NON_FIXE = 'début de la fenêtre non fixé';

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/** Vrai pour un jour « AAAA-MM-JJ » qui existe au calendrier. */
export function estUnJour(jour) {
  if (typeof jour !== 'string' || !JOUR.test(jour)) return false;
  const d = new Date(`${jour}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === jour;
}

/** Le jour « AAAA-MM-JJ » décalé de n jours (calcul en UTC sur la date seule : pas d'heure d'été en jeu). */
export function ajouterJours(jour, n) {
  if (!estUnJour(jour) || !Number.isInteger(n)) throw new RangeError(`jour ou décalage invalide : ${jour}, ${n}`);
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Le nombre de jours de `a` à `b` (b − a). */
export function joursEntre(a, b) {
  if (!estUnJour(a) || !estUnJour(b)) throw new RangeError(`jour invalide : ${a}, ${b}`);
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const FORMAT_PARIS = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Le jour de Paris (« AAAA-MM-JJ ») d'un instant (ms ou ISO), ou null s'il est illisible. */
export function jourDeParis(instant) {
  const ms = typeof instant === 'number' ? instant : Date.parse(instant);
  if (!Number.isFinite(ms)) return null;
  const p = Object.fromEntries(FORMAT_PARIS.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * P4b-1 (RC-12) : l'instant (ms) du minuit de Paris qui ouvre le jour « AAAA-MM-JJ », ou null. Pur. Sert à couper un trou
 * ou un arrêt aux minuits de Paris (chaque jour garde sa part, jamais plus de 1 440 min).
 */
export function debutDuJourDeParis(jour) {
  if (!estUnJour(jour)) return null;
  const base = Date.parse(jour + 'T00:00:00Z');
  for (const h of [-2, -1, 0]) {
    const t = base + h * 3_600_000;
    if (jourDeParis(t) === jour && jourDeParis(t - 1) !== jour) return t;
  }
  return null;
}

/**
 * Ce qui ne va pas dans une RECETTE (liste vide = rien) : jours mal écrits, J0 avant le rodage, relances mal formées ou
 * pas dans l'ordre, empreinte qui n'est pas un sha1, début de fenêtre après J0. Un essai exige la liste vide.
 */
export function problemesDuCalendrier(recette = RECETTE) {
  const p = [];
  const r = recette ?? {};
  for (const cle of ['rodageDepuis', 'debut', 'debutDeLaFenetre']) {
    if (r[cle] !== null && !estUnJour(r[cle])) p.push(`${cle} : « ${r[cle]} » n'est pas un jour AAAA-MM-JJ`);
  }
  if (r.jours !== 14) p.push(`jours : ${r.jours} au lieu de 14`);
  if (!Array.isArray(r.relances)) p.push('relances : pas une liste');
  else {
    let avant = r.debut;
    r.relances.forEach((x, i) => {
      if (!x || !estUnJour(x.le) || typeof x.apres !== 'string' || !x.apres.trim()) p.push(`relance ${i + 1} : { le, apres } attendu`);
      else if (!estUnJour(avant ?? '')) p.push(`relance ${i + 1} : une relance sans J0 écrit`);
      else if (joursEntre(avant, x.le) <= 0) p.push(`relance ${i + 1} : le ${x.le} n'est pas après ${avant}`);
      else avant = x.le;
    });
  }
  if (r.empreinteDesCauses !== null && !/^[0-9a-f]{40}$/.test(String(r.empreinteDesCauses))) p.push('empreinteDesCauses : pas un sha1');
  if (estUnJour(r.rodageDepuis) && estUnJour(r.debut) && joursEntre(r.rodageDepuis, r.debut) < 0) p.push('debut avant rodageDepuis');
  if (estUnJour(r.debutDeLaFenetre) && estUnJour(r.debut) && joursEntre(r.debutDeLaFenetre, r.debut) < 0) p.push('debutDeLaFenetre après debut');
  if (r.debutDeLaFenetre !== null && r.debut === null) p.push('debutDeLaFenetre écrit sans debut (les deux s’écrivent au lot 1b)');
  return p;
}

/** J0 en vigueur : le `le` de la dernière relance, sinon `debut` ; null avant le lot 1b. */
export function jourZero(recette = RECETTE) {
  if (!estUnJour(recette?.debut ?? '')) return null;
  const relances = Array.isArray(recette.relances) ? recette.relances.filter((x) => estUnJour(x?.le ?? '')) : [];
  return relances.length ? relances.at(-1).le : recette.debut;
}

/** J14 de la fenêtre en vigueur (le dernier jour compté), ou null avant le lot 1b. */
export function finDeLaRecette(recette = RECETTE) {
  const j0 = jourZero(recette);
  return j0 ? ajouterJours(j0, recette.jours) : null;
}

/**
 * La phase d'un jour de Paris : 'avant' (avant rodageDepuis), 'rodage' (jusqu'à J0 compris, ou tant que J0 n'est pas
 * écrit), 'recette' (J1 à J14), 'croisiere' (après J14). `numero` = 1..14 pendant la recette, sinon null.
 */
export function phaseDuJour(jour, recette = RECETTE) {
  if (!estUnJour(jour)) return { phase: null, numero: null, probleme: `jour invalide : ${jour}` };
  if (estUnJour(recette?.rodageDepuis ?? '') && joursEntre(recette.rodageDepuis, jour) < 0) return { phase: 'avant', numero: null };
  const j0 = jourZero(recette);
  if (!j0) return { phase: 'rodage', numero: null };
  const n = joursEntre(j0, jour);
  if (n <= 0) return { phase: 'rodage', numero: null };
  if (n <= recette.jours) return { phase: 'recette', numero: n };
  return { phase: 'croisiere', numero: null };
}

/**
 * La fenêtre de la MESURE (D47-1, choix (b)) : { fixee: true, debut: debutDeLaFenetre, fin: J14 } ; tant que le début
 * (ou J0) n'est pas écrit : { fixee: false, raison: DEBUT_NON_FIXE }. Une relance ne déplace pas le début de la fenêtre.
 */
export function fenetreDeMesure(recette = RECETTE) {
  if (!estUnJour(recette?.debutDeLaFenetre ?? '')) return { fixee: false, raison: DEBUT_NON_FIXE };
  const fin = finDeLaRecette(recette);
  if (!fin) return { fixee: false, raison: DEBUT_NON_FIXE };
  return { fixee: true, debut: recette.debutDeLaFenetre, fin };
}
