const { default: makeWASocket, useMultiFileAuthState, makeInMemoryStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// Configuração do servidor para receber notificações do Google Apps Script
const app = express();
app.use(express.json());

// URL do Google Apps Script
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxMbawtEiSnfDJ7qnttHPzCPBxWoZJBJzywCByaui_hGNi_DiHeU6lvOWz0L4uJcIhd/exec';
const GRUPO_ID = '120363403512588677@g.us'; // ID do grupo do WhatsApp

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ auth: state });
  sock.ev.on('creds.update', saveCreds);

  // Exibir QR Code como link
  sock.ev.on('connection.update', async (update) => {
    const { qr } = update;
    if (qr) {
      qrcode.generate(qr, { small: true }); // Exibir QR Code no terminal
      console.log(`Escaneie o QR Code pelo link: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.remoteJid !== GRUPO_ID) return;

    const texto = msg.message.conversation?.toLowerCase().trim();
    const remetente = msg.pushName || msg.key.participant;

    if (texto === "resumo") {
      try {
        const resposta = await axios.get(`${WEB_APP_URL}?action=resumo`);
        await sock.sendMessage(GRUPO_ID, { text: `📊 *Resumo Financeiro* 📊\n\n${resposta.data}` });
      } catch (error) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao obter resumo financeiro." });
      }
      return;
    }

    if (texto === "meta") {
      try {
        const resposta = await axios.get(`${WEB_APP_URL}?action=meta`);
        await sock.sendMessage(GRUPO_ID, { text: resposta.data });
      } catch (error) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao obter informações da meta." });
      }
      return;
    }

    if (texto.startsWith("meta definir")) {
      try {
        const parametros = texto.replace("meta definir", "").trim().split(" ");
        const valor = parseFloat(parametros[0]);
        const dataInicio = parametros[1];
        const dataFim = parametros[2];

        if (isNaN(valor) || !dataInicio || !dataFim) {
          await sock.sendMessage(GRUPO_ID, { text: "⚠️ Formato incorreto. Use: meta definir <valor> <data início> <data fim>" });
          return;
        }

        await axios.post(WEB_APP_URL, { action: "definirMeta", valor, dataInicio, dataFim });
        await sock.sendMessage(GRUPO_ID, { text: `✅ Meta de R$${valor} definida de ${dataInicio} até ${dataFim}.` });
      } catch (error) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao definir a meta." });
      }
      return;
    }

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
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao registrar a transação." });
      }
    }
  });

  console.log("Bot iniciado!");
}

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

app.listen(3000, () => console.log("Servidor rodando na porta 3000"));
iniciarBot();
