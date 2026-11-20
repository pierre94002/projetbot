/**
 * recette.js — les mots de la carte « Essai général » de l'étape 47 sur la feuille de route (étape 47 du plan, lot 1,
 * passe P4a, 17/11/2026, retouchée en P4b-1 ; RoadmapStep → RecetteCarte ; patron bancAvantApres.js). Pur : rejoué par
 * server/test/recetteFeuilleDeRoute.test.mjs.
 *
 * Le serveur a tout lu et tout compté (server/src/data/roadmap/blocRecette.js, depuis les fichiers du journal de la
 * recette, jamais la base) ; ici, on met en forme — jours « 22/11 », durées « 2 h 05 », heures « 14 h 05 », nombres à
 * la française — et on dit ce qui manque (« non observé : aucun fichier du journal ce jour-là », « — » pour un jour à
 * venir). La structure est complète à tout moment : 14 lignes de jours, une ligne Σ, une ligne ⌀ (jamais de Σ d'un
 * pourcentage), les six critères du bilan. Phrases de la conception (§ 1.2, PH-1 à PH-10) corrigées par la critique
 * (PH-3b, PH-4c : CR-29 ; PH-23 : CR-3 ; colonnes et « Appels à l'IA » : CR-53 ; liste dépliée : CR-30) puis par la
 * relecture de la première écriture (P4b-1 : RC-12, RC-17 à RC-25).
 */

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const nombreFr = (n) => Number(n).toLocaleString('fr-FR');

/** « 2026-11-22 » → « 22/11 » (sur le texte du jour : le fuseau ne décale rien). */
export const jourCourt = (j) => (JOUR.test(j ?? '') ? `${j.slice(8, 10)}/${j.slice(5, 7)}` : '');

/** L'heure de Paris d'un instant : « 11 h 50 », ou null si l'instant est illisible. */
function heureDite(instant) {
  const t = Date.parse(instant ?? '');
  if (!Number.isFinite(t)) return null;
  const [h, m] = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(t)).split(':');
  return `${Number(h)} h ${m}`;
}

/** P4b-1 (RC-20 point 5) : le jour de Paris d'un instant, ou null s'il est illisible (jamais d'exception). */
const jourDeParis = (instant) => {
  const t = Date.parse(instant ?? '');
  return Number.isFinite(t) ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date(t)) : null;
};

/** « le 22/11 à 14 h 05 », ou « date illisible ». */
const quandDit = (instant) => {
  const j = jourDeParis(instant);
  return j ? `le ${jourCourt(j)} à ${heureDite(instant)}` : 'date illisible';
};

