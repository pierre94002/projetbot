/**
 * contexteEnfant.js — LE CALCUL DE LA NUIT DU CONTEXTE, DANS UN PROCESSUS À PART (étape 32 du plan, lot 1a, 29/10/2026).
 * -----------------------------------------------------------------------
 * Lancé par contexteNuit.js (fork, sérialisation « avancée », argument « --enfant-contexte ») ; ce n'est pas un script
 * à lancer à la main. La base est ouverte EN LECTURE SEULE avant toute lecture (openDb({ readonly: true }) : jamais un
 * second écrivain, c'est le serveur seul qui range) ; aucune horloge (l'instant de la passe est reçu) ; ni réseau, ni
 * Claude. Mode « nuit » (le banc, partie B, ajoutera les siens) :
 *   0. LA LISTE du calendrier de saison, rattachée aux identifiants par l'annuaire strict (listeDuCalendrier.js ; dans le
 *      serveur, elle le tenait jusqu'à 1 405 ms d'affilée) — l'annuaire pas prêt : la nuit est REPORTÉE ;
 *   1. le cache incrémental des rencontres (lectureDuMagasin.mettreAJourLeCache : seules les rencontres nouvelles ou
 *      changées sont relues) — les lignes à écrire et les clés à retirer sont renvoyées au serveur ;
 *   2. LA PASSE chronologique de tout le magasin jusqu'à la veille du jour de la nuit (ContexteAuJourJ), avec le crochet
 *      du contrôle anti-fuite (les couples tirés sont relevés AVANT la publication de leur journée) ;
 *   3. les FICHES des matchs des 14 prochains jours (la liste du calendrier) : le précédent plus récent que la passe
 *      (match joué depuis, ou prévu au calendrier), le prochain match ;
 *   4. la table des arbitres et les moyennes des championnats au jour de la nuit ;
 *   5. le contrôle anti-fuite (le second chemin, controleDuContexte.js).
 * Renvoie par morceaux ({ morceau: { type, lignes } }), puis la fin ({ fin: true, ligues, controle, bilan }) ou
 * { erreur }, et s'arrête. `calculerLaNuitDuContexte` est aussi appelable dans le processus courant (les essais).
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { lireStades } from '../reference/donneesDeReference.js';
import { executerSansPause } from '../../utils/travailCooperatif.js';
import { VERSION_CONTEXTE, NUIT } from './reglagesContexte.js';
import { numeroDuClub, jourDe } from './formulesDuContexte.js';
import { ContexteAuJourJ, passerLesRencontres } from './contexteAuJourJ.js';
import { mettreAJourLeCache, rencontresChronologiques } from './lectureDuMagasin.js';
import { ligneDeLaTable } from '../db/refereeRead.js';
import { tirerLesCouples, instantaneDeLaPasse, controlerLesInstantanes } from './controleDuContexte.js';
import { listeDuCalendrier, AnnuairesIndisponibles } from './listeDuCalendrier.js';

const JOUR_MS = 86_400_000;
/** Lignes par morceau renvoyé au serveur. */
export const LIGNES_PAR_MORCEAU = 500;
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const ordre = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/**
 * LE CALCUL DE LA NUIT (le corps du processus à part). `database` : une base ouverte (en lecture seule dans la nuit) ;
 * `instant` (ms) et `jourD` (le jour de Paris de la passe) : reçus, jamais lus à l'horloge ; `fichierCalendrier` : le
 * calendrier de saison (par défaut celui de l'appli), dont la liste est faite ici — ou `calendrier`, une liste déjà
 * rattachée ([{ date, league, home, away, statut, matchId, homeName, awayName }], de jourD − 2 à jourD + 18) ; `clubDe` :
 * l'annuaire (les essais) ; `graine` : celle du contrôle ; `venues` : venues.json (par défaut, celui du code) ;
 * `envoyer(type, lignes)` reçoit chaque morceau. Lève AnnuairesIndisponibles si l'annuaire n'est pas prêt. Rend
 * { liste, ligues, controle, bilan }.
 */
