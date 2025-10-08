let collectionLog = [];

function generateFileName(extension) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const userName = currentUser ? currentUser.name.replace(/\s+/g, '_') : 'UNKNOWN';
  return `Milk_Collection_${userName}_${dateStr}_${timeStr}.${extension}`;
}

function logCollection(receiptData) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    receipt_id: receiptData.orderId,
    farmer_id: receiptData.farmer_id,
    farmer_name: receiptData.farmer_name || 'N/A',
    route: receiptData.route,
    section: receiptData.section,
    weight: receiptData.weight,
    price_per_liter: receiptData.price_per_liter,
    total_amount: receiptData.total_amount,
    collected_by: receiptData.collected_by,
    clerk_name: currentUser ? currentUser.name : 'N/A',
    synced: receiptData.synced || false
  };

  collectionLog.push(logEntry);

  if (db) {
    const tx = db.transaction('receipts', 'readwrite');
    const store = tx.objectStore('receipts');
    store.put(receiptData);
  }

  console.log('Collection logged:', logEntry);
}

function generateTextReport() {
  if (collectionLog.length === 0) {
    alert('No collections to export');
    return;
  }

  let text = '='.repeat(60) + '\n';
  text += 'BUURI DAIRY F.C.S LTD\n';
  text += 'MILK COLLECTION REPORT\n';
  text += '='.repeat(60) + '\n\n';
  text += `Generated: ${new Date().toLocaleString()}\n`;
  text += `Clerk: ${currentUser ? currentUser.name : 'N/A'}\n`;
  text += `Total Collections: ${collectionLog.length}\n\n`;

  let totalWeight = 0;
  let totalAmount = 0;

  collectionLog.forEach((entry, index) => {
    text += '-'.repeat(60) + '\n';
    text += `Collection #${index + 1}\n`;
    text += `Time: ${new Date(entry.timestamp).toLocaleString()}\n`;
    text += `Farmer ID: ${entry.farmer_id}\n`;
    text += `Farmer Name: ${entry.farmer_name}\n`;
    text += `Route: ${entry.route}\n`;
    text += `Section: ${entry.section}\n`;
    text += `Weight: ${entry.weight} Kg\n`;
    text += `Rate: Ksh ${entry.price_per_liter}/liter\n`;
    text += `Total: Ksh ${entry.total_amount}\n`;
    text += `Status: ${entry.synced ? 'Synced ✓' : 'Pending'}\n`;

    totalWeight += parseFloat(entry.weight);
    totalAmount += parseFloat(entry.total_amount);
  });

  text += '\n' + '='.repeat(60) + '\n';
  text += 'SUMMARY\n';
  text += '='.repeat(60) + '\n';
  text += `Total Weight: ${totalWeight.toFixed(2)} Kg\n`;
  text += `Total Amount: Ksh ${totalAmount.toFixed(2)}\n`;
  text += `Average per Collection: ${(totalWeight / collectionLog.length).toFixed(2)} Kg\n`;
  text += '='.repeat(60) + '\n';

  downloadFile(text, generateFileName('txt'), 'text/plain');
}

function generateCSVReport() {
  if (collectionLog.length === 0) {
    alert('No collections to export');
    return;
  }

  let csv = 'Timestamp,Receipt ID,Farmer ID,Farmer Name,Route,Section,Weight (Kg),Rate,Total Amount,Collected By,Synced\n';

  collectionLog.forEach(entry => {
    csv += `"${entry.timestamp}","${entry.receipt_id}","${entry.farmer_id}","${entry.farmer_name}","${entry.route}","${entry.section}",${entry.weight},${entry.price_per_liter},${entry.total_amount},"${entry.clerk_name}",${entry.synced ? 'Yes' : 'No'}\n`;
  });

  downloadFile(csv, generateFileName('csv'), 'text/csv');
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  alert(`File generated: ${filename}`);
}

function autoSaveCollections() {
  if (collectionLog.length > 0 && collectionLog.length % 5 === 0) {
    const autoBackup = {
      generated: new Date().toISOString(),
      clerk: currentUser ? currentUser.name : 'N/A',
      collections: collectionLog
    };

    localStorage.setItem('collectionBackup', JSON.stringify(autoBackup));
    console.log(`Auto-backup saved: ${collectionLog.length} collections`);
  }
}

window.addEventListener('beforeunload', () => {
  if (collectionLog.length > 0) {
    const backup = {
      generated: new Date().toISOString(),
      clerk: currentUser ? currentUser.name : 'N/A',
      collections: collectionLog
    };
    localStorage.setItem('collectionBackup', JSON.stringify(backup));
  }
});

window.addEventListener('load', () => {
  const backup = localStorage.getItem('collectionBackup');
  if (backup) {
    const data = JSON.parse(backup);
    if (data.collections && data.collections.length > 0) {
      console.log(`Restored ${data.collections.length} collections from backup`);
      collectionLog = data.collections;
    }
  }
});
