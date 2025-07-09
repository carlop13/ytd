# Paso 1: Empezar con una imagen oficial y ligera de Node.js
FROM node:20-slim

# Paso 2: Instalar las dependencias del sistema operativo (ffmpeg, python, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Paso 3: Instalar la última versión de yt-dlp usando pip, rompiendo la protección del sistema.
RUN pip3 install -U yt-dlp --break-system-packages

# Paso 4: Crear y establecer el directorio de trabajo para nuestra app
WORKDIR /usr/src/app

# Paso 5: Copiar los archivos de dependencias de Node.js y instalarlas
COPY package*.json ./
RUN npm install

# Paso 6: Copiar el resto del código de nuestra aplicación
COPY . .

# --- PASO NUEVO Y CLAVE ---
# Paso 6.5: Crear un script de entrada que copie el archivo de cookies a un lugar escribible
# y luego ejecute la aplicación.
RUN echo '#!/bin/sh' > /usr/src/app/entrypoint.sh && \
    echo 'if [ -f /etc/secrets/cookies.txt ]; then' >> /usr/src/app/entrypoint.sh && \
    echo '  cp /etc/secrets/cookies.txt /tmp/cookies.txt' >> /usr/src/app/entrypoint.sh && \
    echo 'fi' >> /usr/src/app/entrypoint.sh && \
    echo 'exec node index.js' >> /usr/src/app/entrypoint.sh && \
    chmod +x /usr/src/app/entrypoint.sh

# Paso 7: Exponer el puerto que usa nuestra app
EXPOSE 3000

# Paso 8: El comando para iniciar la aplicación ahora es nuestro script de entrada
CMD [ "/usr/src/app/entrypoint.sh" ]