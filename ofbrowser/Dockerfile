FROM mcr.microsoft.com/playwright:v1.56.0-jammy
WORKDIR /app
RUN npm i playwright@1.56.0
COPY . ./
ENV PORT=3100
CMD ["sh", "start.sh"]