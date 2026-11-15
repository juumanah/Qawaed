FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --no-audit --no-fund
COPY apps/api apps/api
COPY scripts scripts
COPY db db
RUN npm run build -w apps/api
USER node
EXPOSE 4000
CMD ["sh","-c","node scripts/setup-db.mjs && unset MIGRATION_DATABASE_URL APP_DB_PASSWORD WORKER_DB_PASSWORD DEMO_PASSWORD && node apps/api/dist/main.js"]
