/**
 * etat.js — l'état des enregistreurs, tel que le lit la carte « Enregistreurs » de Réglages (étape E).
 * -----------------------------------------------------------------------
 * Rien de lourd : les comptes viennent de recorder_counts / recorder_state
 * (tenus à chaque écriture, cf. file.js), l'état de chaque boucle de la
 * mémoire du serveur. Les deux relevés déjà en place avant l'étape E — les
 * cotes gratuites en direct (oddsWatch.js) et le déroulé des matchs terminés
 * (matches.events) — sont comptés par deux petites requêtes indexées (les
 * rencontres de quatre jours), gardées une minute.
 *
 * L'ALERTE DURABLE (« enregistreurs » dans refresh-status.json, comme celles
 * des sauvegardes et des cotes) : posée quand un relevé s'arrête ou tombe en
 * erreur, levée quand il repart ; réécrite seulement quand elle change.
 * Un relevé COUPÉ volontairement (bac à sable, interrupteur) n'alerte pas.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { openDb, resolveDbPath } from '../db/matchStatsDb.js';
import { sqlHorsPayantes } from '../db/oddsQuotesRepository.js';
import { getFixturePaths } from '../repositories/fixturesRepository.js';
import { readRefreshStatus, setAlert } from '../repositories/refreshStatusRepository.js';
import { env } from '../../config/env.js';
import { modeBacASable } from '../../config/bacASable.js';
import { getLiveWatchStatus } from '../../jobs/liveWatch.js';
import { sharedDayListStats } from '../providers/fotMobProvider.js';
import { etatAbsents } from './absents.js';
import { etatCotesPayantes } from './cotesPayantes.js';
import { etatDeLaFile } from './file.js';
import { lireComptesEtEtats } from './depot.js';
import { ENREGISTREURS, jourParis, veilleParis, minuitParis, jourUtc, iso, JOUR_MS, MINUTE_MS } from './communs.js';

const HEURE_MS = 3_600_000;
/** Seuils de l'alerte « arrêté ». */
const SEUILS = {
  directTourMs: 5 * MINUTE_MS,
  absentsPasseMs: 2 * HEURE_MS,
  gelMs: 30 * HEURE_MS,
  coteNonArchiveeMs: 30 * MINUTE_MS,
  fileBloqueeMs: 2 * HEURE_MS
};

/** Ce que le planificateur (jobs/enregistreurs.js) dit de lui-même. */
const planif = { demarre: false, demarreA: null, raison: null, tours: 0, dernierTour: null, derniereAlerte: undefined };

export function noterPlanificateur(patch) {
  Object.assign(planif, patch);
}

/** Pourquoi les enregistreurs ne tournent pas, quand ils ne tournent pas. */
export function raisonCoupure() {
  if (planif.demarre) return null;
  if (planif.raison) return planif.raison;
  if (!env.matchStatsRefresh.enabled) {
    return modeBacASable()
      ? 'coupés dans le bac à sable avec l’actualisation automatique (CM_BAC_ACTUALISATION=1 pour un essai)'
      : 'coupés avec l’actualisation automatique (MATCH_STATS_AUTO_REFRESH=false)';
  }
  if (!env.enregistreurs?.enabled) return 'coupés par ENREGISTREURS=false';
  return 'pas encore démarrés (deux minutes après le démarrage du serveur)';
}

