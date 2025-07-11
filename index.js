/*const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

const getYtDlpMetadata = (videoUrl) => {
  return new Promise((resolve, reject) => {
    const process = spawn('yt-dlp', [
      videoUrl,
      '--dump-single-json',
      '--no-warnings',
    ]);

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => (stdout += data.toString()));
    process.stderr.on('data', (data) => (stderr += data.toString()));

    process.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject(new Error(`Error al parsear JSON de yt-dlp: ${e.message}`));
        }
      } else {
        reject(new Error(`yt-dlp para metadatos falló con código ${code}:\n${stderr}`));
      }
    });

    process.on('error', (err) => reject(err));
  });
};

app.get('/download', async (req, res) => {
  const videoUrl = req.query.url;

  if (!videoUrl) {
    return res.status(400).json({ error: 'Falta la URL del video' });
  }

  try {
    console.log('Obteniendo metadatos usando el comando yt-dlp global...');
    const metadata = await getYtDlpMetadata(videoUrl);
    
    const videoTitle = metadata.title.replace(/[^a-z0-9_.-]/gi, '-').toLowerCase();
    const filename = `${videoTitle}.mp4`;
    console.log(`Metadatos OK. Iniciando descarga de: ${filename}`);

    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    res.header('Content-Type', 'video/mp4');

    // --- ESTE ES EL CAMBIO FINAL Y MÁS IMPORTANTE ---
    const downloadProcess = spawn('yt-dlp', [
      videoUrl,
      // Pide el mejor video MP4 con códec H.264 (avc1) + el mejor audio.
      // Esto evita el problemático códec AV1.
      '-f', 'bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '-o', '-', 
    ]);

    downloadProcess.stdout.pipe(res);

    downloadProcess.stderr.on('data', (data) => {
      // Agregamos un indicador para saber si es progreso de ffmpeg
      const logLine = data.toString();
      if (logLine.startsWith('frame=')) {
        process.stdout.write(`ffmpeg progress: ${logLine.trim()}\r`); // Escribe en la misma línea
      } else {
        console.error(`yt-dlp stderr: ${logLine}`);
      }
    });

    downloadProcess.on('error', (error) => {
      console.error('Error al iniciar la descarga:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'No se pudo iniciar la descarga.' });
      }
    });

    downloadProcess.on('close', (code) => {
      console.log(`\nProceso de descarga finalizado con código ${code}.`);
      if (!res.writableEnded) {
        res.end();
      }
    });

    req.on('close', () => {
      console.log('El cliente cerró la conexión, deteniendo la descarga.');
      downloadProcess.kill();
    });

  } catch (err) {
    console.error('Fallo general en la ruta /download:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'No se pudo procesar el video.', details: err.message });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado y escuchando en el puerto ${PORT}`);
});*/

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// --- AUTENTICACIÓN OAUTH ---
// Esta es la ruta donde guardaremos el token de autenticación de Google.
// El directorio /tmp/ es escribible en nuestro contenedor.
const GOOGLE_AUTH_TOKEN_PATH = '/tmp/google_auth_token.json';

// Función para obtener metadatos.
const getYtDlpMetadata = (videoUrl) => {
  return new Promise((resolve, reject) => {
    const args = [
      videoUrl,
      // Le decimos a yt-dlp que use el token de autenticación si existe.
      '--google-auth', GOOGLE_AUTH_TOKEN_PATH,
      '--dump-single-json',
      '--no-warnings',
    ];

    const process = spawn('yt-dlp', args);

    let stdout = '';
    let stderr = '';
    process.stdout.on('data', (data) => (stdout += data.toString()));
    process.stderr.on('data', (data) => (stderr += data.toString()));
    process.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject(new Error(`Error al parsear JSON: ${e.message}`));
        }
      } else {
        reject(new Error(`yt-dlp (metadatos) falló con código ${code}:\n${stderr}`));
      }
    });
    process.on('error', (err) => reject(err));
  });
};

// Ruta para iniciar el proceso de autenticación.
// SOLO NECESITAS LLAMAR A ESTA RUTA UNA VEZ.
app.get('/auth', (req, res) => {
  console.log('Iniciando proceso de autenticación de Google...');
  
  const authProcess = spawn('yt-dlp', ['--google-auth', GOOGLE_AUTH_TOKEN_PATH]);

  let responseSent = false;

  authProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`yt-dlp auth stdout: ${output}`);
    // yt-dlp pedirá un código de dispositivo.
    if (output.includes('go to https://www.google.com/device') && !responseSent) {
      res.send(output); // Envía las instrucciones al navegador/Postman.
      responseSent = true;
    }
  });

  authProcess.stderr.on('data', (data) => {
    console.error(`yt-dlp auth stderr: ${data}`);
  });

  authProcess.on('close', (code) => {
    console.log(`Proceso de autenticación finalizado con código ${code}.`);
    if (code === 0 && !responseSent) {
      res.send('Autenticación completada con éxito. El token ha sido guardado en el servidor.');
    } else if (code !== 0 && !responseSent) {
      res.status(500).send('Falló el proceso de autenticación.');
    }
  });
});


app.get('/download', async (req, res) => {
  let videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).json({ error: 'Falta la URL del video' });

  try {
    const urlObject = new URL(videoUrl);
    urlObject.search = '';
    videoUrl = urlObject.toString();
    console.log(`URL limpiada: ${videoUrl}`);
  } catch (e) {
      return res.status(400).json({ error: 'URL no válida.' });
  }

  try {
    console.log('Obteniendo metadatos...');
    const metadata = await getYtDlpMetadata(videoUrl);
    const videoTitle = metadata.title.replace(/[^a-z0-9_.-]/gi, '-').toLowerCase();
    const filename = `${videoTitle}.mp4`;
    console.log(`Metadatos OK. Iniciando descarga: ${filename}`);
    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    res.header('Content-Type', 'video/mp4');

    const downloadArgs = [
        videoUrl,
        '--google-auth', GOOGLE_AUTH_TOKEN_PATH,
        '-f', 'bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '-o', '-',
    ];

    const downloadProcess = spawn('yt-dlp', downloadArgs);
    downloadProcess.stdout.pipe(res);
    downloadProcess.stderr.on('data', (data) => {
        const logLine = data.toString();
        if (!logLine.startsWith('frame=')) {
          console.error(`yt-dlp stderr: ${logLine.trim()}`);
        }
    });
    downloadProcess.on('error', (err) => console.error('Error en el proceso de descarga:', err));
    downloadProcess.on('close', (code) => console.log(`Descarga finalizada con código ${code}.`));
    req.on('close', () => downloadProcess.kill());

  } catch (err) {
    console.error('Fallo en /download:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'No se pudo procesar el video.', details: err.message });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado y escuchando en el puerto ${PORT}`);
});

//http://localhost:3000/download?url=https://youtu.be/ilw-qmqZ5zY?si=ueBMauQefJYNxOD1
//https://youtube-downloader-api-vpba.onrender.com/download?url=https://youtu.be/eG-5eHMLJZk?si=xdje17HT-3TNL97L
//http://20.84.56.197:3000/download?url=https://youtu.be/fhuhIIt7-70?si=ciOXILt2fSd0jU6a
/*
ssh -i "C:/tools/ytd-api-server_key.pem" carlo@20.84.56.197

ver si corre el contenedor:
docker ps

Ver problemas en el log de la api:
docker logs api-container

Ver si el servidor responde localmente:
curl http://localhost:3000/download

Reiniciar contenedor:
docker restart api-container

Entrar al contenedor:
docker exec -it api-container bash


*/