FROM node:20-alpine
RUN mkdir -p /app/src/engine/logs
WORKDIR /app/src/engine
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3001
CMD ["node", "servicesLauncher.js"]