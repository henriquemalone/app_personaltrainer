// ============================================================
//  CONFIGURAÇÃO — projeto Firebase "AppPersonal"
//  Estes valores NÃO são secretos: a proteção dos dados é feita
//  pelas regras do Firestore (firestore.rules).
// ============================================================
export const firebaseConfig = {
  apiKey: "AIzaSyCKtljp9T9SC-LNqi9FjznAdtA_Ee-28ks",
  authDomain: "apppersonal-df7d1.firebaseapp.com",
  projectId: "apppersonal-df7d1",
  storageBucket: "apppersonal-df7d1.firebasestorage.app",
  messagingSenderId: "988780755151",
  appId: "1:988780755151:web:ce258cd9ba2c980fd49fba",
  measurementId: "G-CRGX103ZTR"
};

// Chave do reCAPTCHA (App Check) — obrigatória para a IA a partir de 02/11/2026.
export const RECAPTCHA_SITE_KEY = "6LcBV-UtAAAAAGw-f2_BGfIep3bAUOiHbsBEYFP5";

// Modelo do Gemini usado no cadastro por prompt e nas substituições.
export const MODELO_IA = "gemini-3.5-flash";

// Chave da YouTube Data API v3 (busca automática de vídeos de execução).
// Restrinja a chave aos domínios hypertreino.com.br, www.hypertreino.com.br e henriquemalone.github.io no Google Cloud. Vazio = busca desativada.
export const YOUTUBE_API_KEY = "AIzaSyDj7Ne2fUHHfr6Xiqi87sNlgUDkkuOJQ5U";

// ================= Comercial (teste de vendas) =================
// E-mail da SUA conta no app: libera a tela "Admin" para dar acesso a assinantes e vitalícios.
// Precisa ser o mesmo e-mail colocado no firestore.rules (função isAdmin).
export const ADMIN_EMAIL = "henrique.malone@gmail.com";
export const LINK_ASSINATURA = "https://mpago.la/16FuQqg";
export const PRECO_TXT = "R$ 9,90/mês";
export const DIAS_TESTE = 7;
// WhatsApp de suporte com DDI+DDD, só números (ex.: 5511999998888). Vazio = esconde o botão.
export const SUPORTE_WHATSAPP = "5519982278392";
export const SUPORTE_EMAIL = "hypertreinos@gmail.com";
