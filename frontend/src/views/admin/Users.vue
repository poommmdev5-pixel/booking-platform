<script setup>
import { onMounted, ref } from 'vue';
import { usersApi } from '../../api/users';
import { usePagination } from '../../composables/usePagination';
import Pagination from '../../components/Pagination.vue';

const users = ref([]);
const loading = ref(true);
const { page, totalPages, pageItems: pageUsers } = usePagination(users, 8);
const newAdmin = ref({ name: '', email: '', password: '', role: 'ADMIN' });
const error = ref('');
const creating = ref(false);
const addModalOpen = ref(false);
const togglingId = ref(null);

async function load() {
  loading.value = true;
  try {
    users.value = await usersApi.list();
  } finally {
    loading.value = false;
  }
}

async function toggleActive(u) {
  togglingId.value = u.id;
  try {
    await usersApi.update(u.id, { isActive: !u.isActive });
    await load();
  } finally {
    togglingId.value = null;
  }
}

function openAddModal() {
  newAdmin.value = { name: '', email: '', password: '', role: 'ADMIN' };
  error.value = '';
  addModalOpen.value = true;
}

async function create() {
  error.value = '';
  creating.value = true;
  try {
    await usersApi.create(newAdmin.value);
    addModalOpen.value = false;
    await load();
  } catch (err) {
    error.value = err.message;
  } finally {
    creating.value = false;
  }
}

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

onMounted(load);
</script>

<template>
  <div class="users-page">
    <div class="page-head">
      <div>
        <h1>{{ $t('admin.users') }}</h1>
        <p class="page-sub">{{ $t('admin.usersSub') }}</p>
      </div>
      <button class="btn" @click="openAddModal">
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        {{ $t('admin.addAdmin') }}
      </button>
    </div>

    <div v-if="loading" class="empty-state">{{ $t('common.loading') }}</div>
    <div v-else-if="users.length === 0" class="empty-state">{{ $t('common.noResults') }}</div>
    <div v-else class="user-list">
      <div v-for="u in pageUsers" :key="u.id" class="user-card" :class="{ inactive: !u.isActive }">
        <span class="user-avatar" :class="u.role === 'SUPER_ADMIN' ? 'avatar-super' : 'avatar-admin'">{{ initials(u.name) }}</span>
        <div class="user-main">
          <p class="user-name">{{ u.name }}</p>
          <p class="user-email">{{ u.email }}</p>
        </div>
        <div class="user-meta">
          <span class="role-pill" :class="u.role === 'SUPER_ADMIN' ? 'role-super' : 'role-admin'">{{ u.role }}</span>
          <span class="status-pill" :class="u.isActive ? 'status-active' : 'status-inactive'">
            <span class="status-dot"></span>{{ u.isActive ? $t('common.yes') : $t('common.no') }}
          </span>
          <button
            class="btn btn-secondary btn-sm toggle-btn"
            :disabled="togglingId === u.id"
            @click="toggleActive(u)"
          >
            {{ u.isActive ? $t('admin.disableLabel') : $t('admin.enableLabel') }}
          </button>
        </div>
      </div>
    </div>
    <Pagination :page="page" :total-pages="totalPages" @update:page="page = $event" />

    <div v-if="addModalOpen" class="modal-backdrop" @click.self="addModalOpen = false">
      <div class="modal-card">
        <h2>{{ $t('admin.addAdmin') }}</h2>
        <form class="add-form" @submit.prevent="create">
          <label>{{ $t('admin.name') }}<input v-model="newAdmin.name" required /></label>
          <label>{{ $t('admin.email') }}<input type="email" v-model="newAdmin.email" required /></label>
          <label>{{ $t('account.password') }}<input type="password" v-model="newAdmin.password" minlength="8" required /></label>
          <label>
            {{ $t('admin.roleLabel') }}
            <select v-model="newAdmin.role">
              <option value="ADMIN">ADMIN</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
            </select>
          </label>
          <p v-if="error" class="error">{{ error }}</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="addModalOpen = false">{{ $t('common.cancel') }}</button>
            <button class="btn" type="submit" :disabled="creating">
              <span v-if="creating" class="btn-spinner"></span>{{ creating ? $t('admin.savingEllipsis') : $t('admin.save') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.75rem; }
.page-head h1 { margin: 0 0 0.3rem; }
.page-sub { margin: 0; font-size: 0.88rem; color: var(--color-text-muted); }
.page-head .btn { display: inline-flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
.page-head .btn svg { width: 17px; height: 17px; fill: currentColor; }

.user-list { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.25rem; }
.user-card {
  display: flex; align-items: center; gap: 1rem;
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm); padding: 0.9rem 1.15rem;
}
.user-card.inactive { opacity: 0.65; }

.user-avatar {
  flex-shrink: 0; width: 42px; height: 42px; border-radius: 999px;
  display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1rem;
}
.avatar-admin { background: var(--color-primary-light); color: var(--color-primary-dark); }
.avatar-super { background: #ede9fe; color: #6d28d9; }

.user-main { flex: 1; min-width: 0; }
.user-meta { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }
.user-name { margin: 0 0 0.15rem; font-weight: 700; font-size: 0.92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.user-email { margin: 0; font-size: 0.8rem; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.role-pill {
  flex-shrink: 0; padding: 0.3rem 0.7rem; border-radius: 999px; font-size: 0.72rem; font-weight: 800;
  letter-spacing: 0.02em; white-space: nowrap;
}
.role-admin { background: #e0f2fe; color: #0369a1; }
.role-super { background: #ede9fe; color: #6d28d9; }

.status-pill {
  flex-shrink: 0; display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.3rem 0.7rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; white-space: nowrap;
}
.status-dot { width: 6px; height: 6px; border-radius: 50%; }
.status-active { background: var(--color-success-bg, #dcfce7); color: var(--color-success, #166534); }
.status-active .status-dot { background: var(--color-success, #16a34a); }
.status-inactive { background: #f1f5f9; color: #64748b; }
.status-inactive .status-dot { background: #94a3b8; }

.toggle-btn { flex-shrink: 0; }

.empty-state { padding: 3rem 1rem; text-align: center; color: var(--color-text-muted); }

.modal-backdrop {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1.25rem; overflow-y: auto;
}
.modal-card { width: 100%; max-width: 400px; background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: 1.75rem; }
.modal-card h2 { margin: 0 0 1.1rem; font-size: 1.1rem; }
.add-form { display: flex; flex-direction: column; gap: 0.95rem; }
.add-form label { margin: 0; font-weight: 600; font-size: 0.85rem; }
.add-form input, .add-form select { margin: 0.35rem 0 0; max-width: none; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 0.4rem; }
.btn-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.4); border-top-color: #fff; animation: users-spin 0.7s linear infinite; display: inline-block; margin-right: 0.4rem; }
@keyframes users-spin { to { transform: rotate(360deg); } }

@media (max-width: 560px) {
  .user-card { flex-wrap: wrap; row-gap: 0.75rem; }
  .user-meta { flex-basis: 100%; justify-content: flex-end; flex-wrap: wrap; }
  .page-head { flex-wrap: wrap; }
  .page-head .btn { width: 100%; justify-content: center; }
}
</style>
