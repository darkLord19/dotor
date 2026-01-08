# WhatsApp Browser Server - Headful Chrome on Ubuntu 22.04
# Optimized for GCP e2-micro (1GB RAM)

FROM ubuntu:22.04

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies for Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    curl \
    # Fonts for proper text rendering
    fonts-liberation \
    fonts-noto-color-emoji \
    # Chrome dependencies
    libnss3 \
    libxss1 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libasound2 \
    libgbm1 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxfixes3 \
    libxkbcommon0 \
    libpango-1.0-0 \
    libcairo2 \
    # X11 for headful display
    xvfb \
    x11vnc \
    fluxbox \
    # Node.js 20
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome Stable
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN useradd -m -s /bin/bash wauser \
    && mkdir -p /data/profile \
    && chown -R wauser:wauser /data

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (needed for build)
RUN npm install

# Copy application code
COPY . .

# Build TypeScript code
RUN npm run build

# Prune dev dependencies (optional, checks if allowed in this env)
# RUN npm prune --production

# Set ownership
RUN chown -R wauser:wauser /app

# Switch to non-root user
USER wauser

# Environment variables
ENV DISPLAY=:99
ENV CHROME_USER_DATA_DIR=/data/profile
ENV NODE_ENV=production

# Expose ports
# 3002 - API server
# 5900 - VNC (optional, for debugging)
EXPOSE 3002 5900

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3002/health || exit 1

# Start script
COPY docker-entrypoint.sh /docker-entrypoint.sh
USER root
RUN chmod +x /docker-entrypoint.sh
USER wauser

ENTRYPOINT ["/docker-entrypoint.sh"]
