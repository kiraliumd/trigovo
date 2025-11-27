FROM mcr.microsoft.com/playwright:v1.48.0-focal

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy source code
COPY . .

# Expose port 8080 (Cloud Run default)
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
