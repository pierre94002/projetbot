/**
 * blocRecette.js — le bloc « Essai général » de l'étape 47 sur la feuille de route (étape 47 du plan, lot 1, passe P4a,
 * 17/11/2026 ; patron bancEtape27.js).
 * -----------------------------------------------------------------------
 * PUR : il met en forme ce que etatDeLaRecette.js a LU (le battement, les fichiers du jour, decisions.json) et, plus tard,
 * la note de code du bilan (bilanDeLaRecette.js, lot 1 P7, rempli au lot 3) ; aucune lecture, aucune écriture, aucune
 * horloge (`maintenant` est passé). La STRUCTURE est complète à tout moment (principe d'affichage de ui/DESIGN.md) :
 * toujours 14 lignes de jours, une ligne Σ et une ligne ⌀, les six critères du bilan, la liste des causes ; un chiffre
 * absent vaut null et l'écran dit ce qui manque. Jamais de Σ d'un pourcentage (il n'y en a aucun dans le tableau).
 *
 * Les moments (conception § 1.2, CR-3, CR-29, CR-53) :
 *   'avant'   le journal n'a jamais tourné (ni battement, ni jour lu)             → PH-1 ;
 *   'rodage'  J0 pas écrit (lot 1b) : tout est noté, rien n'est compté           → PH-2 ;
 *   'recette' J1 à J14 (second essai après une relance : PH-3b)                  → PH-3 à PH-9, PH-23 ;
 *   'apres'   après J14, avant la note du bilan                                  → PH-10.
 * La note du bilan, quand elle existe, replie la carte et donne au bloc « Preuve après lancement » de la 47 le MÊME
 * verdict, le même nombre de matchs et les mêmes dates (CR-10 : mesureAvecLaNote).
 *
 * LA NOTE DU BILAN (contrat pour bilanDeLaRecette.js, P7) : null, ou { mesure: { le, verdict, raison, matchs, fenetre:
 * { de, a }, gain, fourchette, quoi, variantes, version }, criteres: { [id]: { mot, preuve } } } ; chaque champ peut
 * manquer (T-F4) : le bloc ne lève jamais pour une note partielle.
 * Fermeture des imports (consigne § 2.3 P3-P4) : calendrierDeLaRecette.js, causesConnues.js, classerLesEvenements.js
 * (node:crypto) ; ni refreshStatusRepository.js, ni matchStatsDb.js, ni env.js.
 * -----------------------------------------------------------------------
 */

import { RECETTE, jourZero, finDeLaRecette, ajouterJours, estUnJour, joursEntre, jourDeParis, debutDuJourDeParis } from '../recette/calendrierDeLaRecette.js';
import { CAUSES_CONNUES } from '../recette/causesConnues.js';
import { appliquerLesDecisions, episodes as episodesDe, decompte, ageDUnAExpliquer, borneDuNiveau, NON_SURVEILLE, DUREE_MAX_PANNE_FOTMOB_MS } from '../recette/classerLesEvenements.js';

/** Le journal « ne tourne plus » au-delà de 25 min sans tour (même seuil que le trou du battement, CR-3 point 2). */
export const SEUIL_DE_VIE_MIN = 25;

/** Les six critères du bilan, dans l'ordre de la fiche (conception § 1.3). */
export const CRITERES_DU_BILAN = Object.freeze([
  Object.freeze({ id: 'sans-panne', titre: 'Deux semaines sans panne non expliquée' }),
  Object.freeze({ id: 'restauration', titre: 'Restauration d’essai' }),
  Object.freeze({ id: 'panne-simulee', titre: 'Panne simulée « FotMob muet »' }),
  Object.freeze({ id: 'tests', titre: 'Tests automatiques' }),
  Object.freeze({ id: 'gain', titre: 'Gain du moteur face au départ' }),
  Object.freeze({ id: 'regime', titre: 'Régime de croisière et première revue du mois' })
]);

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const texte = (x) => (typeof x === 'string' ? x : null);
const objet = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : null);
/** L'heure de Paris d'un instant, « 14 h 05 » (P4b-1, RC-25), ou null. */
const heureDeParis = (instant) => {
  const t = typeof instant === 'number' ? instant : Date.parse(instant);
  if (!Number.isFinite(t)) return null;
  const [h, m] = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(t)).split(':');
  return `${Number(h)} h ${m}`;
};

