// ================================================================
//  Hyper Fit – envia as sugestões do app para o seu e-mail
//  Cole este código em script.google.com (logado como hypertreinos@gmail.com)
//  e publique como "App da Web" (passo a passo no LEIA-ME, seção "Sugestões").
// ================================================================
const DESTINO = 'hypertreinos@gmail.com';
const MAX_POR_DIA = 50; // proteção contra abuso (o Gmail gratuito permite até 100 destinatários/dia)

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const texto = String(d.texto || '').slice(0, 2000).trim();
    if (texto.length < 5) return ContentService.createTextOutput('ignorado');

    // limite diário
    const props = PropertiesService.getScriptProperties();
    const chave = 'n_' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
    const n = Number(props.getProperty(chave) || 0);
    if (n >= MAX_POR_DIA) return ContentService.createTextOutput('limite');
    props.setProperty(chave, String(n + 1));

    const email = String(d.email || '').slice(0, 200);
    const tipo = String(d.tipo || 'Sugestão').slice(0, 20);
    const quando = new Date(Number(d.em) || Date.now()).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const corpo = [texto, '', '—',
      'Tipo: ' + tipo,
      'Usuário: ' + String(d.nome || '').slice(0, 100) + ' <' + email + '>',
      'Versão do app: ' + String(d.versao || '').slice(0, 20),
      'Aparelho: ' + String(d.aparelho || '').slice(0, 300),
      'Enviado em: ' + quando].join('\n');
    const opts = { name: 'Hyper Fit – Sugestões' };
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) opts.replyTo = email; // "Responder" vai direto para o usuário
    MailApp.sendEmail(DESTINO, '[Hyper Fit] ' + tipo + ': ' + texto.slice(0, 60), corpo, opts);
    return ContentService.createTextOutput('ok');
  } catch (err) {
    return ContentService.createTextOutput('erro');
  }
}
