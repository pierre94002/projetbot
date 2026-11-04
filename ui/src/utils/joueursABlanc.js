/**
 * joueursABlanc.js — LES MOTS DE L'ONGLET « JOUEURS — À BLANC » (étape 34 du plan, lot 1b, partie D, 03/11/2026).
 * -----------------------------------------------------------------------
 * Règles PURES (ni Vue, ni réseau, ni navigateur : les tests du serveur les rejouent sur de vraies réponses). Elles disent,
 * en français simple, ce que le bloc `joueurs` de l'analyse apporte (server/src/data/joueurs/joueursRead.js) — aucune
 * requête de plus : la compo (publiée par FotMob, ou la dernière alignée, absents annoncés retirés), la base de chaque
 * équipe (buts, tirs cadrés et cartons attendus), les chiffres de chaque joueur (marquer, au moins un tir cadré, averti,
 * passe décisive : un pourcentage et sa cote juste), les statuts du banc d'essai famille par famille, la provenance.
 *
 * Les deux tableaux gardent TOUJOURS leurs colonnes et leurs en-têtes (même vides, même en erreur) ; un état vide se dit
 * en une phrase, jamais « 0 », jamais le silence. Les pastilles : « Effet mesuré » (le seul vert, DESIGN.md) pour une famille
 * mesurée utile au banc, avec « pas encore un marché » ; « Chiffre du poste » (gris) sinon ; « pas encore mesuré au banc
 * d'essai » sans note (et alors aucun pourcentage). Jamais de vert ni de rouge pour une valeur (un joueur souvent averti
 * n'est pas « mauvais »). Le pied de chaque tableau : des NOMBRES ATTENDUS, jamais une somme de pourcentages. Virgule
 * décimale, espace fine des milliers (toLocaleString('fr-FR')), vrai signe moins, heures de Paris.
 * -----------------------------------------------------------------------
 */

import { nombre, MOINS, heureDite, jjmm, jjmmaaaa } from './contexteDuMatch.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/** Les colonnes des deux tableaux, dans l'ordre de l'écran. */
export const COLONNES = Object.freeze([
  Object.freeze({ cle: 'joueur', titre: 'Joueur' }),
  Object.freeze({ cle: 'poste', titre: 'Poste' }),
  Object.freeze({ cle: 'minutes', titre: 'Minutes attendues' }),
  Object.freeze({ cle: 'marque', titre: 'Marque' }),
  Object.freeze({ cle: 'cadres', titre: 'Au moins un tir cadré' }),
  Object.freeze({ cle: 'averti', titre: 'Averti' }),
  Object.freeze({ cle: 'passeur', titre: 'Passe décisive' })
]);
/** Les quatre familles (les colonnes chiffrées). */
export const FAMILLES = Object.freeze(['marque', 'cadres', 'averti', 'passeur']);
const MOTS_DES_FAMILLES = Object.freeze({ marque: 'Marque', cadres: 'Au moins un tir cadré', averti: 'Averti', passeur: 'Passe décisive' });
const POSTES = Object.freeze({ 1: 'Gardien', 2: 'Défenseur', 3: 'Milieu', 4: 'Attaquant' });
const MOTIFS = Object.freeze({ injury: 'blessé', suspension: 'suspendu', internationalDuty: 'en sélection' });

/** Les sources réelles, telles que les pastilles de provenance les écrivent (le vrai endroit des données). */
export const SOURCES = Object.freeze({
  parts: 'magasin FotMob (feuilles des matchs déjà joués)',
  compoPubliee: 'FotMob, page du match',
  compoDerniere: 'magasin (dernière compo alignée)',
  buts: 'modèle de buts de l’étape 27, sans les cotes, recalé au banc d’essai de l’étape 34',
  cartons: 'étape 33 (moyenne du championnat pour ce côté)',
  banc: 'banc d’essai de l’étape 34 (magasin 2023-2026)'
});

