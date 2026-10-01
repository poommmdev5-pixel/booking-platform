<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { settingsApi } from '../../api/settings';
import LanguageSwitcher from '../../components/LanguageSwitcher.vue';

const { isCustomer, logout } = useAuth();
const router = useRouter();
const route = useRoute();

const businessInfo = ref({ name: '', address: '', phone: '' });
const mobileMenuOpen = ref(false);
const isScrolled = ref(false);

// Closing on every navigation covers both link clicks (route changes before the click
// handler below would fire) and back/forward — a single watcher is simpler than wiring
// @click="mobileMenuOpen = false" onto every nav link individually.
watch(() => route.fullPath, () => { mobileMenuOpen.value = false; });

// Lock background scroll while the drawer is open, since it's teleported to <body> and
// sits on top of the page rather than pushing it down.
watch(mobileMenuOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : '';
});
onUnmounted(() => { document.body.style.overflow = ''; });

function onScroll() {
  isScrolled.value = window.scrollY > 8;
}

onMounted(async () => {
  window.addEventListener('scroll', onScroll, { passive: true });
  try {
    businessInfo.value = await settingsApi.getPublicBusinessInfo();
  } catch {
    // Non-critical branding fetch — the header/footer just fall back to the generic label.
  }
});
onUnmounted(() => window.removeEventListener('scroll', onScroll));

async function onLogout() {
  mobileMenuOpen.value = false;
  await logout();
  router.push({ name: 'home' });
}
</script>

