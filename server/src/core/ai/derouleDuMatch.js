/**
 * derouleDuMatch.js — le DÉROULÉ du match, lu pour la revue d'après-match de
 * l'IA (étape 43 du plan, 07/10/2026).
 * -----------------------------------------------------------------------
 * Avant cette étape, la revue recevait les buts (minute, camp, buteur), les
 * cartons rouges directs et quelques statistiques. Quatre erreurs s'y
 * cachaient, mesurées sur le magasin du bac (60 208 rencontres) :
 *   - le drapeau « penalty » était toujours faux : le lecteur FotMob n'a
 *     jamais rempli `penalty`, il range le type du but dans `detail`
 *     (« Penalty », « Header »…). 14 070 penalties marqués partaient à l'IA
 *     comme « non penalty » ;
 *   - la deuxième jaune (carton « yellowred ») n'était pas un rouge : 5 306
 *     expulsions sur 14 369 (37 %) n'étaient jamais dites ;
 *   - « buts : aucun · cartons rouges : aucun » s'écrivait aussi pour un match
 *     sans déroulé publié (921 matchs avec buts, 1 353 en tout), c'est-à-dire
 *     une affirmation fausse là où il fallait dire « inconnu » ;
 *   - un but contre son camp s'écrivait « Chelsea (Odoffin), contre son camp »
 *     alors que `side` est le camp CRÉDITÉ du but et le joueur un homme de
 *     l'AUTRE camp : lu comme « un joueur de Chelsea a marqué contre son
 *     camp », c'est le contraire de la vérité.
 * Ici, les mêmes événements — ceux déjà au magasin, anciens comme neufs —
 * deviennent 10 à 20 lignes courtes : buts (score après chacun, penalty,
 * contre son camp, geste), penalties manqués, cartons (jaune, rouge direct,
 * rouge après deux jaunes, avec « à dix »), remplacements (blessés dits).
 *
 * D'OÙ VIENT CHAQUE FAIT, et ce qu'on lit sur un match d'AVANT l'étape :
 *   - penalty marqué : `penalty: true` (matchs neufs) ou `detail` « Penalty »
 *     (tous les matchs) ;
 *   - penalty manqué : l'événement `missedpenalty` (matchs neufs) ou, pour les
 *     anciens, la carte des tirs (`situation: penalty`, issue ≠ but) — jamais
 *     les tirs d'une séance de tirs au but, qui y figurent aussi, en minutes
 *     91, 92, 93… (match de coupe sans prolongation) ou au-delà de la 120e ;
 *   - blessé : `injured` (matchs neufs) — rien dans les anciens ;
 *   - raison d'un carton, jaune montré à un remplaçant resté sur le banc :
 *     matchs neufs seulement.
 * Un champ absent n'est jamais deviné : la ligne dit ce qu'elle sait.
 *
 * PIÈGES FOTMOB tenus ici :
 *   - le camp : pour un but contre son camp `side` est le camp crédité, le
 *     joueur est dans l'autre camp (ligne : « but contre son camp de X (son
 *     équipe) ») ; partout ailleurs `side` est le camp du joueur ;
 *   - l'identifiant 0 : aucun rapprochement par identifiant ici, les lignes
 *     ne portent que des noms et des camps ;
 *   - un résultat attribué : le score est celui de la fédération, le déroulé
 *     celui du match joué — dit, jamais confronté ;
 *   - un déroulé qui ne retrouve pas le score (buts listés par camp ≠ score) :
 *     dit « incomplet », rien n'en est conclu ;
 *   - un déroulé absent (`events` nul) : « non publié », jamais « aucun but ».
 *
 * Fonctions pures : aucune base, aucun réseau, aucun Claude, aucune lecture de
 * l'environnement. Les anciens événements stockés se lisent sans changement.
 * -----------------------------------------------------------------------
 */

/** « 10 à 20 lignes courtes » : au-delà, les remplacements puis les jaunes se regroupent par équipe. */
export const LIGNES_MAX = 20;

const AUTRE = Object.freeze({ home: 'away', away: 'home' });

const entierOuNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Un texte écrit par une source sur une seule ligne. */
const uneLigne = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** `detail` de FotMob (goalDescription) → le geste, en français. Inconnu : tel quel, en minuscules. */
const GESTES = Object.freeze({
  header: 'tête',
  'direct freekick': 'coup franc direct',
  'overhead kick': 'retourné acrobatique'
});

