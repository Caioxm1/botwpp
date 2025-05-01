require('dotenv').config({ path: '/home/caio_eduardo_904/.env_botwpp' });
const crypto = require('crypto');
globalThis.crypto = crypto.webcrypto;
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const WebSocket = require('ws');
const app = express();
app.use(express.json());

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const CHAVE_API = process.env.CHAVE_API;
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxCvncEt0N6ZQ1ubQCzyYnCeT-ai-a9OHqGdhbmBVNixwzB7ftYOGVLdT4sB2Xp3yf0MQ/exec';
const GRUPOS_PERMITIDOS = [
  '120363403512588677@g.us', // Grupo original
  '120363415954951531@g.us' // Novo grupo
]; // ID do grupo onde o bot está vinculado
const USUARIOS_AUTORIZADOS = [
  '5521975874116@s.whatsapp.net', // N1
  '5521976919619@s.whatsapp.net' // N2
];
const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width: 800,
  height: 600,
  backgroundColour: 'white'
});

const wss = new WebSocket.Server({ port: 8080 });

let ultimoComandoProcessado = null;

// Declare sock no escopo global
let sock = null;

// Depois faça o log das configurações
console.log("Grupos permitidos:", GRUPOS_PERMITIDOS);
console.log("Usuários autorizados:", USUARIOS_AUTORIZADOS);

// Configure no início do arquivo
const fluxoAgendamento = {
  INICIO: {
    mensagem: (nome) => `Olá ${nome}! Vamos agendar seu serviço? Qual seu nome completo?`,
    proximoEstado: 'AGUARDANDO_NOME'
  },
  AGUARDANDO_NOME: {
    acao: async (telefone, resposta) => {
      // Salva nome na planilha
      await axios.get(`${WEB_APP_URL}?action=atualizarEtapa&telefone=${telefone}&etapa=AGUARDANDO_SERVICO&nome=${resposta}`);
      
      // Busca serviços
      const servicos = await axios.get(`${WEB_APP_URL}?action=listarServicos`);
      const listaServicos = servicos.data.map(s => `🔹 ${s.nome} - R$ ${s.preco} (${s.duracao}min)`).join('\n');
      
      return {
        mensagem: `🛎️ *Serviços Disponíveis:*\n\n${listaServicos}\n\nDigite os números dos serviços desejados (Ex: 1,3)`,
        proximoEstado: 'AGUARDANDO_SERVICOS'
      };
    }
  },
  AGUARDANDO_SERVICOS: {
    acao: async (telefone, resposta) => {
      // Valida números
      const numeros = resposta.split(',').map(n => parseInt(n.trim()));
      
      // Obtém detalhes
      const servicosEscolhidos = await axios.get(`${WEB_APP_URL}?action=obterServicos&ids=${numeros.join(',')}`);
      
      // Salva na planilha
      await axios.get(`${WEB_APP_URL}?action=salvarServicos&telefone=${telefone}&servicos=${JSON.stringify(servicosEscolhidos.data)}`);
      
      // Busca disponibilidade
      const horarios = await axios.get(`${WEB_APP_URL}?action=verificarHorarios`);
      
      return {
        mensagem: `📅 *Horários Disponíveis:*\n\n${horarios.data.join('\n')}\n\nEscolha um horário (Ex: 25/05 15:00)`,
        proximoEstado: 'AGUARDANDO_HORARIO'
      };
    }
  },
  // ... Continue o padrão para outras etapas
};

