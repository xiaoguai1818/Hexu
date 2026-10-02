FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /checks
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY ci/playwright.config.mjs ci/playwright.config.mjs
COPY test/browser test/browser
CMD ["npm", "run", "test:browser"]
