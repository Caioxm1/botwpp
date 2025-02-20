const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const WebSocket = require('ws');
const cron = require('node-cron');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxMy21W0FffgVPQfaDqAbP-TdsmDE3iM7_rJUkaypKcKTOU6jsqDlZBhAL7CgObzddf/exec';
const GRUPO_ID = '120363403512588677@g.us'; // ID do grupo do WhatsApp

const wss = new WebSocket.Server({ port: 8080 });
let sock;

// Função para gerar gráfico e salvar como imagem
async function gerarGrafico(dados, periodo) {
  const width = 800; // Largura da imagem
  const height = 400; // Altura da imagem
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const configuration = {
    type: 'bar',
    data: {
      labels: dados.labels,
      datasets: [{
        label: `Valores (${periodo})`,
        data: dados.valores,
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
      }],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
        },
      },
    },
  };

  const image = await chartJSNodeCanvas.renderToBuffer(configuration);
  return image;
}

// Função para obter dados da planilha
async function obterDadosGrafico(periodo) {
  try {
    const resposta = await axios.get(`${WEB_APP_URL}?action=dadosGrafico&periodo=${periodo}`);
    return resposta.data;
  } catch (error) {
    console.error("Erro ao obter dados do gráfico:", error);
    return null;
  }
}

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  sock = makeWASocket({ auth: state });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update;
    if (qr) {
      const qrLink = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`;
      console.log('Escaneie o QR code abaixo para autenticar o bot:');
      console.log(qrLink);

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ qr: qrLink }));
        }
      });
    }
    if (connection === 'open') {
      console.log('Bot conectado ao WhatsApp!');
    } else if (connection === 'close') {
      console.log('Conexão fechada, tentando reconectar...');
      setTimeout(iniciarBot, 5000);
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.remoteJid !== GRUPO_ID) return;

    const texto = msg.message.conversation?.toLowerCase().trim();
    const remetente = msg.pushName || msg.key.participant;

    // Comando de gráfico semanal
    if (texto === "gráfico semanal" || texto === "grafico semanal") {
      try {
        const dados = await obterDadosGrafico('semanal');
        if (!dados) {
          await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao gerar gráfico semanal." });
          return;
        }

        const imagem = await gerarGrafico(dados, 'Semanal');
        await sock.sendMessage(GRUPO_ID, { image: imagem, caption: "📊 Gráfico Semanal" });
      } catch (error) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao gerar gráfico semanal." });
      }
      return;
    }

    // Comando de gráfico mensal
    if (texto === "gráfico mensal" || texto === "grafico mensal") {
      try {
        const dados = await obterDadosGrafico('mensal');
        if (!dados) {
          await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao gerar gráfico mensal." });
          return;
        }

        const imagem = await gerarGrafico(dados, 'Mensal');
        await sock.sendMessage(GRUPO_ID, { image: imagem, caption: "📊 Gráfico Mensal" });
      } catch (error) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao gerar gráfico mensal." });
      }
      return;
    }

    // ... (restante dos comandos existentes)
  });

  console.log("Bot iniciado!");
}

// Endpoint para receber notificação da meta atingida
app.post('/meta-atingida', async (req, res) => {
  const mensagem = req.body.mensagem;
  if (!mensagem) {
    return res.status(400).send("Mensagem inválida");
  }

  try {
    await sock.sendMessage(GRUPO_ID, { text: mensagem });
    res.status(200).send("Mensagem enviada com sucesso");
  } catch (error) {
    res.status(500).send("Erro ao enviar mensagem");
  }
});

// Agendamento de mensagens automáticas
cron.schedule('0 22 * * *', async () => { // Todos os dias às 22h
  try {
    const resumoDiario = await axios.get(`${WEB_APP_URL}?action=resumoDiario`);
    await sock.sendMessage(GRUPO_ID, { text: resumoDiario.data });
  } catch (error) {
    console.error("Erro no resumo diário:", error);
  }
});

// Iniciar o servidor Express e o bot
app.listen(3000, () => console.log("Servidor rodando na porta 3000"));
iniciarBot();