export function calculerLaNuitDuContexte({ database, instant, jourD, calendrier = null, fichierCalendrier = undefined, clubDe = null, graine = null, couples: nombreDeCouples = NUIT.couples, venues = undefined, envoyer = () => {} }) {
  const t0 = performance.now();
  const durees = {};
  let rssMax = process.memoryUsage.rss();
  const mesurer = (nom, debut) => {
    durees[nom] = Math.round(performance.now() - debut);
    rssMax = Math.max(rssMax, process.memoryUsage.rss());
  };
  const parMorceaux = (type, lignes) => {
    for (let i = 0; i < lignes.length; i += LIGNES_PAR_MORCEAU) envoyer(type, lignes.slice(i, i + LIGNES_PAR_MORCEAU));
  };
  const calculeLe = new Date(instant).toISOString();

  // 0. La liste du calendrier (l'annuaire strict, ici : jamais dans le serveur).
  let t = performance.now();
  let liste = null;
  if (!Array.isArray(calendrier)) {
    liste = executerSansPause(listeDuCalendrier({ database, fichierCalendrier, jourD, clubDe }));
    calendrier = liste.items;
  }
  mesurer('liste', t);

  // 1. Le cache incrémental des rencontres.
  t = performance.now();
  const maj = executerSansPause(mettreAJourLeCache(database));
  parMorceaux('rencontres', maj.aEcrire);
  parMorceaux('retirees', maj.aRetirer);
  mesurer('cache', t);

  // 2. La passe, jusqu'à la veille du jour de la nuit, avec le crochet du contrôle.
  t = performance.now();
  const contexte = new ContexteAuJourJ({ venues: venues === undefined ? lireStades() : venues });
  const couples = tirerLesCouples({ database, jourD, graine, nombre: nombreDeCouples });
  const parJour = new Map();
  for (const c of couples) {
    if (!parJour.has(c.date)) parJour.set(c.date, []);
    parJour.get(c.date).push(c);
  }
  const instantanes = new Map();
  const veille = plusJours(jourD, -1);
  const passe = executerSansPause(
    passerLesRencontres(contexte, rencontresChronologiques({ database, cache: maj.cache, jusqua: veille }), {
      avantLaJournee: (jour, duJour) => {
        for (const c of parJour.get(jour) ?? []) {
          const r = duJour.find((x) => x.matchKey === c.matchKey);
          if (r) instantanes.set(`${c.matchKey}|${c.camp}`, instantaneDeLaPasse(contexte, c, r));
        }
      }
    })
  );
  mesurer('passe', t);

  // 3. Les fiches des matchs des 14 prochains jours.
  t = performance.now();
  const fin14 = plusJours(jourD, NUIT.fenetreJours);
  // Les matchs JOUÉS depuis le début du jour de la nuit (au magasin, hors de la passe) et ceux du calendrier qui ne sont
  // pas (encore) au magasin : candidats au « précédent » d'une fiche, s'ils sont d'avant son jour.
  const recents = new Map();
  const ajouterRecent = (club, m) => {
    if (!recents.has(club)) recents.set(club, []);
    recents.get(club).push(m);
  };
  for (const r of rencontresChronologiques({ database, cache: maj.cache, depuis: jourD })) {
    if (r.attribue) continue;
    for (const camp of ['home', 'away']) ajouterRecent(r[camp], { date: r.date, kickoff: r.kickoff, kickoffConnu: r.kickoffConnu, league: r.league, coupe: r.coupe, prolongation: r.prolongation, prevu: false, source: 'magasin' });
  }
  const enMagasin = new Set();
  for (const r of database.prepare('SELECT date, home, away FROM day_matches WHERE date >= ?').iterate(plusJours(jourD, -(NUIT.prevusDepuisJours + 2)))) enMagasin.add(`${r.home}|${r.away}|${r.date}`);
  const dejaAuMagasin = (it) => [-1, 0, 1].some((k) => enMagasin.has(`${it.home}|${it.away}|${plusJours(it.date, k)}`));
  const prochains = new Map();
  for (const it of calendrier) {
    const home = numeroDuClub(it.home);
    const away = numeroDuClub(it.away);
    const date = jourDe(it.date);
    if (home === null || away === null || !date) continue;
    if (it.statut === 'scheduled' && date >= jourD) {
      for (const club of [home, away]) {
        if (!prochains.has(club)) prochains.set(club, []);
        prochains.get(club).push({ date, kickoff: null, kickoffConnu: false, league: it.league ?? null, source: 'calendrier' });
      }
    }
    if (date <= fin14 && !dejaAuMagasin({ home, away, date })) {
      for (const club of [home, away]) ajouterRecent(club, { date, kickoff: null, kickoffConnu: false, league: it.league ?? null, prolongation: false, prevu: it.statut === 'scheduled', source: 'calendrier' });
    }
  }
  for (const l of prochains.values()) l.sort(ordre);
  for (const l of recents.values()) l.sort(ordre);
  const plusRecentAvant = (club, J) => {
    const l = recents.get(club) ?? [];
    let m = null;
    for (const x of l) if (x.date < J) m = x;
    return m;
  };
  const fiches = [];
  const vues = new Set();
  for (const it of calendrier) {
    const home = numeroDuClub(it.home);
    const away = numeroDuClub(it.away);
    const date = jourDe(it.date);
    if (it.statut !== 'scheduled' || home === null || away === null || !date || date < jourD || date > fin14) continue;
    const cle = `${date}|${home}|${away}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    const fiche = contexte.fiche({
      rencontre: { date, kickoff: null, kickoffConnu: false, league: it.league ?? null, home, away, stade: null, surface: null, arbitre: null },
      prochains,
      prevus: { [home]: plusRecentAvant(home, date), [away]: plusRecentAvant(away, date) },
      calculeLe
    });
    fiches.push({ date, home_id: home, away_id: away, league: it.league ?? null, match_id: it.matchId ?? null, home_name: it.homeName ?? null, away_name: it.awayName ?? null, kickoff: null, kickoff_connu: 0, calcule_le: calculeLe, version: VERSION_CONTEXTE, facteurs: JSON.stringify(fiche) });
  }
  parMorceaux('fiches', fiches);
  mesurer('fiches', t);

  // 4. Les arbitres et les championnats au jour de la nuit.
  t = performance.now();
  const arbitres = contexte.arbitres.cles().sort().map((cle) => ligneDeLaTable(contexte.arbitres.etat(cle), { calculeLe, version: VERSION_CONTEXTE }));
  parMorceaux('arbitres', arbitres);
  const ligues = Object.fromEntries(contexte.arbitres.liguesConnues().map((l) => [l, contexte.arbitres.ligue(l, jourD)]));
  mesurer('arbitres', t);

  // 5. Le contrôle anti-fuite.
  t = performance.now();
  const noms = new Map();
  const nomDuClub = (club) => {
    if (!noms.has(club)) {
      let nom = null;
      try {
        nom = database.prepare('SELECT name FROM teams WHERE team_id = ?').get(`fotmob-${club}`)?.name ?? null;
      } catch {
        nom = null;
      }
      noms.set(club, nom ?? `club n° ${club}`);
    }
    return noms.get(club);
  };
  const controle = controlerLesInstantanes({ database, couples, instantanes, nomDuClub });
  mesurer('controle', t);

  return {
    liste: liste ? { items: liste.items.length, sansIdentifiant: liste.sansIdentifiant, noms: liste.noms } : { items: calendrier.length, sansIdentifiant: [], noms: null },
    ligues,
    controle: { lignes: controle.lignes, ecarts: controle.ecarts, couples: couples.length },
    bilan: {
      calculeLe,
      jourD,
      cache: { mode: maj.mode, relues: maj.relues, ecrites: maj.aEcrire.length, retirees: maj.aRetirer.length, total: maj.cache.size },
      passe: { rencontres: passe.rencontres, jours: passe.jours, dernierJour: passe.dernierJour },
      fiches: fiches.length,
      arbitres: arbitres.length,
      ligues: Object.keys(ligues).length,
      dureeMs: Math.round(performance.now() - t0),
      durees,
      aPart: { pid: process.pid, rssMaxOctets: Math.max(rssMax, process.memoryUsage.rss()) }
    }
  };
}

// ------------------------------------------------------------ le processus à part
if (process.argv.includes('--enfant-contexte') && typeof process.send === 'function') {
  process.once('message', (m) => {
    try {
      if (m?.mode !== 'nuit') throw new Error(`mode inconnu « ${m?.mode ?? ''} »`);
      const database = openDb({ file: m.chemin, readonly: true });
      const r = calculerLaNuitDuContexte({ ...m, database, envoyer: (type, lignes) => process.send({ morceau: { type, lignes } }) });
      process.send({ fin: true, ...r }, () => process.exit(0));
    } catch (error) {
      if (error instanceof AnnuairesIndisponibles) {
        process.send({ fin: true, reporte: error.message }, () => process.exit(0));
        return;
      }
      process.send({ erreur: String(error?.stack ?? error?.message ?? error).slice(0, 2000) }, () => process.exit(0));
    }
  });
}
