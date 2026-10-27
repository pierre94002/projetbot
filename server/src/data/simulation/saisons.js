/**
 * saisons.js — LES FINS DE SAISON ET L'ENJEU DE CHAQUE RENCONTRE (étape 28 du plan, conception §2).
 * -----------------------------------------------------------------------
 * PUR : ni base, ni fichier, ni horloge, ni hasard non amorcé. L'enfant de nuit lit la base (en lecture seule) et le
 * calendrier, puis appelle ces fonctions :
 *   1. tablesDeLaPhase      : les tables officielles de la PHASE EN COURS (dernier relevé seulement, doublons écartés) ;
 *   2. famillesDeLaTable    : les familles de zones portées par les rangs (1re place, Europe, promotion, barrage,
 *                             phase finale, barrage de descente, descente) ;
 *   3. rattacherLesNoms     : les noms du calendrier → identifiants FotMob (table, puis annuaire restreint aux clubs
 *                             de la table ; jamais de rapprochement souple) ;
 *   4. restants             : les rencontres restantes, JAMAIS inventées (construites pour un aller-retour simple,
 *                             lues au calendrier sinon, avec une règle de complétude) ;
 *   5. loiTable / loiForces : la loi de chaque rencontre (V1 « table », V2 « forces » du modèle de buts) ;
 *   6. simulerSaison        : N fins de phase tirées dans la grille Dixon-Coles de goalModel.js ; par club, la
 *                             probabilité de chaque famille et de chaque rang ; pour chaque rencontre à enjeu, de
 *                             combien de points une famille change entre victoire et défaite.
 * Points : `points` de la table officielle TEL QUEL (net des pénalités), jamais recalculé. Départage : points,
 * différence de buts, buts marqués, puis tirage uniforme. Identifiants : le numéro FotMob, jamais un nom.
 * -----------------------------------------------------------------------
 */

import { grilleDesButs, forcesDe, moyennesAvant, attenuerLeTotal } from '../../core/engine/goalModel.js';
import { teamNamesEqual } from '../../utils/teamNameMatch.js';
import { generateur, EntreeInvalide } from './simulationMatch.js';
import { FAMILLES, TABLES_EN_DOUBLON, ORPHELINE_MS, PETIT_GROUPE, RHO_SAISONS, BORNES_BUTS, LOI_TABLE, DEMARRAGE_SAISONS, SEUILS_ENJEU, ARRONDI_ENJEU, TAILLE_GRILLE, N } from './reglages.js';

const T = TAILLE_GRILLE;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const nombre = (x) => (fini(x) ? x : fini(Number(x)) && x !== null && x !== '' ? Number(x) : null);

// ------------------------------------------------------------ identifiants

/** LE numéro FotMob d'un club, en texte : 'fotmob-8456', 8456 et '8456' → '8456' ; null pour tout autre chose (un nom). */
export function idFotMob(x) {
  if (typeof x === 'number') return Number.isInteger(x) && x > 0 ? String(x) : null;
  if (typeof x !== 'string') return null;
  const m = /^(?:fotmob-)?(\d+)$/.exec(x.trim());
  return m && Number(m[1]) > 0 ? String(Number(m[1])) : null;
}

// ------------------------------------------------------------ 1. la phase en cours

/** Le mot de phase d'une table (conception §2.1, P §1 mot pour mot) : apertura, clausura, conf (conférences, zones) ou saison. */
export function motDePhase(nom) {
  const m = /Apertura|Clausura/i.exec(String(nom ?? ''));
  if (m) return m[0].toLowerCase();
  return /Eastern|Western|Group [AB]$/i.test(String(nom ?? '')) ? 'conf' : 'saison';
}

/**
 * Les tables de la PHASE EN COURS d'une (league, saison). `toutes` : [{ table_name | name, ord, fetched_at |
 * fetchedAt, rows }]. Règles, dans l'ordre :
 *   - dernier relevé seulement : une table relevée plus d'une heure avant la plus récente est ORPHELINE (FotMob l'a
 *     renommée : « Super Lig » du 14/10 contre « Süper Lig » du 18/10 en Turquie) ;
 *   - les tables en doublon (shield, annual, overall, aggregate) sont écartées ;
 *   - la table de plus petit `ord` nomme la phase ; on garde les tables de la même phase ;
 *   - les petits groupes (moins de 8 clubs) ne restent que s'il n'y a aucune grande table.
 * Rend { tables: [{ name, ord, fetchedAt, rows }], phase, ecartees: [{ name, raison }] }.
 */
