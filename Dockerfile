FROM node:24-bookworm-slim AS test
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig*.json ./
COPY src ./src
COPY test ./test
COPY skills ./skills
COPY docs ./docs
CMD ["npm", "run", "check"]
