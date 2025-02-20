const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const WebSocket = require('ws');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyeGpKLC9iDiqXugresc-wTTb5UW6WCKTO5nBEE2BaMPOvJqDMiNVqhVlXzgC2Qr4cYNw/exec';
const GRUPO_ID = '120363403512588677@g.us';

// Servidor WebSocket para enviar o QR code
const wss = new WebSocket.Server({ port: 8080 });

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

      // Envia o QR code para todos os clientes WebSocket conectados
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ qr: qrLink }));
        }
      });
    }
    if (connection === 'open') {
      console.log('Bot conectado ao WhatsApp!');
    }
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      console.log('Conexão fechada. Tentando reconectar...');
      setTimeout(iniciarBot, 10000); // Reconecta após 10 segundos
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.remoteJid !== GRUPO_ID) return;

    const texto = msg.message.conversation?.toLowerCase().trim();
    const remetente = msg.pushName || msg.key.participant;

    // Comando para obter resumo financeiro
    if (texto === "resumo") {
      try {
        const resposta = await axios.get(`${WEB_APP_URL}?action=resumo`);
        await sock.sendMessage(GRUPO_ID, { text: resposta.data }); // Resposta é tratada como texto
      } catch (error) {
        console.error("Erro ao obter resumo:", error);
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao obter resumo financeiro." });
      }
      return;
    }

    // Comando para verificar meta
    if (texto === "meta") {
      try {
        const resposta = await axios.get(`${WEB_APP_URL}?action=meta`);
        await sock.sendMessage(GRUPO_ID, { text: resposta.data }); // Resposta é tratada como texto
      } catch (error) {
        console.error("Erro ao obter informações da meta:", error);
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao obter informações da meta." });
      }
      return;
    }

    // Comando para ajuda
    if (texto === "ajuda") {
      const mensagemAjuda = `📋 *Comandos Disponíveis* 📋\n\n` +
        `🔹 *resumo*: Exibe o resumo financeiro.\n` +
        `🔹 *meta*: Exibe informações sobre a meta atual.\n` +
        `🔹 *entrada <valor>*: Registra uma entrada de dinheiro.\n` +
        `🔹 *saída <valor>*: Registra uma saída de dinheiro.\n` +
        `🔹 *ajuda*: Exibe esta mensagem de ajuda.`;
      await sock.sendMessage(GRUPO_ID, { text: mensagemAjuda });
      return;
    }

    // Captura entradas e saídas de dinheiro
    let tipo = "";
    let valor = 0;
    if (texto.startsWith("entrada")) {
      tipo = "Entrada";
      valor = parseFloat(texto.replace("entrada", "").trim());
    } else if (texto.startsWith("saída") || texto.startsWith("saida")) {
      tipo = "Saída";
      valor = parseFloat(texto.replace(/sa[ií]da/, "").trim());
    }

    if (tipo && !isNaN(valor)) {
      try {
        await axios.post(WEB_APP_URL, { tipo, valor, remetente });
        await sock.sendMessage(GRUPO_ID, { text: `✅ ${tipo} de R$${valor} registrada por ${remetente}.` });
      } catch (error) {
        console.error("Erro ao registrar transação:", error);
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao registrar a transação." });
      }
    }
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

// Iniciar o servidor Express e o bot
app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
  iniciarBot();
});
