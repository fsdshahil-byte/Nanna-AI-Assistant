const jwt = require("jsonwebtoken");

const getJwtSecret = () => process.env.JWT_SECRET || "secretkey";

const createToken = (userId) =>
  jwt.sign({ id: userId }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });

module.exports = { createToken, getJwtSecret };
