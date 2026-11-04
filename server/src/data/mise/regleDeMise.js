/**
 * regleDeMise.js — LA RÈGLE DE MISE (étape 39 « La mise juste », lot 1a, 04/11/2026). PUR : n'importe rien, ne lit ni
 * horloge, ni hasard, ni fichier, ni base ; tout entre par les arguments (T-X3).
 * -----------------------------------------------------------------------
 * La règle rend une FRACTION du capital, jamais des euros : les euros n'existent que sur le capital que Pierre a réglé
 * (`capital.indique`). Sur un pari 1N2 isolé chez un bookmaker étranger, c'est la règle de service À L'OCTET
 * (core/engine/valueFinder.js, findValueBet : 1/8 de Kelly, `avantage / (cote − 1)`, plafond 2 %) : `partDeMise` × la base
 * redonne la mise du moteur au centime (T-M1). Ce qui s'ajoute est AUTOUR, et à blanc au lot 1 (jamais à la place du
 * conseil) : les paris d'un même match se partagent « la place qui reste » (E7), la mention des bookmakers français (E13),
 * les plafonds en euros nommés, « le plus petit gagne » (E9), le plancher de Pierre s'il en donne un.
 *
 * L'ORDRE FIXE du calcul (conception §1.7 ; une seule fonction, fractionDeMise) :
 *   (1) pas de conseil du moteur, combiné, cote saisie, marché sans value → 0 ;
 *   (2) k · ev / (cote − 1) ;  (3) le plafond du moteur s_max ;  (4) le livre (français : la mention, par défaut) ;
 *   (5) les paris liés du même match, attente comprise si le capital est connu (« la place qui reste ») ;
 *   (6) le plafond du jour s'il est réglé ;  (7) les euros (`Number((f × C).toFixed(2))`, l'arrondi du moteur), puis le plus
 *   petit des plafonds en euros, jamais un centime au-dessus ;  (8) le coupe-circuit → 0.
 * Chaque baisse porte { code, avant, apres, texte } (avant / apres : des parts du capital), dans l'ordre où elle a mordu.
 *
 * Ce que la règle ne lit JAMAIS : une probabilité du modèle de buts, une confiance (« sûr » n'augmente rien : il n'est
 * même pas une entrée), un fichier. k et s_max sont ceux du réglage du moteur en vigueur, passés par l'appelant : la
 * règle ne les possède pas (une seule source).
 * -----------------------------------------------------------------------
 */

/** La règle de mise du lot 1 (la définition ; la même que celle de service sur un 1N2 isolé chez un étranger). */
export const REGLE_DE_MISE_V1 = Object.freeze({ id: 'mise-v1', version: '39.1', liaisonMemeMatch: 'place-qui-reste', francais: 'mention' });

/** La mention d'un bookmaker français (défaut de Q-H, conception 38 §10 ; réponse de Pierre du 03/11 : m_livre = 1). */
export const MENTION_FRANCAIS = 'jamais mesuré chez ce bookmaker (marge 11 à 15 %)';

/**
 * Les bookmakers français : la liste de l'étape 38 (data/combinaison/reglagesCombinaison.js, LIVRES_FRANCAIS), recopiée —
 * personne hors de data/combinaison/ ne l'importe (frontière de la 38) ; un test vérifie qu'elles sont égales.
 */
export const LIVRES_FRANCAIS = Object.freeze(['betclic_fr', 'unibet_fr', 'winamax_fr', 'pmu_fr']);

/** Les mots fixes de l'écran (conception §5 et §8) ; ui/src/utils/miseAffichee.js les recopie mot pour mot (test « écran = serveur »). */
export const MOTS_DE_LA_MISE = Object.freeze({
  miseConseillee: 'Mise conseillée',
  capitalNonIndique: 'Capital non indiqué : réglez-le dans Réglages › Gestion du risque pour voir la mise en euros.',
  ticket: 'conseil du moteur, modifiable',
  aBlanc: 'Règle candidate (à blanc)',
  seriesLiees: 'Cette alerte compte les paris d’un même match comme indépendants : chez vous, elle sonne trop souvent.',
  nonEnregistres:
    'Si vous n’enregistrez pas vos paris (« J’ai parié »), le capital qui les suit, les plafonds et les paris liés ne voient rien : ils calculent sur ce que vous leur dites.'
});

