import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from '../composables/useAuth';

const routes = [
  {
    path: '/',
    component: () => import('../views/client/ClientLayout.vue'),
    children: [
      { path: '', name: 'home', component: () => import('../views/client/Home.vue') },
      { path: 'products', name: 'products', component: () => import('../views/client/ProductList.vue') },
      { path: 'products/:id', name: 'product-detail', component: () => import('../views/client/ProductDetail.vue'), props: true },
      { path: 'booking/:productId', name: 'booking-flow', component: () => import('../views/client/BookingFlow.vue'), props: true },
      { path: 'account/login', name: 'customer-login', component: () => import('../views/client/Login.vue') },
      { path: 'account/register', name: 'customer-register', component: () => import('../views/client/Register.vue') },
      { path: 'account/lookup', name: 'booking-lookup', component: () => import('../views/client/Lookup.vue') },
      {
        path: 'account/my-bookings',
        name: 'my-bookings',
        component: () => import('../views/client/MyBookings.vue'),
        meta: { requiresCustomer: true },
      },
    ],
  },
  { path: '/admin/login', name: 'admin-login', component: () => import('../views/admin/Login.vue') },
  { path: '/employee/login', name: 'employee-login', component: () => import('../views/employee/Login.vue') },
  {
    path: '/employee',
    component: () => import('../views/employee/EmployeeLayout.vue'),
    meta: { requiresEmployee: true },
    children: [
      { path: '', redirect: { name: 'employee-schedule' } },
      { path: 'schedule', name: 'employee-schedule', component: () => import('../views/employee/Schedule.vue') },
      { path: 'profile', name: 'employee-profile', component: () => import('../views/employee/Profile.vue') },
    ],
  },
  {
    path: '/admin',
    component: () => import('../views/admin/AdminLayout.vue'),
    meta: { requiresAdmin: true },
    children: [
      { path: '', redirect: { name: 'admin-dashboard' } },
      { path: 'dashboard', name: 'admin-dashboard', component: () => import('../views/admin/Dashboard.vue') },
      { path: 'products', name: 'admin-products', component: () => import('../views/admin/ProductList.vue') },
      { path: 'products/new', name: 'admin-product-new', component: () => import('../views/admin/ProductForm.vue') },
      { path: 'products/:id/edit', name: 'admin-product-edit', component: () => import('../views/admin/ProductForm.vue'), props: true },
      {
        path: 'products/:id/calendar',
        name: 'admin-product-calendar',
        component: () => import('../views/admin/Calendar.vue'),
        props: true,
      },
      { path: 'categories', name: 'admin-categories', component: () => import('../views/admin/CategoryList.vue') },
      { path: 'categories/new', name: 'admin-category-new', component: () => import('../views/admin/CategoryForm.vue') },
      { path: 'categories/:id/edit', name: 'admin-category-edit', component: () => import('../views/admin/CategoryForm.vue'), props: true },
      { path: 'extras', name: 'admin-extras', component: () => import('../views/admin/ExtraList.vue') },
      { path: 'extras/new', name: 'admin-extra-new', component: () => import('../views/admin/ExtraForm.vue') },
      { path: 'extras/:id/edit', name: 'admin-extra-edit', component: () => import('../views/admin/ExtraForm.vue'), props: true },
      { path: 'employees', name: 'admin-employees', component: () => import('../views/admin/EmployeeList.vue') },
      { path: 'employees/new', name: 'admin-employee-new', component: () => import('../views/admin/EmployeeForm.vue') },
      { path: 'employees/:id/edit', name: 'admin-employee-edit', component: () => import('../views/admin/EmployeeForm.vue'), props: true },
      { path: 'bookings', name: 'admin-bookings', component: () => import('../views/admin/BookingList.vue') },
      { path: 'bookings/:id', name: 'admin-booking-detail', component: () => import('../views/admin/BookingDetail.vue'), props: true },
      { path: 'booking-requests', name: 'admin-booking-requests', component: () => import('../views/admin/BookingRequests.vue') },
      { path: 'settings', name: 'admin-settings', component: () => import('../views/admin/Settings.vue') },
      {
        path: 'users',
        name: 'admin-users',
        component: () => import('../views/admin/Users.vue'),
        meta: { requiresSuperAdmin: true },
      },
    ],
  },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to) => {
  const { user, isAdmin, isCustomer, isEmployee, refresh } = useAuth();

  if (to.meta.requiresAdmin && !isAdmin.value) {
    const refreshed = await refresh();
    if (!refreshed || !isAdmin.value) return { name: 'admin-login' };
  }
  if (to.meta.requiresSuperAdmin && user.value?.role !== 'SUPER_ADMIN') {
    return { name: 'admin-dashboard' };
  }
  if (to.meta.requiresCustomer && !isCustomer.value) {
    const refreshed = await refresh();
    if (!refreshed || !isCustomer.value) return { name: 'customer-login' };
  }
  if (to.meta.requiresEmployee && !isEmployee.value) {
    const refreshed = await refresh();
    if (!refreshed || !isEmployee.value) return { name: 'employee-login' };
  }
  return true;
});