/** `reason` d'un carton (clé de FotMob sans préfixe) → la raison, en français. Inconnue : la clé, sans tiret bas. */
const RAISONS = Object.freeze({
  foul: 'faute',
  time_wasting: 'perte de temps',
  dissent: 'contestation',
  unsporting_behaviour: 'comportement antisportif',
  unsporting_behavior: 'comportement antisportif',
  handball: 'main',
  simulation: 'simulation',
  violent_conduct: 'conduite violente',
  serious_foul_play: 'jeu dur grave',
  persistent_infringement: 'fautes répétées',
  tactical_foul: 'faute tactique',
  delaying_restart: 'retard à la reprise',
  excessive_celebration: 'célébration excessive',
  offensive_language: 'propos injurieux',
  dangerous_play: 'jeu dangereux'
});

/** Issue d'un penalty manqué (résultat de la carte des tirs de FotMob) → le mot. */
const ISSUES_PENALTY = Object.freeze({
  attemptsaved: 'arrêté par le gardien',
  saved: 'arrêté par le gardien',
  post: 'sur le poteau ou la barre',
  miss: 'à côté ou au-dessus',
  blocked: 'contré'
});

const NOMBRES = Object.freeze({ 11: 'onze', 10: 'dix', 9: 'neuf', 8: 'huit', 7: 'sept', 6: 'six', 5: 'cinq' });

// ============================================================ la lecture

/** Un événement stocké (forme d'avant l'étape 43 ou d'après) → un fait normalisé, ou null s'il n'est pas du déroulé. */
function faitDe(e) {
  if (!e || typeof e !== 'object') return null;
  const camp = e.side === 'home' || e.side === 'away' ? e.side : null;
  const base = { minute: entierOuNull(e.minute), plus: entierOuNull(e.addedTime) > 0 ? entierOuNull(e.addedTime) : null, camp };
  switch (e.type) {
    case 'goal': {
      const detail = uneLigne(e.detail);
      const csc = e.ownGoal === true || /^own goal$/i.test(detail);
      const penalty = !csc && (e.penalty === true || /^penalty$/i.test(detail));
      return {
        ...base,
        genre: 'but',
        joueur: uneLigne(e.player) || null,
        csc,
        penalty,
        // Le détail « Penalty » est dit par `penalty`, jamais une seconde fois comme un geste.
        geste: csc || penalty || !detail || /^penalty$/i.test(detail) ? null : (GESTES[detail.toLowerCase()] ?? detail.toLowerCase())
      };
    }
    case 'card': {
      const code = String(e.card ?? 'yellow').toLowerCase();
      const horsTerrain = e.notOnPitch === true || String(e.note ?? '').toLowerCase() === 'not_on_pitch';
      const motif = uneLigne(e.reason).toLowerCase();
      return {
        ...base,
        genre: 'carton',
        carton: code === 'yellow' ? 'jaune' : code === 'yellowred' ? 'deuxieme-jaune' : code === 'red' ? 'rouge' : code,
        joueur: uneLigne(e.player) || null,
        raison: motif ? (RAISONS[motif] ?? motif.replace(/_/g, ' ')) : null,
        horsTerrain,
        expulsion: !horsTerrain && /red/.test(code)
      };
    }
    case 'substitution':
      return { ...base, genre: 'remplacement', entrant: uneLigne(e.playerIn) || null, sortant: uneLigne(e.playerOut) || null, blesse: e.injured === true };
    case 'missedpenalty':
      return { ...base, genre: 'penalty-manque', joueur: uneLigne(e.player) || null, issue: null };
    default:
      return null;
  }
}

/**
 * Les faits d'un match, dans l'ordre, avec ce qu'on en tire.
 *
 * @param {object} p
 * @param {Array|null} p.events    événements TELS QUE STOCKÉS (`null` = aucun déroulé publié)
 * @param {Array|null} p.shotmap   carte des tirs stockée (penalties manqués des anciens matchs)
 * @param {object|null} p.meta     cadre stocké : `awarded`, `reason`
 * @param {{home:number, away:number}|null} p.score  score final du magasin
 */
