FROM node:20.11-bullseye AS build
WORKDIR /app

# Copy and install all dependencies
COPY package*.json ./
COPY tsconfig*.json ./
RUN npm install -g npm@latest && npm install
COPY . .
RUN npx prisma generate
RUN npm run build

# Optional: prune dev dependencies after build
RUN npm prune --omit=dev

FROM node:20.11-alpine as runtime
WORKDIR /app
RUN apk update && \
    apk add --no-cache openssl && \
    rm -rf /var/cache/apk/*

# Copy only what is needed
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000
ENTRYPOINT [ "node", "./dist/index.js" ]
CMD ["start"]