// static/js/dashboard-tv-settings.js
document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById('open-tv-settings-btn');
    const modal = document.getElementById('tv-settings-modal-overlay');
    const closeBtn = document.getElementById('close-tv-settings-btn');
    const cancelBtn = document.getElementById('cancel-tv-settings-btn');
    const saveBtn = document.getElementById('save-tv-settings-btn');
    const availableCardsList = document.getElementById('available-cards-list');
    const previewGrid = document.getElementById('tv-preview-grid');

    const allCards = [
        { id: 'kpi_vendas_hoje', name: 'KPI: Vendas Hoje', icon: 'bxs-dollar-circle', defaultSize: 'small' },
        { id: 'kpi_pedidos_hoje', name: 'KPI: Pedidos Hoje', icon: 'bxs-cart', defaultSize: 'small' },
        { id: 'kpi_receita_mensal', name: 'KPI: Receita Mensal', icon: 'bxs-calendar', defaultSize: 'small' },
        { id: 'kpi_lucro_hoje', name: 'KPI: Lucro Hoje', icon: 'bx-line-chart', defaultSize: 'small' },
        { id: 'stock_kpi_total_value', name: 'KPI: Valor do Estoque', icon: 'bxs-package', defaultSize: 'small' },
        { id: 'chart_monthly_performance', name: 'Gráfico: Desempenho no Mês', icon: 'bxs-bar-chart-alt-2', defaultSize: 'medium' },
        { id: 'chart_top_vendors', name: 'Gráfico: Top Vendedores', icon: 'bxs-user-voice', defaultSize: 'medium' },
        { id: 'chart_daily_sales_vendas', name: 'Gráfico: Vendas Diárias', icon: 'bxs-bar-chart-alt-2', defaultSize: 'medium' },
        { id: 'chart_top_products', name: 'Gráfico: Top Produtos (Vendas)', icon: 'bxs-star', defaultSize: 'medium' },
        { id: 'metas_progress', name: 'Painel: Progresso de Metas', icon: 'bx-target-lock', defaultSize: 'large' }
    ];

    let currentLayout = [];

    function loadLayout() {
        const savedLayout = JSON.parse(localStorage.getItem('tvLayout')) || [];
        currentLayout = savedLayout.length > 0 ? savedLayout : [
            { id: 'kpi_vendas_hoje', size: 'small' },
            { id: 'chart_monthly_performance', size: 'medium' },
        ];
        renderPreview();
    }

    function renderAvailableCards() {
        availableCardsList.innerHTML = '';
        allCards.forEach(card => {
            const item = document.createElement('div');
            item.className = 'available-card-item';
            item.draggable = true;
            item.dataset.id = card.id;
            item.dataset.defaultSize = card.defaultSize;
            item.innerHTML = `<i class='bx ${card.icon}'></i><span>${card.name}</span>`;
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({ id: card.id, size: card.defaultSize }));
            });
            availableCardsList.appendChild(item);
        });
    }

    function renderPreview() {
        previewGrid.innerHTML = '';
        currentLayout.forEach((card, index) => {
            const cardInfo = allCards.find(c => c.id === card.id);
            if (!cardInfo) return;

            const previewCard = document.createElement('div');
            previewCard.className = `tv-preview-card size-${card.size}`;
            previewCard.dataset.index = index;
            previewCard.innerHTML = `
                <div class="tv-preview-card-content">
                    <i class='bx ${cardInfo.icon}'></i>
                    <span>${cardInfo.name}</span>
                </div>
                <div class="tv-preview-card-controls">
                    <button class="tv-card-control-btn" data-action="resize" data-size="small" title="Pequeno">P</button>
                    <button class="tv-card-control-btn" data-action="resize" data-size="medium" title="Médio">M</button>
                    <button class="tv-card-control-btn" data-action="resize" data-size="large" title="Grande">G</button>
                    <button class="tv-card-control-btn delete" data-action="delete" title="Remover"><i class='bx bx-x'></i></button>
                </div>
            `;
            previewGrid.appendChild(previewCard);
        });
    }

    previewGrid.addEventListener('click', (e) => {
        const button = e.target.closest('.tv-card-control-btn');
        if (!button) return;

        const cardElement = button.closest('.tv-preview-card');
        const index = parseInt(cardElement.dataset.index, 10);
        const action = button.dataset.action;

        if (action === 'delete') {
            currentLayout.splice(index, 1);
        } else if (action === 'resize') {
            currentLayout[index].size = button.dataset.size;
        }
        renderPreview();
    });

    previewGrid.addEventListener('dragover', (e) => e.preventDefault());
    previewGrid.addEventListener('drop', (e) => {
        e.preventDefault();
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        currentLayout.push({ id: data.id, size: data.size });
        renderPreview();
    });

    // --- ALTERAÇÃO APLICADA AQUI ---
    saveBtn.addEventListener('click', () => {
        const refreshIntervalInput = document.getElementById('tv-refresh-interval');
        const refreshInterval = parseInt(refreshIntervalInput.value, 10);

        if (!refreshInterval || refreshInterval < 1) {
            showNotification("Atenção", "O intervalo de atualização deve ser de no mínimo 1 minuto.", "warning");
            return;
        }

        localStorage.setItem('tvRefreshInterval', refreshInterval);
        localStorage.setItem('tvLayout', JSON.stringify(currentLayout));
        window.open('/tv', '_blank');
        closeModal();
    });
    
    // --- ALTERAÇÃO APLICADA AQUI ---
    const openModal = () => {
        const savedInterval = localStorage.getItem('tvRefreshInterval') || 5;
        document.getElementById('tv-refresh-interval').value = savedInterval;
        loadLayout(); 
        modal.classList.add('visible'); 
    };
    
    const closeModal = () => modal.classList.remove('visible');

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    renderAvailableCards();
});