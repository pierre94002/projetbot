/**
 * versionsMoteur.js — les règles d'écran de la carte « Versions du moteur »
 * (étape 25 du plan, le socle, 07/10/2026). Pur : ni Vue, ni navigateur —
 * rejoué tel quel par server/test/versionsMoteurEcran.test.mjs.
 *
 * Tout ce qui se décide (le numéro d'une version, ce qui a changé, si le
 * retour arrière est possible et pourquoi) l'est par le serveur
 * (server/src/core/engine/engineVersions.js, GET /api/config/versions) : ici,
 * on l'écrit en mots simples. Les dates sont celles de Paris.
 */

const FUSEAU = 'Europe/Paris';

/** « 07/10/2026 à 14:32 » (heure de Paris), ou le texte de repli. */
export function quandParis(iso, repli = 'date inconnue') {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return repli;
  const morceaux = Object.fromEntries(
    new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value])
  );
  return `${morceaux.day}/${morceaux.month}/${morceaux.year} à ${morceaux.hour}:${morceaux.minute}`;
}

/** Les nombres à la française (virgule, espaces simples entre les milliers, vrai signe moins). */
const nombreFr = (x, decimales = 4) =>
  Number(x)
    .toLocaleString('fr-FR', { maximumFractionDigits: decimales })
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/^-/, '−');

/** La valeur d'un réglage écrite pour Pierre : « 2 % », « 0,125 », « tous les bookmakers ». */
export function valeurDuReglage(valeur, format) {
  if (valeur === null || valeur === undefined) return 'non réglé';
  if (format === 'liste') {
    if (!Array.isArray(valeur)) return String(valeur);
    return valeur.length ? `${valeur.length} bookmaker${valeur.length > 1 ? 's' : ''}` : 'tous les bookmakers';
  }
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return format === 'pourcent' ? `${nombreFr(valeur * 100, 2)} %` : nombreFr(valeur, 4);
  if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non';
  if (typeof valeur === 'object') return JSON.stringify(valeur);
  return String(valeur);
}

const liste = (l) => (Array.isArray(l) ? l.join(', ') : '');

/** Une ligne « ce qui a changé » : { titre, texte }. Le code : les fichiers ; un réglage : avant → après. */
export function phraseDuChangement(c) {
  if (c?.type === 'code') {
    const morceaux = [];
    if (c.modifies?.length) morceaux.push(`${c.modifies.length > 1 ? 'fichiers modifiés' : 'fichier modifié'} : ${liste(c.modifies)}`);
    if (c.ajoutes?.length) morceaux.push(`${c.ajoutes.length > 1 ? 'fichiers ajoutés' : 'fichier ajouté'} : ${liste(c.ajoutes)}`);
    if (c.retires?.length) morceaux.push(`${c.retires.length > 1 ? 'fichiers retirés' : 'fichier retiré'} : ${liste(c.retires)}`);
    return { titre: 'Code du moteur', texte: morceaux.length ? morceaux.join(' ; ') : 'le code du moteur a changé' };
  }
  if (c?.type === 'reglage') {
    const titre = c.libelle ?? c.cle ?? 'Réglage';
    if (c.format === 'liste') {
      const morceaux = [];
      if (c.ajoutes?.length) morceaux.push(`ajouté${c.ajoutes.length > 1 ? 's' : ''} : ${liste(c.ajoutes)}`);
      if (c.retires?.length) morceaux.push(`retiré${c.retires.length > 1 ? 's' : ''} : ${liste(c.retires)}`);
      return { titre, texte: morceaux.length ? morceaux.join(' ; ') : `${valeurDuReglage(c.avant, 'liste')} → ${valeurDuReglage(c.apres, 'liste')}` };
    }
    return { titre, texte: `${valeurDuReglage(c.avant, c.format)} → ${valeurDuReglage(c.apres, c.format)}` };
  }
  return { titre: 'Changement', texte: 'non décrit' };
}

