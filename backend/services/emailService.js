const { sendEmail: sendSharedEmail } = require("./communicationService");

const sendEmail = async (to, subject, message, attachments = []) => {
  return sendSharedEmail({
    to,
    subject,
    text: message,
    attachments,
  });
};

module.exports = { sendEmail };
