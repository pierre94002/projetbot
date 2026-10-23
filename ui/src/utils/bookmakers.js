/**
 * bookmakers.js — les règles d'affichage de la page « BOOKMAKERS » (étape 31 du plan, 22/10/2026 ; ce que l'étape 22
 * mesure chaque nuit : data/marketKnowledge.js, GET /api/market-knowledge). JavaScript pur, sans Vue ni navigateur :
 * les tests du serveur le rejouent (server/test/bookmakersEcran.test.mjs) sur les vraies réponses de la route.
 *
 * Rien n'est calculé ici qui ne le soit déjà par le serveur : la justesse (perte log après retrait de la marge,
 * toujours sur les MÊMES matchs pour deux bookmakers), la vitesse (qui bouge le premier), les biais, les marges et
 * le meilleur moment pour parier, chacun jugé par le juge de l'étape 16 et porteur de son nombre de matchs. L'écran
 * range ces lignes en tableaux, en langage simple, et dit ce qui manque au lieu d'un tiret.
 *
 * Les couleurs : AUCUN vert, AUCUN rouge — rien de cette page n'est une value, et un bookmaker biaisé n'est pas une
 * erreur. Un écart prouvé est BLEU (information), « trop peu de matchs » AMBRE, le reste sans ton.
 */

import { titreDuBookmaker } from './vosBookmakers.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const fr = (x, d = 0) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const MOINS = '−';
const signe = (x, d = 2) => {
  const r = Math.round(x * 10 ** d) / 10 ** d;
  return `${r < 0 ? MOINS : '+'}${fr(Math.abs(r), d)}`;
};

export const PAGE = Object.freeze({ titre: 'Bookmakers', icone: 'euro' });
export const PORTEE_TOUS = '*';

// ------------------------------------------------------------ les moments

/**
 * Les sept moments d'un prix, jamais mélangés (MOMENTS de marketKnowledge.js ; un test compare `long` à ceux du
 * serveur). `court` : le mot des en-têtes de colonne.
 */
export const MOMENTS = Object.freeze({
  ouverture: Object.freeze({ court: 'Ouverture', long: 'à l’ouverture (le premier prix publié, heure inconnue pour l’historique)' }),
  releve: Object.freeze({ court: 'Relevé du vendredi ou du mardi', long: 'au relevé du vendredi ou du mardi (football-data, un à trois jours avant)' }),
  'releve-payant': Object.freeze({ court: 'Votre relevé payant', long: 'à votre relevé payant (The Odds API, l’heure du clic)' }),
  'h-3': Object.freeze({ court: '3 h avant', long: 'trois heures avant le coup d’envoi (relevés datés)' }),
  'apres-compos': Object.freeze({ court: 'Après les compositions', long: 'après l’annonce des compositions (45 minutes avant le coup d’envoi, relevés datés)' }),
  'juste-avant': Object.freeze({ court: 'Juste avant', long: 'juste avant le coup d’envoi (dernier relevé daté, au plus 15 minutes avant)' }),
  cloture: Object.freeze({ court: 'Clôture', long: 'à la clôture (le dernier prix avant le coup d’envoi)' })
});
export const momentDit = (cle) => MOMENTS[cle]?.court ?? String(cle);

/** Les moments de chaque mesure, dans l'ordre où on les propose. */
export const MOMENTS_DE_JUSTESSE = Object.freeze(['cloture', 'releve', 'ouverture', 'releve-payant']);
export const MOMENTS_DE_VITESSE = Object.freeze(['releve', 'h-3']);
export const MOMENTS_DE_BIAIS = Object.freeze(['cloture', 'releve-payant']);
/** Les moments d'une marge, dans l'ordre du temps (de l'ouverture à la clôture, le relevé payant à part). */
export const MOMENTS_DE_MARGE = Object.freeze(['ouverture', 'releve', 'h-3', 'apres-compos', 'juste-avant', 'cloture', 'releve-payant']);
/** Les moments comparés pour le meilleur moment pour parier (la clôture est la référence : on la compare, on n'y parie pas). */
export const MOMENTS_A_JOUER = Object.freeze(['ouverture', 'releve', 'apres-compos', 'juste-avant']);

/** Les biais mesurés (CATEGORIES_DE_BIAIS de marketKnowledge.js ; un test compare les clés). */
export const CATEGORIES_DE_BIAIS = Object.freeze({
  outsiders: Object.freeze({ court: 'Outsiders', long: 'la victoire de l’outsider (l’équipe la moins probable selon le livre)' }),
  nuls: Object.freeze({ court: 'Nuls', long: 'le match nul' }),
  domicile: Object.freeze({ court: 'Domicile', long: 'la victoire à domicile' }),
  'grandes-equipes': Object.freeze({ court: 'Grandes équipes', long: 'la victoire d’une grande équipe (un des 3 premiers de la saison d’avant) face à une autre' })
});