/** Ce qu'une version a changé, en lignes ; une version sans changement le dit (la première, une reprise). */
export function lignesDesChangements(version) {
  const changements = Array.isArray(version?.changements) ? version.changements : [];
  if (changements.length) return changements.map(phraseDuChangement);
  if (version?.origine === 'premier-demarrage') return [{ titre: 'Rien de changé', texte: 'c’est l’état du moteur au premier démarrage avec les versions' }];
  if (version?.origine === 'etat-initial') return [{ titre: 'Rien de changé', texte: 'c’est l’état du moteur noté avant le premier changement de réglages' }];
  return [{ titre: 'Rien de détaillé', texte: 'aucun changement noté pour cette version' }];
}

/** Le chiffre clé « Version en service ». */
export function kpiEnService(etat) {
  if (!etat) return { valeur: 'non lu', detail: 'état indisponible', ton: 'is-warn' };
  if (etat.source === 'illisible') return { valeur: 'illisible', detail: etat.probleme ?? 'registre des versions illisible', ton: 'is-danger' };
  if (!etat.enService) return { valeur: 'pas encore', detail: 'la version 1 sera notée au prochain démarrage du serveur, sans rien changer aux chiffres', ton: 'is-warn' };
  const v = etat.enService;
  return { valeur: `n° ${v.numero}`, detail: `depuis le ${quandParis(v.creeeLe)} — ${v.pourquoi ?? 'origine non dite'}`, ton: 'is-ok' };
}

/** Le chiffre clé « Retour arrière » : possible (vers quelle version) ou non (et pourquoi). */
export function kpiRetour(etat) {
  const r = etat?.retour;
  if (!r) return { valeur: 'non lu', detail: 'état indisponible', ton: 'is-warn' };
  if (r.possible) return { valeur: `vers la n° ${r.vers}`, detail: 'en un clic, avec une confirmation', ton: '' };
  return { valeur: 'pas maintenant', detail: r.texte ?? 'retour arrière impossible pour l’instant', ton: r.raison === 'registre-illisible' ? 'is-danger' : '' };
}

/** Le chiffre clé « Candidate en essai ». */
export function kpiCandidate(etat) {
  const c = etat?.candidate;
  if (etat?.candidateProbleme) return { valeur: 'refusée', detail: etat.candidateProbleme, ton: 'is-danger' };
  if (!c) return { valeur: 'aucune', detail: 'la première viendra de l’étape 27', ton: '' };
  return { valeur: c.id, detail: `étape ${c.etape} · ${c.quoi}`, ton: '' };
}

/** La place de chaque version précédente dans le retour arrière : la prochaine, plus loin, ou hors du chemin. */
export function placeDansLeRetour(version, etat) {
  if (!version) return '';
  const r = etat?.retour ?? null;
  if (r?.vers === version.numero && version.dansLaPile) {
    if (r.possible) return 'la prochaine si vous revenez en arrière';
    if (r.raison === 'code-different') return 'la précédente, mais avec un autre code : pas de retour d’un clic';
    return 'la précédente : retour arrière pas possible pour l’instant';
  }
  if (version.dansLaPile) return 'plus loin en arrière';
  return 'défaite par un retour arrière : on y revient en remettant ses réglages';
}

/** Le texte de la confirmation du retour arrière (window.confirm), ou null quand il n'est pas possible. */
export function texteDeConfirmation(etat) {
  const r = etat?.retour;
  if (!r?.possible || !etat?.enService) return null;
  const vers = (etat.precedentes ?? []).find((v) => v.numero === r.vers) ?? null;
  const lignes = (r.changements ?? []).map((c) => {
    const p = phraseDuChangement(c);
    return `• ${p.titre} : ${p.texte}`;
  });
  return (
    `Revenir à la version ${r.vers}${vers?.creeeLe ? ` (du ${quandParis(vers.creeeLe)})` : ''} ?\n\n` +
    `Les réglages du moteur redeviennent exactement ceux de cette version${lignes.length ? ` :\n${lignes.join('\n')}` : '.'}\n\n` +
    `Les pronostics calculés ensuite porteront la version ${r.vers}. Rien d'autre ne change : vos paris, les pronostics déjà enregistrés et les données restent tels quels.`
  );
}

