const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const WebSocket = require('ws');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwwZ72y-oJvCp4aMeok7HYKVJ_eZxajzT2Oly7_9RoEqIJHI2b7UVJNEUNpRMel8azTPA/exec';
const GRUPO_ID = '120363403512588677@g.us';

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
      datasets: [{
        label: dados.label,
        data: dados.valores,
        backgroundColor: dados.cores,
        borderColor: dados.bordas,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: dados.titulo }
      }
    }
  };

  return chartJSNodeCanvas.renderToBuffer(configuration);
}

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ auth: state });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || !msg.key.remoteJid.includes(GRUPO_ID)) return;

    const texto = msg.message.conversation?.toLowerCase().trim();
    if (!texto) return;

    // Comando de gráfico
    if (texto.startsWith('grafico')) {
      const partes = texto.split(' ');
      if (partes.length < 3) return;

      const tipoGrafico = partes[1]; // bar, line, pie
      const tipoDados = partes[2].charAt(0).toUpperCase() + partes[2].slice(1).toLowerCase();

      try {
        const response = await axios.get(`${WEB_APP_URL}?action=getDadosGrafico&tipo=${tipoDados}`, {
          timeout: 15000
        });

        if (!response.data.labels || response.data.labels.length === 0) {
          await sock.sendMessage(GRUPO_ID, { text: "⚠️ Nenhum dado encontrado para o período!" });
          return;
        }

        const image = await gerarGrafico(tipoGrafico, response.data);
        await sock.sendMessage(GRUPO_ID, { 
          image: image, 
          caption: `📊 ${response.data.titulo}\n🔢 Registros: ${response.data.valores.length}`
        });

      } catch (error) {
        console.error('Erro detalhado:', error);
        await sock.sendMessage(GRUPO_ID, { 
          text: `❌ Falha: ${error.response?.data?.error || error.message}`
        });
      }
    }
  });
}

app.listen(3000, () => console.log('Servidor rodando na porta 3000'));
iniciarBot();