export function lireDeroule({ events = null, shotmap = null, meta = null, score = null } = {}) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const attribue = m.awarded === true || m.awarded === 1 || m.reason === 'awarded_win' || m.reason === 'id_reused';
  const tirsAuBut = m.reason === 'afterpenalties';
  const scoreFinal = score && Number.isFinite(Number(score.home)) && Number.isFinite(Number(score.away)) ? { home: Number(score.home), away: Number(score.away) } : null;
  if (!Array.isArray(events)) {
    return { disponible: false, partiel: false, faits: [], buts: { home: 0, away: 0 }, mitemps: null, coherent: null, attribue, prolongation: m.reason === 'afterextra' || tirsAuBut, tirsAuBut, duree: null, cartons: cartonsVides(), score: scoreFinal };
  }

  const faits = events.map(faitDe).filter(Boolean);
  // Durée de jeu : 120 minutes dès qu'un événement dépasse la 90e (même règle que le lecteur FotMob).
  const duree = events.some((e) => (entierOuNull(e?.minute) ?? 0) > 90) ? 120 : 90;

  // Les penalties manqués des matchs d'avant l'étape 43 : la carte des tirs.
  // Un tir de séance de tirs au but n'est jamais un penalty du jeu : après la
  // durée de jeu quand le match s'est fini aux tirs au but ; au-delà de la 120e
  // sinon.
  const manques = faits.filter((f) => f.genre === 'penalty-manque');
  const tirs = (Array.isArray(shotmap) ? shotmap : []).filter((s) => {
    const minute = entierOuNull(s?.minute);
    return s?.situation === 'penalty' && s.result && s.result !== 'goal' && minute !== null && minute <= (tirsAuBut ? duree : 120) && (s.side === 'home' || s.side === 'away');
  });
  const pris = new Set();
  for (const f of manques) {
    const i = tirs.findIndex((s, k) => !pris.has(k) && s.side === f.camp && entierOuNull(s.minute) === f.minute);
    if (i !== -1) {
      pris.add(i);
      f.issue = ISSUES_PENALTY[String(tirs[i].result).toLowerCase()] ?? null;
    }
  }
  tirs.forEach((s, k) => {
    if (pris.has(k)) return;
    faits.push({ minute: entierOuNull(s.minute), plus: null, camp: s.side, genre: 'penalty-manque', joueur: uneLigne(s.player) || null, issue: ISSUES_PENALTY[String(s.result).toLowerCase()] ?? null });
  });

  // Dans l'ordre du jeu (tri stable : à minute égale, l'ordre de la source).
  faits.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0) || (a.plus ?? 0) - (b.plus ?? 0));

  // Ce qui se déduit de la suite : score après chaque but, joueurs restants après chaque expulsion.
  const buts = { home: 0, away: 0 };
  const reste = { home: 11, away: 11 };
  const cartons = cartonsVides();
  for (const f of faits) {
    if (f.genre === 'but' && f.camp) {
      buts[f.camp]++;
      f.apres = { home: buts.home, away: buts.away };
    } else if (f.genre === 'carton' && f.camp) {
      const c = cartons[f.camp];
      if (f.horsTerrain) c.horsTerrain++;
      else if (f.carton === 'jaune') c.jaunes++;
      else if (f.carton === 'deuxieme-jaune') c.deuxiemesJaunes++;
      else if (f.carton === 'rouge') c.rouges++;
      if (f.expulsion) {
        reste[f.camp]--;
        f.reste = reste[f.camp];
      }
    }
  }
  // Mi-temps : les arrêts de jeu de la première période sont en minute 45 (FotMob note 45+2 : minute 45, temps ajouté 2).
  const mitemps = { home: 0, away: 0 };
  for (const f of faits) if (f.genre === 'but' && f.camp && (f.minute ?? 999) <= 45) mitemps[f.camp]++;
  const coherent = scoreFinal ? buts.home === scoreFinal.home && buts.away === scoreFinal.away : null;
  // Ni carton ni remplacement dans tout le déroulé : FotMob n'a publié que les buts (couverture réduite, coupes de second rang) —
  // « 0 carton » y serait faux, il faut dire « non publié » (un match entier sans un seul remplacement n'existe pas).
  const partiel = !faits.some((f) => f.genre === 'carton' || f.genre === 'remplacement');
  return {
    disponible: true,
    partiel,
    faits,
    buts,
    mitemps: coherent ? mitemps : null,
    coherent,
    attribue,
    prolongation: m.reason === 'afterextra' || (tirsAuBut && duree === 120),
    tirsAuBut,
    duree,
    cartons,
    score: scoreFinal
  };
}

function cartonsVides() {
  const un = () => ({ jaunes: 0, deuxiemesJaunes: 0, rouges: 0, horsTerrain: 0 });
  return { home: un(), away: un() };
}

// ========================================================== le texte

const minuteDe = (f) => `${f.minute ?? '?'}${f.plus ? `+${f.plus}` : ''}'`;
const nomDe = (noms, camp) => noms?.[camp] ?? (camp === 'home' ? 'domicile' : camp === 'away' ? 'extérieur' : '?');

