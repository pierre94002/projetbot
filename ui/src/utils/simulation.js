/**
 * simulation.js — LES MOTS DE LA SIMULATION COMPLÈTE à l'écran (étape 28 du plan, 27/10/2026).
 * -----------------------------------------------------------------------
 * JavaScript pur, sans Vue ni navigateur (les tests du serveur le rejouent : server/test/simulationEcrans.test.mjs).
 * Rien n'y est calculé de nouveau : le serveur range la nuit (data/simulation/) et ses routes (/api/simulation) disent
 * les textes — probabilités « ≥ 90 % » / « ≤ 10 % », loi employée, phrase de l'enjeu arrondie à 5, déroulé repondéré,
 * prix juste ; ce fichier les MET EN FORME pour :
 *   - l'onglet « Fin de saison » des classements (FinDeSaisonTable) ;
 *   - la pastille d'enjeu des cartes et l'encadré « Enjeu » de la page du match (EnjeuBadge, EnjeuDuMatch) ;
 *   - la carte « Déroulé simulé » (DerouleSimuleCard) ;
 *   - le prix juste du ticket (TicketDuPari) : un écart NEUTRE à la cote tapée, jamais le vert d'une value ;
 *   - la carte de Réglages (EngineSimulationTrial) : les nuits, l'avancement de la preuve, les interrupteurs, la porte 1.
 * Identifiants : le numéro FotMob, jamais un nom. Français simple, virgule décimale, vrai signe moins (−), l'heure de
 * chaque chiffre. Toute fonction qui dépend de l'heure reçoit `maintenant` (ms).
 * -----------------------------------------------------------------------
 */