/** L'en-tête de l'onglet (conception §8.2). */
export const EN_TETE = Object.freeze({
  eyebrow: 'À blanc · pas encore un marché',
  titre: 'Joueurs',
  sousTitre: 'Les chances de chaque joueur de marquer, de cadrer un tir, d’être averti et de faire une passe décisive, calculées depuis le magasin FotMob. Elles n’entrent dans aucun pronostic, aucune value et aucun pari conseillé.'
});

/** « 23 % » (un chiffre après la virgule sous 10 %). */
export function pourcent(p) {
  if (!fini(p)) return null;
  const x = p * 100;
  return `${nombre(x, x < 10 ? 1 : 0)} %`;
}
/** « cote juste 4,35 » ; « cote juste — » quand il n'y en a pas (sous 0,5 % ou au-dessus de 99,5 %). */
export const coteDite = (c) => `cote juste ${fini(c) ? nombre(c, 2) : '—'}`;
const nb = (x, d = 1) => nombre(x, d);
const pluriel = (x, un, plusieurs) => (fini(x) && Math.abs(x) >= 2 ? plusieurs : un);

/** L'état de la lecture, en une phrase (null quand tout est prêt) : { cle, titre, texte, ton }. */
export function etatDit(bloc) {
  if (bloc === undefined) return { cle: 'ancien-serveur', titre: 'Chiffres des joueurs indisponibles', texte: 'Le serveur ne donne pas encore les chiffres des joueurs : relancez CôteMaster pour les voir. Les autres onglets ne sont pas touchés.', ton: 'is-info' };
  if (bloc === null) return { cle: 'chargement', titre: null, texte: null, ton: null };
  const nom = (c) => bloc.clubs?.[c]?.nom ?? (c === 'home' ? 'l’équipe qui reçoit' : 'l’équipe qui se déplace');
  switch (bloc.etat) {
    case 'pret':
      return null;
    case 'pas-encore-mesure':
      return { cle: 'pas-encore-mesure', titre: 'Pas encore mesuré', texte: 'Pas encore mesuré au banc d’essai : aucun chiffre montré tant que le banc n’a pas parlé.', ton: 'is-info' };
    case 'pas-de-compo':
      return { cle: 'pas-de-compo', titre: 'Pas encore de compo', texte: 'Pas encore de compo, ni de dernière compo au magasin : aucun chiffre.', ton: 'is-info' };
    case 'pas-encore-calcule':
      return { cle: 'pas-encore-calcule', titre: 'Pas encore calculé', texte: 'Pas encore calculé : la prochaine passe de nuit le fera.', ton: 'is-info' };
    case 'clubs-inconnus': {
      const qui = bloc.raison === 'les-deux' ? `${nom('home')} et ${nom('away')} ne sont pas reconnus` : `${nom(bloc.raison === 'domicile' ? 'home' : 'away')} n’est pas reconnu`;
      return { cle: 'clubs-inconnus', titre: 'Chiffres indisponibles', texte: `Chiffres indisponibles : ${qui} par son identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent).`, ton: 'is-warning' };
    }
    default:
      return { cle: 'illisible', titre: 'Chiffres illisibles', texte: 'Chiffres des joueurs illisibles : la base n’a pas répondu. Les autres onglets ne sont pas touchés.', ton: 'is-warning' };
  }
}

