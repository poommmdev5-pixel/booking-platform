<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { bookingsApi } from '../../api/bookings';
import { formatCurrency, formatDate } from '../../i18n';
import StatusBadge from '../../components/StatusBadge.vue';
import BackButton from '../../components/BackButton.vue';

const props = defineProps({ id: { type: String, required: true } });
const { t } = useI18n();
const booking = ref(null);

const NEXT_STATUS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'no_show', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};

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
  booking.value = await bookingsApi.getAdmin(props.id);
}

function nextStatuses() {
  return booking.value ? NEXT_STATUS[booking.value.status] || [] : [];
}

const statusModal = ref(null); // { status } | null
const cancelReason = ref('');
const changingStatus = ref(false);
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
  changingStatus.value = true;
  statusChangeError.value = '';
  try {
    if (status === 'cancelled') {
      await bookingsApi.cancelAdmin(booking.value.id, cancelReason.value.trim());
    } else {
      await bookingsApi.setStatus(booking.value.id, status);
    }
    statusModal.value = null;
    await load();
  } catch (err) {
    statusChangeError.value = err.message;
  } finally {
    changingStatus.value = false;
  }
}

const settling = ref(false);
async function settleBalance() {
  settling.value = true;
  try {
    await bookingsApi.settleBalance(booking.value.id);
    await load();
  } finally {
    settling.value = false;
  }
}

const PAYMENT_TYPE_KEY = { full: 'admin.paymentTypeFull', deposit: 'admin.paymentTypeDeposit', balance: 'admin.paymentTypeBalance' };
const paymentTypeLabel = computed(() => t(PAYMENT_TYPE_KEY[booking.value?.payment?.paymentType] || ''));

onMounted(load);
</script>

