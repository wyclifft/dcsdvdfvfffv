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

request.onupgradeneeded = function (event) {
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

request.onsuccess = function (event) {
  db = event.target.result;
  console.log("IndexedDB ready ✅");
  showPendingReceipts();
  if (navigator.onLine) {
    syncPendingMilk();
    syncFarmersToLocal();
  }
  subscribeToFarmerUpdates();
};

request.onerror = function (event) {
  console.error("IndexedDB error:", event.target.errorCode);
};

// --- Farmer Search and Autocomplete (Online + Offline) ---
const farmerSearchInput = document.getElementById("farmer-search");
const farmerSuggestions = document.getElementById("farmer-suggestions");

farmerSearchInput.addEventListener("input", async () => {
  const query = farmerSearchInput.value.trim().toLowerCase();
  farmerSuggestions.innerHTML = "";
  if (query.length < 2) return;

  if (navigator.onLine) {
    // --- Online search from Supabase ---
    try {
      const { data, error } = await client
        .from("farmers")
        .select("farmer_id, name, route")
        .or(`farmer_id.ilike.%${query}%,name.ilike.%${query}%`)
        .limit(10);

      if (error) throw error;
      displayFarmerSuggestions(data);
    } catch (err) {
      console.error("Farmer search error:", err);
    }
  } else {
    // --- Offline search from IndexedDB ---
    const tx = db.transaction("farmers", "readonly");
    const store = tx.objectStore("farmers");
    const req = store.getAll();
    req.onsuccess = function () {
      const farmers = req.result.filter(
        (f) =>
          f.farmer_id.toLowerCase().includes(query) ||
          f.name.toLowerCase().includes(query)
      );
      displayFarmerSuggestions(farmers);
    };
  }
});

function displayFarmerSuggestions(farmers) {
  farmerSuggestions.innerHTML = "";
  farmers.forEach((f) => {
    const div = document.createElement("div");
    div.classList.add("suggestion-item");
    div.textContent = `${f.name} (${f.farmer_id}) - ${f.route}`;
    div.onclick = () => selectFarmer(f);
    farmerSuggestions.appendChild(div);
  });
}

function selectFarmer(farmer) {
  document.getElementById("farmer-id").value = farmer.farmer_id;
  document.getElementById("farmer-name-display").value = farmer.name;
  document.getElementById("route").value = farmer.route;
  farmerSearchInput.value = `${farmer.name}`;
  farmerSuggestions.innerHTML = "";
  console.log("✅ Farmer selected:", farmer.name);
}

// --- Sync all farmers to local DB ---
async function syncFarmersToLocal() {
  try {
    console.log("🔁 Syncing farmers...");
    const { data, error } = await client.from("farmers").select("*");
    if (error) throw error;

    const tx = db.transaction("farmers", "readwrite");
    const store = tx.objectStore("farmers");
    data.forEach((f) => store.put(f));
    console.log(`✅ Synced ${data.length} farmers locally`);
  } catch (err) {
    console.error("Farmer sync error:", err);
  }
}

window.addEventListener("online", syncFarmersToLocal);

// --- Realtime farmer updates ---
function subscribeToFarmerUpdates() {
  if (!client || !client.channel) return;
  console.log("📡 Listening for farmer table changes...");

  client
    .channel("farmers-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "farmers" },
      (payload) => {
        const farmer = payload.new || payload.old;
        if (farmer && db) {
          const tx = db.transaction("farmers", "readwrite");
          const store = tx.objectStore("farmers");
          if (payload.eventType === "DELETE") {
            store.delete(farmer.farmer_id);
          } else {
            store.put(farmer);
          }
          console.log(`✅ Local farmers updated (${payload.eventType}): ${farmer.name}`);
        }
      }
    )
    .subscribe();
}

// --- Login (online/offline) ---
async function login() {
  const userId = document.getElementById("userid").value.trim();
  const password = document.getElementById("password").value.trim();
  if (!userId || !password) return alert("Enter credentials");

  if (!db) {
    alert("Local database not ready yet. Please wait a second and try again.");
    return;
  }

  if (navigator.onLine) {
    try {
      const { data, error } = await client
        .from("app_users")
        .select("*")
        .eq("user_id", userId)
        .eq("password", password)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // ✅ Save user for offline login
        const tx = db.transaction("app_users", "readwrite");
        const store = tx.objectStore("app_users");
        store.put({ ...data, password }); // ensure password is saved
        tx.oncomplete = () => console.log(`✅ User ${userId} saved locally`);

        setLoggedInUser(data);
      } else {
        alert("Invalid credentials");
      }
    } catch (err) {
      console.error("Login error", err);
      alert("Login failed (online)");
    }
  } else {
    console.log("🔒 Offline login attempt...");
    try {
      const tx = db.transaction("app_users", "readonly");
      const store = tx.objectStore("app_users");
      const req = store.get(userId);
      req.onsuccess = () => {
        const user = req.result;
        if (!user) return alert("No saved user found for offline login.");
        if (user.password === password) {
          console.log("✅ Offline login success:", user.user_id);
          setLoggedInUser(user, true);
        } else {
          alert("Invalid credentials (offline)");
        }
      };
      req.onerror = (e) => {
        console.error("Offline login error:", e);
        alert("Offline login failed");
      };
    } catch (err) {
      console.error("Offline login error:", err);
      alert("Offline login failed");
    }
  }
}


function setLoggedInUser(user, offline = false) {
  currentUser = user;
  localStorage.setItem("loggedInUser", JSON.stringify(user));
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "block";
  document.getElementById(
    "user-info"
  ).innerText = `Logged in as ${user.user_id} (${user.role})${
    offline ? " [Offline]" : ""
  }`;
}

