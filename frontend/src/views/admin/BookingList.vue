<script setup>
import { onMounted, ref } from 'vue';
import { bookingsApi } from '../../api/bookings';
import { formatDate, formatDateTime, formatCurrency } from '../../i18n';
import StatusBadge from '../../components/StatusBadge.vue';
import { usePagination } from '../../composables/usePagination';
import Pagination from '../../components/Pagination.vue';

const bookings = ref([]);
const { page, totalPages, pageItems: pageBookings, reset: resetPage } = usePagination(bookings, 5);
const statuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
const search = ref('');
const status = ref('');
const from = ref('');
const to = ref('');

async function reload() {
  const res = await bookingsApi.listAdmin({
    search: search.value || undefined,
    status: status.value || undefined,
    from: from.value || undefined,
    to: to.value || undefined,
    pageSize: 200,
  });
  bookings.value = res.items;
  resetPage();
}

onMounted(reload);
</script>

<template>
  <h1>{{ $t('admin.bookings') }}</h1>
  <div class="filters">
    <input :placeholder="$t('admin.searchBookingsPlaceholder')" v-model="search" @input="reload" />
    <select v-model="status" @change="reload">
      <option value="">{{ $t('admin.allStatuses') }}</option>
      <option v-for="s in statuses" :key="s" :value="s">{{ $t('status.' + s) }}</option>
    </select>
    <input type="date" v-model="from" @change="reload" />
    <input type="date" v-model="to" @change="reload" />
  </div>
  <div v-if="bookings.length === 0" class="empty-state">{{ $t('common.noResults') }}</div>
  <template v-else>
    <div class="table-scroll">
    <table class="desktop-table">
      <thead><tr><th>{{ $t('admin.colRef') }}</th><th>{{ $t('admin.products') }}</th><th>{{ $t('admin.colDate') }}</th><th>{{ $t('admin.colCreatedAt') }}</th><th>{{ $t('booking.name') }}</th><th>{{ $t('admin.colStatus') }}</th><th>{{ $t('admin.colPayment') }}</th><th></th></tr></thead>
      <tbody>
        <tr v-for="b in pageBookings" :key="b.id">
          <td><span class="cell-truncate" :title="b.reference">{{ b.reference }}</span></td>
          <td><span class="cell-truncate" :title="b.product?.name">{{ b.product?.name ?? b.productId }}</span></td>
          <td class="nowrap-cell">{{ formatDate(b.dateStart) }} <span v-if="b.timeStart">{{ b.timeStart }}</span></td>
          <td class="nowrap-cell">{{ formatDateTime(b.createdAt) }}</td>
          <td><span class="cell-truncate" :title="b.guestName">{{ b.guestName }}</span></td>
          <td><StatusBadge :status="b.status" /></td>
          <td>
            <span v-if="b.payment.balanceDue > 0" class="pay-pill pay-pill-balance" :title="$t('admin.balanceDueTitle', { amount: formatCurrency(b.payment.balanceDue) })">
              {{ $t('admin.payPillDeposit', { amount: formatCurrency(b.payment.balanceDue) }) }}
            </span>
            <span v-else-if="b.payment.amountPaid > 0" class="pay-pill pay-pill-paid">{{ $t('admin.payPillPaid') }}</span>
            <span v-else class="pay-pill pay-pill-none">{{ $t('admin.payPillNone') }}</span>
          </td>
          <td><router-link class="btn-ghost btn-sm" :to="{ name: 'admin-booking-detail', params: { id: b.id } }">{{ $t('admin.viewLabel') }}</router-link></td>
        </tr>
      </tbody>
    </table>
    </div>

    <div class="mobile-cards">
      <router-link
        v-for="b in pageBookings"
        :key="b.id"
        class="booking-card"
        :to="{ name: 'admin-booking-detail', params: { id: b.id } }"
      >
        <div class="booking-card-top">
          <span class="booking-ref">{{ b.reference }}</span>
          <StatusBadge :status="b.status" />
        </div>
        <p class="booking-product">{{ b.product?.name ?? b.productId }}</p>
        <div class="booking-meta">
          <span>{{ formatDate(b.dateStart) }} <template v-if="b.timeStart">· {{ b.timeStart }}</template></span>
          <span class="booking-guest">{{ b.guestName }}</span>
        </div>
        <p class="booking-created-at">{{ $t('admin.colCreatedAt') }}: {{ formatDateTime(b.createdAt) }}</p>
        <span v-if="b.payment.balanceDue > 0" class="pay-pill pay-pill-balance">
          {{ $t('admin.payPillDeposit', { amount: formatCurrency(b.payment.balanceDue) }) }}
        </span>
        <span v-else-if="b.payment.amountPaid > 0" class="pay-pill pay-pill-paid">{{ $t('admin.payPillPaid') }}</span>
        <span v-else class="pay-pill pay-pill-none">{{ $t('admin.payPillNone') }}</span>
      </router-link>
    </div>
  </template>
  <Pagination :page="page" :total-pages="totalPages" @update:page="page = $event" />
