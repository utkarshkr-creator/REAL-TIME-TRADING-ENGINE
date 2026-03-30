FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm install -g typescript
RUN npm run build
CMD ["sh", "-c", "node dist/seed-db.js && node dist/index.js"]
