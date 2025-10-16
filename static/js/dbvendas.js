// static/js/dbvendas.js
// Este arquivo contém a lógica principal, de inicialização e de busca de dados para o módulo de Vendas.

(async () => {
    let topProductsDataStore = {}; 
    let analysisFilters = {}; // Filtros para a aba "Análise de Vendas"
    let vendorFilters = {};   // Filtros para a aba "Vendedores"

    // --- FUNÇÕES DE CARREGAMENTO DE DADOS ESPECÍFICAS ---
    async function loadAnnualSalesData(year1, year2) {
        const chartWrapper = document.querySelector('[data-card-id="chart_annual_sales"]');
        const loader = chartWrapper.querySelector('.card-loader') || document.createElement('div');
        if (!loader.parentElement) { loader.className = 'card-loader'; chartWrapper.appendChild(loader); }
        loader.classList.add('visible');

        try {
            const params = new URLSearchParams();
            if (year1) params.append('year1', year1);
            if (year2) params.append('year2', year2);
            
            const annualData = await fazerRequisicaoAutenticada(`/vendas/annual-summary?${params.toString()}`);
            if (annualData) renderAnnualSalesChart(annualData);
        } catch (error) {
            console.error("Falha ao carregar dados anuais:", error);
        } finally {
            loader.classList.remove('visible');
        }
    }

    // --- FUNÇÃO PRINCIPAL DE CARREGAMENTO DE DADOS ---
    async function loadDataForActiveTab() {
        showLoading();
        
        try {
            const activeTab = document.querySelector('.main-nav[data-module="module-vendas"] .nav-button.active').dataset.target;

            if (activeTab === 'content-vendas-analise') {
                let urlParams = new URLSearchParams({ 
                    start_date: analysisFilters.start_date, 
                    end_date: analysisFilters.end_date 
                });
                if (analysisFilters.selected_vendors && analysisFilters.selected_vendors.length > 0) {
                    analysisFilters.selected_vendors.forEach(v => urlParams.append('selected_vendors[]', v));
                }

                document.getElementById('sales-filter-btn').style.display = 'inline-flex';

                const [summaryData, dailySalesData, marginData] = await Promise.all([
                    fazerRequisicaoAutenticada(`/vendas/summary?${urlParams.toString()}`),
                    fazerRequisicaoAutenticada('/dashboard/daily-sales?days=7'),
                    fazerRequisicaoAutenticada(`/vendas/sales-margin-evolution?${urlParams.toString()}`)
                ]);
                
                if (summaryData) {
                    updateSalesKpiCards(summaryData.summary);
                    renderPeakHoursChart(summaryData.peak_hours_data);
                    renderPaymentMethodsChart(summaryData.payment_methods_data);
                    topProductsDataStore.revenue = summaryData.top_products_data || {};
                    topProductsDataStore.profit = summaryData.top_products_profit_data || {};
                    renderTopProductsChart(topProductsDataStore.revenue, 'Faturamento');
                    renderSalesByGroupChart(summaryData.sales_by_group_data);
                }
                if (dailySalesData) renderDailySalesChartVendas(dailySalesData);
                if (marginData) renderProfitMarginChart(marginData);
                
                // ### ALTERAÇÃO APLICADA AQUI: Carrega o gráfico anual com os valores padrão ###
                const today = new Date();
                await loadAnnualSalesData(today.getFullYear(), today.getFullYear() - 1);

            } else if (activeTab === 'content-vendas-vendedores') {
                document.getElementById('sales-filter-btn').style.display = 'none';
                
                let urlParams = new URLSearchParams({ 
                    start_date: vendorFilters.start_date, 
                    end_date: vendorFilters.end_date 
                });
                 if (vendorFilters.selected_vendors && vendorFilters.selected_vendors.length > 0) {
                    vendorFilters.selected_vendors.forEach(v => urlParams.append('selected_vendors[]', v));
                }

                const rankingData = await fazerRequisicaoAutenticada(`/vendas/ranking-vendedores?${urlParams.toString()}`);
                
                if (rankingData) {
                    renderVendedoresRanking(rankingData);
                    
                    const top10Vendors = rankingData.slice(0, 10);
                    const vendorPerformanceData = top10Vendors.reduce((acc, vendor) => {
                        acc[vendor.vendedor] = vendor.faturamento_total;
                        return acc;
                    }, {});
                    renderVendorPerformanceChart(vendorPerformanceData);

                    if (vendorFilters.selected_vendor_single) {
                        document.getElementById('vendor-specific-charts').style.display = 'grid';
                        document.getElementById('vendor-ranking-card').style.display = 'none';
                        
                        const vendorParams = new URLSearchParams({ 
                            start_date: vendorFilters.start_date, 
                            end_date: vendorFilters.end_date, 
                            vendedor_nome: vendorFilters.selected_vendor_single 
                        });
                        
                        const [topProductsData, topCustomersData, salesEvolutionData] = await Promise.all([
                            fazerRequisicaoAutenticada(`/vendas/top-products-vendedor?${vendorParams.toString()}`),
                            fazerRequisicaoAutenticada(`/vendas/top-customers-vendedor?${vendorParams.toString()}`),
                            fazerRequisicaoAutenticada(`/vendas/sales-evolution-vendedor?${vendorParams.toString()}`)
                        ]);
                        
                        renderTopProductsVendedorChart(topProductsData, vendorFilters.selected_vendor_single);
                        renderTopCustomersList(topCustomersData, vendorFilters.selected_vendor_single);
                        renderSalesEvolutionVendorChart(salesEvolutionData, vendorFilters.selected_vendor_single);

                    } else {
                        document.getElementById('vendor-specific-charts').style.display = 'none';
                        document.getElementById('vendor-ranking-card').style.display = 'block';
                    }
                }
            }
        } catch (error) { console.error("Falha ao carregar dados de vendas:", error); } 
        finally { hideLoading(); }
    }

    // --- FUNÇÕES DE INICIALIZAÇÃO E EVENTOS ---

    // ### ALTERAÇÃO APLICADA AQUI: Função reescrita para controlar o novo modal ###
    function initializeAnnualSalesFilter() {
        const modal = document.getElementById('annual-sales-filter-modal');
        const openBtn = document.getElementById('open-annual-sales-filter-btn');
        const closeBtn = document.getElementById('close-annual-sales-modal-btn');
        const cancelBtn = document.getElementById('cancel-annual-sales-modal-btn');
        const applyBtn = document.getElementById('apply-modal-annual-sales-filter');
        const year1Input = document.getElementById('modal-annual-sales-year1');
        const year2Input = document.getElementById('modal-annual-sales-year2');
        
        const openModal = () => {
            const today = new Date();
            // Preenche com os valores atuais ou padrão ao abrir
            year1Input.value = year1Input.value || today.getFullYear();
            year2Input.value = year2Input.value || today.getFullYear() - 1;
            modal.classList.add('visible');
        };

        const closeModal = () => modal.classList.remove('visible');

        const applyFilter = () => {
            const year1 = parseInt(year1Input.value, 10);
            const year2 = parseInt(year2Input.value, 10);
            if (year1 && year2 && year1 > 1900 && year2 > 1900) {
                loadAnnualSalesData(year1, year2);
                closeModal();
            } else {
                alert("Por favor, insira dois anos válidos.");
            }
        };

        if (openBtn) openBtn.addEventListener('click', openModal);
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        if (applyBtn) applyBtn.addEventListener('click', applyFilter);
        if (modal) modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    function initializeSalesModal() {
        const salesFilterBtn = document.getElementById('sales-filter-btn');
        const salesFilterModal = document.getElementById('sales-filter-modal-overlay');
        const cancelSalesFilterBtn = document.getElementById('cancel-sales-filter-btn');
        const applySalesFilterBtn = document.getElementById('apply-sales-filter-btn');
        const salesStartDateInput = document.getElementById('start-date');
        const salesEndDateInput = document.getElementById('end-date');
        
        async function openSalesModal() {
            salesStartDateInput.value = analysisFilters.start_date;
            salesEndDateInput.value = analysisFilters.end_date;

            const vendorListDiv = document.getElementById('vendor-list');
            vendorListDiv.innerHTML = '<p class="product-list-empty">Carregando vendedores...</p>';
            try {
                const vendors = await fazerRequisicaoAutenticada(`/vendas/vendedores`);
                if (vendors && vendors.length > 0) {
                    vendorListDiv.innerHTML = '';
                    const checkedVendors = analysisFilters.selected_vendors || vendors;
                    vendors.forEach(vendor => {
                        const isChecked = checkedVendors.includes(vendor) ? 'checked' : '';
                        vendorListDiv.innerHTML += `<label class="custom-checkbox"><input type="checkbox" name="vendors" value="${vendor}" ${isChecked}><span class="checkmark"></span><span class="label-text">${vendor}</span></label>`;
                    });
                } else {
                    vendorListDiv.innerHTML = '<p class="product-list-empty">Nenhum vendedor encontrado.</p>';
                }
            } catch (e) {
                vendorListDiv.innerHTML = '<p class="product-list-empty">Falha ao carregar vendedores.</p>';
            }
            if (salesFilterModal) salesFilterModal.classList.add('visible');
        }
        
        function applyAnalysisFilters() {
            if (!salesStartDateInput.value || !salesEndDateInput.value) {
                alert("Por favor, selecione a data inicial e final."); return;
            }
            analysisFilters = {
                start_date: salesStartDateInput.value, 
                end_date: salesEndDateInput.value,
                selected_vendors: Array.from(document.querySelectorAll('#vendor-list input[name="vendors"]:checked')).map(cb => cb.value)
            };
            loadDataForActiveTab();
            salesFilterModal.classList.remove('visible');
        }

        if (salesFilterBtn) salesFilterBtn.addEventListener('click', openSalesModal);
        if (cancelSalesFilterBtn) cancelSalesFilterBtn.addEventListener('click', () => salesFilterModal.classList.remove('visible'));
        if (salesFilterModal) salesFilterModal.addEventListener('click', (e) => { if (e.target === salesFilterModal) salesFilterModal.classList.remove('visible'); });
        if (applySalesFilterBtn) applySalesFilterBtn.addEventListener('click', applyAnalysisFilters);
        
        document.querySelectorAll('.sales-preset-date-btn').forEach(button => {
            button.addEventListener('click', () => {
                const range = button.getAttribute('data-range');
                const today = new Date();
                let startDate, endDate = new Date();
                if (range === 'today') { startDate = today; } 
                else if (range === 'week') { const dayOfWeek = today.getDay(); startDate = new Date(new Date().setDate(today.getDate() - dayOfWeek)); } 
                else if (range === 'month') { startDate = new Date(today.getFullYear(), today.getMonth(), 1); } 
                else if (range === 'year') { startDate = new Date(today.getFullYear(), 0, 1); }
                salesStartDateInput.value = startDate.toISOString().split('T')[0];
                salesEndDateInput.value = endDate.toISOString().split('T')[0];
            });
        });

        const vendorSelectAll = document.getElementById('vendor-select-all');
        const vendorDeselectAll = document.getElementById('vendor-deselect-all');
        if (vendorSelectAll) vendorSelectAll.addEventListener('click', () => document.querySelectorAll('#vendor-list input[type="checkbox"]').forEach(cb => cb.checked = true));
        if (vendorDeselectAll) vendorDeselectAll.addEventListener('click', () => document.querySelectorAll('#vendor-list input[type="checkbox"]').forEach(cb => cb.checked = false));
    }
    
    function initializeVendorFilters() {
        const applyBtn = document.getElementById('apply-vendor-date-filter');
        const startDateInput = document.getElementById('vendor-start-date');
        const endDateInput = document.getElementById('vendor-end-date');
        const vendorSelect = document.getElementById('vendedor-select-filter');
        
        startDateInput.value = vendorFilters.start_date;
        endDateInput.value = vendorFilters.end_date;

        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                if (!startDateInput.value || !endDateInput.value) {
                    alert("Por favor, selecione a data inicial e final."); return;
                }
                vendorFilters.start_date = startDateInput.value;
                vendorFilters.end_date = endDateInput.value;
                loadDataForActiveTab();
            });
        }
        
        if(vendorSelect) {
             vendorSelect.addEventListener('change', (e) => {
                const selectedVendor = e.target.value;
                vendorFilters.selected_vendor_single = selectedVendor;
                vendorFilters.selected_vendors = selectedVendor ? [selectedVendor] : null;
                loadDataForActiveTab();
            });
        }
    }

    function initializeTabNavigation() {
        const navButtons = document.querySelectorAll('.main-nav[data-module="module-vendas"] .nav-button');
        const pages = document.querySelectorAll('#module-vendas .page');
        navButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetPageId = button.getAttribute('data-target');
                if (button.classList.contains('active')) return;
                navButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                pages.forEach(page => page.classList.toggle('active', page.id === targetPageId));
                loadDataForActiveTab();
            });
        });
    }

    async function populateVendorSelect() {
        const select = document.getElementById('vendedor-select-filter');
        if (!select) return;
        select.innerHTML = '<option value="">Visão Geral</option>';
        try {
            const vendors = await fazerRequisicaoAutenticada(`/vendas/vendedores`);
            if (vendors) {
                vendors.forEach(vendor => {
                    select.innerHTML += `<option value="${vendor}">${vendor}</option>`;
                });
            }
        } catch(e) { console.error("Falha ao popular select de vendedores:", e); }
    }

    function initializeTopProductsToggle() {
        const revenueBtn = document.getElementById('top-products-revenue-btn');
        const profitBtn = document.getElementById('top-products-profit-btn');
        if (revenueBtn && profitBtn) {
            revenueBtn.addEventListener('click', () => {
                if (topProductsDataStore.revenue) {
                    renderTopProductsChart(topProductsDataStore.revenue, 'Faturamento');
                    revenueBtn.classList.add('active');
                    profitBtn.classList.remove('active');
                }
            });
            profitBtn.addEventListener('click', () => {
                if (topProductsDataStore.profit) {
                    renderTopProductsChart(topProductsDataStore.profit, 'Lucro');
                    profitBtn.classList.add('active');
                    revenueBtn.classList.remove('active');
                }
            });
        }
    }

    function initializeDefaults() {
        const today = new Date();
        const y = today.getFullYear();
        const m = today.getMonth();
        const dayOfWeek = today.getDay();
        const firstDayOfWeek = new Date(new Date().setDate(today.getDate() - dayOfWeek));
        analysisFilters = {
            start_date: firstDayOfWeek.toISOString().split('T')[0],
            end_date: today.toISOString().split('T')[0],
            selected_vendors: [] 
        };
        const firstDayOfMonth = new Date(y, m, 1);
        const lastDayOfMonth = new Date(y, m + 1, 0);
        vendorFilters = {
            start_date: firstDayOfMonth.toISOString().split('T')[0],
            end_date: lastDayOfMonth.toISOString().split('T')[0],
            selected_vendor_single: '',
            selected_vendors: null
        };
    }

    initializeDefaults();
    initializeSalesModal();
    initializeVendorFilters();
    initializeTopProductsToggle();
    initializeTabNavigation();
    initializeAnnualSalesFilter();
    await populateVendorSelect();
    
    loadDataForActiveTab();
})();