FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install --legacy-peer-deps
RUN npm --prefix frontend install --legacy-peer-deps

RUN npm install -g vite

RUN npm --prefix frontend run build

EXPOSE 3000

CMD ["node","dist/index.js"]