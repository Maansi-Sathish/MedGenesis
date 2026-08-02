# Build Stage
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Render's dashboard env vars are NOT automatically visible during `docker build`
# unless declared here with ARG, then exposed to the build via ENV.
# Vite only reads VITE_* vars at build time, so this must happen before `npm run build`.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# Production Nginx Stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]