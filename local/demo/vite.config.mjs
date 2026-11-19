import configuration from '/workspace/apps/web/vite.config.ts';

/** Keep upstream origin/API isolation while placing all disposable compiler cache in tmpfs. */
export default function developmentConfiguration(environment) {
  const original = configuration(environment);
  return {
    ...original,
    root: '/workspace/apps/web',
    cacheDir: '/tmp/vite-cache',
    server: {
      ...original.server,
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      watch: { usePolling: true, interval: 100 },
      forwardConsole: false,
      fs: { strict: true, allow: ['/workspace'] },
    },
  };
}