const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/** « 20 € », « 12,50 € » — l'écriture des garde-fous (core/risk/gardeFous.js, euros), recopiée : ce module n'importe rien. */
export function eurosDits(x) {
  const v = Math.round(Number(x) * 100) / 100;
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })} €`;
}

/** « 0,39 % » : une part du capital en pour cent, deux décimales. */
export function partDite(f) {
  return `${(100 * (fini(f) ? f : 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

/** Le centime en dessous (jamais un centime au-dessus d'un plafond, T-M9) ; le bruit des flottants n'y entre pas. */
export function centimesEnDessous(x) {
  return Math.floor(Math.round(x * 1e6) / 1e4) / 100;
}

/**
 * LA PART DE MISE (l'identité avec le moteur) : min(k · ev / (cote − 1), s_max), jamais négative.
 * `ev` et `cote` sont ceux de la décision du moteur (staking.ev, 4 décimales ; staking.odds, la cote NETTE, 3 décimales) ;
 * `reglageMoteur` porte kellyFraction et maxStakePercent. `Number((partDeMise × base).toFixed(2))` = findValueBet(…).stake
 * sur la même base (T-M1, 10 000 cas). Entrées illisibles : 0.
 */
export function partDeMise({ ev, cote, reglageMoteur } = {}) {
  const k = reglageMoteur?.kellyFraction;
  const sMax = reglageMoteur?.maxStakePercent;
  if (!fini(ev) || !fini(cote) || !(cote > 1) || !fini(k) || !fini(sMax)) return 0;
  const kelly = (k * ev) / (cote - 1);
  return Math.max(0, Math.min(kelly, sMax));
}

const raison = (code, avant, apres, texte) => ({ code, avant, apres, texte });

/**
 * LA FRACTION DE MISE (E0), dans l'ordre fixe du §1.7.
 * @param {object} p
 * @param {string|null} p.decision      l'action du moteur (RECOMMENDED, PASS, CIRCUIT_BREAKER_ACTIVE…)
 * @param {number} p.ev                  l'avantage contre la cote juste du marché
 * @param {number} p.cote                la cote NETTE
 * @param {object|null} p.livre          { cle, titre, francais } : le bookmaker du conseil
 * @param {string} p.nature              'simple' | 'combine' | 'combine-meme-match' | 'saisie'
 * @param {boolean} p.marcheAvecValue    faux pour un marché sans value mesurée (repli, sans cote, corners, tirs, cartons, joueurs)
 * @param {number[]} p.enAttenteDuMatch  les mises (€) des paris de Pierre EN ATTENTE sur ce match (combiné du même match compris)
 * @param {number[]} p.enAttenteDuJour   les mises (€) en attente du jour (seulement pour un plafond du jour réglé)
 * @param {object} p.reglageMoteur       { kellyFraction, maxStakePercent } du réglage en vigueur
 * @param {object} p.regle               REGLE_DE_MISE_V1 (francais : 'mention' | 'demi' | 'zero')
 * @param {object|null} p.gardeFous      { miseMaxParPari €, resteSemaine €, plafondDuJour (part) } — null : aucun
 * @param {object|null} p.compte         la fiche du compte : { miseMaxAcceptee €, soldeDeclare € }
 * @param {object|null} p.capital        { indique, montant: C_t, plusHaut: H_t }
 * @param {boolean} p.coupeCircuit       le coupe-circuit enclenché
 * @param {number|null} p.creuxDePierre  X € : « jamais plus bas que X € sous mon plus haut » ; null : rien
 * @returns {{ f: number, fKelly: number, euros: number|null, raisons: Array<{ code, avant, apres, texte }> }}
 */
export function fractionDeMise({
  decision = null,
  ev = null,
  cote = null,
  livre = null,
  nature = 'simple',
  marcheAvecValue = true,
  enAttenteDuMatch = [],
  enAttenteDuJour = [],
  reglageMoteur = null,
  regle = REGLE_DE_MISE_V1,
  gardeFous = null,
  compte = null,
  capital = null,
  coupeCircuit = false,
  creuxDePierre = null
} = {}) {
  const raisons = [];
  const C = capital?.indique && fini(capital.montant) && capital.montant > 0 ? capital.montant : null;
  const enEuros = (f) => (C === null ? null : Number((f * C).toFixed(2)));
  const sansMise = (code, texte) => {
    raisons.push(raison(code, 0, 0, texte));
    return { f: 0, fKelly: 0, euros: enEuros(0), raisons };
  };

  // (1) Pas de conseil, combiné, cote saisie, marché sans value : aucune mise (la value est la seule source de mise).
  if (decision === 'CIRCUIT_BREAKER_ACTIVE') return sansMise('coupe-circuit', 'coupe-circuit enclenché : relancez-le dans Réglages');
  if (decision !== 'RECOMMENDED') return sansMise('pas-de-conseil', 'le moteur ne conseille pas ce pari');
  if (nature === 'combine' || nature === 'combine-meme-match') return sansMise('combine', 'un combiné n’a jamais de mise conseillée');
  if (nature === 'saisie') return sansMise('cote-saisie', 'une cote saisie à la main n’a jamais de mise conseillée (value non mesurée)');
  if (!marcheAvecValue) return sansMise('sans-value', 'aucune value mesurée sur ce marché : aucune mise');

  // (2) Kelly fractionné, (3) le plafond du moteur.
  const k = reglageMoteur?.kellyFraction;
  const sMax = reglageMoteur?.maxStakePercent;
  if (!fini(ev) || !fini(cote) || !(cote > 1) || !fini(k) || !fini(sMax)) return sansMise('illisible', 'avantage, cote ou réglage du moteur illisible : aucune mise');
  const fKelly = Math.max(0, (k * ev) / (cote - 1));
  if (!(fKelly > 0)) return sansMise('sans-avantage', 'aucun avantage : aucune mise');
  let f = fKelly;
  if (f > sMax) {
    raisons.push(raison('plafond-du-moteur', f, sMax, `le plafond du moteur : ${partDite(sMax)} du capital par pari`));
    f = Math.max(0, sMax);
  }

  // (4) Le livre : un bookmaker français garde sa mise et porte la mention (défaut de Q-H) ; variantes « demi », « zéro ».
  if (livre?.francais) {
    const chez = `chez ${livre.titre ?? livre.cle ?? 'ce bookmaker'}`;
    if (regle?.francais === 'zero') {
      raisons.push(raison('livre-francais', f, 0, `${chez} : ${MENTION_FRANCAIS}, pas de mise`));
      f = 0;
    } else if (regle?.francais === 'demi') {
      raisons.push(raison('livre-francais', f, f / 2, `${chez} : ${MENTION_FRANCAIS}, mise réduite de moitié`));
      f /= 2;
    } else {
      raisons.push(raison('livre-francais', f, f, `${chez} : ${MENTION_FRANCAIS}`));
    }
  }

  // (5) Les paris liés du même match (E7, « la place qui reste ») : les paris PLACÉS ne sont jamais réduits ; le conseil
  // prend au plus ce qui reste sous la mise du meilleur pari du match (jamais plus que s_max).
  const attente = (enAttenteDuMatch ?? []).filter((m) => fini(m) && m > 0);
  if (attente.length) {
    if (C === null) {
      raisons.push(raison('attente-non-comptee', f, f, 'vos paris en attente ne sont pas comptés tant que votre capital n’est pas réglé'));
    } else {
      const parts = attente.map((m) => m / C);
      const somme = parts.reduce((s, x) => s + x, 0);
      const cap = Math.min(sMax, Math.max(f, ...parts));
      const place = Math.max(0, cap - somme);
      const apres = Math.min(f, place);
      if (apres < f) {
        raisons.push(
          raison(
            'lie-au-match',
            f,
            apres,
            apres > 0
              ? 'lié à votre pari en attente sur ce match : les deux ensemble ne dépassent pas la mise du meilleur'
              : 'lié à votre pari en attente sur ce match : la place est prise, vos paris sur ce match atteignent déjà la mise du meilleur'
          )
        );
        f = apres;
      }
    }
  }

  // (6) Le plafond du jour : seulement si Pierre en a réglé un (aucun défaut).
  if (C !== null && fini(gardeFous?.plafondDuJour) && gardeFous.plafondDuJour > 0) {
    const engage = (enAttenteDuJour ?? []).filter((m) => fini(m) && m > 0).reduce((s, m) => s + m / C, 0);
    const reste = Math.max(0, gardeFous.plafondDuJour - engage);
    if (f > reste) {
      raisons.push(raison('plafond-du-jour', f, reste, `votre plafond du jour : ${partDite(gardeFous.plafondDuJour)} du capital, déjà ${partDite(engage)} engagés`));
      f = reste;
    }
  }

  // (7) Les euros, puis le plus petit des plafonds en euros (chacun nommé), jamais un centime au-dessus.
  let euros = enEuros(f);
  const plafonds = [];
  if (fini(gardeFous?.miseMaxParPari)) plafonds.push({ code: 'mise-max', montant: gardeFous.miseMaxParPari, texte: (m) => `ramenée par : votre mise maximale par pari (${eurosDits(m)})` });
  if (fini(gardeFous?.resteSemaine)) plafonds.push({ code: 'perte-semaine', montant: Math.max(0, gardeFous.resteSemaine), texte: (m) => `ce qui reste avant votre perte maximale de la semaine (${eurosDits(m)})` });
  if (fini(compte?.miseMaxAcceptee)) plafonds.push({ code: 'mise-acceptee', montant: compte.miseMaxAcceptee, texte: (m) => `la mise maximale acceptée chez ce bookmaker (${eurosDits(m)})` });
  if (fini(compte?.soldeDeclare)) plafonds.push({ code: 'solde-declare', montant: Math.max(0, compte.soldeDeclare), texte: (m) => `le solde déclaré de ce compte (${eurosDits(m)})` });
  if (C !== null && fini(creuxDePierre) && creuxDePierre > 0) {
    const plusHaut = fini(capital?.plusHaut) ? Math.max(capital.plusHaut, C) : C;
    const reste = Math.max(0, C - (plusHaut - creuxDePierre));
    plafonds.push({ code: 'plancher', montant: reste, texte: (m) => `votre plancher : ${eurosDits(creuxDePierre)} sous votre plus haut, il reste ${eurosDits(m)}` });
  }
  if (C !== null) {
    const plusPetit = plafonds.reduce((m, p) => (!m || p.montant < m.montant ? p : m), null);
    if (plusPetit) {
      const borne = centimesEnDessous(plusPetit.montant);
      if (euros > borne) {
        const avant = f;
        euros = borne;
        f = borne / C;
        raisons.push(raison(plusPetit.code, avant, f, plusPetit.texte(borne)));
      }
    }
  } else if (plafonds.length) {
    raisons.push(raison('plafonds-sans-capital', f, f, 'vos plafonds en euros ne peuvent pas s’appliquer sans votre capital'));
  }

  // (8) Le coupe-circuit.
  if (coupeCircuit) {
    raisons.push(raison('coupe-circuit', f, 0, 'coupe-circuit enclenché : relancez-le dans Réglages'));
    f = 0;
    euros = enEuros(0);
  }
  return { f, fKelly, euros, raisons };
}

/**
 * E8 — LE KELLY JOINT EXACT sur une grille de scores (variante `lies-grille` : hors K au lot 1, T-M5 seulement).
 * argmax_{f ≥ 0} Σ_cases w · ln(1 + Σ_i f_i · R_i(case)), R_i = cote_i − 1 si la jambe i gagne sur la case, −1 sinon ;
 * puis f_i = k · f_joint_i, jamais plus que k · f_i simple (la couverture n'est pas exploitée).
 * `grille` : [{ w, … }] (poids de somme 1) ; `jambes` : [{ cote, gagne: (case) => booléen }]. Concave : montée de gradient
 * projetée, pas réduit de moitié tant que la croissance ne monte pas.
 * @returns {{ fJoint: number[], f: number[], simples: number[], probabilites: number[] }}
 */
export function kellyJointSurGrille(grille, jambes, k = 1) {
  const n = jambes.length;
  const cases = grille.filter((c) => c.w > 0).map((c) => ({ w: c.w, R: jambes.map((j) => (j.gagne(c) ? j.cote - 1 : -1)) }));
  const probabilites = jambes.map((_, i) => cases.reduce((s, c) => s + (c.R[i] > 0 ? c.w : 0), 0));
  const simples = jambes.map((j, i) => Math.max(0, (probabilites[i] * j.cote - 1) / (j.cote - 1)));
  const croissance = (f) => {
    let g = 0;
    for (const c of cases) {
      let r = 1;
      for (let i = 0; i < n; i++) r += f[i] * c.R[i];
      if (r <= 0) return -Infinity;
      g += c.w * Math.log(r);
    }
    return g;
  };
  const gradient = (f) => {
    const gr = new Array(n).fill(0);
    for (const c of cases) {
      let r = 1;
      for (let i = 0; i < n; i++) r += f[i] * c.R[i];
      for (let i = 0; i < n; i++) gr[i] += (c.w * c.R[i]) / r;
    }
    return gr;
  };
  let f = simples.map((s) => s / (2 * Math.max(1, n)));
  let g = croissance(f);
  let pas = 0.5;
  for (let it = 0; it < 20000 && pas > 1e-14; it++) {
    const gr = gradient(f);
    const candidat = f.map((v, i) => Math.max(0, v + pas * gr[i]));
    const gc = croissance(candidat);
    if (gc > g) {
      const gain = gc - g;
      f = candidat;
      g = gc;
      pas = Math.min(pas * 1.5, 4);
      if (gain < 1e-17) break;
    } else {
      pas /= 2;
    }
  }
  return { fJoint: f, f: f.map((v, i) => Math.min(k * v, k * simples[i])), simples, probabilites };
}

/**
 * La ZONE NORMALE DES SÉRIES quand plusieurs paris portent sur un même match (T-Z1 ; l'alerte « série hors zone » de
 * l'étape 11 tire chaque pari INDÉPENDAMMENT — gardeFous.js, seriesDePertes.js). `matchs` : des listes de probabilités
 * de gain, une liste par match, dans l'ordre des règlements. `joint` vrai : les paris d'un même match sont tirés ENSEMBLE
 * (corrélation +1 supposée, conception §1.5 : un seul tirage par match, chaque pari gagne si ce tirage est sous sa
 * probabilité) ; faux : un tirage par pari. `tirer` : un générateur SEMÉ ([0, 1[), fourni par l'appelant (jamais
 * Math.random ici). La zone = le centile `seuil` de la plus longue série de pertes, sur `tirages` carnets tirés.
 * @returns {{ jusqua: number, mediane: number, tirages: number }}
 */
export function zoneDesSeriesParMatch({ matchs = [], seuil = 0.95, tirages = 1000, tirer, joint = true } = {}) {
  if (typeof tirer !== 'function') throw new TypeError('zoneDesSeriesParMatch : un générateur semé « tirer » est exigé.');
  const plusLongues = [];
  for (let t = 0; t < tirages; t++) {
    let enCours = 0;
    let plusLongue = 0;
    for (const paris of matchs) {
      const u = joint ? tirer() : null;
      for (const p of paris) {
        const gagne = (joint ? u : tirer()) < p;
        enCours = gagne ? 0 : enCours + 1;
        if (enCours > plusLongue) plusLongue = enCours;
      }
    }
    plusLongues.push(plusLongue);
  }
  plusLongues.sort((a, b) => a - b);
  const quantile = (q) => plusLongues[Math.min(plusLongues.length - 1, Math.max(0, Math.ceil(q * plusLongues.length) - 1))];
  return { jusqua: quantile(seuil), mediane: quantile(0.5), tirages };
}