<template>
  <div v-if="booking" class="detail-page">
    <BackButton :to="{ name: 'admin-bookings' }" />
    <div class="header">
      <h1>{{ booking.reference }}</h1>
      <StatusBadge :status="booking.status" />
    </div>
    <dl class="card">
      <dt>{{ $t('admin.products') }}</dt><dd>{{ booking.product?.name ?? booking.productId }}</dd>
      <dt>{{ $t('admin.colDate') }}</dt>
      <dd>
        {{ formatDate(booking.dateStart) }}
        <span v-if="booking.dateEnd">→ {{ formatDate(booking.dateEnd) }}</span>
        <span v-if="booking.timeStart">{{ booking.timeStart }} - {{ booking.timeEnd }}</span>
      </dd>
      <dt>{{ $t('booking.name') }}</dt><dd>{{ booking.guestName }} · {{ booking.guestEmail }} · {{ booking.guestPhone }}</dd>
      <dt>{{ $t('booking.guests') }}</dt><dd>{{ booking.guests }}</dd>
      <dt v-if="booking.priceTierLabel">{{ $t('product.selectPrice') }}</dt><dd v-if="booking.priceTierLabel">{{ booking.priceTierLabel }}</dd>
      <dt v-if="booking.extras && booking.extras.length">{{ $t('admin.extras') }}</dt>
      <dd v-if="booking.extras && booking.extras.length">
        {{ booking.extras.map((e) => `${e.name} (${formatCurrency(e.price)})`).join(', ') }}
      </dd>
      <dt>{{ $t('booking.total') }}</dt><dd class="total">{{ formatCurrency(booking.totalPrice) }}</dd>
      <dt>{{ $t('booking.note') }}</dt><dd>{{ booking.note || '—' }}</dd>
    </dl>

    <div class="card payment-card" :class="{ 'has-balance': booking.payment.balanceDue > 0 }">
      <div class="payment-card-head">
        <h2>{{ $t('admin.paymentSectionTitle') }}</h2>
        <span v-if="booking.payment.paymentType" class="payment-type-pill">{{ paymentTypeLabel }}</span>
      </div>
      <div class="payment-rows">
        <div class="payment-row"><span>{{ $t('admin.totalPriceLabel') }}</span><strong>{{ formatCurrency(booking.totalPrice) }}</strong></div>
        <div class="payment-row"><span>{{ $t('admin.amountPaidLabel') }}</span><strong class="paid">{{ formatCurrency(booking.payment.amountPaid) }}</strong></div>
        <div class="payment-row balance" v-if="booking.payment.balanceDue > 0"><span>{{ $t('admin.balanceDueLabel') }}</span><strong>{{ formatCurrency(booking.payment.balanceDue) }}</strong></div>
      </div>
      <p v-if="booking.payment.balanceDue > 0" class="balance-hint">{{ $t('admin.balanceHint') }}</p>
      <button v-if="booking.payment.balanceDue > 0" class="btn btn-secondary" :disabled="settling" @click="settleBalance">
        {{ settling ? $t('admin.savingEllipsis') : $t('admin.settleBalanceBtn', { amount: formatCurrency(booking.payment.balanceDue) }) }}
      </button>
      <p v-if="booking.payment.amountPaid === 0" class="no-payment-hint">{{ $t('admin.noPaymentYet') }}</p>
    </div>

    <div v-if="nextStatuses().length" class="actions">
      <button
        v-for="s in nextStatuses()"
        :key="s"
        class="btn"
        :class="{ 'btn-danger': s === 'cancelled', 'btn-secondary': s !== 'cancelled' && s !== 'confirmed' }"
        @click="openStatusModal(s)"
      >
        {{ $t('status.' + s) }}
      </button>
    </div>

    <div v-if="statusModal" class="modal-backdrop" @click.self="statusModal = null">
      <div class="modal-card">
        <h2>{{ $t(STATUS_TITLE_KEY[statusModal.status]) }}</h2>
        <p class="modal-hint">{{ $t(STATUS_HINT_KEY[statusModal.status]) }}</p>
        <label v-if="statusModal.status === 'cancelled'" class="reason-label">
          {{ $t('admin.cancelReasonLabel') }}
          <textarea v-model="cancelReason" rows="3" :placeholder="$t('admin.cancelReasonPlaceholder')" autofocus></textarea>
        </label>
        <p v-if="statusChangeError" class="error">{{ statusChangeError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" :disabled="changingStatus" @click="statusModal = null">{{ $t('common.cancel') }}</button>
          <button
            type="button"
            class="btn"
            :class="{ 'btn-danger': statusModal.status === 'cancelled' }"
            :disabled="changingStatus"
            @click="confirmStatusChange"
          >
            <span v-if="changingStatus" class="btn-spinner"></span>{{ changingStatus ? $t('admin.savingEllipsis') : $t('admin.confirmBtn') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-page { max-width: 620px; }
.header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem; }
.header h1 { margin: 0; }
dl { display: grid; grid-template-columns: 140px 1fr; row-gap: 0.85rem; }
dt { font-weight: 600; color: var(--color-text-muted); font-size: 0.85rem; }
dd { margin: 0; }
dd.total { font-weight: 700; color: var(--color-primary); }

.payment-card { margin-top: 1rem; }
.payment-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.9rem; }
.payment-card-head h2 { margin: 0; font-size: 1rem; }
.payment-type-pill {
  padding: 0.25rem 0.7rem; border-radius: 999px; background: var(--color-primary-light); color: var(--color-primary);
  font-size: 0.75rem; font-weight: 700;
}
.payment-rows { display: flex; flex-direction: column; gap: 0.5rem; }
.payment-row { display: flex; align-items: center; justify-content: space-between; font-size: 0.88rem; color: var(--color-text-muted); }
.payment-row strong { color: var(--color-text); font-weight: 700; }
.payment-row strong.paid { color: #15803d; }
.payment-card.has-balance { border-color: #fbbf24; }
.payment-row.balance { padding-top: 0.5rem; margin-top: 0.15rem; border-top: 1px dashed var(--color-border); font-weight: 700; }
.payment-row.balance strong { color: #b45309; font-size: 1.05rem; }
.balance-hint { margin: 0.85rem 0 0.75rem; font-size: 0.82rem; color: var(--color-text-muted); line-height: 1.5; }
.no-payment-hint { margin: 0.75rem 0 0; font-size: 0.82rem; color: var(--color-text-muted); }

.actions { margin-top: 1.25rem; display: flex; justify-content: flex-end; gap: 0.6rem; }

.modal-backdrop {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1.25rem; overflow-y: auto;
}
.modal-card { width: 100%; max-width: 420px; background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: 1.75rem; }
.modal-card h2 { margin: 0 0 0.5rem; font-size: 1.1rem; }
.modal-hint { margin: 0 0 0.85rem; font-size: 0.85rem; color: var(--color-text-muted); line-height: 1.5; }
.reason-label { display: block; margin: 0 0 0.4rem; font-weight: 600; font-size: 0.85rem; }
.reason-label textarea { width: 100%; margin-top: 0.35rem; resize: vertical; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.25rem; }
.btn-spinner {
  width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff; display: inline-block; margin-right: 0.4rem; animation: status-modal-spin 0.7s linear infinite;
}
@keyframes status-modal-spin { to { transform: rotate(360deg); } }
</style>
