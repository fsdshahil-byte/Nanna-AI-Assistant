const { sendSms } = require("./communicationService");

const sendSMS = (to, message) => sendSms({ to, text: message });

module.exports = { sendSMS };
