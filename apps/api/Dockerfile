FROM node:22-alpine

WORKDIR /app

# Copy package.json (lockfile is at monorepo root, not available here)
COPY package.json ./

# Install ALL dependencies including devDeps (needed for @nestjs/cli build)
RUN npm install --include=dev

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy all source and config files
COPY . .

# Build NestJS — uses tsconfig.build.json (excludes prisma/seed.ts)
# so TypeScript infers rootDir=src → output goes to dist/main.js
RUN npm run build

# Debug: show what was compiled
RUN echo "=== dist/ contents ===" && find dist -name "*.js" | head -10 || echo "dist/ empty or missing"

# Verify build output exists
RUN test -f dist/main.js || (echo "ERROR: dist/main.js not found - check dist/ output above" && exit 1)

EXPOSE 3001

CMD ["node", "dist/main"]
