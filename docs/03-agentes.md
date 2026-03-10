# 03 — Agentes de Execução

## O que é um Agente?

Um agente é um processo Node.js que roda em um servidor (local ou remoto, via Docker) e executa os testes Playwright em nome do goState. Ele se conecta ao backend via Socket.IO, aguarda execuções, roda os testes e devolve logs e resultados.

**Características:**
- Execução paralela configurável (`AGENT_MAX_CONCURRENT`)
- Fila interna: se todos os slots estiverem ocupados, a próxima execução aguarda
- Reconexão automática ao backend
- Re-dispatch automático de execuções "Na fila" ao reconectar (últimos 30 min)
- Upload de artefatos (vídeos, traces, screenshots)

---

## Como Registrar um Agente

### Passo 1 — Acesse o painel Admin

Acesse http://localhost:4001 (ou a URL do seu admin) e faça login com conta de administrador.

![Screenshot: Tela de login do Admin](./screenshots/admin-login.png)

### Passo 2 — Navegue até "Gerenciar Agentes"

No menu lateral, clique em **Agentes**.

![Screenshot: Menu lateral Admin com Agentes destacado](./screenshots/admin-menu-agentes.png)

### Passo 3 — Criar novo agente

Clique em **"+ Novo Agente"**, informe um nome descritivo (ex: `agente-docker-01`) e clique em **Criar**.

![Screenshot: Formulário de criação de agente](./screenshots/admin-criar-agente.png)

O sistema gera automaticamente um **token único** para este agente.

### Passo 4 — Copiar o token

Após criar, use o wizard de instalação (botão "Conectar" no card do agente) para copiar o token e as instruções de deploy.

![Screenshot: Wizard de instalação do agente](./screenshots/admin-wizard-agente.png)

### Passo 5 — Configurar o docker-compose do agente

Edite o arquivo `agent/docker-compose.yml` com o token copiado:

```yaml
services:
  meu-agente:
    build: .
    restart: unless-stopped
    environment:
      AGENT_TOKEN: <cole-o-token-aqui>
      BACKEND_URL: http://host.docker.internal:4000
      NODE_ENV: production
      AGENT_MAX_CONCURRENT: 3
      PLAYWRIGHT_BROWSERS_PATH: /root/.cache/ms-playwright
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

> **Atenção:** `host.docker.internal` é o hostname especial que o Docker usa para acessar o host (sua máquina). Se o backend estiver em outro servidor, substitua pelo IP/hostname real.

### Passo 6 — Subir o agente

```bash
cd agent
docker compose up -d --build
```

Após alguns segundos, o card do agente no painel (prod e admin) deve mudar para **Online** 🟢.

---

## Capabilities do Agente

O agente reporta automaticamente suas capabilities ao conectar:

| Campo | Descrição | Exemplo |
|-------|-----------|---------|
| `browsers` | Browsers Playwright instalados | `["chromium"]` |
| `frameworks` | Frameworks disponíveis | `["playwright"]` |
| `max_concurrent` | Máximo de execuções paralelas | `3` |

> O Dockerfile padrão instala apenas **chromium** para manter a imagem leve. Para adicionar Firefox ou WebKit, edite o `Dockerfile`:
>
> ```dockerfile
> RUN npx playwright install --with-deps chromium firefox webkit
> ```

---

## Estados do Agente

| Status | Descrição |
|--------|-----------|
| 🟢 **Online** | Conectado e disponível para receber execuções |
| 🟡 **Executando** | Ocupado processando uma ou mais execuções |
| ⚫ **Offline** | Desconectado (sem heartbeat há mais de 45s) |

---

## Comportamento ao Reconectar

Quando um agente reconecta após queda:

1. **Execuções `running`** → marcadas como `error` (foram interrompidas)
2. **Execuções `queued`** dos últimos 30 minutos → **re-despachadas automaticamente** para o agente retomar

---

## Logs do Container

```bash
# Acompanhar logs em tempo real
docker compose logs -f

# Logs das últimas 100 linhas
docker compose logs --tail=100
```

Exemplo de log saudável:
```
[Agent] Conectando em http://host.docker.internal:4000... (paralelo máx: 3)
[Agent] Conectado ao backend (id=aBcDeF12)
[Agent] Recebida execução: abc123...
[Agent] Slot adquirido para abc123... (1/3 ativos)
[Agent] Iniciando execução abc123...
[Agent] Framework: playwright | Browsers: chromium
[Agent] Execução finalizada: PASSED (2436ms)
[Agent] Slot liberado (0/3 ativos)
```

---

## Solução de Problemas

### "Executable doesn't exist" no log
O browser não foi instalado corretamente na imagem. Reconstrua com:
```bash
docker compose down
docker compose up -d --build --no-cache
```

### Agente aparece "Offline" mesmo rodando
Verifique se o `BACKEND_URL` está correto e acessível de dentro do container:
```bash
docker compose exec meu-agente curl http://host.docker.internal:4000/health
```

### Execuções ficam "Na fila" indefinidamente
- Verifique se o agente está **Online** no painel
- Verifique se o agente tem o browser correto nas capabilities
- O watchdog do sistema marca como `error` execuções `queued` há mais de 5 minutos sem agente
