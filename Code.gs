/**
 * Bengal Routes inquiry receiver.
 * Deploy as a Web App: Execute as ME; Who has access: ANYONE.
 * Sends every valid inquiry to m.mehrab15@gmail.com.
 */
const CONFIG = {
  TO_EMAIL: 'm.mehrab15@gmail.com',
  BRAND: 'Bengal Routes',
  // Conservative ceiling below the current consumer Gmail Apps Script quota.
  MAX_EMAILS_PER_UTC_DAY: 80,
  SAME_EMAIL_COOLDOWN_SECONDS: 600,
  MIN_FORM_AGE_MS: 2500,
  MAX_FORM_AGE_MS: 2 * 60 * 60 * 1000
};

function doGet() {
  return HtmlService.createHtmlOutput('Bengal Routes inquiry endpoint is running.');
}

function doPost(e) {
  let ok = false;
  let message = 'Sorry, we could not send your inquiry. Please try again later.';
  try {
    const p = (e && e.parameter) ? e.parameter : {};

    // Honeypot: silently reject automated submissions.
    if (String(p.website || '').trim() !== '') {
      return response_(true, 'Thank you.');
    }

    const name = clean_(p.name, 100);
    const phone = clean_(p.phone, 30);
    const email = clean_(p.email, 254).toLowerCase();
    const service = clean_(p.service, 100);
    const inquiry = clean_(p.message, 5000);
    const startedAt = Number(p.formStartedAt || 0);
    const elapsed = Date.now() - startedAt;

    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !service || inquiry.length < 5 || !Number.isFinite(elapsed) ||
        elapsed < CONFIG.MIN_FORM_AGE_MS || elapsed > CONFIG.MAX_FORM_AGE_MS) {
      throw new Error('Please check the form fields and try again.');
    }
    if (phone && !/^[+()\d .-]{5,30}$/.test(phone)) {
      throw new Error('Please enter a valid phone number.');
    }

    // Per-email cooldown plus a global daily ceiling. Lock prevents concurrent over-counting.
    const emailHash = digest_(email);
    const cache = CacheService.getScriptCache();
    const cooldownKey = 'cool_' + emailHash;
    if (cache.get(cooldownKey)) {
      throw new Error('Please wait a few minutes before sending another inquiry.');
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const props = PropertiesService.getScriptProperties();
      const day = Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd');
      const countKey = 'daily_' + day;
      const count = Number(props.getProperty(countKey) || 0);
      if (count >= CONFIG.MAX_EMAILS_PER_UTC_DAY) {
        throw new Error('The inquiry form has reached its daily limit. Please contact us by phone or WhatsApp.');
      }
      props.setProperty(countKey, String(count + 1));
      cache.put(cooldownKey, '1', CONFIG.SAME_EMAIL_COOLDOWN_SECONDS);
    } finally {
      lock.releaseLock();
    }

    const subject = 'Website Inquiry - ' + service;
    const body = [
      'New inquiry received through the Bengal Routes website.', '',
      'Name: ' + name,
      'Phone: ' + (phone || 'Not provided'),
      'Email: ' + email,
      'Service: ' + service,
      '', 'Message:', inquiry, '',
      '— Bengal Routes Website'
    ].join('\n');

    if (MailApp.getRemainingDailyQuota() < 1) {
      throw new Error('Email sending quota reached. Please contact us by phone or WhatsApp.');
    }
    MailApp.sendEmail({
      to: CONFIG.TO_EMAIL,
      replyTo: email,
      subject: subject,
      body: body,
      name: CONFIG.BRAND
    });
    ok = true;
    message = 'Thank you! Your inquiry has been sent successfully.';
  } catch (err) {
    // Do not expose internal exception details to anonymous visitors.
    message = (err && err.message && /Please |The inquiry form|Email sending quota/.test(err.message))
      ? err.message
      : 'Sorry, your inquiry could not be sent. Please try again later or contact us by phone.';
    console.error(err);
  }
  return response_(ok, message);
}

function clean_(value, maxLength) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLength);
}

function digest_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value);
  return bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

function response_(ok, message) {
  const payload = JSON.stringify({ type: 'BENGAL_ROUTES_INQUIRY', ok: ok, message: message });
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body><script>' +
    'window.top.postMessage(' + payload + ', "*");' +
    '</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