/** Le message après un retour arrière réussi (réponse de POST /api/config/versions/retour). */
export function messageApresRetour(r) {
  if (!r || !Number.isInteger(r.vers)) return null;
  return `Version ${r.vers} remise en service (la version ${r.de} est gardée dans la liste) : les réglages du moteur sont exactement ceux de la version ${r.vers}.`;
}

/** La phrase d'un enregistrement des réglages (réponse de PUT /api/config ou POST /api/config/reset), pour le message de Réglages. */
export function phraseDeLEnregistrement(version) {
  if (!version || !Number.isInteger(version.numero)) return null;
  if (version.nouvelle) return `Nouvelle version du moteur : n° ${version.numero}.`;
  if (version.reprise) return `Retour à l’état de la version ${version.numero} du moteur.`;
  return `Rien de changé : toujours la version ${version.numero} du moteur.`;
}

// ------------------------------------------------------------------------
// Étape 25, SECONDE MOITIÉ (14/10/2026) : l'essai jugé, les deux verdicts,
// l'adoption et l'alerte de dérive. Le serveur décide (engineVersions.js,
// deriveMoteur.js) ; ici, on l'écrit en mots simples.
// ------------------------------------------------------------------------

/** « 17,8 % », « −2,1 % » (vrai signe moins), « + » devant un gain. */
export function pourcentSigne(x, decimales = 1) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 'non calculé';
  return `${x > 0 ? '+' : ''}${nombreFr(x, decimales)} %`;
}

/** Un écart de probabilité en points : −0,14 → « −14,0 points ». */
export function points(x) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 'non calculé';
  const v = Number((x * 100).toFixed(1));
  return `${v > 0 ? '+' : ''}${nombreFr(v, 1)} point${Math.abs(v) >= 2 ? 's' : ''}`;
}

/** Une probabilité en pourcent : 0,62 → « 62,0 % ». */
const pourcent = (x) => (typeof x === 'number' && Number.isFinite(x) ? `${(x * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace(/[  ]/g, ' ')} %` : 'non calculé');

/** « 15/10/2026 » (jour de Paris), ou le repli. */
export function jourParis(iso, repli = 'date inconnue') {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return repli;
  return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(t));
}

/** « octobre 2026 » pour « 2026-10 ». */
export function moisDit(mois) {
  const NOMS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  if (typeof mois !== 'string' || !/^\d{4}-\d{2}$/.test(mois)) return 'mois inconnu';
  return `${NOMS[Number(mois.slice(5, 7)) - 1]} ${mois.slice(0, 4)}`;
}

/** Un verdict du juge (étape 16) en mots simples, et son ton — jamais le vert : rien ici n'est une value. */
export const VERDICTS = Object.freeze({
  retenu: Object.freeze({ court: 'retenu', texte: 'meilleure que la version en service, au-delà du hasard', ton: 'is-info' }),
  'pas-prouve': Object.freeze({ court: 'pas prouvé', texte: 'l’écart avec la version en service peut venir du hasard', ton: 'is-warning' }),
  'moins-bon': Object.freeze({ court: 'moins bon', texte: 'moins bonne que la version en service, au-delà du hasard', ton: 'is-danger' }),
  'pas-assez-de-matchs': Object.freeze({ court: 'pas assez de matchs', texte: 'pas assez de matchs pour juger', ton: '' })
});
export const verdictDit = (v) => VERDICTS[v] ?? { court: String(v ?? 'aucun'), texte: String(v ?? 'aucun verdict'), ton: '' };

const nMatchs = (n) => `${Number(n ?? 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} match${(n ?? 0) > 1 ? 's' : ''}`;