// Endpoint para enviar mensagens
app.post('/api/send-message', async (req, res) => {
  if (req.body.apiKey !== CHAVE_API) {
    return res.status(403).json({ error: 'Acesso negado!' });
  }

  try {
    if (!sock || sock.connection === 'close') {
      await iniciarConexaoWhatsApp(); // Reconecta se necessário
    }

    const jid = `${req.body.number}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: req.body.message });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao enviar mensagem: ' + error.message });
  }
});
// Lista de comandos para o comando "ajuda"
const LISTA_DE_COMANDOS = `
📋 *Lista de Comandos* 📋

💰 *Resumo Financeiro*
- resumo: Mostra um resumo financeiro.

💸 *Transações*
- entrada [valor]: Registra uma entrada de dinheiro.
- saída [valor] [categoria]: Registra uma saída de dinheiro em uma categoria específica.
- poupança [valor]: Adiciona um valor à poupança.

🛒 *Pedidos e Clientes*
- adicionar pedido [cliente] [produto] [quantidade] [precoUnitario]: Registra um novo pedido para um cliente com detalhes do produto, quantidade e preço.
- consultar pedidos [cliente] [data]: Consulta todos os pedidos de um cliente (opcional: filtra por data). Sinônimos: "lista de pedidos", "ver pedidos", "pedidos do cliente".
- listar clientes: Mostra todos os clientes cadastrados no sistema. Sinônimos: "meus clientes", "clientes registrados", "quais são meus clientes".

📅 *Agendamentos*
- agendar [serviço] [data] [hora]: Agenda um novo serviço
- meus agendamentos: Lista seus compromissos
- cancelar agendamento [id]: Cancela um agendamento

📈 *Análise Inteligente*
- análise: Gera uma análise detalhada dos gastos e insights financeiros.

📊 *Gráficos e Estatísticas*
- média: Mostra a média de entradas.
- grafico [tipo] [dados] [periodo]: Gera um gráfico com base nos dados fornecidos.

📌 *Categorias*
- categoria adicionar [nome]: Adiciona uma nova categoria.
- listar categorias: Lista todas as categorias.

📅 *Orçamentos*
- orçamento [número]: Mostra o resumo de um orçamento específico.
- orçamento definir [categoria] [valor]: Define um orçamento para uma categoria.
- orçamento listar: Lista todos os orçamentos.
- orçamento excluir [número]: Exclui um orçamento específico.

💳 *Dívidas*
- dívida adicionar [valor] [credor] [dataVencimento]: Adiciona uma dívida.
- dívida pagar [número]: Marca uma dívida como paga.
- dívida excluir [número]: Remove uma dívida específica.
- dívida detalhes [número]: Mostra informações completas.
- dívida listar [filtro]: Lista dívidas (opções: atrasadas, pagas)
- dívida listar [categoria]: Filtra por categoria
- dívida alerta [dias]: Configura alertas.

⏰ *Lembretes*
- lembrete adicionar [descrição] [data]: Adiciona um lembrete.
- lembrete listar: Lista todos os lembretes.

📜 *Histórico*
- historico [tipo] [categoria] [dataInicio] [dataFim]: Mostra o histórico de transações.

📄 *Relatórios*
- pdf: Gera um relatório completo em PDF

❌ *Exclusão*
- excluir [número(s)]: Exclui transações específicas.
- excluir tudo: Exclui todas as transações.
- excluir dia [data]: Exclui transações de um dia específico.
- excluir periodo [dataInicio] [dataFim]: Exclui transações de um período específico.

🔧 *Ajuda*
- ajuda: Mostra esta lista de comandos.
`;

// Função para interpretar mensagens usando o OpenRouter
async function interpretarMensagemComOpenRouter(texto) {
  console.log("Iniciando interpretação da mensagem com OpenRouter...");
  try {
    const resposta = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'deepseek/deepseek-chat-v3-0324:free',
        messages: [
          {
            role: 'user',
            content: `Você é um assistente virtual que ajuda com finanças e também pode conversar sobre outros assuntos. Responda de forma amigável e útil.
            Se a mensagem começar com '/', é um comando interno e deve retornar JSON vazio. Exemplos:
            - Mensagem: '/adicionar servico Corte 30 50'
            - JSON: {}
            - Mensagem: 'Olá, quero agendar'
            - JSON: { ...fluxo normal... }
            Mensagem: ${JSON.stringify(texto)}`
          }
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY.trim()}`,
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'Bot Financeiro'
        },
        timeout: 3000 // 10 segundos de timeout
      }
    );

    if (resposta.status === 401) {
      throw new Error("Erro de autenticação: Chave de API inválida ou expirada");
    }

    // Verificação de status adicionada
    if (resposta.status !== 200) {
      throw new Error(`Erro na API: ${resposta.status} - ${resposta.statusText}`);
    }

    console.log("Resposta da API OpenRouter recebida:", JSON.stringify(resposta.data, null, 2));

    // Acessa o conteúdo da mensagem
    const mensagem = resposta.data.choices[0].message.content;

    // Tenta extrair o JSON da resposta
    const jsonMatch = mensagem.match(/\{.*\}/s); // Extrai o JSON da string
    if (jsonMatch) {
      try {
        const interpretacao = JSON.parse(jsonMatch[0]);
        console.log("Interpretação da mensagem:", interpretacao);
        return interpretacao;
      } catch (erro) {
        console.error("Erro ao analisar JSON:", erro);
        return null;
      }
    } else {
      console.log("Nenhum JSON válido encontrado no campo 'content'. Usando fallback manual...");
      return interpretarMensagemManual(texto); // Fallback manual
    }
  } catch (erro) {
    console.error("Erro detalhado na API OpenRouter:", {
      message: erro.message,
      response: erro.response?.data,
      status: erro.response?.status
    });
    
    if (erro.response?.status === 401) {
      throw new Error("❌ Erro de autenticação com a API OpenRouter. Verifique sua chave de API.");
    }
    
    return null;
  }
}

