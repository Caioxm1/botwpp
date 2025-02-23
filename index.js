const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const WebSocket = require('ws');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const cron = require('node-cron');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzLkYXjUz3R5G9XrDcRGGIunfr5JmJo_yHX3tHjUsIh10uiEuqm0fDKnvbbZChCuZDt6A/exec';
const GRUPO_ID = '120363403512588677@g.us';

const wss = new WebSocket.Server({ port: 8080 });
let sock;

// Configuração do gráfico
const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width: 800,
  height: 600,
  backgroundColour: 'white'
});

// Função gerarGrafico
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
        title: { display: true, text: dados.titulo, font: { size: 18 } },
        legend: { position: 'top' }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => 'R$ ' + value.toFixed(2) }
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
      console.log('QR Code:', qrLink);
      wss.clients.forEach(client => client.send(JSON.stringify({ qr: qrLink })));
    }
    if (connection === 'open') console.log('Bot conectado!');
    if (connection === 'close') setTimeout(iniciarBot, 5000);
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid !== GRUPO_ID) return;

    const texto = msg.message.conversation?.toLowerCase().trim();
    const remetente = msg.pushName || "Usuário";

    try {
      // Comando de ajuda
      if (texto === 'ajuda') {
        const mensagemAjuda = `📝 *Comandos Disponíveis*\n\n• resumo\n• meta definir [valor] [dataInicio] [dataFim]\n• entrada [valor]\n• saída [valor]\n• média\n• grafico [bar|line] [entrada|saída|ambos] [diario|semanal|mensal]\n• historico [Xd|dataInicio|dataInicio dataFim]\n• categoria adicionar [nome]\n• categoria listar\n• relatorio [dataInicio dataFim]\n• lembrete adicionar [descricao] [valor] [data]\n• dividir [valor] [pessoas]\n• converter [valor] [moedaOrigem] [moedaDestino]\n• investir [valor] [rendimento] [meses]\n• analise\n• orcamento definir [categoria] [valor]\n• orcamento verificar [categoria]`;
        await sock.sendMessage(GRUPO_ID, { text: mensagemAjuda });
      }

      // Comando para histórico de transações
      else if (texto.startsWith('historico')) {
        const periodo = texto.split(' ')[1] || "30d"; // Padrão: últimos 30 dias
        const response = await axios.get(`${WEB_APP_URL}?action=historico&periodo=${periodo}`);
        const transacoes = response.data;

        let mensagem = `📜 Histórico (${periodo}):\n`;
        transacoes.forEach(transacao => {
          mensagem += `${transacao[1] === "Entrada" ? "✅" : "❌"} ${transacao[1]}: R$ ${transacao[2].toFixed(2)} - ${transacao[3]} (${transacao[0]})\n`;
        });

        await sock.sendMessage(GRUPO_ID, { text: mensagem });
      }

      // Outros comandos mantidos
      // ...

    } catch (error) {
      await sock.sendMessage(GRUPO_ID, { text: `❌ Erro: ${error.message}` });
    }
  });
}

// Agendamentos e servidor
const lembretes = [];

cron.schedule('0 9 * * *', () => {
  const hoje = new Date().toLocaleDateString('pt-BR');
  lembretes.forEach(lembrete => {
    if (lembrete.data === hoje) {
      sock.sendMessage(GRUPO_ID, { text: `📌 Lembrete: Hoje vence "${lembrete.descricao} - R$ ${lembrete.valor}".` });
    }
  });
});

cron.schedule('0 0 1 * *', async () => {
  const response = await axios.get(`${WEB_APP_URL}?action=getDespesasRecorrentes`);
  const despesasRecorrentes = response.data;

  despesasRecorrentes.forEach(despesa => {
    const [descricao, valor] = despesa;
    axios.post(WEB_APP_URL, { tipo: "Saída", valor: valor, remetente: "Sistema", descricao: descricao });
  });
});

app.listen(3000, () => console.log("Servidor rodando!"));
iniciarBot();
