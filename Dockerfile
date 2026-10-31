FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY web/package*.json web/
RUN cd web && npm ci
COPY . .
RUN npm run build && npm run build:web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist dist
COPY --from=build /app/web/dist web/dist
COPY seed seed
EXPOSE 3000
CMD ["node", "dist/index.js"]
