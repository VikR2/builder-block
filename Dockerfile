FROM node:22-bookworm-slim AS build

ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/ui

COPY ui/package*.json ./
RUN npm ci

COPY ui ./
COPY scripts /app/scripts

RUN npm run build \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:${PATH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates \
  && python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.render.txt /tmp/requirements.render.txt
RUN /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.render.txt \
  && rm /tmp/requirements.render.txt

WORKDIR /app

COPY scripts /app/scripts

WORKDIR /app/ui
COPY --from=build /app/ui/package*.json ./
COPY --from=build /app/ui/next.config.js ./next.config.js
COPY --from=build /app/ui/public ./public
COPY --from=build /app/ui/.next ./.next
COPY --from=build /app/ui/node_modules ./node_modules

RUN mkdir -p /app/data/post-uploads /app/data/scripts-output

EXPOSE 3000

CMD ["npm", "start"]

