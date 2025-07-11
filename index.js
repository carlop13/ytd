const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const COOKIE_FILE_PATH = '/tmp/cookies.txt';

app.use(cors());

const buildYtDlpArgs = (baseArgs) => {
  const finalArgs = [...baseArgs];
  
  if (fs.existsSync(COOKIE_FILE_PATH)) {
    console.log(`Usando archivo de cookies desde: ${COOKIE_FILE_PATH}`);

    finalArgs.unshift('--cookies', COOKIE_FILE_PATH);
  } else {
    console.log('Archivo de cookies no encontrado, procediendo sin él (entorno local).');
  }
  return finalArgs;
};

const getYtDlpMetadata = (videoUrl) => {
  return new Promise((resolve, reject) => {
    const args = buildYtDlpArgs([
      videoUrl,
      '--dump-single-json',
      '--no-warnings',
    ]);

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
          reject(new Error(`Error al parsear JSON de yt-dlp: ${e.message}\nJSON recibido: ${stdout}`));
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

    const downloadArgs = buildYtDlpArgs([
      videoUrl,
      '-f', 'bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '-o', '-', 
    ]);
    
    const downloadProcess = spawn('yt-dlp', downloadArgs);

    downloadProcess.stdout.pipe(res);

    downloadProcess.stderr.on('data', (data) => {
        const logLine = data.toString();
        if (!logLine.startsWith('frame=')) {
          console.error(`yt-dlp stderr: ${logLine.trim()}`);
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
});

//http://localhost:3000/download?url=https://youtu.be/ilw-qmqZ5zY?si=ueBMauQefJYNxOD1
//https://youtube-downloader-api-vpba.onrender.com/download?url=https://youtu.be/eG-5eHMLJZk?si=xdje17HT-3TNL97L
//http://20.84.56.197:3000/download?url=https://youtu.be/fhuhIIt7-70?si=ciOXILt2fSd0jU6a
