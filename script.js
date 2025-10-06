// --- Supabase client ---
const { createClient } = supabase;
const client = createClient(
  "https://ovcojxtwthzxopuddjst.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92Y29qeHR3dGh6eG9wdWRkanN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NTM1MjIsImV4cCI6MjA3MzUyOTUyMn0.c6EknOyljCCdRd5rO0Ff6tEnPS9NXjhWpnjiyG4WvIY"
);

let currentUser = null;
let currentWeight = 0;

// --- IndexedDB setup ---
let db;
const request = indexedDB.open("milkCollectionDB", 1);

request.onupgradeneeded = function(event) {
  db = event.target.result;

  if (!db.objectStoreNames.contains("receipts")) {
    const store = db.createObjectStore("receipts", { keyPath: "orderId" });
    store.createIndex("synced", "synced", { unique: false });
  }

  if (!db.objectStoreNames.contains("farmers")) {
    db.createObjectStore("farmers", { keyPath: "farmer_id" });
  }

  if (!db.objectStoreNames.contains("app_users")) {
    db.createObjectStore("app_users", { keyPath: "user_id" });
  }
};

request.onsuccess = function(event) {
  db = event.target.result;
  console.log("IndexedDB ready ✅");
  checkAutoLogin();
  showPendingReceipts();
  if (navigator.onLine) syncPendingMilk();
};

request.onerror = function(event) {
  console.error("IndexedDB error:", event.target.errorCode);
};

// --- Login (online/offline) ---
async function login() {
  const userId = document.getElementById("userid").value.trim();
  const password = document.getElementById("password").value.trim();
  if (!userId || !password) return alert("Enter credentials");

  if (navigator.onLine) {
    try {
      const { data } = await client
        .from("app_users")
        .select("*")
        .eq("user_id", userId)
        .eq("password", password)
        .maybeSingle();
      if (data) setLoggedInUser(data);
      else alert("Invalid credentials");
    } catch (err) {
      console.error("Login error", err);
      alert("Login failed (online)");
    }
  } else {
    const tx = db.transaction('app_users', 'readonly');
    const store = tx.objectStore('app_users');
    const requestUser = store.get(userId);
    requestUser.onsuccess = function() {
      const user = requestUser.result;
      if (user && user.password === password) setLoggedInUser(user, true);
      else alert("Invalid credentials (offline)");
    };
  }
}

function setLoggedInUser(user, offline = false) {
  currentUser = user;
  localStorage.setItem("loggedInUser", JSON.stringify(user));
  if (!offline && db) {
    const tx = db.transaction('app_users', 'readwrite');
    tx.objectStore('app_users').put(user);
  }
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "block";
  document.getElementById("user-info").innerText =
    `Logged in as ${user.user_id} (${user.role})${offline ? " [Offline]" : ""}`;
}

function checkAutoLogin() {
  const savedUser = localStorage.getItem("loggedInUser");
  if (savedUser) {
    try {
      const user = JSON.parse(savedUser);
      setLoggedInUser(user, !navigator.onLine);
    } catch (e) {
      localStorage.removeItem("loggedInUser");
    }
  }
}

// --- Logout ---
function logout() {
  currentUser = null;
  localStorage.removeItem("loggedInUser");
  document.getElementById("login-screen").style.display = "block";
  document.getElementById("app-screen").style.display = "none";
}

// --- Farmer Lookup ---
async function fetchFarmerRoute() {
  const farmerId = document.getElementById("farmer-id").value.trim();
  if (!farmerId) return;

  if (navigator.onLine) {
    try {
      const { data } = await client
        .from("farmers")
        .select("route,name,farmer_id")
        .eq("farmer_id", farmerId)
        .maybeSingle();
      if (data) {
        document.getElementById("route").value = data.route;
        document.getElementById("farmer-name").innerText =
          `Farmer: ${data.name} (Route: ${data.route})`;
        db.transaction('farmers', 'readwrite').objectStore('farmers').put(data);
      } else {
        document.getElementById("route").value = "";
        document.getElementById("farmer-name").innerText = "Farmer not found!";
      }
    } catch (err) { console.error(err); }
  } else {
    const tx = db.transaction('farmers', 'readonly');
    const store = tx.objectStore('farmers');
    const requestFarmer = store.get(farmerId);
    requestFarmer.onsuccess = function() {
      const farmer = requestFarmer.result;
      if (farmer) {
        document.getElementById("route").value = farmer.route;
        document.getElementById("farmer-name").innerText =
          `Farmer: ${farmer.name} (Route: ${farmer.route}) [Offline]`;
      } else {
        document.getElementById("route").value = "";
        document.getElementById("farmer-name").innerText = "Farmer not found (offline)";
      }
    };
  }
}