</template>

<style scoped>
.filters {
  display: flex; gap: 0.75rem; margin-bottom: 1.5rem; flex-wrap: wrap;
  background: var(--color-surface); padding: 1rem 1.25rem; border-radius: var(--radius-md);
  border: 1px solid var(--color-border); box-shadow: var(--shadow-sm);
}
.filters input, .filters select { margin: 0; max-width: 220px; }
.btn-ghost { display: inline-flex; padding: 0.35rem 0.6rem; font-size: 0.8rem; font-weight: 600; border-radius: 7px; color: var(--color-primary); }
.btn-ghost:hover { background: var(--color-primary-light); }

.pay-pill { display: inline-block; padding: 0.25rem 0.6rem; border-radius: 999px; font-size: 0.74rem; font-weight: 700; white-space: nowrap; }
.pay-pill-paid { background: #dcfce7; color: #166534; }
.pay-pill-balance { background: #fef3c7; color: #92400e; }
.pay-pill-none { background: #f1f5f9; color: #64748b; }

.mobile-cards { display: none; }
.booking-card {
  display: flex; flex-direction: column; gap: 0.35rem; background: var(--color-surface);
  border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-sm);
  padding: 0.9rem 1rem; margin-bottom: 0.6rem; transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.booking-card:hover { border-color: var(--color-primary); box-shadow: var(--shadow-md); }
.booking-card-top { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
.booking-ref { font-weight: 700; font-size: 0.86rem; font-family: monospace; }
.booking-product { margin: 0; font-weight: 600; font-size: 0.92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.booking-meta { display: flex; justify-content: space-between; gap: 0.6rem; font-size: 0.8rem; color: var(--color-text-muted); }
.booking-guest { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; }
.booking-card .pay-pill { align-self: flex-start; margin-top: 0.15rem; }
.booking-created-at { margin: 0; font-size: 0.74rem; color: var(--color-text-faint); }

/* Safety net for whatever narrow-desktop width falls between "cards take over" and
   "the table actually has room" — scrolls just the table, not the whole page. */
.table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: var(--radius-md); }
.table-scroll table { min-width: 880px; }
.nowrap-cell { white-space: nowrap; }

/* Below this, a 7-column table (ref/product/date/name/status/payment/action) has no
   room to breathe — cells wrap into multi-line mush rather than just getting narrow.
   Cards read far better than a squeezed table at tablet widths, so the switchover
   point is well above the usual "mobile" breakpoint. The table-scroll wrapper above is
   just a safety net for whatever's left in between. */
@media (max-width: 1024px) {
  .desktop-table { display: none; }
  .mobile-cards { display: block; }
  .filters { padding: 0.85rem 1rem; gap: 0.6rem; }
  .filters input, .filters select { max-width: none; flex: 1 1 100%; }
}
</style>
