/**
 * momentsCles.js — les MOMENTS CLÉS d'un match joué (étape 45 du plan, 24/10/2026) : ce qui a compté dans le déroulé, en mots simples.
 * Règles PURES (ni Vue, ni service, ni horloge), pour que le composant (KeyMomentsList.vue) n'ait qu'à les afficher et qu'un test les
 * rejoue sans navigateur.
 *
 * Ce qu'elles lisent est la réponse de GET /api/match-stats/:matchId/deroule : le serveur a déjà lu les événements du match avec la
 * fonction de l'étape 43 — la MÊME que celle de la revue d'après-match de l'IA —, qui tient les pièges de FotMob (le but contre son camp
 * est rangé du côté de l'équipe à qui il compte, le penalty reconnu, la deuxième jaune est un rouge, le score après chaque but, l'équipe
 * « à dix »). Rien n'est recalculé ici : on CHOISIT parmi ces faits ceux qui comptent (les buts, les penalties manqués, les expulsions,
 * les remplacements sur blessure) et on les dit. Les jaunes et les remplacements ordinaires restent dans le fil du match.
 *
 * Quatre règles de dessin de l'appli, tenues ici : ce qu'on ne sait pas se DIT (« non publié par FotMob », jamais « aucun but » ;
 * « seuls les buts sont publiés », jamais « aucune expulsion ») ; Σ (total) et ⌀ (moyenne) au pied du tableau ; la vraie provenance ;
 * le français simple, le vrai signe moins.
 */

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
export const nombreDit = (n) => Number(n ?? 0).toLocaleString('fr-FR');
export const pluriel = (n, un, plusieurs) => `${nombreDit(n)} ${Math.abs(Number(n ?? 0)) > 1 ? plusieurs : un}`;

/** Les nombres de joueurs restants, en lettres (« à dix »). Au-delà, le chiffre. */
const NOMBRES = Object.freeze({ 11: 'onze', 10: 'dix', 9: 'neuf', 8: 'huit', 7: 'sept', 6: 'six', 5: 'cinq' });

/** « 78' », « 45+2' », « ?' ». */
export const minuteDite = (f) => `${fini(f?.minute) ? f.minute : '?'}${fini(f?.plus) && f.plus > 0 ? `+${f.plus}` : ''}'`;

/** Les genres de moment : leur nom, l'icône et le ton de leur carré (jamais le vert : un but n'est pas une value). */
export const GENRES_DE_MOMENT = Object.freeze({
  but: { libelle: 'But', icone: 'ball', ton: '' },
  'penalty-manque': { libelle: 'Penalty manqué', icone: 'x', ton: 'is-warning' },
  expulsion: { libelle: 'Expulsion', icone: 'cards', ton: 'is-danger' },
  blessure: { libelle: 'Blessure', icone: 'userX', ton: 'is-info' }
});

/** Le geste d'un but, tel que le serveur le donne (« tête », « coup franc direct »…), en une courte phrase. */
const GESTES_DITS = Object.freeze({ tête: 'Marqué de la tête.', 'coup franc direct': 'Marqué sur coup franc direct.', 'retourné acrobatique': 'Marqué d’un retourné acrobatique.' });
const gesteDit = (geste) => (geste ? GESTES_DITS[geste] ?? `Geste : ${geste}.` : null);
const majuscule = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

const nomDuCamp = (noms, camp) => noms?.[camp] ?? (camp === 'home' ? 'domicile' : camp === 'away' ? 'extérieur' : 'équipe inconnue');
const autreCamp = (camp) => (camp === 'home' ? 'away' : camp === 'away' ? 'home' : null);

