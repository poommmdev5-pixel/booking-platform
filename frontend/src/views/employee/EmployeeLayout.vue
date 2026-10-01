<script setup>
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import LanguageSwitcher from '../../components/LanguageSwitcher.vue';

const { user, logout } = useAuth();
const router = useRouter();

async function onLogout() {
  await logout();
  router.push({ name: 'employee-login' });
}
</script>

<template>
  <div class="employee-shell">
    <header class="employee-header">
      <div class="header-inner">
        <div class="brand">
          <span class="brand-mark">
            <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
          </span>
          <span class="brand-text">{{ $t('employee.portalName') }}</span>
        </div>
        <div class="header-actions">
          <LanguageSwitcher />
          <button class="logout-btn" @click="onLogout">{{ $t('nav.logout') }}</button>
        </div>
      </div>
      <nav class="tabs">
        <router-link :to="{ name: 'employee-schedule' }" class="tab">
          <svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>
          {{ $t('employee.tabSchedule') }}
        </router-link>
        <router-link :to="{ name: 'employee-profile' }" class="tab">
          <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          {{ $t('employee.tabProfile') }}
        </router-link>
      </nav>
    </header>
    <main class="employee-main">
      <div class="employee-container"><router-view /></div>
    </main>
  </div>
</template>

<style scoped>
.employee-shell { min-height: 100vh; background: var(--color-bg); }
.employee-header {
  background: #111827; color: #fff; position: sticky; top: 0; z-index: 10;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.12);
}
.header-inner {
  max-width: 640px; margin: 0 auto; padding: 0.9rem 1.25rem;
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
}
.brand { display: flex; align-items: center; gap: 0.55rem; font-weight: 700; }
.brand-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
  background: linear-gradient(135deg, var(--color-primary, #0f7a70), #4fb3a6);
}
.brand-mark svg { width: 16px; height: 16px; fill: #fff; }
.brand-text { font-size: 0.92rem; white-space: nowrap; }
.header-actions { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }

/* Brand text can't shrink (nowrap) and header-actions won't either (flex-shrink: 0), so on
   a narrow phone the two together don't fit and the logout button gets clipped off-screen
   with nothing to wrap to. Let the row wrap and give header-actions its own full-width,
   right-aligned line instead of leaving it fighting the brand for space. */
@media (max-width: 420px) {
  .header-inner { flex-wrap: wrap; row-gap: 0.6rem; }
  .header-actions { width: 100%; justify-content: flex-end; }
}
.logout-btn {
  background: transparent; border: 1px solid #374151; color: #d1d5db;
  padding: 0.4rem 0.8rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.logout-btn:hover { background: #1f2937; border-color: #4b5563; }

.tabs {
  max-width: 640px; margin: 0 auto; padding: 0 1rem;
  display: flex; gap: 0.3rem; border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.tab {
  display: flex; align-items: center; gap: 0.45rem;
  padding: 0.75rem 0.9rem; color: #9ca3af; font-size: 0.86rem; font-weight: 600;
  border-bottom: 2px solid transparent; transition: color 0.12s ease, border-color 0.12s ease;
}
.tab svg { width: 16px; height: 16px; fill: currentColor; }
.tab:hover { color: #fff; }
.tab.router-link-active { color: #fff; border-bottom-color: var(--color-primary, #0f7a70); }

.employee-main { padding: 1.5rem 1.25rem 3rem; }
.employee-container { max-width: 640px; margin: 0 auto; }

/* Desktop gets real breathing room instead of a phone-width column stranded in the middle
   of the screen — Profile.vue's own .settings-page (900px) and Schedule's cards were
   already designed for more width than the 640px shell ever let them use. */
@media (min-width: 900px) {
  .header-inner, .tabs, .employee-container { max-width: 1080px; }
  .employee-main { padding: 2rem 2rem 3.5rem; }
}
</style>
