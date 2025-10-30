// --- DEPENDENCIES ---
const express = require('express');
const mqtt = require('mqtt');
const bodyParser = require('body-parser');
const cors = require('cors'); // Panggil paket CORS

// Tambahkan modul untuk HTTPS dan File System (untuk membaca sertifikat)
const https = require('https'); 
const fs = require('fs');      

// --- KONFIGURASI SERVER ---
const app = express();
const port = 4000;
// Port untuk HTTPS. Server akan berjalan di https://localhost:4000

// --- Konfigurasi CORS ---
// Mengizinkan semua (*) origin untuk tujuan pengujian lokal
const allowedOrigin = '*'; 
const corsOptions = {
    origin: allowedOrigin,
    methods: ['GET', 'POST'], 
    allowedHeaders: ['Content-Type'],
    credentials: true
};
app.use(cors(corsOptions));  

// Middleware untuk mem-parsing JSON dari body request
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- KONFIGURASI MQTT ---
// Ganti dengan IP lokal PC Anda (tempat Broker MQTT berjalan)
const MQTT_BROKER_HOST = '192.168.100.35'; 
const MQTT_PORT = 1883;

// Topic yang akan di-publish/dikirim ke ESP8266
const PUBLISH_TOPIC = 'lamp';

// --- INISIALISASI KONEKSI MQTT ---
const client = mqtt.connect(`mqtt://${MQTT_BROKER_HOST}:${MQTT_PORT}`);

client.on('connect', () => {
    console.log('Terhubung ke Broker MQTT');
    // Opsional: Berlangganan ke topik 'response' (jika ESP8266 mengirim balik status)
    // client.subscribe('response'); 
});

client.on('error', (err) => {
    console.error(`Koneksi MQTT Gagal: ${err.message}`);
    // Coba sambungkan kembali setelah beberapa waktu
    setTimeout(() => {
        client.reconnect();
    }, 5000); 
});

// --- DEFINISI ROUTE HTTP (API ENDPOINT) ---

/**
 * Endpoint GET sederhana untuk memeriksa status kesehatan (Health Check) server.
 */
app.get('/api/health', (req, res) => {
    const isMqttConnected = client.connected;
    
    if (isMqttConnected) {
        res.status(200).json({ 
            status: 'ok', 
            service: 'Express API Gateway',
            mqtt_status: 'Connected',
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(503).json({ 
            status: 'error', 
            service: 'Express API Gateway',
            mqtt_status: 'Disconnected',
            timestamp: new Date().toISOString(),
            error_details: 'Failed to connect to MQTT broker.'
        });
    }
});


/**
 * Endpoint POST untuk memublikasikan status ke topik MQTT.
 * Contoh Body JSON: {"status": "on"} atau {"status": "off"}
 */
app.post('/api/publish/:topic', (req, res) => {
    const topic = req.params.topic;
    const { status } = req.body;
    
    if (!status || (status.toLowerCase() !== 'on' && status.toLowerCase() !== 'off')) {
        return res.status(400).json({ error: 'Permintaan tidak valid. Diperlukan body JSON: {"status": "on" atau "off"}' });
    }

    if (!client.connected) {
        return res.status(503).json({ error: 'Broker MQTT tidak terhubung. Coba lagi.' });
    }

    // Payload JSON yang dikirim ke ESP8266 (misal: '{"status":"on"}')
    const payload = JSON.stringify({
        topic: topic, 
        status: status.toUpperCase() 
    });

    // Kirim pesan ke Broker MQTT
    client.publish(topic, payload, (err) => {
        if (err) {
            console.error(`Gagal memublikasikan pesan ke ${topic}: ${err}`);
            return res.status(500).json({ error: 'Gagal mengirim pesan MQTT.' });
        }
        
        console.log(`[Express -> MQTT] Publikasi pesan ke topik '${topic}': ${payload}`);
        res.json({ message: 'Command succes to  via MQTT', topic: topic, status: status.toUpperCase() });
    });
});


// --- JALANKAN SERVER EXPRESS DENGAN HTTPS ---

// Opsi untuk HTTPS: baca kunci dan sertifikat
const httpsOptions = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

// Gunakan https.createServer untuk membuat server HTTPS
https.createServer(httpsOptions, app).listen(port, () => {
    console.log(`Server Express berjalan di HTTPS: https://localhost:${port}`);
    console.log(`CORS diizinkan untuk origin: ${allowedOrigin}`);
    console.log(`PERHATIAN: Menggunakan sertifikat self-signed.`);
    console.log("Pastikan Anda menerima peringatan keamanan di browser sebelum mengakses front-end!");
});

// Catatan: Anda perlu menginstal dependencies ini:
// npm install express mqtt body-parser cors
