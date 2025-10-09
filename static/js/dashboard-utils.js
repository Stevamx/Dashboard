// static/js/dashboard-utils.js

// --- CONFIGURAÇÃO PADRÃO DOS GRÁFICOS ---
Chart.defaults.color = '#6c757d'; 
Chart.defaults.borderColor = 'rgba(0, 0, 0, 0.1)';

// --- CONSTANTES E VARIÁVEIS GLOBAIS ---
const API_BASE_URL = "";
let chartInstances = {};

// --- FUNÇÕES DE FORMATAÇÃO E UTILITÁRIOS DE GRÁFICO ---
function destroyChart(chartId) { 
    if (chartInstances[chartId]) { 
        chartInstances[chartId].destroy(); 
        delete chartInstances[chartId]; 
    } 
}

function formatCurrency(value) { 
    return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); 
}

// --- NOVA FUNÇÃO ---
// Formata números grandes de forma abreviada (mil, milhão)
function formatCurrencyAbbreviated(value) {
    const num = value || 0;
    if (num < 1000) {
        return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    const suffixes = ["", "k", "mi", "bi", "tri"];
    const tier = Math.log10(Math.abs(num)) / 3 | 0;
    if (tier === 0) return num;
    const suffix = suffixes[tier];
    const scale = Math.pow(10, tier * 3);
    const scaled = num / scale;
    return 'R$ ' + scaled.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + suffix;
}


function formatComparison(current, previous, suffix) { 
    const el = document.createElement('span'); 
    if (previous === undefined || previous === null) { 
        el.textContent = current > 0 ? `▲ ${suffix}` : `● ${suffix}`; 
        el.className = current > 0 ? 'comparison positive' : 'comparison'; 
        return el; 
    } 
    const p = previous === 0 ? (current > 0 ? 100 : 0) : ((current - previous) / previous) * 100; 
    if (p > 0) { 
        el.textContent = `▲ ${p.toFixed(1)}% ${suffix}`; 
        el.className = 'comparison positive'; 
    } else if (p < 0) { 
        el.textContent = `▼ ${Math.abs(p).toFixed(1)}% ${suffix}`; 
        el.className = 'comparison negative'; 
    } else { 
        el.textContent = `● 0.0% ${suffix}`; 
        el.className = 'comparison'; 
    } 
    return el; 
}

function filterProductList(inputId, containerId) {
    const searchTerm = document.getElementById(inputId).value.toLowerCase();
    const container = document.getElementById(containerId);
    const items = container.querySelectorAll('.product-list-item');
    items.forEach(item => {
        const name = item.getAttribute('data-name');
        if (name.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}