// notify-svc: in real life this would send emails or SMS.
// In the lab it prints JSON "receipt" lines to stdout (-> CloudWatch Logs):
//   success -> one "sent" receipt for the payer and one "received" receipt for the payee
//   failure -> one "failed" receipt for the payer
const express = require('express');

const SERVICE = 'notify-svc';
const PORT = Number(process.env.PORT || 8083);

function log(level, msg, extra = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, service: SERVICE, msg, ...extra }));
}

const naira = (kobo) => (typeof kobo === 'number' ? `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}` : undefined);

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE }));

app.post('/notify', (req, res) => {
  const { paymentId, reference, status, reason, amountKobo, note, payer = {}, payee = {} } = req.body || {};
  const common = { paymentId, reference, amount: naira(amountKobo), note: note || undefined, from: 'aricxpoint labs PayLab' };

  if (status === 'success') {
    log('info', 'receipt', { receipt: { type: 'sent', to: `@${payer.handle}`, counterparty: `@${payee.handle}`, ...common } });
    log('info', 'receipt', { receipt: { type: 'received', to: `@${payee.handle}`, counterparty: `@${payer.handle}`, ...common } });
  } else {
    log('info', 'receipt', { receipt: { type: 'failed', to: `@${payer.handle}`, counterparty: `@${payee.handle}`, reason, ...common } });
  }
  res.status(202).json({ accepted: true });
});

app.listen(PORT, () => log('info', `listening on port ${PORT}`));
