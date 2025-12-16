Este projeto é uma plataforma SaaS para monitoramento de reservas aéreas (GOL, LATAM, AZUL) e status de voos em tempo real. O sistema utiliza uma arquitetura baseada em eventos para processar raspagem de dados (scraping) de forma assíncrona e escalável.

## 📐 Arquitetura do Sistema

O projeto é dividido em dois serviços principais que se comunicam via Redis:
- **Core Application (Next.js)**: Frontend, Autenticação, Banco de Dados e API Gateway.
- **Scraper Service (Node.js Worker)**: Serviço isolado responsável por executar a automação de navegadores.

### Fluxo de Execução
1. Usuário adiciona um voo no Dashboard.
2. Next.js envia um Job para a fila Redis (`scrape-queue`).
3. Next.js retorna imediatamente um `jobId` para o frontend (Polling).
4. Scraper Worker pega o Job, escolhe a estratégia (Direta ou Proxy) e executa o Playwright.
5. Scraper Worker salva o resultado no Redis.
6. Next.js recupera o resultado, salva no Supabase e exibe ao usuário.

## 🛠️ Tech Stack

### Core (Frontend/API)
- **Framework**: Next.js 14+ (App Router)
- **Linguagem**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **UI**: Tailwind CSS + Shadcn/UI

### Scraper Service (Worker)
- **Runtime**: Node.js
- **Fila/Queue**: BullMQ
- **Cache/PubSub**: Redis (Upstash ou Self-hosted)
- **Browser Automation**: Playwright (Chromium) + puppeteer-extra-plugin-stealth
- **Proxy Manager**: Lógica customizada (Conexão Direta -> Fallback Proxy Residencial)

## 🚀 Como Rodar Localmente

### Pré-requisitos
- Node.js 18+
- Instância Redis rodando (Local ou Cloud)
- Conta Supabase configurada

### 1. Configuração do Core (Next.js)

Na raiz do projeto (`/flyio`):

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env.local
```

Conteúdo do `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=sua_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_key
SUPABASE_SERVICE_ROLE_KEY=sua_service_key
REDIS_URL=redis://127.0.0.1:6379 # Ou sua URL do Upstash
SCRAPER_SERVICE_URL=http://127.0.0.1:8080/scrape # URL do worker local
CRON_SECRET=sua_senha_segura
```

### 2. Configuração do Scraper Service

Entre na pasta do serviço:

```bash
cd scraper-service

# Instalar dependências
npm install

# Instalar binários dos navegadores (Essencial!)
npx playwright install chromium

# Configurar variáveis
cp .env.example .env
```

Conteúdo do `scraper-service/.env`:

```env
PORT=8080
ENABLE_WORKER=true
REDIS_URL=redis://127.0.0.1:6379 # Deve ser o MESMO Redis do Next.js

# Configuração de Proxy (Webshare)
PROXY_SERVER=http://p.webshare.io:80
PROXY_PASSWORD=seu_password
TOTAL_PROXIES=250
```

### 3. Iniciando a Aplicação

Você precisará de dois terminais abertos:

**Terminal 1 (Worker):**
```bash
cd scraper-service
node server.js
# Output esperado: 👷 Iniciando Worker... 🚀 API running on port 8080
```

**Terminal 2 (Frontend):**
```bash
# Na raiz do projeto
npm run dev
# Output: Ready on http://localhost:3000
```

## 🧠 Lógica de Scraping (Detalhes Técnicos)

O arquivo `scraper.js` implementa estratégias avançadas para evitar bloqueios:

### Estratégia de Rede
- **Tentativa 1 (Conexão Direta)**: O robô tenta acessar o site da cia aérea sem proxy para máxima velocidade.
- **Tentativa 2 (Fallback Proxy)**: Se houver bloqueio ou erro de rede, ele reinicia o navegador usando um proxy residencial rotativo.

### Tratamento por Companhia

#### GOL:
- Usa emulação de Desktop Full HD.
- Simula digitação humana lenta (delay: 400ms).
- Navegação por teclado (Tab + Tab + Enter) para selecionar aeroportos, evitando falhas em Web Components.
- **Persistência de Sessão**: Salva cookies (`session_gol.json`) após o sucesso para reutilizar em execuções futuras e diminuir o "Trust Score" de bot.
- **Anti-Popup**: Loop que detecta e fecha modais de erro ("Houve um erro") tentando buscar novamente até 3 vezes.

#### LATAM:
- Extração robusta do JSON da API interna (`itineraryParts`).
- Normalização do `flightNumber` para evitar erros de banco (ex: duplicidade `LALA3000`).
- **Fallback Híbrido**: Se a API falhar, tenta ler o número do voo diretamente do HTML da página.

#### AZUL:
- Interceptação direta da API de `journeys`.

## 📦 Deploy (Google Cloud Run)

Este projeto está configurado para deploy via Dockerfile no Cloud Run.

### Dockerfile do Scraper
O Worker usa uma imagem base do Playwright para garantir que todas as dependências do sistema operacional (linux libs) estejam presentes.

`Dockerfile`
```dockerfile
FROM mcr.microsoft.com/playwright:v1.48.0-focal
WORKDIR /app
COPY package.json ./
RUN npm install
# Instala apenas o necessário
RUN npx playwright install --with-deps chromium
COPY . .
EXPOSE 8080
CMD [ "node", "server.js" ]
```

## ⚠️ Troubleshooting Comum

- **Erro ECONNREFUSED no Next.js**:
  O `scraper-service` não está rodando ou a variável `SCRAPER_SERVICE_URL` está errada.

- **Erro Job not found (404)**:
  O Redis pode estar limpando os jobs muito rápido. Verifique a configuração `removeOnComplete` no `queue.js`.

- **Playwright erro Executable not found**:
  Você esqueceu de rodar `npx playwright install` no ambiente onde o node está rodando.

- **Banco de dados null constraint**:
  A extração falhou. Verifique os logs do Worker para ver se o JSON da companhia aérea mudou a estrutura.