FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/shared-schemas/package.json packages/shared-schemas/package.json
RUN npm ci
RUN npx playwright install --with-deps chromium

FROM dependencies AS runtime
COPY backend backend
COPY packages packages
COPY profile profile
RUN npm run prisma:generate -w @job-agent/backend
WORKDIR /app/backend
EXPOSE 3000
CMD ["node", "src/server.js"]
