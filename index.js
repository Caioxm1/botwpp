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
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwnu92Cskfwb8qeBhDhUvfwT6fPMi9nTA5H5lTIt-aRNAdKcouWwQtU40fRL1SnwqD3-g/exec';
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

// Depois faça o log das configurações
console.log("Grupos permitidos:", GRUPOS_PERMITIDOS);
console.log("Usuários autorizados:", USUARIOS_AUTORIZADOS);

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
- dívida listar: Lista todas as dívidas.

⏰ *Lembretes*
- lembrete adicionar [descrição] [data]: Adiciona um lembrete.
- lembrete listar: Lista todos os lembretes.

📜 *Histórico*
- historico [tipo] [categoria] [dataInicio] [dataFim]: Mostra o histórico de transações.

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
            content: `Interprete a mensagem e retorne APENAS o JSON (sem explicações adicionais e sem textos enormes, sendo apenas o necessario) correspondente ao comando. 
            Comandos disponíveis:
            - resumo: Mostra um resumo financeiro.
            - poupança [valor]: Adiciona um valor à poupança.
            - entrada [valor]: Registra uma entrada de dinheiro.
            - saída [valor] [categoria]: Registra uma saída de dinheiro em uma categoria específica.
            - média: Mostra a média de entradas.
            - grafico [tipo] [dados] [periodo]: Gera um gráfico com base nos dados fornecidos.
            - categoria adicionar [nome]: Adiciona uma nova categoria.
            - listar categorias: Lista todas as categorias.
            - orçamento [número]: Mostra o resumo do orçamento com o número especificado.
            - orçamento definir [categoria] [valor]: Define um orçamento para uma categoria.
            - orçamento listar: Lista todos os orçamentos.
            - orçamento excluir [número]: Exclui um orçamento específico.
            - dívida adicionar [valor] [credor] [dataVencimento]: Adiciona uma dívida.
            - dívida listar: Lista todas as dívidas.
            - lembrete adicionar [descrição] [data]: Adiciona um lembrete.
            - lembrete listar: Lista todos os lembretes.
            - historico [tipo] [categoria] [dataInicio] [dataFim]: Mostra o histórico de transações.
            - excluir [número(s)]: Exclui transações específicas.
            - excluir tudo: Exclui todas as transações.
            - excluir dia [data]: Exclui transações de um dia específico.
            - excluir periodo [dataInicio] [dataFim]: Exclui transações de um período específico.
            - adicionar pedido [cliente] [produto] [quantidade] [precoUnitario]: Registra um pedido para um cliente.
            - consultar pedidos [cliente] [data]: *Sinônimos* → "lista de pedidos", "ver pedidos", "pedidos do cliente".
            - listar clientes: *Sinônimos* → "meus clientes", "clientes registrados", "quais são meus clientes".
            - análise: Gera uma análise detalhada dos gastos.


            **Exemplo para "análise":**
            - Mensagem: "Quero uma análise dos meus gastos"
            - JSON: { "comando": "análise" }
            
            - Mensagem: "analise financeira"
            - JSON: { "comando": "análise" }
            
            - Mensagem: "Como estão meus gastos?"
            - JSON: { "comando": "análise" }
            
            - Mensagem: 'Como estão meus gastos este mês?'
            - JSON: { "comando": "análise" }
            
            - Mensagem: "Quero uma análise financeira"
            - JSON: { "comando": "análise" }
            
            - Mensagem: "Mostre meus gastos"
            - JSON: { "comando": "análise" }
            
            - Mensagem: "Faça uma análise financeira"
            - JSON: { "comando": "análise" }

            **Exemplo para "listar clientes":**
            - Mensagem: 'Quais clientes têm pedidos?'
            - JSON: {"comando": "listar clientes" }"
          
            - Mensagem: "Meus clientes"  
            - JSON: {"comando": "listar clientes" }"

            - Mensagem: "Quais são os meus cliente"  
            - JSON: {"comando": "listar clientes" }"
            
            - Mensagem: "Mostre meus clientes"  
            - JSON: {"comando": "listar clientes" }"

            **Instruções Especiais para Pedidos:**
            - Se a mensagem incluir algo como 'consultar pedidos', 'consultar pedido', 'ver pedidos' ou 'listar pedidos', extraia:
            - cliente: Nome do cliente após 'para' ou 'do'.
            **Instruções Especiais para Datas:**
            - A data deve ser extraída **exatamente como escrita pelo usuário**, sem modificações.\n" +
            - Exemplo:
            - Mensagem: 'Lista de pedidos da Lavradio dia 21/03/2025'
            - JSON: { "comando": "consultar pedidos", "parametros": { "cliente": "Lavradio", "data": "21/03/2025" }}"
            - data: Data no formato DD/MM/AAAA ou DD/MM.
            Exemplo:
            - Mensagem: 'Quero ver os pedidos do cliente Lavradio de 21/03/2025'
            - JSON: { "comando": "consultar pedidos", "parametros": { "cliente": "Lavradio", "data": "21/03/2025" } }
            - Mensagem: "consultar pedido da lavradio 29/03/2025"  
            - JSON: { "comando": "consultar pedidos", "parametros": { "cliente": "Lavradio", "data": "29/03/2025" } }
            - Mensagem: "pedidos da lavradio dia 29/03/2025"  
            - JSON: { "comando": "consultar pedidos", "parametros": { "cliente": "Lavradio", "data": "29/03/2025" } }

            **Exemplos de datas:**
            - Mensagem: "histórico do dia 29/03"
            - JSON: { "comando": "historico", "parametros": { "dataInicio": "29/03/2024", "dataFim": "29/03/2024" } }
            
            - Mensagem: "histórico de 29/03 até 03/04"
            - JSON: { "comando": "historico", "parametros": { "dataInicio": "29/03/2024", "dataFim": "03/04/2024" } }
            
            - Mensagem: "histórico de 15/03 a 20/03"
            - JSON: { "comando": "historico", "parametros": { "dataInicio": "15/03/2024", "dataFim": "20/03/2024" } }


            1º **Instruções Especiais:**
            - Se a mensagem se referir a compras de alimentos (como verduras, legumes, frutas, carnes, etc.), a categoria deve ser sempre "Alimentação".
            - Exemplos de mensagens que devem ser categorizadas como "Alimentação":
              - "Comprei uma caixa de aipim por 60 reais"
              - "Gastei 30 reais em verduras no mercado"
              - "Paguei 50 reais em frutas e legumes"

              2º **Instruções Especiais:**
            - Se a mensagem se referir a compras de saúde (como maquiagem, desodorante, remédio, exame, etc.), a categoria deve ser sempre "Alimentação".
            - Exemplos de mensagens que devem ser categorizadas como "Saúde":
              - "Comprei uma dipirona por 3 reais"
              - "Gastei 30 reais em maquiagens na farmácia"
              - "Paguei 50 reais em shampoo e condicionador"

              3º **Instruções Especiais:**
              - Se a mensagem se referir a um pedido, extraia:
              - cliente: Nome do cliente após "para cliente".
              - produto: Nome do produto após "de".
              - quantidade: Número antes da unidade (ex: "uma caixa" → quantidade=1).
              - precoUnitario: Valor após "por" ou "reais".
              Exemplo:
              - Mensagem: "Adicionar um pedido para cliente Lavradio de uma caixa de tomate por 120 reais"
              - JSON:
              {
                "comando": "adicionar pedido",
                "parametros": {
                  "cliente": "Lavradio",
                  "produto": "caixa de tomate",
                  "quantidade": 1,
                  "precoUnitario": 120
                }
              }

              4º **Instruções Especiais:**
              - Se a mensagem for uma pergunta geral, conversa ou não relacionada a finanças, retorne um JSON vazio: {}.
              - Exemplos de mensagens que devem retornar JSON vazio:
              - "Qual é a previsão do tempo?"
              - "Como você está?"
              - "100 + 10% é quanto?"
              - "Quero fazer uma viagem com 800 reais em São Paulo. Poderia me ajudar a montar uma viagem de 3 dias?"

            Sua tarefa é interpretar a seguinte mensagem e retornar o comando correspondente em formato JSON:
            {
              "comando": "nome_do_comando",
              "parametros": {
                "parametro1": "valor1",
                "parametro2": "valor2",
                "parametro3": "valor3"
              }
            }

            A mensagem pode conter 1, 2 ou 3 parâmetros. Se houver menos de 3 parâmetros, os valores ausentes devem ser preenchidos com valores padrão ou omitidos.

            **Valores padrão:**
            - Para 'grafico':
              - tipo: 'bar'
              - dados: 'ambos'
              - periodo: 'mês'

            **Retorne apenas o JSON, sem explicações adicionais.**

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
        timeout: 10000 // 10 segundos de timeout
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

// Função para verificar se a mensagem parece ser um comando financeiro
function pareceSerComandoFinanceiro(texto) {
  const palavrasChaveFinanceiras = [
    "análise", "analise","resumo", "poupança", "entrada", "saída", "média", "gráfico", "categoria", 
    "orçamento", "dívida", "lembrete", "histórico", "excluir", "comprei", "gastei", 
    "paguei", "transferir", "saldo", "meta", "valor", "reais", "R$",
    "consultar pedidos", "ver pedidos", "listar pedidos", "lista de pedidos", "pedidos do cliente", "ver pedidos",
    "listar clientes", "clientes registrados", "ver clientes", "Quais são os meus clientes", "Quais são os clientes", "meus clientes", "clientes cadastrados", "quais clientes"
  ];

  // Verifica se a mensagem contém alguma palavra-chave financeira
  return palavrasChaveFinanceiras.some(palavra => 
    texto.toLowerCase().includes(palavra.toLowerCase())
  );
}

// Função principal do bot
let sock = null;

async function iniciarConexaoWhatsApp() {
const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  
  const sock = makeWASocket({
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
    

  const remetente = msg.key.participant || msg.key.remoteJid;
  const texto = msg.message.conversation.trim().toLowerCase();

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
  if (ultimoComandoProcessado === texto) return;
  ultimoComandoProcessado = texto;

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
  
        // Se o OpenRouter retornou um comando válido
        if (interpretacao?.comando) {
          const { comando, parametros } = interpretacao;
          console.log("Comando interpretado:", comando);
          console.log("Parâmetros interpretados:", parametros);

      // Processa o comando financeiro
      switch (comando) {

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
        break; // Fechamento correto do case
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

          case 'entrada':
            console.log("Processando comando 'entrada'...");
            const valorEntrada = parametros.valor;
            // Alterado: remetente → remetenteNome
            await axios.get(`${WEB_APP_URL}?action=entrada&valor=${valorEntrada}&remetente=${remetenteNome}`);
            await sock.sendMessage(msg.key.remoteJid, { text: `✅ Entrada de R$ ${valorEntrada} registrada por ${remetenteNome}.` });
            break;

          case 'saída':
            console.log("Processando comando 'saída'...");
            const valorSaida = parametros.valor;
            const categoriaSaida = parametros.categoria;
            const responseSaida = await axios.get(
              `${WEB_APP_URL}?action=saída&valor=${valorSaida}&categoria=${categoriaSaida}&remetente=${remetenteNome}` // ✅ Corrigido
            );
            await sock.sendMessage(msg.key.remoteJid, { text: responseSaida.data });
            break;

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

        case 'dívida adicionar':
          console.log("Processando comando 'dívida adicionar'...");
          const valorDivida = parametros.valor;
          const credor = parametros.credor;
          const dataVencimento = parametros.dataVencimento;
          await axios.get(`${WEB_APP_URL}?action=adicionarDivida&valor=${valorDivida}&credor=${credor}&dataVencimento=${dataVencimento}`);
          await sock.sendMessage(msg.key.remoteJid, { text: `✅ Dívida de R$ ${valorDivida} adicionada com ${credor}, vencendo em ${dataVencimento}.` });
          break;

        case 'dívida listar':
          console.log("Processando comando 'dívida listar'...");
          const responseDividas = await axios.get(`${WEB_APP_URL}?action=listarDividas`);
          const dividas = responseDividas.data.dividas;
          if (dividas.length === 0) {
            await sock.sendMessage(msg.key.remoteJid, { text: "📌 Nenhuma dívida cadastrada." });
          } else {
            const listaDividas = dividas.map(d => `${d.id}. ${d.credor}: R$ ${d.valor} (Vencimento: ${d.vencimento})`).join('\n');
            await sock.sendMessage(msg.key.remoteJid, { text: `📌 Dívidas:\n${listaDividas}` });
          }
          break;

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
case 'historico': {
  console.log("Processando comando 'historico'...");

  // Extrair parâmetros
  const { 
    tipo = "todos",
    categoria = "",
    dataInicio: dataInicioParam = "",
    dataFim: dataFimParam = ""
  } = parametros || {};

  // Processar datas
  const anoAtual = new Date().getFullYear();
  let dataInicio = dataInicioParam;
  let dataFim = dataFimParam;
  if (dataInicio && dataInicio.length <= 5) dataInicio += `/${anoAtual}`;
  if (dataFim && dataFim.length <= 5) dataFim += `/${anoAtual}`;

  // Chamar API
  const response = await axios.get(`${WEB_APP_URL}?action=historico&tipo=${tipo}&categoria=${categoria}&dataInicio=${dataInicio}&dataFim=${dataFim}`);
  const historico = response.data.historico;

  if (historico.length === 0) {
    await sock.sendMessage(msg.key.remoteJid, { text: "📭 Nenhuma transação encontrada." });
    return;
  }

  // Formatar mensagem com IDs fixos
  let mensagem = "📜 *Histórico de Transações*:\n\n";
  historico.forEach(transacao => {
    mensagem += `🆔 *${transacao.id}* - 📅 ${transacao.data} - ${transacao.tipo}\n`;
    mensagem += `💵 Valor: R$ ${transacao.valor}\n`;
    mensagem += `🏷️ Categoria: ${transacao.categoria || "Sem categoria"}\n\n`;
  });

  mensagem += "\n❌ Para excluir: `excluir [ID]` (ex: `excluir 5,7`)";
  await sock.sendMessage(msg.key.remoteJid, { text: mensagem });
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
