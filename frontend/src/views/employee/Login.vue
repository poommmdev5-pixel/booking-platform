<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import LanguageSwitcher from '../../components/LanguageSwitcher.vue';

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const error = ref('');
const submitting = ref(false);
const { employeeLogin } = useAuth();
const router = useRouter();

async function submit() {
  error.value = '';
  submitting.value = true;
  try {
    await employeeLogin(email.value, password.value);
    router.push({ name: 'employee-schedule' });
  } catch (err) {
    error.value = err.message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="employee-login-page">
    <div class="lang-switch-wrap"><LanguageSwitcher /></div>
    <form class="auth-card employee-card" @submit.prevent="submit">
      <div class="brand-mark">
        <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
      </div>
      <p class="eyebrow">{{ $t('employee.portalName') }}</p>
      <h1>{{ $t('employee.loginTitle') }}</h1>
      <p class="form-sub">{{ $t('employee.loginSub') }}</p>

      <label>{{ $t('booking.email') }}<input type="email" v-model="email" required autofocus autocomplete="username" /></label>
      <label>
        {{ $t('account.password') }}
        <div class="input-icon-wrap">
          <input :type="showPassword ? 'text' : 'password'" v-model="password" required autocomplete="current-password" />
          <button type="button" class="toggle-visibility" @click="showPassword = !showPassword" :aria-label="showPassword ? $t('common.hidePassword') : $t('common.showPassword')">
            <svg v-if="showPassword" viewBox="0 0 24 24"><path d="M12 6c-4.42 0-8.27 2.69-10 6.5 1.73 3.81 5.58 6.5 10 6.5s8.27-2.69 10-6.5c-1.73-3.81-5.58-6.5-10-6.5zm0 11c-2.49 0-4.5-2.01-4.5-4.5S9.51 8 12 8s4.5 2.01 4.5 4.5S14.49 17 12 17zm0-7.2c-1.49 0-2.7 1.21-2.7 2.7s1.21 2.7 2.7 2.7 2.7-1.21 2.7-2.7-1.21-2.7-2.7-2.7z"/></svg>
            <svg v-else viewBox="0 0 24 24"><path d="M2 4.27l2.28 2.28.46.46A11.8 11.8 0 0 0 2 12c1.73 3.81 5.58 6.5 10 6.5 1.55 0 3.03-.33 4.36-.93l.42.42L19.73 21 21 19.73 3.27 2zM12 16.5c-.35 0-.68-.05-1-.14l1.72-1.72c.25-.11.42-.36.42-.64 0-.4-.32-.72-.72-.72a.7.7 0 0 0-.62.42l-1.72 1.72A4.49 4.49 0 0 1 7.5 12c0-2.49 2.01-4.5 4.5-4.5.86 0 1.65.24 2.33.65l-1.2 1.2A2.7 2.7 0 0 0 9.3 12.7l-1.63 1.63A4.48 4.48 0 0 1 7.5 12c0-.13.01-.26.02-.39L5.9 9.98A9.9 9.9 0 0 0 4.12 12c1.24 2.7 4 4.5 7.06 4.5.59 0 1.16-.07 1.7-.2l1.06 1.06c-.59.15-1.2.24-1.84.24z"/><path d="M12 7.5c2.49 0 4.5 2.01 4.5 4.5 0 .59-.12 1.15-.32 1.67l1.47 1.47A9.9 9.9 0 0 0 19.88 12c-1.24-2.7-4-4.5-7.06-4.5-.86 0-1.68.15-2.44.42l1.24 1.24c.44-.11.9-.16 1.38-.16z"/></svg>
          </button>
        </div>
      </label>

      <p v-if="error" class="error">{{ error }}</p>
      <button class="btn" type="submit" :disabled="submitting">
        <span v-if="submitting" class="btn-spinner"></span>
        {{ submitting ? $t('common.loading') : $t('nav.login') }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.employee-login-page {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(160deg, #0a2e2b 0%, #0f4a44 45%, #128f80 100%);
  padding: 2rem 1.25rem; position: relative;
}
.lang-switch-wrap { position: absolute; top: 1.5rem; right: 1.5rem; }
.employee-card { max-width: 380px; }
.brand-mark {
  width: 46px; height: 46px; border-radius: 13px; margin: 0 auto 1rem;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, var(--color-primary), #4fb3a6); box-shadow: 0 10px 24px rgba(15, 122, 112, 0.35);
}
.brand-mark svg { width: 24px; height: 24px; fill: #fff; }
.eyebrow { text-align: center; margin: 0 0 0.3rem; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-muted); }
.employee-card h1 { text-align: center; margin: 0 0 0.4rem; font-size: 1.4rem; }
.form-sub { text-align: center; margin: 0 0 1.5rem; font-size: 0.86rem; color: var(--color-text-muted); }
.input-icon-wrap { position: relative; margin-top: 0.35rem; }
.input-icon-wrap input { margin: 0; padding-right: 2.6rem; }
.toggle-visibility {
  position: absolute; right: 0.6rem; top: 50%; transform: translateY(-50%); border: none; background: none;
  padding: 0.3rem; cursor: pointer; display: flex; color: var(--color-text-faint); border-radius: 6px;
}
.toggle-visibility:hover { background: var(--color-primary-light); color: var(--color-primary); }
.toggle-visibility svg { width: 17px; height: 17px; fill: currentColor; }
.btn-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.4); border-top-color: #fff; animation: emp-login-spin 0.7s linear infinite; }
@keyframes emp-login-spin { to { transform: rotate(360deg); } }
</style>
