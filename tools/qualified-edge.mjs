import { readFileSync } from 'node:fs';

export const qualifiedEdge = JSON.parse(
  readFileSync(
    new URL('../charts/fleetiq-runtime/qualified-edge.json', import.meta.url),
  ),
);
