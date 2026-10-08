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
// Restrinja a chave ao domínio henriquemalone.github.io no Google Cloud. Vazio = busca desativada.
export const YOUTUBE_API_KEY = "";
