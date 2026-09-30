FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Baked into the bundle by vite.config.js so the login page can show which build
# is being served -- the one check that needs no login and no shell.
ARG APP_VERSION=
ARG APP_COMMIT=
ENV VITE_APP_VERSION=$APP_VERSION
ENV VITE_APP_COMMIT=$APP_COMMIT

RUN npm run build

FROM nginx:alpine
ENV MCP_HOST=mcp-disabled.invalid
ENV NGINX_ENVSUBST_FILTER="^MCP_HOST$"
COPY --from=builder /app/dist /usr/share/nginx/html
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --chmod=755 docker-entrypoint.d/15-validate-mcp-host.sh /docker-entrypoint.d/15-validate-mcp-host.sh
EXPOSE 80
