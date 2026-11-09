/**
 * noteDesCoupes.js — CE QUE DIT LA CALIBRATION DE LA CHANCE DE QUALIFICATION (étape 36 du plan, lot 1).
 * -----------------------------------------------------------------------
 * RECOPIÉ PAR SCRIPT (server/scripts/coupes.mjs --recopier, sur la sortie du passage unique), jamais retapé à la main :
 * le test T-B7 (coupesCalibration.test.mjs) refait ce texte à l’octet depuis la sortie gardée dans test/fixtures
 * (calibration-coupes-etape36.json, et les règles écrites avant le regard : banc-regles-etape36.md).
 * COUPES_AU_BANC : la calibration RAPPORTÉE (le mot fixé d’avance, les chiffres, les retours et le 1N2 à 90 minutes à
 * côté) et les lignes « non mesuré » du tableau de l’écran. Jamais un statut « mesuré » : la chance de la page part de
 * son 1N2 et ne sera vérifiée que sur vos matchs (les fiches figées de la nuit).
 * Hors de l’empreinte du moteur (data/coupes/) : aucun chiffre du moteur n’en dépend. Pur : ne lit rien.
 * -----------------------------------------------------------------------
 */

/** Gèle un objet et tout ce qu’il contient : la note ne se modifie pas en mémoire. */
const gele = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) gele(v);
  }
  return o;
};

/** La calibration de la chance de qualification (null = pas encore mesurée). */
export const COUPES_AU_BANC = gele({"format":1,"calculeLe":"2026-11-09","premierRegard":"2026-11-09T13:28:34.265Z","ou":"bac à sable","regles":{"fichier":"test/fixtures/banc-regles-etape36.md","sha1":"76b221587a87abd0933aa47ad1b5e24d3996744d","ecritesAvantLeRegard":true},"sortie":{"fichier":"test/fixtures/calibration-coupes-etape36.json","sha1":"b74532bc489ff5549e77639e311cd990339cd272"},"empreinteDuMoteur":{"sha1":"16f2459db183a99576365047da98b7777687ef05","fichiers":37,"candidate":"f01dd8496f56a415"},"K":1,"periodes":{"de":"2023-07-01","a":"2026-09-23"},"unites":5719,"calibration":{"toutes":{"n":5719,"alpha":0.008706,"beta":0.651787,"alphaIc":[-0.043824,0.062112],"betaIc":[0.59733,0.710149],"ecartMoyen":0.062857,"annonce":0.676317,"realise":0.614268,"mot":"trop sûre d’elle","dixiemes":[{"n":571,"chance":0.112694,"frequence":0.185639},{"n":572,"chance":0.253679,"frequence":0.309441},{"n":572,"chance":0.32834,"frequence":0.426573},{"n":572,"chance":0.39263,"frequence":0.444056},{"n":572,"chance":0.462634,"frequence":0.52972},{"n":572,"chance":0.522976,"frequence":0.508741},{"n":572,"chance":0.576631,"frequence":0.545455},{"n":572,"chance":0.627577,"frequence":0.52972},{"n":572,"chance":0.706969,"frequence":0.641608},{"n":572,"chance":0.878688,"frequence":0.804196}]},"retours":{"n":1414,"alpha":0.10874,"beta":0.892072,"alphaIc":[-0.01938,0.240589],"betaIc":[0.789532,1.016997],"ecartMoyen":0.041274,"annonce":0.771006,"realise":0.745403,"mot":null},"parNature":{"retour":{"n":1414,"alpha":0.10874,"beta":0.892072,"alphaIc":[-0.01938,0.240589],"betaIc":[0.789532,1.016997],"ecartMoyen":0.041274,"annonce":0.771006,"realise":0.745403,"mot":null},"match-unique":{"n":4248,"alpha":-0.037619,"beta":0.463839,"alphaIc":[-0.096249,0.021351],"betaIc":[0.384585,0.550166],"ecartMoyen":0.076106,"annonce":0.645184,"realise":0.571798,"mot":null},"finale":{"n":57,"alpha":-0.03574,"beta":0.487857,"alphaIc":[-0.639218,0.502999],"betaIc":[-0.162223,1.285019],"ecartMoyen":0.215006,"annonce":0.647556,"realise":0.526316,"mot":null}},"unNDeuxA90":{"n":5414,"home":{"n":5414,"alpha":-0.112556,"beta":0.436344,"alphaIc":[-0.172133,-0.051873],"betaIc":[0.374092,0.506329],"ecartMoyen":0.076729,"annonce":null,"realise":null,"mot":null},"draw":{"n":5414,"alpha":-1.381276,"beta":0.069842,"alphaIc":[-1.683972,-1.064328],"betaIc":[-0.171375,0.342505],"ecartMoyen":0.058782,"annonce":null,"realise":null,"mot":null},"away":{"n":5414,"alpha":-0.1117,"beta":0.581479,"alphaIc":[-0.178284,-0.043455],"betaIc":[0.512488,0.657007],"ecartMoyen":0.060041,"annonce":null,"realise":null,"mot":null}},"recalages":[{"pli":0,"cDom":0.048131,"cExt":0.055926,"n":3387},{"pli":1,"cDom":0.045455,"cExt":0.025053,"n":2027}]},"lignes":{"chance":{"statut":"rapporte","mot":"trop sûre d’elle"},"prolongation":{"statut":"non-mesure","raison":"pile-ou-face"},"tirsAuBut":{"statut":"non-mesure","raison":"pile-ou-face"},"terrainNeutre":{"statut":"non-mesurable","raison":"trop-peu-de-matchs"},"avanceAuCumul":{"statut":"non-mesure","raison":"trop-peu-de-retours"}}});
