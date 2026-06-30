const Skill = require("../models/Skill");

const findMatchingSkill = async ({ userId, message }) => {
  const skills = await Skill.find({ user: userId, enabled: true });
  const text = message.toLowerCase();

  return skills.find((skill) =>
    skill.triggerPhrases.some((phrase) => text.includes(phrase.toLowerCase()))
  );
};

const runSkill = async ({ skill, message }) => {
  if (!skill) return null;

  if (!skill.endpoint) {
    return {
      skill,
      response: `${skill.name} skill matched. Add an endpoint to execute external API logic.`,
      data: {},
    };
  }

  try {
    const response = await fetch(skill.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, skill: skill.manifest }),
    });
    const data = await response.json().catch(() => ({}));
    return {
      skill,
      response: data.reply || `${skill.name} completed.`,
      data,
    };
  } catch (error) {
    return {
      skill,
      response: `${skill.name} is installed, but its endpoint is unavailable.`,
      data: { error: error.message },
    };
  }
};

module.exports = { findMatchingSkill, runSkill };
