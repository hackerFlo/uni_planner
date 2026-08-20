FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
# The image is production by default rather than relying on compose to say so;
# a missing NODE_ENV used to load the dev seed. Still overridable at run time.
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Only /app/data needs to be writable. The application files stay root-owned and
# read-only to the runtime user, which is the point of dropping privileges.
RUN mkdir -p /app/data && chown -R node:node /app/data

# Stamped by CI so the running container can say which commit it is. Without
# this the deployed build is observable from nowhere.
ARG APP_VERSION=
ARG APP_COMMIT=
ENV APP_VERSION=$APP_VERSION
ENV APP_COMMIT=$APP_COMMIT

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
# uid/gid 1000 in the official images. The host directory bind-mounted to
# /app/data must be owned by 1000 -- server/storage.js checks this at boot and
# names the exact chown if it is not.
USER node
CMD ["node", "index.js"]