/** P4b-1 (RC-12) : au-delà de 25 min « non observées » dans un jour, la case est ambre. */
export const NON_OBSERVE_AMBRE_MIN = 25;

/** La première phrase d'une explication (le dépliant de la liste, CR-30 point 1). */
export const premierePhrase = (t) => {
  const s = String(t ?? '');
  const m = /^.*?[.!?](?=\s|$)/.exec(s);
  return (m ? m[0] : s).trim();
};

/** P4b-1 (RC-19) : le nom en mots de chaque borne (jamais le nom du champ). */
export const NOMS_DES_BORNES = Object.freeze({ anomalies: 'nombre d’anomalies', nonCalcules: 'championnats non calculés', inconnus: 'équipes inconnues', championnats: 'championnats' });

/** La borne d'une cause, en mots (CR-30 point 1, RC-19) : fixée au début de l'essai, fixe, ou « sans borne ». */
export function borneDeLaCause(c) {
  const morceaux = [];
  for (const [nom, b] of Object.entries(c?.bornes ?? {})) {
    const mots = NOMS_DES_BORNES[nom] ?? 'nombre relevé';
    if (b && 'liste' in b) morceaux.push(Array.isArray(b.liste) ? `${b.liste.length} championnat${b.liste.length > 1 ? 's' : ''} relevé${b.liste.length > 1 ? 's' : ''} au début de l’essai` : 'championnats relevés au début de l’essai');
    else morceaux.push(fini(b?.niveauJ0) ? `${mots} : au plus ${borneDuNiveau(b.niveauJ0)} (niveau du début de l’essai : ${b.niveauJ0})` : `${mots} : borne fixée au début de l’essai`);
  }
  for (const r of c?.reconnait?.etapes ?? []) if (fini(r?.nombre?.max)) morceaux.push(`au plus ${r.nombre.max} échecs dans la passe`);
  for (const r of c?.reconnait?.ia ?? []) {
    if (fini(r?.echecsMax)) morceaux.push(`au plus ${r.echecsMax} échecs dans la journée`);
    if (r?.unJourParSemaine) morceaux.push('au plus un jour par semaine de la recette');
  }
  if ((c?.reconnait?.fotmob ?? []).some((r) => (r?.etats ?? []).includes('en-panne'))) morceaux.push(`un épisode de ${DUREE_MAX_PANNE_FOTMOB_MS / 3_600_000} h observées au plus`);
  return [...new Set(morceaux)].join(' ; ') || 'sans borne';
}

/** La liste des causes telle que la carte la déplie (CR-30 point 1) : « Ce qui est compté comme connu (n) ». */
export function listeDesCauses(causes = CAUSES_CONNUES, recette = RECETTE) {
  return {
    scellee: typeof recette?.empreinteDesCauses === 'string' && recette.empreinteDesCauses.length === 40,
    empreinte: texte(recette?.empreinteDesCauses),
    n: causes.length,
    // RC-19 : la phrase simple de chaque cause (pourPierre) ; l'explication technique reste dans causesConnues.js.
    causes: causes.map((c) => ({ id: c.id, titre: c.titre, phrase: texte(c.pourPierre) ?? premierePhrase(c.explication), statut: c.statut, mode: c.mode === 'a-la-main' ? 'à la main' : 'reconnue d’office', borne: borneDeLaCause(c) }))
  };
}

/**
 * CR-10 : le jugement de la 47 lu dans la note du bilan, dans la forme de resumeJugement (trialsRegistry.js:370-390),
 * ou null (pas de note, ou une note sans verdict : « pas encore jugée »). Ne lève jamais.
 */
export function jugementDeLaNote(note) {
  const m = objet(objet(note)?.mesure);
  if (!m || !texte(m.verdict)) return null;
  const fenetre = objet(m.fenetre) ?? {};
  // P4b-1 (RC-22) : « rien à mesurer » n'a ni gain ni fourchette (jamais « +0,0 % » à l'écran).
  const rien = m.verdict === 'rien-a-mesurer';
  const f = rien ? null : m.fourchette;
  return {
    le: texte(m.le),
    quoi: texte(m.quoi) ?? '',
    mesure: 'recette',
    principal: true,
    version: texte(m.version),
    lancement: null,
    verdict: m.verdict,
    raison: texte(m.raison) ?? '',
    n: { matchs: fini(m.matchs) ? m.matchs : null, blocs: null, lignes: null },
    fenetre: { de: texte(fenetre.de), a: texte(fenetre.a) },
    enPourcent: { gain: !rien && fini(m.gain) ? m.gain : null, fourchette: Array.isArray(f) && f.length === 2 && f.every(fini) ? [...f] : null, quoi: texte(m.quoi) ?? '' },
    seuil: { variantes: fini(m.variantes) ? m.variantes : null }
  };
}

