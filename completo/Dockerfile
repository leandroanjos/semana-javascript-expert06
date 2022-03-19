FROM node:14-slim

# Poderia usar libsox=fmt-all
RUN apt-get update \
    && apt-get install -y sox libsox-fmt-mp3

WORKDIR /spotify-radio/

COPY package.json package-lock.json /spotify-radio/

RUN npm ci --silent

COPY . .

USER node

CMD npm run live-reload