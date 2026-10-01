<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { bookingsApi } from '../../api/bookings';
import LanguageSwitcher from '../../components/LanguageSwitcher.vue';

const { user, logout } = useAuth();
const router = useRouter();
const route = useRoute();

const mobileMenuOpen = ref(false);
// Route changes close the drawer (covers both nav-link clicks and back/forward); body
// scroll is locked while it's open since it's teleported on top of the page, not pushing it.
watch(() => route.fullPath, () => { mobileMenuOpen.value = false; });
watch(mobileMenuOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : '';
});
onUnmounted(() => { document.body.style.overflow = ''; });

// A lightweight count so admin notices new self-service requests without having to click
// into the page — refreshed on mount and again whenever they land back on this layout
// (e.g. after resolving a request and the router re-renders the shell).
const pendingRequestCount = ref(0);
async function refreshPendingCount() {
  try {
    pendingRequestCount.value = (await bookingsApi.listChangeRequests('pending')).length;
  } catch {
    /* non-critical — badge just stays at its last known value */
  }
}
onMounted(refreshPendingCount);
router.afterEach(() => refreshPendingCount());

// "Management" groups the catalog/configuration pages (edited occasionally) apart from
// the daily-use pages (Dashboard, Bookings) that stay at the top level for quick access.
const MANAGEMENT_PATHS = ['/admin/products', '/admin/categories', '/admin/extras', '/admin/employees'];
const isManagementRoute = () => MANAGEMENT_PATHS.some((p) => route.path.startsWith(p));
const managementOpen = ref(isManagementRoute());

function toggleManagement() {
  managementOpen.value = !managementOpen.value;
}

async function onLogout() {
  await logout();
  router.push({ name: 'admin-login' });
}
</script>

<template>
  <div class="shell admin-shell">
    <Transition name="drawer-backdrop">
      <div v-if="mobileMenuOpen" class="drawer-backdrop" @click="mobileMenuOpen = false"></div>
    </Transition>
    <aside :class="{ 'mobile-open': mobileMenuOpen }">
      <div class="brand">
        <span class="brand-mark">B</span>
        <span>{{ $t('admin.sidebarBrand') }}</span>
        <button type="button" class="drawer-close" aria-label="Close menu" @click="mobileMenuOpen = false">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <nav>
        <router-link to="/admin/dashboard">
          <svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
          {{ $t('admin.dashboard') }}
        </router-link>
        <router-link to="/admin/bookings">
          <svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>
          {{ $t('admin.bookings') }}
        </router-link>
        <router-link to="/admin/booking-requests" class="nav-link-with-badge">
          <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
          {{ $t('admin.bookingRequests') }}
          <span v-if="pendingRequestCount > 0" class="nav-badge">{{ pendingRequestCount }}</span>
        </router-link>

        <button type="button" class="nav-group-toggle" :class="{ active: isManagementRoute() }" @click="toggleManagement">
          <svg viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
          <span>{{ $t('admin.management') }}</span>
          <svg class="chevron" :class="{ open: managementOpen }" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
        </button>
        <div class="nav-group" v-show="managementOpen">
          <router-link to="/admin/products">
            <svg viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4v10l8 4 8-4V7zm-8-1.8L17.2 8 12 10.8 6.8 8 12 5.2zM5 9.6l6 3v6.8l-6-3V9.6zm8 9.8v-6.8l6-3v6.8l-6 3z"/></svg>
            {{ $t('admin.products') }}
          </router-link>
          <router-link to="/admin/categories">
            <svg viewBox="0 0 24 24"><path d="M4 4h6v6H4V4zm0 10h6v6H4v-6zM14 4h6v6h-6V4zm0 10h6v6h-6v-6z"/></svg>
            {{ $t('admin.categories') }}
          </router-link>
          <router-link to="/admin/extras">
            <svg viewBox="0 0 24 24"><path d="M20 12l-8 8-8-8 8-8 8 8zm-8-4.5L7.5 12 12 16.5 16.5 12 12 7.5z"/></svg>
            {{ $t('admin.extras') }}
          </router-link>
          <router-link to="/admin/employees">
            <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            {{ $t('admin.employees') }}
          </router-link>
        </div>

        <router-link to="/admin/settings">
          <svg viewBox="0 0 24 24"><path d="M19.14 12.94a7.14 7.14 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.3 7.3 0 00-1.63-.94l-.36-2.54a.5.5 0 00-.5-.42h-3.84a.5.5 0 00-.5.42l-.36 2.54c-.59.24-1.14.56-1.63.94l-2.39-.96a.5.5 0 00-.6.22L2.7 8.84a.5.5 0 00.12.64l2.03 1.58a7.14 7.14 0 000 1.88l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.14.24.42.33.6.22l2.39-.96c.49.38 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.14-.56 1.63-.94l2.39.96c.24.1.47 0 .6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z"/></svg>
          {{ $t('admin.settings') }}
        </router-link>
        <router-link v-if="user?.role === 'SUPER_ADMIN'" to="/admin/users">
          <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
          {{ $t('admin.users') }}
        </router-link>
      </nav>
      <div class="user-chip">
        <span class="avatar">{{ (user?.email || '?').charAt(0).toUpperCase() }}</span>
        <span class="email">{{ user?.email }}</span>
      </div>
      <button class="logout-btn" @click="onLogout">{{ $t('nav.logout') }}</button>
    </aside>
    <div class="content">
      <div class="topbar">
        <button type="button" class="menu-toggle" aria-label="Menu" @click="mobileMenuOpen = true">
          <svg viewBox="0 0 24 24"><path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z"/></svg>
        </button>
        <span class="topbar-brand">{{ $t('admin.sidebarBrand') }}</span>
        <LanguageSwitcher />
      </div>
      <div class="container"><router-view /></div>
    </div>
  </div>
