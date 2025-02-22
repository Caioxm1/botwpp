const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const WebSocket = require('ws');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const cron = require('node-cron');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzO5zWb9M1dY12uOB6VUiAui7tG6j_c6iyRWrWPSqIh1Cim61k2hkN94aoiHN8fIGkkNw/exec';
const GRUPO_ID = '120363403512588677@g.us'; // ID do grupo do WhatsApp

const wss = new WebSocket.Server({ port: 8080 });
let sock;

// Configuração do gráfico
const width = 800; // Largura do gráfico
const height = 600; // Altura do gráfico
const backgroundColour = 'white'; // Cor de fundo

const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width,
  height,
  backgroundColour
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
        title: { 
          display: true, 
          text: dados.titulo,
          font: { size: 18 }
        },
        legend: {
          position: 'top'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return 'R$ ' + value.toFixed(2);
            }
          }
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
      • "grafico [tipo] [dados] [periodo]" - Gera gráfico financeiro\n
      • "ajuda" - Exibe esta mensagem`;
      await sock.sendMessage(GRUPO_ID, { text: mensagemAjuda });
      return;
    }

    // Comando de gráfico
    if (texto.startsWith('grafico')) {
      const partes = texto.split(' ');
      if (partes.length < 3) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Formato incorreto. Use: grafico [tipo] [dados] [periodo]" });
        return;
      }

      const tipoGrafico = partes[1]; // bar, line
      const tipoDados = partes[2].toLowerCase(); // entrada, saida, ambos
      const periodo = partes[3] ? partes[3].toLowerCase() : "todos"; // diario, semanal, mensal, ou todos

      try {
        const response = await axios.get(`${WEB_APP_URL}?action=getDadosGrafico&tipo=${tipoDados}&periodo=${periodo}`);
        const image = await gerarGrafico(tipoGrafico, response.data);
        await sock.sendMessage(GRUPO_ID, { 
          image: image, 
          caption: `📊 ${response.data.titulo}\n📅 Período: ${periodo}`
        });
      } catch (error) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao gerar gráfico." });
      }
      return;
    }

    // Outros comandos existentes...
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