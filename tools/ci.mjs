// Reviewed CI authority. Regenerate deliberate changes with: node tools/ci.mjs --write
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './process.mjs';
export const expectedWorkflow =
  // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub expressions are literal workflow content.
  'name: Deployment verification\non:\n  pull_request:\npermissions:\n  contents: read\nconcurrency:\n  group: deploy-${{ github.event.pull_request.number }}\n  cancel-in-progress: true\njobs:\n  structural:\n    name: Harness (${{ matrix.os }})\n    strategy:\n      fail-fast: false\n      matrix:\n        os: [ubuntu-24.04, windows-2025]\n    runs-on: ${{ matrix.os }}\n    timeout-minutes: 15\n    steps:\n      - uses: actions/checkout@v7\n        with:\n          fetch-depth: 0\n          persist-credentials: false\n      - uses: actions/setup-node@v7\n        with:\n          node-version: 24.18.0\n      - run: npm install --global pnpm@12.5.1 --allow-scripts=pnpm@12.5.1 --strict-allow-scripts\n      - run: pnpm install --frozen-lockfile\n      - run: pnpm secrets:install\n      - run: pnpm check\n        env:\n          FLEETIQ_BASE_SHA: ${{ github.event.pull_request.base.sha }}\n      - name: Record job verification outcome\n        if: always()\n        run: node tools/ci-evidence.mjs structural\n        env:\n          FLEETIQ_CI_STATUS: ${{ job.status }}\n      - uses: actions/upload-artifact@v7\n        if: always()\n        with:\n          name: structural-${{ matrix.os }}\n          path: .verification/*.json\n          if-no-files-found: error\n          include-hidden-files: true\n          retention-days: 7\n  docker:\n    name: Real HTTPS installation\n    runs-on: ubuntu-24.04\n    timeout-minutes: 60\n    steps:\n      - uses: actions/checkout@v7\n        with:\n          fetch-depth: 0\n          persist-credentials: false\n      - uses: actions/setup-node@v7\n        with:\n          node-version: 24.18.0\n      - run: npm install --global pnpm@12.5.1 --allow-scripts=pnpm@12.5.1 --strict-allow-scripts\n      - run: pnpm install --frozen-lockfile\n      - run: pnpm secrets:install\n      - name: Install checksum-verified Compose\n        run: node tools/install-compose.mjs\n      - name: Fetch reviewed application sources\n        run: pnpm local sources\n        env:\n          GH_TOKEN: ${{ secrets.FLEETIQ_SOURCE_READ_TOKEN }}\n      - name: Build reviewed application sources (no source credential)\n        run: pnpm local build\n      - name: Qualify infrastructure (real browser sign-in is the next slice)\n        run: pnpm qualify\n      - name: Record job verification outcome\n        if: always()\n        run: node tools/ci-evidence.mjs docker\n        env:\n          FLEETIQ_CI_STATUS: ${{ job.status }}\n      - uses: actions/upload-artifact@v7\n        if: always()\n        with:\n          name: docker-installation\n          path: .verification/*.json\n          if-no-files-found: error\n          include-hidden-files: true\n          retention-days: 7\n';
export function verifyWorkflow(
  actual = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8'),
) {
  if (actual.replaceAll('\r\n', '\n') !== expectedWorkflow)
    throw new Error(
      'CI differs from its reviewed authority; inspect tools/ci.mjs before regenerating.',
    );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url) &&
  process.argv[2] === '--write'
)
  writeFileSync(resolve(root, '.github/workflows/ci.yml'), expectedWorkflow);
