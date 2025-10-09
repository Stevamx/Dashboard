// static/js/dbestoque.js

(async () => {
    let currentIdleDays = 90;

    // --- FUNÇÕES DE RENDERIZAÇÃO E ATUALIZAÇÃO (MÓDULO ESTOQUE) ---
    function updateStockKpiCards(data) {
        document.getElementById('kpi-stock-total-value').textContent = formatCurrency(data.total_value);
    }

    function renderTopProductsStockChart(data) {
        destroyChart('topProductsStockChart');
        const c = document.getElementById('topProductsStockChart').getContext('2d');
        const vibrantColors = ['#007BFF', '#6610f2', '#6f42c1', '#d63384', '#fd7e14', '#ffc107', '#198754', '#20c997', '#0dcaf0', '#6c757d'];
        chartInstances['topProductsStockChart'] = new Chart(c, { type: 'bar', data: { labels: data.labels, datasets: [{ label: 'Valor em Estoque', data: data.values, backgroundColor: vibrantColors }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed.x)}` } } } } });
    }

    async function loadStockValueHistory(year) {
        const chartWrapper = document.querySelector('[data-card-id="chart_stock_value_history"]');
        const loader = chartWrapper.querySelector('.card-loader') || document.createElement('div');
        if (!loader.parentElement) { loader.className = 'card-loader'; chartWrapper.appendChild(loader); }
        loader.classList.add('visible');
        try {
            const historyData = await fazerRequisicaoAutenticada(`${API_BASE_URL}/estoque/value-history?year=${year}`);
            if (historyData) renderStockValueHistoryChart(historyData);
        } catch(e) { console.error("Falha ao carregar histórico de estoque:", e); } 
        finally { loader.classList.remove('visible'); }
    }

    function renderStockValueHistoryChart(data) {
        destroyChart('stockValueHistoryChart');
        const c = document.getElementById('stockValueHistoryChart').getContext('2d');
        chartInstances['stockValueHistoryChart'] = new Chart(c, { type: 'line', data: { labels: data.labels, datasets: [{ label: 'Valor do Estoque', data: data.values, borderColor: '#007BFF', backgroundColor: 'rgba(0, 123, 255, 0.1)', fill: true, tension: 0.2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `Valor: ${formatCurrency(ctx.parsed.y)}` } } } } });
    }

    function renderStockAbcChart(data) {
        destroyChart('stockAbcChart');
        const c = document.getElementById('stockAbcChart').getContext('2d');
        chartInstances['stockAbcChart'] = new Chart(c, { type: 'doughnut', data: { labels: [`Curva A (${data.curve_a_percent}%)`, `Curva B (${data.curve_b_percent}%)`, `Curva C (${data.curve_c_percent}%)`], datasets: [{ label: 'Nº de Itens', data: [data.curve_a_count, data.curve_b_count, data.curve_c_count], backgroundColor: ['#007BFF', '#fd7e14', '#6c757d'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed} itens` } } } } });
    }

    function renderLowStockList(data) {
        const container = document.getElementById('low-stock-list-container');
        const countEl = document.getElementById('low-stock-count');
        if (!container || !countEl) return;
        countEl.textContent = `${data.length} Itens`;
        if (!data || data.length === 0) {
            container.innerHTML = '<p class="product-list-empty">Nenhum item com estoque baixo.</p>'; return;
        }
        container.innerHTML = data.map(item => `<div class="product-list-item" data-name="${item.product_name.toLowerCase()}"><span class="product-name">${item.product_name}</span><span class="product-value"><span class="label">Atual:</span> ${item.current_stock.toLocaleString('pt-BR')}</span></div>`).join('');
    }

    function renderIdleProductsList(data) {
        const container = document.getElementById('idle-products-list-container');
        const titleEl = document.getElementById('idle-products-title');
        if (!container || !titleEl) return;
        titleEl.textContent = `Produtos Parados (há ${currentIdleDays} dias)`;
        if (!data || data.length === 0) {
            container.innerHTML = '<p class="product-list-empty">Nenhum produto parado encontrado.</p>'; return;
        }
        container.innerHTML = data.map(item => `<div class="product-list-item" data-name="${item.product_name.toLowerCase()}"><span class="product-name">${item.product_name}</span><span class="product-value"> ${item.current_stock.toLocaleString('pt-BR')} un.</span></div>`).join('');
    }

    async function loadIdleProducts(days) {
        const container = document.getElementById('idle-products-list-container');
        container.innerHTML = '<p class="product-list-empty">Carregando...</p>';
        try {
            const idleProductList = await fazerRequisicaoAutenticada(`${API_BASE_URL}/estoque/idle-products?days=${days}`);
            if(idleProductList) renderIdleProductsList(idleProductList);
        } catch (error) {
            console.error("Falha ao carregar lista de produtos parados:", error);
            container.innerHTML = '<p class="product-list-empty">Erro ao carregar dados.</p>';
        }
    }

    async function loadStockData(filters = {}) {
        showLoading();
        let urlParams = new URLSearchParams(filters).toString();
        try {
            const [kpiData, topProductsData, abcData, lowStockList] = await Promise.all([
                fazerRequisicaoAutenticada(`${API_BASE_URL}/estoque/kpis?${urlParams}`),
                fazerRequisicaoAutenticada(`${API_BASE_URL}/estoque/top-products-by-value?${urlParams}`),
                fazerRequisicaoAutenticada(`${API_BASE_URL}/estoque/abc-analysis?${urlParams}`),
                fazerRequisicaoAutenticada(`${API_BASE_URL}/estoque/low-stock-products`)
            ]);
            if (kpiData) updateStockKpiCards(kpiData);
            if (topProductsData) renderTopProductsStockChart(topProductsData);
            if (abcData) renderStockAbcChart(abcData);
            if (lowStockList) renderLowStockList(lowStockList);
            
            const currentYear = new Date().getFullYear();
            const yearInput = document.getElementById('stock-history-year-input');
            if(yearInput) yearInput.value = currentYear;
            await loadStockValueHistory(currentYear);
            await loadIdleProducts(currentIdleDays);
            
        } catch (error) { console.error("Ocorreu um erro geral ao carregar os dados de estoque:", error); } 
        finally { hideLoading(); }
    }

    // --- LÓGICA DE INICIALIZAÇÃO DO MÓDULO (EVENTOS, MODAIS) ---
    function initializeTabNavigation() {
        const navButtons = document.querySelectorAll('.main-nav[data-module="module-estoque"] .nav-button');
        const pages = document.querySelectorAll('#module-estoque .page');
        navButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetPageId = button.getAttribute('data-target');
                if (button.classList.contains('active')) return;
                navButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                pages.forEach(page => page.classList.toggle('active', page.id === targetPageId));
            });
        });
    }

    function initializeStockModal() {
        const stockFilterBtn = document.getElementById('stock-filter-btn');
        const stockFilterModal = document.getElementById('stock-filter-modal-overlay');
        const cancelStockFilterBtn = document.getElementById('cancel-stock-filter-btn');
        const applyStockFilterBtn = document.getElementById('apply-stock-filter-btn');
        const stockStartDateInput = document.getElementById('stock-start-date');
        const stockEndDateInput = document.getElementById('stock-end-date');
        if(stockFilterBtn) stockFilterBtn.addEventListener('click', () => stockFilterModal.classList.add('visible'));
        if(cancelStockFilterBtn) cancelStockFilterBtn.addEventListener('click', () => stockFilterModal.classList.remove('visible'));
        if(stockFilterModal) stockFilterModal.addEventListener('click', (e) => { if (e.target === stockFilterModal) stockFilterModal.classList.remove('visible'); });
        if(applyStockFilterBtn) {
            applyStockFilterBtn.addEventListener('click', () => {
                if (!stockStartDateInput.value || !stockEndDateInput.value) { alert("Por favor, selecione a data inicial e final."); return; }
                loadStockData({ end_date: stockEndDateInput.value }); // A API de estoque usa principalmente end_date
                stockFilterModal.classList.remove('visible');
            });
        }
    }

    function initializeIdleProductModal() {
        const idleFilterModal = document.getElementById('idle-filter-modal-overlay');
        const openIdleFilterBtn = document.getElementById('idle-products-filter-btn');
        const cancelIdleFilterBtn = document.getElementById('cancel-idle-filter-btn');
        const applyIdleFilterBtn = document.getElementById('apply-idle-filter-btn');
        if(openIdleFilterBtn) openIdleFilterBtn.addEventListener('click', () => idleFilterModal.classList.add('visible'));
        if(cancelIdleFilterBtn) cancelIdleFilterBtn.addEventListener('click', () => idleFilterModal.classList.remove('visible'));
        if(idleFilterModal) idleFilterModal.addEventListener('click', (e) => { if (e.target === idleFilterModal) idleFilterModal.classList.remove('visible'); });
        if(applyIdleFilterBtn) {
            applyIdleFilterBtn.addEventListener('click', () => {
                const daysInput = document.getElementById('idle-days-input');
                const newDays = parseInt(daysInput.value, 10);
                if (newDays && newDays > 0) {
                    currentIdleDays = newDays;
                    loadIdleProducts(currentIdleDays);
                    idleFilterModal.classList.remove('visible');
                } else { alert('Por favor, insira um número de dias válido.'); }
            });
        }
    }

    function initializeStockHistoryFilter() {
        const stockHistoryForm = document.getElementById('stock-history-year-form');
        if (stockHistoryForm) {
            stockHistoryForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const yearInput = document.getElementById('stock-history-year-input');
                const year = parseInt(yearInput.value, 10);
                if(year && year > 2000) { loadStockValueHistory(year); } 
                else { alert('Por favor, insira um ano válido.'); }
            });
        }
    }

    // --- EXECUÇÃO INICIAL DO MÓDULO ---
    initializeTabNavigation();
    initializeStockModal();
    initializeIdleProductModal();
    initializeStockHistoryFilter();
    document.getElementById('low-stock-search')?.addEventListener('keyup', () => filterProductList('low-stock-search', 'low-stock-list-container'));
    document.getElementById('idle-products-search')?.addEventListener('keyup', () => filterProductList('idle-products-search', 'idle-products-list-container'));
    
    loadStockData(); // Carrega os dados iniciais
})();