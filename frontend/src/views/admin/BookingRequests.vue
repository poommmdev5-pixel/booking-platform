<script setup>
import { computed, onMounted, ref } from 'vue';
import { bookingsApi } from '../../api/bookings';
import { formatDate } from '../../i18n';
import { usePagination } from '../../composables/usePagination';
import Pagination from '../../components/Pagination.vue';

const requests = ref([]);
const loading = ref(true);
const statusFilter = ref('pending');
const { page, totalPages, pageItems: pageRequests, reset: resetPage } = usePagination(requests, 8);

const actingId = ref(null);
const noteModal = ref(null); // { request, action: 'approve' | 'reject' }
const note = ref('');
const actionError = ref('');

async function reload() {
  loading.value = true;
  try {
    requests.value = await bookingsApi.listChangeRequests(statusFilter.value);
    resetPage();
  } finally {
    loading.value = false;
  }
}

onMounted(reload);

function requestedSchedule(r) {
  if (r.type !== 'reschedule') return '';
  return r.requestedSlot || '';
}

function openAction(request, action) {
  noteModal.value = { request, action };
  note.value = '';
  actionError.value = '';
}

async function confirmAction() {
  if (!noteModal.value) return;
  const { request, action } = noteModal.value;
  actingId.value = request.id;
  actionError.value = '';
  try {
    if (action === 'approve') await bookingsApi.approveChangeRequest(request.id, note.value.trim() || undefined);
    else await bookingsApi.rejectChangeRequest(request.id, note.value.trim() || undefined);
    noteModal.value = null;
    await reload();
  } catch (err) {
    actionError.value = err.message;
  } finally {
    actingId.value = null;
  }
}
</script>