/** Ce que veut dire « mieux vaut parier … » : le mot court de la conclusion et son icône. */
export const CONCLUSIONS = Object.freeze({
  releve: Object.freeze({ court: 'Parier tôt', precision: 'relevé du vendredi ou du mardi', icone: 'calendar' }),
  ouverture: Object.freeze({ court: 'Parier tôt', precision: 'à l’ouverture', icone: 'calendar' }),
  'apres-compos': Object.freeze({ court: 'Après les compositions', precision: 'une heure avant le coup d’envoi', icone: 'users' }),
  'juste-avant': Object.freeze({ court: 'Juste avant le coup d’envoi', precision: 'dernier quart d’heure', icone: 'clock' }),
  aucune: Object.freeze({ court: 'Pas de moment meilleur prouvé', precision: 'l’écart peut venir du hasard', icone: 'minus' })
});
export const conclusionDe = (cle) => CONCLUSIONS[cle ?? 'aucune'] ?? CONCLUSIONS.aucune;

// ------------------------------------------------------------ l'état de la page

const SERVEUR_PAS_A_JOUR = /^Le serveur n.est pas à jour/;

/**
 * L'état de la page — elle reste TOUJOURS affichée, tous ses tableaux comme leurs en-têtes :
 *   chargement · erreur · pas-a-jour-serveur (la route manque : relancer l'appli) · jamais (aucun calcul fini : la
 *   première passe de nuit le fait) · championnat-inconnu · pret (`aRefaire` : un calcul d'une autre forme, refait à
 *   la prochaine nuit, ses chiffres restent lus).
 */
export function etatDeLaPage({ chargement = false, erreur = null, reponse = null } = {}) {
  /**
   * Chaque état dit : `vide` (le mot d'une case sans valeur), `videControle` (celui du contrôle du 23/09, qui ne dépend
   * pas du championnat choisi) et `calculLu` — vrai seulement quand les chiffres du championnat sont là : alors, et
   * alors seulement, une case vide peut dire POURQUOI (« pas de relevé daté à ce moment dans ce championnat »). Sans
   * lecture, elle ne dit que ce qu'elle sait (« pas encore mesuré », « serveur à relancer »…), jamais une cause inventée.
   */
  const sans = (o) => ({ calculLu: false, videControle: o.vide, ...o });
  const enAttente = { cle: 'chargement', ton: '', titre: 'Lecture en cours', texte: 'Lecture de ce que le marché a appris…', vide: 'lecture en cours' };
  if (chargement && !reponse) return sans(enAttente);
  if (erreur) {
    return SERVEUR_PAS_A_JOUR.test(erreur)
      ? sans({ cle: 'pas-a-jour-serveur', ton: 'is-warning', titre: 'Serveur à relancer', texte: `${erreur} Les tableaux ci-dessous restent affichés, sans valeurs.`, vide: 'serveur à relancer' })
      : sans({ cle: 'erreur', ton: 'is-danger', titre: 'Bookmakers illisibles', texte: `${erreur} Les tableaux ci-dessous restent affichés, sans valeurs.`, vide: 'illisible : voir l’erreur plus haut' });
  }
  if (!reponse) return sans(enAttente);
  if (reponse.etat === 'jamais' || !reponse.calcul) {
    return sans({
      cle: 'jamais',
      ton: 'is-info',
      titre: 'Pas encore mesuré',
      texte: 'Le marché n’a pas encore été mesuré : la prochaine passe de nuit de l’actualisation le fera (quelques minutes, dans un processus à part). Les tableaux ci-dessous restent affichés, sans valeurs.',
      vide: 'pas encore mesuré'
    });
  }
  if (reponse.etat === 'championnat-inconnu') {
    return sans({
      cle: 'championnat-inconnu',
      ton: 'is-warning',
      titre: 'Championnat inconnu',
      texte: `Le calcul n’a rien mesuré pour « ${reponse.portee} » : choisissez un autre championnat. Les tableaux ci-dessous restent affichés, sans valeurs.`,
      vide: 'championnat non mesuré',
      videControle: 'aucun livre à classer'
    });
  }
  return { cle: 'pret', ton: '', titre: null, texte: null, aRefaire: reponse.etat === 'pas-a-jour', calculLu: true, vide: 'pas mesuré dans ce championnat', videControle: 'aucun livre à classer' };
}

// ------------------------------------------------------------ les livres

/**
 * Le titre d'un livre (« Pinnacle (football-data) ») : celui du calcul, sinon déduit de sa clé « famille|bookmaker ».
 * Vos bookmakers (famille `odds-api`, The Odds API) : toujours le NOM que l'appli montre déjà dans Réglages — « Winamax
 * (FR) », « PMU », « Betclic » (utils/vosBookmakers.js) —, jamais la clé de l'API (« winamax_fr », « pmu_fr »).
 */
export function titreDuLivre(cle, livres = []) {
  const i = String(cle).indexOf('|');
  if (i > 0 && String(cle).slice(0, i) === 'odds-api') return `${titreDuBookmaker(String(cle).slice(i + 1))} (vos bookmakers)`;
  const l = (livres ?? []).find((x) => x.cle === cle);
  if (l?.titre) return l.titre;
  return i < 0 ? String(cle) : `${String(cle).slice(i + 1)} (${String(cle).slice(0, i)})`;
}

