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

# Build NestJS — compiles TypeScript → dist/
RUN npm run build

# Verify build output exists (fail loudly if nest build produced nothing)
RUN test -f dist/main.js || (echo "ERROR: dist/main.js not found after build" && exit 1)

EXPOSE 3001

CMD ["node", "dist/main"]
