<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { settingsApi } from '../../api/settings';

const { t } = useI18n();

// Four tabs instead of one long scroll — each maps 1:1 to a settings-card below, so
// switching tabs is just showing/hiding sections that were already going to be loaded
// together anyway (v-show, not v-if, so nothing needs to re-fetch on tab switch).
const TABS = [
  { id: 'business', labelKey: 'admin.settingsTabBusiness', iconClass: 'icon-business' },
  { id: 'policy', labelKey: 'admin.settingsTabPolicy', iconClass: 'icon-policy' },
  { id: 'payment', labelKey: 'admin.settingsTabPayment', iconClass: 'icon-payment' },
  { id: 'notifications', labelKey: 'admin.settingsTabNotifications', iconClass: 'icon-mail' },
];
const activeTab = ref('business');
// On the mobile horizontal tab strip, the active tab can land off-screen (e.g. switching
// straight to the last tab) with no scrollbar visible to hint more tabs exist — scroll it
// into view so it's never silently hidden.
function selectTab(id, event) {
  activeTab.value = id;
  event.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

const businessInfo = ref({ name: '', address: '', phone: '', defaultOpenTime: '09:00', defaultCloseTime: '18:00' });
const bookingPolicy = ref({
  autoConfirm: true,
  cancellationHoursBefore: 24,
  allowSelfCancel: true,
  allowSelfReschedule: true,
  rescheduleHoursBefore: 24,
  requireApprovalForCancel: false,
  requireApprovalForReschedule: false,
});
const paymentPolicy = ref({ depositEnabled: false, depositPercent: 30 });
const notificationPolicy = ref({
  customerStatusChange: { confirmed: true, completed: true, cancelled: true, no_show: true },
  employeeAssigned: true,
  adminNewBooking: true,
  adminRescheduleRequest: true,
  adminCancelRequest: true,
});
const saved = ref(false);
const paymentError = ref('');
const savingBusiness = ref(false);
const savingPolicy = ref(false);
const savingPayment = ref(false);
const savingNotifications = ref(false);

onMounted(async () => {
  businessInfo.value = await settingsApi.getBusinessInfo();
  bookingPolicy.value = await settingsApi.getBookingPolicy();
  paymentPolicy.value = await settingsApi.getPaymentPolicy();
  notificationPolicy.value = await settingsApi.getNotificationPolicy();
});

function flashSaved() {
  saved.value = true;
  setTimeout(() => (saved.value = false), 2200);
}

async function saveBusinessInfo() {
  savingBusiness.value = true;
  try {
    await settingsApi.setBusinessInfo(businessInfo.value);
    flashSaved();
  } finally {
    savingBusiness.value = false;
  }
}

async function saveBookingPolicy() {
  savingPolicy.value = true;
  try {
    await settingsApi.setBookingPolicy(bookingPolicy.value);
    flashSaved();
  } finally {
    savingPolicy.value = false;
  }
}

async function savePaymentPolicy() {
  paymentError.value = '';
  if (paymentPolicy.value.depositEnabled && (!paymentPolicy.value.depositPercent || paymentPolicy.value.depositPercent < 1 || paymentPolicy.value.depositPercent > 99)) {
    paymentError.value = t('admin.depositPercentRange');
    return;
  }
  savingPayment.value = true;
  try {
    paymentPolicy.value = await settingsApi.setPaymentPolicy(paymentPolicy.value);
    flashSaved();
  } catch (err) {
    paymentError.value = err.message;
  } finally {
    savingPayment.value = false;
  }
}

async function saveNotificationPolicy() {
  savingNotifications.value = true;
  try {
    await settingsApi.setNotificationPolicy(notificationPolicy.value);
    flashSaved();
  } finally {
    savingNotifications.value = false;
  }
}
</script>

<template>
  <div class="settings-page">
    <div class="page-head">
      <div>
        <h1>{{ $t('admin.settings') }}</h1>
        <p class="page-sub">{{ $t('admin.settingsSub') }}</p>
      </div>
      <Transition name="saved-pop">
        <span v-if="saved" class="saved-pill">
          <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          {{ $t('admin.savedIndicator') }}
        </span>
      </Transition>
    </div>

    <div class="settings-layout">
      <nav class="settings-tabs">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === tab.id }"
          @click="selectTab(tab.id, $event)"
        >
          <span class="tab-icon" :class="tab.iconClass">
            <svg v-if="tab.id === 'business'" viewBox="0 0 24 24"><path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/></svg>
            <svg v-else-if="tab.id === 'policy'" viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z"/></svg>
            <span v-else-if="tab.id === 'payment'">฿</span>
            <svg v-else viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
          </span>
          <span class="tab-label">{{ $t(tab.labelKey) }}</span>
        </button>
      </nav>

      <div class="settings-content">
    <section v-show="activeTab === 'business'" class="settings-card">
      <div class="settings-card-head">
        <span class="settings-icon icon-business">
          <svg viewBox="0 0 24 24"><path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/></svg>
        </span>
        <div>
          <h2>{{ $t('admin.businessInfoTitle') }}</h2>
          <p class="settings-card-sub">{{ $t('admin.businessInfoSub') }}</p>
        </div>
      </div>

      <div class="field-grid">
        <label class="span-2">{{ $t('admin.businessNameLabel') }}<input v-model="businessInfo.name" /></label>
        <label class="span-2">{{ $t('admin.addressLabel') }}<input v-model="businessInfo.address" /></label>
        <label>{{ $t('admin.phone') }}<input v-model="businessInfo.phone" /></label>
        <label></label>
        <label>{{ $t('admin.defaultOpenTime') }}<input type="time" v-model="businessInfo.defaultOpenTime" /></label>
        <label>{{ $t('admin.defaultCloseTime') }}<input type="time" v-model="businessInfo.defaultCloseTime" /></label>
      </div>

      <div class="card-actions">
        <button class="btn" :disabled="savingBusiness" @click="saveBusinessInfo">
          <span v-if="savingBusiness" class="btn-spinner"></span>{{ savingBusiness ? $t('admin.savingEllipsis') : $t('admin.save') }}
        </button>
      </div>
    </section>

    <section v-show="activeTab === 'policy'" class="settings-card">
      <div class="settings-card-head">
        <span class="settings-icon icon-policy">
          <svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z"/></svg>
        </span>
        <div>
          <h2>{{ $t('admin.bookingPolicyTitle') }}</h2>
          <p class="settings-card-sub">{{ $t('admin.bookingPolicySub') }}</p>
        </div>
      </div>

      <div class="toggle-row" :class="{ on: bookingPolicy.autoConfirm }">
        <div>
          <p class="toggle-title">{{ $t('admin.autoConfirmTitle') }}</p>
          <p class="toggle-desc">{{ $t('admin.autoConfirmDesc') }}</p>
        </div>
        <button
          type="button"
          class="switch"
          :class="{ on: bookingPolicy.autoConfirm }"
          role="switch"
          :aria-checked="bookingPolicy.autoConfirm"
          @click="bookingPolicy.autoConfirm = !bookingPolicy.autoConfirm"
        >
          <span class="switch-knob"></span>
        </button>
      </div>

      <div class="sub-divider"></div>
      <p class="policy-group-label">{{ $t('admin.selfServiceSectionLabel') }}</p>

      <div class="toggle-row" :class="{ on: bookingPolicy.allowSelfCancel }">
        <div>
          <p class="toggle-title">{{ $t('admin.allowSelfCancelTitle') }}</p>
          <p class="toggle-desc">{{ $t('admin.allowSelfCancelDesc') }}</p>
        </div>
        <button
          type="button"
          class="switch"
          :class="{ on: bookingPolicy.allowSelfCancel }"
          role="switch"
          :aria-checked="bookingPolicy.allowSelfCancel"
          @click="bookingPolicy.allowSelfCancel = !bookingPolicy.allowSelfCancel"
        >
          <span class="switch-knob"></span>
        </button>
      </div>

      <Transition name="expand">
        <div v-if="bookingPolicy.allowSelfCancel" class="nested-block">
          <label class="cancellation-field">
            {{ $t('admin.cancellationNoticeLabel') }}
            <div class="suffix-input-wrap">
              <input type="number" min="0" v-model.number="bookingPolicy.cancellationHoursBefore" />
              <span class="suffix">{{ $t('admin.hoursSuffix') }}</span>
            </div>
          </label>
          <label class="mini-toggle-row">
            <input type="checkbox" v-model="bookingPolicy.requireApprovalForCancel" />
            <span>
              <strong>{{ $t('admin.requireApprovalCancelTitle') }}</strong>
              <small>{{ $t('admin.requireApprovalCancelDesc') }}</small>
            </span>
          </label>
        </div>
      </Transition>

      <div class="toggle-row spaced" :class="{ on: bookingPolicy.allowSelfReschedule }">
        <div>
          <p class="toggle-title">{{ $t('admin.allowSelfRescheduleTitle') }}</p>
          <p class="toggle-desc">{{ $t('admin.allowSelfRescheduleDesc') }}</p>
        </div>
        <button
          type="button"
          class="switch"
          :class="{ on: bookingPolicy.allowSelfReschedule }"
          role="switch"
          :aria-checked="bookingPolicy.allowSelfReschedule"
          @click="bookingPolicy.allowSelfReschedule = !bookingPolicy.allowSelfReschedule"
        >
          <span class="switch-knob"></span>
        </button>
      </div>

      <Transition name="expand">
        <div v-if="bookingPolicy.allowSelfReschedule" class="nested-block">
          <label class="cancellation-field">
            {{ $t('admin.rescheduleNoticeLabel') }}
            <div class="suffix-input-wrap">
              <input type="number" min="0" v-model.number="bookingPolicy.rescheduleHoursBefore" />
              <span class="suffix">{{ $t('admin.hoursSuffix') }}</span>
            </div>
          </label>
          <label class="mini-toggle-row">
            <input type="checkbox" v-model="bookingPolicy.requireApprovalForReschedule" />
            <span>
              <strong>{{ $t('admin.requireApprovalRescheduleTitle') }}</strong>
              <small>{{ $t('admin.requireApprovalRescheduleDesc') }}</small>
            </span>
          </label>
        </div>
      </Transition>

      <div class="card-actions">
        <button class="btn" :disabled="savingPolicy" @click="saveBookingPolicy">
          <span v-if="savingPolicy" class="btn-spinner"></span>{{ savingPolicy ? $t('admin.savingEllipsis') : $t('admin.save') }}
        </button>
      </div>
    </section>

    <section v-show="activeTab === 'payment'" class="settings-card payment-section">
      <div class="settings-card-head">
        <span class="settings-icon icon-payment">฿</span>
        <div>
          <h2>{{ $t('admin.paymentSettingsTitle') }}</h2>
          <p class="settings-card-sub">{{ $t('admin.paymentSettingsSub') }}</p>
        </div>
      </div>

      <div class="toggle-row" :class="{ on: paymentPolicy.depositEnabled }">
        <div>
          <p class="toggle-title">{{ $t('admin.allowDepositTitle') }}</p>
          <p class="toggle-desc">{{ $t('admin.allowDepositDesc') }}</p>
        </div>
        <button
          type="button"
          class="switch"
          :class="{ on: paymentPolicy.depositEnabled }"
          role="switch"
          :aria-checked="paymentPolicy.depositEnabled"
          @click="paymentPolicy.depositEnabled = !paymentPolicy.depositEnabled"
        >
          <span class="switch-knob"></span>
        </button>
      </div>

      <Transition name="expand">
        <div v-if="paymentPolicy.depositEnabled" class="deposit-percent-row">
          <label class="percent-label">
            {{ $t('admin.depositPercentLabel') }}
            <div class="percent-input-wrap">
              <input type="number" min="1" max="99" v-model.number="paymentPolicy.depositPercent" />
              <span class="percent-sign">%</span>
            </div>
          </label>
          <p class="percent-hint">
            {{ $t('admin.depositPercentExample', { total: (1000).toLocaleString(), deposit: Math.round(1000 * (paymentPolicy.depositPercent || 0)) / 100 }) }}
          </p>
        </div>
      </Transition>

      <p v-if="paymentError" class="payment-error">{{ paymentError }}</p>
      <div class="card-actions">
        <button class="btn" :disabled="savingPayment" @click="savePaymentPolicy">
          <span v-if="savingPayment" class="btn-spinner"></span>{{ savingPayment ? $t('admin.savingEllipsis') : $t('admin.save') }}
        </button>
      </div>
    </section>

    <section v-show="activeTab === 'notifications'" class="settings-card">
      <div class="settings-card-head">
        <span class="settings-icon icon-mail">
          <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
        </span>
        <div>
          <h2>{{ $t('admin.notificationPolicyTitle') }}</h2>
          <p class="settings-card-sub">{{ $t('admin.notificationPolicySub') }}</p>
        </div>
      </div>

      <p class="policy-group-label">{{ $t('admin.notifyCustomerGroupLabel') }}</p>
      <p class="policy-group-hint">{{ $t('admin.notifyCustomerGroupHint') }}</p>
      <div class="status-toggle-grid">
        <label class="mini-toggle-row status-toggle" v-for="s in ['confirmed', 'completed', 'cancelled', 'no_show']" :key="s">
          <input type="checkbox" v-model="notificationPolicy.customerStatusChange[s]" />
          <span><strong>{{ $t('status.' + s) }}</strong></span>
        </label>
      </div>

      <div class="sub-divider"></div>
      <p class="policy-group-label">{{ $t('admin.notifyEmployeeGroupLabel') }}</p>
      <div class="toggle-row" :class="{ on: notificationPolicy.employeeAssigned }">
        <div>
          <p class="toggle-title">{{ $t('admin.notifyEmployeeAssignedTitle') }}</p>
          <p class="toggle-desc">{{ $t('admin.notifyEmployeeAssignedDesc') }}</p>
        </div>
        <button
          type="button"
          class="switch"
          :class="{ on: notificationPolicy.employeeAssigned }"
          role="switch"
          :aria-checked="notificationPolicy.employeeAssigned"
          @click="notificationPolicy.employeeAssigned = !notificationPolicy.employeeAssigned"
        >
          <span class="switch-knob"></span>
        </button>
      </div>

      <div class="sub-divider"></div>
      <p class="policy-group-label">{{ $t('admin.notifyAdminGroupLabel') }}</p>
      <div class="toggle-row" :class="{ on: notificationPolicy.adminNewBooking }">
        <div>
          <p class="toggle-title">{{ $t('admin.notifyAdminNewBookingTitle') }}</p>
          <p class="toggle-desc">{{ $t('admin.notifyAdminNewBookingDesc') }}</p>
        </div>
        <button
          type="button"
          class="switch"
          :class="{ on: notificationPolicy.adminNewBooking }"
          role="switch"
          :aria-checked="notificationPolicy.adminNewBooking"
          @click="notificationPolicy.adminNewBooking = !notificationPolicy.adminNewBooking"
        >
          <span class="switch-knob"></span>
        </button>
      </div>
      <div class="toggle-row spaced" :class="{ on: notificationPolicy.adminRescheduleRequest }">
        <div>
          <p class="toggle-title">{{ $t('admin.notifyAdminRescheduleTitle') }}</p>
          <p class="toggle-desc">{{ $t('admin.notifyAdminRescheduleDesc') }}</p>
        </div>
        <button
          type="button"
          class="switch"
          :class="{ on: notificationPolicy.adminRescheduleRequest }"
          role="switch"
          :aria-checked="notificationPolicy.adminRescheduleRequest"
          @click="notificationPolicy.adminRescheduleRequest = !notificationPolicy.adminRescheduleRequest"
        >
          <span class="switch-knob"></span>
        </button>
      </div>
      <div class="toggle-row spaced" :class="{ on: notificationPolicy.adminCancelRequest }">
        <div>
          <p class="toggle-title">{{ $t('admin.notifyAdminCancelTitle') }}</p>
          <p class="toggle-desc">{{ $t('admin.notifyAdminCancelDesc') }}</p>
        </div>
        <button
          type="button"
          class="switch"
          :class="{ on: notificationPolicy.adminCancelRequest }"
          role="switch"
          :aria-checked="notificationPolicy.adminCancelRequest"
          @click="notificationPolicy.adminCancelRequest = !notificationPolicy.adminCancelRequest"
        >
          <span class="switch-knob"></span>
        </button>
      </div>

      <div class="card-actions">
        <button class="btn" :disabled="savingNotifications" @click="saveNotificationPolicy">
          <span v-if="savingNotifications" class="btn-spinner"></span>{{ savingNotifications ? $t('admin.savingEllipsis') : $t('admin.save') }}
        </button>
      </div>
    </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page { max-width: 900px; }

