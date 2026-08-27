// app.js - 急诊抢救护理记录系统前端逻辑

// 全局变量
let currentUser = null;
let authToken = null;
let currentEditId = null;
let currentDetailId = null;
let allRecords = [];

const API_BASE = ''; // 相对路径，同域部署

// ==================== 工具函数 ====================

// 显示Toast提示
function showToast(message, duration = 2000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, duration);
}

// 格式化日期时间
function formatDateTime(dateStr) {
    if (!dateStr) return '未填写';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
}

// 生成唯一ID
function generateId() {
    return 'rec_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

// API请求封装
async function apiRequest(url, method = 'GET', data = null) {
    const headers = {
        'Content-Type': 'application/json'
    };
    if (authToken) {
        headers['Authorization'] = 'Bearer ' + authToken;
    }

    const options = {
        method,
        headers
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(API_BASE + url, options);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('API请求失败:', error);
        return { success: false, message: '网络请求失败，请检查服务器连接' };
    }
}

// ==================== 登录/注册 ====================

// 切换登录/注册标签
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
    document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('registerForm').style.display = tab === 'register' ? 'block' : 'none';
}

// 登录
async function doLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
        showToast('请输入用户名和密码');
        return;
    }

    const result = await apiRequest('/api/login', 'POST', { username, password });

    if (result.success) {
        authToken = result.token;
        currentUser = result.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showToast('登录成功');
        setTimeout(() => {
            showApp();
            loadRecords();
        }, 500);
    } else {
        showToast(result.message || '登录失败');
    }
}

// 注册
async function doRegister() {
    const username = document.getElementById('regUsername').value.trim();
    const displayName = document.getElementById('regDisplayName').value.trim();
    const password = document.getElementById('regPassword').value;
    const password2 = document.getElementById('regPassword2').value;

    if (!username || !password) {
        showToast('请填写用户名和密码');
        return;
    }

    if (username.length < 3) {
        showToast('用户名至少3个字符');
        return;
    }

    if (password.length < 6) {
        showToast('密码至少6个字符');
        return;
    }

    if (password !== password2) {
        showToast('两次密码输入不一致');
        return;
    }

    const result = await apiRequest('/api/register', 'POST', {
        username,
        password,
        display_name: displayName
    });

    if (result.success) {
        authToken = result.token;
        currentUser = result.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showToast('注册成功');
        setTimeout(() => {
            showApp();
            loadRecords();
        }, 500);
    } else {
        showToast(result.message || '注册失败');
    }
}

// 退出登录
function doLogout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    document.getElementById('appPage').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
    showToast('已退出登录');
}

// 显示主应用
function showApp() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('appPage').style.display = 'block';
    document.getElementById('userInfo').textContent = currentUser.display_name || currentUser.username;
}

// 检查登录状态
async function checkAuth() {
    const token = localStorage.getItem('authToken');
    const userStr = localStorage.getItem('currentUser');

    if (token && userStr) {
        authToken = token;
        currentUser = JSON.parse(userStr);

        // 验证token
        const result = await apiRequest('/api/verify');
        if (result.success) {
            currentUser = result.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            showApp();
            loadRecords();
            return;
        }
    }

    // 未登录，显示登录页
    document.getElementById('loginPage').style.display = 'flex';
}

// ==================== 记录管理 ====================

// 加载记录列表
async function loadRecords(keyword = '') {
    showListView();
    const url = keyword ? `/api/records?keyword=${encodeURIComponent(keyword)}` : '/api/records';
    const result = await apiRequest(url);

    if (result.success) {
        allRecords = result.data || [];
        renderRecordList(allRecords);
    } else {
        showToast(result.message || '加载失败');
    }
}

// 搜索记录
function searchRecords() {
    const keyword = document.getElementById('searchInput').value.trim();
    loadRecords(keyword);
}

// 渲染记录列表
function renderRecordList(records) {
    const listEl = document.getElementById('recordList');
    const emptyEl = document.getElementById('emptyState');

    if (records.length === 0) {
        listEl.innerHTML = '';
        emptyEl.style.display = 'block';
        return;
    }

    emptyEl.style.display = 'none';

    listEl.innerHTML = records.map(record => {
        const outcomeTag = record.outcome_method ? `<span class="record-tag">${record.outcome_method}</span>` : '';
        return `
            <div class="record-card" onclick="showDetail('${record.id}')">
                <div class="record-card-header">
                    <span class="record-patient-name">${record.patient_name || '未填写姓名'}</span>
                    ${outcomeTag}
                </div>
                <div class="record-info">性别：${record.gender || '未填写'} | 年龄：${record.age || '未填写'}岁</div>
                <div class="record-info">入院时间：${formatDateTime(record.admission_time)}</div>
                <div class="record-diagnosis">诊断：${record.diagnosis || '未填写'}</div>
                <div class="record-time">创建时间：${formatDateTime(record.created_at)}</div>
            </div>
        `;
    }).join('');
}

