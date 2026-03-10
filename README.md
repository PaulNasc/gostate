# goState

goState é uma plataforma para organizar, disparar e acompanhar testes automatizados com Playwright de forma mais simples. A proposta é centralizar o fluxo inteiro em um só lugar: projetos, casos de teste, scripts, execuções, agentes remotos, integrações e histórico.

Na prática, você pode montar testes visualmente ou escrever scripts, enviar a execução para agentes conectados e acompanhar tudo em tempo real — com logs, artefatos, métricas e notificações. É um projeto pensado para times que querem mais controle sobre automação sem perder visibilidade do que está acontecendo.

---

## Estrutura

```
gostate/
├── backend/    Express + SQLite + Socket.IO           (porta 4000)
├── frontend/   React + Vite + TailwindCSS             (porta 5173)
├── admin/      Painel administrativo de agentes       (porta 4001)
└── agent/      Agente standalone de execução remota
```

O monorepo tem um `package.json` raiz com scripts para subir tudo de uma vez.

---

## Como rodar

### 1. Instalar dependências

```bash
npm run install:all
```

### 2. Configurar o backend

Crie o arquivo `backend/.env` com base no exemplo abaixo:

```env
PORT=4000
JWT_SECRET=troque-por-algo-seguro-em-producao
DB_PATH=./data/gostate.db
ARTIFACTS_PATH=./data/artifacts
CORS_ORIGIN=http://localhost:5173
ADMIN_ORIGIN=http://localhost:4001
```

> O banco SQLite é criado automaticamente na primeira execução, junto com um usuário admin padrão.

### 3. Subir o sistema

```bash
# Backend + Frontend (o mais comum durante desenvolvimento)
npm run dev

# Backend + Frontend + Painel Admin
npm run dev:all

# Só um serviço específico
npm run dev:backend
npm run dev:frontend
npm run dev:admin
```

### 4. Acesso inicial

| URL | O que é |
|-----|---------|
| http://localhost:5173 | Frontend principal |
| http://localhost:4001 | Admin Panel (gerenciar agentes) |
| http://localhost:4000 | API backend |

**Credenciais padrão:** `admin@gostate.dev` / `admin123`

> Troque a senha após o primeiro login.

---

## Configurar um agente

Os agentes são processos que ficam conectados ao backend esperando execuções. Você pode rodar quantos quiser, em máquinas diferentes.

**Pelo Admin Panel (recomendado):**
1. Acesse http://localhost:4001
2. Crie um novo agente
3. Clique em "Configurar" → "Gerar Comando de Instalação"
4. Copie e rode o comando no servidor onde o agente vai rodar

**Manual via variáveis de ambiente:**

```bash
cd agent
AGENT_TOKEN=seu-token BACKEND_URL=http://localhost:4000 npm run dev
```

**Com Docker Compose:**

```bash
# Edite agent/docker-compose.yml com o AGENT_TOKEN correto
cd agent
docker-compose up -d
```

Para controlar quantas execuções rodam em paralelo por agente:

```env
AGENT_MAX_CONCURRENT=3   # padrão: 3
```

---

## Fluxo básico de uso

1. Crie um **Projeto** no frontend
2. Dentro do projeto, crie uma **Suite** e adicione **Casos de Teste**
3. Monte os steps do teste no construtor visual, ou escreva um script Playwright direto
4. Certifique-se de que tem pelo menos um agente online
5. Clique em **Executar** — escolha o agente, o browser e dispare
6. Acompanhe os logs em tempo real na página de Execuções

Para automação, configure agendamentos na página de **Agendamentos** (suporta minutos fixos e expressões cron completas).

---

## Variáveis de ambiente — resumo

### Backend (`backend/.env`)

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `4000` | Porta da API |
| `JWT_SECRET` | — | Segredo JWT (obrigatório em produção) |
| `DB_PATH` | `./data/gostate.db` | Banco SQLite |
| `ARTIFACTS_PATH` | `./data/artifacts` | Vídeos e screenshots |
| `CORS_ORIGIN` | `http://localhost:5173` | Origem do frontend |
| `ADMIN_ORIGIN` | `http://localhost:4001` | Origem do admin panel |

### Agent (`agent/.env`)

| Variável | Descrição |
|---|---|
| `BACKEND_URL` | URL do backend (ex: `http://meu-servidor:4000`) |
| `AGENT_TOKEN` | Token gerado no Admin Panel |
| `AGENT_MAX_CONCURRENT` | Execuções paralelas (padrão: 3) |

---

## Stack

- **Frontend:** React 18, TypeScript, Vite, TailwindCSS, TanStack Query, Recharts, Socket.IO client
- **Backend:** Express 5, TypeScript, SQLite (better-sqlite3), JWT, Socket.IO, Zod, Multer
- **Agente:** Node.js, TypeScript, @playwright/test, Socket.IO client, axios
- **Admin:** React 18, TypeScript, Vite, TailwindCSS
