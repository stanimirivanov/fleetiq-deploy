ARG BROWSER_IMAGE
FROM ${BROWSER_IMAGE}
USER root
RUN apt-get update && apt-get install --no-install-recommends -y openssl libnss3-tools && rm -rf /var/lib/apt/lists/*
WORKDIR /fixture
COPY package.json pnpm-lock.yaml ./
RUN npm install --global pnpm@12.5.1 --allow-scripts=pnpm@12.5.1 --strict-allow-scripts && pnpm install --frozen-lockfile
COPY local/qualification/product ./local/qualification/product
COPY local/backend-entrypoint.sh ./local/backend-entrypoint.sh
RUN bash -n local/backend-entrypoint.sh && bash -n local/qualification/product/init.sh && bash -n local/qualification/product/backend.sh && node local/qualification/product/entrypoint-test.mjs
USER pwuser
ENTRYPOINT ["node"]
