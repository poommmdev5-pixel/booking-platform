const SUPPORTED_LOCALES = ['th', 'en', 'zh'];
const DEFAULT_LOCALE = 'th';

function normalizeLocale(input) {
  const candidate = String(input || '').toLowerCase().slice(0, 2);
  return SUPPORTED_LOCALES.includes(candidate) ? candidate : DEFAULT_LOCALE;
}

// Picks the translation row matching `locale`, falling back to DEFAULT_LOCALE, then to
// whatever translation exists first, so a product is never rendered with empty content.
function pickTranslation(translations, locale) {
  return (
    translations.find((t) => t.locale === locale) ||
    translations.find((t) => t.locale === DEFAULT_LOCALE) ||
    translations[0]
  );
}

function localeFromRequest(req) {
  if (req.query.locale) return normalizeLocale(req.query.locale);
  const acceptLanguage = req.headers['accept-language'];
  return normalizeLocale(acceptLanguage ? acceptLanguage.split(',')[0] : null);
}

module.exports = { SUPPORTED_LOCALES, DEFAULT_LOCALE, normalizeLocale, pickTranslation, localeFromRequest };