<template>
  <h1>{{ $t('admin.bookingRequests') }}</h1>
  <p class="page-sub">{{ $t('admin.bookingRequestsSub') }}</p>

  <div class="filters">
    <select v-model="statusFilter" @change="reload">
      <option value="pending">{{ $t('admin.requestStatusPending') }}</option>
      <option value="approved">{{ $t('admin.requestStatusApproved') }}</option>
      <option value="rejected">{{ $t('admin.requestStatusRejected') }}</option>
      <option value="all">{{ $t('admin.allStatuses') }}</option>
    </select>
  </div>

  <div v-if="loading" class="empty-state">{{ $t('common.loading') }}</div>
  <div v-else-if="requests.length === 0" class="empty-state">{{ $t('common.noResults') }}</div>
  <template v-else>
    <div class="table-scroll">
    <table class="desktop-table">
      <thead>
        <tr>
          <th>{{ $t('admin.colRef') }}</th>
          <th>{{ $t('booking.name') }}</th>
          <th>{{ $t('admin.requestType') }}</th>
          <th>{{ $t('admin.requestDetail') }}</th>
          <th>{{ $t('admin.requestSubmitted') }}</th>
          <th v-if="statusFilter !== 'pending'">{{ $t('admin.colStatus') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in pageRequests" :key="r.id">
          <td><span class="cell-truncate" :title="r.booking.reference">{{ r.booking.reference }}</span></td>
          <td><span class="cell-truncate" :title="r.booking.guestName">{{ r.booking.guestName }}</span></td>
          <td><span class="type-pill" :class="`type-${r.type}`">{{ $t('admin.requestType' + (r.type === 'cancel' ? 'Cancel' : 'Reschedule')) }}</span></td>
          <td>
            <span v-if="r.type === 'cancel'" class="cell-truncate" :title="r.reason">{{ r.reason }}</span>
            <span v-else>→ {{ requestedSchedule(r) }}</span>
          </td>
          <td class="nowrap-cell">{{ formatDate(r.createdAt, 'medium') }}</td>
          <td v-if="statusFilter !== 'pending'">
            <span class="request-status-pill" :class="`rs-${r.status}`">{{ $t('admin.requestStatus' + r.status.charAt(0).toUpperCase() + r.status.slice(1)) }}</span>
          </td>
          <td class="action-cell">
            <template v-if="r.status === 'pending'">
              <button class="btn btn-sm" :disabled="actingId === r.id" @click="openAction(r, 'approve')">{{ $t('admin.approve') }}</button>
              <button class="btn btn-ghost btn-sm danger-ghost" :disabled="actingId === r.id" @click="openAction(r, 'reject')">{{ $t('admin.reject') }}</button>
            </template>
            <router-link v-else class="btn-ghost btn-sm" :to="{ name: 'admin-booking-detail', params: { id: r.bookingId } }">{{ $t('admin.viewLabel') }}</router-link>
          </td>
        </tr>
      </tbody>
    </table>
    </div>

    <div class="mobile-cards">
      <div v-for="r in pageRequests" :key="r.id" class="request-card">
        <div class="request-card-top">
          <span class="booking-ref">{{ r.booking.reference }}</span>
          <span class="type-pill" :class="`type-${r.type}`">{{ $t('admin.requestType' + (r.type === 'cancel' ? 'Cancel' : 'Reschedule')) }}</span>
        </div>
        <p class="request-guest">{{ r.booking.guestName }}</p>
        <p class="request-detail">
          <span v-if="r.type === 'cancel'">{{ r.reason }}</span>
          <span v-else>→ {{ requestedSchedule(r) }}</span>
        </p>
        <div class="request-card-bottom">
          <span class="request-submitted">{{ formatDate(r.createdAt, 'medium') }}</span>
          <span v-if="statusFilter !== 'pending'" class="request-status-pill" :class="`rs-${r.status}`">
            {{ $t('admin.requestStatus' + r.status.charAt(0).toUpperCase() + r.status.slice(1)) }}
          </span>
        </div>
        <div v-if="r.status === 'pending'" class="request-card-actions">
          <button class="btn btn-sm" :disabled="actingId === r.id" @click="openAction(r, 'approve')">{{ $t('admin.approve') }}</button>
          <button class="btn btn-ghost btn-sm danger-ghost" :disabled="actingId === r.id" @click="openAction(r, 'reject')">{{ $t('admin.reject') }}</button>
        </div>
        <router-link v-else class="btn-ghost btn-sm view-link" :to="{ name: 'admin-booking-detail', params: { id: r.bookingId } }">{{ $t('admin.viewLabel') }}</router-link>
      </div>
    </div>
  </template>
  <Pagination :page="page" :total-pages="totalPages" @update:page="page = $event" />

  <div v-if="noteModal" class="modal-backdrop" @click.self="noteModal = null">
    <div class="modal-card">
      <h2>{{ noteModal.action === 'approve' ? $t('admin.approveRequestTitle') : $t('admin.rejectRequestTitle') }}</h2>
      <p class="modal-hint">
        {{ noteModal.action === 'approve' ? $t('admin.approveRequestHint') : $t('admin.rejectRequestHint') }}
      </p>
      <textarea v-model="note" rows="3" :placeholder="$t('admin.requestNotePlaceholder')"></textarea>
      <p v-if="actionError" class="error">{{ actionError }}</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="noteModal = null">{{ $t('common.cancel') }}</button>
        <button
          class="btn"
          :class="{ 'btn-danger': noteModal.action === 'reject' }"
          :disabled="actingId === noteModal.request.id"
          @click="confirmAction"
        >
          {{ actingId === noteModal.request.id ? $t('admin.savingEllipsis') : (noteModal.action === 'approve' ? $t('admin.approve') : $t('admin.reject')) }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-sub { margin: -0.6rem 0 1.5rem; font-size: 0.88rem; color: var(--color-text-muted); }
.filters {
  display: flex; gap: 0.75rem; margin-bottom: 1.5rem; flex-wrap: wrap;
  background: var(--color-surface); padding: 1rem 1.25rem; border-radius: var(--radius-md);
  border: 1px solid var(--color-border); box-shadow: var(--shadow-sm);
}
.filters select { margin: 0; max-width: 220px; }

.type-pill { display: inline-block; padding: 0.25rem 0.6rem; border-radius: 999px; font-size: 0.74rem; font-weight: 700; white-space: nowrap; }
.type-cancel { background: #fee2e2; color: #991b1b; }
.type-reschedule { background: #e0e7ff; color: #4338ca; }

.request-status-pill { display: inline-block; padding: 0.25rem 0.6rem; border-radius: 999px; font-size: 0.74rem; font-weight: 700; white-space: nowrap; }
.rs-approved { background: var(--color-success-bg, #dcfce7); color: var(--color-success, #166534); }
.rs-rejected { background: var(--color-danger-bg); color: #991b1b; }
.rs-pending { background: var(--color-warning-bg); color: #92400e; }

.action-cell { display: flex; gap: 0.5rem; }
.btn-sm { padding: 0.4rem 0.75rem; font-size: 0.8rem; }
.btn-ghost { display: inline-flex; padding: 0.35rem 0.6rem; font-size: 0.8rem; font-weight: 600; border-radius: 7px; color: var(--color-primary); }
.btn-ghost:hover { background: var(--color-primary-light); }
.danger-ghost { color: var(--color-danger); }
.danger-ghost:hover { background: var(--color-danger-bg); }

.modal-backdrop {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1.25rem;
}
.modal-card { width: 100%; max-width: 420px; background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: 1.75rem; }
.modal-card h2 { margin: 0 0 0.5rem; font-size: 1.1rem; }
.modal-hint { margin: 0 0 0.85rem; font-size: 0.85rem; color: var(--color-text-muted); }
.modal-card textarea { width: 100%; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.25rem; }

.mobile-cards { display: none; }
.table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: var(--radius-md); }
.table-scroll table { min-width: 640px; }
.nowrap-cell { white-space: nowrap; }
.request-card {
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm); padding: 0.9rem 1rem; margin-bottom: 0.6rem;
}
.request-card-top { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
.request-card .booking-ref { font-weight: 700; font-size: 0.86rem; font-family: monospace; }
.request-guest { margin: 0.35rem 0 0; font-weight: 600; font-size: 0.92rem; }
.request-detail { margin: 0.2rem 0 0; font-size: 0.84rem; color: var(--color-text-muted); }
.request-card-bottom { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; margin-top: 0.55rem; }
.request-submitted { font-size: 0.76rem; color: var(--color-text-faint); }
.request-card-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
.request-card-actions .btn, .request-card-actions .btn-ghost { flex: 1; justify-content: center; }
.view-link { display: inline-flex; margin-top: 0.65rem; }

/* Same reasoning as BookingList.vue: a 6-7 column table has no room to breathe at
   tablet widths, so the card layout takes over well above the usual mobile breakpoint. */
@media (max-width: 1024px) {
  .desktop-table { display: none; }
  .mobile-cards { display: block; }
  .filters { padding: 0.85rem 1rem; }
  .filters select { max-width: none; flex: 1 1 100%; }
}
</style>