<template>
  <div class="client-shell">
    <header class="site-header" :class="{ scrolled: isScrolled }">
      <div class="header-accent-bar"></div>
      <div class="container bar">
        <router-link to="/" class="brand">
          <span class="brand-mark">
            <svg viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="15.25" fill="url(#brandGrad)" stroke="#c7a04a" stroke-width="0.75" />
              <circle cx="21.5" cy="10.5" r="2.4" fill="#c7a04a" opacity="0.9" />
              <path d="M5 15c1 0 1.8.4 2.6 1c1 .8 2 1.1 3.4 1.1s2.4-.3 3.4-1.1c1-.8 2-1.1 3.4-1.1s2.4.3 3.4 1.1c.8.6 1.6 1 2.6 1" stroke="#c7a04a" stroke-width="1.4" stroke-linecap="round" fill="none" />
              <path d="M5 20c1 0 1.8.4 2.6 1c1 .8 2 1.1 3.4 1.1s2.4-.3 3.4-1.1c1-.8 2-1.1 3.4-1.1s2.4.3 3.4 1.1c.8.6 1.6 1 2.6 1" stroke="#c7a04a" stroke-width="1.4" stroke-linecap="round" fill="none" opacity="0.55" />
              <defs>
                <linearGradient id="brandGrad" x1="0" y1="0" x2="32" y2="32">
                  <stop offset="0" stop-color="#0e7c74" />
                  <stop offset="1" stop-color="#084a45" />
                </linearGradient>
              </defs>
            </svg>
          </span>
          <span class="brand-copy">
            <span class="brand-text">{{ businessInfo.name || 'Andaman Breeze' }}</span>
            <span class="brand-tagline">Phuket · Thailand</span>
          </span>
        </router-link>
        <nav class="nav-desktop">
          <router-link to="/products" class="nav-link">
            <svg viewBox="0 0 24 24"><path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 16H6V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h4v2c0 .55.45 1 1 1s1-.45 1-1V8h2v12z"/></svg>
            {{ $t('nav.products') }}
          </router-link>
          <router-link to="/account/lookup" class="nav-link">
            <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z"/></svg>
            {{ $t('account.lookupTitle') }}
          </router-link>
          <template v-if="isCustomer">
            <router-link to="/account/my-bookings" class="nav-link">
              <svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>
              {{ $t('nav.myBookings') }}
            </router-link>
            <button class="link-btn" @click="onLogout">{{ $t('nav.logout') }}</button>
          </template>
          <router-link v-else to="/account/login" class="btn btn-accent btn-sm nav-cta">{{ $t('nav.login') }}</router-link>
          <LanguageSwitcher />
        </nav>
        <button type="button" class="menu-toggle" aria-label="Menu" @click="mobileMenuOpen = true">
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>

    <Teleport to="body">
      <Transition name="drawer-backdrop">
        <div v-if="mobileMenuOpen" class="drawer-backdrop" @click="mobileMenuOpen = false"></div>
      </Transition>
      <Transition name="drawer-slide">
        <aside v-if="mobileMenuOpen" class="client-shell mobile-drawer">
          <div class="drawer-head">
            <div class="drawer-brand">
              <span class="brand-mark">
                <svg viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="15.25" fill="rgba(199,160,74,0.14)" stroke="#c7a04a" stroke-width="0.75" />
                  <circle cx="21.5" cy="10.5" r="2.4" fill="#c7a04a" opacity="0.9" />
                  <path d="M5 15c1 0 1.8.4 2.6 1c1 .8 2 1.1 3.4 1.1s2.4-.3 3.4-1.1c1-.8 2-1.1 3.4-1.1s2.4.3 3.4 1.1c.8.6 1.6 1 2.6 1" stroke="#c7a04a" stroke-width="1.4" stroke-linecap="round" fill="none" />
                  <path d="M5 20c1 0 1.8.4 2.6 1c1 .8 2 1.1 3.4 1.1s2.4-.3 3.4-1.1c1-.8 2-1.1 3.4-1.1s2.4.3 3.4 1.1c.8.6 1.6 1 2.6 1" stroke="#c7a04a" stroke-width="1.4" stroke-linecap="round" fill="none" opacity="0.55" />
                </svg>
              </span>
              <span class="drawer-brand-copy">
                <span class="drawer-brand-text">{{ businessInfo.name || 'Andaman Breeze' }}</span>
                <span class="drawer-brand-tagline">Phuket · Thailand</span>
              </span>
            </div>
            <button type="button" class="drawer-close" aria-label="Close menu" @click="mobileMenuOpen = false">
              <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>

          <nav class="drawer-nav">
            <router-link to="/products" class="drawer-link">
              <span class="drawer-link-icon">
                <svg viewBox="0 0 24 24"><path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 16H6V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h4v2c0 .55.45 1 1 1s1-.45 1-1V8h2v12z"/></svg>
              </span>
              <span class="drawer-link-text">{{ $t('nav.products') }}</span>
              <svg class="drawer-link-chevron" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
            </router-link>
            <router-link to="/account/lookup" class="drawer-link">
              <span class="drawer-link-icon">
                <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z"/></svg>
              </span>
              <span class="drawer-link-text">{{ $t('account.lookupTitle') }}</span>
              <svg class="drawer-link-chevron" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
            </router-link>
            <router-link v-if="isCustomer" to="/account/my-bookings" class="drawer-link">
              <span class="drawer-link-icon">
                <svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>
              </span>
              <span class="drawer-link-text">{{ $t('nav.myBookings') }}</span>
              <svg class="drawer-link-chevron" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
            </router-link>
          </nav>

          <div class="drawer-footer">
            <button v-if="isCustomer" type="button" class="drawer-logout" @click="onLogout">
              <svg viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L17.17 10H8v2h9.17l-1.58 1.58L17 15l4-4zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
              {{ $t('nav.logout') }}
            </button>
            <router-link v-else to="/account/login" class="btn btn-accent drawer-login">{{ $t('nav.login') }}</router-link>
            <LanguageSwitcher />
          </div>
        </aside>
      </Transition>
    </Teleport>
    <main class="container">
      <router-view />
    </main>
    <footer class="site-footer">
      <div class="container footer-grid">
        <div class="footer-brand">
          <span class="brand-text footer-brand-name">{{ businessInfo.name || 'Andaman Breeze' }}</span>
          <p class="footer-tagline">{{ $t('footer.tagline') }}</p>
        </div>
        <div class="footer-col">
          <h4>{{ $t('footer.explore') }}</h4>
          <router-link to="/products">{{ $t('nav.products') }}</router-link>
          <router-link to="/account/lookup">{{ $t('account.lookupTitle') }}</router-link>
          <router-link to="/account/my-bookings">{{ $t('nav.myBookings') }}</router-link>
        </div>
        <div class="footer-col">
          <h4>{{ $t('footer.contact') }}</h4>
          <p v-if="businessInfo.address">{{ businessInfo.address }}</p>
          <p v-if="businessInfo.phone">{{ businessInfo.phone }}</p>
        </div>
      </div>
      <div class="thai-divider footer-divider" aria-hidden="true">
        <span class="divider-line"></span>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 17 12 12 22 7 12Z M12 7.2 14.6 12 12 16.8 9.4 12Z" fill-rule="evenodd"/></svg>
        <span class="divider-line"></span>
      </div>
      <div class="container footer-bottom">
        <span>© {{ new Date().getFullYear() }} {{ businessInfo.name || 'Andaman Breeze' }} · {{ $t('footer.rights') }}</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.site-header {
  background: rgba(255, 253, 247, 0.78);
  backdrop-filter: blur(14px) saturate(1.1);
  -webkit-backdrop-filter: blur(14px) saturate(1.1);
  border-bottom: 1px solid var(--color-border-soft);
  position: sticky;
  top: 0;
  z-index: 20;
  transition: background 0.25s ease, box-shadow 0.25s ease, border-radius 0.25s ease;
}
.site-header.scrolled { background: rgba(255, 253, 247, 0.95); box-shadow: 0 10px 28px rgba(43, 35, 24, 0.12); }
.header-accent-bar { height: 1px; background: linear-gradient(90deg, transparent 0%, var(--color-primary) 50%, transparent 100%); opacity: 0.6; }

