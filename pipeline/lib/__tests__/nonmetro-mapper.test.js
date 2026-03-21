import { describe, it, expect } from 'vitest';
import { buildNonmetroMap } from '../nonmetro-mapper.js';

describe('buildNonmetroMap', () => {
  it('assigns uncovered counties to nonmetro areas by state', () => {
    const allCountiesByState = {
      '48': [
        { fips: '48059', name: 'Callahan County' },
        { fips: '48253', name: 'Jones County' },
        { fips: '48441', name: 'Taylor County' },
        { fips: '48999', name: 'Rural County' },
      ]
    };
    const coveredFips = new Set(['48059', '48253', '48441']);
    const geoRows = [
      { Area: '900048', StateAb: 'TX', AreaName: 'Balance of Texas' },
    ];

    const map = buildNonmetroMap(geoRows, allCountiesByState, coveredFips);
    expect(map['900048']).toHaveLength(1);
    expect(map['900048'][0].fips).toBe('48999');
  });

  it('skips territories', () => {
    const allCountiesByState = { '72': [{ fips: '72001', name: 'Adjuntas' }] };
    const coveredFips = new Set();
    const geoRows = [{ Area: '900072', StateAb: 'PR', AreaName: 'Balance of PR' }];

    const map = buildNonmetroMap(geoRows, allCountiesByState, coveredFips);
    expect(map['900072']).toBeUndefined();
  });
});
