# syntax=docker/dockerfile:1

# --- build stage ---------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# --- runtime stage (nginx) ----------------------------------------------
FROM nginx:1.27-alpine AS runtime

# Static SPA assets.
COPY --from=build /app/dist /usr/share/nginx/html

# nginx config template — the official image runs envsubst on *.template at
# startup, substituting ${BACKEND_URL} and ${BACKEND_HOST} from the env.
COPY nginx/templates/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
