# Use the official lightweight Nginx image
FROM nginx:alpine

# Copy index.html
COPY index.html /usr/share/nginx/html/

# Override default Nginx config to use port 8080
RUN echo "events {} http { server { listen 8080; root /usr/share/nginx/html; location / { try_files \$uri /index.html; } } }" > /etc/nginx/nginx.conf

# Health check endpoint (optional but recommended)
RUN echo "OK" > /usr/share/nginx/html/health

# Explicitly expose 8080 (Railway's default web port)
EXPOSE 8080

# Keep Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
