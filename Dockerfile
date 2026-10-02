ARG NODE_IMAGE=node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
FROM ${NODE_IMAGE} AS test
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig*.json ./
COPY src ./src
COPY test ./test
COPY skills ./skills
COPY docs ./docs
COPY scripts ./scripts
COPY ci ./ci
COPY web ./web
COPY bin ./bin
CMD ["npm", "run", "check"]

FROM test AS compiled
RUN npm run build

# Actual Web entry, with compiled application code and no test-only HTTP endpoints.
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=compiled --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node skills ./skills
COPY --chown=node:node web ./web
COPY --chown=node:node bin ./bin
ENV HEXU_DATA_DIR=/data HEXU_BIND=0.0.0.0
RUN mkdir -p /data && chown node:node /data
USER node
CMD ["node", "bin/server.mjs"]

# Only used on the isolated CI network. Never publish/deploy this fixture as Hexu.
FROM runtime AS ci-deployment-fixture
COPY --chown=node:node ci/fixture-server.mjs ./ci/fixture-server.mjs
CMD ["node", "ci/fixture-server.mjs"]