/** La ligne « état de la compo » (critique de l'étape 34, constats 3 et 16.1). */
export function ligneCompo(bloc) {
  const c = bloc?.compo;
  if (!c) return null;
  const nom = (camp) => bloc.clubs?.[camp]?.nom ?? '';
  if (c.etat === 'publiee') {
    const heure = heureDite(c.lueLe);
    let texte = `Compo publiée par FotMob, lue à ${heure ?? '?'}. FotMob ne dit pas si c’est l’officielle : à moins d’une heure du coup d’envoi, c’est presque toujours elle.`;
    if (fini(c.minutesAvant) && c.minutesAvant > 90) texte += ` Lue ${dureeDite(c.minutesAvant)} avant le coup d’envoi : ce peut être une prévision de FotMob.`;
    return { cle: 'publiee', texte };
  }
  const quand = ['home', 'away'].filter((camp) => c.dernieres?.[camp]).map((camp) => `${nom(camp)} le ${jjmm(c.dernieres[camp])}`);
  const banc = bloc.banc?.derniereAlignee;
  const retires = [...(c.retires?.home ?? []), ...(c.retires?.away ?? [])];
  let texte = `Compo pas encore publiée : chiffres « s’il joue », sur la dernière compo alignée par chaque équipe${quand.length ? ` (${quand.join(', ')})` : ''} ; les joueurs annoncés absents par FotMob sont retirés${retires.length ? ` (${retires.map((r) => `${r.nom ?? `n° ${r.id}`}${r.motif ? `, ${MOTIFS[r.motif] ?? 'indisponible'}` : ''}`).join(' ; ')})` : ''}.`;
  if (banc && fini(banc.titulairesAuMatch)) texte += ` Au banc d’essai, ${nb(banc.titulairesAuMatch * 100, 0)} % des titulaires d’une dernière compo l’ont été au match suivant, ${nb(banc.entres * 100, 0)} % sont entrés en jeu.`;
  return { cle: 'derniere-alignee', texte };
}