/* Floating pill navbar — wide desktop only. Between the hamburger breakpoint (781px) and
   here, the nav links already show in full but there isn't quite enough room for them
   inside the pill's rounded inset without wrapping/truncating, so that range keeps the
   flush full-width header instead. */
@media (min-width: 1080px) {
  .site-header {
    top: 1.25rem;
    margin: 1.25rem auto 0;
    max-width: 1180px;
    border: 1px solid var(--color-border-soft);
    border-radius: 999px;
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }
  .site-header.scrolled { box-shadow: 0 16px 40px rgba(43, 35, 24, 0.16); }
  .header-accent-bar { display: none; }
}
.bar { display: flex; align-items: center; justify-content: space-between; padding-top: 0.8rem; padding-bottom: 0.8rem; gap: 0.75rem; }
.brand { display: inline-flex; align-items: center; gap: 0.7rem; color: var(--color-primary-dark); min-width: 0; }
.brand-mark { width: 38px; height: 38px; flex-shrink: 0; display: block; filter: drop-shadow(0 4px 10px rgba(199, 160, 74, 0.25)); transition: transform 0.2s ease; }
.brand:hover .brand-mark { transform: rotate(-6deg) scale(1.05); }
.brand-mark svg { width: 100%; height: 100%; display: block; }
.brand-copy { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.brand-text { font-family: var(--font-display); font-weight: 700; font-size: 1.15rem; letter-spacing: -0.005em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.brand-tagline { font-size: 0.66rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-accent-hover); }
@media (max-width: 560px) { .brand-tagline { display: none; } }

nav { display: flex; align-items: center; gap: 0.4rem; }
.nav-link {
  display: inline-flex; align-items: center; gap: 0.4rem; white-space: nowrap;
  padding: 0.5rem 0.9rem; border-radius: 999px;
  font-weight: 600; font-size: 0.87rem; color: var(--color-text-muted);
  transition: color 0.15s ease, background 0.15s ease;
}
@media (max-width: 1180px) {
  .nav-link { padding: 0.5rem 0.65rem; font-size: 0.82rem; }
  nav { gap: 0.15rem; }
}
.nav-link svg { width: 15px; height: 15px; fill: currentColor; opacity: 0.75; flex-shrink: 0; }
.nav-link:hover { color: var(--color-primary); background: var(--color-primary-light); }
.nav-link.router-link-active { color: var(--color-primary); background: var(--color-primary-light); font-weight: 700; }
.nav-cta { text-decoration: none; margin-left: 0.5rem; }
.link-btn { background: none; border: none; padding: 0.5rem 0.9rem; font: inherit; font-weight: 600; font-size: 0.88rem; color: var(--color-text-muted); cursor: pointer; border-radius: 999px; transition: color 0.15s ease, background 0.15s ease; }
.link-btn:hover { color: var(--color-primary); background: var(--color-primary-light); }

.menu-toggle {
  display: none; flex-direction: column; justify-content: center; align-items: center; gap: 5px;
  width: 38px; height: 38px; flex-shrink: 0; border: none; background: transparent; border-radius: var(--radius-sm); cursor: pointer;
  transition: background 0.15s ease;
}
.menu-toggle:hover { background: var(--color-primary-light); }
.menu-toggle span { width: 20px; height: 2px; background: var(--color-text); border-radius: 2px; }

@media (max-width: 780px) {
  .nav-desktop { display: none; }
  .menu-toggle { display: flex; }
}

/* Mobile drawer — teleported to <body>, so it carries its own .client-shell class to
   pick up the theme's CSS custom properties (they don't cascade to a teleported sibling
   of the app root the way they do to normal descendants). */
.drawer-backdrop {
  position: fixed; inset: 0; background: rgba(28, 20, 12, 0.6); backdrop-filter: blur(2px);
  z-index: 90;
}
.mobile-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 91;
  width: min(340px, 86vw); min-height: 0; height: 100%;
  background: var(--color-surface); box-shadow: -16px 0 48px rgba(0, 0, 0, 0.4);
  overflow-y: auto;
}
/* The drawer only borrows .client-shell for its theme variables — it's a crisp white
   panel by design, so it opts out of the page-background photo wash. */
