# goState
> Plataforma escalável para orquestração, execução e acompanhamento de testes automatizados E2E com Playwright.

goState centraliza o fluxo de automação em um só lugar: projetos, casos de teste, scripts, execuções, agentes remotos, integrações e histórico. Foi desenhado com uma arquitetura moderna e baseada em eventos, permitindo executar testes assíncronos e em larga escala.

## Quick Start (Docker - Produção Mínima Recomendada)

A maneira mais segura e rápida de rodar o ambiente completo.

1. **Clone o repositório** e entre na pasta:
```bash
git clone https://github.com/seu-user/gostate.git
cd gostate
```

2. **Crie os arquivos de ambiente** (Obrigatório)
Crie um arquivo `.env` na raiz (veja a seção [Configuração](#configuração) para mais detalhes):
```env
# URL externa (browser chamando API)
VITE_API_BASE=http://localhost:4000
# URL interna (agente dentro do docker)
INTERNAL_BACKEND_URL=http://backend:4000
# CORS
CORS_ORIGIN=http://localhost:5173

DEFAULT_AGENT_TOKEN=gostate-dev-agent-token-local-compose-2024
```

3. **Suba o sistema:**
```bash
docker compose up -d --build
```

O banco SQLite será criado automaticamente e semeado com um administrador e um agente local padrão.

## Acesso Inicial

| URL | O que é |
|-----|---------|
| http://localhost:5173 | Frontend principal (Gerenciador de Testes) |
| http://localhost:4001 | Painel Administrativo (Gerenciador de Agentes e Configurações) |
| http://localhost:4000 | API Backend |

**Credenciais padrão de Admin:** 
- Email: `admin@gostate.dev` 
- Senha: `Admin@123`

## Features

- **Construtor Visual e Scripting:** Crie testes arrastando passos (Clicks, Gotos) ou digitando diretamente scripts Playwright.
- **Isolamento de Agentes:** Rode os testes de forma segura em agentes remotos conectados via WebSockets (Socket.IO).
- **Log Streaming em Tempo Real:** Acompanhe a execução do teste como se estivesse na máquina hospedeira.
- **Artefatos Automáticos:** Capturas de tela e vídeos são gravados por execução.
- **Agendamentos (Cron):** Dispare execuções automaticamente e em paralelo (escalável até N agentes).

## Configuração

Principais variáveis de ambiente no arquivo `.env` global:

| Variável | Descrição | Padrão Recomendado |
|----------|-------------|---------|
| `VITE_API_BASE` | URL do backend para acesso via Browser | `http://localhost:4000` |
| `INTERNAL_BACKEND_URL` | URL do backend para a rede do Docker (usada pelo Agent) | `http://backend:4000` |
| `CORS_ORIGIN` | Domínio do frontend para CORS | `http://localhost:5173` |
| `ADMIN_EMAIL` | Email do administrador padrão | `admin@gostate.dev` |
| `ADMIN_PASSWORD` | Senha do administrador padrão | `Admin@123` |
| `JWT_SECRET` | Chave de segurança para tokens (OBRIGATÓRIO EM PROD) | — |
| `ARTIFACT_RETENTION_DAYS` | Dias antes de deletar logs e vídeos | `30` |

## Estrutura do Monorepo

```
gostate/
├── backend/    Express + better-sqlite3 + Socket.IO   (motor, API)
├── frontend/   React + Vite + TailwindCSS             (usuário)
├── admin/      React + Vite + TailwindCSS             (sistema)
├── agent/      Node.js + Playwright                   (executor isolado)
├── docs/       Documentações (API, Arquitetura)
└── data/       Volume persistente do Docker (Banco de dados e artefatos)
```

## Documentation

- [API Reference](./docs/api.md)
- [Architecture & Flow](./docs/architecture.md)

## License

MIT
