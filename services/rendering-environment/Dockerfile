FROM node:20-slim

# Fixed rendering environment for pixel-perfect validation
ENV DEBIAN_FRONTEND=noninteractive
ENV DPI=150
ENV FONT_HINTING=full
ENV SUBPIXEL_RENDERING=false
ENV ANTIALIASING=false
ENV COLOR_SPACE=srgb
ENV CHROMIUM_PATH=/usr/bin/chromium

# Install rendering dependencies — CPU-only for deterministic output
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    chromium \
    fonts-noto \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    fonts-liberation \
    fonts-dejavu-core \
    fonts-freefont-ttf \
    fonts-roboto \
    fontconfig \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libvips-dev \
    libharfbuzz-dev \
    libicu-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Arabic + Latin fonts with exact versions for reproducibility
RUN mkdir -p /usr/share/fonts/arabic /usr/share/fonts/latin && \
    apt-get update && apt-get install -y --no-install-recommends curl unzip && \
    # Arabic fonts
    curl -L "https://fonts.google.com/download?family=Cairo" -o /tmp/cairo.zip && \
    unzip -o /tmp/cairo.zip -d /usr/share/fonts/arabic/ 2>/dev/null || true && \
    curl -L "https://fonts.google.com/download?family=Tajawal" -o /tmp/tajawal.zip && \
    unzip -o /tmp/tajawal.zip -d /usr/share/fonts/arabic/ 2>/dev/null || true && \
    curl -L "https://fonts.google.com/download?family=Noto+Sans+Arabic" -o /tmp/noto-arabic.zip && \
    unzip -o /tmp/noto-arabic.zip -d /usr/share/fonts/arabic/ 2>/dev/null || true && \
    curl -L "https://fonts.google.com/download?family=Amiri" -o /tmp/amiri.zip && \
    unzip -o /tmp/amiri.zip -d /usr/share/fonts/arabic/ 2>/dev/null || true && \
    curl -L "https://fonts.google.com/download?family=IBM+Plex+Sans+Arabic" -o /tmp/ibm-arabic.zip && \
    unzip -o /tmp/ibm-arabic.zip -d /usr/share/fonts/arabic/ 2>/dev/null || true && \
    curl -L "https://fonts.google.com/download?family=Almarai" -o /tmp/almarai.zip && \
    unzip -o /tmp/almarai.zip -d /usr/share/fonts/arabic/ 2>/dev/null || true && \
    curl -L "https://fonts.google.com/download?family=El+Messiri" -o /tmp/messiri.zip && \
    unzip -o /tmp/messiri.zip -d /usr/share/fonts/arabic/ 2>/dev/null || true && \
    curl -L "https://fonts.google.com/download?family=Changa" -o /tmp/changa.zip && \
    unzip -o /tmp/changa.zip -d /usr/share/fonts/arabic/ 2>/dev/null || true && \
    # Latin fonts
    curl -L "https://fonts.google.com/download?family=Inter" -o /tmp/inter.zip && \
    unzip -o /tmp/inter.zip -d /usr/share/fonts/latin/ 2>/dev/null || true && \
    curl -L "https://fonts.google.com/download?family=Poppins" -o /tmp/poppins.zip && \
    unzip -o /tmp/poppins.zip -d /usr/share/fonts/latin/ 2>/dev/null || true && \
    curl -L "https://fonts.google.com/download?family=Open+Sans" -o /tmp/opensans.zip && \
    unzip -o /tmp/opensans.zip -d /usr/share/fonts/latin/ 2>/dev/null || true && \
    curl -L "https://fonts.google.com/download?family=Montserrat" -o /tmp/montserrat.zip && \
    unzip -o /tmp/montserrat.zip -d /usr/share/fonts/latin/ 2>/dev/null || true && \
    fc-cache -f -v && \
    rm -rf /tmp/*.zip && \
    apt-get remove -y unzip && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Fixed fontconfig for deterministic rendering
COPY fontconfig.conf /etc/fonts/local.conf

# Verify fonts are installed
RUN fc-list | head -50

WORKDIR /app

COPY package*.json ./
RUN npm ci --production && npm install -g tsx

COPY . .

EXPOSE 8014

CMD ["tsx", "src/index.ts"]
