# ---------- Stage 1: build ----------
FROM node:22-alpine AS build
WORKDIR /app

# StellarWalletsKit membawa dependency transitif (mis. `usb`, untuk dukungan
# hardware wallet seperti Ledger) yang perlu dikompilasi lewat node-gyp.
# Alpine tidak punya Python/build tools secara default — tambahkan di sini.
# Layer ini tidak ikut ke image final (multi-stage build).
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# VITE_AI_API_URL di-inject saat build karena Vite meng-embed env var
# ke bundle statis. Override lewat --build-arg saat docker build,
# atau lewat docker-compose build args.
ARG VITE_AI_API_URL=http://localhost:3001
ENV VITE_AI_API_URL=$VITE_AI_API_URL

RUN npm run build

# ---------- Stage 2: serve ----------
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