const TYPES = Object.freeze({
  bookmaker: Object.freeze({ texte: 'bookmaker', ton: '' }),
  bourse: Object.freeze({ texte: 'bourse', ton: 'is-violet' }),
  composite: Object.freeze({ texte: 'moyenne', ton: 'is-info' })
});
/** Le type d'un livre : un bookmaker (marge), une bourse (commission) ou une moyenne de bookmakers. */
export function typeDuLivre(cle, livres = []) {
  const l = (livres ?? []).find((x) => x.cle === cle);
  const t = TYPES[l?.type] ?? TYPES.bookmaker;
  const jouable = l ? l.prixJouable !== false : true;
  return {
    cle: l?.type ?? 'bookmaker',
    texte: t.texte,
    ton: t.ton,
    commission: fini(l?.commission) ? l.commission : null,
    jouable,
    titre: l?.type === 'bourse' ? `Une bourse : pas de marge mais une commission${fini(l.commission) ? ` de ${fr(l.commission * 100, 0)} %` : ''}${jouable ? '' : ' ; son prix est le milieu du carnet, pas un prix qu’on obtient'}.` : l?.type === 'composite' ? 'Une moyenne de bookmakers, gardée comme repère.' : 'Un bookmaker : sa marge est retirée de ses cotes avant de les juger.'
  };
}

/** Le ton d'un verdict du juge : un écart prouvé est bleu, un échantillon maigre ambre, le reste sans ton. */
export function tonDuVerdict(verdict) {
  if (verdict === 'retenu' || verdict === 'moins-bon') return 'is-info';
  if (verdict === 'pas-assez-de-matchs') return 'is-warning';
  return '';
}

// ------------------------------------------------------------ le choix du championnat

/**
 * Les options du sélecteur : « Tous les championnats », puis ceux que le calcul a mesurés — les favoris d'abord
 * (`favorisEnPremier(liste)` : celui du magasin des favoris, qui rend la liste réordonnée), marqués d'une étoile.
 */
export function optionsDesChampionnats(reponse, { favorisEnPremier = (l) => l, estFavori = () => false } = {}) {
  const liste = (reponse?.championnats ?? []).map((c) => ({ value: c.portee, label: c.nom, league: c.horsAppli ? undefined : c.portee, hint: c.horsAppli ? 'football-data' : undefined, favorite: !c.horsAppli && estFavori(c.portee), portee: c.portee }));
  const rangees = favorisEnPremier(liste);
  const avecGroupes = rangees.some((o) => o.favorite);
  // Un lien vers un championnat que le calcul n'a pas mesuré : le champ garde son nom (au lieu de « Choisir… »), dit « non mesuré ».
  const inconnu = reponse?.etat === 'championnat-inconnu' && typeof reponse.portee === 'string' && reponse.portee ? [{ value: reponse.portee, label: reponse.portee, hint: 'non mesuré' }] : [];
  return [
    { value: PORTEE_TOUS, label: 'Tous les championnats', icon: 'globe' },
    ...inconnu,
    ...rangees.map((o) => ({ ...o, group: avecGroupes ? (o.favorite ? 'Favoris' : 'Tous les championnats') : undefined }))
  ];
}

// ------------------------------------------------------------ le classement (justesse et vitesse)

const lignesDe = (lignes, mesure) => (Array.isArray(lignes) ? lignes : lignes?.[mesure] ?? []);

/** La perte log (quatre décimales) ; l'avance d'un livre (fraction du mouvement du marché) en pourcentage signé. */
export const perteLogDite = (x) => (fini(x) ? fr(x, 4) : 'pas mesurée');
export const avanceDite = (x) => (fini(x) ? `${signe(x * 100, 1)} %` : 'pas mesurée');

/**
 * Le classement d'un moment, pour la justesse (`mesure: 'justesse'`) ou la vitesse (`'vitesse'`) : une ligne par
 * livre, du meneur au dernier — le meneur est celui qui BAT le plus d'autres livres sur leurs matchs communs —, avec
 * ses victoires, défaites et égalités, ses chiffres sur SES matchs (à ne pas comparer d'un livre à l'autre), et son
 * verdict face au meneur. Sans meneur à ce moment : { disponible: false } et aucune ligne.
 */