/** « 5 h », « 2 h 30 », « 95 min ». */
function dureeDite(min) {
  if (!fini(min)) return null;
  if (min < 120) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** La ligne « base » : buts, tirs cadrés et cartons attendus de chaque équipe (recalés comme au banc). */
export function ligneBase(bloc) {
  const r = bloc?.base?.recalees;
  if (!r) return null;
  const nom = (camp) => bloc.clubs?.[camp]?.nom ?? '';
  const v = (camp, k, d) => (fini(r[camp]?.[k]) ? nb(r[camp][k], d) : '—');
  const nuit = bloc.nuit?.calculeLe ? ` (nuit du ${jjmm(String(bloc.nuit.jourD ?? bloc.nuit.calculeLe).slice(0, 10))})` : '';
  return {
    cle: 'base',
    texte: `Buts attendus : ${nom('home')} ${v('home', 'lambda', 2)}, ${nom('away')} ${v('away', 'lambda', 2)} — calculés par le modèle de buts de l’étape 27 sans les cotes, recalé au banc d’essai de l’étape 34${nuit}. Tirs cadrés attendus : ${v('home', 'S', 1)} et ${v('away', 'S', 1)}. Cartons attendus : ${v('home', 'C', 1)} et ${v('away', 'C', 1)} (étape 33).`
  };
}

/** La pastille d'une famille : { cle, libelle, sous, titre, vert } (jamais de vert sans mesure). */
export function pastilleDe(statut) {
  if (statut?.statut === 'mesure') return { cle: 'mesure', libelle: 'Effet mesuré', sous: 'pas encore un marché', titre: null, vert: true };
  if (statut?.statut === 'poste') return { cle: 'poste', libelle: 'Chiffre du poste', sous: null, titre: 'les chiffres propres au joueur ne sont pas prouvés au banc d’essai', vert: false };
  return { cle: 'non-mesure', libelle: 'pas encore mesuré au banc d’essai', sous: null, titre: null, vert: false };
}
/** La calibration d'une famille : « Calibré au banc : écart moyen 0,1 point » (gris) ou « Pas calibré… » (ambre). */
export function calibrationDite(statut) {
  const c = statut?.calibre;
  if (!c || !fini(c.ecartMoyenPoints)) return null;
  const e = nb(c.ecartMoyenPoints, c.ecartMoyenPoints < 1 ? 2 : 1);
  return c.calibre ? { cle: 'calibre', texte: `Calibré au banc : écart moyen ${e} point`, ambre: false } : { cle: 'pas-calibre', texte: `Pas calibré au banc : écart moyen ${e} point${c.ecartMoyenPoints >= 2 ? 's' : ''} — à prendre avec prudence`, ambre: true };
}
/** Les pastilles des quatre familles (l'en-tête des colonnes). */
export function pastillesDesFamilles(bloc) {
  return FAMILLES.map((f) => {
    const s = bloc?.statuts?.[f] ?? null;
    const p = pastilleDe(s);
    const cal = calibrationDite(s);
    return { famille: f, mot: MOTS_DES_FAMILLES[f], ...p, calibration: cal, aria: `${MOTS_DES_FAMILLES[f]} : ${p.libelle}${p.sous ? `, ${p.sous}` : ''}${cal ? ` ; ${cal.texte}` : ''}` };
  });
}

/** Une case : « 23 % » et « cote juste 4,35 » ; sans note ou sans chiffre : null (la case reste, vide d'un tiret). */
function caseDe(c, montrer) {
  if (!montrer || !c || !fini(c.p)) return { p: '—', cote: null };
  return { p: pourcent(c.p), cote: coteDite(c.cote) };
}

/** Les lignes d'un tableau (un camp) : titulaires (par chance de marquer décroissante), puis remplaçants « s'il entre en jeu ». */
export function lignesDuCamp(bloc, camp) {
  const joueurs = bloc?.camps?.[camp]?.joueurs ?? [];
  const montrer = bloc?.etat === 'pret';
  const tri = (a, b) => (b.chiffres?.marque?.p ?? -1) - (a.chiffres?.marque?.p ?? -1) || String(a.nom ?? '').localeCompare(String(b.nom ?? ''), 'fr');
  const ligne = (j) => {
    const cases = Object.fromEntries(FAMILLES.map((f) => [f, caseDe(j.chiffres?.[f], montrer && !j.sansIdentifiant)]));
    const c2 = j.chiffres?.cadres2;
    if (montrer && !j.sansIdentifiant && c2 && fini(c2.p)) cases.cadres.titre = `Au moins deux tirs cadrés : ${pourcent(c2.p)} (${coteDite(c2.cote)})`;
    let note = null;
    if (j.sansIdentifiant) note = { cle: 'sans-identifiant', texte: `${j.nom ?? 'Un joueur'} : sans identifiant FotMob, pas de chiffre (sa part reste comptée pour l’équipe).` };
    else if (j.absentAnnonce) note = { cle: 'absent', texte: `⚠ annoncé ${MOTIFS[j.absentAnnonce] ?? 'indisponible'} par FotMob — chiffre calculé quand même` };
    else if (j.sansFiche) note = { cle: 'sans-fiche', texte: `${j.nom ?? 'Ce joueur'} : aucun match au magasin — chiffre du poste.` };
    return {
      cle: `${j.titulaire ? "t" : "r"}-${j.id ?? j.nom ?? "?"}`,
      id: j.id,
      brut: j.brut ?? (j.id ? `fotmob-${j.id}` : null),
      nom: j.nom ?? (j.id ? `n° ${j.id}` : 'Joueur sans nom'),
      pays: j.pays ?? null,
      nomPays: j.nomPays ?? null,
      poste: POSTES[j.poste] ?? '—',
      minutes: fini(j.minutes) ? `${nb(j.minutes, 0)} min` : '—',
      titulaire: j.titulaire,
      sIlJoue: Boolean(j.sIlJoue),
      entre: !j.titulaire && fini(j.pEntre) ? `entre en jeu dans ${nb(j.pEntre * 100, 0)} % de ses matchs sur le banc` : null,
      note,
      cases
    };
  };
  const titulaires = joueurs.filter((j) => j.titulaire).sort(tri).map(ligne);
  const remplacants = joueurs.filter((j) => !j.titulaire).sort(tri).map(ligne);
  return { titulaires, remplacants };
}

/** Le pied d'un tableau : des NOMBRES ATTENDUS (jamais une somme de pourcentages). */
export function piedDuCamp(bloc, camp) {
  const a = bloc?.camps?.[camp]?.attendus;
  if (!a || bloc?.etat !== 'pret') return null;
  const morceaux = [];
  if (fini(a.buts)) {
    const details = [];
    if (fini(a.butsEquipe)) details.push(`l’équipe ${nb(a.butsEquipe, 2)}`);
    if (fini(a.butsContreSonCamp)) details.push(`dont ${nb(a.butsContreSonCamp, 2)} sur des buts contre son camp de l’adversaire`);
    if (fini(a.butsDuBloc)) details.push(`${nb(a.butsDuBloc, 2)} pour les remplaçants qui entreront`);
    morceaux.push(`${nb(a.buts, 2)} ${pluriel(a.buts, 'but', 'buts')}${details.length ? ` (${details.join(' ; ')})` : ''}`);
  }
  if (fini(a.cadres)) morceaux.push(`${nb(a.cadres, 1)} ${pluriel(a.cadres, 'tir cadré', 'tirs cadrés')}`);
  if (fini(a.avertis)) morceaux.push(`${nb(a.avertis, 1)} ${pluriel(a.avertis, 'joueur averti', 'joueurs avertis')}`);
  if (fini(a.passes)) morceaux.push(`${nb(a.passes, 1)} ${pluriel(a.passes, 'passe décisive', 'passes décisives')}`);
  if (!morceaux.length) return null;
  return `Σ attendus des titulaires : ${morceaux.join(', ')}.`;
}

/** Les mentions fixes (une ligne grise chacune ; critique, constat 16). */
export function mentionsFixes(bloc) {
  const m = bloc?.mots ?? {};
  return [m.regles, m.averti, m.tirs, bloc?.tireur ? m.penaltiesAuTireur : m.penaltiesAuPoste].filter((x) => typeof x === 'string' && x);
}

/** Les provenances (source et heure réelles) : parts, compo, buts et tirs cadrés, cartons, banc. */
export function provenances(bloc) {
  const out = [];
  const nuit = bloc?.nuit?.calculeLe ?? null;
  out.push({ cle: 'parts', source: SOURCES.parts, releveLe: nuit, action: 'calculé' });
  const c = bloc?.compo;
  if (c?.etat === 'publiee') out.push({ cle: 'compo', source: SOURCES.compoPubliee, releveLe: c.lueLe, action: 'lue' });
  else if (c?.etat === 'derniere-alignee') {
    const jours = ['home', 'away'].map((k) => c.dernieres?.[k]).filter(Boolean).map(jjmm);
    out.push({ cle: 'compo', source: `${SOURCES.compoDerniere.replace(/\)$/, '')}${jours.length ? ` du ${jours.join(' et du ')}` : ''})`, releveLe: c.absentsLusLe ?? nuit, action: c.absentsLusLe ? 'absents lus' : 'lue' });
  }
  out.push({ cle: 'buts', source: SOURCES.buts, releveLe: nuit, action: 'calculé' });
  out.push({ cle: 'cartons', source: SOURCES.cartons, releveLe: nuit, action: 'calculé' });
  if (bloc?.banc?.calculeLe) out.push({ cle: 'banc', source: SOURCES.banc, releveLe: null, action: 'calculé', jourSeul: jjmmaaaa(bloc.banc.calculeLe) });
  return out;
}

const VERDICTS = Object.freeze({ retenu: 'Retenu', 'pas-prouve': 'Pas prouvé', 'moins-bon': 'Moins bon', 'pas-assez-de-matchs': 'Pas assez de matchs' });
const QUOI = Object.freeze({
  buteurs: 'Buteurs (parts du joueur)',
  tireur: 'Tireur de penalties',
  cadres: 'Tirs cadrés',
  averti: 'Averti',
  passeur: 'Passe décisive',
  fauxButeurs: 'Contrôle (faux joueurs, buts)',
  fauxTireurs: 'Contrôle (faux tireurs)',
  fauxCadres: 'Contrôle (faux joueurs, tirs cadrés)',
  fauxAvertis: 'Contrôle (faux joueurs, avertis)',
  fauxPasseurs: 'Contrôle (faux joueurs, passes)'
});
const pctSigne = (x, d = 2) => {
  if (!fini(x)) return null;
  const t = nombre(x * 100, d);
  return /^[−-]?0(,0+)?$/.test(t) ? nombre(0, d) : t;
};

/** Le tableau replié « Ce que dit le banc d'essai » : toujours ses lignes ; Σ des matchs (au moins), ⌀ de la calibration des familles mesurées. */
export function tableauDuBanc(bloc) {
  const b = bloc?.banc;
  const lignes = Object.keys(QUOI).map((cle) => {
    const l = (b?.lignes ?? []).find((x) => x.cle === cle) ?? null;
    const f = l?.fourchetteRelative;
    return {
      cle,
      quoi: QUOI[cle],
      matchs: fini(l?.matchsJuges) ? nombre(l.matchsJuges, 0) : '—',
      gain: fini(l?.gainRelatif) ? `${pctSigne(l.gainRelatif, 2)} %${Array.isArray(f) && f.every(fini) ? ` [${pctSigne(f[0], 2)} ; ${pctSigne(f[1], 2)}]` : ''}` : '—',
      calibration: l?.calibration && fini(l.calibration.A) && fini(l.calibration.B) ? `${nb(l.calibration.A, 2)} → ${nb(l.calibration.B, 2)} point` : '—',
      verdict: l ? VERDICTS[l.verdict] ?? '—' : 'Pas encore mesuré',
      mesureUtile: Boolean(l?.utile && !l?.placebo)
    };
  });
  const matchs = (b?.lignes ?? []).map((l) => l.matchsJuges).filter(fini);
  const cal = FAMILLES.map((f) => bloc?.statuts?.[f]).filter((s) => s?.statut === 'mesure' && fini(s?.calibre?.ecartMoyenPoints)).map((s) => s.calibre.ecartMoyenPoints);
  const periode = b?.periodes?.plis ? 'juillet 2023 à septembre 2026' : null;
  return {
    lignes,
    somme: matchs.length ? `au moins ${nombre(Math.max(...matchs), 0)}` : '—',
    moyenne: cal.length ? `${nb(cal.reduce((s, x) => s + x, 0) / cal.length, 2)} point` : '—',
    pied: `Banc d’essai : magasin de ${periode ?? 'juillet 2023 à septembre 2026'}, deux moitiés croisées (chacune jugée avec ce qui a été appris sur l’autre), ${fini(b?.K) ? b.K : 11} essais comptés, seuil sévère${b?.calculeLe ? ` (calcul du ${jjmmaaaa(b.calculeLe)})` : ''}. La compo est la feuille officielle du match ; la dernière compo alignée est rapportée à part. « Annoncé face au réalisé » : l’écart moyen, en points, entre les chances annoncées et ce qui est arrivé (bras du poste → bras du joueur), après le recalage du banc.`
  };
}

/** Tout ce que l'onglet dit, en un objet (la vue n'écrit aucun mot elle-même). */
export function joueursDit(bloc) {
  return {
    enTete: EN_TETE,
    etat: etatDit(bloc),
    compo: ligneCompo(bloc),
    base: ligneBase(bloc),
    pastilles: pastillesDesFamilles(bloc),
    camps: ['home', 'away'].map((camp) => ({ camp, nom: bloc?.clubs?.[camp]?.nom ?? '', id: bloc?.clubs?.[camp]?.id ?? null, ...lignesDuCamp(bloc, camp), pied: piedDuCamp(bloc, camp), manque: bloc?.camps?.[camp]?.manque ?? [] })),
    mentions: mentionsFixes(bloc),
    provenances: provenances(bloc),
    tableau: tableauDuBanc(bloc)
  };
}

export const __pourLesTests = { MOINS, POSTES, MOTIFS, dureeDite };
