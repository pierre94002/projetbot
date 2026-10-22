/**
 * carteOuParier.js — ce que l'écran dit de la carte « OÙ PARIER » (étape 23 du plan, 22/10/2026).
 * -----------------------------------------------------------------------
 * JavaScript pur (ni Vue ni navigateur) : les tests du serveur le rejouent
 * (server/test/carteOuParierEcran.test.mjs). Rien n'y est jugé : la couleur,
 * la raison et la phrase de chaque case viennent du serveur
 * (server/src/data/bettingMap.js) ; ici, on les met en mots courts, en
 * classes et en grille. Une case se lit SANS la couleur : un mot et une
 * icône, la phrase complète au survol et pour les lecteurs d'écran.
 * -----------------------------------------------------------------------
 */

/** Le mot court et l'icône de chaque raison ; `ton` : la classe de couleur (le vert seulement « Prouvé »). */
export const DIT = Object.freeze({
  prouve: Object.freeze({ mot: 'Prouvé', icone: 'check', ton: 'vert' }),
  'moins-bon': Object.freeze({ mot: 'Moins bien que le marché', court: 'Moins bien', icone: 'alert', ton: 'rouge' }),
  'pas-prouve': Object.freeze({ mot: 'Pas prouvé', icone: 'minus', ton: 'gris' }),
  'trop-peu': Object.freeze({ mot: 'Trop peu de matchs', court: 'Trop peu', icone: 'minus', ton: 'gris' }),
  contradictoire: Object.freeze({ mot: 'Contradictoire', icone: 'minus', ton: 'gris' }),
  'pas-mesuree': Object.freeze({ mot: 'Pas encore mesurée', court: 'Pas mesurée', icone: 'minus', ton: 'gris' }),
  'sans-cote': Object.freeze({ mot: 'Pas de cote archivée', court: 'Pas de cote', icone: 'x', ton: 'hachure' }),
  perimee: Object.freeze({ mot: 'Carte d’un autre moteur', court: 'Suspendue', icone: 'clock', ton: 'gris' })
});
const MINIMUM = 200;
const fr = (n) => Number(n).toLocaleString('fr-FR');

/** Le dire d'une case (raison inconnue : « Pas prouvé », jamais une couleur). */
export function ditDeLaCase(c) {
  const d = DIT[c?.raison] ?? DIT['pas-prouve'];
  // Une case n'est verte QUE si le serveur l'a dite « prouvé » ET verte ; rouge que si « moins bon » ET rouge.
  const ton = d.ton === 'vert' && c?.couleur !== 'vert' ? 'gris' : d.ton === 'rouge' && c?.couleur !== 'rouge' ? 'gris' : d.ton;
  return { ...d, ton };
}

/** Le texte court d'une case dans la grille : « Prouvé · 412 matchs », « Trop peu · 46 / 200 », « Pas de cote ». */
export function texteCourt(c) {
  const d = ditDeLaCase(c);
  const court = d.court ?? d.mot;
  const n = Number.isFinite(c?.matchs) ? c.matchs : null;
  if (c?.raison === 'trop-peu') return `${court} · ${fr(n ?? 0)} / ${fr(MINIMUM)}`;
  if (n !== null && n > 0 && c?.raison !== 'sans-cote' && c?.raison !== 'pas-mesuree') return `${court} · ${fr(n)} ${n > 1 ? 'matchs' : 'match'}`;
  return court;
}

