/**
 * reglesDeSeuil.js — LE SEUIL DE VALUE PAR CLASSE (étape 38, lot 1a, 03-04/11/2026 ; conception §3).
 * -----------------------------------------------------------------------
 * Une règle se lit « classe de l'ancre → seuil (une bande fixe), ou aucune value », jamais par championnat, jamais
 * apprise par optimisation (s4). La classe : l'ancre (Pinnacle, palier 2, palier 3 ; repli et sans cote = aucune value,
 * déjà), l'accord (serré / dispersé), « à vérifier » (⇒ pas de conseil au lot 2, jamais un seuil), le livre (étranger
 * mesuré / non mesuré / français), la cote haute (le pari que la règle en service ferait est à une cote > 3).
 * configSousRegle rend la configuration du moteur avec SON edgeThresholdMin — jamais écrite dans engine-config.json
 * (T-X6) ; la décision reste celle de stakingDuMatch (verdictPari.js), inchangée.
 * Pur : ni horloge, ni hasard, ni base, ni fichier.
 * -----------------------------------------------------------------------
 */

import { REGLES_DE_SEUIL, LIVRES_FRANCAIS, SEUIL_EN_SERVICE, COTE_HAUTE, EMBOITEES } from './reglagesCombinaison.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * LA CLASSE DE SEUIL d'une ligne ou d'une décision : { ancre, accord, aVerifier, livre, coteHaute, coteHautePermutee }.
 * `ingredients` : { ancre, accord (1N2 : dispersion en part), aVerifier: { etat }, livre (clé du bookmaker du pari),
 * livresMesures (clés mesurées), coteDuPari, coteHautePermutee }.
 */
export function classeDeSeuil(ingredients = {}) {
  const livre = ingredients.livre ?? null;
  const mesures = new Set(ingredients.livresMesures ?? ['williamhill']);
  return {
    ancre: ['pinnacle', 'palier2', 'palier3', 'repli', 'sans-cote'].includes(ingredients.ancre) ? ingredients.ancre : 'sans-cote',
    accord: fini(ingredients.accord) && ingredients.accord > 0.03 ? 'disperse' : 'serre',
    aVerifier: ingredients.aVerifier?.etat === 'constat-rouge',
    livre: livre === null ? null : LIVRES_FRANCAIS.includes(livre) ? 'francais' : mesures.has(livre) ? 'etranger-mesure' : 'etranger-non-mesure',
    coteHaute: fini(ingredients.coteDuPari) && ingredients.coteDuPari > COTE_HAUTE,
    coteHautePermutee: Boolean(ingredients.coteHautePermutee),
    coteHautePermutee2: Boolean(ingredients.coteHautePermutee2)
  };
}

/**
 * LE SEUIL d'une classe sous une règle (identifiant de REGLES_DE_SEUIL) : une bande, ou null (« aucune value »). Repli
 * et sans cote : null (aucune value, comme aujourd'hui). Ordre : à vérifier, livre français, ancre, accord, cote haute.
 */
export function seuilDe(classe, regle = 'seuil-v1') {
  const r = REGLES_DE_SEUIL[regle];
  if (!r) throw new RangeError(`seuilDe : règle « ${String(regle)} » non déclarée.`);
  if (classe.ancre === 'repli' || classe.ancre === 'sans-cote') return null;
  const lu = (v) => (v === 'aucune' ? null : v);
  if (classe.aVerifier && r.aVerifier !== undefined) return lu(r.aVerifier);
  if (classe.livre === 'francais' && r.francais !== undefined) return lu(r.francais);
  let s = r.base;
  if (classe.ancre === 'pinnacle' && r.pinnacle !== undefined) s = lu(r.pinnacle);
  if (classe.ancre === 'palier2' && r.palier2 !== undefined) s = lu(r.palier2);
  if (classe.ancre === 'palier3' && r.palier3 !== undefined) s = lu(r.palier3);
  if (s !== null && classe.accord === 'disperse' && r.disperse !== undefined) s = lu(r.disperse);
  if (s !== null && classe.coteHaute && r.coteHaute !== undefined) s = Math.max(s, lu(r.coteHaute) ?? s);
  if (s !== null && classe.coteHautePermutee && r.coteHautePermutee !== undefined) s = Math.max(s, lu(r.coteHautePermutee) ?? s);
  if (s !== null && classe.coteHautePermutee2 && r.coteHautePermutee2 !== undefined) s = Math.max(s, lu(r.coteHautePermutee2) ?? s);
  return s;
}

/** La configuration du moteur sous une règle : { ...config, edgeThresholdMin } (copie), ou null (« aucune value »). */
export function configSousRegle(config, classe, regle = 'seuil-v1') {
  const s = seuilDe(classe, regle);
  if (s === null) return null;
  return { ...config, valueBookmakers: [...(config.valueBookmakers ?? [])], edgeThresholdMin: s };
}

/**
 * LA RÈGLE DES EMBOÎTÉES (scellée, T-B17) : parmi les variantes « retenu » d'une même classe, la plus proche de la règle en
 * service (|seuil − 2 %| le plus petit ; « aucune value » est la plus loin). Rend l'identifiant, ou null.
 */
export function choisirParmiLesEmboitees(retenues, { classe = 'pinnacle' } = {}) {
  const liste = (EMBOITEES[classe] ?? []).filter((id) => retenues.includes(id));
  if (!liste.length) return null;
  const distance = (id) => {
    const r = REGLES_DE_SEUIL[id];
    const v = classe === 'pinnacle' ? r.pinnacle : r.disperse;
    return v === 'aucune' ? Infinity : Math.abs(v - SEUIL_EN_SERVICE);
  };
  return [...liste].sort((a, b) => distance(a) - distance(b) || a.localeCompare(b))[0];
}
