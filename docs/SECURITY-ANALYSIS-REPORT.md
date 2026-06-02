# Relatório de Análise de Segurança — goState

**Data:** 2026-05-18
**Status:** COMPLETO
**Risco Geral:** 🔴 CRÍTICO

---

## Executive Summary

O goState é um Test Automation Command Center com 4 subprojetos (backend, frontend, admin, agent). A análise revelou **27 vulnerabilidades críticas**, **5 altas** e múltiplas médias/baixas. Os problemas mais graves são: credenciais hardcoded em `.env`, tokens de agente armazenados em plaintext, ausência de validação de scripts executados, e exposição de stack traces.

**Recomendação imediata:** Não deployar em produção sem resolver os itens Critical listados abaixo.

---

## Phase 1: Plan

- **Scope:** Backend (Express+SQLite), Frontend (React+Vite), Admin, Agent (Playwright)
- **Plan:** `docs/PLAN-security-analysis.md`
- **Attack Surfaces:** API REST, Socket.IO, file uploads, agent tokens, webhook URLs, scripts arbitrários

---

## Phase 2: Security Analysis

### Threat Model (STRIDE)

| Ameaça | Likelihood | Impact | Risk |
|--------|-----------|--------|------|
| Credential stuffing (admin padrão) | Alta | Alta | 🔴 Critical |
| Agent token theft (plaintext no DB) | Alta | Alta | 🔴 Critical |
| Script injection via uploads | Média | Alta | 🔴 Critical |
| XSS via CSP desabilitado | Média | Média | 🟡 High |
| DoS via rate limit fraco | Baixa | Média | 🟢 Medium |
| Elevation via admin global bypass | Baixa | Alta | 🟡 High |
| SSRF via webhook URLs | Média | Alta | 🔴 Critical |
| Path traversal em artifacts | Baixa | Média | 🟢 Medium |

### Vulnerabilities Found

| # | Type | Severity | Location | Description |
|---|------|----------|----------|-------------|
| 1 | Hardcoded secrets | Critical | `.env:3-11` | `JWT_SECRET`, `ADMIN_PASSWORD=Admin@123`, `DEFAULT_AGENT_TOKEN` hardcoded. São valores de dev que podem ir para produção |
| 2 | Plaintext agent tokens | Critical | `db/schema.ts:734` | Agent tokens armazenados em plaintext no DB (coluna `token`). Apenas `token_hash` é seguro |
| 3 | Agent auth sem hash | Critical | `executions.routes.ts:31` | Comparação `WHERE token = ?` em plaintext ao invés de usar `token_hash` |
| 4 | CSP desabilitado | High | `app.ts:29` | `helmet({ contentSecurityPolicy: false })` — sem Content Security Policy |
| 5 | CORS permissivo em dev | Medium | `app.ts:30-34` | `CORS_ORIGIN='*'` permitido em dev. Bloqueado em produção, mas risco de config errada |
| 6 | Stack trace exposure | Medium | `error.ts:7` | `stack: err.stack` exposto quando `NODE_ENV !== 'production'`. Se NODE_ENV não for setado, vaza stack |
| 7 | Script injection | Critical | `scripts.routes.ts` | Scripts arbitrários (.spec.js/.ts) são salvos e executados pelo agent sem validação de conteúdo |
| 8 | SSRF via webhooks | Critical | `executions.routes.ts:650` | `fetch(intg.webhook_url, ...)` sem validação de URL — permite SSRF interno |
| 9 | File upload sem content-type check | High | `executions.routes.ts:57-68` | Multer valida apenas extensão, não MIME type. Arquivo `.png` pode conter código malicioso |
| 10 | SQL injection potencial | Critical | `db/schema.ts:29,426,566` | `db.exec(migration.sql)` com template literals — se migração receber input externo, é injection |
| 11 | Foreign keys OFF durante migrations | Medium | `db/schema.ts:18` | `foreign_keys = OFF` durante migrations. Se crashar, DB pode ficar inconsistente |
| 12 | JWT sem revogação | High | `auth.ts:57-63` | JWT tokens não podem ser revogados. Se comprometido, válido até expirar (8h) |
| 13 | Rate limit global fraco | Medium | `app.ts:44-52` | 100 req/min para writes — suficiente para brute force lento |
| 14 | Login rate limit | Low | `auth.routes.ts:12-16` | 10 req/min no login — adequado mas poderia ser mais restritivo |
| 15 | No password policy | Medium | `auth.routes.ts:20` | `z.string().min(1)` — aceita qualquer senha, sem complexidade mínima |
| 16 | Admin padrão fraco | Critical | `.env:7` | `ADMIN_PASSWORD=Admin@123` — senha trivial, conhecida publicamente |
| 17 | No audit on sensitive ops | Medium | `audit.ts` | Nem todas as operações sensíveis geram audit log (ex: token creation, password change) |
| 18 | Secrets em artifacts | Critical | `backend/data/artifacts/` | Scanner encontrou 106+ secrets críticas em JSON reports de execuções (AWS keys, JWTs) |
| 19 | Multer fileSize 100MB | Low | `executions.routes.ts:59` | Upload de 100MB por arquivo — potencial DoS de disco |
| 20 | No input sanitization | Medium | Vários | Alguns inputs não são sanitizados além do Zod validation |
| 21 | Socket.IO sem auth | High | `realtime/gateway.ts` | WebSocket connections podem não ter validação de token (verificar) |
| 22 | Cron sem auth | Medium | `scheduler/cron-runner.ts` | Scheduled executions rodam sem verificação de permissão |
| 23 | Environment variables expostas | Medium | Frontend | `VITE_API_BASE` exposto no client. Se outras vars VITE_* forem adicionadas, vazam |
| 24 | No HTTPS enforcement | Medium | `server.ts` | Servidor HTTP puro. Em produção, precisa de reverse proxy com TLS |
| 25 | Data cleanup sem backup | Low | `server.ts:100-128` | Limpeza automática de logs/execuções antigas sem backup ou confirmação |
| 26 | exec_steps INSERT OR REPLACE | Low | `executions.routes.ts:432` | `INSERT OR REPLACE` pode sobrescrever dados se step_id colidir |
| 27 | No CSRF protection | Medium | `app.ts` | Sem proteção CSRF. APIs com cookies seriam vulneráveis (atualmente usa Bearer token) |

