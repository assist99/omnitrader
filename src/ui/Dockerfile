FROM node:20-alpine
WORKDIR /app/src/ui
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]