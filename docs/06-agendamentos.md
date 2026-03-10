# 06 — Agendamentos (Scheduler)

## O que é um Agendamento?

Um agendamento permite executar testes automaticamente em intervalos definidos usando expressões **CRON**, sem precisar disparar manualmente cada execução.

---

## Criar um Agendamento

1. No menu lateral, clique em **Agendamentos**
2. Clique em **"+ Novo Agendamento"**
3. Preencha o formulário:

| Campo | Descrição | Exemplo |
|-------|-----------|---------|
| Nome | Identificador do agendamento | `Smoke test diário` |
| Expressão CRON | Quando executar | `0 8 * * 1-5` |
| Test Case ou Script | O que executar | Selecione da lista |
| Agente | Agente preferencial | Opcional |
| Browser | Browser para execução | `chromium` |
| Ativo | Liga/desliga o agendamento | ✅ |

![Screenshot: Formulário de criação de agendamento](./screenshots/criar-agendamento.png)

---

## Expressões CRON

O formato é: `minuto hora dia-do-mês mês dia-da-semana`

| Expressão | Descrição |
|-----------|-----------|
| `0 8 * * 1-5` | Toda segunda a sexta às 8h |
| `0 */2 * * *` | A cada 2 horas |
| `0 9,18 * * *` | Às 9h e 18h todos os dias |
| `*/15 * * * *` | A cada 15 minutos |
| `0 0 * * 0` | Todo domingo à meia-noite |
| `0 8 1 * *` | Todo dia 1 do mês às 8h |

> **Dica:** use [crontab.guru](https://crontab.guru) para validar expressões CRON.

---

## Gerenciar Agendamentos

Na lista de agendamentos você pode:

- **Ativar/Desativar** um agendamento com o toggle
- **Executar agora** — disparo manual imediato
- **Editar** — alterar configurações
- **Excluir** — remover permanentemente

![Screenshot: Lista de agendamentos com ações](./screenshots/lista-agendamentos.png)

---

## Histórico de Execuções Agendadas

Cada disparo do agendamento cria uma execução vinculada. Para visualizar:

1. Clique no agendamento
2. Veja a seção **"Histórico"** com as últimas execuções
3. Clique em qualquer execução para ver detalhes completos

A coluna **"Última execução"** na lista mostra o resultado mais recente com badge de status.

---

## Comportamento do Scheduler

- O scheduler verifica os agendamentos a cada **30 segundos**
- Se nenhum agente estiver disponível no momento do disparo, a execução fica em `queued` aguardando
- Agendamentos desativados (`ativo = false`) são ignorados
- O próximo disparo é calculado automaticamente após cada execução

---

## Notificações de Agendamentos

Para receber notificações quando execuções agendadas passam ou falham, configure uma **Integração** (Discord, Slack, SMTP, etc.) e marque o evento `execution.started` e/ou `execution.passed`/`execution.failed`.

Veja [07 — Integrações](./07-integracoes.md) para detalhes.