// 显示列表视图
function showListView() {
    document.getElementById('listView').style.display = 'block';
    document.getElementById('editView').style.display = 'none';
    document.getElementById('detailView').style.display = 'none';
}

// 显示新增视图
function showAddView() {
    currentEditId = null;
    document.getElementById('editTitle').textContent = '新增抢救记录';
    clearEditForm();
    document.getElementById('listView').style.display = 'none';
    document.getElementById('editView').style.display = 'block';
    document.getElementById('detailView').style.display = 'none';
    addRecordRow();
}

// 显示编辑视图
function showEditView(id) {
    currentEditId = id;
    document.getElementById('editTitle').textContent = '编辑抢救记录';
    clearEditForm();

    const record = allRecords.find(r => r.id === id);
    if (record) {
        fillEditForm(record);
    }

    document.getElementById('listView').style.display = 'none';
    document.getElementById('editView').style.display = 'block';
    document.getElementById('detailView').style.display = 'none';
}

// 清空编辑表单
function clearEditForm() {
    document.getElementById('patientName').value = '';
    document.getElementById('gender').value = '';
    document.getElementById('age').value = '';
    document.getElementById('admissionTime').value = '';
    document.getElementById('address').value = '';
    document.getElementById('firstDoctor').value = '';
    document.getElementById('diagnosis').value = '';
    document.getElementById('rescueStartTime').value = '';
    document.getElementById('outcomeTime').value = '';
    document.getElementById('arrivalOther').value = '';
    document.getElementById('outcomeOther').value = '';
    document.getElementById('arrivalOther').style.display = 'none';
    document.getElementById('outcomeOther').style.display = 'none';

    document.querySelectorAll('input[name="arrival"]').forEach(r => r.checked = false);
    document.querySelectorAll('input[name="outcome"]').forEach(r => r.checked = false);

    document.getElementById('recordTableBody').innerHTML = '';
}

// 填充编辑表单
function fillEditForm(record) {
    document.getElementById('patientName').value = record.patient_name || '';
    document.getElementById('gender').value = record.gender || '';
    document.getElementById('age').value = record.age || '';
    document.getElementById('admissionTime').value = record.admission_time ? record.admission_time.slice(0, 16) : '';
    document.getElementById('address').value = record.address || '';
    document.getElementById('firstDoctor').value = record.first_doctor || '';
    document.getElementById('diagnosis').value = record.diagnosis || '';
    document.getElementById('rescueStartTime').value = record.rescue_start_time ? record.rescue_start_time.slice(0, 16) : '';
    document.getElementById('outcomeTime').value = record.outcome_time ? record.outcome_time.slice(0, 16) : '';
    document.getElementById('arrivalOther').value = record.arrival_other || '';
    document.getElementById('outcomeOther').value = record.outcome_other || '';

    if (record.arrival_method) {
        const radio = document.querySelector(`input[name="arrival"][value="${record.arrival_method}"]`);
        if (radio) radio.checked = true;
        if (record.arrival_method === '其他') {
            document.getElementById('arrivalOther').style.display = 'block';
        }
    }

    if (record.outcome_method) {
        const radio = document.querySelector(`input[name="outcome"][value="${record.outcome_method}"]`);
        if (radio) radio.checked = true;
        if (record.outcome_method === '其他') {
            document.getElementById('outcomeOther').style.display = 'block';
        }
    }

    // 填充抢救记录表格
    const records = record.records ? JSON.parse(record.records) : [];
    if (records.length > 0) {
        records.forEach(r => addRecordRow(r));
    } else {
        addRecordRow();
    }
}

