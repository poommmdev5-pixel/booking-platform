import { onMounted, onUnmounted } from 'vue';

// Adds a `.is-revealed` class to every element matching `selector` the first time it
// scrolls into view — the CSS transition itself (translate + opacity) lives in
// client-theme.css's `.reveal` rule, this just toggles the class once per element.
// Respects reduced-motion by revealing everything immediately instead of observing.
export function useRevealOnScroll(selector = '.reveal', root = null) {
  let observer;

  onMounted(() => {
    const targets = (root?.value || document).querySelectorAll(selector);
    if (targets.length === 0) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach((el) => el.classList.add('is-revealed'));
      return;
    }

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    targets.forEach((el) => observer.observe(el));
  });

  onUnmounted(() => observer?.disconnect());
}