function logout() {
  currentUser = null;
  localStorage.removeItem("loggedInUser");
  document.getElementById("login-screen").style.display = "block";
  document.getElementById("app-screen").style.display = "none";
}

// --- Fetch farmer details automatically ---
async function fetchFarmerRoute() {
  const farmerId = document.getElementById("farmer-id").value.trim();
  if (!farmerId) return;

  if (navigator.onLine) {
    const { data, error } = await client
      .from("farmers")
      .select("farmer_id, name, route")
      .eq("farmer_id", farmerId)
      .maybeSingle();

    if (error) return console.error("Fetch error:", error);

    if (data) {
      document.getElementById("farmer-id").value = data.farmer_id;
      document.getElementById("farmer-name-display").value = data.name;
      document.getElementById("route").value = data.route;

      const tx = db.transaction("farmers", "readwrite");
      tx.objectStore("farmers").put(data);
    }
  } else {
    const tx = db.transaction("farmers", "readonly");
    const store = tx.objectStore("farmers");
    const req = store.get(farmerId);
    req.onsuccess = () => {
      const farmer = req.result;
      if (farmer) {
        document.getElementById("farmer-name-display").value = farmer.name;
        document.getElementById("route").value = farmer.route;
      }
    };
  }
}

// --- DOM bindings ---
document.addEventListener("DOMContentLoaded", function () {
  document
    .getElementById("farmer-id")
    .addEventListener("change", fetchFarmerRoute);
  document
    .getElementById("price-per-liter")
    .addEventListener("input", updateTotal);
  document.getElementById("print-receipt-btn").onclick = printReceipt;
  document.getElementById("close-receipt-btn").onclick = closeReceipt;
  document
    .getElementById("modal-backdrop")
    .addEventListener("click", closeReceipt);
});

// --- Weight Handling ---
function updateTotal() {
  const price = parseFloat(document.getElementById("price-per-liter").value) || 0;
  const total = currentWeight * price;
  document.getElementById(
    "total-amount"
  ).innerText = `Total: ${total.toFixed(2)} Ksh`;
}

function useManualWeight() {
  const manual = parseFloat(document.getElementById("manual-weight").value);
  if (!isNaN(manual) && manual > 0) {
    currentWeight = manual;
    document.getElementById(
      "weight-display"
    ).innerText = `Weight: ${manual.toFixed(1)} Kg (manual)`;
    updateTotal();
  } else alert("Enter valid weight");
}

// --- Bluetooth Scale ---
let scaleDevice,
  scaleCharacteristic,
  scaleType = "Unknown";

async function connectScale() {
  try {
    scaleDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [0xFFE0, 0xFEE7],
    });

    const server = await scaleDevice.gatt.connect();
    let service;
    try {
      service = await server.getPrimaryService(0xFFE0);
      scaleType = "HC-05";
    } catch {
      service = await server.getPrimaryService(0xFEE7);
      scaleType = "HM-10";
    }

    const characteristics = await service.getCharacteristics();
    scaleCharacteristic = characteristics[0];
    scaleCharacteristic.addEventListener(
      "characteristicvaluechanged",
      handleScaleData
    );
    await scaleCharacteristic.startNotifications();

    document.getElementById(
      "scale-status"
    ).textContent = `Scale: Connected (${scaleType}) ✅`;
  } catch (err) {
    console.error(err);
    document.getElementById("scale-status").textContent =
      "Scale: Error / Not Connected";
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
      document.getElementById(
        "weight-display"
      ).innerText = `Weight: ${parsed.toFixed(1)} Kg (scale: ${scaleType})`;
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
    synced: false,
  };

  if (db) {
    const tx = db.transaction("receipts", "readwrite");
    tx.objectStore("receipts").put(milkData);
    tx.oncomplete = () => showPendingReceipts();
  }

  if (navigator.onLine) {
    try {
      const { data, error } = await client
        .from("milk_collection")
        .insert([milkData]);
      if (!error && db) {
        const txUpdate = db.transaction("receipts", "readwrite");
        txUpdate.objectStore("receipts").put({ ...milkData, synced: true });
        txUpdate.oncomplete = () => showPendingReceipts();
      }
    } catch (err) {
      console.error(err);
    }
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
    const unsynced = request.result.filter((r) => !r.synced);

    for (const r of unsynced) {
      const milkData = {
        farmer_id: r.farmer_id,
        route: r.route,
        section: r.section,
        weight: r.weight,
        collected_by: r.collected_by,
        price_per_liter: r.price_per_liter,
        total_amount: r.total_amount,
        collection_date: r.collection_date,
      };

      try {
        const { error } = await client
          .from("milk_collection")
          .insert([milkData]);
        if (!error) {
          const txUpdate = db.transaction("receipts", "readwrite");
          txUpdate.objectStore("receipts").put({ ...r, synced: true });
          console.log(`Receipt for ${r.farmer_id} synced ✅`);
        }
      } catch (err) {
        console.error(err);
      }
    }

    showPendingReceipts();
  };

  request.onerror = (event) =>
    console.error("Error syncing receipts:", event.target.error);
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
      .filter((r) => !r.synced)
      .forEach((r) => {
        const li = document.createElement("li");
        li.textContent = `Farmer: ${r.farmer_id} (${r.total_amount} Ksh) ⚠️ Pending Sync`;
        list.appendChild(li);
      });
  };

  request.onerror = (event) =>
    console.error("Error loading pending receipts:", event.target.error);
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
