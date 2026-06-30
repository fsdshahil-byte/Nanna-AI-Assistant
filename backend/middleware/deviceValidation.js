const { body, param, validationResult } = require("express-validator");

const validate = (rules) => async (req, res, next) => {
  await Promise.all(rules.map((rule) => rule.run(req)));
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  next();
};

const deviceRules = [
  body("name")
    .notEmpty().withMessage("Device name is required")
    .trim(),
  body("type")
    .optional()
    .isIn(["light", "fan", "ac", "tv", "camera", "speaker", "custom"])
    .withMessage("Invalid device type"),
  body("room")
    .optional().trim(),
  body("protocol")
    .optional()
    .isIn(["virtual", "rest", "home_assistant", "mqtt", "bluetooth", "matter", "tasmota", "websocket"])
    .withMessage("Invalid protocol"),
  body("endpoint")
    .optional({ checkFalsy: true })
    .isURL({ require_tld: false, require_protocol: true })
    .withMessage("endpoint must be a valid URL, e.g. http://192.168.1.50"),
  body("haEntityId")
    .optional().trim(),
];

const commandRules = [
  body("deviceName")
    .notEmpty().trim().withMessage("deviceName is required"),
  body("command")
    .isIn(["on", "off", "turn_on", "turn_off", "brightness", "temperature", "volume"])
    .withMessage("Invalid command"),
  body("value")
    .optional().isNumeric().withMessage("value must be numeric"),
];

const mongoIdRule = [
  param("id").isMongoId().withMessage("Invalid device ID"),
];

module.exports = { validate, deviceRules, commandRules, mongoIdRule };