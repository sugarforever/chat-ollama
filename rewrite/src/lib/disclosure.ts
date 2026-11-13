/** Animate native details without removing their contents or changing keyboard behavior. */
export function smoothDisclosure(node: HTMLDetailsElement) {
  const summary = node.querySelector('summary');
  if (!summary) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const originalOverflow = node.style.overflow;
  let expanded = node.open;
  let animation: Animation | undefined;

  function settle() {
    animation?.cancel();
    animation = undefined;
    node.open = expanded;
    node.style.overflow = originalOverflow;
    node.dataset.expanded = String(expanded);
  }

  function toggle(event: MouseEvent) {
    event.preventDefault();
    const start = node.getBoundingClientRect().height;
    expanded = !expanded;
    animation?.cancel();
    animation = undefined;
    node.dataset.expanded = String(expanded);
    if (motion.matches || !node.animate) {
      settle();
      return;
    }
    // Measure the native target, then keep contents mounted throughout the transition.
    node.open = expanded;
    const end = node.getBoundingClientRect().height;
    node.open = true;
    node.style.overflow = 'hidden';
    animation = node.animate(
      [{ height: `${start}px` }, { height: `${end}px` }],
      { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
    animation.onfinish = settle;
  }

  summary.addEventListener('click', toggle);
  motion.addEventListener('change', settle);
  return {
    destroy() {
      summary?.removeEventListener('click', toggle);
      motion.removeEventListener('change', settle);
      animation?.cancel();
      node.style.overflow = originalOverflow;
      delete node.dataset.expanded;
    },
  };
}
