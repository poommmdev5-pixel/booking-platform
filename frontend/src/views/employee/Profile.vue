<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { employeeSelfApi } from '../../api/employeeSelf';
import BackButton from '../../components/BackButton.vue';
import ImageManager from '../../components/ImageManager.vue';

const { t } = useI18n();

const TABS = [
  { id: 'profile', labelKey: 'employee.tabProfileInfo', iconClass: 'icon-profile' },
  { id: 'photos', labelKey: 'admin.images', iconClass: 'icon-photos' },
  { id: 'password', labelKey: 'employee.changePassword', iconClass: 'icon-password' },
];
const activeTab = ref('profile');
function selectTab(id, event) {
  activeTab.value = id;
  event.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

const code = ref('');
const name = ref('');
const position = ref('');
const phone = ref('');
const email = ref('');
const images = ref([]);
const profileError = ref('');
const savingProfile = ref(false);

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const passwordError = ref('');
const savingPassword = ref(false);

const saved = ref(false);
function flashSaved() {
  saved.value = true;
  setTimeout(() => (saved.value = false), 2200);
}

async function load() {
  const me = await employeeSelfApi.getMe();
  code.value = me.code;
  name.value = me.name;
  position.value = me.position;
  phone.value = me.phone;
  email.value = me.email;
  images.value = me.images || [];
}

async function uploadImage(file) {
  const img = await employeeSelfApi.uploadImage(file);
  images.value.push(img);
}

async function setCover(img) {
  await employeeSelfApi.setCoverImage(img.id);
  images.value = images.value.map((i) => ({ ...i, isCover: i.id === img.id }));
}

async function removeImage(img) {
  await employeeSelfApi.removeImage(img.id);
  images.value = images.value.filter((i) => i.id !== img.id);
}

async function saveProfile() {
  profileError.value = '';
  if (!name.value.trim()) {
    profileError.value = t('admin.nameRequired');
    return;
  }
  savingProfile.value = true;
  try {
    await employeeSelfApi.updateMe({ name: name.value, phone: phone.value, email: email.value });
    flashSaved();
  } catch (err) {
    profileError.value = err.message;
  } finally {
    savingProfile.value = false;
  }
}

async function savePassword() {
  passwordError.value = '';
  if (newPassword.value.length < 8) {
    passwordError.value = t('admin.passwordMinLength');
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = t('employee.passwordMismatch');
    return;
  }
  savingPassword.value = true;
  try {
    await employeeSelfApi.updateMe({ currentPassword: currentPassword.value, newPassword: newPassword.value });
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    flashSaved();
  } catch (err) {
    passwordError.value = err.message;
  } finally {
    savingPassword.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="settings-page">
    <BackButton :to="{ name: 'employee-schedule' }" />
    <div class="page-head">
      <div>
        <h1>{{ $t('employee.profileTitle') }}</h1>
        <p class="page-sub">{{ $t('employee.profileSub') }}</p>
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
            <svg v-if="tab.id === 'profile'" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            <svg v-else-if="tab.id === 'photos'" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
            <svg v-else viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
          </span>
          <span class="tab-label">{{ $t(tab.labelKey) }}</span>
        </button>
      </nav>

      <div class="settings-content">
        <section v-show="activeTab === 'profile'" class="settings-card">
          <div class="settings-card-head">
            <span class="settings-icon icon-profile">
              <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            </span>
            <div>
              <h2>{{ $t('employee.tabProfileInfo') }}</h2>
              <p class="settings-card-sub">{{ $t('employee.profileInfoSub') }}</p>
            </div>
          </div>

          <div class="field-grid">
            <label>{{ $t('admin.code') }}<input :value="code" disabled /></label>
            <label>{{ $t('admin.position') }}<input :value="position" disabled /></label>
            <label>{{ $t('admin.employeeName') }}<input v-model="name" required /></label>
            <label>{{ $t('admin.phone') }}<input v-model="phone" /></label>
            <label class="span-2">{{ $t('admin.email') }}<input type="email" v-model="email" required /></label>
          </div>

          <p v-if="profileError" class="error">{{ profileError }}</p>
          <div class="card-actions">
            <button class="btn" :disabled="savingProfile" @click="saveProfile">
              <span v-if="savingProfile" class="btn-spinner"></span>{{ savingProfile ? $t('admin.savingEllipsis') : $t('admin.save') }}
            </button>
          </div>
        </section>

        <section v-show="activeTab === 'photos'" class="settings-card">
          <div class="settings-card-head">
            <span class="settings-icon icon-photos">
              <svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
            </span>
            <div>
              <h2>{{ $t('admin.images') }}</h2>
              <p class="settings-card-sub">{{ $t('employee.photosSub') }}</p>
            </div>
          </div>

          <ImageManager :images="images" :max="5" :on-upload="uploadImage" :on-set-cover="setCover" :on-remove="removeImage" />
        </section>

        <section v-show="activeTab === 'password'" class="settings-card">
          <div class="settings-card-head">
            <span class="settings-icon icon-password">
              <svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
            </span>
            <div>
              <h2>{{ $t('employee.changePassword') }}</h2>
              <p class="settings-card-sub">{{ $t('employee.passwordSub') }}</p>
            </div>
          </div>

          <div class="field-grid">
            <label class="span-2">{{ $t('employee.currentPassword') }}<input type="password" v-model="currentPassword" autocomplete="current-password" /></label>
            <label>{{ $t('employee.newPassword') }}<input type="password" v-model="newPassword" minlength="8" autocomplete="new-password" /></label>
            <label>{{ $t('employee.confirmPassword') }}<input type="password" v-model="confirmPassword" minlength="8" autocomplete="new-password" /></label>
          </div>

          <p v-if="passwordError" class="error">{{ passwordError }}</p>
          <div class="card-actions">
            <button class="btn" :disabled="savingPassword" @click="savePassword">
              <span v-if="savingPassword" class="btn-spinner"></span>{{ savingPassword ? $t('admin.savingEllipsis') : $t('employee.updatePassword') }}
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
    position: static; width: 100%; flex-direction: row; overflow-x: auto; gap: 0.5rem;
    padding-bottom: 0.3rem; -webkit-overflow-scrolling: touch;
  }
  .tab-btn { width: auto; flex-shrink: 0; white-space: nowrap; }
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
.icon-profile { background: #eff6ff; color: #2563eb; }
.icon-profile svg { fill: #2563eb; }
.icon-photos { background: var(--color-primary-light); color: var(--color-primary); }
.icon-photos svg { fill: var(--color-primary); }
.icon-password { background: var(--color-warning-bg); color: var(--color-warning); }
.icon-password svg { fill: var(--color-warning); }
.settings-card-head h2 { margin: 0 0 0.2rem; font-size: 1.02rem; }
.settings-card-sub { margin: 0; font-size: 0.84rem; color: var(--color-text-muted); line-height: 1.5; }

.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem 1rem; }
.field-grid label { margin: 0; }
.field-grid label.span-2 { grid-column: 1 / -1; }
.field-grid input { margin: 0.35rem 0 0; max-width: none; }
@media (max-width: 520px) { .field-grid { grid-template-columns: 1fr; } .field-grid label.span-2 { grid-column: auto; } }

.card-actions { display: flex; justify-content: flex-end; margin-top: 1.4rem; }
.card-actions .btn { display: inline-flex; align-items: center; gap: 0.5rem; }
.btn-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.4); border-top-color: #fff; animation: profile-spin 0.7s linear infinite; }
@keyframes profile-spin { to { transform: rotate(360deg); } }
</style>
