const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const WebSocket = require('ws');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxFPX2mOTdHsrJ_znJiulgOGAt_fx-k7KtqMs5Xjorda-azK4JDRfPZ3cNFwWNAijfFwg/exec';
const GRUPO_ID = '120363403512588677@g.us';

const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width: 800,
  height: 600,
  backgroundColour: 'white'
});

const wss = new WebSocket.Server({ port: 8080 });

let ultimoComandoProcessado = null;

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
  const sock = makeWASocket({ auth: state });
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

    if (ultimoComandoProcessado === texto) return;
    ultimoComandoProcessado = texto;

    try {
      // Comando Ajuda
      if (texto === 'ajuda') {
        const mensagemAjuda = `📚 *Comandos Disponíveis*\n\n• resumo\n• poupança [valor]\n• entrada [valor]\n• saída [valor] [categoria]\n• média\n• grafico [bar|line] [entrada|saída|ambos] [diario|semanal|mensal]\n• categoria adicionar [nome]\n• listar categorias\n• orçamento definir [categoria] [valor]\n• orçamento listar\n• dívida adicionar [valor] [credor] [dataVencimento]\n• dívida listar\n• lembrete adicionar [descrição] [data]\n• lembrete listar\n• historico [tipo] [categoria] [dataInicio] [dataFim]`;
        await sock.sendMessage(GRUPO_ID, { text: mensagemAjuda });
        return;
      }

      // Comando Resumo
      if (texto === 'resumo') {
        const resumo = await axios.get(`${WEB_APP_URL}?action=resumo`);
        await sock.sendMessage(GRUPO_ID, { text: resumo.data });
        return;
      }

      // Comando Poupança
      if (texto.startsWith('poupança')) {
        const valor = texto.split(' ')[1];
        if (!valor || isNaN(valor)) {
          await sock.sendMessage(GRUPO_ID, { text: '❌ Comando inválido. Use: "poupança [valor]".' });
          return;
        }
        await axios.get(`${WEB_APP_URL}?action=adicionarPoupanca&valor=${valor}&remetente=${remetente}`);
        await sock.sendMessage(GRUPO_ID, { text: `✅ R$ ${valor} transferidos para a poupança.` });
        return;
      }

      // Comando Entrada
      if (texto.startsWith('entrada')) {
        const valor = texto.split(' ')[1];
        if (!valor || isNaN(valor)) {
          await sock.sendMessage(GRUPO_ID, { text: '❌ Comando inválido. Use: "entrada [valor]".' });
          return;
        }
        await axios.get(`${WEB_APP_URL}?action=entrada&valor=${valor}&remetente=${remetente}`);
        await sock.sendMessage(GRUPO_ID, { text: `✅ Entrada de R$ ${valor} (salário) registrada por ${remetente}.` });
        return;
      }

      // Comando Saída
      if (texto.startsWith('saída')) {
        const partes = texto.split(' ');
        const valor = partes[1];
        const categoria = partes[2];
        if (!valor || isNaN(valor) || !categoria) {
          await sock.sendMessage(GRUPO_ID, { text: '❌ Comando inválido. Use: "saída [valor] [categoria]".' });
          return;
        }
        await axios.get(`${WEB_APP_URL}?action=saída&valor=${valor}&categoria=${categoria}&remetente=${remetente}`);
        await sock.sendMessage(GRUPO_ID, { text: `✅ Saída de R$ ${valor} registrada na categoria "${categoria}" por ${remetente}.` });
        return;
      }

      // Comando Média
      if (texto === 'média') {
        const media = await axios.get(`${WEB_APP_URL}?action=mediaEntradas`);
        await sock.sendMessage(GRUPO_ID, { text: media.data });
        return;
      }

      // Comando Gráfico
      if (texto.startsWith('grafico')) {
        const partes = texto.split(' ');
        const tipoGrafico = partes[1];
        const tipoDados = partes[2];
        const periodo = partes[3] || "todos";
        if (!tipoGrafico || !tipoDados || !['bar', 'line'].includes(tipoGrafico) || !['entrada', 'saída', 'ambos'].includes(tipoDados)) {
          await sock.sendMessage(GRUPO_ID, { text: '❌ Comando inválido. Use: "grafico [bar|line] [entrada|saída|ambos] [diario|semanal|mensal]".' });
          return;
        }
        const response = await axios.get(`${WEB_APP_URL}?action=getDadosGrafico&tipo=${tipoDados}&periodo=${periodo}`);
        const image = await gerarGrafico(tipoGrafico, response.data);
        await sock.sendMessage(GRUPO_ID, { image: image, caption: `📊 ${response.data.titulo}` });
        return;
      }

      // Comando Categoria Adicionar
      if (texto.startsWith('categoria adicionar')) {
        const categoria = texto.split(' ').slice(2).join(' ');
        if (!categoria) {
          await sock.sendMessage(GRUPO_ID, { text: '❌ Comando inválido. Use: "categoria adicionar [nome]".' });
          return;
        }
        await axios.get(`${WEB_APP_URL}?action=adicionarCategoria&categoria=${categoria}`);
        await sock.sendMessage(GRUPO_ID, { text: `📌 Categoria "${categoria}" adicionada com sucesso.` });
        return;
      }

      // Comando Listar Categorias
      if (texto === 'listar categorias') {
        const response = await axios.get(`${WEB_APP_URL}?action=listarCategorias`);
        const categorias = response.data.categorias;
        if (categorias.length === 0) {
          await sock.sendMessage(GRUPO_ID, { text: "📌 Nenhuma categoria cadastrada." });
        } else {
          const listaCategorias = categorias.map((cat, index) => `${index + 1}. ${cat}`).join('\n');
          await sock.sendMessage(GRUPO_ID, { text: `📌 Categorias cadastradas:\n${listaCategorias}` });
        }
        return;
      }

      // Comando Dívida Adicionar
      if (texto.startsWith('dívida adicionar')) {
        const partes = texto.split(' ');
        const valor = partes[2];
        const credor = partes[3];
        const dataVencimento = partes[4];
        if (!valor || isNaN(valor) || !credor || !dataVencimento) {
          await sock.sendMessage(GRUPO_ID, { text: '❌ Comando inválido. Use: "dívida adicionar [valor] [credor] [dataVencimento]".' });
          return;
        }
        await axios.get(`${WEB_APP_URL}?action=adicionarDivida&valor=${valor}&credor=${credor}&dataVencimento=${dataVencimento}`);
        await sock.sendMessage(GRUPO_ID, { text: `✅ Dívida de R$ ${valor} adicionada com ${credor}, vencendo em ${dataVencimento}.` });
        return;
      }

      // Comando Dívida Listar
      if (texto === 'dívida listar') {
        const response = await axios.get(`${WEB_APP_URL}?action=listarDividas`);
        const dividas = response.data.dividas;
        if (dividas.length === 0) {
          await sock.sendMessage(GRUPO_ID, { text: "📌 Nenhuma dívida cadastrada." });
        } else {
          const listaDividas = dividas.map(d => `${d.id}. ${d.credor}: R$ ${d.valor.toFixed(2)} (Vencimento: ${d.vencimento})`).join('\n');
          await sock.sendMessage(GRUPO_ID, { text: `📌 Dívidas:\n${listaDividas}` });
        }
        return;
      }

      // Comando Lembrete Adicionar
      if (texto.startsWith('lembrete adicionar')) {
        const partes = texto.split(' ');
        const descricao = partes.slice(2, -1).join(' ');
        const data = partes[partes.length - 1];
        if (!descricao || !data) {
          await sock.sendMessage(GRUPO_ID, { text: '❌ Comando inválido. Use: "lembrete adicionar [descrição] [data]".' });
          return;
        }
        await axios.get(`${WEB_APP_URL}?action=adicionarLembrete&descricao=${descricao}&data=${data}`);
        await sock.sendMessage(GRUPO_ID, { text: `✅ Lembrete "${descricao}" adicionado para ${data}.` });
        return;
      }

      // Comando Lembrete Listar
      if (texto === 'lembrete listar') {
        const response = await axios.get(`${WEB_APP_URL}?action=listarLembretes`);
        const lembretes = response.data.lembretes;
        if (lembretes.length === 0) {
          await sock.sendMessage(GRUPO_ID, { text: "📌 Nenhum lembrete cadastrado." });
        } else {
          const listaLembretes = lembretes.map(l => `${l.id}. ${l.descricao} (${l.data})`).join('\n');
          await sock.sendMessage(GRUPO_ID, { text: `📌 Lembretes:\n${listaLembretes}` });
        }
        return;
      }

      // Comando Orçamento Definir
      if (texto.startsWith('orçamento definir')) {
        const partes = texto.split(' ');
        const categoria = partes[2];
        const valor = partes[3];
        if (!categoria || !valor || isNaN(valor)) {
          await sock.sendMessage(GRUPO_ID, { text: '❌ Comando inválido. Use: "orçamento definir [categoria] [valor]".' });
          return;
        }
        await axios.get(`${WEB_APP_URL}?action=definirOrcamento&categoria=${categoria}&valor=${valor}`);
        await sock.sendMessage(GRUPO_ID, { text: `✅ Orçamento de R$ ${valor} definido para a categoria "${categoria}".` });
        return;
      }

      // Comando Orçamento Listar
      if (texto === 'orçamento listar') {
        const response = await axios.get(`${WEB_APP_URL}?action=listarOrcamentos`);
        await sock.sendMessage(GRUPO_ID, { text: response.data });
        return;
      }

      // Comando Histórico
      if (texto.startsWith('historico')) {
        const partes = texto.split(' ');
        const tipoFiltro = partes[1] || "todos";
        const categoriaFiltro = partes[2] || "";
        const dataInicio = partes[3] || "";
        const dataFim = partes[4] || "";

        try {
          const response = await axios.get(`${WEB_APP_URL}?action=historico&tipo=${tipoFiltro}&categoria=${categoriaFiltro}&dataInicio=${dataInicio}&dataFim=${dataFim}`);
          const historico = response.data.historico;

          if (historico.length === 0) {
            await sock.sendMessage(GRUPO_ID, { text: "📌 Nenhuma transação encontrada com os filtros aplicados." });
            return;
          }

          let mensagem = "📜 Histórico de transações:\n\n";
          historico.forEach(transacao => {
            const emoji = transacao.tipo.toLowerCase() === "entrada" ? "✅" : "❌";
            mensagem += `${emoji} ${transacao.data} - ${transacao.tipo}: ${transacao.categoria} - R$ ${transacao.valor.toFixed(2)}\n`;
          });

          await sock.sendMessage(GRUPO_ID, { text: mensagem });
          return;
        } catch (error) {
          await sock.sendMessage(GRUPO_ID, { text: `❌ Erro ao buscar histórico: ${error.message}` });
        }
      }

      // Comando não reconhecido (não envia mensagem de erro)
      return;

    } catch (error) {
      await sock.sendMessage(GRUPO_ID, { text: `❌ Erro: ${error.message}` });
    }
  });
}

app.listen(3000, () => console.log("Servidor rodando!"));
iniciarBot();
