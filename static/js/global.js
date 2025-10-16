// static/js/global.js

// --- FUNÇÃO DE NOTIFICAÇÃO ---
function showNotification(title, message, type = 'info') {
    const modal = document.getElementById('notification-modal-overlay');
    if (!modal) return;
    const iconEl = document.getElementById('notification-icon');
    const titleEl = document.getElementById('notification-title');
    const messageEl = document.getElementById('notification-message');
    modal.classList.remove('notification-success', 'notification-error', 'notification-warning', 'notification-info');
    titleEl.textContent = title;
    messageEl.innerHTML = message;
    let iconClass = 'bx bx-info-circle';
    switch (type) {
        case 'success': iconClass = 'bx bxs-check-circle'; break;
        case 'error': iconClass = 'bx bxs-x-circle'; break;
        case 'warning': iconClass = 'bx bxs-error-alt'; break;
    }
    iconEl.className = `notification-icon ${iconClass}`;
    modal.classList.add(`notification-${type}`);
    modal.classList.add('visible');
}

// --- FUNÇÃO DE CONFIRMAÇÃO GENÉRICA ---
function showConfirmationModal(title, message, confirmText = 'Confirmar', cancelText = 'Cancelar') {
    return new Promise(resolve => {
        const modal = document.getElementById('confirmation-modal-overlay');
        if (!modal) {
            console.warn("HTML do modal de confirmação não encontrado. Usando confirm() como fallback.");
            resolve(confirm(message));
            return;
        }

        const titleEl = document.getElementById('confirmation-title');
        const messageEl = document.getElementById('confirmation-message');
        const confirmBtn = document.getElementById('confirmation-confirm-btn');
        const cancelBtn = document.getElementById('confirmation-cancel-btn');

        titleEl.textContent = title;
        messageEl.textContent = message;
        confirmBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;
        
        modal.classList.add('visible');

        const handleConfirm = () => {
            modal.classList.remove('visible');
            resolve(true);
            removeListeners();
        };

        const handleCancel = () => {
            modal.classList.remove('visible');
            resolve(false);
            removeListeners();
        };
        
        const handleOverlayClick = (e) => {
            if (e.target === modal) handleCancel();
        };

        const removeListeners = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            modal.removeEventListener('click', handleOverlayClick);
        };
        
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleOverlayClick);
    });
}


// --- FUNÇÃO GLOBAL DE REQUISIÇÃO (ATUALIZADA) ---
async function fazerRequisicaoAutenticada(url, options = {}) {
    const token = sessionStorage.getItem('firebaseIdToken');
    if (!token) {
        showNotification("Sessão Expirada", "Sua sessão expirou. Por favor, faça o <a href='/login'>login novamente</a>.", "warning");
        setTimeout(() => window.location.href = '/login', 3000);
        throw new Error("Sessão Expirada");
    }
    
    // ### ALTERAÇÃO PRINCIPAL APLICADA AQUI ###
    // Prepara os cabeçalhos, mas remove o Content-Type se o corpo for FormData,
    // pois o navegador precisa definir isso automaticamente para uploads.
    const headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
    if (options.body instanceof FormData) {
        delete headers['Content-Type'];
    }

    const targetCompanyId = sessionStorage.getItem('targetCompanyId');
    if (targetCompanyId) {
        headers['X-Company-ID'] = targetCompanyId;
    }

    try {
        const response = await fetch(url, { ...options, headers });

        if (response.status === 401) {
            sessionStorage.removeItem('firebaseIdToken');
            sessionStorage.removeItem('targetCompanyId');
            const errorData = await response.json().catch(() => ({ detail: 'Seu token de acesso é inválido ou expirou.' }));
            showNotification("Sessão Expirada", `${errorData.detail} Você será redirecionado para a tela de login.`, "error");
            setTimeout(() => window.location.href = '/login', 3000);
            throw new Error(errorData.detail);
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Erro ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.detail);
        }

        if (response.status === 204) {
            return { status: 'success' };
        }
        
        return await response.json();

    } catch (error) {
        console.error(`Erro na requisição para ${url}:`, error.message);
        throw error;
    }
}


function showLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.classList.add('visible');
}

function hideLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.classList.remove('visible');
}

function showCompanySelectionModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('select-company-input-modal');
        if (!modal) {
            const cnpj = prompt("Modo Suporte: Insira o CNPJ da empresa:", "");
            resolve(cnpj);
            return;
        }
        const confirmBtn = document.getElementById('confirm-select-company-btn');
        const cancelBtn = document.getElementById('cancel-select-company-btn');
        const input = document.getElementById('company-id-input');
        input.value = '';

        modal.classList.add('visible');
        input.focus();

        const onConfirm = () => {
            if (input.value.trim()) {
                resolve(input.value.trim());
                cleanup();
            } else {
                showNotification('Atenção', 'O campo CNPJ/CPF não pode estar vazio.', 'warning');
            }
        };

        const onCancel = () => {
            resolve(null);
            cleanup();
        };

        const cleanup = () => {
            modal.classList.remove('visible');
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            input.removeEventListener('keypress', onKeyPress);
        };

        const onKeyPress = (e) => {
            if (e.key === 'Enter') onConfirm();
        };
        
        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        input.addEventListener('keypress', onKeyPress);
    });
}

