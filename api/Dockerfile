FROM node:20
WORKDIR /app
COPY api/package*.json ./
RUN npm install
COPY db_processor/src/prisma ./prisma/
RUN npx prisma generate
COPY api/ .
RUN npm install -g typescript
RUN npx tsc -b
EXPOSE 3006
CMD ["node", "dist/index.js"]
