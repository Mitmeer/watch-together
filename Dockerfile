FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip ffmpeg ca-certificates \
    && pip3 install --break-system-packages -U yt-dlp \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm install && npm install --prefix server && npm install --prefix client

COPY server ./server
COPY client ./client

RUN npm run build --prefix client

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp

EXPOSE 3001

CMD ["node", "server/index.js"]