.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.75rem; }
.page-head h1 { margin: 0 0 0.3rem; }
.page-sub { margin: 0; font-size: 0.88rem; color: var(--color-text-muted); }
.saved-pill {
  display: inline-flex; align-items: center; gap: 0.4rem; flex-shrink: 0;
  padding: 0.45rem 0.9rem; border-radius: 999px; background: var(--color-success-bg, #dcfce7);
  color: var(--color-success, #15803d); font-size: 0.82rem; font-weight: 700;
}
.saved-pill svg { width: 15px; height: 15px; fill: currentColor; }
.saved-pop-enter-active, .saved-pop-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.saved-pop-enter-from, .saved-pop-leave-to { opacity: 0; transform: translateY(-4px); }

.settings-layout { display: flex; align-items: flex-start; gap: 1.75rem; }
.settings-tabs {
  flex-shrink: 0; width: 200px; display: flex; flex-direction: column; gap: 0.3rem;
  position: sticky; top: 1.5rem;
}
.tab-btn {
  display: flex; align-items: center; gap: 0.7rem; width: 100%; text-align: left;
  padding: 0.6rem 0.75rem; border-radius: var(--radius-md); border: none; background: transparent;
  cursor: pointer; font-family: inherit; font-size: 0.86rem; font-weight: 600; color: var(--color-text-muted);
  transition: background 0.14s ease, color 0.14s ease;
}
.tab-btn:hover { background: var(--color-bg, #f1f5f9); color: var(--color-text); }
.tab-btn.active { background: var(--color-surface); color: var(--color-text); box-shadow: var(--shadow-sm); border: 1px solid var(--color-border); }
.tab-icon {
  flex-shrink: 0; width: 30px; height: 30px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.9rem;
}
.tab-icon svg { width: 16px; height: 16px; }
.tab-label { flex: 1; min-width: 0; }
.settings-content { flex: 1; min-width: 0; }

@media (max-width: 760px) {
  .settings-layout { flex-direction: column; }
  .settings-tabs {
    position: static; width: 100%; display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem;
  }
  .tab-btn { width: 100%; }
  .tab-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
@media (max-width: 420px) {
  .settings-tabs { grid-template-columns: 1fr; }
}

.settings-card {
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm); padding: 1.5rem 1.65rem; margin-bottom: 1.5rem;
}
.settings-card-head { display: flex; align-items: flex-start; gap: 0.9rem; margin-bottom: 1.4rem; }
.settings-card-head > div { min-width: 0; flex: 1; }
.settings-icon {
  flex-shrink: 0; width: 42px; height: 42px; border-radius: var(--radius-md);
  display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.2rem;
}
.settings-icon svg { width: 21px; height: 21px; }
.icon-business { background: #eff6ff; color: #2563eb; }
.icon-business svg { fill: #2563eb; }
.icon-policy { background: var(--color-warning-bg); color: var(--color-warning); }
.icon-policy svg { fill: var(--color-warning); }
.icon-payment { background: var(--color-primary-light); color: var(--color-primary); }
.icon-mail { background: #e0e7ff; color: #4338ca; }
.icon-mail svg { fill: #4338ca; }
.settings-card-head h2 { margin: 0 0 0.2rem; font-size: 1.02rem; }
.settings-card-sub { margin: 0; font-size: 0.84rem; color: var(--color-text-muted); line-height: 1.5; }

.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem 1rem; }
.field-grid label { margin: 0; }
.field-grid label.span-2 { grid-column: 1 / -1; }
.field-grid input { margin: 0.35rem 0 0; max-width: none; }
@media (max-width: 520px) { .field-grid { grid-template-columns: 1fr; } .field-grid label.span-2 { grid-column: auto; } }

.toggle-row {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem;
  padding: 0.9rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--color-border);
  background: #fff; transition: border-color 0.15s ease, background 0.15s ease;
}
/* Without min-width:0, a flex item won't shrink below its text's natural width, and on a
   narrow viewport (sidebar leaves little room) that forces Thai text — which has no spaces
   for the browser to break on — into an ugly one-syllable-per-line column. */
.toggle-row > div:first-child { min-width: 0; flex: 1; }
.toggle-row.on { border-color: var(--color-primary); background: var(--color-primary-light); }
.toggle-row.spaced { margin-top: 0.75rem; }
.sub-divider { height: 1px; background: var(--color-border); margin: 1.4rem 0 0.9rem; }
.policy-group-label {
  margin: 0 0 0.7rem; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--color-text-muted);
}
.policy-group-hint { margin: -0.4rem 0 0.9rem; font-size: 0.8rem; color: var(--color-text-muted); line-height: 1.5; }
.status-toggle-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem; }
.status-toggle {
  margin-top: 0; padding: 0.6rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: #fff; max-width: none;
}
@media (max-width: 480px) { .status-toggle-grid { grid-template-columns: 1fr; } }
.toggle-title { margin: 0 0 0.2rem; font-weight: 700; font-size: 0.92rem; }
.toggle-desc { margin: 0; font-size: 0.8rem; color: var(--color-text-muted); line-height: 1.5; max-width: 30rem; }

.switch {
  flex-shrink: 0; position: relative; width: 44px; height: 26px; border-radius: 999px;
  border: none; background: #cbd5e1; cursor: pointer; padding: 0; transition: background 0.18s ease;
}
.switch.on { background: var(--color-primary); }
.switch-knob {
  position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%;
  background: #fff; box-shadow: var(--shadow-sm); transition: transform 0.18s ease;
}
.switch.on .switch-knob { transform: translateX(18px); }

.cancellation-field { display: block; margin-top: 1rem; font-weight: 600; font-size: 0.85rem; }
.nested-block { margin: 0.6rem 0 0 1rem; padding-left: 0.85rem; border-left: 2px solid var(--color-border); }
.nested-block .cancellation-field { margin-top: 0; }
.mini-toggle-row {
  display: flex; align-items: flex-start; gap: 0.55rem; margin-top: 0.9rem; cursor: pointer; max-width: 26rem;
}
.mini-toggle-row input[type='checkbox'] { margin: 0.2rem 0 0; flex-shrink: 0; width: 15px; height: 15px; accent-color: var(--color-primary); cursor: pointer; }
.mini-toggle-row span { display: flex; flex-direction: column; gap: 0.1rem; }
.mini-toggle-row strong { font-size: 0.82rem; font-weight: 700; }
.mini-toggle-row small { font-size: 0.76rem; color: var(--color-text-muted); line-height: 1.5; }
/* input[type='number'] is globally capped at max-width: 200px (main.css) — matching that
   cap here (rather than leaving this wrapper wider) keeps the absolutely-positioned suffix
   anchored to the input's actual right edge instead of floating past it. */
.suffix-input-wrap { position: relative; margin-top: 0.4rem; max-width: 200px; }
.suffix-input-wrap input { padding-right: 3.6rem; margin: 0; }
.suffix { position: absolute; right: 0.85rem; top: 50%; transform: translateY(-50%); color: var(--color-text-muted); font-weight: 600; font-size: 0.8rem; pointer-events: none; }

.deposit-percent-row { margin-top: 1rem; padding: 1rem; border-radius: var(--radius-md); background: var(--color-bg, #f8fafc); overflow: hidden; }
.expand-enter-active, .expand-leave-active { transition: opacity 0.18s ease; }
.expand-enter-from, .expand-leave-to { opacity: 0; }
.percent-label { display: block; font-weight: 600; font-size: 0.85rem; margin: 0; }
.percent-input-wrap { position: relative; margin-top: 0.4rem; max-width: 140px; }
.percent-input-wrap input { padding-right: 2.2rem; margin: 0; }
.percent-sign { position: absolute; right: 0.85rem; top: 50%; transform: translateY(-50%); color: var(--color-text-muted); font-weight: 600; pointer-events: none; }
.percent-hint { margin: 0.65rem 0 0; font-size: 0.8rem; color: var(--color-text-muted); line-height: 1.5; }
.percent-hint strong { color: var(--color-primary); }

.payment-error { color: #dc2626; font-size: 0.85rem; margin: 0.75rem 0 0; }

.card-actions { display: flex; justify-content: flex-end; margin-top: 1.4rem; }
.card-actions .btn { display: inline-flex; align-items: center; gap: 0.5rem; }
.btn-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.4); border-top-color: #fff; animation: settings-spin 0.7s linear infinite; }
@keyframes settings-spin { to { transform: rotate(360deg); } }
</style>
