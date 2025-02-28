const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const WebSocket = require('ws');
const { exec } = require('child_process');

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbw8OpF0ntX1yjZFORdjVUYypXcpxRLzvO4mnjc6x4BylfPsOfTSeZDQHLpzjfIcToAo7Q/exec';
const GRUPO_ID = '120363403512588677@g.us';
const OPENROUTER_API_KEY = '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'; // Substitua pela sua chave de API do OpenRouter

const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width: 800,
  height: 600,
  backgroundColour: 'white'
});

const wss = new WebSocket.Server({ port: 8080 });

let ultimoComandoProcessado = null;

// Função de fallback para interpretar mensagens manualmente
function interpretarMensagemManual(texto) {
  const palavras = texto.toLowerCase().split(' ');
  const valorMatch = texto.match(/\d+/);
  const valor = valorMatch ? parseFloat(valorMatch[0]) : null;

  // Mapeamento de palavras-chave para categorias
  const categorias = {
    táxi: 'Transporte',
    uber: 'Transporte',
    comida: 'Alimentação',
    restaurante: 'Alimentação',
    salário: 'Salário',
    netflix: 'Assinaturas',
    spotify: 'Assinaturas',
    mercado: 'Compras',
    supermercado: 'Compras',
    transporte: 'Transporte',
    alimentação: 'Alimentação',
    compras: 'Compras',
    assinatura: 'Assinaturas'
  };

  let categoria = 'Outros';
  for (const [palavra, cat] of Object.entries(categorias)) {
    if (palavras.includes(palavra)) {
      categoria = cat;
      break;
    }
  }

  // Determina o tipo de transação
  const tipo = palavras.includes('usei') || palavras.includes('gastei') || palavras.includes('paguei') ? 'Saída' : 'Entrada';

  if (!valor) {
    return null; // Não foi possível extrair um valor
  }

  return { valor, categoria, tipo };
}

// Função para interpretar mensagens livres usando o OpenRouter
async function interpretarMensagemComOpenRouter(texto) {
  try {
    const comandoCurl = `
      curl https://openrouter.ai/api/v1/chat/completions \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${OPENROUTER_API_KEY}" \
        -d '{
        "model": "deepseek/deepseek-r1:free",
        "messages": [
          {
            "role": "user",
            "content": "Interpretar a seguinte mensagem como uma transação financeira: \\"${texto}\\". Retorne um JSON com \\"valor\\", \\"categoria\\" e \\"tipo\\" (Entrada ou Saída)."
          }
        ]
      }'`;

    return new Promise((resolve, reject) => {
      exec(comandoCurl, (error, stdout, stderr) => {
        if (error) {
          console.error(`Erro ao executar curl: ${error.message}`);
          reject(error);
        }
        if (stderr) {
          console.error(`stderr: ${stderr}`);
          reject(stderr);
        }

        console.log("Resposta do curl:", stdout); // Adicionado para ver a resposta do curl

        try {
          // Parseia a resposta do curl
          const resposta = JSON.parse(stdout);

          // Verifica se o campo 'content' está presente e não está vazio
          if (
            resposta.choices &&
            resposta.choices[0] &&
            resposta.choices[0].message &&
            resposta.choices[0].message.content
          ) {
            const content = resposta.choices[0].message.content.trim();

            // Extrai o JSON válido do campo 'content'
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch && jsonMatch[1]) {
              const jsonValido = jsonMatch[1].trim();
              const interpretacao = JSON.parse(jsonValido);
              return resolve(interpretacao);
            } else {
              console.log("Nenhum JSON válido encontrado no campo 'content'. Usando fallback manual...");
              resolve(interpretarMensagemManual(texto));
            }
          } else {
            console.log("Campo 'content' vazio ou ausente. Usando fallback manual...");
            resolve(interpretarMensagemManual(texto));
          }
        } catch (parseError) {
          console.error("Erro ao interpretar a resposta do curl:", parseError);
          reject(parseError);
        }
      });
    });
  } catch (error) {
    console.error("Erro ao interpretar mensagem com OpenRouter. Usando fallback manual...");
    return interpretarMensagemManual(texto); // Fallback manual
  }
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
      // Verifica se a mensagem é um comando existente
      const comandosExistentes = [
        'ajuda', 'resumo', 'poupança', 'entrada', 'saída', 'média', 'grafico',
        'categoria adicionar', 'listar categorias', 'dívida adicionar', 'dívida listar',
        'lembrete adicionar', 'lembrete listar', 'orçamento definir', 'orçamento listar',
        'historico', 'excluir'
      ];

      const isComandoExistente = comandosExistentes.some(comando => texto.startsWith(comando));

      if (isComandoExistente) {
        // Processa comandos existentes normalmente
        // (O código original para processar comandos existentes permanece aqui)
        // ...
      } else {
        // Interpreta a mensagem como uma transação livre
        const interpretacao = await interpretarMensagemComOpenRouter(texto);

        if (interpretacao) {
          const { valor, categoria, tipo } = interpretacao;

          if (tipo === 'Saída') {
            await axios.get(`${WEB_APP_URL}?action=saída&valor=${valor}&categoria=${categoria}&remetente=${remetente}`);
            await sock.sendMessage(GRUPO_ID, { text: `✅ Saída de R$ ${valor} registrada na categoria "${categoria}" por ${remetente}.` });
          } else if (tipo === 'Entrada') {
            await axios.get(`${WEB_APP_URL}?action=entrada&valor=${valor}&remetente=${remetente}`);
            await sock.sendMessage(GRUPO_ID, { text: `✅ Entrada de R$ ${valor} registrada por ${remetente}.` });
          }
        } else {
          await sock.sendMessage(GRUPO_ID, { text: "Não entendi a mensagem. Use comandos como 'entrada 100' ou 'saída 50 Transporte'." });
        }
      }
    } catch (error) {
      await sock.sendMessage(GRUPO_ID, { text: `❌ Erro: ${error.message}` });
    }
  });
}

app.listen(3000, () => console.log("Servidor rodando!"));
iniciarBot();
