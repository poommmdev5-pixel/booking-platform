<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { employeesApi } from '../../api/employees';
import ImageManager from '../../components/ImageManager.vue';
import BackButton from '../../components/BackButton.vue';

const props = defineProps({ id: { type: String, default: null } });
const router = useRouter();
const { t } = useI18n();

const isEdit = ref(false);
const employeeId = ref(null);

const code = ref('');
const name = ref('');
const position = ref('');
const phone = ref('');
const email = ref('');
const images = ref([]);
const error = ref('');

const hasLogin = ref(false);
const credentialsModalOpen = ref(false);
const newPassword = ref('');
const credentialsError = ref('');
const savingCredentials = ref(false);

async function loadEmployee() {
  const e = await employeesApi.getAdmin(employeeId.value);
  code.value = e.code;
  name.value = e.name;
  position.value = e.position || '';
  phone.value = e.phone || '';
  email.value = e.email || '';
  images.value = e.images || [];
  hasLogin.value = !!e.hasLogin;
}

onMounted(async () => {
  if (props.id) {
    isEdit.value = true;
    employeeId.value = Number(props.id);
    await loadEmployee();
  }
});

function openCredentialsModal() {
  newPassword.value = '';
  credentialsError.value = '';
  credentialsModalOpen.value = true;
}

async function saveCredentials() {
  credentialsError.value = '';
  if (!email.value.trim()) {
    credentialsError.value = t('admin.employeeLoginNeedsEmail');
    return;
  }
  if (newPassword.value.length < 8) {
    credentialsError.value = t('admin.passwordMinLength');
    return;
  }
  savingCredentials.value = true;
  try {
    await employeesApi.setCredentials(employeeId.value, newPassword.value);
    hasLogin.value = true;
    credentialsModalOpen.value = false;
  } catch (err) {
    credentialsError.value = err.message;
  } finally {
    savingCredentials.value = false;
  }
}

async function revokeCredentials() {
  if (!confirm(t('admin.revokeLoginConfirm'))) return;
  await employeesApi.revokeCredentials(employeeId.value);
  hasLogin.value = false;
}

async function save() {
  error.value = '';
  if (!name.value.trim()) {
    error.value = t('admin.nameRequired');
    return;
  }
  const payload = { name: name.value, position: position.value || undefined, phone: phone.value || undefined, email: email.value || undefined };
  try {
    if (isEdit.value) {
      const employee = await employeesApi.update(employeeId.value, payload);
      images.value = employee.images || [];
    } else {
      // Set local state directly instead of relying on the route change to remount this
      // component (admin-employee-new -> admin-employee-edit reuse the same component
      // instance, so onMounted would never re-run and the Images section would stay hidden).
      const employee = await employeesApi.create(payload);
      isEdit.value = true;
      employeeId.value = employee.id;
      code.value = employee.code;
      images.value = employee.images || [];
      router.replace({ name: 'admin-employee-edit', params: { id: employee.id } });
    }
  } catch (err) {
    error.value = err.message;
  }
}

async function uploadImage(file) {
  const img = await employeesApi.uploadImage(employeeId.value, file);
  images.value.push(img);
}

async function setCover(img) {
  await employeesApi.setCoverImage(employeeId.value, img.id);
  images.value = images.value.map((i) => ({ ...i, isCover: i.id === img.id }));
}

async function removeImage(img) {
  await employeesApi.removeImage(employeeId.value, img.id);
  images.value = images.value.filter((i) => i.id !== img.id);
}
</script>

