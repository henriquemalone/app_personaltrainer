# Hyper Fit – configuração

O app usa o **Firebase no plano gratuito Spark**, que não pede cartão. Do Firebase ele usa:

- **Authentication:** login por e-mail e senha.
- **Firestore:** banco na nuvem, que também funciona offline.
- **AI Logic:** acesso ao Gemini.

A configuração é feita uma vez só e leva uns 15 minutos.

## 1. Criar o projeto
1. Acesse https://console.firebase.google.com, clique em **Criar projeto** e dê um nome (por exemplo, `treino`). O Google Analytics é opcional.
2. Na tela inicial do projeto, clique no ícone **Web `</>`**, dê um apelido e clique em **Registrar app**. Não precisa marcar o Hosting.
3. O Firebase mostra um bloco `firebaseConfig`. Copie os valores para o arquivo **`config.js`**.

## 2. Login
1. Vá em **Criação → Authentication → Vamos começar → Método de login → E-mail/senha → Ativar → Salvar**.
2. Em **Authentication → Configurações → Domínios autorizados**, adicione `henriquemalone.github.io`.

## 3. Banco de dados
1. Vá em **Criação → Firestore Database → Criar banco de dados**.
2. Escolha o local `southamerica-east1 (São Paulo)` e o **modo de produção**.
3. Na aba **Regras**, apague tudo, cole o conteúdo do arquivo **`firestore.rules`** e clique em **Publicar**. Essas regras garantem que cada usuário só vê os próprios dados.

## 4. IA (Gemini)
1. Vá em **IA → AI Logic → Vamos começar** e escolha **Gemini Developer API**, a opção sem faturamento.
2. **App Check (obrigatório a partir de 02/11/2026):**
   1. No Google Cloud Console, com o mesmo projeto selecionado, vá em **Segurança → reCAPTCHA → Criar chave**.
   2. Escolha o tipo **Site** e coloque o domínio `henriquemalone.github.io`. Copie o **ID da chave**.
   3. De volta ao Firebase, vá em **Segurança → App Check → Apps**, selecione o app web, escolha **reCAPTCHA Enterprise**, cole a chave e salve.
   4. Cole a mesma chave em `RECAPTCHA_SITE_KEY`, no `config.js`.
   5. Na aba **APIs**, deixe o **Firebase AI Logic** como **Aplicado**. Não precisa aplicar o App Check no Firestore nem no Authentication.

O reCAPTCHA não precisa de faturamento até 10 mil verificações por mês. Para uso pessoal, isso nunca chega perto do limite.

## 4b. Vídeos dos exercícios (YouTube) — opcional
1. Google Cloud (mesma conta do Firebase, projeto **AppPersonal**): https://console.cloud.google.com/apis/library/youtube.googleapis.com?project=apppersonal-df7d1 → **Ativar**.
2. **APIs e serviços → Credenciais → Criar credenciais → Chave de API**.
3. Clique na chave criada → **Restrições do aplicativo: Sites (referenciadores HTTP)** → adicione `henriquemalone.github.io/*`.
   **Restrições de API: Restringir chave** → marque só **YouTube Data API v3** → **Salvar**.
4. Cole a chave em `YOUTUBE_API_KEY` no `config.js`.
Sem a chave, o app funciona normalmente; o botão do vídeo vira "Buscar no YouTube" e você pode colar links manualmente.

## 4c. Regras do banco (atualizadas na v2.2)
Firestore → **Regras** → substitua pelo conteúdo atual do `firestore.rules` → **Publicar**.
(A v2.2 adicionou o catálogo compartilhado de exercícios: vídeos, dicas e músculos. Nenhum dado pessoal fica nele.)

## Dieta (v2.3)
Não precisa configurar nada novo: usa o mesmo Firebase e o mesmo Gemini. As regras do Firestore atuais já cobrem os dados da dieta.

