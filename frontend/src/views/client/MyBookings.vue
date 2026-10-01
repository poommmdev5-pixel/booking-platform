<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { bookingsApi } from '../../api/bookings';
import { settingsApi } from '../../api/settings';
import { formatCurrency, formatDate } from '../../i18n';
import StatusBadge from '../../components/StatusBadge.vue';
import RescheduleModal from '../../components/RescheduleModal.vue';
import { usePagination } from '../../composables/usePagination';
import { useLocaleRefetch } from '../../composables/useLocaleRefetch';
import { useToast } from '../../composables/useToast';
import Pagination from '../../components/Pagination.vue';

const { t } = useI18n();
const { showToast } = useToast();

const bookings = ref([]);
const loading = ref(true);
const { page, totalPages, pageItems: pageBookings } = usePagination(bookings, 6);

const cancelTarget = ref(null);
const cancelReason = ref('');
const cancelling = ref(false);

const policy = ref({
  allowSelfCancel: true,
  allowSelfReschedule: true,
  cancellationHoursBefore: 24,
  rescheduleHoursBefore: 24,
});
settingsApi
  .getBookingPolicyPublic()
  .then((p) => (policy.value = p))
  .catch(() => {});

function hoursUntil(dateStr) {
  if (!dateStr) return Infinity;
  return (new Date(`${dateStr}T00:00:00Z`) - Date.now()) / (1000 * 60 * 60);
}
const canReschedule = (b) =>
  !b.pendingChangeRequest &&
  ['pending', 'confirmed'].includes(b.status) &&
  policy.value.allowSelfReschedule &&
  hoursUntil(b.dateStart) >= policy.value.rescheduleHoursBefore;

async function load() {
  loading.value = true;
  bookings.value = await bookingsApi.myBookings();
  loading.value = false;
}

function openCancel(b) {
  cancelTarget.value = b;
  cancelReason.value = '';
}

function closeCancel() {
  cancelTarget.value = null;
}

async function confirmCancel() {
  if (!cancelReason.value.trim()) return;
  cancelling.value = true;
  try {
    const res = await bookingsApi.cancelMine(cancelTarget.value.id, cancelReason.value.trim());
    cancelTarget.value = null;
    showToast(t(res.pending ? 'booking.cancelRequestSubmitted' : 'booking.cancelSuccessMsg'), 'success');
    await load();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    cancelling.value = false;
  }
}

// ---- Reschedule ----
const rescheduleTarget = ref(null);
function openReschedule(b) {
  rescheduleTarget.value = b;
}
function closeReschedule() {
  rescheduleTarget.value = null;
}
async function submitReschedule(payload) {
  const res = await bookingsApi.rescheduleMine(rescheduleTarget.value.id, payload);
  rescheduleTarget.value = null;
  showToast(t(res.pending ? 'booking.rescheduleRequestSubmitted' : 'booking.rescheduleSuccess'), 'success');
  await load();
  return res;
}

useLocaleRefetch(load);
onMounted(load);
</script>

