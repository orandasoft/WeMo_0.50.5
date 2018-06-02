//
// Copyright (c) 2018 Paul Spee 
//

'use strict';

const neeoapi = require('neeo-sdk');

// The NEEO WeMO driver is using the WeMo client by Timon Reinhart
// https://github.com/timonreinhard/wemo-client
// To install WeMo Client package: npm install wemo-client
// The WeMo Client package is governed by the MIT license

var Wemo = require('wemo-client');
var wemo = new Wemo();

let discoveredWeMoDevices = []; // Array of all discovered WeMo devices
let wemoClients = []; // List of WeMo clients for each WeMo device associated with a MAC address
// These are the registered function for device state updates
let sendLComponentUpdate;
let sendIComponentUpdate;
let sendMComponentUpdate;

//Controller
const controller = {
  discoverWeMoLightSwitch: function discoverWeMoLightSwitch() {
    return discoverWeMoDevicesByType(Wemo.DEVICE_TYPE.LightSwitch);
  },

  discoverWeMoInsight: function discoverWeMoInsight() {
    return discoverWeMoDevicesByType(Wemo.DEVICE_TYPE.Insight);
  },

  discoverWeMoMotion: function discoverWeMoMotion() {
    return discoverWeMoDevicesByType(Wemo.DEVICE_TYPE.Motion);
  },

  onButtonPressed: function onButtonPressed(name, deviceid) {
    let client = clientByDeviceId(deviceid);
    switch (name) {
      case "POWER ON":
        client.setBinaryState(1);
        break;
      case "POWER OFF":
        client.setBinaryState(0);
        break;
    }
  },

  switchSet: function switchSet(deviceid, value) {
    let client = clientByDeviceId(deviceid);
    console.log('[CONTROLLER].switchSet', deviceid, value);
    client.setBinaryState(value === true ? 1 : 0)
  },

  switchGet: function switchGet(deviceid) {
    let client = clientByDeviceId(deviceid);
    return new Promise((resolve, reject) => {
      client.getBinaryState(function(err, value) {
        resolve(value === '0' ? false : true); // Insight returns 8
      });
    });
  },

  sensorGet: function sensorGet(deviceid) {
    console.log("sensorGet ", deviceid);
    let client = clientByDeviceId(deviceid);
    return new Promise((resolve, reject) => {
      client.getBinaryState(function(err, value) {
        resolve(value);
      });
    });
  },

  registerLStateUpdateCallback: function registerLStateUpdateCallback(updateFunction, optionalCallbackFunctions) {
    sendLComponentUpdate = updateFunction;
  },

  registerIStateUpdateCallback: function registerIStateUpdateCallback(updateFunction, optionalCallbackFunctions) {
    sendIComponentUpdate = updateFunction;
  },

  registerMStateUpdateCallback: function registerMStateUpdateCallback(updateFunction, optionalCallbackFunctions) {
    sendMComponentUpdate = updateFunction;
  }
};

// Common discovery function
function discoverWeMoDevicesByType(type) {
  console.log('[CONTROLLER] WeMo %s discovery started', type);
  wemo.discover(foundWeMoDevice);
  let discoveredDevices = discoveredWeMoDevices.filter((dev) => dev.deviceType === type);
  return discoveredDevices.map((dev) => ({
    id: dev.macAddress,
    name: dev.friendlyName,
    reachable: true,
  }));
}

function clientByDeviceId(deviceid) {
  let client = wemoClients[deviceid];
  if (!client) {
    // If we haven't created a WeMo client yet, create one here
    let devices = discoveredWeMoDevices.filter((dev) => dev.macAddress == deviceid);
    if (devices.length !== 0) {
      let device = devices[0];
      client = wemoClients[device.macAddress] = wemo.client(device); 
      // You definitely want to listen to error events (e.g. device went offline),
      // Node will throw them as an exception if they are left unhandled  
      client.on('error', function(err) {
        console.log('WeMo Device Error: %s', err.code, deviceid);
      });
      // Handle BinaryState events
      client.on('binaryState', function(value) {
        binaryStatusWeMoDevice(value, device.macAddress, device.deviceType);
      });
      // Handle events from WeMo Insight
      client.on('insightParams', function(binaryState, instantPower, data) {
        insightParamsWeMoDevice(instantPower, device.macAddress, device.deviceType);
      });
    }
  }
  return client;
}
// Create devices

const discoveryInstructionsLightSwitch = {
  headerText: 'Belkin WeMo Discovery', 
  description: 'Press NEXT to discover Belkin WeMo LightSwitches' 
};

const WeMoLightSwitch = neeoapi.buildDevice('WeMo LightSwitch')
  .setManufacturer('Belkin')
  .addAdditionalSearchToken('wemo')
  .setType('LIGHT')
  // Dynamically discover the WeMo devices on the network
  .enableDiscovery(discoveryInstructionsLightSwitch, controller.discoverWeMoLightSwitch)
  // Allow the driver to register the functions to call the SDK with notifications
  .registerSubscriptionFunction(controller.registerLStateUpdateCallback)
  // Add POWER ON and OFF comands to be used as shortcuts or in Recipes
  .addButton({ name: 'POWER ON', label: 'Power On' })
  .addButton({ name: 'POWER OFF', label: 'Power Off' })
  .addButtonHandler(controller.onButtonPressed)
  // A device of type LIGHT will create a page which will be empty unless a switch is added
  .addSwitch({ name: 'wemoLSwitch', label: 'Power' },
  { setter: controller.switchSet, getter: controller.switchGet } )
