const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const WebSocket = require('ws');
const cron = require('node-cron');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbx_YfVJ-gNQ9Zy6qnRr0vgyiHYqftayUnL8vkF9Lsje0b9DheENR4q0qVMKs1ek1-HWbA/exec';
const GRUPO_ID = '120363403512588677@g.us';

const wss = new WebSocket.Server({ port: 8080 });

function formatarData(data) {
  const date = new Date(data);
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const ano = date.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

async function obterResumo() {
  try {
    const resposta = await axios.get(`${WEB_APP_URL}?action=resumo`);
    return resposta.data;
  } catch (error) {
    console.error("Erro ao obter resumo:", error);
    return "⚠️ Erro ao obter resumo financeiro.";
  }
}

async function obterMeta() {
  try {
    const resposta = await axios.get(`${WEB_APP_URL}?action=meta`);
    return JSON.parse(resposta.data);
  } catch (error) {
    console.error("Erro ao obter informações da meta:", error);
    return null;
  }
}

async function enviarMensagemAutomatica(mensagem) {
  try {
    await sock.sendMessage(GRUPO_ID, { text: mensagem });
  } catch (error) {
    console.error("Erro ao enviar mensagem automática:", error);
  }
}

cron.schedule('59 23 * * *', async () => {
  const resumo = await obterResumo();
  await enviarMensagemAutomatica(`📊 *Resumo Diário* 📊\n\n${resumo}`);
});

cron.schedule('59 23 * * 0', async () => {
  const resumo = await obterResumo();
  await enviarMensagemAutomatica(`📊 *Resumo Semanal* 📊\n\n${resumo}`);
});

cron.schedule('59 23 28-31 * *', async () => {
  const hoje = new Date();
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  if (amanha.getMonth() !== hoje.getMonth()) {
    const resumo = await obterResumo();
    await enviarMensagemAutomatica(`📊 *Resumo Mensal* 📊\n\n${resumo}`);
  }
});

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
      console.log('Bot conectado ao WhatsApp!');
    }
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      console.log('Conexão fechada. Tentando reconectar...');
      setTimeout(iniciarBot, 5000);
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
        const metaData = await obterMeta();
        if (metaData) {
          const metaFormatada = `🎯 *Meta*:\n📅 Período: ${formatarData(metaData.dataInicio)} até ${formatarData(metaData.dataFim)}\n💰 Valor: R$${metaData.valor.toFixed(2)}`;
          await sock.sendMessage(GRUPO_ID, { text: metaFormatada });
        } else {
          await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao obter informações da meta." });
        }
      } catch (error) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao obter informações da meta." });
      }
      return;
    }

    if (texto.startsWith("entrada")) {
      const valor = parseFloat(texto.replace("entrada", "").trim());
      if (!isNaN(valor)) {
        try {
          await axios.post(WEB_APP_URL, { tipo: "Entrada", valor, remetente });
          await sock.sendMessage(GRUPO_ID, { text: `✅ Entrada de R$${valor.toFixed(2)} registrada por ${remetente}.` });
        } catch (error) {
          console.error("Erro ao registrar entrada:", error);
          await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao registrar a entrada." });
        }
      } else {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Formato incorreto. Use: entrada <valor>" });
      }
      return;
    }

    if (texto.startsWith("saída") || texto.startsWith("saida")) {
      const valor = parseFloat(texto.replace(/sa[ií]da/, "").trim());
      if (!isNaN(valor)) {
        try {
          await axios.post(WEB_APP_URL, { tipo: "Saída", valor, remetente });
          await sock.sendMessage(GRUPO_ID, { text: `✅ Saída de R$${valor.toFixed(2)} registrada por ${remetente}.` });
        } catch (error) {
          console.error("Erro ao registrar saída:", error);
          await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao registrar a saída." });
        }
      } else {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Formato incorreto. Use: saída <valor>" });
      }
      return;
    }

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
  });

  console.log("Bot iniciado!");
}

app.listen(3000, '0.0.0.0', async () => {
  console.log(`Servidor rodando na porta 3000`);
  iniciarBot();
});