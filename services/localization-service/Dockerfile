FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json .npmrc* ./
RUN npm ci
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
EXPOSE 8008
CMD ["npx", "tsx", "watch", "src/index.ts"]

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json .npmrc* ./
EXPOSE 8008
CMD ["node", "dist/index.js"]
