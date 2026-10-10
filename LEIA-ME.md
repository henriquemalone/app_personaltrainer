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
- Gemini: tem limite diário de uso. Se o limite for atingido, só a IA fica indisponível por um tempo. Seus dados e o restante do app não são afetados.
- No plano gratuito, o Google pode usar os textos enviados à IA para melhorar os produtos dele. Por isso, não envie dados de saúde nem dados pessoais nos prompts.
