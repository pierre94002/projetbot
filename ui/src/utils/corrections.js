/**
 * corrections.js — les règles d'écran de LA BOUCLE DE CORRECTION (étape 26 du plan, partie E, 28/10/2026). JavaScript
 * pur, sans Vue ni navigateur : les tests du serveur le rejouent (server/test/boucleCorrectionEcran.test.mjs) sur les
 * vraies réponses de GET /api/engine-health (le bloc « Corrections à accepter ou refuser ») et de GET /api/corrections,
 * /api/corrections/tri, /api/corrections/journal.
 *
 * Rien n'est calculé ici : le serveur a trié le mois, décidé les statuts, écrit les mots de chaque proposition
 * (data/correction/etatDesCorrections.js) et le résumé du mois. L'écran les MET EN FORME : pastilles, lignes, textes des
 * confirmations (la boîte « Confirmer » du navigateur, toujours), nombres à la française (le vrai signe moins).
 *
 * LES MOTS (constat 14 de la critique) : jamais « K », « lignée », « z », « variante », « levier » ni « regards » à
 * l'écran — « N corrections déjà essayées : chacune élargit la marge du juge », « 22 cases × 12 mois : la marge du
 * hasard en tient compte », « la version du moteur », « le réglage ». LES COULEURS : jamais de vert (un écart, une
 * correction, un verdict du banc ne sont pas des gains) — « à décider » et « vrai défaut » en ambre, « en file », « à
 * l'essai », « retenue » et « en essai » en bleu, « adoptée » à la couleur de la section.
 */

const MOINS = String.fromCharCode(0x2212);
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const NOMS_DES_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const sansPoint = (t) => String(t ?? '').replace(/[.\s]+$/, '');

