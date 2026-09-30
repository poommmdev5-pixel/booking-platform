import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { i18n } from './i18n';
import { useAuth } from './composables/useAuth';
import './styles/main.css';
import './styles/client-theme.css';
import './styles/admin-theme.css';

// Restore a logged-in session from the httpOnly refresh cookie before the app ever
// renders. Without this, only routes flagged requiresCustomer/requiresAdmin ever call
// refresh() (via the router guard in router/index.js) — so a logged-in visitor looks
// logged out on every other page (home, products, the booking flow itself...) until
// they happen to navigate to one of those, and worse: a booking made while in that
// state is created without a customer_id, so it never shows up in "My Bookings" even
// after they do log back in. This runs unconditionally (guests just get a fast 401 and
// nothing changes for them) so every page — not just protected ones — starts with the
// correct session state.
async function bootstrap() {
  await useAuth().refresh();
  createApp(App).use(router).use(i18n).mount('#app');
}

bootstrap();
