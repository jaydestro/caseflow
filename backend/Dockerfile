# syntax=docker/dockerfile:1

# --- build stage ---------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Install deps first for better layer caching.
COPY package*.json ./
RUN npm install

# Compile TypeScript -> dist/
COPY . .
RUN npm run build

# Drop dev dependencies for a lean runtime image.
RUN npm prune --omit=dev

# --- runtime stage -------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

EXPOSE 4000
USER node
CMD ["node", "dist/server.js"]
