# 01 — Arquitetura

## Visão Geral

O goState é composto por quatro serviços independentes que se comunicam via HTTP e WebSocket (Socket.IO):

```
┌──────────────────────────────────────────────────────────┐
│                        USUÁRIO                           │
│            Navegador (Frontend :5173)                    │
│            Navegador (Admin    :4001)                    │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTP REST / WebSocket
                         ▼
┌──────────────────────────────────────────────────────────┐
│                   BACKEND  :4000                         │
│   Express.js + SQLite (better-sqlite3) + Socket.IO       │
│   Módulos: auth, projects, executions, integrations,     │
│            agents, schedules, scripts, test-cases        │
└────────────┬─────────────────────────────────────────────┘
             │ Socket.IO (exec:dispatch / agent:heartbeat)
             ▼
┌──────────────────────────────────────────────────────────┐
│                   AGENTE  (Docker)                       │
│   Node.js + Playwright Test Runner                       │
│   Recebe execuções, roda testes, devolve status/logs     │
└──────────────────────────────────────────────────────────┘
```

## Stack Tecnológica

### Backend
- **Runtime:** Node.js 20 + TypeScript
- **Framework:** Express.js
- **Banco de dados:** SQLite via `better-sqlite3` (arquivo único `gostate.db`)
- **WebSocket:** Socket.IO
- **Autenticação:** JWT (`jsonwebtoken`)
- **Validação:** Zod
- **E-mail:** Nodemailer (integrações SMTP)
- **Agendamento:** `node-cron`

### Frontend / Admin
- **Framework:** React 18 + TypeScript
- **Build:** Vite
- **Estilização:** TailwindCSS + CSS variables para tema claro/escuro
- **Estado assíncrono:** TanStack Query (React Query)
- **Ícones:** Lucide React
- **WebSocket client:** Socket.IO Client

### Agente
- **Runtime:** Node.js 20
- **Testes:** `@playwright/test`
- **Deploy:** Docker (imagem baseada em `node:20-slim`)

## Fluxo de Dados — Criação e Execução de Teste

```
1. Usuário cria um Test Case (steps) ou Script (JS) no Frontend
2. Usuário clica "Executar"
3. Backend cria registro execution (status=queued) no SQLite
4. Backend encontra agente disponível (status=online)
5. Backend emite exec:dispatch via Socket.IO para o agente
6. Agente recebe, gera playwright.config.js + test.spec.js
7. Agente executa: npx playwright test
8. Agente emite logs em tempo real via exec:log
9. Agente envia status final via HTTP PATCH /executions/:id/status
10. Backend atualiza status, dispara webhooks/integrações
11. Frontend atualiza via WebSocket exec:update
```

## Banco de Dados (SQLite)

Tabelas principais:

| Tabela | Descrição |
|--------|-----------|
| `users` | Usuários do sistema |
| `projects` | Projetos de teste |
| `agents` | Agentes de execução registrados |
| `executions` | Registro de cada execução |
| `exec_steps` | Steps individuais de cada execução |
| `exec_artifacts` | Artefatos (vídeo, trace, screenshots) |
| `test_cases` | Casos de teste com steps visuais |
| `suites` | Suítes agrupando test cases |
| `scripts` | Scripts Playwright em JS/TS |
| `schedules` | Agendamentos CRON |
| `integrations` | Configurações de webhook/SMTP |
| `audit_logs` | Log de auditoria de ações |

## Estrutura de Pastas

```
gostate/
├── backend/          # API Express + Socket.IO
│   └── src/
│       ├── db/       # schema.ts com migrations
│       ├── modules/  # rotas por domínio
│       ├── realtime/ # gateway Socket.IO
│       └── scheduler/# cron runner
├── frontend/         # App do usuário final
│   └── src/pages/
├── admin/            # App do administrador
│   └── src/pages/
├── agent/            # Agente de execução
│   └── src/agent.ts
└── docs/             # Esta documentação
```
