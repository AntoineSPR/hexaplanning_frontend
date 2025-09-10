FROM node:22 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM build AS production
COPY . .
RUN npm run build:production

FROM nginx:alpine as prod-runtime
COPY --from=production /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]