// Error wording only administrators read: Admin's own refusals (Notion,
// batches, texts, seating, sign-in and authenticators), and administrators'
// own wording of an error guests also get. Admin pages load it (site/admin.js
// adds it to site/client.js's table), so guest pages never download it.
export const adminMessages = {
  INVALID_AMOUNT: [
    "Use a nonnegative amount with at most two decimal places.",
    "Usa una cantidad positiva con hasta dos decimales.",
  ],
  INVALID_DOCUMENT: [
    "Choose a valid JPG, PNG, WebP, PDF, text or Office file up to 8 MB.",
    "Elige un archivo válido de hasta 8 MB.",
  ],
  NO_ELIGIBLE_RECIPIENTS: [
    "None of the selected households can receive this. For texts, tick households marked Subscribed.",
    "Ninguna de las familias seleccionadas puede recibir esto. Para mensajes de texto, elige familias marcadas como Suscrita.",
  ],
  CONFIRM_COUNT_MISMATCH: [
    "Type the exact number shown to confirm. Nothing was sent.",
    "Escribe el número exacto para confirmar. No se envió nada.",
  ],
  SMS_NOT_SUBSCRIBED: [
    "That phone hasn't texted SOPHIA to the event number yet, or it texted STOP. Text SOPHIA first, then try again.",
    "Ese teléfono aún no envió SOPHIA al número del evento, o envió STOP. Envía SOPHIA primero e inténtalo de nuevo.",
  ],
  SMS_NOT_ENABLED: [
    "Text sending is switched off on the server. Ask whoever runs the website to turn it on.",
    "El envío de mensajes de texto está apagado en el servidor.",
  ],
  SMS_REJECTED: [
    "Twilio refused this text. The usual cause is the website's Twilio API key missing the Messages create permission. The Twilio error code is shown on the record below.",
    "Twilio rechazó este mensaje. La causa habitual es que la clave API de Twilio del sitio no tiene permiso para crear mensajes. El código de error de Twilio aparece en el registro.",
  ],
  SMS_DELIVERY_UNKNOWN: [
    "Twilio did not answer clearly. Check Twilio's message log before trying again; the text may have gone out.",
    "Twilio no respondió con claridad. Revisa el registro de mensajes de Twilio antes de reintentar; el mensaje pudo haberse enviado.",
  ],
  SMS_OPTED_OUT: [
    "This phone texted STOP. Nothing was sent.",
    "Este teléfono envió STOP. No se envió nada.",
  ],
  SMS_COUNTRY_NOT_ALLOWED: [
    "Texts can only go to US and Canadian numbers. Use WhatsApp or email for other countries.",
    "Los mensajes de texto solo llegan a números de EE. UU. y Canadá. Usa WhatsApp o correo para otros países.",
  ],
  SMS_DESTINATION_INVALID: [
    "Enter the phone with its country code, like +1 817 555 0123.",
    "Escribe el teléfono con su código de país, como +1 817 555 0123.",
  ],
  // Admin only: invitations and reminders ask guests to RSVP by the deadline.
  INVITATIONS_CLOSED: [
    "The RSVP deadline has passed. Invitations and reminders ask guests to RSVP by it, so they can no longer be drafted or sent. Nothing was sent. To reach guests now, use an update email or a website announcement.",
    "La fecha límite para confirmar ya pasó. Las invitaciones y los recordatorios piden confirmar antes de esa fecha, así que ya no se pueden preparar ni enviar. No se envió nada. Para avisar a los invitados, usa un correo de novedades o un anuncio en el sitio.",
  ],
  SPANISH_REQUIRED: [
    "Add the Spanish title and message too. Guests read the website in English and Spanish, so a new announcement needs both. Nothing was published.",
    "Agrega también el título y el mensaje en español. Los invitados leen el sitio en inglés y en español, así que un anuncio nuevo necesita los dos. No se publicó nada.",
  ],
  BATCH_NOT_CONFIRMED: [
    "Confirm this batch before sending.",
    "Confirma este lote antes de enviarlo.",
  ],
  BATCH_NOT_DRAFT: [
    "This batch was already confirmed or cancelled. Reopen it to see its status.",
    "Este lote ya fue confirmado o cancelado.",
  ],
  BATCH_ALREADY_SENDING: [
    "This batch is being sent from another tab. Wait a minute, then reopen it.",
    "Este lote se está enviando desde otra pestaña. Espera un minuto y vuelve a abrirlo.",
  ],
  INVALID_AUDIENCE: [
    "Select at least one household.",
    "Selecciona al menos una familia.",
  ],
  EVENTS_REQUIRED: [
    "Choose at least one event for the invitation.",
    "Elige al menos un evento para la invitación.",
  ],
  LINKS_NOT_READY: [
    "None of these households has an active private link for {link}. Create their links first. Nothing was drafted.",
    "Ninguno de estos hogares tiene un enlace privado activo para {link}. Crea sus enlaces primero. No se creó ningún borrador.",
  ],
  SMS_BRAND_OR_STOP_MISSING: [
    "Start the text with “Simply Soph Media:” and include STOP opt-out wording.",
    "Empieza el mensaje con “Simply Soph Media:” e incluye la opción STOP.",
  ],
  INVALID_DATA_SOURCE: [
    "Enter the Notion data source ID for this table.",
    "Ingresa el ID de la fuente de datos de Notion.",
  ],
  NAME_REQUIRED: [
    "Enter an item or person name.",
    "Ingresa el nombre del artículo o persona.",
  ],
  NOTION_404: [
    "Share this database with the dedicated Notion connection and check its data source ID.",
    "Comparte esta base de datos con la conexión de Notion y verifica su ID.",
  ],
  SETTINGS_CHANGED: [
    "Another organizer changed these settings. Reload before saving.",
    "Otro organizador cambió estos ajustes. Recarga antes de guardar.",
  ],
  INVALID_SITE_SETTINGS: [
    "Check the required fields, HTTPS links, and dates with an explicit time-zone offset. End times must follow start times.",
    "Revisa los campos obligatorios, enlaces HTTPS y fechas con zona horaria explícita. La hora final debe ser posterior a la inicial.",
  ],
  ALBUM_HAS_MEDIA: [
    "Move existing media to another album before removing or renaming its ID.",
    "Mueve los archivos a otro álbum antes de eliminarlo o cambiar su ID.",
  ],
  MEDIA_NOT_READY: [
    "This video is still being converted (or could not be). Approve it once it plays here.",
    "Este video todavía se está convirtiendo (o no se pudo convertir). Apruébalo cuando se reproduzca aquí.",
  ],
  // Admin only: the thank-you email links /thank-you/, which stays unlinked
  // until it has a thanks note or highlight video.
  THANK_YOU_PAGE_EMPTY: [
    "The thank-you page is still empty. Add the thanks note or highlight video to site/content.mjs and publish the site first; then this email can link to it.",
    "La página de agradecimiento todavía está vacía. Agrega la nota de agradecimiento o el video en site/content.mjs y publica el sitio primero; después este correo podrá enlazarla.",
  ],
  OWNER_REQUIRED: [
    "Only the site owner can do this.",
    "Solo el propietario del sitio puede hacer esto.",
  ],
  MFA_SETUP_NOT_ALLOWED: [
    "Your administrator access hasn't been switched on yet. Please ask Saul or Diana to turn it on, then sign in again.",
    "Tu acceso de administrador aún no está activado. Pide a Saul o a Diana que lo activen y vuelve a entrar.",
  ],
  ADMIN_NOT_ALLOWED: [
    "This account isn't an administrator. If you're expecting access, please contact Saul or Diana.",
    "Esta cuenta no es de administrador. Si esperas tener acceso, comunícate con Saul o Diana.",
  ],
  ADMIN_NOT_ELIGIBLE: [
    "This account isn't an administrator. If you're expecting access, please contact Saul or Diana.",
    "Esta cuenta no es de administrador. Si esperas tener acceso, comunícate con Saul o Diana.",
  ],
  ADMIN_SIGN_IN_PAUSED: [
    "Too many wrong authenticator codes. Administrator sign-in is paused for an hour; the family has been told.",
    "Demasiados códigos incorrectos. El acceso de administrador está en pausa por una hora; se avisó a la familia.",
  ],
  ADMIN_SETUP_BY_EMAIL: [
    "Your first sign-in as an administrator uses the emailed link. Request it above, then set up your authenticator; Google or Microsoft work after that.",
    "Tu primer acceso como administrador usa el enlace por correo. Solicítalo arriba y configura tu autenticador; después funcionan Google o Microsoft.",
  ],
  MFA_REQUIRED: [
    "Set up your own authenticator first by signing out and signing in again.",
    "Primero configura tu autenticador: cierra sesión y vuelve a entrar.",
  ],
  NOT_AN_ADMINISTRATOR: [
    "That email is not a family administrator. Grant administration first, or check the email.",
    "Ese correo no es de un administrador. Otorga la administración primero o revisa el correo.",
  ],
  ALREADY_RESPONDED: [
    "This household has already answered, so this email was set aside.",
    "Esta familia ya respondió, así que este correo se apartó.",
  ],
  MAIL_DRAFT_STALE: [
    "This invitation or recipient changed. Create and review a new email draft.",
    "La invitación o el destinatario cambió. Crea y revisa un nuevo borrador.",
  ],
  MAIL_NOT_CONFIGURED: [
    "Email sending is not configured yet. The draft is saved.",
    "El envío de correo aún no está configurado. El borrador está guardado.",
  ],
  MAIL_ALREADY_ATTEMPTED: [
    "This message was already attempted. Check its status and Microsoft Sent Items before sending another.",
    "Ya se intentó enviar este mensaje. Revisa su estado y los elementos enviados de Microsoft antes de enviar otro.",
  ],
  PRIVATE_LINK_REQUIRED: [
    "Use the current private invitation link for this household.",
    "Usa el enlace privado vigente de esta familia.",
  ],
  INVALID_CAPACITY: [
    "Enter explicit whole-number adult and child counts, totaling 1–50. Use 0 when there are no children.",
    "Ingresa cantidades enteras de adultos y niños, con un total de 1 a 50. Usa 0 si no hay niños.",
  ],
  ALREADY_SEATED: [
    "A selected household is already assigned to another table. Remove that assignment first.",
    "Una familia ya está asignada a otra mesa. Retira esa asignación primero.",
  ],
  TABLE_OVER_CAPACITY: [
    "Those households have more guests attending dinner than this table seats. Raise the capacity or choose fewer households.",
    "Esas familias tienen más invitados en la cena de los que caben en esta mesa. Aumenta la capacidad o elige menos familias.",
  ],
  RECIPIENT_CHANGED: [
    "This household's verified email changed since the page loaded. Nothing was saved or sent; reload and check the address.",
    "El correo verificado de esta familia cambió desde que se cargó la página. No se guardó ni se envió nada; recarga y revisa la dirección.",
  ],
  EMAIL_NOT_CONFIGURED: [
    "Email isn't set up, so nothing was saved or sent. Reply without the email option.",
    "El correo no está configurado, así que no se guardó ni se envió nada. Responde sin la opción de correo.",
  ],
  INVALID_TABLE: [
    "Give the table a name and a capacity from 1 to 50.",
    "Ponle un nombre a la mesa y una capacidad de 1 a 50.",
  ],
  // Admin only.
  PARTY_CARD_OPEN: [
    "The table card is already on. Use “Make a new code” to replace it.",
    "La tarjeta de la mesa ya está activa.",
  ],
  PARTY_CARD_NOT_OPEN: [
    "The table card is off. Turn it on first.",
    "La tarjeta de la mesa está apagada.",
  ],
  INVALID_MFA: [
    "The authenticator code is invalid or already used. Try the next code.",
    "El código no es válido o ya fue utilizado. Usa el siguiente código.",
  ],
  // Publishing a note whose writer kept it for us.
  NOTE_IS_PRIVATE: [
    "The writer left the box unchecked, so this note is for Sophia and the family only and can’t be shown.",
    "Quien lo escribió no marcó la casilla, así que este mensaje es solo para Sophia y su familia y no se puede mostrar.",
  ],
  // Guests read client.js's version; administrators have more ways in.
  SSO_TENANT_NOT_ALLOWED: [
    "This school or work Microsoft account can’t sign in here. Use your simplysoph.com Microsoft 365 account, a personal Microsoft account (Outlook, Hotmail, Live), or the emailed sign-in link.",
    "Esta cuenta de Microsoft de una escuela o un trabajo no puede entrar aquí. Usa tu cuenta de Microsoft 365 de simplysoph.com, una cuenta personal de Microsoft (Outlook, Hotmail, Live) o el enlace de acceso por correo.",
  ],
};
