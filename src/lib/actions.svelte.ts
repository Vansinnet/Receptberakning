import { copyToClipboard } from './utils';

export function copyable(node: HTMLElement, getText: () => string) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const originalText = node.textContent ?? '';

  async function handleClick() {
    const ok = await copyToClipboard(getText());
    if (!ok) return;
    node.textContent = 'Kopierat!';
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => { node.textContent = originalText; }, 2000);
  }

  node.addEventListener('click', handleClick);
  return {
    destroy() {
      node.removeEventListener('click', handleClick);
      if (timeout) clearTimeout(timeout);
    },
  };
}

export function ariaTooltip(node: HTMLElement) {
  const tip = node.getAttribute('data-tooltip');
  if (tip && !node.hasAttribute('aria-label')) {
    node.setAttribute('aria-label', tip);
  }
}
