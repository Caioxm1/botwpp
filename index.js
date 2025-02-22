const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const WebSocket = require('ws');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const cron = require('node-cron');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwnMCQOx09n2tkh7s_iEfKFMW_clqPXCF0Zt4AS3fOW52wExMuNxSOukmdxTnxTKniSBA/exec';
const GRUPO_ID = '120363403512588677@g.us';

const wss = new WebSocket.Server({ port: 8080 });
let sock;

// Configuração do gráfico
const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width: 800,
  height: 600,
  backgroundColour: 'white'
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
        const mensagemAjuda = `📝 *Comandos Disponíveis*\n\n• resumo\n• meta definir [valor] [dataInicio] [dataFim]\n• entrada [valor]\n• saída [valor]\n• média\n• grafico [bar|line] [entrada|saída|ambos] [diario|semanal|mensal]\n• historico [7d|30d|dataInicio dataFim]\n• categoria adicionar [nome]\n• categoria listar\n• relatorio [dataInicio dataFim]\n• lembrete adicionar [descricao] [valor] [data]\n• dividir [valor] [pessoas]\n• converter [valor] [moedaOrigem] [moedaDestino]\n• investir [valor] [rendimento] [meses]\n• analise\n• orcamento definir [categoria] [valor]\n• orcamento verificar [categoria]`;
        await sock.sendMessage(GRUPO_ID, { text: mensagemAjuda });
      }

      // Comando de gráfico
      else if (texto.startsWith('grafico')) {
        const partes = texto.split(' ');
        if (partes.length < 3) throw new Error("Formato: grafico [bar|line] [entrada|saída|ambos] [diario|semanal|mensal]");

        const tipoGrafico = partes[1];
        const tipoDados = partes[2];
        const periodo = partes[3] || "todos";

        const response = await axios.get(`${WEB_APP_URL}?action=getDadosGrafico&tipo=${tipoDados}&periodo=${periodo}`);
        const image = await gerarGrafico(tipoGrafico, response.data);
        await sock.sendMessage(GRUPO_ID, { image: image, caption: `📊 ${response.data.titulo}` });
      }

      // Comando para resumo financeiro
      else if (texto === 'resumo') {
        const resumo = await axios.get(WEB_APP_URL);
        await sock.sendMessage(GRUPO_ID, { text: resumo.data });
      }

      // Comando para definir meta
      else if (texto.startsWith('meta definir')) {
        const partes = texto.split(' ');
        if (partes.length < 5) throw new Error("Formato: meta definir [valor] [dataInicio] [dataFim]");

        const valor = partes[2];
        const dataInicio = partes[3];
        const dataFim = partes[4];

        await axios.post(WEB_APP_URL, { action: "definirMeta", valor: valor, dataInicio: dataInicio, dataFim: dataFim });
        await sock.sendMessage(GRUPO_ID, { text: `✅ Meta de R$${valor} definida de ${dataInicio} até ${dataFim}.` });
      }

      // Comando para registrar entrada
      else if (texto.startsWith('entrada')) {
        const partes = texto.split(' ');
        if (partes.length < 2) throw new Error("Formato: entrada [valor]");

        const valor = partes[1];
        await axios.post(WEB_APP_URL, { tipo: "Entrada", valor: valor, remetente: remetente });
        await sock.sendMessage(GRUPO_ID, { text: `✅ Entrada de R$${valor} registrada por ${remetente}.` });
      }

      // Comando para registrar saída
      else if (texto.startsWith('saída')) {
        const partes = texto.split(' ');
        if (partes.length < 2) throw new Error("Formato: saída [valor]");

        const valor = partes[1];
        await axios.post(WEB_APP_URL, { tipo: "Saída", valor: valor, remetente: remetente });
        await sock.sendMessage(GRUPO_ID, { text: `✅ Saída de R$${valor} registrada por ${remetente}.` });
      }

      // Comando para média de entradas
      else if (texto === 'média') {
        const media = await axios.get(`${WEB_APP_URL}?action=mediaEntradas`);
        await sock.sendMessage(GRUPO_ID, { text: media.data });
      }

      // Comando para histórico de transações
      else if (texto.startsWith('historico')) {
        const periodo = texto.split(' ')[1] || "30d"; // Padrão: últimos 30 dias
        const response = await axios.get(`${WEB_APP_URL}?action=historico&periodo=${periodo}`);
        const transacoes = response.data;

        let mensagem = `📜 Histórico dos últimos ${periodo}:\n`;
        transacoes.forEach(transacao => {
          mensagem += `${transacao[1] === "Entrada" ? "✅" : "❌"} ${transacao[1]}: R$ ${transacao[2].toFixed(2)} - ${transacao[3]} (${transacao[0]})\n`;
        });

        await sock.sendMessage(GRUPO_ID, { text: mensagem });
      }

      // Comando para adicionar categoria
      else if (texto.startsWith('categoria adicionar')) {
        const categoria = texto.split(' ').slice(2).join(' ');
        await axios.post(WEB_APP_URL, { action: "adicionarCategoria", categoria: categoria });
        await sock.sendMessage(GRUPO_ID, { text: `📌 Categoria "${categoria}" adicionada com sucesso.` });
      }

      // Comando para listar categorias
      else if (texto.startsWith('categoria listar')) {
        const response = await axios.get(`${WEB_APP_URL}?action=listarCategorias`);
        const categorias = response.data.map(row => row[0]).join('\n- ');
        await sock.sendMessage(GRUPO_ID, { text: `📌 Categorias cadastradas:\n- ${categorias}` });
      }

      // Comando para relatório personalizado
      else if (texto.startsWith('relatorio')) {
        const [_, dataInicio, dataFim] = texto.split(' ');
        const response = await axios.get(`${WEB_APP_URL}?action=relatorio&dataInicio=${dataInicio}&dataFim=${dataFim}`);
        const { totalEntrada, totalSaida, transacoes } = response.data;

        let mensagem = `📊 Relatório de ${dataInicio} a ${dataFim}:\n`;
        mensagem += `✅ Total de entradas: R$ ${totalEntrada.toFixed(2)}\n`;
        mensagem += `❌ Total de saídas: R$ ${totalSaida.toFixed(2)}\n`;
        mensagem += `💰 Saldo final: R$ ${(totalEntrada - totalSaida).toFixed(2)}\n`;

        await sock.sendMessage(GRUPO_ID, { text: mensagem });
      }

      // Comando para adicionar lembrete
      else if (texto.startsWith('lembrete adicionar')) {
        const [_, descricao, valor, data] = texto.split(' ');
        lembretes.push({ descricao, valor, data });
        await sock.sendMessage(GRUPO_ID, { text: `🔔 Lembrete salvo: "${descricao} - R$ ${valor}" para ${data}.` });
      }

      // Comando para dividir despesas
      else if (texto.startsWith('dividir')) {
        const [_, valor, pessoas] = texto.split(' ');
        const valorPorPessoa = (parseFloat(valor) / parseInt(pessoas)).toFixed(2);
        await sock.sendMessage(GRUPO_ID, { text: `💰 Divisão de despesas:\nValor total: R$ ${valor}\nNúmero de pessoas: ${pessoas}\nCada pessoa deve pagar: R$ ${valorPorPessoa}` });
      }

      // Comando para converter moedas
      else if (texto.startsWith('converter')) {
        const [_, valor, moedaOrigem, moedaDestino] = texto.split(' ');
        const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/${moedaOrigem}`);
        const taxa = response.data.rates[moedaDestino];
        const valorConvertido = (parseFloat(valor) * taxa).toFixed(2);
        await sock.sendMessage(GRUPO_ID, { text: `💱 Conversão:\n${valor} ${moedaOrigem} = ${valorConvertido} ${moedaDestino} (cotação de hoje: 1 ${moedaOrigem} = ${taxa} ${moedaDestino})` });
      }

      // Comando para simular investimento
      else if (texto.startsWith('investir')) {
        const [_, valor, rendimento, meses] = texto.split(' ');
        const valorFinal = (parseFloat(valor) * Math.pow(1 + (parseFloat(rendimento) / 100), parseInt(meses))).toFixed(2);
        await sock.sendMessage(GRUPO_ID, { text: `📈 Simulação de investimento:\nValor inicial: R$ ${valor}\nRendimento: ${rendimento}% ao mês\nTempo: ${meses} meses\nValor final estimado: R$ ${valorFinal}` });
      }

      // Comando para análise de gastos
      else if (texto === 'analise') {
        const response = await axios.get(`${WEB_APP_URL}?action=analiseGastos`);
        const gastosPorCategoria = response.data;

        let mensagem = `📊 Análise de gastos:\n`;
        for (const [categoria, valor] of Object.entries(gastosPorCategoria)) {
          mensagem += `📌 ${categoria}: R$ ${valor.toFixed(2)}\n`;
        }

        await sock.sendMessage(GRUPO_ID, { text: mensagem });
      }

      // Comando para definir orçamento
      else if (texto.startsWith('orcamento definir')) {
        const [_, categoria, valor] = texto.split(' ');
        await axios.post(WEB_APP_URL, { action: "definirOrcamento", categoria: categoria, valor: valor });
        await sock.sendMessage(GRUPO_ID, { text: `📌 Orçamento de R$ ${valor} definido para ${categoria}.` });
      }

      // Comando para verificar orçamento
      else if (texto.startsWith('orcamento verificar')) {
        const categoria = texto.split(' ')[2];
        const response = await axios.get(`${WEB_APP_URL}?action=verificarOrcamento&categoria=${categoria}`);
        const orcamento = response.data;
        await sock.sendMessage(GRUPO_ID, { text: `📌 Orçamento para ${categoria}: R$ ${orcamento[1]}` });
      }

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