function ligneDeBut(f, noms) {
  const qui = f.csc ? `but contre son camp de ${f.joueur ?? 'joueur inconnu'} (${nomDe(noms, AUTRE[f.camp])})` : `but${f.joueur ? ` de ${f.joueur}` : ''}`;
  const precision = f.penalty ? ' (penalty)' : f.geste ? ` (${f.geste})` : '';
  const score = f.apres ? ` — ${f.apres.home}-${f.apres.away}` : '';
  return `${minuteDe(f)} ${nomDe(noms, f.camp)} : ${qui}${precision}${score}`;
}

function ligneDeCarton(f, noms) {
  const equipe = nomDe(noms, f.camp);
  const raison = f.raison ? ` (${f.raison})` : '';
  const hors = f.horsTerrain ? ' (remplaçant, hors du terrain)' : '';
  const joueur = f.joueur ?? 'joueur inconnu';
  if (f.carton === 'jaune') return `${minuteDe(f)} ${equipe} : jaune ${joueur}${raison}${hors}`;
  const nature = f.carton === 'deuxieme-jaune' ? 'rouge (2e jaune)' : f.carton === 'rouge' ? 'rouge direct' : `carton ${f.carton}`;
  const effet = f.expulsion ? ` → ${equipe} à ${NOMBRES[f.reste] ?? f.reste}` : '';
  return `${minuteDe(f)} ${equipe} : ${nature} ${joueur}${raison}${hors}${effet}`;
}

function lignePenaltyManque(f, noms) {
  return `${minuteDe(f)} ${nomDe(noms, f.camp)} : penalty manqué par ${f.joueur ?? 'joueur inconnu'}${f.issue ? ` (${f.issue})` : ''}`;
}

const remplacement = (f) => `${f.entrant ?? '?'} remplace ${f.sortant ?? '?'}${f.blesse ? ' (blessé)' : ''}`;

/**
 * Les lignes du déroulé : une par fait dans l'ordre du jeu (les remplacements
 * d'une même minute et d'un même camp sur une seule ligne) ; au-delà de
 * LIGNES_MAX, les remplacements d'abord puis les jaunes se regroupent en une
 * ligne par équipe — les buts, penalties manqués et expulsions restent un à un.
 */
export function lignesDeLaChronologie(d, noms) {
  const faits = d?.faits ?? [];
  const construire = ({ remplacementsParEquipe, jaunesParEquipe }) => {
    const lignes = [];
    const pris = new Set();
    const parEquipe = { remplacements: { home: [], away: [] }, jaunes: { home: [], away: [] } };
    faits.forEach((f, i) => {
      if (pris.has(i)) return;
      if (f.genre === 'remplacement') {
        if (remplacementsParEquipe) {
          parEquipe.remplacements[f.camp]?.push(f);
          return;
        }
        const memes = faits.filter((g, j) => !pris.has(j) && g.genre === 'remplacement' && g.camp === f.camp && g.minute === f.minute && g.plus === f.plus);
        memes.forEach((g) => pris.add(faits.indexOf(g)));
        lignes.push(`${minuteDe(f)} ${nomDe(noms, f.camp)} : ${memes.length > 1 ? 'remplacements' : 'remplacement'} ${memes.map(remplacement).join(', ')}`);
        return;
      }
      if (f.genre === 'carton' && f.carton === 'jaune' && jaunesParEquipe && !f.horsTerrain) {
        parEquipe.jaunes[f.camp]?.push(f);
        return;
      }
      lignes.push(f.genre === 'but' ? ligneDeBut(f, noms) : f.genre === 'carton' ? ligneDeCarton(f, noms) : lignePenaltyManque(f, noms));
    });
    if (remplacementsParEquipe) {
      for (const camp of ['home', 'away']) {
        const l = parEquipe.remplacements[camp];
        if (l.length) lignes.push(`Remplacements ${nomDe(noms, camp)} : ${l.map((f) => `${minuteDe(f)} ${remplacement(f)}`).join(' · ')}`);
      }
    }
    if (jaunesParEquipe) {
      for (const camp of ['home', 'away']) {
        const l = parEquipe.jaunes[camp];
        if (l.length) lignes.push(`Jaunes ${nomDe(noms, camp)} : ${l.map((f) => `${minuteDe(f)} ${f.joueur ?? 'joueur inconnu'}${f.raison ? ` (${f.raison})` : ''}`).join(' · ')}`);
      }
    }
    return lignes;
  };
  let lignes = construire({ remplacementsParEquipe: false, jaunesParEquipe: false });
  if (lignes.length > LIGNES_MAX) lignes = construire({ remplacementsParEquipe: true, jaunesParEquipe: false });
  if (lignes.length > LIGNES_MAX) lignes = construire({ remplacementsParEquipe: true, jaunesParEquipe: true });
  return lignes;
}