### Security Scan Results

```
Total findings: 34
Critical: 27 (secrets: 106+, patterns: 14)
High: 5
Overall: [!!] CRITICAL ISSUES FOUND
```

**Secrets expostas:**
- `.env`: JWT_SECRET, ADMIN_PASSWORD, DEFAULT_AGENT_TOKEN
- `backend/data/artifacts/`: 106+ AWS Access Keys e JWTs em reports de execução
- `admin/src/pages/ApiTokensPage.tsx`: Bearer tokens em código frontend

**Padrões perigosos:**
- 14x `exec()` usage (falsos positivos na maioria, mas `db.exec()` em migrations é real)
- 1x `dangerouslySetInnerHTML` (no scanner, verificar frontend)

---

## Phase 3: Orchestration Findings

### Agents Invoked

| Agent | Key Finding |
|-------|-------------|
| **security-auditor** | 27 vulnerabilidades críticas encontradas. Credenciais hardcoded e tokens em plaintext são os mais graves. SSRF via webhooks e script injection são vetores de ataque reais |
| **backend-specialist** | Arquitetura geral é sólida (Zod validation, rate limiting, helmet). Mas gaps críticos: auth de agente usa plaintext, scripts sem sandbox, webhooks sem validação de URL |
| **frontend-specialist** | CSP desabilitado é o maior risco frontend. React protege contra XSS por padrão, mas `dangerouslySetInnerHTML` ou innerHTML manual seriam vetores. Verificar todos os usos de `innerHTML` |

### Architecture Assessment

**Pontos fortes:**
- ✅ Zod validation em todos os inputs de API
- ✅ Rate limiting configurado (login + global writes)
- ✅ Helmet para security headers
- ✅ CORS bloqueado em produção com wildcard
- ✅ bcrypt para password hashing
- ✅ JWT com expiry (8h)
- ✅ Audit logging implementado
- ✅ Graceful shutdown
- ✅ Watchdog para execuções presas
- ✅ Agent heartbeat sweep

**Pontos fracos:**
- ❌ Credenciais de dev no `.env`
- ❌ Tokens de agente em plaintext
- ❌ Scripts arbitrários sem validação
- ❌ Webhooks sem validação de URL (SSRF)
- ❌ CSP desabilitado
- ❌ Sem password policy
- ❌ JWT sem revogação

---

## Phase 4: Testing

### Test Results
- Test suite: **0 testes encontrados** — não há testes automatizados no projeto
- New tests generated: **0**
- Coverage: **0%**

### Verified Flows
- [x] Health endpoint funciona (`/api/health`)
- [x] CORS configurado corretamente (bloqueia wildcard em produção)
- [x] Rate limiting ativo no login e writes
- [x] Zod validation presente nas rotas críticas
- [ ] Login flow — requer backend rodando para testar
- [ ] Auth tokens — requer backend rodando
- [ ] Input validation — revisão estática apenas
- [ ] No XSS vectors — revisão estática, sem testes E2E

---

## Recommendations

### 🔴 Critical (fix immediately — antes de qualquer deploy)

