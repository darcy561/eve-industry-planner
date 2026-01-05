# syntax=docker/dockerfile:1.4

############################
# Build stage
############################
FROM node:22-alpine AS frontend-builder

# Build arguments
ARG ENVIRONMENT=production
ARG SENTRY_ORG
ARG SENTRY_PROJECT_ID
ARG SENTRY_DSN
ARG SENTRY_AUTH_TOKEN

WORKDIR /app

# Copy frontend package files first for caching
COPY frontend/package*.json ./ 
COPY frontend/vite.config.js ./

# Install dependencies (including dev for Vite)
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/root/.cache \
    npm ci --prefer-offline --no-audit --progress=false --include=dev

# Set build-time environment variables
ENV ENVIRONMENT=${ENVIRONMENT}
ENV NODE_ENV=${ENVIRONMENT}
ENV SENTRY_ORG=${SENTRY_ORG}
ENV SENTRY_PROJECT_ID=${SENTRY_PROJECT_ID}
ENV SENTRY_DSN=${SENTRY_DSN}
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN}

# Copy frontend source and public assets
COPY frontend/index.html ./
COPY frontend/src ./src
COPY frontend/public ./public

# Build frontend
RUN npm run build

############################
# Runtime stage
############################

FROM node:22-alpine

WORKDIR /app

# Install required packages for serving and healthcheck
RUN npm install -g serve@14.2.5 && \
    apk add --no-cache wget

# Copy built frontend files
COPY --from=frontend-builder /app/dist ./dist

# Copy deployment scripts
COPY --chown=appuser:appuser frontend/deployment ./deployment

# Create non-root user
RUN addgroup -g 1001 -S appuser && \
    adduser -u 1001 -S appuser -G appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 80

# Use Node.js startup script which generates runtime config from env vars
CMD ["node", "deployment/start.js"]
