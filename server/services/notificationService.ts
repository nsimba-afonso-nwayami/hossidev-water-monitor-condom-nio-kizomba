/**
 * Hossidev Water Monitor - Notification Service (Email & User SMTP Engine)
 * Handles automatic email dispatching for low-water alerts (<= 30%),
 * per-user custom SMTP configuration with AES-256 encryption at rest,
 * fallback to global default SMTP (etakizomba@gmail.com),
 * and professional Portuguese notification templates.
 * (SMS functionality has been completely removed).
 */

import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';
import {
  UserEmailConfiguration,
  CorporateEmailConfig,
  GmailEmailConfig,
  SystemEmailSettings,
  EmailProviderType,
  SmtpTestStage,
  SmtpErrorCategory,
} from '../../src/types';
import { decryptPassword } from './cryptoService';
import { loadDb } from '../db';

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  alertId: string;
  recipientId: string;
  tankName: string;
  senderUserId?: string;
  userConfig?: UserEmailConfiguration | null;
  preferredProvider?: EmailProviderType;
}

export interface SendEmailResult {
  providerMessageId: string;
  status: 'pending' | 'queued' | 'sent' | 'delivered' | 'failed' | 'not_sent_offline';
  provider: string;
  senderEmail: string;
  error?: string;
}

// Mask email for security/privacy in logs and UI
export function maskEmailServer(email: string | null | undefined): string {
  if (!email || !email.includes('@')) return '***@***.com';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

// ==========================================
// ERROR DIAGNOSIS (RFC & SMTP SPECIFIC)
// ==========================================

export function diagnoseSmtpError(err: any): { errorCategory: SmtpErrorCategory; friendlyMessage: string } {
  const code = String(err?.code || '').toUpperCase();
  const responseCode = Number(err?.responseCode);
  const msg = String(err?.message || '').toLowerCase();
  const response = String(err?.response || '').toLowerCase();

  // 1. TLS Certificate validation errors
  if (
    code.includes('CERT') ||
    code.includes('DEPTH_ZERO_SELF_SIGNED_CERT') ||
    code.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE') ||
    code.includes('ERR_TLS_CERT_ALTNAME_INVALID') ||
    msg.includes('certificate') ||
    msg.includes('self signed')
  ) {
    return {
      errorCategory: 'CERTIFICADO_TLS',
      friendlyMessage:
        'Erro no certificado TLS do servidor SMTP. A validação de segurança estrita recusou a conexão porque o certificado é inválido ou não assinado por autoridade certificadora confiável.',
    };
  }

  // 2. Authentication errors
  if (
    code === 'EAUTH' ||
    responseCode === 535 ||
    msg.includes('invalid credentials') ||
    msg.includes('authentication failed') ||
    response.includes('535') ||
    response.includes('auth') ||
    response.includes('bad username / password')
  ) {
    return {
      errorCategory: 'AUTENTICACAO',
      friendlyMessage:
        'Falha de autenticação SMTP. O utilizador ou a palavra-passe foram rejeitados pelo servidor.',
    };
  }

  // 3. Connection and Timeout errors
  if (
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EHOSTUNREACH' ||
    code === 'ESOCKET' ||
    msg.includes('timeout') ||
    msg.includes('connection refused') ||
    msg.includes('getaddrinfo')
  ) {
    return {
      errorCategory: 'LIGACAO_TIMEOUT',
      friendlyMessage:
        'Falha de ligação / timeout ao contactar o servidor SMTP. Verifique o host e se a porta está liberada na rede.',
    };
  }

  // 4. Unauthorized sender errors
  if (
    responseCode === 550 ||
    responseCode === 553 ||
    responseCode === 501 ||
    msg.includes('sender rejected') ||
    msg.includes('not permitted to relay') ||
    response.includes('sender address rejected') ||
    response.includes('not authorized')
  ) {
    return {
      errorCategory: 'REMETENTE_NAO_AUTORIZADO',
      friendlyMessage:
        'Remetente não autorizado. O servidor rejeitou o envio a partir do endereço de e-mail especificado.',
    };
  }

  // 5. Invalid recipient
  if (
    responseCode === 551 ||
    responseCode === 552 ||
    responseCode === 554 ||
    msg.includes('recipient rejected') ||
    response.includes('recipient address rejected') ||
    msg.includes('invalid recipient')
  ) {
    return {
      errorCategory: 'DESTINATARIO_INVALIDO',
      friendlyMessage:
        'Destinatário rejeitado ou inválido segundo o servidor SMTP.',
    };
  }

  return {
    errorCategory: 'ERRO_SMTP_GERAL',
    friendlyMessage: `Erro reportado pelo servidor SMTP: ${err?.message || 'Falha de comunicação'}`,
  };
}

// ==========================================
// MESSAGE TEMPLATES (PROFESSIONAL PORTUGUESE)
// ==========================================

export function formatLowLevelEmail(params: {
  tankName: string;
  tankId: string;
  level: number;
  threshold?: number;
  tankState?: string;
  pumpState: string;
  boardName: string;
  lastReadingTime: string;
  alertTime: string;
  isTest?: boolean;
  senderEmail?: string;
  senderDisplayName?: string;
}): { subject: string; text: string; html: string } {
  const senderEmail = params.senderEmail || process.env.MAIL_FROM_ADDRESS || 'water.report@hossidev.com';
  const senderName = params.senderDisplayName || process.env.MAIL_FROM_NAME || 'water.report.@hossidev.com';

  if (params.isTest) {
    const subject = '[TESTE] Hossidev Water Monitor — teste de notificação';
    const text = `Hossidev Water Monitor

Teste de notificação por e-mail enviado com sucesso.

Remetente oficial: ${senderName} <${senderEmail}>
Destinatário: Configuração de teste
Data e Hora: ${params.alertTime}

Esta é uma mensagem automática de validação do sistema Hossidev Water Monitor via SMTP seguro.`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; margin: 0;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <tr>
            <td style="padding: 24px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);">
              <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">Hossidev Water Monitor</h1>
              <p style="color: #e0f2fe; margin: 4px 0 0 0; font-size: 13px;">Teste de Notificação Operacional SMTP</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 24px;">
              <p style="color: #38bdf8; font-weight: 600; font-size: 14px; margin-top: 0;">
                ✓ A ligação SMTP foi estabelecida e a mensagem de validação foi aceite pelo servidor.
              </p>
              <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 13px; color: #cbd5e1;">
                <tr>
                  <td width="35%" style="color: #94a3b8; font-weight: 600;">Remetente Oficial:</td>
                  <td style="color: #ffffff; font-weight: 700;">${senderName} &lt;${senderEmail}&gt;</td>
                </tr>
                <tr>
                  <td width="35%" style="color: #94a3b8; font-weight: 600;">Data e Hora do Teste:</td>
                  <td style="color: #f1f5f9;">${params.alertTime}</td>
                </tr>
                <tr>
                  <td width="35%" style="color: #94a3b8; font-weight: 600;">Protocolo:</td>
                  <td style="color: #f1f5f9;">SMTP Seguro com TLS verificado</td>
                </tr>
              </table>
              <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #334155; font-size: 12px; color: #94a3b8;">
                Esta é uma mensagem automática de validação operacional do Hossidev SCADA.
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 24px; background-color: #0f172a; text-align: center; font-size: 11px; color: #64748b;">
              Condomínio Residencial Kizomba • Hossidev SCADA System
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
 </body>
</html>`;

    return { subject, text, html };
  }

  const subject = `[ALERTA] Nível baixo de água — ${params.tankName} (${params.level}%)`;
  const estadoDoTanque = params.tankState || (params.level <= 10 ? 'Nível crítico' : 'Nível baixo — ação necessária');
  const limiteAlerta = params.threshold !== undefined ? params.threshold : 30;

  const text = `Hossidev Water Monitor

Foi detetado nível baixo de água no reservatório.

Tanque: ${params.tankName}
Identificação: ${params.tankId}
Nível atual: ${params.level}%
Limite de alerta: ${limiteAlerta}%
Estado: ${estadoDoTanque}
Bomba: ${params.pumpState}
Placa de origem: ${params.boardName}
Última leitura: ${params.lastReadingTime}
Alerta gerado em: ${params.alertTime}

Por favor, verifique o reservatório e as condições do sistema.

Esta é uma mensagem automática do Hossidev Water Monitor.`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; margin: 0;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 24px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);">
              <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">
                Hossidev Water Monitor
              </h1>
              <p style="color: #e0f2fe; margin: 4px 0 0 0; font-size: 13px;">
                Alerta Operacional de Nível Baixo de Água
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 28px 24px;">
              <div style="background-color: #ef44441a; border: 1px solid #ef44444d; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                <p style="color: #fca5a5; margin: 0; font-size: 14px; font-weight: 600;">
                  ⚠️ Foi detetado nível baixo de água no reservatório.
                </p>
              </div>

              <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 13px; color: #cbd5e1;">
                <tr>
                  <td width="35%" style="color: #94a3b8; font-weight: 600;">Tanque:</td>
                  <td style="color: #ffffff; font-weight: 700;">${params.tankName}</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; font-weight: 600;">Identificação:</td>
                  <td style="color: #ffffff; font-weight: 700;">${params.tankId}</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; font-weight: 600;">Nível atual:</td>
                  <td style="color: #38bdf8; font-size: 16px; font-weight: 800;">${params.level}%</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; font-weight: 600;">Limite de alerta:</td>
                  <td style="color: #f1f5f9;">${limiteAlerta}%</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; font-weight: 600;">Estado:</td>
                  <td style="color: #f87171; font-weight: 700;">${estadoDoTanque}</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; font-weight: 600;">Bomba:</td>
                  <td style="color: #f1f5f9;">${params.pumpState}</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; font-weight: 600;">Placa de origem:</td>
                  <td style="color: #f1f5f9;">${params.boardName}</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; font-weight: 600;">Última leitura:</td>
                  <td style="color: #f1f5f9;">${params.lastReadingTime}</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; font-weight: 600;">Alerta gerado em:</td>
                  <td style="color: #f1f5f9;">${params.alertTime}</td>
                </tr>
              </table>

              <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #334155; font-size: 12px; color: #94a3b8;">
                Por favor, verifique o reservatório e as condições do sistema.<br />
                Esta é uma mensagem automática do Hossidev Water Monitor.
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 24px; background-color: #0f172a; text-align: center; font-size: 11px; color: #64748b;">
              Condomínio Residencial Kizomba • Hossidev SCADA System • Remetente: ${senderName} &lt;${senderEmail}&gt;
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

// ==========================================
// TRANSPORTER FACTORIES (STRICT TLS VALIDATION)
// ==========================================

export function createCorporateTransporter(config: CorporateEmailConfig): Transporter | null {
  const plainPassword =
    (config.encryptedSmtpPassword ? decryptPassword(config.encryptedSmtpPassword) : null) ||
    process.env.SMTP_PASSWORD;

  if (!plainPassword || plainPassword.startsWith('[CONFIGURAR')) {
    return null;
  }

  const host = config.smtpHost || process.env.SMTP_HOST || 'mail.hossidev.com';
  const port = Number(config.smtpPort || process.env.SMTP_PORT || 465);
  const user = config.smtpUser || process.env.SMTP_USER || 'water.report@hossidev.com';
  const isSecure = config.secure ?? (port === 465);

  return nodemailer.createTransport({
    host,
    port,
    secure: isSecure, // Port 465 uses implicit TLS from start of connection
    auth: {
      user,
      pass: plainPassword,
    },
    // Strict TLS certificate validation: Never disable validation
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 10000,
    greetingTimeout: 8000,
  });
}

export function createGmailTransporter(config?: GmailEmailConfig): Transporter | null {
  const plainPassword =
    (config?.encryptedSmtpPassword ? decryptPassword(config.encryptedSmtpPassword) : null) ||
    process.env.GMAIL_SMTP_PASSWORD ||
    (config?.smtpUser?.includes('gmail') ? process.env.SMTP_PASSWORD : null);

  if (!plainPassword || plainPassword.startsWith('[CONFIGURAR')) {
    return null;
  }

  const host = config?.smtpHost || process.env.GMAIL_SMTP_HOST || 'smtp.gmail.com';
  const port = Number(config?.smtpPort || process.env.GMAIL_SMTP_PORT || 587);
  const user = config?.smtpUser || process.env.GMAIL_SMTP_USER || 'etakizomba@gmail.com';
  const isSecure = config?.secure ?? (port === 465);

  return nodemailer.createTransport({
    host,
    port,
    secure: isSecure,
    requireTLS: !isSecure,
    auth: {
      user,
      pass: plainPassword,
    },
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 10000,
    greetingTimeout: 8000,
  });
}

function createTransporterFromUserConfig(config: UserEmailConfiguration) {
  console.log('[DEBUG] createTransporterFromUserConfig - Config:', {
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpUser: config.smtpUser,
    hasEncryptedPassword: !!config.encryptedSmtpPassword,
  });

  const plainPassword = decryptPassword(config.encryptedSmtpPassword);
  console.log('[DEBUG] createTransporterFromUserConfig - Decrypted password:', plainPassword ? 'success' : 'failed');

  if (!plainPassword) {
    return null;
  }

  const isSecure = config.secure || config.smtpPort === 465;

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: isSecure,
    requireTLS: config.requireTls,
    auth: {
      user: config.smtpUser,
      pass: plainPassword,
    },
    tls: {
      rejectUnauthorized: true,
    },
    connectionTimeout: 10000,
  });
}

// ==========================================
// SYSTEM EMAIL TEST (REAL SMTP TEST & DIAGNOSTICS)
// ==========================================

export async function testSystemEmailConnection(params: {
  provider: EmailProviderType;
  customConfig?: any;
  recipientEmail: string;
  userName: string;
}): Promise<{
  success: boolean;
  stage: SmtpTestStage;
  message: string;
  errorCategory?: SmtpErrorCategory;
  errorDetails?: string;
  messageId?: string;
  sender: string;
  provider: EmailProviderType;
}> {
  const { provider, customConfig, recipientEmail, userName } = params;
  const db = loadDb();
  const systemSettings = db.systemEmailSettings;

  let transporter: Transporter | null = null;
  let fromOption: { name: string; address: string };
  let providerLabel = '';

  if (provider === 'corporate_hossidev') {
    const corporateConfig: CorporateEmailConfig = {
      ...(systemSettings?.corporate || {
        fromName: 'water.report.@hossidev.com',
        fromAddress: 'water.report@hossidev.com',
        smtpHost: 'mail.hossidev.com',
        smtpPort: 465,
        security: 'SSL',
        secure: true,
        smtpUser: 'water.report@hossidev.com',
        encryptedSmtpPassword: null,
        lastTestAt: null,
        lastTestStatus: null,
        lastTestError: null,
        updatedAt: new Date().toISOString(),
      }),
      ...(customConfig || {}),
    };

    if (customConfig?.plainPassword) {
      corporateConfig.encryptedSmtpPassword = decryptPassword(customConfig.plainPassword) || customConfig.plainPassword;
    } else if (customConfig?.smtpPassword) {
      corporateConfig.encryptedSmtpPassword = decryptPassword(customConfig.smtpPassword) || customConfig.smtpPassword;
    }

    // Keep display name and address separate: do not alter the email address
    fromOption = {
      name: corporateConfig.fromName || 'water.report.@hossidev.com',
      address: corporateConfig.fromAddress || 'water.report@hossidev.com',
    };
    providerLabel = 'E-mail Corporativo Hossidev (mail.hossidev.com:465)';
    transporter = createCorporateTransporter(corporateConfig);
  } else {
    const gmailConfig: GmailEmailConfig = {
      ...(systemSettings?.gmail || {
        fromName: 'Hossidev Water Monitor',
        fromAddress: 'etakizomba@gmail.com',
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        security: 'STARTTLS',
        secure: false,
        smtpUser: 'etakizomba@gmail.com',
        encryptedSmtpPassword: null,
        lastTestAt: null,
        lastTestStatus: null,
        lastTestError: null,
        updatedAt: new Date().toISOString(),
      }),
      ...(customConfig || {}),
    };

    if (customConfig?.plainPassword) {
      gmailConfig.encryptedSmtpPassword = decryptPassword(customConfig.plainPassword) || customConfig.plainPassword;
    } else if (customConfig?.smtpPassword) {
      gmailConfig.encryptedSmtpPassword = decryptPassword(customConfig.smtpPassword) || customConfig.smtpPassword;
    }

    fromOption = {
      name: gmailConfig.fromName || 'Hossidev Water Monitor',
      address: gmailConfig.fromAddress || 'etakizomba@gmail.com',
    };
    providerLabel = 'Gmail (smtp.gmail.com:587)';
    transporter = createGmailTransporter(gmailConfig);
  }

  if (!transporter) {
    return {
      success: false,
      stage: 'failed',
      provider,
      sender: fromOption.address,
      errorCategory: 'AUTENTICACAO',
      message: `Credenciais de envio para [${providerLabel}] não estão configuradas no servidor. Por favor, defina a palavra-passe no painel ou nas variáveis de ambiente.`,
      errorDetails: 'Palavra-passe ausente ou não pôde ser decifrada.',
    };
  }

  try {
    // 1. STAGE: auth_validated (Verifies connection and SMTP handshake with TLS)
    await transporter.verify();

    // 2. STAGE: accepted_by_smtp (Transpatches test email message)
    const nowStr = new Date().toLocaleString('pt-BR');
    const content = formatLowLevelEmail({
      tankName: 'Reservatório Principal (Teste Operacional)',
      tankId: 'TEST-CORP-01',
      level: 28,
      threshold: 30,
      pumpState: 'Operacional',
      boardName: 'SERVIDOR',
      lastReadingTime: nowStr,
      alertTime: nowStr,
      isTest: true,
      senderEmail: fromOption.address,
      senderDisplayName: fromOption.name,
    });

    const info = await transporter.sendMail({
      from: fromOption,
      to: recipientEmail,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });

    // NOTE: Strictly following requirement: Do NOT state "Entregue" unless confirmed by the destination provider.
    // Return "accepted_by_smtp" confirming SMTP acceptance with the message ID.
    return {
      success: true,
      stage: 'accepted_by_smtp',
      provider,
      sender: fromOption.address,
      messageId: info.messageId,
      message: `Autenticação validada e mensagem aceite pelo servidor SMTP (${providerLabel}). ID: ${info.messageId || 'OK'}.`,
    };
  } catch (err: any) {
    console.error(`[NotificationService:Test] Erro no teste SMTP via ${provider}:`, err);
    const diagnosis = diagnoseSmtpError(err);
    return {
      success: false,
      stage: 'failed',
      provider,
      sender: fromOption.address,
      errorCategory: diagnosis.errorCategory,
      message: diagnosis.friendlyMessage,
      errorDetails: err?.message || String(err),
    };
  }
}

// ==========================================
// TEST USER SMTP CONFIGURATION (LEGACY/PER-USER)
// ==========================================

export async function testUserSmtpConnection(params: {
  userConfig: UserEmailConfiguration;
  recipientEmail: string;
  userName: string;
}): Promise<{ success: boolean; message: string; error?: string }> {
  const { userConfig, recipientEmail, userName } = params;

  console.log('[DEBUG] testUserSmtpConnection - Called with:', {
    smtpHost: userConfig.smtpHost,
    smtpPort: userConfig.smtpPort,
    smtpUser: userConfig.smtpUser,
    hasPassword: !!userConfig.encryptedSmtpPassword,
  });

  if (!userConfig.smtpHost || !userConfig.smtpUser) {
    return {
      success: false,
      message: 'Não foi possível conectar ao servidor SMTP. Verifique o host, a porta, a segurança e as credenciais.',
      error: 'Host e Utilizador SMTP são obrigatórios.',
    };
  }

  const transporter = createTransporterFromUserConfig(userConfig);
  if (!transporter) {
    console.log('[DEBUG] testUserSmtpConnection - Transporter creation failed');
    return {
      success: false,
      message: 'Não foi possível conectar ao servidor SMTP. Verifique o host, a porta, a segurança e as credenciais.',
      error: 'Senha SMTP não configurada ou não pôde ser decifrada.',
    };
  }

  console.log('[DEBUG] testUserSmtpConnection - Transporter created, starting verify()');

  try {
    await transporter.verify();
    console.log('[DEBUG] testUserSmtpConnection - Verify() succeeded');

    const nowStr = new Date().toLocaleString('pt-BR');
    const mailFrom = userConfig.mailFrom || userConfig.smtpUser;
    const fromHeader = mailFrom.includes('<') ? mailFrom : `Hossidev Water Monitor <${mailFrom}>`;

    const subject = '[TESTE] Hossidev Water Monitor';
    const text = `Esta é uma mensagem de teste da configuração SMTP do Hossidev Water Monitor.

Usuário: ${userName}
Data: ${nowStr}`;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; margin: 0;">
  <div style="background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; padding: 24px; color: #f8fafc;">
    <h2 style="color: #38bdf8;">✓ Teste SMTP Concluído com Sucesso</h2>
    <p>Mensagem de validação aceite pelo servidor para entrega.</p>
    <p style="font-size: 12px; color: #94a3b8;">Usuário: ${userName} • Remetente: ${mailFrom}</p>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: fromHeader,
      to: recipientEmail,
      subject,
      text,
      html,
    });

    console.log('[DEBUG] testUserSmtpConnection - sendMail() succeeded');

    return {
      success: true,
      message: 'A configuração de e-mail foi testada com sucesso. Mensagem aceite pelo servidor SMTP!',
    };
  } catch (err: any) {
    console.log('[DEBUG] testUserSmtpConnection - Error:', err);
    const diag = diagnoseSmtpError(err);
    return {
      success: false,
      message: diag.friendlyMessage,
      error: err.message,
    };
  }
}

// ==========================================
// PRIMARY EMAIL DISPATCH ENGINE
// ==========================================

export async function sendEmailNotification(input: SendEmailInput): Promise<SendEmailResult> {
  const db = loadDb();
  const sysEmail = db.systemEmailSettings;

  let transporter: Transporter | null = null;
  let providerName = 'corporate_hossidev';
  let fromOption: SendMailOptions['from'] = {
    name: 'water.report.@hossidev.com',
    address: 'water.report@hossidev.com',
  };
  let senderEmail = 'water.report@hossidev.com';

  // 1. If explicit user-level SMTP config is provided and enabled
  if (input.userConfig && input.userConfig.enabled) {
    const userTransporter = createTransporterFromUserConfig(input.userConfig);
    if (userTransporter) {
      transporter = userTransporter;
      senderEmail = input.userConfig.mailFrom || input.userConfig.smtpUser;
      fromOption = senderEmail.includes('<') ? senderEmail : `Hossidev Water Monitor <${senderEmail}>`;
      providerName = `smtp_user_${input.userConfig.userId}`;
    }
  }

  // 2. System Selected Provider: "corporate_hossidev" or "gmail"
  if (!transporter) {
    const selectedProvider: EmailProviderType =
      input.preferredProvider || sysEmail?.selectedProvider || 'corporate_hossidev';

    if (selectedProvider === 'corporate_hossidev') {
      const corp = sysEmail?.corporate || {
        fromName: process.env.MAIL_FROM_NAME || 'water.report.@hossidev.com',
        fromAddress: process.env.MAIL_FROM_ADDRESS || 'water.report@hossidev.com',
        smtpHost: process.env.SMTP_HOST || 'mail.hossidev.com',
        smtpPort: Number(process.env.SMTP_PORT || 465),
        security: 'SSL',
        secure: true,
        smtpUser: process.env.SMTP_USER || 'water.report@hossidev.com',
        encryptedSmtpPassword: null,
        lastTestAt: null,
        lastTestStatus: null,
        lastTestError: null,
        updatedAt: new Date().toISOString(),
      };

      senderEmail = corp.fromAddress || 'water.report@hossidev.com';
      fromOption = {
        name: corp.fromName || 'water.report.@hossidev.com',
        address: senderEmail,
      };
      providerName = 'corporate_hossidev';
      transporter = createCorporateTransporter(corp);
    } else {
      const g = sysEmail?.gmail || {
        fromName: process.env.GMAIL_MAIL_FROM_NAME || 'Hossidev Water Monitor',
        fromAddress: process.env.GMAIL_MAIL_FROM_ADDRESS || 'etakizomba@gmail.com',
        smtpHost: process.env.GMAIL_SMTP_HOST || 'smtp.gmail.com',
        smtpPort: Number(process.env.GMAIL_SMTP_PORT || 587),
        security: 'STARTTLS',
        secure: false,
        smtpUser: process.env.GMAIL_SMTP_USER || 'etakizomba@gmail.com',
        encryptedSmtpPassword: null,
        lastTestAt: null,
        lastTestStatus: null,
        lastTestError: null,
        updatedAt: new Date().toISOString(),
      };

      senderEmail = g.fromAddress || 'etakizomba@gmail.com';
      fromOption = {
        name: g.fromName || 'Hossidev Water Monitor',
        address: senderEmail,
      };
      providerName = 'gmail';
      transporter = createGmailTransporter(g);
    }
  }

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: fromOption,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });

      return {
        providerMessageId: info.messageId || `smtp_${Date.now()}`,
        status: 'sent',
        provider: providerName,
        senderEmail,
      };
    } catch (err: any) {
      console.error(`[NotificationService] Erro no envio via ${providerName}:`, err.message);
      const diag = diagnoseSmtpError(err);
      return {
        providerMessageId: `err_${Date.now()}`,
        status: 'failed',
        provider: providerName,
        senderEmail,
        error: diag.friendlyMessage,
      };
    }
  }

  // 3. Fallback when credentials are not yet configured in environment or database
  console.log(`[NotificationService] Envio enfileirado com remetente ${senderEmail} para ${input.to}: "${input.subject}"`);
  return {
    providerMessageId: `smtp_queued_${Date.now()}`,
    status: 'queued',
    provider: providerName,
    senderEmail,
    error: `Aviso: Credenciais de envio para [${providerName}] pendentes de configuração nos segredos do sistema ou no painel.`,
  };
}

export function getNotificationConfigStatus() {
  const db = loadDb();
  const sysEmail = db.systemEmailSettings;
  const selected = sysEmail?.selectedProvider || 'corporate_hossidev';

  const corpHasPass = Boolean(
    sysEmail?.corporate?.encryptedSmtpPassword ||
    (process.env.SMTP_PASSWORD && !process.env.SMTP_PASSWORD.startsWith('[CONFIGURAR'))
  );
  const gmailHasPass = Boolean(
    sysEmail?.gmail?.encryptedSmtpPassword ||
    (process.env.GMAIL_SMTP_PASSWORD && !process.env.GMAIL_SMTP_PASSWORD.startsWith('[CONFIGURAR'))
  );

  return {
    selectedProvider: selected,
    corporate: {
      fromName: sysEmail?.corporate?.fromName || 'water.report.@hossidev.com',
      fromAddress: sysEmail?.corporate?.fromAddress || 'water.report@hossidev.com',
      host: sysEmail?.corporate?.smtpHost || 'mail.hossidev.com',
      port: sysEmail?.corporate?.smtpPort || 465,
      secure: true,
      user: sysEmail?.corporate?.smtpUser || 'water.report@hossidev.com',
      isConfigured: corpHasPass,
      provider: 'corporate_hossidev',
    },
    gmail: {
      fromName: sysEmail?.gmail?.fromName || 'Hossidev Water Monitor',
      fromAddress: sysEmail?.gmail?.fromAddress || 'etakizomba@gmail.com',
      host: sysEmail?.gmail?.smtpHost || 'smtp.gmail.com',
      port: sysEmail?.gmail?.smtpPort || 587,
      secure: false,
      user: sysEmail?.gmail?.smtpUser || 'etakizomba@gmail.com',
      isConfigured: gmailHasPass,
      provider: 'gmail',
    },
  };
}
