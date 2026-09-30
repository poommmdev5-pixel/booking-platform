import { computed, ref } from 'vue';
import { decodeJwt } from '../api/jwt';

// Module-level (singleton) state shared by every component that imports this composable.
const accessToken = ref(null);
const user = computed(() => (accessToken.value ? decodeJwt(accessToken.value) : null));
const isAdmin = computed(() => user.value?.type === 'admin');
const isCustomer = computed(() => user.value?.type === 'customer');
const isEmployee = computed(() => user.value?.type === 'employee');

function setAccessToken(token) {
  accessToken.value = token;
}

function getAccessToken() {
  return accessToken.value;
}

async function adminLogin(email, password) {
  const res = await fetch('/api/auth/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Login failed');
  setAccessToken(data.accessToken);
}

async function customerLogin(email, password) {
  const res = await fetch('/api/auth/customer/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Login failed');
  setAccessToken(data.accessToken);
}

async function employeeLogin(email, password) {
  const res = await fetch('/api/auth/employee/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Login failed');
  setAccessToken(data.accessToken);
}

async function customerRegister(name, email, phone, password) {
  const res = await fetch('/api/auth/customer/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name, email, phone, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Registration failed');
  setAccessToken(data.accessToken);
}

async function refresh() {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!res.ok) throw new Error('refresh failed');
    const data = await res.json();
    setAccessToken(data.accessToken);
    return true;
  } catch {
    setAccessToken(null);
    return false;
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  setAccessToken(null);
}

export function useAuth() {
  return {
    user,
    isAdmin,
    isCustomer,
    isEmployee,
    getAccessToken,
    setAccessToken,
    adminLogin,
    customerLogin,
    customerRegister,
    employeeLogin,
    refresh,
    logout,
  };
}
