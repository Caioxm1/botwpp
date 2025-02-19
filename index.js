const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const WebSocket = require('ws');
const cron = require('node-cron');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzLdyZnqjXg2nLGH26ygl7-0YP2tqXuW01eDH_jJ0iw3VMNOVYQPrLG0_7hpHVy_ygOZg/exec';
const GRUPO_ID = '120363403512588677@g.us';

const wss = new WebSocket.Server({ port: 8080 });

async function obterMeta() {
  try {
    const resposta = await axios.get(`${WEB_APP_URL}?action=meta`);
    return resposta.data;
  } catch (error) {
    console.error("Erro ao obter informações da meta:", error.message);
    return null;
  }
}

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ 
    auth: state,
    syncFullHistory: false // ⚠️ Desativa a sincronização completa do histórico para evitar erro
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrLink = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`;
      console.log('Escaneie o QR code abaixo para autenticar o bot:');
      console.log(qrLink);
    }

    if (connection === 'open') {
      console.log('✅ Bot conectado ao WhatsApp!');
    }

    if (connection === 'close') {
      const motivo = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Conexão fechada. Motivo: ${motivo || "Desconhecido"}`);

      if (motivo === 401) {
        console.log("❌ Conta do WhatsApp banida! Reconexão cancelada.");
        return;
      }

      console.log("🔄 Tentando reconectar em 5 segundos...");
      setTimeout(iniciarBot, 5000);
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
