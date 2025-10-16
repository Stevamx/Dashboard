// static/js/dbgeral.js
(async () => {
    let tvModeInterval = null;
    const VENDORS_STORAGE_KEY = 'dashboardVendorsSelection';

    // ### FUNÇÃO DE ALERTAS REESCRITA PARA POPULAR O MODAL ###
    function renderProactiveAlerts(alerts) {
        const modalBody = document.getElementById('alerts-modal-body');
        const badge = document.querySelector('#open-alerts-modal-btn .notification-badge');

        if (!modalBody || !badge) return;

        if (!alerts || alerts.length === 0) {
            modalBody.innerHTML = '<p class="product-list-empty">Nenhuma novidade ou oportunidade encontrada no momento.</p>';
            badge.style.display = 'none';
            return;
        }
        
        const iconMap = {
            warning: 'bxs-error-alt',
            danger: 'bxs-hot',
            info: 'bxs-info-circle'
        };

        modalBody.innerHTML = alerts.map(alert => `
            <div class="alert-item alert-${alert.type}">
                <div class="alert-item-icon"><i class='bx ${iconMap[alert.type] || 'bxs-info-circle'}'></i></div>
                <div class="alert-item-content">
                    <h4>${alert.title}</h4>
                    <p>${alert.message}</p>
                </div>
            </div>
        `).join('');
        
        badge.style.display = 'block';
    }
    
    // ### NOVA FUNÇÃO PARA INICIALIZAR OS EVENTOS DO MODAL ###
    function initializeAlertsModal() {
        const modal = document.getElementById('alerts-modal-overlay');
        const openBtn = document.getElementById('open-alerts-modal-btn');
        const closeBtn = document.getElementById('close-alerts-modal-btn');
        const badge = document.querySelector('#open-alerts-modal-btn .notification-badge');

        if (!modal || !openBtn || !closeBtn || !badge) return;

        const openModal = () => {
            modal.classList.add('visible');
            badge.style.display = 'none'; // Esconde o badge ao abrir o modal
        };

        const closeModal = () => modal.classList.remove('visible');

        openBtn.addEventListener('click', openModal);
        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    function updateKpiCards(data) {
        document.getElementById('kpi-vendas-hoje').textContent = formatCurrencyAbbreviated(data.vendas_hoje);
        document.getElementById('kpi-pedidos-hoje').textContent = data.pedidos_hoje;
        document.getElementById('kpi-receita-mensal').textContent = formatCurrencyAbbreviated(data.receita_mensal_atual);
        document.getElementById('kpi-lucro-hoje').textContent = formatCurrencyAbbreviated(data.lucro_hoje);
        
        const devolucoesHojeEl = document.getElementById('kpi-devolucoes-hoje');
        if (devolucoesHojeEl) {
            devolucoesHojeEl.textContent = formatCurrencyAbbreviated(data.devolucoes_hoje);
        }
        
        document.getElementById('kpi-vendas-comp').innerHTML = '';
        document.getElementById('kpi-vendas-comp').appendChild(formatComparison(data.vendas_hoje, data.vendas_ontem, "vs. ontem"));
        document.getElementById('kpi-pedidos-comp').innerHTML = '';
        document.getElementById('kpi-pedidos-comp').appendChild(formatComparison(data.pedidos_hoje, data.pedidos_ontem, "vs. ontem"));
        document.getElementById('kpi-receita-comp').innerHTML = '';
        document.getElementById('kpi-receita-comp').appendChild(formatComparison(data.receita_mensal_atual, data.receita_mensal_passado, "vs. mês anterior"));
        document.getElementById('kpi-lucro-comp').innerHTML = '';
        document.getElementById('kpi-lucro-comp').appendChild(formatComparison(data.lucro_hoje, data.lucro_ontem, "vs. ontem"));

        const devolucoesCompEl = document.getElementById('kpi-devolucoes-comp');
        if (devolucoesCompEl) {
            devolucoesCompEl.innerHTML = '';
            devolucoesCompEl.appendChild(formatComparison(data.devolucoes_hoje, data.devolucoes_ontem, "vs. ontem"));
        }
    }

    function renderMonthlyPerformanceChart(data) {
        destroyChart('monthlyPerformanceChart');
        const c = document.getElementById('monthlyPerformanceChart').getContext('2d');
        chartInstances['monthlyPerformanceChart'] = new Chart(c, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [
                    { label: 'Mês Passado', data: data.previous_month_sales, borderColor: '#adb5bd', backgroundColor: 'transparent', borderDash: [5, 5], pointRadius: 0, tension: 0.2 },
                    { label: 'Mês Atual', data: data.current_month_sales, borderColor: '#007BFF', backgroundColor: 'rgba(0, 123, 255, 0.1)', fill: true, tension: 0.2 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { mode: 'index', intersect: false, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` } } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: (value) => formatCurrency(value, 0) } } } }
        });
    }

    function renderMetasProgress(metas) {
        const container = document.getElementById('metas-progress-container');
        if (!container) return;
        container.innerHTML = ''; 
        if (!metas || metas.length === 0) { container.style.display = 'none'; return; }
        container.style.display = 'grid'; 
        metas.forEach(meta => {
            const percent = Math.min(meta.percentual, 100);
            const card = document.createElement('div');
            card.className = 'card meta-card';
            card.innerHTML = `<div class="meta-card-header"><h3 class="meta-card-title">${meta.titulo}</h3><span class="meta-card-percent">${meta.percentual.toFixed(1).replace('.', ',')}%</span></div><div class="progress-bar-container"><div class="progress-bar" style="width: ${percent}%;"></div></div><div class="meta-card-values"><span>${formatCurrency(meta.valor_atual)}</span><span class="meta-target">Meta: ${formatCurrency(meta.valor_meta)}</span></div>`;
            container.appendChild(card);
        });
    }

    function renderTopVendorsChart(data) {
        destroyChart('topVendorsChart');
        const container = document.getElementById('topVendorsChart');
        const titleEl = document.getElementById('top-vendors-title');
        if (!container) return;
        const savedVendors = getSavedVendors();
        titleEl.textContent = savedVendors ? 'Vendedores Selecionados (Mês)' : 'Top 5 Vendedores (Mês)';
        const wrapper = container.parentElement;
        const emptyMessage = wrapper.querySelector('.product-list-empty');
        if(emptyMessage) emptyMessage.remove();
        if (!data || data.length === 0) {
            wrapper.innerHTML += '<p class="product-list-empty">Nenhum dado de vendedor para exibir.</p>';
            return;
        }
        const labels = data.map(v => v.vendedor);
        const values = data.map(v => v.total);
        const vibrantColors = ['#007BFF', '#6610f2', '#6f42c1', '#d63384', '#fd7e14', '#ffc107', '#198754', '#20c997', '#0dcaf0', '#6c757d'];
        chartInstances['topVendorsChart'] = new Chart(container.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{ label: 'Vendas', data: values, backgroundColor: vibrantColors, }]
            },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, grid: { drawBorder: false }, ticks: { callback: function(value) { if (value >= 1000) { return 'R$ ' + (value / 1000) + 'k'; } return 'R$ ' + value; } } }, y: { grid: { display: false, drawBorder: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed.x)}` } } } }
        });
    }

    function getSavedVendors() {
        const saved = localStorage.getItem(VENDORS_STORAGE_KEY);
        return saved ? JSON.parse(saved) : null;
    }

    async function loadTopVendorsChart() {
        const chartWrapper = document.querySelector('[data-card-id="chart_top_vendors"]');
        const loader = chartWrapper.querySelector('.card-loader') || document.createElement('div');
        if (!loader.parentElement) { loader.className = 'card-loader'; chartWrapper.appendChild(loader); }
        loader.classList.add('visible');
        try {
            const selectedVendors = getSavedVendors();
            let url = `${API_BASE_URL}/dashboard/top-vendors-month`;
            if (selectedVendors && selectedVendors.length > 0) {
                const params = new URLSearchParams();
                selectedVendors.forEach(v => params.append('selected_vendors[]', v));
                url += `?${params.toString()}`;
            }
            const topVendorsData = await fazerRequisicaoAutenticada(url);
            renderTopVendorsChart(topVendorsData || []);
        } catch (error) {
            console.error("Falha ao carregar dados dos vendedores:", error);
        } finally {
            loader.classList.remove('visible');
        }
    }

    async function loadDashboardData() {
        if (!document.hidden) {
            try {
                const [kpiData, monthlyPerformance, metasProgressData, proactiveAlerts] = await Promise.all([
                    fazerRequisicaoAutenticada(`${API_BASE_URL}/dashboard/kpis`),
                    fazerRequisicaoAutenticada(`${API_BASE_URL}/dashboard/monthly-performance`),
                    fazerRequisicaoAutenticada(`${API_BASE_URL}/dashboard/metas-progress`),
                    fazerRequisicaoAutenticada(`${API_BASE_URL}/alerts/proactive`)
                ]);

                if (kpiData) updateKpiCards(kpiData);
                if (monthlyPerformance) renderMonthlyPerformanceChart(monthlyPerformance);
                if (metasProgressData) renderMetasProgress(metasProgressData);
                if (proactiveAlerts) renderProactiveAlerts(proactiveAlerts);
                
            } catch (error) { 
                console.error("Falha ao carregar dados do dashboard:", error); 
                if(tvModeInterval) deactivateTvMode();
            }
        }
    }

    function initializeVendorSelection() {
        const modal = document.getElementById('vendor-select-modal-overlay');
        const openBtn = document.getElementById('select-vendors-btn');
        if (!modal || !openBtn) return;
        
        const cancelBtn = document.getElementById('cancel-vendor-select-btn');
        const closeBtn = document.getElementById('cancel-vendor-select-btn-close');
        const saveBtn = document.getElementById('save-vendor-select-btn');
        const selectAllBtn = document.getElementById('modal-vendor-select-all');
        const deselectAllBtn = document.getElementById('modal-vendor-deselect-all');
        const vendorListContainer = document.getElementById('modal-vendor-list');

        const openModal = async () => {
            vendorListContainer.innerHTML = '<p class="product-list-empty">Carregando...</p>';
            modal.classList.add('visible');
            try {
                const allVendors = await fazerRequisicaoAutenticada('/vendas/vendedores');
                const savedVendors = getSavedVendors();
                const currentlySelected = savedVendors || allVendors || [];
                if (allVendors && allVendors.length > 0) {
                    vendorListContainer.innerHTML = allVendors.map(vendor => {
                        const isChecked = currentlySelected.includes(vendor) ? 'checked' : '';
                        return `<label class="custom-checkbox"><input type="checkbox" name="vendors" value="${vendor}" ${isChecked}><span class="checkmark"></span>${vendor}</label>`;
                    }).join('');
                } else {
                    vendorListContainer.innerHTML = '<p class="product-list-empty">Nenhum vendedor encontrado.</p>';
                }
            } catch (e) {
                vendorListContainer.innerHTML = `<p class="product-list-empty" style="color: var(--kpi-red);">${e.message}</p>`;
            }
        };
        const closeModal = () => modal.classList.remove('visible');
        const saveSelection = () => {
            const selected = Array.from(vendorListContainer.querySelectorAll('input[name="vendors"]:checked')).map(cb => cb.value);
            localStorage.setItem(VENDORS_STORAGE_KEY, JSON.stringify(selected));
            closeModal();
            loadTopVendorsChart();
        };

        openBtn.addEventListener('click', openModal);
        cancelBtn.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        saveBtn.addEventListener('click', saveSelection);
        selectAllBtn.addEventListener('click', () => vendorListContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true));
        deselectAllBtn.addEventListener('click', () => vendorListContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false));
    }
    
    function activateTvMode() {
        if (tvModeInterval) return;
        window.open('/tv', '_blank');
    }

    function initializeTvModeControls() {
        const tvModeBtn = document.getElementById('sidebar-tv-mode-btn');
        if (tvModeBtn) {
            tvModeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                activateTvMode();
            });
        }
    }

    showLoading();
    await loadDashboardData();
    await loadTopVendorsChart();
    hideLoading();
    
    initializeAlertsModal(); // ### INICIALIZAÇÃO DO MODAL ADICIONADA AQUI ###
    initializeTvModeControls();
    initializeVendorSelection();
})();