/**
 * Étape 27 du plan — LE MODÈLE DE BUTS UNIQUE : la cohérence (conception §5.2, contrôles C1 à C12).
 *   node --test test/modeleDeButs.test.mjs        (depuis server/)
 *
 * Dans une COPIE ISOLÉE de la base d'essai (isolement.mjs : réseau coupé, heure figée), script
 * test/aides/script-modele-de-buts.mjs : la table du jour J, des cotes plus/moins 2,5 plantées (moyenne
 * football-data, livres ESPN avec un relevé en direct absurde, Smarkets seul), les forces de buts calculées par
 * l'étape de nuit, puis les ~200 matchs de pronostics-figes analysés avec la version en service ET avec la
 * candidate (la clé `modeleDeButs`). Le script recalcule tout à pleine précision à côté (une grille Poisson ×
 * Dixon-Coles écrite à part, le mélange refait à la main, l'état des clubs par le second chemin) et rend, pour
 * chaque contrôle, le nombre de cas, l'écart le plus grand et les premiers cas fautifs ; ce test les juge.
 *
 *   C1 sommes à 1 et bornes · C2 l'équilibre du 1N2 (le 1N2 du moteur reste le marché) · C3 le total par le
 *   plus/moins, le mélange et la grille finale · C4 monotonie des lignes · C5 bornes entre marchés, une seule
 *   grille · C6 le combiné aligné · C7 le score · C8 ρ de la clé · C9 la provenance · C10 la grille 0-20 et les
 *   81 cases (E1) · C11 le démarrage à froid (E6) · C12 la table relue = l'accumulateur = le second chemin ;
 *   le Simulateur (xG saisis) garde le chemin d'avant ; des réglages fautifs sont refusés.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR, MANIFESTE_ECHANTILLON } from './aides/isolement.mjs';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-modele-de-buts.mjs');

let memo = null;
/** Le calcul (une fois pour tous les tests du fichier). */
function coherence() {
  if (memo) return memo;
  const copie = preparerCopie();
  try {
    const r = executer(copie, SCRIPT, { args: [MANIFESTE_ECHANTILLON, 'coherence'], timeout: 300_000 });
    assert.equal(r.code, 0, `le calcul a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-2000)}`);
    assert.ok(r.json?.ok, `sortie illisible :\n${r.sortie.slice(-2000)}`);
    assert.equal(r.reseau, false, 'aucun appel réseau');
    memo = r.json;
    return memo;
  } finally {
    copie.nettoyer();
  }
}

/** Chaque contrôle nommé : au moins un cas, aucun hors de sa tolérance. */
function sansFaute(s, ...noms) {
  for (const nom of noms) {
    const c = s.controles[nom];
    assert.ok(c, `contrôle « ${nom} » absent de la sortie`);
    assert.ok(c.n > 0, `${nom} : aucun cas contrôlé`);
    assert.equal(c.fautes, 0, `${nom} : ${c.fautes} cas sur ${c.n} hors de la tolérance ${c.tolerance} (écart max ${c.max}) — ${JSON.stringify(c.exemples)}`);
  }
}

test('préparation : forces de buts calculées par l’étape de nuit (premier calcul, contrôle anti-fuite 40 couples, 0 écart) ; les ~200 cibles analysées ; tous les régimes, les deux ancrages et les trois cas du démarrage à froid représentés', () => {
  const s = coherence();
  assert.equal(s.maintenant, '2026-10-05T12:00:00.000Z', 'heure figée');
  assert.equal(s.nuit.mode, 'premier');
  assert.equal(s.nuit.erreur, null);
  assert.ok(s.nuit.ecrites > 1000 && s.nuit.ecrites === s.nuit.lignes, JSON.stringify(s.nuit));
  assert.deepEqual(s.nuit.controle, { lignes: 40, ecarts: 0 });
  assert.ok(s.cibles.total >= 190 && s.cibles.avecCotes >= 100 && s.cibles.sansCotes >= 20, JSON.stringify(s.cibles));
  assert.ok(s.plantes.fd >= 20 && s.plantes.espn >= 20 && s.plantes.smarkets >= 20, JSON.stringify(s.plantes));
  for (const code of ['cotes-plusmoins-xg', 'cotes-plusmoins-buts', 'cotes-1n2-xg', 'cotes-1n2-buts', 'xg-seuls', 'buts-seuls']) assert.ok(s.regimes[code] > 0, `régime ${code} absent : ${JSON.stringify(s.regimes)}`);
  assert.ok(s.methodes['total-equilibre'] > 0 && s.methodes['1N2-seul'] > 0, JSON.stringify(s.methodes));
  assert.ok(s.demarrages.zero > 0 && s.demarrages.entre > 0 && s.demarrages.huitEtPlus > 0, JSON.stringify(s.demarrages));
});

test('concordance : le moteur (analyzeMatch avec la clé) rend exactement le modèle recalculé à côté — buts attendus, distributions de buts, 81 cases et « autre score », provenance ; la référence 1N2 est celle du moteur', () => {
  sansFaute(coherence(), 'concordance.buts', 'concordance.distributions', 'concordance.provenance', 'concordance.reference');
});

