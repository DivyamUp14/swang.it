const { SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, SENDGRID_FROM_NAME, PUBLIC_SITE_URL, CLIENT_ORIGIN } = process.env;

let sgMail = null;

if (SENDGRID_API_KEY && SENDGRID_FROM_EMAIL) {
  sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(SENDGRID_API_KEY);
} else {
}

const resolveBaseUrl = () => {
  if (PUBLIC_SITE_URL && PUBLIC_SITE_URL.trim()) {
    return PUBLIC_SITE_URL.trim().replace(/\/$/, '');
  }
  if (CLIENT_ORIGIN && CLIENT_ORIGIN.trim()) {
    const first = CLIENT_ORIGIN.split(',').map(o => o.trim()).filter(Boolean)[0];
    if (first) return first.replace(/\/$/, '');
  }
  return 'https://www.swang.it';
};

const formatDisplayName = (email) => {
  if (!email) return 'lì';
  const namePart = email.split('@')[0] || '';
  if (!namePart) return 'lì';
  const cleaned = namePart.replace(/[._-]+/g, ' ').trim();
  if (!cleaned) return 'lì';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const getFrom = () => ({
  email: SENDGRID_FROM_EMAIL,
  name: SENDGRID_FROM_NAME && SENDGRID_FROM_NAME.trim() ? SENDGRID_FROM_NAME.trim() : 'Swang'
});

const safeSend = async (messageBuilder) => {
  if (!sgMail) {
    console.warn('[DEBUG-EMAIL] SendGrid not configured - email not sent');
    return;
  }
  try {
    const msg = messageBuilder();
    if (!msg) {
      console.warn('[DEBUG-EMAIL] Email message builder returned null - email not sent');
      return;
    }

    const response = await sgMail.send(msg);
  } catch (err) {
    // Log error but don't break core flows
    console.error('[DEBUG-EMAIL] Error sending email:', err.message || err);
    if (err.response) {
      console.error('[DEBUG-EMAIL] SendGrid Error Body:', JSON.stringify(err.response.body, null, 2));
    }
  }
};

const buildWelcomeEmailHtml = (email) => {
  const displayName = formatDisplayName(email);
  const baseUrl = resolveBaseUrl();
  const accountUrl = `${baseUrl.replace(/\/$/, '')}/account`;
  const homepageUrl = baseUrl;

  return {
    subject: 'Benvenuto/a su Swang!',
    html: `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color:#f7f7f8; padding:32px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 20px 45px rgba(18, 38, 63, 0.08);">
              <tr>
                <td style="padding:32px 32px 24px 32px;">
                  <p style="font-size:14px; color:#999; margin:0 0 8px 0; text-transform:uppercase; letter-spacing:0.08em;">
                    Benvenuto/a
                  </p>
                  <h1 style="font-size:28px; font-weight:700; color:#1f2937; margin:0 0 24px 0; line-height:1.3;">
                    Ciao ${displayName},
                  </h1>
                  <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                    Benvenuto/a su <strong>Swang</strong>,
                    la prima piattaforma che connette le persone giuste, al momento giusto ✨
                  </p>
                  <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                    Da oggi hai accesso a un mondo di <strong>professionisti qualificati</strong> pronti ad ascoltarti, guidarti e offrirti strumenti concreti per migliorare la tua vita — che si tratti di crescita personale, relazioni, benessere o spiritualità.
                  </p>

                  <div style="border-radius:16px; background-color:#f9fafb; padding:24px; margin:32px 0;">
                    <p style="font-size:16px; color:#111827; font-weight:600; margin:0 0 16px 0;">Nel tuo profilo troverai:</p>
                    <ul style="padding:0; margin:0; list-style:none;">
                      <li style="margin-bottom:12px; color:#374151; font-size:15px; line-height:1.6;">🌿 <strong>Il tuo account personale</strong> per gestire dati e preferenze.</li>
                      <li style="margin-bottom:12px; color:#374151; font-size:15px; line-height:1.6;">💫 <strong>I tuoi preferiti</strong> e le recensioni lasciate.</li>
                      <li style="margin-bottom:12px; color:#374151; font-size:15px; line-height:1.6;">💳 <strong>La possibilità di ricaricare crediti</strong> e salvare il tuo metodo di pagamento in sicurezza.</li>
                      <li style="color:#374151; font-size:15px; line-height:1.6;">📞 <strong>L’accesso diretto ai consulenti</strong> disponibili in tempo reale o su appuntamento.</li>
                    </ul>
                  </div>

                  <div style="border-left:4px solid #2563eb; padding-left:16px; margin:32px 0;">
                    <p style="font-size:16px; color:#1f2937; margin:0 0 12px 0;">
                      ✨ <strong>Inizia subito e approfitta del tuo primo consulto gratuito!</strong>
                    </p>
                    <p style="font-size:15px; color:#4b5563; margin:0;">
                      Hai già <strong>5 minuti omaggio</strong> disponibili sul tuo account — usali ora per conoscere il tuo primo professionista.
                    </p>
                  </div>

                  <div style="text-align:center; margin:40px 0;">
                    <a href="${accountUrl}" style="display:inline-block; background-color:#2563eb; color:#ffffff; text-decoration:none; font-size:16px; font-weight:600; padding:14px 28px; border-radius:999px;">
                      Accedi al tuo account
                    </a>
                  </div>

                  <p style="font-size:15px; color:#374151; line-height:1.7; margin:0 0 24px 0;">
                    Siamo felici di averti nella nostra community.<br />
                    Ogni connessione qui è un passo verso qualcosa di importante.
                  </p>

                  <p style="font-size:15px; color:#111827; margin:0 0 4px 0;">Con affetto,</p>
                  <p style="font-size:15px; color:#111827; margin:0 0 16px 0;">Il Team Swang</p>

                  <p style="font-size:13px; color:#6b7280; margin:0;">
                    <a href="${homepageUrl}" style="color:#2563eb; text-decoration:none;">www.swang.it</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `,
    text: `Ciao ${displayName},

Benvenuto/a su Swang, la prima piattaforma che connette le persone giuste, al momento giusto.

Da oggi hai accesso a professionisti qualificati pronti ad ascoltarti, guidarti e offrirti strumenti concreti per migliorare la tua vita.

Nel tuo profilo troverai:
- Il tuo account personale per gestire dati e preferenze.
- I tuoi preferiti e le recensioni lasciate.
- La possibilità di ricaricare crediti e salvare il tuo metodo di pagamento in sicurezza.
- L’accesso diretto ai consulenti disponibili in tempo reale o su appuntamento.

Inizia subito: hai già 5 minuti omaggio disponibili sul tuo account.

Accedi al tuo account qui: ${accountUrl}

Siamo felici di averti nella nostra community.

Con affetto,
Il Team Swang
${homepageUrl}`
  };
};

const sendWelcomeEmail = async ({ email }) => {
  if (!email) return;
  const { subject, html, text } = buildWelcomeEmailHtml(email);
  await safeSend(() => ({
    to: email,
    from: getFrom(),
    subject,
    html,
    text,
  }));
};

const sendTopUpEmail = async ({ email, amount }) => {
  if (!email || typeof amount !== 'number') return;
  const displayName = formatDisplayName(email);
  const accountUrl = `${resolveBaseUrl().replace(/\/$/, '')}/account`;
  const formattedAmount = amount.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

  const subject = 'Ricarica completata con successo 🎉';
  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color:#f7f7f8; padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 20px 45px rgba(18, 38, 63, 0.08);">
            <tr>
              <td style="padding:32px;">
                <h1 style="font-size:26px; font-weight:700; color:#1f2937; margin:0 0 16px 0;">Grazie per la tua ricarica, ${displayName}!</h1>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Abbiamo aggiunto <strong>${formattedAmount}</strong> al tuo saldo Swang. Sei pronto/a per iniziare il tuo prossimo consulto con i migliori professionisti.
                </p>
                <div style="background-color:#f1f5f9; border-radius:12px; padding:16px; margin:24px 0;">
                  <p style="margin:0; font-size:15px; color:#111827;">
                    Saldo aggiornato disponibile nel tuo profilo. Accedi per visualizzare i dettagli della ricarica e gestire il tuo account.
                  </p>
                </div>
                <div style="text-align:center; margin:32px 0;">
                  <a href="${accountUrl}" style="display:inline-block; padding:14px 28px; background-color:#2563eb; color:#ffffff; text-decoration:none; font-size:16px; font-weight:600; border-radius:999px;">
                    Vai al tuo account
                  </a>
                </div>
                <p style="font-size:15px; color:#4b5563; margin:0;">
                  Hai domande o bisogno di assistenza? Scrivici a <a href="mailto:servizioclienti@swang.it" style="color:#2563eb;">servizioclienti@swang.it</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = `Ciao ${displayName},

La tua ricarica di ${formattedAmount} è stata completata con successo.

Accedi al tuo account per consultare il saldo aggiornato: ${accountUrl}

Se hai bisogno di assistenza scrivici a servizioclienti@swang.it.

Il Team Swang`;

  await safeSend(() => ({
    to: email,
    from: getFrom(),
    subject,
    html,
    text,
  }));
};

const formatDateTime = (dateStr, timeStr, timeZone) => {
  // Default to Rome if no valid timezone provided
  const targetZone = timeZone || 'Europe/Rome';
  try {
    // 1. Normalize Input Date (YYYY-MM-DD)
    let d = '';
    if (dateStr instanceof Date) d = dateStr.toISOString().split('T')[0];
    else if (typeof dateStr === 'string') d = dateStr.split('T')[0];
    else return 'Data non valida';

    // 2. Normalize Input Time (HH:MM or HH:MM:SS) -> Ensure HH:MM:00
    // If we receive 12:03:00, trim it. If 12:03, append :00.
    let t = typeof timeStr === 'string' ? timeStr.trim() : '00:00';
    // If it's H:M, pad it? Actually just ensuring HH:MM format is safe for ISO.
    // If length is 5 (HH:MM), add :00
    if (t.length === 5) t += ':00';

    // 3. Construct Base Rome ISO String (without offset yet)
    const baseIso = `${d}T${t}`;

    // 4. Determine Rome Offset (Winter +1, Summer +2)
    const tempDate = new Date(baseIso); // This is local server time interpretation, just to check month
    const month = tempDate.getMonth() + 1;
    // Approximate DST: April to October is Summer (+2)
    const isSummer = month >= 4 && month <= 10;
    const romeOffset = isSummer ? '+02:00' : '+01:00';

    // 5. Create Absolute Date Object (This represents the exact moment in time)
    // Format: YYYY-MM-DDTHH:MM:SS+01:00
    const absoluteDate = new Date(`${baseIso}${romeOffset}`);

    // 6. Format to Target Timezone
    return new Intl.DateTimeFormat('it-IT', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: targetZone,
      timeZoneName: 'short'
    }).format(absoluteDate);

  } catch (e) {
    console.error('Email Date Format Error:', e);
    return `${dateStr} ${timeStr} (${targetZone})`;
  }
};

