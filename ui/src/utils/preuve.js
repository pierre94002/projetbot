/**
 * preuve.js — les règles d'affichage de la PREUVE APRÈS LANCEMENT (étape 16 du
 * plan, 07/10/2026 ; page « Feuille de route », bloc de chaque étape qui touche
 * aux chiffres). JavaScript pur, sans Vue ni navigateur : les tests du serveur
 * le rejouent (server/test/preuveEcran.test.mjs).
 *
 * Rien n'est calculé ici : le juge du serveur (server/src/bench/guard.js) a
 * déjà rendu le verdict, le gain et sa fourchette, et la feuille de route
 * (GET /api/roadmap, `mesure` de chaque étape) les donne tels quels. L'écran
 * met en forme, et dit ce qui manque au lieu d'un tiret : « pas encore
 * lancée », « pas encore jugée », « aucune déclarée », registre illisible.
 */

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/** « 2026-11-10 » → « 10/11 » ; « 10/11/2026 » en entier. Sur le texte du jour, sans Date : le fuseau décalerait. */
const jourCourt = (j) => `${j.slice(8, 10)}/${j.slice(5, 7)}`;
const jourComplet = (j) => `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}`;
/** Le jour de Paris d'un instant (le jugement est daté à l'instant près). */
const jourDeParis = (instant) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date(instant));

