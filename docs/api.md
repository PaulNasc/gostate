# goState API Reference

A API do goState é construída em Express (Node.js) e opera na porta padrão `4000`. Todas as requisições que modificam estado exigem cabeçalho de Autenticação (`Authorization: Bearer <token>`).

## Authentication

### POST /api/auth/login

Autentica um usuário ou administrador e retorna um JWT.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| email | string | Yes | Email do usuário (ex: admin@gostate.dev) |
| password | string | Yes | Senha cadastrada |

**Response:**
- `200`: Sucesso. Retorna objeto contendo `{ token, user }`.
- `401`: Credenciais inválidas.

**Example Request:**
```json
{
  "email": "admin@gostate.dev",
  "password": "sua-senha-segura"
}
```

---

## Executions (Testes)

### POST /api/executions

Cria e dispara uma nova execução de teste para o Agente.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| project_id | string | Yes | ID do Projeto que o teste pertence |
| test_case_id | string | No | ID do Test Case (passos visuais) |
| script_id | string | No | ID do Script customizado (caso seja código) |
| agent_id | string | Yes | ID do Agente que deverá processar o teste |
| browsers | string[] | Yes | Array com nomes dos navegadores (ex: `["chromium"]`) |

**Response:**
- `200`: Retorna os dados da `execution` criada.
- `400`: O Agente informado está offline.
- `404`: Test Case ou Agente não encontrados.

---

### GET /api/executions/:id

Recupera os detalhes, metadados e os status de uma execução específica.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | string | Yes | ID da execução |

**Response:**
- `200`: Objeto Execution com todos os artefatos vinculados (screenshots e vídeos).

---

## Agents (WebSockets & REST)

Os Agentes se comunicam via REST para tarefas pesadas, mas usam Socket.IO para telemetria.

### POST /api/executions/:id/artifacts

Endpoint usado estritamente pelo Agente para fazer upload (via `multipart/form-data`) de arquivos e vídeos quando o teste for concluído.

**Parameters (FormData):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| artifacts | File[] | Yes | Arquivos (.png, .webm, .zip) |

**Response:**
- `200`: Artefatos recebidos e registrados no banco.

### WebSockets (Events)

- **`agent.identify`**: Agente envia seu token e capacidades no boot.
- **`exec:dispatch`**: Servidor aciona o Agente para rodar o teste.
- **`agent.log`**: Agente streama os logs do console Playwright em tempo real.
