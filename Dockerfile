FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
LABEL io.hass.name="home manager" \
      io.hass.description="Gestione familiare di vendita e acquisto immobiliare" \
      io.hass.arch="aarch64|amd64" \
      io.hass.type="addon" \
      io.hass.version="0.3.1"
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8104 DATA_DIR=/data TZ=Europe/Rome
EXPOSE 8104
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8104/api/health || exit 1
CMD ["node", "dist/server/index.js"]