export function classementDuMoment({ lignes, livres, mesure, moment }) {
  const toutes = lignesDe(lignes, mesure);
  const men = toutes.find((l) => l.cle === 'meneur' && l.moment === moment) ?? null;
  const vide = { disponible: false, moment, meneur: null, lignes: [], phrase: null, pied: piedDuClassement([], mesure) };
  if (!men) return vide;
  const propres = (livre) => toutes.find((l) => l.moment === moment && l.livre === livre && l.cle === (mesure === 'justesse' ? 'propres' : 'avance')) ?? null;
  const face = (livre, suffixe = '') => toutes.find((l) => l.moment === moment && l.livre === men.livre && l.cle === `face|${livre}${suffixe}`) ?? null;
  const classement = men.detail?.classement ?? [];
  const rangees = classement.map((c, i) => {
    const p = propres(c.livre);
    const f = face(c.livre);
    const fv = mesure === 'justesse' ? face(c.livre, '|jamais-vues') : null;
    const estMeneur = c.livre === men.livre;
    return {
      rang: i + 1,
      livre: c.livre,
      titre: titreDuLivre(c.livre, livres),
      type: typeDuLivre(c.livre, livres),
      meneur: estMeneur,
      bat: c.victoires,
      perd: c.defaites,
      egal: c.egalites,
      n: p?.n ?? null,
      valeur: p?.valeur ?? null,
      valeurTexte: mesure === 'justesse' ? perteLogDite(p?.valeur) : avanceDite(p?.valeur),
      face: estMeneur ? null : jugementDe(f),
      faceJamaisVues: estMeneur || !fv ? null : jugementDe(fv)
    };
  });
  const titreMeneur = titreDuLivre(men.livre, livres);
  const decidees = men.detail ? (men.detail.victoires ?? 0) + (men.detail.defaites ?? 0) + (men.detail.egalites ?? 0) : 0;
  const phrase =
    mesure === 'justesse'
      ? `${momentDit(moment)} : ${titreMeneur} est le plus juste — il bat ${fr(men.detail?.victoires ?? 0)} livre${(men.detail?.victoires ?? 0) > 1 ? 's' : ''} sur ${fr(decidees)} sur leurs matchs communs.`
      : `${momentDit(moment)} : ${titreMeneur} bouge le premier — il devance ${fr(men.detail?.victoires ?? 0)} livre${(men.detail?.victoires ?? 0) > 1 ? 's' : ''} sur ${fr(decidees)} sur leurs matchs communs.`;
  return { disponible: true, moment, meneur: { livre: men.livre, titre: titreMeneur, n: men.n, bat: men.detail?.victoires ?? 0, perd: men.detail?.defaites ?? 0, egal: men.detail?.egalites ?? 0 }, lignes: rangees, phrase, pied: piedDuClassement(rangees, mesure) };
}

/** Le jugement du meneur face à un autre livre, en mots : « plus juste, au-delà du hasard sur 49 829 matchs communs ». */
export function jugementDe(ligne) {
  if (!ligne) return null;
  const d = ligne.detail ?? {};
  const verdict = ligne.verdict ?? d.verdict ?? null;
  const n = ligne.n ?? d.matchs ?? null;
  return {
    verdict,
    ton: tonDuVerdict(verdict),
    texte: d.dit ?? 'pas jugé',
    n,
    nTexte: fini(n) ? `${fr(n)} matchs communs` : 'matchs communs inconnus',
    titre: `${d.raison ?? d.dit ?? ''}${d.vues && fini(d.vues.part) ? ` ${fr(d.vues.part * 100, 0)} % de ces matchs ont déjà servi à régler la règle de pari du 23/09 (« déjà vus »).` : ''}`.trim()
  };
}

/** Le pied d'un classement : Σ = les duels comptés (une victoire est une défaite de l'autre) et les matchs lus ; ⌀ = la moyenne de chaque colonne. */
export function piedDuClassement(lignes, mesure) {
  const n = lignes.length;
  const somme = (cle) => lignes.reduce((t, l) => t + (l[cle] ?? 0), 0);
  const avecN = lignes.filter((l) => fini(l.n));
  const avecValeur = lignes.filter((l) => fini(l.valeur));
  const moyenne = (xs) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null);
  const mValeur = moyenne(avecValeur.map((l) => l.valeur));
  const mN = moyenne(avecN.map((l) => l.n));
  return {
    n,
    sigma: { livres: n, bat: somme('bat'), perd: somme('perd'), egal: somme('egal'), cotes: avecN.reduce((t, l) => t + l.n, 0) },
    moyenne: { valeur: mValeur, n: mN, bat: n ? somme('bat') / n : null },
    texte: {
      sigma: `${fr(n)} livre${n > 1 ? 's' : ''}`,
      cotes: avecN.length ? `${fr(avecN.reduce((t, l) => t + l.n, 0))} cotes lues` : 'aucune cote',
      valeur: mValeur === null ? 'pas de moyenne' : mesure === 'justesse' ? perteLogDite(mValeur) : avanceDite(mValeur),
      n: mN === null ? 'pas de moyenne' : `${fr(mN, 0)} matchs`,
      bat: n ? fr(somme('bat') / n, 1) : 'pas de moyenne'
    }
  };
}

// ------------------------------------------------------------ les marges

/**
 * Le tableau des marges : une ligne par livre, une case par moment (marge moyenne en %, matchs ; une bourse montre sa
 * commission à la place de la marge). Les livres sont ceux que le calcul a mesurés pour ce championnat, du moins
 * cher au plus cher (marge moyenne la plus basse d'abord). Les moments sans aucune ligne gardent leur colonne.
 */
