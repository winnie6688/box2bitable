FROM node:20-alpine

WORKDIR /app/server

COPY server/package.json ./
RUN npm install --omit=dev

COPY server ./

ENV NODE_ENV=production
ENV PORT=80
EXPOSE 80

CMD ["npm", "start"]
