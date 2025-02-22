const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const WebSocket = require('ws');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyhBq6PwVKFdXf0ZYfuvKO5LL5TvW56gdAgVoEauC2HePad8I4TMuhFT8fDd0TPEOEd9A/exec'; // Substitua pela URL do seu Google Apps Script
const GRUPO_ID = '120363403512588677@g.us'; // ID do grupo do WhatsApp

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
      datasets: dados.datasets // Agora recebe múltiplos datasets
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
  const sock = makeWASocket({ 
    auth: state,
    printQRInTerminal: true // Exibe o QR Code no terminal
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update;

    // Exibe o QR Code no terminal
    if (qr) {
      console.log('Escaneie o QR Code abaixo para autenticar o bot:');
      console.log(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`);
    }

    if (connection === 'open') {
      console.log('Bot conectado ao WhatsApp!');
    } else if (connection === 'close') {
      console.log('Conexão fechada, tentando reconectar...');
      setTimeout(iniciarBot, 5000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || !msg.key.remoteJid.includes(GRUPO_ID)) return;

    const texto = msg.message.conversation?.toLowerCase().trim();
    if (!texto) return;

    console.log(`Comando recebido: ${texto}`);

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
      • "grafico [tipo] [dados] [periodo]" - Gera gráfico financeiro\n
      • "ajuda" - Exibe esta mensagem`;
      await sock.sendMessage(GRUPO_ID, { text: mensagemAjuda });
      return;
    }

    // Comando para gráficos
    if (texto.startsWith('grafico')) {
      const partes = texto.split(' ');
      if (partes.length < 3) return;

      const tipoGrafico = partes[1]; // bar, line
      const tipoDados = partes[2].toLowerCase(); // entrada, saida, ambos
      const periodo = partes[3] ? partes[3].toLowerCase() : "todos"; // diario, semanal, mensal, ou todos

      try {
        const response = await axios.get(`${WEB_APP_URL}?action=getDadosGrafico&tipo=${tipoDados}&periodo=${periodo}`, {
          timeout: 15000
        });

        if (!response.data.labels || response.data.labels.length === 0) {
          await sock.sendMessage(GRUPO_ID, { text: "⚠️ Nenhum dado encontrado para o período!" });
          return;
        }

        const image = await gerarGrafico(tipoGrafico, response.data);
        await sock.sendMessage(GRUPO_ID, { 
          image: image, 
          caption: `📊 ${response.data.titulo}\n📅 Período: ${periodo}`
        });

      } catch (error) {
        console.error('Erro detalhado:', error);
        await sock.sendMessage(GRUPO_ID, { 
          text: `❌ Falha: ${error.response?.data?.error || error.message}`
        });
      }
      return;
    }

    // Comando para resumo financeiro
    if (texto.startsWith('resumo')) {
      try {
        const response = await axios.get(`${WEB_APP_URL}?action=resumoDiario`);
        const resumoDiario = response.data;

        const responseSemanal = await axios.get(`${WEB_APP_URL}?action=resumoSemanal`);
        const resumoSemanal = responseSemanal.data;

        const responseMensal = await axios.get(`${WEB_APP_URL}?action=resumoMensal`);
        const resumoMensal = responseMensal.data;

        const mensagem = `📊 *Resumo Financeiro* 📊\n
        📅 *Diário*\n
        💰 Entradas: R$${resumoDiario.entrada}\n
        💸 Saídas: R$${resumoDiario.saida}\n
        🏦 Saldo: R$${resumoDiario.saldo}\n\n
        📅 *Semanal*\n
        💰 Entradas: R$${resumoSemanal.entrada}\n
        💸 Saídas: R$${resumoSemanal.saida}\n
        🏦 Saldo: R$${resumoSemanal.saldo}\n\n
        📅 *Mensal*\n
        💰 Entradas: R$${resumoMensal.entrada}\n
        💸 Saídas: R$${resumoMensal.saida}\n
        🏦 Saldo: R$${resumoMensal.saldo}`;

        await sock.sendMessage(GRUPO_ID, { text: mensagem });
      } catch (error) {
        console.error('Erro detalhado:', error);
        await sock.sendMessage(GRUPO_ID, { 
          text: `❌ Falha: ${error.response?.data?.error || error.message}`
        });
      }
      return;
    }

    // Comando para definir meta
    if (texto.startsWith('meta definir')) {
      const partes = texto.split(' ');
      if (partes.length < 5) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Formato incorreto. Use: meta definir [valor] [dataInicio] [dataFim]" });
        return;
      }

      const valor = partes[2];
      const dataInicio = partes[3];
      const dataFim = partes[4];

      try {
        const response = await axios.post(`${WEB_APP_URL}?action=definirMeta`, {
          valor: valor,
          dataInicio: dataInicio,
          dataFim: dataFim
        });

        await sock.sendMessage(GRUPO_ID, { text: `✅ Meta definida com sucesso!` });
      } catch (error) {
        console.error('Erro detalhado:', error);
        await sock.sendMessage(GRUPO_ID, { 
          text: `❌ Falha: ${error.response?.data?.error || error.message}`
        });
      }
      return;
    }

    // Comando para registrar entrada
    if (texto.startsWith('entrada')) {
      const partes = texto.split(' ');
      if (partes.length < 2) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Formato incorreto. Use: entrada [valor]" });
        return;
      }

      const valor = partes[1];

      try {
        const response = await axios.post(`${WEB_APP_URL}?action=registrarEntrada`, {
          valor: valor
        });

        await sock.sendMessage(GRUPO_ID, { text: `✅ Entrada registrada com sucesso!` });
      } catch (error) {
        console.error('Erro detalhado:', error);
        await sock.sendMessage(GRUPO_ID, { 
          text: `❌ Falha: ${error.response?.data?.error || error.message}`
        });
      }
      return;
    }

    // Comando para registrar saída
    if (texto.startsWith('saída')) {
      const partes = texto.split(' ');
      if (partes.length < 2) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Formato incorreto. Use: saída [valor]" });
        return;
      }

      const valor = partes[1];

      try {
        const response = await axios.post(`${WEB_APP_URL}?action=registrarSaida`, {
          valor: valor
        });

        await sock.sendMessage(GRUPO_ID, { text: `✅ Saída registrada com sucesso!` });
      } catch (error) {
        console.error('Erro detalhado:', error);
        await sock.sendMessage(GRUPO_ID, { 
          text: `❌ Falha: ${error.response?.data?.error || error.message}`
        });
      }
      return;
    }

    // Outros comandos...
    // Adicione aqui a lógica para os outros comandos (média, histórico, relatório, etc.)
  });

  console.log("Bot iniciado!");
}

// Endpoint para receber mensagens do Google Apps Script
app.post('/enviar-mensagem', async (req, res) => {
  const { mensagem } = req.body;
  await sock.sendMessage(GRUPO_ID, { text: mensagem });
  res.status(200).send("Mensagem enviada com sucesso!");
});

// Iniciar o servidor Express e o bot
app.listen(3000, () => console.log("Servidor rodando na porta 3000"));
iniciarBot();