/** Un fait du déroulé qui est un moment clé → le moment, ou null (jaune, remplacement ordinaire…). */
function momentDe(f, noms, i) {
  const equipe = nomDuCamp(noms, f.camp);
  const base = { cle: `${f.genre}-${i}`, minute: f.minute ?? null, plus: f.plus ?? null, minuteDite: minuteDite(f), camp: f.camp ?? null, equipe, joueur: f.joueur ?? null, score: null, ordre: (fini(f.minute) ? f.minute : 999) * 100 + (fini(f.plus) ? f.plus : 0) };
  if (f.genre === 'but') {
    const qui = f.joueur ?? 'un joueur inconnu';
    const apres = f.apres ? `${f.apres.home}-${f.apres.away}` : null;
    if (f.csc) {
      // Le but contre son camp compte pour l'équipe du camp crédité ; le joueur est dans l'autre.
      return { ...base, genre: 'but', sousGenre: 'contre-son-camp', titre: `But contre son camp de ${qui}`, detail: `${nomDuCamp(noms, autreCamp(f.camp))} le marque contre lui-même : le but compte pour ${equipe}.`, score: apres, joueurDe: autreCamp(f.camp) };
    }
    if (f.penalty) return { ...base, genre: 'but', sousGenre: 'penalty', titre: `But de ${qui} sur penalty`, detail: null, score: apres, joueurDe: f.camp };
    return { ...base, genre: 'but', sousGenre: 'jeu', titre: `But de ${qui}`, detail: gesteDit(f.geste), score: apres, joueurDe: f.camp };
  }
  if (f.genre === 'penalty-manque') {
    return { ...base, genre: 'penalty-manque', sousGenre: 'penalty-manque', titre: `Penalty manqué par ${f.joueur ?? 'un joueur inconnu'}`, detail: f.issue ? `${majuscule(f.issue)}.` : 'On ne sait pas comment il a été manqué : FotMob ne le dit pas pour ce penalty.', joueurDe: f.camp };
  }
  if (f.genre === 'carton' && f.expulsion) {
    const nature = f.carton === 'deuxieme-jaune' ? 'Deuxième jaune puis rouge' : 'Rouge direct';
    const reste = fini(f.reste) ? ` ${equipe} joue désormais à ${NOMBRES[f.reste] ?? f.reste}.` : '';
    return { ...base, genre: 'expulsion', sousGenre: f.carton, titre: `${nature} pour ${f.joueur ?? 'un joueur inconnu'}`, detail: `${f.raison ? `Raison : ${f.raison}.` : ''}${reste}`.trim() || null, joueurDe: f.camp, reste: f.reste ?? null };
  }
  if (f.genre === 'remplacement' && f.blesse) {
    return { ...base, genre: 'blessure', sousGenre: 'blessure', titre: `${f.sortant ?? 'Un joueur'} sort sur blessure`, detail: f.entrant ? `${f.entrant} le remplace.` : null, joueur: f.sortant ?? null, joueurDe: f.camp };
  }
  return null;
}

/**
 * Les moments clés d'un match, dans l'ordre du jeu, avec ce qu'on ne sait pas.
 * `reponse` : la réponse de la route. Rend { etat, moments, resume, notes, pied, provenance }.
 * `etat` : 'inconnu' (pas de réponse), 'pas-joue', 'non-publie', 'sans-moment', 'pret'.
 */
export function momentsCles(reponse) {
  const vide = { moments: [], resume: resumeDe([]), notes: [], pied: piedDe([]) };
  if (!reponse) return { etat: 'inconnu', ...vide, provenance: null };
  const d = reponse.deroule ?? null;
  const noms = { home: reponse.home?.name ?? null, away: reponse.away?.name ?? null };
  const provenance = { source: reponse.provenance?.source ?? 'FotMob · événements du match', releveLe: reponse.majLe ?? null, fichier: reponse.provenance?.fichier ?? null, table: reponse.provenance?.table ?? null };
  if (reponse.jouee === false) return { etat: 'pas-joue', ...vide, provenance };
  if (!d?.disponible) return { etat: 'non-publie', ...vide, provenance };

  const moments = (d.faits ?? [])
    .map((f, i) => momentDe(f, noms, i))
    .filter(Boolean)
    .sort((a, b) => a.ordre - b.ordre);

  const notes = [];
  if (d.partiel && moments.length) notes.push({ cle: 'partiel', texte: 'FotMob n’a publié que les buts de ce match : ses cartons et ses remplacements ne sont pas connus. Il n’y a donc pas d’expulsion à lire ici, ce qui ne veut pas dire qu’il n’y en a pas eu.' });
  if (d.attribue) notes.push({ cle: 'attribue', texte: 'Résultat attribué hors du terrain : le score est celui de la fédération, le déroulé celui du match qui a été joué.' });
  if (d.coherent === false && !d.attribue && d.score) {
    notes.push({ cle: 'incomplet', texte: `Déroulé incomplet : ${pluriel((d.buts?.home ?? 0) + (d.buts?.away ?? 0), 'but listé', 'buts listés')} pour un score de ${d.score.home}-${d.score.away}. On n’en conclut rien sur ce qui manque.` });
  }
  if (d.tirsAuBut) notes.push({ cle: 'tirs-au-but', texte: d.prolongation ? 'Après prolongation puis tirs au but : la séance n’est pas dans le score ni dans cette liste.' : 'Tirs au but après les 90 minutes : la séance n’est pas dans le score ni dans cette liste.' });
  else if (d.prolongation) notes.push({ cle: 'prolongation', texte: 'Après prolongation : le score la compte.' });
  if (reponse.lectureRecente === false) notes.push({ cle: 'ancienne-lecture', texte: 'Ce match a été relevé avant la mise en service de l’étape 43 (ou sans texte minute par minute) : les blessures et les raisons des cartons peuvent manquer. Rien n’est redemandé à FotMob pour un ancien match.' });

  return { etat: moments.length ? 'pret' : 'sans-moment', moments, resume: resumeDe(moments), notes, pied: piedDe(moments), provenance, partiel: Boolean(d.partiel) };
}

