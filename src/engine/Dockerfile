FROM node:20-alpine
RUN mkdir -p /app/src/engine/logs
WORKDIR /app/src/engine
COPY package*.json ./
# Copy config to /app/config
COPY ../config /app/config/
RUN npm install
COPY . .
EXPOSE 3002
CMD ["node", "servicesLauncher.js"]