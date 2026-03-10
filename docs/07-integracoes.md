# 07 — Integrações (Webhooks e Notificações)

## O que são Integrações?

Integrações permitem enviar notificações automáticas para canais externos quando execuções de teste ocorrem. O goState suporta:

| Tipo | Protocolo | Descrição |
|------|-----------|-----------|
| **Discord** | Webhook HTTP | Mensagem no canal Discord |
| **Slack** | Webhook HTTP | Mensagem no canal Slack |
| **Microsoft Teams** | Webhook HTTP | Mensagem no Teams |
| **Telegram** | Bot API | Mensagem via bot Telegram |
| **PagerDuty** | Events API v2 | Alerta/incidente no PagerDuty |
| **Webhook genérico** | HTTP POST | Qualquer endpoint HTTP |
| **E-mail (SMTP)** | SMTP | E-mail via servidor próprio |

---

## Criar uma Integração

1. No menu lateral, clique em **Integrações**
2. Clique em **"+ Nova Integração"**
3. Selecione o **tipo**
4. Preencha os campos específicos do tipo
5. Selecione os **eventos** a notificar
6. Clique em **"Criar Integração"**

![Screenshot: Formulário de nova integração](./screenshots/criar-integracao.png)

---

## Eventos Disponíveis

| Evento | Quando dispara |
|--------|----------------|
| `execution.passed` | Execução finalizada com sucesso |
| `execution.failed` | Execução finalizada com falha |
| `execution.error` | Execução com erro inesperado |
| `execution.started` | Execução iniciada no agente |

---

## Opções de Conteúdo

Cada integração pode incluir informações extras na notificação:

| Opção | Descrição |
|-------|-----------|
| **Relatório detalhado** | Inclui estatísticas completas da execução |
| **Lista de steps** | Lista os steps executados e seus resultados |
| **Artefatos** | Inclui links para downloads de artefatos |

---

## Configuração por Tipo

### Discord

1. Abra o servidor Discord → canal desejado → Configurações → Integrações → Webhooks
2. Crie um novo webhook e copie a URL
3. Cole no campo **Webhook URL** do goState
4. Formato: `https://discord.com/api/webhooks/ID/TOKEN`

![Screenshot: Configuração de integração Discord](./screenshots/integracao-discord.png)

---

### Slack

1. Acesse [api.slack.com/apps](https://api.slack.com/apps) e crie um app
2. Ative **Incoming Webhooks** e adicione ao workspace
3. Copie a Webhook URL
4. Formato: `https://hooks.slack.com/services/T.../B.../xxx`

---

### Microsoft Teams

1. No Teams, clique no canal → "..." → Conectores
2. Adicione **Incoming Webhook** e copie a URL
3. Formato: `https://xxx.webhook.office.com/webhookb2/...`

---

### Telegram

1. Crie um bot via [@BotFather](https://t.me/BotFather) no Telegram
2. Copie o **Bot Token**
3. Obtenha o **Chat ID** (use `@userinfobot` ou a API do Telegram)
4. Cole ambos nos campos correspondentes

---

### PagerDuty

1. No PagerDuty, vá em **Services → Integration → Events API v2**
2. Copie a **Integration Key** (routing key)
3. Cole no campo correspondente

---

### Webhook Genérico

Qualquer endpoint que aceite `POST` com `Content-Type: application/json`.

**Payload enviado:**
```json
{
  "event": "execution.passed",
  "status": "passed",
  "title": "Login test",
  "project": "Meu Projeto",
  "duration_ms": 2436,
  "from_schedule": false,
  "timestamp": "2026-03-10T13:47:00.000Z"
}
```

---

### E-mail (SMTP)

Configure um servidor SMTP para envio de notificações por e-mail:

| Campo | Descrição | Exemplo |
|-------|-----------|---------|
| Host SMTP | Servidor de e-mail | `smtp.gmail.com` |
| Porta | Porta do servidor | `587` |
| SSL/TLS | Usar conexão segura | `false` (STARTTLS) / `true` (porta 465) |
| Usuário | Login do e-mail | `usuario@gmail.com` |
| Senha | Senha ou App Password | `xxxx xxxx xxxx xxxx` |
| Remetente | E-mail exibido no "De:" | `goState <noreply@empresa.com>` |
| Destinatário(s) | Para quem enviar | `time@empresa.com, qa@empresa.com` |
| Prefixo do assunto | Prefixo do assunto do e-mail | `[goState]` |

> **Gmail:** é necessário usar uma **App Password** (não a senha normal). Vá em Conta Google → Segurança → Verificação em duas etapas → Senhas de app.

---

## Testar uma Integração

Após criar, clique em **"Testar"** no card da integração para enviar uma notificação de teste imediatamente.

![Screenshot: Card de integração com botão Testar](./screenshots/integracao-testar.png)

---

## Editar / Remover uma Integração

- Clique no ícone de **lápis** para editar
- Clique no ícone de **lixeira** para remover
- Use o toggle para **ativar/desativar** sem remover

---

## Escopo das Integrações

| Escopo | Descrição |
|--------|-----------|
| **Global** | Notifica execuções de todos os projetos |
| **Por projeto** | Notifica apenas execuções do projeto selecionado |

Selecione o projeto no campo **"Projeto"** ao criar a integração (deixe em branco para global).
