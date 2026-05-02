const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const APP_URL = process.env.CORS_ORIGIN || 'https://planner.daten-tresor.synology.me/';

const CATEGORY = {
  university: { color: '#6366f1', bg: '#eef2ff', label: 'University' },
  private:    { color: '#059669', bg: '#ecfdf5', label: 'Private' },
  future:     { color: '#d97706', bg: '#fffbeb', label: 'Future' },
};

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badge(listType) {
  const c = CATEGORY[listType] || CATEGORY.future;
  return `<span style="font-family:'DM Sans',-apple-system,sans-serif;font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${c.color};background:${c.bg};border-radius:20px;padding:2px 8px;white-space:nowrap;">${c.label}</span>`;
}

function timePill(approxTime) {
  if (!approxTime) return '';
  return `<span style="font-family:'DM Sans',-apple-system,sans-serif;font-size:9px;font-weight:500;color:#a1a1aa;background:#f4f4f5;border-radius:20px;padding:2px 8px;white-space:nowrap;">${esc(approxTime)}</span>`;
}

function taskCard(t, opts) {
  const { cardBg, cardBorder, checkboxHtml, titleColor } = opts;
  const timeHtml = timePill(t.approx_time);
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;background:${cardBg};border-radius:8px;border:1px solid ${cardBorder};">
      <tr>
        <td style="padding:10px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align:top;width:18px;padding-right:10px;padding-top:2px;" rowspan="2">
                ${checkboxHtml}
              </td>
              <td style="vertical-align:middle;padding-bottom:5px;">
                ${badge(t.list_type)}${timeHtml ? `&nbsp;&nbsp;${timeHtml}` : ''}
              </td>
            </tr>
            <tr>
              <td style="vertical-align:top;">
                <span style="font-family:'DM Sans',-apple-system,sans-serif;font-size:12px;font-weight:500;color:${titleColor};letter-spacing:-0.01em;line-height:1.4;">${esc(t.title)}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function completedTaskRow(t) {
  return taskCard(t, {
    cardBg: '#ffffff',
    cardBorder: '#f0f0f5',
    checkboxHtml: `<div style="width:14px;height:14px;background:#6366f1;border-radius:4px;text-align:center;line-height:14px;font-size:0;"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 13l4 4L19 7'/%3E%3C/svg%3E" width="9" height="9" style="display:inline-block;vertical-align:middle;" /></div>`,
    titleColor: '#a0a0b8',
  });
}

function uncompletedTaskRow(t) {
  return taskCard(t, {
    cardBg: '#fffafa',
    cardBorder: '#fdeaea',
    checkboxHtml: `<div style="width:14px;height:14px;border:1.5px solid #f9c0c8;border-radius:4px;background:#fff;"></div>`,
    titleColor: '#11112a',
  });
}

function tomorrowTaskRow(t) {
  return taskCard(t, {
    cardBg: '#ffffff',
    cardBorder: '#f0f0f5',
    checkboxHtml: `<div style="width:14px;height:14px;border:1.5px solid #d4d4d8;border-radius:4px;background:#ffffff;"></div>`,
    titleColor: '#11112a',
  });
}

function buildHtml({ completedTodos, uncompletedTodos, tomorrowTodos, dateStr, tomorrowStr, userName, hour }) {
  const completed = completedTodos.length;
  const uncompleted = uncompletedTodos.length;

  const variant = completed === 0 ? 'notasks'
    : completed > uncompleted   ? 'productive'
    : 'unproductive';

  const subtitle = variant === 'productive'
    ? 'Here are all the tasks you completed today. Looks like you had a productive day!'
    : variant === 'unproductive'
    ? "Here are all the tasks you completed today. Looks like you weren't as productive as planned."
    : "You didn't check off any tasks today. Maybe you took a well deserved day off!";

  const greeting = (hour >= 5 && hour < 12) ? 'Good morning'
    : (hour >= 12 && hour < 17) ? 'Good afternoon'
    : 'Good evening';

  const completedSection = variant !== 'notasks' ? `
    <tr>
      <td style="padding:28px 36px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding-bottom:14px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:8px;">
                    <div style="width:20px;height:20px;background:#edfaf4;border-radius:50%;display:inline-block;vertical-align:middle;text-align:center;line-height:20px;font-size:0;">
                      <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2322c27b' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 13l4 4L19 7'/%3E%3C/svg%3E" width="12" height="12" style="display:inline-block;vertical-align:middle;" />
                    </div>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-family:'DM Sans',-apple-system,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#22c27b;">Completed today</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        ${completedTodos.map(completedTaskRow).join('')}
      </td>
    </tr>` : '';

  const divider1 = variant !== 'notasks' ? `
    <tr>
      <td style="padding:24px 36px 0;">
        <div style="height:1px;background:#f0f0f5;"></div>
      </td>
    </tr>` : '';

  const uncompletedSection = variant !== 'notasks' ? `
    <tr>
      <td style="padding:24px 36px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding-bottom:14px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:8px;">
                    <div style="width:20px;height:20px;background:#fff4f4;border-radius:50%;display:inline-block;vertical-align:middle;text-align:center;line-height:20px;font-size:0;">
                      <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23f43f5e'%3E%3Crect x='10.5' y='4' width='3' height='10' rx='1.5'/%3E%3Crect x='10.5' y='17' width='3' height='3' rx='1.5'/%3E%3C/svg%3E" width="10" height="10" style="display:inline-block;vertical-align:middle;" />
                    </div>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-family:'DM Sans',-apple-system,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#f43f5e;">Not completed today</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        ${uncompleted > 0 ? uncompletedTodos.map(uncompletedTaskRow).join('') : `<p style="margin:0;font-family:'DM Sans',-apple-system,sans-serif;font-size:13px;color:#aaaabc;">Everything done!</p>`}
      </td>
    </tr>` : '';

  const noTasksSection = variant === 'notasks' ? `
    <tr>
      <td style="padding:32px 36px ${uncompleted > 0 ? '0' : '28px'};text-align:center;">
        <div style="width:48px;height:48px;background:#f4f4f8;border-radius:50%;margin:0 auto 14px;text-align:center;line-height:48px;font-size:24px;">&#128566;</div>
        <p style="margin:0;font-family:'DM Sans',-apple-system,sans-serif;font-size:15px;font-weight:600;color:#11112a;letter-spacing:-0.02em;">No tasks completed today</p>
        <p style="margin:6px 0 0;font-family:'DM Sans',-apple-system,sans-serif;font-size:13px;color:#9090b0;">That&#39;s okay &#8212; tomorrow is a fresh start.</p>
      </td>
    </tr>` : '';

  const noTasksUncompletedSection = variant === 'notasks' && uncompleted > 0 ? `
    <tr>
      <td style="padding:24px 36px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding-bottom:14px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:8px;">
                    <div style="width:20px;height:20px;background:#fff4f4;border-radius:50%;display:inline-block;vertical-align:middle;text-align:center;line-height:20px;font-size:0;">
                      <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23f43f5e'%3E%3Crect x='10.5' y='4' width='3' height='10' rx='1.5'/%3E%3Crect x='10.5' y='17' width='3' height='3' rx='1.5'/%3E%3C/svg%3E" width="10" height="10" style="display:inline-block;vertical-align:middle;" />
                    </div>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-family:'DM Sans',-apple-system,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#f43f5e;">Not completed today</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        ${uncompletedTodos.map(uncompletedTaskRow).join('')}
      </td>
    </tr>` : '';

  const tomorrowSection = tomorrowTodos.length > 0 ? `
    <tr>
      <td style="padding:24px 36px 0;">
        <div style="height:1px;background:#f0f0f5;"></div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 36px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding-bottom:14px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:8px;">
                    <div style="width:20px;height:20px;background:#eef0ff;border-radius:50%;display:inline-block;vertical-align:middle;text-align:center;line-height:20px;font-size:0;">
                      <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='5' y1='12' x2='19' y2='12'/%3E%3Cpolyline points='12 5 19 12 12 19'/%3E%3C/svg%3E" width="12" height="12" style="display:inline-block;vertical-align:middle;" />
                    </div>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-family:'DM Sans',-apple-system,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6366f1;">Coming up &middot; ${esc(tomorrowStr)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        ${tomorrowTodos.map(tomorrowTaskRow).join('')}
      </td>
    </tr>` : '<tr><td style="padding-bottom:28px;"></td></tr>';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Uni Planner &middot; Daily Summary</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    body { margin:0; padding:0; background-color:#ffffff; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
    @media only screen and (max-width:600px) {
      .email-wrapper { width:100% !important; }
      .email-body { padding:0 12px !important; }
      .task-card { padding:12px 14px !important; }
      .header-pad { padding:28px 20px 24px !important; }
      .footer-pad { padding:20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" class="email-wrapper" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(15,15,40,0.08);">

          <!-- HEADER -->
          <tr>
            <td class="header-pad" style="padding:36px 36px 28px;border-bottom:1px solid #f0f0f5;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align:middle;width:32px;">
                          <div style="width:32px;height:32px;font-size:0;line-height:0;">
                            <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%236366f1'/%3E%3Cg transform='translate(6%2C6) scale(0.833)'%3E%3Cpath d='M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' stroke='white' stroke-width='2.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/g%3E%3C/svg%3E" width="32" height="32" style="display:block;border-radius:8px;" />
                          </div>
                        </td>
                        <td style="vertical-align:middle;padding-left:10px;">
                          <span style="font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;color:#11112a;letter-spacing:-0.02em;">Uni Planner</span>
                        </td>
                        <td align="right" style="vertical-align:middle;white-space:nowrap;">
                          <span style="font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;font-weight:500;color:#aaaabc;letter-spacing:0.08em;text-transform:uppercase;">Daily Summary</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:20px;">
                    <p style="margin:0;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:22px;font-weight:600;color:#11112a;letter-spacing:-0.03em;line-height:1.2;">${greeting}, ${esc(userName)} &#128075;</p>
                    <p style="margin:6px 0 0;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#8888a4;font-weight:400;">${esc(subtitle)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="width:33.3%;padding-right:5px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f8fc;border-radius:10px;">
                            <tr>
                              <td style="padding:14px 0;text-align:center;">
                                <p style="margin:0;font-family:'DM Sans',-apple-system,sans-serif;font-size:22px;font-weight:700;color:#6366f1;letter-spacing:-0.03em;">${completed}</p>
                                <p style="margin:3px 0 0;font-family:'DM Sans',-apple-system,sans-serif;font-size:11px;color:#9090b0;font-weight:500;">Completed</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td style="width:33.3%;padding-right:5px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff4f4;border-radius:10px;">
                            <tr>
                              <td style="padding:14px 0;text-align:center;">
                                <p style="margin:0;font-family:'DM Sans',-apple-system,sans-serif;font-size:22px;font-weight:700;color:#f43f5e;letter-spacing:-0.03em;">${uncompleted}</p>
                                <p style="margin:3px 0 0;font-family:'DM Sans',-apple-system,sans-serif;font-size:11px;color:#9090b0;font-weight:500;">Still open</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td style="width:33.3%;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f8fc;border-radius:10px;">
                            <tr>
                              <td style="padding:14px 0;text-align:center;">
                                <p style="margin:0;font-family:'DM Sans',-apple-system,sans-serif;font-size:22px;font-weight:700;color:#11112a;letter-spacing:-0.03em;">${tomorrowTodos.length}</p>
                                <p style="margin:3px 0 0;font-family:'DM Sans',-apple-system,sans-serif;font-size:11px;color:#9090b0;font-weight:500;">Due tomorrow</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${completedSection}
          ${divider1}
          ${uncompletedSection}
          ${noTasksSection}
          ${noTasksUncompletedSection}
          ${tomorrowSection}

          <!-- CTA -->
          <tr>
            <td style="padding:0 36px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#6366f1;border-radius:8px;">
                    <a href="${APP_URL}" style="display:inline-block;padding:11px 22px;font-family:'DM Sans',-apple-system,sans-serif;font-size:13px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:-0.01em;">Open Uni Planner &#8594;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td class="footer-pad" style="padding:20px 36px 28px;border-top:1px solid #e8e8f0;background:#ffffff;">
              <p style="margin:0;font-family:'DM Sans',-apple-system,sans-serif;font-size:11px;color:#aaaabc;line-height:1.6;">
                This summary was sent automatically by Uni Planner at ${esc(dateStr.split(' at ')[1] || dateStr)}.<br />
                You can manage email preferences in Account Settings.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

async function sendDailySummary(toEmail, { completedTodos, uncompletedTodos, tomorrowTodos, dateStr, tomorrowStr, userName, hour }) {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD env vars are required');
  }
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  await transporter.sendMail({
    from: `"Uni Planner" <${GMAIL_USER}>`,
    to: toEmail,
    subject: `Your daily summary – ${dateStr}`,
    html: buildHtml({ completedTodos, uncompletedTodos, tomorrowTodos, dateStr, tomorrowStr, userName, hour }),
  });
}

module.exports = { sendDailySummary };