export function tablesDeLaPhase(toutes) {
  const liste = (toutes ?? []).map((t) => ({
    name: t.name ?? t.table_name,
    ord: nombre(t.ord) ?? 0,
    fetchedAt: t.fetchedAt ?? t.fetched_at ?? null,
    rows: Array.isArray(t.rows) ? t.rows : typeof t.rows === 'string' ? JSON.parse(t.rows) : []
  }));
  const ecartees = [];
  let restantes = liste;
  const instants = liste.map((t) => Date.parse(t.fetchedAt ?? ''));
  if (instants.length && instants.every(Number.isFinite)) {
    const recent = Math.max(...instants);
    restantes = liste.filter((t, i) => {
      const orpheline = recent - instants[i] > ORPHELINE_MS;
      if (orpheline) ecartees.push({ name: t.name, raison: 'orpheline (relevée plus d’une heure avant la plus récente)' });
      return !orpheline;
    });
  }
  restantes = restantes.filter((t) => {
    const doublon = TABLES_EN_DOUBLON.test(t.name ?? '');
    if (doublon) ecartees.push({ name: t.name, raison: 'doublon' });
    return !doublon;
  });
  restantes.sort((a, b) => a.ord - b.ord || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (!restantes.length) return { tables: [], phase: null, ecartees };
  const phase = motDePhase(restantes[0].name);
  let tables = restantes.filter((t) => {
    const meme = motDePhase(t.name) === phase;
    if (!meme) ecartees.push({ name: t.name, raison: 'autre phase' });
    return meme;
  });
  if (tables.some((t) => t.rows.length >= PETIT_GROUPE)) {
    tables = tables.filter((t) => {
      const petit = t.rows.length < PETIT_GROUPE;
      if (petit) ecartees.push({ name: t.name, raison: 'petit groupe' });
      return !petit;
    });
  }
  return { tables, phase, ecartees };
}

// ------------------------------------------------------------ 2. les familles de zones

/** Les familles d'un libellé de zone (hors 1re place) : [] pour un libellé vide ou inconnu. */
export function famillesDuLibelle(description) {
  const d = typeof description === 'string' ? description.trim() : '';
  if (!d) return [];
  return FAMILLES.filter((f) => f.motif && f.motif.test(d)).map((f) => f.cle);
}

/** Les familles portées par une table : { [famille]: [rangs triés] } ; la 1re place = le rang 1, toujours. */
export function famillesDeLaTable(table) {
  const rangs = {};
  for (const r of table?.rows ?? []) {
    const rang = nombre(r.rank);
    if (rang === null) continue;
    if (rang === 1) (rangs.premiere ??= new Set()).add(1);
    for (const f of famillesDuLibelle(r.description)) (rangs[f] ??= new Set()).add(rang);
  }
  const sortie = {};
  for (const f of FAMILLES) if (rangs[f.cle]) sortie[f.cle] = [...rangs[f.cle]].sort((a, b) => a - b);
  return sortie;
}

/** La pénalité affichée d'un club (« −8 pts ») : |deduction|, le signe du champ ne porte rien ; les points restent `points`. */
export const penaliteDe = (row) => (fini(nombre(row?.deduction)) && nombre(row.deduction) !== 0 ? Math.abs(nombre(row.deduction)) : 0);

// ------------------------------------------------------------ 3. les noms du calendrier

/**
 * Les noms du calendrier rattachés aux clubs de la table. `rows` : les lignes des tables de la phase ({ teamId,
 * teamName, shortName }) ; `calendrier` : les entrées ({ homeName, awayName }) ou des noms ; `annuaire` : les noms
 * connus de chaque club ({ [teamId]: [noms] } ou Map, depuis teams + team_aliases), restreint ici aux clubs de la
 * table ; `aliasEnPlus` : le même format, pour une table locale de secours. Méthode : teamNamesEqual sur le nom et le
 * nom court de la table ; sinon l'annuaire ; un seul candidat, sinon « inconnu » ou « ambigu ». Jamais de
 * rapprochement souple. Rend { parNom: Map(nom → teamId), inconnus, ambigus, parTable, parAnnuaire }.
 */
export function rattacherLesNoms({ rows, calendrier, annuaire = null, aliasEnPlus = null }) {
  const clubs = new Map();
  for (const r of rows ?? []) if (r?.teamId && !clubs.has(r.teamId)) clubs.set(r.teamId, r);
  const ids = [...clubs.keys()];
  const nomsDe = (source, id) => (source instanceof Map ? source.get(id) : source?.[id]) ?? [];
  const noms = new Set();
  for (const e of calendrier ?? []) {
    if (typeof e === 'string') noms.add(e);
    else {
      if (e?.homeName) noms.add(e.homeName);
      if (e?.awayName) noms.add(e.awayName);
    }
  }
  const parNom = new Map();
  const inconnus = [];
  const ambigus = [];
  let parTable = 0;
  let parAnnuaire = 0;
  for (const nom of [...noms].sort()) {
    let c = ids.filter((id) => teamNamesEqual(nom, clubs.get(id).teamName) || (clubs.get(id).shortName && teamNamesEqual(nom, clubs.get(id).shortName)));
    if (c.length === 1) {
      parNom.set(nom, c[0]);
      parTable++;
      continue;
    }
    const parLaTable = c.length;
    c = ids.filter((id) => [...nomsDe(annuaire, id), ...nomsDe(aliasEnPlus, id)].some((a) => teamNamesEqual(nom, a)));
    if (c.length === 1) {
      parNom.set(nom, c[0]);
      parAnnuaire++;
    } else if (c.length > 1 || parLaTable > 1) ambigus.push(nom);
    else inconnus.push(nom);
  }
  return { parNom, inconnus, ambigus, parTable, parAnnuaire };
}

// ------------------------------------------------------------ 4. les rencontres restantes

/**
 * Le format de la phase, lu dans la table régulière de la saison PRÉCÉDENTE (même nom, sinon la plus grande) :
 * J = journées jouées par club, n = clubs, k = J / (n − 1) (2 pour un aller-retour simple). null sans table.
 */
export function formatDeLaSaisonPrecedente(tablesPrecedentes, nomDeLaTable) {
  const liste = (tablesPrecedentes ?? []).map((t) => ({ name: t.name ?? t.table_name, rows: Array.isArray(t.rows) ? t.rows : JSON.parse(t.rows ?? '[]') })).filter((t) => t.rows.length > 1);
  if (!liste.length) return null;
  const t = liste.find((x) => x.name === nomDeLaTable) ?? [...liste].sort((a, b) => b.rows.length - a.rows.length)[0];
  const J = Math.max(...t.rows.map((r) => nombre(r.played) ?? 0));
  const n = t.rows.length;
  const k = J / (n - 1);
  return { table: t.name, J, n, k, kEntier: Math.abs(k - Math.round(k)) < 1e-9 ? Math.round(k) : null };
}

/**
 * LES RENCONTRES RESTANTES de la phase (conception §2.2). `table` : { clubs: [{ id, played }], tables: nombre de
 * tables de la phase, journees: J de la même phase l'an passé (null si aucun précédent) } ; `joues` : les paires
 * ordonnées « dom|ext » déjà jouées cette saison au magasin (identifiants FotMob, date < D) ; `calendrier` : les
 * entrées NON jouées de la saison, noms déjà rattachés ({ homeId, awayId, date, status }) ; `k` : du format de
 * l'an passé ; `jourD` : le jour civil de Paris de la passe (AAAA-MM-JJ).
 *   - aller-retour simple (k = 2, table unique) : restants = toutes les paires ordonnées moins celles jouées ; le
 *     calendrier ne sert qu'à DATER (entrée déjà jouée ou étrangère écartée, doublon gardé une fois, entrée périmée
 *     ou reportée « à dater », paire absente ajoutée « à dater ») ; complet si chaque club a 2(n − 1) rencontres en
 *     tout (jouées + restantes) ;
 *   - autres formats : les entrées du calendrier, au plus ⌈k/2⌉ par paire ordonnée ; complet si chaque club a
 *     exactement J − joués rencontres ; sinon « non calculé » et la raison en mots.
 * LES REPORTS (vérification du 27/10, constat 1) : quand FotMob reporte une rencontre, le calendrier GARDE l'entrée
 * « postponed » (l'ancienne date) ET ajoute une entrée « scheduled » à la nouvelle date (deux matchId) — Sheffield
 * Wednesday – Stevenage, 26/09 « postponed » puis 13/04/2027. Trois règles, toutes ici :
 *   (a) les entrées DATÉES (jour D ou après, pas « postponed ») passent en premier, l'ordre entre elles inchangé (tri
 *       stable) : en aller-retour simple, la paire garde sa NOUVELLE date (l'entrée reportée devient un doublon) ;
 *   (b) une entrée PASSÉE restée « scheduled » d'une paire déjà jouée au magasin est le fantôme d'une rencontre jouée :
 *       écartée (`perimesJoues`). En mode calendrier, les paires jouées sont des paires ORDONNÉES : pour k = 4, un second
 *       match aller resté « scheduled » dans le passé alors que le premier est au magasin est écarté aussi — le
 *       championnat tombe alors en « calendrier incomplet » (une raison vraie) au lieu de « rencontres en trop » (une
 *       raison fausse) ;
 *   (c) en mode calendrier, des rencontres EN TROP : le compte est refait UNE fois sans les entrées « postponed » dont la
 *       paire a une entrée datée (`remplacees`), et ce second compte n'est gardé que s'il tombe exactement juste.
 * Rend { liste: [{ h, a, date | null }], complet, mode, raison, comptes }.
 */
export function restants({ table, joues, calendrier, k, jourD }) {
  if (typeof jourD !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(jourD)) throw new EntreeInvalide('restants : jourD (AAAA-MM-JJ) obligatoire.');
  const clubs = (table?.clubs ?? []).map((c) => ({ id: String(c.id), played: nombre(c.played) ?? 0 }));
  const ids = clubs.map((c) => c.id);
  const S = new Set(ids);
  const n = ids.length;
  const dejaJouees = new Set([...(joues ?? [])].map(String));
  const kEntier = fini(k) && Math.abs(k - Math.round(k)) < 1e-9 ? Math.round(k) : null;
  const construction = kEntier === 2 && (table?.tables ?? 1) === 1;
  const parPaire = construction ? 1 : kEntier ? Math.ceil(kEntier / 2) : 1;
  const attendu = (c) => (construction ? 2 * (n - 1) - c.played : fini(table?.journees) ? table.journees - c.played : null);
  const attendus = clubs.every((c) => attendu(c) !== null) ? clubs.reduce((s, c) => s + attendu(c), 0) / 2 : null;
  const paireDe = (e) => {
    const h = idFotMob(e.homeId) ?? String(e.homeId ?? '');
    const a = idFotMob(e.awayId) ?? String(e.awayId ?? '');
    return { h, a, cle: `${h}|${a}` };
  };
  // (a) Les entrées datées d'abord (Array.prototype.sort est stable : l'ordre entre elles ne change pas).
  const estDatee = (e) => typeof e?.date === 'string' && e.date >= jourD && e.status !== 'postponed';
  const entrees = [...(calendrier ?? [])].sort((x, y) => Number(estDatee(y)) - Number(estDatee(x)));
  const compter = (lesEntrees) => {
    const comptes = { calendrier: 0, etrangers: 0, dejaJoues: 0, perimesJoues: 0, doublons: 0, perimes: 0, construits: 0, aDater: 0, remplacees: 0, attendus };
    const vus = new Map();
    const liste = [];
    for (const e of lesEntrees) {
      comptes.calendrier++;
      const { h, a, cle } = paireDe(e);
      if (!S.has(h) || !S.has(a) || h === a) {
        comptes.etrangers++;
        continue;
      }
      // (b) Le fantôme d'une rencontre jouée : passée, restée « scheduled », sa paire au magasin.
      if (e.status !== 'postponed' && typeof e.date === 'string' && e.date < jourD && dejaJouees.has(cle)) {
        comptes.perimesJoues++;
        continue;
      }
      if (construction && dejaJouees.has(cle)) {
        comptes.dejaJoues++;
        continue;
      }
      const deja = vus.get(cle) ?? 0;
      if (deja >= parPaire) {
        comptes.doublons++;
        continue;
      }
      vus.set(cle, deja + 1);
      const datee = estDatee(e);
      if (!datee) {
        comptes.aDater++;
        if (typeof e.date === 'string' && e.date < jourD) comptes.perimes++;
      }
      liste.push({ h, a, date: datee ? e.date : null });
    }
    if (construction) {
      for (const x of ids) {
        for (const y of ids) {
          if (x === y) continue;
          const cle = `${x}|${y}`;
          if (!dejaJouees.has(cle) && !vus.has(cle)) {
            vus.set(cle, 1);
            liste.push({ h: x, a: y, date: null });
            comptes.construits++;
            comptes.aDater++;
          }
        }
      }
    }
    const parClub = new Map(ids.map((id) => [id, 0]));
    for (const m of liste) {
      parClub.set(m.h, parClub.get(m.h) + 1);
      parClub.set(m.a, parClub.get(m.a) + 1);
    }
    return { liste, comptes, fautifs: clubs.filter((c) => attendu(c) === null || parClub.get(c.id) !== attendu(c)) };
  };
  let r = compter(entrees);
  // (c) Mode calendrier, rencontres en trop : une rencontre reportée PUIS re-datée compte deux fois (l'entrée
  // « postponed » et sa nouvelle date) — le compte refait une fois sans elle, gardé seulement s'il tombe juste.
  if (r.fautifs.length && !construction && attendus !== null && r.liste.length > attendus) {
    const datees = new Set(entrees.filter(estDatee).map((e) => paireDe(e).cle));
    const remplacees = new Set(entrees.filter((e) => e?.status === 'postponed' && datees.has(paireDe(e).cle)));
    if (remplacees.size) {
      const second = compter(entrees.filter((e) => !remplacees.has(e)));
      if (!second.fautifs.length) {
        second.comptes.calendrier += remplacees.size;
        second.comptes.remplacees = remplacees.size;
        r = second;
      }
    }
  }
  const { liste, comptes, fautifs } = r;
  const mode = construction ? 'construction' : 'calendrier';
  let raison = null;
  let complet = fautifs.length === 0;
  if (!complet) {
    // Trois cas que les mots distinguent (mesure de la nuit du 19/10 dans le bac : « 61 sur 61 » disait « incomplet ») :
    // des rencontres EN TROP au calendrier, le bon total mais pas pour les bons clubs, ou un calendrier INCOMPLET.
    if (comptes.attendus === null) raison = 'phase sans précédent : rencontres restantes inconnues, non calculé';
    else if (construction) raison = `table et rencontres jouées en désaccord (${fautifs.map((c) => c.id).join(', ')}) : non calculé`;
    else if (liste.length > comptes.attendus) raison = `rencontres en trop au calendrier : ${liste.length} connues pour ${comptes.attendus} attendues, non calculé`;
    else if (liste.length === comptes.attendus) raison = `clubs différents de la table : ${liste.length} rencontres connues pour ${comptes.attendus} attendues, mais ${fautifs.length} ${fautifs.length > 1 ? 'clubs n’ont pas leur' : 'club n’a pas son'} compte, non calculé`;
    else raison = `calendrier incomplet : ${liste.length} rencontres connues sur ${comptes.attendus} attendues, non calculé`;
  } else if (liste.length === 0) {
    raison = 'saison terminée';
  }
  if (!complet) liste.length = 0;
  return { liste, complet, mode, raison, comptes };
}

/**
 * La raison d'un refus de la GARDE ANTI-FUITE (joués à la table ≠ joués au magasin avant D), en mots vrais.
 * `desaccords` : [{ nom, table, magasin }] ; `clubs` : le nombre de clubs de la table ; `journees` : les matchs de la
 * phase régulière d'un club, lus dans la table de la saison précédente (J de formatDeLaSaisonPrecedente ; null sans
 * précédent). Quand TOUS les clubs ont joué exactement leur phase régulière à la table et que le magasin en compte PLUS
 * pour chacun, ce sont les POULES DE FIN DE SAISON (Finlande, Islande, Équateur au 19/10) : la table relevée est celle de
 * la phase régulière, les poules ne sont pas simulées en v1. Sinon : « table et magasin en désaccord », clubs nommés.
 */
export function raisonDuDesaccord(desaccords, { clubs = 0, journees = null } = {}) {
  const liste = desaccords ?? [];
  const poules = liste.length > 1 && liste.length === clubs && fini(journees) && journees > 0 && liste.every((d) => d.table === journees && d.magasin > d.table);
  if (poules) {
    const max = Math.max(...liste.map((d) => d.magasin));
    return `poules de fin de saison : la table relevée est celle de la phase régulière (${journees} matchs par club), le magasin compte déjà jusqu’à ${max} matchs ; les poules de fin de saison ne sont pas simulées — non calculé`;
  }
  const noms = liste.slice(0, 3).map((d) => `${d.nom} (table ${d.table}, magasin ${d.magasin})`);
  return `table et magasin en désaccord : ${noms.join(', ')}${liste.length > 3 ? ` et ${liste.length - 3} autre(s)` : ''} — non calculé`;
}

// ------------------------------------------------------------ 5. la loi de chaque rencontre

const borner = (x) => Math.min(BORNES_BUTS[1], Math.max(BORNES_BUTS[0], x));

/**
 * V1 « TABLE » : moyennes domicile/extérieur du championnat (rappelées vers 1,45 / 1,15 sur 30 rencontres) × attaque ×
 * défense lues dans la table (buts pour/contre par match, rappelés vers la moyenne sur 8 matchs). Aucune dépendance au
 * moteur. `rows` : les lignes des tables de la phase. Rend une fonction (domId, extId) → { lambda, mu }.
 */
export function loiTable(rows) {
  const clubs = new Map();
  for (const r of rows ?? []) if (r?.teamId && !clubs.has(idFotMob(r.teamId) ?? r.teamId)) clubs.set(idFotMob(r.teamId) ?? r.teamId, r);
  const { priorMatchs: P, domicile: DH, exterieur: DA, rappel: K0 } = LOI_TABLE;
  let shg = 0;
  let sag = 0;
  let shp = 0;
  let sap = 0;
  for (const r of clubs.values()) {
    shg += nombre(r.home?.goalsFor) ?? 0;
    shp += nombre(r.home?.played) ?? 0;
    sag += nombre(r.away?.goalsFor) ?? 0;
    sap += nombre(r.away?.played) ?? 0;
  }
  const mH = (shg + P * DH) / (shp + P);
  const mA = (sag + P * DA) / (sap + P);
  const g = (shg + sag + P * (DH + DA)) / (shp + sap + 2 * P);
  const att = new Map();
  const def = new Map();
  for (const [id, r] of clubs) {
    const j = nombre(r.played) ?? 0;
    att.set(id, ((nombre(r.goalsFor) ?? 0) + K0 * g) / (j + K0) / g);
    def.set(id, ((nombre(r.goalsAgainst) ?? 0) + K0 * g) / (j + K0) / g);
  }
  return (h, a) => {
    const ah = att.get(String(h)) ?? 1;
    const dh = def.get(String(h)) ?? 1;
    const aa = att.get(String(a)) ?? 1;
    const da = def.get(String(a)) ?? 1;
    return { lambda: borner(mH * ah * da), mu: borner(mA * aa * dh) };
  };
}

/**
 * V2 « FORCES » : λ = moyenne de ligue × attaque(dom.) × défense(ext.) par forcesDe, moyennesAvant et attenuerLeTotal
 * de goalModel.js (le régime « sans cote » du modèle de buts), bornes [0,2 ; 6], démarrage à froid sur 8 matchs.
 * `forces` : { [clubId]: état de la dernière ligne forces_buts d'AVANT le jour D } (Map acceptée ; un club sans ligne :
 * forces 1 et 1) ; `ligue` : moyennesAvant(...) déjà calculées, ou `joursLigue` + `jourD` + `saison` ; `reglages` :
 * { prior, statistique, poidsXg } de la candidate. Rend une fonction (domId, extId) → { lambda, mu }.
 */
export function loiForces({ forces, ligue = null, joursLigue = null, jourD = null, saison = null, reglages }) {
  if (!reglages || !fini(reglages.prior)) throw new EntreeInvalide('loiForces : réglages du modèle de buts absents.');
  const moyennes = ligue ?? moyennesAvant(joursLigue ?? [], { jour: jourD, saison });
  const etat = (id) => (forces instanceof Map ? forces.get(String(id)) : forces?.[String(id)]) ?? null;
  const memo = new Map();
  const forceDe = (id) => {
    if (!memo.has(String(id))) memo.set(String(id), forcesDe(etat(id), reglages));
    return memo.get(String(id));
  };
  return (h, a) => {
    const fH = forceDe(h);
    const fA = forceDe(a);
    const brutes = { lambda: moyennes.buts.home * fH.attaque * fA.defense, mu: moyennes.buts.away * fA.attaque * fH.defense };
    const x = attenuerLeTotal(brutes, moyennes, Math.min(fH.matchs, fA.matchs), DEMARRAGE_SAISONS);
    return { lambda: borner(x.lambda), mu: borner(x.mu) };
  };
}

// ------------------------------------------------------------ 6. la simulation

/** Un enjeu tel que Pierre le VOIT : arrondi à 5 points (la règle de l'écran, simulationRead.arrondiEnjeu). */
const arrondiAffiche = (x) => Math.round(x / ARRONDI_ENJEU) * ARRONDI_ENJEU;

/**
 * La catégorie d'une rencontre, décidée sur l'enjeu ARRONDI que l'écran montre (vérification du 27/10, constat 3) :
 * « gros-enjeu » si un camp montre 20 pt ou plus (17,5 brut), « sans-enjeu » si les deux montrent moins de 2 pt (donc
 * « 0 pt », moins de 2,5 brut), « enjeu » sinon — deux rencontres « 20 pt » portent toujours la même pastille.
 */
export function categorieDeLEnjeu(enjeuDom, enjeuExt) {
  if (!fini(enjeuDom) || !fini(enjeuExt)) return 'non-calcule';
  const dom = arrondiAffiche(enjeuDom);
  const ext = arrondiAffiche(enjeuExt);
  if (Math.max(dom, ext) >= SEUILS_ENJEU.gros) return 'gros-enjeu';
  if (dom < SEUILS_ENJEU.sans && ext < SEUILS_ENJEU.sans) return 'sans-enjeu';
  return 'enjeu';
}

/**
 * N FINS DE PHASE. `table` : { tables: [{ name, rows }] } (tablesDeLaPhase) ; `restants` : [{ h, a, date }] (la liste
 * de `restants`) ; `loi` : (domId, extId) → { lambda, mu } ; `n`, `seed` ; `rencontresAEnjeu` : indices dans
 * `restants` des rencontres dont on veut l'enjeu ; `rho` (−0,05).
 * Chaque rencontre est tirée dans grilleDesButs(λ, μ, ρ) par inversion sur un uniforme ; classement par points
 * (tels quels), différence, buts marqués, puis tirage uniforme ; rangs calculés DANS chaque table.
 * Rend { n, probas: [{ table, club, familles: { f: p }, unanime: { f: bool }, rangs: [P(rang 1), …] }],
 *        enjeux: [{ index, h, a, date, issues: { dom, nul, ext }, dom: { enjeu, valeurDuNul, parFamille }, ext: {…},
 *        parIssue, enjeu (le plus grand des deux camps), categorie }], regles: [{ table, familles, membres }] }.
 * enjeu(camp) = max_f |P(f | le camp gagne) − P(f | le camp perd)| en points ; valeurDuNul = max_f [P(f | nul) −
 * P(f | le camp perd)] en points (rangée, pas montrée) ; null si le camp ne gagne ou ne perd jamais dans les tirages.
 */
export function simulerSaison({ table, restants: liste, loi, n = N, seed, rencontresAEnjeu = [], rho = RHO_SAISONS }) {
  if (!fini(seed)) throw new EntreeInvalide('simulerSaison : la graine est obligatoire.');
  if (!Number.isInteger(n) || n < 1) throw new EntreeInvalide('simulerSaison : n entier positif attendu.');
  if (typeof loi !== 'function' && (liste ?? []).length) throw new EntreeInvalide('simulerSaison : loi absente.');
  const tables = (table?.tables ?? []).map((t) => ({ name: t.name, rows: t.rows, familles: famillesDeLaTable(t) }));
  const clubs = [];
  const indice = new Map();
  for (const t of tables) {
    for (const r of t.rows) {
      const id = idFotMob(r.teamId) ?? String(r.teamId);
      if (!indice.has(id)) {
        indice.set(id, clubs.length);
        clubs.push({ id, points: nombre(r.points) ?? 0, diff: nombre(r.goalDiff) ?? (nombre(r.goalsFor) ?? 0) - (nombre(r.goalsAgainst) ?? 0), pour: nombre(r.goalsFor) ?? 0 });
      }
    }
  }
  const nc = clubs.length;
  const membres = tables.map((t) => t.rows.map((r) => indice.get(idFotMob(r.teamId) ?? String(r.teamId))));
  const rencontres = (liste ?? []).map((m, q) => {
    const h = indice.get(String(m.h));
    const a = indice.get(String(m.a));
    if (h === undefined || a === undefined) throw new EntreeInvalide(`simulerSaison : la rencontre ${q} oppose un club absent des tables.`);
    const { lambda, mu } = loi(m.h, m.a);
    if (!fini(lambda) || !fini(mu)) throw new EntreeInvalide(`simulerSaison : loi sans buts attendus pour la rencontre ${q}.`);
    const g = grilleDesButs(lambda, mu, rho);
    const cum = new Float64Array(T * T);
    let acc = 0;
    for (let c = 0; c < T * T; c++) {
      acc += g[c];
      cum[c] = acc;
    }
    cum[T * T - 1] = Infinity;
    return { h, a, cum };
  });
  const aEnjeu = [...new Set(rencontresAEnjeu)].filter((q) => Number.isInteger(q) && q >= 0 && q < rencontres.length).sort((x, y) => x - y);

  // Compteurs : familles et rangs par (table, club) ; issues et familles conditionnelles par rencontre à enjeu.
  const compteFam = tables.map((t) => Object.fromEntries(Object.keys(t.familles).map((f) => [f, new Int32Array(nc)])));
  const ensembles = tables.map((t) => Object.fromEntries(Object.entries(t.familles).map(([f, rangs]) => [f, new Set(rangs)])));
  const compteRang = tables.map((t) => Array.from({ length: t.rows.length }, () => new Int32Array(t.rows.length + 1)));
  const position = tables.map((t, ti) => new Map(membres[ti].map((i, p) => [i, p])));
  const suivis = aEnjeu.map((q) => ({
    q,
    issues: new Int32Array(3),
    dom: tables.map((t, ti) => (position[ti].has(rencontres[q].h) ? Object.fromEntries(Object.keys(t.familles).map((f) => [f, new Int32Array(3)])) : null)),
    ext: tables.map((t, ti) => (position[ti].has(rencontres[q].a) ? Object.fromEntries(Object.keys(t.familles).map((f) => [f, new Int32Array(3)])) : null))
  }));

  const rng = generateur(seed);
  const pts = new Float64Array(nc);
  const diff = new Float64Array(nc);
  const pour = new Float64Array(nc);
  const cle = new Float64Array(nc);
  const rang = new Int32Array(nc);
  const issue = new Int8Array(rencontres.length);
  for (let it = 0; it < n; it++) {
    for (let i = 0; i < nc; i++) {
      pts[i] = clubs[i].points;
      diff[i] = clubs[i].diff;
      pour[i] = clubs[i].pour;
    }
    for (let q = 0; q < rencontres.length; q++) {
      const { h, a, cum } = rencontres[q];
      const u = rng();
      let lo = 0;
      let hi = T * T - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < u) lo = mid + 1;
        else hi = mid;
      }
      const i = (lo / T) | 0;
      const j = lo % T;
      pour[h] += i;
      pour[a] += j;
      diff[h] += i - j;
      diff[a] += j - i;
      if (i > j) {
        pts[h] += 3;
        issue[q] = 0;
      } else if (i === j) {
        pts[h] += 1;
        pts[a] += 1;
        issue[q] = 1;
      } else {
        pts[a] += 3;
        issue[q] = 2;
      }
    }
    // Départage : points, différence, buts marqués, puis tirage uniforme (un uniforme par club et par tirage).
    for (let i = 0; i < nc; i++) cle[i] = pts[i] * 1e7 + (diff[i] + 1000) * 1e3 + pour[i] + rng() * 0.5;
    for (let ti = 0; ti < tables.length; ti++) {
      const ordre = membres[ti].slice().sort((x, y) => cle[y] - cle[x]);
      for (let p = 0; p < ordre.length; p++) {
        rang[ordre[p]] = p + 1;
        compteRang[ti][position[ti].get(ordre[p])][p + 1]++;
      }
      for (const [f, S] of Object.entries(ensembles[ti])) {
        const c = compteFam[ti][f];
        for (const i of membres[ti]) if (S.has(rang[i])) c[i]++;
      }
    }
    for (const s of suivis) {
      const o = issue[s.q];
      s.issues[o]++;
      const { h, a } = rencontres[s.q];
      for (let ti = 0; ti < tables.length; ti++) {
        if (s.dom[ti]) for (const [f, S] of Object.entries(ensembles[ti])) if (S.has(rang[h])) s.dom[ti][f][o]++;
        if (s.ext[ti]) for (const [f, S] of Object.entries(ensembles[ti])) if (S.has(rang[a])) s.ext[ti][f][o]++;
      }
    }
  }

  const probas = [];
  for (let ti = 0; ti < tables.length; ti++) {
    membres[ti].forEach((i, p) => {
      const familles = {};
      const unanime = {};
      for (const f of Object.keys(tables[ti].familles)) {
        const c = compteFam[ti][f][i];
        familles[f] = c / n;
        unanime[f] = c === 0 || c === n;
      }
      probas.push({ table: tables[ti].name, club: clubs[i].id, familles, unanime, rangs: Array.from(compteRang[ti][p]).slice(1).map((c) => c / n) });
    });
  }
  const conditionnelles = (parTable, o, total) => {
    const sortie = {};
    parTable.forEach((fams, ti) => {
      if (!fams) return;
      for (const [f, c] of Object.entries(fams)) sortie[`${tables[ti].name}|${f}`] = total[o] ? c[o] / total[o] : null;
    });
    return sortie;
  };
  const cote = (parTable, s, gagne, perd) => {
    const total = s.issues;
    if (!total[gagne] || !total[perd]) return { enjeu: null, valeurDuNul: null, parFamille: {} };
    let enjeu = 0;
    let valeurDuNul = null;
    const parFamille = {};
    parTable.forEach((fams, ti) => {
      if (!fams) return;
      for (const [f, c] of Object.entries(fams)) {
        const pG = c[gagne] / total[gagne];
        const pP = c[perd] / total[perd];
        const pN = total[1] ? c[1] / total[1] : null;
        parFamille[`${tables[ti].name}|${f}`] = { gagne: pG, nul: pN, perd: pP };
        enjeu = Math.max(enjeu, Math.abs(pG - pP) * 100);
        if (pN !== null) valeurDuNul = Math.max(valeurDuNul ?? -Infinity, (pN - pP) * 100);
      }
    });
    return { enjeu, valeurDuNul, parFamille };
  };
  const enjeux = suivis.map((s) => {
    const m = liste[s.q];
    const dom = cote(s.dom, s, 0, 2);
    const ext = cote(s.ext, s, 2, 0);
    return {
      index: s.q,
      h: String(m.h),
      a: String(m.a),
      date: m.date ?? null,
      issues: { dom: s.issues[0] / n, nul: s.issues[1] / n, ext: s.issues[2] / n },
      dom,
      ext,
      parIssue: { dom: [0, 1, 2].map((o) => conditionnelles(s.dom, o, s.issues)), ext: [0, 1, 2].map((o) => conditionnelles(s.ext, o, s.issues)) },
      enjeu: fini(dom.enjeu) && fini(ext.enjeu) ? Math.max(dom.enjeu, ext.enjeu) : null,
      categorie: categorieDeLEnjeu(dom.enjeu, ext.enjeu)
    };
  });
  const regles = tables.map((t, ti) => ({ table: t.name, familles: t.familles, membres: membres[ti].map((i) => clubs[i].id) }));
  return { n, probas, enjeux, regles };
}