export function tableauDesMarges({ lignes, livres }) {
  const toutes = lignesDe(lignes, 'marges').filter((l) => l.cle === 'marge');
  const cles = [...new Set(toutes.map((l) => l.livre))];
  const rangees = cles.map((livre) => {
    const cases = Object.fromEntries(
      MOMENTS_DE_MARGE.map((m) => {
        const l = toutes.find((x) => x.livre === livre && x.moment === m) ?? null;
        if (!l) return [m, { vide: true, texte: 'pas coté', n: null, valeur: null, titre: `${titreDuLivre(livre, livres)} : pas de cote ${MOMENTS[m].long} dans ce championnat.` }];
        const bourse = l.detail?.type === 'bourse' || l.valeur === null;
        const commission = fini(l.detail?.commission) ? `commission ${fr(l.detail.commission * 100, 0)} %` : 'sans marge';
        return [
          m,
          {
            vide: false,
            bourse,
            valeur: bourse ? null : l.valeur,
            texte: bourse ? commission : `${fr(l.valeur, 1)} %`,
            n: l.n,
            titre: `${titreDuLivre(livre, livres)} ${MOMENTS[m].long} : ${bourse ? `une bourse, ${commission}` : `marge moyenne ${fr(l.valeur, 2)} % (médiane ${fr(l.detail?.mediane ?? l.valeur, 2)} %)`}, sur ${fr(l.n)} matchs.`
          }
        ];
      })
    );
    const moyenne = cases.cloture && !cases.cloture.vide ? cases.cloture.valeur : MOMENTS_DE_MARGE.map((m) => cases[m]).find((c) => !c.vide && c.valeur !== null)?.valeur ?? null;
    return { livre, titre: titreDuLivre(livre, livres), type: typeDuLivre(livre, livres), cases, tri: moyenne };
  });
  rangees.sort((a, b) => (a.tri ?? Infinity) - (b.tri ?? Infinity) || a.titre.localeCompare(b.titre, 'fr'));
  return { lignes: rangees, pied: piedDesMarges(rangees) };
}

/** Le pied des marges : Σ = les cotes lues par moment (un match compte une fois par livre qui le cote) ; ⌀ = la marge moyenne des livres à marge (chacun compte pour un ; les bourses n'y sont pas). */
export function piedDesMarges(rangees) {
  const sigma = {};
  const moyenne = {};
  for (const m of MOMENTS_DE_MARGE) {
    const cases = rangees.map((r) => r.cases[m]).filter((c) => !c.vide);
    sigma[m] = cases.reduce((t, c) => t + (c.n ?? 0), 0);
    const marges = cases.filter((c) => c.valeur !== null).map((c) => c.valeur);
    moyenne[m] = marges.length ? marges.reduce((t, x) => t + x, 0) / marges.length : null;
  }
  return {
    sigma,
    moyenne,
    texte: {
      sigma: Object.fromEntries(MOMENTS_DE_MARGE.map((m) => [m, sigma[m] ? `${fr(sigma[m])} cotes` : 'aucune cote'])),
      moyenne: Object.fromEntries(MOMENTS_DE_MARGE.map((m) => [m, moyenne[m] === null ? 'pas de moyenne' : `${fr(moyenne[m], 1)} %`]))
    }
  };
}

// ------------------------------------------------------------ les biais

/**
 * Le tableau des biais à un moment : une ligne par livre, une case par catégorie (outsiders, nuls, domicile, grandes
 * équipes) — l'écart entre ce que le livre annonce et ce qui arrive, en points, avec son verdict et ses matchs.
 */
export function tableauDesBiais({ lignes, livres, moment }) {
  const toutes = lignesDe(lignes, 'biais').filter((l) => l.moment === moment);
  const cles = [...new Set(toutes.map((l) => l.livre))];
  const rangees = cles.map((livre) => {
    const cases = Object.fromEntries(
      Object.keys(CATEGORIES_DE_BIAIS).map((cat) => {
        const l = toutes.find((x) => x.livre === livre && x.cle === cat) ?? null;
        if (!l) return [cat, { vide: true, texte: 'pas mesuré', n: null, valeur: null, ton: '', dit: null, titre: `${titreDuLivre(livre, livres)} : ${CATEGORIES_DE_BIAIS[cat].long} — pas mesuré à ce moment.` }];
        const verdict = l.verdict ?? null;
        const dit = l.detail?.dit ?? 'pas jugé';
        const ecart = fini(l.valeur) ? `${signe(l.valeur, 1)} point${Math.abs(l.valeur) >= 2 ? 's' : ''}` : 'pas mesuré';
        const f = fini(l.bas) && fini(l.haut) ? ` Fourchette à 95 % : de ${signe(l.bas, 1)} à ${signe(l.haut, 1)} points.` : '';
        return [
          cat,
          {
            vide: false,
            valeur: fini(l.valeur) ? l.valeur : null,
            texte: ecart,
            verdict,
            dit,
            ton: tonDuVerdict(verdict),
            n: l.n,
            titre: `${titreDuLivre(livre, livres)} annonce ${fini(l.detail?.annonce) ? fr(l.detail.annonce * 100, 1) : '?'} % pour ${CATEGORIES_DE_BIAIS[cat].long} ; il arrive dans ${fini(l.detail?.realise) ? fr(l.detail.realise * 100, 1) : '?'} % des cas (${fr(l.n)} matchs) : ${dit}.${f}`
          }
        ];
      })
    );
    return { livre, titre: titreDuLivre(livre, livres), type: typeDuLivre(livre, livres), cases };
  });
  rangees.sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
  return { lignes: rangees, pied: piedDesBiais(rangees) };
}

