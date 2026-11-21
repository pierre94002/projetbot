/**
 * ÉTAPE 46, § 2.7 (18/11/2026, corrections d'O15) — UNE RECONDUCTION FABRIQUÉE pour les essais (directReconduction.test.mjs,
 * directLecture.test.mjs T-L11 bis) : une preuve au format 3 (O16) qui passe controlerUnePreuve, l'inscription qui la porte, et un
 * registre des versions qui donne aux numéros 5 et 6 les identités de la preuve. Données FABRIQUÉES seulement : aucune base,
 * aucun fichier lu, aucun réglage réel (les empreintes sont des sha1 inventés, sauf quand un essai passe les siennes).
 */
import crypto from 'node:crypto';
import * as R from '../../src/data/direct/reconductionDuDirect.js';
import { SCELLEMENT } from '../../src/data/direct/bancDuDirect.js';

export const sha1 = (t) => crypto.createHash('sha1').update(t).digest('hex');

/** Les identités fabriquées de N (5) et N′ (6) : code et réglages. */
export const IDENTITE_5 = Object.freeze({ code: '16f2459db183a99576365047da98b7777687ef05', reglages: '5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a' });
export const IDENTITE_6 = Object.freeze({ code: '0b091899d40c8331a771d8c963b033a6f067aecf', reglages: '6b6b6b6b6b6b6b6b6b6b6b6b6b6b6b6b6b6b6b6b' });

/** Les modules du sceau sous les dossiers du direct, à leur sha1 scellé (aucun module changé). */
export const modulesDuSceau = () => Object.fromEntries(R.modulesDuDirectDuSceau(SCELLEMENT.modules).map((f) => [f, SCELLEMENT.modules[f]]));

/** Une preuve fabriquée, BONNE (identique, inscriptible : 3 nuits, 312 rencontres dont 300 cotées, base de la taille de la vraie) ; `plus` remplace des clés. */
export function preuveFabriquee({ n = IDENTITE_5, nPrime = IDENTITE_6, script = { preuve: 'd'.repeat(40), calcul: 'e'.repeat(40), reconduction: 'c'.repeat(40) }, ...plus } = {}) {
  const p = {
    format: R.FORMAT_DE_LA_PREUVE,
    quoi: 'essai fabriqué',
    script,
    de: 5,
    vers: 6,
    versionsLues: true,
    grille: SCELLEMENT.declaration.modele.grille,
    voie: 'recalcul-bac',
    faiteLe: '2026-10-05T03:00:00.000Z',
    nuits: 3,
    jours: ['2026-10-02T01:00:00.000Z', '2026-10-03T01:00:00.000Z', '2026-10-04T01:00:00.000Z'],
    rencontres: 312,
    lignesComparees: 410,
    nulles: 0,
    ecartMax: { lambda: 0, mu: 0, rho: 0, fair: 0 },
    modulesDuDirect: modulesDuSceau(),
    modulesDuDirectChanges: [],
    lectures: null,
    codes: { n: { serveur: 'essai/n/server', empreinte: n.code }, nPrime: { serveur: 'essai/np/server', empreinte: nPrime.code } },
    reglages: { n: { fichier: 'f'.repeat(40), empreinte: n.reglages }, nPrime: { fichier: '9'.repeat(40), empreinte: nPrime.reglages } },
    registre: { sha1: '8'.repeat(40), de: { ...n }, vers: { ...nPrime } },
    base: { sha1: '7'.repeat(40), octets: 3060670464 },
    donnees: { empreinte: '6'.repeat(40), fichiers: { 'fixtures/odds/odds-snapshot.json': '5'.repeat(40), 'runtime/season-calendar.json': '4'.repeat(40) } },
    cotes: { lignes: 380, rencontres: 300, payantes: 280, gratuites: 20, nuits: 3 },
    bilans: { n: { matchs: 900, dansLaFenetre: 430, analyses: 420, echecs: 2, sansIdentifiant: 10 }, nPrime: { matchs: 900, dansLaFenetre: 430, analyses: 420, echecs: 2, sansIdentifiant: 10 } },
    echecs: { n: ['2026-10-02T01:00:00.000Z|id:4242', '2026-10-03T01:00:00.000Z|nom:A|B|2026-10-04'], nPrime: ['2026-10-02T01:00:00.000Z|id:4242', '2026-10-03T01:00:00.000Z|nom:A|B|2026-10-04'] },
    seulementN: 0,
    seulementNPrime: 0,
    differences: [],
    identique: true
  };
  const r = { ...p, ...plus };
  // Moins de rencontres que les 300 avec cote : les rencontres avec cote suivent (jamais plus que les rencontres).
  if (!('cotes' in plus) && Number.isInteger(r.rencontres)) r.cotes = { lignes: 380, rencontres: Math.min(300, r.rencontres), payantes: Math.min(280, r.rencontres), gratuites: Math.min(20, Math.max(0, r.rencontres - 280)), nuits: 3 };
  return r;
}

/** L'inscription qui porte la preuve `p` (au texte exact et à son sha1) ; `plus` remplace des clés. */
export function inscriptionDe(p, plus = {}) {
  return {
    de: p.de,
    vers: p.vers,
    grille: p.grille,
    le: '2026-11-19',
    entreeEnService: '2026-11-18',
    nuits: p.nuits,
    rencontres: p.rencontres,
    lignesComparees: p.lignesComparees,
    ecartMax: p.ecartMax,
    voie: p.voie,
    empreintes: { de: { code: p.codes.n.empreinte, reglages: p.reglages.n.empreinte }, vers: { code: p.codes.nPrime.empreinte, reglages: p.reglages.nPrime.empreinte } },
    modulesDuDirect: p.modulesDuDirect,
    modulesDuDirectChanges: p.modulesDuDirectChanges,
    lectures: p.lectures,
    preuve: { fichier: 'reconductions/preuve-5-6.json', sha1: sha1(R.texteDeLaPreuve(p)), contenu: p },
    historique: 'entrée 46 (essai fabriqué)',
    ...plus
  };
}

/** Un registre des versions fabriqué, de la forme du moteur (engineVersions.js) : { numéro: identité }. */
export function registreFabrique(identites = { 5: IDENTITE_5, 6: IDENTITE_6 }) {
  const numeros = Object.keys(identites).map(Number).sort((a, b) => a - b);
  return {
    format: 1,
    enService: numeros.at(-1),
    pile: numeros,
    versions: numeros.map((k) => ({ numero: k, creeeLe: '2026-10-01T00:00:00.000Z', origine: 'essai', empreinte: sha1(`etat-${k}`), empreinteReglages: { football: identites[k].reglages }, reglages: { football: {} }, code: { empreinte: identites[k].code, fichiers: {} }, lancements: [], depuis: null, changements: [] })),
    journal: [],
    candidate: null,
    candidatesPassees: []
  };
}

/** Le contrôle complet, comme à l'écran : sceau, version jugée 5, registre fabriqué, sha1 de la preuve. */
export const optionsCompletes = (extra = {}) => {
  const identites = R.identitesDuRegistre(registreFabrique());
  return { scellement: SCELLEMENT, versionJugee: 5, aujourdhui: '2026-11-20', identiteDe: (n) => identites[n] ?? null, sha1, ...extra };
};
