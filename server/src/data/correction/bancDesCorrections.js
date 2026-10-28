/**
 * bancDesCorrections.js — LE BANC D'ESSAI D'UNE CORRECTION, au clic de Pierre (étape 26 du plan, partie B,
 * 28/10/2026 ; constat 1 de la critique, décision 1 de l'orchestrateur).
 * -----------------------------------------------------------------------
 * « Mesurer au banc — environ 10 min » : la correction est rejouée sur les matchs 2019-2023 (jamais vus) face à la
 * version en service, par le banc de l'étape 19 (jugerLaCandidateAuBanc, bench/bancCandidate.js). Son verdict est
 * INDICATIF — le « gain mesuré » montré à côté des boutons — ; il ne décide jamais rien.
 *   - au CLIC seulement (la route POST /api/corrections/:id/banc), jamais après la passe, jamais tout seul : pas de
 *     correction comptée que Pierre ne veut pas, pas de calcul lourd sans personne devant l'écran ;
 *   - le JETON du calcul lourd pris AVANT le fork (utils/calculLourd.js : un calcul lourd à la fois sur un PC de
 *     7,9 Go) ; s'il est pris, la réponse le dit en mots et RIEN n'est compté ;
 *   - le verrou de l'actualisation tenu pendant tout le banc (nom « banc-correction ») : une passe qui démarre est
 *     reportée, comme pendant le banc du mois ;
 *   - le serveur, seul écrivain : il COMPTE la correction au registre de la mesure AVANT le fork (miseALEssai,
 *     declarerAvantLeBanc), passe l'état à « au-banc », puis, à la réponse, à « bancee » ou « banc-impossible » —
 *     chaque fois l'état et le journal en une transaction ;
 *   - le banc tourne dans un PROCESSUS À PART (bancCorrectionEnfant.js : base en lecture seule), au plus 45 min ; la
 *     mémoire du serveur (avant, au plus haut, après) et le retard de sa boucle d'événements sont mesurés et rangés
 *     avec le verdict, comme la mémoire de l'enfant.
 * Une appli fermée pendant le banc laisse la correction « au-banc » : la passe suivante la ramène à « proposee »
 * (boucle.js, constat 2) ; la relancer ne compte rien deux fois.
 * -----------------------------------------------------------------------
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { openDb, resolveDbPath } from '../db/matchStatsDb.js';
import { isRefreshRunning, withRefreshLock, tacheEnCours } from '../providers/refreshLock.js';
import { commencerCalculLourd, calculLourdEnCours, CalculLourdEnCours } from '../../utils/calculLourd.js';
import { lireReglagesDuMoteur } from '../../core/engine/engineConfig.js';
import { configDeLaCandidate, empreinteDeLaCandidate, validerCandidate } from '../../core/engine/engineVersions.js';
import { lireUneProposition, changerLEtat, CorrectionRefusee } from './depotCorrections.js';
import { transitionPermise, ETATS_DE_PROPOSITION } from './regles.js';
import { declarerAvantLeBanc } from './miseALEssai.js';
import { copieProfonde, nombreDit } from './propositions.js';

const ENFANT = fileURLToPath(new URL('./bancCorrectionEnfant.js', import.meta.url));
/** Au-delà, l'enfant est arrêté (le banc d'une correction : ~2 × 4 à 5 min dans le bac, 2 à 4 fois plus la nuit chez Pierre). */
export const DELAI_DU_BANC_MS = 45 * 60_000;
/** Le nom du jeton du calcul lourd et celui du verrou de l'actualisation. */
export const NOM_DU_CALCUL = 'banc d’une correction';
export const NOM_DU_VERROU = 'banc-correction';

const iso = (t) => new Date(t).toISOString();
let enCours = null;
let dernier = null;
let rejeuDEssai = null;

/** Le banc de correction en cours dans ce serveur ({ id, depuis, rejeu, partie, fait, total }), ou null. */
export const bancDeCorrectionEnCours = () => (enCours ? { ...enCours } : null);
/** Ce qu'a dit le dernier banc de correction de ce serveur (verdict, impossible, ou pas lancé et pourquoi), ou null. */
export const dernierBancDeCorrection = () => (dernier ? { ...dernier } : null);

const refus = (raison, message, statut = 409) => new CorrectionRefusee(raison, message, statut);
const MOTS_DU_VERDICT = Object.freeze({ retenu: 'retenu', 'pas-prouve': 'pas prouvé', 'moins-bon': 'moins bon', 'pas-assez-de-matchs': 'pas assez de matchs' });

