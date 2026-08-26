document.addEventListener('DOMContentLoaded', () => {
    // Modal & Button Selectors
    const helpBtn = document.getElementById('helpBtn');
    const helpModal = document.getElementById('helpModal');
    const closeHelp = document.getElementById('closeHelp');
    const exportBtn = document.getElementById('exportBtn');
    const clearBtn = document.getElementById('clearBtn');

    // Button Events
    if (helpBtn) helpBtn.onclick = () => helpModal.classList.remove('hidden');
    if (closeHelp) closeHelp.onclick = () => helpModal.classList.add('hidden');
    if (exportBtn) exportBtn.onclick = exportAllToCSV;
    if (clearBtn) clearBtn.onclick = clearData;

    // Data Selectors
    const csv1Input = document.getElementById('csv1');
    const csv2Input = document.getElementById('csv2');
    const groupSelect = document.getElementById('groupFilter');
    const taxSelect = document.getElementById('taxFilter');
    const methodSelect = document.getElementById('methodFilter');
    
    const salesContainer = document.getElementById('salesTable');
    const paymentsContainer = document.getElementById('paymentsTable');
    const matchedContainer = document.getElementById('matchedTable');
    const itemsContainer = document.getElementById('itemsTable');

    let txData = [];
    let pyData = [];

    const cleanName = (str) => (!str ? "" : str.replace(/\s*\(.*?\)/g, '').trim());

    const parseFile = (file) => {
        return new Promise((resolve, reject) => {
            Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r) => resolve(r.data), error: (e) => reject(e) });
        });
    };

    async function handleInteraction(e) {
        if (e.target.type === 'file') {
            if (csv1Input.files[0] && csv2Input.files[0]) {
                try {
                    const [t, p] = await Promise.all([parseFile(csv1Input.files[0]), parseFile(csv2Input.files[0])]);
                    txData = t; pyData = p;
                    updateFilterMenus();
                    updateDashboard();
                } catch (err) { console.error(err); }
            }
        } else {
            updateDashboard();
        }
    }

    function updateFilterMenus() {
        const groups = [...new Set(txData.map(r => cleanName(r.Group)))].filter(n => n).sort();
        groupSelect.innerHTML = '<option value="all">All Groups</option>' + groups.map(g => `<option value="${g}">${g}</option>`).join('');

        const taxes = [...new Set(txData.map(r => (r.TaxName || "").trim()))].filter(n => n).sort();
        taxSelect.innerHTML = '<option value="all">All Taxes</option>' + taxes.map(t => `<option value="${t}">${t}</option>`).join('');

        const methods = [...new Set(pyData.map(r => cleanName(r.Method)))].filter(n => n).sort();
        methodSelect.innerHTML = '<option value="all">All Methods</option>' + methods.map(m => `<option value="${m}">${m}</option>`).join('');
    }

    function updateDashboard() {
        if (!txData.length || !pyData.length) return;
        const selGroup = groupSelect.value;
        const selTax = taxSelect.value;
        const selMethod = methodSelect.value;

        // 1. Process Payments
        const paymentsMap = new Map();
        let pyTotal = 0;
        pyData.forEach(r => {
            if (selMethod !== 'all' && cleanName(r.Method) !== selMethod) return;
            const acc = (r.Account || "").trim(); if (!acc) return;
            const p = parseFloat(String(r.FinalPrice || r.Amount || "0").replace(/[^\d.-]/g, '')) || 0;
            paymentsMap.set(acc, (paymentsMap.get(acc) || 0) + p);
            pyTotal += p;
        });

        // 2. Process Sales
        const salesMap = new Map();
        let salesTotalPrice = 0, salesTotalPre = 0, salesTotalTax = 0;

        txData.forEach(r => {
            if (selGroup !== 'all' && cleanName(r.Group) !== selGroup) return;
            const taxName = (r.TaxName || "").trim();
            if (selTax !== 'all' && taxName !== selTax) return;

            const acc = (r.Account || "").trim(); if (!acc) return;

            const price = parseFloat(String(r.FinalPrice || "0").replace(/[^\d.-]/g, '')) || 0;
            const preTax = parseFloat(String(r.PreTax || "0").replace(/[^\d.-]/g, '')) || 0;
            const taxAmt = parseFloat(String(r.Tax || r.TaxAmount || r['Tax Amount'] || r['Tax amount'] || "0").replace(/[^\d.-]/g, '')) || 0;

            if (!salesMap.has(acc)) {
                salesMap.set(acc, { price: 0, pre: 0, tax: 0, taxNames: new Set() });
            }
            
            const sData = salesMap.get(acc);
            sData.price += price;
            sData.pre += preTax;
            sData.tax += taxAmt;
            if (taxName) sData.taxNames.add(taxName);
            
            salesTotalPrice += price;
            salesTotalPre += preTax;
            salesTotalTax += taxAmt;
        });

        // 3. Process Matches based on Sales Map Data
        const matchedMap = new Map();
        let matchedTotalPrice = 0, matchedTotalPre = 0, matchedTotalTax = 0;

        salesMap.forEach((sData, acc) => {
            if (paymentsMap.has(acc)) {
                matchedMap.set(acc, sData);
                matchedTotalPrice += sData.price;
                matchedTotalPre += sData.pre;
                matchedTotalTax += sData.tax;
            }
        });

        // 4. Process Aggregated Items for Matched Accounts
        const matchedAccounts = new Set(matchedMap.keys());
        const itemCounts = new Map();
        let totalQty = 0;
        txData.forEach(r => {
            const acc = (r.Account || "").trim();
            const taxName = (r.TaxName || "").trim();
            
            if (matchedAccounts.has(acc) && 
                (selGroup === 'all' || cleanName(r.Group) === selGroup) && 
                (selTax === 'all' || taxName === selTax) && 
                r.Item) {
                
                const item = r.Item.trim();
                itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
                totalQty++;
            }
        });

        // Dynamic Titles
        const taxLabel = selTax === 'all' ? "" : ` [${selTax}]`;
        const sTitle = selGroup === 'all' ? `Sales of the day${taxLabel}` : `Sales of the day (${selGroup})${taxLabel}`;
        const pTitle = selMethod === 'all' ? "Payments Received" : `Payments Received (${selMethod})`;
        const mTitle = `Accounts: ${selGroup === 'all' ? 'All' : selGroup}${taxLabel} closed by ${selMethod === 'all' ? 'Any' : selMethod}`;
        const iTitle = `Items: ${selGroup === 'all' ? 'Groups' : selGroup}${taxLabel} closed by ${selMethod === 'all' ? 'All' : selMethod}`;

        // Render Tables
        salesContainer.innerHTML = buildAccountTaxTable(sTitle, salesMap, salesTotalPrice, salesTotalPre, salesTotalTax);
        paymentsContainer.innerHTML = buildTable(pTitle, paymentsMap, pyTotal);
        matchedContainer.innerHTML = buildAccountTaxTable(mTitle, matchedMap, matchedTotalPrice, matchedTotalPre, matchedTotalTax);
        itemsContainer.innerHTML = buildItemTable(iTitle, itemCounts, totalQty);
    }

    // Number formatting helper to enforce exactly 2 decimal places everywhere
    const formatNum = (num) => num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Builder for 5-Column Account+Tax Tables
    function buildAccountTaxTable(title, map, tPrice, tPre, tTax) {
        const keys = [...map.keys()].sort();
        if (!keys.length) return `<div class="table-header">${title}</div><div class="placeholder-text">No data.</div>`;
        
        let html = `<div class="table-header">${title}</div><div class="table-wrapper"><table><thead><tr><th>Account</th><th class="text-right">Price</th><th>TaxName</th><th class="text-right">PreTax</th><th class="text-right">Tax</th></tr></thead><tbody>`;
        
        html += `<tr class="total-row"><td>TOTAL</td><td class="text-right">${formatNum(tPrice)}</td><td></td><td class="text-right">${formatNum(tPre)}</td><td class="text-right">${formatNum(tTax)}</td></tr>`;
        
        keys.forEach(k => {
            const vals = map.get(k);
            const tNames = Array.from(vals.taxNames).join(', ');
            html += `<tr><td>${k}</td><td class="text-right">${formatNum(vals.price)}</td><td>${tNames}</td><td class="text-right">${formatNum(vals.pre)}</td><td class="text-right">${formatNum(vals.tax)}</td></tr>`;
        });
        return html + `</tbody></table></div>`;
    }

    // Builder for 2-Column Standard Tables
    function buildTable(title, map, total) {
        const keys = [...map.keys()].sort();
        if (!keys.length) return `<div class="table-header">${title}</div><div class="placeholder-text">No data.</div>`;
        let html = `<div class="table-header">${title}</div><div class="table-wrapper"><table><thead><tr><th>Account</th><th class="text-right">Price</th></tr></thead><tbody>`;
        html += `<tr class="total-row"><td>TOTAL</td><td class="text-right">${formatNum(total)}</td></tr>`;
        keys.forEach(k => html += `<tr><td>${k}</td><td class="text-right">${formatNum(map.get(k))}</td></tr>`);
        return html + `</tbody></table></div>`;
    }

    // Builder for 2-Column Quantity Tables
    function buildItemTable(title, map, qty) {
        const keys = [...map.keys()].sort();
        if (!keys.length) return `<div class="table-header">${title}</div><div class="placeholder-text">No items.</div>`;
        let html = `<div class="table-header">${title}</div><div class="table-wrapper"><table><thead><tr><th>Item</th><th class="text-right">Qty</th></tr></thead><tbody>`;
        html += `<tr class="total-row"><td>TOTAL QTY</td><td class="text-right">${qty}</td></tr>`;
        keys.forEach(k => html += `<tr><td>${k}</td><td class="text-right">${map.get(k)}</td></tr>`);
        return html + `</tbody></table></div>`;
    }

    // Dynamic CSV Export
    function exportAllToCSV() {
        if (!txData.length || !pyData.length) {
            alert("Please upload and process data before exporting.");
            return;
        }

        const sections = ['salesTable', 'paymentsTable', 'matchedTable', 'itemsTable'];
        
        const extractedData = sections.map(id => {
            const container = document.getElementById(id);
            const titleEl = container.querySelector('.table-header');
            const title = titleEl ? titleEl.innerText : "";
            
            const rows = Array.from(container.querySelectorAll('tr')).map(tr => {
                return Array.from(tr.querySelectorAll('th, td')).map(td => td.innerText);
            });
            const colsCount = rows.length > 0 ? rows[0].length : 2; 
            return { title, rows, colsCount };
        });

        let maxRows = 0;
        extractedData.forEach(data => {
            if (data.rows.length > maxRows) maxRows = data.rows.length;
        });

        let csvContent = "";
        for (let rowIndex = -1; rowIndex < maxRows; rowIndex++) {
            let rowArray = [];
            extractedData.forEach((data, index) => {
                if (rowIndex === -1) {
                    rowArray.push(`"${data.title.replace(/"/g, '""')}"`);
                    for (let i = 1; i < data.colsCount; i++) rowArray.push(`""`);
                } else {
                    if (rowIndex < data.rows.length) {
                        for (let i = 0; i < data.colsCount; i++) {
                            const cell = data.rows[rowIndex][i] || "";
                            rowArray.push(`"${cell.replace(/"/g, '""')}"`);
                        }
                    } else {
                        for (let i = 0; i < data.colsCount; i++) rowArray.push(`""`);
                    }
                }
                if (index < extractedData.length - 1) rowArray.push(`""`);
            });
            csvContent += rowArray.join(",") + "\n";
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().split('T')[0];
        link.setAttribute("href", url);
        link.setAttribute("download", `Accounting_Report_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function clearData() {
        if (!csv1Input.value && !csv2Input.value && txData.length === 0) return;

        if (confirm("Are you sure you want to clear all data and reset the dashboard?")) {
            txData = [];
            pyData = [];
            csv1Input.value = '';
            csv2Input.value = '';
            groupSelect.innerHTML = '<option value="all">All Groups</option>';
            taxSelect.innerHTML = '<option value="all">All Taxes</option>';
            methodSelect.innerHTML = '<option value="all">All Methods</option>';

            const placeholderHtml = '<div class="placeholder-text">Waiting for data...</div>';
            salesContainer.innerHTML = placeholderHtml;
            paymentsContainer.innerHTML = placeholderHtml;
            matchedContainer.innerHTML = placeholderHtml;
            itemsContainer.innerHTML = placeholderHtml;
        }
    }

    [csv1Input, csv2Input, groupSelect, taxSelect, methodSelect].forEach(el => el.addEventListener('change', handleInteraction));
});