/** L'erreur de prévision d'une version (perte log moyenne : plus petite = mieux), à 4 décimales. */
export const perteLogDite = (x) => (typeof x === 'number' && Number.isFinite(x) ? nombreFr(x, 4) : 'non calculée');

/**
 * Où en est l'essai à blanc (ses premiers chiffres, ou le chiffre du jugement), en mots simples ; null sans essai.
 * Rend { progression, horizon, lignes: [{ nom, valeur }], ecart, aVenir, ecartees }.
 */
export function etatDeLEssai(candidate) {
  if (!candidate?.essai) return null;
  const pc = candidate.premiersChiffres ?? null;
  const h = candidate.horizon ?? { matchs: 600, jours: 14 };
  const matchs = pc?.matchs ?? 0;
  const jours = pc?.joursEcoules ?? 0;
  const versionsDe = (src) => [
    { nom: `Version en service (n° ${candidate.essai.versionEnService ?? '?'})`, valeur: perteLogDite(src?.a) },
    { nom: `Candidate « ${candidate.id} »`, valeur: perteLogDite(src?.b) }
  ];
  const j = candidate.jugement ?? null;
  const gain = j ? j.gainPct : pc?.gainPct;
  let ecart = 'pas encore de match joué comparé';
  if (typeof gain === 'number' && Number.isFinite(gain)) {
    ecart = gain > 0 ? `la candidate devant de ${nombreFr(gain, 1)} %` : gain < 0 ? `la candidate derrière de ${nombreFr(-gain, 1)} %` : 'aucun écart';
    ecart += j ? ' (le chiffre du jugement)' : ' (premiers chiffres : pas de verdict avant l’horizon)';
  }
  const ecartees = Object.values(pc?.ecartees ?? {}).reduce((t, n) => t + (Number.isFinite(n) ? n : 0), 0);
  return {
    progression: j
      ? `Jugée le ${jourParis(j.le)} sur ${nMatchs(j.matchs)} joués depuis sa mise à blanc.`
      : `${nMatchs(matchs)} joué${matchs > 1 ? 's' : ''} comparé${matchs > 1 ? 's' : ''} sur ${h.matchs}, ${jours} jour${jours > 1 ? 's' : ''} sur ${h.jours} — le juge se prononce une seule fois, quand les deux sont atteints${pc?.auPlusTotLe ? ` (au plus tôt le ${jourParis(pc.auPlusTotLe)})` : ''}.`,
    horizon: `${h.matchs} matchs et ${h.jours} jours`,
    lignes: versionsDe(j ?? pc),
    ecart,
    aVenir: pc?.aVenir?.matchs ? `${nMatchs(pc.aVenir.matchs)} à venir déjà calculé${pc.aVenir.matchs > 1 ? 's' : ''} à blanc.` : null,
    ecartees: ecartees ? `${ecartees} ligne${ecartees > 1 ? 's' : ''} à blanc écartée${ecartees > 1 ? 's' : ''} (match non réglable, calculée après le coup d’envoi, autre version…).` : null
  };
}

/** Le verdict de l'ESSAI À BLANC — celui qui décide de l'adoption. */
export function verdictDeLEssai(candidate) {
  const j = candidate?.jugement ?? null;
  if (!j) {
    return { decide: true, juge: false, pastille: { texte: 'pas encore', ton: '' }, phrase: 'Pas encore de verdict : il tombe une seule fois, à l’horizon de l’essai, sur les matchs joués depuis la mise à blanc.', details: null };
  }
  const v = verdictDit(j.verdict);
  const f = Array.isArray(j.fourchettePct) ? `fourchette du hasard ${pourcentSigne(j.fourchettePct[0])} à ${pourcentSigne(j.fourchettePct[1])}` : 'sans fourchette';
  return {
    decide: true,
    juge: true,
    pastille: { texte: v.court, ton: v.ton },
    phrase: `La candidate est ${v.texte}.`,
    details: `Erreur de prévision ${pourcentSigne(j.gainPct)} en sa faveur (${f}) sur ${nMatchs(j.matchs)} joués, ${j.variantes ?? 1} variante${(j.variantes ?? 1) > 1 ? 's' : ''} essayée${(j.variantes ?? 1) > 1 ? 's' : ''} ; jugée le ${jourParis(j.le)}.`
  };
}

