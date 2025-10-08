// --- Supabase client ---
const { createClient } = supabase;
const client = createClient(
  "https://nzwmiuntcrjntnopargu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56d21pdW50Y3JqbnRub3Bhcmd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3OTQ0NjcsImV4cCI6MjA3NTM3MDQ2N30.SRNF3UcUeuwgxzKu3JP0zsJzJD77LkQyJG5hm0iDlGQ"
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
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "block";
  document.getElementById("user-info").innerText =
    `Logged in as ${user.user_id} (${user.role})${offline ? " [Offline]" : ""}`;
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
        document.getElementById("route").value = data.route || "";
        document.getElementById("farmer-name").innerText =
          `Farmer: ${data.name} (Route: ${data.route})`;

        // ✅ Fix: ensure farmer_id exists before inserting
        data.farmer_id = data.farmer_id || farmerId;

        const tx = db.transaction("farmers", "readwrite");
        const store = tx.objectStore("farmers");
        store.put(data);
      } else {
        document.getElementById("route").value = "";
        document.getElementById("farmer-name").innerText = "Farmer not found!";
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }
  } else {
    const tx = db.transaction("farmers", "readonly");
    const store = tx.objectStore("farmers");
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
      optionalServices: [0xFFE0, 0xFEE7]
    });

    const server = await scaleDevice.gatt.connect();
    let service;
    try { service = await server.getPrimaryService(0xFFE0); scaleType="HC-05"; }
    catch { service = await server.getPrimaryService(0xFEE7); scaleType="HM-10"; }

    const characteristics = await service.getCharacteristics();
    scaleCharacteristic = characteristics[0];
    scaleCharacteristic.addEventListener("characteristicvaluechanged", handleScaleData);
    await scaleCharacteristic.startNotifications();

    document.getElementById("scale-status").textContent = `Scale: Connected (${scaleType}) ✅`;
  } catch (err) {
    console.error(err);
    document.getElementById("scale-status").textContent = "Scale: Error / Not Connected";
  }
}

function handleScaleData(event) {
  const text = new TextDecoder().decode(event.target.value);
  const match = text.match(/(\d+\.\d+)/);
  if (match) {
    const parsed = parseFloat(match[1]);
    if (!isNaN(parsed) && Math.abs(parsed - currentWeight) > 0.05) {
      currentWeight = parsed;
      document.getElementById("manual-weight").value = parsed.toFixed(1);
      document.getElementById("weight-display").innerText =
        `Weight: ${parsed.toFixed(1)} Kg (scale: ${scaleType})`;
      updateTotal();
    }
  }
}

// --- Save Milk Collection ---
async function saveMilk() {
  const farmerId = document.getElementById("farmer-id").value.trim();
  const farmerName = document.getElementById("farmer-name-display").value.trim();
  const route = document.getElementById("route").value.trim();
  const section = document.getElementById("section").value;
  const price = parseFloat(document.getElementById("price-per-liter").value) || 0;
  const total = currentWeight * price;

  if (!farmerId || !route || !currentWeight || !section)
    return alert("Enter farmer, route, section, and weight");

  const orderId = Date.now();
  const now = new Date();
  const referenceNo = `AG${now.toISOString().slice(0, 10).replace(/-/g, '')}${Math.floor(Math.random() * 10000)}`;

  const milkData = {
    reference_no: referenceNo,
    farmer_id: farmerId,
    farmer_name: farmerName || 'N/A',
    route,
    route_name: currentFarmerData ? currentFarmerData.route_name : 'N/A',
    member_route: currentFarmerData ? currentFarmerData.member_route : 'N/A',
    section,
    weight: parseFloat(currentWeight.toFixed(2)),
    collected_by: currentUser ? currentUser.user_id : null,
    clerk_name: currentUser ? currentUser.name : 'N/A',
    price_per_liter: parseFloat(price.toFixed(2)),
    total_amount: parseFloat(total.toFixed(2)),
    collection_date: now.toISOString(),
    orderId,
    synced: false
  };

  if (db) {
    const tx = db.transaction("receipts", "readwrite");
    tx.objectStore("receipts").put(milkData);
    tx.oncomplete = () => showPendingReceipts();
  }

  if (typeof logCollection === 'function') {
    logCollection(milkData);
    autoSaveCollections();
  }

  if (navigator.onLine) {
    try {
      const { data, error } = await client.from("milk_collection").insert([{
        reference_no: milkData.reference_no,
        farmer_id: milkData.farmer_id,
        farmer_name: milkData.farmer_name,
        route: milkData.route,
        route_name: milkData.route_name,
        member_route: milkData.member_route,
        section: milkData.section,
        weight: milkData.weight,
        collected_by: milkData.collected_by,
        clerk_name: milkData.clerk_name,
        price_per_liter: milkData.price_per_liter,
        total_amount: milkData.total_amount,
        collection_date: milkData.collection_date
      }]);

      if (!error && db) {
        const txUpdate = db.transaction("receipts", "readwrite");
        txUpdate.objectStore("receipts").put({...milkData, synced: true});
        txUpdate.oncomplete = () => showPendingReceipts();
        console.log('Collection synced to Supabase ✅');
      } else if (error) {
        console.error('Supabase insert error:', error);
      }
    } catch (err) {
      console.error('Save to Supabase error:', err);
    }
  }

  updateReceiptModal(milkData);
  clearForm();
}

