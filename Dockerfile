# Use the official, lightweight Nginx image
FROM nginx:stable-alpine

# Copy your single index.html file into the web server's public directory
COPY index.html /usr/share/nginx/html/index.html

# Expose port 80, which is the default port Nginx listens on
EXPOSE 80
