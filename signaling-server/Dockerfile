FROM node:22-alpine

# Kein Root
USER node
WORKDIR /home/node/app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --production

COPY --chown=node:node server.js storage.js ./

# Persistentes Volume für SQLite
VOLUME /home/node/app/data
ENV DB_PATH=/home/node/app/data/spaces.db

EXPOSE 3001

CMD ["node", "server.js"]
