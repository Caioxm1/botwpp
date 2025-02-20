const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');

// Configuração do servidor para receber notificações do Google Apps Script
const app = express();
app.use(express.json());

// URL do Google Apps Script
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxA3YkI_y4gOoRCCoc93Z8bMwY1m2X-qDtUa52f48q8X1-4ZKoucLPQR0ZJm740FGEelQ/exec';
const GRUPO_ID = '120363403512588677@g.us'; // ID do grupo do WhatsApp

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ auth: state });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.remoteJid !== GRUPO_ID) return;

    const texto = msg.message.conversation?.toLowerCase().trim();
    const remetente = msg.pushName || msg.key.participant;

    // Comando para obter resumo financeiro
    if (texto === "resumo") {
      try {
        const resposta = await axios.get(`${WEB_APP_URL}?action=resumo`);
        await sock.sendMessage(GRUPO_ID, { text: `📊 *Resumo Financeiro* 📊\n\n${resposta.data}` });
      } catch (error) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao obter resumo financeiro." });
      }
      return;
    }

    // Comando para verificar meta
    if (texto === "meta") {
      try {
        const resposta = await axios.get(`${WEB_APP_URL}?action=meta`);
        await sock.sendMessage(GRUPO_ID, { text: resposta.data });
      } catch (error) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao obter informações da meta." });
      }
      return;
    }

    // Comando para definir meta
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
app.listen(3000, () => console.log("Servidor rodando na porta 3000"));
iniciarBot();