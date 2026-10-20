/**
 * historiqueFd.js — les règles d'affichage de l'historique football-data
 * (étape 13 du plan, 06/10/2026). JavaScript pur, sans Vue ni navigateur : les
 * tests du serveur le rejouent (server/test/historiqueFd*.test.mjs).
 *
 * Rien n'est recompté ici : chaque chiffre vient du résumé que le serveur
 * prépare à la fin de chaque passe (footballDataHistory.resumeHistorique).
 * L'écran FILTRE les championnats et refait, pour les lignes affichées, le
 * pied du tableau : Σ des comptes, et ⌀ du rattachement sur tous ces matchs
 * réunis (Σ rattachés / Σ matchs de la période) — jamais une somme ni une
 * moyenne de pourcentages.
 */

/** Objectif de l'étape : plus de 95 % des matchs depuis 2023 rattachés à FotMob avec le même score. */
export const OBJECTIF_RATTACHEMENT = 95;
/** Requêtes au site par passe d'actualisation (le serveur le redit ; repli s'il ne le dit pas). */
export const PAR_PASSE_DEFAUT = 150;

/** Code du pays (portée de l'identité des clubs) -> code FIFA du drapeau FotMob. */
const FIFA = { DNK: 'DEN', SWZ: 'SUI' };
export const codeDrapeau = (pays) => (pays ? FIFA[pays] ?? pays : null);

export const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const arrondi1 = (x) => Math.round(x * 10) / 10;

/** Part en pour cent (une décimale), ou null sans dénominateur. */
export function part(n, sur) {
  return sur ? arrondi1((100 * (n ?? 0)) / sur) : null;
}

