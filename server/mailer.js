const MAILEROO_KEY = process.env.MAILEROO_API_KEY;
const MAILEROO_FROM = process.env.MAILEROO_FROM;

function buildHtml(todos, dateStr) {
  const grouped = { university: [], private: [], future: [] };
  todos.forEach(t => { if (grouped[t.list_type]) grouped[t.list_type].push(t); });

  const section = (label, color, items) => {
    if (!items.length) return '';
    const rows = items.map(t => `
      <div style="background:#f4f4f6;border-radius:8px;padding:10px 14px;margin-bottom:6px">
        <div style="font-size:14px;font-weight:500;color:#18181b">${t.title}</div>
        ${t.description ? `<div style="font-size:12px;color:#a1a1aa;margin-top:3px">${t.description}</div>` : ''}
      </div>`).join('');
    return `
      <div style="margin-bottom:24px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:${color};margin-bottom:10px">${label}</div>
        ${rows}
      </div>`;
  };

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f8f8fa">
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7">
      <div style="background:#6366f1;padding:28px 32px">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#c7d2fe;margin-bottom:6px">Daily Summary</div>
        <div style="font-size:22px;font-weight:600;color:#ffffff">${dateStr}</div>
        <div style="font-size:13px;color:#c7d2fe;margin-top:4px">${todos.length} task${todos.length !== 1 ? 's' : ''} completed today</div>
      </div>
      <div style="padding:28px 32px">
        ${section('University', '#6366f1', grouped.university)}
        ${section('Private', '#10b981', grouped.private)}
        ${section('Future', '#f59e0b', grouped.future)}
        <div style="border-top:1px solid #f4f4f6;margin-top:8px;padding-top:20px;font-size:11px;color:#d4d4d8;text-align:center">
          Uni Planner · You can manage email preferences in Account Settings
        </div>
      </div>
    </div>
  </body></html>`;
}

async function sendDailySummary(toEmail, todos, dateStr) {
  if (!MAILEROO_KEY || !MAILEROO_FROM) {
    throw new Error('MAILEROO_API_KEY and MAILEROO_FROM env vars are required');
  }
  const res = await fetch('https://smtp.maileroo.com/api/v2/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MAILEROO_KEY}`,
    },
    body: JSON.stringify({
      from: { address: MAILEROO_FROM },
      to: [{ address: toEmail }],
      subject: `Your daily summary – ${dateStr}`,
      html: buildHtml(todos, dateStr),
    }),
  });
  if (!res.ok) {
    throw new Error(`Maileroo ${res.status}: ${await res.text()}`);
  }
}

module.exports = { sendDailySummary };