// 获取表单数据
function getFormData() {
    const arrivalMethod = document.querySelector('input[name="arrival"]:checked');
    const outcomeMethod = document.querySelector('input[name="outcome"]:checked');

    const rows = document.querySelectorAll('#recordTableBody tr');
    const records = Array.from(rows).map(row => ({
        time: row.querySelector('.row-time').value,
        consciousness: row.querySelector('.row-consciousness').value,
        heartRate: row.querySelector('.row-heartRate').value,
        breathing: row.querySelector('.row-breathing').value,
        bloodPressure: row.querySelector('.row-bloodPressure').value,
        spo2: row.querySelector('.row-spo2').value,
        observation: row.querySelector('.row-observation').value,
        signature: row.querySelector('.row-signature').value
    }));

    return {
        patient_name: document.getElementById('patientName').value.trim(),
        gender: document.getElementById('gender').value,
        age: document.getElementById('age').value,
        admission_time: document.getElementById('admissionTime').value,
        address: document.getElementById('address').value.trim(),
        arrival_method: arrivalMethod ? arrivalMethod.value : '',
        arrival_other: document.getElementById('arrivalOther').value.trim(),
        first_doctor: document.getElementById('firstDoctor').value.trim(),
        diagnosis: document.getElementById('diagnosis').value.trim(),
        rescue_start_time: document.getElementById('rescueStartTime').value,
        records: records,
        outcome_time: document.getElementById('outcomeTime').value,
        outcome_method: outcomeMethod ? outcomeMethod.value : '',
        outcome_other: document.getElementById('outcomeOther').value.trim()
    };
}

// 保存记录
async function saveRecord() {
    const data = getFormData();

    if (!data.patient_name) {
        showToast('请填写患者姓名');
        return;
    }

    if (!data.admission_time) {
        showToast('请选择入院时间');
        return;
    }

    let result;
    if (currentEditId) {
        result = await apiRequest(`/api/records/${currentEditId}`, 'PUT', data);
    } else {
        data.id = generateId();
        result = await apiRequest('/api/records', 'POST', data);
    }

    if (result.success) {
        showToast('保存成功');
        setTimeout(() => {
            loadRecords();
        }, 500);
    } else {
        showToast(result.message || '保存失败');
    }
}

