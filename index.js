const express = require('express');
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
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

//http://localhost:3000/download?url=https://youtu.be/ilw-qmqZ5zY?si=ueBMauQefJYNxOD1