const formatDate = (dateStr) => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('it-IT', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (e) {
    return dateStr;
  }
};

const formatTime = (timeStr) => {
  try {
    const [hours, minutes] = timeStr.split(':');
    return `${hours}:${minutes}`;
  } catch (e) {
    return timeStr;
  }
};

const getModeLabel = (mode) => {
  const labels = {
    video: 'Video Call',
    voice: 'Voice Call',
    chat: 'Chat',
  };
  return labels[mode] || mode;
};

const sendBookingConfirmationEmail = async ({ customerEmail, consultantEmail, slot, consultantName, customerName, bookingId, token, customerTimezone, consultantTimezone }) => {
  if (!customerEmail || !consultantEmail || !slot) return;

  const baseUrl = resolveBaseUrl();
  const appointmentsUrl = `${baseUrl.replace(/\/$/, '')}/appointments`;
  const consultantDashboardUrl = `${baseUrl.replace(/\/$/, '')}/consultant`;
  const cancelUrl = bookingId && token ? `${baseUrl.replace(/\/$/, '')}/appointments?cancel=${bookingId}&token=${token}` : appointmentsUrl;

  // Format times for each party
  const customerDateTime = formatDateTime(slot.date, slot.time, customerTimezone || 'Europe/Rome');
  const consultantDateTime = formatDateTime(slot.date, slot.time, consultantTimezone || 'Europe/Rome');

  const formattedPrice = slot.price.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  const modeLabel = getModeLabel(slot.mode);

  // Customer confirmation email
  const customerDisplayName = formatDisplayName(customerEmail);
  const customerSubject = `Appuntamento confermato - ${customerDateTime}`;
  const customerHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color:#f7f7f8; padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 20px 45px rgba(18, 38, 63, 0.08);">
            <tr>
              <td style="padding:32px;">
                <h1 style="font-size:26px; font-weight:700; color:#1f2937; margin:0 0 16px 0;">Appuntamento confermato! ✅</h1>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Ciao ${customerDisplayName},
                </p>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Il tuo appuntamento con <strong>${consultantName || 'il consulente'}</strong> è stato confermato con successo.
                </p>
                <div style="background-color:#f1f5f9; border-radius:12px; padding:20px; margin:24px 0;">
                  <p style="margin:0 0 12px 0; font-size:15px; color:#111827; font-weight:600;">Dettagli appuntamento:</p>
                  <p style="margin:4px 0; font-size:15px; color:#374151;">📅 <strong>Data e ora:</strong> ${customerDateTime}</p>
                  <p style="margin:4px 0; font-size:15px; color:#374151;">⏱️ <strong>Durata:</strong> ${slot.duration} minuti</p>
                  <p style="margin:4px 0; font-size:15px; color:#374151;">💬 <strong>Modalità:</strong> ${modeLabel}</p>
                  <p style="margin:4px 0; font-size:15px; color:#374151;">💰 <strong>Prezzo:</strong> ${formattedPrice}</p>
                  ${slot.title ? `<p style="margin:4px 0; font-size:15px; color:#374151;">📝 <strong>Servizio:</strong> ${slot.title}</p>` : ''}
                </div>
                <p style="font-size:15px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Riceverai un promemoria via email 24 ore e 1 ora prima dell'appuntamento.
                </p>
                <div style="background-color:#f0f9ff; border-left:4px solid #2563eb; padding:16px; margin:24px 0; border-radius:8px;">
                  <p style="margin:0 0 8px 0; font-size:15px; color:#1e40af; font-weight:600;">📧 Riceverai il link per l'appuntamento via email</p>
                  <p style="margin:0; font-size:14px; color:#1e3a8a;">
                    Il link sarà inviato via email. Assicurati di essere puntuale.
                  </p>
                </div>
                ${slot.appointment_link ? `
                <div style="background-color:#fef3c7; border-left:4px solid #f59e0b; padding:16px; margin:24px 0; border-radius:8px;">
                  <p style="margin:0 0 12px 0; font-size:15px; color:#92400e; font-weight:600;">🔗 Link per l'appuntamento:</p>
                  <p style="margin:0; font-size:14px; color:#78350f; word-break:break-all;">
                    <a href="${slot.appointment_link}" style="color:#2563eb; text-decoration:underline;">${slot.appointment_link}</a>
                  </p>
                  <p style="margin:12px 0 0 0; font-size:13px; color:#78350f;">
                    Nota: Assicurati di essere puntuale. Il link è strettamente personale.
                  </p>
                </div>
                ` : ''}
                <div style="text-align:center; margin:32px 0;">
                  <a href="${appointmentsUrl}" style="display:inline-block; padding:14px 28px; background-color:#2563eb; color:#ffffff; text-decoration:none; font-size:16px; font-weight:600; border-radius:999px; margin-right:12px;">
                    Vai ai miei appuntamenti
                  </a>
                  ${bookingId && token ? `
                  <a href="${cancelUrl}" style="display:inline-block; padding:14px 28px; background-color:#dc2626; color:#ffffff; text-decoration:none; font-size:16px; font-weight:600; border-radius:999px;">
                    Annulla appuntamento
                  </a>
                  ` : ''}
                </div>
                <p style="font-size:15px; color:#4b5563; margin:0;">
                  Hai domande? Scrivici a <a href="mailto:servizioclienti@swang.it" style="color:#2563eb;">servizioclienti@swang.it</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const customerText = `Ciao ${customerDisplayName},

Il tuo appuntamento con ${consultantName || 'il consulente'} è stato confermato.

Dettagli:
- Data e ora: ${customerDateTime}
- Durata: ${slot.duration} minuti
- Modalità: ${modeLabel}
- Prezzo: ${formattedPrice}
${slot.title ? `- Servizio: ${slot.title}` : ''}

Riceverai un promemoria 24 ore e 1 ora prima dell'appuntamento.

Vai ai tuoi appuntamenti: ${appointmentsUrl}

Il Team Swang`;

  // Consultant confirmation email
  const consultantDisplayName = formatDisplayName(consultantEmail);
  const consultantSubject = `Nuovo appuntamento prenotato - ${consultantDateTime}`;
  const consultantHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color:#f7f7f8; padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 20px 45px rgba(18, 38, 63, 0.08);">
            <tr>
              <td style="padding:32px;">
                <h1 style="font-size:26px; font-weight:700; color:#1f2937; margin:0 0 16px 0;">Nuovo appuntamento prenotato 📅</h1>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Ciao ${consultantDisplayName},
                </p>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Hai ricevuto una nuova prenotazione da <strong>${customerName || 'un cliente'}</strong>.
                </p>
                <div style="background-color:#f1f5f9; border-radius:12px; padding:20px; margin:24px 0;">
                  <p style="margin:0 0 12px 0; font-size:15px; color:#111827; font-weight:600;">Dettagli appuntamento:</p>
                  <p style="margin:4px 0; font-size:15px; color:#374151;">📅 <strong>Data e ora:</strong> ${consultantDateTime}</p>
                  <p style="margin:4px 0; font-size:15px; color:#374151;">⏱️ <strong>Durata:</strong> ${slot.duration} minuti</p>
                  <p style="margin:4px 0; font-size:15px; color:#374151;">💬 <strong>Modalità:</strong> ${modeLabel}</p>
                  <p style="margin:4px 0; font-size:15px; color:#374151;">💰 <strong>Prezzo:</strong> ${formattedPrice}</p>
                  ${slot.title ? `<p style="margin:4px 0; font-size:15px; color:#374151;">📝 <strong>Servizio:</strong> ${slot.title}</p>` : ''}
                </div>
                ${slot.appointment_link ? `
                <div style="background-color:#fef3c7; border-left:4px solid #f59e0b; padding:16px; margin:24px 0; border-radius:8px;">
                  <p style="margin:0 0 12px 0; font-size:15px; color:#92400e; font-weight:600;">🔗 Link per l'appuntamento:</p>
                  <p style="margin:0; font-size:14px; color:#78350f; word-break:break-all;">
                    <a href="${slot.appointment_link}" style="color:#2563eb; text-decoration:underline;">${slot.appointment_link}</a>
                  </p>
                  <p style="margin:12px 0 0 0; font-size:13px; color:#78350f;">
                    Nota: Assicurati di essere puntuale. Il link è strettamente personale.
                  </p>
                </div>
                ` : ''}
                <div style="text-align:center; margin:32px 0;">
                  <a href="${consultantDashboardUrl}" style="display:inline-block; padding:14px 28px; background-color:#2563eb; color:#ffffff; text-decoration:none; font-size:16px; font-weight:600; border-radius:999px;">
                    Vai alla dashboard
                  </a>
                </div>
                <p style="font-size:15px; color:#4b5563; margin:0;">
                  Hai domande? Scrivici a <a href="mailto:servizioclienti@swang.it" style="color:#2563eb;">servizioclienti@swang.it</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const consultantText = `Ciao ${consultantDisplayName},

Hai ricevuto una nuova prenotazione da ${customerName || 'un cliente'}.

Dettagli:
- Data e ora: ${consultantDateTime}
- Durata: ${slot.duration} minuti
- Modalità: ${modeLabel}
- Prezzo: ${formattedPrice}
${slot.title ? `- Servizio: ${slot.title}` : ''}

Vai alla dashboard: ${consultantDashboardUrl}

Il Team Swang`;

  // Send both emails
  await Promise.all([
    safeSend(() => ({
      to: customerEmail,
      from: getFrom(),
      subject: customerSubject,
      html: customerHtml,
      text: customerText,
    })),
    safeSend(() => ({
      to: consultantEmail,
      from: getFrom(),
      subject: consultantSubject,
      html: consultantHtml,
      text: consultantText,
    })),
  ]);
};