/**
 * CR-10 : la `mesure` de l'étape 47 pour la feuille de route. Avec une note qui porte un verdict, `jugement` est rempli
 * depuis la note (le registre du bac n'arrive jamais chez Pierre) ; sans note, la mesure lue au registre reste telle
 * quelle (« pas encore jugée »). Une mesure absente et une note présente donnent une mesure minimale. Ne lève jamais.
 */
export function mesureAvecLaNote(mesure, note) {
  const j = jugementDeLaNote(note);
  if (!j) return mesure ?? null;
  const m = objet(mesure) ?? { aJuger: true, registre: 'note-de-code', lancement: null, variantes: null };
  // Un registre illisible ne cache pas la note de code : la page dit le verdict de la note.
  return { ...m, registre: m.registre === 'illisible' ? 'note-de-code' : m.registre, jugement: j };
}

/** Une ligne de jour vide (à venir, ou sans date avant J0). */
const ligneVide = (jour, numero, etat) => ({ jour, numero, etat, rodage: false, aujourdhui: false, passes: null, veilleMin: null, arretMin: null, nonObserveMin: null, connues: null, aPart: null, nouvelles: null, aExpliquer: null, sauvegarde: null, appelsIa: null, couverture: null, evenements: [], probleme: null });

/**
 * P4b-1 (RC-12) : les minutes « non observées » d'un jour (ni observées, ni veille, ni arrêt), plus celles en erreur. Un
 * jour fini : sa valeur écrite, sinon 1 440 moins les quatre parts ; aujourd'hui : le temps écoulé depuis minuit (Paris)
 * moins les quatre parts. Jamais négatif.
 */
function nonObserveDuJour({ jour, cv, maintenant, aujourdhui }) {
  const part = (x) => (fini(x) ? x : 0);
  const quatre = part(cv.minutesObservees) + part(cv.minutesDeVeille) + part(cv.minutesArret) + part(cv.minutesEnErreur);
  let reste;
  if (jour === aujourdhui) {
    const minuit = debutDuJourDeParis(jour);
    reste = fini(minuit) ? Math.max(0, Math.round((maintenant - minuit) / 60_000) - quatre) : 0;
  } else reste = fini(cv.minutesNonObservees) ? Math.max(0, cv.minutesNonObservees) : Math.max(0, 1440 - quatre);
  return { nonObserveeMin: reste, totalMin: reste + part(cv.minutesEnErreur) };
}

