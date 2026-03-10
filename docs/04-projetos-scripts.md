# 04 — Projetos, Scripts e Suítes

## Estrutura de Organização

```
Projeto
├── Scripts (JS/TS Playwright direto)
└── Suítes
    └── Test Cases (steps visuais)
```

---

## Projetos

Um **Projeto** é o contêiner principal que agrupa todos os testes relacionados a um sistema ou aplicação.

### Criar um Projeto

1. No menu lateral, clique em **Projetos**
2. Clique em **"+ Novo Projeto"**
3. Informe nome e descrição (opcional)
4. Clique em **Criar**

![Screenshot: Formulário de criação de projeto](./screenshots/criar-projeto.png)

### Detalhes do Projeto

Ao clicar em um projeto, você acessa:
- Lista de Suítes
- Lista de Scripts
- Histórico de execuções do projeto
- Estatísticas (passou/falhou/erro)

![Screenshot: Tela de detalhes do projeto](./screenshots/detalhe-projeto.png)

---

## Scripts

Um **Script** é um arquivo JavaScript Playwright escrito manualmente, com controle total sobre os testes.

### Criar um Script

1. Dentro de um projeto, clique na aba **Scripts**
2. Clique em **"+ Novo Script"**
3. Escreva o código Playwright no editor
4. Salve e execute

**Exemplo de script:**

```javascript
const { test, expect } = require('@playwright/test');

test('login com sucesso', async ({ page }) => {
  await page.goto('https://meuapp.com/login');
  await page.fill('#email', 'usuario@email.com');
  await page.fill('#password', 'senha123');
  await page.click('button[type=submit]');
  await expect(page).toHaveURL('/dashboard');
  await expect(page.locator('h1')).toContainText('Bem-vindo');
});
```

### Executar um Script

1. Abra o script
2. Clique em **"Executar"**
3. Selecione o browser (chromium, firefox, webkit)
4. Aguarde o resultado na página de Execuções

---

## Suítes e Test Cases

Uma **Suíte** agrupa **Test Cases** relacionados. Um **Test Case** é definido por steps visuais (sem escrever código).

### Criar uma Suíte

1. Na aba **Suítes** do projeto, clique em **"+ Nova Suíte"**
2. Informe o nome
3. Clique em **Criar**

### Criar um Test Case

1. Dentro da suíte, clique em **"+ Novo Test Case"**
2. Informe o título
3. Adicione steps usando o editor visual

### Editor Visual de Steps

O editor suporta os seguintes tipos de step:

| Tipo | Descrição | Parâmetros |
|------|-----------|------------|
| `goto` | Navegar para URL | `url` |
| `click` | Clicar em elemento | `selector` |
| `fill` | Preencher campo | `selector`, `value` |
| `expect_text` | Verificar texto | `selector`, `text` |
| `expect_visible` | Verificar visibilidade | `selector` |
| `expect_hidden` | Verificar oculto | `selector` |
| `expect_value` | Verificar valor de input | `selector`, `value` |
| `assert_url` | Verificar URL atual | `url` (parcial) |
| `assert_title` | Verificar título da página | `title` (parcial) |
| `wait_for` | Aguardar elemento | `selector` |
| `wait_for_url` | Aguardar URL | `url` |
| `wait_ms` | Aguardar tempo | `ms` |
| `screenshot` | Capturar screenshot | `filename` |
| `hover` | Passar mouse | `selector` |
| `double_click` | Duplo clique | `selector` |
| `select_option` | Selecionar opção | `selector`, `value` |
| `clear` | Limpar campo | `selector` |
| `keyboard` | Pressionar tecla | `key` (ex: `Enter`) |
| `scroll` | Rolar página | `direction`, `selector` |
| `api_call` | Fazer requisição HTTP | `url`, `method`, `body` |

![Screenshot: Editor visual de steps](./screenshots/editor-steps.png)

---

## Executar uma Suíte Completa

1. Abra a suíte
2. Clique em **"Executar Suíte"**
3. O sistema criará uma execução para cada test case da suíte
4. Acompanhe os resultados na página de Execuções

---

## Dicas

- **Seletores CSS:** prefira `data-testid` nos seus componentes para testes mais estáveis
- **Scripts vs Test Cases:** use scripts para lógica complexa; use test cases para fluxos simples com steps reutilizáveis
- **Timeouts:** o timeout padrão por execução é de 60 segundos; ajuste se necessário
