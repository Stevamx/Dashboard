// static/js/dashboard-tv.js
document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('tv-grid');
    const layoutConfig = JSON.parse(localStorage.getItem('tvLayout')) || [];
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // --- ALTERAÇÃO APLICADA AQUI ---
    const savedIntervalMinutes = localStorage.getItem('tvRefreshInterval') || 5;
    const refreshIntervalMs = savedIntervalMinutes * 60 * 1000;
    const refreshTimeSpan = document.getElementById('tv-refresh-time');
    if(refreshTimeSpan) {
        refreshTimeSpan.textContent = savedIntervalMinutes;
    }

    const cardTemplates = {
        'kpi_vendas_hoje': {
            html: `<div class="kpi-icon"><i class='bx bxs-dollar-circle'></i></div><div class="kpi-text"><h3>Vendas Hoje</h3><div class="value">...</div></div>`,
            populate: (el, data) => { if(data && data.kpis) el.querySelector('.value').textContent = formatCurrency(data.kpis.vendas_hoje); }
        },
        'kpi_pedidos_hoje': {
            html: `<div class="kpi-icon"><i class='bx bxs-cart'></i></div><div class="kpi-text"><h3>Pedidos Hoje</h3><div class="value">...</div></div>`,
            populate: (el, data) => { if(data && data.kpis) el.querySelector('.value').textContent = data.kpis.pedidos_hoje; }
        },
        'kpi_receita_mensal': {
            html: `<div class="kpi-icon"><i class='bx bxs-calendar'></i></div><div class="kpi-text"><h3>Receita Mensal</h3><div class="value">...</div></div>`,
            populate: (el, data) => { if(data && data.kpis) el.querySelector('.value').textContent = formatCurrency(data.kpis.receita_mensal_atual); }
        },
        'kpi_lucro_hoje': {
            html: `<div class="kpi-icon"><i class='bx bx-line-chart'></i></div><div class="kpi-text"><h3>Lucro Hoje</h3><div class="value">...</div></div>`,
            populate: (el, data) => { if(data && data.kpis) el.querySelector('.value').textContent = formatCurrency(data.kpis.lucro_hoje); }
        },
        'stock_kpi_total_value': {
            html: `<div class="kpi-icon"><i class='bx bxs-package'></i></div><div class="kpi-text"><h3>Valor do Estoque</h3><div class="value">...</div></div>`,
            populate: (el, data) => { if(data && data.stock_kpis) el.querySelector('.value').textContent = formatCurrency(data.stock_kpis.total_value); }
        },
        'chart_monthly_performance': {
            html: `<h2>Desempenho no Mês</h2><div class="chart-wrapper"><canvas></canvas></div>`,
            populate: (el, data) => {
                if (!data || !data.monthly_performance) return;
                const chartId = `tv_chart_${el.dataset.cardId}`;
                destroyChart(chartId);
                const c = el.querySelector('canvas').getContext('2d');
                chartInstances[chartId] = new Chart(c, { type: 'line', data: { labels: data.monthly_performance.labels, datasets: [{ label: 'Mês Atual', data: data.monthly_performance.current_month_sales, borderColor: 'var(--brand)', backgroundColor: 'rgba(0, 66, 240, 0.1)', fill: true, tension: 0.2 }, { label: 'Mês Passado', data: data.monthly_performance.previous_month_sales, borderColor: 'var(--muted)', borderDash: [5, 5], tension: 0.2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` } } } } });
            }
        },
        'chart_top_vendors': {
            html: `<h2>Top Vendedores (Mês)</h2><div class="chart-wrapper"><canvas></canvas></div>`,
            populate: (el, data) => {
                if (!data || !data.top_vendors) return;
                const chartId = `tv_chart_${el.dataset.cardId}`;
                destroyChart(chartId);
                const c = el.querySelector('canvas').getContext('2d');
                const vibrantColors = ['#007BFF', '#6610f2', '#6f42c1', '#d63384', '#fd7e14'];
                chartInstances[chartId] = new Chart(c, { type: 'bar', data: { labels: data.top_vendors.map(v => v.vendedor), datasets: [{ label: 'Vendas', data: data.top_vendors.map(v => v.total), backgroundColor: vibrantColors }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed.x)}` } } } } });
            }
        },
        'metas_progress': {
            html: `<div class="tv-metas-container"></div>`,
            populate: (el, data) => {
                const container = el.querySelector('.tv-metas-container');
                if (!data || !data.metas_progress || data.metas_progress.length === 0) {
                    container.innerHTML = '<p class="tv-empty-message">Nenhuma meta definida para o mês atual.</p>';
                    return;
                }
                container.innerHTML = '';
                data.metas_progress.forEach(meta => {
                    const percent = Math.min(meta.percentual, 100);
                    const card = document.createElement('div');
                    card.className = 'card meta-card'; 
                    card.innerHTML = `
                        <div class="meta-card-header">
                            <h3 class="meta-card-title">${meta.titulo}</h3>
                            <span class="meta-card-percent">${meta.percentual.toFixed(1).replace('.', ',')}%</span>
                        </div>
                        <div class="progress-bar-container">
                            <div class="progress-bar" style="width: ${percent}%;"></div>
                        </div>
                        <div class="meta-card-values">
                            <span>${formatCurrency(meta.valor_atual)}</span>
                            <span class="meta-target">Meta: ${formatCurrency(meta.valor_meta)}</span>
                        </div>
                    `;
                    container.appendChild(card);
                });
            }
        }
    };

    if (layoutConfig.length === 0) {
        grid.innerHTML = "<h1 style='color: var(--ink); grid-column: 1 / -1; text-align: center;'>Nenhum card selecionado. Volte ao dashboard para configurar o layout.</h1>";
        return;
    }

    layoutConfig.forEach(cardConfig => {
        if (cardTemplates[cardConfig.id]) {
            const template = cardTemplates[cardConfig.id];
            const cardEl = document.createElement('div');
            cardEl.className = `card size-${cardConfig.size}`;
            
            if (cardConfig.id.startsWith('kpi')) {
                cardEl.classList.add('kpi-card');
            }

            if (cardConfig.id === 'metas_progress') {
                cardEl.classList.add('fit-content-card');
            }
            
            cardEl.dataset.cardId = cardConfig.id;
            cardEl.innerHTML = template.html;
            grid.appendChild(cardEl);
        }
    });

    async function fetchDataAndPopulate() {
        console.log("Atualizando dados do Modo TV...");
        try {
            const today = new Date().toISOString().split('T')[0];
            
            const [kpiData, monthlyPerformanceData, topVendorsData, stockKpiData, metasProgressData] = await Promise.all([
                fazerRequisicaoAutenticada(`/dashboard/kpis`),
                fazerRequisicaoAutenticada(`/dashboard/monthly-performance`),
                fazerRequisicaoAutenticada(`/dashboard/top-vendors-month`),
                fazerRequisicaoAutenticada(`/estoque/kpis?end_date=${today}`),
                fazerRequisicaoAutenticada(`/dashboard/metas-progress`),
            ]);

            const allData = {
                kpis: kpiData,
                monthly_performance: monthlyPerformanceData,
                top_vendors: topVendorsData,
                stock_kpis: stockKpiData,
                metas_progress: metasProgressData,
            };

            document.querySelectorAll('#tv-grid .card').forEach(cardEl => {
                const cardId = cardEl.dataset.cardId;
                if (cardTemplates[cardId] && cardTemplates[cardId].populate) {
                    cardTemplates[cardId].populate(cardEl, allData);
                }
            });

            const chartColors = savedTheme === 'light' 
                ? { color: '#6B7280', borderColor: '#DDE1E8' } 
                : { color: '#94A3B8', borderColor: 'rgba(148, 163, 184, 0.2)' };
            
            Chart.defaults.color = chartColors.color;
            Chart.defaults.borderColor = chartColors.borderColor;
            for (const chartId in chartInstances) {
                if(chartInstances[chartId]) chartInstances[chartId].update();
            }

        } catch (error) {
            console.error("Falha ao buscar dados para o Modo TV:", error);
        }
    }

    fetchDataAndPopulate();
    // --- ALTERAÇÃO APLICADA AQUI ---
    setInterval(fetchDataAndPopulate, refreshIntervalMs);
});