/** Le verdict du BANC AVANT L'ESSAI (matchs passés) : INDICATIF, il ne décide jamais. */
export function verdictDuBanc(candidate, banc = {}) {
  const b = candidate?.banc ?? null;
  const essaiJuge = Boolean(candidate?.jugement);
  if (banc?.enCours) return { indicatif: true, pastille: { texte: 'en cours', ton: '' }, etiquette: 'indicatif', phrase: `Le banc rejoue les matchs passés (${banc.enCours.rejeu ?? 'préparation'}) : quelques minutes.`, details: null };
  if (!b) {
    return {
      indicatif: true,
      pastille: { texte: 'pas lancé', ton: '' },
      etiquette: 'indicatif',
      phrase: 'Pas encore passée au banc : le banc la rejoue tout de suite sur les matchs passés (2019-2023, jamais vus), face à la version en service.',
      details: banc?.dernierRefus ? `Dernier essai du banc pas abouti le ${quandParis(banc.dernierRefus.le)} : ${banc.dernierRefus.raison}` : null
    };
  }
  const v = verdictDit(b.verdict);
  const f = Array.isArray(b.fourchettePct) ? `fourchette ${pourcentSigne(b.fourchettePct[0])} à ${pourcentSigne(b.fourchettePct[1])}` : 'sans fourchette';
  const vues = b.dejaVues?.part ? ` ; ${nombreFr(b.dejaVues.part * 100, 1)} % de ces matchs déjà vus par les réglages` : '';
  return {
    indicatif: true,
    pastille: { texte: v.court, ton: v.ton },
    etiquette: essaiJuge ? 'pour mémoire : l’essai à blanc a décidé' : 'indicatif : l’essai à blanc n’a pas encore assez de matchs',
    phrase: `Sur les matchs passés, la candidate est ${v.texte}.`,
    details: `Erreur de prévision ${pourcentSigne(b.gainPct)} en sa faveur (${f}) sur ${nMatchs(b.matchs)} de ${(b.periodes ?? []).join(', ') || 'P2'}, rejoués le ${jourParis(b.le)}${vues}.`
  };
}

/** Le chiffre clé « Adoption » : possible, pas maintenant (pourquoi), refusée. */
export function kpiAdoption(etat) {
  const a = etat?.adoption;
  if (!a) return { valeur: 'non lu', detail: 'état indisponible', ton: 'is-warn' };
  if (a.possible) return { valeur: 'possible', detail: 'le juge la dit meilleure : un clic, avec une confirmation', ton: '' };
  if (a.raison === 'moins-bon') return { valeur: 'refusée', detail: 'moins bonne que la version en service', ton: 'is-danger' };
  if (a.raison === 'aucune-candidate') return { valeur: 'rien à adopter', detail: 'aucune candidate en essai', ton: '' };
  if (a.raison === 'pas-prouve') return { valeur: 'pas prouvé', detail: 'l’écart peut venir du hasard', ton: 'is-warn' };
  return { valeur: 'pas maintenant', detail: a.texte ?? 'adoption impossible pour l’instant', ton: '' };
}

