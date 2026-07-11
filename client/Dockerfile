# ---------- Stage 1: build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# StellarWalletsKit membawa dependency transitif (mis. `usb`, untuk dukungan
# hardware wallet seperti Ledger) berupa native module. Alpine (musl libc)
# sering gagal compile package native seperti ini karena header kernel Linux
# tidak lengkap — pindah ke base Debian (glibc) jauh lebih kompatibel, dan
# kebanyakan native module sudah sediakan prebuilt binary untuk glibc.
# Layer ini tidak ikut ke image final (multi-stage build).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ linux-libc-dev \
    && rm -rf /var/lib/apt/lists/*

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
