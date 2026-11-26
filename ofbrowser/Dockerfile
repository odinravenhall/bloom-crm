FROM mcr.microsoft.com/playwright:v1.56.0-jammy
WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" tzdata x11vnc novnc websockify && rm -rf /var/lib/apt/lists/*
RUN npm i playwright@1.56.0
COPY . ./
ENV PORT=3100
CMD ["sh", "start.sh"]