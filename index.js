const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const WebSocket = require('ws');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxrjEcqhUFs5hWVacEMSJ_--i2RPTGAJuBMGc8cBPrwbiezkg4aoAFvzMwtx3SYNw1oUQ/exec';
const GRUPO_ID = '120363403512588677@g.us';

// Configuração do gráfico
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 800, height: 600, backgroundColour: 'white' });

// Normalizar texto (remove acentos e converte para minúsculas)
function normalizarTexto(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function gerarGrafico(tipo, dados) {
  const configuration = {
    type: tipo,
    data: { labels: dados.labels, datasets: dados.datasets },
    options: { /* ... (igual ao anterior) ... */ }
  };
  return chartJSNodeCanvas.renderToBuffer(configuration);
}

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ auth: state, printQRInTerminal: true });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (update) => { /* ... (igual ao anterior) ... */ });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || !msg.key.remoteJid.includes(GRUPO_ID)) return;

    const textoBruto = msg.message.conversation || '';
    const texto = normalizarTexto(textoBruto);
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

      // Demais comandos (adicionar lógica similar)
      // ...

    } catch (error) {
      await sock.sendMessage(GRUPO_ID, { text: `❌ Erro: ${error.response?.data?.erro || error.message}` });
    }
  });

  // Restante do código (servidor Express, etc.)
}

app.listen(3000, () => console.log("Servidor rodando na porta 3000"));
iniciarBot();