# 08 — Referência da API REST

## Base URL

```
http://localhost:4000/api
```

## Autenticação

Todas as rotas (exceto `/auth/login`) requerem o header:

```
Authorization: Bearer <jwt_token>
```

O token é obtido via `/auth/login` e tem validade configurável (padrão: 7 dias).

---

## Auth

### `POST /auth/login`

Autentica um usuário e retorna o JWT.

**Body:**
```json
{
  "email": "admin@gostate.dev",
  "password": "senha123"
}
```

**Resposta 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "name": "Administrador",
    "email": "admin@gostate.dev",
    "role": "admin"
  }
}
```

### `GET /auth/me`

Retorna dados do usuário autenticado.

---

## Agentes

### `GET /agents`

Lista todos os agentes.

**Resposta 200:**
```json
{
  "agents": [
    {
      "id": "uuid",
      "name": "agente-cloud-01",
      "status": "online",
      "last_heartbeat": "2026-03-10T13:47:00Z",
      "capabilities": {
        "browsers": ["chromium"],
        "frameworks": ["playwright"],
        "max_concurrent": 3
      }
    }
  ]
}
```

### `POST /agents` *(Admin)*

Registra um novo agente.

**Body:**
```json
{ "name": "agente-docker-01" }
```

**Resposta 201:**
```json
{
  "agent": { "id": "uuid", "name": "agente-docker-01", "token": "TOKEN_GERADO" }
}
```

### `DELETE /agents/:id` *(Admin)*

Remove um agente.

---

## Projetos

### `GET /projects`

Lista projetos do usuário.

### `POST /projects`

Cria um projeto.

**Body:**
```json
{ "name": "Meu Projeto", "description": "Descrição opcional" }
```

### `GET /projects/:id`

Detalhes de um projeto (inclui suítes, scripts, estatísticas).

### `PATCH /projects/:id`

Atualiza nome/descrição.

### `DELETE /projects/:id`

Remove projeto e todos os recursos associados.

---

## Scripts

### `GET /scripts?project_id=uuid`

Lista scripts de um projeto.

### `POST /scripts`

Cria um script.

**Body:**
```json
{
  "project_id": "uuid",
  "title": "Login test",
  "content": "const { test } = require('@playwright/test'); ...",
  "language": "js"
}
```

### `GET /scripts/:id`

Detalhe do script.

### `PATCH /scripts/:id`

Atualiza título ou conteúdo.

### `DELETE /scripts/:id`

Remove script.

---

## Test Cases e Suítes

### `GET /suites?project_id=uuid`

Lista suítes do projeto.

### `POST /suites`

**Body:**
```json
{ "project_id": "uuid", "name": "Fluxo de Login" }
```

### `GET /test-cases?suite_id=uuid`

Lista test cases de uma suíte.

### `POST /test-cases`

**Body:**
```json
{
  "suite_id": "uuid",
  "title": "Login com sucesso",
  "steps": [
    { "type": "goto", "params": { "url": "https://meuapp.com/login" } },
    { "type": "fill", "params": { "selector": "#email", "value": "user@email.com" } },
    { "type": "click", "params": { "selector": "button[type=submit]" } },
    { "type": "assert_url", "params": { "url": "/dashboard" } }
  ]
}
```

### `PATCH /test-cases/:id`

Atualiza título ou steps.

### `DELETE /test-cases/:id`

Remove test case.

---

## Execuções

### `GET /executions`

Lista execuções com paginação e filtros.

**Query params:**

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `status` | string | Filtrar por status |
| `project_id` | uuid | Filtrar por projeto |
| `test_case_id` | uuid | Filtrar por test case |
| `limit` | number | Itens por página (padrão: 50) |
| `offset` | number | Offset para paginação |

### `POST /executions`

Cria e despacha uma nova execução.

**Body:**
```json
{
  "test_case_id": "uuid",
  "browsers": ["chromium"],
  "video_enabled": false,
  "timeout": 60000
}
```

Ou com script:
```json
{
  "script_id": "uuid",
  "browsers": ["chromium", "firefox"],
  "video_enabled": true,
  "timeout": 90000
}
```

**Resposta 201:**
```json
{
  "execution": {
    "id": "uuid",
    "status": "queued",
    "agent_id": "uuid",
    "created_at": "2026-03-10T13:47:00Z"
  }
}
```

### `GET /executions/:id`

Detalhes completos de uma execução (inclui steps e artefatos).

### `PATCH /executions/:id/status`

Atualiza status (usado internamente pelo agente).

**Body:**
```json
{
  "status": "passed",
  "logs": "...",
  "duration_ms": 2436,
  "steps": [...]
}
```

### `POST /executions/:id/cancel`

Cancela uma execução `queued` ou `running`.

---

## Integrações

### `GET /integrations`

Lista integrações.

### `POST /integrations`

Cria uma integração.

**Body (webhook):**
```json
{
  "label": "Discord QA",
  "type": "discord",
  "webhook_url": "https://discord.com/api/webhooks/...",
  "events": ["execution.passed", "execution.failed"],
  "include_flags": { "detailed_report": true, "steps": false, "artifacts": false },
  "project_id": null
}
```

**Body (SMTP):**
```json
{
  "label": "E-mail Time QA",
  "type": "smtp",
  "events": ["execution.failed", "execution.error"],
  "smtp_config": {
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false,
    "user": "bot@empresa.com",
    "pass": "app-password",
    "from": "goState <bot@empresa.com>",
    "to": "time@empresa.com",
    "subject_prefix": "[goState]"
  }
}
```

### `PATCH /integrations/:id`

Atualiza uma integração (campos parciais).

### `DELETE /integrations/:id`

Remove uma integração.

### `POST /integrations/:id/test`

Envia uma notificação de teste para a integração.

---

## Agendamentos

### `GET /schedules`

Lista agendamentos.

### `POST /schedules`

Cria um agendamento.

**Body:**
```json
{
  "name": "Smoke test diário",
  "cron": "0 8 * * 1-5",
  "test_case_id": "uuid",
  "browsers": ["chromium"],
  "enabled": true
}
```

### `PATCH /schedules/:id`

Atualiza agendamento (incluindo `enabled: false` para desativar).

### `DELETE /schedules/:id`

Remove agendamento.

---

## Testando com curl

### 1. Fazer login e salvar token

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gostate.dev","password":"admin123"}' \
  | jq -r '.token')

echo "Token: $TOKEN"
```

