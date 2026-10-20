/**
 * La carte « Table du jour J » de Réglages (étape 17 du plan, 12/10/2026) :
 * ses règles d'écran, sans Vue. Quatre lignes, TOUJOURS les quatre — sans
 * table, en erreur ou pas encore lue (ui/DESIGN.md : la structure complète, la
 * raison dite, jamais un simple tiret). Lu par DayTablePanel.vue ; testé par
 * server/test/tableJourJ.test.mjs sur la vraie réponse de
 * GET /api/match-stats/day-table (l'état noté par la dernière construction
 * ou nuit de l'actualisation : rien n'est recompté à l'ouverture).
 */

const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${Math.abs(Number(n ?? 0)) > 1 ? plusieurs : un}`;

const FORMAT_JOUR_MOIS = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' });
const FORMAT_HEURE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

/** « le 07/10 à 02:14 » (heure de Paris) ; null sans instant lisible. */
export function leA(iso) {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return `le ${FORMAT_JOUR_MOIS.format(t)} à ${FORMAT_HEURE.format(t)}`;
}

/** « 06/10/2026 » depuis « 2026-10-06 » : le jour des rencontres (UTC), sans fuseau à appliquer. */
export function jourComplet(jour) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(jour ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/** Ce que disent Équipes et Joueurs tant que la table n'existe pas. */
export const PAS_ENCORE_CONSTRUITE = 'pas encore construite : la première passe d’actualisation la construit (une minute après le démarrage de l’appli, 1 à 2 min)';

/** Les quatre lignes, dans cet ordre. */
export const LIGNES = Object.freeze([
  Object.freeze({ cle: 'equipes', nom: 'Équipes' }),
  Object.freeze({ cle: 'joueurs', nom: 'Joueurs' }),
  Object.freeze({ cle: 'aJour', nom: 'À jour' }),
  Object.freeze({ cle: 'controle', nom: 'Contrôle anti-fuite' })
]);

/** Une passe commencée et pas finie : en cours, ou arrêtée en route (la suivante la reprend). */
const phraseEnCours = (d) => `passe commencée ${leA(d.enCours) ?? 'à une heure inconnue'} et pas terminée : en cours, ou interrompue (la prochaine actualisation la reprend)`;

/**
 * Les quatre lignes de la carte : { cle, nom, valeur, detail, ton, pastille }.
 * `ton` : '' ou 'is-warning' / 'is-danger' (la ligne entière) ; `pastille` :
 * { texte, ton, icone } pour le contrôle (accent sans écart, danger sinon).
 * `d` : la réponse de la route, ou null (pas encore lue, ou en erreur).
 */
export function lignesDeLaTable(d) {
  const ligne = (cle, champs) => ({ ...LIGNES.find((l) => l.cle === cle), valeur: '', detail: null, ton: '', pastille: null, ...champs });
  if (!d) return LIGNES.map((l) => ligne(l.cle, { valeur: 'non lu', detail: 'état de la table indisponible' }));

  const enCours = d.enCours ? phraseEnCours(d) : null;
  if (d.absente) {
    return [
      ligne('equipes', { valeur: PAS_ENCORE_CONSTRUITE }),
      ligne('joueurs', { valeur: PAS_ENCORE_CONSTRUITE }),
      ligne('aJour', enCours ? { valeur: 'première construction pas terminée', detail: enCours, ton: 'is-warning' } : { valeur: 'jamais construite' }),
      ligne('controle', { valeur: 'pas encore contrôlée' })
    ];
  }

  const refusees = d.refusees ?? [];
  const equipes = ligne('equipes', {
    valeur: `${pluriel(d.lignesEquipe, 'ligne', 'lignes')} (${pluriel(d.rencontres, 'rencontre', 'rencontres')}, ${pluriel(d.lignesLigue, 'journée de championnat', 'journées de championnat')})`,
    detail:
      [
        d.clubs ? `${pluriel(d.clubs, 'club', 'clubs')} ; une ligne par équipe et par match, ce qu'on savait d'elle la veille` : null,
        refusees.length
          ? `${pluriel(refusees.length, 'rencontre refusée', 'rencontres refusées')} (identifiant de club mal formé, à regarder) : ${refusees.slice(0, 3).map((x) => x?.matchKey ?? String(x)).join(', ')}${refusees.length > 3 ? ', …' : ''}`
          : null
      ]
        .filter(Boolean)
        .join(' — ') || null,
    ton: refusees.length ? 'is-warning' : ''
  });
  const joueurs = ligne('joueurs', {
    valeur: `${pluriel(d.lignesJoueur, 'ligne', 'lignes')} (${pluriel(d.joueurs, 'joueur', 'joueurs')})`,
    detail: 'une ligne par joueur et par match, avec ses dix matchs d’avant'
  });

  let aJour;
  if (enCours) aJour = ligne('aJour', { valeur: `au ${jourComplet(d.dernierJour) ?? 'jour inconnu'} (dernière rencontre)`, detail: phraseEnCours(d), ton: 'is-warning' });
  else if (d.version !== d.versionAttendue) {
    aJour = ligne('aJour', {
      valeur: `table de la version n° ${d.version ?? '?'}, l’appli attend la n° ${d.versionAttendue ?? '?'}`,
      detail: 'la prochaine actualisation la refait entière',
      ton: 'is-warning'
    });
  } else if (d.dernierJourMagasin && d.dernierJour && d.dernierJourMagasin > d.dernierJour) {
    aJour = ligne('aJour', {
      valeur: `au ${jourComplet(d.dernierJour) ?? 'jour inconnu'} (dernière rencontre), mise à jour ${leA(d.miseAJourLe) ?? 'à une heure inconnue'}`,
      detail: `le magasin va jusqu'au ${jourComplet(d.dernierJourMagasin)} : la prochaine actualisation rattrape`,
      ton: 'is-warning'
    });
  } else {
    aJour = ligne('aJour', {
      valeur: `au ${jourComplet(d.dernierJour) ?? 'jour inconnu'} (dernière rencontre), mise à jour ${leA(d.miseAJourLe) ?? 'à une heure inconnue'}`,
      detail: d.construiteLe ? `construite ${leA(d.construiteLe)} ; chaque nuit, seulement les rencontres nouvelles, modifiées ou retirées` : null
    });
  }

  const c = d.controle;
  const graine = c?.graine ? ` ; graine ${c.graine} (pour le rejouer)` : '';
  let controle;
  if (!c) controle = ligne('controle', { valeur: 'pas encore contrôlée' });
  else if (c.pasFait) {
    controle = ligne('controle', {
      valeur: `pas fait ${leA(c.le) ?? ''} : ${c.pasFait}`.replace(/\s+:/, ' :'),
      detail: 'refait à la prochaine passe ; jamais dans le serveur, qui ne doit pas attendre les lecteurs du moteur',
      ton: 'is-warning',
      pastille: { texte: 'pas fait', ton: 'is-warning', icone: 'alert' }
    });
  } else {
    const n = (c.ecarts ?? []).length;
    controle = n
      ? ligne('controle', {
          valeur: `${pluriel(n, 'écart', 'écarts')} : à regarder`,
          detail: `sur ${pluriel(c.lignes, 'ligne recalculée', 'lignes recalculées')} depuis les tables sources, ${leA(c.le) ?? 'à une heure inconnue'}${graine}`,
          ton: 'is-danger',
          pastille: { texte: pluriel(n, 'écart', 'écarts'), ton: 'is-danger', icone: 'alert' }
        })
      : ligne('controle', {
          valeur: `${pluriel(c.lignes, 'ligne recalculée', 'lignes recalculées')} depuis les tables sources, 0 écart`,
          detail: `${leA(c.le) ?? 'à une heure inconnue'}${graine}`,
          pastille: { texte: '0 écart', ton: 'is-accent', icone: 'check' }
        });
  }
  return [equipes, joueurs, aJour, controle];
}