const sendBookingReminderEmail = async ({ email, slot, consultantName, customerName, isCustomer, hoursBefore, recipientTimezone }) => {
  if (!email || !slot) return;

  const baseUrl = resolveBaseUrl();
  const appointmentsUrl = `${baseUrl.replace(/\/$/, '')}/appointments`;
  const consultantDashboardUrl = `${baseUrl.replace(/\/$/, '')}/consultant`;

  // Format time for this specific recipient
  const appointmentDateTime = formatDateTime(slot.date, slot.time, recipientTimezone || 'Europe/Rome');
  const formattedPrice = slot.price.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  const modeLabel = getModeLabel(slot.mode);
  const displayName = formatDisplayName(email);

  const timeLabel = hoursBefore === 24 ? '24 ore' : '1 ora';
  const subject = `Promemoria appuntamento tra ${timeLabel} - ${appointmentDateTime}`;

  const recipientName = isCustomer ? customerName : consultantName;
  const otherPartyName = isCustomer ? consultantName : customerName;
  const dashboardUrl = isCustomer ? appointmentsUrl : consultantDashboardUrl;

  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color:#f7f7f8; padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 20px 45px rgba(18, 38, 63, 0.08);">
            <tr>
              <td style="padding:32px;">
                <h1 style="font-size:26px; font-weight:700; color:#1f2937; margin:0 0 16px 0;">Promemoria appuntamento ⏰</h1>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Ciao ${displayName},
                </p>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Ti ricordiamo che hai un appuntamento tra <strong>${timeLabel}</strong> con <strong>${otherPartyName || (isCustomer ? 'il consulente' : 'il cliente')}</strong>.
                </p>
                <div style="background-color:#fef3c7; border-left:4px solid #f59e0b; border-radius:12px; padding:20px; margin:24px 0;">
                  <p style="margin:0 0 12px 0; font-size:15px; color:#111827; font-weight:600;">Dettagli appuntamento:</p>
                  <p style="margin:4px 0; font-size:15px; color:#374151;">📅 <strong>Data e ora:</strong> ${appointmentDateTime}</p>
                  <p style="margin:4px 0; font-size:15px; color:#374151;">⏱️ <strong>Durata:</strong> ${slot.duration} minuti</p>
                  <p style="margin:4px 0; font-size:15px; color:#374151;">💬 <strong>Modalità:</strong> ${modeLabel}</p>
                  ${slot.title ? `<p style="margin:4px 0; font-size:15px; color:#374151;">📝 <strong>Servizio:</strong> ${slot.title}</p>` : ''}
                </div>
                <p style="font-size:15px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Assicurati di essere pronto/a per l'appuntamento. Il link per la sessione sarà disponibile nella tua dashboard.
                </p>
                <div style="text-align:center; margin:32px 0;">
                  <a href="${dashboardUrl}" style="display:inline-block; padding:14px 28px; background-color:#2563eb; color:#ffffff; text-decoration:none; font-size:16px; font-weight:600; border-radius:999px;">
                    ${isCustomer ? 'Vai ai miei appuntamenti' : 'Vai alla dashboard'}
                  </a>
                </div>
                <p style="font-size:15px; color:#4b5563; margin:0;">
                  Hai domande? Scrivici a <a href="mailto:servizioclienti@swang.it" style="color:#2563eb;">servizioclienti@swang.it</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = `Ciao ${displayName},

Ti ricordiamo che hai un appuntamento tra ${timeLabel} con ${otherPartyName || (isCustomer ? 'il consulente' : 'il cliente')}.

Dettagli:
- Data e ora: ${appointmentDateTime}
- Durata: ${slot.duration} minuti
- Modalità: ${modeLabel}
${slot.title ? `- Servizio: ${slot.title}` : ''}

Assicurati di essere pronto/a per l'appuntamento.

${isCustomer ? 'Vai ai tuoi appuntamenti' : 'Vai alla dashboard'}: ${dashboardUrl}

Il Team Swang`;

  await safeSend(() => ({
    to: email,
    from: getFrom(),
    subject,
    html,
    text,
  }));
};

