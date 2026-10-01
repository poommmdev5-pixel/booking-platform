<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { bookingsApi } from '../../api/bookings';
import { settingsApi } from '../../api/settings';
import { formatCurrency, formatDate } from '../../i18n';
import StatusBadge from '../../components/StatusBadge.vue';
import RescheduleModal from '../../components/RescheduleModal.vue';
import { useLocaleRefetch } from '../../composables/useLocaleRefetch';

const { t } = useI18n();

const reference = ref('');
const email = ref('');
const booking = ref(null);
const notFound = ref(false);
const submitting = ref(false);

const policy = ref({
  allowSelfCancel: true,
  allowSelfReschedule: true,
  cancellationHoursBefore: 24,
  rescheduleHoursBefore: 24,
  requireApprovalForCancel: false,
  requireApprovalForReschedule: false,
});
settingsApi
  .getBookingPolicyPublic()
  .then((p) => (policy.value = p))
  .catch(() => {});

async function submit() {
  notFound.value = false;
  booking.value = null;
  submitting.value = true;
  try {
    booking.value = await bookingsApi.lookup(reference.value, email.value);
  } catch {
    notFound.value = true;
  } finally {
    submitting.value = false;
  }
}

// If a result is already shown, refresh it on language switch too — no-op otherwise,
// since there's nothing to look up yet.
useLocaleRefetch(async () => {
  if (booking.value) await submit();
});

function resetSearch() {
  booking.value = null;
  notFound.value = false;
  reference.value = '';
  email.value = '';
}

// ---- Self-service eligibility: mirrors the same notice-window rule the backend
// enforces, so the UI doesn't offer an action the server will just reject — but the
// backend re-checks everything independently regardless (never trust the client alone
// for something that changes real capacity). ----
function hoursUntil(dateStr) {
  if (!dateStr) return Infinity;
  return (new Date(`${dateStr}T00:00:00Z`) - Date.now()) / (1000 * 60 * 60);
}
const isActiveBooking = computed(() => booking.value && ['pending', 'confirmed'].includes(booking.value.status));
const hasPendingRequest = computed(() => !!booking.value?.pendingChangeRequest);
const cancelHoursShort = computed(() => isActiveBooking.value && hoursUntil(booking.value.dateStart) < policy.value.cancellationHoursBefore);
const rescheduleHoursShort = computed(() => isActiveBooking.value && hoursUntil(booking.value.dateStart) < policy.value.rescheduleHoursBefore);
// A pending request already covers whichever change was asked for — hide both actions
// rather than let the guest queue up a second, possibly-conflicting request on top.
const showCancelAction = computed(() => isActiveBooking.value && policy.value.allowSelfCancel && !hasPendingRequest.value);
const showRescheduleAction = computed(() => isActiveBooking.value && policy.value.allowSelfReschedule && !hasPendingRequest.value);

// ---- Cancel modal ----
const cancelModalOpen = ref(false);
const cancelReason = ref('');
const cancelling = ref(false);
const cancelError = ref('');
const actionSuccess = ref('');

function openCancelModal() {
  cancelReason.value = '';
  cancelError.value = '';
  cancelModalOpen.value = true;
}

async function confirmCancel() {
  if (!cancelReason.value.trim()) return;
  cancelling.value = true;
  cancelError.value = '';
  try {
    const res = await bookingsApi.cancelGuest({ reference: booking.value.reference, email: booking.value.guestEmail, reason: cancelReason.value.trim() });
    cancelModalOpen.value = false;
    actionSuccess.value = res.pending ? t('booking.cancelRequestSubmitted') : t('booking.cancelSuccessMsg');
    await submit();
  } catch (err) {
    cancelError.value = err.message;
  } finally {
    cancelling.value = false;
  }
}

// ---- Reschedule modal (shared with the logged-in My Bookings flow — only how the
// final request is identified differs: reference+email here vs. session+ownership there) ----
const rescheduleModalOpen = ref(false);

function openRescheduleModal() {
  rescheduleModalOpen.value = true;
}

async function submitReschedule(payload) {
  const res = await bookingsApi.rescheduleGuest({ ...payload, reference: booking.value.reference, email: booking.value.guestEmail });
  rescheduleModalOpen.value = false;
  actionSuccess.value = res.pending ? t('booking.rescheduleRequestSubmitted') : t('booking.rescheduleSuccess');
  await submit();
  return res;
}
</script>