/** « 97,8 % » ; sans dénominateur, la raison — jamais un tiret muet. */
export function pourcentTexte(p, sansValeur = 'aucun match') {
  return p === null || p === undefined || !Number.isFinite(Number(p)) ? sansValeur : `${Number(p).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

/** Le ton d'un taux de rattachement : 'bon' à l'objectif (95 %), 'partiel' dès 80 %, 'faible' en dessous, 'vide' sans match. */
export function tonRattachement(p) {
  if (p === null || p === undefined || !Number.isFinite(Number(p))) return 'vide';
  if (Number(p) >= OBJECTIF_RATTACHEMENT) return 'bon';
  if (Number(p) >= 80) return 'partiel';
  return 'faible';
}

/** « 1,2 Mo », « 63,4 Mo », « 1,84 Go » ; inconnu : dit. */
export function tailleTexte(octets) {
  if (octets === null || octets === undefined || !Number.isFinite(Number(octets))) return 'taille inconnue';
  const o = Number(octets);
  if (o >= 1024 ** 3) return `${(o / 1024 ** 3).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Go`;
  if (o >= 1024 ** 2) return `${(o / 1024 ** 2).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
  return `${Math.max(0, Math.round(o / 1024)).toLocaleString('fr-FR')} Ko`;
}

/** « 2000-01 → 2026-27 » ; une seule saison : elle ; aucune : dit. */
export function texteSaisons(premiere, derniere) {
  if (!premiere) return 'aucune saison';
  return premiere === derniere || !derniere ? premiere : `${premiere} → ${derniere}`;
}

/** Les lignes affichées : les championnats que le magasin suit, ou tous (les 22 divisions et 16 fichiers par pays). */
export function filtrerChampionnats(lignes, choix = 'suivis') {
  const l = Array.isArray(lignes) ? lignes : [];
  return choix === 'tous' ? l : l.filter((x) => x.league);
}

/**
 * Σ et ⌀ des lignes affichées. Les comptes s'additionnent (matchs, saisons de
 * championnat, clubs, matchs de la période commune, rattachés, écarts) ; le
 * rattachement est celui de tous ces matchs réunis ; les clubs reconnus,
 * la part de tous ces clubs.
 */
export function totauxDesChampionnats(lignes) {
  const t = { lignes: lignes.length, matchs: 0, saisons: 0, clubs: 0, clubsReconnus: 0, periode: 0, rattachees: 0, ecarts: 0, nonTraduits: 0, introuvables: 0 };
  for (const l of lignes) {
    t.matchs += l.matchs ?? 0;
    t.saisons += l.saisons ?? 0;
    t.clubs += l.clubs ?? 0;
    t.clubsReconnus += l.clubsReconnus ?? 0;
    t.periode += l.periode ?? 0;
    t.rattachees += l.rattachees ?? 0;
    t.ecarts += l.ecarts ?? 0;
    t.nonTraduits += l.nonTraduits ?? 0;
    t.introuvables += l.introuvables ?? 0;
  }
  t.partRattachee = part(t.rattachees, t.periode);
  t.partClubs = part(t.clubsReconnus, t.clubs);
  return t;
}

/**
 * Ce que l'écran dit de l'import : jamais fait, en cours (fichiers faits,
 * reste, passes restantes à 150 requêtes), fini.
 */
export function etatDeLImport(data) {
  const parPasse = data?.parPasse ?? PAR_PASSE_DEFAUT;
  const r = data?.resume;
  const attendus = r?.fichiers?.attendus ?? null;
  const faits = (r?.fichiers?.importes ?? 0) + (r?.fichiers?.absents ?? 0);
  if (!data || data.etat === 'illisible') return { cle: 'illisible', titre: 'Illisible', texte: data?.erreur ?? 'état de l’import illisible', ton: 'is-danger' };
  if (data.etat === 'jamais') {
    return {
      cle: 'jamais',
      titre: 'Pas encore',
      texte: `la première fois, l’actualisation télécharge environ 600 fichiers, ${nombre(parPasse)} par passe (quatre à cinq passes)`,
      ton: 'is-warn'
    };
  }
  if (data.etat === 'en-cours') {
    const reste = attendus === null ? null : Math.max(0, attendus - faits);
    const passes = reste === null ? null : Math.ceil(reste / parPasse);
    return {
      cle: 'en-cours',
      titre: 'En cours',
      texte:
        reste === null
          ? 'import commencé, compte des fichiers pas encore relevé'
          : `${nombre(faits)} fichier(s) sur ${nombre(attendus)} ; reste ${nombre(reste)}, environ ${nombre(passes)} passe(s) de l’actualisation`,
      ton: 'is-warn'
    };
  }
  return { cle: 'complet', titre: 'Complet', texte: `${nombre(faits)} fichier(s) sur ${nombre(attendus ?? faits)} ; ensuite, une mise à jour par semaine`, ton: 'is-ok' };
}

/** Les livres, marchés et moments du tableau des cotes gardées (repli si le serveur ne les donne pas). */
export const LIVRES = Object.freeze([
  { cle: 'moy', nom: 'Moyenne du marché' },
  { cle: 'max', nom: 'Maximum du marché' },
  { cle: 'pin', nom: 'Pinnacle' },
  { cle: 'b365', nom: 'Bet365' },
  { cle: 'wh', nom: 'William Hill' }
]);
export const MARCHES = Object.freeze([
  { cle: '1x2', nom: '1 N 2' },
  { cle: 'ou25', nom: 'Plus/moins 2,5 buts' },
  { cle: 'ah', nom: 'Handicap asiatique' }
]);

/**
 * Le tableau des cotes gardées : une ligne par livre, une case par marché et
 * moment — « 2005-06 → 2025-26 » et le nombre de matchs —, ou la raison
 * quand le livre n'a pas ce marché chez football-data (« pas publié »).
 */
export function lignesDesCotes(cotes) {
  const liste = Array.isArray(cotes) ? cotes : [];
  return LIVRES.map((l) => ({
    ...l,
    cases: MARCHES.flatMap((m) =>
      ['avant', 'cloture'].map((moment) => {
        const c = liste.find((x) => x.livre === l.cle && x.marche === m.cle && x.moment === moment);
        if (!c) return { marche: m.cle, moment, publie: false, texte: 'pas publié par football-data', matchs: 0 };
        if (!c.matchs && !c.fichiersParPays) return { marche: m.cle, moment, publie: true, texte: 'aucun match', matchs: 0 };
        return {
          marche: m.cle,
          moment,
          publie: true,
          texte: c.premiere ? texteSaisons(c.premiere, c.derniere) : 'fichiers par pays seulement',
          matchs: c.matchs ?? 0,
          fichiersParPays: c.fichiersParPays ?? 0
        };
      })
    )
  }));
}

/** Les colonnes témoins du tableau saison par saison (avant-match et clôture, 1 N 2). */
export const TEMOINS_SAISON = Object.freeze([
  { colonne: 'wh_1', livre: 'William Hill', moment: 'avant-match' },
  { colonne: 'wh_c1', livre: 'William Hill', moment: 'clôture' },
  { colonne: 'pin_1', livre: 'Pinnacle', moment: 'avant-match' },
  { colonne: 'pin_c1', livre: 'Pinnacle', moment: 'clôture' },
  { colonne: 'moy_1', livre: 'Moyenne', moment: 'avant-match' },
  { colonne: 'moy_c1', livre: 'Moyenne', moment: 'clôture' }
]);

/** Saison par saison (divisions à fichier saisonnier), la part des matchs qui ont chaque cote témoin ; la plus récente d'abord. */
export function lignesParSaison(saisons) {
  return [...(Array.isArray(saisons) ? saisons : [])]
    .sort((a, b) => String(b.saison).localeCompare(String(a.saison)))
    .map((s) => ({
      saison: s.saison,
      matchs: s.matchs ?? 0,
      parts: Object.fromEntries(TEMOINS_SAISON.map((t) => [t.colonne, { n: s[t.colonne] ?? 0, pct: part(s[t.colonne] ?? 0, s.matchs ?? 0) }]))
    }));
}

/** Σ du tableau saison par saison : matchs et cotes de chaque colonne, et leur part sur tous ces matchs réunis. */
export function totauxParSaison(lignes) {
  const matchs = lignes.reduce((n, l) => n + l.matchs, 0);
  return {
    matchs,
    parts: Object.fromEntries(
      TEMOINS_SAISON.map((t) => {
        const n = lignes.reduce((s, l) => s + (l.parts[t.colonne]?.n ?? 0), 0);
        return [t.colonne, { n, pct: part(n, matchs) }];
      })
    )
  };
}

/** Un écart de score en une phrase : « 12/09/2026 · Arsenal - Chelsea : 2-1 chez football-data, 2-2 chez FotMob ». */
export function phraseEcart(e) {
  const jour = e?.date ? e.date.split('-').reverse().join('/') : 'date inconnue';
  const fotmob = e?.scoreMagasin ? `${e.scoreMagasin} chez FotMob` : 'rencontre FotMob introuvable';
  return `${jour} · ${e?.dom ?? '?'} - ${e?.ext ?? '?'} : ${e?.scoreFootballData ?? '?'} chez football-data, ${fotmob}`;
}
