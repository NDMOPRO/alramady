FROM node:20-alpine AS dev
RUN apk add --no-cache openssl python3 make g++ pkgconfig pixman-dev cairo-dev pango-dev libjpeg-turbo-dev giflib-dev librsvg-dev
WORKDIR /app
COPY package*.json .npmrc* ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
EXPOSE 8001
CMD ["npx", "tsx", "watch", "src/index.ts"]

FROM dev
CMD ["npx", "tsx", "src/index.ts"]