import { libelleDuDeroule } from './langageParis.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const virgule = (x, d = 1) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const entier = (x) => Math.round(x).toLocaleString('fr-FR');
const cote2 = (x) => (fini(x) ? x.toFixed(2).replace('.', ',') : '—');
const majuscule = (t) => (typeof t === 'string' && t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}` : t ?? null);
const signe = (x) => (x > 0 ? '+' : x < 0 ? '−' : '');

const PARTIES = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: false });
const parties = (iso) => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? Object.fromEntries(PARTIES.formatToParts(new Date(t)).map((x) => [x.type, x.value])) : null;
};
/** « 14 h 32 » (heure de Paris), ou null. */
export const heureDite = (iso) => {
  const p = parties(iso);
  return p ? `${Number(p.hour)} h ${p.minute}` : null;
};
/** « 26/10 » (Paris), ou null. */
export const jourDit = (iso) => {
  const p = parties(iso);
  return p ? `${p.day}/${p.month}` : null;
};
/** « la nuit du 26/10 à 0 h 41 », ou « nuit inconnue ». */
export const nuitDite = (iso) => (parties(iso) ? `la nuit du ${jourDit(iso)} à ${heureDite(iso)}` : 'nuit inconnue');
/** « 27/10/2026 » d'un jour AAAA-MM-JJ. */
const jourAnnee = (jour) => (/^\d{4}-\d{2}-\d{2}$/.test(String(jour ?? '')) ? String(jour).split('-').reverse().join('/') : null);

// ------------------------------------------------------------ les identifiants

/** LE numéro FotMob d'un club ('fotmob-8456', 8456, '8456' → '8456') ; null pour un nom (la règle du serveur, saisons.idFotMob). */
export function idFotMob(x) {
  if (typeof x === 'number') return Number.isInteger(x) && x > 0 ? String(x) : null;
  if (typeof x !== 'string') return null;
  const m = /^(?:fotmob-)?(\d+)$/.exec(x.trim());
  return m && Number(m[1]) > 0 ? String(Number(m[1])) : null;
}

/** La clé d'un enjeu : championnat, jour, et les deux numéros FotMob — jamais un nom ; null s'il en manque un. */
export function cleDEnjeu({ league = null, date = null, homeId = null, awayId = null } = {}) {
  const h = idFotMob(homeId);
  const a = idFotMob(awayId);
  return league && /^\d{4}-\d{2}-\d{2}$/.test(String(date ?? '')) && h && a ? `${league}|${date}|${h}|${a}` : null;
}

// ------------------------------------------------------------ l'enjeu

/** Les mots des catégories (le serveur : enjeux_rencontres.categorie). « enjeu » (entre les deux seuils) n'a pas de pastille. */
export const LIBELLES_ENJEU = Object.freeze({ 'gros-enjeu': 'Gros enjeu', 'sans-enjeu': 'Sans enjeu', 'non-calcule': 'Enjeu non calculé' });
const TONS_ENJEU = Object.freeze({ 'gros-enjeu': 'info', 'sans-enjeu': 'gris', 'non-calcule': 'pointille' });
const ICONES_ENJEU = Object.freeze({ info: 'flag', gris: 'minus', pointille: 'info' });

/**
 * L'ENJEU d'une rencontre, tel que la pastille et l'encadré le disent. `enjeu` : une ligne de GET /api/simulation/enjeux
 * (ou le bloc `simulation.enjeu` de la page) — { categorie, libelle, phrase, quand, calcule?, raison? }. Rend { visible
 * (la pastille a un mot), categorie, ton ('info' bleu d'information | 'gris' | 'pointille'), libelle, icone, phrase,
 * quand, titre (survol ET aria-label : la phrase arrondie à 5, puis quand) }. Jamais vert ni rouge.
 */
export function enjeuDit(enjeu) {
  if (!enjeu || typeof enjeu !== 'object') return { visible: false, categorie: null, ton: null, libelle: null, icone: null, phrase: null, quand: null, titre: null };
  const categorie = enjeu.calcule === false ? 'non-calcule' : enjeu.categorie ?? null;
  const ton = TONS_ENJEU[categorie] ?? null;
  const libelle = LIBELLES_ENJEU[categorie] ?? null;
  const phrase = categorie === 'non-calcule' ? `Enjeu non calculé${enjeu.raison ? ` : ${enjeu.raison}` : ''}.` : enjeu.phrase ?? null;
  const quand = enjeu.quand ? `${majuscule(enjeu.quand)}.` : null;
  const titre = [phrase, quand].filter(Boolean).join(' ') || libelle;
  return { visible: Boolean(libelle), categorie, ton, libelle, icone: ICONES_ENJEU[ton] ?? 'info', phrase, quand, titre };
}

// ------------------------------------------------------------ la fin de saison

/** La légende des extrêmes et du gris (conception §5, décision 2). */
export const LEGENDE_DES_EXTREMES =
  'Au-delà de 90 % ou en deçà de 10 %, la simulation ne sait pas être plus précise : « ≥ 90 % » ou « ≤ 10 % » (sur 2023-2026, 97 % annoncés pour la 1re place se sont réalisés 92,6 % du temps).';
export const LEGENDE_UNANIME = 'En gris, « acquis sauf surprise » : 10 000 fins de saison simulées sur 10 000 vont dans le même sens — jamais « 100 % ».';

/** La raison d'une fin de saison non calculée, sans répéter le titre. */
const sansTitre = (raison) => String(raison ?? '').replace(/^Fin de saison non calculée\s*[—:-]\s*/, '').trim();

/**
 * LA FIN DE SAISON d'un championnat (GET /api/simulation/saison), pour FinDeSaisonTable. Rend { etat: 'non-calcule',
 * titre, raison } ou { etat: 'calcule', provenance, loi, mesure, mentions, tables: [{ nom, familles, lignes }] } — l'ordre
 * OFFICIEL des lignes (jamais réordonné), une colonne par famille présente, chaque case avec son texte du serveur
 * (point près, « ≥ 90 % », « ≤ 10 % », arrondi à 10 pour la loi « table »), son gris « acquis sauf surprise », son survol.
 */
export function finDeSaisonDite(reponse) {
  if (!reponse || reponse.calcule === false) {
    return { etat: 'non-calcule', titre: 'Fin de saison non calculée', raison: sansTitre(reponse?.raison) || 'raison non dite par le serveur' };
  }
  const loi = reponse.loi ?? {};
  // Le serveur range la loi au bout du détail de la provenance (conception §5) ; l'écran la dit sur sa propre ligne —
  // et, pour le classement seul, dans sa mise en garde ambre : jamais deux fois la même phrase (vu dans le bac, 27/10).
  const detailServeur = reponse.provenance?.detail ?? null;
  const finDeLoi = typeof loi.phrase === 'string' && loi.phrase ? ` · ${loi.phrase}` : null;
  const detail = detailServeur && finDeLoi && detailServeur.endsWith(finDeLoi) ? detailServeur.slice(0, -finDeLoi.length) : detailServeur;
  return {
    etat: 'calcule',
    provenance: {
      source: reponse.provenance?.source ?? 'source non indiquée',
      detail,
      calculeLe: reponse.provenance?.calculeLe ?? reponse.calculeLe ?? null
    },
    loi: { loi: loi.loi ?? null, phrase: majuscule(loi.phrase ?? 'loi non dite par le serveur'), avertissement: loi.loi === 'table', pourquoi: loi.pourquoi ?? null },
    mesure: reponse.mesure ?? null,
    mentions: (reponse.mentions ?? []).map(majuscule),
    tables: (reponse.tables ?? []).map((t) => ({
      nom: t.nom,
      familles: t.familles ?? [],
      lignes: (t.clubs ?? []).map((c) => ({
        teamId: idFotMob(c.teamId) ? `fotmob-${idFotMob(c.teamId)}` : null,
        nom: c.nom ?? `club n° ${c.teamId ?? '?'}`,
        rang: c.rang ?? null,
        points: c.points ?? null,
        penalite: fini(c.penalite) && c.penalite > 0 ? `−${c.penalite} pt${c.penalite > 1 ? 's' : ''}` : null,
        cellules: (t.familles ?? []).map((f) => {
          const x = c.familles?.[f.cle];
          if (!x) return { cle: f.cle, texte: '—', gris: true, titre: `${f.libelle} : aucune probabilité rangée pour ce club cette nuit.` };
          const gris = Boolean(x.gris);
          return { cle: f.cle, texte: x.texte, gris, titre: `${f.libelle} : ${x.texte}${gris ? ' (10 000 fins de saison simulées sur 10 000 dans le même sens)' : ''}.` };
        })
      }))
    }))
  };
}

// ------------------------------------------------------------ le déroulé simulé

/** Les groupes de la carte, dans l'ordre (seules les lignes que le serveur envoie y paraissent). */
export const GROUPES_DU_DEROULE = Object.freeze([
  Object.freeze({ titre: 'À la mi-temps', cles: Object.freeze(['htH', 'htD', 'htA', 'htO05', 'htO15']) }),
  Object.freeze({ titre: 'Mi-temps / fin', cles: Object.freeze(['htFt0', 'htFt1', 'htFt2', 'htFt3', 'htFt4', 'htFt5', 'htFt6', 'htFt7', 'htFt8']) }),
  Object.freeze({ titre: 'Le premier but', cles: Object.freeze(['premierDom', 'premierExt', 'premierAvant30']) }),
  Object.freeze({ titre: 'D’une mi-temps à l’autre', cles: Object.freeze(['h2plusQueH1', 'retourDom', 'retourExt']) })
]);

/** L'écart mesuré d'une ligne, en mots (au survol) : jamais « ± 0,4 point » seul. */
export function ecartMesureDit(ecart) {
  if (!ecart || !fini(ecart.ecart)) return 'Écart au réel pas encore mesuré pour ce marché.';
  return `Écart au réel mesuré sur 17 818 matchs de juillet 2025 à septembre 2026, avec les cotes de clôture : annoncé ${virgule(ecart.annonce)} %, arrivé ${virgule(ecart.realise)} % (${signe(ecart.ecart)}${virgule(Math.abs(ecart.ecart))} point). Le hasard du tirage seul vaut ± 0,5 point.`;
}

const MI_TEMPS_FIN = ['home', 'draw', 'away'];
/** La sélection du ticket qu'une ligne du déroulé représente (jambes.js), ou null quand aucun marché ne la dit exactement. */
export function jambeDuDeroule(cle) {
  if (cle === 'htH' || cle === 'htD' || cle === 'htA') return { marketId: 'halfTimeResult', params: { outcome: { htH: 'home', htD: 'draw', htA: 'away' }[cle] } };
  if (cle === 'htO05' || cle === 'htO15') return { marketId: 'halfTimeGoals', params: { line: cle === 'htO05' ? 0.5 : 1.5, side: 'over' } };
  const ft = /^htFt([0-8])$/.exec(cle ?? '');
  if (ft) return { marketId: 'halfTimeFullTime', params: { ht: MI_TEMPS_FIN[Math.floor(Number(ft[1]) / 3)], ft: MI_TEMPS_FIN[Number(ft[1]) % 3] } };
  if (cle === 'premierDom' || cle === 'premierExt') return { marketId: 'firstGoal', params: { team: cle === 'premierDom' ? 'home' : 'away' } };
  if (cle === 'premierAvant30') return { marketId: 'firstGoalBefore30', params: { outcome: 'yes' } };
  if (cle === 'h2plusQueH1') return { marketId: 'secondHalfMoreGoals', params: { outcome: 'yes' } };
  return null;
}

/**
 * LE DÉROULÉ SIMULÉ de la page (le bloc `simulation.deroule` de l'analyse, affichage « tout »), pour DerouleSimuleCard.
 * Rend { calcule: false, phrase } ou { calcule: true, phrase (« Information, pas un pronostic… »), mention, provenance,
 * calculeLe, ecartes (la phrase des marchés non montrés), groupes: [{ titre, lignes: [{ cle, libelle, texte, titre,
 * jambe }] }] } — seulement les lignes envoyées par le serveur (les marchés écartés par la preuve n'y sont jamais).
 */
export function derouleDit(deroule, { home = 'Domicile', away = 'Extérieur' } = {}) {
  if (!deroule) return { calcule: false, phrase: 'Pas de déroulé simulé pour ce match.' };
  if (!deroule.calcule) return { calcule: false, phrase: deroule.phrase ?? 'Pas de déroulé simulé pour ce match.' };
  const parCle = new Map((deroule.lignes ?? []).map((l) => [l.cle, l]));
  const groupes = GROUPES_DU_DEROULE.map((g) => ({
    titre: g.titre,
    lignes: g.cles
      .filter((cle) => parCle.has(cle))
      .map((cle) => {
        const l = parCle.get(cle);
        return { cle, libelle: libelleDuDeroule(cle, { home, away }), texte: l.texte ?? (fini(l.p) ? `${virgule(100 * l.p)} %` : '—'), p: l.p ?? null, titre: ecartMesureDit(l.ecartMesure), jambe: jambeDuDeroule(cle) };
      })
  })).filter((g) => g.lignes.length);
  return {
    calcule: true,
    phrase: deroule.phrase ?? null,
    mention: deroule.mention ?? 'Ni pronostic ni règlement automatique.',
    provenance: deroule.provenance ?? null,
    calculeLe: deroule.calculeLe ?? null,
    ecartes: deroule.ecartes?.phrase ?? null,
    groupes
  };
}

/** La sélection du ticket faite d'une ligne du déroulé : se lit et se chiffre, ne se parie pas (`pariable: false`). */
export function selectionDuDeroule(ligne, match, deroule = null) {
  if (!ligne?.jambe) return null;
  return {
    matchId: match?.matchId ?? null,
    homeName: match?.home ?? null,
    awayName: match?.away ?? null,
    league: match?.league ?? null,
    commenceTime: match?.commenceTime ?? null,
    market: 'Déroulé simulé',
    pick: ligne.libelle,
    marketId: ligne.jambe.marketId,
    params: ligne.jambe.params,
    cote: null,
    bookmaker: null,
    bookmakerTitle: null,
    coteReleveeA: null,
    coteSource: null,
    probabiliteMoteur: fini(ligne.p) ? ligne.p : null,
    probabiliteSource: `déroulé simulé ${deroule?.calculeLe ? nuitDite(deroule.calculeLe) : 'la nuit'} (10 000 matchs)`,
    probabiliteLueA: deroule?.calculeLe ?? null,
    coteJuste: fini(ligne.p) && ligne.p > 0 ? 1 / ligne.p : null,
    bornes: null,
    pariable: false
  };
}

// ------------------------------------------------------------ le prix juste du ticket

/** La précision d'un prix juste (critique §1.1), dite sous lui. */
export const PRECISION_DU_PRIX_JUSTE =
  'Prix juste à ± 1 point de probabilité ; ± 2 points quand une sélection est « les deux marquent » (sous-estimé de 2 points sur 2023-2026) ; moins sûr au-delà de 65 % (gros favoris : −8 points mesurés sur 328 matchs).';
/** Une sélection qui se lit et se chiffre mais ne se règle pas automatiquement (mi-temps, score exact, déroulé). */
export const SE_LIT_NE_SE_PARIE_PAS = 'se lit, ne se parie pas : ce pari ne se règle pas automatiquement';

/** Les sélections du ticket telles que POST /api/simulation/prix-combine les attend. */
export const jambesDuTicket = (selections = []) =>
  selections.map((s) => ({ matchId: s.matchId ?? null, homeName: s.homeName ?? null, awayName: s.awayName ?? null, league: s.league ?? null, commenceTime: s.commenceTime ?? null, market: s.market ?? null, marketId: s.marketId ?? null, params: s.params ?? null, pick: s.pick ?? null }));

/**
 * LE PRIX JUSTE, dit pour le ticket. `reponse` : celle de POST /api/simulation/prix-combine (ou null : pas encore
 * demandé) ; `cote` : la cote du combiné tapée ; `bookmaker` : le titre de son bookmaker. Rend { etat: 'attente' |
 * 'eteint' | 'refuse' | 'impossible' | 'prix', … } : le prix juste et son heure, la cote tapée en écart NEUTRE (jamais
 * une value : aucun prix de combiné n'est relevé), « si les sélections étaient indépendantes » (gris), la précision, la
 * provenance, les mentions du serveur, et `pariable`.
 */
export function prixJusteDit(reponse, { cote = null, bookmaker = null } = {}) {
  if (!reponse) return { etat: 'attente' };
  if (reponse.eteint) return { etat: 'eteint', phrase: reponse.phrase ?? null, pourquoi: reponse.pourquoi ?? null };
  const mentions = [...(reponse.mentions ?? [])];
  if (reponse.impossible) {
    const dite = mentions.find((m) => /^impossible/.test(m)) ?? 'impossible : ces sélections ne peuvent pas gagner ensemble';
    return { etat: 'impossible', texte: 'impossible', phrase: dite.replace(/^impossible\s*:\s*/, '') };
  }
  const p = reponse.probabilite;
  if (!(fini(p) && p > 0)) return { etat: 'refuse', raisons: reponse.raisons?.length ? reponse.raisons : ['pas de prix juste pour ce ticket'], mentions };
  const heure = heureDite(reponse.calculeA);
  const ecart = fini(cote) && cote > 1 ? cote * p - 1 : null;
  let ecartTexte = null;
  if (ecart !== null) {
    const pct = Math.round(Math.abs(ecart) * 100);
    const ou = pct === 0 ? 'au prix juste' : ecart < 0 ? `soit ${pct} % sous le prix juste` : `soit ${pct} % au-dessus du prix juste`;
    ecartTexte = `Chez ${bookmaker ?? 'votre bookmaker'} (cote tapée) : ${cote2(cote)}, ${ou}`;
  }
  return {
    etat: 'prix',
    probabilite: p,
    prix: `Prix juste : ${cote2(1 / p)} (${virgule(100 * p)} %)${heure ? ` à ${heure}` : ''}`,
    ecart: ecartTexte,
    siIndependants: fini(reponse.siIndependants) && reponse.siIndependants > 0 ? `si les sélections étaient indépendantes : ${cote2(1 / reponse.siIndependants)}` : null,
    precision: PRECISION_DU_PRIX_JUSTE,
    provenance: (reponse.provenance ?? []).length ? `Calculé par le serveur : ${reponse.provenance.join(' ; ')}.` : null,
    mentions,
    pariable: reponse.pariable !== false,
    source: (reponse.provenance ?? []).join(' ; ').slice(0, 300) || 'grille du moteur',
    lueA: reponse.calculeA ?? null
  };
}

// ------------------------------------------------------------ Réglages : la nuit, la preuve, les interrupteurs, la porte 1

const mo = (octets) => (fini(octets) ? `${entier(octets / 1048576)} Mo` : null);
const secondes = (ms) => (fini(ms) ? `${ms < 10_000 ? virgule(ms / 1000) : entier(ms / 1000)} s` : null);

/** La dernière nuit des fins de saison, en mots : quand, combien, durée et mémoire, les refus NOMMÉS. */
export function nuitDesSaisonsDite(nuit) {
  if (!nuit?.calculeLe) return { titre: 'Fins de saison : pas encore calculées', texte: 'La première passe de nuit après la mise en service les calculera.', refus: [] };
  const b = nuit.bilan ?? {};
  const morceaux = [
    fini(b.simules) && fini(b.championnats) ? `${b.simules} championnat${b.simules > 1 ? 's' : ''} simulé${b.simules > 1 ? 's' : ''} sur ${b.championnats}` : null,
    Array.isArray(b.nonCalcules) ? `${b.nonCalcules.length} non calculé${b.nonCalcules.length > 1 ? 's' : ''}` : null,
    fini(b.enjeux) ? `${entier(b.enjeux)} enjeux` : null,
    secondes(b.dureeMs) ? `${secondes(b.dureeMs)} à part${mo(b.aPart?.rssMaxOctets) ? ` (${mo(b.aPart.rssMaxOctets)})` : ''}` : null
  ].filter(Boolean);
  return {
    titre: `Fins de saison : ${nuitDite(nuit.calculeLe)}`,
    texte: morceaux.length ? `${morceaux.join(' ; ')}.` : 'Bilan non dit.',
    refus: (Array.isArray(b.nonCalcules) ? b.nonCalcules : []).map((x) => ({ league: x.league, raison: majuscule(x.raison ?? 'raison non dite') })),
    // En mots simples ; l'empreinte technique des forces seulement au survol (`loiDetail`).
    loi: b.forces?.empreinte
      ? `Forces de buts employées : celles du modèle de buts ${b.forces.origine === 'service' ? 'en service' : 'en essai (étape 27)'}`
      : 'Forces de buts : aucune cette nuit — loi « classement seul » partout',
    loiDetail: b.forces?.empreinte ? `Empreinte des forces de buts : ${b.forces.empreinte}` : null
  };
}

/** La dernière nuit des déroulés, en mots : quand, combien de rencontres, les analyses, les chemins à part (durée, mémoire), le contrôle. */
export function nuitDesMatchsDite(nuit, controle = null) {
  if (!nuit?.calculeLe) return { titre: 'Déroulés des matchs : pas encore calculés', texte: 'La première passe de nuit après la mise en service les calculera (rencontres des 48 prochaines heures).', controle: null };
  const b = nuit.bilan ?? {};
  const morceaux = [
    fini(b.dansLaFenetre) ? `${b.dansLaFenetre} rencontre${b.dansLaFenetre > 1 ? 's' : ''} dans les 48 h` : null,
    fini(b.lignes) ? `${b.lignes} ligne${b.lignes > 1 ? 's' : ''} rangée${b.lignes > 1 ? 's' : ''} : ${b.tirees ?? 0} déroulé${(b.tirees ?? 0) > 1 ? 's' : ''} simulé${(b.tirees ?? 0) > 1 ? 's' : ''}, ${b.entreesSeules ?? 0} sans tirage (ancien modèle : ses chiffres d’entrée seulement)` : null,
    b.sansIdentifiant ? `${b.sansIdentifiant} sans identifiant FotMob, jamais écrite${b.sansIdentifiant > 1 ? 's' : ''}` : null,
    secondes(b.analysesMs) ? `analyses ${secondes(b.analysesMs)}` : null,
    secondes(b.aPartMs) ? `simulation ${secondes(b.aPartMs)} à part${mo(b.aPart?.rssMaxOctets) ? ` (${mo(b.aPart.rssMaxOctets)})` : ''}` : null
  ].filter(Boolean);
  const c = controle;
  const ecarts = (n) => `${n} écart${n > 1 ? 's' : ''}`;
  return {
    titre: `Déroulés des matchs : ${nuitDite(nuit.calculeLe)}`,
    texte: morceaux.length ? `${morceaux.join(' ; ')}.` : 'Bilan non dit.',
    controle: c ? `Contrôle de la nuit : ${c.tables?.lignes ?? 0} rencontres refaites avec la graine du jour, ${ecarts(c.tables?.ecarts?.length ?? 0)} ; ${c.lignes ?? 0} lignes relues, ${ecarts(c.total ?? 0)}${c.marquees ? `, ${c.marquees} calculée${c.marquees > 1 ? 's' : ''} après le coup d’envoi (écartées du jugement)` : ''}.` : null
  };
}

/**
 * L'avancement de la preuve sur les matchs de Pierre : « 312 matchs sur 800, 9 jours sur 21 » ; les jours plafonnés à
 * l'horizon (« 21 jours sur 21 (atteints) », jamais « 34 jours sur 21 » : vérification du 27/10, constat 26) ; une fois
 * le jugement qui décide pris, la nuit ne compte plus que les 60 derniers jours (constat 16) : elle le dit.
 */
export function avancementDit(jugement, horizon = { matchs: 800, jours: 21 }) {
  const h = jugement?.horizon ?? horizon ?? { matchs: 800, jours: 21 };
  if (!jugement || jugement.calcule === false) return `0 match sur ${h.matchs}, 0 jour sur ${h.jours} — ${jugement?.raison ?? 'la preuve commence la nuit de la livraison'}`;
  const m = fini(jugement.matchs) ? jugement.matchs : 0;
  const j = fini(jugement.joursEcoules) ? jugement.joursEcoules : 0;
  if (fini(jugement.rapportJours)) return `jugement pris à l’horizon ; chiffres des ${jugement.rapportJours} derniers jours : ${entier(m)} match${m > 1 ? 's' : ''} comparé${m > 1 ? 's' : ''}`;
  return `${entier(m)} match${m > 1 ? 's' : ''} sur ${h.matchs}, ${j >= h.jours ? `${h.jours} jours sur ${h.jours} (atteints)` : `${j} jour${j > 1 ? 's' : ''} sur ${h.jours}`}`;
}

/** Les choix des deux interrupteurs (AppSelect), en mots. */
export const CHOIX_DES_INTERRUPTEURS = Object.freeze({
  saisons: Object.freeze([
    Object.freeze({ value: 'eteint', label: 'Éteint : calculé à blanc, pas montré' }),
    Object.freeze({ value: 'allume', label: 'Allumé : fins de saison et enjeu montrés' })
  ]),
  matchs: Object.freeze([
    Object.freeze({ value: 'eteint', label: 'Éteint : calculé à blanc, pas montré' }),
    Object.freeze({ value: 'combines', label: 'Prix juste des combinés' }),
    Object.freeze({ value: 'tout', label: 'Prix juste et déroulé simulé' })
  ])
});

/**
 * Les deux interrupteurs tels que Réglages les montre (GET /api/simulation/etat) : la valeur RANGÉE (le clic), la valeur
 * EFFECTIVE (relue avec ses conditions : comme éteint, et pourquoi, quand elles ne tiennent plus), ce qui manque aux
 * combinés, et la GARDE DE SÛRETÉ dite comme une information (les marchés qu'elle a éteints, chacun SEUL, nommés par
 * leurs libellés : vérification du 27/10, constats 7 et 12). Rend { saisons: { range, effectif }, matchs: { range,
 * effectif, pourquoi }, manques, possible, garde }.
 */
export function interrupteursDits(etat) {
  const a = etat?.affichage ?? {};
  const e = etat?.effectif ?? {};
  const garde = etat?.conditions?.information ?? null;
  return {
    saisons: { range: a.saisons ?? 'eteint', effectif: e.saisons ?? a.saisons ?? 'eteint' },
    matchs: { range: a.matchs ?? 'eteint', effectif: e.matchs ?? a.matchs ?? 'eteint', pourquoi: e.pourquoi?.matchs ?? null },
    manques: (etat?.conditions?.manques ?? []).map(majuscule),
    possible: Boolean(etat?.conditions?.possible),
    garde: typeof garde === 'string' && garde ? `${majuscule(garde)}.` : null
  };
}

/**
 * L'alerte durable des fins de saison (refresh-status.json → alerts.simulationSaisons, posée par la passe de nuit) :
 * les championnats qu'un nom du calendrier inconnu empêche de simuler, en UNE phrase pour Réglages › Actualisation
 * (vérification du 27/10, constat 14) ; le détail (les noms) est dans Réglages › Versions du moteur. null sans alerte.
 */
export function nomsInconnusDits(alerts) {
  const liste = Array.isArray(alerts?.simulationSaisons?.inconnus) ? alerts.simulationSaisons.inconnus.filter((x) => x?.league) : [];
  if (!liste.length) return null;
  const n = liste.length;
  const ligues = liste.slice(0, 3).map((x) => x.league).join(', ') + (n > 3 ? '…' : '');
  return `Fins de saison : ${n} championnat${n > 1 ? 's' : ''} bloqué${n > 1 ? 's' : ''} par un nom du calendrier inconnu (${ligues}) — le détail est dans Réglages › Versions du moteur.`;
}

/** Un nombre signé (vrai signe moins), une décimale, deux sous 1 (les effets du score se jouent au centième de millième). */
const decimales = (...xs) => (xs.some((x) => fini(x) && Math.abs(x) < 1) ? 2 : 1);
const nombreSigne = (x, d) => (fini(x) ? `${x < 0 ? '−' : ''}${virgule(Math.abs(x), d)}` : '?');
const millieme = (x, f = []) => nombreSigne(x, decimales(x, ...f));
const fourchette = (f, x) => (Array.isArray(f) && f.length === 2 ? `[${nombreSigne(f[0], decimales(x, ...f))} ; ${nombreSigne(f[1], decimales(x, ...f))}]` : '');
const VERDICTS = { retenu: 'retenu', 'pas-prouve': 'pas prouvé', 'moins-bon': 'moins bon' };

/**
 * LA PORTE 1 de la simulation (GET /api/simulation/etat → porte1), en mots simples pour Réglages : réussie ou non, la
 * date, les combinés meilleurs que le produit des simples, les effets du score, les marchés écartés et pourquoi, la règle
 * qui les garde éteints. Rend { titre, date, lignes: [phrases], ecartes: [phrases], regle } ou null.
 */
export function porte1Dite(porte1) {
  if (!porte1) return null;
  const reussie = porte1.porte === 'ouverte';
  const n = fini(porte1.matchs) ? entier(porte1.matchs) : 'des';
  const c = porte1.combines ?? {};
  const f = porte1.effets ?? {};
  const lignes = [
    `Sur ${n} matchs jamais vus (football-data, juillet 2019 à juin 2023), un seul passage, règles écrites avant de regarder.`,
    c.verdict === 'retenu'
      ? `Combinés : sur les ${c.nombre ?? 14} combinés essayés, la grille du moteur a mieux prévu que le produit des simples — ${millieme(c.gainMillieme, c.fourchette)} millièmes d’erreur de prévision en moins ${fourchette(c.fourchette, c.gainMillieme)}, au-delà du hasard (retenu, ${c.variantes ?? '?'} variantes comptées).`
      : `Combinés : la grille du moteur contre le produit des simples : ${VERDICTS[c.verdict] ?? c.verdict ?? 'non dit'}.`,
    c.eteints?.length
      ? `Combinés écartés : ${c.eteints.join(', ')}.`
      : `Aucun combiné écarté : chacun reste à ${virgule(c.netMaxPoints ?? 0)} point au plus de ce qui est arrivé, une fois retiré le biais de ses sélections (règle : ${virgule(c.seuilPoints ?? 1.5)} point).`,
    `Effets du score (l’équipe menée, l’équipe à dix…) : ${VERDICTS[f.verdict] ?? f.verdict ?? 'non dit'}${f.moinsBon === false ? ', pas moins bons que sans eux' : ''} — ${millieme(f.gainMillieme, f.fourchette)} millième ${fourchette(f.fourchette, f.gainMillieme)}. Comptés, ils ne se prouveront pas sur 800 matchs : c’est l’issue attendue.`
  ];
  const ecartes = (porte1.ecartes ?? []).map((m) => {
    const pourquoi = fini(m.netExact) && Math.abs(m.netExact) > (porte1.seuilMarche ?? 1)
      ? m.netExact < 0
        ? `même à score final connu, il annonçait ${virgule(Math.abs(m.netExact))} point de trop peu (règle : ${virgule(porte1.seuilMarche ?? 1)} point)`
        : `il annonçait ${virgule(Math.abs(m.netExact))} points de trop (règle : ${virgule(porte1.seuilMarche ?? 1)} point)`
      : 'au-delà de la règle';
    return `« ${m.libelle} » : annoncé ${virgule(m.annonce)} %, arrivé ${virgule(m.realise)} % — ${pourquoi}.`;
  });
  return {
    titre: reussie ? 'Porte 1 réussie' : 'Porte 1 fermée',
    reussie,
    date: jourAnnee(porte1.le) ? `le ${jourAnnee(porte1.le)}` : null,
    lignes,
    ecartesTitre: ecartes.length ? `${ecartes.length === 1 ? 'Un marché écarté' : `${ecartes.length === 2 ? 'Deux' : ecartes.length} marchés écartés`}, jamais montrés sur un match ni dans un combiné :` : null,
    ecartes,
    regle: porte1.regle ?? null
  };
}

/** Les marchés écartés, tels que la preuve sur vos matchs les RAPPORTE (le jugement provisoire de la nuit) — jamais montrés sur un match. */
export function ecartesSurVosMatchs(porte1, jugement) {
  const parMarche = new Map((jugement?.parMarche ?? []).map((m) => [m.marche, m]));
  return (porte1?.ecartes ?? []).map((m) => {
    const x = parMarche.get(m.cle);
    if (!x || !(x.n > 0) || !fini(x.annonce) || !fini(x.realise)) return `« ${m.libelle} » sur vos matchs : pas encore de match jugé.`;
    return `« ${m.libelle} » sur vos matchs : annoncé ${virgule(x.annonce)} %, arrivé ${virgule(x.realise)} % (${entier(x.n)} match${x.n > 1 ? 's' : ''}) — rapporté, jamais montré.`;
  });
}