/** Un nombre à la française, `d` décimales, le vrai signe moins : −0,05. */
export function nombreDit(x, d = 0) {
  if (!fini(x)) return '?';
  const r = Number(x.toFixed(d));
  return `${r < 0 ? MOINS : ''}${Math.abs(r).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}
/** Un nombre signé (« +1,2 », « −3,1 », « 0,0 »). */
export const nombreSigne = (x, d = 1) => (fini(x) ? `${Number(x.toFixed(d)) > 0 ? '+' : ''}${nombreDit(x, d)}` : '?');
export const pluriel = (n, un, plusieurs) => `${nombreDit(n)} ${n >= 2 ? plusieurs : un}`;
/** « décembre 2026 ». */
export const moisDit = (mois) => (/^\d{4}-\d{2}$/.test(mois ?? '') ? `${NOMS_DES_MOIS[Number(mois.slice(5, 7)) - 1]} ${mois.slice(0, 4)}` : String(mois ?? ''));
/** « de décembre 2026 », « d’octobre 2026 ». */
export const deMois = (mois) => {
  const m = moisDit(mois);
  return /^[aeiouyéèêàâîïôû]/i.test(m) ? `d’${m}` : `de ${m}`;
};
const FORMAT_PARIS = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const parties = (instant) => {
  const t = typeof instant === 'number' ? instant : Date.parse(instant ?? '');
  return Number.isFinite(t) ? Object.fromEntries(FORMAT_PARIS.formatToParts(new Date(t)).map((p) => [p.type, p.value])) : null;
};
/** « 14/11/2026 », le jour de Paris. */
export const jourDit = (instant) => {
  const p = parties(instant);
  return p ? `${p.day}/${p.month}/${p.year}` : 'date inconnue';
};
/** « 01/02/2027 à 07 h 12 », heure de Paris. */
export const quandDit = (instant) => {
  const p = parties(instant);
  return p ? `${p.day}/${p.month}/${p.year} à ${p.hour} h ${p.minute}` : 'date inconnue';
};
/** Un écart en points, signé (« −3,1 points », « +1,2 point ») ; « pas mesuré » sans chiffre. */
export const ecartEnPoints = (e) => (fini(e) ? `${nombreSigne(e * 100, 1)} point${Math.abs(Number((e * 100).toFixed(1))) >= 2 ? 's' : ''}` : 'pas mesuré');
/** Une fourchette en points, signée (« [−4,1 ; −2,1] »). */
export const fourchetteEnPoints = (f) => (Array.isArray(f) && f.length === 2 && fini(f[0]) && fini(f[1]) ? `[${nombreSigne(f[0] * 100, 1)} ; ${nombreSigne(f[1] * 100, 1)}]` : '–');

// ============================================================ les tons (jamais le vert)

/** Le ton d'une pastille, depuis le ton que dit le serveur (etatDesCorrections, regles.STATUTS). Jamais « is-accent ». */
export const TONS = Object.freeze({ attention: 'is-warning', 'attention-tirets': 'is-warning is-tirets', info: 'is-info', section: 'is-section' });
export const tonDe = (ton) => TONS[ton] ?? '';

// ============================================================ le journal

/** Les événements du journal en mots : les mêmes que le serveur (data/correction/ficheDuMois.js, comparés par un test). */
export const EVENEMENTS_DITS = Object.freeze({
  tri: 'tri du mois',
  proposee: 'proposée',
  'au-banc': 'mesure au banc lancée',
  bancee: 'mesurée au banc',
  'banc-impossible': 'banc impossible',
  'banc-interrompu': 'mesure au banc interrompue',
  acceptee: 'mise en file par vous',
  perimee: 'périmée',
  'mise-a-l-essai': 'mise à l’essai à blanc',
  'essai-recommence': 'essai recommencé',
  'essai-repris': 'essai repris',
  jugee: 'jugée',
  rejetee: 'rejetée',
  refusee: 'refusée par vous',
  adoptee: 'adoptée par vous',
  retiree: 'retirée',
  interrompue: 'interrompue',
  'demande-du-code': 'demande du code',
  'place-liberee': 'place de l’essai libérée',
  'resume-ecrit': 'résumé du mois écrit'
});
const TONS_DU_JOURNAL = Object.freeze({ proposee: 'is-warning', bancee: 'is-warning', 'banc-impossible': 'is-warning', acceptee: 'is-info', 'mise-a-l-essai': 'is-info', jugee: 'is-info', 'essai-repris': 'is-info', adoptee: 'is-section', 'demande-du-code': 'is-warning' });

/** Les entrées du journal pour l'écran : { n, quand (heure de Paris), dit, ton, phrase }. */
export function journalDit(entrees) {
  return (Array.isArray(entrees) ? entrees : []).map((e) => ({ n: e.n, quand: quandDit(e.le), dit: EVENEMENTS_DITS[e.evenement] ?? e.evenement, ton: TONS_DU_JOURNAL[e.evenement] ?? '', phrase: e.phrase }));
}

// ============================================================ le mois en mots

/**
 * « Le mois en mots » : le résumé de Claude (titre, phrases, sa provenance) ou ce qui l'attend, en une phrase. `resume` :
 * etatDesCorrections().resume (la décision du serveur, ficheDuMois.decisionDuResume). Rend { etat, titre, phrases,
 * phrase, ton, provenance: { source, releveLe, action, detail } | null }.
 */
export function leMoisEnMots(resume) {
  if (!resume) return { etat: 'absent', titre: null, phrases: [], phrase: 'Pas encore de résumé : le premier tri du mois se fait le 1er à partir de 6 h, le résumé suit.', ton: '', provenance: null };
  const r = resume.resume;
  if (resume.code === 'deja-fait' && r) {
    const detail = [fini(r.nombresVus) ? `${pluriel(r.nombresVus, 'nombre cité', 'nombres cités')}, tous dans la fiche du mois` : null, fini(r.tokens) ? `${nombreDit(r.tokens)} tokens` : null].filter(Boolean).join(' ; ');
    return { etat: 'ecrit', titre: r.titre, phrases: r.phrases ?? [], phrase: null, ton: '', provenance: { source: `Écrit par Claude (Sonnet), ${moisDit(resume.mois)} — chiffres vérifiés par la garde`, releveLe: r.ecritLe, action: 'écrit', detail: detail || null } };
  }
  if (resume.code === 'sans-appel' && r) return { etat: 'sans-appel', titre: null, phrases: [], phrase: resume.phrase, ton: '', provenance: { source: 'Rangé sans appel à Claude (rien à commenter, 0 token)', releveLe: r.ecritLe, action: 'rangé', detail: null } };
  if (resume.code === 'essais-epuises' || resume.code === 'illisible') return { etat: resume.code, titre: null, phrases: [], phrase: resume.phrase, ton: 'is-warning', provenance: null };
  if (resume.code === 'interrupteur') return { etat: 'coupe', titre: null, phrases: [], phrase: resume.phrase, ton: '', provenance: null };
  return { etat: resume.code === 'a-faire' ? 'attente' : 'absent', titre: null, phrases: [], phrase: resume.phrase, ton: '', provenance: null };
}

// ============================================================ les écarts du mois, en court (Santé du moteur)

/** L'ordre des statuts d'une case, du plus grave au moins grave, et leur mot court (la pastille). */
export const STATUTS_EN_ORDRE = Object.freeze(['vrai-defaut', 'a-surveiller', 'petit-ecart', 'dans-la-marge', 'trop-peu', 'trop-tot', 'mois-de-changement', 'en-essai']);
export const STATUTS_COURTS = Object.freeze({
  'vrai-defaut': ['vrai défaut', 'vrais défauts'],
  'a-surveiller': ['à surveiller', 'à surveiller'],
  'petit-ecart': ['petit écart', 'petits écarts'],
  'dans-la-marge': ['malchance (dans la marge)', 'malchance (dans la marge)'],
  'trop-peu': ['trop peu de matchs', 'trop peu de matchs'],
  'trop-tot': ['trop tôt', 'trop tôt'],
  'mois-de-changement': ['mois de changement de version', 'mois de changement de version'],
  'en-essai': ['en essai', 'en essai']
});
const TONS_DES_STATUTS = Object.freeze({ 'vrai-defaut': 'is-warning', 'a-surveiller': 'is-warning is-tirets', 'en-essai': 'is-info' });
export const tonDuStatut = (statut) => TONS_DES_STATUTS[statut] ?? '';

/** La version jugée en mots (« version n° 5, avec la n° 4 : mêmes pronostics ; mois partiel »). */
export function versionJugeeDite(lignee) {
  if (!lignee?.versionEnService) return 'aucune version du moteur en service à la fin du mois';
  const soeurs = (lignee.versions ?? []).filter((n) => n !== lignee.versionEnService);
  return `version n° ${lignee.versionEnService}${soeurs.length ? `, avec ${soeurs.map((n) => `la n° ${n}`).join(', ')} : mêmes pronostics` : ''}${lignee.partiel ? ` ; mois partiel (en service depuis le ${jourDit(lignee.depuis)})` : ''}`;
}

/**
 * Les écarts du mois EN COURT, pour Santé du moteur (le détail des 22 cases vit dans Historique moteur) : l'en-tête, une
 * pastille par statut présent (jamais verte), les vrais défauts en une ligne chacun, les familles en essai, la règle.
 * `dernierTri` : etatDesCorrections().dernierTri ; `regles` : etatDesCorrections().regles. Rend null sans tri.
 */
export function ecartsEnCourt(dernierTri, regles = null) {
  if (!dernierTri?.mois) return null;
  const s = dernierTri.statuts ?? {};
  const pastilles = STATUTS_EN_ORDRE.filter((code) => s[code]).map((code) => ({ code, n: s[code], texte: `${nombreDit(s[code])} ${s[code] >= 2 ? STATUTS_COURTS[code][1] : STATUTS_COURTS[code][0]}`, ton: tonDuStatut(code) }));
  const defauts = (dernierTri.vraisDefauts ?? []).map((d) => ({
    cas: d.cas,
    texte: `« ${d.libelle ?? d.famille} », ${d.mesure} : ${d.sensDit ?? 'écart'}`,
    ecart: ecartEnPoints(d.ecart),
    mois: (d.mois ?? []).map(moisDit).join(' et '),
    propose: d.levier?.cle ? 'une correction est proposée (ci-dessous)' : d.levier?.phrase ? sansPoint(d.levier.phrase) : null
  }));
  const seuil = fini(regles?.seuilPoints) ? regles.seuilPoints : 2;
  return {
    entete: `Tri ${deMois(dernierTri.mois)} (${versionJugeeDite(dernierTri.lignee)}) : ${nombreDit(dernierTri.lignes ?? 0)} issues mesurées sur ${nombreDit(dernierTri.matchs ?? 0)} matchs.`,
    pastilles,
    defauts,
    enEssai: dernierTri.enEssai ? `Familles de buts en essai : la candidate « ${dernierTri.enEssai.candidate} » (étape ${dernierTri.enEssai.etape ?? '?'}) les corrige déjà ; rien n’est proposé sur elles avant son verdict.` : null,
    regle: `Un « vrai défaut » dure (les deux derniers mois comptés vont dans le même sens), fait au moins ${nombreDit(seuil)} points et dépasse la marge du hasard — ${sansPoint(regles?.regardsDits ?? '22 cases × 12 mois : la marge du hasard en tient compte')}. Sinon, c’est de la malchance ou un petit écart.`
  };
}

// ============================================================ les propositions

const VERDICTS_DU_BANC = Object.freeze({
  retenu: { texte: 'retenu', ton: 'is-info' },
  'pas-prouve': { texte: 'pas prouvé', ton: 'is-warning' },
  'moins-bon': { texte: 'moins bon', ton: 'is-danger' },
  'pas-assez-de-matchs': { texte: 'pas assez de matchs', ton: 'is-warning' }
});
/** Le verdict du banc d'essai en pastille (indicatif ; jamais vert). */
export const verdictDuBancDit = (v) => VERDICTS_DU_BANC[v] ?? { texte: v ? String(v) : 'pas de verdict', ton: '' };

/** La mesure au banc d'une proposition en mots : en cours, impossible, mesurée (gain, fourchette, verdict, par famille), ou pas encore. */
export function bancDit(p) {
  if (p?.bancEnCours) return { genre: 'en-cours', texte: `Mesure au banc en cours depuis le ${quandDit(p.bancEnCours.depuis)} : le verdict arrive dans une dizaine de minutes (relisez la page).`, pastille: null, parFamille: null };
  const b = p?.banc;
  if (!b) return p?.actions?.banc ? { genre: 'pas-encore', texte: 'Pas encore mesurée au banc d’essai : c’est vous qui lancez la mesure (environ 10 minutes).', pastille: null, parFamille: null } : null;
  if (b.erreur) return { genre: 'impossible', texte: `Banc impossible : ${sansPoint(b.erreur)}. Vous pouvez quand même la mettre à l’essai à blanc, ou la refuser.`, pastille: null, parFamille: null };
  const gain = fini(b.gainPct) ? `${nombreDit(Math.abs(b.gainPct), 1)} % d’erreur de prévision en ${b.gainPct >= 0 ? 'moins' : 'plus'}` : 'pas de chiffre';
  const fourchette = Array.isArray(b.fourchettePct) && b.fourchettePct.length === 2 ? `, fourchette [${nombreSigne(b.fourchettePct[0], 1)} ; ${nombreSigne(b.fourchettePct[1], 1)}] %` : '';
  const parFamille = Object.entries(b.parFamille ?? {})
    .filter(([, x]) => x)
    .map(([famille, x]) => `${famille} : ${verdictDuBancDit(x.verdict).texte}${fini(x.gainPct) ? ` (${nombreSigne(x.gainPct, 1)} %)` : ''}`)
    .join(' ; ');
  return { genre: 'mesuree', texte: `Gain mesuré au banc d’essai (2019-2023, indicatif) : ${gain}${fourchette}${fini(b.matchs) && b.matchs ? `, sur ${nombreDit(b.matchs)} matchs` : ''}.`, pastille: verdictDuBancDit(b.verdict), parFamille: parFamille || null };
}

/** Où en est la correction après son banc : en file, à l'essai (ses premiers chiffres), jugée, adoptée. */
export function essaiDit(p) {
  if (!p) return null;
  if (p.etat === 'acceptee') return `En file pour l’essai à blanc${fini(p.rangFile) ? ` (rang ${nombreDit(p.rangFile)})` : ''} : elle passe à blanc dès que la place de l’essai est libre.`;
  if (p.etat === 'a-blanc') {
    const debut = p.essai?.depuis ? ` depuis le ${jourDit(p.essai.depuis)}` : '';
    const pc = p.premiersChiffres;
    const avance = pc ? ` : ${nombreDit(pc.matchs ?? 0)} matchs sur ${nombreDit(pc.horizon?.matchs ?? 800)}, jour ${nombreDit(pc.joursEcoules ?? 0)} sur ${nombreDit(pc.horizon?.jours ?? 21)}` : '';
    return `Essai à blanc n° ${nombreDit(p.essai?.numero ?? 1)}${debut}${avance} — le verdict se lit dans Réglages › Versions du moteur.`;
  }
  if (p.etat === 'jugee') return p.essai?.verdict === 'retenu' ? 'Jugée « retenu » à l’horizon : à adopter dans Réglages › Versions du moteur (bouton « Adopter la candidate »).' : `Jugée « ${verdictDuBancDit(p.essai?.verdict).texte} » : elle sera fermée à la prochaine passe.`;
  if (p.etat === 'adoptee') return `Adoptée${fini(p.versionAdoptee) ? ` : version n° ${nombreDit(p.versionAdoptee)} du moteur` : ''}. La boucle continue de la surveiller.`;
  return null;
}

/**
 * Une proposition telle que la carte la montre : son titre en mots, sa pastille d'état (jamais verte), d'où elle vient,
 * ce qui changerait, son banc, son essai, ce que Pierre peut faire (les boutons du serveur : `actions`).
 */
export function carteDUneProposition(p) {
  const changement = `${p.libelle ?? p.levier} : ${p.avantDit ?? '?'} → ${p.apresDit ?? '?'}`;
  return {
    id: p.id,
    etat: p.etat,
    titre: p.enMots ?? changement,
    pastille: { texte: p.etatDit ?? p.etat, ton: tonDe(p.ton) },
    origine: `${p.sourceDite ?? p.source}${p.creeLe ? `, le ${jourDit(p.creeLe)}` : ''}`,
    changement,
    marches: (p.marches ?? []).map((m) => m.libelle ?? m).join(', '),
    banc: bancDit(p),
    essai: essaiDit(p),
    actions: { banc: Boolean(p.actions?.banc), accepter: Boolean(p.actions?.accepter), refuser: Boolean(p.actions?.refuser), retirer: Boolean(p.actions?.retirer) },
    adopter: p.etat === 'jugee' && p.essai?.verdict === 'retenu',
    retrait: p.retrait ?? null
  };
}

/** Les propositions à montrer : ouvertes (à décider, en file, à l'essai, jugée) et adoptées (surveillées) ; les fermées restent au journal. */
export const ETATS_MONTRES = Object.freeze(['proposee', 'au-banc', 'bancee', 'banc-impossible', 'acceptee', 'a-blanc', 'jugee', 'adoptee']);
export const propositionsMontrees = (propositions) => (Array.isArray(propositions) ? propositions : []).filter((p) => ETATS_MONTRES.includes(p.etat)).map(carteDUneProposition);

// ============================================================ les confirmations (la boîte « Confirmer » du navigateur, toujours)

const nomDe = (p) => p?.enMots ?? `${p?.libelle ?? p?.levier ?? 'la correction'} : ${p?.avantDit ?? '?'} → ${p?.apresDit ?? '?'}`;

/**
 * « Mesurer au banc — environ 10 min » : le banc part AU CLIC (décision 1), un calcul lourd à la fois. Il tient le verrou
 * de l'actualisation pendant la mesure : une passe prévue pendant ce temps est repoussée à la suivante (vérification
 * finale, constat 7 — la confirmation le dit).
 */
export function confirmationDuBanc(p) {
  return (
    `Mesurer « ${nomDe(p)} » au banc d’essai ?\n\n` +
    'Le banc rejoue les matchs de 2019 à 2023 (jamais vus par les réglages) avec ce réglage, dans un processus à part : environ 10 minutes, un seul calcul lourd à la fois. ' +
    'Pendant la mesure, l’actualisation automatique attend : une passe prévue pendant ce temps est repoussée à la suivante (environ 3 h). ' +
    'Son verdict est indicatif ; il s’affichera ici — relisez la page dans une dizaine de minutes.\n\n' +
    'Cette mesure compte la correction parmi les corrections essayées (la marge du juge s’élargit d’autant). Rien ne change dans vos chiffres.'
  );
}

/** « Mettre à l'essai » : la file, l'essai à blanc, le verdict à l'horizon, l'adoption seulement au clic dans Réglages. */
export function confirmationDeLEssai(p, place = null) {
  const h = p?.essai?.horizon ?? { jours: 21, matchs: 800 };
  return (
    `Mettre à l’essai « ${nomDe(p)} » ?\n\n` +
    `Rien ne change dans vos chiffres : la correction sera calculée à blanc, à côté de la version en service, pendant au moins ${nombreDit(h.jours ?? 21)} jours et ${nombreDit(h.matchs ?? 800)} matchs, puis jugée une seule fois. ` +
    'Elle ne sera adoptée que si elle fait mieux au-delà du hasard ET si vous cliquez « Adopter » dans Réglages. Elle compte déjà parmi les corrections essayées.' +
    (place?.prise ? '\n\nUne autre candidate est en essai : celle-ci attendra son tour.' : '')
  );
}

/** « Refuser » : notée au journal, le réglage n'est plus proposé avant 6 mois ; l'essai à blanc s'arrête à la passe suivante. */
export function confirmationDuRefus(p) {
  return (
    `Refuser « ${nomDe(p)} » ?\n\n` +
    'Elle sera notée « refusée » dans le journal ; ce réglage ne sera plus proposé avant 6 mois.' +
    (p?.etat === 'a-blanc' || p?.etat === 'jugee' ? ' Son essai à blanc s’arrêtera à la prochaine passe.' : '') +
    ' Rien ne change dans vos chiffres.'
  );
}

/** « Proposer » (le formulaire) : à mesurer au banc par vous, puis votre accord pour l'essai à blanc. */
export function confirmationDeLaProposition({ libelle, avantDit, apresDit }) {
  return (
    `Proposer « ${libelle} : ${avantDit} → ${apresDit} » ?\n\n` +
    'Elle sera d’abord « à mesurer au banc » : c’est vous qui lancerez la mesure (environ 10 minutes), puis elle attendra votre accord pour l’essai à blanc. Rien ne change dans vos chiffres.'
  );
}

/** « Retirer » une correction adoptée : la boucle ne retire rien elle-même ; le serveur dit où cliquer (retour arrière de Réglages). */
export function confirmationDuRetrait(p) {
  return (
    `Retirer « ${nomDe(p)} » ?\n\n` +
    'Tant que cette correction est la dernière version du moteur, elle se retire par le retour arrière de Réglages › Versions du moteur (« Revenir à la version précédente », avec sa confirmation). ' +
    'Sinon, le retrait passera par un nouvel essai (plus tard). Rien n’est retiré d’ici : l’appli vous dit où cliquer.'
  );
}

/** Le message après une action réussie, dit en mots. */
export function messageApresLAction(type, r = null) {
  if (type === 'banc') return 'Mesure au banc lancée : son verdict arrive dans une dizaine de minutes (relisez la page). Rien ne change dans vos chiffres.';
  if (type === 'accepter') return 'Correction mise en file pour l’essai à blanc. Rien ne change dans vos chiffres.';
  if (type === 'refuser') return 'Correction refusée et notée au journal. Rien ne change dans vos chiffres.';
  if (type === 'proposer') return 'Correction proposée : à mesurer au banc d’essai (bouton « Mesurer au banc »), ou à refuser.';
  if (type === 'retirer') return r?.phrase ?? 'Le retrait se fait dans Réglages › Versions du moteur.';
  return 'Fait.';
}

// ============================================================ le formulaire « Proposer une correction »

/** Les marchés que change tout réglage du modèle de buts (déclarés avec la correction ; le score exact regardé). */
export const MARCHES_DU_MODELE = 'Total buts, Les 2 équipes marquent, Buts d’une équipe, Résultat + total buts (et le score exact, regardé sans être jugé)';

/** Les choix du réglage (AppSelect : jamais de liste native) : son nom, et sa valeur en service ou « fermé ». */
export function optionsDesReglages(formulaire) {
  return (formulaire?.leviers ?? []).map((l) => ({ value: l.cle, label: String(l.libelle ?? l.cle).replace(/^./, (x) => x.toUpperCase()), hint: l.ouvert ? `en service : ${l.valeurDite ?? '?'}` : 'pas maintenant' }));
}

/** Les bornes d'un réglage dites en mots (« entre −0,3 et 0,3, exclus ; par pas de 0,01 »). */
export function bornesDites(l) {
  if (!l) return '';
  const d = l.pas < 1 ? Math.max(0, Math.ceil(-Math.log10(l.pas) - 1e-9)) : 0;
  return `entre ${nombreDit(l.min, d)} et ${nombreDit(l.max, d)}${l.ouvertes ? ', bornes exclues' : ''} ; par pas de ${nombreDit(l.pas, d)}`;
}

/** Le problème d'une valeur tapée, en mots (le serveur contrôle de nouveau) ; null si elle va. */
export function problemeDeLaValeur(l, valeur) {
  if (!l) return 'Choisissez d’abord le réglage.';
  if (!fini(valeur)) return 'Tapez une valeur (un nombre).';
  if (l.ouvertes ? valeur <= l.min || valeur >= l.max : valeur < l.min || valeur > l.max) return `La valeur doit être ${bornesDites(l)}.`;
  const pas = Math.round(valeur / l.pas);
  if (Math.abs(pas * l.pas - valeur) > 1e-9) return `La valeur va par pas de ${nombreDit(l.pas, l.pas < 1 ? Math.max(0, Math.ceil(-Math.log10(l.pas) - 1e-9)) : 0)}.`;
  if (fini(l.valeur) && Math.abs(valeur - l.valeur) < 1e-12) return `C’est déjà la valeur en service (${l.valeurDite ?? nombreDit(valeur, 2)}) : rien à essayer.`;
  return null;
}

/** Une phrase facultative : au plus 300 caractères (le serveur refuse au-delà). */
export const PHRASE_MAX = 300;

// ============================================================ le tri détaillé (Historique moteur)

/** Les 11 familles, dans l'ordre du serveur (data/correction/regles.js, FAMILLES ; comparé par un test). */
export const FAMILLES = Object.freeze([
  { id: 'result', libelle: 'Résultat (1N2)' },
  { id: 'totalGoals', libelle: 'Total buts' },
  { id: 'bothTeamsScore', libelle: 'Les 2 équipes marquent' },
  { id: 'teamGoals', libelle: 'Buts d’une équipe' },
  { id: 'resultAndTotal', libelle: 'Résultat + total buts' },
  { id: 'totalCorners', libelle: 'Corners du match' },
  { id: 'teamCorners', libelle: 'Corners d’une équipe' },
  { id: 'totalShots', libelle: 'Tirs du match' },
  { id: 'teamShots', libelle: 'Tirs d’une équipe' },
  { id: 'totalShotsOnTarget', libelle: 'Tirs cadrés du match' },
  { id: 'teamShotsOnTarget', libelle: 'Tirs cadrés d’une équipe' }
]);
const MESURES = Object.freeze(['niveau', 'confiance']);

/** Ce qui est proposé pour une case : le réglage visé, « demande du code », « à revoir après la confiance », ou rien. */
const proposeDit = (levier) => (levier?.cle ? `une correction : ${levier.phrase ?? levier.cle}` : levier?.code ? sansPoint(levier.phrase) : levier?.attente ? sansPoint(levier.phrase) : '–');

/**
 * LES 22 LIGNES du tri d'un mois, TOUJOURS (même sans tri, même en erreur : `manque` dit pourquoi dans chaque ligne) :
 * famille, mesure, écart du mois, écarts des mois comptés, écart sur les mois comptés, fourchette, matchs, statut, ce qui
 * est proposé. `tri` : la réponse de GET /api/corrections/tri (son champ `tri`).
 */
export function lignesDuTri(tri, { manque = 'pas encore mesuré' } = {}) {
  const parCase = new Map((tri?.cases ?? []).map((c) => [c.cas, c]));
  return FAMILLES.flatMap((f) =>
    MESURES.map((mesure) => {
      const c = parCase.get(`${f.id}|${mesure}`) ?? null;
      if (!c) return { cas: `${f.id}|${mesure}`, famille: f.libelle, mesure, manque, ecartMois: manque, moisComptes: [], ecartFenetre: '–', fourchette: '–', matchs: '–', statut: { texte: manque, ton: '' }, propose: '–', vide: true };
      return {
        cas: c.cas,
        famille: f.libelle,
        mesure: mesure === 'niveau' ? `niveau${c.canonique ? ` : « ${c.canonique} »` : ''}` : 'confiance',
        manque: null,
        ecartMois: ecartEnPoints(c.courant?.ecart ?? null),
        moisComptes: (c.mois ?? []).map((m) => ({ mois: moisDit(m.mois), ecart: ecartEnPoints(m.ecart), partiel: Boolean(m.partiel) })),
        ecartFenetre: c.fenetre ? ecartEnPoints(c.fenetre.ecart) : '–',
        fourchette: c.fenetre ? fourchetteEnPoints(c.fenetre.fourchette) : '–',
        matchs: fini(c.courant?.matchs) ? nombreDit(c.courant.matchs) : '–',
        statut: { texte: c.dit ?? c.statut, ton: tonDuStatut(c.statut), code: c.statut },
        sens: c.sensDit ?? null,
        propose: proposeDit(c.levier),
        vide: false
      };
    })
  );
}

/**
 * Le pied du tableau : Σ des issues mesurées et des matchs du mois (les comptes du tri, jamais une somme des cases, qui
 * compterait deux fois chaque match), ⌀ de l'écart absolu du mois sur les cases mesurées — jamais une somme de pourcentages.
 */
export function piedDuTri(tri) {
  const ecarts = (tri?.cases ?? []).map((c) => c.courant?.ecart).filter(fini);
  return {
    lignes: fini(tri?.resume?.lignes) ? nombreDit(tri.resume.lignes) : '–',
    matchs: fini(tri?.resume?.matchs) ? nombreDit(tri.resume.matchs) : '–',
    ecartMoyen: ecarts.length ? `${nombreDit((ecarts.reduce((t, e) => t + Math.abs(e), 0) / ecarts.length) * 100, 1)} point${ecarts.reduce((t, e) => t + Math.abs(e), 0) / ecarts.length >= 0.02 ? 's' : ''}` : '–',
    casesMesurees: ecarts.length
  };
}

/** Les quatre chiffres clés du panneau : la version jugée, les mois comptés, la marge du hasard, le seuil. */
export function kpisDuTri(tri, regles = null) {
  const l = tri?.lignee ?? null;
  const moisComptes = [...new Set((tri?.cases ?? []).flatMap((c) => (c.fenetre?.mois ?? []).map(moisDit)))];
  return [
    { cle: 'version', label: 'Version jugée', valeur: l?.versionEnService ? `n° ${l.versionEnService}` : 'aucune', detail: l?.versionEnService ? versionJugeeDite({ versionEnService: l.versionEnService, versions: l.versions, partiel: l.couverture?.partiel, depuis: l.couverture?.depuis }) : 'pas encore mesuré' },
    { cle: 'mois', label: 'Mois comptés', valeur: tri?.mois ? moisDit(tri.mois) : 'aucun', detail: moisComptes.length ? `fenêtre des cases jugées : ${moisComptes.join(', ')}` : 'aucune case jugée (il faut deux mois comptés)' },
    { cle: 'marge', label: 'Marge du hasard', valeur: '22 cases × 12 mois', detail: sansPoint(regles?.regardsDits ?? '22 cases × 12 mois : la marge du hasard en tient compte') },
    { cle: 'seuil', label: 'Seuil d’un vrai défaut', valeur: `${nombreDit(fini(regles?.seuilPoints) ? regles.seuilPoints : 2)} points`, detail: 'en dessous : un petit écart, sans intérêt pour un pari' }
  ];
}

/** Les régimes du modèle en mots (le mot court du serveur, core/engine/motsDuModeleDeButs.js) ; l'ancien modèle : avec ou sans cote. */
const REGIMES_DITS = Object.freeze({
  'cotes-plusmoins-xg': 'cotes + xG',
  'cotes-plusmoins-buts': 'cotes + buts',
  'cotes-1n2-xg': 'cotes 1N2 + xG',
  'cotes-1n2-buts': 'cotes 1N2 + buts',
  'xg-seuls': 'xG seuls',
  'buts-seuls': 'buts seuls',
  'moyennes-seules': 'moyennes du championnat',
  cotes: 'avec cotes',
  'aucune-cote': 'sans cote',
  inconnu: 'régime inconnu'
});
const FAMILLES_DU_DETAIL = Object.freeze([['result', 'Résultat (1N2), victoire de l’équipe qui reçoit'], ['nul', 'Résultat (1N2), match nul'], ['totalGoals', 'Total buts'], ['bothTeamsScore', 'Les 2 équipes marquent'], ['teamGoals', 'Buts d’une équipe'], ['resultAndTotal', 'Résultat + total buts']]);

/** « Par régime (pour comprendre, jamais jugé) » : l'écart de niveau par régime de calcul, avec ses lignes et ses matchs. */
export function regimesDuTri(tri) {
  const r = tri?.regimes?.mois ?? {};
  return FAMILLES_DU_DETAIL.flatMap(([cle, libelle]) =>
    Object.entries(r[cle] ?? {}).map(([regime, x]) => ({ famille: libelle, regime: REGIMES_DITS[regime] ?? regime, lignes: nombreDit(x.lignes ?? 0), matchs: nombreDit(x.matchs ?? 0), ecart: x.lignes ? ecartEnPoints((x.sb - x.sa) / x.lignes) : 'pas mesuré' }))
  );
}

/** Les pronostics gelés qui n'entrent pas dans le tri, raison par raison (jamais en silence). */
export function ecarteesDuTri(tri) {
  return (tri?.resume?.ecartees ?? []).map((e) => ({ libelle: e.libelle ?? e.raison, n: nombreDit(e.n ?? 0) }));
}

/** La provenance du tri : où il a été fait, quand, à partir de quoi. */
export function provenanceDuTri(tri) {
  return {
    source: 'Boucle de correction : pronostics gelés (table engine_picks du magasin) et résultats FotMob du magasin',
    releveLe: tri?.calculeLe ?? null,
    action: 'trié',
    fichier: 'table correction_tri du magasin SQLite (un tri figé ne se refait jamais)'
  };
}

/** Les mois triés, du plus récent au plus ancien, pour les pastilles du choix. */
export function moisTries(etat) {
  return [...new Set((etat?.tris ?? []).map((t) => t.mois))].sort().reverse().map((mois) => ({ mois, texte: moisDit(mois) }));
}

// ============================================================ l'alerte durable (barre du haut)

/** L'alerte durable de la boucle (refresh-status.json, `boucleCorrection`) en une phrase ; null sans erreur. */
export function alerteDeLaBoucleDite(alerte) {
  if (!alerte?.erreur) return null;
  const depuis = alerte.depuis ? ` depuis le ${quandDit(alerte.depuis)}` : '';
  const passes = fini(alerte.passes) && alerte.passes > 1 ? `, ${nombreDit(alerte.passes)} passes d’affilée` : '';
  return `Boucle de correction — ${sansPoint(alerte.erreur)}${depuis || passes ? ` (${`${depuis}${passes}`.replace(/^,?\s*/, '')})` : ''}`;
}
