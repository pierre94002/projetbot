/**
 * Les règles du langage visuel des paris (étape 6 du plan) — fonctions pures, SANS base, réseau ni navigateur.
 *   node --test test/langageParis.test.mjs        (depuis server/)
 *
 * ui/src/utils/langageParis.js décide ce que les sept composants communs dessinent
 * (ValueBadge, ConfidenceGauge, OddsMoveArrow, LineupStateBadge, KickoffCountdown,
 * ProvenanceChip, HelpTip) : ici on rejoue ces décisions, cas par cas.
 *
 *  1. LA RÈGLE DU VERT, comparée au moteur : sur des centaines de lignes de bookmaker tirées
 *     au sort, « value » (vert) ⇔ findValueBet recommande ce pari, et chaque raison d'écart du
 *     moteur (cote trop haute, avantage invraisemblable, sous le seuil) a la sienne côté écran ;
 *     jamais de vert pour une cote de référence, un bookmaker non coché, des seuils inconnus.
 *  2. La confiance : sans valeur (ou valeur impossible), « pas encore mesurée » — jamais un faux niveau.
 *  3. Le mouvement d'une cote, l'état d'une composition, le compte à rebours, la provenance.
 *  4. Le guide de lecture : les sept phrases (« à rafraîchir » depuis l'étape 7, « juge et partie » depuis l'étape 8), et chaque « ? » posé dans l'interface en a une.
 *  5. La bulle d'aide : le comportement au clavier, sans navigateur.
 * Les valeurs attendues sont écrites à la main, jamais recopiées de la sortie du code testé.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVEUR } from './aides/isolement.mjs';
import { estJouable, coteJouable, findValueBet } from '../src/core/engine/valueFinder.js';
import { DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../src/core/engine/engineConfig.js';

const UI_SRC = path.resolve(SERVEUR, '..', 'ui', 'src');
const fichierRegles = path.join(UI_SRC, 'utils', 'langageParis.js');
const pret = fs.existsSync(fichierRegles);
const options = { skip: pret ? false : 'ui/src/utils/langageParis.js manque' };
const L = pret
  ? await import(pathToFileURL(fichierRegles).href)
  : {};

const CONFIG = DEFAULT_ENGINE_CONFIG_BY_SPORT.football;
/** Les seuils tels que l'écran les lit sur /api/config : min et max en %, cote maximale. */
const REGLE = { min: CONFIG.edgeThresholdMin * 100, max: CONFIG.edgeThresholdMax * 100, coteMax: CONFIG.maxValueOdds };
const ligne = (key, odds1, oddsDraw, odds2, extra = {}) => ({ key, title: key, odds1, oddsDraw, odds2, ...extra });

