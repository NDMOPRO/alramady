FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json .npmrc* ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS dev
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json .npmrc* ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN mkdir -p packages/shared/services
EXPOSE 8009
CMD ["npx", "tsx", "watch", "src/index.ts"]

FROM dev
CMD ["npx", "tsx", "src/index.ts"]