const sendLowBalanceEmail = async ({ email, currentCredits, creditsPerMinute }) => {
  if (!email || typeof currentCredits !== 'number') return;

  const displayName = formatDisplayName(email);
  const accountUrl = `${resolveBaseUrl().replace(/\/$/, '')}/account`;
  const topUpUrl = `${resolveBaseUrl().replace(/\/$/, '')}/account?tab=topup`;
  const minutesRemaining = Math.floor(currentCredits / creditsPerMinute);

  const subject = '⚠️ Saldo basso - Ricarica i tuoi crediti';
  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color:#f7f7f8; padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 20px 45px rgba(18, 38, 63, 0.08);">
            <tr>
              <td style="padding:32px;">
                <h1 style="font-size:26px; font-weight:700; color:#dc2626; margin:0 0 16px 0;">⚠️ Saldo basso</h1>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Ciao ${displayName},
                </p>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Il tuo saldo Swang è <strong>basso</strong>. Hai ancora <strong>${currentCredits.toFixed(2)} crediti</strong> disponibili (circa ${minutesRemaining} minuti di conversazione).
                </p>
                <div style="background-color:#fef2f2; border-left:4px solid #dc2626; border-radius:12px; padding:20px; margin:24px 0;">
                  <p style="margin:0; font-size:15px; color:#991b1b; font-weight:600;">
                    ⚠️ La sessione verrà terminata automaticamente quando i crediti raggiungeranno zero.
                  </p>
                </div>
                <p style="font-size:15px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Per continuare a utilizzare i servizi Swang senza interruzioni, ti consigliamo di ricaricare il tuo account.
                </p>
                <div style="text-align:center; margin:32px 0;">
                  <a href="${topUpUrl}" style="display:inline-block; padding:14px 28px; background-color:#2563eb; color:#ffffff; text-decoration:none; font-size:16px; font-weight:600; border-radius:999px;">
                    Ricarica ora
                  </a>
                </div>
                <p style="font-size:15px; color:#4b5563; margin:0;">
                  Vai al tuo account: <a href="${accountUrl}" style="color:#2563eb;">${accountUrl}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = `Ciao ${displayName},

Il tuo saldo Swang è basso. Hai ancora ${currentCredits.toFixed(2)} crediti disponibili (circa ${minutesRemaining} minuti di conversazione).

⚠️ La sessione verrà terminata automaticamente quando i crediti raggiungeranno zero.

Per continuare a utilizzare i servizi Swang senza interruzioni, ti consigliamo di ricaricare il tuo account.

Ricarica ora: ${topUpUrl}

Il Team Swang`;

  await safeSend(() => ({
    to: email,
    from: getFrom(),
    subject,
    html,
    text,
  }));
};