// Un tirage reproductible : mêmes cas à chaque passage.
function generateur(graine) {
  let s = graine >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// ------------------------------------------------ 1. la règle du vert

const ISSUES = [
  { outcome: 'home', champ: 'odds1', index: 0 },
  { outcome: 'draw', champ: 'oddsDraw', index: 1 },
  { outcome: 'away', champ: 'odds2', index: 2 }
];
const CORRESPONDANCE = { cote_trop_haute: ['cote-haute'], avantage_invraisemblable: ['trop-beau'], sous_le_seuil: ['sous-seuil', 'sans-value'] };

/** Ce que l'écran dirait de chaque issue d'une ligne, avec ce que le serveur lui donne (cote nette, estJouable). */
function lectureDeLEcran(l, fair, config) {
  const jouable = estJouable(l, config);
  return ISSUES.map(({ champ, index }) => {
    const cote = coteJouable(l, champ);
    return L.etatValue({ pourcent: (fair[index] * cote - 1) * 100, jouable, cote, regle: REGLE });
  });
}

test('la règle du vert = la règle du moteur : 900 lignes de bookmaker tirées au sort, pari recommandé ⇔ value, raison par raison', options, () => {
  const hasard = generateur(20261006);
  const natures = [
    { cle: 'williamhill', attendu: 'jouable' }, // coché dans Réglages
    { cle: 'unibet_nl', attendu: 'jouable' },
    { cle: 'betclic', attendu: 'non-coche' }, // pas dans valueBookmakers
    { cle: 'williamhill', attendu: 'reference', extra: { referenceOnly: true } } // cote gratuite de référence
  ];
  const vus = { recommande: 0, passe: 0, verts: 0, parRaison: {} };
  for (let i = 0; i < 900; i++) {
    const nature = natures[i % natures.length];
    // Des probabilités justes quelconques, une marge de 2 à 9 %, du bruit propre à chaque issue.
    const brut = [0.15 + hasard() * 0.6, 0.1 + hasard() * 0.3, 0.1 + hasard() * 0.5];
    const somme = brut[0] + brut[1] + brut[2];
    const fair = brut.map((p) => p / somme);
    const marge = 1.02 + hasard() * 0.07;
    const implicites = fair.map((p) => p * marge * (0.94 + hasard() * 0.12));
    // Une fois sur deux, un bookmaker généreux sur UNE issue (avantage visé de 1 à 61 %), qui reprend sa marge sur les autres.
    if (hasard() < 0.5) {
      const k = Math.floor(hasard() * 3);
      implicites[k] = fair[k] / (1 + 0.01 + hasard() * 0.6);
      const autres = implicites.reduce((s, x, j) => (j === k ? s : s + x), 0);
      if (implicites[k] + autres < 1.005) {
        const reste = (1.005 - implicites[k]) / autres;
        implicites.forEach((x, j) => {
          if (j !== k) implicites[j] = x * reste;
        });
      }
    }
    const cotes = implicites.map((x) => 1 / x);
    const l = ligne(nature.cle, ...cotes.map((c) => Number(Math.max(1.05, c).toFixed(2))), nature.extra);
    const moteur = findValueBet({ byBookmaker: [l], fair, referenceKeys: [], config: CONFIG, bankroll: 10000 });
    const ecran = lectureDeLEcran(l, fair, CONFIG);
    const verts = ecran.filter((e) => e.vert);

    // Jamais de vert pour ce qui n'est pas à vous.
    if (nature.attendu !== 'jouable') assert.equal(verts.length, 0, `${nature.cle} ${nature.attendu} : vert interdit (cas ${i})`);
    // Le moteur recommande ⇔ l'écran a une value ; et c'est la même issue, au même avantage.
    assert.equal(moteur.action === 'RECOMMENDED', verts.length > 0, `cas ${i} : ${moteur.action}/${moteur.reason} contre ${ecran.map((e) => e.etat).join(',')}`);
    if (moteur.action === 'RECOMMENDED') {
      const k = ISSUES.findIndex((x) => x.outcome === moteur.outcome);
      assert.equal(ecran[k].etat, 'value');
      const meilleur = Math.max(...ecran.map((e, j) => (e.vert ? (fair[j] * coteJouable(l, ISSUES[j].champ) - 1) * 100 : -Infinity)));
      // Le moteur arrondit son avantage à 4 décimales (0,01 point de pourcentage).
      assert.ok(Math.abs(meilleur - moteur.ev * 100) <= 0.0051, `cas ${i} : le moteur retient l'issue à l'avantage le plus fort`);
      vus.recommande++;
    } else {
      vus.passe++;
    }
    vus.verts += verts.length;
    // Chaque raison d'écart du moteur a sa lecture côté écran.
    for (const c of moteur.candidates ?? []) {
      const k = ISSUES.findIndex((x) => x.outcome === c.outcome);
      const attendu = c.exclusion === null ? ['value'] : CORRESPONDANCE[c.exclusion];
      assert.ok(attendu.includes(ecran[k].etat), `cas ${i} issue ${c.outcome} : le moteur dit ${c.exclusion}, l'écran ${ecran[k].etat}`);
      vus.parRaison[c.exclusion ?? 'value'] = (vus.parRaison[c.exclusion ?? 'value'] ?? 0) + 1;
    }
  }
  // Le tirage couvre bien tous les cas (sinon la comparaison ne prouverait rien).
  assert.ok(vus.recommande >= 60 && vus.passe >= 60, `recommandés ${vus.recommande}, écartés ${vus.passe}`);
  for (const raison of ['value', 'sous_le_seuil', 'cote_trop_haute', 'avantage_invraisemblable']) {
    assert.ok((vus.parRaison[raison] ?? 0) >= 20, `raison « ${raison} » vue ${vus.parRaison[raison] ?? 0} fois`);
  }
});

test('la règle du vert : cas à la limite, un par un (seuil, maximum, cote maximale, signe)', options, () => {
  const e = (pourcent, cote = 2.5, extra = {}) => L.etatValue({ pourcent, jouable: true, cote, regle: REGLE, ...extra });
  assert.equal(e(2.1).etat, 'value');
  assert.equal(e(2.0).etat, 'sous-seuil', 'pile le seuil : pas assez (le moteur exige « au-dessus »)');
  assert.equal(e(0.4).etat, 'sous-seuil');
  assert.equal(e(0).etat, 'sans-value');
  assert.equal(e(-3.2).etat, 'sans-value');
  assert.equal(e(25).etat, 'value', 'le maximum est accepté');
  assert.equal(e(25.1).etat, 'trop-beau');
  assert.equal(e(10, 5).etat, 'value', 'la cote maximale est acceptée');
  assert.equal(e(10, 5.01).etat, 'cote-haute');
  assert.equal(e(40, 5.01).etat, 'cote-haute', 'cote trop haute avant avantage invraisemblable, comme findValueBet');
  assert.equal(e(10, null).etat, 'inconnue', 'sans cote, impossible de vérifier la cote maximale : jamais de vert');
  // La raison s'écrit pour de vrai, avec les chiffres.
  assert.match(e(4.1).raison, /^Value : avantage de \+4,1 % chez l'un de vos bookmakers, au-dessus du seuil de 2 % du moteur\.$/);
  assert.match(e(0.4).raison, /sous le seuil de 2 %/);
  assert.match(e(25.1).raison, /au-delà du maximum de 25 %/);
  assert.match(e(10, 5.01).raison, /dépasse la cote maximale de 5/);
});

test('jamais de vert : cote de référence, bookmaker qui n\'est pas à vous, seuils inconnus, avantage absent — toutes les combinaisons', options, () => {
  const pourcents = [null, undefined, Number.NaN, -5, 0, 1.9, 2, 2.1, 10, 25, 25.1, 80];
  const cotes = [null, 1.5, 5, 5.01];
  const regles = [null, undefined, {}, { min: 2 }, { min: 2, max: 25 }, { min: 2, max: 25, coteMax: Number.NaN }, REGLE];
  let verts = 0;
  let combinaisons = 0;
  for (const reference of [true, false]) {
    for (const jouable of [true, false]) {
      for (const pourcent of pourcents) {
        for (const cote of cotes) {
          for (const regle of regles) {
            const r = L.etatValue({ pourcent, jouable, reference, cote, regle });
            combinaisons++;
            const toutEstReuni =
              !reference && jouable && Number.isFinite(pourcent) && regle?.min === 2 && regle?.max === 25 && regle?.coteMax === 5 && Number.isFinite(cote) && pourcent > 2 && pourcent <= 25 && cote <= 5;
            assert.equal(r.vert, toutEstReuni, JSON.stringify({ pourcent, jouable, reference, cote, regle, etat: r.etat }));
            assert.equal(r.vert, r.etat === 'value');
            if (r.vert) verts++;
          }
        }
      }
    }
  }
  assert.equal(combinaisons, 2 * 2 * pourcents.length * cotes.length * regles.length);
  assert.ok(verts > 0, 'le vert existe bien dans la grille');
  // Une cote gratuite de référence n'est JAMAIS verte, même avec le plus bel avantage et tous les seuils.
  assert.equal(L.etatValue({ pourcent: 12, jouable: true, reference: true, cote: 2.5, regle: REGLE }).etat, 'reference');
  assert.equal(L.etatValue({ pourcent: 12, jouable: false, cote: 2.5, regle: REGLE }).etat, 'non-jouable');
  assert.equal(L.etatValue({ pourcent: 12, jouable: true, cote: 2.5, regle: null }).etat, 'seuil-inconnu');
  assert.equal(L.etatValue({ jouable: true, cote: 2.5, regle: REGLE }).etat, 'inconnue');
  assert.equal(L.etatValue().etat, 'non-jouable', 'sans rien : pas jouable, donc jamais vert');
});

// ------------------------------------------------ 2. la confiance

test('confiance : sans valeur ou avec une valeur impossible, « pas encore mesurée » — jamais un faux niveau', options, () => {
  for (const mauvais of [undefined, null, Number.NaN, Infinity, -0.1, 1.01, 72, '0.7', {}, [], true]) {
    const r = L.etatConfiance({ valeur: mauvais });
    assert.equal(r.etat, 'non-mesuree', String(mauvais));
    assert.equal(r.libelle, 'pas encore mesurée');
    assert.equal(r.valeur, null);
    assert.equal(r.etiquette, null);
  }
  assert.equal(L.etatConfiance().etat, 'non-mesuree');
  assert.equal(L.etatConfiance({}).etat, 'non-mesuree');
  assert.match(L.etatConfiance().titre, /ne mesure pas encore sa confiance/);
  assert.match(L.etatConfiance().titre, /aucun niveau/);
  // Une étiquette inconnue ne devient pas une mesure.
  assert.equal(L.etatConfiance({ etiquette: 'solide' }).etat, 'non-mesuree');
  assert.equal(L.etatConfiance({ etiquette: '' }).etat, 'non-mesuree');
});

test('confiance : mesurée, elle dit ce que le serveur dit — l\'étiquette n\'est jamais tirée du nombre', options, () => {
  const sur = L.etatConfiance({ valeur: 0.82, etiquette: 'sûr' });
  assert.deepEqual([sur.etat, sur.etiquette, sur.libelle, sur.valeur], ['mesuree', 'sur', 'sûr', 0.82]);
  assert.equal(L.etatConfiance({ valeur: 0.2, etiquette: 'Fragile' }).libelle, 'fragile');
  assert.equal(L.etatConfiance({ etiquette: 'sur' }).etat, 'mesuree', "l'étiquette seule suffit, sans niveau inventé");
  assert.equal(L.etatConfiance({ etiquette: 'sur' }).valeur, null);
  // Un nombre sans étiquette : un score sur 100, ni « sûr » ni « fragile » devinés d'un seuil qui n'est pas le nôtre.
  const seul = L.etatConfiance({ valeur: 0.6 });
  assert.deepEqual([seul.etat, seul.etiquette, seul.libelle], ['mesuree', null, '60 sur 100']);
  for (const v of [0, 0.5, 1]) assert.equal(L.etatConfiance({ valeur: v }).etat, 'mesuree', `bornes : ${v}`);
});

// ------------------------------------------------ 3. mouvement, composition, rebours, provenance

test('mouvement de cote : baisse, hausse, stable, inconnu — signe et ampleur', options, () => {
  const baisse = L.mouvementDeCote({ pourcent: -12.34 });
  assert.deepEqual([baisse.sens, baisse.pourcent, baisse.texte], ['baisse', -12.3, '−12,3 %']);
  assert.equal(baisse.libelle, 'Cote en baisse de 12,3 %.');
  const hausse = L.mouvementDeCote({ pourcent: 4.06 });
  assert.deepEqual([hausse.sens, hausse.texte, hausse.libelle], ['hausse', '+4,1 %', 'Cote en hausse de 4,1 %.']);
  // Lue entre deux cotes : 2,10 → 1,89 = −10 %.
  const lue = L.mouvementDeCote({ de: 2.1, vers: 1.89 });
  assert.deepEqual([lue.sens, lue.texte], ['baisse', '−10,0 %']);
  assert.equal(L.mouvementDeCote({ de: 2, vers: 2.5 }).texte, '+25,0 %');
  // Le bruit d'un relevé à l'autre : stable.
  assert.equal(L.mouvementDeCote({ pourcent: 0.04 }).sens, 'stable');
  assert.equal(L.mouvementDeCote({ pourcent: -0.04 }).sens, 'stable');
  assert.equal(L.mouvementDeCote({ de: 1.95, vers: 1.95 }).libelle, "Cote stable depuis l'ouverture.");
  assert.equal(L.mouvementDeCote({ pourcent: 0.05 }).sens, 'hausse', 'un dixième de point : déjà une hausse');
  // Inconnu : dit, jamais 0.
  for (const rien of [{}, { de: 2 }, { vers: 2 }, { de: 0, vers: 2 }, { de: null, vers: null }, { pourcent: Number.NaN }]) {
    const r = L.mouvementDeCote(rien);
    assert.equal(r.sens, 'inconnu', JSON.stringify(rien));
    assert.equal(r.pourcent, null);
  }
  // Le pourcentage donné prime sur les deux cotes ; le sujet se dit.
  assert.equal(L.mouvementDeCote({ pourcent: -5, de: 2, vers: 3 }).sens, 'baisse');
  assert.equal(L.mouvementDeCote({ pourcent: -5, sujet: 'Cote juste' }).libelle, 'Cote juste en baisse de 5,0 %.');
});

test("composition : officielle, probable, dernière alignée, pas publiée — l'état se déduit, FotMob ne le dit pas", options, () => {
  const lue = (minutesBeforeKickoff, extra = {}) => ({ source: 'FotMob', minutesBeforeKickoff, home: { startXI: [{ name: 'A' }], unavailable: [] }, away: { startXI: [], unavailable: [] }, ...extra });
  assert.equal(L.COMPO_OFFICIELLE_MINUTES, 60);
  assert.equal(L.etatComposition(lue(45)).etat, 'officielle');
  assert.equal(L.etatComposition(lue(60)).etat, 'officielle', "pile une heure avant : l'heure de FotMob");
  assert.equal(L.etatComposition(lue(61)).etat, 'probable');
  assert.equal(L.etatComposition(lue(600)).etat, 'probable', 'lue la veille : une prévision');
  assert.equal(L.etatComposition(lue(-20)).etat, 'officielle', 'lue après le coup d\'envoi : celle qui a joué');
  // Heure de lecture inconnue : jamais « officielle ».
  for (const inconnue of [undefined, null, Number.NaN]) assert.equal(L.etatComposition(lue(inconnue)).etat, 'probable');
  assert.match(L.etatComposition(lue(null)).raison, /heure de sa lecture est inconnue/);
  // Un titulaire que FotMob dit indisponible : composition prévisionnelle, même lue tard (règle d'AiLineupSnapshot).
  const contredite = lue(30, { home: { startXI: [{ name: 'Blessé' }, { name: 'B' }], unavailable: [{ name: 'Blessé' }] } });
  assert.equal(L.etatComposition(contredite).etat, 'probable');
  assert.match(L.etatComposition(contredite).raison, /indisponible/);
  assert.equal(L.etatComposition({ ...lue(30), away: { startXI: [{ name: 'C' }], unavailable: [{ name: 'D' }] } }).etat, 'officielle', "un absent qui n'est pas aligné ne change rien");
  // La dernière alignée, sans heure de lecture ; rien du tout : dit.
  assert.equal(L.etatComposition({ source: 'magasin', home: {}, away: {} }).etat, 'derniere');
  for (const rien of [null, undefined, 'x', 12]) assert.equal(L.etatComposition(rien).etat, 'absente');
  // Les mots affichés.
  assert.deepEqual(['officielle', 'probable', 'derniere', 'absente'].map((e) => L.decrireComposition(e).libelle), ['Compo officielle', 'Compo probable', 'Dernière alignée', 'Compo non publiée']);
  assert.equal(L.decrireComposition('n’importe quoi').etat, 'absente');
});

// Un « maintenant » en heure LOCALE : le jour du calendrier ne dépend alors pas du fuseau de la machine.
const local = (a, m, j, h = 0, min = 0, s = 0) => new Date(a, m - 1, j, h, min, s).getTime();
const MAINTENANT = local(2026, 10, 6, 10, 0, 0);
const dans = (ms) => new Date(MAINTENANT + ms).toISOString();
const MIN = 60_000;
const H = 3_600_000;
const JOUR = 86_400_000;

test('compte à rebours : dans combien de temps, puis « en cours » et « terminé » (estimés, jamais un direct)', options, () => {
  const t = (decalage, extra = {}) => L.compteARebours({ coupDEnvoi: dans(decalage), heureSure: true, maintenant: MAINTENANT, ...extra });
  assert.equal(t(30_000).texte, "dans moins d'une minute");
  assert.equal(t(45 * MIN).texte, 'dans 45 min');
  assert.equal(t(1 * MIN).texte, 'dans 1 min');
  assert.equal(t(2 * H + 15 * MIN).texte, 'dans 2 h 15');
  assert.equal(t(2 * H + 5 * MIN).texte, 'dans 2 h 05');
  assert.equal(t(1 * H).texte, 'dans 1 h 00');
  assert.equal(t(26 * H).texte, 'dans 1 j 2 h');
  assert.equal(t(JOUR).texte, 'dans 1 jour', 'pile vingt-quatre heures : pas de « 0 h »');
  assert.equal(t(2 * JOUR).texte, 'dans 2 jours');
  assert.equal(t(2 * JOUR + 23 * H).texte, 'dans 2 j 23 h');
  assert.equal(t(3 * JOUR + 5 * H).texte, 'dans 3 jours');
  assert.equal(t(10 * JOUR).texte, 'dans 10 jours');
  assert.equal(t(2 * H).etat, 'avant');
  // Commencé : « en cours » jusqu'à 130 min après (la règle de matchStatus.js), puis « terminé ».
  assert.deepEqual([t(0).etat, t(0).texte], ['en-cours', 'en cours']);
  assert.equal(t(-30 * MIN).etat, 'en-cours');
  assert.equal(t(-129 * MIN).etat, 'en-cours');
  assert.deepEqual([t(-130 * MIN).etat, t(-130 * MIN).texte], ['termine', 'terminé']);
  assert.equal(t(-5 * H).etat, 'termine');
  assert.match(t(-30 * MIN).titre, /estimé d'après l'heure du coup d'envoi.*pas d'après un flux en direct/);
  assert.match(t(-5 * H).titre, /estimé d'après l'heure du coup d'envoi.*pas d'après le score/);
  assert.match(t(2 * H).titre, /^Coup d'envoi .*\.$/);
});

test("compte à rebours : un match du calendrier ne connaît que son jour — on ne compte pas ses heures", options, () => {
  const jour = (j, extra = {}) => L.compteARebours({ coupDEnvoi: j, heureSure: false, maintenant: MAINTENANT, ...extra });
  assert.deepEqual([jour('2026-10-06').etat, jour('2026-10-06').texte], ['jour', "aujourd'hui"]);
  assert.equal(jour('2026-10-07').texte, 'demain');
  assert.equal(jour('2026-10-10').texte, 'dans 4 jours');
  assert.deepEqual([jour('2026-10-05').etat, jour('2026-10-05').texte], ['termine', 'terminé']);
  assert.match(jour('2026-10-07').titre, /heure du coup d'envoi à confirmer.*calendrier FotMob/);
  // Avec le midi UTC de repli (la forme du calendrier) : même chose, par le jour UTC.
  assert.equal(L.compteARebours({ coupDEnvoi: '2026-10-09T12:00:00Z', heureSure: false, maintenant: MAINTENANT }).texte, 'dans 3 jours');
  // Sans avis de l'appelant, le midi UTC pile (avec ou sans millisecondes) est lu comme un repli ; toute autre heure est exacte.
  for (const repli of ['2026-10-09T12:00:00Z', '2026-10-09T12:00:00.000Z']) {
    assert.equal(L.compteARebours({ coupDEnvoi: repli, maintenant: MAINTENANT }).etat, 'jour', repli);
  }
  assert.equal(L.compteARebours({ coupDEnvoi: '2026-10-09T14:00:00Z', maintenant: MAINTENANT }).etat, 'avant');
  // L'avis de l'appelant prime : une heure exacte qui tombe sur midi UTC est bien une heure.
  assert.equal(L.compteARebours({ coupDEnvoi: '2026-10-09T12:00:00Z', heureSure: true, maintenant: MAINTENANT }).etat, 'avant');
  // Un jour seul passé en « AAAA-MM-JJ » est toujours lu comme un jour, même si l'appelant se trompe.
  assert.equal(L.compteARebours({ coupDEnvoi: '2026-10-07', heureSure: true, maintenant: MAINTENANT }).texte, 'demain');
});

test('compte à rebours : pas de coup d\'envoi, ou illisible — dit, jamais un tiret', options, () => {
  for (const rien of [null, undefined, '', 'bientôt', 'n\'importe quoi', {}]) {
    const r = L.compteARebours({ coupDEnvoi: rien, maintenant: MAINTENANT });
    assert.deepEqual([r.etat, r.texte], ['inconnu', 'heure inconnue'], String(rien));
    assert.match(r.titre, /Aucune source ne donne/);
  }
  // Date, nombre et chaîne : le même instant.
  const iso = dans(3 * H);
  assert.equal(L.compteARebours({ coupDEnvoi: new Date(iso), heureSure: true, maintenant: MAINTENANT }).texte, 'dans 3 h 00');
  assert.equal(L.compteARebours({ coupDEnvoi: Date.parse(iso), heureSure: true, maintenant: MAINTENANT }).texte, 'dans 3 h 00');
});

test('provenance : la source réelle et l\'heure du relevé ; ancien, sans heure, sans source — toujours dits', options, () => {
  const p = (extra) => L.etatProvenance({ source: 'The Odds API', releveLe: dans(-3 * H), maintenant: MAINTENANT, ...extra });
  const recent = p();
  assert.equal(recent.etat, 'recent');
  assert.equal(recent.source, 'The Odds API');
  assert.match(recent.texte, /^relevé aujourd'hui à \d{2}:\d{2}$/);
  assert.equal(recent.ilYA, 'il y a 3 h');
  assert.equal(recent.ancien, false);
  // Hier, un autre jour, une autre année.
  assert.match(p({ releveLe: dans(-26 * H) }).quand ?? '', /^hier à \d{2}:\d{2}$/);
  // Ancien : au bout de 24 h, l'ambre ET les mots « il y a N jours ».
  const vieux = p({ releveLe: dans(-15 * JOUR) });
  assert.equal(vieux.etat, 'ancien');
  assert.equal(vieux.ancien, true);
  assert.match(vieux.texte, /^relevé le \d{2}\/\d{2} à \d{2}:\d{2} · il y a 15 jours$/);
  assert.match(vieux.titre, /Ce relevé est ancien/);
  // La veille : « hier à … » le dit déjà, pas de « · hier » en plus (mais l'ambre et la phrase au survol restent).
  const hier = p({ releveLe: dans(-26 * H) });
  assert.equal(hier.etat, 'ancien');
  assert.match(hier.texte, /^relevé hier à \d{2}:\d{2}$/);
  assert.match(hier.titre, /\(hier\)\. Ce relevé est ancien/);
  assert.equal(p({ releveLe: dans(-23 * H) }).etat, 'recent');
  assert.equal(p({ releveLe: dans(-24 * H) }).etat, 'ancien', 'pile 24 h : ancien, comme la date des cotes de DataOriginMenu');
  assert.equal(L.RELEVE_ANCIEN_APRES_HEURES, 24);
  assert.equal(p({ releveLe: dans(-15 * JOUR), vieuxApresHeures: null }).etat, 'recent', 'null : jamais ancien');
  assert.equal(p({ releveLe: dans(-90 * MIN), vieuxApresHeures: 1 }).etat, 'ancien');
  // Un autre verbe.
  assert.match(p({ action: 'calculé' }).texte, /^calculé aujourd'hui à/);
  // Heure absente ou illisible : dit, la source reste nommée.
  for (const rien of [null, undefined, '', 'hier soir', Number.NaN]) {
    const r = p({ releveLe: rien });
    assert.equal(r.etat, 'sans-heure', String(rien));
    assert.equal(r.source, 'The Odds API');
    assert.equal(r.texte, 'heure du relevé inconnue');
    assert.match(r.titre, /on ne peut pas dire si ce chiffre est frais/);
  }
  assert.equal(p({ releveLe: null, action: 'calculé' }).texte, 'heure du calcul inconnue');
  // Source absente : dite, jamais un libellé vague à sa place.
  for (const rien of [null, undefined, '', '   ']) {
    const r = p({ source: rien });
    assert.equal(r.etat, 'sans-source', JSON.stringify(rien));
    assert.equal(r.source, null);
    assert.equal(r.texte, 'source non indiquée');
  }
});

test('« quand » et « il y a » : hier, un autre jour, une autre année, les minutes et les heures', options, () => {
  const maintenant = local(2026, 10, 6, 15, 30);
  assert.equal(L.quandDit(local(2026, 10, 6, 9, 5), maintenant), "aujourd'hui à 09:05");
  assert.equal(L.quandDit(local(2026, 10, 5, 23, 58), maintenant), 'hier à 23:58');
  assert.equal(L.quandDit(local(2026, 9, 21, 18, 35), maintenant), 'le 21/09 à 18:35');
  assert.equal(L.quandDit(local(2025, 12, 31, 18, 35), maintenant), 'le 31/12/2025 à 18:35');
  assert.equal(L.ilYA(maintenant - 20_000, maintenant), "à l'instant");
  assert.equal(L.ilYA(maintenant - 12 * MIN, maintenant), 'il y a 12 min');
  assert.equal(L.ilYA(local(2026, 10, 6, 12, 0), maintenant), 'il y a 3 h');
  assert.equal(L.ilYA(local(2026, 10, 5, 23, 0), maintenant), 'hier', "la veille au soir : « hier », pas « il y a 16 h »");
  assert.equal(L.ilYA(local(2026, 9, 21, 18, 35), maintenant), 'il y a 15 jours');
  assert.equal(L.pourcentSigne(4.06), '+4,1 %');
  assert.equal(L.pourcentSigne(-3.24), '−3,2 %');
  assert.equal(L.pourcentSigne(0.04), '0,0 %');
});

// ------------------------------------------------ 4. le guide de lecture

test('guide de lecture : les sept phrases demandées (la sixième, « à rafraîchir », depuis l’étape 7 ; la septième, « juge et partie », depuis l’étape 8), simples, sans balise — et la huitième, « cote minimale », depuis l’étape 10', options, () => {
  assert.deepEqual(Object.keys(L.GUIDE_DE_LECTURE).sort(), ['a-rafraichir', 'banc-d-essai', 'calibration', 'carte-ou-parier', 'cote-juste', 'cote-minimale', 'deroule-simule', 'donnees-deja-vues', 'enjeu', 'fin-de-saison', 'fourchette-du-hasard', 'juge-et-partie', 'modele-de-buts', 'note-de-depart', 'preuve-apres-lancement', 'prix-juste-combine', 'series-de-pertes', 'sur-fragile', 'table-du-jour-j', 'valeur-de-cloture', 'value', 'variantes-essayees']);
  assert.ok(Object.isFrozen(L.GUIDE_DE_LECTURE));
  for (const [terme, { titre, phrase }] of Object.entries(L.GUIDE_DE_LECTURE)) {
    assert.ok(titre.length >= 4, terme);
    assert.ok(phrase.length >= 80 && phrase.length <= 260, `${terme} : ${phrase.length} caractères`);
    assert.ok(/[.]$/.test(phrase), `${terme} : finit par un point`);
    assert.ok(!/[<>]/.test(phrase), `${terme} : pas de balise`);
    assert.ok(/[éèêàù]/.test(phrase), `${terme} : écrit en français`);
    assert.ok(!/\bP\(|\bEV\b|\bCLV\b|\bedge\b/i.test(phrase), `${terme} : pas de jargon`);
  }
  // Les notions clés sont bien dans la bonne phrase.
  const g = L.GUIDE_DE_LECTURE;
  assert.match(g.value.phrase, /cote juste/);
  assert.match(g.value.phrase, /référence gratuite n'en donne jamais/);
  assert.match(g['valeur-de-cloture'].phrase, /dernière cote avant le coup d'envoi/);
  assert.match(g['valeur-de-cloture'].phrase, /baissé/);
  assert.match(g['sur-fragile'].phrase, /estimations.*s'accordent/);
  assert.match(g['series-de-pertes'].phrase, /normal/);
  assert.match(g['cote-juste'].phrase, /marge/);
  assert.match(g['a-rafraichir'].phrase, /3 heures par défaut/);
  assert.match(g['a-rafraichir'].phrase, /annonce des compositions/);
  assert.match(g['a-rafraichir'].phrase, /plus montrée comme une value/);
  assert.match(g['juge-et-partie'].phrase, /servi à fixer la cote juste/);
  assert.match(g['juge-et-partie'].phrase, /la cote juste plus sa marge/);
  // Étape 10 : la cote minimale à prendre (comparateur de vos bookmakers).
  assert.match(g['cote-minimale'].phrase, /plus petite cote à prendre/);
  assert.match(g['cote-minimale'].phrase, /value au seuil du moteur/);
  // Étape 17 : la table du jour J (Réglages), ce qu'on savait la veille, sans le match ni ceux d'après.
  assert.match(g['table-du-jour-j'].phrase, /la veille/);
  assert.match(g['table-du-jour-j'].phrase, /ni ceux d'après/);
  // Étape 19 : le banc d'essai (amendement §8 : « ce qu'on sait aujourd'hui des matchs d'avant le jour J »), la note de départ, le déjà vu.
  assert.match(g['banc-d-essai'].phrase, /ce qu'on sait aujourd'hui des matchs d'avant le jour J/);
  assert.match(g['banc-d-essai'].phrase, /cotes d'avant le coup d'envoi/);
  assert.match(g['note-de-depart'].phrase, /sur les mêmes matchs/);
  assert.match(g['donnees-deja-vues'].phrase, /ne prouve rien/);
  // Étape 20 : la calibration du mois (annoncé face au réalisé, tranche par tranche, le hasard dit).
  assert.match(g.calibration.phrase, /60 fois sur 100/);
  assert.match(g.calibration.phrase, /hasard/);
  // Étape 27 : le modèle de buts unique (la phrase de la conception, §4), sans jargon (« calé sur la cote », jamais « ancrage »).
  assert.match(g['modele-de-buts'].phrase, /partent des cotes/);
  assert.match(g['modele-de-buts'].phrase, /de 10 % quand une cote plus\/moins existe, de moitié pour le total sinon ; sans cote, les xG \(ou, à défaut, les buts\) seuls/);
  assert.doesNotMatch(g['modele-de-buts'].phrase, /ancr|Poisson|Dixon|rho/i);
  // Étape 28 : la fin de saison, l'enjeu, le déroulé simulé et le prix juste d'un combiné (conception §5), sans jargon.
  assert.match(g['fin-de-saison'].phrase, /classement officiel/);
  assert.match(g['fin-de-saison'].phrase, /part des saisons/);
  assert.match(g.enjeu.phrase, /entre une victoire et une défaite/);
  assert.match(g.enjeu.phrase, /n’entre dans aucun pourcentage du moteur/);
  assert.match(g['deroule-simule'].phrase, /Une information, pas un pronostic\./);
  assert.match(g['prix-juste-combine'].phrase, /ce n’est pas le produit des cotes/);
  assert.match(g['prix-juste-combine'].phrase, /jamais en vert/);
  for (const terme of ['fin-de-saison', 'enjeu', 'deroule-simule', 'prix-juste-combine']) {
    assert.doesNotMatch(g[terme].phrase, /Monte|Carlo|Poisson|Dixon|copule|bivari/i, terme);
  }
});

/** Tous les fichiers .vue de l'interface. */
function fichiersVue(dossier) {
  return fs.readdirSync(dossier, { recursive: true }).filter((f) => f.endsWith('.vue')).map((f) => path.join(dossier, f));
}

test('chaque « ? » posé dans l\'interface désigne une phrase du guide ; et le guide est posé là où il en parle', options, () => {
  const utilises = new Map();
  for (const fichier of fichiersVue(UI_SRC)) {
    const source = fs.readFileSync(fichier, 'utf8');
    for (const m of source.matchAll(/<HelpTip\b([^>]*)>/g)) {
      const terme = /\bterme="([^"]+)"/.exec(m[1])?.[1] ?? null;
      const texte = /\b(?:titre|texte)=/.test(m[1]);
      assert.ok(terme || texte, `${path.relative(UI_SRC, fichier)} : un HelpTip sans terme ni texte`);
      if (terme) {
        assert.ok(L.GUIDE_DE_LECTURE[terme], `${path.relative(UI_SRC, fichier)} : le terme « ${terme} » n'est pas au guide`);
        utilises.set(terme, [...(utilises.get(terme) ?? []), path.relative(UI_SRC, fichier).split(path.sep).join('/')]);
      }
    }
  }
  // Les sept notions sont expliquées quelque part dans l'appli, dans les pages où elles s'affichent.
  assert.deepEqual([...utilises.keys()].sort(), ['a-rafraichir', 'banc-d-essai', 'calibration', 'carte-ou-parier', 'cote-juste', 'cote-minimale', 'deroule-simule', 'donnees-deja-vues', 'enjeu', 'fin-de-saison', 'fourchette-du-hasard', 'juge-et-partie', 'modele-de-buts', 'note-de-depart', 'preuve-apres-lancement', 'prix-juste-combine', 'series-de-pertes', 'sur-fragile', 'table-du-jour-j', 'valeur-de-cloture', 'value', 'variantes-essayees']);
  // Étape 10 : « cote minimale » dans le comparateur de vos bookmakers, sur la page du match et dans le ticket.
  assert.ok(utilises.get('cote-minimale').includes('components/betting/BookmakerComparator.vue'));
  assert.ok(utilises.get('cote-minimale').includes('components/betting/TicketDuPari.vue'));
  assert.ok(utilises.get('cote-minimale').includes('views/UpcomingMatchView.vue'));
  // Étape 8 : « juge et partie » sur la page Opportunités, qui dit le verdict du moteur ; value et cote juste aussi.
  assert.ok(utilises.get('juge-et-partie').includes('views/OpportunitiesView.vue'));
  assert.ok(utilises.get('value').includes('views/OpportunitiesView.vue'));
  assert.ok(utilises.get('cote-juste').includes('views/OpportunitiesView.vue'));
  // Étape 7 : « à rafraîchir » là où une cote de vos bookmakers peut vieillir — la saisie, le conseil de relevé, la page du match.
  assert.ok(utilises.get('a-rafraichir').includes('components/analysis/ManualOddsEntry.vue'));
  assert.ok(utilises.get('a-rafraichir').includes('components/settings/PaidOddsAdvicePanel.vue'));
  assert.ok(utilises.get('a-rafraichir').includes('views/UpcomingMatchView.vue'));
  assert.ok(utilises.get('value').includes('components/analysis/ManualOddsEntry.vue'));
  assert.ok(utilises.get('value').includes('views/ScreenerView.vue'));
  assert.ok(utilises.get('cote-juste').includes('views/ScreenerView.vue'));
  assert.ok(utilises.get('cote-juste').includes('views/DroppingOddsView.vue'));
  assert.ok(utilises.get('sur-fragile').includes('views/ScreenerView.vue'));
  assert.ok(utilises.get('valeur-de-cloture').includes('components/analysis/ClosingValuePanel.vue'));
  assert.ok(utilises.get('series-de-pertes').includes('components/settings/RiskControlPanel.vue'));
  // Étape 17 : « table du jour J » sur sa carte de Réglages.
  assert.ok(utilises.get('table-du-jour-j').includes('components/settings/DayTablePanel.vue'));
  // Étape 19 : le banc d'essai, sa note de départ et le « déjà vu » sur l'onglet Banc d'essai.
  assert.ok(utilises.get('banc-d-essai').includes('views/BenchView.vue'));
  assert.ok(utilises.get('note-de-depart').includes('views/BenchView.vue'));
  assert.ok(utilises.get('donnees-deja-vues').includes('components/analysis/BenchSummaryTable.vue'));
  // Étape 20 : la calibration sur son bloc d'Historique moteur.
  assert.ok(utilises.get('calibration').includes('components/analysis/CalibrationPanel.vue'));
  // Étape 27 : le modèle de buts unique, sur sa pastille de provenance (page du match) et sur la carte de sa candidate (Réglages).
  assert.ok(utilises.get('modele-de-buts').includes('components/analysis/GoalModelProvenance.vue'));
  assert.ok(utilises.get('modele-de-buts').includes('components/settings/EngineGoalModelTrial.vue'));
  // Étape 28 : la fin de saison sur son onglet du classement, l'enjeu sur son encadré de la page du match, le déroulé sur
  // sa carte et sur la carte de Réglages, le prix juste d'un combiné dans le ticket.
  assert.ok(utilises.get('fin-de-saison').includes('components/matches/FinDeSaisonTable.vue'));
  assert.ok(utilises.get('enjeu').includes('components/matches/EnjeuDuMatch.vue'));
  assert.ok(utilises.get('deroule-simule').includes('components/analysis/DerouleSimuleCard.vue'));
  assert.ok(utilises.get('deroule-simule').includes('components/settings/EngineSimulationTrial.vue'));
  assert.ok(utilises.get('prix-juste-combine').includes('components/betting/TicketDuPari.vue'));
});

// ------------------------------------------------ 5. la bulle d'aide

test('bulle « ? » : focus et survol l\'ouvrent, Échap la ferme sans bouger le focus, un clic l\'épingle', options, () => {
  const suite = (...evenements) => evenements.reduce((etat, e) => L.transitionInfobulle(etat, e), L.etatInfobulleInitial());
  const ouverte = (...e) => L.infobulleOuverte(suite(...e));
  assert.equal(ouverte(), false, 'fermée au départ');
  // Clavier : Tab ouvre, Échap ferme (focus gardé), Tab ailleurs ferme.
  assert.equal(ouverte('focus'), true);
  assert.equal(ouverte('focus', 'echap'), false, 'Échap ferme, même focus gardé');
  assert.equal(ouverte('focus', 'echap', 'blur'), false);
  assert.equal(ouverte('focus', 'blur'), false);
  // Après Échap, un nouveau focus la rouvre ; un clic aussi (Entrée ou Espace sur le bouton).
  assert.equal(ouverte('focus', 'echap', 'blur', 'focus'), true);
  assert.equal(ouverte('focus', 'echap', 'clic'), true, 'Entrée après Échap : rouverte, épinglée');
  assert.equal(ouverte('focus', 'echap', 'clic', 'echap'), false, 'et Échap la referme');
  // Souris : le survol ouvre, le quitter ferme ; passer sur la bulle la garde ouverte.
  assert.equal(ouverte('survol-entre'), true);
  assert.equal(ouverte('survol-entre', 'survol-sort'), false);
  assert.equal(ouverte('survol-entre', 'survol-sort', 'survol-entre'), true, 'revenir sur le « ? » ou sur la bulle');
  assert.equal(ouverte('survol-entre', 'echap'), false, 'Échap ferme aussi une bulle ouverte au survol');
  assert.equal(ouverte('survol-entre', 'echap', 'survol-sort', 'survol-entre'), true, 'quitter puis revenir la rouvre');
  // Un clic l'épingle (doigt ou souris) : elle reste quand on quitte, un clic ailleurs la ferme.
  assert.equal(ouverte('survol-entre', 'clic', 'survol-sort'), true);
  assert.equal(ouverte('survol-entre', 'clic', 'survol-sort', 'dehors'), false);
  assert.equal(ouverte('survol-entre', 'clic', 'clic', 'survol-sort'), false, 'deux clics : défait');
  assert.equal(ouverte('focus', 'clic', 'dehors'), false, 'un clic ailleurs ferme tout, focus compris');
  assert.equal(ouverte('focus', 'clic', 'blur'), false, 'Tab ailleurs désépingle');
  // Aucun état n'est écrasé : la fonction ne modifie pas l'état reçu.
  const avant = L.etatInfobulleInitial();
  L.transitionInfobulle(avant, 'focus');
  assert.deepEqual(avant, { focus: false, survol: false, epingle: false, ferme: false });
  assert.throws(() => L.transitionInfobulle(avant, 'n-importe-quoi'), /Événement de bulle inconnu/);
});