.mobile-drawer::before, .mobile-drawer::after { display: none; }
.drawer-backdrop-enter-active, .drawer-backdrop-leave-active { transition: opacity 0.25s ease; }
.drawer-backdrop-enter-from, .drawer-backdrop-leave-to { opacity: 0; }
.drawer-slide-enter-active, .drawer-slide-leave-active { transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1); }
.drawer-slide-enter-from, .drawer-slide-leave-to { transform: translateX(100%); }

.drawer-head {
  position: relative; overflow: hidden;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
  padding: 1.35rem 1rem;
  display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem;
}
.drawer-head::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 70% 60% at 90% 0%, rgba(199, 160, 74, 0.3), transparent 60%);
}
.drawer-brand { position: relative; display: flex; align-items: center; gap: 0.55rem; min-width: 0; flex: 1; }
.drawer-brand .brand-mark { width: 34px; height: 34px; flex-shrink: 0; }
.drawer-brand .brand-mark svg { width: 100%; height: 100%; }
.drawer-brand-copy { display: flex; flex-direction: column; min-width: 0; }
.drawer-brand-text {
  font-family: var(--font-display); font-weight: 600; font-size: 0.96rem; color: #fff; line-height: 1.25;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.drawer-brand-tagline { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-sand); }
.drawer-close {
  position: relative; flex-shrink: 0; width: 30px; height: 30px; border-radius: 999px; border: none;
  background: rgba(255, 255, 255, 0.14); display: flex; align-items: center; justify-content: center; cursor: pointer;
  transition: background 0.15s ease;
}
.drawer-close svg { width: 15px; height: 15px; fill: #fff; }
.drawer-close:hover { background: rgba(255, 255, 255, 0.26); }

.drawer-nav { display: flex; flex-direction: column; align-items: stretch; }
.drawer-link {
  display: flex; align-items: center; gap: 0.85rem; min-height: 62px; padding: 0.6rem 1.25rem;
  color: var(--color-text); transition: background 0.15s ease; border-bottom: 1px solid var(--color-border-soft);
}
.drawer-link:hover { background: var(--color-bg); }
.drawer-link.router-link-active { background: var(--color-primary-light); }
.drawer-link-icon {
  width: 38px; height: 38px; border-radius: var(--radius-sm); flex-shrink: 0;
  background: var(--color-primary-light); display: flex; align-items: center; justify-content: center;
}
.drawer-link-icon svg { width: 18px; height: 18px; fill: var(--color-primary); }
.drawer-link.router-link-active .drawer-link-icon { background: var(--color-primary); }
.drawer-link.router-link-active .drawer-link-icon svg { fill: #fff; }
.drawer-link-text {
  flex: 1; font-weight: 700; font-size: 0.92rem; line-height: 1.3;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.drawer-link-chevron { width: 16px; height: 16px; fill: var(--color-text-faint); flex-shrink: 0; }

.drawer-footer {
  display: flex; flex-direction: column; gap: 0.7rem; padding: 1rem 1.25rem 1.5rem;
  margin-top: 0.5rem; border-top: 1px solid var(--color-border-soft);
}
.drawer-logout {
  display: flex; align-items: center; gap: 0.65rem; padding: 0.65rem 0.6rem; border-radius: var(--radius-md);
  border: none; background: transparent; color: var(--color-text-muted); font-weight: 700; font-size: 0.92rem;
  cursor: pointer; transition: background 0.15s ease, color 0.15s ease;
}
.drawer-logout svg { width: 18px; height: 18px; fill: currentColor; }
.drawer-logout:hover { background: var(--color-danger-bg); color: var(--color-danger); }
.drawer-login { width: 100%; justify-content: center; text-decoration: none; }

/* `.container`'s `margin: 0 auto` centering trick relies on the element having an
   auto/stretched width first — but as a direct child of this flex column, an auto
   cross-axis margin makes it shrink-to-fit instead of stretching, leaving large,
   unintended gutters on narrow screens. `width: 100%` pins it back to the flex
   container's full width so `max-width` + `margin: auto` can center it normally. */
main { flex: 1; width: 100%; padding-top: 2.25rem; padding-bottom: 4rem; }
@media (max-width: 640px) { main { padding-top: 1.5rem; padding-bottom: 2.75rem; } }

.site-footer { margin-top: auto; background: var(--color-surface); border-top: 1px solid var(--color-border-soft); color: var(--color-text-muted); }
.footer-grid {
  display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 2.5rem;
  padding: 3.5rem 1.25rem 2.25rem;
}
@media (max-width: 700px) { .footer-grid { grid-template-columns: 1fr; gap: 1.75rem; padding: 2.75rem 1.25rem 1.75rem; } }
.footer-brand-name { font-size: 1.25rem; color: var(--color-text); }
.footer-tagline { margin: 0.6rem 0 0; font-size: 0.86rem; color: var(--color-text-muted); max-width: 26rem; line-height: 1.7; }
.footer-col h4 { margin: 0 0 0.85rem; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-primary); }
.footer-col { display: flex; flex-direction: column; gap: 0.6rem; }
.footer-col a, .footer-col p { color: var(--color-text-muted); font-size: 0.88rem; margin: 0; transition: color 0.15s ease; }
.footer-col a:hover { color: var(--color-primary); }
.footer-divider { max-width: 1180px; margin: 0 auto; padding: 0 1.25rem; }
.footer-bottom {
  padding: 1.5rem 1.25rem;
  font-size: 0.76rem; color: var(--color-text-faint); letter-spacing: 0.02em;
}
</style>
