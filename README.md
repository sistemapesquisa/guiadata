# 🚀 GuiaData — Plataforma Inteligente de Pesquisa & Auditoria de Campo

Plataforma moderna para gestão de pesquisas eleitorais, opinião pública, auditoria e coletas de dados de campo. Compatível nativamente com o protocolo **OpenRosa (ODK Collect)**, integrada ao **Google Drive** e hospedada de forma **100% gratuita** na **Cloudflare (Pages + D1)**.

---

## 🌟 Arquitetura Serverless (100% Gratuita)

- **Frontend:** PWA Dark Glassmorphism 3.5 com Leaflet, Form Builder visual e Simulador Mobile.
- **Backend:** Cloudflare Pages Functions / `_worker.js` (Processamento edge ultrarrápido).
- **Banco de Dados:** Cloudflare D1 (SQLite distribuído globalmente na borda da Cloudflare).
- **Google Drive:** Vinculado à pasta da sua conta pessoal:
  - **Pasta:** [GuiaData no Google Drive](https://drive.google.com/drive/u/1/folders/1IH2cWAAtNLuUfzeaVpDmv4pn6p3AQozQ)
  - **ID:** `1IH2cWAAtNLuUfzeaVpDmv4pn6p3AQozQ`
  - **Conta:** `sistemagithub@gmail.com`

---

## 🛠️ Passo a Passo para Publicar no Cloudflare Pages (Grátis)

### 1. Criar o Banco D1 no Cloudflare
1. Acesse o [Painel da Cloudflare](https://dash.cloudflare.com/)
2. Vá em **Storage & Databases** ➔ **D1 SQL Database**
3. Clique em **Create Database**, digite o nome **`guiadata-prod`** e clique em **Create**.
4. Na aba **Console**, cole o conteúdo de `schema.sql` e clique em **Execute** para criar todas as tabelas.

### 2. Conectar com o GitHub no Cloudflare Pages
1. No painel Cloudflare, vá em **Compute (Workers & Pages)** ➔ **Create application** ➔ **Pages** ➔ **Connect to Git**.
2. Selecione a sua conta GitHub (`sistemagithub`) e escolha o repositório **`guiadata`**.
3. Em **Build settings**:
   - **Framework preset:** `None`
   - **Build command:** *(deixe em branco)*
   - **Build output directory:** `public`
4. Clique em **Save and Deploy**.

### 3. Vincular o Banco D1 ao Pages
1. Na página do seu projeto no Cloudflare Pages, vá em **Settings** ➔ **Functions**.
2. Em **D1 database bindings**, clique em **Add binding**:
   - **Variable name:** `DB`
   - **D1 database:** Selecione **`guiadata-prod`**
3. Clique em **Save**.

### 4. Configurar as Variáveis de Ambiente
Em **Settings** ➔ **Environment variables**, adicione:
- `GOOGLE_DRIVE_FOLDER_ID` = `1IH2cWAAtNLuUfzeaVpDmv4pn6p3AQozQ`
- `GOOGLE_DRIVE_ACCOUNT` = `sistemagithub@gmail.com`

🎉 **Pronto!** O sistema estará online no seu subdomínio gratuito (ex: `https://guiadata.pages.dev`).

---

## 📱 Como Conectar o ODK Collect no Celular

1. Abra o app **ODK Collect** no celular do pesquisador.
2. Vá em **Configurações do Projeto** ➔ **Servidor**.
3. Em **URL**, digite o link do seu sistema:
   `https://guiadata.pages.dev`
4. O app baixará automaticamente todos os questionários publicados e enviará as coletas de volta para a nuvem!