;

const discoveryInstructionsInsight = { 
  headerText: 'Belkin WeMo Discovery', 
  description: 'Press NEXT to discover Belkin WeMo Insight Switches'
};

const WeMoInsight = neeoapi.buildDevice('WeMo Insight')
  .setManufacturer('Belkin')
  .addAdditionalSearchToken('wemo')
  .setType('LIGHT')
  // Dynamically discover the WeMo devices on the network
  .enableDiscovery(discoveryInstructionsInsight, controller.discoverWeMoInsight)
  // Allow the driver to register the functions to call the SDK with notifications
  .registerSubscriptionFunction(controller.registerIStateUpdateCallback)
  // Add POWER ON and OFF comands to be used as shortcuts or in Recipes
  .addButton({ name: 'POWER ON', label: 'Power On' })
  .addButton({ name: 'POWER OFF', label: 'Power Off' })
  .addButtonHandler(controller.onButtonPressed)
  // A device of type LIGHT will create a page which will be empty unless a switch is added
  .addSwitch({ name: 'wemoISwitch', label: 'Power' },
  { setter: controller.switchSet, getter: controller.switchGet } )
  .addSensor({ name: 'wemoIPower', label: 'Consumption', range: [0, 2000], unit: 'mW'},
  { getter: controller.sensorGet })
;

const discoveryInstructionsMotion = {
  headerText: 'Belkin WeMo Discovery', 
  description: 'Press NEXT to discover Belkin WeMo Motion Sensors'
};

const WeMoMotion = neeoapi.buildDevice('WeMo Motion')
  .setManufacturer('Belkin')
  .addAdditionalSearchToken('wemo')
  .setType('ACCESSORY')
  // Dynamically discover the WeMo devices on the network
  .enableDiscovery(discoveryInstructionsMotion, controller.discoverWeMoMotion)
  // Allow the driver to register the functions to call the SDK with notifications
  .registerSubscriptionFunction(controller.registerMStateUpdateCallback)
  .addSensor({ name: 'wemoMotion', label: 'Motion', range: [0, 1], unit: ''},
  { getter: controller.sensorGet })
;

// function binaryStatusWeMoDevice() is called by the WeMo client to report a status change
function binaryStatusWeMoDevice(val, deviceid, devicetype) {
  switch (devicetype) {
    case Wemo.DEVICE_TYPE.LightSwitch:
      if (sendLComponentUpdate) {
        let bool = val === '0' ? false : true;
        console.log('sendComponentUpdate', deviceid, devicetype, bool);
        sendLComponentUpdate({uniqueDeviceId: deviceid, component: 'wemoLSwitch', value: bool})
        .catch((error) => {
          const level = (error.message === 'DUPLICATE_MESSAGE'
            || error.message.startsWith('COMPONENTNAME_NOT_FOUND')) ? 'silly' : 'warn';
          console.log('[CONTROLLER] Sending notification to brain failed:', deviceid, error.message);
        });
      }
      break;
    case Wemo.DEVICE_TYPE.Insight:
      if (sendIComponentUpdate) {
        let bool = val === '0' ? false : true;
        console.log('sendComponentUpdate', deviceid, devicetype, bool);
        sendIComponentUpdate({uniqueDeviceId: deviceid, component: 'wemoISwitch', value: bool})
        .catch((error) => {
          const level = (error.message === 'DUPLICATE_MESSAGE'
            || error.message.startsWith('COMPONENTNAME_NOT_FOUND')) ? 'silly' : 'warn';
          console.log('[CONTROLLER] Sending notification to brain failed:', deviceid, error.message);
        });
      }
      break;
  }
}

// function insightParamsWeMoDevice() is called when a WeMo Insight switch reports power consumption
// the reporting seems to be quite frequently and may cause a heavy load on the Brain
function insightParamsWeMoDevice(val, deviceid, devicetype) {
  // don't really need the device type; we know it is a WeMo Insight Switch
  console.log('insightParamsWeMoDevice: sendComponentUpdate', deviceid, devicetype, val);
  sendIComponentUpdate({uniqueDeviceId: deviceid, component: 'wemoIPower', value: val})
  .catch((error) => {
    const level = (error.message === 'DUPLICATE_MESSAGE'
      || error.message.startsWith('COMPONENTNAME_NOT_FOUND')) ? 'silly' : 'warn';
    console.log('[CONTROLLER] Sending notification to brain failed:', deviceid, error.message);
  });
}

// function foundWeMoDevice() called by wemo.discover() when a WeMo device is found
function foundWeMoDevice(err, device) {
  let wemoDevice = discoveredWeMoDevices.filter((dev) => dev.macAddress == device.macAddress);
  if (wemoDevice.length === 0) {
    console.log('will add new wemo to discovered devices', device.macAddress, device.deviceType);
    discoveredWeMoDevices.push(device);
  }
}

wemo.discover(foundWeMoDevice);

// export the WeMo device
module.exports = [ WeMoLightSwitch, WeMoInsight, WeMoMotion ];