/** Une ligne de jour lue : ses comptes et ses événements (décisions appliquées, classe d'arrivée gardée à côté). */
function ligneLue({ jour, numero, resume, decisions, causes, maintenant, aujourdhui }) {
  const r = objet(resume) ?? {};
  const evs = appliquerLesDecisions((Array.isArray(r.evenements) ? r.evenements : []).filter((e) => objet(e) && e.classe !== 'info'), decisions);
  const titre = (id) => causes.find((c) => c.id === id)?.titre ?? null;
  const parClasse = (c) => evs.filter((e) => e.classeFinale === c).length;
  const cv = objet(r.couverture) ?? {};
  const p = objet(r.passes) ?? {};
  const s = objet(r.sauvegarde);
  const no = nonObserveDuJour({ jour, cv, maintenant, aujourdhui });
  return {
    jour,
    numero,
    etat: 'observe',
    rodage: r.phase === 'rodage' || evs.some((e) => e.rodage === true),
    aujourdhui: jour === aujourdhui,
    passes: { faites: fini(p.total) ? p.total : 0, aRegarder: (fini(p.partielles) ? p.partielles : 0) + (fini(p.enEchec) ? p.enEchec : 0) },
    veilleMin: fini(cv.minutesDeVeille) ? cv.minutesDeVeille : 0,
    arretMin: fini(cv.minutesArret) ? cv.minutesArret : 0,
    nonObserveMin: no.totalMin,
    connues: parClasse('connue'),
    aPart: parClasse('a-part'),
    nouvelles: parClasse('nouvelle'),
    aExpliquer: parClasse('a-expliquer'),
    sauvegarde: s ? (s.ok === false ? 'en échec' : 'faite') : 'aucune',
    appelsIa: fini(objet(r.ia)?.appels) ? r.ia.appels : null,
    tokensIa: fini(objet(r.ia)?.tokens) ? r.ia.tokens : null,
    restauration: objet(r.restauration) ? { le: texte(r.restauration.le), saine: r.restauration.saine === true } : null,
    direct: { suspensions: fini(r.direct?.suspensions) ? r.direct.suspensions : 0, minutes: fini(r.direct?.minutesSuspendu) ? r.direct.minutesSuspendu : 0 },
    couverture: { observeeMin: fini(cv.minutesObservees) ? cv.minutesObservees : 0, veilleMin: fini(cv.minutesDeVeille) ? cv.minutesDeVeille : 0, arretMin: fini(cv.minutesArret) ? cv.minutesArret : 0, enErreurMin: fini(cv.minutesEnErreur) ? cv.minutesEnErreur : 0, nonObserveeMin: no.nonObserveeMin },
    evenements: evs.map((e) => ({
      id: e.id,
      type: texte(e.type),
      cle: texte(e.cle),
      heure: heureDeParis(e.le),
      le: texte(e.le),
      classe: e.classeFinale,
      classeArrivee: e.classe,
      cause: e.causeFinale ?? null,
      causeTitre: titre(e.causeFinale),
      texte: String(e.texte ?? '').slice(0, 300),
      raison: texte(e.raison),
      decision: e.decision ? { le: e.decision.le, sorte: e.decision.sorte, raison: e.decision.raison, auteur: e.decision.auteur ?? null } : null,
      age: e.classeFinale === 'a-expliquer' ? ageDUnAExpliquer(e, maintenant)?.texte ?? null : null,
      ageCourt: e.classeFinale === 'a-expliquer' ? ageDUnAExpliquer(e, maintenant)?.court ?? null : null,
      rodage: e.rodage === true
    })),
    probleme: null
  };
}

const somme = (lignes, cle) => lignes.reduce((n, l) => n + (fini(l[cle]) ? l[cle] : 0), 0);

/**
 * LE BLOC. `etat` : ce que etatDeLaRecette a lu ; `note` : la note du bilan ou null. Rend la structure complète (voir
 * l'en-tête). Ne lève pas pour un état ou une note incomplets (T-F4) ; la feuille de route l'enveloppe quand même d'un
 * try/catch (R-S9).
 */
