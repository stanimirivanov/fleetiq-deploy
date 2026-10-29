ARG RUST_IMAGE
ARG RUNTIME_IMAGE
FROM ${RUST_IMAGE} AS build
WORKDIR /workspace
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY crates ./crates
COPY examples/custom-protocol ./examples/custom-protocol
COPY packages/teltonika ./packages/teltonika
COPY migrations ./migrations
COPY .sqlx ./.sqlx
RUN --mount=type=cache,id=fleetiq-cargo-registry,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,id=fleetiq-cargo-git,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,id=fleetiq-deploy-target-1-99,target=/workspace/target,sharing=locked \
    SQLX_OFFLINE=true CARGO_BUILD_JOBS=2 cargo build --locked --release -p fleetiq-server -p fleetiq-protocol-wasm --bins && \
    cp target/release/fleetiq-server target/release/fleetiq-protocol-admission target/release/fleetiq-protocol-decode target/release/fleetiq-protocol-live /tmp/
RUN rustup target add wasm32-unknown-unknown
RUN --mount=type=cache,id=fleetiq-cargo-registry,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,id=fleetiq-deploy-target-1-99,target=/workspace/target,sharing=locked \
    CARGO_BUILD_JOBS=2 cargo build --locked --release --target wasm32-unknown-unknown -p fleetiq-teltonika && \
    SQLX_OFFLINE=true CARGO_BUILD_JOBS=2 cargo run --locked --release -p fleetiq-protocol-wasm --example componentize -- \
    target/wasm32-unknown-unknown/release/fleetiq_teltonika.wasm /tmp/teltonika.wasm
FROM ${RUNTIME_IMAGE}
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /tmp/fleetiq-server /usr/local/bin/fleetiq-server
COPY --from=build /tmp/fleetiq-protocol-* /usr/local/bin/
COPY --from=build /tmp/teltonika.wasm /usr/share/fleetiq/qualification/teltonika.wasm
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/bin/bash", "/opt/fleetiq/backend-entrypoint.sh"]