const sendCallEndedEmail = async ({ email, reason }) => {
  if (!email) return;

  const displayName = formatDisplayName(email);
  const accountUrl = `${resolveBaseUrl().replace(/\/$/, '')}/account`;
  const topUpUrl = `${resolveBaseUrl().replace(/\/$/, '')}/account?tab=topup`;

  const subject = reason === 'insufficient_credits'
    ? 'Sessione terminata - Crediti esauriti'
    : 'Sessione terminata';

  const reasonText = reason === 'insufficient_credits'
    ? 'La sessione è stata terminata automaticamente perché i tuoi crediti sono esauriti.'
    : 'La sessione è stata terminata.';

  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color:#f7f7f8; padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 20px 45px rgba(18, 38, 63, 0.08);">
            <tr>
              <td style="padding:32px;">
                <h1 style="font-size:26px; font-weight:700; color:#1f2937; margin:0 0 16px 0;">Sessione terminata</h1>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Ciao ${displayName},
                </p>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  ${reasonText}
                </p>
                ${reason === 'insufficient_credits' ? `
                  <div style="background-color:#fef2f2; border-left:4px solid #dc2626; border-radius:12px; padding:20px; margin:24px 0;">
                    <p style="margin:0; font-size:15px; color:#991b1b;">
                      Per continuare a utilizzare i servizi Swang, ricarica il tuo account.
                    </p>
                  </div>
                  <div style="text-align:center; margin:32px 0;">
                    <a href="${topUpUrl}" style="display:inline-block; padding:14px 28px; background-color:#2563eb; color:#ffffff; text-decoration:none; font-size:16px; font-weight:600; border-radius:999px;">
                      Ricarica ora
                    </a>
                  </div>
                ` : ''}
                <p style="font-size:15px; color:#4b5563; margin:0;">
                  Vai al tuo account: <a href="${accountUrl}" style="color:#2563eb;">${accountUrl}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = `Ciao ${displayName},

${reasonText}

${reason === 'insufficient_credits' ? `Per continuare a utilizzare i servizi Swang, ricarica il tuo account: ${topUpUrl}` : ''}

Vai al tuo account: ${accountUrl}

Il Team Swang`;

  await safeSend(() => ({
    to: email,
    from: getFrom(),
    subject,
    html,
    text,
  }));
};

const sendProfileApprovedEmail = async ({ email, consultantName }) => {
  if (!email) return;

  const displayName = formatDisplayName(email);
  const baseUrl = resolveBaseUrl();
  const consultantDashboardUrl = `${baseUrl.replace(/\/$/, '')}/consultant`;

  const subject = '✅ Profilo approvato - Benvenuto su Swang!';
  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color:#f7f7f8; padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 20px 45px rgba(18, 38, 63, 0.08);">
            <tr>
              <td style="padding:32px;">
                <h1 style="font-size:26px; font-weight:700; color:#059669; margin:0 0 16px 0;">✅ Profilo approvato!</h1>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Ciao ${displayName},
                </p>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Siamo lieti di informarti che il tuo profilo consulente su Swang è stato <strong>approvato</strong> e ora è <strong>attivo</strong> e visibile ai clienti.
                </p>
                <div style="background-color:#f0fdf4; border-left:4px solid #059669; border-radius:12px; padding:20px; margin:24px 0;">
                  <p style="margin:0; font-size:15px; color:#166534; font-weight:600;">
                    🎉 Il tuo profilo è ora online e i clienti possono prenotare sessioni con te!
                  </p>
                </div>
                <p style="font-size:15px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Puoi ora:
                </p>
                <ul style="font-size:15px; color:#374151; line-height:1.8; margin:0 0 16px 0; padding-left:24px;">
                  <li>Ricevere richieste di consulenza dai clienti</li>
                  <li>Gestire il tuo calendario e le prenotazioni</li>
                  <li>Iniziare a guadagnare con le tue sessioni</li>
                  <li>Monitorare i tuoi guadagni e richiedere pagamenti</li>
                </ul>
                <div style="text-align:center; margin:32px 0;">
                  <a href="${consultantDashboardUrl}" style="display:inline-block; padding:14px 28px; background-color:#2563eb; color:#ffffff; text-decoration:none; font-size:16px; font-weight:600; border-radius:999px;">
                    Vai alla dashboard
                  </a>
                </div>
                <p style="font-size:15px; color:#4b5563; margin:0;">
                  Hai domande? Scrivici a <a href="mailto:servizioclienti@swang.it" style="color:#2563eb;">servizioclienti@swang.it</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = `Ciao ${displayName},

Siamo lieti di informarti che il tuo profilo consulente su Swang è stato approvato e ora è attivo e visibile ai clienti.

🎉 Il tuo profilo è ora online e i clienti possono prenotare sessioni con te!

Puoi ora:
- Ricevere richieste di consulenza dai clienti
- Gestire il tuo calendario e le prenotazioni
- Iniziare a guadagnare con le tue sessioni
- Monitorare i tuoi guadagni e richiedere pagamenti

Vai alla dashboard: ${consultantDashboardUrl}

Hai domande? Scrivici a servizioclienti@swang.it

Il Team Swang`;

  await safeSend(() => ({
    to: email,
    from: getFrom(),
    subject,
    html,
    text,
  }));
};