export function blocDeLaRecette({ etat, note = null, maintenant = Date.now(), recette = etat?.recette ?? RECETTE, causes = CAUSES_CONNUES } = {}) {
  const e = objet(etat) ?? {};
  const aujourdhui = jourDeParis(maintenant);
  const j0 = jourZero(recette);
  const fin = finDeLaRecette(recette);
  const relances = Array.isArray(recette?.relances) ? recette.relances.length : 0;
  const decisions = Array.isArray(e.decisions) ? e.decisions.filter(objet) : [];
  const lus = (Array.isArray(e.jours) ? e.jours : []).filter((x) => objet(x) && estUnJour(x.jour ?? ''));

  // Les 14 lignes : J1 à J14 quand J0 est écrit ; sinon les jours du rodage, complétés par des lignes à venir sans date.
  const lignes = [];
  for (const x of lus.slice(0, 14)) {
    const numero = j0 ? joursEntre(j0, x.jour) : null;
    if (x.etat === 'a-venir' || (estUnJour(aujourdhui ?? '') && x.jour > aujourdhui)) lignes.push(ligneVide(x.jour, numero, 'a-venir'));
    else if (x.etat === 'lu') lignes.push(ligneLue({ jour: x.jour, numero, resume: x.resume, decisions, causes, maintenant, aujourdhui }));
    else if (x.etat === 'illisible') lignes.push({ ...ligneVide(x.jour, numero, 'illisible'), probleme: 'fichier du jour illisible pour l’instant' });
    else lignes.push(ligneVide(x.jour, numero, x.jour === aujourdhui ? 'en-cours' : 'non-observe'));
  }
  while (lignes.length < 14) lignes.push(ligneVide(j0 ? ajouterJours(j0, lignes.length + 1) : null, j0 ? lignes.length + 1 : null, 'a-venir'));
  if (!j0) for (const l of lignes) if (l.jour) l.rodage = true;

  const vues = lignes.filter((l) => l.etat === 'observe');
  const vuesFinies = vues.filter((l) => !l.aujourdhui);
  const totaux = {
    joursObserves: vues.length,
    passesFaites: vues.reduce((n, l) => n + l.passes.faites, 0),
    passesARegarder: vues.reduce((n, l) => n + l.passes.aRegarder, 0),
    veilleMin: somme(vues, 'veilleMin'),
    arretMin: somme(vues, 'arretMin'),
    nonObserveMin: somme(vues, 'nonObserveMin'),
    connues: somme(vues, 'connues'),
    aPart: somme(vues, 'aPart'),
    nouvelles: somme(vues, 'nouvelles'),
    aExpliquer: somme(vues, 'aExpliquer'),
    sauvegardesFaites: vues.filter((l) => l.sauvegarde === 'faite').length,
    appelsIa: vues.some((l) => fini(l.appelsIa)) ? somme(vues, 'appelsIa') : null,
    tokensIa: vues.some((l) => fini(l.tokensIa)) ? somme(vues, 'tokensIa') : null,
    joursAvecIa: vues.filter((l) => fini(l.appelsIa)).length
  };
  const parJour = (x, n) => (n > 0 && fini(x) ? Math.round((x / n) * 10) / 10 : null);
  const moyennes = { passesFaites: parJour(totaux.passesFaites, vues.length), veilleMin: parJour(totaux.veilleMin, vues.length), arretMin: parJour(totaux.arretMin, vues.length), nonObserveMin: parJour(totaux.nonObserveMin, vues.length), appelsIa: parJour(totaux.appelsIa, totaux.joursAvecIa), tokensIa: parJour(totaux.tokensIa, totaux.joursAvecIa) };

  // Le décompte et les épisodes (CR-27 à CR-29) : seulement sur la fenêtre J1-J14, jamais sur le rodage.
  const dc = j0 ? decompte({ jours: lus.filter((x) => x.etat === 'lu' && objet(x.resume)).map((x) => ({ ...x.resume, jour: x.jour })), decisions, recette, aujourdhui }) : null;
  const evenementsDeLaFenetre = vues.filter((l) => !l.rodage).flatMap((l) => l.evenements);
  const ep = dc?.episodes ?? episodesDe([]);
  const titre = (id) => causes.find((c) => c.id === id)?.titre ?? id;
  // La clé d'une nouvelle, comme episodes() la calcule (classerLesEvenements.js) : sa cause, sinon « type|clé ».
  const cleDeLaNouvelle = (x) => x.cause ?? `${x.type}|${x.cle ?? '-'}`;
  const premierNouveau = (cle) => evenementsDeLaFenetre.find((x) => x.classe === 'nouvelle' && cleDeLaNouvelle(x) === cle) ?? null;
  const restaurations = vues.map((l) => l.restauration).filter(Boolean);

  // La vie du journal (CR-3 point 3, PH-23) : le battement comparé à l'heure, HORS de la boucle.
  const b = objet(e.battement);
  const dernierTour = texte(b?.dernierTour);
  const ageMin = dernierTour && Number.isFinite(Date.parse(dernierTour)) ? Math.max(0, Math.round((maintenant - Date.parse(dernierTour)) / 60_000)) : null;
  const aDemarre = Boolean(b) || lus.some((x) => x.etat === 'lu') || estUnJour(e.premierJour ?? '');

  let moment;
  if (!j0) moment = aDemarre ? 'rodage' : 'avant';
  else moment = estUnJour(aujourdhui ?? '') && fin && aujourdhui > fin ? 'apres' : 'recette';

  const jugement = jugementDeLaNote(note);
  const criteresNote = objet(objet(note)?.criteres) ?? {};
  // P4b-1 (RC-20) : « indisponible » seulement si RIEN n'a été lu (chemins refusés, lecture en erreur) ; un fichier
  // illisible parmi d'autres est dit sur sa ligne et dans une ligne ambre, sans cacher le reste.
  const illisibles = (Array.isArray(e.illisibles) ? e.illisibles : []).filter((x) => objet(x) && texte(x.nom));
  const rienLu = !b && !lus.some((x) => x.etat === 'lu');
  const indisponible = e.lisible === false && rienLu;
  const probleme = illisibles.length
    ? `Fichier${illisibles.length > 1 ? 's' : ''} illisible${illisibles.length > 1 ? 's' : ''} pour l’instant : ${illisibles.map((x) => `${x.nom} (${x.probleme})`).join(' ; ')} ; rien n’est perdu, ${illisibles.length > 1 ? 'ils seront relus' : 'il sera relu'}.`
    : e.lisible === false
      ? texte(e.probleme) ?? 'journal illisible pour l’instant'
      : null;
  // RC-21 : d'où viennent les chiffres (les dossiers lus sur ce PC).
  const ch = objet(e.chemins);
  return {
    version: 1,
    titre: 'Essai général',
    moment,
    replie: Boolean(jugement),
    indisponible,
    probleme,
    decisionsIllisibles: e.decisionsIllisibles === true,
    provenance: { journal: texte(ch?.journal), racine: texte(ch?.racine), dernierTour, ageMin },
    aujourdhui,
    calendrier: { rodageDepuis: texte(recette?.rodageDepuis) ?? (estUnJour(e.premierJour ?? '') ? e.premierJour : null), j0, debut: j0 ? ajouterJours(j0, 1) : null, fin, jours: recette?.jours ?? 14, numero: j0 && estUnJour(aujourdhui ?? '') ? Math.max(0, Math.min(recette.jours, joursEntre(j0, aujourdhui))) : null, relances, second: relances > 0 },
    vie: { aDemarre, dernierTour, ageMin, tourne: ageMin !== null && ageMin <= SEUIL_DE_VIE_MIN, seuilMin: SEUIL_DE_VIE_MIN },
    colonnes: ['Jour', 'Passes (faites / avec un point à regarder)', 'Veille (durée)', 'Arrêté (durée)', 'Non observé (durée)', 'Événements connus', 'Nouvelles', 'À expliquer', 'Sauvegarde', 'Appels à l’IA'],
    seuilNonObserveMin: NON_OBSERVE_AMBRE_MIN,
    jours: lignes,
    totaux,
    moyennes,
    decompte: dc ? { etat: dc.etat, phrase: dc.phrase, nouvelles: dc.nouvelles.map((n) => ({ cle: n.cle, rechute: n.rechute, evenements: n.evenements.length, premier: premierNouveau(n.cle) })), aExpliquer: dc.aExpliquer.length, aPart: (dc.aPart ?? []).length, joursNonObserves: dc.joursNonObserves, relanceProposee: dc.relanceProposee } : null,
    episodes: {
      reconnues: ep.connues.filter((x) => x.reconnues > 0).map((x) => ({ cause: x.cause, titre: titre(x.cause), jours: x.jours, premierJour: x.premierJour, dernierJour: x.dernierJour, evenements: x.reconnues })),
      rattachees: ep.connues.flatMap((x) => x.rattachees.map((r) => ({ cause: x.cause, titre: titre(x.cause), id: r.id, raison: r.raison, le: r.le })))
    },
    aExpliquer: evenementsDeLaFenetre.filter((x) => x.classe === 'a-expliquer').map((x) => ({ id: x.id, le: x.le, heure: x.heure, texte: x.texte, age: x.age, court: x.ageCourt })),
    aPart: evenementsDeLaFenetre.filter((x) => x.classe === 'a-part').map((x) => ({ id: x.id, le: x.le, texte: x.texte, auteur: x.decision?.auteur ?? null, raison: x.decision?.raison ?? null })),
    sauvegardes: { faites: totaux.sauvegardesFaites, jours: vuesFinies.length + vues.filter((l) => l.aujourdhui && l.sauvegarde === 'faite').length, joursNonObserves: lignes.filter((l) => l.etat === 'non-observe').length, restaurations: { saines: restaurations.filter((r) => r.saine).length, total: restaurations.length, derniere: restaurations.at(-1)?.le ?? null } },
    ia: { appels: totaux.appelsIa, tokens: totaux.tokensIa, jours: totaux.joursAvecIa, tokensParJour: moyennes.tokensIa },
    direct: { suspensions: vues.reduce((n, l) => n + l.direct.suspensions, 0), minutes: vues.reduce((n, l) => n + l.direct.minutes, 0) },
    liste: listeDesCauses(causes, recette),
    nonSurveille: NON_SURVEILLE,
    criteres: CRITERES_DU_BILAN.map((c) => {
      const x = objet(criteresNote[c.id]);
      return { id: c.id, titre: c.titre, mot: texte(x?.mot) ?? 'à faire', preuve: texte(x?.preuve) };
    }),
    bilan: jugement ? { verdict: jugement.verdict, matchs: jugement.n.matchs, fenetre: jugement.fenetre, le: jugement.le } : null
  };
}
