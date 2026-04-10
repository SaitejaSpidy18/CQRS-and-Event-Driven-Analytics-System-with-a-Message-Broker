FROM node:18-alpine
RUN apk add --no-cache curl
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY src/ ./src/
EXPOSE 8081
CMD ["node", "src/index.js"]
