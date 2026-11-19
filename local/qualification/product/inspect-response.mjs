import assert from 'node:assert/strict';
import { api } from './api.mjs';

/** Verify the UI-selected immutable interpretation without replaying the Inspect action. */
export async function qualifyInspection({ page, click, path, search, expected }) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname === path,
    ),
    click(),
  ]);
  assert.equal(new URL(response.url()).origin, new URL(page.url()).origin);
  assert.equal(new URL(response.url()).search, search);
  assert.equal(response.status(), 200);
  // The UI owns this response and may dispose its CDP body before click settles.
  // Interpretations are immutable: compare a bounded, authenticated browser read
  // of the exact selected endpoint while the caller verifies the rendered panel.
  assert.deepEqual(await api(page, `${path}${search}`, { status: 200 }), expected);
}
