# Use a Node.js base image
FROM node:18-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Set up the working directory
WORKDIR /app

# Copy the backend's package files
COPY backend/package*.json ./

# Install backend dependencies
RUN npm install --production

# Copy the ENTIRE repository content into the container
COPY . .

# Expose the port the app will run on
EXPOSE 3000

# Define the command to start the app, pointing to the backend's index.js
CMD ["node", "backend/index.js"]
