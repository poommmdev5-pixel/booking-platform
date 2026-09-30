<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { bookingsApi } from '../api/bookings';
import { formatCurrency, formatDate } from '../i18n';
import StatusBadge from './StatusBadge.vue';

const props = defineProps({ bookingId: { type: [String, Number], required: true } });
const emit = defineEmits(['close', 'updated']);
const { t } = useI18n();

const booking = ref(null);
const loading = ref(true);
const saving = ref(false);

const NEXT_STATUS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'no_show', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};

const nextStatuses = computed(() => (booking.value ? NEXT_STATUS[booking.value.status] || [] : []));

const STATUS_TITLE_KEY = {
  confirmed: 'admin.confirmStatusConfirmedTitle',
  completed: 'admin.confirmStatusCompletedTitle',
  no_show: 'admin.confirmStatusNoShowTitle',
  cancelled: 'admin.cancelConfirmTitle',
};
const STATUS_HINT_KEY = {
  confirmed: 'admin.confirmStatusConfirmedHint',
  completed: 'admin.confirmStatusCompletedHint',
  no_show: 'admin.confirmStatusNoShowHint',
  cancelled: 'admin.cancelConfirmHint',
};

async function load() {
  loading.value = true;
  booking.value = await bookingsApi.getAdmin(props.bookingId);
  loading.value = false;
}

const statusModal = ref(null); // { status } | null
const cancelReason = ref('');
const statusChangeError = ref('');

function openStatusModal(status) {
  statusModal.value = { status };
  cancelReason.value = '';
  statusChangeError.value = '';
}

async function confirmStatusChange() {
  if (!statusModal.value) return;
  const status = statusModal.value.status;
  if (status === 'cancelled' && !cancelReason.value.trim()) {
    statusChangeError.value = t('admin.cancelReasonRequired');
    return;
  }
  saving.value = true;
  statusChangeError.value = '';
  try {
    if (status === 'cancelled') {
      await bookingsApi.cancelAdmin(booking.value.id, cancelReason.value.trim());
    } else {
      await bookingsApi.setStatus(booking.value.id, status);
    }
    statusModal.value = null;
    await load();
    emit('updated');
  } catch (err) {
    statusChangeError.value = err.message;
  } finally {
    saving.value = false;
  }
}