/** Le texte de la confirmation de l'adoption (window.confirm), ou null quand elle n'est pas possible. */
export function texteDeConfirmationAdoption(etat) {
  const a = etat?.adoption;
  const c = etat?.candidate;
  if (!a?.possible || !c?.jugement || !etat?.enService) return null;
  const j = c.jugement;
  const lignes = (a.changements ?? []).map((x) => {
    const p = phraseDuChangement(x);
    return `• ${p.titre} : ${p.texte}`;
  });
  return (
    `Adopter la candidate « ${c.id} » ?\n\n` +
    `Le juge de l'étape 16 la dit meilleure que la version en service : erreur de prévision ${pourcentSigne(j.gainPct)} en sa faveur sur ${nMatchs(j.matchs)} joués depuis sa mise à blanc (au-delà du hasard).\n\n` +
    `Les réglages du moteur deviennent${lignes.length ? ` :\n${lignes.join('\n')}` : ' ceux de la candidate.'}\n\n` +
    `Elle devient une nouvelle version du moteur ; les pronostics calculés ensuite la porteront. Vous pourrez revenir à la version ${etat.enService.numero} en un clic. Rien d'autre ne change : vos paris, les pronostics déjà enregistrés et les données restent tels quels.`
  );
}

/** Le message après une adoption réussie (réponse de POST /api/config/versions/adopter). */
export function messageApresAdoption(r) {
  if (!r || !Number.isInteger(r.vers)) return null;
  return (
    `Candidate « ${r.candidate} » adoptée : c'est maintenant la version ${r.vers} du moteur (la version ${r.de} reste dans la liste, un clic pour y revenir).` +
    (r.lancementADeclarer ? ' Son lancement sera noté au registre de la mesure au prochain démarrage du serveur.' : ' Son lancement est noté au registre de la mesure.')
  );
}

/** Un signal de dérive en une phrase. */
export function phraseDuSignal(s) {
  if (s?.type === 'cloture') {
    const f = Array.isArray(s.fourchette) ? ` (fourchette du hasard ${pourcentSigne(s.fourchette[0])} à ${pourcentSigne(s.fourchette[1])})` : '';
    return `Valeur de clôture des pronostics ${pourcentSigne(s.moyenne)}${f} sur ${nMatchs(s.matchs)} : après le gel, le marché va contre le moteur.`;
  }
  if (s?.type === 'calibration') {
    const f = Array.isArray(s.fourchette) ? `, fourchette du hasard ${points(s.fourchette[0])} à ${points(s.fourchette[1])}` : '';
    const sens = s.sens === 'trop-bas' ? 'le moteur annonce trop peu' : 'le moteur promet trop';
    return `${s.libelle ?? s.marche} : annoncé ${pourcent(s.annonce)}, arrivé ${pourcent(s.realise)} sur ${nMatchs(s.matchs)} (écart ${points(s.ecart)}${f} ; au départ ${points(s.reference?.ecart)}) — ${sens}.`;
  }
  return 'Signal non décrit.';
}

/** Une alerte de dérive (durable) en une phrase, pour la carte et la feuille de route ; null sans alerte. */
export function phraseDeLAlerteDerive(alerte) {
  if (!alerte || !Array.isArray(alerte.signaux) || !alerte.signaux.length) return null;
  const quoi = alerte.signaux.map((s) => (s.type === 'cloture' ? 'la valeur de clôture des pronostics' : s.libelle ?? s.marche)).join(', ');
  return `Dérive du moteur en ${moisDit(alerte.mois)} : l’écart entre ce qu’il annonce et ce qui arrive a grandi au-delà du hasard (${quoi}).`;
}

/** « ; 2 marchés trop maigres pour juger (moins de 200 matchs) », ou rien. */
function maigres(mois, minimum) {
  const n = (mois.examines ?? []).filter((x) => x.statut === 'trop-peu').length;
  return n ? ` ; ${n} marché${n > 1 ? 's' : ''} trop maigre${n > 1 ? 's' : ''} pour juger (moins de ${minimum} matchs)` : '';
}

