const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function run() {
  console.log('Iniciando captura de telas com Playwright...');
  
  // Certifica-se de que a pasta de screenshots existe
  const screenshotsDir = path.join(__dirname, '..', 'docs', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  try {
    console.log('Navegando para o Login do sistema...');
    await page.goto('http://localhost:5173/login');
    
    // Preenche credenciais (a senha do seed no db/schema.ts é admin123)
    await page.fill('input[type="email"]', 'admin@gostate.dev');
    await page.fill('input[type="password"]', 'admin123');
    
    console.log('Efetuando login...');
    await page.click('button[type="submit"]');

    // Aguarda carregar o Dashboard
    console.log('Aguardando redirecionamento para o Dashboard...');
    await page.waitForURL('**/dashboard');
    await page.waitForTimeout(3000); // Aguarda renderizar gráficos e animações

    // 1. Dashboard Screenshot
    console.log('Capturando Dashboard...');
    await page.screenshot({ path: path.join(screenshotsDir, 'executions-dashboard.png') });

    // Clica no menu Automação se o link de casos de teste não estiver visível
    console.log('Verificando se o link de Casos de Teste está visível...');
    const tcLink = page.locator('a[href="/testcases"]');
    if (!(await tcLink.isVisible())) {
      console.log('Abrindo submenu de Automação...');
      const autoMenuButton = page.locator('button:has-text("Automação")');
      if (await autoMenuButton.isVisible()) {
        await autoMenuButton.click();
        await page.waitForTimeout(1000);
      }
    }

    // 2. Test Cases Screenshot
    console.log('Navegando para Casos de Teste...');
    await page.click('a[href="/testcases"]');
    await page.waitForTimeout(2500); // Aguarda carregar a lista de casos de teste
    await page.screenshot({ path: path.join(screenshotsDir, 'testcases-list.png') });

    // 3. Canvas Editor Screenshot
    console.log('Abrindo editor Canvas do primeiro caso de teste...');
    const abrirCanvasLink = page.locator('text=Abrir Canvas').first();
    if (await abrirCanvasLink.isVisible()) {
      await abrirCanvasLink.click();
      console.log('Aguardando editor carregar...');
      await page.waitForURL('**/editor**');
      await page.waitForTimeout(4000); // Aguarda renderizar o grafo do React Flow
      await page.screenshot({ path: path.join(screenshotsDir, 'canvas-editor.png') });
    } else {
      console.log('AVISO: Link "Abrir Canvas" não encontrado, pulando captura do Canvas.');
    }

    // 4. Scripts Editor Screenshot
    console.log('Navegando para a página de Scripts...');
    const scriptsLink = page.locator('a[href="/scripts"]');
    if (!(await scriptsLink.isVisible())) {
      console.log('Reabrindo submenu de Automação...');
      const autoMenuButton = page.locator('button:has-text("Automação")');
      if (await autoMenuButton.isVisible()) {
        await autoMenuButton.click();
        await page.waitForTimeout(1000);
      }
    }
    
    await page.click('a[href="/scripts"]');
    await page.waitForTimeout(2500); // Aguarda carregar os scripts
    await page.screenshot({ path: path.join(screenshotsDir, 'scripts-editor.png') });

    console.log('Todas as capturas de tela foram geradas com sucesso em docs/screenshots/!');
  } catch (error) {
    console.error('Erro durante a execução do script de captura:', error);
  } finally {
    await browser.close();
  }
}

run();