// 添加抢救记录行
function addRecordRow(data = {}) {
    const tbody = document.getElementById('recordTableBody');
    const row = document.createElement('tr');

    const consciousnessOptions = [
        { value: '', label: '选择' },
        { value: '1', label: '清醒' },
        { value: '2', label: '嗜睡' },
        { value: '3', label: '朦胧' },
        { value: '4', label: '浅昏迷' },
        { value: '5', label: '深昏迷' }
    ];

    row.innerHTML = `
        <td><input type="time" class="row-time" value="${data.time || ''}"></td>
        <td>
            <select class="row-consciousness">
                ${consciousnessOptions.map(opt => `<option value="${opt.value}" ${data.consciousness === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
            </select>
        </td>
        <td><input type="number" class="row-heartRate" placeholder="--" value="${data.heartRate || ''}"></td>
        <td><input type="number" class="row-breathing" placeholder="--" value="${data.breathing || ''}"></td>
        <td><input type="text" class="row-bloodPressure" placeholder="--" value="${data.bloodPressure || ''}"></td>
        <td><input type="number" class="row-spo2" placeholder="--" value="${data.spo2 || ''}"></td>
        <td><textarea class="row-observation" placeholder="病情观察及治疗">${data.observation || ''}</textarea></td>
        <td><input type="text" class="row-signature" placeholder="签名" value="${data.signature || ''}"></td>
        <td><button class="delete-btn" onclick="deleteRecordRow(this)">删除</button></td>
    `;

    tbody.appendChild(row);
}

// 删除抢救记录行
function deleteRecordRow(btn) {
    const tbody = document.getElementById('recordTableBody');
    if (tbody.children.length <= 1) {
        showToast('至少保留一行记录');
        return;
    }
    btn.closest('tr').remove();
}

// 来院方式其他显示
document.addEventListener('change', function(e) {
    if (e.target.name === 'arrival') {
        document.getElementById('arrivalOther').style.display = e.target.value === '其他' ? 'block' : 'none';
    }
    if (e.target.name === 'outcome') {
        document.getElementById('outcomeOther').style.display = e.target.value === '其他' ? 'block' : 'none';
    }
});

// ==================== 详情页 ====================

// 显示详情
async function showDetail(id) {
    currentDetailId = id;
    const result = await apiRequest(`/api/records/${id}`);

    if (!result.success) {
        showToast('加载详情失败');
        return;
    }

    const record = result.data;
    const records = record.records ? JSON.parse(record.records) : [];

    const consciousnessLabels = { '1': '清醒', '2': '嗜睡', '3': '朦胧', '4': '浅昏迷', '5': '深昏迷' };

    let recordsHtml = '';
    if (records.length > 0) {
        recordsHtml = `
            <div class="table-wrapper">
                <table class="record-table">
                    <thead>
                        <tr>
                            <th>时间</th>
                            <th>意识</th>
                            <th>心率</th>
                            <th>呼吸</th>
                            <th>血压</th>
                            <th>SpO₂</th>
                            <th>病情观察及治疗</th>
                            <th>签名</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${records.map(r => `
                            <tr>
                                <td>${r.time || '-'}</td>
                                <td>${consciousnessLabels[r.consciousness] || '-'}</td>
                                <td>${r.heartRate || '-'}</td>
                                <td>${r.breathing || '-'}</td>
                                <td>${r.bloodPressure || '-'}</td>
                                <td>${r.spo2 || '-'}</td>
                                <td style="text-align: left;">${r.observation || '-'}</td>
                                <td>${r.signature || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } else {
        recordsHtml = '<p style="text-align: center; color: #999; padding: 20px;">暂无抢救记录</p>';
    }

    document.getElementById('detailContent').innerHTML = `
        <div class="detail-section">
            <h3 class="card-title">基本信息</h3>
            <div class="detail-row"><div class="detail-label">患者姓名</div><div class="detail-value">${record.patient_name || '未填写'}</div></div>
            <div class="detail-row"><div class="detail-label">性别</div><div class="detail-value">${record.gender || '未填写'}</div></div>
            <div class="detail-row"><div class="detail-label">年龄</div><div class="detail-value">${record.age || '未填写'}岁</div></div>
            <div class="detail-row"><div class="detail-label">入院时间</div><div class="detail-value">${formatDateTime(record.admission_time)}</div></div>
            <div class="detail-row"><div class="detail-label">工作单位/住址</div><div class="detail-value">${record.address || '未填写'}</div></div>
            <div class="detail-row"><div class="detail-label">来院方式</div><div class="detail-value">${record.arrival_method || '未填写'}${record.arrival_other ? '（' + record.arrival_other + '）' : ''}</div></div>
            <div class="detail-row"><div class="detail-label">首诊医生</div><div class="detail-value">${record.first_doctor || '未填写'}</div></div>
            <div class="detail-row"><div class="detail-label">诊断</div><div class="detail-value">${record.diagnosis || '未填写'}</div></div>
            <div class="detail-row"><div class="detail-label">开始抢救时间</div><div class="detail-value">${formatDateTime(record.rescue_start_time)}</div></div>
        </div>

        <div class="detail-section">
            <h3 class="card-title">抢救护理记录</h3>
            ${recordsHtml}
        </div>

        <div class="detail-section">
            <h3 class="card-title">转归</h3>
            <div class="detail-row"><div class="detail-label">转归时间</div><div class="detail-value">${formatDateTime(record.outcome_time)}</div></div>
            <div class="detail-row"><div class="detail-label">转归方式</div><div class="detail-value">${record.outcome_method || '未填写'}${record.outcome_other ? '（' + record.outcome_other + '）' : ''}</div></div>
        </div>

        <div class="detail-section">
            <h3 class="card-title">记录信息</h3>
            <div class="detail-row"><div class="detail-label">创建时间</div><div class="detail-value">${formatDateTime(record.created_at)}</div></div>
            <div class="detail-row"><div class="detail-label">最后更新</div><div class="detail-value">${formatDateTime(record.updated_at)}</div></div>
        </div>
    `;

    document.getElementById('listView').style.display = 'none';
    document.getElementById('editView').style.display = 'none';
    document.getElementById('detailView').style.display = 'block';
}

// 编辑当前记录
function editCurrentRecord() {
    if (currentDetailId) {
        showEditView(currentDetailId);
    }
}

// 删除当前记录
async function deleteCurrentRecord() {
    if (!currentDetailId) return;

    if (!confirm('确定要删除这条记录吗？删除后不可恢复。')) {
        return;
    }

    const result = await apiRequest(`/api/records/${currentDetailId}`, 'DELETE');

    if (result.success) {
        showToast('删除成功');
        setTimeout(() => {
            loadRecords();
        }, 500);
    } else {
        showToast(result.message || '删除失败');
    }
}

// ==================== 打印功能 ====================

// 打印单条记录
function printCurrentRecord() {
    const record = allRecords.find(r => r.id === currentDetailId);
    if (!record) {
        showToast('记录不存在');
        return;
    }
    printRecords([record], '急诊抢救护理记录单');
}

// 打印全部记录报表
function printAllRecords() {
    if (allRecords.length === 0) {
        showToast('暂无记录可打印');
        return;
    }
    printRecords(allRecords, '急诊抢救护理记录汇总报表');
}

// 打印记录
function printRecords(records, title) {
    const consciousnessLabels = { '1': '清醒', '2': '嗜睡', '3': '朦胧', '4': '浅昏迷', '5': '深昏迷' };

    let html = `<div class="print-report">
        <h1>${title}</h1>
        <p style="text-align: right; margin-bottom: 20px;">打印时间：${formatDateTime(new Date().toISOString())}</p>
    `;

    records.forEach((record, index) => {
        const recs = record.records ? JSON.parse(record.records) : [];

        html += `
            <div style="margin-bottom: 30px; page-break-inside: avoid;">
                <h2>记录 ${index + 1}：${record.patient_name || '未填写姓名'}</h2>
                <div class="print-info">
                    <div class="print-info-item"><span>性别：</span>${record.gender || '未填写'}</div>
                    <div class="print-info-item"><span>年龄：</span>${record.age || '未填写'}岁</div>
                    <div class="print-info-item"><span>入院时间：</span>${formatDateTime(record.admission_time)}</div>
                    <div class="print-info-item"><span>来院方式：</span>${record.arrival_method || '未填写'}${record.arrival_other ? '（' + record.arrival_other + '）' : ''}</div>
                    <div class="print-info-item"><span>首诊医生：</span>${record.first_doctor || '未填写'}</div>
                    <div class="print-info-item"><span>开始抢救时间：</span>${formatDateTime(record.rescue_start_time)}</div>
                    <div class="print-info-item" style="grid-column: 1 / -1;"><span>工作单位/住址：</span>${record.address || '未填写'}</div>
                    <div class="print-info-item" style="grid-column: 1 / -1;"><span>诊断：</span>${record.diagnosis || '未填写'}</div>
                </div>
        `;

        if (recs.length > 0) {
            html += `
                <table>
                    <thead>
                        <tr>
                            <th>时间</th>
                            <th>意识</th>
                            <th>心率</th>
                            <th>呼吸</th>
                            <th>血压</th>
                            <th>SpO₂</th>
                            <th>病情观察及治疗</th>
                            <th>签名</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recs.map(r => `
                            <tr>
                                <td>${r.time || '-'}</td>
                                <td>${consciousnessLabels[r.consciousness] || '-'}</td>
                                <td>${r.heartRate || '-'}</td>
                                <td>${r.breathing || '-'}</td>
                                <td>${r.bloodPressure || '-'}</td>
                                <td>${r.spo2 || '-'}</td>
                                <td style="text-align: left;">${r.observation || '-'}</td>
                                <td>${r.signature || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }

        html += `
                <div class="print-info" style="margin-top: 10px;">
                    <div class="print-info-item"><span>转归时间：</span>${formatDateTime(record.outcome_time)}</div>
                    <div class="print-info-item"><span>转归方式：</span>${record.outcome_method || '未填写'}${record.outcome_other ? '（' + record.outcome_other + '）' : ''}</div>
                </div>
                <div class="print-footer">
                    <span>记录人：____________</span>
                    <span>核对人：____________</span>
                    <span>日期：${formatDateTime(record.created_at).split(' ')[0]}</span>
                </div>
            </div>
        `;
    });

    html += '</div>';

    const printArea = document.getElementById('printArea');
    printArea.innerHTML = html;
    printArea.style.display = 'block';

    setTimeout(() => {
        window.print();
        printArea.style.display = 'none';
    }, 100);
}

// 导出Excel
async function exportExcel() {
    if (!currentDetailId) {
        showToast('请先选择一条记录');
        return;
    }
    try {
        showToast('正在生成Excel...');
        const token = localStorage.getItem('authToken');
        const response = await fetch(apiBaseUrl + `/api/records/${currentDetailId}/export`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!response.ok) {
            throw new Error('导出失败');
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const contentDisposition = response.headers.get('Content-Disposition');
        let fileName = '急诊抢救护理记录.xlsx';
        if (contentDisposition) {
            const match = contentDisposition.match(/filename\*=UTF-8''(.+)/);
            if (match) fileName = decodeURIComponent(match[1]);
        }
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showToast('Excel导出成功！');
    } catch (error) {
        showToast('导出失败：' + error.message);
    }
}

// ==================== 初始化 ====================

// 页面加载时检查登录状态
window.onload = function() {
    checkAuth();

    // 回车登录
    document.getElementById('loginPassword').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') doLogin();
    });
};