/** « +0,4 », « −0,2 », « +0,0 » : une décimale, signe toujours écrit, vrai signe moins ; −0 s'écrit +0,0. */
export function nombreSigne(x) {
  const v = x === 0 ? 0 : x;
  return v.toLocaleString('fr-FR', { signDisplay: 'always', minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace(/[-−]/, '−');
}

/**
 * Le gain en morceaux : { gain: « +0,4 % », fourchette: « [−0,2 ; +1,0] », quoi } — le gain s'écrit en
 * gras à l'écran. null quand il n'y a pas de gain (un jugement « pas assez de matchs » sans calcul).
 */
export function morceauxGain(enPourcent) {
  if (!enPourcent || !fini(enPourcent.gain)) return null;
  const f = enPourcent.fourchette;
  const fourchette = Array.isArray(f) && f.length === 2 && f.every(fini) ? `[${nombreSigne(f[0])} ; ${nombreSigne(f[1])}]` : null;
  return { gain: `${nombreSigne(enPourcent.gain)} %`, fourchette, quoi: typeof enPourcent.quoi === 'string' ? enPourcent.quoi : '' };
}

/** « +0,4 % [−0,2 ; +1,0] de perte log en moins », ou null sans gain. */
export function texteGain(enPourcent) {
  const m = morceauxGain(enPourcent);
  return m ? [m.gain, m.fourchette, m.quoi].filter(Boolean).join(' ') : null;
}

/**
 * La pastille du verdict : { texte, ton, icone }. Le vert (`is-accent`) n'est que pour « retenu » : c'est la
 * couleur « terminée / validée » de la page, PAS le vert des paris — ce n'est pas une value. « moins bon »
 * en rouge (l'étape 25 s'en servira pour refuser une adoption), « pas assez de matchs » en ambre.
 */
export const VERDICTS = Object.freeze({
  retenu: Object.freeze({ texte: 'retenu', ton: 'is-accent', icone: 'check' }),
  'pas-prouve': Object.freeze({ texte: 'pas prouvé', ton: '', icone: 'info' }),
  'moins-bon': Object.freeze({ texte: 'moins bon', ton: 'is-danger', icone: 'alert' }),
  'pas-assez-de-matchs': Object.freeze({ texte: 'pas assez de matchs', ton: 'is-warning', icone: 'clock' })
});
const PAS_ENCORE_JUGEE = Object.freeze({ texte: 'pas encore jugée', ton: '', icone: 'clock' });

export function libelleVerdict(verdict) {
  if (Object.hasOwn(VERDICTS, verdict ?? '')) return VERDICTS[verdict];
  // Un verdict que l'écran ne connaît pas (un registre écrit par un code plus récent) : dit tel quel, jamais caché.
  return typeof verdict === 'string' && verdict ? { texte: verdict, ton: '', icone: 'info' } : PAS_ENCORE_JUGEE;
}

/** « 1 240 matchs, du 10/11 au 24/11 (jugé le 25/11/2026) » : le nombre de matchs est celui du jugement, la page ne compte rien. */
export function ligneMatchs(jugement) {
  const n = jugement?.n?.matchs;
  const nombre = fini(n) ? `${n.toLocaleString('fr-FR')} ${n <= 1 ? 'match' : 'matchs'}` : 'nombre de matchs non noté';
  const de = jugement?.fenetre?.de;
  const a = jugement?.fenetre?.a;
  const periode = JOUR.test(de ?? '') && JOUR.test(a ?? '') ? (de === a ? `, le ${jourCourt(de)}` : `, du ${jourCourt(de)} au ${jourCourt(a)}`) : '';
  const instant = Date.parse(jugement?.le ?? '');
  const quand = Number.isFinite(instant) ? ` (jugé le ${jourComplet(jourDeParis(instant))})` : '';
  return `${nombre}${periode}${quand}`;
}

const ILLISIBLE = 'registre de la mesure illisible pour l’instant';
const PAS_JUGEE = 'pas encore jugée';

/**
 * Les CINQ lignes du bloc, toujours les cinq (ui/DESIGN.md : la structure est complète même sans mesure),
 * pour la `mesure` d'une étape ({ aJuger, registre, lancement, variantes, jugement }) ; null sans mesure
 * (une étape qui ne touche pas aux chiffres : pas de bloc). Chaque ligne : { texte, manque } — `manque`
 * quand elle dit ce qui n'existe pas encore ; le gain en morceaux (`valeur` en gras, `reste`) ; le verdict
 * en pastille et sa raison.
 */
export function lignesPreuve(mesure) {
  if (!mesure || typeof mesure !== 'object') return null;
  if (mesure.registre === 'illisible') {
    const manque = { texte: ILLISIBLE, manque: true };
    return {
      lancement: manque,
      matchs: manque,
      gain: manque,
      variantes: manque,
      verdict: {
        pastille: { texte: 'registre illisible', ton: 'is-warning', icone: 'alert' },
        raison: 'Le registre de la mesure ne se lit pas : rien n’y est écrit ni jugé tant qu’il ne se lit pas, et rien n’est perdu.'
      }
    };
  }
  const l = mesure.lancement;
  const j = mesure.jugement;
  const lancement =
    l && JOUR.test(l.le ?? '')
      ? { texte: `${jourComplet(l.le)} · version ${l.version}`, manque: false }
      : { texte: 'pas encore lancée : les matchs d’avant ne comptent pas', manque: true };
  const matchs = j ? { texte: ligneMatchs(j), manque: false } : { texte: PAS_JUGEE, manque: true };
  let gain = { texte: PAS_JUGEE, manque: true };
  if (j) {
    const m = morceauxGain(j.enPourcent);
    gain = m
      ? { valeur: m.gain, reste: [m.fourchette, m.quoi].filter(Boolean).join(' '), texte: texteGain(j.enPourcent), manque: false }
      : { texte: 'pas de gain calculé : pas assez de matchs', manque: true };
  }
  const n = mesure.variantes;
  const auJugement = j?.seuil?.variantes;
  const variantes =
    fini(n) && n > 0
      ? { texte: `${n.toLocaleString('fr-FR')}${fini(auJugement) && auJugement !== n ? ` (${auJugement.toLocaleString('fr-FR')} au dernier jugement)` : ''}`, manque: false }
      : { texte: 'aucune déclarée', manque: true };
  const verdict = j ? { pastille: libelleVerdict(j.verdict), raison: typeof j.raison === 'string' ? j.raison : '' } : { pastille: PAS_ENCORE_JUGEE, raison: '' };
  return { lancement, matchs, gain, variantes, verdict };
}
