import { copyToClipboard } from './utils';

export function copyable(node: HTMLElement, getText: () => string) {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  async function handleClick() {
    const originalText = node.textContent ?? '';
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