/** L'écart de la case (« −9,5 % ») : celui de l'épreuve qui la colore, sinon de la plus fournie ; null sans chiffre. */
export function ecartDeLaCase(c) {
  const ep = Array.isArray(c?.epreuves) ? c.epreuves : [];
  const e =
    (c?.couleur === 'vert' && ep.find((x) => x.verdict === 'retenu' && x.id !== 'H-PL')) ||
    (c?.couleur === 'rouge' && ep.find((x) => x.verdict === 'moins-bon')) ||
    [...ep].sort((a, b) => (b.matchs ?? 0) - (a.matchs ?? 0))[0];
  const g = e?.enPourcent?.gain;
  if (!Number.isFinite(g)) return null;
  const s = Math.abs(g).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${g > 0 ? '+' : g < 0 ? '−' : '+'}${s} %`;
}

/** Les informations d'une case, en phrases (jamais une couleur) : repère, 2023-2024, vos paris, épreuves non tranchées. */
export function infosDeLaCase(c) {
  const lignes = [];
  const i = c?.infos ?? {};
  if (i.repere?.cases) {
    if (i.repere.retenu) lignes.push(`Le moteur bat la moyenne du championnat sur ${i.repere.retenu} ligne${i.repere.retenu > 1 ? 's' : ''} sur ${i.repere.cases} (${i.repere.periode}) — ce n’est pas un avantage contre le bookmaker.`);
    if (i.repere.moinsBon) lignes.push(`Le moteur fait moins bien que la moyenne du championnat sur ${i.repere.moinsBon} ligne${i.repere.moinsBon > 1 ? 's' : ''} sur ${i.repere.cases} (${i.repere.periode}).`);
  }
  if (i.indicatif) lignes.push(`Indicatif ${i.indicatif.periode} (période déjà regardée) : ${i.indicatif.verdict === 'moins-bon' ? 'moins bien que le marché' : i.indicatif.verdict === 'retenu' ? 'mieux que le marché' : 'pas prouvé'}, ${fr(i.indicatif.matchs ?? 0)} matchs.`);
  if (i.parisIndicatifs) lignes.push(`Paris simulés ${i.parisIndicatifs.periode} (indicatif) : ${fr(i.parisIndicatifs.matchs ?? 0)} matchs.`);
  if (i.vosParis?.paris) {
    const vp = i.vosParis;
    const vc = Number.isFinite(vp.valeurCloture) ? `, valeur de clôture moyenne ${vp.valeurCloture > 0 ? '+' : ''}${vp.valeurCloture.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % (${vp.mesures})` : '';
    const rd = Number.isFinite(vp.rendement) ? `, rendement ${vp.rendement > 0 ? '+' : ''}${vp.rendement.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : '';
    lignes.push(`Vos paris : ${vp.paris}${rd}${vc} — pour information, ils ne décident jamais de la couleur.`);
  }
  return lignes;
}

/**
 * LA GRILLE : championnats en lignes, colonnes du groupe choisi. `favori(league)` : vrai pour un championnat favori
 * (en tête) ; `seulementJugees` : les championnats qui ont au moins une case jugée (verte, rouge, pas prouvé,
 * contradictoire). Rend { colonnes, lignes, sommes, total }. Les sommes (Σ) comptent chaque couleur par colonne.
 */
export function grilleDeLaCarte(reponse, { groupe = 'buts', seulementJugees = false, favori = () => false } = {}) {
  const contenu = reponse?.carte?.contenu;
  if (!contenu) return null;
  const colonnes = (reponse.colonnes ?? []).filter((c) => !groupe || c.groupe === groupe);
  const index = new Map((contenu.cases ?? []).map((k) => [`${k.league}|${k.colonne}`, k]));
  const jugee = (k) => ['prouve', 'moins-bon', 'pas-prouve', 'contradictoire'].includes(k?.raison);
  let championnats = [...(contenu.championnats ?? [])];
  if (seulementJugees) championnats = championnats.filter((ch) => (contenu.cases ?? []).some((k) => k.league === ch.league && jugee(k)));
  const aUneCaseJugee = (ch) => (contenu.cases ?? []).some((k) => k.league === ch.league && jugee(k));
  championnats.sort((a, b) => Number(favori(b.league)) - Number(favori(a.league)) || Number(aUneCaseJugee(b)) - Number(aUneCaseJugee(a)) || a.nom.localeCompare(b.nom, 'fr'));
  const lignes = championnats.map((ch) => ({ ...ch, favori: Boolean(favori(ch.league)), cases: colonnes.map((col) => index.get(`${ch.league}|${col.id}`) ?? null) }));
  const sommes = colonnes.map((col, i) => {
    const s = { vert: 0, rouge: 0, gris: 0 };
    for (const l of lignes) {
      const k = l.cases[i];
      if (k) s[k.couleur === 'vert' ? 'vert' : k.couleur === 'rouge' ? 'rouge' : 'gris']++;
    }
    return s;
  });
  return { colonnes, lignes, sommes, total: lignes.length * colonnes.length };
}

const pluriel = (n, un, plusieurs) => `${fr(n)} ${n > 1 ? plusieurs : un}`;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const moisDit = (mois) => (typeof mois === 'string' && /^\d{4}-\d{2}$/.test(mois) ? `${MOIS[Number(mois.slice(5, 7)) - 1]} ${mois.slice(0, 4)}` : '');

/** Le bandeau de la carte : { titre, phrase, comptes } — ou l'état sans carte (« pas encore mesuré »). */
export function bandeauDeLaCarte(reponse) {
  const c = reponse?.carte;
  if (!c) return { titre: reponse?.etat === 'en-attente' ? 'Carte en préparation' : 'Pas encore mesuré', phrase: reponse?.phrase ?? 'La carte n’est pas encore calculée.', comptes: null };
  const r = c.resume ?? {};
  const titre = `Carte de ${moisDit(c.mois)} : ${pluriel(r.vertes ?? 0, 'case verte', 'cases vertes')}, ${pluriel(r.rouges ?? 0, 'rouge', 'rouges')}, ${pluriel(r.grises ?? 0, 'grise', 'grises')} (Σ ${fr(r.cases ?? 0)})`;
  const g = r.plusGrosseCaseDuDirect;
  const morceaux = [];
  if (!r.vertes) morceaux.push('Rien n’est prouvé gagnant aujourd’hui : c’est une information, pas une panne.');
  morceaux.push(`Il faut au moins ${fr(reponse.minimum ?? MINIMUM)} matchs dans une case pour juger${g ? ` ; la plus remplie en direct en a ${fr(g.matchs)}` : ''}.`);
  if (reponse.etat === 'perimee' && reponse.phrase) morceaux.push(reponse.phrase);
  return { titre, phrase: morceaux.join(' '), comptes: { vertes: r.vertes ?? 0, rouges: r.rouges ?? 0, grises: r.grises ?? 0, cases: r.cases ?? 0 } };
}

/** La provenance de la carte, en une ligne : le banc lu, la période, le direct, le juge. */
export function provenanceDeLaCarte(reponse) {
  const c = reponse?.carte;
  if (!c) return '';
  const b = c.banc ?? {};
  const banc =
    b.etiquette === 'exact' ? `banc d’essai n° ${b.id} (2019-2023)` : b.etiquette === 'code-precedent' ? `banc d’essai n° ${b.id} (2019-2023, version de code précédente du moteur)` : b.etiquette === 'k-insuffisant' ? `banc d’essai n° ${b.id} : à relancer` : 'sans banc d’essai';
  const d = c.resume?.direct ?? {};
  return `${banc} · direct : ${pluriel(d.mesures ?? 0, 'pronostic mesuré', 'pronostics mesurés')} sur ${fr(d.pronostics ?? 0)} gelés · juge de l’étape 16 : ${pluriel(c.kVivant ?? 0, 'case jugée', 'cases jugées')} × ${fr(c.regards ?? 0)} regards · calculée le ${new Date(c.calculeLe).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}`;
}

/** Les championnats hors de l'appli, avec ce que la carte en dit (« À ajouter », « À éviter », « Rien de prouvé »). */
export function championnatsAAjouter(reponse) {
  return (reponse?.carte?.contenu?.aAjouter ?? []).map((x) => ({ ...x, ton: x.statut === 'a-ajouter' ? 'vert' : x.statut === 'a-eviter' ? 'rouge' : 'gris' }));
}
