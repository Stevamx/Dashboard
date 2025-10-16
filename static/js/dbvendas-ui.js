// static/js/dbvendas-ui.js
// Este arquivo contém todas as funções de renderização para o módulo de Vendas.

// ### ALTERAÇÃO APLICADA AQUI: Troca de formatCurrency para formatCurrencyAbbreviated ###
function updateSalesKpiCards(data) {
    document.getElementById('sales-kpi-revenue').textContent = formatCurrencyAbbreviated(data.total_revenue);
    document.getElementById('sales-kpi-orders').textContent = data.total_orders;
    document.getElementById('sales-kpi-ticket').textContent = formatCurrencyAbbreviated(data.avg_ticket);
    document.getElementById('sales-kpi-net-profit').textContent = formatCurrencyAbbreviated(data.net_profit);
    document.getElementById('sales-kpi-returns').textContent = formatCurrencyAbbreviated(data.total_returns);
}

function renderDailySalesChartVendas(data) {
    destroyChart('dailySalesChartVendas');
    const c = document.getElementById('dailySalesChartVendas').getContext('2d');
    chartInstances['dailySalesChartVendas'] = new Chart(c, {
        type: 'line',
        data: {
            labels: data.dates.map(d => new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })),
            datasets: [{
                label: 'Vendas',
                data: data.sales,
                borderColor: '#007BFF',
                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                fill: true,
                tension: 0.2
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` } } } }
    });
}

function renderPeakHoursChart(data) {
    destroyChart('peakHoursChart');
    const c = document.getElementById('peakHoursChart').getContext('2d');
    chartInstances['peakHoursChart'] = new Chart(c, {
        type: 'line',
        data: {
            labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
            datasets: [{
                label: 'Vendas por Hora',
                data: data.sales,
                borderColor: '#007BFF',
                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                fill: true
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` } } } }
    });
}

function renderProfitMarginChart(data) {
    destroyChart('profitMarginChart');
    const c = document.getElementById('profitMarginChart').getContext('2d');
    chartInstances['profitMarginChart'] = new Chart(c, {
        type: 'line',
        data: {
            labels: data.dates.map(d => new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })),
            datasets: [{
                label: 'Margem',
                data: data.margins,
                borderColor: '#6f42c1',
                backgroundColor: 'rgba(111, 66, 193, 0.1)',
                fill: true,
                tension: 0.2
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            scales: {
                y: {
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            },
            plugins: { 
                legend: { display: false }, 
                tooltip: { 
                    callbacks: { 
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}%`
                    } 
                } 
            } 
        }
    });
}

function renderPaymentMethodsChart(data) {
    destroyChart('paymentMethodsChart');
    const c = document.getElementById('paymentMethodsChart').getContext('2d');
    const vibrantColors = ['#007BFF', '#6f42c1', '#fd7e14', '#198754', '#dc3545', '#ffc107', '#6c757d'];
    chartInstances['paymentMethodsChart'] = new Chart(c, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data),
            datasets: [{ label: 'Forma de Pagamento', data: Object.values(data), backgroundColor: vibrantColors, borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed)}` } } } }
    });
}

function renderVendorPerformanceChart(data) {
    destroyChart('vendorPerformanceChart');
    const vibrantColors = ['#007BFF', '#6610f2', '#6f42c1', '#d63384', '#fd7e14', '#ffc107', '#198754', '#20c997', '#0dcaf0', '#6c757d'];
    const labels = Object.keys(data);
    const chartData = Object.values(data);
    const c = document.getElementById('vendorPerformanceChart').getContext('2d');
    chartInstances['vendorPerformanceChart'] = new Chart(c, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ label: 'Vendas por Vendedor', data: chartData, backgroundColor: vibrantColors.slice(0, labels.length) }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed.x)}` } } } }
    });
}

function renderTopProductsChart(data, label = 'Faturamento') {
    destroyChart('topProductsChart');
    const c = document.getElementById('topProductsChart').getContext('2d');
    const vibrantColors = ['#007BFF', '#6f42c1', '#198754', '#fd7e14', '#d63384', '#20c997', '#6610f2', '#ffc107', '#0dcaf0', '#6c757d'];
    
    chartInstances['topProductsChart'] = new Chart(c, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{ 
                label: label, 
                data: data.data, 
                backgroundColor: vibrantColors 
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false }, 
                tooltip: { 
                    callbacks: { 
                        label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed.x)}` 
                    } 
                } 
            }
        }
    });
}

function renderAnnualSalesChart(data) {
    destroyChart('annualSalesChart');
    const c = document.getElementById('annualSalesChart').getContext('2d');
    const m = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    const year1 = data.year1;
    const year2 = data.year2;
    const dataYear1 = data.data_year1;
    const dataYear2 = data.data_year2;

    chartInstances['annualSalesChart'] = new Chart(c, {
        type: 'line',
        data: {
            labels: m,
            datasets: [
                { 
                    label: `Ano ${year2}`, 
                    data: dataYear2.map(d => d.revenue),
                    fullData: dataYear2,
                    borderColor: '#6f42c1', 
                    backgroundColor: 'rgba(111, 66, 193, 0.1)', 
                    fill: true, 
                    tension: 0.2 
                },
                { 
                    label: `Ano ${year1}`, 
                    data: dataYear1.map(d => d.revenue),
                    fullData: dataYear1,
                    borderColor: '#007BFF', 
                    backgroundColor: 'rgba(0, 123, 255, 0.1)', 
                    fill: true, 
                    tension: 0.2 
                }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                tooltip: { 
                    callbacks: { 
                        label: (ctx) => {
                            const fullData = ctx.dataset.fullData[ctx.dataIndex];
                            const faturamento = `Faturamento: ${formatCurrency(fullData.revenue)}`;
                            const margem = `Margem de Lucro: ${fullData.margin.toFixed(2)}%`;
                            return [faturamento, margem];
                        } 
                    } 
                } 
            } 
        }
    });
}


