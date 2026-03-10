# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /build

# 1. katab-shared (local package dependency)
COPY katab-shared/ ./katab-shared/
WORKDIR /build/katab-shared
RUN npm install && npm run build

# 2. KCP
WORKDIR /build/kcp
COPY KCP/package.json KCP/package-lock.json ./
# Rewrite file: dependency to local path
RUN sed -i 's|"file:../katab-shared"|"file:../katab-shared"|' package.json && npm ci
COPY KCP/src ./src
COPY KCP/tsconfig.json ./
RUN npx tsc

# ---- runner ----
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /build/kcp/dist ./dist
COPY --from=builder /build/kcp/node_modules ./node_modules
COPY --from=builder /build/kcp/package.json ./
COPY --from=builder /build/katab-shared/dist ./node_modules/katab-shared/dist
COPY --from=builder /build/katab-shared/package.json ./node_modules/katab-shared/
EXPOSE 4100
CMD ["node", "dist/main.js"]