// Função para gerar uma resposta de conversação usando o OpenRouter
async function gerarRespostaConversacao(texto) {
  console.log("Gerando resposta de conversação com OpenRouter...");
  try {
    const resposta = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'deepseek/deepseek-chat-v3-0324:free',
        messages: [
          {
            role: 'user',
            content: `Você é um assistente virtual que ajuda com finanças e também pode conversar sobre outros assuntos. Responda de forma amigável e útil.
            Mensagem: ${JSON.stringify(texto)}`
          }
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY.trim()}`, // <-- Vírgula aqui
          'HTTP-Referer': 'http://localhost', // Usar localhost
          'X-Title': 'Bot Financeiro'
        }
      }
    );

// Verificação de status adicionada
    if (resposta.status !== 200) {
      throw new Error(`Erro na API: ${resposta.status} - ${resposta.statusText}`);
    }
    
    console.log("Resposta da API OpenRouter recebida:", JSON.stringify(resposta.data, null, 2));

    // Acessa o conteúdo da mensagem
    const mensagem = resposta.data.choices[0].message.content;
    return mensagem;
  } catch (erro) {
    console.error("Erro detalhado na geração de resposta:", {
      message: erro.message,
      stack: erro.stack,
      response: erro.response?.data
    });
    return "❌ Erro interno. Tente novamente mais tarde.";
  }
}

function interpretarMensagemManual(texto) {
  console.log("Usando fallback manual para interpretar a mensagem...");
  const palavras = texto.toLowerCase().split(' ');
  const valorMatch = texto.match(/\d+/);
  const valor = valorMatch ? parseFloat(valorMatch[0]) : null;
 
    // Fallback para o comando "consultar pedidos"
    if (texto.match(/lista de pedidos|pedidos do cliente|ver pedidos/i)) {
      const cliente = texto.split(/da |do |cliente /i)[1]?.split(/\d{2}\/\d{2}/)[0]?.trim();
      const dataMatch = texto.match(/(\d{2}\/\d{2}\/?\d{0,4})/);
      const data = dataMatch ? dataMatch[0] : null;
      return { comando: "consultar pedidos", parametros: { cliente, data } };
    }

    
if (texto.toLowerCase() === "pdf") {
    return { comando: "pdf", parametros: {} };
  }
  
  
    // Fallback para "listar clientes"
    if (texto.match(/meus clientes|clientes cadastrados|quais clientes/i)) {
      return { comando: "listar clientes" };
    }

    // Fallback para "historico"
    if (texto.match(/histórico|historico/i)) {
      const dataMatch = texto.match(/(\d{2}\/\d{2}\/?\d{0,4})/g) || [];
      const [dataInicio, dataFim] = dataMatch;
      
      return { 
        comando: "historico", 
        parametros: { 
          dataInicio: dataInicio || "", 
          dataFim: dataFim || dataInicio || "" 
        }
      };
    }

if (texto.toLowerCase().includes("análise") || texto.toLowerCase().includes("analise")) {
  return { comando: "análise" };
}
  
    // Mapeamento de palavras-chave para categorias
  const categorias = {
    // Alimentação
    arroz: 'Alimentação',
    alho: 'Alimentação',
    feijão: 'Alimentação',
    carne: 'Alimentação',
    frango: 'Alimentação',
    peixe: 'Alimentação',
    leite: 'Alimentação',
    pão: 'Alimentação',
    macarrão: 'Alimentação',
    óleo: 'Alimentação',
    açúcar: 'Alimentação',
    café: 'Alimentação',
    refrigerante: 'Alimentação',
    suco: 'Alimentação',
    fruta: 'Alimentação',
    verdura: 'Alimentação',
    legume: 'Alimentação',
    comida: 'Alimentação',
    restaurante: 'Alimentação',
    lanche: 'Alimentação',
    mercado: 'Alimentação',
    supermercado: 'Alimentação',

    // Transporte
    táxi: 'Transporte',
    uber: 'Transporte',
    ônibus: 'Transporte',
    gasolina: 'Transporte',
    combustível: 'Transporte',
    estacionamento: 'Transporte',
    metro: 'Transporte',
    bilhete: 'Transporte',
    passagem: 'Transporte',

    // Lazer
    cinema: 'Lazer',
    Netflix: 'Lazer',
    Spotify: 'Lazer',
    parque: 'Lazer',
    viagem: 'Lazer',
    jogo: 'Lazer',
    festa: 'Lazer',
    bar: 'Lazer',
    show: 'Lazer',
    teatro: 'Lazer',
    museu: 'Lazer',
    passeio: 'Lazer',

    // Moradia
    casa: 'Moradia',
    aluguel: 'Moradia',
    condomínio: 'Moradia',
    luz: 'Moradia',
    água: 'Moradia',
    internet: 'Moradia',
    telefone: 'Moradia',
    gás: 'Moradia',
    reforma: 'Moradia',
    móveis: 'Moradia',
    decoração: 'Moradia',

    // Saúde
    médico: 'Saúde',
    remédio: 'Saúde',
    farmácia: 'Saúde',
    hospital: 'Saúde',
    plano: 'Saúde',
    dentista: 'Saúde',
    consulta: 'Saúde',
    exame: 'Saúde',
    óculos: 'Saúde',
    fisioterapia: 'Saúde',

    // Educação
    escola: 'Educação',
    curso: 'Educação',
    faculdade: 'Educação',
    livro: 'Educação',
    material: 'Educação',
    mensalidade: 'Educação',
    matrícula: 'Educação',
    aula: 'Educação',
    workshop: 'Educação',
    seminário: 'Educação',

    // Vestuário
    roupa: 'Vestuário',
    camiseta: 'Vestuário',
    calça: 'Vestuário',
    sapato: 'Vestuário',
    tênis: 'Vestuário',
    blusa: 'Vestuário',
    jaqueta: 'Vestuário',
    bolsa: 'Vestuário',
    acessório: 'Vestuário',
    óculos: 'Vestuário',
    lingerie: 'Vestuário',

    // Assinaturas
    Netflix: 'Assinaturas',
    Spotify: 'Assinaturas',
    Amazon: 'Assinaturas',
    Disney: 'Assinaturas',
    HBO: 'Assinaturas',
    revista: 'Assinaturas',
    jornal: 'Assinaturas',
    software: 'Assinaturas',
    app: 'Assinaturas',

    // Presentes
    presente: 'Presentes',
    aniversário: 'Presentes',
    natal: 'Presentes',
    casamento: 'Presentes',
    flores: 'Presentes',
    cartão: 'Presentes',
    lembrancinha: 'Presentes',

    // Animais de Estimação
    pet: 'Animais de Estimação',
    ração: 'Animais de Estimação',
    veterinário: 'Animais de Estimação',
    banho: 'Animais de Estimação',
    tosa: 'Animais de Estimação',
    brinquedo: 'Animais de Estimação',
    coleira: 'Animais de Estimação',

    // Outros
    doação: 'Outros',
    caridade: 'Outros',
    multa: 'Outros',
    imposto: 'Outros',
    taxa: 'Outros',
    seguro: 'Outros',
    conserto: 'Outros',
    manutenção: 'Outros',
    reparo: 'Outros'
  };

  let categoria = 'Outros'; // Categoria padrão caso não encontre uma correspondência
  for (const [palavra, cat] of Object.entries(categorias)) {
    if (palavras.includes(palavra)) {
      categoria = cat;
      break;
    }
  }

  // Determina o tipo de transação
  const tipo = palavras.includes('usei') || palavras.includes('gastei') || palavras.includes('paguei') || palavras.includes('comprei') ? 'Saída' : 'Entrada';

  if (!valor) {
    return null; // Não foi possível extrair um valor
  }

  return { valor, categoria, tipo };
}

// Função para gerar gráficos
async function gerarGrafico(tipo, dados) {
  console.log("Gerando gráfico...");
  const configuration = {
    type: tipo, // 'bar' é o tipo de gráfico válido
    data: {
      labels: dados.labels, // Rótulos do eixo X
      datasets: dados.datasets // Conjuntos de dados
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: dados.titulo, font: { size: 18 } }, // Título do gráfico
        legend: { position: 'top' } // Legenda no topo
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => 'R$ ' + value.toFixed(2).replace(".", ",") } // Formata os valores do eixo Y
        }
      }
    }
  };
  return chartJSNodeCanvas.renderToBuffer(configuration);
}

// Substituir a função pareceSerComandoFinanceiro
function isComandoEspecifico(texto) {
  // Lista de comandos que NÃO devem acionar a OpenRouter
  const comandosLocais = [
    '/adicionar', '/agendar', '/cancelar', 
    '/listar', '/pagar', '/excluir', '!id'
  ];

  return comandosLocais.some(comando => 
    texto.toLowerCase().startsWith(comando.toLowerCase())
  );
}

// Atualizar o Handler de Mensagens
sock.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages[0];
  if (!msg?.message?.conversation) return;

  const texto = msg.message.conversation.trim();
  const jid = msg.key.remoteJid;

  // Passo 1: Verificar se é comando local
  if (isComandoEspecifico(texto)) {
    // Processar comandos internos SEM OpenRouter
    processarComandoLocal(texto, jid);
    return;
  }

  // Passo 2: Verificar se está em fluxo de agendamento
  if (estadosAgendamento.has(telefone)) {
    continuarFluxoAgendamento(texto, jid);
    return;
  }

  // Passo 3: Usar OpenRouter apenas para mensagens genéricas
  const resposta = await gerarRespostaConversacao(texto);
  await sock.sendMessage(jid, { text: resposta });
});

// Adicionar Função de Processamento de Comandos
async function processarComandoLocal(texto, jid) {
  const [comando, ...params] = texto.split(' ');
  
  switch(comando.toLowerCase()) {
    case '/adicionar':
      if (params[0] === 'servico') {
        const [nome, duracao, preco] = params.slice(1);
        await axios.get(`${WEB_APP_URL}?action=adicionarServico&nome=${nome}&duracao=${duracao}&preco=${preco}`);
        await sock.sendMessage(jid, { 
          text: `✅ Serviço "${nome}" cadastrado com sucesso!`
        });
      }
      break;

    case '/agendar':
      // Lógica específica de agendamento
      break;

    // Adicione outros comandos...
  }
}

// Função principal do bot
async function iniciarConexaoWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    syncFullHistory: false,
    connectTimeoutMs: 120_000,
    keepAliveIntervalMs: 25_000,
    browser: ['Bot Financeiro', 'Chrome', '115.0.0.0'],
    shouldIgnoreJid: jid => {
      const isGrupoAutorizado = GRUPOS_PERMITIDOS.includes(jid);
      const isUsuarioAutorizado = USUARIOS_AUTORIZADOS.includes(jid);
      return !(isGrupoAutorizado || isUsuarioAutorizado);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update;
    
    if (qr) {
      const qrLink = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`;
      console.log('QR Code:', qrLink);
      wss.clients.forEach(client => client.send(JSON.stringify({ qr: qrLink })));
    }
    
    if (connection === 'open') console.log('Bot conectado!');
    if (connection === 'close') setTimeout(iniciarConexaoWhatsApp, 5000);
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg?.message || !msg.key?.remoteJid) return;
    

  const remetente = msg?.pushName || "Usuário";
  const texto = msg.message.conversation.trim().toLowerCase();

