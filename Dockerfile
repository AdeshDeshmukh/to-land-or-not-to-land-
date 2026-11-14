# Stage 1: Build the React + TypeScript frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency definitions
COPY client/package.json client/package-lock.json ./

# Install dependencies cleanly
RUN npm ci

# Copy client code and build
COPY client/ ./
RUN npm run build

# Stage 2: High-performance Nginx production web server
FROM nginx:alpine AS runner

# Custom Nginx configuration with SPA fallback & Gzip
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 3000

# Run Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