/** Les comptes par genre. */
export function resumeDe(moments) {
  const n = (g) => moments.filter((m) => m.genre === g).length;
  return {
    total: moments.length,
    buts: n('but'),
    sansPenaltyNiCsc: moments.filter((m) => m.sousGenre === 'jeu').length,
    penalties: moments.filter((m) => m.sousGenre === 'penalty').length,
    contreSonCamp: moments.filter((m) => m.sousGenre === 'contre-son-camp').length,
    penaltiesManques: n('penalty-manque'),
    expulsions: n('expulsion'),
    blessures: n('blessure')
  };
}

/**
 * Le pied du tableau : Σ (les comptes) et ⌀ (la minute moyenne des moments — jamais une somme de minutes ni de pourcentages).
 * Sans moment : la structure reste, la moyenne n'est pas un zéro inventé.
 */
export function piedDe(moments) {
  const r = resumeDe(moments);
  const morceaux = [];
  if (r.buts) {
    const dont = [r.penalties ? pluriel(r.penalties, 'sur penalty', 'sur penalty') : null, r.contreSonCamp ? pluriel(r.contreSonCamp, 'contre son camp', 'contre leur camp') : null].filter(Boolean);
    morceaux.push(`${pluriel(r.buts, 'but', 'buts')}${dont.length ? ` (dont ${dont.join(', ')})` : ''}`);
  }
  if (r.penaltiesManques) morceaux.push(pluriel(r.penaltiesManques, 'penalty manqué', 'penalties manqués'));
  if (r.expulsions) morceaux.push(pluriel(r.expulsions, 'expulsion', 'expulsions'));
  if (r.blessures) morceaux.push(pluriel(r.blessures, 'blessure', 'blessures'));
  const minutes = moments.map((m) => m.minute).filter(fini);
  return {
    sigma: r.total ? `${pluriel(r.total, 'moment clé', 'moments clés')} : ${morceaux.join(', ')}` : '0 moment clé',
    moyenne: minutes.length ? `minute moyenne des moments : ${nombreDit(Math.round(minutes.reduce((a, x) => a + x, 0) / minutes.length))}'` : '—'
  };
}

/** L'état de la carte quand il n'y a pas (encore) de moment à montrer : le titre et la phrase. */
export function etatDesMoments({ chargement = false, erreur = null, reponse = null, matchId = null } = {}) {
  const garde = 'Le tableau ci-dessous reste affiché, sans valeurs.';
  if (!matchId) return { cle: 'sans-match', ton: 'is-warning', titre: 'Match non reconnu', texte: `La page n’a pas d’identifiant pour ce match. ${garde}` };
  if (erreur) {
    return /^Le serveur n.est pas à jour/.test(erreur)
      ? { cle: 'pas-a-jour-serveur', ton: 'is-warning', titre: 'Serveur à relancer', texte: `${erreur} ${garde}` }
      : { cle: 'erreur', ton: 'is-danger', titre: 'Moments clés illisibles', texte: `${erreur} ${garde}` };
  }
  if (chargement || !reponse) return { cle: 'chargement', ton: '', titre: 'Lecture en cours', texte: 'Lecture du déroulé…' };
  const lu = momentsCles(reponse);
  if (lu.etat === 'pas-joue') return { cle: 'pas-joue', ton: 'is-info', titre: 'Match pas encore joué', texte: `Les moments clés viennent du déroulé : ils apparaîtront une fois le match joué. ${garde}` };
  if (lu.etat === 'non-publie') return { cle: 'non-publie', ton: 'is-warning', titre: 'Déroulé non publié', texte: `FotMob n’a pas publié le déroulé de ce match : on ne connaît ni ses buts, ni ses cartons, ni ses remplacements (ce n’est pas « aucun but »). ${garde}` };
  if (lu.etat === 'sans-moment') {
    return { cle: 'sans-moment', ton: 'is-info', titre: lu.partiel ? 'Aucun but dans le déroulé' : 'Rien de marquant', texte: lu.partiel ? `Aucun but dans le déroulé, et FotMob n’a publié que les buts de ce match : ses cartons et ses remplacements ne sont pas connus. ${garde}` : `Ni but, ni penalty manqué, ni expulsion, ni blessure dans le déroulé de ce match. ${garde}` };
  }
  return { cle: 'pret', ton: '', titre: null, texte: null };
}

/** La phrase d'introduction de la carte. */
export const INTRO_DES_MOMENTS =
  'Les buts avec le score qui suit, les penalties manqués, les expulsions et les remplacements sur blessure, lus dans le déroulé du match — celui-là même que l’IA reçoit pour écrire son bilan. Les jaunes et les remplacements ordinaires sont dans le fil du match.';