// ------------------------------------- les relevés déjà en place (avant E)
let cacheDejaGardes = { at: 0, valeur: null };
function dejaGardes(database, maintenant) {
  if (cacheDejaGardes.valeur && maintenant - cacheDejaGardes.at < MINUTE_MS) return cacheDejaGardes.valeur;
  const jour = jourParis(maintenant);
  const veille = veilleParis(maintenant);
  const debutJour = minuitParis(jour);
  const debutVeille = minuitParis(veille);
  const valeur = [];
  // 1. Cotes gratuites en direct (oddsWatch, toutes les 10 min) : les lignes « live ».
  try {
    const r = database
      .prepare(`SELECT SUM(CASE WHEN q.releve_at >= ? THEN 1 ELSE 0 END) AS aujourdhui,
                       SUM(CASE WHEN q.releve_at >= ? AND q.releve_at < ? THEN 1 ELSE 0 END) AS hier,
                       MAX(q.releve_at) AS dernier, MIN(q.releve_at) AS premier
                FROM odds_events e JOIN odds_quotes q ON q.event_id = e.id
                WHERE e.date >= ? AND e.date <= ? AND ${sqlHorsPayantes('e.source')} AND q.kind = 'live'`)
      .get(debutJour, debutVeille, debutJour, jourUtc(maintenant - 3 * JOUR_MS), jourUtc(maintenant + JOUR_MS));
    valeur.push({
      cle: 'cotes-gratuites-direct',
      nom: 'Cotes gratuites en direct',
      quoi: 'les cotes des matchs en cours, toutes les 10 min (ESPN, 365Scores, Kalshi, Smarkets)',
      fournisseur: 'Sources gratuites — boucle des cotes (oddsWatch)',
      tables: ['odds_quotes (relevés « live »)'],
      depuis: r?.premier ?? null,
      depuisPrecision: 'parmi les rencontres des quatre derniers jours',
      hier: r?.hier ?? 0,
      aujourdhui: r?.aujourdhui ?? 0,
      dernierReleve: r?.dernier ?? null,
      etat: env.matchStatsRefresh.enabled && env.freeOdds?.enabled ? 'actif' : 'coupé',
      raison: env.matchStatsRefresh.enabled && env.freeOdds?.enabled ? null : 'cotes gratuites coupées (FREE_ODDS / actualisation)'
    });
  } catch (error) {
    valeur.push({ cle: 'cotes-gratuites-direct', nom: 'Cotes gratuites en direct', etat: 'en erreur', raison: `lecture impossible : ${String(error.message).slice(0, 120)}`, hier: null, aujourdhui: null });
  }
  // 2. Déroulé des matchs terminés (buts, cartons, remplacements, avec la minute) : matches.events.
  try {
    const lignes = database
      .prepare(`SELECT date, COUNT(*) AS joues, SUM(CASE WHEN events IS NOT NULL THEN 1 ELSE 0 END) AS avec
                FROM matches WHERE date IN (?, ?) AND home_goals IS NOT NULL GROUP BY date`)
      .all(jourUtc(maintenant - JOUR_MS), jourUtc(maintenant));
    const de = (d) => lignes.find((l) => l.date === d) ?? { joues: 0, avec: 0 };
    const premier = database.prepare('SELECT MIN(date) AS d FROM matches').get()?.d ?? null;
    const h = de(jourUtc(maintenant - JOUR_MS));
    const a = de(jourUtc(maintenant));
    valeur.push({
      cle: 'deroule',
      nom: 'Déroulé des matchs terminés',
      quoi: 'buts, cartons et remplacements avec leur minute, gardés avec chaque feuille de match',
      fournisseur: 'FotMob — feuilles de match (actualisation complète)',
      tables: ['matches.events'],
      depuis: premier,
      depuisPrecision: 'début du magasin',
      hier: h.avec,
      aujourdhui: a.avec,
      hierSur: h.joues,
      aujourdhuiSur: a.joues,
      parJourUtc: true,
      dernierReleve: null,
      etat: env.matchStatsRefresh.enabled ? 'actif' : 'coupé',
      raison: env.matchStatsRefresh.enabled ? null : 'actualisation automatique coupée'
    });
  } catch (error) {
    valeur.push({ cle: 'deroule', nom: 'Déroulé des matchs terminés', etat: 'en erreur', raison: `lecture impossible : ${String(error.message).slice(0, 120)}`, hier: null, aujourdhui: null });
  }
  cacheDejaGardes = { at: maintenant, valeur };
  return valeur;
}

