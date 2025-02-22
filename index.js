const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxrjEcqhUFs5hWVacEMSJ_--i2RPTGAJuBMGc8cBPrwbiezkg4aoAFvzMwtx3SYNw1oUQ/exec'; // Substitua pela URL do seu Google Apps Script
const GRUPO_ID = '120363403512588677@g.us'; // Substitua pelo ID do seu grupo do WhatsApp

// Configuração do gráfico
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 800, height: 600, backgroundColour: 'white' });

// Normalizar texto (remove acentos e converte para minúsculas)
function normalizarTexto(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Gerar gráfico
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
            callback: function (value) {
              return 'R$ ' + value.toFixed(2);
            }
          }
        }
      }
    }
  };
  return chartJSNodeCanvas.renderToBuffer(configuration);
}

// Iniciar o bot
async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false, // Desativa o QR Code no terminal (para forçar o link)
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update;

    // Exibe o link do QR Code sempre que disponível
    if (qr) {
      const qrLink = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`;
      console.log('\n=== QR CODE PARA AUTENTICAÇÃO ===');
      console.log(qrLink); // Link clicável (se o terminal permitir)
      console.log('==================================\n');
    }

    if (connection === 'open') {
      console.log('✅ Conectado ao WhatsApp!');
    } else if (connection === 'close') {
      console.log('⚠️ Conexão perdida. Reconectando...');
      setTimeout(iniciarBot, 5000);
    }
  });

  // Controle de taxa (rate limiting)
  const rateLimit = new Map(); // Armazena o tempo da última mensagem por usuário

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || !msg.key.remoteJid.includes(GRUPO_ID)) return;

    const textoBruto = msg.message.conversation || '';
    const texto = normalizarTexto(textoBruto);

    // Verifica se a mensagem está vazia ou duplicada
    if (!texto || texto === '') return;

    // Verifica o rate limiting
    const userId = msg.key.remoteJid;
    const now = Date.now();
    const lastMessageTime = rateLimit.get(userId) || 0;

    if (now - lastMessageTime < 2000) { // Limite de 1 mensagem a cada 2 segundos
      console.log(`⚠️ Rate limit excedido para o usuário ${userId}`);
      return;
    }

    rateLimit.set(userId, now); // Atualiza o tempo da última mensagem

    console.log(`Comando recebido: ${texto}`);

    try {
      // Comando: Ajuda
      if (texto.match(/ajuda|help|comandos/)) {
        const mensagemAjuda = `📝 *Comandos Disponíveis* 📝\n
        • (resumo|resumodiario|resumosemanal|resumomensal)\n
        • (meta|metasimples|definirmeta) [valor] [dataInicio] [dataFim]\n
        • (entrada|addentrada|entrar) [valor]\n
        • (saida|addsaida|sair) [valor]\n
        • (media|mediaentradas)\n
        • (historico|transacoes) [dias]\n
        • (relatorio|report) [dataInicio] [dataFim]\n
        • (dividir|divisao) [valor] [pessoas]\n
        • (converter|conversao) [valor] [moedaOrigem] [moedaDestino]\n
        • (investir|investimento) [valor] [taxa] [tempo]\n
        • (grafico|graph) [tipo] [dados] [periodo]`;
        await sock.sendMessage(GRUPO_ID, { text: mensagemAjuda });
        return;
      }

      // Comando: Resumo
      if (texto.match(/resumo/)) {
        const periodo = texto.includes('semanal') ? 'semanal' : texto.includes('mensal') ? 'mensal' : 'diario';
        const response = await axios.get(`${WEB_APP_URL}?action=resumo${periodo}`);
        await sock.sendMessage(GRUPO_ID, { text: `📊 *Resumo ${periodo}*\nEntradas: R$${response.data.entrada}\nSaídas: R$${response.data.saida}\nSaldo: R$${response.data.saldo}` });
        return;
      }

      // Comando: Meta
      if (texto.match(/meta/)) {
        if (texto.includes('definir')) {
          const [, valor, dataInicio, dataFim] = textoBruto.split(' ');
          await axios.post(WEB_APP_URL, { action: 'definirMeta', valor, dataInicio, dataFim });
          await sock.sendMessage(GRUPO_ID, { text: '✅ Meta definida com sucesso!' });
        } else {
          const response = await axios.get(`${WEB_APP_URL}?action=metaSimplificada`);
          await sock.sendMessage(GRUPO_ID, { text: `🎯 *Meta Atual*\nValor: R$${response.data.valor}\nPeríodo: ${response.data.dataInicio} a ${response.data.dataFim}` });
        }
        return;
      }

      // Comando: Entrada/Saída
      if (texto.match(/entrada|saida/)) {
        const tipo = texto.includes('entrada') ? 'Entrada' : 'Saída';
        const valor = textoBruto.split(' ')[1];
        await axios.post(WEB_APP_URL, { action: 'registrar', tipo, valor });
        await sock.sendMessage(GRUPO_ID, { text: `✅ ${tipo} de R$${valor} registrada!` });
        return;
      }

      // Comando: Relatório
      if (texto.match(/relatorio|report/)) {
        const [, dataInicio, dataFim] = textoBruto.split(' ');
        const response = await axios.get(`${WEB_APP_URL}?action=relatorio&dataInicio=${dataInicio}&dataFim=${dataFim}`);
        await sock.sendMessage(GRUPO_ID, { text: `📋 *Relatório (${dataInicio} a ${dataFim})*\nEntradas: R$${response.data.entrada}\nSaídas: R$${response.data.saida}\nSaldo: R$${response.data.saldo}` });
        return;
      }

      // Comando: Gráfico
      if (texto.match(/grafico|graph/)) {
        const partes = texto.split(' ');
        if (partes.length < 3) return;

        const tipoGrafico = partes[1]; // bar, line
        const tipoDados = partes[2].toLowerCase(); // entrada, saida, ambos
        const periodo = partes[3] ? partes[3].toLowerCase() : "todos"; // diario, semanal, mensal, ou todos

        const response = await axios.get(`${WEB_APP_URL}?action=getDadosGrafico&tipo=${tipoDados}&periodo=${periodo}`);
        if (!response.data.labels || response.data.labels.length === 0) {
          await sock.sendMessage(GRUPO_ID, { text: "⚠️ Nenhum dado encontrado para o período!" });
          return;
        }

        const image = await gerarGrafico(tipoGrafico, response.data);
        await sock.sendMessage(GRUPO_ID, {
          image: image,
          caption: `📊 ${response.data.titulo}\n📅 Período: ${periodo}`
        });
        return;
      }

      // Comando não reconhecido
      await sock.sendMessage(GRUPO_ID, { text: "❌ Comando não reconhecido. Digite 'ajuda' para ver os comandos disponíveis." });

    } catch (error) {
      await sock.sendMessage(GRUPO_ID, { text: `❌ Erro: ${error.response?.data?.erro || error.message}` });
    }
  });
}

// Iniciar o servidor Express e o bot
app.listen(3000, () => console.log("Servidor rodando na porta 3000"));
iniciarBot();