/**
 * Stroke-draw hover animation needs every SVG stroke normalized to the same
 * unit length (pathLength="1"), otherwise short strokes finish instantly and
 * read as flicker. CSS cannot set attributes, so a single delegated listener
 * normalizes icons lazily on first pointerover — before the :hover animation's
 * first styled frame. The CSS rules only match `[data-draw-ready]` icons, so an
 * un-normalized icon can never play a broken draw.
 */
const STROKE_TARGETS = 'path, line, polyline, polygon, circle, rect, ellipse';
const HOSTS = 'button, [role="button"], [data-slot="dropdown-menu-trigger"]';

export function installIconDrawNormalizer(doc: Document): () => void {
  const normalize = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    const host = event.target.closest(HOSTS);
    if (!host) return;
    for (const icon of host.querySelectorAll('.fx-icon-draw:not([data-draw-ready])')) {
      for (const stroke of icon.querySelectorAll(STROKE_TARGETS)) stroke.setAttribute('pathLength', '1');
      icon.setAttribute('data-draw-ready', '');
    }
  };
  doc.addEventListener('pointerover', normalize, { capture: true, passive: true });
  return () => doc.removeEventListener('pointerover', normalize, { capture: true });
}