const valeurLue = (v) => (v === null || v === undefined ? 'rien' : typeof v === 'number' ? v.toLocaleString('fr-FR', { maximumFractionDigits: 3 }) : String(v));

/**
 * Un écart du contrôle anti-fuite en une phrase : la colonne, la ligne (rencontre
 * et camp, ou joueur et jour, ou championnat et jour), la valeur de la table et
 * celle recalculée, et le lecteur qui l'a recalculée.
 */
export function phraseEcart(e) {
  const ou = e.matchKey
    ? `rencontre ${e.matchKey}${e.camp === 1 ? ' (domicile)' : e.camp === 0 ? ' (extérieur)' : ''}`
    : e.joueur !== undefined && e.joueur !== null
      ? `joueur ${e.joueur}, match du ${jourComplet(e.date) ?? e.date}`
      : `${e.league ?? 'championnat'} le ${jourComplet(e.date) ?? e.date}`;
  return `${e.colonne ?? 'ligne'} — ${ou} : ${valeurLue(e.stocke)} dans la table, ${valeurLue(e.attendu)} recalculé${e.source ? ` (${e.source})` : ''}.`;
}

/** Le message d'une erreur de lecture ; un serveur d'avant l'étape 17 prend « day-table » pour un identifiant de match. */
export function messageDErreur(message) {
  return /introuvables pour le match day-table/.test(String(message ?? ''))
    ? "Le serveur n'est pas à jour : relancez demarrer-cotemaster.bat pour activer la table du jour J."
    : String(message ?? 'erreur inconnue');
}