/** Le pied des biais : Σ = les cotes lues et les biais PROUVÉS par catégorie ; ⌀ = l'écart moyen des livres (chacun compte pour un). */
export function piedDesBiais(rangees) {
  const sigma = {};
  const moyenne = {};
  for (const cat of Object.keys(CATEGORIES_DE_BIAIS)) {
    const cases = rangees.map((r) => r.cases[cat]).filter((c) => !c.vide);
    sigma[cat] = { cotes: cases.reduce((t, c) => t + (c.n ?? 0), 0), prouves: cases.filter((c) => c.verdict === 'retenu' || c.verdict === 'moins-bon').length, livres: cases.length };
    const ecarts = cases.filter((c) => c.valeur !== null).map((c) => c.valeur);
    moyenne[cat] = ecarts.length ? ecarts.reduce((t, x) => t + x, 0) / ecarts.length : null;
  }
  return {
    sigma,
    moyenne,
    texte: {
      sigma: Object.fromEntries(Object.keys(CATEGORIES_DE_BIAIS).map((c) => [c, sigma[c].livres ? `${fr(sigma[c].cotes)} cotes · ${fr(sigma[c].prouves)} biais prouvé${sigma[c].prouves > 1 ? 's' : ''}` : 'aucune cote'])),
      moyenne: Object.fromEntries(Object.keys(CATEGORIES_DE_BIAIS).map((c) => [c, moyenne[c] === null ? 'pas de moyenne' : `${signe(moyenne[c], 1)} point${Math.abs(moyenne[c]) >= 2 ? 's' : ''}`]))
    }
  };
}

// ------------------------------------------------------------ le meilleur moment pour parier

/** Les comparaisons « tôt contre tard » d'un championnat, dans l'ordre de PAIRES du serveur. */
const ORDRE_DES_PAIRES = Object.freeze([
  ['releve', 'juste-avant'],
  ['ouverture', 'juste-avant'],
  ['apres-compos', 'juste-avant'],
  ['releve', 'apres-compos'],
  ['ouverture', 'apres-compos']
]);

/**
 * Le meilleur moment d'UN championnat : la conclusion, la valeur de clôture de chaque moment, et les comparaisons
 * tôt / tard avec leur verdict. Toujours les quatre moments et les cinq comparaisons, mesurés ou non.
 */
export function meilleurMomentDuChampionnat({ lignes }) {
  const l = lignesDe(lignes, 'moments');
  // Un championnat dont le calcul n'a comparé AUCUN match (n = 0, verdict « trop-peu ») n'a pas de conclusion : il est
  // dit non mesuré, jamais « pas de moment meilleur prouvé » (ce qui voudrait dire qu'on a comparé et rien trouvé).
  const brute = l.find((x) => x.cle === 'conclusion') ?? null;
  const conclusion = brute && fini(brute.n) && brute.n > 0 ? brute : null;
  const parType = Object.fromEntries(
    ['favori', 'nul', 'outsider'].map((t) => {
      const c = conclusion ? l.find((x) => x.cle === `conclusion|${t}`) : null;
      return [t, c && c.n > 0 ? { conclusion: c.detail?.conclusion ?? null, phrase: c.detail?.phrase ?? null, n: c.n } : null];
    })
  );
  const valeurs = MOMENTS_A_JOUER.map((m) => {
    const v = l.find((x) => x.moment === m && x.cle === 'valeur') ?? null;
    return {
      moment: m,
      libelle: MOMENTS[m].court,
      mesure: Boolean(v),
      n: v?.n ?? null,
      valeur: v?.valeur ?? null,
      texte: v ? `${signe(v.valeur, 1)} %` : 'pas mesurée',
      issues: v?.detail?.parIssue ?? null,
      issuesTexte: Object.fromEntries(['favori', 'nul', 'outsider'].map((t) => [t, fini(v?.detail?.parIssue?.[t]) ? `${signe(v.detail.parIssue[t], 1)} %` : 'pas mesurée'])),
      cotes: v?.detail?.cotes ?? null
    };
  });
  const comparaisons = ORDRE_DES_PAIRES.map(([tot, tard]) => {
    const c = l.find((x) => x.moment === tot && x.cle === `face|${tard}`) ?? null;
    const d = c?.detail ?? {};
    return {
      tot,
      tard,
      libelle: `${MOMENTS[tot].court} contre ${MOMENTS[tard].court.toLowerCase()}`,
      mesuree: Boolean(c),
      n: c?.n ?? null,
      ecart: fini(c?.valeur) ? c.valeur : null,
      ecartTexte: fini(c?.valeur) ? `${signe(c.valeur, 2)} point${Math.abs(c.valeur) >= 2 ? 's' : ''}` : 'pas mesuré',
      fourchette: fini(c?.bas) && fini(c?.haut) ? `[${signe(c.bas, 2)} ; ${signe(c.haut, 2)}]` : null,
      verdict: c?.verdict ?? null,
      ton: tonDuVerdict(c?.verdict),
      dit: c ? d.dit ?? 'pas jugé' : 'pas mesuré : trop peu de relevés datés',
      titre: c ? `${d.raison ?? d.dit ?? ''}` : 'Pas assez de cotes pour comparer ces deux moments dans ce championnat.'
    };
  });
  return {
    mesure: Boolean(conclusion),
    conclusion: conclusion ? { cle: conclusion.detail?.conclusion ?? null, phrase: conclusion.detail?.phrase ?? 'pas de moment meilleur prouvé', n: conclusion.n, jugees: conclusion.detail?.jugees ?? null } : null,
    parType,
    valeurs,
    comparaisons,
    pied: piedDuMeilleurMoment(valeurs, comparaisons)
  };
}

