FROM node:22-slim

WORKDIR /app

# Install OpenSSL (required by Prisma engine on Debian)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package.json (lockfile is at monorepo root, not available here)
COPY package.json ./

# Install ALL dependencies including devDeps (needed for @nestjs/cli build)
RUN npm install --include=dev

# Copy Prisma schema and generate client (auto-detects Debian/OpenSSL target)
COPY prisma ./prisma
RUN npx prisma generate

# Copy all source and config files
COPY . .

# Build NestJS
RUN npm run build

# Verify build output exists
RUN test -f dist/main.js || (echo "ERROR: dist/main.js not found" && exit 1)

EXPOSE 3001

CMD ["node", "dist/main"]