const sendPayoutProcessedEmail = async ({ email, amount, status, payoutRequestId }) => {
  if (!email || !amount || !status) return;

  const displayName = formatDisplayName(email);
  const baseUrl = resolveBaseUrl();
  const earningsUrl = `${baseUrl.replace(/\/$/, '')}/consultant?tab=earnings`;
  const formattedAmount = amount.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

  const isApproved = status === 'approved' || status === 'paid';
  const subject = isApproved
    ? `✅ Pagamento processato - ${formattedAmount}`
    : `❌ Richiesta di pagamento rifiutata`;

  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color:#f7f7f8; padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 20px 45px rgba(18, 38, 63, 0.08);">
            <tr>
              <td style="padding:32px;">
                <h1 style="font-size:26px; font-weight:700; color:${isApproved ? '#059669' : '#dc2626'}; margin:0 0 16px 0;">
                  ${isApproved ? '✅ Pagamento processato' : '❌ Richiesta rifiutata'}
                </h1>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Ciao ${displayName},
                </p>
                ${isApproved ? `
                  <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                    La tua richiesta di pagamento per <strong>${formattedAmount}</strong> è stata <strong>approvata</strong> e il pagamento è stato processato.
                  </p>
                  <div style="background-color:#f0fdf4; border-left:4px solid #059669; border-radius:12px; padding:20px; margin:24px 0;">
                    <p style="margin:0 0 8px 0; font-size:15px; color:#166534; font-weight:600;">
                      💰 Importo: ${formattedAmount}
                    </p>
                    <p style="margin:0; font-size:14px; color:#166534;">
                      Il pagamento verrà effettuato tramite bonifico bancario o PayPal secondo le modalità indicate.
                    </p>
                  </div>
                  <p style="font-size:15px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                    Riceverai una conferma quando il pagamento sarà completato. In caso di ritardi, contattaci a <a href="mailto:servizioclienti@swang.it" style="color:#2563eb;">servizioclienti@swang.it</a>.
                  </p>
                ` : `
                  <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                    La tua richiesta di pagamento per <strong>${formattedAmount}</strong> è stata <strong>rifiutata</strong>.
                  </p>
                  <div style="background-color:#fef2f2; border-left:4px solid #dc2626; border-radius:12px; padding:20px; margin:24px 0;">
                    <p style="margin:0; font-size:15px; color:#991b1b; font-weight:600;">
                      Per maggiori informazioni sul motivo del rifiuto, contattaci a <a href="mailto:servizioclienti@swang.it" style="color:#dc2626;">servizioclienti@swang.it</a>.
                    </p>
                  </div>
                `}
                <div style="text-align:center; margin:32px 0;">
                  <a href="${earningsUrl}" style="display:inline-block; padding:14px 28px; background-color:#2563eb; color:#ffffff; text-decoration:none; font-size:16px; font-weight:600; border-radius:999px;">
                    Vai ai guadagni
                  </a>
                </div>
                <p style="font-size:15px; color:#4b5563; margin:0;">
                  Hai domande? Scrivici a <a href="mailto:servizioclienti@swang.it" style="color:#2563eb;">servizioclienti@swang.it</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = `Ciao ${displayName},

${isApproved ? `
La tua richiesta di pagamento per ${formattedAmount} è stata approvata e il pagamento è stato processato.

💰 Importo: ${formattedAmount}

Il pagamento verrà effettuato tramite bonifico bancario o PayPal secondo le modalità indicate.

Riceverai una conferma quando il pagamento sarà completato. In caso di ritardi, contattaci a servizioclienti@swang.it.
` : `
La tua richiesta di pagamento per ${formattedAmount} è stata rifiutata.

Per maggiori informazioni sul motivo del rifiuto, contattaci a servizioclienti@swang.it.
`}

Vai ai guadagni: ${earningsUrl}

Hai domande? Scrivici a servizioclienti@swang.it

Il Team Swang`;

  await safeSend(() => ({
    to: email,
    from: getFrom(),
    subject,
    html,
    text,
  }));
};

const sendSupportFormEmail = async ({ name, email, subject, message }) => {
  if (!name || !email || !subject || !message) return;

  const supportEmail = 'servizioclienti@swang.it';
  const displayName = formatDisplayName(email);

  const emailSubject = `📧 Supporto: ${subject}`;
  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color:#f7f7f8; padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 20px 45px rgba(18, 38, 63, 0.08);">
            <tr>
              <td style="padding:32px;">
                <h1 style="font-size:26px; font-weight:700; color:#1f2937; margin:0 0 16px 0;">📧 Nuovo messaggio di supporto</h1>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 24px 0;">
                  Hai ricevuto un nuovo messaggio dal form di supporto.
                </p>
                <div style="background-color:#f9fafb; border-left:4px solid #3b82f6; padding:20px; margin:24px 0; border-radius:8px;">
                  <p style="font-size:14px; color:#6b7280; margin:0 0 8px 0; font-weight:600;">Nome:</p>
                  <p style="font-size:16px; color:#1f2937; margin:0 0 16px 0;">${name}</p>
                  
                  <p style="font-size:14px; color:#6b7280; margin:0 0 8px 0; font-weight:600;">Email:</p>
                  <p style="font-size:16px; color:#1f2937; margin:0 0 16px 0;">${email}</p>
                  
                  <p style="font-size:14px; color:#6b7280; margin:0 0 8px 0; font-weight:600;">Oggetto:</p>
                  <p style="font-size:16px; color:#1f2937; margin:0 0 16px 0;">${subject}</p>
                  
                  <p style="font-size:14px; color:#6b7280; margin:0 0 8px 0; font-weight:600;">Messaggio:</p>
                  <p style="font-size:16px; color:#1f2937; margin:0; white-space:pre-wrap;">${message}</p>
                </div>
                <p style="font-size:14px; color:#6b7280; line-height:1.6; margin:24px 0 0 0;">
                  Questo messaggio è stato inviato tramite il form di supporto su Swang.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = `
Nuovo messaggio di supporto

Nome: ${name}
Email: ${email}
Oggetto: ${subject}

Messaggio:
${message}

---
Questo messaggio è stato inviato tramite il form di supporto su Swang.
  `;

  await safeSend(() => ({
    to: supportEmail,
    from: getFrom(),
    replyTo: email,
    subject: emailSubject,
    html,
    text,
  }));
};