<template>
  <div class="lookup-page">
    <div class="lookup-card surface-panel">
      <p class="eyebrow">Andaman Breeze Resort</p>
      <h1 class="page-heading">{{ $t('account.lookupTitle') }}</h1>
      <p class="lookup-sub">{{ $t('account.lookupSub') }}</p>

      <form v-if="!booking" @submit.prevent="submit">
        <label>{{ $t('booking.reference') }}<input v-model="reference" required placeholder="BK-XXXXXX-XXXXXX" /></label>
        <label>{{ $t('booking.email') }}<input type="email" v-model="email" required /></label>
        <button class="btn btn-accent" type="submit" :disabled="submitting">{{ $t('account.lookupShort') }}</button>
      </form>
      <p v-if="notFound" class="error">{{ $t('account.lookupNotFound') }}</p>

      <Transition name="fade-msg">
        <p v-if="actionSuccess" class="action-success">✓ {{ actionSuccess }}</p>
      </Transition>

      <div v-if="booking" class="result">
        <div class="result-head">
          <div>
            <p class="result-label">{{ $t('booking.reference') }}</p>
            <p class="result-ref">{{ booking.reference }}</p>
          </div>
          <StatusBadge :status="booking.status" />
        </div>
        <div class="result-row">
          <span>{{ $t('booking.date') }}</span>
          <strong>{{ formatDate(booking.dateStart) }} <template v-if="booking.dateEnd">→ {{ formatDate(booking.dateEnd) }}</template><template v-if="booking.timeStart">· {{ booking.timeStart }}</template></strong>
        </div>
        <div v-if="booking.product" class="result-row"><span>{{ $t('nav.products') }}</span><strong>{{ booking.product.name }}</strong></div>
        <div class="result-row result-total"><span>{{ $t('booking.total') }}</span><strong>{{ formatCurrency(booking.totalPrice) }}</strong></div>

        <div v-if="booking.payment.amountPaid > 0" class="payment-mini">
          <div class="payment-mini-row"><span>{{ $t('admin.amountPaidLabel') }}</span><strong class="paid">{{ formatCurrency(booking.payment.amountPaid) }}</strong></div>
          <div v-if="booking.payment.balanceDue > 0" class="payment-mini-row due"><span>{{ $t('admin.balanceDueLabel') }}</span><strong>{{ formatCurrency(booking.payment.balanceDue) }}</strong></div>
        </div>

        <div v-if="hasPendingRequest" class="pending-request-banner">
          <span class="pending-icon">⏳</span>
          <span>{{ $t(booking.pendingChangeRequest.type === 'cancel' ? 'booking.pendingCancelBanner' : 'booking.pendingRescheduleBanner') }}</span>
        </div>

        <div v-if="showCancelAction || showRescheduleAction" class="self-service-actions">
          <div v-if="showRescheduleAction" class="action-row">
            <button class="btn btn-secondary btn-sm" :disabled="rescheduleHoursShort" @click="openRescheduleModal">{{ $t('booking.rescheduleAction') }}</button>
            <p v-if="rescheduleHoursShort" class="action-hint">{{ $t('booking.noticeTooLate', { hours: policy.rescheduleHoursBefore }) }}</p>
          </div>
          <div v-if="showCancelAction" class="action-row">
            <button class="btn btn-ghost btn-sm danger-ghost" :disabled="cancelHoursShort" @click="openCancelModal">{{ $t('booking.cancel') }}</button>
            <p v-if="cancelHoursShort" class="action-hint">{{ $t('booking.noticeTooLate', { hours: policy.cancellationHoursBefore }) }}</p>
          </div>
        </div>

        <button type="button" class="reset-search-btn" @click="resetSearch">{{ $t('booking.lookupAnother') }}</button>
      </div>
    </div>

    <!-- Cancel modal -->
    <div v-if="cancelModalOpen" class="modal-backdrop" @click.self="cancelModalOpen = false">
      <div class="modal-card">
        <h2>{{ $t('booking.cancelModalTitle') }}</h2>
        <p class="modal-hint">{{ $t('booking.cancelModalHint') }}</p>
        <textarea v-model="cancelReason" rows="3" :placeholder="$t('booking.cancelReasonPlaceholder')"></textarea>
        <p v-if="cancelError" class="error">{{ cancelError }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="cancelModalOpen = false">{{ $t('booking.keepBooking') }}</button>
          <button class="btn btn-danger" :disabled="!cancelReason.trim() || cancelling" @click="confirmCancel">
            {{ cancelling ? $t('admin.savingEllipsis') : $t('booking.cancelModalTitle') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Reschedule modal -->
    <RescheduleModal
      v-if="rescheduleModalOpen"
      :booking="booking"
      :submit="submitReschedule"
      @close="rescheduleModalOpen = false"
      @success="rescheduleModalOpen = false"
    />
  </div>
</template>

<style scoped>
.lookup-page { max-width: 460px; margin: 2rem auto; }
.lookup-card { padding: 2.25rem; }
.lookup-card .page-heading { margin: 0 0 0.5rem; }
.lookup-sub { color: var(--color-text-muted); font-size: 0.88rem; margin: 0 0 1.5rem; line-height: 1.6; }
.lookup-card input { max-width: none; }
.lookup-card .btn { width: 100%; margin-top: 0.5rem; justify-content: center; }

.action-success {
  margin: 1rem 0 0; padding: 0.6rem 0.9rem; border-radius: var(--radius-sm);
  background: var(--color-success-bg); color: var(--color-success); font-weight: 700; font-size: 0.86rem;
}
.fade-msg-enter-active, .fade-msg-leave-active { transition: opacity 0.2s ease; }
.fade-msg-enter-from, .fade-msg-leave-to { opacity: 0; }

.result { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--color-border-soft); display: flex; flex-direction: column; gap: 0.7rem; }
.result-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.4rem; }
.result-label { margin: 0; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-faint); }
.result-ref { margin: 0.15rem 0 0; font-weight: 800; font-size: 1.05rem; color: var(--color-primary-dark); }
.result-row { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; font-size: 0.88rem; color: var(--color-text-muted); }
.result-row strong { color: var(--color-text); font-weight: 700; }
.result-total { padding-top: 0.6rem; border-top: 1px dashed var(--color-border); font-size: 0.95rem; }
.result-total strong { color: var(--color-primary); font-size: 1.05rem; }