/** Le verdict du banc résumé pour la proposition (et l'écran) : jamais les lignes, les cases ni les calibrations détaillées. */
export function resumeDuBanc(v, { serveur = null, enfant = null } = {}) {
  const famille = (x) => (x ? { verdict: x.verdict ?? null, gainPct: x.gainPct ?? null, fourchettePct: x.fourchettePct ?? null, matchs: x.matchs ?? null } : null);
  return {
    le: v?.le ?? null,
    indicatif: true,
    verdict: v?.verdict ?? null,
    raison: v?.raison ?? null,
    gainPct: v?.gainPct ?? null,
    fourchettePct: v?.fourchettePct ?? null,
    matchs: v?.matchs ?? 0,
    paires: v?.paires ?? 0,
    variantes: v?.variantes ?? null,
    periodes: v?.periodes ?? null,
    prix: v?.prix ?? null,
    marches: v?.marches ?? null,
    parFamille: Object.fromEntries(Object.entries(v?.parFamille ?? {}).map(([k, x]) => [k, famille(x)])),
    dejaVues: v?.dejaVues ?? null,
    ecartees: v?.ecartees ?? null,
    dureeMs: v?.dureeMs ?? null,
    erreur: v?.erreur ?? null,
    serveur,
    enfant
  };
}

/** La phrase du journal d'un banc fini. */
function phraseDuBanc(b) {
  if (b.erreur) return `Banc d’essai impossible : ${String(b.erreur).replace(/\.$/, '')}. Vous pouvez quand même la mettre à l’essai à blanc, ou la refuser.`;
  const gain = Number.isFinite(b.gainPct) ? b.gainPct : null;
  const dit = gain === null ? 'pas de chiffre' : gain >= 0 ? `${nombreDit(gain, 1)} % d’erreur de prévision en moins` : `${nombreDit(-gain, 1)} % d’erreur de prévision en plus`;
  const f = Array.isArray(b.fourchettePct) ? ` (fourchette [${nombreDit(b.fourchettePct[0], 1)} ; ${nombreDit(b.fourchettePct[1], 1)}])` : '';
  return `Mesurée au banc d’essai (matchs 2019-2023, ${nombreDit(b.matchs ?? 0)} matchs, indicatif) : ${dit}${f} — ${MOTS_DU_VERDICT[b.verdict] ?? b.verdict ?? 'pas jugé'}. À mettre à l’essai à blanc, ou à refuser.`;
}

/**
 * Le banc dans un PROCESSUS À PART (bancCorrectionEnfant.js) et la mesure du SERVEUR pendant ce temps (le retard
 * réel de sa boucle d'événements, sa mémoire avant, au plus haut, après) — le patron de bancAPart.rejouerAPart.
 * Rend une promesse de { verdict, enfant, serveur } ; rejette (enfant arrêté) s'il ne répond pas dans `delaiMs`,
 * s'il échoue, ou s'il s'arrête sans répondre — l'erreur porte alors `serveur`. Le jeton est pris par l'appelant.
 */