<template>
  <BackButton :to="{ name: 'admin-employees' }" />
  <h1>{{ $t(isEdit ? 'admin.editEmployee' : 'admin.addEmployee') }}</h1>
  <div class="card form-card">
    <label v-if="isEdit">{{ $t('admin.code') }}<input :value="code" disabled /></label>
    <label>{{ $t('admin.employeeName') }}<input v-model="name" required /></label>
    <label>{{ $t('admin.position') }}<input v-model="position" :placeholder="$t('admin.positionPlaceholder')" /></label>
    <label>{{ $t('admin.phone') }}<input v-model="phone" /></label>
    <label>{{ $t('admin.email') }}<input type="email" v-model="email" /></label>

    <p v-if="error" class="error">{{ error }}</p>
    <div class="save-bar">
      <button class="btn" @click="save">{{ $t('admin.save') }}</button>
    </div>
  </div>

  <h2>{{ $t('admin.images') }}</h2>
  <div class="card">
    <ImageManager v-if="isEdit && employeeId" :images="images" :max="5" :on-upload="uploadImage" :on-set-cover="setCover" :on-remove="removeImage" />
    <p v-else class="save-first-hint">{{ $t('admin.saveFirstForImages') }}</p>
  </div>

  <template v-if="isEdit">
    <h2>{{ $t('admin.employeeLoginAccess') }}</h2>
    <div class="card login-access-card">
      <div class="login-access-row">
        <div>
          <p class="login-access-status" :class="hasLogin ? 'is-on' : 'is-off'">
            <span class="status-dot"></span>{{ hasLogin ? $t('admin.loginEnabled') : $t('admin.loginDisabled') }}
          </p>
          <p class="login-access-hint">{{ $t('admin.employeeLoginHint') }}</p>
        </div>
        <div class="login-access-actions">
          <button class="btn btn-secondary btn-sm" @click="openCredentialsModal">
            {{ hasLogin ? $t('admin.resetPassword') : $t('admin.createLogin') }}
          </button>
          <button v-if="hasLogin" class="btn btn-danger-outline btn-sm" @click="revokeCredentials">{{ $t('admin.revokeLogin') }}</button>
        </div>
      </div>
    </div>
  </template>

  <div v-if="credentialsModalOpen" class="modal-backdrop" @click.self="credentialsModalOpen = false">
    <div class="modal-card">
      <h2>{{ hasLogin ? $t('admin.resetPassword') : $t('admin.createLogin') }}</h2>
      <p class="modal-sub">{{ $t('admin.employeeLoginModalSub', { email }) }}</p>
      <form class="add-form" @submit.prevent="saveCredentials">
        <label>{{ $t('account.password') }}<input type="password" v-model="newPassword" minlength="8" required autofocus /></label>
        <p v-if="credentialsError" class="error">{{ credentialsError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="credentialsModalOpen = false">{{ $t('common.cancel') }}</button>
          <button class="btn" type="submit" :disabled="savingCredentials">
            <span v-if="savingCredentials" class="btn-spinner"></span>{{ savingCredentials ? $t('admin.savingEllipsis') : $t('admin.save') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.form-card { max-width: 420px; }
.form-card input { max-width: none; }
.save-first-hint { font-size: 0.85rem; color: var(--color-text-muted); margin: 0; }
.save-bar { display: flex; justify-content: flex-end; margin-top: 1.25rem; }

.login-access-card { max-width: 560px; }
.login-access-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.login-access-status { display: flex; align-items: center; gap: 0.45rem; margin: 0 0 0.3rem; font-weight: 700; font-size: 0.9rem; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; }
.login-access-status.is-on { color: var(--color-success, #166534); }
.login-access-status.is-on .status-dot { background: var(--color-success, #16a34a); }
.login-access-status.is-off { color: var(--color-text-muted); }
.login-access-status.is-off .status-dot { background: #94a3b8; }
.login-access-hint { margin: 0; font-size: 0.82rem; color: var(--color-text-muted); max-width: 36rem; }
.login-access-actions { display: flex; gap: 0.6rem; flex-shrink: 0; }
.btn-danger-outline {
  background: transparent; border: 1px solid #fecaca; color: #dc2626;
}
.btn-danger-outline:hover { background: #fef2f2; }

.modal-backdrop {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1.25rem; overflow-y: auto;
}
.modal-card { width: 100%; max-width: 400px; background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: 1.75rem; }
.modal-card h2 { margin: 0 0 0.4rem; font-size: 1.1rem; }
.modal-sub { margin: 0 0 1.1rem; font-size: 0.83rem; color: var(--color-text-muted); word-break: break-all; }
.add-form { display: flex; flex-direction: column; gap: 0.95rem; }
.add-form label { margin: 0; font-weight: 600; font-size: 0.85rem; }
.add-form input { margin: 0.35rem 0 0; max-width: none; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 0.4rem; }
.btn-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.4); border-top-color: #fff; animation: emp-cred-spin 0.7s linear infinite; display: inline-block; margin-right: 0.4rem; }
@keyframes emp-cred-spin { to { transform: rotate(360deg); } }
</style>
