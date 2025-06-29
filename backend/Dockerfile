# Use a Node.js base image
FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y ffmpeg

# Set the working directory inside the container
WORKDIR /app

# Copy only the package files for the backend to leverage caching
COPY backend/package*.json ./

# Install backend dependencies
RUN npm install --production

# Copy the backend source code into a /backend directory inside the container
COPY backend/ ./backend

# Copy the frontend index.html from the root of the repo into the container
COPY index.html ./

# Expose the port the app will run on
EXPOSE 8080

# The command to run when the container starts
CMD ["node", "backend/index.js"]
