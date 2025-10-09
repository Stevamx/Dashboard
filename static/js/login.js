// static/js/login.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Variáveis do DOM ---
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginContainer = document.querySelector('.login-container');
    const panelModal = document.getElementById('panel-selection-modal');
    const logoutLink = document.getElementById('logout-link');
    const resetPasswordLink = document.getElementById('reset-password-link');
    const modalWelcomeMsg = document.getElementById('modal-welcome-message');
    const modalPanelLinks = document.getElementById('modal-panel-links');
    const modalCompanyInfo = document.getElementById('modal-company-info');
    const changeCompanyLink = document.getElementById('change-company-link');

    // --- Variáveis do Modal de Seleção de Empresa ---
    const companySelectionModal = document.getElementById('company-selection-modal');
    const companyLinksContainer = document.getElementById('modal-company-links');
    const companySelectionLogoutLink = document.getElementById('company-selection-logout-link');

    // --- Variáveis do Modal de Alterar Senha ---
    const changePasswordModal = document.getElementById('change-password-modal');
    const closePasswordModalBtn = document.getElementById('close-password-modal-btn');
    const cancelPasswordModalBtn = document.getElementById('cancel-password-modal-btn');
    const confirmPasswordChangeBtn = document.getElementById('confirm-password-change-btn');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');

    const auth = firebase.auth();

    // --- Funções de Lógica ---
    async function showAndGetPanels() {
        showLoading();
        try {
            const userData = await fazerRequisicaoAutenticada('/api/users/me');
            if (!userData) throw new Error("Dados do usuário não encontrados.");
            showPanelSelection(userData);
        } catch (error) {
            console.error("Erro ao carregar painéis:", error);
            showNotification('Erro de Permissão', `Não foi possível carregar seus dados. Erro: ${error.message}`, 'error');
            auth.signOut();
        } finally {
            hideLoading();
        }
    }

    function showCompanySelection(companies) {
        companyLinksContainer.innerHTML = '';
        companies.forEach(company => {
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'panel-card';
            link.dataset.cnpj = company.cnpj;
            link.innerHTML = `
                <div class="panel-icon"><i class='bx bxs-business'></i></div>
                <div class="panel-info">
                    <h3>${company.nome_fantasia}</h3>
                    <p>${company.cnpj}</p>
                </div>
                <div class="panel-arrow"><i class='bx bx-right-arrow-alt'></i></div>
            `;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                showLoading();
                localStorage.setItem('savedCompanyId', company.cnpj);
                sessionStorage.setItem('targetCompanyId', company.cnpj);
                window.location.href = '/login';
            });
            companyLinksContainer.appendChild(link);
        });

        loginContainer.classList.add('fade-out');
        companySelectionModal.classList.add('visible');
        hideLoading();
    }
    
    async function handleUserLogin(user) {
        try {
            const token = await user.getIdToken(true);
            sessionStorage.setItem('firebaseIdToken', token);
            
            if (sessionStorage.getItem('targetCompanyId')) {
                await showAndGetPanels();
                return;
            }

            showLoading();
            const companyData = await fazerRequisicaoAutenticada('/api/users/my-companies');
            
            if (companyData.is_superadmin) {
                hideLoading();
                const targetCnpj = await showCompanySelectionModal();
                if (targetCnpj) {
                    showLoading();
                    localStorage.setItem('savedCompanyId', targetCnpj);
                    sessionStorage.setItem('targetCompanyId', targetCnpj);
                    window.location.reload();
                    return;
                } else {
                    throw new Error("A seleção de uma empresa é obrigatória para o modo de suporte.");
                }
            } 
            
            if (companyData.companies.length === 0) {
                throw new Error("Nenhuma empresa associada à sua conta.");
            }
            if (companyData.companies.length === 1) {
                const cnpj = companyData.companies[0].cnpj;
                localStorage.setItem('savedCompanyId', cnpj);
                sessionStorage.setItem('targetCompanyId', cnpj);
                await showAndGetPanels();
            } else {
                hideLoading();
                showCompanySelection(companyData.companies);
            }
        } catch (error) {
            hideLoading();
            console.error("Erro no fluxo de login:", error);
            showNotification('Falha no Acesso', error.message, 'error');
            sessionStorage.removeItem('targetCompanyId');
            auth.signOut();
        }
    }

    function showPanelSelection(userData) {
        const allPanels = [
            { name: 'Painel de Análises', href: '/dashboard-web', icon: 'bxs-dashboard', description: 'Visualize e analise os dados da sua empresa.', accessKey: 'dashboard' },
            { name: 'Agente IA (LUCA)', href: '/chat', icon: 'bxs-bot', description: 'Converse com a IA para obter insights e relatórios.', accessKey: 'chat' },
            { name: 'Configurações', href: '/settings', icon: 'bxs-cog', description: 'Gerencie usuários, permissões e a IA.', accessKey: 'configuracoes' }
        ];

        modalWelcomeMsg.textContent = `Bem-vindo, ${userData.displayName || userData.email.split('@')[0]}!`;
        
        if (modalCompanyInfo && userData.company_name) {
            modalCompanyInfo.innerHTML = `
                <i class='bx bxs-business'></i>
                <span>${userData.company_name} (${userData.company_cnpj})</span>
            `;
        }
        
        modalPanelLinks.innerHTML = '';
        let availablePanels = 0;
        allPanels.forEach(panel => {
            if (userData.is_superadmin || (userData.access && userData.access[panel.accessKey] === true)) {
                availablePanels++;
                const link = document.createElement('a');
                link.href = panel.href;
                link.className = 'panel-card';
                link.innerHTML = `
                    <div class="panel-icon"><i class='bx ${panel.icon}'></i></div>
                    <div class="panel-info">
                        <h3>${panel.name}</h3>
                        <p>${panel.description}</p>
                    </div>
                    <div class="panel-arrow"><i class='bx bx-right-arrow-alt'></i></div>
                `;
                modalPanelLinks.appendChild(link);
            }
        });
        
        if (availablePanels === 0) {
             modalPanelLinks.innerHTML = '<p class="product-list-empty">Você não tem permissão para acessar nenhum painel.</p>';
        }

        if (changeCompanyLink) {
            changeCompanyLink.style.display = 'inline';
        }

        loginContainer.classList.add('fade-out');
        panelModal.classList.add('visible');
    }
    
    auth.onAuthStateChanged((user) => {
        if (user) {
            const savedCompanyId = localStorage.getItem('savedCompanyId');
            if (savedCompanyId && !sessionStorage.getItem('targetCompanyId')) {
                sessionStorage.setItem('targetCompanyId', savedCompanyId);
            }
            loginContainer.style.display = 'none';
            handleUserLogin(user);
        } else {
            localStorage.removeItem('savedCompanyId');
            sessionStorage.clear();
            loginContainer.style.display = 'block';
            loginContainer.classList.remove('fade-out');
            panelModal.classList.remove('visible');
            companySelectionModal.classList.remove('visible');
            hideLoading();
        }
    });
    
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        showLoading();
        const email = emailInput.value;
        const password = passwordInput.value;
        auth.signInWithEmailAndPassword(email, password)
            .then(userCredential => handleUserLogin(userCredential.user))
            .catch((error) => {
                let message = "Ocorreu um erro desconhecido.";
                 switch (error.code) {
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                    case 'auth/invalid-credential':
                        message = "E-mail ou senha inválidos.";
                        break;
                }
                hideLoading();
                showNotification('Falha no Login', message, 'error');
            });
    });

    // --- AJUSTE NOS LISTENERS DOS BOTÕES ---

    // Este listener garante que o botão "Sair da conta" da tela de painéis faça o logout.
    if(logoutLink) {
        logoutLink.addEventListener('click', (e) => { 
            e.preventDefault(); 
            auth.signOut(); 
        });
    }

    // Este listener garante que o botão "Sair da conta" da tela de seleção de empresa (multi-empresa) faça o logout.
    if(companySelectionLogoutLink) {
        companySelectionLogoutLink.addEventListener('click', (e) => { 
            e.preventDefault(); 
            auth.signOut(); 
        });
    }
    
    // Este listener foi corrigido para levar o usuário de volta à seleção de empresa.
    if (changeCompanyLink) {
        changeCompanyLink.addEventListener('click', (e) => {
            e.preventDefault();
            panelModal.classList.remove('visible'); // Esconde o modal de painéis
            sessionStorage.removeItem('targetCompanyId'); // Limpa a empresa da sessão
            localStorage.removeItem('savedCompanyId'); // Limpa a empresa salva
            handleUserLogin(auth.currentUser); // Reinicia o fluxo de login para forçar a seleção
        });
    }

    // Lógica do modal de alterar senha (sem alterações)
    if(resetPasswordLink) {
        resetPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            if(changePasswordModal) {
                changePasswordModal.classList.add('visible');
                newPasswordInput.focus();
            }
        });
    }
    function closeChangePasswordModal() {
        if(changePasswordModal) {
            changePasswordModal.classList.remove('visible');
            newPasswordInput.value = '';
            confirmPasswordInput.value = '';
        }
    }
    if(closePasswordModalBtn) closePasswordModalBtn.addEventListener('click', closeChangePasswordModal);
    if(cancelPasswordModalBtn) cancelPasswordModalBtn.addEventListener('click', closeChangePasswordModal);
    if(confirmPasswordChangeBtn) {
        confirmPasswordChangeBtn.addEventListener('click', async () => {
            const newPassword = newPasswordInput.value;
            const confirmPassword = confirmPasswordInput.value;
            if (newPassword.length < 6) {
                showNotification('Senha Inválida', 'A nova senha deve ter no mínimo 6 caracteres.', 'warning');
                return;
            }
            if (newPassword !== confirmPassword) {
                showNotification('Senhas não coincidem', 'Os campos de nova senha e confirmação devem ser iguais.', 'warning');
                return;
            }
            const user = auth.currentUser;
            if (!user) {
                showNotification('Erro', 'Usuário não autenticado. Por favor, faça login novamente.', 'error');
                return;
            }
            showLoading();
            try {
                await user.updatePassword(newPassword);
                hideLoading();
                closeChangePasswordModal();
                showNotification('Sucesso!', 'Sua senha foi alterada com sucesso.', 'success');
            } catch (error) {
                hideLoading();
                console.error('Erro ao alterar senha:', error);
                let errorMessage = 'Ocorreu um erro inesperado. Tente novamente.';
                if (error.code === 'auth/requires-recent-login') {
                    errorMessage = 'Esta é uma operação sensível. Por segurança, por favor, faça logout e login novamente antes de alterar a senha.';
                }
                showNotification('Erro de Segurança', errorMessage, 'error');
            }
        });
    }
});