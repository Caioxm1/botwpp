const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const WebSocket = require('ws');
const cron = require('node-cron');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbw0c_fcCboyB7V4ra2K6yNRroCeTTBun5UjxwvwRZwQaUIt81aIeHg8_BhWCv9MWn1gxQ/exec';
const GRUPO_ID = '120363403512588677@g.us';

const wss = new WebSocket.Server({ port: 8080 });
let sock;

// Configuração do gráfico
const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width: 800,
  height: 600,
  backgroundColour: 'white'
});

async function gerarGrafico(tipo, dados) {
  const configuration = {
    type: tipo,
    data: {
      labels: dados.labels,
      datasets: dados.datasets
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: dados.titulo, font: { size: 18 } },
        legend: { position: 'top' }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => 'R$ ' + value.toFixed(2) }
        }
      }
    }
  };

  return chartJSNodeCanvas.renderToBuffer(configuration);
}

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  sock = makeWASocket({ auth: state });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update;
    if (qr) {
      const qrLink = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`;
      console.log('QR Code:', qrLink);
      wss.clients.forEach(client => client.send(JSON.stringify({ qr: qrLink })));
    }
    if (connection === 'open') console.log('Bot conectado!');
    if (connection === 'close') setTimeout(iniciarBot, 5000);
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid !== GRUPO_ID) return;

    const texto = msg.message.conversation?.toLowerCase().trim();
    const remetente = msg.pushName || msg.key.participant;

    try {
      // Comando de ajuda
      if (texto === 'ajuda') {
        const mensagemAjuda = `📝 *Comandos Disponíveis*\n\n• resumo\n• meta\n• meta definir [valor] [dataInicio] [dataFim]\n• entrada [valor]\n• saída [valor]\n• média\n• grafico [bar|line] [entrada|saída|ambos] [diario|semanal|mensal]`;
        await sock.sendMessage(GRUPO_ID, { text: mensagemAjuda });
      }

      // Comando de gráfico
      else if (texto.startsWith('grafico')) {
        const partes = texto.split(' ');
        if (partes.length < 3) throw new Error("Formato: grafico [bar|line] [entrada|saída|ambos] [diario|semanal|mensal]");

        const tipoGrafico = partes[1];
        const tipoDados = partes[2];
        const periodo = partes[3] || "todos";

        const response = await axios.get(`${WEB_APP_URL}?action=getDadosGrafico&tipo=${tipoDados}&periodo=${periodo}`);
        const image = await gerarGrafico(tipoGrafico, response.data);
        await sock.sendMessage(GRUPO_ID, { image: image, caption: `📊 ${response.data.titulo}` });
      }

      // Demais comandos originais (mantidos sem alteração)
      else if (texto === 'resumo') {
        const resumo = await axios.get(WEB_APP_URL);
        await sock.sendMessage(GRUPO_ID, { text: resumo.data });
      }

      else if (texto.startsWith('meta definir')) {
        const partes = texto.split(' ');
        if (partes.length < 5) throw new Error("Formato: meta definir [valor] [dataInicio] [dataFim]");
        await axios.post(WEB_APP_URL, { action: "definirMeta", valor: partes[2], dataInicio: partes[3], dataFim: partes[4] });
        await sock.sendMessage(GRUPO_ID, { text: "✅ Meta definida!" });
      }

      else if (texto.startsWith('entrada')) {
        const valor = texto.split(' ')[1];
        await axios.post(WEB_APP_URL, { tipo: "Entrada", valor: valor, remetente: remetente });
        await sock.sendMessage(GRUPO_ID, { text: `✅ Entrada de R$${valor} registrada!` });
      }

      else if (texto.startsWith('saída')) {
        const valor = texto.split(' ')[1];
        await axios.post(WEB_APP_URL, { tipo: "Saída", valor: valor, remetente: remetente });
        await sock.sendMessage(GRUPO_ID, { text: `✅ Saída de R$${valor} registrada!` });
      }

      else if (texto === 'média') {
        const media = await axios.get(`${WEB_APP_URL}?action=mediaEntradas`);
        await sock.sendMessage(GRUPO_ID, { text: media.data });
      }

    } catch (error) {
      await sock.sendMessage(GRUPO_ID, { text: `❌ Erro: ${error.message}` });
    }
  });
}

// Agendamentos e servidor (mantidos originais)
app.post('/meta-atingida', async (req, res) => { /* ... */ });
cron.schedule('0 22 * * *', async () => { /* ... */ });
app.listen(3000, () => console.log("Servidor rodando!"));
iniciarBot();