</template>

<style scoped>
.shell { display: flex; min-height: 100vh; }
aside {
  width: 232px;
  background: #1c160c;
  color: #fff;
  display: flex;
  flex-direction: column;
  padding: 1.25rem 1rem;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  height: 100vh;
}
.brand { display: flex; align-items: center; gap: 0.6rem; font-weight: 700; margin-bottom: 1.75rem; padding: 0 0.4rem; }
.brand > span:nth-child(2) { flex: 1; }
.drawer-close {
  display: none; flex-shrink: 0; width: 32px; height: 32px; border-radius: 999px; border: none;
  background: rgba(255, 255, 255, 0.08); align-items: center; justify-content: center; cursor: pointer;
  transition: background 0.15s ease;
}
.drawer-close svg { width: 16px; height: 16px; fill: #fff; }
.drawer-close:hover { background: rgba(255, 255, 255, 0.16); }
.brand-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 9px;
  background: linear-gradient(135deg, var(--color-accent, #c7a04a), var(--color-primary, #9c7a2e));
  font-weight: 800; font-size: 0.95rem;
}
nav { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; }
nav a {
  display: flex; align-items: center; gap: 0.65rem;
  color: #b0a68c; padding: 0.55rem 0.75rem; border-radius: 8px;
  font-size: 0.875rem; font-weight: 500;
  transition: background 0.12s ease, color 0.12s ease;
}
nav a svg { width: 18px; height: 18px; fill: currentColor; flex-shrink: 0; }
nav a:hover { background: #2b2316; color: #fff; }
nav a.router-link-active { background: var(--color-primary, #9c7a2e); color: #fff; }
.nav-link-with-badge { position: relative; }
.nav-badge {
  margin-left: auto; flex-shrink: 0; min-width: 19px; height: 19px; padding: 0 5px; border-radius: 999px;
  background: #dc2626; color: #fff; font-size: 0.7rem; font-weight: 800; display: flex; align-items: center; justify-content: center;
}
.nav-group-toggle {
  display: flex; align-items: center; gap: 0.65rem; width: 100%;
  background: transparent; border: none; cursor: pointer;
  color: #b0a68c; padding: 0.55rem 0.75rem; border-radius: 8px;
  font-size: 0.875rem; font-weight: 500; font-family: inherit;
  transition: background 0.12s ease, color 0.12s ease;
}
.nav-group-toggle svg:first-child { width: 18px; height: 18px; fill: currentColor; flex-shrink: 0; }
.nav-group-toggle span { flex: 1; text-align: left; }
.nav-group-toggle:hover { background: #2b2316; color: #fff; }
.nav-group-toggle.active { color: #fff; }
.chevron { width: 16px; height: 16px; fill: currentColor; flex-shrink: 0; transition: transform 0.15s ease; }
.chevron.open { transform: rotate(180deg); }
.nav-group {
  display: flex; flex-direction: column; gap: 0.2rem;
  padding-left: 0.9rem; margin-left: 0.85rem;
  border-left: 1px solid #473a22;
}
.nav-group a { padding: 0.5rem 0.75rem; font-size: 0.83rem; }
.nav-group a svg { width: 16px; height: 16px; }
.user-chip {
  display: flex; align-items: center; gap: 0.6rem;
  margin-top: 1rem; padding: 0.6rem; border-radius: 8px; background: #2b2316;
}
.avatar {
  width: 28px; height: 28px; border-radius: 999px; flex-shrink: 0;
  background: #473a22; display: flex; align-items: center; justify-content: center;
  font-size: 0.8rem; font-weight: 700;
}
.email { font-size: 0.75rem; color: #d8cfb8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.logout-btn {
  margin-top: 0.6rem; background: transparent; border: 1px solid #473a22; color: #d8cfb8;
  padding: 0.5rem; border-radius: 8px; font-size: 0.85rem; font-weight: 500;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.logout-btn:hover { background: #2b2316; border-color: #5c4c2c; }
.content { flex: 1; min-width: 0; }
.topbar {
  display: flex; justify-content: flex-end; align-items: center; gap: 0.75rem;
  padding: 0.85rem 2rem; background: var(--color-surface, #fff); border-bottom: 1px solid var(--color-border, #e5e5e5);
  position: sticky; top: 0; z-index: 20;
}
.content .container { max-width: none; padding: 1.75rem 2rem 3rem; margin: 0; }

.menu-toggle {
  display: none; flex-shrink: 0; width: 38px; height: 38px; border-radius: var(--radius-sm);
  border: 1px solid var(--color-border, #e5e5e5); background: var(--color-surface, #fff); align-items: center; justify-content: center;
  cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease;
}
.menu-toggle svg { width: 19px; height: 19px; fill: var(--color-text, #1f2937); }
.menu-toggle:hover { background: var(--color-primary-light, #eef2ff); border-color: var(--color-primary, #4f46e5); }
.topbar-brand { display: none; flex: 1; font-weight: 800; font-size: 0.95rem; color: var(--color-text, #1f2937); }

.drawer-backdrop {
  display: none; position: fixed; inset: 0; z-index: 199; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(2px);
}
.drawer-backdrop-enter-active, .drawer-backdrop-leave-active { transition: opacity 0.2s ease; }
.drawer-backdrop-enter-from, .drawer-backdrop-leave-to { opacity: 0; }

/* Below this width the fixed sidebar would eat most of the screen, so it becomes an
   off-canvas drawer instead: hidden by default, slid in over the content (not pushing
   it) when the hamburger in the sticky topbar is tapped. */
@media (max-width: 960px) {
  .drawer-backdrop { display: block; }
  .menu-toggle { display: flex; }
  .topbar-brand { display: block; }
  .topbar { padding: 0.75rem 1rem; }

  aside {
    position: fixed; inset: 0 auto 0 0; z-index: 200; width: min(280px, 84vw);
    transform: translateX(-100%); transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: var(--shadow-lg, 0 20px 44px rgba(0, 0, 0, 0.25));
  }
  aside.mobile-open { transform: translateX(0); }
  .drawer-close { display: flex; }
  .content .container { padding: 1.25rem 1rem 2.5rem; }
}

@media (prefers-reduced-motion: reduce) {
  aside { transition: none; }
}
</style>
