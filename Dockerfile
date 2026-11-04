# Node 24 to match package.json engines and CI; the digest makes every build use the same image.
# Dependabot proposes new digests for this tag, never a new major version.
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY scripts/build-pages.mjs scripts/images.mjs ./scripts/
COPY site ./site
COPY server ./server
COPY emails ./emails
RUN npm run build && npm prune --omit=dev
USER node
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
EXPOSE 8080
CMD ["node", "server/start.mjs"]
