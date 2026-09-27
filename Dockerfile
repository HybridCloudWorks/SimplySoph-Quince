FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
USER node
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
EXPOSE 8080
CMD ["node", "server/start.mjs"]
