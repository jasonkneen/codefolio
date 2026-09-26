FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gosu ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm install --global --ignore-scripts @openai/codex@0.157.1
COPY tsconfig.json ./
COPY server ./server
COPY src/lib ./src/lib
RUN chmod +x server/entrypoint.sh
ENV HOST=0.0.0.0 PORT=1234 CODEFOLIO_DATA_DIR=/data
EXPOSE 1234
ENTRYPOINT ["/app/server/entrypoint.sh"]
CMD ["node", "--import", "tsx", "server/cli.ts"]
