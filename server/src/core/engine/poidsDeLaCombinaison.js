/**
 * poidsDeLaCombinaison.js — LES POIDS (β) DE LA COMBINAISON DANS LE MOTEUR (étape 38 du plan, lot 2a).
 * -----------------------------------------------------------------------
 * RECOPIÉ PAR SCRIPT (server/scripts/etape38.mjs --recopier-moteur, depuis la note du banc
 * data/combinaison/noteDeLaCombinaison.js), jamais retapé à la main : l’essai T-L2-2 (combinaisonLot2.test.mjs) refait ce
 * texte à l’octet. Un β par famille et par signal ; 0 = le marché exactement (combiner.js est alors à l’identité).
 * `verdicts` : ce que le banc a dit de chaque variante qui porterait un poids (aucune n’est « retenu »).
 * DANS l’empreinte du moteur : changer un poids crée une version. Pur : ne lit rien.
 * -----------------------------------------------------------------------
 */

/** Gèle un objet et tout ce qu’il contient. */
const gele = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) gele(v);
  }
  return o;
};

/** Les poids de la combinaison, par famille de marchés et par signal. */
export const POIDS_DE_LA_COMBINAISON = gele({"version":1,"source":{"note":"server/src/data/combinaison/noteDeLaCombinaison.js","banc":"38.1","calculeLe":"2026-11-04","sortie":"ccdab114620f6dd26637db3a0175861dfba63771","regles":"164cfd292d55ecdc6af9815bab98cc8bb5a786ac"},"verdicts":{"1n2-recalage-marche":"pas-prouve","1n2-stats-residuel":"pas-prouve","horloge-j2":"pas-prouve","poids-par-regime":"non-jugeable-ici","poids-par-championnat":"pas-prouve","compo-avant-cote":"non-jugeable-ici","plusmoins25-recalage-marche":"pas-prouve","recalage-dixiemes":"non-jugeable-ici","ancre-gratuite":"non-jugeable-ici","saisies-ancre":"non-jugeable-ici","repos-court-residuel":"non-jugeable-ici","enchainement-residuel":"non-jugeable-ici"},"familles":{"1n2":{"statistiques":0},"buts":{"statistiques":0},"corners":{},"tirs":{},"cadres":{},"cartons":{},"joueurs":{}}});