/** La ligne de score : final, mi-temps quand le déroulé retrouve le score, et ce qui change son sens (attribué, prolongation, tirs au but). */
export function ligneDuScore(d, noms) {
  const s = d?.score;
  const base = s ? `Score ${s.home}-${s.away}` : 'Score inconnu';
  const mt = d?.mitemps ? ` (mi-temps ${d.mitemps.home}-${d.mitemps.away})` : '';
  const notes = [];
  if (d?.attribue) notes.push('résultat attribué hors du terrain : le score est celui de la fédération, le déroulé celui du match joué');
  if (d?.tirsAuBut) notes.push(d.prolongation ? 'après prolongation puis tirs au but : la séance n’est pas dans le score' : 'tirs au but après 90 minutes : la séance n’est pas dans le score');
  else if (d?.prolongation) notes.push('après prolongation : le score les compte');
  return `${base}${mt}${notes.length ? ` · ${notes.join(' · ')}` : ''}`;
}

/**
 * Le récapitulatif des cartons montrés : les jaunes de chaque camp (tous ceux
 * du déroulé, y compris la première jaune d'un joueur ensuite expulsé), les
 * rouges (directs et deuxièmes jaunes). Les jaunes montrés à un remplaçant
 * resté sur le banc n'y sont pas. Un compte du déroulé, qui peut différer d'une
 * unité de la statistique d'équipe de FotMob (qui ne compte pas la première
 * jaune d'un joueur expulsé ni, parfois, celle d'un entraîneur).
 */
export function ligneDesCartons(d, noms) {
  const c = d?.cartons;
  if (!c) return null;
  const jaunes = ['home', 'away'].map((k) => `${nomDe(noms, k)} ${c[k].jaunes}`).join(', ');
  const rouges = ['home', 'away'].map((k) => `${nomDe(noms, k)} ${c[k].deuxiemesJaunes + c[k].rouges}`).join(', ');
  const deuxiemes = c.home.deuxiemesJaunes + c.away.deuxiemesJaunes;
  const hors = c.home.horsTerrain + c.away.horsTerrain;
  return `Cartons du déroulé : jaunes ${jaunes} · rouges ${rouges}${deuxiemes ? ` (dont ${deuxiemes} sur deuxième jaune, la première étant comptée parmi les jaunes)` : ''}${hors ? ` · ${hors} jaune(s) à un remplaçant hors du terrain, non compté(s)` : ''}`;
}

/**
 * Tout le déroulé en lignes, sous la ligne de score : la chronologie (ou ce
 * qu'on ne sait pas), puis le récapitulatif des cartons.
 */
export function lignesDuDeroule(d, noms) {
  if (!d?.disponible) {
    return [ligneDuScore(d, noms), 'Déroulé : non publié par FotMob pour ce match — les buts, cartons et remplacements ne sont pas connus (ce n’est pas « aucun »).'];
  }
  const chrono = lignesDeLaChronologie(d, noms);
  const sortie = [ligneDuScore(d, noms)];
  if (d.coherent === false && !d.attribue) {
    const listes = d.buts.home + d.buts.away;
    sortie.push(`Déroulé INCOMPLET : ${listes} but(s) listé(s) (${nomDe(noms, 'home')} ${d.buts.home}, ${nomDe(noms, 'away')} ${d.buts.away}) pour un score de ${d.score.home}-${d.score.away} — n’en conclus rien sur ce qui manque.`);
  }
  if (!chrono.length) sortie.push('Déroulé : aucun fait relevé par FotMob (ni but, ni carton, ni remplacement) — non relevé, pas « aucun ».');
  else sortie.push(`Déroulé (${chrono.length} ligne${chrono.length > 1 ? 's' : ''}) — « minute' équipe : fait », le score suit chaque but :`, ...chrono);
  if (!d.partiel) sortie.push(ligneDesCartons(d, noms));
  else if (chrono.length) sortie.push('Cartons et remplacements : non publiés par FotMob pour ce match (seuls les buts le sont) — ne conclus pas à « aucun ».');
  return sortie;
}
