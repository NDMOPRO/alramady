FROM node:24-alpine

WORKDIR /app

COPY . .

RUN npm install --legacy-peer-deps
RUN npm --prefix frontend install --legacy-peer-deps

RUN npm install -g vite

RUN npm --prefix frontend run build

EXPOSE 3000

CMD ["node","server/_core/index.js"]