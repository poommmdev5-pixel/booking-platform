import { createI18n } from 'vue-i18n';
import th from './locales/th.json';
import en from './locales/en.json';
import zh from './locales/zh.json';

export const SUPPORTED_LOCALES = ['th', 'en', 'zh'];
const STORAGE_KEY = 'booking_locale';

function readStoredLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_LOCALES.includes(stored) ? stored : 'th';
  } catch {
    return 'th';
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: readStoredLocale(),
  fallbackLocale: 'th',
  messages: { th, en, zh },
});

export function setLocale(locale) {
  i18n.global.locale.value = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* private browsing / storage disabled — language just won't persist */
  }
}

const DATE_LOCALE_MAP = { th: 'th-TH', en: 'en-US', zh: 'zh-CN' };
// Force the Gregorian calendar for Thai — otherwise Intl renders พ.ศ. (Buddhist era,
// e.g. 2569) which would read as wrong/confusing next to the Gregorian years used
// everywhere else in this app (DB dates, other locales, admin timestamps).
const DATE_FORMAT_LOCALE_MAP = { th: 'th-TH-u-ca-gregory', en: 'en-US', zh: 'zh-CN' };

// Plain 'YYYY-MM-DD' (a DATE column, no time-of-day) is parsed as local midnight, not
// UTC — `new Date('2026-09-27')` is UTC midnight, which renders as the previous day in
// any timezone behind UTC.
function toDateObject(date) {
  if (date instanceof Date) return date;
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(date);
}

// Full, unambiguous date in the viewer's chosen language — used everywhere a date is
// shown so the format is consistent across the whole app instead of raw 'YYYY-MM-DD'.
export function formatDate(date, style = 'long') {
  if (!date) return '';
  return new Intl.DateTimeFormat(DATE_FORMAT_LOCALE_MAP[i18n.global.locale.value], { dateStyle: style }).format(toDateObject(date));
}

// Date + time together, e.g. for "when was this booking submitted" — as opposed to
// formatDate's date-only output, used for the booking's own service date/time.
export function formatDateTime(date, dateStyle = 'medium', timeStyle = 'short') {
  if (!date) return '';
  return new Intl.DateTimeFormat(DATE_FORMAT_LOCALE_MAP[i18n.global.locale.value], { dateStyle, timeStyle }).format(toDateObject(date));
}

// Month/year header for MonthCalendar, e.g. '2026-09' -> "September 2026" — localized to
// the viewer's chosen language instead of the browser's own default locale.
export function formatMonthYear(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Intl.DateTimeFormat(DATE_FORMAT_LOCALE_MAP[i18n.global.locale.value], { year: 'numeric', month: 'long' }).format(
    new Date(y, m - 1, 1),
  );
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat(DATE_LOCALE_MAP[i18n.global.locale.value], { style: 'currency', currency: 'THB' }).format(amount);
}

const DURATION_UNITS = {
  th: { hour: 'ชม.', minute: 'นาที' },
  en: { hour: 'hr', minute: 'min' },
  zh: { hour: '小时', minute: '分钟' },
};

// A stay_session price tier is only ever stored as a number of minutes — this turns
// that into whatever unit reads best (e.g. 90 -> "1 hr 30 min"), in the viewer's locale.
export function formatMinutes(minutes) {
  const units = DURATION_UNITS[i18n.global.locale.value] || DURATION_UNITS.th;
  const n = Number(minutes) || 0;
  const hours = Math.floor(n / 60);
  const mins = n % 60;
  if (hours === 0) return `${mins} ${units.minute}`;
  if (mins === 0) return `${hours} ${units.hour}`;
  return `${hours} ${units.hour} ${mins} ${units.minute}`;
}
