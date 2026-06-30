const deviceService = require("../services/deviceService");

exports.createDevice = async (req, res) => {
  const device =
    await deviceService.createDevice(
      req.user._id,
      req.body
    );

  res.status(201).json(device);
};

exports.getMyDevices = async (
  req,
  res
) => {
  const devices =
    await deviceService.getUserDevices(
      req.user._id
    );

  res.json(devices);
};

exports.getDevice = async (
  req,
  res
) => {
  res.json(req.device);
};

exports.updateDevice = async (
  req,
  res
) => {
  const device =
    await deviceService.updateDevice(
      req.device,
      req.body
    );

  res.json(device);
};

exports.deleteDevice = async (
  req,
  res
) => {
  await deviceService.deleteDevice(
    req.device
  );

  res.json({
    message: "Device deleted",
  });
};

exports.connectDevice = async (
  req,
  res
) => {
  const device =
    await deviceService.connectDevice(
      req.device
    );

  res.json(device);
};

exports.disconnectDevice =
  async (req, res) => {
    const device =
      await deviceService.disconnectDevice(
        req.device
      );

    res.json(device);
  };

exports.updateState = async (
  req,
  res
) => {
  const device =
    await deviceService.updateDeviceState(
      req.device,
      req.body
    );

  res.json(device);
};

exports.togglePower = async (
  req,
  res
) => {
  const device =
    await deviceService.togglePower(
      req.device
    );

  res.json(device);
};