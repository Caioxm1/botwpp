const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const WebSocket = require('ws');
const cron = require('node-cron');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzB45pCxnCHO8sifdfHqRwBoN3WIX6-2tAO4SBWo70FB-WDbmRweZJKdBSzepO-nQzJLQ/exec';
const GRUPO_ID = '120363403512588677@g.us'; // ID do grupo do WhatsApp

const wss = new WebSocket.Server({ port: 8080 });
let sock;

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

    // Comando de ajuda
    if (texto === "ajuda") {
      const mensagemAjuda = `📝 *Comandos Disponíveis* 📝\n
      • "resumo" - Mostra o resumo financeiro completo\n
      • "meta" - Exibe detalhes da meta atual\n
      • "meta definir [valor] [dataInicio] [dataFim]" - Define uma nova meta\n
      • "entrada [valor]" - Registra uma entrada\n
      • "saída [valor]" - Registra uma saída\n
      • "média" - Mostra a média das entradas\n
      • "historico [dias]" - Mostra o histórico de transações\n
      • "relatorio [dataInicio] [dataFim]" - Gera um relatório personalizado\n
      • "exportar" - Exporta os dados da planilha\n
      • "ajuda" - Exibe esta mensagem`;
      await sock.sendMessage(GRUPO_ID, { text: mensagemAjuda });
      return;
    }

    // Comando de média
    if (texto === "média") {
      try {
        const resposta = await axios.get(`${WEB_APP_URL}?action=mediaEntradas`);
        await sock.sendMessage(GRUPO_ID, { text: resposta.data });
      } catch (error) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao calcular média." });
      }
      return;
    }

    // Comando meta ajustado
    if (texto === "meta") {
      try {
        const resposta = await axios.get(`${WEB_APP_URL}?action=metaSimplificada`);
        await sock.sendMessage(GRUPO_ID, { text: resposta.data });
      } catch (error) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao obter informações da meta." });
      }
      return;
    }

    // Comando para obter resumo financeiro
    if (texto === "resumo") {
      try {
        const resposta = await axios.get(`${WEB_APP_URL}?action=resumo`);
        await sock.sendMessage(GRUPO_ID, { text: resposta.data });
      } catch (error) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao obter resumo financeiro." });
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

    // Comando para histórico de transações
    if (texto.startsWith("historico")) {
      const periodo = parseInt(texto.replace("historico", "").trim());
      try {
        const resposta = await axios.get(`${WEB_APP_URL}?action=historico&periodo=${periodo}`);
        await sock.sendMessage(GRUPO_ID, { text: resposta.data });
      } catch (error) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao obter histórico." });
      }
      return;
    }

    // Comando para relatório personalizado
    if (texto.startsWith("relatorio")) {
      const [dataInicio, dataFim] = texto.replace("relatorio", "").trim().split(" ");
      try {
        const resposta = await axios.get(`${WEB_APP_URL}?action=relatorio&dataInicio=${dataInicio}&dataFim=${dataFim}`);
        await sock.sendMessage(GRUPO_ID, { text: resposta.data });
      } catch (error) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao gerar relatório." });
      }
      return;
    }

    // Comando para exportar dados
    if (texto === "exportar") {
      try {
        const resposta = await axios.get(`${WEB_APP_URL}?action=exportar`);
        await sock.sendMessage(GRUPO_ID, { text: `📥 Link para download: ${resposta.data}` });
      } catch (error) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao exportar dados." });
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

// Agendamento de mensagens automáticas
cron.schedule('0 22 * * *', async () => { // Todos os dias às 22h
  try {
    const resumoDiario = await axios.get(`${WEB_APP_URL}?action=resumoDiario`);
    await sock.sendMessage(GRUPO_ID, { text: resumoDiario.data });
  } catch (error) {
    console.error("Erro no resumo diário:", error);
  }
});

cron.schedule('0 22 * * 0', async () => { // Todo domingo às 22h
  try {
    const resumoSemanal = await axios.get(`${WEB_APP_URL}?action=resumoSemanal`);
    await sock.sendMessage(GRUPO_ID, { text: resumoSemanal.data });
  } catch (error) {
    console.error("Erro no resumo semanal:", error);
  }
});

cron.schedule('0 22 28-31 * *', async () => { // Último dia do mês às 22h
  try {
    const resumoMensal = await axios.get(`${WEB_APP_URL}?action=resumoMensal`);
    await sock.sendMessage(GRUPO_ID, { text: resumoMensal.data });
  } catch (error) {
    console.error("Erro no resumo mensal:", error);
  }
});

// Iniciar o servidor Express e o bot
app.listen(3000, () => console.log("Servidor rodando na porta 3000"));
iniciarBot();