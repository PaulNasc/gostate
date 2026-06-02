# Plano de Redesenho de UX/UI e Nova Rota de Acesso ao Canvas Editor

## Objetivo
Profissionalizar e padronizar o frontend do goState (estilização, alinhamentos, responsividade e legibilidade) e criar um atalho direto e intuitivo no menu lateral (sidebar) para a listagem de Casos de Teste e criação direta no editor visual (Canvas).

## Proposta de Alterações

### 1. Backend: Nova Rota Global de Casos de Teste
- **Criar**: Novo arquivo de rotas `backend/src/modules/testcases/global-testcases.routes.ts` para expor o endpoint `GET /api/testcases`.
  - Retorna todos os casos de teste do banco de dados SQLite.
  - Para administradores, retorna todos os casos de teste. Para usuários comuns, retorna os casos de teste dos projetos aos quais pertencem (via tabela `project_members`).
- **Registrar**: Montar a nova rota em `backend/src/app.ts` sob `/api/testcases`.

### 2. Frontend: Nova Página de Casos de Teste e Atalho na Sidebar
- **Layout**: Atualizar [Layout.tsx](file:///e:/GitHub/gostate/frontend/src/components/Layout.tsx) para adicionar o link **"Casos de Teste"** no menu lateral, utilizando o ícone de frasco de teste (`TestTube2`) ou similar.
- **Roteamento**: Adicionar a nova rota `/testcases` em [App.tsx](file:///e:/GitHub/gostate/frontend/src/App.tsx) apontando para a nova página `TestCasesPage.tsx`.
- **Página de Listagem (`TestCasesPage.tsx`)**:
  - Exibir um grid/lista moderno com todos os Casos de Teste do usuário (mostrando o nome do caso, projeto, suite, tags, status, prioridade e status da última execução).
  - Adicionar filtros rápidos por Projeto, Suite, prioridade, status e busca de texto.
  - Adicionar botão proeminente **"Novo Teste Canvas"**. Ao clicar, abre um modal interativo solicitando:
    1. Projeto (Select)
    2. Suite (Select carregado dinamicamente com base no projeto)
    3. Título e Descrição do teste
  - Ao criar, chama a API correspondente e redireciona o usuário diretamente para o `/suites/:suiteId/testcases/:tcId/editor` (com o Canvas ativado por padrão).

### 3. Ajustes de Estilo Geral, Alinhamento e Legibilidade (UX/UI Pro)
- **Standardization**: Padronizar as variáveis de css de cores e sombras em `frontend/src/index.css` (evitar tons cinza inconsistentes, melhorar espaçamentos nas tabelas, garantir visual premium em Dark Mode/Light Mode).
- **Responsiveness**: Ajustar elementos que quebram em telas menores, utilizando flex-wrap e min-width nos cards (dashboard, listagem de execuções).
- **Legibility**: Ajustar tamanhos de fonte de metadados secundários para ficarem bem contrastados, mas discretos.

---

## Cronograma de Tarefas

- [ ] **Tarefa 1**: Criar rota global `/api/testcases` no backend e registrar no `app.ts` → Verificar: `curl localhost:4000/api/testcases` retorna JSON válido.
- [ ] **Tarefa 2**: Criar a nova página [TestCasesPage.tsx](file:///e:/GitHub/gostate/frontend/src/pages/TestCasesPage.tsx) no frontend com lista e filtros → Verificar: Rota `/testcases` abre no frontend.
- [ ] **Tarefa 3**: Implementar o modal "Novo Teste Canvas" com carregamento dinâmico de projetos/suites → Verificar: Criar um caso de teste pelo modal redireciona diretamente ao editor Canvas.
- [ ] **Tarefa 4**: Adicionar o menu "Casos de Teste" em [Layout.tsx](file:///e:/GitHub/gostate/frontend/src/components/Layout.tsx) e atualizar [App.tsx](file:///e:/GitHub/gostate/frontend/src/App.tsx) → Verificar: O item aparece no menu e redireciona corretamente.
- [ ] **Tarefa 5**: Revisar e padronizar o design system (CSS, alinhamentos, responsividade) → Verificar: Audit visual e compilação do TypeScript no frontend e backend finalizada sem erros.
- [ ] **Tarefa 6**: Executar toda a suíte de testes automatizados → Verificar: `npm test` no backend passa com 100% de sucesso.

---

## Critérios de Conclusão (Done When)
- [ ] O menu "Casos de Teste" permite acessar instantaneamente todos os testes do workspace.
- [ ] A criação de novos testes via modal Canvas é direta, intuitiva e sem atritos de navegação.
- [ ] Todos os projetos (frontend e backend) compilam sem nenhum erro e os testes passam 100%.