document.addEventListener("DOMContentLoaded", function() {
  document.getElementById("farmer-id").addEventListener("change", fetchFarmerRoute);
  document.getElementById("price-per-liter").addEventListener("input", updateTotal);
  document.getElementById("print-receipt-btn").onclick = printReceipt;
  document.getElementById("close-receipt-btn").onclick = closeReceipt;
  document.getElementById("modal-backdrop").addEventListener("click", closeReceipt);
});

// --- Weight Handling ---
function updateTotal() {
  const price = parseFloat(document.getElementById("price-per-liter").value) || 0;
  const total = currentWeight * price;
  document.getElementById("total-amount").innerText = `Total: ${total.toFixed(2)} Ksh`;
}

function useManualWeight() {
  const manual = parseFloat(document.getElementById("manual-weight").value);
  if (!isNaN(manual) && manual > 0) {
    currentWeight = manual;
    document.getElementById("weight-display").innerText =
      `Weight: ${manual.toFixed(1)} Kg (manual)`;
    updateTotal();
  } else alert("Enter valid weight");
}

// --- Bluetooth Scale ---
let scaleDevice, scaleCharacteristic, scaleType = "Unknown";

async function connectScale() {
  try {
    scaleDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        0xFFE0, 0xFEE7, 0x1810, 0x181D, 0xFFF0,
        '0000ffe0-0000-1000-8000-00805f9b34fb',
        '0000fee7-0000-1000-8000-00805f9b34fb',
        '00001810-0000-1000-8000-00805f9b34fb',
        '0000181d-0000-1000-8000-00805f9b34fb',
        '0000fff0-0000-1000-8000-00805f9b34fb'
      ]
    });

    const server = await scaleDevice.gatt.connect();
    scaleType = scaleDevice.name || "Generic Scale";

    const services = await server.getPrimaryServices();
    let foundCharacteristic = false;

    for (const service of services) {
      try {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.notify || char.properties.indicate) {
            scaleCharacteristic = char;
            scaleCharacteristic.addEventListener("characteristicvaluechanged", handleScaleData);
            await scaleCharacteristic.startNotifications();
            foundCharacteristic = true;
            break;
          }
        }
        if (foundCharacteristic) break;
      } catch (e) { continue; }
    }

    if (foundCharacteristic) {
      document.getElementById("scale-status").textContent = `Scale: Connected (${scaleType}) ✅`;
    } else {
      document.getElementById("scale-status").textContent = "Scale: No readable characteristic found";
    }
  } catch (err) {
    console.error(err);
    document.getElementById("scale-status").textContent = "Scale: Error / Not Connected";
  }
}

let lastScaleWeight = 0;

function handleScaleData(event) {
  const value = event.target.value;
  let parsed = null;

  const text = new TextDecoder().decode(value);
  const textMatch = text.match(/(\d+\.?\d*)/);
  if (textMatch) {
    parsed = parseFloat(textMatch[1]);
  }

  if (!parsed && value.byteLength >= 2) {
    const dataView = new DataView(value.buffer);
    try {
      if (value.byteLength === 2) {
        parsed = dataView.getUint16(0, true) / 100;
      } else if (value.byteLength === 4) {
        parsed = dataView.getFloat32(0, true);
      } else if (value.byteLength >= 6) {
        for (let i = 0; i < value.byteLength - 1; i++) {
          const weight = dataView.getUint16(i, true);
          if (weight > 0 && weight < 50000) {
            parsed = weight / 100;
            break;
          }
        }
      }
    } catch (e) { }
  }

  if (parsed && !isNaN(parsed) && parsed > 0 && parsed < 1000 && Math.abs(parsed - lastScaleWeight) > 0.05) {
    const weightDiff = parsed - lastScaleWeight;
    if (weightDiff > 0) {
      currentWeight += weightDiff;
      lastScaleWeight = parsed;
      document.getElementById("weight-display").innerText =
        `Weight: ${currentWeight.toFixed(1)} Kg (accumulated from scale: ${scaleType})`;
      updateTotal();
    }
  }
}

