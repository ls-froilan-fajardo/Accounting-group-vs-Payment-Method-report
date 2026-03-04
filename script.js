document.addEventListener('DOMContentLoaded', () => {
    // Modal Selectors
    const helpBtn = document.getElementById('helpBtn');
    const helpModal = document.getElementById('helpModal');
    const closeHelp = document.getElementById('closeHelp');

    // Modal Events
    if (helpBtn) helpBtn.onclick = () => helpModal.classList.remove('hidden');
    if (closeHelp) closeHelp.onclick = () => helpModal.classList.add('hidden');

    // Data Selectors
    const csv1Input = document.getElementById('csv1');
    const csv2Input = document.getElementById('csv2');
    const groupSelect = document.getElementById('groupFilter');
    const methodSelect = document.getElementById('methodFilter');
    
    const salesContainer = document.getElementById('salesTable');
    const paymentsContainer = document.getElementById('paymentsTable');
    const matchedContainer = document.getElementById('matchedTable');
    const itemsContainer = document.getElementById('itemsTable');

    let txData = [];
    let pyData = [];

    const cleanName = (str) => {
        if (!str) return "";
        return str.replace(/\s*\(.*?\)/g, '').trim();
    };

    const parseFile = (file) => {
        return new Promise((resolve, reject) => {
            Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r) => resolve(r.data), error: (e) => reject(e) });
        });
    };

    async function handleInteraction(e) {
        if (e.target.type === 'file') {
            if (csv1Input.files[0] && csv2Input.files[0]) {
                try {
                    const [t, p] = await Promise.all([
                        parseFile(csv1Input.files[0]),
                        parseFile(csv2Input.files[0])
                    ]);
                    txData = t;
                    pyData = p;
                    updateFilterMenus();
                    updateDashboard();
                } catch (err) { console.error("Parse Error", err); }
            }
        } else {
            updateDashboard();
        }
    }

    function updateFilterMenus() {
        const groups = [...new Set(txData.map(r => cleanName(r.Group)))].filter(n => n).sort();
        groupSelect.innerHTML = '<option value="all">All Groups</option>' + 
            groups.map(g => `<option value="${g}">${g}</option>`).join('');

        const methods = [...new Set(pyData.map(r => cleanName(r.Method)))].filter(n => n).sort();
        methodSelect.innerHTML = '<option value="all">All Methods</option>' + 
            methods.map(m => `<option value="${m}">${m}</option>`).join('');
    }

    function updateDashboard() {
        if (txData.length === 0 || pyData.length === 0) return;

        const selGroup = groupSelect.value;
        const selMethod = methodSelect.value;

        // 1. Sales (Aggregated)
        const salesMap = new Map();
        let salesTotal = 0;
        txData.forEach(r => {
            if (selGroup !== 'all' && cleanName(r.Group) !== selGroup) return;
            const acc = (r.Account || "").trim();
            if (!acc) return;
            const p = parseFloat(String(r.FinalPrice || "0").replace(/[^\d.-]/g, '')) || 0;
            salesMap.set(acc, (salesMap.get(acc) || 0) + p);
            salesTotal += p;
        });

        // 2. Payments (Aggregated)
        const paymentsMap = new Map();
        let pyTotal = 0;
        pyData.forEach(r => {
            if (selMethod !== 'all' && cleanName(r.Method) !== selMethod) return;
            const acc = (r.Account || "").trim();
            if (!acc) return;
            const p = parseFloat(String(r.FinalPrice || r.Amount || "0").replace(/[^\d.-]/g, '')) || 0;
            paymentsMap.set(acc, (paymentsMap.get(acc) || 0) + p);
            pyTotal += p;
        });

        // 3. Matched
        const matchedMap = new Map();
        let matchedTotal = 0;
        salesMap.forEach((p, acc) => {
            if (paymentsMap.has(acc)) {
                matchedMap.set(acc, p);
                matchedTotal += p;
            }
        });

        // 4. Items (Aggregated)
        const matchedAccounts = new Set(matchedMap.keys());
        const itemCounts = new Map();
        let totalQty = 0;
        txData.forEach(r => {
            const acc = (r.Account || "").trim();
            if (matchedAccounts.has(acc) && (selGroup === 'all' || cleanName(r.Group) === selGroup) && r.Item) {
                const item = r.Item.trim();
                itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
                totalQty++;
            }
        });

        // Dynamic Titles
        const sTitle = selGroup === 'all' ? "Sales of the day" : `Sales of the day (${selGroup})`;
        const pTitle = selMethod === 'all' ? "Payments Received" : `Payments Received (${selMethod})`;
        const mTitle = `Accounts: ${selGroup === 'all' ? 'All' : selGroup} closed by ${selMethod === 'all' ? 'Any' : selMethod}`;
        const iTitle = `Items: ${selGroup === 'all' ? 'Groups' : selGroup} closed by ${selMethod === 'all' ? 'All' : selMethod}`;

        salesContainer.innerHTML = buildTable(sTitle, salesMap, salesTotal);
        paymentsContainer.innerHTML = buildTable(pTitle, paymentsMap, pyTotal);
        matchedContainer.innerHTML = buildTable(mTitle, matchedMap, matchedTotal);
        itemsContainer.innerHTML = buildItemTable(iTitle, itemCounts, totalQty);
    }

    function buildTable(title, map, total) {
        const keys = [...map.keys()].sort();
        if (!keys.length) return `<div class="table-header">${title}</div><div class="placeholder-text">No data.</div>`;
        let html = `<div class="table-header">${title}</div><div class="table-wrapper"><table><thead><tr><th>Account</th><th class="text-right">Price</th></tr></thead><tbody>`;
        html += `<tr class="total-row"><td>TOTAL</td><td class="text-right">${total.toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>`;
        keys.forEach(k => html += `<tr><td>${k}</td><td class="text-right">${map.get(k).toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>`);
        return html + `</tbody></table></div>`;
    }

    function buildItemTable(title, map, qty) {
        const keys = [...map.keys()].sort();
        if (!keys.length) return `<div class="table-header">${title}</div><div class="placeholder-text">No items.</div>`;
        let html = `<div class="table-header">${title}</div><div class="table-wrapper"><table><thead><tr><th>Item</th><th class="text-right">Qty</th></tr></thead><tbody>`;
        html += `<tr class="total-row"><td>TOTAL QTY</td><td class="text-right">${qty}</td></tr>`;
        keys.forEach(k => html += `<tr><td>${k}</td><td class="text-right">${map.get(k)}</td></tr>`);
        return html + `</tbody></table></div>`;
    }

    [csv1Input, csv2Input, groupSelect, methodSelect].forEach(el => el.addEventListener('change', handleInteraction));
});
