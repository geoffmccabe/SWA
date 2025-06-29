# Use the official, lightweight Nginx image
FROM nginx:stable-alpine

# Copy your single index.html file into the web server's public directory
COPY index.html /usr/share/nginx/html/index.html

# Expose port 80 (the default Nginx port)
EXPOSE 80

# This command forces Nginx to run in the foreground, which is required for containers.
CMD ["nginx", "-g", "daemon off;"]
