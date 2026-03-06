FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY prisma ./prisma/
RUN npx prisma generate
COPY . .
RUN npm install -g typescript
RUN npx tsc -b
EXPOSE 3006
CMD ["node", "dist/index.js"]
