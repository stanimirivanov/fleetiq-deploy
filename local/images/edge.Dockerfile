ARG NODE_IMAGE
ARG EDGE_IMAGE
FROM ${NODE_IMAGE} AS build
ARG PNPM_VERSION=12.5.1
WORKDIR /workspace
RUN npm install --global pnpm@${PNPM_VERSION} --ignore-scripts
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build
FROM ${EDGE_IMAGE}
# High ports need no file capability; inherited low-port caps conflict with cap_drop ALL.
RUN setcap -r /usr/bin/caddy && mkdir -p /srv /data/caddy /config/caddy && chown -R 10001:10001 /srv /data /config
COPY --from=build --chown=10001:10001 /workspace/apps/web/dist /srv
USER 10001:10001
EXPOSE 8443
ENTRYPOINT ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
