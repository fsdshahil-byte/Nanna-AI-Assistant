const express = require("express");
const {
  findUserByEmail,
  findUserByPhone,
  handleInboundMessage,
  handleMissedCall,
} = require("../services/inboundCommunicationService");

const router = express.Router();

router.post("/sms", async (req, res) => {
  try {
    const from = req.body.From || req.body.from || req.body.phone;
    const message = req.body.Body || req.body.body || req.body.message || req.body.text;
    const user = await findUserByPhone(from);
    const result = await handleInboundMessage({ channel: "sms", user, from, message });
    res.status(200).json(result);
  } catch (error) {
    console.error("SMS inbound failed:", error);
    res.status(500).json({ message: "SMS inbound handling failed." });
  }
});

router.post("/email", async (req, res) => {
  try {
    const event = req.body;
    if (event.type !== "email.received") {
      return res.status(200).json({ ignored: true });
    }

    const data = event.data;
    const from = data.from;
    const to = data.to?.[0];
    const subject = data.subject || "";
    const message = "User replied via email";
    const user = await findUserByEmail(to);

    const result = await handleInboundMessage({
      channel: "email",
      user,
      from,
      subject,
      message,
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("Email inbound failed:", error);
    res.status(500).json({ message: "Email inbound handling failed." });
  }
});

router.post("/call", async (req, res) => {
  try {
    const from = req.body.From || req.body.from || req.body.phone;
    const user = await findUserByPhone(req.body.To || req.body.userPhone || req.body.to || from);
    const result = await handleMissedCall({ user, from });
    res.status(200).json(result);
  } catch (error) {
    console.error("Call inbound failed:", error);
    res.status(500).json({ message: "Call inbound handling failed." });
  }
});

module.exports = router;