function renderVendedoresRanking(rankingData) {
    const tableBody = document.getElementById('vendor-ranking-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';
    if (rankingData && rankingData.length > 0) {
        tableBody.innerHTML = rankingData.map(vendedor => `
            <tr>
                <td data-label="Vendedor">${vendedor.vendedor}</td>
                <td data-label="Faturamento Total">${formatCurrency(vendedor.faturamento_total)}</td>
                <td data-label="Lucro Gerado">${formatCurrency(vendedor.lucro_gerado)}</td>
                <td data-label="Ticket Médio">${formatCurrency(vendedor.ticket_medio)}</td>
                <td data-label="Produtos / Pedido">${vendedor.produtos_por_pedido.toFixed(2).replace('.', ',')}</td>
                <td data-label="Desconto Médio">${vendedor.desconto_medio_percent.toFixed(2).replace('.', ',')}%</td>
            </tr>
        `).join('');
    } else {
        tableBody.innerHTML = '<tr><td colspan="6">Nenhum dado encontrado para o período selecionado.</td></tr>';
    }
}

function renderTopProductsVendedorChart(data, vendorName) {
    destroyChart('topProductsVendorChart');
    const titleEl = document.getElementById('top-products-vendor-title');
    if (!titleEl) return;

    if (!data || !data.labels || data.labels.length === 0) {
        return;
    }
    
    titleEl.textContent = `Top 10 Produtos de ${vendorName}`;
    const c = document.getElementById('topProductsVendorChart').getContext('2d');
    const vibrantColors = ['#007BFF', '#6f42c1', '#198754', '#fd7e14', '#d63384', '#20c997', '#6610f2', '#ffc107', '#0dcaf0', '#6c757d'];
    
    chartInstances['topProductsVendorChart'] = new Chart(c, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{ label: 'Faturamento', data: data.data, backgroundColor: vibrantColors }]
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed.x)}` } } }
        }
    });
}

function renderSalesEvolutionVendorChart(data, vendorName) {
    destroyChart('salesEvolutionVendorChart');
    const titleEl = document.getElementById('sales-evolution-vendor-title');
    if (!titleEl) return;

    if (!data || !data.dates || data.dates.length === 0) {
        return;
    }
    
    titleEl.textContent = `Evolução de Vendas de ${vendorName}`;
    const c = document.getElementById('salesEvolutionVendorChart').getContext('2d');
    chartInstances['salesEvolutionVendorChart'] = new Chart(c, {
        type: 'line',
        data: {
            labels: data.dates.map(d => new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })),
            datasets: [{
                label: 'Vendas',
                data: data.sales,
                borderColor: '#198754',
                backgroundColor: 'rgba(25, 135, 84, 0.1)',
                fill: true,
                tension: 0.2
            }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` } } } 
        }
    });
}

function renderTopCustomersList(data, vendorName) {
    const container = document.getElementById('topCustomersVendorList');
    const titleEl = document.getElementById('top-customers-vendor-title');
    if (!container || !titleEl) return;

    titleEl.textContent = `Top 5 Clientes de ${vendorName}`;
    
    if (!data || data.length === 0) {
        container.innerHTML = '<p class="product-list-empty">Nenhum cliente encontrado para este vendedor no período.</p>';
        return;
    }

    container.innerHTML = data.map(customer => `
        <div class="product-list-item">
            <span class="product-name">${customer.cliente}</span>
            <span class="product-value">${formatCurrency(customer.valor)}</span>
        </div>
    `).join('');
}

function renderSalesByGroupChart(data) {
    destroyChart('salesByGroupChart');
    const c = document.getElementById('salesByGroupChart').getContext('2d');
    const vibrantColors = ['#007BFF', '#6f42c1', '#fd7e14', '#198754', '#dc3545', '#ffc107', '#6c757d', '#6610f2', '#20c997', '#d63384'];
    
    const wrapper = c.canvas.parentElement;
    const emptyMessage = wrapper.querySelector('.product-list-empty');
    if (emptyMessage) emptyMessage.remove();
    
    if (!data || !data.labels || data.labels.length === 0) {
        c.canvas.style.display = 'none';
        if (!wrapper.querySelector('.product-list-empty')) {
            wrapper.insertAdjacentHTML('beforeend', '<p class="product-list-empty">Nenhum dado de grupo para exibir.</p>');
        }
        return;
    }
    
    c.canvas.style.display = 'block';

    let labels = data.labels;
    let chartData = data.data;
    if (data.labels.length > 9) {
        labels = data.labels.slice(0, 9);
        chartData = data.data.slice(0, 9);
        const otherValue = data.data.slice(9).reduce((acc, val) => acc + val, 0);
        labels.push('Outros');
        chartData.push(otherValue);
    }

    chartInstances['salesByGroupChart'] = new Chart(c, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{ 
                label: 'Vendas por Grupo', 
                data: chartData, 
                backgroundColor: vibrantColors, 
                borderWidth: 0 
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { position: 'right' },
                tooltip: { 
                    callbacks: { 
                        label: (ctx) => {
                            const label = ctx.label || '';
                            const value = ctx.parsed || 0;
                            const total = ctx.chart.getDatasetMeta(0).total;
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${formatCurrency(value)} (${percentage}%)`;
                        }
                    } 
                } 
            } 
        }
    });
}