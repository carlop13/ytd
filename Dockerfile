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

# Paso 7: Exponer el puerto que usa nuestra app
EXPOSE 3000

# Paso 8: El comando para iniciar la aplicación cuando el contenedor arranque
CMD [ "node", "index.js" ]