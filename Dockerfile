FROM nginx:alpine

# Completely disable Nginx's own entrypoint scripts to prevent conflicts
RUN rm -rf /docker-entrypoint.d

# Copy application and our custom configuration files
COPY index.html /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/nginx.conf

# Create a simple file for the health check endpoint
RUN echo "OK" > /usr/share/nginx/html/health

# Expose the port Railway expects
EXPOSE 8080

# Start Nginx directly using our custom config and force it to stay in the foreground
CMD ["nginx", "-c", "/etc/nginx/nginx.conf", "-g", "daemon off;"]