const settling = ref(false);
async function settleBalance() {
  settling.value = true;
  try {
    await bookingsApi.settleBalance(booking.value.id);
    await load();
    emit('updated');
  } finally {
    settling.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-card">
      <button type="button" class="modal-close" @click="$emit('close')" :aria-label="$t('common.close')">✕</button>

      <div v-if="loading" class="modal-loading">{{ $t('common.loading') }}</div>

      <template v-else-if="booking">
        <div class="modal-header">
          <div>
            <p class="modal-eyebrow">{{ $t('booking.reference') }}</p>
            <h2 class="modal-ref">{{ booking.reference }}</h2>
          </div>
          <StatusBadge :status="booking.status" />
        </div>

        <div class="modal-section">
          <div class="info-row">
            <span class="info-icon icon-product"><svg viewBox="0 0 24 24"><path d="M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></span>
            <span>{{ booking.product?.name ?? booking.productId }}</span>
          </div>
          <div class="info-row">
            <span class="info-icon icon-date"><svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg></span>
            <span>
              {{ formatDate(booking.dateStart) }}
              <template v-if="booking.dateEnd"> → {{ formatDate(booking.dateEnd) }}</template>
              <template v-if="booking.timeStart"> · {{ booking.timeStart }}–{{ booking.timeEnd }}</template>
            </span>
          </div>
        </div>

        <div class="modal-section people">
          <div class="person-card">
            <span class="info-icon icon-guest"><svg viewBox="0 0 24 24"><path d="M12 12c2.7 0 8 1.34 8 4v2H4v-2c0-2.66 5.3-4 8-4zm0-2a4 4 0 110-8 4 4 0 010 8z"/></svg></span>
            <div class="person-info">
              <span class="person-label">{{ $t('booking.name') }}</span>
              <span class="person-name">{{ booking.guestName }}</span>
              <span class="person-sub">{{ booking.guestEmail }}</span>
              <span class="person-sub">{{ booking.guestPhone }}</span>
            </div>
          </div>
          <div v-if="booking.employeeName" class="person-card">
            <span class="info-icon icon-employee">
              <img v-if="booking.employeeImageUrl" :src="booking.employeeImageUrl" alt="" />
              <svg v-else viewBox="0 0 24 24"><path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 00-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z"/></svg>
            </span>
            <div class="person-info">
              <span class="person-label">{{ $t('admin.employees') }}</span>
              <span class="person-name">{{ booking.employeeName }}</span>
            </div>
          </div>
        </div>

        <div v-if="booking.items && booking.items.length > 0" class="modal-section">
          <p class="section-label">{{ $t('product.selectPrice') }}</p>
          <div class="receipt">
            <div class="receipt-row" v-for="it in booking.items" :key="it.priceTierId"><span>{{ it.label }} × {{ it.quantity }}</span><em>{{ formatCurrency(it.price * it.quantity) }}</em></div>
            <div class="receipt-row" v-for="e in booking.extras" :key="'ex' + e.extraId"><span>{{ e.name }}</span><em>+{{ formatCurrency(e.price) }}</em></div>
            <div class="receipt-row receipt-total"><span>{{ $t('booking.total') }}</span><span>{{ formatCurrency(booking.totalPrice) }}</span></div>
          </div>
        </div>

        <div class="modal-section">
          <p class="section-label">{{ $t('admin.paymentSectionTitle') }}</p>
          <div class="pay-summary" :class="{ due: booking.payment.balanceDue > 0 }">
            <div class="pay-summary-row"><span>{{ $t('admin.amountPaidLabel') }}</span><strong class="paid">{{ formatCurrency(booking.payment.amountPaid) }}</strong></div>
            <div v-if="booking.payment.balanceDue > 0" class="pay-summary-row due"><span>{{ $t('admin.balanceDueLabel') }}</span><strong>{{ formatCurrency(booking.payment.balanceDue) }}</strong></div>
          </div>
          <button
            v-if="booking.payment.balanceDue > 0"
            class="btn btn-secondary btn-sm settle-btn"
            :disabled="settling"
            @click="settleBalance"
          >
            {{ settling ? $t('admin.savingEllipsis') : $t('admin.settleBalanceBtnShort', { amount: formatCurrency(booking.payment.balanceDue) }) }}
          </button>
        </div>

        <div v-if="booking.note" class="modal-section">
          <p class="section-label">{{ $t('booking.note') }}</p>
          <p class="note-text">{{ booking.note }}</p>
        </div>

        <div v-if="nextStatuses.length" class="modal-actions">
          <button
            v-for="s in nextStatuses"
            :key="s"
            class="btn btn-sm"
            :class="{ 'btn-danger': s === 'cancelled', 'btn-secondary': s !== 'cancelled' && s !== 'confirmed' }"
            :disabled="saving"
            @click="openStatusModal(s)"
          >
            {{ $t('status.' + s) }}
          </button>
        </div>
      </template>
    </div>

    <div v-if="statusModal" class="modal-backdrop confirm-backdrop" @click.self="statusModal = null">
      <div class="modal-card confirm-card">
        <h2>{{ $t(STATUS_TITLE_KEY[statusModal.status]) }}</h2>
        <p class="modal-hint">{{ $t(STATUS_HINT_KEY[statusModal.status]) }}</p>
        <label v-if="statusModal.status === 'cancelled'" class="reason-label">
          {{ $t('admin.cancelReasonLabel') }}
          <textarea v-model="cancelReason" rows="3" :placeholder="$t('admin.cancelReasonPlaceholder')" autofocus></textarea>
        </label>
        <p v-if="statusChangeError" class="error">{{ statusChangeError }}</p>
        <div class="confirm-actions">
          <button type="button" class="btn btn-secondary" :disabled="saving" @click="statusModal = null">{{ $t('common.cancel') }}</button>
          <button
            type="button"
            class="btn"
            :class="{ 'btn-danger': statusModal.status === 'cancelled' }"
            :disabled="saving"
            @click="confirmStatusChange"
          >
            <span v-if="saving" class="btn-spinner"></span>{{ saving ? $t('admin.savingEllipsis') : $t('admin.confirmBtn') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1.5rem;
}
.modal-card {
  position: relative; width: 100%; max-width: 460px; max-height: 88vh; overflow-y: auto;
  background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: 1.75rem;
}
.modal-close {
  position: absolute; top: 1rem; right: 1rem; width: 28px; height: 28px; border-radius: 999px; border: none;
  background: var(--color-bg); color: var(--color-text-muted); font-size: 0.85rem; cursor: pointer;
}
.modal-close:hover { background: var(--color-border); }
.modal-loading { padding: 2rem 0; text-align: center; color: var(--color-text-muted); }
.modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; margin-bottom: 1.25rem; padding-right: 1.5rem; }
.modal-eyebrow { margin: 0 0 0.15rem; font-size: 0.68rem; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.modal-ref { margin: 0; font-size: 1.15rem; }

.modal-section { margin-bottom: 1.1rem; }
.section-label { font-size: 0.7rem; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.03em; margin: 0 0 0.5rem; }
.info-row { display: flex; align-items: center; gap: 0.6rem; font-size: 0.86rem; margin-bottom: 0.55rem; }
.info-icon {
  width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  background: var(--color-primary-light);
}
.info-icon svg { width: 14px; height: 14px; fill: var(--color-primary); }
.info-icon img { width: 100%; height: 100%; border-radius: 8px; object-fit: cover; display: block; }

.people { display: flex; flex-direction: column; gap: 0.6rem; }
.person-card { display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.65rem 0.75rem; background: var(--color-bg); border-radius: var(--radius-sm); }
.icon-guest { background: var(--color-primary-light); }
.icon-guest svg { fill: var(--color-primary); }
.icon-employee { background: var(--color-warning-bg); }
.icon-employee svg { fill: var(--color-warning); }
.person-info { display: flex; flex-direction: column; min-width: 0; }
.person-label { font-size: 0.66rem; font-weight: 700; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: 0.03em; }
.person-name { font-weight: 700; font-size: 0.88rem; }
.person-sub { font-size: 0.78rem; color: var(--color-text-muted); }

.receipt { display: flex; flex-direction: column; gap: 0.4rem; background: var(--color-bg); border-radius: var(--radius-sm); padding: 0.75rem 0.85rem; }
.receipt-row { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; font-size: 0.84rem; }
.receipt-row em { font-style: normal; color: var(--color-primary); font-weight: 700; }
.receipt-total { border-top: 1px solid var(--color-border); padding-top: 0.4rem; margin-top: 0.15rem; font-weight: 800; color: var(--color-primary); }
.note-text { margin: 0; font-size: 0.85rem; color: var(--color-text); background: var(--color-bg); padding: 0.65rem 0.75rem; border-radius: var(--radius-sm); white-space: pre-wrap; }

.modal-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem; padding-top: 1.1rem; border-top: 1px solid var(--color-border); }

.pay-summary { display: flex; flex-direction: column; gap: 0.3rem; background: var(--color-bg); border-radius: var(--radius-sm); padding: 0.65rem 0.85rem; }
.pay-summary.due { background: var(--color-warning-bg); }
.pay-summary-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.84rem; color: var(--color-text-muted); }
.pay-summary-row strong { color: var(--color-text); font-weight: 700; }
.pay-summary-row strong.paid { color: #15803d; }
.pay-summary-row.due strong { color: var(--color-warning); font-size: 1rem; }
.settle-btn { width: 100%; justify-content: center; margin-top: 0.6rem; }

/* Nested on top of the booking-detail modal itself, so it needs to stack above it. */
.confirm-backdrop { z-index: 1100; }
.confirm-card { max-width: 400px; max-height: none; }
.confirm-card h2 { margin: 0 0 0.5rem; font-size: 1.1rem; }
.modal-hint { margin: 0 0 0.85rem; font-size: 0.85rem; color: var(--color-text-muted); line-height: 1.5; }
.reason-label { display: block; margin: 0 0 0.4rem; font-weight: 600; font-size: 0.85rem; }
.reason-label textarea { width: 100%; margin-top: 0.35rem; resize: vertical; }
.confirm-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.25rem; }
.btn-spinner {
  width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff; display: inline-block; margin-right: 0.4rem; animation: booking-modal-spin 0.7s linear infinite;
}
@keyframes booking-modal-spin { to { transform: rotate(360deg); } }
</style>
