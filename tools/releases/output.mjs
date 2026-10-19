import assert from 'node:assert/strict';
import { join } from 'node:path';
import { plainDirectory } from '../manifests/toolchain.mjs';
import { root } from '../process.mjs';

/** Reject every linked ancestor before retaining public release evidence. */
export function releaseOutput(...fragments) {
  let directory = root;
  for (const fragment of ['target', ...fragments]) {
    assert(/^[a-zA-Z0-9-]+$/u.test(fragment), 'Unsafe release output fragment');
    directory = join(directory, fragment);
    plainDirectory(directory);
  }
  return directory;
}