function clearForm() {
  document.getElementById("farmer-search").value = "";
  document.getElementById("farmer-id").value = "";
  document.getElementById("farmer-name-display").value = "";
  document.getElementById("route").value = "";
  document.getElementById("section").value = "";
  document.getElementById("manual-weight").value = "";
  currentWeight = 0;
  document.getElementById("weight-display").innerText = "Weight: 0 Kg";
  updateTotal();
}

// --- Sync Pending Milk Collections ---
async function syncPendingMilk() {
  if (!db || !navigator.onLine) {
    alert('Cannot sync: You are offline');
    return;
  }

  const tx = db.transaction("receipts", "readonly");
  const store = tx.objectStore("receipts");
  const index = store.index("synced");
  const request = index.getAll();

  request.onsuccess = async () => {
    const unsynced = request.result.filter(r => !r.synced);

    if (unsynced.length === 0) {
      alert('No pending receipts to sync');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const r of unsynced) {
      const milkData = {
        reference_no: r.reference_no,
        farmer_id: r.farmer_id,
        farmer_name: r.farmer_name || 'N/A',
        route: r.route,
        route_name: r.route_name || 'N/A',
        member_route: r.member_route || 'N/A',
        section: r.section,
        weight: r.weight,
        collected_by: r.collected_by,
        clerk_name: r.clerk_name || 'N/A',
        price_per_liter: r.price_per_liter,
        total_amount: r.total_amount,
        collection_date: r.collection_date
      };

      try {
        const { error } = await client.from("milk_collection").insert([milkData]);
        if (!error) {
          const txUpdate = db.transaction("receipts", "readwrite");
          txUpdate.objectStore("receipts").put({...r, synced:true});
          console.log(`Receipt ${r.reference_no} synced ✅`);
          successCount++;
        } else {
          console.error('Sync error:', error);
          failCount++;
        }
      } catch (err) {
        console.error('Sync exception:', err);
        failCount++;
      }
    }

    showPendingReceipts();
    alert(`Sync complete!\nSuccess: ${successCount}\nFailed: ${failCount}`);
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
  const request = store.getAll();

  request.onsuccess = () => {
    const pending = request.result.filter(r => !r.synced);
    const synced = request.result.filter(r => r.synced);

    if (pending.length > 0) {
      const pendingHeader = document.createElement("li");
      pendingHeader.innerHTML = `<strong>⚠️ Pending Sync (${pending.length})</strong>`;
      pendingHeader.style.background = "#fef3c7";
      pendingHeader.style.borderLeft = "4px solid #f59e0b";
      list.appendChild(pendingHeader);

      pending.forEach(r => {
        const li = document.createElement("li");
        li.innerHTML = `
          <div>${r.farmer_id} - ${r.farmer_name}</div>
          <div style="font-size: 0.85rem; color: #666;">
            ${r.weight} Kg | Ksh ${r.total_amount} | ${r.section}
          </div>
        `;
        li.style.cursor = "pointer";
        li.onclick = () => updateReceiptModal(r);
        list.appendChild(li);
      });
    }

    if (synced.length > 0) {
      const syncedHeader = document.createElement("li");
      syncedHeader.innerHTML = `<strong>✅ Synced (${synced.length})</strong>`;
      syncedHeader.style.background = "#d1fae5";
      syncedHeader.style.borderLeft = "4px solid #10b981";
      syncedHeader.style.marginTop = "0.5rem";
      list.appendChild(syncedHeader);

      synced.slice(0, 5).forEach(r => {
        const li = document.createElement("li");
        li.innerHTML = `
          <div>${r.farmer_id} - ${r.farmer_name}</div>
          <div style="font-size: 0.85rem; color: #666;">
            ${r.weight} Kg | Ksh ${r.total_amount} | ${r.section}
          </div>
        `;
        li.style.cursor = "pointer";
        li.style.background = "#f0fdf4";
        li.onclick = () => updateReceiptModal(r);
        list.appendChild(li);
      });
    }

    if (pending.length === 0 && synced.length === 0) {
      const emptyMsg = document.createElement("li");
      emptyMsg.textContent = "No collections yet";
      emptyMsg.style.textAlign = "center";
      emptyMsg.style.color = "#999";
      list.appendChild(emptyMsg);
    }
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
