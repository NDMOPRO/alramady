FROM node:20-alpine AS dev
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json .npmrc* ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
EXPOSE 8008
CMD ["npx", "tsx", "watch", "src/index.ts"]

FROM dev
CMD ["npx", "tsx", "src/index.ts"]
