# Static files only: nginx serves the app under /pwa/. Override config.js with a bind mount.
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY pwa.html config.js manifest.json sw.js api.jsx app.jsx /usr/share/nginx/html/pwa/
COPY ui /usr/share/nginx/html/pwa/ui
COPY screens /usr/share/nginx/html/pwa/screens
COPY assets /usr/share/nginx/html/pwa/assets
