import { useSyncExternalStore } from 'react';
import {
  createSearchQueryStore,
  type SearchQueryStore,
} from '../core/searchQueryStore';

const SEARCH_KEY = 'tabboardSearch';

export const savedSearchQueryStore: SearchQueryStore = createSearchQueryStore({
  locationSearch: () => typeof window === 'undefined' ? '' : window.location.search,
  readStoredQuery: () => typeof sessionStorage === 'undefined'
    ? null
    : sessionStorage.getItem(SEARCH_KEY),
  writeStoredQuery: (value) => {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SEARCH_KEY, value);
    }
  },
});

export function useSearchQuery(): string {
  return useSyncExternalStore(
    savedSearchQueryStore.subscribe,
    savedSearchQueryStore.getSnapshot,
    savedSearchQueryStore.getSnapshot,
  );
}

export function useSetSearchQuery(): (value: string) => void {
  return savedSearchQueryStore.set;
}