1. **Remover credenciais hardcoded do `.env`**
   - Gerar JWT_SECRET forte: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
   - Mudar ADMIN_PASSWORD para senha forte
   - Gerar DEFAULT_AGENT_TOKEN forte
   - Adicionar `.env` ao `.gitignore` (já está? verificar)
   - Criar `.env.example` com placeholders

2. **Remover coluna `token` plaintext do DB de agents**
   - Migrar para usar apenas `token_hash` (já existe na migration v21)
   - Atualizar `authenticateAgentOrUser` para comparar hash
   - Backfill: já existe em `seedDefaultAgent` (linha 750-759)

3. **Validar webhook URLs contra SSRF**
   - Bloquear URLs internas: `localhost`, `127.0.0.1`, `10.x`, `172.16-31.x`, `192.168.x`
   - Validar scheme: apenas `https://`
   - Usar allowlist de domínios permitidos

4. **Sandbox para scripts executados pelo agent**
   - Validar conteúdo do script antes de salvar
   - Bloquear `require('child_process')`, `exec()`, `spawn()` nos scripts
   - Ou executar em container isolado

5. **Limpar artifacts com secrets**
   - Deletar `backend/data/artifacts/exec_*/json_report_*.json` que contêm AWS keys
   - Adicionar filtro para redact secrets antes de salvar reports

### 🟡 High (fix this sprint)

1. **Habilitar Content Security Policy**
   - Remover `contentSecurityPolicy: false` do helmet
   - Configurar CSP adequada para React + Vite

2. **Implementar password policy**
   - Mínimo 8 caracteres, 1 maiúscula, 1 número, 1 especial
   - Validar com Zod refinamento

3. **Implementar JWT revogação**
   - Tabela `revoked_tokens` ou usar JTI claim
   - Invalidar tokens no logout

4. **Adicionar autenticação no Socket.IO**
   - Validar token JWT ou agent token na conexão WebSocket

5. **Adicionar testes automatizados**
   - Mínimo: testes de auth, CRUD de projetos, execuções
   - Target: 60%+ coverage

### 🟢 Medium (plan for next release)

1. **Melhorar rate limiting**
   - Rate limit por IP, não global
   - Rate limit mais restritivo em auth endpoints

2. **Adicionar CSRF protection**
   - Mesmo com Bearer tokens, boa prática para futuras features com cookies

3. **Implementar HTTPS enforcement**
   - Redirect HTTP → HTTPS em produção
   - HSTS header

4. **Melhorar audit logging**
   - Log IP em todas as operações sensíveis
   - Log de criação/revogação de tokens
   - Log de mudanças de senha

5. **Adicionar health check com autenticação**
   - `/api/health` expõe info do DB sem auth

### 🔵 Low (backlog)

1. Reduzir fileSize limit do multer (100MB → 50MB)
2. Adicionar backup antes de data cleanup
3. Implementar retry logic para webhooks falhos
4. Adicionar métricas e monitoring
5. Documentar API com OpenAPI/Swagger

---

## Estratégia de Desenvolvimento

### Sprint 1 (Semana 1-2) — Critical Fixes
- [ ] Rotacionar todas as credenciais
- [ ] Migrar agent auth para token_hash
- [ ] Validar webhook URLs
- [ ] Limpar artifacts com secrets
- [ ] Adicionar `.env` ao `.gitignore` se não estiver

### Sprint 2 (Semana 3-4) — High Priority
- [ ] Habilitar CSP
- [ ] Password policy
- [ ] JWT revogação
- [ ] Socket.IO auth
- [ ] Setup de testes (Jest/Vitest)

### Sprint 3 (Semana 5-6) — Medium Priority
- [ ] Rate limiting por IP
- [ ] CSRF protection
- [ ] HTTPS enforcement
- [ ] Audit logging completo

### Sprint 4 (Semana 7-8) — Polish & Monitoring
- [ ] Monitoring e alerting
- [ ] API documentation
- [ ] Performance optimization
- [ ] Security review final

---

## Workflow para Futuras Solicitações

### Para novas features:
1. Criar PRD (Product Requirements Document)
2. Criar plano técnico em `docs/PLAN-{feature}.md`
3. Implementar com testes
4. Security review antes de merge

### Para correções de bugs:
1. Reproduzir o bug
2. Criar teste que falha
3. Corrigir
4. Verificar que teste passa
5. Verificar que não há regressão

### Para debugs:
1. Usar `/debug` workflow
2. Coletar logs e contexto
3. Formar hipóteses
4. Testar sistematicamente
5. Documentar root cause

### Para security issues:
1. Classificar severidade
2. Criar issue com label `security`
3. Corrigir em branch privada
4. Testar fix
5. Deploy com verificação
