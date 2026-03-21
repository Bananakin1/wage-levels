import { readFileSync } from 'fs';
import { csvParse, tsvParse } from 'd3-dsv';

export function readCSV(path) {
  const text = readFileSync(path, 'utf-8');
  return csvParse(text);
}

export function readTSV(path) {
  const text = readFileSync(path, 'utf-8');
  return tsvParse(text);
}
