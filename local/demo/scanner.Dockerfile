# Only immutable, already reviewed platform source enters this build context.
ARG RUST_IMAGE
FROM ${RUST_IMAGE} AS build
WORKDIR /workspace
COPY . .
RUN --mount=type=cache,id=fleetiq-cargo-registry,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,id=fleetiq-cargo-git,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,id=fleetiq-deploy-target-1-99,target=/workspace/target,sharing=locked \
    CARGO_BUILD_JOBS=2 cargo build --locked --release -p fleetiq-xtask && cp target/release/fleetiq-xtask /tmp/
FROM ${RUST_IMAGE}
RUN apt-get update && apt-get install --no-install-recommends -y git && rm -rf /var/lib/apt/lists/*
COPY --from=build /tmp/fleetiq-xtask /usr/local/bin/fleetiq-xtask
# Candidate Git configuration cannot launch a filesystem monitor or hooks.
RUN printf '#!/bin/sh\nexec /usr/bin/git -c core.fsmonitor=false -c core.hooksPath=/dev/null "$@"\n' > /usr/local/bin/git && chmod 755 /usr/local/bin/git
USER 10001:10001
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/fleetiq-xtask"]
