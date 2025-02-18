const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const os = require('os');
const { exec } = require('child_process');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwol5O79HdBNmRqV73cpCsmmlQC84mhwFgpNd7lpop_4EKfwpcOI7kdQDGl_dMjBM8KTQ/exec';
const GRUPO_ID = '120363403512588677@g.us';

// Função para obter a URL do WebView e os dados do Replit
function getReplitData() {
  return new Promise((resolve) => {
    exec('echo $REPL_SLUG', (err, replSlug) => {
      exec('echo $REPL_OWNER', (err, replOwner) => {
        exec('echo $REPL_ID', (err, replId) => {
          exec('echo $REPLIT_CLUSTER', (err, replCluster) => {
            replSlug = replSlug.trim();
            replOwner = replOwner.trim();
            replId = replId.trim();
            replCluster = replCluster.trim();

            const webViewUrl = replSlug && replOwner ? `https://${replSlug}.${replOwner}.repl.co` : 'Indisponível';
            const replitDevUrl = replId && replCluster ? `https://${replId}.${replCluster}.replit.dev` : 'Indisponível';

            resolve({ webViewUrl, replitDevUrl, replId, replCluster });
          });
        });
      });
    });
  });
}

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ auth: state });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.remoteJid !== GRUPO_ID) return;

    const texto = msg.message.conversation?.toLowerCase().trim();
    const remetente = msg.pushName || msg.key.participant;

    if (texto === "resumo") {
      try {
        const resposta = await axios.get(`${WEB_APP_URL}?action=resumo`);
        await sock.sendMessage(GRUPO_ID, { text: `📊 *Resumo Financeiro* 📊\n\n${resposta.data}` });
      } catch (error) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao obter resumo financeiro." });
      }
      return;
    }

    if (texto === "meta") {
      try {
        const resposta = await axios.get(`${WEB_APP_URL}?action=meta`);
        await sock.sendMessage(GRUPO_ID, { text: resposta.data });
      } catch (error) {
        await sock.sendMessage(GRUPO_ID, { text: "⚠️ Erro ao obter informações da meta." });
      }
      return;
    }
  });

  console.log("Bot iniciado!");
}

// Endpoint para exibir IP, URLs do Replit e variáveis únicas
app.get('/', async (req, res) => {
  const interfaces = os.networkInterfaces();
  let localIp = 'Não encontrado';

  for (let dev in interfaces) {
    interfaces[dev].forEach((details) => {
      if (details.family === 'IPv4' && !details.internal) {
        localIp = details.address;
      }
    });
  }

  exec('curl -s ifconfig.me', async (err, stdout) => {
    const publicIp = stdout.trim() || 'Não encontrado';
    const { webViewUrl, replitDevUrl, replId, replCluster } = await getReplitData();

    console.log(`🔗 Replit WebView URL: ${webViewUrl}`);
    console.log(`🌍 IP Público: ${publicIp}`);
    console.log(`📡 IP Local: ${localIp}`);
    console.log(`🆔 Unique Token (REPL_ID): ${replId}`);
    console.log(`🔄 Cluster Name (REPLIT_CLUSTER): ${replCluster}`);
    console.log(`🔗 Replit Dev URL: ${replitDevUrl}`);

    res.send(`
      <h2>Servidor do Bot</h2>
      <p><strong>🔗 Replit WebView URL:</strong> <a href="${webViewUrl}" target="_blank">${webViewUrl}</a></p>
      <p><strong>🌍 IP Público:</strong> ${publicIp}</p>
      <p><strong>📡 IP Local:</strong> ${localIp}</p>
      <p><strong>🆔 Unique Token (REPL_ID):</strong> ${replId}</p>
      <p><strong>🔄 Cluster Name (REPLIT_CLUSTER):</strong> ${replCluster}</p>
      <p><strong>🔗 Replit Dev URL:</strong> <a href="${replitDevUrl}" target="_blank">${replitDevUrl}</a></p>
    `);
  });
});

app.listen(3000, '0.0.0.0', async () => {
  const { webViewUrl, replitDevUrl } = await getReplitData();
  console.log(`Servidor rodando na porta 3000`);
  console.log(`🔗 WebView disponível em: ${webViewUrl}`);
  console.log(`🔗 Replit Dev URL: ${replitDevUrl}`);
});

iniciarBot();