/** Le pied : Σ = les moments mesurés et les comparaisons par verdict ; ⌀ = la valeur de clôture moyenne et l'écart moyen. */
export function piedDuMeilleurMoment(valeurs, comparaisons) {
  const v = valeurs.filter((x) => x.mesure);
  const c = comparaisons.filter((x) => x.mesuree);
  const moyenne = (xs) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null);
  const mv = moyenne(v.map((x) => x.valeur));
  const me = moyenne(c.map((x) => x.ecart).filter(fini));
  const compte = (verdict) => c.filter((x) => x.verdict === verdict).length;
  const parIssue = Object.fromEntries(['favori', 'nul', 'outsider'].map((t) => [t, moyenne(v.map((x) => x.issues?.[t]).filter(fini))]));
  return {
    valeurs: { n: v.length, moyenne: mv, parIssue },
    comparaisons: { n: c.length, retenues: compte('retenu'), moinsBonnes: compte('moins-bon'), pasProuvees: compte('pas-prouve'), pasAssez: compte('pas-assez-de-matchs'), moyenne: me },
    texte: {
      valeursSigma: `${fr(v.length)} moment${v.length > 1 ? 's' : ''} mesuré${v.length > 1 ? 's' : ''} sur ${fr(valeurs.length)}`,
      valeursMoyenne: mv === null ? 'pas de moyenne' : `${signe(mv, 1)} %`,
      issuesMoyenne: Object.fromEntries(Object.entries(parIssue).map(([t, x]) => [t, x === null ? 'pas de moyenne' : `${signe(x, 1)} %`])),
      comparaisonsSigma: `${fr(c.length)} comparaison${c.length > 1 ? 's' : ''} sur ${fr(comparaisons.length)} · ${fr(compte('retenu') + compte('moins-bon'))} avec un écart prouvé`,
      comparaisonsMoyenne: me === null ? 'pas de moyenne' : `${signe(me, 2)} point${Math.abs(me) >= 2 ? 's' : ''}`
    }
  };
}

/**
 * Le tableau « championnat par championnat » : une ligne par championnat que le calcul a mesuré, avec sa conclusion
 * (parier tôt, après les compositions, juste avant, ou rien de prouvé). Les championnats sans aucun moment calculé
 * restent là, avec la raison. Les favoris d'abord (`favorisEnPremier`), le championnat regardé marqué.
 */
export function lignesDesChampionnats({ resume, championnats, selection = PORTEE_TOUS }, { favorisEnPremier = (l) => l, estFavori = () => false } = {}) {
  const parPortee = new Map((resume?.moments ?? []).map((m) => [m.championnat, m]));
  const liste = [{ portee: PORTEE_TOUS, nom: 'Tous les championnats', horsAppli: false }, ...(championnats ?? [])];
  const rangees = liste.map((c) => {
    // Aucun match comparé (n = 0 : « trop peu de matchs pour juger ») : pas de conclusion, comme un championnat absent du calcul.
    const brut = parPortee.get(c.portee) ?? null;
    const m = brut && fini(brut.n) && brut.n > 0 ? brut : null;
    const conclusion = m ? conclusionDe(m.conclusion) : null;
    return {
      portee: c.portee,
      nom: c.nom,
      horsAppli: Boolean(c.horsAppli),
      tous: c.portee === PORTEE_TOUS,
      favori: c.portee !== PORTEE_TOUS && !c.horsAppli && estFavori(c.portee),
      choisi: c.portee === selection,
      mesure: Boolean(m),
      cle: m ? m.conclusion ?? 'aucune' : null,
      conclusion: conclusion ? conclusion.court : 'pas assez de relevés datés',
      precision: m ? conclusion.precision : 'aucune comparaison tôt / tard possible ici',
      icone: conclusion ? conclusion.icone : 'info',
      phrase: m ? m.phrase : 'Pas mesuré : trop peu de cotes archivées pour comparer les moments.',
      n: m?.n ?? null,
      comparaisons: (m?.comparaisons ?? []).map((x) => ({ tot: x.tot, tard: x.tard, verdict: x.verdict, ton: tonDuVerdict(x.verdict), n: x.n }))
    };
  });
  const tous = rangees.find((r) => r.tous);
  const reste = favorisEnPremier(rangees.filter((r) => !r.tous).map((r) => ({ ...r, value: r.portee })));
  return { lignes: [tous, ...reste].filter(Boolean), pied: piedDesChampionnats(reste) };
}

/** Le pied du tableau par championnat : Σ = les championnats, leurs matchs comparés (jamais le même match deux fois : chaque match est dans un seul championnat) et la répartition des conclusions ; ⌀ = les matchs comparés par championnat mesuré. */
export function piedDesChampionnats(rangees) {
  const mesures = rangees.filter((r) => r.mesure);
  const compte = (cle) => mesures.filter((r) => r.cle === cle).length;
  const matchs = mesures.reduce((t, r) => t + (r.n ?? 0), 0);
  const tot = compte('releve') + compte('ouverture');
  return {
    n: { championnats: rangees.length, mesures: mesures.length, tot, apresCompos: compte('apres-compos'), justeAvant: compte('juste-avant'), aucun: compte('aucune'), matchs },
    moyenne: mesures.length ? matchs / mesures.length : null,
    texte: {
      sigma: `${fr(rangees.length)} championnat${rangees.length > 1 ? 's' : ''}, ${fr(mesures.length)} mesuré${mesures.length > 1 ? 's' : ''}`,
      repartition: mesures.length ? `${fr(tot)} tôt · ${fr(compte('apres-compos'))} après les compositions · ${fr(compte('juste-avant'))} juste avant · ${fr(compte('aucune'))} sans moment prouvé` : 'aucun championnat mesuré',
      matchs: `${fr(matchs)} matchs comparés`,
      moyenne: mesures.length ? `${fr(matchs / mesures.length, 0)} matchs par championnat` : 'pas de moyenne'
    }
  };
}

