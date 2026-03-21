import { describe, it, expect } from 'vitest';
import { buildFipsMap } from '../fips-mapper.js';

describe('buildFipsMap', () => {
  it('maps CBSA code to array of county FIPS', () => {
    const cbsaRows = [
      { 'CBSA Code': '10180', 'FIPS State Code': '48', 'FIPS County Code': '059', 'County/County Equivalent': 'Callahan County' },
      { 'CBSA Code': '10180', 'FIPS State Code': '48', 'FIPS County Code': '253', 'County/County Equivalent': 'Jones County' },
      { 'CBSA Code': '10180', 'FIPS State Code': '48', 'FIPS County Code': '441', 'County/County Equivalent': 'Taylor County' },
    ];
    const map = buildFipsMap(cbsaRows);
    expect(map['10180']).toHaveLength(3);
    expect(map['10180']).toContainEqual({ fips: '48059', name: 'Callahan County' });
    expect(map['10180']).toContainEqual({ fips: '48441', name: 'Taylor County' });
  });

  it('filters out territory entries (FIPS state >= 60)', () => {
    const cbsaRows = [
      { 'CBSA Code': '99999', 'FIPS State Code': '72', 'FIPS County Code': '001', 'County/County Equivalent': 'Adjuntas' },
    ];
    const map = buildFipsMap(cbsaRows);
    expect(map['99999']).toBeUndefined();
  });
});
