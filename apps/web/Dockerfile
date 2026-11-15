FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --no-audit --no-fund
COPY apps/web apps/web
ENV API_INTERNAL_URL=http://api:4000
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w apps/web
USER node
EXPOSE 3000
CMD ["npm","run","start","-w","apps/web"]
