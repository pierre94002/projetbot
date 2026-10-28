/**
 * bancCorrectionEnfant.js — LE BANC D'ESSAI D'UNE CORRECTION dans un PROCESSUS À PART (étape 26 du plan, partie B,
 * 28/10/2026 ; constat 1 de la critique). Lancé par bancDesCorrections.jugerAPart (fork) ; ce n'est pas un script à
 * lancer à la main.
 *
 * POURQUOI À PART : le banc rejoue le moteur deux fois sur les matchs 2019-2023 (la version en service, puis la
 * correction) — environ 2 × 4 à 5 min et ~0,9 Go. Dans le serveur, cette mémoire resterait tenue après coup (V8 ne la
 * rend pas au système dans un processus qui vit) et la boucle d'événements serait retenue (patron du 19/10 :
 * data/db/bancEnfant.js). Ici, la mémoire part avec l'enfant ; le serveur attend la réponse sans rien bloquer.
 *
 * L'enfant NE FAIT QUE LIRE : la base EN LECTURE SEULE, et le registre de la mesure (le nombre de corrections déjà
 * comptées : la marge du juge). C'est le serveur qui a compté la correction AVANT le fork, et c'est lui qui écrit
 * l'état et le journal à la réponse : un seul écrivain.
 *
 * Reçoit { chemin, candidate, reglagesEnService, reglagesCandidate, rejeuDEssai } par le canal du processus parent,
 * envoie son avancement ({ avancement }), puis { verdict, enfant } ou { erreur }, et s'arrête. `rejeuDEssai` : le
 * chemin d'un rejeu FABRIQUÉ, accepté seulement dans une copie d'essai (CM_TEST_DOSSIER, test/aides/isolement.mjs) —
 * l'appli ne peut pas s'en servir.
 */

import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { jugerLaCandidateAuBanc } from '../../bench/bancCandidate.js';

process.once('message', async ({ chemin, candidate, reglagesEnService, reglagesCandidate, rejeuDEssai = null }) => {
  let db = null;
  let reponse;
  let rssMax = process.memoryUsage().rss;
  const releve = setInterval(() => {
    rssMax = Math.max(rssMax, process.memoryUsage().rss);
  }, 1000);
  releve.unref?.();
  try {
    let rejouer;
    if (rejeuDEssai) {
      if (!process.env.CM_TEST_DOSSIER) throw new Error('Rejeu fabriqué réservé aux essais (copie isolée, CM_TEST_DOSSIER).');
      rejouer = (await import(pathToFileURL(rejeuDEssai).href)).rejouer;
    }
    db = new DatabaseSync(chemin, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 15000;');
    // La main rendue toutes les ~25 ms : l'avancement part au fil du rejeu (le canal ne s'écrit qu'entre deux tâches).
    const verdict = await jugerLaCandidateAuBanc({
      candidate,
      reglagesEnService,
      reglagesCandidate,
      database: db,
      rendreLaMain: (fin) => setImmediate(fin),
      avancement: (a) => process.send({ avancement: a }),
      ...(rejouer ? { rejouer } : {})
    });
    rssMax = Math.max(rssMax, process.memoryUsage().rss);
    reponse = { verdict, enfant: { pid: process.pid, rssMaxOctets: rssMax, rssFinOctets: process.memoryUsage().rss } };
  } catch (error) {
    reponse = { erreur: `${error?.name && error.name !== 'Error' ? `${error.name} : ` : ''}${String(error?.message ?? error)}` };
  } finally {
    clearInterval(releve);
    try {
      db?.close();
    } catch {
      // déjà fermée
    }
  }
  process.send(reponse, () => process.exit(0));
});
