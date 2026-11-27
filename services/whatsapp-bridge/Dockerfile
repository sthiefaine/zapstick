# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3001 \
    NPM_CONFIG_CACHE=/tmp/npm-cache \
    NODE_OPTIONS=--max-old-space-size=384
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 zapstick \
    && useradd --system --uid 1001 --gid zapstick --home-dir /app zapstick \
    && install -d -o zapstick -g zapstick -m 0700 /data/auth /data/transfers
RUN node --input-type=module -e "import {execFileSync} from 'node:child_process'; const encoders=execFileSync('ffmpeg',['-hide_banner','-encoders'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}); if(!encoders.split(/\\s+/).includes('libopus')) throw new Error('Missing FFmpeg encoder: libopus')"
COPY --from=dependencies --chown=zapstick:zapstick /app/node_modules ./node_modules
RUN node --input-type=module -e "import sharp from 'sharp'; if (!sharp.format.webp.input.buffer || !sharp.format.webp.output.buffer) throw new Error('Missing native WebP codec')"
COPY --chown=zapstick:zapstick package.json package-lock.json ./
COPY --chown=zapstick:zapstick src ./src
USER zapstick
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/main.mjs"]
