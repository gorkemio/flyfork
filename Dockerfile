# Build only from an extracted, verified source candidate; never the private workspace.
FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS builder
WORKDIR /app
COPY . .
RUN node scripts/bootstrap-pnpm.mjs /opt/pnpm
ENV PATH="/opt/pnpm/bin:${PATH}"
RUN node scripts/container-build.mjs

# Export this target separately to retain Linux logs and the exact dist outside runtime.
FROM scratch AS evidence
COPY --from=builder /app/artifacts/verification/ /verification/
COPY --from=builder /app/dist/ /dist/

FROM nginxinc/nginx-unprivileged:1.30.5-alpine@sha256:daa17b944bac2b578e962da4c61ad72a59233b3c63abea17113acaf4e6b9aea4 AS runtime
COPY --from=builder /app/dist/ /srv/flyfork/
COPY deploy/nginx.conf /etc/nginx/nginx.conf
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
# The upstream shell entrypoint edits config; this immutable config needs no mutation.
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