async function showAllCompaniesModal() {
    const modal = document.getElementById('all-companies-modal-overlay');
    const listContainer = document.getElementById('all-companies-list');
    const searchInput = document.getElementById('all-companies-search');
    const closeBtn = document.getElementById('close-all-companies-modal-btn');
    if (!modal || !listContainer || !searchInput || !closeBtn) return;

    modal.classList.add('visible');
    listContainer.innerHTML = '<div class="spinner" style="margin: 40px auto;"></div>';
    
    try {
        const companies = await fazerRequisicaoAutenticada('/api/company/all');
        listContainer.innerHTML = '';

        if (companies && companies.length > 0) {
            companies.forEach(company => {
                const item = document.createElement('div');
                item.className = 'product-list-item company-selectable-item';
                item.dataset.name = `${company.nome_fantasia.toLowerCase()} ${company.cnpj}`;
                item.innerHTML = `
                    <div class="product-name">
                        <strong>${company.nome_fantasia}</strong><br>
                        <small>${company.cnpj}</small>
                    </div>
                    <i class='bx bx-right-arrow-alt'></i>
                `;
                item.addEventListener('click', () => {
                    showLoading();
                    localStorage.setItem('savedCompanyId', company.cnpj);
                    sessionStorage.setItem('targetCompanyId', company.cnpj);
                    window.location.href = '/login'; // Redireciona para o login para recarregar o contexto
                });
                listContainer.appendChild(item);
            });
        } else {
            listContainer.innerHTML = '<p class="product-list-empty">Nenhuma empresa encontrada.</p>';
        }
    } catch (error) {
        listContainer.innerHTML = `<p class="product-list-empty">Erro ao carregar empresas: ${error.message}</p>`;
    }

    const filterCompanies = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const items = listContainer.querySelectorAll('.company-selectable-item');
        items.forEach(item => {
            item.style.display = item.dataset.name.includes(searchTerm) ? 'flex' : 'none';
        });
    };

    searchInput.addEventListener('keyup', filterCompanies);
    closeBtn.addEventListener('click', () => modal.classList.remove('visible'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('visible');
    });
}


function safeLogout() {
    localStorage.removeItem('savedCompanyId');
    sessionStorage.removeItem('firebaseIdToken');
    sessionStorage.removeItem('targetCompanyId');
    
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().signOut().then(() => {
            window.location.href = '/login';
        }).catch((error) => {
            console.error('Logout Error', error);
            showNotification("Erro de Logout", "Ocorreu um problema ao tentar sair da sua conta.", "error");
            window.location.href = '/login';
        });
    } else {
        window.location.href = '/login';
    }
}

function showLogoutConfirmationModal() {
    const modal = document.getElementById('logout-confirmation-modal');
    if (!modal) {
        if (confirm("Deseja realmente sair da sua conta?")) {
            safeLogout();
        }
        return;
    }

    const switchCompanyBtn = document.getElementById('logout-modal-switch-company-btn');
    const confirmBtn = document.getElementById('logout-modal-confirm-btn');
    const closeBtn = document.getElementById('logout-modal-close-btn');

    const closeModal = () => modal.classList.remove('visible');

    const handleSwitchCompany = () => {
        closeModal();
        showAllCompaniesModal(); 
    };

    const handleConfirmLogout = () => {
        closeModal();
        safeLogout();
    };

    const cleanSwitchBtn = switchCompanyBtn.cloneNode(true);
    switchCompanyBtn.parentNode.replaceChild(cleanSwitchBtn, switchCompanyBtn);
    cleanSwitchBtn.addEventListener('click', handleSwitchCompany);

    const cleanConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(cleanConfirmBtn, confirmBtn);
    cleanConfirmBtn.addEventListener('click', handleConfirmLogout);

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    }, { once: true });

    modal.classList.add('visible');
}


// --- INICIALIZAÇÃO GLOBAL ---
document.addEventListener('DOMContentLoaded', () => {
    const token = sessionStorage.getItem('firebaseIdToken');
    if (!token && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
        return;
    }

    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarOverlay = document.querySelector('.sidebar-overlay');
    if (sidebarToggleBtn && sidebarOverlay) {
        sidebarToggleBtn.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
        sidebarOverlay.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) { 
        logoutBtn.addEventListener('click', (e) => { 
            e.preventDefault(); 
            showLogoutConfirmationModal(); 
        }); 
    }
    
    const companyNameEl = document.getElementById('sidebar-company-name');
    if (companyNameEl) {
        companyNameEl.addEventListener('click', (e) => {
            e.preventDefault();
            fazerRequisicaoAutenticada('/api/users/me').then(userData => {
                if (userData && userData.is_superadmin) {
                    showAllCompaniesModal();
                }
            }).catch(error => console.error("Não foi possível verificar o status de superadmin", error));
        });
    }

    const notificationModal = document.getElementById('notification-modal-overlay');
    const notificationCloseBtn = document.getElementById('notification-close-btn');
    if (notificationModal && notificationCloseBtn) {
        const closeModal = () => notificationModal.classList.remove('visible');
        notificationCloseBtn.addEventListener('click', closeModal);
        notificationModal.addEventListener('click', (e) => { if (e.target === notificationModal) closeModal(); });
    }

    window.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && ['+', '-', '0'].includes(event.key)) {
            event.preventDefault();
        }
    });

    window.addEventListener('wheel', (event) => {
        if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
        }
    }, { passive: false });

});