FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="3CX Call Monitoring Analyzer"
LABEL org.opencontainers.image.description="Standalone browser-based analyzer for 3CX Call Monitor Event ID 10034 exports"
LABEL org.opencontainers.image.version="0.4.0"

RUN rm -rf /usr/share/nginx/html/*

COPY public/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1