<template>
  <header class="page-header">
    <p class="eyebrow">{{ $t('nav.myBookings') }}</p>
    <h1 class="page-heading">{{ $t('nav.myBookings') }}</h1>
    <p class="page-sub">{{ $t('booking.myBookingsSub') }}</p>
  </header>

  <div v-if="loading" class="list">
    <div v-for="i in 3" :key="i" class="skeleton" style="height: 110px; border-radius: var(--radius-lg);"></div>
  </div>
  <div v-else-if="bookings.length === 0" class="empty-state">
    <p>{{ $t('common.noResults') }}</p>
    <router-link to="/products" class="btn btn-accent">{{ $t('booking.browseProducts') }}</router-link>
  </div>
  <template v-else>
    <div class="list">
      <div v-for="b in pageBookings" :key="b.id" class="booking-card surface-panel">
        <div class="booking-main-info">
          <p class="booking-product">{{ b.product ? b.product.name : b.reference }}</p>
          <p class="booking-ref">{{ b.reference }}</p>
          <p class="booking-date">
            <svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>
            {{ formatDate(b.dateStart) }} <span v-if="b.timeStart">· {{ b.timeStart }}</span>
          </p>
        </div>
        <div class="booking-side-info">
          <StatusBadge :status="b.status" />
          <p class="booking-total">{{ formatCurrency(b.totalPrice) }}</p>
          <p v-if="b.pendingChangeRequest" class="pending-note">⏳ {{ $t('booking.pendingCancelShort') }}</p>
          <template v-else-if="b.status === 'pending' || b.status === 'confirmed'">
            <div class="row-actions">
              <button v-if="canReschedule(b)" class="btn btn-secondary btn-sm" @click="openReschedule(b)">
                {{ $t('booking.rescheduleAction') }}
              </button>
              <button class="btn btn-secondary btn-sm" @click="openCancel(b)">
                {{ $t('booking.cancel') }}
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
    <Pagination :page="page" :total-pages="totalPages" @update:page="page = $event" />
  </template>

  <RescheduleModal
    v-if="rescheduleTarget"
    :booking="rescheduleTarget"
    :submit="submitReschedule"
    @close="closeReschedule"
    @success="closeReschedule"
  />

  <div v-if="cancelTarget" class="modal-backdrop" @click.self="closeCancel">
    <div class="modal-card surface-panel">
      <h2 class="page-heading modal-title">{{ $t('booking.cancelModalTitle') }}</h2>
      <p class="modal-hint">{{ $t('booking.cancelModalHint') }}</p>
      <label>{{ $t('booking.cancelReason') }}<textarea v-model="cancelReason" :placeholder="$t('booking.cancelReasonPlaceholder')" rows="3"></textarea></label>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="closeCancel">{{ $t('booking.keepBooking') }}</button>
        <button class="btn btn-danger" :disabled="!cancelReason.trim() || cancelling" @click="confirmCancel">{{ $t('booking.cancel') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-header { margin-bottom: 1.75rem; }
.page-header .page-heading { margin: 0 0 0.4rem; }
.page-sub { color: var(--color-text-muted); font-size: 0.9rem; margin: 0; }

.list { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.25rem; }
.booking-card {
  display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; flex-wrap: wrap;
  padding: 1.3rem 1.5rem;
}
.booking-main-info { min-width: 0; }
.booking-product { margin: 0 0 0.3rem; font-weight: 700; font-size: 1rem; }
.booking-ref { margin: 0 0 0.45rem; font-size: 0.78rem; color: var(--color-text-faint); font-variant-numeric: tabular-nums; }
.booking-date { display: flex; align-items: center; gap: 0.4rem; margin: 0; font-size: 0.85rem; color: var(--color-text-muted); }
.booking-date svg { width: 15px; height: 15px; fill: var(--color-accent); flex-shrink: 0; }
.booking-side-info { display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem; flex-shrink: 0; }
.row-actions { display: flex; gap: 0.5rem; }
.booking-total { margin: 0; font-weight: 800; font-size: 1.05rem; color: var(--color-primary); }
.pending-note { margin: 0; font-size: 0.76rem; font-weight: 700; color: var(--color-warning); }

/* Two action buttons (reschedule + cancel) are wider than the single cancel button this
   card was designed around — below the width where both halves fit on one row, .booking-card
   wraps, and the now-isolated .booking-side-info sits at the wrapped line's flex-start
   instead of staying flush with the card's right edge. Stack and left-align everything
   instead of leaving that half-right-aligned, half-not state. */
@media (max-width: 640px) {
  .booking-card { flex-direction: column; align-items: stretch; }
  .booking-side-info { align-items: flex-start; }
  .row-actions { width: 100%; }
  .row-actions .btn { flex: 1; justify-content: center; }
}

.empty-state { display: flex; flex-direction: column; align-items: center; gap: 1.1rem; padding: 3.5rem 1rem; }

.modal-backdrop {
  position: fixed; inset: 0; background: rgba(4, 10, 7, 0.6); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1.5rem;
}
.modal-card { width: 100%; max-width: 420px; padding: 1.75rem; }
.modal-title { font-size: 1.15rem; margin: 0 0 0.4rem; }
.modal-hint { margin: 0 0 0.25rem; font-size: 0.85rem; color: var(--color-text-muted); line-height: 1.6; }
.modal-card textarea { max-width: none; resize: vertical; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.25rem; }
</style>
