# goState — Progresso de Implementação

## ✅ Concluído

| # | Feature |
|---|---------|
| 1 | Artefatos: fix CORP header (Helmet) + URL unificada com API_BASE |
| 2 | Re-run de execução: botão "Re-executar" na ExecutionDetailPage |
| 3 | TestCaseEditorPage: novos steps (hover, double_click, select_option, clear, keyboard, scroll, expect_hidden, expect_value, assert_url, assert_title, wait_for_url) |
| 4 | ProjectDetailPage: botão "Executar Suite" inteira com RunSuiteModal (dispara todos os TCs) |
| 5 | ExecutionsPage: filtro por projeto além de status |
| 6 | Integrations: webhook automático ao finalizar execução (Discord, Slack, HTTP) |
| 7 | No-code builder: TestCaseEditorPage com drag-drop, save, run |
| 8 | Agente: vídeo + screenshots automáticos via Playwright, upload artefatos |
| 9 | ProjectsPage: pass rate bar + last execution status badge |
| 10 | ReportsPage: KPIs, gráficos, tabela por test case |
| 11 | UsersPage: CRUD completo com roles |
| 12 | SchedulerPage: agendamentos com cron, próxima execução, histórico |
| 13 | Watchdog backend: execuções presas → marcadas como error automaticamente |
| 14 | ScriptsPage: editar filename inline no editor toolbar |
| 15 | DashboardPage: métricas em tempo real com socket e gráficos |

| 16 | AgentsPage: edição inline de nome + pulsing status dot (online/busy/offline) |
| 17 | Dashboard: live counter de execuções rodando com banner + link rápido |
| 18 | ExecutionsPage: filtro por projeto + coluna de browser |
| 19 | AgentsPage: rota PUT /api/agents/:id para renomear |
| 20 | Toast notifications global (ToastProvider) para save/run/delete/cancel/error |
| 21 | ExecutionDetailPage: step timeline visual com borda colorida + barra de duração |
| 22 | ProjectDetailPage: última execução por TC com badge clicável + contador exec_count |
| 23 | Backend: test cases list enriquecida com last_exec_status, last_exec_at, last_exec_id |

| 24 | TestCaseEditorPage: sidebar de histórico de versões com restaurar | baixa |
| 25 | ProjectsPage: running_count badge animado por projeto | baixa |
| 26 | SchedulerPage: toast nos CRUD de agendamentos | baixa |
| 27 | IntegrationsPage: toast nos CRUD de integrações | baixa |

| 28 | ReportsPage: exportar relatório como Excel (.xlsx) e PDF (.pdf) | média |
| 29 | TestPlansPage: re-executar plano falho (retryPlan — só TCs que falharam) | alta |
| 30 | ProjectDetailPage: mover TC entre suites (backend PATCH /move + dropdown hover) | média |
| 32 | AgentsPage: capabilities badges (browsers, frameworks, max_concurrent) | média |
| 33 | DashboardPage: widget flakiness top-5 TCs mais instáveis (score de switches) | média |
| 34 | Admin: guia "Como conectar agente" (DeployPanel no admin/AgentsPage) | alta |
| 35 | SchedulerPage: agendamento de TestPlan — modo TC/Plano + backend test_plan_id | alta |

| 31 | ExecutionsPage: comparar duas execuções lado a lado — split-view modal com steps | baixa |
| 36 | Backend: API de auditoria (audit_logs) + AuditPage frontend com filtros e paginação | baixa |
| 37 | ProjectDetailPage: duplicar TC (cópia na mesma suite — backend POST /duplicate) | baixa |
| 38 | SchedulerPage: edição inline de label + cron (Pencil → inputs na linha → Check/X) | baixa |
| 39 | TestPlansPage: reordenar TCs com drag-drop + modal + backend tc_titles no list | baixa |
