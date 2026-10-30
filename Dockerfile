FROM nginx:1.27-alpine
COPY index.html styles.css app.js config.js /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
ENV BACKEND_URL=http://host.docker.internal:8080
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1
