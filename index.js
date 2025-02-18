const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const express = require('express');
const os = require('os');
const { exec } = require('child_process');
const WebSocket = require('ws');
const cron = require('node-cron'); // Adicionado para agendamento de tarefas

const app = express();
app.use(express.json());

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbz37BjLn9QwbMy8_4_Ij68Dd4GFrjOW-ttpLAA3pX2fIZX2WutQpcBDDPwIX4Zk8Oe2DQ/exec';
const GRUPO_ID = '120363403512588677@g.us';

// Criar um servidor WebSocket
const wss = new WebSocket.Server({ port: 8080 });

// Função para formatar a data no formato DD/MM/AAAA
function formatarData(data) {
  const date = new Date(data);
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0'); // Mês começa em 0
  const ano = date.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

// Função para obter o resumo financeiro
async function obterResumo() {
  try {
    const resposta = await axios.get(`${WEB_APP_URL}?action=resumo`);
    return resposta.data;
  } catch (error) {
    console.error("Erro ao obter resumo:", error);
    return "⚠️ Erro ao obter resumo financeiro.";
  }
}

// Função para enviar mensagens automáticas
async function enviarMensagemAutomatica(mensagem) {
  try {
    await sock.sendMessage(GRUPO_ID, { text: mensagem });
  } catch (error) {
    console.error("Erro ao enviar mensagem automática:", error);
  }
}

// Agendamento de tarefas
cron.schedule('59 23 * * *', async () => {
  const resumo = await obterResumo();
  await enviarMensagemAutomatica(`📊 *Resumo Diário* 📊\n\n${resumo}`);
});

cron.schedule('59 23 * * 0', async () => {
  const resumo = await obterResumo();
  await enviarMensagemAutomatica(`📊 *Resumo Semanal* 📊\n\n${resumo}`);
});

cron.schedule('59 23 L * *', async () => {
  const resumo = await obterResumo();
  await enviarMensagemAutomatica(`📊 *Resumo Mensal* 📊\n\n${resumo}`);
});

// Resto do código do bot...