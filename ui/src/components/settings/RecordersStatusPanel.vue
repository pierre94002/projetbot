<script setup>
/**
 * Enregistreurs (étape E du plan, 05/10/2026) : les relevés qui ne se
 * rattrapent pas — absents du jour, matchs en direct, cotes payantes
 * archivées, pronostics du moteur gelés. Pour chacun : ce qu'il garde, d'où
 * ça vient (fournisseur, table, base sur ce PC), depuis quand il tourne, les
 * lignes gardées hier et aujourd'hui, l'heure du dernier relevé et son état
 * (actif, coupé, en erreur) avec la raison ; puis les deux relevés déjà en
 * place avant l'étape E (cotes gratuites en direct, déroulé des matchs).
 *
 * Tout est LU (GET /api/recorders, un état préparé par le serveur) : la carte
 * ne lance aucun relevé et ne recompte rien. Règles de dessin (ui/DESIGN.md) :
 * chiffres clés en .cm-kpis, tableaux complets même vides ou en erreur (la
 * raison est dite, jamais un simple tiret), Σ total et ⌀ moyenne au pied,
 * provenance réelle.
 */
import { computed, onMounted, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import { recordersApi } from '@/services/recordersApi.js';
import { formatDateTime } from '@/utils/format.js';

const props = defineProps({
  /** Fin de la dernière passe d'actualisation : la carte se relit quand elle change. */
  passeTermineeLe: { type: String, default: null }
});

const etat = ref({ loading: false, error: null, data: null });

async function charger() {
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    etat.value = { loading: false, error: null, data: await recordersApi.overview() };
  } catch (error) {
    etat.value = { ...etat.value, loading: false, error: error.message };
  }
}

onMounted(charger);
watch(
  () => props.passeTermineeLe,
  (apres, avant) => {
    if (apres && apres !== avant) charger();
  }
);

// ------------------------------------------------------------ présentation
const d = computed(() => etat.value.data);
/** Les quatre relevés de l'étape E, toujours affichés (même sans état lu : la ligne dit pourquoi). */
const CLES = [
  { cle: 'absents', nom: 'Absents du jour' },
  { cle: 'direct', nom: 'Matchs en direct' },
  { cle: 'cotes-payantes', nom: 'Cotes payantes archivées' },
  { cle: 'gel', nom: 'Pronostics du moteur gelés' }
];
const lignes = computed(() => CLES.map((c) => d.value?.enregistreurs?.find((e) => e.cle === c.cle) ?? { ...c, nonLu: true }));
const deja = computed(() => d.value?.dejaGardes ?? []);
const problemes = computed(() => d.value?.problemes ?? []);

