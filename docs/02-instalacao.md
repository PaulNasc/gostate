# 02 — Instalação e Setup

## Pré-requisitos

| Ferramenta | Versão mínima |
|------------|---------------|
| Node.js | 20 LTS |
| npm | 9+ |
| Docker + Docker Compose | 24+ |
| Git | qualquer |

---

## Setup Local (desenvolvimento)

### 1. Clonar o repositório

```bash
git clone https://github.com/seu-usuario/gostate.git
cd gostate
```

### 2. Instalar dependências de todos os serviços

```bash
# Raiz (workspaces)
npm install

# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..

# Admin
cd admin && npm install && cd ..

# Agente
cd agent && npm install && cd ..
```

### 3. Configurar variáveis de ambiente

#### Backend (`backend/.env`)

```env
PORT=4000
JWT_SECRET=sua-chave-secreta-aqui
NODE_ENV=development
```

#### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:4000
```

#### Admin (`admin/.env`)

```env
VITE_API_URL=http://localhost:4000
```

### 4. Iniciar os serviços em desenvolvimento

Abra terminais separados para cada serviço:

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend (usuário final)
cd frontend && npm run dev

# Terminal 3 — Admin
cd admin && npm run dev
```

Acesse:
- **Frontend:** http://localhost:5173
- **Admin:** http://localhost:5174 (ou 4001 conforme config)
- **Backend API:** http://localhost:4000

### 5. Primeiro acesso

Na primeira execução, o backend cria automaticamente um usuário admin padrão. Verifique os logs do backend para ver as credenciais iniciais, ou acesse a rota:

```bash
# As migrações e seed inicial rodam automaticamente na primeira inicialização
```

> ℹ️ O banco de dados SQLite (`gostate.db`) é criado automaticamente em `backend/` na primeira execução.

---

## Setup com Docker Compose (produção / agente)

### docker-compose completo (backend + agente)

Crie um `docker-compose.yml` na raiz ou em uma pasta de deploy:

```yaml
services:
  backend:
    build: ./backend
    ports:
      - "4000:4000"
    environment:
      PORT: 4000
      JWT_SECRET: sua-chave-secreta-aqui
      NODE_ENV: production
    volumes:
      - ./data:/app/data   # persiste o gostate.db
    restart: unless-stopped

  agente:
    build: ./agent
    restart: unless-stopped
    environment:
      AGENT_TOKEN: <token-gerado-no-admin>
      BACKEND_URL: http://backend:4000
      NODE_ENV: production
      AGENT_MAX_CONCURRENT: 3
      PLAYWRIGHT_BROWSERS_PATH: /root/.cache/ms-playwright
    depends_on:
      - backend
```

### Apenas o agente (conectando a backend existente)

Veja o arquivo `agent/docker-compose.yml` já configurado:

```yaml
services:
  agent-teste--1:
    build: .
    restart: unless-stopped
    environment:
      AGENT_TOKEN: <token-do-admin>
      BACKEND_URL: http://host.docker.internal:4000
      NODE_ENV: production
      AGENT_MAX_CONCURRENT: 3
      PLAYWRIGHT_BROWSERS_PATH: /root/.cache/ms-playwright
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Comandos:

```bash
cd agent

# Build e start
docker compose up -d --build

# Ver logs
docker compose logs -f

# Parar
docker compose down
```

---

## Variáveis de ambiente do Agente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `AGENT_TOKEN` | (obrigatório) | Token de autenticação gerado no painel Admin |
| `BACKEND_URL` | `http://localhost:4000` | URL do backend goState |
| `AGENT_MAX_CONCURRENT` | `3` | Número máximo de execuções paralelas |
| `PLAYWRIGHT_BROWSERS_PATH` | `/root/.cache/ms-playwright` | Caminho dos browsers do Playwright no container |
| `NODE_ENV` | `development` | Ambiente de execução |

---

## Verificar se está funcionando

```bash
# Backend health check
curl http://localhost:4000/health

# Listar agentes (requer token JWT)
curl -H "Authorization: Bearer <jwt>" http://localhost:4000/api/agents
```

![Screenshot: Dashboard após login com backend online](./screenshots/dashboard-online.png)
