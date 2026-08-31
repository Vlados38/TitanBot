FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Fontconfig + системный fallback-шрифт
RUN apk add --no-cache \
    fontconfig \
    font-dejavu \
    ttf-liberation

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Fontconfig знает о нашем кастомном шрифте
ENV FONTCONFIG_PATH=/usr/src/app/fontconfig
ENV FONTCONFIG_FILE=/usr/src/app/fontconfig/fonts.conf

EXPOSE 3000

CMD ["npm", "start"]
