# goState — Documentação

> Plataforma de orquestração e execução de testes automatizados com Playwright.

## Índice

| # | Documento | Descrição |
|---|-----------|-----------|
| 01 | [Arquitetura](./01-arquitetura.md) | Visão geral, stack tecnológica e fluxo de dados |
| 02 | [Instalação e Setup](./02-instalacao.md) | Pré-requisitos, setup local e Docker |
| 03 | [Agentes de Execução](./03-agentes.md) | O que é um agente, como registrar e configurar via Docker |
| 04 | [Projetos, Scripts e Suítes](./04-projetos-scripts.md) | Organização dos testes no sistema |
| 05 | [Execuções](./05-execucoes.md) | Fluxo de execução, status, logs e artefatos |
| 06 | [Agendamentos](./06-agendamentos.md) | Scheduler, CRON e histórico |
| 07 | [Integrações](./07-integracoes.md) | Discord, Slack, Teams, SMTP, Telegram, PagerDuty, webhooks |
| 08 | [Referência da API](./08-api-reference.md) | Endpoints REST completos com exemplos |
| 09 | [Guia do Usuário](./09-guia-usuario.md) | Passo a passo de uso do sistema |

## Stack resumida

- **Backend:** Node.js + Express + SQLite (better-sqlite3)
- **Frontend (prod):** React + Vite + TailwindCSS — porta `5173`
- **Admin:** React + Vite + TailwindCSS — porta `4001`
- **Agente:** Node.js + Playwright — containerizado via Docker
- **Comunicação em tempo real:** Socket.IO

## Portas padrão (desenvolvimento local)

| Serviço | Porta |
|---------|-------|
| Backend API | `4000` |
| Frontend (prod) | `5173` |
| Admin | `4001` (ou `5174`) |
