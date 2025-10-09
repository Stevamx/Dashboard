// static/js/dbmetas.js
(async () => {
    // A lógica original de metas.js foi encapsulada para funcionar como um módulo
    const metaModal = document.getElementById('meta-modal-overlay');
    const openModalBtn = document.getElementById('open-meta-modal-btn');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    const closeBtn = document.getElementById('cancel-edit-btn-close');
    const saveBtn = document.getElementById('save-meta-btn');
    const modalTitle = document.getElementById('modal-title');
    const tableBody = document.getElementById('metas-table-body');
    const form = document.getElementById('meta-form');
    const indicadorSelect = document.getElementById('indicador');
    const mesSelect = document.getElementById('mes');
    const anoInput = document.getElementById('ano');
    const valorInput = document.getElementById('valor');

    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    
    function populateFormDefaults() {
        mesSelect.innerHTML = meses.map((nome, index) => `<option value="${index + 1}">${nome}</option>`).join('');
        const today = new Date();
        anoInput.value = today.getFullYear();
        mesSelect.value = today.getMonth() + 1;
    }

    function resetForm() {
        form.reset();
        modalTitle.textContent = "Definir Nova Meta";
        [indicadorSelect, mesSelect, anoInput].forEach(el => el.disabled = false);
        populateFormDefaults();
        form.removeAttribute('data-editing'); 
    }
    
    function closeModal() { if (metaModal) metaModal.classList.remove('visible'); }
    function openModal() { if (metaModal) metaModal.classList.add('visible'); }

    async function loadMetas() {
        showLoading();
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="4">Carregando metas...</td></tr>';
        try {
            const metas = await fazerRequisicaoAutenticada('/api/metas');
            if (tableBody) tableBody.innerHTML = '';
            if (metas && metas.length > 0) {
                metas.forEach(meta => {
                    const tr = document.createElement('tr');
                    tr.dataset.indicador = meta.indicador;
                    tr.dataset.ano = meta.ano;
                    tr.dataset.mes = meta.mes;
                    
                    const indicadorText = indicadorSelect.querySelector(`option[value="${meta.indicador}"]`)?.textContent || meta.indicador;
                    
                    tr.innerHTML = `
                        <td data-label="Indicador">${indicadorText}</td>
                        <td data-label="Período">${meses[meta.mes - 1]}/${meta.ano}</td>
                        <td data-label="Valor" class="meta-valor">${formatCurrency(meta.valor)}</td>
                        <td data-label="Ações" class="actions-cell">
                            <button class="action-btn-icon edit" title="Editar"><i class='bx bxs-pencil'></i></button>
                            <button class="action-btn-icon delete" title="Excluir"><i class='bx bxs-trash'></i></button>
                        </td>
                    `;
                    
                    tr.querySelector('.edit').addEventListener('click', () => {
                        modalTitle.textContent = "Editar Meta";
                        indicadorSelect.value = meta.indicador;
                        mesSelect.value = meta.mes;
                        anoInput.value = meta.ano;
                        valorInput.value = meta.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                        [indicadorSelect, mesSelect, anoInput].forEach(el => el.disabled = true);
                        form.setAttribute('data-editing', 'true');
                        openModal();
                    });

                    tr.querySelector('.delete').addEventListener('click', async () => {
                        const confirmed = await showConfirmationModal( 'Confirmar Exclusão', `Tem certeza que deseja excluir a meta de ${indicadorText} para ${meses[meta.mes - 1]}/${meta.ano}?` );
                        if (confirmed) {
                            showLoading();
                            const payload = {
                                indicador: meta.indicador,
                                ano: meta.ano,
                                mes: meta.mes
                            };
                            await fazerRequisicaoAutenticada('/api/metas', { 
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            await loadMetas();
                        }
                    });
                    tableBody.appendChild(tr);
                });
            } else if (tableBody) {
                tableBody.innerHTML = '<tr><td colspan="4">Nenhuma meta definida.</td></tr>';
            }
        } catch(e) {
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="4">Erro ao carregar metas: ${e.message}</td></tr>`;
        } finally {
            hideLoading();
        }
    }
    
    function parseCurrency(value) {
        return parseFloat(String(value).replace(/R\$\s?/, '').replace(/\./g, '').replace(',', '.')) || 0;
    }
    
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }
            showLoading();
            const metaData = {
                indicador: indicadorSelect.value,
                ano: parseInt(anoInput.value),
                mes: parseInt(mesSelect.value),
                valor: parseCurrency(valorInput.value)
            };
            await fazerRequisicaoAutenticada('/api/metas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(metaData)
            });
            closeModal();
            await loadMetas();
        });
    }

    if (valorInput) {
        valorInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (!value) return;
            value = (parseFloat(value) / 100);
            e.target.value = value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        });
    }

    if (openModalBtn) openModalBtn.addEventListener('click', () => { resetForm(); openModal(); });
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (metaModal) metaModal.addEventListener('click', (e) => { if (e.target === metaModal) closeModal(); });

    populateFormDefaults();
    await loadMetas();
})();