/** Une durée en minutes : « 0 min », « 35 min », « 2 h 05 », « 21 h ». */
export function dureeDite(min) {
  if (!fini(min)) return '—';
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${nombreFr(m)} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${nombreFr(h)} h ${String(r).padStart(2, '0')}` : `${nombreFr(h)} h`;
}

/**
 * Des tokens en millions : 13 100 000 → « 13,1 millions » ; « million » s'accorde sur le nombre ARRONDI (1 960 000 →
 * « 2,0 millions ») ; sous 50 000 : « moins de 0,1 million » (P4b-1, RC-25).
 */
export function millions(n) {
  if (!fini(n)) return '—';
  if (n < 50_000) return 'moins de 0,1 million';
  const arrondi = Math.round(n / 100_000) / 10;
  return `${arrondi.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} million${arrondi >= 2 ? 's' : ''}`;
}
const pluriel = (n, un, plusieurs) => `${nombreFr(n)} ${n > 1 ? plusieurs : un}`;

/** Un titre de cause au milieu d'une phrase : première lettre en minuscule, sauf un nom propre (« FotMob », « CôteMaster »). */
export const titreEnPhrase = (t) => {
  const s = String(t ?? '');
  const premier = s.split(/\s/)[0] ?? '';
  return /\p{Lu}/u.test(premier.slice(1)) ? s : s.charAt(0).toLocaleLowerCase('fr-FR') + s.slice(1);
};

/** Les six critères du bilan (blocRecette.js, CRITERES_DU_BILAN), quand le bloc ne les donne pas. */
const CRITERES = Object.freeze(['Deux semaines sans panne non expliquée', 'Restauration d’essai', 'Panne simulée « FotMob muet »', 'Tests automatiques', 'Gain du moteur face au départ', 'Régime de croisière et première revue du mois'].map((titre) => ({ titre })));

/** P4b-1 (RC-25, T13) : un jour passé sans fichier du journal. */
export const NON_OBSERVE = 'non observé : aucun fichier du journal ce jour-là (CôteMaster arrêté, PC éteint ou journal en panne)';
export const A_VENIR = '—';
export const ILLISIBLE = 'journal illisible pour l’instant';
/** P4b-1 (RC-18) : la ligne du rodage, à la place des phrases. */
export const RODAGE = 'Rodage : ce qui suit est noté pour régler la liste, rien n’est compté.';
/** Les colonnes du tableau (CR-53 points 2 à 4 ; RC-12 « Non observé » ; RC-17 « Événements connus »), quand le bloc ne les donne pas. */
export const COLONNES = Object.freeze(['Jour', 'Passes (faites / avec un point à regarder)', 'Veille (durée)', 'Arrêté (durée)', 'Non observé (durée)', 'Événements connus', 'Nouvelles', 'À expliquer', 'Sauvegarde', 'Appels à l’IA']);
/** RC-12 : au-delà de 25 min non observées dans un jour, la case est ambre (le bloc donne son seuil). */
const SEUIL_NON_OBSERVE_MIN = 25;

/** PH-1, PH-2, PH-3, PH-3b, PH-10 : la phrase de tête selon le moment. */
export function phraseDeTete(b) {
  const c = b?.calendrier ?? {};
  if (b?.moment === 'avant') return 'L’essai général n’a pas commencé. Il commencera après la mise en service du direct (étape 46), pour deux semaines où tout tourne comme en vrai.';
  if (b?.moment === 'rodage') return `Le journal de l’essai tourne déjà, en rodage${c.rodageDepuis ? ` depuis le ${jourCourt(c.rodageDepuis)}` : ''} : rien n’est encore compté.`;
  if (b?.moment === 'apres') {
    // RC-25 (T15) : PH-10 suit le cas B (aucun pourcentage du moteur ne change pendant l'essai).
    const n = b?.decompte?.nouvelles?.length ?? 0;
    return `Les deux semaines sont finies (${jourCourt(c.fin)}) : ${n ? pluriel(n, 'panne nouvelle', 'pannes nouvelles') : 'aucune panne nouvelle'}. Le moteur n’a pas changé pendant l’essai : le bilan dira « rien à mesurer » pour le gain, puis chaque critère sera vérifié.`;
  }
  // RC-25 (T14) : le jour de J0 (« jour 0 ») dit que l'essai commence demain.
  if (c.numero === 0) return `L’essai général commence demain${c.debut ? ` (${jourCourt(c.debut)})` : ''} : ${nombreFr(c.jours ?? 14)} jours${c.fin ? `, jusqu’au ${jourCourt(c.fin)}` : ''}. Le rodage est fini.`;
  const periode = c.debut && c.fin ? ` (du ${jourCourt(c.debut)} au ${jourCourt(c.fin)})` : '';
  const jour = fini(c.numero) ? `jour ${nombreFr(c.numero)} sur ${nombreFr(c.jours ?? 14)}` : 'jour non lisible';
  return c.second ? `Second essai : ${jour}${periode}.` : `Essai général : ${jour}${periode}.`;
}

/** PH-23 (CR-3 point 3) : le journal ne tourne plus depuis plus de 25 min ; null s'il tourne ou n'a jamais tourné. */
export function phraseDeVie(b) {
  const v = b?.vie;
  if (!v?.aDemarre || v.tourne || b?.moment === 'avant') return null;
  if (!v.dernierTour) return 'Le journal de l’essai n’a encore fait aucun tour lisible : rien n’est noté.';
  if (!jourDeParis(v.dernierTour)) return 'Le journal de l’essai ne tourne plus (date du dernier tour illisible) : rien n’est noté.';
  return `Le journal de l’essai ne tourne plus depuis ${quandDit(v.dernierTour)} : rien n’est noté.`;
}

/** PH-4a, PH-4b (une seule relance, CR-53 point 6 ; CR-29 point 4), PH-4c (CR-29 point 5). */
function phraseDesNouvelles(b) {
  const d = b?.decompte;
  if (!d) return null;
  const n = d.nouvelles?.length ?? 0;
  if (!n) return 'Aucune panne nouvelle.';
  if (!d.relanceProposee) return `${n > 1 ? `${nombreFr(n)} pannes nouvelles` : 'Une panne nouvelle'} pendant le second essai : à décider avec vous.`;
  const p = d.nouvelles[0]?.premier;
  const quand = p?.le ? ` : ${quandDit(p.le)}, « ${p.texte} »` : '';
  const apres = n > 1 ? 'leurs corrections' : 'sa correction';
  return `${n > 1 ? `${nombreFr(n)} pannes nouvelles` : 'Une panne nouvelle'}${quand}. Les deux semaines repartiront après ${apres} (une seule fois) ; si la correction touche le moteur, on en décide d’abord avec vous.`;
}

/** PH-5 (épisodes, CR-27 ; RC-17) : le nombre de CAUSES distinctes vues, pas d'événements. */
function phraseDesConnues(b) {
  const r = b?.episodes?.reconnues ?? [];
  const m = b?.episodes?.rattachees ?? [];
  const causes = new Set([...r.map((x) => x.cause), ...m.map((x) => x.cause)].filter(Boolean));
  if (!causes.size) return 'Aucune panne connue.';
  const detail = r.map((x) => `${titreEnPhrase(x.titre)} (${pluriel(x.jours, 'jour', 'jours')})`).join(', ');
  const main = m.length ? ` ; dont ${pluriel(m.length, 'événement rattaché à la main', 'événements rattachés à la main')}` : '';
  return `${pluriel(causes.size, 'cause connue vue', 'causes connues vues')}, ${causes.size > 1 ? 'toutes connues' : 'connue'} au départ${detail ? ` : ${detail}` : ''}${main}.`;
}

/** PH-6 (RC-23) : absent s'il n'y a rien à expliquer ; l'âge en texte court (« depuis 2 jours »). */
function phraseAExpliquer(b) {
  const a = b?.aExpliquer ?? [];
  if (!a.length) return null;
  const plusVieux = a[0]?.court ? ` (le plus ancien ${a[0].court})` : '';
  return `${pluriel(a.length, 'événement à expliquer', 'événements à expliquer')}${plusVieux}.`;
}

/** RC-7 (décision 26 c) : les dépassements expliqués par une note, comptés et montrés à part. */
function phraseAPart(b) {
  const n = (b?.aPart ?? []).length;
  return n ? `${pluriel(n, 'événement compté à part, expliqué par une note', 'événements comptés à part, expliqués par une note')}.` : null;
}

/** PH-7 (RC-25) : « sur N jours observés (k jours non observés) ». */
function phraseDesSauvegardes(b) {
  const s = b?.sauvegardes;
  if (!s) return null;
  const r = s.restaurations ?? {};
  const derniere = r.derniere ? jourDeParis(r.derniere) : null;
  const rest = r.total ? `${nombreFr(r.saines)} sur ${nombreFr(r.total)} saine${r.saines > 1 ? 's' : ''}${r.derniere ? ` (${derniere ? `le ${jourCourt(derniere)}` : 'date illisible'})` : ''}` : 'aucune pour l’instant';
  const k = fini(s.joursNonObserves) ? s.joursNonObserves : 0;
  const nonObs = k ? ` (${pluriel(k, 'jour non observé', 'jours non observés')})` : '';
  return `Sauvegardes : ${nombreFr(s.faites)} sur ${pluriel(s.jours ?? 0, 'jour observé', 'jours observés')}${nonObs}. Restaurations d’essai : ${rest}.`;
}

/** PH-8 (CR-53 point 4 : « Appels à l'IA », le journal compte tous les appels). */
function phraseIa(b) {
  const ia = b?.ia;
  if (!ia || !fini(ia.appels)) return 'Appels à l’IA : pas encore comptés (aucun journal des appels lu).';
  const tokens = fini(ia.tokens) ? `, ${millions(ia.tokens)} de tokens${fini(ia.tokensParJour) ? ` (⌀ ${millions(ia.tokensParJour)} par jour)` : ''}` : '';
  return `Appels à l’IA : ${pluriel(ia.appels, 'appel', 'appels')}${tokens}.`;
}

/** PH-9 (CR-53 point 1 : les minutes lues, jamais supposées). */
function phraseDirect(b) {
  const d = b?.direct;
  if (!d || !d.suspensions) return 'Direct : jamais suspendu.';
  return `Direct : suspendu ${d.suspensions > 1 ? `${nombreFr(d.suspensions)} fois` : 'une fois'} (${dureeDite(d.minutes)} en tout).`;
}

/** RC-12 : le détail de la couverture d'un jour (le `title` de la case « Non observé »). */
const detailDeLaCouverture = (c) =>
  c ? `observé ${dureeDite(c.observeeMin)} ; veille ${dureeDite(c.veilleMin)} ; arrêté ${dureeDite(c.arretMin)} ; en erreur ${dureeDite(c.enErreurMin)} ; non observé ${dureeDite(c.nonObserveeMin)}` : '';

/**
 * La ligne d'un jour : sa première cellule, puis les neuf autres (texte), ou une cellule large qui dit ce qui manque.
 * `ambre[i]` et `titres[i]` suivent `cellules` (RC-12 : la case « Non observé » ambre au-delà du seuil, son détail en titre).
 */
export function ligneDuJour(l, seuil = SEUIL_NON_OBSERVE_MIN) {
  const largeur = COLONNES.length - 1;
  const numero = fini(l?.numero) && l.numero >= 1 ? `J${l.numero}` : null;
  const jour = [numero, jourCourt(l?.jour)].filter(Boolean).join(' · ') || A_VENIR;
  const tete = `${jour}${l?.rodage ? ' (rodage)' : ''}${l?.aujourdhui ? ' (aujourd’hui)' : ''}`;
  if (l?.etat === 'non-observe') return { jour: tete, large: NON_OBSERVE, cellules: null, etat: l.etat, largeur };
  if (l?.etat === 'illisible') return { jour: tete, large: l.probleme ?? 'fichier du jour illisible pour l’instant', cellules: null, etat: l.etat, largeur };
  if (l?.etat === 'en-cours') return { jour: tete, large: 'en cours : le premier tour du jour n’est pas encore écrit', cellules: null, etat: l.etat, largeur };
  if (l?.etat !== 'observe') return { jour: tete, large: null, cellules: Array(largeur).fill(A_VENIR), ambre: Array(largeur).fill(false), titres: Array(largeur).fill(''), etat: 'a-venir', largeur };
  const cellules = [
    `${nombreFr(l.passes?.faites ?? 0)} / ${nombreFr(l.passes?.aRegarder ?? 0)}`,
    dureeDite(l.veilleMin),
    dureeDite(l.arretMin),
    dureeDite(l.nonObserveMin),
    nombreFr(l.connues ?? 0),
    nombreFr(l.nouvelles ?? 0),
    nombreFr(l.aExpliquer ?? 0),
    l.sauvegarde ?? '—',
    fini(l.appelsIa) ? nombreFr(l.appelsIa) : 'non lu'
  ];
  const ambre = cellules.map((_, i) => i === 3 && fini(l.nonObserveMin) && l.nonObserveMin > seuil);
  const titres = cellules.map((_, i) => (i === 3 ? detailDeLaCouverture(l.couverture) : ''));
  return { jour: tete, large: null, etat: l.etat, evenements: l.evenements ?? [], cellules, ambre, titres, largeur };
}

/** Σ et ⌀ (jamais de Σ d'un pourcentage ; ⌀ par jour observé). RC-18 : au rodage, « Σ du rodage (non compté) » ; RC-20 : rien de lu → « — ». */
function lignesDuBas(b, seuil = SEUIL_NON_OBSERVE_MIN) {
  const t = b?.totaux ?? {};
  const n = t.joursObserves ?? 0;
  const largeur = COLONNES.length - 1;
  if (!n) {
    const vide = Array(largeur).fill(A_VENIR);
    const libelle = b?.indisponible ? 'Σ : non lu' : b?.moment === 'rodage' ? 'Σ du rodage (non compté)' : 'Σ (aucun jour observé)';
    return { somme: { jour: libelle, cellules: vide, ambre: Array(largeur).fill(false) }, moyenne: { jour: '⌀ par jour', cellules: [...vide] } };
  }
  const moy = (x, sur = n) => (sur > 0 && fini(x) ? (Math.round((x / sur) * 10) / 10).toLocaleString('fr-FR') : A_VENIR);
  const somme = [
    `${nombreFr(t.passesFaites ?? 0)} / ${nombreFr(t.passesARegarder ?? 0)}`,
    dureeDite(t.veilleMin ?? 0),
    dureeDite(t.arretMin ?? 0),
    dureeDite(t.nonObserveMin ?? 0),
    nombreFr(t.connues ?? 0),
    nombreFr(t.nouvelles ?? 0),
    nombreFr(t.aExpliquer ?? 0),
    // Les sauvegardes sur les jours FINIS (aujourd'hui compte s'il a déjà la sienne), comme la phrase PH-7.
    `${nombreFr(t.sauvegardesFaites ?? 0)} sur ${nombreFr(b?.sauvegardes?.jours ?? n)}`,
    fini(t.appelsIa) ? nombreFr(t.appelsIa) : 'non lu'
  ];
  const moyenne = [
    `${moy(t.passesFaites)} / ${moy(t.passesARegarder)}`,
    dureeDite((t.veilleMin ?? 0) / n),
    dureeDite((t.arretMin ?? 0) / n),
    dureeDite((t.nonObserveMin ?? 0) / n),
    moy(t.connues),
    moy(t.nouvelles),
    moy(t.aExpliquer),
    A_VENIR,
    fini(t.appelsIa) ? moy(t.appelsIa, t.joursAvecIa) : 'non lu'
  ];
  const libelle = b?.moment === 'rodage' ? `Σ du rodage (non compté ; ${pluriel(n, 'jour observé', 'jours observés')})` : `Σ (${pluriel(n, 'jour observé', 'jours observés')})`;
  return { somme: { jour: libelle, cellules: somme, ambre: somme.map((_, i) => i === 3 && (t.nonObserveMin ?? 0) / n > seuil) }, moyenne: { jour: '⌀ par jour', cellules: moyenne } };
}

/** RC-21 : d'où viennent les chiffres, en pied de carte ; ambre si le dernier tour a plus de 25 min. */
function provenanceDite(b) {
  const p = b?.provenance ?? {};
  const ou = [p.journal ? `${p.journal}` : null, p.racine ? `et ${p.racine} pour le battement` : null].filter(Boolean).join(', ');
  const j = p.dernierTour ? jourDeParis(p.dernierTour) : null;
  const aujourdhui = b?.aujourdhui ?? null;
  const tour = !p.dernierTour ? 'aucun tour lu' : !j ? 'date illisible' : `${j === aujourdhui ? 'aujourd’hui' : `le ${jourCourt(j)}`} à ${heureDite(p.dernierTour)}`;
  return { texte: `Lu dans : les fichiers du journal de l’essai sur ce PC${ou ? ` (${ou})` : ''} ; dernier tour : ${tour}.`, ambre: !p.dernierTour || !(fini(p.ageMin) && p.ageMin <= 25) };
}

/**
 * La carte complète pour RecetteCarte.vue. Quand rien ne se lit : { indisponible, probleme }, la tête et PH-23 restent,
 * la structure aussi (14 lignes, Σ « non lu », les critères « à faire », la liste des causes). Ne lève jamais.
 */
export function carteDeLaRecette(b) {
  if (!b || typeof b !== 'object') return null;
  try {
    return construire(b);
  } catch (e) {
    // Dernier filet : jamais de carte disparue.
    return construire({ indisponible: true, probleme: `carte illisible pour l’instant (${String(e?.message ?? e).slice(0, 120)})`, liste: b.liste, nonSurveille: b.nonSurveille });
  }
}

function construire(b) {
  const indisponible = b.indisponible === true;
  const seuil = fini(b.seuilNonObserveMin) ? b.seuilNonObserveMin : SEUIL_NON_OBSERVE_MIN;
  const jours = Array.isArray(b.jours) ? b.jours : [];
  const lignes = (jours.length ? jours : Array.from({ length: 14 }, () => ({ etat: 'a-venir' }))).map((l) => ligneDuJour(l, seuil));
  const rodage = b.moment === 'rodage';
  // RC-18 : rien n'est compté au rodage ; RC-20 : PH-4, PH-5, PH-6 ne tombent que si decisions.json est illisible.
  let phrases = [];
  if (!indisponible && !rodage && b.moment !== 'avant') {
    const decisions = b.decisionsIllisibles === true ? [] : [phraseDesNouvelles(b), phraseDesConnues(b), phraseAExpliquer(b), phraseAPart(b)];
    phrases = [...decisions, phraseDesSauvegardes(b), phraseIa(b), phraseDirect(b)].filter(Boolean);
  }
  // RC-23 : la phrase du décompte doublerait la tête (« en cours ») ou PH-4 (« pas tenue ») : seulement dans les autres cas.
  const etatDuDecompte = b.decompte?.etat ?? null;
  const decompte = !indisponible && b.decompte?.phrase && !['en-cours', 'pas-tenue'].includes(etatDuDecompte) ? b.decompte.phrase : null;
  const colonnes = Array.isArray(b.colonnes) && b.colonnes.length === COLONNES.length ? b.colonnes : [...COLONNES];
  const statutDit = (s) => (s === 'active' ? 'en cours' : s === 'corrigee' ? 'corrigée' : s);
  return {
    titre: b.titre ?? 'Essai général',
    indisponible,
    probleme: b.probleme ?? (indisponible ? ILLISIBLE : null),
    replie: b.replie === true,
    tete: b.moment ? phraseDeTete(b) : ILLISIBLE,
    vie: phraseDeVie(b),
    rodage: rodage ? RODAGE : null,
    phrases,
    decompte,
    colonnes,
    largeur: colonnes.length - 1,
    lignes,
    ...lignesDuBas(b, seuil),
    aExpliquer: (b.aExpliquer ?? []).map((x) => ({ id: x.id, quand: x.le ? quandDit(x.le) : '', texte: x.texte, age: x.age ?? '', enRetard: /en retard/.test(x.age ?? '') })),
    aPart: (b.aPart ?? []).map((x) => ({ id: x.id, quand: x.le ? quandDit(x.le) : '', texte: x.texte, auteur: x.auteur ?? '', raison: x.raison ?? '' })),
    liste: {
      titre: `Ce qui est compté comme connu (${nombreFr(b.liste?.n ?? 0)})`,
      etat: b.liste?.scellee ? 'liste scellée au début de l’essai' : 'liste pas encore scellée (elle le sera au début de l’essai)',
      causes: (b.liste?.causes ?? []).map((c) => ({ ...c, statut: statutDit(c.statut) }))
    },
    nonSurveille: b.nonSurveille ?? '',
    provenance: indisponible && !b.provenance ? null : provenanceDite(b),
    criteres: (Array.isArray(b.criteres) && b.criteres.length ? b.criteres : CRITERES).map((c) => ({ titre: c.titre, mot: c.mot ?? 'à faire', preuve: c.preuve ?? '' })),
    bilan: b.bilan ?? null
  };
}
