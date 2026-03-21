import { scaleQuantize } from 'd3-scale';

export const EMBER = ["#1a1016", "#2a1520", "#451a28", "#6e2030", "#983828", "#c05a20", "#e08818", "#f0b818"];
export const NO_DATA_COLOR = '#1a1a2a';

export function createColorScale(domain) {
  return scaleQuantize().domain(domain).range(EMBER);
}
