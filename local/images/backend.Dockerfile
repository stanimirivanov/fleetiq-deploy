ARG RUST_IMAGE
ARG RUNTIME_IMAGE
FROM ${RUST_IMAGE} AS build
WORKDIR /workspace
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY crates ./crates
COPY migrations ./migrations
COPY .sqlx ./.sqlx
RUN --mount=type=cache,id=fleetiq-cargo-registry,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,id=fleetiq-cargo-git,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,id=fleetiq-deploy-target-1-98,target=/workspace/target,sharing=locked \
    SQLX_OFFLINE=true CARGO_BUILD_JOBS=2 cargo build --locked --release -p fleetiq-server && cp target/release/fleetiq-server /tmp/fleetiq-server
FROM ${RUNTIME_IMAGE}
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /tmp/fleetiq-server /usr/local/bin/fleetiq-server
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/bin/bash", "/opt/fleetiq/backend-entrypoint.sh"]
