/**
 * Bengal Routes – inquiry form handler (Google Apps Script Web App)
 * Sends each website inquiry to the owner's Gmail. Free, no backend needed.
 */

// ====== SETTINGS ======
var RECIPIENT_EMAIL = 'bengal.routes@gmail.com'; // where inquiries are delivered
var SITE_NAME       = 'Bengal Routes';
var SEND_AUTOREPLY  = true;   // send a short "we received your inquiry" email to the visitor
var MIN_FILL_SECONDS = 3;     // forms submitted faster than this are treated as bots
var MAX_PER_HOUR     = 30;    // global safety limit to prevent spam floods

// ====== ENTRY POINTS ======
function doGet() {
  return ContentService.createTextOutput('Bengal Routes inquiry endpoint is running.');
}

function doPost(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};

    // 1. Honeypot: bots fill this hidden field
    if (clean_(p.website, 200)) {
      return respond_(true, 'Thank you!'); // pretend success, silently drop
    }

    // 2. Too-fast submission check
    var started = parseInt(p.formStartedAt, 10);
    if (started && (Date.now() - started) / 1000 < MIN_FILL_SECONDS) {
      return respond_(false, 'Please take a moment to complete the form and try again.');
    }

    // 3. Read & validate fields
    var name    = clean_(p.name, 100);
    var phone   = clean_(p.phone, 30);
    var email   = clean_(p.email, 254);
    var service = clean_(p.service, 100) || 'Not specified';
    var message = String(p.message || '').trim().slice(0, 5000);

    if (!name || !email || !message) {
      return respond_(false, 'Please fill in your name, email and message.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond_(false, 'Please enter a valid email address.');
    }

    // 4. Global hourly rate limit
    if (!withinRateLimit_()) {
      return respond_(false, 'We are receiving many requests right now. Please call or WhatsApp us instead.');
    }

    // 5. Send the email to the owner
    var subject = '[' + SITE_NAME + '] New inquiry: ' + service + ' – ' + name;
    var timestamp = Utilities.formatDate(new Date(), 'Asia/Dhaka', 'dd MMM yyyy, hh:mm a') + ' (Dhaka)';

    var plain =
      'New website inquiry\n' +
      '-------------------------\n' +
      'Name: ' + name + '\n' +
      'Email: ' + email + '\n' +
      'Phone: ' + (phone || '-') + '\n' +
      'Service: ' + service + '\n' +
      'Received: ' + timestamp + '\n\n' +
      'Message:\n' + message + '\n';

    var html =
      '<div style="font-family:Arial,sans-serif;font-size:14px;color:#17324f;max-width:600px">' +
      '<h2 style="color:#092d63;margin:0 0 12px">New website inquiry</h2>' +
      '<table style="border-collapse:collapse;width:100%">' +
      row_('Name', esc_(name)) +
      row_('Email', '<a href="mailto:' + esc_(email) + '">' + esc_(email) + '</a>') +
      row_('Phone', esc_(phone) || '-') +
      row_('Service', esc_(service)) +
      row_('Received', esc_(timestamp)) +
      '</table>' +
      '<h3 style="color:#092d63;margin:18px 0 6px">Message</h3>' +
      '<div style="background:#f4f8fc;padding:12px;border-radius:8px;white-space:pre-wrap">' + esc_(message) + '</div>' +
      '<p style="color:#61748a;font-size:12px;margin-top:16px">Reply to this email to respond directly to the sender.</p>' +
      '</div>';

    MailApp.sendEmail({
      to: RECIPIENT_EMAIL,
      subject: subject,
      body: plain,
      htmlBody: html,
      replyTo: email,
      name: SITE_NAME + ' Website'
    });

    // 6. Optional auto-reply to the visitor
    if (SEND_AUTOREPLY) {
      try {
        MailApp.sendEmail({
          to: email,
          subject: 'We received your inquiry – ' + SITE_NAME,
          body:
            'Hello ' + name + ',\n\n' +
            'Thank you for contacting ' + SITE_NAME + '. We have received your inquiry about "' + service +
            '" and will get back to you soon.\n\n' +
            'For urgent matters, call or WhatsApp us at +880 1711-078943.\n\n' +
            'Warm regards,\n' + SITE_NAME + '\nChattogram, Bangladesh\nwww.bengalroutes.com',
          name: SITE_NAME,
          replyTo: RECIPIENT_EMAIL
        });
      } catch (err) { /* ignore autoreply failures */ }
    }

    return respond_(true, 'Thank you!');
  } catch (err) {
    console.error(err);
    return respond_(false, 'Sorry, your inquiry could not be sent. Please try again later.');
  }
}

// ====== HELPERS ======
// Returns a tiny page that reports the result to the website via postMessage.
function respond_(ok, message) {
  var payload = JSON.stringify({ type: 'BENGAL_ROUTES_INQUIRY', ok: ok, message: message });
  var page =
    '<!doctype html><html><body><script>' +
    'var d=' + payload + ';' +
    'try{window.top.postMessage(d,"*");}catch(e){}' +
    'try{window.parent.postMessage(d,"*");}catch(e){}' +
    '</script></body></html>';
  return HtmlService.createHtmlOutput(page);
}

// Trim, remove line breaks (prevents header injection), limit length.
function clean_(v, max) {
  return String(v || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function row_(label, value) {
  return '<tr><td style="padding:6px 10px;border:1px solid #e2eaf2;background:#f4f8fc;width:110px"><b>' +
    label + '</b></td><td style="padding:6px 10px;border:1px solid #e2eaf2">' + value + '</td></tr>';
}

function withinRateLimit_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var cache = CacheService.getScriptCache();
    var count = parseInt(cache.get('hourCount') || '0', 10);
    if (count >= MAX_PER_HOUR) return false;
    cache.put('hourCount', String(count + 1), 3600);
    return true;
  } finally {
    lock.releaseLock();
  }
}

// Run this once manually from the editor to authorize email permission and test.
function testSend() {
  MailApp.sendEmail(RECIPIENT_EMAIL, 'Bengal Routes test', 'The inquiry script is authorized and working.');
}
