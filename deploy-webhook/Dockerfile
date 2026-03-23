FROM node:22-alpine

RUN apk add --no-cache git docker-cli docker-compose

WORKDIR /app
COPY server.js .

EXPOSE 9000

CMD ["node", "server.js"]
