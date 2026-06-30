const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('TELEGRAM_BOT_TOKEN loaded:', process.env.TELEGRAM_BOT_TOKEN ? 'Yes (hidden)' : 'No');
console.log('TELEGRAM_WEBHOOK_URL:', process.env.TELEGRAM_WEBHOOK_URL || 'Not set');

const { checkTelegramHealth, getTelegramWebhookInfo, setTelegramWebhook } = require('./services/communicationService');

(async () => {
  try {
    console.log('=== Telegram Bot Health Check ===\n');
    const health = await checkTelegramHealth();
    console.log('Health:', JSON.stringify(health, null, 2));
    
    console.log('\n=== Telegram Webhook Info ===\n');
    const webhook = await getTelegramWebhookInfo();
    console.log('Webhook:', JSON.stringify(webhook, null, 2));
    
    if (!webhook.webhook?.url || webhook.webhook.url === '') {
      console.log('\n=== Setting up Webhook ===\n');
      const setResult = await setTelegramWebhook();
      console.log('Setup Result:', JSON.stringify(setResult, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
})();