.payment-mini { background: var(--color-bg); border-radius: var(--radius-sm); padding: 0.65rem 0.85rem; display: flex; flex-direction: column; gap: 0.3rem; }
.payment-mini-row { display: flex; justify-content: space-between; font-size: 0.82rem; color: var(--color-text-muted); }
.payment-mini-row strong { color: var(--color-text); font-weight: 700; }
.payment-mini-row strong.paid { color: var(--color-success); }
.payment-mini-row.due strong { color: var(--color-warning); }

.pending-request-banner {
  display: flex; align-items: flex-start; gap: 0.55rem; padding: 0.7rem 0.9rem;
  border-radius: var(--radius-sm); background: var(--color-warning-bg); color: #92400e;
  font-size: 0.82rem; font-weight: 600; line-height: 1.5;
}
.pending-icon { flex-shrink: 0; }

.self-service-actions { display: flex; flex-direction: column; gap: 0.6rem; margin-top: 0.4rem; padding-top: 1rem; border-top: 1px solid var(--color-border-soft); }
.action-row .btn { width: 100%; margin: 0; justify-content: center; }
.action-row .btn:disabled { opacity: 0.45; }
.danger-ghost { color: var(--color-danger); }
.danger-ghost:hover { background: var(--color-danger-bg); }
.action-hint { margin: 0.35rem 0 0; font-size: 0.74rem; color: var(--color-text-faint); text-align: center; }
.reset-search-btn {
  margin-top: 0.6rem; background: none; border: none; color: var(--color-text-muted); font-size: 0.8rem;
  font-weight: 600; text-decoration: underline; cursor: pointer; align-self: center;
}

/* Modals */
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(13, 9, 5, 0.6); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1.25rem; overflow-y: auto;
}
.modal-card {
  width: 100%; max-width: 420px; max-height: 88vh; overflow-y: auto;
  background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: 1.75rem;
}
.modal-card h2 { margin: 0 0 0.5rem; font-size: 1.1rem; }
.modal-hint { margin: 0 0 0.85rem; font-size: 0.85rem; color: var(--color-text-muted); }
.modal-card textarea { width: 100%; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.25rem; }

.empty-state { padding: 0.75rem; text-align: center; font-size: 0.85rem; color: var(--color-text-muted); }
</style>
