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
const { adminLogin } = useAuth();
const router = useRouter();

async function submit() {
  error.value = '';
  submitting.value = true;
  try {
    await adminLogin(email.value, password.value);
    router.push({ name: 'admin-dashboard' });
  } catch (err) {
    error.value = err.message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="admin-login admin-shell">
    <div class="side-panel">
      <div class="side-glow"></div>
      <div class="side-grid"></div>
      <div class="side-content">
        <div class="side-brand">
          <span class="side-brand-mark">
            <svg viewBox="0 0 24 24"><path d="M12 2l8 4v6c0 5.25-3.4 9.74-8 11-4.6-1.26-8-5.75-8-11V6l8-4z"/></svg>
          </span>
          <span class="side-brand-text">{{ $t('admin.brandName') }}</span>
        </div>
        <h1 class="side-title">{{ $t('admin.loginHeroTitle') }}</h1>
        <p class="side-sub">{{ $t('admin.loginHeroSub') }}</p>
        <ul class="side-points">
          <li>
            <span class="side-point-icon"><svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></span>
            {{ $t('admin.loginPoint1') }}
          </li>
          <li>
            <span class="side-point-icon"><svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></span>
            {{ $t('admin.loginPoint2') }}
          </li>
          <li>
            <span class="side-point-icon"><svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></span>
            {{ $t('admin.loginPoint3') }}
          </li>
        </ul>
      </div>
    </div>

    <div class="form-panel">
      <div class="lang-switch-wrap"><LanguageSwitcher /></div>
      <form class="login-card" @submit.prevent="submit">
        <div class="form-brand-mark">
          <svg viewBox="0 0 24 24"><path d="M12 2l8 4v6c0 5.25-3.4 9.74-8 11-4.6-1.26-8-5.75-8-11V6l8-4z"/></svg>
        </div>
        <p class="form-eyebrow">{{ $t('admin.brandName') }}</p>
        <h1>{{ $t('admin.login') }}</h1>
        <p class="form-sub">{{ $t('admin.loginSub') }}</p>

        <label>
          {{ $t('booking.email') }}
          <div class="input-icon-wrap">
            <svg class="field-icon" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
            <input type="email" v-model="email" required autofocus autocomplete="username" />
          </div>
        </label>
        <label>
          {{ $t('account.password') }}
          <div class="input-icon-wrap">
            <svg class="field-icon" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
            <input :type="showPassword ? 'text' : 'password'" v-model="password" required autocomplete="current-password" />
            <button type="button" class="toggle-visibility" @click="showPassword = !showPassword" :aria-label="showPassword ? $t('common.hidePassword') : $t('common.showPassword')">
              <svg v-if="showPassword" viewBox="0 0 24 24"><path d="M12 6c-4.42 0-8.27 2.69-10 6.5 1.73 3.81 5.58 6.5 10 6.5s8.27-2.69 10-6.5c-1.73-3.81-5.58-6.5-10-6.5zm0 11c-2.49 0-4.5-2.01-4.5-4.5S9.51 8 12 8s4.5 2.01 4.5 4.5S14.49 17 12 17zm0-7.2c-1.49 0-2.7 1.21-2.7 2.7s1.21 2.7 2.7 2.7 2.7-1.21 2.7-2.7-1.21-2.7-2.7-2.7z"/></svg>
              <svg v-else viewBox="0 0 24 24"><path d="M12 6c1.15 0 2.26.16 3.32.46l1.65-1.65 1.41 1.41-16 16-1.41-1.41 2.24-2.24C1.61 17.06.35 15.28-.01 13.5c1.61-3.81 5.34-6.5 9.68-6.5.15 0 .3.01.44.02L12 6zm0 1.8c-2.49 0-4.5 2.01-4.5 4.5 0 .43.07.85.18 1.24l1.6-1.6a2.7 2.7 0 012.32-2.32l1.6-1.6a4.42 4.42 0 00-1.2-.22zm7.68 1.7l-1.44 1.44c.18.6.28 1.24.28 1.9 0 2.49-2.01 4.5-4.5 4.5-.66 0-1.3-.1-1.9-.28l-1.6 1.6c1.06.3 2.17.46 3.32.46 4.34 0 8.07-2.69 9.68-6.5-.5-1.18-1.2-2.24-2.06-3.12z" transform="translate(2)"/></svg>
            </button>
          </div>
        </label>

        <p v-if="error" class="error">{{ error }}</p>
        <button class="btn" type="submit" :disabled="submitting">
          <span v-if="submitting" class="btn-spinner"></span>
          {{ submitting ? $t('common.loading') : $t('nav.login') }}
        </button>
        <p class="form-footnote">{{ $t('admin.loginFootnote') }}</p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.admin-login { min-height: 100vh; display: flex; background: #f8fafc; }

/* ---- Left brand/marketing panel (desktop only) ---- */
.side-panel {
  position: relative; flex: 1 1 46%; max-width: 620px; overflow: hidden;
  background: linear-gradient(160deg, #0a2e2b 0%, #0f4a44 45%, #128f80 100%);
  display: flex; align-items: center; padding: 4rem 4vw;
}
.side-glow {
  position: absolute; width: 640px; height: 640px; border-radius: 50%;
  background: radial-gradient(circle, rgba(214, 138, 60, 0.45), transparent 65%);
  top: -220px; right: -220px; filter: blur(10px); pointer-events: none;
}
.side-grid {
  position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
  background-image: linear-gradient(rgba(255, 255, 255, 0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.055) 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: radial-gradient(ellipse 80% 70% at 30% 40%, #000 40%, transparent 100%);
}
.side-content { position: relative; z-index: 1; max-width: 460px; }
.side-brand { display: flex; align-items: center; gap: 0.7rem; margin-bottom: 3rem; }
.side-brand-mark {
  width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
  background: rgba(255, 255, 255, 0.14); display: flex; align-items: center; justify-content: center;
}
.side-brand-mark svg { width: 20px; height: 20px; fill: #fff; }
.side-brand-text { color: #fff; font-weight: 700; font-size: 1.02rem; letter-spacing: 0.01em; }
.side-title { color: #fff; font-size: clamp(1.7rem, 2.6vw, 2.3rem); line-height: 1.3; margin: 0 0 1rem; font-weight: 800; }
.side-sub { color: rgba(255, 255, 255, 0.72); font-size: 0.98rem; line-height: 1.65; margin: 0 0 2.25rem; }
.side-points { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.9rem; }
.side-points li { display: flex; align-items: center; gap: 0.65rem; color: rgba(255, 255, 255, 0.88); font-size: 0.9rem; font-weight: 500; }
.side-point-icon {
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; background: rgba(214, 138, 60, 0.35);
  display: flex; align-items: center; justify-content: center;
}
.side-point-icon svg { width: 13px; height: 13px; fill: #f4c78a; }
@media (max-width: 900px) { .side-panel { display: none; } }

/* ---- Right form panel ---- */
.form-panel { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem 1.25rem; position: relative; }
.lang-switch-wrap { position: absolute; top: 1.5rem; right: 1.5rem; }
.login-card {
  width: 100%; max-width: 380px; background: #fff; border-radius: var(--radius-lg);
  border: 1px solid var(--color-border); box-shadow: var(--shadow-lg); padding: 2.5rem 2.25rem;
}
.form-brand-mark {
  width: 46px; height: 46px; border-radius: 13px; margin: 0 auto 1rem;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, var(--color-primary), #4fb3a6); box-shadow: 0 10px 24px rgba(15, 122, 112, 0.35);
}
.form-brand-mark svg { width: 24px; height: 24px; fill: #fff; }
.form-eyebrow { text-align: center; margin: 0 0 0.3rem; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-muted); }
.login-card h1 { text-align: center; margin: 0 0 0.4rem; font-size: 1.45rem; }
.form-sub { text-align: center; margin: 0 0 1.75rem; font-size: 0.86rem; color: var(--color-text-muted); }

.login-card label { display: block; font-weight: 600; font-size: 0.84rem; color: var(--color-text-muted); margin-bottom: 1rem; }
.input-icon-wrap { position: relative; margin-top: 0.35rem; }
.field-icon { position: absolute; left: 0.85rem; top: 50%; transform: translateY(-50%); width: 17px; height: 17px; fill: var(--color-text-faint); pointer-events: none; }
.input-icon-wrap input { padding-left: 2.6rem; margin: 0; }
.input-icon-wrap input[type='password'], .input-icon-wrap input[type='text'] { padding-right: 2.6rem; }
.toggle-visibility {
  position: absolute; right: 0.6rem; top: 50%; transform: translateY(-50%); border: none; background: none;
  padding: 0.3rem; cursor: pointer; display: flex; color: var(--color-text-faint); border-radius: 6px;
}
.toggle-visibility:hover { background: var(--color-primary-light); color: var(--color-primary); }
.toggle-visibility svg { width: 17px; height: 17px; fill: currentColor; }

.login-card .btn { width: 100%; margin-top: 0.35rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
.btn-spinner { width: 15px; height: 15px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.4); border-top-color: #fff; animation: btn-spin 0.7s linear infinite; }
@keyframes btn-spin { to { transform: rotate(360deg); } }
.form-footnote { text-align: center; margin: 1.25rem 0 0; font-size: 0.76rem; color: var(--color-text-faint); }
.error { margin: -0.4rem 0 0.9rem; }
</style>
