<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';

const name = ref('');
const email = ref('');
const phone = ref('');
const password = ref('');
const error = ref('');
const submitting = ref(false);
const { customerRegister } = useAuth();
const router = useRouter();

async function submit() {
  error.value = '';
  submitting.value = true;
  try {
    await customerRegister(name.value, email.value, phone.value, password.value);
    router.push({ name: 'my-bookings' });
  } catch (err) {
    error.value = err.message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="split-auth">
    <div class="split-panel">
      <p class="eyebrow split-eyebrow">Andaman Breeze Resort</p>
      <h1 class="page-heading split-title">{{ $t('home.hero') }}</h1>
      <p class="split-copy">{{ $t('home.heroSub') }}</p>
      <ul class="split-perks">
        <li><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>{{ $t('home.perkInstant') }}</li>
        <li><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>{{ $t('home.perkStaff') }}</li>
        <li><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>{{ $t('home.perkFlexible') }}</li>
      </ul>
    </div>
    <div class="split-form-wrap">
      <div class="split-form surface-panel">
        <h2 class="page-heading form-title">{{ $t('account.registerTitle') }}</h2>
        <p class="form-sub">{{ $t('account.registerSub') }}</p>
        <form @submit.prevent="submit">
          <label>{{ $t('booking.name') }}<input v-model="name" required /></label>
          <label>{{ $t('booking.email') }}<input type="email" v-model="email" required /></label>
          <label>{{ $t('booking.phone') }}<input v-model="phone" /></label>
          <label>{{ $t('account.password') }}<input type="password" v-model="password" minlength="8" required /></label>
          <p v-if="error" class="error">{{ error }}</p>
          <button class="btn btn-accent" type="submit" :disabled="submitting">{{ $t('account.registerTitle') }}</button>
        </form>
        <p class="switch">{{ $t('account.hasAccount') }} <router-link to="/account/login">{{ $t('nav.login') }}</router-link></p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.split-auth {
  display: grid; grid-template-columns: 1.1fr 1fr; gap: 3rem; align-items: center;
  min-height: calc(100vh - 220px);
}
@media (max-width: 860px) { .split-auth { grid-template-columns: 1fr; gap: 2rem; min-height: auto; } }

.split-panel { padding: 1rem 1rem 1rem 0; }
@media (max-width: 860px) { .split-panel { display: none; } }
.split-eyebrow { color: var(--color-accent-hover); }
.split-title { font-size: clamp(1.8rem, 3vw, 2.4rem); margin: 0 0 1rem; }
.split-copy { color: var(--color-text-muted); font-size: 1rem; line-height: 1.75; max-width: 30rem; margin: 0 0 2rem; }
.split-perks { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.9rem; }
.split-perks li { display: flex; align-items: center; gap: 0.65rem; font-weight: 600; font-size: 0.92rem; color: var(--color-primary-dark); }
.split-perks svg {
  width: 22px; height: 22px; padding: 4px; border-radius: 999px; flex-shrink: 0;
  background: var(--color-primary-light); fill: var(--color-primary);
}

.split-form-wrap { display: flex; justify-content: center; }
.split-form { width: 100%; max-width: 380px; padding: 2.25rem; }
.form-title { font-size: 1.4rem; margin: 0 0 0.4rem; text-align: center; }
.form-sub { text-align: center; color: var(--color-text-muted); font-size: 0.86rem; margin: 0 0 1.5rem; line-height: 1.6; }
.split-form input { max-width: none; }
.split-form .btn { width: 100%; margin-top: 0.5rem; justify-content: center; }
.switch { text-align: center; margin-top: 1.5rem; font-size: 0.85rem; color: var(--color-text-muted); }
</style>
