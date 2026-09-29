FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY scripts/build-pages.mjs ./scripts/build-pages.mjs
COPY site ./site
COPY server ./server
COPY emails ./emails
RUN npm run build && npm prune --omit=dev
USER node
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
EXPOSE 8080
CMD ["node", "server/start.mjs"]