/** Le bloc « Alerte de dérive » de la carte : { ton, titre, phrase, signaux, dernierMois, regle }. */
export function etatDeLaDerive(etat) {
  const d = etat?.derive ?? null;
  if (!d) return { ton: '', titre: 'non lu', phrase: 'La dérive n’est pas encore lue par ce serveur (relancez-le après la mise à jour).', signaux: [], dernierMois: null, regle: [] };
  const regle = [d.regle?.calibration, d.regle?.cloture, d.regle?.maigre].filter(Boolean);
  const alerte = d.alerte ?? null;
  const mois = d.dernierMois ?? null;
  const dernierMois = mois
    ? `Dernier mois figé jugé : ${moisDit(mois.mois)} — ${mois.derive ? 'dérive' : 'pas de dérive'}${maigres(mois, d.regle?.minimum ?? 200)}.`
    : d.probleme
      ? `Les mois figés ne se lisent pas pour l’instant : ${d.probleme}`
      : 'Aucun mois figé encore : la première vérification se fera au premier mois figé (le 1er du mois suivant, à 6 h).';
  if (alerte) return { ton: 'is-danger', titre: 'alerte', phrase: phraseDeLAlerteDerive(alerte), signaux: (alerte.signaux ?? []).map(phraseDuSignal), dernierMois, regle };
  return { ton: '', titre: mois ? 'aucune' : 'pas encore jugée', phrase: mois ? 'Pas de dérive au dernier mois figé.' : 'Pas encore de mois figé à juger.', signaux: [], dernierMois, regle };
}

/** Le chiffre clé « Dérive ». */
export function kpiDerive(etat) {
  const e = etatDeLaDerive(etat);
  if (e.ton === 'is-danger') return { valeur: 'alerte', detail: e.phrase, ton: 'is-danger' };
  return { valeur: e.titre, detail: e.dernierMois ?? e.phrase, ton: '' };
}

/** Les phrases fixes de la carte : simples, pour Pierre. */
export const PHRASES = Object.freeze({
  quoi:
    'Chaque état du moteur — ses réglages et son code — a un numéro. Chaque pronostic enregistré garde le numéro de la version qui l’a calculé, pour comparer les versions sur des matchs joués et revenir en arrière si une version fait moins bien.',
  candidate:
    'Une version candidate est calculée « à blanc » chaque nuit, à côté de la version en service, seulement pour les marchés qu’elle change. Ses chiffres sont gardés à part : jamais montrés comme pronostic, jamais pariés, jamais envoyés à l’IA.',
  aBlanc:
    'Le moteur calcule la candidate en plus de la version en service, sur les mêmes matchs et avec les mêmes données. Ses chiffres servent seulement à la comparer, plus tard, sur les matchs joués.',
  aucuneCandidate: 'Aucune version candidate en essai pour l’instant. La première viendra de l’étape 27 (modèle de score ancré sur le marché).',
  retour:
    'Revenir en arrière remet d’un bloc les réglages de la version précédente : exactement ses chiffres, et son numéro. Jamais pendant une actualisation des données ; seulement vers une version au même code (un clic remet des réglages, pas du code).',
  sansVersion: 'Les pronostics enregistrés avant la première version restent tels quels : « sans version ».',
  // Étape 25, seconde moitié (14/10/2026).
  essai:
    'Chaque nuit, la candidate est comparée à la version en service sur les matchs joués depuis sa mise à blanc. Le juge ne se prononce qu’une fois, à l’horizon fixé d’avance : regarder chaque soir et s’arrêter au premier bon chiffre fabriquerait de fausses preuves.',
  adoption:
    'Adopter remplace les réglages du moteur par ceux de la candidate, en une fois, seulement si le juge de l’étape 16 la dit meilleure sur des matchs joués après sa mise à blanc. Jamais pendant une actualisation ; on revient en arrière en un clic.',
  banc: 'Le banc d’essai la rejoue tout de suite sur les matchs passés : utile pour se faire une idée, jamais une preuve — ces matchs ont pu servir à la construire, et ils ne disent rien des matchs à venir.',
  derive: 'Il y a dérive quand l’écart entre ce que le moteur annonce et ce qui arrive grandit au-delà du hasard, par rapport à son départ (le banc d’essai, 2019-2023).'
});
