import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { sha256 } from '../manifests/toolchain.mjs';

const names = [
  'common',
  'package-bom',
  'release-bom',
  'candidate',
  'request',
  'receipt',
];
const ajv = new Ajv({ strict: true, allErrors: false });
for (const name of names)
  ajv.addSchema(
    JSON.parse(
      readFileSync(new URL(`../../contracts/releases/${name}.json`, import.meta.url)),
    ),
  );
const validators = Object.fromEntries(
  names.map((name) => [
    name,
    ajv.getSchema(`https://fleetiq.invalid/releases/${name}.json`),
  ]),
);

/** Validate without coercion, defaults, unknown-field removal or network references. */
export function contract(name, value) {
  assert(validators[name], 'Unknown release contract');
  assert(
    validators[name](value),
    `Invalid ${name} contract at ${validators[name].errors?.[0]?.instancePath || '/'}`,
  );
  return value;
}

/** References hash the exact published UTF-8 file bytes, never a reserialized object. */
export function digest(bytes) {
  return `sha256:${sha256(bytes)}`;
}

export function readContract(name, file) {
  const bytes = readFileSync(file);
  assert(bytes.length <= 2 * 1024 * 1024, 'Release record exceeds size bound');
  return { value: contract(name, JSON.parse(bytes)), digest: digest(bytes) };
}

export function checkContracts() {
  for (const validate of Object.values(validators))
    assert.equal(typeof validate, 'function');
  return {
    contracts: names.length,
    validator: 'ajv-strict',
    activation: 'not-performed',
  };
}
