FROM nginx:alpine

# Copy application and configuration files
COPY index.html /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/nginx.conf

# Create health check endpoint file
RUN echo "OK" > /usr/share/nginx/html/health

# Expose port (Railway uses 8080 by default)
EXPOSE 8080

# Start Nginx in foreground with debug logging
CMD ["nginx", "-g", "daemon off;", "-c", "/etc/nginx/nginx.conf"]