// ------------------------------------------------------------ le 23/09 retrouvé

/** La reproduction de la mesure du 23/09 (« Pinnacle le plus juste ») : retrouvée ou non, avec ses deux chiffres. */
export function reproductionDite(resume, livres = []) {
  const r = resume?.reproduction ?? null;
  if (!r) return { mesuree: false, retrouve: null, texte: 'Pas encore mesurée : le calcul de nuit la fait avec le reste.', reference: null, mesure: null, classement: [], jugements: [] };
  const titre = (cle) => titreDuLivre(cle, livres);
  return {
    mesuree: true,
    retrouve: Boolean(r.retrouve),
    texte: r.retrouve ? `Retrouvé : ${titre(r.meneur)} reste le plus juste, avec la même perte log qu’au 23/09.` : r.mesure ? 'Pas retrouvé : la mesure d’aujourd’hui ne donne pas le même résultat que celle du 23/09.' : 'Pas retrouvé : le panier de matchs du 23/09 (18 championnats rattachés) n’est pas là.',
    reference: r.reference ? { titre: titre(r.reference.livre), perteLog: perteLogDite(r.reference.perteLog), matchs: fr(r.reference.matchs), source: r.reference.source } : null,
    mesure: r.mesure ? { perteLog: perteLogDite(r.mesure.perteLog), matchs: fr(r.mesure.matchs) } : null,
    periode: r.periode ?? null,
    classement: (r.classement ?? []).map((c, i) => ({ rang: i + 1, livre: c.livre, titre: titre(c.livre), type: typeDuLivre(c.livre, livres), bat: c.victoires, perd: c.defaites, egal: c.egalites })),
    jugements: (r.jugements ?? []).map((j) => ({ autre: titre(j.autre), verdict: j.verdict, ton: tonDuVerdict(j.verdict), n: j.n, gain: j.gain }))
  };
}

// ------------------------------------------------------------ chiffres clés, provenance

export function chiffresCles(reponse) {
  const c = reponse?.calcul ?? null;
  const r = reponse?.bilan?.releves ?? {};
  const resume = reponse?.resume ?? null;
  const plusJuste = resume?.plusJuste?.cloture ?? null;
  const premier = resume?.premier?.releve ?? null;
  return {
    calcul: c ? { valeur: `n° ${fr(c.id)}`, detail: `${c.ou === 'serveur' ? 'dans le serveur' : c.ou === 'bac' ? 'dans le bac à sable' : 'calcul d’essai'}, fini le ${jourHeure(c.finiLe)}` } : { valeur: 'aucun', detail: 'pas encore mesuré' },
    cotes: c ? { valeur: fini(r.cotes) ? fr(r.cotes) : 'non lu', detail: fini(r.rencontres) ? `cotes lues sur ${fr(r.rencontres)} rencontres` : 'rencontres inconnues' } : { valeur: 'non lu', detail: 'pas encore mesuré' },
    // Le nom d'un de vos bookmakers passe par titreDuLivre : le titre du calcul porterait la clé brute (« winamax_fr »).
    plusJuste: plusJuste ? { valeur: plusJuste.livre ? titreDuLivre(plusJuste.livre, reponse?.livres) : plusJuste.titre, detail: `à la clôture, perte log ${perteLogDite(plusJuste.perteLog)}` } : { valeur: 'non lu', detail: 'pas encore mesuré' },
    premier: premier ? { valeur: premier.livre ? titreDuLivre(premier.livre, reponse?.livres) : premier.titre, detail: `bouge le premier dès le relevé du vendredi ou du mardi` } : { valeur: 'non lu', detail: 'pas encore mesuré' }
  };
}

const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
const FORMAT_HEURE = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
/** « 18/10/2026 à 21 h 16 » (heure de Paris). */
export function jourHeure(iso) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return 'date inconnue';
  return `${FORMAT_JOUR.format(t)} à ${FORMAT_HEURE.format(t).replace(':', ' h ')}`;
}

/** La provenance de la page, pour ProvenanceChip : le vrai fournisseur de chaque morceau, l'heure de la fin du calcul. */
export function provenanceDeLaPage(reponse) {
  const c = reponse?.calcul ?? null;
  return {
    source: 'football-data.co.uk · ESPN · 365Scores · Kalshi · Smarkets · The Odds API',
    releveLe: c?.finiLe ?? null,
    action: 'calculé',
    fichier: reponse?.base ?? null,
    detail: reponse?.provenance ? `${reponse.provenance.cotes} ${reponse.provenance.resultats}` : 'Calculé chaque nuit par l’actualisation, à partir des cotes archivées dans la base SQLite de ce PC.'
  };
}
