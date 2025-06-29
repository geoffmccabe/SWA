# Use an official Node.js image that gives us a full Linux environment
FROM node:18-slim

# Update package lists and install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Create and set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install the application's dependencies
RUN npm install --production

# Copy the rest of your application's code into the container
COPY . .

# Tell Docker that the container will listen on this port
EXPOSE 3000

# The command to run when the container starts
CMD ["node", "index.js"]
