let farmerCache = [];
let currentFarmerData = null;

async function loadFarmersToCache() {
  if (!db) return;

  if (navigator.onLine) {
    try {
      const { data } = await client.from('farmers').select('*').order('farmer_id');
      if (data && data.length > 0) {
        farmerCache = data;
        const tx = db.transaction('farmers', 'readwrite');
        const store = tx.objectStore('farmers');
        data.forEach(farmer => store.put(farmer));
        console.log(`Loaded ${data.length} farmers from Supabase ✅`);
      }
    } catch (err) {
      console.error('Error loading farmers:', err);
    }
  }

  const tx = db.transaction('farmers', 'readonly');
  const store = tx.objectStore('farmers');
  const request = store.getAll();

  request.onsuccess = () => {
    if (request.result.length > 0) {
      farmerCache = request.result;
      console.log(`Loaded ${farmerCache.length} farmers from cache ✅`);
    }
  };
}

function setupFarmerAutocomplete() {
  const searchInput = document.getElementById('farmer-search');
  const suggestionsDiv = document.getElementById('farmer-suggestions');

  if (!searchInput || !suggestionsDiv) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();

    if (query.length < 1) {
      suggestionsDiv.classList.remove('show');
      suggestionsDiv.innerHTML = '';
      return;
    }

    const matches = farmerCache.filter(farmer =>
      farmer.farmer_id.toLowerCase().includes(query) ||
      farmer.name.toLowerCase().includes(query) ||
      (farmer.route && farmer.route.toLowerCase().includes(query))
    ).slice(0, 10);

    if (matches.length === 0) {
      suggestionsDiv.classList.remove('show');
      suggestionsDiv.innerHTML = '';
      return;
    }

    suggestionsDiv.innerHTML = matches.map(farmer => `
      <div class="suggestion-item" data-farmer-id="${farmer.farmer_id}">
        <div class="farmer-id">${farmer.farmer_id}</div>
        <div class="farmer-name">${farmer.name}</div>
        <div class="farmer-route">Route: ${farmer.route || 'N/A'}${farmer.route_name ? ' - ' + farmer.route_name : ''}</div>
      </div>
    `).join('');

    suggestionsDiv.classList.add('show');

    suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const farmerId = item.getAttribute('data-farmer-id');
        const farmer = farmerCache.find(f => f.farmer_id === farmerId);
        if (farmer) selectFarmer(farmer);
      });
    });
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      suggestionsDiv.classList.remove('show');
    }, 200);
  });
}

function selectFarmer(farmer) {
  currentFarmerData = farmer;

  document.getElementById('farmer-search').value = `${farmer.farmer_id} - ${farmer.name}`;
  document.getElementById('farmer-id').value = farmer.farmer_id;
  document.getElementById('farmer-name-display').value = farmer.name;
  document.getElementById('route').value = farmer.route || '';

  document.getElementById('farmer-suggestions').classList.remove('show');
  document.getElementById('farmer-suggestions').innerHTML = '';
}

window.addEventListener('load', () => {
  setTimeout(() => {
    loadFarmersToCache();
    setupFarmerAutocomplete();
  }, 500);
});