// --- Save Milk Collection ---
async function saveMilk() {
  const farmerId = document.getElementById("farmer-id").value.trim();
  const route = document.getElementById("route").value.trim();
  const section = document.getElementById("section").value;
  const price = parseFloat(document.getElementById("price-per-liter").value) || 0;
  const total = currentWeight * price;

  if (!farmerId || !route || !currentWeight || !section)
    return alert("Enter farmer, route, section, and weight");

  const orderId = Date.now();

  const milkData = {
    farmer_id: farmerId,
    route,
    section,
    weight: parseFloat(currentWeight.toFixed(2)),
    collected_by: currentUser ? currentUser.user_id : null,
    price_per_liter: parseFloat(price.toFixed(2)),
    total_amount: parseFloat(total.toFixed(2)),
    collection_date: new Date(),
    orderId,
    synced: false
  };

  if (db) {
    const tx = db.transaction("receipts", "readwrite");
    tx.objectStore("receipts").put(milkData);
    tx.oncomplete = () => showPendingReceipts();
  }

  if (navigator.onLine) {
    try {
      const { data, error } = await client.from("milk_collection").insert([milkData]);
      if (!error && db) {
        const txUpdate = db.transaction("receipts", "readwrite");
        txUpdate.objectStore("receipts").put({...milkData, synced: true});
        txUpdate.oncomplete = () => showPendingReceipts();
      }
    } catch (err) { console.error(err); }
  }

  updateReceiptModal(milkData);
}

// --- Sync Pending Milk Collections ---
async function syncPendingMilk() {
  if (!db || !navigator.onLine) return;

  const tx = db.transaction("receipts", "readonly");
  const store = tx.objectStore("receipts");
  const index = store.index("synced");
  const request = index.getAll();

  request.onsuccess = async () => {
    const unsynced = request.result.filter(r => !r.synced);

    for (const r of unsynced) {
      const milkData = {
        farmer_id: r.farmer_id,
        route: r.route,
        section: r.section,
        weight: r.weight,
        collected_by: r.collected_by,
        price_per_liter: r.price_per_liter,
        total_amount: r.total_amount,
        collection_date: r.collection_date
      };

      try {
        const { error } = await client.from("milk_collection").insert([milkData]);
        if (!error) {
          const txUpdate = db.transaction("receipts", "readwrite");
          txUpdate.objectStore("receipts").put({...r, synced:true});
          console.log(`Receipt for ${r.farmer_id} synced ✅`);
        }
      } catch (err) { console.error(err); }
    }

    showPendingReceipts();
  };

  request.onerror = (event) => console.error("Error syncing receipts:", event.target.error);
}

window.addEventListener("online", () => {
  console.log("Back online. Syncing pending milk collections...");
  syncPendingMilk();
});

// --- Pending Receipts UI ---
function showPendingReceipts() {
  if (!db) return;
  const list = document.getElementById("pending-list");
  if (!list) return;
  list.innerHTML = "";

  const tx = db.transaction("receipts", "readonly");
  const store = tx.objectStore("receipts");
  const index = store.index("synced");
  const request = index.getAll();

  request.onsuccess = () => {
    request.result
      .filter(r => !r.synced)
      .forEach(r => {
        const li = document.createElement("li");
        li.textContent = `Farmer: ${r.farmer_id} (${r.total_amount} Ksh) ⚠️ Pending Sync`;
        list.appendChild(li);
      });
  };

  request.onerror = (event) => console.error("Error loading pending receipts:", event.target.error);
}

// --- Receipt Modal ---
function updateReceiptModal(receiptData) {
  const receiptItems = document.getElementById("receipt-items");
  receiptItems.innerHTML = `
    <tr><th>Farmer</th><td>${receiptData.farmer_id}</td></tr>
    <tr><th>Route</th><td>${receiptData.route}</td></tr>
    <tr><th>Section</th><td>${receiptData.section}</td></tr>
    <tr><th>Weight</th><td>${receiptData.weight} Kg</td></tr>
    <tr><th>Rate</th><td>Ksh ${receiptData.price_per_liter}</td></tr>
    <tr><th>Total</th><td>Ksh ${receiptData.total_amount}</td></tr>
    <tr><th>Collector</th><td>${receiptData.collected_by}</td></tr>
    <tr><th>Status</th><td>${receiptData.synced ? "Synced ✅" : "Pending ⚠️"}</td></tr>
  `;
  document.getElementById("receipt-subtotal").textContent = `Ksh ${receiptData.total_amount}`;
  document.getElementById("receipt-total").textContent = `Ksh ${receiptData.total_amount}`;
  document.getElementById("receipt-modal").classList.remove("hidden");
  document.getElementById("modal-backdrop").classList.add("visible");
}

function printReceipt() {
  setTimeout(() => window.print(), 100);
}

function closeReceipt() {
  document.getElementById("receipt-modal").classList.add("hidden");
  document.getElementById("modal-backdrop").classList.remove("visible");
}
