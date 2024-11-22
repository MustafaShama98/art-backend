FROM ubuntu:latest
LABEL authors="mostf"
FROM node:20.18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "index.js"]
ENTRYPOINT ["top", "-b"]