const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const decimal = (n) => Number(n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const quand = (iso, absent) => (iso ? formatDateTime(iso) : absent);
const jourCourt = (j) => (j ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(new Date(`${j}T12:00:00`)) : '');

const TONS = { actif: 'is-accent', coupé: '', 'en erreur': 'is-danger' };
const ICONES = { actif: 'check', coupé: 'pause', 'en erreur': 'alert' };

const kpiActifs = computed(() => {
  if (!d.value) return { valeur: 'non lu', detail: 'état indisponible', ton: 'is-warn' };
  const t = d.value.totaux;
  if (d.value.coupure) return { valeur: 'Coupés', detail: d.value.coupure, ton: '' };
  const enErreur = lignes.value.filter((l) => l.etat === 'en erreur').length;
  return {
    valeur: `${t.actifs} / ${t.nombre}`,
    detail: enErreur ? `${enErreur} en erreur` : `démarrés le ${quand(d.value.demarresA, 'jour inconnu')}`,
    ton: enErreur ? 'is-danger' : 'is-ok'
  };
});

const direct = computed(() => lignes.value.find((l) => l.cle === 'direct')?.detail ?? null);
const absents = computed(() => lignes.value.find((l) => l.cle === 'absents')?.detail ?? null);
const payantes = computed(() => lignes.value.find((l) => l.cle === 'cotes-payantes')?.detail ?? null);
const gel = computed(() => lignes.value.find((l) => l.cle === 'gel')?.detail ?? null);

/** Ce que dit la colonne « Dernier relevé » quand il n'y en a pas encore. */
const sansReleve = (l) => (l.nonLu ? 'état non lu' : l.etat === 'coupé' ? 'aucun (coupé)' : 'pas encore');
</script>

<template>
  <div class="rec">
    <LoadingSpinner v-if="etat.loading && !d" label="Lecture de l'état des enregistreurs…" />

    <div v-if="etat.error" class="cm-note is-danger">
      <span class="cm-icon-box is-danger"><AppIcon name="x" :size="16" /></span>
      <div>
        <p class="cm-note__title rec__titre--danger">État des enregistreurs illisible</p>
        <p class="cm-note__text rec__texte">{{ etat.error }} — le tableau ci-dessous reste affiché, sans valeurs.</p>
      </div>
    </div>

    <template v-if="d || etat.error">
      <!-- 1. Les chiffres clés. -->
      <div class="cm-kpis rec__kpis">
        <div class="cm-kpi" :class="kpiActifs.ton">
          <span class="cm-kpi__label">Relevés actifs</span>
          <span class="cm-kpi__value rec__kpi-valeur">{{ kpiActifs.valeur }}</span>
          <span class="cm-kpi__detail">{{ kpiActifs.detail }}</span>
        </div>
        <div class="cm-kpi is-section">
          <span class="cm-kpi__label">Lignes gardées aujourd'hui</span>
          <span class="cm-kpi__value">{{ d ? nombre(d.totaux.aujourdhui) : 'non lu' }}</span>
          <span class="cm-kpi__detail">{{ d ? `jour de Paris du ${jourCourt(d.jour)}` : 'état indisponible' }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Lignes gardées hier</span>
          <span class="cm-kpi__value">{{ d ? nombre(d.totaux.hier) : 'non lu' }}</span>
          <span class="cm-kpi__detail">{{ d ? `le ${jourCourt(d.veille)}` : 'état indisponible' }}</span>
        </div>
        <div class="cm-kpi" :class="d?.totaux.enAttente ? 'is-warn' : ''">
          <span class="cm-kpi__label">En attente d'écriture</span>
          <span class="cm-kpi__value">{{ d ? nombre(d.totaux.enAttente) : 'non lu' }}</span>
          <span class="cm-kpi__detail" title="Les enregistreurs n'écrivent jamais pendant un import ni une passe d'actualisation : leurs lignes attendent en mémoire.">
            {{ d ? (d.file?.attenteDepuis ? `verrou tenu depuis le ${formatDateTime(d.file.attenteDepuis)}` : 'écrites par tranches dès que le verrou est libre') : 'état indisponible' }}
          </span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Matchs suivis en direct</span>
          <span class="cm-kpi__value">{{ direct ? nombre(direct.enDirect) : d ? 0 : 'non lu' }}</span>
          <span class="cm-kpi__detail">{{ direct ? `au plus ${direct.reglages?.maxDetailsParMinute ?? 6} détails par minute, un instantané toutes les ${direct.reglages?.pasMinutes ?? 5} min` : 'boucle non démarrée' }}</span>
        </div>
      </div>

      <!-- 2. Coupés volontairement, ou ce qui ne va pas (alerte durable). -->
      <div v-if="d?.coupure" class="cm-note">
        <span class="cm-icon-box is-muted"><AppIcon name="pause" :size="16" /></span>
        <div>
          <p class="cm-note__title">Enregistreurs coupés</p>
          <p class="cm-note__text rec__texte">Ils sont {{ d.coupure }}. Rien n'est relevé ni écrit ; ce qui a été gardé avant reste dans la base.</p>
        </div>
      </div>
      <div v-for="(p, i) in problemes" :key="`${p.cle}-${i}`" class="cm-note is-warning">
        <span class="cm-icon-box is-warning"><AppIcon name="alert" :size="16" /></span>
        <div>
          <p class="cm-note__title rec__titre--warning">{{ p.nom }} : à vérifier</p>
          <p class="cm-note__text rec__texte">{{ p.probleme }}<template v-if="p.depuis"> (depuis le {{ formatDateTime(p.depuis) }})</template>.</p>
        </div>
      </div>

      <div class="rec__actions">
        <span class="rec__provenance" :title="d?.base ?? ''">
          <AppIcon name="database" :size="12" />
          {{ d?.base ? `Base : ${d.base}` : 'Base : chemin non lu' }}
        </span>
        <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger">
          <template #icon><AppIcon name="refresh" :size="13" /></template>
          Relire
        </AppButton>
      </div>

      <!-- 3. Les relevés de l'étape E. -->
      <h4 class="cm-group-title rec__groupe">Les relevés qui ne se rattrapent pas</h4>
      <div class="cm-table-wrap">
        <table class="cm-table rec__table">
          <thead>
            <tr>
              <th class="is-left">Relevé</th>
              <th class="is-left" title="Le vrai endroit des données : fournisseur, puis table de la base sur ce PC">Provenance</th>
              <th class="is-left" title="Premier relevé gardé">Depuis</th>
              <th title="Lignes écrites dans la base hier (jour de Paris)">Hier</th>
              <th title="Lignes écrites dans la base aujourd'hui (jour de Paris)">Aujourd'hui</th>
              <th class="is-left" title="Heure de la donnée la plus récente gardée">Dernier relevé</th>
              <th class="is-left">État</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in lignes" :key="l.cle">
              <td class="is-left is-strong rec__nom">
                {{ l.nom }}
                <small v-if="l.quoi" class="rec__petit">{{ l.quoi }}</small>
              </td>
              <td class="is-left rec__source">
                <template v-if="l.fournisseur">{{ l.fournisseur }}<small class="rec__petit">→ {{ (l.tables ?? []).join(', ') }}</small></template>
                <span v-else class="rec__manque">non lue (état indisponible)</span>
              </td>
              <td class="is-left cm-numeric">{{ quand(l.depuis, l.nonLu ? 'non lu' : 'jamais encore') }}</td>
              <td class="cm-numeric">{{ l.nonLu ? 'non lu' : nombre(l.hier) }}</td>
              <td class="cm-numeric is-strong">
                {{ l.nonLu ? 'non lu' : nombre(l.aujourdhui) }}
                <small v-if="l.enAttente" class="rec__petit">+ {{ nombre(l.enAttente) }} en attente</small>
                <small v-if="l.perdues" class="rec__petit rec__petit--danger">{{ nombre(l.perdues) }} perdue(s)</small>
              </td>
              <td class="is-left cm-numeric">{{ quand(l.dernierReleve, sansReleve(l)) }}</td>
              <td class="is-left rec__etat">
                <span class="cm-chip" :class="TONS[l.etat] ?? 'is-warning'">
                  <AppIcon :name="ICONES[l.etat] ?? 'info'" :size="11" />
                  {{ l.nonLu ? 'non lu' : l.etat }}
                </span>
                <small v-if="l.raison" class="rec__petit rec__petit--bloc">{{ l.raison }}</small>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong" colspan="3">Σ {{ lignes.length }} relevés</td>
              <td class="cm-numeric is-strong">{{ d ? nombre(d.totaux.hier) : 'non lu' }}</td>
              <td class="cm-numeric is-strong">{{ d ? nombre(d.totaux.aujourdhui) : 'non lu' }}</td>
              <td class="is-left" colspan="2"></td>
            </tr>
            <tr>
              <td class="is-left rec__moyenne" colspan="3">⌀ par relevé</td>
              <td class="cm-numeric rec__moyenne">{{ d ? decimal(d.totaux.moyenneHier) : 'non lu' }}</td>
              <td class="cm-numeric rec__moyenne">{{ d ? decimal(d.totaux.moyenneAujourdhui) : 'non lu' }}</td>
              <td class="is-left" colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- 4. Le détail de chaque relevé, en clair. -->
      <ul v-if="d" class="rec__details">
        <li>
          <strong>Matchs en direct :</strong>
          <template v-if="direct?.dernierTour">
            dernier tour le {{ formatDateTime(direct.dernierTour.at) }} —
            {{ direct.dernierTour.suspendu ? `arrêté jusqu'au ${formatDateTime(direct.dernierTour.suspendu)} après des erreurs FotMob` : direct.dernierTour.listeLue ? `${nombre(direct.dernierTour.enDirect)} match(s) en cours, ${nombre(direct.dernierTour.details)} détail(s) lu(s), ${nombre(direct.dernierTour.instantanes)} instantané(s)${direct.dernierTour.horsPlafond ? `, ${nombre(direct.dernierTour.horsPlafond)} détail(s) remis à la minute suivante (plafond)` : ''}` : direct.dernierTour.attente ? `aucun match en cours ; prochain coup d'envoi suivi le ${formatDateTime(direct.dernierTour.attente)}` : 'aucun match en cours' }}.
            Depuis le démarrage : {{ nombre(direct.totaux?.listes) }} lecture(s) de la liste du jour, {{ nombre(direct.totaux?.details) }} détail(s), {{ nombre(direct.totaux?.erreurs) }} erreur(s).
          </template>
          <template v-else>pas encore de tour (la boucle tourne chaque minute quand les enregistreurs sont démarrés).</template>
        </li>
        <li v-if="d.listeDuJour">
          <strong>Liste du jour FotMob (partagée) :</strong>
          depuis le démarrage du serveur, {{ nombre(d.listeDuJour.requetes) }} lecture(s) faite(s) chez FotMob, {{ nombre(d.listeDuJour.servies) }} servie(s)
          par le partage (une liste lue il y a moins d'une minute sert toutes les boucles), {{ nombre(d.listeDuJour.echecs) }} en échec.
        </li>
        <li>
          <strong>Absents du jour :</strong>
          <template v-if="absents?.at">
            dernière passe le {{ formatDateTime(absents.at) }} : {{ nombre(absents.candidats) }} match(s) à venir sous 48 h, {{ nombre(absents.dejaReleves) }} déjà relevé(s) aujourd'hui,
            {{ nombre(absents.depuisCache) }} repris du cache des compositions (sans requête), {{ nombre(absents.lus) }} page(s) lue(s), {{ nombre(absents.echecs) }} échec(s)<template v-if="absents.reportes">, {{ nombre(absents.reportes) }} remis à la passe suivante</template>.
          </template>
          <template v-else>pas encore de passe (toutes les 30 min quand les enregistreurs sont démarrés).</template>
        </li>
        <li>
          <strong>Cotes payantes :</strong>
          <template v-if="payantes?.instantane">
            instantané du {{ formatDateTime(payantes.instantane.releveAt) }} ({{ payantes.instantane.fichier }}) ;
            {{ payantes.dernierArchive ? `dernier relevé archivé : celui du ${formatDateTime(payantes.dernierArchive)}` : 'aucun relevé archivé pour l’instant' }}<template v-if="payantes.bilan?.cotes !== undefined"> ({{ nombre(payantes.bilan.cotes) }} cotes sur {{ nombre(payantes.bilan.matchs) }} matchs)</template>.
            Aucun relevé n'est lancé ici : chaque relevé fait à la main (crédits The Odds API) est archivé dans la minute qui suit.
          </template>
          <template v-else>pas d'instantané payant sur ce PC (aucun relevé fait à la main).</template>
        </li>
        <li>
          <strong>Pronostics gelés :</strong>
          <template v-if="gel?.derniereEtape">dernière étape de nuit le {{ formatDateTime(gel.derniereEtape.at) }} — {{ gel.derniereEtape.summary }}</template>
          <template v-else>pas encore d'étape de nuit (la première passe d'actualisation de chaque jour) ;</template>
          aussi à chaque analyse IA automatique, avec la composition qu'elle a lue. La première valeur de chaque pronostic n'est jamais réécrite.
        </li>
      </ul>

      <!-- 5. Ce qui était déjà gardé avant l'étape E. -->
      <h4 class="cm-group-title rec__groupe">Déjà gardés avant les enregistreurs</h4>
      <div class="cm-table-wrap">
        <table class="cm-table rec__table">
          <thead>
            <tr>
              <th class="is-left">Relevé</th>
              <th class="is-left">Provenance</th>
              <th class="is-left">Depuis</th>
              <th>Hier</th>
              <th>Aujourd'hui</th>
              <th class="is-left">Dernier relevé</th>
              <th class="is-left">État</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in deja" :key="l.cle">
              <td class="is-left is-strong rec__nom">
                {{ l.nom }}
                <small v-if="l.quoi" class="rec__petit">{{ l.quoi }}</small>
              </td>
              <td class="is-left rec__source">
                <template v-if="l.fournisseur">{{ l.fournisseur }}<small class="rec__petit">→ {{ (l.tables ?? []).join(', ') }}</small></template>
                <span v-else class="rec__manque">non lue</span>
              </td>
              <td class="is-left cm-numeric">
                {{ quand(l.depuis, 'aucun dans la période lue') }}
                <small v-if="l.depuisPrecision" class="rec__petit">{{ l.depuisPrecision }}</small>
              </td>
              <td class="cm-numeric">
                {{ l.hier === null ? 'non lu' : nombre(l.hier) }}
                <small v-if="l.hierSur !== undefined" class="rec__petit">sur {{ nombre(l.hierSur) }} matchs joués</small>
              </td>
              <td class="cm-numeric is-strong">
                {{ l.aujourdhui === null ? 'non lu' : nombre(l.aujourdhui) }}
                <small v-if="l.aujourdhuiSur !== undefined" class="rec__petit">sur {{ nombre(l.aujourdhuiSur) }} matchs joués</small>
              </td>
              <td class="is-left cm-numeric">{{ quand(l.dernierReleve, l.cle === 'deroule' ? 'avec chaque feuille de match' : 'pas encore') }}</td>
              <td class="is-left rec__etat">
                <span class="cm-chip" :class="TONS[l.etat] ?? 'is-warning'">
                  <AppIcon :name="ICONES[l.etat] ?? 'info'" :size="11" />
                  {{ l.etat }}
                </span>
                <small v-if="l.raison" class="rec__petit rec__petit--bloc">{{ l.raison }}</small>
              </td>
            </tr>
            <tr v-if="!deja.length">
              <td class="is-left rec__vide" colspan="7">{{ d ? 'Aucun relevé antérieur lu.' : 'Liste indisponible : état des enregistreurs non lu.' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="d" class="rec__pied">
        <AppIcon name="clock" :size="12" />
        <span>
          Comptes du {{ formatDateTime(d.generatedAt) }}, par jour de Paris (le déroulé des matchs : par jour UTC, celui des feuilles de match).
          Rien n'est écrit pendant un import ni une passe d'actualisation : les lignes attendent, puis partent par petites tranches.
        </span>
      </p>
    </template>
  </div>
</template>

<style scoped>
.rec {
  container: rec / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rec__kpis {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

/* Valeurs textuelles (« Coupés », « 3 / 4 ») : plus petites qu'un chiffre seul. */
.rec__kpi-valeur {
  font-size: 17px;
  line-height: 1.3;
}

.cm-kpi.is-ok .cm-kpi__value {
  color: var(--cm-accent);
}

.cm-kpi.is-warn .cm-kpi__value {
  color: var(--cm-warning);
}

.cm-kpi.is-danger .cm-kpi__value {
  color: var(--cm-danger);
}

.rec__titre--danger {
  color: var(--cm-danger);
}

.rec__titre--warning {
  color: var(--cm-warning);
}

.rec__texte {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.rec__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.rec__provenance {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 11.5px;
  color: var(--cm-text-muted);
  overflow-wrap: anywhere;
}

.rec__groupe {
  margin: 6px 0 0;
}

.rec__table td {
  font-size: 12.5px;
  vertical-align: top;
}

.rec__table td.rec__nom,
.rec__table td.rec__source,
.rec__table td.rec__etat {
  white-space: normal;
  min-width: 150px;
}

.rec__petit {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
}

.rec__petit--bloc {
  margin-top: 4px;
  line-height: 1.4;
  white-space: normal;
}

.rec__petit--danger {
  color: var(--cm-danger);
}

.rec__manque {
  font-size: 11.5px;
  color: var(--cm-text-muted);
  white-space: normal;
}

.rec__vide {
  color: var(--cm-text-secondary);
  white-space: normal;
}

.rec__moyenne {
  color: var(--cm-text-muted);
}

.rec__details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

.rec__details strong {
  color: var(--cm-text-primary);
}

.rec__pied {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.rec__pied :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

@container rec (max-width: 560px) {
  .rec__actions {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