test('C1 : chaque marché somme à 1 à 1e−9 (1N2, combiné à chaque ligne), la grille de 441 cases aussi, les 81 cases + « autre score » aussi ; au moteur à l’arrondi près ; λ et μ dans [0,2 ; 6], plafond et plancher atteints sur des forces extrêmes ; grille à 1 même à λ = μ = 6', () => {
  sansFaute(coherence(), 'C1.1n2', 'C1.combine', 'C1.grille441', 'C1.cases81', 'C1.moteur', 'C1.bornes', 'C1.bornesPlantees', 'C1.grillePlantee');
});

test('C2 : sur la part du marché, H/(H+A) de la grille = pH/(pH+pA) à 1e−9 (et H = pH, A = pA sans plus/moins) ; le 1N2 du moteur reste le marché, identique clé éteinte ou allumée ; sans cote, le 1N2 du modèle tempéré d’avant', () => {
  sansFaute(coherence(), 'C2.equilibre', 'C2.1n2seul', 'C2.moteur1n2', 'C2.sansCote');
});

test('C3 : avec un plus/moins, P(total > 2,5) de la part du marché = la cote juste à 1e−9 ; le mélange (log, total et écart à part, borné) refait à la main ; la grille finale = celle de λ, μ mélangés à 1e−12', () => {
  sansFaute(coherence(), 'C3.total', 'C3.methode', 'C3.melange', 'C3.grilleFinale');
});

test('C4 : monotonie des lignes — P(+0,5) > P(+1,5) > P(+2,5) > P(+3,5), au total et par équipe (et au moteur)', () => {
  sansFaute(coherence(), 'C4.total', 'C4.equipes', 'C4.moteur');
});

test('C5 : buts d’une équipe ≤ total, les deux marquent ≤ plus de 1,5 et ≥ la borne de Fréchet ; tous les marchés tirés de LA grille qui donne le total (1e−12)', () => {
  sansFaute(coherence(), 'C5.bornes', 'C5.bornesMoteur', 'C5.memeGrille');
});

test('C6 : le combiné résultat + total reste aligné sur le 1N2 final (chaque issue garde la répartition des buts de la grille)', () => {
  sansFaute(coherence(), 'C6.alignement', 'C6.concordance');
});

test('C7 : le score le plus probable est la case maximale de la grille ; ses buts attendus sont ceux du résultat ; issues, « autre score » et provenance de la même grille ; plus d’effet de forme', () => {
  sansFaute(coherence(), 'C7.plusProbable', 'C7.buts', 'C7.issues');
});

test('C8 : ρ vient de la clé — à −0,20, la case 1-1 suit τ(1,1) = 1 − ρ (rapportée à la case 2-2) ; `defaultCorrelation` sans effet sur les buts quand la clé existe', () => {
  sansFaute(coherence(), 'C8.rhoDeLaCle', 'C8.tau11', 'C8.defaultCorrelation');
});

test('C9 : la provenance suit les entrées — sans plus/moins jamais « plusmoins » (Smarkets seul : aucun), le plus/moins planté lu (clôture ESPN 5 min avant, jamais le direct), sans xG « buts », sans cote « seuls », clubs inconnus « moyennes-seules » ; les distributions gelées la portent sur les marchés de buts avec la clé, jamais sans', () => {
  sansFaute(coherence(), 'C9.provenance', 'C9.smarketsSeul', 'C9.planteLu', 'C9.espnCloture', 'C9.clubsInconnus', 'C9.provenanceGel');
});

test('C10 (E1) : λ = 5, μ = 0,6 — la grille 0-20 = les sommes fermées à 1e−6 ; masse hors 0-20 sous 1e−5 à λ = μ = 6 ; les 81 cases rendues = les cases 0-8 de la grille 0-20, jamais renormalisées', () => {
  sansFaute(coherence(), 'C10.ferme', 'C10.masseHors', 'C10.grilleDeCalcul', 'C10.cases', 'C10.horsGrille', 'C10.horsGrilleSensible');
});

test('C11 (E6) : sans match connu, le total statistique = celui du championnat ; à 8 matchs et plus, inchangé à l’octet ; entre deux, la part mesurée ; l’écart entre les équipes jamais touché', () => {
  sansFaute(coherence(), 'C11.zero', 'C11.entre', 'C11.huit', 'C11.ecart', 'C11.pur');
});

test('C12 : la table rangée, relue par le lecteur du moteur, redonne l’accumulateur et le second chemin (SQL, date < J) à 1e−12 ; les moyennes du championnat aussi', () => {
  sansFaute(coherence(), 'C12.accumulateur', 'C12.secondChemin', 'C12.ligue');
});

test('Simulateur libre (xG saisis à la main, Opta ou StatsBomb) : le chemin d’avant, à l’octet, même avec la clé', () => {
  sansFaute(coherence(), 'simulateur');
});

test('réglages : la clé absente ou nulle = le chemin d’avant ; une clé fautive (clé inconnue, version, ρ, bornes, ancrage, mélange, démarrage) est refusée ; l’empreinte des forces ignore ce qui s’applique à la lecture', () => {
  const r = coherence().reglages;
  assert.equal(r.nulle, true);
  assert.equal(r.valides, true);
  for (const [quoi, refuse] of Object.entries(r.refus)) assert.equal(refuse, true, `réglage fautif accepté : ${quoi}`);
  assert.equal(r.empreinteDesForces, 'v1|35|25|remise-a-zero');
  assert.equal(r.empreinteSansPrior, r.empreinteDesForces, 'prior, poidsXg et statistique s’appliquent à la lecture : mêmes sommes');
});
