// Mobile-optimized Bluetooth scale connection helper

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Enhanced connectScale with mobile support
window.connectScaleMobile = async function() {
  const statusEl = document.getElementById("scale-status");

  try {
    const filters = [
      { namePrefix: 'HC-' },
      { namePrefix: 'BT-' },
      { namePrefix: 'Scale' },
      { namePrefix: 'Bluetooth' },
      { services: [0xFFE0] },
      { services: [0xFEE7] },
      { services: [0x1810] },
      { services: [0x181D] }
    ];

    const optionalServices = [
      0xFFE0, 0xFEE7, 0x1810, 0x181D, 0xFFF0, 0x181A,
      '0000ffe0-0000-1000-8000-00805f9b34fb',
      '0000fee7-0000-1000-8000-00805f9b34fb',
      '00001810-0000-1000-8000-00805f9b34fb',
      '0000181d-0000-1000-8000-00805f9b34fb',
      '0000fff0-0000-1000-8000-00805f9b34fb',
      '0000181a-0000-1000-8000-00805f9b34fb'
    ];

    const device = await navigator.bluetooth.requestDevice({
      filters,
      optionalServices
    });

    statusEl.textContent = `Connecting to ${device.name}...`;

    const server = await device.gatt.connect();
    const services = await server.getPrimaryServices();

    let connected = false;

    for (const service of services) {
      try {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.notify || char.properties.indicate) {
            await char.startNotifications();
            char.addEventListener('characteristicvaluechanged', handleMobileScaleData);
            statusEl.textContent = `Scale: Connected (${device.name}) ✅`;
            connected = true;
            break;
          }
        }
        if (connected) break;
      } catch (e) {
        console.log('Service check error:', e);
      }
    }

    if (!connected) {
      statusEl.textContent = 'Scale: No compatible characteristic found';
    }

  } catch (error) {
    console.error('Bluetooth connection error:', error);
    statusEl.textContent = `Scale: ${error.message}`;
  }
};

function handleMobileScaleData(event) {
  const value = event.target.value;
  let weight = null;

  const text = new TextDecoder().decode(value);
  const textMatch = text.match(/(\d+\.?\d*)/);
  if (textMatch) {
    weight = parseFloat(textMatch[1]);
  }

  if (!weight && value.byteLength >= 2) {
    const dataView = new DataView(value.buffer);
    try {
      if (value.byteLength === 2) {
        weight = dataView.getUint16(0, true) / 100;
      } else if (value.byteLength === 4) {
        weight = dataView.getFloat32(0, true);
      }
    } catch (e) {
      console.error('Parse error:', e);
    }
  }

  if (weight && weight > 0 && weight < 1000) {
    if (typeof window.currentWeight !== 'undefined') {
      window.currentWeight = weight;
    }
    document.getElementById("weight-display").innerText = `Weight: ${weight.toFixed(1)} Kg`;
    document.getElementById("manual-weight").value = weight.toFixed(1);
    if (typeof window.updateTotal === 'function') {
      window.updateTotal();
    }
  }
}
