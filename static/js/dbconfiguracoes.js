// static/js/dbconfiguracoes.js
(async () => {
    // --- LÓGICA DE NAVEGAÇÃO POR ABAS (INTERNAS DO MÓDULO) ---
    function initializeSimpleTabNavigation() {
        // ### CORREÇÃO APLICADA AQUI ###
        // O seletor dos botões foi ajustado para encontrar a barra de navegação
        // pelo seu atributo 'data-module', já que ela não fica dentro do #module-configuracoes.
        const navButtons = document.querySelectorAll('nav[data-module="module-configuracoes"] .nav-button[data-target]');
        const pages = document.querySelectorAll('#module-configuracoes .page');
        
        navButtons.forEach(button => {
            button.addEventListener('click', () => {
                if (button.classList.contains('active')) return;
                
                const targetId = button.getAttribute('data-target');
                
                // Atualiza o estado dos botões da navegação
                navButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Lógica de troca de página corrigida para ser mais explícita
                
                // 1. Esconde todas as páginas
                pages.forEach(page => page.classList.remove('active'));
                
                // 2. Mostra apenas a página alvo
                const targetPage = document.getElementById(targetId);
                if (targetPage) {
                    targetPage.classList.add('active');
                }
            });
        });
    }

    // --- LÓGICA DE GERENCIAMENTO DE USUÁRIOS ---
    // ### ALTERAÇÃO APLICADA AQUI: Simplificação das chaves de acesso ###
    const accessHierarchy = {
        'Permissões de Acesso': {
            'vendas': 'Painel de Vendas (inclui Dashboard Geral e Metas)',
            'estoque': 'Painel de Estoque',
            'luca': 'Assistente IA (Luca)',
            'configuracoes': 'Painel de Configurações'
        }
    };

    function populateAccessCheckboxes(containerId, inputName, checkedData = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        for (const groupName in accessHierarchy) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'access-group';
            const groupTitle = document.createElement('h4');
            groupTitle.textContent = groupName;
            groupDiv.appendChild(groupTitle);
            const gridDiv = document.createElement('div');
            gridDiv.className = 'access-grid';
            for (const key in accessHierarchy[groupName]) {
                const isChecked = checkedData[key] === true;
                const label = document.createElement('label');
                label.className = 'custom-checkbox';
                label.innerHTML = `<input type="checkbox" name="${inputName}" value="${key}" ${isChecked ? 'checked' : ''}><span class="checkmark"></span><span class="label-text">${accessHierarchy[groupName][key]}</span>`;
                gridDiv.appendChild(label);
            }
            groupDiv.appendChild(gridDiv);
            container.appendChild(groupDiv);
        }
    }

    const usersTableBody = document.querySelector('#users-table tbody');
    const editUserModalOverlay = document.getElementById('edit-user-modal-overlay');
    
    const editUserForm = document.getElementById('edit-user-form');
    const editRoleSelect = document.getElementById('edit-role');
    const closeEditModalBtn = document.getElementById('close-edit-modal-btn');
    const cancelEditModalBtn = document.getElementById('cancel-edit-modal-btn');

    async function loadUsers() {
        showLoading();
        if(usersTableBody) usersTableBody.innerHTML = '<tr><td colspan="4">Carregando usuários...</td></tr>';
        try {
            const users = await fazerRequisicaoAutenticada('/admin/users');
            if (users && usersTableBody) {
                usersTableBody.innerHTML = '';
                if (users.length === 0) {
                     usersTableBody.innerHTML = '<tr><td colspan="4">Nenhum usuário cadastrado.</td></tr>';
                } else {
                    users.forEach(user => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td data-label="Nome">${user.username || 'N/A'}</td>
                            <td data-label="E-mail">${user.email}</td>
                            <td data-label="Permissão"><span class="role-badge role-${user.papel || 'usuario'}">${user.papel || 'Usuário'}</span></td>
                            <td data-label="Ações" class="actions-cell">
                                <button class="action-btn-icon edit" title="Editar Usuário" data-uid="${user.uid}"><i class='bx bxs-pencil'></i></button>
                                <button class="action-btn-icon delete" title="Excluir Usuário" data-uid="${user.uid}"><i class='bx bxs-trash'></i></button>
                            </td>
                        `;
                        usersTableBody.appendChild(tr);
                    });
                    addTableActionListeners();
                }
            }
        } catch(e) {
            if (usersTableBody) {
                usersTableBody.innerHTML = `<tr><td colspan="4">Falha ao carregar usuários. ${e.message}</td></tr>`;
            }
        } finally {
            hideLoading();
        }
    }

    function addTableActionListeners() {
        document.querySelectorAll('#module-configuracoes .action-btn-icon.delete').forEach(button => {
            button.addEventListener('click', (e) => {
                const uid = e.currentTarget.getAttribute('data-uid');
                handleDeleteUser(uid);
            });
        });
        document.querySelectorAll('#module-configuracoes .action-btn-icon.edit').forEach(button => {
            button.addEventListener('click', (e) => {
                const uid = e.currentTarget.getAttribute('data-uid');
                openEditModal(uid);
            });
        });
    }

    async function handleDeleteUser(uid) {
        const confirmed = await showConfirmationModal( 'Confirmar Exclusão', 'Tem certeza que deseja excluir este usuário? Esta ação é irreversível.' );
        if (confirmed) {
            showLoading();
            try {
                await fazerRequisicaoAutenticada(`/admin/users/${uid}`, { method: 'DELETE' });
                showNotification('Sucesso', 'Usuário excluído com sucesso!', 'success');
                await loadUsers();
            } catch(e) {
                showNotification('Erro', e.message, 'error');
            } finally {
                hideLoading();
            }
        }
    }

    async function openEditModal(uid) {
        showLoading();
        try {
            const userData = await fazerRequisicaoAutenticada(`/admin/users/${uid}`);
            if (userData && editUserModalOverlay) {
                document.getElementById('edit-user-uid').value = uid;
                document.getElementById('edit-username').value = userData.username;
                document.getElementById('edit-email').value = userData.email;
                editRoleSelect.value = userData.papel;
                populateAccessCheckboxes('edit-access-groups', 'edit_acessos', userData.acessos);
                editRoleSelect.dispatchEvent(new Event('change'));
                editUserModalOverlay.classList.add('visible');
            }
        } catch(e) {
            showNotification('Erro', 'Não foi possível carregar os dados do usuário para edição.', 'error');
        } finally {
            hideLoading();
        }
    }
    
    // --- LÓGICA PARA O PAINEL DA IA ---
    const aiForm = document.getElementById('ai-settings-form');
    const aiPrompt = document.getElementById('ai-prompt');
    const aiFormMessage = document.getElementById('ai-form-message');

    async function loadAiSettings() {
        if (!aiForm) return; 
        aiFormMessage.textContent = '';
        try {
            const settings = await fazerRequisicaoAutenticada('/admin/settings/ai');
            if (settings) {
                aiPrompt.value = settings.prompt || '';
            }
        } catch (e) {
            aiFormMessage.textContent = `Erro ao carregar: ${e.message}`;
            aiFormMessage.className = 'form-message error';
        }
    }

    if (aiForm) {
        aiForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoading();
            aiFormMessage.textContent = '';
            try {
                await fazerRequisicaoAutenticada('/admin/settings/ai', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: aiPrompt.value })
                });
                aiFormMessage.textContent = 'Configurações salvas com sucesso!';
                aiFormMessage.className = 'form-message success';
            } catch (error) {
                aiFormMessage.textContent = `Erro ao salvar: ${error.message}`;
                aiFormMessage.className = 'form-message error';
            } finally {
                hideLoading();
            }
        });
    }

    // --- INICIALIZAÇÃO GERAL DO MÓDULO ---
    initializeSimpleTabNavigation();
    loadUsers();
    loadAiSettings();

    // Event listeners dos modais e formulários de edição
    if (editUserForm) {
        editUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoading();
            const uid = document.getElementById('edit-user-uid').value;
            const username = document.getElementById('edit-username').value;
            const papel = document.getElementById('edit-role').value;
            const acessos = {};
            document.querySelectorAll('input[name="edit_acessos"]:checked').forEach(checkbox => { acessos[checkbox.value] = true; });
            try {
                await fazerRequisicaoAutenticada(`/admin/users/${uid}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, papel, acessos })
                });
                showNotification('Sucesso!', 'Usuário atualizado com sucesso!', 'success');
                editUserModalOverlay.classList.remove('visible');
                await loadUsers();
            } catch(e) {
                showNotification('Erro', e.message, 'error');
            } finally {
                hideLoading();
            }
        });
    }

    if(closeEditModalBtn) {
        closeEditModalBtn.addEventListener('click', () => editUserModalOverlay.classList.remove('visible'));
    }
    if(cancelEditModalBtn) {
        cancelEditModalBtn.addEventListener('click', () => editUserModalOverlay.classList.remove('visible'));
    }

    if(editRoleSelect) {
        editRoleSelect.addEventListener('change', () => {
            const is_admin = editRoleSelect.value === 'admin';
            const accessContainer = document.getElementById('edit-access-groups');
            const accessCheckboxes = document.querySelectorAll('#edit-access-groups input[type="checkbox"]');
            
            accessContainer.classList.toggle('is-admin-locked', is_admin);

            accessCheckboxes.forEach(checkbox => {
                checkbox.disabled = is_admin;
                if (is_admin) checkbox.checked = true;
            });
        });
    }

})();