/** La dernière fois que l'étape « gel » de l'actualisation a tourné, et comment. */
function derniereEtapeGel() {
  try {
    const statut = readRefreshStatus();
    for (const passe of statut.history ?? []) {
      const etape = (passe.steps ?? []).find((s) => s.key === 'gelPronostics');
      if (etape && etape.status !== 'skipped') return { at: passe.finishedAt, status: etape.status, summary: etape.summary };
    }
    return null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ l'état
/**
 * L'état complet des enregistreurs : pour chacun, depuis quand il tourne,
 * les lignes gardées hier et aujourd'hui (jour de Paris), l'heure du dernier
 * relevé, son état (actif / coupé / en erreur) et pourquoi ; les relevés déjà
 * en place avant l'étape E ; les problèmes qui font l'alerte durable.
 */
export function etatEnregistreurs({ database = openDb(), maintenant = Date.now() } = {}) {
  const jour = jourParis(maintenant);
  const veille = veilleParis(maintenant);
  let comptes = [];
  let etats = [];
  let erreurLecture = null;
  try {
    ({ comptes, etats } = lireComptesEtEtats({ jours: [jour, veille], database }));
  } catch (error) {
    erreurLecture = String(error.message).slice(0, 200);
  }
  const coupure = raisonCoupure();
  const file = etatDeLaFile();
  const direct = getLiveWatchStatus(maintenant);
  const absents = etatAbsents();
  const payantes = etatCotesPayantes();
  const gel = derniereEtapeGel();
  let instantanePayant = null;
  try {
    const fichier = getFixturePaths().odds;
    instantanePayant = { fichier, releveAt: fs.statSync(fichier).mtime.toISOString() };
  } catch {
    instantanePayant = null;
  }

  const enregistreurs = ENREGISTREURS.map((e) => {
    const c = (j) => comptes.find((x) => x.recorder === e.cle && x.day === j);
    const st = etats.find((x) => x.recorder === e.cle) ?? null;
    const f = file.parEnregistreur?.[e.cle] ?? { enAttente: 0, perdues: 0, derniereErreur: null };
    const ligne = {
      ...e,
      depuis: st?.firstAt ?? null,
      hier: c(veille)?.rows ?? 0,
      aujourdhui: c(jour)?.rows ?? 0,
      dernierReleve: st?.lastAt ?? null,
      enAttente: f.enAttente,
      perdues: f.perdues,
      etat: 'actif',
      raison: null,
      detail: null
    };
    if (coupure) {
      ligne.etat = 'coupé';
      ligne.raison = coupure;
    }
    if (e.cle === 'direct') {
      ligne.detail = { enDirect: direct.enDirect, reglages: direct.reglages, dernierTour: direct.dernierTour, totaux: direct.totaux, suspenduJusqua: direct.suspenduJusqua };
      if (!coupure && env.enregistreurs?.direct === false) {
        ligne.etat = 'coupé';
        ligne.raison = 'boucle du direct coupée (ENREGISTREURS_DIRECT=false)';
      } else if (!coupure && direct.suspendu) {
        ligne.etat = 'en erreur';
        ligne.raison = `${direct.erreur?.erreurs ?? direct.erreursConsecutives} erreurs FotMob d’affilée : arrêtée jusqu’à ${direct.suspenduJusqua} (${direct.erreur?.message ?? direct.derniereErreur?.message ?? 'erreur inconnue'})`;
        ligne.erreurDepuis = direct.erreur?.depuis ?? null;
      }
    }
    if (e.cle === 'absents') {
      ligne.detail = absents?.at ? absents : null;
      if (!coupure && absents?.at && absents.lus === 0 && absents.echecs > 0) {
        ligne.etat = 'en erreur';
        ligne.raison = `FotMob n’a rendu aucune page de match à la dernière passe (${absents.echecs} échec(s) : ${absents.derniereErreur ?? 'erreur inconnue'})`;
      }
    }
    if (e.cle === 'cotes-payantes') {
      ligne.detail = { instantane: instantanePayant, dernierArchive: st?.sourceAt ?? null, bilan: st?.detail ?? null, derniere: payantes?.at ? payantes : null };
      if (!coupure && payantes?.statut === 'illisible') {
        ligne.etat = 'en erreur';
        ligne.raison = `instantané illisible : ${payantes.fichier}`;
      }
    }
    if (e.cle === 'gel') {
      ligne.detail = { derniereEtape: gel };
      if (!coupure && gel?.status === 'error') {
        ligne.etat = 'en erreur';
        ligne.raison = `dernière étape de gel en échec (${gel.at}) : ${gel.summary}`;
      }
    }
    if (!coupure && f.derniereErreur) {
      ligne.etat = 'en erreur';
      ligne.raison = `écriture en échec (${f.derniereErreur.at}) : ${f.derniereErreur.message}`;
    }
    return ligne;
  });

  const totaux = {
    hier: enregistreurs.reduce((n, e) => n + (e.hier ?? 0), 0),
    aujourdhui: enregistreurs.reduce((n, e) => n + (e.aujourdhui ?? 0), 0),
    enAttente: enregistreurs.reduce((n, e) => n + (e.enAttente ?? 0), 0),
    actifs: enregistreurs.filter((e) => e.etat === 'actif').length,
    nombre: enregistreurs.length
  };
  totaux.moyenneHier = enregistreurs.length ? totaux.hier / enregistreurs.length : 0;
  totaux.moyenneAujourdhui = enregistreurs.length ? totaux.aujourdhui / enregistreurs.length : 0;

  const etat = {
    generatedAt: iso(maintenant),
    jour,
    veille,
    base: (() => {
      try {
        return path.resolve(resolveDbPath());
      } catch {
        return null;
      }
    })(),
    demarres: planif.demarre,
    demarresA: planif.demarreA,
    coupure,
    enregistreurs,
    dejaGardes: dejaGardes(database, maintenant),
    totaux,
    file: { perdues: file.perdues, attenteDepuis: file.attenteDepuis, dernierVidage: file.dernierVidage, erreur: file.erreur },
    // La liste du jour FotMob, partagée entre toutes les boucles depuis le
    // démarrage du serveur : lectures faites, servies par le partage, en échec.
    listeDuJour: sharedDayListStats(),
    erreurLecture
  };
  etat.problemes = problemes(etat, { maintenant, direct, absents, payantes, gel, instantanePayant, etats });
  return etat;
}

/** Ce qui fait l'alerte durable : un relevé en erreur ou arrêté. Rien quand tout est coupé volontairement. */
function problemes(etat, { maintenant, direct, absents, payantes, gel, instantanePayant, etats }) {
  if (etat.coupure) return [];
  const liste = [];
  const nom = (cle) => etat.enregistreurs.find((e) => e.cle === cle)?.nom ?? cle;
  for (const e of etat.enregistreurs) if (e.etat === 'en erreur') liste.push({ cle: e.cle, nom: e.nom, probleme: e.raison, depuis: e.erreurDepuis ?? null });
  const deja = (cle) => liste.some((p) => p.cle === cle);
  // Arrêtés : la boucle ne tourne plus alors qu'elle devrait.
  if (!deja('direct') && env.enregistreurs?.direct !== false && direct.running && direct.dernierTour?.at && maintenant - Date.parse(direct.dernierTour.at) > SEUILS.directTourMs) {
    liste.push({ cle: 'direct', nom: nom('direct'), probleme: `la boucle du direct ne tourne plus depuis ${direct.dernierTour.at}`, depuis: direct.dernierTour.at });
  }
  const demarreDepuis = etat.demarresA ? maintenant - Date.parse(etat.demarresA) : 0;
  if (!deja('absents') && demarreDepuis > SEUILS.absentsPasseMs && (!absents?.at || maintenant - Date.parse(absents.at) > SEUILS.absentsPasseMs)) {
    liste.push({ cle: 'absents', nom: nom('absents'), probleme: `aucune passe des absents depuis ${absents?.at ?? etat.demarresA}`, depuis: absents?.at ?? etat.demarresA });
  }
  const dernierGel = etats.find((x) => x.recorder === 'gel')?.lastAt ?? null;
  const reference = dernierGel ?? etat.demarresA;
  if (!deja('gel') && env.matchStatsRefresh.enabled && reference && maintenant - Date.parse(reference) > SEUILS.gelMs) {
    liste.push({ cle: 'gel', nom: nom('gel'), probleme: dernierGel ? `aucun gel des pronostics depuis ${dernierGel}` : 'aucun gel des pronostics depuis le démarrage', depuis: reference });
  }
  const archive = etats.find((x) => x.recorder === 'cotes-payantes')?.sourceAt ?? null;
  if (!deja('cotes-payantes') && instantanePayant?.releveAt && (!archive || instantanePayant.releveAt > archive) && maintenant - Date.parse(instantanePayant.releveAt) > SEUILS.coteNonArchiveeMs && demarreDepuis > SEUILS.coteNonArchiveeMs) {
    liste.push({ cle: 'cotes-payantes', nom: nom('cotes-payantes'), probleme: `le relevé payant du ${instantanePayant.releveAt} n’est pas encore archivé (${payantes?.statut ?? 'en attente'})`, depuis: instantanePayant.releveAt });
  }
  if (etat.file.perdues > 0) liste.push({ cle: 'file', nom: 'Écritures des enregistreurs', probleme: `${etat.file.perdues} ligne(s) perdue(s) : la file d’écriture était pleine (verrou tenu trop longtemps)`, depuis: null });
  if (etat.file.attenteDepuis && maintenant - Date.parse(etat.file.attenteDepuis) > SEUILS.fileBloqueeMs) {
    liste.push({ cle: 'file', nom: 'Écritures des enregistreurs', probleme: `écritures en attente depuis ${etat.file.attenteDepuis} : le verrou d’actualisation est tenu (import ou passe en cours)`, depuis: etat.file.attenteDepuis });
  }
  return liste;
}

/**
 * Pose, met à jour ou lève l'alerte durable « enregistreurs »
 * (refresh-status.json), seulement quand elle change. Ne lève jamais.
 */
export function actualiserAlerte({ database = null, maintenant = Date.now() } = {}) {
  try {
    const etat = etatEnregistreurs({ database: database ?? openDb(), maintenant });
    const signature = JSON.stringify(etat.problemes.map(({ cle, probleme }) => [cle, probleme]));
    if (planif.derniereAlerte === undefined) {
      // Premier passage : partir de ce qui est déjà écrit (une relance du serveur ne la réécrit pas pour rien).
      const actuelle = readRefreshStatus().alerts?.enregistreurs ?? null;
      planif.derniereAlerte = JSON.stringify((actuelle?.releves ?? []).map(({ cle, probleme }) => [cle, probleme]));
    }
    if (signature !== planif.derniereAlerte) {
      setAlert('enregistreurs', etat.problemes.length ? { releves: etat.problemes, updatedAt: iso(maintenant) } : null);
      planif.derniereAlerte = signature;
    }
    return etat.problemes;
  } catch (error) {
    console.warn(`[enregistreurs] alerte non mise à jour : ${error.message}`);
    return null;
  }
}

/** Pour les tests. */
export function __oublierEtat() {
  Object.assign(planif, { demarre: false, demarreA: null, raison: null, tours: 0, dernierTour: null, derniereAlerte: undefined });
  cacheDejaGardes = { at: 0, valeur: null };
}
