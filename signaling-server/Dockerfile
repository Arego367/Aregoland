FROM node:22-alpine

# Kein Root
USER node
WORKDIR /home/node/app

COPY --chown=node:node package.json .
RUN npm install --production --ignore-scripts

COPY --chown=node:node server.js .

EXPOSE 3001

CMD ["node", "server.js"]
