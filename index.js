const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const WebSocket = require('ws');
const cron = require('node-cron');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzlEp4RFBJO9i8xYA_qo4yzrqi9Q7ilRN3qA7jKDjbLIJw5KstlTtJH6bYaEfPFO1QbnQ/exec';
const GRUPO_ID = '120363403512588677@g.us'; // ID do grupo do WhatsApp

const wss = new WebSocket.Server({ port: 8080 });
let sock;

// Função para gerar gráficos
async function gerarGrafico(tipo, dados) {
  console.log("Gerando gráfico..."); // Depuração
  console.log("Dados recebidos:", dados); // Depuração

  const width = 800; // Largura do gráfico
  const height = 600; // Altura do gráfico
  const backgroundColour = 'white'; // Cor de fundo

  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour });

  const configuration = {
    type: tipo, // Tipo de gráfico (bar, line, pie, etc.)
    data: {
      labels: dados.labels, // Rótulos do gráfico
      datasets: [{
        label: dados.label, // Legenda do gráfico
        data: dados.valores, // Valores do gráfico
        backgroundColor: dados.cores, // Cores das barras/fatias
        borderColor: dados.bordas, // Cores das bordas
        borderWidth: 2, // Espessura da borda
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: true,
          text: dados.titulo, // Título do gráfico
        }
      }
    }
  };

  // Gera a imagem do gráfico
  const image = await chartJSNodeCanvas.renderToBuffer(configuration);
  console.log("Gráfico gerado com sucesso!"); // Depuração
  return image;
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

    console.log(`Mensagem recebida: ${texto}`); // Depuração
    console.log(`Remetente: ${remetente}`); // Depuração

    // Comando de ajuda
    if (["ajuda", "help", "comandos", "comando"].includes(texto)) {
      const mensagemAjuda = `📝 *Comandos Disponíveis* 📝\n
      • "resumo" - Mostra o resumo financeiro completo\n
      • "meta" - Exibe detalhes da meta atual\n
      • "meta definir [valor] [dataInicio] [dataFim]" - Define uma nova meta\n
      • "entrada [valor]" - Registra uma entrada\n
      • "saída [valor]" - Registra uma saída\n
      • "média" - Mostra a média das entradas\n
      • "historico [dias]" - Mostra o histórico de transações\n
      • "relatorio [dataInicio] [dataFim]" - Gera um relatório personalizado\n
      • "dividir [valor] [pessoas]" - Divide despesas\n
      • "converter [valor] [moedaOrigem] [moedaDestino]" - Converte moedas\n
      • "investir [valor] [taxa] [tempo]" - Simula investimentos\n
      • "analise" - Gera análise de gastos\n
      • "recorrente adicionar [valor] [descrição] [frequência]" - Adiciona despesa recorrente\n
      • "recorrente listar" - Lista despesas recorrentes\n
      • "orcamento definir [categoria] [valor]" - Define orçamento\n
      • "divida adicionar [valor] [credor] [data]" - Adiciona dívida\n
      • "alerta gasto [percentual]" - Configura alerta de gastos\n
      • "grafico [tipo] [dados]" - Gera gráfico financeiro\n
      • "ajuda" - Exibe esta mensagem`;
      await sock.sendMessage(GRUPO_ID, { text: mensagemAjuda });
      return;
    }

    // Comando para gráficos
    if (["grafico", "gráfico", "GRAFICO", "GRÁFICO"].includes(texto.toLowerCase())) {
      console.log("Comando gráfico detectado!"); // Depuração
      const tipoGrafico = texto.split(" ")[1]; // Tipo de gráfico (bar, line, pie, etc.)
      const tipoDados = texto.split(" ")[2]; // Entrada, Saída ou Ambos

      console.log(`Tipo de gráfico: ${tipoGrafico}`); // Depuração
      console.log(`Tipo de dados: ${tipoDados}`); // Depuração

      try {
        // Busca os dados da planilha
        const resposta = await axios.get(`${WEB_APP_URL}?action=getDadosGrafico&tipo=${tipoDados}`);
        console.log("Dados recebidos do Google Apps Script:", resposta.data); // Depuração
        const dados = resposta.data;

        // Gera o gráfico
        const image = await gerarGrafico(tipoGrafico, dados);

        // Envia a imagem do gráfico no WhatsApp
        await sock.sendMessage(GRUPO_ID, { image: image, caption: `📊 Gráfico de ${tipoDados}` });
        console.log("Imagem do gráfico enviada com sucesso!"); // Depuração
      } catch (error) {
        console.error("Erro ao gerar gráfico:", error);
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao gerar gráfico." });
      }
      return;
    }

    // Outros comandos...
  });

  console.log("Bot iniciado!");
}

// Iniciar o servidor Express e o bot
app.listen(3000, () => console.log("Servidor rodando na porta 3000"));
iniciarBot();