// Passo 1: Verificar se é comando local
  if (isComandoEspecifico(texto)) {
    // Processar comandos internos SEM OpenRouter
    processarComandoLocal(texto, jid);
    return;
  }

  // Passo 2: Verificar se está em fluxo de agendamento
  if (estadosAgendamento.has(telefone)) {
    continuarFluxoAgendamento(texto, jid);
    return;
  }

  // Passo 3: Usar OpenRouter apenas para mensagens genéricas
  const resposta = await gerarRespostaConversacao(texto);
  await sock.sendMessage(jid, { text: resposta });



  // Log para depuração
  console.log(`=== Nova mensagem ===`);
  console.log(`De: ${msg.key.participant || msg.key.remoteJid}`);
  console.log(`Texto: ${texto}`);
  console.log(`Grupo: ${msg.key.remoteJid}`);

  // Verificação 3 - Permissões
  const isGrupoValido = GRUPOS_PERMITIDOS.includes(msg.key.remoteJid);
  const isUsuarioValido = USUARIOS_AUTORIZADOS.includes(msg.key.participant);

  if (!isGrupoValido && !isUsuarioValido) {
    console.log("Mensagem bloqueada por permissões");
    return;
  }

// Verificação única da mensagem
  if (
    !msg?.message || 
    !msg.key?.remoteJid || 
    typeof msg.message.conversation !== 'string'
  ) {
    console.log("Mensagem ignorada (formato inválido).");
    return;
  }
    
    // Verificação completa da estrutura da mensagem
    if (
      !msg?.message || 
      !msg.key?.remoteJid || 
      typeof msg.message.conversation !== 'string'
  ) {
      console.log("Mensagem ignorada (formato inválido).");
      return;
  }

  // Comando !id (funciona em qualquer grupo)
  if (texto.toLowerCase() === "!id") {
    const grupoId = msg.key.remoteJid;
    await sock.sendMessage(grupoId, { 
      text: `🔑 ID deste grupo: *${grupoId}*` 
    });
    return;
  }

  // --- Verificações de grupo e usuário ---
  console.log("Grupo Remetente:", msg.key.remoteJid);
  
  // Primeiro verifica se é um grupo permitido
  if (GRUPOS_PERMITIDOS.includes(msg.key.remoteJid)) {
    console.log("Mensagem de grupo autorizado:", msg.key.remoteJid);
  } else {
    console .log("Grupo não autorizado ou chat privado:", msg.key.remoteJid);
    return; // Ignora mensagens de grupos não autorizados e chats privados
  }

  // Depois verifica usuário autorizado (mesmo em grupos)
const remetenteId = msg.key.participant || msg.key.remoteJid;
if (!USUARIOS_AUTORIZADOS.includes(remetenteId)) {
  console.log("Usuário não autorizado:", remetenteId);
  return;
}

    // Ignora apenas mensagens que começam com "❌" (respostas automáticas do bot)
    if (msg.message.conversation?.startsWith("❌")) {
      console.log("Mensagem ignorada (resposta automática do bot).");
      return;
    }

    // Verifica se a mensagem é do tipo 'conversation' (texto)
    if (!GRUPOS_PERMITIDOS.includes(msg.key.remoteJid)) return;

    // Verifica se a mensagem é antiga (mais de 60 segundos)
    const mensagemTimestamp = msg.messageTimestamp;
    const agora = Math.floor(Date.now() / 1000);
    if (agora - mensagemTimestamp > 60) {
      console.log("Mensagem ignorada (é uma mensagem antiga).");
      return;
    }

    console.log("Mensagem recebida:", JSON.stringify(msg, null, 2));

  // Nome do remetente (apenas para exibição)
  const remetenteNome = msg.pushName || "Usuário"; // Nome exibido no WhatsApp
