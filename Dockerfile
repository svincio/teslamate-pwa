# The browser gets pre-compiled files (build.js): no Babel at start-up. nginx serves the app under /pwa/.
# Override config.js with a bind mount.
# The build stage runs on the builder's own platform (its output is plain JS), so arm64 needs no QEMU.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY build.js pwa.html config.js manifest.json sw.js i18n.jsx api.jsx app.jsx ./
COPY ui ui
COPY screens screens
COPY assets assets
RUN node build.js

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html/pwa/
