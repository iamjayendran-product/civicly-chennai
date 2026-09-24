import { describe, it, expect } from 'vitest';
import { buildNominatimSearchUrl, parseNominatimResults } from './placeSearch';

describe('buildNominatimSearchUrl', () => {
  it('includes the query and restricts to the CMDA bounding box', () => {
    const url = buildNominatimSearchUrl('T Nagar');
    expect(url).toContain('https://nominatim.openstreetmap.org/search?');
    expect(url).toContain('q=T+Nagar');
    expect(url).toContain('bounded=1');
    expect(url).toContain('countrycodes=in');
    expect(url).toContain('format=json');
  });

  it('url-encodes special characters in the query', () => {
    const url = buildNominatimSearchUrl('Anna Salai & GST Road');
    expect(url).toContain('q=Anna+Salai+%26+GST+Road');
  });
});

describe('parseNominatimResults', () => {
  it('maps valid Nominatim entries to PlaceResult', () => {
    const raw = [{ lat: '13.0435', lon: '80.2349', display_name: 'T Nagar, Chennai, Tamil Nadu, India' }];
    expect(parseNominatimResults(raw)).toEqual([
      { lng: 80.2349, lat: 13.0435, label: 'T Nagar, Chennai, Tamil Nadu, India' },
    ]);
  });

  it('returns an empty array for a non-array response', () => {
    expect(parseNominatimResults({ error: 'Unable to geocode' })).toEqual([]);
  });

  it('returns an empty array for null or undefined', () => {
    expect(parseNominatimResults(null)).toEqual([]);
    expect(parseNominatimResults(undefined)).toEqual([]);
  });

  it('skips entries missing required fields', () => {
    const raw = [
      { lat: '13.0435', lon: '80.2349', display_name: 'Valid entry' },
      { lat: '13.0435', display_name: 'Missing lon' },
      { lon: '80.2349', display_name: 'Missing lat' },
      { lat: '13.0435', lon: '80.2349' },
    ];
    expect(parseNominatimResults(raw)).toEqual([{ lng: 80.2349, lat: 13.0435, label: 'Valid entry' }]);
  });

  it('skips entries with non-numeric lat/lon strings', () => {
    const raw = [{ lat: 'not-a-number', lon: '80.2349', display_name: 'Bad lat' }];
    expect(parseNominatimResults(raw)).toEqual([]);
  });

  it('returns multiple results in order', () => {
    const raw = [
      { lat: '13.0', lon: '80.1', display_name: 'First' },
      { lat: '13.1', lon: '80.2', display_name: 'Second' },
    ];
    expect(parseNominatimResults(raw)).toEqual([
      { lng: 80.1, lat: 13.0, label: 'First' },
      { lng: 80.2, lat: 13.1, label: 'Second' },
    ]);
  });
});
