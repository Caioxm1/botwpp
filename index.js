const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const WebSocket = require('ws');
const cron = require('node-cron');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbw2CCn-YOFf8fRrCo2HnMkMOh5bRkuPXkXeXCmcAfIdBFZFeQuP6V4sBQKdUETunBVmnw/exec';
const GRUPO_ID = '120363403512588677@g.us';

const wss = new WebSocket.Server({ port: 8080 });

async function obterMeta() {
  try {
    const resposta = await axios.get(`${WEB_APP_URL}?action=meta`, { family: 4 });
    return resposta.data;
  } catch (error) {
    console.error("Erro ao obter informações da meta:", error.message);
    return null;
  }
}

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ auth: state });

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
      console.log('✅ Bot conectado ao WhatsApp!');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.remoteJid !== GRUPO_ID) return;

    const texto = msg.message.conversation?.toLowerCase().trim();
    const remetente = msg.pushName || msg.key.participant;

    if (texto === "meta") {
      const metaData = await obterMeta();
      if (metaData) {
        const metaFormatada = `🎯 *Meta*:\n📅 Período: ${metaData.dataInicio} até ${metaData.dataFim}\n💰 Valor: R$${metaData.valor.toFixed(2)}`;
        await sock.sendMessage(GRUPO_ID, { text: metaFormatada });
      } else {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao obter informações da meta." });
      }
      return;
    }
  });

  console.log("Bot iniciado!");
}

app.listen(3000, '0.0.0.0', async () => {
  console.log(`🚀 Servidor rodando na porta 3000`);
  iniciarBot();
});