export function jugerAPart({ chemin, entree, delaiMs = DELAI_DU_BANC_MS, avancement = null }) {
  const boucle = monitorEventLoopDelay({ resolution: 10 });
  boucle.enable();
  const rssAvantOctets = process.memoryUsage.rss();
  let rssMaxOctets = rssAvantOctets;
  const releve = setInterval(() => {
    rssMaxOctets = Math.max(rssMaxOctets, process.memoryUsage.rss());
  }, 1000);
  releve.unref?.();
  const mesure = () => {
    clearInterval(releve);
    boucle.disable();
    const rssApresOctets = process.memoryUsage.rss();
    return { pid: process.pid, retardBoucleMaxMs: Math.round(boucle.max / 1e6), retardBoucleP99Ms: Math.round(boucle.percentile(99) / 1e6), rssAvantOctets, rssMaxOctets: Math.max(rssMaxOctets, rssApresOctets), rssApresOctets };
  };
  return new Promise((resolve, reject) => {
    let fini = false;
    let erreurs = '';
    const echec = (error) => {
      error.serveur = mesure();
      reject(error);
    };
    const enfant = fork(ENFANT, [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    // `fini` est posé AVANT d'arrêter l'enfant : sa sortie, qui suit, ne rejette pas une seconde fois.
    const minuterie = setTimeout(() => {
      if (fini) return;
      fini = true;
      try {
        enfant.kill();
      } catch {
        // déjà arrêté
      }
      echec(new Error(`banc arrêté : aucune réponse en ${delaiMs < 60_000 ? `${delaiMs} ms` : `${Math.round(delaiMs / 60_000)} min`}`));
    }, delaiMs);
    minuterie.unref?.();
    enfant.stderr?.on('data', (d) => {
      erreurs = (erreurs + d).slice(-2000);
    });
    enfant.on('message', (m) => {
      if (m?.avancement) {
        avancement?.(m.avancement);
        return;
      }
      clearTimeout(minuterie);
      if (fini) return;
      fini = true;
      if (m?.erreur) echec(new Error(m.erreur));
      else resolve({ verdict: m.verdict, enfant: m.enfant ?? null, serveur: mesure() });
    });
    enfant.on('error', (error) => {
      clearTimeout(minuterie);
      if (!fini) echec(error);
      fini = true;
    });
    enfant.on('exit', (code) => {
      clearTimeout(minuterie);
      if (!fini) echec(new Error(`banc arrêté sans réponse (code ${code}) ${erreurs.trim().slice(-300)}`));
      fini = true;
    });
    enfant.send({ ...entree, chemin, rejeuDEssai });
  });
}

/** Le travail du banc, SOUS le verrou (nom « banc-correction ») et le jeton : compter, « au-banc », l'enfant, le verdict. */
async function tacheDuBanc({ proposition: p, database, maintenant }) {
  let compte;
  try {
    compte = declarerAvantLeBanc(p, { maintenant });
  } catch (error) {
    dernier = { id: p.id, le: iso(Date.now()), issue: 'pas-lance', phrase: `Mesure au banc pas lancée : le registre de la mesure ne se lit pas (${String(error?.message ?? error).slice(0, 200)}) ; rien n’a été compté. Réessayez dans un instant.` };
    return { lance: false, erreur: dernier.phrase };
  }
  changerLEtat(
    {
      id: p.id,
      evenement: 'au-banc',
      vue: 'proposee',
      source: 'pierre',
      phrase: `Mesure au banc d’essai lancée (matchs 2019-2023, jamais vus ; environ 10 minutes, dans un processus à part). Elle compte désormais parmi les corrections essayées (${nombreDit(compte.variantes)} en tout) : chacune élargit la marge du juge.`,
      details: { corrections: compte.variantes, nouvelle: compte.change }
    },
    { database, maintenant }
  );
  const reglagesEnService = copieProfonde(lireReglagesDuMoteur().football);
  let resultat;
  try {
    const candidate = { ...validerCandidate(p.declaration), empreinte: empreinteDeLaCandidate(p.declaration) };
    const entree = { candidate, reglagesEnService, reglagesCandidate: configDeLaCandidate(reglagesEnService, candidate, 'football') };
    resultat = await jugerAPart({
      chemin: resolveDbPath(),
      entree,
      avancement: (a) => {
        if (enCours) enCours = { ...enCours, rejeu: a?.rejeu ?? null, partie: a?.partie ?? null, fait: a?.fait ?? 0, total: a?.total ?? 0 };
      }
    });
  } catch (error) {
    resultat = { verdict: { erreur: String(error?.message ?? error).slice(0, 300) }, serveur: error?.serveur ?? null, enfant: null };
  }
  const banc = resumeDuBanc(resultat.verdict, { serveur: resultat.serveur ?? null, enfant: resultat.enfant ?? null });
  const fin = Date.now();
  const evenement = banc.erreur ? 'banc-impossible' : 'bancee';
  try {
    changerLEtat({ id: p.id, evenement, vue: 'au-banc', source: 'pierre', phrase: phraseDuBanc(banc), details: { verdict: banc.verdict, gainPct: banc.gainPct, variantes: banc.variantes, serveur: banc.serveur, enfant: banc.enfant }, maj: { banc } }, { database, maintenant: fin });
  } catch (error) {
    dernier = { id: p.id, le: iso(fin), issue: 'non-range', phrase: `Le verdict du banc n’a pas pu être rangé : ${String(error?.message ?? error).slice(0, 200)}.`, banc };
    return { lance: true, erreur: dernier.phrase };
  }
  dernier = { id: p.id, le: iso(fin), issue: evenement, phrase: phraseDuBanc(banc), banc };
  return { lance: true, evenement, banc };
}

/**
 * LANCE LE BANC D'UNE CORRECTION (la route POST /api/corrections/:id/banc, au clic de Pierre) : `id`, `vue` (l'état vu
 * à l'écran : « proposee »). Refusé (CorrectionRefusee, rien de compté, rien de lancé) : une passe, un import ou un
 * autre banc tient la base ; un banc de correction tourne déjà ; une proposition inconnue (404) ; un état qui a changé
 * (« déjà changé : relisez ») ou qui ne se mesure pas ; un calcul lourd en cours (« réessayez dans quelques
 * minutes »). Sinon le jeton est pris, le verrou aussi, et le travail part sans être attendu. Rend { lance, id, enCours }.
 */
export function lancerLeBancDUneCorrection({ id, vue, database = openDb(), maintenant = Date.now() } = {}) {
  if (typeof vue !== 'string' || !ETATS_DE_PROPOSITION.includes(vue)) throw refus('vue', '« vue » est requis : l’état de la correction vu à l’écran. Rien n’a été lancé.', 400);
  if (enCours) throw refus('banc-en-cours', `Une mesure au banc tourne déjà (« ${enCours.id} ») : une à la fois. Rien n’a été compté.`);
  if (isRefreshRunning()) throw refus('passe-en-cours', 'Une actualisation, un import ou un calcul tient la base : la mesure au banc ne se lance pas pendant ce temps. Rien n’a été compté — réessayez quand ce sera fini.');
  const p = lireUneProposition(id, { database });
  if (!p) throw refus('inconnue', `Aucune correction « ${String(id)} ».`, 404);
  if (p.etat !== vue) throw refus('deja-change', `La correction « ${id} » n’est plus « ${vue} » mais « ${p.etat} » : rien n’a été lancé. Relisez.`);
  if (!transitionPermise(p.etat, 'au-banc')) throw refus('transition', `Une correction « ${p.etat} » ne se mesure pas au banc : rien n’a été lancé.`);
  const lourd = calculLourdEnCours();
  if (lourd) throw refus('calcul-lourd', `Un calcul lourd est en cours (${lourd.nom}) : réessayez dans quelques minutes. Rien n’a été compté.`);
  let rendre;
  try {
    rendre = commencerCalculLourd(NOM_DU_CALCUL, { maintenant });
  } catch (error) {
    if (error instanceof CalculLourdEnCours) throw refus('calcul-lourd', `Un calcul lourd est en cours (${error.enCours?.nom ?? 'autre calcul'}) : réessayez dans quelques minutes. Rien n’a été compté.`);
    throw error;
  }
  const promesse = withRefreshLock(() => tacheDuBanc({ proposition: p, database, maintenant }), { stamp: false, nom: NOM_DU_VERROU });
  if (tacheEnCours() !== NOM_DU_VERROU) {
    rendre();
    promesse.catch(() => {});
    throw refus('passe-en-cours', 'Une actualisation ou un import vient de prendre la base : rien n’a été compté. Réessayez dans quelques minutes.');
  }
  enCours = { id: p.id, depuis: iso(maintenant), rejeu: null, partie: null, fait: 0, total: 0 };
  promesse
    .then((r) => {
      if (r?.skipped) dernier = { id: p.id, le: iso(Date.now()), issue: 'pas-lance', phrase: `Mesure au banc pas lancée : ${r.skipped}. Rien n’a été compté.` };
      else if (r?.erreur) console.error(`[banc d’une correction] ${r.erreur}`);
      else if (r?.lance) console.log(`[banc d’une correction] « ${p.id} » : ${r.evenement}.`);
    })
    .catch((error) => {
      dernier = { id: p.id, le: iso(Date.now()), issue: 'echec', phrase: `Mesure au banc en échec : ${String(error?.message ?? error).slice(0, 200)}.` };
      console.error(`[banc d’une correction] en échec : ${error.message}`);
    })
    .finally(() => {
      rendre();
      enCours = null;
    });
  return { lance: true, id: p.id, enCours: bancDeCorrectionEnCours() };
}

/**
 * Pour les essais seulement : `simulerLeRejeu(chemin)` fait rejouer l'enfant par le module `chemin` (qui exporte
 * `rejouer`, la forme de bench/runner.js) au lieu de l'historique ; `simulerLeRejeu(null)` le rétablit. Refusé hors
 * d'une copie d'essai (test/aides/isolement.mjs pose CM_TEST_DOSSIER) : l'appli ne peut pas s'en servir.
 */
export const __testing = {
  simulerLeRejeu(chemin) {
    if (chemin && !process.env.CM_TEST_DOSSIER) throw new Error('Rejeu fabriqué réservé aux essais (copie isolée, CM_TEST_DOSSIER).');
    rejeuDEssai = chemin || null;
  }
};