// Comando para obter o ID do grupo
if (texto.toLowerCase() === "!id") {
  const grupoId = msg.key.remoteJid;
  await sock.sendMessage(grupoId, { 
    text: `📌 ID deste grupo: *${grupoId}*` 
  });
  return;
}
      
  console.log("Texto da mensagem:", texto);

  

    // --- VERIFICAÇÃO DO COMANDO "AJUDA" ---
  if (texto.toLowerCase() === "ajuda") {
    await sock.sendMessage(msg.key.remoteJid, { text: LISTA_DE_COMANDOS });
    return; // Encerra o processamento aqui
  }

    try {
      if (pareceSerComandoFinanceiro(texto)) {
        console.log("Tentando interpretar a mensagem como um comando financeiro...");
        const interpretacao = await interpretarMensagemComOpenRouter(texto);
        console.log("Interpretação da mensagem:", interpretacao);
  
        // Se o OpenRouter retornou um comando válido
        if (interpretacao?.comando) {
          const { comando, parametros } = interpretacao;
          console.log("Comando interpretado:", comando);
          console.log("Parâmetros interpretados:", parametros);

      // Processa o comando financeiro
      switch (comando) {

case 'pdf': {
  try {
    const response = await axios.get(`${WEB_APP_URL}?action=gerarPDF`);
    const pdfBuffer = Buffer.from(response.data, 'base64');

    await sock.sendMessage(msg.key.remoteJid, {
      document: pdfBuffer,
      fileName: `Relatorio_Financeiro_${new Date().toLocaleDateString()}.pdf`,
      mimetype: 'application/pdf',
      caption: '📊 Relatório Financeiro Completo'
    });
  } catch (error) {
    console.error("Erro PDF:", error);
    await sock.sendMessage(msg.key.remoteJid, {
      text: "❌ Erro ao gerar PDF. Verifique o console para detalhes."
    });
  }
  break;
}


          
case 'dívida pagar': {
  const numero = parametros.número;
  const semSaida = parametros.semSaida || false;
  const remetente = msg.pushName;

  const response = await axios.get(
    `${WEB_APP_URL}?action=marcarDividaPaga&id=${numero}&semSaida=${semSaida}&remetente=${encodeURIComponent(remetente)}`
  );

  await sock.sendMessage(msg.key.remoteJid, { 
    text: response.data
  });
  break;
}

case 'dívida excluir': {
  const numero = parametros.numero;
  const response = await axios.get(`${WEB_APP_URL}?action=excluirDivida&id=${numero}`);
  await sock.sendMessage(msg.key.remoteJid, { text: response.data });
  break;
}

case 'dívida detalhes': {
  const numero = parametros.numero;
  const response = await axios.get(`${WEB_APP_URL}?action=detalhesDivida&id=${numero}`);
  const detalhes = response.data;
  
  const mensagem = 
`📋 *Detalhes da Dívida #${numero}*
  
⚫ Credor: ${detalhes.credor}
⚫ Valor: R$ ${detalhes.valor}
⚫ Categoria: ${detalhes.categoria}
⚫ Status: ${detalhes.status === 'Paga' ? '✅ Paga' : '⚠️ Pendente'}
⚫ Vencimento: ${detalhes.vencimento}
⚫ Pagamento: ${detalhes.pagamento}
⚫ Alertas: ${detalhes.diasAlerta} dias antes`;

  await sock.sendMessage(msg.key.remoteJid, { text: mensagem });
  break;
}

          
case 'dívida listar': {
  try {
    const { filtro = '', categoria = '' } = parametros || {};

    const response = await axios.get(
      `${WEB_APP_URL}?action=listarDividasFiltro&filtro=${encodeURIComponent(filtro)}&categoria=${encodeURIComponent(categoria)}`
    );

    if (!response.data.success || !Array.isArray(response.data.dividas)) {
      throw new Error('Resposta inválida da API');
    }

    const dividas = response.data.dividas;

    if (dividas.length === 0) {
      await sock.sendMessage(msg.key.remoteJid, { 
        text: "📭 Nenhuma dívida encontrada com esses filtros." 
      });
      break;
    }

    // Formate a mensagem (mantendo o formato original)
    let mensagem = "📋 *Lista de Dívidas* 📋\n\n";
    dividas.forEach(d => {
      let statusMsg;
      if (d.status === 'Paga') {
        statusMsg = '✅ Paga';
      } else {
        statusMsg = d.diasRestantes < 0 ? 
          `🔴 Atrasada (${Math.abs(d.diasRestantes)} dias)` : 
          `🟡 Pendente (em ${d.diasRestantes} dias)`;
      }
      
      mensagem += // Apenas adicione o ID na linha existente
`⚫ #${d.id} - ${d.credor}
   💵 Valor: R$ ${d.valor.toFixed(2).replace(".", ",")}
   📅 Vencimento: ${d.vencimento}
   🏷️ Categoria: ${d.categoria}
   ⚠️ Status: ${statusMsg}\n\n`;
    });

    await sock.sendMessage(msg.key.remoteJid, { text: mensagem });
    
  } catch (error) {
    console.error("Erro detalhado:", error);
    await sock.sendMessage(msg.key.remoteJid, { 
      text: "❌ Erro ao listar dívidas. Tente novamente." 
    });
  }
  break;
}

case 'dívida alerta': {
  const dias = parametros.dias;
  const response = await axios.get(`${WEB_APP_URL}?action=configurarAlerta&dias=${dias}`);
  await sock.sendMessage(msg.key.remoteJid, { text: response.data });
  break;
}

          
case 'análise': {
  console.log("Processando comando 'análise'...");
  try {
    // Adicione logs para depuração
    console.log("Iniciando requisição para a API...");
    const response = await axios.get(`${WEB_APP_URL}?action=analiseGastos`);
    console.log("Resposta da API recebida:", JSON.stringify(response.data));
    
    const dados = response.data;

    // Validação dos dados
    if (!dados.success) {
      throw new Error(dados.error || "Erro na análise");
    }

    // Formatar mensagem
    let mensagem = `📊 *Análise de Gastos* 📊\n\n`;
    mensagem += `✅ Entradas: R$ ${dados.totalEntradas}\n`;
    mensagem += `❌ Saídas: R$ ${dados.totalSaidas}\n`;
    mensagem += `💰 Saldo: R$ ${dados.saldo}\n\n`;
    
    mensagem += `📌 *Top Gastos*:\n`;
    dados.categorias.forEach((cat, index) => {
      mensagem += `${index + 1}. ${cat.nome}: R$ ${cat.valor} (${cat.porcentagem}%)\n`;
    });

    mensagem += `\n🔍 *Insights*:\n${dados.insights.join('\n')}`;

    console.log("Mensagem formatada:", mensagem); // Log da mensagem final
    await sock.sendMessage(msg.key.remoteJid, { text: mensagem });
    
  } catch (error) {
    console.error("Erro na análise:", error);
    await sock.sendMessage(msg.key.remoteJid, { 
      text: `❌ Falha na análise: ${error.message}`
    });
  }
  break;
}
          
        case 'listar clientes': {
          console.log("Processando comando 'listar clientes'...");
          const response = await axios.get(`${WEB_APP_URL}?action=listarClientes`);
          const clientes = response.data.clientes;
        
          if (clientes.length === 0) {
            await sock.sendMessage(msg.key.remoteJid, { text: "📭 Nenhum cliente registrado." });
            return;
          }
        
          const listaClientes = clientes.map((cliente, index) => `${index + 1}. ${cliente}`).join('\n');
          await sock.sendMessage(msg.key.remoteJid, { text: `📋 *Clientes Registrados*:\n\n${listaClientes}` });
          break;
        }

        case 'consultar pedidos': {
        console.log("Processando comando 'consultar pedidos'...");
        const cliente = parametros.cliente;
        let dataFormatada = parametros.data;
      
        if (dataFormatada && dataFormatada.match(/^\d{2}\/\d{2}$/)) {
          dataFormatada += `/${new Date().getFullYear()}`;
        }
      
        try {
          const response = await axios.get(
            `${WEB_APP_URL}?action=consultarPedidos&cliente=${encodeURIComponent(cliente)}&data=${encodeURIComponent(dataFormatada)}`
          );
          
          const pedidos = response.data;
      
          if (!pedidos || pedidos.length === 0) {
            await sock.sendMessage(msg.key.remoteJid, { 
              text: `📭 Nenhum pedido encontrado para *${cliente}* em *${dataFormatada}*.` 
            });
            return;
          }
      
          let mensagem = `📅 Pedidos para *${cliente}* em *${dataFormatada}*:\n\n`;
          let totalPedido = 0;
      
          pedidos.forEach((pedido) => {
            mensagem += `----------------------------------------\n`;
            mensagem += `🍅 *Produto*: ${pedido.produto}\n`;
            mensagem += `💵 *Preço Unitário*: R$ ${pedido.precoUnitario}\n`;
            mensagem += `📦 *Quantidade*: ${pedido.quantidade}\n`;
            
            const totalProduto = typeof pedido.total === 'number' 
              ? pedido.total.toFixed(2).replace(".", ",") 
              : pedido.total.toString().replace(".", ",");
            
            mensagem += `💰 *Total do Produto*: R$ ${totalProduto}\n`;
            totalPedido += parseFloat(pedido.total.toString().replace(",", "."));
          });
      
          mensagem += `💼 *Valor Total do Pedido*: R$ ${totalPedido.toFixed(2).replace(".", ",")}`;
      
          await sock.sendMessage(msg.key.remoteJid, { text: mensagem });
        } catch (error) {
          console.error("Erro ao consultar pedidos:", error);
          await sock.sendMessage(msg.key.remoteJid, { 
            text: "❌ Erro ao buscar pedidos. Verifique o formato da data (DD/MM/AAAA)." 
          });
        }
        break;
      }    
        case 'adicionar pedido': {
          console.log("Processando comando 'adicionar pedido'...");
          const cliente = parametros.cliente;
          const produto = parametros.produto;
          const quantidade = parametros.quantidade || 1; // Padrão: 1
          const precoUnitario = parseFloat(parametros.precoUnitario).toFixed(2).replace(".", ",");
          const total = (quantidade * parseFloat(parametros.precoUnitario)).toFixed(2).replace(".", ",");
        
          await axios.get(
            `${WEB_APP_URL}?action=adicionarPedido&cliente=${cliente}&produto=${produto}&quantidade=${quantidade}&precoUnitario=${precoUnitario}&total=${total}`
          );
          
          await sock.sendMessage(msg.key.remoteJid, { 
            text: `✅ Pedido registrado para ${cliente}:\n\n` +
                  `📦 Produto: ${produto}\n` +
                  `📦 Quantidade: ${quantidade}\n` +
                  `💵 Preço Unitário: R$ ${precoUnitario}\n` +
                  `💰 Total: R$ ${total}`
          });
          break;
        }

        // CASO 'resumo'
        case 'resumo': { // <--- Adicione chaves aqui
          console.log("Processando comando 'resumo'...");
          const resumoFinanceiro = await axios.get(`${WEB_APP_URL}?action=resumo`); // Renomeei para resumoFinanceiro
          await sock.sendMessage(msg.key.remoteJid, { text: resumoFinanceiro.data });
          break;
        }

        case 'poupança':
  console.log("Processando comando 'poupança'...");
  const valorPoupanca = parametros.valor;
  // Alterado: remetente → remetenteNome
  await axios.get(`${WEB_APP_URL}?action=adicionarPoupanca&valor=${valorPoupanca}&remetente=${remetenteNome}`);
  await sock.sendMessage(msg.key.remoteJid, { text: `✅ R$ ${valorPoupanca} transferidos para a poupança.` });
  break;

 case 'entrada': {
  console.log("Processando comando 'entrada'...");
  const valorEntrada = parametros.valor;
  const categoriaEntrada = parametros.categoria || "Outras Entradas"; // Nova categoria padrão
  const descricaoEntrada = parametros.descricao || "";

  await axios.get(`${WEB_APP_URL}?action=entrada&valor=${valorEntrada}&remetente=${remetenteNome}&categoria=${encodeURIComponent(categoriaEntrada)}&descricao=${encodeURIComponent(descricaoEntrada)}`);

  await sock.sendMessage(msg.key.remoteJid, { 
    text: `✅ Entrada registrada!\n\n` +
          `💵 Valor: R$ ${valorEntrada}\n` +
          `🏷️ Categoria: ${categoriaEntrada}\n` +
          `📝 Descrição: ${descricaoEntrada || "Sem detalhes"}\n` +
          `👤 Registrado por: ${remetenteNome}`
  });
  break;
}

          case 'saída': {
  console.log("Processando comando 'saída'...");
  const valorSaida = parametros.valor;
  let categoriaSaida = parametros.categoria || "Outros";
  const remetente = msg.pushName || "Sistema";
  const textoOriginal = msg.message.conversation.trim();

  try {
    // Verifica e cria categoria se necessário
    const responseCategoria = await axios.get(
      `${WEB_APP_URL}?action=verificarCriarCategoria&categoria=${encodeURIComponent(categoriaSaida)}`
    );
    
    // Se a categoria foi criada/modificada
    categoriaSaida = responseCategoria.data.categoria || categoriaSaida;

    const responseSaida = await axios.get(
  `${WEB_APP_URL}?action=saída&valor=${valorSaida}&categoria=${categoriaSaida}&remetente=${remetente}&texto=${encodeURIComponent(textoOriginal)}`
);
    
    await sock.sendMessage(msg.key.remoteJid, { text: responseSaida.data });
  } catch (error) {
    console.error("Erro:", error);
    await sock.sendMessage(msg.key.remoteJid, { 
      text: `❌ Erro: ${error.response?.data || error.message}`
    });
  }
  break;
}

        case 'média':
          console.log("Processando comando 'média'...");
          const media = await axios.get(`${WEB_APP_URL}?action=mediaEntradas`);
          await sock.sendMessage(msg.key.remoteJid, { text: media.data });
          break;

        case 'grafico':
          console.log("Processando comando 'grafico'...");
          const tipoGrafico = 'bar'; // Força o tipo de gráfico para 'bar'
          const tipoDados = parametros.dados || 'ambos';
          const periodo = parametros.periodo || 'todos';

          // Obtém os dados da API
          const response = await axios.get(`${WEB_APP_URL}?action=getDadosGrafico&tipo=${tipoDados}&periodo=${periodo}`);
          const dados = response.data;

          // Verifica se os dados estão no formato correto
          if (!dados.labels || !dados.datasets || !dados.titulo) {
            console.error("Dados do gráfico inválidos:", dados);
            await sock.sendMessage(msg.key.remoteJid, { text: "❌ Erro: Dados do gráfico inválidos." });
            return;
          }

          // Gera o gráfico
          try {
            const image = await gerarGrafico(tipoGrafico, dados);
            await sock.sendMessage(msg.key.remoteJid, { image: image, caption: `📊 ${dados.titulo}` });
          } catch (error) {
            console.error("Erro ao gerar o gráfico:", error);
            await sock.sendMessage(msg.key.remoteJid, { text: `❌ Erro ao gerar o gráfico: ${error.message}` });
          }
          break;

        case 'categoria adicionar':
          console.log("Processando comando 'categoria adicionar'...");
          const nomeCategoria = parametros.nome;
          await axios.get(`${WEB_APP_URL}?action=adicionarCategoria&categoria=${nomeCategoria}`);
          await sock.sendMessage(msg.key.remoteJid, { text: `📌 Categoria "${nomeCategoria}" adicionada com sucesso.` });
          break;

        case 'listar categorias':
          console.log("Processando comando 'listar categorias'...");
          const responseCategorias = await axios.get(`${WEB_APP_URL}?action=listarCategorias`);
          const categorias = responseCategorias.data.categorias;
          if (categorias.length === 0) {
            await sock.sendMessage(msg.key.remoteJid, { text: "📌 Nenhuma categoria cadastrada." });
          } else {
            const listaCategorias = categorias.map((cat, index) => `${index + 1}. ${cat}`).join('\n');
            await sock.sendMessage(msg.key.remoteJid, { text: `📌 Categorias cadastradas:\n${listaCategorias}` });
          }
          break;

case 'dívida adicionar': {
  console.log("Processando comando 'dívida adicionar'...");
  const valorDivida = parametros.valor;
  const credor = parametros.credor;
  const dataVencimento = parametros.dataVencimento;
  const categoria = parametros.categoria || "Geral"; // Captura a categoria

  await axios.get(`${WEB_APP_URL}?action=adicionarDivida&valor=${valorDivida}&credor=${credor}&dataVencimento=${dataVencimento}&categoria=${encodeURIComponent(categoria)}`);

  await sock.sendMessage(msg.key.remoteJid, { 
    text: `✅ Dívida de R$ ${valorDivida} adicionada para ${credor}\n` +
          `📅 Vencimento: ${dataVencimento}\n` +
          `🏷️ Categoria: ${categoria}` 
  });
  break;
}

        case 'lembrete adicionar':
          console.log("Processando comando 'lembrete adicionar'...");
          const descricaoLembrete = parametros.descricao;
          const dataLembrete = parametros.data;
          await axios.get(`${WEB_APP_URL}?action=adicionarLembrete&descricao=${descricaoLembrete}&data=${dataLembrete}`);
          await sock.sendMessage(msg.key.remoteJid, { text: `✅ Lembrete "${descricaoLembrete}" adicionado para ${dataLembrete}.` });
          break;

        case 'lembrete listar':
          console.log("Processando comando 'lembrete listar'...");
          const responseLembretes = await axios.get(`${WEB_APP_URL}?action=listarLembretes`);
          const lembretes = responseLembretes.data.lembretes;
          if (lembretes.length === 0) {
            await sock.sendMessage(msg.key.remoteJid, { text: "📌 Nenhum lembrete cadastrado." });
          } else {
            const listaLembretes = lembretes.map(l => `${l.id}. ${l.descricao} (${l.data})`).join('\n');
            await sock.sendMessage(msg.key.remoteJid, { text: `📌 Lembretes:\n${listaLembretes}` });
          }
          break;

        case 'orçamento definir':
          console.log("Processando comando 'orçamento definir'...");
          const categoria = parametros.categoria;
          const valor = parametros.valor;
          await axios.get(`${WEB_APP_URL}?action=definirOrcamento&categoria=${categoria}&valor=${valor}`);
          await sock.sendMessage(msg.key.remoteJid, { text: `✅ Orçamento de R$ ${valor} definido para a categoria "${categoria}".` });
          break;

        case 'orçamento listar':
          console.log("Processando comando 'orçamento listar'...");
          const responseOrcamentos = await axios.get(`${WEB_APP_URL}?action=listarOrcamentos`);
          await sock.sendMessage(msg.key.remoteJid, { text: responseOrcamentos.data });
          break;

          case 'orçamento excluir': {
            console.log("Processando comando 'orçamento excluir'...");
            const numeroOrcamentoExcluir = parametros['número']; // Acessa o parâmetro corretamente
            const responseExcluirOrcamento = await axios.get(`${WEB_APP_URL}?action=excluirOrcamento&numero=${numeroOrcamentoExcluir}`);
            await sock.sendMessage(msg.key.remoteJid, { text: responseExcluirOrcamento.data });
            break;
          }

// Adicione este case:
// Atualizar o case 'historico'
case 'historico': {
  console.log("Processando comando 'historico'...");
  try {
    const { 
      tipo = "todos",
      categoria = "",
      dataInicio = "",
      dataFim = ""
    } = parametros || {};

    const response = await axios.get(
      `${WEB_APP_URL}?action=historico&tipo=${tipo}&categoria=${encodeURIComponent(categoria)}&dataInicio=${dataInicio}&dataFim=${dataFim}`
    );

    console.log("Resposta da API:", response.data);
    
    if (!response.data.success || !Array.isArray(response.data.historico)) {
      throw new Error('Resposta inválida da API');
    }

    const historico = response.data.historico;

    if (historico.length === 0) {
      await sock.sendMessage(msg.key.remoteJid, { 
        text: "📭 Nenhuma transação encontrada com esses filtros." 
      });
      return;
    }

    let mensagem = "📜 *Histórico de Transações* 📜\n\n";
    historico.forEach((transacao, index) => {
      mensagem += `🆔 *${transacao.id}* - 📅 ${transacao.data}\n`;
      mensagem += `⚫ Tipo: ${transacao.tipo}\n`;
      mensagem += `💵 Valor: R$ ${transacao.valor}\n`;
      mensagem += `🏷️ Categoria: ${transacao.categoria || "Sem categoria"}\n`;
      mensagem += `📝 Descrição: ${transacao.descricao || "Sem detalhes"}\n\n`;
    });

    mensagem += "\n🔍 Use `excluir [ID]` para remover registros (ex: `excluir 5,7`)";
    
    await sock.sendMessage(msg.key.remoteJid, { text: mensagem });
    
  } catch (error) {
    console.error("Erro no histórico:", error);
    await sock.sendMessage(msg.key.remoteJid, { 
      text: "❌ Erro ao buscar histórico. Verifique os filtros e tente novamente." 
    });
  }
  break;
}
              
          case 'orçamento': {
  console.log("Processando comando 'orçamento'...");
  try {
    // Corrige o acesso ao parâmetro (com ou sem acento)
    const numeroOrcamentoConsulta = parseInt(parametros['número'] || parametros.numero);
    
    if (isNaN(numeroOrcamentoConsulta)) {
      await sock.sendMessage(msg.key.remoteJid, { text: "❌ Número de orçamento inválido." });
      break;
    }

    // Obtém a lista de orçamentos formatada corretamente
    const responseOrcamentosLista = await axios.get(`${WEB_APP_URL}?action=listarOrcamentos`);
    const orcamentos = responseOrcamentosLista.data
      .split('\n')
      .slice(1)
      .filter(line => line.trim() !== '')
      .map(line => {
        const match = line.match(/(\d+)\. (.+?): R\$ (.+)/);
        return match ? { id: parseInt(match[1]), categoria: match[2], valor: match[3] } : null;
      })
      .filter(Boolean);

    // Verifica se o número é válido
    if (numeroOrcamentoConsulta < 1 || numeroOrcamentoConsulta > orcamentos.length) {
      await sock.sendMessage(msg.key.remoteJid, { text: "❌ Número de orçamento inválido." });
      break;
    }

    const orcamentoSelecionado = orcamentos[numeroOrcamentoConsulta - 1];
    
    // Obtém o resumo do orçamento
    const responseResumo = await axios.get(
      `${WEB_APP_URL}?action=resumoOrcamento&categoria=${encodeURIComponent(orcamentoSelecionado.categoria)}`
    );
    
    const dadosResumo = responseResumo.data;

    // Formata a mensagem
    const mensagemResumo = 
`📊 Orçamento de ${dadosResumo.categoria}:
💰 Valor Definido: R$ ${orcamentoSelecionado.valor}
💰 Total Gasto: R$ ${dadosResumo.totalGasto}
📉 Porcentagem Utilizada: ${dadosResumo.porcentagemUtilizada}%
📈 Valor Restante: R$ ${dadosResumo.valorRestante}`;

    await sock.sendMessage(msg.key.remoteJid, { text: mensagemResumo });
  } catch (error) {
    console.error("Erro ao processar orçamento:", error);
    await sock.sendMessage(msg.key.remoteJid, { 
      text: "❌ Erro ao consultar orçamento. Verifique o número e tente novamente." 
    });
  }
  break;
}

        case 'excluir':
          console.log("Processando comando 'excluir'...");
          const numeros = Object.values(parametros).join(",");
          const responseExcluir = await axios.get(`${WEB_APP_URL}?action=excluirTransacao&parametro=${encodeURIComponent(numeros)}`);
          await sock.sendMessage(msg.key.remoteJid, { text: responseExcluir.data });
          break;

        case 'agendar':
          const respostaAgendamento = await axios.get(`${WEB_APP_URL}?action=agendar&cliente=${encodeURIComponent(nome)}&servico=${servico}&data=${data}&hora=${hora}&telefone=${telefone}`);
          await enviarMensagem(`📅 Seu agendamento para ${servico} está marcado para ${data} às ${hora}.`);
          break;

        case 'meus agendamentos':
          const responseAgendamentos = await axios.get(`${WEB_APP_URL}?action=meusAgendamentos&telefone=${telefone}`);
          const agendamentos = responseAgendamentos.data;
          // Formatar e enviar lista
          let mensagemAgendamentos = "📅 *Meus Agendamentos* 📅\n\n";
          agendamentos.forEach((agendamento, index) => {
            mensagemAgendamentos += `🔹 ${index + 1}. ${agendamento.servico} em ${agendamento.data} às ${agendamento.hora}\n`;
          });
          await enviarMensagem(mensagemAgendamentos);
          break;

          default:
                await sock.sendMessage(msg.key.remoteJid, { 
                  text: "❌ Comando não reconhecido. Use 'ajuda'." 
                });
            }
          }
        } else {
          const respostaConversacao = await gerarRespostaConversacao(texto);
          await sock.sendMessage(msg.key.remoteJid, { text: respostaConversacao });
        }
      } catch (error) {
        console.error("Erro no processamento:", error);
        await sock.sendMessage(msg.key.remoteJid, { 
          text: "❌ Ocorreu um erro interno. Tente novamente." 
        });
      }
    } catch (error) {
      console.error("Erro crítico:", error);
    }
  });
}

iniciarConexaoWhatsApp().then(() => {
  app.listen(3000, () => console.log("Servidor rodando!"));
});