## Vendas (v2.6): teste grátis, assinatura e vitalício
1. **config.js:** preencha `ADMIN_EMAIL` (o e-mail da SUA conta no app), `SUPORTE_WHATSAPP` (55 + DDD + número, só dígitos) e, se quiser, `SUPORTE_EMAIL`.
2. **firestore.rules:** troque `SEU_EMAIL_AQUI` pelo mesmo e-mail do `ADMIN_EMAIL` → Firestore → Regras → cole → **Publicar**.
3. **Liberar alguém:** no app, Ajustes → **⚙ Admin: liberar acessos** → e-mail da pessoa → Assinante (1/3/12 meses) ou **Vitalício** → Salvar. A pessoa é liberada na hora.
   Renovação: escolha "1 mês" de novo; o prazo soma a partir do vencimento atual.
4. Fluxo do cliente: cria conta (aceita os termos) → 7 dias grátis → paga pelo link do Mercado Pago → avisa no WhatsApp → você libera no Admin.
5. Todo dia 1x: confira os pagamentos no Mercado Pago e libere/renove quem pagou. Assinatura cancelada = não renove; o acesso vence sozinho na data.

## Domínio próprio (hypertreino.com.br)
1. **Registrar:** registro.br → busque `hypertreino.com.br` → registre com seu CPF (≈ R$ 40/ano).
2. **DNS no Registro.br:** no domínio → **DNS → Editar zona** (modo avançado) → adicione:
   - 4 registros **A** com nome vazio (@): `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - 1 registro **CNAME** com nome `www` apontando para `henriquemalone.github.io`
3. **GitHub:** repositório → Settings → Pages → **Custom domain** → `hypertreino.com.br` → Save. Quando o certificado sair (minutos a algumas horas), marque **Enforce HTTPS**.
4. **Autorizar o domínio novo** (sem isso login, IA e vídeos falham no domínio novo):
   - Firebase → Authentication → Configurações → **Domínios autorizados** → adicione `hypertreino.com.br` e `www.hypertreino.com.br`
   - Google Cloud → Segurança → reCAPTCHA → chave do app → **Domínios** → adicione `hypertreino.com.br`
   - Google Cloud → APIs e serviços → Credenciais → chave do YouTube → **Sites** → adicione `hypertreino.com.br/*` e `www.hypertreino.com.br/*`
5. O endereço antigo (github.io) passa a redirecionar para o novo. Quem já instalou o app precisa **instalar de novo** pelo endereço novo e entrar na conta (os dados estão na nuvem, nada se perde).

## 5. Publicar
Envie **todos os arquivos desta pasta** para o mesmo repositório da v1 (`app_personaltrainer`), substituindo os arquivos antigos: na aba Code, use **Add file → Upload files** e depois **Commit**.
Mantenha o mesmo repositório e o mesmo endereço. Assim, ao abrir pelo ícone já instalado, o app encontra os dados da v1 e oferece enviá-los para a sua conta.

## Atualizações futuras
Basta enviar os arquivos alterados para o GitHub. Cada celular baixa a versão nova sozinho na próxima vez que abrir o app com internet. A versão instalada aparece em **Ajustes**.

## Limites do plano gratuito (sobram para uso pessoal)
- Firestore: 1 GiB de dados, 50 mil leituras e 20 mil gravações por dia.
- Gemini: desde a v2.9 o app usa a IA paga (ver "IA paga" abaixo). Com `IA_PROVEDOR = "dev"` no `config.js`, volta para a gratuita (20 pedidos/dia para o app inteiro, e o Google pode usar os textos).

## Origem dos cadastros (v2.8)
Links com `?utm_source=...` (os dos anúncios) abrem o app direto em **Criar conta** e gravam de onde a pessoa veio (ex.: `meta · v2`). No Admin aparece a tabela **Cadastros por origem**, com quantos pagaram. Link sem UTM para divulgar à mão: `https://hypertreino.com.br/?cadastro`.

## IA paga — Agent Platform (v2.9)
1. Firebase no **plano Blaze** (cartão cadastrado, cobrança conforme o uso).
2. Firebase → **AI Logic** → **Agent Platform Gemini API: Ativada**.
3. **Teto de gasto:** https://console.cloud.google.com/billing/budgets → **Create new** → *Aplicação de limite de gastos* (Spend cap enforcement) → projeto `apppersonal-df7d1` + serviço **Agent Platform / Vertex AI** → R$ 30/mês. Ao atingir, a IA pausa (o resto do app continua) e volta sozinha no dia 1º do mês seguinte.
4. **Limite por usuário (contra abuso):** https://console.cloud.google.com/apis/api/firebasevertexai.googleapis.com/quotas?project=apppersonal-df7d1 → filtre por **generate content requests** (por usuário, por minuto) → marque a cota → **Editar cota** → `10` → **Enviar solicitação**.
5. `config.js`: `IA_PROVEDOR = "agent"` e `MODELO_IA = "gemini-3.6-flash"`. Quando o Google anunciar o fim do 3.6, troque só o nome do modelo.
Custo esperado: centavos por usuário (importar treino ≈ R$ 0,10; dieta ≈ R$ 0,10; estimar refeição ≈ R$ 0,015). Acompanhe em Faturamento → Relatórios.

## Sugestões de melhoria (v2.10)
As sugestões enviadas pelo app (Ajustes → Ajuda → 💡 Sugerir melhoria) ficam salvas no Firestore e aparecem na tela **Admin**. Para recebê-las também **por e-mail**:
1. **Regras:** Firestore → Regras → cole o `firestore.rules` atualizado → **Publicar** (sem isso, as sugestões não são gravadas).
2. Entre em https://script.google.com **logado como hypertreinos@gmail.com** → **Novo projeto**.
3. Apague o conteúdo do editor, cole todo o arquivo `sugestoes-apps-script.gs` e salve (ícone de disquete).
4. **Implantar → Nova implantação** → no ícone de engrenagem, escolha **App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   → **Implantar** → **Autorizar acesso** → escolha a conta. Se aparecer "O Google não verificou este app", clique em **Avançado → Acessar (não seguro)**: o app é o seu próprio script.
5. Copie o **URL do app da Web** (termina em `/exec`) e cole em `SUGESTOES_URL` no `config.js` → publique o `config.js`.
O e-mail chega com o texto, o tipo, a versão e o aparelho; **Responder** vai direto para o usuário. Limite: 50 e-mails por dia (configurável no script).

## Treinos e página de vendas (v2.11)
- **Aba Treinos** (substitui Fichas + Treinar): cada treino tem nome e agrupa as fichas A, B, C… Fichas antigas entram automaticamente no treino "Meu treino". Os treinos ficam em `users/{uid}/programas` (as regras atuais já cobrem, não precisa republicar).
- **Página de vendas:** quem abre `hypertreino.com.br` sem estar logado vê a página de vendas; o botão "Testar 7 dias grátis" leva ao "Criar conta". Não aparece no app instalado nem depois de sair da conta.
  - Link direto para o login (sem a página): `https://hypertreino.com.br/?login`
  - Link direto para o cadastro: `https://hypertreino.com.br/?cadastro`
  - Os links com UTM dos anúncios abrem a página de vendas e continuam gravando a origem.
- Imagens da página: pasta `img/` (prints do app com dados de demonstração). Para trocar, substitua os arquivos mantendo os nomes.

## Assinatura automática: teste grátis com cartão (v2.12)
Fluxo: a pessoa cria a conta, cadastra o cartão (formulário do próprio Mercado Pago) e usa 7 dias grátis; no 8º dia o Mercado Pago cobra R$ 9,90 e depois todo mês. O app libera/bloqueia sozinho. Enquanto `MP_PUBLIC_KEY` e `ASSINATURA_API` estiverem vazios no `config.js`, o app continua no modelo antigo.

### Parte 1 – Mercado Pago (credenciais)
1. Entre em https://www.mercadopago.com.br/developers/panel/app com a sua conta de vendedor → **Criar aplicação** → dê o nome "Hyper Fit" e escolha o produto de pagamentos online/assinaturas.
2. Na aplicação, abra **Credenciais de teste** e anote a **Public Key** e o **Access Token** de teste. (Depois, para valer de verdade, você usa as **Credenciais de produção**.)
3. Em **Contas de teste**, crie uma conta **compradora** de teste e anote o e-mail dela (usado só nos testes).

### Parte 2 – Função no Google Cloud (sem instalar nada)
1. Abra https://console.cloud.google.com/run?project=apppersonal-df7d1 → **Escrever uma função** (Write a function).
2. Nome do serviço: `hyperfit-api` · Região: `southamerica-east1` · Ambiente de execução: **Node.js 22** · Autenticação: **Permitir acesso público** (Allow public access) → **Criar**.
3. Na aba **Origem/Source**: cole o conteúdo de `assinatura-funcao/index.js` no `index.js` e o de `assinatura-funcao/package.json` no `package.json`. No campo **Ponto de entrada da função** (Function entry point), escreva `api`.
4. Clique em **Salvar e reimplantar** (Save and redeploy). Copie o **URL** que aparece no topo (ex.: `https://hyperfit-api-xxxx.southamerica-east1.run.app`).
5. Variáveis: no serviço, **Editar e implantar nova revisão** → aba **Variáveis e secrets** → adicione:
   - `MP_ACCESS_TOKEN` = Access Token (de teste agora; de produção depois)
   - `MP_WEBHOOK_SECRET` = assinatura secreta do webhook (Parte 3, passo 2)
   - `EMAIL_URL` = o mesmo endereço do `SUGESTOES_URL` (para receber e-mail a cada assinatura/cancelamento/pagamento)
   - `TEST_PAYER_EMAIL` = e-mail da conta compradora de teste (**só durante o teste; apague em produção**)
   - opcionais: `PRECO` (padrão 9.9) e `DIAS_TESTE` (padrão 7)
   → **Implantar**.

### Parte 3 – Avisos do Mercado Pago (webhook)
1. Na aplicação do Mercado Pago → **Webhooks → Configurar notificações** → em **URL modo teste** cole `URL_DA_FUNÇÃO/webhook` (ex.: `https://hyperfit-api-xxxx.southamerica-east1.run.app/webhook`). Marque o evento **Planos e assinaturas** → **Salvar**.
2. Copie a **assinatura secreta** gerada e coloque em `MP_WEBHOOK_SECRET` (Parte 2, passo 5).
3. Mesmo se algum aviso se perder, o app confere a assinatura direto no Mercado Pago quando a data de cobrança passa.

### Parte 4 – Ligar no app e testar
1. `config.js`: `MP_PUBLIC_KEY` = Public Key (de teste), `ASSINATURA_API` = URL da função (sem `/webhook`). Publique.
2. Crie uma conta nova no app → tela "Ative seu teste grátis" → use um **cartão de teste** do Mercado Pago (lista em developers → Cartões de teste; nome do titular `APRO` aprova).
3. Confira: o app libera; em Ajustes → Assinatura aparece "Teste grátis até …" com a 1ª cobrança 7 dias depois; o Admin mostra "Teste"; chega e-mail "Nova assinatura". Teste também **Cancelar assinatura**.
4. Me mande prints se algo não bater (principalmente a data da 1ª cobrança).

### Parte 5 – Produção
Troque `MP_PUBLIC_KEY` (config.js) e `MP_ACCESS_TOKEN` (função) pelas credenciais de **produção**, apague `TEST_PAYER_EMAIL`, configure a **URL modo produção** do webhook (mesmo endereço) e atualize `MP_WEBHOOK_SECRET` se mudar. Pronto.
- Contas criadas antes de `CARTAO_DESDE` (config.js) mantêm o teste antigo sem cartão.
- Vitalício continua sendo liberado à mão no Admin.
- A função roda na cota gratuita do Cloud Run no seu volume; o Google pode cobrar centavos de armazenamento da imagem da função.
