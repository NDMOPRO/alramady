FROM node:24-alpine

WORKDIR /app

COPY . .

RUN npm install --legacy-peer-deps
RUN npm --prefix frontend install --legacy-peer-deps

RUN npm install -g vite esbuild

RUN npm --prefix frontend run build
RUN npx esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=cjs --outfile=dist/index.js

EXPOSE 3000

CMD ["node","dist/index.js"]