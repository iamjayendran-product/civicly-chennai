'use client';

import { useEffect, useRef, useState } from 'react';
import { buildNominatimSearchUrl, parseNominatimResults, type PlaceResult } from '@/lib/geo/placeSearch';
import { t } from '@/lib/i18n';

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 400;

export interface LocationSearchProps {
  onSelect: (place: PlaceResult) => void;
  className?: string;
}

export function LocationSearch({ onSelect, className }: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Selecting a result sets `query` to that result's own label so the input reflects
  // the choice, but that's still a `query` change — without this, it re-triggers a
  // search for the label text itself and the dropdown reappears with the same result.
  const suppressNextSearchRef = useRef(false);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      return;
    }
    debounceRef.current = setTimeout(() => {
      if (query.trim().length < MIN_QUERY_LENGTH) {
        setResults([]);
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetch(buildNominatimSearchUrl(query), { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : []))
        .then((data) => setResults(parseNominatimResults(data)))
        .catch(() => {
          // A stale request being aborted is expected and not an error worth surfacing;
          // a genuine network failure just leaves the results list empty.
        });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleSelect(place: PlaceResult) {
    suppressNextSearchRef.current = true;
    setQuery(place.label);
    setResults([]);
    onSelect(place);
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('map.search.placeholder')}
        className="w-full rounded-lg border border-gray-300 bg-white p-2 text-sm shadow-sm"
      />
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white text-sm shadow-lg">
          {results.map((result) => (
            <li key={`${result.lng},${result.lat}`}>
              <button
                type="button"
                onClick={() => handleSelect(result)}
                className="block w-full truncate px-3 py-2 text-left hover:bg-gray-50"
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
