# Backend Dockerfile (Node.js)
FROM node:20

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application files
COPY server.js ./
COPY db.js ./

# Runtime env (overridable via docker-compose)
ENV PORT=3000
ENV THRESHOLD=0.8
ENV ML_URL=http://ml-service:8000/score
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "server.js"]