const sendPasswordResetEmail = async ({ email, resetToken }) => {
  if (!email || !resetToken) return;

  const displayName = formatDisplayName(email);
  const baseUrl = resolveBaseUrl();
  const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${resetToken}`;

  const subject = '🔐 Reimposta la tua password - Swang';
  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color:#f7f7f8; padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 20px 45px rgba(18, 38, 63, 0.08);">
            <tr>
              <td style="padding:32px;">
                <h1 style="font-size:26px; font-weight:700; color:#1f2937; margin:0 0 16px 0;">🔐 Reimposta la tua password</h1>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Ciao ${displayName},
                </p>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Abbiamo ricevuto una richiesta per reimpostare la password del tuo account Swang.
                </p>
                <div style="background-color:#f1f5f9; border-radius:12px; padding:20px; margin:24px 0;">
                  <p style="margin:0 0 12px 0; font-size:15px; color:#111827; font-weight:600;">
                    ⏰ Il link di reset scade tra 1 ora per motivi di sicurezza.
                  </p>
                </div>
                <p style="font-size:15px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Clicca sul pulsante qui sotto per reimpostare la tua password:
                </p>
                <div style="text-align:center; margin:32px 0;">
                  <a href="${resetUrl}" style="display:inline-block; padding:14px 28px; background-color:#2563eb; color:#ffffff; text-decoration:none; font-size:16px; font-weight:600; border-radius:999px;">
                    Reimposta password
                  </a>
                </div>
                <p style="font-size:14px; color:#6b7280; line-height:1.6; margin:24px 0 0 0;">
                  Se il pulsante non funziona, copia e incolla questo link nel tuo browser:
                </p>
                <p style="font-size:13px; color:#2563eb; word-break:break-all; margin:8px 0 0 0;">
                  ${resetUrl}
                </p>
                <div style="background-color:#fef3c7; border-left:4px solid #f59e0b; border-radius:12px; padding:16px; margin:24px 0;">
                  <p style="margin:0; font-size:14px; color:#92400e;">
                    ⚠️ <strong>Non hai richiesto il reset?</strong> Ignora questa email. La tua password rimarrà invariata.
                  </p>
                </div>
                <p style="font-size:15px; color:#4b5563; margin:0;">
                  Hai domande? Scrivici a <a href="mailto:servizioclienti@swang.it" style="color:#2563eb;">servizioclienti@swang.it</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = `Ciao ${displayName},

Abbiamo ricevuto una richiesta per reimpostare la password del tuo account Swang.

Il link di reset scade tra 1 ora per motivi di sicurezza.

Clicca sul link qui sotto per reimposta la tua password:
${resetUrl}

Se non hai richiesto il reset, ignora questa email. La tua password rimarrà invariata.

Hai domande? Scrivici a servizioclienti@swang.it

Il Team Swang`;

  await safeSend(() => ({
    to: email,
    from: getFrom(),
    subject,
    html,
    text,
  }));
};

const sendBookingCancellationEmail = async ({ customerEmail, consultantEmail, slot, consultantName, customerName, customerTimezone, consultantTimezone }) => {
  if (!customerEmail || !consultantEmail || !slot) return;

  const baseUrl = resolveBaseUrl();
  const appointmentsUrl = `${baseUrl.replace(/\/$/, '')}/appointments`;
  const consultantDashboardUrl = `${baseUrl.replace(/\/$/, '')}/consultant`;

  // Format times specifically for each recipient
  const customerDateTime = formatDateTime(slot.date, slot.time, customerTimezone || 'Europe/Rome');
  const consultantDateTime = formatDateTime(slot.date, slot.time, consultantTimezone || 'Europe/Rome');

  const formattedPrice = slot.price.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  const modeLabel = getModeLabel(slot.mode);

  // Customer cancellation email
  const customerDisplayName = formatDisplayName(customerEmail);
  const customerSubject = `Appuntamento cancellato - ${customerDateTime}`;
  const customerHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color:#f7f7f8; padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 20px 45px rgba(18, 38, 63, 0.08);">
            <tr>
              <td style="padding:32px;">
                <h1 style="font-size:26px; font-weight:700; color:#1f2937; margin:0 0 16px 0;">Appuntamento cancellato</h1>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Ciao ${customerDisplayName},
                </p>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Il tuo appuntamento con <strong>${consultantName || 'il consulente'}</strong> del <strong>${customerDateTime}</strong> è stato cancellato.
                </p>
                <div style="background-color:#f0fdf4; border-left:4px solid #059669; border-radius:12px; padding:20px; margin:24px 0;">
                  <p style="margin:0; font-size:15px; color:#166534; font-weight:600;">
                    ✅ I crediti pre-autorizzati (${formattedPrice}) sono stati rimborsati al tuo account.
                  </p>
                </div>
                <div style="text-align:center; margin:32px 0;">
                  <a href="${appointmentsUrl}" style="display:inline-block; padding:14px 28px; background-color:#2563eb; color:#ffffff; text-decoration:none; font-size:16px; font-weight:600; border-radius:999px;">
                    Vai ai miei appuntamenti
                  </a>
                </div>
                <p style="font-size:15px; color:#4b5563; margin:0;">
                  Hai domande? Scrivici a <a href="mailto:servizioclienti@swang.it" style="color:#2563eb;">servizioclienti@swang.it</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const customerText = `Ciao ${customerDisplayName},

Il tuo appuntamento con ${consultantName || 'il consulente'} del ${customerDateTime} è stato cancellato.

I crediti pre-autorizzati (${formattedPrice}) sono stati rimborsati al tuo account.

Vai ai tuoi appuntamenti: ${appointmentsUrl}

Il Team Swang`;

  // Consultant cancellation email
  const consultantDisplayName = formatDisplayName(consultantEmail);
  const consultantSubject = `Appuntamento cancellato - ${consultantDateTime}`;
  const consultantHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color:#f7f7f8; padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 20px 45px rgba(18, 38, 63, 0.08);">
            <tr>
              <td style="padding:32px;">
                <h1 style="font-size:26px; font-weight:700; color:#1f2937; margin:0 0 16px 0;">Appuntamento cancellato</h1>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Ciao ${consultantDisplayName},
                </p>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  L'appuntamento con <strong>${customerName || 'un cliente'}</strong> del <strong>${consultantDateTime}</strong> è stato cancellato dal cliente.
                </p>
                <div style="background-color:#f1f5f9; border-radius:12px; padding:20px; margin:24px 0;">
                  <p style="margin:0 0 12px 0; font-size:15px; color:#111827; font-weight:600;">Dettagli appuntamento cancellato:</p>
                  <p style="margin:4px 0; font-size:15px; color:#374151;">📅 <strong>Data e ora:</strong> ${consultantDateTime}</p>
                  <p style="margin:4px 0; font-size:15px; color:#374151;">⏱️ <strong>Durata:</strong> ${slot.duration} minuti</p>
                  <p style="margin:4px 0; font-size:15px; color:#374151;">💬 <strong>Modalità:</strong> ${modeLabel}</p>
                  ${slot.title ? `<p style="margin:4px 0; font-size:15px; color:#374151;">📝 <strong>Servizio:</strong> ${slot.title}</p>` : ''}
                </div>
                <div style="text-align:center; margin:32px 0;">
                  <a href="${consultantDashboardUrl}" style="display:inline-block; padding:14px 28px; background-color:#2563eb; color:#ffffff; text-decoration:none; font-size:16px; font-weight:600; border-radius:999px;">
                    Vai alla dashboard
                  </a>
                </div>
                <p style="font-size:15px; color:#4b5563; margin:0;">
                  Hai domande? Scrivici a <a href="mailto:servizioclienti@swang.it" style="color:#2563eb;">servizioclienti@swang.it</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const consultantText = `Ciao ${consultantDisplayName},

L'appuntamento con ${customerName || 'un cliente'} del ${consultantDateTime} è stato cancellato dal cliente.

Dettagli:
- Data e ora: ${consultantDateTime}
- Durata: ${slot.duration} minuti
- Modalità: ${modeLabel}
${slot.title ? `- Servizio: ${slot.title}` : ''}

Vai alla dashboard: ${consultantDashboardUrl}

Il Team Swang`;

  // Send both emails
  await Promise.all([
    safeSend(() => ({
      to: customerEmail,
      from: getFrom(),
      subject: customerSubject,
      html: customerHtml,
      text: customerText,
    })),
    safeSend(() => ({
      to: consultantEmail,
      from: getFrom(),
      subject: consultantSubject,
      html: consultantHtml,
      text: consultantText,
    })),
  ]);
};

const sendBroadcastEmail = async ({ email, subject, message }) => {
  if (!email || !subject || !message) return;

  const displayName = formatDisplayName(email);
  const baseUrl = resolveBaseUrl();

  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color:#f7f7f8; padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 20px 45px rgba(18, 38, 63, 0.08);">
            <tr>
              <td style="padding:32px;">
                <h1 style="font-size:26px; font-weight:700; color:#1f2937; margin:0 0 16px 0;">${subject}</h1>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Ciao ${displayName},
                </p>
                <div style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 24px 0; white-space:pre-wrap;">
                  ${message}
                </div>
                <p style="font-size:15px; color:#4b5563; margin:0;">
                  Hai domande? Scrivici a <a href="mailto:servizioclienti@swang.it" style="color:#2563eb;">servizioclienti@swang.it</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = `Ciao ${displayName},\n\n${message}\n\nHai domande? Scrivici a servizioclienti@swang.it\n\nIl Team Swang`;

  await safeSend(() => ({
    to: email,
    from: getFrom(),
    subject,
    html,
    text,
  }));
};

const sendInvitationEmail = async ({ email, token, greeting }) => {
  if (!email || !token) return;

  const displayName = formatDisplayName(email);
  const baseUrl = resolveBaseUrl();
  const registrationUrl = `${baseUrl.replace(/\/$/, '')}/signup?token=${token}`;

  const subject = 'Invito a registrarti come consulente su Swang';
  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color:#f7f7f8; padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 20px 45px rgba(18, 38, 63, 0.08);">
            <tr>
              <td style="padding:32px;">
                <h1 style="font-size:26px; font-weight:700; color:#1f2937; margin:0 0 16px 0;">Invito a registrarti come consulente</h1>
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Ciao ${displayName},
                </p>
                ${greeting ? `<p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">${greeting}</p>` : ''}
                <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px 0;">
                  Sei stato/a invitato/a a registrarti come consulente sulla piattaforma <strong>Swang</strong>. Clicca sul pulsante qui sotto per completare la registrazione.
                </p>
                <div style="background-color:#fef3c7; border-left:4px solid #f59e0b; border-radius:12px; padding:20px; margin:24px 0;">
                  <p style="margin:0 0 12px 0; font-size:15px; color:#92400e; font-weight:600;">
                    ⏰ <strong>IMPORTANTE:</strong> Questo link è valido solo per <strong>24 ore</strong> dalla ricezione di questa email.
                  </p>
                  <p style="margin:0; font-size:14px; color:#78350f;">
                    Dopo 24 ore, il link scadrà e non sarà più utilizzabile. Se hai bisogno di un nuovo invito, contatta l'amministratore.
                  </p>
                </div>
                <div style="text-align:center; margin:32px 0;">
                  <a href="${registrationUrl}" style="display:inline-block; padding:14px 28px; background-color:#2563eb; color:#ffffff; text-decoration:none; font-size:16px; font-weight:600; border-radius:999px;">
                    Registrati come consulente
                  </a>
                </div>
                <p style="font-size:14px; color:#6b7280; line-height:1.6; margin:24px 0 0 0;">
                  Se il pulsante non funziona, copia e incolla questo link nel tuo browser:
                </p>
                <p style="font-size:13px; color:#2563eb; word-break:break-all; margin:8px 0 0 0;">
                  ${registrationUrl}
                </p>
                <div style="background-color:#f0fdf4; border-left:4px solid #059669; border-radius:12px; padding:16px; margin:24px 0;">
                  <p style="margin:0; font-size:14px; color:#166534;">
                    ✅ Dopo la registrazione, il tuo profilo sarà in attesa di approvazione. Riceverai una notifica quando sarà approvato.
                  </p>
                </div>
                <p style="font-size:15px; color:#4b5563; margin:0;">
                  Hai domande? Scrivici a <a href="mailto:servizioclienti@swang.it" style="color:#2563eb;">servizioclienti@swang.it</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = `Ciao ${displayName},

${greeting ? `${greeting}\n\n` : ''}Sei stato/a invitato/a a registrarti come consulente sulla piattaforma Swang.

⏰ IMPORTANTE: Questo link è valido solo per 24 ore dalla ricezione di questa email.
Dopo 24 ore, il link scadrà e non sarà più utilizzabile.

Clicca sul link qui sotto per completare la registrazione:
${registrationUrl}

Dopo la registrazione, il tuo profilo sarà in attesa di approvazione. Riceverai una notifica quando sarà approvato.

Hai domande? Scrivici a servizioclienti@swang.it

Il Team Swang`;

  await safeSend(() => ({
    to: email,
    from: getFrom(),
    subject,
    html,
    text,
  }));
};

module.exports = {
  sendWelcomeEmail,
  sendTopUpEmail,
  sendBookingConfirmationEmail,
  sendBookingReminderEmail,
  sendBookingCancellationEmail,
  sendLowBalanceEmail,
  sendCallEndedEmail,
  sendProfileApprovedEmail,
  sendPayoutProcessedEmail,
  sendPasswordResetEmail,
  sendBroadcastEmail,
  sendInvitationEmail,
  sendSupportFormEmail,
};
