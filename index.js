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
        processarComandoLocal(texto, msg.key.remoteJid);
        return;
      }

      // Passo 2: Verificar se está em fluxo de agendamento
      if (estadosAgendamento.has(telefone)) {
        continuarFluxoAgendamento(texto, msg.key.remoteJid);
        return;
      }

      // Passo 3: Usar OpenRouter apenas para mensagens genéricas
      const resposta = await gerarRespostaConversacao(texto);
      await sock.sendMessage(msg.key.remoteJid, { text: resposta });

      // Log para depuração
      console.log(`=== Nova mensagem ===`);
      console.log(`De: ${msg.key.participant || msg.key.remoteJid}`);
      console.log(`Texto: ${texto}`);
      console.log(`Grupo: ${msg.key.remoteJid}`);

    } catch (error) {
      console.error("Erro crítico:", error);
    }
  });
}

iniciarConexaoWhatsApp().then(() => {
  app.listen(3000, () => console.log("Servidor rodando!"));
});
