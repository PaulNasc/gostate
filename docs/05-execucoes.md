# 05 — Execuções

## O que é uma Execução?

Uma execução representa uma única rodada de testes no agente. Cada vez que um script, test case ou suíte é disparado, o sistema cria um registro de execução com status, logs, duração e artefatos.

---

## Estados de uma Execução

| Status | Cor | Descrição |
|--------|-----|-----------|
| `queued` | 🟡 Amarelo | Aguardando agente disponível |
| `running` | 🔵 Azul | Em andamento no agente |
| `passed` | 🟢 Verde | Todos os testes passaram |
| `failed` | 🔴 Vermelho | Um ou mais testes falharam |
| `error` | 🟠 Laranja | Erro inesperado (browser não encontrado, timeout, etc.) |
| `cancelled` | ⚫ Cinza | Cancelada manualmente |

---

## Fluxo de Status

```
queued → running → passed
                 → failed
                 → error
       → error   (watchdog: sem agente em 5min)
       → error   (agente desconectou)
```

---

## Página de Execuções

### Filtros disponíveis

- **Status:** Todas / Executando / Passou / Falhou / Na fila / Erro / Cancelado
- **Projeto:** filtrar por projeto específico
- **Busca:** por ID, nome do test case ou script

![Screenshot: Página de execuções com filtros](./screenshots/execucoes-lista.png)

### Colunas da tabela

| Coluna | Descrição |
|--------|-----------|
| Status | Badge colorido com o status atual |
| Caso / Script | Nome do test case ou script executado |
| Projeto | Projeto ao qual pertence |
| Browser | Browser utilizado (chromium, firefox, webkit) |
| Agente | Nome do agente que processou |
| Duração | Tempo total de execução |
| Iniciado | Data e hora de criação |

---

## Detalhe de uma Execução

Clique em qualquer execução para ver o detalhe completo:

### Aba Logs

Exibe o output completo do Playwright em tempo real durante a execução, ou o log histórico após finalizar.

```
Running 1 test using 1 worker

[1/1] [chromium] › test.spec.js:2:1 › goState Test
  ✓ goState Test (1.2s)

1 passed (2.4s)

[goState Agent] Execução finalizada: PASSED (2436ms)
```

![Screenshot: Detalhe de execução com logs](./screenshots/execucao-detalhe-logs.png)

### Aba Steps

Exibe cada step do test case com status individual (passed/failed), duração e mensagem de erro (se houver).

![Screenshot: Aba steps da execução](./screenshots/execucao-steps.png)

### Aba Artefatos

Lista os arquivos gerados durante a execução:
- **Screenshots** (PNG) — capturadas em cada step de screenshot ou em falhas
- **Vídeo** (WebM) — gravação completa se habilitado
- **Trace** (ZIP) — trace do Playwright para debug avançado
- **Relatório HTML** — relatório interativo do Playwright

Clique em qualquer artefato para download.

![Screenshot: Aba artefatos da execução](./screenshots/execucao-artefatos.png)

---

## Cancelar uma Execução

Execuções em status `queued` ou `running` podem ser canceladas:

1. Abra o detalhe da execução
2. Clique no botão **"Cancelar"** (ícone X)
3. O status muda para `cancelled`

> **Nota:** cancelar uma execução `running` envia sinal ao agente para encerrar o processo Playwright.

---

## Execução com Vídeo

Para habilitar gravação de vídeo:

1. Na tela de execução, ative o toggle **"Gravar vídeo"**
2. Execute normalmente
3. Após finalizar, o vídeo estará disponível na aba **Artefatos**

> Vídeo aumenta o tempo de execução e o tamanho dos artefatos. Use com moderação.

---

## Erros Comuns

### `Error: browserType.launch: Executable doesn't exist`

O browser Playwright não está instalado no agente.

**Solução:** reconstrua o container do agente:
```bash
docker compose down && docker compose up -d --build --no-cache
```

### Execução fica em "Na fila" por muito tempo

- Verifique se existe algum agente **Online** no painel de Agentes
- O watchdog marca como `error` após 5 minutos sem processamento
- Ao reconectar um agente, execuções queued dos últimos 30 min são automaticamente re-despachadas

### Timeout na execução

O timeout padrão é 60 segundos. Se seus testes precisam de mais tempo, ajuste o valor ao criar a execução (campo `timeout`).
