# Treino v2 – configuração

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

## 5. Publicar
Envie **todos os arquivos desta pasta** para o mesmo repositório da v1 (`app_personaltrainer`), substituindo os arquivos antigos: na aba Code, use **Add file → Upload files** e depois **Commit**.
Mantenha o mesmo repositório e o mesmo endereço. Assim, ao abrir pelo ícone já instalado, o app encontra os dados da v1 e oferece enviá-los para a sua conta.

## Atualizações futuras
Basta enviar os arquivos alterados para o GitHub. Cada celular baixa a versão nova sozinho na próxima vez que abrir o app com internet. A versão instalada aparece em **Ajustes**.

## Limites do plano gratuito (sobram para uso pessoal)
- Firestore: 1 GiB de dados, 50 mil leituras e 20 mil gravações por dia.
- Gemini: tem limite diário de uso. Se o limite for atingido, só a IA fica indisponível por um tempo. Seus dados e o restante do app não são afetados.
- No plano gratuito, o Google pode usar os textos enviados à IA para melhorar os produtos dele. Por isso, não envie dados de saúde nem dados pessoais nos prompts.
