/**
 * coupeDuMatch.js — LES MOTS DE L'ENCADRÉ « COUPE » de la page d'un match à venir (étape 36 du plan, lot 1, 09/11/2026).
 * -----------------------------------------------------------------------
 * PUR (sans Vue, sans requête) : les tests le rejouent sur les vraies réponses du serveur (server/test/coupesEcran.test.mjs).
 * Il lit le bloc `coupe` que le serveur joint à l'analyse (data/coupes/coupesRead.js) et la page FotMob du match déjà
 * chargée (son tour, quand le serveur ne connaît pas encore la nature du match).
 *
 * Huit lignes, TOUJOURS là (« — » et la raison quand l'une manque) : le tour, l'aller et le cumul, la chance de se
 * qualifier, la règle d'après 90 minutes, les tirs au but, le lieu, l'avance au cumul, la phrase « 90 minutes ». Chacune avec
 * sa pastille « Explication seulement » (jamais de vert : la chance de la page n'est pas « mesurée » — critique de l'étape
 * 36, constats 1 et 7), sa vraie provenance et le logo des clubs qu'elle nomme. Sous la chance, une ligne grise dit ce que la
 * calibration a trouvé sur les matchs passés, avec le mot fixé d'avance.
 * -----------------------------------------------------------------------
 */

import { tourDeCoupe } from './fotmobLabels.js';
import { parseLeagueLabel } from './leagueDisplay.js';