### 2. Listar agentes

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/agents | jq .
```

### 3. Criar e executar um test case

```bash
# Criar projeto
PROJECT=$(curl -s -X POST http://localhost:4000/api/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Teste via API"}' | jq -r '.project.id')

# Criar suíte
SUITE=$(curl -s -X POST http://localhost:4000/api/suites \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"project_id\":\"$PROJECT\",\"name\":\"Smoke\"}" | jq -r '.suite.id')

# Criar test case
TC=$(curl -s -X POST http://localhost:4000/api/test-cases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"suite_id\":\"$SUITE\",\"title\":\"Smoke test\",\"steps\":[{\"type\":\"goto\",\"params\":{\"url\":\"https://example.com\"}}]}" \
  | jq -r '.test_case.id')

# Executar
curl -s -X POST http://localhost:4000/api/executions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"test_case_id\":\"$TC\",\"browsers\":[\"chromium\"]}" | jq .
```

### 4. Testar com Postman / Insomnia

Importe a collection:
- **Base URL:** `http://localhost:4000/api`
- **Auth:** Bearer Token (cole o JWT retornado pelo login)
- **Content-Type:** `application/json`

---

## Códigos de Resposta

| Código | Significado |
|--------|-------------|
| `200` | Sucesso |
| `201` | Criado com sucesso |
| `400` | Dados inválidos (veja o campo `error` na resposta) |
| `401` | Não autenticado (token ausente ou inválido) |
| `403` | Sem permissão (role insuficiente) |
| `404` | Recurso não encontrado |
| `500` | Erro interno do servidor |
