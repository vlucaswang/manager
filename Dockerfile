FROM node:22-alpine

# Install system dependencies
RUN apk add --no-cache \
    tmux \
    git \
    python3 \
    make \
    g++ \
    linux-headers \
    bash

# Install bun
RUN npm install -g bun

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Create user for running the application
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Create config directory
RUN mkdir -p /home/appuser/.config/amp-manager && \
    chown -R appuser:appgroup /home/appuser

# Switch to non-root user
USER appuser

# Expose WebSocket port
EXPOSE 8080

# Set entry point
ENTRYPOINT ["node", "dist/index.js"]