/** La phrase « 90 minutes » (l'encadré et l'onglet Marchés : une seule constante). */
export const PHRASE_90_MINUTES = 'Les pronostics de cette page comptent les 90 minutes et le temps additionnel : ni la prolongation, ni les tirs au but.';
export const SUR_TITRE = 'Coupe · à blanc';
export const SOUS_TITRE = 'Calculé par CôteMaster d’après le magasin FotMob et le 1N2 de cette page. Rien de ceci n’entre dans les pronostics, la value ou le pari conseillé.';
/** Les tirs au but (critique, constat 7 : la phrase corrigée ; aucune part « favorite » calculée). */
export const PHRASE_TIRS_AU_BUT = 'Tirs au but : pile ou face (50/50). Sur les quelque 700 séances connues, un petit avantage de la favorite (55 sur 100, par exemple) ne se verrait qu’une fois sur deux : le banc d’essai ne le compte pas.';
/** L'avance au cumul (critique, constat 2 : pas mesurée au lot 1). */
export const PHRASE_AVANCE = 'Effet de l’avance au cumul sur les buts du retour : non mesuré au banc d’essai (trop peu de matchs retour, et le score de l’aller dit aussi la force des équipes).';
export const MENTION_DE_LA_CHANCE = 'Part du 1N2 de cette page sur 90 minutes, puis du cumul et de la règle de la compétition.';
export const PASTILLE = Object.freeze({ cle: 'explication', libelle: 'Explication seulement', vert: false });

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « 9 avril » (un jour AAAA-MM-JJ). */
export const jourDit = (jour) => (/^\d{4}-\d{2}-\d{2}$/.test(String(jour ?? '')) ? `${Number(jour.slice(8, 10))} ${MOIS[Number(jour.slice(5, 7)) - 1]}` : '—');
/** Un pourcentage entier « 42 % » (espace insécable comme toLocaleString). */
const pc = (x) => `${Math.round(100 * x).toLocaleString('fr-FR')} %`;
const pc1 = (x) => `${(100 * x).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
/** Des parts entières qui font 100 (la plus grande partie restante d'abord). */
export function partsEntieres(parts) {
  const brutes = parts.map((p) => (fini(p) ? Math.max(0, p) * 100 : 0));
  const bas = brutes.map(Math.floor);
  let reste = 100 - bas.reduce((s, x) => s + x, 0);
  const ordre = brutes.map((b, i) => [b - Math.floor(b), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of ordre) {
    if (reste <= 0) break;
    bas[i]++;
    reste--;
  }
  return bas;
}

/** Le nom d'un club avec son logo : { nom, teamId } (identifiant FotMob « fotmob-N »). */
const clubDe = (c) => ({ nom: c?.nom ?? '—', teamId: Number.isFinite(c?.id) ? `fotmob-${c.id}` : null });

/** La nature en mots. */
export const NATURES_DITES = Object.freeze({ retour: 'match retour', aller: 'match aller', 'match-unique': 'match unique', finale: 'finale', groupe: 'phase de groupes ou de ligue', inconnue: 'nature pas encore connue' });

/**
 * LA NATURE VUE PAR L'ÉCRAN : celle du serveur ; quand il dit « inconnue », le tour de la page FotMob (s'il est publié)
 * cherché dans l'historique des tours de la coupe que le serveur a rendu (`coupe.historique` : code → nature). Rend
 * { valeur, certitude, source, code }.
 */
export function natureVue(coupe, tourDeLaPage = null) {
  const n = coupe?.nature ?? { valeur: 'inconnue' };
  if (n.valeur !== 'inconnue' || !tourDeLaPage) return { ...n, code: coupe?.tour?.code ?? null };
  const t = tourDeCoupe(tourDeLaPage);
  const code = t?.code ?? (/^\d+$/.test(String(tourDeLaPage)) ? `tour-${Number(tourDeLaPage)}` : null);
  const h = code ? coupe?.historique?.[code] ?? null : null;
  if (h === 'match-unique' || h === 'finale' || h === 'groupe' || h === 'aller') return { valeur: h, certitude: 'probable', source: 'tour-de-la-page', code };
  return { ...n, code };
}

/** Ce qui suit un nul : « la prolongation (2 × 15 minutes) puis les tirs au but », « la séance de tirs au but », ou incertain. */
export function apresUnNul(format) {
  if (format === 'prolongation') return 'la prolongation (2 × 15 minutes) puis les tirs au but';
  if (format === 'direct') return 'la séance de tirs au but';
  return 'la prolongation ou directement les tirs au but (règle incertaine)';
}
const buts = (k) => (k === 1 ? 'un but d’écart' : `${k} buts d’écart`);

/** La phrase de la règle d'après 90 minutes (ligne 4). */
export function phraseApres90(format, competition, saison) {
  const v = format?.valeur ?? 'inconnu';
  if (v === 'prolongation') return 'Après 90 minutes : prolongation (2 × 15 minutes) puis tirs au but.';
  if (v === 'direct') return 'Après 90 minutes : tirs au but directs, sans prolongation.';
  const p = format?.prolongations ?? 0;
  const d = format?.directs ?? 0;
  const vue = p + d > 0 ? `observée ${nombre(p)} fois avec prolongation et ${nombre(d)} fois sans` : 'jamais observée';
  return `Règle d’après 90 minutes incertaine pour ${competition ?? 'cette compétition'}${saison ? ` ${saison}` : ''} : ${vue}.`;
}

/** Le libellé de la saison d'un format (« 2025-26 » ou « 2025 »). */
const saisonDite = (league, s) => {
  if (!Number.isFinite(s)) return null;
  const civile = /Libertadores|Sudamericana|Brasil|Argentina|Chile|US Open|Leagues Cup|Canadian|Chine/.test(String(league ?? ''));
  return civile ? `${s}` : `${s}-${String(s + 1).slice(2)}`;
};

/** La ligne grise SOUS la chance (critique, constat 7) : ce que la calibration a trouvé, jamais un vert. */
export function ligneDeLaCalibration(banc) {
  const fin = 'La chance de cette page part de son 1N2 : elle sera vérifiée sur vos matchs à partir de 2027.';
  const c = banc?.mesure ? banc.chance : null;
  if (!c || !fini(c.annonce) || !fini(c.realise)) return `Formule pas encore vérifiée sur les matchs passés. ${fin}`;
  return `Formule vérifiée sur les matchs 2023-2026 avec les statistiques seules : annoncé ${pc1(c.annonce)}, réalisé ${pc1(c.realise)} (${c.mot ?? 'non tranché'}). ${fin}`;
}

/** Le tableau replié « Ce que dit le banc d'essai » : cinq lignes, Σ des confrontations, ⌀ de l'écart (jamais une somme de pourcentages). */
export function tableauDuBanc(banc) {
  const c = banc?.mesure ? banc.chance : null;
  const lignes = [
    { cle: 'chance', quoi: 'Chance de se qualifier (la formule, statistiques seules)', matchs: c ? nombre(c.n) : '—', annonceRealise: c && fini(c.annonce) ? `${pc1(c.annonce)} face à ${pc1(c.realise)}` : '—', mot: c ? c.mot ?? '—' : 'pas encore vérifiée' },
    { cle: 'prolongation', quoi: 'Prolongation', matchs: '—', annonceRealise: '—', mot: 'pile ou face : non mesuré au lot 1' },
    { cle: 'tirsAuBut', quoi: 'Tirs au but', matchs: '—', annonceRealise: '—', mot: 'pile ou face : non mesurable (environ 700 séances)' },
    { cle: 'terrainNeutre', quoi: 'Terrain neutre', matchs: '—', annonceRealise: '—', mot: 'non mesurable au banc d’essai' },
    { cle: 'avanceAuCumul', quoi: 'Avance au cumul (matchs retour)', matchs: '—', annonceRealise: '—', mot: 'non mesuré au banc d’essai' }
  ];
  return {
    lignes,
    somme: c ? nombre(c.n) : '—',
    moyenne: c && fini(c.ecartMoyen) ? `${(100 * c.ecartMoyen).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} point${100 * c.ecartMoyen >= 2 ? 's' : ''} d’écart moyen par dixième` : '—',
    pied: banc?.mesure
      ? `Calibration : magasin de juillet 2023 à septembre 2026, deux moitiés croisées, un seul regard (calcul du ${banc.calculeLe ? jourDit(banc.calculeLe) + ' ' + banc.calculeLe.slice(0, 4) : '—'}). Ces matchs ont aussi servi à régler le modèle de buts : un résultat prudent ; la preuve neuve viendra de vos matchs.`
      : 'La calibration de la formule n’a pas encore été passée au banc d’essai.'
  };
}

const PROV_MAGASIN = (calculeLe) => ({ source: 'magasin FotMob (feuilles des matchs déjà joués)', action: 'rangé', releveLe: calculeLe ?? null, vieux: 24 });

/** Faut-il la phrase « 90 minutes » près des pronostics ? Oui pour un match qui peut aller en prolongation (retour, match unique, finale, inconnu). */
export function montrerLaPhrase90(coupe, tourDeLaPage = null) {
  if (!coupe) return false;
  const v = natureVue(coupe, tourDeLaPage).valeur;
  return v === 'retour' || v === 'match-unique' || v === 'finale' || v === 'inconnue';
}

/** Le libellé du tour pour l'en-tête de la page (la pastille du tour), quand le serveur le connaît. */
export const libelleDuTourPourLEnTete = (coupe) => coupe?.tour?.libelle ?? null;

/**
 * LES LIGNES DE L'ENCADRÉ. `coupe` : le bloc du serveur (undefined : un serveur d'avant l'étape 36 ; null : pas une
 * coupe) ; `page` : la page FotMob ({ data: { meta: { round } } }) ; `analyse` : { loading, error }. Rend { montre, etat,
 * titre, surTitre, sousTitre, lignes: [8], tableau, ligneCalibration }.
 */
export function lignesDeLaCoupe({ coupe, page = null, analyse = null }) {
  if (coupe === null) return { montre: false };
  const vide = (cle, titre, texte) => ({ cle, titre, phrases: [texte], mentions: [], clubs: [], pastille: PASTILLE, provenances: [] });
  const base = { montre: true, surTitre: SUR_TITRE, sousTitre: SOUS_TITRE, tableau: tableauDuBanc(coupe?.banc), ligneCalibration: ligneDeLaCalibration(coupe?.banc) };
  if (coupe === undefined) {
    if (analyse?.loading) return { ...base, etat: { cle: 'chargement', titre: null, texte: null }, titre: 'Coupe', lignes: [] };
    return { montre: false };
  }
  const dom = clubDe(coupe.clubs?.home);
  const ext = clubDe(coupe.clubs?.away);
  // La compétition par le nom que l'appli lui donne (DESIGN.md ; critique de l'étape 36, constat 7) : « FA Cup », jamais
  // le libellé brut de FotMob « FA Cup - England ».
  const competition = coupe.league ? parseLeagueLabel(coupe.league)?.name || coupe.league : 'cette coupe';
  const tourPage = page?.data?.meta?.round ?? null;
  const nature = natureVue(coupe, tourPage === null || tourPage === undefined ? null : String(tourPage));
  const libelle = coupe.tour?.libelle ?? (tourPage ? tourDeCoupe(String(tourPage))?.libelle ?? String(tourPage) : null);
  const suffixe = nature.valeur === 'retour' ? ', match retour' : nature.valeur === 'aller' ? ', match aller' : nature.valeur === 'match-unique' ? ', match unique' : '';
  const titre = `${coupe.league ? competition : 'Coupe'}${libelle ? ` — ${libelle}${nature.valeur === 'finale' ? '' : suffixe}` : ''}`;
  const etats = {
    illisible: { titre: 'Coupe illisible', texte: 'Coupe illisible : la base n’a pas répondu. Les autres cartes ne sont pas touchées.', ton: 'is-warning' },
    'clubs-inconnus': { titre: 'Club non reconnu', texte: `Coupe : ${coupe.clubs?.home?.id === null || coupe.clubs?.home?.id === undefined ? dom.nom : ext.nom} n’est pas reconnu par son identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent) — ni aller, ni chance de qualification.`, ton: 'is-warning' },
    'pas-encore-calcule': { titre: 'Pas encore calculé', texte: 'Pas encore calculé : la prochaine passe de nuit rangera les tours et les matchs aller.', ton: 'is-info' },
    'sans-buts-attendus': { titre: 'Chance non calculée', texte: 'Chance non calculée : le moteur n’a pas de buts attendus pour ce match.', ton: 'is-info' }
  };
  const etat = coupe.etat === 'pret' ? { cle: 'pret', titre: null, texte: null } : { cle: coupe.etat, ...(etats[coupe.etat] ?? etats.illisible) };
  const fmt = coupe.format?.valeur ?? 'inconnu';
  const apres = apresUnNul(fmt);
  // Rien lu au magasin (la nuit jamais passée, un club sans identifiant) : aucune provenance plutôt qu'une date vide.
  const magasin = coupe.calculeLe ? [PROV_MAGASIN(coupe.calculeLe)] : [];
  // 1. Le tour.
  const ligneTour = (() => {
    if (!libelle) return { ...vide('tour', 'Tour', 'Tour : tour pas encore publié par FotMob.'), provenances: magasin };
    const mentions = [];
    const brut = coupe.tour?.brut ?? (tourPage ? String(tourPage) : null);
    if (brut && brut !== libelle) mentions.push(`intitulé FotMob : « ${brut} »`);
    if (nature.certitude === 'probable' && coupe.tour?.source === 'aller') mentions.push('tour déduit du match aller');
    const p = coupe.tour?.source === 'page' || (!coupe.tour && tourPage) ? { source: 'FotMob, page du match', action: 'relevé', releveLe: coupe.tour?.releveLe ?? page?.data?.releveLe ?? null } : null;
    return { cle: 'tour', titre: 'Tour', phrases: [`Tour : ${libelle} (${nature.valeur === 'finale' ? 'match unique' : NATURES_DITES[nature.valeur] ?? nature.valeur}).`], mentions, clubs: [], pastille: PASTILLE, provenances: p ? [p] : magasin };
  })();
  // 2. L'aller et le cumul (ou le match unique, l'aller, le groupe).
  const ligneAller = (() => {
    const cles = { cle: 'aller', titre: 'Aller et cumul', mentions: [], pastille: PASTILLE, provenances: magasin };
    if (nature.valeur === 'retour' && coupe.aller) {
      const a = coupe.aller;
      const k = a.avance;
      // L'aller s'est joué chez le visiteur d'aujourd'hui.
      const phrase1 = `Aller le ${jourDit(a.date)} : ${ext.nom} ${a.score?.home ?? '?'}-${a.score?.away ?? '?'} ${dom.nom}. Cumul avant le retour : ${dom.nom} ${a.score?.away ?? '?'} – ${a.score?.home ?? '?'} ${ext.nom}.`;
      let phrase2;
      if (!fini(k)) phrase2 = 'Le score de l’aller n’est pas connu : chance de qualification non calculée.';
      else if (k === 0) phrase2 = `Cumul à égalité : le vainqueur du retour se qualifie ; un nul mène à ${apres}.`;
      else if (k > 0) phrase2 = `${dom.nom} se qualifie s’il ne perd pas par ${buts(k)} ou plus ; une défaite par ${buts(k)} mène à ${apres}.`;
      else phrase2 = `${dom.nom} doit gagner par ${buts(-k + 1)} pour se qualifier dans les 90 minutes ; par ${buts(-k)}, ${apres}.`;
      return { ...cles, phrases: [phrase1, phrase2], clubs: [ext, dom] };
    }
    if (nature.valeur === 'match-unique' || nature.valeur === 'finale') return { ...cles, phrases: [`Match unique : le vainqueur se qualifie ; en cas d’égalité, ${apres}.`], clubs: [] };
    if (nature.valeur === 'aller') {
      const chez = coupe.retourPrevu?.chez === coupe.clubs?.away?.id ? ext : coupe.retourPrevu?.chez === coupe.clubs?.home?.id ? dom : null;
      return { ...cles, phrases: [`Match aller d’une double confrontation : le retour se joue le ${jourDit(coupe.retourPrevu?.date)}${chez ? ` chez ${chez.nom}` : ''}. La chance de qualification sera calculée avant le retour, avec le score de l’aller.`], clubs: chez ? [chez] : [], provenances: coupe.calculeLe ? [{ source: 'calendrier de saison (FotMob)', action: 'lu', releveLe: coupe.calculeLe, vieux: 24 }] : [] };
    }
    if (nature.valeur === 'groupe') return { ...cles, phrases: ['Phase de groupes ou de ligue : personne n’est éliminé à l’issue de ce match.'], clubs: [] };
    return { ...cles, phrases: ['Tour pas encore connu (FotMob ne l’a pas publié) : chance de qualification non montrée.'], clubs: [] };
  })();
  // 3. La chance de se qualifier.
  const chance = coupe.chance ?? ((nature.valeur === 'match-unique' || nature.valeur === 'finale') && nature.source === 'tour-de-la-page' ? coupe.chanceSiMatchUnique ?? null : null);
  const ligneChance = (() => {
    const cles = { cle: 'chance', titre: 'Chance de se qualifier', mentions: [], pastille: PASTILLE };
    const provChance = { source: 'Calcul CôteMaster, à blanc : le 1N2 de cette page', action: 'calculé', releveLe: coupe.luLe ?? null };
    if (!chance) {
      const raison = coupe.etat === 'sans-buts-attendus' ? 'Chance non calculée : le moteur n’a pas de buts attendus pour ce match.' : nature.valeur === 'aller' ? 'Chance de qualification : calculée avant le retour, avec le score de l’aller.' : nature.valeur === 'groupe' ? 'Chance de qualification : sans objet en phase de groupes.' : coupe.etat !== 'pret' ? 'Chance de qualification : —' : 'Chance de qualification non montrée : la nature du match n’est pas connue.';
      return { ...cles, phrases: [raison], clubs: [], provenances: [], barres: null };
    }
    const [pd, pe] = partsEntieres([chance.dom.total, chance.ext.total]);
    const [x, y, e] = partsEntieres([chance.dom.p90, chance.ext.p90, chance.egal]);
    return {
      ...cles,
      phrases: [`Chance de se qualifier : ${dom.nom} ${pd} %, ${ext.nom} ${pe} %.`, `Dans les 90 minutes : ${dom.nom} ${x} %, ${ext.nom} ${y} %. Égalité après 90 minutes : ${e} %.`, 'En cas d’égalité : pile ou face (prolongation et tirs au but).'],
      mentions: [MENTION_DE_LA_CHANCE],
      clubs: [dom, ext],
      provenances: [provChance],
      barres: { dom: pd, ext: pe }
    };
  })();
  // 4. Après 90 minutes.
  const ligneApres = (() => {
    const saison = saisonDite(coupe.league, coupe.format?.saison ?? coupe.saison);
    const mentions = [];
    const n = (coupe.format?.prolongations ?? 0) + (coupe.format?.directs ?? 0);
    if ((fmt === 'prolongation' || fmt === 'direct') && n) mentions.push(`observée sur ${nombre(n)} match${n > 1 ? 's' : ''} de ${competition} ${coupe.format?.source === 'saison' ? saison ?? '' : coupe.format?.source === 'saison-precedente' ? 'la saison d’avant' : saison ?? ''}`.trim());
    return { cle: 'apres90', titre: 'Après 90 minutes', phrases: [phraseApres90(coupe.format, competition, saison)], mentions, clubs: [], pastille: PASTILLE, provenances: magasin };
  })();
  // 5. Les tirs au but.
  const ligneTab = { cle: 'tirsAuBut', titre: 'Tirs au but', phrases: [PHRASE_TIRS_AU_BUT], mentions: [], clubs: [], pastille: { ...PASTILLE, sous: 'non mesurable au banc d’essai' }, provenances: [{ source: 'votre décision du 02/11/2026', action: 'décidé', releveLe: null, jourSeul: '02/11/2026' }] };
  // 6. Le lieu.
  const ligneLieu = (() => {
    const l = coupe.lieu ?? { valeur: 'inconnu' };
    const provs = [];
    if (l.source === 'avant-match') provs.push({ source: 'archive d’avant-match (page FotMob relevée avant le coup d’envoi)', action: 'relevé', releveLe: l.releveLe ?? null });
    else if (l.source === 'page') provs.push({ source: 'FotMob, page du match', action: 'relevé', releveLe: l.releveLe ?? null });
    if (coupe.calculeLe) provs.push({ source: 'magasin FotMob (stades des 365 derniers jours)', action: 'rangé', releveLe: coupe.calculeLe, vieux: 24 });
    const cles = { cle: 'lieu', titre: 'Lieu', mentions: [], pastille: { ...PASTILLE, sous: 'non mesurable au banc d’essai' }, provenances: provs };
    if (l.valeur === 'neutre') {
      const d = l.distances;
      const km = d && (fini(d.dom) || fini(d.ext)) ? ` — à ${fini(d.dom) ? nombre(d.dom) : '?'} km de chez ${dom.nom}, ${fini(d.ext) ? nombre(d.ext) : '?'} km de chez ${ext.nom}` : '';
      return { ...cles, phrases: [`Terrain neutre : ${l.stade}${l.ville ? ` (${l.ville})` : ''}, stade d’aucun des deux clubs${km}. L’avantage du terrain ne joue pas : une explication, pas dans les pourcentages.`], clubs: [dom, ext] };
    }
    if (l.valeur === 'chez-le-visiteur') return { ...cles, phrases: [`Au ${l.stade}, stade habituel de ${ext.nom} : pas un terrain neutre, ${ext.nom} joue chez lui.`], clubs: [ext] };
    if (l.valeur === 'domicile') return { ...cles, phrases: [`Au ${l.stade}, stade habituel de ${dom.nom}.`], clubs: [dom] };
    return { ...cles, phrases: ['Lieu pas encore publié par FotMob.'], clubs: [] };
  })();
  // 7. L'avance au cumul.
  const ligneAvance = { cle: 'avance', titre: 'Avance au cumul', phrases: [nature.valeur === 'retour' ? PHRASE_AVANCE : 'Avance au cumul : sans objet (pas de match aller avant celui-ci).'], mentions: [], clubs: [], pastille: { ...PASTILLE, sous: 'non mesuré au banc d’essai' }, provenances: [] };
  // 8. La phrase « 90 minutes ».
  const ligne90 = { cle: '90minutes', titre: '90 minutes', phrases: [PHRASE_90_MINUTES], mentions: [], clubs: [], pastille: PASTILLE, provenances: [] };
  return { ...base, etat, titre, nature, lignes: [ligneTour, ligneAller, ligneChance, ligneApres, ligneTab, ligneLieu, ligneAvance, ligne90] };
}
