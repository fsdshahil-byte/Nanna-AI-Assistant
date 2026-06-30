const SmartDevice = require("../models/SmartDevice");
const { emitDeviceAdded, emitDeviceUpdated } = require("./realtimeService");

const createDevice = async (userId, data) => {
  const device = await SmartDevice.create({
    ...data,
    user: userId,
  });
  
  // Emit real-time event
  emitDeviceAdded(device);
  
  return device;
};

const getUserDevices = async (userId) => {
  return SmartDevice.find({ user: userId });
};

const getDeviceById = async (device) => {
  return device;
};

const updateDevice = async (device, updates) => {
  Object.assign(device, updates);
  const updated = await device.save();
  
  // Emit real-time event
  emitDeviceUpdated(updated);
  
  return updated;
};

const deleteDevice = async (device) => {
  await device.deleteOne();
};

const connectDevice = async (device) => {
  device.connectionStatus = "connected";
  return device.save();
};

const disconnectDevice = async (device) => {
  device.connectionStatus = "disconnected";
  return device.save();
};

const updateDeviceState = async (device, state) => {
  Object.assign(device.state, state);
  device.markModified("state");
  
  const updated = await device.save();
  
  // Emit real-time event
  emitDeviceUpdated(updated);
  
  return updated;
};

const togglePower = async (device) => {
  device.state.power = !device.state.power;
  
  const updated = await device.save();
  
  // Emit real-time event
  emitDeviceUpdated(updated);
  
  return updated;
};

module.exports = {
  createDevice,
  getUserDevices,
  getDeviceById,
  updateDevice,
  deleteDevice,
  connectDevice,
  disconnectDevice,
  updateDeviceState,
  togglePower,
};