FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache ffmpeg

# Copy package files first (for caching)
COPY package*.json ./

# Install Node dependencies
RUN npm install --production

# Copy all files
COPY . .

EXPOSE 8080

CMD ["node", "index.js"]
