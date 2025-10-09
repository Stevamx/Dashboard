// static/js/configuracoes.js
document.addEventListener('DOMContentLoaded', () => {
    
    // --- LÓGICA DE NAVEGAÇÃO POR ABAS ---
    function initializeSimpleTabNavigation() {
        const navButtons = document.querySelectorAll('.main-header .nav-button[data-target]');
        const pages = document.querySelectorAll('.container .page');
        navButtons.forEach(button => {
            button.addEventListener('click', () => {
                if (button.classList.contains('active')) return;
                const targetId = button.getAttribute('data-target');
                navButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                pages.forEach(page => page.classList.toggle('active', page.id === targetId));
            });
        });
    }

    // --- LÓGICA DE GERENCIAMENTO DE USUÁRIOS ---
    const accessHierarchy = {
        'Painéis Principais': {
            'dashboard': 'Painel de Análises (Dashboards)',
            'metas': 'Painel de Metas',
            'chat': 'Assistente IA (LUCA)',
            'configuracoes': 'Painel de Configurações (Admin)'
        },
        'Módulos dos Dashboards': {
            'vendas': 'Análise de Vendas',
            'estoque': 'Análise de Estoque'
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
            // --- A CORREÇÃO ESTÁ NA LINHA ABAIXO ---
            // ANTES: groupDiv.appendChild(groupDiv);
            // DEPOIS:
            groupDiv.appendChild(gridDiv);
            container.appendChild(groupDiv);
        }
    }

    const usersTableBody = document.querySelector('#users-table tbody');
    const addUserModalOverlay = document.getElementById('user-modal-overlay');
    const addUserForm = document.getElementById('add-user-form');
    const openAddModalBtn = document.getElementById('add-user-btn');
    const closeAddModalBtn = document.getElementById('close-user-modal-btn');
    const cancelAddModalBtn = document.getElementById('cancel-user-modal-btn');
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
                     hideLoading(); // Adicionado para fechar o loading
                     return;
                }
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
        } catch(e) {
            if (usersTableBody) {
                usersTableBody.innerHTML = `<tr><td colspan="4">Falha ao carregar usuários. ${e.message}</td></tr>`;
            }
        } finally {
            hideLoading();
        }
    }

    function addTableActionListeners() {
        document.querySelectorAll('.action-btn-icon.delete').forEach(button => {
            button.addEventListener('click', (e) => {
                const uid = e.currentTarget.getAttribute('data-uid');
                handleDeleteUser(uid);
            });
        });
        document.querySelectorAll('.action-btn-icon.edit').forEach(button => {
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
                const response = await fazerRequisicaoAutenticada(`/admin/users/${uid}`, { method: 'DELETE' });
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

    function setupModal(modalConfig) {
        const closeFn = () => {
            modalConfig.overlay.classList.remove('visible');
            if(modalConfig.form) modalConfig.form.reset();
        };
        if(modalConfig.openBtn) modalConfig.openBtn.addEventListener('click', () => {
            if(modalConfig.openFn) modalConfig.openFn();
            modalConfig.overlay.classList.add('visible');
        });
        if(modalConfig.closeBtn) modalConfig.closeBtn.addEventListener('click', closeFn);
        if(modalConfig.cancelBtn) modalConfig.cancelBtn.addEventListener('click', closeFn);
        if(modalConfig.overlay) modalConfig.overlay.addEventListener('click', (e) => {
            if (e.target === modalConfig.overlay) closeFn();
        });
    }
    
    // --- INICIALIZAÇÃO GERAL ---
    initializeSimpleTabNavigation();
    loadUsers(); 
    
    setupModal({
        overlay: addUserModalOverlay, openBtn: openAddModalBtn, closeBtn: closeAddModalBtn, cancelBtn: cancelAddModalBtn, form: addUserForm,
        openFn: () => populateAccessCheckboxes('add-access-groups', 'add_acessos', { dashboard: true, vendas: true })
    });
    setupModal({
        overlay: editUserModalOverlay, closeBtn: closeEditModalBtn, cancelBtn: cancelEditModalBtn, form: editUserForm
    });
    
    if (addUserForm) {
        addUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoading();
            const acessos = {};
            document.querySelectorAll('input[name="add_acessos"]:checked').forEach(checkbox => { acessos[checkbox.value] = true; });
            const payload = { 
                username: document.getElementById('username').value, 
                email: document.getElementById('email').value, 
                password: document.getElementById('password').value, 
                papel: document.getElementById('role').value,
                acessos
            };
            try {
                await fazerRequisicaoAutenticada('/admin/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                showNotification('Sucesso!', 'Novo usuário criado com sucesso.', 'success');
                addUserModalOverlay.classList.remove('visible');
                addUserForm.reset();
                await loadUsers();
            } catch(e) {
                showNotification('Erro', e.message, 'error');
            } finally {
                hideLoading();
            }
        });
    }

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
                showNotification('Sucesso!', 'Usuário atualizado com sucesso.', 'success');
                editUserModalOverlay.classList.remove('visible');
                await loadUsers();
            } catch(e) {
                showNotification('Erro', e.message, 'error');
            } finally {
                hideLoading();
            }
        });
    }

    if(editRoleSelect) {
        editRoleSelect.addEventListener('change', () => {
            const is_admin = editRoleSelect.value === 'admin';
            const accessCheckboxes = document.querySelectorAll('#edit-access-groups input[type="checkbox"]');
            accessCheckboxes.forEach(checkbox => {
                checkbox.disabled = is_admin;
                if (is_admin) checkbox.checked = true;
            });
        });
    }
});