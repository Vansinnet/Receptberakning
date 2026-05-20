import { MIN_SEARCH_QUERY_LENGTH } from './constants';

export interface AutocompleteConfig<T> {
  searchFn: (query: string) => Promise<T[]>;
  onSelect: (item: T) => void;
  minQueryLength?: number;
}

export function createAutocomplete<T>(config: AutocompleteConfig<T>) {
  const minLen = config.minQueryLength ?? MIN_SEARCH_QUERY_LENGTH;

  let results = $state<T[]>([]);
  let visible = $state(false);
  let highlight = $state(-1);
  let searchSeq = 0;
  let blurTimeout: ReturnType<typeof setTimeout> | null = null;

  async function search(query: string) {
    searchSeq++;
    const seq = searchSeq;

    if (query.length < minLen) {
      results = [];
      visible = false;
      highlight = -1;
      return;
    }
    const items = await config.searchFn(query);
    if (seq !== searchSeq) return;
    results = items;
    visible = items.length > 0;
    highlight = -1;
  }

  function select(item: T) {
    config.onSelect(item);
    visible = false;
    results = [];
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!visible) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlight = Math.min(highlight + 1, results.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlight = highlight >= 0 ? Math.max(highlight - 1, 0) : -1;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight >= 0 && highlight < results.length) {
        select(results[highlight]);
      }
    } else if (e.key === 'Escape') {
      visible = false;
      results = [];
    }
  }

  function handleBlur() {
    if (blurTimeout) clearTimeout(blurTimeout);
    blurTimeout = setTimeout(() => {
      visible = false;
      results = [];
      blurTimeout = null;
    }, 150);
  }

  function dismiss() {
    visible = false;
    results = [];
    highlight = -1;
    if (blurTimeout) { clearTimeout(blurTimeout); blurTimeout = null; }
  }

  function highlightAt(i: number) {
    highlight = i;
  }

  $effect(() => {
    return () => {
      if (blurTimeout) clearTimeout(blurTimeout);
    };
  });

  return {
    get results() { return results; },
    get visible() { return visible; },
    get highlight() { return highlight; },
    search,
    select,
    handleKeydown,
    handleBlur,
    dismiss,
    highlightAt,
  };
}
