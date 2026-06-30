const { triggerCall } = require("./communicationService");

const makeCall = (to, message) => triggerCall({ to, text: message });

module.exports = { makeCall };
