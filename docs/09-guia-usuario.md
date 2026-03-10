# 09 — Guia do Usuário

Passo a passo completo para usar o goState do zero.

---

## 1. Primeiro Acesso

Acesse http://localhost:5173 e faça login com as credenciais fornecidas pelo administrador.

![Screenshot: Tela de login do goState](./screenshots/login.png)

Após o login, você verá o **Dashboard** com:
- Resumo de execuções recentes
- Status dos agentes
- Gráfico de pass/fail rate

![Screenshot: Dashboard principal](./screenshots/dashboard.png)

---

## 2. Criar seu Primeiro Projeto

1. Clique em **Projetos** no menu lateral
2. Clique em **"+ Novo Projeto"**
3. Informe o nome (ex: `Meu App`) e uma descrição opcional
4. Clique em **Criar**

![Screenshot: Criando um novo projeto](./screenshots/criar-projeto.png)

---

## 3. Criar um Test Case (sem código)

Para criar testes usando o editor visual:

1. Abra o projeto criado
2. Clique na aba **Suítes** → **"+ Nova Suíte"** (ex: `Fluxo de Login`)
3. Dentro da suíte, clique em **"+ Novo Test Case"** (ex: `Login com sucesso`)
4. Use o editor de steps para montar o fluxo:

**Exemplo de fluxo de login:**

| # | Tipo | Parâmetros |
|---|------|------------|
| 1 | `goto` | `url: https://meuapp.com/login` |
| 2 | `fill` | `selector: #email`, `value: usuario@email.com` |
| 3 | `fill` | `selector: #password`, `value: senha123` |
| 4 | `click` | `selector: button[type=submit]` |
| 5 | `assert_url` | `url: /dashboard` |
| 6 | `expect_text` | `selector: h1`, `text: Bem-vindo` |

5. Clique em **Salvar**

![Screenshot: Editor de steps do test case](./screenshots/editor-steps.png)

---

## 4. Criar um Script (com código)

Para quem prefere escrever Playwright diretamente:

1. Dentro do projeto, clique na aba **Scripts** → **"+ Novo Script"**
2. Dê um título ao script
3. Escreva o código no editor:

```javascript
const { test, expect } = require('@playwright/test');

test('home page carrega', async ({ page }) => {
  await page.goto('https://meuapp.com');
  await expect(page).toHaveTitle(/Meu App/);
  await expect(page.locator('nav')).toBeVisible();
});
```

4. Clique em **Salvar**

![Screenshot: Editor de script](./screenshots/editor-script.png)

---

## 5. Executar um Teste

### Executar um Test Case

1. Abra o test case
2. Clique em **"▶ Executar"**
3. Selecione o browser (chromium recomendado para início)
4. Clique em **Confirmar**

### Executar um Script

1. Abra o script
2. Clique em **"▶ Executar"**
3. Configure opções se necessário
4. Clique em **Executar**

Você será redirecionado para a página da execução onde pode acompanhar o progresso em tempo real.

![Screenshot: Execução em andamento com logs ao vivo](./screenshots/execucao-ao-vivo.png)

---

## 6. Interpretar os Resultados

### Status da Execução

| Badge | Significado |
|-------|-------------|
| 🟡 Na fila | Aguardando agente disponível |
| 🔵 Executando | Rodando agora no agente |
| 🟢 Passou | Todos os testes passaram ✓ |
| 🔴 Falhou | Um ou mais testes falharam ✗ |
| 🟠 Erro | Problema técnico (browser, timeout, etc.) |

### Ver os Logs

Na aba **Logs** você vê o output completo do Playwright:

```
Running 1 test using 1 worker

[1/1] [chromium] › test.spec.js › home page carrega
  ✓ home page carrega (1.2s)

1 passed (2.4s)
```

### Ver os Steps

Na aba **Steps** cada step aparece com:
- ✅ ou ❌ status individual
- Duração em ms
- Mensagem de erro detalhada em caso de falha

### Baixar Artefatos

Na aba **Artefatos**:
- **Screenshots:** imagens capturadas durante o teste
- **Vídeo:** gravação da execução (se habilitado)
- **Trace:** abra no [trace.playwright.dev](https://trace.playwright.dev) para debug avançado

![Screenshot: Aba de artefatos](./screenshots/artefatos.png)

---

## 7. Configurar Notificações

Para receber alertas quando testes falharem:

1. Clique em **Integrações** no menu
2. Clique em **"+ Nova Integração"**
3. Selecione o tipo (ex: Discord)
4. Cole a Webhook URL do Discord
5. Selecione os eventos: ✅ `Falhou` ✅ `Erro`
6. Clique em **Criar Integração**
7. Clique em **"Testar"** para confirmar o funcionamento

![Screenshot: Card de integração Discord](./screenshots/integracao-configurada.png)

---

## 8. Automatizar com Agendamentos

Para executar testes automaticamente:

1. Clique em **Agendamentos**
2. Clique em **"+ Novo Agendamento"**
3. Configure:
   - **Nome:** `Smoke test diário`
   - **CRON:** `0 9 * * 1-5` (segunda a sexta às 9h)
   - **Test Case:** selecione o test case criado
   - **Browser:** chromium
4. Ative o toggle **"Ativo"**
5. Clique em **Criar**

A partir de agora, o teste será executado automaticamente no horário configurado.

![Screenshot: Agendamento criado e ativo](./screenshots/agendamento-ativo.png)

---

## 9. Acompanhar o Histórico

### Página de Execuções

Use os filtros para encontrar execuções:
- **Status:** filtre apenas "Falhou" para ver problemas
- **Projeto:** filtre por projeto específico
- **Busca:** pesquise por nome do teste

### Comparar Execuções

Para comparar duas execuções lado a lado:
1. Na lista, selecione duas execuções (checkbox)
2. Clique em **"Comparar"**
3. Veja o diff dos steps, duração e logs

---

## 10. Verificar Status dos Agentes

1. Clique em **Agentes** no menu
2. Passe o mouse sobre um card para ver detalhes:
   - Heartbeat (última comunicação)
   - ID do agente
   - Browsers disponíveis (chromium, firefox, etc.)
   - Status: Online 🟢 / Executando 🟡 / Offline ⚫

![Screenshot: Cards de agentes no painel](./screenshots/agentes.png)

> Se um agente estiver **Offline**, verifique se o container Docker está rodando:
> ```bash
> docker compose ps
> docker compose logs -f
> ```

---

## Fluxo Completo em Resumo

```
1. Criar Projeto
       ↓
2. Criar Suíte + Test Cases (ou Scripts)
       ↓
3. Executar manualmente para validar
       ↓
4. Configurar Integração para notificações
       ↓
5. Criar Agendamento para automação contínua
       ↓
6. Acompanhar histórico e agir em falhas
```

---

## Dicas Rápidas

- **Copiar ID de agente:** clique no ID no card do agente (verso do card)
- **Tema claro/escuro:** clique em "Tema Claro/Escuro" no rodapé do menu lateral
- **Filtros rápidos:** as abas "Passou", "Falhou", "Na fila" na página de Execuções são atalhos de filtro
- **Reexecutar:** abra uma execução anterior e clique em **"Reexecutar"** para repetir com a mesma configuração
